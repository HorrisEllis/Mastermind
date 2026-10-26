/**
 * @module       @telemetry-codec/core
 * @uuid         tc000000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * Telemetry Codec — behavioral signal compression for distributed systems.
 *
 * Ported from Spatial codec-v2.js + latent-model + signal-topology + drift-engine.
 * Domain-agnostic temporal signal compression runtime instantiated on service metrics.
 *
 * QUICKSTART:
 *   import { TelemetryRuntime } from '@telemetry-codec/core';
 *
 *   const rt = new TelemetryRuntime({ serviceId: 'payments-api' });
 *   rt.on('frame', f => console.log(`health=${f.health}`, f.state));
 *   rt.on('incident', ev => pagerDuty.alert(ev));
 *   rt.on('precursor', ev => console.warn('drift cluster:', ev.signals));
 *
 *   setInterval(() => {
 *     rt.observe('cpu_util',   getCpu());
 *     rt.observe('p99',        getP99());
 *     rt.observe('error_rate', getErrorRate());
 *     rt.tick();
 *   }, 1000);
 *
 * COMPRESSION:
 *   Raw metrics: ~200KB/s/service (Prometheus scrape)
 *   ServiceFrame: ~320 bytes/s/service @ 1Hz
 *   Compression: ~625× on wire; ~1000× after stable-period suppression
 */

export { TelemetryRuntime }     from './runtime.js';
export { TelemetryAdapter }     from './adapter.js';
export { ServiceLatentModel }   from './latent-model.js';
export { ServiceTopology }      from './topology.js';
export { ServiceDriftEngine }   from './drift-engine.js';
export { TelemetryBus, createBus } from './bus.js';
export { SlopeEngine, StabilityEngine, OscillationEngine, ConfidencePropagator } from './engines.js';
export { DIM, DIM_NAMES }       from './latent-model.js';
export { SIGNAL }               from './drift-engine.js';
export { CONFIDENCE }           from './topology.js';
