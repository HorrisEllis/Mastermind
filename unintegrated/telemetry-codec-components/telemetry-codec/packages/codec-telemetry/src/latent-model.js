/**
 * @module       latent-model
 * @uuid         la7e0000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * Service Health Latent Model — Kalman fusion of telemetry streams
 * into a 5D posterior over service state.
 * Ported from Spatial latent-model.js (d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80).
 *
 * DIMENSION MAP:
 *   VALENCE     → MOMENTUM  [-1,+1]  healthy trend vs degrading
 *   AROUSAL     → LOAD      [0,1]    how hard is the service working?
 *   SUPPRESSION → DEBT      [0,1]    hidden instability accumulating?
 *   COHERENCE   → COHERENCE [0,1]    are all signals telling the same story?
 *   ENGAGEMENT  → CAPACITY  [-1,+1]  can it take more load (+1) or shedding (-1)?
 */

'use strict';

export const LATENT_UUID    = 'la7e0000-0000-4000-9000-000000000001';
export const LATENT_VERSION = '1.0.0';

export const DIM = Object.freeze({ MOMENTUM:0, LOAD:1, DEBT:2, COHERENCE:3, CAPACITY:4 });
export const DIM_NAMES = ['MOMENTUM','LOAD','DEBT','COHERENCE','CAPACITY'];
const N_DIM = 5;
const Q     = [0.008, 0.012, 0.005, 0.006, 0.010];
const P_INIT = [0.5, 0.5, 0.5, 0.5, 0.5];
const STATE_INTERVAL  = 15;
const SHIFT_THRESHOLD = 0.12;

const OBS_MODELS = {
  'slope.throughput.rising':          { dims:[{idx:DIM.MOMENTUM,w:0.7,s:+1}], R:0.25 },
  'slope.throughput.falling':         { dims:[{idx:DIM.MOMENTUM,w:0.6,s:-1}], R:0.25 },
  'slope.error_rate.rising':          { dims:[{idx:DIM.MOMENTUM,w:0.8,s:-1},{idx:DIM.DEBT,w:0.5,s:+1}], R:0.20 },
  'slope.error_rate.falling':         { dims:[{idx:DIM.MOMENTUM,w:0.5,s:+1}], R:0.20 },
  'slope.p99.rising':                 { dims:[{idx:DIM.MOMENTUM,w:0.6,s:-1},{idx:DIM.LOAD,w:0.4,s:+1}], R:0.25 },
  'slope.p99.falling':                { dims:[{idx:DIM.MOMENTUM,w:0.4,s:+1}], R:0.25 },
  'metric.cpu_util':                  { dims:[{idx:DIM.LOAD,w:1.0,s:+1}], R:0.15 },
  'metric.memory_pressure':           { dims:[{idx:DIM.LOAD,w:0.8,s:+1}], R:0.20 },
  'metric.queue_depth':               { dims:[{idx:DIM.LOAD,w:0.7,s:+1},{idx:DIM.DEBT,w:0.3,s:+1}], R:0.20 },
  'metric.thread_saturation':         { dims:[{idx:DIM.LOAD,w:0.9,s:+1}], R:0.20 },
  'stability.volatile':               { dims:[{idx:DIM.DEBT,w:0.8,s:+1},{idx:DIM.COHERENCE,w:0.4,s:-1}], R:0.20 },
  'stability.collapsed':              { dims:[{idx:DIM.DEBT,w:0.6,s:+1}], R:0.25 },
  'metric.retry_rate':                { dims:[{idx:DIM.DEBT,w:0.7,s:+1}], R:0.30 },
  'osc.error_rate':                   { dims:[{idx:DIM.DEBT,w:0.9,s:+1}], R:0.25 },
  'coherence.dissonance':             { dims:[{idx:DIM.COHERENCE,w:0.9,s:-1}], R:0.20 },
  'coherence.congruent':              { dims:[{idx:DIM.COHERENCE,w:0.7,s:+1}], R:0.20 },
  'topology.SILENT_FAILURE':          { dims:[{idx:DIM.DEBT,w:0.8,s:+1},{idx:DIM.COHERENCE,w:0.7,s:-1}], R:0.15 },
  'topology.HIGH_LOAD':               { dims:[{idx:DIM.LOAD,w:0.8,s:+1},{idx:DIM.MOMENTUM,w:0.3,s:-1}], R:0.15 },
  'topology.DEGRADED':                { dims:[{idx:DIM.MOMENTUM,w:0.9,s:-1},{idx:DIM.DEBT,w:0.6,s:+1}], R:0.15 },
  'topology.GC_PAUSE':                { dims:[{idx:DIM.LOAD,w:0.7,s:+1},{idx:DIM.DEBT,w:0.5,s:+1}], R:0.20 },
  'topology.QUEUE_BUILDUP':           { dims:[{idx:DIM.LOAD,w:0.8,s:+1},{idx:DIM.CAPACITY,w:0.7,s:-1}], R:0.15 },
  'topology.CASCADE_RISK':            { dims:[{idx:DIM.MOMENTUM,w:0.9,s:-1},{idx:DIM.COHERENCE,w:0.6,s:-1},{idx:DIM.DEBT,w:0.7,s:+1}], R:0.10 },
  'metric.connection_headroom':       { dims:[{idx:DIM.CAPACITY,w:0.8,s:+1}], R:0.20 },
  'metric.backpressure':              { dims:[{idx:DIM.CAPACITY,w:0.9,s:-1}], R:0.25 },
  'slope.throughput_headroom.falling':{ dims:[{idx:DIM.CAPACITY,w:0.7,s:-1}], R:0.25 },
};

export class ServiceLatentModel {
  constructor({ bus, serviceId, stateInterval = STATE_INTERVAL } = {}) {
    if (!bus)       throw new Error('[ServiceLatentModel] bus required');
    if (!serviceId) throw new Error('[ServiceLatentModel] serviceId required');
    this._bus           = bus;
    this._serviceId     = serviceId;
    this._stateInterval = stateInterval;
    this._frame         = 0;
    this._x             = new Float64Array(N_DIM);
    this._P             = Float64Array.from(P_INIT);
    this._prevX         = new Float64Array(N_DIM);
    this._frameObs      = new Map();
    this.stats = { framesProcessed:0, observationsTotal:0, shiftsDetected:0 };
    this._bindBus();
  }

  _bindBus() {
    const b = this._bus;
    b.on('tc.metric.slope', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { metric, result } = ev;
      if (!result || result.direction === 'flat') return;
      const key = `slope.${metric}.${result.direction}`;
      const model = OBS_MODELS[key]; if (!model) return;
      const conf = Math.min(1, result.r2 * (0.5 + Math.abs(result.momentum) * 0.5));
      this._queueObs(key, conf, model.R, model.dims);
    });
    b.on('tc.metric.stability', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { result } = ev;
      if (!result?.regimeChange) return;
      const key = `stability.${result.regime}`;
      const model = OBS_MODELS[key]; if (!model) return;
      this._queueObs(key, result.cv, model.R, model.dims);
    });
    b.on('tc.metric.oscillation', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { metric, result } = ev;
      if (!result?.oscillating) return;
      const key = `osc.${metric}`;
      const model = OBS_MODELS[key]; if (!model) return;
      this._queueObs(key, result.regularity, model.R, model.dims);
    });
    b.on('tc.metric.raw', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { metric, value } = ev;
      const key = `metric.${metric}`;
      const model = OBS_MODELS[key]; if (!model) return;
      this._queueObs(key, Math.max(0, Math.min(1, value)), model.R, model.dims);
    });
    b.on('tc.topology.composite', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const key = `topology.${ev.label}`;
      const model = OBS_MODELS[key]; if (!model) return;
      this._queueObs(key, ev.score ?? 0.5, model.R, model.dims);
    });
    b.on('tc.coherence.update', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const key = ev.dissonant ? 'coherence.dissonance' : 'coherence.congruent';
      const model = OBS_MODELS[key]; if (!model) return;
      this._queueObs(key, ev.magnitude ?? 0.5, model.R, model.dims);
    });
  }

  _queueObs(key, strength, R, dims) {
    const existing = this._frameObs.get(key);
    if (existing) { existing.sum += strength; existing.count++; }
    else this._frameObs.set(key, { sum: strength, count: 1, R, dims });
    this.stats.observationsTotal++;
  }

  step() {
    this._frame++;
    this.stats.framesProcessed++;
    this._prevX.set(this._x);
    for (let i = 0; i < N_DIM; i++) this._P[i] = Math.min(1.0, this._P[i] + Q[i]);
    for (const [, obs] of this._frameObs) {
      const strength = obs.sum / obs.count;
      for (const { idx, w, s } of obs.dims) this._kalmanUpdate(idx, strength * s * w, obs.R);
    }
    this._frameObs.clear();
    this._x[DIM.MOMENTUM]  = clamp(this._x[DIM.MOMENTUM],  -1, 1);
    this._x[DIM.LOAD]      = clamp(this._x[DIM.LOAD],       0, 1);
    this._x[DIM.DEBT]      = clamp(this._x[DIM.DEBT],       0, 1);
    this._x[DIM.COHERENCE] = clamp(this._x[DIM.COHERENCE],  0, 1);
    this._x[DIM.CAPACITY]  = clamp(this._x[DIM.CAPACITY],  -1, 1);
    const shifts = [];
    for (let i = 0; i < N_DIM; i++) {
      const delta = this._x[i] - this._prevX[i];
      if (Math.abs(delta) > SHIFT_THRESHOLD) {
        shifts.push({ dim: DIM_NAMES[i], from: r4(this._prevX[i]), to: r4(this._x[i]), delta: r4(delta) });
        this.stats.shiftsDetected++;
      }
    }
    const state = this.state();
    if (this._frame % this._stateInterval === 0)
      this._bus.emit('tc.latent.update', { serviceId: this._serviceId, state, frame: this._frame, ts: Date.now() });
    if (shifts.length > 0)
      this._bus.emit('tc.latent.shift', { serviceId: this._serviceId, shifts, state, frame: this._frame, ts: Date.now() });
    return state;
  }

  _kalmanUpdate(dimIdx, observation, R) {
    const P = this._P[dimIdx];
    const K = P / (P + R);
    this._x[dimIdx] += K * (observation - this._x[dimIdx]);
    this._P[dimIdx]  = (1 - K) * P;
  }

  state() {
    return {
      momentum:  r4(this._x[DIM.MOMENTUM]),
      load:      r4(this._x[DIM.LOAD]),
      debt:      r4(this._x[DIM.DEBT]),
      coherence: r4(this._x[DIM.COHERENCE]),
      capacity:  r4(this._x[DIM.CAPACITY]),
    };
  }

  // Composite health score [0,1]
  healthScore() {
    const s = this._x;
    return r4(
      (s[DIM.MOMENTUM] + 1) / 2 * 0.30 +
      (1 - s[DIM.LOAD])          * 0.25 +
      (1 - s[DIM.DEBT])          * 0.20 +
      s[DIM.COHERENCE]           * 0.15 +
      (s[DIM.CAPACITY] + 1) / 2  * 0.10
    );
  }

  // Full diagnostic (health score + state + uncertainty)
  diagnostic() {
    return {
      serviceId:   this._serviceId,
      health:      this.healthScore(),
      state:       this.state(),
      uncertainty: Array.from(this._P).map(r4),
      frame:       this._frame,
      stats:       { ...this.stats },
    };
  }

  reset() {
    this._x.fill(0); this._P.set(P_INIT);
    this._prevX.fill(0); this._frameObs.clear();
    this._frame = 0;
    this.stats = { framesProcessed:0, observationsTotal:0, shiftsDetected:0 };
  }
}

function r4(v)          { return Math.round((v ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
