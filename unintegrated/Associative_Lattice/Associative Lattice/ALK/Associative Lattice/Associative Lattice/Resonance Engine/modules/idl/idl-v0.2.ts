
// idl-v0.2.ts

import {
  IntimacySystem,
  IntimacyAxes,
  computeCoupling,
  computeDevotion,
  computePermeability,
  computeRegulation,
  computeStructureChaos,
} from "./idl-v0.1";

export type LearningRate = number; // 0..1

/* ------------------------- LEARNABLE AXES STATE ------------------------- */

export interface AdaptiveAxes extends IntimacyAxes {
  learningRates: {
    structureChaos: LearningRate;
    devotion: LearningRate;
    permeability: LearningRate;
    regulation: LearningRate;
  };
}

/* ------------------------- INTERACTION EVENT ------------------------- */

export interface InteractionEvent {
  timestamp: number;

  intimacyPressure: number; // how emotionally activating the interaction was
  conflict: number;         // disagreement intensity
  closeness: number;        // bonding intensity
  rupture: number;          // emotional break signal (0..1)
}

/* ------------------------- SAFE UPDATE ------------------------- */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function driftToward(
  current: number,
  target: number,
  lr: number
): number {
  return clamp01(current + (target - current) * lr);
}

/* ------------------------- AXIS UPDATE ENGINE ------------------------- */

export function updateAxesFromInteraction(
  axes: AdaptiveAxes,
  event: InteractionEvent,
  partnerSignal: Partial<IntimacyAxes>
): AdaptiveAxes {
  const structure = computeStructureChaos(axes.structureChaos);
  const devotion = computeDevotion(axes.devotion);
  const permeability = computePermeability(axes.permeability);
  const regulation = computeRegulation(axes.regulation);

  const intensity =
    event.intimacyPressure +
    event.closeness +
    event.conflict +
    event.rupture;

  const instability = event.conflict + event.rupture;

  /* ---------------- STRUCTURE ↔ CHAOS DRIFT ---------------- */

  const structureTarget =
    instability > 0.6
      ? structure.structure - 0.05 * intensity
      : structure.structure + 0.03 * event.closeness;

  const chaosTarget = 1 - structureTarget;

  axes.structureChaos.structure = driftToward(
    axes.structureChaos.structure,
    structureTarget,
    axes.learningRates.structureChaos
  );

  axes.structureChaos.chaos = driftToward(
    axes.structureChaos.chaos,
    chaosTarget,
    axes.learningRates.structureChaos
  );

  /* ---------------- DEVOTION DRIFT ---------------- */

  const devotionTarget =
    event.closeness > event.conflict
      ? devotion + 0.02 * event.closeness
      : devotion - 0.03 * event.rupture;

  axes.devotion.persistenceInAttachment = driftToward(
    axes.devotion.persistenceInAttachment,
    devotionTarget,
    axes.learningRates.devotion
  );

  axes.devotion.repairTendency = driftToward(
    axes.devotion.repairTendency,
    event.conflict > 0 ? 0.8 : axes.devotion.repairTendency,
    axes.learningRates.devotion
  );

  axes.devotion.relationalMemoryStrength = driftToward(
    axes.devotion.relationalMemoryStrength,
    event.closeness,
    axes.learningRates.devotion
  );

  /* ---------------- PERMEABILITY DRIFT ---------------- */

  const permeabilityTarget =
    event.closeness > 0.5
      ? permeability + 0.02 * event.closeness
      : permeability - 0.02 * event.rupture;

  axes.permeability.emotionalOpenness = driftToward(
    axes.permeability.emotionalOpenness,
    permeabilityTarget,
    axes.learningRates.permeability
  );

  axes.permeability.vulnerabilitySpeed = driftToward(
    axes.permeability.vulnerabilitySpeed,
    event.closeness,
    axes.learningRates.permeability
  );

  axes.permeability.boundaryFlexibility = driftToward(
    axes.permeability.boundaryFlexibility,
    1 - event.rupture,
    axes.learningRates.permeability
  );

  /* ---------------- REGULATION DRIFT ---------------- */

  const regulationTarget =
    instability > 0.5
      ? regulation - 0.02 * instability
      : regulation + 0.02 * event.closeness;

  axes.regulation.emotionalRecoverySpeed = driftToward(
    axes.regulation.emotionalRecoverySpeed,
    regulationTarget,
    axes.learningRates.regulation
  );

  axes.regulation.conflictDeescalation = driftToward(
    axes.regulation.conflictDeescalation,
    1 - event.conflict,
    axes.learningRates.regulation
  );

  axes.regulation.selfStabilization = driftToward(
    axes.regulation.selfStabilization,
    1 - event.intimacyPressure,
    axes.learningRates.regulation
  );

  return axes;
}

/* ------------------------- RELATIONAL MEMORY SYSTEM ------------------------- */

export interface InteractionMemory {
  events: InteractionEvent[];
  decayFactor: number; // 0..1
}

/* ------------------------- MEMORY WEIGHTED UPDATE ------------------------- */

export function applyMemoryDecay(memory: InteractionMemory): InteractionMemory {
  return {
    ...memory,
    events: memory.events.map(e => ({
      ...e,
      intimacyPressure: e.intimacyPressure * memory.decayFactor,
      conflict: e.conflict * memory.decayFactor,
      closeness: e.closeness * memory.decayFactor,
      rupture: e.rupture * memory.decayFactor,
    })),
  };
}

/* ------------------------- FULL ADAPTIVE SYSTEM STEP ------------------------- */

export function stepAdaptiveSystem(
  system: IntimacySystem,
  memory: InteractionMemory,
  latestEvent: InteractionEvent
): IntimacySystem {
  const updatedAxes = updateAxesFromInteraction(
    system.axes as AdaptiveAxes,
    latestEvent,
    {}
  );

  const updatedMemory: InteractionMemory = {
    events: [...memory.events, latestEvent].slice(-100),
    decayFactor: memory.decayFactor,
  };

  return {
    ...system,
    axes: updatedAxes,
    trajectory: {
      history: system.trajectory.history,
    },
  };
}

/* ------------------------- EMERGENT RELATIONSHIP FIELD ------------------------- */

export function computeRelationshipField(
  systems: IntimacySystem[]
) {
  const field: Record<string, Record<string, number>> = {};

  for (let i = 0; i < systems.length; i++) {
    field[i] = {};
    for (let j = 0; j < systems.length; j++) {
      if (i === j) continue;

      const coupling = computeCoupling(systems[i], systems[j]);

      field[i][j] =
        0.7 * coupling.stabilityScore -
        0.3 * coupling.frictionScore;
    }
  }

  return field;
}