'use strict';
// ═══════════════════════════════════════════════════════════════════
// VOICING + SEGMENTATION
//
// The fricative test is the one that matters. An energy-only VAD cuts
// through "s", "f" and "sh" because they are quiet — turning "this"
// into "thi" and handing Whisper a fragment it will confidently
// mis-transcribe. Zero-crossing rate is what tells a quiet consonant
// apart from a quiet gap.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const V = require('../foundation/ai/voicing.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const SR = 16000;

// A vowel: periodic, strong, low zero-crossing rate.
function vowel(ms, amp) {
  const n = Math.floor(SR * ms / 1000);
  const out = new Float32Array(n);
  const a = amp == null ? 0.3 : amp;
  for (let i = 0; i < n; i++) {
    out[i] = a * (Math.sin(2 * Math.PI * 150 * i / SR) + 0.4 * Math.sin(2 * Math.PI * 300 * i / SR));
  }
  return out;
}

// A fricative: noise-like, QUIET, high zero-crossing rate. This is the
// sound an energy-only detector throws away.
function fricative(ms, amp) {
  const n = Math.floor(SR * ms / 1000);
  const out = new Float32Array(n);
  const a = amp == null ? 0.012 : amp;
  for (let i = 0; i < n; i++) out[i] = (Math.random() * 2 - 1) * a;
  return out;
}

function silence(ms) {
  return new Float32Array(Math.floor(SR * ms / 1000));
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

console.log('\nVOICING + SEGMENTATION\n');

// ── Frame features ─────────────────────────────────────────────────

t('zero-crossing rate separates a vowel from a fricative', () => {
  const v = vowel(100), f = fricative(100);
  const zv = V.frameZcr(v, 0, v.length);
  const zf = V.frameZcr(f, 0, f.length);
  assert.ok(zf > zv * 3, 'fricative ZCR ' + zf.toFixed(3) + ' vs vowel ' + zv.toFixed(3));
});

t('classifies a strong periodic sound as voiced', () => {
  const v = vowel(50);
  assert.strictEqual(V.classifyFrame(V.frameRms(v, 0, v.length), V.frameZcr(v, 0, v.length)), V.VOICED);
});

t('THE FRICATIVE TEST: a quiet noisy sound is UNVOICED, not silence', () => {
  const f = fricative(50);
  const state = V.classifyFrame(V.frameRms(f, 0, f.length), V.frameZcr(f, 0, f.length));
  assert.strictEqual(state, V.UNVOICED,
    'an energy-only detector calls this silence and cuts the consonant out of the word');
});

t('true silence is classified as silence', () => {
  const s = silence(50);
  assert.strictEqual(V.classifyFrame(V.frameRms(s, 0, s.length), V.frameZcr(s, 0, s.length)), V.SILENCE);
});

// ── Track ──────────────────────────────────────────────────────────

t('analyses a whole recording into frames', () => {
  const track = V.analyse(concat(vowel(500), silence(500), vowel(500)), { sampleRate: SR });
  assert.ok(track.frames.length > 50);
  assert.ok(track.frames.every(f => f.state));
});

t('smoothing prevents a single odd frame from splitting a word', () => {
  const v = vowel(400);
  // One 20ms dropout in the middle of continuous speech.
  const mid = Math.floor(v.length / 2);
  for (let i = mid; i < mid + SR * 0.02; i++) v[i] = 0;
  const track = V.analyse(v, { sampleRate: SR, smoothFrames: 5 });
  const silences = track.frames.filter(f => f.state === V.SILENCE).length;
  assert.ok(silences <= 1, 'a one-frame dropout must not become a pause: got ' + silences);
});

t('summarise reports how much of the audio is actually speech', () => {
  const s = V.summarise(V.analyse(concat(vowel(1000), silence(1000)), { sampleRate: SR }));
  assert.ok(Math.abs(s.speechRatio - 0.5) < 0.15, 'got ' + s.speechRatio);
});

// ── Pauses ─────────────────────────────────────────────────────────

t('finds a real pause between phrases', () => {
  const track = V.analyse(concat(vowel(800), silence(800), vowel(800)), { sampleRate: SR });
  const pauses = V.findPauses(track, { minPauseMs: 350 });
  assert.strictEqual(pauses.length, 1);
  assert.ok(pauses[0].durationMs > 600);
});

t('a short gap is NOT a pause — that is a breath or a stop consonant', () => {
  const track = V.analyse(concat(vowel(600), silence(120), vowel(600)), { sampleRate: SR });
  assert.strictEqual(V.findPauses(track, { minPauseMs: 350 }).length, 0);
});

t('the cut point is the MIDDLE of a pause, not its edge', () => {
  const track = V.analyse(concat(vowel(500), silence(1000), vowel(500)), { sampleRate: SR });
  const p = V.findPauses(track, { minPauseMs: 350 })[0];
  assert.ok(p.cutMs > p.startMs + 300 && p.cutMs < p.endMs - 300, 'cut at ' + p.cutMs);
});

// ── Segmentation ───────────────────────────────────────────────────

t('short audio is a single segment', () => {
  const r = V.segment(concat(vowel(3000), silence(500), vowel(3000)), { sampleRate: SR });
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].clean, true);
});

t('THE CUT TEST: long audio is split AT a pause, not on the clock', () => {
  // 40 seconds of speech with one clear pause at 20s.
  const audio = concat(vowel(20000), silence(900), vowel(19000));
  const r = V.segment(audio, { sampleRate: SR, maxSegmentMs: 28000, minSegmentMs: 2000 });
  assert.ok(r.segments.length >= 2);
  const first = r.segments[0];
  assert.strictEqual(first.cutAt, 'pause', 'must cut at the pause, not at 28s');
  assert.ok(Math.abs(first.endMs - 20450) < 1200, 'cut landed at ' + first.endMs);
});

t('unbroken speech past the maximum is cut on the clock AND FLAGGED', () => {
  // No pause anywhere. Something must give — but it must be visible.
  const r = V.segment(vowel(40000), { sampleRate: SR, maxSegmentMs: 28000 });
  assert.ok(r.forcedCuts >= 1, 'a forced cut must be counted');
  assert.ok(r.segments.some(s => s.cutAt === 'forced-clock' && s.clean === false),
    'a cut that may have split a word must not be reported as clean');
});

t('segments carry padding so a cut does not clip the next word', () => {
  const audio = concat(vowel(20000), silence(900), vowel(19000));
  const r = V.segment(audio, { sampleRate: SR, padMs: 200 });
  assert.ok(r.segments[1].startMs < r.segments[0].endMs, 'segments must overlap slightly');
});

t('no segment exceeds the Whisper window', () => {
  const r = V.segment(vowel(90000), { sampleRate: SR, maxSegmentMs: 28000 });
  for (const s of r.segments) {
    assert.ok(s.durationMs <= 28000 + 500, 'segment of ' + s.durationMs + 'ms exceeds the window');
  }
});

t('segments cover the audio with no gap between them', () => {
  const audio = concat(vowel(20000), silence(900), vowel(20000), silence(900), vowel(15000));
  const r = V.segment(audio, { sampleRate: SR });
  for (let i = 1; i < r.segments.length; i++) {
    assert.ok(r.segments[i].startMs <= r.segments[i - 1].endMs,
      'gap between segment ' + (i - 1) + ' and ' + i + ' — audio would be lost');
  }
});

t('a silent recording still segments without throwing', () => {
  const r = V.segment(silence(40000), { sampleRate: SR });
  assert.ok(r.segments.length >= 1);
});

const fails = results.filter(r => !r.ok);
console.log('\nvoicing: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
