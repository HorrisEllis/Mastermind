/**
 * @spatial/bus — v1.0.0
 *
 * SISO event bus. The nervous system of Spatial.
 * Stream → Event → Gate → StreamLog.
 *
 * §K6  No module communicates except through this bus.
 * §K7  All errors surface as events. Never throws.
 * §5.5 Zero runtime dependencies.
 *
 * Event naming contract: spatial.<package>.<noun>.<verb>
 *
 * Source: siso.js — CrystalBall/ALK — Jonathan Bailey
 * Adapted: @spatial/bus namespace
 */

'use strict';

export const BUS_VERSION = '1.0.0';

// ── Event ─────────────────────────────────────────────────────────────────────

export class Event {
  constructor(type, data = {}) {
    this.type = type;
    this.data = data;
    Object.freeze(this); // §K1 — events are immutable
  }
}

// ── Gate ──────────────────────────────────────────────────────────────────────

export class Gate {
  constructor(signature) {
    this.signature = signature;
  }
  /** @param {Event} event @param {Stream} stream */
  transform(event, stream) {}  // override in subclass
}

// ── StreamLog ─────────────────────────────────────────────────────────────────

const LOG_LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };
let _streamIdCounter = 0;

export class StreamLog {
  constructor(level = 'EVENTS') {
    this.level  = level;
    this.entries = [];
    this.seq    = 0;
  }

  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = LOG_LEVELS[this.level] ?? 0;
    if (lvl === 0) return;
    const entry = { seq: this.seq++, time: Date.now(), type: eventType, claimed: !!gateClaimed };
    if (lvl >= 2) { entry.streamId = streamId; if (parentStreamId != null) entry.parentStreamId = parentStreamId; }
    if (lvl >= 3) entry.data = eventData;
    this.entries.push(entry);
  }

  nextStreamId() { return ++_streamIdCounter; }
  sample()       { return { level: this.level, count: this.entries.length, entries: [...this.entries] }; }
  tail(n = 50)   { return this.entries.slice(-n); }
  clear()        { this.entries = []; this.seq = 0; }
}

// ── Stream ────────────────────────────────────────────────────────────────────

export class Stream {
  constructor({ log = null, parentStreamId = null } = {}) {
    this.gates         = new Map();
    this.pending       = [];
    this.eventCount    = 0;
    this.log           = log;
    this.streamId      = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;
  }

  register(gate) {
    if (this.gates.has(gate.signature)) throw new Error(`[SISO] Signature collision: '${gate.signature}'`);
    this.gates.set(gate.signature, gate);
    return this;
  }

  emit(event) {
    this.eventCount++;
    const gate = this.gates.get(event.type);
    if (this.log) this.log.record({ streamId: this.streamId, parentStreamId: this.parentStreamId, eventType: event.type, gateClaimed: gate?.signature ?? null, eventData: event.data });
    if (gate) gate.transform(event, this);
    else      this.pending.push(event);
    return this;
  }

  sampleHere() { return { pending: [...this.pending], eventCount: this.eventCount, gateCount: this.gates.size }; }
}

// ── SISOBus ───────────────────────────────────────────────────────────────────

export class SISOBus {
  constructor({ log = null } = {}) {
    this._log   = log ?? new StreamLog('DATA');
    this._stream = new Stream({ log: this._log });
    this._subs  = new Map();
    this._seq   = 0;
    this._stats = { emitted: 0, claimed: 0, pending: 0 };
  }

  /**
   * Subscribe to an event pattern. Supports wildcards: 'spatial.kernel.*', '**'
   * @returns {Function} unsubscribe
   */
  on(pattern, cb) {
    const id   = ++this._seq;
    const test = compilePattern(pattern);
    if (!this._subs.has(pattern)) this._subs.set(pattern, []);
    this._subs.get(pattern).push({ id, cb, test });
    return () => {
      const arr = this._subs.get(pattern) ?? [];
      const i = arr.findIndex(s => s.id === id);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  /**
   * Emit an event onto the bus.
   * §K7 — wraps cb execution, surfaces errors as spatial.bus.error
   */
  emit(type, data = {}) {
    this._stats.emitted++;
    const claimed = this._countSubscribers(type) > 0;
    this._log.record({ streamId: this._stream.streamId, parentStreamId: null, eventType: type, gateClaimed: claimed ? type : null, eventData: data });
    if (claimed) this._stats.claimed++;
    else         this._stats.pending++;
    this._route(type, data);
    return this;
  }

  _route(type, payload) {
    for (const [, subs] of this._subs) {
      for (const s of subs) {
        try { if (s.test(type)) s.cb(payload); }
        catch (err) { this._routeError(type, err); }
      }
    }
  }

  _routeError(originType, err) {
    // §K7 — errors are events, not throws
    try {
      this._route('spatial.bus.error', { originType, message: err?.message ?? String(err), stack: err?.stack });
    } catch (_) {} // last resort — swallow only the error handler's error
  }

  _countSubscribers(type) {
    let n = 0;
    for (const [, subs] of this._subs) for (const s of subs) if (s.test(type)) n++;
    return n;
  }

  /** StreamLog — all recorded events */
  get log()   { return this._log; }
  /** Bus statistics */
  get stats() { return { ...this._stats, subscribers: this._subs.size }; }
  /** Tail of event log */
  tail(n = 100)       { return this._log.tail(n); }
  /** Change log verbosity at runtime */
  setLogLevel(level)  { this._log.level = level; }
}

// ── Pattern compiler ──────────────────────────────────────────────────────────

export function compilePattern(p) {
  if (p === '**') return () => true;
  const parts = p.split('.');
  function match(parts, segs, pi, si) {
    while (pi < parts.length && si < segs.length) {
      if      (parts[pi] === '**')          { for (let k = si; k <= segs.length; k++) if (match(parts, segs, pi+1, k)) return true; return false; }
      else if (parts[pi] === '*' || parts[pi] === segs[si]) { pi++; si++; }
      else    return false;
    }
    while (pi < parts.length && parts[pi] === '**') pi++;
    return pi === parts.length && si === segs.length;
  }
  return t => match(parts, t.split('.'), 0, 0);
}

// ── Spatial event constants ───────────────────────────────────────────────────
// Canonical event names — import these instead of string literals

export const EV = Object.freeze({
  // session lifecycle
  SESSION_START:              'spatial.session.start',
  SESSION_STOP:               'spatial.session.stop',

  // kernel
  KERNEL_LATENT_UPDATE:       'spatial.kernel.latent.update',
  KERNEL_EXPRESSION_UPDATE:   'spatial.kernel.expression.update',
  KERNEL_SUPPRESSION_UPDATE:  'spatial.kernel.suppression.update',
  KERNEL_BEHAVIOR_DETECTED:   'spatial.kernel.behavior.detected',
  KERNEL_TRAJECTORY_COMPLETE: 'spatial.kernel.trajectory.complete',
  KERNEL_LANDSCAPE_WARMSTART: 'spatial.kernel.landscape.warmstart',
  KERNEL_LANDSCAPE_UPDATED:   'spatial.kernel.landscape.updated',
  KERNEL_BLUEPRINT_READY:     'spatial.kernel.blueprint.ready',
  KERNEL_CODEC_INVARIANTS:    'spatial.kernel.codec.invariants',
  KERNEL_SUBJECT_ADD:         'spatial.kernel.subject.add',
  KERNEL_SUBJECT_REMOVE:      'spatial.kernel.subject.remove',
  KERNEL_ERROR:               'spatial.kernel.error',

  // nexus
  NEXUS_GATE_FIRED:           'spatial.nexus.gate.fired',
  NEXUS_CAUSAL_CHAIN:         'spatial.nexus.causal.chain',
  NEXUS_DELTA_UPDATE:         'spatial.nexus.delta.update',
  NEXUS_REGIME_CHANGED:       'spatial.nexus.regime.changed',
  NEXUS_BLUEPRINT_COMPILED:   'spatial.nexus.blueprint.compiled',
  NEXUS_FORGE_PATCHED:        'spatial.nexus.forge.patch.applied',
  NEXUS_ERROR:                'spatial.nexus.error',

  // bridge
  BRIDGE_TRANSMISSION_READY:  'spatial.bridge.transmission.ready',
  BRIDGE_RENDER_A:            'spatial.bridge.render.A',
  BRIDGE_RENDER_B:            'spatial.bridge.render.B',
  BRIDGE_REFERENT_FOUND:      'spatial.bridge.referent.found',
  BRIDGE_BUFFER_HELD:         'spatial.bridge.buffer.held',
  BRIDGE_BUFFER_RELEASED:     'spatial.bridge.buffer.released',
  BRIDGE_IRRECOVERABLE:       'spatial.bridge.irrecoverable',
  BRIDGE_BANDWIDTH_UPDATE:    'spatial.bridge.bandwidth.update',
  BRIDGE_MODE_CONVERTED:      'spatial.bridge.mode.converted',
  BRIDGE_WINDOW_OPEN:         'spatial.bridge.window.open',

  // resonance
  RESONANCE_FINGERPRINT:      'spatial.resonance.fingerprint.updated',
  RESONANCE_SCORED:           'spatial.resonance.scored',
  RESONANCE_MATCH_READY:      'spatial.resonance.match.ready',

  // field
  FIELD_SYNCHRONY:            'spatial.field.synchrony.update',
  FIELD_MIRRORING:            'spatial.field.mirroring.detected',
  FIELD_ATTUNEMENT:           'spatial.field.attunement.update',
  FIELD_TENSION:              'spatial.field.tension.update',
  FIELD_REFERENT:             'spatial.field.referent.emerging',

  // ase
  ASE_ENCOUNTER:              'spatial.ase.encounter.recorded',
  ASE_SIGNATURE:              'spatial.ase.signature.updated',
  ASE_TRAJECTORY:             'spatial.ase.trajectory.updated',
  ASE_RESONANCE:              'spatial.ase.resonance.found',

  // sigma
  SIGMA_REGIME:               'spatial.sigma.regime.changed',
  SIGMA_ENTROPY:              'spatial.sigma.entropy.update',

  // drift engine
  DRIFT_SIGNAL:               'spatial.kernel.drift.signal',
  DRIFT_STATE:                'spatial.kernel.drift.state',
  DRIFT_CLUSTER:              'spatial.kernel.drift.cluster',
  DRIFT_BASELINE_READY:       'spatial.kernel.drift.baseline_ready',
  DRIFT_PULSE:                'spatial.kernel.drift.pulse',
  DRIFT_SUMMARY:              'spatial.kernel.drift.summary',

  // lattice
  LATTICE_NODE_ADDED:         'spatial.lattice.node.added',
  LATTICE_EDGE_CONNECTED:     'spatial.lattice.edge.connected',
  LATTICE_CLUSTER_UPDATED:    'spatial.lattice.cluster.updated',
  LATTICE_GRAPH_READY:        'spatial.lattice.graph.ready',

  // pat
  PAT_SESSION_WRITTEN:        'spatial.pat.session.written',
  PAT_SESSION_RESTORED:       'spatial.pat.session.restored',
  PAT_QUERY_RESULT:           'spatial.pat.query.result',

  // bus
  BUS_ERROR:                  'spatial.bus.error',
});
