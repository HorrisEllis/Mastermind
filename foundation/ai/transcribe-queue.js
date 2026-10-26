// ═══════════════════════════════════════════════════════════════════
// TRANSCRIPTION QUEUE
// foundation/ai/transcribe-queue.js
//
// The buffer between rolling recall and the lattice.
//
// ─────────────────────────────────────────────────────────────────
// THE PROBLEM IT SOLVES
//
// Whisper is accurate and not instant. A 4-second utterance might take
// 1.5s to transcribe; a 12-second one might take 5s. Speech does not
// wait. So segments arrive faster than they finish, and they finish
// OUT OF ORDER — a short sentence spoken second can overtake a long
// one spoken first.
//
// If nodes were created on completion, your lattice would record you
// saying things in an order you never said them. Association and the
// tag-transition grammar are both order-sensitive, so that is not a
// cosmetic problem: it corrupts the structure the whole module exists
// to find.
//
// So: segments get a monotonic sequence number at CAPTURE time, are
// transcribed concurrently, and are released to the lattice strictly
// in sequence. A slow segment holds the ones behind it — which is
// correct, because their meaning depends on it.
//
// ─────────────────────────────────────────────────────────────────
// BACKPRESSURE
//
// If transcription falls permanently behind capture, the queue grows
// without bound and eventually the app dies holding an hour of audio.
// So the queue has a ceiling and a stated policy at that ceiling:
// it stops accepting, says so, and keeps what it already has. It never
// silently drops a segment — dropped speech is indistinguishable from
// speech you never said, and you would have no way to know.
//
// UUID: 4a3b2c1d-ai-8000-8000-transcribeq1
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.TranscribeQueue = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DEFAULTS = {
    maxPending: 40,        // ~7 minutes of speech at 10s/segment
    maxConcurrent: 2,      // parallel transcriptions
    maxAttempts: 2,        // retry a failed segment once
    stallWarnMs: 30000,    // head-of-line blocked this long → surface it
  };

  const STATE = Object.freeze({
    QUEUED: 'queued',
    RUNNING: 'running',
    DONE: 'done',
    FAILED: 'failed',
    RELEASED: 'released',
  });

  function create(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});

    const q = {
      cfg,
      seq: 0,
      items: new Map(),      // seq → item
      nextToRelease: 1,
      running: 0,
      rejected: 0,           // segments refused at the ceiling — never silent
      released: 0,
      failed: 0,
      onRelease: null,       // (text, item) => void
      onError: null,         // (item, error) => void
      onBackpressure: null,  // (info) => void
    };

    // Capture-time ordering. The sequence number is assigned HERE, not
    // when transcription starts or finishes, because this is the only
    // moment that reflects the order the words were actually spoken.
    function enqueue(segment) {
      const pending = countPending();
      if (pending >= cfg.maxPending) {
        q.rejected++;
        const info = {
          reason: 'QUEUE_FULL',
          pending,
          rejected: q.rejected,
          message: 'Transcription is behind by ' + pending + ' segments. ' +
                   'Recording is still buffering audio, but new segments are not being queued.',
        };
        if (q.onBackpressure) q.onBackpressure(info);
        return { ok: false, ...info };
      }

      const seq = ++q.seq;
      const item = {
        seq,
        capturedAt: segment.capturedAt || Date.now(),
        durationMs: segment.durationMs || null,
        ref: segment.ref,              // opaque handle to the audio
        state: STATE.QUEUED,
        attempts: 0,
        text: null,
        error: null,
        startedAt: null,
        finishedAt: null,
      };
      q.items.set(seq, item);
      return { ok: true, seq, item };
    }

    function countPending() {
      let n = 0;
      for (const it of q.items.values()) {
        if (it.state === STATE.QUEUED || it.state === STATE.RUNNING) n++;
      }
      return n;
    }

    // Which segments should be transcribing right now. Kept as a pure
    // selection so the scheduler can be tested without a transcriber.
    function nextRunnable() {
      if (q.running >= cfg.maxConcurrent) return null;
      let best = null;
      for (const it of q.items.values()) {
        if (it.state !== STATE.QUEUED) continue;
        if (!best || it.seq < best.seq) best = it;
      }
      return best;
    }

    function markRunning(seq) {
      const it = q.items.get(seq);
      if (!it || it.state !== STATE.QUEUED) return false;
      it.state = STATE.RUNNING;
      it.attempts++;
      it.startedAt = Date.now();
      q.running++;
      return true;
    }

    function markDone(seq, text) {
      const it = q.items.get(seq);
      if (!it || it.state !== STATE.RUNNING) return false;
      it.state = STATE.DONE;
      it.text = text;
      it.finishedAt = Date.now();
      q.running--;
      drain();
      return true;
    }

    function markFailed(seq, error) {
      const it = q.items.get(seq);
      if (!it || it.state !== STATE.RUNNING) return false;
      q.running--;
      it.error = String(error && error.message || error);

      if (it.attempts < cfg.maxAttempts) {
        it.state = STATE.QUEUED;      // one more go
        return true;
      }

      // Out of attempts. The segment is marked failed and RELEASED as a
      // gap rather than removed — a hole you can see beats a hole you
      // cannot. The lattice records that something was said here and
      // could not be read.
      it.state = STATE.FAILED;
      it.finishedAt = Date.now();
      q.failed++;
      if (q.onError) q.onError(it, it.error);
      drain();
      return true;
    }

    // Release strictly in capture order. This is the whole point.
    function drain() {
      while (true) {
        const it = q.items.get(q.nextToRelease);
        if (!it) break;
        if (it.state !== STATE.DONE && it.state !== STATE.FAILED) break;

        it.state = STATE.RELEASED;
        q.nextToRelease++;
        q.released++;

        if (q.onRelease) {
          q.onRelease(it.text, {
            seq: it.seq,
            capturedAt: it.capturedAt,
            durationMs: it.durationMs,
            failed: it.text === null,
            latencyMs: it.finishedAt && it.startedAt ? it.finishedAt - it.startedAt : null,
          });
        }
        q.items.delete(it.seq);
      }
    }

    // Head-of-line stall: the segment everything is waiting on has been
    // running too long. Reported, not auto-killed — cancelling would
    // lose real speech to fix a display problem.
    function stalled(now) {
      const head = q.items.get(q.nextToRelease);
      if (!head || head.state !== STATE.RUNNING) return null;
      const waited = (now || Date.now()) - (head.startedAt || 0);
      if (waited < cfg.stallWarnMs) return null;
      return { seq: head.seq, waitedMs: waited, blocking: countPending() - 1 };
    }

    function stats() {
      return {
        captured: q.seq,
        pending: countPending(),
        running: q.running,
        released: q.released,
        failed: q.failed,
        rejected: q.rejected,
        nextToRelease: q.nextToRelease,
      };
    }

    return {
      STATE,
      enqueue, nextRunnable, markRunning, markDone, markFailed,
      drain, stalled, stats, countPending,
      get onRelease() { return q.onRelease; },
      set onRelease(fn) { q.onRelease = fn; },
      get onError() { return q.onError; },
      set onError(fn) { q.onError = fn; },
      get onBackpressure() { return q.onBackpressure; },
      set onBackpressure(fn) { q.onBackpressure = fn; },
      _q: q,
    };
  }

  return { create, DEFAULTS, STATE };
});
