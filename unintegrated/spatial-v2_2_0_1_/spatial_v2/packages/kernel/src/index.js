/**
 * @spatial/kernel — v2.0.0
 * ALK behavioral signal runtime. Cross-species.
 * Source: CrystalBall/ALK — Jonathan Bailey
 *
 * Runs headless. All I/O via @spatial/bus.
 * This index re-exports the public surface.
 * Internal modules (video, expression, codec-v2 etc.)
 * are accessed via named exports path e.g. @spatial/kernel/video
 */
export { HUMAN_PROFILE, EQUINE_PROFILE, CANINE_PROFILE, SPECIES_REGISTRY, getProfile, registerProfile } from './species/index.js';

export const KERNEL_VERSION = '2.0.0';

// Latent vector axis indices — canonical reference
export const AXIS = Object.freeze({
  VALENCE:     0,
  AROUSAL:     1,
  SUPPRESSION: 2,
  COHERENCE:   3,
  ENGAGEMENT:  4,
});

// §CS1 — species-agnostic axis labels
export const AXIS_LABELS = Object.freeze(['valence','arousal','suppression','coherence','engagement']);

// Signal layer — drift engine (sub-threshold behavioral detection)
export { DriftEngine, SIGNAL, CONFIDENCE, DRIFT_UUID, DRIFT_VERSION } from './modules/signal/drift-engine.js';

// Framework analysis modules (bus-only I/O, §5.7)
export { GapHunterModule, GAPHUNTER_UUID, GAPHUNTER_VERSION,
         WeakAssumptionHunter, ShadowFieldDetector, ContrastiveGapDetector,
         NegativeSpaceDetector, StructuralAssumptionAuditor, ReversalDetector } from './modules/gap-hunter.js';
export { RelationalModule, RELATIONAL_UUID, RELATIONAL_VERSION,
         MeaningTracker, RelationalDecayDetector, RuptureDetector, RepairEngine,
         BidDetector, REL_TRAJECTORY, RUPTURE_TYPE, REPAIR_TYPE } from './modules/relational.js';
export { FrameworkModel, FRAMEWORK_TYPES, SIGMA as FRAMEWORK_SIGMA } from './modules/framework-model.js';
export { SpeechStateModule, SPEECH_MODES, INTEGRATION_LEVELS } from './modules/speech-state-module.js';

// CFR particle field kernel (physics + render + rewind, browser + Node)
export * from './modules/cfr-kernel/index.js';
