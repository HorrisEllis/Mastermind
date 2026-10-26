'use strict';

/**
 * TOPO-KERNEL — BUS
 * Sovereign SISO event bus. Nothing else lives here.
 * All inter-module communication routes through this.
 * Zero knowledge of any other module.
 *
 * UUID format: bus-<hex8>
 * Version: 0.1.0
 */

const { randomBytes } = require('crypto');

// ── Constants ────────────────────────────────────────────────────────────────

const EVENT_TYPES = Object.freeze({
  // SNR layer
  SIGNAL_RAW:         'signal.raw',
  SIGNAL_PASSED:      'signal.passed',
  SIGNAL_DROPPED:     'signal.dropped',
  SIGNAL_PATTERN:     'signal.pattern',

  // Field layer
  FIELD_MOUNTED:      'field.mounted',
  FIELD_UNMOUNTED:    'field.unmounted',
  FIELD_EVENT:        'field.event',

  // Shape layer
  SHAPE_UPDATE:       'shape.update',
  SHAPE_ANOMALY:      'shape.anomaly',

  // Resonance layer
  RESONANCE_UPDATE:   'resonance.update',

  // Filter layer
  FILTER_MOUNTED:     'filter.mounted',
  FILTER_UNMOUNTED:   'filter.unmounted',

  // Trust layer
  TRUST_UPDATE:       'trust.update',
  TRUST_REVOKED:      'trust.revoked',

  // Topology output
  TOPOLOGY_EVENT:     'topology.event',

  // System
  SYSTEM_ERROR:       'system.error',
  SYSTEM_BOOT:        'system.boot',
  SYSTEM_READY:       'system.ready',
});

// ── SISOEvent ────────────────────────────────────────────────────────────────

class SISOEvent {
  constructor(type, data, meta = {}) {
    if (!type || typeof type !== 'string') throw new Error('SISOEvent: type required');

    this.id         = 'evt-' + randomBytes(4).toString('hex');
    this.type       = type;
    this.data       = data;
    this.ts         = Date.now();
    this.sourceId   = meta.sourceId   || null;
    this.sessionId  = meta.sessionId  || null;
    this.causedBy   = meta.causedBy   || null;
    this._processed = new Set();

    Object.freeze(this);
  }

  wasProcessedBy(gateId) {
    return this._processed.has(gateId);
  }

  markProcessedBy(gateId) {
    // Events are immutable — processing state tracked externally via bus
    // Gate pipeline uses bus._processing map
    return this;
  }
}

// ── SISOGate ─────────────────────────────────────────────────────────────────

class SISOGate {
  constructor(id, matchFn, transformFn) {
    if (!id)          throw new Error('SISOGate: id required');
    if (!matchFn)     throw new Error('SISOGate: matchFn required');
    if (!transformFn) throw new Error('SISOGate: transformFn required');

    this.id          = id;
    this._matchFn    = matchFn;
    this._transformFn = transformFn;
  }

  matches(event) {
    try {
      return this._matchFn(event);
    } catch (e) {
      return false;
    }
  }

  transform(event, bus) {
    try {
      this._transformFn(event, bus);
    } catch (e) {
      bus.emit(EVENT_TYPES.SYSTEM_ERROR, {
        gateId: this.id,
        error:  e.message,
        eventId: event.id,
      });
    }
  }
}

// ── SISOBus ──────────────────────────────────────────────────────────────────

class SISOBus {
  constructor(opts = {}) {
    this._handlers    = new Map();   // type → Set<fn>
    this._wildcards   = new Set();   // fn for '*' subscriptions
    this._gates       = new Map();   // id → SISOGate
    this._ringBuffer  = [];          // recent events
    this._ringSize    = opts.ringSize || 1000;
    this._processing  = new Set();   // in-flight event IDs per gate
    this._stats       = { emitted: 0, delivered: 0, dropped: 0, errors: 0 };
    this._id          = 'bus-' + randomBytes(4).toString('hex');
  }

  // ── Subscriptions ──────────────────────────────────────────────────────────

  on(type, fn) {
    if (typeof fn !== 'function') throw new Error('BUS.on: fn must be a function');

    if (type === '*') {
      this._wildcards.add(fn);
      return () => this._wildcards.delete(fn);
    }

    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type)?.delete(fn);
  }

  once(type, fn) {
    const unsub = this.on(type, (event) => {
      unsub();
      fn(event);
    });
    return unsub;
  }

  // ── Gates ─────────────────────────────────────────────────────────────────

  registerGate(gate) {
    if (!(gate instanceof SISOGate)) throw new Error('BUS.registerGate: must be SISOGate');
    this._gates.set(gate.id, gate);
    return this;
  }

  unregisterGate(id) {
    this._gates.delete(id);
    return this;
  }

  // ── Emit ──────────────────────────────────────────────────────────────────

  emit(type, data, meta = {}) {
    const event = new SISOEvent(type, data, meta);
    this._stats.emitted++;

    // Ring buffer
    this._ringBuffer.push(event);
    if (this._ringBuffer.length > this._ringSize) this._ringBuffer.shift();

    // Run matching gates
    for (const [gateId, gate] of this._gates) {
      const key = `${gateId}:${event.id}`;
      if (this._processing.has(key)) continue; // infinite loop prevention
      if (gate.matches(event)) {
        this._processing.add(key);
        gate.transform(event, this);
        this._processing.delete(key);
      }
    }

    // Deliver to subscribers — errors in one handler never stop delivery to others
    const handlers = this._handlers.get(type);
    if (handlers) {
      for (const fn of handlers) {
        try {
          fn(event);
          this._stats.delivered++;
        } catch (e) {
          this._stats.errors++;
        }
      }
    }

    // Wildcards
    for (const fn of this._wildcards) {
      try {
        fn(event);
      } catch (e) {
        this._stats.errors++;
      }
    }

    return event;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  stats() {
    return { ...this._stats, id: this._id, ringSize: this._ringBuffer.length };
  }

  recent(n = 20) {
    return this._ringBuffer.slice(-n);
  }

  recentByType(type, n = 20) {
    return this._ringBuffer.filter(e => e.type === type).slice(-n);
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { SISOBus, SISOEvent, SISOGate, EVENT_TYPES };
