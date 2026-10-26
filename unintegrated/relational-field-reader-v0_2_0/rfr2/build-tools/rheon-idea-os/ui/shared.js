/**
 * shared.js — rheon UI utilities
 * Loaded by every page. Zero dependencies.
 * All server comms go through api() — UI_CONTRACT v1.0.0
 */

// ── Config ────────────────────────────────────────────────────────
const SERVER = window.location.origin;
const WS_URL  = `ws://${window.location.host}/ws`;

// ── API ───────────────────────────────────────────────────────────
/**
 * Call the rheon REST API.
 * All UI operations go through here — UI_CONTRACT isolation rule.
 * @param {string} method
 * @param {string} path
 * @param {object} [body]
 * @returns {Promise<any>} data field on success
 * @throws {Error} with code and message on failure
 */
async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${SERVER}${path}`, opts);
  } catch (err) {
    throw Object.assign(new Error('Cannot reach rheon-server'), { code: 'NETWORK_ERROR' });
  }

  const json = await res.json();
  if (!json.ok) {
    const e = json.error || {};
    throw Object.assign(new Error(e.message || 'Unknown error'), { code: e.code || 'ERROR' });
  }
  return json.data;
}

const GET    = (path)        => api('GET',    path);
const POST   = (path, body)  => api('POST',   path, body);
const PUT    = (path, body)  => api('PUT',    path, body);
const DEL    = (path)        => api('DELETE', path);

// ── WebSocket ─────────────────────────────────────────────────────
let _ws = null;
const _wsHandlers = new Map(); // type → handler[]

function ws() {
  if (_ws && _ws.readyState === WebSocket.OPEN) return _ws;

  _ws = new WebSocket(WS_URL);

  _ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    const handlers = _wsHandlers.get(msg.type) || [];
    handlers.forEach(h => h(msg.payload, msg));

    // Wildcard handlers
    (_wsHandlers.get('*') || []).forEach(h => h(msg.payload, msg));
  };

  _ws.onclose = () => {
    setTimeout(() => ws(), 2000); // reconnect
  };

  _ws.onerror = () => {
    _ws.close();
  };

  return _ws;
}

/**
 * Subscribe to a WS event type.
 * @param {string}   type  — event type or '*' for all
 * @param {function} handler
 */
function onEvent(type, handler) {
  if (!_wsHandlers.has(type)) _wsHandlers.set(type, []);
  _wsHandlers.get(type).push(handler);
  ws(); // ensure connected
}

// ── Toast ─────────────────────────────────────────────────────────
function toast(msg, kind = 'ok', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Navigation active state ───────────────────────────────────────
function initNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href');
    if (href === path || (href !== '/' && path.startsWith(href))) {
      link.classList.add('active');
    }
  });

  // Connect WS and update status dot
  const dot = document.getElementById('ws-dot');
  const label = document.getElementById('ws-label');

  const sock = ws();

  function setStatus(state) {
    if (!dot) return;
    dot.className = 'status-dot';
    if (state === 'open')  { dot.classList.add('ok');   if (label) label.textContent = 'live'; }
    if (state === 'close') { dot.classList.add('warn');  if (label) label.textContent = 'reconnecting…'; }
    if (state === 'error') { dot.classList.add('err');   if (label) label.textContent = 'error'; }
  }

  sock.addEventListener('open',  () => setStatus('open'));
  sock.addEventListener('close', () => setStatus('close'));
  sock.addEventListener('error', () => setStatus('error'));
}

// ── Format helpers ────────────────────────────────────────────────
function formatTs(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  const now = Date.now();
  const diff = now - ms;

  if (diff < 60000)   return `${Math.round(diff/1000)}s ago`;
  if (diff < 3600000) return `${Math.round(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.round(diff/3600000)}h ago`;
  return d.toISOString().slice(0, 10);
}

function formatBytes(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`;
  return `${(b/1048576).toFixed(1)}MB`;
}

function truncHash(h) {
  return h ? h.slice(0, 8) : '—';
}

// ── Shared nav HTML ───────────────────────────────────────────────
function renderNav() {
  return `
<nav class="nav">
  <a href="/" class="nav-logo">RHEON<span>.hub</span></a>
  <div class="nav-sep"></div>
  <div class="nav-links">
    <a href="/"               class="nav-link">Home</a>
    <a href="/spec-builder"   class="nav-link">Spec Builder</a>
    <a href="/spec-library"   class="nav-link">Library</a>
    <a href="/repository"     class="nav-link">Repository</a>
    <a href="/idea-ledger"    class="nav-link">Idea Ledger</a>
    <a href="/architect"      class="nav-link">Architect</a>
  </div>
  <div class="nav-status">
    <div class="status-dot" id="ws-dot"></div>
    <span id="ws-label">connecting…</span>
  </div>
</nav>`;
}

// ── Expose globals ────────────────────────────────────────────────
window.rheon = { api, GET, POST, PUT, DEL, ws, onEvent, toast, formatTs, formatBytes, truncHash, renderNav, initNav };
