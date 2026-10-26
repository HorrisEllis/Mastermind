'use strict';
// NODE ANCHOR — the DOM mutator's hold on the composer and reply nodes.
//
// Plain Node, no Electron: clearglass-main.js guards its electron
// require, and exposes the generated page scripts under __test__. The
// scripts run unmodified in a vm against a small DOM double that models
// exactly what anchoring depends on — attributes, matches(), detached
// nodes (isConnected) and MutationObserver — which tests/harness.js's
// selector-table DOM deliberately does not have.
const vm = require('vm');
const { t, summary, assert } = require('./harness');
const cg = require('../foundation/ai/clearglass-main.js');
const CFG = require('../foundation/ai/clearglass-config.js');

const { _mmAnchorRuntime, _askScript, _peekScript, _cgHarness } = cg.__test__;
const SPEC = cg.AGENTS.claude;

// ── DOM double ─────────────────────────────────────────────────────
class El {
  constructor(tag, selectors, text) {
    this.tagName = tag;
    this._selectors = selectors;   // the exact selector strings this node answers to
    this._attrs = {};
    this._listeners = {};
    this.isConnected = true;
    this.disabled = false;
    this.innerText = this.textContent = text || '';
  }
  matches(s) { return this._selectors.includes(s) || this._attrMatch(s); }
  _attrMatch(s) {
    const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(s);
    return !!(m && this._attrs[m[1]] === m[2]);
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return k in this._attrs ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  focus() {}
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatchEvent(e) { (this._listeners[e.type] || []).forEach((fn) => fn(e)); return true; }
  click() { this.dispatchEvent({ type: 'click' }); }
}
class TextArea extends El {
  constructor(selectors) { super('TEXTAREA', selectors); this._value = ''; }
  get value() { return this._value; }
  set value(v) { this._value = v; }
}

function makeDoc() {
  const nodes = [];
  const doc = {
    add(el) { nodes.push(el); return el; },
    detach(el) { el.isConnected = false; const i = nodes.indexOf(el); if (i > -1) nodes.splice(i, 1); },
    querySelectorAll(s) { return nodes.filter((n) => n.isConnected && n.matches(s)); },
    querySelector(s) { return doc.querySelectorAll(s)[0] || null; },
    execCommand() { return false; },
  };
  return doc;
}

// MutationObserver double: observed nodes can be "mutated" from the test.
function makeMO() {
  const live = new Set();
  class MO {
    constructor(cb) { this._cb = cb; this._targets = []; }
    observe(el) { this._targets.push(el); live.add(this); }
    disconnect() { live.delete(this); }
  }
  MO.mutate = (el) => { for (const o of live) if (o._targets.includes(el)) o._cb([{ target: el }]); };
  MO.liveCount = () => live.size;
  return MO;
}

function runInPage(script, doc, MO) {
  class Ev { constructor(type, o) { this.type = type; Object.assign(this, o || {}); } }
  const ctx = {
    document: doc,
    window: { HTMLTextAreaElement: TextArea, HTMLInputElement: TextArea },
    Event: Ev, InputEvent: Ev, KeyboardEvent: Ev, ClipboardEvent: Ev,
    DataTransfer: class { setData() {} },
    setTimeout, clearTimeout, Date,
  };
  if (MO) ctx.MutationObserver = MO;
  ctx.window.document = doc;
  return vm.runInNewContext(script, ctx);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COMPOSER_SEL = 'textarea';
const SEND_SEL = 'button[aria-label*="Send" i]';
const BLOCK_SEL = '.font-claude-message';

async function run() {
  console.log('\n== node anchor — DOM mutator anchoring (clearglass-main.js) ==');

  // ── runtime ──────────────────────────────────────────────────────
  await t('resolve() stamps the picked node with data-mm-anchor and returns the same node next time', () => {
    const doc = makeDoc();
    const a = doc.add(new El('DIV', ['x']));
    const A = _mmAnchorRuntime(doc);
    assert.strictEqual(A.resolve('composer', ['x']), a);
    assert.strictEqual(a.getAttribute('data-mm-anchor'), 'composer');
    doc.add(new El('DIV', ['x']));
    assert.strictEqual(A.resolve('composer', ['x']), a, 'an anchored, connected, matching node must be reused');
  });

  await t('resolve() moves the anchor when the stamped node is detached (SPA re-render)', () => {
    const doc = makeDoc();
    const a = doc.add(new El('DIV', ['x']));
    const A = _mmAnchorRuntime(doc);
    A.resolve('composer', ['x']);
    doc.detach(a);
    const b = doc.add(new El('DIV', ['x']));
    assert.strictEqual(A.resolve('composer', ['x']), b);
    assert.strictEqual(b.getAttribute('data-mm-anchor'), 'composer');
  });

  await t('resolve() drops an anchor whose node no longer matches the agent selectors', () => {
    const doc = makeDoc();
    const a = doc.add(new El('DIV', ['x']));
    const A = _mmAnchorRuntime(doc);
    A.resolve('composer', ['x']);
    a._selectors = [];                       // same node, but it is not a composer any more
    const b = doc.add(new El('DIV', ['x']));
    assert.strictEqual(A.resolve('composer', ['x']), b);
    assert.strictEqual(a.getAttribute('data-mm-anchor'), null, 'the stale stamp must be removed, not duplicated');
  });

  await t('resolve() with nothing to pick releases the old anchor and returns null', () => {
    const doc = makeDoc();
    const a = doc.add(new El('DIV', ['x']));
    const A = _mmAnchorRuntime(doc);
    A.resolve('composer', ['x']);
    a._selectors = [];
    assert.strictEqual(A.resolve('composer', ['x']), null);
    assert.strictEqual(a.getAttribute('data-mm-anchor'), null);
  });

  await t('observe() records mutations; stop() disconnects; no MutationObserver degrades to not-live', () => {
    const doc = makeDoc();
    const el = doc.add(new El('DIV', ['x']));
    const MO = makeMO();
    global.MutationObserver = MO;
    try {
      const w = _mmAnchorRuntime(doc).observe(el);
      assert.strictEqual(w.live, true);
      MO.mutate(el); MO.mutate(el);
      assert.strictEqual(w.count, 2);
      w.stop();
      assert.strictEqual(w.live, false);
      assert.strictEqual(MO.liveCount(), 0);
    } finally { delete global.MutationObserver; }
    const w2 = _mmAnchorRuntime(doc).observe(el);
    assert.strictEqual(w2.live, false, 'without MutationObserver the watch must report itself not live');
  });

  // ── the ask script, end to end ───────────────────────────────────
  await t('THE FIX: composer swapped by a re-render after input is still read back — no false TEXT_INJECTION_FAILED', async () => {
    const doc = makeDoc();
    const first = doc.add(new TextArea([COMPOSER_SEL]));
    let current = first;
    // The page re-renders on input: the old node is detached and a fresh
    // one carries the value — exactly what a stale reference cannot see.
    first.addEventListener('input', () => {
      const next = doc.add(new TextArea([COMPOSER_SEL]));
      next.value = first.value;
      first.value = '';
      doc.detach(first);
      current = next;
    });
    const send = doc.add(new El('BUTTON', [SEND_SEL]));
    send.addEventListener('click', () => {
      current.value = '';
      setTimeout(() => doc.add(new El('DIV', [BLOCK_SEL], 'anchored reply')), 300);
    });
    const res = await runInPage(_askScript(SPEC, 'claude', JSON.stringify('hello'), 15000), doc);
    assert.strictEqual(res.ok, true, 'got ' + JSON.stringify(res));
    assert.strictEqual(res.text, 'anchored reply');
    assert.strictEqual(current.getAttribute('data-mm-anchor'), 'composer', 'the anchor must have followed the re-rendered composer');
  });

  await t('fallback completion waits until the anchored reply stops mutating, then releases the anchor and observer', async () => {
    const doc = makeDoc();
    const composer = doc.add(new TextArea([COMPOSER_SEL]));
    const send = doc.add(new El('BUTTON', [SEND_SEL]));
    const MO = makeMO();
    let reply = null, mutating = true;
    send.addEventListener('click', () => {
      composer.value = '';
      reply = doc.add(new El('DIV', [BLOCK_SEL], 'final text'));   // text stable from the start
    });
    // No stop button ever appears (stale selector), and the reply node
    // keeps mutating — e.g. code-block highlighting still rendering.
    const pump = setInterval(() => { if (mutating && reply) MO.mutate(reply); }, 200);
    const MUTATE_FOR = 1800 + 3 * CFG.timing.askPollMs + 1500;
    setTimeout(() => { mutating = false; }, MUTATE_FOR);
    const started = Date.now();
    try {
      const res = await runInPage(_askScript(SPEC, 'claude', JSON.stringify('q'), 20000), doc, MO);
      assert.strictEqual(res.ok, true, 'got ' + JSON.stringify(res));
      assert.ok(Date.now() - started >= MUTATE_FOR,
        'resolved after ' + (Date.now() - started) + 'ms, while the reply was still mutating until ' + MUTATE_FOR + 'ms');
      assert.strictEqual(reply.getAttribute('data-mm-anchor'), null, 'reply anchor must be released at the end of the ask');
      assert.strictEqual(MO.liveCount(), 0, 'the reply observer must be disconnected');
    } finally { clearInterval(pump); }
  });

  await t('harness exposes the anchor runtime; peek reports anchor state; all generated scripts parse', () => {
    const harness = _cgHarness('claude', 'Claude');
    assert.ok(/anchors: \(function _mmAnchorRuntime/.test(harness));
    const peek = _peekScript(SPEC);
    assert.ok(peek.includes('data-mm-anchor="composer"') && peek.includes('data-mm-anchor="reply"'));
    for (const src of [harness, peek, _askScript(SPEC, 'claude', '"x"', 1000)]) new vm.Script(src);
  });

  process.exitCode = summary('node-anchor') ? 1 : 0;
}

run();
