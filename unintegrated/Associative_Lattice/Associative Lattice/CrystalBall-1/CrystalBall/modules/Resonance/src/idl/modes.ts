// ============================================================
// IDL — MODE CLASSIFIER
// Identifies dominant behavioral attractor from IntimacyVector.
// These are STATES, not identities. Context-dependent.
// ============================================================

import type { IntimacyVector, IntimacyMode, IntimacyModeName } from './types';

interface ModeScore {
  name: IntimacyModeName;
  score: number;
  description: string;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Mode scoring functions ───────────────────────────────────
// Each mode is a weighted combination of axis values.
// Score = 0–1. Winning mode = highest score.

function scoreStructuredDevotional(v: IntimacyVector): number {
  return mean([
    v.persistence.bondRetention,
    v.persistence.repairTendency,
    v.regulation.predictability,
    v.regulation.emotionalConsistency,
    (1 - v.regulation.predictability) < 0.4 ? 1 : 0.5  // must actually be stable
  ]);
}

function scoreChaoticAttachment(v: IntimacyVector): number {
  return mean([
    1 - v.regulation.predictability,
    1 - v.regulation.emotionalConsistency,
    v.persistence.returnLikelihood,       // comes back after chaos
    1 - v.elasticity.separationTolerance, // distressed by distance
    1 - v.elasticity.nonCling
  ]);
}

function scoreDetachedAutonomous(v: IntimacyVector): number {
  return mean([
    v.elasticity.separationTolerance,
    v.elasticity.independenceStability,
    v.elasticity.nonCling,
    v.regulation.predictability,
    1 - v.persistence.bondRetention  // low bond inertia (not cold, just unclingy)
  ]);
}

function scoreDeepProcessor(v: IntimacyVector): number {
  return mean([
    v.latency.internalDepth,
    v.latency.expressionDelay,
    v.latency.integrationTime,
    v.elasticity.independenceStability, // can be alone while processing
    v.regulation.predictability          // consistent, just quiet
  ]);
}

function scoreFluidRelational(v: IntimacyVector): number {
  // Balanced across all axes — adapts to context
  const persistence = mean(Object.values(v.persistence));
  const elasticity = mean(Object.values(v.elasticity));
  const regulation = mean(Object.values(v.regulation));
  const latency = mean(Object.values(v.latency));
  const allMeans = [persistence, elasticity, regulation, latency];
  const overallMean = mean(allMeans);

  // High fluidity = all values near 0.5, nothing extreme
  const deviations = allMeans.map(m => Math.abs(m - overallMean));
  const avgDeviation = mean(deviations);
  return 1 - avgDeviation * 3; // low deviation = high fluidity
}

function scoreAnxiousAttacher(v: IntimacyVector): number {
  return mean([
    1 - v.elasticity.separationTolerance,
    1 - v.elasticity.nonCling,
    1 - v.regulation.emotionalConsistency,
    v.persistence.returnLikelihood,
    1 - v.latency.integrationTime // reactive, not integrated
  ]);
}

function scoreReciprocalBuilder(v: IntimacyVector): number {
  return mean([
    v.persistence.repairTendency,
    v.persistence.bondRetention,
    v.regulation.relationalPacing,
    v.regulation.predictability,
    v.latency.integrationTime,    // thoughtful before expression
    v.elasticity.independenceStability
  ]);
}

// ─── Description generator ───────────────────────────────────

const MODE_DESCRIPTIONS: Record<IntimacyModeName, string> = {
  'structured-devotional':
    'Bonds hold through rupture. Consistent presence, repair-oriented, low emotional volatility. The anchor in a storm.',
  'chaotic-attachment':
    'High amplitude oscillation between closeness and distance. Intense pull followed by withdrawal. Not dysfunction — high variance waveform.',
  'detached-autonomous':
    'Stable internal state independent of relational proximity. Connection exists without grip. Low dependency, high self-regulation.',
  'deep-processor':
    'Internalizes before expressing. Emotion is compressed and integrated before output. Silence is not absence.',
  'fluid-relational':
    'Adapts relational style to context and partner. No dominant axis — context-sensitive bonding.',
  'anxious-attacher':
    'Separation activates distress. High need for relational contact to self-regulate. Reactive rather than integrated.',
  'reciprocal-builder':
    'Steady presence with high repair capacity. Thoughtful pacing, mutual investment orientation. Grows bonds deliberately.'
};

// ─── Main classifier ─────────────────────────────────────────

export function classifyIntimacyMode(vector: IntimacyVector): IntimacyMode {
  const scores: ModeScore[] = [
    { name: 'structured-devotional', score: scoreStructuredDevotional(vector), description: MODE_DESCRIPTIONS['structured-devotional'] },
    { name: 'chaotic-attachment',    score: scoreChaoticAttachment(vector),    description: MODE_DESCRIPTIONS['chaotic-attachment'] },
    { name: 'detached-autonomous',   score: scoreDetachedAutonomous(vector),   description: MODE_DESCRIPTIONS['detached-autonomous'] },
    { name: 'deep-processor',        score: scoreDeepProcessor(vector),        description: MODE_DESCRIPTIONS['deep-processor'] },
    { name: 'fluid-relational',      score: scoreFluidRelational(vector),      description: MODE_DESCRIPTIONS['fluid-relational'] },
    { name: 'anxious-attacher',      score: scoreAnxiousAttacher(vector),      description: MODE_DESCRIPTIONS['anxious-attacher'] },
    { name: 'reciprocal-builder',    score: scoreReciprocalBuilder(vector),    description: MODE_DESCRIPTIONS['reciprocal-builder'] }
  ];

  scores.sort((a, b) => b.score - a.score);

  const primary = scores[0];
  const secondary = scores[1].score > 0.45 ? scores[1] : null;

  // Confidence: gap between top and second
  const gap = primary.score - scores[1].score;
  const confidence = Math.min(1, gap * 2 + 0.4);

  return {
    primary: primary.name,
    secondary: secondary?.name ?? null,
    confidence,
    description: primary.description
  };
}
