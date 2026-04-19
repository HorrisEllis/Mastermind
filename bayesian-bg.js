// ═══════════════════════════════════════════════════════════════════
// MASTERMIND — BAYESIAN FIELD BACKGROUND  v1.0
// 
// Architecture: Particle mesh where each node IS a belief.
// Edges = conditional probabilities. Evidence propagates as ripples.
// 
// Physics:
//   - Particles have belief strength (0→1), updating mass
//   - Edges have confidence weights (Bayesian posterior)
//   - Evidence injection creates ripple: P(H|E) ∝ P(E|H)·P(H)
//   - Particles drift toward high-confidence attractors
//   - Low-confidence particles fade and respawn at boundary
//   - Spatial hash for O(1) neighbor queries (no O(n²) loops)
//   - Entire system runs on OffscreenCanvas in a Worker thread
//
// Exposed: window.BAYESIAN_BG = { inject(evidence), setTheme(name), pause(), resume() }
// ═══════════════════════════════════════════════════════════════════

(function() {
'use strict';

const WORKER_CODE = `
'use strict';

// ── Spatial hash grid ──────────────────────────────────────────────
function SpatialHash(cellSize) {
  this.cs = cellSize;
  this.map = new Map();
}
SpatialHash.prototype.key = function(x, y) {
  return (Math.floor(x/this.cs) * 73856093 ^ Math.floor(y/this.cs) * 19349663) | 0;
};
SpatialHash.prototype.insert = function(id, x, y) {
  const k = this.key(x, y);
  if (!this.map.has(k)) this.map.set(k, []);
  this.map.get(k).push(id);
};
SpatialHash.prototype.query = function(x, y, r) {
  const result = [];
  const cx0 = Math.floor((x-r)/this.cs), cx1 = Math.floor((x+r)/this.cs);
  const cy0 = Math.floor((y-r)/this.cs), cy1 = Math.floor((y+r)/this.cs);
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const k = (cx * 73856093 ^ cy * 19349663) | 0;
      const bucket = this.map.get(k);
      if (bucket) for (const id of bucket) result.push(id);
    }
  }
  return result;
};
SpatialHash.prototype.clear = function() { this.map.clear(); };

// ── Particle system ────────────────────────────────────────────────
const MAX_NODES = 120;
const MAX_EDGES = 200;
const EDGE_RADIUS = 160;   // max distance to form an edge

let W = 1920, H = 1080;
let theme = { bg: '#02040a', node: '#00c8ff', edge: '#00c8ff', accent: '#cc44ff' };
let nodes = [], edges = [];
let hash = new SpatialHash(EDGE_RADIUS);
let t = 0;
let running = true;

function rand(a, b) { return a + Math.random() * (b - a); }
function lerp(a, b, t) { return a + (b - a) * t; }

function makeNode(x, y) {
  return {
    x: x ?? rand(0, W),
    y: y ?? rand(0, H),
    vx: rand(-0.3, 0.3),
    vy: rand(-0.3, 0.3),
    belief: rand(0.3, 1.0),    // prior probability
    age: 0,
    maxAge: rand(600, 1800),   // frames
    mass: 1,
    cluster: Math.floor(rand(0, 5)),
    r: rand(1.5, 3.5),
    phase: rand(0, Math.PI * 2),
  };
}

function initNodes() {
  nodes = [];
  for (let i = 0; i < MAX_NODES; i++) nodes.push(makeNode());
}

// Cluster attractor positions — beliefs converge toward conceptual poles
const ATTRACTORS = [
  { x: 0.2, y: 0.3, strength: 0.0004 },
  { x: 0.8, y: 0.3, strength: 0.0004 },
  { x: 0.5, y: 0.6, strength: 0.0003 },
  { x: 0.15, y: 0.7, strength: 0.0003 },
  { x: 0.85, y: 0.7, strength: 0.0003 },
];

// ── Bayesian update: inject evidence ─────────────────────────────
// Evidence at (ex, ey) with strength s propagates as P(H|E) update
const pendingEvidence = [];
function injectEvidence(ex, ey, strength) {
  pendingEvidence.push({ x: ex, y: ey, s: strength, r: 0, maxR: EDGE_RADIUS * 2 });
}

function processEvidence() {
  for (let i = pendingEvidence.length - 1; i >= 0; i--) {
    const e = pendingEvidence[i];
    e.r += 8; // wavefront expansion
    if (e.r > e.maxR) { pendingEvidence.splice(i, 1); continue; }

    // Update beliefs of nodes inside wavefront ring
    const ringInner = e.r - 12, ringOuter = e.r + 12;
    for (const n of nodes) {
      const dx = n.x - e.x, dy = n.y - e.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d >= ringInner && d <= ringOuter) {
        // Bayes: posterior ∝ likelihood × prior
        // Simplified: belief update proportional to proximity × strength
        const likelihood = e.s * Math.exp(-d / (EDGE_RADIUS));
        n.belief = Math.min(1, n.belief + likelihood * 0.15 * (1 - n.belief));
        n.vx += (dx / d) * e.s * 0.1;
        n.vy += (dy / d) * e.s * 0.1;
      }
    }
  }
}

// ── Rebuild edges when topology changes ──────────────────────────
let edgeDirty = true;
function rebuildEdges() {
  edges = [];
  hash.clear();
  for (let i = 0; i < nodes.length; i++) hash.insert(i, nodes[i].x, nodes[i].y);
  for (let i = 0; i < nodes.length; i++) {
    const candidates = hash.query(nodes[i].x, nodes[i].y, EDGE_RADIUS);
    for (const j of candidates) {
      if (j <= i) continue;
      const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d < EDGE_RADIUS && edges.length < MAX_EDGES) {
        // Edge confidence = geometric mean of endpoint beliefs
        const confidence = Math.sqrt(nodes[i].belief * nodes[j].belief);
        edges.push({ a: i, b: j, d, confidence, phase: rand(0, Math.PI*2) });
      }
    }
  }
  edgeDirty = false;
}

// ── Physics tick ─────────────────────────────────────────────────
let ticksSinceRebuild = 0;
function tick() {
  t++;
  ticksSinceRebuild++;

  processEvidence();

  // Rebuild edge graph every 90 frames
  if (ticksSinceRebuild > 90 || edgeDirty) {
    rebuildEdges();
    ticksSinceRebuild = 0;
  }

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    n.age++;

    // Attractor drift — high-belief nodes drawn more strongly
    const att = ATTRACTORS[n.cluster % ATTRACTORS.length];
    const ax = att.x * W - n.x, ay = att.y * H - n.y;
    n.vx += ax * att.strength * n.belief;
    n.vy += ay * att.strength * n.belief;

    // Gentle Brownian noise
    n.vx += (Math.random() - 0.5) * 0.04;
    n.vy += (Math.random() - 0.5) * 0.04;

    // Damping
    n.vx *= 0.98;
    n.vy *= 0.98;

    // Speed limit
    const spd = Math.sqrt(n.vx*n.vx + n.vy*n.vy);
    if (spd > 1.2) { n.vx = n.vx/spd * 1.2; n.vy = n.vy/spd * 1.2; }

    n.x += n.vx;
    n.y += n.vy;

    // Soft boundary: wrap with fade
    if (n.x < -40) n.x = W + 40;
    if (n.x > W + 40) n.x = -40;
    if (n.y < -40) n.y = H + 40;
    if (n.y > H + 40) n.y = -40;

    // Belief decay toward prior over time (regression to mean)
    n.belief = lerp(n.belief, 0.5, 0.0002);

    // Respawn low-belief old nodes
    if (n.age > n.maxAge && n.belief < 0.25) {
      nodes[i] = makeNode();
      edgeDirty = true;
    }
  }
}

// ── Render ────────────────────────────────────────────────────────
function render(ctx) {
  ctx.clearRect(0, 0, W, H);

  const tSec = t / 60;

  // ── Draw edges ──────────────────────────────────────────────────
  for (const e of edges) {
    const na = nodes[e.a], nb = nodes[e.b];
    // Edge pulse: confidence-modulated alpha + flow particle
    const pulse = (Math.sin(tSec * 1.4 + e.phase) + 1) * 0.5;
    const alpha = e.confidence * (0.06 + pulse * 0.08);

    ctx.strokeStyle = theme.edge + Math.round(alpha * 255).toString(16).padStart(2,'0');
    ctx.lineWidth = 0.5 + e.confidence * 0.8;
    ctx.beginPath(); ctx.moveTo(na.x, na.y); ctx.lineTo(nb.x, nb.y); ctx.stroke();

    // Flow particle along edge — shows information propagation direction
    if (e.confidence > 0.6) {
      const p = ((tSec * 0.3 + e.phase) % 1);
      const px = na.x + (nb.x - na.x) * p, py = na.y + (nb.y - na.y) * p;
      const dotAlpha = e.confidence * 0.5 * pulse;
      ctx.fillStyle = theme.node + Math.round(dotAlpha * 255).toString(16).padStart(2,'0');
      ctx.beginPath(); ctx.arc(px, py, 1.2, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Draw evidence ripples ───────────────────────────────────────
  for (const e of pendingEvidence) {
    const alpha = (1 - e.r / e.maxR) * 0.3;
    ctx.strokeStyle = theme.accent + Math.round(alpha * 255).toString(16).padStart(2,'0');
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2); ctx.stroke();
    // Inner ring
    if (e.r > 20) {
      const a2 = alpha * 0.4;
      ctx.strokeStyle = theme.node + Math.round(a2*255).toString(16).padStart(2,'0');
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.6, 0, Math.PI*2); ctx.stroke();
    }
  }

  // ── Draw nodes ──────────────────────────────────────────────────
  for (const n of nodes) {
    const ageFade = Math.min(1, n.age / 60) * Math.min(1, (n.maxAge - n.age) / 60);
    const glow = n.belief * ageFade;
    const pulse = 0.7 + 0.3 * Math.sin(tSec * 2 + n.phase);
    const alpha = glow * pulse;
    if (alpha < 0.01) continue;

    const r = n.r * (0.8 + n.belief * 0.4);

    // Glow aura for high-belief nodes
    if (n.belief > 0.6) {
      const auraAlpha = (n.belief - 0.6) / 0.4 * 0.12 * pulse;
      ctx.fillStyle = theme.node + Math.round(auraAlpha*255).toString(16).padStart(2,'0');
      ctx.beginPath(); ctx.arc(n.x, n.y, r * 4, 0, Math.PI*2); ctx.fill();
    }

    ctx.fillStyle = theme.node + Math.round(alpha*255).toString(16).padStart(2,'0');
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI*2); ctx.fill();
  }
}

// ── Message handler ───────────────────────────────────────────────
let offscreen = null;
let ctx = null;
let rafId = null;

function frame() {
  if (!running) return;
  tick();
  if (ctx) render(ctx);
  rafId = setTimeout(frame, 33); // ~30fps for background layer
}

self.onmessage = function(e) {
  const msg = e.data;
  switch(msg.type) {
    case 'init':
      offscreen = msg.canvas;
      ctx = offscreen.getContext('2d');
      W = msg.w; H = msg.h;
      initNodes();
      rebuildEdges();
      frame();
      break;
    case 'resize':
      W = msg.w; H = msg.h;
      if (offscreen) { offscreen.width = W; offscreen.height = H; }
      break;
    case 'evidence':
      injectEvidence(msg.x, msg.y, msg.strength || 0.8);
      break;
    case 'theme':
      Object.assign(theme, msg.theme);
      break;
    case 'pause':
      running = false;
      if (rafId) clearTimeout(rafId);
      break;
    case 'resume':
      if (!running) { running = true; frame(); }
      break;
    case 'setCount':
      while (nodes.length < msg.count) nodes.push(makeNode());
      while (nodes.length > msg.count) nodes.pop();
      edgeDirty = true;
      break;
  }
};
`;

// ── Main thread: create worker + canvas overlay ──────────────────
let _worker = null;
let _canvas = null;
let _active = false;

function _boot() {
  if (_active) return;

  // Create fullscreen canvas overlay (behind everything)
  _canvas = document.createElement('canvas');
  _canvas.id = 'bayesian-bg-cvs';
  _canvas.style.cssText = [
    'position:fixed;inset:0;width:100%;height:100%;',
    'pointer-events:none;z-index:0;',
    'opacity:0.65;',  // subtle — this is a background
  ].join('');
  document.body.insertBefore(_canvas, document.body.firstChild);

  const W = window.innerWidth, H = window.innerHeight;
  _canvas.width = W; _canvas.height = H;

  // Try OffscreenCanvas (Chrome/Electron) — falls back to main thread
  if (_canvas.transferControlToOffscreen) {
    const offscreen = _canvas.transferControlToOffscreen();
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    _worker = new Worker(url);
    _worker.postMessage({ type: 'init', canvas: offscreen, w: W, h: H }, [offscreen]);
    URL.revokeObjectURL(url);
  } else {
    // Fallback: run on main thread with degraded node count
    _runMainThread(W, H);
  }

  // Resize handler
  window.addEventListener('resize', () => {
    const nW = window.innerWidth, nH = window.innerHeight;
    if (_worker) _worker.postMessage({ type: 'resize', w: nW, h: nH });
  });

  // Click/canvas event → inject evidence (Bayesian update on interaction)
  document.addEventListener('click', e => {
    // Only inject if clicking on background-ish areas, not nodes
    if (e.target.closest('.node, .startup-inner, #topbar, #side-panel')) return;
    window.BAYESIAN_BG.inject(e.clientX, e.clientY, 0.9);
  }, { passive: true });

  // MM_BUS integration — node spawns trigger evidence waves
  if (typeof MM_BUS !== 'undefined') {
    MM_BUS.on('mm.node.spawned', d => {
      // Convert canvas world coords to screen
      if (d && d.x != null && typeof NX !== 'undefined') {
        const sx = d.x * NX.zoom + NX.panX;
        const sy = d.y * NX.zoom + NX.panY;
        window.BAYESIAN_BG.inject(sx, sy + 38, 0.7);
      }
    });
    MM_BUS.on('mm.whatif.loop.progress', d => {
      // Each recursive branch emits a pulse at random position
      window.BAYESIAN_BG.inject(
        Math.random() * window.innerWidth,
        Math.random() * window.innerHeight,
        0.5
      );
    });
  }

  _active = true;
}

// ── Main thread fallback (no OffscreenCanvas) ─────────────────────
function _runMainThread(W, H) {
  // Minimal implementation with reduced node count for performance
  const ctx = _canvas.getContext('2d');
  const nodes = [];
  const COUNT = 60; // fewer nodes on main thread
  for (let i = 0; i < COUNT; i++) {
    nodes.push({
      x: Math.random()*W, y: Math.random()*H,
      vx: (Math.random()-.5)*.3, vy: (Math.random()-.5)*.3,
      belief: Math.random()*.5+.3, r: Math.random()*2+1.2,
      phase: Math.random()*Math.PI*2,
    });
  }
  let t = 0;
  function frame() {
    t++;
    ctx.clearRect(0,0,W,H);
    const tSec = t/60;
    // Draw connections
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i+1; j < nodes.length; j++) {
        const dx=nodes[i].x-nodes[j].x, dy=nodes[i].y-nodes[j].y;
        const d=Math.sqrt(dx*dx+dy*dy);
        if(d<120) {
          const a=(1-d/120)*Math.sqrt(nodes[i].belief*nodes[j].belief)*0.12;
          ctx.strokeStyle='rgba(0,200,255,'+a+')';
          ctx.lineWidth=0.5;
          ctx.beginPath();ctx.moveTo(nodes[i].x,nodes[i].y);ctx.lineTo(nodes[j].x,nodes[j].y);ctx.stroke();
        }
      }
    }
    // Draw nodes
    for (const n of nodes) {
      n.vx+=(Math.random()-.5)*.03; n.vy+=(Math.random()-.5)*.03;
      n.vx*=.98; n.vy*=.98;
      n.x+=n.vx; n.y+=n.vy;
      if(n.x<0)n.x=W; if(n.x>W)n.x=0; if(n.y<0)n.y=H; if(n.y>H)n.y=0;
      const a=n.belief*(0.7+0.3*Math.sin(tSec*2+n.phase));
      ctx.fillStyle='rgba(0,200,255,'+(a*0.6)+')';
      ctx.beginPath();ctx.arc(n.x,n.y,n.r,0,Math.PI*2);ctx.fill();
    }
    setTimeout(frame, 40); // ~25fps on main thread
  }
  frame();
}

// ── Public API ───────────────────────────────────────────────────
window.BAYESIAN_BG = {
  inject(x, y, strength = 0.8) {
    if (_worker) _worker.postMessage({ type: 'evidence', x, y, strength });
  },
  setTheme(themeObj) {
    if (_worker) _worker.postMessage({ type: 'theme', theme: themeObj });
  },
  pause()  { if (_worker) _worker.postMessage({ type: 'pause' }); },
  resume() { if (_worker) _worker.postMessage({ type: 'resume' }); },
  setNodeCount(n) { if (_worker) _worker.postMessage({ type: 'setCount', count: n }); },
  setOpacity(v)   { if (_canvas) _canvas.style.opacity = v; },
  boot: _boot,
};

// ── Auto-boot after DOM ready ─────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(_boot, 800));
} else {
  setTimeout(_boot, 800);
}

})(); // end IIFE
