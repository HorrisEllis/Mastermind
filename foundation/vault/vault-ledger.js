// ═══════════════════════════════════════════════════════════════════
// MASTERMIND VAULT AUDIT LEDGER
// foundation/vault/vault-ledger.js
//
// Main process only. Node fs + node crypto. The renderer never touches
// this file directly — it asks over IPC and receives verdicts.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THIS IS FOR
//
// Verifying tampering and unauthorized access. That purpose dictates
// the design, and it rules out the obvious answer:
//
//   An audit log stored INSIDE the vault it audits is worthless.
//   Anyone who can open the vault can rewrite the record of having
//   opened it. Worse, it cannot record a FAILED unlock at all, since
//   a failed unlock never gets the key.
//
// So the ledger lives on disk beside the vault, in the clear, and
// earns its integrity a different way: every entry is hash-chained to
// the one before it, and the head of the chain is sealed into the
// vault's authenticated header (AAD). That gives:
//
//   • Entries cannot be ALTERED     — the chain breaks, detectably.
//   • Entries cannot be REORDERED   — seq and prev both pin position.
//   • Entries cannot be REMOVED     — except from the tail, which the
//                                     vault's anchor then contradicts.
//   • The vault cannot be ROLLED BACK — an older vault carries an
//     older anchor, which the live ledger runs past. This is how
//     rollback gets caught without storing any extra state outside
//     the vault: the ledger IS the outside state, and it was already
//     required for the audit trail.
//
// An attacker CAN delete the whole ledger file. They cannot do it
// quietly: the vault's anchor still names a head that no longer
// exists, and unlock reports LEDGER_MISSING.
//
// ─────────────────────────────────────────────────────────────────
// WHAT MUST NEVER GO IN HERE
//
// This file is plaintext by necessity — it has to be verifiable when
// the vault will NOT open, which is exactly the moment you care. So:
// event types, timestamps, counters, outcomes. Never node content,
// never usernames beyond what the OS already exposes, never key
// material, never anything from inside the encrypted payload.
// appendEntry() enforces a size ceiling per entry as a blunt guard
// against payloads drifting in over time.
//
// UUID: 4a3b2c1d-vault-6000-8000-ledger00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const LEDGER_FILENAME = 'vault.audit.jsonl';
const ZERO_HEAD       = '0'.repeat(64);
const MAX_DATA_BYTES  = 512;

// Event types. Anything not in here is refused — a typo'd event type
// is a hole in an audit trail, so it fails loudly at the call site.
const EVENTS = Object.freeze({
  LEDGER_INIT:        'ledger.init',
  VAULT_CREATED:      'vault.created',
  UNLOCK_SUCCESS:     'vault.unlock.success',
  UNLOCK_FAILED:      'vault.unlock.failed',
  UNLOCK_CORRUPT:     'vault.unlock.corrupt',
  SAVE:               'vault.save',
  SAVE_FAILED:        'vault.save.failed',
  KDF_UPGRADED:       'vault.kdf.upgraded',
  MIGRATED_V5:        'vault.migrated.v5',
  EXPORTED:           'vault.exported',
  BACKUP_RESTORED:    'vault.backup.restored',
  ANCHOR_MISMATCH:    'vault.anchor.mismatch',
  ROLLBACK_ACCEPTED:  'vault.rollback.accepted',
  ROLLBACK_REJECTED:  'vault.rollback.rejected',
  WIPED:              'vault.wiped',
  SESSION_LOCKED:     'vault.session.locked',
  CAPTURE_SESSION_START: 'capture.session.start',
  CAPTURE_SESSION_END:   'capture.session.end',
});
const EVENT_SET = new Set(Object.values(EVENTS));

// ── Canonical JSON — must match vault-envelope.canonicalize ─────────
// Duplicated deliberately: this module runs in the main process with
// no bundler, and an audit chain must not depend on a renderer-side
// file being loadable. The test suite asserts the two agree.

function canonicalize(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonicalize: non-finite number');
    return JSON.stringify(value);
  }
  if (t === 'boolean' || t === 'string') return JSON.stringify(value);
  if (t === 'undefined') throw new Error('canonicalize: undefined is not representable');
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('canonicalize: unsupported type ' + t);
}

// ── Chain math (pure) ───────────────────────────────────────────────

function entryHash(core) {
  return crypto.createHash('sha256').update(canonicalize({
    seq:  core.seq,
    ts:   core.ts,
    type: core.type,
    data: core.data,
    prev: core.prev,
  }), 'utf8').digest('hex');
}

function parseLines(raw) {
  const out = [];
  const lines = String(raw || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push({ lineNo: i + 1, entry: JSON.parse(line) });
    } catch (e) {
      return { ok: false, reason: 'UNPARSEABLE_LINE', lineNo: i + 1, entries: out.map((x) => x.entry) };
    }
  }
  return { ok: true, entries: out.map((x) => x.entry) };
}

// Replays the whole chain. Returns where it broke, not just that it did.
function verifyChain(entries) {
  let prev = ZERO_HEAD;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e || typeof e !== 'object') {
      return { ok: false, reason: 'MALFORMED_ENTRY', brokenAt: i };
    }
    if (e.seq !== i + 1) {
      return { ok: false, reason: 'SEQ_MISMATCH', brokenAt: i, expected: i + 1, found: e.seq };
    }
    if (e.prev !== prev) {
      return { ok: false, reason: 'CHAIN_BROKEN', brokenAt: i, expected: prev, found: e.prev };
    }
    const recomputed = entryHash(e);
    if (recomputed !== e.hash) {
      return { ok: false, reason: 'HASH_MISMATCH', brokenAt: i, expected: recomputed, found: e.hash };
    }
    prev = e.hash;
  }
  return { ok: true, seq: entries.length, head: prev, count: entries.length };
}

function headOf(entries) {
  if (!entries.length) return { seq: 0, head: ZERO_HEAD };
  const last = entries[entries.length - 1];
  return { seq: last.seq, head: last.hash };
}

// Does the chain contain `head` at position `seq`? This is what proves
// an older vault's anchor is a genuine ancestor of the live ledger
// (a rollback) rather than an unrelated fork (a forgery).
function containsAt(entries, seq, head) {
  if (seq === 0) return head === ZERO_HEAD;
  const e = entries[seq - 1];
  return !!e && e.hash === head;
}

// ── Store (impure — fs) ─────────────────────────────────────────────

class VaultLedger {
  constructor(dataDir) {
    if (!dataDir) throw new Error('VaultLedger: dataDir is required');
    this.dataDir = dataDir;
    this.file    = path.join(dataDir, LEDGER_FILENAME);
  }

  exists() {
    try { return fs.existsSync(this.file); } catch (e) { return false; }
  }

  readAll() {
    if (!this.exists()) return { ok: true, entries: [], missing: true };
    let raw;
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      return { ok: false, reason: 'UNREADABLE', message: e.message, entries: [] };
    }
    const parsed = parseLines(raw);
    if (!parsed.ok) return { ok: false, reason: parsed.reason, lineNo: parsed.lineNo, entries: parsed.entries };
    return { ok: true, entries: parsed.entries, missing: false };
  }

  // Full verification pass: parse, replay, report head.
  verify() {
    const read = this.readAll();
    if (!read.ok) {
      return { ok: false, reason: read.reason, message: read.message, seq: 0, head: ZERO_HEAD };
    }
    if (read.missing) {
      return { ok: true, missing: true, seq: 0, head: ZERO_HEAD, count: 0 };
    }
    const chain = verifyChain(read.entries);
    if (!chain.ok) {
      const h = headOf(read.entries);
      return Object.assign({ missing: false, seq: h.seq, head: h.head }, chain);
    }
    return { ok: true, missing: false, seq: chain.seq, head: chain.head, count: chain.count };
  }

  head() {
    const read = this.readAll();
    if (!read.ok) return { seq: 0, head: ZERO_HEAD, degraded: true };
    return headOf(read.entries);
  }

  // Append one entry, fsync'd. Returns the new head.
  //
  // Reads the tail before writing rather than trusting a cached seq:
  // a second app instance appending concurrently must not silently
  // fork the chain. If the file grew under us, the new entry chains
  // onto what is actually there.
  append(type, data) {
    if (!EVENT_SET.has(type)) {
      throw new Error('VaultLedger.append: unknown event type "' + type + '"');
    }
    const payload = data == null ? {} : data;
    const encoded = canonicalize(payload);
    if (Buffer.byteLength(encoded, 'utf8') > MAX_DATA_BYTES) {
      throw new Error('VaultLedger.append: entry data exceeds ' + MAX_DATA_BYTES +
        ' bytes — the audit ledger is plaintext and must not carry vault content');
    }

    fs.mkdirSync(this.dataDir, { recursive: true });

    const read = this.readAll();
    if (!read.ok && read.reason !== 'UNPARSEABLE_LINE') {
      throw new Error('VaultLedger.append: cannot read existing ledger (' + read.reason + ')');
    }
    const tail = headOf(read.entries);

    const core = {
      seq:  tail.seq + 1,
      ts:   new Date().toISOString(),
      type,
      data: payload,
      prev: tail.head,
    };
    const entry = Object.assign({}, core, { hash: entryHash(core) });

    const fd = fs.openSync(this.file, 'a');
    try {
      fs.writeSync(fd, JSON.stringify(entry) + '\n');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    this._fsyncDir();

    return { seq: entry.seq, head: entry.hash, ts: entry.ts };
  }

  // Durability: renaming/appending is not on disk until the directory
  // entry is synced too. Best-effort — some platforms refuse a
  // directory fd, and failing to sync a directory must not lose the
  // append that already succeeded.
  _fsyncDir() {
    let dfd = null;
    try {
      dfd = fs.openSync(this.dataDir, 'r');
      fs.fsyncSync(dfd);
    } catch (e) {
      /* platform does not permit directory fsync — append still landed */
    } finally {
      if (dfd !== null) { try { fs.closeSync(dfd); } catch (e) {} }
    }
  }

  // Read the tail for display. Never used for verification — verify()
  // always replays from genesis.
  recent(n) {
    const read = this.readAll();
    if (!read.ok) return [];
    const count = n || 50;
    return read.entries.slice(-count);
  }
}

module.exports = {
  VaultLedger,
  EVENTS,
  LEDGER_FILENAME,
  ZERO_HEAD,
  MAX_DATA_BYTES,
  canonicalize,
  entryHash,
  verifyChain,
  headOf,
  containsAt,
  parseLines,
};
