# telemetry-codec

Behavioral signal compression runtime for distributed system observability.

Ported from the Spatial codec stack (codec-v2.js, latent-model.js, signal-topology.js, drift-engine.js). Domain-agnostic temporal signal compression instantiated on service metrics.

## What it does

Instead of streaming ~200KB/s of raw Prometheus metrics per service, `TelemetryRuntime` emits one ~320-byte `ServiceFrame` per second containing a **5D Kalman posterior** over service health state — plus topology composites and drift precursors.

**~625× compression on wire. ~1000× after stable-period suppression.**

## ServiceFrame schema

```js
{
  serviceId:   'payments-api',
  frame:       42,
  ts:          1716400000000,
  health:      0.73,          // [0,1] composite health score

  state: {
    momentum:  0.12,   // [-1,+1] trending healthy vs degrading
    load:      0.68,   // [0,1]   how hard is it working?
    debt:      0.21,   // [0,1]   hidden instability accumulating?
    coherence: 0.84,   // [0,1]   are all metrics telling the same story?
    capacity:  0.31,   // [-1,+1] can take more (+1) or shedding load (-1)
  },

  topology: {
    dominant: 'HIGH_LOAD',
    active: { HIGH_LOAD: { score: 0.71, confidence: 'HIGH' } }
  },

  drift: {
    signals:   [{ signal: 'LOAD_TRAJECTORY', confidence: 0.62 }],
    cluster:   false,   // true when 3+ drift signals co-occur (precursor cluster)
    magnitude: 0.34,
  },
}
```

## Quickstart

```js
import { TelemetryRuntime } from '@telemetry-codec/core';

const rt = new TelemetryRuntime({ serviceId: 'payments-api' });

// Subscribe to events
rt.on('frame',     frame  => store(frame));
rt.on('incident',  ev     => pagerDuty.trigger(ev));
rt.on('precursor', ev     => console.warn('drift cluster forming:', ev.signals));
rt.on('shift',     ev     => console.log('state shift:', ev.shifts));

// Feed metrics and tick once per second
setInterval(() => {
  rt.observe('cpu_util',              getCpu());        // [0,1]
  rt.observe('p99',                   getP99());        // ms
  rt.observe('error_rate',            getErrorRate());  // [0,1]
  rt.observe('queue_depth',           getQueueDepth()); // count
  rt.observe('throughput_normalized', getThroughput()); // [0,1]
  rt.tick();
}, 1000);
```

## Topology composites

| Composite | Signal | Original behavioral analog |
|---|---|---|
| `HIGH_LOAD` | cpu + queue + p99 rising | STRESS_ACUTE |
| `DEGRADED` | errors rising + throughput plateau | SOCIAL_MASK |
| `SILENT_FAILURE` | error volatility + throughput normal | CONCEALMENT |
| `HEALTHY_SCALING` | throughput rising + p99 stable | GENUINE_ENGAGEMENT |
| `GC_PAUSE` | memory spike + throughput drop | COGNITIVE_LOAD |
| `QUEUE_BUILDUP` | queue depth + throughput flat | APPROACH |
| `BACKPRESSURE` | throughput falling + retry rising | WITHDRAWAL |
| `CASCADE_RISK` | upstream degraded + local errors | CONTEMPT_LEAK |
| `CIRCUIT_OPEN` | throughput near zero | FREEZE |
| `COHERENCE_BREAK` | metrics contradict each other | DISSONANCE |

## Drift signals (precursors)

The `ServiceDriftEngine` detects sub-threshold precursors 30–60 seconds before topology composites fire:

| Signal | Detects |
|---|---|
| `REQUEST_TEMPO_SHIFT` | Request rate deviating from baseline before load spike |
| `LATENCY_MICRO_SPIKE` | Sub-threshold p99 variance spikes |
| `METRIC_INCONGRUENCE` | CPU low but p99 high (external dependency issue) |
| `BASELINE_DRIFT` | Cumulative state distance from established baseline |
| `LOAD_TRAJECTORY` | Rate-of-change of load (ramp vs step detection) |
| `CADENCE_DISRUPTION` | Request cadence rhythm breakdown |
| `TRAJECTORY_MISMATCH` | Actual state vs trajectory model prediction |

## Architecture

```
TelemetryAdapter          ← normalizes raw metrics, runs Slope/Stability/Osc engines
    ↓ tc.metric.*
ServiceTopology           ← detects composite states from signal co-occurrence
    ↓ tc.topology.composite
ServiceLatentModel        ← Kalman fusion → 5D health posterior
    ↓ tc.latent.update
ServiceDriftEngine        ← sub-threshold precursor detection
    ↓ tc.drift.signal / tc.drift.cluster
TelemetryRuntime          ← assembles ServiceFrame, emits events
```

All components communicate over a `TelemetryBus` (SISO-compatible). Provide your own bus to share it across multiple runtimes.

## Primitive origins (Spatial codec)

| Engine | Original | What it measures |
|---|---|---|
| `SlopeEngine` | codec-v2.js | OLS regression: WHERE signal is going |
| `StabilityEngine` | codec-v2.js | CV + entropy: IS signal settling |
| `OscillationEngine` | codec-v2.js | Peak/period: IS signal rhythmic |
| `ConfidencePropagator` | codec-v2.js | Cross-signal Bayesian amplification |
| `ServiceLatentModel` | latent-model.js | Kalman fusion into 5D posterior |
| `ServiceTopology` | signal-topology.js | Composite state detection |
| `ServiceDriftEngine` | drift-engine.js | 7-signal precursor detection |

## Tests

```bash
npm test
```

25 tests, 0 failures.
