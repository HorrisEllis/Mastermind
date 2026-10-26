'use strict';
// ═══════════════════════════════════════════════════════════════════
// ORB CAPTURE — VAD segmentation + incremental transcription
//
// The orb used to record everything into one buffer and transcribe it
// all after the mic was stopped — meaning a crash mid-session lost the
// whole thing, and nothing reached the lattice until you clicked stop.
// It now cuts speech into segments the moment silence closes them (via
// RecallVAD, reused from recall.js) and enqueues each one for
// transcription immediately (via TranscribeQueue, which guarantees
// spoken-order release even when transcriptions finish out of order).
// A segment becomes a node — and is saved — within moments of being
// spoken, not at the end of the session.
//
// The real onaudioprocess handler (where RMS/VAD actually run against
// live audio) lives outside this file's extraction region and touches
// the Web Audio API directly, so it isn't exercised here — these tests
// instead drive the same functions that handler calls
// (_vlFinalizeSegment, the queue pump) directly, the same way a real
// segment boundary would.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const results = [];
const pending = [];
function t(name, fn) { pending.push({ name, fn }); }

function extractBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, startMarker + ' not found');
  const end = src.indexOf(endMarker, start);
  assert.ok(end > start, endMarker + ' not found after start');
  return src.slice(start, end);
}

const uiSrc = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
// `const VL_UI = {...}` does not attach to the vm context object the way
// function declarations do — only var/function land on the context;
// let/const stay in a lexical record the outside can't reach. The
// functions still close over the real VL_UI correctly when invoked via
// vm.runInContext — this line just also exposes VL_UI itself so tests
// can set up scenarios (fake audioCtx, segmentChunks) directly.
const orbRegionSrc = extractBetween(uiSrc, 'const VL_UI = {', '\nfunction vlTickTimer(') + '\nthis.VL_UI = VL_UI;';

const VLAudioEncode = require(path.join(ROOT, 'modules', 'voice-lattice', 'audio-encode.js'));
const RecallCore = require(path.join(ROOT, 'modules', 'voice-lattice', 'recall.js'));
const TranscribeQueue = require(path.join(ROOT, 'foundation', 'ai', 'transcribe-queue.js'));

function makeSandbox(overrides) {
  const store = {};
  const makeEl = (id) => {
    if (!store[id]) store[id] = { id, textContent: '', classList: { add() {}, remove() {} } };
    return store[id];
  };
  const toasts = [];
  const addedNodes = [];
  const events = [];

  const sandbox = {
    console,
    document: { getElementById: (id) => makeEl(id) },
    MMLog: { info() {}, warn() {}, error() {} },
    MM_BUS: { emit: (name, data) => events.push({ name, data }) },
    mm_toast: (msg, kind, opts) => toasts.push({ msg, kind, opts }),
    vlAddNode: (text) => addedNodes.push(text),
    VLAudioEncode, RecallCore, TranscribeQueue,
    OPTS: (overrides && overrides.OPTS) || {},
    // Real waveform setup touches AudioContext/canvas — irrelevant to
    // what this suite tests (whisper gating + the segment/queue
    // pipeline), so it's stubbed rather than dragged in and faked badly.
    _vlStartWave: () => {},
    _vlStopWave: () => {},
    vlTickTimer: () => {},
    setInterval: () => 1,
    clearInterval: () => {},
    navigator: { mediaDevices: (overrides && overrides.mediaDevices) || {
      getUserMedia: async () => ({ getTracks: () => [] }),
    } },
  };
  sandbox.window = { NXAPI: (overrides && overrides.NXAPI) || {} };
  vm.createContext(sandbox);
  vm.runInContext(orbRegionSrc, sandbox);
  return { sandbox, store: () => store, toasts, addedNodes, events };
}

// Promises created inside the vm context still run on Node's real
// microtask queue — only globals are sandboxed, not the event loop —
// so a real setTimeout here reliably waits for pending .then() chains
// (whisperTranscribe's mock resolving, markDone, drain, onRelease) to
// finish before the assertions run.
function flush(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms ?? 5));
}

function fakeAudioCtx(sampleRate) {
  return { sampleRate, close() {} };
}

function fillSegment(sandbox, seconds, sampleRate) {
  sandbox.VL_UI.audioCtx = fakeAudioCtx(sampleRate || 16000);
  sandbox.VL_UI.segmentChunks = [new Float32Array(Math.round((sampleRate || 16000) * seconds)).fill(0.1)];
}

async function run() {
  console.log('\nORB CAPTURE — VAD segmentation + incremental transcription\n');
  for (const { name, fn } of pending) {
    try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
    catch (e) {
      results.push({ name, ok: false });
      console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
    }
  }
  const fails = results.filter(r => !r.ok);
  console.log('\norb-capture: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
}

// ── The whisper/mic gate ──────────────────────────────────────────────

t('whisper unavailable: the mic is never even requested', async () => {
  let micRequested = false;
  const { sandbox, toasts } = makeSandbox({
    NXAPI: { whisperDetect: async () => ({ ok: false, message: 'No local whisper binary found. Install whisper.cpp.' }) },
    mediaDevices: { getUserMedia: async () => { micRequested = true; return {}; } },
  });
  const res = await sandbox.vlOrbStart();
  assert.strictEqual(res.ok, false);
  assert.strictEqual(micRequested, false, 'requesting the microphone when transcription cannot work anyway is pointless and alarming');
  assert.strictEqual(sandbox.VL_UI.recording, false, 'must not show a recording state it cannot make good on');
  assert.ok(toasts.some(t => /whisper/i.test(t.msg)), 'the actual reason must reach the person, not just a generic failure');
});

t('whisper available but mic denied: fails at the mic step with its own message, not a whisper one', async () => {
  const { sandbox, toasts } = makeSandbox({
    NXAPI: { whisperDetect: async () => ({ ok: true, binPath: '/usr/bin/whisper-cli' }) },
    mediaDevices: { getUserMedia: async () => { throw new Error('Permission denied'); } },
  });
  const res = await sandbox.vlOrbStart();
  assert.strictEqual(res.ok, false);
  assert.strictEqual(sandbox.VL_UI.recording, false);
  assert.ok(toasts.some(t => /microphone/i.test(t.msg)));
});

t('whisper availability is cached — a second check does not re-probe', async () => {
  let detectCalls = 0;
  const { sandbox } = makeSandbox({
    NXAPI: { whisperDetect: async () => { detectCalls++; return { ok: true }; } },
  });
  await sandbox.vlOrbStart();
  sandbox.vlOrbStop();
  await sandbox._vlEnsureWhisper();
  assert.strictEqual(detectCalls, 1);
});

t('both whisper and mic available: recording starts and a VAD + queue are set up', async () => {
  const { sandbox } = makeSandbox({ NXAPI: { whisperDetect: async () => ({ ok: true }) } });
  const res = await sandbox.vlOrbStart();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(sandbox.VL_UI.recording, true);
  assert.ok(sandbox.VL_UI.vad, 'a RecallVAD instance must be created on start');
  assert.ok(sandbox.VL_UI.queue, 'a transcription queue must be created on start');
});

// ── Segment finalize -> queue -> node (the actual fix) ────────────────

t('a finalized segment is transcribed and becomes a node — without waiting for the orb to stop', async () => {
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => ({ ok: true, text: 'This is a captured thought.' }),
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 2);
  sandbox._vlFinalizeSegment(false); // simulates the VAD 'end' event finalizing a segment
  await flush();
  assert.deepStrictEqual(addedNodes, ['This is a captured thought.']);
  assert.strictEqual(sandbox.VL_UI.recording, true, 'finalizing a segment must not stop the recording session itself');
});

t('a multi-sentence segment is still split into separate nodes, one per thought', async () => {
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => ({ ok: true, text: 'First thought here. Second thought here.' }),
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 2);
  sandbox._vlFinalizeSegment(false);
  await flush();
  assert.deepStrictEqual(addedNodes, ['First thought here.', 'Second thought here.']);
});

t('segments release as nodes in the order they were SPOKEN, even if transcription finishes out of order', async () => {
  // Segment 1 is deliberately slower to transcribe than segment 2 — the
  // queue must still hold segment 2's result back until segment 1 is
  // released, or the lattice would record the thoughts in the wrong order.
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async (wav, opts) => {
        const isFirst = wav.byteLength > 60000; // segment 1 is longer audio -> bigger buffer
        await new Promise((r) => setTimeout(r, isFirst ? 15 : 2));
        return { ok: true, text: isFirst ? 'Spoken first.' : 'Spoken second.' };
      },
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 3); // longer -> "spoken first", finishes slower
  sandbox._vlFinalizeSegment(false);
  fillSegment(sandbox, 1); // shorter -> "spoken second", finishes faster
  sandbox._vlFinalizeSegment(false);
  await flush(40);
  assert.deepStrictEqual(addedNodes, ['Spoken first.', 'Spoken second.']);
});

t('a segment shorter than ~0.3s is skipped without ever calling whisper', async () => {
  let transcribeCalled = false;
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => { transcribeCalled = true; return { ok: true, text: 'x' }; },
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 0.05);
  sandbox._vlFinalizeSegment(false);
  await flush();
  assert.strictEqual(transcribeCalled, false);
  assert.strictEqual(addedNodes.length, 0);
});

t('a segment that fails transcription (after retries) becomes a visible gap node, not silence', async () => {
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => ({ ok: false, message: 'model missing' }),
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 2);
  sandbox._vlFinalizeSegment(false);
  await flush(30); // two attempts (maxAttempts: 2), give both time to run
  assert.strictEqual(addedNodes.length, 1);
  assert.ok(/unreadable audio/i.test(addedNodes[0]), 'a failed segment must still leave a visible trace, not vanish');
});

t('a whisperTranscribe call that throws (spawn error, etc.) is caught, not left unhandled', async () => {
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => { throw new Error('ENOENT: binary vanished mid-run'); },
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 2);
  sandbox._vlFinalizeSegment(false);
  await flush(30);
  assert.strictEqual(addedNodes.length, 1);
  assert.ok(/unreadable audio/i.test(addedNodes[0]));
});

t('a segment that transcribes to empty text (silence caught by RMS but not real speech) adds nothing', async () => {
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => ({ ok: true, text: '' }),
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 1);
  sandbox._vlFinalizeSegment(false);
  await flush();
  // Empty (not failed) text should not manufacture a "[unreadable audio]"
  // node — that label is specifically for a transcription that FAILED,
  // not one that succeeded and legitimately heard nothing.
  assert.strictEqual(addedNodes.length, 0);
});

// ── Stop behavior: flush, don't discard; don't block on the queue ─────

t('stopping mid-utterance flushes the in-progress segment instead of discarding it', async () => {
  const { sandbox, addedNodes } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => ({ ok: true, text: 'Caught mid-sentence.' }),
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 2); // still "speaking" — never finalized by a VAD 'end' event
  sandbox.vlOrbStop();
  await flush();
  assert.deepStrictEqual(addedNodes, ['Caught mid-sentence.']);
  assert.strictEqual(sandbox.VL_UI.queue.stats().pending, 0, 'by the time flush() completes the queue should have drained');
});

t('vlOrbStop is synchronous and does not itself await transcription — the queue keeps draining after the mic is gone', async () => {
  const { sandbox, addedNodes, store } = makeSandbox({
    NXAPI: {
      whisperDetect: async () => ({ ok: true }),
      whisperTranscribe: async () => {
        await new Promise((r) => setTimeout(r, 15));
        return { ok: true, text: 'Finished after stop.' };
      },
    },
  });
  await sandbox.vlOrbStart();
  fillSegment(sandbox, 2);
  const res = sandbox.vlOrbStop(); // flushes the segment, enqueues it, returns immediately
  assert.strictEqual(addedNodes.length, 0, 'must not have transcribed synchronously inside stop()');
  assert.ok(res.pending >= 1, 'stop() should report that work is still pending');
  assert.ok(/FINISHING/i.test(store()['vl-orb-label'].textContent));
  await flush(30);
  assert.deepStrictEqual(addedNodes, ['Finished after stop.'], 'the queue must keep working after the mic/session UI has stopped');
});

t('stopping with nothing mid-segment (already idle) is a clean no-op, not an error', async () => {
  const { sandbox } = makeSandbox({ NXAPI: { whisperDetect: async () => ({ ok: true }) } });
  await sandbox.vlOrbStart();
  assert.doesNotThrow(() => sandbox.vlOrbStop());
});

// ── Settings are actually read (Options → AI wiring) ──────────────────

t('a custom VAD threshold from OPTS is used to construct the RecallVAD, not a hardcoded default', async () => {
  const { sandbox } = makeSandbox({
    NXAPI: { whisperDetect: async () => ({ ok: true }) },
    OPTS: { voice_vad_threshold: 0.05, voice_silence_hold_ms: 900 },
  });
  await sandbox.vlOrbStart();
  assert.strictEqual(sandbox.VL_UI.vad.threshold, 0.05);
  assert.strictEqual(sandbox.VL_UI.vad.silenceHoldMs, 900);
});

run();
