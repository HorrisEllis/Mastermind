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
