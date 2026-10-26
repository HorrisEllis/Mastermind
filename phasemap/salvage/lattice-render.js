// ═══ SALVAGED FROM NEXUS v7 (mastermind_old/index.html) ═══
// Reference only. Not wired. See phasemap/PHASEMAP.md P3-UI.

// ── LATTICE CANVAS + PHYSICS + RENDER LOOP — original lines 7630-7760 ──
}

// ════════════════════════════════════════════════════════════════════════
// LATTICE — force-directed graph
// ════════════════════════════════════════════════════════════════════════
const VL_TAG_COL = {
  SYS:'#00c8ff', REL:'#11ddcc', GAP:'#ff3355',
  LOOP:'#cc44ff', BLOCK:'#ff8c22', SEED:'#00ff88', FRICTION:'#ffe04a',
};

function _vlInitLattice() {
  const cvs = document.getElementById('vl-lattice-cvs');
  if (!cvs || VL.lat.cvs) return;
  VL.lat.cvs = cvs;
  VL.lat.ctx = cvs.getContext('2d');

  function resize() {
    cvs.width  = cvs.clientWidth;
    cvs.height = cvs.clientHeight;
  }
  resize();
  new ResizeObserver(resize).observe(cvs.parentElement);

  // Mouse events
  cvs.addEventListener('mousedown', e => {
    const p = _vlMP(e);
    const hit = VL.nodes.find(n => Math.hypot(n.lx - p.x, n.ly - p.y) < _vlNodeR(n) + 4);
    if (hit) {
      VL.lat.dragging = hit;
      VL.lat.dragOX   = p.x - hit.lx;
      VL.lat.dragOY   = p.y - hit.ly;
      cvs.style.cursor = 'grabbing';
    }
  });
  cvs.addEventListener('mousemove', e => {
    const p = _vlMP(e);
    if (VL.lat.dragging) {
      VL.lat.dragging.lx = p.x - VL.lat.dragOX;
      VL.lat.dragging.ly = p.y - VL.lat.dragOY;
      VL.lat.dragging.vx = 0; VL.lat.dragging.vy = 0;
    } else {
      const hit = VL.nodes.find(n => Math.hypot(n.lx - p.x, n.ly - p.y) < _vlNodeR(n) + 4);
      VL.lat.hoverId = hit ? hit.id : null;
      cvs.style.cursor = hit ? 'pointer' : 'default';
    }
  });
  cvs.addEventListener('mouseup', () => { VL.lat.dragging = null; cvs.style.cursor = 'default'; });
  cvs.addEventListener('click', e => {
    if (VL.lat.dragging) return;
    const p = _vlMP(e);
    const hit = VL.nodes.find(n => Math.hypot(n.lx - p.x, n.ly - p.y) < _vlNodeR(n) + 4);
    if (hit) vlSelectNode(hit.id);
  });

  _vlLatticeLoop();
}

function _vlMP(e) {
  const r = VL.lat.cvs.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function _vlNodeR(n) { return n.seedFlag ? 18 : 14; }

function _vlLatticeLoop() {
  VL.lat.raf = requestAnimationFrame(_vlLatticeLoop);
  const cvs = VL.lat.cvs, ctx = VL.lat.ctx;
  if (!cvs || !ctx) return;
  const W = cvs.width, H = cvs.height;
  if (!W || !H) return;

  // ── Physics ────────────────────────────────────────────────────────
  const ns = VL.nodes;
  ns.forEach(n => {
    if (VL.lat.dragging?.id === n.id) return;
    let fx = (W / 2 - n.lx) * 0.004;  // center gravity
    let fy = (H / 2 - n.ly) * 0.004;
    // Repulsion
    ns.forEach(m => {
      if (m.id === n.id) return;
      const dx = n.lx - m.lx, dy = n.ly - m.ly;
      const d  = Math.max(Math.hypot(dx, dy), 1);
      const f  = 2400 / (d * d);
      fx += (dx / d) * f; fy += (dy / d) * f;
    });
    // Spring attraction on associations
    n.associations.forEach(aid => {
      const m = ns.find(x => x.id === aid);
      if (!m) return;
      const dx = m.lx - n.lx, dy = m.ly - n.ly;
      const d  = Math.max(Math.hypot(dx, dy), 1);
      const f  = (d - 130) * 0.014;
      fx += (dx / d) * f; fy += (dy / d) * f;
    });
    n.vx = (n.vx + fx) * 0.80;
    n.vy = (n.vy + fy) * 0.80;
    n.lx = Math.max(24, Math.min(W - 24, n.lx + n.vx));
    n.ly = Math.max(24, Math.min(H - 24, n.ly + n.vy));
  });

  // ── Draw ──────────────────────────────────────────────────────────
  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = 'rgba(24,44,66,.3)'; ctx.lineWidth = .5;
  for (let x = 0; x < W; x += 44) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Edges (associations)
  const drawn = new Set();
  ns.forEach(n => {
    n.associations.forEach(aid => {
      const key = [n.id, aid].sort().join('|');
      if (drawn.has(key)) return;
      drawn.add(key);
      const m = ns.find(x => x.id === aid);
      if (!m) return;
      const col  = VL_TAG_COL[n.tags[0]] || '#4a7898';
      const alpha = Math.min(0.4, 0.08 + n.associations.length * 0.06);
      ctx.strokeStyle = col + Math.round(alpha * 255).toString(16).padStart(2,'0');
      ctx.lineWidth   = 1;
      ctx.beginPath(); ctx.moveTo(n.lx, n.ly); ctx.lineTo(m.lx, m.ly); ctx.stroke();
    });
  });

  // Nodes
  ns.forEach(n => {
    const col  = VL_TAG_COL[n.tags[0]] || '#4a7898';
    const r    = _vlNodeR(n);
    const isSel = VL.selectedId   === n.id;
    const isHov = VL.lat.hoverId  === n.id;


// ── WAVEFORM DRAW — original lines 7240-7285 ──
    qlbl.textContent = 'TAP TO CAPTURE VOICE';
    VL.quickRecognition = null;
  };
  r.onerror = e => { toast('Mic: ' + e.error); };
  try { r.start(); } catch(e) { toast('Mic error: ' + e.message); VL.quickActive = false; qrow.classList.remove('vl-qrec'); }
  VL.quickRecognition = r;
}

// ── Waveform ──────────────────────────────────────────────────────────
let _vlAudioCtx = null, _vlAnalyser = null, _vlWaveRAF = null, _vlStream = null;

function _vlStartWave() {
  const cvs = document.getElementById('vl-wave-cvs');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  // Set canvas dimensions to match CSS
  cvs.width  = cvs.clientWidth  || 300;
  cvs.height = cvs.clientHeight || 44;
  const W = cvs.width, H = cvs.height;

  navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
    _vlStream = stream;
    _vlAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _vlAnalyser = _vlAudioCtx.createAnalyser();
    _vlAnalyser.fftSize = 128;
    _vlAudioCtx.createMediaStreamSource(stream).connect(_vlAnalyser);
    const buf = new Uint8Array(_vlAnalyser.frequencyBinCount);
    function draw() {
      _vlWaveRAF = requestAnimationFrame(draw);
      _vlAnalyser.getByteTimeDomainData(buf);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,200,255,.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      const sw = W / buf.length;
      buf.forEach((v, i) => {
        const y = (v / 128) * (H / 2);
        i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sw, y);
      });
      ctx.stroke();
    }
    draw();
  }).catch(() => {
    // draw silent line
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0,0,W,H);

