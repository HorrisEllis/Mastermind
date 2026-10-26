// ============================================================
// RESONANCE SCORING ENGINE
// Computes how two users' expression systems relate.
// Not compatibility. Not similarity. Interaction dynamics.
// ============================================================

import type { SignalVector, OscillationProfile, ResonanceResult } from '../types';

// ─── Math ────────────────────────────────────────────────────

function dot(a: number[], b: number[]): number {
  return a.reduce((sum, v, i) => sum + v * b[i], 0);
}

function magnitude(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

function cosine(a: number[], b: number[]): number {
  const mag = magnitude(a) * magnitude(b);
  if (mag === 0) return 0;
  return Math.max(-1, Math.min(1, dot(a, b) / mag));
}

// Signed difference similarity: 1 if identical, 0 if opposite
function axisSimilarity(a: number, b: number): number {
  return 1 - Math.abs(a - b);
}

// ─── Signal vectorizers ──────────────────────────────────────

function toVector(signal: SignalVector): number[] {
  return [
    ...Object.values(signal.cognition),
    ...Object.values(signal.affect),
    ...Object.values(signal.language),
    signal.entropy,
    signal.intensity
  ];
}

function groupVector(signal: SignalVector, group: keyof Pick<SignalVector, 'cognition' | 'affect' | 'language'>): number[] {
  return Object.values(signal[group]) as number[];
}

// ─── Average multiple signals ────────────────────────────────

function avgSignal(signals: SignalVector[]): SignalVector | null {
  if (signals.length === 0) return null;

  const avg = (key: string, group: 'cognition' | 'affect' | 'language') =>
    signals.reduce((s, v) => s + (v[group] as any)[key], 0) / signals.length;

  const template = signals[0];
  return {
    ...template,
    cognition: Object.fromEntries(
      Object.keys(template.cognition).map(k => [k, avg(k, 'cognition')])
    ) as any,
    affect: Object.fromEntries(
      Object.keys(template.affect).map(k => [k, avg(k, 'affect')])
    ) as any,
    language: Object.fromEntries(
      Object.keys(template.language).map(k => [k, avg(k, 'language')])
    ) as any,
    entropy: signals.reduce((s, v) => s + v.entropy, 0) / signals.length,
    intensity: signals.reduce((s, v) => s + v.intensity, 0) / signals.length
  };
}

// ─── Structural resonance ────────────────────────────────────
// How similar is their mean expression vector?
// Uses per-group cosine + overall.

function structuralResonance(a: SignalVector, b: SignalVector): {
  total: number;
  cognition: number;
  affect: number;
  language: number;
} {
  const cogSim = (cosine(groupVector(a, 'cognition'), groupVector(b, 'cognition')) + 1) / 2;
  const affSim = (cosine(groupVector(a, 'affect'), groupVector(b, 'affect')) + 1) / 2;
  const langSim = (cosine(groupVector(a, 'language'), groupVector(b, 'language')) + 1) / 2;

  const total = cogSim * 0.35 + affSim * 0.35 + langSim * 0.30;

  return { total, cognition: cogSim, affect: affSim, language: langSim };
}

// ─── Oscillation resonance ───────────────────────────────────
// How similar is their dynamic behavior over time?

function oscillationResonance(a: OscillationProfile, b: OscillationProfile): number {
  const ampSim = 1 - Math.abs(a.amplitude.overall - b.amplitude.overall);
  const freqSim = 1 - (
    Math.abs(a.frequency.cognition - b.frequency.cognition) * 0.33 +
    Math.abs(a.frequency.affect - b.frequency.affect) * 0.33 +
    Math.abs(a.frequency.language - b.frequency.language) * 0.33
  );
  const stabSim = 1 - Math.abs(a.stability - b.stability);
  const recSim = 1 - Math.abs(a.recovery - b.recovery);

  return ampSim * 0.30 + freqSim * 0.30 + stabSim * 0.20 + recSim * 0.20;
}

// ─── Temporal alignment ──────────────────────────────────────
// Are they in the same phase of their current cycle?

function temporalAlignment(a: OscillationProfile, b: OscillationProfile): number {
  const phaseDiff = Math.abs(a.currentPhase - b.currentPhase);
  const directionMatch =
    a.phaseShift.direction === b.phaseShift.direction ? 1.0 :
    a.phaseShift.direction === 'stable' || b.phaseShift.direction === 'stable' ? 0.6 : 0.2;

  return (1 - phaseDiff) * 0.6 + directionMatch * 0.4;
}

// ─── Match type classifier ───────────────────────────────────
// Describes the DYNAMIC RELATIONSHIP, not just similarity.

function classifyMatch(
  structural: number,
  oscillation: number,
  temporal: number,
  a: SignalVector,
  b: SignalVector,
  aOsc: OscillationProfile,
  bOsc: OscillationProfile
): ResonanceResult['matchType'] {
  const totalSimilarity = structural * 0.5 + oscillation * 0.3 + temporal * 0.2;

  // Mirror: high similarity across all axes
  if (totalSimilarity > 0.72) return 'mirror';

  // Complementary: similar structure, different oscillation pattern
  // (one stable, one volatile — they regulate each other)
  const structureHigh = structural > 0.60;
  const oscDifferent = Math.abs(aOsc.stability - bOsc.stability) > 0.3;
  if (structureHigh && oscDifferent) return 'complementary';

  // Friction: similar cognition, different affect → growth tension
  const cogSim = (cosine(
    Object.values(a.cognition) as number[],
    Object.values(b.cognition) as number[]
  ) + 1) / 2;
  const affDiff = 1 - (cosine(
    Object.values(a.affect) as number[],
    Object.values(b.affect) as number[]
  ) + 1) / 2;
  if (cogSim > 0.65 && affDiff > 0.4) return 'friction';

  return 'dissonant';
}

// ─── Human-readable insight generator ───────────────────────

function generateInsights(
  structural: { total: number; cognition: number; affect: number; language: number },
  oscillation: number,
  temporal: number,
  a: SignalVector,
  b: SignalVector,
  aOsc: OscillationProfile,
  bOsc: OscillationProfile,
  matchType: ResonanceResult['matchType']
): string[] {
  const insights: string[] = [];

  // Cognition
  if (structural.cognition > 0.75) {
    const aAbs = a.cognition.abstractionLevel;
    const bAbs = b.cognition.abstractionLevel;
    if (aAbs > 0.65 && bAbs > 0.65) {
      insights.push('Both operate at high abstraction — conversation will move fast and stay conceptual.');
    } else if (aAbs < 0.4 && bAbs < 0.4) {
      insights.push('Both think in concrete, grounded terms — strong shared anchor in the practical.');
    } else {
      insights.push('Strong alignment in cognitive rhythm and structure of reasoning.');
    }
  } else if (structural.cognition < 0.4) {
    insights.push('Different abstraction levels — one grounds, the other lifts. Creative tension possible.');
  }

  // Affect dynamics
  if (structural.affect > 0.70) {
    insights.push('Emotional processing patterns align — similar volatility and recovery arc.');
  }
  if (Math.abs(aOsc.amplitude.affect - bOsc.amplitude.affect) > 0.35) {
    const moreVolatile = aOsc.amplitude.affect > bOsc.amplitude.affect ? 'A' : 'B';
    insights.push(`One person carries more emotional amplitude — potential for one to stabilize the other.`);
  }

  // Language match
  if (structural.language > 0.72) {
    const aPoetic = a.language.poeticness;
    const bPoetic = b.language.poeticness;
    if (aPoetic > 0.6 && bPoetic > 0.6) {
      insights.push('Shared poetic and symbolic register — language will feel mutual without effort.');
    } else if (a.language.analyticalness > 0.6 && b.language.analyticalness > 0.6) {
      insights.push('Both default to analytical structure — high precision in mutual communication.');
    } else {
      insights.push('Similar language architecture — how things are said will feel native.');
    }
  }

  // Oscillation
  if (oscillation > 0.70) {
    insights.push('Oscillation patterns are closely matched — rhythm of engagement will sync naturally.');
  }
  if (Math.abs(aOsc.stability - bOsc.stability) > 0.35) {
    insights.push('Different stability profiles — one provides ground, one provides movement.');
  }

  // Phase
  if (temporal > 0.70) {
    insights.push('Currently in similar phase of expression cycle — good timing for contact.');
  } else if (temporal < 0.35) {
    insights.push('Phase misalignment — connection may feel like ships passing; better timing may improve it.');
  }

  // Match type specific
  if (matchType === 'mirror') {
    insights.push('Mirror resonance: they are likely to recognize themselves in each other immediately.');
  } else if (matchType === 'complementary') {
    insights.push('Complementary resonance: stable and dynamic — each fills what the other is not carrying.');
  } else if (matchType === 'friction') {
    insights.push('Friction resonance: shared thought structure, different emotional processing — growth pressure, not incompatibility.');
  }

  return insights.slice(0, 4); // cap at 4 for readability
}

// ─── Main ────────────────────────────────────────────────────

export interface ResonanceInput {
  userA: string;
  signalsA: SignalVector[];
  oscA: OscillationProfile;
  userB: string;
  signalsB: SignalVector[];
  oscB: OscillationProfile;
  windowSize?: number; // how many recent signals to use for structural comparison
}

export function computeResonance(input: ResonanceInput): ResonanceResult {
  const win = input.windowSize ?? 10;

  const recentA = input.signalsA.slice(-win);
  const recentB = input.signalsB.slice(-win);

  const avgA = avgSignal(recentA);
  const avgB = avgSignal(recentB);

  if (!avgA || !avgB) {
    return {
      userA: input.userA,
      userB: input.userB,
      computedAt: Date.now(),
      structural: 0,
      oscillation: 0,
      temporal: 0,
      total: 0,
      matchType: 'dissonant',
      insights: ['Insufficient signal data for one or both users.'],
      axes: { cognition: 0, affect: 0, language: 0 }
    };
  }

  const structural = structuralResonance(avgA, avgB);
  const oscillation = oscillationResonance(input.oscA, input.oscB);
  const temporal = temporalAlignment(input.oscA, input.oscB);

  const total = structural.total * 0.45 + oscillation * 0.45 + temporal * 0.10;

  const matchType = classifyMatch(
    structural.total, oscillation, temporal,
    avgA, avgB, input.oscA, input.oscB
  );

  const insights = generateInsights(
    structural, oscillation, temporal,
    avgA, avgB, input.oscA, input.oscB, matchType
  );

  return {
    userA: input.userA,
    userB: input.userB,
    computedAt: Date.now(),
    structural: structural.total,
    oscillation,
    temporal,
    total,
    matchType,
    insights,
    axes: {
      cognition: structural.cognition,
      affect: structural.affect,
      language: structural.language
    }
  };
}
