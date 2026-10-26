// ═══════════════════════════════════════════════════════════════════
// ALM — ACCELERATED LEARNING MODULE — events.js
// v1.0.0
//
// This module's public bus contract, per the module template in
// NEXUS-SPEC.md Part 2.4.
//
//   emits:  alm.function.logged     { fnKey, quality, ts }
//           alm.model.logged        { modelKey, field, ts }
//           alm.experiment.logged   { fnKey, ts }
//           alm.externalize.logged  { type, ts }
//           alm.heuristic.added     { id, domain, ts }
//           alm.framework.added     { id, name, ts }
//           alm.feedback.logged     { id, loopType, ts }
//           alm.delta.logged        { id, type, ts }
//
//   exposed: window.almWriteDelta(type, text, meta) — the actual public
//            entry point other modules call to log real growth signal
//            into ALM's delta log. Not a private internal — this is the
//            designed interconnection surface.
//
//   listens: none yet
//
// This is also the real wire for NEXUS-SPEC.md's Part 3.1/3.2 (End-State
// Seeds, Growth Slope) — the delta log's 'horizon' type has existed
// since before this extraction, declared and never used. It's live now:
// Horizon's seed-sprouting and if-then commitment completion, and
// Leverage Map's high-leverage scoring moments, all call the exposed
// almWriteDelta() below directly — that function IS the public
// interconnection point, not a reach into ALM's internals, same as
// almEmit(). A future Growth Slope engine would read this same delta
// log rather than each module computing its own.
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {
  if (typeof MM_WARP === 'undefined') {
    console.warn('[alm] MM_WARP not loaded — alm.* events will not be routed through the bus');
    return;
  }

  const passthrough = { transform() { return null; } };
  ['alm.function.logged', 'alm.model.logged', 'alm.experiment.logged',
   'alm.externalize.logged', 'alm.heuristic.added', 'alm.framework.added',
   'alm.feedback.logged', 'alm.delta.logged'].forEach(sig => {
    MM_WARP.stream.register(new WARP.Gate(sig, passthrough));
  });

  // Small helper other alm/ui.js functions call after a real log action,
  // so the emit call at each site is one line instead of repeating the
  // undefined-check dance every time.
  window.almEmit = function (signature, data) {
    if (typeof MM_WARP === 'undefined') return;
    MM_WARP.stream.emit(new WARP.Event(signature, data || {}));
  };
})();
