// ═══════════════════════════════════════════════════════════════════
// UNIFIED CAPTURE — modules/capture/capture.js
// v1.0.0
//
// Capture was scattered: canvas spawn, voice capture, ALM
// externalization, Horizon seeds, dictation — each with its own path
// into the lattice, each able to drift. This consolidates them behind
// ONE function, and adds the two capture routes that actually remove
// work rather than adding another box to fill in:
//
//   1. mmCapture(text, opts) — the single entry. Lattice + VLE + the
//      optional extras (canvas node, ALM delta) in one call.
//   2. mmQuickCapture() — a one-line bar, one keystroke from anywhere
//      (Ctrl+Shift+Space, or ` ). Auto-focused, so the dictation mic
//      attaches immediately: press, speak, Enter. No navigation.
//   3. AI exchanges captured automatically — every prompt and reply
//      that goes through an agent enters the lattice. This was being
//      thrown away entirely, and it is the densest, most deliberate
//      text in the whole app.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const CAPTURE = {
  count: 0,
  lastId: null,
  aiExchanges: 0,
  captureAI: true,        // toggle: record AI prompts/replies into the lattice
  _bar: null,
};

// The single capture entry. Everything optional is off unless asked for,
// so callers that already do their own work don't double up.
function mmCapture(text, opts) {
  const o = opts || {};
  const clean = String(text || '').trim();
  if (!clean) return null;

  const kind = o.kind || 'alm.externalize';
  const result = { text: clean, kind, latticeId: null, nodeId: null, tags: [] };

  // 1. Lattice — tags, relation to what came before, associations
  if (o.lattice !== false && typeof latticeIngest === 'function') {
    try {
      const r = latticeIngest(kind, o.sourceId || null, clean, { tags: o.tags, extra: o.extra });
      if (r) { result.latticeId = r.id; result.tags = r.tags; result.relation = r.relation; }
    } catch (e) { MMLog?.error('capture', 'lattice: ' + e.message); }
  }

  // 2. VLE — association edges, redundancy, invariants, prediction
  if (o.vle !== false && typeof vleIngest === 'function') {
    try {
      const v = vleIngest(clean);
      if (v) { result.redundancy = v.redundancy; result.invariants = v.invariants; if (!result.tags.length) result.tags = v.tags; }
    } catch (e) { MMLog?.error('capture', 'vle: ' + e.message); }
  }

  // 3. Optional canvas node, already wired by tags
  if (o.spawnNode && typeof CANVAS !== 'undefined' && CANVAS.spawnNode) {
    try {
      const title = clean.length > 40 ? clean.slice(0, 37) + '…' : clean;
      const n = CANVAS.spawnNode(o.nodeType || 'insight', o.x || 200, o.y || 200, { title, body: clean, tags: result.tags });
      result.nodeId = n.id;
      if (typeof connectByTags === 'function') connectByTags(n.id);
    } catch (e) { MMLog?.error('capture', 'spawn: ' + e.message); }
  }

  // 4. Optional ALM delta
  if (o.delta && typeof almWriteDelta === 'function') {
    try { almWriteDelta(o.deltaType || 'insight', clean, { source: 'capture', kind, skipLattice: o.lattice !== false }); }
    catch (e) { MMLog?.error('capture', 'delta: ' + e.message); }
  }

  CAPTURE.count++;
  CAPTURE.lastId = result.latticeId;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('capture.made', { kind, id: result.latticeId, tags: result.tags });
  return result;
}

// ── AI exchange capture ───────────────────────────────────────────
// Called by the transport around every agent round-trip. Prompt and
// reply are captured as separate lattice entries so the reply relates
// to the prompt through the normal sequence edge, and both are
// available to coherence/pattern detection like anything else.
function mmCaptureExchange(prompt, reply, meta) {
  if (!CAPTURE.captureAI) return null;
  const m = meta || {};
  const out = {};
  try {
    if (prompt) out.prompt = mmCapture(prompt, {
      kind: 'ai.prompt', vle: false,
      extra: { agent: m.agent, account: m.account },
    });
    if (reply) out.reply = mmCapture(reply, {
      kind: 'ai.reply',
      extra: { agent: m.agent, account: m.account, inReplyTo: out.prompt ? out.prompt.latticeId : null },
    });
    CAPTURE.aiExchanges++;
  } catch (e) { MMLog?.error('capture', 'exchange: ' + e.message); }
  return out;
}

// ── Quick capture bar ─────────────────────────────────────────────
function mmQuickCapture() {
  if (CAPTURE._bar) { CAPTURE._bar.querySelector('input')?.focus(); return; }
  const wrap = document.createElement('div');
  wrap.id = 'mm-quick-capture';
  wrap.style.cssText = 'position:fixed;top:12%;left:50%;transform:translateX(-50%);z-index:9700;' +
    'width:min(680px,92vw);background:var(--void,#050810);border:1px solid var(--c,#00c8ff);' +
    'box-shadow:0 8px 40px rgba(0,0,0,.6);padding:14px';
  wrap.innerHTML =
    '<div style="font-family:var(--f-mono,monospace);font-size:7.5px;letter-spacing:2px;color:var(--dim,#667);margin-bottom:8px">' +
      'QUICK CAPTURE · Enter to keep · Esc to discard · F2 to dictate</div>' +
    '<input type="text" placeholder="What just happened, or what are you thinking?" ' +
      'style="width:100%;box-sizing:border-box;background:var(--deep,#0a0f1a);border:1px solid var(--wire2,#2a3550);' +
      'color:var(--white,#fff);font-family:var(--f-mono,monospace);font-size:12px;padding:10px 12px;outline:none">' +
    '<div id="mm-qc-hint" style="font-family:var(--f-mono,monospace);font-size:7.5px;color:var(--dim,#667);margin-top:8px;min-height:12px"></div>';
  document.body.appendChild(wrap);
  CAPTURE._bar = wrap;

  const input = wrap.querySelector('input');
  const hint = wrap.querySelector('#mm-qc-hint');
  const prevFocus = document.activeElement;
  input.focus();   // focus is what makes the dictation mic attach immediately

  // Removing a focused element leaves activeElement pointing at a
  // detached node, and every keyboard shortcut in the app that skips
  // itself "while typing" then stays dead. Blur and hand focus back.
  const close = () => {
    try { input.blur(); } catch (e) {}
    wrap.remove();
    CAPTURE._bar = null;
    try {
      // Only hand focus back if that element is still ON SCREEN. Restoring
      // into a hidden panel is worse than not restoring: focus lands in an
      // invisible text field and every shortcut that skips itself "while
      // typing" silently stops working, with nothing to show why.
      const usable = prevFocus && prevFocus !== input && document.contains(prevFocus)
        && typeof prevFocus.focus === 'function'
        && prevFocus.offsetParent !== null
        && !(prevFocus.closest && prevFocus.closest('.hidden'));
      if (usable) prevFocus.focus();
      else if (document.body && document.body.focus) document.body.focus();
    } catch (e) {}
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) { close(); return; }
      const r = mmCapture(val, { kind: 'alm.externalize', delta: true });
      close();
      if (r && typeof mm_toast === 'function') {
        const bits = [];
        if (r.tags?.length) bits.push(r.tags.slice(0, 3).join(', '));
        if (r.relation) bits.push(r.relation + ' the last one');
        mm_toast('✓ Captured' + (bits.length ? ' — ' + bits.join(' · ') : ''), 'success', { dur: 2600 });
      }
    }
  });
  // Live tag preview so it's obvious the thing is being understood, not just stored
  input.addEventListener('input', () => {
    const v = input.value.trim();
    if (v.length < 8 || typeof vleExtractTags !== 'function') { hint.textContent = ''; return; }
    try {
      const tags = vleExtractTags(v, (typeof VLE_STATE !== 'undefined' && VLE_STATE.wordBank) || {});
      hint.textContent = tags.length ? 'tags: ' + tags.slice(0, 5).join(' · ') : '';
    } catch (e) { hint.textContent = ''; }
  });
}

(function _captureInstall() {
  function wire() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+Space anywhere, or backtick when not already typing
      const typing = dictIsDictatable ? dictIsDictatable(document.activeElement) : false;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') { e.preventDefault(); mmQuickCapture(); return; }
      if (e.key === '`' && !typing) { e.preventDefault(); mmQuickCapture(); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

window.CAPTURE = CAPTURE;
window.mmCapture = mmCapture;
window.mmCaptureExchange = mmCaptureExchange;
window.mmQuickCapture = mmQuickCapture;

if (typeof MMLog !== 'undefined') MMLog.info('capture', 'Unified capture v1.0.0 — Ctrl+Shift+Space or ` for quick capture; AI exchanges auto-captured');
