'use strict';
// ═══════════════════════════════════════════════════════════════════
// VAULT FILE WATCHER — external change detection + reload
//
// The watcher (main.js, fs.watch on the vault's directory) already
// correctly detected file removal and went read-only. For a file
// CHANGE — written by something else: a sync client, a second
// instance, a manual restore — it only logged a warning and emitted an
// event nothing listened to. The in-memory copy and the real file
// could silently diverge for the rest of the session, with the next
// save overwriting whatever the other writer left.
//
// This is the actual "the cache updates when the real vault updates"
// fix: a genuine external change (not an echo of our own save) is
// detected by saveCount comparison and offered as a reload, using the
// same AUTH.key already in memory and the same vaultLoad() that
// already does full restoration correctly.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VaultEnvelope = require(path.join(ROOT, 'foundation', 'vault', 'vault-envelope.js'));

const results = [];
const pending = [];
function t(name, fn) { pending.push({ name, fn }); }

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, startMarker + ' not found');
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, endMarker + ' not found after start');
  return src.slice(start, end);
}

const vaultSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');
const watcherSrc = extractBetween(vaultSrc, 'async function vaultArmFileWatcher() {', '\nasync function vaultLoad() {') + '\nthis.vaultArmFileWatcher = vaultArmFileWatcher;\n';

function fakeEnvelopeRaw(saveCount) {
  // A real, parseable envelope with a specific saveCount — enough for
  // VaultEnvelope.parse() to read the header without needing a real key.
  const header = VaultEnvelope.buildHeader({
    vaultId: 'test-vault', kdf: { salt: 'c2FsdA==', iterations: 600000 },
    iv: 'aXY=', saveCount,
  });
  const envelope = VaultEnvelope.assemble(header, 'ZmFrZQ==', 'a'.repeat(64));
  return VaultEnvelope.serialize(envelope);
}

function makeSandbox(opts) {
  const o = opts || {};
  const toasts = [];
  const confirms = [];
  const ledgerCalls = [];
  const busEvents = [];
  const VAULT = { saveCount: o.memorySaveCount ?? 5, _lastOwnWriteAt: o.lastOwnWriteAt ?? 0, readOnly: false };
  let watcherCallback = null;

  const sandbox = {
    console,
    VAULT,
    VaultEnvelope,
    MMLog: { info() {}, warn() {}, error() {} },
    mm_toast: (msg, kind, opts2) => toasts.push({ msg, kind, opts: opts2 }),
    mmConfirm: async (msg) => { confirms.push(msg); return o.confirmReturns ?? false; },
    _ledgerAppend: async (type, data) => { ledgerCalls.push({ type, data }); return { seq: 1, head: 'x'.repeat(64) }; },
    vaultLoad: o.vaultLoad || (async () => true),
    Date,
    window: {
      NXAPI: {
        onVaultFileEvent: (cb) => { watcherCallback = cb; },
        vaultRead: o.vaultRead || (async () => fakeEnvelopeRaw(o.fileSaveCount ?? 10)),
      },
    },
  };
  sandbox.MM_BUS = { emit: (name, data) => busEvents.push({ name, data }) };
  vm.createContext(sandbox);
  vm.runInContext(watcherSrc, sandbox);
  return { sandbox, VAULT, toasts, confirms, ledgerCalls, busEvents, fire: async (evt) => { await watcherCallback(evt); } };
}

async function run() {
  console.log('\nVAULT FILE WATCHER — external change detection\n');
  for (const { name, fn } of pending) {
    try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
    catch (e) {
      results.push({ name, ok: false });
      console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
    }
  }
  const fails = results.filter(r => !r.ok);
  console.log('\nvault-file-watcher: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
}

// ── File removed — unchanged behavior, still correct ─────────────────

t('a removed file goes read-only immediately and logs a ledger entry', async () => {
  const { sandbox, VAULT, toasts, ledgerCalls, fire } = makeSandbox();
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'removed', path: '/data/mastermind.vault' });
  assert.strictEqual(VAULT.readOnly, true);
  assert.ok(toasts.some(t => /deleted/i.test(t.msg)));
  assert.ok(ledgerCalls.some(l => l.type === 'vault.anchor.mismatch'));
});

// ── The actual fix: self-write echo suppression ──────────────────────

t('a change within the grace window of our own write is ignored — no prompt, no reload', async () => {
  const vaultReadCalls = { count: 0 };
  const { sandbox, confirms, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 200, // 200ms ago — well inside the grace window
    vaultRead: async () => { vaultReadCalls.count++; return fakeEnvelopeRaw(99); },
  });
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'changed', path: '/data/mastermind.vault' });
  assert.strictEqual(confirms.length, 0, 'must not even ask — this is recognized as our own save landing');
  assert.strictEqual(vaultReadCalls.count, 0, 'should not need to re-read the file to know this is an echo');
});

t('a change well outside the grace window with a LOWER or EQUAL saveCount is a stale/duplicate event — ignored', async () => {
  const { sandbox, confirms, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 10000, // 10s ago — outside the grace window
    memorySaveCount: 12,
    fileSaveCount: 12, // same count — this IS our own write, just a late-arriving duplicate fs event
  });
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'changed', path: '/data/mastermind.vault' });
  assert.strictEqual(confirms.length, 0);
});

t('a genuinely newer file (higher saveCount, outside the grace window) prompts to reload', async () => {
  const { sandbox, confirms, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 10000,
    memorySaveCount: 5,
    fileSaveCount: 8, // someone/something else saved 3 times since our last known state
  });
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'changed', path: '/data/mastermind.vault' });
  assert.strictEqual(confirms.length, 1);
  assert.ok(/save #8/.test(confirms[0]));
  assert.ok(/#5/.test(confirms[0]));
});

t('accepting the reload calls vaultLoad() and clears externalUpdateAvailable', async () => {
  let vaultLoadCalled = false;
  const { sandbox, VAULT, toasts, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 10000,
    memorySaveCount: 5, fileSaveCount: 8,
    confirmReturns: true,
    vaultLoad: async () => { vaultLoadCalled = true; return true; },
  });
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'changed', path: '/data/mastermind.vault' });
  assert.strictEqual(vaultLoadCalled, true);
  assert.strictEqual(VAULT.externalUpdateAvailable, false);
  assert.ok(toasts.some(t => /reloaded/i.test(t.msg)));
});

t('declining the reload leaves the in-memory copy untouched and warns it will overwrite on next save', async () => {
  let vaultLoadCalled = false;
  const { sandbox, toasts, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 10000,
    memorySaveCount: 5, fileSaveCount: 8,
    confirmReturns: false,
    vaultLoad: async () => { vaultLoadCalled = true; return true; },
  });
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'changed', path: '/data/mastermind.vault' });
  assert.strictEqual(vaultLoadCalled, false);
  assert.ok(toasts.some(t => /overwrite/i.test(t.msg)));
});

t('a reload that fails reports the failure and does not clear externalUpdateAvailable', async () => {
  const { sandbox, VAULT, toasts, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 10000,
    memorySaveCount: 5, fileSaveCount: 8,
    confirmReturns: true,
    vaultLoad: async () => false,
  });
  await sandbox.vaultArmFileWatcher();
  await fire({ event: 'changed', path: '/data/mastermind.vault' });
  assert.strictEqual(VAULT.externalUpdateAvailable, true, 'a failed reload must not claim to have caught up');
  assert.ok(toasts.some(t => /reload failed/i.test(t.msg)));
});

t('an unreadable file header (corrupt or mid-write) does not crash — falls through to surfacing the change', async () => {
  const { sandbox, confirms, fire } = makeSandbox({
    lastOwnWriteAt: Date.now() - 10000,
    memorySaveCount: 5,
    vaultRead: async () => { throw new Error('EBUSY: file locked'); },
  });
  await sandbox.vaultArmFileWatcher();
  await assert.doesNotReject(fire({ event: 'changed', path: '/data/mastermind.vault' }));
  // Can't compare saveCounts without a readable header, so this must be
  // treated as "possibly genuine" rather than silently swallowed.
  assert.strictEqual(confirms.length, 1);
});

run();
