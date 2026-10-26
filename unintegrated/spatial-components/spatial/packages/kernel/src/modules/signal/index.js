/**
 * @spatial/kernel/signal
 * Signal processing layer — latent state estimation, suppression scoring,
 * cross-stream topology, sub-threshold drift detection.
 */
export { DriftEngine, SIGNAL, CONFIDENCE as DRIFT_CONFIDENCE, DRIFT_UUID, DRIFT_VERSION } from './drift-engine.js';
export { SignalTopologyModule, SIGTOP_UUID, SIGTOP_VERSION, COMPOSITES } from './signal-topology.js';
export { LatentModel, DIM, LATENT_UUID, LATENT_VERSION, OBS_MODELS } from './latent-model.js';
export { SuppressionScoreModule, SUPP_UUID, SUPP_VERSION } from './suppression-score.js';
