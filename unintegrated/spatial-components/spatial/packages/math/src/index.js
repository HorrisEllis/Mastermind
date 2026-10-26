/**
 * @spatial/math — v1.0.0
 *
 * Zero-dependency math primitives shared across Spatial packages.
 * Previously duplicated in drift-engine, codec.js, codec-topology, sigma, text-module,
 * pat-from-pcm, attractor-landscape, resonance/fingerprint, nexus/identity.
 *
 * §5.5 — Zero runtime dependencies.
 * §1.1 — Every function documents what it computes and its limits.
 */

'use strict';

export const MATH_VERSION = '1.0.0';

// ── Basic statistics ──────────────────────────────────────────────────────────

export function mean(arr) {
  if (!arr?.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function variance(arr) {
  if (!arr?.length) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

export function stddev(arr) {
  return Math.sqrt(variance(arr));
}

export function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

export function clamp01(v) {
  return clamp(v, 0, 1);
}

// ── OLS linear regression slope ───────────────────────────────────────────────
// Returns slope per array index. Same input always produces same output.
// Used by: DriftEngine (energy change), SlopeEngine (codec-v2), sigma (feature axes).

export function slope(arr) {
  if (!arr?.length || arr.length < 2) return 0;
  const n  = arr.length;
  const xs = arr.map((_, i) => i);
  const xm = mean(xs);
  const ym = mean(arr);
  const num = xs.reduce((s, x, i) => s + (x - xm) * (arr[i] - ym), 0);
  const den = xs.reduce((s, x)    => s + (x - xm) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

// Full OLS with r² — used by SlopeEngine
export function ols(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += ys[i]; sumXY += i * ys[i];
    sumX2 += i * i; sumY2 += ys[i] * ys[i];
  }
  const sl        = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - sl * sumX) / n;
  const ssTot     = sumY2 - (sumY * sumY) / n;
  const ssRes     = ys.reduce((a, y, i) => a + (y - (sl * i + intercept)) ** 2, 0);
  const r2        = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  return { slope: sl, intercept, r2 };
}

// ── Rolling statistics ────────────────────────────────────────────────────────
// Fixed-window rolling mean, sigma, z-score, anomaly detection.
// Source: codec.js RollingStats — canonical implementation.

export class RollingStats {
  constructor(maxLen = 30) {
    this._max = maxLen;
    this._buf = [];
    this._sum  = 0;
    this._sum2 = 0;
  }

  push(v) {
    if (!isFinite(v)) return this;
    if (this._buf.length >= this._max) {
      const evicted = this._buf.shift();
      this._sum  -= evicted;
      this._sum2 -= evicted * evicted;
    }
    this._buf.push(v);
    this._sum  += v;
    this._sum2 += v * v;
    return this;
  }

  get n()     { return this._buf.length; }
  get mean()  { return this.n ? this._sum / this.n : 0; }
  get values(){ return [...this._buf]; }

  get sigma() {
    if (this.n < 2) return 0;
    const m = this.mean;
    return Math.sqrt(Math.max(0, this._sum2 / this.n - m * m));
  }

  get variance() { return this.sigma ** 2; }

  zscore(v) {
    const s = this.sigma;
    return s > 0 ? (v - this.mean) / s : 0;
  }

  isAnomaly(v, threshold = 2.0) {
    return Math.abs(this.zscore(v)) >= threshold;
  }

  delta(v) {
    return v - this.mean;
  }

  reset() {
    this._buf = []; this._sum = 0; this._sum2 = 0;
    return this;
  }
}

// ── FNV-1a 32-bit hash ────────────────────────────────────────────────────────
// Deterministic, stable across runs. Used for behavioral fingerprints.
// §P1 — inputs must be behavioral signals, not PII.

export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h  = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// FNV-1a 64-bit (two 32-bit lanes) — used by nexus/identity for event IDs
export function fnv1a64(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    h1 ^= str.charCodeAt(i);
    h1  = (h1 * 0x01000193) >>> 0;
    h2  = ((h2 << 5) + h2) ^ str.charCodeAt(i);
    h2  = h2 >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

// ── Ring buffer ───────────────────────────────────────────────────────────────
// Fixed-capacity FIFO. Used by DriftEngine signal windows.

export class RingBuffer {
  constructor(maxLen) { this._max = maxLen; this._buf = []; }
  push(v)     { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); return this; }
  get values(){ return [...this._buf]; }
  get length(){ return this._buf.length; }
  get full()  { return this._buf.length >= this._max; }
  clear()     { this._buf = []; return this; }
}

// ── 5D vector utilities ───────────────────────────────────────────────────────
// Used by resonance distance, attractor landscape, field synchrony.

export function euclidean5(a, b) {
  let sum = 0;
  for (let i = 0; i < 5; i++) { const d = (a[i] ?? 0) - (b[i] ?? 0); sum += d * d; }
  return Math.sqrt(sum / 5); // normalized 0..√1
}

export function dot5(a, b) {
  let s = 0;
  for (let i = 0; i < 5; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

export function mag5(a) {
  return Math.sqrt(dot5(a, a));
}

export function cosine5(a, b) {
  const ma = mag5(a), mb = mag5(b);
  return (ma > 0 && mb > 0) ? dot5(a, b) / (ma * mb) : 0;
}
