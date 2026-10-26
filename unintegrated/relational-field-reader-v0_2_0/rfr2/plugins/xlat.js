'use strict';
// xlat.js — wraps the real XLATBridge engine (lib/xlat-bridge.js, converted
// from ESM to CommonJS — verified working: see ENHANCE notes) as an ICO plugin.
//
// Uses XLATBridge's direct translate(senderState, receiverState) API rather
// than its full bus-driven .start() — that path listens for ALK-specific
// event names (alk.htl.ns.state, etc.) that nothing in this build emits.
// The direct API is stateless per call (confirmed by reading its body: it
// only touches local variables, never this._persons/_history), so one
// module-level XLATBridge instance is safe to reuse across every pipe call.
//
// data shape this plugin reacts to: { xlat: { text, from?, to?,
//   senderState?, receiverState? } }
// annotates: data.xlat.result = { decoded, transcoded, rendered }
//
// IMPORTANT, read before trusting the output: people.js's 24-axis dimension
// model and XLATBridge's expected state shape (ns.polyvagalState, att.pattern,
// etc.) were never designed against each other. approxStateFromDims() below
// is a rough, unvalidated heuristic bridge between them — built so 'to'/'from'
// person-name lookups produce *something*, not because the mapping has been
// checked against real outcomes. If you pass senderState/receiverState
// explicitly instead of a person name, you bypass this heuristic entirely —
// do that for anything that matters. Tightening or replacing this mapping is
// flagged for the enhance pass, not solved here.

const { XLATBridge } = require('./lib/xlat-bridge.js');

let bridge = null;
function getBridge(bus) {
  if (!bridge) bridge = new XLATBridge({ bus });
  return bridge;
}

function approxStateFromDims(dims) {
  if (!dims) return {};
  const ns = {
    polyvagalState: dims.suppression > 0.5 ? 'freeze'
      : (dims.arousal > 0.65 && dims.affect_reg < 0.5) ? 'hyperarousal'
      : 'ventral',
    windowZone: dims.coherence > 0.6 ? 'wide' : 'narrow',
  };
  const att = {
    pattern: dims.attachment > 0.75 ? 'SECURE'
      : (dims.trust < 0.5 ? 'AVOIDANT' : 'ANXIOUS'),
  };
  return { ns, att };
}

module.exports = {
  name: 'xlat',
  description: 'real-time translation between two expression systems, via XLATBridge.translate(). See header for the dims-mapping caveat.',
  priority: 22, // after liminal (20) annotates gaps, before negotiation (30)

  process(data, meta /*, config */) {
    if (!data || typeof data !== 'object' || !data.xlat) return data;

    const x = data.xlat;
    if (typeof x.text !== 'string') {
      meta.bus.emit('xlat:error', { reason: 'missing-text' }); // §1.2 — loud
      return data;
    }

    let senderState = x.senderState || {};
    let receiverState = x.receiverState || {};

    if (!x.senderState && x.from) {
      const p = meta.invariant.get('people:' + x.from);
      if (p) Object.assign(senderState, approxStateFromDims(p.dimensions));
      else meta.bus.emit('xlat:warn', { reason: 'from-not-found', from: x.from });
    }
    if (!x.receiverState && x.to) {
      const p = meta.invariant.get('people:' + x.to);
      if (p) Object.assign(receiverState, approxStateFromDims(p.dimensions));
      else meta.bus.emit('xlat:warn', { reason: 'to-not-found', to: x.to });
    }

    senderState.transcript = x.text;

    const b = getBridge(meta.bus);
    const result = b.translate(senderState, receiverState);

    x.result = result;
    meta.ledger.append('xlat', { from: x.from || null, to: x.to || null, text: x.text, grammar: result.transcoded.convertedTo, ts: Date.now() });
    meta.bus.emit('xlat:translated', { from: x.from || null, to: x.to || null, grammar: result.transcoded.convertedTo, ts: Date.now() });

    return data; // annotates only — never drops
  },

  ui: {
    panel: 'xlat',
    widget: 'transcript',
    emits: ['xlat:translated', 'xlat:error', 'xlat:warn'],
  },
};
