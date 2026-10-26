'use strict';
// ═══════════════════════════════════════════════════════════════════
// TRANSCRIPTION QUEUE + WHISPER
//
// The ordering tests are the ones that matter. Whisper finishes out of
// order; the lattice's association engine and its tag-transition
// grammar are both order-sensitive. A queue that released on completion
// would record you saying things in an order you never said them, and
// the corruption would be invisible — the nodes would all be real.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const TQ = require('../foundation/ai/transcribe-queue.js');
const W  = require('../foundation/ai/whisper.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}
async function ta(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const seg = (n) => ({ ref: 'audio-' + n, capturedAt: 1000 + n, durationMs: 4000 });

console.log('\nTRANSCRIPTION QUEUE + WHISPER\n');

t('segments are numbered at capture time, not completion', () => {
  const q = TQ.create();
  assert.strictEqual(q.enqueue(seg(1)).seq, 1);
  assert.strictEqual(q.enqueue(seg(2)).seq, 2);
  assert.strictEqual(q.enqueue(seg(3)).seq, 3);
});

t('OUT-OF-ORDER completion still releases in spoken order', () => {
  const q = TQ.create();
  const out = [];
  q.onRelease = (text) => out.push(text);

  q.enqueue(seg(1)); q.enqueue(seg(2)); q.enqueue(seg(3));
  q.markRunning(1); q.markRunning(2); q.markRunning(3);

  // A short third sentence finishes first; a long first one finishes last.
  q.markDone(3, 'third');
  assert.deepStrictEqual(out, [], 'nothing may release while segment 1 is outstanding');
  q.markDone(2, 'second');
  assert.deepStrictEqual(out, [], 'still blocked on 1');
  q.markDone(1, 'first');

  assert.deepStrictEqual(out, ['first', 'second', 'third'],
    'release order must be the order the words were spoken');
});

t('a slow segment holds the ones behind it, then all flush at once', () => {
  const q = TQ.create();
  const out = [];
  q.onRelease = (text) => out.push(text);
  for (let i = 1; i <= 5; i++) { q.enqueue(seg(i)); }
  for (let i = 1; i <= 5; i++) { q.markRunning(i); }
  q.markDone(2, 'b'); q.markDone(3, 'c'); q.markDone(4, 'd'); q.markDone(5, 'e');
  assert.strictEqual(out.length, 0);
  q.markDone(1, 'a');
  assert.deepStrictEqual(out, ['a', 'b', 'c', 'd', 'e']);
});

t('a failed segment is retried once before it is given up on', () => {
  const q = TQ.create({ maxAttempts: 2 });
  q.enqueue(seg(1));
  q.markRunning(1);
  q.markFailed(1, new Error('whisper crashed'));
  const next = q.nextRunnable();
  assert.ok(next && next.seq === 1, 'must be requeued for a second attempt');
  assert.strictEqual(next.attempts, 1);
});

t('a permanently failed segment releases as a GAP, never silently vanishes', () => {
  const q = TQ.create({ maxAttempts: 1 });
  const out = [];
  q.onRelease = (text, meta) => out.push({ text, failed: meta.failed });
  q.enqueue(seg(1)); q.enqueue(seg(2));
  q.markRunning(1);
  q.markFailed(1, new Error('unreadable'));
  q.markRunning(2); q.markDone(2, 'second');

  assert.strictEqual(out.length, 2);
  assert.strictEqual(out[0].failed, true, 'the gap must be visible');
  assert.strictEqual(out[0].text, null);
  assert.strictEqual(out[1].text, 'second');
});

t('the queue refuses at its ceiling and SAYS so — it never drops silently', () => {
  const q = TQ.create({ maxPending: 3 });
  let pressure = null;
  q.onBackpressure = (info) => { pressure = info; };
  assert.strictEqual(q.enqueue(seg(1)).ok, true);
  assert.strictEqual(q.enqueue(seg(2)).ok, true);
  assert.strictEqual(q.enqueue(seg(3)).ok, true);
  const rejected = q.enqueue(seg(4));
  assert.strictEqual(rejected.ok, false);
  assert.strictEqual(rejected.reason, 'QUEUE_FULL');
  assert.ok(pressure, 'backpressure must be surfaced, not swallowed');
  assert.strictEqual(q.stats().rejected, 1);
});

t('draining below the ceiling lets capture resume', () => {
  const q = TQ.create({ maxPending: 2 });
  q.onRelease = () => {};
  q.enqueue(seg(1)); q.enqueue(seg(2));
  assert.strictEqual(q.enqueue(seg(3)).ok, false);
  q.markRunning(1); q.markDone(1, 'a');
  assert.strictEqual(q.enqueue(seg(3)).ok, true, 'space freed by a release must be reusable');
});

t('concurrency is capped', () => {
  const q = TQ.create({ maxConcurrent: 2 });
  q.enqueue(seg(1)); q.enqueue(seg(2)); q.enqueue(seg(3));
  assert.ok(q.markRunning(1));
  assert.ok(q.markRunning(2));
  assert.strictEqual(q.nextRunnable(), null, 'must not start a third');
});

t('the scheduler always picks the oldest queued segment', () => {
  const q = TQ.create({ maxConcurrent: 3 });
  q.enqueue(seg(1)); q.enqueue(seg(2)); q.enqueue(seg(3));
  q.markRunning(2);                       // out-of-order start
  assert.strictEqual(q.nextRunnable().seq, 1, 'oldest first, so the head unblocks soonest');
});

t('a head-of-line stall is reported rather than killed', () => {
  const q = TQ.create({ stallWarnMs: 1000 });
  q.enqueue(seg(1)); q.enqueue(seg(2));
  q.markRunning(1); q.markRunning(2);
  assert.strictEqual(q.stalled(Date.now()), null);
  const s = q.stalled(Date.now() + 5000);
  assert.ok(s && s.seq === 1);
  assert.strictEqual(s.blocking, 1);
});

t('stats reflect what actually happened', () => {
  const q = TQ.create();
  q.onRelease = () => {};
  q.enqueue(seg(1)); q.enqueue(seg(2));
  q.markRunning(1); q.markDone(1, 'a');
  const s = q.stats();
  assert.strictEqual(s.captured, 2);
  assert.strictEqual(s.released, 1);
  assert.strictEqual(s.pending, 1);
});

// ── Whisper ────────────────────────────────────────────────────────

t('transcript cleaning strips non-speech markers', () => {
  assert.strictEqual(W.cleanTranscript('[BLANK_AUDIO]'), '');
  assert.strictEqual(W.cleanTranscript('(silence)'), '');
  assert.strictEqual(W.cleanTranscript('  hello   there \n\n'), 'hello there');
  assert.strictEqual(W.cleanTranscript('[MUSIC]\nreal words\n[BLANK_AUDIO]'), 'real words');
});

t('model resolution defaults safely and validates the name', () => {
  assert.strictEqual(W.resolveModel({}).name, 'base');
  assert.strictEqual(W.resolveModel({ model: 'not-a-model' }).name, 'base');
  assert.strictEqual(W.resolveModel({ model: 'medium' }).name, 'medium');
});

t('a user-configured binary path is searched FIRST', () => {
  const paths = W.candidatePaths('/custom/whisper');
  assert.strictEqual(paths[0], '/custom/whisper');
});

await_detect();
async function await_detect() {
  await ta('detect reports UNAVAILABLE honestly when no binary exists', async () => {
    const r = await W.detect({ binPath: '/definitely/not/here/whisper' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'UNAVAILABLE');
    assert.ok(/Nothing is sent anywhere/.test(r.message),
      'the message must state that no cloud fallback occurs');
    assert.ok(Array.isArray(r.searched));
  });

  await ta('transcribe fails cleanly rather than throwing when whisper is absent', async () => {
    const r = await W.transcribe(Buffer.from([1, 2, 3]), { binPath: '/nope/whisper' });
    assert.strictEqual(r.ok, false);
    assert.ok(r.reason === 'UNAVAILABLE' || r.reason === 'MODEL_MISSING');
  });

  const fails = results.filter(r => !r.ok);
  console.log('\ntranscription: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
}
