// ============================================================
// IDL — AXES COMPUTATION
// Derives the 4 intimacy axes from a user's signal history.
// Signal vectors carry enough information to infer relational behavior.
// ============================================================

import type { SignalVector } from '../types';
import type { IntimacyVector } from './types';

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function mean(values: number[]): number {
  if (values.length === 0) return 0.5;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
}

function stddev(values: number[]): number {
  return Math.sqrt(variance(values));
}

// ─── Persistence ──────────────────────────────────────────────
// Bond retention inferred from:
// - low emotional volatility over time (stays even when affect spikes)
// - high attachment load (relational density in writing)
// - low entropy spikes (consistent across sessions)

function computePersistence(signals: SignalVector[]): IntimacyVector['persistence'] {
  const volatilities = signals.map(s => s.affect.volatility);
  const attachmentLoads = signals.map(s => s.affect.attachmentLoad);
  const entropies = signals.map(s => s.entropy);

  // Bond retention: inverse of volatility variance (consistent under stress = high retention)
  const volVariance = variance(volatilities);
  const bondRetention = clamp(1 - volVariance * 4);

  // Repair tendency: high attachment load + moderate-high valence (cares + not purely negative)
  const avgAttachment = mean(attachmentLoads);
  const avgValence = mean(signals.map(s => s.affect.valence));
  const repairTendency = clamp(avgAttachment * 0.6 + avgValence * 0.4);

  // Return likelihood: low entropy variance (stable identity across time = returns to baseline)
  const entropyVariance = variance(entropies);
  const returnLikelihood = clamp(1 - entropyVariance * 3);

  return { bondRetention, repairTendency, returnLikelihood };
}

// ─── Elasticity ───────────────────────────────────────────────
// Separation tolerance inferred from:
// - low attachment load = doesn't write relationally saturated text
// - high internal processing (recursion + low urgency)
// - stable identity (low intensity variance)

function computeElasticity(signals: SignalVector[]): IntimacyVector['elasticity'] {
  const attachmentLoads = signals.map(s => s.affect.attachmentLoad);
  const urgencies = signals.map(s => s.affect.urgency);
  const recursions = signals.map(s => s.cognition.recursionDepth);
  const intensities = signals.map(s => s.intensity);

  // Separation tolerance: inverse of attachment load + inverse of urgency
  const avgAttachment = mean(attachmentLoads);
  const avgUrgency = mean(urgencies);
  const separationTolerance = clamp(1 - avgAttachment * 0.6 - avgUrgency * 0.4);

  // Independence stability: high internal recursion = can self-regulate
  const avgRecursion = mean(recursions);
  const intensityVariance = variance(intensities);
  const independenceStability = clamp(avgRecursion * 0.5 + (1 - intensityVariance * 3) * 0.5);

  // Non-cling: inverse of attachment + stable intensities
  const nonCling = clamp((1 - avgAttachment) * 0.7 + (1 - mean(urgencies)) * 0.3);

  return { separationTolerance, independenceStability, nonCling };
}

// ─── Regulation ───────────────────────────────────────────────
// How consistent and predictable is their relational rhythm?
// Inferred from variance across key affect + language axes.

function computeRegulation(signals: SignalVector[]): IntimacyVector['regulation'] {
  if (signals.length < 3) {
    return { predictability: 0.5, emotionalConsistency: 0.5, relationalPacing: 0.5 };
  }

  const volatilities = signals.map(s => s.affect.volatility);
  const valences = signals.map(s => s.affect.valence);
  const narratives = signals.map(s => s.language.narrativeStructure);
  const intensities = signals.map(s => s.intensity);

  // Predictability: low volatility variance + low intensity variance
  const volVar = variance(volatilities);
  const intVar = variance(intensities);
  const predictability = clamp(1 - (volVar * 3 + intVar * 2));

  // Emotional consistency: low valence variance (doesn't swing between poles)
  const valenceVar = variance(valences);
  const emotionalConsistency = clamp(1 - valenceVar * 5);

  // Relational pacing: consistent narrative structure (organized communication)
  const narrativeVar = variance(narratives);
  const avgNarrative = mean(narratives);
  const relationalPacing = clamp(avgNarrative * 0.5 + (1 - narrativeVar * 3) * 0.5);

  return { predictability, emotionalConsistency, relationalPacing };
}

// ─── Latency ─────────────────────────────────────────────────
// Processing depth before expression.
// Inferred from recursion depth, compression, analytical density.

function computeLatency(signals: SignalVector[]): IntimacyVector['latency'] {
  const recursions = signals.map(s => s.cognition.recursionDepth);
  const compressions = signals.map(s => s.cognition.compression);
  const analyticals = signals.map(s => s.language.analyticalness);
  const urgencies = signals.map(s => s.affect.urgency);
  const somaticDensities = signals.map(s => s.affect.somaticDensity);

  // Internal depth: high recursion + high compression = internally processed before output
  const avgRecursion = mean(recursions);
  const avgCompression = mean(compressions);
  const internalDepth = clamp(avgRecursion * 0.6 + avgCompression * 0.4);

  // Expression delay: high internal depth + low urgency = takes time to externalize
  const avgUrgency = mean(urgencies);
  const expressionDelay = clamp(internalDepth * 0.7 + (1 - avgUrgency) * 0.3);

  // Integration time: analytical + somatic both high = slow, full-body integration
  const avgAnalytical = mean(analyticals);
  const avgSomatic = mean(somaticDensities);
  const integrationTime = clamp(avgAnalytical * 0.4 + avgSomatic * 0.3 + internalDepth * 0.3);

  return { internalDepth, expressionDelay, integrationTime };
}

// ─── Main ─────────────────────────────────────────────────────

export function computeIntimacyVector(
  userId: string,
  signals: SignalVector[]
): IntimacyVector {
  return {
    userId,
    computedAt: Date.now(),
    sampleSize: signals.length,
    persistence: computePersistence(signals),
    elasticity: computeElasticity(signals),
    regulation: computeRegulation(signals),
    latency: computeLatency(signals)
  };
}
