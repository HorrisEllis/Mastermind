import { ALKMesh, MagnetLink } from './modules/mesh/alk-mesh.js';
import { SISOBus, StreamLog } from './siso.js';

// ── Bus ────────────────────────────────────────────────────────────────────────
const bus = new SISOBus({ log: new StreamLog('EVENTS') });
let mesh    = null;
let stream  = null;
let audioCtx = null;
let analyser = null;
let rafId    = null;
let currentMagnet = null;
let connected     = false;

// ── Toast system ──────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 3000) {
  const stack = document.getElementById('toast-stack');
  const t = document.createElement('div');
  const icons = { ok: '✓', fail: '✗', info: '◈' };
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] ?? '◈'}</span><span>${msg}</span>`;
  stack.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 250);
  }, duration);
}

// ── Auto-connect on load ──────────────────────────────────────────────────────
window.addEventListener('load', () => {
  setStatus('idle', '🎙', 'TAP TO START');
});

window.mainAction = async function() {
  document.getElementById('main-btn').disabled = true;
  setStatus('connecting', '⏳', 'REQUESTING MIC');

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl:  false,
        sampleRate:       { ideal: 48000 },
        channelCount:     1,
      },
      video: false,
    });
  } catch (e) {
    setStatus('error', '✗', 'MIC DENIED');
    setInfo('info-audio', e.message, 'error');
    showToast('Mic access denied', 'fail');
    document.getElementById('main-btn').disabled = false;
    return;
  }

  setInfo('info-audio', '48kHz · mono · captured', 'signal');
  startLevelMeter(stream);

  mesh = new ALKMesh({
    bus,
    headless: false,
    onStream: () => {},
    onMagnet: (magnet) => showMagnet(magnet),
  });

  // ── Handshake events → toasts ─────────────────────────────────────────────
  bus.on('alk.mesh.handshake.attempt', (ev) => {
    const label = ev.transport === 'lan' ? 'LAN' : ev.transport === 'broadcast' ? 'SAME DEV' : ev.transport;
    showToast(`Trying ${label}…`, 'info', 2500);
    setStatus('connecting', '⏳', `${label} HANDSHAKE`);
  });

  bus.on('alk.mesh.handshake.result', (ev) => {
    const label = ev.transport === 'lan' ? 'LAN' : ev.transport === 'broadcast' ? 'SAME DEV' : ev.transport;
    if (ev.ok === true) {
      showToast(`${label} handshake OK`, 'ok', 3000);
    } else if (ev.ok === false) {
      showToast(`${label} not found`, 'fail', 2500);
    } else {
      // null = magnet fallback pending — pulse will keep re-emitting
      showToast('Showing magnet · pulses every 15s', 'info', 4000);
    }
  });

  // ── Peer connected ────────────────────────────────────────────────────────
  bus.on('alk.mesh.transport.ready', (ev) => {
    setInfo('info-transport', ev.transport?.toUpperCase(), 'signal');
    setStatus('active', '🎙', 'LIVE');
  });

  bus.on('alk.mesh.peer.connected', (ev) => {
    connected = true;
    setInfo('info-peer', `connected · ${ev.transport}`, 'signal');
    setInfo('info-session', ev.sessionId?.slice(0,8) ?? '—', 'signal');
    setStatus('active', '🔴', 'STREAMING');
    document.getElementById('ring-fill').style.stroke = 'var(--rose)';
    showToast('Connected · streaming', 'ok', 4000);
  });

  bus.on('alk.mesh.peer.disconnected', () => {
    if (connected) {
      connected = false;
      setInfo('info-peer', 'disconnected', 'warn');
      setStatus('connecting', '⏳', 'RECONNECTING');
      showToast('Peer disconnected', 'fail', 3000);
    }
  });

  // ── Magnet re-pulse (every 15s from host heartbeat) ───────────────────────
  bus.on('alk.mesh.magnet', (ev) => {
    showMagnet(ev.magnet);
    if (ev.repulse) showToast('Magnet refreshed · scan to connect', 'info', 3000);
  });

  bus.on('alk.mesh.error', (ev) => {
    console.warn('[ALK-Mesh]', ev.context, ev.message);
  });

  setStatus('connecting', '⏳', 'CONNECTING');

  // Kick off: LAN first, BC fallback, magnet/QR if neither (see alk-mesh.js)
  const pastedMagnet = document.getElementById('magnet-input').value.trim() || null;
  await mesh.connectAsMic(pastedMagnet, stream);

  document.getElementById('main-btn').style.display = 'none';
  document.getElementById('stop-btn').style.display = '';
};

window.stopCapture = function() {
  mesh?.stopAll();
  stream?.getTracks().forEach(t => t.stop());
  cancelAnimationFrame(rafId);
  audioCtx?.close();
  connected = false;
  stream = null; audioCtx = null; analyser = null;
  setStatus('idle', '🎙', 'IDLE');
  setInfo('info-transport', '—');
  setInfo('info-peer', 'awaiting connection');
  setInfo('info-session', '—');
  document.getElementById('main-btn').style.display = '';
  document.getElementById('main-btn').disabled = false;
  document.getElementById('stop-btn').style.display = 'none';
  document.getElementById('magnet-section').classList.remove('visible');
  document.getElementById('ring-fill').style.stroke = 'var(--signal)';
};

window.onMagnetPaste = function(val) {
  if (val.startsWith('alk://')) showToast('Magnet link ready', 'ok', 2000);
};

// ── Status helpers ────────────────────────────────────────────────────────────
const energyHistory = [];
let energyMean = 0, energySigma = 0;

function startLevelMeter(str) {
  audioCtx = new AudioContext({ sampleRate: 48000 });
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  audioCtx.createMediaStreamSource(str).connect(analyser);
  const buf = new Uint8Array(analyser.frequencyBinCount);

  function tick() {
    rafId = requestAnimationFrame(tick);
    analyser.getByteTimeDomainData(buf);

    let sum = 0;
    for (const b of buf) { const s = (b - 128) / 128; sum += s * s; }
    const rms = Math.sqrt(sum / buf.length);

    // Rolling stats for σ
    energyHistory.push(rms);
    if (energyHistory.length > 30) energyHistory.shift();
    energyMean  = energyHistory.reduce((a,b)=>a+b,0) / energyHistory.length;
    const variance = energyHistory.reduce((a,b)=>a+(b-energyMean)**2,0) / energyHistory.length;
    energySigma = Math.sqrt(variance);
    const zScore = energySigma > 0 ? (rms - energyMean) / energySigma : 0;

    // Update energy fill
    document.getElementById('energy-fill').style.width = Math.min(100, rms * 400) + '%';
    document.getElementById('info-sigma').textContent  = zScore.toFixed(2) + 'σ';

    // 8-bar level display
    analyser.getByteFrequencyData(buf);
    const step = Math.floor(buf.length / 8);
    for (let i = 0; i < 8; i++) {
      const avg = (buf[i*step] + (buf[i*step+1]||0)) / 2;
      const h = Math.max(4, Math.round(avg / 255 * 36));
      const bar = document.getElementById(`lb${i}`);
      if (bar) {
        bar.style.height = h + 'px';
        bar.style.background = h > 28 ? 'var(--rose)' : h > 16 ? 'var(--amber)' : 'var(--signal)';
      }
    }
  }
  tick();
}

// ── QR code generation (micro, no deps) ──────────────────────────────────────
// Simple QR: just display magnet as dense text matrix for now.
// A full QR encoder is ~3KB — inline here as a minimal implementation.

function showMagnet(magnetStr) {
  currentMagnet = magnetStr;
  document.getElementById('magnet-section').classList.add('visible');
  document.getElementById('magnet-text').textContent = magnetStr;

  // Draw minimal visual representation (text-based, scannable as URL)
  const canvas = document.getElementById('qr-canvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#020705';
  ctx.fillRect(0,0,200,200);

  // Draw the magnet link as a dense grid of characters (placeholder for QR)
  // In production: use a proper QR encoder. This makes the text visible at least.
  ctx.fillStyle = '#39ff6a';
  ctx.font = '7px Courier New';
  const lines = [];
  for (let i = 0; i < magnetStr.length; i += 28) {
    lines.push(magnetStr.slice(i, i+28));
  }
  lines.forEach((line, i) => ctx.fillText(line, 4, 16 + i*10));

  // Draw border
  ctx.strokeStyle = 'rgba(57,255,106,.3)';
  ctx.strokeRect(0,0,200,200);

  // Display session info
  try {
    const m = MagnetLink.parse(magnetStr);
    setInfo('info-session', m.sessionId?.slice(0,8), 'signal');
  } catch (_) {}
}

window.copyMagnet = function() {
  if (currentMagnet) {
    navigator.clipboard.writeText(currentMagnet).then(() => {
      document.getElementById('copy-btn').textContent = 'COPIED ✓';
      setTimeout(() => { document.getElementById('copy-btn').textContent = 'COPY MAGNET LINK'; }, 2000);
    });
  }
};

// ── Status helpers ────────────────────────────────────────────────────────────
function setStatus(state, icon, label) {
  document.getElementById('ring-icon').textContent = icon;
  document.getElementById('ring-label').textContent = label;
  const fill = document.getElementById('ring-fill');
  fill.className = 'ring-fill ' + state;
}

function setInfo(id, val, cls) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = val ?? '—';
  el.className = 'info-val' + (cls ? ' ' + cls : '');
}
