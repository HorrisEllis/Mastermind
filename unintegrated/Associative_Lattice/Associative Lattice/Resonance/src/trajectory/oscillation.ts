// ============================================================
// OSCILLATION COMPUTER
// Takes a user's signal history and computes their oscillation profile:
// amplitude, frequency, phase, stability, and recovery speed.
// ============================================================

import type { SignalVector, OscillationProfile } from '../types';

// ─── Signal group flatteners ──────────────────────────────────

function cogVector(s: SignalVector): number[] {
  return Object.values(s.cognition);
}
function affVector(s: SignalVector): number[] {
  return Object.values(s.affect);
}
function langVector(s: SignalVector): number[] {
  return Object.values(s.language);
}

function groupMean(vectors: number[][]): number {
  const flat = vectors.flat();
  return flat.reduce((a, b) => a + b, 0) / flat.length;
}

// ─── Stats ───────────────────────────────────────────────────

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  return Math.sqrt(variance(values));
}

// Rate of change between consecutive values (mean absolute delta)
function meanAbsoluteDelta(values: number[]): number {
  if (values.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < values.length; i++) {
    sum += Math.abs(values[i] - values[i - 1]);
  }
  return sum / (values.length - 1);
}

// ─── Phase estimation ────────────────────────────────────────
// Where is this person in their current oscillation cycle?
// Approximated as normalized position in last-N moving average window.

function estimateCurrentPhase(values: number[], windowSize = 5): number {
  if (values.length < windowSize) return 0.5;

  const recent = values.slice(-windowSize);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min;
  if (range === 0) return 0.5;

  const lastVal = recent[recent.length - 1];
  return (lastVal - min) / range;
}

// ─── Drift direction ─────────────────────────────────────────
// Is the overall trajectory rising, falling, stable, or oscillating?

function detectPhaseShift(values: number[]): OscillationProfile['phaseShift'] {
  if (values.length < 4) return { direction: 'stable', magnitude: 0 };

  const half = Math.floor(values.length / 2);
  const firstHalfMean = values.slice(0, half).reduce((a, b) => a + b, 0) / half;
  const secondHalfMean = values.slice(half).reduce((a, b) => a + b, 0) / (values.length - half);
  const delta = secondHalfMean - firstHalfMean;
  const magnitude = Math.abs(delta);

  const mad = meanAbsoluteDelta(values);

  let direction: OscillationProfile['phaseShift']['direction'];
  if (mad > 0.15 && magnitude < 0.05) {
    direction = 'oscillating';
  } else if (delta > 0.05) {
    direction = 'ascending';
  } else if (delta < -0.05) {
    direction = 'descending';
  } else {
    direction = 'stable';
  }

  return { direction, magnitude: Math.min(1, magnitude * 3) };
}

// ─── Recovery speed ──────────────────────────────────────────
// How fast does signal intensity return to baseline after spikes?
// High recovery = returns fast after outlier events.

function computeRecovery(intensities: number[]): number {
  if (intensities.length < 4) return 0.5;

  const mean = intensities.reduce((a, b) => a + b, 0) / intensities.length;
  const threshold = mean + standardDeviation(intensities) * 0.8;

  // Find spike indices
  const spikeIndices: number[] = [];
  intensities.forEach((v, i) => { if (v > threshold) spikeIndices.push(i); });

  if (spikeIndices.length === 0) return 0.8; // stable, no spikes

  // Measure how quickly values drop after each spike
  const recoveryLengths: number[] = [];
  for (const spikeIdx of spikeIndices) {
    for (let j = spikeIdx + 1; j < intensities.length; j++) {
      if (intensities[j] <= mean) {
        recoveryLengths.push(j - spikeIdx);
        break;
      }
    }
  }

  if (recoveryLengths.length === 0) return 0.3; // spikes never resolved

  const avgRecovery = recoveryLengths.reduce((a, b) => a + b, 0) / recoveryLengths.length;
  // Normalize: 1 step = 1.0 recovery, 10 steps = 0.1 recovery
  return Math.max(0, Math.min(1, 1 / avgRecovery));
}

// ─── Main ────────────────────────────────────────────────────

export function computeOscillation(
  userId: string,
  signals: SignalVector[],
  windowSize?: number
): OscillationProfile {
  const n = windowSize ?? signals.length;

  if (signals.length < 2) {
    return {
      userId,
      windowSize: n,
      computedAt: Date.now(),
      amplitude: { cognition: 0, affect: 0, language: 0, overall: 0 },
      frequency: { cognition: 0, affect: 0, language: 0 },
      phaseShift: { direction: 'stable', magnitude: 0 },
      stability: 1,
      recovery: 0.5,
      currentPhase: 0.5
    };
  }

  const cogMeans = signals.map(s => groupMean([cogVector(s)]));
  const affMeans = signals.map(s => groupMean([affVector(s)]));
  const langMeans = signals.map(s => groupMean([langVector(s)]));
  const intensities = signals.map(s => s.intensity);
  const entropies = signals.map(s => s.entropy);

  const cogAmp = standardDeviation(cogMeans);
  const affAmp = standardDeviation(affMeans);
  const langAmp = standardDeviation(langMeans);
  const overallAmp = standardDeviation([...cogMeans, ...affMeans, ...langMeans]);

  const cogFreq = Math.min(1, meanAbsoluteDelta(cogMeans) * 5);
  const affFreq = Math.min(1, meanAbsoluteDelta(affMeans) * 5);
  const langFreq = Math.min(1, meanAbsoluteDelta(langMeans) * 5);

  // Stability: inverse of overall amplitude + entropy variance
  const entropyVariance = variance(entropies);
  const stability = Math.max(0, Math.min(1, 1 - (overallAmp * 1.5 + entropyVariance)));

  const recovery = computeRecovery(intensities);
  const phaseShift = detectPhaseShift(affMeans);
  const currentPhase = estimateCurrentPhase(affMeans);

  return {
    userId,
    windowSize: n,
    computedAt: Date.now(),
    amplitude: {
      cognition: Math.min(1, cogAmp * 3),
      affect: Math.min(1, affAmp * 3),
      language: Math.min(1, langAmp * 3),
      overall: Math.min(1, overallAmp * 3)
    },
    frequency: { cognition: cogFreq, affect: affFreq, language: langFreq },
    phaseShift,
    stability,
    recovery,
    currentPhase
  };
}
