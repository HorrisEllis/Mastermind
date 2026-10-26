/**
 * crystalball-renderer.js — Renderer-side bridge
 *
 * Loaded as a <script type="module"> in index.html BEFORE the ALK modules.
 * Wires:
 *   - CrystalBall (Electron context bridge) → ALK kernel bus
 *   - WS server → ALK bus (audio tone, virtual camera frames)
 *   - Virtual camera canvas stream → getUserMedia replacement
 *   - Bitstream monitor → ALK bus + UI panel
 *   - Auto-updater status → UI
 *   - WebRTC encrypted pipeline via magnet link
 *
 * VIRTUAL CAMERA STRATEGY (browser-side)
 * ──────────────────────────────────────
 * The pipeline.js VCamBridge sends VCAM_FRAME binary messages over WS.
 * Here we:
 *   1. Create an OffscreenCanvas (FRAME_W × FRAME_H)
 *   2. On each VCAM_FRAME message: draw to canvas
 *   3. Capture it as a MediaStream: canvas.captureStream(30)
 *   4. Store as window.__crystalballVCamStream
 *   5. Monkey-patch navigator.mediaDevices.getUserMedia:
 *      if called with vcamId or source:'crystalball',
 *      return the canvas MediaStream instead of a real camera.
 *
 * This makes MediaPipe see the uploaded video as if it were a webcam.
 * No OS-level virtual device needed. Fully cross-platform.
 *
 * WEBRTC ENCRYPTED PIPELINE
 * ──────────────────────────
 * Extends the existing ALKMesh magnet link system.
 * Adds DataChannel-level AES-256-GCM encryption on top of DTLS.
 * Key derived from session ID via Web Crypto HKDF.
 */

'use strict';

(async function initCrystalBallRenderer() {

  // ── Wait for Electron context bridge ─────────────────────────────────────
  const CB = window.CrystalBall;
  if (!CB) {
    console.warn('[CBRenderer] CrystalBall context bridge not found — running without Electron features');
    return;
  }

  const WS_PORT  = parseInt(CB.env.wsPort  || '7750', 10);
  const VCAM_ID  = CB.env.vcamId || '';
  const IS_DEV   = CB.env.isDev;
  const FRAME_W  = 1280;
  const FRAME_H  = 720;

  // ── WebSocket connection to local pipeline server ─────────────────────────
  let ws    = null;
  let wsOk  = false;

  const WS_RECONNECT_MS = 2000;

  function connectWS() {
    ws = new WebSocket(`ws://127.0.0.1:${WS_PORT}`);
    ws.binaryType = 'arraybuffer';

    ws.addEventListener('open', () => {
      wsOk = true;
      console.log('[CBRenderer] WS connected');
      dispatchAlkEvent('alk.crystalball.ws.connected', { port: WS_PORT });
    });

    ws.addEventListener('close', () => {
      wsOk = false;
      setTimeout(connectWS, WS_RECONNECT_MS);
    });

    ws.addEventListener('error', (e) => {
      console.warn('[CBRenderer] WS error:', e);
    });

    ws.addEventListener('message', (ev) => {
      if (ev.data instanceof ArrayBuffer) {
        onBinaryMessage(ev.data);
      } else {
        try { onTextMessage(JSON.parse(ev.data)); } catch (_) {}
      }
    });
  }

  connectWS();

  // ── Binary channel constants (mirrors ws-server.js) ───────────────────────
  const CH = Object.freeze({
    VIDEO_FRAME:    0x00000001,
    AUDIO_CHUNK:    0x00000002,
    VCAM_FRAME:     0x00000003,
    BITSTREAM_TICK: 0x00000004,
  });

  // ── Virtual camera canvas ─────────────────────────────────────────────────
  const vcamCanvas  = new OffscreenCanvas(FRAME_W, FRAME_H);
  const vcamCtx     = vcamCanvas.getContext('2d');
  let   vcamStream  = null;
  let   vcamReady   = false;

  // Paint a placeholder frame (green tint with text)
  vcamCtx.fillStyle = '#040a07';
  vcamCtx.fillRect(0, 0, FRAME_W, FRAME_H);
  vcamCtx.fillStyle = '#39ff6a22';
  vcamCtx.fillRect(0, 0, FRAME_W, FRAME_H);

  // Capture canvas as MediaStream
  vcamStream = vcamCanvas.captureStream
    ? vcamCanvas.captureStream(30)
    : null;

  if (vcamStream) {
    window.__crystalballVCamStream = vcamStream;
    vcamReady = true;
    console.log('[CBRenderer] virtual camera canvas stream ready');
  }

  // ── getUserMedia monkey-patch ─────────────────────────────────────────────
  // When called with { video: { deviceId: vcamId } } or { crystalball: true },
  // return the canvas stream instead of a real camera.
  // Falls through to native getUserMedia for all other constraints.

  const _nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async function patchedGUM(constraints) {
    const videoCons = constraints?.video;
    const isCBRequest =
      constraints?.crystalball === true ||
      (VCAM_ID && videoCons?.deviceId === VCAM_ID) ||
      (typeof videoCons === 'object' && videoCons?.deviceId?.exact === VCAM_ID);

    if (isCBRequest && vcamStream) {
      console.log('[CBRenderer] returning virtual camera stream');
      return vcamStream;
    }

    return _nativeGetUserMedia(constraints);
  };

  // ── Binary message router ─────────────────────────────────────────────────

  function onBinaryMessage(buf) {
    if (buf.byteLength < 4) return;
    const view      = new DataView(buf);
    const channelId = view.getUint32(0, false); // big-endian
    const payload   = buf.slice(4);

    switch (channelId) {
      case CH.VCAM_FRAME:    onVCamFrame(payload);     break;
      case CH.VIDEO_FRAME:   onVideoFrame(payload);    break;
      case CH.AUDIO_CHUNK:   onAudioChunk(payload);    break;
      case CH.BITSTREAM_TICK: onBitstreamTick(payload); break;
    }
  }

  // ── Virtual camera frame handler ──────────────────────────────────────────

  async function onVCamFrame(payload) {
    if (!vcamCtx) return;
    const typeFlag = payload[0]; // 0=raw RGBA, 1=encoded image
    const data     = payload.slice(1);

    if (typeFlag === 0x00) {
      // Raw RGBA — create ImageData and draw
      if (data.byteLength === FRAME_W * FRAME_H * 4) {
        const imageData = new ImageData(new Uint8ClampedArray(data), FRAME_W, FRAME_H);
        vcamCtx.putImageData(imageData, 0, 0);
      }
    } else if (typeFlag === 0x01) {
      // Encoded image (JPEG/PNG) — decode via createImageBitmap
      try {
        const blob   = new Blob([data]);
        const bitmap = await createImageBitmap(blob);
        vcamCtx.drawImage(bitmap, 0, 0, FRAME_W, FRAME_H);
        bitmap.close();
      } catch (e) {
        console.warn('[CBRenderer] vcam image decode error:', e.message);
      }
    }
  }

  // ── Pipeline video frame (decompressed from server) ───────────────────────

  function onVideoFrame(payload) {
    // Pass to ALK kernel as a pre-decoded frame
    dispatchAlkEvent('alk.video.pipeline.frame', {
      data:      payload,
      timestamp: Date.now(),
    });
  }

  // ── Pipeline audio chunk ──────────────────────────────────────────────────

  function onAudioChunk(payload) {
    if (payload.byteLength < 24) return;
    const view = new DataView(payload.buffer, payload.byteOffset);

    const features = {
      energy:   view.getFloat32(0,  false),
      zcr:      view.getFloat32(4,  false),
      spectral: view.getFloat32(8,  false),
      zScore:   view.getFloat32(12, false),
      anomaly:  view.getUint8(16) === 1,
      silence:  view.getUint8(17) === 1,
    };

    // Emit tone event to ALK bus (consumed by SpeechStateModule, HTL)
    dispatchAlkEvent('alk.verbal.analysis.tone', {
      energy:   features.energy,
      zcr:      features.zcr,
      spectral: features.spectral,
      cadence:  0,
      silence:  features.silence,
      source:   'pipeline',
    });

    if (features.anomaly) {
      dispatchAlkEvent('alk.audio.anomaly', features);
    }
  }

  // ── Bitstream monitor tick ────────────────────────────────────────────────

  function onBitstreamTick(payload) {
    if (payload.byteLength < 32) return;
    const view = new DataView(payload.buffer, payload.byteOffset);
    const tick = {
      video: {
        fps:       view.getFloat32(0,  false),
        rawBps:    view.getFloat32(4,  false),
        compBps:   view.getFloat32(8,  false),
        ratio:     view.getFloat32(12, false),
        latencyMs: view.getFloat32(16, false),
      },
      audio: {
        rawBps:    view.getFloat32(20, false),
        compBps:   view.getFloat32(24, false),
        latencyMs: view.getFloat32(28, false),
      },
    };

    dispatchAlkEvent('alk.crystalball.bitstream', tick);
    updateBitstreamPanel(tick);
  }

  // ── Text message router ───────────────────────────────────────────────────

  function onTextMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        console.log('[CBRenderer] WS welcome, clientId:', msg.clientId);
        break;

      case 'update.deployed':
        dispatchAlkEvent('alk.crystalball.update', { status: 'deployed' });
        showUpdateBanner();
        break;

      case 'update.error':
        console.warn('[CBRenderer] update error:', msg.message);
        break;

      case 'vcam.source':
        dispatchAlkEvent('alk.crystalball.vcam.source', msg.source);
        break;

      case 'vcam.stats':
        updateVCamStats(msg.stats);
        break;

      case 'nexus.event':
        handleNexusEvent(msg);
        break;

      case 'nexus.snapshot.created':
        if (nexusPanel) { refreshNexusCatalog(); updateNexusPanel({ type: 'nexus:snapshot:created', ...msg }); }
        dispatchAlkEvent('alk.crystalball.nexus.snapshot', msg);
        break;

      case 'nexus.revert.applied':
        dispatchAlkEvent('alk.crystalball.nexus.revert', msg);
        break;

      case 'nexus.auto_revert':
        dispatchAlkEvent('alk.crystalball.nexus.auto_revert', msg);
        break;

      case 'webrtc.answer':
        handleIncomingAnswer(msg.answer);
        break;
    }
  }

  // ── ALK bus dispatch helper ───────────────────────────────────────────────

  function dispatchAlkEvent(type, payload) {
    // Try to get the bus from the global ALK scope
    // Index.html sets window._alkBus after init
    const bus = window._alkBus;
    if (bus?.emit) {
      bus.emit(type, payload);
    } else {
      // Fallback: use BroadcastChannel so other scripts can pick it up
      window.__cbEventQueue = window.__cbEventQueue ?? [];
      window.__cbEventQueue.push({ type, payload, ts: Date.now() });
    }
  }

  // ── Bitstream panel UI ────────────────────────────────────────────────────

  let bitstreamPanel = null;

  function ensureBitstreamPanel() {
    if (bitstreamPanel) return bitstreamPanel;

    const el = document.createElement('div');
    el.id = 'cb-bitstream-panel';
    el.innerHTML = `
      <div class="cb-bs-header">
        <span class="cb-bs-title">BITSTREAM</span>
        <button class="cb-bs-close" onclick="document.getElementById('cb-bitstream-panel').style.display='none'">×</button>
      </div>
      <div class="cb-bs-body">
        <div class="cb-bs-section">
          <div class="cb-bs-label">VIDEO</div>
          <div class="cb-bs-row"><span>fps</span><span id="cb-v-fps">–</span></div>
          <div class="cb-bs-row"><span>raw</span><span id="cb-v-raw">–</span></div>
          <div class="cb-bs-row"><span>comp</span><span id="cb-v-comp">–</span></div>
          <div class="cb-bs-row"><span>ratio</span><span id="cb-v-ratio">–</span></div>
          <div class="cb-bs-row"><span>latency</span><span id="cb-v-lat">–</span></div>
          <div class="cb-bs-bar-track"><div class="cb-bs-bar-fill" id="cb-v-fill"></div></div>
        </div>
        <div class="cb-bs-section">
          <div class="cb-bs-label">AUDIO</div>
          <div class="cb-bs-row"><span>raw</span><span id="cb-a-raw">–</span></div>
          <div class="cb-bs-row"><span>comp</span><span id="cb-a-comp">–</span></div>
          <div class="cb-bs-row"><span>ratio</span><span id="cb-a-ratio">–</span></div>
          <div class="cb-bs-row"><span>latency</span><span id="cb-a-lat">–</span></div>
          <div class="cb-bs-bar-track"><div class="cb-bs-bar-fill" id="cb-a-fill"></div></div>
        </div>
        <div class="cb-bs-section">
          <div class="cb-bs-label">BUFFER</div>
          <div id="cb-buf-bars" class="cb-buf-bars"></div>
          <div class="cb-bs-row"><span>vcam</span><span id="cb-vcam-fill">–</span></div>
        </div>
      </div>
    `;

    // Inline styles — matches ALK dark terminal aesthetic
    el.style.cssText = `
      position:fixed;bottom:16px;left:16px;
      background:rgba(2,7,5,.97);border:1px solid #1f4a2c;
      width:200px;font-family:'Azeret Mono',monospace;font-size:7px;
      color:#b4e8c0;z-index:9999;pointer-events:all;
    `;
    el.querySelectorAll('.cb-bs-header').forEach(h => {
      h.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid #163320;';
    });
    el.querySelectorAll('.cb-bs-title').forEach(t => {
      t.style.cssText = 'font-size:6px;letter-spacing:2px;color:#39ff6a;text-transform:uppercase;';
    });
    el.querySelectorAll('.cb-bs-close').forEach(b => {
      b.style.cssText = 'background:none;border:none;color:#2e6640;cursor:pointer;font-size:10px;';
    });
    el.querySelectorAll('.cb-bs-body').forEach(b => {
      b.style.cssText = 'padding:6px 8px;';
    });
    el.querySelectorAll('.cb-bs-section').forEach(s => {
      s.style.cssText = 'margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid #0f2011;';
    });
    el.querySelectorAll('.cb-bs-label').forEach(l => {
      l.style.cssText = 'font-size:5px;letter-spacing:2px;color:#2e6640;text-transform:uppercase;margin-bottom:3px;';
    });
    el.querySelectorAll('.cb-bs-row').forEach(r => {
      r.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:1px;';
    });
    el.querySelectorAll('.cb-bs-bar-track').forEach(t => {
      t.style.cssText = 'height:2px;background:#071008;margin-top:3px;';
    });
    el.querySelectorAll('.cb-bs-bar-fill').forEach(f => {
      f.style.cssText = 'height:100%;background:#39ff6a;width:0%;transition:width .3s;';
    });

    document.body.appendChild(el);
    bitstreamPanel = el;
    return el;
  }

  function updateBitstreamPanel(tick) {
    ensureBitstreamPanel();

    const fmt = (bps) => {
      if (bps > 1_000_000) return (bps/1_000_000).toFixed(1) + ' Mbps';
      if (bps > 1_000)     return (bps/1_000).toFixed(1)     + ' kbps';
      return bps + ' bps';
    };

    const s = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const f = (id, w)   => { const el = document.getElementById(id); if (el) el.style.width = Math.min(100, w) + '%'; };

    s('cb-v-fps',   tick.video.fps.toFixed(1) + ' fps');
    s('cb-v-raw',   fmt(tick.video.rawBps));
    s('cb-v-comp',  fmt(tick.video.compBps));
    s('cb-v-ratio', tick.video.ratio.toFixed(1) + ':1');
    s('cb-v-lat',   tick.video.latencyMs.toFixed(0) + ' ms');
    f('cb-v-fill',  (tick.video.compBps / 10_000_000) * 100); // scale to 10Mbps

    s('cb-a-raw',   fmt(tick.audio.rawBps));
    s('cb-a-comp',  fmt(tick.audio.compBps));
    s('cb-a-ratio', tick.audio.ratio.toFixed(1) + ':1');
    s('cb-a-lat',   tick.audio.latencyMs.toFixed(0) + ' ms');
    f('cb-a-fill',  (tick.audio.compBps / 256_000) * 100); // scale to 256kbps
  }

  function updateVCamStats(stats) {
    const el = document.getElementById('cb-vcam-fill');
    if (el) el.textContent = Math.round(stats.fillRatio * 100) + '% / ' + stats.latencyMs + 'ms';
  }

  // ── Update banner ─────────────────────────────────────────────────────────

  function showUpdateBanner() {
    let banner = document.getElementById('cb-update-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'cb-update-banner';
      banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;
        background:#39ff6a;color:#040a07;
        font-family:'Azeret Mono',monospace;font-size:9px;
        padding:4px 12px;display:flex;justify-content:space-between;
        align-items:center;z-index:99999;letter-spacing:1px;
      `;
      banner.innerHTML = `
        <span>⬡ UPDATE DEPLOYED — reload to apply</span>
        <button onclick="location.reload()" style="background:#040a07;color:#39ff6a;border:none;padding:2px 8px;cursor:pointer;font-size:9px;font-family:'Azeret Mono',monospace;">RELOAD</button>
      `;
      document.body.appendChild(banner);
    }
    banner.style.display = 'flex';
  }

  // ── WebRTC encrypted pipeline ─────────────────────────────────────────────
  //
  // Extends alk-mesh.js WebRTC with:
  //   - DataChannel for arbitrary binary (video + audio bypass)
  //   - Per-frame AES-256-GCM encryption (symmetric key from session HKDF)
  //   - 2-second jitter buffer on receive side
  //
  // The magnet link format is extended:
  //   alk://v1/{sessionId}/{iceHash}/{ts}/{ttl}?{params}&enc=aes256gcm
  //   The 'enc' param signals E2E encryption. Both peers derive the same
  //   session key from the sessionId via HKDF using Web Crypto.

  const RTCPipeline = (() => {
    let _sessionKey = null;
    let _frameIndex = 0;
    let _pc         = null;
    let _dc         = null;

    // Jitter buffer (receive side)
    const _recvBuf = [];
    const RECV_BUF_CAP = 60; // 2s at 30fps

    async function deriveKey(sessionId) {
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(sessionId),
        { name: 'HKDF' },
        false,
        ['deriveKey']
      );
      return crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: new TextEncoder().encode('crystalball-v1'),
          info: new Uint8Array(0),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }

    async function encryptFrame(plaintext) {
      if (!_sessionKey) return plaintext;
      const idx = _frameIndex++;
      // Per-frame IV: derive from session key + frame index
      const ivMaterial = await crypto.subtle.importKey(
        'raw', _sessionKey, { name: 'HKDF' }, false, ['deriveKey']
      ).catch(() => null);

      // Simpler: use counter-based IV (session key + 12-byte counter)
      const iv = new Uint8Array(12);
      new DataView(iv.buffer).setUint32(8, idx, false);

      const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        _sessionKey,
        plaintext
      );

      // [ 4b frameIndex | 12b IV | ciphertext ]
      const header = new ArrayBuffer(16);
      new DataView(header).setUint32(0, idx, false);
      new Uint8Array(header, 4).set(iv);
      return concat(header, ct);
    }

    async function decryptFrame(ciphertext) {
      if (!_sessionKey) return ciphertext;
      const view = new DataView(ciphertext);
      const iv   = new Uint8Array(ciphertext, 4, 12);
      const ct   = ciphertext.slice(16);
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, _sessionKey, ct);
    }

    function concat(a, b) {
      const out = new Uint8Array(a.byteLength + b.byteLength);
      out.set(new Uint8Array(a), 0);
      out.set(new Uint8Array(b), a.byteLength);
      return out.buffer;
    }

    async function initFromMagnet(magnetStr) {
      const url      = new URL(magnetStr.replace('alk://', 'alk-proto://'));
      const sessionId = url.pathname.split('/')[1];
      const encrypted = url.searchParams.get('enc') === 'aes256gcm';

      if (encrypted) {
        _sessionKey = await deriveKey(sessionId);
        console.log('[RTCPipeline] E2E encryption active for session:', sessionId.slice(0,8));
      }

      // Create peer connection
      _pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        encodedInsertableStreams: false,
      });

      // Encrypted DataChannel for arbitrary binary
      _dc = _pc.createDataChannel('crystalball-e2e', {
        ordered:           false,  // UDP semantics — we have our own jitter buffer
        maxRetransmits:    0,       // drop, don't retransmit (latency over reliability)
      });

      _dc.binaryType = 'arraybuffer';

      _dc.onmessage = async (ev) => {
        let data = ev.data;
        if (encrypted) {
          try { data = await decryptFrame(data); } catch (e) {
            console.warn('[RTCPipeline] decrypt failed:', e.message);
            return;
          }
        }

        // Push to receive jitter buffer
        _recvBuf.push({ data, ts: Date.now() });
        if (_recvBuf.length > RECV_BUF_CAP) _recvBuf.shift();

        // Emit to ALK bus
        dispatchAlkEvent('alk.crystalball.rtc.frame', { data });
      };

      _pc.ontrack = (ev) => {
        console.log('[RTCPipeline] track received:', ev.track.kind);
        dispatchAlkEvent('alk.crystalball.rtc.track', {
          kind: ev.track.kind,
          stream: ev.streams[0],
        });
      };

      return { pc: _pc, dc: _dc, sessionId };
    }

    async function sendFrame(data) {
      if (!_dc || _dc.readyState !== 'open') return;
      const payload = _sessionKey ? await encryptFrame(data) : data;
      _dc.send(payload);
    }

    return { initFromMagnet, sendFrame, getBuffer: () => _recvBuf };
  })();

  // Expose to renderer
  window.__cbRTCPipeline = RTCPipeline;

  async function handleIncomingOffer(magnet) {
    console.log('[CBRenderer] incoming magnet offer');
    dispatchAlkEvent('alk.crystalball.magnet.offer', { magnet });
    // ALK mesh handles the actual WebRTC handshake — we just notify
  }

  async function handleIncomingAnswer(answer) {
    console.log('[CBRenderer] incoming answer');
    dispatchAlkEvent('alk.crystalball.magnet.answer', { answer });
  }

  // ── Nexus snapshot events from WS ────────────────────────────────────────

  function handleNexusEvent(msg) {
    const ev = msg.event;
    if (!ev) return;
    ensureNexusPanel();
    updateNexusPanel(ev);
  }

  // ── Nexus status panel ────────────────────────────────────────────────────

  let nexusPanel = null;

  function ensureNexusPanel() {
    if (nexusPanel) return nexusPanel;

    const el = document.createElement('div');
    el.id = 'cb-nexus-panel';
    el.innerHTML = `
      <div class="cb-nx-header">
        <span class="cb-nx-title">NEXUS SNAPSHOTS</span>
        <button class="cb-nx-snap" id="cb-nx-snap-btn">⬡ SNAP</button>
      </div>
      <div class="cb-nx-body">
        <div class="cb-nx-row"><span>status</span><span id="cb-nx-status">–</span></div>
        <div class="cb-nx-row"><span>latest</span><span id="cb-nx-latest">–</span></div>
        <div class="cb-nx-row"><span>count</span><span id="cb-nx-count">–</span></div>
        <div class="cb-nx-row"><span>stability</span><span id="cb-nx-stability">–</span></div>
        <div id="cb-nx-event" class="cb-nx-event">–</div>
      </div>
      <div class="cb-nx-catalog" id="cb-nx-catalog"></div>
    `;

    el.style.cssText = `
      position:fixed;bottom:16px;right:16px;
      background:rgba(2,7,5,.97);border:1px solid #1f4a2c;
      width:220px;font-family:'Azeret Mono',monospace;font-size:7px;
      color:#b4e8c0;z-index:9998;pointer-events:all;
    `;
    el.querySelector('.cb-nx-header').style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid #163320;';
    el.querySelector('.cb-nx-title').style.cssText  = 'font-size:6px;letter-spacing:2px;color:#39ff6a;text-transform:uppercase;';
    el.querySelector('.cb-nx-snap').style.cssText   = 'background:rgba(57,255,106,.1);border:1px solid #39ff6a;color:#39ff6a;padding:2px 6px;cursor:pointer;font-size:6px;font-family:inherit;';
    el.querySelector('.cb-nx-body').style.cssText   = 'padding:5px 8px;';
    el.querySelectorAll('.cb-nx-row').forEach(r => { r.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:2px;'; });
    el.querySelector('.cb-nx-event').style.cssText  = 'font-size:6px;color:#2e6640;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    el.querySelector('.cb-nx-catalog').style.cssText = 'border-top:1px solid #0f2011;padding:4px 8px;max-height:80px;overflow-y:auto;';

    el.querySelector('#cb-nx-snap-btn').addEventListener('click', async () => {
      if (window.CrystalBall?.nexus) {
        try {
          el.querySelector('#cb-nx-snap-btn').textContent = '…';
          await window.CrystalBall.nexus.snapshot('manual');
          el.querySelector('#cb-nx-snap-btn').textContent = '✓ SNAP';
          setTimeout(() => { el.querySelector('#cb-nx-snap-btn').textContent = '⬡ SNAP'; }, 2000);
          await refreshNexusCatalog();
        } catch (e) {
          el.querySelector('#cb-nx-snap-btn').textContent = '✗ SNAP';
        }
      }
    });

    document.body.appendChild(el);
    nexusPanel = el;

    // Load initial catalog
    refreshNexusCatalog();
    return el;
  }

  async function refreshNexusCatalog() {
    if (!window.CrystalBall?.nexus) return;
    try {
      const catalog = await window.CrystalBall.nexus.catalog();
      const el = document.getElementById('cb-nx-catalog');
      if (!el) return;
      const countEl = document.getElementById('cb-nx-count');
      if (countEl) countEl.textContent = catalog.length;

      if (!catalog.length) { el.innerHTML = '<div style="color:#2e6640;font-size:6px;">no snapshots</div>'; return; }

      const latest = catalog[catalog.length - 1];
      const latestEl = document.getElementById('cb-nx-latest');
      if (latestEl) latestEl.textContent = latest.commit ?? latest.id.slice(0,8);

      el.innerHTML = catalog.slice(-5).reverse().map(e => `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;padding:1px 0;border-bottom:1px solid #071008;">
          <span style="color:#4a9960;">${new Date(e.ts).toTimeString().slice(0,8)}</span>
          <span style="color:#78c490;">${e.reason}</span>
          <span style="color:#2e6640;">${(e.size/1024).toFixed(0)}KB</span>
          <button onclick="window.__cbRenderer?.revertTo('${e.id}')" style="background:none;border:1px solid #163320;color:#2e6640;padding:1px 4px;cursor:pointer;font-size:5px;font-family:'Azeret Mono',monospace;">↩</button>
        </div>
      `).join('');
    } catch (_) {}
  }

  function updateNexusPanel(ev) {
    const statusEl = document.getElementById('cb-nx-status');
    const stabEl   = document.getElementById('cb-nx-stability');
    const eventEl  = document.getElementById('cb-nx-event');

    if (eventEl) eventEl.textContent = ev.type;

    if (ev.type === 'nexus:snapshot:created' && statusEl) {
      statusEl.textContent = '✓ snapshot';
      statusEl.style.color = '#39ff6a';
      refreshNexusCatalog();
    } else if (ev.type === 'nexus:revert:applied' && statusEl) {
      statusEl.textContent = `↩ reverted`;
      statusEl.style.color = '#ffcc00';
      refreshNexusCatalog();
    } else if (ev.type === 'nexus:stability:ok' && stabEl) {
      stabEl.textContent = '✓ stable';
      stabEl.style.color = '#39ff6a';
    } else if (ev.type === 'nexus:stability:breach' && stabEl) {
      stabEl.textContent = `✗ ${ev.breach}`;
      stabEl.style.color = '#ff4455';
    }
  }

  // ── Expose revert helper ───────────────────────────────────────────────────

  window.__cbRenderer = window.__cbRenderer ?? {};
  window.__cbRenderer.revertTo = async (id) => {
    if (!window.CrystalBall?.nexus) return;
    if (!confirm(`Revert to snapshot ${id.slice(0,8)}? The renderer will reload.`)) return;
    await window.CrystalBall.nexus.revert(id, 'manual');
  };

  window.__cbRenderer = {
    sendVideoFrame: (rgba, width, height) => {
      if (!wsOk || !ws) return;
      const header = new ArrayBuffer(4);
      new DataView(header).setUint16(0, width,  false);
      new DataView(header).setUint16(2, height, false);
      const frame = new Uint8Array(4 + rgba.byteLength);
      frame.set(new Uint8Array(header), 0);
      frame.set(new Uint8Array(rgba), 4);
      // Channel prefix
      const channelBuf = new ArrayBuffer(4);
      new DataView(channelBuf).setUint32(0, CH.VIDEO_FRAME, false);
      const msg = new Uint8Array(4 + frame.length);
      msg.set(new Uint8Array(channelBuf), 0);
      msg.set(frame, 4);
      ws.send(msg.buffer);
    },

    sendAudioChunk: (pcmBuffer) => {
      if (!wsOk || !ws) return;
      const channelBuf = new ArrayBuffer(4);
      new DataView(channelBuf).setUint32(0, CH.AUDIO_CHUNK, false);
      const msg = new Uint8Array(4 + pcmBuffer.byteLength);
      msg.set(new Uint8Array(channelBuf), 0);
      msg.set(new Uint8Array(pcmBuffer), 4);
      ws.send(msg.buffer);
    },

    uploadFile: async (filePath, meta) => CB.vcam.loadFile(filePath, meta),
    getPipelineStats: async () => CB.pipeline.getStats(),
    getUpdaterStatus: async () => CB.updater.status(),
    pullUpdate: async () => CB.updater.pullNow(),
    vcamStream: () => window.__crystalballVCamStream,
    rtcPipeline: RTCPipeline,
    showBitstreamPanel: () => { ensureBitstreamPanel(); },
  };

  // ── Show bitstream panel by default in dev ────────────────────────────────
  if (IS_DEV) {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => ensureBitstreamPanel(), 1000);
    });
  }

  // ── Flush queued ALK events once bus is available ─────────────────────────
  const flushInterval = setInterval(() => {
    const bus = window._alkBus;
    if (!bus?.emit) return;
    const q = window.__cbEventQueue ?? [];
    while (q.length) {
      const { type, payload } = q.shift();
      bus.emit(type, payload);
    }
    clearInterval(flushInterval);
  }, 100);

  console.log('[CBRenderer] initialized — virtual camera:', vcamReady, '| WS port:', WS_PORT);

})();
