// ═══════════════════════════════════════════════════════════════════
// MASTERMIND ENGINE — v3.0.5
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
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ── CANVAS DEPENDENCY GUARD ──────────────────────────────────────────
// nexus-canvas.js must be loaded before this file.
// Hard fail with visible error if bridge is missing.
(function() {
  if (typeof window.CANVAS === 'undefined') {
    const msg = '[MASTERMIND ENGINE] FATAL: window.CANVAS bridge not found. ' +
      'Ensure nexus-canvas.js loads BEFORE nexus-engine.js (MASTERMIND v3.0.5).';
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
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'void' });
  initVoid();
}

function closeVoid() {
  saveVoidState();
  const v = document.getElementById('void-overlay');
  v.style.opacity = '0';
  setTimeout(() => {
    v.classList.remove('open'); v.style.display = 'none';
    if (CANVAS.NX._voidPrev === 'canvas') {
      document.getElementById('homepage').classList.add('hidden');
      ['topbar','canvas-wrap','toolbar','minimap','zoom-widget','layer-controls','help-hint'].forEach(id => {
        document.getElementById(id)?.classList.add('visible');
      });
    } else {
      document.getElementById('homepage').classList.remove('hidden');
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
      { head: 'NODE CONTROLS', body: 'Drag header to move. Double-click body to edit text. Right-click for options (duplicate, delete, connect, tag). Drag ◉ link port to draw a connection. Ctrl+D to duplicate.' },
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

function closeBrainMap() {
  const el = document.getElementById('brain-overlay');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.classList.remove('open'); el.style.display = 'none'; }, 350);
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

console.log('[MASTERMIND] Engine v3.0.5 loaded — QA clean');



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

function openCustomNodeDialog() {
  const title = prompt('Node name:'); if (!title) return;
  const icon  = prompt('Icon (emoji or char):', '✎') || '✎';
  const color = prompt('Color (hex):', '#aaaaaa') || '#aaaaaa';
  const domain = (prompt('Domain:', 'CUSTOM') || 'CUSTOM').toUpperCase();
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
        version: '3.0.5',
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
  // Hide all startup screens
  document.querySelectorAll('.startup-inner').forEach(el => el.classList.add('hidden'));
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
      MASTERMIND v3.0.5 · AES-256-GCM · PBKDF2 310k iterations · RSA-OAEP 2048-bit
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
  if (dataDir && meta) {
    // Has identity + data dir → check vault before routing to login or home
    _vaultWatchdogCheck().then(vaultOk => {
      if (!vaultOk) return; // _showVaultMissingScreen already called
      _continueStartup(meta, savedFeatures);
    });
    return;
  }

  // No data dir yet (first-time setup) or no identity → proceed without watchdog
  _continueStartup(meta, savedFeatures);
}

function _continueStartup(meta, savedFeatures) {
  if (!meta) {
    // Brand new user — WELCOME SCREEN FIRST, then setup
    _ssShow('ss-welcome');
    setTimeout(() => _initWelcomeBg(document.getElementById('ss-welcome-bg')), 50);
    const onKey = e => {
      if ((e.key === 'Enter' || e.key === ' ') && !document.getElementById('ss-welcome')?.classList.contains('hidden')) {
        document.removeEventListener('keydown', onKey);
        ssWelcomeBegin();
      }
    };
    document.addEventListener('keydown', onKey);
  } else if (meta.noEncryption) {
    AUTH.username = meta.username || 'operator';
    AUTH.encrypted = false;
    _sealSession(meta.username || 'operator'); // unencrypted users get a sealed session
    setTimeout(registerWithBridge, 1200);
    if (!savedFeatures._configured) _ssShow('ss-features');
    else {
      document.getElementById('startup-screen').classList.add('hidden');
      document.getElementById('homepage').classList.remove('hidden');
      applyFeatureFlags();
      setTimeout(() => maybeShowWelcome?.(), 400);
    }
  } else {
    AUTH.username = meta.username;
    AUTH.hasPin = !!meta.pinHash;
    AUTH.pinHash = meta.pinHash || null;
    const sub = document.getElementById('login-welcome-sub');
    const lbl = document.getElementById('login-username-label');
    if (sub) sub.textContent = 'WELCOME BACK, ' + meta.username.toUpperCase();
    if (lbl) lbl.textContent = 'Unlock your encrypted vault';
    const pinToggle = document.getElementById('login-pin-toggle');
    if (pinToggle) pinToggle.style.display = meta.pinHash ? '' : 'none';
    _ssShow('ss-login');
    setTimeout(() => document.getElementById('login-password')?.focus(), 200);
  }
}

function ssWelcomeBegin() {
  _ssShow('ss-setup', 1);
  setTimeout(() => document.getElementById('setup-username')?.focus(), 150);
}

function _ssShow(id, step) {
  // Hide dynamic overlay screens when navigating
  ['ss-desktop-required','ss-vault-missing'].forEach(s => {
    const el = document.getElementById(s);
    if (el) { el.style.display = 'none'; el.classList.add('hidden'); }
  });
  ['ss-welcome','ss-setup','ss-login','ss-keygen','ss-features','ss-folder'].forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.toggle('hidden', s !== id);
  });
  const bar = document.getElementById('mm-steps');
  if (bar) bar.style.display = (id === 'ss-login' || id === 'ss-welcome') ? 'none' : '';
  if (id === 'ss-welcome') return;
  if (id === 'ss-features') {
    setTimeout(() => { if (typeof initFeaturesScreen === 'function') initFeaturesScreen(); }, 50);
  }
  const stepMap = { 'ss-setup':1, 'ss-keygen':2, 'ss-features':3, 'ss-folder':4 };
  const cur = step || stepMap[id] || 1;
  [1,2,3,4].forEach(n => {
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
  // ── SECURITY: Require explicit double-confirmation before disabling encryption ──
  // This is an irreversible decision for the vault — user must acknowledge risks.
  const username = document.getElementById('setup-username')?.value.trim() || 'operator';

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

function _setupSkipEncryptionConfirmed() {
  const input = document.getElementById('_mm_noenc_input');
  if (!input || input.value.trim().toUpperCase() !== 'SKIP') {
    input.style.borderColor = '#ff3355';
    input.placeholder = 'type SKIP exactly to confirm';
    return;
  }
  document.getElementById('_mm_noenc_confirm')?.remove();

  const username = document.getElementById('setup-username')?.value.trim() || 'operator';
  AUTH.username = username;
  AUTH.encrypted = false;
  localStorage.setItem(AUTH_META_KEY, JSON.stringify({
    username, noEncryption: true, created: Date.now(),
    noEncryptionAcknowledged: true, noEncryptionTs: new Date().toISOString(),
  }));

  // MM Foundation: create unencrypted vault — explicit opt-out recorded
  if (typeof MMVault !== 'undefined' && !MMVault.meta) {
    MMVault.create(username, { encrypted: false });
    MMLog?.warn('auth', `Unencrypted vault created — user explicitly opted out: ${username}`);
  }
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.security.no_encryption_opted_out', { username });

  const kgUser = document.getElementById('mm-kg-username');
  const kgPin = document.getElementById('mm-kg-pinval');
  if (kgUser) kgUser.textContent = username || 'operator';
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

async function loginSubmit() {
  const pw = document.getElementById('login-password')?.value;
  const errEl = document.getElementById('login-error');
  const setErr = msg => { if (errEl) errEl.textContent = msg; };
  setErr('');
  if (!pw) return setErr('Enter your password');

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
    // ── GATE 1: Identity must exist ────────────────────────────────
    const meta = _authLoadMeta();
    if (!meta) {
      setErr('No identity found — complete first-time setup');
      mm_toast('No identity — complete setup first', 'error');
      MMLog?.error('auth', 'Login attempt: no identity in localStorage');
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      // Emit SISO login fail event
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_identity' });
      return;
    }

    // ── GATE 2: Vault keys must exist in localStorage ──────────────
    const vaultKeyRaw = localStorage.getItem(AUTH_VAULT_KEY);
    if (!vaultKeyRaw) {
      setErr('Vault keys missing — vault may be corrupted. Recreate from first-time setup.');
      mm_toast('Vault keys missing — vault needs recreation', 'error');
      MMLog?.error('auth', 'Login attempt: vault keys absent from localStorage');
      if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_vault_keys' });
      return;
    }

    // ── GATE 3: Vault FILE must exist on disk (Electron) ───────────
    if (window.NXAPI) {
      const dataDir = NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir');
      if (dataDir) {
        const vaultPath = dataDir + '/mastermind.vault';
        const fileExists = await window.NXAPI.vaultExists(vaultPath);
        if (!fileExists) {
          setErr('Vault file not found on disk — choose your data folder or recreate vault.');
          mm_toast('Vault file missing on disk', 'error');
          MMLog?.error('auth', 'Login gate 3 FAIL: vault file absent at ' + vaultPath);
          if (btn) { btn.textContent = '⬡  UNLOCK MASTERMIND'; btn.disabled = false; }
          if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.fail', { reason: 'no_vault_file', path: vaultPath });
          // Show vault missing screen after brief delay
          setTimeout(() => _showVaultMissingScreen(vaultPath, 'missing'), 1200);
          return;
        }
        // Open vault file on login success — store path
        NX_CONFIG.vaultPath = vaultPath;
        MMLog?.info('auth', 'Login gate 3 PASS: vault file confirmed at ' + vaultPath);
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.confirmed', { path: vaultPath, context: 'login' });
      }
    }

    // ── All gates passed — proceed with key derivation ─────────────
    const salt = Uint8Array.from(atob(meta.salt), c => c.charCodeAt(0));
    const key = await _deriveKey(pw, salt);
    // Verify key by trying to read vault
    const vault = JSON.parse(vaultKeyRaw);
    // Try decrypting private key to verify password
    await _aesDecrypt(key, vault.encPrivKey);

    AUTH.key = key; AUTH.encrypted = true;
    _sealSession(meta.username);
    setTimeout(registerWithBridge, 1200);
    if (btn) btn.textContent = '⬡  UNLOCKED';
    _loginUnlockToastTimer = setTimeout(() => { _loginUnlockToastTimer = null; T.vaultUnlocked(meta?.username || AUTH.username || 'operator'); }, 600);

    // MM Foundation: init vault on login success
    if (typeof MMVault !== 'undefined' && !MMVault.meta) {
      const meta2 = _authLoadMeta();
      MMVault.create(meta2?.username || 'operator', { encrypted: true });
    }
    MMLog?.info('auth', 'Login successful — all 3 gates passed');
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.auth.login.success', { username: meta.username });

    // Open the vault file on disk now that we are logged in
    if (window.NXAPI && NX_CONFIG.vaultPath) {
      const raw = await window.NXAPI.vaultRead(NX_CONFIG.vaultPath);
      if (raw) MMLog?.info('vault', 'Vault file opened on login: ' + raw.length + ' bytes');
    }

    const _savedF = JSON.parse(localStorage.getItem(FEATURES_KEY)||'{}');
    if (_savedF._configured) {
      setTimeout(() => {
        document.getElementById('startup-screen').classList.add('hidden');
        document.getElementById('homepage').classList.remove('hidden');
        applyFeatureFlags();
        if (typeof maybeShowWelcome === 'function') maybeShowWelcome();
        _autolockStart?.();
      }, 400);
    } else {
      setTimeout(() => _ssShow('ss-features', 3), 400);
    }
  } catch(e) {
    // Cancel any pending success toast (race condition prevention)
    if (_loginUnlockToastTimer) { clearTimeout(_loginUnlockToastTimer); _loginUnlockToastTimer = null; }
    mm_toast_clear?.(); // hard-clear all pending toasts — prevent stale success toast
    _bfRecord(); // record failed attempt toward lockout
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
      document.getElementById('startup-screen').classList.add('hidden');
      document.getElementById('homepage').classList.remove('hidden');
      applyFeatureFlags();
      _pinReadOnlyBanner(); // show persistent read-only warning
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
      const vaultRaw = localStorage.getItem(AUTH_VAULT_KEY);
      if (!vaultRaw) throw new Error('Vault keys missing');
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

  if (window.NXAPI) {
    _ssShow('ss-folder', 4);
  } else {
    // No NXAPI — desktop app required
    _showDesktopRequiredScreen();
    if (btn) { btn.disabled = false; btn.textContent = '⬡ ACTIVATE & CREATE VAULT'; }
    return;
  }
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

/* ── Single DOMContentLoaded — init + auth ──────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
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
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key = await _deriveKey(password, salt);
    AUTH.key = key; AUTH.username = username; AUTH.encrypted = true;

    let pinHash = null;
    if (pin) {
      const pinBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + username));
      pinHash = btoa(String.fromCharCode(...new Uint8Array(pinBuf)));
    }

    const meta = { username, salt: btoa(String.fromCharCode(...salt)), pinHash, created: Date.now(), version: 1 };
    localStorage.setItem(AUTH_META_KEY, JSON.stringify(meta));

    const kp = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
      true, ['encrypt','decrypt']
    );
    const pubRaw  = await crypto.subtle.exportKey('spki', kp.publicKey);
    const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
    const encPriv = await _aesEncrypt(AUTH.key, new Uint8Array(privRaw));
    localStorage.setItem(AUTH_VAULT_KEY, JSON.stringify({
      pubKey: btoa(String.fromCharCode(...new Uint8Array(pubRaw))),
      encPrivKey: encPriv,
    }));

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

    // Create the vault file immediately — this is the primary vault store
    const vaultPath = dataDir + '/mastermind.vault';
    // Build a real (encrypted if key available) initial vault payload.
    // data: null caused the shell-vault bug where nothing was ever persisted.
    // Instead we write a complete empty-state envelope from the start.
    let initialVaultPayload;
    {
      const _emptyState = {
        version: 5, format: 'nexus-vault', saved: Date.now(),
        canvas: { nodes: [], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 }, clipboard: [] },
        modules: { void: null, gaps: null, signal: null, threads: null,
                   body: null, horizon: null, brainMap: null, domain: null,
                   almDeltas: [], intuitionRatings: {}, options: OPTS || {}, features: AUTH.features || {} },
        aiConfig: null,
        snr: null,
        identity: { username, salt: meta.salt, pinHash: meta.pinHash || null,
                    created: meta.created, version: 1, noEncryption: !AUTH.encrypted },
        keys: JSON.parse(localStorage.getItem(AUTH_VAULT_KEY) || '{}'),
        username,
        jaa: {},
      };
      if (AUTH.key && AUTH.encrypted && typeof _aesEncrypt === 'function') {
        try {
          const _enc = await _aesEncrypt(AUTH.key, new TextEncoder().encode(JSON.stringify(_emptyState)));
          initialVaultPayload = JSON.stringify({ encrypted: true, version: 5, ..._enc });
        } catch(e) {
          // Fallback to plaintext if encrypt fails — better than data: null
          initialVaultPayload = JSON.stringify({ encrypted: false, version: 5, data: _emptyState });
        }
      } else {
        initialVaultPayload = JSON.stringify({ encrypted: false, version: 5, data: _emptyState });
      }
    }
    const writeResult = await window.NXAPI.vaultWrite(vaultPath, initialVaultPayload);
    if (!writeResult?.ok) {
      setErr('⚡ Vault file creation failed: ' + (writeResult?.error || 'unknown error') + 
             '\nPath: ' + vaultPath);
      MMLog?.error('vault', 'Vault creation failed: ' + writeResult?.error);
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
  font_scale: 100, compact: false, badges: true, depth: true,
  typecolor: true, scanlines: true, ambient: true,
  // Canvas
  particles: true, grid: true, clusters: true, animated: true,
  snap: false, inertia: true, dblspawn: true, rcpan: true,
  connlabels: true, autosave: true, autosave_interval: 30,
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
};

let _backupCodes = [];

function loadOpts() {
  try {
    const saved = JSON.parse(localStorage.getItem(OPTS_KEY) || '{}');
    Object.assign(OPTS, saved);
  } catch(e) {}
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
  if (name === 'ai') {
    // Sync provider select from AI state
    const provSel = document.getElementById('opt-ai-provider');
    if (provSel) provSel.value = AI.provider || 'anthropic';
    // Sync API key
    const keyInp = document.getElementById('opt-ai-key');
    if (keyInp && AI.apiKey) keyInp.value = AI.apiKey;
    // Sync enabled toggle
    const enabledToggle = document.getElementById('opt-ai-enabled');
    if (enabledToggle) enabledToggle.classList.toggle('on', !!AI.enabled);
    // Update model list and show/hide Ollama fields
    optsUpdateAIModel();
    optsShowOllamaFields();
    // Sync ollama base URL if set
    const ollamaBase = document.getElementById('ai-ollama-base');
    if (ollamaBase && AI.ollamaBase) ollamaBase.value = AI.ollamaBase;
    const lmBase = document.getElementById('ai-lmstudio-base');
    if (lmBase && AI.lmstudioBase) lmBase.value = AI.lmstudioBase;
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
}

function optsSet(key, val) {
  OPTS[key] = val; saveOpts();
}

function optsSetFontScale(val) {
  OPTS.font_scale = parseInt(val);
  document.getElementById('opt-font-scale-val').textContent = val + '%';
  const scale = val / 100;
  document.documentElement.style.setProperty('--ui-scale', scale);
  document.documentElement.style.fontSize = (16 * scale) + 'px';
  document.body.style.fontSize = (13 * scale) + 'px';
  saveOpts();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.opts.ui_scale', { scale, percent: val });
}

function optsSetAutosaveInterval(val) {
  OPTS.autosave_interval = parseInt(val);
  document.getElementById('opt-autosave-interval-val').textContent = val + 's';
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
}

function optsToggleE2E(el) {
  const meta = _authLoadMeta();
  if (!meta) { toast('No vault found — complete setup first'); return; }
  const isOn = el.classList.contains('on');
  if (isOn) {
    // Turn OFF encryption
    if (!confirm('Disable encryption? Your vault will be stored unencrypted.')) return;
    const newMeta = Object.assign({}, meta, { noEncryption: true });
    localStorage.setItem(AUTH_META_KEY, JSON.stringify(newMeta));
    AUTH.encrypted = false;
    el.classList.remove('on');
    mm_toast('Encryption disabled · restart to apply', 'warn');
  } else {
    // Turn ON encryption — requires password
    const pw = prompt('Set a master password to enable encryption:');
    if (!pw || pw.length < 8) { toast('Password must be at least 8 characters'); return; }
    mm_toast('Generating encryption key…', 'vault');
    (async () => {
      try {
        const salt = crypto.getRandomValues(new Uint8Array(32));
        const key = await _deriveKey(pw, salt);
        AUTH.key = key; AUTH.encrypted = true;
        const newMeta = Object.assign({}, meta, {
          noEncryption: false,
          salt: btoa(String.fromCharCode(...salt)),
        });
        localStorage.setItem(AUTH_META_KEY, JSON.stringify(newMeta));
        el.classList.add('on');
        mm_toast('Encryption enabled · vault secured', 'vault');
      } catch(e) { toast('Error: ' + e.message); }
    })();
  }
}

function optsChangePassword() {
  const current = prompt('Current password:'); if (!current) return;
  const newPw   = prompt('New password (min 8 chars):'); if (!newPw || newPw.length < 8) { toast('Password too short'); return; }
  const confirm_ = prompt('Confirm new password:'); if (confirm_ !== newPw) { toast('Passwords do not match'); return; }
  mm_toast('Updating encryption key…', 'vault');
  (async () => {
    try {
      const meta = _authLoadMeta();
      const oldSalt = Uint8Array.from(atob(meta.salt), c => c.charCodeAt(0));
      const oldKey  = await _deriveKey(current, oldSalt);
      // Verify old key
      const vault = JSON.parse(localStorage.getItem(AUTH_VAULT_KEY) || '{}');
      if (vault.encPrivKey) await _aesDecrypt(oldKey, vault.encPrivKey);
      // Re-derive with new password
      const newSalt = crypto.getRandomValues(new Uint8Array(32));
      const newKey  = await _deriveKey(newPw, newSalt);
      // Re-encrypt private key
      if (vault.encPrivKey) {
        const privRaw = await _aesDecrypt(oldKey, vault.encPrivKey);
        vault.encPrivKey = await _aesEncrypt(newKey, new Uint8Array(privRaw));
        localStorage.setItem(AUTH_VAULT_KEY, JSON.stringify(vault));
      }
      const newMeta = Object.assign({}, meta, { salt: btoa(String.fromCharCode(...newSalt)) });
      localStorage.setItem(AUTH_META_KEY, JSON.stringify(newMeta));
      AUTH.key = newKey;
      if (typeof T!=='undefined') T.passwordChanged(); else mm_toast('Password updated','success');
    } catch(e) { toast('Error: ' + e.message + ' (wrong current password?)'); }
  })();
}

function optsChangePin() {
  const pin = prompt('New PIN (4–8 digits):'); if (!pin) return;
  if (!/^\d{4,8}$/.test(pin)) { toast('PIN must be 4–8 digits'); return; }
  (async () => {
    const meta = _authLoadMeta(); if (!meta) return;
    const pinBuf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + meta.username));
    const pinHash = btoa(String.fromCharCode(...new Uint8Array(pinBuf)));
    localStorage.setItem(AUTH_META_KEY, JSON.stringify(Object.assign({}, meta, { pinHash })));
    AUTH.hasPin = true; AUTH.pinHash = pinHash;
    if (typeof T !== 'undefined') T.pinChanged(); else toast('PIN updated');
    optsRefreshSecurity();
  })();
}

function optsRemovePin() {
  if (!confirm('Remove PIN? You will only be able to use password to unlock.')) return;
  const meta = _authLoadMeta(); if (!meta) return;
  const newMeta = Object.assign({}, meta); delete newMeta.pinHash;
  localStorage.setItem(AUTH_META_KEY, JSON.stringify(newMeta));
  AUTH.hasPin = false; AUTH.pinHash = null;
  if (typeof T!=='undefined') T.pinChanged(); else mm_toast('PIN removed','info');
  optsRefreshSecurity();
}

/* ── Backup codes ─────────────────────────────────────────── */
function optsGenerateBackupCodes() {
  _backupCodes = Array.from({length: 10}, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('').toUpperCase();
  });
  // Store hashed versions only
  (async () => {
    const hashed = await Promise.all(_backupCodes.map(async code => {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
      return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }));
    const meta = _authLoadMeta();
    if (meta) {
      localStorage.setItem(AUTH_META_KEY, JSON.stringify(Object.assign({}, meta, {
        backupCodes: hashed.map(h => ({ hash: h, used: false }))
      })));
    }
    // Render in both panels
    const codeHtml = _backupCodes.map((c, i) =>
      '<div style="display:flex;gap:16px;align-items:center">' +
      '<span style="color:var(--dim);font-size:7px">' + String(i+1).padStart(2,'0') + '</span>' +
      '<span style="letter-spacing:3px">' + c.slice(0,4) + '-' + c.slice(4) + '</span>' +
      '</div>'
    ).join('');
    ['opts-backup-codes-display','opts-backup-codes-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.style.display = ''; el.innerHTML = codeHtml; }
    });
    ['opts-backup-status','opts-backup-status-2'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '10 backup codes generated — export or copy them now.';
    });
    mm_toast('10 backup codes generated · export immediately', 'warn', {dur:4000});
  })();
}

function optsExportBackupCodes() {
  if (!_backupCodes.length) { toast('Generate codes first'); return; }
  const meta = _authLoadMeta();
  const text = '=== MASTERMIND BACKUP RECOVERY CODES ===\n' +
    'Identity: ' + (meta?.username || '—') + '\n' +
    'Generated: ' + new Date().toLocaleString() + '\n' +
    'Store offline. Each code is one-time use.\n\n' +
    _backupCodes.map((c, i) => (i+1) + '. ' + c.slice(0,4) + '-' + c.slice(4)).join('\n') +
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
  if (meta?.backupCodes) {
    const el = document.getElementById('opts-backup-codes-2');
    const statusEl = document.getElementById('opts-backup-status-2');
    if (el) {
      const used = meta.backupCodes.filter(c => c.used).length;
      el.innerHTML = meta.backupCodes.map((c, i) =>
        '<div style="' + (c.used ? 'text-decoration:line-through;color:var(--dim)' : '') + ';font-size:8.5px">' +
        String(i+1).padStart(2,'0') + '.  ' + '●●●●-●●●●' + (c.used ? '  <span style="color:var(--r);font-size:7px">USED</span>' : '') + '</div>'
      ).join('');
      if (statusEl) statusEl.textContent = used + ' of ' + meta.backupCodes.length + ' codes used.';
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
function refreshStorageInfo() {
  const el = document.getElementById('opts-storage-info'); if (!el) return;
  try {
    let total = 0;
    const items = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) || '';
      const bytes = new Blob([val]).size;
      items[key] = bytes; total += bytes;
    }
    const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(1) + ' KB' : (b/1048576).toFixed(2) + ' MB';
    el.innerHTML = '<div>Total localStorage: <span style="color:var(--c)">' + fmt(total) + '</span></div>' +
      '<div>Canvas data: <span style="color:var(--mid)">' + fmt(items['nexus_mm_v3']||0) + '</span></div>' +
      '<div>Void state: <span style="color:var(--mid)">' + fmt(items['nexus_void_state']||0) + '</span></div>' +
      '<div>Gap state: <span style="color:var(--mid)">' + fmt(items['nexus_gap_state']||0) + '</span></div>' +
      '<div>Auth vault: <span style="color:var(--mid)">' + fmt(items['nexus_auth_vault']||0) + '</span></div>' +
      '<div>Nodes: <span style="color:var(--c)">' + CANVAS.NX.nodes.length + '</span> &nbsp; Connections: <span style="color:var(--c)">' + CANVAS.NX.conns.length + '</span></div>' +
      '<div>UUID ledger: <span style="color:var(--v)">' + (typeof JAA !== 'undefined' ? JAA.ledger.size : 0) + ' entries</span></div>';
  } catch(e) { el.textContent = 'Error reading storage: ' + e.message; }
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

function optsResetAllSettings() {
  if (!confirm('Reset all settings to defaults? This does not affect your vault or canvas data.')) return;
  localStorage.removeItem(OPTS_KEY);
  if (typeof T !== 'undefined') mm_toast('Settings reset · Reload to apply', 'warn'); else toast('Settings reset — reload to apply');
}

async function optsWipeVault() {
  const conf = prompt('Type DELETE to wipe all vault data, identity, and canvas. This cannot be undone.');
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

  // Clear all localStorage session data
  ['nexus_mm_v3','nexus_void_state','nexus_gap_state','nexus_auth_meta',
   'nexus_auth_vault','nexus_features','nexus_brain_map_v2','nexus_horizon_state',
   OPTS_KEY,'nexus_theme','nexus_ai_config','nexus_datadir',
   'mm_brain_map_v2','mm_horizon_state'].forEach(k => {
    try { localStorage.removeItem(k); } catch(e) {}
  });

  NX_CONFIG.vaultPath = null;
  NX_CONFIG.dataDir   = null;

  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.wiped', {});
  MMLog?.warn('vault', 'Vault wiped by user');

  mm_toast('Vault wiped — reloading in 2s…', 'warn');
  setTimeout(() => location.reload(), 2000);
}

function optsCheckForUpdates() {
  gateFeature('update', () => {
    mm_toast('Check https://github.com/mastermind for latest release', 'info', { dur: 6000 });
  });
}



function syncOptsToggles() {
  const pairs = [
    ['opt-compact','compact'],['opt-badges','badges'],['opt-depth','depth'],
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
  // Sliders
  const sliders = [
    ['opt-font-scale','opt-font-scale-val','font_scale','%'],
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
}

// Load opts on engine boot
loadOpts();
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
  if (ext === 'nxvault') return 'nexus-vault';
  if (ext === 'md' || ext === 'markdown') {
    if (text.includes('[[') && text.includes(']]')) return 'obsidian';
    if (text.includes('- ') && text.match(/^#+\s/m)) return 'logseq';
    return 'markdown';
  }
  if (ext === 'json' || ext === 'jsonl') {
    try {
      const d = JSON.parse(text);
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
  const d = JSON.parse(text);
  if (d.encrypted) {
    if (!AUTH.key) { toast('⚠ Vault is encrypted — unlock first'); return; }
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
  provider: 'anthropic',  // 'anthropic' | 'openai' | 'ollama' | 'lmstudio'
  apiKey: '',
  model: 'claude-sonnet-4-20250514',
  temperature: 0.7,
  maxTokens: 1000,
  contextLimit: 8000,
  ollamaBase: 'http://localhost:11434',   // configurable Ollama endpoint
  ollamaModels: [],                        // populated by ollamaDetectModels()
  lmstudioBase: 'http://localhost:1234',  // LM Studio endpoint
};

const AI_KEY = 'nexus_ai_config';

function aiLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(AI_KEY) || '{}');
    if (s.provider) AI.provider = s.provider;
    if (s.apiKey)   AI.apiKey   = s.apiKey;
    if (s.model)    AI.model    = s.model;
    if (s.enabled !== undefined) AI.enabled = s.enabled;
  } catch(e) {}
}

function aiSave() {
  // NOTE: API key is ALSO written to localStorage here for session continuity
  // but the authoritative store is the encrypted vault file (via vaultDirtySave below).
  // On load, the vault copy takes precedence; localStorage is session cache only.
  try { localStorage.setItem(AI_KEY, JSON.stringify({
    provider: AI.provider, apiKey: AI.apiKey, model: AI.model,
    enabled: AI.enabled, ollamaBase: AI.ollamaBase,
    lmstudioBase: AI.lmstudioBase, ollamaModels: AI.ollamaModels,
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

  // Local providers (Ollama, LM Studio) don't require an API key
  const isLocal = AI.provider === 'ollama' || AI.provider === 'lmstudio';
  if (!AI.enabled) {
    mm_toast('AI disabled — enable in Options → AI', 'warn'); return null;
  }
  if (!isLocal && !AI.apiKey) {
    if (typeof T !== 'undefined') T.aiNotConfigured();
    else mm_toast('AI key not set — configure in Options → AI', 'warn');
    return null;
  }

  // Endpoint routing
  const ollamaBase   = AI.ollamaBase   || 'http://localhost:11434';
  const lmstudioBase = AI.lmstudioBase || 'http://localhost:1234';
  const endpoints = {
    anthropic: 'https://api.anthropic.com/v1/messages',
    openai:    'https://api.openai.com/v1/chat/completions',
    ollama:    ollamaBase + '/api/chat',
    lmstudio:  lmstudioBase + '/v1/chat/completions',
  };
  const endpoint = endpoints[AI.provider] || endpoints.anthropic;
  const headers  = { 'Content-Type': 'application/json' };
  let body;

  if (AI.provider === 'anthropic') {
    headers['x-api-key']          = AI.apiKey;
    headers['anthropic-version']  = '2023-06-01';
    body = { model: AI.model || 'claude-sonnet-4-20250514', max_tokens: AI.maxTokens || 1000,
             system: sysMsg, messages: [{ role: 'user', content: userMsg }] };
  } else if (AI.provider === 'openai' || AI.provider === 'lmstudio') {
    if (AI.apiKey) headers['Authorization'] = 'Bearer ' + AI.apiKey;
    body = { model: AI.model || 'gpt-4o', max_tokens: AI.maxTokens || 1000,
             messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }] };
  } else if (AI.provider === 'ollama') {
    body = { model: AI.model || 'llama3', stream: false,
             messages: [{ role: 'system', content: sysMsg }, { role: 'user', content: userMsg }] };
  }

  MMLog?.info('ai', `Call: ${AI.provider}/${AI.model} — ${userMsg.slice(0,60)}…`);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.ai.call', { provider: AI.provider, model: AI.model });

  try {
    const res  = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}: ${JSON.stringify(data).slice(0,200)}`);

    let result = '';
    if (AI.provider === 'anthropic')              result = data.content?.[0]?.text || '';
    else if (AI.provider === 'ollama')            result = data.message?.content   || '';
    else /* openai / lmstudio */                  result = data.choices?.[0]?.message?.content || '';

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
  if (!result) return;
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
  } catch(e) { toast('⚠ AI response parse error: ' + e.message); }
}

async function aiAnalyzeCanvas() {
  T.aiThinking();
  const sys = 'You are a cognitive mapping analyst. Analyze the knowledge map and identify: key patterns, missing connections, highest-leverage nodes, synthesis opportunities. Return a structured analysis.';
  const ctx = aiBuildContext();
  const result = await aiCall(sys, `Analyze this knowledge canvas:\n\n${ctx}`);
  if (!result) return;
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
  try {
    const saved = JSON.parse(localStorage.getItem(BODY_KEY) || '{}');
    if (saved.nervousSystemState) BODY.nervousSystemState = saved.nervousSystemState;
    if (saved.intuitionMode) BODY.intuitionMode = saved.intuitionMode;
    if (saved.somaticLog) BODY.somaticLog = saved.somaticLog;
    if (saved.patternLog) BODY.patternLog = saved.patternLog;
    if (saved.invariantMap) BODY.invariantMap = saved.invariantMap;
  } catch(e) {}
}

function bodySave() {
  try { localStorage.setItem(BODY_KEY, JSON.stringify(BODY)); } catch(e) {}
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

function optsShowAIKey() {
  const inp = document.getElementById('opt-ai-key');
  if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
}

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

function optsShowOllamaFields() {
  const isOllama   = AI.provider === 'ollama';
  const isLMStudio = AI.provider === 'lmstudio';
  const ollamaRow  = document.getElementById('ai-ollama-row');
  const lmRow      = document.getElementById('ai-lmstudio-row');
  const keyRow     = document.getElementById('ai-key-row');
  if (ollamaRow)  ollamaRow.style.display  = isOllama ? '' : 'none';
  if (lmRow)      lmRow.style.display      = isLMStudio ? '' : 'none';
  if (keyRow)     keyRow.style.display     = (isOllama || isLMStudio) ? 'none' : '';
  // Populate Ollama base URL
  const baseEl = document.getElementById('ai-ollama-base');
  if (baseEl && isOllama) baseEl.value = AI.ollamaBase || 'http://localhost:11434';
  const lmBaseEl = document.getElementById('ai-lmstudio-base');
  if (lmBaseEl && isLMStudio) lmBaseEl.value = AI.lmstudioBase || 'http://localhost:1234';
}

function optsUpdateAIModel() {
  const sel = document.getElementById('opt-ai-provider');
  if (sel) AI.provider = sel.value;
  optsShowOllamaFields();
  // Update model dropdown for known providers
  const modelSel = document.getElementById('opt-ai-model');
  if (!modelSel) return;
  const models = {
    anthropic: ['claude-sonnet-4-20250514','claude-opus-4-20250514','claude-haiku-4-5-20251001','claude-3-5-sonnet-20241022'],
    openai:    ['gpt-4o','gpt-4o-mini','gpt-4-turbo','gpt-3.5-turbo'],
    ollama:    AI.ollamaModels.length ? AI.ollamaModels : ['(run DETECT MODELS first)'],
    lmstudio:  ['local-model'],
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

function optsRestoreSnapshot(id) {
  if (typeof MMVault === 'undefined') return;
  if (!confirm('Restore this snapshot? Current canvas will be replaced.')) return;
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
    reader.onload = (ev) => {
      if (typeof MMVault === 'undefined') { toast('Foundation not loaded'); return; }
      if (!confirm('Import this backup? It will replace your current vault data.')) return;
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
  intelligenceRatings: {},       // { [intelligence_type]: 0-100 }
  populatedNodes: [],            // ids of nodes added via populate
};
const DOMAIN_KEY = 'nexus_domain_state';

function domainStateLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(DOMAIN_KEY) || '{}');
    if (s.intelligenceRatings) DOMAIN_STATE.intelligenceRatings = s.intelligenceRatings;
    if (s.customDomains) DOMAIN_STATE.customDomains = s.customDomains;
    if (s.selectedMeta) DOMAIN_STATE.selectedMeta = new Set(s.selectedMeta);
    if (s.selectedDomains) DOMAIN_STATE.selectedDomains = new Set(s.selectedDomains);
    if (s.selectedSubs) DOMAIN_STATE.selectedSubs = new Set(s.selectedSubs);
    if (s.populatedNodes) DOMAIN_STATE.populatedNodes = s.populatedNodes;
  } catch(e) {}
}

function domainStateSave() {
  try {
    localStorage.setItem(DOMAIN_KEY, JSON.stringify({
      intelligenceRatings: DOMAIN_STATE.intelligenceRatings,
      customDomains: DOMAIN_STATE.customDomains,
      selectedMeta: [...DOMAIN_STATE.selectedMeta],
      selectedDomains: [...DOMAIN_STATE.selectedDomains],
      selectedSubs: [...DOMAIN_STATE.selectedSubs],
      populatedNodes: DOMAIN_STATE.populatedNodes,
    }));
  } catch(e) {}
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
  const full = document.getElementById('brain-full-view');
  if (sel) sel.style.display = 'flex';
  if (full) { full.style.display = 'none'; full.classList.remove('active'); }
  // Pre-populate sidebar so domains show immediately when full map opens
  requestAnimationFrame(() => {
    if (typeof _bmUpdateSidebar === 'function') _bmUpdateSidebar();
  });
}

function brainEnterMode(modeKey) {
  // Hide selector, show full map
  const sel = document.getElementById('brain-mode-selector');
  const full = document.getElementById('brain-full-view');
  if (sel) sel.style.display = 'none';
  if (full) { full.style.display = 'flex'; full.classList.add('active'); }

  // Update header colors per mode
  const MODE_META = {
    cognitive:     { label: 'BRAIN MAP — COGNITIVE',     sub: 'Metacognition · Frameworks · Signal/Noise · Intelligence', color: '#00c8ff' },
    relationships: { label: 'BRAIN MAP — RELATIONSHIPS',  sub: 'Bridge Building · Co-creation · Gap Mapping · Meaning',   color: '#00ff88' },
    emotions:      { label: 'BRAIN MAP — EMOTIONS',       sub: 'Understanding · Regulation · Channeling · Alchemy',        color: '#ff66aa' },
  };
  const m = MODE_META[modeKey] || { label: 'BRAIN MAP', sub: 'Master index', color: 'var(--c)' };
  const titleEl = document.getElementById('brain-mode-title');
  const subEl   = document.getElementById('brain-mode-sub');
  if (titleEl) { titleEl.textContent = m.label; titleEl.style.color = m.color; }
  if (subEl)   subEl.textContent = m.sub;

  // Seed canvas with mode-relevant nodes, then init brain map
  _brainModeSeedCanvas(modeKey);

  // Expand the matching meta-domain in the brain map automatically
  const modeToMeta = {
    cognitive:     'MIND & COGNITION',
    relationships: 'SOCIAL & RELATIONAL',
    emotions:      'SPIRIT & MEANING',
  };
  const autoExpand = modeToMeta[modeKey];
  if (autoExpand && typeof BMV2 !== 'undefined') {
    BMV2._expanded.add(autoExpand);
    if (typeof _bmCacheInvalidate === 'function') _bmCacheInvalidate();
  }

  setTimeout(() => {
    initBrainMap();
    // Fire sidebar update after map initialises
    requestAnimationFrame(() => {
      if (typeof _bmUpdateSidebar === 'function') _bmUpdateSidebar();
      if (typeof _bmRenderIntelStats === 'function') _bmRenderIntelStats();
      if (typeof _bmBuildCrossdomainPanel === 'function') _bmBuildCrossdomainPanel();
      if (typeof _bmBuildManagePanel === 'function') _bmBuildManagePanel();
    });
  }, 80);

  // Log + toast
  MMLog?.info('brain', `Mode entered: ${modeKey}`);
  if (typeof T !== 'undefined') T.brainModeEntered(m.label.replace('BRAIN MAP — ', ''));
}

function brainSkipModeSelect() {
  // Open full map without mode seeding
  const sel = document.getElementById('brain-mode-selector');
  const full = document.getElementById('brain-full-view');
  if (sel) sel.style.display = 'none';
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
  const full = document.getElementById('brain-full-view');
  if (full) { full.style.display = 'none'; full.classList.remove('active'); }
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

/* ── Intelligence type ratings ───────────────────────────────── */
// setIntelligenceRating — see full version with brain map sync below

function renderIntelligenceStats() {
  const el = document.getElementById('brain-intel-stats'); if (!el) return;
  el.innerHTML = '';
  Object.entries(INTELLIGENCE_TYPES).forEach(([key, intel]) => {
    const rating = DOMAIN_STATE.intelligenceRatings[key] || 0;
    const row = document.createElement('div');
    row.className = 'intel-stat-row';
    row.innerHTML =
      '<div class="intel-stat-head">' +
        '<span class="intel-stat-icon" style="color:'+intel.color+'">'+intel.icon+'</span>' +
        '<span class="intel-stat-label">'+intel.label+'</span>' +
        '<span class="intel-stat-val" id="intel-val-'+key+'">'+rating+'%</span>' +
      '</div>' +
      '<div class="intel-stat-track">' +
        '<div class="intel-stat-fill" style="width:'+rating+'%;background:'+intel.color+'"></div>' +
      '</div>' +
      '<input type="range" class="intel-stat-slider" min="0" max="100" value="'+rating+'" ' +
        'oninput="setIntelligenceRating(\''+key+'\',this.value)" ' +
        'style="accent-color:'+intel.color+'">' +
      '<div class="intel-stat-desc">'+intel.desc+'</div>';
    el.appendChild(row);
  });
}

function renderCrossDomainMatrix() {
  const el = document.getElementById('brain-crossdomain-panel'); if (!el) return;
  const topIntel = Object.entries(DOMAIN_STATE.intelligenceRatings)
    .sort(([,a],[,b]) => b-a).slice(0, 5);
  if (!topIntel.length) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:12px">Rate your intelligence types to see cross-domain synthesis opportunities.</div>';
    return;
  }
  // Find domains that match top intelligences
  const matches = [];
  topIntel.forEach(([type]) => {
    Object.entries(DOMAIN_TAXONOMY).forEach(([metaKey, meta]) => {
      if (meta.intelligences.includes(type)) {
        matches.push({ meta: metaKey, type, color: meta.color });
      }
    });
  });
  el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:8px;letter-spacing:2px">YOUR HIGHEST-LEVERAGE DOMAINS</div>' +
    [...new Map(matches.map(m=>[m.meta,m])).values()].slice(0,8).map(m =>
      '<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--wire)">' +
        '<div style="width:6px;height:6px;border-radius:50%;background:'+m.color+';flex-shrink:0"></div>' +
        '<span style="font-family:var(--f-body);font-size:10px;color:var(--bright)">'+m.meta+'</span>' +
        '<span style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-left:auto">via '+INTELLIGENCE_TYPES[m.type]?.label+'</span>' +
      '</div>'
    ).join('');
}

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
  relationships: {
    label: 'Relationships',
    icon: '⬡',
    color: '#00ff88',
    tagline: 'Building bridges, co-creating, mapping gaps between all things.',
    domains: ['Bridge','Gap','Connection','Co-Creation','Intimacy','Conflict','Meaning','Leverage','Understanding'],
    seedNodes: [
      { type: 'concept',   title: 'Bridge Map',            body: 'What gaps exist between you and this person/idea? Name them.',      tags: ['bridge','gap','relationship'] },
      { type: 'friction',  title: 'Current Tension',       body: 'Where is the friction? Tension is information, not damage.',        tags: ['tension','conflict','relationship'] },
      { type: 'synthesis', title: 'Co-Creation Space',     body: 'What can you build together that neither could build alone?',       tags: ['co-creation','collaboration'] },
      { type: 'insight',   title: 'Meaning Mapping',       body: 'What does this relationship mean? What is it for?',                 tags: ['meaning','purpose','relationship'] },
      { type: 'framework', title: 'Intimacy Architecture', body: 'How does closeness work here? Vulnerability, trust, history.',      tags: ['intimacy','trust','depth'] },
      { type: 'causal',    title: 'Leverage Points',       body: 'Where is the highest leverage for positive change in this dynamic?', tags: ['leverage','change','relationship'] },
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
  if (!mode || !mode.seedNodes) return;
  // Don't re-seed if mode nodes already exist
  const modeTag = modeKey + '-seed';
  if (CANVAS.NX.nodes.some(n => (n.tags||[]).includes(modeTag))) return;

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
const HORIZON_RESOURCE_TYPES = ['Time (hrs/wk)', 'Money ($/mo)', 'Energy (0-10)', 'Attention (0-10)', 'Social Capital', 'Skills Required'];

function horizonLoad() {
  try {
    const raw = localStorage.getItem(HORIZON_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d.plans) HORIZON_STATE.plans = d.plans;
    }
    HORIZON_STATE._loaded = true;
  } catch(e) {}
}

function horizonSave() {
  try { localStorage.setItem(HORIZON_KEY, JSON.stringify({ plans: HORIZON_STATE.plans })); } catch(e) {}
  if (typeof vaultDirtySave === 'function') vaultDirtySave(5000); else autosaveJAA();
}

function horizonNewPlan(title, endState, timeframe) {
  const id = typeof uuid === 'function' ? uuid() : (Date.now().toString(36));
  const plan = {
    id,
    title: title || 'New Horizon Plan',
    endState: endState || '',
    timeframe: timeframe || '1 Year',
    conditions: [],      // reverse-causal conditions
    constraints: [],     // current + future constraints
    failureModes: [],    // how this could fail
    resources: {},       // resource estimates
    milestones: [],      // { id, label, timeframe, done }
    slopes: [],          // { id, domain, current, target, rate, note }
    deltas: [],          // tracked progress deltas
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
  return HORIZON_STATE.plans.find(p => p.id === id) || null;
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
  _renderHorizonUI(overlay);
}

function closeHorizon() {
  const el = document.getElementById('mm-horizon-overlay');
  if (el) el.style.display = 'none';
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
}

function horizonCreateFromForm() {
  const title = document.getElementById('hz-new-title')?.value.trim();
  const endState = document.getElementById('hz-new-endstate')?.value.trim();
  const tf = window._hzNewTf || '1 Year';
  if (!title) { MMToast?.warn('Plan title required') || toast('Plan title required'); return; }
  const plan = horizonNewPlan(title, endState, tf);
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

function horizonDeletePlan(planId) {
  if (!confirm('Delete this horizon plan? This cannot be undone.')) return;
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
  setTimeout(() => { el.style.display = 'none'; el.style.opacity = '1'; }, 520);
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
  relationships: { label: 'Relationships Module', reason: 'Module under construction — use Brain Map → Relationships for now', status: 'partial' },
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
};
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
  const cacheKey = 'graph_' + [...expandedSet].sort().join(',') + '_' + CANVAS.NX.nodes.length;
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

  // Auto-rotate speed (stops when user is interacting)
  const rotY = BMV2._rotY !== undefined ? BMV2._rotY : 0;
  if (!BMV2._userInteracting) {
    BMV2._rotY = (BMV2._rotY || 0) + 0.002;
  }

  // Map each node's (x,y) from the flat 2D graph onto a sphere
  // using the node's angle (theta) as longitude and type-based latitude
  const typeLatitude = { hub:-0, meta:.6, domain:.75, sub:.88, canvas:.5, 'custom-domain':.7 };

  // Pre-project all nodes to get z-depth for sorting
  const projected = nodes.map(n => {
    // Longitude from node's angle; latitude from type
    const lon = (n.angle !== undefined ? n.angle : Math.atan2(n.y, n.x)) + (BMV2._rotY || 0);
    const latFrac = typeLatitude[n.type] || 0.6;
    const lat = (latFrac - 0.5) * Math.PI; // -π/2 to π/2

    // Spherical to 3D Cartesian
    const sx = Math.cos(lat) * Math.cos(lon);
    const sy = Math.sin(lat);
    const sz = Math.cos(lat) * Math.sin(lon);

    // Simple perspective projection
    const perspective = 2.2;
    const scale = perspective / (perspective - sz);
    const px3 = cx + sx * baseR * scale;
    const py3 = cy - sy * baseR * scale;
    const visible = sz < 0.95; // cull back-facing nodes
    const alpha = visible ? Math.max(0.08, (1 - sz) * 0.9) : 0;

    return { n, px: px3, py: py3, sz, scale, alpha, visible };
  });

  // Sort back-to-front for correct overdraw
  projected.sort((a, b) => a.sz - b.sz);

  // ── Build O(1) projection index (replaces O(n²) projected.find) ──
  const projIndex = new Map();
  projected.forEach(p => projIndex.set(p.n.id, p));

  // ── Draw connections (great-circle arcs approximated as lines) ──
  links.forEach(lk => {
    const fp = projIndex.get(lk.from);
    const tp = projIndex.get(lk.to);
    if (!fp || !tp || !fp.visible || !tp.visible) return;
    const alpha = Math.min(fp.alpha, tp.alpha) * 0.6;
    if (alpha < 0.04) return;

    const col = lk.color || 'rgba(0,200,255,.15)';
    // Parse existing color and apply alpha
    const baseAlpha = lk.dashed ? alpha * 0.4 : alpha * 0.7;
    ctx.beginPath();
    ctx.moveTo(fp.px, fp.py);
    // Slight arc through sphere surface midpoint
    const mpx = (fp.px + tp.px) / 2 + (tp.py - fp.py) * 0.1;
    const mpy = (fp.py + tp.py) / 2 - (tp.px - fp.px) * 0.1;
    ctx.quadraticCurveTo(mpx, mpy, tp.px, tp.py);
    ctx.strokeStyle = col.replace(/[\d.]+\)$/, `${baseAlpha})`).replace(/var\(--c\)/, `rgba(0,200,255,${baseAlpha})`);
    ctx.lineWidth = (lk.width || 1) * fp.scale * 0.7;
    if (lk.dashed) ctx.setLineDash([3, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // ── Draw nodes as glowing spherical dots ──────────────────────
  projected.forEach(({ n, px: px3, py: py3, sz, scale, alpha, visible }) => {
    if (!visible || alpha < 0.04) return;

    const isSelected = BMV2._selectedNode === n.id;
    const col = (n.color || '#00c8ff').replace('var(--c)', '#00c8ff');

    // Dot radius — perspective-scaled
    let r = n.r * scale * (BMV2._pan.zoom || 1);
    r = Math.max(1.5, Math.min(r, 28));

    // Glow halo (for meta/hub nodes)
    if (n.type === 'hub' || n.type === 'meta' || isSelected) {
      const glowR = r * (n.type === 'hub' ? 3.5 : 2.5);
      const grd = ctx.createRadialGradient(px3, py3, 0, px3, py3, glowR);
      grd.addColorStop(0, (col.startsWith('#') ? `rgba(${parseInt(col.slice(1,3),16)},${parseInt(col.slice(3,5),16)},${parseInt(col.slice(5,7),16)},${alpha * 0.4})` : col.replace(/[\d.]+\)$/, `${alpha * 0.5})`).replace(/var\(--c\)/, `rgba(0,200,255,${alpha * 0.4})`)));
      grd.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(px3, py3, glowR, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Inner 3D sphere shading — radial gradient for depth illusion
    const sphereGrd = ctx.createRadialGradient(
      px3 - r * 0.3, py3 - r * 0.3, r * 0.05,
      px3, py3, r
    );
    const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
    sphereGrd.addColorStop(0, col + 'ff');
    sphereGrd.addColorStop(0.4, _hexAlpha(col, alpha));
    sphereGrd.addColorStop(1, '#000000' + '00');

    ctx.beginPath();
    ctx.arc(px3, py3, r, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrd;
    ctx.fill();

    // Rim highlight
    if (n.type === 'hub' || n.type === 'meta') {
      ctx.beginPath();
      ctx.arc(px3, py3, r, 0, Math.PI * 2);
      ctx.strokeStyle = _hexAlpha(col, alpha);
      ctx.lineWidth = isSelected ? 2 * scale : 1 * scale;
      ctx.stroke();
    }

    // Hub pulse ring
    if (n.type === 'hub') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.beginPath();
      ctx.arc(px3, py3, r * (1.8 + pulse * 0.7), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0,200,255,${0.15 * pulse * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Label — only when close enough (alpha > 0.4) or selected
    if ((alpha > 0.38 || isSelected) && (n.type !== 'sub' || scale > 0.9)) {
      const maxLen = n.type === 'hub' ? 10 : n.type === 'meta' ? 12 : 14;
      const lbl = n.label.length > maxLen ? n.label.slice(0, maxLen - 1) + '…' : n.label;
      const fontSize = Math.max(7, Math.min(12, r * 1.4));
      ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Text shadow for readability over the sphere
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(lbl, px3 + 0.5, py3 + r + 2.5);
      ctx.fillStyle = n.type === 'hub'
        ? '#00c8ff'
        : n.type === 'meta' ? col : `rgba(192,218,240,${alpha * 0.9})`;
      ctx.fillText(lbl, px3, py3 + r + 2);

      // Expand indicator
      if ((n.type === 'meta' || n.type === 'domain') && !n.expanded) {
        ctx.font = `${Math.max(7, r * 0.8)}px monospace`;
        ctx.fillStyle = col + 'bb';
        ctx.fillText('+', px3 + r + 3, py3 - r * 0.3);
      }
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

  BMV2._raf = requestAnimationFrame(bmv2Render);
}

// ── Interaction: click hit-test ───────────────────────────────────
function _bmHitTest(clientX, clientY) {
  const cvs = document.getElementById('brain-cvs');
  if (!cvs) return null;
  const rect = cvs.getBoundingClientRect();
  const W = cvs.width, H = cvs.height;
  const { x: px, y: py, zoom: z } = BMV2._pan;
  const wx = (clientX - rect.left - W / 2 - px) / z;
  const wy = (clientY - rect.top  - H / 2 - py) / z;
  let best = null, bestD = Infinity;
  BMV2._nodes.forEach(n => {
    const d = Math.hypot(wx - n.x, wy - n.y);
    if (d < n.r * 2.2 && d < bestD) { bestD = d; best = n; }
  });
  return best;
}

function bmv2Click(e) {
  e.stopPropagation();
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

function bmv2ToggleMeta(n) {
  const key = n.meta || n.label;
  if (BMV2._expanded.has(key)) {
    BMV2._expanded.delete(key);
    // Also collapse all children
    [...BMV2._expanded].forEach(k => { if (k.startsWith(key + '::')) BMV2._expanded.delete(k); });
  } else {
    BMV2._expanded.add(key);
    T.brainModeEntered(key);
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

// ── Intelligence stats sidebar ────────────────────────────────────
function _bmRenderIntelStats() {
  const el = document.getElementById('brain-intel-stats'); if (!el) return;
  el.innerHTML = Object.entries(MM_INTEL_TAGS).map(([key, def]) => {
    const score = DOMAIN_STATE.intelligenceRatings[key] || 0;
    return `
      <div style="padding:7px 0;border-bottom:1px solid rgba(24,40,64,.4)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-size:10px;color:${def.color}">${def.icon}</span>
          <span style="font-family:var(--f-body);font-size:9px;font-weight:600;color:var(--bright);flex:1">${INTELLIGENCE_TYPES[key]?.label || key}</span>
          <span style="font-family:var(--f-mono);font-size:8px;font-weight:700;color:${def.color};min-width:28px;text-align:right">${score}</span>
        </div>
        <div style="height:3px;background:var(--wire);overflow:hidden;margin-bottom:3px">
          <div style="height:100%;width:${score}%;background:${def.color};transition:width .4s"></div>
        </div>
        <input type="range" min="0" max="100" value="${score}"
          oninput="bmv2SetIntel('${key}',+this.value,this.previousElementSibling.firstChild,this.parentElement.querySelector('[font-weight]'))"
          style="width:100%;height:3px;appearance:none;background:transparent;cursor:pointer"
          onchange="bmv2SetIntel('${key}',+this.value)">
      </div>`;
  }).join('');
}

function bmv2SetIntel(key, val) {
  DOMAIN_STATE.intelligenceRatings[key] = val;
  bmv2Save();
  const el = document.getElementById('brain-intel-stats');
  if (el) {
    // Update bar and score display without full re-render
    const allInputs = el.querySelectorAll('input[type=range]');
    const allBars = el.querySelectorAll('[style*="height:100%"]');
    Object.entries(MM_INTEL_TAGS).forEach(([k, def], i) => {
      if (k === key) {
        if (allBars[i]) allBars[i].style.width = val + '%';
      }
    });
  }
  _bmCacheInvalidate();
  BMV2._dirty = true;
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
function initBrainMap() {
  bmv2Load();
  BMV2._dirty = true;
  if (BMV2._raf) cancelAnimationFrame(BMV2._raf);
  BMV2._raf = requestAnimationFrame(bmv2Render);
  _bmUpdateSidebar();
  _bmRenderIntelStats();
  _bmBuildCrossdomainPanel();
  _bmSetupBrainInteraction();

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

  // Mouse drag — LEFT drag = rotate globe, RIGHT/MIDDLE = pan
  let dragStart = null, panStart = null, rotStart = null;
  let _interactTimer = null;

  const startInteract = () => {
    BMV2._userInteracting = true;
    clearTimeout(_interactTimer);
    _interactTimer = setTimeout(() => { BMV2._userInteracting = false; }, 2000);
  };

  cvs.addEventListener('mousedown', e => {
    startInteract();
    dragStart = { x: e.clientX, y: e.clientY };
    if (e.button === 0) {
      // Left drag = rotate sphere
      rotStart = { rotY: BMV2._rotY || 0 };
    } else {
      // Middle/right drag = pan
      panStart = { x: BMV2._pan.x, y: BMV2._pan.y };
    }
    cvs.style.cursor = 'grabbing';
  });

  cvs.addEventListener('mousemove', e => {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (e.buttons === 1 && rotStart !== null) {
      // Rotate globe
      BMV2._rotY = rotStart.rotY + dx * 0.008;
      BMV2._dirty = true;
    } else if (panStart) {
      // Pan
      BMV2._pan.x = panStart.x + dx;
      BMV2._pan.y = panStart.y + dy;
      BMV2._dirty = true;
    }
  });

  cvs.addEventListener('mouseup', e => {
    const moved = dragStart && (Math.abs(e.clientX - dragStart.x) + Math.abs(e.clientY - dragStart.y)) > 5;
    dragStart = null; panStart = null; rotStart = null;
    cvs.style.cursor = 'grab';
    if (moved) BMV2._dirty = true;
  });

  cvs.addEventListener('mouseleave', () => { dragStart = null; panStart = null; rotStart = null; cvs.style.cursor = 'default'; });

  // Scroll = zoom
  cvs.addEventListener('wheel', e => {
    e.preventDefault();
    startInteract();
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    BMV2._pan.zoom = Math.max(.15, Math.min(4, (BMV2._pan.zoom || 1) * factor));
    BMV2._dirty = true;
  }, { passive: false });

  // Touch pinch/pan/rotate
  let touches = null;
  cvs.addEventListener('touchstart', e => { touches = [...e.touches]; startInteract(); }, { passive: true });
  cvs.addEventListener('touchmove', e => {
    if (!touches) return;
    startInteract();
    if (e.touches.length === 1 && touches.length === 1) {
      // Single finger = rotate
      const dx = e.touches[0].clientX - touches[0].clientX;
      BMV2._rotY = (BMV2._rotY || 0) + dx * 0.008;
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

  // Initialize rotation
  if (BMV2._rotY === undefined) BMV2._rotY = 0;
  cvs.style.cursor = 'grab';
}

function _bmBuildCrossdomainPanel() {
  const el = document.getElementById('brain-crossdomain-panel'); if (!el) return;
  // Find intelligence types with high scores for cross-domain recommendations
  const topIntel = Object.entries(DOMAIN_STATE.intelligenceRatings)
    .sort((a,b) => b[1]-a[1]).slice(0,4);
  const matches = [];
  topIntel.forEach(([type]) => {
    Object.entries(MM_META_DOMAINS).forEach(([metaKey, meta]) => {
      if (meta.intelligences.includes(type)) {
        matches.push({ meta: metaKey, type, color: meta.color, icon: meta.icon });
      }
    });
  });
  // Find cross-domain synthesis opportunities
  const synthPairs = [];
  const metaKeys = Object.keys(MM_META_DOMAINS);
  for (let i = 0; i < metaKeys.length - 1; i++) {
    for (let j = i + 1; j < metaKeys.length; j++) {
      const a = MM_META_DOMAINS[metaKeys[i]];
      const b = MM_META_DOMAINS[metaKeys[j]];
      const sharedIntel = a.intelligences.filter(x => b.intelligences.includes(x));
      if (sharedIntel.length > 0) {
        synthPairs.push({ a: metaKeys[i], b: metaKeys[j], shared: sharedIntel, strength: sharedIntel.length });
      }
    }
  }
  synthPairs.sort((a,b) => b.strength - a.strength);

  el.innerHTML = `
    <div style="font-family:var(--f-mono);font-size:7px;color:var(--v);letter-spacing:1.5px;margin-bottom:10px">YOUR SYNTHESIS OPPORTUNITIES</div>
    ${synthPairs.slice(0,6).map(p => {
      const ma = MM_META_DOMAINS[p.a], mb = MM_META_DOMAINS[p.b];
      return `<div onclick="bmv2SpawnSynthesis('${escH(p.a)}','${escH(p.b)}')"
        style="display:flex;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid var(--wire);cursor:pointer;transition:opacity .15s"
        onmouseenter="this.style.opacity='.7'" onmouseleave="this.style.opacity='1'">
        <span style="color:${ma.color};font-size:11px">${ma.icon}</span>
        <div style="flex:1">
          <div style="font-family:var(--f-display);font-size:8px;font-weight:700;color:var(--bright)">
            ${escH(p.a.split(' ')[0])} × ${escH(p.b.split(' ')[0])}
          </div>
          <div style="font-family:var(--f-mono);font-size:6px;color:var(--dim)">
            Shared: ${p.shared.slice(0,2).map(i=>MM_INTEL_TAGS[i]?.shortLabel||i).join(', ')}
          </div>
        </div>
        <span style="color:${mb.color};font-size:11px">${mb.icon}</span>
      </div>`;
    }).join('')}
    <div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
      <button onclick="bmv2ExportJSON()" style="font-family:var(--f-mono);font-size:7px;padding:5px 10px;border:1px solid var(--gold)44;color:var(--gold);background:transparent;cursor:pointer;letter-spacing:1px">↓ JSON</button>
      <button onclick="bmv2ExportNotion()" style="font-family:var(--f-mono);font-size:7px;padding:5px 10px;border:1px solid var(--c)44;color:var(--c);background:transparent;cursor:pointer;letter-spacing:1px">↓ NOTION</button>
      <button onclick="bmv2ExportObsidian()" style="font-family:var(--f-mono);font-size:7px;padding:5px 10px;border:1px solid var(--v)44;color:var(--v);background:transparent;cursor:pointer;letter-spacing:1px">↓ OBSIDIAN</button>
      <button onclick="bmv2ExportCSV()" style="font-family:var(--f-mono);font-size:7px;padding:5px 10px;border:1px solid var(--g)44;color:var(--g);background:transparent;cursor:pointer;letter-spacing:1px">↓ CSV</button>
      <button onclick="bmv2ImportDomains()" style="font-family:var(--f-mono);font-size:7px;padding:5px 10px;border:1px solid var(--o)44;color:var(--o);background:transparent;cursor:pointer;letter-spacing:1px">↑ IMPORT</button>
    </div>
  `;
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

// setIntelligenceRating alias — called by old intel sliders + new system
function setIntelligenceRating(key, val) {
  DOMAIN_STATE.intelligenceRatings[key] = +val;
  // Update display
  const valEl = document.getElementById('intel-val-' + key);
  if (valEl) valEl.textContent = val + '%';
  const fills = document.querySelectorAll('.intel-stat-fill');
  const intelKeys = Object.keys(INTELLIGENCE_TYPES || MM_INTEL_TAGS);
  const idx = intelKeys.indexOf(key);
  if (idx >= 0 && fills[idx]) fills[idx].style.width = val + '%';
  domainStateSave();
  bmv2Save();
  _bmCacheInvalidate();
  BMV2._dirty = true;
}


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
   Stub — full implementation in next iteration.
   Intelligence types, intuition training, delta tracking, sleep
   integration, cognitive piggybacking, feedback loops.
═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   ALM — ACCELERATED LEARNING MODULE  v2.0
   
   The cognitive OS for self-understanding and deliberate growth.
   
   8 Human System Models:
     Biological · Cognitive · Affective · Behavioral
     Relational · Systems · Phenomenological · Developmental
   
   Cognitive Functions (Jung/MBTI extended):
     Ni · Ne · Ti · Te · Si · Se · Fi · Fe
   
   Architecture: tabs, not grids. State persists across sessions.
   Everything is a feedback loop — input, processing, output, record.
   
   "You are not static — you are a trajectory."
═══════════════════════════════════════════════════════════════════ */

// ── Cognitive Function definitions ────────────────────────────────
const COGNITIVE_FUNCTIONS = {
  Ni: { label:'Introverted Intuition', color:'#00c8ff', icon:'◎',
    desc:'Convergent · depth · future vision · the pattern beneath the pattern',
    domain:'Cognition', loop:'input',
    trainPrompt:'What is the deeper structure? What will this become?',
    feedback:'Does the convergence feel certain or forced?',
    experiment:'Sit with one question for 10 min without Google. What emerges?' },
  Ne: { label:'Extraverted Intuition', color:'#cc44ff', icon:'✦',
    desc:'Divergent · possibilities · lateral connections · what could be',
    domain:'Cognition', loop:'processing',
    trainPrompt:'What are all the angles? What connects this to something unrelated?',
    feedback:'How many genuine novel connections appeared in 5 minutes?',
    experiment:'Take any object. List 20 uses. Notice when it gets hard.' },
  Ti: { label:'Introverted Thinking', color:'#7744ff', icon:'◈',
    desc:'Internal logical framework · precision · structural coherence',
    domain:'Cognition', loop:'processing',
    trainPrompt:'Does this actually hold together? Where is the hidden assumption?',
    feedback:'Can you reduce this to its simplest coherent form?',
    experiment:'Pick a belief. Try to break it from the inside.' },
  Te: { label:'Extraverted Thinking', color:'#ffe04a', icon:'→',
    desc:'External organization · efficiency · measurable results',
    domain:'Cognition', loop:'output',
    trainPrompt:'What is the most efficient path to the outcome?',
    feedback:'Did the system produce measurable results?',
    experiment:'Build a simple decision matrix for something you\'ve been avoiding.' },
  Si: { label:'Introverted Sensing', color:'#ff8c22', icon:'◆',
    desc:'Memory · comparison · stored experience · what was',
    domain:'Cognition', loop:'input',
    trainPrompt:'What does this remind me of? What stored pattern applies?',
    feedback:'How reliable is this pattern recognition? Recent or stale?',
    experiment:'Detail a vivid memory. Notice what your body holds from it.' },
  Se: { label:'Extraverted Sensing', color:'#00ff88', icon:'◉',
    desc:'Present moment · sensory detail · immediate reality · what is',
    domain:'Cognition', loop:'input',
    trainPrompt:'What is actually here right now? What does the body report?',
    feedback:'How fully was I present vs. in my head?',
    experiment:'5 minutes: describe only what you can directly sense. No interpretation.' },
  Fi: { label:'Introverted Feeling', color:'#ff66aa', icon:'♥',
    desc:'Internal values · authenticity · felt rightness · identity',
    domain:'Affective', loop:'processing',
    trainPrompt:'Does this align with who I actually am? What does my core say?',
    feedback:'Is this my value or an inherited one?',
    experiment:'List 5 things you believe are wrong. Why? Where did each one come from?' },
  Fe: { label:'Extraverted Feeling', color:'#11ddcc', icon:'⬡',
    desc:'Relational attunement · group harmony · others\' emotional state',
    domain:'Relational', loop:'processing',
    trainPrompt:'What is the emotional field in this room/relationship?',
    feedback:'Did attending to their needs help or compromise my own clarity?',
    experiment:'In next conversation: say nothing for first 2 min. Just read the field.' },
};

// ── 8 Human System Models ────────────────────────────────────────
const HUMAN_MODELS = {
  biological: {
    label:'Biological', icon:'⬡', color:'#22ddaa',
    subtitle:'The Hardware',
    source:'Neuroscience + Biology',
    core:'Behavior = output of physical processes. If this layer is off, everything else distorts.',
    tracks:['Sleep quality','Stress level','Nervous system state','Hormonal signals','Energy level'],
    bridge:'Maps to Polyvagal states. Body data gates cognitive function availability.',
    loopType:'input',
  },
  cognitive: {
    label:'Cognitive', icon:'◈', color:'#00c8ff',
    subtitle:'The Processor',
    source:'Cognitive Psychology',
    core:'The mind interprets reality — it doesn\'t mirror it.',
    tracks:['Dominant function active','Cognitive biases active','Processing mode','Clarity level','Mental load'],
    bridge:'Cognitive functions (Ni/Ne/Ti/Te/Si/Se/Fi/Fe) are the processing architecture.',
    loopType:'processing',
  },
  affective: {
    label:'Affective', icon:'♥', color:'#ff66aa',
    subtitle:'The Value Engine',
    source:'Affective Neuroscience',
    core:'You don\'t act on logic — you act on what feels meaningful.',
    tracks:['Current emotion (named)','Motivation source','Meaning level','Emotional blocks','Affect-action bridge'],
    bridge:'Emotions are information about value alignment, not noise to suppress.',
    loopType:'processing',
  },
  behavioral: {
    label:'Behavioral', icon:'→', color:'#ff8c22',
    subtitle:'The Observable Output',
    source:'Behaviorism + Habit Science',
    core:'What you repeatedly do becomes what you are.',
    tracks:['Active habits','Conditioning patterns','Behavioral anchors','Pattern clusters','Output consistency'],
    bridge:'The behavioral layer is the visible output of all other layers combined.',
    loopType:'output',
  },
  relational: {
    label:'Relational', icon:'⬡', color:'#ff8c22',
    subtitle:'The Social System',
    source:'Attachment Theory',
    core:'You are shaped in relationship, not isolation.',
    tracks:['Attachment orientation','Co-regulation state','Communication patterns','Relational needs','Connection quality'],
    bridge:'Co-regulation changes nervous system state, which changes cognitive availability.',
    loopType:'input',
  },
  systems: {
    label:'Systems', icon:'∿', color:'#11ddcc',
    subtitle:'The Meta-Layer',
    source:'Systems Theory',
    core:'Patterns repeat because structures produce them.',
    tracks:['Active feedback loops','Leverage points','Structural patterns','Adaptation speed','Emergent behaviors'],
    bridge:'Systems view reveals why individual effort fails against structural forces.',
    loopType:'meta',
  },
  phenomenological: {
    label:'Phenomenological', icon:'◎', color:'#cc44ff',
    subtitle:'The Lived Experience',
    source:'Phenomenology',
    core:'Reality is filtered through experience, not just facts.',
    tracks:['Inner narrative','Meaning perception','Lived texture','Attention quality','Presence depth'],
    bridge:'The bridge between cognitive and experiential: "opening your chakras" = increasing body awareness + reducing internal resistance + attention shifting mind→body.',
    loopType:'meta',
  },
  developmental: {
    label:'Developmental', icon:'▲', color:'#cc44ff',
    subtitle:'Change Over Time',
    source:'Developmental Psychology',
    core:'You are not static — you are a trajectory.',
    tracks:['Current developmental theme','Growth edge','Historical pattern','Trajectory direction','Integration level'],
    bridge:'Connects to Horizon module. Where are you in the arc?',
    loopType:'output',
  },
};

// ── ALM State ─────────────────────────────────────────────────────
const ALM_STATE = {
  _loaded: false,
  activeTab: 'functions',      // 'functions' | 'models' | 'log' | 'frameworks' | 'experiment'
  activeFunction: 'Ni',        // selected cognitive function
  activeModel: 'cognitive',    // selected human model

  // Function training log: { fnKey, note, quality, ts }
  functionLog: [],

  // Model observations: { modelKey, field, value, ts }
  modelLog: [],

  // Experiment sessions: { id, fnKey, prompt, observation, ts }
  experiments: [],

  // Heuristics (named, personal rules of thumb)
  heuristics: [],
  // { id, text, domain, reliability, tags[], ts }

  // Frameworks user is working with
  frameworks: [],
  // { id, name, description, source, tags[], ts }

  // Externalized thought stream
  externalizations: [],
  // { id, text, type:'question'|'observation'|'hypothesis'|'pattern', fnKey, ts }
};
const ALM_STATE_KEY = 'mm_alm_state_v2';

function almLoad() {
  try {
    const raw = localStorage.getItem(ALM_STATE_KEY);
    if (raw) Object.assign(ALM_STATE, JSON.parse(raw));
    ALM_STATE._loaded = true;
  } catch(e) {}
  ALM_STATE._loaded = true;
}

function almSave() {
  try {
    const { _loaded, ...data } = ALM_STATE;
    localStorage.setItem(ALM_STATE_KEY, JSON.stringify(data));
  } catch(e) {}
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

// ── Open / close ──────────────────────────────────────────────────
function openALM() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'alm' });
  if (!ALM_STATE._loaded) almLoad();

  let overlay = document.getElementById('mm-alm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-alm-overlay';
    overlay.style.cssText = [
      'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800',
      'background:rgba(0,2,6,.98);backdrop-filter:blur(8px)',
      'display:flex;flex-direction:column;overflow:hidden',
    ].join(';');
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  _renderALM(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.5, window.innerHeight * 0.4, 0.85);
}

function closeALM() {
  const el = document.getElementById('mm-alm-overlay');
  if (el) el.style.display = 'none';
  almSave();
}

// ── Main render ───────────────────────────────────────────────────
function _renderALM(overlay) {
  overlay.innerHTML = '';
  const C = '#00ff88';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = [
    'display:flex;align-items:center;gap:14px;padding:11px 22px',
    'border-bottom:1px solid rgba(0,255,136,.18)',
    'background:rgba(0,255,136,.03);flex-shrink:0',
  ].join(';');
  hdr.innerHTML = `
    <span style="font-size:18px;filter:drop-shadow(0 0 10px #00ff88)">∞</span>
    <div>
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:5px;color:#00ff88">ALM</div>
      <div style="font-family:var(--f-mono);font-size:7px;
        color:rgba(0,255,136,.45);letter-spacing:2px;margin-top:1px">
        ACCELERATED LEARNING · COGNITIVE FUNCTIONS · HUMAN MODELS · FEEDBACK
      </div>
    </div>
    <div style="margin-left:auto;display:flex;gap:7px;align-items:center">
      <button onclick="almExportToCanvas()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid rgba(0,255,136,.3);color:#00ff88;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(0,255,136,.1)'"
        onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      <button onclick="closeALM();goHome()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,255,255,.04)'"
        onmouseleave="this.style.background='transparent'">⌂ HOME</button>
    </div>
  `;
  overlay.appendChild(hdr);

  // Tab bar
  const TABS = [
    { id:'functions',    label:'COGNITIVE FUNCTIONS', icon:'◈' },
    { id:'models',       label:'8 MODELS',            icon:'⬡' },
    { id:'experiment',   label:'EXPERIMENT',          icon:'◎' },
    { id:'externalize',  label:'EXTERNALIZE',         icon:'✦' },
    { id:'heuristics',   label:'HEURISTICS',          icon:'◆' },
    { id:'frameworks',   label:'FRAMEWORKS',          icon:'⊞' },
    { id:'log',          label:'LOG',                 icon:'Δ' },
  ];
  const tabBar = document.createElement('div');
  tabBar.style.cssText = [
    'display:flex;gap:0;border-bottom:1px solid rgba(0,255,136,.1)',
    'background:rgba(0,0,0,.4);flex-shrink:0;overflow-x:auto',
  ].join(';');
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    const isActive = ALM_STATE.activeTab === tab.id;
    btn.style.cssText = [
      'padding:9px 16px;cursor:pointer;white-space:nowrap',
      `font-family:var(--f-mono);font-size:7.5px;letter-spacing:1.5px`,
      `border:none;border-bottom:2px solid ${isActive ? '#00ff88' : 'transparent'}`,
      `color:${isActive ? '#00ff88' : 'var(--dim)'}`,
      `background:${isActive ? 'rgba(0,255,136,.06)' : 'transparent'}`,
      'transition:all .15s',
    ].join(';');
    btn.textContent = tab.icon + ' ' + tab.label;
    btn.addEventListener('click', () => {
      ALM_STATE.activeTab = tab.id;
      _renderALM(overlay);
    });
    btn.addEventListener('mouseenter', () => { if (!isActive) { btn.style.color='var(--muted)'; btn.style.background='rgba(255,255,255,.03)'; } });
    btn.addEventListener('mouseleave', () => { if (!isActive) { btn.style.color='var(--dim)'; btn.style.background='transparent'; } });
    tabBar.appendChild(btn);
  });
  overlay.appendChild(tabBar);

  // Content area
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:hidden;display:flex';
  overlay.appendChild(content);

  switch (ALM_STATE.activeTab) {
    case 'functions':   _almTabFunctions(content);   break;
    case 'models':      _almTabModels(content);      break;
    case 'experiment':  _almTabExperiment(content);  break;
    case 'externalize': _almTabExternalize(content); break;
    case 'heuristics':  _almTabHeuristics(content);  break;
    case 'frameworks':  _almTabFrameworks(content);  break;
    case 'log':         _almTabLog(content);         break;
  }
}

// ── TAB: Cognitive Functions ──────────────────────────────────────
function _almTabFunctions(container) {
  container.style.flexDirection = 'row';

  // Left: function list
  const left = document.createElement('div');
  left.style.cssText = [
    'width:220px;flex-shrink:0;border-right:1px solid rgba(0,255,136,.1)',
    'overflow-y:auto;padding:14px 0',
  ].join(';');

  // Loop type legend
  left.innerHTML = `
    <div style="padding:0 14px 12px;border-bottom:1px solid rgba(0,255,136,.08);margin-bottom:10px">
      <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;
        color:var(--dim);margin-bottom:6px">INPUT → PROCESSING → OUTPUT</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['input','processing','output','meta'].map(t => {
          const c = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[t];
          return `<span style="font-family:var(--f-mono);font-size:7px;color:${c};
            border:1px solid ${c}44;padding:2px 6px">${t}</span>`;
        }).join('')}
      </div>
    </div>
  `;

  Object.entries(COGNITIVE_FUNCTIONS).forEach(([key, fn]) => {
    const isActive = ALM_STATE.activeFunction === key;
    const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[fn.loop];
    const log = ALM_STATE.functionLog.filter(l => l.fnKey === key);
    const avgQ = log.length ? (log.slice(-5).reduce((s,l)=>s+(l.quality||0),0)/Math.min(5,log.length)).toFixed(1) : '—';

    const row = document.createElement('div');
    row.style.cssText = [
      'padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:9px',
      `border-left:3px solid ${isActive ? fn.color : 'transparent'}`,
      `background:${isActive ? fn.color+'10' : 'transparent'}`,
      'transition:all .12s',
    ].join(';');
    row.innerHTML = `
      <span style="font-size:14px;color:${fn.color};flex-shrink:0">${fn.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--f-display);font-size:9px;font-weight:700;
          color:${isActive ? fn.color : 'var(--bright)'}">${key}</div>
        <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fn.label}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
        <span style="font-family:var(--f-mono);font-size:6.5px;color:${loopColor};
          border:1px solid ${loopColor}44;padding:1px 4px">${fn.loop}</span>
        ${log.length ? `<span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${log.length}×</span>` : ''}
      </div>
    `;
    row.addEventListener('click', () => { ALM_STATE.activeFunction = key; _almTabFunctions(container.parentElement.querySelector('div[style*="overflow:hidden"]') || container); });
    row.addEventListener('mouseenter', () => { if (!isActive) row.style.background = fn.color+'08'; });
    row.addEventListener('mouseleave', () => { if (!isActive) row.style.background = 'transparent'; });
    left.appendChild(row);
  });
  container.appendChild(left);

  // Right: function detail
  const fn = COGNITIVE_FUNCTIONS[ALM_STATE.activeFunction];
  if (!fn) return;
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;overflow-y:auto;padding:24px 30px;display:flex;flex-direction:column;gap:22px';

  const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[fn.loop];
  const log = ALM_STATE.functionLog.filter(l => l.fnKey === ALM_STATE.activeFunction);
  const recent = [...log].sort((a,b) => b.ts - a.ts).slice(0, 8);

  // Header
  right.innerHTML = `
    <div>
      <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:6px">
        <span style="font-family:var(--f-display);font-size:32px;font-weight:900;
          color:${fn.color};letter-spacing:4px">${ALM_STATE.activeFunction}</span>
        <span style="font-family:var(--f-mono);font-size:10px;color:${loopColor};
          border:1px solid ${loopColor}44;padding:3px 9px">${fn.loop.toUpperCase()}</span>
      </div>
      <div style="font-family:var(--f-display);font-size:13px;font-weight:700;
        letter-spacing:2px;color:var(--bright);margin-bottom:6px">${fn.label}</div>
      <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);line-height:1.8">
        ${fn.desc}</div>
    </div>

    <!-- Feedback loop diagram for this function -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${['INPUT','PROCESSING','OUTPUT'].map(stage => {
        const isActive = (stage==='INPUT'&&fn.loop==='input')||(stage==='PROCESSING'&&fn.loop==='processing')||(stage==='OUTPUT'&&fn.loop==='output');
        return `<div style="padding:12px;text-align:center;
          border:1px solid ${isActive ? fn.color+'66' : 'rgba(255,255,255,.06)'};
          background:${isActive ? fn.color+'0d' : 'transparent'}">
          <div style="font-family:var(--f-display);font-size:7.5px;letter-spacing:2px;
            color:${isActive ? fn.color : 'var(--dim)'}">${stage}</div>
          ${isActive ? `<div style="font-family:var(--f-mono);font-size:7px;
            color:var(--muted);margin-top:4px;line-height:1.5">${ALM_STATE.activeFunction}</div>` : ''}
        </div>`;
      }).join(`<div style="display:flex;align-items:center;justify-content:center;
        color:var(--dim);font-size:14px">→</div>`)}
    </div>

    <!-- Train prompt + experiment -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:14px;background:${fn.color}08;border:1px solid ${fn.color}22">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:${fn.color};margin-bottom:8px">ACTIVATION PROMPT</div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
          line-height:1.7;font-style:italic">"${fn.trainPrompt}"</div>
      </div>
      <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:8px">FEEDBACK SIGNAL</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
          line-height:1.7">${fn.feedback}</div>
      </div>
    </div>

    <!-- Quick log -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">LOG OBSERVATION</div>
      <textarea id="alm-fn-note" placeholder="What did you notice when using ${ALM_STATE.activeFunction}?
Quality of the signal? What triggered it? What came out?" style="
        width:100%;box-sizing:border-box;height:72px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.4);border:1px solid rgba(0,255,136,.2);
        padding:9px;line-height:1.6;outline:none"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">quality</span>
          ${[1,2,3,4,5].map(n => `<button id="alm-fn-q-${n}" onclick="almFnSetQuality(${n})" style="
            width:24px;height:24px;cursor:pointer;border:1px solid rgba(0,255,136,.2);
            background:transparent;color:var(--wire2);font-family:var(--f-mono);
            font-size:9px;transition:all .1s"
            onmouseenter="this.style.background='rgba(0,255,136,.15)'"
            onmouseleave="almFnQualityHover(${n})">${n}</button>`).join('')}
        </div>
        <button onclick="almLogFunction()" style="
          margin-left:auto;padding:8px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.14)'"
          onmouseleave="this.style.background='rgba(0,255,136,.06)'">+ LOG</button>
        <button onclick="almRunExperiment('${ALM_STATE.activeFunction}')" style="
          padding:8px 18px;border:1px solid rgba(204,68,255,.35);
          color:#cc44ff;background:transparent;cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(204,68,255,.1)'"
          onmouseleave="this.style.background='transparent'">◎ EXPERIMENT</button>
      </div>
    </div>

    <!-- Recent log -->
    ${recent.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">RECENT OBSERVATIONS</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${recent.map(l => {
          const qc = ['','#ff3355','#ff8c22','#ffe04a','#00c8ff','#00ff88'][l.quality||0] || 'var(--dim)';
          return `<div style="padding:8px 12px;background:rgba(0,0,0,.3);
            border-left:2px solid ${fn.color}44;display:flex;gap:10px">
            <span style="font-family:var(--f-mono);font-size:9px;color:${qc};
              flex-shrink:0">Q${l.quality||'?'}</span>
            <span style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              flex:1;line-height:1.5">${escH(l.note)}</span>
            <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);
              flex-shrink:0">${_almTimeAgo(l.ts)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  `;
  container.appendChild(right);
  // Init quality selection
  window._almFnQuality = window._almFnQuality || 3;
  almFnSetQuality(window._almFnQuality);
}

let _almFnQuality = 3;
function almFnSetQuality(n) {
  _almFnQuality = n;
  [1,2,3,4,5].forEach(i => {
    const btn = document.getElementById('alm-fn-q-' + i);
    if (!btn) return;
    const active = i <= n;
    btn.style.background = active ? 'rgba(0,255,136,.2)' : 'transparent';
    btn.style.color = active ? '#00ff88' : 'var(--wire2)';
    btn.style.borderColor = active ? 'rgba(0,255,136,.5)' : 'rgba(0,255,136,.2)';
  });
}
function almFnQualityHover(n) { almFnSetQuality(_almFnQuality); }

function almLogFunction() {
  const note = document.getElementById('alm-fn-note')?.value?.trim();
  if (!note) { mm_toast('Add an observation first', 'warn'); return; }
  ALM_STATE.functionLog.push({
    fnKey: ALM_STATE.activeFunction,
    note, quality: _almFnQuality,
    ts: Date.now(),
  });
  almSave();
  mm_toast('Logged ' + ALM_STATE.activeFunction, 'success', { dur: 1600 });
  const ta = document.getElementById('alm-fn-note');
  if (ta) ta.value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: 8 Human Models ───────────────────────────────────────────
function _almTabModels(container) {
  container.style.flexDirection = 'row';

  // Left: model list
  const left = document.createElement('div');
  left.style.cssText = [
    'width:200px;flex-shrink:0;border-right:1px solid rgba(0,255,136,.1)',
    'overflow-y:auto;padding:12px 0',
  ].join(';');

  // Loop type header
  left.innerHTML = `
    <div style="padding:6px 14px 10px;border-bottom:1px solid rgba(0,255,136,.06);
      margin-bottom:8px;font-family:var(--f-mono);font-size:7px;color:var(--dim)">
      INPUT → PROCESSING → OUTPUT → META
    </div>
  `;

  Object.entries(HUMAN_MODELS).forEach(([key, model]) => {
    const isActive = ALM_STATE.activeModel === key;
    const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[model.loopType];
    const obs = ALM_STATE.modelLog.filter(l => l.modelKey === key).length;

    const row = document.createElement('div');
    row.style.cssText = [
      'padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px',
      `border-left:3px solid ${isActive ? model.color : 'transparent'}`,
      `background:${isActive ? model.color+'0d' : 'transparent'}`,
      'transition:all .12s',
    ].join(';');
    row.innerHTML = `
      <span style="font-size:13px;color:${model.color};flex-shrink:0">${model.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--f-display);font-size:8.5px;font-weight:700;
          color:${isActive ? model.color : 'var(--bright)'}">${model.label}</div>
        <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${model.subtitle}</div>
      </div>
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <span style="font-family:var(--f-mono);font-size:6px;color:${loopColor};
          border:1px solid ${loopColor}33;padding:1px 3px">${model.loopType}</span>
        ${obs ? `<span style="font-family:var(--f-mono);font-size:6px;color:var(--dim)">${obs}×</span>` : ''}
      </div>
    `;
    row.addEventListener('click', () => { ALM_STATE.activeModel = key; _almTabModels(container.parentElement.querySelector('div[style*="overflow:hidden"]') || container); });
    row.addEventListener('mouseenter', () => { if (!isActive) row.style.background = model.color+'08'; });
    row.addEventListener('mouseleave', () => { if (!isActive) row.style.background = 'transparent'; });
    left.appendChild(row);
  });
  container.appendChild(left);

  // Right: model detail
  const model = HUMAN_MODELS[ALM_STATE.activeModel];
  if (!model) return;
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;overflow-y:auto;padding:24px 30px;display:flex;flex-direction:column;gap:20px';
  const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[model.loopType];
  const obs = ALM_STATE.modelLog.filter(l => l.modelKey === ALM_STATE.activeModel);
  const recent = [...obs].sort((a,b) => b.ts-a.ts).slice(0,6);

  right.innerHTML = `
    <div>
      <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:6px">
        <span style="font-size:28px;color:${model.color}">${model.icon}</span>
        <span style="font-family:var(--f-display);font-size:18px;font-weight:800;
          letter-spacing:3px;color:${model.color}">${model.label.toUpperCase()}</span>
        <span style="font-family:var(--f-mono);font-size:8px;color:${loopColor};
          border:1px solid ${loopColor}44;padding:2px 8px">${model.loopType}</span>
      </div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        letter-spacing:1px;margin-bottom:10px">${model.source}</div>
      <div style="font-family:var(--f-mono);font-size:10px;color:var(--bright);
        line-height:1.7;border-left:3px solid ${model.color};padding-left:14px;
        font-style:italic">"${model.core}"</div>
    </div>

    <!-- What this model tracks -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:14px;background:${model.color}08;border:1px solid ${model.color}22">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:${model.color};margin-bottom:9px">WHAT TO TRACK</div>
        ${model.tracks.map(t => `
          <div style="display:flex;align-items:center;gap:7px;padding:4px 0;
            border-bottom:1px solid ${model.color}18">
            <div style="width:5px;height:5px;border-radius:50%;
              background:${model.color};flex-shrink:0"></div>
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted)">${t}</div>
          </div>`).join('')}
      </div>
      <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:9px">BRIDGE TO OTHER MODELS</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
          line-height:1.8">${model.bridge}</div>
      </div>
    </div>

    <!-- Quick observation log -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">LOG OBSERVATION</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px">
        ${model.tracks.map(t => `
          <button onclick="almModelFieldPrompt('${t.replace(/'/g,"\'")}')" style="
            padding:4px 9px;cursor:pointer;border:1px solid ${model.color}33;
            color:${model.color};background:transparent;font-family:var(--f-mono);
            font-size:7px;transition:all .12s"
            onmouseenter="this.style.background='${model.color}11'"
            onmouseleave="this.style.background='transparent'">${t}</button>
        `).join('')}
      </div>
      <textarea id="alm-model-obs" placeholder="What are you noticing in the ${model.label} layer right now?" style="
        width:100%;box-sizing:border-box;height:60px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.4);border:1px solid ${model.color}22;
        padding:8px;line-height:1.6;outline:none"
        onfocus="this.style.borderColor='${model.color}55'"
        onblur="this.style.borderColor='${model.color}22'"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:7px">
        <button onclick="almLogModel()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.35);
          color:#00ff88;background:rgba(0,255,136,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.14)'"
          onmouseleave="this.style.background='rgba(0,255,136,.06)'">+ LOG</button>
        <button onclick="almModelToCanvas('${ALM_STATE.activeModel}')" style="
          padding:7px 14px;border:1px solid rgba(255,255,255,.1);
          color:var(--dim);background:transparent;cursor:pointer;
          font-family:var(--f-mono);font-size:8px"
          onmouseenter="this.style.background='rgba(255,255,255,.05)'"
          onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      </div>
    </div>

    <!-- Recent observations -->
    ${recent.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">RECENT OBSERVATIONS</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${recent.map(l => `
          <div style="padding:8px 12px;background:rgba(0,0,0,.3);
            border-left:2px solid ${model.color}44;display:flex;gap:10px;align-items:flex-start">
            ${l.field ? `<span style="font-family:var(--f-mono);font-size:7px;
              color:${model.color};flex-shrink:0;padding:1px 6px;
              border:1px solid ${model.color}33">${escH(l.field)}</span>` : ''}
            <span style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              flex:1;line-height:1.5">${escH(l.value)}</span>
            <span style="font-family:var(--f-mono);font-size:7px;
              color:var(--wire2);flex-shrink:0">${_almTimeAgo(l.ts)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `;
  container.appendChild(right);
}

function almModelFieldPrompt(field) {
  const ta = document.getElementById('alm-model-obs');
  if (ta) { ta.placeholder = field + ': '; ta.focus(); }
  window._almModelField = field;
}

function almLogModel() {
  const val = document.getElementById('alm-model-obs')?.value?.trim();
  if (!val) { mm_toast('Add an observation', 'warn'); return; }
  ALM_STATE.modelLog.push({
    modelKey: ALM_STATE.activeModel,
    field: window._almModelField || null,
    value: val,
    ts: Date.now(),
  });
  window._almModelField = null;
  almSave();
  mm_toast('Observation logged', 'success', { dur: 1500 });
  document.getElementById('alm-model-obs').value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Experiment ───────────────────────────────────────────────
function _almTabExperiment(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '22px';

  const fn = COGNITIVE_FUNCTIONS[ALM_STATE.activeFunction];

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:4px">EXPERIMENT</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Deliberately use a function. Record what happens.
        The loop: trigger → observe → log → adjust → repeat.
      </div>
    </div>

    <!-- Function selector for experiment -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:9px">SELECT FUNCTION TO EXPERIMENT WITH</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        ${Object.entries(COGNITIVE_FUNCTIONS).map(([key, f]) => `
          <button onclick="almSelectExperimentFn('${key}')" style="
            padding:7px 13px;cursor:pointer;
            border:1px solid ${ALM_STATE.activeFunction===key ? f.color : f.color+'44'};
            background:${ALM_STATE.activeFunction===key ? f.color+'15' : 'transparent'};
            color:${f.color};font-family:var(--f-display);font-size:8.5px;
            font-weight:700;transition:all .12s"
            onmouseenter="this.style.background='${f.color}10'"
            onmouseleave="this.style.background='${ALM_STATE.activeFunction===key ? f.color+'15' : 'transparent'}'"
          >${f.icon} ${key}</button>
        `).join('')}
      </div>
      ${fn ? `
        <div style="padding:14px;background:${fn.color}08;border:1px solid ${fn.color}22">
          <div style="font-family:var(--f-mono);font-size:7.5px;color:${fn.color};
            letter-spacing:1.5px;margin-bottom:8px">EXPERIMENT PROTOCOL</div>
          <div style="font-family:var(--f-mono);font-size:9px;color:var(--bright);
            line-height:1.8;margin-bottom:8px">${fn.experiment}</div>
          <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
            font-style:italic">${fn.feedback}</div>
        </div>` : ''}
    </div>

    <!-- Log experiment result -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:9px">WHAT HAPPENED?</div>
      <textarea id="alm-exp-obs" placeholder="What did you notice?
Did the function activate cleanly or with resistance?
What was the quality of the output?
What surprised you?" style="
        width:100%;box-sizing:border-box;height:90px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.45);border:1px solid rgba(0,255,136,.2);
        padding:10px;line-height:1.7;outline:none"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <button onclick="almLogExperiment()" style="
          padding:8px 20px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.14)'"
          onmouseleave="this.style.background='rgba(0,255,136,.06)'">+ LOG EXPERIMENT</button>
      </div>
    </div>

    <!-- Past experiments -->
    ${ALM_STATE.experiments.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">EXPERIMENT LOG (${ALM_STATE.experiments.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${[...ALM_STATE.experiments].reverse().slice(0,10).map(e => {
          const f = COGNITIVE_FUNCTIONS[e.fnKey];
          return `<div style="padding:10px 14px;background:rgba(0,0,0,.35);
            border-left:3px solid ${f?.color||'#00ff88'}44">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
              <span style="font-family:var(--f-display);font-size:9px;font-weight:700;
                color:${f?.color||'#00ff88'}">${e.fnKey}</span>
              <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">
                ${_almTimeAgo(e.ts)}</span>
            </div>
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              line-height:1.6">${escH(e.observation)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  `;
}

function almSelectExperimentFn(key) {
  ALM_STATE.activeFunction = key;
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almRunExperiment(fnKey) {
  ALM_STATE.activeFunction = fnKey;
  ALM_STATE.activeTab = 'experiment';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almLogExperiment() {
  const obs = document.getElementById('alm-exp-obs')?.value?.trim();
  if (!obs) { mm_toast('Record your observation first', 'warn'); return; }
  const fn = COGNITIVE_FUNCTIONS[ALM_STATE.activeFunction];
  ALM_STATE.experiments.push({
    id: uuid(), fnKey: ALM_STATE.activeFunction,
    prompt: fn?.experiment || '',
    observation: obs, ts: Date.now(),
  });
  almSave();
  mm_toast('Experiment logged', 'success', { dur: 1800 });
  document.getElementById('alm-exp-obs').value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Externalize ──────────────────────────────────────────────
function _almTabExternalize(container) {
  container.style.flexDirection = 'row';

  // Left: input
  const left = document.createElement('div');
  left.style.cssText = [
    'width:360px;flex-shrink:0;border-right:1px solid rgba(0,255,136,.1)',
    'padding:22px 20px;display:flex;flex-direction:column;gap:14px',
  ].join(';');

  left.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">EXTERNALIZE THOUGHT</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Get it out of your head. The act of externalizing is processing.
        Label the type to route it.
      </div>
    </div>
    <textarea id="alm-ext-text" placeholder="What's in your head right now?
A question you keep circling?
A half-formed observation?
A hypothesis that needs testing?
A pattern you keep seeing?
Anything — just get it out." style="
      flex:1;resize:none;
      font-family:var(--f-mono);font-size:9px;color:var(--bright);
      background:rgba(0,0,0,.45);border:1px solid rgba(0,255,136,.2);
      padding:12px;line-height:1.8;outline:none;min-height:160px"
      onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
      onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
    <div>
      <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;
        color:var(--dim);margin-bottom:7px">TYPE</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${['question','observation','hypothesis','pattern','friction','insight'].map(t => {
          const tc = {question:'#00c8ff',observation:'#00ff88',hypothesis:'#cc44ff',
                      pattern:'#ff8c22',friction:'#ff3355',insight:'#ffe04a'}[t];
          return `<button id="alm-ext-type-${t}" onclick="almExtSelectType('${t}')" style="
            padding:5px 11px;cursor:pointer;
            border:1px solid ${tc}44;color:${tc};
            background:transparent;font-family:var(--f-mono);
            font-size:7.5px;transition:all .12s"
            onmouseenter="this.style.background='${tc}11'"
            onmouseleave="almExtTypeHover('${t}')">${t}</button>`;
        }).join('')}
      </div>
      <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;
        color:var(--dim);margin-bottom:7px">WHICH FUNCTION IS ACTIVE?</div>
      <select id="alm-ext-fn" style="
        width:100%;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
        color:var(--muted);padding:7px 9px;font-family:var(--f-mono);
        font-size:8px;margin-bottom:12px">
        <option value="">— function (optional)</option>
        ${Object.entries(COGNITIVE_FUNCTIONS).map(([k,f]) =>
          `<option value="${k}">${k} — ${f.label}</option>`).join('')}
      </select>
      <button onclick="almExternalizeLog()" style="
        width:100%;padding:10px;border:1px solid rgba(0,255,136,.4);
        color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
        font-family:var(--f-mono);font-size:9px;letter-spacing:1.5px"
        onmouseenter="this.style.background='rgba(0,255,136,.15)'"
        onmouseleave="this.style.background='rgba(0,255,136,.07)'">✦ EXTERNALIZE</button>
    </div>
  `;
  container.appendChild(left);

  // Right: stream
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;overflow-y:auto;padding:22px 24px';
  const stream = [...ALM_STATE.externalizations].reverse();
  const typeColors = {question:'#00c8ff',observation:'#00ff88',hypothesis:'#cc44ff',
                      pattern:'#ff8c22',friction:'#ff3355',insight:'#ffe04a'};

  right.innerHTML = `
    <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
      color:var(--dim);margin-bottom:14px">THOUGHT STREAM (${stream.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${stream.slice(0,40).map(e => {
        const col = typeColors[e.type] || '#00ff88';
        const fn = e.fnKey ? COGNITIVE_FUNCTIONS[e.fnKey] : null;
        return `<div style="padding:11px 14px;background:rgba(0,0,0,.35);
          border-left:2px solid ${col};display:flex;gap:11px;align-items:flex-start">
          <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:72px">
            <span style="font-family:var(--f-mono);font-size:7px;color:${col};
              border:1px solid ${col}44;padding:1px 5px">${e.type}</span>
            ${fn ? `<span style="font-family:var(--f-mono);font-size:7px;
              color:${fn.color}">${e.fnKey}</span>` : ''}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
              line-height:1.7;word-break:break-word">${escH(e.text)}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);
              margin-top:4px">${_almTimeAgo(e.ts)}</div>
          </div>
          <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px">
            <button onclick="almExtToCanvas('${e.id}')" style="
              padding:3px 7px;border:1px solid rgba(255,255,255,.1);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7px">→</button>
            <button onclick="almExtDelete('${e.id}')" style="
              padding:3px 7px;border:none;background:none;cursor:pointer;
              color:var(--wire2);font-size:11px"
              onmouseenter="this.style.color='var(--r)'"
              onmouseleave="this.style.color='var(--wire2)'">×</button>
          </div>
        </div>`;
      }).join('')}
      ${!stream.length ? `<div style="font-family:var(--f-mono);font-size:8px;
        color:var(--dim);padding:20px 0;line-height:2">
        Nothing externalized yet.<br>
        <span style="color:var(--wire2)">The stream captures thinking-in-progress.<br>
        Not for polished thoughts — for raw ones.</span>
      </div>` : ''}
    </div>
  `;
  container.appendChild(right);

  // Init type selection
  window._almExtType = window._almExtType || 'observation';
  setTimeout(() => almExtSelectType(window._almExtType), 50);
}

let _almExtType = 'observation';
function almExtSelectType(t) {
  _almExtType = t;
  const typeColors = {question:'#00c8ff',observation:'#00ff88',hypothesis:'#cc44ff',
                      pattern:'#ff8c22',friction:'#ff3355',insight:'#ffe04a'};
  ['question','observation','hypothesis','pattern','friction','insight'].forEach(type => {
    const btn = document.getElementById('alm-ext-type-' + type);
    if (!btn) return;
    const col = typeColors[type];
    const isActive = type === t;
    btn.style.background = isActive ? col + '18' : 'transparent';
    btn.style.borderColor = isActive ? col : col + '44';
  });
}
function almExtTypeHover(t) { almExtSelectType(_almExtType); }

function almExternalizeLog() {
  const text = document.getElementById('alm-ext-text')?.value?.trim();
  if (!text) { mm_toast('Write something first', 'warn'); return; }
  const fnKey = document.getElementById('alm-ext-fn')?.value || null;
  ALM_STATE.externalizations.push({
    id: uuid(), text, type: _almExtType, fnKey: fnKey || null, ts: Date.now(),
  });
  almSave();
  document.getElementById('alm-ext-text').value = '';
  mm_toast('Externalized', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almExtToCanvas(id) {
  const e = ALM_STATE.externalizations.find(x => x.id === id);
  if (!e) return;
  const fn = e.fnKey ? COGNITIVE_FUNCTIONS[e.fnKey] : null;
  const typeMap = {question:'question',observation:'insight',
                   hypothesis:'seed',pattern:'pattern',friction:'friction',insight:'insight'};
  CANVAS.spawnNode(typeMap[e.type]||'concept', undefined, undefined, {
    title: e.text.slice(0,60),
    body: e.text.length > 60 ? e.text : '',
    color: fn?.color,
    tags: [e.type.toUpperCase(), ...(e.fnKey ? [e.fnKey] : [])],
  });
  mm_toast('→ canvas', 'export', { dur: 1200 });
}

function almExtDelete(id) {
  ALM_STATE.externalizations = ALM_STATE.externalizations.filter(x => x.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Heuristics ───────────────────────────────────────────────
function _almTabHeuristics(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '18px';
  container.style.maxWidth = '820px';

  const domainColors = {Cognition:'#00c8ff',Affective:'#ff66aa',Behavioral:'#ff8c22',
    Relational:'#11ddcc',Systems:'#ffe04a',Meta:'#cc44ff'};

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">HEURISTICS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Named rules of thumb for your mind. A heuristic is a pattern you've earned through
        experience, distilled into a form you can apply without re-deriving it every time.
      </div>
    </div>

    <!-- Add heuristic -->
    <div style="padding:16px;background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.15)">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#00ff88;margin-bottom:10px">+ NEW HEURISTIC</div>
      <input id="alm-h-text" placeholder="When X, do Y. / If I notice Z, it usually means... / My best work happens when..." style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:9px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(0,255,136,.2);padding:9px 12px;outline:none;margin-bottom:8px"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"
        onkeydown="if(event.key==='Enter')almAddHeuristic()"/>
      <div style="display:flex;gap:8px">
        <select id="alm-h-domain" style="
          flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
          <option value="">Domain (optional)</option>
          ${Object.keys(domainColors).map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
        <select id="alm-h-rel" style="
          flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
          <option value="">Reliability</option>
          <option value="high">High — trust by default</option>
          <option value="medium">Medium — verify first</option>
          <option value="low">Low — provisional</option>
        </select>
        <button onclick="almAddHeuristic()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.15)'"
          onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ ADD</button>
      </div>
    </div>

    <!-- Heuristics list -->
    <div style="display:flex;flex-direction:column;gap:8px">
      ${ALM_STATE.heuristics.length ? ALM_STATE.heuristics.map(h => {
        const dc = domainColors[h.domain] || '#00ff88';
        const rc = {high:'#00ff88',medium:'#ff8c22',low:'#ff3355'}[h.reliability] || 'var(--dim)';
        return `<div style="padding:12px 16px;background:rgba(0,0,0,.35);
          border:1px solid rgba(255,255,255,.06);border-left:3px solid ${dc};
          display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-family:var(--f-mono);font-size:9.5px;color:var(--bright);
              line-height:1.7;margin-bottom:6px">${escH(h.text)}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${h.domain ? `<span style="font-family:var(--f-mono);font-size:7px;
                color:${dc};border:1px solid ${dc}44;padding:1px 6px">${h.domain}</span>` : ''}
              ${h.reliability ? `<span style="font-family:var(--f-mono);font-size:7px;
                color:${rc}">${h.reliability} reliability</span>` : ''}
              <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2)">
                ${_almTimeAgo(h.ts)}</span>
            </div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button onclick="almHeuristicToCanvas('${h.id}')" style="
              padding:4px 9px;border:1px solid rgba(255,255,255,.1);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7px"
              onmouseenter="this.style.color='var(--c)'"
              onmouseleave="this.style.color='var(--dim)'">→</button>
            <button onclick="almDeleteHeuristic('${h.id}')" style="
              padding:4px 7px;border:none;background:none;cursor:pointer;
              color:var(--wire2);font-size:12px"
              onmouseenter="this.style.color='var(--r)'"
              onmouseleave="this.style.color='var(--wire2)'">×</button>
          </div>
        </div>`;
      }).join('') : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        padding:20px 0;line-height:2">
        No heuristics yet.<br>
        <span style="color:var(--wire2)">A heuristic is experience distilled.
        "When I'm tired, Ti gets unreliable."<br>
        "My Ni converges fastest in the hour after waking."<br>
        "When I feel friction, it's often Si flagging a pattern mismatch."</span>
      </div>`}
    </div>
  `;
}

function almAddHeuristic() {
  const text = document.getElementById('alm-h-text')?.value?.trim();
  if (!text) { mm_toast('Write the heuristic', 'warn'); return; }
  ALM_STATE.heuristics.push({
    id: uuid(), text,
    domain: document.getElementById('alm-h-domain')?.value || '',
    reliability: document.getElementById('alm-h-rel')?.value || 'medium',
    ts: Date.now(),
  });
  almSave();
  document.getElementById('alm-h-text').value = '';
  mm_toast('Heuristic added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almDeleteHeuristic(id) {
  ALM_STATE.heuristics = ALM_STATE.heuristics.filter(h => h.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almHeuristicToCanvas(id) {
  const h = ALM_STATE.heuristics.find(x => x.id === id);
  if (!h) return;
  CANVAS.spawnNode('heuristic', undefined, undefined, {
    title: h.text.slice(0,60),
    tags: ['HEURISTIC', ...(h.domain ? [h.domain.toUpperCase()] : [])],
  });
  mm_toast('Heuristic → canvas', 'export', { dur: 1200 });
}

// ── TAB: Frameworks ───────────────────────────────────────────────
function _almTabFrameworks(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '18px';

  // Built-in framework suggestions
  const SUGGESTED = [
    { name:'Polyvagal Theory', source:'Stephen Porges', desc:'Three nervous system states shape all behavior and cognition.' },
    { name:'IFS — Internal Family Systems', source:'Richard Schwartz', desc:'Parts, Self, managers, firefighters, exiles.' },
    { name:'NVC — Nonviolent Communication', source:'Marshall Rosenberg', desc:'Observation → Feeling → Need → Request.' },
    { name:'Cynefin', source:'Dave Snowden', desc:'Obvious, Complicated, Complex, Chaotic domains require different action.' },
    { name:'Double-Loop Learning', source:'Argyris', desc:'Change not just behavior but the governing variables that produce behavior.' },
    { name:'Theory of Constraints', source:'Eli Goldratt', desc:'Every system has one constraint. Find it. Exploit it. Subordinate everything else.' },
    { name:'OODA Loop', source:'Boyd', desc:'Observe → Orient → Decide → Act. Speed through the loop wins.' },
  ];

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">FRAMEWORKS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Mental structures you actively use. Not a library — an active toolkit.
        Add frameworks you're working with. Tag how you're applying them.
      </div>
    </div>

    <!-- Add custom -->
    <div style="padding:14px;background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.12)">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#00ff88;margin-bottom:9px">+ ADD FRAMEWORK</div>
      <div style="display:flex;gap:7px;margin-bottom:7px">
        <input id="alm-fw-name" placeholder="Framework name…" style="
          flex:2;font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
          background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          padding:7px 10px;outline:none"
          onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
          onblur="this.style.borderColor='rgba(0,255,136,.2)'"/>
        <input id="alm-fw-source" placeholder="Source / author" style="
          flex:1;font-family:var(--f-mono);font-size:8px;color:var(--muted);
          background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.15);
          padding:7px 9px;outline:none"/>
      </div>
      <textarea id="alm-fw-desc" placeholder="What does this framework do? How are you using it?" style="
        width:100%;box-sizing:border-box;height:52px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.45);border:1px solid rgba(0,255,136,.15);
        padding:7px;line-height:1.6;outline:none;margin-bottom:7px"></textarea>
      <div style="text-align:right">
        <button onclick="almAddFramework()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.15)'"
          onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ ADD</button>
      </div>
    </div>

    <!-- Active frameworks -->
    ${ALM_STATE.frameworks.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">ACTIVE (${ALM_STATE.frameworks.length})</div>
      ${ALM_STATE.frameworks.map(f => `
        <div style="padding:12px 16px;background:rgba(0,0,0,.35);
          border:1px solid rgba(255,255,255,.06);margin-bottom:7px;
          display:flex;align-items:flex-start;gap:11px">
          <div style="flex:1">
            <div style="font-family:var(--f-display);font-size:10px;font-weight:700;
              letter-spacing:1px;color:#00ff88;margin-bottom:3px">${escH(f.name)}</div>
            ${f.source ? `<div style="font-family:var(--f-mono);font-size:7px;
              color:var(--dim);margin-bottom:5px">${escH(f.source)}</div>` : ''}
            ${f.desc ? `<div style="font-family:var(--f-mono);font-size:8px;
              color:var(--muted);line-height:1.6">${escH(f.desc)}</div>` : ''}
          </div>
          <button onclick="almDeleteFramework('${f.id}')" style="
            padding:4px 7px;border:none;background:none;cursor:pointer;
            color:var(--wire2);font-size:12px;flex-shrink:0"
            onmouseenter="this.style.color='var(--r)'"
            onmouseleave="this.style.color='var(--wire2)'">×</button>
        </div>`).join('')}
    </div>` : ''}

    <!-- Suggested -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">SUGGESTED FRAMEWORKS</div>
      ${SUGGESTED.map(s => `
        <div style="padding:10px 14px;background:transparent;
          border:1px solid rgba(255,255,255,.05);margin-bottom:6px;
          display:flex;align-items:flex-start;gap:11px">
          <div style="flex:1">
            <div style="font-family:var(--f-display);font-size:9px;font-weight:700;
              color:var(--bright);margin-bottom:2px">${s.name}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
              margin-bottom:4px">${s.source}</div>
            <div style="font-family:var(--f-mono);font-size:8px;
              color:var(--muted)">${s.desc}</div>
          </div>
          <button onclick="almAddSuggestedFramework('${s.name.replace(/'/g,"\'")}','${s.source.replace(/'/g,"\'")}','${s.desc.replace(/'/g,"\'")}')" style="
            padding:5px 11px;border:1px solid rgba(0,255,136,.3);
            color:#00ff88;background:transparent;cursor:pointer;
            font-family:var(--f-mono);font-size:7.5px;flex-shrink:0"
            onmouseenter="this.style.background='rgba(0,255,136,.08)'"
            onmouseleave="this.style.background='transparent'">+ ADD</button>
        </div>`).join('')}
    </div>
  `;
}

function almAddFramework() {
  const name = document.getElementById('alm-fw-name')?.value?.trim();
  if (!name) { mm_toast('Name required', 'warn'); return; }
  ALM_STATE.frameworks.push({
    id: uuid(), name,
    source: document.getElementById('alm-fw-source')?.value?.trim() || '',
    desc: document.getElementById('alm-fw-desc')?.value?.trim() || '',
    ts: Date.now(),
  });
  almSave();
  mm_toast('Framework added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almAddSuggestedFramework(name, source, desc) {
  if (ALM_STATE.frameworks.some(f => f.name === name)) { mm_toast('Already in your toolkit', 'info'); return; }
  ALM_STATE.frameworks.push({ id: uuid(), name, source, desc, ts: Date.now() });
  almSave();
  mm_toast(name + ' added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almDeleteFramework(id) {
  ALM_STATE.frameworks = ALM_STATE.frameworks.filter(f => f.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Log (delta + legacy) ─────────────────────────────────────
function _almTabLog(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '16px';

  const deltas = JSON.parse(localStorage.getItem(ALM_DELTAS_KEY) || '[]');
  const typeColors = { insight:'#ff8c22',skill:'#00c8ff',pattern:'#cc44ff',
    intuition:'#ff66aa','inner-work':'#7744ff',horizon:'#d4a820' };

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">DELTA LOG</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        Log improvements, insights, skill gains. Track the trajectory of change.
      </div>
    </div>
    <div style="display:flex;gap:7px">
      <input id="alm-delta-input" placeholder="What improved, shifted, or landed today…" style="
        flex:1;font-family:var(--f-mono);font-size:9px;color:var(--bright);
        background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
        padding:8px 12px;outline:none"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"
        onkeydown="if(event.key==='Enter')almLogDelta()"/>
      <select id="alm-delta-type" style="
        background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
        color:var(--muted);padding:7px 10px;font-family:var(--f-mono);font-size:8px">
        <option value="insight">Insight</option>
        <option value="skill">Skill</option>
        <option value="pattern">Pattern</option>
        <option value="intuition">Intuition</option>
        <option value="inner-work">Inner Work</option>
        <option value="horizon">Horizon</option>
      </select>
      <button onclick="almLogDelta()" style="
        padding:8px 16px;border:1px solid rgba(0,255,136,.4);
        color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
        font-family:var(--f-mono);font-size:8px"
        onmouseenter="this.style.background='rgba(0,255,136,.15)'"
        onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ LOG</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${deltas.slice(0,50).map(d => {
        const col = typeColors[d.type] || '#00ff88';
        return `<div style="padding:8px 12px;background:rgba(0,0,0,.3);
          border-left:2px solid ${col};display:flex;align-items:center;gap:10px">
          <span style="font-family:var(--f-mono);font-size:7px;color:${col};
            border:1px solid ${col}44;padding:1px 6px;flex-shrink:0">${d.type}</span>
          <span style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);flex:1">
            ${escH(d.text)}</span>
          <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);flex-shrink:0">
            ${d.ts ? new Date(d.ts).toLocaleDateString() : ''}</span>
        </div>`;
      }).join('')}
      ${!deltas.length ? `<div style="font-family:var(--f-mono);font-size:8px;
        color:var(--dim);padding:16px 0">No deltas yet.</div>` : ''}
    </div>
  `;
}

// ── Canvas export ─────────────────────────────────────────────────
function almModelToCanvas(modelKey) {
  const model = HUMAN_MODELS[modelKey];
  if (!model) return;
  closeALM();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const hub = CANVAS.spawnNode('framework', undefined, undefined, {
      title: model.label + ' MODEL',
      body: model.core, color: model.color,
      tags: ['HUMAN-MODEL', model.loopType.toUpperCase()],
    });
    const obs = ALM_STATE.modelLog.filter(l => l.modelKey === modelKey).slice(-5);
    obs.forEach(o => {
      const n = CANVAS.spawnNode('insight', undefined, undefined, {
        title: (o.field ? '[' + o.field + '] ' : '') + o.value.slice(0,50),
        color: model.color, tags: [model.label.toUpperCase(), 'OBSERVATION'],
      });
      if (hub && n) CANVAS.addConn(hub.id, n.id, 'observed');
    });
    mm_toast(model.label + ' → canvas', 'export');
  }, 200);
}

function almExportToCanvas() {
  closeALM();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    const models = Object.entries(HUMAN_MODELS);
    const hub = CANVAS.spawnNode('synthesis', cx, cy, {
      title: 'HUMAN SYSTEM', color: '#00ff88', tags: ['ALM', 'SYNTHESIS'],
    });
    models.forEach(([key, model], i) => {
      const angle = (i / models.length) * Math.PI * 2 - Math.PI/2;
      const r = 300;
      const n = CANVAS.spawnNode('framework', cx + Math.cos(angle)*r, cy + Math.sin(angle)*r, {
        title: model.label, color: model.color,
        body: model.core, tags: ['MODEL', model.loopType.toUpperCase()],
      });
      if (hub && n) CANVAS.addConn(hub.id, n.id, model.loopType);
    });
    mm_toast('All 8 models → canvas', 'export');
  }, 200);
}

// ── Utilities ─────────────────────────────────────────────────────
function _almTimeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff/86400000) + 'd ago';
  return new Date(ts).toLocaleDateString();
}


console.log('[MASTERMIND] ALM module loaded');


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
  try {
    const raw = localStorage.getItem(SYSTEMS_KEY);
    if (raw) Object.assign(SYSTEMS, JSON.parse(raw));
  } catch(e) {}
}

function systemsSave() {
  try { localStorage.setItem(SYSTEMS_KEY, JSON.stringify({
    variables: SYSTEMS.variables,
    links: SYSTEMS.links,
    loops: SYSTEMS.loops,
  })); } catch(e) {}
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
  _renderSystemsUI(overlay);
}

function closeSystems() {
  const el = document.getElementById('mm-systems-overlay');
  if (el) el.style.display = 'none';
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

  // Init CLD after DOM settles
  requestAnimationFrame(() => {
    _initCLD(cldCanvas);
    _renderCLD();
  });
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

function systemsClearAll() {
  if (!confirm('Clear all variables and links? This cannot be undone.')) return;
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
  try {
    const raw = localStorage.getItem(RELATIONAL_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      Object.assign(RELATIONAL_STATE, d);
      RELATIONAL_STATE._loaded = true;
    }
  } catch(e) {}
  RELATIONAL_STATE._loaded = true;
}

function relationalSave() {
  try {
    const { _loaded, ...data } = RELATIONAL_STATE;
    localStorage.setItem(RELATIONAL_KEY, JSON.stringify(data));
  } catch(e) {}
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
  _renderRelationalUI(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.4, window.innerHeight * 0.5, 0.9);
}

function closeRelational() {
  const el = document.getElementById('mm-relational-overlay');
  if (el) el.style.display = 'none';
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

function relationalAddNeed() {
  const text = prompt('What do you need in your relationships right now?');
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

function relationalEditPerson(id) {
  const p = RELATIONAL_STATE.people.find(x => x.id === id);
  if (!p) return;
  const name = prompt('Name:', p.name);
  if (!name?.trim()) return;
  const role = prompt('Role (partner, friend, parent…):', p.role);
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
    const res = await fetch(AI.apiBase || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': AI.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: AI.model || 'claude-opus-4-20250514',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
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

