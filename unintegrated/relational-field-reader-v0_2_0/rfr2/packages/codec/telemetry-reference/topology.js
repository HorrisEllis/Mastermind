/**
 * @module       topology
 * @uuid         to9000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * ServiceTopology — cross-metric composite state detector.
 * Ported from Spatial signal-topology.js (c1d2e3f4-a5b6-4789-0abc-def012345678).
 *
 * ORIGINAL BEHAVIORAL COMPOSITES → TELEMETRY COMPOSITES:
 *
 *   STRESS_ACUTE      → HIGH_LOAD
 *                       cpu_util spike + queue_depth rising + p99 rising
 *
 *   SOCIAL_MASK       → DEGRADED
 *                       error_rate rising + throughput_slope_flat (hiding failure)
 *                       = service appears alive but silently failing
 *
 *   CONCEALMENT       → SILENT_FAILURE
 *                       error_rate_stability=volatile + throughput=normal
 *                       = errors happening but not surfacing
 *
 *   GENUINE_ENGAGEMENT → HEALTHY_SCALING
 *                        throughput rising + p99 stable + error_rate low + capacity positive
 *
 *   COGNITIVE_LOAD    → GC_PAUSE
 *                       memory_pressure high + throughput drop + latency spike + recovery
 *
 *   DISSONANCE        → COHERENCE_BREAK
 *                       metrics contradict each other (cpu low, latency high, errors low)
 *
 *   APPROACH          → QUEUE_BUILDUP
 *                       queue_depth rising + throughput_flat + latency rising
 *
 *   WITHDRAWAL        → BACKPRESSURE
 *                       throughput falling + connection drops + retry_rate rising
 *
 *   CONTEMPT_LEAK     → CASCADE_RISK
 *                       multiple services showing DEGRADED simultaneously
 *                       = topology-level cascade signal
 *
 *   FREEZE            → CIRCUIT_OPEN
 *                       throughput=zero + error_rate=zero (circuit breaker tripped)
 *
 * Confidence thresholds: LOW 0.25, MEDIUM 0.40, HIGH 0.60, DEFINITIVE 0.80
 */

'use strict';

export const TOPOLOGY_UUID    = 'to9000-0000-4000-9000-000000000001';
export const TOPOLOGY_VERSION = '1.0.0';

export const CONFIDENCE = Object.freeze({ LOW:'LOW', MEDIUM:'MEDIUM', HIGH:'HIGH', DEFINITIVE:'DEFINITIVE' });
function confLabel(score) {
  if (score >= 0.80) return CONFIDENCE.DEFINITIVE;
  if (score >= 0.60) return CONFIDENCE.HIGH;
  if (score >= 0.40) return CONFIDENCE.MEDIUM;
  return CONFIDENCE.LOW;
}

// Signal decay window: how long a signal stays active (frames)
const DECAY_FRAMES = 30;

class SignalWindow {
  constructor(decayFrames = DECAY_FRAMES) {
    this._decay   = decayFrames;
    this._signals = new Map();
  }
  set(name, strength, frame) { this._signals.set(name, { strength: Math.min(1, strength), lastFrame: frame }); }
  clear(name) { this._signals.delete(name); }
  get(name, currentFrame) {
    const s = this._signals.get(name);
    if (!s) return 0;
    const age = currentFrame - s.lastFrame;
    if (age > this._decay) { this._signals.delete(name); return 0; }
    return s.strength * (1 - age / this._decay);
  }
  active(currentFrame) {
    const out = {};
    for (const [k] of this._signals) {
      const v = this.get(k, currentFrame);
      if (v > 0) out[k] = r4(v);
    }
    return out;
  }
  reset() { this._signals.clear(); }
}

// Composite state definitions
// Each composite has: required (must be > 0), amplifying (boost score), contradicting (reduce score)
const COMPOSITES = {
  HIGH_LOAD: {
    required:      ['cpu_util_high', 'queue_depth_rising'],
    amplifying:    ['p99_rising', 'thread_saturation', 'memory_pressure_high'],
    contradicting: ['throughput_falling_fast', 'circuit_open'],
    weights:       { required: 1.0, amplifying: 0.5, contradicting: -0.8 },
  },
  DEGRADED: {
    required:      ['error_rate_rising', 'throughput_plateau'],
    amplifying:    ['p99_rising', 'retry_rate_high'],
    contradicting: ['throughput_rising', 'error_rate_falling'],
    weights:       { required: 1.0, amplifying: 0.5, contradicting: -0.9 },
  },
  SILENT_FAILURE: {
    required:      ['error_rate_volatile', 'throughput_normal'],
    amplifying:    ['retry_rate_high', 'log_error_spike', 'p99_volatile'],
    contradicting: ['error_rate_stable', 'coherence_high'],
    weights:       { required: 1.0, amplifying: 0.6, contradicting: -0.9 },
  },
  HEALTHY_SCALING: {
    required:      ['throughput_rising', 'p99_stable'],
    amplifying:    ['error_rate_low', 'capacity_positive', 'cpu_util_moderate'],
    contradicting: ['error_rate_rising', 'memory_pressure_high', 'queue_depth_rising'],
    weights:       { required: 1.0, amplifying: 0.4, contradicting: -0.8 },
  },
  GC_PAUSE: {
    required:      ['memory_pressure_high', 'throughput_drop_sudden'],
    amplifying:    ['p99_spike', 'cpu_util_drop'],
    contradicting: ['memory_pressure_stable'],
    weights:       { required: 1.0, amplifying: 0.5, contradicting: -0.7 },
  },
  COHERENCE_BREAK: {
    required:      ['metric_dissonance'],
    amplifying:    ['upstream_latency_spike', 'log_error_spike'],
    contradicting: ['coherence_high', 'all_metrics_stable'],
    weights:       { required: 1.0, amplifying: 0.5, contradicting: -1.0 },
  },
  QUEUE_BUILDUP: {
    required:      ['queue_depth_rising', 'throughput_flat'],
    amplifying:    ['p99_rising', 'memory_pressure_high'],
    contradicting: ['queue_depth_falling', 'throughput_rising'],
    weights:       { required: 1.0, amplifying: 0.5, contradicting: -0.8 },
  },
  BACKPRESSURE: {
    required:      ['throughput_falling', 'retry_rate_rising'],
    amplifying:    ['connection_drops', 'error_rate_rising'],
    contradicting: ['throughput_stable', 'queue_depth_stable'],
    weights:       { required: 1.0, amplifying: 0.5, contradicting: -0.7 },
  },
  CASCADE_RISK: {
    required:      ['upstream_degraded', 'error_rate_rising'],
    amplifying:    ['downstream_latency_rising', 'DEGRADED_active', 'throughput_falling'],
    contradicting: ['upstream_healthy', 'error_rate_stable'],
    weights:       { required: 1.0, amplifying: 0.6, contradicting: -0.9 },
  },
  CIRCUIT_OPEN: {
    required:      ['throughput_near_zero'],
    amplifying:    ['error_rate_near_zero', 'upstream_latency_spike'],
    contradicting: ['throughput_normal', 'throughput_rising'],
    weights:       { required: 1.0, amplifying: 0.4, contradicting: -1.0 },
  },
};

export class ServiceTopology {
  /**
   * @param {object} opts
   * @param {object} opts.bus
   * @param {string} opts.serviceId
   */
  constructor({ bus, serviceId } = {}) {
    if (!bus)       throw new Error('[ServiceTopology] bus required');
    if (!serviceId) throw new Error('[ServiceTopology] serviceId required');
    this._bus       = bus;
    this._serviceId = serviceId;
    this._frame     = 0;
    this._signals   = new SignalWindow(DECAY_FRAMES);
    this._activeComposites = new Map(); // label → { score, confidence, frame }
    this._dominant  = null;
    this._pulseInterval = 30;
    this._bindBus();
  }

  _bindBus() {
    const b = this._bus;
    // Slope signals
    b.on('tc.metric.slope', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { metric, result } = ev; if (!result) return;
      const strength = result.r2 * (0.5 + Math.abs(result.momentum ?? 0) * 0.5);
      if (result.direction === 'rising')  this._signals.set(`${metric}_rising`,  strength, this._frame);
      if (result.direction === 'falling') this._signals.set(`${metric}_falling`, strength, this._frame);
      if (result.direction === 'flat')    this._signals.set(`${metric}_flat`,    0.6,      this._frame);
      if (result.regimeChange) this._signals.set(`${metric}_regime_change`, 0.8, this._frame);
    });
    // Stability signals
    b.on('tc.metric.stability', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { metric, result } = ev; if (!result) return;
      if (result.regime === 'volatile')  this._signals.set(`${metric}_volatile`,  result.cv,              this._frame);
      if (result.regime === 'stable')    this._signals.set(`${metric}_stable`,    result.stabilityScore,  this._frame);
      if (result.regime === 'collapsed') this._signals.set(`${metric}_collapsed`, 0.7,                    this._frame);
      if (result.regimeChange) this._signals.set(`${metric}_stab_regime_change`, 0.7, this._frame);
    });
    // Raw metric thresholds → named signals
    b.on('tc.metric.raw', ev => {
      if (ev.serviceId !== this._serviceId) return;
      const { metric, value } = ev;
      this._thresholdSignals(metric, value);
    });
    // Coherence
    b.on('tc.coherence.update', ev => {
      if (ev.serviceId !== this._serviceId) return;
      if (ev.dissonant)  this._signals.set('metric_dissonance', ev.magnitude ?? 0.6, this._frame);
      else               this._signals.set('coherence_high',    ev.magnitude ?? 0.6, this._frame);
    });
    // Upstream/downstream
    b.on('tc.upstream.health', ev => {
      if (ev.serviceId !== this._serviceId) return;
      if (ev.degraded) this._signals.set('upstream_degraded', ev.severity ?? 0.7, this._frame);
      else             this._signals.set('upstream_healthy',  0.6,                this._frame);
    });
  }

  _thresholdSignals(metric, value) {
    const f = this._frame;
    // cpu thresholds
    if (metric === 'cpu_util') {
      if (value > 0.85) this._signals.set('cpu_util_high',     value,   f);
      else if (value > 0.40 && value < 0.75) this._signals.set('cpu_util_moderate', 0.5, f);
      if (value < 0.10) this._signals.set('cpu_util_drop', 0.7, f);
    }
    // memory
    if (metric === 'memory_pressure') {
      if (value > 0.80) this._signals.set('memory_pressure_high',   value, f);
      if (value < 0.30) this._signals.set('memory_pressure_stable', 0.6,   f);
    }
    // throughput (normalized [0,1] with 1 = max expected)
    if (metric === 'throughput_normalized') {
      if (value > 0.85) this._signals.set('throughput_high',    value, f);
      if (value < 0.05) this._signals.set('throughput_near_zero', 0.9, f);
      if (value > 0.40 && value < 0.60) this._signals.set('throughput_normal', 0.5, f);
      if (value > 0.40 && value < 0.65) this._signals.set('throughput_plateau', 0.5, f);
    }
    // error rate (0 = no errors, 1 = all errors)
    if (metric === 'error_rate') {
      if (value < 0.001) this._signals.set('error_rate_low',      0.9, f);
      if (value > 0.01)  this._signals.set('error_rate_high',     value, f);
      if (value < 0.001) this._signals.set('error_rate_near_zero', 0.9, f);
    }
    // retry rate
    if (metric === 'retry_rate') {
      if (value > 0.10) this._signals.set('retry_rate_high',   value, f);
      if (value > 0.05) this._signals.set('retry_rate_rising', value, f);
    }
    // queue depth (normalized)
    if (metric === 'queue_depth_normalized') {
      if (value > 0.70) this._signals.set('queue_depth_rising', value, f);
      if (value < 0.20) this._signals.set('queue_depth_stable', 0.6,   f);
      if (value < 0.05) this._signals.set('queue_depth_falling', 0.7,  f);
    }
    // capacity
    if (metric === 'connection_headroom') {
      if (value > 0.50) this._signals.set('capacity_positive', value, f);
      if (value < 0.10) this._signals.set('connection_drops',  0.8,   f);
    }
  }

  // Call once per tick
  step() {
    this._frame++;
    this._activeComposites.clear();

    let dominantLabel = null, dominantScore = 0;

    for (const [label, def] of Object.entries(COMPOSITES)) {
      const score = this._scoreComposite(def);
      if (score > 0.20) {
        const conf = confLabel(score);
        this._activeComposites.set(label, { score: r4(score), confidence: conf, frame: this._frame });
        this._bus.emit('tc.topology.composite', {
          serviceId: this._serviceId, label, score: r4(score), confidence: conf, ts: Date.now(),
        });
        if (score > dominantScore) { dominantScore = score; dominantLabel = label; }
      }
    }

    if (dominantLabel !== this._dominant) {
      const prev = this._dominant;
      this._dominant = dominantLabel;
      this._bus.emit('tc.topology.transition', {
        serviceId: this._serviceId, from: prev, to: dominantLabel,
        score: r4(dominantScore), ts: Date.now(),
      });
    }

    if (this._frame % this._pulseInterval === 0) {
      this._bus.emit('tc.topology.pulse', {
        serviceId: this._serviceId,
        dominant: this._dominant,
        active: Object.fromEntries(this._activeComposites),
        signals: this._signals.active(this._frame),
        frame: this._frame, ts: Date.now(),
      });
    }

    return { dominant: this._dominant, active: this._activeComposites };
  }

  _scoreComposite(def) {
    const w = def.weights;
    let score = 0;
    const reqStrengths = def.required.map(s => this._signals.get(s, this._frame));
    if (reqStrengths.some(v => v === 0)) return 0; // all required must be present
    score += reqStrengths.reduce((s, v) => s + v, 0) / reqStrengths.length * w.required;
    const ampStrengths = (def.amplifying ?? []).map(s => this._signals.get(s, this._frame));
    if (ampStrengths.length > 0)
      score += ampStrengths.reduce((s, v) => s + v, 0) / ampStrengths.length * w.amplifying;
    const conStrengths = (def.contradicting ?? []).map(s => this._signals.get(s, this._frame));
    if (conStrengths.length > 0)
      score += conStrengths.reduce((s, v) => s + v, 0) / conStrengths.length * w.contradicting;
    return Math.max(0, Math.min(1, score));
  }

  health() {
    return {
      uuid: TOPOLOGY_UUID, version: TOPOLOGY_VERSION,
      serviceId: this._serviceId, frame: this._frame,
      dominant: this._dominant,
      activeCount: this._activeComposites.size,
    };
  }

  reset() { this._signals.reset(); this._activeComposites.clear(); this._dominant = null; this._frame = 0; }
}

function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
