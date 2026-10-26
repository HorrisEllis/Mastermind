
// resonance-engine-v0.1.ts

import { IntimacySystem, IntimacyWaveState } from "./idl-v0.1";

/* ------------------------- CORE TYPES ------------------------- */

export interface ResonanceVector {
  structureAlignment: number;
  permeabilityAlignment: number;
  regulationSync: number;
  devotionCoupling: number;
  temporalPhaseSync: number;
}

export interface ResonanceResult {
  resonanceScore: number;
  stabilityIndex: number;
  frictionIndex: number;
  driftConvergence: number;
  oscillationMismatch: number;

  vector: ResonanceVector;

  classification:
    | "harmonic_stability"
    | "growth_friction"
    | "asynchronous_drift"
    | "volatile_coupling"
    | "low_interaction_field";
}

/* ------------------------- UTILS ------------------------- */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

const avg = (arr: number[]) =>
  arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;

/* ------------------------- AXIS EXTRACTION ------------------------- */

function extractLastState(system: IntimacySystem): IntimacyWaveState {
  return system.trajectory.history.at(-1)!;
}

/* ------------------------- PHASE ALIGNMENT ------------------------- */

function phaseSync(aSeries: number[], bSeries: number[]) {
  const len = Math.min(aSeries.length, bSeries.length);

  let diff = 0;

  for (let i = 0; i < len; i++) {
    diff += Math.abs(aSeries[i] - bSeries[i]);
  }

  return 1 - clamp01(diff / len);
}

/* ------------------------- MAIN RESONANCE FUNCTION ------------------------- */

export function computeResonance(
  A: IntimacySystem,
  B: IntimacySystem
): ResonanceResult {
  const aState = extractLastState(A);
  const bState = extractLastState(B);

  /* ---------------- STRUCTURE ALIGNMENT ---------------- */

  const structureAlignment =
    1 -
    Math.abs(
      A.axes.structureChaos.structure -
        B.axes.structureChaos.structure
    );

  /* ---------------- PERMEABILITY ALIGNMENT ---------------- */

  const permeabilityAlignment =
    1 -
    Math.abs(
      A.axes.permeability.emotionalOpenness -
        B.axes.permeability.emotionalOpenness
    );

  /* ---------------- REGULATION SYNC ---------------- */

  const regulationSync =
    1 -
    Math.abs(
      A.axes.regulation.selfStabilization -
        B.axes.regulation.selfStabilization
    );

  /* ---------------- DEVOTION COUPLING ---------------- */

  const devotionCoupling =
    (A.axes.devotion.persistenceInAttachment +
      B.axes.devotion.persistenceInAttachment) /
    2;

  /* ---------------- TEMPORAL PHASE SYNC ---------------- */

  const aCloseness = A.trajectory.history.map(h => h.closenessPressure);
  const bCloseness = B.trajectory.history.map(h => h.closenessPressure);

  const temporalPhaseSync = phaseSync(aCloseness, bCloseness);

  /* ---------------- VECTOR ---------------- */

  const vector: ResonanceVector = {
    structureAlignment: clamp01(structureAlignment),
    permeabilityAlignment: clamp01(permeabilityAlignment),
    regulationSync: clamp01(regulationSync),
    devotionCoupling: clamp01(devotionCoupling),
    temporalPhaseSync: clamp01(temporalPhaseSync),
  };

  /* ---------------- COMPOSITE SCORES ---------------- */

  const stabilityIndex = clamp01(
    0.25 * vector.structureAlignment +
      0.2 * vector.regulationSync +
      0.2 * vector.permeabilityAlignment +
      0.2 * vector.temporalPhaseSync +
      0.15 * vector.devotionCoupling
  );

  const frictionIndex = clamp01(
    1 -
      (0.4 * vector.structureAlignment +
        0.3 * vector.regulationSync +
        0.3 * vector.permeabilityAlignment)
  );

  const oscillationMismatch = clamp01(
    Math.abs(
      aState.withdrawalDrive - bState.withdrawalDrive
    ) +
      Math.abs(
        aState.overattachmentDrive - bState.overattachmentDrive
      )
  );

  const driftConvergence = clamp01(
    temporalPhaseSync + stabilityIndex - oscillationMismatch
  );

  const resonanceScore = clamp01(
    0.5 * stabilityIndex +
      0.25 * driftConvergence +
      0.25 * (1 - frictionIndex)
  );

  /* ---------------- CLASSIFICATION ---------------- */

  let classification: ResonanceResult["classification"];

  if (resonanceScore > 0.75 && frictionIndex < 0.3) {
    classification = "harmonic_stability";
  } else if (frictionIndex > 0.6 && stabilityIndex > 0.5) {
    classification = "growth_friction";
  } else if (temporalPhaseSync < 0.4) {
    classification = "asynchronous_drift";
  } else if (oscillationMismatch > 0.6) {
    classification = "volatile_coupling";
  } else {
    classification = "low_interaction_field";
  }

  return {
    resonanceScore,
    stabilityIndex,
    frictionIndex,
    driftConvergence,
    oscillationMismatch,
    vector,
    classification,
  };
}