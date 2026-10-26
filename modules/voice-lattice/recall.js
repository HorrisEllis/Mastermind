// ═══════════════════════════════════════════════════════════════════
// ROLLING RECALL — modules/voice-lattice/recall.js
// v1.0.0
//
// "Record the last 10 minutes, and capture the 3 seconds BEFORE each
// sound so it doesn't get cut off."
//
// Always-on ring of short audio chunks covering a trailing window
// (default 10 min). A speech detector watches RMS with hysteresis; when
// speech starts, the segment is cut from onset MINUS a pre-roll (default
// 3s), so the first syllable — always the one that gets clipped — is
// already in the buffer.
//
// Off by default. It's a microphone that's always listening: that should
// be a deliberate choice, not something switched on quietly. Toggle in
// Options → AI, persisted in OPTS.voice_recall.
//
// TESTABILITY: the mic, MediaRecorder and AnalyserNode do not exist in
// the build environment, so the pure logic is deliberately separated —
// recallPrune / recallSelectSegment / RecallVAD are plain functions and
// ARE tested. The hardware wiring below them runs first on real audio.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// Pure logic — no DOM, no window, no MediaRecorder — exported the same
// way vault-mfa.js/audio-encode.js are, so it's directly requireable in
// tests instead of only reachable by extracting source text out of a
// window-dependent file. The header above claimed these were tested;
// they were not — there was no test file for this module at all. Now
// there is (tests/run-recall.test.js).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.RecallCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DEFAULT_RMS_THRESHOLD = 0.018;
  const DEFAULT_SILENCE_HOLD_MS = 1200;
  // Mirrors voicing.js's own DEFAULTS (fricativeDb/fricativeZcr) so the
  // two modules agree on what counts as "quiet but not silent" even
  // though this file doesn't depend on that one being loaded.
  const DEFAULT_FRICATIVE_ZCR = 0.15;
  const DEFAULT_FRICATIVE_DB = -42;

  // Drop anything older than the trailing window.
  function recallPrune(chunks, now, windowMs) {
    const cutoff = now - windowMs;
    let i = 0;
    while (i < chunks.length && chunks[i].ts < cutoff) i++;
    return i > 0 ? chunks.slice(i) : chunks;
  }

  // Everything from (onset - preroll) to end. This is the anti-clipping
  // step: it intentionally reaches BACKWARDS past the moment speech was
  // detected, because detection always lags the actual first sound.
  function recallSelectSegment(chunks, onsetTs, prerollMs, endTs) {
    const start = onsetTs - prerollMs;
    return chunks.filter(c => c.ts >= start && c.ts <= endTs);
  }

  // Speech detector with hysteresis — a single threshold flickers on every
  // breath and chops one utterance into a dozen fragments.
  class RecallVAD {
    constructor(opts) {
      const o = opts || {};
      this.threshold = o.threshold != null ? o.threshold : DEFAULT_RMS_THRESHOLD;
      this.releaseRatio = o.releaseRatio != null ? o.releaseRatio : 0.6; // must fall well below to count as silence
      this.silenceHoldMs = o.silenceHoldMs != null ? o.silenceHoldMs : DEFAULT_SILENCE_HOLD_MS;
      // Fricative rescue — see voicing.js's own header for the salvaged
      // insight this mirrors: "s", "f", "sh", "th" are quiet AND noisy,
      // low energy but high zero-crossing rate. An RMS-only VAD reads
      // that as silence mid-word and cuts through it — "this" becomes
      // "thi", and Whisper guesses the rest. Optional and additive: push()
      // without a zcr argument behaves exactly as before, unchanged.
      this.fricativeZcr = o.fricativeZcr != null ? o.fricativeZcr : DEFAULT_FRICATIVE_ZCR;
      this.fricativeDb = o.fricativeDb != null ? o.fricativeDb : DEFAULT_FRICATIVE_DB;
      this.state = 'idle';
      this.onsetTs = null;
      this._quietSince = null;
    }
    // Returns 'start' | 'end' | null. zcr is optional — omitting it keeps
    // the original RMS-only behavior exactly as it was.
    push(rms, ts, zcr) {
      const t = ts != null ? ts : Date.now();
      const db = rms > 0 ? 20 * Math.log10(rms) : -120;
      const isFricative = zcr != null && zcr > this.fricativeZcr && db < this.fricativeDb;
      if (this.state === 'idle') {
        if (rms >= this.threshold || isFricative) {
          this.state = 'speaking';
          this.onsetTs = t;
          this._quietSince = null;
          return 'start';
        }
        return null;
      }
      // speaking
      if (rms >= this.threshold * this.releaseRatio || isFricative) {
        this._quietSince = null;
        return null;
      }
      if (this._quietSince == null) this._quietSince = t;
      if (t - this._quietSince >= this.silenceHoldMs) {
        this.state = 'idle';
        this._quietSince = null;
        return 'end';
      }
      return null;
    }
    reset() { this.state = 'idle'; this.onsetTs = null; this._quietSince = null; }
  }

  // RMS of one raw PCM chunk — the same math RECALL's own analyser tick
  // and the manual orb's segmenter both need, so it lives here once.
  function rms(float32) {
    let sum = 0;
    for (let i = 0; i < float32.length; i++) sum += float32[i] * float32[i];
    return Math.sqrt(sum / float32.length);
  }

  // Zero-crossing rate — how often the signal changes sign, normalized
  // to 0-1. The fricative signal RMS alone can't see: consonants like
  // "s"/"f" are quiet (low RMS) but noisy (high ZCR), where genuine
  // silence is both quiet AND smooth (low ZCR). Same math as
  // voicing.js's frameZcr, duplicated here (not imported) so recall.js
  // has no hard dependency on that file being loaded — this module
  // works standalone; voicing.js sharpens it further when present.
  function zcr(float32) {
    if (float32.length < 2) return 0;
    let crossings = 0;
    for (let i = 1; i < float32.length; i++) {
      if ((float32[i] >= 0) !== (float32[i - 1] >= 0)) crossings++;
    }
    return crossings / (float32.length - 1);
  }

  return {
    DEFAULT_RMS_THRESHOLD, DEFAULT_SILENCE_HOLD_MS, DEFAULT_FRICATIVE_ZCR, DEFAULT_FRICATIVE_DB,
    recallPrune, recallSelectSegment, RecallVAD, rms, zcr,
  };
});

// Everything below touches window/DOM/MediaRecorder directly, and is
// skipped when this file is require()'d in Node for its pure exports
// (tests/run-recall.test.js) — without this guard, requiring the file
// at all would throw ReferenceError: window is not defined.
if (typeof window !== 'undefined') {

const RECALL = {
  enabled: false,
  windowMs: 10 * 60 * 1000,   // keep the last 10 minutes
  prerollMs: 3000,            // reach back 3s before speech onset
  chunkMs: 1000,              // recorder timeslice
  silenceHoldMs: 1200,        // silence this long ends a segment
  rmsThreshold: 0.018,        // speech-onset floor (empirical starting point)
  chunks: [],                 // [{ blob, ts }]
  _stream: null, _rec: null, _ctx: null, _analyser: null, _raf: null,
  _vad: null, _segmentOnset: null, _capturing: false,
  segmentsCaptured: 0,
};

// Local names kept so the "Hardware wiring" section below reads exactly
// as it did before the UMD wrapper was added — they're just references
// to the pure functions above now, not a second copy of them.
const { recallPrune, recallSelectSegment, RecallVAD } = window.RecallCore;

// ── Hardware wiring (runs first on a real machine) ─────────────────

async function recallStart() {
  if (RECALL.enabled) return { ok: true, already: true };
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    return { ok: false, error: 'RECALL_UNAVAILABLE: getUserMedia/MediaRecorder not present in this runtime' };
  }
  try {
    RECALL._stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    return { ok: false, error: 'MIC_DENIED: ' + e.message };
  }
  try {
    RECALL._rec = new MediaRecorder(RECALL._stream);
    RECALL._rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      RECALL.chunks.push({ blob: e.data, ts: Date.now() });
      RECALL.chunks = recallPrune(RECALL.chunks, Date.now(), RECALL.windowMs);
    };
    RECALL._rec.start(RECALL.chunkMs);

    RECALL._ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = RECALL._ctx.createMediaStreamSource(RECALL._stream);
    RECALL._analyser = RECALL._ctx.createAnalyser();
    RECALL._analyser.fftSize = 1024;
    src.connect(RECALL._analyser);
    RECALL._vad = new RecallVAD();

    const buf = new Float32Array(RECALL._analyser.fftSize);
    const tick = () => {
      if (!RECALL.enabled) return;
      RECALL._analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const ev = RECALL._vad.push(rms);
      if (ev === 'start') {
        RECALL._segmentOnset = RECALL._vad.onsetTs;
        RECALL._capturing = true;
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('recall.speech.started', { ts: RECALL._segmentOnset });
      } else if (ev === 'end' && RECALL._capturing) {
        RECALL._capturing = false;
        _recallFinalizeSegment(RECALL._segmentOnset, Date.now());
      }
      RECALL._raf = requestAnimationFrame(tick);
    };
    RECALL.enabled = true;
    tick();
    if (typeof MMLog !== 'undefined') MMLog.info('recall', `Rolling recall on — ${RECALL.windowMs / 60000}min window, ${RECALL.prerollMs}ms pre-roll`);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('recall.started', {});
    return { ok: true };
  } catch (e) {
    recallStop();
    return { ok: false, error: 'RECALL_START_FAILED: ' + e.message };
  }
}

function recallStop() {
  RECALL.enabled = false;
  try { if (RECALL._raf) cancelAnimationFrame(RECALL._raf); } catch (e) {}
  try { RECALL._rec?.stop(); } catch (e) {}
  try { RECALL._stream?.getTracks().forEach(t => t.stop()); } catch (e) {}
  try { RECALL._ctx?.close(); } catch (e) {}
  RECALL._rec = null; RECALL._stream = null; RECALL._ctx = null; RECALL._analyser = null;
  RECALL._capturing = false;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('recall.stopped', {});
  return { ok: true };
}

function recallToggle() {
  if (RECALL.enabled) { recallStop(); if (typeof OPTS !== 'undefined') { OPTS.voice_recall = false; saveOpts?.(); } return { ok: true, enabled: false }; }
  return recallStart().then ? recallStart().then(r => {
    if (r.ok && typeof OPTS !== 'undefined') { OPTS.voice_recall = true; saveOpts?.(); }
    return r;
  }) : { ok: false };
}

function _recallFinalizeSegment(onsetTs, endTs) {
  const seg = recallSelectSegment(RECALL.chunks, onsetTs, RECALL.prerollMs, endTs);
  if (!seg.length) return null;
  RECALL.segmentsCaptured++;
  const payload = {
    from: onsetTs - RECALL.prerollMs,
    to: endTs,
    chunkCount: seg.length,
    durationMs: endTs - (onsetTs - RECALL.prerollMs),
    blobs: seg.map(c => c.blob),
  };
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('recall.segment.captured', payload);
  if (typeof MMLog !== 'undefined') MMLog.info('recall', `Segment captured: ${payload.durationMs}ms (incl. ${RECALL.prerollMs}ms pre-roll), ${seg.length} chunks`);
  return payload;
}

// Grab the trailing N ms on demand — "what did I just say?" without
// having had to press record first. That's the whole point of a ring.
function recallLast(ms) {
  const now = Date.now();
  return recallSelectSegment(RECALL.chunks, now - (ms || 60000), 0, now);
}

window.RECALL = RECALL;
window.RecallVAD = RecallVAD;
window.recallPrune = recallPrune;
window.recallSelectSegment = recallSelectSegment;
window.recallStart = recallStart;
window.recallStop = recallStop;
window.recallToggle = recallToggle;
window.recallLast = recallLast;

if (typeof MMLog !== 'undefined') MMLog.info('recall', 'Rolling recall v1.0.0 loaded (disabled until enabled in Options)');

} // end: if (typeof window !== 'undefined')