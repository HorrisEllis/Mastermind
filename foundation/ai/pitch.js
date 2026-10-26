// ═══════════════════════════════════════════════════════════════════
// PITCH — YIN fundamental frequency estimation
// foundation/ai/pitch.js
//
// Replaces the spectral peak-picking in ALK's codec-v2 PitchEngine.
//
// ─────────────────────────────────────────────────────────────────
// WHY THE OLD ONE COULD NOT WORK
//
// It searched getByteFrequencyData for the loudest bin between 80 and
// 400 Hz and called that F0. Three problems, all fatal:
//
//   1. Resolution. At 48 kHz with fftSize 2048 that is 23.44 Hz per
//      bin — the entire vocal range is FIFTEEN bins. A 110 Hz voice can
//      only be reported as 93.8 or 117.2. Clinical jitter is ~1% of the
//      period, 1.1 Hz at that pitch: the grid was 21x coarser than the
//      quantity being measured, so the reported "jitter" was the
//      quantisation noise of a bin index.
//   2. Octave errors. The loudest harmonic is frequently not the
//      fundamental — for many male voices H2 dominates H1, so the
//      tracker reports double the true pitch.
//   3. Byte data. getByteFrequencyData is 8-bit and log-compressed
//      before you see it. Amplitude precision is gone.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THIS DOES INSTEAD
//
// YIN (de Cheveigné & Kawahara 2002) on the raw time-domain signal
// from getFloatTimeDomainData:
//
//   1. Difference function          d(τ) = Σ (x[i] − x[i+τ])²
//   2. Cumulative mean normalisation — this is YIN's key step; it
//      removes the zero-lag trivial minimum and suppresses the octave
//      errors that break naive autocorrelation.
//   3. Absolute threshold — first dip below 0.1, not the global
//      minimum, which is what prevents halving/doubling.
//   4. Parabolic interpolation around the chosen lag → SUB-SAMPLE
//      period resolution. This is where the accuracy comes from: at
//      48 kHz a 110 Hz period is ~436 samples, and interpolation
//      resolves fractions of one sample. Roughly 0.03 Hz, versus
//      23.44 Hz.
//
// Aperiodicity (the YIN minimum value) is returned as `confidence`,
// so downstream code can weight rather than trust blindly.
//
// ─────────────────────────────────────────────────────────────────
// WHAT IS DELIBERATELY NOT HERE
//
// No shimmer, no HNR. Both are computable from this foundation, and
// neither is computed yet, so neither is reported. The old module
// returned all three unconditionally; ALK's own §1.1 says nothing
// pretends, and a named field is a claim.
//
// Jitter IS here, because YIN gives real per-cycle periods — but it is
// returned only when there are enough consecutive voiced frames to mean
// something, and it is named `jitterLocal` after the measure it
// actually implements rather than the family it belongs to.
//
// UUID: 4a3b2c1d-ai-8000-8000-pitchyin0001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.Pitch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DEFAULTS = {
    sampleRate: 48000,
    fmin: 70,            // below typical bass male speech
    fmax: 500,           // above typical high female speech
    threshold: 0.10,     // YIN absolute threshold
    minRms: 0.005,       // below this, silence — do not invent a pitch
    jitterMinFrames: 6,  // frames of continuous voicing before jitter means anything
  };

  // ── Step 1: difference function ────────────────────────────────────
  // d(τ) = Σ (x[i] − x[i+τ])². Computed directly; the window is small
  // enough (a few thousand samples) that an FFT-based version would add
  // complexity without changing the answer.
  function differenceFunction(x, maxTau) {
    const n = x.length;
    const d = new Float32Array(maxTau + 1);
    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0;
      const lim = n - tau;
      for (let i = 0; i < lim; i++) {
        const delta = x[i] - x[i + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }
    return d;
  }

  // ── Step 2: cumulative mean normalised difference ──────────────────
  // THE step that makes YIN work. Naive autocorrelation's best match is
  // always tau=0, and its second best is often an octave out. Dividing
  // by the running mean of all shorter lags makes the true period a
  // clear dip rather than one of several similar peaks.
  function cumulativeMeanNormalized(d) {
    const out = new Float32Array(d.length);
    out[0] = 1;
    let running = 0;
    for (let tau = 1; tau < d.length; tau++) {
      running += d[tau];
      out[tau] = running === 0 ? 1 : d[tau] * tau / running;
    }
    return out;
  }

  // ── Step 3: absolute threshold ─────────────────────────────────────
  // The FIRST dip below threshold, not the smallest. Taking the global
  // minimum is precisely how a tracker ends up an octave low.
  function absoluteThreshold(cmnd, minTau, maxTau, threshold) {
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (cmnd[tau] < threshold) {
        // descend to the local bottom of this dip
        while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
        return tau;
      }
    }
    // Nothing crossed the threshold: fall back to the best available,
    // and let the caller see the poor confidence value.
    let best = minTau, bestVal = Infinity;
    for (let tau = minTau; tau <= maxTau; tau++) {
      if (cmnd[tau] < bestVal) { bestVal = cmnd[tau]; best = tau; }
    }
    return bestVal < 1 ? best : -1;
  }

  // ── Step 4: parabolic interpolation ────────────────────────────────
  // Fits a parabola through the minimum and its neighbours to find the
  // true bottom between samples. This is where sub-sample — and so
  // sub-Hz — resolution comes from.
  function parabolicInterpolation(cmnd, tau) {
    const x0 = tau > 0 ? tau - 1 : tau;
    const x2 = tau + 1 < cmnd.length ? tau + 1 : tau;
    if (x0 === tau) return cmnd[tau] <= cmnd[x2] ? tau : x2;
    if (x2 === tau) return cmnd[tau] <= cmnd[x0] ? tau : x0;
    const s0 = cmnd[x0], s1 = cmnd[tau], s2 = cmnd[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom === 0) return tau;
    return tau + (s2 - s0) / denom;
  }

  function rms(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / x.length);
  }

  // ── One frame ──────────────────────────────────────────────────────
  // `samples` is Float32 in [-1, 1] — getFloatTimeDomainData, not
  // getByteFrequencyData.
  function detect(samples, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const sr = o.sampleRate;

    if (!samples || samples.length < 128) {
      return { voiced: false, f0: null, confidence: 0, reason: 'BUFFER_TOO_SHORT' };
    }

    const level = rms(samples);
    if (level < o.minRms) {
      return { voiced: false, f0: null, confidence: 0, rms: level, reason: 'BELOW_NOISE_FLOOR' };
    }

    const minTau = Math.floor(sr / o.fmax);
    const wantTau = Math.floor(sr / o.fmin);
    const canTau  = Math.floor(samples.length / 2) - 1;
    const maxTau  = Math.min(wantTau, canTau);

    // The buffer can silently narrow the search range: YIN needs at least
    // two periods, so a short window simply cannot see low pitches. The old
    // code would clamp and say nothing, which means a 110 Hz voice in a
    // 256-sample window comes back "aperiodic" when the truth is "you did
    // not give me enough signal to look". Report the range actually
    // searched (§1.1).
    const rangeNarrowed = canTau < wantTau;
    const effectiveFmin = rangeNarrowed ? sr / canTau : o.fmin;

    if (maxTau <= minTau) {
      // A window shorter than two periods of the lowest pitch cannot
      // resolve that pitch. Say so rather than returning a number.
      return {
        voiced: false, f0: null, confidence: 0, rms: level,
        reason: 'WINDOW_TOO_SHORT',
        detail: 'Need at least ' + (2 * Math.floor(sr / o.fmin)) + ' samples to resolve ' + o.fmin + ' Hz',
      };
    }

    const d = differenceFunction(samples, maxTau);
    const cmnd = cumulativeMeanNormalized(d);
    const tau = absoluteThreshold(cmnd, minTau, maxTau, o.threshold);

    if (tau < 0) {
      return {
        voiced: false, f0: null, confidence: 0, rms: level,
        reason: rangeNarrowed ? 'WINDOW_TOO_SHORT' : 'APERIODIC',
        rangeNarrowed,
        effectiveFmin,
        detail: rangeNarrowed
          ? 'Buffer of ' + samples.length + ' samples can only resolve down to ' +
            effectiveFmin.toFixed(1) + ' Hz, not the requested ' + o.fmin + ' Hz'
          : undefined,
      };
    }

    const refined = parabolicInterpolation(cmnd, tau);
    const f0 = sr / refined;
    const aperiodicity = Math.max(0, Math.min(1, cmnd[tau]));

    if (f0 < o.fmin || f0 > o.fmax) {
      return { voiced: false, f0: null, confidence: 0, rms: level, reason: 'OUT_OF_RANGE' };
    }

    return {
      voiced: true,
      f0,
      periodSamples: refined,
      confidence: 1 - aperiodicity,   // YIN minimum: low = strongly periodic
      aperiodicity,
      rms: level,
      rangeNarrowed,
      effectiveFmin,
    };
  }

  // ── Tracker: jitter across consecutive voiced frames ───────────────
  // Local jitter = mean absolute difference between consecutive periods,
  // divided by the mean period. This is the standard "local jitter"
  // definition and it is only meaningful over continuous voicing, so
  // the run resets the moment voicing breaks.
  function createTracker(opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    let periods = [];

    return {
      push(result) {
        if (!result || !result.voiced) { periods = []; return null; }
        periods.push(result.periodSamples);
        if (periods.length > 32) periods.shift();
        return this.jitter();
      },

      jitter() {
        if (periods.length < o.jitterMinFrames) {
          return {
            jitterLocal: null,
            frames: periods.length,
            reason: 'NEED_' + o.jitterMinFrames + '_CONTINUOUS_VOICED_FRAMES',
          };
        }
        let absDiff = 0;
        for (let i = 1; i < periods.length; i++) absDiff += Math.abs(periods[i] - periods[i - 1]);
        const meanDiff = absDiff / (periods.length - 1);
        const meanPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
        return {
          jitterLocal: meanPeriod > 0 ? meanDiff / meanPeriod : null,
          frames: periods.length,
          meanPeriodSamples: meanPeriod,
        };
      },

      reset() { periods = []; },
      get runLength() { return periods.length; },
    };
  }

  // Resolution of this method at a given pitch — used to state limits
  // rather than imply precision that is not there.
  function resolutionAt(f0Hz, sampleRate) {
    const sr = sampleRate || DEFAULTS.sampleRate;
    const period = sr / f0Hz;
    // Parabolic interpolation resolves roughly 0.1 of a sample.
    const dPeriod = 0.1;
    return Math.abs(sr / (period + dPeriod) - sr / period);
  }

  return {
    DEFAULTS,
    detect, createTracker, resolutionAt,
    differenceFunction, cumulativeMeanNormalized, absoluteThreshold, parabolicInterpolation, rms,
  };
});
