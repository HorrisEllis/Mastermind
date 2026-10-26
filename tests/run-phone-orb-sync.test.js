'use strict';
// ═══════════════════════════════════════════════════════════════════
// PHONE ORB SYNC — the phone connecting alone must start real capture
//
// Before this fix: vlPhoneBridge's frame handler (and vlIngestFrame
// itself) gated on VL_UI.recording, which only ever became true inside
// vlOrbStart — which required a LOCAL getUserMedia grant first. Tapping
// "stream" on the phone connected the socket, frames arrived correctly
// over IPC, and every one of them was silently dropped at that gate.
// The desktop's own local orb had to ALSO be clicked for any of it to
// reach the pipeline.
//
// This loads the REAL ui-capture.js and ui-phone.js together in one
// sandbox — not stubs standing in for either — so a regression back to
// "phone connecting does nothing until the local orb is also on" fails
// here, not months later as "the phone doesn't work."
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}
async function at(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const uiCap = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
const uiPhone = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-phone.js'), 'utf8');

// Builds a sandbox with BOTH real files loaded, real VL_UI, real
// _vlBeginCapture/_vlEndCapture — only the deepest dependencies (VAD
// engine, transcribe queue, session bridge, DOM, IPC) are mocked.
function makeSandbox(overrides) {
  const o = overrides || {};
  const store = {};
  const canvasCtx = { fillStyle: '', strokeStyle: '', lineWidth: 0, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} };
  const makeEl = (id) => (store[id] = store[id] || {
    id, style: {}, textContent: '', classList: { add() {}, remove() {}, toggle() {} },
    getContext: () => canvasCtx, width: 200, height: 40,
  });
  makeEl('vl-orb-icon'); makeEl('vl-orb-label'); makeEl('vl-orb-outer'); makeEl('vl-wave-cvs');

  const emitted = [];
  const ledgerCalls = [];
  const sessions = [];
  let currentSession = null;

  const sandbox = {
    console,
    OPTS: {},
    MMLog: { warn() {}, error() {}, info() {} },
    MM_BUS: { emit: (evt, data) => emitted.push({ evt, data }) },
    _ledgerAppend: (evt, data) => ledgerCalls.push({ evt, data }),
    RecallCore: {
      RecallVAD: function (opts) { this.opts = opts; this.push = () => o.vadEvent || null; },
      rms: () => 0, zcr: () => 0,
    },
    TranscribeQueue: { create: () => ({ enqueue() {}, stats: () => ({ pending: 0 }) }) },
    Clarity: undefined,
    VLAudioEncode: { chunksToWav16k: () => new ArrayBuffer(0), concatFloat32: () => new Float32Array(0), encodeWav: () => new ArrayBuffer(0) },
    CaptureBridge: {
      stats: () => ({ session: currentSession }),
      beginSession: (kind, meta) => {
        currentSession = { id: 'S' + (sessions.length + 1), kind, meta };
        sessions.push(currentSession);
        return currentSession;
      },
      endSession: () => { const s = currentSession; currentSession = null; return s; },
    },
    _vlCloseSessionHistory: () => {},
    vaultSave: () => {},
    mm_toast: (msg, kind) => { (sandbox.__toasts || (sandbox.__toasts = [])).push({ msg, kind }); },
    mmChoice: async () => 'end',
    document: {
      getElementById: (id) => store[id] !== undefined ? store[id] : makeEl(id),
      createElement: () => makeEl('vl-phone-modal'),
      body: { appendChild: (el) => { store['vl-phone-modal'] = el; } },
      addEventListener: () => {},
    },
    addEventListener: () => {},
    navigator: { mediaDevices: undefined, clipboard: { writeText() {} } }, // no local mic in this sandbox — deliberate, proves phone doesn't need one
    window: {},
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const sessionStartedCalls = [];
  sandbox.window.NXAPI = {
    whisperDetect: async () => (o.whisper !== undefined ? o.whisper : { ok: true }),
    onPhoneAudio: (cb) => { sandbox.__audioCb = cb; },
    onPhoneStatus: (cb) => { sandbox.__statusCb = cb; },
    captureWriteSegment: async () => ({ ok: true }),
    captureSessionStarted: async (id) => { sessionStartedCalls.push(id); return { ok: true }; },
    phoneStop: async () => { sandbox.__phoneStopCalled = true; return { ok: true }; },
    phoneStart: async () => ({ ok: true, url: 'https://x/?t=y', mode: 'lan' }),
    phoneDetectCloudflared: async () => ({ ok: false }),
  };

  vm.createContext(sandbox);
  vm.runInContext(uiCap, sandbox, { filename: 'ui-capture.js' });
  vm.runInContext(uiPhone, sandbox, { filename: 'ui-phone.js' });
  sandbox.vlPhoneBridge();

  return { sandbox, store, emitted, ledgerCalls, sessions, sessionStartedCalls, getSession: () => currentSession };
}

console.log('\nPHONE ORB SYNC — connecting alone starts real capture\n');

(async () => {

await at('THE FIX: the phone connecting alone sets VL_UI.recording — no local orb click needed', async () => {
  const { sandbox } = makeSandbox();
  assert.strictEqual(sandbox.VL_UI.recording, false, 'sanity: not recording before connect');
  await sandbox.__statusCb({ connected: true });
  assert.strictEqual(sandbox.VL_UI.recording, true, 'phone connecting must start capture on its own');
  assert.strictEqual(sandbox.VL_UI.activeSource, 'phone');
});

await at('a frame arriving before connect is dropped; the same frame arriving after connect reaches vlIngestFrame', async () => {
  const { sandbox } = makeSandbox();
  const frame = new Int16Array(4096).buffer;

  let reachedVad = false;
  const origPush = sandbox.RecallCore.RecallVAD;
  // vlIngestFrame calls VL_UI.vad.push — instrument it to prove frames
  // genuinely reach the VAD, not just that recording flipped true.
  sandbox.RecallCore.RecallVAD = function (opts) {
    this.opts = opts;
    this.push = () => { reachedVad = true; return null; };
  };
  sandbox.vlPhoneBridge = sandbox.vlPhoneBridge; // no-op, bridge already installed once at load

  sandbox.__audioCb(frame);
  assert.strictEqual(reachedVad, false, 'a frame before connect must still be dropped');

  await sandbox.__statusCb({ connected: true });
  sandbox.__audioCb(frame);
  assert.strictEqual(reachedVad, true, 'a frame after connect must reach the VAD — this is the actual bug fixed');
});

await at('connecting opens a real CaptureBridge session with kind \u2018phone\u2019', async () => {
  const { sandbox, getSession } = makeSandbox();
  await sandbox.__statusCb({ connected: true });
  const s = getSession();
  assert.ok(s, 'a session should be open');
  assert.strictEqual(s.kind, 'phone');
});

await at('main.js is told the real session id, so the segment folder is keyed to it, not to app-launch time', async () => {
  const { sandbox, sessionStartedCalls, getSession } = makeSandbox();
  await sandbox.__statusCb({ connected: true });
  assert.strictEqual(sessionStartedCalls.length, 1);
  assert.strictEqual(sessionStartedCalls[0], getSession().id);
});

await at('disconnecting ends capture and closes the session, symmetric with the local orb', async () => {
  const { sandbox, getSession } = makeSandbox();
  await sandbox.__statusCb({ connected: true });
  assert.ok(getSession());
  await sandbox.__statusCb({ connected: false });
  assert.strictEqual(sandbox.VL_UI.recording, false);
  assert.strictEqual(sandbox.VL_UI.activeSource, null);
  assert.strictEqual(getSession(), null, 'session must be closed on disconnect');
});

await at('WHISPER GATE: phone connecting is refused (and the server told to stop) when transcription is unavailable', async () => {
  const { sandbox } = makeSandbox({ whisper: { ok: false, message: 'no whisper binary' } });
  await sandbox.__statusCb({ connected: true });
  assert.strictEqual(sandbox.VL_UI.recording, false, 'must not silently record audio nothing can transcribe');
  assert.ok(sandbox.__phoneStopCalled, 'the phone server should be told to stop, not left claiming to stream into nothing');
});

await at('SOURCE CONFLICT: phone connecting while the local mic already owns the session is refused, not double-captured', async () => {
  const { sandbox } = makeSandbox();
  sandbox._vlBeginCapture('local');
  assert.strictEqual(sandbox.VL_UI.activeSource, 'local');

  await sandbox.__statusCb({ connected: true });
  assert.strictEqual(sandbox.VL_UI.activeSource, 'local', 'local session must not be silently replaced by the phone');
  assert.ok(sandbox.__phoneStopCalled, 'phone should be told to stop rather than sit there claiming to stream');
});

await at('the local orb toggle refuses to offer end/background/recall choices for a mic that was never on', async () => {
  const { sandbox } = makeSandbox();
  await sandbox.__statusCb({ connected: true }); // phone owns the session
  let choiceAsked = false;
  sandbox.mmChoice = async () => { choiceAsked = true; return 'end'; };
  await sandbox.vlOrbToggle();
  assert.strictEqual(choiceAsked, false, 'must not ask "stop the orb?" about a local mic that was never recording');
});

await at('WAVEFORM: incoming phone frames feed the rolling buffer the phone-source draw loop reads', async () => {
  const { sandbox } = makeSandbox();
  await sandbox.__statusCb({ connected: true });
  const loud = new Int16Array(4096).fill(20000); // clearly non-silent
  sandbox.__audioCb(loud.buffer);
  const buf = sandbox.VL_UI.phoneWaveBuf;
  assert.ok(buf.some(v => Math.abs(v) > 0.1), 'phoneWaveBuf should reflect real incoming amplitude, not stay all-zero');
});

await at('REGRESSION: ui-capture.js no longer has a bare, unconditional local-only recording gate with no source concept', () => {
  assert.ok(/activeSource/.test(uiCap), 'expected activeSource tracking to exist');
  assert.ok(/_vlBeginCapture/.test(uiCap) && /_vlEndCapture/.test(uiCap), 'expected the shared begin/end capture core to exist');
});

const fails = results.filter(r => !r.ok);
console.log('\nphone-orb-sync: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;

})();
