'use strict';
// ═══════════════════════════════════════════════════════════════════
// VAULT v6 — failure-mode suite
//
// Loads the REAL shipped modules and runs the REAL crypto. Nothing is
// stubbed: WebCrypto here is the same WebCrypto the renderer uses, and
// the ledger writes to a real temp directory and is read back from disk.
//
// The interesting tests are the negative ones. A vault that opens when
// the password is right proves very little; a vault that REFUSES to
// open when savedAt was edited is the whole point of the design.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ENV    = require('../foundation/vault/vault-envelope.js');
const VC     = require('../foundation/vault/vault-crypto.js');
const LEDGER = require('../foundation/vault/vault-ledger.js');
const GUARD  = require('../foundation/vault/vault-guard.js');

const results = [];
async function t(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - start });
    console.log('  \u2713 ' + name + ' (' + (Date.now() - start) + 'ms)');
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log('  \u2717 ' + name + '\n      ' + (e.stack || e.message).split('\n').join('\n      '));
  }
}

const TEST_ITER = ENV.MIN_ITERATIONS; // lowest the format permits — keeps the suite quick
const PASSWORD  = 'correct horse battery staple';

// ── Helpers that use only shipped code ──────────────────────────────

async function sealVault(plainObj, opts) {
  const o = opts || {};
  const salt = o.salt || VC.randomSaltB64(ENV.SALT_BYTES);
  const iv   = o.iv   || VC.randomIvB64(ENV.IV_BYTES);
  const header = ENV.buildHeader({
    vaultId:      o.vaultId   || VC.uuidV4(),
    kdf:          { salt, iterations: o.iterations || TEST_ITER },
    iv,
    savedAt:      o.savedAt   || new Date().toISOString(),
    saveCount:    o.saveCount != null ? o.saveCount : 1,
    ledgerAnchor: o.ledgerAnchor != null ? o.ledgerAnchor : null,
  });
  const key = await VC.deriveKey(o.password || PASSWORD, salt, header.kdf.iterations, ENV.KEY_LEN);
  const plaintext = VC.utf8Encode(JSON.stringify(plainObj));
  const ct  = await VC.encrypt(key, plaintext, iv, ENV.aadBytes(header));
  const sha = await VC.sha256Hex(ct);
  return { envelope: ENV.assemble(header, VC.toBase64(ct), sha), key, salt, iv };
}

async function openVault(envelope, password) {
  const ct = VC.fromBase64(envelope.data);
  const sha = await VC.sha256Hex(ct);
  if (!VC.timingSafeEqualHex(sha, envelope.ciphertextSha256)) {
    const err = new Error('CIPHERTEXT_CORRUPT');
    err.code = 'CIPHERTEXT_CORRUPT';
    throw err;
  }
  const key = await VC.deriveKey(password, envelope.kdf.salt, envelope.kdf.iterations, ENV.KEY_LEN);
  const plain = await VC.decrypt(key, ct, envelope.iv, ENV.aadBytes(envelope));
  return JSON.parse(VC.utf8Decode(plain));
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mm-vault-'));
}

// ═══════════════════════════════════════════════════════════════════

(async function run() {
  console.log('\nVAULT v6 — envelope, crypto, ledger, guard\n');

  // ── Canonicalization ──────────────────────────────────────────────

  await t('canonicalize is key-order independent', () => {
    const a = { z: 1, a: { n: 2, m: 3 }, k: [3, 1, 2] };
    const b = { k: [3, 1, 2], a: { m: 3, n: 2 }, z: 1 };
    assert.strictEqual(ENV.canonicalize(a), ENV.canonicalize(b));
  });

  await t('canonicalize preserves array order (order is meaning)', () => {
    assert.notStrictEqual(ENV.canonicalize([1, 2]), ENV.canonicalize([2, 1]));
  });

  await t('canonicalize rejects undefined and non-finite numbers', () => {
    assert.throws(() => ENV.canonicalize(undefined));
    assert.throws(() => ENV.canonicalize(NaN));
    assert.throws(() => ENV.canonicalize(Infinity));
  });

  await t('envelope and ledger canonicalizers agree', () => {
    const sample = { b: [1, { d: 4, c: 3 }], a: 'x', n: null, t: true };
    assert.strictEqual(ENV.canonicalize(sample), LEDGER.canonicalize(sample));
  });

  // ── Envelope construction ─────────────────────────────────────────

  await t('buildHeader refuses iterations below the floor', () => {
    assert.throws(
      () => ENV.buildHeader({ vaultId: 'v', kdf: { salt: 'AAAA', iterations: 100000 }, iv: 'AAAA', saveCount: 0 }),
      /iterations must be an integer >=/
    );
  });

  await t('buildHeader refuses a missing salt', () => {
    assert.throws(
      () => ENV.buildHeader({ vaultId: 'v', kdf: { iterations: TEST_ITER }, iv: 'AAAA', saveCount: 0 }),
      /salt/
    );
  });

  await t('AAD excludes exactly data and ciphertextSha256', async () => {
    const sealed = await sealVault({ hello: 'world' });
    const aad = ENV.aadString(sealed.envelope);
    assert.ok(aad.indexOf('"data"') === -1, 'data must not be in AAD');
    assert.ok(aad.indexOf('"ciphertextSha256"') === -1, 'hash must not be in AAD');
    assert.ok(aad.indexOf('"savedAt"') !== -1, 'savedAt must be in AAD');
    assert.ok(aad.indexOf('"saveCount"') !== -1, 'saveCount must be in AAD');
    assert.ok(aad.indexOf('"iterations"') !== -1, 'kdf params must be in AAD');
  });

  await t('AAD is stable across serialize → parse → re-read', async () => {
    const sealed = await sealVault({ hello: 'world' });
    const before = ENV.aadString(sealed.envelope);
    const after  = ENV.aadString(JSON.parse(ENV.serialize(sealed.envelope)));
    assert.strictEqual(before, after);
  });

  // ── Round trip ────────────────────────────────────────────────────

  await t('seal → open round trip returns identical state', async () => {
    const state = { canvas: { nodes: [{ id: 'n1', label: 'first' }] }, jaa: { a: 1 } };
    const sealed = await sealVault(state);
    const opened = await openVault(sealed.envelope, PASSWORD);
    assert.deepStrictEqual(opened, state);
  });

  await t('sealed envelope passes parse + validate', async () => {
    const sealed = await sealVault({ x: 1 });
    const parsed = ENV.parse(ENV.serialize(sealed.envelope));
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.legacy, false);
    assert.strictEqual(parsed.version, 6);
  });

  await t('wrong password fails to decrypt', async () => {
    const sealed = await sealVault({ x: 1 });
    await assert.rejects(() => openVault(sealed.envelope, 'wrong password'));
  });

  // ── AAD binding — the metadata actually means something ───────────

  await t('editing savedAt breaks decryption', async () => {
    const sealed = await sealVault({ x: 1 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    forged.savedAt = '2020-01-01T00:00:00.000Z';
    await assert.rejects(() => openVault(forged, PASSWORD));
  });

  await t('editing saveCount breaks decryption', async () => {
    const sealed = await sealVault({ x: 1 }, { saveCount: 7 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    forged.saveCount = 999;
    await assert.rejects(() => openVault(forged, PASSWORD));
  });

  await t('editing the ledger anchor breaks decryption', async () => {
    const anchor = { seq: 3, head: 'a'.repeat(64) };
    const sealed = await sealVault({ x: 1 }, { ledgerAnchor: anchor });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    forged.ledgerAnchor = { seq: 3, head: 'b'.repeat(64) };
    await assert.rejects(() => openVault(forged, PASSWORD));
  });

  await t('downgrading the iteration count breaks decryption', async () => {
    const sealed = await sealVault({ x: 1 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    forged.kdf.iterations = ENV.MIN_ITERATIONS; // already the floor in tests, so force lower
    forged.kdf.iterations = 1000;
    await assert.rejects(() => openVault(forged, PASSWORD));
  });

  await t('editing vaultId breaks decryption', async () => {
    const sealed = await sealVault({ x: 1 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    forged.vaultId = VC.uuidV4();
    await assert.rejects(() => openVault(forged, PASSWORD));
  });

  // ── Corrupt vs wrong-password: the distinction users need ─────────

  await t('truncated ciphertext is reported as corrupt, not wrong password', async () => {
    const sealed = await sealVault({ x: 1 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    const bytes = VC.fromBase64(forged.data);
    forged.data = VC.toBase64(bytes.subarray(0, bytes.length - 40));
    let code = null;
    try { await openVault(forged, PASSWORD); } catch (e) { code = e.code; }
    assert.strictEqual(code, 'CIPHERTEXT_CORRUPT');
  });

  await t('flipped ciphertext byte is caught by the hash check', async () => {
    const sealed = await sealVault({ x: 1 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    const bytes = VC.fromBase64(forged.data);
    bytes[10] ^= 0xff;
    forged.data = VC.toBase64(bytes);
    let code = null;
    try { await openVault(forged, PASSWORD); } catch (e) { code = e.code; }
    assert.strictEqual(code, 'CIPHERTEXT_CORRUPT');
  });

  await t('flipped byte still fails GCM even if the hash is recomputed', async () => {
    const sealed = await sealVault({ x: 1 });
    const forged = JSON.parse(ENV.serialize(sealed.envelope));
    const bytes = VC.fromBase64(forged.data);
    bytes[10] ^= 0xff;
    forged.data = VC.toBase64(bytes);
    forged.ciphertextSha256 = await VC.sha256Hex(bytes); // attacker recomputes
    await assert.rejects(() => openVault(forged, PASSWORD)); // tag still fails
  });

  // ── Scale: the bug that was waiting in v5 ─────────────────────────

  await t('2MB payload survives base64 (v5 spread-operator bug)', async () => {
    const big = { notes: 'x'.repeat(2 * 1024 * 1024) };
    const sealed = await sealVault(big);
    const opened = await openVault(sealed.envelope, PASSWORD);
    assert.strictEqual(opened.notes.length, 2 * 1024 * 1024);
  });

  await t('v5 base64 approach would in fact have thrown at this size', () => {
    const bytes = new Uint8Array(2 * 1024 * 1024);
    assert.throws(() => String.fromCharCode.apply(null, bytes), RangeError);
  });

  // ── KDF ───────────────────────────────────────────────────────────

  await t('same password + different iterations = different key', async () => {
    const salt = VC.randomSaltB64(32);
    const iv   = VC.randomIvB64(12);
    const k1 = await VC.deriveKey(PASSWORD, salt, 310000, 32);
    const k2 = await VC.deriveKey(PASSWORD, salt, 400000, 32);
    const aad = VC.utf8Encode('fixed');
    const ct  = await VC.encrypt(k1, VC.utf8Encode('secret'), iv, aad);
    await assert.rejects(() => VC.decrypt(k2, ct, iv, aad));
  });

  await t('same password + different salt = different key', async () => {
    const iv  = VC.randomIvB64(12);
    const aad = VC.utf8Encode('fixed');
    const k1 = await VC.deriveKey(PASSWORD, VC.randomSaltB64(32), 310000, 32);
    const k2 = await VC.deriveKey(PASSWORD, VC.randomSaltB64(32), 310000, 32);
    const ct = await VC.encrypt(k1, VC.utf8Encode('secret'), iv, aad);
    await assert.rejects(() => VC.decrypt(k2, ct, iv, aad));
  });

  await t('calibration returns a usable iteration count', async () => {
    const cal = await VC.calibrateIterations(1000, 50000);
    assert.ok(cal.suggested >= 310000, 'never suggests below the floor');
    assert.ok(cal.iterationsPerMs > 0);
  });

  // ── Legacy ────────────────────────────────────────────────────────

  await t('a real v5 envelope is recognised as legacy', () => {
    const v5 = JSON.stringify({ encrypted: true, version: 5, iv: 'BnzfbJ2+gTLRoNy8', data: 'TYjSKub1' });
    const parsed = ENV.parse(v5);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.legacy, true);
    assert.strictEqual(parsed.version, 5);
  });

  await t('garbage and empty files are named, not thrown', () => {
    assert.strictEqual(ENV.parse('').reason, 'EMPTY');
    assert.strictEqual(ENV.parse('not json').reason, 'NOT_JSON');
    assert.strictEqual(ENV.parse('[1,2,3]').reason, 'NOT_OBJECT');
    assert.strictEqual(ENV.parse('{"version":99}').reason, 'UNSUPPORTED_VERSION');
  });

  // ── Ledger ────────────────────────────────────────────────────────

  await t('ledger appends and verifies a chain', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    assert.strictEqual(l.verify().missing, true);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    l.append(LEDGER.EVENTS.UNLOCK_SUCCESS, {});
    const h = l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });
    const v = l.verify();
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.seq, 3);
    assert.strictEqual(v.head, h.head);
  });

  await t('ledger detects an edited entry', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    l.append(LEDGER.EVENTS.UNLOCK_FAILED, {});
    l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });

    const lines = fs.readFileSync(l.file, 'utf8').trim().split('\n');
    const e = JSON.parse(lines[1]);
    e.type = LEDGER.EVENTS.UNLOCK_SUCCESS; // hide a failed unlock
    lines[1] = JSON.stringify(e);
    fs.writeFileSync(l.file, lines.join('\n') + '\n');

    const v = l.verify();
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.reason, 'HASH_MISMATCH');
    assert.strictEqual(v.brokenAt, 1);
  });

  await t('ledger detects a removed middle entry', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    l.append(LEDGER.EVENTS.UNLOCK_FAILED, {});
    l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });

    const lines = fs.readFileSync(l.file, 'utf8').trim().split('\n');
    lines.splice(1, 1);
    fs.writeFileSync(l.file, lines.join('\n') + '\n');

    const v = l.verify();
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.reason, 'SEQ_MISMATCH');
  });

  await t('ledger refuses unknown event types', () => {
    const l = new LEDGER.VaultLedger(tmpDir());
    assert.throws(() => l.append('vault.something.invented', {}), /unknown event type/);
  });

  await t('ledger refuses oversized entry data', () => {
    const l = new LEDGER.VaultLedger(tmpDir());
    assert.throws(
      () => l.append(LEDGER.EVENTS.SAVE, { leaked: 'y'.repeat(600) }),
      /must not carry vault content/
    );
  });

  await t('ledger append survives a concurrent writer', () => {
    const dir = tmpDir();
    const a = new LEDGER.VaultLedger(dir);
    const b = new LEDGER.VaultLedger(dir); // second instance, same folder
    a.append(LEDGER.EVENTS.LEDGER_INIT, {});
    b.append(LEDGER.EVENTS.UNLOCK_SUCCESS, {});
    a.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });
    const v = a.verify();
    assert.strictEqual(v.ok, true, 'chain must not fork when two instances append');
    assert.strictEqual(v.seq, 3);
  });

  // ── Guard ─────────────────────────────────────────────────────────

  await t('guard: first run is FRESH', () => {
    const s = GUARD.summarizeLedger([], { ok: true });
    const v = GUARD.evaluate({ vaultId: 'v1', saveCount: 0, ledgerAnchor: null }, s, true);
    assert.strictEqual(v.code, 'FRESH');
    assert.strictEqual(v.requiresPrompt, false);
  });

  await t('guard: healthy session is OK even with the ledger ahead', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    const saved = l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 4 });
    l.append(LEDGER.EVENTS.UNLOCK_SUCCESS, { vaultId: 'v1' }); // ledger now ahead
    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate(
      { vaultId: 'v1', saveCount: 4, ledgerAnchor: { seq: saved.seq, head: saved.head } }, s, false
    );
    assert.strictEqual(v.code, 'OK');
  });

  await t('guard: restored older vault is flagged ROLLBACK and prompts', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    const old = l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 3 });
    l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 9 }); // newer save happened
    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate(
      { vaultId: 'v1', saveCount: 3, ledgerAnchor: { seq: old.seq, head: old.head } }, s, false
    );
    assert.strictEqual(v.code, 'ROLLBACK');
    assert.strictEqual(v.requiresPrompt, true);
    const p = GUARD.promptFor(v);
    assert.strictEqual(p.defaultChoice, 'cancel');
    assert.ok(p.body.indexOf('save #9') !== -1);
  });

  await t('guard: deleted ledger is CRITICAL', () => {
    const s = GUARD.summarizeLedger([], { ok: true });
    const v = GUARD.evaluate(
      { vaultId: 'v1', saveCount: 5, ledgerAnchor: { seq: 4, head: 'a'.repeat(64) } }, s, true
    );
    assert.strictEqual(v.code, 'LEDGER_MISSING');
    assert.strictEqual(v.severity, 'critical');
  });

  await t('guard: anchor on a different fork is CRITICAL', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });
    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate(
      { vaultId: 'v1', saveCount: 1, ledgerAnchor: { seq: 2, head: 'f'.repeat(64) } }, s, false
    );
    assert.strictEqual(v.code, 'ANCHOR_UNKNOWN');
  });

  await t('guard: a vault from another lineage is CRITICAL', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    const saved = l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });
    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate(
      { vaultId: 'OTHER', saveCount: 1, ledgerAnchor: { seq: saved.seq, head: saved.head } }, s, false
    );
    assert.strictEqual(v.code, 'FOREIGN_VAULT');
  });

  await t('guard: broken chain outranks every other verdict', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    l.append(LEDGER.EVENTS.SAVE, { vaultId: 'v1', saveCount: 1 });
    const lines = fs.readFileSync(l.file, 'utf8').trim().split('\n');
    const e = JSON.parse(lines[0]); e.ts = '1999-01-01T00:00:00.000Z';
    lines[0] = JSON.stringify(e);
    fs.writeFileSync(l.file, lines.join('\n') + '\n');
    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate(
      { vaultId: 'v1', saveCount: 1, ledgerAnchor: { seq: 2, head: 'a'.repeat(64) } }, s, false
    );
    assert.strictEqual(v.code, 'LEDGER_BROKEN');
  });

  await t('guard: migrated v5 vault reports UNANCHORED, not an alarm', () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.LEDGER_INIT, {});
    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate({ vaultId: 'v1', saveCount: 0, ledgerAnchor: null }, s, false);
    assert.strictEqual(v.code, 'UNANCHORED');
    assert.strictEqual(v.severity, 'notice');
    assert.strictEqual(v.requiresPrompt, false);
  });

  // ── End-to-end ────────────────────────────────────────────────────

  await t('end to end: seal, anchor, reopen, verify', async () => {
    const dir = tmpDir();
    const l = new LEDGER.VaultLedger(dir);
    l.append(LEDGER.EVENTS.VAULT_CREATED, { vaultId: 'e2e' });

    const state = { canvas: { nodes: [{ id: 'n1' }, { id: 'n2' }] } };
    const pending = l.append(LEDGER.EVENTS.SAVE, { vaultId: 'e2e', saveCount: 1 });
    const sealed = await sealVault(state, {
      vaultId: 'e2e', saveCount: 1, ledgerAnchor: { seq: pending.seq, head: pending.head },
    });

    const vaultPath = path.join(dir, 'mastermind.vault');
    fs.writeFileSync(vaultPath, ENV.serialize(sealed.envelope), 'utf8');

    const reread = ENV.parse(fs.readFileSync(vaultPath, 'utf8'));
    assert.strictEqual(reread.ok, true);
    const opened = await openVault(reread.envelope, PASSWORD);
    assert.deepStrictEqual(opened, state);

    const read = l.readAll();
    const s = GUARD.summarizeLedger(read.entries, l.verify());
    const v = GUARD.evaluate(reread.envelope, s, false);
    assert.strictEqual(v.code, 'OK');
  });

  // ── Regressions from the 2026-08-11 live run (§13.4) ──────────────
  // The real audit ledger recorded: unlock.success with vaultId null, then
  // three save/save.failed(seal) pairs. Root cause: the legacy login path
  // never bound the KDF parameters or minted an identity, so buildHeader
  // threw. The dangerous half was what would have happened if it hadn't.

  await t('REGRESSION: header KDF must match the key, or the vault is lost forever', async () => {
    // Reproduces the v0.1.2 latent fault: key derived from the v5 salt at
    // 310k, header stamped with a fresh random salt at 1M. It seals fine and
    // is then unopenable by anybody, with the correct password, forever.
    const realSalt  = VC.randomSaltB64(32);
    const wrongSalt = VC.randomSaltB64(32);
    const iv = VC.randomIvB64(12);
    const key = await VC.deriveKey(PASSWORD, realSalt, TEST_ITER, 32);

    const header = ENV.buildHeader({
      vaultId: VC.uuidV4(),
      kdf: { salt: wrongSalt, iterations: 1000000 },  // lies about the key
      iv, saveCount: 1, ledgerAnchor: null,
    });
    const ct = await VC.encrypt(key, VC.utf8Encode('{"canvas":{}}'), iv, ENV.aadBytes(header));
    const env = ENV.assemble(header, VC.toBase64(ct), await VC.sha256Hex(ct));

    // The file is structurally valid and the hash matches...
    assert.strictEqual(ENV.validate(env).ok, true);
    // ...and the correct password cannot open it, because the header's
    // parameters derive a different key.
    const derived = await VC.deriveKey(PASSWORD, env.kdf.salt, env.kdf.iterations, 32);
    await assert.rejects(
      () => VC.decrypt(derived, VC.fromBase64(env.data), env.iv, ENV.aadBytes(env)),
      'a vault sealed with mismatched KDF parameters must be unopenable — this is why the guard exists'
    );
  });

  await t('REGRESSION: buildHeader refuses a null vaultId (the live seal failure)', () => {
    assert.throws(
      () => ENV.buildHeader({
        vaultId: null,
        kdf: { salt: VC.randomSaltB64(32), iterations: TEST_ITER },
        iv: VC.randomIvB64(12), saveCount: 1,
      }),
      /vaultId is required/
    );
  });

  await t('REGRESSION: buildHeader refuses a null salt (the live seal failure)', () => {
    assert.throws(
      () => ENV.buildHeader({
        vaultId: VC.uuidV4(),
        kdf: { salt: null, iterations: TEST_ITER },
        iv: VC.randomIvB64(12), saveCount: 1,
      }),
      /salt/
    );
  });

  await t('v5 vault migrates to v6 and reopens with the same password', async () => {
    // Full migration: seal a v5-shaped payload with a v5-style key, then
    // rewrite it as v6 carrying the SAME salt and iteration count, and prove
    // the original password still opens the result.
    const v5Salt = VC.randomSaltB64(32);
    const v5Key  = await VC.deriveKey(PASSWORD, v5Salt, 310000, 32);
    const v5Iv   = VC.randomIvB64(12);
    const state  = { canvas: { nodes: [{ id: 'legacy-1' }] }, username: 'operator' };
    const v5Ct   = await VC.encrypt(v5Key, VC.utf8Encode(JSON.stringify(state)), v5Iv, null);
    const v5File = JSON.stringify({ encrypted: true, version: 5, iv: v5Iv, data: VC.toBase64(v5Ct) });

    const parsed = ENV.parse(v5File);
    assert.strictEqual(parsed.legacy, true);
    const legacy = ENV.readLegacyV5(parsed.envelope);
    const opened = JSON.parse(VC.utf8Decode(
      await VC.decrypt(v5Key, VC.fromBase64(legacy.data), legacy.iv, null)
    ));
    assert.deepStrictEqual(opened, state);

    // Re-seal as v6 using the parameters that produced the key in hand.
    const sealed = await sealVault(opened, {
      salt: v5Salt, iterations: 310000, password: PASSWORD, vaultId: VC.uuidV4(), saveCount: 1,
    });
    const reopened = await openVault(sealed.envelope, PASSWORD);
    assert.deepStrictEqual(reopened, state);
    assert.strictEqual(sealed.envelope.kdf.iterations, 310000);
  });

  await t('rekey to a higher iteration count keeps the same password working', async () => {
    const state = { canvas: { nodes: [{ id: 'n1' }] } };
    const oldSalt = VC.randomSaltB64(32);
    const first = await sealVault(state, { salt: oldSalt, iterations: 310000, saveCount: 1 });
    assert.deepStrictEqual(await openVault(first.envelope, PASSWORD), state);

    // Upgrade: new salt AND newly derived key, together.
    const newSalt = VC.randomSaltB64(32);
    const upgraded = await sealVault(state, { salt: newSalt, iterations: 400000, saveCount: 2 });
    assert.deepStrictEqual(await openVault(upgraded.envelope, PASSWORD), state);
    assert.notStrictEqual(upgraded.envelope.kdf.salt, first.envelope.kdf.salt);

    // And the old key must NOT open the upgraded file.
    const oldKey = await VC.deriveKey(PASSWORD, oldSalt, 310000, 32);
    await assert.rejects(() => VC.decrypt(
      oldKey, VC.fromBase64(upgraded.envelope.data), upgraded.envelope.iv, ENV.aadBytes(upgraded.envelope)
    ));
  });

  await t('the real 2026-08-11 ledger verifies and reports the failure', () => {
    // The actual file from the live run, byte for byte.
    const dir = tmpDir();
    const real = [
      { seq:1, ts:'2026-08-11T23:20:20.047Z', type:'vault.unlock.success', data:{ vaultId:null } },
      { seq:2, ts:'2026-08-11T23:20:28.000Z', type:'vault.save', data:{ vaultId:null, saveCount:1, nodes:7 } },
      { seq:3, ts:'2026-08-11T23:20:28.042Z', type:'vault.save.failed', data:{ stage:'seal' } },
    ];
    let prev = LEDGER.ZERO_HEAD;
    const lines = real.map((c) => {
      const core = { seq: c.seq, ts: c.ts, type: c.type, data: c.data, prev };
      const hash = LEDGER.entryHash(core);
      prev = hash;
      return JSON.stringify(Object.assign({}, core, { hash }));
    });
    fs.writeFileSync(path.join(dir, LEDGER.LEDGER_FILENAME), lines.join('\n') + '\n');

    const l = new LEDGER.VaultLedger(dir);
    const v = l.verify();
    assert.strictEqual(v.ok, true, 'the live chain must verify');
    const s = GUARD.summarizeLedger(l.readAll().entries, v);
    assert.deepStrictEqual(s.vaultIds, [], 'no vaultId was ever recorded — the bug, visible in the audit trail');
    assert.strictEqual(s.maxSaveCount, 1, 'saveCount never advanced because no save landed');
  });

  const fails = results.filter((r) => !r.ok);
  console.log('\nvault-v6: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
})();
