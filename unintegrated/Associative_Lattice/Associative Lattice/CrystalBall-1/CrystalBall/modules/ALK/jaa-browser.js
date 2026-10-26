/**
 * jaa-browser.js — Jaa persistence + query layer, browser port
 * @author  Jonathan Bailey (architecture) / ALK browser adaptation
 * @version 1.0.0
 *
 * Provides:
 *   JaaStore  — content-addressed MemoryStore (same contract as Jaa's MemoryStore)
 *   JaaRefs   — named references (same contract as MemoryRefs)
 *   JaaDB     — IndexedDB-backed persistent store + simple SQL-like query surface
 *   JaaLog    — SISO-gated debug/event log with IndexedDB archival
 *
 * Architecture: each operation is a SISO Gate transformation.
 * The bus records every put/get/query in the StreamLog.
 * The debug panel reads directly from JaaLog.
 */

'use strict';

import { SISOBus, StreamLog } from './siso.js';

// ── FNV-1a hash (same algo as Jaa's MemoryStore) ─────────────────────────────
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function canonicalize(obj) {
  // Stable JSON serialization regardless of key order
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

// ── JaaStore — content-addressed in-memory store ──────────────────────────────
export class JaaStore {
  constructor() { this._data = new Map(); }

  put(obj) {
    const canonical = canonicalize(obj);
    const hash = fnv1a(canonical);
    this._data.set(hash, obj);
    return hash;
  }

  get(hash) { return this._data.get(hash) ?? null; }
  has(hash) { return this._data.has(hash); }
  size()    { return this._data.size; }
  clear()   { this._data.clear(); }

  // Iterate all objects matching a predicate
  scan(predFn) {
    const results = [];
    for (const [, obj] of this._data) { if (predFn(obj)) results.push(obj); }
    return results;
  }
}

// ── JaaRefs — named references into the store ─────────────────────────────────
export class JaaRefs {
  constructor() { this._refs = new Map(); }
  set(name, hash)  { this._refs.set(name, hash); }
  get(name)        { return this._refs.get(name) ?? null; }
  has(name)        { return this._refs.has(name); }
  delete(name)     { this._refs.delete(name); }
  list(prefix = '') {
    const out = [];
    for (const [k] of this._refs) { if (k.startsWith(prefix)) out.push(k); }
    return out;
  }
  clear()          { this._refs.clear(); }
}

// ── JaaDB — IndexedDB-backed named table store ────────────────────────────────
// Simple table model: each table is an IndexedDB object store.
// Rows are plain objects. Queries are JS predicates (no SQL parser needed in browser).
// For full SQL, route events to the server-side Jaa via fetch.

export class JaaDB {
  constructor(dbName = 'alk-jaa', version = 1) {
    this._name    = dbName;
    this._version = version;
    this._db      = null;
    this._ready   = this._open();
  }

  async _open() {
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._name, this._version);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        // Core tables
        for (const table of ['events', 'debug_log', 'attractor_maps', 'session_log', 'landmark_log']) {
          if (!db.objectStoreNames.contains(table)) {
            const store = db.createObjectStore(table, { keyPath: 'id', autoIncrement: true });
            if (table === 'events')       store.createIndex('type',      'type',      { unique: false });
            if (table === 'debug_log')    store.createIndex('level',     'level',     { unique: false });
            if (table === 'session_log')  store.createIndex('sessionId', 'sessionId', { unique: false });
            if (table === 'landmark_log') store.createIndex('frameIndex','frameIndex',{ unique: false });
          }
        }
      };
      req.onsuccess  = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror    = (e) => { console.warn('[JaaDB] open failed:', e.target.error); resolve(null); };
    });
  }

  async insert(table, row) {
    await this._ready;
    if (!this._db) return null;
    return new Promise((resolve) => {
      const tx  = this._db.transaction(table, 'readwrite');
      const req = tx.objectStore(table).add({ ...row, _ts: Date.now() });
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = () => resolve(null);
    });
  }

  async query(table, predFn = () => true, limit = 500) {
    await this._ready;
    if (!this._db) return [];
    return new Promise((resolve) => {
      const tx      = this._db.transaction(table, 'readonly');
      const req     = tx.objectStore(table).getAll();
      req.onsuccess = (e) => resolve((e.target.result ?? []).filter(predFn).slice(-limit));
      req.onerror   = () => resolve([]);
    });
  }

  async count(table) {
    await this._ready;
    if (!this._db) return 0;
    return new Promise((resolve) => {
      const tx  = this._db.transaction(table, 'readonly');
      const req = tx.objectStore(table).count();
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror   = () => resolve(0);
    });
  }

  async clear(table) {
    await this._ready;
    if (!this._db) return;
    return new Promise((resolve) => {
      const tx = this._db.transaction(table, 'readwrite');
      tx.objectStore(table).clear();
      tx.oncomplete = resolve;
    });
  }

  async clearAll() {
    for (const t of ['events','debug_log','session_log','landmark_log']) {
      await this.clear(t);
    }
  }
}

// ── JaaLog — SISO-gated debug/event log ───────────────────────────────────────
// Subscribes to the ALK bus. Every event → logged row in JaaDB.
// Levels: OFF | EVENTS | DEEP | DATA
// The debug panel reads from JaaLog directly — no more manual console.log hunting.

export class JaaLog {
  constructor({ bus, db, level = 'EVENTS', maxMemory = 2000 } = {}) {
    this._bus     = bus;
    this._db      = db;
    this._level   = level;
    this._memory  = [];       // fast in-memory ring for debug panel
    this._maxMem  = maxMemory;
    this._seq     = 0;
    this._persist = level === 'DATA'; // only persist at DATA level
    this._stats   = { total: 0, persisted: 0, errors: 0 };

    // Special high-interest event types that always get logged
    this._always = new Set([
      'alk.session.capture.start', 'alk.session.capture.stop',
      'alk.expression.micro', 'alk.suppression.event', 'alk.suppression.pattern',
      'alk.latent.shift', 'alk.landscape.insight', 'alk.trajectory.bifurcation',
      'alk.signal.transition',
    ]);

    if (bus) this._bindBus();
  }

  _bindBus() {
    this._bus.on('**', (payload) => {
      // The bus routes data not the event object — we need type from context
      // So we intercept via the bus's log instead
    });

    // Better: wrap bus.emit to intercept before routing
    const origEmit = this._bus.emit.bind(this._bus);
    this._bus.emit = (type, data, meta) => {
      this._record(type, data);
      return origEmit(type, data, meta);
    };
  }

  _record(type, data) {
    if (this._level === 'OFF') return;
    this._stats.total++;
    this._seq++;

    const entry = {
      seq:     this._seq,
      ts:      Date.now(),
      type,
      level:   this._classifyLevel(type, data),
    };

    if (this._level === 'DATA' || this._always.has(type)) {
      entry.data = data;
    }

    // Memory ring
    this._memory.push(entry);
    if (this._memory.length > this._maxMem) this._memory.shift();

    // Persist high-interest events to IndexedDB
    if (this._db && (this._always.has(type) || this._persist)) {
      this._db.insert('debug_log', { type, level: entry.level, data: this._always.has(type) ? data : null })
        .then(() => this._stats.persisted++)
        .catch(() => this._stats.errors++);
    }
  }

  _classifyLevel(type, data) {
    if (type.includes('error') || type.includes('fail')) return 'ERROR';
    if (type.includes('micro') || type.includes('suppression') || type.includes('bifurcation')) return 'SIGNAL';
    if (type.includes('session') || type.includes('landscape')) return 'SESSION';
    if (type.includes('frame') || type.includes('landmark')) return 'FRAME';
    return 'EVENT';
  }

  /** Get memory log entries, optionally filtered */
  getEntries({ type = null, level = null, tail = 200 } = {}) {
    let entries = this._memory.slice(-tail);
    if (type)  entries = entries.filter(e => e.type.includes(type));
    if (level) entries = entries.filter(e => e.level === level);
    return entries;
  }

  /** Set log level at runtime */
  setLevel(level) {
    this._level  = level;
    this._persist = level === 'DATA';
  }

  get level()  { return this._level; }
  get stats()  { return { ...this._stats }; }
  get memory() { return this._memory; }

  clearMemory() { this._memory = []; this._seq = 0; }
}

// ── JaaSession — session-level event recording ────────────────────────────────
// Records a structured log of the session for replay/analysis

export class JaaSession {
  constructor({ db, sessionId } = {}) {
    this._db        = db;
    this._sessionId = sessionId;
    this._rows      = [];
    this._open      = false;
  }

  start(sessionId) {
    this._sessionId = sessionId;
    this._open      = true;
    this._rows      = [];
    if (this._db) {
      this._db.insert('session_log', { sessionId, event: 'START', data: { ts: Date.now() } });
    }
  }

  record(event, data) {
    if (!this._open) return;
    const row = { sessionId: this._sessionId, event, data, ts: Date.now() };
    this._rows.push(row);
    if (this._db && ['BLINK', 'MICRO', 'SUPPRESSION', 'BIFURCATION'].includes(event)) {
      this._db.insert('session_log', row);
    }
  }

  async end() {
    this._open = false;
    if (this._db && this._sessionId) {
      await this._db.insert('session_log', {
        sessionId: this._sessionId, event: 'END',
        data: { ts: Date.now(), rowCount: this._rows.length },
      });
    }
    return this._rows;
  }

  get rows()      { return this._rows; }
  get sessionId() { return this._sessionId; }
}
