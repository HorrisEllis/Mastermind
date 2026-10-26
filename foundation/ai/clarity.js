// ═══════════════════════════════════════════════════════════════════
// CLARITY
// foundation/ai/clarity.js
//
// Audio conditioning for transcription. Pure — Float32 in, Float32 out,
// no Web Audio, no DOM, so every stage is testable headless.
//
// ─────────────────────────────────────────────────────────────────
// THE PRINCIPLE: MEASURE, THEN CORRECT ONLY WHAT HELPS
//
// Whisper was trained on ~680,000 hours of unprocessed, messy, real
// world audio. It is ALREADY robust to background noise, room tone,
// accents and bad microphones. That fact decides what belongs here.
//
// Anything that moves audio further from natural recorded speech makes
// it LESS like the training distribution, not more. So this module is
// deliberately conservative: it fixes things that are objectively
// wrong (DC offset, wrong sample rate, inaudible level, sub-speech
// rumble) and refuses to "enhance" things that are merely imperfect.
//
// ─────────────────────────────────────────────────────────────────
// WHAT IS DELIBERATELY NOT HERE, AND WHY
//
// SPECTRAL DENOISING — removes hiss and leaves musical artifacts:
//   warbling partials that exist in no natural recording. Whisper has
//   heard hiss a million times; it has never heard spectral-subtraction
//   birdies. Trading a known-tolerable defect for an unknown one is a
//   bad trade.
//
// EQ / TONE SHAPING — a "presence boost" makes speech clearer to a
//   HUMAN ear. Whisper does not have ears; it has a log-mel spectrogram
//   and learned statistics over natural speech. Reshaping the spectrum
//   moves it off that distribution.
//
// TIME-STRETCHING / SLOWING DOWN — this one is worth stating plainly
//   because it sounds so plausible. It does not help. Whisper's encoder
//   consumes fixed 30-second windows at 16 kHz with learned positional
//   structure over natural speech rates; it was trained on fast talkers,
//   slow talkers and everything between. Stretching introduces phase
//   artifacts and transient smearing, and produces a speech rate that is
//   rarer in training than the original. Slower audio is easier for
//   PEOPLE and harder for the model.
//
// PER-FRAME AGC / COMPRESSION — flattens the energy envelope, which is
//   the same envelope the lattice's own friction and cadence detection
//   reads. It would improve nothing and damage a downstream signal.
//
// If the audio is genuinely too poor, the honest response is to SAY SO
// — which is what `assess()` is for — not to process it until it sounds
// better while transcribing worse.
//
// UUID: 4a3b2c1d-ai-8000-8000-clarity00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.Clarity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Whisper's native input. Feeding it anything else means SOMETHING
  // resamples — and an unknown resampler is worse than a known one.
  const TARGET_RATE = 16000;

  const DEFAULTS = {
    targetRate: TARGET_RATE,
    highPassHz: 70,        // below the lowest human F0; rumble only
    targetRms: 0.08,       // ≈ -22 dBFS. Loud enough, far from clipping.
    peakCeiling: 0.95,     // never normalise into the clip zone
    maxGain: 12,           // refuse to amplify pure noise floor
    clipThreshold: 0.995,
    silenceRms: 0.002,
  };

  // ── Measurement ────────────────────────────────────────────────────

  function rms(x, from, to) {
    const a = from || 0, b = to == null ? x.length : to;
    if (b <= a) return 0;
    let s = 0;
    for (let i = a; i < b; i++) s += x[i] * x[i];
    return Math.sqrt(s / (b - a));
  }

  function peak(x) {
    let p = 0;
    for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]); if (v > p) p = v; }
    return p;
  }

  function dcOffset(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i];
    return s / x.length;
  }

  // Consecutive samples at full scale. A single sample touching 1.0 is
  // chance; a run of them is a waveform that was cut off, and no amount
  // of processing puts back what the converter discarded.
  function clipStats(x, threshold) {
    const th = threshold == null ? DEFAULTS.clipThreshold : threshold;
    let clipped = 0, runs = 0, longest = 0, run = 0;
    for (let i = 0; i < x.length; i++) {
      if (Math.abs(x[i]) >= th) {
        clipped++; run++;
        if (run > longest) longest = run;
      } else {
        if (run >= 3) runs++;
        run = 0;
      }
    }
    if (run >= 3) runs++;
    return { samples: clipped, ratio: clipped / x.length, runs, longestRun: longest };
  }

  // Noise floor from the quietest tenth of short windows; speech level
  // from the loudest quarter. Crude but robust, and honest about being
  // an estimate rather than a measured SNR.
  function estimateSnrDb(x, sampleRate) {
    const win = Math.max(256, Math.floor((sampleRate || TARGET_RATE) * 0.02));
    const levels = [];
    for (let i = 0; i + win <= x.length; i += win) levels.push(rms(x, i, i + win));
    if (levels.length < 10) return null;
    levels.sort((a, b) => a - b);
    const floor = levels[Math.floor(levels.length * 0.10)] || 1e-9;
    const speech = levels[Math.floor(levels.length * 0.75)] || 1e-9;
    if (floor <= 0) return null;
    return 20 * Math.log10(speech / floor);
  }

  function silenceRatio(x, sampleRate, threshold) {
    const win = Math.max(256, Math.floor((sampleRate || TARGET_RATE) * 0.02));
    const th = threshold == null ? DEFAULTS.silenceRms : threshold;
    let quiet = 0, total = 0;
    for (let i = 0; i + win <= x.length; i += win) {
      total++;
      if (rms(x, i, i + win) < th) quiet++;
    }
    return total ? quiet / total : 0;
  }

  // A source that was originally telephone-band or heavily compressed
  // has no energy above a certain point. Detecting that matters because
  // no processing can restore it — but knowing explains a poor
  // transcript instead of leaving it a mystery.
  function effectiveBandwidthHz(x, sampleRate) {
    const sr = sampleRate || TARGET_RATE;
    const n = 1024;
    if (x.length < n * 4) return null;
    // Energy in octave-ish bands via simple band-passed RMS. Not an FFT:
    // this only needs to find where energy stops, not resolve a spectrum.
    const bands = [500, 1000, 2000, 3000, 4000, 6000, 8000];
    const total = rms(x);
    if (total <= 0) return null;
    // A single biquad has a 12 dB/octave skirt, which leaks enough energy
    // from below the corner to make a low-passed signal look wideband —
    // the first version of this reported 6 kHz for audio that had been
    // brick-walled at 3.4 kHz. Cascading the zero-phase filter gives an
    // effective 48 dB/octave, steep enough to actually find the edge.
    let last = null;
    for (const f of bands) {
      if (f >= sr / 2) break;
      const corner = f * 0.9;
      let hp = highPass(x, corner, sr);
      hp = highPass(hp, corner, sr);
      const above = rms(hp);
      if (above / total > 0.03) last = f;
    }
    return last;
  }

  // ── Filters ────────────────────────────────────────────────────────
  // One-pole/two-pole biquads. Applied forward then backward so there is
  // ZERO phase distortion — a filter that shifts phase would smear the
  // transients the lattice's cadence detection depends on.

  function biquad(x, b0, b1, b2, a1, a2) {
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const xi = x[i];
      const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = xi; y2 = y1; y1 = yi;
      y[i] = yi;
    }
    return y;
  }

  function reverse(x) {
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[x.length - 1 - i];
    return y;
  }

  function filtfilt(x, coeffs) {
    const once = biquad(x, ...coeffs);
    const back = biquad(reverse(once), ...coeffs);
    return reverse(back);
  }

  function highPassCoeffs(fc, sr) {
    const w0 = 2 * Math.PI * fc / sr;
    const q = 0.707;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw = Math.cos(w0);
    const a0 = 1 + alpha;
    return [
      (1 + cosw) / 2 / a0,
      -(1 + cosw) / a0,
      (1 + cosw) / 2 / a0,
      (-2 * cosw) / a0,
      (1 - alpha) / a0,
    ];
  }

  function lowPassCoeffs(fc, sr) {
    const w0 = 2 * Math.PI * fc / sr;
    const q = 0.707;
    const alpha = Math.sin(w0) / (2 * q);
    const cosw = Math.cos(w0);
    const a0 = 1 + alpha;
    return [
      (1 - cosw) / 2 / a0,
      (1 - cosw) / a0,
      (1 - cosw) / 2 / a0,
      (-2 * cosw) / a0,
      (1 - alpha) / a0,
    ];
  }

  function highPass(x, fc, sr) {
    if (fc <= 0 || fc >= sr / 2) return x;
    return filtfilt(x, highPassCoeffs(fc, sr));
  }

  function lowPass(x, fc, sr) {
    if (fc <= 0 || fc >= sr / 2) return x;
    return filtfilt(x, lowPassCoeffs(fc, sr));
  }

  // ── Resampling ─────────────────────────────────────────────────────
  // Anti-alias FIRST, then interpolate. Downsampling without a low-pass
  // folds everything above the new Nyquist back into the speech band as
  // inharmonic garbage — the single most damaging thing a naive
  // resampler does, and it is silent.

  function resample(x, fromRate, toRate) {
    if (fromRate === toRate) return x;

    let src = x;
    if (toRate < fromRate) {
      src = lowPass(x, toRate * 0.45, fromRate);   // 0.45 leaves transition room
    }

    const ratio = fromRate / toRate;
    const outLen = Math.floor(x.length / ratio);
    const out = new Float32Array(outLen);

    // Catmull-Rom: continuous first derivative, so it does not introduce
    // the high-frequency steps that linear interpolation does.
    for (let i = 0; i < outLen; i++) {
      const pos = i * ratio;
      const i1 = Math.floor(pos);
      const f = pos - i1;
      const i0 = Math.max(0, i1 - 1);
      const i2 = Math.min(src.length - 1, i1 + 1);
      const i3 = Math.min(src.length - 1, i1 + 2);
      const p0 = src[i0], p1 = src[i1], p2 = src[i2], p3 = src[i3];
      out[i] = 0.5 * (
        2 * p1 +
        (-p0 + p2) * f +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f +
        (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f
      );
    }
    return out;
  }

  function toMono(channels) {
    if (!channels || !channels.length) return new Float32Array(0);
    if (channels.length === 1) return channels[0];
    const n = channels[0].length;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let c = 0; c < channels.length; c++) s += channels[c][i];
      out[i] = s / channels.length;
    }
    return out;
  }

  // ── Level ──────────────────────────────────────────────────────────
  // Constant gain across the whole segment. NOT compression: the energy
  // envelope is preserved exactly, because the lattice reads it.

  function normalise(x, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const level = rms(x);
    if (level <= 0) return { audio: x, gain: 1, reason: 'SILENT' };

    let gain = o.targetRms / level;
    let limited = null;

    if (gain > o.maxGain) {
      // Amplifying a near-silent recording amplifies its noise floor by
      // exactly as much. The ratio does not improve; only the volume.
      gain = o.maxGain;
      limited = 'MAX_GAIN';
    }

    const p = peak(x);
    if (p * gain > o.peakCeiling) {
      gain = o.peakCeiling / p;
      limited = 'PEAK_CEILING';
    }

    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] * gain;
    return { audio: out, gain, limited };
  }

  function removeDc(x) {
    const dc = dcOffset(x);
    if (Math.abs(dc) < 1e-5) return { audio: x, removed: dc };
    const out = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) out[i] = x[i] - dc;
    return { audio: out, removed: dc };
  }

  // ── Assessment ─────────────────────────────────────────────────────
  // Runs BEFORE any processing, so the report describes the recording
  // rather than the result. This is the "auto-adjust" that is actually
  // worth having: it tells you which recordings will transcribe badly,
  // and why, so the next one can be better.

  function assess(x, sampleRate, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const sr = sampleRate || TARGET_RATE;

    const level = rms(x);
    const p = peak(x);
    const dc = dcOffset(x);
    const clip = clipStats(x, o.clipThreshold);
    const snr = estimateSnrDb(x, sr);
    const silence = silenceRatio(x, sr, o.silenceRms);
    const bandwidth = effectiveBandwidthHz(x, sr);

    const issues = [];

    if (clip.runs > 0) {
      issues.push({
        code: 'CLIPPED',
        severity: clip.ratio > 0.01 ? 'high' : 'medium',
        detail: clip.runs + ' clipped run(s), ' + (clip.ratio * 100).toFixed(2) + '% of samples. ' +
                'The waveform was cut off at the converter — this cannot be repaired, only avoided. ' +
                'Lower the input gain by ' + (clip.ratio > 0.01 ? '10\u201312' : '4\u20136') + ' dB next time.',
      });
    }
    if (level < 0.01) {
      issues.push({
        code: 'TOO_QUIET',
        severity: level < 0.003 ? 'high' : 'medium',
        detail: 'Signal level is ' + (20 * Math.log10(Math.max(level, 1e-9))).toFixed(1) + ' dBFS. ' +
                'Gain will be applied, but amplifying a quiet recording amplifies its noise equally.',
      });
    }
    if (snr != null && snr < 10) {
      issues.push({
        code: 'LOW_SNR',
        severity: snr < 6 ? 'high' : 'medium',
        detail: 'Estimated speech-to-background ratio is ' + snr.toFixed(1) + ' dB. ' +
                'Expect missed words. Denoising is NOT applied here because it damages transcription ' +
                'more than the noise does \u2014 moving the microphone closer is the real fix.',
      });
    }
    if (Math.abs(dc) > 0.01) {
      issues.push({
        code: 'DC_OFFSET',
        severity: 'low',
        detail: 'DC offset of ' + dc.toFixed(4) + ' \u2014 removed. Usually a soundcard or driver fault.',
      });
    }
    if (bandwidth != null && bandwidth <= 4000) {
      issues.push({
        code: 'NARROW_BAND',
        severity: 'medium',
        detail: 'No usable energy above ~' + bandwidth + ' Hz. This is telephone-grade or heavily ' +
                'compressed audio. Consonants live above 4 kHz, so expect them to be guessed. ' +
                'Nothing can restore what was never recorded.',
      });
    }
    if (silence > 0.9) {
      issues.push({
        code: 'MOSTLY_SILENT',
        severity: 'medium',
        detail: (silence * 100).toFixed(0) + '% of this audio is below the speech floor.',
      });
    }
    if (sr < 16000) {
      issues.push({
        code: 'LOW_SAMPLE_RATE',
        severity: 'medium',
        detail: 'Recorded at ' + sr + ' Hz. Whisper works at 16 kHz; upsampling adds no information.',
      });
    }

    const worst = issues.reduce((w, i) =>
      i.severity === 'high' ? 'high' : (w === 'high' ? 'high' : i.severity), 'none');

    return {
      sampleRate: sr,
      durationMs: Math.round(x.length / sr * 1000),
      rms: level,
      peak: p,
      dcOffset: dc,
      clipping: clip,
      snrDb: snr,
      silenceRatio: silence,
      effectiveBandwidthHz: bandwidth,
      issues,
      severity: worst,
      // Not a prediction of accuracy — a flag that something measurable
      // is wrong with the recording.
      likelyDegraded: issues.some(i => i.severity === 'high'),
    };
  }

  // ── The pipeline ───────────────────────────────────────────────────
  // Order matters. DC first (it biases every later measurement), then
  // high-pass, then resample (anti-aliased), then level last so the
  // final peak is known.

  function prepare(input, sampleRate, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const sr = sampleRate || TARGET_RATE;

    const mono = Array.isArray(input) ? toMono(input) : input;
    const before = assess(mono, sr, o);

    const applied = [];

    const dcResult = removeDc(mono);
    if (dcResult.removed && Math.abs(dcResult.removed) >= 1e-5) {
      applied.push({ stage: 'dc', removed: dcResult.removed });
    }

    let audio = highPass(dcResult.audio, o.highPassHz, sr);
    applied.push({ stage: 'highpass', hz: o.highPassHz, why: 'below human F0 \u2014 rumble and handling noise only' });

    if (sr !== o.targetRate) {
      audio = resample(audio, sr, o.targetRate);
      applied.push({
        stage: 'resample', from: sr, to: o.targetRate,
        why: o.targetRate < sr ? 'anti-aliased before decimation' : 'Whisper native rate',
      });
    }

    const norm = normalise(audio, o);
    audio = norm.audio;
    applied.push({ stage: 'normalise', gain: norm.gain, limitedBy: norm.limited || null });

    return {
      audio,
      sampleRate: o.targetRate,
      before,
      after: assess(audio, o.targetRate, o),
      applied,
      refused: REFUSED,
    };
  }

  // Stated in the output, every time. If a stage is ever added, this
  // list is where the argument for it has to be made.
  const REFUSED = Object.freeze([
    { stage: 'denoise',      why: 'spectral subtraction leaves artifacts the model has never heard; noise it has' },
    { stage: 'eq',           why: 'clarity for human ears moves the spectrum off the training distribution' },
    { stage: 'timestretch',  why: 'slower speech is easier for people and no easier for Whisper; stretching smears transients' },
    { stage: 'compression',  why: 'flattens the energy envelope the lattice reads for cadence and friction' },
  ]);

  return {
    TARGET_RATE, DEFAULTS, REFUSED,
    rms, peak, dcOffset, clipStats, estimateSnrDb, silenceRatio, effectiveBandwidthHz,
    highPass, lowPass, resample, toMono, normalise, removeDc,
    assess, prepare,
  };
});
