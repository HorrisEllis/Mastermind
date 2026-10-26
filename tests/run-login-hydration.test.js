'use strict';
// ═══════════════════════════════════════════════════════════════════
// LOGIN → _AUTH_STORE HYDRATION
//
// loginSubmit()'s gate-3 branch decrypts the vault into `state`, then
// extracts pieces of it into module state: `meta` (identity),
// MFA_STATE (via mfaHydrateFromVault), and — until this fix —
// state.keys was decrypted and then simply dropped, never assigned to
// _AUTH_STORE.keys. Nothing else populates that before
// featuresConfirm()'s "Vault keys missing" check runs for a returning
// user who hasn't confirmed features yet, so login would succeed and
// the very next screen would show an unrecoverable-looking error.
//
// This builds a REAL encrypted vault (actual VaultCrypto/VaultEnvelope,
// not mocked) and runs the actual extracted decrypt-and-hydrate source
// against it, so a future refactor that reintroduces "decrypted but
// dropped" for keys, identity, or anything else in this block fails a
// test instead of only surfacing on someone's second login.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VaultCrypto = require(path.join(ROOT, 'foundation', 'vault', 'vault-crypto.js'));
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

const engineSrc = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
// The exact gate-3 (non-legacy) decrypt-and-hydrate branch, wrapped as a
// standalone async function so it can be run directly against a real
// vault instead of only being reachable through the full loginSubmit()
// click-handler (which needs a live DOM, NXAPI, and UI state this test
// has no reason to fake).
const gate3Src =
  'async function _gate3Decrypt(pw, parsedVault) {\n' +
  '  let key, meta;\n' +
  extractBetween(engineSrc, '      const env = parsedVault.envelope;', '\n    }\n\n    AUTH.username') +
  '\n  return { meta, keys: _AUTH_STORE.keys };\n' +
  '}\n' +
  'this._gate3Decrypt = _gate3Decrypt;\n';

function makeSandbox() {
  const AUTH_STORE = { meta: null, keys: null };
  const VAULT = {};
  const AUTH = { kdf: {} };
  const deserializeCalls = [];
  const integrityCalls = [];
  const toasts = [];
  const sandbox = {
    console,
    _AUTH_STORE: AUTH_STORE,
    VAULT,
    AUTH,
    VaultCrypto,
    VaultEnvelope,
    MMLog: { info() {}, warn() {}, error() {} },
    mm_toast: (msg, kind, opts) => toasts.push({ msg, kind, opts }),
    _setSessionKey: (key, salt, iterations) => { AUTH.key = key; AUTH.kdf = { salt, iterations }; },
    vaultGetIterations: () => 600000,
    mfaHydrateFromVault: () => {},
    // A spy, not the real vaultDeserialize — that function's own
    // correctness (does it actually restore canvas/module state
    // correctly) is a separate concern with its own coverage
    // (run-lattice-sessions.test.js checks the LATTICE piece). What
    // THIS test needs to prove is narrower and was the actual bug:
    // does loginSubmit call it AT ALL, and with the real decrypted
    // payload, not a stripped-down copy of it.
    vaultDeserialize: (data) => { deserializeCalls.push(data); return true; },
    vaultCheckNodeIntegrity: (data) => { integrityCalls.push(data); return { ok: true, duplicateIds: [], danglingConns: [] }; },
    _pendingRekey: null,
  };
  vm.createContext(sandbox);
  vm.runInContext(gate3Src, sandbox);
  return { sandbox, AUTH_STORE, deserializeCalls, integrityCalls, toasts };
}

// Builds a real, valid v6 encrypted vault envelope — the same shape
// vaultCreateNew() produces — containing identity + keys, so the test
// exercises actual AES-GCM decrypt, not a stand-in.
async function buildRealVault(password, payload) {
  const salt = VaultCrypto.randomSaltB64(32);
  const iterations = 600000;
  const key = await VaultCrypto.deriveKey(password, salt, iterations, 32);
  const iv = VaultCrypto.randomIvB64(12);
  const plainBytes = VaultCrypto.utf8Encode(JSON.stringify(payload));

  const header = VaultEnvelope.buildHeader({
    vaultId: VaultCrypto.uuidV4(),
    kdf: { salt, iterations, keyLen: 32 },
    iv,
    saveCount: 1,
  });
  const ciphertext = await VaultCrypto.encrypt(key, plainBytes, iv, VaultEnvelope.aadBytes(header));
  const ciphertextB64 = VaultCrypto.toBase64(new Uint8Array(ciphertext));
  const sha = await VaultCrypto.sha256Hex(VaultCrypto.fromBase64(ciphertextB64));
  const envelope = VaultEnvelope.assemble(header, ciphertextB64, sha);
  return { envelope, key };
}

async function run() {
  console.log('\nLOGIN \u2192 _AUTH_STORE HYDRATION\n');
  for (const { name, fn } of pending) {
    try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
    catch (e) {
      results.push({ name, ok: false });
      console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
    }
  }
  const fails = results.filter(r => !r.ok);
  console.log('\nlogin-hydration: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
}

t('decrypting a real vault populates _AUTH_STORE.keys.pubKey — the exact regression', async () => {
  const password = 'correct horse battery staple';
  const payload = {
    identity: { username: 'jbrooks', pinHash: null, created: Date.now(), version: 6 },
    keys: { pubKey: 'FAKE_PUBKEY_BASE64_==', encPrivKey: 'FAKE_ENC_PRIVKEY_==' },
    security: { mfa: null },
  };
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, AUTH_STORE } = makeSandbox();

  assert.strictEqual(AUTH_STORE.keys, null, 'sanity check: keys start unset, same as a fresh login session');

  const result = await sandbox._gate3Decrypt(password, { envelope });

  assert.ok(result.keys, '_AUTH_STORE.keys must be populated after a successful decrypt');
  assert.strictEqual(result.keys.pubKey, 'FAKE_PUBKEY_BASE64_==');
  assert.strictEqual(result.keys.encPrivKey, 'FAKE_ENC_PRIVKEY_==');
  assert.strictEqual(result.meta.username, 'jbrooks');
});

t('a vault with no keys field at all does not crash, and does not silently overwrite a good in-memory keys with null', async () => {
  const password = 'another passphrase entirely';
  const payload = { identity: { username: 'operator', version: 6 } }; // no `keys` at all
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, AUTH_STORE } = makeSandbox();
  AUTH_STORE.keys = { pubKey: 'ALREADY_HAD_THIS', encPrivKey: 'X' }; // simulate a prior successful hydrate this session

  const result = await sandbox._gate3Decrypt(password, { envelope });

  assert.strictEqual(result.keys.pubKey, 'ALREADY_HAD_THIS', 'a vault payload missing `keys` must not clobber keys already known this session');
});

t('a wrong password still throws (this fix must not weaken that guarantee)', async () => {
  const payload = { identity: { username: 'jbrooks' }, keys: { pubKey: 'X', encPrivKey: 'Y' } };
  const { envelope } = await buildRealVault('the-real-password', payload);
  const { sandbox } = makeSandbox();

  await assert.rejects(sandbox._gate3Decrypt('totally-wrong-password', { envelope }));
});

t('identity and MFA hydration still happen alongside keys — this fix did not narrow the block to only keys', async () => {
  const password = 'yet another passphrase';
  let mfaHydrateCalledWith = null;
  const payload = {
    identity: { username: 'someone', version: 6 },
    keys: { pubKey: 'PK', encPrivKey: 'EPK' },
    security: { mfa: { totp: { enabled: true } } },
  };
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox } = makeSandbox();
  sandbox.mfaHydrateFromVault = (mfa) => { mfaHydrateCalledWith = mfa; };

  const result = await sandbox._gate3Decrypt(password, { envelope });

  assert.strictEqual(result.meta.username, 'someone');
  assert.ok(mfaHydrateCalledWith, 'mfaHydrateFromVault must still be called');
  assert.strictEqual(mfaHydrateCalledWith.totp.enabled, true);
});

// ── vaultDeserialize wiring — THE actual "decrypted vault lives in RAM"
// fix. Until this, loginSubmit() decrypted the full vault into `state`
// and then discarded everything except identity/keys/MFA — canvas
// nodes, connections, every module's saved data were parsed and thrown
// away. vaultDeserialize() already existed and did full restoration
// correctly; it just was never called on the path everyone actually
// logs in through, only via a manual "Load from Vault" Settings button.

t('a real vault with canvas/module data is passed to vaultDeserialize on login — not discarded after identity/keys are plucked out', async () => {
  const password = 'restoring my actual data';
  const payload = {
    identity: { username: 'jbrooks', version: 6 },
    keys: { pubKey: 'PK', encPrivKey: 'EPK' },
    canvas: {
      nodes: [{ id: 'n1', type: 'concept', x: 10, y: 20, title: 'A real saved thought' }],
      conns: [{ id: 'c1', from: 'n1', to: 'n2', label: 'relates to' }],
      viewport: { zoom: 1.5, panX: 100, panY: -50 },
      clipboard: [],
    },
    modules: { options: { theme: 'nexus' }, features: { brain: true } },
  };
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, deserializeCalls } = makeSandbox();

  await sandbox._gate3Decrypt(password, { envelope });

  assert.strictEqual(deserializeCalls.length, 1, 'vaultDeserialize must be called exactly once during login');
  // JSON round-trip both sides: the vm sandbox is a different realm, so
  // its arrays/objects are structurally identical but not reference-
  // identical to the main process's — deepStrictEqual treats that as a
  // failure even though the DATA is exactly right, which is the only
  // thing this assertion is actually checking.
  const got = JSON.parse(JSON.stringify(deserializeCalls[0]));
  assert.deepStrictEqual(got.canvas.nodes, payload.canvas.nodes, 'the REAL decrypted canvas data must reach vaultDeserialize, not a stripped copy');
  assert.deepStrictEqual(got.canvas.conns, payload.canvas.conns);
  assert.strictEqual(got.modules.options.theme, 'nexus');
});

t('a vaultDeserialize failure is caught and reported — it must not block login or crash the app', async () => {
  const password = 'a vault that will fail to restore';
  const payload = { identity: { username: 'jbrooks', version: 6 }, canvas: { nodes: [] } };
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, toasts } = makeSandbox();
  sandbox.vaultDeserialize = () => { throw new Error('CANVAS is not defined'); };

  // Must not reject — a broken restore should degrade gracefully into
  // an empty working copy, not prevent the person from getting in at
  // all (they can retry "Load from Vault" once inside).
  const result = await sandbox._gate3Decrypt(password, { envelope });
  assert.strictEqual(result.meta.username, 'jbrooks', 'login itself must still succeed');
  assert.ok(toasts.some(t => /restore/i.test(t.msg)), 'the failure must be surfaced, not swallowed silently');
});

t('a vault missing canvas entirely (should not happen for a real vault, but must not crash) still logs in', async () => {
  const password = 'edge case vault';
  const payload = { identity: { username: 'operator', version: 6 } }; // no canvas key
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, deserializeCalls } = makeSandbox();

  const result = await sandbox._gate3Decrypt(password, { envelope });
  assert.strictEqual(result.meta.username, 'operator');
  assert.strictEqual(deserializeCalls.length, 1, 'vaultDeserialize is still called — its own guard clause handles a missing canvas key');
});

t('vaultCheckNodeIntegrity runs on every login, right after vaultDeserialize', async () => {
  const password = 'checking integrity';
  const payload = { identity: { username: 'jbrooks', version: 6 }, canvas: { nodes: [{ id: 'a' }] } };
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, integrityCalls } = makeSandbox();

  await sandbox._gate3Decrypt(password, { envelope });
  assert.strictEqual(integrityCalls.length, 1);
  assert.ok(integrityCalls[0].canvas, 'the real decrypted state must reach the integrity check, not a placeholder');
});

t('a reported integrity problem surfaces as a toast but does not block login', async () => {
  const password = 'a vault with a broken graph';
  const payload = { identity: { username: 'jbrooks', version: 6 }, canvas: { nodes: [{ id: 'a' }, { id: 'a' }] } };
  const { envelope } = await buildRealVault(password, payload);
  const { sandbox, toasts } = makeSandbox();
  sandbox.vaultCheckNodeIntegrity = () => ({ ok: false, duplicateIds: ['a'], danglingConns: [] });

  const result = await sandbox._gate3Decrypt(password, { envelope });
  assert.strictEqual(result.meta.username, 'jbrooks', 'login must still succeed despite a graph problem');
  assert.ok(toasts.some(t => /duplicate/i.test(t.msg)), 'the problem must be surfaced, not silently ignored');
});

run();
