// ═══════════════════════════════════════════════════════════════════
// LEVERAGE MAP — ui.js
// v1.0.0
//
// Sidebar panel (the LVG tab added to the existing side-panel) plus a
// canvas-wide "leverage view" toggle that recolors/resizes real node
// elements by score. No separate canvas, no separate node array —
// everything here reads and writes CANVAS.NX.nodes directly, so it
// persists through the canvas's existing save path with no new
// storage code.
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {
  let _lvgViewActive = false;

  function _selectedNode() {
    if (typeof NX === 'undefined' || !NX.selected || NX.selected.size === 0) return null;
    const id = [...NX.selected][0];
    return NX.nodes.find(n => n.id === id) || null;
  }

  // Called when the LVG tab is opened, and whenever the selection changes
  // while it's already open (via the updateSidePanel wrap below).
  function lvgOnTabOpen() {
    const n = _selectedNode();
    const empty = document.getElementById('lvg-empty');
    const content = document.getElementById('lvg-content');
    if (!n) {
      if (empty) empty.style.display = '';
      if (content) content.style.display = 'none';
      return;
    }
    if (empty) empty.style.display = 'none';
    if (content) content.style.display = '';

    const tension = n.tension ?? LVG_DEFAULTS.tension;
    const weight  = n.weight  ?? LVG_DEFAULTS.weight;
    const slope   = n.slope   ?? LVG_DEFAULTS.slope;
    const kind    = n.lvgKind ?? LVG_DEFAULTS.kind;

    document.getElementById('lvg-tension').value = tension;
    document.getElementById('lvg-weight').value  = weight;
    document.getElementById('lvg-slope').value   = slope;
    Object.keys(LVG_KINDS).forEach(k => {
      document.getElementById('lvg-btn-' + k)?.classList.toggle('act', k === kind);
    });

    _lvgRenderScore(n);
  }

  function _lvgRenderScore(n) {
    const t = parseFloat(document.getElementById('lvg-tension').value);
    const w = parseFloat(document.getElementById('lvg-weight').value);
    const s = parseFloat(document.getElementById('lvg-slope').value);
    document.getElementById('lvg-t-val').textContent = t.toFixed(1);
    document.getElementById('lvg-w-val').textContent = w.toFixed(1);
    document.getElementById('lvg-s-val').textContent = s.toFixed(1);

    const score = lvgCalcScore({ tension: t, weight: w, slope: s });
    const scoreEl = document.getElementById('lvg-score');
    scoreEl.textContent = score.toFixed(2);
    scoreEl.style.color = lvgScoreColor(score);

    const { pct, label } = lvgMutationProbability(score);
    document.getElementById('lvg-mutation').textContent = `Mutation probability: ${pct}% — ${label}`;
    return score;
  }

  // Slider moved — write straight onto the selected canvas node.
  window.lvgSliderChanged = function () {
    const n = _selectedNode();
    if (!n) return;
    const score = _lvgRenderScore(n);
    n.tension = parseFloat(document.getElementById('lvg-tension').value);
    n.weight  = parseFloat(document.getElementById('lvg-weight').value);
    n.slope   = parseFloat(document.getElementById('lvg-slope').value);

    if (typeof MM_WARP !== 'undefined') {
      MM_WARP.stream.emit(new WARP.Event('leverage.node.scored', { id: n.id, score, tension: n.tension, weight: n.weight, slope: n.slope }));
    }
    // Third interconnection wire: a node crossing into genuinely high
    // leverage (>5, not just any score change) is real growth signal,
    // logged to the same shared substrate as Horizon's seeds/commitments.
    // Guarded against spam — only logs the first time a node crosses into
    // the high tier, not on every slider tick while dragging within it,
    // and it's a real, meaningful moment (you deliberately identified
    // something as high-leverage), not routine data entry.
    const tier = typeof lvgScoreTier === 'function' ? lvgScoreTier(score) : null;
    if (tier === 'high' && !n._lvgDeltaLogged && typeof almWriteDelta === 'function') {
      almWriteDelta('horizon', `High leverage identified: "${n.title || 'untitled node'}" (score ${score.toFixed(1)})`, { nodeId: n.id, score, kind: 'leverage-high' });
      n._lvgDeltaLogged = true;
    } else if (tier !== 'high') {
      n._lvgDeltaLogged = false; // dropped back below the threshold — can log again if it crosses back up later
    }
    if (_lvgViewActive) _lvgApplyNodeStyle(n);
    if (typeof autosaveJAA === 'function') autosaveJAA();
  };

  window.lvgSetKind = function (kind) {
    const n = _selectedNode();
    if (!n) return;
    n.lvgKind = kind;
    Object.keys(LVG_KINDS).forEach(k => {
      document.getElementById('lvg-btn-' + k)?.classList.toggle('act', k === kind);
    });
    if (typeof MM_WARP !== 'undefined') {
      MM_WARP.stream.emit(new WARP.Event('leverage.node.kind_set', { id: n.id, kind }));
    }
    if (_lvgViewActive) _lvgApplyNodeStyle(n);
    if (typeof autosaveJAA === 'function') autosaveJAA();
  };

  // ── Canvas-wide leverage view ─────────────────────────────────────
  function _lvgApplyNodeStyle(n) {
    const el = document.getElementById('n_' + n.id);
    if (!el) return;
    if (!_lvgViewActive || !lvgIsScored(n)) {
      el.style.removeProperty('outline');
      el.style.removeProperty('box-shadow');
      return;
    }
    const score = lvgCalcScore(n);
    const kind = n.lvgKind || 'neutral';
    const col = LVG_KINDS[kind]?.color || LVG_KINDS.neutral.color;
    const glow = Math.round(4 + score * 2.4); // bigger glow = higher leverage
    el.style.outline = `1.5px solid ${col}`;
    el.style.boxShadow = `0 0 ${glow}px ${col}88`;
  }

  function lvgApplyView() {
    if (typeof CANVAS === 'undefined' || !CANVAS.NX) return;
    CANVAS.NX.nodes.forEach(_lvgApplyNodeStyle);
  }

  window.lvgToggleView = function () {
    _lvgViewActive = !_lvgViewActive;
    const btn = document.getElementById('lvg-view-toggle');
    if (btn) btn.classList.toggle('act', _lvgViewActive);
    lvgApplyView();
    if (typeof mm_toast === 'function') {
      mm_toast(_lvgViewActive ? '◈ Leverage view on — scored nodes glow by score' : '◈ Leverage view off', 'sync', { dur: 1600 });
    }
  };

  window.lvgOnTabOpen = lvgOnTabOpen;
  window.lvgApplyView = lvgApplyView;

  // ── Wrap updateSidePanel so the LVG tab stays in sync when the
  // selection changes while it's already the open tab ──────────────
  const _realUpdateSidePanel = window.updateSidePanel;
  if (typeof _realUpdateSidePanel === 'function') {
    window.updateSidePanel = function (id) {
      _realUpdateSidePanel(id);
      const lvgTabActive = document.querySelector('.sp-tab[data-st="leverage"]')?.classList.contains('act');
      if (lvgTabActive) lvgOnTabOpen();
    };
  }
})();
