'use strict';

/**
 * TOPO-KERNEL — SNR
 * Signal/Noise Root. The law of the system.
 * Nothing downstream ever sees noise.
 *
 * Pipeline (sovereign gates, sequential):
 *   1. EntropyGate        — information density
 *   2. VarianceGate       — oscillation within real range
 *   3. ConsistencyGate    — self-contradiction check
 *   4. FidelityGate       — field shape conformance
 *   5. CausalityGate      — traceable origin
 *   6. PatternGate        — coordinated noise detection
 *   7. IMEGate            — implicit memory match
 *   8. BayesianTrustGate  — composite posterior, updated per signal
 *
 * Output: snr score [0-1]. Below threshold → dropped. Above → real.
 *
 * Version: 0.1.0
 */

const { randomBytes } = require('crypto');
const { EVENT_TYPES } = require('./bus');

// ── Constants ────────────────────────────────────────────────────────────────

const SNR_DEFAULTS = Object.freeze({
  threshold:          0.55,   // minimum snr score to pass
  entropyWeight:      0.20,
  varianceWeight:     0.20,
  consistencyWeight:  0.20,
  fidelityWeight:     0.10,   // fidelity rewards structure, not noise immunity — keep weight low
  causalityWeight:    0.10,
  patternWeight:      0.10,
  imeWeight:          0.10,
  // Variance
  varianceWindowSize: 20,
  varianceMaxRatio:   3.0,    // max std/mean before flagged as noise
  // Consistency
  consistencyWindow:  10,
  consistencyMaxFlip: 0.4,    // max fraction of sign flips before noise
  // Fidelity
  fidelityTolerance:  0.3,    // max deviation from field range [-1,1]
  // Causality
  maxOriginAgeMs:     300000, // 5 minutes — origins older than this are suspect
  // Pattern
  patternWindowSize:  50,
  patternRepeatRatio: 0.7,    // signal repeating > 70% identical = pattern noise
  // IME
  imeWindowSize:      100,
  imeAnomalyZScore:   3.0,    // z-score beyond this = anomaly
  // Bayesian
  bayesPrior:         0.5,    // initial trust
  bayesLearningRate:  0.05,
  bayesDecayRate:     0.01,   // decay per failed signal
  bayesMinTrust:      0.05,
  bayesMaxTrust:      0.99,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return randomBytes(4).toString('hex');
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function entropy(values) {
  // Shannon entropy normalized to [0,1] over observed value distribution
  if (!values.length) return 0;
  const counts = new Map();
  for (const v of values) {
    const bucket = Math.round(v * 10) / 10; // bucket to 1dp
    counts.set(bucket, (counts.get(bucket) || 0) + 1);
  }
  const n = values.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    if (p > 0) h -= p * Math.log2(p);
  }
  const maxH = Math.log2(Math.min(counts.size, n));
  return maxH > 0 ? clamp(h / maxH, 0, 1) : 0;
}

// ── RingBuffer ───────────────────────────────────────────────────────────────

class RingBuffer {
  constructor(size) {
    this._size   = size;
    this._buffer = [];
  }

  push(v) {
    this._buffer.push(v);
    if (this._buffer.length > this._size) this._buffer.shift();
  }

  values() { return [...this._buffer]; }
  length() { return this._buffer.length; }
  last(n)  { return this._buffer.slice(-n); }
}

// ── IMERecord ────────────────────────────────────────────────────────────────

class IMERecord {
  constructor(sourceId, opts) {
    this.sourceId        = sourceId;
    this.signalHistory   = new RingBuffer(opts.imeWindowSize);
    this.patternHistory  = new RingBuffer(opts.patternWindowSize);
    this.totalSignals    = 0;
    this.passed          = 0;
    this.failed          = 0;
    this.trustScore      = opts.bayesPrior;
    this.anomalyLog      = [];
    this.consistencyMean = 0;
    this.lastSeen        = null;
    this.createdAt       = Date.now();
  }

  update(value, passed) {
    this.signalHistory.push(value);
    this.patternHistory.push(value);
    this.totalSignals++;
    if (passed) this.passed++; else this.failed++;
    this.lastSeen = Date.now();
  }

  zScore(value) {
    const hist = this.signalHistory.values();
    if (hist.length < 5) return 0; // not enough history
    const m = mean(hist);
    const s = stddev(hist);
    if (s === 0) return 0;
    return Math.abs((value - m) / s);
  }

  passRate() {
    if (!this.totalSignals) return 0.5;
    return this.passed / this.totalSignals;
  }

  summary() {
    return {
      sourceId:     this.sourceId,
      totalSignals: this.totalSignals,
      passed:       this.passed,
      failed:       this.failed,
      trustScore:   this.trustScore,
      passRate:     this.passRate(),
      lastSeen:     this.lastSeen,
    };
  }
}

// ── SNR Gates ─────────────────────────────────────────────────────────────────

// Each gate returns a score [0-1]. 1 = clean signal. 0 = pure noise.

function entropyGate(signal, ime, opts) {
  // Use batch values if provided, otherwise use IME history.
  let values;
  if (Array.isArray(signal.values) && signal.values.length > 1) {
    values = signal.values;
  } else {
    const history = ime.signalHistory.values();
    values = history.length >= 5 ? history : null;
  }

  // Not enough data yet — neutral
  if (!values || values.length < 5) return 0.5;
  if (values.some(v => typeof v !== 'number')) return 0.5;

  const h = entropy(values);

  // Pure random: h near 1.0 = maximum disorder = noise
  if (h > 0.90) return clamp(1 - h * 1.5, 0.02, 0.15);

  // Completely flat: h near 0 = no information
  if (h < 0.08) return 0.2;

  // Sweet spot 0.15–0.75
  const distFromCenter = Math.abs(h - 0.45);
  return clamp(1 - distFromCenter * 1.4, 0.1, 1);
}

function causalityGate(signal, _ime, opts) {
  const hasSource = !!signal.sourceId;
  const hasTs     = typeof signal.ts === 'number';
  const tsAge     = hasTs ? Date.now() - signal.ts : Infinity;
  const notFuture = hasTs ? signal.ts <= Date.now() + 1000 : false;

  if (!hasSource && !hasTs) return 0.1;

  const sourceScore = hasSource ? 0.4 : 0;
  const notFutureScore = notFuture ? 0.2 : 0;

  // Freshness score — decays aggressively past maxOriginAgeMs
  let freshScore = 0;
  if (hasTs) {
    if (tsAge < 5000)                          freshScore = 0.4;  // < 5s — fresh
    else if (tsAge < 30000)                    freshScore = 0.35; // < 30s
    else if (tsAge < opts.maxOriginAgeMs)      freshScore = 0.2;  // within window
    else if (tsAge < opts.maxOriginAgeMs * 2)  freshScore = 0.05; // 2x window — very stale
    else                                       freshScore = 0;    // ancient
  }

  return clamp(sourceScore + freshScore + notFutureScore, 0, 1);
}

function varianceGate(signal, ime, opts) {
  // If variance is wildly disproportionate to the mean, it's noise
  const history = ime.signalHistory.values();
  if (history.length < 3) return 0.6; // not enough history, neutral pass
  const m   = Math.abs(mean(history)) || 1;
  const s   = stddev(history);
  const ratio = s / m;
  if (ratio > opts.varianceMaxRatio) return clamp(1 - (ratio / (opts.varianceMaxRatio * 2)), 0.05, 0.5);
  return clamp(1 - (ratio / opts.varianceMaxRatio) * 0.5, 0.5, 1);
}

function consistencyGate(signal, ime, opts) {
  // Measures sign-flip frequency in recent history — high flip rate = noise
  const history = ime.signalHistory.last(opts.consistencyWindow);
  if (history.length < 3) return 0.6;
  let flips = 0;
  for (let i = 1; i < history.length; i++) {
    if (Math.sign(history[i]) !== Math.sign(history[i - 1])) flips++;
  }
  const flipRate = flips / (history.length - 1);
  if (flipRate > opts.consistencyMaxFlip) return clamp(1 - flipRate, 0.1, 0.5);
  return clamp(1 - flipRate * 0.5, 0.5, 1);
}

function fidelityGate(signal, _ime, opts) {
  // Signal must declare a field. Value must be in [-1, 1] range.
  // Values outside range or undeclared field reduce fidelity.
  const value  = typeof signal.value === 'number' ? signal.value : null;
  const hasField = !!signal.field;
  const hasAxis  = !!signal.axis;

  if (value === null) return 0.1;

  const inRange = Math.abs(value) <= 1 + opts.fidelityTolerance;
  const fieldScore   = hasField ? 0.4 : 0;
  const axisScore    = hasAxis  ? 0.3 : 0;
  const rangeScore   = inRange  ? 0.3 : 0;

  return fieldScore + axisScore + rangeScore;
}

function patternGate(signal, ime, opts) {
  // Detects coordinated/injected noise: signal that repeats too identically
  const history = ime.patternHistory.values();
  if (history.length < 5) return 0.7;

  const value = signal.value;
  const identicalCount = history.filter(v => Math.abs(v - value) < 0.001).length;
  const repeatRatio    = identicalCount / history.length;

  if (repeatRatio > opts.patternRepeatRatio) return clamp(1 - repeatRatio, 0.05, 0.3);
  return clamp(1 - repeatRatio * 0.3, 0.7, 1);
}

function imeGate(signal, ime, opts) {
  // Compare signal against implicit memory of this source
  // High z-score = anomaly = suspect
  const value  = signal.value;
  const zScore = ime.zScore(value);

  if (zScore === 0) return 0.65; // no history yet
  if (zScore > opts.imeAnomalyZScore * 2) return 0.1;  // extreme anomaly
  if (zScore > opts.imeAnomalyZScore)     return 0.35; // anomaly

  // Within normal distribution
  return clamp(1 - (zScore / opts.imeAnomalyZScore) * 0.4, 0.6, 1);
}

function bayesianTrustGate(signal, ime, gateScores, opts) {
  // Bayesian posterior update on source trust
  // Prior = current trust score. Likelihood = weighted composite of gate scores.
  const composite = (
    gateScores.entropy     * opts.entropyWeight     +
    gateScores.variance    * opts.varianceWeight    +
    gateScores.consistency * opts.consistencyWeight +
    gateScores.fidelity    * opts.fidelityWeight    +
    gateScores.causality   * opts.causalityWeight   +
    gateScores.pattern     * opts.patternWeight     +
    gateScores.ime         * opts.imeWeight
  );

  // Normalize weights (they sum to 1.0 so composite is already normalized)
  const prior      = ime.trustScore;
  const likelihood = composite;

  // Bayesian update: posterior ∝ likelihood × prior
  // Simplified: weighted blend with learning rate
  const posterior = prior + opts.bayesLearningRate * (likelihood - prior);

  // Decay on failed signals
  const passed    = composite >= opts.threshold;
  const decayed   = passed ? posterior : posterior - opts.bayesDecayRate;

  const updated   = clamp(decayed, opts.bayesMinTrust, opts.bayesMaxTrust);

  // Update IME trust score
  ime.trustScore  = updated;

  // Final SNR = composite weighted by source trust
  const snr = composite * 0.7 + updated * 0.3;

  return { snr: clamp(snr, 0, 1), posterior: updated, composite };
}

// ── SNREngine ────────────────────────────────────────────────────────────────

class SNREngine {
  constructor(bus, opts = {}) {
    if (!bus) throw new Error('SNREngine: bus required');

    this._bus        = bus;
    this._opts       = Object.assign({}, SNR_DEFAULTS, opts);
    this._ime        = new Map();   // sourceId → IMERecord
    this._whitelist  = new Set();   // sourceIds always trusted
    this._blacklist  = new Set();   // sourceIds always dropped
    this._stats      = { processed: 0, passed: 0, dropped: 0 };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Feed a raw signal into the SNR pipeline.
   * Signal shape:
   * {
   *   sourceId: string,     — who/what emitted this
   *   field:    string,     — which field (relational/bonding/threat/temporal/spatial)
   *   axis:     string,     — which polarity axis
   *   value:    number,     — normalized [-1, 1]
   *   values:   number[],   — optional: batch of values for entropy analysis
   *   ts:       number,     — unix ms
   *   meta:     object,     — optional passthrough metadata
   * }
   */
  feed(signal) {
    if (!signal || typeof signal !== 'object') {
      this._stats.dropped++;
      return { passed: false, snr: 0, reason: 'invalid_signal' };
    }

    this._stats.processed++;
    const sourceId = signal.sourceId || 'unknown';

    // Emit raw signal event
    this._bus.emit(EVENT_TYPES.SIGNAL_RAW, { signal }, { sourceId });

    // Blacklist — instant drop
    if (this._blacklist.has(sourceId)) {
      this._stats.dropped++;
      this._bus.emit(EVENT_TYPES.SIGNAL_DROPPED, {
        signal, reason: 'blacklisted', snr: 0,
      }, { sourceId });
      return { passed: false, snr: 0, reason: 'blacklisted' };
    }

    // Get or create IME record
    const ime = this._getIME(sourceId);

    // Whitelist — bypass SNR gates, trust fully
    if (this._whitelist.has(sourceId)) {
      ime.update(signal.value, true);
      this._stats.passed++;
      const result = { passed: true, snr: 1, reason: 'whitelisted', signal };
      this._bus.emit(EVENT_TYPES.SIGNAL_PASSED, result, { sourceId });
      return result;
    }

    // ── Run all gates ──────────────────────────────────────────────────────
    const gateScores = {
      entropy:     entropyGate(signal, ime, this._opts),
      variance:    varianceGate(signal, ime, this._opts),
      consistency: consistencyGate(signal, ime, this._opts),
      fidelity:    fidelityGate(signal, ime, this._opts),
      causality:   causalityGate(signal, ime, this._opts),
      pattern:     patternGate(signal, ime, this._opts),
      ime:         imeGate(signal, ime, this._opts),
    };

    // ── Bayesian trust final composite ────────────────────────────────────
    const { snr, posterior, composite } = bayesianTrustGate(
      signal, ime, gateScores, this._opts
    );

    const passed = snr >= this._opts.threshold;

    // Update IME
    ime.update(signal.value, passed);

    if (passed) {
      this._stats.passed++;
      this._bus.emit(EVENT_TYPES.SIGNAL_PASSED, {
        signal, snr, gateScores, posterior, composite,
      }, { sourceId });
    } else {
      this._stats.dropped++;
      this._bus.emit(EVENT_TYPES.SIGNAL_DROPPED, {
        signal, snr, gateScores, posterior, composite,
        reason: this._failReason(gateScores),
      }, { sourceId });
    }

    return { passed, snr, gateScores, posterior, composite, signal };
  }

  // ── Whitelist / Blacklist ─────────────────────────────────────────────────

  whitelist(sourceId) {
    this._blacklist.delete(sourceId);
    this._whitelist.add(sourceId);
    return this;
  }

  blacklist(sourceId) {
    this._whitelist.delete(sourceId);
    this._blacklist.add(sourceId);
    return this;
  }

  unlist(sourceId) {
    this._whitelist.delete(sourceId);
    this._blacklist.delete(sourceId);
    return this;
  }

  // ── Threshold ─────────────────────────────────────────────────────────────

  setThreshold(v) {
    if (typeof v !== 'number' || v < 0 || v > 1) throw new Error('threshold must be [0-1]');
    this._opts.threshold = v;
    return this;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  trustOf(sourceId) {
    const ime = this._ime.get(sourceId);
    return ime ? ime.summary() : null;
  }

  allTrust() {
    const out = {};
    for (const [id, ime] of this._ime) out[id] = ime.summary();
    return out;
  }

  stats() {
    return { ...this._stats };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _getIME(sourceId) {
    if (!this._ime.has(sourceId)) {
      this._ime.set(sourceId, new IMERecord(sourceId, this._opts));
    }
    return this._ime.get(sourceId);
  }

  _failReason(gateScores) {
    // Return the name of the gate that scored lowest
    const entries = Object.entries(gateScores);
    entries.sort((a, b) => a[1] - b[1]);
    return `low_${entries[0][0]}`;
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = { SNREngine, SNR_DEFAULTS, RingBuffer };
