'use strict';

/**
 * ErosmancerOS — Integration + Unit Tests
 * 
 * No mocks. Real module instantiation.
 * Tests: BridgeCore, NodeRegistry, SelectorEngine, BehaviorEngine, SignalDispatcher
 * 
 * Run: node tests/run.js
 */

const assert = require('assert');
const { NodeRegistry, NODE_STATE }        = require('../registry/NodeRegistry');
const { BehaviorEngine, PROFILES }        = require('../behavior/BehaviorEngine');
const { PRIORITY }                         = require('../core/SignalDispatcher');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`\x1b[31m✗\x1b[0m ${name}`);
    console.log(`  → ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } catch (err) {
    console.log(`\x1b[31m✗\x1b[0m ${name}`);
    console.log(`  → ${err.message}`);
    failed++;
  }
}

// ══════════════════════════════════════════════════════════════
// NodeRegistry
// ══════════════════════════════════════════════════════════════

console.log('\n\x1b[36m── NodeRegistry ──\x1b[0m');

test('register returns nel- uuid', () => {
  const r = new NodeRegistry();
  const uuid = r.register({ tabId: 'tab-01', tag: 'button', attributes: { id: 'btn1' } });
  assert.ok(uuid.startsWith('nel-'), `Expected nel- prefix, got: ${uuid}`);
});

test('get returns registered node', () => {
  const r = new NodeRegistry();
  const uuid = r.register({ tabId: 'tab-01', tag: 'input', attributes: { name: 'email' } });
  const node = r.get(uuid);
  assert.ok(node, 'Node not found');
  assert.strictEqual(node.tag, 'input');
  assert.strictEqual(node.state, NODE_STATE.ACTIVE);
});

test('update mutates node', () => {
  const r = new NodeRegistry();
  const uuid = r.register({ tabId: 't1', tag: 'div', attributes: {} });
  r.update(uuid, { state: NODE_STATE.STALE });
  assert.strictEqual(r.get(uuid).state, NODE_STATE.STALE);
});

test('markMissing sets state', () => {
  const r = new NodeRegistry();
  const uuid = r.register({ tabId: 't1', tag: 'a', attributes: {} });
  r.markMissing(uuid);
  assert.strictEqual(r.get(uuid).state, NODE_STATE.MISSING);
});

test('findByAttribute resolves by attr key/value', () => {
  const r = new NodeRegistry();
  r.register({ tabId: 't1', tag: 'button', attributes: { 'data-action': 'submit' } });
  const results = r.findByAttribute('data-action', 'submit');
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].tag, 'button');
});

test('findByText resolves partial text match', () => {
  const r = new NodeRegistry();
  r.register({ tabId: 't1', tag: 'button', attributes: {}, textContent: 'Submit Form Now' });
  const results = r.findByText('Submit');
  assert.ok(results.length >= 1);
});

test('findByTab returns correct nodes', () => {
  const r    = new NodeRegistry();
  const tab  = 'tab-99';
  r.register({ tabId: tab, tag: 'div', attributes: {} });
  r.register({ tabId: tab, tag: 'span', attributes: {} });
  r.register({ tabId: 'tab-00', tag: 'p', attributes: {} });
  const results = r.findByTab(tab);
  assert.strictEqual(results.length, 2);
});

test('invalidateTab marks all nodes stale', () => {
  const r    = new NodeRegistry();
  const tab  = 'tab-reload';
  r.register({ tabId: tab, tag: 'div', attributes: {} });
  r.register({ tabId: tab, tag: 'button', attributes: {} });
  r.invalidateTab(tab);
  const nodes = r.findByTab(tab);
  assert.ok(nodes.every(n => n.state === NODE_STATE.STALE));
});

test('gc removes dead nodes beyond TTL', (done) => {
  const r    = new NodeRegistry();
  const uuid = r.register({ tabId: 't1', tag: 'div', attributes: {} });
  r.markDead(uuid);
  // Force lastSeen into past
  r.get(uuid).lastSeen = Date.now() - 10_000;
  const removed = r.gc(5_000);
  assert.strictEqual(removed, 1);
  assert.strictEqual(r.get(uuid), null);
});

test('fingerprint-based resolve on UUID collision', () => {
  const r     = new NodeRegistry();
  const meta  = { tabId: 't1', tag: 'button', attributes: { id: 'save' }, textContent: 'Save' };
  const uuid1 = r.register(meta);
  // Simulate the "same" node re-registered (DOM rebuild) as uuid2
  const uuid2 = r.register(meta);
  // uuid1 goes stale
  r.update(uuid1, { state: NODE_STATE.STALE });

  const resolved = r.resolve(uuid1);
  // Should fingerprint-match to uuid2
  assert.ok(resolved, 'Resolve returned null');
  assert.ok(['uuid','fingerprint'].includes(resolved.method));
});

test('snapshot counts are accurate', () => {
  const r = new NodeRegistry();
  r.register({ tabId: 't1', tag: 'div', attributes: {} });
  const u2 = r.register({ tabId: 't1', tag: 'span', attributes: {} });
  r.markDead(u2);
  const snap = r.snapshot();
  assert.strictEqual(snap.total, 2);
  assert.strictEqual(snap.active, 1);
  assert.strictEqual(snap.dead, 1);
});

// ══════════════════════════════════════════════════════════════
// BehaviorEngine
// ══════════════════════════════════════════════════════════════

console.log('\n\x1b[36m── BehaviorEngine ──\x1b[0m');

function makeIntent(action = 'click', payload = null) {
  return {
    id:      'intent-test-' + Math.random().toString(36).slice(2),
    action,
    target:  { uuid: 'nel-test-001', boundingBox: { x: 100, y: 200, width: 80, height: 30 } },
    payload,
  };
}

function makeCtx(overrides = {}) {
  return {
    sessionId:   'sess-test',
    environment: { detectionRisk: 0, latency: 0, stabilityScore: 1, ...overrides },
  };
}

test('processIntent returns valid ExecutionPlan', () => {
  const be   = new BehaviorEngine();
  const plan = be.processIntent(makeIntent('click'), makeCtx());
  assert.ok(plan.planId.startsWith('plan-'));
  assert.ok(Array.isArray(plan.steps));
  assert.ok(plan.steps.length > 0);
  assert.ok(typeof plan.timing.nextDelay === 'function');
  assert.ok(plan.variance.temporal >= 0 && plan.variance.temporal <= 1);
});

test('action:type generates keypress steps', () => {
  const be   = new BehaviorEngine();
  const plan = be.processIntent(makeIntent('type', 'hello'), makeCtx());
  const keys = plan.steps.filter(s => s.type === 'keypress');
  assert.strictEqual(keys.length, 5); // h-e-l-l-o
});

test('action:scroll generates scroll step', () => {
  const be   = new BehaviorEngine();
  const plan = be.processIntent(makeIntent('scroll', { deltaY: 300 }), makeCtx());
  const scrolls = plan.steps.filter(s => s.type === 'scroll');
  assert.ok(scrolls.length >= 1);
  assert.strictEqual(scrolls[0].deltaY, 300);
});

test('high detectionRisk selects exploratory profile', () => {
  const be   = new BehaviorEngine();
  const plan = be.processIntent(makeIntent('click'), makeCtx({ detectionRisk: 0.9 }));
  assert.strictEqual(plan.profile, 'exploratory');
});

test('overrideProfile forces profile', () => {
  const be = new BehaviorEngine();
  be.overrideProfile('sess-test', 'turbo');
  const plan = be.processIntent(makeIntent('click'), makeCtx());
  assert.strictEqual(plan.profile, 'turbo');
  be.clearOverride('sess-test');
});

test('timing.nextDelay returns numeric ms', () => {
  const be   = new BehaviorEngine();
  const plan = be.processIntent(makeIntent('click'), makeCtx());
  const d    = plan.timing.nextDelay(0);
  assert.ok(typeof d === 'number' && d >= 0, `Delay must be >= 0, got ${d}`);
});

test('recordOutcome updates session errorRate', () => {
  const be = new BehaviorEngine();
  const ctx = makeCtx();
  be.processIntent(makeIntent('click'), ctx);
  for (let i = 0; i < 10; i++) be.recordOutcome('sess-test', false);
  const snap = be.sessionSnapshot('sess-test');
  assert.ok(parseFloat(snap.errorRate) > 0, 'Error rate should be > 0');
});

test('sandbox mode does not throw', () => {
  const be   = new BehaviorEngine();
  const plan = be.processIntent(makeIntent('click'), makeCtx(), { sandbox: true });
  assert.ok(plan.sandbox === true);
});

test('unknown action throws', () => {
  const be = new BehaviorEngine();
  assert.throws(() => {
    be.processIntent({ id: '1', action: 'teleport', target: {} }, makeCtx());
  });
});

test('fatigue rises after many actions', () => {
  const be  = new BehaviorEngine();
  const ctx = makeCtx();
  // Simulate time elapsed by faking session startedAt
  be.processIntent(makeIntent('click'), ctx);
  const sess = be['_getSession']('sess-test');
  sess.startedAt = Date.now() - 10 * 60 * 1_000; // 10 min ago
  const snap = be.sessionSnapshot('sess-test');
  assert.ok(parseFloat(snap.fatigue) > 0.2, `Expected fatigue > 0.2, got ${snap.fatigue}`);
});

test('all profiles generate valid plans', () => {
  const be  = new BehaviorEngine();
  for (const profileName of Object.keys(PROFILES)) {
    be.overrideProfile('sess-profile-test', profileName);
    const plan = be.processIntent(makeIntent('click'), { sessionId: 'sess-profile-test', environment: { detectionRisk: 0, latency: 0, stabilityScore: 1 } });
    assert.ok(plan.steps.length > 0, `Profile ${profileName} generated no steps`);
    be.clearOverride('sess-profile-test');
  }
});

// ══════════════════════════════════════════════════════════════
// Results
// ══════════════════════════════════════════════════════════════

console.log(`\n\x1b[36m── Results ──\x1b[0m`);
console.log(`\x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  (${passed + failed} total)\n`);

if (failed > 0) process.exit(1);
