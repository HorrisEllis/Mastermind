'use strict';
// ═══════════════════════════════════════════════════════════════════
// FEATURES-SCREEN VAULT GATE — self-heal a missing RSA keypair
//
// The gate in featuresConfirm() proves two different things in the same
// try block: that AES round-trips correctly (the thing that actually
// protects the vault's data), and that an RSA keypair exists (which
// only ever fed the Settings > Keys display/export). Some vaults from
// earlier in this app's life never got a keypair written. Treating that
// as equally fatal — "go back and recreate your identity" — threatened
// real, saved canvas data over a cosmetic feature gap.
//
// This proves the fix: a vault that decrypts fine but has no keypair
// gets one generated and saved, in place, without needing to start
// over. It also proves the fix didn't quietly swallow the check it
// sits next to — a vault that fails ITS OWN round-trip must still fail
// loudly.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const VaultCrypto = require(path.join(ROOT, 'foundation', 'vault', 'vault-crypto.js'));

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
// The exact vault-gating try block, wrapped standalone so it can run
// against a real AUTH.key without the rest of featuresConfirm()'s DOM
// and module-selection state.
const gateSrc =
  'async function _vaultGate() {\n' +
  extractBetween(engineSrc, '  if (AUTH.encrypted && AUTH.key) {', '\n  }\n\n  const btn = document.getElementById') +
  '\n  }\n' +
  '  return { keys: _AUTH_STORE.keys, dirty: VAULT.dirty, blocked: !!vaultErr.textContent };\n' +
  '}\n' +
  'this._vaultGate = _vaultGate;\n';

// mastermind-vault.js's real implementations, not reinvented for the test.
async function _aesEncrypt(key, data) {
  const iv = VaultCrypto.randomIvB64(12);
  const ct = await VaultCrypto.encrypt(key, data, iv, null);
  return { iv, data: VaultCrypto.toBase64(ct) };
}
async function _aesDecrypt(key, { iv, data }) {
  const ct = VaultCrypto.fromBase64(data);
  const plain = await VaultCrypto.decrypt(key, ct, iv, null);
  return plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength);
}

function makeSandbox(opts) {
  const o = opts || {};
  const saveCalls = { count: 0 };
  const AUTH_STORE = { meta: null, keys: o.initialKeys ?? null };
  const VAULT = { dirty: false };
  const sandbox = {
    console,
    crypto: require('crypto').webcrypto,
    TextEncoder, TextDecoder, Uint8Array,
    _AUTH_STORE: AUTH_STORE,
    VAULT,
    AUTH: { encrypted: true, key: o.key, features: {} },
    VaultCrypto,
    MMLog: { info() {}, warn() {}, error() {} },
    mm_toast: () => {},
    vaultErr: { textContent: '', style: {} },
    _aesEncrypt: o.aesEncrypt || _aesEncrypt,
    _aesDecrypt: o.aesDecrypt || _aesDecrypt,
    vaultSave: async () => {
      saveCalls.count++;
      if (o.saveFails) { VAULT.dirty = true; return; }
      VAULT.dirty = false;
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(gateSrc, sandbox);
  return { sandbox, AUTH_STORE, VAULT, saveCalls };
}

async function run() {
  console.log('\nVAULT GATE \u2014 self-heal a missing keypair\n');
  for (const { name, fn } of pending) {
    try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
    catch (e) {
      results.push({ name, ok: false });
      console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
    }
  }
  const fails = results.filter(r => !r.ok);
  console.log('\nvault-gate-repair: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
}

t('a vault that decrypts fine but has no keypair gets one generated and saved, not blocked', async () => {
  const key = await VaultCrypto.deriveKey('a real password', VaultCrypto.randomSaltB64(32), 100000, 32);
  const { sandbox, saveCalls } = makeSandbox({ key, initialKeys: null });

  const result = await sandbox._vaultGate();

  assert.ok(result.keys?.pubKey, 'a keypair must exist after the gate runs');
  assert.ok(result.keys?.encPrivKey, 'the private key must be present too (wrapped)');
  assert.strictEqual(saveCalls.count, 1, 'the repaired vault must actually be saved, not just held in memory');
  assert.strictEqual(result.dirty, false, 'the save must be confirmed to have landed');
});

t('the generated private key is actually wrapped with the session key, not stored raw', async () => {
  const key = await VaultCrypto.deriveKey('a real password', VaultCrypto.randomSaltB64(32), 100000, 32);
  const { sandbox } = makeSandbox({ key, initialKeys: null });

  const result = await sandbox._vaultGate();

  // encPrivKey must be the { iv, data } shape _aesEncrypt produces, and
  // it must actually decrypt back to a valid PKCS8 private key under the
  // same session key — proving it's really wrapped, not just relabeled.
  assert.ok(result.keys.encPrivKey.iv && result.keys.encPrivKey.data, 'must be the {iv,data} wrapped shape');
  const privRaw = await _aesDecrypt(key, result.keys.encPrivKey);
  const imported = await require('crypto').webcrypto.subtle.importKey(
    'pkcs8', privRaw, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']
  );
  assert.strictEqual(imported.type, 'private');
});

t('a vault that ALREADY has a keypair is left untouched — no unnecessary regeneration or save', async () => {
  const key = await VaultCrypto.deriveKey('a real password', VaultCrypto.randomSaltB64(32), 100000, 32);
  const existingKeys = { pubKey: 'EXISTING_PUBKEY', encPrivKey: { iv: 'x', data: 'y' } };
  const { sandbox, saveCalls } = makeSandbox({ key, initialKeys: existingKeys });

  const result = await sandbox._vaultGate();

  assert.strictEqual(result.keys.pubKey, 'EXISTING_PUBKEY', 'must not overwrite a keypair that already exists');
  assert.strictEqual(saveCalls.count, 0, 'nothing needed repair, so nothing should be saved');
});

t('this fix must NOT weaken the real check: a vault that fails its own AES round-trip still blocks entry', async () => {
  const key = await VaultCrypto.deriveKey('a real password', VaultCrypto.randomSaltB64(32), 100000, 32);
  const brokenAesEncrypt = async () => ({ iv: 'garbage', data: 'not-real-ciphertext' });
  const { sandbox, AUTH_STORE } = makeSandbox({ key, initialKeys: null, aesEncrypt: brokenAesEncrypt });

  // The catch block's own `return;` (no value) exits before this test's
  // appended return statement ever runs — same as it exits featuresConfirm()
  // early in the real UI. That undefined result IS the "blocked" signal.
  const result = await sandbox._vaultGate();
  assert.strictEqual(result, undefined, 'a genuinely broken vault must still block entry, not be silently repaired past');
  assert.strictEqual(AUTH_STORE.keys, null, 'no keypair should have been installed on a vault that failed its own check');
});

t('if the repair save does not land, that still blocks entry rather than a silent success', async () => {
  const key = await VaultCrypto.deriveKey('a real password', VaultCrypto.randomSaltB64(32), 100000, 32);
  const { sandbox, VAULT } = makeSandbox({ key, initialKeys: null, saveFails: true });

  const result = await sandbox._vaultGate();
  assert.strictEqual(result, undefined);
  assert.strictEqual(VAULT.dirty, true, 'the failed save must leave the vault correctly marked dirty, not falsely clean');
});

run();
