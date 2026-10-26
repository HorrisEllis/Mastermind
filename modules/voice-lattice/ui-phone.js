// ═══════════════════════════════════════════════════════════════════
// PHONE INPUT — UI
// modules/voice-lattice/ui-phone.js
//
// The button, the popup, and the bridge that turns phone audio into
// frames for the same capture path the local microphone uses.
//
// ─────────────────────────────────────────────────────────────────
// A PHONE IS AN INPUT DEVICE, NOT A SECOND PIPELINE
//
// Frames arrive as Int16 PCM over the socket, are converted back to
// Float32, and go into vlIngestFrame() — the identical function
// onaudioprocess calls. Same VAD, same 5s pre-roll, same segment
// boundaries, same ordered queue, same disk-first write.
//
// The alternative — a separate path for remote audio — would have
// drifted from the local one the first time either was touched, and
// the divergence would show up as "the phone loses the start of
// sentences" months later with no obvious cause.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THE POPUP HAS TO SAY
//
// The phone will show a certificate warning. That is not a bug and it
// is not optional: getUserMedia requires a secure context, the
// certificate is self-signed because it was generated on this machine,
// and the alternative is routing your voice through a third party.
//
// An unexplained security warning is how people abandon a feature —
// or worse, how they decide the safe default is the problem and switch
// to the one that leaks. So the popup explains it BEFORE the phone
// shows it.
//
// UUID: 4a3b2c1d-mod-9000-8000-uiphone00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const VL_PHONE = {
  running: false,
  connected: false,
  url: null,
  bridged: false,
  frames: 0,
  // Int16 arrives in whatever sizes the socket delivers. The capture
  // path expects ~4096-sample frames like the local mic, so remainder
  // samples carry across handlers rather than being padded or dropped.
  carry: new Float32Array(0),
  FRAME: 4096,
  RATE: 48000,          // the page requests 48k explicitly
};

// ── Bridge ─────────────────────────────────────────────────────────

function vlPhoneBridge() {
  if (VL_PHONE.bridged || !window.NXAPI?.onPhoneAudio) return false;
  VL_PHONE.bridged = true;

  window.NXAPI.onPhoneAudio((arrayBuffer) => {
    // Gate stays here AND in vlIngestFrame (belt-and-suspenders — a
    // frame that slips past one still meets the other) but it is no
    // longer a dead end: onPhoneStatus below is what actually makes
    // VL_UI.recording true for a phone-only capture. Before that wiring
    // existed, this check was permanently false whenever the desktop's
    // own mic orb hadn't ALSO been clicked — every phone frame arrived
    // correctly and was silently dropped right here.
    if (!VL_UI.recording) return;

    const pcm = new Int16Array(arrayBuffer);
    const incoming = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) incoming[i] = pcm[i] / 0x8000;

    // Waveform display only — the latest window of samples, for
    // _vlStartWave's phone-source draw loop (ui-capture.js). Not sample-
    // accurate across frame boundaries and doesn't need to be; it's a
    // picture of "audio is arriving right now," same as the local mic's
    // AnalyserNode gives for that path.
    if (typeof VL_UI !== 'undefined' && VL_UI.phoneWaveBuf) {
      const n = Math.min(incoming.length, VL_UI.phoneWaveBuf.length);
      VL_UI.phoneWaveBuf.set(incoming.subarray(incoming.length - n), VL_UI.phoneWaveBuf.length - n);
    }

    // Join whatever was left over last time, then emit whole frames.
    let buf = incoming;
    if (VL_PHONE.carry.length) {
      buf = new Float32Array(VL_PHONE.carry.length + incoming.length);
      buf.set(VL_PHONE.carry, 0);
      buf.set(incoming, VL_PHONE.carry.length);
    }

    let off = 0;
    while (buf.length - off >= VL_PHONE.FRAME) {
      vlIngestFrame(buf.slice(off, off + VL_PHONE.FRAME), VL_PHONE.RATE);
      off += VL_PHONE.FRAME;
      VL_PHONE.frames++;
    }
    VL_PHONE.carry = buf.slice(off);
  });

  // The phone connecting IS "start streaming or recording" — the ask was
  // that this alone begins a new session, no separate click on the
  // desktop's own orb required. Symmetric on disconnect: ending the
  // phone's socket ends the phone-sourced capture the same way clicking
  // the local orb off does — finalizes whatever was mid-utterance,
  // closes the session, doesn't strand a "still recording" state with
  // nothing left to feed it.
  window.NXAPI.onPhoneStatus?.(async (st) => {
    VL_PHONE.connected = !!st.connected;
    _vlPhoneRender();

    if (st.connected) {
      // Same guard vlOrbStart does before requesting the local mic —
      // recording audio nobody can ever turn into a node is a §1.2
      // pretend regardless of which device did the recording. Checked
      // AFTER the socket is already open (the phone can't ask this
      // question itself), so on failure the session is refused but the
      // phone is told to stop rather than left showing "STREAMING" over
      // a connection nothing is doing anything with.
      const whisper = (typeof _vlEnsureWhisper === 'function')
        ? await _vlEnsureWhisper()
        : { ok: false, message: 'Transcription requires the desktop app.' };
      if (!whisper.ok) {
        if (typeof mm_toast === 'function') {
          mm_toast(whisper.message || 'Local transcription is not available \u2014 phone audio would go nowhere.', 'warn', { dur: 7000 });
        }
        try { await window.NXAPI.phoneStop(); } catch (e) {}
        return;
      }

      const r = (typeof _vlBeginCapture === 'function')
        ? _vlBeginCapture('phone', { label: 'PHONE STREAMING \u2014 TAP PHONE TO STOP' })
        : { ok: false, reason: 'CAPTURE_CORE_UNAVAILABLE' };
      if (!r.ok && r.reason === 'SOURCE_BUSY') {
        if (typeof mm_toast === 'function') mm_toast(r.message, 'warn', { dur: 6000 });
        try { await window.NXAPI.phoneStop(); } catch (e) {}
      } else if (typeof mm_toast === 'function') {
        mm_toast('Phone connected \u2014 streaming to MASTERMIND', 'success', { dur: 3000 });
      }
    } else {
      if (typeof _vlEndCapture === 'function') _vlEndCapture('phone');
      VL_PHONE.carry = new Float32Array(0);
      if (typeof mm_toast === 'function') mm_toast('Phone disconnected', 'warn', { dur: 3000 });
    }
  });
  return true;
}

// ── Popup ──────────────────────────────────────────────────────────

async function vlPhoneOpen() {
  let el = document.getElementById('vl-phone-modal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'vl-phone-modal';
    el.className = 'mm-modal-backdrop';
    el.onclick = (e) => { if (e.target === el) vlPhoneClose(); };
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  vlPhoneBridge();

  // Tunnel is the default now — one click, straight to a link and a
  // QR code. The trade-off (Cloudflare sees the audio in transit) is
  // still stated, just on the ready screen once the link exists rather
  // than as a gate beforehand; "use LAN instead" stays one click away
  // there for anyone who wants your audio to never leave the network.
  el.innerHTML = _vlPhoneMarkup({ state: 'starting', mode: 'tunnel' });
  let detected;
  try { detected = await window.NXAPI.phoneDetectCloudflared(); }
  catch (e) { detected = { ok: false, message: e.message }; }

  if (!detected.ok) {
    // Falls back automatically rather than a dead end — LAN mode always
    // works, it just needs a locally-generated certificate first.
    await _vlPhoneStartWithMode('lan', { fallbackNote: detected.message });
    return;
  }

  await _vlPhoneStartWithMode('tunnel');
}

// The default and the only option most people ever need — unchanged
// from before Tunnel mode existed.
async function vlPhoneStartLan() {
  await _vlPhoneStartWithMode('lan');
}

// A second click, not a checkbox already ticked: the tradeoff (TLS
// terminates at Cloudflare's edge, not this machine) is real enough
// that seeing it once and clicking past it isn't the same as choosing
// it, the same reasoning the vault's own encryption-choice screens use.
async function vlPhoneStartTunnel() {
  await _vlPhoneStartWithMode('tunnel');
}

async function _vlPhoneStartWithMode(mode, opts) {
  const o = opts || {};
  const el = document.getElementById('vl-phone-modal');
  if (!el) return;
  el.innerHTML = _vlPhoneMarkup({ state: 'starting', mode, fallbackNote: o.fallbackNote });

  let res;
  try {
    res = await window.NXAPI.phoneStart({ mode });
  } catch (e) {
    res = { ok: false, message: e.message };
  }

  if (!res?.ok) {
    el.innerHTML = _vlPhoneMarkup({ state: 'error', message: res?.message || res?.error || res?.reason || 'could not start', mode });
    return res;
  }

  VL_PHONE.running = true;
  VL_PHONE.url = res.url;
  VL_PHONE.mode = res.mode || mode;
  el.innerHTML = _vlPhoneMarkup({ state: 'ready', res });
  _vlPhoneQR(res.url);
  return res;
}

function vlPhoneClose() {
  const el = document.getElementById('vl-phone-modal');
  if (el) el.style.display = 'none';
}

// Stops the server. Deliberately separate from closing the popup: the
// stream should keep working while you go back to the canvas.
async function vlPhoneStop() {
  try { await window.NXAPI.phoneStop(); } catch (e) {}
  VL_PHONE.running = false;
  VL_PHONE.connected = false;
  VL_PHONE.url = null;
  _vlPhoneRender();
  vlPhoneClose();
}

// Reachable from the tunnel-mode ready screen for anyone who reads the
// trade-off and would rather their audio never leave the network —
// stops the tunnel and restarts fresh in LAN mode, same modal.
async function vlPhoneSwitchToLan() {
  try { await window.NXAPI.phoneStop(); } catch (e) {}
  VL_PHONE.running = false;
  VL_PHONE.connected = false;
  VL_PHONE.url = null;
  await _vlPhoneStartWithMode('lan');
}

function vlPhoneCopy() {
  if (!VL_PHONE.url) return;
  try {
    navigator.clipboard.writeText(VL_PHONE.url);
    if (typeof mm_toast === 'function') mm_toast('Link copied \u2014 open it on your phone', 'success', { dur: 3000 });
  } catch (e) {
    if (typeof mm_toast === 'function') mm_toast('Could not copy: ' + e.message, 'error');
  }
}

function _vlPhoneMarkup(o) {
  const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  if (o.state === 'starting') {
    return `<div class="mm-modal"><div class="mm-modal-title">PHONE INPUT</div>
      <div class="vlp-note">${o.mode === 'tunnel' ? 'Getting a link\u2026 this can take a few seconds' : 'Starting the local server\u2026'}</div>
      ${o.fallbackNote ? `<div class="vlp-fine">Cloudflare Tunnel isn\u2019t available (${esc(o.fallbackNote)}) \u2014 using your local network instead. This still works fully.</div>` : ''}
    </div>`;
  }

  if (o.state === 'error') {
    return `<div class="mm-modal"><div class="mm-modal-title">PHONE INPUT</div>
      <div class="vlp-note vlp-bad">${esc(o.message)}</div>
      ${o.mode === 'tunnel' ? '' : `<div class="vlp-fine">A phone cannot use its microphone over plain HTTP \u2014 the browser API is
      absent, not blocked \u2014 so a certificate is required and there is no fallback that would work.</div>`}
      <div class="vlp-actions">
        <button class="mm-btn-ghost" onclick="vlPhoneOpen()">Back</button>
        <button class="mm-btn-ghost" onclick="vlPhoneClose()">Close</button>
      </div>
    </div>`;
  }

  const r = o.res || {};
  const isTunnel = r.mode === 'tunnel';
  return `<div class="mm-modal">
    <div class="mm-modal-title">PHONE INPUT${isTunnel ? ' \u2014 TUNNEL' : ''}</div>
    <div class="vlp-note">${isTunnel ? 'Open this on your phone \u2014 works from any network.' : 'Open this on your phone. It must be on the same network as this machine.'}</div>

    <div class="vlp-url" onclick="vlPhoneCopy()" title="Click to copy">${esc(r.url)}</div>
    <div class="vlp-actions">
      <button class="mm-btn-primary" onclick="vlPhoneCopy()">Copy link</button>
      <button class="mm-btn-ghost" onclick="vlPhoneStop()">Stop server</button>
      <button class="mm-btn-ghost" onclick="vlPhoneClose()">Close</button>
    </div>

    <canvas id="vl-phone-qr" width="180" height="180" class="vlp-qr"></canvas>

    ${isTunnel ? `<div class="vlp-warn">
      <strong>Audio passes through Cloudflare's network on the way here.</strong> TLS terminates
      at their edge, not this machine \u2014 that's the trade for a link that needs no certificate
      warning and works from any network.
      <div class="vlp-actions" style="margin-top:8px">
        <button class="mm-btn-ghost" onclick="vlPhoneSwitchToLan()">Keep it on my network instead</button>
      </div>
    </div>` : `<div class="vlp-warn">
      <strong>Your phone will show a certificate warning. Accept it.</strong><br>
      The certificate was generated on this machine, so nothing has vouched for it. That is the
      point: audio stays on your network and never reaches a third party. The alternative \u2014 a
      trusted certificate via a tunnel \u2014 means your voice passes through someone else\u2019s
      servers in the clear.
    </div>`}

    <div class="vlp-fine">
      The link contains a one-time key and only works while this window is open. Anyone who
      has it can stream audio into your vault, so do not share it.
    </div>

    <div class="vlp-fine" id="vl-phone-live">Waiting for a phone to connect\u2026</div>
  </div>`;
}

// QR via the vendored generator (foundation/ui/vendor/qrcode-generator.js
// — Kazuhiko Arase's qrcode-generator, MIT). That library's real API is
// a lowercase `qrcode(typeNumber, errorCorrectionLevel)` factory with
// .addData()/.make()/.isDark(r,c) — there is no `QRCode.toCanvas`
// anywhere in it. This used to call that nonexistent API, so the QR
// silently never rendered regardless of whether the library loaded.
// Fixed to use the same real, already-proven pattern the MFA TOTP QR
// uses (nexus-engine.js, mfaTotpBeginEnroll flow): typeNumber 0 lets
// the library pick the smallest size that fits the data, rendered as
// themed SVG cells rather than the library's default black/white
// raster, so it sits inside the app's palette.
function _vlPhoneQR(url) {
  const cvs = document.getElementById('vl-phone-qr');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  if (typeof qrcode !== 'function') { _vlPhoneQRUnavailable(ctx, cvs); return; }

  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    const n = qr.getModuleCount();
    const cell = cvs.width / n;
    ctx.fillStyle = '#e8f4ff';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  } catch (e) {
    _vlPhoneQRUnavailable(ctx, cvs);
  }
}

function _vlPhoneQRUnavailable(ctx, cvs) {
  // A QR that does not scan is worse than no QR — it looks like the
  // feature is broken rather than absent.
  ctx.fillStyle = '#3a4560';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('QR unavailable', cvs.width / 2, cvs.height / 2 - 6);
  ctx.fillText('use Copy link', cvs.width / 2, cvs.height / 2 + 8);
}

// ── Button state ───────────────────────────────────────────────────

function _vlPhoneRender() {
  const btn = document.getElementById('vl-phone-btn');
  if (btn) {
    btn.classList.toggle('on', VL_PHONE.running);
    btn.classList.toggle('live', VL_PHONE.connected);
    btn.title = VL_PHONE.connected ? 'Phone connected \u2014 streaming'
      : VL_PHONE.running ? 'Phone server running \u2014 not connected yet'
      : 'Use your phone as a microphone';
  }
  const live = document.getElementById('vl-phone-live');
  if (live) {
    live.textContent = VL_PHONE.connected
      ? 'Phone connected. Press the orb to start capturing.'
      : 'Waiting for a phone to connect\u2026';
  }
}

if (typeof window !== 'undefined') {
  window.VL_PHONE = VL_PHONE;
  window.vlIngestFramePhoneBridge = vlPhoneBridge;
  window.vlPhoneOpen = vlPhoneOpen;
  window.vlPhoneClose = vlPhoneClose;
  window.vlPhoneStop = vlPhoneStop;
  window.vlPhoneCopy = vlPhoneCopy;
  window.vlPhoneStartLan = vlPhoneStartLan;
  window.vlPhoneStartTunnel = vlPhoneStartTunnel;
  window.vlPhoneSwitchToLan = vlPhoneSwitchToLan;
}

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'voice-lattice-phone',
    uuid: '4a3b2c1d-mod-9000-8000-uiphone00001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
  });
}
