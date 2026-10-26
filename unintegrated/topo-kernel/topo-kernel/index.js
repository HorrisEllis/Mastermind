'use strict';

/**
 * TOPO-KERNEL — Public API
 * Sovereign entry point. Mount what you need. Nothing is assumed.
 *
 * Usage:
 *   const { TopoKernel } = require('topo-kernel');
 *   const kernel = new TopoKernel();
 *   kernel.feed({ sourceId: 'sensor-01', field: 'relational', axis: 'connection', value: 0.7, ts: Date.now() });
 *   kernel.bus.on('signal.passed', e => console.log(e.data));
 *
 * Version: 0.1.0
 */

const { SISOBus, EVENT_TYPES } = require('./core/bus');
const { SNREngine }            = require('./core/snr');

class TopoKernel {
  constructor(opts = {}) {
    this.bus = new SISOBus({ ringSize: opts.ringSize || 2000 });
    this.snr = new SNREngine(this.bus, opts.snr || {});

    this.bus.emit(EVENT_TYPES.SYSTEM_BOOT, {
      version: '0.1.0',
      ts: Date.now(),
    });
  }

  // ── Signal entry point ────────────────────────────────────────────────────

  feed(signal) {
    return this.snr.feed(signal);
  }

  feedBatch(signals) {
    return signals.map(s => this.snr.feed(s));
  }

  // ── Whitelist / Blacklist ─────────────────────────────────────────────────

  whitelist(sourceId) { this.snr.whitelist(sourceId); return this; }
  blacklist(sourceId) { this.snr.blacklist(sourceId); return this; }
  unlist(sourceId)    { this.snr.unlist(sourceId);    return this; }

  // ── Threshold ─────────────────────────────────────────────────────────────

  setThreshold(v) { this.snr.setThreshold(v); return this; }

  // ── Subscribe ─────────────────────────────────────────────────────────────

  on(type, fn)   { return this.bus.on(type, fn); }
  once(type, fn) { return this.bus.once(type, fn); }

  // ── Introspection ─────────────────────────────────────────────────────────

  trust(sourceId) { return this.snr.trustOf(sourceId); }
  allTrust()      { return this.snr.allTrust(); }
  stats()         { return { bus: this.bus.stats(), snr: this.snr.stats() }; }

  ready() {
    this.bus.emit(EVENT_TYPES.SYSTEM_READY, { ts: Date.now() });
    return this;
  }
}

module.exports = {
  TopoKernel,
  SISOBus,
  SNREngine,
  EVENT_TYPES,
};
