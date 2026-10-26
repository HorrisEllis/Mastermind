'use strict';
const assert = require('assert');
const path = require('path');
const RecallCore = require(path.join(__dirname, '..', 'modules', 'voice-lattice', 'recall.js'));

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nROLLING RECALL — pure logic\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try {
      fn();
      console.log('  \u2713 ' + name);
      pass++;
    } catch (e) {
      console.log('  \u2717 ' + name);
      console.log('      ' + e.message);
    }
  }
  console.log('\nrecall: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// ── recallPrune ───────────────────────────────────────────────────

t('recallPrune drops chunks older than the trailing window', () => {
  const now = 100000;
  const chunks = [{ ts: now - 20000 }, { ts: now - 5000 }, { ts: now - 1000 }];
  const out = RecallCore.recallPrune(chunks, now, 10000);
  assert.strictEqual(out.length, 2);
  assert.deepStrictEqual(out.map(c => c.ts), [now - 5000, now - 1000]);
});

t('recallPrune keeps everything when nothing is old enough', () => {
  const now = 100000;
  const chunks = [{ ts: now - 500 }, { ts: now - 200 }];
  const out = RecallCore.recallPrune(chunks, now, 10000);
  assert.strictEqual(out.length, 2);
});

t('recallPrune on an empty list returns an empty list, not an error', () => {
  assert.deepStrictEqual(RecallCore.recallPrune([], 100000, 10000), []);
});

// ── recallSelectSegment (the anti-clipping step) ─────────────────

t('recallSelectSegment reaches backward by prerollMs before onset', () => {
  const chunks = [
    { ts: 1000 }, { ts: 2000 }, { ts: 3000 }, { ts: 4000 }, { ts: 5000 }, { ts: 6000 },
  ];
  // onset at 4000, preroll 2000 -> should include from ts=2000 onward
  const out = RecallCore.recallSelectSegment(chunks, 4000, 2000, 5000);
  assert.deepStrictEqual(out.map(c => c.ts), [2000, 3000, 4000, 5000]);
});

t('recallSelectSegment excludes anything after endTs', () => {
  const chunks = [{ ts: 1000 }, { ts: 2000 }, { ts: 3000 }, { ts: 4000 }];
  const out = RecallCore.recallSelectSegment(chunks, 2000, 0, 2500);
  assert.deepStrictEqual(out.map(c => c.ts), [2000]);
});

t('recallSelectSegment with a preroll larger than available history just returns what exists', () => {
  const chunks = [{ ts: 5000 }, { ts: 6000 }];
  const out = RecallCore.recallSelectSegment(chunks, 5500, 100000, 6000);
  assert.strictEqual(out.length, 2);
});

// ── RecallVAD (hysteresis) ─────────────────────────────────────────

t('RecallVAD: speech onset fires "start" the first time RMS crosses the threshold', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02 });
  assert.strictEqual(vad.push(0.001, 0), null);
  assert.strictEqual(vad.push(0.05, 100), 'start');
});

t('RecallVAD: a brief dip below threshold (a breath) does NOT end the segment — this is the whole point of hysteresis', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 1000 });
  vad.push(0.05, 0); // start
  assert.strictEqual(vad.push(0.001, 100), null);
  assert.strictEqual(vad.push(0.05, 300), null, 'speech resumed before the hold time — must not have ended');
  assert.strictEqual(vad.state, 'speaking');
});

t('RecallVAD: sustained silence past silenceHoldMs fires "end"', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 1000 });
  vad.push(0.05, 0); // start
  assert.strictEqual(vad.push(0.001, 100), null); // quiet begins
  assert.strictEqual(vad.push(0.001, 1200), 'end'); // 1100ms of quiet — past the hold
});

t('RecallVAD: releaseRatio means a QUIET-ish but not silent level still counts as speech (no flicker)', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 1000 });
  vad.push(0.05, 0); // start
  // 0.014 is above threshold*releaseRatio (0.012) — still "speaking" territory
  assert.strictEqual(vad.push(0.014, 100), null);
  assert.strictEqual(vad.state, 'speaking');
});

t('RecallVAD: reset() returns to idle and forgets prior onset/quiet timing', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02 });
  vad.push(0.05, 0);
  assert.strictEqual(vad.state, 'speaking');
  vad.reset();
  assert.strictEqual(vad.state, 'idle');
  assert.strictEqual(vad.onsetTs, null);
});

t('RecallVAD: onsetTs is recorded at the exact moment speech starts, for recallSelectSegment to use', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02 });
  vad.push(0.05, 4242);
  assert.strictEqual(vad.onsetTs, 4242);
});

// ── Fricative rescue — the actual "sensitive mic" fix ────────────────
// s/f/sh/th are quiet (low RMS) but noisy (high ZCR). Without ZCR
// awareness, a fricative mid-word looks identical to real silence to
// an RMS-only VAD, and can end the segment mid-consonant.

t('WITHOUT zcr: a quiet-but-noisy frame is indistinguishable from real silence (the bug this fixes)', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 500 });
  vad.push(0.05, 0); // start
  // A fricative-shaped frame (low RMS) with NO zcr argument passed —
  // old behavior, unchanged: this reads as silence starting.
  assert.strictEqual(vad.push(0.005, 100), null); // below release threshold, silence timer starts
  assert.strictEqual(vad.push(0.005, 650), 'end', 'without zcr, a quiet frame past the hold time ends the segment — this is the exact failure voicing.js documents');
});

t('WITH zcr: the SAME quiet frame, now flagged as a fricative (high zcr, low db), keeps the segment alive', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 500 });
  vad.push(0.05, 0); // start
  // Same low RMS as the test above, but with a high zcr (0.3, above the
  // 0.15 default fricativeZcr threshold) and a db comfortably below
  // fricativeDb (-42) — this is what an "s" or "f" sound looks like.
  assert.strictEqual(vad.push(0.005, 100, 0.3), null);
  assert.strictEqual(vad.push(0.005, 650, 0.3), null, 'a sustained fricative must not be read as silence — the segment must still be open');
  assert.strictEqual(vad.state, 'speaking');
});

t('a fricative-shaped frame can also START a segment, not just extend one', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02 });
  // RMS alone (0.005) is well under the 0.02 threshold — would never
  // trigger 'start' on its own — but a real "s" beginning an utterance
  // is exactly this shape, and missing the onset clips the first sound.
  assert.strictEqual(vad.push(0.005, 0, 0.3), 'start');
});

t('a genuinely LOUD-and-noisy frame (not actually a fricative — db too high) is not misclassified', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 500 });
  vad.push(0.05, 0);
  // High zcr but ALSO high rms (loud) — fricativeDb (-42dB) guards
  // against treating loud noisy speech as a "fricative rescue" case;
  // it doesn't need rescuing, it's already well above the threshold.
  assert.strictEqual(vad.push(0.05, 100, 0.3), null); // still just normal "above threshold" speech, not a special case
});

t('a quiet, SMOOTH frame (low zcr — genuine silence, not a fricative) still ends the segment normally', () => {
  const vad = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 500 });
  vad.push(0.05, 0);
  assert.strictEqual(vad.push(0.005, 100, 0.02), null); // low zcr — not a fricative
  assert.strictEqual(vad.push(0.005, 650, 0.02), 'end', 'low rms AND low zcr is genuine silence — must still end normally');
});

t('backward compatibility: omitting zcr entirely behaves identically to before this fix existed', () => {
  const withZcrUndefined = new RecallCore.RecallVAD({ threshold: 0.02, releaseRatio: 0.6, silenceHoldMs: 500 });
  withZcrUndefined.push(0.05, 0);
  assert.strictEqual(withZcrUndefined.push(0.005, 100), null);
  assert.strictEqual(withZcrUndefined.push(0.005, 650), 'end');
});

// ── zcr() — the pure ZCR helper ──────────────────────────────────

t('zcr of a smooth constant signal (no sign changes) is 0', () => {
  const smooth = new Float32Array(100).fill(0.5);
  assert.strictEqual(RecallCore.zcr(smooth), 0);
});
t('zcr of a signal alternating every sample is 1 (maximum crossing rate)', () => {
  const alt = new Float32Array(100);
  for (let i = 0; i < alt.length; i++) alt[i] = i % 2 === 0 ? 1 : -1;
  assert.strictEqual(RecallCore.zcr(alt), 1);
});
t('zcr never throws on very short input', () => {
  assert.doesNotThrow(() => RecallCore.zcr(new Float32Array([0.1])));
  assert.doesNotThrow(() => RecallCore.zcr(new Float32Array([])));
});

// ── rms ──────────────────────────────────────────────────────────

t('rms of silence is (near) zero', () => {
  const silence = new Float32Array(100).fill(0);
  assert.ok(RecallCore.rms(silence) < 1e-9);
});

t('rms of a full-scale square wave is close to 1.0 (its theoretical RMS)', () => {
  const square = new Float32Array(100);
  for (let i = 0; i < square.length; i++) square[i] = i % 2 === 0 ? 1 : -1;
  assert.ok(Math.abs(RecallCore.rms(square) - 1.0) < 1e-9);
});

t('rms scales with amplitude (half amplitude -> half rms)', () => {
  const full = new Float32Array(100).map((_, i) => Math.sin(i / 5));
  const half = full.map((v) => v * 0.5);
  const a = RecallCore.rms(full), b = RecallCore.rms(half);
  assert.ok(Math.abs(b - a * 0.5) < 1e-9);
});

run();
