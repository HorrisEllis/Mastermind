/**
 * @module       drift-engine
 * @uuid         dr1f0000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * ServiceDriftEngine — sub-threshold precursor signal detection.
 * Ported from Spatial drift-engine.js (a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d).
 *
 * THE SEVEN DRIFT SIGNALS → TELEMETRY ANALOG:
 *
 *   1. PACING_SHIFT         → REQUEST_TEMPO_SHIFT
 *      Tiny changes in request rate vs baseline before load spike.
 *
 *   2. MICRO_HESITATION     → LATENCY_MICRO_SPIKE
 *      Sub-threshold p99 bumps too brief to alert, too regular to be noise.
 *      The place the service slowed and recovered. Precedes sustained degradation.
 *
 *   3. EMOTIONAL_INCONGRUENCE → METRIC_INCONGRUENCE
 *      Cross-channel delta. CPU says one thing. Latency says another.
 *      Body stays still = throughput unchanged while other signals shift.
 *
 *   4. BEHAVIORAL_DRIFT     → BASELINE_DRIFT
 *      Running delta from established service baseline.
 *      Not a single event. A slow rotation away from normal operating state.
 *
 *   5. ENERGY_CHANGE        → LOAD_TRAJECTORY
 *      Arousal slope → load slope. Rate of change matters more than absolute level.
 *      Rising load at 2% per minute behaves differently from a step function.
 *
 *   6. RHYTHM_DISRUPTION    → CADENCE_DISRUPTION
 *      Everyone (every service) has a rhythm. Disruption = deviation from
 *      that service's personal baseline cadence.
 *
 *   7. PREDICTIVE_MISMATCH  → TRAJECTORY_MISMATCH
 *      Actual state vs predicted state from trajectory model.
 *      When the model expected recovery and the service went sideways instead.
 *
 * ARCHITECTURE:
 *   Phase 1 — CALIBRATION (first CALIBRATION_WINDOW steps): build baseline. No signals emitted.
 *   Phase 2 — ACTIVE DETECTION: compute deviation from baseline per channel.
 *   Phase 3 — COMPOSITE SCORING: 3+ co-occurring → DriftCluster event.
 *
 * ALL OUTPUT IS PROBABILISTIC. Consumers must treat it as such.
 * "BASELINE_DRIFT=0.7" ≠ "this service is about to fail."
 */

'use strict';

export const DRIFT_UUID    = 'dr1f0000-0000-4000-9000-000000000001';
export const DRIFT_VERSION = '1.0.0';

export const SIGNAL = Object.freeze({
  REQUEST_TEMPO_SHIFT:  'REQUEST_TEMPO_SHIFT',
  LATENCY_MICRO_SPIKE:  'LATENCY_MICRO_SPIKE',
  METRIC_INCONGRUENCE:  'METRIC_INCONGRUENCE',
  BASELINE_DRIFT:       'BASELINE_DRIFT',
  LOAD_TRAJECTORY:      'LOAD_TRAJECTORY',
  CADENCE_DISRUPTION:   'CADENCE_DISRUPTION',
  TRAJECTORY_MISMATCH:  'TRAJECTORY_MISMATCH',
});

const CALIBRATION_WINDOW = 60;   // steps before detection begins
const DRIFT_CLUSTER_MIN  = 3;    // minimum co-occurring signals for cluster event
const HISTORY_LEN        = 120;  // rolling history for baseline

function createServiceState() {
  return {
    calibrated:       false,
    calibrationCount: 0,
    baseline: {
      requestRateMean:  0,
      requestRateStd:   0.1,
      p99Mean:          0,
      p99Std:           0.1,
      loadMean:         0,
      loadStd:          0.1,
      latentMean:       new Float64Array(5),
      latentStd:        Float64Array.from([0.15, 0.15, 0.15, 0.15, 0.15]),
      cadencePeriod:    null,
    },
    history: {
      requestRate: [],
      p99:         [],
      load:        [],
      latent:      [],
    },
    prevLatent:        null,
    prevPrediction:    null,
    activeSignals:     new Map(), // signal → { confidence, ts }
    driftMagnitude:    0,
  };
}

export class ServiceDriftEngine {
  constructor({ bus, serviceIds = [] } = {}) {
    if (!bus) throw new Error('[ServiceDriftEngine] bus required');
    this._bus      = bus;
    this._services = new Map();
    this._frame    = 0;
    for (const id of serviceIds) this._services.set(id, createServiceState());
    this._attach();
  }

  _attach() {
    const b = this._bus;
    b.on('tc.latent.update', ev => {
      const { serviceId, state } = ev;
      if (!serviceId || !state) return;
      if (!this._services.has(serviceId)) this._services.set(serviceId, createServiceState());
      this._onLatentUpdate(serviceId, state);
    });
    b.on('tc.metric.raw', ev => {
      const { serviceId, metric, value } = ev;
      if (!serviceId) return;
      if (!this._services.has(serviceId)) this._services.set(serviceId, createServiceState());
      this._onMetric(serviceId, metric, value);
    });
    b.on('tc.service.start', ev => {
      if (ev.serviceId) this._services.set(ev.serviceId, createServiceState());
    });
  }

  _onLatentUpdate(serviceId, state) {
    const svc  = this._services.get(serviceId);
    const vec  = [state.momentum, state.load, state.debt, state.coherence, state.capacity];
    svc.history.latent.push([...vec]);
    if (svc.history.latent.length > HISTORY_LEN) svc.history.latent.shift();

    // Phase 1: calibration
    if (!svc.calibrated) {
      svc.calibrationCount++;
      if (svc.calibrationCount >= CALIBRATION_WINDOW) {
        this._buildBaseline(serviceId);
        svc.calibrated = true;
        this._bus.emit('tc.drift.calibrated', { serviceId, ts: Date.now() });
      }
      return;
    }

    // Phase 2: detect
    const signals = this._detectSignals(serviceId, vec);
    svc.prevLatent = vec;

    // Phase 3: cluster
    const active = signals.filter(s => s.confidence > 0.35);
    for (const s of active) svc.activeSignals.set(s.type, { confidence: s.confidence, ts: Date.now() });
    // Expire old signals (>10s)
    for (const [k, v] of svc.activeSignals) { if (Date.now() - v.ts > 10000) svc.activeSignals.delete(k); }

    for (const sig of active) {
      this._bus.emit('tc.drift.signal', { serviceId, signal: sig.type, confidence: r4(sig.confidence), evidence: sig.evidence, ts: Date.now() });
    }

    if (svc.activeSignals.size >= DRIFT_CLUSTER_MIN) {
      this._bus.emit('tc.drift.cluster', {
        serviceId,
        signals:    Array.from(svc.activeSignals.entries()).map(([k, v]) => ({ type: k, confidence: r4(v.confidence) })),
        count:      svc.activeSignals.size,
        magnitude:  r4(svc.driftMagnitude),
        ts:         Date.now(),
      });
    }
  }

  _onMetric(serviceId, metric, value) {
    const svc = this._services.get(serviceId);
    if (metric === 'request_rate') {
      svc.history.requestRate.push(value);
      if (svc.history.requestRate.length > HISTORY_LEN) svc.history.requestRate.shift();
    }
    if (metric === 'p99') {
      svc.history.p99.push(value);
      if (svc.history.p99.length > HISTORY_LEN) svc.history.p99.shift();
    }
    if (metric === 'cpu_util') {
      svc.history.load.push(value);
      if (svc.history.load.length > HISTORY_LEN) svc.history.load.shift();
    }
  }

  _buildBaseline(serviceId) {
    const svc = this._services.get(serviceId);
    const b   = svc.baseline;
    if (svc.history.requestRate.length > 5) { b.requestRateMean = mean(svc.history.requestRate); b.requestRateStd = std(svc.history.requestRate) || 0.1; }
    if (svc.history.p99.length > 5)         { b.p99Mean = mean(svc.history.p99); b.p99Std = std(svc.history.p99) || 0.1; }
    if (svc.history.load.length > 5)        { b.loadMean = mean(svc.history.load); b.loadStd = std(svc.history.load) || 0.1; }
    if (svc.history.latent.length > 10) {
      for (let d = 0; d < 5; d++) {
        const vals = svc.history.latent.map(v => v[d]);
        b.latentMean[d] = mean(vals);
        b.latentStd[d]  = std(vals) || 0.15;
      }
    }
  }

  _detectSignals(serviceId, vec) {
    const svc = this._services.get(serviceId);
    const b   = svc.baseline;
    const signals = [];

    // 1. REQUEST_TEMPO_SHIFT — request rate deviating from baseline
    if (svc.history.requestRate.length > 10) {
      const recent = mean(svc.history.requestRate.slice(-5));
      const z = Math.abs(recent - b.requestRateMean) / b.requestRateStd;
      if (z > 1.5 && z < 4.0) signals.push({ type: SIGNAL.REQUEST_TEMPO_SHIFT, confidence: Math.min(1, z / 4), evidence: { z: r4(z) } });
    }

    // 2. LATENCY_MICRO_SPIKE — sub-threshold p99 variance
    if (svc.history.p99.length > 10) {
      const recentStd = std(svc.history.p99.slice(-8));
      const baselineStd = b.p99Std;
      const ratio = recentStd / (baselineStd || 0.1);
      if (ratio > 1.8 && ratio < 5.0) signals.push({ type: SIGNAL.LATENCY_MICRO_SPIKE, confidence: Math.min(1, (ratio - 1.8) / 3.2), evidence: { ratio: r4(ratio) } });
    }

    // 3. METRIC_INCONGRUENCE — cpu low but p99 high (or vice versa)
    if (svc.history.load.length > 3 && svc.history.p99.length > 3) {
      const recentLoad = mean(svc.history.load.slice(-5));
      const recentP99  = mean(svc.history.p99.slice(-5));
      const loadZ = (recentLoad - b.loadMean) / b.loadStd;
      const p99Z  = (recentP99  - b.p99Mean)  / b.p99Std;
      const incongruence = Math.abs(loadZ - p99Z) / 2;
      if (incongruence > 1.2) signals.push({ type: SIGNAL.METRIC_INCONGRUENCE, confidence: Math.min(1, incongruence / 3), evidence: { loadZ: r4(loadZ), p99Z: r4(p99Z) } });
    }

    // 4. BASELINE_DRIFT — cumulative distance from latent baseline
    let totalDrift = 0;
    for (let d = 0; d < 5; d++) {
      const z = Math.abs(vec[d] - b.latentMean[d]) / (b.latentStd[d] || 0.15);
      totalDrift += z;
    }
    const driftScore = totalDrift / 5;
    svc.driftMagnitude = driftScore;
    if (driftScore > 1.0) signals.push({ type: SIGNAL.BASELINE_DRIFT, confidence: Math.min(1, driftScore / 3), evidence: { magnitude: r4(driftScore) } });

    // 5. LOAD_TRAJECTORY — rate of load change (rising faster than baseline variance)
    if (svc.history.load.length > 8) {
      const recentSlope = (svc.history.load.slice(-1)[0] - svc.history.load.slice(-8)[0]) / 8;
      if (Math.abs(recentSlope) > b.loadStd * 0.5) signals.push({ type: SIGNAL.LOAD_TRAJECTORY, confidence: Math.min(1, Math.abs(recentSlope) / (b.loadStd * 2)), evidence: { slope: r4(recentSlope) } });
    }

    // 6. CADENCE_DISRUPTION — std of recent request rate vs baseline std
    if (svc.history.requestRate.length > 10) {
      const recentStd  = std(svc.history.requestRate.slice(-10));
      const ratio      = recentStd / (b.requestRateStd || 0.1);
      if (ratio > 2.0) signals.push({ type: SIGNAL.CADENCE_DISRUPTION, confidence: Math.min(1, (ratio - 2.0) / 3), evidence: { stdRatio: r4(ratio) } });
    }

    // 7. TRAJECTORY_MISMATCH — actual latent vs extrapolated prediction
    if (svc.prevLatent && svc.prevPrediction) {
      let mismatch = 0;
      for (let d = 0; d < 5; d++) {
        mismatch += Math.abs(vec[d] - svc.prevPrediction[d]);
      }
      mismatch /= 5;
      if (mismatch > 0.08) signals.push({ type: SIGNAL.TRAJECTORY_MISMATCH, confidence: Math.min(1, mismatch / 0.25), evidence: { mismatch: r4(mismatch) } });
    }
    // Simple linear prediction: extrapolate from prev
    if (svc.prevLatent) svc.prevPrediction = vec.map((v, i) => v + (v - svc.prevLatent[i]));

    return signals;
  }

  health() {
    return { uuid: DRIFT_UUID, version: DRIFT_VERSION, services: this._services.size, frame: this._frame };
  }
}

function mean(a)  { return a.reduce((s, v) => s + v, 0) / a.length; }
function std(a)   { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); }
function r4(v)    { return Math.round((v ?? 0) * 10000) / 10000; }
