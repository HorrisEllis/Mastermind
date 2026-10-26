// ═══════════════════════════════════════════════════════════════════
// LEVERAGE MAP — engine.js
// v1.0.0
//
// Pure logic, no DOM. Implements the leverage equation:
//   L = Tension × Weight × Slope, normalized to a 0–10 score.
//
// This is a LENS on real Mastermind canvas nodes, not a parallel node
// system — any CANVAS.NX node can carry tension/weight/slope/kind
// fields directly. They persist through the canvas's existing save
// path automatically, because they're just more properties on the
// same node object. No new storage was needed to add this.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const LVG_KINDS = {
  friction: { label: 'FRICTION', color: '#ff3355', icon: '⚠' },
  leverage: { label: 'LEVERAGE', color: '#00ff88', icon: '↑' },
  neutral:  { label: 'NEUTRAL',  color: '#00c8ff', icon: '○' },
};

const LVG_DEFAULTS = { tension: 5, weight: 5, slope: 5, kind: 'neutral' };

// L = T × W × S, normalized from a 0–1000 raw product to a 0–10 score.
function lvgCalcScore(node) {
  const t = node.tension ?? LVG_DEFAULTS.tension;
  const w = node.weight  ?? LVG_DEFAULTS.weight;
  const s = node.slope   ?? LVG_DEFAULTS.slope;
  return (t * w * s) / 100;
}

// Mutation probability — how ready this node is to synthesize/combine
// with others, derived directly from its leverage score.
function lvgMutationProbability(score) {
  const pct = Math.min(99, Math.round(score * 10));
  let label;
  if (pct > 70) label = 'High integration potential';
  else if (pct > 40) label = 'Moderate synthesis opportunity';
  else label = 'Low — increase leverage first';
  return { pct, label };
}

function lvgScoreTier(score) {
  if (score > 5) return 'high';
  if (score > 2) return 'mid';
  return 'low';
}

function lvgScoreColor(score) {
  const tier = lvgScoreTier(score);
  return tier === 'high' ? '#00ff88' : tier === 'mid' ? '#ff8c22' : '#ff3355';
}

// Does this node carry leverage data at all, or is it still a plain
// node that's never been scored? Lets the UI distinguish "unscored"
// from "scored neutral" instead of defaulting everything to visible.
function lvgIsScored(node) {
  return node.tension !== undefined || node.weight !== undefined || node.slope !== undefined;
}

window.LVG_KINDS = LVG_KINDS;
window.LVG_DEFAULTS = LVG_DEFAULTS;
window.lvgCalcScore = lvgCalcScore;
window.lvgMutationProbability = lvgMutationProbability;
window.lvgScoreTier = lvgScoreTier;
window.lvgScoreColor = lvgScoreColor;
window.lvgIsScored = lvgIsScored;
