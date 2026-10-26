'use strict';

/**
 * BDA Ledger
 * Append-only causal chain. SHA-256 hash-linked entries.
 * Persists to flat JSON-lines file.
 *
 * Entry schema:
 * {
 *   seq:    number       — monotonic sequence number
 *   ts:     number       — unix ms
 *   type:   string       — OBSERVE | REGIME | SESSION | ERROR
 *   role:   string       — 'user' | 'assistant' | 'system'
 *   data:   object       — entry payload
 *   parent: string       — sha256 of previous entry's raw line
 *   hash:   string       — sha256 of this entry (excluding hash field)
 * }
 */

const fs     = require('fs');
const crypto = require('crypto');

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function create(ledgerPath) {
  let entries  = [];
  let lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
  let seq      = 0;

  // Load existing ledger
  if (ledgerPath && fs.existsSync(ledgerPath)) {
    try {
      const lines = fs.readFileSync(ledgerPath, 'utf8')
        .split('\n')
        .filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line);
        entries.push(entry);
        lastHash = entry.hash;
        seq      = entry.seq + 1;
      }
      console.log(`[ledger] loaded ${entries.length} entries from ${ledgerPath}`);
    } catch (err) {
      console.error(`[ledger] load error: ${err.message}`);
    }
  }

  function _write(entry) {
    if (!ledgerPath) return;
    try {
      fs.appendFileSync(ledgerPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      console.error(`[ledger] write error: ${err.message}`);
    }
  }

  function append(type, role, data) {
    const base = {
      seq,
      ts:     Date.now(),
      type,
      role:   role || 'system',
      data,
      parent: lastHash,
    };
    // Hash everything except the hash field itself
    const raw  = JSON.stringify(base);
    const hash = sha256(raw);
    const entry = { ...base, hash };

    entries.push(entry);
    lastHash = hash;
    seq++;

    _write(entry);
    return entry;
  }

  function verify() {
    let prevHash = '0000000000000000000000000000000000000000000000000000000000000000';
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.parent !== prevHash) {
        return { ok: false, at: i, seq: entry.seq, reason: 'parent_mismatch' };
      }
      // Recompute hash
      const { hash, ...base } = entry;
      const computed = sha256(JSON.stringify(base));
      if (computed !== hash) {
        return { ok: false, at: i, seq: entry.seq, reason: 'hash_mismatch' };
      }
      prevHash = hash;
    }
    return { ok: true, entries: entries.length };
  }

  function last(n) {
    return entries.slice(-Math.abs(n));
  }

  function all() {
    return entries.slice();
  }

  function byRole(role) {
    return entries.filter(e => e.role === role);
  }

  function since(ts) {
    return entries.filter(e => e.ts >= ts);
  }

  function summary() {
    return {
      entries: entries.length,
      seq:     seq - 1,
      lastHash,
      roles: {
        user:      entries.filter(e => e.role === 'user').length,
        assistant: entries.filter(e => e.role === 'assistant').length,
        system:    entries.filter(e => e.role === 'system').length,
      },
    };
  }

  return Object.freeze({ append, verify, last, all, byRole, since, summary });
}

module.exports = { create };
