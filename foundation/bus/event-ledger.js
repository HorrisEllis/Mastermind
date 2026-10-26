// ═══════════════════════════════════════════════════════════════════
// EVENT LEDGER — foundation/bus/event-ledger.js
// v1.0.0
//
// Ring-buffer ledger over every MM_BUS event. The bus fires-and-forgets
// — nothing in the app can currently ask "what happened in the last N
// events," which is exactly what a pattern engine needs to exist. Fixed
// capacity, O(1) append, oldest silently overwritten: bounded memory by
// construction, no unbounded growth, no GC churn from shift().
//
// Subscribes via the bus's own existing wildcard '*' listener — a real
// public API, not a monkey-patch of emit() (AXIOM §5.3).
// ═══════════════════════════════════════════════════════════════════

'use strict';

class MMRingLedger {
  constructor(capacity) {
    this._cap = Math.max(8, capacity || 512);
    this._buf = new Array(this._cap);
    this._head = 0;      // next write slot
    this._count = 0;     // total ever written (length = min(count, cap))
  }
  push(entry) {
    this._buf[this._head] = entry;
    this._head = (this._head + 1) % this._cap;
    this._count++;
    return entry;
  }
  get length() { return Math.min(this._count, this._cap); }
  get totalSeen() { return this._count; }
  get capacity() { return this._cap; }
  // Oldest → newest, correctly ordered across wrap-around
  toArray() {
    const n = this.length;
    const out = new Array(n);
    const start = this._count <= this._cap ? 0 : this._head;
    for (let i = 0; i < n; i++) out[i] = this._buf[(start + i) % this._cap];
    return out;
  }
  recent(n) { const a = this.toArray(); return a.slice(Math.max(0, a.length - n)); }
  byType(type) { return this.toArray().filter(e => e.type === type); }
  window(sinceTs) { return this.toArray().filter(e => e.ts >= sinceTs); }
  clear() { this._buf = new Array(this._cap); this._head = 0; this._count = 0; }
}

const MM_LEDGER = new MMRingLedger(512);

// Wire to the bus once it exists — this file loads right after
// foundation core, but guard anyway (browser-standalone tolerance,
// same pattern as every foundation file).
(function _wireLedger() {
  const wired = { siso: false, core: false };
  function attempt() {
    if (wired.siso && wired.core) return true;
    // TWO buses exist: SISO's MM_BUS (global since siso-jaa loads first)
    // and foundation's _MM_BUS (exposed at DOMContentLoaded). Tap both —
    // events from either land in the one ring, tagged by origin.
    let any = false;
    if (!wired.siso && typeof MM_BUS !== 'undefined' && MM_BUS.on) {
      MM_BUS.on('*', ({ event, data }) => { MM_LEDGER.push({ type: event, data, ts: Date.now(), bus: 'siso' }); });
      wired.siso = true; any = true;
    }
    if (!wired.core && typeof _MM_BUS !== 'undefined' && _MM_BUS.on) {
      _MM_BUS.on('*', ({ event, data }) => { MM_LEDGER.push({ type: event, data, ts: Date.now(), bus: 'core' }); });
      wired.core = true; any = true;
    }
    if (any && typeof MMLog !== 'undefined') MMLog.info('ledger', `Event ledger tapped: siso=${wired.siso} core=${wired.core} — ring cap ${MM_LEDGER.capacity}`);
    return wired.siso && wired.core;
  }
  // MM_BUS reaches window only at DOMContentLoaded (foundation defers
  // its global exposure), so: try now (covers same-scope load order),
  // at DOMContentLoaded, and a short capped interval as backstop.
  if (attempt()) return;
  document.addEventListener('DOMContentLoaded', attempt);
  let tries = 0;
  const iv = setInterval(() => {
    if (attempt() || ++tries > 40) {
      clearInterval(iv);
      if (!wired.siso && !wired.core) console.warn('[MM:LEDGER] no bus ever appeared — event ledger inert');
    }
  }, 50);
})();

window.MMRingLedger = MMRingLedger;
window.MM_LEDGER = MM_LEDGER;
