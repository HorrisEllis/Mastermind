// ═══════════════════════════════════════════════════════════════════
// MASTERMIND BACKGROUND — App-wide ambient backdrop
// v2.0.0
//
// Matches the login (startup) screen's look exactly, so the same
// dark radial-gradient + slow hexagon outlines + twinkling stars
// backdrop is used consistently everywhere in the app, not just
// on the unlock screen.
//
// Exposes: window.MMBG = { init(canvas), pulse(x,y), setTheme(t), destroy() }
// (Same public API as before, so every existing call site — homepage,
// canvas, brain map, etc. — keeps working without changes.)
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {

// ── Config ─────────────────────────────────────────────────────────
const CFG = {
  STAR_COUNT:   120,
  SHAPE_COUNT:  6,
  IDLE_THROTTLE: 4,   // render every Nth frame when page hidden
};

// ── Palette (matches mastermind themes) ───────────────────────────
const PALETTES = {
  nexus:      ['#00c8ff','#cc44ff','#00ff88','#ff8c22','#ffffff'],
  erosmancer: ['#ff6a00','#ee0979','#ffd700','#bf5fff','#ffffff'],
  void:       ['#7744ff','#4433bb','#aaeeff','#332288','#ffffff'],
  matrix:     ['#00ff41','#00cc33','#009922','#00ff88','#ffffff'],
  arctic:     ['#00c8ff','#88eeff','#ccf0ff','#0088cc','#ffffff'],
};
const SHAPE_PALETTES = {
  nexus:      ['#00c8ff','#cc44ff','#7744ff','#11ddcc'],
  erosmancer: ['#ff6a00','#ee0979','#bf5fff','#ffd700'],
  void:       ['#7744ff','#4433bb','#9900ff','#332288'],
  matrix:     ['#00ff41','#00cc33','#009922','#00ff88'],
  arctic:     ['#00c8ff','#88eeff','#0088cc','#44bbdd'],
};

// ── State ──────────────────────────────────────────────────────────
let _cvs, _ctx, _W, _H;
let _stars = [];
let _shapes = [];
let _flares = [];   // transient bright bursts from pulse()
let _raf = null;
let _frameCount = 0;
let _hidden = false;
let _theme = 'nexus';
let _destroyed = false;
let _pendingPulses = [];

function _seed() {
  const starPalette = PALETTES[_theme] || PALETTES.nexus;
  _stars = Array.from({ length: CFG.STAR_COUNT }, () => ({
    x: Math.random() * _W, y: Math.random() * _H,
    r: Math.random() * 1.5 + .3, op: Math.random() * .5 + .1,
    vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
    pulse: Math.random() * Math.PI * 2,
    col: starPalette[Math.floor(Math.random() * starPalette.length)],
  }));

  const shapePalette = SHAPE_PALETTES[_theme] || SHAPE_PALETTES.nexus;
  _shapes = Array.from({ length: CFG.SHAPE_COUNT }, (_, i) => ({
    cx: Math.random() * _W, cy: Math.random() * _H,
    r: 60 + Math.random() * 80, sides: 6,
    angle: Math.random() * Math.PI * 2,
    angVel: (Math.random() - .5) * .003,
    col: shapePalette[i % shapePalette.length],
    opacity: .04 + Math.random() * .06,
  }));
}

// ── Render — identical recipe to the login screen ─────────────────
function _render() {
  const ctx = _ctx;

  // Dark radial gradient base
  const grd = ctx.createRadialGradient(_W / 2, _H / 2, 0, _W / 2, _H / 2, _W / 2);
  grd.addColorStop(0, 'rgba(10,20,40,.4)');
  grd.addColorStop(.5, 'rgba(4,10,22,.8)');
  grd.addColorStop(1, 'rgba(2,4,10,1)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, _W, _H);

  // Slow-rotating hexagon outlines
  _shapes.forEach(s => {
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

  // Twinkling stars, drifting and wrapping at edges
  _stars.forEach(s => {
    s.x += s.vx; s.y += s.vy; s.pulse += .015;
    if (s.x < 0) s.x = _W; if (s.x > _W) s.x = 0;
    if (s.y < 0) s.y = _H; if (s.y > _H) s.y = 0;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = s.col; ctx.globalAlpha = s.op * (.6 + .4 * Math.sin(s.pulse));
    ctx.fill(); ctx.globalAlpha = 1;
  });

  // Transient flares from pulse() calls — a brief soft glow, then gone
  if (_flares.length) {
    _flares = _flares.filter(f => f.life > 0);
    _flares.forEach(f => {
      f.life -= 0.02;
      const a = Math.max(0, f.life) * f.strength * 0.5;
      const glowR = 40 + (1 - f.life) * 60;
      const rg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, glowR);
      rg.addColorStop(0, `rgba(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]},${a})`);
      rg.addColorStop(1, `rgba(${f.rgb[0]},${f.rgb[1]},${f.rgb[2]},0)`);
      ctx.beginPath();
      ctx.arc(f.x, f.y, glowR, 0, Math.PI * 2);
      ctx.fillStyle = rg;
      ctx.fill();
    });
  }
}

function _hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}

// ── Frame loop ────────────────────────────────────────────────────
function _loop() {
  if (_destroyed) return;
  _frameCount++;

  if (_hidden && _frameCount % CFG.IDLE_THROTTLE !== 0) {
    _raf = requestAnimationFrame(_loop);
    return;
  }

  while (_pendingPulses.length) {
    const p = _pendingPulses.pop();
    const palette = PALETTES[_theme] || PALETTES.nexus;
    const col = palette[Math.floor(Math.random() * palette.length)];
    _flares.push({ x: p.x, y: p.y, life: 1, strength: p.strength, rgb: _hexToRgb(col) });
  }

  _render();
  _raf = requestAnimationFrame(_loop);
}

// ── Resize ────────────────────────────────────────────────────────
function _resize() {
  if (!_cvs) return;
  _W = _cvs.width  = _cvs.offsetWidth  || window.innerWidth;
  _H = _cvs.height = _cvs.offsetHeight || window.innerHeight;
  _seed();
}

// ── Public API ────────────────────────────────────────────────────
window.MMBG = {
  init(canvas) {
    _cvs = canvas;
    _ctx = _cvs.getContext('2d');
    _W = _cvs.width  = _cvs.offsetWidth  || window.innerWidth;
    _H = _cvs.height = _cvs.offsetHeight || window.innerHeight;

    _seed();

    document.addEventListener('visibilitychange', () => {
      _hidden = document.hidden;
    });

    let _resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(_resize, 120);
    });

    _cvs.addEventListener('click', e => {
      const r = _cvs.getBoundingClientRect();
      _pendingPulses.push({ x: e.clientX - r.left, y: e.clientY - r.top, strength: 0.9 });
    });

    if (_raf) cancelAnimationFrame(_raf);
    _raf = requestAnimationFrame(_loop);
  },

  // Kept for compatibility with existing call sites (node creation,
  // module opens, etc.) — shows as a brief soft flare instead of the
  // old belief-network activation ripple.
  pulse(x, y, strength) {
    _pendingPulses.push({ x, y, strength: strength || 0.7 });
  },

  setTheme(theme) {
    _theme = theme;
    _seed();
  },

  destroy() {
    _destroyed = true;
    if (_raf) cancelAnimationFrame(_raf);
    _raf = null;
  },
};

})();
