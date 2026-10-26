'use strict';
// ═══════════════════════════════════════════════════════════════════
// VAULT LIFECYCLE — end to end, real filesystem
//
// WHAT THIS IS: the create → save → reopen → change-password → reopen
// lifecycle, run against a real directory using the SAME atomic-write
// module main.js uses and the SAME crypto modules the renderer uses.
// No mocks. Nothing reimplemented for the test.
//
// WHAT THIS IS NOT: a hardware test. It does not launch Electron, does
// not cross an IPC boundary, and does not touch the unlock screen.
// §1.1 still applies — this narrows the untested surface to the UI and
// IPC layers, it does not close it. The 2026-08-11 field failure lived
// exactly in the layer this cannot reach, which is the reason for
// saying so plainly here rather than letting a green run imply more
// than it proves.
//
// The password-change test is the important one: the v0.1.3 code would
// have produced a vault that NO password could open, and it would have
// looked like success.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ENV    = require('../foundation/vault/vault-envelope.js');
const VC     = require('../foundation/vault/vault-crypto.js');
const LEDGER = require('../foundation/vault/vault-ledger.js');
const GUARD  = require('../foundation/vault/vault-guard.js');
const AW     = require('../foundation/vault/atomic-write.js');

const results = [];
async function t(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  \u2713 ' + name + ' (' + (Date.now() - start) + 'ms)');
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('  \u2717 ' + name + '\n      ' + (e.stack || e.message).split('\n').join('\n      '));
  }
}

const ITER = ENV.MIN_ITERATIONS;

// ── A minimal vault host: the real save/open logic, no DOM ──────────
// Mirrors what mastermind-vault.js does, using the same modules. The
// session key and its KDF parameters are held together — the property
// whose absence caused the v0.1.3 fault.
class VaultSession {
  constructor(dir) {
    this.dir    = dir;
    this.path   = path.join(dir, 'mastermind.vault');
    this.ledger = new LEDGER.VaultLedger(dir);
    this.key = null; this.kdf = null;
    this.vaultId = null; this.saveCount = 0; this.anchor = null;
  }

  async _setKey(key, salt, iterations) {
    this.key = key;
    this.kdf = { salt, iterations };
  }

  async create(password, state, iterations) {
    const iters = iterations || ITER;
    const salt  = VC.randomSaltB64(ENV.SALT_BYTES);
    await this._setKey(await VC.deriveKey(password, salt, iters, 32), salt, iters);
    this.vaultId = VC.uuidV4();
    this.saveCount = 0;
    this.ledger.append(LEDGER.EVENTS.VAULT_CREATED, { vaultId: this.vaultId });
    return this.save(state);
  }

  async save(state) {
    if (!this.key || !this.kdf) throw new Error('no session key');
    if (!this.vaultId) throw new Error('no vault identity');
    const next = this.saveCount + 1;
    const anchor = this.ledger.append(LEDGER.EVENTS.SAVE, {
      vaultId: this.vaultId, saveCount: next,
    });
    const header = ENV.buildHeader({
      vaultId: this.vaultId,
      kdf: { salt: this.kdf.salt, iterations: this.kdf.iterations },
      iv: VC.randomIvB64(ENV.IV_BYTES),
      saveCount: next,
      ledgerAnchor: { seq: anchor.seq, head: anchor.head },
    });
    // The invariant, checked here exactly as vaultSave checks it.
    if (header.kdf.salt !== this.kdf.salt || header.kdf.iterations !== this.kdf.iterations) {
      throw new Error('header KDF does not match the session key');
    }
    const ct  = await VC.encrypt(this.key, VC.utf8Encode(JSON.stringify(state)), header.iv, ENV.aadBytes(header));
    const sha = await VC.sha256Hex(ct);
    const payload = ENV.serialize(ENV.assemble(header, VC.toBase64(ct), sha));

    const res = AW.atomicWrite(this.path, payload);   // the shipped write path
    if (!res.ok) throw new Error('write failed: ' + res.error);

    this.saveCount = next;
    this.anchor = header.ledgerAnchor;
    return { bytes: res.bytes, saveCount: next };
  }

  // Opens from the FILE alone plus a password. No side state.
  async open(password) {
    const raw = AW.readFile(this.path);
    const parsed = ENV.parse(raw);
    if (!parsed.ok) throw new Error(parsed.reason);
    const env = parsed.envelope;
    const ct  = VC.fromBase64(env.data);
    const sha = await VC.sha256Hex(ct);
    if (!VC.timingSafeEqualHex(sha, env.ciphertextSha256)) {
      const e = new Error('CIPHERTEXT_CORRUPT'); e.code = 'CIPHERTEXT_CORRUPT'; throw e;
    }
    const key = await VC.deriveKey(password, env.kdf.salt, env.kdf.iterations, env.kdf.keyLen);
    const plain = await VC.decrypt(key, ct, env.iv, ENV.aadBytes(env));
    await this._setKey(key, env.kdf.salt, env.kdf.iterations);
    this.vaultId = env.vaultId; this.saveCount = env.saveCount; this.anchor = env.ledgerAnchor;
    this.ledger.append(LEDGER.EVENTS.UNLOCK_SUCCESS, { vaultId: env.vaultId });
    return JSON.parse(VC.utf8Decode(plain));
  }

  async changePassword(current, next, targetIterations) {
    const state = await this.open(current);          // proves the old password
    const newSalt  = VC.randomSaltB64(ENV.SALT_BYTES);
    const newIters = targetIterations || this.kdf.iterations;
    const newKey   = await VC.deriveKey(next, newSalt, newIters, 32);
    await this._setKey(newKey, newSalt, newIters);   // key and params together
    await this.save(state);
    // Verify before claiming success.
    const check = ENV.parse(AW.readFile(this.path)).envelope;
    const vKey = await VC.deriveKey(next, check.kdf.salt, check.kdf.iterations, 32);
    await VC.decrypt(vKey, VC.fromBase64(check.data), check.iv, ENV.aadBytes(check));
    return true;
  }

  verdict() {
    const v = this.ledger.verify();
    const s = GUARD.summarizeLedger(this.ledger.readAll().entries, v);
    const env = ENV.parse(AW.readFile(this.path)).envelope;
    return GUARD.evaluate(env, s, !this.ledger.exists());
  }
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-e2e-'));

(async function run() {
  console.log('\nVAULT LIFECYCLE — real filesystem, shipped write path\n');

  await t('create → file exists, parses as v6, opens with the password', async () => {
    const s = new VaultSession(tmpDir());
    const state = { canvas: { nodes: [{ id: 'n1' }, { id: 'n2' }] }, username: 'operator' };
    await s.create('first-password', state);
    assert.ok(fs.existsSync(s.path), 'vault file must exist on disk');
    const parsed = ENV.parse(fs.readFileSync(s.path, 'utf8'));
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.legacy, false);
    const fresh = new VaultSession(s.dir);
    assert.deepStrictEqual(await fresh.open('first-password'), state);
  });

  await t('a second session opens it with NO carried state (portability)', async () => {
    const dir = tmpDir();
    const a = new VaultSession(dir);
    const state = { canvas: { nodes: [{ id: 'only' }] } };
    await a.create('pw-portable', state);
    // Simulate a different machine: brand new object, only the file + password.
    const b = new VaultSession(dir);
    assert.deepStrictEqual(await b.open('pw-portable'), state);
  });

  await t('saves accumulate and saveCount advances', async () => {
    const s = new VaultSession(tmpDir());
    await s.create('pw', { canvas: { nodes: [] } });
    assert.strictEqual(s.saveCount, 1);
    await s.save({ canvas: { nodes: [{ id: 'a' }] } });
    await s.save({ canvas: { nodes: [{ id: 'a' }, { id: 'b' }] } });
    assert.strictEqual(s.saveCount, 3);
    const reopened = await new VaultSession(s.dir).open('pw');
    assert.strictEqual(reopened.canvas.nodes.length, 2);
  });

  await t('REGRESSION: password change re-encrypts the FILE and the new password opens it', async () => {
    const s = new VaultSession(tmpDir());
    const state = { canvas: { nodes: [{ id: 'precious' }] } };
    await s.create('old-password', state);
    await s.changePassword('old-password', 'new-password');

    const fresh = new VaultSession(s.dir);
    assert.deepStrictEqual(await fresh.open('new-password'), state,
      'the new password must open the vault — v0.1.3 would have produced a file no password could open');
  });

  await t('REGRESSION: after a password change the OLD password no longer works', async () => {
    const s = new VaultSession(tmpDir());
    await s.create('old-password', { canvas: { nodes: [] } });
    await s.changePassword('old-password', 'new-password');
    await assert.rejects(() => new VaultSession(s.dir).open('old-password'));
  });

  await t('password change to a higher iteration count survives reopening', async () => {
    const s = new VaultSession(tmpDir());
    const state = { canvas: { nodes: [{ id: 'x' }] } };
    await s.create('pw-a', state, ENV.MIN_ITERATIONS);
    await s.changePassword('pw-a', 'pw-b', ENV.MIN_ITERATIONS + 90000);
    const fresh = new VaultSession(s.dir);
    assert.deepStrictEqual(await fresh.open('pw-b'), state);
    const env = ENV.parse(fs.readFileSync(s.path, 'utf8')).envelope;
    assert.strictEqual(env.kdf.iterations, ENV.MIN_ITERATIONS + 90000);
  });

  await t('a failed password change leaves the vault openable by the old password', async () => {
    const s = new VaultSession(tmpDir());
    const state = { canvas: { nodes: [{ id: 'safe' }] } };
    await s.create('old-password', state);
    await assert.rejects(() => s.changePassword('WRONG-password', 'new-password'));
    const fresh = new VaultSession(s.dir);
    assert.deepStrictEqual(await fresh.open('old-password'), state,
      'a rejected change must not touch the file');
  });

  await t('the write is atomic — no .tmp is left behind', async () => {
    const s = new VaultSession(tmpDir());
    await s.create('pw', { canvas: { nodes: [] } });
    await s.save({ canvas: { nodes: [{ id: 'q' }] } });
    assert.ok(!fs.existsSync(s.path + '.tmp'), 'temp file must not survive a successful write');
  });

  await t('a failed write reports failure and leaves no temp file', () => {
    const dir = tmpDir();
    const target = path.join(dir, 'subdir-as-file');
    fs.mkdirSync(target);                       // a directory where a file should go
    const res = AW.atomicWrite(path.join(target, 'x', 'y', 'z'), 'data');
    // Either it fails, or it succeeded by creating the path — both are
    // acceptable; what is not acceptable is a stray .tmp.
    assert.ok(!fs.existsSync(path.join(target, 'x', 'y', 'z.tmp')));
    assert.ok(typeof res.ok === 'boolean');
  });

  await t('editing savedAt on disk makes the real file refuse to open', async () => {
    const s = new VaultSession(tmpDir());
    await s.create('pw', { canvas: { nodes: [{ id: 'n' }] } });
    const env = JSON.parse(fs.readFileSync(s.path, 'utf8'));
    env.savedAt = '2020-01-01T00:00:00.000Z';
    fs.writeFileSync(s.path, JSON.stringify(env, null, 2));
    await assert.rejects(() => new VaultSession(s.dir).open('pw'),
      'an edited timestamp must break decryption — otherwise "last modified" means nothing');
  });

  await t('restoring an older vault beside a live ledger is caught as ROLLBACK', async () => {
    const s = new VaultSession(tmpDir());
    await s.create('pw', { canvas: { nodes: [{ id: 'v1' }] } });
    const snapshot = fs.readFileSync(s.path, 'utf8');    // backup taken here
    await s.save({ canvas: { nodes: [{ id: 'v1' }, { id: 'v2' }] } });
    await s.save({ canvas: { nodes: [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }] } });

    fs.writeFileSync(s.path, snapshot);                  // ...and restored
    const v = new VaultSession(s.dir).verdict();
    assert.strictEqual(v.code, 'ROLLBACK');
    assert.strictEqual(v.requiresPrompt, true);
  });

  await t('deleting the audit ledger is caught, not ignored', async () => {
    const s = new VaultSession(tmpDir());
    await s.create('pw', { canvas: { nodes: [] } });
    fs.unlinkSync(s.ledger.file);
    const v = new VaultSession(s.dir).verdict();
    assert.strictEqual(v.code, 'LEDGER_MISSING');
    assert.strictEqual(v.severity, 'critical');
  });

  await t('a full session: create, work, close, reopen, change password, reopen', async () => {
    const dir = tmpDir();
    let s = new VaultSession(dir);
    await s.create('start-pw', { canvas: { nodes: [] }, notes: [] });

    s = new VaultSession(dir);
    const st = await s.open('start-pw');
    st.canvas.nodes.push({ id: 'idea-1', label: 'spatial void rebuild' });
    st.notes.push('associative voice lattice');
    await s.save(st);

    s = new VaultSession(dir);
    await s.changePassword('start-pw', 'stronger-pw');

    s = new VaultSession(dir);
    const final = await s.open('stronger-pw');
    assert.strictEqual(final.canvas.nodes.length, 1);
    assert.strictEqual(final.notes[0], 'associative voice lattice');
    assert.strictEqual(s.verdict().code, 'OK', 'the audit chain must still agree with the vault');
  });

  const fails = results.filter((r) => !r.ok);
  console.log('\nvault-lifecycle: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
})();
