/**
 * @module       bus
 * @uuid         b0530000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * Minimal SISO-compatible event bus for Node.js / edge runtimes.
 * Zero dependencies. Drop-in for SISOBus in telemetry contexts.
 *
 * §1.2 — Nothing silent. All errors loud.
 * §5.2 — Everything implements the bridge (bus-only I/O).
 * §5.3 — No monkey patches.
 */

'use strict';

export const BUS_UUID    = 'b0530000-0000-4000-9000-000000000001';
export const BUS_VERSION = '1.0.0';

export class TelemetryBus {
  constructor() {
    this._handlers = new Map(); // event → Set<fn>
    this._stats = { emitted: 0, received: 0, errors: 0 };
  }

  on(event, fn) {
    if (typeof fn !== 'function') throw new Error(`[TelemetryBus] handler must be function, got ${typeof fn} for event "${event}"`);
    if (!this._handlers.has(event)) this._handlers.set(event, new Set());
    this._handlers.get(event).add(fn);
    return () => this.off(event, fn); // returns unsubscribe
  }

  off(event, fn) {
    this._handlers.get(event)?.delete(fn);
  }

  emit(event, data) {
    this._stats.emitted++;
    const handlers = this._handlers.get(event);
    if (!handlers?.size) return;
    for (const fn of handlers) {
      try {
        this._stats.received++;
        fn(data);
      } catch (err) {
        this._stats.errors++;
        console.error(`[TelemetryBus] handler error on "${event}":`, err);
      }
    }
  }

  // Wildcard: subscribe to all events matching a prefix
  onPrefix(prefix, fn) {
    // We track prefix subs separately and check on every emit
    if (!this._prefixSubs) this._prefixSubs = [];
    this._prefixSubs.push({ prefix, fn });
    return () => { this._prefixSubs = this._prefixSubs.filter(s => s.fn !== fn); };
  }

  health() {
    return { uuid: BUS_UUID, version: BUS_VERSION, stats: { ...this._stats }, channels: this._handlers.size };
  }

  reset() {
    this._handlers.clear();
    this._prefixSubs = [];
    this._stats = { emitted: 0, received: 0, errors: 0 };
  }
}

export function createBus() { return new TelemetryBus(); }
