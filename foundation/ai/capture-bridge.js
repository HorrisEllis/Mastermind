// ═══════════════════════════════════════════════════════════════════
// CAPTURE BRIDGE
// foundation/ai/capture-bridge.js
//
// Where speech becomes nodes.
//
// The transcription queue releases text in the order it was spoken.
// This turns each release into a lattice node with its provenance
// intact, and nothing else. There is no text-entry surface here and
// there is not meant to be: capture is voice and video.
//
// ─────────────────────────────────────────────────────────────────
// WHY THIS IS THIN
//
// It nearly was not. modules/lattice/lattice.js already does the hard
// part — tagging, Jaccard association with a stopword floor, sequence
// edges with an inferred relation, shared-tag edges, bounded lookback.
// It is a better engine than the 2026-03 build it descends from, which
// linked on a single shared four-letter word and produced a hairball.
//
// So this file connects two things that already worked and were never
// introduced. That is the whole job.
//
// ─────────────────────────────────────────────────────────────────
// WHAT IT ADDS ON TOP OF latticeIngest
//
//   • provenance   — human speech, which file or the live mic, whether
//                    the timestamp is trustworthy (DR-003 requires the
//                    author of every node to be recoverable)
//   • mode         — which capture mode produced it. P8 compartments
//                    cannot weigh a sandbox thought differently from an
//                    observation unless this is present from the start.
//   • seeds        — the one boolean from the 2026-03 build that turns
//                    capture into selection
//   • gaps         — a segment whose transcription FAILED still becomes
//                    a node, marked unreadable. A hole you can see beats
//                    a hole you cannot, and silently dropping it would
//                    leave a break in the sequence edges with no
//                    explanation.
//
// UUID: 4a3b2c1d-ai-8000-8000-capturebrdg1
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.CaptureBridge = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const MODES = Object.freeze({
    EXTERNALIZING: 'externalizing',   // getting it out, judgement suspended
    INTROSPECTING: 'introspecting',   // looking inward
    PROCESSING:    'processing',      // working a problem
    IMPORTED:      'imported',        // a recording from before this session
  });

  // Seed detection. Deliberately mechanical: a seed is something you
  // said you would do or wanted, not something a model decided was
  // important about you.
  const SEED_PATTERNS = [
    { re: /\bi (?:want|need) to\b/i,                     priority: 'High' },
    { re: /\bi should\b/i,                               priority: 'Medium' },
    { re: /\bwhat if\b/i,                                priority: 'Medium' },
    { re: /\bidea[: ]|\bthe idea is\b/i,                 priority: 'High' },
    { re: /\bnote to self\b|\bremember to\b/i,           priority: 'High' },
    { re: /\bi keep (?:meaning|forgetting) to\b/i,       priority: 'High' },
  ];

  function detectSeed(text) {
    for (const p of SEED_PATTERNS) {
      if (p.re.test(text)) return { seed: true, priority: p.priority };
    }
    return { seed: false, priority: null };
  }

  const STATE = {
    mode: MODES.EXTERNALIZING,
    session: null,
    ingested: 0,
    gaps: 0,
    lastNodeId: null,
  };

  function beginSession(kind, meta) {
    STATE.session = {
      id: 'S' + Date.now().toString(36),
      kind: kind || 'live',           // 'live' | 'import'
      startedAt: new Date().toISOString(),
      meta: meta || {},
      count: 0,
    };
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.capture.session.start', STATE.session);
    return STATE.session;
  }

  function endSession() {
    const s = STATE.session;
    STATE.session = null;
    if (s && typeof MM_BUS !== 'undefined') {
      MM_BUS.emit('mm.capture.session.end', Object.assign({ endedAt: new Date().toISOString() }, s));
    }
    return s;
  }

  function setMode(mode) {
    if (!Object.values(MODES).includes(mode)) throw new Error('unknown capture mode: ' + mode);
    STATE.mode = mode;
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.capture.mode', { mode });
    return mode;
  }

  // Build the node payload. Pure — separated from ingestion so the shape
  // is testable without a lattice present.
  function buildNode(text, meta) {
    const m = meta || {};
    const failed = text === null || text === undefined;
    const clean = failed ? '' : String(text).trim();

    const seed = failed ? { seed: false, priority: null } : detectSeed(clean);

    return {
      text: clean,
      unreadable: failed,
      meta: {
        // Provenance — DR-003. Who made this, and from what.
        provenance: {
          author: 'human',
          via: m.source === 'voice-note-import' ? 'recording' : 'microphone',
          source: m.source || 'live',
          file: m.file || null,
          transcriber: m.transcriber || 'whisper-local',
          timeTrusted: m.timeTrusted !== false,
        },
        mode: m.mode || STATE.mode,
        sessionId: STATE.session ? STATE.session.id : null,
        seq: m.seq != null ? m.seq : null,
        spokenAt: m.capturedAt ? new Date(m.capturedAt).toISOString() : null,
        durationMs: m.durationMs || null,
        seedFlag: seed.seed,
        seedPriority: seed.priority,
      },
    };
  }

  // Hand one released segment to the lattice.
  function ingest(text, meta) {
    const node = buildNode(text, meta);

    if (node.unreadable) {
      STATE.gaps++;
      // Still recorded. The sequence edge from the segment before to the
      // segment after would otherwise jump a gap with nothing to explain
      // it, and "I said something here that could not be read" is itself
      // information.
      if (typeof latticeIngest === 'function') {
        const r = latticeIngest('capture.gap', node.meta.sessionId || 'session',
          '[unreadable audio]', { extra: node.meta });
        STATE.lastNodeId = r ? r.id : STATE.lastNodeId;
        return r;
      }
      return null;
    }

    if (!node.text) return null;

    if (typeof latticeIngest !== 'function') {
      MMLog?.warn('capture', 'Lattice not loaded — transcript not ingested');
      return null;
    }

    const r = latticeIngest('capture.speech', node.meta.sessionId || 'session', node.text, {
      extra: node.meta,
    });

    // Feed the lexicon in spoken order. This is why the transcription
    // queue's ordering guarantee matters here and not only in the lattice:
    // the tag-transition grammar is a Markov chain, and a shuffled
    // sequence teaches it productions that never happened.
    if (typeof MM_LEXICON !== 'undefined' && MM_LEXICON && (OPTS?.lexicon_learn !== false)) {
      try {
        MM_LEXICON.observe(node.text, {
          tags: (r && r.tags) || [],
          at: node.meta.spokenAt || new Date().toISOString(),
        });
      } catch (e) { MMLog?.warn('capture', 'Lexicon observe failed: ' + e.message); }
    }

    STATE.ingested++;
    if (STATE.session) STATE.session.count++;
    STATE.lastNodeId = r ? r.id : STATE.lastNodeId;

    if (typeof MM_BUS !== 'undefined') {
      MM_BUS.emit('mm.capture.node', { id: r && r.id, seed: node.meta.seedFlag, mode: node.meta.mode });
    }
    if (node.meta.seedFlag && typeof mm_toast === 'function') {
      mm_toast('\u25C6 seed \u00B7 ' + node.text.slice(0, 60), 'vault', { dur: 2500 });
    }

    // Marking dirty rather than saving: a capture session produces a node
    // every few seconds, and a vault write per utterance would be a write
    // amplification problem, not a durability improvement.
    if (typeof vaultDirtySave === 'function') vaultDirtySave(6000);

    return r;
  }

  // Attach to a transcription queue. The queue releases in spoken order;
  // this preserves that order into the lattice, which is what makes the
  // sequence edges and the tag-transition grammar mean anything.
  function attach(queue, meta) {
    if (!queue) throw new Error('attach: a transcription queue is required');
    const base = meta || {};
    queue.onRelease = (text, info) => {
      ingest(text, Object.assign({}, base, {
        seq: info.seq,
        capturedAt: info.capturedAt,
        durationMs: info.durationMs,
      }, info.failed ? { failed: true } : {}));
      if (info.failed) ingest(null, Object.assign({}, base, { seq: info.seq, capturedAt: info.capturedAt }));
    };
    return queue;
  }

  function stats() {
    return {
      mode: STATE.mode,
      session: STATE.session ? { id: STATE.session.id, kind: STATE.session.kind, count: STATE.session.count } : null,
      ingested: STATE.ingested,
      gaps: STATE.gaps,
      lastNodeId: STATE.lastNodeId,
    };
  }

  return {
    MODES, SEED_PATTERNS, STATE,
    detectSeed, buildNode, ingest, attach,
    beginSession, endSession, setMode, stats,
  };
});
