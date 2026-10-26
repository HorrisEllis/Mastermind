// ═══════════════════════════════════════════════════════════════════
// LEVERAGE MAP — events.js
// v1.0.0
//
// This module's public bus contract. Read this file to know everything
// another module is allowed to assume about Leverage Map, per the
// module contract in NEXUS-SPEC.md Part 2.4.
//
//   emits:  leverage.node.scored     { id, score, tension, weight, slope }
//           leverage.node.kind_set   { id, kind }
//
//   listens: none yet
//
// Real interconnection, built directly in ui.js's lvgSliderChanged():
// when a node crosses into the high-leverage tier, it calls ALM's
// exposed window.almWriteDelta() directly rather than going through the
// bus. Why not a second Gate on leverage.node.scored — WARP's
// Stream.register() throws on a signature collision, so only one Gate
// can own a given event type; a real listener would need Gate chaining
// (returning a new Event from transform()), but that only reaches
// MM_WARP's internal audit log, not ALM's actual user-visible Delta Log
// UI, which lives in localStorage and needs almWriteDelta() called
// directly to populate. almWriteDelta is documented as ALM's public
// interconnection surface for exactly this reason — calling it isn't a
// reach into ALM's internals.
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {
  if (typeof MM_WARP === 'undefined') {
    console.warn('[leverage-map] MM_WARP not loaded — leverage.* events will not be routed through the bus');
    return;
  }

  // Real Gates for both event types, so they're accounted in
  // MM_WARP.log.entries() like everything else on the spine, instead of
  // landing in stream.pending with nothing claiming them.
  MM_WARP.stream.register(new WARP.Gate('leverage.node.scored', {
    transform() { return null; }, // terminal — logged, no further routing yet
  }));
  MM_WARP.stream.register(new WARP.Gate('leverage.node.kind_set', {
    transform() { return null; },
  }));
})();
