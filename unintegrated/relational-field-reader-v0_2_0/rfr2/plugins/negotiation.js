'use strict';
// negotiation.js — two-person dimension-delta analysis, ported from the NEG
// engine in people-module-raven_negotiation.html.
//
// Decoupled from specific named individuals on request: the original had
// two real people's psychology written as static prose (FRICTION_DEFS.desc,
// VECTOR_DEFINITIONS.desc, and two hardcoded move lists). That's gone. What's
// kept is the actual structural math — which axis pairs lever which target,
// how friction severity is computed — and every description/move below is
// now generated from the live axis deltas via a template, parameterized by
// whichever two person names you pass in. Run it on anyone.
//
// Also fixes a real honesty gap in the original: its comment claimed moves
// were "Generated from highest-weight friction + vector analysis" but they
// were actually two static hardcoded lists, unconnected to the analysis.
// Per AXIOMS §1.1, that doesn't pass — so the moves below are now actually
// derived from the friction/vector results, not just labeled as if they were.
//
// AXIOMS §5.7: no require() of people.js, for either person data or schema.
// Person records are read straight from meta.invariant using the
// 'people:<name>' convention people.js writes — shared storage, not a
// sibling-module dependency. The DIMS schema comes from lib/dims.js, which
// both plugins require independently — neither requires the other.
//
// data shape this plugin reacts to: { negotiation: { a: name, b: name } }
// annotates: data.negotiation.result = { axes, vectors, friction, topDeltas, movesA, movesB }

const { DIMS } = require('./lib/dims.js');

function computeAxes(aDims, bDims) {
  return DIMS.map(d => {
    const av = aDims[d.key] ?? d.def;
    const bv = bDims[d.key] ?? d.def;
    const delta = av - bv;            // signed: + means A higher
    const absDelta = Math.abs(delta);
    return {
      key: d.key, label: d.label, cat: d.cat,
      av: +av.toFixed(3), bv: +bv.toFixed(3),
      delta: +delta.toFixed(3), absDelta: +absDelta.toFixed(3),
      convergence: +(1 - absDelta).toFixed(3),
      weight: d.w,
      frictionScore: +(absDelta * d.w).toFixed(3),
    };
  });
}

function axisOf(axes, key) { return axes.find(a => a.key === key); }

// ── Vector definitions: structural lever→target pairs ───────────────────────
// (the pairing logic is general — kept; the prose is generated, not written)
const VECTOR_DEFINITIONS = [
  { id: 'presence_reciprocity', name: 'Presence ↔ Reciprocity', lever: ['presence', 'reciprocity'], target: 'attachment', threshold: 0.18 },
  { id: 'trust_repair',         name: 'Trust ↔ Repair',         lever: ['trust', 'repair'],         target: 'attachment', threshold: 0.10 },
  { id: 'suppression_affect',   name: 'Suppression ↔ Affect Reg.', lever: ['suppression', 'affect_reg'], target: 'coherence', threshold: 0.12 },
  { id: 'autonomy_intimacy',    name: 'Autonomy ↔ Intimacy',    lever: ['autonomy', 'intimacy'],    target: 'attachment', threshold: 0.15 },
  { id: 'intuition_coherence',  name: 'Intuition ↔ Coherence',  lever: ['intuition', 'coherence'],  target: 'cognitive_bridge', threshold: 0.10 },
  { id: 'meaning_integrity',    name: 'Meaning ↔ Integrity',    lever: ['meaning', 'integrity'],    target: 'resonance', threshold: 0.05 },
];

function vectorSynergy(vd, axes) {
  const leverAxes = vd.lever.map(k => axisOf(axes, k)).filter(Boolean);
  if (!leverAxes.length) return 0;
  return leverAxes.reduce((s,a) => s + a.absDelta, 0) / leverAxes.length;
}

function vectorDescription(vd, axes, nameA, nameB) {
  const leverAxes = vd.lever.map(k => axisOf(axes, k)).filter(Boolean);
  if (!leverAxes.length) return 'Insufficient axis data.';
  const parts = leverAxes.map(a => {
    if (a.absDelta < 0.05) return `${a.label} is closely matched (Δ${a.absDelta}).`;
    const higher = a.delta > 0 ? nameA : nameB;
    return `${higher} scores higher on ${a.label} (Δ${a.absDelta}).`;
  });
  return parts.join(' ');
}

function vectorMove(vd, axes, nameA, nameB) {
  const leverAxes = vd.lever.map(k => axisOf(axes, k)).filter(Boolean);
  const widest = leverAxes.sort((x,y) => y.absDelta - x.absDelta)[0];
  if (!widest || widest.absDelta < 0.05) {
    return `Both are aligned on ${vd.name} — use this as shared ground rather than something to fix.`;
  }
  const higher = widest.delta > 0 ? nameA : nameB;
  const lower  = widest.delta > 0 ? nameB : nameA;
  return `${lower}: name what ${widest.label} looks like from your side. ${higher}: make room for that without assuming your own expression of it is the baseline.`;
}

// ── Friction catalog: axis groupings + severity thresholds ──────────────────
const FRICTION_DEFS = [
  { id: 'presence',     title: 'Presence Encoding',        axes: ['presence'],               sevHigh: 0.25, sevMed: 0.12 },
  { id: 'regulation',   title: 'Regulation vs. Activation', axes: ['regulation','activation'], sevHigh: 0.20, sevMed: 0.10 },
  { id: 'trust',        title: 'Trust Calibration',        axes: ['trust'],                  sevHigh: 0.15, sevMed: 0.08 },
  { id: 'affect_reg',   title: 'Affect Regulation Lag',    axes: ['affect_reg'],             sevHigh: 0.15, sevMed: 0.08 },
  { id: 'autonomy',     title: 'Autonomy Need',            axes: ['autonomy'],               sevHigh: 0.12, sevMed: 0.0  },
  { id: 'suppression',  title: 'Suppression Signal',       axes: ['suppression'],            sevHigh: 0.20, sevMed: 0.10 },
];

function severityOf(fd, avgDelta) {
  if (avgDelta > fd.sevHigh) return 'high';
  if (avgDelta > fd.sevMed)  return 'medium';
  return 'low';
}

function frictionDescription(fd, axes, nameA, nameB) {
  const relAxes = fd.axes.map(k => axisOf(axes, k)).filter(Boolean);
  if (!relAxes.length) return 'Insufficient axis data.';
  return relAxes.map(a => {
    if (a.absDelta < 0.05) return `${nameA} and ${nameB} are closely matched on ${a.label}.`;
    const higher = a.delta > 0 ? nameA : nameB, lower = a.delta > 0 ? nameB : nameA;
    return `${higher} runs higher on ${a.label} than ${lower} (Δ${a.absDelta}) — worth naming directly rather than assuming the other reads it the same way.`;
  }).join(' ');
}

// ── Move generation — actually derived from results, not a static list ──────
// Personalizes the shared descriptive text by swapping the recipient's own
// name for "you" — so movesA and movesB read from each person's own side
// instead of being identical copies (a real bug, caught while testing this:
// the first draft computed shared descText/moveText once and handed both
// people the exact same strings).
function personalize(text, selfName) {
  return text.replace(new RegExp(selfName, 'g'), 'you');
}

function movesFor(personName, otherName, friction, vectors) {
  const moves = [];
  const bySeverity = { high: 0, medium: 1, low: 2 };

  friction
    .filter(f => f.severity !== 'low')
    .sort((a,b) => bySeverity[a.severity] - bySeverity[b.severity])
    .slice(0, 3)
    .forEach(f => {
      moves.push({
        title: `Name ${f.title.toLowerCase()} explicitly`,
        why: personalize(f.descText, personName),
        urgency: f.severity,
      });
    });

  vectors
    .filter(v => v.active)
    .slice(0, 2)
    .forEach(v => {
      moves.push({
        title: `Work the ${v.name} lever`,
        why: personalize(v.moveText, personName),
        urgency: 'medium',
      });
    });

  return moves;
}

function analyze(nameA, aDims, nameB, bDims) {
  const axes = computeAxes(aDims, bDims);

  const vectors = VECTOR_DEFINITIONS.map(vd => {
    const synScore = vectorSynergy(vd, axes);
    const active = synScore > vd.threshold;
    return {
      ...vd, synScore: +synScore.toFixed(3), active,
      descText: vectorDescription(vd, axes, nameA, nameB),
      moveText: vectorMove(vd, axes, nameA, nameB),
    };
  }).sort((a,b) => b.synScore - a.synScore);

  const friction = FRICTION_DEFS.map(fd => {
    const relAxes = fd.axes.map(k => axisOf(axes, k)).filter(Boolean);
    const avgDelta = relAxes.length ? relAxes.reduce((s,a) => s+a.absDelta, 0) / relAxes.length : 0;
    const severity = severityOf(fd, avgDelta);
    return { ...fd, avgDelta: +avgDelta.toFixed(3), severity,
      descText: frictionDescription(fd, axes, nameA, nameB) };
  }).sort((a,b) => bySeverityRank(a.severity) - bySeverityRank(b.severity));

  const topDeltas = [...axes].sort((a,b) => b.frictionScore - a.frictionScore).slice(0, 10);

  return {
    axes, vectors, friction, topDeltas,
    movesA: movesFor(nameA, nameB, friction, vectors),
    movesB: movesFor(nameB, nameA, friction, vectors),
  };
}

function bySeverityRank(s) { return { high:0, medium:1, low:2 }[s] ?? 3; }

module.exports = {
  name: 'negotiation',
  description: 'two-person dimension-delta analysis — friction, convergence vectors, generated moves. Not adversarial: surfaces live gaps for both people to work, not a case against either.',
  priority: 30, // after people + liminal have had a chance to update dimensions

  process(data, meta /*, config */) {
    if (!data || typeof data !== 'object' || !data.negotiation) return data;

    const { a, b } = data.negotiation;
    if (!a || !b) {
      meta.bus.emit('negotiation:error', { reason: 'missing-names', got: data.negotiation });
      return data;
    }

    const personA = meta.invariant.get('people:' + a);
    const personB = meta.invariant.get('people:' + b);
    if (!personA || !personB) {
      meta.bus.emit('negotiation:error', { reason: 'not-found', a, b }); // §1.2 — loud, not silent
      return data;
    }

    const result = analyze(a, personA.dimensions, b, personB.dimensions);
    data.negotiation.result = result;
    meta.ledger.append('negotiation', { a, b, frictionCount: result.friction.filter(f=>f.severity!=='low').length, ts: Date.now() });
    meta.bus.emit('negotiation:analyzed', { a, b, ts: Date.now() });

    return data;
  },

  ui: {
    panel: 'negotiation',
    widget: 'radar-and-list',
    emits: ['negotiation:analyzed', 'negotiation:error'],
  },
};
