/**
 * @module       adapter
 * @uuid         ad4p0000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * TelemetryAdapter — the ingestion layer.
 *
 * This is the only place that knows about metric names and units.
 * Everything upstream is domain-agnostic codec.
 *
 * WHAT IT DOES:
 *   1. Accepts raw metric observations (push or pull)
 *   2. Normalizes to [0,1] per metric type
 *   3. Runs SlopeEngine + StabilityEngine + OscillationEngine per metric
 *   4. Emits normalized tc.metric.* events onto the bus
 *   5. Measures cross-metric coherence and emits tc.coherence.update
 *
 * USAGE:
 *   const adapter = new TelemetryAdapter({ bus, serviceId });
 *   adapter.observe('cpu_util',   0.72);   // push a raw value
 *   adapter.observe('p99',        245);     // ms — adapter normalizes
 *   adapter.observe('error_rate', 0.003);
 *   adapter.tick();                          // call once per interval (1Hz recommended)
 *
 * METRIC REGISTRY:
 *   Metrics are auto-registered on first observe(). You can pre-configure
 *   normalizers via adapter.registerMetric(name, { normalize, unit }).
 *
 * BUILT-IN NORMALIZERS:
 *   cpu_util             [0,1]   pass-through
 *   memory_pressure      [0,1]   pass-through
 *   p99                  ms      / p99_max_ms (default 5000)
 *   p50                  ms      / p50_max_ms (default 1000)
 *   error_rate           [0,1]   pass-through, clamped
 *   retry_rate           [0,1]   pass-through, clamped
 *   request_rate         rps     / request_rate_max (default 10000)
 *   queue_depth          count   / queue_depth_max (default 1000)
 *   throughput_normalized [0,1]  pass-through
 *   thread_saturation    [0,1]   pass-through
 *   connection_headroom  [0,1]   pass-through
 *   backpressure         [0,1]   pass-through
 */

'use strict';

import { SlopeEngine, StabilityEngine, OscillationEngine } from './engines.js';

export const ADAPTER_UUID    = 'ad4p0000-0000-4000-9000-000000000001';
export const ADAPTER_VERSION = '1.0.0';

const BUILTIN_NORMALIZERS = {
  cpu_util:              { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  memory_pressure:       { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  error_rate:            { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  retry_rate:            { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  backpressure:          { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  connection_headroom:   { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  thread_saturation:     { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  throughput_normalized: { normalize: v => clamp(v, 0, 1),       unit: 'ratio' },
  p99:                   { normalize: v => clamp(v / 5000, 0, 1), unit: 'ms' },
  p50:                   { normalize: v => clamp(v / 1000, 0, 1), unit: 'ms' },
  p95:                   { normalize: v => clamp(v / 3000, 0, 1), unit: 'ms' },
  request_rate:          { normalize: v => clamp(v / 10000, 0, 1), unit: 'rps' },
  queue_depth:           { normalize: v => clamp(v / 1000, 0, 1),  unit: 'count' },
};

function createMetricState(normalizer) {
  return {
    normalizer,
    slope:      new SlopeEngine(8),
    stability:  new StabilityEngine(20),
    oscillation: new OscillationEngine(60),
    lastRaw:    null,
    lastNorm:   null,
    history:    [],
  };
}

export class TelemetryAdapter {
  /**
   * @param {object} opts
   * @param {object} opts.bus
   * @param {string} opts.serviceId
   * @param {object} [opts.metricConfig]  — override normalizer params, e.g. { p99: { maxMs: 10000 } }
   */
  constructor({ bus, serviceId, metricConfig = {} } = {}) {
    if (!bus)       throw new Error('[TelemetryAdapter] bus required');
    if (!serviceId) throw new Error('[TelemetryAdapter] serviceId required');
    this._bus       = bus;
    this._serviceId = serviceId;
    this._metrics   = new Map();
    this._pending   = new Map(); // metric → latest raw value this tick
    this._tick      = 0;

    // Apply any custom normalizer config
    this._metricConfig = metricConfig;

    this.stats = { ticks: 0, observations: 0, metricsTracked: 0 };
  }

  // Register a metric with a custom normalizer function
  registerMetric(name, { normalize, unit = 'unknown' } = {}) {
    if (!normalize) throw new Error(`[TelemetryAdapter] normalizer required for metric "${name}"`);
    this._metrics.set(name, createMetricState({ normalize, unit }));
    this.stats.metricsTracked++;
  }

  // Push a raw observation. Call as many times per tick as needed; tick() flushes.
  observe(metric, rawValue) {
    if (!this._metrics.has(metric)) {
      const builtin = BUILTIN_NORMALIZERS[metric];
      if (builtin) {
        this._metrics.set(metric, createMetricState(builtin));
        this.stats.metricsTracked++;
      } else {
        // Auto-register as pass-through ratio [0,1]
        this._metrics.set(metric, createMetricState({ normalize: v => clamp(v, 0, 1), unit: 'unknown' }));
        this.stats.metricsTracked++;
      }
    }
    this._pending.set(metric, rawValue);
    this.stats.observations++;
  }

  // Call once per tick. Flushes pending observations through engines.
  tick() {
    this._tick++;
    this.stats.ticks++;

    const normValues = {};

    for (const [metric, rawValue] of this._pending) {
      const state = this._metrics.get(metric);
      const norm  = state.normalizer.normalize(rawValue);

      state.lastRaw  = rawValue;
      state.lastNorm = norm;
      state.history.push(norm);
      if (state.history.length > 120) state.history.shift();

      const slopeResult = state.slope.feed(norm);
      const stabResult  = state.stability.feed(norm);
      const oscResult   = state.oscillation.feed(norm);

      normValues[metric] = norm;

      // Emit raw (normalized)
      this._bus.emit('tc.metric.raw', { serviceId: this._serviceId, metric, value: norm, raw: rawValue, ts: Date.now() });

      // Emit slope if direction is not flat OR regime changed
      if (slopeResult.direction !== 'flat' || slopeResult.regimeChange) {
        this._bus.emit('tc.metric.slope', { serviceId: this._serviceId, metric, result: slopeResult, ts: Date.now() });
      }

      // Emit stability if regime changed
      if (stabResult.regimeChange) {
        this._bus.emit('tc.metric.stability', { serviceId: this._serviceId, metric, result: stabResult, ts: Date.now() });
      }

      // Emit oscillation if oscillating (or just changed oscillation state)
      if (oscResult.oscillating) {
        this._bus.emit('tc.metric.oscillation', { serviceId: this._serviceId, metric, result: oscResult, ts: Date.now() });
      }
    }

    // Cross-metric coherence check
    if (Object.keys(normValues).length >= 2) this._checkCoherence(normValues);

    this._pending.clear();
  }

  _checkCoherence(normValues) {
    // Coherence: do metrics that should correlate actually correlate?
    // Incongruence signal: cpu is low but p99 is high (or error_rate is high but retry_rate is low)
    const cpu  = normValues['cpu_util']    ?? null;
    const p99  = normValues['p99']         ?? null;
    const err  = normValues['error_rate']  ?? null;
    const rtr  = normValues['retry_rate']  ?? null;
    const qd   = normValues['queue_depth'] ?? null;
    const tp   = normValues['throughput_normalized'] ?? null;

    let dissonance = 0, magnitude = 0;

    // cpu low + p99 high = incongruence (e.g. IO-bound, external dependency)
    if (cpu !== null && p99 !== null) {
      const delta = Math.abs((p99 - 0.5) - (cpu - 0.5));
      if (delta > 0.3) { dissonance++; magnitude = Math.max(magnitude, delta); }
    }

    // error_rate high + throughput normal = silent failure pattern
    if (err !== null && tp !== null) {
      if (err > 0.05 && tp > 0.3) { dissonance++; magnitude = Math.max(magnitude, err); }
    }

    // queue_depth rising + throughput flat = queue buildup pattern
    if (qd !== null && tp !== null) {
      if (qd > 0.5 && tp > 0.2 && tp < 0.7) { dissonance++; magnitude = Math.max(magnitude, qd * 0.7); }
    }

    if (dissonance >= 1) {
      this._bus.emit('tc.coherence.update', {
        serviceId: this._serviceId,
        dissonant: true,
        dissonanceCount: dissonance,
        magnitude: r4(Math.min(1, magnitude)),
        ts: Date.now(),
      });
    } else if (Object.keys(normValues).length >= 3) {
      this._bus.emit('tc.coherence.update', {
        serviceId: this._serviceId,
        dissonant: false,
        magnitude: 0.6,
        ts: Date.now(),
      });
    }
  }

  // Snapshot of current state for all tracked metrics
  snapshot() {
    const out = {};
    for (const [name, state] of this._metrics) {
      out[name] = { raw: state.lastRaw, normalized: r4(state.lastNorm ?? 0) };
    }
    return { serviceId: this._serviceId, tick: this._tick, metrics: out };
  }

  health() {
    return { uuid: ADAPTER_UUID, version: ADAPTER_VERSION, serviceId: this._serviceId, stats: { ...this.stats } };
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function r4(v)            { return Math.round((v ?? 0) * 10000) / 10000; }
