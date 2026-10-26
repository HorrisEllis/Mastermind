// ═══════════════════════════════════════════════════════════════════
// VOICE LATTICE — CAPTURE SURFACE
// modules/voice-lattice/ui-capture.js
//
// The orb, the waveform, and the always-visible lattice canvas.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THIS REPLACES AND WHY
//
// An 800-pixel blank textarea asking "What's moving through you right
// now?". For a module whose stated purpose is reducing overwhelm, a
// blank box that large IS the overwhelm — it asks you to compose, and
// composing is the load being removed. Speaking has no blank page.
//
// Typing survives as a two-line field, deliberately secondary.
//
// ─────────────────────────────────────────────────────────────────
// THE LATTICE IS NOT A DESTINATION
//
// v7 put the graph behind one of nine tabs. It is now the centre
// column, always visible, so a node appearing and wiring itself is the
// feedback for having spoken. No tab switch, no navigation.
//
// Physics constants are the salvaged ones (phasemap/salvage/):
// centre gravity .004, inverse-square repulsion, spring attraction .6,
// damping .85. Tag colours from VL_TAG_COL.
//
// UUID: 4a3b2c1d-mod-9000-8000-vlcapture001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const VL_TAG_COL = {
  SYS: '#00c8ff', REL: '#11ddcc', GAP: '#ff3355', LOOP: '#cc44ff',
  BLOCK: '#ff8c22', SEED: '#00ff88', FRICTION: '#ffe04a',

  // ── Semantic-field tags (foundation/ai/pattern-detect.js) ─────────
  // Colors deliberately distinct from the seven above — these come from
  // a different classifier (vocabulary co-occurrence, not literal
  // keyword/heuristic match) and should read as their own family on
  // the canvas, not blend into it.
  SELF: '#4a9eff', OTHER: '#8a6fff', PAST: '#7a7a8a', FUTURE: '#22ddaa',
  BODY: '#ff6b9d', EMOTION: '#ff4d6a', COGNITION: '#4dd0ff',
  RELATIONSHIP: '#2ecfae', CONFLICT: '#ff5533', RESOLUTION: '#5cff8f',
  UNCERTAINTY: '#c9a84c', AGENCY: '#c084ff',

  // GapHunter taxonomy weights ASSUMPTION as the single highest-
  // criticality gap type (1.00 — "the most avoided; always most
  // load-bearing"). Brightest, most alarming red in the set, on purpose.
  ASSUMPTION: '#ff0033',

  // MASTERMIND's own literal domain words, kept from the prior tagger.
  SHADOW: '#663399', GROWTH: '#33cc66', HORIZON: '#3399ff', SYSTEMS: '#00c8ff', IDENTITY: '#ffaa00',
};

const VL_UI = {
  recording: false,
  activeSource: null,      // null | 'local' | 'phone' — see _vlBeginCapture/_vlEndCapture.
                            // ONE at a time, deliberately: interleaving raw frames from
                            // two live microphones into one VAD/segment stream would
                            // produce garbled audio, not "better" audio. True
                            // simultaneous dual-source capture is a real, separate
                            // feature (mixing, not sharing a pipeline) — not this.
  mode: 'externalizing',
  startedAt: 0,
  timerId: null,
  waveRAF: null,
  latRAF: null,
  audioCtx: null,
  analyser: null,
  procNode: null,          // ScriptProcessorNode — raw PCM tap, separate from the analyser's visualization-only one
  segSeq: 0,               // monotonic, for the on-disk segment filename
  silentGain: null,        // routes procNode to destination at 0 gain so onaudioprocess actually fires, without audible feedback
  stream: null,
  transcribing: false,
  whisperAvailable: null,  // null = not checked yet this session; cached after first check so every click doesn't spawn a probe process

  // ── VAD segmentation state ─────────────────────────────────────
  // Continuous capture, cut into utterance-sized segments by silence,
  // each transcribed and turned into a node the moment it's ready —
  // not one giant buffer transcribed after the orb is clicked off.
  // See _vlFinalizeSegment() for why this is the "no losing data" fix.
  vad: null,               // RecallCore.RecallVAD instance
  preBuffer: [],           // rolling PCM chunks held BEFORE speech is detected, so onset isn't clipped
  segmentChunks: null,     // chunks for the segment currently being spoken; null when not mid-segment
  segmentStartedAt: 0,
  queue: null,             // TranscribeQueue instance — ordered, concurrent, never silently drops

  // A phone-driven capture has no local AnalyserNode (no getUserMedia
  // ever ran on this machine), so the waveform can't read from one.
  // vlPhoneBridge keeps this filled with the latest samples instead —
  // same draw code as the local path, different sample source. See
  // _vlStartWave()'s two branches.
  phoneWaveBuf: new Float32Array(1024),

  // Physics bodies, keyed by node id. Kept separate from the node data
  // so the lattice can be re-laid-out without touching what was said.
  bodies: new Map(),
  edges: [],
};

// Defaults mirror RecallCore's; both are overridable from Options → AI
// (OPTS.voice_*) so "too sensitive" / "cuts off my first word" is a
// slider, not a code change.
function _vlVadOpts() {
  const o = (typeof OPTS !== 'undefined' && OPTS) || {};
  return {
    // Lower threshold = more sensitive. Sensitivity and clarity are not
    // opposed here: the threshold decides what gets CAPTURED, and whisper
    // decides what it can read. Capturing too little is unrecoverable;
    // capturing too much costs a discarded segment.
    threshold: o.voice_vad_threshold ?? RecallCore.DEFAULT_RMS_THRESHOLD,
    silenceHoldMs: o.voice_silence_hold_ms ?? RecallCore.DEFAULT_SILENCE_HOLD_MS,
    // 5 seconds. The pre-roll is what stops voice activation clipping the
    // start of a thought — you speak before the detector agrees you have.
    // 800ms caught a syllable; 5s catches the run-up.
    prerollMs: o.voice_preroll_ms ?? 5000,
    maxSegmentMs: o.voice_max_segment_ms ?? 25000,
    model: o.voice_whisper_model || undefined,
  };
}

// ── Orb ────────────────────────────────────────────────────────────

async function vlOrbToggle() {
  if (!VL_UI.recording) return vlOrbStart();

  // The orb showing "recording" doesn't mean the LOCAL mic is what's
  // doing it anymore — a phone session can put it in that state with
  // this orb's own getUserMedia never having run. Offering to
  // end/background/hand-off "the orb's mic" here would be talking about
  // a mic that isn't there. Say what's actually true and point at the
  // control that owns it.
  if (VL_UI.activeSource === 'phone') {
    if (typeof mm_toast === 'function') {
      mm_toast('Recording via phone right now \u2014 stop it from the phone panel, or tap the phone itself.', 'warn', { dur: 6000 });
    }
    return { ok: false, reason: 'SOURCE_IS_PHONE' };
  }

  // Stopping the orb used to always mean "end the session" — the only
  // way to keep capturing was to never click it. Three real, different
  // outcomes exist here; ask rather than pick one silently.
  const choice = await (typeof mmChoice === 'function'
    ? mmChoice(
        'You\u2019re about to stop the orb.',
        [
          { id: 'end',    label: 'END SESSION',                hint: 'Stop, close this session, save.', tone: 'critical' },
          { id: 'tray',   label: 'KEEP RECORDING \u2014 MINIMIZE TO TRAY', hint: 'Mic stays live, window hides. Reopen from the tray icon.', tone: 'primary' },
          { id: 'recall', label: 'SWITCH TO BACKGROUND LISTENING', hint: 'Stop active capture; Recall keeps listening for speech and picks segments up on its own.' },
        ],
        { title: 'STOP THE ORB?' }
      )
    : Promise.resolve('end')); // mm-dialogs not loaded (tests/older HTML) — fall back to the old, unconditional behaviour

  if (choice === null) return { ok: false, cancelled: true }; // dismissed — orb stays exactly as it was

  if (choice === 'tray') {
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.lattice.capture.backgrounded', { mode: 'orb' });
    try { await window.NXAPI?.close?.(); } catch (e) {} // hides to tray; main.js's close handler does not quit
    return { ok: true, backgrounded: 'orb' };
  }

  if (choice === 'recall') {
    const stopped = vlOrbStop(); // real hard stop — releases the orb's own mic tap first
    try {
      if (typeof RECALL !== 'undefined') {
        RECALL.enabled = true;
        if (typeof OPTS !== 'undefined') OPTS.voice_recall = true;
        if (typeof recallStart === 'function') await recallStart();
      }
    } catch (e) { MMLog?.warn('lattice', 'recall handoff failed: ' + e.message); }
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.lattice.capture.backgrounded', { mode: 'recall' });
    try { await window.NXAPI?.close?.(); } catch (e) {}
    return Object.assign({}, stopped, { backgrounded: 'recall' });
  }

  return vlOrbStop(); // 'end' — the original, unconditional path
}

// Checked once per session (cached in VL_UI.whisperAvailable) rather than
// on every click — whisper:detect spawns a process to probe for a binary,
// and that cost doesn't need paying twice if nothing on the machine
// changed between clicks.
async function _vlEnsureWhisper() {
  if (VL_UI.whisperAvailable !== null) return VL_UI.whisperAvailable;
  if (!window.NXAPI?.whisperDetect) {
    VL_UI.whisperAvailable = { ok: false, message: 'Transcription requires the desktop app.' };
    return VL_UI.whisperAvailable;
  }
  try {
    VL_UI.whisperAvailable = await window.NXAPI.whisperDetect({});
  } catch (e) {
    VL_UI.whisperAvailable = { ok: false, message: e.message };
  }
  return VL_UI.whisperAvailable;
}

// Creates the queue once (lazily — the rolling-recall bridge can also
// need it, without the orb ever having been clicked this session) and
// wires its release/backpressure handlers exactly once.
function _vlEnsureQueue() {
  if (VL_UI.queue) return VL_UI.queue;
  VL_UI.queue = TranscribeQueue.create({ maxPending: 40, maxConcurrent: 2, maxAttempts: 2 });

  // Each segment lands here the moment ITS transcription completes, in
  // spoken order — not batched, not waiting for the mic to stop. This is
  // the actual "save the moment it transcribes" fix: vlAddNode() calls
  // vlSave() internally, so a segment is durable within moments of being
  // spoken, however long the rest of the session runs.
  VL_UI.queue.onRelease = (text, info) => {
    if (info.failed) {
      // A failed segment still becomes a node — a visible gap beats a
      // silent one. "No losing data" includes knowing something was lost.
      const secs = Math.max(1, Math.round((info.durationMs || 0) / 1000));
      if (typeof vlAddNode === 'function') {
        vlAddNode('[unreadable audio \u2014 ~' + secs + 's]');
      }
    } else if (text) {
      // A successful transcription that came back EMPTY is not a
      // failure — RMS caught something loud enough to count as speech,
      // but whisper legitimately heard nothing worth transcribing (a
      // cough, a door, silence with a click). That is not a gap; it is
      // nothing, and nothing does not need a node.
      const utterances = VLAudioEncode.splitUtterances(text);
      for (const u of (utterances.length ? utterances : [text])) {
        if (typeof vlAddNode === 'function') vlAddNode(u);
      }
    }
    _vlUpdateQueueStatus();
  };
  VL_UI.queue.onBackpressure = (info) => {
    if (typeof mm_toast === 'function') mm_toast(info.message, 'warn', { dur: 6000 });
    _vlUpdateQueueStatus();
  };
  return VL_UI.queue;
}

// Pulls as much work as maxConcurrent allows. Safe to call repeatedly —
// nextRunnable() returns null once at capacity, so extra calls are cheap
// no-ops. Re-invoked after every completion to keep the pipe full.
function _vlKickQueue() {
  if (!VL_UI.queue) return;
  let item;
  while ((item = VL_UI.queue.nextRunnable())) {
    VL_UI.queue.markRunning(item.seq);
    _vlUpdateQueueStatus();
    _vlRunOne(item);
  }
}

async function _vlRunOne(item) {
  try {
    const cfg = {};
    if (_vlVadOpts().model) cfg.model = _vlVadOpts().model;

    // ACCURACY LOOP — was designed (lexicon.promptSeed) and never wired.
    // Your own distinctive vocabulary, fed back to Whisper as the initial
    // prompt, is the largest accuracy gain available for personal speech
    // per the comment already sitting in whisper.js. It compounds: better
    // transcripts -> richer lexicon -> better prompt next segment.
    // Toggle: OPTS.lexicon_prompt — this flag already existed (Options
    // panel checkbox "opt-lexicon-prompt" has been there since before
    // this fix) with the comment "seed Whisper with your own distinctive
    // words" and was never actually connected to anything. Fixed here,
    // not by inventing a new flag next to an unused one.
    const o = (typeof OPTS !== 'undefined' && OPTS) || {};
    if (o.lexicon_prompt !== false && typeof MM_LEXICON !== 'undefined' && MM_LEXICON) {
      try {
        const words = MM_LEXICON.promptSeed(o.voice_prompt_seed_count || 40);
        if (words && words.length) cfg.promptWords = words;
      } catch (e) { MMLog?.warn('lattice', 'prompt seed skipped: ' + e.message); }
    }
    if (o.voice_whisper_language) cfg.language = o.voice_whisper_language;
    if (o.voice_whisper_threads)  cfg.threads  = o.voice_whisper_threads;
    if (o.voice_whisper_timeout_ms) cfg.timeoutMs = o.voice_whisper_timeout_ms;

    const res = await window.NXAPI.whisperTranscribe(item.ref, cfg);
    if (res.ok) VL_UI.queue.markDone(item.seq, res.text);
    else VL_UI.queue.markFailed(item.seq, new Error(res.message || res.reason || 'transcription failed'));
  } catch (e) {
    VL_UI.queue.markFailed(item.seq, e);
  }
  _vlKickQueue();
}

function _vlUpdateQueueStatus() {
  const el = document.getElementById('vl-queue-status');
  if (!el || !VL_UI.queue) return;
  const s = VL_UI.queue.stats();
  if (!s.pending && !VL_UI.recording) { el.textContent = ''; return; }
  el.textContent = s.pending ? ('transcribing ' + s.pending + '\u2026') : '';
}

// The actual fix for "transcribe from the buffer, not after you click
// stop": a completed segment (silence closed it, the orb was stopped
// mid-word, or the safety-valve length cap fired) is encoded and handed
// to the queue IMMEDIATELY — never held until the recording session
// ends. A crash, a force-quit, a power cut mid-session loses at most the
// segment still being spoken, not everything said before it.
// ── One frame in ──────────────────────────────────────────────────
// The single ingest point for captured audio, whatever produced it.
// The local microphone calls this from onaudioprocess; the phone calls
// it from the IPC audio handler after converting Int16 back to Float32.
//
// Keeping it as one function is the whole reason a phone is an input
// device and not a parallel capture path: same VAD hysteresis, same
// pre-roll, same segment boundaries, same ordered queue, same
// disk-first write. A second pipeline would have drifted from this one
// the first time either was touched.
function vlIngestFrame(chunk, sampleRate) {
  if (!VL_UI.recording || !VL_UI.vad) return;
  const rate = sampleRate || VL_UI.audioCtx?.sampleRate || 48000;
  const chunkMs = (chunk.length / rate) * 1000;
  const ev = VL_UI.vad.push(RecallCore.rms(chunk), Date.now(), RecallCore.zcr(chunk));

  if (VL_UI.segmentChunks === null) {
    // Not mid-utterance — hold a rolling pre-buffer so that when speech
    // IS detected, the segment can reach backward and include the
    // syllable already spoken before detection caught up.
    VL_UI.preBuffer.push(chunk);
    const preroll = _vlVadOpts().prerollMs;
    let bufMs = VL_UI.preBuffer.length * chunkMs;
    while (VL_UI.preBuffer.length > 1 && bufMs > preroll) {
      VL_UI.preBuffer.shift();
      bufMs -= chunkMs;
    }
  }

  if (ev === 'start') {
    VL_UI.segmentChunks = VL_UI.preBuffer;
    VL_UI.preBuffer = [];
    VL_UI.segmentChunks.push(chunk);
    VL_UI.segmentStartedAt = Date.now();
  } else if (VL_UI.segmentChunks !== null) {
    VL_UI.segmentChunks.push(chunk);
    // Safety valve: minutes of speech with no real pause would grow one
    // segment unboundedly. Flush what has accumulated and keep going;
    // the VAD's own hysteresis is untouched.
    if (Date.now() - VL_UI.segmentStartedAt > _vlVadOpts().maxSegmentMs) {
      _vlFinalizeSegment(true);
    }
  }

  if (ev === 'end') _vlFinalizeSegment(false);
}

// "Crystal clear" — Clarity.prepare() (foundation/ai/clarity.js) does
// what naive resampling never did: DC-offset removal (a common mic
// hardware artifact, low-frequency drift that isn't voice), a high-pass
// filter below the human voice fundamental (rumble/handling noise), a
// genuinely ANTI-ALIASED resample to 16kHz (aliasing from a plain
// linear-interpolation downsample is exactly the kind of artifact that
// muddies what Whisper hears), and gain normalization with limiting so
// quiet speech isn't lost and loud speech isn't clipped. It was fully
// built and tested and never once called from the live capture path —
// this is that call. Deliberately does NOT denoise/EQ/compress; see its
// own REFUSED list for why each of those would hurt more than help.
function _vlPrepareWav(chunks, nativeRate) {
  if (typeof Clarity === 'undefined') {
    // Graceful degrade if clarity.js somehow didn't load — the old
    // path, not a crash.
    return VLAudioEncode.chunksToWav16k(chunks, nativeRate);
  }
  const merged = VLAudioEncode.concatFloat32(chunks);
  const prepared = Clarity.prepare(merged, nativeRate);
  return VLAudioEncode.encodeWav(prepared.audio, prepared.sampleRate);
}

function _vlFinalizeSegment(stillSpeaking) {
  const chunks = VL_UI.segmentChunks;
  VL_UI.segmentChunks = stillSpeaking ? [] : null;
  if (stillSpeaking) VL_UI.segmentStartedAt = Date.now();
  if (!chunks || !chunks.length) return;

  const nativeRate = VL_UI.audioCtx?.sampleRate || 48000;
  const totalSamples = chunks.reduce((n, c) => n + c.length, 0);
  const seconds = totalSamples / nativeRate;
  if (seconds < 0.3) return; // too short to plausibly contain a word

  const wav = _vlPrepareWav(chunks, nativeRate);
  const seq = ++VL_UI.segSeq;

  // ── AUDIO TO DISK BEFORE TRANSCRIPTION ────────────────────────────
  // Until now a segment existed only as bytes in the queue. If whisper
  // failed, the app closed, or the process died, the recording went with
  // it — there was nothing on disk to recover. Writing first means the
  // failure mode is a missing transcript, not a missing recording.
  //
  // Deliberately not awaited: the queue must not stall behind a disk
  // write, and a slow disk should never cost captured audio.
  try {
    window.NXAPI?.captureWriteSegment?.(seq, wav.buffer || wav)
      .then(r => { if (!r?.ok) MMLog?.warn('lattice', 'segment ' + seq + ' not written: ' + r?.error); })
      .catch(e => MMLog?.warn('lattice', 'segment ' + seq + ' not written: ' + e.message));
  } catch (e) { MMLog?.warn('lattice', 'segment ' + seq + ' not written: ' + e.message); }

  _vlEnsureQueue().enqueue({ capturedAt: Date.now(), durationMs: Math.round(seconds * 1000), ref: wav, seq });
  _vlUpdateQueueStatus();
  _vlKickQueue();
}

// ── Shared capture core — session, VAD, timer, wave, orb visuals ────
// Split out of what used to be all of vlOrbStart/vlOrbStop so a source
// OTHER than the local microphone (the phone, via ui-phone.js) can
// drive the identical session/VAD/queue machinery without needing
// getUserMedia to succeed on THIS machine at all. Before this split,
// starting phone streaming could never reach any of this — VL_UI.recording
// only ever became true inside vlOrbStart, which required a local mic
// grant first. Every phone frame arrived, was reassembled correctly,
// and was then silently dropped at vlIngestFrame's `if (!VL_UI.recording)`
// gate, because nothing on the phone path ever set it.
//
// One source at a time (VL_UI.activeSource) — see its definition above
// for why concurrent local+phone is refused, not silently mixed.
function _vlBeginCapture(source, opts) {
  if (VL_UI.recording) {
    if (VL_UI.activeSource === source) return { ok: true, already: true };
    return {
      ok: false,
      reason: 'SOURCE_BUSY',
      message: (VL_UI.activeSource === 'local' ? 'Desktop microphone' : 'Phone') +
        ' is already recording. Stop it before switching to ' +
        (source === 'local' ? 'the desktop microphone' : 'the phone') + '.',
    };
  }

  const o = opts || {};
  const icon = document.getElementById('vl-orb-icon');
  const label = document.getElementById('vl-orb-label');
  const outer = document.getElementById('vl-orb-outer');

  const vadOpts = _vlVadOpts();
  VL_UI.vad = new RecallCore.RecallVAD({ threshold: vadOpts.threshold, silenceHoldMs: vadOpts.silenceHoldMs });
  VL_UI.preBuffer = [];
  VL_UI.segmentChunks = null;
  _vlEnsureQueue();

  VL_UI.recording = true;
  VL_UI.activeSource = source;
  VL_UI.startedAt = Date.now();
  if (outer) outer.classList.add('recording');
  if (source === 'phone' && outer) outer.classList.add('recording-remote'); // see CSS: same pulse, distinct hue — the desktop orb showing what's actually feeding it, not pretending it's the local mic
  if (icon) icon.textContent = '\u25a0';
  if (label) label.textContent = o.label || 'LISTENING \u2014 CLICK TO STOP';

  VL_UI.timerId = setInterval(vlTickTimer, 250);
  _vlStartWave();

  // ONE session per recording, opened here and closed on stop. kind
  // reflects which source is actually feeding it — the Sessions tab
  // (nexus-engine.js, _vlRenderSessionDetail) already renders whatever
  // string lands here, so 'phone' shows up correctly with no UI change.
  if (typeof CaptureBridge !== 'undefined' && !CaptureBridge.stats().session) {
    try {
      const s = CaptureBridge.beginSession(source === 'phone' ? 'phone' : 'live', { mode: VL_UI.mode, source });
      // Ledger gets a tamper-evident marker that a session STARTED —
      // counts/id/mode only, never content (the ledger is plaintext by
      // design; see vault-ledger.js). Matched by CAPTURE_SESSION_END on
      // the corresponding _vlEndCapture. Best-effort, same as every
      // other _ledgerAppend call.
      if (s && typeof _ledgerAppend === 'function') {
        _ledgerAppend('capture.session.start', { sessionId: s.id, kind: s.kind, mode: VL_UI.mode, source });
      }
      // main.js writes segment WAVs to CFG.dataDir/capture/<folder>/ —
      // tell it which session this is so the folder is keyed to the
      // actual recording, not just "whenever the app happened to launch".
      // See main.js capture:writeSegment / capture:sessionStarted.
      if (s) { try { window.NXAPI?.captureSessionStarted?.(s.id); } catch (e) {} }
    } catch (e) { MMLog?.warn('lattice', 'session not opened: ' + e.message); }
  }

  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.lattice.capture.start', { mode: VL_UI.mode, source });
  return { ok: true };
}

function _vlEndCapture(source) {
  if (!VL_UI.recording || VL_UI.activeSource !== source) return { ok: true, wasActive: false };

  VL_UI.recording = false;
  VL_UI.activeSource = null;
  const icon = document.getElementById('vl-orb-icon');
  const label = document.getElementById('vl-orb-label');
  const outer = document.getElementById('vl-orb-outer');

  if (outer) { outer.classList.remove('recording'); outer.classList.remove('recording-remote'); }
  if (icon) icon.textContent = '\u25c9';

  // Whatever was mid-utterance when capture stopped is still real speech
  // — flush it into the queue rather than discard it. This is the other
  // half of "no losing data": stopping capture must not mean stopping
  // the pipeline for audio already captured.
  if (VL_UI.segmentChunks) _vlFinalizeSegment(false);
  VL_UI.vad = null;
  VL_UI.preBuffer = [];

  clearInterval(VL_UI.timerId); VL_UI.timerId = null;
  _vlStopWave();

  // Close the session only when recording actually stops — not per node.
  if (typeof CaptureBridge !== 'undefined' && CaptureBridge.stats().session) {
    try {
      const closed = CaptureBridge.endSession();
      if (closed) _vlCloseSessionHistory(closed);
    } catch (e) { MMLog?.warn('lattice', 'session close failed: ' + e.message); }
  }
  if (typeof vaultSave === 'function') vaultSave(false);

  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.lattice.capture.stop', { source });

  const label2 = document.getElementById('vl-orb-label');
  const s = VL_UI.queue ? VL_UI.queue.stats() : { pending: 0 };
  if (label2) label2.textContent = s.pending ? 'FINISHING TRANSCRIPTION\u2026' : 'CLICK TO CAPTURE';
  _vlUpdateQueueStatus();
  return { ok: true, wasActive: true, pending: s.pending };
}

async function vlOrbStart() {
  const label = document.getElementById('vl-orb-label');

  if (VL_UI.recording && VL_UI.activeSource === 'phone') {
    if (typeof mm_toast === 'function') {
      mm_toast('Phone is already recording. Stop it in the phone panel to switch to the desktop mic.', 'warn', { dur: 5000 });
    }
    return { ok: false, reason: 'SOURCE_BUSY' };
  }

  // Transcription before microphone. Recording audio nobody can ever turn
  // into a node is a §1.2 pretend just as much as a fake waveform — the
  // orb spinning for a full session and producing nothing, silently, is
  // exactly the failure mode this check exists to prevent.
  const whisper = await _vlEnsureWhisper();
  if (!whisper.ok) {
    if (label) label.textContent = 'VOICE UNAVAILABLE \u2014 TYPE BELOW';
    if (typeof mm_toast === 'function') {
      mm_toast(whisper.message || 'Local transcription is not available.', 'warn', { dur: 7000 });
    }
    return { ok: false, error: whisper.message || 'whisper unavailable' };
  }

  // Microphone next. If it is refused there is nothing to record, and
  // showing a recording state anyway would be a §1.2 pretend.
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no microphone API in this runtime');
    VL_UI.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    if (label) label.textContent = 'NO MICROPHONE \u2014 TYPE BELOW';
    if (typeof mm_toast === 'function') mm_toast('Microphone unavailable: ' + e.message, 'warn');
    return { ok: false, error: e.message };
  }

  return _vlBeginCapture('local');
}

function vlOrbStop() {
  const res = _vlEndCapture('local');
  try { VL_UI.stream?.getTracks().forEach(t => t.stop()); } catch (e) {}
  VL_UI.stream = null;
  return res;
}

// Session history — the vault-side half. Builds one sessionHistory
// entry from every VL_STATE node tagged with this session's id (see
// node.sessionId in vlAddNode, nexus-engine.js), pushes it onto
// VL_STATE.sessionHistory (vault-encrypted, same as every node), and
// marks a matching counts-only entry in the plaintext audit ledger.
//
// Split deliberately: full node content — what was actually said —
// only ever goes into the vault. The ledger gets proof a session of
// N nodes happened between two timestamps, which is enough to notice
// "a session got deleted" without the ledger ever holding a single
// word anyone spoke. vault-ledger.js enforces this itself (512-byte
// cap, "must not carry vault content") — this keeps well under it by
// design, not because the cap forced a smaller version of the same
// idea.
function _vlCloseSessionHistory(session) {
  const nodeIds = VL_STATE.nodes.filter(n => n.sessionId === session.id).map(n => n.id);
  const tagSummary = {};
  for (const n of VL_STATE.nodes) {
    if (n.sessionId !== session.id) continue;
    for (const t of (n.tags || [])) tagSummary[t] = (tagSummary[t] || 0) + 1;
  }
  const endedAt = new Date().toISOString();
  const entry = {
    id: session.id,
    kind: session.kind,
    mode: (session.meta && session.meta.mode) || null,
    startedAt: session.startedAt,
    endedAt,
    nodeIds,
    nodeCount: nodeIds.length,
    tagSummary,
  };
  VL_STATE.sessionHistory.unshift(entry);
  if (VL_STATE.sessionHistory.length > 500) VL_STATE.sessionHistory.pop();

  if (typeof _ledgerAppend === 'function') {
    // Top 5 tags only, name+count — keeps this comfortably inside the
    // ledger's 512-byte-per-entry ceiling regardless of how many
    // distinct tags a long session accumulates.
    const topTags = Object.entries(tagSummary).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .reduce((o, [k, v]) => (o[k] = v, o), {});
    _ledgerAppend('capture.session.end', {
      sessionId: session.id, nodeCount: nodeIds.length, topTags,
      startedAt: session.startedAt, endedAt,
    });
  }
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.session.history.closed', { id: session.id, nodeCount: nodeIds.length });
}

function vlTickTimer() {
  const el = document.getElementById('vl-timer');
  if (!el) return;
  const s = Math.floor((Date.now() - VL_UI.startedAt) / 1000);
  el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  el.style.opacity = '1';
}

function vlSetCaptureMode(mode, btn) {
  VL_UI.mode = mode;
  document.querySelectorAll('.vl-mode-btn').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  if (typeof CaptureBridge !== 'undefined') {
    try { CaptureBridge.setMode(mode); } catch (e) {}
  }
}

// ── Waveform ───────────────────────────────────────────────────────
// Real amplitude from the live stream. Not an animation — if the line
// is flat, the microphone is not hearing you, and that is worth
// knowing before you have spoken for five minutes.

// Shared by both sources — takes a function that returns the samples to
// draw THIS frame, rather than reading an AnalyserNode directly, so the
// exact same line-drawing code serves the local mic (real AnalyserNode)
// and the phone (a plain rolling buffer, no AnalyserNode exists).
function _vlRunWaveLoop(cvs, ctx, getSamples) {
  const draw = () => {
    if (!VL_UI.recording) return;
    const buf = getSamples();
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.strokeStyle = '#7744ff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const mid = cvs.height / 2;
    for (let i = 0; i < cvs.width; i++) {
      const v = buf[Math.floor(i / cvs.width * buf.length)] || 0;
      const y = mid + v * mid * 2.4;
      i ? ctx.lineTo(i, y) : ctx.moveTo(i, y);
    }
    ctx.stroke();
    VL_UI.waveRAF = requestAnimationFrame(draw);
  };
  cvs.style.opacity = '1';
  draw();
}

function _vlStartWave() {
  const cvs = document.getElementById('vl-wave-cvs');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');

  if (!VL_UI.stream) {
    // Phone-driven — no local getUserMedia, so no AnalyserNode to read.
    // vlPhoneBridge (ui-phone.js) fills VL_UI.phoneWaveBuf on every
    // incoming frame; this just draws whatever's in there right now.
    _vlRunWaveLoop(cvs, ctx, () => VL_UI.phoneWaveBuf);
    return;
  }

  try {
    VL_UI.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = VL_UI.audioCtx.createMediaStreamSource(VL_UI.stream);
    VL_UI.analyser = VL_UI.audioCtx.createAnalyser();
    VL_UI.analyser.fftSize = 1024;
    src.connect(VL_UI.analyser);

    // A second, parallel tap on the same source: this one doesn't draw
    // anything, it feeds VAD segmentation — each utterance, bounded by
    // silence, is encoded and enqueued for transcription the moment it
    // ends, instead of one giant buffer saved for after the orb stops.
    // ScriptProcessorNode is deprecated but still universally supported
    // in Chromium/Electron and needs no separate worklet module file to
    // load. It must be connected through to destination (at zero gain,
    // so nothing is audible) or onaudioprocess never fires in Chromium.
    VL_UI.procNode = VL_UI.audioCtx.createScriptProcessor(4096, 1, 1);
    VL_UI.procNode.onaudioprocess = (e) => {
      if (!VL_UI.recording || !VL_UI.vad) return;
      // The phone feeds this same function. Extracted so a remote
      // microphone is an input DEVICE rather than a second capture
      // pipeline — one VAD, one pre-buffer, one segmenter, one queue.
      vlIngestFrame(new Float32Array(e.inputBuffer.getChannelData(0)),
                    VL_UI.audioCtx.sampleRate);
    };
    VL_UI.silentGain = VL_UI.audioCtx.createGain();
    VL_UI.silentGain.gain.value = 0;
    src.connect(VL_UI.procNode);
    VL_UI.procNode.connect(VL_UI.silentGain);
    VL_UI.silentGain.connect(VL_UI.audioCtx.destination);
  } catch (e) {
    MMLog?.warn('lattice', 'waveform/capture unavailable: ' + e.message);
    return;
  }

  _vlRunWaveLoop(cvs, ctx, () => {
    VL_UI.analyser.getFloatTimeDomainData(_vlAnalyserBuf);
    return _vlAnalyserBuf;
  });
}
const _vlAnalyserBuf = new Float32Array(1024); // fftSize above — allocated once, reused every frame

function _vlStopWave() {
  if (VL_UI.waveRAF) cancelAnimationFrame(VL_UI.waveRAF);
  VL_UI.waveRAF = null;
  try { VL_UI.procNode?.disconnect(); } catch (e) {}
  try { VL_UI.silentGain?.disconnect(); } catch (e) {}
  try { VL_UI.audioCtx?.close(); } catch (e) {}
  VL_UI.audioCtx = null; VL_UI.analyser = null; VL_UI.procNode = null; VL_UI.silentGain = null;
  const cvs = document.getElementById('vl-wave-cvs');
  if (cvs) {
    cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height);
    cvs.style.opacity = '.5';
  }
}

// ── Rolling Recall bridge ────────────────────────────────────────────
// recall.js runs its own always-on VAD independently of the orb (toggled
// in Options → AI, off by default) and emits a segment the moment its
// own silence-hold closes it, complete with the pre-roll baked in. It
// had no consumer — this is that consumer. Its segments arrive as
// MediaRecorder Blobs (compressed), not raw PCM like the orb's tap, so
// the one real step here is decoding audio back to samples before it can
// join the same WAV-encode-and-enqueue path the orb uses. Same queue,
// same vlAddNode() release, same "gap node on failure" — one pipeline
// feeding two capture sources, not two.
let _vlRecallBridgeWired = false;
function _vlWireRecallBridge() {
  if (_vlRecallBridgeWired || typeof MM_BUS === 'undefined' || !MM_BUS.on) return false;
  _vlRecallBridgeWired = true;
  MM_BUS.on('recall.segment.captured', async (payload) => {
    let ctx;
    try {
      const blob = new Blob(payload.blobs);
      const arrayBuf = await blob.arrayBuffer();
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      const pcm = audioBuf.getChannelData(0);
      if (pcm.length / audioBuf.sampleRate < 0.3) return; // too short to be real speech

      const wav = _vlPrepareWav([pcm], audioBuf.sampleRate);
      _vlEnsureQueue().enqueue({
        capturedAt: Date.now(),
        durationMs: payload.durationMs || Math.round((pcm.length / audioBuf.sampleRate) * 1000),
        ref: wav,
      });
      _vlUpdateQueueStatus();
      _vlKickQueue();
    } catch (e) {
      MMLog?.warn('lattice', 'recall segment could not be decoded: ' + e.message);
    } finally {
      try { ctx?.close(); } catch (e) {}
    }
  });
  return true;
}
// Same resilient wiring pattern as modules/lattice/lattice.js's bus
// hookup: MM_BUS should already exist by this point in the script order,
// but if it somehow doesn't yet, retry rather than silently never wiring.
(function () {
  if (typeof window === 'undefined') return;
  if (_vlWireRecallBridge()) return;
  document.addEventListener('DOMContentLoaded', _vlWireRecallBridge);
  let n = 0;
  const iv = setInterval(() => { if (_vlWireRecallBridge() || ++n > 40) clearInterval(iv); }, 50);
})();

// ── The lattice canvas ─────────────────────────────────────────────

function vlLatticeInit() {
  const cvs = document.getElementById('vl-lattice-cvs');
  if (!cvs) return false;
  const wrap = cvs.parentElement;
  const fit = () => {
    cvs.width = wrap.clientWidth || 600;
    cvs.height = wrap.clientHeight || 400;
  };
  fit();
  if (!VL_UI._resizeBound) {
    window.addEventListener('resize', fit);
    VL_UI._resizeBound = true;
  }
  vlLatticeSync();
  if (VL_UI.latRAF) cancelAnimationFrame(VL_UI.latRAF);
  _vlLatticeLoop();
  return true;
}

// Bodies are created for nodes that do not have one and removed for
// nodes that no longer exist — so the physics follows the data rather
// than accumulating ghosts.
function vlLatticeSync() {
  const nodes = (typeof VL_STATE !== 'undefined' && VL_STATE.nodes) || [];
  const cvs = document.getElementById('vl-lattice-cvs');
  const w = cvs ? cvs.width : 600, h = cvs ? cvs.height : 400;

  const live = new Set();
  for (const n of nodes) {
    const id = n.id || n.nodeId;
    if (!id) continue;
    live.add(id);
    if (!VL_UI.bodies.has(id)) {
      // New nodes enter near the centre with a small random offset, so
      // they visibly move outward and find their place rather than
      // appearing already settled.
      VL_UI.bodies.set(id, {
        id,
        x: w / 2 + (Math.random() - 0.5) * 40,
        y: h / 2 + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0,
        tag: (n.tags && n.tags[0]) || 'SYS',
        text: n.text || n.content || '',
        born: Date.now(),
      });
    }
  }
  for (const id of [...VL_UI.bodies.keys()]) if (!live.has(id)) VL_UI.bodies.delete(id);

  // Edges from whatever the lattice engine computed.
  VL_UI.edges = [];
  for (const n of nodes) {
    const id = n.id || n.nodeId;
    for (const e of (n.edges || n.associations || n.assocEdges || [])) {
      const to = e.to || e.id || e;
      if (VL_UI.bodies.has(id) && VL_UI.bodies.has(to)) {
        VL_UI.edges.push({ from: id, to, type: e.type || 'association' });
      }
    }
    // Semantic auto-links (lexicon.documentSimilarity, nexus-engine.js
    // vlAddNode) — a separate array from the Jaccard-based ones above
    // because they measure a different thing (learned meaning vs.
    // literal word overlap) and are drawn differently below.
    for (const e of (n.semanticEdges || [])) {
      if (VL_UI.bodies.has(id) && VL_UI.bodies.has(e.to)) {
        VL_UI.edges.push({ from: id, to: e.to, type: 'semantic', score: e.score });
      }
    }
  }

  const c = document.getElementById('vl-lat-count');
  if (c) c.textContent = String(VL_UI.bodies.size);
  const ec = document.getElementById('vl-lat-edges');
  if (ec) ec.textContent = String(VL_UI.edges.length);
  const hint = document.getElementById('vl-lattice-hint');
  if (hint) hint.innerHTML = VL_UI.bodies.size ? '' : 'THE LATTICE IS EMPTY<br>SPEAK, AND IT FILLS';
}

// Salvaged constants: centre gravity .004, inverse-square repulsion,
// spring attraction .6, damping .85.
function _vlPhysicsStep(w, h) {
  const B = [...VL_UI.bodies.values()];
  for (const b of B) {
    b.vx += (w / 2 - b.x) * 0.004;
    b.vy += (h / 2 - b.y) * 0.004;
  }
  for (let i = 0; i < B.length; i++) {
    for (let j = i + 1; j < B.length; j++) {
      const a = B[i], b = B[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
      const f = 1400 / d2;
      const d = Math.sqrt(d2);
      a.vx -= (dx / d) * f; a.vy -= (dy / d) * f;
      b.vx += (dx / d) * f; b.vy += (dy / d) * f;
    }
  }
  for (const e of VL_UI.edges) {
    const a = VL_UI.bodies.get(e.from), b = VL_UI.bodies.get(e.to);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (d - 90) * 0.006 * 0.6;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  }
  for (const b of B) {
    b.vx *= 0.85; b.vy *= 0.85;
    b.x += b.vx; b.y += b.vy;
    b.x = Math.max(18, Math.min(w - 18, b.x));
    b.y = Math.max(18, Math.min(h - 18, b.y));
  }
}

function _vlDrawLattice() {
  const cvs = document.getElementById('vl-lattice-cvs');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const w = cvs.width, h = cvs.height;
  ctx.clearRect(0, 0, w, h);

  ctx.lineWidth = 1;
  for (const e of VL_UI.edges) {
    const a = VL_UI.bodies.get(e.from), b = VL_UI.bodies.get(e.to);
    if (!a || !b) continue;
    ctx.strokeStyle = e.type === 'sequence' ? 'rgba(119,68,255,.16)'
      : e.type === 'semantic' ? 'rgba(255,170,0,.22)'   // amber — distinct from the cyan Jaccard edges
      : 'rgba(0,200,255,.13)';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  for (const b of VL_UI.bodies.values()) {
    const col = VL_TAG_COL[b.tag] || '#00c8ff';
    // A node born in the last two seconds is drawn larger and brighter,
    // so you can see WHICH one just arrived rather than watching the
    // whole graph twitch.
    const age = (Date.now() - b.born) / 2000;
    const fresh = age < 1 ? 1 - age : 0;
    const r = 4 + fresh * 5;

    if (fresh > 0) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, r + 9 * fresh, 0, Math.PI * 2);
      ctx.fillStyle = col + '22';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55 + fresh * 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function _vlLatticeLoop() {
  const cvs = document.getElementById('vl-lattice-cvs');
  if (!cvs) { VL_UI.latRAF = null; return; }
  _vlPhysicsStep(cvs.width, cvs.height);
  _vlDrawLattice();
  VL_UI.latRAF = requestAnimationFrame(_vlLatticeLoop);
}

function vlLatticeStop() {
  if (VL_UI.latRAF) cancelAnimationFrame(VL_UI.latRAF);
  VL_UI.latRAF = null;
}

// A node arriving from anywhere — speech, typing, import — appears here.
if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.on === 'function') {
  MM_BUS.on('mm.capture.node', () => { try { vlLatticeSync(); } catch (e) {} });
  MM_BUS.on('mm.lattice.node', () => { try { vlLatticeSync(); } catch (e) {} });
}

if (typeof window !== 'undefined') {
  window.VL_UI = VL_UI;
  window.VL_TAG_COL = VL_TAG_COL;
  window.vlOrbToggle = vlOrbToggle;
  window.vlOrbStart = vlOrbStart;
  window.vlOrbStop = vlOrbStop;
  window.vlTickTimer = vlTickTimer;
  window.vlSetCaptureMode = vlSetCaptureMode;
  window.vlLatticeInit = vlLatticeInit;
  window.vlLatticeSync = vlLatticeSync;
  window.vlLatticeStop = vlLatticeStop;
}

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'voice-lattice-ui',
    uuid: '4a3b2c1d-mod-9000-8000-vlcapture001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
  });
}
