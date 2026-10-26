/**
 * Ledger — append-only event log.
 *
 * Every write operation in rheon produces a ledger entry before returning.
 * §2.1 Persistence is the golden rule.
 * §2.3 All state must be observable.
 * §1.2 Nothing silently fails.
 *
 * Format: one JSON object per line (JSONL), newline-delimited.
 * Ledger is never truncated. clear() is not implemented.
 *
 * Entry shape:
 * {
 *   id:        shortid (8 hex chars)
 *   ts:        wall clock ms (display metadata only — §3.2)
 *   eventTs:   logical time counter (the ordering axis)
 *   type:      string  (namespaced: 'spec.created', 'idea.added', etc.)
 *   source:    string  ('cli' | 'api' | 'internal')
 *   payload:   object  (operation-specific data)
 *   outcome:   'ok' | 'error'
 *   error?:    string  (present when outcome === 'error')
 * }
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

let _logicalClock = 0;

function shortid() {
  return crypto.randomBytes(4).toString('hex');
}

function nextEventTs() {
  return ++_logicalClock;
}

export class Ledger {
  /**
   * @param {string} filePath — path to the .jsonl file
   */
  constructor(filePath) {
    this.filePath = filePath;
    this._ensureFile();
  }

  _ensureFile() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, '', 'utf8');
    }
  }

  /**
   * Append one entry to the ledger.
   * Throws loudly on write failure — §1.2.
   *
   * @param {object} params
   * @param {string} params.type    — event type namespaced string
   * @param {string} params.source  — 'cli' | 'api' | 'internal'
   * @param {object} params.payload — operation data
   * @param {'ok'|'error'} params.outcome
   * @param {string} [params.error] — error message if outcome === 'error'
   * @returns {object} the written entry
   */
  append({ type, source, payload, outcome, error }) {
    const entry = {
      id:       shortid(),
      ts:       Date.now(),
      eventTs:  nextEventTs(),
      type,
      source,
      payload,
      outcome,
    };
    if (error !== undefined) entry.error = error;

    try {
      fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (err) {
      // §1.2 — cannot silently fail
      throw new Error(
        `[Ledger] WRITE FAILURE — file=${this.filePath} type=${type} cause=${err.message}`
      );
    }

    return entry;
  }

  /**
   * Read all entries. Returns array, oldest first.
   * @returns {object[]}
   */
  readAll() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch (err) {
      throw new Error(
        `[Ledger] READ FAILURE — file=${this.filePath} cause=${err.message}`
      );
    }
  }

  /**
   * Read last N entries (tail).
   * @param {number} n
   * @returns {object[]}
   */
  tail(n = 20) {
    const all = this.readAll();
    return all.slice(-n);
  }

  /**
   * Filter entries by type prefix.
   * e.g. filter('spec.') returns all spec.* entries
   * @param {string} prefix
   * @returns {object[]}
   */
  filter(prefix) {
    return this.readAll().filter(e => e.type.startsWith(prefix));
  }

  /**
   * Count of all entries.
   * @returns {number}
   */
  count() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return raw.split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }
}
