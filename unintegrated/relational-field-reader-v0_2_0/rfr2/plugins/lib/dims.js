'use strict';
// lib/dims.js — shared 24-axis dimension schema.
// Factored out of people.js so that negotiation.js can use the same schema
// without require()-ing a sibling plugin (AXIOMS §5.7). Both plugins require
// this file; neither requires the other. Person *data* still only flows
// between them via meta.invariant — this file carries only the static schema.

const DIMS = [
  {cat:'emotional',  key:'valence',     label:'valence',      r:[-1,1], def:0.0, w:1.0},
  {cat:'emotional',  key:'arousal',     label:'arousal',      r:[0,1],  def:0.3, w:0.7},
  {cat:'emotional',  key:'empathy',     label:'empathy',      r:[0,1],  def:0.6, w:1.2},
  {cat:'emotional',  key:'affect_reg',  label:'affect reg.',  r:[0,1],  def:0.5, w:0.8},
  {cat:'cognitive',  key:'openness',    label:'openness',     r:[0,1],  def:0.6, w:1.1},
  {cat:'cognitive',  key:'complexity',  label:'complexity',   r:[0,1],  def:0.5, w:0.9},
  {cat:'cognitive',  key:'curiosity',   label:'curiosity',    r:[0,1],  def:0.7, w:1.0},
  {cat:'cognitive',  key:'intuition',   label:'intuition',    r:[0,1],  def:0.5, w:0.7},
  {cat:'nervous',    key:'coherence',   label:'coherence',    r:[0,1],  def:0.6, w:1.3},
  {cat:'nervous',    key:'suppression', label:'suppression',  r:[0,1],  def:0.1, w:1.0},
  {cat:'nervous',    key:'activation',  label:'activation',   r:[0,1],  def:0.4, w:0.7},
  {cat:'nervous',    key:'regulation',  label:'regulation',   r:[0,1],  def:0.6, w:0.9},
  {cat:'relational', key:'attachment',  label:'attachment',   r:[0,1],  def:0.6, w:1.2},
  {cat:'relational', key:'trust',       label:'trust',        r:[0,1],  def:0.6, w:1.3},
  {cat:'relational', key:'reciprocity', label:'reciprocity',  r:[0,1],  def:0.5, w:1.1},
  {cat:'relational', key:'repair',      label:'repair',       r:[0,1],  def:0.5, w:1.0},
  {cat:'values',     key:'integrity',   label:'integrity',    r:[0,1],  def:0.7, w:1.4},
  {cat:'values',     key:'justice',     label:'justice',      r:[0,1],  def:0.6, w:1.2},
  {cat:'values',     key:'meaning',     label:'meaning',      r:[0,1],  def:0.6, w:1.3},
  {cat:'values',     key:'autonomy',    label:'autonomy',     r:[0,1],  def:0.6, w:0.9},
  {cat:'love',       key:'love_lang',   label:'love lang.',   r:[0,1],  def:0.5, w:1.1},
  {cat:'love',       key:'intimacy',    label:'intimacy',     r:[0,1],  def:0.5, w:1.2},
  {cat:'love',       key:'presence',    label:'presence',     r:[0,1],  def:0.6, w:1.3},
  {cat:'love',       key:'care',        label:'care',         r:[0,1],  def:0.7, w:1.4},
];

function defaultDims() {
  const d = {};
  DIMS.forEach(dim => { d[dim.key] = dim.def; });
  return d;
}

function similarity(a, b) {
  const cats = [...new Set(DIMS.map(d => d.cat))];
  const catScores = {};
  cats.forEach(cat => {
    const dims = DIMS.filter(d => d.cat === cat);
    let num = 0, totalW = 0;
    dims.forEach(d => {
      const [mn, mx] = d.r, norm = mx - mn;
      const va = ((a[d.key] ?? d.def) - mn) / norm;
      const vb = ((b[d.key] ?? d.def) - mn) / norm;
      num += (1 - Math.abs(va - vb)) * d.w;
      totalW += d.w;
    });
    catScores[cat] = totalW > 0 ? num / totalW : 0;
  });
  const vals = Object.values(catScores);
  const harm = vals.length / vals.reduce((s, v) => s + 1 / (v + 0.001), 0);
  return { total: Math.round(harm * 100), cats: catScores };
}

module.exports = { DIMS, defaultDims, similarity };
