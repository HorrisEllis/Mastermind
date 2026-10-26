/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Resonance Engine  ·  resonance-engine.js  ·  v5.0.0                  ║
 * ║  UUID: res-engine-0000-0000-5000-0000-000000000001                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE COMPLETE RESONANCE ENGINE
 *
 * Bridges:
 *   GapHunter v3.1     — gap detection, field theory, relational physics
 *   CausalNexus v6     — sigma regime, delta stream, kinematic analysis
 *   Ledger v1          — dual-ledger: ideas (open) → upgrades (resolved)
 *   Relational Physics — Theta state, EmotionEngine, FrictionDetector
 *
 * New in v5:
 *   — Friction measurement for gaps (edge grinding)
 *   — Tension measurement for gaps (structural stress)
 *   — Ledger-backed comparison of resonance states
 *   — Sigma regime tracking across resonance sessions
 *   — Delta stream: gap pressure changes over time
 *   — Cross-session longitudinal comparison
 *
 * §1.1  All outputs are signals, not diagnoses.
 * §1.2  Nothing silently fails.
 * §5.5  No external runtime dependencies.
 */

'use strict';

import {
  Theta,
  RelationalFieldAnalyzer,
  FrictionDetector,
  EmotionEngine,
  AffectiveFieldSystem,
  EMOTION_SIGNATURES,
  PHASE_TRANSITIONS,
} from './relational-physics.js';

import {
  GAP_TYPE,
  GAP_REASON,
  DOMAIN,
  INVARIANTS,
  AS_ABOVE_SO_BELOW,
  UNIVERSAL_CRITICALITY,
  catalogueSummary,
} from './gap-taxonomy.js';

import {
  GapHunterBus,
} from './gap-bus.js';

import {
  UniversalTextAnalyzer,
} from './gap-text.js';

import {
  LyricFieldAnalyzer,
  SequenceFieldAnalyzer,
} from './gap-field.js';

import { createLedger, IDEA_STATUS, UPGRADE_TYPE } from '../lib/ledger.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function r4(n)            { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr)        { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }

function uuid4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Sigma Regime Classifier (inline — no external dep) ──────────────────────

const SIGMA_REGIMES = Object.freeze({
  STABLE:            'STABLE',
  DEGRADED:          'DEGRADED',
  COLLAPSING:        'COLLAPSING',
  OSCILLATORY:       'OSCILLATORY',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA',
});

function classifySigma(pressures, cfg = {}) {
  const minWindow        = cfg.minWindow        ?? 3;
  const slopeThreshold   = cfg.slopeThreshold   ?? 0.30;
  const accelThreshold   = cfg.accelThreshold   ?? 0.50;
  const oscillationCount = cfg.oscillationCount ?? 3;

  if (!pressures || pressures.length < minWindow) {
    return { regime: SIGMA_REGIMES.INSUFFICIENT_DATA, confidence: 0 };
  }

  // S = max slope (latency impact proxy via pressure deltas)
  const deltas = [];
  for (let i = 1; i < pressures.length; i++) {
    deltas.push(pressures[i] - pressures[i - 1]);
  }
  const S = Math.max(...deltas.map(Math.abs));

  // K = acceleration (second derivative)
  const accs = [];
  for (let i = 1; i < deltas.length; i++) accs.push(deltas[i] - deltas[i - 1]);
  const K = accs.length ? Math.max(...accs.map(Math.abs)) : 0;

  // O = sign flips in delta
  let O = 0;
  let prevSign = 0;
  for (const d of deltas) {
    const sign = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (prevSign !== 0 && sign !== 0 && sign !== prevSign) O++;
    if (sign !== 0) prevSign = sign;
  }

  if (K >= accelThreshold)   return { regime: SIGMA_REGIMES.COLLAPSING,   confidence: r4(Math.min(1, K / accelThreshold)) };
  if (O >= oscillationCount) return { regime: SIGMA_REGIMES.OSCILLATORY,  confidence: r4(Math.min(1, O / oscillationCount)) };
  if (S >= slopeThreshold)   return { regime: SIGMA_REGIMES.DEGRADED,     confidence: r4(Math.min(1, S / slopeThreshold)) };
  return { regime: SIGMA_REGIMES.STABLE, confidence: r4(1 - S / Math.max(slopeThreshold, 0.01)) };
}

// ─── Friction Measurement ─────────────────────────────────────────────────────

/**
 * Measures friction between two gap results or state objects.
 *
 * Friction types:
 *   edge_grinding — two signals at the same boundary, grinding against each other
 *   field_conflict — opposing field pressures in the same domain
 *   state_contradiction — Theta C-sign conflicts
 *   resonance_mismatch — emotional empathy divergence
 */
export class ResonanceFrictionMeter {
  static UUID = 'res-friction-0000-5000-0000-000000000010';

  constructor() {
    this._fd = new FrictionDetector();
    this._history = [];
  }

  /**
   * Measure friction between two Theta states.
   * Returns friction intensity + type + zone.
   */
  measureTheta(thetaA, thetaB) {
    const a = thetaA instanceof Theta ? thetaA : new Theta(thetaA);
    const b = thetaB instanceof Theta ? thetaB : new Theta(thetaB);

    const nodes = new Map([['A', a.toJSON()], ['B', b.toJSON()]]);
    const results = this._fd.detect(nodes, [['A', 'B']], 0.10);
    const fr = results[0] ?? null;

    return {
      friction_intensity: fr?.friction_intensity ?? 0,
      friction_type:      fr?.friction_type      ?? 'none',
      zone:               fr?.zone               ?? 'none',
      overlap:            fr?.overlap_score       ?? 0,
      contradiction:      fr?.contradiction_score ?? 0,
      contention:         fr?.contention_score    ?? 0,
      C_delta:            r4(Math.abs(a.C - b.C)),
      M_asymmetry:        r4(Math.abs(a.M - b.M)),
      Pe_asymmetry:       r4(Math.abs(a.P_e - b.P_e)),
      signal_note:        '§1.1 — Friction is a structural signal, not a judgment.',
    };
  }

  /**
   * Measure gap-edge friction — two gap results grinding at the same boundary.
   * A "hard edge" in field theory = point of maximum information density.
   * When two different gap types fire at the same edge, friction rises.
   */
  measureEdgeFriction(gapResultA, gapResultB) {
    const domainMatch  = gapResultA.domain === gapResultB.domain;
    const typeConflict = gapResultA.type !== gapResultB.type;
    const scoreProduct = (gapResultA.score ?? 0) * (gapResultB.score ?? 0);

    // Friction coefficient: same domain + different type + high scores = high friction
    const baseFriction = scoreProduct * (domainMatch ? 1.4 : 0.7);
    const typeBonus    = typeConflict ? 0.25 : 0;

    const intensity = r4(clamp(baseFriction + typeBonus, 0, 1));

    const type = domainMatch && typeConflict ? 'overlap_compression_grinding'
               : !domainMatch && typeConflict ? 'diffuse_structural_interference'
               : 'resource_contention';

    return {
      friction_intensity: intensity,
      friction_type:      type,
      zone:               intensity > 0.75 ? 'collapse_zone' : intensity > 0.55 ? 'high_friction' : 'moderate_friction',
      domain_match:       domainMatch,
      type_conflict:      typeConflict,
      score_product:      r4(scoreProduct),
      signal_note:        'Edge grinding: two gap types at the same structural boundary.',
    };
  }

  /**
   * Compute friction timeline — how friction evolves across a gap history.
   * Used for longitudinal comparison via the Ledger.
   */
  frictionTimeline(gapHistory) {
    if (!gapHistory || gapHistory.length < 2) return null;

    const frictions = [];
    for (let i = 1; i < gapHistory.length; i++) {
      const fr = this.measureEdgeFriction(gapHistory[i - 1], gapHistory[i]);
      frictions.push({
        position: i,
        intensity: fr.friction_intensity,
        type:      fr.friction_type,
        zone:      fr.zone,
      });
    }

    const intensities = frictions.map(f => f.intensity);
    const sigma = classifySigma(intensities);
    const peakIdx = intensities.indexOf(Math.max(...intensities));

    return {
      length:          frictions.length,
      avg_friction:    r4(mean(intensities)),
      peak_friction:   r4(Math.max(...intensities)),
      peak_at:         peakIdx,
      sigma_regime:    sigma.regime,
      sigma_confidence:sigma.confidence,
      collapse_zones:  frictions.filter(f => f.zone === 'collapse_zone').length,
      timeline:        frictions,
    };
  }
}

// ─── Tension Measurement ──────────────────────────────────────────────────────

/**
 * Measures structural tension in gaps — the force pulling the gap open.
 *
 * Tension ≠ friction.
 * Friction = two edges grinding (resistance).
 * Tension = gap field under pressure (the force sustaining the gap).
 *
 * High tension = the gap is being held open by something.
 * Low tension  = the gap is passive / structural.
 */
export class ResonanceTensionMeter {
  static UUID = 'res-tension-0000-5000-0000-000000000020';

  /**
   * Measure tension in a gap result.
   * Uses: score × criticality × avoidance_reason_bonus
   */
  measureGapTension(gapResult) {
    const score       = gapResult.score ?? 0;
    const criticality = UNIVERSAL_CRITICALITY[gapResult.type] ?? 0.65;

    // Avoidance-based reasons amplify tension — the gap is being held open
    const reasons = gapResult.reason ?? gapResult.definition?.reason ?? [];
    const avoidanceBonus = reasons.includes(GAP_REASON.AVOIDANCE)         ? 0.20 : 0;
    const emotionBonus   = reasons.includes(GAP_REASON.EMOTIONAL_OCCLUSION)? 0.15 : 0;
    const identityBonus  = reasons.includes(GAP_REASON.IDENTITY_REFLECTION)? 0.15 : 0;

    const raw     = score * criticality * (1 + avoidanceBonus + emotionBonus + identityBonus);
    const tension = r4(clamp(raw, 0, 1));

    return {
      tension,
      score,
      criticality,
      avoidance_amplified: avoidanceBonus > 0,
      emotion_amplified:   emotionBonus > 0,
      identity_amplified:  identityBonus > 0,
      tension_class: tension > 0.75 ? 'high_tension'
                   : tension > 0.45 ? 'moderate_tension'
                   : 'low_tension',
      signal_note: 'Tension = gap field force. High tension = actively held open by avoidance or identity.',
    };
  }

  /**
   * Measure tension in a Theta — gap signature is the primary tension carrier.
   */
  measureThetaTension(theta) {
    const t = theta instanceof Theta ? theta : new Theta(theta);
    return {
      tension:          t.gapSignature,
      collapse_pressure:t.collapsePressure,
      coherence:        t.coherence,
      tension_class:    t.gapSignature > 0.65 ? 'high_tension' : t.gapSignature > 0.35 ? 'moderate_tension' : 'low_tension',
      axes: {
        entropy:       t.H,
        causal_absence:r4(1 - Math.max(0, t.C)),
        intimacy_gap:  r4(1 - t.M),
        cognitive_gap: r4(1 - t.P_c),
        empathy_gap:   r4(1 - t.P_e),
      },
      signal_note: 'Theta tension = gap signature. High H + low M + low C = maximum tension.',
    };
  }

  /**
   * Gap-level tension timeline — how tension evolves across a session.
   */
  tensionTimeline(thetaHistory) {
    if (!thetaHistory || thetaHistory.length < 2) return null;

    const tensions = thetaHistory.map(t => {
      const th = t instanceof Theta ? t : new Theta(t);
      return r4(th.gapSignature);
    });

    const sigma = classifySigma(tensions);

    return {
      tensions,
      avg_tension:      r4(mean(tensions)),
      peak_tension:     r4(Math.max(...tensions)),
      min_tension:      r4(Math.min(...tensions)),
      tension_range:    r4(Math.max(...tensions) - Math.min(...tensions)),
      sigma_regime:     sigma.regime,
      sigma_confidence: sigma.confidence,
      trend:            tensions[tensions.length - 1] > tensions[0] ? 'INCREASING' : tensions[tensions.length - 1] < tensions[0] - 0.05 ? 'DECREASING' : 'STABLE',
    };
  }
}

// ─── Resonance Delta Stream ───────────────────────────────────────────────────

/**
 * Tracks how resonance state changes across time.
 * Mirrors the CausalNexus delta module but for resonance / gap field data.
 *
 * Produces a stream of resonance deltas — each capturing:
 *   gap_pressure_delta  — change in field pressure
 *   friction_delta      — change in edge friction
 *   tension_delta       — change in structural tension
 *   emotion_delta       — emotion attractor basin shift
 *   theta_drift         — distance moved in Θ-space
 */
export class ResonanceDeltaStream {
  static UUID = 'res-delta-0000-5000-0000-000000000030';

  constructor() {
    this._ee      = new EmotionEngine();
    this._tension = new ResonanceTensionMeter();
    this._history = [];
  }

  /**
   * Ingest a new resonance state snapshot.
   * @param {object} state — { theta, gapPressure, frictionIntensity }
   */
  ingest(state) {
    const t = state.theta instanceof Theta ? state.theta : new Theta(state.theta ?? {});
    const snap = {
      ts:               Date.now(),
      theta:            t,
      gap_pressure:     state.gapPressure      ?? t.gapSignature,
      friction_intensity:state.frictionIntensity ?? 0,
      emotion:          this._ee.compute(t),
    };

    this._history.push(snap);
    if (this._history.length > 200) this._history.shift();

    return snap;
  }

  /**
   * Compute the full delta stream from current history.
   */
  compute() {
    if (this._history.length < 2) return null;

    const deltas = [];
    for (let i = 1; i < this._history.length; i++) {
      const prev = this._history[i - 1];
      const curr = this._history[i];

      const gapDelta      = r4(curr.gap_pressure - prev.gap_pressure);
      const frDelta       = r4(curr.friction_intensity - prev.friction_intensity);
      const thetaDrift    = this._thetaDistance(curr.theta, prev.theta);
      const emotionSame   = curr.emotion.primary.emotion === prev.emotion.primary.emotion;

      deltas.push({
        position:         i,
        ts:               curr.ts,
        gap_pressure:     curr.gap_pressure,
        friction_intensity:curr.friction_intensity,
        gap_pressure_delta:gapDelta,
        friction_delta:   frDelta,
        theta_drift:      thetaDrift,
        emotion_stable:   emotionSame,
        emotion:          curr.emotion.primary.emotion,
        prev_emotion:     prev.emotion.primary.emotion,
        latencyImpact:    r4(Math.abs(gapDelta)),
        throughputChange: r4(gapDelta - (i > 1 ? deltas[i - 2]?.gap_pressure_delta ?? 0 : 0)),
      });
    }

    // Sigma regime on gap pressure
    const pressures   = deltas.map(d => d.gap_pressure);
    const sigmaGap    = classifySigma(pressures);
    const frictions   = deltas.map(d => d.friction_intensity);
    const sigmaFr     = classifySigma(frictions);

    return {
      length:         deltas.length,
      deltas,
      sigma_gap:      sigmaGap,
      sigma_friction: sigmaFr,
      avg_gap_pressure:    r4(mean(pressures)),
      avg_friction:        r4(mean(frictions)),
      peak_gap_at:         pressures.indexOf(Math.max(...pressures)),
      peak_friction_at:    frictions.indexOf(Math.max(...frictions)),
      emotion_sequence:    deltas.map(d => d.emotion),
      emotion_transitions: deltas.filter(d => !d.emotion_stable).length,
    };
  }

  _thetaDistance(a, b) {
    const dims    = ['H', 'I', 'C', 'M', 'P_c', 'P_e'];
    const weights = { H: 1.2, I: 0.8, C: 1.5, M: 1.2, P_c: 1.0, P_e: 1.0 };
    let sum = 0;
    for (const d of dims) {
      const diff = (a[d] ?? 0.5) - (b[d] ?? 0.5);
      sum += diff * diff * (weights[d] ?? 1);
    }
    return r4(Math.sqrt(sum / dims.length));
  }

  get history() { return this._history; }
  get length()  { return this._history.length; }
}

// ─── Resonance Ledger ─────────────────────────────────────────────────────────

/**
 * Ledger integration for resonance comparisons.
 *
 * Uses the dual-ledger (Idea → Upgrade) pattern to track:
 *   — Open resonance states as Ideas (unresolved)
 *   — Resolved comparisons as Upgrades (with proof)
 *   — Session-to-session longitudinal tracking
 */
export class ResonanceLedger {
  static UUID = 'res-ledger-0000-5000-0000-000000000040';

  constructor(opts = {}) {
    this._ledger = createLedger({ project: opts.project ?? 'Resonance' });
    this._sessions = [];
  }

  /**
   * Record a resonance session as an Idea (open state).
   */
  recordSession(sessionData) {
    const idea = this._ledger.record({
      description: `Resonance session: ${sessionData.label ?? sessionData.id ?? 'unnamed'}`,
      hypothesis:  `Gap pressure: ${r4(sessionData.avgGapPressure ?? 0)} | Friction: ${r4(sessionData.avgFriction ?? 0)} | Regime: ${sessionData.sigmaRegime ?? 'unknown'}`,
      domain:      'resonance',
      tags:        ['session', sessionData.sigmaRegime ?? 'unknown'],
      meta:        sessionData,
    });

    this._sessions.push({ id: idea.id, data: sessionData, ts: Date.now() });
    return idea;
  }

  /**
   * Compare two sessions and record the comparison as an Upgrade.
   * The comparison IS the proof — measuring the delta between states.
   */
  compareAndCommit(ideaId, targetData, opts = {}) {
    const source = this._ledger.idea.findById(ideaId);
    if (!source) throw new Error(`[ResonanceLedger] Idea ${ideaId} not found`);

    const sourceMeta = source.meta ?? {};
    const comparison = this._computeComparison(sourceMeta, targetData);

    return this._ledger.promote(ideaId, {
      type:        UPGRADE_TYPE.MEASURABLE_RESULT,
      description: `Resonance comparison: ${comparison.summary}`,
      proof: {
        metric: {
          gap_pressure_delta: comparison.gapPressureDelta,
          friction_delta:     comparison.frictionDelta,
          sigma_change:       comparison.sigmaChange,
          theta_drift:        comparison.thetaDrift,
        },
      },
      version:  opts.version ?? null,
      domain:   'resonance',
      tags:     ['comparison', 'resonance'],
      meta:     comparison,
    });
  }

  /**
   * Get all session ideas (open resonance states).
   */
  sessions() {
    return this._ledger.idea.findByDomain('resonance');
  }

  /**
   * Get upgrade history — all resolved comparisons.
   */
  comparisonHistory() {
    return this._ledger.upgrade.replay().filter(u => u.domain === 'resonance');
  }

  /**
   * Flow metrics — how many sessions have been compared vs held open.
   */
  metrics() {
    return this._ledger.metrics();
  }

  _computeComparison(source, target) {
    const gapDelta    = r4((target.avgGapPressure  ?? 0) - (source.avgGapPressure  ?? 0));
    const frDelta     = r4((target.avgFriction     ?? 0) - (source.avgFriction     ?? 0));
    const sigmaChange = source.sigmaRegime !== target.sigmaRegime;

    const thetaA      = source.theta ?? {};
    const thetaB      = target.theta ?? {};
    const dims        = ['H', 'I', 'C', 'M', 'P_c', 'P_e'];
    let thetaDist     = 0;
    for (const d of dims) thetaDist += ((thetaA[d] ?? 0.5) - (thetaB[d] ?? 0.5)) ** 2;
    const thetaDrift  = r4(Math.sqrt(thetaDist / dims.length));

    const summary = [
      gapDelta > 0.1 ? `gap pressure ↑${gapDelta}` : gapDelta < -0.1 ? `gap pressure ↓${Math.abs(gapDelta)}` : 'gap pressure stable',
      frDelta  > 0.1 ? `friction ↑${frDelta}` : frDelta < -0.1 ? `friction ↓${Math.abs(frDelta)}` : 'friction stable',
      sigmaChange ? `regime: ${source.sigmaRegime} → ${target.sigmaRegime}` : `regime: ${source.sigmaRegime ?? 'unknown'}`,
    ].join(' | ');

    return {
      gapPressureDelta: gapDelta,
      frictionDelta:    frDelta,
      sigmaChange,
      sigmaSource:      source.sigmaRegime,
      sigmaTarget:      target.sigmaRegime,
      thetaDrift,
      thetaDeltas:      Object.fromEntries(dims.map(d => [d, r4((thetaB[d] ?? 0.5) - (thetaA[d] ?? 0.5))])),
      summary,
      improving:        gapDelta < 0 && frDelta < 0,
    };
  }

  get ledger() { return this._ledger; }

  on(event, fn) { return this._ledger.on(event, fn); }
}

// ─── Main Resonance Engine ────────────────────────────────────────────────────

/**
 * The complete Resonance Engine.
 *
 * Entry point for all analysis. Takes text/theta input, returns:
 *   — Gap analysis (all six detectors)
 *   — Relational physics (Theta, emotion, phase transitions)
 *   — Friction measurement (edge grinding)
 *   — Tension measurement (structural stress)
 *   — Sigma regime (trajectory classification)
 *   — Delta stream (how resonance changes over time)
 *   — Ledger-backed session comparison
 */
export class ResonanceEngine {
  static UUID    = 'res-engine-0000-0000-5000-0000-000000000001';
  static VERSION = '5.0.0';

  constructor(opts = {}) {
    this._project      = opts.project ?? 'Resonance';
    this._minScore     = opts.minScore ?? 0.20;
    this._textAnalyzer = new UniversalTextAnalyzer();
    this._lyric        = new LyricFieldAnalyzer();
    this._seq          = new SequenceFieldAnalyzer();
    this._rfa          = new RelationalFieldAnalyzer();
    this._ee           = new EmotionEngine();
    this._bus          = new GapHunterBus({ project: this._project });
    this._friction     = new ResonanceFrictionMeter();
    this._tension      = new ResonanceTensionMeter();
    this._deltaStream  = new ResonanceDeltaStream();
    this._resonanceLedger = new ResonanceLedger({ project: this._project });
    this._sessionId    = uuid4();
    this._history      = [];
  }

  // ── Text Analysis ─────────────────────────────────────────────────────────

  analyzeText(text, opts = {}) {
    if (!text?.trim()) return null;

    // Gap detection
    const gapResult   = this._textAnalyzer.analyze(text, opts);

    // Theta from text
    const theta       = this._rfa.thetaFromText(text);

    // Emotion computation
    const emotion     = this._ee.compute(theta, {
      gapScore:      gapResult?.score ?? 0,
      frictionScore: 0,
    });

    // Friction: theta vs a neutral baseline
    const neutral    = new Theta({ H: 0.5, I: 0.5, C: 0.5, M: 0.5, P_c: 0.5, P_e: 0.5 });
    const frictionVsNeutral = this._friction.measureTheta(theta, neutral);

    // Tension
    const thetaTension = this._tension.measureThetaTension(theta);
    const gapTensions  = (gapResult?.detectors ?? [])
      .filter(d => d.score >= this._minScore)
      .map(d => this._tension.measureGapTension(d));

    const avgGapTension = gapTensions.length ? r4(mean(gapTensions.map(t => t.tension))) : 0;

    // Ingest to delta stream
    this._deltaStream.ingest({
      theta,
      gapPressure:       gapResult?.score ?? theta.gapSignature,
      frictionIntensity: frictionVsNeutral.friction_intensity,
    });

    const delta = this._deltaStream.compute();
    const sigma = delta ? delta.sigma_gap : { regime: SIGMA_REGIMES.INSUFFICIENT_DATA, confidence: 0 };

    // Compile result
    const result = {
      id:          uuid4(),
      ts:          Date.now(),
      session_id:  this._sessionId,
      input_length:text.length,
      // Gap analysis
      gaps:           gapResult,
      gap_score:      r4(gapResult?.score ?? 0),
      // Theta / emotion
      theta:          theta.toJSON(),
      emotion:        emotion,
      coherence:      r4(theta.coherence),
      collapse_pressure: r4(theta.collapsePressure),
      // Friction
      friction:       frictionVsNeutral,
      // Tension
      theta_tension:  thetaTension,
      gap_tensions:   gapTensions,
      avg_gap_tension:avgGapTension,
      // Sigma
      sigma:          sigma,
      // Delta
      delta_position: this._deltaStream.length,
      // §1.1
      signal_note: '§1.1 — All outputs are signals, not diagnoses.',
    };

    this._history.push(result);
    if (this._history.length > 100) this._history.shift();

    return result;
  }

  // ── Theta Analysis ────────────────────────────────────────────────────────

  analyzeTheta(thetaInput, context = {}) {
    const theta   = thetaInput instanceof Theta ? thetaInput : new Theta(thetaInput);
    const emotion = this._ee.compute(theta, context);
    const tension = this._tension.measureThetaTension(theta);

    this._deltaStream.ingest({
      theta,
      gapPressure:       theta.gapSignature,
      frictionIntensity: context.frictionScore ?? 0,
    });

    return {
      theta:      theta.toJSON(),
      emotion,
      tension,
      coherence:  r4(theta.coherence),
      delta:      this._deltaStream.compute(),
    };
  }

  // ── Pair Analysis ─────────────────────────────────────────────────────────

  analyzePair(thetaA, thetaB, context = {}) {
    const result  = this._rfa.analyzePair(thetaA, thetaB, context);
    const friction = this._friction.measureTheta(
      thetaA instanceof Theta ? thetaA : new Theta(thetaA),
      thetaB instanceof Theta ? thetaB : new Theta(thetaB)
    );
    const tensionA = this._tension.measureThetaTension(thetaA);
    const tensionB = this._tension.measureThetaTension(thetaB);

    return {
      ...result,
      friction,
      tension_A:          tensionA,
      tension_B:          tensionB,
      tension_asymmetry:  r4(Math.abs(tensionA.tension - tensionB.tension)),
      signal_note:        '§1.1 — Pair analysis is relational structure, not diagnosis.',
    };
  }

  // ── Lyric Analysis ────────────────────────────────────────────────────────

  analyzeLyric(input, opts = {}) {
    const result = this._lyric.analyze(input, opts);
    if (!result) return null;

    // Compute tension on the field map
    const fieldMap     = result.field_map ?? [];
    const frictionLine = [];
    for (let i = 1; i < fieldMap.length; i++) {
      const prev = { score: fieldMap[i - 1].pressure, domain: 'lyric', type: GAP_TYPE.TEMPORAL };
      const curr = { score: fieldMap[i].pressure,     domain: 'lyric', type: GAP_TYPE.TEMPORAL };
      frictionLine.push(this._friction.measureEdgeFriction(prev, curr));
    }

    const frictionTimeline = this._friction.frictionTimeline(
      fieldMap.map(f => ({ score: f.pressure, domain: 'lyric', type: GAP_TYPE.TEMPORAL }))
    );

    return {
      ...result,
      friction_timeline: frictionTimeline,
      line_friction:     frictionLine,
    };
  }

  // ── Session Management ────────────────────────────────────────────────────

  sessionSnapshot() {
    const delta = this._deltaStream.compute();
    const pressures = (delta?.deltas ?? []).map(d => d.gap_pressure);
    const frictions = (delta?.deltas ?? []).map(d => d.friction_intensity);

    // Get last theta
    const history = this._deltaStream.history;
    const lastTheta = history.length > 0 ? history[history.length - 1].theta : null;

    return {
      session_id:       this._sessionId,
      analysis_count:   this._history.length,
      avg_gap_pressure: r4(mean(pressures)),
      avg_friction:     r4(mean(frictions)),
      sigma_regime:     delta?.sigma_gap.regime ?? SIGMA_REGIMES.INSUFFICIENT_DATA,
      theta:            lastTheta?.toJSON?.() ?? null,
      delta_stream:     delta,
      ts:               Date.now(),
    };
  }

  /**
   * Record current session to ledger for longitudinal comparison.
   */
  recordSession(label = '') {
    const snap = this.sessionSnapshot();
    return this._resonanceLedger.recordSession({
      ...snap,
      label: label || `Session ${new Date().toISOString()}`,
    });
  }

  /**
   * Compare current session to a previously recorded session.
   */
  compareToSession(ideaId) {
    const snap = this.sessionSnapshot();
    return this._resonanceLedger.compareAndCommit(ideaId, snap);
  }

  // ── Sigma / Delta ─────────────────────────────────────────────────────────

  sigmaRegime() {
    const delta = this._deltaStream.compute();
    return delta?.sigma_gap ?? { regime: SIGMA_REGIMES.INSUFFICIENT_DATA, confidence: 0 };
  }

  deltaStream() {
    return this._deltaStream.compute();
  }

  // ── Catalogue ─────────────────────────────────────────────────────────────

  catalogue(filters = {}) {
    return catalogueSummary();
  }

  invariants()    { return [...INVARIANTS]; }
  asAboveSoBelow(){ return [...AS_ABOVE_SO_BELOW]; }
  phaseTransitions(){ return [...PHASE_TRANSITIONS]; }
  emotionSignatures(){ return { ...EMOTION_SIGNATURES }; }

  // ── Properties ───────────────────────────────────────────────────────────

  get history()         { return this._history; }
  get sessionId()       { return this._sessionId; }
  get ledger()          { return this._resonanceLedger; }
  get bus()             { return this._bus; }
  get version()         { return ResonanceEngine.VERSION; }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export {
  SIGMA_REGIMES,
  classifySigma,
  Theta,
  EMOTION_SIGNATURES,
  PHASE_TRANSITIONS,
  GAP_TYPE,
  GAP_REASON,
  DOMAIN,
  INVARIANTS,
  AS_ABOVE_SO_BELOW,
  UNIVERSAL_CRITICALITY,
};

export default ResonanceEngine;
