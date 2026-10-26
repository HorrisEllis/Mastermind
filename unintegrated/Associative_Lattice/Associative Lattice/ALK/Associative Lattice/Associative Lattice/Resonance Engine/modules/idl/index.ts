// ============================================================
// IDL — RELATIONAL DYNAMICS
// Computes the interaction physics between two IntimacyVectors.
// Not compatibility scoring. The shape of how two systems meet.
// ============================================================

import type { IntimacyVector, IntimacyMode, RelationalDynamic, RelationalDynamicType } from './types';

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function delta(a: number, b: number): number {
  return Math.abs(a - b);
}

// ─── Axis deltas ─────────────────────────────────────────────

function computeAxisDeltas(a: IntimacyVector, b: IntimacyVector) {
  const persistenceDelta = mean([
    delta(a.persistence.bondRetention, b.persistence.bondRetention),
    delta(a.persistence.repairTendency, b.persistence.repairTendency),
    delta(a.persistence.returnLikelihood, b.persistence.returnLikelihood)
  ]);

  const elasticityDelta = mean([
    delta(a.elasticity.separationTolerance, b.elasticity.separationTolerance),
    delta(a.elasticity.independenceStability, b.elasticity.independenceStability),
    delta(a.elasticity.nonCling, b.elasticity.nonCling)
  ]);

  const regulationDelta = mean([
    delta(a.regulation.predictability, b.regulation.predictability),
    delta(a.regulation.emotionalConsistency, b.regulation.emotionalConsistency),
    delta(a.regulation.relationalPacing, b.regulation.relationalPacing)
  ]);

  const latencyDelta = mean([
    delta(a.latency.internalDepth, b.latency.internalDepth),
    delta(a.latency.expressionDelay, b.latency.expressionDelay),
    delta(a.latency.integrationTime, b.latency.integrationTime)
  ]);

  return { persistenceDelta, elasticityDelta, regulationDelta, latencyDelta };
}

// ─── Compatibility scores ─────────────────────────────────────

function processingCompatibility(a: IntimacyVector, b: IntimacyVector): number {
  // How well do their processing styles mesh?
  // Two internal processors → deep but slow
  // External + internal → one talks, one thinks — can work if paced
  // Two external → real-time, fast, possibly turbulent

  const latencyDiff = mean([
    delta(a.latency.internalDepth, b.latency.internalDepth),
    delta(a.latency.expressionDelay, b.latency.expressionDelay)
  ]);

  // Small difference → high compatibility
  // Large difference → needs explicit pacing agreements
  return Math.max(0, 1 - latencyDiff * 1.8);
}

function regulationCompatibility(a: IntimacyVector, b: IntimacyVector): number {
  const regA = mean(Object.values(a.regulation));
  const regB = mean(Object.values(b.regulation));

  // Either similar regulation → natural rhythm
  // Or one high-reg + one low-reg → stabilizing dynamic (complementary, not incompatible)
  const diff = delta(regA, regB);

  if (diff < 0.2) return 0.9;   // similar rhythm — smooth
  if (diff < 0.4) return 0.7;   // one stabilizes the other — workable
  return Math.max(0.2, 0.7 - diff); // large mismatch → friction
}

// ─── Dynamic type classifier ──────────────────────────────────

function classifyDynamicType(
  axes: ReturnType<typeof computeAxisDeltas>,
  modeA: IntimacyMode,
  modeB: IntimacyMode,
  procCompat: number,
  regCompat: number
): RelationalDynamicType {
  const { persistenceDelta, elasticityDelta, regulationDelta, latencyDelta } = axes;
  const totalDelta = mean([persistenceDelta, elasticityDelta, regulationDelta, latencyDelta]);

  // Mirroring: very similar across all axes
  if (totalDelta < 0.15 && modeA.primary === modeB.primary) {
    return 'mirroring';
  }

  // Stabilizing: one is regulated, one is chaotic
  const oneIsStructured = modeA.primary === 'structured-devotional' || modeB.primary === 'structured-devotional'
    || modeA.primary === 'reciprocal-builder' || modeB.primary === 'reciprocal-builder';
  const oneIsChaotic = modeA.primary === 'chaotic-attachment' || modeB.primary === 'chaotic-attachment'
    || modeA.primary === 'anxious-attacher' || modeB.primary === 'anxious-attacher';
  if (oneIsStructured && oneIsChaotic) return 'stabilizing';

  // Oscillating: both high-amplitude modes — amplify each other
  const bothHighAmplitude = (
    modeA.primary === 'chaotic-attachment' || modeA.primary === 'anxious-attacher'
  ) && (
    modeB.primary === 'chaotic-attachment' || modeB.primary === 'anxious-attacher'
  );
  if (bothHighAmplitude) return 'oscillating';

  // Complementary: different elasticity + regulation, similar persistence
  if (elasticityDelta > 0.3 && persistenceDelta < 0.25 && regulationDelta > 0.25) {
    return 'complementary';
  }

  // Asymmetric: large latency mismatch — one processes before speaking, one doesn't wait
  if (latencyDelta > 0.4 && procCompat < 0.4) {
    return 'asymmetric';
  }

  // Friction-growth: moderate mismatch across multiple axes — not incompatible, generative
  if (totalDelta > 0.2 && totalDelta < 0.5) {
    return 'friction-growth';
  }

  return 'complementary'; // default — different systems, potentially completing
}

// ─── Description builder ─────────────────────────────────────

const DYNAMIC_DESCRIPTIONS: Record<RelationalDynamicType, (a: IntimacyMode, b: IntimacyMode) => string> = {
  'stabilizing': (a, b) =>
    `One system stabilizes the other's oscillation. The ${a.primary} and ${b.primary} patterns create a ground/movement dynamic — one anchors while the other moves.`,
  'mirroring': (a, _b) =>
    `Both carry the same relational pattern (${a.primary}). Recognition will be immediate. The risk is shared blind spots — no one to catch what neither sees.`,
  'oscillating': (_a, _b) =>
    `Both run high-amplitude attachment patterns. Together the oscillation amplifies — intense closeness followed by intense distance. Not unsustainable, but high-maintenance.`,
  'asymmetric': (a, b) =>
    `Processing latency mismatch. One integrates before speaking; the other speaks to process. Without explicit pacing, the faster one will consistently feel unmet, and the slower one will feel rushed.`,
  'complementary': (a, b) =>
    `Different axis profiles that complete each other. The ${a.primary} and ${b.primary} patterns carry different strengths — what one lacks, the other provides.`,
  'friction-growth': (a, b) =>
    `Meaningful mismatch across multiple axes. The ${a.primary} and ${b.primary} patterns create friction — not damage, but pressure that can produce growth when both systems are stable enough to hold it.`
};

// ─── Warning generator ───────────────────────────────────────

function generateWarnings(
  axes: ReturnType<typeof computeAxisDeltas>,
  a: IntimacyVector,
  b: IntimacyVector,
  dynamicType: RelationalDynamicType
): string[] {
  const warnings: string[] = [];

  if (axes.latencyDelta > 0.4) {
    const faster = a.latency.internalDepth < b.latency.internalDepth ? 'A' : 'B';
    warnings.push(`Processing speed mismatch (Δ${axes.latencyDelta.toFixed(2)}): User ${faster} externalizes faster. Silence from the slower processor may read as withdrawal.`);
  }

  if (axes.elasticityDelta > 0.4) {
    warnings.push(`Elasticity gap (Δ${axes.elasticityDelta.toFixed(2)}): One person needs more contact to stay regulated. Distance that feels natural to one may feel like abandonment to the other.`);
  }

  if (axes.regulationDelta > 0.4) {
    warnings.push(`Regulation rhythm mismatch (Δ${axes.regulationDelta.toFixed(2)}): Different consistency patterns. The less regulated person's variability may exhaust the more regulated one over time.`);
  }

  if (dynamicType === 'oscillating') {
    warnings.push('Both high-amplitude patterns without a regulating anchor. Conflict cycles may escalate rather than resolve.');
  }

  if (dynamicType === 'asymmetric') {
    warnings.push('Pacing misalignment is the primary load-bearing risk here — not incompatibility. Naming it directly reduces it.');
  }

  if (axes.persistenceDelta > 0.4) {
    warnings.push(`Bond inertia asymmetry (Δ${axes.persistenceDelta.toFixed(2)}): One system holds longer. Over time the high-persistence person may carry disproportionate relational weight.`);
  }

  return warnings;
}

// ─── Overall fit ─────────────────────────────────────────────

function computeOverallFit(
  axes: ReturnType<typeof computeAxisDeltas>,
  procCompat: number,
  regCompat: number,
  dynamicType: RelationalDynamicType
): number {
  const axisScore = 1 - mean([
    axes.persistenceDelta,
    axes.elasticityDelta,
    axes.regulationDelta,
    axes.latencyDelta
  ]);

  // Stabilizing and complementary are high-value even with delta
  const typeBonus: Record<RelationalDynamicType, number> = {
    'mirroring': 0.1,
    'stabilizing': 0.05,
    'complementary': 0.05,
    'friction-growth': -0.05,
    'oscillating': -0.1,
    'asymmetric': -0.1
  };

  return Math.max(0, Math.min(1,
    axisScore * 0.5 + procCompat * 0.25 + regCompat * 0.25 + (typeBonus[dynamicType] ?? 0)
  ));
}

// ─── Main ─────────────────────────────────────────────────────

export function computeRelationalDynamic(
  a: IntimacyVector,
  modeA: IntimacyMode,
  b: IntimacyVector,
  modeB: IntimacyMode
): RelationalDynamic {
  const axes = computeAxisDeltas(a, b);
  const procCompat = processingCompatibility(a, b);
  const regCompat = regulationCompatibility(a, b);
  const type = classifyDynamicType(axes, modeA, modeB, procCompat, regCompat);
  const overallFit = computeOverallFit(axes, procCompat, regCompat, type);
  const warnings = generateWarnings(axes, a, b, type);

  return {
    userA: a.userId,
    userB: b.userId,
    computedAt: Date.now(),
    type,
    description: DYNAMIC_DESCRIPTIONS[type](modeA, modeB),
    warnings,
    axes,
    processingCompatibility: procCompat,
    regulationCompatibility: regCompat,
    overallFit
  };
}
