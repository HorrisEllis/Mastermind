'use strict';
// ═══════════════════════════════════════════════════════════════════
// SAVE-REFUSED DIAGNOSTICS — "why was a save attempted before login"
//
// A real error log showed "Save refused: no encryption key in this
// session" twice, five seconds apart, while the app sat on the Vault
// Missing screen — before any login, before AUTH.key existed. The
// refusal itself is correct and not a data-loss risk (nothing had ever
// been decrypted, so nothing was lost). But by the time vaultSave()
// logs that refusal, it's running inside a debounced setTimeout
// callback — the actual caller that scheduled the doomed save is long
// gone from the stack, and 28 call sites across the app call
// vaultDirtySave().
//
// This is not a guess at which of those 28 call sites was responsible
// — a definitive answer needs a live repro this environment can't
// produce. What this tests is the diagnostic that makes the next
// occurrence traceable: vaultDirtySave() now captures the caller's own
// stack at the moment it schedules a save it can already tell is
// doomed (no key, but encryption is on), and vaultSave()'s refusal
// message includes it.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}
function run() {
  const fails = results.filter(r => !r.ok).length;
  console.log('\nsave-refused-diagnostics: ' + (results.length - fails) + '/' + results.length + ' passed');
  process.exitCode = fails ? 1 : 0;
}

const vaultSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');

function extractFn(src, name) {
  let marker = 'function ' + name + '(';
  let start = src.indexOf('\n' + marker);
  if (start === -1) { marker = 'async function ' + name + '('; start = src.indexOf('\n' + marker); }
  assert.ok(start > -1, name + ' not found');
  const bodyStart = src.indexOf('{', start);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

function makeSandbox(opts) {
  const o = opts || {};
  const VAULT = { dirty: false, saveQueue: null, firstDirtyAt: null, _lastDirtySaveCallerPreAuth: null };
  const AUTH = { key: o.key ?? null, encrypted: o.encrypted ?? true };
  const OPTS = { autosave: true, autosave_max_wait: 10, autosave_interval: 30 };
  const sandbox = {
    console,
    VAULT, AUTH, OPTS,
    MMLog: { info() {}, warn() {}, error() {} },
    mm_toast: () => {},
    _vaultShowUnsaved: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    Date, Error,
  };
  vm.createContext(sandbox);
  const dirtySrc = extractFn(vaultSrc, 'vaultDirtySave');
  vm.runInContext(dirtySrc + '\nthis.vaultDirtySave = vaultDirtySave;', sandbox);
  return { sandbox, VAULT, AUTH };
}

t('calling vaultDirtySave() with no AUTH.key captures a stack trace naming vaultDirtySave itself', () => {
  const { sandbox, VAULT } = makeSandbox({ key: null, encrypted: true });
  vm.runInContext('vaultDirtySave(5000)', sandbox);
  assert.ok(VAULT._lastDirtySaveCallerPreAuth, 'a stack trace must be captured when scheduling a save that is already known to be doomed');
  assert.ok(/vaultDirtySave/.test(VAULT._lastDirtySaveCallerPreAuth));
});

t('calling vaultDirtySave() WITH a real key does not bother capturing a stack — the save is not doomed', () => {
  const { sandbox, VAULT } = makeSandbox({ key: 'a-real-derived-key', encrypted: true });
  vm.runInContext('vaultDirtySave(5000)', sandbox);
  assert.strictEqual(VAULT._lastDirtySaveCallerPreAuth, null, 'no need to capture anything when the eventual save can actually succeed');
});

t('an unencrypted vault (AUTH.encrypted false) never counts as "doomed" even with no key — that path does not need one', () => {
  const { sandbox, VAULT } = makeSandbox({ key: null, encrypted: false });
  vm.runInContext('vaultDirtySave(5000)', sandbox);
  assert.strictEqual(VAULT._lastDirtySaveCallerPreAuth, null);
});

t('vaultSave() includes the captured caller stack in its refusal message, when one was captured', () => {
  // The refusal logic lives in _vaultSaveOnce() — vaultSave() itself is
  // a single-flight wrapper around it (see mastermind-vault.js's own
  // comment on why: exactly one save in flight per process).
  const vaultSaveOnceSrc = extractFn(vaultSrc, '_vaultSaveOnce');
  const VAULT = { dirty: true, saveQueue: null, _lastDirtySaveCallerPreAuth: 'Error: vaultDirtySave() called before AUTH.key exists\n    at bodySave (nexus-engine.js:5941:3)' };
  const AUTH = { key: null, encrypted: true, pinOnly: false };
  const NX_CONFIG = { vaultPath: '/data/mastermind.vault' };
  const logCalls = [];
  const sandbox = {
    console, VAULT, AUTH, NX_CONFIG,
    MMLog: { info() {}, warn() {}, error: (tag, msg) => logCalls.push(msg) },
    mm_toast: () => {},
    window: { NXAPI: {} },
    localStorage: { getItem: () => null },
    _isPinReadOnly: () => false,
    vaultSerialize: () => ({}),
    JSON,
    Date,
  };
  vm.createContext(sandbox);
  vm.runInContext(vaultSaveOnceSrc + '\nthis._vaultSaveOnce = _vaultSaveOnce;', sandbox);
  vm.runInContext('_vaultSaveOnce(false)', sandbox);
  assert.ok(logCalls.some(m => /Save refused/.test(m) && /bodySave/.test(m)),
    'the refusal log must include the captured caller, naming the real culprit instead of just the generic message');
});

run();
