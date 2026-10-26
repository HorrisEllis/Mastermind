/**
 * Observer + Enforcement Tests — 55 tests
 *
 * OB-1..9   createObserverBus — creation, scopeId, contextType
 * OB-10..19 subscribe — filter types, predicate, off(), active
 * OB-20..26 emit — handler calls, errors caught, revocation
 * OB-27..29 subscribeToKernel — forwards kernel events
 * OB-30     CI-1 scoping: live bus cannot receive replay events
 *
 * EN-1..5   INVARIANTS registry — count, structure, lookup
 * EN-6..12  RuntimeGuard — assert hard/soft, counts, error type
 * EN-13..22 BoundaryIndex — record, get, report, violations
 * EN-23..25 checkKernelInvariants — runs and records results
 */

import {
  suite, test, assert, assertEqual, assertThrows,
  assertNotNull, report, reset,
} from '../runner.js';

import {
  createObserverBus,
  OBSERVER_BUS_LIVE, OBSERVER_BUS_REPLAY,
} from '../../src/observer/index.js';

import {
  createBoundaryIndex, createRuntimeGuard, checkKernelInvariants,
  INVARIANTS, getInvariant, InvariantViolationError,
} from '../../src/enforcement/index.js';

import { createKernel } from '../../src/kernel/index.js';
import { createAdapter } from '../../src/adapter/index.js';

reset();

// ── OB-1..9: createObserverBus ────────────────────────────────────────────────

suite('ob.OB1-9-create', () => {
  test('OB-1 requires non-empty scopeId', () => {
    assertThrows(() => createObserverBus('', 'live'), 'non-empty string');
  });
  test('OB-2 requires valid contextType', () => {
    assertThrows(() => createObserverBus('ctx:1', 'unknown'), 'live');
  });
  test('OB-3 creates bus with scopeId', () => {
    const bus = createObserverBus('ctx:live:1', OBSERVER_BUS_LIVE);
    assertEqual(bus.scopeId, 'ctx:live:1');
  });
  test('OB-4 contextType is preserved', () => {
    const live   = createObserverBus('l1', OBSERVER_BUS_LIVE);
    const replay = createObserverBus('r1', OBSERVER_BUS_REPLAY);
    assertEqual(live.contextType,   OBSERVER_BUS_LIVE);
    assertEqual(replay.contextType, OBSERVER_BUS_REPLAY);
  });
  test('OB-5 initial subscriptionCount is 0', () => {
    assertEqual(createObserverBus('x', OBSERVER_BUS_LIVE).subscriptionCount, 0);
  });
  test('OB-6 initial emitCount is 0', () => {
    assertEqual(createObserverBus('x', OBSERVER_BUS_LIVE).emitCount, 0);
  });
  test('OB-7 initial revoked is false', () => {
    assertEqual(createObserverBus('x', OBSERVER_BUS_LIVE).revoked, false);
  });
  test('OB-8 OBSERVER_BUS_LIVE is "live"', () => {
    assertEqual(OBSERVER_BUS_LIVE, 'live');
  });
  test('OB-9 OBSERVER_BUS_REPLAY is "replay"', () => {
    assertEqual(OBSERVER_BUS_REPLAY, 'replay');
  });
});

// ── OB-10..19: subscribe ──────────────────────────────────────────────────────

suite('ob.OB10-19-subscribe', () => {
  test('OB-10 string filter matches by event type', () => {
    const bus = createObserverBus('s1', OBSERVER_BUS_LIVE);
    let   hit = null;
    bus.subscribe('page:navigated', ev => { hit = ev; });
    bus.emit({ type: 'page:navigated', id: 'e1' });
    assertNotNull(hit);
    assertEqual(hit.type, 'page:navigated');
  });
  test('OB-11 string filter does not fire for other types', () => {
    const bus = createObserverBus('s2', OBSERVER_BUS_LIVE);
    let   hit = false;
    bus.subscribe('page:navigated', () => { hit = true; });
    bus.emit({ type: 'command:running', id: 'e2' });
    assert(!hit);
  });
  test('OB-12 predicate filter', () => {
    const bus = createObserverBus('s3', OBSERVER_BUS_LIVE);
    let   hit = null;
    bus.subscribe(ev => ev.type.startsWith('command:'), ev => { hit = ev; });
    bus.emit({ type: 'command:success', id: 'e3' });
    assertNotNull(hit);
  });
  test('OB-13 subscribe requires function handler', () => {
    assertThrows(() => createObserverBus('s4', OBSERVER_BUS_LIVE).subscribe('t', 'not-fn'), 'fn must be a function');
  });
  test('OB-14 subscribe requires non-null filter', () => {
    assertThrows(() => createObserverBus('s5', OBSERVER_BUS_LIVE).subscribe(null, () => {}), 'filter');
  });
  test('OB-15 subscribe returns Observer with off() and active', () => {
    const bus = createObserverBus('s6', OBSERVER_BUS_LIVE);
    const obs = bus.subscribe('t', () => {});
    assert(typeof obs.off    === 'function');
    assert(typeof obs.active === 'boolean');
    assert(obs.active === true);
  });
  test('OB-16 off() removes subscription', () => {
    const bus = createObserverBus('s7', OBSERVER_BUS_LIVE);
    let   n   = 0;
    const obs = bus.subscribe('t', () => { n++; });
    bus.emit({ type: 't' });
    assertEqual(n, 1);
    obs.off();
    bus.emit({ type: 't' });
    assertEqual(n, 1, 'should not fire after off()');
  });
  test('OB-17 active is false after off()', () => {
    const bus = createObserverBus('s8', OBSERVER_BUS_LIVE);
    const obs = bus.subscribe('t', () => {});
    obs.off();
    assert(!obs.active);
  });
  test('OB-18 multiple subscribers on same type all fire', () => {
    const bus = createObserverBus('s9', OBSERVER_BUS_LIVE);
    let   a = 0, b = 0;
    bus.subscribe('t', () => { a++; });
    bus.subscribe('t', () => { b++; });
    bus.emit({ type: 't' });
    assertEqual(a, 1); assertEqual(b, 1);
  });
  test('OB-19 subscriptionCount tracks active subs', () => {
    const bus = createObserverBus('s10', OBSERVER_BUS_LIVE);
    const o1  = bus.subscribe('t', () => {});
    const o2  = bus.subscribe('t', () => {});
    assertEqual(bus.subscriptionCount, 2);
    o1.off();
    assertEqual(bus.subscriptionCount, 1);
  });
});

// ── OB-20..26: emit ───────────────────────────────────────────────────────────

suite('ob.OB20-26-emit', () => {
  test('OB-20 emitCount increments on each emit', () => {
    const bus = createObserverBus('e1', OBSERVER_BUS_LIVE);
    bus.subscribe('t', () => {});
    bus.emit({ type: 't' });
    bus.emit({ type: 't' });
    assertEqual(bus.emitCount, 2);
  });
  test('OB-21 handler errors do not halt emission', () => {
    const bus = createObserverBus('e2', OBSERVER_BUS_LIVE);
    let   b   = 0;
    bus.subscribe('t', () => { throw new Error('handler boom'); });
    bus.subscribe('t', () => { b++; });
    bus.emit({ type: 't' }); // should not throw
    assertEqual(b, 1, 'second handler should still fire');
  });
  test('OB-22 emit non-object is no-op', () => {
    const bus = createObserverBus('e3', OBSERVER_BUS_LIVE);
    bus.emit(null);   // should not throw
    bus.emit('str');  // should not throw
    assertEqual(bus.emitCount, 0);
  });
  test('OB-23 revoke() sets revoked=true', () => {
    const bus = createObserverBus('e4', OBSERVER_BUS_LIVE);
    bus.revoke();
    assert(bus.revoked);
  });
  test('OB-24 emit on revoked bus throws', () => {
    const bus = createObserverBus('e5', OBSERVER_BUS_LIVE);
    bus.revoke();
    assertThrows(() => bus.emit({ type: 't' }), 'revoked');
  });
  test('OB-25 revoke clears all subscriptions', () => {
    const bus = createObserverBus('e6', OBSERVER_BUS_LIVE);
    bus.subscribe('t', () => {});
    bus.subscribe('t', () => {});
    bus.revoke();
    assertEqual(bus.subscriptionCount, 0);
  });
  test('OB-26 Observer is frozen', () => {
    const obs = createObserverBus('e7', OBSERVER_BUS_LIVE).subscribe('t', () => {});
    assert(Object.isFrozen(obs));
  });
});

// ── OB-27..29: subscribeToKernel ─────────────────────────────────────────────

suite('ob.OB27-29-kernel-wiring', () => {
  test('OB-27 subscribeToKernel forwards kernel events to bus', () => {
    const k   = createKernel();
    const bus = createObserverBus('ctx:live:k1', OBSERVER_BUS_LIVE);
    let   hit = null;
    bus.subscribe('command:running', ev => { hit = ev; });
    bus.subscribeToKernel(k);
    k.ingest('command:running', { action: 'click' }, { source: 'test' });
    assertNotNull(hit);
    assertEqual(hit.type, 'command:running');
  });
  test('OB-28 subscribeToKernel returns unsubscribe fn', () => {
    const k    = createKernel();
    const bus  = createObserverBus('ctx:live:k2', OBSERVER_BUS_LIVE);
    let   hits = 0;
    bus.subscribe('t', () => { hits++; });
    const unsub = bus.subscribeToKernel(k);
    k.ingest('t', {}, { source: 'test' });
    assertEqual(hits, 1);
    unsub();
    k.ingest('t', {}, { source: 'test' });
    assertEqual(hits, 1, 'should not receive after unsub');
  });
  test('OB-29 subscribeToKernel requires valid kernel', () => {
    const bus = createObserverBus('x', OBSERVER_BUS_LIVE);
    assertThrows(() => bus.subscribeToKernel({}), 'subscribe');
  });
});

// ── OB-30: CI-1 scoping ───────────────────────────────────────────────────────

suite('ob.OB30-CI1-scoping', () => {
  test('OB-30 live bus cannot receive events from a replay kernel', () => {
    const liveKernel   = createKernel();
    const replayKernel = createKernel(); // simulates replay context kernel

    const liveBus   = createObserverBus('ctx:live:1',   OBSERVER_BUS_LIVE);
    const replayBus = createObserverBus('ctx:replay:1', OBSERVER_BUS_REPLAY);

    let liveReceived   = 0;
    let replayReceived = 0;

    liveBus.subscribeToKernel(liveKernel);
    replayBus.subscribeToKernel(replayKernel);

    liveBus.subscribe('any:event',   () => { liveReceived++; });
    replayBus.subscribe('any:event', () => { replayReceived++; });

    // Ingest into replay kernel only
    replayKernel.ingest('any:event', {}, { source: 'test' });

    assertEqual(replayReceived, 1, 'replay bus should receive');
    assertEqual(liveReceived,   0, 'CI-1: live bus must not receive replay events');
  });
});

// ── EN-1..5: INVARIANTS registry ──────────────────────────────────────────────

suite('en.EN1-5-invariants-registry', () => {
  test('EN-1 INVARIANTS has exactly 25 entries', () => {
    assertEqual(INVARIANTS.length, 25);
  });
  test('EN-2 all invariant ids are unique', () => {
    const ids    = INVARIANTS.map(i => i.id);
    const unique = new Set(ids);
    assertEqual(unique.size, 25);
  });
  test('EN-3 each invariant has id, group, severity, description', () => {
    for (const inv of INVARIANTS) {
      assert(typeof inv.id          === 'string', `${inv.id}: id`);
      assert(typeof inv.group       === 'string', `${inv.id}: group`);
      assert(typeof inv.description === 'string', `${inv.id}: description`);
      assert(inv.severity === 'hard' || inv.severity === 'soft', `${inv.id}: severity`);
    }
  });
  test('EN-4 getInvariant returns correct entry', () => {
    const inv = getInvariant('I-1');
    assertNotNull(inv);
    assertEqual(inv.id,    'I-1');
    assertEqual(inv.group, 'identity');
  });
  test('EN-5 getInvariant returns null for unknown id', () => {
    assertEqual(getInvariant('X-99'), null);
  });
});

// ── EN-6..12: RuntimeGuard ────────────────────────────────────────────────────

suite('en.EN6-12-runtime-guard', () => {
  test('EN-6 assert true passes silently', () => {
    const g = createRuntimeGuard();
    assert(g.assert('I-1', true) === true);
    assertEqual(g.violationCount, 0);
  });
  test('EN-7 assert false on hard invariant throws InvariantViolationError', () => {
    const g = createRuntimeGuard();
    assertThrows(() => g.assert('I-1', false, 'bad id'), 'INVARIANT VIOLATION I-1');
  });
  test('EN-8 thrown error is InvariantViolationError', () => {
    const g = createRuntimeGuard();
    let err = null;
    try { g.assert('I-1', false, 'test'); } catch(e) { err = e; }
    assert(err instanceof InvariantViolationError);
    assertEqual(err.invariantId, 'I-1');
    assert(typeof err.context === 'object');
    assert(typeof err.ts      === 'number');
  });
  test('EN-9 soft invariant violation logs but does not throw', () => {
    const g = createRuntimeGuard();
    // VM-3 is soft
    let threw = false;
    try { g.assert('VM-3', false, 'soft violation'); } catch (_) { threw = true; }
    assert(!threw, 'soft violation should not throw');
    assertEqual(g.violationCount, 1);
  });
  test('EN-10 assertionCount increments on every call', () => {
    const g = createRuntimeGuard();
    g.assert('I-1', true);
    g.assert('I-2', true);
    try { g.assert('I-1', false); } catch (_) {}
    assertEqual(g.assertionCount, 3);
  });
  test('EN-11 violationCount increments on each failure', () => {
    const g = createRuntimeGuard();
    try { g.assert('I-1', false); } catch (_) {}
    g.assert('VM-3', false); // soft
    assertEqual(g.violationCount, 2);
  });
  test('EN-12 InvariantViolationError message includes invariantId', () => {
    const g = createRuntimeGuard();
    let msg = '';
    try { g.assert('C-4', false, 'gates fired after listeners'); } catch(e) { msg = e.message; }
    assert(msg.includes('C-4'));
    assert(msg.includes('[enforcement]'));
  });
});

// ── EN-13..22: BoundaryIndex ──────────────────────────────────────────────────

suite('en.EN13-22-boundary-index', () => {
  test('EN-13 has 25 invariants registered', () => {
    assertEqual(createBoundaryIndex().size, 25);
  });
  test('EN-14 all start as unchecked', () => {
    const idx    = createBoundaryIndex();
    const report = idx.report();
    assertEqual(report.unchecked,  25);
    assertEqual(report.ok,         0);
    assertEqual(report.violations, 0);
  });
  test('EN-15 record ok transitions status', () => {
    const idx = createBoundaryIndex();
    idx.record('I-1', true);
    assertEqual(idx.get('I-1').status, 'ok');
  });
  test('EN-16 record violation transitions status', () => {
    const idx = createBoundaryIndex();
    idx.record('I-1', false, 'bad uuid');
    const entry = idx.get('I-1');
    assertEqual(entry.status,         'violation');
    assertEqual(entry.violationCount,  1);
    assertNotNull(entry.lastViolation);
    assertEqual(entry.lastViolation.detail, 'bad uuid');
  });
  test('EN-17 record unknown id throws', () => {
    assertThrows(() => createBoundaryIndex().record('X-99', true), 'unknown invariant');
  });
  test('EN-18 get returns null for unknown id', () => {
    assertEqual(createBoundaryIndex().get('X-99'), null);
  });
  test('EN-19 violations() returns ids of violated invariants', () => {
    const idx = createBoundaryIndex();
    idx.record('I-1', false, 'bad');
    idx.record('C-4', false, 'bad');
    const v = idx.violations();
    assert(v.includes('I-1'));
    assert(v.includes('C-4'));
    assertEqual(v.length, 2);
  });
  test('EN-20 report healthy=true when no violations', () => {
    const idx = createBoundaryIndex();
    for (const id of idx.allIds) idx.record(id, true);
    assert(idx.report().healthy);
  });
  test('EN-21 report healthy=false when any violation', () => {
    const idx = createBoundaryIndex();
    idx.record('I-1', false, 'bad');
    assert(!idx.report().healthy);
  });
  test('EN-22 violationCount accumulates on repeated failures', () => {
    const idx = createBoundaryIndex();
    idx.record('H-1', false, 'first');
    idx.record('H-1', false, 'second');
    assertEqual(idx.get('H-1').violationCount, 2);
  });
});

// ── EN-23..25: checkKernelInvariants ─────────────────────────────────────────

suite('en.EN23-25-check-kernel', () => {
  test('EN-23 runs on populated kernel and returns ok=true', () => {
    const k   = createKernel();
    const a   = createAdapter(k);
    for (let i = 0; i < 10; i++) {
      a.handle('element:callto:running',  { id: `c${i}`, action: 'click' });
      a.handle('element:callto:resolved', { id: `c${i}`, status: 'ok' });
    }
    const idx    = createBoundaryIndex();
    const result = checkKernelInvariants(k, idx);
    assertEqual(result.ok, true, `violations: ${JSON.stringify(result.violations)}`);
    assert(result.checked > 0);
  });
  test('EN-24 checkKernelInvariants records results in BoundaryIndex', () => {
    const k   = createKernel();
    k.ingest('test', {}, { source: 'test' });
    const idx = createBoundaryIndex();
    checkKernelInvariants(k, idx);
    // At least I-1 should have been checked
    assert(idx.get('I-1').status !== 'unchecked');
  });
  test('EN-25 BoundaryIndex.allIds contains all 25 invariant ids', () => {
    const idx = createBoundaryIndex();
    const ids = idx.allIds;
    assert(ids.includes('I-1'));
    assert(ids.includes('CI-6'));
    assert(ids.includes('VM-6'));
    assertEqual(ids.length, 25);
  });
});

export const result = report('observer+enforcement');
