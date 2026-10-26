// idl-v0.1.ts

export type Norm = number; // 0..1

export interface IntimacySignature {
  attachmentStability: Norm;
  closenessTolerance: Norm;
  dependencyResponse: Norm;
  emotionalDisclosureRate: Norm;
  relationalConsistency: Norm;
  autonomyDrive: Norm;
}

export interface IntimacyAxes {
  structureChaos: {
    structure: Norm;
    chaos: Norm;
  };

  devotion: {
    persistenceInAttachment: Norm;
    repairTendency: Norm;
    relationalMemoryStrength: Norm;
  };

  permeability: {
    emotionalOpenness: Norm;
    vulnerabilitySpeed: Norm;
    boundaryFlexibility: Norm;
  };

  regulation: {
    emotionalRecoverySpeed: Norm;
    conflictDeescalation: Norm;
    selfStabilization: Norm;
  };
}

export interface IntimacyWaveState {
  timestamp: number;

  closenessPressure: Norm;   // external relational load
  conflictPressure: Norm;
  uncertaintyPressure: Norm;

  attachmentActivation: Norm; // computed state response
  withdrawalDrive: Norm;
  overattachmentDrive: Norm;
}

export interface IntimacyTrajectory {
  history: IntimacyWaveState[];
}

export interface IntimacySystem {
  signature: IntimacySignature;
  axes: IntimacyAxes;
  trajectory: IntimacyTrajectory;
}

/* ------------------------- NORMALIZATION ------------------------- */

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/* ------------------------- DERIVED AXES ------------------------- */

export function computeStructureChaos(a: IntimacyAxes["structureChaos"]) {
  const structure = clamp01(a.structure);
  const chaos = clamp01(a.chaos);

  // enforce balance constraint (optional system normalization)
  const sum = structure + chaos;
  return {
    structure: structure / (sum || 1),
    chaos: chaos / (sum || 1),
  };
}

export function computeDevotion(d: IntimacyAxes["devotion"]) {
  return clamp01(
    0.4 * d.persistenceInAttachment +
    0.35 * d.repairTendency +
    0.25 * d.relationalMemoryStrength
  );
}

export function computePermeability(p: IntimacyAxes["permeability"]) {
  return clamp01(
    0.4 * p.emotionalOpenness +
    0.3 * p.vulnerabilitySpeed +
    0.3 * p.boundaryFlexibility
  );
}

export function computeRegulation(r: IntimacyAxes["regulation"]) {
  return clamp01(
    0.4 * r.emotionalRecoverySpeed +
    0.3 * r.conflictDeescalation +
    0.3 * r.selfStabilization
  );
}

/* ------------------------- INTIMACY STATE UPDATE ------------------------- */

export function stepIntimacyState(
  prev: IntimacyWaveState,
  axes: IntimacyAxes
): IntimacyWaveState {
  const structure = computeStructureChaos(axes.structureChaos).structure;
  const chaos = computeStructureChaos(axes.structureChaos).chaos;
  const devotion = computeDevotion(axes.devotion);
  const permeability = computePermeability(axes.permeability);
  const regulation = computeRegulation(axes.regulation);

  const pressure =
    0.4 * prev.closenessPressure +
    0.3 * prev.conflictPressure +
    0.3 * prev.uncertaintyPressure;

  const attachmentActivation = clamp01(
    permeability * pressure + devotion * prev.closenessPressure
  );

  const withdrawalDrive = clamp01(
    (chaos * pressure) - regulation
  );

  const overattachmentDrive = clamp01(
    (attachmentActivation + permeability) - regulation
  );

  return {
    timestamp: Date.now(),
    closenessPressure: prev.closenessPressure,
    conflictPressure: prev.conflictPressure,
    uncertaintyPressure: prev.uncertaintyPressure,
    attachmentActivation,
    withdrawalDrive,
    overattachmentDrive,
  };
}

/* ------------------------- INTIMACY WAVE FUNCTION ------------------------- */

export function computeWave(system: IntimacySystem): IntimacyTrajectory {
  const out: IntimacyWaveState[] = [];

  let state: IntimacyWaveState = {
    timestamp: Date.now(),
    closenessPressure: system.signature.closenessTolerance,
    conflictPressure: 0.5,
    uncertaintyPressure: 0.5,
    attachmentActivation: 0,
    withdrawalDrive: 0,
    overattachmentDrive: 0,
  };

  for (let i = 0; i < system.trajectory.history.length; i++) {
    state = stepIntimacyState(state, system.axes);
    out.push(state);
  }

  return { history: out };
}

/* ------------------------- COUPLING BETWEEN TWO SYSTEMS ------------------------- */

export function computeCoupling(a: IntimacySystem, b: IntimacySystem) {
  const pa = computePermeability(a.axes.permeability);
  const pb = computePermeability(b.axes.permeability);

  const ra = computeRegulation(a.axes.regulation);
  const rb = computeRegulation(b.axes.regulation);

  const da = computeDevotion(a.axes.devotion);
  const db = computeDevotion(b.axes.devotion);

  const structureA = computeStructureChaos(a.axes.structureChaos).structure;
  const structureB = computeStructureChaos(b.axes.structureChaos).structure;

  const chaosA = computeStructureChaos(a.axes.structureChaos).chaos;
  const chaosB = computeStructureChaos(b.axes.structureChaos).chaos;

  const structureAlignment = 1 - Math.abs(structureA - structureB);
  const chaosFriction = Math.abs(chaosA - chaosB);

  const regulationSync = 1 - Math.abs(ra - rb);
  const permeabilityGap = 1 - Math.abs(pa - pb);

  const devotionCoupling = (da + db) / 2;

  const stabilityScore =
    0.25 * structureAlignment +
    0.25 * regulationSync +
    0.25 * permeabilityGap +
    0.25 * devotionCoupling;

  const frictionScore =
    0.5 * chaosFriction +
    0.5 * Math.abs(pa - pb);

  return {
    stabilityScore: clamp01(stabilityScore),
    frictionScore: clamp01(frictionScore),
    interpretation:
      stabilityScore > 0.7
        ? "high_stability_coupling"
        : frictionScore > 0.6
        ? "high_friction_growth_coupling"
        : "mixed_dynamics"
  };
}