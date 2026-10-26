'use strict';
// ═══════════════════════════════════════════════════════════════════
// CLARITY
//
// Every test builds a signal with a known defect and asserts the module
// finds it. The interesting ones are the refusals: this module's value
// is as much in what it declines to do as in what it does.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const C = require('../foundation/ai/clarity.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const SR = 48000;

function tone(f, n, amp, sr) {
  const rate = sr || SR, a = amp == null ? 0.3 : amp;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = a * Math.sin(2 * Math.PI * f * i / rate);
  return out;
}
function noise(n, amp) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * amp;
  return out;
}
function mix(a, b) {
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + b[i];
  return out;
}
// Speech-like: bursts of tone separated by quiet, so the SNR and
// silence estimators have something realistic to work on.
function speechLike(n, level, floor) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const burst = Math.floor(i / (SR * 0.4)) % 2 === 0;
    out[i] = (burst ? level * Math.sin(2 * Math.PI * 150 * i / SR) : 0)
           + (Math.random() * 2 - 1) * floor;
  }
  return out;
}

console.log('\nCLARITY\n');

// ── Measurement ────────────────────────────────────────────────────

t('measures RMS and peak correctly', () => {
  const x = tone(200, 4096, 0.5);
  assert.ok(Math.abs(C.peak(x) - 0.5) < 0.01);
  assert.ok(Math.abs(C.rms(x) - 0.5 / Math.SQRT2) < 0.01, 'sine RMS is amplitude/\u221a2');
});

t('detects DC offset', () => {
  const x = tone(200, 4096, 0.3);
  for (let i = 0; i < x.length; i++) x[i] += 0.12;
  assert.ok(Math.abs(C.dcOffset(x) - 0.12) < 0.005);
});

t('removes DC offset without touching the waveform shape', () => {
  const clean = tone(200, 4096, 0.3);
  const offset = new Float32Array(clean);
  for (let i = 0; i < offset.length; i++) offset[i] += 0.12;
  const fixed = C.removeDc(offset).audio;
  assert.ok(Math.abs(C.dcOffset(fixed)) < 1e-4);
  assert.ok(Math.abs(C.peak(fixed) - C.peak(clean)) < 0.01);
});

t('detects clipping as RUNS, not as single samples', () => {
  const x = tone(200, 8192, 1.4);           // driven well past full scale
  for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i]));
  const c = C.clipStats(x);
  assert.ok(c.runs > 0, 'a clipped sine must show runs');
  assert.ok(c.longestRun >= 3);
  assert.ok(c.ratio > 0.05);
});

t('a clean signal shows no clipping', () => {
  const c = C.clipStats(tone(200, 8192, 0.5));
  assert.strictEqual(c.runs, 0);
  assert.strictEqual(c.samples, 0);
});

t('estimates SNR: a clean recording scores higher than a noisy one', () => {
  const clean = speechLike(SR * 2, 0.4, 0.002);
  const dirty = speechLike(SR * 2, 0.4, 0.08);
  const sClean = C.estimateSnrDb(clean, SR);
  const sDirty = C.estimateSnrDb(dirty, SR);
  assert.ok(sClean > sDirty + 6, 'clean ' + sClean.toFixed(1) + ' vs dirty ' + sDirty.toFixed(1));
});

t('measures silence ratio', () => {
  const x = new Float32Array(SR);
  for (let i = 0; i < SR / 4; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 200 * i / SR);
  const r = C.silenceRatio(x, SR);
  assert.ok(r > 0.6 && r < 0.9, 'got ' + r);
});

// ── Filters ────────────────────────────────────────────────────────

t('high-pass removes sub-speech rumble and keeps the voice', () => {
  const rumble = tone(30, SR, 0.4);
  const voice  = tone(200, SR, 0.4);
  const out = C.highPass(mix(rumble, voice), 70, SR);
  const rumbleOnly = C.highPass(rumble, 70, SR);
  assert.ok(C.rms(rumbleOnly) < C.rms(rumble) * 0.2, '30 Hz must be strongly attenuated');
  const voiceOnly = C.highPass(voice, 70, SR);
  assert.ok(C.rms(voiceOnly) > C.rms(voice) * 0.85, '200 Hz must survive');
});

t('filtering is zero-phase — a transient does not move', () => {
  // A filter that shifts phase smears the onsets the lattice reads.
  const x = new Float32Array(4096);
  x[2048] = 1;
  const y = C.highPass(x, 70, SR);
  let peakIdx = 0, peakVal = 0;
  for (let i = 0; i < y.length; i++) {
    if (Math.abs(y[i]) > peakVal) { peakVal = Math.abs(y[i]); peakIdx = i; }
  }
  assert.ok(Math.abs(peakIdx - 2048) <= 2, 'impulse moved to ' + peakIdx);
});

// ── Resampling ─────────────────────────────────────────────────────

t('resamples to the target rate with the right output length', () => {
  const x = tone(200, SR, 0.3);
  const out = C.resample(x, SR, 16000);
  assert.ok(Math.abs(out.length - 16000) <= 2, 'got ' + out.length);
});

t('resampling preserves a speech-band tone', () => {
  const out = C.resample(tone(200, SR, 0.3), SR, 16000);
  assert.ok(Math.abs(C.rms(out) - 0.3 / Math.SQRT2) < 0.03, 'got ' + C.rms(out));
});

t('THE ALIASING TEST: content above the new Nyquist is filtered, not folded', () => {
  // A 12 kHz tone downsampled to 16 kHz without a low-pass folds back to
  // 4 kHz — inaudible as an error, right in the middle of the speech
  // band, and silent. This is the most damaging thing a naive resampler
  // does.
  const out = C.resample(tone(12000, SR, 0.5), SR, 16000);
  assert.ok(C.rms(out) < 0.05,
    'aliased energy leaked into the speech band: RMS ' + C.rms(out).toFixed(4));
});

t('same-rate resampling is a no-op', () => {
  const x = tone(200, 1024, 0.3);
  assert.strictEqual(C.resample(x, 16000, 16000), x);
});

t('downmixes stereo to mono by averaging', () => {
  const l = tone(200, 1024, 0.4), r = tone(200, 1024, 0.2);
  const m = C.toMono([l, r]);
  assert.ok(Math.abs(C.peak(m) - 0.3) < 0.01);
});

// ── Level ──────────────────────────────────────────────────────────

t('normalises a quiet signal up to the target', () => {
  const out = C.normalise(tone(200, 8192, 0.02), { targetRms: 0.08 });
  assert.ok(Math.abs(C.rms(out.audio) - 0.08) < 0.01);
  assert.ok(out.gain > 1);
});

t('normalisation NEVER pushes into clipping', () => {
  // amp 0.9 → RMS 0.636. Asking for 0.9 RMS needs gain 1.41, which would
  // put the peak at 1.27. The ceiling must catch it.
  const out = C.normalise(tone(200, 8192, 0.9), { targetRms: 0.9, peakCeiling: 0.95 });
  assert.ok(C.peak(out.audio) <= 0.951, 'peak ' + C.peak(out.audio));
  assert.strictEqual(out.limited, 'PEAK_CEILING');
});

t('a signal that is already too hot is turned DOWN, not limited', () => {
  const out = C.normalise(tone(200, 8192, 0.9), { targetRms: 0.5, peakCeiling: 0.95 });
  assert.ok(out.gain < 1, 'should attenuate');
  assert.strictEqual(out.limited, null, 'no ceiling involved when reducing gain');
});

t('refuses to amplify a near-silent recording without limit', () => {
  const out = C.normalise(tone(200, 8192, 0.0001), { targetRms: 0.08, maxGain: 12 });
  assert.strictEqual(out.limited, 'MAX_GAIN');
  assert.ok(out.gain <= 12, 'amplifying noise does not improve the ratio');
});

t('gain is CONSTANT — the energy envelope is preserved', () => {
  // If this were compression, the loud and quiet halves would converge.
  const x = new Float32Array(8192);
  for (let i = 0; i < 4096; i++) x[i] = 0.4 * Math.sin(2 * Math.PI * 200 * i / SR);
  for (let i = 4096; i < 8192; i++) x[i] = 0.1 * Math.sin(2 * Math.PI * 200 * i / SR);
  const before = C.rms(x, 0, 4096) / C.rms(x, 4096, 8192);
  const out = C.normalise(x).audio;
  const after = C.rms(out, 0, 4096) / C.rms(out, 4096, 8192);
  assert.ok(Math.abs(before - after) < 0.01, 'dynamics changed: ' + before + ' \u2192 ' + after);
});

// ── Assessment ─────────────────────────────────────────────────────

t('reports clipping with a concrete gain instruction', () => {
  const x = tone(200, SR, 1.5);
  for (let i = 0; i < x.length; i++) x[i] = Math.max(-1, Math.min(1, x[i]));
  const a = C.assess(x, SR);
  const issue = a.issues.find(i => i.code === 'CLIPPED');
  assert.ok(issue);
  assert.ok(/dB next time/.test(issue.detail), 'must say what to do, not just what is wrong');
  assert.strictEqual(a.likelyDegraded, true);
});

t('reports low SNR AND explains why denoising is not the answer', () => {
  const a = C.assess(speechLike(SR * 2, 0.15, 0.09), SR);
  const issue = a.issues.find(i => i.code === 'LOW_SNR');
  assert.ok(issue, 'should flag a noisy recording');
  assert.ok(/microphone closer/.test(issue.detail));
});

t('flags telephone-band audio as unrecoverable', () => {
  const wide = mix(tone(200, SR, 0.3), tone(6000, SR, 0.2));
  const narrow = C.lowPass(wide, 3400, SR);
  const a = C.assess(narrow, SR);
  const issue = a.issues.find(i => i.code === 'NARROW_BAND');
  assert.ok(issue, 'should detect the missing top end');
  assert.ok(/never recorded/.test(issue.detail));
});

t('a good recording produces no issues', () => {
  const a = C.assess(speechLike(SR * 2, 0.3, 0.002), SR);
  assert.strictEqual(a.severity, 'none', JSON.stringify(a.issues.map(i => i.code)));
  assert.strictEqual(a.likelyDegraded, false);
});

// ── Pipeline ───────────────────────────────────────────────────────

t('prepare() outputs 16 kHz mono at a usable level', () => {
  const r = C.prepare(tone(200, SR, 0.02), SR);
  assert.strictEqual(r.sampleRate, 16000);
  assert.ok(Math.abs(C.rms(r.audio) - 0.08) < 0.02);
});

t('prepare() reports before AND after, so the change is inspectable', () => {
  const r = C.prepare(tone(200, SR, 0.02), SR);
  assert.ok(r.before.rms < r.after.rms);
  assert.ok(r.applied.some(s => s.stage === 'resample'));
  assert.ok(r.applied.some(s => s.stage === 'normalise'));
});

t('prepare() accepts multichannel input', () => {
  const r = C.prepare([tone(200, SR, 0.3), tone(200, SR, 0.1)], SR);
  assert.strictEqual(r.sampleRate, 16000);
});

t('every applied stage states WHY', () => {
  const r = C.prepare(tone(200, SR, 0.3), SR);
  const hp = r.applied.find(s => s.stage === 'highpass');
  assert.ok(hp.why && hp.why.length > 10);
});

// ── The refusals ───────────────────────────────────────────────────

t('the refused list is reported with every result', () => {
  const r = C.prepare(tone(200, SR, 0.3), SR);
  const codes = r.refused.map(x => x.stage).sort();
  assert.deepStrictEqual(codes, ['compression', 'denoise', 'eq', 'timestretch']);
});

t('each refusal carries its reasoning, so it can be argued with', () => {
  for (const r of C.REFUSED) {
    assert.ok(r.why && r.why.length > 20, r.stage + ' has no stated reason');
  }
  const ts = C.REFUSED.find(r => r.stage === 'timestretch');
  assert.ok(/no easier for Whisper/.test(ts.why));
});

t('no denoise, eq, compress or stretch function is exported', () => {
  for (const name of ['denoise', 'eq', 'compress', 'timeStretch', 'slowDown', 'agc']) {
    assert.strictEqual(typeof C[name], 'undefined', name + ' must not exist');
  }
});

const fails = results.filter(r => !r.ok);
console.log('\nclarity: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
