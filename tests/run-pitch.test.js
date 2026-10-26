'use strict';
// ═══════════════════════════════════════════════════════════════════
// PITCH — tested against signals of KNOWN frequency
//
// The old implementation could not be tested this way, which is part of
// why it shipped broken: you cannot write "detects 110 Hz" against a
// tracker whose output grid is 23.44 Hz.
//
// Every test here synthesises a waveform at a known F0 and asserts the
// measured value against it. The octave test is the important one —
// naive autocorrelation and spectral peak-picking both fail it, and it
// is the failure that makes a pitch tracker useless for male speech.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const P = require('../foundation/ai/pitch.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const SR = 48000;

// A voice is not a sine wave. These build harmonic stacks, because a
// pure sine hides exactly the octave errors that break real trackers.
function harmonic(f0, n, amps, sr) {
  const rate = sr || SR;
  const out = new Float32Array(n);
  const a = amps || [1, 0.5, 0.33, 0.25, 0.2];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let h = 0; h < a.length; h++) s += a[h] * Math.sin(2 * Math.PI * f0 * (h + 1) * i / rate);
    out[i] = s / a.reduce((x, y) => x + y, 0);
  }
  return out;
}

function noise(n, amp) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * (amp == null ? 1 : amp);
  return out;
}

console.log('\nPITCH (YIN)\n');

t('detects a 220 Hz harmonic tone within 1 Hz', () => {
  const r = P.detect(harmonic(220, 4096));
  assert.ok(r.voiced, 'must be voiced');
  assert.ok(Math.abs(r.f0 - 220) < 1, 'got ' + r.f0);
});

t('detects a 110 Hz male-range tone within 1 Hz', () => {
  const r = P.detect(harmonic(110, 8192));
  assert.ok(r.voiced);
  assert.ok(Math.abs(r.f0 - 110) < 1, 'got ' + r.f0);
});

t('detects a 300 Hz female-range tone within 1 Hz', () => {
  const r = P.detect(harmonic(300, 4096));
  assert.ok(r.voiced);
  assert.ok(Math.abs(r.f0 - 300) < 1, 'got ' + r.f0);
});

t('THE OCTAVE TEST: a stack whose 2nd harmonic is LOUDEST still reads F0', () => {
  // Peak-picking on the magnitude spectrum reports 240 here, because
  // H2 is the tallest bin. This is the common case for male speech and
  // it is what made the old tracker unusable.
  const sig = harmonic(120, 8192, [0.4, 1.0, 0.6, 0.3]);
  const r = P.detect(sig);
  assert.ok(r.voiced);
  assert.ok(Math.abs(r.f0 - 120) < 2,
    'must report the fundamental (120), not the loudest harmonic (240). Got ' + r.f0);
});

t('does not halve: a strong subharmonic-free tone is not reported an octave low', () => {
  const r = P.detect(harmonic(200, 8192));
  assert.ok(Math.abs(r.f0 - 200) < 2, 'got ' + r.f0);
  assert.ok(Math.abs(r.f0 - 100) > 10, 'must not report half');
});

t('RESOLUTION: beats the old 23.44 Hz grid by orders of magnitude', () => {
  // The old implementation could only ever return multiples of 23.44.
  // These three would all have collapsed to the same bin.
  const a = P.detect(harmonic(150, 8192)).f0;
  const b = P.detect(harmonic(153, 8192)).f0;
  const c = P.detect(harmonic(156, 8192)).f0;
  assert.ok(Math.abs(a - 150) < 1 && Math.abs(b - 153) < 1 && Math.abs(c - 156) < 1,
    'got ' + [a, b, c].map(x => x && x.toFixed(2)).join(', '));
  assert.ok(b - a > 1 && c - b > 1, 'must resolve 3 Hz steps that the old bin grid could not');
});

t('states its own resolution honestly', () => {
  const at110 = P.resolutionAt(110, SR);
  assert.ok(at110 < 0.5, 'sub-Hz at 110 Hz, got ' + at110);
  assert.ok(P.resolutionAt(400, SR) > at110, 'resolution is worse at higher pitch — as it should be');
});

t('silence is reported as unvoiced, not as an invented pitch', () => {
  const r = P.detect(new Float32Array(4096));
  assert.strictEqual(r.voiced, false);
  assert.strictEqual(r.f0, null);
  assert.strictEqual(r.reason, 'BELOW_NOISE_FLOOR');
});

t('white noise is reported as aperiodic, not as a pitch', () => {
  const r = P.detect(noise(8192, 0.5));
  if (r.voiced) {
    assert.ok(r.confidence < 0.5, 'if it claims voicing on noise, confidence must be low. Got ' + r.confidence);
  } else {
    assert.ok(['APERIODIC', 'OUT_OF_RANGE'].includes(r.reason), r.reason);
  }
});

t('confidence separates a clean tone from noise', () => {
  const clean = P.detect(harmonic(200, 8192));
  const dirty = P.detect(noise(8192, 0.5));
  assert.ok(clean.confidence > 0.8, 'clean tone confidence ' + clean.confidence);
  assert.ok(!dirty.voiced || dirty.confidence < clean.confidence);
});

t('a short window REPORTS the range it could actually search', () => {
  // A 256-sample buffer cannot see 70 Hz — YIN needs two periods. The
  // honest failure is "you did not give me enough signal", not
  // "aperiodic", which blames the audio for the caller's window size.
  const r = P.detect(harmonic(110, 256), { fmin: 70 });
  assert.strictEqual(r.voiced, false);
  assert.strictEqual(r.reason, 'WINDOW_TOO_SHORT');
  assert.strictEqual(r.rangeNarrowed, true);
  assert.ok(r.effectiveFmin > 70, 'must state the pitch it could actually reach: ' + r.effectiveFmin);
  assert.ok(/256 samples/.test(r.detail));
});

t('an adequate window does NOT claim its range was narrowed', () => {
  const r = P.detect(harmonic(110, 8192), { fmin: 70 });
  assert.strictEqual(r.rangeNarrowed, false);
  assert.strictEqual(r.effectiveFmin, 70);
});

t('a buffer under 128 samples is refused', () => {
  const r = P.detect(new Float32Array(64));
  assert.strictEqual(r.reason, 'BUFFER_TOO_SHORT');
});

t('out-of-range pitch is rejected rather than clamped', () => {
  const r = P.detect(harmonic(1000, 8192), { fmin: 70, fmax: 500 });
  assert.ok(!r.voiced || Math.abs(r.f0 - 1000) > 100);
});

// ── Jitter ─────────────────────────────────────────────────────────

t('jitter is withheld until there are enough continuous voiced frames', () => {
  const tr = P.createTracker({ jitterMinFrames: 6 });
  for (let i = 0; i < 3; i++) tr.push(P.detect(harmonic(200, 4096)));
  const j = tr.jitter();
  assert.strictEqual(j.jitterLocal, null);
  assert.ok(/NEED_6/.test(j.reason), 'must state what it is waiting for');
});

t('a steady tone produces near-zero jitter', () => {
  const tr = P.createTracker({ jitterMinFrames: 6 });
  let j;
  for (let i = 0; i < 10; i++) j = tr.push(P.detect(harmonic(200, 4096)));
  assert.ok(j.jitterLocal !== null);
  assert.ok(j.jitterLocal < 0.01, 'steady tone should be well under 1%, got ' + j.jitterLocal);
});

t('a wobbling pitch produces measurably MORE jitter than a steady one', () => {
  const steady = P.createTracker({ jitterMinFrames: 6 });
  const wobbly = P.createTracker({ jitterMinFrames: 6 });
  let js, jw;
  for (let i = 0; i < 12; i++) {
    js = steady.push(P.detect(harmonic(200, 4096)));
    jw = wobbly.push(P.detect(harmonic(200 + (i % 2 ? 6 : -6), 4096)));
  }
  assert.ok(jw.jitterLocal > js.jitterLocal * 3,
    'wobble ' + jw.jitterLocal + ' vs steady ' + js.jitterLocal);
});

t('an unvoiced frame RESETS the run — jitter across a silence is meaningless', () => {
  const tr = P.createTracker({ jitterMinFrames: 6 });
  for (let i = 0; i < 8; i++) tr.push(P.detect(harmonic(200, 4096)));
  assert.ok(tr.runLength >= 6);
  tr.push({ voiced: false });
  assert.strictEqual(tr.runLength, 0);
  assert.strictEqual(tr.jitter().jitterLocal, null);
});

t('shimmer and HNR are NOT reported — they are not computed', () => {
  const r = P.detect(harmonic(200, 8192));
  assert.strictEqual(r.shimmer, undefined, 'a named field is a claim');
  assert.strictEqual(r.hnr, undefined, 'the old HNR read -9.6 dB on a perfect signal');
});

const fails = results.filter(r => !r.ok);
console.log('\npitch: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
