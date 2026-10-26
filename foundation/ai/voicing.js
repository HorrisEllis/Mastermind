// ═══════════════════════════════════════════════════════════════════
// VOICING
// foundation/ai/voicing.js
//
// Frame classification (voiced / unvoiced / silence) and segmentation
// that cuts at pauses instead of at clock ticks.
//
// Pure. Float32 in, decisions out.
//
// ─────────────────────────────────────────────────────────────────
// WHY THIS IS THE REAL ACCURACY LEVER
//
// Of everything that can be done to audio before transcription, WHERE
// THE CUTS FALL matters more than any filtering. Whisper transcribes a
// window as a unit; a boundary through the middle of a word gives it
// half a word twice, and it will confidently produce two wrong ones.
//
// The voice-note importer currently windows at fixed 30-second marks
// with overlap, which is a reasonable guess and nothing more. This
// replaces the guess: find the pauses, cut there.
//
// ─────────────────────────────────────────────────────────────────
// THE ZCR INSIGHT, SALVAGED
//
// From rheon-voice's audio-engine, which had this right:
//
//   energy alone cannot tell a fricative from silence.
//
// "s", "f", "sh", "th" are quiet AND noisy — low energy, high
// zero-crossing rate. An energy-only VAD cuts straight through them,
// so "this" becomes "thi" and Whisper guesses. Adding zero-crossing
// rate separates the two: low energy + HIGH ZCR is a consonant and must
// be kept; low energy + low ZCR is genuine silence and may be cut.
//
// rheon also smoothed the decision over an 8-frame majority vote, which
// stops a single noisy frame from splitting a word. Both ideas are kept.
//
// ─────────────────────────────────────────────────────────────────
// LINEAGE NOTE
//
// rheon-voice/js/audio-engine.js computed pitch by real autocorrelation
// on getFloatTimeDomainData. ALK codec-v2 later replaced that with
// peak-picking on getByteFrequencyData, which cannot resolve F0 to
// better than 23 Hz. The earlier code was better; the rewrite was a
// regression. foundation/ai/pitch.js restores the correct approach and
// adds cumulative-mean normalisation and parabolic interpolation.
//
// UUID: 4a3b2c1d-ai-8000-8000-voicing00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.Voicing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const VOICED = 'voiced';
  const UNVOICED = 'unvoiced';
  const SILENCE = 'silence';

  const DEFAULTS = {
    sampleRate: 16000,
    frameMs: 20,
    silenceDb: -60,        // below this, nothing worth keeping
    fricativeDb: -42,      // quiet, but not silent
    fricativeZcr: 0.15,    // and noisy → a consonant, not a gap
    smoothFrames: 5,       // majority vote window (odd, so no ties)

    // Segmentation
    minSegmentMs: 2000,
    maxSegmentMs: 28000,   // Whisper's window is 30s; leave headroom
    minPauseMs: 350,       // shorter than this is a breath, not a boundary
    padMs: 200,            // keep a little either side of a cut
  };

  // ── Frame features ─────────────────────────────────────────────────

  function frameRms(x, from, to) {
    let s = 0;
    for (let i = from; i < to; i++) s += x[i] * x[i];
    return Math.sqrt(s / (to - from));
  }

  // Zero-crossing rate: how often the waveform changes sign. High for
  // noise-like sounds (fricatives), low for periodic ones (vowels).
  function frameZcr(x, from, to) {
    let c = 0;
    for (let i = from + 1; i < to; i++) {
      if ((x[i] >= 0) !== (x[i - 1] >= 0)) c++;
    }
    return c / (to - from);
  }

  function toDb(rms) {
    return rms > 0 ? 20 * Math.log10(rms) : -120;
  }

  function classifyFrame(rms, zcr, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const db = toDb(rms);
    if (db < o.silenceDb) return SILENCE;
    // The salvaged rule: quiet AND noisy is a fricative, not a gap.
    if (zcr > o.fricativeZcr && db < o.fricativeDb) return UNVOICED;
    return VOICED;
  }

  // ── Frame track ────────────────────────────────────────────────────

  function analyse(x, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const frameLen = Math.max(64, Math.floor(o.sampleRate * o.frameMs / 1000));
    const frames = [];

    for (let i = 0; i + frameLen <= x.length; i += frameLen) {
      const rms = frameRms(x, i, i + frameLen);
      const zcr = frameZcr(x, i, i + frameLen);
      frames.push({
        index: frames.length,
        startMs: Math.round(i / o.sampleRate * 1000),
        rms, zcr, db: toDb(rms),
        raw: classifyFrame(rms, zcr, o),
        state: null,
      });
    }

    // Majority vote over a sliding window. A single misclassified frame
    // in the middle of a word must not become a cut point.
    const half = Math.floor(o.smoothFrames / 2);
    for (let i = 0; i < frames.length; i++) {
      const counts = { voiced: 0, unvoiced: 0, silence: 0 };
      for (let j = Math.max(0, i - half); j <= Math.min(frames.length - 1, i + half); j++) {
        counts[frames[j].raw]++;
      }
      // Ties resolve toward keeping audio: a frame that might be speech
      // is treated as speech. Cutting real speech is worse than carrying
      // a little extra silence.
      frames[i].state = counts.voiced >= counts.unvoiced
        ? (counts.voiced >= counts.silence ? VOICED : SILENCE)
        : (counts.unvoiced >= counts.silence ? UNVOICED : SILENCE);
    }

    return { frames, frameMs: o.frameMs, sampleRate: o.sampleRate };
  }

  // ── Pauses ─────────────────────────────────────────────────────────
  // Runs of silence long enough to be a real boundary. A 100ms gap is a
  // stop consonant or a breath; cutting there splits a phrase.

  function findPauses(track, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const minFrames = Math.max(1, Math.round(o.minPauseMs / track.frameMs));
    const pauses = [];
    let run = 0;

    for (let i = 0; i <= track.frames.length; i++) {
      const isSilence = i < track.frames.length && track.frames[i].state === SILENCE;
      if (isSilence) { run++; continue; }
      if (run >= minFrames) {
        const startFrame = i - run;
        pauses.push({
          startMs: startFrame * track.frameMs,
          endMs: i * track.frameMs,
          durationMs: run * track.frameMs,
          // The middle of a pause is the safest place to cut.
          cutMs: Math.round((startFrame + run / 2) * track.frameMs),
        });
      }
      run = 0;
    }
    return pauses;
  }

  // ── Segmentation ───────────────────────────────────────────────────
  // Greedy: extend until the segment is long enough, then take the next
  // pause. If none arrives before the maximum, cut at the longest pause
  // seen — and if there was none at all, cut on the clock and SAY so,
  // because that is the case where a word may have been split.

  function segment(x, opts) {
    const o = Object.assign({}, DEFAULTS, opts || {});
    const track = analyse(x, o);
    const pauses = findPauses(track, o);
    const totalMs = Math.round(x.length / o.sampleRate * 1000);

    if (totalMs <= o.maxSegmentMs) {
      return {
        segments: [{ startMs: 0, endMs: totalMs, durationMs: totalMs, cutAt: 'end-of-audio', clean: true }],
        pauses, totalMs, track,
      };
    }

    const segments = [];
    let start = 0;

    while (start < totalMs) {
      const remaining = totalMs - start;
      if (remaining <= o.maxSegmentMs) {
        segments.push({ startMs: start, endMs: totalMs, durationMs: remaining, cutAt: 'end-of-audio', clean: true });
        break;
      }

      const earliest = start + o.minSegmentMs;
      const latest = start + o.maxSegmentMs;

      const candidates = pauses.filter(p => p.cutMs > earliest && p.cutMs <= latest);
      let cut, cutAt, clean;

      if (candidates.length) {
        // The LAST usable pause, not the first: longer segments give
        // Whisper more context, and context is what it uses to
        // disambiguate.
        const chosen = candidates[candidates.length - 1];
        cut = chosen.cutMs;
        cutAt = 'pause';
        clean = true;
      } else {
        const fallback = pauses
          .filter(p => p.cutMs > start && p.cutMs <= latest)
          .sort((a, b) => b.durationMs - a.durationMs)[0];
        if (fallback) {
          cut = fallback.cutMs; cutAt = 'short-pause'; clean = true;
        } else {
          // No pause in 28 seconds of speech. Cutting here may split a
          // word, and the flag is how the transcript's reader knows.
          cut = latest; cutAt = 'forced-clock'; clean = false;
        }
      }

      segments.push({
        startMs: Math.max(0, start - (segments.length ? o.padMs : 0)),
        endMs: cut + o.padMs,
        durationMs: cut + o.padMs - Math.max(0, start - (segments.length ? o.padMs : 0)),
        cutAt, clean,
      });
      start = cut;
    }

    return {
      segments, pauses, totalMs, track,
      forcedCuts: segments.filter(s => !s.clean).length,
    };
  }

  // ── Summary ────────────────────────────────────────────────────────
  // What proportion of the audio is actually speech. A recording that is
  // 95% silence transcribes badly for reasons no filter can fix, and
  // knowing that is worth more than any processing.

  function summarise(track) {
    const counts = { voiced: 0, unvoiced: 0, silence: 0 };
    for (const f of track.frames) counts[f.state]++;
    const total = track.frames.length || 1;
    return {
      frames: total,
      voicedRatio: counts.voiced / total,
      unvoicedRatio: counts.unvoiced / total,
      silenceRatio: counts.silence / total,
      speechRatio: (counts.voiced + counts.unvoiced) / total,
      durationMs: total * track.frameMs,
    };
  }

  return {
    VOICED, UNVOICED, SILENCE, DEFAULTS,
    frameRms, frameZcr, toDb, classifyFrame,
    analyse, findPauses, segment, summarise,
  };
});
