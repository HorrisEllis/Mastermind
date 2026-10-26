/**
 * RheonBus — the SISO event bus for rheon-server
 *
 * A named SISO Stream. Every operation that crosses a seam
 * emits an event here. Gates transform and fan-out.
 *
 * §5.1 — everything has a UUID and event bus registration
 * §5.7 — all inter-module communication via event bus only
 * §2.3 — all state observable through the bus
 *
 * Architecture:
 *   emit(Event) → gate lookup O(1) → transform → emit(new Events)
 *
 * Event namespaces:
 *   cmd.*       — inbound commands (from API or WS)
 *   store.*     — storage layer results
 *   bus.*       — bus lifecycle (registered, error)
 *   ws.*        — websocket lifecycle
 *   heartbeat.* — heartbeat signals (from heartbeat.cjs)
 *
 * Usage:
 *   bus.emit(new E('cmd.project.create', { name, remote, source }))
 *   bus.on('store.project.created', (event) => { ... })
 */

import { Stream, StreamLog, Event, Gate } from '../core/index.js';

// ── Re-export Event as E for brevity ─────────────────────────────
export { Event as E };

// ── StreamLog — shared across the whole bus tree ──────────────────
export const busLog = new StreamLog('EVENTS');

// ── The bus ───────────────────────────────────────────────────────
export const bus = new Stream({ log: busLog });

// ── Observer registry — type → handler[] ─────────────────────────
// Separate from gate registration — observers don't transform,
// they react. Gates are the transformation layer. Observers are
// the integration layer (WS broadcast, ledger write, etc.)
const _observers = new Map();

/**
 * Subscribe to an event type on the bus.
 * Observers run after the gate chain settles.
 * '*' subscribes to all events.
 *
 * @param {string}   type
 * @param {function} handler — (event) => void
 */
export function on(type, handler) {
  if (!_observers.has(type)) _observers.set(type, []);
  _observers.get(type).push(handler);
}

/**
 * Emit an event into the bus and notify observers.
 * @param {Event} event
 */
export function emit(event) {
  bus.emit(event);
  notify(event);
}

function notify(event) {
  const handlers = _observers.get(event.type) || [];
  handlers.forEach(h => {
    try { h(event); }
    catch(err) {
      // §1.2 — observer errors are loud, never swallowed
      console.error(`[RheonBus] observer error type=${event.type} err=${err.message}`);
    }
  });

  // Wildcard
  const wild = _observers.get('*') || [];
  wild.forEach(h => {
    try { h(event); }
    catch(err) {
      console.error(`[RheonBus] wildcard observer error type=${event.type} err=${err.message}`);
    }
  });
}

// ── Gate registration helper ──────────────────────────────────────
/**
 * Register a gate on the bus.
 * Wraps the SISO Stream.register() with error protection.
 * @param {Gate} gate
 */
export function register(gate) {
  try {
    bus.register(gate);
  } catch(err) {
    // Signature collision = hard error (§1.2, SISO law 1)
    throw new Error(`[RheonBus] gate registration failed: ${err.message}`);
  }
}

// ── Sample ────────────────────────────────────────────────────────
export function sample() {
  return {
    ...bus.sampleHere(),
    log: busLog.sample(),
  };
}

// ── Log level control ─────────────────────────────────────────────
export function setLogLevel(level) {
  busLog.level = level; // OFF | EVENTS | DEEP | DATA
}
