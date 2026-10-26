'use strict';
// ═══════════════════════════════════════════════════════════════════
// SNAPSHOTS + BOOT SEQUENCE
//
// Snapshots run against a real directory with real files. The boot
// sequence is pure over injected probes, so every branch — including
// the ones that need a deleted vault or a corrupt ledger — is reachable
// without staging a disaster.
//
// The restore tests are the ones that matter. A backup nobody has ever
// restored is a hypothesis.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const ENV  = require('../foundation/vault/vault-envelope.js');
const VC   = require('../foundation/vault/vault-crypto.js');
const SNAP = require('../foundation/vault/vault-snapshots.js');
const BOOT = require('../foundation/vault/vault-boot.js');

const results = [];
async function t(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('  \u2713 ' + name + ' (' + (Date.now() - start) + 'ms)');
  } catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.stack || e.message).split('\n').join('\n      '));
  }
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mm-snap-'));

async function makeVault(dir, saveCount) {
  const salt = VC.randomSaltB64(32);
  const iv   = VC.randomIvB64(12);
  const key  = await VC.deriveKey('pw', salt, ENV.MIN_ITERATIONS, 32);
  const header = ENV.buildHeader({
    vaultId: 'test-vault', kdf: { salt, iterations: ENV.MIN_ITERATIONS },
    iv, saveCount: saveCount || 1, ledgerAnchor: null,
  });
  const ct = await VC.encrypt(key, VC.utf8Encode(JSON.stringify({ n: saveCount || 1 })), iv, ENV.aadBytes(header));
  const payload = ENV.serialize(ENV.assemble(header, VC.toBase64(ct), await VC.sha256Hex(ct)));
  const p = path.join(dir, 'mastermind.vault');
  fs.writeFileSync(p, payload);
  return p;
}

// Probe bundle for a healthy system; individual tests override one field.
const healthy = (over) => Object.assign({
  hasNXAPI: true, dataDir: '/data', cryptoAvailable: true, cryptoRoundTrip: true, kdfMs: 90,
  vaultExists: true, vaultBytes: 4096, parseOk: true, legacy: false, kdfIterations: 1000000,
  ciphertextIntact: true,
  ledgerMissing: false, ledgerChainOk: true, ledgerSeq: 12, unlockFailures: 0, vaultAnchored: true,
  snapshotCount: 5, newestSnapshotVerified: true, newestSnapshotAgeHours: 2,
  watcherArmed: true,
}, over || {});

(async function run() {
  console.log('\nSNAPSHOTS + BOOT\n');

  // ── Snapshots ─────────────────────────────────────────────────────

  await t('create → snapshot exists, verifies, and carries its hash in the name', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    const res = s.create('test');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.skipped, false);
    const v = s.verify(res.name);
    assert.strictEqual(v.ok, true);
    assert.strictEqual(v.saveCount, 1);
    assert.ok(res.name.includes(res.sha256.slice(0, 12)), 'the hash must be in the filename');
  });

  await t('creating twice from unchanged contents does not duplicate', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    const a = s.create();
    const b = s.create();
    assert.strictEqual(b.skipped, true);
    assert.strictEqual(b.name, a.name);
    assert.strictEqual(s.list().length, 1);
  });

  await t('a tampered snapshot fails verification', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    const res = s.create();
    const f = path.join(s.dir, res.name);
    const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
    raw.saveCount = 999;
    fs.writeFileSync(f, JSON.stringify(raw, null, 2));
    const v = s.verify(res.name);
    assert.strictEqual(v.ok, false);
    assert.strictEqual(v.reason, 'HASH_MISMATCH');
  });

  await t('restore brings back the older vault byte for byte', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    const snap = s.create();
    const original = fs.readFileSync(vp, 'utf8');

    await makeVault(dir, 2);                       // vault moves on
    assert.notStrictEqual(fs.readFileSync(vp, 'utf8'), original);

    const res = s.restore(snap.name);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(fs.readFileSync(vp, 'utf8'), original);
  });

  await t('restore is itself reversible — the replaced vault is snapshotted first', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    const old = s.create();
    const newer = await makeVault(dir, 2);
    const newerContent = fs.readFileSync(newer, 'utf8');

    const res = s.restore(old.name);
    assert.ok(res.priorSnapshot, 'the vault being replaced must be snapshotted');
    // Undo the restore.
    const undo = s.restore(res.priorSnapshot);
    assert.strictEqual(undo.ok, true);
    assert.strictEqual(fs.readFileSync(vp, 'utf8'), newerContent);
  });

  await t('restore REFUSES a snapshot that fails verification', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    const snap = s.create();
    fs.appendFileSync(path.join(s.dir, snap.name), ' ');   // one byte
    const res = s.restore(snap.name);
    assert.strictEqual(res.ok, false);
    assert.ok(/Refusing to restore/.test(res.message));
  });

  await t('prune never removes the newest or the last one', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    s.create();
    const before = s.list();
    const res = s.prune({ recent: 1, daily: 0, weekly: 0 });
    assert.strictEqual(res.removed.length, 0);
    assert.strictEqual(s.list().length, before.length);
  });

  await t('prune keeps the recent window and drops the rest', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    s._ensureDir();
    // Fabricate 20 snapshots across 20 days, correctly named and hashed.
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      const body = JSON.stringify({ format: 'mastermind-vault', version: 6, saveCount: i });
      const h = SNAP.sha256(Buffer.from(body, 'utf8')).slice(0, 12);
      const d = new Date(now - i * 86400000);
      const stamp = d.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
      fs.writeFileSync(path.join(s.dir, `${stamp}-save${i}-${h}.vault`), body);
    }
    assert.strictEqual(s.list().length, 20);
    const res = s.prune({ recent: 3, daily: 0, weekly: 0 });
    assert.ok(res.removed.length > 0, 'old snapshots should be pruned');
    const kept = s.list();
    assert.ok(kept.length >= 3);
    assert.strictEqual(kept[0].saveCount, 0, 'the newest must survive');
  });

  await t('status reports count, age and verification of the newest', async () => {
    const dir = tmpDir();
    const vp = await makeVault(dir, 1);
    const s = new SNAP.VaultSnapshots(dir, vp);
    s.create();
    const st = s.status();
    assert.strictEqual(st.count, 1);
    assert.strictEqual(st.newestVerified, true);
    assert.ok(st.ageHours < 1);
  });

  await t('snapshotting a missing vault fails cleanly', () => {
    const dir = tmpDir();
    const s = new SNAP.VaultSnapshots(dir, path.join(dir, 'mastermind.vault'));
    const res = s.create();
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.reason, 'NO_VAULT');
  });

  // ── Boot sequence ─────────────────────────────────────────────────

  await t('a healthy system passes every check', () => {
    const r = BOOT.run(healthy());
    assert.strictEqual(r.canProceed, true);
    assert.strictEqual(r.worst, 'pass');
    assert.strictEqual(r.blocking.length, 0);
  });

  await t('no runtime is CRITICAL', () => {
    const r = BOOT.run(healthy({ hasNXAPI: false }));
    assert.strictEqual(r.canProceed, false);
    assert.strictEqual(r.blocking[0].id, 'runtime');
  });

  await t('a failed crypto round trip blocks boot even when WebCrypto exists', () => {
    const r = BOOT.run(healthy({ cryptoAvailable: true, cryptoRoundTrip: false }));
    assert.strictEqual(r.canProceed, false);
    const s = r.steps.find(x => x.id === 'crypto');
    assert.strictEqual(s.status, 'critical');
    assert.ok(/round trip FAILED/.test(s.detail));
  });

  await t('a deleted vault with snapshots offers restore', () => {
    const r = BOOT.run(healthy({ vaultExists: false, snapshotCount: 4 }));
    assert.strictEqual(r.canProceed, false);
    const s = r.steps.find(x => x.id === 'vault_file');
    assert.ok(/MISSING/.test(s.detail));
    assert.ok(/Restore/.test(s.remedy));
  });

  await t('a deleted vault with NO snapshots says so plainly', () => {
    const r = BOOT.run(healthy({ vaultExists: false, snapshotCount: 0 }));
    const s = r.steps.find(x => x.id === 'vault_file');
    assert.ok(/no snapshots/i.test(s.detail));
    assert.ok(/Create a new vault/.test(s.remedy));
  });

  await t('a damaged ciphertext blocks boot and does not blame the password', () => {
    const r = BOOT.run(healthy({ ciphertextIntact: false }));
    assert.strictEqual(r.canProceed, false);
    const s = r.steps.find(x => x.id === 'integrity');
    assert.ok(/not a password problem/.test(s.detail));
  });

  await t('a broken audit chain blocks boot', () => {
    const r = BOOT.run(healthy({ ledgerChainOk: false, ledgerReason: 'HASH_MISMATCH' }));
    assert.strictEqual(r.canProceed, false);
    assert.strictEqual(r.steps.find(x => x.id === 'ledger').status, 'critical');
  });

  await t('a missing ledger under an anchored vault blocks boot', () => {
    const r = BOOT.run(healthy({ ledgerMissing: true, vaultAnchored: true }));
    assert.strictEqual(r.canProceed, false);
  });

  await t('a missing ledger under an unanchored vault is only a notice', () => {
    const r = BOOT.run(healthy({ ledgerMissing: true, vaultAnchored: false }));
    assert.strictEqual(r.canProceed, true);
    assert.strictEqual(r.steps.find(x => x.id === 'ledger').status, 'notice');
  });

  await t('no snapshots warns but does not block', () => {
    const r = BOOT.run(healthy({ snapshotCount: 0 }));
    assert.strictEqual(r.canProceed, true);
    assert.strictEqual(r.steps.find(x => x.id === 'snapshots').status, 'warn');
  });

  await t('an unverifiable newest snapshot warns and points at older ones', () => {
    const r = BOOT.run(healthy({ newestSnapshotVerified: false, newestSnapshotProblem: 'hash mismatch' }));
    const s = r.steps.find(x => x.id === 'snapshots');
    assert.strictEqual(s.status, 'warn');
    assert.ok(/Older snapshots/.test(s.detail));
  });

  await t('an unarmed watcher warns', () => {
    const r = BOOT.run(healthy({ watcherArmed: false }));
    assert.strictEqual(r.canProceed, true);
    assert.strictEqual(r.steps.find(x => x.id === 'watcher').status, 'warn');
  });

  await t('multiple problems are ALL reported, not just the first', () => {
    const r = BOOT.run(healthy({ vaultExists: false, snapshotCount: 0, ledgerChainOk: false, watcherArmed: false }));
    assert.ok(r.blocking.length >= 2, 'both the missing vault and the broken chain must appear');
    assert.ok(r.warnings.length >= 1);
  });

  await t('a v5 vault boots with notices, not alarms', () => {
    const r = BOOT.run(healthy({ legacy: true, ciphertextIntact: false, kdfIterations: null }));
    assert.strictEqual(r.canProceed, true);
    assert.strictEqual(r.steps.find(x => x.id === 'vault_format').status, 'notice');
    assert.strictEqual(r.steps.find(x => x.id === 'integrity').status, 'notice');
  });

  await t('a check that throws is reported, not swallowed', () => {
    const broken = { id: 'boom', label: 'Boom', run: () => { throw new Error('kaboom'); } };
    BOOT.CHECKS.push(broken);
    try {
      const r = BOOT.run(healthy());
      const s = r.steps.find(x => x.id === 'boom');
      assert.strictEqual(s.status, 'critical');
      assert.ok(/kaboom/.test(s.detail));
    } finally {
      BOOT.CHECKS.pop();
    }
  });

  const fails = results.filter(r => !r.ok);
  console.log('\nsnapshots+boot: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
})();
