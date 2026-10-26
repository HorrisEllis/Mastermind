/**
 * @spatial/sigma — v1.0.0
 *
 * Entropy detection. Slope. Trajectory.
 * Where things are going before they get there.
 *
 * §1.1 — outputs are signals. Not diagnoses.
 * §CS1 — species-agnostic. Same mathematics for any nervous system.
 *
 * Core regime classification from causal-nexus/sigma (pure function, unchanged).
 * Behavioral extension: maps 5D latent slope to regime vocabulary.
 * Bus-aware: listens to spatial.kernel.latent.update, emits spatial.sigma.*
 */

'use strict';

export const SIGMA_VERSION = '1.0.0';

// ── Regime vocabulary ─────────────────────────────────────────────────────────
// Extended from causal-nexus REGIMES to cover behavioral states

export const REGIMES = Object.freeze({
  STABLE:            'stable',
  ACTIVATING:        'activating',      // entropy rising from stable — mobilization
  UNGROUNDED:        'ungrounded',      // moderate entropy, fragmented
  DYSREGULATED:      'dysregulated',    // high entropy, multi-layer spike
  OSCILLATORY:       'oscillatory',     // alternating, no settling
  COLLAPSING:        'collapsing',      // rapid increase toward offline
  OFFLINE:           'offline',         // DORSAL/FREEZE — nothing receivable
  INSUFFICIENT_DATA: 'insufficient_data',
});

export const DOMINANT_CAUSES = Object.freeze({
  VALENCE:     'valence',
  AROUSAL:     'arousal',
  SUPPRESSION: 'suppression',
  COHERENCE:   'coherence',
  ENGAGEMENT:  'engagement',
  STRUCTURAL:  'structural',
});

export const DEFAULT_CONFIG = Object.freeze({
  version:         '1.0.0',
  minWindow:        4,
  slopeThreshold:   0.18,   // latent vector slope → activating
  dysregThreshold:  0.45,   // multi-axis slope → dysregulated
  collapseThreshold:0.72,   // rapid increase → collapsing
  oscillationCount: 3,      // sign flips → oscillatory
  offlineArousal:   0.92,   // arousal + freeze → offline
  windowSize:       8,      // rolling window for slope
});

// ── Slope engine (behavioral) ─────────────────────────────────────────────────

function mean(arr)  { return arr.reduce((s,v) => s+v, 0) / arr.length; }
function slope(arr) {
  // OLS slope — how fast is this axis changing?
  if (arr.length < 2) return 0;
  const n = arr.length;
  const mx = (n-1) / 2;
  const my = mean(arr);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (arr[i] - my);
    den += (i - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

function signFlips(arr) {
  let flips = 0, prev = 0;
  for (const v of arr) {
    const s = v > 0 ? 1 : v < 0 ? -1 : 0;
    if (prev !== 0 && s !== 0 && s !== prev) flips++;
    if (s !== 0) prev = s;
  }
  return flips;
}

function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }

/**
 * Classify a window of latent vectors.
 * @param {number[][]} window — array of [v,a,s,c,e] vectors, oldest first
 * @param {object} [cfg]
 * @returns {SigmaResult}
 */
export function classify(window, cfg = DEFAULT_CONFIG) {
  if (!window || window.length < cfg.minWindow) {
    return _result(REGIMES.INSUFFICIENT_DATA, null, 0, {});
  }

  // Extract per-axis histories
  const V = window.map(v => v[0] ?? 0);  // valence
  const A = window.map(v => v[1] ?? 0);  // arousal
  const S = window.map(v => v[2] ?? 0);  // suppression
  const C = window.map(v => v[3] ?? 0);  // coherence
  const E = window.map(v => v[4] ?? 0);  // engagement

  const slopes = {
    valence:     slope(V),
    arousal:     slope(A),
    suppression: slope(S),
    coherence:   slope(C),
    engagement:  slope(E),
  };

  const latestArousal = A[A.length - 1] ?? 0;
  const latestCoherence = C[C.length - 1] ?? 0;
  const arousalSlope = slopes.arousal;
  const arousalFlips = signFlips(A);

  // Feature: how many axes are simultaneously sloping high?
  const hotAxes = Object.values(slopes).filter(s => Math.abs(s) >= cfg.slopeThreshold).length;
  const maxSlope = Math.max(...Object.values(slopes).map(Math.abs));

  const features = { slopes, hotAxes, maxSlope, latestArousal, latestCoherence, arousalFlips };

  // Classification precedence
  if (latestArousal >= cfg.offlineArousal && latestCoherence < 0.2) {
    return _result(REGIMES.OFFLINE, DOMINANT_CAUSES.AROUSAL, 1.0, features);
  }
  if (maxSlope >= cfg.collapseThreshold) {
    const dom = _dominantAxis(slopes);
    return _result(REGIMES.COLLAPSING, dom, r4(Math.min(1, maxSlope / cfg.collapseThreshold)), features);
  }
  if (hotAxes >= 3 && maxSlope >= cfg.dysregThreshold) {
    return _result(REGIMES.DYSREGULATED, _dominantAxis(slopes), r4(Math.min(1, hotAxes/5)), features);
  }
  if (arousalFlips >= cfg.oscillationCount) {
    return _result(REGIMES.OSCILLATORY, DOMINANT_CAUSES.AROUSAL, r4(Math.min(1, arousalFlips/cfg.oscillationCount)), features);
  }
  if (hotAxes >= 2 && maxSlope >= cfg.slopeThreshold) {
    return _result(REGIMES.UNGROUNDED, _dominantAxis(slopes), r4(Math.min(1, maxSlope/cfg.dysregThreshold)), features);
  }
  if (arousalSlope >= cfg.slopeThreshold) {
    return _result(REGIMES.ACTIVATING, DOMINANT_CAUSES.AROUSAL, r4(Math.min(1, arousalSlope/cfg.dysregThreshold)), features);
  }
  return _result(REGIMES.STABLE, _dominantAxis(slopes), 0, features);
}

function _dominantAxis(slopes) {
  const map = {
    valence: DOMINANT_CAUSES.VALENCE, arousal: DOMINANT_CAUSES.AROUSAL,
    suppression: DOMINANT_CAUSES.SUPPRESSION, coherence: DOMINANT_CAUSES.COHERENCE,
    engagement: DOMINANT_CAUSES.ENGAGEMENT,
  };
  const max = Object.entries(slopes).reduce((a,b) => Math.abs(b[1]) > Math.abs(a[1]) ? b : a);
  return map[max[0]] ?? DOMINANT_CAUSES.AROUSAL;
}

function _result(regime, dominantCause, confidence, features) {
  return Object.freeze({ regime, dominantCause, confidence: r4(confidence), features, ts: Date.now() });
}

// ── SigmaEngine — bus-aware ───────────────────────────────────────────────────

export class SigmaEngine {
  constructor({ bus, config = DEFAULT_CONFIG } = {}) {
    if (!bus) throw new Error('[SigmaEngine] bus required');
    this._bus     = bus;
    this._config  = { ...DEFAULT_CONFIG, ...config };
    this._windows = new Map();  // subjectId → rolling vector window
    this._prev    = new Map();  // subjectId → last regime
    this._attach();
  }

  _attach() {
    this._bus.on('spatial.kernel.latent.update', ({ vector, subject, ts }) => {
      const id = subject ?? 'default';
      if (!this._windows.has(id)) this._windows.set(id, []);
      const win = this._windows.get(id);
      win.push(vector);
      if (win.length > this._config.windowSize) win.shift();
      if (win.length < 2) return;
      const result = classify(win, this._config);
      const prev = this._prev.get(id);
      this._bus.emit('spatial.sigma.entropy.update', { subject: id, ...result, ts });
      if (result.regime !== prev) {
        this._prev.set(id, result.regime);
        this._bus.emit('spatial.sigma.regime.changed', { subject: id, prev, next: result.regime, confidence: result.confidence, ts });
      }
    });
  }

  classify(window) { return classify(window, this._config); }
  updateConfig(partial) { this._config = { ...this._config, ...partial }; }
  getRegime(subjectId = 'default') { return this._prev.get(subjectId) ?? REGIMES.INSUFFICIENT_DATA; }
}
