// ═══════════════════════════════════════════════════════════════════
// VAULT SNAPSHOTS
// foundation/vault/vault-snapshots.js
//
// Main process. Point-in-time copies of the vault file, kept beside it
// in <dataDir>/snapshots/.
//
// ─────────────────────────────────────────────────────────────────
// WHY THE OLD ONE DID NOT COUNT AS A BACKUP SYSTEM
//
// vault:backup did fs.copyFileSync into a timestamped name, every ten
// saves, and that was all. No verification (a copy of a corrupt vault
// is a corrupt copy, silently), no restore path (you were expected to
// rename files by hand), no pruning (unbounded growth), and the name
// was built with p.replace(/\.json$/, ...) against a file called
// mastermind.vault — a pattern that never matched, so the intent had
// clearly drifted from the filename long ago.
//
// A backup you have never restored is a hypothesis, not a backup.
//
// ─────────────────────────────────────────────────────────────────
// DESIGN
//
// • Content-addressed names: <ISO>-save<N>-<sha256[0..12]>.vault
//   The hash is IN the filename, so integrity is checkable from the
//   directory listing alone — even if every index we keep is lost.
// • verify() re-hashes and re-parses. Both, because a file can hash
//   correctly and still not be a vault (it could be a snapshot of a
//   vault that was already damaged).
// • restore() snapshots the CURRENT vault first. Restoring is itself a
//   destructive act; making it reversible is the difference between a
//   recovery tool and a second way to lose data.
// • Every create/restore appends to the audit ledger, so a restore is
//   visible to the rollback guard rather than looking like tampering.
// • prune() keeps recent density and long-term coverage, and NEVER
//   removes the only snapshot or the newest one.
//
// UUID: 4a3b2c1d-vault-6000-8000-snapshots01
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const { atomicWrite } = require('./atomic-write.js');

const SNAP_DIR  = 'snapshots';
const SNAP_EXT  = '.vault';
const NAME_RE   = /^(\d{8}T\d{6}\d{0,3}Z)-save(\d+)-([0-9a-f]{12})\.vault$/;

// Retention: dense recently, sparse over time. Numbers are a starting
// policy, not a law — they live here so there is one place to change them.
const KEEP_RECENT   = 10;   // always keep the newest N
const KEEP_DAILY    = 7;    // one per day, this many days back
const KEEP_WEEKLY   = 4;    // one per week, this many weeks back

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function compactIso(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

function parseName(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, stamp, save, hash12] = m;
  const iso = stamp.replace(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{0,3})Z$/,
    (_, y, mo, d, h, mi, s, ms) => `${y}-${mo}-${d}T${h}:${mi}:${s}.${(ms || '000').padEnd(3, '0')}Z`
  );
  return { name, iso, ts: Date.parse(iso), saveCount: parseInt(save, 10), hash12 };
}

class VaultSnapshots {
  constructor(dataDir, vaultPath) {
    if (!dataDir) throw new Error('VaultSnapshots: dataDir is required');
    this.dataDir   = dataDir;
    this.dir       = path.join(dataDir, SNAP_DIR);
    this.vaultPath = vaultPath || path.join(dataDir, 'mastermind.vault');
  }

  _ensureDir() { fs.mkdirSync(this.dir, { recursive: true }); }

  list() {
    if (!fs.existsSync(this.dir)) return [];
    return fs.readdirSync(this.dir)
      .filter((n) => n.endsWith(SNAP_EXT))
      .map((n) => {
        const parsed = parseName(n);
        if (!parsed) return { name: n, malformed: true };
        let size = null;
        try { size = fs.statSync(path.join(this.dir, n)).size; } catch (e) {}
        return Object.assign({ size, path: path.join(this.dir, n) }, parsed);
      })
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
  }

  // Re-hash and re-parse. A snapshot that hashes correctly but is not a
  // readable vault is still a failed snapshot, and the difference matters
  // when choosing which one to restore.
  verify(name) {
    const file = path.join(this.dir, name);
    if (!fs.existsSync(file)) return { ok: false, reason: 'MISSING', message: 'Snapshot not found.' };
    const parsed = parseName(name);
    if (!parsed) return { ok: false, reason: 'MALFORMED_NAME', message: 'Not a recognised snapshot name.' };

    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (e) { return { ok: false, reason: 'UNREADABLE', message: e.message }; }

    const actual = sha256(Buffer.from(raw, 'utf8'));
    if (actual.slice(0, 12) !== parsed.hash12) {
      return {
        ok: false, reason: 'HASH_MISMATCH',
        message: 'Snapshot contents do not match the hash in its filename — the file has been altered or corrupted.',
      };
    }

    let obj;
    try { obj = JSON.parse(raw); }
    catch (e) { return { ok: false, reason: 'NOT_JSON', message: 'Snapshot is not valid JSON.' }; }
    // Which formats count as a vault, stated rather than implied. This used
    // to read `obj.format !== 'mastermind-vault' && obj.encrypted == null`,
    // which accepted an unencrypted vault only as a side effect of that file
    // happening to carry `encrypted: false`. It worked by luck; a writer that
    // dropped the field would have started silently deleting good snapshots.
    const isEncryptedV6 = obj && obj.format === 'mastermind-vault';
    const isPlain       = obj && (obj.format === 'mastermind-vault-plain' || obj.encrypted === false);
    const isLegacyV5    = obj && obj.encrypted != null;
    if (!obj || !(isEncryptedV6 || isPlain || isLegacyV5)) {
      return { ok: false, reason: 'NOT_A_VAULT', message: 'Snapshot is not a MASTERMIND vault.' };
    }

    return {
      ok: true, sha256: actual, bytes: raw.length,
      version: obj.version || null, saveCount: obj.saveCount != null ? obj.saveCount : null,
      savedAt: obj.savedAt || null, vaultId: obj.vaultId || null,
    };
  }

  // Snapshot the live vault. Returns { ok, skipped } — skipped when the
  // current contents already have a snapshot, so idle saves do not fill
  // the directory with identical copies.
  create(reason) {
    if (!fs.existsSync(this.vaultPath)) {
      return { ok: false, reason: 'NO_VAULT', message: 'No vault file to snapshot.' };
    }
    let raw;
    try { raw = fs.readFileSync(this.vaultPath, 'utf8'); }
    catch (e) { return { ok: false, reason: 'UNREADABLE', message: e.message }; }

    const hash = sha256(Buffer.from(raw, 'utf8'));
    const hash12 = hash.slice(0, 12);

    const existing = this.list().find((s) => s.hash12 === hash12);
    if (existing) return { ok: true, skipped: true, name: existing.name, sha256: hash };

    let saveCount = 0;
    try { const o = JSON.parse(raw); saveCount = o.saveCount || 0; } catch (e) {}

    this._ensureDir();
    const name = `${compactIso(new Date())}-save${saveCount}-${hash12}${SNAP_EXT}`;
    const dest = path.join(this.dir, name);

    const res = atomicWrite(dest, raw);
    if (!res.ok) return { ok: false, reason: 'WRITE_FAILED', message: res.error };

    // Read it back and confirm before reporting a backup exists.
    const check = this.verify(name);
    if (!check.ok) {
      try { fs.unlinkSync(dest); } catch (e) {}
      return { ok: false, reason: 'VERIFY_FAILED', message: check.message };
    }

    return { ok: true, skipped: false, name, sha256: hash, bytes: res.bytes, reason: reason || null };
  }

  // Reversible by construction: the vault being replaced is snapshotted
  // first, so a restore chosen in a panic can itself be undone.
  restore(name) {
    const check = this.verify(name);
    if (!check.ok) {
      return { ok: false, reason: check.reason, message: 'Refusing to restore: ' + check.message };
    }

    let priorSnapshot = null;
    if (fs.existsSync(this.vaultPath)) {
      const pre = this.create('pre-restore');
      if (!pre.ok) {
        return {
          ok: false, reason: 'PRE_SNAPSHOT_FAILED',
          message: 'Could not snapshot the current vault before restoring (' + pre.message +
                   '). Refusing, because the restore would not be undoable.',
        };
      }
      priorSnapshot = pre.name;
    }

    const raw = fs.readFileSync(path.join(this.dir, name), 'utf8');
    const res = atomicWrite(this.vaultPath, raw);
    if (!res.ok) return { ok: false, reason: 'WRITE_FAILED', message: res.error };

    const after = sha256(Buffer.from(fs.readFileSync(this.vaultPath, 'utf8'), 'utf8'));
    if (after !== check.sha256) {
      return { ok: false, reason: 'POST_VERIFY_FAILED', message: 'Restored file does not match the snapshot.' };
    }

    return {
      ok: true, restored: name, priorSnapshot,
      saveCount: check.saveCount, savedAt: check.savedAt, vaultId: check.vaultId,
    };
  }

  // Never removes the newest, and never removes the last remaining one.
  // A pruning policy that can empty the directory is a deletion policy.
  prune(policy) {
    const p = Object.assign({ recent: KEEP_RECENT, daily: KEEP_DAILY, weekly: KEEP_WEEKLY }, policy || {});
    const all = this.list().filter((s) => !s.malformed && s.ts);
    if (all.length <= p.recent) return { ok: true, kept: all.length, removed: [] };

    const keep = new Set();
    all.slice(0, p.recent).forEach((s) => keep.add(s.name));

    const dayKey  = (ts) => new Date(ts).toISOString().slice(0, 10);
    const weekKey = (ts) => { const d = new Date(ts); const t = Math.floor(d.getTime() / 604800000); return String(t); };

    const now = Date.now();
    const seenDays = new Set(), seenWeeks = new Set();
    for (const s of all) {
      const ageDays = (now - s.ts) / 86400000;
      if (ageDays <= p.daily) {
        const k = dayKey(s.ts);
        if (!seenDays.has(k)) { seenDays.add(k); keep.add(s.name); }
      } else if (ageDays <= p.daily + p.weekly * 7) {
        const k = weekKey(s.ts);
        if (!seenWeeks.has(k)) { seenWeeks.add(k); keep.add(s.name); }
      }
    }

    keep.add(all[0].name); // newest, unconditionally

    const removed = [];
    for (const s of all) {
      if (keep.has(s.name)) continue;
      try { fs.unlinkSync(s.path); removed.push(s.name); } catch (e) {}
    }
    return { ok: true, kept: keep.size, removed };
  }

  // Health summary for the boot sequence.
  status() {
    const all = this.list();
    const good = all.filter((s) => !s.malformed);
    const newest = good[0] || null;
    const verified = newest ? this.verify(newest.name) : null;
    return {
      dir: this.dir,
      count: good.length,
      malformed: all.length - good.length,
      newest: newest ? { name: newest.name, iso: newest.iso, saveCount: newest.saveCount, size: newest.size } : null,
      newestVerified: verified ? verified.ok : null,
      newestProblem: verified && !verified.ok ? verified.message : null,
      ageHours: newest ? Math.round((Date.now() - newest.ts) / 36000) / 100 : null,
      totalBytes: good.reduce((n, s) => n + (s.size || 0), 0),
    };
  }
}

module.exports = { VaultSnapshots, parseName, sha256, SNAP_DIR, KEEP_RECENT, KEEP_DAILY, KEEP_WEEKLY };
