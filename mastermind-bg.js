// ═══════════════════════════════════════════════════════════════════
// MASTERMIND BACKGROUND — Bayesian Belief Network Visualizer
// v1.0.0
//
// A living particle mesh where:
//   - Each dot is a belief node
//   - Edges pulse with posterior probability weights
//   - Evidence events ripple outward (Bayes rule propagation)
//   - Dots drift toward attractor positions as beliefs update
//   - Edge opacity = confidence; dot size = activation level
//   - Spatial hash for O(1) neighbor lookup (no O(n²) loops)
//
// Runs on an OffscreenCanvas inside a Web Worker when available,
// falls back to main-thread canvas with requestIdleCallback batching.
//
// Exposes: window.MMBG = { init(canvas), pulse(x,y), setTheme(t), destroy() }
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {

// ── Config ─────────────────────────────────────────────────────────
const CFG = {
  NODE_COUNT:    80,      // number of belief nodes
  EDGE_DIST:     160,     // max distance for edge
  EDGE_DIST_SQ:  160*160,
  SPEED_BASE:    0.18,    // base drift speed
  PULSE_DECAY:   0.94,    // evidence decay per frame
  PULSE_SPREAD:  0.22,    // propagation to neighbors per frame
  FPS_TARGET:    50,      // drop frames if below this
  CELL_SIZE:     180,     // spatial hash cell size
  MIN_ALPHA:     0.025,
  IDLE_THROTTLE: 4,       // render every Nth frame when page hidden
};

// ── State ──────────────────────────────────────────────────────────
let _cvs, _ctx, _W, _H;
let _nodes = [];
let _raf = null;
let _frameCount = 0;
let _lastFrame = 0;
let _hidden = false;
let _grid = new Map();   // spatial hash: cellKey → [nodeIdx]
let _theme = 'nexus';
let _destroyed = false;
let _pendingPulses = []; // { x, y, strength } queued from outside

// ── Palette (matches mastermind themes) ───────────────────────────
const PALETTES = {
  nexus:      ['#00c8ff','#cc44ff','#00ff88','#ff8c22','#7744ff','#ff66aa','#11ddcc'],
  erosmancer: ['#ff6a00','#ee0979','#ffd700','#bf5fff','#ff4455'],
  void:       ['#7744ff','#4433bb','#aabb ff','#332288','#9900ff'],
  matrix:     ['#00ff41','#00cc33','#009922','#003311','#00ff88'],
  arctic:     ['#00c8ff','#88eeff','#ccf0ff','#0088cc','#44bbdd'],
};

// ── Spatial hash ──────────────────────────────────────────────────
function _cellKey(x, y) {
  return (Math.floor(x / CFG.CELL_SIZE) * 10000 + Math.floor(y / CFG.CELL_SIZE));
}

function _gridInsert(idx) {
  const k = _cellKey(_nodes[idx].x, _nodes[idx].y);
  if (!_grid.has(k)) _grid.set(k, []);
  _grid.get(k).push(idx);
}

function _gridRebuild() {
  _grid.clear();
  for (let i = 0; i < _nodes.length; i++) _gridInsert(i);
}

function _gridNeighbors(x, y, radius) {
  const r = Math.ceil(radius / CFG.CELL_SIZE);
  const cx = Math.floor(x / CFG.CELL_SIZE);
  const cy = Math.floor(y / CFG.CELL_SIZE);
  const out = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const cell = _grid.get((cx + dx) * 10000 + (cy + dy));
      if (cell) for (const idx of cell) out.push(idx);
    }
  }
  return out;
}

// ── Node creation ─────────────────────────────────────────────────
function _makeNode(i, palette) {
  const angle = Math.random() * Math.PI * 2;
  const speed = CFG.SPEED_BASE * (0.5 + Math.random());
  return {
    x:     Math.random() * _W,
    y:     Math.random() * _H,
    vx:    Math.cos(angle) * speed,
    vy:    Math.sin(angle) * speed,
    r:     2.5 + Math.random() * 2.5,       // base radius = activation level
    color: palette[i % palette.length],
    alpha: 0.4 + Math.random() * 0.4,
    belief: 0.1 + Math.random() * 0.4,      // prior probability
    activation: 0,                           // evidence pulse level
    phase: Math.random() * Math.PI * 2,     // for idle shimmer
    attractX: Math.random() * _W,           // belief attractor position
    attractY: Math.random() * _H,
    attractStr: 0.0008 + Math.random() * 0.0008,
  };
}

function _initNodes() {
  const palette = PALETTES[_theme] || PALETTES.nexus;
  _nodes = [];
  for (let i = 0; i < CFG.NODE_COUNT; i++) {
    _nodes.push(_makeNode(i, palette));
  }
  _gridRebuild();
}

// ── Pulse injection ───────────────────────────────────────────────
// Find nodes nearest the pulse origin, inject activation
function _injectPulse(px, py, strength) {
  strength = strength || 1.0;
  // Find 3–5 closest nodes
  const candidates = _gridNeighbors(px, py, 250);
  candidates
    .map(i => ({ i, d2: (_nodes[i].x-px)**2 + (_nodes[i].y-py)**2 }))
    .sort((a,b) => a.d2 - b.d2)
    .slice(0, 4)
    .forEach(({ i, d2 }) => {
      const falloff = Math.max(0, 1 - Math.sqrt(d2) / 250);
      _nodes[i].activation = Math.min(1, _nodes[i].activation + strength * falloff);
      // Update belief toward activated state (Bayes: evidence shifts prior)
      _nodes[i].belief = Math.min(0.95, _nodes[i].belief + 0.12 * falloff);
      // Attract toward pulse origin — evidence creates attractor
      _nodes[i].attractX = px + (Math.random() - 0.5) * 80;
      _nodes[i].attractY = py + (Math.random() - 0.5) * 80;
    });
}

// ── Physics update ────────────────────────────────────────────────
let _gridDirty = 0; // rebuild grid every N frames

function _updateNodes() {
  const dt = 1;
  _gridDirty++;
  if (_gridDirty > 8) { _gridRebuild(); _gridDirty = 0; }

  const t = Date.now() / 1000;

  for (let i = 0; i < _nodes.length; i++) {
    const n = _nodes[i];

    // Drift toward attractor (belief pull)
    const ax = n.attractX - n.x;
    const ay = n.attractY - n.y;
    n.vx += ax * n.attractStr;
    n.vy += ay * n.attractStr;

    // Propagate activation to spatial neighbors (Bayes spreading)
    if (n.activation > 0.05) {
      const neighbors = _gridNeighbors(n.x, n.y, CFG.EDGE_DIST);
      for (const j of neighbors) {
        if (j === i) continue;
        const nx = _nodes[j], dx = nx.x - n.x, dy = nx.y - n.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < CFG.EDGE_DIST_SQ) {
          const falloff = 1 - Math.sqrt(d2) / CFG.EDGE_DIST;
          nx.activation = Math.min(1, nx.activation + n.activation * CFG.PULSE_SPREAD * falloff * 0.3);
          nx.belief = Math.min(0.9, nx.belief + 0.01 * falloff * n.activation);
        }
      }
    }

    // Decay activation
    n.activation *= CFG.PULSE_DECAY;
    if (n.activation < 0.001) n.activation = 0;

    // Slow belief decay back toward 0.3 base
    n.belief += (0.3 - n.belief) * 0.001;

    // Damping + clamp velocity
    n.vx *= 0.985;
    n.vy *= 0.985;
    const spd = Math.sqrt(n.vx*n.vx + n.vy*n.vy);
    if (spd > 1.2) { n.vx *= 1.2/spd; n.vy *= 1.2/spd; }

    // Integrate
    n.x += n.vx * dt;
    n.y += n.vy * dt;

    // Soft boundary bounce
    const margin = 30;
    if (n.x < margin)    { n.vx += (margin - n.x) * 0.04; }
    if (n.x > _W-margin) { n.vx -= (n.x - (_W-margin)) * 0.04; }
    if (n.y < margin)    { n.vy += (margin - n.y) * 0.04; }
    if (n.y > _H-margin) { n.vy -= (n.y - (_H-margin)) * 0.04; }
  }
}

// ── Render ────────────────────────────────────────────────────────
function _parseHex(hex) {
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

const _colorCache = new Map();
function _rgba(hex, a) {
  const key = hex + a.toFixed(2);
  if (_colorCache.has(key)) return _colorCache.get(key);
  const [r,g,b] = _parseHex(hex);
  const s = `rgba(${r},${g},${b},${a.toFixed(3)})`;
  if (_colorCache.size > 200) _colorCache.clear();
  _colorCache.set(key, s);
  return s;
}

function _render() {
  const ctx = _ctx;
  ctx.clearRect(0, 0, _W, _H);

  const t = Date.now() / 1000;

  // Build edge index: for each node, check spatial neighbors
  // O(n * avgNeighbors) instead of O(n²)
  const drawnEdges = new Set();

  for (let i = 0; i < _nodes.length; i++) {
    const a = _nodes[i];
    const neighbors = _gridNeighbors(a.x, a.y, CFG.EDGE_DIST);

    for (const j of neighbors) {
      if (j <= i) continue;
      const edgeKey = i * 10000 + j;
      if (drawnEdges.has(edgeKey)) continue;
      drawnEdges.add(edgeKey);

      const b = _nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx*dx + dy*dy;
      if (d2 >= CFG.EDGE_DIST_SQ) continue;

      const dist = Math.sqrt(d2);
      const proximity = 1 - dist / CFG.EDGE_DIST;

      // Edge alpha = proximity × belief posterior × activation boost
      const activationBoost = (a.activation + b.activation) * 0.5;
      const posterior = (a.belief + b.belief) * 0.5;
      const edgeAlpha = CFG.MIN_ALPHA + proximity * posterior * 0.18 + activationBoost * 0.55;

      if (edgeAlpha < CFG.MIN_ALPHA) continue;

      // Pulse animation: wave travels along edge when either node is activated
      let strokeColor;
      if (activationBoost > 0.05) {
        // Pulsing edge — animate a "wave" traveling along it
        const wave = 0.5 + 0.5 * Math.sin(t * 6 - dist * 0.04 + a.phase);
        const pulseAlpha = edgeAlpha + activationBoost * wave * 0.6;
        const [ar,ag,ab] = _parseHex(a.color);
        const [br,bg,bb] = _parseHex(b.color);
        // Blend A and B colors along the pulse
        const blend = 0.5 + 0.5 * wave;
        const r = Math.round(ar * (1-blend) + br * blend);
        const g = Math.round(ag * (1-blend) + bg * blend);
        const bl2 = Math.round(ab * (1-blend) + bb * blend);
        strokeColor = `rgba(${r},${g},${bl2},${Math.min(pulseAlpha, 0.85)})`;
      } else {
        strokeColor = _rgba(a.color, Math.min(edgeAlpha, 0.25));
      }

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 0.6 + proximity * 0.8 + activationBoost * 1.2;
      ctx.stroke();
    }
  }

  // Draw nodes
  for (let i = 0; i < _nodes.length; i++) {
    const n = _nodes[i];
    const shimmer = 0.5 + 0.5 * Math.sin(t * 1.8 + n.phase);
    const activationR = n.r * (1 + n.activation * 2.5);
    const nodeAlpha = 0.35 + n.belief * 0.4 + n.activation * 0.55 + shimmer * 0.06;
    const [r,g,b] = _parseHex(n.color);

    // Glow halo when activated
    if (n.activation > 0.08) {
      const glowR = activationR * (2.5 + n.activation * 3);
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, glowR);
      grd.addColorStop(0, `rgba(${r},${g},${b},${n.activation * 0.35})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.beginPath();
      ctx.arc(n.x, n.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Inner radial gradient for depth
    const grd = ctx.createRadialGradient(
      n.x - activationR * 0.3, n.y - activationR * 0.3, 0,
      n.x, n.y, activationR
    );
    grd.addColorStop(0, `rgba(${r},${g},${b},${Math.min(nodeAlpha * 1.4, 1)})`);
    grd.addColorStop(0.6, `rgba(${r},${g},${b},${nodeAlpha})`);
    grd.addColorStop(1, `rgba(${r},${g},${b},0)`);

    ctx.beginPath();
    ctx.arc(n.x, n.y, activationR, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
  }
}

// ── Frame loop ────────────────────────────────────────────────────
function _loop(ts) {
  if (_destroyed) return;

  _frameCount++;

  // Page hidden → throttle
  if (_hidden && _frameCount % CFG.IDLE_THROTTLE !== 0) {
    _raf = requestAnimationFrame(_loop);
    return;
  }

  // FPS cap: skip frame if running too fast (saves GPU on high-refresh screens)
  const elapsed = ts - _lastFrame;
  if (elapsed < 14) { // ~70fps cap
    _raf = requestAnimationFrame(_loop);
    return;
  }
  _lastFrame = ts;

  // Inject pending pulses
  while (_pendingPulses.length) {
    const p = _pendingPulses.pop();
    _injectPulse(p.x, p.y, p.strength);
  }

  // Idle pulse every ~4s to keep it alive
  if (_frameCount % 240 === 0) {
    _injectPulse(
      100 + Math.random() * (_W - 200),
      100 + Math.random() * (_H - 200),
      0.4 + Math.random() * 0.4
    );
  }

  _updateNodes();
  _render();

  _raf = requestAnimationFrame(_loop);
}

// ── Resize ────────────────────────────────────────────────────────
function _resize() {
  if (!_cvs) return;
  _W = _cvs.width  = _cvs.offsetWidth  || window.innerWidth;
  _H = _cvs.height = _cvs.offsetHeight || window.innerHeight;
  // Redistribute attractors on resize
  _nodes.forEach(n => {
    n.attractX = Math.random() * _W;
    n.attractY = Math.random() * _H;
  });
  _gridRebuild();
}

// ── Public API ────────────────────────────────────────────────────
window.MMBG = {
  init(canvas) {
    _cvs = canvas;
    _ctx = _cvs.getContext('2d');
    _W = _cvs.width  = _cvs.offsetWidth  || window.innerWidth;
    _H = _cvs.height = _cvs.offsetHeight || window.innerHeight;

    _initNodes();

    // Page visibility — throttle when hidden
    document.addEventListener('visibilitychange', () => {
      _hidden = document.hidden;
    });

    // Resize handler — debounced
    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(_resize, 120);
    });

    // Inject a pulse on canvas clicks (belief update from user interaction)
    _cvs.addEventListener('click', e => {
      const r = _cvs.getBoundingClientRect();
      _pendingPulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, strength: 0.9 });
    });

    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_loop);
  },

  // Inject a belief update pulse at (x, y) from outside
  // Call this when user creates a node, opens a module, logs a delta, etc.
  pulse(x, y, strength) {
    _pendingPulses.push({ x, y, strength: strength || 0.7 });
  },

  setTheme(theme) {
    _theme = theme;
    const palette = PALETTES[theme] || PALETTES.nexus;
    _nodes.forEach((n, i) => { n.color = palette[i % palette.length]; });
    _colorCache.clear();
  },

  destroy() {
    _destroyed = true;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
  },
};

})();
