// ═══════════════════════════════════════════════════════════════════
// VOICE NOTE IMPORT
// foundation/ai/audio-import.js
//
// A virtual input. Existing audio files enter through the SAME
// transcription queue the live microphone uses — one pipeline, two
// sources — so imported speech gets identical tagging, association and
// grammar treatment. Nothing about the lattice needs to know where
// audio came from.
//
// PURE. Planning only: no filesystem, no transcription, no clock
// dependence beyond what is passed in. The impure half lives in
// main.js behind IPC.
//
// ─────────────────────────────────────────────────────────────────
// THE ORDERING TRAP
//
// A backlog of voice notes is not one recording session. If a batch is
// ordered by import time, two years of notes all arrive "now", in
// whatever order the file picker returned them.
//
// That silently destroys the two things the lattice is for. Association
// links utterances that share vocabulary — across a two-year backlog
// that is a real signal, but only if the sequence is real. The
// tag-transition grammar is a Markov chain over ORDER; feed it
// alphabetical filenames and it learns the alphabet.
//
// So a batch is sorted by each note's own recorded time, and every
// segment carries that time — not the time it was imported.
//
// ─────────────────────────────────────────────────────────────────
// WHAT "RECORDED TIME" ACTUALLY IS
//
// Best available, and the plan says which was used, because they are
// not equally trustworthy:
//
//   embedded   — a creation timestamp inside the file. Best.
//   filename   — many recorders name files with a date. Good.
//   mtime      — last modified. Wrong the moment a file is copied,
//                synced or edited, which is often.
//
// A note whose time came from mtime is flagged, so a suspicious
// ordering can be traced to its cause instead of being trusted.
//
// UUID: 4a3b2c1d-ai-8000-8000-audioimport1
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.AudioImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const AUDIO_EXT = ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.aiff', '.wma'];

  // Video is a capture source too — a recording of you talking is a
  // recording of you talking. The audio track is what gets transcribed;
  // nothing infers anything from the picture. (v7 read "expression",
  // "posture", "gaze" and a "stress %" out of brightness statistics; that
  // is not resurrected here and should not be.)
  const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'];

  // Long recordings are cut into windows before transcription. Not for
  // Whisper's benefit — it handles long files — but for the lattice's:
  // a 40-minute note is not one utterance, and treating it as one
  // produces a single enormous node with no internal structure.
  const DEFAULT_SEGMENT_MS = 30000;
  const SEGMENT_OVERLAP_MS = 1500;   // a sentence straddling a cut is not lost

  // Filename date patterns, most specific first. Covers the common
  // recorder conventions: iOS voice memos, Android, Otter, Zoom, and
  // plain ISO.
  const NAME_DATE_PATTERNS = [
    { re: /(\d{4})-(\d{2})-(\d{2})[T_ ](\d{2})[-:.](\d{2})[-:.](\d{2})/, parts: 'ymdhms' },
    { re: /(\d{4})(\d{2})(\d{2})[T_-](\d{2})(\d{2})(\d{2})/,             parts: 'ymdhms' },
    { re: /(\d{4})-(\d{2})-(\d{2})/,                                     parts: 'ymd'    },
    { re: /(\d{4})(\d{2})(\d{2})/,                                       parts: 'ymd'    },
  ];

  function isAudio(name) {
    const n = String(name || '').toLowerCase();
    return AUDIO_EXT.some((e) => n.endsWith(e)) || VIDEO_EXT.some((e) => n.endsWith(e));
  }

  function isVideo(name) {
    const n = String(name || '').toLowerCase();
    return VIDEO_EXT.some((e) => n.endsWith(e));
  }

  function dateFromName(name) {
    const base = String(name || '');
    for (const p of NAME_DATE_PATTERNS) {
      const m = p.re.exec(base);
      if (!m) continue;
      const [, y, mo, d, h, mi, s] = m;
      const ts = Date.UTC(
        +y, +mo - 1, +d,
        p.parts === 'ymdhms' ? +h : 12,     // date-only → midday, not midnight,
        p.parts === 'ymdhms' ? +mi : 0,     // so a timezone shift cannot move
        p.parts === 'ymdhms' ? +s : 0       // the note to the previous day
      );
      if (!Number.isFinite(ts)) continue;
      if (ts < Date.UTC(1990, 0, 1) || ts > Date.now() + 86400000) continue;  // implausible
      return ts;
    }
    return null;
  }

  // Decide a note's recorded time and record HOW it was decided.
  function resolveRecordedAt(file) {
    if (Number.isFinite(file.embeddedCreatedAt)) {
      return { at: file.embeddedCreatedAt, source: 'embedded', trusted: true };
    }
    const fromName = dateFromName(file.name);
    if (fromName != null) {
      return { at: fromName, source: 'filename', trusted: true };
    }
    if (Number.isFinite(file.mtime)) {
      return { at: file.mtime, source: 'mtime', trusted: false };
    }
    return { at: null, source: 'unknown', trusted: false };
  }

  // Split one note into transcription windows.
  function segmentsFor(file, recordedAt, opts) {
    const o = opts || {};
    const win = o.segmentMs || DEFAULT_SEGMENT_MS;
    const overlap = o.overlapMs != null ? o.overlapMs : SEGMENT_OVERLAP_MS;
    const dur = Number.isFinite(file.durationMs) ? file.durationMs : null;

    // Unknown duration: hand the whole file over and let whisper deal
    // with it, rather than guessing a length and cutting mid-word.
    if (!dur || dur <= win) {
      return [{
        path: file.path,
        offsetMs: 0,
        durationMs: dur,
        capturedAt: recordedAt,
        index: 0,
        of: 1,
      }];
    }

    const out = [];
    let start = 0, i = 0;
    const step = Math.max(1000, win - overlap);
    while (start < dur) {
      const length = Math.min(win, dur - start);
      out.push({
        path: file.path,
        offsetMs: start,
        durationMs: length,
        // Segment time is the note's own start plus the offset within
        // it, so a long note keeps its internal chronology.
        capturedAt: recordedAt != null ? recordedAt + start : null,
        index: i,
        of: 0,
      });
      if (start + length >= dur) break;
      start += step;
      i++;
    }
    out.forEach((s) => { s.of = out.length; });
    return out;
  }

  // Build the batch plan. Deterministic and inspectable BEFORE anything
  // is transcribed — hours of compute should never start on a plan
  // nobody looked at.
  function plan(files, opts) {
    const o = opts || {};
    const known = new Set(o.alreadyImported || []);   // content hashes

    const accepted = [], skipped = [], untimed = [];

    for (const f of files || []) {
      if (!isAudio(f.name || f.path)) {
        skipped.push({ file: f.name || f.path, reason: 'NOT_AUDIO' });
        continue;
      }
      if (f.hash && known.has(f.hash)) {
        // Re-importing the same note would double every word in it,
        // inflating word-bank frequencies and inventing associations
        // between a note and itself.
        skipped.push({ file: f.name || f.path, reason: 'ALREADY_IMPORTED', hash: f.hash });
        continue;
      }
      if (Number.isFinite(f.size) && f.size === 0) {
        skipped.push({ file: f.name || f.path, reason: 'EMPTY_FILE' });
        continue;
      }

      const t = resolveRecordedAt(f);
      if (t.at == null) untimed.push(f.name || f.path);
      accepted.push({ file: f, time: t, video: isVideo(f.name || f.path) });
    }

    // Sort by the note's own recorded time. Untimed notes go last, in
    // the order given, rather than being scattered through real history.
    accepted.sort((a, b) => {
      if (a.time.at == null && b.time.at == null) return 0;
      if (a.time.at == null) return 1;
      if (b.time.at == null) return -1;
      return a.time.at - b.time.at;
    });

    const items = [];
    let totalMs = 0;
    for (const a of accepted) {
      const segs = segmentsFor(a.file, a.time.at, o);
      totalMs += Number.isFinite(a.file.durationMs) ? a.file.durationMs : 0;
      items.push({
        path: a.file.path,
        name: a.file.name,
        video: !!a.video,
        needsExtraction: !!a.video,   // whisper.cpp reads WAV; ffmpeg must run first
        hash: a.file.hash || null,
        recordedAt: a.time.at,
        timeSource: a.time.source,
        timeTrusted: a.time.trusted,
        durationMs: a.file.durationMs || null,
        segments: segs,
      });
    }

    const segmentCount = items.reduce((n, i) => n + i.segments.length, 0);
    const untrusted = items.filter((i) => !i.timeTrusted).length;

    const videos = items.filter((i) => i.video).length;

    return {
      items,
      skipped,
      counts: {
        files: items.length,
        videos,
        segments: segmentCount,
        skipped: skipped.length,
        untimed: untimed.length,
        untrustedTimes: untrusted,
      },
      totalAudioMs: totalMs,
      // Whisper runs roughly at or a little faster than real time on
      // `base`. Stated as a range, and stated as a GUESS, because the
      // machine and model decide it.
      estimate: totalMs
        ? { lowMs: Math.round(totalMs * 0.4), highMs: Math.round(totalMs * 1.2), basis: 'rough, model- and CPU-dependent' }
        : null,
      warnings: buildWarnings(items, untimed, untrusted),
      spanned: spanOf(items),
    };
  }

  function buildWarnings(items, untimed, untrusted) {
    const w = [];
    const videos = items.filter((i) => i.needsExtraction).length;
    if (videos) {
      w.push({
        code: 'NEEDS_AUDIO_EXTRACTION',
        message: videos + ' video file(s) selected. Only the audio track is used \u2014 nothing is ' +
                 'inferred from the picture. ffmpeg must be available to extract it, or these will ' +
                 'fail at transcription rather than here.',
      });
    }
    if (untrusted) {
      w.push({
        code: 'UNTRUSTED_ORDER',
        message: untrusted + ' note(s) were ordered by file modification time, which changes when ' +
                 'a file is copied or synced. Their position in the sequence may be wrong.',
      });
    }
    if (untimed.length) {
      w.push({
        code: 'NO_TIMESTAMP',
        message: untimed.length + ' note(s) have no usable date and were placed at the end rather than ' +
                 'guessed into the middle of your history.',
      });
    }
    return w;
  }

  function spanOf(items) {
    const times = items.map((i) => i.recordedAt).filter((t) => Number.isFinite(t));
    if (!times.length) return null;
    return { fromMs: Math.min(...times), toMs: Math.max(...times) };
  }

  // Flatten a plan into queue-ready segments, in order. This is the
  // handoff: from here the transcription queue cannot tell an imported
  // note from something spoken into the microphone.
  function toQueueSegments(planResult) {
    const out = [];
    for (const item of planResult.items) {
      for (const s of item.segments) {
        out.push({
          ref: { path: s.path, offsetMs: s.offsetMs, durationMs: s.durationMs },
          capturedAt: s.capturedAt,
          durationMs: s.durationMs,
          provenance: {
            source: 'voice-note-import',
            file: item.name,
            hash: item.hash,
            timeSource: item.timeSource,
            timeTrusted: item.timeTrusted,
            segment: s.index + 1,
            ofSegments: s.of,
          },
        });
      }
    }
    return out;
  }

  return {
    AUDIO_EXT, VIDEO_EXT, DEFAULT_SEGMENT_MS, SEGMENT_OVERLAP_MS,
    isAudio, isVideo, dateFromName, resolveRecordedAt, segmentsFor,
    plan, toQueueSegments,
  };
});
