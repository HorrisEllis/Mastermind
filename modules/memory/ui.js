// ═══════════════════════════════════════════════════════════════════
// MEMORY ARCHITECTURE — UI — modules/memory/ui.js
// v1.0.0
//
// Pseudo-3D, not WebGL: a real <canvas> 2D force-directed layout (same
// proven technique Brain Map's #brain-cvs already uses) with depth
// simulated through scale/opacity/parallax rather than an actual 3D
// engine — no new heavy rendering dependency, same visual language the
// rest of the app already has. Depth is recency-driven (memDepthOf) —
// automatic, since that's genuinely derived from real activity — but
// EVERY compartment's existence, name, and contents are a direct
// action a person took, never inferred silently. That split (automatic
// depth/position, manual identity/contents) is deliberate.
//
// Depends on modules/memory/engine.js loaded first.
// ═══════════════════════════════════════════════════════════════════

'use strict';

function openMemory() {
  if (typeof _assertAuth === 'function' && !_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'memory' });

  let overlay = document.getElementById('mm-memory-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-memory-overlay';
    overlay.style.cssText = [
      'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800',
      'background:rgba(0,2,6,.98);backdrop-filter:blur(8px)',
      'display:flex;flex-direction:column;overflow:hidden',
    ].join(';');
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderMemory(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.5, window.innerHeight * 0.4, 0.85);
}

function closeMemory() {
  if (MEM_UI._raf) { cancelAnimationFrame(MEM_UI._raf); MEM_UI._raf = null; }
  const el = document.getElementById('mm-memory-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
  memSave();
}

const MEM_UI = { _raf: null, positions: {}, drawerId: null, mouseX: 0, mouseY: 0 };

function _renderMemory(overlay) {
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid rgba(119,68,255,.15)">
      <div style="font-family:var(--f-display);font-size:12px;font-weight:800;letter-spacing:4px;color:#7744ff">MEMORY ARCHITECTURE</div>
      <div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim)">${MEM_STATE.compartments.length} compartment${MEM_STATE.compartments.length === 1 ? '' : 's'} — click one to open, drag to explore</div>
      <button onclick="_memNewCompartmentPrompt()" style="margin-left:auto;padding:7px 14px;border:1px solid rgba(119,68,255,.45);
        color:#7744ff;background:rgba(119,68,255,.08);cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">+ NEW COMPARTMENT</button>
      <button onclick="closeMemory()" style="padding:7px 12px;border:1px solid var(--wire2);color:var(--dim);
        background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:8px">✕ CLOSE</button>
    </div>
    <div style="flex:1;display:flex;overflow:hidden">
      <div style="flex:1;position:relative;overflow:hidden" id="mem-canvas-area">
        <canvas id="mem-cvs" style="position:absolute;inset:0;width:100%;height:100%;cursor:grab"></canvas>
        <div id="mem-empty-hint" style="display:${MEM_STATE.compartments.length ? 'none' : 'flex'};position:absolute;inset:0;
          align-items:center;justify-content:center;flex-direction:column;gap:10px;pointer-events:none">
          <div style="font-family:var(--f-mono);font-size:9px;color:var(--dim);text-align:center;max-width:320px;line-height:1.8">
            No compartments yet. A compartment is any container worth thinking inside — a mode, a system, a domain,
            a project, a person, anything. Make one explicit.</div>
        </div>
      </div>
      <div id="mem-drawer" style="width:340px;border-left:1px solid rgba(119,68,255,.15);overflow-y:auto;padding:18px;display:none"></div>
    </div>
  `;
  _memSetupCanvas();
  if (MEM_UI.drawerId && memGetCompartment(MEM_UI.drawerId)) _memRenderDrawer(MEM_UI.drawerId);
}

// ── Force-directed pseudo-3D canvas ─────────────────────────────────
function _memSetupCanvas() {
  const cvs = document.getElementById('mem-cvs');
  const area = document.getElementById('mem-canvas-area');
  if (!cvs || !area) return;

  // Seed positions for anything new — random start, the simulation
  // settles it based on real relatedness.
  for (const c of MEM_STATE.compartments) {
    if (!MEM_UI.positions[c.id]) {
      MEM_UI.positions[c.id] = { x: (Math.random() - 0.5) * 200, y: (Math.random() - 0.5) * 200, vx: 0, vy: 0 };
    }
  }

  let dragging = null, dragOffX = 0, dragOffY = 0;
  cvs.onmousemove = (e) => {
    const r = cvs.getBoundingClientRect();
    MEM_UI.mouseX = e.clientX - r.left; MEM_UI.mouseY = e.clientY - r.top;
    if (dragging) {
      const p = MEM_UI.positions[dragging];
      p.x = MEM_UI.mouseX - area.clientWidth / 2 - dragOffX;
      p.y = MEM_UI.mouseY - area.clientHeight / 2 - dragOffY;
      p.vx = 0; p.vy = 0;
    }
  };
  cvs.onmousedown = (e) => {
    const hit = _memHitTest(e, cvs, area);
    if (hit) {
      dragging = hit.id;
      const p = MEM_UI.positions[hit.id];
      dragOffX = MEM_UI.mouseX - area.clientWidth / 2 - p.x;
      dragOffY = MEM_UI.mouseY - area.clientHeight / 2 - p.y;
      cvs.style.cursor = 'grabbing';
    }
  };
  window.addEventListener('mouseup', () => { dragging = null; if (cvs) cvs.style.cursor = 'grab'; });
  cvs.onclick = (e) => {
    if (dragging) return; // was a drag, not a click
    const hit = _memHitTest(e, cvs, area);
    if (hit) _memOpenDrawer(hit.id);
  };

  if (MEM_UI._raf) cancelAnimationFrame(MEM_UI._raf);
  MEM_UI._raf = requestAnimationFrame(_memRenderLoop);
}

function _memHitTest(e, cvs, area) {
  const r = cvs.getBoundingClientRect();
  const mx = e.clientX - r.left - area.clientWidth / 2;
  const my = e.clientY - r.top - area.clientHeight / 2;
  let best = null, bestDist = Infinity;
  const now = Date.now();
  for (const c of MEM_STATE.compartments) {
    const p = MEM_UI.positions[c.id]; if (!p) continue;
    const depth = memDepthOf(c, now);
    const scale = 0.55 + depth * 0.7;
    const radius = 26 * scale;
    const d = Math.hypot(mx - p.x, my - p.y);
    if (d < radius && d < bestDist) { best = c; bestDist = d; }
  }
  return best;
}

function _memRenderLoop() {
  const cvs = document.getElementById('mem-cvs');
  const area = document.getElementById('mem-canvas-area');
  if (!cvs || !area) { MEM_UI._raf = null; return; } // panel closed — stop the loop, don't run forever in the background

  const w = area.clientWidth, h = area.clientHeight;
  if (cvs.width !== w) cvs.width = w;
  if (cvs.height !== h) cvs.height = h;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, w, h);

  const list = MEM_STATE.compartments;
  const now = Date.now();

  // ── Force simulation: repel everything, attract proportional to real
  // shared-content relatedness — the ONLY thing driving layout is
  // actual data, never an arbitrary grid. ──
  for (let i = 0; i < list.length; i++) {
    const pi = MEM_UI.positions[list[i].id]; if (!pi) continue;
    let fx = 0, fy = 0;
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const pj = MEM_UI.positions[list[j].id]; if (!pj) continue;
      const dx = pi.x - pj.x, dy = pi.y - pj.y;
      const dist = Math.max(20, Math.hypot(dx, dy));
      // Repulsion — keeps everything from collapsing into one point.
      const repel = 1800 / (dist * dist);
      fx += (dx / dist) * repel; fy += (dy / dist) * repel;
      // Attraction toward related compartments, pulling them close in
      // proportion to how much content they actually share.
      const rel = memRelatedness(list[i].id, list[j].id);
      if (rel > 0) {
        const pull = rel * dist * 0.004;
        fx -= (dx / dist) * pull; fy -= (dy / dist) * pull;
      }
    }
    // Gentle pull toward center so the whole cluster doesn't drift off-canvas.
    fx -= pi.x * 0.0015; fy -= pi.y * 0.0015;
    pi.vx = (pi.vx + fx) * 0.82; pi.vy = (pi.vy + fy) * 0.82;
    pi.x += pi.vx; pi.y += pi.vy;
  }

  // ── Draw: depth-sorted (far first) so nearer compartments occlude ──
  const withDepth = list.map(c => ({ c, depth: memDepthOf(c, now), p: MEM_UI.positions[c.id] })).filter(x => x.p);
  withDepth.sort((a, b) => a.depth - b.depth);

  // Parallax: subtle shift based on mouse position, stronger for
  // "closer" (higher depth) compartments — the actual 3D-feel cue.
  const parX = (MEM_UI.mouseX - w / 2) / w;
  const parY = (MEM_UI.mouseY - h / 2) / h;

  for (const { c, depth, p } of withDepth) {
    const scale = 0.5 + depth * 0.75;
    const alpha = 0.35 + depth * 0.65;
    const parallax = depth * 18;
    const cx = w / 2 + p.x + parX * parallax;
    const cy = h / 2 + p.y + parY * parallax;
    const r = 24 * scale;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = c.color + '22';
    ctx.fill();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();
    ctx.font = (13 * scale) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = c.color;
    ctx.fillText(c.icon, cx, cy - 2 * scale);
    ctx.font = (7 * scale) + 'px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + depth * 0.5) + ')';
    ctx.fillText(c.name.length > 16 ? c.name.slice(0, 14) + '…' : c.name, cx, cy + r + 8 * scale);
    if (c.members.length) {
      ctx.font = (6 * scale) + 'px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillText(c.members.length + ' items', cx, cy + r + 18 * scale);
    }
    ctx.restore();
  }

  MEM_UI._raf = requestAnimationFrame(_memRenderLoop);
}

// ── Direct manipulation panel ────────────────────────────────────────
function _memNewCompartmentPrompt() {
  const typeOptions = Object.entries(MEM_TYPES).map(([k, t]) => t.icon + ' ' + t.label).join('  ·  ');
  if (typeof mmPrompt !== 'function') return;
  mmPrompt('Compartment name:', '').then(name => {
    if (!name || !name.trim()) return;
    mmPrompt('Type (' + typeOptions + ') — type the word, e.g. "mode":', 'custom').then(typeRaw => {
      const type = Object.keys(MEM_TYPES).includes((typeRaw || '').trim().toLowerCase()) ? typeRaw.trim().toLowerCase() : 'custom';
      const c = memCreateCompartment(name, type);
      if (c) {
        const hint = document.getElementById('mem-empty-hint'); if (hint) hint.style.display = 'none';
        _memOpenDrawer(c.id);
      }
    });
  });
}

function _memOpenDrawer(id) {
  MEM_UI.drawerId = id;
  _memRenderDrawer(id);
}

function _memRenderDrawer(id) {
  const c = memGetCompartment(id);
  const drawer = document.getElementById('mem-drawer');
  if (!c || !drawer) return;
  drawer.style.display = 'block';
  const t = MEM_TYPES[c.type] || MEM_TYPES.custom;
  drawer.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
      <span style="font-size:18px;color:${c.color}">${c.icon}</span>
      <div contenteditable="true" spellcheck="false" style="font-family:var(--f-display);font-size:13px;font-weight:700;
        color:var(--bright);flex:1;outline:none" onblur="memRenameCompartment('${c.id}',this.textContent);_memRenderDrawer('${c.id}')">${escH(c.name)}</div>
    </div>
    <div style="font-family:var(--f-mono);font-size:7px;color:${c.color};letter-spacing:1px;margin-bottom:14px">${t.label.toUpperCase()}</div>
    <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.7;margin-bottom:16px">${escH(t.desc)}</div>

    <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;color:var(--dim);margin-bottom:8px">
      CONTENTS (${c.members.length})</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:16px">
      ${c.members.length ? c.members.map(m => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:rgba(255,255,255,.03);border-left:2px solid ${c.color}">
          <span style="font-family:var(--f-mono);font-size:6.5px;color:${c.color};border:1px solid ${c.color}44;padding:1px 4px">${m.kind}</span>
          <span style="font-family:var(--f-mono);font-size:7.5px;color:var(--muted);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escH(String(m.id).slice(0, 22))}</span>
          <span onclick="memUnassign('${c.id}','${m.kind}','${m.id}');_memRenderDrawer('${c.id}')" style="cursor:pointer;color:var(--dim);font-size:8px" title="Remove">✕</span>
        </div>
      `).join('') : `<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--wire2)">Nothing assigned yet.</div>`}
    </div>

    <button onclick="if(confirm('Delete this compartment? Contents stay where they already are — this only removes the grouping.')){memDeleteCompartment('${c.id}');document.getElementById('mem-drawer').style.display='none';_memRenderMemoryOverlayIfOpen();}"
      style="width:100%;padding:8px;border:1px solid rgba(255,51,85,.35);color:#ff3355;background:transparent;
      cursor:pointer;font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px">DELETE COMPARTMENT</button>
  `;
}

function _memRenderMemoryOverlayIfOpen() {
  const overlay = document.getElementById('mm-memory-overlay');
  if (overlay && overlay.style.display !== 'none') _renderMemory(overlay);
}

// Called from anywhere in the app that has an existing item (a lattice
// node, a canvas node, an ALM entry, a voice utterance) and wants to
// offer "put this in a compartment" — e.g. a context-menu item. Shows
// auto-suggestions ranked by real overlap, plus the full list to
// pick from manually. Always a person's choice, never automatic.
function memAssignPrompt(kind, id, text, tags) {
  if (!MEM_STATE.compartments.length) { if (typeof mm_toast === 'function') mm_toast('No compartments yet — create one first', 'info'); return; }
  const suggestions = memSuggestCompartments(text || '', tags || []);
  const list = suggestions.length ? suggestions : MEM_STATE.compartments.map(c => ({ id: c.id, name: c.name }));
  const labels = list.map((s, i) => (i + 1) + '. ' + s.name).join('\n');
  if (typeof mmPrompt !== 'function') return;
  mmPrompt('Add to which compartment?\n' + labels + '\n\nType the number:', '1').then(choice => {
    const idx = parseInt(choice, 10) - 1;
    if (idx >= 0 && idx < list.length) {
      memAssign(list[idx].id, kind, id);
      if (typeof mm_toast === 'function') mm_toast('Added to ' + list[idx].name, 'success', { dur: 2000 });
    }
  });
}

window.openMemory = openMemory;
window.closeMemory = closeMemory;
window.memAssignPrompt = memAssignPrompt;

if (typeof MMLog !== 'undefined') MMLog.info('memory', 'Memory Architecture UI v1.0.0 loaded');
