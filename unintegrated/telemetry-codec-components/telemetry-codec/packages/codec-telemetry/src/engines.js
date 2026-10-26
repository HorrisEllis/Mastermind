/**
 * @module       engines
 * @uuid         e0910000-0000-4000-9000-000000000001
 * @version      1.0.0
 *
 * Temporal signal compression engines.
 * Ported from Spatial codec-v2.js (c0de2000-0000-4000-9000-000000000002).
 *
 * These engines are domain-agnostic. Feed them any time-series scalar.
 * They produce the shape of the signal, not its raw values:
 *
 *   SlopeEngine        → WHERE IT'S GOING (direction, momentum, regime change)
 *   StabilityEngine    → IS IT SETTLING (CV, entropy, convergence/divergence)
 *   OscillationEngine  → IS IT RHYTHMIC (period, regularity, amplitude)
 *   ConfidencePropagator → ARE SIGNALS CORROBORATING EACH OTHER
 *
 * Original behavioral signal mappings kept as comments for reference.
 * New telemetry mappings documented inline.
 *
 * §1.1 nothing exists until proven
 * §1.2 nothing silently fails
 * §5.5 no external dependencies
 */

'use strict';

export const ENGINES_UUID    = 'e0910000-0000-4000-9000-000000000001';
export const ENGINES_VERSION = '1.0.0';

// ── SlopeEngine ───────────────────────────────────────────────────────────────
// OLS linear regression slope over a rolling window.
// Original: direction+momentum of audio energy, sentiment, friction.
// Telemetry: cpu_util trend, p99_latency trajectory, error_rate slope.
//
// Output:
//   slope       — signed rate of change per sample
//   r2          — [0,1] goodness of fit (how linear is the trend?)
//   direction   — 'rising' | 'falling' | 'flat'
//   momentum    — slope normalized by sigma (how fast vs how noisy?)
//   regimeChange — true when direction flips (was rising, now falling)

const SLOPE_WINDOW = 8;

export class SlopeEngine {
  constructor(window = SLOPE_WINDOW) {
    this._w         = window;
    this._buf       = [];
    this._prevSlope = 0;
    this._prevDir   = 'flat';
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    if (n < 2) return { slope: 0, r2: 0, direction: 'flat', momentum: 0, regimeChange: false };

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
      sumX  += i;           sumY  += this._buf[i];
      sumXY += i * this._buf[i]; sumX2 += i * i; sumY2 += this._buf[i] ** 2;
    }
    const D     = n * sumX2 - sumX * sumX;
    const slope = D !== 0 ? (n * sumXY - sumX * sumY) / D : 0;
    const b     = (sumY - slope * sumX) / n;
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
      ssTot += (this._buf[i] - meanY) ** 2;
      ssRes += (this._buf[i] - (b + slope * i)) ** 2;
    }
    const r2     = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
    const dir    = Math.abs(slope) < 0.003 ? 'flat' : slope > 0 ? 'rising' : 'falling';
    const sigma  = Math.sqrt(Math.max(0, sumY2 / n - (sumY / n) ** 2));
    const momentum     = sigma > 0 ? (slope * r2) / sigma : 0;
    const regimeChange = dir !== 'flat' && this._prevDir !== 'flat' && dir !== this._prevDir;
    this._prevSlope = slope;
    this._prevDir   = dir;
    return { slope: r4(slope), r2: r4(r2), direction: dir, momentum: r4(momentum), regimeChange };
  }

  reset() { this._buf = []; this._prevSlope = 0; this._prevDir = 'flat'; }
}

// ── StabilityEngine ───────────────────────────────────────────────────────────
// Coefficient of variation + entropy — is the signal converging or diverging?
// Original: energy stability, sentiment stability.
// Telemetry: throughput stability, latency variance regime, error_rate volatility.
//
// Output:
//   cv            — coefficient of variation (sigma/mean)
//   regime        — 'stable' | 'volatile' | 'collapsed'
//   regimeChange  — true when regime transitions
//   convergence   — CV trending down (signal settling)
//   divergence    — CV trending up (signal destabilizing)
//   stabilityScore — [0,1] inverse of normalized CV
//   entropy       — Shannon entropy of 8-bin histogram [0,1]

const STABILITY_CV_ALERT = 0.55;

export class StabilityEngine {
  constructor(window = 20) {
    this._buf        = [];
    this._w          = window;
    this._cvHistory  = [];
    this._prevRegime = 'stable';
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n     = this._buf.length;
    const mean  = this._buf.reduce((s, x) => s + x, 0) / n;
    const sigma = Math.sqrt(this._buf.reduce((s, x) => s + (x - mean) ** 2, 0) / n);
    const cv    = Math.abs(mean) > 1e-6 ? sigma / Math.abs(mean) : sigma;
    this._cvHistory.push(cv);
    if (this._cvHistory.length > 10) this._cvHistory.shift();
    const cvDelta    = this._cvHistory.length > 1 ? cv - this._cvHistory[this._cvHistory.length - 2] : 0;
    const regime     = cv > STABILITY_CV_ALERT ? 'volatile' : cv < 0.04 && n >= 5 ? 'collapsed' : 'stable';
    const regimeChange = regime !== this._prevRegime;
    this._prevRegime   = regime;
    return {
      cv:             r4(cv),
      regime,
      regimeChange,
      convergence:    cvDelta < -0.02,
      divergence:     cvDelta >  0.02,
      stabilityScore: r4(Math.max(0, 1 - Math.min(1, cv / STABILITY_CV_ALERT))),
      entropy:        r4(this._entropy()),
    };
  }

  _entropy() {
    if (this._buf.length < 3) return 0;
    const min   = Math.min(...this._buf);
    const max   = Math.max(...this._buf);
    const range = max - min;
    if (!range) return 0;
    const bins = new Array(8).fill(0);
    for (const v of this._buf) bins[Math.min(7, Math.floor(((v - min) / range) * 8))]++;
    const n = this._buf.length;
    let H = 0;
    for (const c of bins) if (c > 0) { const p = c / n; H -= p * Math.log2(p); }
    return H / 3;
  }

  reset() { this._buf = []; this._cvHistory = []; this._prevRegime = 'stable'; }
}

// ── OscillationEngine ─────────────────────────────────────────────────────────
// Peak/trough detection, period estimation, regularity.
// Original: rhythmicity of emotional expression, energy oscillation.
// Telemetry: periodic traffic patterns (daily cycles), GC pause rhythm,
//            cron job regularity, retry storm oscillation.
//
// Output:
//   oscillating  — true if regular peaks detected
//   period       — estimated inter-peak interval (samples) | null
//   regularity   — [0,1] inverse of inter-peak CV (1 = perfect metronome)
//   phase        — samples since last peak
//   amplitude    — mean peak minus mean trough
//   intervalCV   — coefficient of variation of inter-peak intervals

const OSC_MIN_CYCLES = 3;

export class OscillationEngine {
  constructor(window = 60) {
    this._w        = window;
    this._buf      = [];
    this._peaks    = [];
    this._troughs  = [];
    this._total    = 0;
    this._peakCount = 0;
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    this._total++;
    const n = this._buf.length;
    if (n >= 5) {
      const i = n - 3;
      const [p2, p1, c, n1, n2] = [
        this._buf[i - 2] ?? this._buf[0], this._buf[i - 1],
        this._buf[i],
        this._buf[i + 1], this._buf[i + 2] ?? this._buf[n - 1],
      ];
      const mean5 = (p2 + p1 + c + n1 + n2) / 5;
      if (c > p1 && c > n1 && c > mean5 * 1.04) {
        this._peaks.push({ idx: this._total - 2, v: c });
        this._peakCount++;
        if (this._peaks.length > 20) this._peaks.shift();
      }
      if (c < p1 && c < n1 && c < mean5 * 0.96) {
        this._troughs.push({ idx: this._total - 2, v: c });
        if (this._troughs.length > 20) this._troughs.shift();
      }
    }

    const pk = this._peaks;
    if (pk.length < OSC_MIN_CYCLES) {
      return { oscillating: false, period: null, regularity: 0, phase: 0, peakCount: this._peakCount, amplitude: 0 };
    }

    const intervals = [];
    for (let i = 1; i < pk.length; i++) intervals.push(pk[i].idx - pk[i - 1].idx);
    const iMean     = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const iSigma    = Math.sqrt(intervals.reduce((s, v) => s + (v - iMean) ** 2, 0) / intervals.length);
    const iCV       = iMean > 0 ? iSigma / iMean : 1;
    const oscillating = iCV < 0.28 && pk.length >= OSC_MIN_CYCLES;
    const regularity  = Math.max(0, 1 - iCV);
    const phase = pk.length > 0 ? this._total - pk[pk.length - 1].idx : 0;

    let amplitude = 0;
    if (this._troughs.length > 0) {
      const pMean = pk.reduce((s, p) => s + p.v, 0) / pk.length;
      const tMean = this._troughs.reduce((s, t) => s + t.v, 0) / this._troughs.length;
      amplitude   = Math.max(0, pMean - tMean);
    }

    return {
      oscillating,
      period:     oscillating ? r4(iMean) : null,
      regularity: r4(regularity),
      phase,
      peakCount:  this._peakCount,
      amplitude:  r4(amplitude),
      intervalCV: r4(iCV),
    };
  }

  reset() { this._buf = []; this._peaks = []; this._troughs = []; this._total = 0; this._peakCount = 0; }
}

// ── ConfidencePropagator ──────────────────────────────────────────────────────
// Cross-signal Bayesian confidence amplification.
// Original: audio corroborates video corroborates transcript.
// Telemetry: latency spike corroborates error rate corroborates queue depth.
//
// Key insight: a low-confidence signal becomes actionable when corroborated
// by simultaneous high-confidence signals from other channels.
// A high-confidence signal that stands alone is less reliable than one
// corroborated by three independent indicators.

export class ConfidencePropagator {
  constructor(windowMs = 500) {
    this._windowMs = windowMs;
    this._buffer   = []; // [{ type, confidence, ts }]
  }

  observe(type, confidence, ts = Date.now()) {
    this._buffer.push({ type, confidence: Math.max(0, Math.min(1, confidence)), ts });
    this._prune(ts);
  }

  // Propagated confidence for a signal type — amplified by corroborating signals.
  propagated(type, ts = Date.now()) {
    this._prune(ts);
    const own = this._buffer.filter(s => s.type === type);
    if (!own.length) return 0;
    const ownConf   = own.reduce((mx, s) => Math.max(mx, s.confidence), 0);
    const others    = this._buffer.filter(s => s.type !== type);
    if (!others.length) return ownConf;
    const otherMean = others.reduce((s, o) => s + o.confidence, 0) / others.length;
    const boost     = otherMean * 0.4;
    return r4(Math.min(1, ownConf + boost * (1 - ownConf)));
  }

  // Joint confidence: weakest-link across multiple simultaneous signals.
  joint(types, ts = Date.now()) {
    this._prune(ts);
    let minConf = 1;
    for (const type of types) {
      const sigs = this._buffer.filter(s => s.type === type);
      if (!sigs.length) return 0;
      minConf = Math.min(minConf, sigs.reduce((mx, s) => Math.max(mx, s.confidence), 0));
    }
    return r4(minConf);
  }

  _prune(ts) {
    this._buffer = this._buffer.filter(s => ts - s.ts < this._windowMs);
  }

  reset() { this._buffer = []; }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
