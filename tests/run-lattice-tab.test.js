'use strict';
// ═══════════════════════════════════════════════════════════════════
// VOICE LATTICE — lattice tab (detail panel, filters) + heuristics tab
// (phrase tester)
//
// Same discipline as run-lattice-ui.test.js: extract the real function
// source from nexus-engine.js and execute it against a recording DOM
// stub, then assert on what actually came out. A passing test here
// means the template literals evaluate, every onclick/handler inside
// them resolves to a real function in the same sandbox, and the
// filtering/detail/delete logic behaves the way the feature is
// supposed to — not just that the source parses.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

// Pulls a contiguous block of top-level function/const declarations out
// of nexus-engine.js by name-matched start and brace-balanced end, so
// the sandbox runs the ACTUAL current source, not a copy of it.
function extractRegion(src, startMarker, endFnName) {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, startMarker + ' not found in nexus-engine.js');
  const endMarkerStart = src.indexOf('\nfunction ' + endFnName + '(', start);
  assert.ok(endMarkerStart > -1, endFnName + ' (end boundary) not found after ' + startMarker);
  const bodyStart = src.indexOf('{', endMarkerStart);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

function extractSingleFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf('\n' + marker);
  assert.ok(start > -1, name + ' not found');
  const bodyStart = src.indexOf('{', start);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

// A DOM stub permissive enough to run real render code: getElementById
// returns a stable, cached object per id (so writes and reads against
// the "same element" actually agree), everything else is a no-op.
function makeSandbox(vlState) {
  const store = {};
  const makeEl = (id) => {
    if (!store[id]) {
      store[id] = {
        id, innerHTML: '', value: '', textContent: '',
        style: new Proxy({}, { set() { return true; }, get() { return ''; } }),
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        addEventListener() {}, removeEventListener() {},
        querySelectorAll: () => [], querySelector: () => makeEl('__anon__' + Math.random()),
        appendChild() {}, focus() {}, closest: () => makeEl('__anon_closest__'),
        getContext: () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} }),
      };
    }
    return store[id];
  };

  const confirmQueue = [];
  const toasts = [];
  const canvasSpawns = [];
  const savedFlags = { saved: 0 };

  const sandbox = {
    VL_STATE: vlState,
    console,
    escH: (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])),
    document: {
      getElementById: (id) => makeEl(id),
      querySelectorAll: () => [],
      querySelector: () => makeEl('__anon_qs__'),
      createElement: () => makeEl('__anon_ce__'),
    },
    mm_toast: (msg) => { toasts.push(msg); },
    mmConfirm: async () => confirmQueue.length ? confirmQueue.shift() : true,
    vlSave: () => { savedFlags.saved++; },
    CANVAS: { spawnNode: (type, x, y, opts) => { canvasSpawns.push({ type, opts }); return { id: 'spawned' }; } },
    VCE_PATTERNS: {
      philosophy_update: [], value_update: [], framework_mutation: [], identity_update: [],
      horizon_progress: [], shadow_observation: [], growth_marker: [], epistemic_claim: [],
      emotional_data: [], heuristic_fire: [], capture: [],
    },
    requestAnimationFrame: () => 0,
    Date,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(timeAgoSrc, sandbox); // used by node-list rendering; a real function, not stubbed
  return { sandbox, store: () => store, getEl: makeEl, confirmQueue, toasts, canvasSpawns, savedFlags };
}

const engineSrc = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');

const latticeRegionSrc = extractRegion(engineSrc, 'const VL_DOMAIN_COLORS = {', 'vlNodeToCanvas');
const heuristicsRegionSrc = extractRegion(engineSrc, 'function _vlTabHeuristics(container) {', 'vlHeuristicTest');
const detectIntentSrc = extractSingleFunction(engineSrc, 'vceDetectIntent');
const timeAgoSrc = extractSingleFunction(engineSrc, '_vlTimeAgo');

function freshVlState(overrides) {
  return Object.assign({
    nodes: [], wordBank: {}, heuristics: [], activeTab: 'lattice',
  }, overrides || {});
}

function sampleNode(over) {
  return Object.assign({
    id: 'n1', content: 'I keep circling the same idea about deferred judgment', tags: ['idea', 'creativity'],
    intent: 'capture', domain: 'cognitive', routedTo: ['Void seeds'], ts: Date.now(),
    processed: true, assocEdges: [],
  }, over || {});
}

// ── Lattice tab: rendering + filters + detail panel ─────────────────

t('the lattice tab renders without throwing on an empty state', () => {
  const { sandbox, store } = makeSandbox(freshVlState());
  vm.runInContext(latticeRegionSrc, sandbox);
  const container = { innerHTML: '' };
  vm.runInContext('_vlTabLattice', sandbox)(container);
  assert.ok(container.innerHTML.includes('WORD LATTICE'));
  assert.ok(store()['vl-lattice-right'].innerHTML.includes('Search nodes'));
});

t('a node in the list opens the detail panel showing its full content', () => {
  const node = sampleNode({ content: 'X'.repeat(200) }); // longer than the 80-char list truncation
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [node] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('_vlTabLattice', sandbox)({ innerHTML: '' });
  vm.runInContext('vlOpenNodeDetail', sandbox)(node.id);
  const detailHtml = store()['vl-lattice-right'].innerHTML;
  assert.ok(detailHtml.includes('X'.repeat(200)), 'detail view must show the FULL content, not the 80-char list preview');
  assert.ok(detailHtml.includes('\u2190 BACK'));
  assert.ok(detailHtml.includes('DELETE'));
});

t('the detail panel shows associated nodes by their real content, and clicking one opens it', () => {
  const a = sampleNode({ id: 'a', content: 'thinking about deferred judgment in ideation' });
  const b = sampleNode({ id: 'b', content: 'the pendulum keeps swinging back to this exact point', assocEdges: [{ to: 'a', score: 0.42 }] });
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [a, b] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('vlOpenNodeDetail', sandbox)('b');
  const html = store()['vl-lattice-right'].innerHTML;
  assert.ok(html.includes('42%'), 'association score should be shown');
  assert.ok(html.includes('deferred judgment in ideation'), 'the associated node\u2019s real content should be shown, not just its id');
  assert.ok(html.includes("vlOpenNodeDetail('a')"), 'the associated node must itself be clickable to jump to');
});

t('going back from detail returns to the list, not a blank panel', () => {
  const node = sampleNode();
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [node] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('vlOpenNodeDetail', sandbox)(node.id);
  vm.runInContext('vlOpenNodeDetail', sandbox)(null);
  assert.ok(store()['vl-lattice-right'].innerHTML.includes('Search nodes'));
});

t('domain filter narrows the list to only that domain', () => {
  const cog = sampleNode({ id: 'c1', domain: 'cognitive', content: 'a cognitive thought about structure' });
  const emo = sampleNode({ id: 'e1', domain: 'emotional', content: 'a feeling about the same structure' });
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [cog, emo] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('vlLatticeFilterDomain', sandbox)('emotional');
  const html = store()['vl-lattice-right'].innerHTML;
  assert.ok(html.includes('a feeling about the same structure'));
  assert.ok(!html.includes('a cognitive thought about structure'));
  assert.ok(html.includes('1 of 2 nodes'));
});

t('clearing the domain filter (empty string) shows everything again', () => {
  const cog = sampleNode({ id: 'c1', domain: 'cognitive', content: 'cognitive content here' });
  const emo = sampleNode({ id: 'e1', domain: 'emotional', content: 'emotional content here' });
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [cog, emo] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('vlLatticeFilterDomain', sandbox)('emotional');
  vm.runInContext('vlLatticeFilterDomain', sandbox)('');
  const html = store()['vl-lattice-right'].innerHTML;
  assert.ok(html.includes('cognitive content here') && html.includes('emotional content here'));
});

t('word-cloud click filters the list to nodes containing that word, and clicking it again clears it', () => {
  const a = sampleNode({ id: 'a', content: 'thinking about oscillation patterns' });
  const b = sampleNode({ id: 'b', content: 'a completely unrelated thought' });
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [a, b] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('vlLatticeFilterWord', sandbox)('oscillation');
  let html = store()['vl-lattice-right'].innerHTML;
  assert.ok(html.includes('thinking about oscillation patterns'));
  assert.ok(!html.includes('a completely unrelated thought'));
  vm.runInContext('vlLatticeFilterWord', sandbox)('oscillation'); // toggle off
  html = store()['vl-lattice-right'].innerHTML;
  assert.ok(html.includes('a completely unrelated thought'), 'clicking the same word again should clear the filter');
});

t('search filters live without needing a full panel re-render', () => {
  const a = sampleNode({ id: 'a', content: 'a thought about deadlines' });
  const b = sampleNode({ id: 'b', content: 'a thought about breakfast' });
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [a, b] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('_vlTabLattice', sandbox)({ innerHTML: '' });
  vm.runInContext('vlLatticeSearch', sandbox)('breakfast');
  const listHtml = store()['vl-node-list'].innerHTML;
  assert.ok(listHtml.includes('a thought about breakfast'));
  assert.ok(!listHtml.includes('a thought about deadlines'));
});

t('deleting a node removes it and any association pointing to it', async () => {
  const a = sampleNode({ id: 'a', content: 'node A content here' });
  const b = sampleNode({ id: 'b', content: 'node B content here', assocEdges: [{ to: 'a', score: 0.5 }] });
  const { sandbox, confirmQueue, toasts } = makeSandbox(freshVlState({ nodes: [a, b] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  confirmQueue.push(true);
  await vm.runInContext('vlDeleteNodeConfirm', sandbox)('a');
  assert.strictEqual(sandbox.VL_STATE.nodes.length, 1);
  assert.strictEqual(sandbox.VL_STATE.nodes[0].id, 'b');
  assert.deepStrictEqual(sandbox.VL_STATE.nodes[0].assocEdges, [], 'the dangling association to the deleted node must be dropped');
  assert.ok(toasts.some(m => /deleted/i.test(m)));
});

t('declining the delete confirmation leaves the node untouched', async () => {
  const a = sampleNode({ id: 'a' });
  const { sandbox, confirmQueue } = makeSandbox(freshVlState({ nodes: [a] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  confirmQueue.push(false);
  await vm.runInContext('vlDeleteNodeConfirm', sandbox)('a');
  assert.strictEqual(sandbox.VL_STATE.nodes.length, 1);
});

t('an empty filtered result explains itself instead of just looking broken', () => {
  const a = sampleNode({ id: 'a', domain: 'cognitive' });
  const { sandbox, store } = makeSandbox(freshVlState({ nodes: [a] }));
  vm.runInContext(latticeRegionSrc, sandbox);
  vm.runInContext('vlLatticeFilterDomain', sandbox)('shadow');
  const html = store()['vl-lattice-right'].innerHTML;
  assert.ok(/matches the current filters/i.test(html));
});

// ── Heuristics tab: the phrase tester ────────────────────────────────

function makeHeuristic(over) {
  return Object.assign({ id: 'h1', name: 'Pendulum Pattern', desc: 'Oscillating between two positions', domain: 'cognitive', triggerPhrases: ['pendulum', 'back and forth'], fireCount: 0, lastFired: null }, over || {});
}

t('the heuristics tab renders the phrase tester', () => {
  const { sandbox } = makeSandbox(freshVlState({ heuristics: [] }));
  vm.runInContext(detectIntentSrc, sandbox);
  vm.runInContext(heuristicsRegionSrc, sandbox);
  const container = { innerHTML: '', style: {} };
  vm.runInContext('_vlTabHeuristics', sandbox)(container);
  assert.ok(container.innerHTML.includes('TEST A PHRASE'));
  assert.ok(container.innerHTML.includes('vlHeuristicTest()'));
});

t('testing a phrase that matches a trigger phrase reports which heuristic fires', () => {
  const h = makeHeuristic();
  const { sandbox, store, getEl } = makeSandbox(freshVlState({ heuristics: [h] }));
  vm.runInContext(detectIntentSrc, sandbox);
  vm.runInContext(heuristicsRegionSrc, sandbox);
  vm.runInContext('_vlTabHeuristics', sandbox)({ innerHTML: '', style: {} });
  getEl('vl-h-test-input').value = 'I feel like a pendulum swinging back and forth on this';
  vm.runInContext('vlHeuristicTest()', sandbox);
  const result = store()['vl-h-test-result'].innerHTML;
  assert.ok(/fires:/i.test(result));
  assert.ok(result.includes('Pendulum Pattern'));
});

t('testing a phrase that matches nothing says so plainly', () => {
  const h = makeHeuristic();
  const { sandbox, store, getEl } = makeSandbox(freshVlState({ heuristics: [h] }));
  vm.runInContext(detectIntentSrc, sandbox);
  vm.runInContext(heuristicsRegionSrc, sandbox);
  vm.runInContext('_vlTabHeuristics', sandbox)({ innerHTML: '', style: {} });
  getEl('vl-h-test-input').value = 'something about lunch plans';
  vm.runInContext('vlHeuristicTest()', sandbox);
  assert.ok(/no heuristics fire/i.test(store()['vl-h-test-result'].innerHTML));
});

t('the phrase tester is a dry run — it never touches fireCount or lastFired', () => {
  const h = makeHeuristic({ fireCount: 3, lastFired: 12345 });
  const { sandbox, store, getEl } = makeSandbox(freshVlState({ heuristics: [h] }));
  vm.runInContext(detectIntentSrc, sandbox);
  vm.runInContext(heuristicsRegionSrc, sandbox);
  vm.runInContext('_vlTabHeuristics', sandbox)({ innerHTML: '', style: {} });
  getEl('vl-h-test-input').value = 'back and forth like a pendulum';
  vm.runInContext('vlHeuristicTest()', sandbox);
  assert.strictEqual(sandbox.VL_STATE.heuristics[0].fireCount, 3, 'a dry-run test must not increment fireCount — that would misrepresent real capture history');
  assert.strictEqual(sandbox.VL_STATE.heuristics[0].lastFired, 12345);
});

t('an empty test input asks for text rather than silently doing nothing', () => {
  const h = makeHeuristic();
  const { sandbox, store, getEl } = makeSandbox(freshVlState({ heuristics: [h] }));
  vm.runInContext(detectIntentSrc, sandbox);
  vm.runInContext(heuristicsRegionSrc, sandbox);
  vm.runInContext('_vlTabHeuristics', sandbox)({ innerHTML: '', style: {} });
  getEl('vl-h-test-input').value = '';
  vm.runInContext('vlHeuristicTest()', sandbox);
  assert.ok(/type something/i.test(store()['vl-h-test-result'].textContent));
});

const fails = results.filter(r => !r.ok);
console.log('\nlattice-tab: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
