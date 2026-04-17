// ═══════════════════════════════════════════════════════════════════
// MASTERMIND CANVAS — v3.0.5
// Pure canvas module: state, rendering, nodes, connections, undo,
// pan/zoom, minimap, layers, side panel, search, save/load.
//
// Exposes: window.CANVAS — the public API bridge for nexus-engine.js
// Depends on: mastermind-siso-jaa.js, mastermind-foundation.js
// Load order: AFTER siso-jaa + foundation, BEFORE nexus-engine.js
//
// Bridge contract (window.CANVAS):
//   spawnNode(type, wx, wy, opts)  → node object
//   addConn(fromId, toId, label)   → void
//   enterCanvas()                  → void (auth-gated)
//   goHome()                       → void (auth-gated)
//   jumpToNode(id)                 → void
//   resetView()                    → void
//   autoLayout()                   → void
//   saveCanvas()                   → Promise<void>
//   loadCanvas()                   → Promise<void>
//   getState()                     → full app state snapshot
//   applyT()                       → apply pan/zoom transform
//   init()                         → boot canvas subsystem
//   NX                             → live state object (read-only intent)
//   NT                             → node type definitions
//   DOMAINS                        → domain color map
//
// UUID: c3b2a1f0-c4n5-4a6b-8000-canvas000001
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ═══════════════════════════════════════════════════════════════════
// NEXUS ENGINE — GRACEFUL DEPENDENCY STUBS
// If siso.js / jaa.js fail to load (standalone browser, missing Electron
// deps, wrong path), these no-op stubs prevent ReferenceErrors so the
// full canvas + auth system still works via localStorage.
// ═══════════════════════════════════════════════════════════════════
(function() {
  if (typeof JAA === 'undefined') {
    window.JAA = {
      ledger: new Map(),
      _log: { entries: [], count: 0 },
      register(id, type, meta) {
        this.ledger.set(id, { id, type, deltas: [], metaDeltas: [], ...meta });
      },
      delta(id, from, to, type) {
        const e = this.ledger.get(id);
        if (e) e.deltas.push({ from, to, type, time: Date.now() });
        this._log.entries.push({ type, data: { id }, time: Date.now() });
        this._log.count++;
      },
      getDeltas(id) { return this.ledger.get(id)?.deltas || []; },
      getLog() { return this._log; },
      setDataDir(dir) { try { localStorage.setItem('nexus_datadir', dir); } catch(e) {} },
      async saveCanvas(data) {
        try { localStorage.setItem('nexus_mm_v3', JSON.stringify(data)); } catch(e) {}
      },
      async loadCanvas() {
        try {
          const raw = localStorage.getItem('nexus_mm_v3');
          return raw ? JSON.parse(raw) : null;
        } catch(e) { return null; }
      },
    };
    console.warn('[MASTERMIND] JAA compat active — using localStorage stub');
  }
  if (typeof SISO === 'undefined') {
    window.SISO = { emit() {}, on() {}, off() {}, once() {} };
    console.warn('[MASTERMIND] SISO compat active — using no-op stub');
  }
})();


/* Wizard E2E state — declared early so inline onclick can find it */
let _wizE2EEnabled = true;

// ═══════════════════════════════════════════════════════════════════
// MASTERMIND ENGINE v3.0.5 — MASTERMIND · SISO + JAA · Complete Cognitive OS
// SISO · JAA · Undo/Redo · Copy/Paste · Touch/Pinch · Fractal
// Dot-collapse · UUID Ledger · Meta-Deltas · All spec features
// ═══════════════════════════════════════════════════════════════════

/* ── Utils ────────────────────────────────────────────────────── */
// Safe hex+alpha helper — always produces valid 8-char hex color
function _hexAlpha(hex, alpha) {
  const a = Math.min(1, Math.max(0, alpha));
  const h = Math.round(a * 255).toString(16).padStart(2, '0');
  // Ensure hex is 6 chars and starts with #
  if (typeof hex !== 'string' || !hex.startsWith('#')) return `rgba(0,200,255,${a})`;
  const clean = hex.replace('#', '').slice(0, 6).padEnd(6, '0');
  return '#' + clean + h;
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function shortId(id) { return id ? id.slice(0, 8) : ''; }
function fmtTime(ts) { if (!ts) return ''; return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function fmtTS(ts) { if (!ts) return ''; const d = new Date(ts); return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`; }
function escH(s) { if (!s) return ''; return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ── Config ───────────────────────────────────────────────────── */
let NX_CONFIG = { dataDir: null, theme: 'nexus', firstRun: true };

async function loadConfig() {
  if (window.NXAPI) {
    try { NX_CONFIG = await window.NXAPI.getConfig(); } catch(e) {}
  }
}

/* ── Global state ─────────────────────────────────────────────── */
const NX = {
  nodes: [], conns: [], zones: [],
  selected: new Set(),
  zoom: 1, panX: 0, panY: 0,
  tool: 'select',
  linkSrc: null, linkX: 0, linkY: 0,
  layers: { grid: true, particles: true, clusters: true },
  animConns: true,
  clipboard: [], clipConns: [],
  undoStack: [], redoStack: [],
  theme: 'nexus',
  hover: null,
  _lastSpawnType: 'concept',
};
const SAVE_KEY = 'nexus_mm_v3';

/* ── Node Types ───────────────────────────────────────────────── */
const NT = {
  // Core cognitive nodes
  concept:   { icon: '⬡', color: '#00c8ff', badge: 'CONCEPT',   domain: 'COGNITIVE',   ph: 'Articulate the concept...'         },
  insight:   { icon: '◈', color: '#ff8c22', badge: 'INSIGHT',   domain: 'META',         ph: 'What does this reveal...'          },
  pattern:   { icon: '⬢', color: '#cc44ff', badge: 'PATTERN',   domain: 'SYSTEMIC',    ph: 'Describe the pattern...'           },
  seed:      { icon: '✦', color: '#00ff88', badge: 'SEED',      domain: 'FUTURE',       ph: 'Plant the seed...'                 },
  question:  { icon: '?', color: '#ffe04a', badge: 'QUESTION',  domain: 'INQUIRY',      ph: 'What are you asking...'            },
  friction:  { icon: '⚡', color: '#ff3355', badge: 'FRICTION',  domain: 'RESISTANCE',  ph: 'What creates friction...'          },
  synthesis: { icon: '◎', color: '#11ddcc', badge: 'SYNTH',     domain: 'SYNTHESIS',   ph: 'How does this combine...'          },
  heuristic: { icon: '∞', color: '#ff66aa', badge: 'HEURISTIC', domain: 'WISDOM',       ph: 'What is the heuristic...'          },
  framework: { icon: '⊞', color: '#d4a820', badge: 'FRAMEWORK', domain: 'STRUCTURE',   ph: 'Define the framework...'           },
  causal:    { icon: '→', color: '#7744ff', badge: 'CAUSAL',    domain: 'CAUSALITY',   ph: 'What causes what...'               },
  // Framework-native nodes
  gap:       { icon: '⟷', color: '#ff8c22', badge: 'GAP',       domain: 'TENSION',     ph: 'The space between A and B...'      },
  delta:     { icon: 'Δ',  color: '#ffe04a', badge: 'DELTA',     domain: 'MEASUREMENT', ph: 'The measurement between states...' },
  feedback:  { icon: '↺',  color: '#11ddcc', badge: 'FEEDBACK',  domain: 'SYSTEMS',     ph: 'How output feeds back to input...' },
  invariant: { icon: '◆',  color: '#00c8ff', badge: 'INVARIANT', domain: 'INVARIANCE',  ph: 'What persists through change...'   },
  vector:    { icon: '⇀',  color: '#cc44ff', badge: 'VECTOR',    domain: 'DIRECTION',   ph: 'Direction × magnitude of this idea...' },
  signal:    { icon: '◉',  color: '#00ff88', badge: 'SIGNAL',    domain: 'SIGNAL',      ph: 'High-fidelity aligned input...'    },
  noise:     { icon: '≋',  color: '#ff3355', badge: 'NOISE',     domain: 'NOISE',       ph: 'Low-fidelity distraction...'       },
  custom:    { icon: '✎',  color: '#aaaaaa', badge: 'CUSTOM',    domain: 'CUSTOM',      ph: 'Your node, your rules...'          },
  // Human system model nodes (spec MM-New-01 through MM-New-08)
  biological:    { icon: '⬡', color: '#22ddaa', badge: 'BIO', domain: 'BIOLOGY',  ph: 'Biological state or process...'  },
  affective:     { icon: '♥', color: '#ff6688', badge: 'AFF', domain: 'EMOTION',  ph: 'Emotional state or driver...'    },
  relational:    { icon: '⬡', color: '#ff8c22', badge: 'REL', domain: 'RELATION', ph: 'Relational pattern or bond...'   },
  somatic:       { icon: '◎', color: '#88ffcc', badge: 'SOM', domain: 'BODY',     ph: 'Somatic signal or body state...' },
  developmental: { icon: '▲', color: '#cc44ff', badge: 'DEV', domain: 'GROWTH',   ph: 'Developmental stage or edge...'  },
};
const DOMAINS = {
  COGNITIVE: '#00c8ff', META: '#ff8c22', SYSTEMIC: '#cc44ff', FUTURE: '#00ff88',
  INQUIRY: '#ffe04a', RESISTANCE: '#ff3355', SYNTHESIS: '#11ddcc', WISDOM: '#ff66aa',
  STRUCTURE: '#d4a820', CAUSALITY: '#7744ff',
  TENSION: '#ff8c22', MEASUREMENT: '#ffe04a', SYSTEMS: '#11ddcc',
  INVARIANCE: '#00c8ff', DIRECTION: '#cc44ff', SIGNAL: '#00ff88',
  NOISE: '#ff3355', CUSTOM: '#aaaaaa',
  BIOLOGY: '#22ddaa', EMOTION: '#ff6688', RELATION: '#ff8c22', BODY: '#88ffcc', GROWTH: '#cc44ff',
};

/* ── Themes ───────────────────────────────────────────────────── */
const THEMES = {
  nexus: {
    name: 'NEXUS', desc: 'Dark cyber — deep space. The original.',
    palette: ['#00c8ff', '#cc44ff', '#00ff88', '#ff8c22', '#02040a'],
    cls: '',
  },
  erosmancer: {
    name: 'EROSMANCER', desc: 'Fire & desire. Warm amber flames. From Eravos.',
    palette: ['#ff6a00', '#ee0979', '#ffd700', '#bf5fff', '#08050a'],
    cls: 'th-erosmancer',
  },
  void: {
    name: 'VOID', desc: 'Pure dark. Zero distraction. Maximum focus.',
    palette: ['#ffffff', '#888', '#444', '#222', '#000'],
    cls: 'th-void',
  },
  aurora: {
    name: 'AURORA', desc: 'Northern lights. Spectral luminescence.',
    palette: ['#44ffcc', '#ff44aa', '#44aaff', '#ffcc44', '#020d10'],
    cls: 'th-aurora',
  },
};

function applyTheme(key) {
  const th = THEMES[key]; if (!th) return;
  Object.values(THEMES).forEach(t => { if (t.cls) document.body.classList.remove(t.cls); });
  if (th.cls) document.body.classList.add(th.cls);
  NX.theme = key;
  try { localStorage.setItem('nexus_theme', key); } catch(e) {}
  if (window.NXAPI) window.NXAPI.saveConfig({ theme: key }).catch(() => {});
  renderThemeGrid();
  if (typeof T !== 'undefined') T.themeChanged(th.name); else toast('Theme: ' + th.name);
}

/* ── Particles ────────────────────────────────────────────────── */
const PARTS = [];
function initParticles() {
  PARTS.length = 0;
  for (let i = 0; i < 55; i++) {
    PARTS.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - .5) * .24,
      vy: (Math.random() - .5) * .24,
      r: Math.random() * 1.4 + .2,
      op: Math.random() * .22 + .04,
      col: ['#00c8ff', '#cc44ff', '#00ff88', '#ff8c22'][Math.floor(Math.random() * 4)],
      pulse: Math.random() * Math.PI * 2,
    });
  }
}

function tickParticles(cvs) {
  if (!NX.layers.particles || !cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  PARTS.forEach(p => {
    p.x += p.vx; p.y += p.vy; p.pulse += .016;
    if (p.x < 0) p.x = cvs.width; if (p.x > cvs.width) p.x = 0;
    if (p.y < 0) p.y = cvs.height; if (p.y > cvs.height) p.y = 0;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = p.col; ctx.globalAlpha = p.op * (.7 + .3 * Math.sin(p.pulse));
    ctx.fill(); ctx.globalAlpha = 1;
  });
}

/* ── Background grid ──────────────────────────────────────────── */
function drawBg() {
  const cvs = document.getElementById('bg-cvs'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  if (!NX.layers.grid) return;
  const { zoom, panX, panY } = NX;
  const gs = 60 * zoom;
  const ox = ((panX % gs) + gs) % gs, oy = ((panY % gs) + gs) % gs;
  ctx.fillStyle = 'rgba(0,200,255,0.055)';
  for (let x = ox; x < cvs.width; x += gs)
    for (let y = oy; y < cvs.height; y += gs) {
      ctx.beginPath(); ctx.arc(x, y, .7, 0, Math.PI * 2); ctx.fill();
    }
  const bg = gs * 5, obx = ((panX % bg) + bg) % bg, oby = ((panY % bg) + bg) % bg;
  ctx.strokeStyle = 'rgba(0,200,255,0.018)'; ctx.lineWidth = 1;
  for (let x = obx; x < cvs.width; x += bg) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cvs.height); ctx.stroke(); }
  for (let y = oby; y < cvs.height; y += bg) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cvs.width, y); ctx.stroke(); }
}

/* ── Connections ──────────────────────────────────────────────── */
function drawConns() {
  const cvs = document.getElementById('conn-cvs'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0, 0, cvs.width, cvs.height);
  const { zoom, panX, panY } = NX;
  const t = Date.now() / 1000;
  if (NX.layers.clusters) drawClusterHulls(ctx, zoom, panX, panY);

  NX.conns.forEach(cn => {
    const f = NX.nodes.find(n => n.id === cn.from);
    const to = NX.nodes.find(n => n.id === cn.to);
    if (!f || !to) return;
    // Skip drawing to/from dot-collapsed nodes (still track logically)
    const fEl = document.getElementById('n_' + f.id);
    const tEl = document.getElementById('n_' + to.id);
    if (!fEl || !tEl) return;

    const fh = fEl.offsetHeight || 120, fw = fEl.offsetWidth || 200;
    const th = tEl.offsetHeight || 120, tw = tEl.offsetWidth || 200;
    const w2s = (wx, wy) => ({ sx: wx * zoom + panX, sy: wy * zoom + panY });

    // If node is a dot, connect from center of dot
    const fDot = f.collapsed;
    const tDot = to.collapsed;
    const fp = fDot ? w2s(f.x + 8, f.y + 8) : w2s(f.x + fw / 2, f.y + fh / 2);
    const tp = tDot ? w2s(to.x + 8, to.y + 8) : w2s(to.x + tw / 2, to.y + th / 2);

    const fx = fp.sx, fy = fp.sy, tx = tp.sx, ty = tp.sy;
    const dx = tx - fx, dy = ty - fy, dist = Math.sqrt(dx * dx + dy * dy) + 1;
    const bend = Math.min(dist * .5, 180) * zoom;
    const perp = { x: -dy / dist, y: dx / dist };
    const c1x = fx + dx * .25 + perp.x * bend * .3, c1y = fy + dy * .25 + perp.y * bend * .3;
    const c2x = tx - dx * .25 + perp.x * bend * .3, c2y = ty - dy * .25 + perp.y * bend * .3;

    const fc = f.color || (NT[f.type] || NT.concept).color;
    const tc = to.color || (NT[to.type] || NT.concept).color;

    const gr = ctx.createLinearGradient(fx, fy, tx, ty);
    gr.addColorStop(0, fc + '88'); gr.addColorStop(1, tc + '88');
    ctx.strokeStyle = gr; ctx.lineWidth = Math.max(.7, 1.2 * zoom);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty); ctx.stroke();

    // Animated particle
    if (NX.animConns) {
      const bp = (p, a, b, c, d) =>
        Math.pow(1-p,3)*a + 3*Math.pow(1-p,2)*p*b + 3*(1-p)*p*p*c + Math.pow(p,3)*d;
      const pr = ((t * .18 + (cn._phase || 0)) % 1);
      const dotX = bp(pr, fx, c1x, c2x, tx), dotY = bp(pr, fy, c1y, c2y, ty);
      ctx.shadowColor = fc; ctx.shadowBlur = 5;
      ctx.fillStyle = fc; ctx.beginPath(); ctx.arc(dotX, dotY, Math.max(1, 1.8 * zoom), 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Label
    if (cn.label && NX.layers.clusters) {
      const bp = (p, a, b, c, d) =>
        Math.pow(1-p,3)*a + 3*Math.pow(1-p,2)*p*b + 3*(1-p)*p*p*c + Math.pow(p,3)*d;
      ctx.fillStyle = 'rgba(74,120,152,.8)';
      ctx.font = `${Math.max(7, 8 * zoom)}px JetBrains Mono,monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(cn.label.slice(0, 18), bp(.5, fx, c1x, c2x, tx), bp(.5, fy, c1y, c2y, ty) - 6 * zoom);
    }
  });

  // Link drag preview
  if (NX.tool === 'link' && NX.linkSrc) {
    const f = NX.nodes.find(n => n.id === NX.linkSrc);
    if (f) {
      const fEl = document.getElementById('n_' + f.id);
      if (fEl) {
        const { zoom: z, panX: px, panY: py } = NX;
        const fp = { sx: (f.x + fEl.offsetWidth / 2) * z + px, sy: (f.y + fEl.offsetHeight / 2) * z + py };
        ctx.strokeStyle = 'rgba(0,200,255,.5)'; ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(fp.sx, fp.sy); ctx.lineTo(NX.linkX, NX.linkY); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

function drawClusterHulls(ctx, zoom, panX, panY) {
  const groups = {};
  NX.nodes.forEach(n => {
    const d = (NT[n.type] || NT.concept).domain;
    if (!groups[d]) groups[d] = [];
    groups[d].push(n);
  });
  Object.entries(groups).forEach(([domain, gnodes]) => {
    if (gnodes.length < 2) return;
    const col = DOMAINS[domain] || '#00c8ff';
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    gnodes.forEach(n => {
      const el = document.getElementById('n_' + n.id);
      const w = el ? el.offsetWidth : 200, h = el ? el.offsetHeight : 120;
      mnX = Math.min(mnX, n.x); mnY = Math.min(mnY, n.y);
      mxX = Math.max(mxX, n.x + w); mxY = Math.max(mxY, n.y + h);
    });
    const pad = 26;
    const sx = (mnX - pad) * zoom + panX, sy = (mnY - pad) * zoom + panY;
    const sw = (mxX - mnX + pad * 2) * zoom, sh = (mxY - mnY + pad * 2) * zoom;
    ctx.strokeStyle = col + '1e'; ctx.fillStyle = col + '05';
    ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 4); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col + '55';
    ctx.font = `600 ${Math.max(7, 9 * zoom)}px Space Grotesk,sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(domain, sx + 6, sy + Math.max(12, 14 * zoom));
  });
}

/* ── Minimap ──────────────────────────────────────────────────── */
function drawMinimap() {
  const mm = document.getElementById('mm-cvs'); if (!mm) return;
  const ctx = mm.getContext('2d');
  const W = mm.offsetWidth, H = mm.offsetHeight;
  mm.width = W; mm.height = H;
  ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, W, H);
  const all = NX.nodes; if (!all.length) return;
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  all.forEach(n => { mnX = Math.min(mnX, n.x); mnY = Math.min(mnY, n.y); mxX = Math.max(mxX, n.x + 220); mxY = Math.max(mxY, n.y + 120); });
  const sc = Math.min((W - 8) / Math.max(mxX - mnX, 200), (H - 8) / Math.max(mxY - mnY, 200)) * .85;
  const ox = (W - (mxX - mnX) * sc) / 2 - mnX * sc, oy = (H - (mxY - mnY) * sc) / 2 - mnY * sc;
  NX.conns.forEach(cn => {
    const f = NX.nodes.find(n => n.id === cn.from), to = NX.nodes.find(n => n.id === cn.to);
    if (!f || !to) return;
    ctx.strokeStyle = 'rgba(0,200,255,.15)'; ctx.lineWidth = .5;
    ctx.beginPath(); ctx.moveTo(f.x * sc + ox, f.y * sc + oy); ctx.lineTo(to.x * sc + ox, to.y * sc + oy); ctx.stroke();
  });
  all.forEach(n => {
    const col = (NT[n.type] || NT.concept).color;
    ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 2;
    const dotSize = NX.selected.has(n.id) ? 5 : n.collapsed ? 2.5 : 3;
    ctx.fillRect(n.x * sc + ox, n.y * sc + oy, dotSize, dotSize);
    ctx.shadowBlur = 0;
  });
  const { zoom, panX, panY } = NX;
  const vW = window.innerWidth / zoom, vH = (window.innerHeight - 38) / zoom;
  const vX = -panX / zoom, vY = -panY / zoom;
  ctx.strokeStyle = 'rgba(0,200,255,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.rect(vX * sc + ox, vY * sc + oy, vW * sc, vH * sc); ctx.stroke();
}

/* ── Render loop ──────────────────────────────────────────────── */
function renderLoop() {
  if (document.hidden) { requestAnimationFrame(renderLoop); return; }
  drawBg();
  drawConns();
  const pcvs = document.getElementById('particle-cvs');
  if (pcvs) tickParticles(pcvs);
  drawMinimap();
  requestAnimationFrame(renderLoop);
}

/* ── Spawn Node ───────────────────────────────────────────────── */
function spawnNode(type, wx, wy, opts = {}) {
  const nt = NT[type] || NT.concept;
  const id = opts.id || uuid();
  const { zoom, panX, panY } = NX;

  if (wx === undefined) {
    const vw = window.innerWidth / zoom, vh = (window.innerHeight - 38) / zoom;
    wx = (-panX / zoom) + vw / 2 + (Math.random() - .5) * vw * .35;
    wy = (-panY / zoom) + vh / 2 + (Math.random() - .5) * vh * .35;
  }

  const prevState = {}; // for delta
  const node = {
    id, type,
    x: wx, y: wy, w: opts.w || 220,
    color: opts.color || nt.color,
    icon: opts.icon || nt.icon,
    title: opts.title || nt.badge,
    body: opts.body || '',
    tags: opts.tags ? [...opts.tags] : [],
    domains: opts.domains ? [...opts.domains] : [nt.domain],
    depth: opts.depth || 0,
    collapsed: opts.collapsed || false,
    parentId: opts.parentId || null,
    created: opts.created || Date.now(),
    modified: Date.now(),
  };

  const el = makeNodeEl(node);
  document.getElementById('world').appendChild(el);
  NX.nodes.push(node);
  applyT();

  // MM Foundation: register UUID in registry + delta ledger
  if (typeof MMRegistry !== 'undefined') {
    MMRegistry.register('node', {
      id,
      module: 'canvas',
      label: node.title,
      tags: node.tags || [],
      domains: node.domains || [],
      meta: { type, color: node.color, depth: node.depth },
    });
    MMDelta.push(id, 'spawn', null, { type, title: node.title, x: wx, y: wy }, { module: 'canvas' });
    // Register tags in MM tag system
    if (typeof MMTags !== 'undefined' && node.tags?.length) {
      node.tags.forEach(t => MMTags.tag(id, t));
    }
    // Register ripple dependencies (parentId → this node)
    if (node.parentId && typeof MMRipple !== 'undefined') {
      MMRipple.depend(id, node.parentId);
    }
    MMLog?.info('canvas', `Node spawned: [${type}] ${node.title}`, { id: id.slice(0,8) });
  }
  // Legacy JAA shim
  if (typeof JAA !== 'undefined' && typeof MMRegistry === 'undefined') {
    JAA.register(id, 'node', { type, title: node.title });
    JAA.delta(id, prevState, { type, title: node.title, x: wx, y: wy }, 'spawn');
  }
  autosaveJAA();

  spawnRipple(wx * zoom + panX, wy * zoom + panY + 38, nt.color);
  pushUndo('spawn', { id });
  return node;
}

function makeNodeEl(node) {
  const nt = NT[node.type] || NT.concept;
  const col = node.color || nt.color;
  const el = document.createElement('div');
  el.className = 'node' + (node.collapsed ? ' dot-mode' : '');
  el.id = 'n_' + node.id;
  el.style.cssText = `left:${node.x}px;top:${node.y}px;--node-color:${col};`;
  el.setAttribute('data-id', node.id);
  el.setAttribute('data-depth', node.depth || 0);

  // Tags: prefer MMTags if available, else legacy
  const buildTagsHtml = () => {
    if (typeof MMTags !== 'undefined') {
      const mmTags = MMTags.forEntity(node.id);
      const legacyTags = (node.tags || []).filter(t => !mmTags.find(mt => mt.name === t || mt.slug === t));
      // Register any legacy tags that aren't in MM yet
      legacyTags.forEach(t => MMTags.tag(node.id, t));
      // Return empty string — MMTagsUI.renderPills will populate after DOM insert
      return '';
    }
    // Fallback: static legacy pills
    return (node.tags || []).slice(0, 4).map(t =>
      `<span class="tag" style="color:${col};border-color:${col}44">${escH(t)}</span>`
    ).join('');
  };

  // Domain badge for node
  const domainColor = (typeof MMDomains !== 'undefined')
    ? (MMDomains.colorFor(node.domains?.[0]) || col)
    : col;
  const domainLabel = node.domains?.[0] || (NT[node.type]?.domain || '');

  const tagsHtml = buildTagsHtml();
  const depthPct = Math.min(100, (node.depth || 0) * 20);
  const sid = shortId(node.id);

  // Heat indicator (delta count) from MM
  const heat = (typeof MMDelta !== 'undefined') ? MMDelta.heat(node.id) : 0;
  const heatColor = heat > 20 ? 'var(--r)' : heat > 8 ? 'var(--o)' : heat > 3 ? 'var(--y)' : 'var(--dim)';

  el.innerHTML = `
  <div class="node-frame">
    <div class="node-head" onmousedown="_nmDown(event,'${node.id}')">
      <span class="node-icon">${escH(nt.icon)}</span>
      <div class="node-title" contenteditable="true" spellcheck="false"
        onblur="_ntBlur('${node.id}',this.textContent)"
        onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
      >${escH(node.title)}</div>
      <span class="node-badge">${escH(nt.badge)}</span>
      <span class="node-collapse-btn" title="Collapse to dot" onclick="_toggleDot('${node.id}')">●</span>
    </div>
    <div class="node-actions">
      <div class="na-btn" onclick="_beginLink('${node.id}')" title="Link">⌁</div>
      <div class="na-btn" onclick="_fractalNode('${node.id}')" title="Fractal">∞</div>
      <div class="na-btn" onclick="_dupNode('${node.id}')" title="Dup">⊞</div>
      <div class="na-btn del" onclick="_delNode('${node.id}')" title="Del">✕</div>
    </div>
    <div class="node-body" contenteditable="true" spellcheck="false"
      data-ph="${escH(nt.ph)}"
      onblur="_nbBlur('${node.id}',this.textContent)"
    >${escH(node.body)}</div>
    <div class="node-tags mm-tags-container" id="ntags_${node.id}" data-tag-container="${node.id}">${tagsHtml}</div>
    <div class="node-recurse">
      <span class="recurse-depth">D${node.depth || 0}</span>
      <div class="recurse-bar"><div class="recurse-fill" style="width:${depthPct}%"></div></div>
      ${domainLabel ? `<span style="font-family:var(--f-mono);font-size:5.5px;color:${domainColor};opacity:.6;letter-spacing:.5px">${escH(domainLabel.slice(0,10))}</span>` : ''}
      <button class="recurse-expand" onclick="_fractalNode('${node.id}')">∞</button>
    </div>
    <div class="node-delta">
      <div class="delta-dot" style="background:${heatColor}" title="${heat} deltas (heat)"></div>
      <span style="color:var(--dim)">${fmtTime(node.created)}</span>
      <span style="margin-left:auto;cursor:copy;font-size:5.5px;font-family:var(--f-mono);"
        onclick="_copyUUID('${node.id}')" title="Copy full UUID">${sid}</span>
    </div>
  </div>
  <span class="dot-label">${escH(node.title.slice(0, 14))}</span>`;

  // After HTML is built, render MM tag pills into the container
  if (typeof MMTagsUI !== 'undefined') {
    // Deferred so element is in DOM
    requestAnimationFrame(() => {
      const tagContainer = el.querySelector('.mm-tags-container');
      if (tagContainer) MMTagsUI.renderPills(node.id, tagContainer);
    });
  }

  // Events
  el.addEventListener('mousedown', e => {
    // Only block drag if the click target IS the contenteditable or is inside node-body (text editing area)
    // node-title is contenteditable but dragging should still work from it
    const isBodyEdit = e.target.classList.contains('node-body') || e.target.closest('.node-body');
    const isTagInput = e.target.classList.contains('mm-tag-remove') || e.target.classList.contains('mm-tag-input') || e.target.classList.contains('mm-tag-suggest-item');
    const isBtn = e.target.classList.contains('na-btn') || e.target.classList.contains('recurse-expand') || e.target.classList.contains('node-collapse-btn');
    if (isBodyEdit || isTagInput || isBtn) return;
    _nmDown(e, node.id);
  });
  el.addEventListener('contextmenu', e => {
    e.preventDefault(); selectNode(node.id, !e.shiftKey); showCtx(e.clientX, e.clientY, node.id);
  });
  el.addEventListener('click', e => {
    if (NX.tool === 'link' && NX.linkSrc && NX.linkSrc !== node.id) { completeLink(node.id); return; }
    if (!_dragNode) { selectNode(node.id, !e.shiftKey); updateSidePanel(node.id); }
  });
  el.addEventListener('mouseenter', () => {
    NX.hover = node.id;
    el.classList.toggle('link-target-hover', NX.tool === 'link' && NX.linkSrc !== null);
  });
  el.addEventListener('mouseleave', () => { NX.hover = null; el.classList.remove('link-target-hover'); });

  // Touch tap to expand/select
  el.addEventListener('touchstart', e => {
    if (node.collapsed) {
      e.stopPropagation();
      _toggleDot(node.id);
    }
  }, { passive: true });

  return el;
}

/* ── Node state updates ───────────────────────────────────────── */
function _ntBlur(id, val) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  const old = n.title; val = val.trim() || n.title;
  if (old === val) return;
  pushUndo('title', { id, from: old, to: val });
  if (typeof MMDelta !== 'undefined') MMDelta.push(id, 'title_edit', { title: old }, { title: val }, { module: 'canvas' });
  else if (typeof JAA !== 'undefined') JAA.delta(id, { title: old }, { title: val }, 'title_edit');
  n.title = val; n.modified = Date.now();
  MMRegistry?.update(id, { label: val });
  autosaveJAA();
}
function _nbBlur(id, val) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  const old = n.body;
  if (old === val) return;
  pushUndo('body', { id, from: old, to: val });
  if (typeof MMDelta !== 'undefined') MMDelta.push(id, 'body_edit', { body: old }, { body: val }, { module: 'canvas' });
  else if (typeof JAA !== 'undefined') JAA.delta(id, { body: old }, { body: val }, 'body_edit');
  n.body = val; n.modified = Date.now();
  autosaveJAA();
}

/* ── Dot collapse ─────────────────────────────────────────────── */
function _toggleDot(id) {
  const n = NX.nodes.find(x => x.id === id);
  const el = document.getElementById('n_' + id);
  if (!n || !el) return;
  n.collapsed = !n.collapsed;
  el.classList.toggle('dot-mode', n.collapsed);
  const cb = el.querySelector('.node-collapse-btn');
  if (cb) cb.textContent = n.collapsed ? '⬡' : '●';
  if (typeof MMDelta !== 'undefined') MMDelta.push(id, 'collapse', { collapsed: !n.collapsed }, { collapsed: n.collapsed }, { module: 'canvas' });
  else if (typeof JAA !== 'undefined') JAA.delta(id, { collapsed: !n.collapsed }, { collapsed: n.collapsed }, 'collapse');
  pushUndo('collapse', { id, to: n.collapsed });
  autosaveJAA();
}

/* ── Delete ───────────────────────────────────────────────────── */
function _delNode(id) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  const conns = NX.conns.filter(c => c.from === id || c.to === id);
  pushUndo('delete', { node: JSON.parse(JSON.stringify(n)), conns: conns.map(c => ({ ...c })) });
  _removeNode(id);
  if (typeof MMDelta !== 'undefined') {
    MMDelta.push(id, 'delete', { exists: true }, { exists: false }, { module: 'canvas' });
    MMRegistry?.remove(id);
    MMRipple?.dependents(id).forEach(dep => MMRipple.undepend(dep, id));
  } else if (typeof JAA !== 'undefined') {
    JAA.delta(id, { exists: true }, { exists: false }, 'delete');
  }
  autosaveJAA();
  T.nodeDeleted();
}
function _removeNode(id) {
  const el = document.getElementById('n_' + id); if (el) el.remove();
  NX.nodes = NX.nodes.filter(n => n.id !== id);
  NX.conns = NX.conns.filter(c => c.from !== id && c.to !== id);
  NX.selected.delete(id);
}

/* ── Duplicate ────────────────────────────────────────────────── */
function _dupNode(id) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  const dn = spawnNode(n.type, n.x + 36, n.y + 50, {
    title: n.title + ' (copy)', body: n.body,
    color: n.color, tags: [...(n.tags || [])], depth: n.depth,
  });
  T.nodesDuplicated(1);
  return dn;
}

/* ── Fractal expand ───────────────────────────────────────────── */
function _fractalNode(id) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  const childTypes = getChildTypes(n.type);
  const newDepth = (n.depth || 0) + 1;
  const num = 3 + Math.floor(Math.random() * 2);
  const r = 200 + newDepth * 55;
  const children = [];
  for (let i = 0; i < num; i++) {
    const ang = (i / num) * Math.PI * 2 - Math.PI / 2;
    const ct = childTypes[i % childTypes.length];
    const nt2 = NT[ct] || NT.concept;
    const c = spawnNode(ct, n.x + Math.cos(ang) * r, n.y + Math.sin(ang) * r, {
      title: nt2.badge + ' ' + (i + 1), depth: newDepth, parentId: id,
    });
    addConn(id, c.id, getRelLabel(n.type, ct));
    children.push(c.id);
  }
  pushUndo('fractal', { parentId: id, childIds: children });
  T.fractalExpanded(num);
  autosaveJAA();
}
function fractalExpand() {
  if (NX.selected.size > 0) NX.selected.forEach(id => _fractalNode(id));
  else toast('Select a node first');
}

function getChildTypes(t) {
  const m = {
    concept:   ['insight', 'question', 'seed', 'vector'],
    insight:   ['pattern', 'heuristic', 'synthesis', 'invariant'],
    pattern:   ['concept', 'friction', 'causal', 'delta'],
    seed:      ['concept', 'synthesis', 'framework', 'gap'],
    question:  ['concept', 'friction', 'insight', 'gap'],
    friction:  ['causal', 'pattern', 'synthesis', 'gap'],
    synthesis: ['framework', 'insight', 'seed', 'signal'],
    heuristic: ['concept', 'pattern', 'synthesis', 'invariant'],
    framework: ['concept', 'causal', 'synthesis', 'feedback'],
    causal:    ['friction', 'pattern', 'insight', 'delta'],
    gap:       ['synthesis', 'vector', 'signal', 'concept'],
    delta:     ['causal', 'feedback', 'invariant'],
    feedback:  ['synthesis', 'gap', 'signal'],
    invariant: ['framework', 'concept', 'pattern'],
    vector:    ['synthesis', 'concept', 'gap'],
    signal:    ['synthesis', 'concept', 'seed'],
    noise:     ['friction', 'gap', 'question'],
    custom:    ['concept', 'insight', 'synthesis'],
  };
  return m[t] || ['concept', 'insight', 'pattern'];
}
function getRelLabel(from, to) {
  const l = {
    'concept→insight': 'reveals', 'concept→question': 'raises', 'concept→seed': 'plants',
    'insight→pattern': 'maps to', 'insight→heuristic': 'becomes', 'pattern→causal': 'drives',
    'friction→causal': 'causes', 'friction→synthesis': 'resolved by', 'synthesis→framework': 'forms',
    'synthesis→seed': 'plants',
  };
  return l[`${from}→${to}`] || 'connects';
}

/* ── Connections ──────────────────────────────────────────────── */
function addConn(fromId, toId, label = '') {
  if (NX.conns.find(c => c.from === fromId && c.to === toId)) return;
  const c = { id: uuid(), from: fromId, to: toId, label, _phase: Math.random(), created: Date.now() };
  NX.conns.push(c);

  // MM Foundation
  if (typeof MMRegistry !== 'undefined') {
    MMRegistry.register('conn', { id: c.id, module: 'canvas', label, meta: { from: fromId, to: toId } });
    MMDelta.push(c.id, 'conn_create', null, { from: fromId, to: toId, label }, { module: 'canvas' });
    // Ripple: toId depends on fromId
    MMRipple?.depend(toId, fromId);
  } else if (typeof JAA !== 'undefined') {
    JAA.register(c.id, 'connection', { from: fromId, to: toId, label });
  }

  pushUndo('conn', { connId: c.id, fromId, toId, label });
  autosaveJAA();
}

function beginLink(id) { setTool('link'); NX.linkSrc = id; document.getElementById('n_' + id)?.classList.add('link-source'); document.getElementById('link-hint').classList.add('show'); toast('Link mode — click target'); }
function completeLink(toId) {
  if (!NX.linkSrc || NX.linkSrc === toId) { cancelLink(); return; }
  const label = (prompt('Connection label (optional):', '') || '').trim();
  addConn(NX.linkSrc, toId, label);
  document.getElementById('n_' + NX.linkSrc)?.classList.remove('link-source');
  NX.linkSrc = null; setTool('select'); document.getElementById('link-hint').classList.remove('show');
  T.linkCreated();
}
function cancelLink() {
  if (NX.linkSrc) document.getElementById('n_' + NX.linkSrc)?.classList.remove('link-source');
  NX.linkSrc = null; setTool('select'); document.getElementById('link-hint').classList.remove('show');
}
function _beginLink(id) { beginLink(id); }
function _copyUUID(id) { navigator.clipboard?.writeText(id).catch(() => {}).then(() => { if (typeof T !== 'undefined') T.copied('UUID ' + shortId(id)); else toast('UUID: ' + shortId(id) + '…'); }); }

/* ── Selection ────────────────────────────────────────────────── */
function selectNode(id, clearFirst = true) {
  if (clearFirst) clearSelection();
  NX.selected.add(id);
  document.getElementById('n_' + id)?.classList.add('sel');
}
function selectAll() { NX.nodes.forEach(n => { NX.selected.add(n.id); document.getElementById('n_' + n.id)?.classList.add('sel'); }); }
function clearSelection() { NX.selected.forEach(id => document.getElementById('n_' + id)?.classList.remove('sel')); NX.selected.clear(); }

/* ── Drag ─────────────────────────────────────────────────────── */
let _dragNode = null, _dragOX = 0, _dragOY = 0, _dragStartX = 0, _dragStartY = 0;
let _isPanning = false, _panSX = 0, _panSY = 0;
let _isSelBox = false, _selSX = 0, _selSY = 0;
let _spaceDown = false, _spaceIsPan = false, _spcPX = 0, _spcPY = 0;

function _nmDown(e, id) {
  if (e.button !== 0) return;
  // Only block if user is actively editing the body text (has focus and caret)
  // Allow dragging from node-head/title even if contenteditable
  const isBodyActive = e.target.classList.contains('node-body') && document.activeElement === e.target;
  if (isBodyActive) return;
  e.stopPropagation();
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  if (NX.tool === 'link' && NX.linkSrc && NX.linkSrc !== id) { completeLink(id); return; }
  if (!NX.selected.has(id)) selectNode(id, !e.shiftKey);
  _dragNode = id;
  _dragOX = e.clientX - (n.x * NX.zoom + NX.panX);
  _dragOY = e.clientY - (n.y * NX.zoom + NX.panY);
  _dragStartX = n.x; _dragStartY = n.y;
  e.preventDefault();
}

// Canvas mousedown
const _cwrap = document.getElementById('canvas-wrap');
_cwrap.addEventListener('mousedown', e => {
  if (e.button === 1 || (e.button === 0 && (e.altKey || _spaceDown))) {
    _isPanning = true; _panSX = e.clientX - NX.panX; _panSY = e.clientY - NX.panY;
    e.preventDefault(); return;
  }
  if (e.button === 0 && !_dragNode) {
    const target = e.target.closest('.node');
    if (!target) {
      if (e.shiftKey) {
        // Shift+drag = area selection
        clearSelection();
        cancelLink();
        _isSelBox = true; _selSX = e.clientX; _selSY = e.clientY;
        const sb = document.getElementById('sel-box');
        sb.style.display = 'block'; sb.style.left = _selSX + 'px'; sb.style.top = _selSY + 'px';
        sb.style.width = '0'; sb.style.height = '0';
      } else {
        // Plain left-drag on empty canvas = pan
        _isPanning = true; _panSX = e.clientX - NX.panX; _panSY = e.clientY - NX.panY;
        _cwrap.style.cursor = 'grabbing';
        e.preventDefault();
      }
    }
  }
});

document.addEventListener('mousemove', e => {
  if (_isPanning || _spaceIsPan) {
    const sx = _spaceIsPan ? _spcPX : _panSX, sy = _spaceIsPan ? _spcPY : _panSY;
    NX.panX = e.clientX - sx; NX.panY = e.clientY - sy; applyT(); return;
  }
  if (_dragNode) {
    const n = NX.nodes.find(x => x.id === _dragNode); if (!n) return;
    n.x = (e.clientX - _dragOX - NX.panX) / NX.zoom;
    n.y = (e.clientY - _dragOY - NX.panY) / NX.zoom;
    const el = document.getElementById('n_' + _dragNode);
    if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
    return;
  }
  if (NX.tool === 'link' && NX.linkSrc) { NX.linkX = e.clientX; NX.linkY = e.clientY; }
  if (_isSelBox) {
    const sb = document.getElementById('sel-box');
    const x = Math.min(e.clientX, _selSX), y = Math.min(e.clientY, _selSY);
    const w = Math.abs(e.clientX - _selSX), h = Math.abs(e.clientY - _selSY);
    sb.style.left = x + 'px'; sb.style.top = y + 'px'; sb.style.width = w + 'px'; sb.style.height = h + 'px';
    const { zoom, panX, panY } = NX;
    const wx1 = (x - panX) / zoom, wy1 = (y - panY) / zoom;
    const wx2 = (x + w - panX) / zoom, wy2 = (y + h - panY) / zoom;
    NX.nodes.forEach(n => {
      const inBox = n.x >= wx1 && n.x <= wx2 && n.y >= wy1 && n.y <= wy2;
      const el = document.getElementById('n_' + n.id);
      if (inBox) { NX.selected.add(n.id); el?.classList.add('sel'); }
      else if (!e.shiftKey) { NX.selected.delete(n.id); el?.classList.remove('sel'); }
    });
  }
});

document.addEventListener('mouseup', e => {
  if (_dragNode) {
    const n = NX.nodes.find(x => x.id === _dragNode);
    if (n && (Math.abs(n.x - _dragStartX) > 2 || Math.abs(n.y - _dragStartY) > 2)) {
      pushUndo('move', { id: _dragNode, from: { x: _dragStartX, y: _dragStartY }, to: { x: n.x, y: n.y } });
      if (typeof JAA !== 'undefined') JAA.delta(_dragNode, { x: _dragStartX, y: _dragStartY }, { x: n.x, y: n.y }, 'move');
    }
    _dragNode = null;
  }
  _isPanning = false; _spaceIsPan = false;
  document.getElementById('canvas-wrap').style.cursor = '';
  if (_isSelBox) { _isSelBox = false; document.getElementById('sel-box').style.display = 'none'; }
});

// Space
document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target.contentEditable !== 'true') { _spaceDown = true; document.getElementById('canvas-wrap').style.cursor = 'grab'; } });
document.addEventListener('keyup', e => { if (e.code === 'Space') { _spaceDown = false; document.getElementById('canvas-wrap').style.cursor = 'default'; } });
_cwrap.addEventListener('mousedown', e => { if (_spaceDown && e.button === 0) { _spaceIsPan = true; _spcPX = e.clientX - NX.panX; _spcPY = e.clientY - NX.panY; e.stopPropagation(); } });

// Scroll zoom
_cwrap.addEventListener('wheel', e => { e.preventDefault(); zoomToward(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
// Prevent browser default context menu on canvas — nodes handle their own via addEventListener
_cwrap.addEventListener('contextmenu', e => {
  // Only fire empty-canvas right-click menu if not on a node
  if (!e.target.closest('.node')) e.preventDefault();
});

// Dbl-click spawn
_cwrap.addEventListener('dblclick', e => {
  if (e.target.closest('.node') || e.target.closest('.zone')) return;
  const { x, y } = s2w(e.clientX, e.clientY);
  spawnNode(NX._lastSpawnType || 'concept', x, y);
});

/* ── Touch / Pinch support ────────────────────────────────────── */
let _tDragNode = null, _tDragOX = 0, _tDragOY = 0;
let _tPanX = 0, _tPanY = 0, _tPan0X = 0, _tPan0Y = 0;
let _pinchDist = null, _pinchCX = 0, _pinchCY = 0;
let _tStartX = 0, _tStartY = 0;

_cwrap.addEventListener('touchstart', e => {
  e.preventDefault();
  const touches = [...e.touches];
  if (touches.length === 1) {
    const t = touches[0];
    const target = document.elementFromPoint(t.clientX, t.clientY)?.closest('.node');
    if (target) {
      const id = target.dataset.id;
      if (id) {
        const n = NX.nodes.find(x => x.id === id);
        if (n) {
          _tDragNode = id; _tDragOX = t.clientX - n.x * NX.zoom; _tDragOY = t.clientY - n.y * NX.zoom;
          _tStartX = n.x; _tStartY = n.y;
          selectNode(id); return;
        }
      }
    }
    _tPanX = t.clientX; _tPanY = t.clientY; _tPan0X = NX.panX; _tPan0Y = NX.panY;
  } else if (touches.length === 2) {
    _tDragNode = null;
    const dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY;
    _pinchDist = Math.sqrt(dx * dx + dy * dy);
    _pinchCX = (touches[0].clientX + touches[1].clientX) / 2;
    _pinchCY = (touches[0].clientY + touches[1].clientY) / 2;
  }
}, { passive: false });

_cwrap.addEventListener('touchmove', e => {
  e.preventDefault();
  const touches = [...e.touches];
  if (touches.length === 1) {
    const t = touches[0];
    if (_tDragNode) {
      const n = NX.nodes.find(x => x.id === _tDragNode); if (!n) return;
      n.x = (t.clientX - _tDragOX) / NX.zoom; n.y = (t.clientY - _tDragOY) / NX.zoom;
      const el = document.getElementById('n_' + _tDragNode);
      if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
    } else {
      NX.panX = _tPan0X + (t.clientX - _tPanX); NX.panY = _tPan0Y + (t.clientY - _tPanY); applyT();
    }
  } else if (touches.length === 2) {
    const dx = touches[0].clientX - touches[1].clientX, dy = touches[0].clientY - touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const cx = (touches[0].clientX + touches[1].clientX) / 2;
    const cy = (touches[0].clientY + touches[1].clientY) / 2;
    if (_pinchDist) { const factor = dist / _pinchDist; zoomToward(factor, cx, cy); }
    _pinchDist = dist; _pinchCX = cx; _pinchCY = cy;
  }
}, { passive: false });

_cwrap.addEventListener('touchend', e => {
  if (e.touches.length < 2) _pinchDist = null;
  if (e.touches.length === 0) {
    if (_tDragNode) {
      const n = NX.nodes.find(x => x.id === _tDragNode);
      if (n && (Math.abs(n.x - _tStartX) > 2 || Math.abs(n.y - _tStartY) > 2)) {
        pushUndo('move', { id: _tDragNode, from: { x: _tStartX, y: _tStartY }, to: { x: n.x, y: n.y } });
      }
      _tDragNode = null;
    }
  }
}, { passive: false });

/* ── Undo / Redo ──────────────────────────────────────────────── */
function pushUndo(type, data) {
  NX.undoStack.push({ type, data, ts: Date.now() });
  if (NX.undoStack.length > 200) NX.undoStack.shift();
  NX.redoStack = [];
  updateUndoBtns();
}
function updateUndoBtns() {
  document.getElementById('undo-btn').disabled = NX.undoStack.length === 0;
  document.getElementById('redo-btn').disabled = NX.redoStack.length === 0;
}
function undo() {
  if (!NX.undoStack.length) return;
  const action = NX.undoStack.pop(); NX.redoStack.push(action);
  _applyUndo(action); updateUndoBtns(); toast('↩ Undo: ' + action.type);
}
function redo() {
  if (!NX.redoStack.length) return;
  const action = NX.redoStack.pop(); NX.undoStack.push(action);
  _applyRedo(action); updateUndoBtns(); toast('↪ Redo: ' + action.type);
}
function _applyUndo(action) {
  const { type, data } = action;
  if (type === 'spawn') { _removeNode(data.id); }
  else if (type === 'delete') {
    spawnNode(data.node.type, data.node.x, data.node.y, { ...data.node });
    data.conns.forEach(c => NX.conns.push({ ...c, _phase: Math.random() }));
  }
  else if (type === 'move') { _moveNodeTo(data.id, data.from.x, data.from.y); }
  else if (type === 'title') { _setNodeTitle(data.id, data.from); }
  else if (type === 'body')  { _setNodeBody(data.id, data.from); }
  else if (type === 'conn')  { NX.conns = NX.conns.filter(c => c.id !== data.connId); }
  else if (type === 'fractal') { data.childIds.forEach(id => _removeNode(id)); }
  else if (type === 'collapse') { const n = NX.nodes.find(x => x.id === data.id); if (n) { n.collapsed = !data.to; const el = document.getElementById('n_' + n.id); if (el) el.classList.toggle('dot-mode', n.collapsed); } }
  else if (type === 'layout' || type === 'cluster') {
    data.forEach(({ id, from }) => _moveNodeTo(id, from.x, from.y));
  }
  else if (type === 'paste') { data.ids.forEach(id => _removeNode(id)); }
}
function _applyRedo(action) {
  const { type, data } = action;
  if (type === 'delete') { _removeNode(data.node.id); }
  else if (type === 'move') { _moveNodeTo(data.id, data.to.x, data.to.y); }
  else if (type === 'title') { _setNodeTitle(data.id, data.to); }
  else if (type === 'body')  { _setNodeBody(data.id, data.to); }
  else if (type === 'collapse') { const n = NX.nodes.find(x => x.id === data.id); if (n) { n.collapsed = data.to; const el = document.getElementById('n_' + n.id); if (el) el.classList.toggle('dot-mode', n.collapsed); } }
}

function _moveNodeTo(id, x, y) {
  const n = NX.nodes.find(x2 => x2.id === id); if (!n) return;
  n.x = x; n.y = y;
  const el = document.getElementById('n_' + id); if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; }
}
function _setNodeTitle(id, val) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  n.title = val;
  const el = document.getElementById('n_' + id); if (el) { const t = el.querySelector('.node-title'); if (t) t.textContent = val; }
}
function _setNodeBody(id, val) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  n.body = val;
  const el = document.getElementById('n_' + id); if (el) { const b = el.querySelector('.node-body'); if (b) b.textContent = val; }
}

/* ── Copy / Paste ─────────────────────────────────────────────── */
function copySelected() {
  if (!NX.selected.size) { toast('Nothing selected'); return; }
  NX.clipboard = NX.nodes.filter(n => NX.selected.has(n.id)).map(n => ({ ...n, tags: [...(n.tags || [])], domains: [...(n.domains || [])] }));
  NX.clipConns = NX.conns.filter(c => NX.selected.has(c.from) && NX.selected.has(c.to));
  mm_toast(`Copied ${NX.clipboard.length} node${NX.clipboard.length>1?'s':''}`, 'success', {dur:1600});
}
function pasteNodes() {
  if (!NX.clipboard.length) { toast('Nothing to paste'); return; }
  clearSelection();
  const idMap = {};
  const newNodes = NX.clipboard.map(n => {
    const newId = uuid(); idMap[n.id] = newId;
    const s = spawnNode(n.type, n.x + 42, n.y + 42, { ...n, id: newId, created: Date.now() });
    selectNode(s.id, false);
    return s;
  });
  (NX.clipConns || []).forEach(c => { if (idMap[c.from] && idMap[c.to]) addConn(idMap[c.from], idMap[c.to], c.label); });
  pushUndo('paste', { ids: newNodes.map(n => n.id) });
  mm_toast(`Pasted ${newNodes.length} node${newNodes.length>1?'s':''}`, 'success', {dur:1600});
  autosaveJAA();
}

/* ── Layout & Cluster ─────────────────────────────────────────── */
function autoLayout() {
  const snap = NX.nodes.map(n => ({ id: n.id, from: { x: n.x, y: n.y } }));
  const iterations = 80, rep = 8000, att = .055, damp = .86, cent = .002;
  const vel = {}; NX.nodes.forEach(n => { vel[n.id] = { vx: 0, vy: 0 }; });
  for (let it = 0; it < iterations; it++) {
    for (let i = 0; i < NX.nodes.length; i++) for (let j = i + 1; j < NX.nodes.length; j++) {
      const a = NX.nodes[i], b = NX.nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) + 1;
      const f = rep / (d * d);
      vel[a.id].vx -= (dx / d) * f; vel[a.id].vy -= (dy / d) * f;
      vel[b.id].vx += (dx / d) * f; vel[b.id].vy += (dy / d) * f;
    }
    NX.conns.forEach(c => {
      const a = NX.nodes.find(n => n.id === c.from), b = NX.nodes.find(n => n.id === c.to);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      vel[a.id].vx += dx * att; vel[a.id].vy += dy * att;
      vel[b.id].vx -= dx * att; vel[b.id].vy -= dy * att;
    });
    NX.nodes.forEach(n => {
      vel[n.id].vx *= damp; vel[n.id].vy *= damp;
      vel[n.id].vx += (1200 - n.x) * cent; vel[n.id].vy += (900 - n.y) * cent;
      n.x += vel[n.id].vx; n.y += vel[n.id].vy;
    });
  }
  NX.nodes.forEach(n => { const el = document.getElementById('n_' + n.id); if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; } });
  pushUndo('layout', snap.map(s => { const n = NX.nodes.find(x => x.id === s.id); return { id: s.id, from: s.from, to: { x: n.x, y: n.y } }; }));
  resetView(); toast('⊞ Force layout applied');
}

function clusterNodes() {
  const snap = NX.nodes.map(n => ({ id: n.id, from: { x: n.x, y: n.y } }));
  const groups = {}; NX.nodes.forEach(n => { if (!groups[n.type]) groups[n.type] = []; groups[n.type].push(n); });
  const tk = Object.keys(groups), ng = tk.length, CX = 1200, CY = 900;
  tk.forEach((type, gi) => {
    const ang = (gi / ng) * Math.PI * 2, gx = CX + Math.cos(ang) * 380, gy = CY + Math.sin(ang) * 380;
    groups[type].forEach((n, ni) => {
      const na = (ni / groups[type].length) * Math.PI * 2;
      const nr = Math.min(300, 80 + groups[type].length * 28);
      n.x = gx + Math.cos(na) * nr; n.y = gy + Math.sin(na) * nr;
      const el = document.getElementById('n_' + n.id); if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
    });
  });
  pushUndo('cluster', snap.map(s => { const n = NX.nodes.find(x => x.id === s.id); return { id: s.id, from: s.from, to: { x: n.x, y: n.y } }; }));
  resetView(); toast('○ Clustered by type');
}

function mutMode(m) {
  NX.nodes.forEach(n => {
    n.collapsed = m === 'collapse';
    const el = document.getElementById('n_' + n.id);
    if (el) {
      el.classList.toggle('dot-mode', n.collapsed);
      const cb = el.querySelector('.node-collapse-btn');
      if (cb) cb.textContent = n.collapsed ? '⬡' : '●';
    }
  });
  mm_toast(m === 'collapse' ? 'All nodes collapsed to dots' : 'All nodes expanded', 'info', {dur:1800});
}

function delSel() { const ids = [...NX.selected]; if (!ids.length) { toast('Nothing selected'); return; } ids.forEach(id => _delNode(id)); }
function dupSel() { [...NX.selected].forEach(id => _dupNode(id)); }

/* ── Viewport ─────────────────────────────────────────────────── */
function applyT() {
  document.getElementById('world').style.transform = `translate(${NX.panX}px,${NX.panY}px) scale(${NX.zoom})`;
  const pct = Math.round(NX.zoom * 100) + '%';
  document.getElementById('zd').textContent = pct;
  document.getElementById('zoom-val').textContent = pct;
}
function zoomToward(factor, cx, cy) {
  const { zoom, panX, panY } = NX;
  const wx = (cx - panX) / zoom, wy = (cy - panY) / zoom;
  NX.zoom = Math.max(.06, Math.min(4, zoom * factor));
  NX.panX = cx - wx * NX.zoom; NX.panY = cy - wy * NX.zoom;
  applyT();
}
function zoomIn() { zoomToward(1.18, window.innerWidth / 2, window.innerHeight / 2); }
function zoomOut() { zoomToward(1 / 1.18, window.innerWidth / 2, window.innerHeight / 2); }
function resetView() {
  const all = NX.nodes; if (!all.length) { NX.zoom = 1; NX.panX = 0; NX.panY = 0; applyT(); return; }
  let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
  all.forEach(n => {
    const el = document.getElementById('n_' + n.id);
    const w = el ? el.offsetWidth : 220, h = el ? el.offsetHeight : 120;
    mnX = Math.min(mnX, n.x); mnY = Math.min(mnY, n.y);
    mxX = Math.max(mxX, n.x + w); mxY = Math.max(mxY, n.y + h);
  });
  const pad = 80, cw = mxX - mnX + pad * 2, ch = mxY - mnY + pad * 2;
  const vw = window.innerWidth, vh = window.innerHeight - 38;
  NX.zoom = Math.max(.1, Math.min(1.5, Math.min(vw / cw, vh / ch)));
  NX.panX = (vw - cw * NX.zoom) / 2 - (mnX - pad) * NX.zoom;
  NX.panY = (vh - ch * NX.zoom) / 2 - (mnY - pad) * NX.zoom;
  applyT();
}
function s2w(sx, sy) { return { x: (sx - NX.panX) / NX.zoom, y: (sy - NX.panY) / NX.zoom }; }

/* ── Tool ─────────────────────────────────────────────────────── */
function setTool(t) {
  NX.tool = t;
  document.querySelectorAll('.tb-tool[id^="tool-"]').forEach(el => el.classList.remove('act'));
  document.getElementById('tool-' + t)?.classList.add('act');
  showModeIndicator(t.toUpperCase() + ' MODE');
  _cwrap.style.cursor = t === 'link' ? 'crosshair' : t === 'zone' ? 'cell' : 'default';
  if (t !== 'link') cancelLink();
}
function showModeIndicator(text) {
  const el = document.getElementById('mode-indicator');
  el.textContent = text; el.classList.add('show');
  clearTimeout(showModeIndicator._t);
  showModeIndicator._t = setTimeout(() => el.classList.remove('show'), 1800);
}

/* ── Keyboard ─────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  const active = document.activeElement;
  const inEdit = active && (active.contentEditable === 'true' || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
  if (inEdit && e.key !== 'Escape') return;
  const k = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if ((e.metaKey || e.ctrlKey) && (k === 'y' || (e.shiftKey && k === 'z'))) { e.preventDefault(); redo(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'c') { e.preventDefault(); copySelected(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'v') { e.preventDefault(); pasteNodes(); return; }
  if ((e.metaKey || e.ctrlKey) && k === 'a') { e.preventDefault(); selectAll(); return; }
  if (k === 'delete' || k === 'backspace') { if (NX.selected.size > 0) { [...NX.selected].forEach(id => _delNode(id)); return; } }
  if (k === 'escape') { clearSelection(); cancelLink(); closeSearch(); return; }
  if (k === 'v' && !e.ctrlKey && !e.metaKey) { const vo = document.getElementById('void-overlay'); if (vo) { if (vo.classList.contains('open')) closeVoid(); else enterVoid(); } return; }
  if (k === 'b' && !e.ctrlKey && !e.metaKey) { if (typeof openBrainMap === 'function') openBrainMap(); }
  if (k === 'f' && !e.ctrlKey && !e.metaKey) fractalExpand();
  if (k === 'h' && !e.ctrlKey && !e.metaKey) { if (typeof openHorizon === 'function') openHorizon(); }
  if (k === 'm' && !e.ctrlKey && !e.metaKey) { if (typeof openBrainModeSelector === 'function') openBrainModeSelector('canvas'); }
  if (k === 'tab') { e.preventDefault(); cycleSpawnType(); }
  if (k === '/' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); openSearch(); }
});

function cycleSpawnType() {
  const types = Object.keys(NT), cur = types.indexOf(NX._lastSpawnType || 'concept');
  NX._lastSpawnType = types[(cur + 1) % types.length];
  showModeIndicator('SPAWN: ' + NX._lastSpawnType.toUpperCase());
}

/* ── Layers ───────────────────────────────────────────────────── */
function toggleLayer(layer) {
  NX.layers[layer] = !NX.layers[layer];
  document.getElementById('layer-' + layer)?.classList.toggle('act', NX.layers[layer]);
  if (layer === 'particles') document.getElementById('particle-cvs').style.display = NX.layers.particles ? '' : 'none';
}

/* ── Spawn ripple ─────────────────────────────────────────────── */
function spawnRipple(x, y, color) {
  const el = document.createElement('div'); el.className = 'spawn-ring';
  el.style.cssText = `width:50px;height:50px;left:${x - 25}px;top:${y - 25}px;border-color:${color};`;
  document.body.appendChild(el); setTimeout(() => el.remove(), 550);
}

/* ── Side panel ───────────────────────────────────────────────── */
function toggleSidePanel() { document.getElementById('side-panel').classList.toggle('open'); updateCanvasStats(); }
function closeSidePanel() { document.getElementById('side-panel').classList.remove('open'); }

function spTab(t) {
  document.querySelectorAll('.sp-tab').forEach(el => el.classList.toggle('act', el.dataset.st === t));
  ['detail', 'conns', 'deltas', 'stats'].forEach(s => {
    const el = document.getElementById('spt-' + s); if (el) el.style.display = s === t ? '' : 'none';
  });
  if (t === 'stats') updateCanvasStats();
  if (t === 'deltas') renderDeltaLog();
}

function updateSidePanel(id) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  document.getElementById('side-panel').classList.add('open');
  const nt = NT[n.type] || NT.concept, col = n.color || nt.color;
  document.getElementById('detail-empty').style.display = 'none';
  const dc = document.getElementById('detail-content'); dc.style.display = '';
  dc.innerHTML = `
  <div class="detail-section"><div class="detail-label">UUID</div>
    <code class="detail-uuid" onclick="_copyUUID('${n.id}')">${n.id}</code></div>
  <div class="detail-section"><div class="detail-label">Type</div>
    <div style="font-family:var(--f-mono);font-size:10px;color:${col}">${escH(nt.badge)} · ${escH(nt.domain)}</div></div>
  <div class="detail-section"><div class="detail-label">Title</div>
    <div style="font-family:var(--f-body);font-size:11px;color:var(--bright)">${escH(n.title)}</div></div>
  <div class="detail-section"><div class="detail-label">Body</div>
    <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);line-height:1.7">${escH(n.body) || '<span style="color:var(--dim)">—</span>'}</div></div>
  <div class="detail-section"><div class="detail-label">Depth · Created</div>
    <div style="font-family:var(--f-mono);font-size:8px">D${n.depth || 0} · ${fmtTS(n.created)}</div></div>
  <div class="detail-section"><div class="detail-label">JAA Deltas</div>
    <div style="font-family:var(--f-mono);font-size:8px;color:var(--c)">${typeof JAA !== 'undefined' ? (JAA.getDeltas(n.id).length + ' recorded') : 'JAA not loaded'}</div></div>
  <div class="detail-section" style="border:none">
    <button style="width:100%;padding:6px;border:1px solid ${col}44;color:${col};background:rgba(0,0,0,.3);cursor:pointer;font-family:var(--f-mono);font-size:7px;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:3px" onclick="_fractalNode('${n.id}')">∞ FRACTAL EXPAND</button>
    <button style="width:100%;padding:6px;border:1px solid var(--wire2);color:var(--r);background:rgba(0,0,0,.3);cursor:pointer;font-family:var(--f-mono);font-size:7px;letter-spacing:1.5px;text-transform:uppercase" onclick="_delNode('${n.id}')">✕ DELETE</button>
  </div>`;

  const conns = NX.conns.filter(c => c.from === n.id || c.to === n.id);
  document.getElementById('conns-empty').style.display = conns.length ? 'none' : '';
  document.getElementById('conns-list').innerHTML = conns.map(c => {
    const oid = c.from === n.id ? c.to : c.from;
    const o = NX.nodes.find(x => x.id === oid); if (!o) return '';
    const ont = NT[o.type] || NT.concept;
    const dir = c.from === n.id ? '→' : '←';
    return `<div class="conn-item" onclick="selectNode('${o.id}');updateSidePanel('${o.id}')">
      <div class="conn-dot" style="background:${ont.color}"></div>
      <div style="flex:1"><div style="font-family:var(--f-body);font-size:9px;font-weight:600;color:var(--bright)">${escH(o.title)}</div>
      <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${dir} ${ont.badge}</div></div>
      <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--mid);font-style:italic">${escH(c.label || '')}</div>
    </div>`;
  }).join('');
}

function renderDeltaLog() {
  const list = document.getElementById('delta-log-list'); if (!list) return;
  // Prefer MM delta ledger
  const entries = (typeof MMDelta !== 'undefined')
    ? MMDelta.recent(60)
    : (typeof JAA !== 'undefined' ? JAA.getLog().entries.slice(-50).reverse() : []);
  list.innerHTML = entries.length ? entries.map(e => {
    const isMetaDelta = (e.action || e.type || '').includes('meta');
    const action = e.action || e.type || '?';
    const entityId = e.entityId || e.data?.id;
    const modColor = e.module === 'canvas' ? 'var(--c)' : e.module === 'tags' ? 'var(--v)' : 'var(--o)';
    return `<div class="delta-log-item">
      <span class="dlg-ts">${fmtTime(e.ts || e.time)}</span>
      <span class="${isMetaDelta ? 'dlg-meta' : 'dlg-action'}" style="color:${modColor}">${escH(action)}</span>
      ${entityId ? `<span class="dlg-uuid"> ${escH(shortId(entityId))}</span>` : ''}
      ${e.module ? `<span style="font-size:5.5px;color:var(--dim);margin-left:4px">[${escH(e.module)}]</span>` : ''}
    </div>`;
  }).join('') : '<div style="padding:16px;font-family:var(--f-mono);font-size:7.5px;color:var(--dim);text-align:center">No deltas recorded yet</div>';
}

function updateCanvasStats() {
  const cs = document.getElementById('canvas-stats'); if (!cs) return;
  const tc = {}; NX.nodes.forEach(n => { tc[n.type] = (tc[n.type] || 0) + 1; });
  // Use MM foundation stats
  const regStats = (typeof MMRegistry !== 'undefined') ? MMRegistry.stats() : null;
  const deltaStats = (typeof MMDelta !== 'undefined') ? MMDelta.stats() : null;
  const tagStats = (typeof MMTags !== 'undefined') ? MMTags.stats() : null;
  const vaultStats = (typeof MMVault !== 'undefined') ? MMVault.stats() : null;
  cs.innerHTML = `
  <div class="bs-row"><div class="bs-label">Nodes</div><div class="bs-val">${NX.nodes.length}</div></div>
  <div class="bs-row"><div class="bs-label">Connections</div><div class="bs-val">${NX.conns.length}</div><div class="bs-bar"><div class="bs-fill" style="width:${Math.min(100,NX.conns.length*4)}%;background:var(--c)"></div></div></div>
  ${regStats ? `<div class="bs-row"><div class="bs-label" style="color:var(--c)">UUID Registry</div><div class="bs-val" style="color:var(--c)">${regStats.alive}</div></div>` : ''}
  ${deltaStats ? `<div class="bs-row"><div class="bs-label" style="color:var(--o)">Delta Ledger</div><div class="bs-val" style="color:var(--o)">${deltaStats.total}</div></div>` : ''}
  ${tagStats ? `<div class="bs-row"><div class="bs-label" style="color:var(--v)">Tag Defs</div><div class="bs-val" style="color:var(--v)">${tagStats.total}</div></div>` : ''}
  ${vaultStats ? `<div class="bs-row"><div class="bs-label" style="color:var(--g)">Vault</div><div class="bs-val" style="color:var(--g)">${vaultStats.sizeKB} KB · ${vaultStats.saveCount} saves</div></div>` : ''}
  <div class="bs-row"><div class="bs-label">Undo Stack</div><div class="bs-val">${NX.undoStack.length}</div></div>
  ${Object.entries(tc).map(([t, count]) => {
    const nt = NT[t] || NT.concept;
    return `<div class="bs-row"><div class="bs-label" style="color:${nt.color}">${nt.badge}</div><div class="bs-val" style="font-size:13px;color:${nt.color}">${count}</div><div class="bs-bar"><div class="bs-fill" style="width:${Math.min(100,count*15)}%;background:${nt.color}"></div></div></div>`;
  }).join('')}
  <div class="bs-row" style="border:none;padding-top:10px;gap:6px">
    <button onclick="MMTagsUI?.openManager()" style="font-family:var(--f-mono);font-size:7px;letter-spacing:1px;padding:5px 10px;border:1px solid var(--v)44;background:transparent;color:var(--v);cursor:pointer;text-transform:uppercase">⊞ TAGS</button>
    <button onclick="MMDiag?.runAll().then(r=>toast(r.pass+'/'+r.total+' diag pass'))" style="font-family:var(--f-mono);font-size:7px;letter-spacing:1px;padding:5px 10px;border:1px solid var(--c)44;background:transparent;color:var(--c);cursor:pointer;text-transform:uppercase">⊡ DIAG</button>
    <button onclick="downloadVaultBackup()" style="font-family:var(--f-mono);font-size:7px;letter-spacing:1px;padding:5px 10px;border:1px solid var(--g)44;background:transparent;color:var(--g);cursor:pointer;text-transform:uppercase">↓ BACKUP</button>
  </div>`;
}

/* ── Search ───────────────────────────────────────────────────── */
function openSearch() { if (!_assertAuth()) return; document.getElementById('search-overlay').classList.add('open'); document.getElementById('search-input').focus(); document.getElementById('search-input').value = ''; runSearch(''); }
function closeSearch() { document.getElementById('search-overlay').classList.remove('open'); NX.nodes.forEach(n => document.getElementById('n_' + n.id)?.classList.remove('search-match')); }
function runSearch(q) {
  const ql = q.toLowerCase();
  // Include MM tag search
  const tagMatchIds = (typeof MMTags !== 'undefined' && ql)
    ? MMTags.entitiesWithAny(ql.split(' ').filter(Boolean))
    : [];
  const results = NX.nodes.filter(n =>
    !q ||
    n.title.toLowerCase().includes(ql) ||
    (n.body || '').toLowerCase().includes(ql) ||
    (n.tags || []).some(t => t.toLowerCase().includes(ql)) ||
    n.type.includes(ql) ||
    tagMatchIds.includes(n.id)
  ).slice(0, 14);
  NX.nodes.forEach(n => { const m = !!q && results.some(r => r.id === n.id); document.getElementById('n_' + n.id)?.classList.toggle('search-match', m); });
  document.getElementById('search-results').innerHTML = results.map(n => {
    const nt = NT[n.type] || NT.concept;
    const mmTags = (typeof MMTags !== 'undefined') ? MMTags.forEntity(n.id).slice(0,3) : [];
    const tagHtml = mmTags.length ? mmTags.map(t => `<span style="color:${t.color};font-size:6px;border:1px solid ${t.color}33;padding:0 3px;margin-left:2px">${escH(t.name)}</span>`).join('') : '';
    return `<div class="search-result" onclick="jumpToNode('${n.id}')"><span class="sr-icon">${nt.icon}</span><span class="sr-title">${escH(n.title)}</span>${tagHtml}<span class="sr-type" style="color:${nt.color}">${nt.badge}</span></div>`;
  }).join('') || '<div style="padding:16px;text-align:center;font-family:var(--f-mono);font-size:8px;color:var(--dim)">No matches</div>';
}
function jumpToNode(id) {
  const n = NX.nodes.find(x => x.id === id); if (!n) return;
  const el = document.getElementById('n_' + n.id);
  const w = el ? el.offsetWidth : 220, h = el ? el.offsetHeight : 120;
  NX.zoom = 1; NX.panX = window.innerWidth / 2 - (n.x + w / 2); NX.panY = (window.innerHeight - 38) / 2 - (n.y + h / 2);
  applyT(); selectNode(id); closeSearch();
  setTimeout(() => { el?.classList.add('new-pulse'); setTimeout(() => el?.classList.remove('new-pulse'), 900); }, 100);
}
function searchNav(e) { if (e.key === 'Escape') closeSearch(); }

/* ── Context menu ─────────────────────────────────────────────── */
let _ctxNodeId = null;
function showCtx(x, y, id) { _ctxNodeId = id; const ctx = document.getElementById('ctx'); ctx.style.display = 'block'; ctx.style.left = Math.min(x, window.innerWidth - 200) + 'px'; ctx.style.top = Math.min(y, window.innerHeight - 240) + 'px'; }
function ctxDo(action) {
  document.getElementById('ctx').style.display = 'none'; if (!_ctxNodeId) return;
  const id = _ctxNodeId;
  if (action === 'detail') updateSidePanel(id);
  else if (action === 'link') beginLink(id);
  else if (action === 'dup') _dupNode(id);
  else if (action === 'fractal') _fractalNode(id);
  else if (action === 'collapse') _toggleDot(id);
  else if (action === 'expand') { const n = NX.nodes.find(x => x.id === id); if (n && n.collapsed) _toggleDot(id); }
  else if (action === 'sendBrain') { if (typeof openBrainMap === 'function') openBrainMap(); }
  else if (action === 'copyUUID') _copyUUID(id);
  else if (action === 'del') _delNode(id);
  else if (action === 'sendVoid') {
    const n = NX.nodes.find(x => x.id === id);
    if (n) {
      enterVoid();
      setTimeout(() => {
        const inp = document.getElementById('horizon-input');
        if (inp) inp.value = n.title + (n.body ? ': ' + n.body.slice(0, 80) : '');
        mm_toast('Sent to Framework: ' + n.title.slice(0,30), 'info');
      }, 300);
    }
  }
  else if (action === 'aiExpand') { aiExpandNode(id); }
  else if (action === 'aiAnalyze') { aiAnalyzeCanvas(); }
}
document.addEventListener('click', e => { if (!e.target.closest('#ctx')) document.getElementById('ctx').style.display = 'none'; });

/* ── Options ──────────────────────────────────────────────────── */
function openOptions() {
  document.getElementById('opts-overlay').classList.add('open');
  renderThemeGrid(); updateOptsDataLabel();
  loadOpts();
  syncOptsToggles();
  optsRefreshSecurity();
  // Pre-refresh vault status in background
  setTimeout(() => { if (typeof optsRefreshVault === 'function') optsRefreshVault(); }, 150);
  // Default to appearance tab
  document.querySelectorAll('.opts-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.opts-tab').forEach(t => t.classList.remove('active'));
  const firstNav = document.querySelector('.opts-nav-item');
  const firstTab = document.getElementById('otab-appearance');
  if (firstNav) firstNav.classList.add('active');
  if (firstTab) firstTab.classList.add('active');
  // Sync AI settings
  const aiEnabled = document.getElementById('opt-ai-enabled');
  const aiProvider = document.getElementById('opt-ai-provider');
  const aiModel   = document.getElementById('opt-ai-model');
  const aiKey     = document.getElementById('opt-ai-key');
  if (aiEnabled) aiEnabled.classList.toggle('on', AI.enabled);
  if (aiProvider) aiProvider.value = AI.provider;
  if (aiModel)   aiModel.value   = AI.model;
  if (aiKey)     aiKey.value     = AI.apiKey;
  // Vault status refresh
  optsRefreshVault();
}
function closeOptions() { document.getElementById('opts-overlay').classList.remove('open'); }

function renderThemeGrid() {
  document.getElementById('theme-grid').innerHTML = Object.entries(THEMES).map(([key, th]) =>
    `<div class="theme-card${NX.theme === key ? ' act' : ''}" onclick="applyTheme('${key}')">
      <div class="theme-name">${th.name}</div>
      <div class="theme-desc">${th.desc}</div>
      <div class="theme-palette">${th.palette.map(c => `<div class="theme-swatch" style="background:${c}"></div>`).join('')}</div>
    </div>`
  ).join('');
}

function updateOptsDataLabel() {
  const label = document.getElementById('opts-data-label');
  if (label) label.textContent = NX_CONFIG.dataDir || '(no folder set)';
}

function changeDataFolder() {
  if (!window.NXAPI) { toast('Electron API not available'); return; }
  window.NXAPI.pickDataFolder().then(dir => {
    if (dir) {
      window.NXAPI.setDataDir(dir).then(() => {
        NX_CONFIG.dataDir = dir;
        if (typeof JAA !== 'undefined') JAA.setDataDir(dir);
        updateDataDisplay();
        updateOptsDataLabel();
        mm_toast('Data folder: ' + dir.slice(-30), 'success');
      });
    }
  });
}

function openDataFolder() {
  if (!NX_CONFIG.dataDir) { toast('No data folder set'); return; }
  if (window.NXAPI) window.NXAPI.openFolder(NX_CONFIG.dataDir);
}

/* ── Save / Load ──────────────────────────────────────────────── */
/* ── MM Foundation getState bridge ─────────────────────────────────────────── */
function _mmGetState() {
  return {
    version: 4,
    nodes: NX.nodes,
    conns: NX.conns,
    zones: NX.zones,
    viewport: { zoom: NX.zoom, panX: NX.panX, panY: NX.panY },
    saved: Date.now(),
    // Module states
    voidState: typeof VOID_STATE !== 'undefined' ? VOID_STATE : null,
    gapState: typeof GAP_STATE !== 'undefined' ? GAP_STATE : null,
    // tag/domain assignments per-node (pulled from MMTags if available)
    tagAssignments: (typeof MMTags !== 'undefined')
      ? NX.nodes.reduce((acc, n) => { acc[n.id] = MMTags.forEntity(n.id).map(t=>t.slug); return acc; }, {})
      : {},
  };
}

async function saveCanvas() {
  // Always route through vaultSave — filesystem is the only persistent store
  if (typeof vaultSave === 'function') {
    await vaultSave(true);
    return;
  }
  // Should never reach here — vaultSave is always defined
  MMLog?.error('canvas', 'saveCanvas: vaultSave not available');
  mm_toast('⚡ Save error: vault engine not ready', 'error');
}

async function loadCanvas() {
  let appState = null;

  // ── PRIMARY: Read from vault FILE (Electron only) ─────────────
  if (window.NXAPI) {
    const vaultPath = NX_CONFIG.vaultPath ||
      ((NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir') || '') + '/mastermind.vault');

    if (vaultPath && vaultPath !== '/mastermind.vault') {
      try {
        const raw = await window.NXAPI.vaultRead(vaultPath);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.encrypted && AUTH.key) {
            const plainBuf = await _aesDecrypt(AUTH.key, { iv: parsed.iv, data: parsed.data });
            const plain = JSON.parse(new TextDecoder().decode(plainBuf));
            appState = plain.canvas || plain.nodes ? plain : plain.data;
          } else if (!parsed.encrypted && parsed.data) {
            appState = parsed.data;
          } else if (!parsed.encrypted && parsed.nodes) {
            appState = parsed; // root-level canvas data
          }
          if (appState) {
            MMLog?.info('canvas', 'Loaded from vault file: ' + vaultPath.slice(-40));
          }
        }
      } catch(e) {
        MMLog?.error('canvas', 'Vault file read error: ' + e.message);
        mm_toast('⚡ Vault read error: ' + e.message, 'error');
      }
    }
  }

  // ── SESSION CACHE fallback (localStorage — current session only) ──
  // Only used if vault file gave nothing (e.g. first launch, empty vault)
  if (!appState) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        appState = JSON.parse(raw);
        if (appState) MMLog?.info('canvas', 'Loaded from session cache (localStorage)');
      }
    } catch(e) {}
  }

  if (!appState) {
    MMLog?.info('canvas', 'No saved canvas — fresh start');
    return; // Silent — fresh canvas is fine
  }

  _clearHard();
  (appState.nodes || []).forEach(n => {
    spawnNode(n.type, n.x, n.y, n);
    // Restore tag assignments into MMTags
    if (typeof MMTags !== 'undefined' && appState.tagAssignments?.[n.id]) {
      appState.tagAssignments[n.id].forEach(slug => MMTags.tag(n.id, slug));
    }
  });
  (appState.conns || []).forEach(c => NX.conns.push({ ...c, _phase: Math.random() }));
  if (appState.viewport) {
    NX.zoom = appState.viewport.zoom || 1;
    NX.panX = appState.viewport.panX || 0;
    NX.panY = appState.viewport.panY || 0;
    applyT();
  }
  // Restore module states
  if (appState.voidState && typeof VOID_STATE !== 'undefined') Object.assign(VOID_STATE, appState.voidState);
  if (appState.gapState && typeof GAP_STATE !== 'undefined') Object.assign(GAP_STATE, appState.gapState);

  T.canvasLoaded(NX.nodes.length);
  if (typeof MMLog !== 'undefined') MMLog.info('canvas', `Canvas loaded: ${NX.nodes.length} nodes, ${NX.conns.length} conns`);
}

let _autosaveTimer = null;
function autosaveJAA() {
  // Debounced save to vault filesystem
  if (typeof vaultDirtySave === 'function') { vaultDirtySave(3000); return; }
  clearTimeout(_autosaveTimer);
  _autosaveTimer = setTimeout(() => { if (NX.nodes.length > 0) saveCanvas(); }, 3000);
}

function exportJSON() {
  const data = { version: 4, nodes: NX.nodes, conns: NX.conns, saved: Date.now(), jaaLedger: typeof JAA !== 'undefined' ? Object.fromEntries(JAA.ledger) : {} };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'nexus-canvas-' + Date.now() + '.json'; a.click(); T.exportedJSON();
}
function importJSON() { document.getElementById('import-file').click(); }
// handleImportFile defined in module:import below (multi-format)

function _clearHard() {
  NX.nodes.forEach(n => document.getElementById('n_' + n.id)?.remove());
  document.querySelectorAll('.zone').forEach(z => z.remove());
  NX.nodes = []; NX.conns = []; NX.zones = []; NX.selected.clear();
  NX.undoStack = []; NX.redoStack = []; updateUndoBtns();
}
function clearConfirm() { if (confirm('Clear canvas? Cannot be undone.')) { _clearHard(); T.canvasCleared(); } }

/* ── Homepage & navigation ────────────────────────────────────── */
function buildHomepage() {
  updateDataDisplay();
  _initHomepageBg();
}

let _hpBgRaf = null;
function _initHomepageBg() {
  const cvs = document.getElementById('hp-cvs');
  if (!cvs) return;
  if (cvs._hpWired) return;
  cvs._hpWired = true;

  const resize = () => { cvs.width = cvs.offsetWidth; cvs.height = cvs.offsetHeight; };
  resize();
  window.addEventListener('resize', resize);

  const ctx = cvs.getContext('2d');

  // Constellation nodes — domain colors, slowly drifting
  const COLORS = ['#00c8ff','#cc44ff','#ff3355','#ff8c22','#00ff88','#d4a820','#ff66aa','#7744ff','#11ddcc'];
  const nodes = Array.from({ length: 55 }, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - .5) * .00015,
    vy: (Math.random() - .5) * .00015,
    r: Math.random() * 1.8 + .5,
    col: COLORS[Math.floor(Math.random() * COLORS.length)],
    phase: Math.random() * Math.PI * 2,
    speed: Math.random() * .8 + .4,
  }));

  // Connection threshold
  const LINK_DIST = 0.22;

  function frame(t) {
    if (!document.getElementById('homepage') || document.getElementById('homepage').classList.contains('hidden')) {
      _hpBgRaf = requestAnimationFrame(frame);
      return;
    }
    const W = cvs.width, H = cvs.height;
    if (!W || !H) { _hpBgRaf = requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, W, H);
    const ts = t / 1000;

    // Update positions
    nodes.forEach(n => {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0) n.x = 1; if (n.x > 1) n.x = 0;
      if (n.y < 0) n.y = 1; if (n.y > 1) n.y = 0;
    });

    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < LINK_DIST) {
          const alpha = (1 - d / LINK_DIST) * 0.12;
          ctx.beginPath();
          ctx.moveTo(a.x * W, a.y * H);
          ctx.lineTo(b.x * W, b.y * H);
          ctx.strokeStyle = a.col.replace('#', 'rgba(').replace(/(.{2})(.{2})(.{2})/, (m, r, g, b) =>
            `${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)},${alpha})`);
          // alpha already applied via rgba() above
          ctx.lineWidth = .6;
          ctx.stroke();
        }
      }
    }

    // Draw nodes
    nodes.forEach(n => {
      const pulse = 0.5 + 0.5 * Math.sin(ts * n.speed + n.phase);
      const r = n.r * (1 + pulse * 0.8);
      const alpha = 0.25 + pulse * 0.35;
      // Outer glow
      const grd = ctx.createRadialGradient(n.x * W, n.y * H, 0, n.x * W, n.y * H, r * 3);
      grd.addColorStop(0, _hexAlpha(n.col, alpha));
      grd.addColorStop(1, n.col + '00');
      ctx.beginPath();
      ctx.arc(n.x * W, n.y * H, r * 3, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
      // Core dot
      ctx.beginPath();
      ctx.arc(n.x * W, n.y * H, r, 0, Math.PI * 2);
      ctx.fillStyle = _hexAlpha(n.col, 0.5 + pulse * 0.5);
      ctx.fill();
    });

    _hpBgRaf = requestAnimationFrame(frame);
  }
  _hpBgRaf = requestAnimationFrame(frame);
}

function enterCanvas() {
  if (!_assertAuth()) return;
  document.getElementById('startup-screen').classList.add('hidden');
  document.getElementById('homepage').classList.add('hidden');
  document.getElementById('canvas-wrap').classList.add('visible');
  document.getElementById('toolbar').classList.add('visible');
  document.getElementById('minimap').classList.add('visible');
  document.getElementById('zoom-widget').classList.add('visible');
  document.getElementById('layer-controls').classList.add('visible');
  document.getElementById('help-hint').classList.add('visible');
  // Show canvas tools in unified titlebar
  const ct = document.getElementById('tb-canvas-tools');
  if (ct) ct.style.display = 'flex';
  const tbPath = document.getElementById('tb-path');
  if (tbPath) tbPath.style.flex = '0 0 auto';
}

function enterBrainMap() {
  // Enter the brain map directly from homepage — goes via canvas first so data is loaded
  enterCanvas();
  // Small delay so canvas renders before overlay opens
  setTimeout(function() { if (typeof openBrainMap === 'function') openBrainMap(); }, 200);
}

function goHome() {
  if (!_assertAuth()) return;
  // Close all overlays first
  closeSidePanel();
  closeBrainMap();
  closeSearch();
  _voidSaveFields?.(); saveVoidState?.();
  const vo = document.getElementById('void-overlay');
  if (vo) { vo.classList.remove('open'); vo.style.display = 'none'; }

  // Hide canvas UI
  ['canvas-wrap','toolbar','minimap','zoom-widget','layer-controls','help-hint'].forEach(id => {
    document.getElementById(id)?.classList.remove('visible');
  });
  // Hide canvas tools from unified titlebar
  const ct = document.getElementById('tb-canvas-tools');
  if (ct) ct.style.display = 'none';
  const tbPath = document.getElementById('tb-path');
  if (tbPath) tbPath.style.flex = '1';

  // Show homepage
  document.getElementById('startup-screen').classList.add('hidden');
  document.getElementById('homepage').classList.remove('hidden');
  // Fire particle background
  _initHomepageBg?.();

  // Track where we came from for void restore
  NX._lastView = null;
}

/* ── Startup screen ───────────────────────────────────────────── */
let _startupFolder = null;

async function pickStartupFolder() {
  if (!window.NXAPI) { toast('Electron API not available — using default'); useDefaultFolder(); return; }
  const dir = await window.NXAPI.pickDataFolder();
  if (dir) { _startupFolder = dir; setStartupFolderDisplay(dir); }
}

function setStartupFolderDisplay(dir) {
  const display = document.getElementById('startup-folder-path');
  if (display) { display.textContent = dir; display.classList.remove('placeholder'); }
  const btn = document.getElementById('ss-folder-enter-btn');
  if (btn) btn.disabled = false;
  _startupFolder = dir;
}

function useDefaultFolder() {
  const defaultDir = (window.NXAPI && window.navigator.platform.startsWith('Win'))
    ? (process?.env?.USERPROFILE || 'C:/Users') + '/Documents/NEXUS'
    : '/nexus-data';
  setStartupFolderDisplay(defaultDir);
}

async function enterFromStartup() {
  if (!_startupFolder) return;

  // ── Step 1: Set data directory ───────────────────────────────
  if (window.NXAPI) {
    await window.NXAPI.setDataDir(_startupFolder);
    NX_CONFIG.dataDir = _startupFolder;
  } else {
    NX_CONFIG.dataDir = _startupFolder;
    localStorage.setItem('nexus_datadir', _startupFolder);
  }
  if (typeof JAA !== 'undefined') JAA.setDataDir(_startupFolder);
  updateDataDisplay();

  // ── Step 2: Vault file gate ──────────────────────────────────
  // For Electron: create vault file if it doesn't exist, or verify it does
  if (window.NXAPI) {
    const vaultPath = _startupFolder + '/mastermind.vault';
    const exists = await window.NXAPI.vaultExists(vaultPath);

    if (!exists) {
      mm_toast('Creating vault file…', 'vault');
      // Create initial vault structure
      const initialVault = JSON.stringify({
        version: 5,
        encrypted: AUTH.encrypted,
        username: AUTH.username,
        created: Date.now(),
        data: null,                // empty canvas — populated on first save
        modules: AUTH.features,
      });
      const writeResult = await window.NXAPI.vaultWrite(vaultPath, initialVault);
      if (!writeResult?.ok) {
        MMLog?.error('vault', 'Failed to create vault file: ' + writeResult?.error);
        mm_toast('Vault file creation failed: ' + (writeResult?.error || 'unknown error'), 'error');
        // Don't proceed — show error and stay on folder screen
        const btn = document.getElementById('ss-folder-enter-btn');
        if (btn) { btn.disabled = false; btn.textContent = '→ ENTER'; }
        const errEl = document.getElementById('ss-folder-error');
        if (errEl) { errEl.textContent = '⚡ Could not create vault at: ' + vaultPath; errEl.style.display = ''; }
        return;
      }
      mm_toast('Vault created · ' + vaultPath.slice(-35), 'success');
      NX_CONFIG.vaultPath = vaultPath;
    } else {
      // Vault exists — verify it's readable
      const raw = await window.NXAPI.vaultRead(vaultPath);
      if (!raw) {
        mm_toast('Vault file unreadable — check folder permissions', 'error');
        MMLog?.error('vault', 'Vault exists but cannot be read: ' + vaultPath);
        return;
      }
      try {
        JSON.parse(raw);
        mm_toast('Vault found · unlocking…', 'vault');
      } catch(e) {
        mm_toast('Vault file corrupt — check backup', 'error');
        MMLog?.error('vault', 'Vault JSON parse failed: ' + e.message);
        return;
      }
      NX_CONFIG.vaultPath = vaultPath;
    }

    // ── Step 3: Watchdog — scan directory for vault file ────────
    // Confirm vault is physically present before proceeding
    const confirmed = await window.NXAPI.vaultExists(vaultPath);
    if (!confirmed) {
      mm_toast('Vault watchdog: file not detected after write', 'error');
      MMLog?.error('vault', 'Vault watchdog failed — file absent after creation');
      return;
    }
    MMLog?.info('vault', 'Vault watchdog: confirmed at ' + vaultPath);
  }

  // ── Step 4: Enter app — load vault data from disk ──────────
  // Read vault file from disk and hydrate localStorage / MMVault
  if (window.NXAPI && NX_CONFIG.vaultPath) {
    try {
      const raw = await window.NXAPI.vaultRead(NX_CONFIG.vaultPath);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Hydrate: if vault has canvas data, put it in localStorage for loadCanvas()
        if (parsed.data) {
          try { localStorage.setItem(SAVE_KEY, JSON.stringify(parsed.data)); } catch(e) {}
        }
        // If unencrypted vault, also hydrate MMVault meta
        if (!parsed.encrypted && typeof MMVault !== 'undefined') {
          try { MMVault.create(AUTH.username || 'operator', { encrypted: false }); } catch(e) {}
        }
        MMLog?.info('vault', 'Vault data loaded from disk: ' + NX_CONFIG.vaultPath);
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.loaded', { path: NX_CONFIG.vaultPath });
      }
    } catch(e) {
      MMLog?.warn('vault', 'Vault disk read on enter: ' + e.message);
    }
  }

  document.getElementById('startup-screen').classList.add('hidden');
  document.getElementById('homepage').classList.remove('hidden');
  _initHomepageBg?.();
  await loadCanvas();
}

function updateDataDisplay() {
  const dir = NX_CONFIG.dataDir;
  const tbPath = document.getElementById('tb-path');
  if (tbPath) tbPath.textContent = dir || 'no data folder';
  const hpLabel = document.getElementById('hp-data-label');
  if (hpLabel) hpLabel.textContent = dir ? dir.slice(-40) : 'no data folder';
  const optsLabel = document.getElementById('opts-data-label');
  if (optsLabel) optsLabel.textContent = dir || '(not set)';
}

/* ── Startup BG canvas animation ─────────────────────────────── */
function initStartupBg() {
  const cvs = document.getElementById('startup-bg-cvs'); if (!cvs) return;
  cvs.width = window.innerWidth; cvs.height = window.innerHeight;
  const ctx = cvs.getContext('2d');
  const stars = Array.from({ length: 120 }, () => ({
    x: Math.random() * cvs.width, y: Math.random() * cvs.height,
    r: Math.random() * 1.5 + .3, op: Math.random() * .5 + .1,
    vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
    pulse: Math.random() * Math.PI * 2,
    col: ['#00c8ff', '#cc44ff', '#00ff88', '#ff8c22', '#ffffff'][Math.floor(Math.random() * 5)],
  }));

  // Geometric shapes
  const shapes = Array.from({ length: 6 }, (_, i) => ({
    cx: Math.random() * cvs.width, cy: Math.random() * cvs.height,
    r: 60 + Math.random() * 80, sides: 6,
    angle: Math.random() * Math.PI * 2,
    angVel: (Math.random() - .5) * .003,
    col: ['#00c8ff', '#cc44ff', '#7744ff', '#11ddcc'][i % 4],
    opacity: .04 + Math.random() * .06,
  }));

  function drawBgCanvas() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    // Gradient bg
    const grd = ctx.createRadialGradient(cvs.width / 2, cvs.height / 2, 0, cvs.width / 2, cvs.height / 2, cvs.width / 2);
    grd.addColorStop(0, 'rgba(10,20,40,.4)');
    grd.addColorStop(.5, 'rgba(4,10,22,.8)');
    grd.addColorStop(1, 'rgba(2,4,10,1)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, cvs.width, cvs.height);

    // Geometric hexagonal shapes
    shapes.forEach(s => {
      s.angle += s.angVel;
      ctx.strokeStyle = s.col; ctx.globalAlpha = s.opacity; ctx.lineWidth = .8;
      ctx.beginPath();
      for (let i = 0; i < s.sides; i++) {
        const ang = s.angle + (i / s.sides) * Math.PI * 2;
        const px = s.cx + Math.cos(ang) * s.r, py = s.cy + Math.sin(ang) * s.r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
    });

    // Stars
    stars.forEach(s => {
      s.x += s.vx; s.y += s.vy; s.pulse += .015;
      if (s.x < 0) s.x = cvs.width; if (s.x > cvs.width) s.x = 0;
      if (s.y < 0) s.y = cvs.height; if (s.y > cvs.height) s.y = 0;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = s.col; ctx.globalAlpha = s.op * (.6 + .4 * Math.sin(s.pulse));
      ctx.fill(); ctx.globalAlpha = 1;
    });

    if (!document.getElementById('startup-screen').classList.contains('hidden'))
      requestAnimationFrame(drawBgCanvas);
  }
  drawBgCanvas();
}

/* ── Seed canvas data ─────────────────────────────────────────── */
function seedCanvas() {
  const CX = 600, CY = 420;
  const root = spawnNode('concept', CX, CY, { title: 'Cognitive OS', body: 'Everything radiates from here.', tags: ['ROOT', 'META'], depth: 0 });
  const seeds = [
    { type: 'insight',   title: 'Tension is Signal',        body: 'Every friction contains leverage.',         dx: -320, dy: -150 },
    { type: 'pattern',   title: 'Oscillation Loop',         body: 'Pendulum — rhythm, flow, balance.',         dx:  320, dy: -150 },
    { type: 'seed',      title: 'Horizon State',            body: 'Future self — reverse causal.',             dx: -280, dy:  180 },
    { type: 'question',  title: 'What conditions?',         body: 'What must exist for this end-state?',       dx:  280, dy:  180 },
    { type: 'heuristic', title: 'Pendulum Heuristic',       body: 'Swing far — return is inevitable.',        dx:    0, dy: -270 },
    { type: 'synthesis', title: 'Cross-Domain Synthesis',   body: 'Map unrelated domains. Watch what emerges.', dx:  0, dy:  270 },
    { type: 'friction',  title: 'Cognitive Load',           body: 'Externalize to free the buffer.',          dx: -430, dy:    0 },
    { type: 'framework', title: 'Fractal Invariance',       body: 'Strip to skeleton. Rebuild unconventionally.', dx: 430, dy: 0 },
  ];
  const children = seeds.map(s => {
    const n = spawnNode(s.type, CX + s.dx, CY + s.dy, { title: s.title, body: s.body, depth: 1 });
    addConn(root.id, n.id, getRelLabel('concept', s.type)); return n;
  });
  setTimeout(() => {
    addConn(children[0].id, children[5].id, 'fuels');
    addConn(children[1].id, children[4].id, 'pattern of');
    addConn(children[2].id, children[3].id, 'answers');
    addConn(children[6].id, children[5].id, 'resolved by');
    addConn(children[7].id, children[2].id, 'structures');
    setTimeout(() => { resetView(); NX.undoStack = []; NX.redoStack = []; updateUndoBtns(); }, 200);
  }, 300);
}

/* ── Toast ────────────────────────────────────────────────────── */
// Legacy toast() — forwards to mm_toast() for unified queuing system
function toast(msg, dur = 2200) {
  if (typeof mm_toast === 'function') {
    mm_toast(msg, 'info', { dur });
  } else {
    // Ultra-fallback before mm_toast is defined
    const el = document.getElementById('toast');
    if (el) { el.textContent = msg; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), dur); }
  }
}

/* ── Resize ───────────────────────────────────────────────────── */
function resizeAll() {
  ['bg-cvs', 'particle-cvs', 'conn-cvs'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.width = window.innerWidth; el.height = window.innerHeight; }
  });
  const sc = document.getElementById('startup-bg-cvs'); if (sc) { sc.width = window.innerWidth; sc.height = window.innerHeight; }
}
window.addEventListener('resize', resizeAll);

/* ── Init ─────────────────────────────────────────────────────── */
async function init() {
  if (init._ran) return; init._ran = true;
  resizeAll();
  initParticles();
  buildHomepage();
  initStartupBg();

  // MM Foundation: check vault status before anything else
  if (typeof MMVault !== 'undefined') {
    const vaultStatus = MMVault.init();
    if (vaultStatus.meta) {
      MMLog?.info('init', `Vault found for: ${vaultStatus.meta.username}`);
    } else {
      MMLog?.info('init', 'No vault — new user setup required');
    }
  }

  // Load config
  await loadConfig();

  // Load saved theme
  try { const savedTheme = localStorage.getItem('nexus_theme') || NX_CONFIG.theme || 'nexus'; if (THEMES[savedTheme]) applyTheme(savedTheme); } catch(e) {}

  // Electron: listen for config from main
  if (window.NXAPI) {
    window.NXAPI.onConfigLoaded(cfg => {
      NX_CONFIG = cfg;
      if (cfg.dataDir && typeof JAA !== 'undefined') {
        JAA.setDataDir(cfg.dataDir);
        setStartupFolderDisplay(cfg.dataDir);
        updateDataDisplay();
        if (!cfg.firstRun) {
          // Only auto-enter if session is already sealed (noEncryption returning user path)
          // Encrypted users must pass through loginSubmit which seals the session
          if (AUTH._unlocked) { enterFromStartup(); }
          else { startupRoute(); }
        }
      }
    });
  }

  // Non-electron: check localStorage for existing data dir
  if (!window.NXAPI) {
    const savedDir = localStorage.getItem('nexus_datadir');
    if (savedDir) {
      NX_CONFIG.dataDir = savedDir;
      _startupFolder = savedDir;
      setStartupFolderDisplay(savedDir);
      updateDataDisplay();
    }
  }

  requestAnimationFrame(renderLoop);
  updateUndoBtns();
}

// DOMContentLoaded handled by auth system below

// ═══════════════════════════════════════════════════════════════════
// CANVAS BRIDGE — Public API for nexus-engine.js
// All cross-module calls route through window.CANVAS, never direct refs.
// UUID: c3b2a1f0-c4n5-4a6b-8000-canvas000001
// ═══════════════════════════════════════════════════════════════════
window.CANVAS = Object.freeze({
  // ── Lifecycle ─────────────────────────────────────────────────────
  init:         () => init(),

  // ── Node operations ───────────────────────────────────────────────
  spawnNode:    (type, wx, wy, opts) => spawnNode(type, wx, wy, opts),
  addConn:      (fromId, toId, label) => addConn(fromId, toId, label),
  delNode:      (id) => _delNode(id),
  selectNode:   (id, clearFirst) => selectNode(id, clearFirst),
  clearSelection: () => clearSelection(),
  jumpToNode:   (id) => jumpToNode(id),
  getNode:      (id) => NX.nodes.find(n => n.id === id) || null,
  getNodes:     () => [...NX.nodes],
  getConns:     () => [...NX.conns],

  // ── View ──────────────────────────────────────────────────────────
  enterCanvas:  () => enterCanvas(),
  goHome:       () => goHome(),
  resetView:    () => resetView(),
  autoLayout:   () => autoLayout(),
  zoomIn:       () => zoomIn(),
  zoomOut:      () => zoomOut(),
  applyT:       () => applyT(),

  // ── Persistence ───────────────────────────────────────────────────
  saveCanvas:   () => saveCanvas(),
  loadCanvas:   () => loadCanvas(),
  exportJSON:   () => exportJSON(),
  importJSON:   () => importJSON(),
  clearCanvas:  () => _clearHard(),
  seedCanvas:   () => seedCanvas(),

  // ── State snapshot ────────────────────────────────────────────────
  getState:     () => _mmGetState(),

  // ── Live state refs (read-only intent) ───────────────────────────
  get NX()      { return NX; },
  get NT()      { return NT; },
  get DOMAINS() { return DOMAINS; },
  get THEMES()  { return THEMES; },

  // ── Utils (exposed for engine convenience) ────────────────────────
  toast:        (msg, dur) => toast(msg, dur),
  s2w:          (sx, sy) => s2w(sx, sy),
  shortId:      (id) => shortId(id),

  // ── Bridge meta ───────────────────────────────────────────────────
  _id:      'nexus-canvas',
  _version: '3.0.5',
  _uuid:    'c3b2a1f0-c4n5-4a6b-8000-canvas000001',
});

if (typeof MM_BUS !== 'undefined') {
  MM_BUS.emit('mm.module.ready', { module: 'mastermind-canvas', version: '3.0.5' });
}
console.log('[MASTERMIND CANVAS] Bridge ready — window.CANVAS exposed');
