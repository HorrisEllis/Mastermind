// ── Void mode tab system ─────────────────────────────────────────
const VOID_MODE_COLORS = {
  create:  { color: '#ff8c22', label: '◈ CREATE' },
  expand:  { color: '#cc44ff', label: '✦ EXPAND' },
  express: { color: '#ff66aa', label: '♥ EXPRESS' },
  bridge:  { color: '#00c8ff', label: '⬡ BRIDGE' },
  log:     { color: '#00ff88', label: 'Δ LOG' },
};
let _voidCurrentMode = 'create';

function voidSetMode(mode) {
  _voidCurrentMode = mode;
  const mc = VOID_MODE_COLORS[mode] || VOID_MODE_COLORS.create;

  // Update tab styles
  Object.keys(VOID_MODE_COLORS).forEach(m => {
    const tab = document.getElementById('vtab-' + m);
    if (!tab) return;
    const mc2 = VOID_MODE_COLORS[m];
    if (m === mode) {
      tab.style.color = mc2.color;
      tab.style.borderBottomColor = mc2.color;
      tab.style.background = mc2.color.replace('#', 'rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i, (_, r,g,b) =>
        `${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)}) `) + '.06)';
    } else {
      tab.style.color = 'var(--dim)';
      tab.style.borderBottomColor = 'transparent';
      tab.style.background = 'transparent';
    }
  });

  // Show/hide sections by data-void-mode
  const scrollable = document.querySelector('#void-overlay > div[style*="overflow-y:auto"]');
  if (!scrollable) return;

  // All sections with data-void-mode
  scrollable.querySelectorAll('[data-void-mode]').forEach(el => {
    const modes = el.getAttribute('data-void-mode').split(' ');
    el.style.display = modes.includes(mode) ? '' : 'none';
  });

  // LOG mode: show the combined log
  const logSection = document.getElementById('void-log-section');
  if (logSection) {
    logSection.style.display = mode === 'log' ? '' : 'none';
    if (mode === 'log') _voidRenderLog();
  }

  // Update header gradient to match mode
  const voidHeader = document.querySelector('#void-overlay > div:first-child > div > div:first-child');
  if (voidHeader) {
    voidHeader.style.backgroundImage = `linear-gradient(135deg, ${mc.color}, ${mc.color}88)`;
  }

  try { localStorage.setItem('mm_void_mode', mode); } catch(e) {}
}

function _voidRenderLog() {
  const el = document.getElementById('void-log-content');
  if (!el) return;
  const allItems = [
    ...(VOID_STATE.seeds || []).map(s => ({ ...s, logType: 'seed' })),
    ...(VOID_STATE.openLoops || []).map(l => ({ ...l, logType: 'loop' })),
    ...(VOID_STATE.whatIfs || []).map(w => ({ ...w, logType: 'whatif' })),
    ...(VOID_STATE.createLog || []).map(c => ({ ...c, logType: 'create' })),
    ...(VOID_STATE.expressLog || []).map(e => ({ ...e, logType: 'express' })),
    ...(VOID_STATE.primingLog || []).map(p => ({ ...p, logType: 'priming' })),
  ].sort((a, b) => (b.created || b.ts || 0) - (a.created || a.ts || 0));

  const typeColors = {
    seed:'#00ff88', loop:'#ff8c22', whatif:'#cc44ff',
    create:'#ff8c22', express:'#ff66aa', priming:'#7744ff',
  };

  el.innerHTML = allItems.slice(0, 60).map(item => {
    const tc = typeColors[item.logType] || '#00c8ff';
    const text = item.text || item.content || item.note || '';
    const ts = item.created || item.ts || 0;
    return `<div style="padding:9px 12px;border-left:2px solid ${tc};
      background:rgba(0,0,0,.25);display:flex;gap:10px;align-items:flex-start">
      <span style="font-family:var(--f-mono);font-size:6.5px;color:${tc};
        border:1px solid ${tc}44;padding:1px 5px;flex-shrink:0">${item.logType}</span>
      <span style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);
        flex:1;line-height:1.5">${escH(text)}</span>
      <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);flex-shrink:0">
        ${ts ? new Date(ts).toLocaleDateString() : ''}</span>
    </div>`;
  }).join('') || '<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);padding:16px">Nothing logged yet.</div>';
}

// ═══════════════════════════════════════════════════════════════════
// MASTERMIND ENGINE
// Application modules: Auth (hardened), Vault, Wizard, Options, AI,
// Void, GAP, Signal, Threads, Body, BrainMap, Horizon, ALM, Toast,
// Feature gates, Welcome, Domain taxonomy.
//
// Depends on: mastermind-siso-jaa.js, mastermind-foundation.js,
//             nexus-canvas.js (window.CANVAS bridge required)
// Load order: LAST — after all dependencies
//
// Canvas access: always via window.CANVAS.* — never direct calls
// UUID: e6d5c4b3-e7n8-4i9n-8000-engine000001
//
// Product version lives in ONE place: package.json. Everything that
// displays it (titlebar, homepage, About panel, vault byline, bridge
// registration) reads it once at boot via mmApplyVersion() below and
// fills in from there — see MM_VERSION. Do not hardcode a version
// number anywhere else in this file; that's exactly how it drifted
// into five different numbers before.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ── CANVAS DEPENDENCY GUARD ──────────────────────────────────────────
// nexus-canvas.js must be loaded before this file.
// Hard fail with visible error if bridge is missing.
(function() {
  if (typeof window.CANVAS === 'undefined') {
    const msg = '[MASTERMIND ENGINE] FATAL: window.CANVAS bridge not found. ' +
      'Ensure nexus-canvas.js loads BEFORE nexus-engine.js.';
    console.error(msg);
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML =
        '<div style="position:fixed;inset:0;display:flex;align-items:center;' +
        'justify-content:center;background:#02040a;color:#ff3355;' +
        'font-family:monospace;font-size:13px;padding:40px;text-align:center">' +
        'CANVAS MODULE MISSING<br><br>' +
        'Place nexus-canvas.js in the same folder and ensure it loads ' +
        'before nexus-engine.js in index-browser.html' +
        '</div>';
    });
    throw new Error(msg);
  }
})();



/* ═══════════════════════════════════════════════════════════════════
   SPATIAL VOID ENGINE — Creativity Suite
═══════════════════════════════════════════════════════════════════ */

/* ── View Navigation ──────────────────────────────────────────── */
function enterVoid() {
  if (!_assertAuth()) return;
  const onCanvas = document.getElementById('tb-canvas-tools')?.style.display === 'flex';
  CANVAS.NX._voidPrev = onCanvas ? 'canvas' : 'home';
  mm_toast('Spatial Void · Perfection is banned here', 'info', { dur: 2200 });
  document.getElementById('startup-screen').classList.add('hidden');
  document.getElementById('homepage').classList.add('hidden');
  const vo = document.getElementById('void-overlay');
  vo.classList.add('open');
  vo.style.display = 'flex';
  vo.style.opacity = '1';
  // Restore last mode
  const _vm = (function(){ try{return localStorage.getItem('mm_void_mode')||'create';}catch(e){return 'create';} })();
  setTimeout(() => { if (typeof voidSetMode === 'function') voidSetMode(_vm); }, 100);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'void' });
  initVoid();
}

function closeVoid() {
  saveVoidState();
  const v = document.getElementById('void-overlay');
  v.style.opacity = '0';
  v.style.pointerEvents = 'none'; // stop catching clicks immediately, not 400ms from now
  setTimeout(() => {
    // Clear, never set: an inline display:none outlives the class and the
    // overlay can never be reopened.
    v.classList.remove('open'); v.style.display = ''; v.style.pointerEvents = '';
    if (CANVAS.NX._voidPrev === 'canvas') {
      document.getElementById('homepage').classList.add('hidden');
      ['topbar','canvas-wrap','toolbar','minimap','zoom-widget','layer-controls','help-hint'].forEach(id => {
        document.getElementById(id)?.classList.add('visible');
      });
    } else {
      document.getElementById('homepage').classList.remove('hidden'); document.getElementById('homepage').scrollTop = 0;
    }
  }, 400);
}

/* ═══════════════════════════════════════════════════════════════════
   SPATIAL VOID + CREATIVE TOOLKIT  (Unified Module)
   Sections: Seeds/Loops · What-ifs · Create · Express · Bridge · Priming
   All actions emit SISO MM_BUS events. State persists via localStorage.
═══════════════════════════════════════════════════════════════════ */

const VOID_KEY = 'nexus_void_state';

const VOID_STATE = {
  seeds: [], openLoops: [], whatifs: [],
  createLog: [], expressLog: [], bridges: [],
  primeLog: [], flowMethod: null, constraints: [],
  conditions: [], causalChain: [], horizonItems: [],
  endStateFields: {},
  nervousSystem: 'ventral', intuitionType: null,
  somaticSignals: [], bodyPatterns: [], bodyInvariants: [],
  _loaded: false, initialized: false,
};

const PRIMING_METHODS = [
  { id:'binaural',   label:'Binaural Beats',   desc:'40Hz gamma/theta induction · headphones' },
  { id:'movement',   label:'Primal Movement',   desc:'Embodied locomotion · somatic reset' },
  { id:'breathing',  label:'Box Breathing',     desc:'4-4-4-4 CO2 tolerance · vagal activation' },
  { id:'coldwater',  label:'Cold Exposure',     desc:'Dopamine spike · cortisol flush' },
  { id:'monotask',   label:'Mono-Task Lock',    desc:'Single constraint → infinite depth' },
  { id:'freewrite',  label:'Free Writing',      desc:'Stream of consciousness · uncensor · 5 min' },
  { id:'stateshift', label:'State Shift',       desc:'New physical environment = new mental state' },
  { id:'priming',    label:'Cognitive Priming', desc:'Speak future state in present tense' },
  { id:'spatial',    label:'Spatial Void',      desc:'Empty room · blank canvas · 0 inputs' },
];

const IDEA_SEEDS = [
  'What if you removed one core assumption entirely?',
  'Invert the problem — what would make this worse?',
  'What would a 10-year-old do with this constraint?',
  'Combine two unrelated domains — what emerges?',
  'What if you had infinite resources? Zero resources?',
  'What does the opposite of your current approach look like?',
  'What problem does your solution create that could be a product?',
  'Who benefits most from the status quo you want to change?',
  "What's the fastest way to get a signal? Run that.",
  "What would you do if you knew you couldn't fail?",
  'What would nature do with this problem?',
  'If this already existed in 2040, how was it built?',
];

/* ── Persistence ─────────────────────────────────────────────────── */
function voidLoad() {
  try {
    const raw = localStorage.getItem(VOID_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      Object.assign(VOID_STATE, p);
      ['seeds','openLoops','whatifs','createLog','expressLog','bridges','primeLog',
       'constraints','conditions','causalChain','horizonItems','somaticSignals',
       'bodyPatterns','bodyInvariants'].forEach(k => {
        if (!Array.isArray(VOID_STATE[k])) VOID_STATE[k] = [];
      });
    }
  } catch(e) {}
  VOID_STATE._loaded = true;
}

function saveVoidState() {
  try { localStorage.setItem(VOID_KEY, JSON.stringify(VOID_STATE)); } catch(e) {}
}

function initVoid() {
  if (!VOID_STATE._loaded) voidLoad();
  _voidRenderSeeds();
  _voidRenderLoops();
  _voidRenderWhatifs();
  _voidRenderCreateLog();
  _voidRenderExpressLog();
  _voidRenderBridges();
  _voidRenderPrimeLog();
  _voidRenderPrimingMethods();
  _voidRenderConstraints();
  if (typeof renderSignalItems === 'function') renderSignalItems();
  if (typeof renderThreads === 'function') renderThreads();
  if (typeof initGapCanvas === 'function') initGapCanvas();
  _voidRestoreFields();
  VOID_STATE.initialized = true;
}

function _voidRestoreFields() {
  const map = VOID_STATE.endStateFields || {};
  ['void-create-text','void-express-text','void-bridge-a','void-bridge-b'].forEach(id => {
    if (map[id]) { const el = document.getElementById(id); if (el) el.value = map[id]; }
  });
}
function _voidSaveFields() {
  if (!VOID_STATE.endStateFields) VOID_STATE.endStateFields = {};
  ['void-create-text','void-express-text','void-bridge-a','void-bridge-b'].forEach(id => {
    const el = document.getElementById(id);
    if (el) VOID_STATE.endStateFields[id] = el.value;
  });
}

/* ── 1. SEEDS ──────────────────────────────────────────────────────*/
function voidAddSeed() {
  const inp = document.getElementById('void-seed-input');
  const val = inp && inp.value.trim(); if (!val) return;
  VOID_STATE.seeds.push({ id: uuid(), text: val, created: Date.now(), spawned: false });
  inp.value = '';
  _voidRenderSeeds(); saveVoidState();
  mm_toast('Seed planted', 'info');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.void.seed.add', { text: val });
}
function voidRemoveSeed(id) {
  VOID_STATE.seeds = VOID_STATE.seeds.filter(function(s){ return s.id !== id; });
  _voidRenderSeeds(); saveVoidState();
}
function voidSpawnSeed(id) {
  const s = VOID_STATE.seeds.find(function(x){ return x.id === id; }); if (!s) return;
  closeVoid();
  setTimeout(function() {
    CANVAS.enterCanvas();
    const n = CANVAS.spawnNode('seed', 400+Math.random()*300, 200+Math.random()*200, { title: s.text, tags: ['SEED','VOID'] });
    if (n) { s.spawned = true; saveVoidState(); mm_toast('Seed to canvas', 'success'); }
  }, 450);
}
function voidSpawnAllSeeds() {
  if (!VOID_STATE.seeds.length) { mm_toast('No seeds yet', 'warn'); return; }
  closeVoid();
  setTimeout(function() {
    CANVAS.enterCanvas();
    VOID_STATE.seeds.forEach(function(s, i) {
      CANVAS.spawnNode('seed', 200+(i%4)*200, 150+Math.floor(i/4)*180, { title: s.text, tags: ['SEED','VOID'] });
      s.spawned = true;
    });
    saveVoidState();
    mm_toast(VOID_STATE.seeds.length + ' seeds to canvas', 'success');
  }, 450);
}
function _voidRenderSeeds() {
  const el = document.getElementById('void-seeds-list'); if (!el) return;
  if (!VOID_STATE.seeds.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:8px 0">No seeds yet. Plant the first spark.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.seeds.map(function(s) { return (
    '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid rgba(0,255,136,.15);background:rgba(0,255,136,.04);margin-bottom:5px">' +
    '<span style="font-family:var(--f-mono);font-size:8px;color:var(--bright);flex:1;line-height:1.7">' + escH(s.text) + '</span>' +
    '<button onclick="voidSpawnSeed(\'' + s.id + '\')" style="padding:3px 8px;border:1px solid var(--g);color:var(--g);background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:6.5px;white-space:nowrap">→ NODE</button>' +
    '<span onclick="voidRemoveSeed(\'' + s.id + '\')" style="cursor:pointer;color:var(--dim);font-size:11px;padding:2px 4px">✕</span>' +
    '</div>'
  ); }).join('');
}

/* ── 2. OPEN LOOPS ─────────────────────────────────────────────────*/
function voidAddLoop() {
  const inp = document.getElementById('void-loop-input');
  const val = inp && inp.value.trim(); if (!val) return;
  VOID_STATE.openLoops.push({ id: uuid(), text: val, status: 'open', created: Date.now() });
  inp.value = '';
  _voidRenderLoops(); saveVoidState();
  mm_toast('Open loop tracked', 'info');
}
function voidCloseLoop(id) {
  const l = VOID_STATE.openLoops.find(function(x){ return x.id === id; });
  if (l) { l.status = 'closed'; l.closedAt = Date.now(); }
  _voidRenderLoops(); saveVoidState();
  mm_toast('Loop closed', 'success');
}
function voidRemoveLoop(id) {
  VOID_STATE.openLoops = VOID_STATE.openLoops.filter(function(l){ return l.id !== id; });
  _voidRenderLoops(); saveVoidState();
}
function _voidRenderLoops() {
  const el = document.getElementById('void-loops-list'); if (!el) return;
  if (!VOID_STATE.openLoops.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:8px 0">No open loops. Track what your brain keeps returning to.</div>';
    return;
  }
  function renderItem(l) {
    const open = l.status === 'open';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid ' +
      (open ? 'rgba(255,140,34,.2)' : 'rgba(0,255,136,.15)') + ';background:' +
      (open ? 'rgba(255,140,34,.04)' : 'rgba(0,255,136,.03)') + ';margin-bottom:4px;opacity:' + (open ? 1 : 0.6) + '">' +
      '<span style="font-family:var(--f-mono);font-size:6.5px;min-width:40px;color:' + (open ? 'var(--o)' : 'var(--g)') + '">' + (open ? '⟳ OPEN' : '✓ DONE') + '</span>' +
      '<span style="font-family:var(--f-mono);font-size:8px;color:var(--bright);flex:1">' + escH(l.text) + '</span>' +
      (open ? '<button onclick="voidCloseLoop(\'' + l.id + '\')" style="padding:2px 7px;border:1px solid var(--g);color:var(--g);background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:6.5px">DONE</button>' : '') +
      '<span onclick="voidRemoveLoop(\'' + l.id + '\')" style="cursor:pointer;color:var(--dim);font-size:11px;padding:2px 4px">✕</span>' +
      '</div>';
  }
  el.innerHTML = VOID_STATE.openLoops.filter(function(l){ return l.status==='open'; }).map(renderItem).join('') +
    VOID_STATE.openLoops.filter(function(l){ return l.status==='closed'; }).map(renderItem).join('');
}

/* ── 3. WHAT-IFS ───────────────────────────────────────────────────*/
function voidAddWhatif() {
  const inp = document.getElementById('void-whatif-input');
  const val = inp && inp.value.trim(); if (!val) return;
  VOID_STATE.whatifs.push({ id: uuid(), text: val, created: Date.now() });
  inp.value = '';
  _voidRenderWhatifs(); saveVoidState();
  mm_toast('What-if logged', 'info');
}
function voidRemoveWhatif(id) {
  VOID_STATE.whatifs = VOID_STATE.whatifs.filter(function(w){ return w.id !== id; });
  _voidRenderWhatifs(); saveVoidState();
}
function voidSpawnWhatifs() {
  if (!VOID_STATE.whatifs.length) { mm_toast('No what-ifs to spawn', 'warn'); return; }
  closeVoid();
  setTimeout(function() {
    CANVAS.enterCanvas();
    VOID_STATE.whatifs.forEach(function(w, i) {
      CANVAS.spawnNode('question', 180+(i%3)*220, 160+Math.floor(i/3)*180, { title: w.text, tags: ['WHAT-IF','EXPANSION'] });
    });
    mm_toast(VOID_STATE.whatifs.length + ' what-ifs to canvas', 'success');
  }, 450);
}
async function voidExpandWhatifAI() {
  const inp = document.getElementById('void-whatif-input');
  const seed = (inp && inp.value.trim()) || (VOID_STATE.whatifs.slice(-1)[0] && VOID_STATE.whatifs.slice(-1)[0].text);
  if (!seed) { mm_toast('Enter a seed to expand', 'warn'); return; }
  if (typeof T !== 'undefined' && T.aiThinking) T.aiThinking();
  try {
    const result = await aiCall('Generate 5 creative "what if" expansions for: "' + seed + '". Each must be provocative and push beyond the obvious. Respond ONLY as a JSON array of strings, no markdown.');
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    let ideas = [];
    try { ideas = JSON.parse(result.replace(/```json|```/g,'')); } catch(e) {}
    if (Array.isArray(ideas) && ideas.length) {
      ideas.forEach(function(text) { VOID_STATE.whatifs.push({ id: uuid(), text: text, created: Date.now(), ai: true }); });
      _voidRenderWhatifs(); saveVoidState();
      mm_toast(ideas.length + ' AI expansions added', 'success');
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.void.ai.expand', { count: ideas.length });
    }
  } catch(e) {
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    mm_toast('AI expand failed: ' + e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════════
   RECURSIVE WHAT-IF LOOP ENGINE — v1.0
   
   Architecture:
   - Each what-if spawns N divergent branches (default 3)
   - Each branch gets scored: Coherence × Novelty × Actionability
   - Branches above threshold recurse to depth D
   - Branches below threshold become leaf nodes (canvas synthesis nodes)
   - All paths tracked in VOID_STATE.whatifTree for full audit trail
   - MM_BUS emits progress so UI can show live propagation
   - Terminates on: max depth, token budget, or convergence signal
   
   This is not chatbot generation. It's a causal graph builder.
   Every branch IS a node on the canvas. The recursion IS the map.
═══════════════════════════════════════════════════════════════════ */

const WHATIF_LOOP = {
  running: false,
  aborted: false,
  depth: 0,
  maxDepth: 4,
  branchFactor: 3,
  scoreThreshold: 0.6,   // branches below this become leaves
  tokenBudget: 6000,     // rough estimate, abort if exceeded
  tokensUsed: 0,
  tree: [],              // full recursion tree for audit
  canvasRoot: null,      // root node id on canvas
};

// ── Abort any running loop ────────────────────────────────────────
function whatifLoopAbort() {
  WHATIF_LOOP.aborted = true;
  WHATIF_LOOP.running = false;
  mm_toast('Loop aborted', 'warn');
  MM_BUS?.emit('mm.whatif.loop.aborted', {});
}

// ── Entry point ───────────────────────────────────────────────────
async function whatifLoopStart(seed, opts = {}) {
  if (WHATIF_LOOP.running) { mm_toast('Loop already running — abort first', 'warn'); return; }

  const cfg = Object.assign({}, {
    maxDepth:       opts.maxDepth      ?? WHATIF_LOOP.maxDepth,
    branchFactor:   opts.branchFactor  ?? WHATIF_LOOP.branchFactor,
    scoreThreshold: opts.scoreThreshold ?? WHATIF_LOOP.scoreThreshold,
    spawnCanvas:    opts.spawnCanvas   ?? true,
  }, opts);

  Object.assign(WHATIF_LOOP, {
    running: true, aborted: false, depth: 0, tokensUsed: 0, tree: []
  });

  T.aiThinking?.();
  MM_BUS?.emit('mm.whatif.loop.start', { seed, cfg });
  mm_toast(`↺ Recursive loop: depth ${cfg.maxDepth} × ${cfg.branchFactor} branches`, 'sync', { dur: 2000 });

  // Spawn root node on canvas
  let rootId = null;
  if (cfg.spawnCanvas) {
    const { x: wx, y: wy } = s2w(window.innerWidth / 2, window.innerHeight / 2 - 200);
    const rootNode = CANVAS.spawnNode('seed', wx, wy, {
      title: seed.slice(0, 60),
      body: 'Recursive loop root',
      tags: ['whatif-root', 'loop'],
      color: '#cc44ff',
    });
    rootId = rootNode?.id;
    WHATIF_LOOP.canvasRoot = rootId;
  }

  try {
    const result = await _whatifRecurse(seed, 0, rootId, null, cfg, []);
    VOID_STATE.whatifTree = result;
    saveVoidState();
    T.aiDone?.();
    WHATIF_LOOP.running = false;

    const totalBranches = _countBranches(result);
    mm_toast(`↺ Loop complete: ${totalBranches} branches across ${cfg.maxDepth} levels`, 'success', { dur: 4000 });
    MM_BUS?.emit('mm.whatif.loop.complete', { totalBranches, depth: cfg.maxDepth, tokensUsed: WHATIF_LOOP.tokensUsed });
    _voidRenderWhatifs();
  } catch(e) {
    T.aiDone?.();
    WHATIF_LOOP.running = false;
    mm_toast('Loop error: ' + e.message, 'error');
    console.error('[WHATIF LOOP]', e);
  }
}

// ── Core recursion ────────────────────────────────────────────────
async function _whatifRecurse(premise, depth, parentNodeId, parentBranch, cfg, ancestry) {
  if (WHATIF_LOOP.aborted) return null;
  if (depth >= cfg.maxDepth) return { premise, depth, leaf: true, reason: 'max-depth' };
  if (WHATIF_LOOP.tokensUsed > WHATIF_LOOP.tokenBudget) {
    return { premise, depth, leaf: true, reason: 'token-budget' };
  }

  MM_BUS?.emit('mm.whatif.loop.progress', { depth, premise: premise.slice(0, 60) });

  // ── Generate branches via AI ──────────────────────────────────
  const ancestryCtx = ancestry.length
    ? '\n\nChain of reasoning so far:\n' + ancestry.map((a, i) => (i+1) + '. ' + a).join('\n')
    : ''

  const branchPrompt = `Premise: "${premise}"${ancestryCtx}

Generate exactly ${cfg.branchFactor} divergent "what if" branches that explore genuinely different directions from this premise. Each branch must:
1. Challenge a different underlying assumption
2. Have a specific, concrete implication (not vague)
3. Be rated for: coherence (0-1), novelty (0-1), actionability (0-1)

Return ONLY valid JSON array:
[{"branch": "What if...", "assumption_broken": "...", "implication": "...", "coherence": 0.8, "novelty": 0.7, "actionability": 0.6, "type": "concept|question|friction|insight|vector"}]`;

  let branches = [];
  try {
    const raw = await aiCall(
      'You are a recursive divergent-thinking engine. Generate structured what-if branches with precision scores. No markdown, only JSON.',
      branchPrompt
    );
    WHATIF_LOOP.tokensUsed += Math.ceil((raw?.length || 0) / 4);
    const clean = (raw || '').replace(/```json|```/g, '').trim();
    branches = JSON.parse(clean);
    if (!Array.isArray(branches)) branches = [];
  } catch(e) {
    console.warn('[WHATIF LOOP] parse fail at depth', depth, e.message);
    return { premise, depth, leaf: true, reason: 'parse-error' };
  }

  // ── Score + classify each branch ─────────────────────────────
  const results = [];
  const px = parentNodeId ? (CANVAS.NX.nodes.find(n => n.id === parentNodeId)?.x || 0) : 0;
  const py = parentNodeId ? (CANVAS.NX.nodes.find(n => n.id === parentNodeId)?.y || 0) : 0;
  const spreadRadius = 280 + depth * 60;

  for (let i = 0; i < Math.min(branches.length, cfg.branchFactor); i++) {
    if (WHATIF_LOOP.aborted) break;
    const b = branches[i];
    if (!b?.branch) continue;

    const score = ((b.coherence || 0) + (b.novelty || 0) + (b.actionability || 0)) / 3;
    const isLeaf = score < cfg.scoreThreshold || depth >= cfg.maxDepth - 1;

    // Spawn canvas node for this branch
    let nodeId = null;
    if (cfg.spawnCanvas) {
      const angle = ((i / cfg.branchFactor) * Math.PI * 2) - Math.PI / 2 + depth * 0.4;
      const nx = px + Math.cos(angle) * spreadRadius;
      const ny = py + Math.sin(angle) * spreadRadius;

      // Node color fades toward synthesis at deep levels
      const depthColors = ['#cc44ff','#7744ff','#00c8ff','#00ff88','#ffe04a'];
      const nodeColor = depthColors[Math.min(depth, depthColors.length - 1)];

      const nodeType = isLeaf ? (b.type || 'insight') : 'question';
      const node = CANVAS.spawnNode(nodeType, nx, ny, {
        title: b.branch.slice(0, 60),
        body: `${b.implication || ''}

⦿ Assumption: ${b.assumption_broken || ''}`,
        tags: [`depth-${depth}`, isLeaf ? 'leaf' : 'branch', 'whatif'],
        color: nodeColor,
      });
      nodeId = node?.id;

      if (parentNodeId && nodeId) {
        const confidence = score.toFixed(2);
        CANVAS.addConn(parentNodeId, nodeId, `${isLeaf ? '⊢' : '↺'} ${confidence}`);
      }
    }

    // ── Recurse or terminate ──────────────────────────────────
    let children = null;
    if (!isLeaf) {
      // Small delay between AI calls to avoid rate limiting + give UI time to breathe
      await new Promise(r => setTimeout(r, 150));
      children = await _whatifRecurse(
        b.branch,
        depth + 1,
        nodeId,
        b,
        cfg,
        [...ancestry, premise]
      );
    } else {
      // Leaf: spawn synthesis insight if deep enough
      if (cfg.spawnCanvas && depth >= 1 && nodeId) {
        await new Promise(r => setTimeout(r, 80));
        const synthRaw = await aiCall(
          'You are a synthesis engine. In 1 sentence, name the invariant principle this "what if" reveals.',
          `"${b.branch}" — implication: "${b.implication || ''}"`
        );
        WHATIF_LOOP.tokensUsed += Math.ceil((synthRaw?.length || 0) / 4);
        if (synthRaw) {
          const synthNode = CANVAS.spawnNode('synthesis', px + Math.cos(0) * 40, py + 60, {
            title: 'INVARIANT',
            body: synthRaw.slice(0, 200),
            tags: [`depth-${depth}`, 'synthesis', 'invariant'],
            color: '#11ddcc',
          });
          if (synthNode && nodeId) CANVAS.addConn(nodeId, synthNode.id, 'reveals');
        }
      }
    }

    results.push({
      branch: b.branch,
      score,
      depth,
      nodeId,
      isLeaf,
      coherence: b.coherence,
      novelty: b.novelty,
      actionability: b.actionability,
      assumption_broken: b.assumption_broken,
      implication: b.implication,
      children,
    });
  }

  return { premise, depth, branches: results };
}

// ── Count total branches in recursion tree ────────────────────────
function _countBranches(tree) {
  if (!tree?.branches) return 0;
  return tree.branches.length + tree.branches.reduce((sum, b) => sum + _countBranches(b.children), 0);
}

// ── Quick single-level expansion (existing feature, now enhanced) ─
async function whatifQuickExpand(seed, count = 5) {
  const inp = document.getElementById('void-whatif-input');
  const s = seed || (inp && inp.value.trim()) || (VOID_STATE.whatifs.slice(-1)[0]?.text);
  if (!s) { mm_toast('Enter a seed first', 'warn'); return; }
  await whatifLoopStart(s, { maxDepth: 1, branchFactor: count, spawnCanvas: false });
  // Results land in VOID_STATE.whatifTree branches → flatten to whatifs list
  const tree = VOID_STATE.whatifTree;
  if (tree?.branches) {
    tree.branches.forEach(b => {
      if (b.branch) VOID_STATE.whatifs.push({ id: uuid(), text: b.branch, created: Date.now(), ai: true, score: b.score });
    });
    _voidRenderWhatifs(); saveVoidState();
  }
}

// ── Open Loop → Recursive Seed ───────────────────────────────────
// Takes an open loop and runs a deep what-if tree to find resolution paths
async function openLoopRecurse(loopId, depth = 3) {
  const loop = VOID_STATE.openLoops.find(l => l.id === loopId);
  if (!loop) { mm_toast('Loop not found', 'warn'); return; }
  const seed = `What if I finally resolved: "${loop.text}"?`;
  await whatifLoopStart(seed, {
    maxDepth: depth,
    branchFactor: 3,
    spawnCanvas: true,
    scoreThreshold: 0.5,
  });
}

function _voidRenderWhatifs() {
  const el = document.getElementById('void-whatif-list'); if (!el) return;
  if (!VOID_STATE.whatifs.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:8px 0">No what-ifs yet. Ask the question that changes the frame.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.whatifs.map(function(w) { return (
    '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border:1px solid rgba(204,68,255,.15);background:rgba(204,68,255,.04);margin-bottom:4px">' +
    (w.ai ? '<span style="font-family:var(--f-mono);font-size:6px;color:#cc44ff;border:1px solid #cc44ff44;padding:1px 4px">AI</span>' : '') +
    '<span style="font-family:var(--f-mono);font-size:8px;color:var(--bright);flex:1">' + escH(w.text) + '</span>' +
    '<span onclick="voidRemoveWhatif(\'' + w.id + '\')" style="cursor:pointer;color:var(--dim);font-size:11px;padding:2px 4px">✕</span>' +
    '</div>'
  ); }).join('');
}

/* ── 4. CREATE ─────────────────────────────────────────────────────*/
function voidSpawnCreate() {
  _voidSaveFields();
  const text = document.getElementById('void-create-text') && document.getElementById('void-create-text').value.trim();
  if (!text) { mm_toast('Write something first', 'warn'); return; }
  VOID_STATE.createLog.push({ id: uuid(), text: text, created: Date.now() });
  _voidRenderCreateLog(); saveVoidState();
  closeVoid();
  setTimeout(function() {
    CANVAS.enterCanvas();
    CANVAS.spawnNode('seed', 400+Math.random()*200, 200+Math.random()*150, { title: text.slice(0,80), body: text, tags: ['CREATE','VOID'] });
    mm_toast('Created to canvas', 'success');
  }, 450);
}
function voidLogCreate() {
  _voidSaveFields();
  const text = document.getElementById('void-create-text') && document.getElementById('void-create-text').value.trim();
  if (!text) { mm_toast('Nothing to log', 'warn'); return; }
  VOID_STATE.createLog.push({ id: uuid(), text: text, created: Date.now() });
  _voidRenderCreateLog(); saveVoidState();
  const el = document.getElementById('void-create-text'); if (el) el.value = '';
  mm_toast('Logged', 'success');
}
function _voidRenderCreateLog() {
  const el = document.getElementById('void-create-log'); if (!el) return;
  if (!VOID_STATE.createLog.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:6px 0">Nothing logged yet.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.createLog.slice().reverse().slice(0,6).map(function(c) { return (
    '<div style="padding:6px 10px;border-left:2px solid #ff8c2244;margin-bottom:4px">' +
    '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--muted);line-height:1.7">' + escH(c.text.slice(0,120)) + (c.text.length>120?'…':'') + '</div>' +
    '<div style="font-family:var(--f-mono);font-size:6px;color:var(--dim);margin-top:2px">' + fmtTime(c.created) + '</div>' +
    '</div>'
  ); }).join('');
}

/* ── 5. EXPRESS ────────────────────────────────────────────────────*/
function voidSpawnExpress() {
  _voidSaveFields();
  const text = document.getElementById('void-express-text') && document.getElementById('void-express-text').value.trim();
  if (!text) { mm_toast('Express something first', 'warn'); return; }
  VOID_STATE.expressLog.push({ id: uuid(), text: text, created: Date.now() });
  _voidRenderExpressLog(); saveVoidState();
  closeVoid();
  setTimeout(function() {
    CANVAS.enterCanvas();
    CANVAS.spawnNode('concept', 400+Math.random()*200, 250+Math.random()*150, { title: text.slice(0,60), body: text, tags: ['EXPRESS','VOID','CREATIVE'] });
    mm_toast('Expression to canvas', 'success');
  }, 450);
}
function voidLogExpress() {
  _voidSaveFields();
  const text = document.getElementById('void-express-text') && document.getElementById('void-express-text').value.trim();
  if (!text) return;
  VOID_STATE.expressLog.push({ id: uuid(), text: text, created: Date.now() });
  _voidRenderExpressLog(); saveVoidState();
  const el = document.getElementById('void-express-text'); if (el) el.value = '';
  mm_toast('Expression logged', 'success');
}
function _voidRenderExpressLog() {
  const el = document.getElementById('void-express-log'); if (!el) return;
  if (!VOID_STATE.expressLog.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:6px 0">Nothing expressed yet.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.expressLog.slice().reverse().slice(0,6).map(function(e) { return (
    '<div style="padding:6px 10px;border-left:2px solid #ff66aa44;margin-bottom:4px">' +
    '<div style="font-family:var(--f-body);font-size:9px;color:var(--muted);line-height:1.8;font-style:italic">' + escH(e.text.slice(0,100)) + (e.text.length>100?'…':'') + '</div>' +
    '</div>'
  ); }).join('');
}

/* ── 6. BRIDGE ─────────────────────────────────────────────────────*/
function voidBridge() {
  _voidSaveFields();
  const a = document.getElementById('void-bridge-a') && document.getElementById('void-bridge-a').value.trim();
  const b = document.getElementById('void-bridge-b') && document.getElementById('void-bridge-b').value.trim();
  if (!a || !b) { mm_toast('Enter both concepts', 'warn'); return; }
  VOID_STATE.bridges.push({ id: uuid(), a: a, b: b, created: Date.now() });
  _voidRenderBridges(); saveVoidState();
  closeVoid();
  setTimeout(function() {
    CANVAS.enterCanvas();
    const cx = 400+Math.random()*150;
    const nA = CANVAS.spawnNode('concept', cx-180, 300, { title: a, tags: ['BRIDGE'] });
    const nB = CANVAS.spawnNode('concept', cx+180, 300, { title: b, tags: ['BRIDGE'] });
    const nG = CANVAS.spawnNode('gap', cx, 460, { title: 'GAP: ' + a.slice(0,25) + ' \u2194 ' + b.slice(0,25), tags: ['GAP','BRIDGE'] });
    if (nA && nB && nG) {
      setTimeout(function() { CANVAS.addConn(nA.id, nG.id, 'bridge'); CANVAS.addConn(nB.id, nG.id, 'bridge'); }, 100);
    }
    mm_toast('Bridge mapped on canvas', 'success');
  }, 450);
}
async function voidBridgeAI() {
  _voidSaveFields();
  const a = document.getElementById('void-bridge-a') && document.getElementById('void-bridge-a').value.trim();
  const b = document.getElementById('void-bridge-b') && document.getElementById('void-bridge-b').value.trim();
  if (!a || !b) { mm_toast('Enter both concepts first', 'warn'); return; }
  if (typeof T !== 'undefined' && T.aiThinking) T.aiThinking();
  try {
    const result = await aiCall('Map the gap between "' + a + '" and "' + b + '". Respond ONLY as JSON: {"common":"shared ground","tension":"core difference","syntheses":["idea1","idea2","idea3"]}');
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    let p = null;
    try { p = JSON.parse(result.replace(/```json|```/g,'')); } catch(e) {}
    if (p) {
      closeVoid();
      setTimeout(function() {
        CANVAS.enterCanvas();
        const nA = CANVAS.spawnNode('concept', 180, 280, { title: a, tags: ['BRIDGE'] });
        const nB = CANVAS.spawnNode('concept', 620, 280, { title: b, tags: ['BRIDGE'] });
        const nC = CANVAS.spawnNode('synthesis', 400, 130, { title: 'COMMON: ' + p.common, tags: ['SYNTHESIS'] });
        const nT = CANVAS.spawnNode('friction', 400, 430, { title: 'TENSION: ' + p.tension, tags: ['FRICTION'] });
        if (p.syntheses) p.syntheses.forEach(function(s, i) {
          CANVAS.spawnNode('synthesis', 200+i*200, 570, { title: s, tags: ['BRIDGE','SYNTHESIS','AI'] });
        });
        mm_toast('AI bridge mapped', 'success');
      }, 450);
    }
  } catch(e) {
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    mm_toast('AI bridge failed: ' + e.message, 'error');
  }
}
function _voidRenderBridges() {
  const el = document.getElementById('void-bridges-log'); if (!el) return;
  if (!VOID_STATE.bridges.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:6px 0">No bridges mapped yet.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.bridges.slice().reverse().slice(0,6).map(function(b) { return (
    '<div style="padding:5px 10px;border-left:2px solid rgba(0,255,136,.3);margin-bottom:3px">' +
    '<div style="font-family:var(--f-mono);font-size:8px;color:var(--bright)">' + escH(b.a) + ' \u2194 ' + escH(b.b) + '</div>' +
    '</div>'
  ); }).join('');
}

/* ── 7. PRIMING ────────────────────────────────────────────────────*/
function voidSelectPriming(id) {
  VOID_STATE.flowMethod = id;
  document.querySelectorAll('.void-prime-card').forEach(function(c) {
    const active = c.dataset.id === id;
    c.style.borderColor = active ? 'var(--v)' : 'var(--wire2)';
    c.style.background  = active ? 'rgba(119,68,255,.1)' : 'transparent';
  });
  const m = PRIMING_METHODS.find(function(x){ return x.id === id; });
  if (m) mm_toast(m.label + ' · ' + m.desc, 'info', { dur: 3500 });
  saveVoidState();
}
function voidLogPriming() {
  const m = PRIMING_METHODS.find(function(x){ return x.id === VOID_STATE.flowMethod; });
  const label = m ? m.label : 'Custom';
  const note = (document.getElementById('void-prime-note') && document.getElementById('void-prime-note').value.trim()) || '';
  VOID_STATE.primeLog.push({ id: uuid(), method: VOID_STATE.flowMethod, label: label, note: note, created: Date.now() });
  _voidRenderPrimeLog(); saveVoidState();
  const el = document.getElementById('void-prime-note'); if (el) el.value = '';
  mm_toast('Priming logged · enter the state', 'success');
}
function _voidRenderPrimingMethods() {
  const el = document.getElementById('void-priming-grid'); if (!el) return;
  el.innerHTML = PRIMING_METHODS.map(function(m) { return (
    '<div class="void-prime-card" data-id="' + m.id + '" onclick="voidSelectPriming(\'' + m.id + '\')" ' +
    'style="padding:10px 12px;border:1px solid var(--wire2);cursor:pointer;transition:all .15s;' +
    (VOID_STATE.flowMethod===m.id ? 'border-color:var(--v);background:rgba(119,68,255,.1)' : '') + '">' +
    '<div style="font-family:var(--f-display);font-size:8px;font-weight:700;letter-spacing:2px;color:var(--v);margin-bottom:3px">' + escH(m.label) + '</div>' +
    '<div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim);line-height:1.6">' + escH(m.desc) + '</div>' +
    '</div>'
  ); }).join('');
}
function _voidRenderPrimeLog() {
  const el = document.getElementById('void-prime-log'); if (!el) return;
  if (!VOID_STATE.primeLog.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:6px 0">No sessions logged yet.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.primeLog.slice().reverse().slice(0,6).map(function(p) { return (
    '<div style="padding:5px 10px;border-left:2px solid rgba(119,68,255,.4);margin-bottom:4px">' +
    '<span style="font-family:var(--f-mono);font-size:8px;color:#cc44ff">' + escH(p.label) + '</span>' +
    (p.note ? '<span style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-left:8px">' + escH(p.note) + '</span>' : '') +
    '<div style="font-family:var(--f-mono);font-size:6px;color:var(--dim);margin-top:2px">' + fmtTime(p.created) + '</div>' +
    '</div>'
  ); }).join('');
}

/* ── Constraints (legacy integrated) ───────────────────────────────*/
function addConstraint() {
  const inp = document.getElementById('constraint-input');
  const val = inp && inp.value.trim(); if (!val) return;
  VOID_STATE.constraints.push({ id: uuid(), text: val, inverted: invertConstraint(val), created: Date.now() });
  inp.value = '';
  _voidRenderConstraints(); saveVoidState();
  mm_toast('Constraint mapped', 'info');
}
function removeConstraint(id) {
  VOID_STATE.constraints = VOID_STATE.constraints.filter(function(c){ return c.id !== id; });
  _voidRenderConstraints(); saveVoidState();
}
function invertConstraint(text) {
  const l = text.toLowerCase();
  let inv = 'The constraint "' + text + '" means: ';
  if (l.includes('time'))                              inv += 'Urgency becomes the creative constraint that forces elegance.';
  else if (l.includes('money')||l.includes('budget'))  inv += 'Scarcity forces the minimum viable signal and pure ingenuity.';
  else if (l.includes('skill')||l.includes('expert'))  inv += 'Not knowing is the advantage — the beginner sees what experts miss.';
  else if (l.includes('people')||l.includes('team'))   inv += 'Fewer dependencies means faster cycles and purer signal.';
  else if (l.includes('access')||l.includes('perm'))   inv += 'The restriction reveals the path that bypasses every gate.';
  else                                                  inv += 'This boundary IS the creative edge. The wall IS the door.';
  return inv;
}
function _voidRenderConstraints() {
  const el = document.getElementById('constraints-list'); if (!el) return;
  if (!VOID_STATE.constraints.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:8px 0">No constraints mapped.</div>';
    return;
  }
  el.innerHTML = VOID_STATE.constraints.map(function(c) { return (
    '<div style="padding:8px 10px;border:1px solid rgba(255,140,34,.2);margin-bottom:5px">' +
    '<span onclick="removeConstraint(\'' + c.id + '\')" style="cursor:pointer;color:var(--dim);float:right;padding:0 4px;font-size:11px">✕</span>' +
    '<div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);margin-bottom:4px">' + escH(c.text) + '</div>' +
    '<div style="font-family:var(--f-mono);font-size:7px;color:var(--o);line-height:1.6">' + escH(c.inverted) + '</div>' +
    '</div>'
  ); }).join('');
}

/* ── Legacy aliases for HTML panels ─────────────────────────────── */
function renderFlowMethods() { _voidRenderPrimingMethods(); }
function selectFlowMethod(id) { voidSelectPriming(id); }

/* ── MODULE HELP SYSTEM ─────────────────────────────────────────── */
const MODULE_HELP = {
  void: {
    title: 'SPATIAL VOID + CREATIVE TOOLKIT', color: '#cc44ff', icon: '✦',
    sections: [
      { head: 'WHAT IT IS', body: 'Your unstructured creative workspace — merged with the Creative Module. No rules. No perfection. Plant seeds, track open loops, expand what-ifs, create raw, express freely, bridge concepts, prime your state. Everything flows to canvas.' },
      { head: 'SEEDS & OPEN LOOPS', body: 'Seeds are tiny sparks — too small to node yet. Open loops are unresolved things your brain keeps returning to. Both spawn to canvas as SEED nodes when ready.' },
      { head: 'WHAT-IFS & AI EXPANSION', body: 'Log "what if" questions. AI EXPAND branches one seed into 5 creative directions. Spawn all as QUESTION nodes for a divergent exploration network on canvas.' },
      { head: 'CREATE + EXPRESS', body: 'CREATE: raw idea dump, no filters — log or spawn as SEED node. EXPRESS: art, poetry, raw emotion — no judgment, softer font — log or spawn as CONCEPT node.' },
      { head: 'BRIDGE', body: 'Name two concepts. Manual bridge creates 3 nodes (A, B, GAP) with connections. AI bridge generates: common ground, core tension, and 3 synthesis ideas — all mapped on canvas with full connections.' },
      { head: 'PRIMING & FLOW', body: '9 priming methods with neurological rationale. Select one before deep work. Log sessions to discover which rituals work for you over time.' },
      { head: 'SISO + JAA', body: 'Every action emits a SISO event (MM_BUS). Observe: MM_BUS.sampleLog(). State in localStorage: nexus_void_state. JAA Runner available via MM_RUNNER for stateful gate operations.' },
    ]
  },
  brain: {
    title: 'BRAIN MAP V2', color: '#00c8ff', icon: '◎',
    sections: [
      { head: 'WHAT IT IS', body: '3D spherical map of 13 meta-domains. Three modes: Cognitive (logic/systems/∞), Relationships (interpersonal/co-creation/⬡), Emotions (existential/intrapersonal/♥). Each mode auto-expands its matching cluster.' },
      { head: 'NAVIGATION', body: 'Click hub to expand meta-domain. Click domain to expand sub-domains. Click sub-domain to spawn canvas node. Sphere auto-rotates — drag to rotate manually, scroll to zoom.' },
      { head: 'INTELLIGENCE RATINGS', body: 'Rate 13 types (Logical, Spatial, Linguistic, Musical, Kinesthetic, Naturalist, Interpersonal, Intrapersonal, Existential, Creative, Emotional, Systems, Embodied). Ratings highlight relevant domains and surface synthesis pairs.' },
      { head: 'SYNTHESIS DETECTION', body: 'Domains sharing intelligence type tags across meta-domains are flagged as synthesis candidates. Spawn a SYNTHESIS node that bridges both domains on canvas with connections.' },
      { head: 'EXPORTS', body: 'JSON · Notion-compatible JSON · Obsidian markdown · CSV. Import custom domain structures. All 13 meta-domains + unlimited custom additions persisted in mm_brain_map_v2.' },
    ]
  },
  horizon: {
    title: 'HORIZON LIVING', color: '#d4a820', icon: '→',
    sections: [
      { head: 'WHAT IT IS', body: 'End-state first planning. Define the future state, then reverse-engineer via causal conditions — what must be true for that outcome to become inevitable.' },
      { head: 'CONDITIONS NOT TASKS', body: '"The prototype has been tested by 10 users" not "Do user testing." Conditions are states of the world. This distinction forces outcome thinking over activity thinking.' },
      { head: 'PLANS', body: 'Title + timeframe (1wk–10yr) + conditions + resource requirements. Multiple plans coexist in sidebar. Plans persist in mm_horizon_state.' },
      { head: 'CANVAS EXPORT', body: 'Plan → canvas cluster: end-state + condition nodes + resource nodes, all connected. Becomes a live planning map you can reason about visually.' },
      { head: 'RESOURCES', body: 'Track: Time (hrs/wk), Money ($/mo), Energy (0-10), Attention (0-10), Social Capital, Skills Required per plan. Surfaces constraints to solve.' },
    ]
  },
  alm: {
    title: 'ACCELERATED LEARNING MODULE', color: '#00ff88', icon: '∞',
    sections: [
      { head: 'WHAT IT IS', body: 'Tracks 13 intelligence types and 22 intuition types. Makes cognitive growth legible — see which channels are strengthening and which need deliberate training.' },
      { head: 'INTELLIGENCE TYPES', body: '13: Logical, Spatial, Linguistic, Musical, Kinesthetic, Naturalist, Interpersonal, Intrapersonal, Existential, Creative, Emotional, Systems, Embodied. Sync to Brain Map domain highlighting.' },
      { head: 'INTUITION TYPES', body: '22 channels: Ne (divergent), Ni (convergent), Se (present-moment), Si (memory-based), and more. Intuition = pattern recognition operating below conscious processing.' },
      { head: 'DELTA LOG', body: 'Log improvements: Insight, Skill, Pattern, Intuition, Inner Work, Horizon. Builds an immutable ledger of actual growth over time. Each entry timestamped and typed.' },
      { head: 'JAA ARCHITECTURE', body: 'Deltas content-addressed via JAAMemoryStore (SHA-256). JAAMemoryRefs point names to hashes. JAARunner drives stateful gate operations. Full snapshot/restore via MM_RUNNER.' },
    ]
  },
  canvas: {
    title: 'CANVAS', color: '#ffe04a', icon: '⊞',
    sections: [
      { head: 'WHAT IT IS', body: 'Infinite zoomable/pannable cognitive canvas. 18 node types, directed connections, force/radial/cluster layouts. Every entity UUID-tracked in the JAA ledger.' },
      { head: 'SPAWNING NODES', body: 'Right-click canvas background for quick spawn menu at cursor. Or use ⊕ NODE button in toolbar. 18 types: concept, insight, pattern, seed, question, friction, synthesis, and more.' },
      { head: 'NODE CONTROLS', body: 'Drag header to move. Double-click body to edit text. Right-click for options (duplicate, delete, connect, tag). Click ⌁ to link manually, ⊛ to connect to every node sharing a distinctive tag. Ctrl+D to duplicate.' },
      { head: 'KEYBOARD', body: 'V=Void, B=Brain, H=Horizon, S=select, L=link, Ctrl+Z undo, Ctrl+Y redo, Ctrl+A select all, Ctrl+S save, Del delete selected, Escape deselect/cancel.' },
      { head: 'UUID + JAA', body: 'Every node registered in JAA.ledger with UUID, type, delta history. All mutations tracked as immutable deltas. Full audit via JAA.getLog(). Observable via MM_BUS.sampleLog().' },
    ]
  },
};

function showModuleHelp(key) {
  const help = MODULE_HELP[key];
  if (!help) { mm_toast('No help for: ' + key, 'warn'); return; }
  let el = document.getElementById('mm-help-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'mm-help-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.93);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:mmFadeIn .2s ease';
    el.addEventListener('click', function(e) { if (e.target === el) closeModuleHelp(); });
    document.body.appendChild(el);
  }
  el.style.display = 'flex';
  el.innerHTML = '<div style="max-width:680px;width:95%;max-height:88vh;display:flex;flex-direction:column;border:1px solid ' + help.color + '44;background:var(--deep);overflow:hidden">' +
    '<div style="display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid ' + help.color + '33;background:' + help.color + '08;flex-shrink:0">' +
    '<span style="font-size:22px;filter:drop-shadow(0 0 10px ' + help.color + ')">' + help.icon + '</span>' +
    '<div><div style="font-family:var(--f-display);font-size:12px;font-weight:800;letter-spacing:5px;color:' + help.color + '">' + help.title + '</div>' +
    '<div style="font-family:var(--f-mono);font-size:7px;color:' + help.color + '88;letter-spacing:2px;margin-top:2px">MODULE DOCUMENTATION · CLICK OUTSIDE TO CLOSE</div></div>' +
    '<button onclick="closeModuleHelp()" style="margin-left:auto;padding:7px 16px;border:1px solid var(--wire2);background:transparent;color:var(--dim);font-family:var(--f-mono);font-size:7px;letter-spacing:1px;cursor:pointer">✕ CLOSE</button></div>' +
    '<div style="overflow-y:auto;padding:20px 22px;display:flex;flex-direction:column;gap:16px">' +
    help.sections.map(function(s) { return (
      '<div style="border-left:2px solid ' + help.color + '55;padding:0 0 0 14px">' +
      '<div style="font-family:var(--f-display);font-size:8.5px;font-weight:700;letter-spacing:3px;color:' + help.color + ';margin-bottom:6px">' + s.head + '</div>' +
      '<div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);line-height:1.9">' + s.body + '</div>' +
      '</div>'
    ); }).join('') +
    '<div style="border:1px solid rgba(255,255,255,.06);padding:12px 14px;background:rgba(255,255,255,.02)">' +
    '<div style="font-family:var(--f-display);font-size:7.5px;font-weight:700;letter-spacing:3px;color:var(--dim);margin-bottom:6px">FRAMEWORK</div>' +
    '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);line-height:1.8">SISO (Stream In, Stream Out) pure functional event pipeline + JAA delta ledger.<br>' +
    'Observe: <span style="color:var(--c)">MM_BUS.sampleLog()</span> · ' +
    'Inspect: <span style="color:var(--g)">MM_RUNNER.sample()</span> · ' +
    'Events: <span style="color:var(--v)">MM_BUS.on(\'mm.*\', fn)</span></div>' +
    '</div></div></div>';
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.help.open', { key: key });
}
function closeModuleHelp() {
  const el = document.getElementById('mm-help-overlay');
  if (el) el.style.display = 'none';
}


// _brainRAF is declared near brainAnimLoop further in the file
// Guard against undefined reference during closure before declaration
let _brainRAF = null;

// `immediate` skips the 350ms fade. goHome() needs that: it hides the
// homepage's competitors and shows the homepage in the same tick, and a
// full-screen z-index:3000 overlay still sitting there — even invisible —
// is what "the home button does nothing" looks like from the outside.
function closeBrainMap(immediate) {
  const el = document.getElementById('brain-overlay');
  if (!el) return;
  if (immediate) {
    el.classList.remove('open');
    el.style.display = 'none';
    el.style.opacity = '';
    el.style.pointerEvents = '';
    if (typeof _brainRAF !== 'undefined' && _brainRAF) { cancelAnimationFrame(_brainRAF); _brainRAF = null; }
    return;
  }
  el.style.opacity = '0';
  // Stop intercepting clicks immediately, not after the fade finishes.
  // Every call site that closes this overlay and then immediately acts on
  // the canvas underneath (spawnDomainTool, bmv2JumpToNode, brainEnterMode,
  // the old v1 nearest-node jump) was getting blocked for the whole 350ms
  // fade — the overlay stayed display:flex, full-screen, z-index:3000,
  // just invisible, so it caught every click before it could land on
  // anything below. This is what "can't interact with anything" actually
  // was.
  el.style.pointerEvents = 'none';
  setTimeout(() => { el.classList.remove('open'); el.style.display = ''; el.style.pointerEvents = ''; }, 350);
  if (typeof _brainRAF !== 'undefined' && _brainRAF) {
    cancelAnimationFrame(_brainRAF); _brainRAF = null;
  }
  if (typeof BMV2 !== 'undefined' && BMV2._raf) {
    cancelAnimationFrame(BMV2._raf); BMV2._raf = null;
  }
}

// Add pan/zoom to brain canvas
function initBrainMapInteraction() {
  const area = document.getElementById('brain-canvas-area');
  if (!area || area._brainInit) return;
  area._brainInit = true;

  area.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    _brainDrag.active = true;
    _brainDrag.startX = e.clientX;
    _brainDrag.startY = e.clientY;
    _brainDrag.panX = _brainPan.x;
    _brainDrag.panY = _brainPan.y;
    area.style.cursor = 'grabbing';
  });

  // Use named handlers registered once on the document (idempotent via flag on window)
  if (!window._brainDocListeners) {
    window._brainDocListeners = true;
    document.addEventListener('mousemove', e => {
      if (!_brainDrag.active) return;
      _brainPan.x = _brainDrag.panX + (e.clientX - _brainDrag.startX);
      _brainPan.y = _brainDrag.panY + (e.clientY - _brainDrag.startY);
    });
    document.addEventListener('mouseup', () => {
      _brainDrag.active = false;
      const a = document.getElementById('brain-canvas-area');
      if (a) a.style.cursor = 'grab';
    });
  }

  area.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    _brainPan.zoom = Math.max(0.3, Math.min(4, _brainPan.zoom * factor));
  }, { passive: false });

  area.addEventListener('dblclick', e => {
    const cvs = document.getElementById('brain-cvs');
    if (!cvs) return;
    const rect = cvs.getBoundingClientRect();
    const mx = (e.clientX - rect.left - _brainPan.x) / _brainPan.zoom;
    const my = (e.clientY - rect.top - _brainPan.y) / _brainPan.zoom;
    // Find nearest brain node
    let nearest = null, minD = Infinity;
    _bNodes.forEach(bn => {
      const d = Math.hypot(bn.x - mx, bn.y - my);
      if (d < minD) { minD = d; nearest = bn; }
    });
    if (nearest && minD < 40) {
      closeBrainMap();
      CANVAS.enterCanvas();
      setTimeout(() => {
        CANVAS.jumpToNode(nearest.id);
        mm_toast('→ ' + nearest.title, 'brain', {dur:1600});
      }, 200);
    }
  });
}

/* ── Brain Map Render (force-directed with holographic aesthetics) */
let _brainAnimT = 0;


/* ── initBrainMap v1 stub (overridden by BMv2 below) ─── */
function _initBrainMapV1() {
  // BMv2 takes over — defined in brain-map-v2 module below
  if (typeof bmv2Load === 'function') {
    bmv2Load();
    BMV2._dirty = true;
    if (BMV2._raf) cancelAnimationFrame(BMV2._raf);
    BMV2._raf = requestAnimationFrame(bmv2Render);
    if (typeof _bmUpdateSidebar === 'function') _bmUpdateSidebar();
    if (typeof _bmRenderIntelStats === 'function') _bmRenderIntelStats();
    if (typeof _bmBuildCrossdomainPanel === 'function') _bmBuildCrossdomainPanel();
    if (typeof _bmBuildManagePanel === 'function') _bmBuildManagePanel();
    if (typeof _bmSetupBrainInteraction === 'function') _bmSetupBrainInteraction();
    const uuidCount = typeof MMRegistry !== 'undefined' ? MMRegistry.count() : 0;
    const bcU = document.getElementById('bc-uuids');
    if (bcU) bcU.textContent = uuidCount + ' UUIDS';
    if (typeof T !== 'undefined') T.brainPopulated(Object.keys(MM_META_DOMAINS || {}).length);
  }
}

// Domain highlight toggle
let _brainHighlightDomain = null;
let _brainDomains = [];

function highlightBrainDomain(domain) {
  _brainHighlightDomain = _brainHighlightDomain === domain ? null : domain;
}

// Spawn a domain-scoped tool node on canvas
function spawnDomainTool(domain) {
  closeBrainMap();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const color = DOMAINS[domain] || '#00c8ff';
    // Find all nodes in this domain and their connections
    const domainNodes = CANVAS.NX.nodes.filter(n => (CANVAS.NT[n.type]||CANVAS.NT.concept).domain === domain);
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const { x: wx, y: wy } = s2w(cx, cy);
    const hub = CANVAS.spawnNode('framework', wx, wy, {
      title: domain + ' DOMAIN HUB',
      body: 'Nodes: ' + domainNodes.length + ' | Double-click domain in Brain Map to spawn',
      tags: ['DOMAIN-HUB', domain],
    });
    // Link existing domain nodes to the hub
    domainNodes.slice(0, 6).forEach((n, i) => {
      CANVAS.addConn(hub.id, n.id, 'domain:' + domain);
    });
    mm_toast('Domain hub: ' + domain + ' (' + domainNodes.length + ' nodes)', 'brain');
  }, 200);
}

function brainAnimLoop() {
  if (document.hidden) { _brainRAF = requestAnimationFrame(brainAnimLoop); return; }
  const cvs = document.getElementById('brain-cvs');
  if (!cvs || !document.getElementById('brain-overlay').classList.contains('open')) {
    _brainRAF = null; return;
  }
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  _brainAnimT += 0.016;

  ctx.clearRect(0, 0, W, H);

  // Dark space background
  const bgGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.6);
  bgGrad.addColorStop(0, 'rgba(4,10,20,0.95)');
  bgGrad.addColorStop(1, 'rgba(2,4,10,1)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(_brainPan.x, _brainPan.y);
  ctx.scale(_brainPan.zoom, _brainPan.zoom);

  // Physics simulation (only in force mode)
  if (_bNodes.length > 0 && _brainView === 'force') {
    const rep = 3000, att = 0.04, damp = 0.88, cent = 0.003;
    for (let i = 0; i < _bNodes.length; i++) {
      for (let j = i + 1; j < _bNodes.length; j++) {
        const a = _bNodes[i], b = _bNodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 1;
        const f = rep / (d * d);
        a.vx -= (dx/d)*f; a.vy -= (dy/d)*f;
        b.vx += (dx/d)*f; b.vy += (dy/d)*f;
      }
    }
    CANVAS.NX.conns.forEach(cn => {
      const a = _bNodes.find(n => n.id === cn.from);
      const b = _bNodes.find(n => n.id === cn.to);
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      a.vx += dx * att; a.vy += dy * att;
      b.vx -= dx * att; b.vy -= dy * att;
    });
    _bNodes.forEach(n => {
      n.vx *= damp; n.vy *= damp;
      n.vx += -n.x * cent; n.vy += -n.y * cent;
      n.x += n.vx; n.y += n.vy;
      n.pulse += 0.025;
    });
  }

  // Draw holographic grid
  ctx.strokeStyle = 'rgba(0,200,255,0.03)';
  ctx.lineWidth = 0.5;
  for (let x = -800; x <= 800; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, -600); ctx.lineTo(x, 600); ctx.stroke();
  }
  for (let y = -600; y <= 600; y += 60) {
    ctx.beginPath(); ctx.moveTo(-800, y); ctx.lineTo(800, y); ctx.stroke();
  }

  // Draw connections
  CANVAS.NX.conns.forEach(cn => {
    const a = _bNodes.find(n => n.id === cn.from);
    const b = _bNodes.find(n => n.id === cn.to);
    if (!a || !b) return;
    const t = (_brainAnimT * 0.3 + (cn._phase || 0)) % 1;
    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, a.color + '22');
    grad.addColorStop(t, a.color + '88');
    grad.addColorStop(Math.min(1, t + 0.1), b.color + '44');
    grad.addColorStop(1, b.color + '11');
    ctx.strokeStyle = grad; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();

    // Animated particle on connection
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    ctx.fillStyle = a.color; ctx.shadowColor = a.color; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  });

  // Draw domain halos
  const domainGroups = {};
  _bNodes.forEach(n => { if (!domainGroups[n.domain]) domainGroups[n.domain] = []; domainGroups[n.domain].push(n); });
  Object.entries(domainGroups).forEach(([domain, nodes]) => {
    if (nodes.length < 2) return;
    const col = DOMAINS[domain] || '#00c8ff';
    const cx = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const cy = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    const rad = Math.max(...nodes.map(n => Math.hypot(n.x - cx, n.y - cy))) + 40;

    const haloGrad = ctx.createRadialGradient(cx, cy, rad * 0.5, cx, cy, rad);
    haloGrad.addColorStop(0, col + '00');
    haloGrad.addColorStop(0.7, col + '06');
    haloGrad.addColorStop(1, col + '12');
    ctx.fillStyle = haloGrad;
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = col + '18'; ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = col + '55';
    ctx.font = '600 9px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(domain, cx, cy - rad - 6);
  });

  // Draw domain ring labels (outer ring)
  if (_brainDomains && _brainDomains.length) {
    _brainDomains.forEach(d => {
      const active = !_brainHighlightDomain || _brainHighlightDomain === d.name;
      ctx.globalAlpha = active ? 1 : 0.25;
      ctx.fillStyle = d.color;
      ctx.font = 'bold 8px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.name, d.x, d.y);
      ctx.font = '7px "Space Grotesk", sans-serif';
      ctx.fillStyle = d.color + '99';
      ctx.fillText(d.nodes + ' nodes', d.x, d.y + 12);
      ctx.globalAlpha = 1;
    });
  }

  // Draw nodes (dim non-highlighted domains)
  _bNodes.forEach(n => {
    const domainMatch = !_brainHighlightDomain || n.domain === _brainHighlightDomain;
    if (!domainMatch) ctx.globalAlpha = 0.15;
    const pulseMag = 0.15 + 0.05 * Math.sin(n.pulse);
    const r = n.r * (1 + pulseMag);

    // Outer glow
    const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
    glow.addColorStop(0, n.color + '44');
    glow.addColorStop(0.5, n.color + '11');
    glow.addColorStop(1, n.color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2); ctx.fill();

    // Core node
    const coreGrad = ctx.createRadialGradient(n.x - r*0.3, n.y - r*0.3, 0, n.x, n.y, r);
    coreGrad.addColorStop(0, n.color + 'ff');
    coreGrad.addColorStop(0.6, n.color + 'bb');
    coreGrad.addColorStop(1, n.color + '44');
    ctx.fillStyle = coreGrad;
    ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();

    // Label
    ctx.fillStyle = n.color;
    ctx.font = '500 8px "Space Grotesk", sans-serif';
    ctx.textAlign = 'center';
    const label = n.title.length > 18 ? n.title.slice(0, 18) + '…' : n.title;
    ctx.fillText(label, n.x, n.y + r + 12);
    ctx.globalAlpha = 1;
  });

  ctx.restore();

  _brainRAF = requestAnimationFrame(brainAnimLoop);
}

function brainSetView(v) {
  _brainView = v;
  document.querySelectorAll('.brain-ctrl-btn').forEach(b => b.classList.remove('act'));
  document.getElementById('bv-' + v)?.classList.add('act');

  if (v === 'radial') {
    const n = _bNodes.length;
    _bNodes.forEach((node, i) => {
      const ang = (i / n) * Math.PI * 2;
      const r = 200 + node.depth * 60;
      node.x = Math.cos(ang) * r; node.y = Math.sin(ang) * r;
      node.vx = 0; node.vy = 0;
    });
  } else if (v === 'domain') {
    const groups = {};
    _bNodes.forEach(n => { if (!groups[n.domain]) groups[n.domain] = []; groups[n.domain].push(n); });
    const dk = Object.keys(groups);
    dk.forEach((d, di) => {
      const ang = (di / dk.length) * Math.PI * 2;
      groups[d].forEach((n, ni) => {
        const spread = (ni / groups[d].length) * Math.PI * 2;
        n.x = Math.cos(ang) * 280 + Math.cos(spread) * 80;
        n.y = Math.sin(ang) * 280 + Math.sin(spread) * 80;
        n.vx = 0; n.vy = 0;
      });
    });
  } else {
    // Force — randomize for re-settling
    _bNodes.forEach(n => { n.vx = (Math.random() - .5) * 3; n.vy = (Math.random() - .5) * 3; });
  }
  mm_toast('View: ' + v, 'brain', {dur:1600});
}

function brainTab(t) {
  // Use onclick attribute matching for reliable tab switching
  document.querySelectorAll('.brain-tab').forEach(b => {
    const attr = b.getAttribute('onclick') || '';
    b.classList.toggle('act', attr.includes("'" + t + "'"));
  });
  document.querySelectorAll('.brain-tab-body').forEach(b => b.classList.toggle('act', b.id === 'bt-' + t));
  // Legacy fallbacks (overridden by bmv2 tab system below)
  if (t === 'intel') { if (typeof renderIntelligenceStats === 'function') renderIntelligenceStats(); }
  if (t === 'cross') { if (typeof renderCrossDomainMatrix === 'function') renderCrossDomainMatrix(); }
}

console.log('[MASTERMIND] Engine loaded — QA clean');



/* ── Node Spawn Dropdown Menu ──────────────────────────────────── */
let _spawnMenuOpen = false;

function toggleSpawnMenu(e) {
  if (e) e.stopPropagation();
  _spawnMenuOpen = !_spawnMenuOpen;
  const menu = document.getElementById('spawn-menu');
  if (menu) menu.style.display = _spawnMenuOpen ? 'block' : 'none';
}

function closeSpawnMenu() {
  _spawnMenuOpen = false;
  const m = document.getElementById('spawn-menu');
  if (m) m.style.display = 'none';
}

function spawnFromMenu(type) {
  closeSpawnMenu();
  if (type === 'custom') { openCustomNodeDialog(); return; }
  const { x: wx, y: wy } = s2w(window.innerWidth / 2, window.innerHeight / 2 + 100);
  CANVAS.spawnNode(type, wx, wy);
}

async function openCustomNodeDialog() {
  const title = await mmPrompt('Node name:'); if (!title) return;
  const icon  = (await mmPrompt('Icon (emoji or char):', '✎')) || '✎';
  const color = (await mmPrompt('Color (hex):', '#aaaaaa')) || '#aaaaaa';
  const domain = ((await mmPrompt('Domain:', 'CUSTOM')) || 'CUSTOM').toUpperCase();
  const key = 'c_' + Date.now();
  CANVAS.NT[key] = { icon, color, badge: title.slice(0,8).toUpperCase(), domain, ph: 'Your custom node...' };
  if (!DOMAINS[domain]) DOMAINS[domain] = color;
  const { x: wx, y: wy } = s2w(window.innerWidth / 2, window.innerHeight / 2 + 100);
  CANVAS.spawnNode(key, wx, wy, { title });
}

document.addEventListener('click', e => {
  if (_spawnMenuOpen && !e.target.closest('#spawn-menu') && !e.target.closest('#spawn-menu-btn')) {
    closeSpawnMenu();
  }
});

/* ═══════════════════════════════════════════════════════════════════
   GAP CANVAS — Two-node tension bridge system
   Framework: "Map the space between two things; the gap IS the leverage"
═══════════════════════════════════════════════════════════════════ */
const GAP_STATE = {
  sessions: [],  // [{id, nodeA, nodeB, gaps:[{id,text,bridged,bridges:[]}], created}]
  active: null,  // active session id
};
const GAP_KEY = 'nexus_gap_state';

function initGapCanvas() {
  try {
    const s = localStorage.getItem(GAP_KEY);
    if (s) Object.assign(GAP_STATE, JSON.parse(s));
  } catch(e) {}
  renderGapSessions();
}

function saveGapState() {
  try { localStorage.setItem(GAP_KEY, JSON.stringify(GAP_STATE)); } catch(e) {}
}

function newGapSession() {
  const a = document.getElementById('gap-node-a')?.value.trim();
  const b = document.getElementById('gap-node-b')?.value.trim();
  if (!a || !b) { toast('Enter both nodes to create a gap'); return; }
  const sess = { id: uuid(), nodeA: a, nodeB: b, gaps: [], created: Date.now() };
  // Create initial gap automatically
  sess.gaps.push({ id: uuid(), text: 'GAP: ' + a + ' ↔ ' + b, bridged: false, bridges: [], auto: true });
  GAP_STATE.sessions.push(sess);
  GAP_STATE.active = sess.id;
  if (document.getElementById('gap-node-a')) document.getElementById('gap-node-a').value = '';
  if (document.getElementById('gap-node-b')) document.getElementById('gap-node-b').value = '';
  saveGapState();
  renderGapSessions();
  renderActiveGap();
}

function addGapBridge() {
  const sess = GAP_STATE.sessions.find(s => s.id === GAP_STATE.active);
  if (!sess) return;
  const inp = document.getElementById('gap-bridge-input');
  const text = inp?.value.trim(); if (!text) return;
  // Add bridge to last unbridged gap
  const lastGap = sess.gaps.filter(g => !g.bridged).slice(-1)[0];
  if (lastGap) {
    lastGap.bridges.push({ id: uuid(), text, created: Date.now() });
    // Auto-create next gap
    sess.gaps.push({ id: uuid(), text: 'GAP → ' + text + ' → ?', bridged: false, bridges: [], auto: true });
  }
  if (inp) inp.value = '';
  saveGapState();
  renderActiveGap();
}

function bridgeComplete(gapId) {
  const sess = GAP_STATE.sessions.find(s => s.id === GAP_STATE.active);
  if (!sess) return;
  const gap = sess.gaps.find(g => g.id === gapId);
  if (gap) { gap.bridged = true; saveGapState(); renderActiveGap(); toast('Gap bridged ✓'); }
}

function exportGapToCanvas() {
  const sess = GAP_STATE.sessions.find(s => s.id === GAP_STATE.active);
  if (!sess) { toast('No active gap session'); return; }
  CANVAS.enterCanvas();
  setTimeout(() => {
    // Spawn node A and node B
    const nA = CANVAS.spawnNode('concept', 300, 300, { title: sess.nodeA, tags: ['GAP-A'] });
    const nB = CANVAS.spawnNode('concept', 700, 300, { title: sess.nodeB, tags: ['GAP-B'] });
    // Spawn gap node between
    let prevId = nA.id;
    sess.gaps.forEach((gap, i) => {
      const gn = CANVAS.spawnNode('gap', 500 + i * 60, 300 + i * 80, {
        title: gap.text,
        body: gap.bridges.map(b => b.text).join(' → '),
        tags: gap.bridged ? ['BRIDGED'] : ['OPEN-GAP'],
      });
      CANVAS.addConn(prevId, gn.id, gap.bridged ? 'bridged' : 'gap');
      gap.bridges.forEach((br, bi) => {
        const bn = CANVAS.spawnNode('synthesis', 500 + i * 60 + bi * 60, 400 + i * 80, {
          title: br.text, tags: ['BRIDGE'],
        });
        CANVAS.addConn(gn.id, bn.id, 'bridge');
      });
      prevId = gn.id;
    });
    CANVAS.addConn(prevId, nB.id, 'tension');
    mm_toast('Gap session → canvas', 'export');
    closeVoid();
  }, 200);
}

function renderGapSessions() {
  const el = document.getElementById('gap-sessions-list'); if (!el) return;
  if (!GAP_STATE.sessions.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);text-align:center;padding:12px">No gap sessions yet</div>';
    return;
  }
  el.innerHTML = '';
  GAP_STATE.sessions.forEach(s => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:6px 10px;border-bottom:1px solid var(--wire);cursor:pointer;font-family:var(--f-mono);font-size:8px;' +
      (s.id === GAP_STATE.active ? 'color:var(--c);background:rgba(0,200,255,.05)' : 'color:var(--muted)');
    div.textContent = s.nodeA + ' ↔ ' + s.nodeB + ' (' + s.gaps.length + ' gaps)';
    div.addEventListener('click', () => selectGapSession(s.id));
    el.appendChild(div);
  });
}

function selectGapSession(id) {
  GAP_STATE.active = id;
  renderGapSessions();
  renderActiveGap();
}

function renderActiveGap() {
  const el = document.getElementById('gap-canvas-area'); if (!el) return;
  const sess = GAP_STATE.sessions.find(s => s.id === GAP_STATE.active);
  if (!sess) { el.innerHTML = ''; return; }
  el.innerHTML = '';

  // Header row
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap';
  const pillA = document.createElement('div'); pillA.className = 'gap-node-pill gap-pill-a'; pillA.textContent = sess.nodeA;
  const line  = document.createElement('div'); line.style.cssText = 'flex:1;height:1px;background:linear-gradient(90deg,var(--o),var(--v));min-width:20px';
  const pillB = document.createElement('div'); pillB.className = 'gap-node-pill gap-pill-b'; pillB.textContent = sess.nodeB;
  header.append(pillA, line, pillB);
  el.appendChild(header);

  sess.gaps.forEach(gap => {
    const wrap = document.createElement('div');
    wrap.className = 'gap-item' + (gap.bridged ? ' gap-bridged' : '');
    wrap.dataset.gapId = gap.id;

    const hdr = document.createElement('div'); hdr.className = 'gap-item-header';
    const lbl = document.createElement('span'); lbl.className = 'gap-label'; lbl.textContent = gap.bridged ? '✓ BRIDGED' : '⟷ GAP';
    const txt = document.createElement('span'); txt.style.cssText = 'font-family:var(--f-mono);font-size:8px;color:var(--mid)'; txt.textContent = gap.text;
    hdr.append(lbl, txt);
    if (!gap.bridged) {
      const btn = document.createElement('button'); btn.className = 'gap-bridge-complete-btn'; btn.textContent = 'Bridge Complete';
      btn.addEventListener('click', () => bridgeComplete(gap.id));
      hdr.appendChild(btn);
    }
    wrap.appendChild(hdr);

    gap.bridges.forEach(b => {
      const br = document.createElement('div'); br.className = 'gap-bridge-item'; br.textContent = '⇀ ' + b.text;
      wrap.appendChild(br);
    });

    el.appendChild(wrap);
  });
}


/* ═══════════════════════════════════════════════════════════════════
   THE FRAMEWORK — Engine functions
   Oscillatory Loop · Tension as Fuel · Signal/Noise · Gap Canvas
   Hostile Verification · Emergent Synthesis
═══════════════════════════════════════════════════════════════════ */

/* ── Signal / Noise state ────────────────────────────────────── */
const SIGNAL_STATE = { items: [] };

function addSignalItem() {
  const inp = document.getElementById('signal-input');
  const text = inp?.value.trim(); if (!text) return;
  SIGNAL_STATE.items.push({ id: uuid(), text, alignment: 3, fidelity: 3, expansion: 3 });
  inp.value = '';
  renderSignalItems();
}

function renderSignalItems() {
  const el = document.getElementById('signal-items-list'); if (!el) return;
  el.innerHTML = '';
  if (!SIGNAL_STATE.items.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);text-align:center;padding:10px">No items yet</div>';
    return;
  }
  SIGNAL_STATE.items.forEach(item => {
    const score = item.alignment + item.fidelity + item.expansion;
    const isSignal = score >= 9;
    const col = isSignal ? 'var(--g)' : score >= 6 ? 'var(--o)' : 'var(--r)';
    const row = document.createElement('div');
    row.style.cssText = 'padding:8px 10px;border-bottom:1px solid var(--wire);display:flex;align-items:center;gap:10px';

    const label = document.createElement('div');
    label.style.cssText = 'font-family:var(--f-mono);font-size:8px;color:var(--mid);flex:1';
    label.textContent = item.text;

    const sliders = document.createElement('div');
    sliders.style.cssText = 'display:flex;gap:4px;align-items:center;flex-shrink:0';
    ['alignment','fidelity','expansion'].forEach((field, fi) => {
      const lbl = document.createElement('span');
      lbl.style.cssText = 'font-family:var(--f-mono);font-size:6.5px;color:var(--dim)';
      lbl.textContent = ['A:','F:','E:'][fi];
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = 1; inp.max = 5; inp.value = item[field];
      inp.style.width = '44px';
      inp.addEventListener('input', e => updateSignalScore(item.id, field, e.target.value));
      sliders.append(lbl, inp);
    });

    const score_el = document.createElement('div');
    score_el.style.cssText = 'font-family:var(--f-display);font-size:9px;font-weight:700;color:' + col + ';min-width:60px;text-align:right';
    score_el.textContent = (isSignal ? 'SIGNAL' : score >= 6 ? 'MID' : 'NOISE') + ' ' + score;

    row.append(label, sliders, score_el);
    el.appendChild(row);
  });
}

function updateSignalScore(id, field, val) {
  const item = SIGNAL_STATE.items.find(i => i.id === id);
  if (item) { item[field] = parseInt(val); renderSignalItems(); }
}

function flushSignalToCanvas(type) {
  const filtered = SIGNAL_STATE.items.filter(item => {
    const score = item.alignment + item.fidelity + item.expansion;
    return type === 'signal' ? score >= 9 : score < 6;
  });
  if (!filtered.length) { toast('No ' + type + ' items to flush'); return; }
  CANVAS.enterCanvas();
  setTimeout(() => {
    filtered.forEach((item, i) => {
      CANVAS.spawnNode(type === 'signal' ? 'signal' : 'noise',
        400 + i * 220, 300 + (i % 2) * 120,
        { title: item.text, body: 'A:' + item.alignment + ' F:' + item.fidelity + ' E:' + item.expansion, tags: [type.toUpperCase()] }
      );
    });
    mm_toast(filtered.length + ' ' + type + ' nodes → canvas', 'export');
    closeVoid();
  }, 200);
}

/* ── Oscillatory Loop ──────────────────────────────────────── */
function exportOscToCanvas() {
  const res = document.getElementById('osc-resolution')?.value.trim();
  const ins = document.getElementById('osc-insight')?.value.trim();
  const log = document.getElementById('osc-log')?.value.trim();
  if (!res && !ins) { toast('Add resolution and insight first'); return; }
  CANVAS.enterCanvas();
  setTimeout(() => {
    const resNode = res ? CANVAS.spawnNode('framework', 400, 280, { title: 'RESOLUTION: ' + res.slice(0,40), body: res, tags: ['OSCILLATION','RESOLUTION'] }) : null;
    const insNode = ins ? CANVAS.spawnNode('insight', 700, 280, { title: 'INSIGHT: ' + ins.slice(0,40), body: ins, tags: ['OSCILLATION','INSIGHT'] }) : null;
    if (resNode && insNode) {
      CANVAS.addConn(resNode.id, insNode.id, 'oscillates ↔');
      CANVAS.addConn(insNode.id, resNode.id, 'feeds back');
    }
    if (log) {
      const logNode = CANVAS.spawnNode('synthesis', 550, 420, { title: 'LOOP LOG', body: log, tags: ['OSCILLATION','FEEDBACK'] });
      if (resNode) CANVAS.addConn(logNode.id, resNode.id, 'amplifies');
    }
    mm_toast('Oscillatory loop → canvas', 'export');
    closeVoid();
  }, 200);
}

function clearOsc() {
  ['osc-resolution','osc-insight','osc-log'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

/* ── Tension Loop ──────────────────────────────────────────── */
function exportTensionToCanvas() {
  const fields = {
    tension: document.getElementById('tension-input')?.value.trim(),
    generate: document.getElementById('tension-generate')?.value.trim(),
    test: document.getElementById('tension-test')?.value.trim(),
    reflect: document.getElementById('tension-reflect')?.value.trim(),
    amplify: document.getElementById('tension-amplify')?.value.trim(),
  };
  if (!fields.tension) { toast('Describe the tension first'); return; }
  CANVAS.enterCanvas();
  setTimeout(() => {
    const tNode = CANVAS.spawnNode('friction', 300, 300, { title: 'TENSION: ' + fields.tension.slice(0,40), body: fields.tension, tags: ['TENSION-LOOP'] });
    let prev = tNode;
    const steps = [
      { key: 'generate', type: 'seed', label: 'GENERATE' },
      { key: 'test', type: 'friction', label: 'TEST' },
      { key: 'reflect', type: 'insight', label: 'REFLECT' },
      { key: 'amplify', type: 'synthesis', label: 'AMPLIFY' },
    ];
    steps.forEach((step, i) => {
      if (!fields[step.key]) return;
      const n = CANVAS.spawnNode(step.type, 300 + (i+1)*200, 300, {
        title: step.label + ': ' + fields[step.key].slice(0,40),
        body: fields[step.key], tags: ['TENSION-LOOP', step.label],
      });
      CANVAS.addConn(prev.id, n.id, step.label.toLowerCase());
      prev = n;
    });
    // Close the loop back to tension
    CANVAS.addConn(prev.id, tNode.id, 'feeds back');
    mm_toast('Tension loop → canvas', 'export');
    closeVoid();
  }, 200);
}

/* ── Hostile Verification ──────────────────────────────────── */
function exportHostileToCanvas() {
  const idea = document.getElementById('hostile-input')?.value.trim();
  if (!idea) { toast('Enter the idea to verify first'); return; }
  const questions = [
    { id: 'hostile-q1', label: 'WEAK ASSUMPTION', type: 'friction' },
    { id: 'hostile-q2', label: 'FAILURE MODE', type: 'gap' },
    { id: 'hostile-q3', label: 'OPPOSITE TRUE?', type: 'question' },
    { id: 'hostile-q4', label: 'FEELS ALIVE?', type: 'signal' },
  ];
  CANVAS.enterCanvas();
  setTimeout(() => {
    const coreNode = CANVAS.spawnNode('framework', 500, 300, { title: 'VERIFY: ' + idea.slice(0,40), body: idea, tags: ['HOSTILE-VERIFY'] });
    questions.forEach((q, i) => {
      const val = document.getElementById(q.id)?.value.trim();
      if (!val) return;
      const n = CANVAS.spawnNode(q.type, 300 + i * 200, 480, {
        title: q.label + ': ' + val.slice(0,35), body: val, tags: ['HOSTILE-VERIFY', q.label],
      });
      CANVAS.addConn(coreNode.id, n.id, q.label.toLowerCase());
    });
    mm_toast('Verified structure → canvas', 'export');
    closeVoid();
  }, 200);
}

/* ── Emergent Synthesis — Thread system ────────────────────── */
const THREAD_STATE = { threads: { emotional: [], cognitive: [], external: [] } };

function addThread() {
  const inp = document.getElementById('thread-input');
  const typeEl = document.getElementById('thread-type');
  const text = inp?.value.trim(); if (!text) return;
  const type = typeEl?.value || 'cognitive';
  THREAD_STATE.threads[type].push({ id: uuid(), text, created: Date.now() });
  inp.value = '';
  renderThreads();
}

function renderThreads() {
  const cols = { emotional: 'var(--pk)', cognitive: 'var(--c)', external: 'var(--o)' };
  ['emotional','cognitive','external'].forEach(type => {
    const el = document.getElementById('threads-' + type); if (!el) return;
    el.innerHTML = '';
    if (!THREAD_STATE.threads[type].length) {
      el.innerHTML = '<div style="color:var(--wire2);font-size:7px">empty</div>';
      return;
    }
    THREAD_STATE.threads[type].forEach(t => {
      const div = document.createElement('div');
      div.style.cssText = 'padding:2px 0;cursor:pointer;border-bottom:1px solid var(--wire)';
      div.title = 'Click to remove';
      div.innerHTML = '<span style="color:' + cols[type] + '">⇀</span> ' + escH(t.text);
      div.addEventListener('click', () => removeThread(type, t.id));
      el.appendChild(div);
    });
  });
}

function removeThread(type, id) {
  THREAD_STATE.threads[type] = THREAD_STATE.threads[type].filter(t => t.id !== id);
  renderThreads();
}

function synthesizeThreads() {
  const convergence = document.getElementById('synthesis-convergence')?.value.trim();
  const allThreads = Object.entries(THREAD_STATE.threads).flatMap(([type, threads]) =>
    threads.map(t => ({ ...t, type }))
  );
  if (!allThreads.length && !convergence) { toast('Add threads first'); return; }
  CANVAS.enterCanvas();
  setTimeout(() => {
    // Spawn compartment nodes
    const compartments = {};
    ['emotional','cognitive','external'].forEach((type, ti) => {
      if (!THREAD_STATE.threads[type].length) return;
      const col = { emotional: 'var(--pk)', cognitive: 'var(--c)', external: 'var(--o)' }[type];
      THREAD_STATE.threads[type].forEach((thread, i) => {
        const n = CANVAS.spawnNode('vector', 200 + ti * 250, 300 + i * 100, {
          title: thread.text.slice(0,40), tags: [type.toUpperCase(), 'THREAD'],
        });
        if (!compartments[type]) compartments[type] = n;
        else CANVAS.addConn(compartments[type].id, n.id, 'thread');
      });
    });
    // Convergence synthesis node
    if (convergence) {
      const syn = CANVAS.spawnNode('synthesis', 500, 500, {
        title: 'SYNTHESIS: ' + convergence.slice(0,40), body: convergence, tags: ['EMERGENT','SYNTHESIS'],
      });
      Object.values(compartments).forEach(n => CANVAS.addConn(n.id, syn.id, 'converges →'));
    }
    mm_toast('Synthesis → canvas', 'export');
    closeVoid();
  }, 200);
}

/* ═══════════════════════════════════════════════════════════════════
   MASTERMIND AUTH SYSTEM — E2E local encryption
   PBKDF2-SHA256 (310k iter) → AES-256-GCM key
   Vault stored as encrypted JSON in localStorage
═══════════════════════════════════════════════════════════════════ */

const AUTH = {
  key: null,           // CryptoKey - active session key (null = NOT authenticated)
  username: null,
  hasPin: false,
  pinHash: null,       // SHA-256 of pin (not the encryption key)
  features: { canvas: true, brain: true, void: true },
  encrypted: true,     // HARDENED DEFAULT: vault always encrypted unless explicitly opted out
  pinVerified: false,  // PIN-only session — read-only, no decryption key
  sessionId: null,     // Bound at login, validated on every gate crossing
  _unlocked: false,    // Internal seal — true only after successful auth gate
};
const AUTH_META_KEY  = 'nexus_auth_meta';
const AUTH_VAULT_KEY = 'nexus_auth_vault';
const FEATURES_KEY   = 'nexus_features';

// Persists the non-secret identity marker _authLoadMeta() reads on the next
// launch: just the username (already shown throughout the UI regardless)
// and whether this vault opted out of encryption. Deliberately excludes
// pinHash — a PIN hash in localStorage would be both a credential outside
// the vault and trivially brute-forceable offline against a 4-digit
// keyspace (see optsChangePin's own note on this). That means PIN
// quick-unlock only works within a session that has already opened the
// vault with the password once — not across a full relaunch. That's the
// correct narrower model, not something to route around.
function _persistIdentityMarker({ username, noEncryption }) {
  try {
    localStorage.setItem(AUTH_META_KEY, JSON.stringify({
      username: username || null,
      noEncryption: !!noEncryption,
      version: 6,
    }));
  } catch (e) {
    MMLog?.warn('auth', 'Could not persist identity marker: ' + e.message);
  }
}

/* ═══════════════════════════════════════════════════════════════════
   SECURITY HARDENING LAYER — v1.0
   • _assertAuth()     — single gate for ALL navigation entry points
   • _lockSession()    — hard wipe of in-memory key + return to login
   • Brute-force lockout (5 attempts → 30s → exponential backoff)
   • PIN sessions are read-only (saves blocked, warning banner shown)
   • Logo / home clicks blocked while startup-screen is visible
═══════════════════════════════════════════════════════════════════ */

// ── Brute-force throttle state ─────────────────────────────────────
const _BF = {
  attempts: 0,
  lockedUntil: 0,
  maxAttempts: 5,
  baseDelay: 30000,     // 30s base, doubles each lockout
  multiplier: 1,
};

function _bfRecord() {
  _BF.attempts++;
  if (_BF.attempts >= _BF.maxAttempts) {
    const delay = _BF.baseDelay * _BF.multiplier;
    _BF.lockedUntil = Date.now() + delay;
    _BF.multiplier = Math.min(_BF.multiplier * 2, 64); // cap at ~32min
    _BF.attempts = 0;
    MMLog?.warn('security', `Brute-force lockout: ${delay/1000}s`);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.security.lockout', { delay });
  }
}

function _bfCheck() {
  if (_BF.lockedUntil && Date.now() < _BF.lockedUntil) {
    const rem = Math.ceil((_BF.lockedUntil - Date.now()) / 1000);
    return rem; // seconds remaining
  }
  return 0;
}

function _bfReset() {
  _BF.attempts = 0;
  _BF.lockedUntil = 0;
  // do NOT reset multiplier — keep penalty history for session
}

// ── Session seal ───────────────────────────────────────────────────
// _assertAuth() is the SINGLE choke-point for all navigation.
// Every function that dismisses startup-screen or shows app content
// MUST call this first. It returns true only when session is sealed.
function _assertAuth() {
  if (!AUTH._unlocked) {
    MMLog?.warn('security', '_assertAuth DENIED — session not sealed');
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.security.gate_denied', { caller: new Error().stack?.split('\n')[2]?.trim() });
    // If startup-screen is somehow hidden, re-show it
    const ss = document.getElementById('startup-screen');
    const hp = document.getElementById('homepage');
    if (ss) ss.classList.remove('hidden');
    if (hp) hp.classList.add('hidden');
    return false;
  }
  return true;
}

// ── Session seal/wipe ──────────────────────────────────────────────
// ── Bridge registration (MM-003) ─────────────────────────────────────
// Registers MASTERMIND with the NEXUS bridge so it appears in the node
// registry and can receive/send intent-routed events.
// Degrades gracefully — MASTERMIND works fully if bridge is offline.
async function registerWithBridge() {
  try {
    const res = await fetch('http://localhost:3747/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mastermind',
        url: 'electron://mastermind',
        capabilities: ['canvas', 'brain-map', 'voice-lattice', 'human-models',
                       'horizon', 'body', 'gap', 'signal', 'vault'],
        uuid: 'mastermind-cognitive-canvas-v3-000-000000000001',
        version: MM_VERSION,
      }),
    });
    const ok = res.ok;
    _updateBridgeDot(ok);
    if (ok && typeof MM_BUS !== 'undefined') {
      MM_BUS.emit('mm.bridge.connected', { bridgeUrl: 'http://localhost:3747' });
      MMLog?.info('bridge', 'Registered with NEXUS bridge at :3747');
    }
  } catch(e) {
    _updateBridgeDot(false);
    MMLog?.info('bridge', 'Bridge offline — degraded gracefully (' + e.message + ')');
  }
}

// Bridge status indicator — small dot in topbar
function _updateBridgeDot(connected) {
  let dot = document.getElementById('mm-bridge-dot');
  if (!dot) {
    // Create dot if not in HTML — place after logo
    const logo = document.querySelector('.mm-logo, #mm-logo, .topbar-logo');
    if (!logo) return;
    dot = document.createElement('span');
    dot.id = 'mm-bridge-dot';
    dot.title = connected ? 'NEXUS bridge connected' : 'NEXUS bridge offline';
    dot.style.cssText = [
      'display:inline-block;width:6px;height:6px;border-radius:50%',
      'margin-left:8px;vertical-align:middle',
      'transition:background .4s',
    ].join(';');
    logo.after(dot);
  }
  dot.style.background = connected ? '#00ff88' : '#444';
  dot.title = connected ? 'NEXUS bridge connected' : 'NEXUS bridge offline';
}

// ── Resume / New Session choice ────────────────────────────────────
// Shown once per unlock (unless "don't show again" is set) when there's
// existing canvas content to actually resume — no point asking if the
// canvas is empty. "New session" resets the view only (pan/zoom), it
// never deletes node data — that's a separate, deliberate action
// elsewhere, not something a session-start prompt should risk doing.
const SESSION_CHOICE_KEY = 'mm_session_choice_pref';

function _getSessionChoicePref() {
  try { return JSON.parse(localStorage.getItem(SESSION_CHOICE_KEY) || '{}'); } catch (e) { return {}; }
}
function _setSessionChoicePref(pref) {
  try { localStorage.setItem(SESSION_CHOICE_KEY, JSON.stringify(pref)); } catch (e) {}
}
function _resetSessionViewport() {
  if (typeof CANVAS !== 'undefined' && CANVAS.NX) {
    CANVAS.NX.panX = 0; CANVAS.NX.panY = 0; CANVAS.NX.zoom = 1;
    if (typeof CANVAS.applyT === 'function') CANVAS.applyT();
  }
}

function _maybeShowSessionChoice(onProceed) {
  const pref = _getSessionChoicePref();
  const hasExisting = typeof CANVAS !== 'undefined' && CANVAS.NX && CANVAS.NX.nodes && CANVAS.NX.nodes.length > 0;

  if (!hasExisting || pref.dontAsk) {
    if (pref.dontAsk && pref.lastChoice === 'new') _resetSessionViewport();
    onProceed();
    return;
  }

  const scr = document.getElementById('session-choice-screen');
  if (!scr) { onProceed(); return; } // safety fallback if HTML somehow missing

  scr.style.display = 'flex';
  scr.style.pointerEvents = 'auto';
  requestAnimationFrame(() => { scr.style.opacity = '1'; });

  window._mmSessionChoiceProceed = (choice) => {
    const dontAsk = document.getElementById('session-choice-dontask')?.checked || false;
    _setSessionChoicePref({ dontAsk, lastChoice: choice });
    // Same pointer-events discipline as closeBrainMap/closeVoid/dismissWelcomeScreen —
    // stop catching clicks the instant the fade starts, not after it finishes.
    scr.style.opacity = '0';
    scr.style.pointerEvents = 'none';
    setTimeout(() => { scr.style.display = 'none'; }, 300);
    if (choice === 'new') _resetSessionViewport();
    onProceed();
  };
}

function _sealSession(username) {
  AUTH._unlocked = true;
  AUTH.sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  _bfReset();
  MMLog?.info('security', `Session sealed for: ${username} | sid: ${AUTH.sessionId}`);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.session.sealed', { username, sid: AUTH.sessionId });
}

function _lockSession(reason) {
  AUTH.key = null;
  AUTH._unlocked = false;
  AUTH.sessionId = null;
  AUTH.pinVerified = false;
  AUTH.encrypted = true; // reset to hardened default
  MMLog?.info('security', `Session locked: ${reason || 'explicit'}`);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.session.locked', { reason });
  const hp = document.getElementById('homepage');
  const ss = document.getElementById('startup-screen');
  const cv = document.getElementById('canvas-wrap');
  if (hp) hp.classList.add('hidden');
  if (cv) cv.classList.remove('visible');
  if (ss) { ss.classList.remove('hidden'); _ssShow('ss-login'); }
  setTimeout(() => document.getElementById('login-password')?.focus(), 150);
}

// ── PIN session read-only enforcement ─────────────────────────────
function _isPinReadOnly() {
  // → mastermind-vault.js
  return typeof AUTH !== 'undefined' && AUTH.pinVerified === true && !AUTH.key;
}

function _pinReadOnlyBanner() {
  if (!_isPinReadOnly()) return;
  let b = document.getElementById('_mm_pin_banner');
  if (b) return; // already shown
  b = document.createElement('div');
  b.id = '_mm_pin_banner';
  b.style.cssText = [
    'position:fixed;top:38px;left:0;right:0;z-index:9999',
    'background:#8b4000;color:#ffcc88;font-size:10px;letter-spacing:1.5px',
    'text-align:center;padding:4px 12px;font-family:var(--f-mono,monospace)',
    'pointer-events:none;border-bottom:1px solid #cc6600',
  ].join(';');
  b.textContent = '⚠  PIN SESSION — READ-ONLY · VAULT WRITES DISABLED · Unlock with password to save';
  document.body.appendChild(b);
}

/* ── Startup flow router ─────────────────────────────────────── */
// ── Vault watchdog: called before EVERY gate ──────────────────────
// _vaultWatchdogCheck, _showVaultMissingScreen, _vaultRecreate*, _vaultRestoreFromBackup
// → implemented in mastermind-vault.js (loaded before this file)

/* ── Desktop Required Screen ─────────────────────────────────────
   Shown when MASTERMIND is opened in a browser without Electron.
   MASTERMIND uses real filesystem vault storage only.
   localStorage is a session cache — never the primary store.
─────────────────────────────────────────────────────────────── */
function _showDesktopRequiredScreen() {
  // Hide all startup screens — inline display included, or a screen that set
  // its own display:flex stays visible underneath this one.
  if (typeof mmHideAllStartupScreens === 'function') mmHideAllStartupScreens();
  else document.querySelectorAll('.startup-inner').forEach(el => { el.classList.add('hidden'); el.style.display = ''; });
  document.getElementById('homepage')?.classList.add('hidden');
  document.getElementById('mm-steps')?.style && (document.getElementById('mm-steps').style.display = 'none');

  const screen = document.getElementById('startup-screen');
  if (screen) screen.classList.remove('hidden');

  let el = document.getElementById('ss-desktop-required');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ss-desktop-required';
    el.className = 'startup-inner';
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:48px 24px;text-align:center;height:100%';
    screen.appendChild(el);
  }
  el.classList.remove('hidden');
  el.style.display = 'flex';

  el.innerHTML = `
    <div style="font-size:48px;filter:drop-shadow(0 0 24px #ff3355)">⬡</div>

    <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
      <div style="font-family:var(--f-display);font-size:22px;font-weight:800;letter-spacing:8px;
        background:linear-gradient(135deg,var(--c),var(--v));-webkit-background-clip:text;
        -webkit-text-fill-color:transparent;background-clip:text">MASTERMIND</div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:700;letter-spacing:4px;
        color:var(--r)">DESKTOP APP REQUIRED</div>
    </div>

    <div style="max-width:480px;display:flex;flex-direction:column;gap:10px">
      <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);line-height:2;
        border:1px solid rgba(255,51,85,.2);padding:16px 20px;background:rgba(255,51,85,.04)">
        MASTERMIND uses <span style="color:var(--c)">real filesystem vault storage</span> only.<br>
        Browser-only mode is disabled — your cognitive data requires<br>
        a physical encrypted vault file on your machine.<br><br>
        <span style="color:var(--dim)">No localStorage. No browser storage. No cloud.</span><br>
        <span style="color:var(--dim)">Your vault lives at: <span style="color:var(--c)">{dataDir}/mastermind.vault</span></span>
      </div>

      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.9;
        padding:12px 16px;border:1px solid var(--wire2);background:rgba(0,0,0,.3)">
        <span style="color:var(--g)">◈ WHAT TO DO:</span><br>
        1. Download the MASTERMIND desktop app (Electron)<br>
        2. Run <span style="color:var(--c)">BUILD_DEV.bat</span> (Windows) or install the .exe<br>
        3. Your vault will be created at <span style="color:var(--c)">~/Documents/MASTERMIND/</span><br>
        4. All data stays on your machine — encrypted, local, permanent
      </div>
    </div>

    <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);letter-spacing:2px;
      margin-top:8px;padding:8px 16px;border:1px solid var(--wire)">
      MASTERMIND v${MM_VERSION} · AES-256-GCM · PBKDF2 310k iterations · RSA-OAEP 2048-bit
    </div>
  `;

  console.warn('[MASTERMIND] Browser mode blocked — NXAPI required for vault filesystem access');
}


function startupRoute() {
  // ── HARD GATE: Require Electron (NXAPI) — no browser-only mode ──
  if (!window.NXAPI) {
    _showDesktopRequiredScreen();
    return;
  }

  const meta = _authLoadMeta();
  try {
    const sf = JSON.parse(localStorage.getItem(FEATURES_KEY) || 'null');
    if (sf) Object.assign(AUTH.features, sf);
  } catch(e) {}

  wizInit();

  const savedFeatures = JSON.parse(localStorage.getItem(FEATURES_KEY) || '{}');

  // ── GATE 0: Vault watchdog (async, only for returning users with a data dir) ─
  const dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
  if (dataDir) {
    // Has a data dir → check for a real vault there before routing to login
    // or home. meta (local identity marker) is used only to personalize the
    // login screen below — its absence must never re-trigger first-time setup
    // when a vault genuinely exists on disk (e.g. freshly imported, or an
    // older install from before the marker existed).
    _vaultWatchdogCheck().then(vaultOk => {
      if (!vaultOk) return; // _showVaultMissingScreen already called
      _continueStartup(meta, savedFeatures);
    });
    return;
  }

  // No data dir yet (first-time setup) or no identity → proceed without watchdog
  _continueStartup(meta, savedFeatures);
}

// Pre-flight runs before the unlock screen, and only when there is something
// to check: a first-time user has no vault, no folder and nothing to lose, so
// sending them through nine checks that all say "not yet" would be noise.
async function _continueStartup(meta, savedFeatures) {
  const dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
  const firstRun = !dataDir;

  if (!firstRun && window.NXAPI && typeof mmBootRun === 'function') {
    // The report is handed on rather than discarded. It is the only thing in
    // the startup path that has actually READ the vault file, and routing was
    // previously deciding encrypted-vs-unencrypted from a localStorage marker
    // that can disagree with what is on disk.
    await mmBootRun((report) => _routeStartup(meta, savedFeatures, report));
    return;
  }
  _routeStartup(meta, savedFeatures, null);
}

// Offered after the vault is open and its state is in memory — never before,
// because "where you left off" is meaningless until the data it refers to is
// actually loaded.
async function _maybeOfferResume() {
  try {
    if (typeof MM_SESSION === 'undefined' || !MM_SESSION.resumable()) return false;
    return await MM_SESSION.offerResume();
  } catch (e) {
    MMLog?.warn('session', 'Resume offer failed: ' + e.message);
    return false;
  }
}

// ── Startup routing ──────────────────────────────────────────────────────
// `report` is the boot pre-flight result, or null when the pre-flight did not
// run (first launch, or no NXAPI). It is the authority whenever it exists.
//
// This used to branch on `meta.noEncryption`, read from localStorage. That is
// a claim ABOUT the vault stored somewhere other than the vault, and the two
// can disagree in both directions:
//
//   marker says plain, file is encrypted  → the app skipped the password
//     screen entirely and dropped the person on a homepage with no data
//     loaded, having proven nothing.
//   marker missing, file is plain         → the app demanded a password for
//     a vault that has none. Clearing site data was enough to do this.
//
// The file is the only thing that knows what the file is. The marker is
// demoted to a fallback for when nothing has read the disk yet, and is healed
// whenever it turns out to be wrong.
function _routeStartup(meta, savedFeatures, report) {
  const dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
  const probes  = (report && report.probes) || null;
  const fileWasRead = !!(probes && probes.vaultExists && probes.parseOk);
  const isPlain = fileWasRead ? probes.plain === true : !!(meta && meta.noEncryption);

  if (fileWasRead && !!(meta && meta.noEncryption) !== isPlain) {
    MMLog?.warn('auth', 'Identity marker disagreed with the vault file (marker said ' +
      (meta && meta.noEncryption ? 'unencrypted' : 'encrypted') + ', file is ' +
      (isPlain ? 'unencrypted' : 'encrypted') + ') — trusting the file');
  }

  if (!dataDir) {
    // Truly first run — no vault has ever been set up on this machine.
    _ssShow('ss-welcome');
    setTimeout(() => _initWelcomeBg(document.getElementById('ss-welcome-bg')), 50);
    const onKey = e => {
      if ((e.key === 'Enter' || e.key === ' ') && !document.getElementById('ss-welcome')?.classList.contains('hidden')) {
        document.removeEventListener('keydown', onKey);
        ssWelcomeCreate();
      }
    };
    document.addEventListener('keydown', onKey);
  } else if (isPlain) {
    // Username comes from the file when the file was read, so a machine with
    // no marker at all (fresh install, cleared site data, imported folder)
    // still opens the vault instead of asking for a password it has none of.
    const uname = (fileWasRead && probes.plainUsername) || meta?.username || 'operator';
    AUTH.username = uname;
    AUTH.encrypted = false;
    // Heal the marker so the next launch agrees with the disk even before the
    // pre-flight runs. Writing what the file said is not a new claim; it is
    // the same claim, put back where the fast path looks for it.
    if (fileWasRead && (!meta || !meta.noEncryption || meta.username !== uname)) {
      _persistIdentityMarker({ username: uname, noEncryption: true });
    }
    _sealSession(uname); // unencrypted users get a sealed session
    setTimeout(registerWithBridge, 1200);
    if (!savedFeatures._configured) _ssShow('ss-features');
    else {
      _maybeShowSessionChoice(() => {
        document.getElementById('startup-screen').classList.add('hidden');
        document.getElementById('homepage').classList.remove('hidden'); document.getElementById('homepage').scrollTop = 0;
        applyFeatureFlags();
        setTimeout(() => maybeShowWelcome?.(), 400);
        _applyScaleOnBoot();
      });
    }
  } else {
    // A real vault was confirmed at dataDir (the watchdog already checked
    // this before _routeStartup was ever called with dataDir set). meta
    // may still be null here — an imported vault's first launch on this
    // machine, or an install from before the local marker existed — so
    // personalization is best-effort, not a requirement to proceed.
    AUTH.username = meta?.username || null;
    AUTH.hasPin = !!_AUTH_STORE?.meta?.pinHash;
    AUTH.pinHash = _AUTH_STORE?.meta?.pinHash || null;
    const sub = document.getElementById('login-welcome-sub');
    const lbl = document.getElementById('login-username-label');
    if (sub) sub.textContent = meta?.username ? ('WELCOME BACK, ' + meta.username.toUpperCase()) : 'ENTER YOUR PASSWORD';
    if (lbl) lbl.textContent = 'Unlock your encrypted vault';
    const pinToggle = document.getElementById('login-pin-toggle');
    // PIN quick-unlock only works once this session has already decrypted
    // the vault with the password — the hash is never cached across a
    // relaunch (see optsChangePin's note). So the toggle reflects
    // in-memory state, not the persisted marker.
    if (pinToggle) pinToggle.style.display = _AUTH_STORE?.meta?.pinHash ? '' : 'none';
    _ssShow('ss-login');
    setTimeout(() => document.getElementById('login-password')?.focus(), 200);
  }
}

function ssWelcomeCreate() {
  _ssShow('ss-setup', 1);
  setTimeout(() => document.getElementById('setup-username')?.focus(), 150);
}

function ssWelcomeImport() {
  _ssShow('ss-import');
  const err = document.getElementById('ss-import-error');
  if (err) { err.style.display = 'none'; err.textContent = ''; }
}

function _importShowStatus(msg) {
  const el = document.getElementById('ss-import-status');
  const err = document.getElementById('ss-import-error');
  if (err) err.style.display = 'none';
  if (el) { el.style.display = ''; el.textContent = msg; }
}
function _importShowError(msg) {
  const el = document.getElementById('ss-import-status');
  const err = document.getElementById('ss-import-error');
  if (el) el.style.display = 'none';
  if (err) { err.style.display = ''; err.textContent = msg; }
}

async function importPickVaultFile() {
  if (!window.NXAPI) { _importShowError('Desktop app required.'); return; }
  const filePath = await window.NXAPI.openFileDialog({
    title: 'Select your .vault file',
    filters: [{ name: 'MASTERMIND Vault', extensions: ['vault'] }],
  });
  if (!filePath) return; // cancelled

  _importShowStatus('Checking ' + filePath + '…');

  // Every other read/write in the app addresses the vault as
  // <dataDir>/mastermind.vault. Rather than generalize that convention
  // app-wide for one screen, treat the picked file's own folder as
  // dataDir, and if the file isn't already named mastermind.vault, copy
  // it into place under that name.
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  const dir = filePath.slice(0, lastSlash);
  const filename = filePath.slice(lastSlash + 1);
  const targetPath = dir + '/mastermind.vault';

  if (filename.toLowerCase() !== 'mastermind.vault') {
    const alreadyThere = await window.NXAPI.vaultExists(targetPath);
    if (alreadyThere) {
      _importShowError('This folder already has a different mastermind.vault. Choose an empty folder, or select that existing file directly if it\u2019s the one you meant.');
      return;
    }
    const raw = await window.NXAPI.vaultRead(filePath);
    if (raw == null) { _importShowError('Could not read that file.'); return; }
    const written = await window.NXAPI.vaultWrite(targetPath, raw);
    if (!written?.ok) { _importShowError('Could not copy the file into place: ' + (written?.error || 'unknown error')); return; }
  }

  await _importFinalize(dir, targetPath);
}

async function importPickVaultFolder() {
  if (!window.NXAPI) { _importShowError('Desktop app required.'); return; }
  const dir = await window.NXAPI.pickDataFolder();
  if (!dir) return; // cancelled
  _importShowStatus('Checking ' + dir + '…');
  const targetPath = dir + '/mastermind.vault';
  const exists = await window.NXAPI.vaultExists(targetPath);
  if (!exists) {
    _importShowError('No mastermind.vault found in that folder.');
    return;
  }
  await _importFinalize(dir, targetPath);
}

// Shared tail for both import paths: verify the file actually parses as a
// vault, persist the directory the same way setupCreateVault() does, and
// hand off to normal startup routing. No password is asked here — that's
// what ss-login is for, and it works whether or not a local identity
// marker exists yet for this vault (see _routeStartup's else branch,
// which treats "vault confirmed on disk" as sufficient on its own).
async function _importFinalize(dataDir, vaultPath) {
  const raw = await window.NXAPI.vaultRead(vaultPath);
  if (raw == null) { _importShowError('Vault file exists but could not be read — check folder permissions.'); return; }

  const parsed = VaultEnvelope.parse(raw);
  if (!parsed.ok) { _importShowError(parsed.message || 'That file doesn\u2019t look like a MASTERMIND vault.'); return; }

  await window.NXAPI.setDataDir(dataDir);
  NX_CONFIG.dataDir = dataDir;
  NX_CONFIG.vaultPath = vaultPath;
  localStorage.setItem('nexus_datadir', dataDir);

  _importShowStatus('Vault found — unlocking…');
  MMLog?.info('vault', 'Imported vault at: ' + vaultPath);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.imported', { path: vaultPath });

  setTimeout(() => { if (typeof startupRoute === 'function') startupRoute(); }, 500);
}

function _ssShow(id, step) {
  // Hide dynamic overlay screens when navigating
  ['ss-desktop-required','ss-vault-missing'].forEach(s => {
    const el = document.getElementById(s);
    if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
  });
  ['ss-welcome','ss-setup','ss-login','ss-keygen','ss-features','ss-import','ss-boot'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
  const bar = document.getElementById('mm-steps');
  if (bar) bar.style.display = (id === 'ss-login' || id === 'ss-welcome' || id === 'ss-boot' || id === 'ss-import') ? 'none' : '';
  if (id === 'ss-welcome' || id === 'ss-import') return;
  if (id === 'ss-features') {
    setTimeout(() => { if (typeof initFeaturesScreen === 'function') initFeaturesScreen(); }, 50);
  }
  const stepMap = { 'ss-setup':1, 'ss-keygen':2, 'ss-features':3 };
  const cur = step || stepMap[id] || 1;
  [1,2,3].forEach(n => {
    const el = document.getElementById('mms-' + n);
    if (!el) return;
    el.classList.remove('active','done');
    if (n < cur) el.classList.add('done');
    else if (n === cur) el.classList.add('active');
  });
}

function mmGoTo(id, step) { _ssShow(id, step); }

function _authLoadMeta() {
  // Check in-memory auth store first (populated by vault module after load)
  if (typeof _AUTH_STORE !== 'undefined' && _AUTH_STORE.meta) return _AUTH_STORE.meta;
  // Fall back to localStorage for backward compatibility
  try { return JSON.parse(localStorage.getItem(AUTH_META_KEY)); } catch(e) { return null; }
}

/* ── Password strength ───────────────────────────────────────── */
function _setupPasswordInput() {
  const pw = document.getElementById('setup-password');
  if (!pw) return;
  pw.addEventListener('input', () => {
    const v = pw.value;
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 14) score++;
    if (/[A-Z]/.test(v)) score++;
    if (/[0-9]/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    const fill = document.getElementById('setup-strength-fill');
    const label = document.getElementById('setup-strength-label');
    const colors = ['#ff3355','#ff8c22','#ffe04a','#00ff88','#00c8ff'];
    const labels = ['WEAK','FAIR','MODERATE','STRONG','FORTRESS'];
    if (fill) { fill.style.width = (score * 20) + '%'; fill.style.background = colors[Math.max(0,score-1)] || '#ff3355'; }
    if (label) { label.textContent = v.length === 0 ? '—' : (labels[score-1] || 'WEAK'); label.style.color = colors[Math.max(0,score-1)] || 'var(--dim)'; }
  });
}

/* ── Create vault (first time) ───────────────────────────────── */
// setupCreateVault defined in wizard section below


function setupSkipEncryption() {
  // "Yes, username required" (2026-08-30) — checked here too, not just
  // in _setupSkipEncryptionConfirmed(), so a person with a blank name
  // field finds out immediately rather than after reading the whole
  // security warning and typing SKIP, only to get bounced back for a
  // reason that had nothing to do with encryption.
  const usernameEl = document.getElementById('setup-username');
  if (!usernameEl?.value.trim()) {
    const errEl = document.getElementById('setup-error');
    if (errEl) errEl.textContent = 'Username required';
    usernameEl?.focus();
    return;
  }

  // ── SECURITY: Require explicit double-confirmation before disabling encryption ──
  // This is an irreversible decision for the vault — user must acknowledge risks.

  // Inline confirmation modal — no native dialog (Electron blocks some)
  const existing = document.getElementById('_mm_noenc_confirm');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = '_mm_noenc_confirm';
  modal.style.cssText = [
    'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.88)',
    'display:flex;align-items:center;justify-content:center',
    'backdrop-filter:blur(8px)',
  ].join(';');
  modal.innerHTML = `
    <div style="background:#0d0f14;border:1px solid #ff3355;border-radius:6px;padding:32px 36px;max-width:420px;width:90%;font-family:var(--f-mono,monospace)">
      <div style="color:#ff3355;font-size:13px;letter-spacing:2px;margin-bottom:16px">⚠ SECURITY WARNING</div>
      <div style="color:#c0c8d8;font-size:11px;line-height:1.7;margin-bottom:20px">
        Running without encryption stores your entire vault — all nodes, maps, cognitive data — as <strong style="color:#ffaa44">plain readable text</strong> on disk.<br><br>
        This is strongly discouraged. Encryption can be enabled later in Settings but requires vault recreation.<br><br>
        Type <strong style="color:#ff3355">SKIP</strong> to confirm you understand and accept this risk.
      </div>
      <input id="_mm_noenc_input" type="text" placeholder="type SKIP to confirm"
        style="width:100%;box-sizing:border-box;background:#02040a;border:1px solid #333;color:#c0c8d8;
               padding:8px 12px;font-family:var(--f-mono,monospace);font-size:11px;border-radius:3px;margin-bottom:14px"/>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('_mm_noenc_confirm').remove()"
          style="padding:7px 18px;background:transparent;border:1px solid #333;color:#888;
                 cursor:pointer;font-family:var(--f-mono,monospace);font-size:10px;border-radius:3px">
          CANCEL — use encryption
        </button>
        <button onclick="_setupSkipEncryptionConfirmed()"
          style="padding:7px 18px;background:#1a0608;border:1px solid #ff3355;color:#ff3355;
                 cursor:pointer;font-family:var(--f-mono,monospace);font-size:10px;border-radius:3px">
          PROCEED WITHOUT ENCRYPTION
        </button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => document.getElementById('_mm_noenc_input')?.focus(), 50);
}

async function _setupSkipEncryptionConfirmed() {
  const input = document.getElementById('_mm_noenc_input');
  if (!input || input.value.trim().toUpperCase() !== 'SKIP') {
    input.style.borderColor = '#ff3355';
    input.placeholder = 'type SKIP exactly to confirm';
    return;
  }

  // "Yes, username required" (2026-08-30) — this path had no check at
  // all: an empty username field silently became 'operator', forever,
  // baked into the identity. The encrypted path (setupCreateVault)
  // already required one; there was never a real reason the two should
  // disagree about whether "who are you" is optional. Checked here,
  // AFTER the SKIP confirmation rather than before it, so a person who
  // left the name blank sees the actual problem (their name, not the
  // encryption choice) rather than the modal just silently vanishing on
  // a technicality they didn't cause.
  const usernameEl = document.getElementById('setup-username');
  const username = usernameEl?.value.trim();
  if (!username) {
    document.getElementById('_mm_noenc_confirm')?.remove();
    const errEl = document.getElementById('setup-error');
    if (errEl) errEl.textContent = 'Username required';
    usernameEl?.focus();
    return;
  }

  document.getElementById('_mm_noenc_confirm')?.remove();

  AUTH.username = username;
  AUTH.encrypted = false;

  if (!window.NXAPI) {
    _showDesktopRequiredScreen();
    return;
  }

  let dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
  if (!dataDir) {
    dataDir = await window.NXAPI.defaultFolder();
    NX_CONFIG.dataDir = dataDir;
    localStorage.setItem('nexus_datadir', dataDir);
    await window.NXAPI.setDataDir(dataDir);
  }
  const vaultPath = dataDir + '/mastermind.vault';

  const _initialState = {
    version: 6, format: 'mastermind-vault-plain', saved: Date.now(),
    canvas: { nodes: [], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 }, clipboard: [] },
    modules: { void: null, gaps: null, signal: null, threads: null,
               body: null, horizon: null, brainMap: null, domain: null,
               almDeltas: [], intuitionRatings: {}, options: OPTS || {}, features: AUTH.features || {} },
    aiConfig: null,
    snr: null,
    identity: { username, pinHash: null, created: Date.now(), version: 6, noEncryption: true },
    keys: { pubKey: null, encPrivKey: null },
    username,
    jaa: {},
  };

  try {
    await vaultCreateNewUnencrypted(_initialState, { dataDir, vaultPath });
  } catch (e) {
    mm_toast('⚡ Vault creation failed: ' + e.message, 'error', { dur: 6000 });
    MMLog?.error('vault', 'Unencrypted vault creation failed: ' + e.message);
    return;
  }

  NX_CONFIG.vaultPath = vaultPath;
  // Even the unencrypted opt-out keeps its identity in the vault payload.
  // The vault file is still the only store; it just has no cipher on it.
  _AUTH_STORE.meta = {
    username, noEncryption: true, created: Date.now(),
    noEncryptionAcknowledged: true, noEncryptionTs: new Date().toISOString(),
    version: 6,
  };
  _persistIdentityMarker({ username, noEncryption: true });

  // MM Foundation: create unencrypted vault — explicit opt-out recorded
  if (typeof MMVault !== 'undefined' && !MMVault.meta) {
    MMVault.create(username, { encrypted: false });
    MMLog?.warn('auth', `Unencrypted vault created — user explicitly opted out: ${username}`);
  }
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.security.no_encryption_opted_out', { username });

  const kgUser = document.getElementById('mm-kg-username');
  const kgPin = document.getElementById('mm-kg-pinval');
  if (kgUser) kgUser.textContent = username;
  if (kgPin) kgPin.textContent = 'N/A (unencrypted mode)';
  const rows = document.querySelectorAll('.mm-keygen-row .mm-key-val');
  if (rows[0]) rows[0].textContent = 'None (unencrypted — opted out)';
  if (rows[1]) rows[1].textContent = 'N/A';
  if (rows[2]) rows[2].textContent = 'N/A';
  _ssShow('ss-keygen', 2);
}

/* ── Login ───────────────────────────────────────────────────── */
// Track pending unlock toast timeout so we can cancel it on failure
let _loginUnlockToastTimer = null;

// Holds the password between a successful unlock and the KDF upgrade, for
// the few milliseconds that separate them. Cleared in a finally block.
let _pendingRekey = null;

// The part of a successful login that used to run unconditionally at
// the end of loginSubmit — pulled out so both "no MFA enrolled" and
// "MFA just verified" reach the same place rather than duplicating it.
async function _completeLoginSuccess(meta, btn) {
  _sealSession(meta.username);
  _persistIdentityMarker({ username: meta.username, noEncryption: false });
  setTimeout(() => { _maybeOfferResume(); }, 900);
  setTimeout(registerWithBridge, 1200);
  if (btn) btn.textContent = '⬡  UNLOCKED';
  _loginUnlockToastTimer = setTimeout(() => { _loginUnlockToastTimer = null; T.vaultUnlocked(meta?.username || AUTH.username || 'operator'); }, 600);

  if (typeof MMVault !== 'undefined' && !MMVault.meta) {
    const meta2 = _authLoadMeta();
    MMVault.create(meta2?.username || 'operator', { encrypted: true });
  }
  MMLog?.info('auth', 'Login successful — all gates passed');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.success', { username: meta.username });

  if (window.NXAPI && NX_CONFIG.vaultPath) {
    const raw = await window.NXAPI.vaultRead(NX_CONFIG.vaultPath);
    if (raw) MMLog?.info('vault', 'Vault file opened on login: ' + raw.length + ' bytes');
  }

  // "This needs only show once per identity" (2026-08-30). It was
  // checking ONLY localStorage[FEATURES_KEY] — a cache tied to this
  // machine's browser/Electron profile, not to the identity itself.
  // AUTH.features._configured is ALSO saved into the real vault file
  // (foundation/vault/mastermind-vault.js, vaultSerialize/deserialize —
  // confirmed already wired) and is genuinely fresh here: vaultDeserialize()
  // already ran earlier in this same login chain (gate 3, above), so by
  // this point AUTH.features carries whatever this identity's own vault
  // file actually says, not a stale local cache. That is the answer that
  // travels with the identity — restored from a backup, opened from a
  // different data folder (the title bar shows an arbitrary custom path;
  // this is not a hypothetical), or moved to another machine, the vault
  // file still knows it was already configured even when localStorage
  // does not. Self-heals the cache to match, so a future launch that
  // DOES hit the faster localStorage-only path (see _continueStartup's
  // isPlain branch, which cannot check the vault this early by design)
  // still gets the right answer next time.
  const _savedF = JSON.parse(localStorage.getItem(FEATURES_KEY) || '{}');
  const _vaultConfigured = (typeof AUTH !== 'undefined' && AUTH.features && AUTH.features._configured);
  if (_vaultConfigured && !_savedF._configured) {
    localStorage.setItem(FEATURES_KEY, JSON.stringify(Object.assign({}, _savedF, AUTH.features)));
  }
  if (_savedF._configured || _vaultConfigured) {
    setTimeout(() => {
      _maybeShowSessionChoice(() => {
        document.getElementById('startup-screen').classList.add('hidden');
        document.getElementById('homepage').classList.remove('hidden'); document.getElementById('homepage').scrollTop = 0;
        applyFeatureFlags();
        if (typeof maybeShowWelcome === 'function') maybeShowWelcome();
        _autolockStart?.();
        _applyScaleOnBoot();
      });
    }, 400);
  } else {
    setTimeout(() => _ssShow('ss-features', 3), 400);
  }
}

// ── MFA login screen ─────────────────────────────────────────────────
// Shown between the password gate and _completeLoginSuccess when
// mfaLoginMethods() reports at least one enrolled second factor.
// _pendingLogin holds { meta, btn } from loginSubmit while this runs.

let _pendingLogin = null;

function _showMfaLoginScreen(methods) {
  document.getElementById('login-pw-form')?.style.setProperty('display', 'none');
  document.getElementById('login-pin-form')?.style.setProperty('display', 'none');
  let box = document.getElementById('login-mfa-form');
  if (!box) {
    box = document.createElement('div');
    box.id = 'login-mfa-form';
    document.getElementById('login-password')?.closest('.mm-card')?.appendChild(box);
  }
  const has = (m) => methods.includes(m);
  box.innerHTML = `
    <div style="font-family:var(--f-mono);font-size:8.5px;letter-spacing:1px;color:var(--dim);margin-bottom:10px">
      SECOND FACTOR REQUIRED
    </div>
    <div style="display:flex;gap:6px;margin-bottom:12px" id="mfa-method-tabs">
      ${has('totp') ? '<button class="mm-btn-ghost mfa-tab on" data-m="totp" onclick="_mfaSwitchTab(\'totp\')">Authenticator app</button>' : ''}
      ${has('webauthn') ? `<button class="mm-btn-ghost mfa-tab${has('totp') ? '' : ' on'}" data-m="webauthn" onclick="_mfaSwitchTab('webauthn')">Security key</button>` : ''}
      ${has('backup') ? `<button class="mm-btn-ghost mfa-tab${(!has('totp') && !has('webauthn')) ? ' on' : ''}" data-m="backup" onclick="_mfaSwitchTab('backup')">Backup code</button>` : ''}
    </div>
    <div id="mfa-tab-totp" style="display:${has('totp') ? '' : 'none'}">
      <div class="setup-field-group">
        <label class="setup-label">CODE</label>
        <input class="setup-input" id="mfa-totp-code" maxlength="8" inputmode="numeric" placeholder="6-digit code"
               onkeydown="if(event.key==='Enter')_mfaSubmitTotp()"/>
      </div>
      <div class="setup-error" id="mfa-totp-error"></div>
      <button class="mm-btn-primary" onclick="_mfaSubmitTotp()">&#x2B21; &nbsp; VERIFY</button>
    </div>
    <div id="mfa-tab-webauthn" style="display:${(!has('totp') && has('webauthn')) ? '' : 'none'}">
      <div class="opts-hint" style="margin-bottom:10px">Insert or tap your security key when prompted.</div>
      <div class="setup-error" id="mfa-webauthn-error"></div>
      <button class="mm-btn-primary" onclick="_mfaSubmitWebauthn()">&#x2B21; &nbsp; USE SECURITY KEY</button>
    </div>
    <div id="mfa-tab-backup" style="display:${(!has('totp') && !has('webauthn') && has('backup')) ? '' : 'none'}">
      <div class="setup-field-group">
        <label class="setup-label">BACKUP CODE</label>
        <input class="setup-input" id="mfa-backup-code" placeholder="XXXXX-XXXXX"
               onkeydown="if(event.key==='Enter')_mfaSubmitBackup()"/>
      </div>
      <div class="setup-error" id="mfa-backup-error"></div>
      <button class="mm-btn-primary" onclick="_mfaSubmitBackup()">&#x2B21; &nbsp; VERIFY</button>
    </div>
  `;
  box.style.display = '';
  setTimeout(() => document.getElementById('mfa-totp-code')?.focus(), 50);
}

function _mfaSwitchTab(method) {
  ['totp', 'webauthn', 'backup'].forEach((m) => {
    const tab = document.querySelector(`.mfa-tab[data-m="${m}"]`);
    const panel = document.getElementById('mfa-tab-' + m);
    if (tab) tab.classList.toggle('on', m === method);
    if (panel) panel.style.display = m === method ? '' : 'none';
  });
}

function _mfaHideScreen() {
  const box = document.getElementById('login-mfa-form');
  if (box) box.style.display = 'none';
  document.getElementById('login-pw-form')?.style.setProperty('display', '');
}

async function _mfaFinish(result, errEl) {
  if (!result.ok) {
    if (errEl) errEl.textContent = result.error || 'Verification failed';
    return;
  }
  const pending = _pendingLogin;
  _pendingLogin = null;
  _mfaHideScreen();
  if (pending) await _completeLoginSuccess(pending.meta, pending.btn);
}

async function _mfaSubmitTotp() {
  const code = document.getElementById('mfa-totp-code')?.value;
  const errEl = document.getElementById('mfa-totp-error');
  if (errEl) errEl.textContent = '';
  const r = await mfaVerifyLogin('totp', code);
  await _mfaFinish(r, errEl);
}

async function _mfaSubmitWebauthn() {
  const errEl = document.getElementById('mfa-webauthn-error');
  if (errEl) errEl.textContent = 'Waiting for your security key\u2026';
  const r = await mfaVerifyLogin('webauthn', null);
  await _mfaFinish(r, errEl);
}

async function _mfaSubmitBackup() {
  const code = document.getElementById('mfa-backup-code')?.value;
  const errEl = document.getElementById('mfa-backup-error');
  if (errEl) errEl.textContent = '';
  const r = await mfaVerifyLogin('backup', code);
  if (r.ok && r.remaining != null && r.remaining <= 2) {
    mm_toast?.(`Only ${r.remaining} backup code${r.remaining === 1 ? '' : 's'} left — generate new ones in Settings`, 'warn', { dur: 6000 });
  }
  await _mfaFinish(r, errEl);
}

async function loginSubmit() {
  const pw = document.getElementById('login-password')?.value;
  const errEl = document.getElementById('login-error');
  const setErr = msg => { if (errEl) errEl.textContent = msg; };
  setErr('');
  // The "you must type a password" rule cannot be applied before the file has
  // been read, because it is not true of every vault: an unencrypted vault has
  // no password, and demanding one would be asking for a secret that does not
  // exist. Enforced after GATE 2, where the vault's kind is known.

  // ── GATE 0: Brute-force lockout check ─────────────────────────
  const bfWait = _bfCheck();
  if (bfWait > 0) {
    setErr(`Too many failed attempts — wait ${bfWait}s`);
    mm_toast?.(`Locked out — ${bfWait}s remaining`, 'error');
    MMLog?.warn('security', `Login blocked by BF lockout: ${bfWait}s remaining`);
    return;
  }

  // Hard-clear all toasts — prevent any stale vault-unlocked toast from prior session
  if (_loginUnlockToastTimer) { clearTimeout(_loginUnlockToastTimer); _loginUnlockToastTimer = null; }
  mm_toast_clear?.();

  const btn = document.querySelector('#login-pw-form .startup-enter-btn');
  if (btn) { btn.textContent = '⬡  UNLOCKING…'; btn.disabled = true; }

  try {
    // ── GATE 1: The vault file must exist ──────────────────────────
    // v6 reversal: the FILE is the source of truth for identity, not
    // localStorage. The salt and KDF parameters live in the vault header,
    // so a vault can be opened on a machine that has never run setup —
    // which was impossible in v5 and made every vault non-portable.
    if (!window.NXAPI) {
      setErr('Desktop app required — the vault cannot be opened in a browser.');
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_nxapi' });
      return;
    }

    const dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
    if (!dataDir) {
      setErr('No data folder selected — choose where your vault lives.');
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_datadir' });
      return;
    }

    const vaultPath = dataDir + '/mastermind.vault';
    const rawVault = await window.NXAPI.vaultRead(vaultPath);
    if (!rawVault) {
      setErr('Vault file not found on disk — choose your data folder or recreate vault.');
      MMLog?.error('auth', 'Login gate 1 FAIL: no vault at ' + vaultPath);
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_vault_file', path: vaultPath });
      setTimeout(() => _showVaultMissingScreen(vaultPath, 'missing'), 1200);
      return;
    }
    NX_CONFIG.vaultPath = vaultPath;

    // ── GATE 2: The file must be a vault we can read ───────────────
    const parsedVault = VaultEnvelope.parse(rawVault);
    if (!parsedVault.ok) {
      setErr(parsedVault.message);
      MMLog?.error('auth', 'Login gate 2 FAIL: ' + parsedVault.reason);
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: parsedVault.reason });
      setTimeout(() => _showVaultMissingScreen(vaultPath, 'corrupt'), 1200);
      return;
    }

    // ── GATE 2b: A password is required only where one can be proven ──
    if (!parsedVault.plain && !pw) {
      setErr('Enter your password');
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      return;
    }

    // ── GATE 3: Derive and PROVE the key against the vault itself ──
    // v5 proved the password by decrypting the RSA blob in localStorage,
    // which meant a machine without that blob could not log in even with
    // the right password. The real proof is the vault opening.
    let key, meta;
    if (parsedVault.plain) {
      // An unencrypted vault: the file IS the state. There is no key to
      // derive and nothing to prove a password against, so none is claimed.
      // Hydration is otherwise identical to the encrypted path — the same
      // vaultDeserialize() call, the same integrity sweep — because what
      // makes a session live is the state reaching the globals, and that is
      // not a property of the cipher.
      const read = VaultEnvelope.readPlain(parsedVault.envelope);
      if (!read.ok) {
        setErr(read.message || 'The unencrypted vault could not be read.');
        if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: read.reason || 'plain_unreadable' });
        return;
      }
      const state = read.state;
      key  = null;
      meta = state.identity || { username: state.username || 'operator' };
      AUTH.encrypted = false;
      _AUTH_STORE.keys = state.keys || _AUTH_STORE.keys;

      try {
        vaultDeserialize(state);
        const integrity = vaultCheckNodeIntegrity(state);
        if (!integrity.ok) {
          MMLog?.warn('vault', 'Node integrity check found problems: ' +
            integrity.duplicateIds.length + ' duplicate id(s), ' +
            integrity.danglingConns.length + ' dangling connection(s)');
          if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.integrity.problem', integrity);
        }
      } catch (e) {
        MMLog?.error('vault', 'vaultDeserialize failed on unencrypted login: ' + e.message);
        mm_toast('Could not fully restore your data — try "Load from Vault" in Settings.', 'error', { dur: 9000 });
      }

      // No envelope, so no vaultId to anchor a ledger against and no
      // saveCount in a header. Left null rather than invented: a fabricated
      // anchor would make the ledger claim a lineage that does not exist.
      VAULT.vaultId   = null;
      VAULT.saltB64   = null;
      VAULT.saveCount = state.saveCount != null ? state.saveCount : 0;
      VAULT.anchor    = null;

      MMLog?.warn('auth', 'Opened an UNENCRYPTED vault — no cipher, no integrity hash');
    } else if (parsedVault.legacy) {
      // One-time bridge for a v5 file: the salt only exists in
      // localStorage on the machine that created it.
      meta = _authLoadMeta();
      if (!meta?.salt) {
        setErr('This is a v5 vault and its salt is not on this machine — open it once on the original computer to upgrade it.');
        if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'v5_salt_absent' });
        // Not recoverable from THIS machine by re-entering the password —
        // the salt that would let it decrypt simply isn't here. Offer the
        // same recovery screen every other unopenable-vault case uses,
        // rather than leaving the only option a button that will fail
        // identically every time it's pressed.
        setTimeout(() => _showVaultMissingScreen(vaultPath, 'legacy-salt-absent'), 1500);
        return;
      }
      key = await VaultCrypto.deriveKey(pw, meta.salt, 310000, 32);
      const legacy = VaultEnvelope.readLegacyV5(parsedVault.envelope);
      if (legacy.encrypted !== false) {
        // Throws on a wrong password — caught below as a failed attempt.
        await VaultCrypto.decrypt(key, VaultCrypto.fromBase64(legacy.data), legacy.iv, null);
      }
      // Bind the parameters that actually produced this key BEFORE anything
      // can seal with it. v5 used 310k and this salt; claiming otherwise in
      // a v6 header would write a vault no password could reopen.
      _setSessionKey(key, meta.salt, 310000);
      _vaultAdoptLegacyIdentity(null);
      _pendingRekey = pw;   // upgrade to the current target below
    } else {
      const env = parsedVault.envelope;
      const ct = VaultCrypto.fromBase64(env.data);
      const sha = await VaultCrypto.sha256Hex(ct);
      if (!VaultCrypto.timingSafeEqualHex(sha, env.ciphertextSha256)) {
        // Damaged file, NOT a wrong password. Saying "incorrect password"
        // here sends people hunting for a typo while their vault rots.
        setErr('Vault file is damaged — this is not a password problem. Restore from a backup.');
        MMLog?.error('auth', 'Ciphertext hash mismatch at ' + vaultPath);
        await window.NXAPI.ledgerAppend?.(dataDir, 'vault.unlock.corrupt', { vaultId: env.vaultId });
        if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'ciphertext_corrupt' });
        setTimeout(() => _showVaultMissingScreen(vaultPath, 'corrupt'), 1200);
        return;
      }
      key = await VaultCrypto.deriveKey(pw, env.kdf.salt, env.kdf.iterations, env.kdf.keyLen);
      _setSessionKey(key, env.kdf.salt, env.kdf.iterations);
      if (env.kdf.iterations < vaultGetIterations()) _pendingRekey = pw;
      // Throws on a wrong password — and on any edit to the header, since
      // the header is the AAD.
      const plain = await VaultCrypto.decrypt(key, ct, env.iv, VaultEnvelope.aadBytes(env));
      const state = JSON.parse(VaultCrypto.utf8Decode(plain));
      meta = state.identity || { username: state.username || 'operator' };
      if (state.security && state.security.mfa && typeof mfaHydrateFromVault === 'function') {
        mfaHydrateFromVault(state.security.mfa);
      }
      // state.keys (the RSA keypair) was being decrypted and then dropped —
      // never assigned to _AUTH_STORE.keys. Nothing else populates it before
      // featuresConfirm()'s "Vault keys missing" check for a returning user
      // who hasn't confirmed features yet (that check only exists to catch
      // a genuinely broken vault, not this).
      _AUTH_STORE.keys = state.keys || _AUTH_STORE.keys;

      // THE actual "decrypted vault lives in RAM" step. `state` here is
      // the whole vault payload — canvas nodes, connections, lattice,
      // every module's saved state — and until this line it was being
      // parsed and then discarded; only identity/keys/MFA were ever
      // pulled out of it. vaultDeserialize() already does full
      // restoration correctly (it's what "Load from Vault" in Settings
      // calls), it just was never reached on the path everyone actually
      // logs in through. This is what makes `state` a live, working copy
      // instead of dead JSON — every module reads from the globals this
      // populates (NX, LATTICE, VL_STATE, OPTS, ...) from here on, and
      // vaultSave() is what writes that live copy back to the real file.
      try {
        vaultDeserialize(state);
        const integrity = vaultCheckNodeIntegrity(state);
        if (!integrity.ok) {
          MMLog?.warn('vault', 'Node integrity check found problems: ' +
            integrity.duplicateIds.length + ' duplicate id(s), ' +
            integrity.danglingConns.length + ' dangling connection(s)');
          mm_toast('⚡ Found ' + integrity.duplicateIds.length + ' duplicate node id(s) and ' +
            integrity.danglingConns.length + ' connection(s) pointing at missing nodes — the data ' +
            'still loaded, but some links may look broken.', 'warn', { dur: 9000 });
          if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.integrity.problem', integrity);
        }
      } catch (e) {
        MMLog?.error('vault', 'vaultDeserialize failed on login — entering with an empty working copy: ' + e.message);
        mm_toast('Could not fully restore your data — try "Load from Vault" in Settings, or contact support if it keeps happening.', 'error', { dur: 9000 });
      }

      VAULT.vaultId    = env.vaultId;
      VAULT.saltB64    = env.kdf.salt;
      VAULT.iterations = env.kdf.iterations;
      VAULT.saveCount  = env.saveCount;
      VAULT.anchor     = env.ledgerAnchor;
    }

    AUTH.username = meta.username || AUTH.username;

    // Upgrade the KDF while the password is still in scope. This is the only
    // moment it is possible: a new iteration count needs a new salt AND a
    // freshly derived key, and the key cannot be re-derived from itself.
    // Key and salt move together, and the pair only reaches disk on the next
    // successful save — until then the old file still opens with the same
    // password, so an interrupted upgrade loses nothing.
    if (_pendingRekey) {
      try {
        const before = AUTH.kdf.iterations;
        await vaultRekeySession(_pendingRekey, vaultGetIterations());
        await window.NXAPI.ledgerAppend?.(dataDir, 'vault.kdf.upgraded', {
          from: before, to: AUTH.kdf.iterations,
        });
      } catch (rk) {
        MMLog?.warn('auth', 'KDF upgrade skipped: ' + rk.message);
      } finally {
        _pendingRekey = null;
      }
    }
    await window.NXAPI.ledgerAppend?.(dataDir, 'vault.unlock.success', { vaultId: VAULT.vaultId || null });

    // ── GATE 4: second factor, if one is enrolled ───────────────────
    // Only reachable once the vault is decrypted — MFA_STATE lives
    // inside it, so this is the earliest point it's even possible to
    // know whether a second factor exists. _completeLoginSuccess (the
    // rest of what used to run unconditionally here) is deferred until
    // mfaVerifyLogin() says ok.
    const mfaMethods = (typeof mfaLoginMethods === 'function') ? mfaLoginMethods() : [];
    if (mfaMethods.length) {
      if (btn) { btn.textContent = '⬡  UNLOCKED'; btn.disabled = false; }
      _pendingLogin = { meta, btn };
      _showMfaLoginScreen(mfaMethods);
      return;
    }

    await _completeLoginSuccess(meta, btn);
  } catch(e) {
    // Cancel any pending success toast (race condition prevention)
    if (_loginUnlockToastTimer) { clearTimeout(_loginUnlockToastTimer); _loginUnlockToastTimer = null; }
    mm_toast_clear?.(); // hard-clear all pending toasts — prevent stale success toast
    _bfRecord(); // record failed attempt toward lockout
    // Recorded in the audit ledger, which lives OUTSIDE the vault precisely
    // so that a failed unlock — which never gets the key — can be logged.
    try {
      const _dd = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
      if (_dd) await window.NXAPI?.ledgerAppend?.(_dd, 'vault.unlock.failed', { attempts: _BF.attempts });
    } catch (_le) {}
    const bfRem = _BF.attempts > 0 ? ` (${_BF.maxAttempts - _BF.attempts} attempts left)` : '';
    setErr('Incorrect password' + bfRem);
    MMLog?.warn('auth', 'Login failed: wrong password for ' + (AUTH.username || 'unknown'));
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'wrong_password', attempts: _BF.attempts });
    if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
    document.getElementById('login-password').value = '';
    document.getElementById('login-password')?.focus();
  }
}

async function loginPinSubmit() {
  const pin = document.getElementById('login-pin')?.value;
  const errEl = document.getElementById('login-pin-error');
  const setErr = msg => { if (errEl) errEl.textContent = msg; };
  setErr('');
  if (!pin) return setErr('Enter your PIN');

  // ── GATE 0: Brute-force lockout check ─────────────────────────
  const bfWait = _bfCheck();
  if (bfWait > 0) {
    setErr(`Too many failed attempts — wait ${bfWait}s`);
    mm_toast?.(`Locked out — ${bfWait}s remaining`, 'error');
    return;
  }

  // Gate 1: identity must exist
  const meta = _authLoadMeta();
  if (!meta) {
    setErr('No identity found — complete first-time setup');
    mm_toast('No identity — setup required', 'error');
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_identity', method: 'pin' });
    return;
  }
  const pinBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + meta.username));
  const pinHash = btoa(String.fromCharCode(...new Uint8Array(pinBuf)));
  if (pinHash !== meta.pinHash) {
    _bfRecord();
    const bfRem = _BF.attempts > 0 ? ` (${_BF.maxAttempts - _BF.attempts} attempts left)` : '';
    setErr('Incorrect PIN' + bfRem);
    document.getElementById('login-pin').value = '';
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'wrong_pin', attempts: _BF.attempts });
    return;
  }
  // PIN correct — read-only session, no decryption key
  // AUTH.key remains null — vault writes are BLOCKED in this session
  AUTH.encrypted = true;  // vault is still encrypted on disk — do not downgrade flag
  AUTH.pinVerified = true;
  AUTH._unlocked = false; // PIN does NOT fully seal session — write-path checks this
  _sealSession(meta.username); // seal navigation access only
  const _pinSavedF = JSON.parse(localStorage.getItem(FEATURES_KEY)||'{}');
  setTimeout(() => {
    if (_pinSavedF._configured) {
      _maybeShowSessionChoice(() => {
        document.getElementById('startup-screen').classList.add('hidden');
        document.getElementById('homepage').classList.remove('hidden'); document.getElementById('homepage').scrollTop = 0;
        applyFeatureFlags();
        _applyScaleOnBoot();
        _pinReadOnlyBanner(); // show persistent read-only warning
      });
    } else {
      _ssShow('ss-features', 3);
    }
    setTimeout(() => mm_toast?.('PIN session — read-only · password required to save', 'vault'), 800);
  }, 300);
}

function loginSwitchMode(mode) {
  document.getElementById('login-pw-form').style.display  = mode === 'password' ? '' : 'none';
  document.getElementById('login-pin-form').style.display = mode === 'pin' ? '' : 'none';
  document.getElementById('login-mode-title').textContent = mode === 'pin' ? '◎ PIN' : '⬡ Password';
  if (mode === 'pin') document.getElementById('login-pin')?.focus();
  else document.getElementById('login-password')?.focus();
}

/* ── Feature selection ───────────────────────────────────────── */
// ── Module definitions ────────────────────────────────────────────
const MODULES = {
  brain:   { name: 'Brain Map',       color: '#00c8ff', key: 'brain',   defaultOn: true  },
  void:    { name: 'Spatial Void',    color: '#cc44ff', key: 'void',    defaultOn: true  },
  horizon: { name: 'Horizon Living',  color: '#d4a820', key: 'horizon', defaultOn: true  },
  alm:     { name: 'ALM',             color: '#00ff88', key: 'alm',     defaultOn: true  },
};

// Persistent module-visibility toggle for the Options panel — the
// onboarding wizard's toggleFeature() below only ever runs once, during
// setup, with no way back afterward if you change your mind. This is
// that way back: same FEATURES_KEY the wizard writes to, immediately
// re-applies to the homepage, no wizard-specific side effects.
function optsToggleModuleFeature(name) {
  AUTH.features[name] = AUTH.features[name] === false ? true : false;
  try {
    const saved = JSON.parse(localStorage.getItem(FEATURES_KEY) || '{}');
    saved[name] = AUTH.features[name];
    saved._configured = true;
    localStorage.setItem(FEATURES_KEY, JSON.stringify(saved));
  } catch(e) { MMLog?.error('ui', 'optsToggleModuleFeature save failed: ' + e.message); }
  applyFeatureFlags();
  const btn = document.getElementById('opt-modfeat-' + name);
  if (btn) btn.classList.toggle('on', AUTH.features[name] !== false);
  mm_toast((AUTH.features[name] !== false ? 'Enabled: ' : 'Disabled: ') + name, 'info', { dur: 1400 });
}

function toggleFeature(name) {
  if (!MODULES[name]) return;
  AUTH.features[name] = !AUTH.features[name];
  const card  = document.getElementById('feat-' + name);
  const check = document.getElementById('fc-' + name);
  if (card)  card.classList.toggle('active', !!AUTH.features[name]);
  if (check) check.style.opacity = AUTH.features[name] ? '1' : '0';
  const anyActive = Object.keys(MODULES).some(k => AUTH.features[k]);
  const minErr = document.getElementById('feat-min-error');
  if (minErr) minErr.style.display = anyActive ? 'none' : '';
  const btn = document.getElementById('feat-confirm-btn');
  if (btn) btn.disabled = !anyActive;
}

function initFeaturesScreen() {
  Object.keys(MODULES).forEach(k => {
    if (AUTH.features[k] === undefined) AUTH.features[k] = true;
    const on = AUTH.features[k] !== false;
    const card  = document.getElementById('feat-' + k);
    const check = document.getElementById('fc-' + k);
    if (card)  card.classList.toggle('active', on);
    if (check) check.style.opacity = on ? '1' : '0';
  });
}

async function featuresConfirm() {
  const vaultErr = document.getElementById('feat-vault-error');
  const minErr   = document.getElementById('feat-min-error');
  if (vaultErr) vaultErr.style.display = 'none';
  if (minErr)   minErr.style.display   = 'none';

  const anyActive = Object.keys(MODULES).some(k => AUTH.features[k]);
  if (!anyActive) {
    if (minErr) minErr.style.display = '';
    return;
  }

  // Vault gating — verify encryption works before allowing entry
  if (AUTH.encrypted && AUTH.key) {
    try {
      const testData  = new TextEncoder().encode('vault_ok_' + Date.now());
      const encrypted = await _aesEncrypt(AUTH.key, testData);
      const decrypted = await _aesDecrypt(AUTH.key, encrypted);
      const decoded   = new TextDecoder().decode(new Uint8Array(decrypted));
      if (!decoded.startsWith('vault_ok_')) throw new Error('Round-trip mismatch');

      // A vault missing its RSA keypair — real, and seen in the wild on
      // vaults from earlier in this app's life before keygen was reliably
      // wired into every creation path — is NOT the same severity as a
      // vault that fails its own encryption round-trip above. That
      // keypair only feeds the Settings → Keys display/export; it has
      // never been what protects this vault's actual data. Repair it in
      // place — generate one now, the same way setupCreateVault() does
      // for a new identity, and save it — rather than blocking entry to
      // someone's real, otherwise-healthy canvas over a cosmetic gap.
      if (!_AUTH_STORE.keys?.pubKey) {
        MMLog?.warn('vault', 'Vault opened successfully but has no RSA keypair — generating one now rather than blocking entry.');
        const kp = await crypto.subtle.generateKey(
          { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
          true, ['encrypt', 'decrypt']
        );
        const pubRaw  = await crypto.subtle.exportKey('spki', kp.publicKey);
        const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
        _AUTH_STORE.keys = {
          pubKey: VaultCrypto.toBase64(new Uint8Array(pubRaw)),
          encPrivKey: await _aesEncrypt(AUTH.key, new Uint8Array(privRaw)),
        };
        VAULT.dirty = true;
        await vaultSave(false);
        if (VAULT.dirty) throw new Error('generated a keypair but the save did not land — try again');
        mm_toast('Repaired a missing key pair on this vault', 'info', { dur: 4000 });
      }
    } catch(e) {
      if (vaultErr) {
        vaultErr.textContent = '⚡ Vault verification failed: ' + e.message + ' — go back and recreate your identity.';
        vaultErr.style.display = '';
      }
      mm_toast('Vault not ready — cannot proceed', 'error');
      return;
    }
  }

  const btn = document.getElementById('feat-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⬡ Creating vault…'; }

  const flags = Object.assign({}, AUTH.features, { _configured: true });
  localStorage.setItem(FEATURES_KEY, JSON.stringify(flags));
  AUTH.features = flags;

  if (typeof MMVault !== 'undefined' && MMVault.meta) {
    try { await MMVault.save({ modules: flags, configuredAt: Date.now() }, true); }
    catch(e) { mm_toast('Vault save warning: ' + e.message, 'warn'); }
  }

  applyFeatureFlags();
  if (btn) { btn.disabled = false; btn.textContent = '⬡ ACTIVATE & CREATE VAULT'; }

  if (!window.NXAPI) {
    // No NXAPI — desktop app required
    _showDesktopRequiredScreen();
    if (btn) { btn.disabled = false; btn.textContent = '⬡ ACTIVATE & CREATE VAULT'; }
    return;
  }

  // The vault already exists on disk by this point — setupCreateVault() for
  // the encrypted path, _setupSkipEncryptionConfirmed() for the opt-out
  // path — so finishing here means revealing the homepage, not asking for
  // a folder that used to arrive after the vault was already written there.
  setTimeout(() => {
    document.getElementById('startup-screen').classList.add('hidden');
    document.getElementById('homepage').classList.remove('hidden');
    document.getElementById('homepage').scrollTop = 0;
    applyFeatureFlags();
    if (typeof maybeShowWelcome === 'function') maybeShowWelcome();
    _autolockStart?.();
    _applyScaleOnBoot();
    setTimeout(registerWithBridge, 800);
  }, 300);
}

function applyFeatureFlags() {
  const hasBrain   = AUTH.features.brain   !== false;
  const hasVoid    = AUTH.features.void    !== false;
  const hasHorizon = AUTH.features.horizon !== false;
  const hasAlm     = AUTH.features.alm     !== false;
  const show = (sel, v) => document.querySelectorAll(sel).forEach(el => { el.style.display = v ? '' : 'none'; });
  show('.tb-btn[onclick*="openBrainMap"]',   hasBrain);
  show('#tb-brainmode-btn',                  hasBrain);
  show('#hp-modes-btn',                      hasBrain);
  show('.hp-opts-btn[onclick*="enterVoid"]', hasVoid);
  show('#hp-horizon-btn',                    hasHorizon);
  show('#tb-horizon-btn',                    hasHorizon);
  document.querySelectorAll('.hp-mode-card[data-feature]').forEach(c => {
    const feat = c.getAttribute('data-feature');
    // 'creative' card merged into void — use void flag
    const checkFeat = feat === 'creative' ? 'void' : feat;
    if (checkFeat) c.style.display = AUTH.features[checkFeat] !== false ? '' : 'none';
  });
}

// _deriveKey, _aesEncrypt, _aesDecrypt, exportPublicKey, exportPrivateKey,
// _downloadText, downloadVaultBackup
// → implemented in mastermind-vault.js (loaded before this file)

/* ── Right-click drag to pan ────────────────────────────────── */
(function() {
  const cw = document.getElementById('canvas-wrap');
  if (!cw) return;
  let _rcPan = false, _rcX = 0, _rcY = 0, _rcMoved = false, _rcStartX = 0, _rcStartY = 0;
  cw.addEventListener('mousedown', e => {
    if (e.button === 2) {
      _rcPan = true; _rcMoved = false;
      _rcStartX = e.clientX; _rcStartY = e.clientY;
      _rcX = e.clientX - CANVAS.NX.panX; _rcY = e.clientY - CANVAS.NX.panY;
      e.preventDefault();
    }
  });
  document.addEventListener('mousemove', e => {
    if (!_rcPan) return;
    const dx = e.clientX - _rcStartX, dy = e.clientY - _rcStartY;
    if (!_rcMoved && Math.sqrt(dx*dx+dy*dy) > 5) { _rcMoved = true; cw.style.cursor = 'move'; }
    if (_rcMoved) { CANVAS.NX.panX = e.clientX - _rcX; CANVAS.NX.panY = e.clientY - _rcY; CANVAS.applyT(); }
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 2) { _rcPan = false; cw.style.cursor = ''; }
  });
  cw.addEventListener('contextmenu', e => {
    // If we panned, suppress. If the click was on a node, let the node handler run.
    if (_rcMoved) { e.preventDefault(); _rcMoved = false; return; }
    // Only show canvas context menu if target is the canvas itself, not a node
    const node = e.target.closest('.node');
    if (node) return; // node's own contextmenu handler already ran
    e.preventDefault();
    // Canvas background right-click — spawn menu at cursor
    _cwrapCtxMenu(e.clientX, e.clientY);
  });
})();

// Canvas background right-click menu
function _cwrapCtxMenu(x, y) {
  // Show spawn menu at cursor position as a quick-spawn
  const menu = document.getElementById('spawn-menu');
  if (!menu) return;
  menu.style.position = 'fixed';
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top  = Math.min(y, window.innerHeight - 300) + 'px';
  menu.style.display = 'block';
  _spawnMenuOpen = true;
}

// ── Version — single source of truth is package.json ────────────────
// Electron's app.getVersion() reads it directly; every on-screen or
// logged version string in this file fills in from MM_VERSION rather
// than hardcoding its own number. In browser mode (no NXAPI) there's
// no package.json to read, so it falls back to a clearly-labeled
// placeholder rather than a number that would just go stale too.
// Seeded synchronously from window.MM_VERSION (set in index-browser.html
// from NXAPI.version, which preload reads straight out of package.json).
// `let` at top level does NOT create a window property, so MM_VERSION and
// window.MM_VERSION are separate bindings — they are kept in step here and
// nowhere else.
let MM_VERSION = (typeof window !== 'undefined' && window.MM_VERSION) || '0.0.0-dev';

async function mmApplyVersion() {
  try {
    if (window.NXAPI?.version) MM_VERSION = window.NXAPI.version;
    else if (window.NXAPI?.getVersion) MM_VERSION = await window.NXAPI.getVersion();
    else MM_VERSION = '0.0.0-browser';
  } catch (e) { MM_VERSION = '0.0.0-unknown'; }
  window.MM_VERSION = MM_VERSION;

  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  setText('tb-version-display', 'v' + MM_VERSION + ' \u221e');
  setText('mm-vb-ver-display', 'v' + MM_VERSION + ' \u221e');
  setText('hp-version-sub', 'COGNITIVE OPERATING SYSTEM \u00b7 v' + MM_VERSION + ' \u221e');
  setText('about-version-display', MM_VERSION + ' \u221e');
  setText('about-build-output', 'npm install electron electron-builder\nnpx electron-builder --win --x64\nOutput: dist/MASTERMIND-Setup-' + MM_VERSION + '.exe');
  return MM_VERSION;
}

/* ── Single DOMContentLoaded — init + auth ──────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  _mmInstallScaleControls();
  await mmApplyVersion();
  await init();
  _setupPasswordInput();
  startupRoute();
  applyFeatureFlags();
});

console.log('[MASTERMIND] Auth system loaded');

/* ═══════════════════════════════════════════════════════════════════
   MASTERMIND WIZARD — LIVE PREVIEW + ANIMATED KEY GENERATION
═══════════════════════════════════════════════════════════════════ */

// ── System info population ────────────────────────────────────────
function wizInitSystemInfo() {
  // Platform
  const ua = navigator.userAgent;
  let platform = 'Unknown';
  if (ua.includes('Electron')) platform = 'Electron (desktop)';
  else if (ua.includes('Win')) platform = 'Windows / Browser';
  else if (ua.includes('Mac')) platform = 'macOS / Browser';
  else if (ua.includes('Linux')) platform = 'Linux / Browser';
  const pEl = document.getElementById('wiz-platform');
  if (pEl) pEl.textContent = platform;

  // Web Crypto API
  const cEl = document.getElementById('wiz-crypto-api');
  if (cEl) cEl.textContent = (crypto && crypto.subtle) ? '✓ Web Crypto API' : '✗ Not available';
  if (cEl) cEl.style.color = (crypto && crypto.subtle) ? 'var(--g)' : 'var(--r)';

  // Storage: filesystem vault (Electron) or session-only
  const sEl = document.getElementById('wiz-storage-avail');
  if (sEl) {
    if (window.NXAPI) {
      sEl.textContent = '✓ Filesystem vault (Electron)';
      sEl.style.color = 'var(--g)';
    } else {
      sEl.textContent = '✗ No filesystem — desktop app required';
      sEl.style.color = 'var(--r)';
    }
  }

  // Session ID
  const idEl = document.getElementById('wiz-session-id');
  if (idEl) {
    idEl.textContent = uuid().slice(0,13).toUpperCase();
    idEl.style.color = 'var(--dim)';
  }

  // Date in preview
  const dateEl = document.getElementById('wiz-pn-date');
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'});
}

// ── Live identity preview ─────────────────────────────────────────
function wizUpdatePreview() {
  const username = (document.getElementById('setup-username')?.value || '').trim();
  const nameEl = document.getElementById('wiz-pn-name');
  if (nameEl) nameEl.textContent = username ? username.toUpperCase() : '—';
}

// ── Password strength + entropy ───────────────────────────────────
function wizStrength(val) {
  let score = 0;
  if (val.length >= 8)  score++;
  if (val.length >= 14) score++;
  if (val.length >= 20) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;

  const fill  = document.getElementById('setup-strength-fill');
  const label = document.getElementById('setup-strength-label');
  const colors = ['#ff3355','#ff3355','#ff8c22','#ffe04a','#00ff88','#00c8ff','#00c8ff'];
  const labels = ['WEAK','WEAK','FAIR','MODERATE','STRONG','FORTRESS','FORTRESS'];
  if (fill)  { fill.style.width = Math.min(100, (score/6)*100) + '%'; fill.style.background = colors[score]; }
  if (label) { label.textContent = val.length === 0 ? '—' : labels[score]; label.style.color = colors[score]; }

  // Entropy estimate
  const entropyRow = document.getElementById('wiz-entropy-row');
  if (entropyRow && val.length > 0) {
    entropyRow.style.display = 'flex';
    let charSpace = 0;
    if (/[a-z]/.test(val)) charSpace += 26;
    if (/[A-Z]/.test(val)) charSpace += 26;
    if (/[0-9]/.test(val)) charSpace += 10;
    if (/[^A-Za-z0-9]/.test(val)) charSpace += 32;
    const bits = Math.round(val.length * Math.log2(Math.max(charSpace, 1)));
    const bitsEl = document.getElementById('wiz-entropy-bits');
    const crackEl = document.getElementById('wiz-crack-time');
    if (bitsEl) { bitsEl.textContent = `~${bits} bits entropy`; bitsEl.style.color = bits > 60 ? 'var(--g)' : bits > 40 ? 'var(--o)' : 'var(--r)'; }
    if (crackEl) {
      const guesses = Math.pow(2, bits);
      let crackStr;
      if (guesses > 1e30) crackStr = 'centuries at 1B/sec';
      else if (guesses > 1e15) crackStr = 'years at 1B/sec';
      else if (guesses > 1e9) crackStr = 'days at 1B/sec';
      else crackStr = 'fast at 1B/sec';
      crackEl.textContent = crackStr;
      crackEl.style.color = bits > 60 ? 'var(--g)' : bits > 40 ? 'var(--o)' : 'var(--r)';
    }
  } else if (entropyRow) { entropyRow.style.display = 'none'; }

  // Also check match
  wizMatchCheck();
}

// ── Password match indicator ──────────────────────────────────────
function wizMatchCheck() {
  const pw = document.getElementById('setup-password')?.value || '';
  const cf = document.getElementById('setup-confirm')?.value || '';
  const ind = document.getElementById('wiz-match-indicator');
  if (!ind) return;
  if (!cf) { ind.textContent = ''; return; }
  if (pw === cf) { ind.textContent = '✓'; ind.style.color = 'var(--g)'; }
  else { ind.textContent = '✗'; ind.style.color = 'var(--r)'; }
}

// ── Eye toggle ────────────────────────────────────────────────────
function wizToggleEye(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  btn.style.opacity = inp.type === 'text' ? '0.9' : '0.4';
}

// ── Animated key generation progress ─────────────────────────────
function wizStartKeygenAnimation() {
  const btn = document.getElementById('setup-create-btn');
  const icon = document.getElementById('wiz-btn-icon');
  const txt = document.getElementById('wiz-btn-text');
  const prog = document.getElementById('wiz-keygen-progress');
  const fill = document.getElementById('wiz-keygen-fill');
  const status = document.getElementById('wiz-keygen-status');

  if (btn) { btn.disabled = true; }
  if (icon) icon.classList.add('spinning');
  if (prog) prog.style.display = '';

  const steps = [
    [5,  'Generating 256-bit salt...'],
    [15, 'Starting PBKDF2-SHA256...'],
    [25, 'Key derivation in progress...'],
    [50, 'Running 310,000 iterations...'],
    [75, 'Deriving AES-256-GCM key...'],
    [85, 'Generating RSA-OAEP key pair...'],
    [92, 'Encrypting private key...'],
    [97, 'Writing vault to storage...'],
    [100,'Identity sealed ✓'],
  ];

  let i = 0;
  const tick = () => {
    if (i >= steps.length) return;
    const [pct, msg] = steps[i++];
    if (fill) fill.style.width = pct + '%';
    if (status) status.textContent = msg;
    if (i < steps.length) setTimeout(tick, 280 + Math.random() * 200);
  };
  tick();
}

// ── Populate keygen confirmation screen ───────────────────────────
async function wizPopulateKeygen(username, pin, meta) {
  // Username
  const uEl = document.getElementById('mm-kg-username');
  if (uEl) uEl.textContent = username;

  // Created date
  const dEl = document.getElementById('mm-kg-created');
  if (dEl) dEl.textContent = new Date().toLocaleString();

  // PIN
  const pEl = document.getElementById('mm-kg-pinval');
  if (pEl) pEl.textContent = pin ? `set (${pin.length} digits)` : 'not set';
  if (pEl) pEl.style.color = pin ? 'var(--g)' : 'var(--dim)';

  // Vault ID (short hash of meta)
  const vEl = document.getElementById('mm-kg-vault-id');
  if (vEl && meta && meta.salt) vEl.textContent = meta.salt.slice(0,16).toUpperCase() + '...';

  // Vault file path
  const vpEl = document.getElementById('mm-kg-vault-path');
  if (vpEl) {
    const vp = NX_CONFIG.vaultPath || ((NX_CONFIG.dataDir || '~/Documents/MASTERMIND') + '/mastermind.vault');
    vpEl.textContent = vp;
  }

  // Public key thumbprint
  try {
    const vault = JSON.parse(localStorage.getItem('nexus_auth_vault') || '{}');
    const pkEl = document.getElementById('mm-kg-pubkey-thumb');
    if (pkEl && vault.pubKey) {
      pkEl.textContent = vault.pubKey.slice(0,12).toUpperCase() + '...';
    }
  } catch(e) {}

  // Salt thumbprint
  const sEl = document.getElementById('mm-kg-salt-thumb');
  if (sEl && meta && meta.salt) sEl.textContent = meta.salt.slice(0,8).toUpperCase() + '...';

  // Animate crypto stream
  const stream = document.getElementById('wiz-crypto-stream');
  if (stream) {
    const lines = stream.querySelectorAll('.wiz-stream-line');
    lines.forEach((l, i) => {
      l.className = 'wiz-stream-line';
      setTimeout(() => {
        l.classList.add(i === lines.length - 1 ? 'wiz-stream-active' : 'wiz-stream-done');
      }, i * 120);
    });
  }
}

// ── Wire up wizard on init ────────────────────────────────────────
function wizInit() {
  wizInitSystemInfo();
  // Wire password input to strength meter
  const pw = document.getElementById('setup-password');
  if (pw) pw.addEventListener('input', () => wizStrength(pw.value));
}

// Override setupCreateVault to include animation + populate keygen
/* ── Wizard E2E toggle ─────────────────────────────────────── */
function wizToggleE2E(el) {
  _wizE2EEnabled = !el.classList.contains('on');
  el.classList.toggle('on', _wizE2EEnabled);
  const pwFields = document.getElementById('wiz-pw-fields');
  const notice   = document.getElementById('wiz-noenc-notice');
  if (pwFields) pwFields.style.display = _wizE2EEnabled ? '' : 'none';
  if (notice)   notice.style.display   = _wizE2EEnabled ? 'none' : '';
  const btnText = document.getElementById('wiz-btn-text');
  if (btnText) btnText.textContent = _wizE2EEnabled
    ? 'CREATE IDENTITY & GENERATE KEY'
    : 'CREATE IDENTITY (NO ENCRYPTION)';
}

async function setupCreateVault() {
  const username = document.getElementById('setup-username')?.value.trim();
  const password = document.getElementById('setup-password')?.value;
  const confirm  = document.getElementById('setup-confirm')?.value;
  const pin      = document.getElementById('setup-pin')?.value.trim();
  const errEl    = document.getElementById('setup-error');
  const setErr   = msg => { if (errEl) errEl.textContent = msg; };

  setErr('');

  // If E2E toggle is off, skip to unencrypted path
  if (typeof _wizE2EEnabled !== 'undefined' && !_wizE2EEnabled) {
    setupSkipEncryption();
    return;
  }

  if (!username) return setErr('Username required');
  if (password.length < 8) return setErr('Password must be at least 8 characters');
  if (password !== confirm) return setErr('Passwords do not match');
  if (pin && (pin.length < 4 || !/^\d+$/.test(pin))) return setErr('PIN must be 4–8 digits');

  // Check crypto.subtle available (may be blocked in some Electron configs)
  if (!window.crypto?.subtle) return setErr('Web Crypto API unavailable. Check Electron contextIsolation settings.');

  // Start animation immediately
  wizStartKeygenAnimation();

  try {
    // v6: the salt and iteration count are minted by vaultCreateNew() and
    // written into the vault header, not here and not into localStorage.
    // Setup's job is now to assemble the initial state and hand it over.
    AUTH.username = username;

    let pinHash = null;
    if (pin) {
      const pinBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + username));
      pinHash = VaultCrypto.toBase64(new Uint8Array(pinBuf));
    }

    const meta = { username, pinHash, created: Date.now(), version: 6 };

    // Keypair is generated here but stored INSIDE the vault payload below.
    // It used to go to localStorage[AUTH_VAULT_KEY], which login then
    // required — the dependency that made a vault file unopenable on any
    // machine that had not run setup.
    const kp = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
      true, ['encrypt','decrypt']
    );
    const pubRaw  = await crypto.subtle.exportKey('spki', kp.publicKey);
    const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);

    AUTH.hasPin = !!pin; AUTH.pinHash = pinHash;

    // ── GATE: Require real filesystem vault creation ───────────────
    // MASTERMIND does not use browser/localStorage as primary storage.
    // A real vault file MUST be created in the data directory NOW.
    // If Electron is not available or vault write fails → abort entirely.
    if (!window.NXAPI) {
      setErr('⚡ Desktop app required — MASTERMIND cannot create a vault in browser mode. Run the Electron app.');
      const btn2 = document.getElementById('setup-create-btn');
      if (btn2) { btn2.disabled = false; }
      const icon2 = document.getElementById('wiz-btn-icon');
      if (icon2) icon2.classList.remove('spinning');
      return;
    }

    // Get or create the data directory
    let dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
    if (!dataDir) {
      // Use default folder if not yet selected
      dataDir = await window.NXAPI.defaultFolder();
      NX_CONFIG.dataDir = dataDir;
      localStorage.setItem('nexus_datadir', dataDir);
      await window.NXAPI.setDataDir(dataDir);
    }
    const vaultPath = dataDir + '/mastermind.vault';

    // Create the vault file — v6, encrypted, verified by reopening it.
    // The hand-rolled v5 envelope that used to live here is why a freshly
    // created vault was still v5 after the v6 work shipped: two code paths
    // writing the same format, only one of them updated.
    const _initialState = {
      version: 6, format: 'mastermind-vault', saved: Date.now(),
      canvas: { nodes: [], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 }, clipboard: [] },
      modules: { void: null, gaps: null, signal: null, threads: null,
                 body: null, horizon: null, brainMap: null, domain: null,
                 almDeltas: [], intuitionRatings: {}, options: OPTS || {}, features: AUTH.features || {} },
      aiConfig: null,
      snr: null,
      // No salt here. The salt lives in the cleartext header, which is what
      // makes the file openable on a machine that has never run setup.
      identity: { username, pinHash: meta.pinHash || null, created: meta.created, version: 6 },
      keys: {
        pubKey: VaultCrypto.toBase64(new Uint8Array(pubRaw)),
        encPrivKey: null,   // filled in below, once the session key exists
      },
      username,
      jaa: {},
    };

    let created;
    try {
      // vaultCreateNew derives the key, mints salt + vaultId, seals, writes,
      // then reads the file back and decrypts it before reporting success.
      created = await vaultCreateNew(password, _initialState, { dataDir, vaultPath });

      // The RSA private key is wrapped with the session key, which only
      // exists after vaultCreateNew has derived it. Second save, not a
      // second file.
      // _AUTH_STORE is what vaultSerialize reads for identity and keys, so
      // the keypair goes there rather than into a parallel structure.
      _AUTH_STORE.meta = { username, pinHash: meta.pinHash || null, created: meta.created, version: 6 };
      _AUTH_STORE.keys = {
        pubKey: VaultCrypto.toBase64(new Uint8Array(pubRaw)),
        encPrivKey: await _aesEncrypt(AUTH.key, new Uint8Array(privRaw)),
      };
      AUTH.hasPin = !!pin; AUTH.pinHash = pinHash;
      await vaultSave(false);
      if (VAULT.dirty) throw new Error('vault created but the keypair save did not land');
    } catch (ce) {
      setErr('⚡ Vault file creation failed: ' + ce.message + '\nPath: ' + vaultPath);
      MMLog?.error('vault', 'Vault creation failed: ' + ce.message);
      const btn2 = document.getElementById('setup-create-btn');
      if (btn2) { btn2.disabled = false; }
      const icon2 = document.getElementById('wiz-btn-icon');
      if (icon2) icon2.classList.remove('spinning');
      return;
    }

    // Watchdog confirm — file exists
    const confirmed = await window.NXAPI.vaultExists(vaultPath);
    if (!confirmed) {
      setErr('⚡ Vault watchdog failed — file not detected after write. Check disk permissions.');
      return;
    }

    NX_CONFIG.vaultPath = vaultPath;
    MMLog?.info('vault', 'Vault file created at: ' + vaultPath);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.created', { path: vaultPath, username });
    _persistIdentityMarker({ username, noEncryption: false });

    // MM Foundation: create vault record
    if (typeof MMVault !== 'undefined') {
      MMVault.create(username, { encrypted: true });
      MMLog?.info('auth', 'Identity created: ' + username);
    }

    // Populate keygen screen
    await wizPopulateKeygen(username, pin, meta);

    setTimeout(() => _ssShow('ss-keygen', 2), 600);
  } catch(e) {
    setErr('⚡ Error: ' + e.message);
    MMLog?.error('auth', 'setupCreateVault error: ' + e.message);
    const btn = document.getElementById('setup-create-btn');
    if (btn) { btn.disabled = false; }
    const icon = document.getElementById('wiz-btn-icon');
    if (icon) icon.classList.remove('spinning');
    const prog = document.getElementById('wiz-keygen-progress');
    if (prog) prog.style.display = 'none';
  }
}

// wizInit called from startupRoute (already integrated below)

console.log('[MASTERMIND] Wizard loaded');

/* ═══════════════════════════════════════════════════════════════════
   OPTIONS PANEL ENGINE — Tabs, toggles, backup codes, security
═══════════════════════════════════════════════════════════════════ */

const OPTS_KEY = 'nexus_options';
const OPTS = {
  // Appearance
  font_scale: 100, ui_scale: 100, compact: false, opts_density: false, badges: true, depth: true,
  typecolor: true, scanlines: true, ambient: true,
  // Canvas
  particles: true, grid: true, clusters: true, animated: true,
  snap: false, inertia: true, dblspawn: true, rcpan: true,
  connlabels: true, autosave: true, autosave_interval: 30,
  // Hard ceiling on how long anything may stay unwritten, regardless of
  // how fast new nodes arrive. Without it the debounce starves.
  autosave_max_wait: 10, panel_scale: 100,
  // Lexicon / capture. All default ON except anything that sends data
  // anywhere or rewrites what you said.
  lexicon_learn: true,
  lexicon_prompt: true,
  lexicon_disambiguate: false,
  allow_cloud_speech: false,    // DR-004: browser speech sends audio to Google
  // Assistance boundary (docs/AI-CONTRACT.md). Off, local, confirming —
  // every default here is the cautious one, because a default is what
  // almost everyone runs.
  assist_enabled: false,
  assist_provider: 'local',
  assist_intents: { 'disambiguate': true, 'suggest-tags': true, 'propose-edges': false, 'expand': false, 'question': false },
  assist_maxchars: 4000,
  assist_maxitems: 20,
  assist_confirm: true,
  assist_log: [],
  // Lexicon / capture. All default ON except the ones that send data
  // anywhere or rewrite what you said.
  lexicon_learn: true,          // build vocabulary + grammar from speech
  lexicon_prompt: true,         // seed Whisper with your own distinctive words
  lexicon_disambiguate: false,  // SUGGEST corrections — never silent, off by default
  allow_cloud_speech: false,    // DR-004: browser speech sends audio to Google

  undo_depth: 200,
  // Brain map
  brain_view: 'force', brain_physics: true, brain_halos: true,
  brain_labels: true, brain_particles: true, brain_pulse: true,
  brain_repulsion: 3000, brain_dblclick: true,
  // Framework
  gap_auto: true, gap_autoexport: false, signal_threshold: 9,
  somatic: true, hostile_autoexport: false,
  osc_remind: false, osc_interval: 20,
  // Security
  e2e: false, pw_required: false, pin_enabled: false,
  autolock: false, autolock_mins: 15, clear_clip: false,

  // Whisper CLI + pipeline — full surface. threads:0 means "let whisper.js
  // pick" (Math.max(2, cpus/2)), same as leaving cfg.threads undefined did
  // before this existed; 0 is the sentinel for that, not a real thread count.
  voice_whisper_language: 'auto',
  voice_whisper_threads: 0,
  voice_whisper_timeout_ms: 120000,
  voice_max_segment_ms: 25000,
  voice_prompt_seed_count: 40,
};

let _backupCodes = [];

function loadOpts() {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}');
    Object.assign(OPTS, saved);
  } catch(e) {
    MMLog?.error('ui', 'loadOpts failed, using defaults: ' + e.message);
  }
}

let _saveOptsTimer = null;
function saveOpts() {
  try { localStorage.setItem(OPTS_KEY, JSON.stringify(OPTS)); } catch(e) {}
  // Debounced toast — only fires 1.5s after last change
  clearTimeout(_saveOptsTimer);
  _saveOptsTimer = setTimeout(() => { if (typeof T !== 'undefined') T.settingsSaved(); }, 1500);
  // Flash saved indicator
  const ind = document.getElementById('opts-save-indicator');
  if (ind) { ind.style.opacity = '1'; setTimeout(() => { ind.style.opacity = '0'; }, 1200); }
}

// ── Roadmap ──────────────────────────────────────────────────────────────
// Rendered from phasemap/phases.json rather than written into the markup,
// so the panel cannot drift from the plan. One source, no second copy to
// forget to update.
let _mmPhases = null;

async function optsRenderRoadmap() {
  const el = document.getElementById('opt-roadmap-list');
  if (!el) return;
  if (!_mmPhases) {
    try { _mmPhases = await (await fetch('phasemap/phases.json')).json(); }
    catch (e) {
      el.innerHTML = '<div class="opts-hint" style="color:var(--o)">Could not read phasemap/phases.json \u2014 ' + escH(e.message) + '</div>';
      return;
    }
  }
  const colour = { done: 'var(--g)', partial: 'var(--c)', next: 'var(--o)', open: 'var(--o)', planned: 'var(--dim)' };
  const glyph  = { done: '\u25c6', partial: '\u25d0', next: '\u25b6', open: '\u25b3', planned: '\u25cb' };

  el.innerHTML = _mmPhases.phases.map(p => {
    const c = colour[p.state] || 'var(--dim)';
    return '<div style="border:1px solid var(--wire);background:var(--abyss);padding:8px 10px">' +
      '<div style="display:flex;align-items:baseline;gap:9px">' +
        '<span style="color:' + c + ';font-size:9px">' + (glyph[p.state] || '\u25cb') + '</span>' +
        '<span style="font-family:var(--f-mono);font-size:8px;letter-spacing:2px;color:var(--dim);min-width:38px">' + escH(p.id) + '</span>' +
        '<span style="font-family:var(--f-mono);font-size:9px;letter-spacing:1.5px;color:var(--bright);text-transform:uppercase;flex:1">' + escH(p.name) + '</span>' +
        '<span style="font-family:var(--f-mono);font-size:8px;color:' + c + '">' + escH(String(p.state).toUpperCase()) + '</span>' +
      '</div>' +
      '<div style="height:2px;background:var(--wire2);margin:6px 0 5px"><div style="height:100%;width:' + (p.pct || 0) + '%;background:' + c + '"></div></div>' +
      '<div style="font-family:var(--f-body);font-size:10px;line-height:1.6;color:var(--mid)">' + escH(p.note || '') + '</div>' +
      (p.blocks && p.blocks.length
        ? '<div style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;color:var(--o);margin-top:5px">BLOCKS ' + escH(p.blocks.join(' \u00b7 ')) + '</div>' : '') +
      '</div>';
  }).join('');
}

// Components are rendered from phasemap/components.json for the same
// reason the phases are: one source. A panel that restates a manifest
// drifts from it the first time only one of the two is updated.
let _mmComponents = null;

async function optsRenderComponents() {
  const el = document.getElementById('opt-components-list');
  if (!el) return;
  if (!_mmComponents) {
    try { _mmComponents = await (await fetch('phasemap/components.json')).json(); }
    catch (e) { el.innerHTML = '<div class="opts-hint" style="color:var(--o)">Could not read phasemap/components.json</div>'; return; }
  }

  const lifeColour = {
    Released: 'var(--g)', Verified: 'var(--c)', Implemented: 'var(--c)',
    Specified: 'var(--o)', Draft: 'var(--dim)',
  };

  const row = (c, isFoundation) =>
    '<div style="border:1px solid var(--wire);background:var(--abyss);padding:7px 10px">' +
      '<div style="display:flex;align-items:baseline;gap:9px">' +
        '<span style="font-family:var(--f-mono);font-size:8px;letter-spacing:1.5px;color:' +
          (isFoundation ? 'var(--v)' : 'var(--c)') + ';min-width:88px">' + escH(c.id) + '</span>' +
        '<span style="font-family:var(--f-body);font-size:10px;color:var(--mid);flex:1">' +
          escH(c.path || (c.parent ? 'parent ' + c.parent : '')) +
          (c.fnsInV7 ? ' \u00b7 ' + c.fnsInV7 + ' fn in v7' : '') + '</span>' +
        '<span style="font-family:var(--f-mono);font-size:7.5px;color:' +
          (lifeColour[c.lifecycle] || 'var(--dim)') + '">' + escH(String(c.lifecycle).toUpperCase()) + '</span>' +
      '</div>' +
      (c.note ? '<div style="font-family:var(--f-body);font-size:9.5px;color:var(--dim);margin-top:4px;line-height:1.5">' + escH(c.note) + '</div>' : '') +
    '</div>';

  el.innerHTML =
    '<div style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:2px;color:var(--v);padding:4px 0">FOUNDATION</div>' +
    _mmComponents.foundation.map(c => row(c, true)).join('') +
    '<div style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:2px;color:var(--c);padding:8px 0 4px">COMPONENTS</div>' +
    _mmComponents.components.map(c => row(c, false)).join('') +
    (_mmComponents.openQuestions && _mmComponents.openQuestions.length
      ? '<div style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:2px;color:var(--o);padding:8px 0 4px">OPEN QUESTIONS</div>' +
        _mmComponents.openQuestions.map(q =>
          '<div style="font-family:var(--f-body);font-size:9.5px;color:var(--mid);line-height:1.6;padding:2px 0">\u25b3 ' + escH(q) + '</div>').join('')
      : '');
}

// ── Assistance options ───────────────────────────────────────────────────
// The only controls over what leaves the machine, so each says what it
// does in concrete terms rather than naming a feature.

function optsToggleAssist(el) {
  el.classList.toggle('on');
  OPTS.assist_enabled = el.classList.contains('on');
  saveOpts();
  optsRefreshAssist();
  if (OPTS.assist_enabled && OPTS.assist_provider === 'cloud') {
    mm_toast('Assistance on, provider is CLOUD \u2014 request text will leave this machine', 'warn', { dur: 6000 });
  }
}

function optsSetAssistProvider(v) {
  if (v === 'cloud') {
    // A confirmation, not a toast. This is the most consequential
    // setting in the application.
    mmConfirm(
      'Send assistance requests to a cloud model?\n\n' +
      'The text in each request reaches a third party in the clear. The allowlist still applies and every ' +
      'request is still logged with a hash \u2014 but it does leave this machine.\n\n' +
      'Your vault, lexicon, keys and audit ledger are never sent either way.'
    ).then(ok => {
      OPTS.assist_provider = ok ? 'cloud' : 'local';
      const sel = document.getElementById('opt-assist-provider');
      if (sel) sel.value = OPTS.assist_provider;
      saveOpts(); optsRefreshAssist();
    });
    return;
  }
  OPTS.assist_provider = 'local';
  saveOpts(); optsRefreshAssist();
}

function optsToggleIntent(el, intent) {
  el.classList.toggle('on');
  OPTS.assist_intents = OPTS.assist_intents || {};
  OPTS.assist_intents[intent] = el.classList.contains('on');
  saveOpts(); optsRefreshAssist();
}

function optsSetAssistBudget(key, value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return;
  if (key === 'maxChars') OPTS.assist_maxchars = Math.max(200, Math.min(20000, n));
  if (key === 'maxItems') OPTS.assist_maxitems = Math.max(1, Math.min(100, n));
  saveOpts(); optsRefreshAssist();
}

// Bounded. The log is a record of recent egress, not an archive — an
// unbounded array inside the vault payload grows on every save forever.
function optsRecordEgress(receipt) {
  OPTS.assist_log = (OPTS.assist_log || []).concat([receipt]).slice(-50);
  saveOpts(); optsRefreshAssist();
}

function optsRefreshAssist() {
  const on = OPTS.assist_enabled === true;
  const cloud = OPTS.assist_provider === 'cloud';
  const set = (id, val) => { const e = document.getElementById(id); if (e) e.classList.toggle('on', !!val); };

  set('opt-assist-enabled', on);
  set('opt-assist-confirm', OPTS.assist_confirm !== false);
  set('opt-lexicon-learn', OPTS.lexicon_learn !== false);
  set('opt-lexicon-prompt', OPTS.lexicon_prompt !== false);
  set('opt-lexicon-disambiguate', OPTS.lexicon_disambiguate === true);

  const intents = OPTS.assist_intents || {};
  for (const k of ['disambiguate', 'suggest-tags', 'propose-edges', 'expand', 'question']) set('opt-intent-' + k, intents[k] === true);

  const sel = document.getElementById('opt-assist-provider');
  if (sel) sel.value = OPTS.assist_provider || 'local';
  const warn = document.getElementById('opt-assist-cloud-warn');
  if (warn) warn.style.display = cloud ? '' : 'none';
  const mc = document.getElementById('opt-assist-maxchars'); if (mc) mc.value = OPTS.assist_maxchars || 4000;
  const mi = document.getElementById('opt-assist-maxitems'); if (mi) mi.value = OPTS.assist_maxitems || 20;

  const state = document.getElementById('opt-assist-state');
  if (state) {
    const enabled = Object.entries(intents).filter(([, v]) => v).map(([k]) => k);
    state.innerHTML = !on
      ? '<span style="color:var(--g)">\u25c6 OFF</span> \u2014 no assistance request is built. Nothing leaves this machine.'
      : (cloud ? '<span style="color:var(--o)">\u25b3 CLOUD</span> \u2014 request text leaves this machine. '
               : '<span style="color:var(--c)">\u25c6 LOCAL</span> \u2014 nothing leaves this machine. ') +
        (enabled.length ? 'Allowed: ' + enabled.join(', ') + '.' : 'No intents enabled, so nothing can be asked.');
  }

  const lex = document.getElementById('opt-lexicon-state');
  if (lex && typeof MM_LEXICON !== 'undefined' && MM_LEXICON) {
    try { lex.textContent = MM_LEXICON.maturity().summary; } catch (e) { lex.textContent = '\u2014'; }
  }

  const log = document.getElementById('opt-assist-log');
  if (log) {
    const entries = (OPTS.assist_log || []).slice(-25).reverse();
    log.innerHTML = entries.length ? entries.map(r =>
      '<div>' + escH(String(r.at || '').slice(0, 19).replace('T', ' ')) +
      ' \u00b7 <span style="color:var(--c)">' + escH(r.intent || '?') + '</span>' +
      ' \u00b7 ' + escH(String(r.requestedBy || '?')) +
      ' \u00b7 ' + (r.items || 0) + ' item(s), ' + (r.chars || 0) + ' chars' +
      ' \u00b7 <span style="color:' + (r.provider === 'cloud' ? 'var(--o)' : 'var(--dim)') + '">' + escH(r.provider || 'local') + '</span>' +
      (r.sha256 ? ' \u00b7 <span style="color:var(--dim)">' + escH(r.sha256.slice(0, 12)) + '</span>' : '') + '</div>').join('')
      : 'Nothing has been sent.';
  }
}

function optsTab(el, name) {
  document.querySelectorAll('.opts-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.opts-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  const tab = document.getElementById('otab-' + name);
  if (tab) tab.classList.add('active');
  // Refresh dynamic content
  if (name === 'keys')       optsRefreshKeys();
  if (name === 'data')       refreshStorageInfo();
  if (name === 'security')   optsRefreshSecurity();
  if (name === 'vault')      optsRefreshVault();
  if (name === 'foundation') optsRefreshFoundation();
  if (name === 'horizon')    optsRefreshHorizon();
  if (name === 'roadmap') { optsRenderRoadmap(); optsRenderComponents(); }
  if (name === 'ai') {
    // The assistance boundary panel — the part governed by the contract.
    optsRefreshAssist();
    // Sync provider select from AI state
    const provSel = document.getElementById('opt-ai-provider');
    if (provSel) provSel.value = AI.provider || 'ollama';
    // Sync enabled toggle
    const enabledToggle = document.getElementById('opt-ai-enabled');
    if (enabledToggle) enabledToggle.classList.toggle('on', !!AI.enabled);
    // Update model list and show/hide Ollama fields
    optsUpdateAIModel();
    optsShowOllamaFields();
    // Sync ollama base URL if set
    const ollamaBase = document.getElementById('ai-ollama-base');
    if (ollamaBase && AI.ollamaBase) ollamaBase.value = AI.ollamaBase;
  }
}

function optsToggle(el, key) {
  el.classList.toggle('on');
  OPTS[key] = el.classList.contains('on');
  saveOpts();
  // Side effects
  if (key === 'autolock') {
    const row = document.getElementById('opt-autolock-minutes-row');
    if (row) row.style.display = OPTS.autolock ? '' : 'none';
    if (OPTS.autolock) _autolockStart?.(); 
    else if (_autolockTimer) { clearInterval(_autolockTimer); _autolockTimer = null; }
  }
  if (key === 'scanlines') document.body.style.setProperty('--scanline-opacity', OPTS.scanlines ? '' : '0');
  if (key === 'ambient') document.body.classList.toggle('no-ambient', !OPTS.ambient);
  if (key === 'opts_density') document.body.classList.toggle('mm-opts-compact', !!OPTS.opts_density);
}

function optsSet(key, val) {
  OPTS[key] = val; saveOpts();
}

// ── UI scale by keyboard and wheel ───────────────────────────────────────
// The control lives in Settings, which is exactly where you cannot reach it
// when the UI is too large to navigate. Ctrl+scroll and Ctrl+/- work from
// anywhere, which is what people already expect from a browser. This nudges
// ui_scale (everything), not font_scale (text only) — Ctrl+scroll is a
// "zoom" gesture in every browser and matches that expectation; a person
// who wants text-only sizing has the dedicated font-size control in
// Settings for that, separate from this.
function mmNudgeUIScale(deltaPct) {
  const cur = OPTS.ui_scale || 100;
  const next = Math.max(60, Math.min(200, cur + deltaPct));
  if (next === cur) return next;
  optsSetUIScale(next);
  const sel = document.getElementById('opt-ui-scale');
  if (sel) sel.value = next;
  mm_toast('Interface ' + next + '%', 'info', { dur: 900 });
  return next;
}

function mmResetUIScale() {
  optsSetUIScale(100);
  const sel = document.getElementById('opt-ui-scale');
  if (sel) sel.value = 100;
  mm_toast('Interface 100%', 'info', { dur: 900 });
}

function _mmInstallScaleControls() {
  // Wheel: passive:false so the browser's own page zoom can be prevented.
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    mmNudgeUIScale(e.deltaY < 0 ? 5 : -5);
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    // Ignore while typing — Ctrl+- in a text field is not a zoom request.
    const tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); mmNudgeUIScale(5); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); mmNudgeUIScale(-5); }
    else if (e.key === '0') { e.preventDefault(); mmResetUIScale(); }
  });
}

function optsSetPanelScale(val) {
  const pct = Math.max(60, Math.min(160, parseInt(val) || 100));
  OPTS.panel_scale = pct;
  const valEl = document.getElementById('opt-panel-scale-val');
  if (valEl) valEl.textContent = pct + '%';
  _mmApplyScale();   // re-applies the panel ratio
  saveOpts();
}

// font_scale and ui_scale used to be one variable wearing two names —
// moving the old single "UI font size" control resized text AND every
// button/icon/spacing together, because it drove both the --fs-*
// typography tokens AND document.body.style.zoom (which re-multiplies
// whatever pixel size text already has). There was no way to make text
// bigger without the whole app growing with it, or the reverse.
//
// They are genuinely independent now:
//   ui_scale   -> document.body.style.zoom alone. Layout, controls,
//                 icons, spacing, canvas rendering — "how big is
//                 everything", the way Ctrl+scroll zoom works anywhere.
//   font_scale -> --ui-scale CSS var alone, which is what --fs-base/
//                 --fs-mono/--fs-sm/--fs-xs/--fs-lg and the two
//                 explicit root/body font-size lines are built from.
//                 "How big is TEXT" — independent of ui_scale.
//
// The independence needs real math, not two separate assignments,
// because zoom multiplies literally every already-rendered pixel,
// including whatever font-size the CSS vars produce. If font_scale set
// --ui-scale directly, body.zoom(ui_scale) would multiply the resulting
// text a second time and font_scale would stop meaning what its label
// says the moment ui_scale changed. So --ui-scale is set to
// (font_scale / ui_scale): once body.zoom multiplies everything by
// ui_scale, the division cancels back out and the on-screen text ends
// up sized by font_scale alone —
//   observed = (base_px * font_scale / ui_scale) * ui_scale = base_px * font_scale
// — regardless of what ui_scale is set to. Non-token pixels (padding,
// icon dimensions, the thousands of hardcoded inline font-size:Npx
// values elsewhere that don't go through --fs-*) still only respond to
// ui_scale, which is correct: those ARE "everything else", not text.
//
// This does NOT reach every hardcoded inline font-size in the app —
// same pre-existing limit as before (see the comment this replaced).
// What it fixes is that the two THINGS THAT DO EXIST — the --fs-*
// tokens and the zoom — are no longer forced to move together.
function _mmApplyScale() {
  const fontPct = _nearestScalePreset(Math.max(80, Math.min(200, OPTS.font_scale || 100)));
  const uiPct   = _nearestScalePreset(Math.max(60, Math.min(200, OPTS.ui_scale || 100)));
  OPTS.font_scale = fontPct;
  OPTS.ui_scale = uiPct;

  const fontScale = fontPct / 100;
  const uiScale = uiPct / 100;
  const tokenRatio = fontScale / uiScale; // cancels against body.zoom below

  document.documentElement.style.setProperty('--ui-scale', tokenRatio);
  document.documentElement.style.fontSize = (16 * tokenRatio) + 'px';
  document.body.style.fontSize = (13 * tokenRatio) + 'px';
  document.body.style.zoom = uiScale;

  // The Options panel gets its OWN local --ui-scale override, set to
  // fontScale directly (NOT divided by uiScale). If it inherited the
  // divided value from the root, the panel's counter-zoom below (which
  // only cancels the body's zoom contribution) would leave the /uiScale
  // term from the CSS var stranded, uncancelled — the panel's text
  // would still drift with ui_scale even though nothing else about the
  // panel does. Setting it locally, undivided, avoids that leak: the
  // panel's own zoom cancels ui_scale from the LAYOUT side, and this
  // local var means there was never a ui_scale term in the TEXT side to
  // begin with.
  const optsOverlay = document.getElementById('opts-overlay');
  if (optsOverlay) {
    optsOverlay.style.setProperty('--ui-scale', fontScale);
    const panel = (OPTS.panel_scale || 100) / 100;
    optsOverlay.style.zoom = String(panel / uiScale);
  }

  const fontValEl = document.getElementById('opt-font-scale-val');
  if (fontValEl) fontValEl.textContent = fontPct + '%';
  const uiValEl = document.getElementById('opt-ui-scale-val');
  if (uiValEl) uiValEl.textContent = uiPct + '%';
  const fontSel = document.getElementById('opt-font-scale');
  if (fontSel) fontSel.value = String(fontPct);
  const uiSel = document.getElementById('opt-ui-scale');
  if (uiSel) uiSel.value = String(uiPct);

  saveOpts();
  if (typeof MM_BUS !== 'undefined') {
    MM_BUS.emit('mm.opts.font_scale', { scale: fontScale, percent: fontPct });
    MM_BUS.emit('mm.opts.ui_scale', { scale: uiScale, percent: uiPct });
  }
}

function optsSetFontScale(val) {
  OPTS.font_scale = parseInt(val) || 100;
  _mmApplyScale();
}

function optsSetUIScale(val) {
  OPTS.ui_scale = parseInt(val) || 100;
  _mmApplyScale();

}

function optsSetAutosaveInterval(val) {
  OPTS.autosave_interval = parseInt(val);
  document.getElementById('opt-autosave-interval-val').textContent = val + 's';
  saveOpts();
}

// ── Voice capture ──────────────────────────────────────────────────
// Shared by the orb (modules/voice-lattice/ui-capture.js) and rolling
// recall (modules/voice-lattice/recall.js) — one set of numbers, read
// fresh by each capture whenever it starts, not duplicated per-feature.

async function optsToggleVoiceRecall(el) {
  if (typeof recallToggle !== 'function') {
    mm_toast('Rolling recall unavailable in this build', 'warn');
    return;
  }
  el.style.opacity = '.5';
  try {
    const r = await recallToggle();
    if (!r.ok) {
      mm_toast(r.error || 'Could not toggle rolling recall', 'error', { dur: 6000 });
      return;
    }
    el.classList.toggle('on', r.enabled !== false && (typeof RECALL === 'undefined' || RECALL.enabled));
  } finally {
    el.style.opacity = '1';
  }
}

function optsSetVoiceThreshold(val) {
  // Slider is 5–60 (integer, easy to drag); RMS threshold is a small
  // decimal (~0.005–0.06) — this just puts a friendlier control on top
  // of the real unit rather than asking anyone to type 0.018.
  OPTS.voice_vad_threshold = parseInt(val) / 1000;
  document.getElementById('opt-voice-threshold-val').textContent = OPTS.voice_vad_threshold.toFixed(3);
  if (typeof RECALL !== 'undefined') RECALL.rmsThreshold = OPTS.voice_vad_threshold;
  saveOpts();
}

function optsSetVoiceSilence(val) {
  OPTS.voice_silence_hold_ms = parseInt(val);
  document.getElementById('opt-voice-silence-val').textContent = (OPTS.voice_silence_hold_ms / 1000).toFixed(1) + 's';
  if (typeof RECALL !== 'undefined') RECALL.silenceHoldMs = OPTS.voice_silence_hold_ms;
  saveOpts();
}

function optsSetVoicePreroll(val) {
  OPTS.voice_preroll_ms = parseInt(val);
  document.getElementById('opt-voice-preroll-val').textContent = (OPTS.voice_preroll_ms / 1000).toFixed(1) + 's';
  if (typeof RECALL !== 'undefined') RECALL.prerollMs = OPTS.voice_preroll_ms;
  saveOpts();
}

function optsSetVoiceModel(val) {
  OPTS.voice_whisper_model = val;
  saveOpts();
}

function optsSetVoiceLanguage(val) {
  OPTS.voice_whisper_language = val;
  saveOpts();
}

function optsSetVoiceThreads(val) {
  // 0 = auto (whisper.js's own Math.max(2, cpus/2) default). Slider max
  // is generous rather than clamped to this machine's core count — a
  // request for more threads than exist just gets ignored by the OS
  // scheduler, it doesn't error, so there's nothing to validate here.
  OPTS.voice_whisper_threads = parseInt(val);
  const el = document.getElementById('opt-voice-threads-val');
  if (el) el.textContent = OPTS.voice_whisper_threads === 0 ? 'auto' : String(OPTS.voice_whisper_threads);
  saveOpts();
}

function optsSetVoiceTimeout(val) {
  OPTS.voice_whisper_timeout_ms = parseInt(val) * 1000;
  const el = document.getElementById('opt-voice-timeout-val');
  if (el) el.textContent = parseInt(val) + 's';
  saveOpts();
}

function optsSetVoiceMaxSegment(val) {
  OPTS.voice_max_segment_ms = parseInt(val) * 1000;
  const el = document.getElementById('opt-voice-maxsegment-val');
  if (el) el.textContent = parseInt(val) + 's';
  saveOpts();
}

function optsSetVoicePromptSeedCount(val) {
  OPTS.voice_prompt_seed_count = parseInt(val);
  const el = document.getElementById('opt-voice-promptcount-val');
  if (el) el.textContent = String(OPTS.voice_prompt_seed_count);
  saveOpts();
}

function optsSetUndoDepth(val) {
  OPTS.undo_depth = parseInt(val);
  document.getElementById('opt-undo-depth-val').textContent = val;
  saveOpts();
}

function optsSetBrainRepulsion(val) {
  OPTS.brain_repulsion = parseInt(val);
  document.getElementById('opt-brain-repulsion-val').textContent = val;
  saveOpts();
}

function optsSetSignalThreshold(val) {
  OPTS.signal_threshold = parseInt(val);
  document.getElementById('opt-signal-threshold-val').textContent = val;
  saveOpts();
}

// Autolock timer state
let _autolockTimer = null;
let _autolockLastActivity = Date.now();

function _autolockReset() {
  _autolockLastActivity = Date.now();
}

function _autolockStart() {
  if (_autolockTimer) clearInterval(_autolockTimer);
  if (!OPTS.autolock || !OPTS.autolock_mins) return;
  // Reset on any user interaction
  ['mousemove','keydown','click','touchstart'].forEach(ev =>
    document.removeEventListener(ev, _autolockReset)
  );
  ['mousemove','keydown','click','touchstart'].forEach(ev =>
    document.addEventListener(ev, _autolockReset, { passive: true })
  );
  _autolockTimer = setInterval(() => {
    if (!OPTS.autolock || !OPTS.autolock_mins) return;
    const idle = (Date.now() - _autolockLastActivity) / 60000;
    if (idle >= OPTS.autolock_mins) {
      clearInterval(_autolockTimer);
      _autolockTimer = null;
      // Lock — use atomic _lockSession() which wipes key + resets seal + returns to login
      mm_toast('Auto-locked after ' + OPTS.autolock_mins + ' min idle', 'vault');
      MMLog?.info('auth', 'Auto-lock triggered after ' + OPTS.autolock_mins + ' min');
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.autolock', { idleMin: OPTS.autolock_mins });
      _lockSession('autolock');
    }
  }, 30000); // check every 30s
}

function optsSetAutolock(val) {
  OPTS.autolock_mins = parseInt(val);
  saveOpts();
  if (OPTS.autolock && OPTS.autolock_mins > 0) _autolockStart();
  else if (_autolockTimer) { clearInterval(_autolockTimer); _autolockTimer = null; }
}

function optsSetOscInterval(val) {
  OPTS.osc_interval = parseInt(val);
  document.getElementById('opt-osc-interval-val').textContent = val + 'm';
  saveOpts();
}

/* ── Security tab ─────────────────────────────────────────── */
function optsRefreshSecurity() {
  const meta = _authLoadMeta();
  if (!meta) return;
  const el = document.getElementById('opts-identity-info');
  if (el) el.innerHTML =
    'Identity: <span style="color:var(--c)">' + escH(meta.username||'—') + '</span><br>' +
    'Encryption: <span style="color:' + (meta.noEncryption ? 'var(--dim)' : 'var(--g)') + '">' +
    (meta.noEncryption ? 'disabled' : 'AES-256-GCM active') + '</span><br>' +
    'PIN: <span style="color:' + (meta.pinHash ? 'var(--g)' : 'var(--dim)') + '">' +
    (meta.pinHash ? 'set' : 'not set') + '</span><br>' +
    'Created: <span style="color:var(--mid)">' + (meta.created ? new Date(meta.created).toLocaleDateString() : '—') + '</span>';

  // Sync toggles to current state
  const setToggle = (id, on) => {
    const el = document.getElementById(id);
    if (el) { el.classList.toggle('on', on); }
  };
  setToggle('opt-e2e', !meta.noEncryption);
  setToggle('opt-pw-required', !meta.noEncryption);
  setToggle('opt-pin-enabled', !!meta.pinHash);

  // ── Cryptographic detail + key export, on demand ──────────────────
  // This used to only ever appear once — the ss-keygen wizard screen,
  // shown exactly one time at vault creation. Lose that moment (closed
  // the app too fast, never got to export) and there was no way back to
  // it: no vault ID, no key thumbprints, no export buttons, anywhere.
  // Same detail, same export functions (exportPublicKey/exportPrivateKey
  // — unchanged, just called from a second place), now reachable from
  // Settings any time the vault is unlocked, not just at creation.
  const cryptoEl = document.getElementById('opts-crypto-detail');
  if (cryptoEl && !meta.noEncryption) {
    const vaultId = (typeof VAULT !== 'undefined' && VAULT.vaultId) || '—';
    const iterations = (typeof AUTH !== 'undefined' && AUTH.kdf?.iterations) || '—';
    const pub = (typeof _AUTH_STORE !== 'undefined' && _AUTH_STORE.keys?.pubKey) || '';
    const pubThumb = pub ? (pub.slice(0, 8) + '…' + pub.slice(-8)) : 'not generated';
    cryptoEl.style.display = '';
    cryptoEl.innerHTML =
      'Vault ID: <span class="wiz-mono" style="color:var(--c)">' + escH(vaultId) + '</span><br>' +
      'KDF: <span style="color:var(--c)">PBKDF2-SHA256 &times; ' + escH(String(iterations)) + '</span><br>' +
      'Key pair: <span style="color:var(--v)">RSA-OAEP 2048-bit</span><br>' +
      'Public key: <span class="wiz-mono" style="color:var(--g)">' + escH(pubThumb) + '</span>';
  } else if (cryptoEl) {
    cryptoEl.style.display = 'none';
  }

  if (typeof mfaUiRefresh === 'function') mfaUiRefresh();
}

// ── MFA Settings UI ───────────────────────────────────────────────────
// Glue between the Security tab's markup and the MFA_STATE / MfaCrypto
// functions in vault-mfa.js / vault-mfa-state.js.

function mfaUiRefresh() {
  if (typeof MFA_STATE === 'undefined') return;

  // TOTP
  const totpStatus = document.getElementById('mfa-totp-status');
  const setupBtn = document.getElementById('mfa-totp-setup-btn');
  const disableBtn = document.getElementById('mfa-totp-disable-btn');
  if (totpStatus) {
    totpStatus.innerHTML = MFA_STATE.totp.enabled
      ? '<span style="color:var(--g)">\u25c6 Enabled</span> \u00b7 confirmed ' + new Date(MFA_STATE.totp.confirmedAt).toLocaleDateString()
      : 'Not set up. A 6-digit code from an app like Authy, 1Password, or Google/Microsoft Authenticator.';
  }
  if (setupBtn) setupBtn.style.display = MFA_STATE.totp.enabled ? 'none' : '';
  if (disableBtn) disableBtn.style.display = MFA_STATE.totp.enabled ? '' : 'none';

  // WebAuthn
  const cap = (typeof mfaWebauthnCapability === 'function') ? mfaWebauthnCapability() : { supported: false, reason: 'Unavailable' };
  const waStatus = document.getElementById('mfa-webauthn-status');
  const waAddBtn = document.getElementById('mfa-webauthn-add-btn');
  const count = (MFA_STATE.webauthn.credentials || []).length;
  if (waStatus) {
    waStatus.innerHTML = !cap.supported
      ? '<span style="color:var(--o)">\u25b3 ' + escH(cap.reason) + '</span>'
      : (count ? '<span style="color:var(--g)">\u25c6 ' + count + ' key' + (count === 1 ? '' : 's') + ' registered</span>' : 'No security keys registered yet.');
  }
  if (waAddBtn) waAddBtn.disabled = !cap.supported;

  const list = document.getElementById('mfa-webauthn-list');
  if (list) {
    list.innerHTML = (MFA_STATE.webauthn.credentials || []).map((c) => `
      <div class="opts-row">
        <div class="opts-label">${escH(c.name)}<div class="opts-hint">Added ${new Date(c.addedAt).toLocaleDateString()}${c.lastUsedAt ? ' \u00b7 last used ' + new Date(c.lastUsedAt).toLocaleDateString() : ''}</div></div>
        <button class="opts-action-btn danger" onclick="mfaUiWebauthnRemove('${c.id}')">Remove</button>
      </div>`).join('');
  }
}

function mfaUiTotpBegin() {
  if (typeof mfaTotpBeginEnroll !== 'function') { mm_toast('MFA module not loaded', 'error'); return; }
  const { secretB32, uri } = mfaTotpBeginEnroll();
  document.getElementById('mfa-totp-secret').textContent = secretB32.match(/.{1,4}/g).join(' ');
  document.getElementById('mfa-totp-confirm-code').value = '';
  document.getElementById('mfa-totp-confirm-error').textContent = '';
  document.getElementById('mfa-totp-enroll-box').style.display = '';

  const qrBox = document.getElementById('mfa-totp-qr');
  if (qrBox) {
    qrBox.innerHTML = '';
    if (typeof qrcode === 'function') {
      const qr = qrcode(0, 'M');
      qr.addData(uri);
      qr.make();
      // Themed SVG rather than the library's own black/white output, so
      // it sits inside the app's palette rather than fighting it.
      const n = qr.getModuleCount();
      const cell = 150 / n;
      let cells = '';
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (qr.isDark(r, c)) cells += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="var(--bright)"/>`;
        }
      }
      qrBox.innerHTML = `<svg viewBox="0 0 150 150" width="150" height="150" style="background:var(--deep);padding:6px">${cells}</svg>`;
    } else {
      qrBox.innerHTML = '<div class="opts-hint">QR unavailable — enter the key manually.</div>';
    }
  }
  setTimeout(() => document.getElementById('mfa-totp-confirm-code')?.focus(), 50);
}

async function mfaUiTotpConfirm() {
  const code = document.getElementById('mfa-totp-confirm-code')?.value;
  const errEl = document.getElementById('mfa-totp-confirm-error');
  if (errEl) errEl.textContent = '';
  const r = await mfaTotpConfirmEnroll(code);
  if (!r.ok) { if (errEl) errEl.textContent = r.error; return; }
  await vaultSave(false);
  document.getElementById('mfa-totp-enroll-box').style.display = 'none';
  mfaUiRefresh();
  mm_toast('Authenticator app enabled', 'success', { dur: 3000 });
}

function mfaUiTotpCancel() {
  if (typeof mfaTotpCancelEnroll === 'function') mfaTotpCancelEnroll();
  document.getElementById('mfa-totp-enroll-box').style.display = 'none';
}

async function mfaUiTotpDisable() {
  const ok = await mmConfirm(
    'Disable authenticator app verification?\n\n' +
    'Your account will only be as secure as your password (and any security keys or backup codes still set up) until you set this up again.'
  );
  if (!ok) return;
  await mfaTotpDisable();
  await vaultSave(false);
  mfaUiRefresh();
  mm_toast('Authenticator app disabled', 'warn');
}

async function mfaUiWebauthnAdd() {
  const cap = mfaWebauthnCapability();
  if (!cap.supported) { await mmConfirm(cap.reason + '\n\nThis is informational — there is nothing to confirm.'); return; }
  const label = await mmPrompt('Name this security key (e.g. "YubiKey — desk drawer")', 'Security key');
  if (label == null) return;
  const r = await mfaWebauthnRegister(label);
  if (!r.ok) { mm_toast('Could not register the key: ' + r.error, 'error', { dur: 5000 }); return; }
  await vaultSave(false);
  mfaUiRefresh();
  mm_toast('Security key added', 'success');
}

async function mfaUiWebauthnRemove(credentialId) {
  const ok = await mmConfirm('Remove this security key? You can re-register it later if needed.');
  if (!ok) return;
  await mfaWebauthnRemove(credentialId);
  await vaultSave(false);
  mfaUiRefresh();
}

async function optsToggleE2E(el) {
  const meta = _authLoadMeta();
  if (!meta) { toast('No vault found — complete setup first'); return; }
  const isOn = el.classList.contains('on');
  if (isOn) {
    // Turning encryption OFF used to flip a localStorage flag and toast
    // "restart to apply" — while the vault on disk stayed encrypted and the
    // session key stayed live. Nothing was applied, at restart or ever.
    // Rather than implement a real downgrade, this refuses: writing an
    // unencrypted copy of the vault is the one thing the whole design exists
    // to prevent, and a toggle is far too quiet a way to do it.
    await mmConfirm(
      'Encryption cannot be switched off on an existing vault.\n\n' +
      'Doing so would write every node to disk in the clear. If you truly want an ' +
      'unencrypted vault, export your data and run first-time setup again, where the ' +
      'choice is explicit and recorded.'
    );
    el.classList.add('on');
    return;
  }
  // Turning encryption ON for a vault created without it is a full re-seal:
  // new salt, new key, a keypair this vault never had, rewrite the file,
  // verify it reopens. Previously this just toasted "use Change Password" —
  // but optsChangePassword() explicitly refuses to run on a plain vault
  // ("there is no password to change"), so that instruction led nowhere.
  await optsEncryptVaultInPlace();
}

async function optsEncryptVaultInPlace() {
  if (!window.NXAPI) { toast('Desktop app required'); return; }
  if (VAULT.readOnly) { toast('Session is read-only — resolve the integrity warning first'); return; }

  const dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
  const vaultPath = NX_CONFIG.vaultPath || (dataDir ? dataDir + '/mastermind.vault' : null);
  if (!vaultPath) { toast('No vault path — cannot encrypt'); return; }

  const raw = await window.NXAPI.vaultRead(vaultPath);
  if (!raw) { toast('Vault file not found'); return; }
  const parsed = VaultEnvelope.parse(raw);
  if (!parsed.ok) { mm_toast('⚡ Cannot encrypt: ' + parsed.message, 'error', { dur: 7000 }); return; }
  if (!parsed.plain) { toast('This vault is already encrypted'); return; }

  const state = parsed.envelope; // a plain vault's "envelope" IS its state — no key, no decrypt step

  const newPw = await mmPrompt('Choose a password to encrypt this vault:');
  if (!newPw || newPw.length < 8) { toast('Password too short (min 8 characters)'); return; }
  const confirmPw = await mmPrompt('Confirm password:');
  if (confirmPw !== newPw) { toast('Passwords do not match'); return; }

  const proceed = await mmConfirm(
    'Encrypt this vault with AES-256-GCM?\n\n' +
    'You will need this password every time MASTERMIND opens from now on. ' +
    'There is no recovery if you lose it — write it down somewhere safe.'
  );
  if (!proceed) return;

  const rollbackEncrypted = AUTH.encrypted;
  mm_toast('Encrypting vault…', 'vault');
  try {
    // ── 1. Mint real encryption parameters ─────────────────────────
    const newSalt  = VaultCrypto.randomSaltB64(VaultEnvelope.SALT_BYTES);
    const newIters = vaultGetIterations();
    const newKey   = await VaultCrypto.deriveKey(newPw, newSalt, newIters, 32);

    // ── 2. This vault never had a keypair (plain vaults are created with
    // keys: { pubKey: null, encPrivKey: null } — there was no key to wrap
    // a private key with). Generate one now, the same self-heal pattern
    // used at login for a vault missing its keypair.
    let keys = state.keys;
    if (!keys?.pubKey) {
      const kp = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
        true, ['encrypt', 'decrypt']
      );
      const pubRaw  = await crypto.subtle.exportKey('spki', kp.publicKey);
      const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      keys = {
        pubKey: VaultCrypto.toBase64(new Uint8Array(pubRaw)),
        encPrivKey: await _aesEncrypt(newKey, new Uint8Array(privRaw)),
      };
    }

    state.identity = Object.assign({}, state.identity, { noEncryption: false });
    state.keys = keys;

    // ── 3. Hydrate live state from what was actually on disk, THEN swap
    // the session key — vaultSave() below writes whatever is in memory,
    // so memory has to be the real content before that write happens.
    vaultDeserialize(state);
    _AUTH_STORE.meta = state.identity;
    _AUTH_STORE.keys = keys;
    _setSessionKey(newKey, newSalt, newIters);
    AUTH.encrypted = true;

    // ── 4. Write, and require the write to land ────────────────────
    VAULT.dirty = true;
    await vaultSave(false);
    if (VAULT.dirty) throw new Error('vault save did not land — vault NOT encrypted');

    // ── 5. Prove the password opens the file before claiming success ─
    const verifyRaw = await window.NXAPI.vaultRead(vaultPath);
    const vp = VaultEnvelope.parse(verifyRaw);
    if (!vp.ok || vp.legacy || vp.plain) throw new Error('post-write verification failed: not an encrypted v6 vault');
    const vKey = await VaultCrypto.deriveKey(newPw, vp.envelope.kdf.salt, vp.envelope.kdf.iterations, 32);
    await VaultCrypto.decrypt(vKey, VaultCrypto.fromBase64(vp.envelope.data), vp.envelope.iv, VaultEnvelope.aadBytes(vp.envelope));

    if (typeof _persistIdentityMarker === 'function') {
      _persistIdentityMarker({ username: state.identity.username, noEncryption: false });
    }
    await window.NXAPI.ledgerAppend?.(dataDir, 'vault.encrypted', { vaultId: VAULT.vaultId });
    mm_toast('✓ Vault encrypted — you\u2019ll be asked for this password from now on', 'success', { dur: 7000 });
    if (typeof syncOptsToggles === 'function') syncOptsToggles();
  } catch (e) {
    // The file on disk is either still the plain original (nothing
    // written) or the new encrypted one (verified) — never a half state,
    // because the write is atomic and verification happens after it.
    AUTH.encrypted = rollbackEncrypted;
    MMLog?.error('vault', 'Encrypt-in-place failed: ' + e.message);
    mm_toast('⚡ Vault NOT encrypted: ' + e.message, 'error', { dur: 8000 });
  }
}

async function optsChangePassword() {
  // ── v6 rewrite ───────────────────────────────────────────────────────
  // The previous version derived the old key from a localStorage salt,
  // verified it against a localStorage key blob, minted a new salt, wrote
  // BOTH to localStorage, set AUTH.key = newKey — and never touched the
  // vault file. Result: the file on disk was still encrypted under the old
  // key while the session held the new one, and AUTH.kdf still described the
  // old salt. The next save would have sealed the vault with a key its own
  // header could not re-derive. Unopenable, permanently, with the correct
  // password. This is now the single most dangerous operation in the app, so
  // it is written to fail safe at every step.
  if (!window.NXAPI) { toast('Desktop app required'); return; }
  if (VAULT.readOnly) { toast('Session is read-only — resolve the integrity warning first'); return; }

  const current = await mmPrompt('Current password:'); if (!current) return;
  const newPw   = await mmPrompt('New password (min 8 chars):'); if (!newPw || newPw.length < 8) { toast('Password too short'); return; }
  const confirm_ = await mmPrompt('Confirm new password:'); if (confirm_ !== newPw) { toast('Passwords do not match'); return; }
  if (newPw === current) { toast('New password is the same as the current one'); return; }

  const dataDir   = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
  const vaultPath = NX_CONFIG.vaultPath || (dataDir ? dataDir + '/mastermind.vault' : null);
  if (!vaultPath) { toast('No vault path — cannot change password'); return; }

  // Everything needed to put the session back exactly as it was.
  const rollback = { key: AUTH.key, kdf: AUTH.kdf ? { ...AUTH.kdf } : null, saveCount: VAULT.saveCount };

  mm_toast('Re-encrypting vault…', 'vault');
  try {
    // ── 1. Read the vault as it actually is on disk ───────────────────
    const raw = await window.NXAPI.vaultRead(vaultPath);
    if (!raw) throw new Error('vault file not found at ' + vaultPath);
    const parsed = VaultEnvelope.parse(raw);
    if (!parsed.ok) throw new Error(parsed.message);
    if (parsed.plain) {
      // There is no password to change. Falling through would reach
      // env.kdf.salt on an envelope that has no kdf and fail as an opaque
      // TypeError, which reads like a bug in the password change rather than
      // the plain statement it should be.
      throw new Error('This vault is unencrypted — there is no password to change. ' +
        'Turn encryption on first.');
    }

    // ── 2. Prove the current password against the FILE, not a side store
    let state, oldSalt, oldIters;
    if (parsed.legacy) {
      const meta = _authLoadMeta();
      if (!meta?.salt) throw new Error('v5 vault with no salt on this machine — unlock it here once first');
      oldSalt = meta.salt; oldIters = 310000;
      const legacy = VaultEnvelope.readLegacyV5(parsed.envelope);
      const oldKey = await VaultCrypto.deriveKey(current, oldSalt, oldIters, 32);
      state = legacy.encrypted === false
        ? legacy.plainState
        : JSON.parse(VaultCrypto.utf8Decode(
            await VaultCrypto.decrypt(oldKey, VaultCrypto.fromBase64(legacy.data), legacy.iv, null)));
      _pwOldKey = oldKey;
    } else {
      const env = parsed.envelope;
      oldSalt = env.kdf.salt; oldIters = env.kdf.iterations;
      const oldKey = await VaultCrypto.deriveKey(current, oldSalt, oldIters, env.kdf.keyLen);
      state = JSON.parse(VaultCrypto.utf8Decode(await VaultCrypto.decrypt(
        oldKey, VaultCrypto.fromBase64(env.data), env.iv, VaultEnvelope.aadBytes(env))));
      _pwOldKey = oldKey;
      VAULT.vaultId   = env.vaultId;
      VAULT.saveCount = env.saveCount;
    }

    // ── 3. Mint new parameters and rewrap the RSA private key ─────────
    const newSalt  = VaultCrypto.randomSaltB64(VaultEnvelope.SALT_BYTES);
    const newIters = vaultGetIterations();
    const newKey   = await VaultCrypto.deriveKey(newPw, newSalt, newIters, 32);

    if (state?.keys?.encPrivKey) {
      const privRaw = await _aesDecrypt(_pwOldKey, state.keys.encPrivKey);
      state.keys.encPrivKey = await _aesEncrypt(newKey, new Uint8Array(privRaw));
    }

    // ── 4. Swap the session key and its parameters together ───────────
    _setSessionKey(newKey, newSalt, newIters);
    if (state) { _AUTH_STORE.meta = state.identity || _AUTH_STORE.meta; _AUTH_STORE.keys = state.keys || _AUTH_STORE.keys; }

    // ── 5. Write, and require the write to land ───────────────────────
    VAULT.dirty = true;
    await vaultSave(false);
    if (VAULT.dirty) throw new Error('vault save did not land — password NOT changed');

    // ── 6. Prove the new password opens the file before claiming success
    const verifyRaw = await window.NXAPI.vaultRead(vaultPath);
    const vp = VaultEnvelope.parse(verifyRaw);
    if (!vp.ok || vp.legacy || vp.plain) throw new Error('post-write verification failed: not an encrypted v6 vault');
    const vKey = await VaultCrypto.deriveKey(newPw, vp.envelope.kdf.salt, vp.envelope.kdf.iterations, 32);
    await VaultCrypto.decrypt(vKey, VaultCrypto.fromBase64(vp.envelope.data),
      vp.envelope.iv, VaultEnvelope.aadBytes(vp.envelope));

    await window.NXAPI.ledgerAppend?.(dataDir, 'vault.kdf.upgraded', {
      vaultId: VAULT.vaultId, from: oldIters, to: newIters, reason: 'password-change',
    });

    _pwOldKey = null;
    if (typeof T !== 'undefined') T.passwordChanged(); else mm_toast('Password updated · vault re-encrypted', 'success');
  } catch(e) {
    // Put the session back. The file on disk is either the old vault
    // (nothing written) or the new one (verified) — never a half state,
    // because the write is atomic and verification happens after it.
    if (rollback.kdf) _setSessionKey(rollback.key, rollback.kdf.salt, rollback.kdf.iterations);
    VAULT.saveCount = rollback.saveCount;
    _pwOldKey = null;
    MMLog?.error('auth', 'Password change failed: ' + e.message);
    mm_toast('⚡ Password NOT changed: ' + e.message, 'error', { dur: 8000 });
  }
}

let _pwOldKey = null;

async function optsChangePin() {
  const pin = await mmPrompt('New PIN (4–8 digits):'); if (!pin) return;
  if (!/^\d{4,8}$/.test(pin)) { toast('PIN must be 4–8 digits'); return; }
  const meta = _authLoadMeta(); if (!meta) return;
  const pinBuf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + meta.username));
  const pinHash = VaultCrypto.toBase64(new Uint8Array(pinBuf));
  // Into the vault, not localStorage. A PIN hash sitting in browser storage
  // is both a credential outside the vault and one an attacker can brute
  // force offline against a 4-digit space.
  _AUTH_STORE.meta = Object.assign({}, meta, { pinHash });
  AUTH.hasPin = true; AUTH.pinHash = pinHash;
  VAULT.dirty = true;
  await vaultSave(false);
  if (VAULT.dirty) { mm_toast('⚡ PIN not saved — the vault write did not land', 'error'); return; }
  if (typeof T !== 'undefined') T.pinChanged(); else toast('PIN updated');
  optsRefreshSecurity();
}

async function optsRemovePin() {
  if (!(await mmConfirm('Remove PIN? You will only be able to use password to unlock.'))) return;
  const meta = _authLoadMeta(); if (!meta) return;
  const newMeta = Object.assign({}, meta); delete newMeta.pinHash;
  _AUTH_STORE.meta = newMeta;
  AUTH.hasPin = false; AUTH.pinHash = null;
  VAULT.dirty = true;
  await vaultSave(false);
  if (VAULT.dirty) { mm_toast('⚡ PIN not removed — the vault write did not land', 'error'); return; }
  if (typeof T!=='undefined') T.pinChanged(); else mm_toast('PIN removed','info');
  optsRefreshSecurity();
}

/* ── Backup codes ─────────────────────────────────────────── */
async function optsGenerateBackupCodes() {
  if (typeof mfaBackupCodesGenerate !== 'function') { mm_toast('MFA module not loaded', 'error'); return; }
  const ok = await mmConfirm(
    'Generate new backup codes?\n\n' +
    'Any codes you generated before this will stop working. Store the new ones somewhere offline — this is the only time they are shown.'
  );
  if (!ok) return;

  _backupCodes = await mfaBackupCodesGenerate(); // MFA_STATE now holds only the hashes; this is the one-time plaintext
  await vaultSave(false);
  if (VAULT.dirty) {
    mm_toast('⚡ Backup codes NOT saved — the vault write did not land. These codes will not work.', 'error', { dur: 9000 });
    return;
  }

  const codeHtml = _backupCodes.map((c, i) =>
    '<div style="display:flex;gap:16px;align-items:center">' +
    '<span style="color:var(--dim);font-size:7px">' + String(i + 1).padStart(2, '0') + '</span>' +
    '<span style="letter-spacing:3px">' + c + '</span>' +
    '</div>'
  ).join('');
  ['opts-backup-codes-display', 'opts-backup-codes-2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.style.display = ''; el.innerHTML = codeHtml; }
  });
  ['opts-backup-status', 'opts-backup-status-2'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.textContent = '10 backup codes generated — export or copy them now. These will not be shown again.';
  });
  mm_toast('10 backup codes generated — store them offline now', 'warn', { dur: 5000 });
}

function optsExportBackupCodes() {
  if (!_backupCodes.length) { mm_toast('Generate codes first', 'warn'); return; }
  const meta = _authLoadMeta();
  const text = '=== MASTERMIND BACKUP RECOVERY CODES ===\n' +
    'Identity: ' + (meta?.username || '—') + '\n' +
    'Generated: ' + new Date().toLocaleString() + '\n' +
    'Store offline. Each code is one-time use.\n\n' +
    _backupCodes.map((c, i) => (i + 1) + '. ' + c).join('\n') +
    '\n\n=== KEEP THIS FILE SECURE ===';
  _downloadText('nexus-backup-codes.txt', text);
  mm_toast('Backup codes exported', 'export');
}

/* ── Keys tab ─────────────────────────────────────────────── */
async function optsRefreshKeys() {
  const meta = _authLoadMeta();
  const keyInfo = document.getElementById('opts-keys-info');
  if (keyInfo && meta) keyInfo.innerHTML =
    'Identity: <span style="color:var(--c)">' + escH(meta.username||'—') + '</span><br>' +
    'Encryption: <span style="color:' + (meta.noEncryption ? 'var(--dim)' : 'var(--g)') + '">' +
    (meta.noEncryption ? 'None (unencrypted)' : 'AES-256-GCM') + '</span><br>' +
    'Key algorithm: <span style="color:var(--c)">RSA-OAEP 2048-bit</span><br>' +
    'Created: <span style="color:var(--mid)">' + (meta.created ? new Date(meta.created).toLocaleString() : '—') + '</span>';
  optsRefreshFingerprint();
  // Refresh backup codes display
  const bcEntries = (typeof MFA_STATE !== 'undefined' && MFA_STATE.backupCodes.entries) || [];
  if (bcEntries.length) {
    const el = document.getElementById('opts-backup-codes-2');
    const statusEl = document.getElementById('opts-backup-status-2');
    if (el) {
      const used = bcEntries.filter(c => c.used).length;
      el.innerHTML = bcEntries.map((c, i) =>
        '<div style="' + (c.used ? 'text-decoration:line-through;color:var(--dim)' : '') + ';font-size:8.5px">' +
        String(i+1).padStart(2,'0') + '.  ' + '●●●●●-●●●●●' + (c.used ? '  <span style="color:var(--r);font-size:7px">USED</span>' : '') + '</div>'
      ).join('');
      if (statusEl) statusEl.textContent = used + ' of ' + bcEntries.length + ' codes used.';
    }
  } else {
    const el = document.getElementById('opts-backup-codes-2');
    if (el) el.innerHTML = '<div style="color:var(--dim);font-size:8px">No backup codes generated yet.</div>';
  }
}

async function optsRefreshFingerprint() {
  try {
    const vault = JSON.parse(localStorage.getItem(AUTH_VAULT_KEY)||'{}');
    const el = document.getElementById('opts-key-fingerprint');
    if (!el) return;
    if (!vault.pubKey) { el.textContent = 'No key pair found'; return; }
    const raw = Uint8Array.from(atob(vault.pubKey), c => c.charCodeAt(0));
    const hash = await crypto.subtle.digest('SHA-256', raw);
    const hex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    el.textContent = hex.match(/.{4}/g).join(':').slice(0,47) + '…';
  } catch(e) {
    const el = document.getElementById('opts-key-fingerprint');
    if (el) el.textContent = 'Unable to compute fingerprint';
  }
}

async function optsCopyPublicKey() {
  try {
    const vault = JSON.parse(localStorage.getItem(AUTH_VAULT_KEY)||'{}');
    if (!vault.pubKey) { toast('No public key found'); return; }
    const pem = '-----BEGIN PUBLIC KEY-----\n' + vault.pubKey.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
    await navigator.clipboard.writeText(pem);
    if (typeof T!=='undefined') T.copied('Public key'); else mm_toast('Public key copied','success');
  } catch(e) { toast('Copy failed: ' + e.message); }
}

function optsShowPubkeyPreview() {
  try {
    const vault = JSON.parse(localStorage.getItem(AUTH_VAULT_KEY)||'{}');
    const el = document.getElementById('opts-pubkey-preview');
    if (!el) return;
    if (!vault.pubKey) { toast('No public key found'); return; }
    const pem = '-----BEGIN PUBLIC KEY-----\n' + vault.pubKey.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
    el.style.display = el.style.display === 'none' ? '' : 'none';
    el.textContent = pem;
  } catch(e) { toast('Error: ' + e.message); }
}

/* ── Storage info ─────────────────────────────────────────── */
// §2.3 all state must be observable · §1.2 nothing pretends to work.
// The old panel reported localStorage keys as though they were the vault.
// After v6 those keys are gone, so it would have shown "Canvas data: 0 B"
// forever next to a working vault — a panel that lies is worse than no
// panel. This reads the live diagnostic engine (§12.6) instead.
async function refreshStorageInfo() {
  const el = document.getElementById('opts-storage-info'); if (!el) return;
  el.innerHTML = '<div style="color:var(--dim)">Reading vault…</div>';
  try {
    const h = await vaultHealth();
    const fmt = b => b == null ? '—' : b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(2) + ' MB';
    const dot = ok => ok ? '<span style="color:var(--g)">\u25CF</span>' : '<span style="color:var(--r)">\u25CF</span>';
    const statusColor = h.status === 'healthy' ? 'var(--g)' : h.status === 'degraded' ? 'var(--o)' : 'var(--r)';

    const failed = h.checks.filter(c => !c.pass);
    const orphans = vaultScanOrphans();

    el.innerHTML =
      '<div>Vault health: <span style="color:' + statusColor + '">' + h.status.toUpperCase() + ' \u00B7 ' + h.score + '%</span></div>' +
      '<div>Vault file: <span style="color:var(--mid)">' + fmt(h.vault.bytes) + '</span></div>' +
      '<div>Saves: <span style="color:var(--c)">#' + (h.vault.saveCount || 0) + '</span>' +
        (h.vault.savedAt ? ' &nbsp; <span style="color:var(--dim)">' + escH(h.vault.savedAt) + '</span>' : '') + '</div>' +
      '<div>KDF: <span style="color:var(--mid)">' + (h.vault.iterations ? h.vault.iterations.toLocaleString() : '—') + ' iterations</span></div>' +
      '<div>Audit ledger: <span style="color:var(--v)">' + h.ledger.seq + ' entries</span> ' +
        dot(h.ledger.chainOk) + ' <span style="color:var(--dim)">' + (h.ledger.chainOk ? 'chain verified' : 'CHAIN BROKEN') + '</span></div>' +
      '<div>Failed unlocks recorded: <span style="color:var(--mid)">' + (h.ledger.unlockFailures != null ? h.ledger.unlockFailures : '—') + '</span></div>' +
      '<div>Nodes: <span style="color:var(--c)">' + CANVAS.NX.nodes.length + '</span> &nbsp; Connections: <span style="color:var(--c)">' + CANVAS.NX.conns.length + '</span></div>' +
      '<div>UUID ledger: <span style="color:var(--v)">' +
        ((typeof JAA !== 'undefined' && JAA.ledger instanceof Map) ? JAA.ledger.size : 0) + ' entries</span></div>' +
      (failed.length
        ? '<div style="margin-top:8px;color:var(--o)">' + failed.map(c =>
            '\u26A0 ' + escH(c.name) + (c.msg ? ': ' + escH(c.msg) : '')).join('<br>') + '</div>'
        : '') +
      (orphans.length
        ? '<div style="margin-top:8px;color:var(--o)">' + orphans.length +
          ' item(s) from an older build are still stored outside the vault' +
          ' (' + fmt(orphans.reduce((n,o) => n + o.bytes, 0)) + ').<br>' +
          '<button onclick="vaultHarvestOrphans().then(refreshStorageInfo)" style="margin-top:6px;padding:6px 12px;' +
          'border:1px solid var(--o);background:transparent;color:var(--o);cursor:pointer;' +
          'font-family:var(--f-mono);font-size:8px;letter-spacing:1px">\u2913 HARVEST INTO VAULT</button></div>'
        : '');
  } catch(e) {
    el.textContent = 'Error reading vault: ' + e.message;
  }
}

function exportFullVault() {
  const vault = {
    canvas: JSON.parse(localStorage.getItem('nexus_mm_v3')||'null'),
    void: JSON.parse(localStorage.getItem('nexus_void_state')||'null'),
    gaps: JSON.parse(localStorage.getItem('nexus_gap_state')||'null'),
    options: JSON.parse(localStorage.getItem(OPTS_KEY)||'null'),
    features: JSON.parse(localStorage.getItem('nexus_features')||'null'),
    exported: new Date().toISOString(),
  };
  _downloadText('mastermind-vault-' + Date.now() + '.json', JSON.stringify(vault, null, 2));
  if (typeof T !== 'undefined') T.backupDownloaded(); else toast('Full vault exported');
}

async function optsResetAllSettings() {
  if (!(await mmConfirm('Reset all settings to defaults? This does not affect your vault or canvas data.'))) return;
  localStorage.removeItem(OPTS_KEY);
  if (typeof T !== 'undefined') mm_toast('Settings reset · Reload to apply', 'warn'); else toast('Settings reset — reload to apply');
}

async function optsWipeVault() {
  const conf = await mmPrompt('Type DELETE to wipe all vault data, identity, and canvas. This cannot be undone.');
  if (conf !== 'DELETE') { mm_toast('Wipe cancelled', 'info'); return; }

  // Delete the vault FILE from disk first
  if (window.NXAPI && NX_CONFIG.vaultPath) {
    try {
      const deleted = await window.NXAPI.vaultDelete(NX_CONFIG.vaultPath);
      MMLog?.info('vault', 'Vault file deleted: ' + NX_CONFIG.vaultPath + ' → ' + deleted);
    } catch(e) {
      MMLog?.error('vault', 'Vault file delete error: ' + e.message);
    }
  }

  // Clear all localStorage session data. Reuses _ORPHAN_KEYS
  // (mastermind-vault.js) for the retired module-state keys rather than
  // hand-maintaining a second list here — this exact list drifted stale
  // once already (missing every key retired by the localStorage audit:
  // body/horizon/domain/mirror/relational/almState/systems/memory), and
  // a second copy is how that keeps happening.
  [
    'nexus_mm_v3', 'nexus_void_state', 'nexus_gap_state', 'nexus_auth_meta',
    'nexus_auth_vault', 'nexus_features', 'nexus_brain_map_v2', 'nexus_horizon_state',
    OPTS_KEY, 'nexus_theme', 'nexus_ai_config', 'nexus_datadir',
    'mm_brain_map_v2', 'mm_horizon_state',
    ...(typeof _ORPHAN_KEYS !== 'undefined' ? _ORPHAN_KEYS : []),
  ].forEach(k => {
    try { localStorage.removeItem(k); } catch(e) {}
  });

  NX_CONFIG.vaultPath = null;
  NX_CONFIG.dataDir   = null;

  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.wiped', {});
  MMLog?.warn('vault', 'Vault wiped by user');

  mm_toast('Vault wiped — reloading in 2s…', 'warn');
  setTimeout(() => location.reload(), 2000);
}

// Regular delete only removes the directory entry — the file's actual
// bytes typically stay on disk, readable, until something else happens
// to overwrite those exact blocks. This is for when that's not enough:
// overwrites the vault file (and every .backup.*.json snapshot next to
// it — leaving those would defeat the whole point) with random data,
// then zeros, then deletes it. Requires Electron (main-process fs
// access); does nothing useful in browser mode.
async function optsSecureWipeVault() {
  if (!window.NXAPI?.vaultSecureWipe) { mm_toast('Secure wipe needs the Electron app', 'warn'); return; }
  if (!NX_CONFIG.vaultPath) { mm_toast('No vault file to wipe', 'warn'); return; }

  const warned = await mmConfirm(
    'SECURE WIPE overwrites the vault file (and any backups) with random data, then zeros, then deletes it. ' +
    'This is much stronger than the regular Wipe Vault above and cannot be undone.\n\n' +
    'Honest limit: on an SSD this is not a physical guarantee — wear-leveling can leave old data in ' +
    'remapped cells the overwrite never touches. The vault is already AES-256-GCM encrypted; as long as ' +
    'your password is never recoverable, that encryption is the real protection. This is defense in depth ' +
    'on top of it, not a replacement for it.\n\nContinue?'
  );
  if (!warned) { mm_toast('Secure wipe cancelled', 'info'); return; }

  const conf = await mmPrompt('Type DESTROY to permanently and unrecoverably overwrite and delete the vault.');
  if (conf !== 'DESTROY') { mm_toast('Secure wipe cancelled', 'info'); return; }

  mm_toast('Overwriting and deleting — do not close Mastermind…', 'warn', { dur: 8000 });
  let result;
  try {
    result = await window.NXAPI.vaultSecureWipe(NX_CONFIG.vaultPath);
  } catch (e) {
    mm_toast('Secure wipe failed: ' + e.message, 'error', { dur: 8000 });
    MMLog?.error('vault', 'Secure wipe threw: ' + e.message);
    return;
  }
  if (!result || !result.ok) {
    mm_toast('Secure wipe incomplete: ' + ((result && result.failed && result.failed.map(f => f.file).join(', ')) || 'unknown error') + ' — nothing else was touched', 'error', { dur: 8000 });
    MMLog?.error('vault', 'Secure wipe incomplete: ' + JSON.stringify(result));
    return;
  }

  ['nexus_mm_v3','nexus_void_state','nexus_gap_state','nexus_auth_meta',
   'nexus_auth_vault','nexus_features','nexus_brain_map_v2','nexus_horizon_state',
   OPTS_KEY,'nexus_theme','nexus_ai_config','nexus_datadir',
   'mm_brain_map_v2','mm_horizon_state'].forEach(k => {
    try { localStorage.removeItem(k); } catch(e) {}
  });
  NX_CONFIG.vaultPath = null;
  NX_CONFIG.dataDir   = null;

  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.securely-wiped', { wiped: result.wiped });
  MMLog?.warn('vault', 'Vault SECURELY wiped by user: ' + result.wiped.join(', '));

  mm_toast('✓ Securely wiped ' + result.wiped.length + ' file(s) — reloading in 2s…', 'warn', { dur: 3000 });
  setTimeout(() => location.reload(), 2000);
}

function optsOpenDocs() {
  if (!window.NXAPI?.openDocs) { mm_toast('Needs the Electron app', 'warn'); return; }
  window.NXAPI.openDocs().then((r) => {
    if (!r || !r.ok) mm_toast('Could not open documentation: ' + ((r && r.error) || 'not found'), 'error');
  });
}

function optsCheckForUpdates() {
  gateFeature('update', () => {
    mm_toast('Check https://github.com/mastermind for latest release', 'info', { dur: 6000 });
  });
}



// ── Apply saved UI scale immediately on boot/login ───────────────
// optsSetFontScale() sets --ui-scale but only runs when user moves the slider.
// On startup we need to manually apply the saved value.
function _nearestScalePreset(pct) {
  const presets = [60, 80, 100, 125, 150, 175, 200];
  return presets.reduce((best, p) => Math.abs(p - pct) < Math.abs(best - pct) ? p : best, presets[0]);
}

function _applyScaleOnBoot() {
  try {
    loadOpts();
    // font_scale and ui_scale each default to 100 if absent/corrupted —
    // _mmApplyScale() itself clamps and snaps to presets, same guard
    // against a stray/corrupted saved value as before.
    if (!OPTS.font_scale) OPTS.font_scale = 100;
    if (!OPTS.ui_scale) OPTS.ui_scale = 100;
    _mmApplyScale();
  } catch(e) {
    MMLog?.error('ui', 'Scale apply failed, forcing 100%: ' + e.message);
    // Don't leave the CSS fallback in charge silently — force a known-good
    // value so a thrown error here can't strand the UI at whatever the
    // stylesheet default happens to be.
    try {
      document.documentElement.style.setProperty('--ui-scale', 1);
      document.body.style.zoom = 1;
      const optsOverlay = document.getElementById('opts-overlay');
      if (optsOverlay) { optsOverlay.style.setProperty('--ui-scale', 1); optsOverlay.style.zoom = '1'; }
    } catch(e2) {}
  }
}

function syncOptsToggles() {
  const pairs = [
    ['opt-compact','compact'],['opt-opts-density','opts_density'],['opt-badges','badges'],['opt-depth','depth'],
    ['opt-typecolor','typecolor'],['opt-scanlines','scanlines'],['opt-ambient','ambient'],
    ['opt-particles','particles'],['opt-grid','grid'],['opt-clusters','clusters'],
    ['opt-animated','animated'],['opt-snap','snap'],['opt-inertia','inertia'],
    ['opt-dblspawn','dblspawn'],['opt-rcpan','rcpan'],['opt-connlabels','connlabels'],
    ['opt-autosave','autosave'],['opt-brain-physics','brain_physics'],
    ['opt-brain-halos','brain_halos'],['opt-brain-labels','brain_labels'],
    ['opt-brain-particles','brain_particles'],['opt-brain-pulse','brain_pulse'],
    ['opt-brain-dblclick','brain_dblclick'],['opt-gap-auto','gap_auto'],
    ['opt-gap-autoexport','gap_autoexport'],['opt-somatic','somatic'],
    ['opt-hostile-autoexport','hostile_autoexport'],['opt-osc-remind','osc_remind'],
    ['opt-pw-required','pw_required'],['opt-pin-enabled','pin_enabled'],
    ['opt-autolock','autolock'],['opt-clear-clip','clear_clip'],
  ];
  pairs.forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('on', !!OPTS[key]);
  });
  const gp = document.getElementById('opt-guardian-port');
  if (gp) gp.value = AI.guardianPort || 7823;
  const gt = document.getElementById('opt-guardian-token');
  if (gt) gt.value = AI.guardianToken || '';
  // Homepage module toggles read from AUTH.features, not OPTS
  ['brain', 'void', 'horizon', 'alm'].forEach(name => {
    const el = document.getElementById('opt-modfeat-' + name);
    if (el) el.classList.toggle('on', AUTH.features[name] !== false);
  });
  // Sliders
  const sliders = [
    ['opt-font-scale','opt-font-scale-val','font_scale','%'],
    ['opt-ui-scale','opt-ui-scale-val','ui_scale','%'],
    ['opt-autosave-interval','opt-autosave-interval-val','autosave_interval','s'],
    ['opt-undo-depth','opt-undo-depth-val','undo_depth',''],
    ['opt-brain-repulsion','opt-brain-repulsion-val','brain_repulsion',''],
    ['opt-signal-threshold','opt-signal-threshold-val','signal_threshold',''],
    ['opt-osc-interval','opt-osc-interval-val','osc_interval','m'],
  ];
  sliders.forEach(([inputId, valId, key, suffix]) => {
    const inp = document.getElementById(inputId);
    const val = document.getElementById(valId);
    if (inp) inp.value = OPTS[key];
    if (val) val.textContent = OPTS[key] + suffix;
  });
  // Brain view select
  const bv = document.getElementById('opt-brain-view');
  if (bv) bv.value = OPTS.brain_view || 'force';
  // Autolock row
  const alRow = document.getElementById('opt-autolock-minutes-row');
  if (alRow) alRow.style.display = OPTS.autolock ? '' : 'none';

  // Voice capture — reflects OPTS with the same defaults ui-capture.js's
  // _vlVadOpts() falls back to, so an untouched panel shows the numbers
  // actually in effect, not blank/zero.
  const vr = document.getElementById('opt-voice-recall');
  if (vr) vr.classList.toggle('on', typeof RECALL !== 'undefined' && RECALL.enabled);
  const vThresh = OPTS.voice_vad_threshold ?? (typeof RecallCore !== 'undefined' ? RecallCore.DEFAULT_RMS_THRESHOLD : 0.018);
  const vThreshEl = document.getElementById('opt-voice-threshold');
  const vThreshVal = document.getElementById('opt-voice-threshold-val');
  if (vThreshEl) vThreshEl.value = Math.round(vThresh * 1000);
  if (vThreshVal) vThreshVal.textContent = vThresh.toFixed(3);
  const vSilence = OPTS.voice_silence_hold_ms ?? (typeof RecallCore !== 'undefined' ? RecallCore.DEFAULT_SILENCE_HOLD_MS : 1200);
  const vSilenceEl = document.getElementById('opt-voice-silence');
  const vSilenceVal = document.getElementById('opt-voice-silence-val');
  if (vSilenceEl) vSilenceEl.value = vSilence;
  if (vSilenceVal) vSilenceVal.textContent = (vSilence / 1000).toFixed(1) + 's';
  const vPreroll = OPTS.voice_preroll_ms ?? 800;
  const vPrerollEl = document.getElementById('opt-voice-preroll');
  const vPrerollVal = document.getElementById('opt-voice-preroll-val');
  if (vPrerollEl) vPrerollEl.value = vPreroll;
  if (vPrerollVal) vPrerollVal.textContent = (vPreroll / 1000).toFixed(1) + 's';
  const vModel = document.getElementById('opt-voice-model');
  if (vModel) vModel.value = OPTS.voice_whisper_model || 'base';

  // ── Full Whisper CLI + pipeline surface ────────────────────────────
  const vLang = document.getElementById('opt-voice-language');
  if (vLang) vLang.value = OPTS.voice_whisper_language || 'auto';

  const vThreads = OPTS.voice_whisper_threads ?? 0;
  const vThreadsEl = document.getElementById('opt-voice-threads');
  const vThreadsVal = document.getElementById('opt-voice-threads-val');
  if (vThreadsEl) vThreadsEl.value = vThreads;
  if (vThreadsVal) vThreadsVal.textContent = vThreads === 0 ? 'auto' : String(vThreads);

  const vTimeout = (OPTS.voice_whisper_timeout_ms ?? 120000) / 1000;
  const vTimeoutEl = document.getElementById('opt-voice-timeout');
  const vTimeoutVal = document.getElementById('opt-voice-timeout-val');
  if (vTimeoutEl) vTimeoutEl.value = vTimeout;
  if (vTimeoutVal) vTimeoutVal.textContent = vTimeout + 's';

  const vMaxSeg = (OPTS.voice_max_segment_ms ?? 25000) / 1000;
  const vMaxSegEl = document.getElementById('opt-voice-maxsegment');
  const vMaxSegVal = document.getElementById('opt-voice-maxsegment-val');
  if (vMaxSegEl) vMaxSegEl.value = vMaxSeg;
  if (vMaxSegVal) vMaxSegVal.textContent = vMaxSeg + 's';

  const vPromptToggle = document.getElementById('opt-voice-promptseed');
  if (vPromptToggle) vPromptToggle.classList.toggle('on', OPTS.lexicon_prompt !== false);
  const vPromptCount = OPTS.voice_prompt_seed_count ?? 40;
  const vPromptCountEl = document.getElementById('opt-voice-promptcount');
  const vPromptCountVal = document.getElementById('opt-voice-promptcount-val');
  if (vPromptCountEl) vPromptCountEl.value = vPromptCount;
  if (vPromptCountVal) vPromptCountVal.textContent = String(vPromptCount);
}

// Load opts on engine boot
loadOpts();
// Options-panel density preference — applied here so it survives a
// restart instead of only taking effect after the toggle is clicked.
document.body.classList.toggle('mm-opts-compact', !!OPTS.opts_density);
console.log('MASTERMIND — Options engine loaded');

/* ═══════════════════════════════════════════════════════════════════
   MODULE: vault — Encrypted file persistence (KeePass/Obsidian-style)
   ID: module:vault
   
   Architecture:
   - Single .nxvault file = AES-256-GCM encrypted JSON blob
   - Atomic writes (temp → rename) = zero corruption on crash
   - 3 rotating backup files (.nxvault.bak1/2/3)
   - In-memory only when unlocked — never plaintext on disk
   - Export: encrypted (.nxvault copy) or decrypted (.json)
   - Decrypt permanently: write .json, remove .nxvault, reload unencrypted
   - Fallback: localStorage when Electron not available
═══════════════════════════════════════════════════════════════════ */

// VAULT state object — defined in mastermind-vault.js
// const VAULT = { ... } — loaded from vault module

// vaultSerialize, vaultDeserialize, vaultSave, vaultDirtySave, vaultLoad,
// vaultDecryptPermanently, vaultExport
// → implemented in mastermind-vault.js (loaded before this file)




/* ═══════════════════════════════════════════════════════════════════
   MODULE: import — Multi-format import
   ID: module:import
   Formats: Nexus JSON, Obsidian, Notion, Roam Research, LogSeq,
            XMind, Generic JSON, Generic Markdown
═══════════════════════════════════════════════════════════════════ */

const IMPORT = {
  id: 'module:import',
  formats: ['nexus','obsidian','notion','roam','logseq','xmind','json','markdown'],
};

function importDetectFormat(text, filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  // .vault is what export actually writes (v6 envelope). .nxvault was the
  // v5 name and has not been produced since v0.1.2 — accepted only so an
  // old file still opens, never advertised.
  if (ext === 'vault' || ext === 'nxvault') return 'nexus-vault';
  if (ext === 'md' || ext === 'markdown') {
    if (text.includes('[[') && text.includes(']]')) return 'obsidian';
    if (text.includes('- ') && text.match(/^#+\s/m)) return 'logseq';
    return 'markdown';
  }
  if (ext === 'json' || ext === 'jsonl') {
    try {
      const d = JSON.parse(text);
      if (d.format === 'mastermind-vault' || d.format === 'mastermind-export-plaintext') return 'nexus-vault';
      if (d.format === 'nexus-vault' || d.version >= 4 && d.canvas) return 'nexus';
      if (d['__version'] || d.roamAlphaAPI) return 'roam';
      if (Array.isArray(d) && d[0]?.title && d[0]?.children) return 'roam';
      if (d.results && d.results[0]?.object === 'page') return 'notion';
      if (d.nodes && d.conns) return 'nexus-canvas';
      return 'json';
    } catch { return 'json'; }
  }
  if (ext === 'xmind') return 'xmind';
  if (ext === 'csv') return 'notion'; // Notion exports CSV
  return 'json';
}

async function importFile(file) {
  const text = await file.text();
  const fmt = importDetectFormat(text, file.name);
  mm_toast(`Importing ${fmt}…`, 'loading');
  try {
    switch(fmt) {
      case 'nexus':
      case 'nexus-canvas': return importNexus(text);
      case 'nexus-vault':  return importNexusVault(text);
      case 'obsidian':     return importObsidian(text, file.name);
      case 'logseq':       return importLogseq(text, file.name);
      case 'roam':         return importRoam(text);
      case 'notion':       return importNotion(text);
      case 'markdown':     return importMarkdown(text, file.name);
      default:             return importGenericJSON(text);
    }
  } catch(e) {
    mm_toast('Import error: ' + e.message, 'error');
    console.error('Import failed:', e);
  }
}

function importNexus(text) {
  const d = JSON.parse(text);
  const canvas = d.canvas || d;
  CANVAS.clearCanvas();
  (canvas.nodes || []).forEach(n => CANVAS.spawnNode(n.type, n.x, n.y, n));
  (canvas.conns || []).forEach(c => CANVAS.NX.conns.push({ ...c, _phase: Math.random() }));
  T.canvasImported(CANVAS.NX.nodes.length);
  CANVAS.resetView();
}

async function importNexusVault(text) {
  // Handles BOTH envelope generations. The previous version only knew the
  // v5 shape — {encrypted, iv, data} — and called _aesDecrypt with no
  // additionalData. A v6 envelope is AAD-bound to its own header, so that
  // path could never have decrypted one: it would fail as "wrong
  // password" on a file exported by this very build.
  const parsed = (typeof VaultEnvelope !== 'undefined') ? VaultEnvelope.parse(text) : null;

  // ── unencrypted ───────────────────────────────────────────────────
  // Checked first. Without this, `parsed.ok && !parsed.legacy` claimed a
  // plain vault as v6, then read env.data — which does not exist — and the
  // import died as a base64 error on a perfectly good file.
  if (parsed && parsed.ok && parsed.plain) {
    const read = VaultEnvelope.readPlain(parsed.envelope);
    if (!read.ok) { toast('\u26a1 ' + read.message); return; }
    if (!(await mmConfirm(
      'That file is an UNENCRYPTED vault.\n\n' +
      'Importing it replaces your current working data with its contents. ' +
      'The file itself is plain readable JSON — it was never protected.\n\n' +
      'Import it?'
    ))) return;
    vaultDeserialize(read.state);
    VAULT.dirty = true;
    toast('Imported an unencrypted vault \u2014 it will be saved in your current vault\u2019s format');
    return;
  }

  // ── v6 ────────────────────────────────────────────────────────────
  if (parsed && parsed.ok && !parsed.legacy) {
    const env = parsed.envelope;
    if (!AUTH.key || !AUTH.kdf) { toast('\u26a0 Unlock your vault before importing an encrypted one'); return; }

    const ct = VaultCrypto.fromBase64(env.data);
    const sha = await VaultCrypto.sha256Hex(ct);
    if (!VaultCrypto.timingSafeEqualHex(sha, env.ciphertextSha256)) {
      // Damaged file, NOT a wrong password. Saying the wrong one here
      // sends someone hunting for a typo while their backup rots.
      toast('\u26a1 That vault file is damaged \u2014 this is not a password problem');
      return;
    }

    // An export carries its own salt and iteration count, which are
    // usually NOT this session's. Derive against the file's header.
    let key = AUTH.key;
    if (env.kdf.salt !== AUTH.kdf.salt || env.kdf.iterations !== AUTH.kdf.iterations) {
      const pw = await mmPrompt('Password for the vault file being imported:');
      if (!pw) return;
      key = await VaultCrypto.deriveKey(pw, env.kdf.salt, env.kdf.iterations, env.kdf.keyLen);
    }

    let plain;
    try {
      plain = await VaultCrypto.decrypt(key, ct, env.iv, VaultEnvelope.aadBytes(env));
    } catch (e) {
      toast('\u26a1 Could not decrypt \u2014 wrong password, or the file header was edited');
      return;
    }
    vaultDeserialize(JSON.parse(VaultCrypto.utf8Decode(plain)));
    T.canvasImported(CANVAS.NX.nodes.length);
    CANVAS.resetView();
    return;
  }

  // ── v5, and the plaintext export ──────────────────────────────────
  const d = JSON.parse(text);
  if (d.format === 'mastermind-export-plaintext') { vaultDeserialize(d.data); }
  else if (d.encrypted) {
    if (!AUTH.key) { toast('\u26a0 Vault is encrypted \u2014 unlock first'); return; }
    const buf = await _aesDecrypt(AUTH.key, { iv: d.iv, data: d.data });
    vaultDeserialize(JSON.parse(new TextDecoder().decode(buf)));
  } else {
    vaultDeserialize(d.data);
  }
  T.canvasImported(CANVAS.NX.nodes.length);
  CANVAS.resetView();
}

function importObsidian(text, filename) {
  // Parse single Obsidian markdown file or folder export
  // Each [[wikilink]] becomes a concept node connection
  const lines = text.split('\n');
  const title = filename.replace(/\.md$/i, '') || 'Imported Note';
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const { x: wx, y: wy } = s2w(cx, cy);

  // Create root node for this file
  const root = CANVAS.spawnNode('concept', wx, wy, {
    title: title.slice(0, 60),
    body: lines.filter(l => !l.startsWith('#') && l.trim()).slice(0, 5).join('\n').slice(0, 300),
    tags: ['obsidian', 'import'],
  });

  // Extract headings as child nodes
  let prevId = root.id;
  let headingCount = 0;
  lines.forEach((line, i) => {
    const heading = line.match(/^(#{1,6})\s+(.+)/);
    if (heading && headingCount < 12) {
      const level = heading[1].length;
      const n = CANVAS.spawnNode(level <= 2 ? 'framework' : 'concept',
        wx + (headingCount % 4) * 220 - 330,
        wy + Math.floor(headingCount / 4) * 140 + 160,
        { title: heading[2].slice(0, 50), tags: ['obsidian', 'h' + level] }
      );
      CANVAS.addConn(root.id, n.id, 'section');
      prevId = n.id;
      headingCount++;
    }
  });

  // Extract [[wikilinks]] as connected nodes
  const links = [...new Set(text.match(/\[\[([^\]]+)\]\]/g) || [])];
  links.slice(0, 8).forEach((link, i) => {
    const name = link.replace(/\[\[|\]\]/g, '');
    const n = CANVAS.spawnNode('vector', wx + i * 200 - 700, wy - 160, {
      title: name.slice(0, 50), tags: ['obsidian', 'wikilink'],
    });
    CANVAS.addConn(root.id, n.id, 'links to');
  });

  mm_toast(`Obsidian: ${title} → ${CANVAS.NX.nodes.length-1} nodes`, 'success');
}

function importLogseq(text, filename) {
  // LogSeq uses bullet outline with [[links]] and #tags
  const lines = text.split('\n');
  const title = filename.replace(/\.md$/i, '');
  const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
  const root = CANVAS.spawnNode('framework', wx, wy, {
    title: title.slice(0, 50), tags: ['logseq', 'import'],
  });
  let i = 0;
  lines.forEach((line, idx) => {
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    if (bullet && i < 15) {
      const text_clean = bullet[1].replace(/\[\[|\]\]/g, '').replace(/#\w+/g, '').trim();
      if (text_clean.length < 3) return;
      const n = CANVAS.spawnNode('concept', wx + (i%4)*200-300, wy + Math.floor(i/4)*120+160, {
        title: text_clean.slice(0, 50), tags: ['logseq'],
      });
      CANVAS.addConn(root.id, n.id, 'item');
      i++;
    }
  });
  mm_toast(`LogSeq: ${title} → ${i} nodes`, 'success');
}

function importRoam(text) {
  const data = JSON.parse(text);
  const pages = Array.isArray(data) ? data : [data];
  const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
  let count = 0;
  pages.slice(0, 20).forEach((page, pi) => {
    const root = CANVAS.spawnNode('concept', wx + pi*260, wy, {
      title: (page.title || 'Page').slice(0, 50),
      tags: ['roam', 'import'],
    });
    (page.children || []).slice(0, 8).forEach((block, bi) => {
      const n = CANVAS.spawnNode('insight', wx + pi*260 + (bi%2)*200-100, wy + Math.ceil(bi/2)*130+160, {
        title: (block.string || '').slice(0, 50),
        tags: ['roam', 'block'],
      });
      CANVAS.addConn(root.id, n.id, 'child');
      count++;
    });
  });
  mm_toast(`Roam: ${pages.length} pages → ${count} blocks`, 'success');
}

function importNotion(text) {
  // Notion export is either markdown or JSON API response
  try {
    const data = JSON.parse(text);
    const results = data.results || [data];
    const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
    results.slice(0, 20).forEach((page, i) => {
      const title_prop = page.properties?.Name?.title?.[0]?.plain_text
        || page.properties?.title?.title?.[0]?.plain_text
        || 'Notion Page';
      CANVAS.spawnNode('concept', wx + (i%4)*220-330, wy + Math.floor(i/4)*140, {
        title: title_prop.slice(0, 50),
        body: JSON.stringify(page.properties || {}).slice(0, 200),
        tags: ['notion', 'import'],
      });
    });
    mm_toast(`Notion: ${results.length} pages imported`, 'success');
  } catch {
    importMarkdown(text, 'notion-export.md');
  }
}

function importMarkdown(text, filename) {
  const lines = text.split('\n');
  const title = (filename || 'doc').replace(/\.(md|txt)$/i, '');
  const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
  const root = CANVAS.spawnNode('concept', wx, wy, { title: title.slice(0,50), tags: ['import','markdown'] });
  let i = 0;
  lines.forEach(line => {
    const h = line.match(/^(#{1,4})\s+(.+)/);
    if (h && i < 16) {
      const n = CANVAS.spawnNode(h[1].length<=2?'framework':'concept',
        wx+(i%4)*200-300, wy+Math.floor(i/4)*130+160,
        { title: h[2].slice(0,50), tags:['import','heading'] });
      CANVAS.addConn(root.id, n.id, 'section');
      i++;
    }
  });
  mm_toast(`Markdown: ${title} → ${i} nodes`, 'success');
}

function importGenericJSON(text) {
  try {
    const d = JSON.parse(text);
    // Try to find nodes/edges in any schema
    const nodes = d.nodes || d.vertices || d.items || d.elements || (Array.isArray(d) ? d : [d]);
    const edges = d.edges || d.links || d.connections || d.conns || [];
    const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
    const idMap = {};
    nodes.slice(0, 50).forEach((node, i) => {
      const label = node.label || node.name || node.title || node.text || JSON.stringify(node).slice(0,40);
      const n = CANVAS.spawnNode('concept', wx+(i%6)*200-500, wy+Math.floor(i/6)*140, {
        title: label.slice(0,60),
        body: JSON.stringify(node).slice(0,200),
        tags: ['import','json'],
      });
      idMap[node.id || i] = n.id;
    });
    edges.slice(0, 60).forEach(edge => {
      const from = idMap[edge.source || edge.from];
      const to   = idMap[edge.target || edge.to];
      if (from && to) CANVAS.addConn(from, to, edge.label || edge.type || '');
    });
    T.canvasImported(Object.keys(idMap).length);
  } catch(e) {
    mm_toast('Could not parse JSON: ' + e.message, 'error');
  }
}

// Multi-file import handler
function handleImportFile(e) {
  const files = Array.from(e.target.files || []);
  files.forEach(file => importFile(file));
  e.target.value = '';
}

/* ═══════════════════════════════════════════════════════════════════
   MODULE: ai — AI integration layer
   ID: module:ai
   Integrates: per-node, canvas-wide, gap bridge, framework panels
   Providers: Anthropic Claude, OpenAI GPT, local (Ollama)
═══════════════════════════════════════════════════════════════════ */

const AI = {
  id: 'module:ai',
  enabled: false,
  provider: 'ollama',  // 'ollama' | 'clearglass'
  model: 'llama3',
  temperature: 0.7,
  maxTokens: 1000,
  contextLimit: 8000,
  ollamaBase: 'http://localhost:11434',   // configurable Ollama endpoint
  ollamaModels: [],                        // populated by ollamaDetectModels()
  // Accounts per agent. Each accountId maps to its own isolated browser
  // session in the main process (persist:cg-<agent>-<accountId>), so
  // two logins for the same agent never collide.
  accounts: { chatgpt: ['default'], claude: ['default'], perplexity: ['default'], gemini: ['default'] },
  account: 'default',                      // active account for the active provider
  guardianPort: 7823,                      // clear-glass-lite guardian-lite port
  guardianToken: '',                       // X-CGL-Token — required by the hardened build
  clearglassUserscriptDir: '',             // confirmed install dir — once known, never search or ask again
};

const AI_KEY = 'nexus_ai_config';

function aiLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(AI_KEY) || '{}');
    // SECURITY FIX: an earlier build stored AI.apiKey directly in this
    // key, in plaintext, before aiConfig moved into the encrypted vault
    // (mastermind-vault.js — see the comment on vaultSerialize()'s
    // aiConfig block). This key is still legitimately used for
    // non-sensitive fields (provider, model, a local pairing token), so
    // it can't go through the wholesale _ORPHAN_KEYS harvest — this
    // targets just the one field that shouldn't be here and leaves the
    // rest untouched. AI.apiKey itself is never read from here; the
    // vault is the only source for it (see vaultDeserialize below).
    if ('apiKey' in s) {
      delete s.apiKey;
      try { localStorage.setItem(AI_KEY, JSON.stringify(s)); } catch (e) {}
      MMLog?.info('ai', 'Scrubbed a stray plaintext API key left over from an older build');
    }
    if (s.provider) AI.provider = s.provider;
    if (s.model)    AI.model    = s.model;
    if (s.enabled !== undefined) AI.enabled = s.enabled;
    if (s.ollamaBase) AI.ollamaBase = s.ollamaBase;
    if (s.accounts) AI.accounts = s.accounts;
    if (s.guardianPort) AI.guardianPort = s.guardianPort;
    if (typeof s.guardianToken === 'string') AI.guardianToken = s.guardianToken;
    if (typeof s.clearglassUserscriptDir === 'string') AI.clearglassUserscriptDir = s.clearglassUserscriptDir;
    if (s.account) AI.account = s.account;

    // Migration guard: a config saved before providers were narrowed to
    // just Ollama/ClearGlass can still hold old values like
    // provider:'anthropic' or model:'claude-sonnet-4-20250514'. Loading
    // those back in silently is exactly what caused real, repeated
    // HTTP 404s against Ollama trying to run a Claude model name that
    // doesn't exist there — confirmed from an actual user's Application
    // Log. Reset to sane defaults rather than resurrect a stale value.
    // Valid providers: ollama (local) + the web agents. 'clearglass' is
    // the legacy pre-multi-agent value and maps to claude rather than
    // being wiped — otherwise every existing config silently resets.
    const _validProviders = ['ollama', 'chatgpt', 'claude', 'perplexity', 'gemini'];
    if (AI.provider === 'clearglass') {
      MMLog?.info('ai', 'Migrating legacy provider "clearglass" -> "claude"');
      AI.provider = 'claude';
    } else if (!_validProviders.includes(AI.provider)) {
      MMLog?.info('ai', `Saved AI provider "${AI.provider}" is not recognised — resetting to chatgpt`);
      AI.provider = 'chatgpt';
    }
    if (AI.provider === 'ollama' && /^(claude|gpt|o[0-9]|text-)/i.test(AI.model || '')) {
      MMLog?.info('ai', `Saved AI model "${AI.model}" is not an Ollama model — resetting to llama3`);
      AI.model = 'llama3';
    }
  } catch(e) {
    MMLog?.error('ai', 'aiLoad failed, using defaults: ' + e.message);
  }
}

function aiSave() {
  try { localStorage.setItem(AI_KEY, JSON.stringify({
    provider: AI.provider, model: AI.model,
    enabled: AI.enabled, ollamaBase: AI.ollamaBase, accounts: AI.accounts, account: AI.account,
    guardianPort: AI.guardianPort, guardianToken: AI.guardianToken,
    clearglassUserscriptDir: AI.clearglassUserscriptDir,
    ollamaModels: AI.ollamaModels,
  })); } catch(e) {}
  if (typeof vaultDirtySave === 'function') vaultDirtySave(3000);
}

// Build context string from canvas state
function aiBuildContext(focusNodeId) {
  const lines = [];
  if (focusNodeId) {
    const n = CANVAS.NX.nodes.find(x => x.id === focusNodeId);
    if (n) lines.push(`FOCUS NODE: [${n.type.toUpperCase()}] ${n.title}\n${n.body || ''}`);
    // Add connected nodes
    const conns = CANVAS.NX.conns.filter(c => c.from === focusNodeId || c.to === focusNodeId);
    conns.slice(0, 8).forEach(c => {
      const otherId = c.from === focusNodeId ? c.to : c.from;
      const other = CANVAS.NX.nodes.find(x => x.id === otherId);
      if (other) lines.push(`  → ${c.label || 'connects'} → [${other.type}] ${other.title}`);
    });
    lines.push('');
  }
  // Canvas summary
  const typeCount = {};
  CANVAS.NX.nodes.forEach(n => { typeCount[n.type] = (typeCount[n.type]||0)+1; });
  lines.push(`CANVAS: ${CANVAS.NX.nodes.length} nodes, ${CANVAS.NX.conns.length} connections`);
  lines.push('Types: ' + Object.entries(typeCount).map(([t,c]) => `${t}(${c})`).join(', '));
  // Sample of all nodes (truncated)
  const sample = CANVAS.NX.nodes.slice(0, 20).map(n => `[${n.type}] ${n.title}`).join('\n');
  lines.push('\nNODES:\n' + sample);
  return lines.join('\n').slice(0, AI.contextLimit);
}

async function aiCall(systemPrompt, userMessage) {
  // Single-arg calls pass the whole prompt as systemPrompt — treat as user message
  const sysMsg  = userMessage !== undefined ? systemPrompt : 'You are a helpful assistant.';
  const userMsg = userMessage !== undefined ? userMessage  : systemPrompt;

  if (!AI.enabled) {
    mm_toast('AI disabled — enable in Options → AI', 'warn'); return null;
  }

  // ClearGlass — real transport, built against the actual clear-glass-lite
  // source. See integrations/clearglass/README.md for setup: it needs
  // ClearGlass Lite running, Claude logged in there, and the bridge
  // userscript installed — none of which Mastermind can do for you.
  if (typeof cgIsWebAgent === 'function' ? cgIsWebAgent(AI.provider) : AI.provider === 'clearglass') {
    if (typeof clearglassCall !== 'function') {
      const msg = '[ClearGlass transport not loaded — foundation/ai/clearglass-transport.js missing]';
      MMLog?.error('ai', msg);
      mm_toast('ClearGlass transport not loaded', 'error');
      return msg;
    }
    MMLog?.info('ai', `Call via ClearGlass — ${userMsg.slice(0,60)}…`);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.call', { provider: 'clearglass' });
    try {
      const result = await clearglassCall(sysMsg, userMsg);
      MMLog?.info('ai', `ClearGlass response: ${result.slice(0,80)}…`);
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.response', { provider: 'clearglass', length: result.length });
      return result;
    } catch (e) {
      MMLog?.error('ai', `ClearGlass error: ${e.message}`);
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.error', { provider: 'clearglass', error: e.message });
      if (typeof T !== 'undefined') T.aiError(e.message);
      else mm_toast('ClearGlass: ' + e.message, 'error');
      return null;
    }
  }

  // Endpoint routing — Ollama only from here on
  const ollamaBase = AI.ollamaBase || 'http://localhost:11434';
  const endpoint = ollamaBase + '/api/chat';
  const headers  = { 'Content-Type': 'application/json' };
  const body = { model: AI.model || 'llama3', stream: false,
                 messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }] };

  MMLog?.info('ai', `Call: ${AI.provider}/${AI.model} — ${userMsg.slice(0,60)}…`);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.call', { provider: AI.provider, model: AI.model });

  try {
    const res  = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}: ${JSON.stringify(data).slice(0,200)}`);

    const result = data.message?.content || '';

    MMLog?.info('ai', `Response: ${result.slice(0,80)}…`);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.response', { provider: AI.provider, length: result.length });
    return result;
  } catch(e) {
    MMLog?.error('ai', `Error: ${e.message}`);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.error', { provider: AI.provider, error: e.message });
    if (typeof T !== 'undefined') T.aiError(e.message);
    else mm_toast('AI error: ' + e.message, 'error');
    return null;
  }
}

// ── AI actions ───────────────────────────────────────────────

async function aiExpandNode(nodeId) {
  const node = CANVAS.NX.nodes.find(n => n.id === nodeId);
  if (!node) return;
  T.aiThinking();
  const sys = 'You are a cognitive mapping assistant. Generate 3-5 connected insight nodes as JSON array. Each: {type, title, body, relation}. Types: concept|insight|pattern|question|synthesis|vector|gap|invariant|causal|friction|signal. Keep titles under 50 chars.';
  const ctx = aiBuildContext(nodeId);
  const result = await aiCall(sys, `Expand this node:\n${ctx}\n\nReturn ONLY valid JSON array.`);
  // Was a bare return: the thinking indicator never cleared and nothing
  // said why. This is the "clicked AI expand, nothing happened" bug.
  if (!result) { T.aiDone(); mm_toast('AI expand returned nothing - the reason was toasted above', 'warn', { dur: 5000 }); return; }
  try {
    const clean = result.replace(/```json|```/g, '').trim();
    const expansions = JSON.parse(clean);
    const cx = node.x, cy = node.y;
    const spacing = 240;
    const count = Math.min(expansions.length, 5);
    expansions.slice(0, count).forEach((exp, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const n = CANVAS.spawnNode(exp.type || 'insight',
        cx + Math.cos(angle) * spacing,
        cy + Math.sin(angle) * spacing,
        { title: (exp.title || '').slice(0, 50), body: exp.body || '', tags: ['ai-expand'] }
      );
      CANVAS.addConn(nodeId, n.id, exp.relation || 'ai-generated');
    });
    T.aiDone(); mm_toast(`AI: ${count} nodes generated`, 'success', {dur:2500});
  } catch(e) { T.aiDone(); mm_toast('AI replied, but not with valid JSON: ' + e.message, 'error', { dur: 7000 }); }
}

async function aiAnalyzeCanvas() {
  T.aiThinking();
  const sys = 'You are a cognitive mapping analyst. Analyze the knowledge map and identify: key patterns, missing connections, highest-leverage nodes, synthesis opportunities. Return a structured analysis.';
  const ctx = aiBuildContext();
  const result = await aiCall(sys, `Analyze this knowledge canvas:\n\n${ctx}`);
  if (!result) { T.aiDone(); mm_toast('Canvas analysis returned nothing', 'warn', { dur: 5000 }); return; }
  const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2 - 200);
  CANVAS.spawnNode('synthesis', wx, wy, {
    title: 'AI CANVAS ANALYSIS',
    body: result.slice(0, 1000),
    tags: ['ai-analysis', 'synthesis'],
  });
  T.aiDone();
}

async function aiSuggestGapBridges(sessionId) {
  const sess = GAP_STATE.sessions.find(s => s.id === (sessionId || GAP_STATE.active));
  if (!sess) { toast('No active gap session'); return; }
  T.aiThinking();
  const sys = 'You are a creative synthesis engine. Given two concepts and their gap, suggest 3 bridge ideas that connect them. Be specific and actionable. Return JSON array: [{text, type}] where type is concept|synthesis|vector|insight.';
  const prompt = `Node A: "${sess.nodeA}"\nNode B: "${sess.nodeB}"\nCurrent gap: "${sess.gaps[sess.gaps.length-1]?.text || 'open gap'}"\n\nSuggest 3 bridges. Return ONLY valid JSON array.`;
  const result = await aiCall(sys, prompt);
  if (!result) return;
  try {
    const clean = result.replace(/```json|```/g, '').trim();
    const bridges = JSON.parse(clean);
    bridges.slice(0, 3).forEach(b => {
      if (b.text) {
        const inp = document.getElementById('gap-bridge-input');
        if (inp) { inp.value = b.text; addGapBridge(); }
      }
    });
    T.aiDone(); mm_toast(`AI: ${bridges.length} bridges suggested`, 'success', {dur:2500});
  } catch(e) {
    mm_toast('Parse error: ' + e.message, 'error');
  }
}

async function aiRateSignalItems() {
  if (!SIGNAL_STATE.items.length) { toast('No items to rate'); return; }
  T.aiThinking();
  const sys = 'You are a signal-to-noise filter. Rate each item on Alignment (1-5), Fidelity (1-5), Expansion (1-5). Return JSON array: [{index, alignment, fidelity, expansion, reason}].';
  const items = SIGNAL_STATE.items.map((item, i) => `${i}: "${item.text}"`).join('\n');
  const result = await aiCall(sys, `Rate these items for a cognitive canvas:\n${items}\n\nReturn ONLY valid JSON array.`);
  if (!result) return;
  try {
    const clean = result.replace(/```json|```/g, '').trim();
    const ratings = JSON.parse(clean);
    ratings.forEach(r => {
      const item = SIGNAL_STATE.items[r.index];
      if (item) {
        item.alignment = Math.min(5, Math.max(1, r.alignment || 3));
        item.fidelity  = Math.min(5, Math.max(1, r.fidelity  || 3));
        item.expansion = Math.min(5, Math.max(1, r.expansion || 3));
      }
    });
    renderSignalItems();
    T.aiDone(); mm_toast(`AI rated ${ratings.length} items`, 'success');
  } catch(e) { toast('⚠ Parse error: ' + e.message); }
}

async function aiSpawnFromPrompt(prompt) {
  T.aiThinking();
  const sys = 'You are a knowledge graph generator. Given a prompt, generate 5-8 connected nodes. Return JSON: {nodes: [{type,title,body,x,y}], conns: [{from,to,label}]} where x/y are relative (-400 to 400) and type is one of: concept|insight|pattern|seed|question|friction|synthesis|heuristic|framework|causal|gap|vector|invariant|signal.';
  const result = await aiCall(sys, `Generate a knowledge map for: "${prompt}"\n\nReturn ONLY valid JSON.`);
  if (!result) return;
  try {
    const clean = result.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);
    const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
    const idMap = {};
    (data.nodes || []).forEach((n, i) => {
      const node = CANVAS.spawnNode(n.type || 'concept',
        wx + (n.x || (i%4)*220-330),
        wy + (n.y || Math.floor(i/4)*140),
        { title: (n.title||'').slice(0,50), body: n.body||'', tags: ['ai-generated'] }
      );
      idMap[i] = node.id;
    });
    (data.conns || []).forEach(c => {
      const from = idMap[c.from]; const to = idMap[c.to];
      if (from && to) CANVAS.addConn(from, to, c.label || '');
    });
    T.aiDone(); T.canvasImported(Object.keys(idMap).length);
  } catch(e) { toast('⚠ Parse error: ' + e.message); }
}



// Load AI config on boot
aiLoad();
if (typeof latLoad === "function") latLoad();

// Automatic relay configuration: this only matters in the rare case
// where Mastermind's own baked-in cgAsk path (clear-glass-lite hosted
// inside Electron, foundation/ai/clearglass-main.js) isn't available for
// some reason — that's the only situation clearglassCall() ever reaches
// the external-relay fallback. Normally under Electron cgAsk exists and
// this whole relay is moot, so don't bother scanning anything.
setTimeout(() => {
  try {
    const isWebAgent = typeof cgIsWebAgent === 'function' && cgIsWebAgent(AI.provider);
    if (AI.enabled && isWebAgent && window.NXAPI?.cgInstallUserscript && !window.NXAPI?.cgAsk) {
      _relayAutoConfigure();
    }
  } catch (e) {}
}, 0);

/* ═══════════════════════════════════════════════════════════════════
   MODULE: body — Embodiment, nervous system, intuition, patterns
   ID: module:body
   Framework sections: polyvagal states, Ne/Ni/Se/Si intuition types,
   somatic signals, invariant mapping, pattern canvas, fractal body scan
═══════════════════════════════════════════════════════════════════ */

const BODY = {
  id: 'module:body',
  nervousSystemState: 'ventral',   // ventral | sympathetic | dorsal
  intuitionMode: 'ne',             // ne | ni | se | si
  somaticLog: [],
  patternLog: [],
  invariantMap: [],
};
const BODY_KEY = 'nexus_body_state';

const NERVOUS_SYSTEM_STATES = {
  ventral: {
    label: 'Ventral Vagal',
    sub: 'Safe & Social — creative, connected, regulated',
    color: '#00ff88',
    emoji: '◉',
    signals: ['open curiosity', 'warm presence', 'grounded energy', 'collaborative'],
  },
  sympathetic: {
    label: 'Sympathetic',
    sub: 'Fight/Flight — activated, alert, tension',
    color: '#ffe04a',
    emoji: '⚡',
    signals: ['racing thoughts', 'chest tightness', 'urgency', 'hypervigilance'],
  },
  dorsal: {
    label: 'Dorsal Vagal',
    sub: 'Shutdown — flat, collapsed, disconnected',
    color: '#ff3355',
    emoji: '▾',
    signals: ['numbness', 'fog', 'low energy', 'dissociation'],
  },
};

const INTUITION_TYPES = {
  ne: {
    label: 'Ne — Extraverted Intuition',
    desc: 'Divergent · possibilities · lateral connections · what could be',
    color: '#cc44ff',
    prompt: 'What are all the possibilities? What patterns connect across domains?',
    nodeType: 'seed',
  },
  ni: {
    label: 'Ni — Introverted Intuition',
    desc: 'Convergent · depth · future vision · underlying structure',
    color: '#00c8ff',
    prompt: 'What is the deeper pattern? What will this become? What is the invariant?',
    nodeType: 'invariant',
  },
  se: {
    label: 'Se — Extraverted Sensing',
    desc: 'Present moment · sensory detail · immediate reality · what is',
    color: '#ff8c22',
    prompt: 'What is actually here right now? What does the body report?',
    nodeType: 'signal',
  },
  si: {
    label: 'Si — Introverted Sensing',
    desc: 'Memory · comparison · stored experience · what was',
    color: '#ff66aa',
    prompt: 'What does this remind me of? What pattern has appeared before?',
    nodeType: 'pattern',
  },
};

function bodyInit() {
  // SECURITY FIX: this read localStorage['nexus_body_state'] — somatic
  // log, nervous-system state, pattern log — as its source, in parallel
  // with the vault (mastermind-vault.js's modules.body already covers
  // BODY in full). The function was dead code (never called), so this
  // specific read was not an active clobber risk, but bodySave() below
  // was still writing this same sensitive log to plaintext on every
  // change regardless. Vault-only now; see _ORPHAN_KEYS in
  // mastermind-vault.js for recovering any pre-fix copy.
  BODY._loaded = true;
}

function bodySave() {
  // SECURITY FIX: this used to ALSO write localStorage['nexus_body_state']
  // in plaintext, in parallel with the vault, on every change — somatic
  // log and nervous-system state sitting unencrypted on disk regardless
  // of whether vault encryption was on. The vault is the only store now.
  if (typeof vaultDirtySave === 'function') vaultDirtySave(5000);
}

function bodySetNervousSystem(state) {
  BODY.nervousSystemState = state;
  bodySave();
  renderBodyState();
  const s = NERVOUS_SYSTEM_STATES[state];
  mm_toast(`Nervous system: ${s.label}`, 'info', {dur:2000});
  // Log to somatic log
  BODY.somaticLog.unshift({ id: uuid(), state, time: Date.now(), note: '' });
  if (BODY.somaticLog.length > 50) BODY.somaticLog.pop();
}

function bodySetIntuition(mode) {
  BODY.intuitionMode = mode;
  bodySave();
  renderBodyIntuition();
  const t = INTUITION_TYPES[mode];
  mm_toast(`Intuition: ${t.label}`, 'brain', {dur:2000});
}

function renderBodyState() {
  const el = document.getElementById('body-ns-display'); if (!el) return;
  const s = NERVOUS_SYSTEM_STATES[BODY.nervousSystemState];
  el.style.borderColor = s.color;
  el.style.background = s.color + '10';
  el.innerHTML = `<div style="font-size:20px">${s.emoji}</div>
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:700;color:${s.color};letter-spacing:2px">${s.label.toUpperCase()}</div>
      <div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);margin-top:2px">${s.sub}</div>
    </div>`;
  // Update button states
  Object.keys(NERVOUS_SYSTEM_STATES).forEach(k => {
    const btn = document.getElementById('body-ns-' + k);
    if (btn) btn.classList.toggle('act', k === BODY.nervousSystemState);
  });
}

function renderBodyIntuition() {
  const el = document.getElementById('body-intuition-display'); if (!el) return;
  const t = INTUITION_TYPES[BODY.intuitionMode];
  el.innerHTML = `<div style="font-family:var(--f-display);font-size:11px;font-weight:700;color:${t.color};letter-spacing:2px">${t.label.toUpperCase()}</div>
    <div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);margin-top:3px">${t.desc}</div>
    <div style="font-family:var(--f-body);font-size:9px;color:var(--muted);margin-top:8px;font-style:italic">"${t.prompt}"</div>`;
  Object.keys(INTUITION_TYPES).forEach(k => {
    const btn = document.getElementById('body-int-' + k);
    if (btn) btn.classList.toggle('act', k === BODY.intuitionMode);
  });
}

function bodyAddSomaticSignal() {
  const inp = document.getElementById('body-somatic-input');
  const text = inp?.value.trim(); if (!text) return;
  const entry = { id: uuid(), text, state: BODY.nervousSystemState, intuition: BODY.intuitionMode, time: Date.now() };
  BODY.somaticLog.unshift(entry);
  if (BODY.somaticLog.length > 100) BODY.somaticLog.pop();
  if (inp) inp.value = '';
  bodySave();
  renderBodySomaticLog();
}

function bodySpawnSomatic() {
  const inp = document.getElementById('body-somatic-input');
  const text = inp?.value.trim();
  if (!text) { toast('Enter a somatic signal first'); return; }
  const t = INTUITION_TYPES[BODY.intuitionMode];
  const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
  CANVAS.enterCanvas();
  setTimeout(() => {
    CANVAS.spawnNode(t.nodeType, wx + Math.random()*200-100, wy + Math.random()*100, {
      title: text.slice(0, 50),
      body: `NS: ${BODY.nervousSystemState} | Intuition: ${BODY.intuitionMode}`,
      tags: ['somatic', 'body', BODY.nervousSystemState, BODY.intuitionMode],
    });
    mm_toast('Somatic signal → canvas', 'export');
    closeVoid();
  }, 200);
}

function bodyFractalScan() {
  const inp = document.getElementById('body-fractal-input');
  const text = inp?.value.trim() || 'body scan';
  // Ne → Ni → Ne cycle: diverge then converge then diverge again
  const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
  CANVAS.enterCanvas();
  setTimeout(() => {
    const root = CANVAS.spawnNode('signal', wx, wy, {
      title: 'BODY: ' + text.slice(0, 40),
      body: 'Fractal body scan — NS: ' + BODY.nervousSystemState,
      tags: ['body-scan', 'somatic'],
    });
    // Ne phase: divergent possibilities
    ['What sensations?', 'What emotions?', 'What impulses?', 'What avoided?'].forEach((q, i) => {
      const angle = (i/4)*Math.PI*2 - Math.PI/2;
      const n = CANVAS.spawnNode('seed', wx+Math.cos(angle)*220, wy+Math.sin(angle)*220, {
        title: q, tags: ['ne-diverge', 'body-scan'],
      });
      CANVAS.addConn(root.id, n.id, 'Ne →');
    });
    // Ni phase: convergent invariant
    const inv = CANVAS.spawnNode('invariant', wx, wy + 340, {
      title: 'INVARIANT: What persists?',
      body: 'What is the underlying pattern across all sensations?',
      tags: ['ni-converge', 'body-scan'],
    });
    CANVAS.addConn(root.id, inv.id, '→ Ni');
    mm_toast('Body fractal scan → canvas', 'export');
    closeVoid();
  }, 200);
}

function renderBodySomaticLog() {
  const el = document.getElementById('body-somatic-log'); if (!el) return;
  const ns_colors = { ventral:'var(--g)', sympathetic:'var(--y)', dorsal:'var(--r)' };
  el.innerHTML = '';
  BODY.somaticLog.slice(0, 12).forEach(entry => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:5px 0;border-bottom:1px solid var(--wire);font-family:var(--f-mono);font-size:7.5px;color:var(--muted)';
    div.innerHTML = `<span style="color:${ns_colors[entry.state]||'var(--c)'}">${entry.state[0].toUpperCase()}</span> <span style="color:var(--dim);font-size:6.5px">${INTUITION_TYPES[entry.intuition]?.label.split(' ')[0]||''}</span> ${escH(entry.text)}`;
    el.appendChild(div);
  });
}

function bodyAddPattern() {
  const inp = document.getElementById('body-pattern-input');
  const text = inp?.value.trim(); if (!text) return;
  BODY.patternLog.push({ id: uuid(), text, time: Date.now() });
  if (inp) inp.value = '';
  bodySave();
  renderBodyPatternLog();
}

function renderBodyPatternLog() {
  const el = document.getElementById('body-pattern-log'); if (!el) return;
  el.innerHTML = '';
  BODY.patternLog.slice(-12).reverse().forEach(p => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:4px 0;border-bottom:1px solid var(--wire);font-family:var(--f-mono);font-size:8px;color:var(--muted)';
    div.innerHTML = '<span style="color:var(--v)">⬢</span> ' + escH(p.text);
    el.appendChild(div);
  });
}

function bodyMapInvariant() {
  const inp = document.getElementById('body-invariant-input');
  const text = inp?.value.trim(); if (!text) return;
  BODY.invariantMap.push({ id: uuid(), text, time: Date.now(), confirmed: false });
  if (inp) inp.value = '';
  bodySave();
  renderBodyInvariantMap();
}

function renderBodyInvariantMap() {
  const el = document.getElementById('body-invariant-map'); if (!el) return;
  el.innerHTML = '';
  BODY.invariantMap.forEach(inv => {
    const div = document.createElement('div');
    div.style.cssText = 'padding:6px 8px;border:1px solid ' + (inv.confirmed?'var(--c)':'var(--wire2)') + ';margin-bottom:4px;display:flex;align-items:center;gap:8px;cursor:pointer;position:relative;z-index:1;pointer-events:all';
    div.innerHTML = '<span style="color:' + (inv.confirmed?'var(--c)':'var(--dim)') + ';font-size:12px">◆</span>' +
      '<span style="font-family:var(--f-mono);font-size:8px;color:var(--muted);flex:1">' + escH(inv.text) + '</span>' +
      '<span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">' + (inv.confirmed?'CONFIRMED':'pending') + '</span>';
    div.addEventListener('click', () => { inv.confirmed = !inv.confirmed; bodySave(); renderBodyInvariantMap(); });
    el.appendChild(div);
  });
}

function bodyExportInvariantsToCanvas() {
  const confirmed = BODY.invariantMap.filter(i => i.confirmed);
  if (!confirmed.length) { toast('No confirmed invariants'); return; }
  CANVAS.enterCanvas();
  setTimeout(() => {
    const { x: wx, y: wy } = s2w(window.innerWidth/2, window.innerHeight/2);
    const hub = CANVAS.spawnNode('framework', wx, wy, {
      title: 'BODY INVARIANTS', tags: ['body', 'invariant-map'],
    });
    confirmed.forEach((inv, i) => {
      const n = CANVAS.spawnNode('invariant', wx + (i%3)*240-240, wy + Math.floor(i/3)*150+200, {
        title: inv.text.slice(0, 50), tags: ['body', 'invariant', 'confirmed'],
      });
      CANVAS.addConn(hub.id, n.id, 'invariant');
    });
    mm_toast(`${confirmed.length} body invariants → canvas`, 'export');
    closeVoid();
  }, 200);
}

/* ── Options AI helpers ──────────────────────────────────────── */
function optsToggleAI(el) {
  el.classList.toggle('on');
  AI.enabled = el.classList.contains('on');
  aiSave();
  if (typeof T!=='undefined') { if(AI.enabled) T.aiEnabled(); else T.aiDisabled(); }
}

// optsUpdateAIModel — see full version with Ollama support below

async function optsTestAI() {
  const badge = document.getElementById('ai-conn-badge');
  const setBadge = (ok, msg) => {
    if (!badge) return;
    badge.textContent = ok ? '✓ ' + msg : '✗ ' + msg;
    badge.style.color = ok ? 'var(--g)' : 'var(--r)';
    badge.style.borderColor = ok ? 'rgba(0,255,136,.4)' : 'rgba(255,51,85,.4)';
  };
  if (badge) { badge.textContent = '… TESTING'; badge.style.color = 'var(--y)'; }
  const was = AI.enabled;
  AI.enabled = true;
  try {
    const result = await aiCall('Reply only with the single word: CONNECTED');
    AI.enabled = was;
    if (result && result.trim()) {
      setBadge(true, AI.provider.toUpperCase() + ' · ' + AI.model);
      mm_toast('✓ AI connected: ' + result.trim().slice(0,30), 'success');
      MMLog?.info('ai', 'Connection test passed: ' + AI.provider + ' ' + AI.model);
    } else {
      setBadge(false, 'No response — check key/endpoint');
      mm_toast('AI connection failed — empty response', 'error');
    }
  } catch(e) {
    AI.enabled = was;
    setBadge(false, e.message.slice(0,40));
    mm_toast('AI test error: ' + e.message, 'error');
  }
}

async function ollamaDetectModels() {
  const base = (document.getElementById('ai-ollama-base')?.value.trim()) || AI.ollamaBase;
  AI.ollamaBase = base;
  const statusEl = document.getElementById('ollama-detect-status');
  const modelSel = document.getElementById('ai-ollama-model');
  if (statusEl) statusEl.textContent = 'Detecting…';

  try {
    const resp = await fetch(base + '/api/tags', { method: 'GET',
      headers: { 'Content-Type': 'application/json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    const models = (data.models || []).map(m => m.name || m);
    AI.ollamaModels = models;
    aiSave();

    if (statusEl) statusEl.textContent = '✓ ' + models.length + ' models detected';
    if (modelSel) {
      modelSel.innerHTML = models.map(m =>
        `<option value="${m}" ${m === AI.model ? 'selected' : ''}>${m}</option>`
      ).join('');
      modelSel.style.display = models.length ? '' : 'none';
    }
    mm_toast('Ollama: ' + models.length + ' models found', 'success');
    MMLog?.info('ai', 'Ollama models: ' + models.join(', '));
  } catch(e) {
    if (statusEl) statusEl.textContent = '✗ ' + e.message;
    mm_toast('Ollama not reachable at ' + base + ': ' + e.message, 'error');
    MMLog?.error('ai', 'Ollama detect failed: ' + e.message);
  }
}

// Relay config (bridge userscript + guardian-lite port/token) is only
// ever relevant when Mastermind runs OUTSIDE Electron — the baked-in
// path above needs none of it. And even then, none of the four settings
// here should need a person to touch them: both steps run automatically,
// silently, the moment this section is ever looked at. Manual controls
// exist only as an escape hatch for the genuine edge case where
// clear-glass-lite isn't installed where we guessed, or its config
// doesn't match the filenames/keys we guessed — collapsed behind an
// explicit "Configure manually" link, never shown by default.
let _aiRelayAdvancedOpen = false;
let _aiRelayManualOpen = false;
let _aiRelayAutoStatus = null; // {attempted, bridgeOk, bridgeDir, guardianOk, guardianSource}

function optsToggleRelayAdvanced() {
  _aiRelayAdvancedOpen = !_aiRelayAdvancedOpen;
  optsRenderRelaySection();
}

function optsToggleRelayManual() {
  _aiRelayManualOpen = !_aiRelayManualOpen;
  const manual = document.getElementById('ai-relay-manual');
  const toggle = document.getElementById('ai-relay-manual-toggle');
  if (manual) manual.style.display = _aiRelayManualOpen ? '' : 'none';
  if (toggle) toggle.textContent = _aiRelayManualOpen ? 'Hide manual controls' : 'Configure manually';
}

// Runs both auto-config steps with no toast, no prompt, no click — that's
// the whole point of "implicit". Only ever WRITES AI.guardianToken if
// detection actually found one; never overwrites a value someone already
// set by hand, and never pretends success it didn't have.
let _aiRelayAutoConfigPromise = null;
function _relayAutoConfigure() {
  if (_aiRelayAutoConfigPromise) return _aiRelayAutoConfigPromise; // one scan per session, not one per render
  _aiRelayAutoConfigPromise = (async () => {
    const status = { attempted: false, bridgeOk: false, bridgeDir: '', guardianOk: false, guardianSource: '' };
    if (!window.NXAPI?.cgInstallUserscript) { _aiRelayAutoStatus = status; return status; }
    status.attempted = true;
    try {
      const bridgeRes = AI.clearglassUserscriptDir
        ? await window.NXAPI.cgInstallUserscript(AI.clearglassUserscriptDir)
        : await window.NXAPI.cgInstallUserscript();
      if (bridgeRes && bridgeRes.ok) {
        status.bridgeOk = true;
        status.bridgeDir = AI.clearglassUserscriptDir || (bridgeRes.installed[0] && bridgeRes.installed[0].dir) || '';
        if (!AI.clearglassUserscriptDir && bridgeRes.installed[0]) { AI.clearglassUserscriptDir = bridgeRes.installed[0].dir; aiSave(); }
      } else if (AI.clearglassUserscriptDir) {
        AI.clearglassUserscriptDir = ''; aiSave(); // remembered path went stale — forget it, don't get stuck
      }
    } catch (e) {}
    try {
      if (AI.guardianToken) {
        status.guardianOk = true; status.guardianSource = '(already configured)';
      } else if (window.NXAPI?.cgDetectGuardian) {
        const gRes = await window.NXAPI.cgDetectGuardian();
        if (gRes && gRes.ok) {
          AI.guardianPort = gRes.port; AI.guardianToken = gRes.token; aiSave();
          status.guardianOk = true; status.guardianSource = gRes.source;
          const gp = document.getElementById('opt-guardian-port'); if (gp) gp.value = gRes.port;
          const gt = document.getElementById('opt-guardian-token'); if (gt) gt.value = gRes.token;
        }
      }
    } catch (e) {}
    _aiRelayAutoStatus = status;
    return status;
  })();
  return _aiRelayAutoConfigPromise;
}

function optsRenderRelaySection() {
  const isElectron = !!window.NXAPI;
  const note    = document.getElementById('ai-relay-electron-note');
  const section = document.getElementById('ai-relay-section');
  const subtitle= document.getElementById('ai-relay-subtitle');
  const hint    = document.getElementById('ai-relay-hint');
  const statusEl= document.getElementById('ai-relay-status');
  const autoRow = document.getElementById('ai-relay-autodetect-row');
  if (!section) return;
  if (isElectron) {
    if (note) note.style.display = _aiRelayAdvancedOpen ? 'none' : '';
    section.style.display = _aiRelayAdvancedOpen ? '' : 'none';
    if (subtitle) subtitle.textContent = '(advanced — not used by this app)';
    if (hint) hint.textContent = 'Mastermind already hosts web agents directly — this only matters if you are ALSO driving a separate clear-glass-lite browser install for something else.';
  } else {
    if (note) note.style.display = 'none';
    section.style.display = '';
    if (subtitle) subtitle.textContent = '(browser-mode fallback)';
    if (hint) hint.textContent = 'Only needed because Mastermind is running outside Electron right now.';
  }
  if (autoRow) autoRow.style.display = isElectron ? '' : 'none'; // needs filesystem access browser mode doesn't have
  const sectionVisible = isElectron ? _aiRelayAdvancedOpen : true;
  if (!sectionVisible || !statusEl) return; // don't bother scanning disk for a section nobody's looking at

  if (!_aiRelayAutoStatus) {
    statusEl.textContent = 'Checking clear-glass-lite\u2026';
    statusEl.style.color = 'var(--dim)';
    _relayAutoConfigure().then(() => optsRenderRelaySection());
    return;
  }
  const s = _aiRelayAutoStatus;
  if (!s.attempted) {
    statusEl.textContent = 'Needs the Electron app to auto-configure.';
    statusEl.style.color = 'var(--dim)';
  } else if (s.bridgeOk && s.guardianOk) {
    statusEl.textContent = '\u2713 Configured automatically \u2014 nothing to do here.';
    statusEl.style.color = 'var(--g)';
  } else if (s.bridgeOk && !s.guardianOk) {
    statusEl.textContent = '\u2713 Bridge installed automatically. Could not auto-detect the guardian-lite token \u2014 configure manually below if you need it.';
    statusEl.style.color = 'var(--o,#ff8c22)';
  } else {
    statusEl.textContent = 'clear-glass-lite not found automatically \u2014 configure manually below, or confirm it\u2019s installed.';
    statusEl.style.color = 'var(--o,#ff8c22)';
  }
}

// Reads clear-glass-lite's own config file directly (best effort — it's
// a separate app, this is a guess at plausible filenames/keys in the
// same install directories the userscript installer already searches)
// instead of asking a person to open clear-glass-lite's settings, copy
// a token by hand, and paste it in here. Manual fallback only — the
// automatic pass above already tries this on its own.
async function optsAutoDetectGuardian() {
  if (!window.NXAPI?.cgDetectGuardian) { mm_toast('Auto-detect needs the Electron app', 'warn'); return; }
  mm_toast('Looking for clear-glass-lite\u2019s config\u2026', 'info', { dur: 2000 });
  let res;
  try { res = await window.NXAPI.cgDetectGuardian(); }
  catch (e) { mm_toast('Auto-detect failed: ' + e.message, 'error'); return; }
  if (!res || !res.ok) {
    mm_toast('Could not find a clear-glass-lite config to read — paste the token by hand below, or confirm it\u2019s installed', 'warn', { dur: 6000 });
    MMLog?.warn('ai', 'guardian auto-detect failed, tried: ' + (res && res.tried ? res.tried.join(', ') : '?'));
    return;
  }
  AI.guardianPort = res.port;
  AI.guardianToken = res.token;
  aiSave();
  const gp = document.getElementById('opt-guardian-port'); if (gp) gp.value = res.port;
  const gt = document.getElementById('opt-guardian-token'); if (gt) gt.value = res.token;
  if (_aiRelayAutoStatus) { _aiRelayAutoStatus.guardianOk = true; _aiRelayAutoStatus.guardianSource = res.source; }
  mm_toast('\u2713 Found it \u2014 port ' + res.port, 'success', { dur: 4000 });
  MMLog?.info('ai', 'guardian auto-detected from ' + res.source);
}

function optsShowOllamaFields() {
  const isOllama     = AI.provider === 'ollama';
  const isClearGlass = typeof cgIsWebAgent === 'function' ? cgIsWebAgent(AI.provider) : AI.provider === 'clearglass';
  const ollamaRow  = document.getElementById('ai-ollama-row');
  const keyRow     = document.getElementById('ai-key-row');
  const cgNote     = document.getElementById('ai-clearglass-note');
  if (ollamaRow)  ollamaRow.style.display  = isOllama ? '' : 'none';
  if (keyRow)     keyRow.style.display     = 'none'; // neither Ollama nor ClearGlass need an API key here
  if (cgNote)     cgNote.style.display     = isClearGlass ? '' : 'none';
  if (isClearGlass) optsRenderRelaySection();
  if (typeof optsPopulateAccounts === 'function') optsPopulateAccounts();
  if (isClearGlass && typeof optsRenderAgentAccounts === 'function') optsRenderAgentAccounts();
  // Populate Ollama base URL
  const baseEl = document.getElementById('ai-ollama-base');
  if (baseEl && isOllama) baseEl.value = AI.ollamaBase || 'http://localhost:11434';
}

// ── Agent + account manager ───────────────────────────────────────
// Accounts are per agent; each accountId gets its own isolated browser
// session in the main process. The Account dropdown under Provider
// picks the active one; the list below manages all of them.
function _aiAccountsFor(agent) {
  if (!AI.accounts) AI.accounts = {};
  if (!Array.isArray(AI.accounts[agent])) AI.accounts[agent] = ['default'];
  return AI.accounts[agent];
}

function optsPopulateAccounts() {
  const sel = document.getElementById('opt-ai-account');
  if (!sel) return;
  const agent = (typeof cgResolveAgent === 'function') ? cgResolveAgent() : 'chatgpt';
  const list = _aiAccountsFor(agent);
  if (!list.includes(AI.account)) AI.account = list[0] || 'default';
  sel.innerHTML = list.map(a => `<option value="${escH(a)}"${a === AI.account ? ' selected' : ''}>${escH(a)}</option>`).join('');
  const row = sel.closest('.opts-row');
  if (row) row.style.display = (AI.provider === 'ollama') ? 'none' : ''; // Ollama has no accounts
}

// Every {agent, accountId} pair the app knows about — what statusAll needs.
function _aiAllAccountPairs() {
  const pairs = [];
  for (const agent of (typeof CG_WEB_AGENTS !== 'undefined' ? CG_WEB_AGENTS : ['chatgpt','claude','perplexity','gemini'])) {
    for (const acct of _aiAccountsFor(agent)) pairs.push({ agent, accountId: acct });
  }
  return pairs;
}


// Which account is currently selected in each agent's dropdown. The
// active agent tracks AI.account so the panel and the real routing can
// never disagree; other agents just default to their first account.
const _agentSel = {};
function _agentSelected(agent, accts) {
  const ids = accts.map(a => a.accountId);
  const activeAgent = (typeof cgResolveAgent === 'function') ? cgResolveAgent() : null;
  if (_agentSel[agent] && ids.includes(_agentSel[agent])) return _agentSel[agent];
  if (agent === activeAgent && ids.includes(AI.account)) return AI.account;
  return ids[0];
}
function optsAgentSelectAccount(agent, accountId) {
  _agentSel[agent] = accountId;
  // If this agent is the active provider, selecting an account really
  // switches which login the app talks to — not just a UI preference.
  if ((typeof cgResolveAgent === 'function') && cgResolveAgent() === agent) { AI.account = accountId; aiSave(); }
  optsRenderAgentAccounts();
}
// The "default" checkbox is the single source of truth for which
// agent+account every AI feature uses, until per-feature routing lands.
function optsAgentSetDefault(agent, accountId) {
  AI.provider = agent;
  AI.account = accountId;
  _agentSel[agent] = accountId;
  aiSave();
  const provSel = document.getElementById('opt-ai-provider');
  if (provSel) provSel.value = agent;
  if (typeof optsUpdateAIModel === 'function') optsUpdateAIModel();
  mm_toast('Default AI: ' + agent + ' / ' + accountId, 'success', { dur: 2000 });
  optsRenderAgentAccounts();
}

async function optsRenderAgentAccounts() {
  const host = document.getElementById('ai-agent-accounts');
  if (!host) return;
  optsPopulateAccounts();
  if (!window.NXAPI?.cgStatusAll) {
    host.innerHTML = '<div class="opts-hint">Web agents need the Electron app (not browser mode).</div>';
    return;
  }
  let rows = [];
  try { rows = await window.NXAPI.cgStatusAll(_aiAllAccountPairs()); }
  catch (e) { host.innerHTML = '<div class="opts-hint">Could not read agent status: ' + escH(e.message) + '</div>'; return; }

  const activeAgent = (typeof cgResolveAgent === 'function') ? cgResolveAgent() : null;
  const byAgent = {};
  for (const r of rows) { (byAgent[r.agent] = byAgent[r.agent] || []).push(r); }

  host.innerHTML = Object.keys(byAgent).map(agent => {
    const accts = byAgent[agent];
    const label = accts[0].label, verified = accts[0].verified;
    const anyIn = accts.some(a => a.loggedIn === true);
    const sel = _agentSelected(agent, accts);
    const isDefault = (typeof cgResolveAgent === 'function') && cgResolveAgent() === agent && AI.account === sel;

    // Not signed in yet: one button, nothing else to manage.
    if (!anyIn) {
      return `
      <div style="border:1px solid var(--wire);border-left:2px solid var(--wire2);padding:11px 14px;
        background:var(--abyss);display:flex;align-items:center;gap:10px">
        <span style="font-family:var(--f-display);font-size:10px;font-weight:700;letter-spacing:1.5px;
          color:var(--muted)">${escH(label)}</span>
        ${verified ? '' : '<span style="font-family:var(--f-mono);font-size:7px;color:var(--o)">selectors unverified</span>'}
        <button class="opts-action-btn" style="margin-left:auto"
          onclick="optsAgentOpen('${agent}','${escH(accts[0].accountId)}')">Sign in to ${escH(label)}</button>
      </div>`;
    }

    // Signed in: status on the left stays put; all controls live on the right.
    const selRow = accts.find(a => a.accountId === sel) || accts[0];
    const st = selRow.loggedIn === true ? { t: 'signed in', c: 'var(--g,#00ff88)' }
             : selRow.running           ? { t: 'window open — NOT signed in', c: 'var(--o,#ff8c22)' }
                                        : { t: 'not opened yet', c: 'var(--dim)' };
    return `
      <div style="border:1px solid var(--wire);border-left:2px solid ${isDefault ? 'var(--c)' : 'var(--wire2)'};
        padding:11px 14px;background:var(--abyss);display:flex;align-items:center;gap:10px;flex-wrap:wrap;row-gap:8px">
        <span style="font-family:var(--f-display);font-size:10px;font-weight:700;letter-spacing:1.5px;
          color:${isDefault ? 'var(--c)' : 'var(--muted)'}">${escH(label)}</span>
        <span style="font-family:var(--f-mono);font-size:8px;color:${st.c}">${st.t}</span>
        ${verified ? '' : '<span style="font-family:var(--f-mono);font-size:7px;color:var(--o)">selectors unverified</span>'}

        <span style="margin-left:auto;display:flex;align-items:center;gap:7px;flex-wrap:wrap;row-gap:6px">
          <select class="opts-select" style="min-width:120px" title="Which ${escH(label)} account to use"
            onchange="optsAgentSelectAccount('${agent}', this.value)">
            ${accts.map(a => `<option value="${escH(a.accountId)}"${a.accountId === sel ? ' selected' : ''}>${escH(a.accountId)}</option>`).join('')}
          </select>
          <button class="opts-action-btn" onclick="optsTestAgent('${agent}','${escH(sel)}')">Test</button>
          <label style="display:flex;align-items:center;gap:5px;font-family:var(--f-mono);font-size:7.5px;
            color:${isDefault ? 'var(--c)' : 'var(--dim)'};cursor:pointer;white-space:nowrap"
            title="Use this agent/account for all AI features (until per-feature routing exists)">
            <input type="checkbox" ${isDefault ? 'checked' : ''} style="accent-color:var(--c);cursor:pointer"
              onchange="optsAgentSetDefault('${agent}','${escH(sel)}')"> default
          </label>
          <button class="opts-action-btn" onclick="optsAgentOpen('${agent}','${escH(sel)}')">Open</button>
          <button class="opts-action-btn" title="Add another ${escH(label)} account"
            onclick="optsAgentAddAnother('${agent}')">+</button>
          <button class="opts-action-btn danger" onclick="optsAgentSignOut('${agent}','${escH(sel)}')">Sign out</button>
        </span>
      </div>`;
  }).join('');
}

// silent=true suppresses toasts/prompts entirely — used for the automatic
// boot-time attempt, where a failure is a normal, expected outcome (the
// person may not even have clear-glass-lite installed) and shouldn't
// interrupt anyone. Interactive use (the Options button) always passes
// silent=false and gets the full feedback + paste-a-path fallback.
async function optsInstallBridgeUserscript(silent) {
  if (!window.NXAPI?.cgInstallUserscript) { if (!silent) mm_toast('Needs the Electron app', 'warn'); return; }

  // Already confirmed once — install straight there. No search, no ask.
  if (AI.clearglassUserscriptDir) {
    const r0 = await window.NXAPI.cgInstallUserscript(AI.clearglassUserscriptDir);
    if (r0 && r0.ok) {
      if (!silent) mm_toast('✓ Bridge updated at ' + AI.clearglassUserscriptDir, 'success', { dur: 3000 });
      return;
    }
    // The remembered path stopped working (moved/uninstalled) — fall
    // through and re-search rather than staying stuck on a dead path.
    AI.clearglassUserscriptDir = '';
    aiSave();
  }

  if (!silent) mm_toast('Looking for clear-glass-lite…', 'info', { dur: 1500 });
  const r = await window.NXAPI.cgInstallUserscript();
  if (r && r.ok) {
    const removed = r.installed.some(i => i.removedEravos);
    // Remember the first successful location so every future call —
    // including the next app boot — goes straight there.
    AI.clearglassUserscriptDir = r.installed[0].dir;
    aiSave();
    if (!silent) mm_toast('✓ Bridge installed to ' + r.installed.length + ' location' + (r.installed.length > 1 ? 's' : '') +
      (removed ? ' · removed the old ERAVOS bridge' : ''), 'success', { dur: 4000 });
    return;
  }
  if (silent) return;   // boot-time attempt: fail quietly, the Options button remains available
  // Say exactly where we looked — "not found" with no paths is useless.
  const searched = (r && r.searched) || [];
  await mmPrompt('Could not find a clear-glass-lite userscripts folder. Searched:\n\n' +
    searched.slice(0, 6).join('\n') + '\n\nPaste the correct folder path to install there:', '')
    .then(async (dir) => {
      if (!dir) return;
      const clean = dir.trim();
      const r2 = await window.NXAPI.cgInstallUserscript(clean);
      if (r2 && r2.ok) {
        // Persist the pasted path too — this is the last time anyone
        // should ever have to type it.
        AI.clearglassUserscriptDir = (r2.installed && r2.installed[0] && r2.installed[0].dir) || clean;
        aiSave();
      }
      mm_toast(r2 && r2.ok ? '✓ Installed to ' + clean + ' — remembered for next time' : '✗ ' + ((r2 && r2.error) || 'failed'), r2 && r2.ok ? 'success' : 'error', { dur: 4000 });
    });
}

async function optsAgentOpen(agent, accountId) {
  if (!window.NXAPI?.cgOpen) { mm_toast('Web agents need the Electron app', 'warn'); return; }
  await window.NXAPI.cgOpen(agent, accountId, true);
  mm_toast('Sign in if asked — the window closes itself once you are in', 'info', { dur: 3500 });
}

async function optsAgentAddAnother(agent) {
  const target = agent || ((typeof cgResolveAgent === 'function') ? cgResolveAgent() : 'chatgpt');
  const list = _aiAccountsFor(target);
  const name = (await mmPrompt('Name for the new ' + target + ' account (e.g. work, personal):', 'account' + (list.length + 1)) || '').trim();
  if (!name) return;
  if (list.includes(name)) { mm_toast('That account name already exists for ' + target, 'warn'); return; }
  list.push(name);
  if (target === ((typeof cgResolveAgent === 'function') ? cgResolveAgent() : null)) AI.account = name;
  aiSave();
  await optsAgentOpen(target, name);   // straight to its login window
  optsRenderAgentAccounts();
}

async function optsAgentSignOut(agent, accountId) {
  if (!(await mmConfirm('Sign out of ' + agent + ' / ' + accountId + '? Only this account\u2019s session is cleared.'))) return;
  const r = await window.NXAPI.cgSignOut(agent, accountId);
  mm_toast(r && r.ok ? 'Signed out' : 'Sign out failed: ' + ((r && r.error) || '?'), r && r.ok ? 'info' : 'error');
  optsRenderAgentAccounts();
}

// Per-agent/account connection test — the global Test Connection only
// ever exercised the active provider, which is useless for verifying
// an account you just added.
async function optsTestAgent(agent, accountId) {
  if (!window.NXAPI?.cgAsk) { mm_toast('Web agents need the Electron app', 'warn'); return; }
  const sid = typeof aiStatusStart === 'function' ? aiStatusStart('Connection test', { agent, account: accountId }) : null;
  try {
    const res = await window.NXAPI.cgAsk(agent, accountId, 'Reply only with the single word: CONNECTED', 60000, true);
    if (sid) aiStatusEnd(sid, !!(res && res.ok), res && res.error);
    if (res && res.ok) {
      const ok = /CONNECTED/i.test(res.text || '');
      const preview = (res.text || '').trim().slice(0, 80);
      mm_toast(ok ? '✓ ' + agent + '/' + accountId + ' connected — replied: "' + preview + '"' : '⚠ replied but not as expected: "' + preview + '"', ok ? 'success' : 'warn', { dur: 5000 });
    } else {
      mm_toast('✗ ' + ((res && res.error) || 'no result'), 'error', { dur: 6000 });
    }
  } catch (e) {
    if (sid) aiStatusEnd(sid, false, e.message);
    mm_toast('Test failed: ' + e.message, 'error', { dur: 6000 });
  }
  optsRenderAgentAccounts();
}

// The main process hides the window itself the moment sign-in lands;
// this just refreshes the panel and confirms it.
if (window.NXAPI?.onSignedIn) {
  window.NXAPI.onSignedIn((d) => {
    mm_toast('✓ Signed in to ' + d.agent + (d.accountId && d.accountId !== 'default' ? ' / ' + d.accountId : '') + ' — window closed', 'success', { dur: 3500 });
    optsRenderAgentAccounts();
  });
}

// Previously silent: the main-process sign-in watcher used to just stop
// after ~10 minutes with no signal at all, so a stalled sign-in looked
// identical to one still in progress. Now it tells us, and we tell you.
if (window.NXAPI?.onSignInTimeout) {
  window.NXAPI.onSignInTimeout((d) => {
    mm_toast('Sign-in to ' + d.agent + (d.accountId && d.accountId !== 'default' ? ' / ' + d.accountId : '') + ' timed out after 10 minutes — open it again if you still need to sign in', 'warn', { dur: 7000 });
    optsRenderAgentAccounts();
  });
}

function optsUpdateAIModel() {
  const sel = document.getElementById('opt-ai-provider');
  if (sel) AI.provider = sel.value;
  optsShowOllamaFields();
  // Update model dropdown for known providers
  const modelSel = document.getElementById('opt-ai-model');
  if (!modelSel) return;
  const models = {
    ollama:     AI.ollamaModels.length ? AI.ollamaModels : ['(run DETECT MODELS first)'],
    clearglass: ['(model selection lives in ClearGlass, not here)'],
  };
  const list = models[AI.provider] || [];
  modelSel.innerHTML = list.map(m => `<option value="${m}" ${m === AI.model ? 'selected' : ''}>${m}</option>`).join('');
  aiSave();
}

function optsAIGenerate() {
  const prompt = document.getElementById('opt-ai-prompt')?.value.trim();
  if (!prompt) { mm_toast('Enter a prompt first','warn'); return; }
  closeOptions();
  CANVAS.enterCanvas();
  setTimeout(() => aiSpawnFromPrompt(prompt), 300);
}

function optsAIAnalyze() {
  closeOptions();
  CANVAS.enterCanvas();
  setTimeout(() => aiAnalyzeCanvas(), 300);
}

/* ── Vault options helpers ───────────────────────────────────── */
function optsRefreshVault() {
  const el = document.getElementById('opts-vault-status'); if (!el) return;
  const meta = _authLoadMeta();

  // MM Vault stats
  const mmStats = (typeof MMVault !== 'undefined') ? MMVault.stats() : null;
  const mmMeta = (typeof MMVault !== 'undefined') ? MMVault.meta : null;

  el.innerHTML =
    'Encryption: <span style="color:' + (AUTH.encrypted ? 'var(--g)' : 'var(--dim)') + '">' + (AUTH.encrypted ? 'AES-256-GCM active' : 'disabled') + '</span><br>' +
    'Identity: <span style="color:var(--c)">' + escH(meta?.username || mmMeta?.username || '—') + '</span><br>' +
    (mmStats ? 'Vault ID: <span style="color:var(--dim);font-size:6.5px">' + escH((mmStats.vaultId||'').slice(0,18)) + '...</span><br>' : '') +
    (mmStats ? 'Size: <span style="color:var(--g)">' + mmStats.sizeKB + ' KB</span> &nbsp; Saves: <span style="color:var(--c)">' + mmStats.saveCount + '</span><br>' : '') +
    (mmStats ? 'Snapshots: <span style="color:var(--v)">' + mmStats.snapshotCount + '</span> &nbsp; Dirty: <span style="color:' + (mmStats.isDirty ? 'var(--y)' : 'var(--g)') + '">' + (mmStats.isDirty ? 'yes' : 'no') + '</span><br>' : '') +
    'Nodes: <span style="color:var(--c)">' + CANVAS.NX.nodes.length + '</span> &nbsp; ' +
    'Mode: <span style="color:var(--mid)">' + (window.NXAPI ? 'Electron' : 'Browser/localStorage') + '</span>';

  optsLoadSnapshots();
}

function optsLoadSnapshots() {
  const list = document.getElementById('opts-snapshots-list'); if (!list) return;
  if (typeof MMVault === 'undefined') { list.innerHTML = '<div style="color:var(--dim);font-family:var(--f-mono);font-size:7.5px;padding:8px">Foundation not loaded</div>'; return; }
  const snaps = MMVault.listSnapshots().reverse(); // newest first
  if (!snaps.length) {
    list.innerHTML = '<div style="color:var(--dim);font-family:var(--f-mono);font-size:7.5px;padding:8px">No snapshots yet — create one above</div>';
    return;
  }
  list.innerHTML = snaps.map(s => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--abyss);border:1px solid var(--wire);border-left:2px solid var(--v)">
      <div style="flex:1">
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--bright)">${escH(s.label)}</div>
        <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${fmtTS(s.ts)} · ${((s.size||0)/1024).toFixed(1)}KB</div>
      </div>
      <button onclick="optsRestoreSnapshot('${s.id}')" style="font-family:var(--f-mono);font-size:7px;padding:3px 8px;border:1px solid var(--c)44;color:var(--c);background:transparent;cursor:pointer">↺ Restore</button>
      <button onclick="optsDeleteSnapshot('${s.id}')" style="font-family:var(--f-mono);font-size:7px;padding:3px 8px;border:1px solid var(--r)44;color:var(--r);background:transparent;cursor:pointer">✕</button>
    </div>
  `).join('');
}

function optsCreateSnapshot() {
  if (typeof MMVault === 'undefined') { toast('Foundation not loaded'); return; }
  const label = document.getElementById('opts-snap-label')?.value.trim() || '';
  const snap = MMVault.snapshot(label || null, CANVAS.getState());
  if (snap) {
    if (typeof T!=='undefined') T.snapshotCreated(snap.label); else mm_toast('Snapshot: ' + snap.label,'success');
    if (document.getElementById('opts-snap-label')) document.getElementById('opts-snap-label').value = '';
    optsLoadSnapshots();
  } else {
    mm_toast('Snapshot failed · save first', 'warn');
  }
}

async function optsRestoreSnapshot(id) {
  if (typeof MMVault === 'undefined') return;
  if (!(await mmConfirm('Restore this snapshot? Current canvas will be replaced.'))) return;
  const appState = MMVault.restoreSnapshot(id);
  if (appState) {
    CANVAS.clearCanvas();
    (appState.nodes || []).forEach(n => CANVAS.spawnNode(n.type, n.x, n.y, n));
    (appState.conns || []).forEach(c => CANVAS.NX.conns.push({ ...c, _phase: Math.random() }));
    if (appState.viewport) { CANVAS.NX.zoom = appState.viewport.zoom || 1; CANVAS.NX.panX = appState.viewport.panX || 0; CANVAS.NX.panY = appState.viewport.panY || 0; CANVAS.applyT(); }
    if (typeof T!=='undefined') T.snapshotRestored('Snapshot'); else mm_toast('Snapshot restored','success');
    optsLoadSnapshots();
  } else {
    mm_toast('Snapshot restore failed', 'error');
  }
}

function optsDeleteSnapshot(id) {
  if (typeof MMVault === 'undefined') return;
  MMVault.deleteSnapshot(id);
  optsLoadSnapshots();
  mm_toast('Snapshot deleted', 'info');
}

function optsRunIntegrity() {
  if (typeof MMVault === 'undefined') { toast('Foundation not loaded'); return; }
  const el = document.getElementById('opts-integrity-result'); if (!el) return;
  el.innerHTML = '<span style="color:var(--dim)">Running...</span>';
  setTimeout(() => {
    const result = MMVault.checkIntegrity();
    const lines = result.checks.map(c =>
      `<div style="color:${c.pass ? 'var(--g)' : 'var(--r)'}">
        ${c.pass ? '✓' : '✗'} <span style="color:var(--bright)">${escH(c.name)}</span>
        ${c.msg ? ' — <span style="color:var(--o)">' + escH(c.msg) + '</span>' : ''}
        ${c.info ? ' <span style="color:var(--dim)">' + (Array.isArray(c.info) ? c.info.join(', ') : escH(String(c.info))) + '</span>' : ''}
      </div>`
    ).join('');
    el.innerHTML = `<div style="color:${result.ok ? 'var(--g)' : 'var(--r)'};font-weight:700;margin-bottom:6px">${result.ok ? '✓ ALL CHECKS PASSED' : '✗ ' + result.checks.filter(c=>!c.pass).length + ' ISSUES FOUND'}</div>` + lines;
    mm_toast(result.ok ? 'Integrity check passed ✓' : 'Integrity issues found', result.ok ? 'success' : 'error');
  }, 50);
}

function optsImportBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      if (typeof MMVault === 'undefined') { toast('Foundation not loaded'); return; }
      if (!(await mmConfirm('Import this backup? It will replace your current vault data.'))) return;
      const appState = MMVault.importBackup(ev.target.result);
      if (appState) {
        CANVAS.clearCanvas();
        (appState.nodes || []).forEach(n => CANVAS.spawnNode(n.type, n.x, n.y, n));
        (appState.conns || []).forEach(c => CANVAS.NX.conns.push({ ...c, _phase: Math.random() }));
        if (appState.viewport) { CANVAS.NX.zoom = appState.viewport.zoom || 1; CANVAS.NX.panX = appState.viewport.panX || 0; CANVAS.NX.panY = appState.viewport.panY || 0; CANVAS.applyT(); }
        if (typeof T!=='undefined') T.backupImported(); else mm_toast('Backup imported','success');
        optsRefreshVault();
      } else {
        mm_toast('Import failed · invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/* ── Foundation tab functions ──────────────────────────────────────── */

function optsRefreshFoundation() {
  // Registry stats
  const regEl = document.getElementById('opts-registry-stats');
  if (regEl && typeof MMRegistry !== 'undefined') {
    const s = MMRegistry.stats();
    regEl.innerHTML = Object.entries(s.types).map(([t, n]) =>
      `${t}: <span style="color:var(--c)">${n}</span>`
    ).join(' &nbsp; ') + `<br>Total: <span style="color:var(--c)">${s.total}</span> entries &nbsp; Alive: <span style="color:var(--g)">${s.alive}</span>`;
  }

  // Delta stats
  const deltaEl = document.getElementById('opts-delta-stats');
  if (deltaEl && typeof MMDelta !== 'undefined') {
    const s = MMDelta.stats();
    const topActions = Object.entries(s.byAction).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([a,n])=>`${a}: <span style="color:var(--o)">${n}</span>`).join(' &nbsp; ');
    deltaEl.innerHTML = `Total: <span style="color:var(--o)">${s.total}</span> &nbsp; Sessions: <span style="color:var(--c)">${s.sessions}</span><br>${topActions}`;
  }

  // Tag stats
  const tagEl = document.getElementById('opts-tag-stats');
  if (tagEl && typeof MMTags !== 'undefined') {
    const s = MMTags.stats();
    const top = MMTags.topTags(6).map(t => `<span style="color:${t.color}">${escH(t.name)}</span> (${t.count})`).join(' &nbsp; ');
    const byCat = Object.entries(s.byCategory).map(([c,n])=>`${c}: <span style="color:var(--c)">${n}</span>`).join(' &nbsp; ');
    tagEl.innerHTML = `Total: <span style="color:var(--v)">${s.total}</span> tags &nbsp; Tagged entities: <span style="color:var(--c)">${s.entityCount}</span><br><span style="color:var(--dim)">By cat: </span>${byCat}<br><span style="color:var(--dim)">Top: </span>${top}`;
  }

  // Foundation status
  const fsEl = document.getElementById('opts-foundation-status');
  if (fsEl) {
    const parts = [];
    if (typeof MMRegistry !== 'undefined') parts.push(`Registry <span style="color:var(--g)">✓</span>`);
    if (typeof MMDelta !== 'undefined')    parts.push(`Delta <span style="color:var(--g)">✓</span>`);
    if (typeof MMTags !== 'undefined')     parts.push(`Tags <span style="color:var(--g)">✓</span>`);
    if (typeof MMDomains !== 'undefined')  parts.push(`Domains <span style="color:var(--g)">✓</span>`);
    if (typeof MMVault !== 'undefined')    parts.push(`Vault <span style="color:var(--g)">✓</span>`);
    if (typeof MMLog !== 'undefined')      parts.push(`Log <span style="color:var(--g)">✓</span>`);
    if (typeof MMRipple !== 'undefined')   parts.push(`Ripple <span style="color:var(--g)">✓</span>`);
    if (typeof MMDiag !== 'undefined')     parts.push(`Diag <span style="color:var(--g)">✓</span>`);
    fsEl.innerHTML = parts.join(' &nbsp; ') || '<span style="color:var(--r)">Foundation not loaded</span>';
  }

  optsRefreshLog();
}

async function optsRunDiag(module) {
  const container = document.getElementById('opts-diag-results'); if (!container) return;
  if (typeof MMDiag === 'undefined') { container.innerHTML = '<div style="color:var(--r);font-family:var(--f-mono);font-size:8px;padding:8px">Foundation not loaded</div>'; return; }
  container.innerHTML = '<div style="color:var(--dim);font-family:var(--f-mono);font-size:7.5px;padding:8px">Running diagnostics...</div>';
  const result = await MMDiag.runAll(module ? { module } : {});
  const summary = `<div style="color:${result.fail === 0 ? 'var(--g)' : 'var(--r)'};font-family:var(--f-mono);font-size:8px;padding:6px 8px;background:${result.fail === 0 ? 'rgba(0,255,136,.06)' : 'rgba(255,51,85,.06)'};border-bottom:1px solid var(--wire)">
    ${result.fail === 0 ? '✓ ALL ' + result.pass + ' CHECKS PASSED' : '✗ ' + result.fail + ' FAILED · ' + result.pass + ' PASSED'}
  </div>`;
  const rows = result.results.map(r => {
    const passColor = r.pass ? 'var(--g)' : 'var(--r)';
    const nameColor = r.pass ? 'var(--bright)' : 'var(--o)';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 8px;border-bottom:1px solid rgba(24,40,64,.3)">
      <span style="color:${passColor};width:10px;flex-shrink:0">${r.pass ? '✓' : '✗'}</span>
      <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim);min-width:55px">[${escH(r.module)}]</span>
      <span style="font-family:var(--f-mono);font-size:7.5px;color:${nameColor};flex:1">${escH(r.name)}</span>
      ${r.info ? `<span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${escH(String(r.info).slice(0,30))}</span>` : ''}
      ${r.msg && !r.pass ? `<span style="font-family:var(--f-mono);font-size:6.5px;color:var(--r)">${escH(r.msg.slice(0,40))}</span>` : ''}
    </div>`;
  }).join('');
  container.innerHTML = summary + rows;
  mm_toast(result.fail===0 ? `All ${result.pass} diagnostics passed ✓` : `${result.fail} diagnostic${result.fail>1?'s':''} failed`, result.fail===0?'success':'error');
}

function optsRefreshLog() {
  const container = document.getElementById('opts-log-display'); if (!container) return;
  if (typeof MMLog === 'undefined') { container.innerHTML = '<div style="color:var(--dim);font-size:7.5px;padding:8px;font-family:var(--f-mono)">Logger not loaded</div>'; return; }
  const levelFilter = document.getElementById('opts-log-filter')?.value || '';
  const moduleFilter = document.getElementById('opts-log-module')?.value || '';
  const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 };
  let entries = MMLog.recent(200);
  if (levelFilter) entries = entries.filter(e => (LEVEL_ORDER[e.level] || 0) >= (LEVEL_ORDER[levelFilter] || 0));
  if (moduleFilter) entries = entries.filter(e => e.module === moduleFilter);
  entries = entries.slice(0, 80);
  const levelColor = l => l === 'error' || l === 'critical' ? 'var(--r)' : l === 'warn' ? 'var(--o)' : l === 'info' ? 'var(--c)' : 'var(--dim)';
  container.innerHTML = entries.length ? entries.map(e =>
    `<div style="display:flex;gap:6px;align-items:baseline;padding:3px 6px;border-bottom:1px solid rgba(24,40,64,.2)">
      <span style="color:var(--dim);font-size:6px;flex-shrink:0;min-width:42px">${fmtTime(e.ts)}</span>
      <span style="color:${levelColor(e.level)};font-size:6.5px;min-width:32px;flex-shrink:0">${e.level.slice(0,4).toUpperCase()}</span>
      <span style="color:var(--dim);font-size:6px;min-width:40px;flex-shrink:0">[${escH(e.module||'')}]</span>
      <span style="color:var(--bright);font-size:7px;flex:1">${escH(e.msg)}</span>
    </div>`
  ).join('') : '<div style="color:var(--dim);font-size:7.5px;padding:12px;font-family:var(--f-mono);text-align:center">No log entries</div>';
}

function optsCopyFullLog() {
  if (typeof MMLog === 'undefined') { mm_toast('Logger not loaded', 'error'); return; }
  // Full export, not the 80-entry/truncated display view — includes
  // stack traces for uncaught errors, which the on-screen list doesn't
  // show at all (no room for them in a one-line row).
  const entries = MMLog.export();
  const text = entries.map(e => {
    const stack = e.data?.stack ? `\n    ${e.data.stack.replace(/\n/g, '\n    ')}` : '';
    const dataStr = e.data && !e.data.stack ? ' ' + JSON.stringify(e.data) : '';
    return `[${e.iso}] ${e.level.toUpperCase().padEnd(8)} [${e.module}] ${e.msg}${dataStr}${stack}`;
  }).join('\n');

  const header = `MASTERMIND Application Log — ${entries.length} entries — exported ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
  const fullText = header + text;

  navigator.clipboard.writeText(fullText).then(() => {
    mm_toast(`✓ Copied ${entries.length} log entries to clipboard`, 'success');
  }).catch(() => {
    // Clipboard access can be blocked depending on Electron/OS focus
    // state — fall back to a visible, selectable textarea so the text
    // is still recoverable by hand (select all, copy) instead of the
    // export silently failing.
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:5000;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;padding:40px';
    modal.innerHTML = `
      <div style="background:var(--void);border:1px solid var(--wire2);width:100%;max-width:800px;max-height:80vh;display:flex;flex-direction:column;padding:16px">
        <div style="font-family:var(--f-mono);font-size:9px;color:var(--o);margin-bottom:8px">
          Clipboard access was blocked — select all the text below and copy manually (Ctrl+A, Ctrl+C)
        </div>
        <textarea readonly style="flex:1;min-height:400px;background:#000;color:var(--bright);font-family:var(--f-mono);font-size:8px;border:1px solid var(--wire2);padding:10px">${fullText}</textarea>
        <button class="opts-action-btn" style="margin-top:8px;align-self:flex-end" onclick="this.closest('div[style*=fixed]').remove()">Close</button>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('textarea').select();
  });
}

let _busMonitorActive = false;
let _busMonitorUnsub = null;
let _busLog = [];
function optsToggleBusMonitor() {
  const btn = document.getElementById('opts-bus-btn');
  const display = document.getElementById('opts-bus-monitor');
  if (_busMonitorActive) {
    if (_busMonitorUnsub) { _busMonitorUnsub(); _busMonitorUnsub = null; }
    _busMonitorActive = false;
    if (btn) btn.textContent = '▶ Start Monitor';
  } else {
    _busLog = [];
    _busMonitorActive = true;
    if (btn) btn.textContent = '■ Stop Monitor';
    _busMonitorUnsub = _MM_BUS.on('*', ({ event, data }) => {
      _busLog.unshift(`<span style="color:var(--c)">${escH(event)}</span>`);
      if (_busLog.length > 20) _busLog.pop();
      if (display) display.innerHTML = _busLog.join('<br>');
    });
  }
}

function optsRefreshHorizon() {
  const summary = document.getElementById('otab-horizon-summary');
  const planList = document.getElementById('otab-horizon-plans');
  if (!summary && !planList) return;

  if (!HORIZON_STATE._loaded) horizonLoad();
  const plans = HORIZON_STATE.plans;

  if (summary) {
    const totalConditions = plans.reduce((s, p) => s + p.conditions.length, 0);
    const totalMilestones = plans.reduce((s, p) => s + p.milestones.length, 0);
    const doneMilestones = plans.reduce((s, p) => s + p.milestones.filter(m => m.done).length, 0);
    summary.innerHTML =
      `Plans: <span style="color:var(--c)">${plans.length}</span> &nbsp; ` +
      `Conditions: <span style="color:var(--v)">${totalConditions}</span> &nbsp; ` +
      `Milestones: <span style="color:var(--g)">${doneMilestones}/${totalMilestones}</span>`;
  }

  if (planList) {
    if (!plans.length) {
      planList.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:12px;text-align:center">No plans yet</div>';
      return;
    }
    planList.innerHTML = plans.map(p => {
      const pct = p.milestones.length
        ? Math.round(p.milestones.filter(m => m.done).length / p.milestones.length * 100) : 0;
      return `
        <div onclick="openHorizon();closeOptions();setTimeout(()=>horizonSelectPlan('${p.id}'),200)"
          style="padding:10px 12px;border:1px solid var(--wire);border-left:2px solid #d4a820;
            cursor:pointer;transition:background .12s"
          onmouseenter="this.style.background='var(--lift)'"
          onmouseleave="this.style.background=''">
          <div style="font-family:var(--f-body);font-size:10px;font-weight:600;
            color:var(--bright);margin-bottom:4px">${escH(p.title)}</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-family:var(--f-mono);font-size:6.5px;color:#d4a820;
              border:1px solid #d4a82044;padding:1px 5px">${escH(p.timeframe)}</span>
            ${p.milestones.length ? `
              <div style="flex:1;height:3px;background:var(--wire);overflow:hidden">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#d4a820,#ffe04a)"></div>
              </div>
              <span style="font-family:var(--f-mono);font-size:6px;color:#d4a820">${pct}%</span>
            ` : `<span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${p.conditions.length} conditions</span>`}
          </div>
        </div>`;
    }).join('');
  }
}





/* ═══════════════════════════════════════════════════════════════════
   MODULE: domain-taxonomy — Meta-domains → Domains → Sub-domains
   ID: module:domains
   
   Three recursive levels:
   1. Meta-domains  (broadest — e.g. SCIENCE, ARTS, SOCIAL)
   2. Domains       (e.g. PHYSICS, MUSIC, PSYCHOLOGY)
   3. Sub-domains   (e.g. Quantum, Jazz, Cognitive)
   
   Each domain links to intelligence types for cross-domain stats.
   Intelligence types (Gardner + extended):
     logical-mathematical, linguistic, spatial, musical,
     bodily-kinesthetic, interpersonal, intrapersonal, naturalist,
     existential, creative, systems, emotional, embodied
═══════════════════════════════════════════════════════════════════ */

const DOMAIN_TAXONOMY = {
  'SCIENCE & SYSTEMS': {
    color: '#00c8ff', icon: '◈',
    intelligences: ['logical-mathematical','systems','naturalist'],
    domains: {
      'Physics':         { color:'#00c8ff', subs:['Quantum','Classical','Thermodynamics','Relativity','Optics','Electromagnetism','Particle','Astrophysics','Condensed Matter','Biophysics'] },
      'Mathematics':     { color:'#11ddcc', subs:['Pure','Applied','Statistics','Number Theory','Topology','Geometry','Algebra','Analysis','Combinatorics','Chaos Theory'] },
      'Biology':         { color:'#00ff88', subs:['Molecular','Cell Biology','Genetics','Ecology','Evolution','Neurobiology','Microbiology','Botany','Zoology','Epigenetics'] },
      'Chemistry':       { color:'#ffe04a', subs:['Organic','Inorganic','Physical','Biochemistry','Polymer','Electrochemistry','Thermochemistry','Quantum Chemistry'] },
      'Computer Science':{ color:'#cc44ff', subs:['Algorithms','AI/ML','Systems','Networks','Cryptography','HCI','Distributed','Theory','Compilers','Security'] },
      'Neuroscience':    { color:'#ff66aa', subs:['Cognitive','Computational','Behavioral','Developmental','Clinical','Systems Neuro','Neurochemistry','Plasticity'] },
      'Systems Theory':  { color:'#7744ff', subs:['Cybernetics','Complexity','Control Theory','Information Theory','Network Science','Emergence','Self-Organization'] },
      'Ecology':         { color:'#00ff88', subs:['Population','Community','Ecosystem','Evolutionary','Restoration','Marine','Terrestrial','Urban'] },
    }
  },
  'ARTS & EXPRESSION': {
    color: '#cc44ff', icon: '◉',
    intelligences: ['musical','spatial','linguistic','creative','bodily-kinesthetic'],
    domains: {
      'Music':           { color:'#cc44ff', subs:['Composition','Performance','Theory','Production','Jazz','Classical','Electronic','Improvisation','Rhythm','Harmony'] },
      'Visual Art':      { color:'#ff66aa', subs:['Drawing','Painting','Sculpture','Digital','Photography','Illustration','Installation','Conceptual','Abstract','Realism'] },
      'Design':          { color:'#d4a820', subs:['UX/UI','Graphic','Industrial','Interior','Typography','Motion','Systems Design','Service','Brand','Interaction'] },
      'Writing':         { color:'#00c8ff', subs:['Fiction','Non-fiction','Poetry','Screenwriting','Journalism','Technical','Copywriting','Philosophy of Language'] },
      'Film & Media':    { color:'#ff8c22', subs:['Narrative','Documentary','Animation','Cinematography','Editing','Sound Design','Game Design','Podcasting'] },
      'Architecture':    { color:'#7744ff', subs:['Structural','Spatial','Urban','Landscape','Parametric','Vernacular','Sustainable','Interior'] },
      'Performance':     { color:'#ff3355', subs:['Theater','Dance','Comedy','Improvisation','Spoken Word','Street Art','Circus','Opera'] },
    }
  },
  'SOCIAL & RELATIONAL': {
    color: '#00ff88', icon: '⬡',
    intelligences: ['interpersonal','linguistic','emotional','existential'],
    domains: {
      'Psychology':      { color:'#00ff88', subs:['Cognitive','Behavioral','Developmental','Clinical','Social','Positive','Jungian','Evolutionary','Personality','Neuropsych'] },
      'Philosophy':      { color:'#11ddcc', subs:['Ethics','Epistemology','Ontology','Logic','Political','Aesthetics','Philosophy of Mind','Metaphysics','Phenomenology'] },
      'Sociology':       { color:'#00c8ff', subs:['Social Structures','Culture','Institutions','Inequality','Identity','Movements','Organizations','Community'] },
      'Anthropology':    { color:'#d4a820', subs:['Cultural','Physical','Archaeological','Linguistic','Cognitive','Medical','Digital'] },
      'Communication':   { color:'#ff66aa', subs:['Rhetoric','Nonverbal','Interpersonal','Mass Media','Digital','Cross-cultural','Persuasion','Narrative'] },
      'Economics':       { color:'#ffe04a', subs:['Micro','Macro','Behavioral','Game Theory','Development','Political Economy','Complexity','Labor','Finance'] },
      'Political Science':{ color:'#ff8c22', subs:['Theory','Comparative','International','Public Policy','Governance','Democracy','Power','Conflict'] },
    }
  },
  'MIND & COGNITION': {
    color: '#ff8c22', icon: '∿',
    intelligences: ['logical-mathematical','intrapersonal','spatial','systems','emotional'],
    domains: {
      'Cognitive Science':    { color:'#ff8c22', subs:['Perception','Attention','Memory','Language','Reasoning','Decision-Making','Consciousness','Mental Models'] },
      'Learning & Education': { color:'#ffe04a', subs:['Pedagogy','Skill Acquisition','Meta-Learning','Motivation','Transfer','Feedback','Deliberate Practice'] },
      'Creativity':           { color:'#cc44ff', subs:['Divergent Thinking','Analogical Reasoning','Incubation','Insight','Flow','Creative Process','Innovation'] },
      'Intelligence':         { color:'#00c8ff', subs:['IQ','Emotional','Social','Creative','Practical','Analytical','Fluid','Crystallized','Multiple Intelligences'] },
      'Consciousness':        { color:'#7744ff', subs:['Phenomenology','Altered States','Self-Awareness','Qualia','Integration','Nondual','Attention'] },
      'Epistemology':         { color:'#11ddcc', subs:['Knowledge','Belief','Justification','Truth','Perception','Rationalism','Empiricism','Skepticism'] },
      'Decision Theory':      { color:'#ff3355', subs:['Rational Choice','Heuristics','Biases','Risk','Uncertainty','Prospect Theory','Bayesian','Satisficing'] },
    }
  },
  'BODY & EMBODIMENT': {
    color: '#00ff88', icon: '◆',
    intelligences: ['bodily-kinesthetic','naturalist','embodied','intrapersonal'],
    domains: {
      'Movement':         { color:'#00ff88', subs:['Martial Arts','Dance','Athletics','Yoga','Somatic','Gymnastics','Parkour','Feldenkrais','Alexander Technique'] },
      'Health & Medicine': { color:'#11ddcc', subs:['Clinical','Preventive','Integrative','Neurology','Psychiatry','Physiology','Immunology','Nutrition','Sports Medicine'] },
      'Somatic Psychology':{ color:'#ff66aa', subs:['Polyvagal Theory','Embodied Cognition','Trauma','Body-Mind','Sensorimotor','Breathwork','Interoception'] },
      'Performance':      { color:'#ff8c22', subs:['Sports Science','Peak State','Recovery','Mental Game','Zone','Flow','Tactical','Skill Transfer'] },
      'Nutrition':        { color:'#d4a820', subs:['Metabolic','Gut-Brain','Chronobiology','Microbiome','Fasting','Adaptation','Biochemistry'] },
    }
  },
  'STRATEGY & SYSTEMS': {
    color: '#ffe04a', icon: '→',
    intelligences: ['logical-mathematical','systems','spatial','interpersonal'],
    domains: {
      'Strategy':         { color:'#ffe04a', subs:['Game Theory','Military','Business','Competitive','Adaptive','Scenario Planning','Systems Thinking','Meta-Strategy'] },
      'Innovation':       { color:'#ff8c22', subs:['Design Thinking','First Principles','Disruptive','Open Innovation','Lean','Biomimicry','Cross-Domain','Recombination'] },
      'Leadership':       { color:'#cc44ff', subs:['Transformational','Servant','Adaptive','Distributed','Organizational','Influence','Motivation','Vision'] },
      'Entrepreneurship': { color:'#00ff88', subs:['Lean Startup','Fundraising','Product-Market Fit','Scaling','Network Effects','Business Models','Pivoting'] },
      'Systems Design':   { color:'#00c8ff', subs:['Architecture','Feedback Loops','Resilience','Optimization','Emergence','Constraints','Modeling'] },
      'Project Management':{ color:'#7744ff', subs:['Agile','Waterfall','OKRs','Risk','Stakeholders','Kanban','Critical Path','Estimation'] },
      'Operations':       { color:'#d4a820', subs:['Supply Chain','Process','Quality','Logistics','Automation','Lean','Six Sigma','Coordination'] },
    }
  },
  'TECHNOLOGY': {
    color: '#7744ff', icon: '⊞',
    intelligences: ['logical-mathematical','spatial','systems','creative'],
    domains: {
      'Software Engineering': { color:'#7744ff', subs:['Frontend','Backend','DevOps','Architecture','APIs','Testing','Performance','Security','Mobile','Embedded'] },
      'Artificial Intelligence':{ color:'#cc44ff', subs:['Machine Learning','Deep Learning','NLP','Computer Vision','Reinforcement Learning','Generative AI','AI Safety','Reasoning'] },
      'Data Science':     { color:'#00c8ff', subs:['Statistics','Visualization','Pipelines','Feature Engineering','Modeling','Forecasting','Causal Inference','A/B Testing'] },
      'Hardware':         { color:'#ff8c22', subs:['Electronics','FPGA','IoT','Robotics','Semiconductors','Embedded Systems','PCB Design','Sensors'] },
      'Networks':         { color:'#00ff88', subs:['Protocols','Security','P2P','Distributed','Cloud','Edge Computing','Mesh','Topology'] },
      'Cybersecurity':    { color:'#ff3355', subs:['Offensive','Defensive','Cryptography','Threat Modeling','Forensics','Privacy','Zero Trust','Social Engineering'] },
    }
  },
  'NATURE & COSMOS': {
    color: '#d4a820', icon: '✦',
    intelligences: ['naturalist','spatial','logical-mathematical','existential'],
    domains: {
      'Astronomy':        { color:'#d4a820', subs:['Cosmology','Planetary','Stellar','Galactic','Exoplanets','Observational','Radio','Gravitational Waves'] },
      'Earth Science':    { color:'#00ff88', subs:['Geology','Climatology','Oceanography','Hydrology','Volcanology','Geophysics','Soil Science'] },
      'Ecology':          { color:'#11ddcc', subs:['Conservation','Biomes','Food Webs','Keystone Species','Restoration','Climate Adaptation','Biodiversity'] },
      'Philosophy of Nature':{ color:'#cc44ff', subs:['Panpsychism','Emergence','Complexity','Process Philosophy','Deep Ecology','Gaia'] },
      'Weather & Climate':{ color:'#00c8ff', subs:['Meteorology','Atmospheric Science','Climate Change','Paleoclimatology','Modeling','Extreme Events'] },
    }
  },
  'SPIRIT & MEANING': {
    color: '#ff66aa', icon: '◎',
    intelligences: ['existential','intrapersonal','interpersonal','creative'],
    domains: {
      'Philosophy of Mind':   { color:'#ff66aa', subs:['Consciousness','Identity','Free Will','Qualia','Phenomenology','Functionalism','Panpsychism'] },
      'Spirituality':         { color:'#cc44ff', subs:['Meditation','Contemplation','Non-dual Awareness','Flow','Presence','Integration','Shadow Work'] },
      'Mythology & Story':    { color:'#d4a820', subs:['Archetypes','Hero Journey','Cosmology','Symbol','Ritual','Narrative','Cultural Memory'] },
      'Ethics & Values':      { color:'#00ff88', subs:['Virtue Ethics','Consequentialism','Deontology','Care Ethics','Meta-Ethics','Applied Ethics','Political Philosophy'] },
      'Meaning Making':       { color:'#ff8c22', subs:['Existentialism','Logotherapy','Post-traumatic Growth','Purpose','Values Clarification','Ikigai','Narrative Identity'] },
    }
  },
};

const INTELLIGENCE_TYPES = {
  'logical-mathematical': { label:'Logical-Mathematical', icon:'◈', color:'#00c8ff', desc:'Reasoning, patterns, numbers, logic' },
  'linguistic':           { label:'Linguistic',           icon:'⬡', color:'#00ff88', desc:'Words, language, writing, rhetoric' },
  'spatial':              { label:'Spatial',              icon:'⊞', color:'#cc44ff', desc:'Visualization, maps, design, geometry' },
  'musical':              { label:'Musical',              icon:'∿', color:'#ff66aa', desc:'Rhythm, tone, melody, sound patterns' },
  'bodily-kinesthetic':   { label:'Bodily-Kinesthetic',   icon:'◆', color:'#00ff88', desc:'Movement, touch, body intelligence' },
  'interpersonal':        { label:'Interpersonal',        icon:'⬢', color:'#ff8c22', desc:'Reading people, collaboration, empathy' },
  'intrapersonal':        { label:'Intrapersonal',        icon:'◉', color:'#7744ff', desc:'Self-awareness, inner life, metacognition' },
  'naturalist':           { label:'Naturalist',           icon:'✦', color:'#d4a820', desc:'Pattern recognition in nature, classification' },
  'existential':          { label:'Existential',          icon:'∞', color:'#ff3355', desc:'Meaning, cosmos, life & death, spirit' },
  'creative':             { label:'Creative',             icon:'◈', color:'#cc44ff', desc:'Novel combinations, divergent thinking, imagination' },
  'systems':              { label:'Systems',              icon:'→', color:'#ffe04a', desc:'Interconnection, feedback, emergence, leverage' },
  'emotional':            { label:'Emotional',            icon:'⚡', color:'#ff3355', desc:'Emotion regulation, resonance, somatic wisdom' },
  'embodied':             { label:'Embodied',             icon:'▾', color:'#00ff88', desc:'Body-mind integration, somatic knowing, presence' },
};

// Domain populate state
const DOMAIN_STATE = {
  id: 'module:domains',
  selectedMeta: new Set(),
  selectedDomains: new Set(),
  selectedSubs: new Set(),
  customDomains: [],            // user-added custom domains
  intelligenceRatings: {},       // { [intelligence_type]: 0-100 } — automatic by default, see intelligenceOverrides
  intelligenceOverrides: {},     // { [intelligence_type]: true } — keys a person deliberately hand-set; the automatic sync skips these instead of silently overwriting a real choice
  populatedNodes: [],            // ids of nodes added via populate
};
const DOMAIN_KEY = 'nexus_domain_state';

function domainStateLoad() {
  // SECURITY FIX: this read localStorage['nexus_domain_state'] and could
  // clobber correctly-decrypted vault state with a stale plaintext copy
  // — vaultDeserialize() (mastermind-vault.js, modules.domain) already
  // covers DOMAIN_STATE in full. Vault-only now; see _ORPHAN_KEYS for
  // recovering any pre-fix copy.
  DOMAIN_STATE._loaded = true;
}

function domainStateSave() {
  // SECURITY FIX: this used to ALSO write localStorage['nexus_domain_state']
  // in plaintext, in parallel with the vault, on every change. The vault
  // is the only store now (modules.domain already covers it in full).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(5000);
}

/* ── Brain Map popup — scratch vs known domains ─────────────── */
function openBrainMap() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'brain' });
  domainStateLoad();
  bmv2Load();
  // Open overlay — always show MODE SELECTOR first
  const overlay = document.getElementById('brain-overlay');
  overlay.classList.add('open');
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  // Show mode selector, hide full map
  const sel = document.getElementById('brain-mode-selector');
  const sub = document.getElementById('brain-relsys-selector');
  const full = document.getElementById('brain-full-view');
  if (sel) sel.style.display = 'flex';
  if (sub) sub.style.display = 'none';
  if (full) { full.style.display = 'none'; full.classList.remove('active'); }
  // Pre-populate sidebar so domains show immediately when full map opens
  requestAnimationFrame(() => {
    if (typeof _bmUpdateSidebar === 'function') _bmUpdateSidebar();
  });
}

function brainEnterMode(modeKey) {
  // These take you to the real canvas now, not the abstract domain-map
  // globe — the globe is still there, just reachable separately via
  // "OPEN FULL MAP" (brainSkipModeSelect) instead of being where every
  // mode card dead-ends.
  const MODE_META = {
    cognitive:     { label: 'Cognitive',          color: '#00c8ff' },
    systems:       { label: 'Systems',             color: '#11ddcc' },
    ecosystems:    { label: 'Ecosystems',          color: '#00ff88' },
    emotions:      { label: 'Emotions',            color: '#ff66aa' },
  };
  const m = MODE_META[modeKey] || { label: 'Brain Map', color: 'var(--c)' };

  // Seed canvas with mode-relevant nodes, at the current viewport center —
  // so they're already on-screen the moment the canvas shows. If this
  // mode was already entered before, seeding is skipped and we get the
  // existing hub back instead, so we can still focus on it either way.
  const hub = _brainModeSeedCanvas(modeKey);

  // Still expand the matching meta-domain in BMV2 state, so if/when the
  // user opens the full domain-map later, this mode's content is already
  // expanded there too — continuity between the two views, not a reset.
  const modeToMeta = {
    cognitive:     'MIND & COGNITION',
    systems:       'SCIENCE & SYSTEMS',
    ecosystems:    'SOCIAL & RELATIONAL',
    emotions:      'SPIRIT & MEANING',
  };
  const autoExpand = modeToMeta[modeKey];
  if (autoExpand && typeof BMV2 !== 'undefined') {
    BMV2._expanded.add(autoExpand);
    if (typeof _bmCacheInvalidate === 'function') _bmCacheInvalidate();
  }

  // Close the brain overlay and drop straight into the real canvas,
  // centered on this mode's hub node so a repeat visit doesn't land you
  // on an empty patch of canvas the content happens not to be on.
  //
  // Hiding this synchronously (not via closeBrainMap's animated fade) is
  // deliberate: closeBrainMap() only fades opacity and leaves the overlay
  // at display:flex, full-screen, z-index:3000 for 350ms — fine when
  // you're closing back to the same screen, but here we're jumping
  // straight to the canvas, so for that whole 350ms the invisible overlay
  // was still sitting on top catching every click before it could reach
  // a node underneath. That's almost certainly what "can't interact with
  // anything" was actually seeing.
  const overlay = document.getElementById('brain-overlay');
  if (overlay) { overlay.classList.remove('open'); overlay.style.display = ''; overlay.style.opacity = ''; }
  if (typeof _brainRAF !== 'undefined' && _brainRAF) { cancelAnimationFrame(_brainRAF); _brainRAF = null; }
  if (typeof BMV2 !== 'undefined' && BMV2._raf) { cancelAnimationFrame(BMV2._raf); BMV2._raf = null; }
  enterCanvas();
  if (hub) {
    const el = document.getElementById('n_' + hub.id);
    const w = el ? el.offsetWidth : 220, h = el ? el.offsetHeight : 120;
    CANVAS.NX.zoom = 1;
    CANVAS.NX.panX = window.innerWidth / 2 - (hub.x + w / 2);
    CANVAS.NX.panY = (window.innerHeight - 38) / 2 - (hub.y + h / 2);
    CANVAS.applyT();
    CANVAS.selectNode(hub.id);
  }

  MMLog?.info('brain', `Mode entered: ${modeKey}`);
  if (typeof T !== 'undefined') T.brainModeEntered(m.label);
}

function brainOpenRelSysSelector() {
  const sel = document.getElementById('brain-mode-selector');
  const sub = document.getElementById('brain-relsys-selector');
  if (sel) sel.style.display = 'none';
  if (sub) sub.style.display = 'flex';
}

function brainRelSysBack() {
  const sel = document.getElementById('brain-mode-selector');
  const sub = document.getElementById('brain-relsys-selector');
  if (sub) sub.style.display = 'none';
  if (sel) sel.style.display = 'flex';
}

function brainSkipModeSelect() {
  // Open full map without mode seeding
  const sel = document.getElementById('brain-mode-selector');
  const sub = document.getElementById('brain-relsys-selector');
  const full = document.getElementById('brain-full-view');
  if (sel) sel.style.display = 'none';
  if (sub) sub.style.display = 'none';
  if (full) { full.style.display = 'flex'; full.classList.add('active'); }
  const titleEl = document.getElementById('brain-mode-title');
  if (titleEl) { titleEl.textContent = 'BRAIN MAP — MASTER INDEX'; titleEl.style.color = ''; }
  setTimeout(() => {
    initBrainMap();
    requestAnimationFrame(() => {
      if (typeof _bmUpdateSidebar === 'function') _bmUpdateSidebar();
      if (typeof _bmBuildManagePanel === 'function') _bmBuildManagePanel();
      if (typeof _bmBuildCrossdomainPanel === 'function') _bmBuildCrossdomainPanel();
    });
  }, 80);
}

function brainBackToModeSelect() {
  // Return to mode selector from full map
  const sel = document.getElementById('brain-mode-selector');
  const sub = document.getElementById('brain-relsys-selector');
  const full = document.getElementById('brain-full-view');
  if (full) { full.style.display = 'none'; full.classList.remove('active'); }
  if (sub) sub.style.display = 'none';
  if (sel) sel.style.display = 'flex';
}

function _openBrainMapDirect() {
  // Legacy — now routes through brainSkipModeSelect
  const overlay = document.getElementById('brain-overlay');
  overlay.classList.add('open');
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  brainSkipModeSelect();
}

function brainPopupScratch() {
  document.getElementById('brain-populate-popup').style.display = 'none';
  openBrainMap();
}

function brainPopupKnown() {
  document.getElementById('brain-populate-popup').style.display = 'none';
  document.getElementById('brain-select-overlay').style.display = 'flex';
  renderDomainSelector();
}

/* ── Domain selector — checklist UI ─────────────────────────── */
function renderDomainSelector() {
  const el = document.getElementById('brain-select-body');
  if (!el) return;

  // Get current search filter
  const searchVal = (document.getElementById('brain-domain-search')?.value || '').toLowerCase();

  // Check what levels are toggled
  const showMeta    = document.getElementById('dsl-meta')?.classList.contains('on');
  const showDomains = document.getElementById('dsl-domains')?.classList.contains('on');
  const showSubs    = document.getElementById('dsl-subs')?.classList.contains('on');

  el.innerHTML = '';

  Object.entries(DOMAIN_TAXONOMY).forEach(([metaKey, meta]) => {
    // Filter
    if (searchVal && !metaKey.toLowerCase().includes(searchVal) &&
        !Object.keys(meta.domains).some(d => d.toLowerCase().includes(searchVal) ||
        meta.domains[d].subs.some(s => s.toLowerCase().includes(searchVal)))) return;

    const metaWrap = document.createElement('div');
    metaWrap.className = 'dsel-meta-block';

    if (showMeta) {
      // Meta-domain row
      const metaRow = document.createElement('div');
      metaRow.className = 'dsel-row dsel-meta-row';
      metaRow.innerHTML =
        '<span class="dsel-icon" style="color:'+meta.color+'">'+meta.icon+'</span>' +
        '<span class="dsel-label" style="color:'+meta.color+'">'+metaKey+'</span>' +
        '<span class="dsel-intel">'+meta.intelligences.map(i => INTELLIGENCE_TYPES[i]?.icon||'').join('')+'</span>' +
        '<div class="dsel-check' + (DOMAIN_STATE.selectedMeta.has(metaKey)?' on':'') + '" data-meta="'+metaKey+'"></div>';
      metaRow.querySelector('.dsel-check').addEventListener('click', function() {
        const k = this.dataset.meta;
        if (DOMAIN_STATE.selectedMeta.has(k)) DOMAIN_STATE.selectedMeta.delete(k);
        else DOMAIN_STATE.selectedMeta.add(k);
        this.classList.toggle('on');
      });
      metaWrap.appendChild(metaRow);
    }

    if (showDomains || showSubs) {
      Object.entries(meta.domains).forEach(([domKey, dom]) => {
        if (searchVal && !domKey.toLowerCase().includes(searchVal) &&
            !dom.subs.some(s => s.toLowerCase().includes(searchVal))) return;

        if (showDomains) {
          const domRow = document.createElement('div');
          domRow.className = 'dsel-row dsel-domain-row';
          domRow.innerHTML =
            '<span class="dsel-dot" style="background:'+dom.color+'"></span>' +
            '<span class="dsel-label dsel-domain-label">'+domKey+'</span>' +
            '<div class="dsel-check' + (DOMAIN_STATE.selectedDomains.has(domKey)?' on':'') + '" data-domain="'+domKey+'"></div>';
          domRow.querySelector('.dsel-check').addEventListener('click', function() {
            const k = this.dataset.domain;
            if (DOMAIN_STATE.selectedDomains.has(k)) DOMAIN_STATE.selectedDomains.delete(k);
            else DOMAIN_STATE.selectedDomains.add(k);
            this.classList.toggle('on');
          });
          metaWrap.appendChild(domRow);
        }

        if (showSubs) {
          const subsWrap = document.createElement('div');
          subsWrap.className = 'dsel-subs-wrap';
          dom.subs.forEach(sub => {
            if (searchVal && !sub.toLowerCase().includes(searchVal) && !domKey.toLowerCase().includes(searchVal)) return;
            const subRow = document.createElement('div');
            subRow.className = 'dsel-row dsel-sub-row';
            subRow.innerHTML =
              '<span class="dsel-sub-dot" style="background:'+dom.color+'55"></span>' +
              '<span class="dsel-label dsel-sub-label">'+sub+'</span>' +
              '<div class="dsel-check' + (DOMAIN_STATE.selectedSubs.has(sub)?' on':'') + '" data-sub="'+sub+'"></div>';
            subRow.querySelector('.dsel-check').addEventListener('click', function() {
              const k = this.dataset.sub;
              if (DOMAIN_STATE.selectedSubs.has(k)) DOMAIN_STATE.selectedSubs.delete(k);
              else DOMAIN_STATE.selectedSubs.add(k);
              this.classList.toggle('on');
            });
            subsWrap.appendChild(subRow);
          });
          metaWrap.appendChild(subsWrap);
        }
      });
    }

    el.appendChild(metaWrap);
  });

  // Update summary counter
  const _summary = document.getElementById('dsel-summary');
  const _count_el = document.getElementById('dsel-count');
  const _total_sel = DOMAIN_STATE.selectedMeta.size + DOMAIN_STATE.selectedDomains.size + DOMAIN_STATE.selectedSubs.size;
  if (_summary) _summary.innerHTML =
    '<div>Meta: <span style="color:var(--c)">' + DOMAIN_STATE.selectedMeta.size + '</span></div>' +
    '<div>Domains: <span style="color:var(--v)">' + DOMAIN_STATE.selectedDomains.size + '</span></div>' +
    '<div>Sub-domains: <span style="color:var(--g)">' + DOMAIN_STATE.selectedSubs.size + '</span></div>' +
    '<div>Custom: <span style="color:var(--o)">' + DOMAIN_STATE.customDomains.filter(c=>DOMAIN_STATE.selectedDomains.has(c.name)).length + '</span></div>';
  if (_count_el) _count_el.textContent = _total_sel + ' selected';

  // Custom domains
  if (DOMAIN_STATE.customDomains.length) {
    const customWrap = document.createElement('div');
    customWrap.className = 'dsel-meta-block';
    customWrap.innerHTML = '<div class="dsel-row dsel-meta-row"><span class="dsel-label" style="color:var(--dim)">CUSTOM DOMAINS</span></div>';
    DOMAIN_STATE.customDomains.forEach(cd => {
      const row = document.createElement('div');
      row.className = 'dsel-row dsel-domain-row';
      row.innerHTML =
        '<span class="dsel-dot" style="background:'+cd.color+'"></span>' +
        '<span class="dsel-label dsel-domain-label">'+cd.name+'</span>' +
        '<div class="dsel-check' + (DOMAIN_STATE.selectedDomains.has(cd.name)?' on':'') + '" data-domain="'+cd.name+'"></div>' +
        '<button class="dsel-remove" data-custom="'+cd.name+'">✕</button>';
      row.querySelector('.dsel-check').addEventListener('click', function() {
        if (DOMAIN_STATE.selectedDomains.has(cd.name)) DOMAIN_STATE.selectedDomains.delete(cd.name);
        else DOMAIN_STATE.selectedDomains.add(cd.name);
        this.classList.toggle('on');
      });
      row.querySelector('.dsel-remove').addEventListener('click', function() {
        DOMAIN_STATE.customDomains = DOMAIN_STATE.customDomains.filter(c => c.name !== cd.name);
        renderDomainSelector();
      });
      customWrap.appendChild(row);
    });
    el.appendChild(customWrap);
  }
}

function dselToggleLevel(el, level) {
  el.classList.toggle('on');
  renderDomainSelector();
}

function dselCheckAll(scope) {
  // scope: 'meta' | 'domains' | 'subs' | 'all'
  const isAll = scope === 'all';
  if (isAll || scope === 'meta') {
    Object.keys(DOMAIN_TAXONOMY).forEach(k => DOMAIN_STATE.selectedMeta.add(k));
  }
  if (isAll || scope === 'domains') {
    Object.values(DOMAIN_TAXONOMY).forEach(m =>
      Object.keys(m.domains).forEach(d => DOMAIN_STATE.selectedDomains.add(d)));
  }
  if (isAll || scope === 'subs') {
    Object.values(DOMAIN_TAXONOMY).forEach(m =>
      Object.values(m.domains).forEach(d =>
        d.subs.forEach(s => DOMAIN_STATE.selectedSubs.add(s))));
  }
  renderDomainSelector();
}

function dselClearAll() {
  DOMAIN_STATE.selectedMeta.clear();
  DOMAIN_STATE.selectedDomains.clear();
  DOMAIN_STATE.selectedSubs.clear();
  renderDomainSelector();
}

function dselAddCustom() {
  const inp = document.getElementById('brain-custom-domain-input');
  const name = inp?.value.trim(); if (!name) return;
  const colorOpts = ['#00c8ff','#cc44ff','#00ff88','#ff8c22','#ffe04a','#ff66aa','#7744ff','#d4a820'];
  const color = colorOpts[DOMAIN_STATE.customDomains.length % colorOpts.length];
  DOMAIN_STATE.customDomains.push({ name, color, subs: [], meta: 'CUSTOM' });
  DOMAIN_STATE.selectedDomains.add(name);
  if (inp) inp.value = '';
  renderDomainSelector();
}

/* ── Populate brain map with selected domains ────────────────── */
function populateBrainMap() {
  domainStateSave();
  document.getElementById('brain-select-overlay').style.display = 'none';

  const toSpawn = [];
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const { x: wx, y: wy } = s2w(cx, cy);

  // Meta-domain nodes (outer ring, large)
  Object.entries(DOMAIN_TAXONOMY).forEach(([metaKey, meta]) => {
    if (!DOMAIN_STATE.selectedMeta.has(metaKey)) return;
    toSpawn.push({ type: 'framework', title: metaKey, color: meta.color,
      body: 'Intelligence: ' + meta.intelligences.join(', '),
      tags: ['meta-domain', 'domain-map'], level: 'meta', metaKey });
  });

  // Domain nodes (middle ring)
  Object.entries(DOMAIN_TAXONOMY).forEach(([metaKey, meta]) => {
    Object.entries(meta.domains).forEach(([domKey, dom]) => {
      if (!DOMAIN_STATE.selectedDomains.has(domKey)) return;
      toSpawn.push({ type: 'concept', title: domKey, color: dom.color,
        tags: ['domain', 'domain-map', metaKey], level: 'domain', metaKey, domKey });
    });
  });

  // Sub-domain nodes (inner ring / scattered)
  Object.entries(DOMAIN_TAXONOMY).forEach(([metaKey, meta]) => {
    Object.entries(meta.domains).forEach(([domKey, dom]) => {
      dom.subs.forEach(sub => {
        if (!DOMAIN_STATE.selectedSubs.has(sub)) return;
        toSpawn.push({ type: 'pattern', title: sub, color: dom.color,
          tags: ['subdomain', 'domain-map', domKey], level: 'sub', metaKey, domKey });
      });
    });
  });

  // Spawn in rings
  const metaNodes = toSpawn.filter(n => n.level === 'meta');
  const domNodes  = toSpawn.filter(n => n.level === 'domain');
  const subNodes  = toSpawn.filter(n => n.level === 'sub');

  const idMap = {}; // title → node id
  const ringR = [380, 240, 130];
  const allGroups = [metaNodes, domNodes, subNodes];

  allGroups.forEach((group, gi) => {
    const r = ringR[gi];
    group.forEach((item, i) => {
      const angle = (i / Math.max(group.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const jitter = gi === 2 ? (Math.random()-0.5)*60 : 0;
      const n = CANVAS.spawnNode(item.type,
        wx + Math.cos(angle) * r + jitter,
        wy + Math.sin(angle) * r + jitter,
        { title: item.title, body: item.body||'', tags: item.tags, color: item.color }
      );
      idMap[item.title] = n.id;
      DOMAIN_STATE.populatedNodes.push(n.id);
    });
  });

  // Connect meta → domain → sub
  domNodes.forEach(dom => {
    const metaId = idMap[dom.metaKey];
    const domId  = idMap[dom.title];
    if (metaId && domId) CANVAS.addConn(metaId, domId, 'domain');
  });
  subNodes.forEach(sub => {
    const domId = idMap[sub.domKey];
    const subId = idMap[sub.title];
    if (domId && subId) CANVAS.addConn(domId, subId, 'subdomain');
  });

  domainStateSave();
  const total = toSpawn.length;
  mm_toast(`Brain map: ${metaNodes.length} meta · ${domNodes.length} domains · ${subNodes.length} subs`, 'brain');

  _openBrainMapDirect();
}

function closeDomainSelector() {
  document.getElementById('brain-select-overlay').style.display = 'none';
}

// Intelligence-type ratings + cross-domain synthesis now live in ALM's
// own Intelligence tab (modules/alm/ui.js: renderIntelligenceStats,
// setIntelligenceRating, resetIntelligenceRatingToAuto,
// renderCrossDomainMatrix) — moved there, not duplicated. This spot
// used to hold a second, dead copy of the same functions, shadowed by
// a THIRD copy (_bmRenderIntelStats/bmv2SetIntel/_bmBuildCrossdomainPanel,
// also removed) that was the one the live Brain Map UI actually called.
// Three places the same rating could silently disagree is exactly the
// bug consolidating this was meant to fix.

// Init domain state on load
domainStateLoad();


/* ═══════════════════════════════════════════════════════════════════
   MODULE: brain-modes — Emotions · Creativity · Cognition routing
   Opens a three-way mode selector from the Brain Map button,
   or from the homepage Brain card. Each mode seeds the canvas
   with domain-relevant nodes and opens contextual tools.
═══════════════════════════════════════════════════════════════════ */

const BRAIN_MODES = {
  cognitive: {
    label: 'Cognitive',
    icon: '∞',
    color: '#00c8ff',
    tagline: 'Thinking about thinking. Leverage, map, and improve your mind.',
    domains: ['Metacognition','Pattern','Synthesis','Signal','Feedback Loop','Invariant','Cross-Domain','Intuition'],
    seedNodes: [
      { type: 'framework', title: 'Metacognition Hub',      body: 'Thinking about how you think. The root of all leverage.',          tags: ['metacognition','framework'] },
      { type: 'pattern',   title: 'Pattern Recognition',    body: 'Seeing structure before it\'s named.',                              tags: ['pattern','learning'] },
      { type: 'synthesis', title: 'Cross-Domain Synthesis', body: 'Where the real insights live — between fields.',                    tags: ['synthesis','cross-domain'] },
      { type: 'signal',    title: 'Signal Filter',          body: 'Alignment × Fidelity × Expansion. What\'s actually worth tracking?', tags: ['signal','noise'] },
      { type: 'feedback',  title: 'Feedback Loops',         body: 'Output becomes input. How does this loop close?',                   tags: ['feedback','systems'] },
      { type: 'insight',   title: 'Insight Engine',         body: 'Where does understanding crystallise for you?',                     tags: ['insight','meta'] },
    ],
    layout: 'radial',
  },
  emotions: {
    label: 'Emotions',
    icon: '♥',
    color: '#ff66aa',
    tagline: 'Understand, regulate, channel, and alchemise your emotional world.',
    domains: ['Emotion','Regulation','Channeling','Grounding','Sovereignty','Alchemy','Self-Love','Need','Desire'],
    seedNodes: [
      { type: 'concept',   title: 'Emotion Map',           body: 'Name what you\'re feeling. Precision reduces suffering.',           tags: ['emotion','awareness'] },
      { type: 'friction',  title: 'Current Charge',        body: 'What emotion is running loudest right now?',                       tags: ['emotion','present'] },
      { type: 'framework', title: 'Sovereignty',           body: 'You are the author of your response. Not the reactor.',            tags: ['sovereignty','regulation'] },
      { type: 'synthesis', title: 'Alchemy',               body: 'Transforming this feeling into fuel. What does it want to become?', tags: ['alchemy','channeling'] },
      { type: 'seed',      title: 'Self-Love Practice',    body: 'Radical acceptance. What needs compassion right now?',             tags: ['self-love','grounding'] },
      { type: 'causal',    title: 'Need Detection',        body: 'Emotion as signal. What unmet need is underneath this?',           tags: ['need','desire'] },
    ],
    layout: 'cluster',
  },
  systems: {
    label: 'Systems',
    icon: '∿',
    color: '#11ddcc',
    tagline: 'Model minds, relationships, and complex dynamics as interacting systems.',
    domains: ['Causal Loop','Feedback Structure','Stocks & Flows','Leverage','Simulation','Emergence'],
    seedNodes: [
      { type: 'feedback',  title: 'Causal Loop Map',       body: 'Map the reinforcing and balancing loops between two people, ideas, or systems.', tags: ['causal-loop','systems'] },
      { type: 'framework', title: 'Feedback Structure',    body: 'Where does output become input? Model the stock, the flow, and the delay.', tags: ['feedback-structure','systems'] },
      { type: 'causal',    title: 'Leverage Points',       body: 'Where is the highest leverage for positive change in this dynamic?', tags: ['leverage','change','systems'] },
      { type: 'synthesis', title: 'What-If Engine',        body: 'Simulate the system forward. What happens if this one variable moves?', tags: ['simulation','what-if'] },
    ],
    layout: 'force',
  },
  ecosystems: {
    label: 'Ecosystems',
    icon: '⬡',
    color: '#00ff88',
    tagline: 'People and real relationships. Living nodes, moments as truth — bridges, co-creation, attachment, and gaps between people.',
    domains: ['Bridge','Gap','Connection','Co-Creation','Intimacy','Conflict','Meaning','Understanding','Attachment','Co-Regulation','Communication','Moments','People-as-Nodes'],
    seedNodes: [
      { type: 'concept',   title: 'Bridge Map',            body: 'What gaps exist between you and this person/idea? Name them.',      tags: ['bridge','gap','relationship'] },
      { type: 'friction',  title: 'Current Tension',       body: 'Where is the friction? Tension is information, not damage.',        tags: ['tension','conflict','relationship'] },
      { type: 'synthesis', title: 'Co-Creation Space',     body: 'What can you build together that neither could build alone?',       tags: ['co-creation','collaboration'] },
      { type: 'insight',   title: 'Meaning Mapping',       body: 'What does this relationship mean? What is it for?',                 tags: ['meaning','purpose','relationship'] },
      { type: 'framework', title: 'Intimacy Architecture', body: 'How does closeness work here? Vulnerability, trust, history.',      tags: ['intimacy','trust','depth'] },
      { type: 'concept',   title: 'People as Nodes',        body: 'Every person in your life as a living, evolving node — not a static entry.', tags: ['people','relational'] },
      { type: 'friction',  title: 'Attachment Signal',      body: 'What attachment pattern is active right now? Co-regulation starts with naming it.', tags: ['attachment','co-regulation'] },
      { type: 'insight',   title: 'Moments as Truth',       body: 'The moment is the unit of record — not the summary of the relationship.', tags: ['moments','truth'] },
      { type: 'framework', title: 'Communication Threads',  body: 'Every thread traced back to its need. What was actually being asked for?', tags: ['communication','need'] },
    ],
    layout: 'force',
  },
};


/* ═══════════════════════════════════════════════════════════════════
   MODULE: creative — Art, love, expression, synthesis
   Create · Expand · Express · Bridge
═══════════════════════════════════════════════════════════════════ */
/* openCreativeModule merged into Spatial Void above */

function openBrainModeSelector(returnTarget) {
  // Route to the in-map mode selector (the brain-overlay's built-in mode picker)
  window._brainModeReturn = returnTarget || 'canvas';
  openBrainMap(); // opens brain-overlay and shows mode selector first
}


function closeBrainModeSelector() {
  const el = document.getElementById('mm-brain-modes');
  if (el) el.style.display = 'none';
}

function enterBrainMode(modeKey) {
  const mode = BRAIN_MODES[modeKey];
  if (!mode) return;
  closeBrainModeSelector();

  const returnTarget = window._brainModeReturn || 'canvas';

  // Register brain mode session in MM
  if (typeof MMRegistry !== 'undefined') {
    const sessionId = MMRegistry.register('brain_session', {
      module: 'brain', label: `${mode.label} session`,
      tags: [modeKey, 'brain-session'],
      meta: { mode: modeKey, domains: mode.domains },
    });
    MMDelta?.push(sessionId, 'brain_mode_enter', null, { mode: modeKey }, { module: 'brain' });
    MMLog?.info('brain', `Entering ${mode.label} mode`);
  }

  if (returnTarget === 'canvas' || document.getElementById('canvas-wrap').classList.contains('visible')) {
    // Already on canvas — seed nodes and open brain map
    _brainModeSeedCanvas(modeKey);
    setTimeout(() => openBrainMap(), 300);
  } else {
    // From homepage — go to canvas, seed, then open brain map
    CANVAS.enterCanvas();
    setTimeout(() => {
      _brainModeSeedCanvas(modeKey);
      setTimeout(() => openBrainMap(), 400);
    }, 200);
  }
  mm_toast(`${mode.label} · canvas seeded`, 'brain');
}

function _brainModeSeedCanvas(modeKey) {
  const mode = BRAIN_MODES[modeKey];
  if (!mode || !mode.seedNodes) return null;
  // Don't re-seed if mode nodes already exist — but still return the
  // existing hub so the caller can focus the canvas on it.
  const modeTag = modeKey + '-seed';
  const existingHub = CANVAS.NX.nodes.find(n => (n.tags||[]).includes(modeTag) && (n.tags||[]).includes('hub'));
  if (existingHub) return existingHub;

  const CX = (-CANVAS.NX.panX / CANVAS.NX.zoom) + window.innerWidth / (2 * CANVAS.NX.zoom);
  const CY = (-CANVAS.NX.panY / CANVAS.NX.zoom) + (window.innerHeight - 38) / (2 * CANVAS.NX.zoom);
  const r = 280;
  const hub = CANVAS.spawnNode('framework', CX, CY - 20, {
    title: mode.label + ' Map',
    body: mode.tagline,
    tags: [modeKey, modeTag, 'hub'],
    color: mode.color,
  });

  mode.seedNodes.forEach((s, i) => {
    const angle = (i / mode.seedNodes.length) * Math.PI * 2 - Math.PI / 2;
    const nx = CX + Math.cos(angle) * r;
    const ny = CY + Math.sin(angle) * r;
    const child = CANVAS.spawnNode(s.type, nx, ny, {
      title: s.title,
      body: s.body,
      tags: [...(s.tags || []), modeKey, modeTag],
      color: mode.color,
      depth: 1,
      parentId: hub.id,
    });
    CANVAS.addConn(hub.id, child.id, 'relates to');
  });

  autosaveJAA();
  return hub;
}

/* ═══════════════════════════════════════════════════════════════════
   MODULE: horizon-planning — End-state first. Reverse-causal mapping.
   Strategic intelligence, time increments, failure modes,
   constraints, resource accounting, slope tracking.
═══════════════════════════════════════════════════════════════════ */

const HORIZON_KEY = 'mm_horizon_state';

const HORIZON_STATE = {
  plans: [],   // [ { id, title, endState, timeframe, conditions[], constraints[], failureModes[], resources{}, deltas[], created, modified } ]
  _loaded: false,
};

const HORIZON_TIMEFRAMES = ['1 Week', '1 Month', '3 Months', '6 Months', '1 Year', '3 Years', '5 Years', '10 Years'];

// Life-domain taxonomy — ported from the old prototype's Horizon Plan
// spec (section 14), needed for the "Who I Am" identity view: who you're
// becoming, viewed across the actual domains of a life, not just a flat
// list of plans.
const HORIZON_DOMAINS = {
  being:      { label: 'Who I Am Becoming',       color: '#ffe04a', icon: '◉' },
  relational: { label: 'Relational',              color: '#7744ff', icon: '⬡' },
  financial:  { label: 'Financial / Material',    color: '#00ff88', icon: '◆' },
  cognitive:  { label: 'Cognitive / Intellectual',color: '#00c8ff', icon: '◈' },
  health:     { label: 'Physical / Health',       color: '#ff66aa', icon: '♥' },
  creative:   { label: 'Creative / Expression',   color: '#ff8c22', icon: '✦' },
  social:     { label: 'Social / Impact',         color: '#11ddcc', icon: '◎' },
  custom:     { label: 'Custom Domain',           color: '#888899', icon: '○' },
};
const HORIZON_RESOURCE_TYPES = ['Time (hrs/wk)', 'Money ($/mo)', 'Energy (0-10)', 'Attention (0-10)', 'Social Capital', 'Skills Required'];

function horizonLoad() {
  // SECURITY FIX: this read localStorage['mm_horizon_state'] and could
  // clobber correctly-decrypted vault state with a stale plaintext copy
  // — vaultDeserialize() (mastermind-vault.js, modules.horizon) already
  // populates HORIZON_STATE.plans by the time this runs in the normal
  // login flow, and this ran unconditionally at boot too, before that.
  // Vault-only now; see _ORPHAN_KEYS for recovering any pre-fix copy.
  HORIZON_STATE._loaded = true;
}

function horizonSave() {
  // SECURITY FIX: this used to ALSO write localStorage['mm_horizon_state']
  // in plaintext, in parallel with the vault, on every change. The vault
  // is the only store now (modules.horizon already covers it in full).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(5000); else autosaveJAA();
}

function horizonNewPlan(title, endState, timeframe, domain) {
  const id = typeof uuid === 'function' ? uuid() : (Date.now().toString(36));
  const plan = {
    id,
    title: title || 'New Horizon Plan',
    endState: endState || '',
    timeframe: timeframe || '1 Year',
    domain: domain && HORIZON_DOMAINS[domain] ? domain : 'being',
    conditions: [],      // reverse-causal conditions
    constraints: [],     // current + future constraints
    failureModes: [],    // how this could fail — preemptive problem solving
    resources: {},       // resource estimates
    milestones: [],      // { id, label, timeframe, done }
    slopes: [],          // { id, domain, current, target, rate, note }
    deltas: [],          // tracked progress deltas
    // Seeds — small, concrete markers planted now because they point at
    // this plan's end-state. Real implementation of the concept spec'd
    // in NEXUS-SPEC.md Part 3.1, never built until now.
    seeds: [],           // { id, text, plantedAt, sproutedAt }
    // If-then commitments — the explicit ask: turn a speculative "what if"
    // into a real, actionable "if X, then I will do Y."
    commitments: [],     // { id, ifCondition, thenAction, done, ts }
    created: Date.now(),
    modified: Date.now(),
  };
  HORIZON_STATE.plans.push(plan);
  if (typeof MMRegistry !== 'undefined') {
    MMRegistry.register('horizon_plan', { id, module: 'horizon', label: plan.title, meta: { timeframe } });
    MMDelta?.push(id, 'plan_create', null, { title, timeframe }, { module: 'horizon' });
  }
  horizonSave();
  if (typeof T !== 'undefined') T.planCreated(plan.title);
  return plan;
}

function horizonGetPlan(id) {
  const p = HORIZON_STATE.plans.find(p => p.id === id) || null;
  // Backfill fields for plans saved before this session's additions —
  // same defensive pattern used for ALM's feedbackLoops field.
  if (p) {
    if (!p.domain) p.domain = 'being';
    if (!p.seeds) p.seeds = [];
    if (!p.commitments) p.commitments = [];
  }
  return p;
}

function horizonUpdatePlan(id, changes) {
  const p = horizonGetPlan(id); if (!p) return false;
  Object.assign(p, changes);
  p.modified = Date.now();
  if (typeof MMDelta !== 'undefined') MMDelta.push(id, 'plan_update', null, changes, { module: 'horizon' });
  horizonSave();
  return true;
}

function horizonAddCondition(planId, condition) {
  const p = horizonGetPlan(planId); if (!p) return;
  const id = typeof uuid === 'function' ? uuid() : Date.now().toString(36);
  p.conditions.push({ id, text: condition, order: p.conditions.length, done: false, created: Date.now() });
  p.modified = Date.now();
  if (typeof MMDelta !== 'undefined') MMDelta.push(planId, 'condition_add', null, condition, { module: 'horizon' });
  horizonSave();
}

function horizonAddMilestone(planId, label, timeframe) {
  const p = horizonGetPlan(planId); if (!p) return;
  const id = typeof uuid === 'function' ? uuid() : Date.now().toString(36);
  p.milestones.push({ id, label, timeframe: timeframe || '1 Month', done: false, created: Date.now() });
  p.modified = Date.now();
  horizonSave();
}

// ─────────────────────────────────────────────────────────────────
// AI END-STATE GENERATION & BACKWARD CONDITION-MAPPING
// Spec: docs/NEXUS-SPEC.md Part 3.1b. Same aiCall funnel every other
// AI feature uses (Void: voidExpandWhatifAI/voidBridgeAI) — no new
// transport, no new data shape beyond fields Horizon already has.
// ─────────────────────────────────────────────────────────────────

function _horizonAIContext() {
  const plans = HORIZON_STATE.plans.slice(-6)
    .map(p => `- [${p.domain}] ${p.title}: ${p.endState || '(no end-state yet)'}`).join('\n');
  let deltas = '';
  try {
    if (typeof ALM_STATE !== 'undefined' && ALM_STATE.deltas) {
      deltas = ALM_STATE.deltas.slice(-8).map(d => `- ${d.type}: ${d.text}`).join('\n');
    }
  } catch (e) {}
  return `EXISTING PLANS:\n${plans || '(none yet)'}\n\nRECENT SIGNAL:\n${deltas || '(none)'}`;
}

async function horizonGenerateEndStates(seedContext) {
  const detail = document.getElementById('hz-detail');
  if (!detail) return;
  if (typeof T !== 'undefined' && T.aiThinking) T.aiThinking();
  const sys = 'You are a strategic foresight generator for a personal Horizon Planning tool. ' +
    'Generate speculative end-states — concrete future conditions, not tasks or wishes. ' +
    'Deliberately varied across life domains. Provocative and non-obvious over safe and generic.';
  const ctx = _horizonAIContext();
  const ask = seedContext
    ? `Generate 5 speculative end-states related to: "${seedContext}".`
    : `Generate 5 speculative end-states, deliberately varied across different life domains, ` +
      `informed by (but not repeating) this context:\n\n${ctx}`;
  try {
    const result = await aiCall(sys, ask +
      '\n\nReturn ONLY valid JSON array: [{"title":"short label","endState":"1-2 sentence concrete future condition"}]');
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    if (!result) return;
    const clean = result.replace(/```json|```/g, '').trim();
    const list = JSON.parse(clean);
    _renderEndStatePicker(detail, Array.isArray(list) ? list : []);
  } catch (e) {
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    mm_toast('AI end-state generation failed: ' + e.message, 'error');
  }
}

function _renderEndStatePicker(detail, list) {
  window._hzGenerated = list;
  detail.innerHTML = `
    <div style="max-width:640px">
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#d4a820;margin-bottom:6px">AI-GENERATED END-STATES</div>
      <div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);
        margin-bottom:18px;letter-spacing:1px">PICK ONE TO ADOPT AS A DRAFT PLAN — CONDITIONS BACKWARD-MAP AUTOMATICALLY</div>
      ${list.length ? list.map((es, i) => `
        <div onclick="horizonAdoptGeneratedEndState(${i})"
          style="padding:14px 16px;margin-bottom:10px;border:1px solid rgba(212,168,32,.3);
            background:rgba(212,168,32,.04);cursor:pointer;transition:all .15s"
          onmouseenter="this.style.background='rgba(212,168,32,.12)';this.style.borderColor='#d4a820'"
          onmouseleave="this.style.background='rgba(212,168,32,.04)';this.style.borderColor='rgba(212,168,32,.3)'">
          <div style="font-family:var(--f-body);font-size:11px;font-weight:700;
            color:var(--bright);margin-bottom:5px">${escH(es.title || 'Untitled')}</div>
          <div style="font-family:var(--f-body);font-size:10px;color:var(--c);
            line-height:1.6">${escH(es.endState || '')}</div>
        </div>
      `).join('') : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);padding:20px 0">
        No end-states generated — try again.</div>`}
      <div style="display:flex;gap:10px;margin-top:8px">
        <button onclick="horizonGenerateEndStates()" style="padding:10px 16px;border:1px solid var(--wire2);
          background:transparent;color:var(--dim);font-family:var(--f-mono);font-size:8px;
          letter-spacing:1px;cursor:pointer">↻ REGENERATE</button>
        <button onclick="openHorizon()" style="padding:10px 16px;border:1px solid var(--wire2);
          background:transparent;color:var(--dim);font-family:var(--f-mono);font-size:8px;
          letter-spacing:1px;cursor:pointer">CANCEL</button>
      </div>
    </div>
  `;
}

async function horizonAdoptGeneratedEndState(index) {
  const es = (window._hzGenerated || [])[index];
  if (!es) return;
  const plan = horizonNewPlan(es.title || 'New Horizon Plan', es.endState || '',
    window._hzNewTf || '1 Year', window._hzNewDomain || 'being');
  window._hzSelected = plan.id;
  const overlay = document.getElementById('mm-horizon-overlay');
  if (overlay) _renderHorizonUI(overlay);
  horizonSelectPlan(plan.id);
  await horizonBackmapConditions(plan.id);
}

async function horizonBackmapConditions(planId) {
  const p = horizonGetPlan(planId); if (!p) return;
  if (typeof T !== 'undefined' && T.aiThinking) T.aiThinking();
  const sys = 'You are a strategic planning assistant. Given a plan end-state, backward-map what ' +
    'would have to be true to reach it — reverse-causal conditions and concrete near-term milestones. ' +
    'Be specific, not motivational.';
  const ask = `PLAN: "${p.title}"\nEND-STATE: "${p.endState}"\nTIMEFRAME: ${p.timeframe}\n\n` +
    `Return ONLY valid JSON: {"conditions":["reverse-causal condition", ...3-5 items], ` +
    `"milestones":[{"label":"concrete near-term milestone","timeframe":"e.g. 1 Month"}] (2-4 items)}`;
  try {
    const result = await aiCall(sys, ask);
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    if (!result) return;
    const clean = result.replace(/```json|```/g, '').trim();
    const data = JSON.parse(clean);
    (data.conditions || []).forEach(c => horizonAddCondition(planId, c));
    (data.milestones || []).forEach(m => horizonAddMilestone(planId, m.label, m.timeframe));
    horizonSelectPlan(planId);
    mm_toast('Backward-mapped ' + ((data.conditions || []).length) + ' conditions, ' +
      ((data.milestones || []).length) + ' milestones', 'success');
  } catch (e) {
    if (typeof T !== 'undefined' && T.aiDone) T.aiDone();
    mm_toast('Backward-mapping failed: ' + e.message, 'error');
  }
}

function horizonExportToCanvas(planId) {
  const p = horizonGetPlan(planId); if (!p) return;
  const CX = (-CANVAS.NX.panX / CANVAS.NX.zoom) + window.innerWidth / (2 * CANVAS.NX.zoom);
  const CY = (-CANVAS.NX.panY / CANVAS.NX.zoom) + (window.innerHeight - 38) / (2 * CANVAS.NX.zoom);

  // End state node
  const endNode = CANVAS.spawnNode('seed', CX, CY - 40, {
    title: 'END: ' + p.title.slice(0, 35),
    body: p.endState,
    tags: ['horizon', 'end-state', p.timeframe.replace(/\s/g,'-').toLowerCase()],
    color: '#d4a820',
  });

  // Reverse-causal conditions as a chain
  const sorted = [...p.conditions].sort((a,b) => a.order - b.order);
  sorted.forEach((c, i) => {
    const nx = CX - (sorted.length / 2 - i) * 280;
    const ny = CY + 180;
    const cn = CANVAS.spawnNode('causal', nx, ny, {
      title: 'Condition ' + (i + 1),
      body: c.text,
      tags: ['horizon', 'condition'],
      color: '#7744ff',
      depth: 1,
      parentId: endNode.id,
    });
    CANVAS.addConn(cn.id, endNode.id, 'enables →');
  });

  // Failure modes
  p.failureModes.forEach((fm, i) => {
    const fn = CANVAS.spawnNode('friction', CX + 350 + i * 200, CY - 40, {
      title: 'Failure: ' + fm.text.slice(0, 30),
      body: fm.mitigation || '',
      tags: ['horizon', 'failure-mode'],
      color: '#ff3355',
      depth: 1,
    });
    CANVAS.addConn(endNode.id, fn.id, 'risk');
  });

  // Constraints
  p.constraints.forEach((ct, i) => {
    const cn = CANVAS.spawnNode('friction', CX - 350 - i * 200, CY + 100, {
      title: 'Constraint: ' + ct.text.slice(0, 30),
      tags: ['horizon', 'constraint'],
      color: '#ff8c22',
      depth: 1,
    });
    CANVAS.addConn(endNode.id, cn.id, 'constrained by');
  });

  if (typeof MMToast !== 'undefined') MMToast.success('Horizon plan exported to canvas');
  else toast('✓ Horizon plan on canvas');
  autosaveJAA();
  return endNode;
}

/* ── Horizon Overlay UI ─────────────────────────────────────────── */
function openHorizon() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'horizon' });
  if (!HORIZON_STATE._loaded) horizonLoad();
  mm_toast('Horizon Living · End-state first', 'info', { dur: 2000 });
  let overlay = document.getElementById('mm-horizon-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-horizon-overlay';
    overlay.style.cssText = `
      position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800;
      background:rgba(0,0,0,.97);backdrop-filter:blur(6px);
      display:flex;flex-direction:column;
    `;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderHorizonUI(overlay);
}

function closeHorizon() {
  const el = document.getElementById('mm-horizon-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
}

function _renderHorizonUI(container) {
  const plans = HORIZON_STATE.plans;
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:14px;padding:12px 20px;
      border-bottom:1px solid rgba(212,168,32,.25);background:rgba(212,168,32,.04);flex-shrink:0">
      <div>
        <div style="font-family:var(--f-display);font-size:13px;font-weight:800;letter-spacing:6px;
          background:linear-gradient(135deg,#d4a820,#ffe04a);-webkit-background-clip:text;
          -webkit-text-fill-color:transparent;background-clip:text">HORIZON PLANNING</div>
        <div style="font-family:var(--f-mono);font-size:7px;color:rgba(212,168,32,.6);
          letter-spacing:2px;margin-top:2px">STRATEGIC · PREDICTIVE · END-STATE FIRST</div>
      </div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button onclick="horizonNewPlanPrompt()" style="
          font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:2px;
          padding:8px 18px;border:1px solid #d4a820;color:#d4a820;background:rgba(212,168,32,.08);
          cursor:pointer;transition:all .18s" onmouseenter="this.style.background='rgba(212,168,32,.16)'"
          onmouseleave="this.style.background='rgba(212,168,32,.08)'">⊞ NEW PLAN</button>
        <button onclick="horizonGenerateEndStates()" style="
          font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:2px;
          padding:8px 18px;border:1px solid #d4a820;color:#d4a820;background:rgba(212,168,32,.08);
          cursor:pointer;transition:all .18s" onmouseenter="this.style.background='rgba(212,168,32,.16)'"
          onmouseleave="this.style.background='rgba(212,168,32,.08)'"
          title="AI generates speculative end-states — pick one, conditions backward-map automatically">✦ AI END-STATES</button>
        <button onclick="horizonShowIdentityView()" style="
          font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:2px;
          padding:8px 18px;border:1px solid #ffe04a;color:#ffe04a;background:rgba(255,224,74,.08);
          cursor:pointer;transition:all .18s" onmouseenter="this.style.background='rgba(255,224,74,.16)'"
          onmouseleave="this.style.background='rgba(255,224,74,.08)'" title="Who you're becoming, across every plan and domain">◉ WHO I AM</button>
        <button onclick="showModuleHelp('horizon')" style="
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px;
          padding:8px 14px;border:1px solid #d4a82055;color:#d4a820;
          background:transparent;cursor:pointer;text-transform:uppercase"
          title="Module help">? HELP</button>
        <button onclick="closeHorizon();CANVAS.goHome()" style="
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px;
          padding:8px 14px;border:1px solid var(--wire2);color:var(--c);
          background:transparent;cursor:pointer;text-transform:uppercase"
          onmouseenter="this.style.color='#00c8ff'" onmouseleave="this.style.color='var(--c)'">⌂ HOME</button>
        <button onclick="closeHorizon()" style="
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px;
          padding:8px 16px;border:1px solid var(--wire2);color:var(--dim);
          background:transparent;cursor:pointer;text-transform:uppercase">✕ CLOSE</button>
      </div>
    </div>

    <div style="display:flex;flex:1;min-height:0;overflow:hidden">
      <!-- Plan list sidebar -->
      <div style="width:260px;flex-shrink:0;border-right:1px solid var(--wire2);
        overflow-y:auto;padding:12px 0" id="hz-plan-list">
        ${plans.length ? plans.map(p => `
          <div onclick="horizonSelectPlan('${p.id}')"
            id="hz-plan-item-${p.id}"
            style="padding:10px 16px;border-bottom:1px solid var(--wire);cursor:pointer;
              transition:background .12s;border-left:2px solid transparent"
            onmouseenter="this.style.background='var(--lift)'"
            onmouseleave="this.style.background=''">
            <div style="font-family:var(--f-body);font-size:10px;font-weight:600;
              color:var(--bright);margin-bottom:3px">${escH(p.title)}</div>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-family:var(--f-mono);font-size:6.5px;color:#d4a820;
                border:1px solid #d4a82044;padding:1px 5px">${escH(p.timeframe)}</span>
              <span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">
                ${p.conditions.length} conditions</span>
            </div>
          </div>
        `).join('') : `
          <div style="padding:28px 16px;text-align:center;font-family:var(--f-mono);
            font-size:8px;color:var(--dim);line-height:2">
            No plans yet.<br>Create your first horizon.
          </div>
        `}
      </div>

      <!-- Plan detail panel -->
      <div style="flex:1;overflow-y:auto;padding:20px 24px" id="hz-detail">
        ${plans.length ? '<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;padding:20px;text-align:center">Select a plan</div>'
          : '<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;padding:20px;text-align:center">Create a plan to get started</div>'}
      </div>
    </div>
  `;

  // Auto-select first plan if exists
  if (plans.length && !window._hzSelected) horizonSelectPlan(plans[0].id);
}

function horizonNewPlanPrompt() {
  const overlay = document.getElementById('mm-horizon-overlay');
  if (!overlay) return;
  // Inject quick-create form
  const detail = document.getElementById('hz-detail');
  if (!detail) return;
  detail.innerHTML = `
    <div style="max-width:560px">
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#d4a820;margin-bottom:20px">NEW HORIZON PLAN</div>

      <div style="margin-bottom:14px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--dim);text-transform:uppercase;margin-bottom:5px">Plan Title</div>
        <input id="hz-new-title" type="text" placeholder="e.g. Financial Independence by 35"
          style="width:100%;background:var(--deep);border:1px solid var(--wire2);
            color:var(--white);font-family:var(--f-body);font-size:12px;
            padding:10px 14px;outline:none;transition:border .18s"
          onfocus="this.style.borderColor='#d4a820'" onblur="this.style.borderColor=''">
      </div>

      <div style="margin-bottom:14px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--dim);text-transform:uppercase;margin-bottom:5px">End State — What does success look like exactly?</div>
        <textarea id="hz-new-endstate" placeholder="Be specific. Describe the version of yourself who achieved this..."
          rows="4" style="width:100%;background:var(--deep);border:1px solid var(--wire2);
            color:var(--white);font-family:var(--f-body);font-size:11px;
            padding:10px 14px;outline:none;resize:vertical;line-height:1.6;
            transition:border .18s"
          onfocus="this.style.borderColor='#d4a820'" onblur="this.style.borderColor=''"></textarea>
      </div>

      <div style="margin-bottom:14px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--dim);text-transform:uppercase;margin-bottom:5px">Life Domain — which part of who you're becoming is this?</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${Object.entries(HORIZON_DOMAINS).map(([key, d]) => `
            <button onclick="document.querySelectorAll('.hz-dom-btn').forEach(b=>{b.classList.remove('sel');b.style.background='transparent';});this.classList.add('sel');this.style.background='${d.color}22';window._hzNewDomain='${key}'"
              class="hz-dom-btn${key === 'being' ? ' sel' : ''}" data-domain="${key}"
              style="font-family:var(--f-mono);font-size:7px;letter-spacing:.5px;
                padding:5px 10px;border:1px solid ${d.color}44;background:${key === 'being' ? d.color + '22' : 'transparent'};
                color:${d.color};cursor:pointer;transition:all .15s">${d.icon} ${d.label}</button>
          `).join('')}
        </div>
      </div>

      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--dim);text-transform:uppercase;margin-bottom:5px">Timeframe</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${HORIZON_TIMEFRAMES.map(tf => `
            <button onclick="document.querySelectorAll('.hz-tf-btn').forEach(b=>b.classList.remove('sel'));this.classList.add('sel');window._hzNewTf='${tf}'"
              class="hz-tf-btn" data-tf="${tf}"
              style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;
                padding:5px 12px;border:1px solid var(--wire2);background:transparent;
                color:var(--dim);cursor:pointer;transition:all .15s;text-transform:uppercase"
              onmouseenter="if(!this.classList.contains('sel'))this.style.borderColor='#d4a820'"
              onmouseleave="if(!this.classList.contains('sel'))this.style.borderColor=''">${tf}</button>
          `).join('')}
        </div>
      </div>

      <div style="display:flex;gap:10px">
        <button onclick="horizonCreateFromForm()"
          style="flex:1;padding:13px;border:1px solid #d4a820;background:rgba(212,168,32,.08);
            color:#d4a820;font-family:var(--f-display);font-size:10px;font-weight:700;
            letter-spacing:3px;text-transform:uppercase;cursor:pointer;transition:all .2s"
          onmouseenter="this.style.background='rgba(212,168,32,.18)'"
          onmouseleave="this.style.background='rgba(212,168,32,.08)'">◎ CREATE PLAN</button>
        <button onclick="openHorizon()"
          style="padding:13px 20px;border:1px solid var(--wire2);background:transparent;
            color:var(--dim);font-family:var(--f-mono);font-size:8px;
            letter-spacing:1px;cursor:pointer">CANCEL</button>
      </div>
    </div>
  `;
  window._hzNewTf = '1 Year';
  window._hzNewDomain = 'being';
}

function horizonCreateFromForm() {
  const title = document.getElementById('hz-new-title')?.value.trim();
  const endState = document.getElementById('hz-new-endstate')?.value.trim();
  const tf = window._hzNewTf || '1 Year';
  const domain = window._hzNewDomain || 'being';
  if (!title) { MMToast?.warn('Plan title required') || toast('Plan title required'); return; }
  const plan = horizonNewPlan(title, endState, tf, domain);
  window._hzSelected = plan.id;
  const overlay = document.getElementById('mm-horizon-overlay');
  if (overlay) _renderHorizonUI(overlay);
  horizonSelectPlan(plan.id);
}

function horizonSelectPlan(id) {
  window._hzSelected = id;
  const p = horizonGetPlan(id); if (!p) return;
  // Highlight in sidebar
  document.querySelectorAll('[id^="hz-plan-item-"]').forEach(el => {
    el.style.borderLeftColor = el.id === `hz-plan-item-${id}` ? '#d4a820' : 'transparent';
    el.style.background = el.id === `hz-plan-item-${id}` ? 'var(--lift)' : '';
  });
  // Render detail
  const detail = document.getElementById('hz-detail'); if (!detail) return;
  const progressPct = p.milestones.length
    ? Math.round(p.milestones.filter(m => m.done).length / p.milestones.length * 100)
    : 0;

  detail.innerHTML = `
    <div style="max-width:700px">
      <!-- Header -->
      <div style="display:flex;align-items:flex-start;gap:14px;margin-bottom:20px">
        <div style="flex:1">
          <div style="font-family:var(--f-display);font-size:18px;font-weight:800;
            color:var(--white);letter-spacing:2px;margin-bottom:4px">${escH(p.title)}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <span style="font-family:var(--f-mono);font-size:7px;color:#d4a820;
              border:1px solid #d4a82044;padding:2px 8px">${escH(p.timeframe)}</span>
            <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">
              ${p.conditions.length} conditions · ${p.milestones.length} milestones · ${p.failureModes.length} risks</span>
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="horizonExportToCanvas('${p.id}')"
            style="font-family:var(--f-mono);font-size:7px;letter-spacing:1px;
              padding:6px 12px;border:1px solid var(--c)44;color:var(--c);
              background:transparent;cursor:pointer;text-transform:uppercase">⊞ TO CANVAS</button>
          <button onclick="horizonDeletePlan('${p.id}')"
            style="font-family:var(--f-mono);font-size:7px;letter-spacing:1px;
              padding:6px 12px;border:1px solid var(--r)44;color:var(--r);
              background:transparent;cursor:pointer;text-transform:uppercase">✕ DELETE</button>
        </div>
      </div>

      <!-- Progress bar -->
      ${p.milestones.length ? `
        <div style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;
            font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:5px">
            <span>PROGRESS</span><span style="color:#d4a820">${progressPct}%</span>
          </div>
          <div style="height:4px;background:var(--wire);overflow:hidden">
            <div style="height:100%;width:${progressPct}%;
              background:linear-gradient(90deg,#d4a820,#ffe04a);transition:width .5s"></div>
          </div>
        </div>
      ` : ''}

      <!-- End state -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:#d4a820;text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(212,168,32,.2);padding-bottom:5px">◎ END STATE</div>
        <div style="font-family:var(--f-body);font-size:11px;color:var(--muted);
          line-height:1.7;padding:12px;background:rgba(212,168,32,.04);
          border:1px solid rgba(212,168,32,.15)" contenteditable="true"
          onblur="horizonUpdatePlan('${p.id}',{endState:this.textContent.trim()})"
        >${escH(p.endState) || '<span style="color:var(--dim);font-style:italic">Describe the exact end state...</span>'}</div>
      </div>

      <!-- Reverse-causal conditions -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--v);text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(119,68,255,.2);padding-bottom:5px">
          → REVERSE CAUSAL CONDITIONS
          <span style="font-size:6px;color:var(--dim);letter-spacing:0;text-transform:none;margin-left:6px">
            What must be true for the end state to exist?
          </span>
        </div>
        <div id="hz-conditions-${p.id}" style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px">
          ${p.conditions.map((c, i) => `
            <div style="display:flex;align-items:center;gap:8px;
              padding:8px 12px;background:var(--abyss);border:1px solid var(--wire);
              border-left:2px solid ${c.done ? 'var(--g)' : 'var(--v)'}">
              <span style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
                min-width:18px">${i + 1}</span>
              <span style="flex:1;font-family:var(--f-mono);font-size:8.5px;
                color:${c.done ? 'var(--dim)' : 'var(--muted)'};
                ${c.done ? 'text-decoration:line-through' : ''}">${escH(c.text)}</span>
              <label style="cursor:pointer;font-size:12px"
                title="${c.done ? 'Mark incomplete' : 'Mark complete'}">
                <input type="checkbox" ${c.done ? 'checked' : ''}
                  onchange="horizonToggleCondition('${p.id}','${c.id}',this.checked)"
                  style="width:14px;height:14px;cursor:pointer;accent-color:#d4a820">
              </label>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input id="hz-cond-input-${p.id}" type="text" placeholder="Add condition..."
            style="flex:1;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;
              padding:7px 10px;outline:none"
            onkeydown="if(event.key==='Enter')horizonAddConditionUI('${p.id}')"
            onfocus="this.style.borderColor='var(--v)'" onblur="this.style.borderColor=''">
          <button onclick="horizonAddConditionUI('${p.id}')"
            style="padding:7px 14px;border:1px solid var(--v)55;color:var(--v);
              background:transparent;cursor:pointer;font-family:var(--f-mono);
              font-size:7px;letter-spacing:1px;text-transform:uppercase">+ ADD</button>
        </div>
      </div>

      <!-- Milestones -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--g);text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(0,255,136,.2);padding-bottom:5px">◆ MILESTONES</div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
          ${p.milestones.map(m => `
            <div style="display:flex;align-items:center;gap:8px;
              padding:6px 12px;border:1px solid var(--wire);
              border-left:2px solid ${m.done ? 'var(--g)' : 'var(--wire2)'}">
              <input type="checkbox" ${m.done ? 'checked' : ''}
                onchange="horizonToggleMilestone('${p.id}','${m.id}',this.checked)"
                style="cursor:pointer;accent-color:var(--g)">
              <span style="flex:1;font-family:var(--f-mono);font-size:8px;
                color:${m.done ? 'var(--dim)' : 'var(--muted)'};
                ${m.done ? 'text-decoration:line-through' : ''}">${escH(m.label)}</span>
              <span style="font-family:var(--f-mono);font-size:6.5px;
                color:var(--g);border:1px solid rgba(0,255,136,.2);padding:1px 5px">${escH(m.timeframe)}</span>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input id="hz-ms-input-${p.id}" type="text" placeholder="Milestone label..."
            style="flex:2;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onfocus="this.style.borderColor='var(--g)'" onblur="this.style.borderColor=''">
          <select id="hz-ms-tf-${p.id}"
            style="background:var(--deep);border:1px solid var(--wire2);
              color:var(--muted);font-family:var(--f-mono);font-size:8px;padding:6px 8px">
            ${HORIZON_TIMEFRAMES.map(tf => `<option>${tf}</option>`).join('')}
          </select>
          <button onclick="horizonAddMilestoneUI('${p.id}')"
            style="padding:7px 14px;border:1px solid var(--g)55;color:var(--g);
              background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:7px;text-transform:uppercase">+ ADD</button>
        </div>
      </div>

      <!-- Failure modes -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--r);text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(255,51,85,.2);padding-bottom:5px">
          ⚡ FAILURE MODES
        </div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
          ${p.failureModes.map(fm => `
            <div style="padding:8px 12px;border:1px solid rgba(255,51,85,.2);
              border-left:2px solid var(--r);background:rgba(255,51,85,.03)">
              <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted)">${escH(fm.text)}</div>
              ${fm.mitigation ? `<div style="font-family:var(--f-mono);font-size:7px;
                color:var(--g);margin-top:3px">↳ ${escH(fm.mitigation)}</div>` : ''}
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input id="hz-fm-input-${p.id}" type="text" placeholder="Failure mode..."
            style="flex:2;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onfocus="this.style.borderColor='var(--r)'" onblur="this.style.borderColor=''">
          <input id="hz-mit-input-${p.id}" type="text" placeholder="Mitigation..."
            style="flex:2;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onfocus="this.style.borderColor='var(--g)'" onblur="this.style.borderColor=''">
          <button onclick="horizonAddFailureModeUI('${p.id}')"
            style="padding:7px 14px;border:1px solid rgba(255,51,85,.4);color:var(--r);
              background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:7px">+ ADD</button>
        </div>
      </div>

      <!-- Constraints -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:var(--o);text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(255,140,34,.2);padding-bottom:5px">⬡ CONSTRAINTS</div>
        <div style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px">
          ${p.constraints.map(ct => `
            <div style="padding:6px 12px;border:1px solid rgba(255,140,34,.2);
              border-left:2px solid var(--o);font-family:var(--f-mono);font-size:8px;color:var(--muted)">${escH(ct.text)}</div>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input id="hz-ct-input-${p.id}" type="text" placeholder="Current or future constraint..."
            style="flex:1;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onkeydown="if(event.key==='Enter')horizonAddConstraintUI('${p.id}')"
            onfocus="this.style.borderColor='var(--o)'" onblur="this.style.borderColor=''">
          <button onclick="horizonAddConstraintUI('${p.id}')"
            style="padding:7px 14px;border:1px solid rgba(255,140,34,.4);color:var(--o);
              background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:7px">+ ADD</button>
        </div>
      </div>

      <!-- Seeds — small markers planted now because they point at the end-state -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:#00ff88;text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(0,255,136,.2);padding-bottom:5px">
          ✦ SEEDS
          <span style="font-size:6px;color:var(--dim);letter-spacing:0;text-transform:none;margin-left:6px">
            Knowledge or practice to plant now for later — not a task, a seed
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px">
          ${p.seeds.map(s => `
            <div style="display:flex;align-items:center;gap:8px;
              padding:8px 12px;background:var(--abyss);border:1px solid var(--wire);
              border-left:2px solid ${s.sproutedAt ? '#00ff88' : 'var(--wire2)'}">
              <span style="font-size:11px">${s.sproutedAt ? '🌱' : '·'}</span>
              <span style="flex:1;font-family:var(--f-mono);font-size:8.5px;color:var(--muted)">${escH(s.text)}</span>
              <span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">
                ${s.sproutedAt ? 'sprouted ' + _hzTimeAgo(s.sproutedAt) : 'planted ' + _hzTimeAgo(s.plantedAt)}</span>
              ${!s.sproutedAt ? `<button onclick="horizonSproutSeed('${p.id}','${s.id}')" title="Mark as sprouted — this showed up as real behavior"
                style="background:none;border:none;color:#00ff88;cursor:pointer;font-size:11px">🌱</button>` : ''}
              <button onclick="horizonDeleteSeed('${p.id}','${s.id}')" style="background:none;border:none;color:var(--wire2);cursor:pointer;font-size:12px">×</button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px">
          <input id="hz-seed-input-${p.id}" type="text" placeholder="A belief, practice, or skill to plant now..."
            style="flex:1;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onkeydown="if(event.key==='Enter')horizonAddSeed('${p.id}')"
            onfocus="this.style.borderColor='#00ff88'" onblur="this.style.borderColor=''">
          <button onclick="horizonAddSeed('${p.id}')"
            style="padding:7px 14px;border:1px solid rgba(0,255,136,.4);color:#00ff88;
              background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:7px">+ PLANT</button>
        </div>
      </div>

      <!-- If-Then Commitments — turn a speculative "what if" into a real, actionable "if X then I will do Y" -->
      <div style="margin-bottom:20px">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
          color:#ff8c22;text-transform:uppercase;margin-bottom:8px;
          border-bottom:1px solid rgba(255,140,34,.2);padding-bottom:5px">
          ⚡ IF-THEN COMMITMENTS
          <span style="font-size:6px;color:var(--dim);letter-spacing:0;text-transform:none;margin-left:6px">
            Not "what if" — a specific trigger and a specific action, decided now
          </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;margin-bottom:8px">
          ${p.commitments.map(c => `
            <div style="display:flex;align-items:center;gap:8px;
              padding:8px 12px;background:var(--abyss);border:1px solid var(--wire);
              border-left:2px solid ${c.done ? '#00ff88' : '#ff8c22'}">
              <input type="checkbox" ${c.done ? 'checked' : ''}
                onchange="horizonToggleCommitment('${p.id}','${c.id}',this.checked)"
                style="cursor:pointer;accent-color:#ff8c22">
              <span style="flex:1;font-family:var(--f-mono);font-size:8.5px;
                color:${c.done ? 'var(--dim)' : 'var(--muted)'};${c.done ? 'text-decoration:line-through' : ''}">
                <span style="color:#ff8c22">IF</span> ${escH(c.ifCondition)}
                <span style="color:#ff8c22;margin:0 4px">→ THEN</span> ${escH(c.thenAction)}</span>
              <button onclick="horizonDeleteCommitment('${p.id}','${c.id}')" style="background:none;border:none;color:var(--wire2);cursor:pointer;font-size:12px">×</button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <input id="hz-commit-if-${p.id}" type="text" placeholder="If this happens..."
            style="flex:1;min-width:180px;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onfocus="this.style.borderColor='#ff8c22'" onblur="this.style.borderColor=''">
          <input id="hz-commit-then-${p.id}" type="text" placeholder="...then I will do this"
            style="flex:1;min-width:180px;background:var(--deep);border:1px solid var(--wire2);
              color:var(--white);font-family:var(--f-mono);font-size:9px;padding:7px 10px;outline:none"
            onkeydown="if(event.key==='Enter')horizonAddCommitment('${p.id}')"
            onfocus="this.style.borderColor='#ff8c22'" onblur="this.style.borderColor=''">
          <button onclick="horizonAddCommitment('${p.id}')"
            style="padding:7px 14px;border:1px solid rgba(255,140,34,.4);color:#ff8c22;
              background:transparent;cursor:pointer;font-family:var(--f-mono);font-size:7px">+ COMMIT</button>
        </div>
      </div>
    </div>
  `;
}

function _hzTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function horizonAddSeed(planId) {
  const inp = document.getElementById('hz-seed-input-' + planId);
  const text = inp?.value.trim();
  if (!text) return;
  const p = horizonGetPlan(planId); if (!p) return;
  const _seedId = uuid();
  p.seeds.push({ id: _seedId, text, plantedAt: Date.now(), sproutedAt: null });
  if (typeof latticeIngest === 'function') {
    try { latticeIngest('horizon.seed', _seedId, text, { extra: { planId, planTitle: p.title, domain: p.domain } }); } catch (e) {}
  }
  p.modified = Date.now();
  horizonSave();
  if (typeof almEmit === 'function') almEmit('alm.delta.logged', { id: planId, type: 'horizon-seed', ts: Date.now() });
  horizonSelectPlan(planId);
}
function horizonSproutSeed(planId, seedId) {
  const p = horizonGetPlan(planId); if (!p) return;
  const s = p.seeds.find(s => s.id === seedId); if (!s) return;
  s.sproutedAt = Date.now();
  p.modified = Date.now();
  horizonSave();
  // The actual interconnection: a seed sprouting is real growth signal,
  // not just a Horizon-local checkbox. Logged through ALM's shared delta
  // substrate so it's visible wherever growth is tracked — this is the
  // 'horizon' delta type that sat unused in the type-color map for
  // months before it had anything real to log.
  if (typeof almWriteDelta === 'function') {
    almWriteDelta('horizon', `Seed sprouted: "${s.text}" (${p.title})`, { planId, seedId, kind: 'seed-sprout' });
  }
  horizonSelectPlan(planId);
}
function horizonDeleteSeed(planId, seedId) {
  const p = horizonGetPlan(planId); if (!p) return;
  p.seeds = p.seeds.filter(s => s.id !== seedId);
  p.modified = Date.now();
  horizonSave();
  horizonSelectPlan(planId);
}

function horizonAddCommitment(planId) {
  const ifInp = document.getElementById('hz-commit-if-' + planId);
  const thenInp = document.getElementById('hz-commit-then-' + planId);
  const ifCondition = ifInp?.value.trim();
  const thenAction = thenInp?.value.trim();
  if (!ifCondition || !thenAction) { mm_toast('Both the IF and THEN need to be filled in', 'warn'); return; }
  const p = horizonGetPlan(planId); if (!p) return;
  const _commitId = uuid();
  p.commitments.push({ id: _commitId, ifCondition, thenAction, done: false, ts: Date.now() });
  if (typeof latticeIngest === 'function') {
    try { latticeIngest('horizon.commit', _commitId, 'If ' + ifCondition + ' then ' + thenAction, { extra: { planId, planTitle: p.title } }); } catch (e) {}
  }
  p.modified = Date.now();
  horizonSave();
  horizonSelectPlan(planId);
}
function horizonToggleCommitment(planId, commitId, done) {
  const p = horizonGetPlan(planId); if (!p) return;
  const c = p.commitments.find(c => c.id === commitId); if (!c) return;
  c.done = done;
  p.modified = Date.now();
  horizonSave();
  // Same wire as seed-sprouting — completing a real if-then commitment is
  // growth signal, logged only on the transition TO done, not on undo.
  if (done && typeof almWriteDelta === 'function') {
    almWriteDelta('horizon', `Commitment kept: if ${c.ifCondition} → ${c.thenAction} (${p.title})`, { planId, commitId, kind: 'commitment-kept' });
  }
  horizonSelectPlan(planId);
}
function horizonDeleteCommitment(planId, commitId) {
  const p = horizonGetPlan(planId); if (!p) return;
  p.commitments = p.commitments.filter(c => c.id !== commitId);
  p.modified = Date.now();
  horizonSave();
  horizonSelectPlan(planId);
}

function horizonShowIdentityView() {
  window._hzSelected = null;
  document.querySelectorAll('[id^="hz-plan-item-"]').forEach(el => { el.style.borderLeftColor = 'transparent'; el.style.background = ''; });
  const detail = document.getElementById('hz-detail'); if (!detail) return;
  const plans = HORIZON_STATE.plans;

  if (!plans.length) {
    detail.innerHTML = `<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;
      padding:20px;text-align:center">No plans yet — Who I Am maps what already exists.</div>`;
    return;
  }

  detail.innerHTML = `
    <div style="max-width:900px">
      <div style="margin-bottom:6px;font-family:var(--f-display);font-size:15px;font-weight:800;
        letter-spacing:4px;color:#ffe04a">WHO I AM BECOMING</div>
      <div style="margin-bottom:24px;font-family:var(--f-mono);font-size:8px;color:var(--dim);
        line-height:1.8">Every end-state you've written, by domain — not what you're doing, who you're
        becoming while you do it.</div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
        ${Object.entries(HORIZON_DOMAINS).map(([key, d]) => {
          const domainPlans = plans.filter(p => (p.domain || 'being') === key);
          if (!domainPlans.length) return '';
          return `
            <div style="padding:16px;background:${d.color}0a;border:1px solid ${d.color}33;border-left:3px solid ${d.color}">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
                <span style="font-size:16px;color:${d.color}">${d.icon}</span>
                <span style="font-family:var(--f-display);font-size:10px;font-weight:800;
                  letter-spacing:2px;color:${d.color}">${d.label.toUpperCase()}</span>
              </div>
              ${domainPlans.map(p => {
                const pct = p.milestones.length ? Math.round(p.milestones.filter(m=>m.done).length / p.milestones.length * 100) : 0;
                return `
                <div onclick="horizonSelectPlan('${p.id}')" style="margin-bottom:10px;padding:10px;
                  background:rgba(0,0,0,.25);cursor:pointer;transition:background .15s"
                  onmouseenter="this.style.background='rgba(0,0,0,.4)'" onmouseleave="this.style.background='rgba(0,0,0,.25)'">
                  <div style="font-family:var(--f-body);font-size:10px;font-weight:600;
                    color:var(--bright);margin-bottom:4px">${escH(p.title)}</div>
                  <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
                    line-height:1.6">${escH(p.endState) || '<span style="color:var(--dim);font-style:italic">No end-state written yet</span>'}</div>
                  ${p.milestones.length ? `<div style="margin-top:6px;height:2px;background:var(--wire)">
                    <div style="height:100%;width:${pct}%;background:${d.color}"></div></div>` : ''}
                </div>`;
              }).join('')}
            </div>`;
        }).join('') || `<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;
          grid-column:1/-1;text-align:center;padding:20px">No domains assigned yet.</div>`}
      </div>
    </div>
  `;
}

function horizonAddConditionUI(planId) {
  const input = document.getElementById(`hz-cond-input-${planId}`); if (!input) return;
  const val = input.value.trim(); if (!val) return;
  horizonAddCondition(planId, val);
  input.value = '';
  horizonSelectPlan(planId);
}

function horizonAddMilestoneUI(planId) {
  const label = document.getElementById(`hz-ms-input-${planId}`)?.value.trim();
  const tf = document.getElementById(`hz-ms-tf-${planId}`)?.value;
  if (!label) return;
  horizonAddMilestone(planId, label, tf);
  const input = document.getElementById(`hz-ms-input-${planId}`);
  if (input) input.value = '';
  horizonSelectPlan(planId);
}

function horizonAddFailureModeUI(planId) {
  const text = document.getElementById(`hz-fm-input-${planId}`)?.value.trim();
  const mitigation = document.getElementById(`hz-mit-input-${planId}`)?.value.trim();
  if (!text) return;
  const p = horizonGetPlan(planId); if (!p) return;
  p.failureModes.push({ id: uuid(), text, mitigation: mitigation || '', created: Date.now() });
  p.modified = Date.now();
  horizonSave();
  const fi = document.getElementById(`hz-fm-input-${planId}`);
  const mi = document.getElementById(`hz-mit-input-${planId}`);
  if (fi) fi.value = ''; if (mi) mi.value = '';
  horizonSelectPlan(planId);
}

function horizonAddConstraintUI(planId) {
  const text = document.getElementById(`hz-ct-input-${planId}`)?.value.trim();
  if (!text) return;
  const p = horizonGetPlan(planId); if (!p) return;
  p.constraints.push({ id: uuid(), text, created: Date.now() });
  p.modified = Date.now();
  horizonSave();
  const ci = document.getElementById(`hz-ct-input-${planId}`);
  if (ci) ci.value = '';
  horizonSelectPlan(planId);
}

function horizonToggleCondition(planId, condId, done) {
  const p = horizonGetPlan(planId); if (!p) return;
  const c = p.conditions.find(x => x.id === condId); if (!c) return;
  c.done = done; p.modified = Date.now();
  MMDelta?.push(planId, 'condition_toggle', { done: !done }, { done }, { module: 'horizon' });
  horizonSave();
}

function horizonToggleMilestone(planId, msId, done) {
  const p = horizonGetPlan(planId); if (!p) return;
  const m = p.milestones.find(x => x.id === msId); if (!m) return;
  m.done = done; p.modified = Date.now();
  if (typeof T !== 'undefined') T.milestoneToggled(done);
  MMDelta?.push(planId, 'milestone_toggle', { done: !done }, { done }, { module: 'horizon' });
  horizonSave();
  // Update progress bar live
  const pct = p.milestones.length
    ? Math.round(p.milestones.filter(m2 => m2.done).length / p.milestones.length * 100)
    : 0;
  const bar = document.querySelector(`#hz-detail .hz-progress-fill`);
  if (bar) bar.style.width = pct + '%';
}

async function horizonDeletePlan(planId) {
  if (!(await mmConfirm('Delete this horizon plan? This cannot be undone.'))) return;
  HORIZON_STATE.plans = HORIZON_STATE.plans.filter(p => p.id !== planId);
  window._hzSelected = null;
  MMRegistry?.remove(planId);
  MMDelta?.push(planId, 'plan_delete', { exists: true }, { exists: false }, { module: 'horizon' });
  horizonSave();
  const overlay = document.getElementById('mm-horizon-overlay');
  if (overlay) _renderHorizonUI(overlay);
}

// Init horizon on load
horizonLoad();

/* ═══════════════════════════════════════════════════════════════════
   MODULE: welcome-screen — First entry into Mastermind after setup.
   Shows before the homepage on very first run.
═══════════════════════════════════════════════════════════════════ */

function showWelcomeScreen() {
  let wel = document.getElementById('mm-welcome');
  if (!wel) {
    wel = document.createElement('div');
    wel.id = 'mm-welcome';
    wel.style.cssText = `
      position:fixed;inset:0;z-index:9500;
      background:var(--void);
      display:flex;align-items:center;justify-content:center;
      flex-direction:column;gap:0;
      animation:mmFadeIn .5s ease;
    `;
    wel.innerHTML = `
      <canvas id="mm-welcome-bg" style="position:absolute;inset:0;z-index:0;pointer-events:none"></canvas>
      <div style="position:relative;z-index:1;display:flex;flex-direction:column;
        align-items:center;gap:16px;text-align:center;padding:40px 24px;max-width:640px">

        <!-- Animated sigil -->
        <div style="position:relative;width:88px;height:88px;margin-bottom:8px">
          <div style="position:absolute;inset:0;border-radius:50%;border:1px solid rgba(0,200,255,.4);
            animation:sigilSpin 8s linear infinite"></div>
          <div style="position:absolute;inset:8px;border-radius:50%;border:1px solid rgba(204,68,255,.3);
            animation:sigilSpin 12s linear infinite reverse"></div>
          <div style="position:absolute;inset:18px;border-radius:50%;border:1px solid rgba(0,255,136,.2);
            animation:sigilSpin 16s linear infinite"></div>
          <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"
            style="position:absolute;inset:0;width:100%;height:100%">
            <polygon points="40,8 72,26 72,54 40,72 8,54 8,26"
              fill="none" stroke="rgba(0,200,255,.35)" stroke-width="1"/>
            <circle cx="40" cy="40" r="6" fill="none" stroke="rgba(0,200,255,.6)" stroke-width="1.2"/>
            <circle cx="40" cy="40" r="3" fill="rgba(0,200,255,.9)"/>
          </svg>
        </div>

        <!-- Title -->
        <div style="font-family:var(--f-display);font-size:clamp(24px,5vw,48px);font-weight:900;
          letter-spacing:10px;text-transform:uppercase;
          background:linear-gradient(135deg,var(--rgb1),var(--rgb2),var(--rgb3),var(--rgb4),var(--rgb5));
          -webkit-background-clip:text;-webkit-text-fill-color:transparent;
          background-clip:text;background-size:300%;animation:rgbShift 4s ease infinite">
          MASTERMIND
        </div>
        <div style="font-family:var(--f-mono);font-size:9px;letter-spacing:5px;
          color:var(--dim);text-transform:uppercase;margin-top:-8px">
          THE MAPPING TOOL
        </div>

        <!-- Tagline line -->
        <div style="font-family:var(--f-mono);font-size:9px;letter-spacing:3px;
          color:var(--mid);margin:4px 0;display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          ${['MAP','LEARN','UNDERSTAND','PLAN','LIVE'].map(w =>
            `<span style="color:var(--c);opacity:.8">${w}</span>`
          ).join('<span style="color:var(--wire2)">·</span>')}
        </div>

        <!-- Description -->
        <div style="font-family:var(--f-body);font-size:13px;color:var(--muted);
          max-width:480px;line-height:1.8;font-weight:300;font-style:italic;margin:8px 0">
          A system for mapping and building identity.<br>
          Planning life and skill building.<br>
          Understanding every part of you — mind, body and soul.
        </div>

        <!-- Begin button -->
        <button id="mm-welcome-begin"
          onclick="dismissWelcomeScreen()"
          style="margin-top:16px;padding:18px 52px;
            border:1px solid var(--c);background:rgba(0,200,255,.08);
            color:var(--c);font-family:var(--f-display);font-size:12px;
            font-weight:700;letter-spacing:5px;text-transform:uppercase;
            cursor:pointer;transition:all .3s;position:relative;overflow:hidden;
            clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,0 100%)"
          onmouseenter="this.style.background='rgba(0,200,255,.18)';this.style.boxShadow='0 0 40px rgba(0,200,255,.25)'"
          onmouseleave="this.style.background='rgba(0,200,255,.08)';this.style.boxShadow=''">
          Let's begin this journey.
        </button>

        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:1px;
          color:var(--dim);margin-top:8px">
          Press <span style="color:var(--mid)">ENTER</span> or click above to continue
        </div>
      </div>
    `;
    document.body.appendChild(wel);

    // Animated background
    _initWelcomeBg(wel.querySelector('#mm-welcome-bg'));

    // Keyboard shortcut
    const onKey = e => {
      if (e.key === 'Enter' || e.key === ' ') { dismissWelcomeScreen(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
  }
  wel.style.display = 'flex';
}

function dismissWelcomeScreen() {
  const el = document.getElementById('mm-welcome');
  if (!el) return;
  el.style.transition = 'opacity .5s';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none'; // stop catching clicks immediately, not 520ms from now
  setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; el.style.pointerEvents = ''; }, 520);
  // Mark as seen
  localStorage.setItem('mm_welcome_seen', '1');
  MMLog?.info('core', 'Welcome screen dismissed');
}

function _initWelcomeBg(cvs) {
  if (!cvs) return;
  const resize = () => { cvs.width = window.innerWidth; cvs.height = window.innerHeight; };
  resize();
  window.addEventListener('resize', resize);
  const ctx = cvs.getContext('2d');
  const dots = Array.from({ length: 60 }, () => ({
    x: Math.random() * innerWidth, y: Math.random() * innerHeight,
    vx: (Math.random() - .5) * .3, vy: (Math.random() - .5) * .3,
    r: Math.random() * 1.4 + .3,
    col: ['#00c8ff','#cc44ff','#00ff88','#ff8c22'][0 | Math.random() * 4],
    a: Math.random() * .15 + .04, pulse: Math.random() * Math.PI * 2,
  }));
  let running = true;
  const tick = () => {
    if (!running || !document.getElementById('mm-welcome')) { running = false; return; }
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    dots.forEach(d => {
      d.x += d.vx; d.y += d.vy; d.pulse += .015;
      if (d.x < 0) d.x = cvs.width; if (d.x > cvs.width) d.x = 0;
      if (d.y < 0) d.y = cvs.height; if (d.y > cvs.height) d.y = 0;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = d.col;
      ctx.globalAlpha = d.a * (.6 + .4 * Math.sin(d.pulse));
      ctx.fill(); ctx.globalAlpha = 1;
    });
    requestAnimationFrame(tick);
  };
  tick();
}

/* ── Wire welcome screen into app startup ───────────────────────── */
// Called from auth after first login / after features confirm
function maybeShowWelcome() {
  const seen = localStorage.getItem('mm_welcome_seen');
  const firstTime = localStorage.getItem('mm_first_welcome_done');
  // localStorage doesn't survive an uninstall/reinstall; the vault does.
  // A vault with real save history is unambiguously not a first-time
  // identity regardless of what this machine's localStorage remembers —
  // without this, every reinstall replays the first-run splash on top of
  // years of real data.
  const returningVault = typeof VAULT !== 'undefined' && (VAULT.saveCount || 0) > 1;
  if (returningVault) {
    localStorage.setItem('mm_welcome_seen', '1');
    localStorage.setItem('mm_first_welcome_done', '1');
    return;
  }
  if (!seen && !firstTime) {
    localStorage.setItem('mm_first_welcome_done', '1');
    setTimeout(() => showWelcomeScreen(), 300);
  }
}

/* ── Patch featuresConfirm to show welcome ─────────────────────── */
const _origFeaturesConfirm = typeof featuresConfirm === 'function' ? featuresConfirm : null;
// We can't easily patch it here but call maybeShowWelcome from the homepage build
const _origBuildHomepage = buildHomepage;
window.buildHomepage = function() {
  _origBuildHomepage();
  // On first run show welcome after a tick
  if (!localStorage.getItem('mm_welcome_seen')) {
    // Don't show yet — wait for auth complete. maybeShowWelcome() is called there.
  }
};

/* ── Add Horizon + Brain Mode buttons to topbar ────────────────── */
// Inject after DOM ready
function _injectTopbarExtras() {
  const topbar = document.getElementById('tb-canvas-tools'); if (!topbar) return;
  if (document.getElementById('tb-horizon-btn')) return; // already injected
  const sep = document.createElement('div'); sep.className = 'tb-sep';
  const hzBtn = document.createElement('button');
  hzBtn.id = 'tb-horizon-btn';
  hzBtn.className = 'tb-btn';
  hzBtn.textContent = '◎ HORIZON';
  hzBtn.title = 'Horizon Planning';
  hzBtn.onclick = openHorizon;
  const brainBtn = document.createElement('button');
  brainBtn.id = 'tb-brainmode-btn';
  brainBtn.className = 'tb-btn';
  brainBtn.textContent = '⬡ MODES';
  brainBtn.title = 'Brain Modes (Cognition · Emotions · Creativity)';
  brainBtn.onclick = () => openBrainModeSelector('canvas');
  // Insert before the SAVE button area
  const saveBtn = topbar.querySelector('.tb-btn[onclick*="saveCanvas"]');
  if (saveBtn) {
    topbar.insertBefore(sep, saveBtn);
    topbar.insertBefore(hzBtn, saveBtn);
    topbar.insertBefore(brainBtn, saveBtn);
  } else {
    topbar.appendChild(sep);
    topbar.appendChild(hzBtn);
    topbar.appendChild(brainBtn);
  }
}

/* ── Homepage extras — buttons now in HTML, no dynamic injection needed ── */
function _injectHomepageExtras() {
  // Buttons (MODES, VOID, ALM, OPTIONS) are defined in index-browser.html hp-footer.
  // HORIZON and SEED have been removed from footer per spec.
  // This function is a no-op to prevent duplicate injection.
}




// Run injections after DOM is ready
(function _waitAndInject() {
  const run = () => {
    _injectTopbarExtras();
    _injectHomepageExtras();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else setTimeout(run, 100);
})();

console.log('[MASTERMIND] Brain Modes · Horizon Planning · Welcome Screen loaded');



/* ═══════════════════════════════════════════════════════════════════
   FEATURE GATE — enterprise-grade gating with toast + error log
   Every feature that isn't fully implemented calls this.
═══════════════════════════════════════════════════════════════════ */
const FEATURE_GATES = {
  // key: { label, reason, status, logLevel }
  collab:        { label: 'Collaboration',       reason: 'P2P sync not yet connected — coming in v4',       status: 'planned'  },
  voice:         { label: 'Voice Input',          reason: 'Web Speech API integration pending',              status: 'planned'  },
  cloud:         { label: 'Cloud Sync',           reason: 'Backend not yet configured',                      status: 'planned'  },
  update:        { label: 'Auto-Update',          reason: 'Update server not connected in this build',       status: 'partial'  },
  emotions_full: { label: 'Emotions Module',      reason: 'Full toolkit under construction — use Brain Map → Emotions for now', status: 'partial' },
  relationships: { label: 'Relational Systems Module', reason: 'Module under construction — use Brain Map → Relational Systems for now', status: 'partial' },
  alm_full:      { label: 'ALM Full Suite',       reason: 'Some ALM sections are stubs — core features work', status: 'partial' },
  export_png:    { label: 'PNG Export',           reason: 'Canvas-to-image export not yet implemented',      status: 'planned'  },
  multi_vault:   { label: 'Multiple Vaults',      reason: 'Single vault per user — multi-vault in v4',       status: 'planned'  },
  plugin:        { label: 'Plugin System',        reason: 'Extension API not yet available',                 status: 'planned'  },
};

function gateFeature(key, fallbackFn) {
  const gate = FEATURE_GATES[key];
  const label = gate?.label || key;
  const reason = gate?.reason || 'This feature is not yet available in this build';
  const status = gate?.status || 'planned';

  // Toast — top-right, error type, stays 5 seconds
  const icon = status === 'partial' ? '⚠' : '◈';
  mm_toast(`${icon} ${label}: ${reason}`, status === 'partial' ? 'warn' : 'error', { dur: 5000 });

  // Error log — always
  if (typeof MMLog !== 'undefined') {
    MMLog.warn('gate', `Feature gated: ${key} — ${reason}`);
  }

  // Console trace for devs
  console.warn(`[GATE] ${key}:`, reason);

  // Optional fallback
  if (typeof fallbackFn === 'function') fallbackFn();
}

// Gate wrappers for specific stubs
function gateCollaboration()  { gateFeature('collab'); }
function gateVoiceInput()     { gateFeature('voice'); }
function gateCloudSync()      { gateFeature('cloud'); }
function gateExportPNG()      { gateFeature('export_png'); }
function gatePlugins()        { gateFeature('plugin'); }

/* ═══════════════════════════════════════════════════════════════════
   MODULE: toast-system — comprehensive status toasts for every feature
   All user-visible states: autosave, vault lock/unlock, export,
   loading, errors, collaboration, sync, and more.
═══════════════════════════════════════════════════════════════════ */

const TOAST_TYPES = {
  info:       { color: 'var(--c)',      icon: '◈', dur: 2500 },
  success:    { color: 'var(--g)',      icon: '✓', dur: 2800 },
  warn:       { color: 'var(--o)',      icon: '⚠', dur: 3500 },
  error:      { color: 'var(--r)',      icon: '⚡', dur: 4500 },
  vault:      { color: 'var(--v)',      icon: '⬡', dur: 3000 },
  sync:       { color: 'var(--teal)',   icon: '↺', dur: 2500 },
  export:     { color: 'var(--gold)',   icon: '↓', dur: 3000 },
  collab:     { color: '#ff66aa',       icon: '⌁', dur: 3500 },
  brain:      { color: 'var(--c)',      icon: '◎', dur: 2500 },
  loading:    { color: 'var(--dim)',    icon: '…', dur: 99999 },
};

const _toastQueue = [];
let _toastActive = false;
let _toastPersistent = null;

function mm_toast(msg, type = 'info', opts = {}) {
  // Dismiss any existing persistent toast
  if (opts.persistent) {
    _showToastNow({ msg, type, persistent: true, id: opts.id || null });
    return opts.id || null;
  }
  const item = { msg, type, dur: opts.dur || TOAST_TYPES[type]?.dur || 2500 };
  if (_toastActive) {
    _toastQueue.push(item);
  } else {
    _showToastNow(item);
  }
}

function _showToastNow(item) {
  _toastActive = true;
  const el = document.getElementById('toast');
  if (!el) { _toastActive = false; return; }
  const def = TOAST_TYPES[item.type] || TOAST_TYPES.info;

  // Top-right position for errors, warnings, vault, gate events
  const topRight = ['error','warn','vault','collab'].includes(item.type);
  el.classList.toggle('pos-tr', topRight);

  el.style.color = def.color;
  el.style.borderColor = def.color + '55';
  el.style.boxShadow = `0 0 20px ${def.color}22`;
  el.textContent = def.icon + ' ' + item.msg;
  el.classList.add('show');
  if (item.persistent) {
    _toastPersistent = item;
    return;
  }
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => {
      _toastActive = false;
      el.classList.remove('pos-tr');
      if (_toastQueue.length) _showToastNow(_toastQueue.shift());
    }, 220);
  }, item.dur);
}

function mm_toast_dismiss(clearQueue = false) {
  const el = document.getElementById('toast');
  if (el) el.classList.remove('show');
  _toastPersistent = null;
  _toastActive = false;
  if (clearQueue) {
    _toastQueue.length = 0; // clear all pending toasts
  } else if (_toastQueue.length) {
    _showToastNow(_toastQueue.shift());
  }
}

function mm_toast_clear() {
  // Hard-clear all toasts and queue — used on login failure to prevent stale success toasts
  const el = document.getElementById('toast');
  if (el) { el.classList.remove('show'); el.style.opacity = '0'; }
  _toastPersistent = null;
  _toastActive = false;
  _toastQueue.length = 0;
  if (_loginUnlockToastTimer) { clearTimeout(_loginUnlockToastTimer); _loginUnlockToastTimer = null; }
}

// ── Feature state toasts ─────────────────────────────────────────
const T = {
  // Vault & auth
  vaultUnlocked:    (user) => mm_toast(`Vault unlocked · Welcome back, ${user}`, 'vault'),
  vaultLocked:      ()     => mm_toast('Vault locked · Session ended', 'vault'),
  vaultCreated:     (user) => mm_toast(`Vault created for ${user} · AES-256-GCM`, 'success'),
  vaultSaved:       (n)    => mm_toast(`Autosaved · ${n} nodes`, 'sync', { dur: 1800 }),
  vaultSaveFailed:  ()     => mm_toast('Autosave failed · Check storage', 'error'),
  vaultLoaded:      (n)    => mm_toast(`Vault loaded · ${n} nodes restored`, 'success'),
  vaultIntegrityOk: ()     => mm_toast('Vault integrity check passed ✓', 'success'),
  vaultIntegrityFail:()    => mm_toast('Vault integrity issue detected — run Diagnostics', 'error'),
  vaultDecrypted:   ()     => mm_toast('Vault decrypted · Running in plaintext mode', 'warn'),
  snapshotCreated:  (lbl)  => mm_toast(`Snapshot: "${lbl}"`, 'vault'),
  snapshotRestored: (lbl)  => mm_toast(`Snapshot restored: "${lbl}"`, 'success'),
  backupDownloaded: ()     => mm_toast('Backup downloaded · Keep it safe', 'export'),
  backupImported:   ()     => mm_toast('Backup imported · Canvas restored', 'success'),
  keyExported:      (type) => mm_toast(`${type} key exported`, 'export'),

  // Canvas ops
  nodeSaved:        (title)=> mm_toast(`Node saved: ${title.slice(0,20)}`, 'sync', { dur: 1600 }),
  nodeDeleted:      ()     => mm_toast('Node deleted', 'warn', { dur: 1800 }),
  nodesDuplicated:  (n)    => mm_toast(`${n} node${n>1?'s':''} duplicated`, 'info'),
  canvasSaved:      (n)    => mm_toast(`Canvas saved · ${n} nodes`, 'success'),
  canvasLoaded:     (n)    => mm_toast(`Canvas loaded · ${n} nodes`, 'success'),
  canvasCleared:    ()     => mm_toast('Canvas cleared', 'warn'),
  canvasExported:   ()     => mm_toast('Canvas exported to JSON', 'export'),
  canvasImported:   (n)    => mm_toast(`Imported ${n} nodes`, 'success'),
  linkCreated:      ()     => mm_toast('Connection created', 'info', { dur: 1500 }),
  fractalExpanded:  (n)    => mm_toast(`∞ Fractal: ${n} children spawned`, 'info'),

  // Brain map
  brainModeEntered: (mode) => mm_toast(`Brain Map · ${mode} mode`, 'brain'),
  brainPopulated:   (n)    => mm_toast(`Brain map populated · ${n} domains`, 'brain'),
  domainAdded:      (name) => mm_toast(`Domain added: ${name}`, 'success'),
  domainRemoved:    (name) => mm_toast(`Domain removed: ${name}`, 'warn'),
  domainImported:   (n)    => mm_toast(`${n} domains imported`, 'success'),
  domainExported:   ()     => mm_toast('Domains exported to JSON', 'export'),
  synthesisFound:   (n)    => mm_toast(`${n} cross-domain synthesis points found`, 'brain'),

  // Tags
  tagAdded:         (tag)  => mm_toast(`Tag: #${tag}`, 'info', { dur: 1500 }),
  tagRemoved:       (tag)  => mm_toast(`Tag removed: #${tag}`, 'info', { dur: 1500 }),
  tagsCleared:      ()     => mm_toast('All tags cleared', 'warn'),

  // Horizon
  planCreated:      (title)=> mm_toast(`Horizon plan: "${title}"`, 'success'),
  planExported:     ()     => mm_toast('Horizon plan exported to canvas', 'export'),
  milestoneToggled: (done) => mm_toast(done ? '✓ Milestone complete' : 'Milestone reopened', done ? 'success' : 'warn', { dur: 1800 }),

  // Exports / integrations
  exportedJSON:     ()     => mm_toast('Exported to JSON', 'export'),
  exportedNotion:   ()     => mm_toast('Exported Notion-compatible JSON', 'export'),
  exportedObsidian: ()     => mm_toast('Exported Obsidian markdown', 'export'),
  exportedCSV:      ()     => mm_toast('Exported CSV', 'export'),
  exportedPNG:      ()     => mm_toast('Canvas exported as image', 'export'),

  // AI
  aiEnabled:        ()     => mm_toast('AI features enabled', 'success'),
  aiDisabled:       ()     => mm_toast('AI features disabled', 'warn'),
  aiThinking:       ()     => mm_toast('AI thinking…', 'loading'),
  aiDone:           ()     => { mm_toast_dismiss(); mm_toast('AI response ready', 'success'); },
  aiError:          (msg)  => { mm_toast_dismiss(); mm_toast(`AI error: ${msg}`, 'error'); },
  aiNotConfigured:  ()     => mm_toast('AI not configured · Open Settings → AI', 'warn'),

  // Collaboration (future)
  collabConnected:  (user) => mm_toast(`Collaborator connected: ${user}`, 'collab'),
  collabDisconnected:(user)=> mm_toast(`Collaborator left: ${user}`, 'warn'),
  collabSyncing:    ()     => mm_toast('Syncing with collaborator…', 'sync'),
  collabSynced:     ()     => mm_toast('Sync complete', 'sync'),
  collabFutureFeature:()   => mm_toast('Collaboration coming soon · Stay tuned', 'collab'),

  // Storage / browser
  storageNearFull:  (pct)  => mm_toast(`Storage ${pct}% full · Export a backup soon`, 'warn'),
  storageFull:      ()     => mm_toast('Storage full · Export and clear old data', 'error'),
  browserMode:      ()     => mm_toast('Browser mode · Data stored in localStorage', 'info'),

  // Settings & options
  themeChanged:     (name) => mm_toast(`Theme: ${name}`, 'info', { dur: 1600 }),
  settingsSaved:    ()     => mm_toast('Settings saved', 'success', { dur: 1500 }),
  pinChanged:       ()     => mm_toast('PIN updated', 'success'),
  passwordChanged:  ()     => mm_toast('Password changed · Vault re-encrypted', 'vault'),

  // Generic
  copied:           (what) => mm_toast(`${what} copied to clipboard`, 'info', { dur: 1600 }),
  notImplemented:   (feat) => mm_toast(`${feat || 'Feature'} coming soon`, 'warn'),
  error:            (msg)  => mm_toast(msg || 'Something went wrong', 'error'),
  loading:          (msg)  => mm_toast(msg || 'Loading…', 'loading'),
  loadingDone:      ()     => mm_toast_dismiss(),
};

// Replace old global toast() with T-backed version
window.toast = (msg, type) => mm_toast(msg, type || 'info');

// Autosave toast — debounced, only shows occasionally to avoid spam
let _autosaveToastTimer = null;
let _autosaveCount = 0;
function _autosaveToast() {
  _autosaveCount++;
  // Only show every 5th autosave to avoid spam
  if (_autosaveCount % 5 !== 0) return;
  T.vaultSaved(CANVAS.NX.nodes.length);
}

// Hook into vault save events
if (typeof _MM_BUS !== 'undefined') {
  _MM_BUS.on('vault:saved',   () => _autosaveToast());
  _MM_BUS.on('vault:dirty',   () => {}); // silent
  _MM_BUS.on('vault:created', (meta) => T.vaultCreated(meta?.username || 'operator'));
  _MM_BUS.on('vault:loaded',  ()     => T.vaultLoaded(CANVAS.NX.nodes.length));
  _MM_BUS.on('vault:backup_imported', () => T.backupImported());
  _MM_BUS.on('vault:snapshot',        (s) => T.snapshotCreated(s?.label || 'Snapshot'));
  _MM_BUS.on('vault:snapshot_restored',(s) => T.snapshotRestored(s?.label || 'Snapshot'));
  _MM_BUS.on('vault:integrity_fail',  () => T.vaultIntegrityFail());
  _MM_BUS.on('tags:tag',     (d) => { /* silent for now */ });
  _MM_BUS.on('tags:updated', (d) => { /* silent */ });
}


/* ═══════════════════════════════════════════════════════════════════
   MODULE: brain-map-v2 — 13 meta-domain hub with expand layers,
   intelligence/intuition type tags, cross-domain synthesis,
   lazy loading, caching, export (JSON, Notion, Obsidian, CSV)
═══════════════════════════════════════════════════════════════════ */

// ── 13 Meta-Domain taxonomy (complete) ───────────────────────────
const MM_META_DOMAINS = {
  'SCIENCE & SYSTEMS':    { color:'#00c8ff', icon:'◈', intelligences:['logical-mathematical','systems','naturalist'],                   intuitions:['analytical','pattern'] },
  'ARTS & EXPRESSION':    { color:'#cc44ff', icon:'◉', intelligences:['musical','spatial','linguistic','creative','bodily-kinesthetic'], intuitions:['aesthetic','expressive'] },
  'SOCIAL & RELATIONAL':  { color:'#00ff88', icon:'⬡', intelligences:['interpersonal','linguistic','emotional','existential'],           intuitions:['social','empathic'] },
  'MIND & COGNITION':     { color:'#ff8c22', icon:'∿', intelligences:['logical-mathematical','intrapersonal','spatial','systems','emotional'], intuitions:['metacognitive','introspective'] },
  'BODY & EMBODIMENT':    { color:'#00ff88', icon:'◆', intelligences:['bodily-kinesthetic','naturalist','embodied','intrapersonal'],     intuitions:['somatic','kinesthetic'] },
  'STRATEGY & SYSTEMS':   { color:'#ffe04a', icon:'→', intelligences:['logical-mathematical','systems','spatial','interpersonal'],        intuitions:['strategic','predictive'] },
  'TECHNOLOGY':           { color:'#7744ff', icon:'⊞', intelligences:['logical-mathematical','spatial','systems','creative'],             intuitions:['technical','systems'] },
  'NATURE & COSMOS':      { color:'#d4a820', icon:'✦', intelligences:['naturalist','spatial','logical-mathematical','existential'],       intuitions:['ecological','cosmic'] },
  'SPIRIT & MEANING':     { color:'#ff66aa', icon:'◎', intelligences:['existential','intrapersonal','interpersonal','creative'],          intuitions:['existential','transpersonal'] },
  'LANGUAGE & NARRATIVE': { color:'#11ddcc', icon:'⬢', intelligences:['linguistic','interpersonal','creative','spatial'],                 intuitions:['narrative','symbolic'] },
  'ECONOMICS & VALUE':    { color:'#ffd700', icon:'◆', intelligences:['logical-mathematical','interpersonal','systems'],                  intuitions:['economic','value'] },
  'HEALTH & VITALITY':    { color:'#00ffaa', icon:'♥', intelligences:['bodily-kinesthetic','naturalist','intrapersonal','emotional'],     intuitions:['somatic','healing'] },
  'IDENTITY & GROWTH':    { color:'#ff8866', icon:'◈', intelligences:['intrapersonal','existential','emotional','creative'],              intuitions:['self-knowledge','transformative'] },
};

// Sub-domain definitions per meta-domain
const MM_SUB_DOMAINS = {
  'SCIENCE & SYSTEMS':    { 'Physics':['Quantum','Classical','Thermodynamics','Relativity','Astrophysics'], 'Mathematics':['Pure','Applied','Statistics','Topology','Chaos Theory'], 'Biology':['Molecular','Genetics','Ecology','Evolution','Neurobiology'], 'Chemistry':['Organic','Biochemistry','Quantum Chemistry'], 'Computer Science':['Algorithms','AI/ML','Systems','Networks','Security'], 'Neuroscience':['Cognitive','Computational','Behavioral','Plasticity'], 'Systems Theory':['Cybernetics','Complexity','Information Theory','Emergence'] },
  'ARTS & EXPRESSION':    { 'Music':['Composition','Performance','Theory','Production','Improvisation'], 'Visual Art':['Drawing','Painting','Digital','Photography','Installation'], 'Design':['UX/UI','Graphic','Industrial','Typography','Interaction'], 'Writing':['Fiction','Poetry','Screenwriting','Philosophy of Language'], 'Architecture':['Structural','Urban','Spatial','Sustainable'], 'Performance':['Theater','Dance','Comedy','Improvisation'] },
  'SOCIAL & RELATIONAL':  { 'Psychology':['Cognitive','Behavioral','Clinical','Social','Positive','Jungian'], 'Philosophy':['Ethics','Epistemology','Logic','Phenomenology'], 'Sociology':['Culture','Identity','Movements','Community'], 'Communication':['Rhetoric','Nonverbal','Interpersonal','Persuasion'], 'Economics':['Behavioral','Game Theory','Complexity'], 'Political Science':['Theory','Governance','Power'] },
  'MIND & COGNITION':     { 'Metacognition':['Frameworks','Loops','Integration','Signal/Noise','Compression'], 'Learning':['Skill Acquisition','Meta-Learning','Deliberate Practice','Transfer'], 'Creativity':['Divergent Thinking','Incubation','Insight','Flow'], 'Intelligence':['Emotional','Social','Analytical','Multiple Intelligences'], 'Consciousness':['Self-Awareness','Qualia','Integration','Attention'], 'Decision Theory':['Heuristics','Biases','Risk','Bayesian'] },
  'BODY & EMBODIMENT':    { 'Movement':['Martial Arts','Dance','Yoga','Somatic','Feldenkrais'], 'Health':['Preventive','Integrative','Physiology','Nutrition'], 'Somatic Psychology':['Polyvagal','Embodied Cognition','Trauma','Interoception'], 'Performance':['Peak State','Recovery','Flow','Mental Game'] },
  'STRATEGY & SYSTEMS':   { 'Strategy':['Game Theory','Military','Adaptive','Scenario Planning'], 'Innovation':['First Principles','Design Thinking','Disruptive','Biomimicry'], 'Leadership':['Transformational','Adaptive','Influence'], 'Systems Design':['Feedback Loops','Resilience','Optimization','Emergence'], 'Project Management':['Agile','OKRs','Risk','Estimation'] },
  'TECHNOLOGY':           { 'Software':['Frontend','Backend','DevOps','Architecture','Security'], 'AI/ML':['Machine Learning','Deep Learning','NLP','Generative AI','AI Safety'], 'Data Science':['Statistics','Visualization','Forecasting','Causal Inference'], 'Networks':['Protocols','Distributed','Cloud','Security'], 'Cybersecurity':['Offensive','Cryptography','Privacy','Zero Trust'] },
  'NATURE & COSMOS':      { 'Astronomy':['Cosmology','Planetary','Stellar','Exoplanets'], 'Earth Science':['Geology','Climatology','Oceanography'], 'Ecology':['Conservation','Biodiversity','Climate Adaptation'], 'Philosophy of Nature':['Emergence','Complexity','Deep Ecology'] },
  'SPIRIT & MEANING':     { 'Philosophy of Mind':['Consciousness','Identity','Free Will','Phenomenology'], 'Spirituality':['Meditation','Non-dual Awareness','Integration','Shadow Work'], 'Mythology':['Archetypes','Hero Journey','Symbol','Narrative'], 'Ethics':['Virtue','Consequentialism','Care Ethics','Meta-Ethics'], 'Meaning Making':['Existentialism','Purpose','Values','Ikigai'] },
  'LANGUAGE & NARRATIVE': { 'Linguistics':['Syntax','Semantics','Pragmatics','Phonology'], 'Rhetoric':['Persuasion','Argument','Style','Audience'], 'Storytelling':['Structure','Character','Theme','Voice'], 'Semiotics':['Signs','Symbols','Codes','Meaning'], 'Literary Theory':['Structuralism','Deconstruction','Narrative Theory'] },
  'ECONOMICS & VALUE':    { 'Microeconomics':['Supply/Demand','Markets','Incentives','Pricing'], 'Macroeconomics':['Monetary','Fiscal','Growth','Inflation'], 'Behavioral Economics':['Biases','Nudges','Choice Architecture'], 'Value Theory':['Intrinsic','Instrumental','Moral Value'], 'Finance':['Investment','Risk','Markets','Valuation'] },
  'HEALTH & VITALITY':    { 'Nutrition':['Metabolic','Gut-Brain','Microbiome','Fasting'], 'Sleep Science':['Circadian','Recovery','Memory Consolidation'], 'Mental Health':['Anxiety','Depression','Trauma','Resilience'], 'Longevity':['Epigenetics','Telomeres','Blue Zones','Optimization'] },
  'IDENTITY & GROWTH':    { 'Self-Concept':['Core Beliefs','Values','Narrative Identity'], 'Inner Work':['Shadow','Integration','Trauma Healing','Self-Love'], 'Growth Mindset':['Neuroplasticity','Deliberate Practice','Feedback Loops'], 'Embodiment Lab':['Identity Design','Becoming','Ritual','Embodiment'] },
};

// Intelligence type → tag mapping
const MM_INTEL_TAGS = {
  'logical-mathematical': { icon:'◈', color:'#00c8ff', shortLabel:'Logic' },
  'linguistic':           { icon:'⬡', color:'#00ff88', shortLabel:'Language' },
  'spatial':              { icon:'⊞', color:'#cc44ff', shortLabel:'Spatial' },
  'musical':              { icon:'∿', color:'#ff66aa', shortLabel:'Musical' },
  'bodily-kinesthetic':   { icon:'◆', color:'#00ff88', shortLabel:'Kinesthetic' },
  'interpersonal':        { icon:'⬢', color:'#ff8c22', shortLabel:'Interpersonal' },
  'intrapersonal':        { icon:'◉', color:'#7744ff', shortLabel:'Intrapersonal' },
  'naturalist':           { icon:'✦', color:'#d4a820', shortLabel:'Naturalist' },
  'existential':          { icon:'∞', color:'#ff3355', shortLabel:'Existential' },
  'creative':             { icon:'◈', color:'#cc44ff', shortLabel:'Creative' },
  'systems':              { icon:'→', color:'#ffe04a', shortLabel:'Systems' },
  'emotional':            { icon:'⚡', color:'#ff3355', shortLabel:'Emotional' },
  'embodied':             { icon:'▾', color:'#00ff88', shortLabel:'Embodied' },
};

// Intuition type → tag mapping
const MM_INTUITION_TAGS = {
  'analytical':       { color:'#00c8ff', desc:'Pattern-based logical intuition' },
  'aesthetic':        { color:'#cc44ff', desc:'Felt sense of beauty/form' },
  'social':           { color:'#00ff88', desc:'Reading people and dynamics' },
  'empathic':         { color:'#ff66aa', desc:'Felt resonance — empathic attunement' },
  'somatic':          { color:'#00ffaa', desc:'Body-based knowing' },
  'kinesthetic':      { color:'#00ff88', desc:'Movement and spatial sense' },
  'strategic':        { color:'#ffe04a', desc:'Anticipating consequences' },
  'predictive':       { color:'#d4a820', desc:'Future-state sensing' },
  'technical':        { color:'#7744ff', desc:'Systems and logic intuition' },
  'ecological':       { color:'#00ff88', desc:'Nature pattern recognition' },
  'cosmic':           { color:'#d4a820', desc:'Meaning and cosmos sense' },
  'existential':      { color:'#ff3355', desc:'Meaning and purpose sensing' },
  'transpersonal':    { color:'#ff66aa', desc:'Beyond-self awareness' },
  'narrative':        { color:'#11ddcc', desc:'Story and meaning sense' },
  'symbolic':         { color:'#cc44ff', desc:'Symbol and archetype sense' },
  'economic':         { color:'#ffd700', desc:'Value and exchange intuition' },
  'value':            { color:'#ffd700', desc:'Worth and priority sensing' },
  'healing':          { color:'#00ffaa', desc:'Body-mind healing sense' },
  'self-knowledge':   { color:'#ff8866', desc:'Inner landscape knowing' },
  'transformative':   { color:'#ff8866', desc:'Growth and change sensing' },
  'metacognitive':    { color:'#ff8c22', desc:'Thinking-about-thinking sense' },
  'introspective':    { color:'#7744ff', desc:'Inner state awareness' },
};

// ── Brain Map V2 State ────────────────────────────────────────────
const BMV2 = {
  _cache: new Map(),           // key → rendered data (lazy load cache)
  _expanded: new Set(),        // expanded meta domains
  _nodes: [],                  // all brain nodes
  _links: [],                  // all brain links
  _mode: null,                 // current mode: null | 'emotions' | 'creativity' | 'cognition'
  _customDomains: [],          // user-added custom domains
  _customSubs: {},             // custom sub-domains per meta
  _pan: { x: 0, y: 0, zoom: 1 },
  _dragging: false,
  _dragStart: null,
  _selectedNode: null,
  _raf: null,
  _dirty: true,
  _zoomLevel: 0,                // 0 = 13 meta-domains only · 1 = + subdomains of expanded metas · 2 = + canvas nodes & custom domains
  // _camAz, _camEl: orbit camera azimuth/elevation (radians). Left undefined
  // here on purpose — every read site falls back to BMV2_DEFAULT_ELEVATION
  // (top-down), which is declared further down near _bmProjectNodes.
};
const BMV2_ZOOM_LEVELS = [
  { key: 0, label: 'META',   icon: '◉', hint: '13 meta-domains' },
  { key: 1, label: 'DOMAINS', icon: '◎', hint: 'expanded sub-domains' },
  { key: 2, label: 'DETAIL', icon: '◈', hint: '+ canvas nodes' },
];
const BMV2_STORAGE_KEY = 'mm_brain_map_v2';

// ── Lazy-load + cache helper ──────────────────────────────────────
function _bmCacheGet(key) { return BMV2._cache.get(key) || null; }
function _bmCacheSet(key, val) { BMV2._cache.set(key, val); }
function _bmCacheInvalidate(key) { if (key) BMV2._cache.delete(key); else BMV2._cache.clear(); }

// ── Persistence ───────────────────────────────────────────────────
function bmv2Save() {
  try {
    const data = {
      expanded: [...BMV2._expanded],
      customDomains: BMV2._customDomains,
      customSubs: BMV2._customSubs,
      intelligenceRatings: DOMAIN_STATE.intelligenceRatings,
    };
    localStorage.setItem(BMV2_STORAGE_KEY, JSON.stringify(data));
  } catch(e) { T.error('Brain map save failed'); }
  if (typeof vaultDirtySave === 'function') vaultDirtySave(5000);
}

function bmv2Load() {
  try {
    const raw = localStorage.getItem(BMV2_STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.expanded) BMV2._expanded = new Set(d.expanded);
    if (d.customDomains) BMV2._customDomains = d.customDomains;
    if (d.customSubs) BMV2._customSubs = d.customSubs;
    if (d.intelligenceRatings) DOMAIN_STATE.intelligenceRatings = d.intelligenceRatings;
  } catch(e) {}
}

// ── Build node graph: central hub → 13 meta → domains → subs ─────
function _bmBuildGraph(expandedSet) {
  const zoomLevel = BMV2._zoomLevel || 0;
  const cacheKey = 'graph_z' + zoomLevel + '_' + [...expandedSet].sort().join(',') + '_' + CANVAS.NX.nodes.length;
  const cached = _bmCacheGet(cacheKey);
  if (cached) return cached;

  const nodes = [];
  const links = [];

  // Central hub
  const HUB = { id: '__hub__', label: 'MASTERMIND', type: 'hub', color: 'var(--c)', r: 22, x: 0, y: 0, meta: null, clickFn: 'bmv2GoToCanvas' };
  nodes.push(HUB);

  const metaKeys = Object.keys(MM_META_DOMAINS);
  const metaCount = metaKeys.length; // exactly 13

  metaKeys.forEach((metaKey, mi) => {
    const meta = MM_META_DOMAINS[metaKey];
    const angle = (mi / metaCount) * Math.PI * 2 - Math.PI / 2;
    const metaR = 180;
    const mx = Math.cos(angle) * metaR;
    const my = Math.sin(angle) * metaR;

    const metaNode = {
      id: '__meta__' + metaKey,
      label: metaKey,
      type: 'meta',
      color: meta.color,
      icon: meta.icon,
      r: 13,
      x: mx, y: my,
      meta: metaKey,
      angle,
      intelligences: meta.intelligences,
      intuitions: meta.intuitions,
      expanded: expandedSet.has(metaKey),
      clickFn: 'bmv2ToggleMeta',
    };
    nodes.push(metaNode);
    links.push({ from: '__hub__', to: metaNode.id, color: meta.color + '44', width: 1.5 });

    // Zoom level 0 — meta-domains only. Stop here regardless of expand state.
    if (zoomLevel === 0) return;

    if (!expandedSet.has(metaKey)) return; // lazy — don't build sub-nodes until expanded

    // Domain nodes (second level)
    const subs = MM_SUB_DOMAINS[metaKey] || {};
    const domainKeys = Object.keys(subs);
    const domR = 140;

    domainKeys.forEach((domKey, di) => {
      const domAngle = angle + (di - (domainKeys.length - 1) / 2) * (0.9 / Math.max(domainKeys.length, 1));
      const totalR = metaR + domR;
      const dx = Math.cos(domAngle) * totalR;
      const dy = Math.sin(domAngle) * totalR;

      const domNode = {
        id: `__dom__${metaKey}__${domKey}`,
        label: domKey,
        type: 'domain',
        color: meta.color,
        r: 8,
        x: dx, y: dy,
        meta: metaKey,
        domain: domKey,
        angle: domAngle,
        expanded: expandedSet.has(`${metaKey}::${domKey}`),
        clickFn: 'bmv2ToggleDomain',
      };
      nodes.push(domNode);
      links.push({ from: metaNode.id, to: domNode.id, color: meta.color + '33', width: 1 });

      if (!expandedSet.has(`${metaKey}::${domKey}`)) return;

      // Sub-domain nodes (third level)
      const subList = subs[domKey] || [];
      const subR = 80;
      subList.forEach((subKey, si) => {
        const subAngle = domAngle + (si - (subList.length - 1) / 2) * (0.6 / Math.max(subList.length, 1));
        const sx = dx + Math.cos(subAngle) * subR;
        const sy = dy + Math.sin(subAngle) * subR;
        const subNode = {
          id: `__sub__${metaKey}__${domKey}__${subKey}`,
          label: subKey,
          type: 'sub',
          color: meta.color + 'bb',
          r: 5,
          x: sx, y: sy,
          meta: metaKey,
          domain: domKey,
          sub: subKey,
          clickFn: 'bmv2SpawnSub',
        };
        nodes.push(subNode);
        links.push({ from: domNode.id, to: subNode.id, color: meta.color + '22', width: .7 });
      });
    });

    // Zoom level 1 stops before canvas nodes / custom domains — those are level 2 only.
    if (zoomLevel < 2) return;

    // Also add any canvas nodes that match this meta domain
    CANVAS.NX.nodes.forEach(n => {
      const nt = CANVAS.NT[n.type] || NT.concept;
      const nodeDomain = (n.domains && n.domains[0]) || nt.domain;
      const metaTags = [...(n.tags || []), nodeDomain].map(t => t.toLowerCase());
      const metaLower = metaKey.toLowerCase();
      if (metaTags.some(t => metaLower.includes(t) || t.includes(metaKey.split(' ')[0].toLowerCase()))) {
        const existingNode = nodes.find(nd => nd.id === n.id);
        if (!existingNode) {
          nodes.push({
            id: n.id, label: n.title, type: 'canvas',
            color: n.color || (CANVAS.NT[n.type]||CANVAS.NT.concept).color,
            r: 6, x: mx + (Math.random()-.5)*80, y: my + (Math.random()-.5)*80,
            meta: metaKey, canvasId: n.id,
            clickFn: 'bmv2JumpToNode',
          });
          links.push({ from: metaNode.id, to: n.id, color: (n.color||'#00c8ff') + '55', width: 1, dashed: true });
        }
      }
    });

    // Add custom domains for this meta
    (BMV2._customDomains.filter(cd => cd.meta === metaKey)).forEach((cd, ci) => {
      const cdAngle = angle + Math.PI * 0.1 + ci * 0.3;
      const cdR = metaR + domR * 0.7;
      nodes.push({
        id: `__custom__${cd.id}`,
        label: cd.name,
        type: 'custom-domain',
        color: meta.color,
        r: 8,
        x: Math.cos(cdAngle) * cdR,
        y: Math.sin(cdAngle) * cdR,
        meta: metaKey, customId: cd.id,
        clickFn: 'bmv2SpawnCustomDomain',
      });
      links.push({ from: metaNode.id, to: `__custom__${cd.id}`, color: meta.color + '33', width: 1, dashed: true });
    });
  });

  const result = { nodes, links };
  _bmCacheSet(cacheKey, result);
  return result;
}

// ── Render brain map v2 ───────────────────────────────────────────
// ── Shared orbit-camera projection — used by both bmv2Render (drawing)
// and _bmHitTest (click detection), so the two can never drift out of sync.
//
// This is a real 3D map camera, not the old single-axis "sphere" trick:
// each node's (x, y) from _bmBuildGraph's radial layout becomes its actual
// ground-plane (X, Z) position — hub at the center, meta/domain/sub rings
// expanding outward exactly as laid out — plus a small per-type height for
// visual stratification. The camera orbits that plane on two real axes:
// azimuth (spin around the vertical) and elevation (tilt from straight-down
// top-down at 90° toward a near-horizon view at low angles). This also
// fixes a real bug in the old projection: it only used each node's angle
// and a fixed per-type "latitude," completely ignoring the actual radius
// _bmBuildGraph computed — so the rings it worked hard to lay out never
// actually showed up as rings.
const BMV2_TYPE_HEIGHT = { hub: 0, meta: 14, domain: 7, sub: 2, canvas: 4, 'custom-domain': 9 };
const BMV2_MIN_ELEVATION = 8   * Math.PI / 180;
const BMV2_MAX_ELEVATION = 90  * Math.PI / 180;
const BMV2_DEFAULT_ELEVATION = 88 * Math.PI / 180; // starts top-down, per spec
const BMV2_REF_RADIUS = 220; // world units the meta ring should read as ~baseR on screen

function _bmProjectNodes(nodes, cx, cy, baseR) {
  const az = BMV2._camAz || 0;
  const el = BMV2._camEl !== undefined ? BMV2._camEl : BMV2_DEFAULT_ELEVATION;
  const scale = baseR / BMV2_REF_RADIUS;
  const cosAz = Math.cos(az), sinAz = Math.sin(az);
  const cosEl = Math.cos(el), sinEl = Math.sin(el);

  return nodes.map(n => {
    const wx = n.x, wz = n.y; // ground-plane position, exactly as laid out
    const wy = BMV2_TYPE_HEIGHT[n.type] || 0;

    // Yaw (azimuth) — spin the map around the vertical axis
    const rx = wx * cosAz - wz * sinAz;
    const rz = wx * sinAz + wz * cosAz;

    // Elevation tilt — at el=90° (top-down) screen Y tracks rz (map depth)
    // and height has zero effect (correct: looking straight down, height
    // doesn't move screen position). At low el (near-horizon) screen Y
    // tracks height instead and rz collapses into pure depth.
    const px = cx + rx * scale;
    const py = cy - (wy * cosEl - rz * sinEl) * scale;
    const depth = wy * sinEl + rz * cosEl; // for back-to-front sort + depth cue

    return { n, px, py, depth, scale };
  });
}

function bmv2Render() {
  const cvs = document.getElementById('brain-cvs');
  if (!cvs) return;
  const wrap = document.getElementById('brain-canvas-area');
  if (!wrap) { BMV2._raf = requestAnimationFrame(bmv2Render); return; }

  // ── Frame throttle: 40fps cap — brain map is complex, no need for 144fps ──
  const now = performance.now();
  if ((now - (BMV2._lastFrame || 0)) < 25) {
    BMV2._raf = requestAnimationFrame(bmv2Render); return;
  }
  BMV2._lastFrame = now;

  // Resize check
  const needResize = cvs.width !== wrap.clientWidth || cvs.height !== wrap.clientHeight;
  if (needResize) {
    cvs.width  = wrap.clientWidth;
    cvs.height = wrap.clientHeight;
    BMV2._dirty = true;
  }
  if (!BMV2._dirty) { BMV2._raf = requestAnimationFrame(bmv2Render); return; }
  BMV2._dirty = false;

  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const t = Date.now() / 1000;

  ctx.clearRect(0, 0, W, H);

  // ── Lazy graph rebuild — only when expansion state changed ────────
  // _bmBuildGraph is cached by expandedSet + node count key.
  // We only rebuild when the dirty flag was set externally.
  const { nodes, links } = _bmBuildGraph(BMV2._expanded);
  BMV2._nodes = nodes;
  BMV2._links = links;

  // ── O(1) projected node lookup — build index map once per frame ──
  // Eliminates the O(n²) projected.find() in the link drawing loop.

  // ── 3D Globe projection (Google Earth style) ──────────────────
  // We project nodes onto a virtual sphere that rotates slowly
  // The sphere centre is the canvas centre, radius adapts to size

  const cx = W / 2 + BMV2._pan.x;
  const cy = H / 2 + BMV2._pan.y;
  const baseR = Math.min(W, H) * 0.38 * BMV2._pan.zoom;

  // Idle auto-spin — orbits azimuth only, elevation stays wherever the
  // user left it (or the top-down default if they haven't touched it).
  if (!BMV2._userInteracting) {
    BMV2._camAz = (BMV2._camAz || 0) + 0.002;
  }

  // Pre-project all nodes. Shared with _bmHitTest() below so clicking
  // always matches what's drawn.
  const projected = _bmProjectNodes(nodes, cx, cy, baseR);

  // Sort back-to-front for correct overdraw
  projected.sort((a, b) => a.depth - b.depth);

  // ── Build O(1) projection index (replaces O(n²) projected.find) ──
  const projIndex = new Map();
  projected.forEach(p => projIndex.set(p.n.id, p));

  // ── Draw connections ───────────────────────────────────────────
  links.forEach(lk => {
    const fp = projIndex.get(lk.from);
    const tp = projIndex.get(lk.to);
    if (!fp || !tp) return;

    const col = lk.color || 'rgba(0,200,255,.15)';
    const baseAlpha = lk.dashed ? 0.28 : 0.5;
    ctx.beginPath();
    ctx.moveTo(fp.px, fp.py);
    const mpx = (fp.px + tp.px) / 2 + (tp.py - fp.py) * 0.1;
    const mpy = (fp.py + tp.py) / 2 - (tp.px - fp.px) * 0.1;
    ctx.quadraticCurveTo(mpx, mpy, tp.px, tp.py);
    ctx.strokeStyle = col.replace(/[\d.]+\)$/, `${baseAlpha})`).replace(/var\(--c\)/, `rgba(0,200,255,${baseAlpha})`);
    ctx.lineWidth = lk.width || 1;
    if (lk.dashed) ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // ── Draw nodes as glowing dots on the map plane ────────────────
  // A map should stay legible regardless of depth, so unlike the old
  // sphere renderer this doesn't fade or shrink nodes by distance —
  // every node draws at full strength, position/order is what carries
  // the 3D read now, not fake depth-of-field.
  const alpha = 1;
  projected.forEach(({ n, px: px3, py: py3 }) => {
    const isSelected = BMV2._selectedNode === n.id;
    const col = (n.color || '#00c8ff').replace('var(--c)', '#00c8ff');

    let r = n.r * (BMV2._pan.zoom || 1);
    r = Math.max(1.5, Math.min(r, 28));

    // Glow halo (for meta/hub nodes)
    if (n.type === 'hub' || n.type === 'meta' || isSelected) {
      const glowR = r * (n.type === 'hub' ? 3.5 : 2.5);
      const grd = ctx.createRadialGradient(px3, py3, 0, px3, py3, glowR);
      grd.addColorStop(0, (col.startsWith('#') ? `rgba(${parseInt(col.slice(1,3),16)},${parseInt(col.slice(3,5),16)},${parseInt(col.slice(5,7),16)},0.4)` : col.replace(/[\d.]+\)$/, '0.5)').replace(/var\(--c\)/, 'rgba(0,200,255,0.4)')));
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(px3, py3, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Inner shading — radial gradient for a subtle 3D-dot look.
    // Skipped for small nodes (imperceptible at that size, and this is
    // the single biggest per-frame canvas cost on a busy map).
    if (r >= 5) {
      const sphereGrd = ctx.createRadialGradient(
        px3 - r * 0.3, py3 - r * 0.3, r * 0.05,
        px3, py3, r
      );
      sphereGrd.addColorStop(0, col + 'ff');
      sphereGrd.addColorStop(0.4, _hexAlpha(col, alpha));
      sphereGrd.addColorStop(1, '#000000' + '00');
      ctx.beginPath();
      ctx.arc(px3, py3, r, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrd;
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(px3, py3, r, 0, Math.PI * 2);
      ctx.fillStyle = _hexAlpha(col, alpha);
      ctx.fill();
    }

    // Rim highlight
    if (n.type === 'hub' || n.type === 'meta') {
      ctx.beginPath();
      ctx.arc(px3, py3, r, 0, Math.PI * 2);
      ctx.strokeStyle = _hexAlpha(col, alpha);
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();
    }

    // Hub pulse ring
    if (n.type === 'hub') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.beginPath();
      ctx.arc(px3, py3, r * (1.8 + pulse * 0.7), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,200,255,${0.15 * pulse})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // ── Labels — separate pass with collision avoidance ────────────────
  // Drawing labels inline with the dots (previous approach) meant every
  // qualifying node drew its label regardless of neighbors, which turns
  // into unreadable overlapping text the moment a cluster of sub-domain
  // nodes are close together on the map. This pass sorts candidates by
  // importance (hub > meta > domain > canvas/custom > sub) and skips any
  // label whose box would overlap one already placed — important labels
  // always win the space.
  const labelPriority = { hub: 0, meta: 1, domain: 2, canvas: 3, 'custom-domain': 3, sub: 4 };
  const labelCandidates = projected
    .map(p => {
      let r = p.n.r * (BMV2._pan.zoom || 1);
      r = Math.max(1.5, Math.min(r, 28));
      return { p, r };
    })
    .filter(({ p }) => p.n.type !== 'sub' || (BMV2._camEl !== undefined ? BMV2._camEl : BMV2_DEFAULT_ELEVATION) > 40 * Math.PI / 180)
    .sort((a, b) => {
      const pa = labelPriority[a.p.n.type] ?? 5, pb = labelPriority[b.p.n.type] ?? 5;
      if (pa !== pb) return pa - pb;
      return a.p.depth - b.p.depth; // nearer wins ties within a tier
    });

  const drawnLabelBoxes = [];
  labelCandidates.forEach(({ p, r }) => {
    const { n, px: px3, py: py3 } = p;
    const isSelected = BMV2._selectedNode === n.id;
    const col = (n.color || '#00c8ff').replace('var(--c)', '#00c8ff');
    const maxLen = n.type === 'hub' ? 10 : n.type === 'meta' ? 12 : 14;
    const lbl = n.label.length > maxLen ? n.label.slice(0, maxLen - 1) + '…' : n.label;
    const fontSize = Math.max(7, Math.min(12, r * 1.4));
    ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
    const textW = ctx.measureText(lbl).width;
    const box = { x1: px3 - textW / 2 - 2, y1: py3 + r + 1, x2: px3 + textW / 2 + 2, y2: py3 + r + fontSize + 5 };

    const overlaps = drawnLabelBoxes.some(b => box.x1 < b.x2 && box.x2 > b.x1 && box.y1 < b.y2 && box.y2 > b.y1);
    if (overlaps && !isSelected) return; // selected node's label always wins
    drawnLabelBoxes.push(box);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillText(lbl, px3 + 0.5, py3 + r + 2.5);
    ctx.fillStyle = n.type === 'hub' ? '#00c8ff' : n.type === 'meta' ? col : 'rgba(192,218,240,0.9)';
    ctx.fillText(lbl, px3, py3 + r + 2);

    if ((n.type === 'meta' || n.type === 'domain') && !n.expanded) {
      ctx.font = `${Math.max(7, r * 0.8)}px monospace`;
      ctx.fillStyle = col + 'bb';
      ctx.fillText('+', px3 + r + 3, py3 - r * 0.3);
    }
  });

  // Update counters
  const metaN = nodes.filter(n => n.type === 'meta').length;
  const domN  = nodes.filter(n => n.type === 'domain').length;
  const uuidN = typeof MMRegistry !== 'undefined' ? MMRegistry.count() : 0;
  const bcN = document.getElementById('bc-nodes');
  const bcC = document.getElementById('bc-conns');
  const bcU = document.getElementById('bc-uuids');
  if (bcN) bcN.textContent = metaN + ' META';
  if (bcC) bcC.textContent = domN  + ' DOMAINS';
  if (bcU) bcU.textContent = uuidN + ' UUIDS';

  // Keep the globe auto-rotating, but at a lower cadence than the main
  // 40fps cap. Continuously re-dirtying every frame (previous fix) made
  // every visible node's canvas gradient get recreated ~40x/sec forever,
  // which is genuinely expensive and was the real cause of the reported
  // freeze — not a hang, just sustained high per-frame cost. Spinning
  // doesn't need full frame rate to read as smooth.
  if (!BMV2._userInteracting) {
    BMV2._idleFrameCount = (BMV2._idleFrameCount || 0) + 1;
    if (BMV2._idleFrameCount % 3 === 0) BMV2._dirty = true;
  }

  BMV2._raf = requestAnimationFrame(bmv2Render);
}

// ── Interaction: click hit-test ───────────────────────────────────
function _bmHitTest(clientX, clientY) {
  const cvs = document.getElementById('brain-cvs');
  if (!cvs) return null;
  const rect = cvs.getBoundingClientRect();
  const W = cvs.width, H = cvs.height;
  const mx = clientX - rect.left;
  const my = clientY - rect.top;

  const cx = W / 2 + BMV2._pan.x;
  const cy = H / 2 + BMV2._pan.y;
  const baseR = Math.min(W, H) * 0.38 * BMV2._pan.zoom;

  const projected = _bmProjectNodes(BMV2._nodes, cx, cy, baseR);

  let best = null, bestD = Infinity;
  projected.forEach(p => {
    const r = Math.max(1.5, Math.min(p.n.r * (BMV2._pan.zoom || 1), 28));
    const d = Math.hypot(mx - p.px, my - p.py);
    if (d < r * 2.2 && d < bestD) { bestD = d; best = p.n; }
  });
  return best;
}

function bmv2Click(e) {
  e.stopPropagation();
  if (BMV2._justDragged) { BMV2._justDragged = false; return; }
  const n = _bmHitTest(e.clientX, e.clientY);
  if (!n) { BMV2._selectedNode = null; BMV2._dirty = true; return; }
  BMV2._selectedNode = n.id;
  BMV2._dirty = true;
  if (n.clickFn && window[n.clickFn]) window[n.clickFn](n);
}

function bmv2DblClick(e) {
  const n = _bmHitTest(e.clientX, e.clientY);
  if (!n) return;
  if (n.type === 'meta') { bmv2ToggleMeta(n); return; }
  if (n.type === 'hub') { bmv2GoToCanvas(); return; }
  if (n.type === 'canvas' || n.type === 'sub') {
    if (n.canvasId) bmv2JumpToNode(n);
  }
}

// ── Click handlers ────────────────────────────────────────────────
function bmv2GoToCanvas() {
  closeBrainMap();
  CANVAS.enterCanvas();
  T.info('Returning to canvas');
}

function bmv2SetZoomLevel(level) {
  if (level === BMV2._zoomLevel) return;
  BMV2._zoomLevel = level;
  _bmCacheInvalidate();
  BMV2._dirty = true;
  BMV2_ZOOM_LEVELS.forEach(z => {
    const btn = document.getElementById('bv-zoom-' + z.key);
    if (btn) btn.classList.toggle('act', z.key === level);
  });
}

function bmv2ToggleMeta(n) {
  const key = n.meta || n.label;
  if (BMV2._expanded.has(key)) {
    BMV2._expanded.delete(key);
    // Also collapse all children
    [...BMV2._expanded].forEach(k => { if (k.startsWith(key + '::')) BMV2._expanded.delete(k); });
  } else {
    BMV2._expanded.add(key);
    T.brainModeEntered(key);
    // Expanding from the meta-only overview should visibly drill in —
    // bump to level 1 so the sub-domains this just expanded are shown.
    if (BMV2._zoomLevel === 0) bmv2SetZoomLevel(1);
  }
  _bmCacheInvalidate(); // invalidate full cache on expand toggle
  BMV2._dirty = true;
  bmv2Save();
  _bmUpdateSidebar();
}

function bmv2ToggleDomain(n) {
  const key = `${n.meta}::${n.domain}`;
  if (BMV2._expanded.has(key)) BMV2._expanded.delete(key);
  else BMV2._expanded.add(key);
  _bmCacheInvalidate();
  BMV2._dirty = true;
  bmv2Save();
}

function bmv2SpawnSub(n) {
  // Spawn a node on the canvas for this sub-domain
  const meta = MM_META_DOMAINS[n.meta];
  const created = CANVAS.spawnNode('concept', undefined, undefined, {
    title: n.sub,
    body: `Sub-domain of ${n.domain} · ${n.meta}`,
    tags: [n.meta.toLowerCase().split(' ')[0], n.domain.toLowerCase().replace(/\s/g,'-'), 'domain-sub'],
    color: meta?.color || '#00c8ff',
    domains: [n.domain],
  });
  // Register intelligence/intuition tags
  if (typeof MMTags !== 'undefined' && meta) {
    meta.intelligences.forEach(it => MMTags.tag(created.id, `intel:${it}`));
    meta.intuitions.forEach(it => MMTags.tag(created.id, `intuition:${it}`));
    MMTags.tag(created.id, `meta:${n.meta.toLowerCase().replace(/\s+&\s+/g,'-').replace(/\s/g,'-')}`);
  }
  T.success(`Spawned: ${n.sub} → canvas`);
  _bmCacheInvalidate();
  BMV2._dirty = true;
}

function bmv2SpawnCustomDomain(n) {
  const cd = BMV2._customDomains.find(c => c.id === n.customId);
  if (!cd) return;
  CANVAS.spawnNode('concept', undefined, undefined, {
    title: cd.name, body: cd.desc || '', tags: ['custom-domain', cd.meta],
    color: MM_META_DOMAINS[cd.meta]?.color || '#aaaaaa',
  });
  T.success(`Custom domain "${cd.name}" spawned`);
}

function bmv2JumpToNode(n) {
  const id = n.canvasId || n.id;
  const cn = CANVAS.NX.nodes.find(x => x.id === id);
  if (!cn) return;
  closeBrainMap();
  const el = document.getElementById('n_' + id);
  const w = el ? el.offsetWidth : 220, h = el ? el.offsetHeight : 120;
  CANVAS.NX.zoom = 1;
  CANVAS.NX.panX = window.innerWidth / 2 - (cn.x + w / 2);
  CANVAS.NX.panY = (window.innerHeight - 38) / 2 - (cn.y + h / 2);
  CANVAS.applyT();
  CANVAS.selectNode(id);
  setTimeout(() => el?.classList.add('new-pulse'), 100);
  T.info(`Jumped to: ${cn.title}`);
}

// ── Sidebar rendering ─────────────────────────────────────────────
function _bmUpdateSidebar() {
  // Domains tab — show all 13 meta domains with expand state
  const btDomains = document.getElementById('bt-domains');
  if (!btDomains) return;
  btDomains.innerHTML = Object.entries(MM_META_DOMAINS).map(([key, meta]) => {
    const expanded = BMV2._expanded.has(key);
    const subDomains = MM_SUB_DOMAINS[key] || {};
    const subCount = Object.keys(subDomains).length;
    const intelTags = meta.intelligences.map(i =>
      `<span style="font-family:var(--f-mono);font-size:5.5px;padding:1px 4px;
        border:1px solid ${MM_INTEL_TAGS[i]?.color || '#aaa'}44;
        color:${MM_INTEL_TAGS[i]?.color || '#aaa'};letter-spacing:.5px;margin:1px">${MM_INTEL_TAGS[i]?.shortLabel || i}</span>`
    ).join('');
    return `
      <div onclick="bmv2ToggleMetaFromSidebar('${escH(key)}')"
        style="padding:9px 12px;border-bottom:1px solid var(--wire);cursor:pointer;
          transition:background .12s;border-left:3px solid ${expanded ? meta.color : 'transparent'}"
        onmouseenter="this.style.background='var(--lift)'"
        onmouseleave="this.style.background=''">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">
          <span style="color:${meta.color};font-size:11px">${meta.icon}</span>
          <span style="font-family:var(--f-display);font-size:9px;font-weight:700;color:${expanded?meta.color:'var(--bright)'};letter-spacing:1px">${escH(key)}</span>
          <span style="font-family:var(--f-mono);font-size:6px;color:var(--dim);margin-left:auto">${subCount} domains</span>
          <span style="color:${meta.color};font-size:8px">${expanded ? '▾' : '▸'}</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:2px">${intelTags}</div>
      </div>`;
  }).join('');
}

function bmv2ToggleMetaFromSidebar(key) {
  const fakeNode = { meta: key, label: key, type: 'meta' };
  bmv2ToggleMeta(fakeNode);
}

// ── Intelligence stats — redirects into ALM's Intelligence tab ─────
// This used to be a full second manual-slider implementation, live and
// reachable (unlike the one that used to sit in nexus-engine.js proper,
// which was dead code) but with zero awareness of the automatic
// coherence-engine sync or the AUTO/MANUAL override tracking. Ratings
// are edited in exactly one place now — kept this function's NAME so
// the existing Brain Map render pipeline call sites don't need to
// change, but it renders a link instead of a duplicate control surface.
function _bmRenderIntelStats() {
  const el = document.getElementById('brain-intel-stats'); if (!el) return;
  el.innerHTML =
    '<div style="padding:14px 4px;font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">' +
    'Intelligence ratings moved to ALM — computed automatically from what you speak or write, one place instead of three.' +
    '</div>' +
    '<button onclick="MM_WARP.navigateCard(\'alm\');ALM_STATE.activeTab=\'intelligence\'" style="' +
    'padding:8px 14px;border:1px solid rgba(0,255,136,.4);color:#00ff88;background:rgba(0,255,136,.06);' +
    'cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">◉ OPEN IN ALM</button>';
}

// ── Export functions ──────────────────────────────────────────────
function bmv2ExportJSON() {
  const data = {
    _version: '3.0',
    _exported: new Date().toISOString(),
    metaDomains: MM_META_DOMAINS,
    subDomains: MM_SUB_DOMAINS,
    customDomains: BMV2._customDomains,
    intelligenceRatings: DOMAIN_STATE.intelligenceRatings,
    expanded: [...BMV2._expanded],
    canvasNodes: CANVAS.NX.nodes.map(n => ({
      id: n.id, title: n.title, type: n.type,
      tags: typeof MMTags !== 'undefined' ? MMTags.forEntity(n.id).map(t=>t.slug) : (n.tags||[]),
      domains: n.domains || [],
      body: n.body,
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mastermind-domains-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  T.domainExported();
}

function bmv2ExportNotion() {
  // Notion-compatible: flat list of pages with properties
  const pages = [];
  Object.entries(MM_META_DOMAINS).forEach(([metaKey, meta]) => {
    pages.push({ title: metaKey, type: 'Meta Domain', icon: meta.icon, intelligences: meta.intelligences.join(', '), intuitions: meta.intuitions.join(', '), color: meta.color });
    const subs = MM_SUB_DOMAINS[metaKey] || {};
    Object.entries(subs).forEach(([domKey, subList]) => {
      pages.push({ title: domKey, type: 'Domain', parent: metaKey, subdomains: subList.join(', ') });
    });
  });
  CANVAS.NX.nodes.forEach(n => {
    pages.push({ title: n.title, type: 'Canvas Node', nodeType: n.type, body: n.body, tags: (n.tags||[]).join(', ') });
  });
  const blob = new Blob([JSON.stringify({ pages }, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mastermind-notion-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  T.exportedNotion();
}

function bmv2ExportObsidian() {
  // Obsidian: markdown files as a zip-like multi-file JSON
  const files = {};
  Object.entries(MM_META_DOMAINS).forEach(([metaKey, meta]) => {
    let md = `# ${metaKey}\n\n`;
    md += `**Icon:** ${meta.icon}  \n`;
    md += `**Intelligences:** ${meta.intelligences.join(', ')}  \n`;
    md += `**Intuitions:** ${meta.intuitions.join(', ')}  \n\n`;
    md += `## Sub-Domains\n\n`;
    const subs = MM_SUB_DOMAINS[metaKey] || {};
    Object.entries(subs).forEach(([domKey, subList]) => {
      md += `### ${domKey}\n${subList.map(s=>`- ${s}`).join('\n')}\n\n`;
    });
    files[metaKey.replace(/[^a-z0-9]/gi,'_') + '.md'] = md;
  });
  CANVAS.NX.nodes.forEach(n => {
    let md = `# ${n.title}\n\n**Type:** ${n.type}  \n**Tags:** ${(n.tags||[]).map(t=>`[[${t}]]`).join(' ')}  \n\n${n.body||''}`;
    files['nodes/' + n.id.slice(0,8) + '_' + n.title.replace(/[^a-z0-9]/gi,'_').slice(0,20) + '.md'] = md;
  });
  const blob = new Blob([JSON.stringify(files, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mastermind-obsidian-' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  T.exportedObsidian();
}

function bmv2ExportCSV() {
  const rows = [['ID','Title','Type','Meta Domain','Sub Domain','Tags','Body','Created']];
  CANVAS.NX.nodes.forEach(n => {
    const tags = typeof MMTags !== 'undefined' ? MMTags.forEntity(n.id).map(t=>t.slug).join('|') : (n.tags||[]).join('|');
    rows.push([n.id, n.title, n.type, (n.domains||[])[0]||'', '', tags, (n.body||'').replace(/\n/g,' '), n.created ? new Date(n.created).toISOString() : '']);
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'mastermind-' + Date.now() + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
  T.exportedCSV();
}

function bmv2ImportDomains() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.json';
  input.onchange = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        let imported = 0;
        if (data.customDomains) {
          data.customDomains.forEach(cd => {
            if (!BMV2._customDomains.find(x => x.name === cd.name)) {
              BMV2._customDomains.push(cd);
              imported++;
            }
          });
        }
        if (data.intelligenceRatings) Object.assign(DOMAIN_STATE.intelligenceRatings, data.intelligenceRatings);
        _bmCacheInvalidate();
        BMV2._dirty = true;
        bmv2Save();
        T.domainImported(imported);
        _bmUpdateSidebar();
      } catch(err) { T.error('Import failed: ' + err.message); }
    };
    reader.readAsText(file);
  };
  input.click();
}

function bmv2AddCustomDomain() {
  const nameEl = document.getElementById('bm-custom-domain-name');
  const metaEl = document.getElementById('bm-custom-domain-meta');
  const name = nameEl?.value.trim();
  const meta = metaEl?.value;
  if (!name) { T.warn('Enter a domain name'); return; }
  if (!meta) { T.warn('Select a meta-domain'); return; }
  const id = typeof uuid === 'function' ? uuid() : Date.now().toString(36);
  BMV2._customDomains.push({ id, name, meta, created: Date.now() });
  if (nameEl) nameEl.value = '';
  _bmCacheInvalidate();
  BMV2._dirty = true;
  bmv2Save();
  T.domainAdded(name);
  _bmUpdateSidebar();
}

function bmv2RemoveCustomDomain(id) {
  const cd = BMV2._customDomains.find(c => c.id === id);
  BMV2._customDomains = BMV2._customDomains.filter(c => c.id !== id);
  _bmCacheInvalidate();
  BMV2._dirty = true;
  bmv2Save();
  if (cd) T.domainRemoved(cd.name);
  _bmUpdateSidebar();
}

// ── Overridden initBrainMap — now uses bmv2 ───────────────────────
function initBrainMap(startZoom) {
  bmv2Load();
  // Master-index / skip entry starts at the meta-domain overview.
  // A specific mode entry passes startZoom=2 (DETAIL) so the content it
  // just seeded and the meta-domain it just auto-expanded are actually
  // visible on arrival, instead of being hidden behind the overview.
  // Zoom level is intentionally not persisted across sessions either way.
  BMV2._zoomLevel = startZoom !== undefined ? startZoom : 0;
  // Camera also resets to top-down on every fresh load, same lifecycle
  // as zoom level — you always arrive at the same starting view.
  BMV2._camAz = 0;
  BMV2._camEl = BMV2_DEFAULT_ELEVATION;
  BMV2._dirty = true;
  if (BMV2._raf) cancelAnimationFrame(BMV2._raf);
  BMV2._raf = requestAnimationFrame(bmv2Render);
  _bmUpdateSidebar();
  _bmRenderIntelStats();
  _bmBuildCrossdomainPanel();
  _bmSetupBrainInteraction();
  BMV2_ZOOM_LEVELS.forEach(z => {
    const btn = document.getElementById('bv-zoom-' + z.key);
    if (btn) btn.classList.toggle('act', z.key === BMV2._zoomLevel);
  });

  // Update UUID counter from MM
  const uuidCount = typeof MMRegistry !== 'undefined' ? MMRegistry.count() : (typeof JAA !== 'undefined' ? JAA.ledger.size : 0);
  const bcU = document.getElementById('bc-uuids');
  if (bcU) bcU.textContent = uuidCount + ' UUIDS';

  T.brainPopulated(Object.keys(MM_META_DOMAINS).length);
}

function _bmSetupBrainInteraction() {
  const cvs = document.getElementById('brain-cvs');
  if (!cvs || cvs._bmWired) return;
  cvs._bmWired = true;

  // Click
  cvs.addEventListener('click', bmv2Click);
  cvs.addEventListener('dblclick', bmv2DblClick);

  // Block the native right-click context menu — without this, right-click
  // pan gets interrupted by the OS/browser context menu popping up mid-drag.
  cvs.addEventListener('contextmenu', e => e.preventDefault());

  // Mouse drag — LEFT drag = orbit the map (azimuth + elevation),
  // RIGHT/MIDDLE = pan
  let dragStart = null, panStart = null, camStart = null;
  let _interactTimer = null;

  const startInteract = () => {
    BMV2._userInteracting = true;
    clearTimeout(_interactTimer);
    _interactTimer = setTimeout(() => { BMV2._userInteracting = false; }, 2000);
  };

  cvs.addEventListener('mousedown', e => {
    cvs.focus();
    startInteract();
    dragStart = { x: e.clientX, y: e.clientY };
    if (e.button === 0) {
      // Left drag = orbit (yaw from horizontal movement, tilt from vertical)
      camStart = {
        az: BMV2._camAz || 0,
        el: BMV2._camEl !== undefined ? BMV2._camEl : BMV2_DEFAULT_ELEVATION,
      };
    } else {
      // Middle/right drag = pan
      e.preventDefault();
      panStart = { x: BMV2._pan.x, y: BMV2._pan.y };
    }
    cvs.style.cursor = 'grabbing';
  });

  cvs.addEventListener('mousemove', e => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (camStart !== null && (e.buttons & 1)) {
      // Orbit (left button held) — horizontal drag spins azimuth,
      // vertical drag tilts elevation from top-down toward horizon.
      BMV2._camAz = camStart.az + dx * 0.008;
      BMV2._camEl = Math.max(BMV2_MIN_ELEVATION, Math.min(BMV2_MAX_ELEVATION, camStart.el - dy * 0.006));
      BMV2._dirty = true;
    } else if (panStart && (e.buttons & 2 || e.buttons & 4)) {
      // Pan (right or middle button held)
      BMV2._pan.x = panStart.x + dx;
      BMV2._pan.y = panStart.y + dy;
      BMV2._dirty = true;
    }
  });

  cvs.addEventListener('mouseup', e => {
    const moved = dragStart && (Math.abs(e.clientX - dragStart.x) + Math.abs(e.clientY - dragStart.y)) > 5;
    // A real drag still fires a native 'click' event on release — suppress
    // the click handler's hit-test/navigation for that one event so
    // rotating/panning doesn't accidentally trigger whatever node you
    // happened to release over.
    BMV2._justDragged = moved;
    dragStart = null; panStart = null; camStart = null;
    cvs.style.cursor = 'grab';
    if (moved) BMV2._dirty = true;
  });

  cvs.addEventListener('mouseleave', () => { dragStart = null; panStart = null; camStart = null; cvs.style.cursor = 'default'; });

  // Delete/Backspace — remove the selected node, if it's something that
  // can actually be deleted (a real canvas node or a custom domain).
  // Meta/domain/sub nodes are fixed taxonomy, not data — nothing to
  // delete there, so we say so instead of silently doing nothing.
  cvs.addEventListener('keydown', e => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    e.preventDefault();
    const id = BMV2._selectedNode;
    if (!id) return;
    const n = BMV2._nodes.find(x => x.id === id);
    if (!n) return;

    if (n.type === 'canvas' && n.canvasId) {
      if (typeof _delNode === 'function') _delNode(n.canvasId);
      BMV2._selectedNode = null;
      _bmCacheInvalidate();
      BMV2._dirty = true;
    } else if (n.type === 'custom-domain' && n.customId) {
      bmv2RemoveCustomDomain(n.customId);
      BMV2._selectedNode = null;
    } else {
      T.warn('That\'s a structural domain node, not data — nothing to delete here.');
    }
  });

  // Scroll = zoom
  cvs.addEventListener('wheel', e => {
    e.preventDefault();
    startInteract();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    BMV2._pan.zoom = Math.max(.15, Math.min(4, (BMV2._pan.zoom || 1) * factor));
    BMV2._dirty = true;
  }, { passive: false });

  // Touch pinch/pan/orbit
  let touches = null;
  cvs.addEventListener('touchstart', e => { touches = [...e.touches]; startInteract(); }, { passive: true });
  cvs.addEventListener('touchmove', e => {
    if (!touches) return;
    startInteract();
    if (e.touches.length === 1 && touches.length === 1) {
      // Single finger = orbit
      const dx = e.touches[0].clientX - touches[0].clientX;
      const dy = e.touches[0].clientY - touches[0].clientY;
      BMV2._camAz = (BMV2._camAz || 0) + dx * 0.008;
      const curEl = BMV2._camEl !== undefined ? BMV2._camEl : BMV2_DEFAULT_ELEVATION;
      BMV2._camEl = Math.max(BMV2_MIN_ELEVATION, Math.min(BMV2_MAX_ELEVATION, curEl - dy * 0.006));
      BMV2._dirty = true;
    } else if (e.touches.length === 2 && touches.length >= 2) {
      // Pinch = zoom
      const d1 = Math.hypot(touches[0].clientX-touches[1].clientX, touches[0].clientY-touches[1].clientY);
      const d2 = Math.hypot(e.touches[0].clientX-e.touches[1].clientX, e.touches[0].clientY-e.touches[1].clientY);
      if (d1 > 0) BMV2._pan.zoom = Math.max(.15, Math.min(4, (BMV2._pan.zoom||1) * (d2/d1)));
      BMV2._dirty = true;
    }
    touches = [...e.touches];
  }, { passive: true });
  cvs.addEventListener('touchend', () => { touches = null; }, { passive: true });

  // Initialize camera — starts top-down per spec
  if (BMV2._camAz === undefined) BMV2._camAz = 0;
  if (BMV2._camEl === undefined) BMV2._camEl = BMV2_DEFAULT_ELEVATION;
  cvs.style.cursor = 'grab';
}

// ── Cross-domain synthesis — redirects into ALM's Intelligence tab ──
// Kept the function name for the same reason as _bmRenderIntelStats
// above. The export buttons that used to live in this panel
// (bmv2ExportJSON etc.) are unrelated to intelligence ratings and are
// also reachable from the Manage panel — confirmed before removing
// them from here, not assumed.
function _bmBuildCrossdomainPanel() {
  const el = document.getElementById('brain-crossdomain-panel'); if (!el) return;
  el.innerHTML =
    '<div style="padding:14px 4px;font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">' +
    'Cross-domain synthesis moved to ALM, next to the intelligence ratings it\'s computed from.' +
    '</div>' +
    '<button onclick="MM_WARP.navigateCard(\'alm\');ALM_STATE.activeTab=\'intelligence\'" style="' +
    'padding:8px 14px;border:1px solid rgba(0,255,136,.4);color:#00ff88;background:rgba(0,255,136,.06);' +
    'cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">◉ OPEN IN ALM</button>';
}

function bmv2SpawnSynthesis(metaA, metaB) {
  const ma = MM_META_DOMAINS[metaA], mb = MM_META_DOMAINS[metaB];
  if (!ma || !mb) return;
  const synthNode = CANVAS.spawnNode('synthesis', undefined, undefined, {
    title: `${metaA.split(' ')[0]} × ${metaB.split(' ')[0]}`,
    body: `Cross-domain synthesis: ${metaA} ↔ ${metaB}`,
    tags: ['synthesis','cross-domain', metaA.split(' ')[0].toLowerCase(), metaB.split(' ')[0].toLowerCase()],
    color: '#11ddcc',
  });
  T.synthesisFound(1);
}

// ── Also build domain manage panel in the brain sidebar ──────────
function _bmBuildManagePanel() {
  const el = document.getElementById('bt-jaa'); if (!el) return;
  el.innerHTML = `
    <div style="padding:10px 12px 6px;font-family:var(--f-mono);font-size:6.5px;letter-spacing:2px;color:var(--c);border-bottom:1px solid var(--wire)">DOMAIN MANAGEMENT</div>
    <div style="padding:10px 12px;border-bottom:1px solid var(--wire)">
      <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:8px;letter-spacing:1px">ADD CUSTOM DOMAIN</div>
      <input id="bm-custom-domain-name" type="text" placeholder="Domain name..."
        style="width:100%;background:var(--deep);border:1px solid var(--wire2);color:var(--white);
          font-family:var(--f-mono);font-size:9px;padding:6px 8px;outline:none;margin-bottom:6px"
        onfocus="this.style.borderColor='var(--c)'" onblur="this.style.borderColor=''"
        onkeydown="if(event.key==='Enter')bmv2AddCustomDomain()">
      <select id="bm-custom-domain-meta"
        style="width:100%;background:var(--deep);border:1px solid var(--wire2);color:var(--muted);
          font-family:var(--f-mono);font-size:8px;padding:6px 8px;margin-bottom:6px">
        <option value="">Select meta-domain...</option>
        ${Object.keys(MM_META_DOMAINS).map(k => `<option value="${escH(k)}">${escH(k)}</option>`).join('')}
      </select>
      <button onclick="bmv2AddCustomDomain()"
        style="width:100%;padding:7px;border:1px solid var(--c)55;color:var(--c);background:transparent;
          font-family:var(--f-mono);font-size:7.5px;cursor:pointer;letter-spacing:1px;text-transform:uppercase">+ ADD DOMAIN</button>
    </div>
    <div style="padding:10px 12px;border-bottom:1px solid var(--wire)">
      <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:8px;letter-spacing:1px">CUSTOM DOMAINS (${BMV2._customDomains.length})</div>
      ${BMV2._customDomains.length ? BMV2._customDomains.map(cd => `
        <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid rgba(24,40,64,.3)">
          <span style="font-family:var(--f-mono);font-size:8px;color:var(--bright);flex:1">${escH(cd.name)}</span>
          <span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${escH(cd.meta?.split(' ')[0]||'')}</span>
          <button onclick="bmv2RemoveCustomDomain('${cd.id}')"
            style="background:transparent;border:none;color:var(--r);cursor:pointer;font-size:10px;padding:2px">✕</button>
        </div>`).join('') : '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);text-align:center;padding:8px">No custom domains yet</div>'}
    </div>
    <div style="padding:10px 12px">
      <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:8px;letter-spacing:1px">EXPORT / IMPORT</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">
        <button onclick="bmv2ExportJSON()" style="font-family:var(--f-mono);font-size:7px;padding:4px 8px;border:1px solid var(--gold)44;color:var(--gold);background:transparent;cursor:pointer">↓ JSON</button>
        <button onclick="bmv2ExportNotion()" style="font-family:var(--f-mono);font-size:7px;padding:4px 8px;border:1px solid var(--c)44;color:var(--c);background:transparent;cursor:pointer">↓ NOTION</button>
        <button onclick="bmv2ExportObsidian()" style="font-family:var(--f-mono);font-size:7px;padding:4px 8px;border:1px solid var(--v)44;color:var(--v);background:transparent;cursor:pointer">↓ OBSIDIAN</button>
        <button onclick="bmv2ExportCSV()" style="font-family:var(--f-mono);font-size:7px;padding:4px 8px;border:1px solid var(--g)44;color:var(--g);background:transparent;cursor:pointer">↓ CSV</button>
        <button onclick="bmv2ImportDomains()" style="font-family:var(--f-mono);font-size:7px;padding:4px 8px;border:1px solid var(--o)44;color:var(--o);background:transparent;cursor:pointer">↑ IMPORT</button>
      </div>
    </div>
  `;
}

// Override brainTab to call new build functions
const _origBrainTab = window.brainTab;
window.brainTab = function(tab) {
  // Update tab highlight
  document.querySelectorAll('.brain-tab').forEach(b => {
    const matches = b.onclick?.toString().includes(`'${tab}'`) || b.getAttribute('onclick')?.includes(`'${tab}'`);
    b.classList.toggle('act', !!matches);
  });
  document.querySelectorAll('.brain-tab-body').forEach(b => b.classList.toggle('act', b.id === 'bt-' + tab));

  // Render content for each tab
  if (tab === 'domains') _bmUpdateSidebar();
  if (tab === 'intel')   _bmRenderIntelStats();
  if (tab === 'cross')   _bmBuildCrossdomainPanel();
  if (tab === 'jaa')     _bmBuildManagePanel();
  if (tab === 'stats')   _bmRenderStats();
};

function _bmRenderStats() {
  const el = document.getElementById('bt-stats-content'); if (!el) return;
  const regStats   = typeof MMRegistry !== 'undefined' ? MMRegistry.stats() : null;
  const deltaStats = typeof MMDelta    !== 'undefined' ? MMDelta.stats()    : null;
  const tagStats   = typeof MMTags     !== 'undefined' ? MMTags.stats()     : null;
  const vaultStats = typeof MMVault    !== 'undefined' ? MMVault.stats()    : null;
  const metaCount  = Object.keys(MM_META_DOMAINS || {}).length;
  const domCount   = Object.values(MM_SUB_DOMAINS || {}).reduce((s,d) => s + Object.keys(d).length, 0);
  const subCount   = Object.values(MM_SUB_DOMAINS || {}).reduce((s,d) => s + Object.values(d).reduce((s2,sl) => s2 + sl.length, 0), 0);
  const intelRated = Object.values(DOMAIN_STATE.intelligenceRatings || {}).filter(v => v > 0).length;

  const row = (label, val, color) => `
    <div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(24,40,64,.3);font-family:var(--f-mono);font-size:8px">
      <span style="color:var(--dim)">${label}</span>
      <span style="color:${color || 'var(--c)'}">${val}</span>
    </div>`;

  el.innerHTML = `
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:2px;color:var(--c);margin-bottom:8px">DOMAIN MAP</div>
      ${row('Meta domains', metaCount, 'var(--c)')}
      ${row('Sub-domains', domCount, 'var(--v)')}
      ${row('Sub-sub topics', subCount, 'var(--dim)')}
      ${row('Custom domains', (BMV2._customDomains||[]).length, 'var(--o)')}
      ${row('Expanded nodes', (BMV2._expanded||new Set()).size, 'var(--g)')}
    </div>
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:2px;color:var(--v);margin-bottom:8px">INTELLIGENCE</div>
      ${row('Types rated', `${intelRated} / ${Object.keys(MM_INTEL_TAGS||{}).length}`, 'var(--v)')}
      ${row('Intuition types', Object.keys(MM_INTUITION_TAGS||{}).length, 'var(--v)')}
    </div>
    <div style="margin-bottom:12px">
      <div style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:2px;color:var(--g);margin-bottom:8px">CANVAS</div>
      ${row('Nodes', CANVAS.NX.nodes.length, 'var(--bright)')}
      ${row('Connections', CANVAS.NX.conns.length, 'var(--c)')}
      ${regStats  ? row('UUID registry', regStats.alive, 'var(--c)') : ''}
      ${deltaStats ? row('Delta ledger', deltaStats.total, 'var(--o)') : ''}
      ${tagStats  ? row('Tags defined', tagStats.total, 'var(--v)') : ''}
      ${vaultStats ? row('Vault size', vaultStats.sizeKB + ' KB', 'var(--g)') : ''}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:8px">
      <button onclick="bmv2ExportJSON()" style="font-family:var(--f-mono);font-size:6.5px;padding:4px 8px;border:1px solid var(--gold)44;color:var(--gold);background:transparent;cursor:pointer">↓ JSON</button>
      <button onclick="bmv2ExportNotion()" style="font-family:var(--f-mono);font-size:6.5px;padding:4px 8px;border:1px solid var(--c)44;color:var(--c);background:transparent;cursor:pointer">↓ NOTION</button>
      <button onclick="bmv2ExportObsidian()" style="font-family:var(--f-mono);font-size:6.5px;padding:4px 8px;border:1px solid var(--v)44;color:var(--v);background:transparent;cursor:pointer">↓ OBSIDIAN</button>
      <button onclick="bmv2ExportCSV()" style="font-family:var(--f-mono);font-size:6.5px;padding:4px 8px;border:1px solid var(--g)44;color:var(--g);background:transparent;cursor:pointer">↓ CSV</button>
    </div>`;
}

// setIntelligenceRating / resetIntelligenceRatingToAuto now live in
// modules/alm/ui.js (ALM's Intelligence tab) — see the comment near
// domainStateLoad() above for why this used to be three places.


// On brain map close, stop render loop
const _origCloseBrainMap = closeBrainMap;
window.closeBrainMap = function() {
  if (BMV2._raf) { cancelAnimationFrame(BMV2._raf); BMV2._raf = null; }
  _origCloseBrainMap();
};

// Browser storage detection + toast
(function _detectStorageMode() {
  if (typeof window !== 'undefined' && !window.NXAPI) {
    setTimeout(() => T.browserMode(), 1200);
  }
})();

bmv2Load();
console.log('[MASTERMIND] Brain Map v2 · 13 meta-domains · lazy load · synthesis engine loaded');

/* ═══════════════════════════════════════════════════════════════════
   MODULE: alm — Accelerated Learning Module
   Extracted to modules/alm/{engine.js, ui.js, events.js} — see
   modules/alm/README.md. Loaded via separate <script> tags now,
   not embedded here. This comment is the only trace left in this
   file on purpose, so anyone grepping nexus-engine.js for ALM finds
   a pointer instead of nothing.
═══════════════════════════════════════════════════════════════════ */



/* ═══════════════════════════════════════════════════════════════════
   SELF-APPLIED WHAT-IF LOOP — runs AT LOAD TIME on the system itself
   
   The engine introspects its own modules and asks:
   "What if MODULE_A's output fed MODULE_B's input?"
   "What if VOID's open loops triggered HORIZON plans?"
   "What if Body state gated AI response quality?"
   
   Results populate VOID_STATE as seeds + create canvas connections
   when the canvas is entered.
═══════════════════════════════════════════════════════════════════ */

const SYSTEM_CONNECTIONS = [
  // Each entry: a discovered cross-module connection opportunity
  // Format: { from, to, mechanism, strength, implemented }
  // 'implemented' = true if wired in code, false = latent/proposed
  {
    from: 'VOID.openLoops',        to: 'HORIZON.plans',
    mechanism: 'Open loop → reverse-causal seed: unresolved loops become Horizon end-states',
    strength: 0.9, implemented: false,
    whatif: 'What if every open loop automatically spawned a Horizon plan asking "what does resolution look like from the end-state?"',
  },
  {
    from: 'BODY.nervousSystemState', to: 'VOID.primingMethod',
    mechanism: 'Polyvagal state selects optimal priming: ventral→Ne divergence, dorsal→grounding',
    strength: 0.95, implemented: false,
    whatif: 'What if your nervous system state at session start automatically selected the priming method most likely to work right now?',
  },
  {
    from: 'SIGNAL_STATE.items',    to: 'GAP_STATE.sessions',
    mechanism: 'High-fidelity signals auto-seed gap bridging sessions between their domains',
    strength: 0.8, implemented: false,
    whatif: 'What if SIGNAL items rated >8 fidelity automatically opened a GAP session between the two highest-signal concepts?',
  },
  {
    from: 'HORIZON_STATE.plans',   to: 'VOID_STATE.constraints',
    mechanism: 'Horizon failure modes become Void constraints — known risks shape creative space',
    strength: 0.85, implemented: false,
    whatif: 'What if Horizon failure modes became live constraints in the Void — so your creative session already knows what cannot be crossed?',
  },
  {
    from: 'VOID_STATE.whatifs',    to: 'CANVAS.nodes',
    mechanism: 'What-if scoring creates typed canvas nodes (high novelty→seed, high coherence→invariant)',
    strength: 0.9, implemented: true,
    whatif: 'What if every scored what-if automatically spawned the correct node type based on its cognitive signature?',
  },
  {
    from: 'BMV2.intelligenceRatings', to: 'VOID.primingMethod',
    mechanism: 'Lowest-rated intelligence type gets targeted priming — weakest link strengthens the map',
    strength: 0.75, implemented: false,
    whatif: 'What if your weakest intelligence domain automatically became the entry point for today\'s creative session — systematically closing the gap?',
  },
  {
    from: 'GAP_STATE.gaps',        to: 'HORIZON.plans',
    mechanism: 'Unresolved gaps between concepts become Horizon conditions — gaps are planning constraints',
    strength: 0.8, implemented: false,
    whatif: 'What if unresolved GAP sessions automatically became blocking conditions on the Horizon plan most semantically related to them?',
  },
  {
    from: 'BODY.somaticLog',       to: 'SIGNAL_STATE.items',
    mechanism: 'Somatic entries with high resonance become candidate signals — body-felt → mind-verified',
    strength: 0.7, implemented: false,
    whatif: 'What if your somatic log\'s strongest signals were automatically submitted to SIGNAL for fidelity scoring — letting the body nominate ideas?',
  },
  {
    from: 'THREAD_STATE.threads',  to: 'GAP.session',
    mechanism: 'Emotional threads pointing in opposite directions → auto-spawn a GAP session between them',
    strength: 0.85, implemented: false,
    whatif: 'What if two emotional threads pulling in opposite directions automatically opened a GAP session — making the internal conflict a solvable structure?',
  },
  {
    from: 'DOMAIN_STATE.intelligenceRatings', to: 'BMV2.crossDomainMatrix',
    mechanism: 'Low-rated domains get auto-linked to their highest-rated neighbor — scaffold the weak with the strong',
    strength: 0.8, implemented: false,
    whatif: 'What if the cross-domain matrix automatically weighted edges by the geometric mean of both domains\' intelligence ratings — making the map show real cognitive topology?',
  },
];

// ── What-if loop applied to the system itself ─────────────────────
// Runs on demand, or triggered from the Void module.
// Generates seeds from cross-module connection opportunities.
async function runSystemWhatifLoop() {
  mm_toast('↺ Running system what-if loop…', 'sync', { dur: 2000 });
  MM_BUS?.emit('mm.system.whatif.start', {});

  const unimplemented = SYSTEM_CONNECTIONS.filter(c => !c.implemented);

  // Seed the Void with discovered connections as what-ifs
  unimplemented.forEach(c => {
    const exists = VOID_STATE.whatifs.some(w => w.text === c.whatif);
    if (!exists) {
      VOID_STATE.whatifs.push({
        id: uuid(), text: c.whatif,
        created: Date.now(), ai: true,
        score: c.strength,
        meta: { from: c.from, to: c.to, mechanism: c.mechanism },
      });
    }
  });
  saveVoidState();
  _voidRenderWhatifs();

  // Now run the recursive AI loop on the richest unimplemented connection
  const richest = unimplemented.sort((a, b) => b.strength - a.strength)[0];
  if (!richest) { mm_toast('All connections implemented', 'success'); return; }

  mm_toast(`Recursing: ${richest.from} → ${richest.to}`, 'sync', { dur: 3000 });

  await whatifLoopStart(richest.whatif, {
    maxDepth: 3,
    branchFactor: 3,
    scoreThreshold: 0.55,
    spawnCanvas: true,
  });

  MM_BUS?.emit('mm.system.whatif.complete', { connection: richest });
}

// ── Live cross-module wiring (implement the discovered connections) ──
// These are the IMPLEMENTED wires — run after modules initialize.

// Wire 1: BODY nervous system → VOID priming auto-select
function _wireBodyToVoid() {
  MM_BUS?.on('mm.body.state.changed', (d) => {
    const stateMap = {
      ventral:     'freewrite',   // safe/social → divergent expression
      sympathetic: 'breathing',   // activated → regulate first
      dorsal:      'movement',    // shutdown → mobilize body first
    };
    const method = stateMap[d?.state] || VOID_STATE.flowMethod;
    if (method && method !== VOID_STATE.flowMethod) {
      VOID_STATE.flowMethod = method;
      saveVoidState();
      mm_toast(`Body → Void: ${d.state} state → ${method} priming`, 'sync', { dur: 2500 });
    }
  });
}

// Wire 2: VOID open loops → HORIZON seeds
function _wireVoidLoopsToHorizon() {
  MM_BUS?.on('mm.void.loop.closed', (d) => {
    // Closed loop → spawn a Horizon plan exploring what resolution looks like
    if (!d?.text) return;
    const endState = 'Fully resolved: ' + d.text;
    horizonNewPlan(endState, 'What does complete resolution look like?', '3 Months');
    mm_toast('Open loop → Horizon plan created', 'success', { dur: 2500 });
  });
}

// Wire 3: SIGNAL high-fidelity → GAP auto-seed
function _wireSignalToGap() {
  MM_BUS?.on('mm.signal.rated', (d) => {
    if (!d?.item || (d.item.alignment + d.item.fidelity) < 8) return;
    // High-signal item: find another high-signal item and open a GAP
    const highItems = SIGNAL_STATE.items
      .filter(i => (i.alignment + i.fidelity) >= 8 && i.id !== d.item.id)
      .slice(0, 1);
    if (highItems.length) {
      GAP_STATE.sessions.push({
        id: uuid(), nodeA: d.item.text.slice(0, 40),
        nodeB: highItems[0].text.slice(0, 40),
        gaps: [], created: Date.now(), source: 'signal-auto',
      });
      saveGapState();
      mm_toast('Signal → GAP: bridging high-fidelity concepts', 'sync', { dur: 3000 });
    }
  });
}

// Wire 4: HORIZON failure modes → VOID constraints
function _wireHorizonToVoid() {
  MM_BUS?.on('mm.horizon.plan.saved', (d) => {
    const plan = HORIZON_STATE.plans.find(p => p.id === d?.planId);
    if (!plan?.failureModes?.length) return;
    plan.failureModes.forEach(fm => {
      const text = 'CONSTRAINT (Horizon): ' + (fm.text || fm).slice(0, 80);
      const exists = VOID_STATE.constraints.some(c => c.text === text);
      if (!exists) {
        VOID_STATE.constraints.push({ id: uuid(), text, created: Date.now(), source: 'horizon' });
      }
    });
    saveVoidState();
  });
}

// ── Initialize all wires at boot ──────────────────────────────────
function _initCrossModuleWires() {
  _wireBodyToVoid();
  _wireVoidLoopsToHorizon();
  _wireSignalToGap();
  _wireHorizonToVoid();
  MMLog?.info('system', 'Cross-module wires initialized: 4 active connections');
  MM_BUS?.emit('mm.system.wires.ready', { count: 4 });
}

// Call after DOMContentLoaded (modules need to be ready)
setTimeout(_initCrossModuleWires, 2000);


/* ═══════════════════════════════════════════════════════════════════
   COGNITIVE MODE ENGINE — Ni / Ti / Ne / Te canvas operators
   
   Ni (Introverted Intuition) — CONTRACT
     Collapses canvas toward invariants.
     Finds the 1 node that all others point toward.
     Prunes edges below confidence threshold.
     Reveals the deep structure.
   
   Ti (Introverted Thinking) — ANALYZE  
     Groups nodes by logical type.
     Draws classification boundaries.
     Surfaces contradictions (nodes with conflicting implications).
     Reduces to minimum sufficient structure.
   
   Ne (Extraverted Intuition) — EXPAND
     Fans out from every selected node.
     AI-generates lateral connections across domains.
     Maximizes divergence — finds the furthest conceptual reach.
     Every node becomes a launching pad.
   
   Te (Extraverted Thinking) — EXECUTE
     Converts nodes to action items with owners + timelines.
     Connects to Horizon plans.
     Prunes non-actionable nodes.
     The canvas becomes a project.
═══════════════════════════════════════════════════════════════════ */

const COG_MODE = {
  active: null,          // 'Ni'|'Ti'|'Ne'|'Te'|null
  operationLog: [],      // history of cognitive operations applied
};

// ── Ni: CONTRACT — find the invariant core ────────────────────────
async function cogNi() {
  if (!CANVAS.NX.nodes.length) { mm_toast('Canvas empty', 'warn'); return; }
  COG_MODE.active = 'Ni';
  MM_BUS?.emit('mm.cog.mode', { mode: 'Ni', op: 'contract' });
  mm_toast('Ni — Contracting to invariants…', 'sync', { dur: 2000 });

  T.aiThinking?.();
  const context = aiBuildContext();
  const result = await aiCall(
    'You are Introverted Intuition — a convergent depth-finder. Your job: find the invariant structure beneath the surface. Never describe the nodes. Find what is universally true across all of them.',
    `Canvas map:\n${context}\n\nRespond with ONLY valid JSON:\n{"invariant": "The single deepest truth that all nodes point toward (1 sentence)", "convergence_nodes": ["id1","id2"], "prune_nodes": ["id_to_prune"], "synthesis": "How the remaining nodes form a coherent whole"}`
  );
  T.aiDone?.();
  if (!result) return;

  try {
    const d = JSON.parse(result.replace(/```json|```/g,'').trim());

    // Spawn the invariant as a central synthesis node
    const { x: cx, y: cy } = s2w(window.innerWidth / 2, window.innerHeight / 2 - 100);
    const invNode = CANVAS.spawnNode('invariant', cx, cy, {
      title: 'INVARIANT',
      body: d.invariant || '',
      tags: ['Ni', 'invariant', 'contracted'],
      color: '#00c8ff',
    });

    // Connect convergence nodes to the invariant
    (d.convergence_nodes || []).forEach(nid => {
      const node = CANVAS.NX.nodes.find(n => n.id === nid);
      if (node && invNode) CANVAS.addConn(nid, invNode.id, 'converges to');
    });

    // Collapse (but don't delete) low-signal nodes
    (d.prune_nodes || []).forEach(nid => {
      const el = document.getElementById('n_' + nid);
      if (el) el.style.opacity = '0.3';
    });

    if (d.synthesis) {
      mm_toast('Ni: ' + d.synthesis.slice(0, 80), 'success', { dur: 5000 });
    }
    COG_MODE.operationLog.push({ mode: 'Ni', ts: Date.now(), invariant: d.invariant });
    vaultDirtySave(3000);
  } catch(e) { mm_toast('Ni parse error: ' + e.message, 'error'); }
}

// ── Ti: ANALYZE — logical structure + contradiction detection ──────
async function cogTi() {
  if (!CANVAS.NX.nodes.length) { mm_toast('Canvas empty', 'warn'); return; }
  COG_MODE.active = 'Ti';
  MM_BUS?.emit('mm.cog.mode', { mode: 'Ti', op: 'analyze' });
  mm_toast('Ti — Analyzing logical structure…', 'sync', { dur: 2000 });

  T.aiThinking?.();
  const context = aiBuildContext();
  const result = await aiCall(
    'You are Introverted Thinking — a precision classifier. Find the logical types, contradictions, and minimum sufficient structure. Be ruthlessly precise.',
    `Canvas map:\n${context}\n\nRespond ONLY as valid JSON:\n{"type_groups": [{"type_name": "string", "node_ids": ["id"], "principle": "string"}], "contradictions": [{"node_a": "id", "node_b": "id", "conflict": "string"}], "minimum_structure": "The fewest nodes needed to preserve the complete logical content"}`
  );
  T.aiDone?.();
  if (!result) return;

  try {
    const d = JSON.parse(result.replace(/```json|```/g,'').trim());

    // Visual: highlight type groups with color overlays
    const groupColors = ['#00c8ff','#cc44ff','#ff8c22','#00ff88','#ffe04a'];
    (d.type_groups || []).forEach((grp, gi) => {
      const col = groupColors[gi % groupColors.length];
      (grp.node_ids || []).forEach(nid => {
        const el = document.getElementById('n_' + nid);
        if (el) el.style.boxShadow = `0 0 0 2px ${col}88, 0 0 12px ${col}44`;
      });
    });

    // Mark contradictions with red pulse
    (d.contradictions || []).forEach(c => {
      [c.node_a, c.node_b].forEach(nid => {
        const el = document.getElementById('n_' + nid);
        if (el) el.style.boxShadow = '0 0 0 2px #ff335588, 0 0 16px #ff335544';
      });
      if (c.node_a && c.node_b) CANVAS.addConn(c.node_a, c.node_b, '⚡ ' + (c.conflict || 'contradiction').slice(0,20));
    });

    const summary = `Ti: ${(d.type_groups||[]).length} types · ${(d.contradictions||[]).length} contradictions · ${d.minimum_structure?.slice(0,60)||''}`;
    mm_toast(summary, 'success', { dur: 5000 });
    COG_MODE.operationLog.push({ mode: 'Ti', ts: Date.now(), groups: d.type_groups?.length, contradictions: d.contradictions?.length });
  } catch(e) { mm_toast('Ti parse error: ' + e.message, 'error'); }
}

// ── Ne: EXPAND — maximum divergence across domains ─────────────────
async function cogNe() {
  COG_MODE.active = 'Ne';
  MM_BUS?.emit('mm.cog.mode', { mode: 'Ne', op: 'expand' });

  const targets = CANVAS.NX.nodes.filter(n => CANVAS.NX.selected.has(n.id));
  const seeds = targets.length ? targets : CANVAS.NX.nodes.slice(-3);
  if (!seeds.length) { mm_toast('No nodes to expand from', 'warn'); return; }

  mm_toast(`Ne — Expanding ${seeds.length} nodes across domains…`, 'sync', { dur: 2000 });
  T.aiThinking?.();

  // For each seed, find the most distant conceptual connection possible
  const seedList = seeds.map(n => `"${n.title || n.body?.slice(0,40) || n.id}"`).join(', ');
  const result = await aiCall(
    'You are Extraverted Intuition — a lateral connection finder. Your job: find the most unexpected, generative connections between concepts. Cross every domain boundary. Find analogies from biology, physics, architecture, music, linguistics, economics — wherever the pattern lives.',
    `Seed concepts: ${seedList}\n\nGenerate cross-domain expansions. For each seed, find 2 genuinely surprising connections to other fields.\n\nReturn ONLY valid JSON:\n[{"seed": "concept", "connection": "What connects it to...", "domain": "field", "node_type": "concept|insight|pattern|synthesis", "spawns_text": "The new node title"}]`
  );
  T.aiDone?.();
  if (!result) return;

  try {
    const expansions = JSON.parse(result.replace(/```json|```/g,'').trim());
    const domainColors = { biology:'#00ff88', physics:'#00c8ff', music:'#cc44ff', economics:'#ffe04a', architecture:'#ff8c22', linguistics:'#ff66aa' };

    expansions.forEach((exp, i) => {
      const seed = seeds.find(n => (n.title||n.body||'').toLowerCase().includes(exp.seed?.toLowerCase().slice(0,10)||''));
      const seedNode = seed || seeds[i % seeds.length];
      const angle = (i / expansions.length) * Math.PI * 2;
      const dist = 300 + Math.random() * 100;
      const node = CANVAS.spawnNode(exp.node_type || 'insight',
        seedNode.x + Math.cos(angle) * dist,
        seedNode.y + Math.sin(angle) * dist,
        {
          title: (exp.spawns_text || exp.connection || '').slice(0, 60),
          body: `Domain: ${exp.domain || ''}\n\n${exp.connection || ''}`,
          tags: ['Ne', 'expansion', exp.domain || 'cross-domain'],
          color: domainColors[exp.domain?.toLowerCase()] || '#cc44ff',
        }
      );
      if (node && seedNode) CANVAS.addConn(seedNode.id, node.id, exp.domain || 'cross-domain');
    });

    mm_toast(`Ne: ${expansions.length} cross-domain connections spawned`, 'success', { dur: 3000 });
    COG_MODE.operationLog.push({ mode: 'Ne', ts: Date.now(), expansions: expansions.length });
    vaultDirtySave(3000);
  } catch(e) { mm_toast('Ne parse error: ' + e.message, 'error'); }
}

// ── Te: EXECUTE — convert canvas to actionable project ────────────
async function cogTe() {
  if (!CANVAS.NX.nodes.length) { mm_toast('Canvas empty', 'warn'); return; }
  COG_MODE.active = 'Te';
  MM_BUS?.emit('mm.cog.mode', { mode: 'Te', op: 'execute' });
  mm_toast('Te — Converting to execution structure…', 'sync', { dur: 2000 });

  T.aiThinking?.();
  const context = aiBuildContext();
  const result = await aiCall(
    'You are Extraverted Thinking — a execution-oriented system builder. Convert this conceptual map into concrete, actionable deliverables with sequence, dependencies, and measurable outcomes.',
    `Canvas map:\n${context}\n\nReturn ONLY valid JSON:\n{"actions": [{"title": "string", "outcome": "string", "timeline": "string", "depends_on_node": "node_id_or_null", "priority": 1}], "critical_path": ["action_title_in_order"], "first_move": "The single most leveraged first action"}`
  );
  T.aiDone?.();
  if (!result) return;

  try {
    const d = JSON.parse(result.replace(/```json|```/g,'').trim());

    // Spawn action nodes in a Gantt-like horizontal sequence
    const startX = 200, startY = 600;
    const prevNodes = [];

    (d.actions || []).slice(0, 6).forEach((action, i) => {
      const node = CANVAS.spawnNode('vector', startX + i * 280, startY, {
        title: action.title?.slice(0, 50) || '',
        body: `Outcome: ${action.outcome || ''}\nTimeline: ${action.timeline || ''}`,
        tags: ['Te', 'action', 'execute'],
        color: '#ffe04a',
      });
      if (node && i > 0 && prevNodes[i-1]) {
        CANVAS.addConn(prevNodes[i-1].id, node.id, 'then');
      }
      if (node && action.depends_on_node) {
        CANVAS.addConn(action.depends_on_node, node.id, 'enables');
      }
      prevNodes.push(node);

      // Wire to Horizon if plan exists
      if (HORIZON_STATE.plans.length) {
        const plan = HORIZON_STATE.plans[0];
        if (plan && node) {
          plan.milestones = plan.milestones || [];
          plan.milestones.push({ text: action.title, timeline: action.timeline, nodeId: node.id });
        }
      }
    });

    if (d.first_move) mm_toast('Te first move: ' + d.first_move.slice(0, 80), 'success', { dur: 6000 });
    horizonSave();
    COG_MODE.operationLog.push({ mode: 'Te', ts: Date.now(), actions: d.actions?.length });
    vaultDirtySave(3000);
  } catch(e) { mm_toast('Te parse error: ' + e.message, 'error'); }
}

// ── Cognitive mode reset ──────────────────────────────────────────
function cogReset() {
  COG_MODE.active = null;
  CANVAS.NX.nodes.forEach(n => {
    const el = document.getElementById('n_' + n.id);
    if (el) { el.style.opacity = '1'; el.style.boxShadow = ''; }
  });
  mm_toast('Canvas reset — all modes cleared', 'info', { dur: 1500 });
}


/* ═══════════════════════════════════════════════════════════════════
   SYSTEMS CANVAS — Causal Loop + Feedback Diagram Module
   
   Variables (stocks): accumulate values over time
   Flows: rates of change in/out of stocks
   Auxiliaries: computed from other variables
   Links: causal (+/-), delays, non-linear
   
   Features:
   - Draw causal loop diagrams (CLDs) on the main canvas
   - Simulate stocks/flows numerically (Euler integration)
   - AI discovers feedback loops automatically
   - Cognitive modes apply (Ni finds the dominant loop)
   - Export loop structure to Horizon failure modes
   - "Automate the mind": map cognitive habits as feedback loops
═══════════════════════════════════════════════════════════════════ */

const SYSTEMS = {
  id: 'module:systems',
  variables: [],   // [{id, name, type:'stock'|'flow'|'auxiliary'|'constant', value, unit, nodeId}]
  links: [],       // [{id, from, to, polarity:+1|-1, delay:0-3, label, linkType:'causal'|'flow'}]
  loops: [],       // [{id, nodes[], polarity:'reinforcing'|'balancing', label}]
  simState: null,  // current simulation values
  simHistory: [],  // [{t, values:{varId:value}}]
  running: false,
};
const SYSTEMS_KEY = 'nexus_systems_state';

function systemsLoad() {
  // SECURITY FIX: this read localStorage['nexus_systems_state'] as its
  // ONLY source — this data had no vault path at all before this fix,
  // unlike body/horizon/domain/mirror/relational above. Vault-only now
  // (mastermind-vault.js, modules.systems); see _ORPHAN_KEYS for
  // recovering any pre-fix copy.
  SYSTEMS._loaded = true;
}

function systemsSave() {
  // SECURITY FIX: this used to ALSO write localStorage['nexus_systems_state']
  // in plaintext, in parallel with — well, nothing, before this fix; the
  // vault now actually covers it (modules.systems).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(5000);
}

// ── Add a system variable ─────────────────────────────────────────
function systemsAddVar(name, type = 'stock', value = 0, unit = '') {
  const id = uuid();
  const { x: wx, y: wy } = s2w(
    window.innerWidth/2 + (Math.random()-0.5)*400,
    window.innerHeight/2 + (Math.random()-0.5)*300
  );

  const typeColors = { stock: '#00c8ff', flow: '#ff8c22', auxiliary: '#cc44ff', constant: '#ffe04a' };
  const typeIcons  = { stock: '⬡', flow: '→', auxiliary: '◎', constant: '◆' };
  const node = CANVAS.spawnNode('concept', wx, wy, {
    title: (typeIcons[type] || '') + ' ' + name,
    body: `Type: ${type}\nValue: ${value}${unit ? ' ' + unit : ''}`,
    tags: ['system', type, 'variable'],
    color: typeColors[type] || '#00c8ff',
  });

  SYSTEMS.variables.push({ id, name, type, value, unit, nodeId: node?.id, init: value });
  systemsSave();
  mm_toast(`System variable: ${name} (${type})`, 'success', { dur: 2000 });
  return id;
}

// ── Add a causal link ─────────────────────────────────────────────
function systemsAddLink(fromVarId, toVarId, polarity, delay = 0, label = '') {
  const fromVar = SYSTEMS.variables.find(v => v.id === fromVarId);
  const toVar   = SYSTEMS.variables.find(v => v.id === toVarId);
  if (!fromVar || !toVar) return;

  const lid = uuid();
  SYSTEMS.links.push({ id: lid, from: fromVarId, to: toVarId, polarity, delay, label });

  // Draw on canvas
  if (fromVar.nodeId && toVar.nodeId) {
    const pol = polarity > 0 ? '+ ' : '− ';
    CANVAS.addConn(fromVar.nodeId, toVar.nodeId, pol + (label || '').slice(0, 20));
  }
  systemsSave();

  // Auto-detect loops after each link addition
  _detectFeedbackLoops();
  return lid;
}

// ── Detect feedback loops (DFS cycle detection) ───────────────────
function _detectFeedbackLoops() {
  const adj = new Map(); // varId → [toVarId]
  SYSTEMS.links.forEach(l => {
    if (!adj.has(l.from)) adj.set(l.from, []);
    adj.get(l.from).push({ to: l.to, polarity: l.polarity });
  });

  const found = [];
  const visited = new Set();
  const stack = [];

  function dfs(nodeId, startId, path, polarityProduct) {
    if (path.length > 1 && nodeId === startId) {
      // Found a cycle
      const polarity = polarityProduct > 0 ? 'reinforcing' : 'balancing';
      const signature = [...path].sort().join(',');
      if (!found.some(f => f.signature === signature)) {
        found.push({ nodes: [...path], polarity, signature, product: polarityProduct });
      }
      return;
    }
    if (visited.has(nodeId) && nodeId !== startId) return;
    if (path.length > 8) return; // cap cycle length

    visited.add(nodeId);
    const neighbors = adj.get(nodeId) || [];
    for (const { to, polarity } of neighbors) {
      stack.push(to);
      dfs(to, startId, [...path, to], polarityProduct * polarity);
      stack.pop();
    }
    visited.delete(nodeId);
  }

  SYSTEMS.variables.forEach(v => {
    visited.clear();
    dfs(v.id, v.id, [v.id], 1);
  });

  // Store detected loops
  SYSTEMS.loops = found.map((f, i) => ({
    id: uuid(),
    nodes: f.nodes,
    polarity: f.polarity,
    label: f.polarity === 'reinforcing' ? `R${i+1}` : `B${i+1}`,
    signature: f.signature,
  }));

  if (SYSTEMS.loops.length) {
    const r = SYSTEMS.loops.filter(l => l.polarity === 'reinforcing').length;
    const b = SYSTEMS.loops.filter(l => l.polarity === 'balancing').length;
    mm_toast(`Systems: ${r} reinforcing + ${b} balancing loops`, 'sync', { dur: 3000 });
    MM_BUS?.emit('mm.systems.loops.detected', { reinforcing: r, balancing: b });
  }
}

// ── Euler simulation ──────────────────────────────────────────────
function systemsSimulate(steps = 50, dt = 0.1) {
  if (!SYSTEMS.variables.length) { mm_toast('No variables defined', 'warn'); return; }
  SYSTEMS.running = true;
  SYSTEMS.simHistory = [];

  // Init state
  const state = {};
  SYSTEMS.variables.forEach(v => state[v.id] = v.init ?? v.value);

  const flowLinks = SYSTEMS.links.filter(l => {
    const toVar = SYSTEMS.variables.find(v => v.id === l.to);
    return toVar?.type === 'stock';
  });

  for (let step = 0; step < steps; step++) {
    const snapshot = { t: step * dt, values: { ...state } };
    SYSTEMS.simHistory.push(snapshot);

    // Euler step: compute flows into/out of stocks
    const diffs = {};
    SYSTEMS.variables.forEach(v => diffs[v.id] = 0);

    flowLinks.forEach(link => {
      const fromVal = state[link.from] || 0;
      const rate = fromVal * link.polarity * 0.1; // simplified linear rate
      diffs[link.to] += rate * dt;
      if (link.from in diffs) diffs[link.from] -= rate * dt; // conservation
    });

    SYSTEMS.variables.forEach(v => {
      if (v.type === 'stock') {
        state[v.id] = Math.max(0, (state[v.id] || 0) + (diffs[v.id] || 0));
      }
    });
  }

  SYSTEMS.simState = state;
  SYSTEMS.running = false;

  // Update node labels with final values
  SYSTEMS.variables.forEach(v => {
    if (!v.nodeId) return;
    const el = document.getElementById('n_' + v.nodeId);
    if (!el) return;
    const finalVal = (state[v.id] || 0).toFixed(2);
    const bodyEl = el.querySelector('.node-body');
    if (bodyEl) bodyEl.textContent = `${v.type} · ${finalVal}${v.unit||''}`;
  });

  mm_toast(`Simulation complete: ${steps} steps · dt=${dt}`, 'success', { dur: 3000 });
  MM_BUS?.emit('mm.systems.sim.complete', { steps, finalState: state });
  systemsSave();
}

// ── AI discovers the system structure from canvas ─────────────────
async function systemsAIDiscover() {
  if (!CANVAS.NX.nodes.length) { mm_toast('Canvas needs nodes first', 'warn'); return; }
  mm_toast('Systems AI: discovering feedback structure…', 'sync', { dur: 2000 });
  T.aiThinking?.();

  const context = aiBuildContext();
  const result = await aiCall(
    'You are a systems thinking analyst. Given a concept map, identify the underlying feedback loop structure. Find stocks (things that accumulate), flows (rates of change), and causal links. Identify reinforcing loops (growth/collapse) and balancing loops (stability/goals). Think Donella Meadows.',
    `Concept map:\n${context}\n\nReturn ONLY valid JSON:\n{"stocks": [{"name":"string","description":"string"}], "flows": [{"name":"string","from_stock":"string","to_stock":"string","driver":"string"}], "causal_links": [{"from":"variable_name","to":"variable_name","polarity":1,"rationale":"string"}], "loops": [{"type":"reinforcing|balancing","variables":["name"],"story":"what drives this loop"}], "leverage_points": ["highest leverage variable names"]}`
  );
  T.aiDone?.();
  if (!result) return;

  try {
    const d = JSON.parse(result.replace(/```json|```/g,'').trim());

    // Spawn discovered variables
    const varIds = {};
    (d.stocks || []).forEach(s => { varIds[s.name] = systemsAddVar(s.name, 'stock'); });
    (d.flows  || []).forEach(f => { varIds[f.name] = systemsAddVar(f.name, 'flow'); });

    // Wire causal links
    setTimeout(() => {
      (d.causal_links || []).forEach(link => {
        const fid = varIds[link.from], tid = varIds[link.to];
        if (fid && tid) systemsAddLink(fid, tid, link.polarity, 0, link.rationale?.slice(0,20)||'');
      });

      // Toast each loop story
      (d.loops || []).forEach(loop => {
        mm_toast(`${loop.type.toUpperCase()} LOOP: ${loop.story?.slice(0,80)||''}`, 'sync', { dur: 4000 });
      });

      // Leverage points → Horizon seeds
      (d.leverage_points || []).forEach(lp => {
        VOID_STATE.seeds.push({ id: uuid(), text: `LEVERAGE: ${lp}`, created: Date.now(), ai: true });
      });
      saveVoidState();
    }, 500);

    mm_toast(`Systems: ${(d.stocks||[]).length} stocks · ${(d.flows||[]).length} flows discovered`, 'success', { dur: 4000 });
  } catch(e) { mm_toast('Systems parse error: ' + e.message, 'error'); }
}

// ── AI models the MIND as a system ───────────────────────────────
// "Automate the mind" — maps cognitive patterns as feedback loops
async function systemsModelMind() {
  mm_toast('Mapping your mind as a system…', 'sync', { dur: 2000 });
  T.aiThinking?.();

  // Collect all self-knowledge from modules
  const bodyState = BODY?.nervousSystemState || 'unknown';
  const openLoops = VOID_STATE.openLoops.filter(l => l.status === 'open').map(l => l.text).slice(0,5);
  const patterns  = BODY?.patternLog?.slice(0,3).map(p => p.text || p) || [];
  const threads   = Object.entries(THREAD_STATE?.threads || {}).flatMap(([t, items]) => items.slice(0,2).map(i => `${t}: ${i.text}`));
  const horizon   = HORIZON_STATE.plans.slice(0,2).map(p => p.title || p.endState);

  const context = [
    `Nervous system: ${bodyState}`,
    `Open loops: ${openLoops.join('; ')}`,
    `Patterns: ${patterns.join('; ')}`,
    `Threads: ${threads.join('; ')}`,
    `Horizon goals: ${horizon.join('; ')}`,
  ].join('\n');

  const result = await aiCall(
    'You are a cognitive systems analyst. Model this person\'s mental architecture as a feedback system. Find the reinforcing loops that create their current state. Find the balancing loops keeping them from their goals. Find the leverage point — the single variable where a small change cascades into a new stable state. Think Polyvagal, IFS, Systems Thinking simultaneously.',
    `Current cognitive state:\n${context}\n\nReturn ONLY valid JSON:\n{"reinforcing_loops": [{"name":"string","story":"how this loop amplifies itself","variables":["string"]}], "balancing_loops": [{"name":"string","story":"what this loop is trying to stabilize","variables":["string"]}], "leverage_point": {"variable":"string","intervention":"string","why":"string"}, "attractor_state": "the stable state this system is currently moving toward"}`
  );
  T.aiDone?.();
  if (!result) return;

  try {
    const d = JSON.parse(result.replace(/```json|```/g,'').trim());

    // Spawn mind-map system on canvas
    const { x: cx, y: cy } = s2w(window.innerWidth/2, window.innerHeight/2);

    // Leverage point as central invariant
    if (d.leverage_point) {
      const lev = CANVAS.spawnNode('invariant', cx, cy, {
        title: 'LEVERAGE: ' + (d.leverage_point.variable||'').slice(0,40),
        body: d.leverage_point.intervention + '\n\nWhy: ' + d.leverage_point.why,
        tags: ['systems', 'leverage', 'mind-model'],
        color: '#11ddcc',
      });

      // Reinforcing loops as seeds around leverage
      (d.reinforcing_loops||[]).slice(0,3).forEach((loop, i) => {
        const angle = (i/3) * Math.PI*2;
        const n = CANVAS.spawnNode('pattern', cx + Math.cos(angle)*260, cy + Math.sin(angle)*260, {
          title: 'R: ' + (loop.name||'').slice(0,40),
          body: loop.story||'',
          tags: ['reinforcing-loop', 'mind-model'],
          color: '#ff8c22',
        });
        if (n && lev) CANVAS.addConn(n.id, lev.id, 'amplifies');
      });

      // Balancing loops as friction nodes
      (d.balancing_loops||[]).slice(0,3).forEach((loop, i) => {
        const angle = (i/3) * Math.PI*2 + Math.PI/3;
        const n = CANVAS.spawnNode('friction', cx + Math.cos(angle)*360, cy + Math.sin(angle)*360, {
          title: 'B: ' + (loop.name||'').slice(0,40),
          body: loop.story||'',
          tags: ['balancing-loop', 'mind-model'],
          color: '#00ff88',
        });
        if (n && lev) CANVAS.addConn(lev.id, n.id, 'balanced by');
      });
    }

    if (d.attractor_state) {
      mm_toast('Attractor: ' + d.attractor_state.slice(0,100), 'success', { dur: 7000 });
    }

    vaultDirtySave(3000);
    MM_BUS?.emit('mm.systems.mind.modeled', { leverage: d.leverage_point?.variable });
  } catch(e) { mm_toast('Mind model error: ' + e.message, 'error'); }
}

// ── Open Systems module ───────────────────────────────────────────
function openSystems() {
  if (!_assertAuth()) return;
  MM_BUS?.emit('mm.module.open', { module: 'systems' });
  systemsLoad();

  let overlay = document.getElementById('mm-systems-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-systems-overlay';
    overlay.style.cssText = 'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800;background:rgba(0,0,0,.97);backdrop-filter:blur(6px);display:flex;flex-direction:column';
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderSystemsUI(overlay);
}

function closeSystems() {
  const el = document.getElementById('mm-systems-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
}

function _renderSystemsUI(container) {
  const R = SYSTEMS.loops.filter(l => l.polarity === 'reinforcing').length;
  const B = SYSTEMS.loops.filter(l => l.polarity === 'balancing').length;

  container.innerHTML = '';

  // ── Header ────────────────────────────────────────────────────────
  const hdr = document.createElement('div');
  hdr.style.cssText = [
    'display:flex;align-items:center;gap:14px;padding:12px 20px',
    'border-bottom:1px solid rgba(17,221,204,.25)',
    'background:rgba(17,221,204,.04);flex-shrink:0',
  ].join(';');
  hdr.innerHTML = `
    <span style="font-size:18px;filter:drop-shadow(0 0 10px #11ddcc)">∿</span>
    <div>
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:5px;color:#11ddcc">SYSTEMS CANVAS</div>
      <div style="font-family:var(--f-mono);font-size:7px;
        color:rgba(17,221,204,.5);letter-spacing:2px;margin-top:1px">
        FEEDBACK LOOPS · STOCKS & FLOWS · CAUSAL STRUCTURE
      </div>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <span style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        <span style="color:#ff8c22">${R}R</span> ·
        <span style="color:#00ff88">${B}B</span> ·
        ${SYSTEMS.variables.length} vars
      </span>
      <button onclick="systemsAIDiscover()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 13px;
        border:1px solid rgba(204,68,255,.3);color:#cc44ff;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(204,68,255,.1)'"
        onmouseleave="this.style.background='transparent'">✦ AI DISCOVER</button>
      <button onclick="systemsModelMind()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 13px;
        border:1px solid rgba(0,200,255,.3);color:#00c8ff;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(0,200,255,.1)'"
        onmouseleave="this.style.background='transparent'">⟁ MODEL MIND</button>
      <button onclick="closeSystems();CANVAS.goHome()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 13px;
        border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,255,255,.04)'"
        onmouseleave="this.style.background='transparent'">⌂ HOME</button>
    </div>
  `;
  container.appendChild(hdr);

  // ── Body ──────────────────────────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;overflow:hidden';
  container.appendChild(body);

  // Left panel — controls
  const left = _buildSystemsLeft();
  body.appendChild(left);

  // Center — live CLD canvas
  const center = document.createElement('div');
  center.style.cssText = [
    'flex:1;position:relative;background:rgba(0,5,10,.8)',
    'border-right:1px solid rgba(17,221,204,.1)',
  ].join(';');
  body.appendChild(center);

  const cldCanvas = document.createElement('canvas');
  cldCanvas.id = 'sys-cld-canvas';
  cldCanvas.style.cssText = 'width:100%;height:100%;display:block';
  center.appendChild(cldCanvas);

  // CLD controls overlay
  const cldControls = document.createElement('div');
  cldControls.style.cssText = [
    'position:absolute;bottom:14px;left:50%;transform:translateX(-50%)',
    'display:flex;gap:8px',
  ].join(';');
  cldControls.innerHTML = `
    <button onclick="systemsCLDLayout()" style="
      font-family:var(--f-mono);font-size:7px;padding:5px 11px;
      border:1px solid rgba(17,221,204,.3);color:#11ddcc;background:rgba(0,5,10,.9);cursor:pointer"
      onmouseenter="this.style.background='rgba(17,221,204,.1)'"
      onmouseleave="this.style.background='rgba(0,5,10,.9)'">⊞ AUTO-LAYOUT</button>
    <button onclick="systemsSimulate(120,.04);_renderCLD()" style="
      font-family:var(--f-mono);font-size:7px;padding:5px 11px;
      border:1px solid rgba(255,140,34,.3);color:#ff8c22;background:rgba(0,5,10,.9);cursor:pointer"
      onmouseenter="this.style.background='rgba(255,140,34,.1)'"
      onmouseleave="this.style.background='rgba(0,5,10,.9)'">▶ SIMULATE</button>
    <button onclick="systemsExportToMainCanvas()" style="
      font-family:var(--f-mono);font-size:7px;padding:5px 11px;
      border:1px solid rgba(255,255,255,.12);color:var(--dim);background:rgba(0,5,10,.9);cursor:pointer"
      onmouseenter="this.style.background='rgba(255,255,255,.05)'"
      onmouseleave="this.style.background='rgba(0,5,10,.9)'">→ MAIN CANVAS</button>
  `;
  center.appendChild(cldControls);

  // Right panel — loops + simulation history
  const right = _buildSystemsRight();
  body.appendChild(right);

  // Init CLD after DOM settles — use ResizeObserver to get real dimensions
  // requestAnimationFrame alone fires before layout, giving offsetWidth=0
  const _cldInitObserver = new ResizeObserver(entries => {
    _cldInitObserver.disconnect();
    _initCLD(cldCanvas);
  });
  _cldInitObserver.observe(center);
  // Fallback: also try after 100ms in case ResizeObserver fires too early
  setTimeout(() => {
    if (_CLD.W === 0) _initCLD(cldCanvas);
  }, 120);
}

// ── Left panel builder ────────────────────────────────────────────
function _buildSystemsLeft() {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:260px;flex-shrink:0;display:flex;flex-direction:column',
    'border-right:1px solid rgba(17,221,204,.12);overflow-y:auto',
  ].join(';');

  panel.innerHTML = `
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">

      <!-- Add Variable -->
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:3px;
          color:#11ddcc;margin-bottom:9px">⬡ VARIABLE</div>
        <input id="sys-var-name" placeholder="Name…" style="
          width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);
          border:1px solid rgba(17,221,204,.25);color:var(--c);
          padding:7px 10px;font-family:var(--f-mono);font-size:8px;margin-bottom:5px;outline:none"
          onfocus="this.style.borderColor='rgba(17,221,204,.6)'"
          onblur="this.style.borderColor='rgba(17,221,204,.25)'"
          onkeydown="if(event.key==='Enter')systemsQuickAddVar()"/>
        <div style="display:flex;gap:5px;margin-bottom:5px">
          ${[
            ['stock','⬡','#00c8ff','accumulates'],
            ['flow','→','#ff8c22','rate'],
            ['auxiliary','◎','#cc44ff','computed'],
            ['constant','◆','#ffe04a','fixed'],
          ].map(([type,icon,color,desc]) => `
            <button id="sys-type-${type}" onclick="systemsSelectType('${type}')" style="
              flex:1;padding:6px 3px;cursor:pointer;
              border:1px solid ${color}44;background:transparent;
              color:${color};font-size:10px;transition:all .12s"
              title="${type}: ${desc}"
              onmouseenter="this.style.background='${color}11'"
              onmouseleave="if(!this.classList.contains('active'))this.style.background='transparent'"
              >${icon}</button>
          `).join('')}
        </div>
        <div style="display:flex;gap:5px;margin-bottom:5px">
          <input id="sys-var-value" type="number" value="0" placeholder="Init" style="
            flex:1;background:rgba(0,5,12,.8);border:1px solid rgba(17,221,204,.2);
            color:var(--c);padding:6px 8px;font-family:var(--f-mono);font-size:8px;outline:none"/>
          <input id="sys-var-unit" placeholder="unit" style="
            width:55px;background:rgba(0,5,12,.8);border:1px solid rgba(17,221,204,.2);
            color:var(--c);padding:6px 7px;font-family:var(--f-mono);font-size:8px;outline:none"/>
        </div>
        <button onclick="systemsQuickAddVar()" style="
          width:100%;padding:8px;border:1px solid rgba(17,221,204,.35);
          color:#11ddcc;background:rgba(17,221,204,.05);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(17,221,204,.12)'"
          onmouseleave="this.style.background='rgba(17,221,204,.05)'">⊕ ADD</button>
      </div>

      <!-- Add Link -->
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:3px;
          color:#11ddcc;margin-bottom:9px">→ CAUSAL LINK</div>
        <select id="sys-link-from" style="
          width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);
          border:1px solid rgba(17,221,204,.2);color:var(--c);
          padding:6px 8px;font-family:var(--f-mono);font-size:8px;margin-bottom:5px">
          <option value="">From…</option>
          ${SYSTEMS.variables.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
        </select>
        <select id="sys-link-to" style="
          width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);
          border:1px solid rgba(17,221,204,.2);color:var(--c);
          padding:6px 8px;font-family:var(--f-mono);font-size:8px;margin-bottom:5px">
          <option value="">To…</option>
          ${SYSTEMS.variables.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}
        </select>
        <div style="display:flex;gap:6px;margin-bottom:5px">
          <button id="sys-pol-pos" onclick="systemsSelectPolarity(1)" style="
            flex:1;padding:7px;cursor:pointer;
            border:1px solid rgba(0,255,136,.4);color:#00ff88;
            background:rgba(0,255,136,.08);font-family:var(--f-mono);
            font-size:8px;font-weight:700"
            onmouseenter="this.style.background='rgba(0,255,136,.18)'"
            onmouseleave="this.style.background='rgba(0,255,136,.08)'">+ same dir</button>
          <button id="sys-pol-neg" onclick="systemsSelectPolarity(-1)" style="
            flex:1;padding:7px;cursor:pointer;
            border:1px solid rgba(255,51,85,.3);color:#ff3355;
            background:transparent;font-family:var(--f-mono);
            font-size:8px;font-weight:700"
            onmouseenter="this.style.background='rgba(255,51,85,.1)'"
            onmouseleave="this.style.background='transparent'">− opposite</button>
        </div>
        <input id="sys-link-label" placeholder="Label (optional)" style="
          width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);
          border:1px solid rgba(17,221,204,.15);color:var(--c);
          padding:6px 8px;font-family:var(--f-mono);font-size:8px;
          margin-bottom:5px;outline:none"/>
        <button onclick="systemsQuickAddLink()" style="
          width:100%;padding:8px;border:1px solid rgba(17,221,204,.35);
          color:#11ddcc;background:rgba(17,221,204,.05);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(17,221,204,.12)'"
          onmouseleave="this.style.background='rgba(17,221,204,.05)'">→ LINK</button>
      </div>

      <!-- Simulation -->
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:3px;
          color:#11ddcc;margin-bottom:9px">∿ SIMULATE</div>
        <div style="display:flex;gap:5px;margin-bottom:5px">
          <div style="flex:1">
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
              margin-bottom:3px">STEPS</div>
            <input id="sys-sim-steps" type="number" value="100" min="10" max="1000" style="
              width:100%;background:rgba(0,5,12,.8);border:1px solid rgba(17,221,204,.2);
              color:var(--c);padding:5px 7px;font-family:var(--f-mono);font-size:8px;outline:none"/>
          </div>
          <div style="flex:1">
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
              margin-bottom:3px">dt</div>
            <input id="sys-sim-dt" type="number" value="0.05" min="0.01" max="1" step="0.01" style="
              width:100%;background:rgba(0,5,12,.8);border:1px solid rgba(17,221,204,.2);
              color:var(--c);padding:5px 7px;font-family:var(--f-mono);font-size:8px;outline:none"/>
          </div>
        </div>
        <button onclick="systemsRunAndAnimate()" style="
          width:100%;padding:8px;border:1px solid rgba(255,140,34,.4);
          color:#ff8c22;background:rgba(255,140,34,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px;margin-bottom:5px"
          onmouseenter="this.style.background='rgba(255,140,34,.14)'"
          onmouseleave="this.style.background='rgba(255,140,34,.06)'">▶ RUN + ANIMATE</button>
        <button onclick="systemsResetSim()" style="
          width:100%;padding:7px;border:1px solid var(--wire2);
          color:var(--dim);background:transparent;cursor:pointer;
          font-family:var(--f-mono);font-size:7.5px"
          onmouseenter="this.style.background='rgba(255,255,255,.04)'"
          onmouseleave="this.style.background='transparent'">↺ RESET VALUES</button>
      </div>

      <!-- What-if loop -->
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:3px;
          color:#cc44ff;margin-bottom:9px">↺ RECURSIVE LOOP</div>
        <input id="sys-whatif-seed" placeholder="Seed premise…" style="
          width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);
          border:1px solid rgba(204,68,255,.25);color:var(--c);
          padding:7px 10px;font-family:var(--f-mono);font-size:8px;
          margin-bottom:5px;outline:none"
          onfocus="this.style.borderColor='rgba(204,68,255,.6)'"
          onblur="this.style.borderColor='rgba(204,68,255,.25)'"/>
        <div style="display:flex;gap:5px;margin-bottom:5px">
          <select id="sys-loop-depth" style="flex:1;background:rgba(0,5,12,.8);
            border:1px solid rgba(204,68,255,.2);color:var(--c);
            padding:5px 6px;font-family:var(--f-mono);font-size:7.5px">
            <option value="2">Depth 2</option>
            <option value="3" selected>Depth 3</option>
            <option value="4">Depth 4</option>
            <option value="5">Depth 5</option>
          </select>
          <select id="sys-loop-branch" style="flex:1;background:rgba(0,5,12,.8);
            border:1px solid rgba(204,68,255,.2);color:var(--c);
            padding:5px 6px;font-family:var(--f-mono);font-size:7.5px">
            <option value="2">2 branches</option>
            <option value="3" selected>3 branches</option>
            <option value="4">4 branches</option>
          </select>
        </div>
        <button onclick="systemsStartWhatif()" style="
          width:100%;padding:8px;border:1px solid rgba(204,68,255,.35);
          color:#cc44ff;background:rgba(204,68,255,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(204,68,255,.14)'"
          onmouseleave="this.style.background='rgba(204,68,255,.06)'">↺ RUN LOOP</button>
      </div>

      <!-- Clear -->
      <div>
        <button onclick="systemsClearAll()" style="
          width:100%;padding:7px;border:1px solid rgba(255,51,85,.2);
          color:var(--r);background:transparent;cursor:pointer;
          font-family:var(--f-mono);font-size:7.5px"
          onmouseenter="this.style.background='rgba(255,51,85,.06)'"
          onmouseleave="this.style.background='transparent'">⚠ CLEAR ALL VARIABLES</button>
      </div>
    </div>
  `;

  // Init selected type
  SYSTEMS._selectedType = SYSTEMS._selectedType || 'stock';
  SYSTEMS._selectedPolarity = SYSTEMS._selectedPolarity ?? 1;
  setTimeout(() => {
    systemsSelectType(SYSTEMS._selectedType);
    systemsSelectPolarity(SYSTEMS._selectedPolarity);
  }, 50);

  return panel;
}

// ── Right panel — loops + sim chart ──────────────────────────────
function _buildSystemsRight() {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'width:280px;flex-shrink:0;display:flex;flex-direction:column',
    'border-left:1px solid rgba(17,221,204,.1);overflow:hidden',
  ].join(';');

  // Detected loops
  const loopsDiv = document.createElement('div');
  loopsDiv.style.cssText = 'flex:1;overflow-y:auto;padding:14px 16px';
  loopsDiv.innerHTML = `
    <div style="font-family:var(--f-display);font-size:8px;letter-spacing:3px;
      color:#11ddcc;margin-bottom:12px">FEEDBACK LOOPS</div>
    ${SYSTEMS.loops.length ? SYSTEMS.loops.map(loop => {
      const isR = loop.polarity === 'reinforcing';
      const col = isR ? '#ff8c22' : '#00ff88';
      const varNames = loop.nodes
        .map(nid => SYSTEMS.variables.find(v => v.id === nid)?.name || nid)
        .join(' → ');
      return `
        <div style="margin-bottom:9px;padding:10px 13px;
          border-left:3px solid ${col};background:${col}08;
          border:1px solid ${col}28;border-left:3px solid ${col}">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
            <span style="font-family:var(--f-display);font-size:11px;
              font-weight:800;color:${col}">${loop.label}</span>
            <span style="font-family:var(--f-mono);font-size:7px;
              color:var(--dim);text-transform:uppercase">${loop.polarity}</span>
            <span style="margin-left:auto;font-family:var(--f-mono);
              font-size:9px;color:${col}">${isR ? '⊕' : '⊝'}</span>
          </div>
          <div style="font-family:var(--f-mono);font-size:7px;
            color:var(--muted);line-height:1.7">${varNames}</div>
          <button onclick="systemsHighlightLoop('${loop.id}')" style="
            margin-top:6px;padding:3px 8px;border:1px solid ${col}44;
            color:${col};background:transparent;cursor:pointer;
            font-family:var(--f-mono);font-size:7px"
            onmouseenter="this.style.background='${col}11'"
            onmouseleave="this.style.background='transparent'">HIGHLIGHT</button>
        </div>`;
    }).join('') : `
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        padding:16px 0;line-height:2">
        No loops yet.<br>
        <span style="color:var(--wire2)">Add variables + links.<br>
        Loops auto-detect on each link.</span>
      </div>`}
  `;
  panel.appendChild(loopsDiv);

  // Sim chart canvas
  const chartWrap = document.createElement('div');
  chartWrap.style.cssText = [
    'height:180px;flex-shrink:0;border-top:1px solid rgba(17,221,204,.1)',
    'padding:10px;background:rgba(0,0,0,.4)',
  ].join(';');
  chartWrap.innerHTML = `
    <div style="font-family:var(--f-display);font-size:7.5px;letter-spacing:2px;
      color:var(--dim);margin-bottom:6px">SIMULATION HISTORY</div>
    <canvas id="sys-sim-chart" style="width:100%;height:130px;display:block"></canvas>
  `;
  panel.appendChild(chartWrap);

  setTimeout(() => _renderSimChart(), 100);
  return panel;
}

// ── CLD Canvas — Causal Loop Diagram renderer ─────────────────────
const _CLD = {
  ctx: null,
  W: 0, H: 0,
  pan: { x: 0, y: 0 },
  zoom: 1,
  dragging: null,
  _raf: null,
  _dirty: true,
  _highlightLoop: null,
  _animPhase: 0,
};

function _initCLD(canvas) {
  _CLD.ctx = canvas.getContext('2d');
  _CLD.W = canvas.width  = canvas.offsetWidth;
  _CLD.H = canvas.height = canvas.offsetHeight;

  // Auto-layout if no positions yet
  if (SYSTEMS.variables.length && !SYSTEMS.variables[0]._cx) {
    systemsCLDLayout();
  }

  // Mouse pan + node drag
  let dragStart = null, panStart = null;
  canvas.addEventListener('mousedown', e => {
    const wx = (e.offsetX - _CLD.pan.x) / _CLD.zoom;
    const wy = (e.offsetY - _CLD.pan.y) / _CLD.zoom;
    const hit = SYSTEMS.variables.find(v => {
      const dx = (v._cx||0) - wx, dy = (v._cy||0) - wy;
      return Math.sqrt(dx*dx+dy*dy) < 36;
    });
    if (hit) {
      _CLD.dragging = hit;
      dragStart = { mx: e.offsetX, my: e.offsetY, ox: hit._cx||0, oy: hit._cy||0 };
    } else {
      panStart = { mx: e.offsetX, my: e.offsetY, px: _CLD.pan.x, py: _CLD.pan.y };
    }
  });
  canvas.addEventListener('mousemove', e => {
    if (_CLD.dragging && dragStart) {
      const dx = (e.offsetX - dragStart.mx) / _CLD.zoom;
      const dy = (e.offsetY - dragStart.my) / _CLD.zoom;
      _CLD.dragging._cx = dragStart.ox + dx;
      _CLD.dragging._cy = dragStart.oy + dy;
      _CLD.dirty = true;
    } else if (panStart) {
      _CLD.pan.x = panStart.px + (e.offsetX - panStart.mx);
      _CLD.pan.y = panStart.py + (e.offsetY - panStart.my);
      _CLD.dirty = true;
    }
  });
  canvas.addEventListener('mouseup', () => { _CLD.dragging = null; dragStart = null; panStart = null; });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    _CLD.zoom = Math.max(0.2, Math.min(4, _CLD.zoom * factor));
    _CLD.dirty = true;
  }, { passive: false });

  if (_CLD._raf) cancelAnimationFrame(_CLD._raf);
  _cldLoop();
}

function _cldLoop() {
  _CLD._raf = requestAnimationFrame(_cldLoop);
  _CLD._animPhase += 0.025;
  _renderCLD();
}

function systemsCLDLayout() {
  // Force-directed layout: arrange variables in rings by type
  const n = SYSTEMS.variables.length;
  if (!n) return;
  const cx = (_CLD.W || 600) / 2 / _CLD.zoom;
  const cy = (_CLD.H || 400) / 2 / _CLD.zoom;
  const stocks = SYSTEMS.variables.filter(v => v.type === 'stock');
  const flows  = SYSTEMS.variables.filter(v => v.type === 'flow');
  const others = SYSTEMS.variables.filter(v => v.type !== 'stock' && v.type !== 'flow');

  // Stocks in inner ring
  const r1 = 120;
  stocks.forEach((v, i) => {
    const a = (i / Math.max(stocks.length, 1)) * Math.PI * 2 - Math.PI/2;
    v._cx = cx + Math.cos(a) * r1;
    v._cy = cy + Math.sin(a) * r1;
  });
  // Flows in middle ring
  const r2 = 220;
  flows.forEach((v, i) => {
    const a = (i / Math.max(flows.length, 1)) * Math.PI * 2 - Math.PI/6;
    v._cx = cx + Math.cos(a) * r2;
    v._cy = cy + Math.sin(a) * r2;
  });
  // Auxiliaries/constants in outer ring
  const r3 = 300;
  others.forEach((v, i) => {
    const a = (i / Math.max(others.length, 1)) * Math.PI * 2;
    v._cx = cx + Math.cos(a) * r3;
    v._cy = cy + Math.sin(a) * r3;
  });
  _CLD.dirty = true;
}

function _renderCLD() {
  const ctx = _CLD.ctx;
  if (!ctx) return;
  const W = _CLD.W, H = _CLD.H;

  ctx.clearRect(0, 0, W, H);

  // Grid
  ctx.save();
  ctx.strokeStyle = 'rgba(17,221,204,.04)';
  ctx.lineWidth = 1;
  const gs = 40 * _CLD.zoom;
  const ox = _CLD.pan.x % gs, oy = _CLD.pan.y % gs;
  for (let x = ox; x < W; x += gs) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = oy; y < H; y += gs) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.restore();

  ctx.save();
  ctx.translate(_CLD.pan.x, _CLD.pan.y);
  ctx.scale(_CLD.zoom, _CLD.zoom);

  // Highlighted loop glow
  if (_CLD._highlightLoop) {
    const loop = SYSTEMS.loops.find(l => l.id === _CLD._highlightLoop);
    if (loop) {
      const col = loop.polarity === 'reinforcing' ? '#ff8c22' : '#00ff88';
      const pulse = 0.3 + 0.7 * Math.abs(Math.sin(_CLD._animPhase * 2));
      loop.nodes.forEach((nid, i) => {
        const a = SYSTEMS.variables.find(v => v.id === nid);
        const b = SYSTEMS.variables.find(v => v.id === loop.nodes[(i+1)%loop.nodes.length]);
        if (!a || !b || a._cx == null || b._cx == null) return;
        ctx.beginPath();
        ctx.moveTo(a._cx, a._cy);
        ctx.lineTo(b._cx, b._cy);
        ctx.strokeStyle = col.replace(')', `,${pulse})`).replace('#', 'rgba(').replace(/([0-9a-f]{2})/g, m => parseInt(m,16)+',').replace(/,rgba|,\)/g, m => m === ',)' ? ')' : m).replace(/rgba\((.+)\)/, (_, s) => {
          const parts = s.split(',').map(x => parseInt(x.trim(),16));
          return `rgba(${parts[0]},${parts[1]},${parts[2]},${pulse})`;
        });
        // simpler:
        const [r,g,b2] = col === '#ff8c22' ? [255,140,34] : [0,255,136];
        ctx.strokeStyle = `rgba(${r},${g},${b2},${pulse * 0.8})`;
        ctx.lineWidth = 4;
        ctx.stroke();
      });
    }
  }

  // Draw links with curved arrows and polarity labels
  SYSTEMS.links.forEach(link => {
    const fromV = SYSTEMS.variables.find(v => v.id === link.from);
    const toV   = SYSTEMS.variables.find(v => v.id === link.to);
    if (!fromV || !toV || fromV._cx == null || toV._cx == null) return;

    const fx = fromV._cx, fy = fromV._cy;
    const tx = toV._cx,   ty = toV._cy;
    const isPos = link.polarity > 0;
    const col = isPos ? 'rgba(0,255,136,.7)' : 'rgba(255,51,85,.7)';

    // Curved path (quadratic bezier perpendicular to midpoint)
    const mx = (fx + tx) / 2, my = (fy + ty) / 2;
    const len = Math.sqrt((tx-fx)**2 + (ty-fy)**2) || 1;
    const nx = -(ty-fy)/len * 28, ny = (tx-fx)/len * 28; // normal offset
    const cpx = mx + nx, cpy = my + ny;

    // Arrowhead calc — point along curve near end
    const t = 0.88;
    const ax = (1-t)**2*fx + 2*(1-t)*t*cpx + t**2*tx;
    const ay = (1-t)**2*fy + 2*(1-t)*t*cpy + t**2*ty;
    const tang = Math.atan2(ty-ay, tx-ax);

    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(cpx, cpy, tx, ty);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(link.delay ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - 10*Math.cos(tang-0.4), ty - 10*Math.sin(tang-0.4));
    ctx.lineTo(tx - 10*Math.cos(tang+0.4), ty - 10*Math.sin(tang+0.4));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();

    // Polarity label at curve midpoint
    ctx.font = `bold ${12/_CLD.zoom < 8 ? 8 : 12}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isPos ? '#00ff88' : '#ff3355';
    ctx.fillText(isPos ? '+' : '−', cpx, cpy);

    // Link label
    if (link.label) {
      ctx.font = `${9}px monospace`;
      ctx.fillStyle = 'rgba(200,220,240,.5)';
      ctx.fillText(link.label.slice(0,16), (fx+cpx+tx)/3, (fy+cpy+ty)/3 - 10);
    }
  });

  // Draw loop labels at centroid of each loop
  SYSTEMS.loops.forEach(loop => {
    const nodes = loop.nodes.map(nid => SYSTEMS.variables.find(v => v.id === nid)).filter(Boolean);
    if (!nodes.length || nodes[0]._cx == null) return;
    const cx2 = nodes.reduce((s,v) => s + v._cx, 0) / nodes.length;
    const cy2 = nodes.reduce((s,v) => s + v._cy, 0) / nodes.length;
    const isR = loop.polarity === 'reinforcing';
    const col = isR ? '#ff8c22' : '#00ff88';
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(_CLD._animPhase * (isR ? 1.2 : 0.8)));

    // Loop label circle
    ctx.beginPath();
    ctx.arc(cx2, cy2, 16, 0, Math.PI*2);
    ctx.fillStyle = `${col}${Math.round(pulse*25).toString(16).padStart(2,'0')}`;
    ctx.fill();
    ctx.strokeStyle = `${col}88`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(loop.label, cx2, cy2);

    // Rotation arrow around label
    const arrowA = _CLD._animPhase * (isR ? 1 : -1);
    ctx.beginPath();
    ctx.arc(cx2, cy2, 22, arrowA, arrowA + Math.PI * 1.6);
    ctx.strokeStyle = `${col}55`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  // Draw variables
  SYSTEMS.variables.forEach(v => {
    if (v._cx == null) return;
    const typeColors = { stock:'#00c8ff', flow:'#ff8c22', auxiliary:'#cc44ff', constant:'#ffe04a' };
    const col = typeColors[v.type] || '#00c8ff';
    const isStock = v.type === 'stock';
    const isFlow  = v.type === 'flow';

    // Get current sim value for animation
    const curVal = SYSTEMS.simState?.[v.id] ?? v.value ?? 0;
    const initVal = v.init ?? v.value ?? 0;
    const ratio = initVal !== 0 ? Math.min(Math.abs(curVal / initVal), 3) : 1;

    if (isStock) {
      // Stock: rectangle with fill level showing accumulated value
      const rw = 64, rh = 36;
      const fill = Math.min(1, ratio * 0.4) * rh;
      ctx.beginPath();
      ctx.rect(v._cx - rw/2, v._cy - rh/2, rw, rh);
      ctx.fillStyle = `${col}12`;
      ctx.fill();
      // Fill level from bottom
      if (fill > 0) {
        ctx.fillStyle = `${col}2a`;
        ctx.fillRect(v._cx - rw/2, v._cy + rh/2 - fill, rw, fill);
      }
      ctx.strokeStyle = `${col}cc`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Inlet/outlet pipes (top and bottom center)
      ctx.strokeStyle = `${col}66`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(v._cx, v._cy - rh/2); ctx.lineTo(v._cx, v._cy - rh/2 - 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(v._cx, v._cy + rh/2); ctx.lineTo(v._cx, v._cy + rh/2 + 10); ctx.stroke();
    } else if (isFlow) {
      // Flow: pipe/arrow shape
      const pulse = 0.6 + 0.4 * Math.sin(_CLD._animPhase * 3 + v._cx * 0.01);
      ctx.beginPath();
      ctx.arc(v._cx, v._cy, 18 * pulse, 0, Math.PI*2);
      ctx.fillStyle = `${col}18`;
      ctx.fill();
      ctx.strokeStyle = `${col}bb`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Flow direction arrow
      ctx.beginPath();
      ctx.moveTo(v._cx - 8, v._cy);
      ctx.lineTo(v._cx + 2, v._cy);
      ctx.lineTo(v._cx, v._cy - 4);
      ctx.moveTo(v._cx + 2, v._cy);
      ctx.lineTo(v._cx, v._cy + 4);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Auxiliary / constant: circle
      ctx.beginPath();
      ctx.arc(v._cx, v._cy, 22, 0, Math.PI*2);
      ctx.fillStyle = `${col}0e`;
      ctx.fill();
      ctx.strokeStyle = `${col}88`;
      ctx.lineWidth = 1;
      ctx.setLineDash(v.type === 'constant' ? [4,3] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Label
    const label = v.name.length > 12 ? v.name.slice(0,11) + '…' : v.name;
    ctx.font = `${isStock ? 9 : 8}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = col;
    ctx.fillText(label, v._cx, v._cy + (isStock ? 22 : 20));

    // Value badge
    const displayVal = (curVal || 0).toFixed(1);
    ctx.font = '7px monospace';
    ctx.fillStyle = 'rgba(200,220,240,.6)';
    ctx.fillText(displayVal + (v.unit ? ' '+v.unit : ''), v._cx, v._cy + (isStock ? 32 : 30));
  });

  ctx.restore();
}

// ── Sim chart renderer ────────────────────────────────────────────
function _renderSimChart() {
  const canvas = document.getElementById('sys-sim-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width  = canvas.offsetWidth;
  const H = canvas.height = canvas.offsetHeight || 130;

  ctx.clearRect(0, 0, W, H);

  const hist = SYSTEMS.simHistory;
  if (!hist || hist.length < 2) {
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(17,221,204,.3)';
    ctx.textAlign = 'center';
    ctx.fillText('Run simulation to see history', W/2, H/2);
    return;
  }

  const stocks = SYSTEMS.variables.filter(v => v.type === 'stock');
  if (!stocks.length) return;

  const typeColors = { stock:'#00c8ff', flow:'#ff8c22', auxiliary:'#cc44ff', constant:'#ffe04a' };

  stocks.forEach((v, vi) => {
    const vals = hist.map(h => h.values[v.id] || 0);
    const minV = Math.min(...vals), maxV = Math.max(...vals);
    const range = (maxV - minV) || 1;
    const col = typeColors[v.type];
    const [r,g,b] = col === '#00c8ff' ? [0,200,255] : col === '#ff8c22' ? [255,140,34] : [204,68,255];

    ctx.beginPath();
    vals.forEach((val, i) => {
      const x = (i / (vals.length-1)) * W;
      const y = H - ((val - minV) / range) * (H - 16) - 4;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = `rgba(${r},${g},${b},0.8)`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Label at end
    const lastY = H - ((vals[vals.length-1] - minV) / range) * (H-16) - 4;
    ctx.font = '7px monospace';
    ctx.fillStyle = col;
    ctx.textAlign = 'right';
    ctx.fillText(v.name.slice(0,10), W - 3, Math.max(10, Math.min(H-5, lastY)));
  });
}

// ── Helper functions ──────────────────────────────────────────────
function systemsSelectType(type) {
  SYSTEMS._selectedType = type;
  const types = ['stock','flow','auxiliary','constant'];
  const colors = { stock:'#00c8ff', flow:'#ff8c22', auxiliary:'#cc44ff', constant:'#ffe04a' };
  types.forEach(t => {
    const btn = document.getElementById(`sys-type-${t}`);
    if (!btn) return;
    const isActive = t === type;
    btn.style.background = isActive ? `${colors[t]}22` : 'transparent';
    btn.style.borderColor = isActive ? colors[t] : `${colors[t]}44`;
  });
}

function systemsSelectPolarity(pol) {
  SYSTEMS._selectedPolarity = pol;
  const posBtn = document.getElementById('sys-pol-pos');
  const negBtn = document.getElementById('sys-pol-neg');
  if (posBtn) {
    posBtn.style.background = pol > 0 ? 'rgba(0,255,136,.2)' : 'transparent';
    posBtn.style.borderColor = pol > 0 ? '#00ff88' : 'rgba(0,255,136,.3)';
  }
  if (negBtn) {
    negBtn.style.background = pol < 0 ? 'rgba(255,51,85,.15)' : 'transparent';
    negBtn.style.borderColor = pol < 0 ? '#ff3355' : 'rgba(255,51,85,.3)';
  }
}

function systemsQuickAddVar() {
  const name = document.getElementById('sys-var-name')?.value?.trim();
  if (!name) { mm_toast('Enter a variable name', 'warn'); return; }
  const type  = SYSTEMS._selectedType || 'stock';
  const value = parseFloat(document.getElementById('sys-var-value')?.value) || 0;
  const unit  = document.getElementById('sys-var-unit')?.value || '';
  systemsAddVar(name, type, value, unit);
  document.getElementById('sys-var-name').value = '';
  // Rebuild UI to update select lists
  const overlay = document.getElementById('mm-systems-overlay');
  if (overlay) _renderSystemsUI(overlay);
}

function systemsQuickAddLink() {
  const from = document.getElementById('sys-link-from')?.value;
  const to   = document.getElementById('sys-link-to')?.value;
  const pol  = SYSTEMS._selectedPolarity ?? 1;
  const lbl  = document.getElementById('sys-link-label')?.value?.trim() || '';
  if (!from || !to || from === to) { mm_toast('Select two different variables', 'warn'); return; }
  systemsAddLink(from, to, pol, 0, lbl);
  // Rebuild right panel to show new loop
  const overlay = document.getElementById('mm-systems-overlay');
  if (overlay) _renderSystemsUI(overlay);
}

function systemsRunAndAnimate() {
  const steps = parseInt(document.getElementById('sys-sim-steps')?.value) || 100;
  const dt    = parseFloat(document.getElementById('sys-sim-dt')?.value) || 0.05;
  systemsSimulate(steps, dt);
  _renderSimChart();
  _CLD.dirty = true;
}

function systemsResetSim() {
  SYSTEMS.simState = null;
  SYSTEMS.simHistory = [];
  SYSTEMS.variables.forEach(v => v.value = v.init ?? 0);
  _renderSimChart();
  _CLD.dirty = true;
  mm_toast('Simulation reset', 'info');
}

async function systemsClearAll() {
  if (!(await mmConfirm('Clear all variables and links? This cannot be undone.'))) return;
  SYSTEMS.variables = [];
  SYSTEMS.links = [];
  SYSTEMS.loops = [];
  SYSTEMS.simState = null;
  SYSTEMS.simHistory = [];
  systemsSave();
  const overlay = document.getElementById('mm-systems-overlay');
  if (overlay) _renderSystemsUI(overlay);
}

function systemsHighlightLoop(loopId) {
  _CLD._highlightLoop = _CLD._highlightLoop === loopId ? null : loopId;
}

function systemsStartWhatif() {
  const seed = document.getElementById('sys-whatif-seed')?.value?.trim();
  const d = parseInt(document.getElementById('sys-loop-depth')?.value) || 3;
  const b = parseInt(document.getElementById('sys-loop-branch')?.value) || 3;
  if (!seed) { runSystemWhatifLoop(); return; }
  closeSystems();
  whatifLoopStart(seed, { maxDepth: d, branchFactor: b, spawnCanvas: true });
}

function systemsExportToMainCanvas() {
  closeSystems();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
    const nodeMap = {};
    // Spawn each variable as appropriate node type
    SYSTEMS.variables.forEach((v, i) => {
      const angle = (i / SYSTEMS.variables.length) * Math.PI * 2;
      const r = 280;
      const typeMap = { stock: 'causal', flow: 'vector', auxiliary: 'feedback', constant: 'invariant' };
      const nodeType = typeMap[v.type] || 'concept';
      const typeColors = { stock:'#00c8ff', flow:'#ff8c22', auxiliary:'#cc44ff', constant:'#ffe04a' };
      const n = CANVAS.spawnNode(nodeType, cx + Math.cos(angle)*r, cy + Math.sin(angle)*r, {
        title: v.name,
        body: `${v.type} · init: ${v.init ?? v.value}${v.unit ? ' '+v.unit : ''}`,
        color: typeColors[v.type] || '#00c8ff',
        tags: ['SYSTEMS', v.type.toUpperCase()],
      });
      nodeMap[v.id] = n?.id;
    });
    // Spawn links
    setTimeout(() => {
      SYSTEMS.links.forEach(link => {
        const fn = nodeMap[link.from], tn = nodeMap[link.to];
        if (fn && tn) {
          CANVAS.addConn(fn, tn, (link.polarity > 0 ? '+ ' : '− ') + (link.label || ''));
        }
      });
      mm_toast('System → canvas', 'export');
    }, 300);
  }, 200);
}


/* ═══════════════════════════════════════════════════════════════════
   RELATIONAL MODULE — v1.0.0
   "You are shaped in relationship, not isolation."
   
   Architecture: fluid state, no rigid categories.
   - People as living nodes with attachment fields
   - Patterns emerge from logged moments, not imposed labels  
   - Co-regulation map: who stabilizes you and how
   - Relational needs: named but not medicalized
   - Communication texture: what's actually happening between you
   - Canvas integration: relational nodes spawn with full context
   
   Data model: flat arrays + derived views, not nested hierarchies.
   User adds moments/observations; the module finds patterns.
═══════════════════════════════════════════════════════════════════ */

const RELATIONAL_STATE = {
  _loaded: false,
  
  // People in your relational field
  people: [],
  // { id, name, color, role, attachmentNotes, coRegulationRating, 
  //   lastContact, aliveness }
  
  // Raw moments — the source of truth
  moments: [],
  // { id, personId, text, quality, bodyLocation, timestamp, tags[] }
  // quality: -2..+2 (disconnected → alive)
  
  // Active relational needs (not a fixed list)
  needs: [],
  // { id, text, urgency, personId|null, timestamp }
  
  // Communication threads (what's moving between you and someone)
  threads: [],
  // { id, personId, text, direction: 'toward'|'away'|'around', timestamp }
  
  // Patterns that have emerged (user-named or AI-surfaced)
  patterns: [],
  // { id, personId|null, text, frequency, lastSeen, canvasNodeId }
};

const RELATIONAL_KEY = 'mm_relational_state';

function relationalLoad() {
  // SECURITY FIX: this read localStorage['mm_relational_state'] — people,
  // moments, needs, patterns about the people in your life — and could
  // clobber correctly-decrypted vault state with a stale plaintext copy,
  // only firing the first time the module opened in a session, i.e.
  // AFTER vaultDeserialize() (mastermind-vault.js, modules.relational)
  // had already restored the real thing. Vault-only now; see
  // _ORPHAN_KEYS for recovering any pre-fix copy.
  RELATIONAL_STATE._loaded = true;
}

function relationalSave() {
  // SECURITY FIX: this used to ALSO write localStorage['mm_relational_state']
  // in plaintext, in parallel with the vault, on every change — the
  // single most sensitive category of data in this app (people, moments,
  // needs) sitting unencrypted on disk regardless of whether vault
  // encryption was on. The vault is the only store now (modules.relational
  // already covers it in full).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

// ── Color palette for people nodes ────────────────────────────────
const REL_COLORS = [
  '#00c8ff','#cc44ff','#ff8c22','#00ff88','#ff66aa',
  '#d4a820','#7744ff','#11ddcc','#ff3355','#88ffcc',
];

function _relColor(idx) { return REL_COLORS[idx % REL_COLORS.length]; }

// ── Quality labels — felt sense, not clinical ─────────────────────
const QUALITY_LABELS = {
  '-2': { label: 'disconnected',  color: '#ff3355', icon: '▾' },
  '-1': { label: 'contracted',    color: '#ff8c22', icon: '◦' },
   '0': { label: 'neutral',       color: '#555',    icon: '─' },
   '1': { label: 'present',       color: '#00c8ff', icon: '◉' },
   '2': { label: 'alive',         color: '#00ff88', icon: '✦' },
};

function _qualityLabel(q) {
  return QUALITY_LABELS[String(Math.round(q))] || QUALITY_LABELS['0'];
}

// ── Attachment orientation helper (not a diagnosis, a signal) ─────
const ATTACH_HINTS = [
  { id: 'secure',       label: 'Secure',       desc: 'Easy closeness + autonomy', color: '#00ff88' },
  { id: 'anxious',      label: 'Anxious',      desc: 'Closeness feels urgent',    color: '#ff8c22' },
  { id: 'avoidant',     label: 'Avoidant',     desc: 'Distance feels safer',      color: '#00c8ff' },
  { id: 'disorganized', label: 'Disorganized', desc: 'Both pull in same moment',  color: '#cc44ff' },
  { id: 'unknown',      label: 'Still figuring out', desc: '',                    color: '#555'    },
];

// ── Open / close ──────────────────────────────────────────────────
function openRelational() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'relational' });
  if (!RELATIONAL_STATE._loaded) relationalLoad();
  
  let overlay = document.getElementById('mm-relational-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-relational-overlay';
    overlay.style.cssText = [
      'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800',
      'background:rgba(1,3,8,.97);backdrop-filter:blur(8px)',
      'display:flex;flex-direction:column;overflow:hidden',
    ].join(';');
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderRelationalUI(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.4, window.innerHeight * 0.5, 0.9);
}

function closeRelational() {
  const el = document.getElementById('mm-relational-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
  relationalSave();
}

// ── Main render ───────────────────────────────────────────────────
function _renderRelationalUI(overlay) {
  overlay.innerHTML = '';

  // ── Header ──────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.style.cssText = [
    'display:flex;align-items:center;gap:14px;padding:12px 22px',
    'border-bottom:1px solid rgba(255,102,170,.2)',
    'background:rgba(255,102,170,.04);flex-shrink:0',
  ].join(';');
  header.innerHTML = `
    <span style="font-size:20px;filter:drop-shadow(0 0 10px #ff66aa)">⬡</span>
    <div>
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;letter-spacing:5px;
        background:linear-gradient(135deg,#ff66aa,#cc44ff,#7744ff);
        -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text">
        RELATIONAL
      </div>
      <div style="font-family:var(--f-mono);font-size:7px;color:rgba(255,102,170,.5);
        letter-spacing:2px;margin-top:1px">
        YOU ARE SHAPED IN RELATIONSHIP · NOT ISOLATION
      </div>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
      <button onclick="relationalExportCanvas()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 13px;
        border:1px solid rgba(255,102,170,.3);color:#ff66aa;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,102,170,.1)'"
        onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      <button onclick="relationalAISurface()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 13px;
        border:1px solid rgba(204,68,255,.3);color:#cc44ff;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(204,68,255,.1)'"
        onmouseleave="this.style.background='transparent'">✦ SURFACE PATTERNS</button>
      <button onclick="closeRelational();goHome()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 13px;
        border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,255,255,.04)'"
        onmouseleave="this.style.background='transparent'">⌂ HOME</button>
    </div>
  `;
  overlay.appendChild(header);

  // ── Body: two-column layout ──────────────────────────────────────
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;overflow:hidden';
  overlay.appendChild(body);

  // Left: people field + quick-add moment
  const left = document.createElement('div');
  left.style.cssText = [
    'width:340px;flex-shrink:0;display:flex;flex-direction:column',
    'border-right:1px solid rgba(255,102,170,.12);overflow:hidden',
  ].join(';');
  body.appendChild(left);
  _renderPeoplePanel(left);

  // Right: detail view (moments / needs / threads / patterns)
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden';
  body.appendChild(right);
  _renderDetailPanel(right);
}

// ── People panel ──────────────────────────────────────────────────
function _renderPeoplePanel(container) {
  container.innerHTML = '';

  // Section header + add button
  const hdr = document.createElement('div');
  hdr.style.cssText = 'padding:14px 16px 10px;flex-shrink:0';
  hdr.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;color:#ff66aa">
        RELATIONAL FIELD
      </span>
      <button id="rel-add-person-btn" onclick="relationalAddPersonPrompt()" style="
        font-family:var(--f-mono);font-size:7px;letter-spacing:1px;padding:5px 10px;
        border:1px solid rgba(255,102,170,.4);color:#ff66aa;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,102,170,.12)'"
        onmouseleave="this.style.background='transparent'">+ ADD PERSON</button>
    </div>
    <div id="rel-person-add-form" style="display:none;margin-bottom:10px"></div>
  `;
  container.appendChild(hdr);

  // People list — scrollable
  const list = document.createElement('div');
  list.id = 'rel-people-list';
  list.style.cssText = 'flex:1;overflow-y:auto;padding:0 16px 16px';
  container.appendChild(list);

  // Quick-add moment at bottom
  const quickAdd = document.createElement('div');
  quickAdd.style.cssText = [
    'padding:12px 16px;border-top:1px solid rgba(255,102,170,.1)',
    'flex-shrink:0;background:rgba(255,102,170,.03)',
  ].join(';');
  quickAdd.innerHTML = `
    <div style="font-family:var(--f-mono);font-size:7px;color:rgba(255,102,170,.5);
      letter-spacing:1.5px;margin-bottom:6px">QUICK LOG</div>
    <textarea id="rel-moment-text" placeholder="What just happened in this relationship?  
What did you notice in your body?  
What do you need right now?" style="
      width:100%;box-sizing:border-box;height:64px;resize:none;
      font-family:var(--f-mono);font-size:8px;color:var(--bright);
      background:rgba(0,0,0,.4);border:1px solid rgba(255,102,170,.2);
      padding:8px;line-height:1.6;outline:none;
      transition:border-color .15s"
      onfocus="this.style.borderColor='rgba(255,102,170,.5)'"
      onblur="this.style.borderColor='rgba(255,102,170,.2)'"></textarea>
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
      <select id="rel-moment-person" style="
        flex:1;font-family:var(--f-mono);font-size:7.5px;
        background:rgba(0,0,0,.5);border:1px solid rgba(255,102,170,.2);
        color:var(--muted);padding:5px 7px;cursor:pointer">
        <option value="">— person (optional)</option>
        ${RELATIONAL_STATE.people.map(p => `<option value="${p.id}">${escH(p.name)}</option>`).join('')}
      </select>
      <div style="display:flex;gap:3px">
        ${[-2,-1,0,1,2].map(q => {
          const ql = _qualityLabel(q);
          return `<button title="${ql.label}" onclick="relationalQuickLog(${q})" style="
            width:22px;height:22px;border:1px solid ${ql.color}44;
            background:${ql.color}11;color:${ql.color};font-size:10px;cursor:pointer;
            transition:all .12s"
            onmouseenter="this.style.background='${ql.color}33'"
            onmouseleave="this.style.background='${ql.color}11'">${ql.icon}</button>`;
        }).join('')}
      </div>
    </div>
  `;
  container.appendChild(quickAdd);

  _renderPeopleList();
}

function _renderPeopleList() {
  const list = document.getElementById('rel-people-list');
  if (!list) return;
  list.innerHTML = '';

  if (!RELATIONAL_STATE.people.length) {
    list.innerHTML = `
      <div style="padding:24px 0;text-align:center;color:var(--dim);font-family:var(--f-mono);font-size:8px;line-height:2">
        No people in your relational field yet.<br>
        <span style="color:var(--wire2)">Add someone you're in relationship with.<br>
        Partner, friend, parent, colleague.<br>Anyone who shapes how you are.</span>
      </div>`;
    return;
  }

  RELATIONAL_STATE.people.forEach((person, idx) => {
    const moments = RELATIONAL_STATE.moments.filter(m => m.personId === person.id);
    const lastMoment = moments.sort((a,b) => b.timestamp - a.timestamp)[0];
    const avgQ = moments.length
      ? moments.slice(-5).reduce((s,m) => s + m.quality, 0) / Math.min(moments.length, 5)
      : 0;
    const ql = _qualityLabel(Math.round(avgQ));
    const needCount = RELATIONAL_STATE.needs.filter(n => n.personId === person.id).length;
    const threadCount = RELATIONAL_STATE.threads.filter(t => t.personId === person.id).length;
    const isSelected = window._relSelectedPerson === person.id;

    const card = document.createElement('div');
    card.style.cssText = [
      `padding:11px 13px;margin-bottom:7px;cursor:pointer`,
      `border:1px solid ${isSelected ? person.color : 'rgba(255,255,255,.06)'}`,
      `background:${isSelected ? `${person.color}0d` : 'rgba(0,0,0,.3)'}`,
      `transition:all .15s;border-radius:2px`,
    ].join(';');
    card.innerHTML = `
      <div style="display:flex;align-items:center;gap:9px">
        <div style="width:9px;height:9px;border-radius:50%;background:${person.color};
          flex-shrink:0;box-shadow:0 0 6px ${person.color}88"></div>
        <span style="font-family:var(--f-display);font-size:10px;font-weight:700;
          letter-spacing:2px;color:${person.color};flex:1">${escH(person.name.toUpperCase())}</span>
        <span style="font-family:var(--f-mono);font-size:7px;color:${ql.color}"
          title="Average felt quality (last 5 moments)">${ql.icon} ${ql.label}</span>
      </div>
      ${person.role ? `<div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
        margin-top:3px;padding-left:18px">${escH(person.role)}</div>` : ''}
      <div style="display:flex;gap:12px;margin-top:6px;padding-left:18px">
        <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">
          ${moments.length} moment${moments.length !== 1 ? 's' : ''}
        </span>
        ${needCount ? `<span style="font-family:var(--f-mono);font-size:7px;color:#ff8c22">
          ${needCount} need${needCount !== 1 ? 's' : ''}</span>` : ''}
        ${threadCount ? `<span style="font-family:var(--f-mono);font-size:7px;color:#00c8ff">
          ${threadCount} thread${threadCount !== 1 ? 's' : ''}</span>` : ''}
        ${lastMoment ? `<span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2)">
          ${_relTimeAgo(lastMoment.timestamp)}</span>` : ''}
      </div>
    `;
    card.addEventListener('click', () => {
      window._relSelectedPerson = isSelected ? null : person.id;
      _renderPeopleList();
      _renderDetailPanel(document.getElementById('mm-relational-overlay')?.querySelector('div[style*="flex:1"]'));
    });
    card.addEventListener('mouseenter', () => {
      if (!isSelected) { card.style.borderColor = `${person.color}44`; card.style.background = `${person.color}08`; }
    });
    card.addEventListener('mouseleave', () => {
      if (!isSelected) { card.style.borderColor = 'rgba(255,255,255,.06)'; card.style.background = 'rgba(0,0,0,.3)'; }
    });
    list.appendChild(card);
  });
}

// ── Detail panel ──────────────────────────────────────────────────
function _renderDetailPanel(container) {
  if (!container) return;
  container.innerHTML = '';
  const person = RELATIONAL_STATE.people.find(p => p.id === window._relSelectedPerson);

  if (!person) {
    _renderRelationalOverview(container);
    return;
  }
  _renderPersonDetail(container, person);
}

function _renderRelationalOverview(container) {
  // Global view: needs, patterns, recent moments across all people
  const wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;overflow-y:auto;padding:22px 28px;display:flex;flex-direction:column;gap:28px';
  container.appendChild(wrap);

  // ── Active needs ─────────────────────────────────────────────────
  const needsSection = document.createElement('div');
  needsSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
      <span style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;color:#ff8c22">
        RELATIONAL NEEDS
      </span>
      <button onclick="relationalAddNeed()" style="
        font-family:var(--f-mono);font-size:7px;letter-spacing:1px;padding:4px 9px;
        border:1px solid rgba(255,140,34,.3);color:#ff8c22;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,140,34,.1)'"
        onmouseleave="this.style.background='transparent'">+ NEED</button>
    </div>
    <div id="rel-needs-list">${_renderNeedsList()}</div>
  `;
  wrap.appendChild(needsSection);

  // ── Recent moments ────────────────────────────────────────────────
  const momentsSection = document.createElement('div');
  const recentMoments = [...RELATIONAL_STATE.moments]
    .sort((a,b) => b.timestamp - a.timestamp)
    .slice(0, 12);
  momentsSection.innerHTML = `
    <div style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;
      color:var(--c);margin-bottom:12px">RECENT MOMENTS</div>
    <div style="display:flex;flex-direction:column;gap:7px">
      ${recentMoments.length ? recentMoments.map(m => {
        const ql = _qualityLabel(m.quality);
        const person = RELATIONAL_STATE.people.find(p => p.id === m.personId);
        return `<div style="padding:9px 12px;background:rgba(0,0,0,.35);
          border-left:2px solid ${ql.color};display:flex;gap:10px;align-items:flex-start">
          <span style="color:${ql.color};font-size:12px;flex-shrink:0;margin-top:1px">${ql.icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--bright);
              line-height:1.5;word-break:break-word">${escH(m.text)}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-top:3px">
              ${person ? `<span style="color:${person.color}">${escH(person.name)}</span> · ` : ''}
              ${_relTimeAgo(m.timestamp)}
              ${m.bodyLocation ? ` · <span style="color:var(--wire2)">${escH(m.bodyLocation)}</span>` : ''}
            </div>
          </div>
          <button onclick="relationalDeleteMoment('${m.id}')" style="
            background:none;border:none;cursor:pointer;color:var(--wire2);font-size:12px;
            flex-shrink:0;padding:0;line-height:1"
            onmouseenter="this.style.color='var(--r)'"
            onmouseleave="this.style.color='var(--wire2)'">×</button>
        </div>`;
      }).join('') : `<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;
        padding:16px 0">No moments logged yet. Use the quick log to capture relational texture.</div>`}
    </div>
  `;
  wrap.appendChild(momentsSection);

  // ── Patterns ──────────────────────────────────────────────────────
  if (RELATIONAL_STATE.patterns.length) {
    const patternsSection = document.createElement('div');
    patternsSection.innerHTML = `
      <div style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;
        color:#cc44ff;margin-bottom:12px">SURFACED PATTERNS</div>
      <div style="display:flex;flex-direction:column;gap:7px">
        ${RELATIONAL_STATE.patterns.map(p => {
          const person = RELATIONAL_STATE.people.find(pp => pp.id === p.personId);
          return `<div style="padding:9px 12px;background:rgba(204,68,255,.06);
            border:1px solid rgba(204,68,255,.15);display:flex;align-items:flex-start;gap:10px">
            <span style="color:#cc44ff;font-size:10px;flex-shrink:0">◈</span>
            <div style="flex:1">
              <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright)">${escH(p.text)}</div>
              ${person ? `<div style="font-family:var(--f-mono);font-size:7px;color:${person.color};margin-top:2px">
                with ${escH(person.name)}</div>` : ''}
            </div>
            <button onclick="relationalPatternToCanvas('${p.id}')" style="
              font-family:var(--f-mono);font-size:7px;padding:3px 7px;
              border:1px solid rgba(204,68,255,.3);color:#cc44ff;background:transparent;cursor:pointer"
              onmouseenter="this.style.background='rgba(204,68,255,.1)'"
              onmouseleave="this.style.background='transparent'">→ NODE</button>
          </div>`;
        }).join('')}
      </div>
    `;
    wrap.appendChild(patternsSection);
  }
}

function _renderPersonDetail(container, person) {
  const ql = _qualityLabel(0);
  const moments = [...RELATIONAL_STATE.moments]
    .filter(m => m.personId === person.id)
    .sort((a,b) => b.timestamp - a.timestamp);
  const threads = RELATIONAL_STATE.threads.filter(t => t.personId === person.id);
  const avgQ = moments.length
    ? moments.slice(-5).reduce((s,m) => s + m.quality, 0) / Math.min(moments.length, 5)
    : 0;
  const currentQl = _qualityLabel(Math.round(avgQ));
  const attachHint = ATTACH_HINTS.find(a => a.id === person.attachmentHint) || ATTACH_HINTS[4];

  const wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;overflow-y:auto;padding:22px 28px;display:flex;flex-direction:column;gap:24px';
  container.appendChild(wrap);

  // ── Person header ─────────────────────────────────────────────────
  wrap.innerHTML += `
    <div style="display:flex;align-items:flex-start;gap:18px">
      <div style="width:44px;height:44px;border-radius:50%;background:${person.color}22;
        border:2px solid ${person.color};display:flex;align-items:center;justify-content:center;
        flex-shrink:0;font-size:18px;color:${person.color};box-shadow:0 0 16px ${person.color}44">
        ${person.name[0].toUpperCase()}
      </div>
      <div style="flex:1">
        <div style="font-family:var(--f-display);font-size:16px;font-weight:800;
          letter-spacing:4px;color:${person.color}">${escH(person.name.toUpperCase())}</div>
        ${person.role ? `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
          letter-spacing:1px;margin-top:2px">${escH(person.role)}</div>` : ''}
        <div style="display:flex;gap:14px;margin-top:8px;flex-wrap:wrap">
          <span style="font-family:var(--f-mono);font-size:7.5px;color:${currentQl.color}">
            ${currentQl.icon} ${currentQl.label} (recent avg)</span>
          <span style="font-family:var(--f-mono);font-size:7.5px;color:${attachHint.color}">
            ◦ ${attachHint.label}</span>
          <span style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim)">
            ${moments.length} moment${moments.length !== 1 ? 's' : ''} logged</span>
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-shrink:0">
        <button onclick="relationalEditPerson('${person.id}')" style="
          font-family:var(--f-mono);font-size:7px;padding:5px 10px;
          border:1px solid ${person.color}44;color:${person.color};background:transparent;cursor:pointer"
          onmouseenter="this.style.background='${person.color}11'"
          onmouseleave="this.style.background='transparent'">EDIT</button>
        <button onclick="relationalPersonToCanvas('${person.id}')" style="
          font-family:var(--f-mono);font-size:7px;padding:5px 10px;
          border:1px solid rgba(255,255,255,.1);color:var(--dim);background:transparent;cursor:pointer"
          onmouseenter="this.style.background='rgba(255,255,255,.05)'"
          onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      </div>
    </div>
  `;

  // ── Attachment + co-regulation ────────────────────────────────────
  wrap.innerHTML += `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:10px">ATTACHMENT SIGNAL</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${ATTACH_HINTS.map(hint => `
            <div onclick="relationalSetAttachment('${person.id}','${hint.id}')"
              style="padding:6px 9px;cursor:pointer;border:1px solid ${
                person.attachmentHint === hint.id ? hint.color : 'rgba(255,255,255,.05)'};
              background:${person.attachmentHint === hint.id ? hint.color + '11' : 'transparent'};
              display:flex;align-items:center;gap:8px;transition:all .12s"
              onmouseenter="this.style.background='${hint.color}0d'"
              onmouseleave="this.style.background='${person.attachmentHint === hint.id ? hint.color+'11' : 'transparent'}'">
              <div style="width:7px;height:7px;border-radius:50%;
                background:${person.attachmentHint === hint.id ? hint.color : 'transparent'};
                border:1px solid ${hint.color};flex-shrink:0"></div>
              <div>
                <div style="font-family:var(--f-mono);font-size:8px;color:${hint.color}">${hint.label}</div>
                ${hint.desc ? `<div style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">${hint.desc}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:10px">CO-REGULATION</div>
        <div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);
          margin-bottom:8px">How regulated do you feel with them?</div>
        <div style="display:flex;gap:4px;margin-bottom:10px">
          ${[1,2,3,4,5].map(n => `
            <div onclick="relationalSetCoReg('${person.id}',${n})" style="
              flex:1;height:26px;cursor:pointer;display:flex;align-items:center;
              justify-content:center;font-family:var(--f-mono);font-size:8px;
              border:1px solid ${(person.coRegRating||0)>=n ? '#00ff8866' : 'rgba(255,255,255,.08)'};
              background:${(person.coRegRating||0)>=n ? 'rgba(0,255,136,.08)' : 'transparent'};
              color:${(person.coRegRating||0)>=n ? '#00ff88' : 'var(--wire2)'};
              transition:all .12s">${n}</div>
          `).join('')}
        </div>
        <textarea id="rel-coreg-notes-${person.id}" placeholder="What actually helps you regulate with them?" style="
          width:100%;box-sizing:border-box;height:55px;resize:none;
          font-family:var(--f-mono);font-size:7.5px;color:var(--bright);
          background:rgba(0,0,0,.4);border:1px solid rgba(0,255,136,.15);
          padding:7px;line-height:1.5;outline:none"
          onblur="relationalSaveCoRegNotes('${person.id}',this.value)"
          onfocus="this.style.borderColor='rgba(0,255,136,.4)'"
          >${escH(person.coRegNotes || '')}</textarea>
      </div>
    </div>
  `;

  // ── Active communication threads ──────────────────────────────────
  const threadSection = document.createElement('div');
  threadSection.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <span style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;color:#00c8ff">
        COMMUNICATION THREADS
      </span>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px" id="rel-threads-${person.id}">
      ${threads.length ? threads.map(t => {
        const dirColor = { toward: '#00ff88', away: '#ff3355', around: '#ff8c22' }[t.direction] || '#00c8ff';
        const dirLabel = { toward: '→ toward', away: '↙ away', around: '↻ around' }[t.direction] || '→';
        return `<div style="padding:8px 11px;background:rgba(0,200,255,.05);
          border-left:2px solid ${dirColor};display:flex;gap:10px;align-items:center">
          <span style="font-family:var(--f-mono);font-size:7px;color:${dirColor};
            flex-shrink:0;min-width:56px">${dirLabel}</span>
          <span style="font-family:var(--f-mono);font-size:8px;color:var(--bright);flex:1">
            ${escH(t.text)}</span>
          <button onclick="relationalDeleteThread('${t.id}')" style="
            background:none;border:none;cursor:pointer;color:var(--wire2);font-size:12px"
            onmouseenter="this.style.color='var(--r)'"
            onmouseleave="this.style.color='var(--wire2)'">×</button>
        </div>`;
      }).join('') : `<div style="color:var(--dim);font-family:var(--f-mono);font-size:7.5px;
        padding:8px 0">What's moving between you two right now?</div>`}
    </div>
    <div style="display:flex;gap:7px">
      <input id="rel-thread-input-${person.id}" placeholder="What's moving between you..." style="
        flex:1;font-family:var(--f-mono);font-size:8px;padding:7px 10px;
        background:rgba(0,0,0,.4);border:1px solid rgba(0,200,255,.2);
        color:var(--bright);outline:none"
        onfocus="this.style.borderColor='rgba(0,200,255,.5)'"
        onblur="this.style.borderColor='rgba(0,200,255,.2)'"
        onkeydown="if(event.key==='Enter')relationalAddThread('${person.id}')"/>
      ${['toward','around','away'].map(dir => {
        const dc = { toward: '#00ff88', around: '#ff8c22', away: '#ff3355' }[dir];
        const dl = { toward: '→', around: '↻', away: '↙' }[dir];
        return `<button onclick="relationalAddThread('${person.id}','${dir}')" style="
          font-family:var(--f-mono);font-size:7px;padding:5px 9px;cursor:pointer;
          border:1px solid ${dc}44;color:${dc};background:transparent"
          onmouseenter="this.style.background='${dc}11'"
          onmouseleave="this.style.background='transparent'"
          title="${dir}">${dl} ${dir}</button>`;
      }).join('')}
    </div>
  `;
  wrap.appendChild(threadSection);

  // ── Moment log for this person ────────────────────────────────────
  const momSection = document.createElement('div');
  momSection.innerHTML = `
    <div style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;
      color:${person.color};margin-bottom:12px">MOMENTS WITH ${escH(person.name.toUpperCase())}</div>
    <div style="display:flex;flex-direction:column;gap:7px">
      ${moments.slice(0,20).map(m => {
        const ql = _qualityLabel(m.quality);
        return `<div style="padding:9px 12px;background:rgba(0,0,0,.3);
          border-left:2px solid ${ql.color};display:flex;gap:10px;align-items:flex-start">
          <span style="color:${ql.color};font-size:12px;flex-shrink:0;margin-top:1px">${ql.icon}</span>
          <div style="flex:1">
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--bright);line-height:1.5">
              ${escH(m.text)}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-top:3px">
              ${_relTimeAgo(m.timestamp)}
              ${m.bodyLocation ? ` · <span style="color:var(--wire2)">${escH(m.bodyLocation)}</span>` : ''}
            </div>
          </div>
          <button onclick="relationalDeleteMoment('${m.id}')" style="
            background:none;border:none;cursor:pointer;color:var(--wire2);font-size:12px"
            onmouseenter="this.style.color='var(--r)'"
            onmouseleave="this.style.color='var(--wire2)'">×</button>
        </div>`;
      }).join('')}
      ${!moments.length ? `<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;
        padding:10px 0">No moments logged yet for this person.</div>` : ''}
    </div>
  `;
  wrap.appendChild(momSection);
}

function _renderNeedsList() {
  const active = RELATIONAL_STATE.needs.filter(n => !n.met);
  if (!active.length) {
    return `<div style="color:var(--dim);font-family:var(--f-mono);font-size:8px;padding:8px 0">
      No active relational needs. What do you need in your relationships right now?</div>`;
  }
  return active.map(n => {
    const person = RELATIONAL_STATE.people.find(p => p.id === n.personId);
    const urgencyColor = ['#555','#ff8c22','#ff3355'][Math.min(n.urgency || 0, 2)];
    return `<div style="padding:8px 12px;margin-bottom:5px;background:rgba(255,140,34,.06);
      border:1px solid rgba(255,140,34,.15);display:flex;align-items:center;gap:10px">
      <div style="width:6px;height:6px;border-radius:50%;background:${urgencyColor};
        flex-shrink:0;box-shadow:0 0 4px ${urgencyColor}66"></div>
      <div style="flex:1">
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright)">${escH(n.text)}</div>
        ${person ? `<div style="font-family:var(--f-mono);font-size:7px;color:${person.color};
          margin-top:2px">with ${escH(person.name)}</div>` : ''}
      </div>
      <button onclick="relationalMarkNeedMet('${n.id}')" style="
        font-family:var(--f-mono);font-size:7px;padding:3px 7px;
        border:1px solid rgba(0,255,136,.3);color:#00ff88;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(0,255,136,.08)'"
        onmouseleave="this.style.background='transparent'">✓ met</button>
      <button onclick="relationalDeleteNeed('${n.id}')" style="
        background:none;border:none;cursor:pointer;color:var(--wire2);font-size:12px"
        onmouseenter="this.style.color='var(--r)'"
        onmouseleave="this.style.color='var(--wire2)'">×</button>
    </div>`;
  }).join('');
}

// ── Action handlers ───────────────────────────────────────────────
function relationalAddPersonPrompt() {
  const form = document.getElementById('rel-person-add-form');
  if (!form) return;
  const isOpen = form.style.display !== 'none';
  if (isOpen) { form.style.display = 'none'; return; }
  form.style.display = 'block';
  form.innerHTML = `
    <div style="padding:12px;background:rgba(255,102,170,.06);
      border:1px solid rgba(255,102,170,.2);display:flex;flex-direction:column;gap:8px">
      <input id="rel-new-name" placeholder="Name" style="
        font-family:var(--f-mono);font-size:8.5px;padding:7px 10px;
        background:rgba(0,0,0,.5);border:1px solid rgba(255,102,170,.25);
        color:var(--bright);outline:none;width:100%;box-sizing:border-box"
        onfocus="this.style.borderColor='rgba(255,102,170,.5)'"
        onblur="this.style.borderColor='rgba(255,102,170,.25)'"
        onkeydown="if(event.key==='Enter')relationalConfirmAddPerson()"/>
      <input id="rel-new-role" placeholder="Role (partner, friend, parent… whatever fits)" style="
        font-family:var(--f-mono);font-size:8px;padding:6px 10px;
        background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);
        color:var(--bright);outline:none;width:100%;box-sizing:border-box"/>
      <div style="display:flex;gap:7px">
        <button onclick="relationalConfirmAddPerson()" style="
          flex:1;padding:7px;font-family:var(--f-mono);font-size:8px;letter-spacing:1px;
          border:1px solid rgba(255,102,170,.4);color:#ff66aa;background:transparent;cursor:pointer"
          onmouseenter="this.style.background='rgba(255,102,170,.1)'"
          onmouseleave="this.style.background='transparent'">ADD TO FIELD</button>
        <button onclick="document.getElementById('rel-person-add-form').style.display='none'" style="
          padding:7px 12px;font-family:var(--f-mono);font-size:8px;
          border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer">
          CANCEL</button>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById('rel-new-name')?.focus(), 60);
}

function relationalConfirmAddPerson() {
  const name = document.getElementById('rel-new-name')?.value.trim();
  if (!name) return;
  const role = document.getElementById('rel-new-role')?.value.trim();
  const color = _relColor(RELATIONAL_STATE.people.length);
  RELATIONAL_STATE.people.push({
    id: uuid(), name, role: role || '', color,
    attachmentHint: 'unknown', coRegRating: 0, coRegNotes: '',
    created: Date.now(),
  });
  relationalSave();
  document.getElementById('rel-person-add-form').style.display = 'none';
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalQuickLog(quality) {
  const text = document.getElementById('rel-moment-text')?.value.trim();
  if (!text) { mm_toast('Add a moment first', 'warn'); return; }
  const personId = document.getElementById('rel-moment-person')?.value || null;
  RELATIONAL_STATE.moments.push({
    id: uuid(), personId: personId || null, text,
    quality, bodyLocation: '', timestamp: Date.now(), tags: [],
  });
  document.getElementById('rel-moment-text').value = '';
  relationalSave();
  mm_toast('Moment logged', 'success', { dur: 1500 });
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

async function relationalAddNeed() {
  const text = await mmPrompt('What do you need in your relationships right now?');
  if (!text?.trim()) return;
  const personId = window._relSelectedPerson || null;
  RELATIONAL_STATE.needs.push({
    id: uuid(), text: text.trim(), urgency: 1,
    personId, met: false, timestamp: Date.now(),
  });
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalMarkNeedMet(id) {
  const n = RELATIONAL_STATE.needs.find(x => x.id === id);
  if (n) { n.met = true; n.metAt = Date.now(); }
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalDeleteNeed(id) {
  RELATIONAL_STATE.needs = RELATIONAL_STATE.needs.filter(n => n.id !== id);
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalDeleteMoment(id) {
  RELATIONAL_STATE.moments = RELATIONAL_STATE.moments.filter(m => m.id !== id);
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalAddThread(personId, direction) {
  const inp = document.getElementById(`rel-thread-input-${personId}`);
  const text = inp?.value.trim();
  if (!text) return;
  RELATIONAL_STATE.threads.push({
    id: uuid(), personId, text,
    direction: direction || 'toward', timestamp: Date.now(),
  });
  if (inp) inp.value = '';
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalDeleteThread(id) {
  RELATIONAL_STATE.threads = RELATIONAL_STATE.threads.filter(t => t.id !== id);
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalSetAttachment(personId, hint) {
  const p = RELATIONAL_STATE.people.find(x => x.id === personId);
  if (p) p.attachmentHint = hint;
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalSetCoReg(personId, rating) {
  const p = RELATIONAL_STATE.people.find(x => x.id === personId);
  if (p) p.coRegRating = rating;
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalSaveCoRegNotes(personId, notes) {
  const p = RELATIONAL_STATE.people.find(x => x.id === personId);
  if (p) p.coRegNotes = notes;
  relationalSave();
}

async function relationalEditPerson(id) {
  const p = RELATIONAL_STATE.people.find(x => x.id === id);
  if (!p) return;
  const name = await mmPrompt('Name:', p.name);
  if (!name?.trim()) return;
  const role = await mmPrompt('Role (partner, friend, parent…):', p.role);
  p.name = name.trim();
  p.role = (role || '').trim();
  relationalSave();
  const overlay = document.getElementById('mm-relational-overlay');
  if (overlay) _renderRelationalUI(overlay);
}

function relationalPersonToCanvas(personId) {
  const p = RELATIONAL_STATE.people.find(x => x.id === personId);
  if (!p) return;
  closeRelational();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const personNode = CANVAS.spawnNode('relational', undefined, undefined, {
      title: p.name, body: p.role || '', color: p.color,
      tags: ['RELATIONAL', p.attachmentHint?.toUpperCase() || 'PERSON'],
    });
    // Spawn recent moments as connected nodes
    const moments = [...RELATIONAL_STATE.moments]
      .filter(m => m.personId === personId)
      .sort((a,b) => b.timestamp - a.timestamp)
      .slice(0, 4);
    moments.forEach((m, i) => {
      const ql = _qualityLabel(m.quality);
      const mNode = CANVAS.spawnNode('pattern', undefined, undefined, {
        title: m.text.slice(0, 50), color: ql.color,
        tags: ['MOMENT', ql.label.toUpperCase()],
      });
      CANVAS.addConn(personNode.id, mNode.id, 'moment');
    });
    // Spawn active needs
    RELATIONAL_STATE.needs.filter(n => n.personId === personId && !n.met).forEach(n => {
      const nNode = CANVAS.spawnNode('gap', undefined, undefined, {
        title: n.text, tags: ['NEED', 'RELATIONAL'],
      });
      CANVAS.addConn(personNode.id, nNode.id, 'needs');
    });
    mm_toast(`${p.name} → canvas`, 'export');
  }, 200);
}

function relationalPatternToCanvas(patternId) {
  const pat = RELATIONAL_STATE.patterns.find(x => x.id === patternId);
  if (!pat) return;
  closeRelational();
  CANVAS.enterCanvas();
  setTimeout(() => {
    CANVAS.spawnNode('pattern', undefined, undefined, {
      title: pat.text, tags: ['RELATIONAL PATTERN'],
      color: '#cc44ff',
    });
    mm_toast('Pattern → canvas', 'export');
  }, 200);
}

function relationalExportCanvas() {
  closeRelational();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const cx = 600, cy = 400, personR = 320;
    // Hub node
    const hub = CANVAS.spawnNode('synthesis', cx, cy, {
      title: 'Relational Field', color: '#ff66aa', tags: ['RELATIONAL', 'FIELD'],
    });
    // Each person as a node in a circle
    RELATIONAL_STATE.people.forEach((p, i) => {
      const angle = (i / RELATIONAL_STATE.people.length) * Math.PI * 2;
      const px = cx + Math.cos(angle) * personR;
      const py = cy + Math.sin(angle) * personR;
      const pNode = CANVAS.spawnNode('relational', px, py, {
        title: p.name, body: p.role || '', color: p.color,
        tags: ['PERSON', p.attachmentHint?.toUpperCase() || ''],
      });
      CANVAS.addConn(hub.id, pNode.id, 'relational field');
      // Active threads as child nodes
      RELATIONAL_STATE.threads
        .filter(t => t.personId === p.id)
        .slice(0, 2)
        .forEach(t => {
          const dir = { toward: '→', away: '↙', around: '↻' }[t.direction] || '→';
          const tNode = CANVAS.spawnNode('vector', px + 80, py, {
            title: `${dir} ${t.text.slice(0,35)}`, color: p.color,
          });
          CANVAS.addConn(pNode.id, tNode.id, t.direction);
        });
    });
    // Active needs as gap nodes
    RELATIONAL_STATE.needs.filter(n => !n.met).forEach(n => {
      const needNode = CANVAS.spawnNode('gap', undefined, undefined, {
        title: n.text, tags: ['NEED', 'RELATIONAL'],
      });
      CANVAS.addConn(hub.id, needNode.id, 'needs');
    });
    mm_toast('Relational field → canvas', 'export');
  }, 200);
}

async function relationalAISurface() {
  if (!AI?.enabled || !AI?.apiKey) {
    mm_toast('Enable AI in settings first', 'warn'); return;
  }
  const moments = RELATIONAL_STATE.moments.slice(-20);
  if (moments.length < 3) {
    mm_toast('Log a few moments first — patterns need data', 'info'); return;
  }
  mm_toast('Surfacing patterns…', 'loading');
  const context = moments.map(m => {
    const p = RELATIONAL_STATE.people.find(x => x.id === m.personId);
    const ql = _qualityLabel(m.quality);
    return `[${p ? p.name : 'self'}|${ql.label}] ${m.text}`;
  }).join('\n');

  try {
    const prompt = `You're looking at a person's relational moment log. Surface 2-3 patterns — not categories, not diagnoses. What's actually moving? What keeps appearing? What's the shape of this person's relational life right now?\n\nMoments:\n${context}\n\nReturn a JSON array of pattern strings. Each one should be one honest sentence about what you notice. No bullet points, no headers.`;
    const text = await aiCall(prompt) || '';
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const patterns = JSON.parse(match[0]);
      patterns.forEach(p => {
        if (typeof p === 'string' && p.trim()) {
          RELATIONAL_STATE.patterns.push({
            id: uuid(), text: p.trim(), personId: null,
            timestamp: Date.now(), source: 'ai',
          });
        }
      });
      relationalSave();
      mm_toast(`${patterns.length} pattern${patterns.length !== 1 ? 's' : ''} surfaced`, 'success');
      const overlay = document.getElementById('mm-relational-overlay');
      if (overlay) _renderRelationalUI(overlay);
    } else {
      mm_toast('Could not parse patterns — try again', 'error');
    }
  } catch(e) {
    mm_toast('AI error: ' + e.message, 'error');
  }
}

// ── Utility ───────────────────────────────────────────────────────
function _relTimeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(ts).toLocaleDateString();
}


/* ═══════════════════════════════════════════════════════════════════
   MIRROR MODULE — v1.0.0
   
   "I needed the mastermind because notion wasn't enough."
   
   This is not a profile page.
   It's a living map of how you process reality —
   built from your own architecture, legible to yourself,
   cross-linked to every other module.
   
   The document you gave me is the seed.
   The mirror is what lets you consult it, update it,
   and use it to navigate when you're drowning.
   
   Architecture: flat, fast, searchable. No hierarchy for the sake of
   hierarchy. Sections that map to how you actually think, not to
   someone else's taxonomy.
   
   Sections:
   - SIGNATURE SYSTEMS  — your named cognitive tools
   - COGNITIVE MODES    — how you process in different states
   - FEEDBACK LOOPS     — Ni/Ne and the named loops you've built
   - PROCESSING STYLE   — how your mind moves
   - WARNINGS           — prediction engines, failure modes
   - SELF-WORK          — integration, council, shadow
   - ACTIVE NOW         — what's live, what's in play today
   
   Everything can be spawned to canvas. Everything is searchable.
   AI can read the mirror to calibrate how it talks to you.
═══════════════════════════════════════════════════════════════════ */

// ── Mirror state ──────────────────────────────────────────────────
const MIRROR_STATE = {
  _loaded: false,
  activeSection: 'signature',

  // User-maintained systems — can add, edit, annotate
  // Each is: { id, name, desc, tags[], notes, active, pinned, canvasNodeId, ts }
  systems: [],

  // Named cognitive modes — states James moves through
  modes: [],

  // Active loops — what's running right now
  activeLoops: [],
  // { id, name, type:'reinforcing'|'balancing'|'open', desc, started, ts }

  // Warnings — prediction engines and failure modes in play
  warnings: [],
  // { id, text, active, ts }

  // Self-work log — council, shadow, integration observations
  selfWork: [],
  // { id, text, type:'council'|'shadow'|'integration'|'observation', ts }

  // Active Now — what is live today
  activeNow: {
    nervousSystemNote: '',
    dominantFunction: 'Ni',
    processingMode: '',   // e.g. "spiral", "chessmatch", "pattern-engineer"
    openLoopCount: 0,
    note: '',
    ts: null,
  },

  // Search query
  _search: '',
};

const MIRROR_KEY = 'mm_mirror_state';

// ── Seed data — James's actual systems from the document ──────────
// Pre-loaded on first open. User can edit, delete, add.
const MIRROR_SEED_SYSTEMS = [
  // Meta-frameworks
  { name: 'Engineers Approach', tags: ['meta','subconscious'],
    desc: 'Always optimizing, fixing, improving. Sees bottlenecks from obsession with efficiency. Gaps from fear of uncertainty. Almost entirely subconscious.',
    section: 'signature' },
  { name: 'Meta Compression Framework', tags: ['meta','synthesis'],
    desc: 'High-level metasystem for filtering, prioritizing, and synthesizing all inputs from mental, emotional, relational, and creative domains. Compresses complexity into actionable, high-impact insights while optimizing energy allocation.',
    section: 'signature' },
  { name: 'End-State First Reasoning', tags: ['planning','simulation'],
    desc: 'Start from the end-state and work backwards. Reverse causal cognition. See where things land before deciding where to step.',
    section: 'signature' },
  { name: 'Non-linear Horizon Planning', tags: ['planning'],
    desc: 'Plan by orientation, not timelines. Watch for patterns, openings, and constraints instead of fixed outcomes. State boundaries, act in good faith, release expectation. Let the next shape emerge through interaction rather than force.',
    section: 'signature' },
  { name: 'The Six Eyes', tags: ['meta','perception'],
    desc: 'The mind\'s perception engine. A radar for seeing all. Tool for curiosity and exploring. Maps constellations not threat detection. Can perceive patterns, waves, signal, entropy — but doesn\'t always see things clearly. (Crystal ball.)',
    section: 'signature' },
  { name: 'Meaning-Making Web + Mesh Network', tags: ['meta','uncertainty'],
    desc: 'Inherent web-based system for meaning combined with a mesh for handling uncertainty and ambiguity. Running simulations/scenarios without attaching. More fluidity. Less anxiety, more presence.',
    section: 'signature' },
  { name: 'Dense Network of Significance', tags: ['motivation','meaning'],
    desc: 'Motivation engine. Pile on meaning using the meaning-making engine. Reframe using CBT, Self-sovereignty, dialectic thinking, pattern recognition. Stack meaning across domains. Any failure is data. Pain is teacher.',
    section: 'signature' },
  { name: 'Relational Oscillation Theory', tags: ['relational'],
    desc: 'Relationships oscillate. Pendulum swing. A point of alternating entropy, instability or misattunement. The relational field is entropy. The signal is the radar dish. The pendulum is the oscillation.',
    section: 'signature' },
  { name: 'Sandbox OS', tags: ['variables','filtering'],
    desc: 'New variables run through a filter — weather, regulation, risk. Strongest/healthiest → good box. Least sturdy → bad box. Both copy to meta box for stress-testing and domain synthesis. Keeps contamination contained.',
    section: 'signature' },
  { name: 'Airlock Failsafe', tags: ['variables','survival'],
    desc: 'When survival mode activates, the sandbox routes through the airlock to prevent contamination from the main system.',
    section: 'signature' },
  { name: 'Multidirectional Zooming', tags: ['analysis'],
    desc: 'Take a variable or pattern. Zoom all the way in, then zoom out one level at a time. Map and fill blanks with research or highest-resolution probable assumption.',
    section: 'signature' },
  { name: 'Incremental Variable Engine', tags: ['analysis'],
    desc: 'Think about a pattern or variable — what\'s 1% more? 1% less? Increase in larger and larger increments. Find the leverage zones.',
    section: 'signature' },
  { name: 'Meaning-Making Variable Engine', tags: ['synthesis'],
    desc: 'Harvests every variable from all methods. Cross-analyzes and synthesizes across domains to generate insight and direction.',
    section: 'signature' },
  // Emotional systems
  { name: 'IV Bag', tags: ['emotional'],
    desc: 'Letting emotion back in slowly, dripping like an IV bag. Visualize emotions like a drip — controlled, measured, not flooded.',
    section: 'emotional' },
  { name: 'Channeling', tags: ['emotional','flow'],
    desc: 'A flow state where ideas and patterns move through you, not from you. Acting as conduit. Synthesizing and filtering raw inputs from experience, observation, and intuition into usable concepts.',
    section: 'emotional' },
  { name: 'Alchemizing', tags: ['emotional','innovation'],
    desc: 'Transforming raw ideas, contradictions, or chaos into refined, actionable innovation. Blends patterns, experiments, and feedback. Converts uncertainty into insight. Conceptual lead into conceptual gold.',
    section: 'emotional' },
  { name: 'Emotional Signal Filtering', tags: ['emotional'],
    desc: 'Distinguish between emotional input and informational input even when they arrive together. Challenge: prevent emotional noise from masquerading as new data.',
    section: 'emotional' },
  { name: 'Tension Harvesting', tags: ['emotional','analysis'],
    desc: 'Extract insight from discomfort instead of fleeing it. Emotional charge is signal, not noise. Anger reveals violated expectations. Grief reveals attachment depth. Confusion reveals hidden assumptions.',
    section: 'emotional' },
  { name: 'Radio Knob', tags: ['regulation'],
    desc: 'Adjusting the intensity of somatic, sensory, or emotional input like turning a volume dial. Manages focus, clarity, and overwhelm.',
    section: 'emotional' },
  // Processing
  { name: 'Constraint-Driven Creativity', tags: ['creativity','innovation'],
    desc: 'Best ideas come from pressure. Bottlenecks, limits, friction, emotional tension. Given this constraint, what still moves? Engineering thinking applied to meaning.',
    section: 'processing' },
  { name: 'Coherence-or-Collapse Gate', tags: ['filtering'],
    desc: 'Do not tolerate half-formed ideas. They must either stabilize into a coherent structure or be abandoned. Protects from building on weak foundations.',
    section: 'processing' },
  { name: 'Meaning-First Evaluation', tags: ['filtering'],
    desc: 'Don\'t ask "does this work?" first. Ask: "is this true, coherent, alive?" Utility comes second. Low semantic density = low integrity. System rejects lossy compression.',
    section: 'processing' },
  { name: 'Delayed Synthesis', tags: ['processing'],
    desc: 'Don\'t learn in real time. Buffer. Information passes through somatic, emotional, symbolic subsystems before it clicks. Insight arrives the next day, mid-shower, walking. Not slowness — quality control. Waiting for convergence.',
    section: 'processing' },
  { name: 'Symbolic Compression', tags: ['processing','memory'],
    desc: 'Convert large, messy data into images, metaphors, constellations. Not poetic garnish — bandwidth management. Symbols are high-density storage. Meaning arrives as a felt shape before words show up.',
    section: 'processing' },
  { name: 'Bidirectional Inversion', tags: ['reasoning'],
    desc: 'Simultaneously flips patterns or assumptions inside out and traces them both forward and backward across contexts. Explores hidden variables, detects false premises, stress-tests outcomes.',
    section: 'reasoning' },
  { name: 'Bayesian Reasoning', tags: ['reasoning','epistemic'],
    desc: 'Treat beliefs as probabilities, never as identities. New evidence adjusts confidence rather than flips certainty. Practice Bayesian unlearning — lower confidence when outcomes don\'t match predictions.',
    section: 'reasoning' },
  { name: 'Root Cause Tracing', tags: ['reasoning'],
    desc: 'Track cause and effect backward until hitting the deepest stable root. Not just "what happened" — what made it inevitable. First conditions, hidden assumptions, emotional triggers, system constraints.',
    section: 'reasoning' },
  // Self-work
  { name: 'The Council Method', tags: ['self-work','IFS'],
    desc: 'Used parts of IFS to find parts broken off after trauma. Found them in locked boxes, compartmentalized. Freed them. Smashed the compartments. Assembled a council. Made cards, names, symbols, roles. Integrated. All have voice and respect.',
    section: 'self-work' },
  { name: 'Shadow Integration', tags: ['self-work'],
    desc: 'Stopped looking at shadow as enemy — more a part that needed to be seen and held. Accept him. Don\'t fear him. Don\'t use the failsafe anymore. Integrating.',
    section: 'self-work' },
  { name: 'Inner Sanctuary Construction', tags: ['self-work'],
    desc: 'Building a refuge inside — self-love, patience, boundaries, forgiveness, protection of inner child. Long-term architecture project, not a mood. When finished it becomes a home that cannot be taken.',
    section: 'self-work' },
  { name: 'Pain-as-Teacher Model', tags: ['self-work'],
    desc: 'Mine suffering for information instead of merely enduring it. Treat darkness as signal, not just noise.',
    section: 'self-work' },
];

const MIRROR_SEED_MODES = [
  { name: 'Pattern-Engineer Mode', color: '#11ddcc',
    desc: 'Take emotional experience and convert it into systems. Don\'t just feel dynamics — model them. Systems thinking: finding hidden variables, imagining equations, checking for symmetry. Treat relationships like complex ecosystems.' },
  { name: 'Spiral Thinking', color: '#cc44ff',
    desc: 'Primary mode. Orbit ideas instead of marching from premise to conclusion. Revisit from new angles. Build constellations. Cross-domain synthesis: attachment theory meets thermodynamics meets philosophy meets lived experience.' },
  { name: 'Chessboard Mind', color: '#ffe04a',
    desc: 'Strategic cognition. Forecast multiple moves ahead. Track power dynamics, motives, likely outcomes. When stressed, this mode takes over because it promises control. Anticipatory modeling.' },
  { name: 'Intensity-Metric Mind', color: '#ff8c22',
    desc: 'Quantify feelings: temperature, entropy, momentum, oscillation. Measure what most people only vaguely gesture at. Not running from emotion — trying to understand its mechanics so it doesn\'t run you.' },
  { name: 'Narrative Mind', color: '#ff66aa',
    desc: 'Think in stories about identity. Self-construction. Humans build meaning through myth, and you\'re aware you\'re doing it. Writing the story of "the one who refuses the default path."' },
  { name: 'Emotional Mind', color: '#ff3355',
    desc: 'The one that just hurts, loves, fears, responds. Sometimes distant, sometimes overwhelming. When feelings get too intense, mind retreats into modeling modes. Not broken — prefers control through understanding over raw surrender.' },
  { name: 'Philosopher-Skeptic Mind', color: '#7744ff',
    desc: 'Question norms. Masculinity scripts, stoicism distortions, expectations. Interrogate assumptions, poke at cultural nonsense, inspect language. Self-examination without sentimentality.' },
  { name: 'INFJ Flow State (Ni→Fe→Ti→Se)', color: '#00c8ff',
    desc: 'Intuition and empathy dominant. Insight and connection flow naturally. Logic supports understanding. Sensory input enriches awareness.' },
  { name: 'INFJ Chessmatch (Ni→Ti Loop)', color: '#00ff88',
    desc: 'Internal vision and analysis dominant. Ideas refine and strategize. Emotional awareness may retreat. Sensory engagement diminishes. Maximum precision, minimum presence.' },
];

const MIRROR_SEED_WARNINGS = [
  'Prediction engines running — may be manufacturing certainty from fear, not data.',
  'Rumination loop active — repetition is not evidence.',
  'Emotional time travel — living in past pain or future catastrophe instead of now.',
  'Identity fusion — prediction has become self-definition. Losing flexibility.',
  'Coherence-or-collapse gate offline — building on weak foundations.',
  'Hyper-responsibility schema activated — carrying what isn\'t yours.',
  'Emotional over-analysis loop — trying to solve a wound like a puzzle.',
  'Chessmatch mode dominant — stress has activated control mode.',
];

// ── Seed on first load ────────────────────────────────────────────
function _mirrorSeedIfEmpty() {
  if (MIRROR_STATE.systems.length > 0) return;
  MIRROR_SEED_SYSTEMS.forEach(s => {
    MIRROR_STATE.systems.push({
      id: uuid(), name: s.name, desc: s.desc,
      tags: s.tags || [], section: s.section || 'signature',
      notes: '', active: false, pinned: false, ts: Date.now(),
    });
  });
  MIRROR_SEED_MODES.forEach(m => {
    MIRROR_STATE.modes.push({
      id: uuid(), name: m.name, color: m.color,
      desc: m.desc, active: false, ts: Date.now(),
    });
  });
  mirrorSave();
}

function mirrorLoad() {
  // SECURITY FIX: this read localStorage['mm_mirror_state'] — cognitive
  // architecture, modes, warnings, self-work — and could clobber
  // correctly-decrypted vault state with a stale plaintext copy, only
  // firing the first time the module opened in a session, i.e. AFTER
  // vaultDeserialize() (mastermind-vault.js, modules.mirror) had
  // already restored the real thing. Vault-only now; see _ORPHAN_KEYS
  // for recovering any pre-fix copy.
  MIRROR_STATE._loaded = true;
  _mirrorSeedIfEmpty();
}

function mirrorSave() {
  // SECURITY FIX: this used to ALSO write localStorage['mm_mirror_state']
  // in plaintext, in parallel with the vault, on every change — self-work
  // and cognitive-architecture notes sitting unencrypted on disk
  // regardless of whether vault encryption was on. The vault is the
  // only store now (modules.mirror already covers it in full).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

// ── Open / close ──────────────────────────────────────────────────
function openMirror() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'mirror' });
  if (!MIRROR_STATE._loaded) mirrorLoad();

  let overlay = document.getElementById('mm-mirror-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-mirror-overlay';
    overlay.style.cssText = [
      'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800',
      'background:rgba(1,2,8,.98);backdrop-filter:blur(8px)',
      'display:flex;flex-direction:column;overflow:hidden',
    ].join(';');
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderMirror(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.5, window.innerHeight * 0.3, 1.0);
}

function closeMirror() {
  const el = document.getElementById('mm-mirror-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
  mirrorSave();
}

// ── Render ────────────────────────────────────────────────────────
function _renderMirror(overlay) {
  overlay.innerHTML = '';
  const ACCENT = '#d4a820'; // gold — different from every other module

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = [
    'display:flex;align-items:center;gap:14px;padding:11px 22px',
    'border-bottom:1px solid rgba(212,168,32,.2)',
    'background:rgba(212,168,32,.03);flex-shrink:0',
  ].join(';');
  hdr.innerHTML = `
    <span style="font-size:20px;filter:drop-shadow(0 0 12px #d4a820)">◎</span>
    <div style="flex:1">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:6px;color:#d4a820">MIRROR</div>
      <div style="font-family:var(--f-mono);font-size:7px;
        color:rgba(212,168,32,.45);letter-spacing:2px;margin-top:1px">
        YOUR COGNITIVE ARCHITECTURE · LIVE · SEARCHABLE · CROSS-LINKED
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <input id="mirror-search" placeholder="Search systems, modes, tags…" style="
        font-family:var(--f-mono);font-size:8px;padding:6px 12px;
        background:rgba(0,0,0,.6);border:1px solid rgba(212,168,32,.2);
        color:var(--bright);outline:none;width:220px"
        onfocus="this.style.borderColor='rgba(212,168,32,.5)'"
        onblur="this.style.borderColor='rgba(212,168,32,.2)'"
        oninput="mirrorSearch(this.value)"
        value="${escH(MIRROR_STATE._search || '')}"/>
      <button onclick="mirrorExportCanvas()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid rgba(212,168,32,.3);color:#d4a820;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(212,168,32,.1)'"
        onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      <button onclick="mirrorAIRead()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid rgba(204,68,255,.3);color:#cc44ff;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(204,68,255,.1)'"
        onmouseleave="this.style.background='transparent'">✦ AI REFLECT</button>
      <button onclick="closeMirror();goHome()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,255,255,.04)'"
        onmouseleave="this.style.background='transparent'">⌂ HOME</button>
    </div>
  `;
  overlay.appendChild(hdr);

  // Active Now bar — always visible, minimal
  const activeBar = _buildActiveNowBar();
  overlay.appendChild(activeBar);

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex:1;overflow:hidden';
  overlay.appendChild(body);

  // Section nav
  const nav = _buildMirrorNav();
  body.appendChild(nav);

  // Main content
  const main = document.createElement('div');
  main.id = 'mirror-main';
  main.style.cssText = 'flex:1;overflow-y:auto;padding:22px 28px;';
  body.appendChild(main);

  _renderMirrorSection(main);

  // Auto-focus search if query active
  if (MIRROR_STATE._search) {
    setTimeout(() => document.getElementById('mirror-search')?.focus(), 50);
  }
}

// ── Active Now bar ─────────────────────────────────────────────────
function _buildActiveNowBar() {
  const an = MIRROR_STATE.activeNow;
  const cfn = COGNITIVE_FUNCTIONS[an.dominantFunction];
  const bar = document.createElement('div');
  bar.style.cssText = [
    'display:flex;align-items:center;gap:16px;padding:7px 22px',
    'border-bottom:1px solid rgba(212,168,32,.1)',
    'background:rgba(0,0,0,.4);flex-shrink:0',
  ].join(';');

  bar.innerHTML = `
    <span style="font-family:var(--f-mono);font-size:7px;color:rgba(212,168,32,.5);
      letter-spacing:2px;flex-shrink:0">ACTIVE NOW</span>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">function</span>
      <select id="mirror-active-fn" onchange="mirrorSetActiveFn(this.value)" style="
        background:rgba(0,0,0,.6);border:1px solid rgba(212,168,32,.2);
        color:${cfn ? cfn.color : '#d4a820'};padding:3px 7px;
        font-family:var(--f-mono);font-size:7.5px">
        ${Object.entries(COGNITIVE_FUNCTIONS).map(([k,f]) =>
          `<option value="${k}" ${k === an.dominantFunction ? 'selected' : ''} style="color:${f.color}">${k}</option>`
        ).join('')}
      </select>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">mode</span>
      <select id="mirror-active-mode" onchange="mirrorSetActiveMode(this.value)" style="
        background:rgba(0,0,0,.6);border:1px solid rgba(212,168,32,.2);
        color:var(--muted);padding:3px 7px;font-family:var(--f-mono);font-size:7.5px">
        <option value="">—</option>
        ${MIRROR_STATE.modes.map(m =>
          `<option value="${m.id}" ${m.active ? 'selected' : ''}>${m.name}</option>`
        ).join('')}
      </select>
    </div>
    <div style="flex:1">
      <input id="mirror-active-note" placeholder="What's happening right now? What's in play?" style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:8px;
        color:var(--bright);background:transparent;border:none;
        border-bottom:1px solid rgba(212,168,32,.15);padding:2px 0;outline:none"
        value="${escH(an.note || '')}"
        onblur="mirrorSaveActiveNote(this.value)"
        onfocus="this.style.borderBottomColor='rgba(212,168,32,.5)'"
        onblur2="this.style.borderBottomColor='rgba(212,168,32,.15)'"/>
    </div>
    ${MIRROR_STATE.warnings.filter(w => w.active).length ? `
      <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
        <span style="color:#ff3355;font-size:11px">⚠</span>
        <span style="font-family:var(--f-mono);font-size:7px;color:#ff3355">
          ${MIRROR_STATE.warnings.filter(w => w.active).length} warning${MIRROR_STATE.warnings.filter(w=>w.active).length>1?'s':''}
        </span>
      </div>` : ''}
    <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim);flex-shrink:0">
      ${an.ts ? _mirrorTimeAgo(an.ts) : 'not set'}
    </span>
  `;
  return bar;
}

// ── Section nav ───────────────────────────────────────────────────
function _buildMirrorNav() {
  const SECTIONS = [
    { id: 'active',     label: 'ACTIVE NOW',     icon: '◉', color: '#d4a820' },
    { id: 'signature',  label: 'SIGNATURE',      icon: '◈', color: '#d4a820' },
    { id: 'modes',      label: 'MODES',          icon: '∿', color: '#11ddcc' },
    { id: 'emotional',  label: 'EMOTIONAL',      icon: '♥', color: '#ff66aa' },
    { id: 'processing', label: 'PROCESSING',     icon: '→', color: '#cc44ff' },
    { id: 'reasoning',  label: 'REASONING',      icon: '◆', color: '#00c8ff' },
    { id: 'self-work',  label: 'SELF-WORK',      icon: '◎', color: '#00ff88' },
    { id: 'warnings',   label: 'WARNINGS',       icon: '⚠', color: '#ff3355' },
    { id: 'loops',      label: 'ACTIVE LOOPS',   icon: '↺', color: '#ff8c22' },
    { id: 'add',        label: 'ADD SYSTEM',     icon: '+', color: 'var(--dim)' },
  ];

  const nav = document.createElement('div');
  nav.style.cssText = [
    'width:180px;flex-shrink:0;border-right:1px solid rgba(212,168,32,.12)',
    'padding:10px 0;overflow-y:auto',
  ].join(';');

  SECTIONS.forEach(sec => {
    const isActive = MIRROR_STATE.activeSection === sec.id;
    const count = _mirrorSectionCount(sec.id);

    const btn = document.createElement('div');
    btn.style.cssText = [
      'padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px',
      `border-left:3px solid ${isActive ? sec.color : 'transparent'}`,
      `background:${isActive ? sec.color.replace(')', ',.08)').replace('#', 'rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/, (_,r,g,b) => `${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)}`) : 'transparent'}`,
      'transition:all .12s',
    ].join(';');

    btn.innerHTML = `
      <span style="font-size:11px;color:${isActive ? sec.color : 'var(--dim)'};flex-shrink:0">${sec.icon}</span>
      <span style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;
        color:${isActive ? sec.color : 'var(--dim)'};flex:1">${sec.label}</span>
      ${count ? `<span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2)">${count}</span>` : ''}
    `;
    btn.addEventListener('click', () => {
      MIRROR_STATE.activeSection = sec.id;
      const overlay = document.getElementById('mm-mirror-overlay');
      if (overlay) _renderMirror(overlay);
    });
    btn.addEventListener('mouseenter', () => { if (!isActive) { btn.style.background = 'rgba(255,255,255,.03)'; btn.style.borderLeftColor = sec.color + '44'; } });
    btn.addEventListener('mouseleave', () => { if (!isActive) { btn.style.background = 'transparent'; btn.style.borderLeftColor = 'transparent'; } });
    nav.appendChild(btn);
  });

  return nav;
}

function _mirrorSectionCount(id) {
  if (id === 'warnings') return MIRROR_STATE.warnings.filter(w => w.active).length || '';
  if (id === 'loops') return MIRROR_STATE.activeLoops.length || '';
  if (id === 'self-work') return MIRROR_STATE.selfWork.length || '';
  const systems = MIRROR_STATE.systems.filter(s => s.section === id);
  return systems.length || '';
}

// ── Section renderer ───────────────────────────────────────────────
function _renderMirrorSection(main) {
  main.innerHTML = '';
  const query = MIRROR_STATE._search?.toLowerCase() || '';

  switch (MIRROR_STATE.activeSection) {
    case 'active':    _mirrorActiveSection(main); break;
    case 'modes':     _mirrorModesSection(main); break;
    case 'warnings':  _mirrorWarningsSection(main); break;
    case 'loops':     _mirrorLoopsSection(main); break;
    case 'self-work': _mirrorSelfWorkSection(main); break;
    case 'add':       _mirrorAddSection(main); break;
    default:
      _mirrorSystemsSection(main, MIRROR_STATE.activeSection, query);
  }
}

// ── Systems section (signature / emotional / processing / reasoning) ──
function _mirrorSystemsSection(main, section, query) {
  const sectionMeta = {
    signature:  { label: 'SIGNATURE SYSTEMS',  color: '#d4a820', desc: 'Your named cognitive tools. Built from your own architecture.' },
    emotional:  { label: 'EMOTIONAL SYSTEMS',  color: '#ff66aa', desc: 'How you process and move through emotion.' },
    processing: { label: 'PROCESSING STYLE',   color: '#cc44ff', desc: 'How your mind moves through complexity.' },
    reasoning:  { label: 'REASONING TOOLS',    color: '#00c8ff', desc: 'How you test what\'s true.' },
  };
  const meta = sectionMeta[section] || { label: section.toUpperCase(), color: '#d4a820', desc: '' };

  let systems = MIRROR_STATE.systems.filter(s => s.section === section || (section === 'signature' && !s.section));

  if (query) {
    systems = MIRROR_STATE.systems.filter(s => {
      const hay = [s.name, s.desc, s.notes, ...(s.tags||[])].join(' ').toLowerCase();
      return hay.includes(query);
    });
  }

  // Pinned first
  const pinned = systems.filter(s => s.pinned);
  const rest = systems.filter(s => !s.pinned);

  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:${meta.color};margin-bottom:4px">${meta.label}</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">${meta.desc}</div>
    </div>
  `;

  if (!systems.length) {
    main.innerHTML += `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
      padding:20px 0">${query ? 'No matches for "' + escH(query) + '"' : 'No systems yet.'}</div>`;
    return;
  }

  const renderSystems = (list) => list.map(s => {
    const isActive = s.active;
    return `
      <div id="mirror-sys-${s.id}" style="
        padding:13px 16px;margin-bottom:8px;
        border:1px solid ${isActive ? meta.color + '55' : 'rgba(255,255,255,.06)'};
        background:${isActive ? meta.color.replace('#','rgba(').replace(/([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/,(_, r,g,b)=>`${parseInt(r,16)},${parseInt(g,16)},${parseInt(b,16)}`) + ',.06)' : 'rgba(0,0,0,.3)'};
        border-left:3px solid ${s.pinned ? meta.color : isActive ? meta.color + '88' : 'transparent'};
        transition:all .15s">
        <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:6px">
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
              <span style="font-family:var(--f-display);font-size:10px;font-weight:700;
                letter-spacing:1.5px;color:${isActive ? meta.color : 'var(--bright)'}">${escH(s.name)}</span>
              ${(s.tags||[]).map(t => `<span style="font-family:var(--f-mono);font-size:6.5px;
                color:${meta.color};border:1px solid ${meta.color}33;padding:1px 5px">${t}</span>`).join('')}
              ${isActive ? `<span style="font-family:var(--f-mono);font-size:6.5px;
                color:${meta.color};border:1px solid ${meta.color};padding:1px 5px">ACTIVE</span>` : ''}
            </div>
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              line-height:1.7">${escH(s.desc)}</div>
            ${s.notes ? `<div style="font-family:var(--f-mono);font-size:7.5px;
              color:var(--dim);margin-top:6px;border-top:1px solid rgba(255,255,255,.05);
              padding-top:6px;font-style:italic">${escH(s.notes)}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
            <button onclick="mirrorToggleActive('${s.id}')" style="
              padding:3px 8px;border:1px solid ${isActive ? meta.color+'66' : 'rgba(255,255,255,.08)'};
              color:${isActive ? meta.color : 'var(--wire2)'};background:transparent;
              cursor:pointer;font-family:var(--f-mono);font-size:7px"
              title="${isActive ? 'Deactivate' : 'Mark as active now'}"
              onmouseenter="this.style.borderColor='${meta.color}88'"
              onmouseleave="this.style.borderColor='${isActive ? meta.color+'66' : 'rgba(255,255,255,.08)'}'">
              ${isActive ? '● ON' : '○ OFF'}</button>
            <button onclick="mirrorSystemToCanvas('${s.id}')" style="
              padding:3px 8px;border:1px solid rgba(255,255,255,.06);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7px"
              onmouseenter="this.style.color='var(--c)'"
              onmouseleave="this.style.color='var(--dim)'">→</button>
            <button onclick="mirrorTogglePin('${s.id}')" style="
              padding:3px 8px;border:none;background:none;cursor:pointer;
              color:${s.pinned ? meta.color : 'var(--wire2)'};font-size:10px"
              title="${s.pinned ? 'Unpin' : 'Pin'}"
              onmouseenter="this.style.color='${meta.color}'"
              onmouseleave="this.style.color='${s.pinned ? meta.color : 'var(--wire2)'}'">◆</button>
          </div>
        </div>
        <div>
          <input placeholder="Add note…" value="${escH(s.notes || '')}"
            onblur="mirrorSaveNote('${s.id}',this.value)" style="
            width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:7.5px;
            color:var(--dim);background:transparent;border:none;
            border-bottom:1px solid rgba(255,255,255,.06);padding:3px 0;outline:none"
            onfocus="this.style.borderBottomColor='${meta.color}44'"
            onblur2="this.style.borderBottomColor='rgba(255,255,255,.06)'"/>
        </div>
      </div>
    `;
  }).join('');

  if (pinned.length) {
    main.innerHTML += `<div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;
      color:${meta.color};margin-bottom:10px">◆ PINNED</div>`;
    main.innerHTML += renderSystems(pinned);
    main.innerHTML += `<div style="height:1px;background:rgba(255,255,255,.04);
      margin:14px 0 12px"></div>`;
  }
  main.innerHTML += renderSystems(rest);
}

// ── Modes section ─────────────────────────────────────────────────
function _mirrorModesSection(main) {
  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:#11ddcc;margin-bottom:4px">COGNITIVE MODES</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        States you move through. Mark what\'s active. One click to reflect on.
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:9px">
      ${MIRROR_STATE.modes.map(m => `
        <div style="padding:13px 16px;
          border:1px solid ${m.active ? m.color+'55' : 'rgba(255,255,255,.06)'};
          background:${m.active ? m.color.replace('#d4','rgba(212,') + ',.05)' : 'rgba(0,0,0,.3)'};
          border-left:3px solid ${m.active ? m.color : 'transparent'};
          transition:all .15s">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
            <div style="width:10px;height:10px;border-radius:50%;
              background:${m.active ? m.color : 'transparent'};
              border:2px solid ${m.color};flex-shrink:0;
              box-shadow:${m.active ? '0 0 8px ' + m.color : 'none'}"></div>
            <span style="font-family:var(--f-display);font-size:10px;font-weight:700;
              letter-spacing:1.5px;color:${m.active ? m.color : 'var(--bright)'}">
              ${escH(m.name)}</span>
            <span style="margin-left:auto;font-family:var(--f-mono);font-size:7.5px;
              color:${m.active ? m.color : 'var(--dim)'}">${m.active ? '● ACTIVE' : '○'}</span>
          </div>
          <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
            line-height:1.7;margin-bottom:8px">${escH(m.desc)}</div>
          <div style="display:flex;gap:7px">
            <button onclick="mirrorToggleMode('${m.id}')" style="
              padding:5px 12px;border:1px solid ${m.color}44;
              color:${m.color};background:${m.active ? m.color+'12' : 'transparent'};
              cursor:pointer;font-family:var(--f-mono);font-size:7.5px"
              onmouseenter="this.style.background='${m.color}18'"
              onmouseleave="this.style.background='${m.active ? m.color+'12' : 'transparent'}'">
              ${m.active ? '● DEACTIVATE' : '○ ACTIVATE'}</button>
            <button onclick="mirrorModeToCanvas('${m.id}')" style="
              padding:5px 10px;border:1px solid rgba(255,255,255,.06);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7.5px"
              onmouseenter="this.style.color='var(--c)'"
              onmouseleave="this.style.color='var(--dim)'">→ CANVAS</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Warnings section ──────────────────────────────────────────────
function _mirrorWarningsSection(main) {
  // First-time seed warnings if empty
  if (!MIRROR_STATE.warnings.length) {
    MIRROR_SEED_WARNINGS.forEach(w => {
      MIRROR_STATE.warnings.push({ id: uuid(), text: w, active: false, ts: Date.now() });
    });
    mirrorSave();
  }

  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:#ff3355;margin-bottom:4px">WARNINGS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        Prediction engines and failure modes. Mark what\'s currently active.
        Awareness is the counter-strategy.
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
      <input id="mirror-warning-input" placeholder="Add a warning you\'re noticing right now…" style="
        flex:1;font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
        background:rgba(0,0,0,.5);border:1px solid rgba(255,51,85,.2);
        padding:8px 12px;outline:none"
        onfocus="this.style.borderColor='rgba(255,51,85,.5)'"
        onblur="this.style.borderColor='rgba(255,51,85,.2)'"
        onkeydown="if(event.key==='Enter')mirrorAddWarning()"/>
      <button onclick="mirrorAddWarning()" style="
        padding:8px 16px;border:1px solid rgba(255,51,85,.35);
        color:#ff3355;background:transparent;cursor:pointer;
        font-family:var(--f-mono);font-size:8px"
        onmouseenter="this.style.background='rgba(255,51,85,.08)'"
        onmouseleave="this.style.background='transparent'">+ ADD</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px">
      ${MIRROR_STATE.warnings.map(w => `
        <div style="padding:10px 14px;
          border:1px solid ${w.active ? 'rgba(255,51,85,.5)' : 'rgba(255,255,255,.05)'};
          background:${w.active ? 'rgba(255,51,85,.06)' : 'rgba(0,0,0,.3)'};
          border-left:3px solid ${w.active ? '#ff3355' : 'transparent'};
          display:flex;align-items:center;gap:10px">
          <div style="width:8px;height:8px;border-radius:50%;flex-shrink:0;
            background:${w.active ? '#ff3355' : 'transparent'};
            border:2px solid ${w.active ? '#ff3355' : 'rgba(255,51,85,.3)'}"></div>
          <span style="font-family:var(--f-mono);font-size:8.5px;flex:1;
            color:${w.active ? 'var(--bright)' : 'var(--muted)'};line-height:1.6">
            ${escH(w.text)}</span>
          <button onclick="mirrorToggleWarning('${w.id}')" style="
            padding:3px 9px;border:1px solid ${w.active ? '#ff335555' : 'rgba(255,255,255,.06)'};
            color:${w.active ? '#ff3355' : 'var(--wire2)'};background:transparent;
            cursor:pointer;font-family:var(--f-mono);font-size:7px;flex-shrink:0">
            ${w.active ? '● ON' : '○'}</button>
          <button onclick="mirrorDeleteWarning('${w.id}')" style="
            background:none;border:none;cursor:pointer;color:var(--wire2);font-size:12px"
            onmouseenter="this.style.color='var(--r)'"
            onmouseleave="this.style.color='var(--wire2)'">×</button>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Active Loops section ──────────────────────────────────────────
function _mirrorLoopsSection(main) {
  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:#ff8c22;margin-bottom:4px">ACTIVE LOOPS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        What feedback loops are running right now?
        Reinforcing: amplifying. Balancing: stabilizing. Open: unresolved.
      </div>
    </div>
    <div style="display:flex;gap:7px;margin-bottom:14px">
      <input id="mirror-loop-name" placeholder="Loop name…" style="
        flex:2;font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
        background:rgba(0,0,0,.5);border:1px solid rgba(255,140,34,.2);
        padding:7px 10px;outline:none"/>
      <select id="mirror-loop-type" style="
        flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(255,140,34,.2);
        color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
        <option value="open">Open / Unresolved</option>
        <option value="reinforcing">Reinforcing ⊕</option>
        <option value="balancing">Balancing ⊝</option>
      </select>
      <button onclick="mirrorAddLoop()" style="
        padding:7px 16px;border:1px solid rgba(255,140,34,.35);
        color:#ff8c22;background:transparent;cursor:pointer;
        font-family:var(--f-mono);font-size:8px"
        onmouseenter="this.style.background='rgba(255,140,34,.08)'"
        onmouseleave="this.style.background='transparent'">+ ADD</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px" id="mirror-loops-list">
      ${MIRROR_STATE.activeLoops.map(loop => {
        const tc = {reinforcing:'#ff8c22',balancing:'#00ff88',open:'#00c8ff'}[loop.type];
        const icon = {reinforcing:'⊕',balancing:'⊝',open:'○'}[loop.type];
        return `
          <div style="padding:12px 16px;background:rgba(0,0,0,.35);
            border-left:3px solid ${tc};border:1px solid ${tc}28;border-left:3px solid ${tc}">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px">
              <span style="font-size:14px;color:${tc}">${icon}</span>
              <span style="font-family:var(--f-display);font-size:10px;font-weight:700;
                color:${tc}">${escH(loop.name)}</span>
              <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">
                ${_mirrorTimeAgo(loop.ts)}</span>
              <button onclick="mirrorLoopToCanvas('${loop.id}')" style="
                margin-left:auto;padding:3px 8px;border:1px solid ${tc}44;
                color:${tc};background:transparent;cursor:pointer;
                font-family:var(--f-mono);font-size:7px">→ CANVAS</button>
              <button onclick="mirrorDeleteLoop('${loop.id}')" style="
                background:none;border:none;cursor:pointer;color:var(--wire2);font-size:12px"
                onmouseenter="this.style.color='var(--r)'"
                onmouseleave="this.style.color='var(--wire2)'">×</button>
            </div>
            ${loop.desc ? `<div style="font-family:var(--f-mono);font-size:8px;
              color:var(--muted);line-height:1.6">${escH(loop.desc)}</div>` : ''}
          </div>`;
      }).join('')}
      ${!MIRROR_STATE.activeLoops.length ? `<div style="font-family:var(--f-mono);
        font-size:8px;color:var(--dim);padding:16px 0;line-height:2">
        No active loops.<br>
        <span style="color:var(--wire2)">What\'s amplifying right now?
        What\'s trying to stabilize? What\'s unresolved?</span>
      </div>` : ''}
    </div>
  `;
}

// ── Self-Work section ─────────────────────────────────────────────
function _mirrorSelfWorkSection(main) {
  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:4px">SELF-WORK</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        Council, shadow, integration. What\'s been processed. What\'s still moving.
      </div>
    </div>
    <div style="display:flex;gap:7px;margin-bottom:14px">
      <textarea id="mirror-sw-input" placeholder="What are you noticing?
Council: what part is speaking?
Shadow: what came up?
Integration: what landed?" style="
        flex:1;height:60px;resize:none;font-family:var(--f-mono);font-size:8.5px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(0,255,136,.2);padding:8px 10px;outline:none;line-height:1.6"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${['council','shadow','integration','observation'].map(t => `
          <button onclick="mirrorAddSelfWork('${t}')" style="
            padding:5px 10px;border:1px solid rgba(0,255,136,.25);
            color:#00ff88;background:transparent;cursor:pointer;
            font-family:var(--f-mono);font-size:7px"
            onmouseenter="this.style.background='rgba(0,255,136,.08)'"
            onmouseleave="this.style.background='transparent'">${t}</button>
        `).join('')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px">
      ${[...MIRROR_STATE.selfWork].reverse().slice(0,20).map(sw => {
        const tc = {council:'#00c8ff',shadow:'#cc44ff',integration:'#00ff88',observation:'#d4a820'}[sw.type]||'#00ff88';
        return `
          <div style="padding:10px 14px;background:rgba(0,0,0,.3);
            border-left:2px solid ${tc};display:flex;gap:10px;align-items:flex-start">
            <span style="font-family:var(--f-mono);font-size:7px;color:${tc};
              border:1px solid ${tc}33;padding:1px 6px;flex-shrink:0">${sw.type}</span>
            <span style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);
              flex:1;line-height:1.6">${escH(sw.text)}</span>
            <span style="font-family:var(--f-mono);font-size:7px;
              color:var(--wire2);flex-shrink:0">${_mirrorTimeAgo(sw.ts)}</span>
          </div>`;
      }).join('')}
      ${!MIRROR_STATE.selfWork.length ? `<div style="font-family:var(--f-mono);
        font-size:8px;color:var(--dim);padding:16px 0">Nothing logged yet.</div>` : ''}
    </div>
  `;
}

// ── Active section ────────────────────────────────────────────────
function _mirrorActiveSection(main) {
  const activeSystems = MIRROR_STATE.systems.filter(s => s.active);
  const activeModes = MIRROR_STATE.modes.filter(m => m.active);
  const activeWarnings = MIRROR_STATE.warnings.filter(w => w.active);
  const fn = COGNITIVE_FUNCTIONS[MIRROR_STATE.activeNow.dominantFunction];

  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:#d4a820;margin-bottom:4px">ACTIVE NOW</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        Your current cognitive configuration. What\'s live. What\'s running.
      </div>
    </div>

    ${fn ? `
    <div style="padding:16px;background:${fn.color}0a;border:1px solid ${fn.color}33;margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-family:var(--f-display);font-size:20px;font-weight:900;
          color:${fn.color}">${MIRROR_STATE.activeNow.dominantFunction}</span>
        <div>
          <div style="font-family:var(--f-display);font-size:9px;
            color:${fn.color};letter-spacing:1px">${fn.label}</div>
          <div style="font-family:var(--f-mono);font-size:7.5px;
            color:var(--muted)">${fn.desc}</div>
        </div>
      </div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        font-style:italic">"${fn.trainPrompt}"</div>
    </div>` : ''}

    ${activeSystems.length ? `
    <div style="margin-bottom:16px">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#d4a820;margin-bottom:8px">ACTIVE SYSTEMS (${activeSystems.length})</div>
      ${activeSystems.map(s => `
        <div style="padding:8px 12px;background:rgba(0,0,0,.3);
          border-left:2px solid #d4a820;margin-bottom:5px;
          display:flex;align-items:flex-start;gap:9px">
          <span style="font-family:var(--f-display);font-size:9px;font-weight:700;
            color:#d4a820;flex:1">${escH(s.name)}</span>
          <button onclick="mirrorToggleActive('${s.id}')" style="
            background:none;border:none;cursor:pointer;color:#d4a820;
            font-family:var(--f-mono);font-size:7px">deactivate</button>
        </div>`).join('')}
    </div>` : ''}

    ${activeModes.length ? `
    <div style="margin-bottom:16px">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#11ddcc;margin-bottom:8px">ACTIVE MODES (${activeModes.length})</div>
      ${activeModes.map(m => `
        <div style="padding:8px 12px;border-left:2px solid ${m.color};
          margin-bottom:5px;display:flex;align-items:center;gap:9px">
          <div style="width:7px;height:7px;border-radius:50%;
            background:${m.color};flex-shrink:0"></div>
          <span style="font-family:var(--f-display);font-size:9px;font-weight:700;
            color:${m.color};flex:1">${escH(m.name)}</span>
          <button onclick="mirrorToggleMode('${m.id}')" style="
            background:none;border:none;cursor:pointer;color:${m.color};
            font-family:var(--f-mono);font-size:7px">deactivate</button>
        </div>`).join('')}
    </div>` : ''}

    ${activeWarnings.length ? `
    <div style="padding:14px;background:rgba(255,51,85,.05);
      border:1px solid rgba(255,51,85,.2);margin-bottom:16px">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#ff3355;margin-bottom:8px">⚠ ACTIVE WARNINGS (${activeWarnings.length})</div>
      ${activeWarnings.map(w => `
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
          padding:4px 0;border-bottom:1px solid rgba(255,51,85,.1)">
          ${escH(w.text)}</div>`).join('')}
    </div>` : ''}

    ${MIRROR_STATE.activeNow.note ? `
    <div style="padding:14px;background:rgba(212,168,32,.04);
      border-left:3px solid rgba(212,168,32,.3)">
      <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:1.5px;
        color:rgba(212,168,32,.5);margin-bottom:5px">NOTE</div>
      <div style="font-family:var(--f-mono);font-size:9px;color:var(--bright);
        line-height:1.7">${escH(MIRROR_STATE.activeNow.note)}</div>
    </div>` : ''}

    ${!activeSystems.length && !activeModes.length && !activeWarnings.length ? `
    <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
      padding:20px 0;line-height:2">
      Nothing marked active yet.<br>
      <span style="color:var(--wire2)">Go to SIGNATURE, MODES, or WARNINGS and mark
      what\'s running right now.</span>
    </div>` : ''}
  `;
}

// ── Add System section ────────────────────────────────────────────
function _mirrorAddSection(main) {
  main.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:4px;color:#d4a820;margin-bottom:4px">ADD SYSTEM</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        Name and describe a cognitive tool, pattern, or system you use.
        It doesn\'t have to be fully formed yet.
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;max-width:600px">
      <input id="mirror-add-name" placeholder="Name of the system or tool…" style="
        font-family:var(--f-mono);font-size:9px;color:var(--bright);
        background:rgba(0,0,0,.5);border:1px solid rgba(212,168,32,.25);
        padding:9px 12px;outline:none;width:100%;box-sizing:border-box"
        onfocus="this.style.borderColor='rgba(212,168,32,.6)'"
        onblur="this.style.borderColor='rgba(212,168,32,.25)'"/>
      <textarea id="mirror-add-desc" placeholder="Describe what it does. How you use it. When it activates. What it produces." style="
        height:90px;resize:none;font-family:var(--f-mono);font-size:8.5px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(212,168,32,.2);padding:9px 12px;
        outline:none;line-height:1.7;width:100%;box-sizing:border-box"
        onfocus="this.style.borderColor='rgba(212,168,32,.5)'"
        onblur="this.style.borderColor='rgba(212,168,32,.2)'"></textarea>
      <div style="display:flex;gap:9px">
        <select id="mirror-add-section" style="
          flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(212,168,32,.2);
          color:var(--muted);padding:8px;font-family:var(--f-mono);font-size:8px">
          <option value="signature">Signature</option>
          <option value="emotional">Emotional</option>
          <option value="processing">Processing</option>
          <option value="reasoning">Reasoning</option>
        </select>
        <input id="mirror-add-tags" placeholder="tags (comma-separated)" style="
          flex:2;font-family:var(--f-mono);font-size:8px;color:var(--muted);
          background:rgba(0,0,0,.5);border:1px solid rgba(212,168,32,.15);
          padding:8px 10px;outline:none"/>
      </div>
      <button onclick="mirrorAddSystem()" style="
        padding:10px;border:1px solid rgba(212,168,32,.4);
        color:#d4a820;background:rgba(212,168,32,.06);cursor:pointer;
        font-family:var(--f-mono);font-size:9px;letter-spacing:1.5px"
        onmouseenter="this.style.background='rgba(212,168,32,.14)'"
        onmouseleave="this.style.background='rgba(212,168,32,.06)'">◎ ADD TO MIRROR</button>
    </div>
  `;
}

// ── Action handlers ───────────────────────────────────────────────
function mirrorSearch(q) {
  MIRROR_STATE._search = q;
  if (q) MIRROR_STATE.activeSection = 'signature'; // show all results in signature view
  const main = document.getElementById('mirror-main');
  if (main) _renderMirrorSection(main);
}

function mirrorSetActiveFn(key) {
  MIRROR_STATE.activeNow.dominantFunction = key;
  MIRROR_STATE.activeNow.ts = Date.now();
  mirrorSave();
}

function mirrorSetActiveMode(modeId) {
  MIRROR_STATE.modes.forEach(m => m.active = false);
  if (modeId) {
    const m = MIRROR_STATE.modes.find(x => x.id === modeId);
    if (m) m.active = true;
  }
  MIRROR_STATE.activeNow.ts = Date.now();
  mirrorSave();
}

function mirrorSaveActiveNote(val) {
  MIRROR_STATE.activeNow.note = val;
  MIRROR_STATE.activeNow.ts = Date.now();
  mirrorSave();
}

function mirrorToggleActive(id) {
  const s = MIRROR_STATE.systems.find(x => x.id === id);
  if (s) { s.active = !s.active; mirrorSave(); }
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorTogglePin(id) {
  const s = MIRROR_STATE.systems.find(x => x.id === id);
  if (s) { s.pinned = !s.pinned; mirrorSave(); }
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorSaveNote(id, val) {
  const s = MIRROR_STATE.systems.find(x => x.id === id);
  if (s) { s.notes = val; mirrorSave(); }
}

function mirrorToggleMode(id) {
  const m = MIRROR_STATE.modes.find(x => x.id === id);
  if (m) { m.active = !m.active; mirrorSave(); }
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorToggleWarning(id) {
  const w = MIRROR_STATE.warnings.find(x => x.id === id);
  if (w) { w.active = !w.active; mirrorSave(); }
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorDeleteWarning(id) {
  MIRROR_STATE.warnings = MIRROR_STATE.warnings.filter(x => x.id !== id);
  mirrorSave();
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorAddWarning() {
  const text = document.getElementById('mirror-warning-input')?.value?.trim();
  if (!text) return;
  MIRROR_STATE.warnings.push({ id: uuid(), text, active: true, ts: Date.now() });
  mirrorSave();
  document.getElementById('mirror-warning-input').value = '';
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorAddLoop() {
  const name = document.getElementById('mirror-loop-name')?.value?.trim();
  if (!name) { mm_toast('Name the loop', 'warn'); return; }
  const type = document.getElementById('mirror-loop-type')?.value || 'open';
  MIRROR_STATE.activeLoops.push({ id: uuid(), name, type, desc: '', ts: Date.now() });
  mirrorSave();
  document.getElementById('mirror-loop-name').value = '';
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorDeleteLoop(id) {
  MIRROR_STATE.activeLoops = MIRROR_STATE.activeLoops.filter(x => x.id !== id);
  mirrorSave();
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorAddSelfWork(type) {
  const text = document.getElementById('mirror-sw-input')?.value?.trim();
  if (!text) { mm_toast('Write something first', 'warn'); return; }
  MIRROR_STATE.selfWork.push({ id: uuid(), text, type, ts: Date.now() });
  mirrorSave();
  document.getElementById('mirror-sw-input').value = '';
  mm_toast(type + ' logged', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

function mirrorAddSystem() {
  const name = document.getElementById('mirror-add-name')?.value?.trim();
  if (!name) { mm_toast('Name required', 'warn'); return; }
  const desc    = document.getElementById('mirror-add-desc')?.value?.trim() || '';
  const section = document.getElementById('mirror-add-section')?.value || 'signature';
  const tagsRaw = document.getElementById('mirror-add-tags')?.value || '';
  const tags    = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
  MIRROR_STATE.systems.push({
    id: uuid(), name, desc, section, tags,
    notes: '', active: false, pinned: false, ts: Date.now(),
  });
  mirrorSave();
  mm_toast('System added to mirror', 'success', { dur: 1500 });
  MIRROR_STATE.activeSection = section;
  const overlay = document.getElementById('mm-mirror-overlay');
  if (overlay) _renderMirror(overlay);
}

// ── Canvas export ─────────────────────────────────────────────────
function mirrorSystemToCanvas(id) {
  const s = MIRROR_STATE.systems.find(x => x.id === id);
  if (!s) return;
  CANVAS.spawnNode('heuristic', undefined, undefined, {
    title: s.name, body: s.desc,
    tags: ['MIRROR', 'SYSTEM', ...(s.tags||[]).map(t => t.toUpperCase())],
    color: '#d4a820',
  });
  mm_toast(s.name + ' → canvas', 'export', { dur: 1300 });
}

function mirrorModeToCanvas(id) {
  const m = MIRROR_STATE.modes.find(x => x.id === id);
  if (!m) return;
  CANVAS.spawnNode('pattern', undefined, undefined, {
    title: m.name, body: m.desc,
    color: m.color, tags: ['MODE', 'MIRROR'],
  });
  mm_toast(m.name + ' → canvas', 'export', { dur: 1300 });
}

function mirrorLoopToCanvas(id) {
  const loop = MIRROR_STATE.activeLoops.find(x => x.id === id);
  if (!loop) return;
  const typeMap = { reinforcing: 'feedback', balancing: 'friction', open: 'gap' };
  const col = { reinforcing: '#ff8c22', balancing: '#00ff88', open: '#00c8ff' }[loop.type];
  CANVAS.spawnNode(typeMap[loop.type] || 'causal', undefined, undefined, {
    title: loop.name, color: col,
    tags: ['LOOP', loop.type.toUpperCase(), 'MIRROR'],
  });
  mm_toast(loop.name + ' → canvas', 'export', { dur: 1300 });
}

function mirrorExportCanvas() {
  const active = MIRROR_STATE.systems.filter(s => s.active);
  const modes  = MIRROR_STATE.modes.filter(m => m.active);
  const warns  = MIRROR_STATE.warnings.filter(w => w.active);
  if (!active.length && !modes.length && !warns.length) {
    mm_toast('Mark some systems/modes active first', 'info'); return;
  }
  closeMirror();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const hub = CANVAS.spawnNode('synthesis', undefined, undefined, {
      title: 'CURRENT COGNITIVE STATE', color: '#d4a820',
      tags: ['MIRROR', 'SNAPSHOT', new Date().toLocaleDateString()],
    });
    const fn = COGNITIVE_FUNCTIONS[MIRROR_STATE.activeNow.dominantFunction];
    if (fn && hub) {
      const fnNode = CANVAS.spawnNode('concept', undefined, undefined, {
        title: MIRROR_STATE.activeNow.dominantFunction + ' — ' + fn.label,
        color: fn.color, tags: ['FUNCTION', 'ACTIVE'],
      });
      if (fnNode) CANVAS.addConn(hub.id, fnNode.id, 'dominant function');
    }
    active.forEach(s => {
      const n = CANVAS.spawnNode('heuristic', undefined, undefined, {
        title: s.name, color: '#d4a820', tags: ['SYSTEM', 'ACTIVE'],
      });
      if (n && hub) CANVAS.addConn(hub.id, n.id, 'active system');
    });
    modes.forEach(m => {
      const n = CANVAS.spawnNode('pattern', undefined, undefined, {
        title: m.name, color: m.color, tags: ['MODE', 'ACTIVE'],
      });
      if (n && hub) CANVAS.addConn(hub.id, n.id, 'active mode');
    });
    warns.forEach(w => {
      const n = CANVAS.spawnNode('friction', undefined, undefined, {
        title: w.text.slice(0,60), color: '#ff3355', tags: ['WARNING', 'ACTIVE'],
      });
      if (n && hub) CANVAS.addConn(hub.id, n.id, 'warning');
    });
    mm_toast('Mirror snapshot → canvas', 'export');
  }, 200);
}

// ── AI Reflect — reads mirror, returns honest observation ─────────
async function mirrorAIRead() {
  if (!AI?.enabled || !AI?.apiKey) {
    mm_toast('Enable AI in settings first', 'warn'); return;
  }
  mm_toast('Reading your mirror…', 'loading');

  const activeSystems = MIRROR_STATE.systems.filter(s => s.active).map(s => s.name).join(', ') || 'none';
  const activeModes   = MIRROR_STATE.modes.filter(m => m.active).map(m => m.name).join(', ') || 'none';
  const activeWarnings= MIRROR_STATE.warnings.filter(w => w.active).map(w => w.text).join('\n') || 'none';
  const activeNote    = MIRROR_STATE.activeNow.note || 'none';
  const dominantFn    = MIRROR_STATE.activeNow.dominantFunction;
  const recentSW      = MIRROR_STATE.selfWork.slice(-3).map(s => `[${s.type}] ${s.text}`).join('\n') || 'none';
  const activeLoops   = MIRROR_STATE.activeLoops.map(l => `${l.type}: ${l.name}`).join('\n') || 'none';

  const context = [
    `Dominant cognitive function: ${dominantFn}`,
    `Active systems: ${activeSystems}`,
    `Active modes: ${activeModes}`,
    `Active warnings: ${activeWarnings}`,
    `Current note: ${activeNote}`,
    `Recent self-work: ${recentSW}`,
    `Active feedback loops: ${activeLoops}`,
  ].join('\n');

  try {
    const prompt = `You are reading someone's cognitive mirror — a live map of their active mental state. Be honest. Not cheerful. Not therapeutic. Read the configuration and reflect what you actually observe.\n\nCurrent configuration:\n${context}\n\nIn 3-5 sentences: What do you notice? What might they not be seeing? What's the tension in this configuration? Don't give advice unless asked.`;
    const text = await aiCall(prompt) || '';
    if (!text) { mm_toast('No reflection returned', 'warn'); return; }

    // Show reflection as a toast + spawn to void seeds
    mm_toast(text.slice(0, 120) + (text.length > 120 ? '…' : ''), 'info', { dur: 8000 });
    VOID_STATE.seeds.push({
      id: uuid(), text: 'AI REFLECTION: ' + text,
      created: Date.now(), ai: true, source: 'mirror',
    });
    saveVoidState();
    mm_toast('Full reflection → Void seeds', 'success', { dur: 2000 });
  } catch(e) {
    mm_toast('AI error: ' + e.message, 'error');
  }
}

// ── Utilities ─────────────────────────────────────────────────────
function _mirrorTimeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d/60000) + 'm ago';
  if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
  if (d < 604800000) return Math.floor(d/86400000) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

console.log('[MASTERMIND] Mirror module loaded — cognitive architecture live');

/* ═══════════════════════════════════════════════════════════════════
   VOICE LATTICE + COMPREHENSION ENGINE — v2.0
   
   "Every voice note. Every update. Every shift.
    Timestamped, compared, visualized.
    The empirical proof of progress for a mind that only believes
    what it can see."
   
   Architecture:
   - Capture: text/voice input → nodes on the lattice
   - Comprehend: intent detection → route to the right system  
   - Track: delta logging → growth timeline
   - Library: heuristics store → pattern-fire detection
   - Connect: every node tagged → linked to canvas/modules
   
   Tabs: CAPTURE · LATTICE · HEURISTICS · GROWTH · COHERENCE
═══════════════════════════════════════════════════════════════════ */

// ── VCE Intent Patterns ───────────────────────────────────────────
const VCE_PATTERNS = {
  philosophy_update: ['i believe', 'my philosophy', "i'm updating", 'differently now', 'i think about', 'my view on'],
  value_update:      ['my values', 'what matters', 'i care about', 'non-negotiable', 'i stand by', 'matters to me'],
  framework_mutation:['adding to', 'updating the', 'new phase', 'new maxim', 'framework needs', 'i realized', 'new version'],
  identity_update:   ['i am becoming', 'who i am', "i'm learning", "i don't do that", "i've changed", 'i used to be', 'i no longer'],
  horizon_progress:  ['i did', 'i completed', 'i finished', 'i made progress', 'milestone', 'moved forward', 'got it done'],
  shadow_observation:['i noticed i', 'i caught myself', 'pattern i keep', 'shadow work', 'keep doing this', 'again i'],
  growth_marker:     ['i used to', "i don't do that anymore", 'months ago', "i've changed", 'different now', 'i grew'],
  epistemic_claim:   ['i believe', 'evidence', 'confident', 'contradicts', 'because of', 'i think x%', 'probability'],
  emotional_data:    ['i feel', "i'm feeling", 'body feels', 'somatic', 'in my chest', 'tension in', 'my body'],
  heuristic_fire:    ['that pattern', 'classic', 'there it is', 'this is the', 'heuristic', 'rule of thumb'],
  capture:           [], // fallback
};

// ── VL / VCE State ────────────────────────────────────────────────
const VL_STATE = {
  _loaded: false,
  activeTab: 'capture',

  // Lattice nodes — what was captured
  nodes: [],
  // { id, content, tags[], intent, routedTo, ts, domain, processed }

  // Heuristics library
  heuristics: [],
  // { id, name, desc, triggerPhrases[], domain, fireCount, lastFired, ts }

  // Growth log — before/after deltas
  growthLog: [],
  // { id, domain, before, after, magnitude, ts }

  // Philosophy / value / framework deltas
  philosophyLog:  [],
  valueLog:       [],
  frameworkDeltas:[],
  shadowLog:      [],
  emotionalLog:   [],

  // Coherence alerts
  coherenceAlerts:[],
  // { id, type:'contradiction'|'alignment', message, relatedIds[], ts }

  // Word bank for lattice visualization
  wordBank: {},

  // Session history — one entry per capture session (CaptureBridge
  // begin/endSession), summarizing which nodes it produced. This is
  // the browsable "what did I say in session X" record. Full node
  // content lives here because this is inside VL_STATE, which is
  // vault-encrypted (voiceLattice, mastermind-vault.js) — it is NOT
  // duplicated into the audit ledger, which is plaintext-by-design
  // (see vault-ledger.js's own "must not carry vault content" rule).
  // The ledger gets a matching session.end entry with counts only —
  // proof a session happened and wasn't quietly deleted, never what
  // was said in it.
  sessionHistory: [],
  // { id, kind, startedAt, endedAt, nodeIds[], nodeCount, tagSummary:{tag:count} }

  // Search
  _search: '',
};

const VL_STATE_KEY = 'mm_vl_state_v2';

// ── Intent detection ──────────────────────────────────────────────
function vceDetectIntent(content) {
  const lower = content.toLowerCase();
  const scores = {};
  for (const [intent, patterns] of Object.entries(VCE_PATTERNS)) {
    if (!patterns.length) continue;
    scores[intent] = patterns.filter(p => lower.includes(p)).length;
  }

  // Check heuristic fires
  const hFires = VL_STATE.heuristics.filter(h =>
    h.triggerPhrases.some(tp => lower.includes(tp.toLowerCase())) ||
    lower.includes(h.name.toLowerCase())
  );
  if (hFires.length) {
    scores.heuristic_fire = (scores.heuristic_fire || 0) + hFires.length * 2;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] < 1) return { intent: 'capture', heuristics: hFires };
  return { intent: best[0], heuristics: hFires, score: best[1] };
}

// ── Route based on intent ─────────────────────────────────────────
function vceRoute(intent, node) {
  const routed = [];

  switch (intent) {
    case 'philosophy_update':
      VL_STATE.philosophyLog.push({ id: uuid(), content: node.content, ts: node.ts, domain: node.domain });
      routed.push('Philosophy Log');
      break;
    case 'value_update':
      VL_STATE.valueLog.push({ id: uuid(), content: node.content, ts: node.ts });
      routed.push('Value Log');
      break;
    case 'growth_marker':
      VL_STATE.growthLog.push({
        id: uuid(), before: '', after: node.content,
        domain: node.domain || 'general', magnitude: 1, ts: node.ts,
      });
      routed.push('Growth Timeline');
      break;
    case 'shadow_observation':
      VL_STATE.shadowLog.push({ id: uuid(), content: node.content, ts: node.ts });
      routed.push('Shadow Log');
      // Cross-reference mirror self-work
      if (typeof MIRROR_STATE !== 'undefined') {
        MIRROR_STATE.selfWork.push({ id: uuid(), text: node.content, type: 'shadow', ts: node.ts });
        if (typeof mirrorSave === 'function') mirrorSave();
      }
      break;
    case 'emotional_data':
      VL_STATE.emotionalLog.push({ id: uuid(), content: node.content, ts: node.ts });
      routed.push('Emotional Log');
      break;
    case 'horizon_progress':
      routed.push('Horizon (check milestones)');
      mm_toast('Voice: possible milestone progress detected → check Horizon', 'sync', { dur: 4000 });
      break;
    case 'identity_update':
      if (typeof MIRROR_STATE !== 'undefined') {
        MIRROR_STATE.selfWork.push({ id: uuid(), text: node.content, type: 'integration', ts: node.ts });
        if (typeof mirrorSave === 'function') mirrorSave();
      }
      routed.push('Mirror (identity)');
      break;
    case 'heuristic_fire':
      routed.push('Heuristic fired');
      break;
  }

  // Auto-spawn to Void seeds if it's a creative idea
  if (['capture', 'philosophy_update', 'framework_mutation'].includes(intent)) {
    if (node.content.length > 15 && typeof VOID_STATE !== 'undefined') {
      VOID_STATE.seeds.push({ id: uuid(), text: node.content.slice(0, 100), created: node.ts });
      if (typeof saveVoidState === 'function') saveVoidState();
      routed.push('Void seeds');
    }
  }

  return routed;
}

// ── Add a node to the lattice ─────────────────────────────────────
function vlAddNode(content, domain) {
  if (!content?.trim()) return;
  const { intent, heuristics: firedH } = vceDetectIntent(content);

  // Fire matched heuristics
  firedH.forEach(h => {
    h.fireCount = (h.fireCount || 0) + 1;
    h.lastFired = Date.now();
    mm_toast(`Heuristic fired: ${h.name}`, 'sync', { dur: 2500 });
  });

  // Tag extraction
  const tags = _vlExtractTags(content);

  // Weak-assumption detection — ASSUMPTION goes FIRST in tags (wins the
  // lattice-canvas color) because it's the highest-signal find a node
  // can carry; the load-bearing question rides on the node for the UI
  // to surface, not just baked into a color.
  const assumption = _vlDetectAssumption(content);
  if (assumption) {
    tags.unshift('ASSUMPTION');
    if (assumption.confidence !== 'LOW') {
      mm_toast('⚡ Load-bearing assumption: ' + assumption.question, 'warn', { dur: 6000 });
    }
  }

  const node = {
    id: uuid(),
    content: content.trim(),
    tags,
    assumption: assumption || null,
    intent,
    domain: domain || _vlGuessDomain(tags),
    routedTo: [],
    ts: Date.now(),
    processed: false,
    // Which capture session this landed in, if any (typed/pasted nodes
    // outside an active orb/recall session get null — not every node
    // has to belong to one). Session history below is built from this.
    sessionId: (typeof CaptureBridge !== 'undefined' && CaptureBridge.stats().session)
      ? CaptureBridge.stats().session.id : null,
  };

  // Route
  node.routedTo = vceRoute(intent, node);
  node.processed = node.routedTo.length > 0;

  // ── Semantic auto-linking (lexicon.documentSimilarity) ────────────
  // The associative layer above (vleIngest) links on JACCARD word
  // OVERLAP — same words, literally. This links on the lexicon's PMI
  // vectors — same MEANING, learned from usage, so "vault" and
  // "encryption" can link without sharing a single literal word if
  // your own speech has put them in the same company before. This was
  // the exact gap flagged earlier: lexicon.neighbours() existed,
  // nothing called it into anything.
  //
  // Deliberately NOT scoped to the current session — same as the
  // Jaccard engine above it, a thought from three sessions ago is
  // exactly the kind of link this exists to surface. Capped at the
  // most recent 300 nodes for cost, not by session boundary.
  if (typeof MM_LEXICON !== 'undefined' && MM_LEXICON && VL_STATE.nodes.length > 1) {
    try {
      const candidates = VL_STATE.nodes.slice(0, 300); // most recent first, node just unshifted is index 0
      const semEdges = [];
      for (const other of candidates) {
        if (other.id === node.id) continue;
        const sim = MM_LEXICON.documentSimilarity(content, other.content || '');
        if (sim.confidence > 0 && sim.score >= 0.20) {
          semEdges.push({ to: other.id, score: sim.score, kind: 'semantic' });
        }
      }
      semEdges.sort((a, b) => b.score - a.score);
      if (semEdges.length) node.semanticEdges = semEdges.slice(0, 8);
    } catch (e) { MMLog?.warn('lattice', 'semantic auto-link failed: ' + e.message); }
  }

  VL_STATE.nodes.unshift(node);
  if (VL_STATE.nodes.length > 1000) VL_STATE.nodes.pop();

  // ── THE ASSOCIATIVE LAYER — what makes this an Associative Voice
  // Lattice rather than a capture box. Every thought captured here
  // flows through the VLE engines (modules/voice-lattice/engine.js):
  // Jaccard association edges to everything prior, trigram redundancy
  // ("you've circled this exact phrase before"), invariant themes, and
  // pattern memory via the bus hook. The association result rides on
  // the node so the UI can render its lattice neighborhood.
  if (typeof latticeIngest === 'function') {
    try { latticeIngest('voice.utterance', node.id, content, { tags: node.tags || [] }); }
    catch (e) { MMLog?.error('lattice', 'voice ingest: ' + e.message); }
  }
  if (typeof vleIngest === 'function') {
    try {
      const assoc = vleIngest(content);
      if (assoc) {
        node.assocEdges = assoc.edges.map(e => ({ to: e.b, score: e.score, words: e.words }));
        if (assoc.redundancy?.redundant) {
          node.redundant = true;
          mm_toast(`⟲ You've circled this before: "${assoc.redundancy.phrases[0]}"`, 'info', { dur: 3200 });
        }
      }
    } catch (e) { MMLog?.error('voice', 'associative layer failed on capture: ' + e.message); }
  }

  // Update word bank
  content.toLowerCase().split(/\W+/).filter(w => w.length > 3).forEach(w => {
    VL_STATE.wordBank[w] = (VL_STATE.wordBank[w] || 0) + 1;
  });

  vlSave();

  // Tell the always-on lattice canvas a node arrived. Without this, the
  // canvas only ever synced when the whole CAPTURE tab was re-rendered
  // (e.g. after a typed submit) — a spoken utterance recognized mid-
  // recording never told it anything changed.
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.lattice.node', { id: node.id });

  return node;
}

function _vlExtractTags(content) {
  const lower = content.toLowerCase();
  const tags = [];

  // Semantic-field classification (foundation/ai/pattern-detect.js) —
  // fires on the VOCABULARY of emotion/cognition/relationship/etc.,
  // not on someone having literally typed the category name. This is
  // the primary tag source now; the two checks below are additive.
  if (typeof MM_PATTERNS !== 'undefined') {
    try { tags.push(...MM_PATTERNS.classifySemanticFields(content)); }
    catch (e) { MMLog?.warn('lattice', 'semantic field classify failed: ' + e.message); }
  }

  // Literal domain/self-work words — kept as a fallback for MASTERMIND's
  // own vocabulary (SHADOW, GROWTH, HORIZON, SYSTEMS, IDENTITY aren't
  // semantic-field categories above, so this still adds real coverage).
  const domains = ['shadow','growth','horizon','systems','identity'];
  domains.forEach(d => { if (lower.includes(d)) tags.push(d.toUpperCase()); });

  const cogFns = ['ni', 'ne', 'ti', 'te', 'fi', 'fe', 'si', 'se'];
  cogFns.forEach(fn => { if (lower.includes(' ' + fn + ' ') || lower.includes(' ' + fn + ':')) tags.push(fn.toUpperCase()); });

  return [...new Set(tags)];
}

// Weak-assumption pattern detection (foundation/ai/pattern-detect.js).
// Separate from _vlExtractTags because it needs recent history (the
// "unnamed agent following a claim" axis) and returns more than a tag
// string — the load-bearing question is worth keeping on the node, not
// just a colored dot. Called from vlAddNode; ASSUMPTION is prepended to
// the node's tags when it fires, so it wins the lattice-canvas coloring
// (VL_TAG_COL ASSUMPTION is the brightest red in the set — deliberately,
// GapHunter's own taxonomy weights ASSUMPTION as the highest-criticality
// gap type there is).
function _vlDetectAssumption(content) {
  if (typeof MM_PATTERNS === 'undefined') return null;
  try {
    const history = (typeof VL_STATE !== 'undefined' ? VL_STATE.nodes : [])
      .slice(0, 4).map(n => n.content || '');
    return MM_PATTERNS.detectWeakAssumption(content, history);
  } catch (e) { MMLog?.warn('lattice', 'assumption detect failed: ' + e.message); return null; }
}

function _vlGuessDomain(tags) {
  if (tags.includes('emotional') || tags.includes('somatic')) return 'emotional';
  if (tags.includes('relational')) return 'relational';
  if (tags.includes('shadow') || tags.includes('growth')) return 'self-work';
  if (tags.includes('cognitive')) return 'cognitive';
  return 'general';
}

function vlLoad() {
  // Vault hydration (foundation/vault/mastermind-vault.js, voiceLattice)
  // already populated VL_STATE by the time this runs — vaultDeserialize()
  // is called before openVoiceLattice() ever reaches vlLoad(). This used
  // to ALSO read localStorage['mm_vl_state_v2'] and Object.assign it in,
  // which — worse than doing nothing — could CLOBBER the correctly
  // decrypted vault state with a stale plaintext copy. See vlSave() for
  // the write side of the same bug; the old key is recoverable via
  // Settings → Storage → Harvest, same as any other pre-vault orphan.
  VL_STATE._loaded = true;
  // Seed example heuristics if empty
  if (!VL_STATE.heuristics.length) _vlSeedHeuristics();
}

function _vlSeedHeuristics() {
  const seeds = [
    { name: 'Relational Oscillation', triggerPhrases: ['pendulum', 'oscillat', 'back and forth', 'that pattern again'],
      desc: 'Relationships oscillate. Identify the pendulum, the entropy, the attractor.', domain: 'relational' },
    { name: 'Coherence-or-Collapse Gate', triggerPhrases: ['half-formed', 'weak foundation', 'not holding', 'collapsing'],
      desc: 'Ideas must stabilize into coherent structure or be abandoned.', domain: 'cognitive' },
    { name: 'Tension Harvesting', triggerPhrases: ['tension', 'friction', 'discomfort', 'resistance', 'friction signal'],
      desc: 'Extract signal from discomfort. Tension is information.', domain: 'emotional' },
    { name: 'Delayed Synthesis', triggerPhrases: ['sleep on it', 'tomorrow', 'next day', 'shower thought', 'just clicked'],
      desc: 'Insight arrives after buffering. Trust the delay.', domain: 'cognitive' },
    { name: 'Prediction Engine Warning', triggerPhrases: ['i know how this ends', 'always happens', 'it\'s inevitable', 'no point'],
      desc: 'Prediction engines manufacture certainty from fear. Label, observe, test.', domain: 'shadow' },
    { name: 'Meaning-First Evaluation', triggerPhrases: ['does this feel right', 'is this true', 'feels hollow', 'low integrity'],
      desc: 'Ask: is this coherent and alive? Utility comes second.', domain: 'cognitive' },
    { name: 'Bidirectional Inversion', triggerPhrases: ['flip it', 'what if opposite', 'invert', 'reverse the assumption'],
      desc: 'Flip the pattern inside-out. Trace it forward and backward simultaneously.', domain: 'cognitive' },
    { name: 'Sandbox OS', triggerPhrases: ['filter this', 'run it through', 'stress test', 'good box bad box'],
      desc: 'New variables → filter → stress-test → synthesize.', domain: 'meta' },
  ];
  seeds.forEach(s => VL_STATE.heuristics.push({ id: uuid(), fireCount: 0, lastFired: null, ts: Date.now(), ...s }));
  vlSave();
}

function vlSave() {
  // SECURITY FIX: this used to ALSO write localStorage['mm_vl_state_v2']
  // in plaintext, in parallel with the vault, on every single node —
  // meaning the full text of everything spoken sat unencrypted on disk
  // the whole time regardless of whether vault encryption was on. The
  // vault is the only store now (voiceLattice in mastermind-vault.js's
  // serialize/deserialize already covers VL_STATE in full). See
  // _ORPHAN_KEYS in mastermind-vault.js for recovering any pre-fix copy.
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

// ── Open / close ──────────────────────────────────────────────────
function openVoiceLattice() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'voice-lattice' });
  if (!VL_STATE._loaded) vlLoad();

  let overlay = document.getElementById('mm-vl-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-vl-overlay';
    overlay.style.cssText = [
      'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800',
      'background:rgba(1,0,8,.98);backdrop-filter:blur(8px)',
      'display:flex;flex-direction:column;overflow:hidden',
    ].join(';');
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderVL(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.3, window.innerHeight * 0.6, 0.95);
}

function closeVoiceLattice() {
  const el = document.getElementById('mm-vl-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
  vlSave();
}

// ── Render ────────────────────────────────────────────────────────
function _renderVL(overlay) {
  overlay.innerHTML = '';
  const C = '#7744ff';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = [
    'display:flex;align-items:center;gap:14px;padding:11px 22px',
    'border-bottom:1px solid rgba(119,68,255,.2)',
    'background:rgba(119,68,255,.04);flex-shrink:0',
  ].join(';');

  const growthCount = VL_STATE.growthLog.length;
  const recentGrowth = VL_STATE.growthLog.filter(g => Date.now() - g.ts < 604800000).length;

  hdr.innerHTML = `
    <span style="font-size:20px;filter:drop-shadow(0 0 12px #7744ff)">◉</span>
    <div style="flex:1">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:5px;color:#7744ff">VOICE LATTICE</div>
      <div style="font-family:var(--f-mono);font-size:7px;
        color:rgba(119,68,255,.5);letter-spacing:2px;margin-top:1px">
        CAPTURE · COMPREHEND · ROUTE · TRACK · PROVE
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px">
      ${recentGrowth ? `<div style="font-family:var(--f-mono);font-size:7.5px;color:#00ff88;
        border:1px solid rgba(0,255,136,.3);padding:3px 9px">
        ↑ ${recentGrowth} growth marker${recentGrowth>1?'s':''} this week</div>` : ''}
      <button onclick="closeVoiceLattice();goHome()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,255,255,.04)'"
        onmouseleave="this.style.background='transparent'">⌂ HOME</button>
    </div>
  `;
  overlay.appendChild(hdr);

  // Tabs
  const TABS = [
    { id: 'capture',    label: 'CAPTURE',     icon: '◉' },
    { id: 'sessions',   label: 'SESSIONS',    icon: '▤' },
    { id: 'lattice',    label: 'LATTICE',      icon: '⬡' },
    { id: 'heuristics', label: 'HEURISTICS',   icon: '◆' },
    { id: 'growth',     label: 'GROWTH',       icon: '↑' },
    { id: 'coherence',  label: 'COHERENCE',    icon: '∿' },
  ];
  const tabBar = document.createElement('div');
  tabBar.style.cssText = [
    'display:flex;border-bottom:1px solid rgba(119,68,255,.12)',
    'background:rgba(0,0,0,.4);flex-shrink:0',
  ].join(';');
  TABS.forEach(tab => {
    const isActive = VL_STATE.activeTab === tab.id;
    const btn = document.createElement('button');
    btn.style.cssText = [
      'padding:9px 18px;cursor:pointer;white-space:nowrap',
      'font-family:var(--f-mono);font-size:7.5px;letter-spacing:1.5px',
      `border:none;border-bottom:2px solid ${isActive ? '#7744ff' : 'transparent'}`,
      `color:${isActive ? '#7744ff' : 'var(--dim)'}`,
      `background:${isActive ? 'rgba(119,68,255,.06)' : 'transparent'}`,
      'transition:all .15s',
    ].join(';');
    btn.textContent = tab.icon + ' ' + tab.label;
    btn.addEventListener('click', () => { VL_STATE.activeTab = tab.id; _renderVL(overlay); });
    btn.addEventListener('mouseenter', () => { if (!isActive) btn.style.color = 'var(--muted)'; });
    btn.addEventListener('mouseleave', () => { if (!isActive) btn.style.color = 'var(--dim)'; });
    tabBar.appendChild(btn);
  });
  overlay.appendChild(tabBar);

  // Content
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column';
  overlay.appendChild(content);

  switch (VL_STATE.activeTab) {
    case 'capture':    _vlTabCapture(content);    break;
    case 'sessions':   _vlTabSessions(content);   break;
    case 'lattice':    _vlTabLattice(content);    break;
    case 'heuristics': _vlTabHeuristics(content); break;
    case 'growth':     _vlTabGrowth(content);     break;
    case 'coherence':  _vlTabCoherence(content);  break;
  }

  // The lattice canvas only animates while it is on screen. A
  // requestAnimationFrame loop running behind a hidden tab is a battery
  // cost with no observer.
  if (typeof vlLatticeStop === 'function') vlLatticeStop();
  if (VL_STATE.activeTab === 'capture' && typeof vlLatticeInit === 'function') {
    requestAnimationFrame(() => vlLatticeInit());
  }
}

// ── TAB: Capture ──────────────────────────────────────────────────
function _vlTabCapture(container) {
  container.innerHTML = `
    <div style="flex:1;display:grid;grid-template-columns:300px 1fr 300px;overflow:hidden">

      <!-- ── LEFT: the capture surface ──────────────────────────────
           An orb, not a notepad. The 800px textarea that used to be here
           was the overwhelm this module exists to remove: a blank box
           that large asks you to COMPOSE, and composing is the load.
           Speaking has no blank page. Typing is still possible, in a
           two-line field, deliberately secondary. -->
      <div style="padding:20px 18px;display:flex;flex-direction:column;gap:14px;align-items:center;
        border-right:1px solid rgba(119,68,255,.1);overflow-y:auto">

        <div id="vl-orb-outer" onclick="vlOrbToggle()" title="Click to capture"
          style="position:relative;width:132px;height:132px;cursor:pointer;flex-shrink:0;margin-top:6px">
          <div class="vl-orb-ring" style="animation-delay:0s"></div>
          <div class="vl-orb-ring" style="animation-delay:.9s"></div>
          <div class="vl-orb-ring" style="animation-delay:1.8s"></div>
          <div id="vl-orb-core">
            <span id="vl-orb-icon">◉</span>
          </div>
        </div>

        <div id="vl-orb-label" style="font-family:var(--f-mono);font-size:7.5px;letter-spacing:2px;
          color:var(--dim);text-align:center">CLICK TO CAPTURE</div>

        <button id="vl-phone-btn" onclick="vlPhoneOpen()" title="Use your phone as a microphone">
          <span style="font-size:13px;line-height:1">✆</span>
          <span>PHONE</span>
        </button>
        <div id="vl-timer" style="font-family:var(--f-mono);font-size:15px;letter-spacing:3px;
          color:#7744ff;opacity:.35">00:00</div>

        <canvas id="vl-wave-cvs" width="260" height="42"
          style="width:100%;height:42px;opacity:.5"></canvas>

        <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center">
          ${(() => {
            // Short labels for the capture-mode buttons in the (260px-wide)
            // orb sidebar. Used to be `m.slice(0, 5).toUpperCase()` — a
            // blind character truncation that turned
            // 'externalizing'/'introspecting'/'processing' into the
            // unreadable "EXTER" / "INTRO" / "PROCE" fragments flagged in
            // review. Declared local to this function (not module-level)
            // deliberately — tests/run-lattice-ui.test.js renders
            // _vlTabCapture in isolation and any free variable it
            // references has to come from inside it or the sandbox.
            const LABELS = { externalizing: 'OUTPUT', introspecting: 'INWARD', processing: 'WORKING' };
            const HINTS  = {
              externalizing: 'getting it out, judgement suspended',
              introspecting: 'looking inward',
              processing:    'working a problem',
            };
            return ['externalizing','introspecting','processing'].map((m, i) =>
              `<button class="vl-mode-btn${i === 0 ? ' on' : ''}" data-mode="${m}"
                title="${m[0].toUpperCase() + m.slice(1)} — ${HINTS[m] || ''}"
                onclick="vlSetCaptureMode('${m}', this)">${LABELS[m] || m.toUpperCase()}</button>`).join('');
          })()}
        </div>

        <div style="width:100%;border-top:1px solid rgba(119,68,255,.1);padding-top:12px;margin-top:2px">
          <div style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:2px;color:var(--dim);margin-bottom:6px">
            OR TYPE · CTRL+ENTER
          </div>
          <textarea id="vl-capture-input" rows="2" placeholder="a thought, in your own words…" style="
            width:100%;resize:none;font-family:var(--f-mono);font-size:9px;color:var(--bright);
            background:rgba(0,0,0,.5);border:1px solid rgba(119,68,255,.2);
            padding:9px;line-height:1.7;outline:none"
            onkeydown="if(event.key==='Enter'&&event.ctrlKey)vlCaptureSubmit()"></textarea>
          <div style="display:flex;gap:6px;margin-top:7px">
            <select id="vl-domain" style="flex:1;background:rgba(0,0,0,.5);
              border:1px solid rgba(119,68,255,.2);color:var(--muted);padding:6px 8px;
              font-family:var(--f-mono);font-size:7.5px">
              <option value="">— domain (auto)</option>
              ${['cognitive','emotional','relational','creative','somatic','shadow','growth','systems','identity','meta'].map(d =>
                `<option value="${d}">${d}</option>`).join('')}
            </select>
            <button onclick="vlCaptureSubmit()" style="padding:6px 12px;
              border:1px solid rgba(119,68,255,.45);color:#7744ff;background:rgba(119,68,255,.08);
              cursor:pointer;font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px">ADD</button>
          </div>
          <div id="vl-intent-preview" style="font-family:var(--f-mono);font-size:7px;
            color:var(--dim);margin-top:6px;min-height:10px"></div>
        </div>

        <div id="vl-route-preview" style="display:none;width:100%;padding:9px 11px;
          background:rgba(119,68,255,.06);border:1px solid rgba(119,68,255,.18)">
          <div style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:1.5px;
            color:rgba(119,68,255,.6);margin-bottom:4px">DETECTED INTENT</div>
          <div id="vl-route-text" style="font-family:var(--f-mono);font-size:8px;color:#7744ff"></div>
        </div>
      </div>

      <!-- ── CENTRE: the lattice, always visible ────────────────────
           Not a destination you navigate to. It is what you are looking
           at while you speak, so a node appearing and connecting itself
           is the feedback, and no tab switch is required to see it. -->
      <div id="vl-lattice-wrap" style="position:relative;overflow:hidden;background:rgba(0,0,0,.25)">
        <canvas id="vl-lattice-cvs" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
        <div id="vl-lattice-hint" style="position:absolute;inset:0;display:flex;align-items:center;
          justify-content:center;pointer-events:none;font-family:var(--f-mono);font-size:8px;
          letter-spacing:2px;color:var(--dim);opacity:.5;text-align:center;line-height:2">
          ${VL_STATE.nodes.length ? '' : 'THE LATTICE IS EMPTY<br>SPEAK, AND IT FILLS'}
        </div>
        <div style="position:absolute;bottom:9px;left:11px;font-family:var(--f-mono);
          font-size:6.5px;letter-spacing:1.5px;color:var(--dim);opacity:.6">
          <span id="vl-lat-count">${VL_STATE.nodes.length}</span> NODES ·
          <span id="vl-lat-edges">0</span> EDGES
        </div>
      </div>

      <!-- ── RIGHT: recent, and the detail of what you just said ── -->
      <div style="overflow-y:auto;padding:16px 14px;border-left:1px solid rgba(119,68,255,.1)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:12px">RECENT (${VL_STATE.nodes.length})</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${VL_STATE.nodes.slice(0, 20).map(node => {
            const intentColors = {
              philosophy_update:'#00c8ff', value_update:'#ffe04a',
              framework_mutation:'#ff8c22', identity_update:'#ff66aa',
              growth_marker:'#00ff88', shadow_observation:'#cc44ff',
              emotional_data:'#ff3355', horizon_progress:'#11ddcc',
              heuristic_fire:'#d4a820', epistemic_claim:'#00c8ff',
              capture:'rgba(255,255,255,.3)',
            };
            const ic = intentColors[node.intent] || 'rgba(255,255,255,.3)';
            return `
              <div style="padding:9px 12px;background:rgba(0,0,0,.35);
                border-left:2px solid ${ic};">
                <div style="font-family:var(--f-mono);font-size:8px;color:var(--bright);
                  line-height:1.6;margin-bottom:4px">${escH(node.content.slice(0, 120))}${node.content.length > 120 ? '…' : ''}</div>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  ${node.intent !== 'capture' ? `<span style="font-family:var(--f-mono);font-size:6.5px;
                    color:${ic};border:1px solid ${ic}44;padding:1px 5px">
                    ${node.intent.replace(/_/g,' ')}</span>` : ''}
                  ${(node.tags||[]).slice(0,3).map(t => `<span style="font-family:var(--f-mono);
                    font-size:6.5px;color:var(--dim);border:1px solid rgba(255,255,255,.06);
                    padding:1px 5px">${t}</span>`).join('')}
                  ${node.routedTo?.length ? `<span style="font-family:var(--f-mono);font-size:6.5px;
                    color:var(--wire2)">→ ${node.routedTo.join(', ')}</span>` : ''}
                  <span style="margin-left:auto;font-family:var(--f-mono);font-size:6.5px;
                    color:var(--wire2)">${_vlTimeAgo(node.ts)}</span>
                </div>
              </div>`;
          }).join('')}
          ${!VL_STATE.nodes.length ? `<div style="font-family:var(--f-mono);font-size:8px;
            color:var(--dim);padding:16px 0">Nothing captured yet.</div>` : ''}
        </div>
      </div>
    </div>
  `;

  // Live intent detection as user types
  const ta = document.getElementById('vl-capture-input');
  const preview = document.getElementById('vl-route-preview');
  const routeText = document.getElementById('vl-route-text');
  if (ta) {
    ta.addEventListener('input', () => {
      const val = ta.value;
      if (val.length < 10) { preview.style.display = 'none'; return; }
      const { intent, heuristics: fh } = vceDetectIntent(val);
      if (intent !== 'capture') {
        preview.style.display = '';
        const intentLabel = intent.replace(/_/g, ' ').toUpperCase();
        const routes = _vlPreviewRoute(intent);
        routeText.innerHTML = `<span style="color:#7744ff">${intentLabel}</span>` +
          (routes.length ? ` → <span style="color:var(--dim)">${routes.join(', ')}</span>` : '') +
          (fh.length ? ` · <span style="color:#d4a820">heuristic: ${fh[0].name}</span>` : '');
      } else {
        preview.style.display = 'none';
      }
    });
  }
}

function _vlPreviewRoute(intent) {
  const map = {
    philosophy_update: ['Philosophy Log'],
    value_update: ['Value Log'],
    growth_marker: ['Growth Timeline'],
    shadow_observation: ['Shadow Log', 'Mirror'],
    emotional_data: ['Emotional Log'],
    horizon_progress: ['Horizon (check milestones)'],
    identity_update: ['Mirror (identity)'],
    framework_mutation: ['Framework Deltas', 'Void Seeds'],
    capture: ['Void Seeds'],
  };
  return map[intent] || [];
}

function vlCaptureSubmit() {
  const ta = document.getElementById('vl-capture-input');
  const domEl = document.getElementById('vl-domain');
  const text = ta?.value?.trim();
  if (!text) { mm_toast('Write something first', 'warn'); return; }
  const node = vlAddNode(text, domEl?.value || null);
  ta.value = '';
  document.getElementById('vl-route-preview').style.display = 'none';
  mm_toast('Captured' + (node.routedTo?.length ? ' → ' + node.routedTo.join(', ') : ''), 'success', { dur: 2000 });
  const overlay = document.getElementById('mm-vl-overlay');
  if (overlay) _renderVL(overlay);
}

// ── TAB: Sessions ─────────────────────────────────────────────────
// Was its own module (modules/lattice/ui.js, openLattice/closeLattice)
// with a single SESSIONS tab of its own. The associative lattice it
// reads from (modules/lattice/lattice.js) is fed by every module —
// canvas, ALM, Horizon, patterns, and this one — grouped by whichever
// recording session a node arrived in, voice or not. That belongs
// alongside Capture and the word-lattice view rather than behind a
// second "open lattice" entry point, so it lives here as a tab now.
// Reads latticeSessions() / latticeNodesForSession() / LAT_KINDS from
// modules/lattice/lattice.js, and _latFmtWhen / _latFmtDuration from
// modules/lattice/ui.js — both already loaded alongside nexus-engine.js.

let _vlSessOpenId = null;

function _vlTabSessions(container) {
  container.style.cssText = 'flex:1;display:flex;overflow:hidden';
  const sessions = typeof latticeSessions === 'function' ? latticeSessions() : [];
  const totalNodes = (typeof LATTICE !== 'undefined' && LATTICE.nodes) ? LATTICE.nodes.length : 0;

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;width:100%;overflow:hidden">
      <div style="padding:8px 18px;border-bottom:1px solid rgba(119,68,255,.1);flex-shrink:0">
        <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:1.5px;color:var(--dim)">
          ${totalNodes} node${totalNodes === 1 ? '' : 's'} across ${sessions.length} session${sessions.length === 1 ? '' : 's'} · every module feeds this, not just voice
        </div>
      </div>
      <div style="flex:1;display:flex;overflow:hidden">
        <div id="vl-session-list" style="width:320px;border-right:1px solid rgba(119,68,255,.1);overflow-y:auto;flex-shrink:0"></div>
        <div id="vl-session-detail" style="flex:1;overflow-y:auto;padding:18px"></div>
      </div>
    </div>
  `;
  _vlRenderSessionList();
  _vlRenderSessionDetail(_vlSessOpenId);
}

function _vlRenderSessionList() {
  const list = document.getElementById('vl-session-list');
  if (!list) return;
  const sessions = typeof latticeSessions === 'function' ? latticeSessions() : [];

  if (!sessions.length) {
    list.innerHTML = `<div style="padding:18px;font-family:var(--f-mono);font-size:8px;color:var(--wire2);line-height:1.7">
      No sessions yet. A session starts when you begin recording — nothing
      arrives in the lattice with no source to point to.</div>`;
    return;
  }

  list.innerHTML = sessions.map(s => {
    const active = _vlSessOpenId === s.id;
    const label = s.synthetic ? 'UNSESSIONED' : (s.kind || 'live').toUpperCase();
    const color = s.synthetic ? 'var(--dim)' : '#7744ff';
    const fmtWhen = typeof _latFmtWhen === 'function' ? _latFmtWhen : (iso => iso ? new Date(iso).toLocaleString() : '—');
    const fmtDur = typeof _latFmtDuration === 'function' ? _latFmtDuration : (() => '—');
    return `
      <div onclick="_vlSessOpen('${s.id}')" style="padding:12px 16px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.04);
        background:${active ? 'rgba(119,68,255,.08)' : 'transparent'};border-left:2px solid ${active ? color : 'transparent'}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:1px;color:${color};border:1px solid ${color}44;padding:1px 4px">${label}</span>
          ${!s.endedAt && !s.synthetic ? '<span style="font-family:var(--f-mono);font-size:6.5px;color:#ff3355">● LIVE</span>' : ''}
        </div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright,#eaf6ff)">${s.synthetic ? 'No active session' : fmtWhen(s.startedAt)}</div>
        <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-top:2px">
          ${s.nodeCount || 0} node${(s.nodeCount || 0) === 1 ? '' : 's'}${s.synthetic ? '' : ' · ' + fmtDur(s.startedAt, s.endedAt)}
        </div>
      </div>
    `;
  }).join('');
}

function _vlSessOpen(id) {
  _vlSessOpenId = id;
  _vlRenderSessionList();
  _vlRenderSessionDetail(id);
}

function _vlRenderSessionDetail(id) {
  const detail = document.getElementById('vl-session-detail');
  if (!detail) return;

  if (!id) {
    detail.innerHTML = `<div style="font-family:var(--f-mono);font-size:8.5px;color:var(--wire2)">Select a session to see what came in during it.</div>`;
    return;
  }

  const nodes = typeof latticeNodesForSession === 'function' ? latticeNodesForSession(id) : [];
  const sessions = typeof latticeSessions === 'function' ? latticeSessions() : [];
  const sess = sessions.find(s => s.id === id);
  const fmtWhen = typeof _latFmtWhen === 'function' ? _latFmtWhen : (iso => iso ? new Date(iso).toLocaleString() : '—');
  const fmtDur = typeof _latFmtDuration === 'function' ? _latFmtDuration : (() => '—');

  const header = sess && !sess.synthetic ? `
    <div style="display:flex;gap:18px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06);flex-wrap:wrap">
      <div><div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim);letter-spacing:1px">STARTED</div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright,#eaf6ff)">${fmtWhen(sess.startedAt)}</div></div>
      <div><div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim);letter-spacing:1px">DURATION</div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright,#eaf6ff)">${fmtDur(sess.startedAt, sess.endedAt)}</div></div>
      <div><div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim);letter-spacing:1px">KIND</div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright,#eaf6ff)">${escH(sess.kind || 'live')}</div></div>
    </div>` : `
    <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(255,255,255,.06);font-family:var(--f-mono);
      font-size:7.5px;color:var(--dim);line-height:1.7">
      Nodes that arrived with no active recording session — spawned on the
      canvas, externalized in ALM, seeded in Horizon, or otherwise entered
      the lattice outside a capture window.
    </div>`;

  if (!nodes.length) {
    detail.innerHTML = header + `<div style="font-family:var(--f-mono);font-size:8px;color:var(--wire2)">No nodes in this session.</div>`;
    return;
  }

  const kinds = (typeof LAT_KINDS !== 'undefined') ? LAT_KINDS : {};
  const rows = nodes.map(n => {
    const k = kinds[n.kind] || { label: n.kind, color: '#7744ff' };
    const tags = (n.tags || []).slice(0, 5).map(t =>
      `<span style="font-family:var(--f-mono);font-size:6.5px;color:${k.color};border:1px solid ${k.color}33;padding:1px 4px;margin-right:3px">${escH(t)}</span>`
    ).join('');
    return `
      <div style="padding:10px 12px;margin-bottom:6px;background:rgba(255,255,255,.02);border-left:2px solid ${k.color}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-family:var(--f-mono);font-size:6.5px;letter-spacing:1px;color:${k.color}">${escH(k.label)}</span>
          <span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim);margin-left:auto">${fmtWhen(new Date(n.ts).toISOString())}</span>
        </div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright,#eaf6ff);line-height:1.5;margin-bottom:4px">${escH(n.text.length > 220 ? n.text.slice(0, 218) + '…' : n.text)}</div>
        ${tags ? `<div>${tags}</div>` : ''}
      </div>
    `;
  }).join('');

  detail.innerHTML = header + `
    <div style="font-family:var(--f-mono);font-size:7px;letter-spacing:2px;color:var(--dim);margin-bottom:10px">${nodes.length} NODE${nodes.length === 1 ? '' : 'S'}</div>
    ${rows}
  `;
}

if (typeof window !== 'undefined') {
  window._vlSessOpen = _vlSessOpen;
}

// ── TAB: Lattice (visualization) ──────────────────────────────────

// Shared across the Lattice tab's rendering functions so a click on a
// word, a domain chip, or a node all agree on what's currently shown.
const VL_DOMAIN_COLORS = {
  cognitive:'#00c8ff', emotional:'#ff66aa', relational:'#11ddcc',
  creative:'#cc44ff', somatic:'#88ffcc', shadow:'#7744ff',
  growth:'#00ff88', systems:'#ffe04a', identity:'#ff8c22', general:'rgba(255,255,255,.4)',
};
const VL_LATTICE_FILTERS = { q: '', domain: '', word: '' };
let _vlDetailNodeId = null;

function _vlLatticeFilteredNodes() {
  const f = VL_LATTICE_FILTERS;
  let nodes = VL_STATE.nodes;
  if (f.domain) nodes = nodes.filter(n => n.domain === f.domain);
  if (f.word)   nodes = nodes.filter(n => (n.content || '').toLowerCase().includes(f.word.toLowerCase()));
  if (f.q)      nodes = nodes.filter(n => (n.content || '').toLowerCase().includes(f.q.toLowerCase()));
  return nodes.slice(0, 50);
}

function _vlTabLattice(container) {
  // Word frequency cloud + node list with search
  const topWords = Object.entries(VL_STATE.wordBank)
    .filter(([w]) => !['that','this','with','have','from','they','what','your','when','will','been','into','some','also','than','more','very','just','like','only','then','over','most','even','back','well','such','here','these','does','both','same','each','many','much','make','give','take','come','know','find','need','feel','look','work','call','time','life','year','week','days'].includes(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);

  container.innerHTML = `
    <div style="flex:1;display:grid;grid-template-columns:1fr 340px;overflow:hidden">
      <!-- Left: word cloud / frequency map -->
      <div style="padding:20px 24px;overflow-y:auto;border-right:1px solid rgba(119,68,255,.1)">
        <div style="font-family:var(--f-display);font-size:9px;letter-spacing:3px;
          color:#7744ff;margin-bottom:16px">WORD LATTICE (${Object.keys(VL_STATE.wordBank).length} unique)</div>
        ${topWords.length ? `
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">
          ${topWords.map(([w, count]) => {
            const size = Math.max(9, Math.min(18, 8 + count * 1.5));
            const active = VL_LATTICE_FILTERS.word === w;
            const opacity = active ? 1 : Math.max(0.35, Math.min(1, count / 10));
            return `<span onclick="vlLatticeFilterWord('${escH(w)}')" style="font-family:var(--f-mono);font-size:${size}px;
              color:rgba(119,68,255,${opacity});cursor:pointer;padding:2px 3px;
              ${active ? 'border-bottom:1px solid #7744ff' : ''}"
              title="${count} occurrence${count>1?'s':''} \u2014 click to filter the list"
              >${escH(w)}</span>`;
          }).join('')}
        </div>` : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
          padding:20px 0">Capture nodes to build the lattice.</div>`}

        <!-- Domain distribution -->
        ${VL_STATE.nodes.length ? `
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:10px">DOMAIN DISTRIBUTION</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${Object.entries(VL_DOMAIN_COLORS).map(([domain, color]) => {
            const count = VL_STATE.nodes.filter(n => n.domain === domain).length;
            if (!count) return '';
            const pct = Math.round((count / VL_STATE.nodes.length) * 100);
            return `
              <div onclick="vlLatticeFilterDomain('${domain}')" style="display:flex;align-items:center;gap:8px;cursor:pointer">
                <span style="font-family:var(--f-mono);font-size:7.5px;color:${color};
                  min-width:80px;${VL_LATTICE_FILTERS.domain === domain ? 'text-decoration:underline' : ''}">${domain}</span>
                <div style="flex:1;height:4px;background:rgba(255,255,255,.06);overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${color};transition:width .3s"></div>
                </div>
                <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">${count}</span>
              </div>`;
          }).join('')}
        </div>` : ''}
      </div>

      <!-- Right: filters + search + node list, or a node's detail -->
      <div id="vl-lattice-right" style="display:flex;flex-direction:column;overflow:hidden"></div>
    </div>
  `;
  _vlRenderLatticeRight('list');
}

// Everything on the right side of the Lattice tab funnels through here,
// so a click on a word/domain/node and the search box all agree on
// what's on screen — there is exactly one place that decides.
function _vlRenderLatticeRight(mode) {
  const el = document.getElementById('vl-lattice-right');
  if (!el) return;
  if (mode === 'detail' && _vlDetailNodeId) {
    const node = VL_STATE.nodes.find(n => n.id === _vlDetailNodeId);
    if (node) { el.innerHTML = _vlRenderNodeDetail(node); return; }
    _vlDetailNodeId = null; // node vanished (e.g. deleted from elsewhere) — fall through to list
  }
  el.innerHTML = _vlRenderLatticeListHtml();
}

function _vlRenderLatticeListHtml() {
  const f = VL_LATTICE_FILTERS;
  const activeFilters = !!(f.domain || f.word);
  return `
    <div style="padding:10px 14px;border-bottom:1px solid rgba(119,68,255,.1);flex-shrink:0">
      <input placeholder="Search nodes\u2026" id="vl-lattice-search" value="${escH(f.q)}" style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:8.5px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(119,68,255,.2);padding:7px 10px;outline:none;margin-bottom:${activeFilters ? '8' : '0'}px"
        onfocus="this.style.borderColor='rgba(119,68,255,.5)'"
        onblur="this.style.borderColor='rgba(119,68,255,.2)'"
        oninput="vlLatticeSearch(this.value)"/>
      ${activeFilters ? `
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
        ${f.domain ? `<span onclick="vlLatticeFilterDomain('')" style="cursor:pointer;font-family:var(--f-mono);font-size:7px;color:${VL_DOMAIN_COLORS[f.domain]||'#7744ff'};
          border:1px solid rgba(119,68,255,.3);padding:2px 7px">${f.domain} \u2715</span>` : ''}
        ${f.word ? `<span onclick="vlLatticeFilterWord('${escH(f.word)}')" style="cursor:pointer;font-family:var(--f-mono);font-size:7px;color:#7744ff;
          border:1px solid rgba(119,68,255,.3);padding:2px 7px">"${escH(f.word)}" \u2715</span>` : ''}
      </div>` : ''}
    </div>
    <div id="vl-lat-count-line" style="padding:6px 14px 0;font-family:var(--f-mono);font-size:6.5px;color:var(--wire2)">
      ${_vlLatticeFilteredNodes().length} of ${VL_STATE.nodes.length} nodes
    </div>
    <div id="vl-node-list" style="flex:1;overflow-y:auto;padding:8px 12px">
      ${_vlRenderNodeList(_vlLatticeFilteredNodes(), VL_DOMAIN_COLORS)}
    </div>
  `;
}

function _vlRenderNodeList(nodes, domainColors) {
  if (!nodes.length) {
    const filtered = !!(VL_LATTICE_FILTERS.domain || VL_LATTICE_FILTERS.word || VL_LATTICE_FILTERS.q);
    return `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);padding:16px 0">
      ${filtered ? 'Nothing matches the current filters.' : 'No nodes.'}</div>`;
  }
  return nodes.map(n => {
    const dc = domainColors[n.domain] || 'rgba(255,255,255,.3)';
    return `
      <div onclick="vlOpenNodeDetail('${n.id}')" style="padding:8px 4px;border-bottom:1px solid rgba(255,255,255,.04);
        display:flex;gap:8px;align-items:flex-start;cursor:pointer"
        onmouseenter="this.style.background='rgba(119,68,255,.05)'"
        onmouseleave="this.style.background='transparent'">
        <div style="width:6px;height:6px;border-radius:50%;background:${dc};
          flex-shrink:0;margin-top:4px"></div>
        <div style="flex:1;min-width:0">
          <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
            line-height:1.5;word-break:break-word">${escH(n.content.slice(0,80))}${n.content.length>80?'…':''}</div>
          <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--wire2);margin-top:2px">
            ${_vlTimeAgo(n.ts)} · ${n.domain}${n.redundant ? ' · <span style="color:var(--o)">⟲ circled before</span>' : ''}</div>
        </div>
        <button onclick="event.stopPropagation();vlNodeToCanvas('${n.id}')" style="
          background:none;border:none;cursor:pointer;color:var(--wire2);
          font-family:var(--f-mono);font-size:7px;flex-shrink:0"
          onmouseenter="this.style.color='var(--c)'"
          onmouseleave="this.style.color='var(--wire2)'">→</button>
      </div>`;
  }).join('');
}

// Detail panel — the piece that was missing entirely. A node in the
// list was previously a dead end (read the first 80 characters, or
// send it to the canvas; nothing in between). This shows the whole
// thought, why it was tagged the way it was, what it's redundant
// against, and what it's actually connected to.
function _vlRenderNodeDetail(node) {
  const dc = VL_DOMAIN_COLORS[node.domain] || 'rgba(255,255,255,.4)';
  const related = (node.assocEdges || [])
    .slice().sort((a, b) => (b.score||0) - (a.score||0)).slice(0, 8)
    .map(e => {
      const other = VL_STATE.nodes.find(x => x.id === e.to);
      if (!other) return '';
      return `
        <div onclick="vlOpenNodeDetail('${other.id}')" style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);
          cursor:pointer;display:flex;gap:8px;align-items:baseline"
          onmouseenter="this.style.color='var(--bright)'" onmouseleave="this.style.color=''">
          <span style="font-family:var(--f-mono);font-size:7px;color:#7744ff;flex-shrink:0">${Math.round((e.score||0)*100)}%</span>
          <span style="font-family:var(--f-mono);font-size:8px;color:var(--muted);line-height:1.5">${escH(other.content.slice(0,90))}${other.content.length>90?'…':''}</span>
        </div>`;
    }).join('');

  return `
    <div style="display:flex;flex-direction:column;height:100%">
      <div style="padding:10px 14px;border-bottom:1px solid rgba(119,68,255,.1);display:flex;align-items:center;gap:8px;flex-shrink:0">
        <button onclick="vlOpenNodeDetail(null)" style="
          background:none;border:none;cursor:pointer;color:var(--dim);font-family:var(--f-mono);font-size:8px"
          onmouseenter="this.style.color='var(--bright)'" onmouseleave="this.style.color='var(--dim)'">\u2190 BACK</button>
        <div style="flex:1"></div>
        <button onclick="vlNodeToCanvas('${node.id}')" style="
          padding:4px 9px;border:1px solid rgba(255,255,255,.1);color:var(--dim);background:transparent;
          cursor:pointer;font-family:var(--f-mono);font-size:7px"
          onmouseenter="this.style.color='var(--c)'" onmouseleave="this.style.color='var(--dim)'">→ CANVAS</button>
        <button onclick="vlDeleteNodeConfirm('${node.id}')" style="
          padding:4px 9px;border:1px solid rgba(255,51,85,.25);color:var(--r);background:transparent;
          cursor:pointer;font-family:var(--f-mono);font-size:7px"
          onmouseenter="this.style.background='rgba(255,51,85,.08)'" onmouseleave="this.style.background='transparent'">DELETE</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px">
        <div style="font-family:var(--f-mono);font-size:7px;color:${dc};letter-spacing:1.5px;margin-bottom:10px">
          ${(node.domain || 'general').toUpperCase()} · ${(node.intent || 'capture').replace(/_/g,' ').toUpperCase()}
        </div>
        <div style="font-family:var(--f-mono);font-size:10.5px;color:var(--bright);line-height:1.9;
          margin-bottom:16px;white-space:pre-wrap">${escH(node.content)}</div>

        ${node.redundant ? `<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--o);
          padding:7px 10px;background:rgba(255,140,34,.05);margin-bottom:14px">
          ⟲ Flagged as circling back to a thought you\u2019ve had before.</div>` : ''}

        ${node.tags?.length ? `
        <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;color:var(--dim);margin-bottom:6px">TAGS</div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:16px">
          ${node.tags.map(t => `<span style="font-family:var(--f-mono);font-size:7px;color:var(--muted);
            border:1px solid rgba(255,255,255,.08);padding:2px 7px">${escH(t)}</span>`).join('')}
        </div>` : ''}

        ${node.routedTo?.length ? `
        <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;color:var(--dim);margin-bottom:6px">ROUTED TO</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);margin-bottom:16px">${node.routedTo.map(escH).join(' · ')}</div>` : ''}

        <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--wire2);margin-bottom:16px">
          CAPTURED ${new Date(node.ts).toLocaleString()}</div>

        <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;color:var(--dim);margin-bottom:4px">
          ASSOCIATED (${(node.assocEdges || []).length})</div>
        ${related || `<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--wire2);padding:8px 0">
          Nothing else shares enough vocabulary with this yet.</div>`}
      </div>
    </div>`;
}

function vlOpenNodeDetail(id) {
  _vlDetailNodeId = id;
  _vlRenderLatticeRight(id ? 'detail' : 'list');
}

async function vlDeleteNodeConfirm(id) {
  const ok = await mmConfirm(
    'Delete this node?\n\nIt is removed from the lattice permanently. Anything associated with it will simply stop pointing here.'
  );
  if (!ok) return;
  VL_STATE.nodes = VL_STATE.nodes.filter(n => n.id !== id);
  VL_STATE.nodes.forEach(n => {
    if (Array.isArray(n.assocEdges)) n.assocEdges = n.assocEdges.filter(e => e.to !== id);
  });
  vlSave();
  _vlDetailNodeId = null;
  _vlRenderLatticeRight('list');
  mm_toast('Node deleted', 'info', { dur: 1500 });
}

function vlLatticeFilterDomain(domain) {
  VL_LATTICE_FILTERS.domain = domain;
  _vlRenderLatticeRight('list');
}

function vlLatticeFilterWord(word) {
  VL_LATTICE_FILTERS.word = VL_LATTICE_FILTERS.word === word ? '' : word;
  _vlRenderLatticeRight('list');
}

function vlLatticeSearch(q) {
  VL_LATTICE_FILTERS.q = q;
  const list = document.getElementById('vl-node-list');
  if (list) list.innerHTML = _vlRenderNodeList(_vlLatticeFilteredNodes(), VL_DOMAIN_COLORS);
  const countLine = document.getElementById('vl-lat-count-line');
  if (countLine) countLine.textContent = _vlLatticeFilteredNodes().length + ' of ' + VL_STATE.nodes.length + ' nodes';
}

function vlNodeToCanvas(id) {
  const node = VL_STATE.nodes.find(n => n.id === id);
  if (!node) return;
  const intentTypeMap = {
    philosophy_update:'framework', value_update:'invariant', growth_marker:'delta',
    shadow_observation:'pattern', emotional_data:'signal', identity_update:'heuristic',
    framework_mutation:'framework', capture:'concept',
  };
  CANVAS.spawnNode(intentTypeMap[node.intent]||'concept', undefined, undefined, {
    title: node.content.slice(0, 60),
    tags: [...(node.tags||[]), 'LATTICE', node.intent.replace(/_/g,'-').toUpperCase()],
  });
  mm_toast('Node → canvas', 'export', { dur: 1200 });
}

// ── TAB: Heuristics ───────────────────────────────────────────────
function _vlTabHeuristics(container) {
  container.style.overflowY = 'auto';
  container.innerHTML = `
    <div style="padding:22px 28px;max-width:900px;display:flex;flex-direction:column;gap:18px">
      <div>
        <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
          letter-spacing:4px;color:#7744ff;margin-bottom:4px">HEURISTICS LIBRARY</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
          Named rules of thumb. The system detects when they fire from your voice notes.
          Each heuristic is a pattern you've earned — stored, triggered, tracked.
        </div>
      </div>

      <!-- Add heuristic -->
      <div style="padding:16px;background:rgba(119,68,255,.05);border:1px solid rgba(119,68,255,.18)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:#7744ff;margin-bottom:10px">+ NEW HEURISTIC</div>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <input id="vl-h-name" placeholder="Name…" style="
            flex:1;font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
            background:rgba(0,0,0,.5);border:1px solid rgba(119,68,255,.2);
            padding:7px 10px;outline:none"
            onfocus="this.style.borderColor='rgba(119,68,255,.5)'"
            onblur="this.style.borderColor='rgba(119,68,255,.2)'"/>
          <select id="vl-h-domain" style="
            background:rgba(0,0,0,.5);border:1px solid rgba(119,68,255,.2);
            color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
            <option value="">Domain</option>
            ${['cognitive','emotional','relational','creative','somatic','shadow','meta'].map(d =>
              `<option value="${d}">${d}</option>`).join('')}
          </select>
        </div>
        <textarea id="vl-h-desc" placeholder="What does this heuristic do? When does it apply?" style="
          width:100%;box-sizing:border-box;height:52px;resize:none;
          font-family:var(--f-mono);font-size:8px;color:var(--bright);
          background:rgba(0,0,0,.45);border:1px solid rgba(119,68,255,.15);
          padding:7px;line-height:1.6;outline:none;margin-bottom:8px"></textarea>
        <input id="vl-h-triggers" placeholder="Trigger phrases (comma-separated): 'that pattern again, oscillating, pendulum'" style="
          width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:8px;
          color:var(--muted);background:rgba(0,0,0,.5);border:1px solid rgba(119,68,255,.15);
          padding:7px 10px;outline:none;margin-bottom:8px"/>
        <div style="text-align:right">
          <button onclick="vlAddHeuristic()" style="
            padding:8px 20px;border:1px solid rgba(119,68,255,.4);
            color:#7744ff;background:rgba(119,68,255,.08);cursor:pointer;
            font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
            onmouseenter="this.style.background='rgba(119,68,255,.18)'"
            onmouseleave="this.style.background='rgba(119,68,255,.08)'">+ ADD</button>
        </div>
      </div>

      <!-- Test a phrase — see firing happen, rather than only finding out
           about it after the fact from a toast during real capture. Uses
           the exact same matcher vceDetectIntent() runs on live speech;
           this is a dry run, so it never touches fireCount/lastFired. -->
      <div style="padding:16px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.06)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:10px">TEST A PHRASE</div>
        <div style="display:flex;gap:8px">
          <input id="vl-h-test-input" placeholder="Type something you might say…" style="
            flex:1;font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
            background:rgba(0,0,0,.5);border:1px solid rgba(255,255,255,.1);
            padding:7px 10px;outline:none"
            onfocus="this.style.borderColor='rgba(119,68,255,.5)'"
            onblur="this.style.borderColor='rgba(255,255,255,.1)'"
            onkeydown="if(event.key==='Enter')vlHeuristicTest()"/>
          <button onclick="vlHeuristicTest()" style="
            padding:7px 16px;border:1px solid rgba(119,68,255,.4);color:#7744ff;
            background:rgba(119,68,255,.08);cursor:pointer;font-family:var(--f-mono);font-size:8px"
            onmouseenter="this.style.background='rgba(119,68,255,.18)'"
            onmouseleave="this.style.background='rgba(119,68,255,.08)'">TEST</button>
        </div>
        <div id="vl-h-test-result" style="font-family:var(--f-mono);font-size:7.5px;
          color:var(--wire2);margin-top:8px;min-height:11px"></div>
      </div>

      <!-- Library -->
      <div style="display:flex;flex-direction:column;gap:9px">
        ${VL_STATE.heuristics.map(h => {
          const dc = {cognitive:'#00c8ff',emotional:'#ff66aa',relational:'#11ddcc',
            creative:'#cc44ff',somatic:'#88ffcc',shadow:'#7744ff',meta:'#d4a820'}[h.domain]||'#7744ff';
          return `
            <div id="vl-h-card-${h.id}" style="padding:13px 16px;background:rgba(0,0,0,.35);
              border:1px solid rgba(255,255,255,.06);border-left:3px solid ${dc}44;transition:box-shadow .2s">
              <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:7px">
                <div style="flex:1">
                  <div style="font-family:var(--f-display);font-size:10px;font-weight:700;
                    letter-spacing:1.5px;color:${dc};margin-bottom:3px">${escH(h.name)}</div>
                  <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
                    line-height:1.7">${escH(h.desc)}</div>
                </div>
                <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
                  ${h.fireCount ? `<span style="font-family:var(--f-mono);font-size:7px;
                    color:${dc};border:1px solid ${dc}44;padding:2px 7px">
                    fired ${h.fireCount}×</span>` : ''}
                  ${h.lastFired ? `<span style="font-family:var(--f-mono);font-size:6.5px;
                    color:var(--wire2)">${_vlTimeAgo(h.lastFired)}</span>` : ''}
                </div>
              </div>
              ${h.triggerPhrases?.length ? `
                <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px">
                  ${h.triggerPhrases.map(tp => `<span style="font-family:var(--f-mono);font-size:7px;
                    color:var(--dim);border:1px solid rgba(255,255,255,.07);
                    padding:1px 6px">"${escH(tp)}"</span>`).join('')}
                </div>` : ''}
              <div style="display:flex;gap:7px">
                <button onclick="vlHeuristicToCanvas('${h.id}')" style="
                  padding:3px 9px;border:1px solid rgba(255,255,255,.08);
                  color:var(--dim);background:transparent;cursor:pointer;
                  font-family:var(--f-mono);font-size:7px"
                  onmouseenter="this.style.color='var(--c)'"
                  onmouseleave="this.style.color='var(--dim)'">→ CANVAS</button>
                <button onclick="vlDeleteHeuristic('${h.id}')" style="
                  padding:3px 7px;border:none;background:none;cursor:pointer;
                  color:var(--wire2);font-size:11px;margin-left:auto"
                  onmouseenter="this.style.color='var(--r)'"
                  onmouseleave="this.style.color='var(--wire2)'">×</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function vlAddHeuristic() {
  const name = document.getElementById('vl-h-name')?.value?.trim();
  if (!name) { mm_toast('Name required', 'warn'); return; }
  const triggerRaw = document.getElementById('vl-h-triggers')?.value || '';
  VL_STATE.heuristics.push({
    id: uuid(), name,
    desc:          document.getElementById('vl-h-desc')?.value?.trim() || '',
    domain:        document.getElementById('vl-h-domain')?.value || '',
    triggerPhrases: triggerRaw.split(',').map(t => t.trim()).filter(Boolean),
    fireCount: 0, lastFired: null, ts: Date.now(),
  });
  vlSave();
  mm_toast('Heuristic added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-vl-overlay');
  if (overlay) _renderVL(overlay);
}

function vlDeleteHeuristic(id) {
  VL_STATE.heuristics = VL_STATE.heuristics.filter(h => h.id !== id);
  vlSave();
  const overlay = document.getElementById('mm-vl-overlay');
  if (overlay) _renderVL(overlay);
}

function vlHeuristicToCanvas(id) {
  const h = VL_STATE.heuristics.find(x => x.id === id);
  if (!h) return;
  CANVAS.spawnNode('heuristic', undefined, undefined, {
    title: h.name, body: h.desc, tags: ['HEURISTIC', 'LATTICE', (h.domain||'').toUpperCase()],
  });
  mm_toast(h.name + ' → canvas', 'export', { dur: 1200 });
}

// Runs a typed phrase through the exact matcher real capture uses
// (vceDetectIntent), without creating a node or touching fireCount —
// a dry run, so someone can see whether a heuristic actually catches
// what they think it catches before it matters.
function vlHeuristicTest() {
  const input = document.getElementById('vl-h-test-input');
  const resultEl = document.getElementById('vl-h-test-result');
  const text = input?.value?.trim();

  // Clear any highlight from a previous test first, always.
  VL_STATE.heuristics.forEach(h => {
    const card = document.getElementById('vl-h-card-' + h.id);
    if (card) card.style.boxShadow = 'none';
  });

  if (!text) { if (resultEl) resultEl.textContent = 'Type something first.'; return; }
  if (!resultEl) return;

  const { heuristics: fired } = vceDetectIntent(text);
  if (!fired.length) {
    resultEl.innerHTML = '<span style="color:var(--dim)">No heuristics fire on this phrase.</span>';
    return;
  }
  fired.forEach(h => {
    const card = document.getElementById('vl-h-card-' + h.id);
    if (card) card.style.boxShadow = '0 0 0 1px #7744ff, 0 0 16px rgba(119,68,255,.25)';
  });
  resultEl.innerHTML = '<span style="color:#7744ff">\u25c6 fires: ' +
    fired.map(h => escH(h.name)).join(', ') + '</span>';
}

// ── TAB: Growth ───────────────────────────────────────────────────
function _vlTabGrowth(container) {
  container.style.overflowY = 'auto';

  const domainColors = {
    cognitive:'#00c8ff', emotional:'#ff66aa', relational:'#11ddcc',
    creative:'#cc44ff', somatic:'#88ffcc', shadow:'#7744ff',
    growth:'#00ff88', systems:'#ffe04a', identity:'#ff8c22', general:'rgba(255,255,255,.3)',
  };

  // Compute growth score
  const totalGrowth = VL_STATE.growthLog.length + VL_STATE.philosophyLog.length +
    VL_STATE.valueLog.length + VL_STATE.shadowLog.length;
  const recentGrowth = [...VL_STATE.growthLog, ...VL_STATE.philosophyLog,
    ...VL_STATE.valueLog, ...VL_STATE.shadowLog]
    .filter(g => Date.now() - g.ts < 2592000000).length; // 30 days

  // Top recurring words across growth markers
  const growthWords = {};
  VL_STATE.growthLog.forEach(g => {
    (g.after||'').toLowerCase().split(/\W+/).filter(w => w.length > 4).forEach(w => {
      growthWords[w] = (growthWords[w] || 0) + 1;
    });
  });
  const topGrowthWords = Object.entries(growthWords).sort((a,b)=>b[1]-a[1]).slice(0,8);

  container.innerHTML = `
    <div style="padding:22px 28px;display:flex;flex-direction:column;gap:22px">

      <!-- Growth score header -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px">
        ${[
          { label: 'Growth Markers',   count: VL_STATE.growthLog.length,    color: '#00ff88' },
          { label: 'Philosophy Updates', count: VL_STATE.philosophyLog.length, color: '#00c8ff' },
          { label: 'Value Updates',    count: VL_STATE.valueLog.length,     color: '#ffe04a' },
          { label: 'Shadow Work',      count: VL_STATE.shadowLog.length,    color: '#7744ff' },
        ].map(stat => `
          <div style="padding:14px;background:rgba(0,0,0,.4);
            border:1px solid ${stat.color}22;text-align:center">
            <div style="font-family:var(--f-display);font-size:24px;font-weight:900;
              color:${stat.color};margin-bottom:4px">${stat.count}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">${stat.label}</div>
          </div>`).join('')}
      </div>

      ${totalGrowth ? `
      <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--dim)">
        <span style="color:#00ff88">${recentGrowth}</span> updates in the last 30 days.
        You have made <span style="color:#7744ff">${totalGrowth}</span> significant updates to your framework.
      </div>` : ''}

      ${topGrowthWords.length ? `
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:8px">RECURRING THEMES IN GROWTH</div>
        <div style="display:flex;flex-wrap:wrap;gap:7px">
          ${topGrowthWords.map(([w, c]) => `<span style="font-family:var(--f-mono);
            font-size:${8 + c}px;color:rgba(119,68,255,${Math.min(1, 0.3+c*0.15)})">${w}</span>`).join('')}
        </div>
      </div>` : ''}

      <!-- Add growth marker manually -->
      <div style="padding:14px;background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.15)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:#00ff88;margin-bottom:9px">+ MARK GROWTH</div>
        <input id="vl-growth-before" placeholder="Before: I used to… / I was…" style="
          width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:8.5px;
          color:var(--bright);background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.15);
          padding:7px 10px;outline:none;margin-bottom:7px"/>
        <input id="vl-growth-after" placeholder="After: Now I… / I no longer… / I'm learning…" style="
          width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:8.5px;
          color:var(--bright);background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          padding:7px 10px;outline:none;margin-bottom:7px"
          onkeydown="if(event.key==='Enter')vlAddGrowthMarker()"/>
        <div style="display:flex;gap:8px">
          <select id="vl-growth-domain" style="
            flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.15);
            color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
            <option value="general">Domain</option>
            ${Object.keys(domainColors).map(d => `<option value="${d}">${d}</option>`).join('')}
          </select>
          <button onclick="vlAddGrowthMarker()" style="
            padding:7px 18px;border:1px solid rgba(0,255,136,.4);
            color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
            font-family:var(--f-mono);font-size:8px"
            onmouseenter="this.style.background='rgba(0,255,136,.15)'"
            onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ MARK</button>
        </div>
      </div>

      <!-- Growth timeline -->
      ${[...VL_STATE.growthLog].reverse().length ? `
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:12px">GROWTH TIMELINE</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${[...VL_STATE.growthLog].reverse().slice(0,20).map(g => {
            const dc = domainColors[g.domain] || 'rgba(255,255,255,.3)';
            return `
              <div style="padding:12px 16px;background:rgba(0,0,0,.35);
                border-left:3px solid ${dc}">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span style="font-family:var(--f-mono);font-size:7px;color:${dc};
                    border:1px solid ${dc}44;padding:1px 6px">${g.domain}</span>
                  <span style="font-family:var(--f-mono);font-size:7px;
                    color:var(--wire2);margin-left:auto">${_vlTimeAgo(g.ts)}</span>
                </div>
                ${g.before ? `<div style="font-family:var(--f-mono);font-size:8px;
                  color:var(--wire2);text-decoration:line-through;margin-bottom:4px">
                  ${escH(g.before)}</div>` : ''}
                <div style="font-family:var(--f-mono);font-size:9px;color:var(--bright);
                  line-height:1.6">${escH(g.after)}</div>
              </div>`;
          }).join('')}
        </div>
      </div>` : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        No growth markers yet. Use Capture to say "I used to…" or "I've changed…"
        or mark growth manually above.</div>`}
    </div>
  `;
}

function vlAddGrowthMarker() {
  const after = document.getElementById('vl-growth-after')?.value?.trim();
  if (!after) { mm_toast('Describe the growth', 'warn'); return; }
  const before = document.getElementById('vl-growth-before')?.value?.trim() || '';
  const domain = document.getElementById('vl-growth-domain')?.value || 'general';
  VL_STATE.growthLog.push({ id: uuid(), before, after, domain, magnitude: 1, ts: Date.now() });
  vlSave();
  mm_toast('Growth marked', 'success', { dur: 1400 });
  document.getElementById('vl-growth-before').value = '';
  document.getElementById('vl-growth-after').value = '';
  const overlay = document.getElementById('mm-vl-overlay');
  if (overlay) _renderVL(overlay);
}

// ── TAB: Coherence ────────────────────────────────────────────────
function _vlTabCoherence(container) {
  container.style.overflowY = 'auto';

  // Run a basic coherence check: find potential contradictions in philosophy log
  const alerts = [...VL_STATE.coherenceAlerts];

  container.innerHTML = `
    <div style="padding:22px 28px;display:flex;flex-direction:column;gap:20px">
      <div>
        <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
          letter-spacing:4px;color:#7744ff;margin-bottom:4px">COHERENCE</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
          Contradiction detection. Alignment scoring. Does what you're capturing
          cohere with what you believe? Or is there a gap worth examining?
        </div>
      </div>

      <!-- Manual check -->
      <div style="padding:14px;background:rgba(119,68,255,.05);border:1px solid rgba(119,68,255,.18)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:#7744ff;margin-bottom:9px">CHECK FOR CONTRADICTION</div>
        <textarea id="vl-coherence-input" placeholder="Enter a belief, claim, or observation to check against your existing captures…" style="
          width:100%;box-sizing:border-box;height:60px;resize:none;
          font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
          background:rgba(0,0,0,.5);border:1px solid rgba(119,68,255,.2);
          padding:8px 10px;outline:none;line-height:1.6"></textarea>
        <div style="text-align:right;margin-top:7px">
          <button onclick="vlCheckCoherence()" style="
            padding:7px 18px;border:1px solid rgba(119,68,255,.4);
            color:#7744ff;background:rgba(119,68,255,.08);cursor:pointer;
            font-family:var(--f-mono);font-size:8px"
            onmouseenter="this.style.background='rgba(119,68,255,.18)'"
            onmouseleave="this.style.background='rgba(119,68,255,.08)'">∿ CHECK</button>
        </div>
      </div>
      <div id="vl-coherence-result"></div>

      <!-- Existing alerts -->
      ${alerts.length ? `
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:10px">COHERENCE ALERTS (${alerts.length})</div>
        ${alerts.map(a => {
          const ac = a.type === 'contradiction' ? '#ff3355' : '#00ff88';
          return `
            <div style="padding:10px 14px;margin-bottom:7px;
              border-left:3px solid ${ac};background:${ac}0a">
              <div style="font-family:var(--f-display);font-size:7.5px;letter-spacing:1.5px;
                color:${ac};margin-bottom:5px">${a.type.toUpperCase()}</div>
              <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
                line-height:1.6">${escH(a.message)}</div>
              <div style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);
                margin-top:4px">${_vlTimeAgo(a.ts)}</div>
            </div>`;
        }).join('')}
      </div>` : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        No coherence alerts. Use the checker above or capture more nodes
        — the system will flag contradictions automatically.</div>`}

      <!-- Philosophy log summary -->
      ${VL_STATE.philosophyLog.length ? `
      <div>
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:10px">PHILOSOPHY LOG (${VL_STATE.philosophyLog.length})</div>
        ${VL_STATE.philosophyLog.slice(-8).reverse().map(p => `
          <div style="padding:9px 12px;margin-bottom:6px;background:rgba(0,0,0,.3);
            border-left:2px solid rgba(0,200,255,.3)">
            <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
              line-height:1.6">${escH(p.content)}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);
              margin-top:3px">${_vlTimeAgo(p.ts)}</div>
          </div>`).join('')}
      </div>` : ''}
    </div>
  `;
}

function vlCheckCoherence() {
  const input = document.getElementById('vl-coherence-input')?.value?.trim();
  if (!input) { mm_toast('Enter something to check', 'warn'); return; }
  const result = document.getElementById('vl-coherence-result');
  if (!result) return;

  // Simple keyword overlap check against philosophy log and existing nodes
  const inputWords = new Set(input.toLowerCase().split(/\W+/).filter(w => w.length > 4));
  let contradictions = [];
  let alignments = [];

  VL_STATE.nodes.slice(0, 100).forEach(n => {
    const nodeWords = new Set(n.content.toLowerCase().split(/\W+/).filter(w => w.length > 4));
    const overlap = [...inputWords].filter(w => nodeWords.has(w)).length;
    if (overlap >= 2) {
      // Check for negation patterns
      const negated = ['not', "don't", "won't", 'never', 'no longer', 'stopped'].some(neg =>
        input.toLowerCase().includes(neg) !== n.content.toLowerCase().includes(neg)
      );
      if (negated) contradictions.push(n);
      else alignments.push(n);
    }
  });

  if (!contradictions.length && !alignments.length) {
    result.innerHTML = `<div style="font-family:var(--f-mono);font-size:8px;
      color:var(--dim);padding:10px">No strong overlaps found in existing nodes.</div>`;
    return;
  }

  result.innerHTML = `
    ${contradictions.length ? `
    <div style="padding:12px 14px;margin-bottom:8px;background:rgba(255,51,85,.06);
      border:1px solid rgba(255,51,85,.3);border-left:3px solid #ff3355">
      <div style="font-family:var(--f-display);font-size:7.5px;letter-spacing:1.5px;
        color:#ff3355;margin-bottom:7px">⚠ POSSIBLE CONTRADICTIONS (${contradictions.length})</div>
      ${contradictions.slice(0,3).map(n => `<div style="font-family:var(--f-mono);font-size:8px;
        color:var(--muted);margin-bottom:5px;padding:5px 0;border-bottom:1px solid rgba(255,51,85,.1)">
        "${escH(n.content.slice(0,80))}"
        <span style="color:var(--wire2);font-size:7px"> — ${_vlTimeAgo(n.ts)}</span>
      </div>`).join('')}
    </div>` : ''}
    ${alignments.length ? `
    <div style="padding:12px 14px;background:rgba(0,255,136,.04);
      border:1px solid rgba(0,255,136,.2);border-left:3px solid #00ff88">
      <div style="font-family:var(--f-display);font-size:7.5px;letter-spacing:1.5px;
        color:#00ff88;margin-bottom:7px">✓ ALIGNMENTS (${alignments.length})</div>
      ${alignments.slice(0,3).map(n => `<div style="font-family:var(--f-mono);font-size:8px;
        color:var(--muted);margin-bottom:5px">"${escH(n.content.slice(0,80))}"</div>`).join('')}
    </div>` : ''}
  `;

  // Log alert
  if (contradictions.length) {
    VL_STATE.coherenceAlerts.push({
      id: uuid(), type: 'contradiction',
      message: `"${input.slice(0, 60)}" may contradict ${contradictions.length} existing node(s)`,
      relatedIds: contradictions.slice(0, 3).map(n => n.id),
      ts: Date.now(),
    });
    vlSave();
  }
}

// ── Utilities ─────────────────────────────────────────────────────
function _vlTimeAgo(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return Math.floor(d/60000) + 'm ago';
  if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
  if (d < 604800000) return Math.floor(d/86400000) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

console.log('[MASTERMIND] Voice Lattice + VCE loaded — capture, comprehend, route, track');
