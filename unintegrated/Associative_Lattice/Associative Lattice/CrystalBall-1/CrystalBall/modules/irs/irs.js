/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  INTEGRATIVE RELATIONAL SYSTEMS MODULE  ·  irs.js  ·  v1.0.0          ║
 * ║  UUID: alk-mod-irs-0000-2300-0000-000000000001                         ║
 * ║  HOOK: alk.module.irs:integrative-relational:00001                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signals. Not diagnoses. Not judgments.
 * §1.2 — All failures loud and specific. Zero silent failures.
 * §3.1 — Bottom-up only. Data → structure → inference → action.
 * §5.1 — UUID + hook + bus on every detector.
 * §5.5 — No external runtime dependencies.
 * §5.6 — Same structural pattern across all abstraction layers.
 * §5.7 — Zero direct module calls. All I/O via kernel events only.
 * §5.8 — Composable detectors, not configured monolith.
 * §8.2 — Hostile review before spec: conditions gate all inversions.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The IRS tracks the structural physics of a relational field.
 * Not what people feel. Not who they are. The shape of what is happening
 * BETWEEN them — and specifically: the gaps, the edges, and the points
 * where meaning inverts.
 *
 * From the Systems Module definition:
 *
 *   GAP   = σ deviation above tolerance band
 *            Statistically significant misalignment from invariant expectation.
 *            NOT "missing connection" — deviation beyond the noise floor.
 *
 *   EDGE  = stabilized low-σ constraint between agents
 *            A constrained, repeatable low-variance relational channel.
 *            NOT just "connection" — a bidirectional feedback loop with
 *            invariant-driven sigma measurement.
 *
 *   INVERSION = reinterpretation of σ mapping function, not state flip
 *               Changes the model, not the world-state.
 *               Only valid under conditional gates (scale, baseline,
 *               variance, and regime constraints).
 *
 * Multi-scale sigma field (from the Systems Module):
 *   σₙ  — noise scale    (micro: tone shifts, word choice variance)
 *   σₜ  — temporal drift (slow: trust decay, semantic drift, reciprocity)
 *   σₛ  — structural     (system: rupture, role change, narrative collapse)
 *   σᵣ  — asymmetry      (bidirectional imbalance, attention divergence)
 *
 * Invariant baseline is adaptive, co-constructed, recursively updated:
 *   Invariant_{t+1} = Invariant_t + learning_rate × deviation
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECTION DOMAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. GAP ANALYZER          — surfaces statistically significant deviations
 *                            across all 4 sigma scales
 * 2. EDGE ENGINE           — measures, classifies, and scores relational edges
 *                            (G₀ creation, G₁ reciprocity, G₂ alignment)
 * 3. INVERSION OPERATOR    — applies conditional epistemic reframing
 *                            (guarded by 5 validity conditions)
 * 4. RESONANCE MAPPER      — dynamic comparison of identity profiles
 *                            with feedback loop integration
 * 5. META-RELATIONAL LAYER — recursive subrelation and meta-structure analysis
 * 6. SCORE PROFILE ENGINE  — unified relational score visualization layer
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Listens:
 *   alk.gap.composite              — from GapHunter
 *   alk.gap.shadow_field
 *   alk.rel.rupture.detected       — from Relational module
 *   alk.rel.repair.attempt
 *   alk.rel.trajectory.update
 *   alk.latent.update              — from LatentModel
 *   alk.suppression.update         — from SuppressionScore
 *   alk.signal.composite           — from SignalTopology
 *   alk.verbal.chunk.transcribed
 *   alk.session.capture.start / stop
 *   resonance.result               — from Resonance scoring engine
 *   ase.signature.updated          — from ASE
 *
 * Emits:
 *   irs.gap.detected               — new gap identified with sigma scale
 *   irs.gap.resolved               — gap bridged via edge or repair
 *   irs.edge.created               — new relational edge established
 *   irs.edge.dissolved             — edge decayed or broken
 *   irs.edge.misaligned            — G₂ structural gap on existing edge
 *   irs.inversion.triggered        — valid inversion condition met
 *   irs.inversion.blocked          — inversion attempted but conditions failed
 *   irs.resonance.map.updated      — resonance field comparison updated
 *   irs.meta.subrelation           — meta-relational structure detected
 *   irs.score.profile              — unified relational score snapshot
 *   irs.baseline.updated           — invariant baseline adapted
 *   irs.error
 */

'use strict';

import { ALKModule } from '../../kernel.js';

// ─── Version ──────────────────────────────────────────────────────────────────

export const IRS_VERSION = '1.0.0';
export const IRS_UUID    = 'alk-mod-irs-0000-2300-0000-000000000001';

// ─── Utilities ────────────────────────────────────────────────────────────────

function r4(n)            { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr)        { return arr.length ? arr.reduce((s,v) => s+v, 0) / arr.length : 0; }
function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s,v) => s + (v - m) ** 2, 0) / arr.length;
}
function stddev(arr)      { return Math.sqrt(variance(arr)); }
function zscore(v, m, sd) { return sd < 1e-9 ? 0 : (v - m) / sd; }

class SlidingWindow {
  constructor(cap) { this._buf = []; this._cap = cap; }
  push(v)    { this._buf.push(v); if (this._buf.length > this._cap) this._buf.shift(); }
  get vals() { return this._buf; }
  get len()  { return this._buf.length; }
  avg()      { return mean(this._buf); }
  std()      { return stddev(this._buf); }
  last()     { return this._buf[this._buf.length - 1] ?? null; }
  clear()    { this._buf = []; }
}

const CONF = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });
function conf(v) { return v >= 0.65 ? CONF.HIGH : v >= 0.35 ? CONF.MEDIUM : CONF.LOW; }

// ─── Sigma Scale Constants ────────────────────────────────────────────────────

export const SIGMA_SCALE = Object.freeze({
  NOISE:      'σₙ',  // micro fluctuations
  TEMPORAL:   'σₜ',  // slow drift
  STRUCTURAL: 'σₛ',  // system-level shift
  ASYMMETRY:  'σᵣ',  // bidirectional imbalance
});

export const GAP_TYPE = Object.freeze({
  G0: 'G0_CREATION',          // new connection not yet formed
  G1: 'G1_RECIPROCITY',       // one-sided → needs bidirectional completion
  G2: 'G2_ALIGNMENT',         // connection exists, mapping broken
});

export const EDGE_TYPE = Object.freeze({
  NASCENT:       'NASCENT',       // forming, low confidence
  ESTABLISHED:   'ESTABLISHED',   // stable, bidirectional, low variance
  STRESSED:      'STRESSED',      // active but high variance
  MISALIGNED:    'MISALIGNED',    // G2 structural gap
  DISSOLVED:     'DISSOLVED',     // decayed, feedback loop broken
});

export const INVERSION_TYPE = Object.freeze({
  EPISTEMIC:     'EPISTEMIC',     // reinterpretation of σ mapping function
  TEMPORAL:      'TEMPORAL',      // past reading was valid; now invalid (regime shift)
  FRAME:         'FRAME',         // implicit model assumption inverted
  POLARITY:      'POLARITY',      // valence inversion (positive ↔ negative read)
});

// ─── 1. ADAPTIVE INVARIANT BASELINE ──────────────────────────────────────────
//
// The baseline is NOT static. It is co-constructed and recursively updated.
// Invariant_{t+1} = Invariant_t + α × deviation
//
// This prevents the "frozen ideal" failure mode: a baseline that breaks
// the moment real-world variance appears.

export class AdaptiveBaseline {
  static UUID    = 'alk-irs-baseline-0000-2300-0000-000000000010';
  static VERSION = IRS_VERSION;

  constructor({ alpha = 0.08, windowSize = 40 } = {}) {
    this._alpha     = alpha;       // learning rate
    this._baseline  = new Map();   // axis → running estimate
    this._history   = new Map();   // axis → SlidingWindow
    this._windowCap = windowSize;
  }

  // Register a named axis with initial value
  register(axis, initialValue = 0.5) {
    if (!this._baseline.has(axis)) {
      this._baseline.set(axis, initialValue);
      this._history.set(axis, new SlidingWindow(this._windowCap));
    }
  }

  // Update axis with new observation. Returns deviation from baseline.
  update(axis, value) {
    if (!this._baseline.has(axis)) this.register(axis, value);

    const current = this._baseline.get(axis);
    const deviation = value - current;

    // Adaptive update: baseline moves toward new observations
    const next = current + this._alpha * deviation;
    this._baseline.set(axis, next);
    this._history.get(axis).push(value);

    return {
      axis,
      value:    r4(value),
      baseline: r4(next),
      deviation: r4(deviation),
      absDeviation: r4(Math.abs(deviation)),
      sigma: r4(this._history.get(axis).std()),
    };
  }

  // Multi-scale sigma scores for a given axis
  sigmaScores(axis) {
    const hist = this._history.get(axis);
    if (!hist || hist.len < 3) return null;

    const vals = hist.vals;
    const baseline = this._baseline.get(axis);
    const recent = vals.slice(-5);
    const older  = vals.slice(-20, -5);

    // σₙ — noise: recent micro variance
    const noiseSD = stddev(recent);

    // σₜ — temporal drift: mean of recent vs older
    const temporalDrift = older.length > 2
      ? Math.abs(mean(recent) - mean(older))
      : 0;

    // σₛ — structural: Z-score of last value from global baseline
    const globalSD = stddev(vals);
    const lastZ    = zscore(vals[vals.length - 1], baseline, globalSD);

    // σᵣ — asymmetry score requires external dyadic feed (set externally)
    return {
      axis,
      [SIGMA_SCALE.NOISE]:      r4(noiseSD),
      [SIGMA_SCALE.TEMPORAL]:   r4(temporalDrift),
      [SIGMA_SCALE.STRUCTURAL]: r4(Math.abs(lastZ)),
      [SIGMA_SCALE.ASYMMETRY]:  null,   // injected by EdgeEngine
      baseline: r4(baseline),
    };
  }

  snapshot() {
    const result = {};
    this._baseline.forEach((v, k) => { result[k] = r4(v); });
    return result;
  }
}

// ─── 2. GAP ANALYZER ──────────────────────────────────────────────────────────
//
// GAP = σ deviation above tolerance band.
// Not "missing connection" — statistically significant misalignment.
//
// Detection axes:
//   A. Coherence collapse     — all channels diverge simultaneously
//   B. Reciprocity failure    — bid-response ratio collapses
//   C. Semantic drift         — shared vocabulary losing charge
//   D. Suppression gap        — surface ↔ inferred state distance
//   E. Temporal gap           — phase misalignment between agents
//   F. Structural assumption  — implicit frame no longer shared

export class GapAnalyzer {
  static UUID    = 'alk-irs-gap-0000-2300-0000-000000000020';
  static VERSION = IRS_VERSION;

  // Sigma thresholds for gap classification
  static NOISE_THRESHOLD      = 0.15;   // σₙ > 0.15 → micro gap
  static TEMPORAL_THRESHOLD   = 0.20;   // σₜ > 0.20 → drift gap
  static STRUCTURAL_THRESHOLD = 2.0;    // |Z| > 2.0 → structural gap
  static ASYMMETRY_THRESHOLD  = 0.25;   // σᵣ > 0.25 → asymmetric gap

  constructor(baseline) {
    this._baseline     = baseline;   // AdaptiveBaseline ref
    this._coherenceW   = new SlidingWindow(30);
    this._reciprocityW = new SlidingWindow(30);
    this._semanticW    = new SlidingWindow(30);
    this._suppressionW = new SlidingWindow(30);
    this._sessionGaps  = [];
  }

  feedCoherence(v)   { this._coherenceW.push(v);   }
  feedReciprocity(v) { this._reciprocityW.push(v);  }
  feedSemantic(v)    { this._semanticW.push(v);     }
  feedSuppression(v) { this._suppressionW.push(v);  }

  // Classify gap type from sigmas
  _classifyGapType(sigmaScores, axisValues) {
    const { [SIGMA_SCALE.NOISE]: sn,
            [SIGMA_SCALE.TEMPORAL]: st,
            [SIGMA_SCALE.STRUCTURAL]: ss,
            [SIGMA_SCALE.ASYMMETRY]: sr } = sigmaScores;

    // G2 first — most common and most psychologically important
    // "we are still connected, but no longer aligned"
    if (ss > GapAnalyzer.STRUCTURAL_THRESHOLD && (sn || 0) < GapAnalyzer.NOISE_THRESHOLD * 2) {
      return GAP_TYPE.G2;
    }

    // G1 — asymmetry gap (one-sided → needs bidirectional completion)
    if ((sr || 0) > GapAnalyzer.ASYMMETRY_THRESHOLD) {
      return GAP_TYPE.G1;
    }

    // G0 — new connection not yet formed (coherence low, no prior edge)
    return GAP_TYPE.G0;
  }

  analyze({ coherence, reciprocity, semanticAlignment, suppression, suppressionBaseline }) {
    if (coherence !== undefined)  this.feedCoherence(coherence);
    if (reciprocity !== undefined) this.feedReciprocity(reciprocity);
    if (semanticAlignment !== undefined) this.feedSemantic(semanticAlignment);
    if (suppression !== undefined) this.feedSuppression(suppression);

    const cSigma = this._baseline.update('coherence',    this._coherenceW.last()   ?? 0.5);
    const rSigma = this._baseline.update('reciprocity',  this._reciprocityW.last() ?? 0.5);
    const sSigma = this._baseline.update('semantic',     this._semanticW.last()    ?? 0.5);
    const pSigma = this._baseline.update('suppression',  this._suppressionW.last() ?? 0);

    const sigmaScores = {
      [SIGMA_SCALE.NOISE]:      r4(mean([cSigma.sigma, rSigma.sigma, sSigma.sigma])),
      [SIGMA_SCALE.TEMPORAL]:   r4(mean([
        Math.abs(this._coherenceW.avg() - 0.5),
        Math.abs(this._reciprocityW.avg() - 0.5),
      ])),
      [SIGMA_SCALE.STRUCTURAL]: r4(Math.max(
        Math.abs(cSigma.deviation) / Math.max(cSigma.sigma, 0.01),
        Math.abs(rSigma.deviation) / Math.max(rSigma.sigma, 0.01),
      )),
      [SIGMA_SCALE.ASYMMETRY]:  r4(Math.abs(rSigma.deviation)),
    };

    // Is there a gap? Any threshold exceeded.
    const gapDetected =
      sigmaScores[SIGMA_SCALE.NOISE]      > GapAnalyzer.NOISE_THRESHOLD ||
      sigmaScores[SIGMA_SCALE.TEMPORAL]   > GapAnalyzer.TEMPORAL_THRESHOLD ||
      sigmaScores[SIGMA_SCALE.STRUCTURAL] > GapAnalyzer.STRUCTURAL_THRESHOLD ||
      sigmaScores[SIGMA_SCALE.ASYMMETRY]  > GapAnalyzer.ASYMMETRY_THRESHOLD;

    if (!gapDetected) return null;

    const dominantScale = Object.entries(sigmaScores)
      .filter(([, v]) => v != null)
      .reduce((a, b) => (a[1] > b[1] ? a : b))[0];

    const gapType = this._classifyGapType(sigmaScores, {
      coherence, reciprocity, semanticAlignment, suppression
    });

    const magnitude = r4(clamp(
      mean(Object.values(sigmaScores).filter(v => v != null)) / 3,
      0, 1
    ));

    const gap = {
      id:             `gap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      uuid:           GapAnalyzer.UUID,
      detectedAt:     Date.now(),
      gapType,
      dominantScale,
      sigmaScores,
      magnitude,
      confidence:     conf(magnitude),
      axes: { cSigma, rSigma, sSigma, pSigma },
      // What closing this gap would require
      resolution: gapType === GAP_TYPE.G0 ? 'edge_creation'
                : gapType === GAP_TYPE.G1 ? 'reciprocity_completion'
                :                           'alignment_repair',
    };

    this._sessionGaps.push(gap);
    return gap;
  }

  sessionSummary() {
    const byType = {};
    this._sessionGaps.forEach(g => {
      byType[g.gapType] = (byType[g.gapType] || 0) + 1;
    });
    return {
      total:    this._sessionGaps.length,
      byType,
      meanMagnitude: r4(mean(this._sessionGaps.map(g => g.magnitude))),
      mostFrequent: Object.entries(byType).sort((a,b) => b[1]-a[1])[0]?.[0] || null,
    };
  }
}

// ─── 3. EDGE ENGINE ───────────────────────────────────────────────────────────
//
// EDGE = stabilized low-σ constraint between agents.
// Not just "connection" — a constrained, repeatable low-variance
// relational channel with bidirectional feedback loop measurement.
//
// Three edge cases (from Systems Module):
//   G₀ → edge creation    (new connection formed)
//   G₁ → reciprocity completion (one-sided → bidirectional)
//   G₂ → alignment        (misaligned → coherent mapping)
//
// EDGE DISSOLUTION happens three ways:
//   2.1 Connection decays              → G₁ or G₀
//   2.2 Mapping breaks                 → G₂ (structural gap)
//   2.3 Conflict inversion (overwrite) → semantic divergence

export class EdgeEngine {
  static UUID    = 'alk-irs-edge-0000-2300-0000-000000000030';
  static VERSION = IRS_VERSION;

  // Thresholds for edge lifecycle
  static FORMATION_THRESHOLD   = 0.55;   // coherence above this → nascent edge
  static ESTABLISHED_THRESHOLD = 0.70;   // sustained above this → established
  static STRESS_THRESHOLD      = 0.40;   // drops below this → stressed
  static DISSOLUTION_THRESHOLD = 0.25;   // sustained below this → dissolved

  // σ thresholds for edge quality
  static LOW_SIGMA_THRESHOLD   = 0.12;   // edge is stable if σ < this
  static HIGH_SIGMA_THRESHOLD  = 0.30;   // edge is stressed if σ > this

  constructor(baseline) {
    this._baseline  = baseline;
    this._edges     = new Map();   // edgeId → EdgeRecord
    this._bidirW    = new SlidingWindow(40);   // bidirectional coherence
    this._sigmaW    = new SlidingWindow(40);   // variance tracking
    this._investW   = new Map();   // agentId → SlidingWindow (asymmetry)
  }

  _edgeId(agentA, agentB) {
    return [agentA, agentB].sort().join('::');
  }

  // Register or update investment for an agent (for σᵣ asymmetry)
  feedInvestment(agentId, value) {
    if (!this._investW.has(agentId)) {
      this._investW.set(agentId, new SlidingWindow(30));
    }
    this._investW.get(agentId).push(value);
  }

  // Compute σᵣ — bidirectional asymmetry
  _asymmetrySigma(agentA, agentB) {
    const wA = this._investW.get(agentA);
    const wB = this._investW.get(agentB);
    if (!wA || !wB || wA.len < 3 || wB.len < 3) return null;
    return r4(Math.abs(wA.avg() - wB.avg()));
  }

  // Measure current bidirectional coherence
  measure(agentA, agentB, { coherence, mutualElaboration, responseRatio, sharedVocabDensity }) {
    const edgeId = this._edgeId(agentA, agentB);

    // Bidirectional coherence score
    const bidir = r4(clamp(
      (coherence || 0)          * 0.35 +
      (mutualElaboration || 0)  * 0.30 +
      (responseRatio || 0)      * 0.25 +
      (sharedVocabDensity || 0) * 0.10,
      0, 1
    ));

    this._bidirW.push(bidir);
    const bSigma = this._baseline.update(`edge.${edgeId}.bidir`, bidir);
    const asymmetry = this._asymmetrySigma(agentA, agentB);

    // Update baseline asymmetry
    if (asymmetry !== null) {
      this._baseline.update(`edge.${edgeId}.asymmetry`, asymmetry);
    }

    const sigmaScores = this._baseline.sigmaScores(`edge.${edgeId}.bidir`);
    if (sigmaScores && asymmetry !== null) {
      sigmaScores[SIGMA_SCALE.ASYMMETRY] = asymmetry;
    }

    // Determine or update edge state
    const existing = this._edges.get(edgeId);
    const avgBidir = this._bidirW.avg();
    const sigmaVal = this._bidirW.std();

    let edgeType;
    if (avgBidir >= EdgeEngine.ESTABLISHED_THRESHOLD && sigmaVal < EdgeEngine.LOW_SIGMA_THRESHOLD) {
      edgeType = EDGE_TYPE.ESTABLISHED;
    } else if (avgBidir >= EdgeEngine.FORMATION_THRESHOLD) {
      edgeType = sigmaVal > EdgeEngine.HIGH_SIGMA_THRESHOLD
        ? EDGE_TYPE.STRESSED
        : EDGE_TYPE.NASCENT;
    } else if (avgBidir < EdgeEngine.DISSOLUTION_THRESHOLD) {
      edgeType = EDGE_TYPE.DISSOLVED;
    } else if (existing?.edgeType === EDGE_TYPE.ESTABLISHED && sigmaVal > EdgeEngine.HIGH_SIGMA_THRESHOLD) {
      edgeType = EDGE_TYPE.MISALIGNED;   // G2: still connected, mapping broken
    } else {
      edgeType = existing?.edgeType || EDGE_TYPE.NASCENT;
    }

    const edge = {
      id:          edgeId,
      uuid:        EdgeEngine.UUID,
      agentA, agentB,
      edgeType,
      bidir:       r4(bidir),
      avgBidir:    r4(avgBidir),
      sigma:       r4(sigmaVal),
      asymmetry:   asymmetry !== null ? r4(asymmetry) : null,
      sigmaScores,
      confidence:  conf(bidir),
      measuredAt:  Date.now(),
      // Gap type this edge is currently resolving (if any)
      resolvingGap: edgeType === EDGE_TYPE.NASCENT      ? GAP_TYPE.G0
                  : edgeType === EDGE_TYPE.MISALIGNED    ? GAP_TYPE.G2
                  : edgeType === EDGE_TYPE.STRESSED      ? GAP_TYPE.G1
                  : null,
      // Previous state for transition detection
      previousType: existing?.edgeType || null,
    };

    this._edges.set(edgeId, edge);
    return edge;
  }

  getEdge(agentA, agentB) {
    return this._edges.get(this._edgeId(agentA, agentB)) || null;
  }

  allEdges() { return Array.from(this._edges.values()); }

  networkSnapshot() {
    const edges = this.allEdges();
    return {
      totalEdges:      edges.length,
      established:     edges.filter(e => e.edgeType === EDGE_TYPE.ESTABLISHED).length,
      stressed:        edges.filter(e => e.edgeType === EDGE_TYPE.STRESSED).length,
      misaligned:      edges.filter(e => e.edgeType === EDGE_TYPE.MISALIGNED).length,
      dissolved:       edges.filter(e => e.edgeType === EDGE_TYPE.DISSOLVED).length,
      meanBidir:       r4(mean(edges.map(e => e.avgBidir))),
      meanAsymmetry:   r4(mean(edges.map(e => e.asymmetry || 0))),
    };
  }
}

// ─── 4. INVERSION OPERATOR ────────────────────────────────────────────────────
//
// INVERSION = reinterpretation of σ mapping function, not state flip.
// Changes the MODEL, not the world-state.
//
// This is where most systems fail — they think inversion is structural
// when it is actually epistemic.
//
// 5-condition validity gate (all must pass for inversion to fire):
//   C1. Scale validity      — σ scale is correctly identified
//   C2. Baseline stability  — baseline is stable enough to invert against
//   C3. Variance non-noise  — variance is not noise-dominated
//   C4. Regime stability    — regime has not shifted mid-observation
//   C5. Temporal integrity  — inversion window has not elapsed

export class InversionOperator {
  static UUID    = 'alk-irs-inversion-0000-2300-0000-000000000040';
  static VERSION = IRS_VERSION;

  constructor() {
    this._inversionLog   = [];
    this._regimeHistory  = new SlidingWindow(20);
    this._blockedCount   = 0;
    this._firedCount     = 0;
  }

  // C1: Scale validity — is the dominant sigma scale correctly identified?
  _checkScaleValidity(sigmaScores) {
    const scores = Object.entries(sigmaScores)
      .filter(([,v]) => v != null)
      .map(([,v]) => v);
    if (!scores.length) return { pass: false, reason: 'no sigma scores available' };
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    // Scale is valid if there's a clear dominant (max > 2× second)
    const sorted = scores.slice().sort((a,b) => b - a);
    const dominant = sorted[0];
    const second   = sorted[1] ?? 0;
    const clearDominant = dominant > second * 1.5;
    return {
      pass:   clearDominant,
      reason: clearDominant ? 'dominant scale identified' : 'ambiguous sigma scale — cannot invert safely',
      dominant: Object.entries(sigmaScores).find(([,v]) => v === dominant)?.[0],
    };
  }

  // C2: Baseline stability — baseline must be converged enough
  _checkBaselineStability(baseline, sigmaScores) {
    // Stability proxy: structural sigma should be < 3.0 (not in rupture)
    const structural = sigmaScores[SIGMA_SCALE.STRUCTURAL] ?? 0;
    const pass = structural < 3.0;
    return { pass, reason: pass ? 'baseline stable' : `baseline unstable — structural σ=${structural.toFixed(2)}` };
  }

  // C3: Variance not noise-dominated
  _checkNoiseFloor(sigmaScores) {
    const noise = sigmaScores[SIGMA_SCALE.NOISE] ?? 0;
    const structural = sigmaScores[SIGMA_SCALE.STRUCTURAL] ?? 0;
    // Signal must rise above noise floor
    const snr = structural / Math.max(noise, 0.01);
    const pass = snr > 1.5;
    return { pass, reason: pass ? `SNR ${snr.toFixed(2)} above floor` : `noise-dominated (SNR ${snr.toFixed(2)})` };
  }

  // C4: Regime stability — no mid-observation regime shift
  _checkRegimeStability(currentRegime) {
    this._regimeHistory.push(currentRegime);
    if (this._regimeHistory.len < 5) return { pass: true, reason: 'insufficient history, assuming stable' };
    const regimeSD = this._regimeHistory.std();
    const pass = regimeSD < 0.20;
    return { pass, reason: pass ? 'regime stable' : `regime shifting — σ=${regimeSD.toFixed(2)}` };
  }

  // C5: Temporal integrity — inversion window (default 60s)
  _checkTemporalIntegrity(lastInversionAt, windowMs = 60000) {
    if (!lastInversionAt) return { pass: true, reason: 'no prior inversion' };
    const elapsed = Date.now() - lastInversionAt;
    const pass = elapsed > windowMs;
    return { pass, reason: pass ? `${(elapsed/1000).toFixed(0)}s elapsed` : `inversion cooldown (${((windowMs-elapsed)/1000).toFixed(0)}s remain)` };
  }

  /**
   * Attempt an inversion operation.
   * Returns { fired, inversionType, conditions, transformation } or { blocked, conditions }.
   */
  attempt({
    inversionType = INVERSION_TYPE.EPISTEMIC,
    sigmaScores,
    currentRegime = 0.5,
    lastInversionAt = null,
    fromState,
    toState,
    context = {},
  }) {
    const conditions = {
      C1: this._checkScaleValidity(sigmaScores),
      C2: this._checkBaselineStability({}, sigmaScores),
      C3: this._checkNoiseFloor(sigmaScores),
      C4: this._checkRegimeStability(currentRegime),
      C5: this._checkTemporalIntegrity(lastInversionAt),
    };

    const allPass = Object.values(conditions).every(c => c.pass);

    const record = {
      id:            `inv-${Date.now()}-${Math.random().toString(36).slice(2,5)}`,
      uuid:          InversionOperator.UUID,
      inversionType,
      firedAt:       Date.now(),
      fired:         allPass,
      conditions,
      sigmaScores,
      fromState,
      toState,
      context,
    };

    if (allPass) {
      // EPISTEMIC INVERSION: the model changes, not the world-state.
      // σ mapping function is reinterpreted.
      record.transformation = {
        type:        inversionType,
        description: this._describeTransformation(inversionType, fromState, toState, sigmaScores),
        // What changed in the interpretation frame
        modelDelta: {
          oldInterpretation: fromState,
          newInterpretation: toState,
          dominant:          conditions.C1.dominant,
          note: 'Inversion changes the model, not the world-state. Baseline update follows.',
        }
      };
      this._firedCount++;
    } else {
      const failed = Object.entries(conditions).filter(([,c]) => !c.pass).map(([k,c]) => `${k}: ${c.reason}`);
      record.blockReason = failed.join('; ');
      this._blockedCount++;
    }

    this._inversionLog.push(record);
    return record;
  }

  _describeTransformation(type, from, to, sigmas) {
    switch (type) {
      case INVERSION_TYPE.EPISTEMIC:
        return `σ mapping reinterpreted: "${from}" reads differently under corrected frame. Model updates; world-state unchanged.`;
      case INVERSION_TYPE.TEMPORAL:
        return `Prior reading of "${from}" was valid at time of observation; regime shift invalidates it. Now reads as "${to}".`;
      case INVERSION_TYPE.FRAME:
        return `Implicit model assumption inverted. "${from}" is now understood as "${to}" under corrected frame geometry.`;
      case INVERSION_TYPE.POLARITY:
        return `Valence inversion: "${from}" carries opposite affective charge when read through corrected suppression model.`;
      default:
        return `Inversion of type ${type}: ${from} → ${to}`;
    }
  }

  stats() {
    return { fired: this._firedCount, blocked: this._blockedCount, total: this._inversionLog.length };
  }

  log() { return this._inversionLog; }
}

// ─── 5. RESONANCE MAPPER ──────────────────────────────────────────────────────
//
// Maps individual resonances dynamically.
// Integrates ASE fingerprints + Resonance scoring + IDL relational dynamics
// into a continuous field comparison with feedback loop.

export class ResonanceMapper {
  static UUID    = 'alk-irs-resonance-0000-2300-0000-000000000050';
  static VERSION = IRS_VERSION;

  constructor() {
    this._profiles    = new Map();   // userId → latest resonance+ASE snapshot
    this._comparisons = new Map();   // 'A::B' → comparison history
    this._feedbackW   = new SlidingWindow(20);
  }

  // Ingest latest resonance result from Resonance API
  ingestResonance(result) {
    const key = [result.userA, result.userB].sort().join('::');
    if (!this._comparisons.has(key)) this._comparisons.set(key, []);
    this._comparisons.get(key).push({
      ts:        Date.now(),
      total:     result.total,
      matchType: result.matchType,
      axes:      result.axes,
      insights:  result.insights,
    });
    // Feed total into feedback window
    this._feedbackW.push(result.total);
    return this.compare(result.userA, result.userB);
  }

  // Ingest ASE signature for a user
  ingestASE(signature) {
    this._profiles.set(signature.userId, {
      userId:    signature.userId,
      mode:      signature.fingerprint?.dominantMode,
      secondary: signature.fingerprint?.secondaryMode,
      drift:     signature.drift,
      core:      signature.core,
      updatedAt: Date.now(),
    });
  }

  // Compare two users' resonance trajectories
  compare(userA, userB) {
    const key  = [userA, userB].sort().join('::');
    const hist = this._comparisons.get(key) || [];
    if (!hist.length) return null;

    const recent = hist.slice(-10);
    const totalValues = recent.map(r => r.total);

    // Trajectory: is resonance increasing, stable, or declining?
    const trend = totalValues.length > 2
      ? (totalValues[totalValues.length-1] - totalValues[0]) / totalValues.length
      : 0;

    const trajectory = trend > 0.02 ? 'deepening'
                     : trend < -0.02 ? 'retreating'
                     : 'stable';

    // Match type distribution
    const matchCounts = {};
    recent.forEach(r => { matchCounts[r.matchType] = (matchCounts[r.matchType]||0) + 1; });
    const dominantMatch = Object.entries(matchCounts).sort((a,b) => b[1]-a[1])[0]?.[0];

    // ASE profile comparison
    const profA = this._profiles.get(userA);
    const profB = this._profiles.get(userB);
    const modeCongruence = profA && profB && profA.mode === profB.mode ? 1.0
                         : profA && profB ? 0.5 : null;

    return {
      pair:         key,
      userA, userB,
      sampleSize:   hist.length,
      currentTotal: r4(recent[recent.length-1]?.total ?? 0),
      avgTotal:     r4(mean(totalValues)),
      trajectory,
      dominantMatch,
      feedbackStability: r4(1 - this._feedbackW.std()),
      modeCongruence,
      profileA:     profA,
      profileB:     profB,
      recentInsights: recent.slice(-3).flatMap(r => r.insights || []).slice(0, 4),
      computedAt:   Date.now(),
    };
  }

  allComparisons() {
    const result = [];
    this._comparisons.forEach((_, key) => {
      const [a, b] = key.split('::');
      const c = this.compare(a, b);
      if (c) result.push(c);
    });
    return result;
  }
}

// ─── 6. META-RELATIONAL LAYER ────────────────────────────────────────────────
//
// Extends thinking across recursive domains.
// What is the relationship between the relationship?
// Subrelations: nested roles, embedded power geometry, meta-communication.

export class MetaRelationalLayer {
  static UUID    = 'alk-irs-meta-0000-2300-0000-000000000060';
  static VERSION = IRS_VERSION;

  constructor() {
    this._metaEvents   = [];
    this._subrelations = new Map();   // key → SubrelationRecord
  }

  // Detect meta-communication: talking about the relationship itself
  detectMetaCommunication(text, speakerId) {
    const META_MARKERS = [
      /\bwe\s+(always|never|keep|tend to|seem to)\b/i,
      /\bour\s+(pattern|dynamic|way|relationship|interaction)\b/i,
      /\bwe\s+do\s+this\s+(thing|pattern|dance|again)\b/i,
      /\bthis\s+is\s+what\s+we\s+do\b/i,
      /\bI\s+notice\s+we\b/i,
      /\bwhen\s+we\s+(argue|fight|disagree|connect|talk)\b/i,
    ];
    const hits = META_MARKERS.filter(re => re.test(text)).length;
    if (hits === 0) return null;

    const event = {
      id:          `meta-${Date.now()}`,
      uuid:        MetaRelationalLayer.UUID,
      speakerId,
      text:        text.slice(0, 200),
      markerCount: hits,
      confidence:  conf(hits / META_MARKERS.length),
      detectedAt:  Date.now(),
    };
    this._metaEvents.push(event);
    return event;
  }

  // Detect recursive reference: agent referencing a sub-pattern inside a pattern
  detectSubrelation(agentA, agentB, { gapType, edgeType, resonanceTotal, inversionFired }) {
    const key = [agentA, agentB].sort().join('::');

    // Subrelation exists when: gap + edge + resonance all present simultaneously
    // This is the meta-level: the relationship has a relationship with its own instability
    if (!gapType || !edgeType) return null;

    const existing = this._subrelations.get(key) || { visits: 0, patterns: [] };
    const pattern = `${gapType}+${edgeType}` + (inversionFired ? '+INV' : '');
    existing.visits++;
    existing.patterns.push({ pattern, resonanceTotal, ts: Date.now() });

    // Detect recursion: same pattern appearing 3+ times = structural loop
    const patternCounts = {};
    existing.patterns.forEach(p => { patternCounts[p.pattern] = (patternCounts[p.pattern]||0) + 1; });
    const loops = Object.entries(patternCounts).filter(([,c]) => c >= 3);

    const subrelation = {
      id:           `sub-${key}-${Date.now()}`,
      uuid:         MetaRelationalLayer.UUID,
      agentA, agentB,
      visits:       existing.visits,
      currentPattern: pattern,
      structuralLoops: loops.map(([p, c]) => ({ pattern: p, count: c })),
      isRecursive:  loops.length > 0,
      description:  loops.length > 0
        ? `Structural loop detected: pattern "${loops[0][0]}" has occurred ${loops[0][1]} times.`
        : `Subrelation active: ${pattern}`,
    };

    this._subrelations.set(key, existing);
    return subrelation;
  }

  metaSummary() {
    return {
      metaEvents:    this._metaEvents.length,
      subrelations:  this._subrelations.size,
      structuralLoops: Array.from(this._subrelations.values())
        .flatMap(s => s.patterns || [])
        .reduce((acc, p) => { acc[p.pattern] = (acc[p.pattern]||0)+1; return acc; }, {}),
    };
  }
}

// ─── 7. SCORE PROFILE ENGINE ─────────────────────────────────────────────────
//
// Unified relational score snapshot for visualization.
// All sub-scores → one coherent profile per agent pair.

export class ScoreProfileEngine {
  static UUID    = 'alk-irs-score-0000-2300-0000-000000000070';
  static VERSION = IRS_VERSION;

  constructor() { this._profiles = new Map(); }

  compute({
    agentA, agentB,
    gap,          // GapAnalyzer result
    edge,         // EdgeEngine result
    resonance,    // ResonanceMapper comparison
    inversion,    // InversionOperator record
    meta,         // MetaRelationalLayer subrelation
    baseline,     // AdaptiveBaseline snapshot
  }) {
    // Component scores (all 0-1)
    const gapScore = gap
      ? r4(1 - clamp(gap.magnitude, 0, 1))   // lower gap = better
      : 0.5;

    const edgeScore = edge
      ? r4(edge.avgBidir)
      : 0.5;

    const resonanceScore = resonance
      ? r4(resonance.currentTotal)
      : 0.5;

    const stabilityScore = edge
      ? r4(1 - clamp(edge.sigma * 3, 0, 1))   // lower variance = more stable
      : 0.5;

    const alignmentScore = (!gap || gap.gapType !== GAP_TYPE.G2)
      ? r4(edgeScore * 0.6 + resonanceScore * 0.4)
      : r4(edgeScore * 0.3 + resonanceScore * 0.3);   // G2 penalty

    const inversionLoad = inversion?.fired ? r4(0.3) : r4(0);   // inversion = interpretive overhead

    // Composite: weighted integration
    const composite = r4(clamp(
      gapScore        * 0.20 +
      edgeScore       * 0.25 +
      resonanceScore  * 0.25 +
      stabilityScore  * 0.15 +
      alignmentScore  * 0.15 -
      inversionLoad   * 0.10,
      0, 1
    ));

    const profile = {
      id:           `score-${[agentA, agentB].sort().join('::')}-${Date.now()}`,
      uuid:         ScoreProfileEngine.UUID,
      agentA, agentB,
      computedAt:   Date.now(),
      composite,
      components: {
        gap:        gapScore,
        edge:       edgeScore,
        resonance:  resonanceScore,
        stability:  stabilityScore,
        alignment:  alignmentScore,
        inversionLoad,
      },
      // Actionable insight
      primarySignal: this._primarySignal(gap, edge, resonance, meta),
      // Risk flags
      flags: this._computeFlags(gap, edge, resonance, meta),
      baseline: baseline || {},
    };

    this._profiles.set([agentA, agentB].sort().join('::'), profile);
    return profile;
  }

  _primarySignal(gap, edge, resonance, meta) {
    if (meta?.isRecursive) return `Structural loop: ${meta.structuralLoops[0]?.pattern} — system is cycling`;
    if (gap?.gapType === GAP_TYPE.G2) return 'Connection present but alignment broken — G₂ structural gap active';
    if (edge?.edgeType === EDGE_TYPE.DISSOLVED) return 'Edge dissolved — feedback loop broken';
    if (resonance?.trajectory === 'deepening') return 'Resonance deepening — approach motivation active';
    if (resonance?.trajectory === 'retreating') return 'Resonance retreating — withdrawal pattern emerging';
    if (gap?.gapType === GAP_TYPE.G1) return 'Asymmetric engagement — reciprocity completion needed';
    if (edge?.edgeType === EDGE_TYPE.ESTABLISHED) return 'Edge established — low variance, stable channel';
    return 'System within baseline tolerance';
  }

  _computeFlags(gap, edge, resonance, meta) {
    const flags = [];
    if (gap?.gapType === GAP_TYPE.G2)            flags.push({ code: 'G2_MISALIGNMENT', severity: 'high' });
    if (edge?.edgeType === EDGE_TYPE.DISSOLVED)  flags.push({ code: 'EDGE_DISSOLVED', severity: 'high' });
    if (edge?.asymmetry > 0.35)                  flags.push({ code: 'ASYMMETRY_HIGH', severity: 'medium' });
    if (meta?.isRecursive)                       flags.push({ code: 'STRUCTURAL_LOOP', severity: 'high' });
    if (resonance?.trajectory === 'retreating')  flags.push({ code: 'RESONANCE_RETREATING', severity: 'medium' });
    return flags;
  }

  getProfile(agentA, agentB) {
    return this._profiles.get([agentA, agentB].sort().join('::')) || null;
  }
}

// ─── 8. IRS MODULE (KERNEL INTEGRATION) ──────────────────────────────────────

export class IRSModule extends ALKModule {
  static UUID    = IRS_UUID;
  static VERSION = IRS_VERSION;

  constructor(kernel) {
    super(kernel, {
      uuid:    IRS_UUID,
      version: IRS_VERSION,
      name:    'integrative-relational-systems',
    });

    // Instantiate all sub-engines
    this._baseline  = new AdaptiveBaseline({ alpha: 0.08, windowSize: 40 });
    this._gap       = new GapAnalyzer(this._baseline);
    this._edge      = new EdgeEngine(this._baseline);
    this._inversion = new InversionOperator();
    this._resonance = new ResonanceMapper();
    this._meta      = new MetaRelationalLayer();
    this._score     = new ScoreProfileEngine();

    this._lastInversionAt = null;
    this._activeAgents    = new Set();
  }

  _subscribe() {
    // Gap inputs from GapHunter
    this._on('alk.gap.composite',    e => this._onGapComposite(e));
    this._on('alk.gap.shadow_field', e => this._onShadowField(e));

    // Relational inputs
    this._on('alk.rel.trajectory.update', e => this._onTrajectory(e));
    this._on('alk.rel.rupture.detected',  e => this._onRupture(e));
    this._on('alk.rel.repair.attempt',    e => this._onRepair(e));
    this._on('alk.rel.bid.response',      e => this._onBidResponse(e));

    // Latent model + suppression
    this._on('alk.latent.update',     e => this._onLatent(e));
    this._on('alk.suppression.update',e => this._onSuppression(e));

    // Resonance + ASE
    this._on('resonance.result',        e => this._onResonanceResult(e));
    this._on('ase.signature.updated',   e => this._onASESignature(e));

    // Verbal
    this._on('alk.verbal.chunk.transcribed', e => this._onVerbal(e));

    // Session
    this._on('alk.session.capture.start', () => this._onSessionStart());
    this._on('alk.session.capture.stop',  () => this._onSessionStop());
  }

  _onGapComposite(event) {
    const { coherence, reciprocity, semanticAlignment, suppression, agentA, agentB } = event;
    if (agentA) this._activeAgents.add(agentA);
    if (agentB) this._activeAgents.add(agentB);

    const gap = this._gap.analyze({ coherence, reciprocity, semanticAlignment, suppression });
    if (!gap) return;

    this._emit('irs.gap.detected', { gap, agentA, agentB });

    // Attempt edge measurement in context of this gap
    if (agentA && agentB) {
      const edge = this._edge.measure(agentA, agentB, {
        coherence:          coherence ?? 0.5,
        mutualElaboration:  event.mutualElaboration ?? 0,
        responseRatio:      reciprocity ?? 0.5,
        sharedVocabDensity: semanticAlignment ?? 0.5,
      });

      const transitioned = edge.previousType !== edge.edgeType;
      if (transitioned) {
        const channel = edge.edgeType === EDGE_TYPE.DISSOLVED ? 'irs.edge.dissolved'
                      : edge.edgeType === EDGE_TYPE.MISALIGNED ? 'irs.edge.misaligned'
                      : 'irs.edge.created';
        this._emit(channel, { edge, agentA, agentB });
      }

      // Attempt inversion if G2 gap + established edge (the core psychologically important case)
      if (gap.gapType === GAP_TYPE.G2 && edge.edgeType === EDGE_TYPE.ESTABLISHED) {
        this._attemptInversion({
          inversionType: INVERSION_TYPE.FRAME,
          sigmaScores:   gap.sigmaScores,
          fromState:     'aligned',
          toState:       'misaligned-under-same-connection',
          agentA, agentB,
        });
      }
    }
  }

  _onShadowField(event) {
    const { suppressionScore, coherence, agentId } = event;
    if (suppressionScore > 0.5) {
      // High suppression → potential polarity inversion needed
      this._attemptInversion({
        inversionType: INVERSION_TYPE.POLARITY,
        sigmaScores: {
          [SIGMA_SCALE.NOISE]:      suppressionScore * 0.5,
          [SIGMA_SCALE.STRUCTURAL]: suppressionScore * 2.5,
          [SIGMA_SCALE.TEMPORAL]:   0.1,
          [SIGMA_SCALE.ASYMMETRY]:  null,
        },
        fromState:  'surface-positive',
        toState:    'suppressed-negative',
        agentA:     agentId,
        context: { suppressionScore, coherence },
      });
    }
  }

  _onLatent(event) {
    const { valence, arousal, suppression, coherence, engagement } = event;
    this._baseline.update('latent.valence',     valence     ?? 0);
    this._baseline.update('latent.arousal',     arousal     ?? 0);
    this._baseline.update('latent.coherence',   coherence   ?? 0.5);
    this._baseline.update('latent.suppression', suppression ?? 0);
    this._baseline.update('latent.engagement',  engagement  ?? 0);
  }

  _onSuppression(event) {
    this._gap.feedSuppression(event.suppressionScore ?? 0);
    if (event.agentId && event.investment !== undefined) {
      this._edge.feedInvestment(event.agentId, event.investment ?? 0.5);
    }
  }

  _onTrajectory(event) {
    const { trajectory, agentA, agentB, coherence } = event;
    const coherenceMap = { DEEPENING: 0.8, APPROACH: 0.75, STABLE: 0.5, RETREAT: 0.3, DIVERGING: 0.2 };
    const cVal = coherenceMap[trajectory] ?? 0.5;
    if (agentA && agentB) {
      this._edge.measure(agentA, agentB, {
        coherence: cVal, mutualElaboration: coherence ?? cVal,
        responseRatio: 0.5, sharedVocabDensity: 0.5,
      });
    }
  }

  _onRupture(event) {
    const { agentA, agentB, severity } = event;
    const gap = { gapType: GAP_TYPE.G2, sigmaScores: {
      [SIGMA_SCALE.STRUCTURAL]: severity > 0.7 ? 3.5 : 2.2,
      [SIGMA_SCALE.NOISE]:      0.1,
      [SIGMA_SCALE.TEMPORAL]:   severity * 0.5,
      [SIGMA_SCALE.ASYMMETRY]:  null,
    }, magnitude: severity || 0.6 };
    this._emit('irs.gap.detected', { gap, agentA, agentB, source: 'rupture' });
  }

  _onRepair(event) {
    // Repair attempt = partial gap resolution signal
    this._emit('irs.gap.resolved', { partial: true, ...event });
  }

  _onBidResponse(event) {
    const { response, agentA, agentB } = event;
    if (agentA) this._edge.feedInvestment(agentA, response === 'accepted' ? 0.8 : 0.2);
    if (agentB) this._edge.feedInvestment(agentB, response === 'accepted' ? 0.7 : 0.3);
  }

  _onResonanceResult(event) {
    const comparison = this._resonance.ingestResonance(event);
    if (comparison) this._emit('irs.resonance.map.updated', { comparison });
    this._computeScore(event.userA, event.userB);
  }

  _onASESignature(event) {
    this._resonance.ingestASE(event);
  }

  _onVerbal(event) {
    const { text, speakerId } = event;
    if (!text) return;
    const metaEvent = this._meta.detectMetaCommunication(text, speakerId);
    if (metaEvent) this._emit('irs.meta.subrelation', { metaEvent });
  }

  _onSessionStart() {
    this._emit('irs.session.started', { uuid: IRS_UUID, ts: Date.now() });
  }

  _onSessionStop() {
    const summary = {
      gaps:       this._gap.sessionSummary(),
      edges:      this._edge.networkSnapshot(),
      inversions: this._inversion.stats(),
      meta:       this._meta.metaSummary(),
      baseline:   this._baseline.snapshot(),
    };
    this._emit('irs.session.summary', summary);
  }

  _attemptInversion({ inversionType, sigmaScores, fromState, toState, agentA, agentB, context = {} }) {
    const result = this._inversion.attempt({
      inversionType,
      sigmaScores,
      currentRegime: this._baseline.sigmaScores('latent.coherence')
                        ?.[SIGMA_SCALE.NOISE] ?? 0.5,
      lastInversionAt: this._lastInversionAt,
      fromState, toState, context,
    });

    if (result.fired) {
      this._lastInversionAt = Date.now();
      this._emit('irs.inversion.triggered', { result, agentA, agentB });
    } else {
      this._emit('irs.inversion.blocked', { result, agentA, agentB });
    }
  }

  _computeScore(agentA, agentB) {
    const edge      = this._edge.getEdge(agentA, agentB);
    const resonance = this._resonance.compare(agentA, agentB);
    const meta      = this._meta.detectSubrelation(agentA, agentB, {
      gapType:       this._gap.sessionSummary().mostFrequent,
      edgeType:      edge?.edgeType,
      resonanceTotal: resonance?.currentTotal,
      inversionFired: this._inversion.stats().fired > 0,
    });

    const profile = this._score.compute({
      agentA, agentB,
      gap:       null,   // latest gap not stored; use session summary proxy
      edge,
      resonance,
      inversion: this._inversion.log().slice(-1)[0] || null,
      meta,
      baseline:  this._baseline.snapshot(),
    });

    this._emit('irs.score.profile', { profile, agentA, agentB });
    return profile;
  }

  // Public API for external callers
  scoreProfile(agentA, agentB)   { return this._score.getProfile(agentA, agentB); }
  allComparisons()               { return this._resonance.allComparisons(); }
  networkSnapshot()              { return this._edge.networkSnapshot(); }
  baselineSnapshot()             { return this._baseline.snapshot(); }
  inversionLog()                 { return this._inversion.log(); }
}

export default IRSModule;
