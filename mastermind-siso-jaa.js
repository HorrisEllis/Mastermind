// ═══════════════════════════════════════════════════════════════════
// MASTERMIND — SISO + JAA Runtime (Browser Port)
// SISO: Stream In, Stream Out — pure functional event pipeline
// JAA:  PureGate / StateGate / Runner / MutationBatch / ReadSet
//
// Ported from:
//   SISO Core JS  (siso-framework.org)
//   Jaa-main PHP  (Ice\Core + Ice\Protocol + Ice\Resolution)
//
// Load order: BEFORE nexus-engine.js
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ── SISO: StreamLog ───────────────────────────────────────────────
const SISO_LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };
let _sisoStreamIdCounter = 0;

class SISOStreamLog {
  constructor(level = 'EVENTS') {
    this.level = level;
    this.entries = [];
    this.seq = 0;
  }
  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = SISO_LEVELS[this.level] || 0;
    if (lvl === 0) return;
    const entry = { seq: this.seq++, time: Date.now(), type: eventType, claimed: gateClaimed };
    if (lvl >= 2) { entry.streamId = streamId; if (parentStreamId != null) entry.parentStreamId = parentStreamId; }
    if (lvl >= 3) entry.data = eventData;
    this.entries.push(entry);
  }
  nextStreamId() { return ++_sisoStreamIdCounter; }
  sample() { return { level: this.level, count: this.entries.length, entries: [...this.entries] }; }
  clear() { this.entries = []; this.seq = 0; }
}

// ── SISO: Event ───────────────────────────────────────────────────
class SISOEvent {
  constructor(type, data = {}) {
    Object.defineProperty(this, 'type', { value: type, writable: false, enumerable: true });
    Object.defineProperty(this, 'data', { value: Object.freeze({ ...data }), writable: false, enumerable: true });
  }
}

// ── SISO: Gate ────────────────────────────────────────────────────
class SISOGate {
  constructor(signature) {
    this.signature = signature;
  }
  // Override: return void, emit via stream.emit()
  transform(event, stream) {}
}

// ── SISO: Stream ──────────────────────────────────────────────────
class SISOStream {
  constructor({ log = null, parentStreamId = null } = {}) {
    this.gates   = new Map();
    this.pending = [];
    this.eventCount = 0;
    this.log = log;
    this.streamId = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;
  }
  register(gate) {
    if (this.gates.has(gate.signature))
      throw new Error(`SISO Signature collision: '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
    return this;
  }
  emit(event) {
    this.eventCount++;
    const gate = this.gates.get(event.type);
    if (this.log) {
      this.log.record({ streamId: this.streamId, parentStreamId: this.parentStreamId,
        eventType: event.type, gateClaimed: gate ? gate.signature : null, eventData: event.data });
    }
    if (gate) gate.transform(event, this);
    else       this.pending.push(event);
  }
  sampleHere() {
    return { pending: [...this.pending], eventCount: this.eventCount, gateCount: this.gates.size };
  }
}

// ── JAA: ReadSet ──────────────────────────────────────────────────
class JAAReadSet {
  constructor() { this._refs = []; this._patterns = []; }
  ref(name)         { this._refs.push(name); return this; }
  pattern(prefix)   { this._patterns.push(prefix); return this; }
  getRefs()         { return this._refs; }
  getPatterns()     { return this._patterns; }
  isEmpty()         { return this._refs.length === 0 && this._patterns.length === 0; }
}

// ── JAA: MutationBatch ────────────────────────────────────────────
class JAAMutationBatch {
  constructor() { this._puts = []; this._refSets = []; this._refDeletes = []; this._events = []; }
  put(type, content)         { this._puts.push({ type, content }); return this; }
  refSet(name, putIndex)     {
    if (putIndex >= this._puts.length) throw new Error(`refSet index ${putIndex} out of range`);
    this._refSets.push({ name, putIndex }); return this;
  }
  refSetHash(name, hash)     { this._refSets.push({ name, hash }); return this; }
  refDelete(name)            { this._refDeletes.push(name); return this; }
  emit(event)                { this._events.push(event); return this; }
  getPuts()                  { return this._puts; }
  getRefSets()               { return this._refSets; }
  getRefDeletes()            { return this._refDeletes; }
  getEvents()                { return this._events; }
}

// ── JAA: PureGate ─────────────────────────────────────────────────
// Pure function gate — no side effects, no state reads.
// Override transform(event) → Event | Event[] | null
class JAAPureGate extends SISOGate {
  constructor(signature) { super(signature); }
  transform(event, stream) {
    try {
      const result = this.process(event);
      if (!result) return;
      if (Array.isArray(result)) result.forEach(e => stream.emit(e));
      else stream.emit(result);
    } catch(e) {
      stream.emit(new SISOEvent('mm.error', { message: e.message, source: this.signature }));
    }
  }
  // Override in subclass
  process(event) { return null; }
}

// ── JAA: StateGate ────────────────────────────────────────────────
// Stateful gate — declares reads, gets resolved state, returns MutationBatch.
// Must be run through JAARunner.
class JAAStateGate extends SISOGate {
  constructor(signature) { super(signature); }
  // Override: return JAAReadSet
  reads(event) { return new JAAReadSet(); }
  // Override: return JAAMutationBatch
  transformEvent(event, state) { return new JAAMutationBatch(); }
  transform(event, stream) {
    throw new Error('JAAStateGate must be run through JAARunner — call runner.register()');
  }
}

// ── JAA: MemoryStore ──────────────────────────────────────────────
// Content-addressable store: SHA-256 hash → canonical JSON
class JAAMemoryStore {
  constructor() { this._objects = {}; }
  async put(content) {
    const canonical = JSON.stringify(this._canonicalize(content));
    const hash = await this._sha256(canonical);
    if (!this._objects[hash]) this._objects[hash] = canonical;
    return hash;
  }
  get(hash) {
    if (!this._objects[hash]) throw new Error(`JAAStore: object not found: ${hash.slice(0,12)}…`);
    return JSON.parse(this._objects[hash]);
  }
  has(hash) { return !!this._objects[hash]; }
  getObjects() { return { ...this._objects }; }
  setObjects(o) { this._objects = { ...o }; }
  _canonicalize(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(x => this._canonicalize(x));
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, this._canonicalize(v[k])]));
  }
  async _sha256(str) {
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
    } catch(e) {
      // Fallback: djb2 for non-secure contexts
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = (((h << 5) + h) + str.charCodeAt(i)) | 0;
      return 'djb2_' + Math.abs(h).toString(16).padStart(8,'0');
    }
  }
}

// ── JAA: MemoryRefs ───────────────────────────────────────────────
// Name → hash pointer map
class JAAMemoryRefs {
  constructor() { this._refs = {}; }
  set(name, hash)   { this._refs[name] = hash; }
  get(name)         { return this._refs[name] ?? null; }
  delete(name)      { delete this._refs[name]; }
  list(prefix)      { return Object.keys(this._refs).filter(n => n.startsWith(prefix)).sort(); }
  getRefs()         { return { ...this._refs }; }
  setRefs(r)        { this._refs = { ...r }; }
}

// ── JAA: Runner ───────────────────────────────────────────────────
// Orchestrates StateGates: resolve reads → transform → apply mutations
class JAARunner {
  constructor(store = null, refs = null, log = null) {
    this._store  = store  || new JAAMemoryStore();
    this._refs   = refs   || new JAAMemoryRefs();
    this._log    = log;
    this._stream = new SISOStream({ log });
  }
  register(gate) {
    if (gate instanceof JAAStateGate) {
      // Wrap StateGate: intercept transform, drive resolve→apply cycle
      const runner = this;
      const wrapper = new class extends SISOGate {
        constructor() { super(gate.signature); }
        transform(event, stream) {
          try {
            const readSet = gate.reads(event);
            runner._resolve(readSet).then(state => {
              try {
                const batch = gate.transformEvent(event, state);
                runner._apply(batch).then(followUps => {
                  followUps.forEach(e => stream.emit(e));
                }).catch(err => stream.emit(new SISOEvent('mm.error', { message: err.message, source: gate.signature })));
              } catch(e) {
                stream.emit(new SISOEvent('mm.error', { message: e.message, source: gate.signature }));
              }
            }).catch(err => stream.emit(new SISOEvent('mm.error', { message: err.message, source: gate.signature })));
          } catch(e) {
            stream.emit(new SISOEvent('mm.error', { message: e.message, source: gate.signature }));
          }
        }
      }();
      this._stream.register(wrapper);
    } else if (gate instanceof JAAPureGate) {
      this._stream.register(gate);
    } else {
      this._stream.register(gate);
    }
    return this;
  }
  emit(event) { this._stream.emit(event); return this; }
  sample()    { return this._stream.sampleHere(); }
  async _resolve(readSet) {
    const state = { refs: {}, patterns: {} };
    for (const name of readSet.getRefs()) {
      const hash = this._refs.get(name);
      state.refs[name] = hash ? this._store.get(hash) : null;
    }
    for (const prefix of readSet.getPatterns()) {
      state.patterns[prefix] = {};
      for (const name of this._refs.list(prefix)) {
        const hash = this._refs.get(name);
        if (hash) state.patterns[prefix][name] = this._store.get(hash);
      }
    }
    return state;
  }
  async _apply(batch) {
    const hashes = [];
    for (const put of batch.getPuts()) {
      hashes.push(await this._store.put(put.content));
    }
    for (const rs of batch.getRefSets()) {
      const hash = rs.putIndex !== undefined ? hashes[rs.putIndex] : rs.hash;
      this._refs.set(rs.name, hash);
    }
    for (const name of batch.getRefDeletes()) this._refs.delete(name);
    return batch.getEvents();
  }
  snapshot() { return { store: this._store.getObjects(), refs: this._refs.getRefs() }; }
  restore(snap) { this._store.setObjects(snap.store); this._refs.setRefs(snap.refs); }
  getStore() { return this._store; }
  getRefs()  { return this._refs; }
}

// ── MASTERMIND Event Bus (SISO-backed) ────────────────────────────
// Replaces the old window.SISO no-op stub with a real event pipeline.
// Exposes: MM_BUS.emit(type, data), MM_BUS.on(type, fn), MM_BUS.off(type, fn)
// Internally uses a SISOStream per subscriber group.
class MMEventBus {
  constructor() {
    this._handlers = new Map(); // type → Set<fn>
    this._log = new SISOStreamLog('EVENTS');
    this._stream = new SISOStream({ log: this._log });
    this._catchAll = null;
  }
  on(type, fn) {
    if (!this._handlers.has(type)) {
      this._handlers.set(type, new Set());
      // Register a gate that dispatches to all handlers for this type
      const bus = this;
      const gate = new class extends SISOGate {
        constructor() { super(type); }
        transform(event, stream) {
          const fns = bus._handlers.get(event.type);
          if (fns) fns.forEach(f => { try { f(event.data, event); } catch(e) {} });
        }
      }();
      try { this._stream.register(gate); } catch(e) {} // collision = already registered
    }
    this._handlers.get(type).add(fn);
    return this;
  }
  off(type, fn) {
    this._handlers.get(type)?.delete(fn);
    return this;
  }
  once(type, fn) {
    const wrapper = (data, event) => { fn(data, event); this.off(type, wrapper); };
    return this.on(type, wrapper);
  }
  emit(type, data = {}) {
    this._stream.emit(new SISOEvent(type, data));
    return this;
  }
  sampleLog() { return this._log.sample(); }
}

// ── Vault Gate System (SISO gates for vault operations) ───────────
// Each vault operation is a pure gate through the stream.
// This replaces ad-hoc inline vault checks with a structured pipeline.

class VaultCheckGate extends JAAPureGate {
  constructor() { super('mm.vault.check'); }
  process(event) {
    const { path, context } = event.data;
    if (!path) return new SISOEvent('mm.vault.missing', { context, reason: 'no_path' });
    return new SISOEvent('mm.vault.check.pending', { path, context });
  }
}

class VaultWatchdogGate extends JAAPureGate {
  constructor() { super('mm.vault.watchdog.result'); }
  process(event) {
    const { exists, path, context } = event.data;
    if (!exists) return new SISOEvent('mm.vault.missing', { path, context, reason: 'watchdog_failed' });
    return new SISOEvent('mm.vault.confirmed', { path, context });
  }
}

class LoginGate extends JAAPureGate {
  constructor() { super('mm.auth.login.attempt'); }
  process(event) {
    const { hasMeta, hasVaultKeys, vaultFileExists } = event.data;
    if (!hasMeta)           return new SISOEvent('mm.auth.login.fail', { reason: 'no_identity', message: 'No identity found — complete first-time setup' });
    if (!hasVaultKeys)      return new SISOEvent('mm.auth.login.fail', { reason: 'no_vault_keys', message: 'Vault keys missing — vault may be corrupted' });
    if (!vaultFileExists)   return new SISOEvent('mm.auth.login.fail', { reason: 'no_vault_file', message: 'Vault file not found — select data folder or recreate vault' });
    return new SISOEvent('mm.auth.login.proceed', event.data);
  }
}

// ── Build Global SISO + JAA instances ─────────────────────────────
const MM_BUS    = new MMEventBus();
const MM_RUNNER = new JAARunner();

// Wire vault gates into the runner's stream
MM_RUNNER._stream
  .register(new VaultCheckGate())
  .register(new VaultWatchdogGate())
  .register(new LoginGate());

// ── Error gate — log all mm.error events ─────────────────────────
MM_BUS.on('mm.error', ({ message, source }) => {
  console.error(`[MM SISO ERROR] [${source}] ${message}`);
  if (typeof MMLog !== 'undefined') MMLog.error('siso', `[${source}] ${message}`);
});

// ── Expose as window globals (replaces old stubs) ─────────────────
window.SISO = MM_BUS;    // backward compat: SISO.emit / on / off / once
window.JAA  = window.JAA || {}; // JAA compat layer is in nexus-engine.js stub

// Named exports for modules that import directly
window.MMEventBus       = MMEventBus;
window.SISOEvent        = SISOEvent;
window.SISOGate         = SISOGate;
window.SISOStream       = SISOStream;
window.SISOStreamLog    = SISOStreamLog;
window.JAAPureGate      = JAAPureGate;
window.JAAStateGate     = JAAStateGate;
window.JAAMutationBatch = JAAMutationBatch;
window.JAAReadSet       = JAAReadSet;
window.JAAMemoryStore   = JAAMemoryStore;
window.JAAMemoryRefs    = JAAMemoryRefs;
window.JAARunner        = JAARunner;
window.MM_BUS           = MM_BUS;
window.MM_RUNNER        = MM_RUNNER;

console.log('[MASTERMIND] SISO+JAA runtime loaded · MM_BUS + MM_RUNNER ready');
