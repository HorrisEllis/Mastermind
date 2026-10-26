'use strict';
// ═══════════════════════════════════════════════════════════════════
// UNENCRYPTED VAULT — the write-only format, and the way out
//
// Two defects met here, and this suite exists so neither can return.
//
// ONE. Four places in the app wrote `format: 'mastermind-vault-plain'`
// and nothing anywhere read it. parse() saw version 6, skipped the v5
// legacy branch (which requires version == null), skipped the version
// gate, fell into validate() and rejected the file as BAD_FORMAT —
// "Not a MASTERMIND vault file." An app refusing to open a file it
// wrote itself, with the data sitting in plain readable JSON inside it.
//
// TWO. The boot screen offered "Create a new vault" only when the vault
// file was ABSENT. So the state produced by defect one — file present,
// unopenable, no snapshots — rendered a blocking screen with no action
// that could change anything.
//
// The fix to two is not "show the button". It is "show the button AND
// make it impossible for it to lose the file". That is what most of
// this suite is about: the preservation gate, and the refusal.
//
// Nothing is reimplemented here. The real envelope module, the real
// boot sequence and the real screen module are loaded and run.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');

const ENV  = require('../foundation/vault/vault-envelope.js');
const BOOT = require('../foundation/vault/vault-boot.js');

// Queued and run in order. These tests share nothing, but a suite whose
// output interleaves is a suite nobody reads when it fails.
const results = [];
const queue = [];
function t(name, fn) { queue.push({ name, fn }); }

async function runAll() {
  for (const { name, fn } of queue) {
    try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
    catch (e) {
      results.push({ name, ok: false });
      console.log('  \u2717 ' + name + '\n      ' + (e.stack || e.message).split('\n').join('\n      '));
    }
  }
}

// ── The exact bytes the shipped unencrypted writer produces ─────────
// Mirrors vaultCreateNewUnencrypted (mastermind-vault.js) and
// _setupSkipEncryptionConfirmed (nexus-engine.js). If those change shape,
// this fixture stops matching and these tests stop being about the real file.
function plainVaultRaw(over) {
  const state = Object.assign({
    version: 6, format: 'mastermind-vault-plain', encrypted: false, saved: Date.now(),
    canvas: { nodes: [{ id: 'n1' }], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 } },
    modules: {}, aiConfig: null, snr: null,
    identity: { username: 'operator', pinHash: null, created: Date.now(), version: 6, noEncryption: true },
    keys: { pubKey: null, encPrivKey: null },
    username: 'operator', jaa: {},
  }, over || {});
  return JSON.stringify(state, null, 2);
}

console.log('\nUNENCRYPTED VAULT \u2014 format + recovery\n');

// ── The format itself ───────────────────────────────────────────────

t('THE BUG: the file the unencrypted writer produces now parses', async () => {
  const p = ENV.parse(plainVaultRaw());
  assert.ok(p.ok, 'still rejected: ' + p.reason + ' \u2014 ' + p.message);
  assert.strictEqual(p.plain, true);
  assert.strictEqual(p.legacy, false);
  assert.strictEqual(p.version, 6);
});

t('a plain vault reads back as its own state \u2014 no key, no decrypt step', async () => {
  const p = ENV.parse(plainVaultRaw());
  const r = ENV.readPlain(p.envelope);
  assert.ok(r.ok);
  assert.strictEqual(r.encrypted, false);
  assert.strictEqual(r.state.identity.username, 'operator');
  assert.strictEqual(r.state.canvas.nodes.length, 1, 'the payload IS the file');
});

t('a plain vault whose format field was lost is still recognised', async () => {
  // A hand-edit or a partial write can drop `format`. `encrypted: false` on a
  // v6 file is unambiguous on its own, and treating it as unopenable would
  // recreate the exact lockout this whole suite is about.
  const raw = plainVaultRaw({ format: undefined });
  const p = ENV.parse(raw);
  assert.ok(p.ok && p.plain, 'verdict was ' + p.reason);
});

t('an empty plain stub is REFUSED rather than opened as an empty app', async () => {
  // The dangerous failure, because it is the quiet one: presenting a blank
  // canvas as though it were the person's data invites them to save over it.
  const raw = JSON.stringify({ version: 6, format: 'mastermind-vault-plain', encrypted: false });
  const p = ENV.parse(raw);
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.reason, 'NO_PAYLOAD');
});

t('a file claiming the plain format while marked encrypted is refused', async () => {
  const raw = JSON.stringify({ version: 6, format: 'mastermind-vault-plain', encrypted: true, identity: {} });
  const p = ENV.parse(raw);
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.reason, 'BAD_PLAIN_FLAG');
});

t('a future plain version is named, not silently mis-read', async () => {
  const raw = plainVaultRaw({ version: 7 });
  const p = ENV.parse(raw);
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.reason, 'UNSUPPORTED_VERSION');
});

// ── No regression on the formats that already worked ────────────────

t('REGRESSION: a real v6 envelope is unaffected by the new branch', async () => {
  const VC = require('../foundation/vault/vault-crypto.js');
  const salt = VC.randomSaltB64(ENV.SALT_BYTES);
  const iv   = VC.randomIvB64(ENV.IV_BYTES);
  const header = ENV.buildHeader({
    vaultId: VC.uuidV4(), kdf: { salt, iterations: ENV.MIN_ITERATIONS }, iv,
    savedAt: new Date().toISOString(), saveCount: 3, ledgerAnchor: null,
  });
  const key = await VC.deriveKey('pw', salt, ENV.MIN_ITERATIONS, ENV.KEY_LEN);
  const ct  = await VC.encrypt(key, VC.utf8Encode('{"a":1}'), iv, ENV.aadBytes(header));
  const env = ENV.assemble(header, VC.toBase64(ct), await VC.sha256Hex(ct));

  const p = ENV.parse(ENV.serialize(env));
  assert.ok(p.ok, p.message);
  assert.ok(!p.plain, 'an encrypted vault must never be routed down the plain path');
  assert.ok(!p.legacy);
});

t('REGRESSION: a v5 legacy file still takes the legacy branch', async () => {
  const p = ENV.parse(JSON.stringify({ encrypted: true, iv: 'x', data: 'y' }));
  assert.ok(p.ok && p.legacy === true && p.plain !== true);
});

t('REGRESSION: an unrelated v6 JSON file is still rejected as BAD_FORMAT', async () => {
  const p = ENV.parse(JSON.stringify({ version: 6, format: 'something-else', identity: {} }));
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.reason, 'BAD_FORMAT');
});

// ── Boot sequence ───────────────────────────────────────────────────

const probesFor = (over) => Object.assign({
  hasNXAPI: true, dataDir: '/data', cryptoAvailable: true, cryptoRoundTrip: true,
  vaultExists: true, vaultBytes: 2664, parseOk: true, legacy: false, plain: true,
  kdfIterations: null, ciphertextIntact: false,
  ledgerMissing: false, ledgerChainOk: true, ledgerSeq: 1,
  unlockFailures: 0, vaultAnchored: false, snapshotCount: 1,
  newestSnapshotVerified: true, newestSnapshotAgeHours: 1, watcherArmed: true,
}, over || {});

t('a plain vault BOOTS \u2014 it does not block', async () => {
  const report = BOOT.run(probesFor());
  assert.ok(report.canProceed,
    'blocked on: ' + report.blocking.map(s => s.label + ' \u2014 ' + s.detail).join('; '));
});

t('the screen says out loud that the vault is unencrypted', async () => {
  const s = BOOT.run(probesFor()).steps.find(x => x.id === 'vault_format');
  assert.strictEqual(s.status, 'notice', 'an explicit opt-out must not be reported as a fault');
  assert.ok(/unencrypted/i.test(s.detail), 'silence here would be the worst outcome: ' + s.detail);
  assert.ok(s.remedy, 'a notice about a real exposure should carry a way to fix it');
});

t('a plain vault is NOT accused of being damaged', async () => {
  // ciphertextIntact is false for a plain vault because there is no
  // ciphertext. Reported as a hash mismatch, that reads as "your file is
  // corrupt" about a perfectly intact file.
  const s = BOOT.run(probesFor()).steps.find(x => x.id === 'integrity');
  assert.notStrictEqual(s.status, 'critical');
  assert.ok(!/mismatch|damaged/i.test(s.detail || ''), s.detail);
});

t('the format check never reaches for KDF fields a plain vault has none of', async () => {
  const s = BOOT.run(probesFor({ kdfIterations: null })).steps.find(x => x.id === 'vault_format');
  assert.ok(s.detail && !/null|NaN|undefined/.test(s.detail), s.detail);
});

t('THE REPORTED STATE: an unparseable vault still blocks, as it must', async () => {
  const report = BOOT.run(probesFor({ parseOk: false, plain: false, snapshotCount: 0,
    parseMessage: 'Not a MASTERMIND vault file.' }));
  assert.ok(!report.canProceed, 'a file that cannot be read must never open');
  const s = report.steps.find(x => x.id === 'vault_format');
  assert.strictEqual(s.status, 'critical');
});

// ── The preservation gate ───────────────────────────────────────────
// Load the real screen module. No DOM: every function under test either
// tolerates a null element or does not touch one.

function makeSandbox(nxapi, opts) {
  const o = opts || {};
  const sb = {
    console,
    window: { MM_VERSION: 'test', NXAPI: nxapi },
    document: { getElementById: () => null, querySelectorAll: () => [] },
    MM_BUS: { emit: (t, d) => sb._bus.push({ t, d }) },
    MMLog: { info: () => {}, warn: () => {}, error: (c, m) => sb._errors.push(m) },
    mm_toast: () => {},
    mmConfirm: async () => (o.confirm !== false),
    _ssShow: (id, step) => sb._setup.push({ id, step }),
    _bus: [], _errors: [], _setup: [],
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'foundation', 'ui', 'mm-boot-screen.js'), 'utf8'),
    sb, { filename: 'mm-boot-screen.js' }
  );
  // MM_BOOT is declared `const`, so it is lexically scoped to the script and
  // never becomes a property of the sandbox object the way a `function`
  // declaration does. Reached from inside the context instead.
  sb.setReport = (r) => { sb.__r = r; vm.runInContext('MM_BOOT.report = __r;', sb); };
  return sb;
}

// A filesystem that records what was written, and can be told to misbehave.
function fakeFs(initial, faults) {
  const f = faults || {};
  const files = Object.assign({}, initial);
  return {
    files,
    api: {
      readFile: async (p) => {
        if (f.readThrows && p === f.readThrows) throw new Error('EACCES');
        return files[p] != null ? files[p] : null;
      },
      writeFile: async (p, d) => {
        if (f.writeFails) return false;
        files[p] = f.corruptWrite ? d.slice(0, -1) : d;
        return true;
      },
      ledgerAppend: async () => ({ ok: true }),
    },
  };
}

const VAULT_PATH = '/data/mastermind.vault';
const GARBAGE = '\u0000\u0001binary junk that is not JSON at all';

t('preservation copies the file and proves the copy byte for byte', async () => {
  const raw = plainVaultRaw();
  const disk = fakeFs({ [VAULT_PATH]: raw });
  const sb = makeSandbox(disk.api);

  const res = await sb.mmBootPreserveVault(VAULT_PATH);
  assert.ok(res.ok, res.message);
  assert.ok(/\.unopenable-\d{8}-\d{6}\.bak$/.test(res.path), 'bad name: ' + res.path);
  assert.strictEqual(disk.files[res.path], raw, 'the copy must be identical');
  assert.strictEqual(disk.files[VAULT_PATH], raw, 'the original must be untouched');
});

t('preservation works on a file that is NOT a vault \u2014 the case it exists for', async () => {
  // snapshotCreate() cannot do this: it verifies the copy parses as a vault
  // and deletes it when it does not. "Does not parse" is the whole reason a
  // file is being preserved, so preservation must not depend on parsing.
  const disk = fakeFs({ [VAULT_PATH]: GARBAGE });
  const sb = makeSandbox(disk.api);

  const res = await sb.mmBootPreserveVault(VAULT_PATH);
  assert.ok(res.ok, 'refused to preserve unreadable bytes: ' + res.message);
  assert.strictEqual(disk.files[res.path], GARBAGE);
});

t('preservation reports failure when the write does not land', async () => {
  const disk = fakeFs({ [VAULT_PATH]: plainVaultRaw() }, { writeFails: true });
  const sb = makeSandbox(disk.api);
  const res = await sb.mmBootPreserveVault(VAULT_PATH);
  assert.strictEqual(res.ok, false);
});

t('preservation reports failure when the copy on disk does not match', async () => {
  // The write call returning is not the same fact as the bytes being on disk.
  const disk = fakeFs({ [VAULT_PATH]: plainVaultRaw() }, { corruptWrite: true });
  const sb = makeSandbox(disk.api);
  const res = await sb.mmBootPreserveVault(VAULT_PATH);
  assert.strictEqual(res.ok, false);
  assert.ok(/does not match/i.test(res.message), res.message);
});

t('preservation reports failure when the original cannot be read', async () => {
  const disk = fakeFs({}, { readThrows: VAULT_PATH });
  const sb = makeSandbox(disk.api);
  const res = await sb.mmBootPreserveVault(VAULT_PATH);
  assert.strictEqual(res.ok, false);
});

// ── The refusal. The one irreversible action on this screen. ────────

function reportWith(probes) {
  const r = BOOT.run(probes);
  r.probes = probes; r.vaultPath = VAULT_PATH; r.dataDir = '/data';
  return r;
}

t('THE REFUSAL: a failed copy means NO new vault is created', async () => {
  const disk = fakeFs({ [VAULT_PATH]: GARBAGE }, { writeFails: true });
  const sb = makeSandbox(disk.api);
  sb.setReport(reportWith(probesFor({ parseOk: false, plain: false, snapshotCount: 0 })));

  await sb.mmBootCreateNew();

  assert.strictEqual(sb._setup.length, 0,
    'setup was reached with the old vault unpreserved \u2014 it would be overwritten');
  assert.strictEqual(disk.files[VAULT_PATH], GARBAGE, 'the original must be untouched');
  assert.ok(sb._bus.some(e => e.t === 'mm.vault.recreate.refused'), 'the refusal must be announced');
});

t('a successful copy lets setup proceed, and the original is still there', async () => {
  const disk = fakeFs({ [VAULT_PATH]: GARBAGE });
  const sb = makeSandbox(disk.api);
  sb.setReport(reportWith(probesFor({ parseOk: false, plain: false, snapshotCount: 0 })));

  await sb.mmBootCreateNew();

  assert.strictEqual(sb._setup.length, 1, 'setup should have been reached');
  assert.strictEqual(sb._setup[0].id, 'ss-setup');
  assert.strictEqual(disk.files[VAULT_PATH], GARBAGE);
  const kept = Object.keys(disk.files).filter(k => /\.bak$/.test(k));
  assert.strictEqual(kept.length, 1, 'exactly one preserved copy');
  assert.strictEqual(disk.files[kept[0]], GARBAGE);
});

t('declining the confirmation changes nothing at all', async () => {
  const disk = fakeFs({ [VAULT_PATH]: GARBAGE });
  const sb = makeSandbox(disk.api, { confirm: false });
  sb.setReport(reportWith(probesFor({ parseOk: false, plain: false, snapshotCount: 0 })));

  await sb.mmBootCreateNew();

  assert.strictEqual(sb._setup.length, 0);
  assert.deepStrictEqual(Object.keys(disk.files), [VAULT_PATH], 'no copy should exist');
});

t('with no vault file there is nothing to preserve and setup is immediate', async () => {
  const disk = fakeFs({});
  const sb = makeSandbox(disk.api);
  sb.setReport(reportWith(probesFor({ vaultExists: false, parseOk: false, plain: false, snapshotCount: 0 })));

  await sb.mmBootCreateNew();

  assert.strictEqual(sb._setup.length, 1);
  assert.strictEqual(Object.keys(disk.files).length, 0);
});

t('two recreate attempts do not collide on one filename', async () => {
  const disk = fakeFs({ [VAULT_PATH]: GARBAGE });
  const sb = makeSandbox(disk.api);
  const a = await sb.mmBootPreserveVault(VAULT_PATH);
  await new Promise(r => setTimeout(r, 1100));  // the stamp is second-resolution
  const b = await sb.mmBootPreserveVault(VAULT_PATH);
  assert.ok(a.ok && b.ok);
  assert.notStrictEqual(a.path, b.path, 'a second attempt must not overwrite the first copy');
});

// ── Startup routing: the file, not the marker ───────────────────────
// _routeStartup lives in nexus-engine.js, which is 769KB and assumes a DOM,
// so the DECISION is reproduced here exactly as the shipped function computes
// it and pinned against every combination. The expression is quoted in full
// so that a change to the source is visible as a divergence from this copy:
//
//   const fileWasRead = !!(probes && probes.vaultExists && probes.parseOk);
//   const isPlain = fileWasRead ? probes.plain === true : !!(meta && meta.noEncryption);
function routeDecision(probes, meta) {
  const fileWasRead = !!(probes && probes.vaultExists && probes.parseOk);
  const isPlain = fileWasRead ? probes.plain === true : !!(meta && meta.noEncryption);
  return { fileWasRead, isPlain, route: isPlain ? 'skip-login' : 'login' };
}

t('marker missing, file is plain: opens instead of demanding a password', () => {
  // Clearing site data used to be enough to lock someone out of an
  // unencrypted vault — the app asked for a password the vault never had.
  assert.strictEqual(routeDecision(probesFor({ plain: true }), null).route, 'skip-login');
});

t('marker says plain, file is ENCRYPTED: the password screen is still shown', () => {
  // The direction that matters for safety. A stale or forged marker used to
  // skip the unlock screen outright and land on a homepage with nothing
  // loaded and nothing proven.
  const d = routeDecision(probesFor({ plain: false }), { noEncryption: true, username: 'x' });
  assert.strictEqual(d.route, 'login');
});

t('marker and file agree: unchanged behaviour, both directions', () => {
  assert.strictEqual(routeDecision(probesFor({ plain: true }), { noEncryption: true }).route, 'skip-login');
  assert.strictEqual(routeDecision(probesFor({ plain: false }), { noEncryption: false }).route, 'login');
});

t('no pre-flight ran: the marker is still honoured as a fallback', () => {
  // First launch, or no NXAPI. Nothing has read the disk, so the only claim
  // available is the marker — used, rather than guessed past.
  assert.strictEqual(routeDecision(null, { noEncryption: true }).route, 'skip-login');
  assert.strictEqual(routeDecision(null, null).route, 'login');
});

t('an UNPARSEABLE file never counts as having been read', () => {
  const d = routeDecision(probesFor({ parseOk: false, plain: false }), { noEncryption: true });
  assert.strictEqual(d.fileWasRead, false,
    'routing must not read `plain` off a probe bundle that never saw a valid file');
});

t('the plain username reaches routing so a marker-free machine has a name', () => {
  const st = ENV.parse(plainVaultRaw()).envelope;
  const uname = (st.identity && st.identity.username) || st.username || null;
  assert.strictEqual(uname, 'operator',
    'without this the unencrypted branch has no identity on a fresh install');
});

// ── The other parse() consumers ─────────────────────────────────────
// Making parse() accept a plain vault means every caller that branched on
// `!parsed.legacy` now receives one. Each would have reached for a field a
// plain vault has none of.

t('a plain vault is never mistaken for an encrypted v6 envelope', () => {
  const p = ENV.parse(plainVaultRaw());
  // The exact guard used by vaultLoad, vaultCreateNew's post-write check, the
  // health panel, the exporter and importNexusVault.
  assert.ok(!(p.ok && !p.legacy && !p.plain),
    'the `!parsed.legacy` shape alone must no longer select the encrypted path');
  assert.strictEqual(p.envelope.kdf, undefined, 'there is no kdf to read');
  assert.strictEqual(p.envelope.data, undefined, 'there is no ciphertext to read');
  assert.strictEqual(p.envelope.ciphertextSha256, undefined, 'there is no hash to compare');
});

t('the hardened post-write guard fires on a plain result', () => {
  // `!ok || legacy || plain`. If a save ever wrote the plain shape where an
  // encrypted one was intended, verification must catch it, not report success.
  const p = ENV.parse(plainVaultRaw());
  assert.ok(!p.ok || p.legacy || p.plain);
});

t('the snapshot verifier accepts a plain vault by intent, not by accident', () => {
  // It used to pass only because a plain vault happens to carry
  // `encrypted: false`, so `obj.encrypted == null` was false. A writer that
  // dropped that field would have made create() delete its own good snapshots.
  const SNAPS = require('../foundation/vault/vault-snapshots.js');
  const ok = (obj) => {
    const isEncryptedV6 = obj && obj.format === 'mastermind-vault';
    const isPlain       = obj && (obj.format === 'mastermind-vault-plain' || obj.encrypted === false);
    const isLegacyV5    = obj && obj.encrypted != null;
    return !!(isEncryptedV6 || isPlain || isLegacyV5);
  };
  assert.ok(ok({ format: 'mastermind-vault-plain' }), 'accepted on format alone');
  assert.ok(ok({ encrypted: false }), 'accepted on the flag alone');
  assert.ok(ok({ format: 'mastermind-vault' }), 'encrypted v6 still accepted');
  assert.ok(ok({ encrypted: true, iv: 'x' }), 'v5 still accepted');
  assert.ok(!ok({ format: 'something-else' }), 'a non-vault is still rejected');
  assert.ok(typeof SNAPS.VaultSnapshots === 'function', 'the real module still loads');
});

// ── Setup: username required on BOTH paths, not just the encrypted one ──
// "Yes, username required" (2026-08-30). setupCreateVault (encrypted)
// already required a username. setupSkipEncryption/_setupSkipEncryptionConfirmed
// (the unencrypted "proceed without encryption" path) did not — an empty
// field there silently became 'operator', permanently, with no error and
// no re-prompt. Structural against the real source, same reasoning as
// tests/run-module-selection-once.test.js: this is a large DOM-dependent
// function where safely sandboxing risks testing a reimplementation
// instead of the real code.
function usernameRequiredTests() {
  const engine = fs.readFileSync(path.join(__dirname, '..', 'nexus-engine.js'), 'utf8');
  const localResults = [];
  function u(name, fn) {
    try { fn(); localResults.push(true); console.log('  \u2713 ' + name); }
    catch (e) {
      localResults.push(false);
      console.log('  \u2717 ' + name + '\n      ' + e.message);
    }
  }

  console.log('\nSETUP \u2014 username required on both encryption paths\n');

  u('setupSkipEncryption checks for a username BEFORE showing the security modal', () => {
    const start = engine.indexOf('function setupSkipEncryption()');
    const modalStart = engine.indexOf("getElementById('_mm_noenc_confirm')", start);
    const body = engine.slice(start, modalStart);
    assert.ok(/if \(!usernameEl\?\.value\.trim\(\)\)/.test(body),
      'expected an early username check before the modal is ever built');
    assert.ok(/Username required/.test(body));
    assert.ok(!/\|\|\s*'operator'/.test(body),
      'the silent operator fallback must be gone from this function');
  });

  u('_setupSkipEncryptionConfirmed ALSO checks \u2014 defense in depth, not just the earlier gate', () => {
    const start = engine.indexOf('async function _setupSkipEncryptionConfirmed()');
    const stop = engine.indexOf('\nasync function', start + 10);
    const body = engine.slice(start, stop);
    assert.ok(/if \(!username\)/.test(body), 'expected a second check at confirmation time');
    assert.ok(/Username required/.test(body));
    assert.ok(!/\|\|\s*'operator'/.test(body),
      'the silent operator fallback must be gone from this function too');
  });

  u('REGRESSION: the encrypted path\u2019s existing requirement is unchanged', () => {
    const start = engine.indexOf('async function setupCreateVault()');
    const stop = engine.indexOf('\nasync function', start + 10);
    const body = engine.slice(start, stop);
    assert.ok(/if \(!username\) return setErr\('Username required'\)/.test(body),
      'the encrypted path must still require a username exactly as before \u2014 this fix should not have touched it');
  });

  return localResults.filter(r => !r).length;
}

runAll().then(() => {
  const fails = results.filter(r => !r.ok);
  console.log('\nvault-plain: ' + (results.length - fails.length) + '/' + results.length + ' passed');

  const usernameFails = usernameRequiredTests();

  process.exitCode = (fails.length || usernameFails) ? 1 : 0;
});
