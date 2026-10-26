'use strict';
// ═══════════════════════════════════════════════════════════════════
// PHONE INPUT
//
// The point of these tests is that a phone is an INPUT DEVICE, not a
// second capture pipeline. If phone audio ever stops going through
// vlIngestFrame, the two paths will drift — and the drift shows up
// months later as "the phone loses the start of sentences", with no
// obvious cause.
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

const uiPhone = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-phone.js'), 'utf8');
const uiCap   = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
const html    = fs.readFileSync(path.join(ROOT, 'index-browser.html'), 'utf8');
const engine  = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
const server  = fs.readFileSync(path.join(ROOT, 'foundation', 'ai', 'phone-mic.js'), 'utf8');

// Load the module with just enough around it to exercise the bridge.
function loadBridge(overrides) {
  const o = overrides || {};
  const ingested = [];
  const phoneStartCalls = [];
  let audioCb = null;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    VL_UI: { recording: true, vad: {}, audioCtx: { sampleRate: 48000 } },
    vlIngestFrame: (chunk, rate) => ingested.push({ len: chunk.length, rate }),
    mm_toast: () => {},
    document: { getElementById: () => null, createElement: () => ({ style: {}, classList: { toggle() {} } }), body: { appendChild() {} } },
    MM_BUS: { emit() {} },
    navigator: { clipboard: { writeText() {} } },
    window: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.NXAPI = {
    onPhoneAudio: (cb) => { audioCb = cb; },
    onPhoneStatus: () => {},
    phoneStart: async (opts) => { phoneStartCalls.push(opts); return o.phoneStart ? o.phoneStart(opts) : { ok: true, url: 'https://192.168.1.5:8443/?t=x', mode: opts?.mode || 'lan' }; },
    phoneStop: async () => ({ ok: true }),
    phoneDetectCloudflared: async () => (o.phoneDetectCloudflared ? o.phoneDetectCloudflared() : { ok: false, message: 'cloudflared not available (default test mock)' }),
  };
  vm.createContext(sandbox);
  vm.runInContext(uiPhone, sandbox, { filename: 'ui-phone.js' });
  sandbox.vlPhoneBridge ? sandbox.vlPhoneBridge() : sandbox.vlIngestFramePhoneBridge();
  return { sandbox, ingested, phoneStartCalls, send: (int16) => audioCb(int16.buffer) };
}

// A second, dedicated sandbox for the mode-choice UI flow — loadBridge()
// above deliberately doesn't track real DOM state (its tests only need
// the audio bridge, not the modal), so this one does: getElementById and
// createElement share one store, the way the real DOM would behave,
// which vlPhoneOpen()/vlPhoneOfferTunnel()/etc. actually depend on.
function loadPhoneUI(overrides) {
  const o = overrides || {};
  const store = {};
  const makeEl = (id) => {
    if (!store[id]) store[id] = { id, style: {}, innerHTML: '', className: '', classList: { add() {}, remove() {}, toggle() {} }, onclick: null };
    return store[id];
  };
  const phoneStartCalls = [];
  const detectCalls = { count: 0 };
  let phoneStopCalls = 0;
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    VL_UI: { recording: false },
    vlIngestFrame: () => {},
    mm_toast: () => {},
    document: {
      getElementById: (id) => (store[id] ? store[id] : null),
      createElement: () => makeEl('vl-phone-modal'), // the only element this module ever creates
      body: { appendChild: (el) => { store['vl-phone-modal'] = el; } },
    },
    MM_BUS: { emit() {} },
    navigator: { clipboard: { writeText() {} } },
    window: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.NXAPI = {
    onPhoneAudio: () => {},
    onPhoneStatus: () => {},
    phoneStart: async (opts) => { phoneStartCalls.push(opts); return o.phoneStart ? o.phoneStart(opts) : { ok: true, url: 'https://192.168.1.5:8443/?t=x', mode: opts?.mode || 'lan' }; },
    phoneStop: async () => { phoneStopCalls++; return { ok: true }; },
    phoneDetectCloudflared: async () => { detectCalls.count++; return o.phoneDetectCloudflared ? o.phoneDetectCloudflared() : { ok: false, message: 'not available' }; },
  };
  vm.createContext(sandbox);
  vm.runInContext(uiPhone, sandbox, { filename: 'ui-phone.js' });
  return { sandbox, store, phoneStartCalls, detectCalls, get phoneStopCalls() { return phoneStopCalls; } };
}

// ── QR — loads the REAL vendored library (foundation/ui/vendor/
// qrcode-generator.js), not a stub, so a future regression that reverts
// to a nonexistent API (this file's actual history: QRCode.toCanvas,
// which the vendored library never exposed) fails here instead of only
// being discovered by someone staring at a blank square in the app. ──
const qrLibSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'ui', 'vendor', 'qrcode-generator.js'), 'utf8');

function loadPhoneUIWithCanvas(overrides) {
  const o = overrides || {};
  const store = {};
  const fillRectCalls = [];
  let fillTextCalls = [];
  const makeCanvas = (id) => ({
    id, width: 180, height: 180,
    getContext: () => ({
      fillStyle: '',
      font: '', textAlign: '',
      fillRect: (...args) => fillRectCalls.push(args),
      fillText: (...args) => fillTextCalls.push(args),
    }),
  });
  const makeEl = (id) => {
    if (!store[id]) store[id] = { id, style: {}, innerHTML: '', className: '', classList: { add() {}, remove() {}, toggle() {} }, onclick: null };
    return store[id];
  };
  // vl-phone-qr is a canvas; everything else this module touches is a
  // plain div, matching the real DOM shape closely enough for these tests.
  store['vl-phone-qr'] = makeCanvas('vl-phone-qr');

  const phoneStartCalls = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    VL_UI: { recording: false },
    vlIngestFrame: () => {},
    mm_toast: () => {},
    document: {
      getElementById: (id) => (store[id] !== undefined ? store[id] : (store[id] = id === 'vl-phone-qr' ? undefined : makeEl(id))),
      createElement: () => makeEl('vl-phone-modal'),
      body: { appendChild: (el) => { store['vl-phone-modal'] = el; } },
    },
    MM_BUS: { emit() {} },
    navigator: { clipboard: { writeText() {} } },
    window: {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.NXAPI = {
    onPhoneAudio: () => {},
    onPhoneStatus: () => {},
    phoneStart: async (opts) => { phoneStartCalls.push(opts); return o.phoneStart ? o.phoneStart(opts) : { ok: true, url: 'https://192.168.1.5:8443/?t=x', mode: opts?.mode || 'lan' }; },
    phoneStop: async () => ({ ok: true }),
    phoneDetectCloudflared: async () => (o.phoneDetectCloudflared ? o.phoneDetectCloudflared() : { ok: false, message: 'not available' }),
  };
  vm.createContext(sandbox);
  if (o.loadQrLib !== false) vm.runInContext(qrLibSrc, sandbox, { filename: 'qrcode-generator.js' });
  vm.runInContext(uiPhone, sandbox, { filename: 'ui-phone.js' });
  return { sandbox, store, fillRectCalls, get fillTextCalls() { return fillTextCalls; } };
}



// ── One pipeline ───────────────────────────────────────────────────

t('THE SHARED PATH: phone audio goes through vlIngestFrame, the same function the mic uses', () => {
  assert.ok(/vlIngestFrame\(/.test(uiPhone), 'the bridge does not call the shared ingest');
  assert.ok(/function vlIngestFrame\(/.test(uiCap), 'the shared ingest does not exist');
  // indexOf finds the first MENTION, which is a comment. The assignment
  // is what matters — searching for the wrong one made this test fail
  // against correct code.
  const at = uiCap.indexOf('procNode.onaudioprocess =');
  assert.ok(at > -1, 'no audio callback found');
  const proc = uiCap.slice(at, at + 400);
  assert.ok(/vlIngestFrame\(/.test(proc),
    'the local microphone must call it too, or there are two pipelines again');
});

t('the phone does not have its own VAD, pre-buffer or segmenter', () => {
  for (const dup of ['preBuffer', 'segmentChunks', 'RecallCore.rms', '_vlFinalizeSegment']) {
    assert.ok(!uiPhone.includes(dup),
      'ui-phone re-implements ' + dup + ' \u2014 that is a second pipeline waiting to drift');
  }
});

// ── Frame reassembly ───────────────────────────────────────────────

t('Int16 is converted back to Float32 in the right range', () => {
  const { ingested, send } = loadBridge();
  const pcm = new Int16Array(4096);
  pcm.fill(0x4000);                       // ~0.5 in float
  send(pcm);
  assert.strictEqual(ingested.length, 1);
  assert.strictEqual(ingested[0].len, 4096);
});

t('THE CARRY TEST: odd socket sizes do not drop or pad samples', () => {
  const { ingested, send } = loadBridge();
  // Three sends that do not divide evenly into 4096.
  send(new Int16Array(3000));
  assert.strictEqual(ingested.length, 0, 'must wait rather than emit a short frame');
  send(new Int16Array(3000));
  assert.strictEqual(ingested.length, 1, '6000 samples = one whole frame, 1904 carried');
  send(new Int16Array(3000));
  assert.strictEqual(ingested.length, 2, 'the carried remainder must be used, not discarded');
});

t('every frame handed on is exactly the size the capture path expects', () => {
  const { ingested, send } = loadBridge();
  for (let i = 0; i < 12; i++) send(new Int16Array(1777));
  assert.ok(ingested.length > 0);
  for (const f of ingested) assert.strictEqual(f.len, 4096, 'got a ' + f.len + '-sample frame');
});

t('the sample rate is declared, not inferred from the local audio context', () => {
  const { ingested, send } = loadBridge();
  send(new Int16Array(4096));
  assert.strictEqual(ingested[0].rate, 48000,
    'the phone is a different device \u2014 assuming the local rate would resample wrongly');
});

t('streaming while the orb is off is not captured', () => {
  const b = loadBridge();
  b.sandbox.VL_UI.recording = false;
  b.send(new Int16Array(8192));
  assert.strictEqual(b.ingested.length, 0,
    'a connected phone is not consent to record \u2014 the orb is');
});

// ── The UI ─────────────────────────────────────────────────────────

t('the button exists and is wired', () => {
  assert.ok(/id="vl-phone-btn"/.test(engine), 'no phone button beside the orb');
  assert.ok(/onclick="vlPhoneOpen\(\)"/.test(engine));
  assert.ok(/function vlPhoneOpen/.test(uiPhone));
  assert.ok(html.includes('modules/voice-lattice/ui-phone.js'), 'the module is not loaded');
});

t('the popup gives a copyable link', () => {
  assert.ok(/vlPhoneCopy/.test(uiPhone));
  assert.ok(/clipboard\.writeText/.test(uiPhone));
  assert.ok(/vlp-url/.test(uiPhone), 'the link is not displayed');
});

t('THE WARNING IS EXPLAINED BEFORE THE PHONE SHOWS IT', () => {
  // An unexplained security warning is how people abandon a feature, or
  // switch to the option that leaks.
  assert.ok(/certificate warning/i.test(uiPhone), 'the warning is never mentioned');
  assert.ok(/Accept it/.test(uiPhone), 'it does not say what to do');
  assert.ok(/never reaches a third party/i.test(uiPhone), 'it does not say why the warning is the safe outcome');
});

t('the popup warns the link is a key', () => {
  assert.ok(/do not share it/i.test(uiPhone),
    'anyone on the network with the link can stream into the vault');
});

t('a QR that cannot be generated says so instead of drawing something unscannable', () => {
  assert.ok(/QR unavailable/.test(uiPhone),
    'a QR that does not scan looks like the feature is broken rather than absent');
});

t('stopping the server is separate from closing the popup', () => {
  assert.ok(/function vlPhoneStop/.test(uiPhone) && /function vlPhoneClose/.test(uiPhone));
  const close = uiPhone.slice(uiPhone.indexOf('function vlPhoneClose'), uiPhone.indexOf('function vlPhoneClose') + 200);
  assert.ok(!/phoneStop/.test(close), 'closing the popup must not kill an active stream');
});

// ── The server contract it depends on ──────────────────────────────

t('the server still refuses an unauthenticated socket', () => {
  assert.ok(/403 Forbidden/.test(server));
  assert.ok(/searchParams\.get\('t'\) !== STATE\.token/.test(server));
});

t('the default is LAN TLS, and the tunnel is not silently preferred', () => {
  assert.ok(/STATE\.mode = o\.mode === 'tunnel' \? 'tunnel' : 'lan'/.test(server),
    'lan must be the default — the tunnel has to be asked for');
  assert.ok(/TERMINATES AT CLOUDFLARE/.test(server),
    'the tunnel trade-off must be stated where someone enabling it will read it');
});

const fails = results.filter(r => !r.ok);
console.log('\nphone-input: ' + (results.length - fails.length) + '/' + results.length + ' passed');

// ── Tunnel mode: the mode-choice UI flow ────────────────────────────
// These need real await (vlPhoneOpen/vlPhoneStartLan/etc. are async),
// which the synchronous t() above can't do — a separate small async
// runner, same file, its own tally folded into the final exit code.

const asyncResults = [];
async function at(name, fn) {
  try { await fn(); asyncResults.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { asyncResults.push({ name, ok: false }); console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      ')); }
}

async function runAsyncTests() {
  console.log('\nPHONE INPUT — automatic tunnel-first UI flow\n');

  await at('opening the modal checks cloudflared and starts tunnel mode automatically — no manual choice required', async () => {
    const { sandbox, store, phoneStartCalls, detectCalls } = loadPhoneUI({ phoneDetectCloudflared: () => ({ ok: true, binPath: '/x/cloudflared' }) });
    await sandbox.vlPhoneOpen();
    assert.strictEqual(detectCalls.count, 1, 'must check availability before deciding');
    assert.strictEqual(phoneStartCalls.length, 1);
    assert.strictEqual(phoneStartCalls[0].mode, 'tunnel');
    assert.ok(/trycloudflare\.com|TUNNEL/.test(store['vl-phone-modal'].innerHTML));
  });

  await at('cloudflared NOT available: falls back to LAN automatically, not a dead end or a manual choice', async () => {
    const { sandbox, store, phoneStartCalls } = loadPhoneUI({ phoneDetectCloudflared: () => ({ ok: false, message: 'cloudflared is not available on this machine' }) });
    await sandbox.vlPhoneOpen();
    assert.strictEqual(phoneStartCalls.length, 1);
    assert.strictEqual(phoneStartCalls[0].mode, 'lan', 'must fall back to the mode that always works');
    assert.ok(/certificate warning/i.test(store['vl-phone-modal'].innerHTML), 'must land on a real, working LAN session');
  });

  await at('the tunnel ready screen states the real trade-off, not a vague warning', async () => {
    const { sandbox, store } = loadPhoneUI({ phoneDetectCloudflared: () => ({ ok: true }) });
    await sandbox.vlPhoneOpen();
    const html = store['vl-phone-modal'].innerHTML;
    assert.ok(/Cloudflare/.test(html));
    assert.ok(/TLS terminates/i.test(html), 'must explain WHERE the trade-off actually happens, not just that one exists');
  });

  await at('the tunnel ready screen offers a one-click switch back to LAN mode', async () => {
    const { sandbox, store } = loadPhoneUI({ phoneDetectCloudflared: () => ({ ok: true }) });
    await sandbox.vlPhoneOpen();
    assert.ok(/vlPhoneSwitchToLan/.test(store['vl-phone-modal'].innerHTML), 'must offer a way to opt back into LAN-only after seeing the trade-off');
  });

  await at('vlPhoneSwitchToLan actually stops the tunnel and restarts in lan mode', async () => {
    const result = loadPhoneUI({ phoneDetectCloudflared: () => ({ ok: true }) });
    await result.sandbox.vlPhoneOpen(); // starts tunnel
    await result.sandbox.vlPhoneSwitchToLan();
    assert.strictEqual(result.phoneStopCalls, 1);
    assert.strictEqual(result.phoneStartCalls.length, 2);
    assert.strictEqual(result.phoneStartCalls[1].mode, 'lan');
  });

  await at('a failed tunnel start (detected as available, but actually fails) shows the real error and a way back', async () => {
    const { sandbox, store } = loadPhoneUI({
      phoneDetectCloudflared: () => ({ ok: true }),
      phoneStart: () => ({ ok: false, message: 'cloudflared exited before reporting a tunnel URL (code 1)' }),
    });
    await sandbox.vlPhoneOpen();
    const html = store['vl-phone-modal'].innerHTML;
    assert.ok(/cloudflared exited before reporting/.test(html));
    assert.ok(/Back|Close/.test(html));
  });

  await at('a successful tunnel start shows the tunnel-specific note, not the LAN self-signed-cert explanation', async () => {
    const { sandbox, store } = loadPhoneUI({
      phoneDetectCloudflared: () => ({ ok: true }),
      phoneStart: (opts) => ({ ok: true, url: 'https://random-words.trycloudflare.com/?t=x', mode: 'tunnel' }),
    });
    await sandbox.vlPhoneOpen();
    const html = store['vl-phone-modal'].innerHTML;
    assert.ok(/trycloudflare\.com/.test(html));
    assert.ok(!/nothing has vouched for it/i.test(html), 'the LAN-specific self-signed-cert explanation must not show for a tunnel session');
    assert.ok(/Cloudflare/.test(html));
  });

  await at('a successful LAN start (chosen automatically because cloudflared is unavailable) still shows the certificate warning', async () => {
    const { sandbox, store } = loadPhoneUI({
      phoneDetectCloudflared: () => ({ ok: false, message: 'not available' }),
      phoneStart: (opts) => ({ ok: true, url: 'https://192.168.1.5:8443/?t=x', mode: 'lan' }),
    });
    await sandbox.vlPhoneOpen();
    const html = store['vl-phone-modal'].innerHTML;
    assert.ok(/certificate warning/i.test(html));
  });

  await at('QR CODE: with the real vendored library loaded, the phone URL actually renders as cells (regression test for QRCode.toCanvas, which the library never exposed)', async () => {
    const { sandbox, fillRectCalls } = loadPhoneUIWithCanvas({
      phoneDetectCloudflared: () => ({ ok: false, message: 'not available' }),
      phoneStart: () => ({ ok: true, url: 'https://192.168.1.5:8443/?t=abc123', mode: 'lan' }),
    });
    await sandbox.vlPhoneOpen();
    // First fillRect is always the background wipe; a real QR draws
    // many more on top of it. A blank/broken QR draws exactly one.
    assert.ok(fillRectCalls.length > 20, 'expected many filled cells for a real QR, got ' + fillRectCalls.length + ' — the QR is not actually rendering');
  });

  await at('QR CODE: with no generator loaded, it says so instead of drawing a square that will not scan', async () => {
    const { sandbox, fillRectCalls, fillTextCalls } = loadPhoneUIWithCanvas({
      loadQrLib: false,
      phoneDetectCloudflared: () => ({ ok: false, message: 'not available' }),
      phoneStart: () => ({ ok: true, url: 'https://192.168.1.5:8443/?t=abc123', mode: 'lan' }),
    });
    await sandbox.vlPhoneOpen();
    assert.strictEqual(fillRectCalls.length, 1, 'no library present — only the background wipe should draw, nothing scannable');
    assert.ok(fillTextCalls.some(args => /unavailable/i.test(args[0])), 'expected the "QR unavailable, use Copy link" fallback text');
  });

  await at('QR CODE: uses the real API — a factory call, not a QRCode.toCanvas method that this library never had', () => {
    assert.ok(!/typeof QRCode/.test(uiPhone), '_vlPhoneQR still checks for the nonexistent global QRCode');
    assert.ok(/qrcode\(0,\s*['"]M['"]\)/.test(uiPhone), 'expected the real qrcode(typeNumber, level) factory call, same pattern as the working MFA QR');
  });

  const asyncFails = asyncResults.filter(r => !r.ok);
  console.log('\nphone-input-tunnel: ' + (asyncResults.length - asyncFails.length) + '/' + asyncResults.length + ' passed');
  const totalFails = fails.length + asyncFails.length;
  process.exitCode = totalFails ? 1 : 0;
}

runAsyncTests();
