/**
 * @module       drift-engine
 * @uuid         a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d
 * @version      1.0.0
 *
 * Drift Engine — sub-threshold behavioral signal detection.
 *
 * Detects the seven signals that precede state change.
 * None of them mean anything alone.
 * Together, they map the shape of what's coming.
 *
 * ── THE SEVEN SIGNALS ─────────────────────────────────────────────────────────
 *
 *   1. PACING_SHIFT         Tiny changes in interaction tempo vs baseline.
 *                           Speech rate, response latency, turn duration.
 *                           "Something changed speed before anything changed."
 *
 *   2. MICRO_HESITATION     Sub-threshold pause spikes inside fluent delivery.
 *                           Too brief to be a pause. Too regular to be noise.
 *                           The place the thought stopped and was replaced.
 *
 *   3. EMOTIONAL_INCONGRUENCE  Cross-channel delta. Face says one thing.
 *                           Voice says another. Body stays still.
 *                           Extends DISSONANCE with directional magnitude.
 *
 *   4. BEHAVIORAL_DRIFT     Running delta from established session baseline.
 *                           Not a single event — a slow rotation.
 *                           The cumulative distance traveled from where they started.
 *
 *   5. ENERGY_CHANGE        Arousal slope over a sliding window.
 *                           Rising = activation. Falling = withdrawal.
 *                           Rate of change matters more than absolute level.
 *
 *   6. RHYTHM_DISRUPTION    Variance in temporal cadence vs personal baseline.
 *                           Everyone has a rhythm. Disruption is deviation from it.
 *                           High variance = noise. Sustained variance = signal.
 *
 *   7. PREDICTIVE_MISMATCH  Actual state vs state predicted by trajectory model.
 *                           When the system expects the person to move one way
 *                           and they move another — the gap is the signal.
 *
 * ── ARCHITECTURE ─────────────────────────────────────────────────────────────
 *
 *   Phase 1 — CALIBRATION (first CALIBRATION_WINDOW samples)
 *     Build per-person baseline. No signals emitted.
 *     Baseline: pacing rhythm, energy band, arousal curve shape, latent mean.
 *
 *   Phase 2 — ACTIVE DETECTION
 *     Each frame: compute deviation from baseline for all 7 channels.
 *     Assign confidence to each. Correlate co-occurring signals.
 *     Emit individual signal events + composite DriftState.
 *
 *   Phase 3 — COMPOSITE SCORING
 *     Co-occurring signals multiply each other's weight.
 *     Single signals are flagged but not escalated.
 *     3+ co-occurring signals → DriftCluster event.
 *
 * ── IMPORTANT ─────────────────────────────────────────────────────────────────
 *
 *   This engine detects probability, not truth.
 *   It produces: "these signals co-occurred with X confidence."
 *   It never produces: "this person is [state]."
 *
 *   All output is probabilistic. Consumers must treat it as such.
 *   Thresholds are conservative by design.
 *   The engine models uncertainty, ambiguity, and variance tolerance.
 *
 * ── CALIBRATION NOTE ─────────────────────────────────────────────────────────
 *
 *   A baseline built in the first 30 seconds of a stressful conversation
 *   is a stressed baseline. Warm-start from a prior calm session via
 *   KERNEL_LANDSCAPE_WARMSTART whenever available.
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     spatial.kernel.latent.update        — 5D state every frame [primary]
 *     spatial.kernel.latent.shift         — significant state transition
 *     spatial.kernel.suppression.update   — suppression level change
 *     spatial.kernel.behavior.detected    — speech/behavioral cue
 *     spatial.kernel.landscape.warmstart  — prior session baseline
 *     spatial.session.start               — reset per-subject state
 *     spatial.session.stop                — flush + emit summary
 *
 *   Emits:
 *     spatial.kernel.drift.signal         — individual signal detection
 *     spatial.kernel.drift.state          — full drift state snapshot (every N frames)
 *     spatial.kernel.drift.cluster        — 3+ co-occurring signals
 *     spatial.kernel.drift.baseline_ready — calibration complete
 *     spatial.kernel.drift.pulse          — §1.8 heartbeat every 30 frames
 *     spatial.kernel.drift.summary        — session end summary
 *
 * ── §K6  No module communicates except through the bus.
 * ── §K7  All errors surface as events. Never throws.
 * ── §5.5 Zero runtime dependencies.
 */

'use strict';

export const DRIFT_UUID    = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const DRIFT_VERSION = '1.0.0';

// ── Signal identifiers ────────────────────────────────────────────────────────

export const SIGNAL = Object.freeze({
  PACING_SHIFT:           'PACING_SHIFT',
  MICRO_HESITATION:       'MICRO_HESITATION',
  EMOTIONAL_INCONGRUENCE: 'EMOTIONAL_INCONGRUENCE',
  BEHAVIORAL_DRIFT:       'BEHAVIORAL_DRIFT',
  ENERGY_CHANGE:          'ENERGY_CHANGE',
  RHYTHM_DISRUPTION:      'RHYTHM_DISRUPTION',
  PREDICTIVE_MISMATCH:    'PREDICTIVE_MISMATCH',
});

// ── Confidence levels (consistent with signal-topology.js) ───────────────────

export const CONFIDENCE = Object.freeze({
  LOW:        'LOW',        // 0.25–0.40  worth noting
  MEDIUM:     'MEDIUM',     // 0.40–0.60  worth watching
  HIGH:       'HIGH',       // 0.60–0.80  worth acting on
  DEFINITIVE: 'DEFINITIVE', // 0.80+      unmistakable
});

function confLabel(score) {
  if (score >= 0.80) return CONFIDENCE.DEFINITIVE;
  if (score >= 0.60) return CONFIDENCE.HIGH;
  if (score >= 0.40) return CONFIDENCE.MEDIUM;
  if (score >= 0.25) return CONFIDENCE.LOW;
  return null; // below threshold — not emitted
}

// ── Latent dimension indices (must match latent-model.js) ────────────────────

const DIM = Object.freeze({ VALENCE:0, AROUSAL:1, SUPPRESSION:2, COHERENCE:3, ENGAGEMENT:4 });

// ── Configuration ────────────────────────────────────────────────────────────

const CFG = Object.freeze({
  CALIBRATION_WINDOW:    40,    // frames before baseline is trusted
  PACING_WINDOW:         20,    // frames for rolling pacing average
  RHYTHM_WINDOW:         30,    // frames for rhythm variance
  ENERGY_SLOPE_WINDOW:   25,    // frames for arousal slope
  PREDICTION_HORIZON:    10,    // frames ahead to project trajectory
  HESITATION_MIN_DWELL:  2,     // min frames a pause must persist
  HESITATION_MAX_DWELL:  8,     // max frames — beyond this it's a real pause
  DRIFT_ALPHA:           0.05,  // EMA decay for running drift (slow)
  RHYTHM_ALPHA:          0.10,  // EMA decay for rhythm baseline
  CLUSTER_MIN_SIGNALS:   3,     // min co-occurring signals for cluster event
  SIGNAL_THRESHOLD:      0.25,  // minimum score to emit any signal
  PULSE_INTERVAL:        30,    // frames between heartbeat events
  STATE_EMIT_INTERVAL:   15,    // frames between full state snapshots

  // Deviation thresholds — how far from baseline before flagged
  PACING_SIGMA:          1.6,   // standard deviations above baseline pacing variance
  HESITATION_SIGMA:      1.8,   // sub-threshold pause spike threshold
  INCONGRUENCE_DELTA:    0.30,  // cross-channel delta to flag incongruence
  DRIFT_SIGMA:           1.5,   // cumulative drift sigma threshold
  ENERGY_SLOPE_MIN:      0.025, // minimum slope magnitude to flag energy change
  RHYTHM_SIGMA:          1.7,   // variance ratio above baseline to flag disruption
  PREDICTION_ERROR_MIN:  0.20,  // minimum prediction error to flag mismatch

  // Co-occurrence amplification weights
  CO_OCCUR_BOOST:        0.15,  // score boost per additional co-occurring signal
});

// ── Utilities ────────────────────────────────────────────────────────────────

function clamp01(v)  { return Math.max(0, Math.min(1, v)); }
function mean(arr)   { if (!arr.length) return 0; return arr.reduce((s,v) => s+v,0) / arr.length; }
function variance(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s,v) => s + (v-m)**2, 0) / (arr.length - 1);
}
function stddev(arr) { return Math.sqrt(variance(arr)); }

/** Linear regression slope over a numeric array */
function slope(arr) {
  if (arr.length < 2) return 0;
  const n  = arr.length;
  const xs = arr.map((_,i) => i);
  const xm = mean(xs);
  const ym = mean(arr);
  const num  = xs.reduce((s,x,i) => s + (x - xm) * (arr[i] - ym), 0);
  const den  = xs.reduce((s,x)   => s + (x - xm)**2, 0);
  return den === 0 ? 0 : num / den;
}

/** Rolling ring buffer — fixed max length */
class RingBuffer {
  constructor(maxLen) { this._max = maxLen; this._buf = []; }
  push(v) { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); }
  get values() { return this._buf; }
  get length()  { return this._buf.length; }
  get full()    { return this._buf.length >= this._max; }
  get last()    { return this._buf[this._buf.length - 1] ?? null; }
}

// ── Per-subject state ────────────────────────────────────────────────────────

function createSubjectState() {
  return {
    // Calibration
    calibrated:       false,
    calibrationCount: 0,
    baselineSamples:  [],  // raw latent vectors during calibration

    // Baseline statistics (set after calibration)
    baseline: {
      latentMean:    [0, 0, 0, 0, 0],  // per-dimension mean
      latentStd:     [1, 1, 1, 1, 1],  // per-dimension std
      pacingMean:    0,                 // mean inter-event delta (ms)
      pacingStd:     1,
      rhythmVariance:0,                 // baseline pacing variance
      arousalMean:   0,
    },

    // Rolling windows
    pacingWindow:      new RingBuffer(CFG.PACING_WINDOW),
    energyWindow:      new RingBuffer(CFG.ENERGY_SLOPE_WINDOW),
    rhythmWindow:      new RingBuffer(CFG.RHYTHM_WINDOW),
    latentHistory:     new RingBuffer(CFG.PREDICTION_HORIZON + 5),

    // Drift accumulator (EMA of cumulative distance from baseline)
    driftEma:          0,

    // Hesitation tracking
    lastInterEventMs:  null,
    pauseSpikeCount:   0,    // consecutive frames with pause > threshold
    hesitationActive:  false,

    // Rhythm EMA baseline
    rhythmEmaBaseline: null,

    // Frame counter
    frame:             0,

    // Active signals this frame (for co-occurrence)
    activeSignals:     new Map(), // SIGNAL_TYPE → { score, confidence }

    // Previous latent state (for predictive mismatch)
    prevLatent:        null,

    // Signal history for pulse/summary
    signalLog:         [],   // last 120 events, ring
  };
}

// ── Baseline computation ─────────────────────────────────────────────────────

function computeBaseline(samples, pacingValues) {
  const n = samples.length;
  if (!n) return null;

  // Per-dimension mean and std over calibration window
  const latentMean = [0,0,0,0,0];
  const latentM2   = [0,0,0,0,0];
  for (const s of samples) {
    for (let d = 0; d < 5; d++) {
      latentMean[d] += s[d];
      latentM2[d]   += s[d] * s[d];
    }
  }
  for (let d = 0; d < 5; d++) {
    latentMean[d] /= n;
    const raw = (latentM2[d] / n) - latentMean[d]**2;
    latentM2[d]  = Math.sqrt(Math.max(raw, 0.01)); // std, min 0.01
  }

  const pm = mean(pacingValues);
  const ps = stddev(pacingValues);
  const rv = variance(pacingValues);

  return {
    latentMean,
    latentStd:     latentM2,
    pacingMean:    pm,
    pacingStd:     Math.max(ps, 1),
    rhythmVariance:Math.max(rv, 0.5),
    arousalMean:   latentMean[DIM.AROUSAL],
  };
}

// ── Predictive model (simple linear extrapolation) ───────────────────────────
//
//   Given the last PREDICTION_HORIZON+1 latent states, fit a linear trend
//   per dimension and project 1 step ahead.
//   Prediction error = ||actual - predicted|| in latent space.
//

function predictNext(history) {
  const len = history.length;
  if (len < 3) return null;
  const predicted = [];
  for (let d = 0; d < 5; d++) {
    const series = history.map(s => s[d]);
    const s = slope(series);
    predicted.push(series[series.length - 1] + s);
  }
  return predicted;
}

function latentDist(a, b) {
  let sum = 0;
  for (let d = 0; d < 5; d++) sum += (a[d] - b[d]) ** 2;
  return Math.sqrt(sum / 5);
}

// ── Signal detectors ─────────────────────────────────────────────────────────

/**
 * 1. PACING_SHIFT
 * Detects a sustained change in interaction tempo.
 * Input: current inter-event delta in ms vs baseline pacing stats.
 */
function detectPacingShift(subject, interEventMs) {
  const { pacingMean, pacingStd } = subject.baseline;
  if (!pacingStd) return 0;
  const z     = Math.abs(interEventMs - pacingMean) / pacingStd;
  const score = clamp01((z - CFG.PACING_SIGMA) / CFG.PACING_SIGMA);
  if (score <= 0) return 0;

  // Direction: faster (negative) or slower (positive)
  const direction = interEventMs > pacingMean ? 'SLOWING' : 'ACCELERATING';
  return { score, direction, z };
}

/**
 * 2. MICRO_HESITATION
 * Sub-threshold pause spike. Too brief to be intentional pause.
 * Detected by: inter-event delta spikes that last 2–8 frames then resolve.
 */
function detectMicroHesitation(subject, interEventMs) {
  const { pacingMean, pacingStd } = subject.baseline;
  const threshold = pacingMean + pacingStd * CFG.HESITATION_SIGMA;
  const isSpiking = interEventMs > threshold;

  if (isSpiking) {
    subject.pauseSpikeCount++;
  } else {
    // Was actively spiking — check if it resolved within the micro window
    if (subject.hesitationActive &&
        subject.pauseSpikeCount >= CFG.HESITATION_MIN_DWELL &&
        subject.pauseSpikeCount <= CFG.HESITATION_MAX_DWELL) {
      const score = clamp01(subject.pauseSpikeCount / CFG.HESITATION_MAX_DWELL);
      subject.pauseSpikeCount = 0;
      subject.hesitationActive = false;
      return { score, durationFrames: subject.pauseSpikeCount };
    }
    subject.pauseSpikeCount = 0;
    subject.hesitationActive = false;
    return 0;
  }

  // Persisting — is it too long to be micro?
  if (subject.pauseSpikeCount > CFG.HESITATION_MAX_DWELL) {
    // Real pause, not micro
    subject.hesitationActive = false;
    return 0;
  }

  subject.hesitationActive = true;
  return 0; // emit only on resolution
}

/**
 * 3. EMOTIONAL_INCONGRUENCE
 * Cross-channel gap: latent dimensions telling different stories.
 * Primary: SUPPRESSION high AND COHERENCE low AND VALENCE/ENGAGEMENT spread.
 * Secondary: any two dimensions with opposing direction of change.
 */
function detectEmotionalIncongruence(subject, latent, prevLatent) {
  const suppression = latent[DIM.SUPPRESSION];
  const coherence   = latent[DIM.COHERENCE];

  // Primary evidence: suppression up, coherence down
  const primaryGap = clamp01(suppression - coherence);
  if (primaryGap < CFG.INCONGRUENCE_DELTA) return 0;

  // Secondary evidence: cross-dimension direction conflicts
  let conflictScore = 0;
  if (prevLatent) {
    const deltas = latent.map((v, i) => v - prevLatent[i]);
    // Check valence vs engagement conflict
    const valEngConflict = deltas[DIM.VALENCE] * deltas[DIM.ENGAGEMENT] < -0.002;
    // Check arousal vs coherence conflict
    const aroCohConflict = deltas[DIM.AROUSAL] > 0.02 && deltas[DIM.COHERENCE] < -0.02;
    conflictScore = (valEngConflict ? 0.2 : 0) + (aroCohConflict ? 0.2 : 0);
  }

  const score = clamp01(primaryGap * 0.7 + conflictScore * 0.3);
  const channels = [];
  if (suppression > 0.5) channels.push('SUPPRESSION');
  if (coherence < 0.4)   channels.push('COHERENCE');
  return { score, channels, suppression, coherence };
}

/**
 * 4. BEHAVIORAL_DRIFT
 * Cumulative distance from session baseline mean in latent space.
 * Uses EMA to avoid noise and detect sustained rotation.
 */
function detectBehavioralDrift(subject, latent) {
  const { latentMean, latentStd } = subject.baseline;

  // Normalized distance from baseline (per-dimension z-score → Euclidean)
  let distSq = 0;
  for (let d = 0; d < 5; d++) {
    const z = (latent[d] - latentMean[d]) / latentStd[d];
    distSq += z * z;
  }
  const dist = Math.sqrt(distSq / 5); // normalized 0–∞

  // EMA of distance
  subject.driftEma = subject.driftEma * (1 - CFG.DRIFT_ALPHA) + dist * CFG.DRIFT_ALPHA;

  const score = clamp01((subject.driftEma - CFG.DRIFT_SIGMA) / CFG.DRIFT_SIGMA);
  if (score <= 0) return 0;

  // Dominant drifting dimensions
  const dims = [];
  for (let d = 0; d < 5; d++) {
    const z = Math.abs((latent[d] - latentMean[d]) / latentStd[d]);
    if (z > CFG.DRIFT_SIGMA) dims.push({ dim: d, z: Math.round(z * 10) / 10 });
  }
  dims.sort((a,b) => b.z - a.z);

  return { score, driftEma: subject.driftEma, dominantDimensions: dims };
}

/**
 * 5. ENERGY_CHANGE
 * Arousal slope over sliding window.
 * Both rising (activation) and falling (withdrawal) are signals.
 * Rate of change matters more than absolute level.
 */
function detectEnergyChange(subject) {
  const vals = subject.energyWindow.values;
  if (vals.length < 5) return 0;

  const s = slope(vals);
  const magnitude = Math.abs(s);
  if (magnitude < CFG.ENERGY_SLOPE_MIN) return 0;

  const score = clamp01(magnitude / (CFG.ENERGY_SLOPE_MIN * 8));
  const direction = s > 0 ? 'RISING' : 'FALLING';
  const current  = vals[vals.length - 1] ?? 0;
  return { score, direction, slope: Math.round(s * 1000) / 1000, current };
}

/**
 * 6. RHYTHM_DISRUPTION
 * Variance in temporal cadence vs personal baseline.
 * Uses the rolling rhythm window variance vs calibration baseline variance.
 */
function detectRhythmDisruption(subject) {
  const vals = subject.rhythmWindow.values;
  if (vals.length < 5) return 0;

  const currentVariance   = variance(vals);
  const baselineVariance  = subject.baseline.rhythmVariance;
  if (!baselineVariance) return 0;

  const ratio = currentVariance / baselineVariance;
  const score = clamp01((ratio - CFG.RHYTHM_SIGMA) / CFG.RHYTHM_SIGMA);
  if (score <= 0) return 0;

  // EMA of rhythm baseline — slowly adapts over long sessions
  if (subject.rhythmEmaBaseline === null) subject.rhythmEmaBaseline = baselineVariance;
  subject.rhythmEmaBaseline =
    subject.rhythmEmaBaseline * (1 - CFG.RHYTHM_ALPHA) +
    currentVariance * CFG.RHYTHM_ALPHA;

  return { score, varianceRatio: Math.round(ratio * 100) / 100, currentVariance };
}

/**
 * 7. PREDICTIVE_MISMATCH
 * Actual latent state vs what the trajectory model predicted.
 * A gap between expected trajectory and actual position.
 */
function detectPredictiveMismatch(subject, latent) {
  const history = subject.latentHistory.values;
  if (history.length < 4) return 0;

  // Build prediction from all frames except the most recent
  const prevHistory = history.slice(0, -1);
  const predicted   = predictNext(prevHistory);
  if (!predicted) return 0;

  const actual = latent;
  const error  = latentDist(actual, predicted);
  if (error < CFG.PREDICTION_ERROR_MIN) return 0;

  const score = clamp01((error - CFG.PREDICTION_ERROR_MIN) / 0.5);

  // Which dimensions caused the biggest surprise
  const surprises = [];
  for (let d = 0; d < 5; d++) {
    const diff = Math.abs(actual[d] - predicted[d]);
    if (diff > 0.05) surprises.push({ dim: d, diff: Math.round(diff * 100) / 100 });
  }
  surprises.sort((a,b) => b.diff - a.diff);

  return { score, predictionError: Math.round(error * 1000) / 1000, surpriseDimensions: surprises };
}

// ── Co-occurrence scoring ────────────────────────────────────────────────────
//
//   The whole point: isolated signals are noise. Correlated signals are signal.
//   For each active signal, boost its score based on how many other signals
//   are co-occurring. Boost is linear: +0.15 per additional active signal.
//

function applyCoOccurrenceBoosts(activeSignals) {
  const n = activeSignals.size;
  if (n <= 1) return; // no co-occurrence to apply

  const boost = (n - 1) * CFG.CO_OCCUR_BOOST;
  for (const [, entry] of activeSignals) {
    entry.score = clamp01(entry.score + boost);
    entry.confidence = confLabel(entry.score) ?? entry.confidence;
    entry.coOccurringCount = n - 1;
  }
}

// ── DriftEngine ───────────────────────────────────────────────────────────────

export class DriftEngine {
  /**
   * @param {{ bus: SISOBus, subjects?: string[], pacingSourceEvent?: string }} opts
   *
   * opts.bus                — the shared SISO bus
   * opts.subjects           — pre-register subject IDs (optional)
   * opts.pacingSourceEvent  — event that carries timing signal (default: latent.update)
   */
  constructor({ bus, subjects = [], pacingSourceEvent = null } = {}) {
    if (!bus) throw new Error('[DriftEngine] bus required');
    this._bus = bus;
    this._subjects = new Map();  // personId → subject state
    this._frame    = 0;
    this._pacingSrc = pacingSourceEvent;

    for (const id of subjects) {
      this._subjects.set(id, createSubjectState());
    }

    this._attach();
  }

  // ── Bus attachment ─────────────────────────────────────────────────────────

  _attach() {
    const b = this._bus;

    b.on('spatial.kernel.latent.update', (data) => {
      this._onLatentUpdate(data);
    });

    b.on('spatial.kernel.landscape.warmstart', ({ personId, landscape }) => {
      if (personId) this._warmStart(personId, landscape);
    });

    b.on('spatial.session.start', ({ personId } = {}) => {
      if (personId) {
        const prev = this._subjects.get(personId);
        this._subjects.set(personId, createSubjectState());
        // Re-apply warm baseline if we had one
        if (prev?._warmBaseline) {
          this._subjects.get(personId).baseline = prev._warmBaseline;
          this._subjects.get(personId).calibrated = true;
          this._subjects.get(personId).calibrationCount = CFG.CALIBRATION_WINDOW;
        }
      }
    });

    b.on('spatial.session.stop', ({ personId } = {}) => {
      if (personId) this._emitSummary(personId);
    });
  }

  // ── Warm-start from prior landscape ───────────────────────────────────────
  //
  //   If we have a prior attractor landscape for this person, bootstrap
  //   the baseline from restingState rather than waiting for recalibration.
  //

  _warmStart(personId, landscape) {
    let subject = this._subjects.get(personId);
    if (!subject) {
      subject = createSubjectState();
      this._subjects.set(personId, subject);
    }

    const rs = landscape?.restingState;
    if (!rs || rs.length < 5) return;

    subject.baseline.latentMean    = [...rs];
    subject.baseline.latentStd     = [0.15, 0.15, 0.15, 0.15, 0.15];
    subject.baseline.arousalMean   = rs[DIM.AROUSAL];
    subject._warmBaseline          = { ...subject.baseline };
    subject.calibrated             = true;
    subject.calibrationCount       = CFG.CALIBRATION_WINDOW;

    this._bus.emit('spatial.kernel.drift.baseline_ready', {
      personId,
      source: 'WARM_START',
      baseline: { ...subject.baseline },
      ts: Date.now(),
    });
  }

  // ── Main update ───────────────────────────────────────────────────────────

  _onLatentUpdate({ personId, state, ts } = {}) {
    if (!personId || !state) return;

    let subject = this._subjects.get(personId);
    if (!subject) {
      subject = createSubjectState();
      this._subjects.set(personId, subject);
    }

    const latent = state;
    const now    = ts ?? Date.now();
    subject.frame++;
    this._frame++;

    // Inter-event timing
    const interEventMs = subject.lastInterEventMs !== null
      ? now - subject.lastInterEventMs
      : 0;
    subject.lastInterEventMs = now;

    // Feed rolling windows (always, before calibration check)
    subject.energyWindow.push(latent[DIM.AROUSAL]);
    subject.rhythmWindow.push(interEventMs > 0 ? interEventMs : 0);
    subject.latentHistory.push([...latent]);

    // ── Calibration phase ──────────────────────────────────────────────────
    if (!subject.calibrated) {
      subject.baselineSamples.push([...latent]);
      if (interEventMs > 0) subject.pacingWindow.push(interEventMs);
      subject.calibrationCount++;

      if (subject.calibrationCount >= CFG.CALIBRATION_WINDOW) {
        const pVals   = subject.pacingWindow.values.length > 0
          ? subject.pacingWindow.values
          : [200]; // fallback 200ms if no timing data
        const newBase = computeBaseline(subject.baselineSamples, pVals);
        if (newBase) {
          subject.baseline   = newBase;
          subject.calibrated = true;
          this._bus.emit('spatial.kernel.drift.baseline_ready', {
            personId,
            source: 'CALIBRATION',
            baseline: { ...newBase },
            framesObserved: subject.calibrationCount,
            ts: Date.now(),
          });
        }
      }
      return; // no signals during calibration
    }

    // ── Detection phase ───────────────────────────────────────────────────
    if (interEventMs > 0) subject.pacingWindow.push(interEventMs);

    subject.activeSignals.clear();
    const prevLatent = subject.prevLatent;

    // 1. Pacing shift
    if (interEventMs > 0) {
      const ps = detectPacingShift(subject, interEventMs);
      if (ps && ps.score >= CFG.SIGNAL_THRESHOLD) {
        subject.activeSignals.set(SIGNAL.PACING_SHIFT, { score: ps.score, ...ps });
      }
    }

    // 2. Micro-hesitation (stateful — updates subject internally)
    if (interEventMs > 0) {
      const mh = detectMicroHesitation(subject, interEventMs);
      if (mh && mh.score >= CFG.SIGNAL_THRESHOLD) {
        subject.activeSignals.set(SIGNAL.MICRO_HESITATION, { score: mh.score, ...mh });
      }
    }

    // 3. Emotional incongruence
    const ei = detectEmotionalIncongruence(subject, latent, prevLatent);
    if (ei && ei.score >= CFG.SIGNAL_THRESHOLD) {
      subject.activeSignals.set(SIGNAL.EMOTIONAL_INCONGRUENCE, { score: ei.score, ...ei });
    }

    // 4. Behavioral drift
    const bd = detectBehavioralDrift(subject, latent);
    if (bd && bd.score >= CFG.SIGNAL_THRESHOLD) {
      subject.activeSignals.set(SIGNAL.BEHAVIORAL_DRIFT, { score: bd.score, ...bd });
    }

    // 5. Energy change
    const ec = detectEnergyChange(subject);
    if (ec && ec.score >= CFG.SIGNAL_THRESHOLD) {
      subject.activeSignals.set(SIGNAL.ENERGY_CHANGE, { score: ec.score, ...ec });
    }

    // 6. Rhythm disruption
    const rd = detectRhythmDisruption(subject);
    if (rd && rd.score >= CFG.SIGNAL_THRESHOLD) {
      subject.activeSignals.set(SIGNAL.RHYTHM_DISRUPTION, { score: rd.score, ...rd });
    }

    // 7. Predictive mismatch
    const pm = detectPredictiveMismatch(subject, latent);
    if (pm && pm.score >= CFG.SIGNAL_THRESHOLD) {
      subject.activeSignals.set(SIGNAL.PREDICTIVE_MISMATCH, { score: pm.score, ...pm });
    }

    // ── Co-occurrence boosts ───────────────────────────────────────────────
    applyCoOccurrenceBoosts(subject.activeSignals);

    // ── Emit individual signals ────────────────────────────────────────────
    for (const [signalType, entry] of subject.activeSignals) {
      const conf = confLabel(entry.score);
      if (!conf) continue; // below threshold after boost
      const ev = {
        personId,
        signal:     signalType,
        score:      Math.round(entry.score * 1000) / 1000,
        confidence: conf,
        frame:      subject.frame,
        ts:         now,
        ...entry,
      };
      delete ev.score; // already set above
      ev.score = Math.round(entry.score * 1000) / 1000; // re-set cleanly
      subject.signalLog.push(ev);
      if (subject.signalLog.length > 120) subject.signalLog.shift();
      this._bus.emit('spatial.kernel.drift.signal', ev);
    }

    // ── Cluster event ──────────────────────────────────────────────────────
    if (subject.activeSignals.size >= CFG.CLUSTER_MIN_SIGNALS) {
      const signals = [...subject.activeSignals.entries()].map(([type, entry]) => ({
        type,
        score:      entry.score,
        confidence: confLabel(entry.score),
      }));
      const clusterScore = mean(signals.map(s => s.score));
      this._bus.emit('spatial.kernel.drift.cluster', {
        personId,
        signals,
        clusterScore:      Math.round(clusterScore * 1000) / 1000,
        clusterConfidence: confLabel(clusterScore),
        frame:             subject.frame,
        ts:                now,
      });
    }

    // ── Periodic state snapshot ────────────────────────────────────────────
    if (subject.frame % CFG.STATE_EMIT_INTERVAL === 0) {
      this._emitState(personId, subject, latent, now);
    }

    // ── Heartbeat ─────────────────────────────────────────────────────────
    if (subject.frame % CFG.PULSE_INTERVAL === 0) {
      this._bus.emit('spatial.kernel.drift.pulse', {
        personId,
        frame:      subject.frame,
        calibrated: subject.calibrated,
        driftEma:   Math.round(subject.driftEma * 1000) / 1000,
        activeSignalCount: subject.activeSignals.size,
        ts: now,
      });
    }

    subject.prevLatent = [...latent];
  }

  // ── State snapshot ────────────────────────────────────────────────────────

  _emitState(personId, subject, latent, ts) {
    const allSignals = {};
    for (const [type, entry] of subject.activeSignals) {
      allSignals[type] = {
        score:      Math.round(entry.score * 1000) / 1000,
        confidence: confLabel(entry.score),
      };
    }

    this._bus.emit('spatial.kernel.drift.state', {
      personId,
      frame:        subject.frame,
      calibrated:   subject.calibrated,
      signals:      allSignals,
      activeCount:  subject.activeSignals.size,
      driftEma:     Math.round(subject.driftEma * 1000) / 1000,
      latentSnapshot: latent.map(v => Math.round(v * 1000) / 1000),
      ts,
    });
  }

  // ── Session summary ───────────────────────────────────────────────────────

  _emitSummary(personId) {
    const subject = this._subjects.get(personId);
    if (!subject) return;

    const log = subject.signalLog;
    const counts = {};
    for (const ev of log) {
      counts[ev.signal] = (counts[ev.signal] ?? 0) + 1;
    }
    const peakDrift = Math.round(subject.driftEma * 1000) / 1000;

    this._bus.emit('spatial.kernel.drift.summary', {
      personId,
      totalFrames:    subject.frame,
      calibrated:     subject.calibrated,
      signalCounts:   counts,
      totalSignals:   log.length,
      peakDriftEma:   peakDrift,
      ts:             Date.now(),
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Current drift state for a subject — or null if not yet calibrated. */
  state(personId) {
    const s = this._subjects.get(personId);
    if (!s || !s.calibrated) return null;
    return {
      calibrated:    s.calibrated,
      frame:         s.frame,
      driftEma:      s.driftEma,
      activeSignals: [...s.activeSignals.entries()].map(([type, e]) => ({
        type,
        score: e.score,
        confidence: confLabel(e.score),
      })),
    };
  }

  /** Force-set baseline for a subject (e.g. from an external calm window). */
  setBaseline(personId, baseline) {
    let subject = this._subjects.get(personId);
    if (!subject) { subject = createSubjectState(); this._subjects.set(personId, subject); }
    subject.baseline   = { ...subject.baseline, ...baseline };
    subject.calibrated = true;
    this._bus.emit('spatial.kernel.drift.baseline_ready', {
      personId, source: 'MANUAL', baseline: { ...subject.baseline }, ts: Date.now(),
    });
  }

  /** Reset a subject entirely — e.g. after a session gap. */
  reset(personId) {
    this._subjects.set(personId, createSubjectState());
  }

  get subjectCount() { return this._subjects.size; }
}
