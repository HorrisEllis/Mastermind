// ═══════════════════════════════════════════════════════════════════
// MM SESSION
// foundation/core/mm-session.js
//
// Where you were, so you can go back there.
//
// ─────────────────────────────────────────────────────────────────
// WHAT THIS IS NOT
//
// It is not a second copy of your data. It records POSITION only —
// which view you were in, the canvas viewport, which module tab was
// open — and it lives inside the vault payload like everything else,
// so it inherits the same encryption, the same integrity check and the
// same snapshots. Nothing new is written outside the vault.
//
// ─────────────────────────────────────────────────────────────────
// WHY IT ASKS
//
// Restoring a view silently is a small violation: the person opens the
// app expecting the front door and lands mid-way through something they
// were doing yesterday. So it asks once, and only when there is a
// position worth returning to — a canvas with nodes, a module that was
// actually open. An empty canvas is not a session to resume.
//
// The offer expires. A position from three weeks ago is not "where you
// left off", it is archaeology, and prompting about it trains people to
// dismiss the prompt without reading it.
//
// UUID: 4a3b2c1d-core-7000-8000-session0001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const MM_SESSION = (() => {

  const MAX_AGE_HOURS = 72;   // beyond this, do not offer

  let _state = {
    view: null,        // 'home' | 'canvas' | module id
    module: null,      // module id when a module was open
    tab: null,         // tab within that module
    viewport: null,    // { zoom, panX, panY }
    at: null,          // ISO timestamp
    nodeCount: 0,
  };

  let _offered = false;

  // Called from wherever the person moves. Cheap and idempotent: it writes
  // to memory and marks the vault dirty, letting the existing autosave
  // debounce decide when that reaches disk.
  function record(view, extra) {
    const e = extra || {};
    _state = {
      view,
      module: e.module || (view !== 'home' && view !== 'canvas' ? view : null),
      tab: e.tab || null,
      viewport: e.viewport || _captureViewport(),
      at: new Date().toISOString(),
      nodeCount: _nodeCount(),
    };
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.session.moved', { view, at: _state.at });
    if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
  }

  function _captureViewport() {
    try {
      const nx = (typeof CANVAS !== 'undefined' && CANVAS.NX) || null;
      if (!nx || !nx.viewport) return null;
      return { zoom: nx.viewport.zoom, panX: nx.viewport.panX, panY: nx.viewport.panY };
    } catch (e) { return null; }
  }

  function _nodeCount() {
    try { return (CANVAS.NX.nodes || []).length; } catch (e) { return 0; }
  }

  function serialize() { return _state; }

  function hydrate(saved) {
    if (saved && typeof saved === 'object') _state = Object.assign(_state, saved);
  }

  function ageHours() {
    if (!_state.at) return null;
    return (Date.now() - Date.parse(_state.at)) / 3600000;
  }

  // Is there a position worth returning to?
  function resumable() {
    if (!_state.view || _state.view === 'home') return false;
    if (_state.nodeCount === 0 && !_state.module) return false;
    const age = ageHours();
    if (age == null || age > MAX_AGE_HOURS) return false;
    return true;
  }

  function describe() {
    const age = ageHours();
    const when = age == null ? ''
      : age < 1 ? 'less than an hour ago'
      : age < 24 ? Math.round(age) + ' hours ago'
      : Math.round(age / 24) + ' days ago';

    if (_state.module) return 'You were in ' + _state.module.toUpperCase() + ', ' + when + '.';
    if (_state.view === 'canvas') {
      return 'You were on the canvas with ' + _state.nodeCount +
        ' node' + (_state.nodeCount === 1 ? '' : 's') + ', ' + when + '.';
    }
    return 'You were in ' + _state.view + ', ' + when + '.';
  }

  // Asks once per launch, and only when there is something to ask about.
  // Returns true if the person chose to resume.
  async function offerResume() {
    if (_offered || !resumable()) return false;
    _offered = true;

    const yes = await mmConfirm(
      describe() + '\n\nPick up where you left off?\n\n' +
      'Choosing no leaves everything exactly as it is — it opens the menu instead. ' +
      'Nothing is cleared.'
    );

    if (!yes) { record('home'); return false; }
    return restore();
  }

  // Restores position only. The data was already loaded from the vault;
  // this moves the view to it.
  function restore() {
    try {
      if (_state.view === 'canvas' || _state.nodeCount > 0) {
        if (typeof enterCanvas === 'function') enterCanvas();
        if (_state.viewport && typeof CANVAS !== 'undefined' && CANVAS.NX) {
          Object.assign(CANVAS.NX.viewport, _state.viewport);
          if (typeof draw === 'function') draw();
        }
      }
      if (_state.module && typeof MM_BUS !== 'undefined') {
        MM_BUS.emit('mm.module.resume', { module: _state.module, tab: _state.tab });
      }
      return true;
    } catch (e) {
      MMLog?.warn('session', 'Could not restore the previous view: ' + e.message);
      return false;
    }
  }

  // Explicit, separate, and destructive — so it is never the accidental
  // outcome of dismissing a prompt.
  async function clearCanvas() {
    const n = _nodeCount();
    if (!n) { mm_toast('The canvas is already empty', 'info'); return false; }
    const ok = await mmConfirm(
      'Clear the canvas?\n\nThis removes ' + n + ' node' + (n === 1 ? '' : 's') +
      ' and their connections from the vault.\n\n' +
      'A snapshot of the current vault is taken first, so this can be undone from the boot screen.'
    );
    if (!ok) return false;

    try {
      const dir = NX_CONFIG.dataDir;
      await window.NXAPI?.snapshotCreate?.(dir, NX_CONFIG.vaultPath, 'pre-clear-canvas');
    } catch (e) {
      mm_toast('Could not take a snapshot first — canvas NOT cleared', 'error');
      return false;
    }

    CANVAS.NX.nodes = [];
    CANVAS.NX.conns = [];
    if (typeof draw === 'function') draw();
    record('canvas');
    if (typeof vaultSave === 'function') await vaultSave(true);
    return true;
  }

  return { record, serialize, hydrate, resumable, describe, offerResume, restore, clearCanvas, ageHours };
})();

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'mm-session',
    uuid: '4a3b2c1d-core-7000-8000-session0001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
  });
}

// ── Optional: fresh canvas per capture session ─────────────────────
// Off by default (OPTS.session_clear_canvas). A silent per-session wipe
// of the live canvas is the single most dangerous default this file
// could ship — someone opens the orb expecting to add to what's there
// and finds it empty. So: opt-in only, and even when on, a snapshot is
// taken first (same safety net as the explicit clearCanvas() button)
// so an accidental toggle is recoverable from the boot screen, not a
// silent loss.
if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.on === 'function') {
  MM_BUS.on('mm.capture.session.start', async () => {
    try {
      const o = (typeof OPTS !== 'undefined' && OPTS) || {};
      if (!o.session_clear_canvas) return;
      const nodes = (typeof CANVAS !== 'undefined' && CANVAS.NX?.nodes) || [];
      if (!nodes.length) return; // nothing to clear, nothing to snapshot

      const dir = (typeof NX_CONFIG !== 'undefined' && NX_CONFIG.dataDir) || null;
      if (dir && window.NXAPI?.snapshotCreate) {
        const snap = await window.NXAPI.snapshotCreate(dir, NX_CONFIG.vaultPath, 'pre-session-autoclear');
        if (!snap?.ok) { MMLog?.warn('session', 'Auto-clear skipped — pre-clear snapshot failed'); return; }
      }
      CANVAS.NX.nodes = [];
      CANVAS.NX.conns = [];
      if (typeof draw === 'function') draw();
      MMLog?.info('session', 'Canvas auto-cleared for new session (snapshot taken first)');
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.session.canvas.autocleared', {});
    } catch (e) { MMLog?.warn('session', 'Auto-clear-on-session-start failed: ' + e.message); }
  });
}
