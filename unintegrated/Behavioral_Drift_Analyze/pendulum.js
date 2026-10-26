'use strict';

/**
 * BDA Pendulum Engine
 * Computes behavioral drift metrics from a time-series of signal means.
 *
 * sigma    — coherence score [0,1]. High = consistent behavior.
 * delta    — rate of sigma change [0,1]. High = fast drift.
 * regime   — STABLE | ACTIVATING | OSCILLATING | UNGROUNDED | DYSREGULATED | COLLAPSING
 * damping  — whether swings are settling (damping) or growing (amplifying)
 * phase    — peak | trough | rising | falling
 * slope    — linear regression slope over observation window
 * prediction — projected regime N steps forward
 */

const SIGNAL_KEYS = ['valence', 'certainty', 'openness', 'tension', 'selfref'];

const REGIMES = [
  { name: 'STABLE',       minSigma: 0.85, maxDelta: 0.08 },
  { name: 'ACTIVATING',   minSigma: 0.70, maxDelta: 0.25 },
  { name: 'OSCILLATING',  minSigma: 0.50, maxDelta: 0.60 },
  { name: 'UNGROUNDED',   minSigma: 0.30, maxDelta: 1.00 },
  { name: 'DYSREGULATED', minSigma: 0.10, maxDelta: 1.00 },
  { name: 'COLLAPSING',   minSigma: -1,   maxDelta: 1.00 },
];

// Routing trust per regime (from kern-v2)
const REGIME_TRUST = {
  STABLE: 1.00, ACTIVATING: 0.90, OSCILLATING: 0.75,
  UNGROUNDED: 0.50, DYSREGULATED: 0.20, COLLAPSING: 0.00,
};

const MAX_VARIANCE = 0.25; // max possible variance on [0,1] signals
const WINDOW = 20;         // rolling window size

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function linReg(vals) {
  const n = vals.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = vals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (vals[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function assignRegime(sigma, delta) {
  for (const t of REGIMES) {
    if (sigma >= t.minSigma && delta <= t.maxDelta) return t.name;
  }
  return 'COLLAPSING';
}

function computeSigma(window) {
  if (window.length < 2) return 1.0;
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  const variance = window.reduce((a, v) => a + (v - mean) ** 2, 0) / window.length;
  return clamp(1 - (variance / MAX_VARIANCE), 0, 1);
}

function computeDamping(vals) {
  if (vals.length < 4) return { direction: null, coefficient: null, confidence: 0 };
  const half = Math.floor(vals.length / 2);
  const amp = arr => {
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return Math.max(...arr.map(v => Math.abs(v - m)));
  };
  const a1 = amp(vals.slice(0, half));
  const a2 = amp(vals.slice(half));
  if (a1 < 0.02) return { direction: 'neutral', coefficient: 1, confidence: clamp(vals.length / 10, 0, 1) };
  const coeff = a2 / a1;
  const direction = coeff < 0.85 ? 'damping' : coeff > 1.15 ? 'amplifying' : 'neutral';
  return {
    direction,
    coefficient: +coeff.toFixed(3),
    confidence: +clamp(vals.length / 10, 0, 1).toFixed(2),
  };
}

function computePhase(vals) {
  if (vals.length < 2) return 'unknown';
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const last = vals[vals.length - 1];
  const prev = vals[vals.length - 2];
  if (last > mean && last > prev) return 'peak';
  if (last < mean && last < prev) return 'trough';
  if (last > prev) return 'rising';
  return 'falling';
}

function predict(sigmaHistory, deltaHistory, steps = 10) {
  if (sigmaHistory.length < 3) {
    return { regime: 'STABLE', projectedSigma: null, projectedDelta: null, confidence: 0, warning: false };
  }
  const sigmaSlope = linReg(sigmaHistory);
  const deltaSlope = linReg(deltaHistory);
  const curSigma = sigmaHistory[sigmaHistory.length - 1];
  const curDelta = deltaHistory[deltaHistory.length - 1];
  const projSigma = clamp(curSigma + sigmaSlope * steps, 0, 1);
  const projDelta = clamp(curDelta + deltaSlope * steps, 0, 1);
  const regime = assignRegime(projSigma, projDelta);
  const confidence = clamp(sigmaHistory.length / WINDOW, 0, 1);
  return {
    regime,
    projectedSigma: +projSigma.toFixed(3),
    projectedDelta: +projDelta.toFixed(3),
    sigmaSlope: +sigmaSlope.toFixed(5),
    deltaSlope: +deltaSlope.toFixed(5),
    confidence: +confidence.toFixed(2),
    warning: ['UNGROUNDED', 'DYSREGULATED', 'COLLAPSING'].includes(regime),
  };
}

/**
 * compute(observations, role)
 * observations: array of { signals: {valence,certainty,openness,tension,selfref}, ts }
 * Returns full pendulum state.
 */
function compute(observations) {
  if (!observations || observations.length === 0) return null;

  // Aggregate each observation to a single mean signal value
  const means = observations.map(o => {
    const s = o.signals;
    return SIGNAL_KEYS.reduce((a, k) => a + (s[k] || 0), 0) / SIGNAL_KEYS.length;
  });

  const window = means.slice(-WINDOW);
  const sigma = computeSigma(window);

  const slope = linReg(means);
  // Normalize delta: slope of 0.05/step = delta 0.5
  const delta = clamp(Math.abs(slope) / 0.10, 0, 1);

  const regime = assignRegime(sigma, delta);
  const trust  = REGIME_TRUST[regime];
  const damping = computeDamping(means);
  const phase   = computePhase(means);
  const mean    = +( means.reduce((a, b) => a + b, 0) / means.length ).toFixed(3);

  // Trend
  const trend = slope > 0.015 ? 'rising' : slope < -0.015 ? 'falling' : 'flat';

  // Confidence based on observation count
  const confidence = +clamp(observations.length / 8, 0, 1).toFixed(2);

  // Sigma and delta history for prediction
  const sigmaHistory = [];
  const deltaHistory = [];
  for (let i = 1; i <= Math.min(observations.length, WINDOW); i++) {
    const sub = means.slice(0, i);
    const subWindow = sub.slice(-WINDOW);
    sigmaHistory.push(computeSigma(subWindow));
    deltaHistory.push(clamp(Math.abs(linReg(sub)) / 0.10, 0, 1));
  }

  const prediction = predict(sigmaHistory, deltaHistory);

  return {
    sigma:      +sigma.toFixed(4),
    delta:      +delta.toFixed(4),
    regime,
    trust:      +trust.toFixed(2),
    damping,
    phase,
    trend,
    slope:      +slope.toFixed(5),
    mean,
    confidence,
    prediction,
    n: observations.length,
  };
}

module.exports = { compute, assignRegime, REGIMES, REGIME_TRUST, SIGNAL_KEYS };
