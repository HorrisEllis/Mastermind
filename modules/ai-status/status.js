// ═══════════════════════════════════════════════════════════════════
// AI STATUS — modules/ai-status/status.js
// v1.0.0
//
// Built because "I clicked AI expand and it did nothing" was accurate:
// aiExpandNode fired T.aiThinking(), got null back, and returned without
// dismissing anything or saying why. A web-agent round trip legitimately
// takes 20-90 seconds, so silence is indistinguishable from failure.
//
// Guarantees, all three:
//   • something visible the whole time a call is in flight, with the
//     agent, the account and a running elapsed count
//   • a terminal toast on EVERY outcome — success, failure, or timeout.
//     No silent return paths.
//   • a Show button, because when an agent-side thing breaks the fastest
//     diagnosis is looking at the actual window.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const AI_STATUS = { active: {}, seq: 0, _el: null, _timer: null };

function _aiStatusEl() {
  if (AI_STATUS._el && document.body.contains(AI_STATUS._el)) return AI_STATUS._el;
  const el = document.createElement('div');
  el.id = 'ai-status-chip';
  el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:9650;display:none;' +
    'background:var(--void,#050810);border:1px solid var(--c,#00c8ff);padding:9px 12px;' +
    'font-family:var(--f-mono,monospace);font-size:8.5px;color:var(--c,#00c8ff);' +
    'display:none;align-items:center;gap:10px;box-shadow:0 4px 24px rgba(0,0,0,.5)';
  document.body.appendChild(el);
  AI_STATUS._el = el;
  return el;
}

function _aiStatusRender() {
  const el = _aiStatusEl();
  const jobs = Object.values(AI_STATUS.active);
  if (!jobs.length) {
    el.style.display = 'none';
    if (AI_STATUS._timer) { clearInterval(AI_STATUS._timer); AI_STATUS._timer = null; }
    return;
  }
  el.style.display = 'flex';
  const j = jobs[jobs.length - 1];
  const secs = Math.round((Date.now() - j.started) / 1000);
  const dots = '·'.repeat((Math.floor(Date.now() / 400) % 4) + 1);
  const extra = jobs.length > 1 ? ` (+${jobs.length - 1} more)` : '';
  // Live preview (from aiStatusUpdate, populated by periodic cg:peek
  // polling) — turns a static "still waiting" spinner into visible
  // proof something is actually happening on the agent's page.
  const previewLine = j.preview
    ? `<div style="color:var(--dim,#667);margin-top:3px;max-width:260px;overflow:hidden;` +
      `text-overflow:ellipsis;white-space:nowrap">${j.generating ? '\u270e ' : ''}${_aiEsc(j.preview)}</div>`
    : '';
  el.innerHTML =
    `<div style="display:flex;flex-direction:column;max-width:280px">` +
    `<div style="display:flex;align-items:center;gap:10px">` +
    `<span style="display:inline-block;width:9px;height:9px;border:1px solid var(--c,#00c8ff);` +
      `border-top-color:transparent;border-radius:50%;animation:aiSpin .8s linear infinite;flex-shrink:0"></span>` +
    `<span>${_aiEsc(j.label)}${extra} <span style="color:var(--dim,#667)">${_aiEsc(j.agent || '')}` +
      `${j.account && j.account !== 'default' ? '/' + _aiEsc(j.account) : ''}</span> ${dots} ${secs}s</span>` +
    (j.agent ? `<button class="opts-action-btn" style="font-size:7px;padding:2px 7px;flex-shrink:0" ` +
      `onclick="aiStatusShow('${_aiEsc(j.agent)}','${_aiEsc(j.account || 'default')}')">Show</button>` : '') +
    `</div>${previewLine}</div>`;
}

function _aiEsc(s) { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; }

function aiStatusStart(label, meta) {
  const m = meta || {};
  const id = 'ai' + (++AI_STATUS.seq);
  AI_STATUS.active[id] = { id, label: label || 'Thinking', agent: m.agent, account: m.account, started: Date.now() };
  if (!AI_STATUS._timer) AI_STATUS._timer = setInterval(_aiStatusRender, 400);
  _aiStatusRender();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('ai.status.start', { id, label, ...m });
  return id;
}

// Refreshes a still-running job with live progress — a preview of
// whatever reply text exists so far and whether the page currently
// looks like it's generating. Silently ignored if the job already
// finished (a stray late peek response racing the terminal call).
function aiStatusUpdate(id, extra) {
  const job = AI_STATUS.active[id];
  if (!job) return;
  Object.assign(job, extra);
  _aiStatusRender();
}

// ok=true  → quiet success toast with the duration
// ok=false → loud failure toast naming the real reason
function aiStatusEnd(id, ok, message) {
  const job = AI_STATUS.active[id];
  delete AI_STATUS.active[id];
  _aiStatusRender();
  const secs = job ? Math.round((Date.now() - job.started) / 1000) : 0;
  const who = job && job.agent ? ` (${job.agent}${job.account && job.account !== 'default' ? '/' + job.account : ''})` : '';
  if (typeof mm_toast === 'function') {
    if (ok) mm_toast(`✓ ${job ? job.label : 'AI'} — ${secs}s${who}`, 'success', { dur: 2600 });
    else    mm_toast(`✗ ${job ? job.label : 'AI'} failed after ${secs}s${who}: ${message || 'unknown error'}`, 'error', { dur: 7000 });
  }
  if (typeof MMLog !== 'undefined') {
    (ok ? MMLog.info : MMLog.error).call(MMLog, 'ai', `${job ? job.label : 'AI'} ${ok ? 'ok' : 'FAILED'} in ${secs}s${who}${ok ? '' : ' — ' + (message || '')}`);
  }
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('ai.status.end', { id, ok, message, seconds: secs });
  return { ok, seconds: secs };
}

function aiStatusShow(agent, account) {
  if (window.NXAPI?.cgOpen) window.NXAPI.cgOpen(agent, account || 'default', true);
  else if (typeof mm_toast === 'function') mm_toast('Agent windows need the Electron app', 'warn');
}

function aiStatusActive() { return Object.values(AI_STATUS.active); }

// Anything still running when the app is torn down would otherwise leave
// a chip spinning forever.
window.addEventListener('beforeunload', () => {
  for (const id of Object.keys(AI_STATUS.active)) delete AI_STATUS.active[id];
});

(function _aiStatusStyle() {
  if (document.getElementById('ai-status-style')) return;
  const st = document.createElement('style');
  st.id = 'ai-status-style';
  st.textContent = '@keyframes aiSpin { to { transform: rotate(360deg); } }';
  document.head.appendChild(st);
})();

window.AI_STATUS = AI_STATUS;
window.aiStatusStart = aiStatusStart;
window.aiStatusUpdate = aiStatusUpdate;
window.aiStatusEnd = aiStatusEnd;
window.aiStatusShow = aiStatusShow;
window.aiStatusActive = aiStatusActive;

if (typeof MMLog !== 'undefined') MMLog.info('ai', 'AI status v1.0.0 — live progress + guaranteed terminal toast');
