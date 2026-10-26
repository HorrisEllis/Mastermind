/**
 * @spatial/kernel/video
 * Video pipeline. MediaPipe face/pose/hands. Codec engines.
 * Browser-only (requires getUserMedia / canvas).
 */
export { VideoModule } from './video-module.js';
// codec.js and codec-topology.js are browser globals (no ESM exports by design)
// codec-v2.js exports the Phase 2 engines
export { SlopeEngine, StabilityEngine, OscillationEngine, PitchEngine,
         ConfidencePropagator, NexusRuntime } from './codec-v2.js';
