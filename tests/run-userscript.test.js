'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { t, summary, assert } = require('./harness');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'clearglass', 'mastermind-ai-bridge.user.js'), 'utf8');

// Strip the ==UserScript== metadata block — vm.Script can't parse it (it's
// not JS), a real userscript manager reads it separately before injection.
const CODE = SRC.replace(/\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n/, '');

// Builds a fresh sandbox per scenario. GM_getValue/GM_setValue back onto a
// shared plain object so persistence can be checked across "reloads" (two
// separate sandboxes sharing the same store), exactly like Tampermonkey's
// real per-script storage.
function makeSandbox({ hasBridge = true, hasGM = true, host = 'claude.ai', gmStore = {}, fetchImpl = null } = {}) {
  const captured = { intervalFn: null, errors: [], warns: [], logs: [] };
  const sandbox = {
    console: {
      error: (...a) => { captured.errors.push(a.join(' ')); },
      warn: (...a) => { captured.warns.push(a.join(' ')); },
      log: (...a) => { captured.logs.push(a.join(' ')); },
    },
    location: { hostname: host },
    // setInterval is intercepted so tests drive polls explicitly instead
    // of waiting POLL_MS=3000 real ms per tick.
    setInterval: (fn) => { captured.intervalFn = fn; return 1; },
    setTimeout, clearTimeout, clearInterval: () => {},
    Promise, Date, JSON, Set, Array, Object, String, encodeURIComponent,
    KeyboardEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    InputEvent: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
    Event: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  };
  sandbox.window = hasBridge ? { __CGL_BRIDGE__: { origin: 'http://127.0.0.1:7823', token: 'tok-123' } } : {};
  const valueProto = {};
  Object.defineProperty(valueProto, 'value', { set(v) { this.value = v; }, configurable: true });
  sandbox.HTMLTextAreaElement = { prototype: valueProto };
  sandbox.HTMLInputElement = sandbox.HTMLTextAreaElement;
  sandbox.window.HTMLTextAreaElement = sandbox.HTMLTextAreaElement;
  sandbox.window.HTMLInputElement = sandbox.HTMLInputElement;
  sandbox.unsafeWindow = sandbox.window;
  sandbox.document = { querySelector: () => null, querySelectorAll: () => [] };
  if (hasGM) {
    sandbox.GM_getValue = (k, d) => (k in gmStore ? gmStore[k] : d);
    sandbox.GM_setValue = (k, v) => { gmStore[k] = v; };
    sandbox.GM_xmlhttpRequest = (opts) => {
      captured.lastGmRequest = opts;
      Promise.resolve().then(() => {
        try {
          const res = (fetchImpl || defaultFetch)(opts);
          opts.onload(res);
        } catch (e) { opts.onerror(e); }
      });
    };
  }
  // fetch is intentionally NOT provided unless a scenario explicitly wants
  // to exercise the CSP-risk fallback path — a real hardened host's CSP
  // would throw/block this before it ever reached the network.
  if (fetchImpl === 'fetch-blocked-by-csp') {
    sandbox.fetch = () => { throw new Error('Refused to connect because it violates the Content Security Policy directive: "connect-src \'self\'"'); };
  }
  vm.createContext(sandbox);
  return { sandbox, captured, gmStore };
}

function defaultFetch() { return { status: 200, responseText: '[]' }; }

async function run() {
  console.log('\n== mastermind-ai-bridge.user.js — browser-tab link ==');

  await t('missing __CGL_BRIDGE__: fails loudly once, never starts polling', async () => {
    const { sandbox, captured } = makeSandbox({ hasBridge: false });
    new vm.Script(CODE).runInContext(sandbox);
    assert.ok(captured.errors.some((e) => e.includes('__CGL_BRIDGE__ is missing')));
    assert.strictEqual(captured.intervalFn, null, 'must not start the poll loop with no bridge');
  });

  await t('GM_xmlhttpRequest missing (bad @grant): warns about CSP risk instead of failing silently', async () => {
    const { sandbox, captured } = makeSandbox({ hasGM: false, fetchImpl: 'fetch-blocked-by-csp' });
    new vm.Script(CODE).runInContext(sandbox);
    assert.ok(captured.errors.some((e) => e.includes('GM_xmlhttpRequest is not available')));
  });

  await t('unrecognised host: warns and does not start polling', async () => {
    const { sandbox, captured } = makeSandbox({ host: 'evil.example.com' });
    new vm.Script(CODE).runInContext(sandbox);
    assert.ok(captured.warns.some((w) => w.includes('not a recognised AI host')));
    assert.strictEqual(captured.intervalFn, null);
  });

  await t('happy path via GM_xmlhttpRequest: poll -> compose -> send -> settle -> ingest -> delete', async () => {
    const composer = { tagName: 'TEXTAREA', value: '', focus() {}, dispatchEvent() {} };
    const sendBtn = { disabled: false, clicked: 0, click() { this.clicked++; composer.value = ''; } };
    let blockCount = 0;
    const requests = [];
    const fetchImpl = (opts) => {
      requests.push(opts);
      if (opts.method === 'GET' && opts.url.includes('mastermind-requests')) {
        return { status: 200, responseText: requests.filter(r => r.method === 'GET').length === 1
          ? JSON.stringify([{ id: 'req-1', agent: 'claude', prompt: 'ping' }]) : '[]' };
      }
      if (opts.method === 'POST' && opts.url.includes('/ingest')) return { status: 200, responseText: '{}' };
      if (opts.method === 'DELETE') return { status: 200, responseText: '{}' };
      return { status: 200, responseText: '{}' };
    };
    const { sandbox, captured, gmStore } = makeSandbox({ fetchImpl });
    sandbox.document.querySelector = (sel) => {
      if (sel === 'textarea') return composer;
      if (sel === 'button[aria-label*="Send" i]') return sendBtn;
      return null;
    };
    const blockEl = { innerText: '' };
    sandbox.document.querySelectorAll = (sel) => {
      if (sel === '[data-testid="conversation-turn"]') return blockCount ? [blockEl] : [];
      return [];
    };
    new vm.Script(CODE).runInContext(sandbox);
    assert.ok(captured.intervalFn, 'poll loop should have registered');

    // Fires shortly after handleRequest captures its pre-send block count
    // (captured almost immediately), simulating the reply streaming in
    // after the prompt was sent. Settle detection then needs SETTLE_CHECKS
    // (3) consecutive stable reads, SETTLE_INTERVAL_MS (1000) apart, on
    // top of the composer's own 400ms delay — budget real wall-clock time
    // for that instead of racing it.
    setTimeout(() => { blockEl.innerText = 'pong'; blockCount = 1; }, 600);
    await captured.intervalFn(); // drives the poll() the real setInterval would have fired
    await new Promise((r) => setTimeout(r, 6500));

    const ingest = requests.find((r) => r.method === 'POST' && r.url.includes('/ingest') && JSON.parse(r.data).table === 'mastermind-responses');
    assert.ok(ingest, 'expected a response ingest call');
    const body = JSON.parse(ingest.data);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.text, 'pong');
    assert.ok(requests.some((r) => r.method === 'DELETE'), 'processed request should be deleted so no other tab re-answers it');
    assert.ok(requests.every((r) => r.headers['X-CGL-Token'] === 'tok-123'), 'every call must carry the auth token');
  });

  await t('guardian-lite rejects the token (401): surfaced as a named error, not a silent retry loop', async () => {
    const fetchImpl = () => ({ status: 401, responseText: '' });
    const { sandbox, captured } = makeSandbox({ fetchImpl });
    new vm.Script(CODE).runInContext(sandbox);
    await captured.intervalFn();
    await new Promise((r) => setImmediate(r));
    assert.ok(captured.errors.some((e) => e.includes('poll failed') && e.includes('rejected the token')));
  });

  await t('not signed in on this tab: posts NO_COMPOSER back instead of hanging', async () => {
    const requests = [];
    const fetchImpl = (opts) => {
      requests.push(opts);
      if (opts.method === 'GET') return { status: 200, responseText: requests.filter(r=>r.method==='GET').length===1 ? JSON.stringify([{ id: 'r2', agent: 'claude', prompt: 'hi' }]) : '[]' };
      return { status: 200, responseText: '{}' };
    };
    const { sandbox, captured } = makeSandbox({ fetchImpl });
    sandbox.document.querySelector = () => null; // nothing on the page — signed out
    new vm.Script(CODE).runInContext(sandbox);
    await captured.intervalFn();
    await new Promise((r) => setImmediate(r));
    const ingest = requests.find((r) => r.method === 'POST' && r.url.includes('/ingest'));
    assert.ok(ingest, 'expected an ingest call reporting the failure');
    const body = JSON.parse(ingest.data);
    assert.strictEqual(body.ok, false);
    assert.match(body.error, /^NO_COMPOSER/);
  });

  await t('dedupe persists across a page reload (GM storage), same request id is not answered twice', async () => {
    const store = {};
    const row = { id: 'dupe-1', agent: 'claude', prompt: 'once only' };
    let gets = 0;
    const fetchImpl = (opts) => {
      if (opts.method === 'GET') { gets++; return { status: 200, responseText: JSON.stringify([row]) }; }
      return { status: 200, responseText: '{}' };
    };
    const s1 = makeSandbox({ fetchImpl, gmStore: store });
    s1.sandbox.document.querySelector = () => null; // signed out -> still marks processed before returning
    new vm.Script(CODE).runInContext(s1.sandbox);
    await s1.captured.intervalFn();
    await new Promise((r) => setImmediate(r));
    assert.ok(store['mastermind_ai_bridge_processed_ids'], 'processed id should have been persisted via GM_setValue');

    // "reload the tab" — fresh sandbox, SAME gmStore
    const s2 = makeSandbox({ fetchImpl, gmStore: store });
    s2.sandbox.document.querySelector = () => null;
    new vm.Script(CODE).runInContext(s2.sandbox);
    await s2.captured.intervalFn();
    await new Promise((r) => setImmediate(r));
    // handleRequest should have short-circuited on the id already being
    // processed — no second /ingest failure report for the same row.
    assert.strictEqual(s2.captured.errors.filter((e) => e.includes('NO_COMPOSER')).length, 0,
      'a dedup-persisted request must not be reprocessed after reload');
  });

  const fails = summary('mastermind-ai-bridge.user.js');
  process.exitCode = fails ? 1 : 0;
}

run();
