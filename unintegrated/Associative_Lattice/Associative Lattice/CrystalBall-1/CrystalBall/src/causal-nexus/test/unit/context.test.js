/**
 * Context Module Tests — 34 tests
 *
 * Covers:
 *   CTX-1   createLiveContext: requires valid kernel
 *   CTX-2   createLiveContext: has correct type + contextId
 *   CTX-3   createLiveContext: ingest delegates to kernel
 *   CTX-4   createLiveContext: subscribe delegates to kernel
 *   CTX-5   createLiveContext: mountAdapter without sandbox throws
 *   CTX-6   createLiveContext: mountAdapter with sandbox instantiates real adapter
 *   CTX-7   createLiveContext: getAdapter returns null for unknown
 *   CTX-8   createLiveContext: listAdapters tracks mounted names
 *   CTX-9   createLiveContext: context is frozen
 *
 *   CTX-10  createReplayContext: requires snapshot object
 *   CTX-11  createReplayContext: rejects wrong magic
 *   CTX-12  createReplayContext: has correct type + contextId
 *   CTX-13  createReplayContext: getAll returns events
 *   CTX-14  createReplayContext: context is frozen
 *
 *   CI-1    Events in replay kernel cannot reach live kernel listeners
 *   CI-2    Replay clock does not advance live clock
 *   CI-3    Replay ring is independent of live ring
 *   CI-4    FULL adapters are null in replay context
 *   CI-4b   LOCAL_ONLY adapters are null in replay context
 *   CI-4c   READ_ONLY adapters are real in replay context
 *   CI-5    Gate output in replay writes only to replay kernel
 *   CI-6    Same snapshot produces same event count (deterministic)
 *
 *   RUN-1   run() calls onStep for each event
 *   RUN-2   run() may only be called once
 *   RUN-3   run() onStep errors do not halt replay
 *   RUN-4   run() sets done=true
 *
 *   COMP-1  complete() returns frozen record
 *   COMP-2  complete() includes ring + deltaStream
 *   COMP-3  complete() stabilityReport is null (pre-sigma)
 *   COMP-4  complete() works without run()
 *   COMP-5  complete() eventCount matches ring length
 *
 *   CTX-20  contextIds are unique across contexts
 *   CTX-21  live and replay context types are correct constants
 */

import {
  suite, test, assert, assertEqual, assertThrows,
  assertNotNull, report, reset,
} from '../runner.js';

import { createLiveContext, createReplayContext, CONTEXT_LIVE, CONTEXT_REPLAY } from '../../src/context/index.js';
import { createKernel, gateOutput }  from '../../src/kernel/index.js';
import { createAdapter }              from '../../src/adapter/index.js';
import { snapshot }                   from '../../src/compress/index.js';
import { createAdapterSandbox, POLICY_FULL, POLICY_LOCAL_ONLY, POLICY_READ_ONLY } from '../../src/adapter-sandbox/index.js';

reset();

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPopulatedKernel() {
  const k = createKernel({ ringCap: 1000 });
  const a = createAdapter(k);
  a.handle('element:callto:running',  { id: 'c1', action: 'click' });
  a.handle('element:callto:resolved', { id: 'c1', status: 'ok' });
  a.handle('page:navigated', { from: '/', to: '/app' });
  a.handle('dom:changed', { selector: '.btn' });
  a.handle('dom:changed', { selector: '.btn' });
  a.handle('dom:changed', { selector: '.btn' });
  a.handle('dom:changed', { selector: '.btn' });
  a.handle('dom:changed', { selector: '.btn' });
  return k;
}

function makeSnap() {
  return snapshot(buildPopulatedKernel());
}

function makeFactory(label = 'adapter') {
  return (kernel, opts = {}) => ({
    handle:  (n, p) => `${label}:${n}`,
    destroy: ()     => undefined,
    _label:  label,
  });
}

// ── CTX-1..9: createLiveContext ───────────────────────────────────────────────

suite('ctx.CTX1-9-live-context', () => {
  test('CTX-1 requires valid kernel', () => {
    assertThrows(() => createLiveContext(null), 'kernel must be a valid kernel instance');
    assertThrows(() => createLiveContext({}),   'kernel must be a valid kernel instance');
  });
  test('CTX-2 has correct type and contextId', () => {
    const k = createKernel();
    const c = createLiveContext(k);
    assertEqual(c.type, CONTEXT_LIVE);
    assert(typeof c.contextId === 'string' && c.contextId.includes('live'));
  });
  test('CTX-3 ingest delegates to kernel', () => {
    const k = createKernel();
    const c = createLiveContext(k);
    const ev = c.ingest('test:event', { x: 1 }, { source: 'test' });
    assertNotNull(ev);
    assertEqual(ev.type, 'test:event');
    assertEqual(k.length, 1);
  });
  test('CTX-4 subscribe delegates to kernel', () => {
    const k = createKernel();
    const c = createLiveContext(k);
    let seen = null;
    const unsub = c.subscribe(ev => { seen = ev; });
    c.ingest('sub:test', {}, { source: 'test' });
    assertNotNull(seen);
    assertEqual(seen.type, 'sub:test');
    unsub();
  });
  test('CTX-5 mountAdapter without sandbox throws', () => {
    const c = createLiveContext(createKernel());
    assertThrows(() => c.mountAdapter('x'), 'no sandbox');
  });
  test('CTX-6 mountAdapter with sandbox instantiates real adapter', () => {
    const k = createKernel();
    const s = createAdapterSandbox();
    s.register('live-a', makeFactory('live-a'), { policy: POLICY_FULL });
    const c = createLiveContext(k, s);
    const a = c.mountAdapter('live-a');
    assert(!a._isNullAdapter, 'live context adapter should be real');
    assertEqual(a._label, 'live-a');
  });
  test('CTX-7 getAdapter returns null for unknown', () => {
    const c = createLiveContext(createKernel());
    assertEqual(c.getAdapter('nope'), null);
  });
  test('CTX-8 listAdapters tracks mounted names', () => {
    const k = createKernel();
    const s = createAdapterSandbox();
    s.register('aa', makeFactory(), { policy: POLICY_FULL });
    s.register('bb', makeFactory(), { policy: POLICY_READ_ONLY });
    const c = createLiveContext(k, s);
    c.mountAdapter('aa');
    c.mountAdapter('bb');
    const list = c.listAdapters();
    assert(list.includes('aa'));
    assert(list.includes('bb'));
  });
  test('CTX-9 live context is frozen', () => {
    const c = createLiveContext(createKernel());
    assert(Object.isFrozen(c));
  });
});

// ── CTX-10..14: createReplayContext ──────────────────────────────────────────

suite('ctx.CTX10-14-replay-context', () => {
  test('CTX-10 requires snapshot object', () => {
    assertThrows(() => createReplayContext(null),  'snapshot must be a non-null object');
    assertThrows(() => createReplayContext('snap'), 'snapshot must be a non-null object');
  });
  test('CTX-11 rejects wrong magic', () => {
    assertThrows(
      () => createReplayContext({ magic: 'WRONG', fmt: 1 }),
      'NEX-SNAP'
    );
  });
  test('CTX-12 has correct type and contextId', () => {
    const snap = makeSnap();
    const rc   = createReplayContext(snap);
    assertEqual(rc.type, CONTEXT_REPLAY);
    assert(typeof rc.contextId === 'string' && rc.contextId.includes('replay'));
  });
  test('CTX-13 getAll returns events from snapshot', () => {
    const snap = makeSnap();
    const rc   = createReplayContext(snap);
    const all  = rc.getAll();
    assert(Array.isArray(all));
    assert(all.length > 0, 'should have events from snapshot');
  });
  test('CTX-14 replay context is frozen', () => {
    const rc = createReplayContext(makeSnap());
    assert(Object.isFrozen(rc));
  });
});

// ── CI-1..CI-6: isolation invariants ─────────────────────────────────────────

suite('ctx.CI1-structural-bus-isolation', () => {
  test('CI-1 events in replay kernel cannot reach live kernel listeners', () => {
    const liveKernel  = createKernel();
    const snap        = snapshot(buildPopulatedKernel()); // independent kernel
    const replay      = createReplayContext(snap);

    let liveReceived = 0;
    liveKernel.subscribe(() => { liveReceived++; });

    // Stepping replay — events fire in replay kernel only
    replay.run({ onStep: () => {} });

    assertEqual(liveReceived, 0, 'CI-1: live kernel received no events from replay');
  });
});

suite('ctx.CI2-clock-isolation', () => {
  test('CI-2 replay clock does not advance live clock', () => {
    const liveKernel  = createKernel();
    const snap        = snapshot(buildPopulatedKernel());

    const liveTickBefore = liveKernel.clock.tick;
    createReplayContext(snap); // creates and pre-loads replay kernel
    const liveTickAfter  = liveKernel.clock.tick;

    assertEqual(liveTickBefore, liveTickAfter, 'CI-2: live clock unchanged after replay context creation');
  });
});

suite('ctx.CI3-ring-isolation', () => {
  test('CI-3 replay ring is independent of live ring', () => {
    const liveKernel = createKernel();
    liveKernel.ingest('live:event', { x: 1 }, { source: 'test' });

    const snap   = snapshot(buildPopulatedKernel());
    const replay = createReplayContext(snap);

    const liveEvents   = liveKernel.getAll();
    const replayEvents = replay.getAll();

    // Rings are different arrays
    assert(liveEvents !== replayEvents, 'CI-3: different array references');

    // Replay contains snapshot events, not live events
    const hasLiveEvent = replayEvents.some(e => e.type === 'live:event');
    assert(!hasLiveEvent, 'CI-3: replay ring does not contain live events');

    // Live ring does not contain replay events
    const replayTypes = new Set(replayEvents.map(e => e.type));
    const livePolluted = liveEvents.some(e => replayTypes.has(e.type) && e.type !== 'live:event');
    // Note: we check by content not identity — snapshot events have new IDs (I-1)
    assertEqual(liveEvents.length, 1, 'CI-3: live ring unchanged at 1 event');
  });
});

suite('ctx.CI4-adapter-policy', () => {
  test('CI-4 FULL adapters are null in replay context', () => {
    const s = createAdapterSandbox();
    s.register('network', makeFactory('network'), { policy: POLICY_FULL });
    const snap = makeSnap();
    const rc   = createReplayContext(snap, { sandbox: s });
    const a    = rc.getAdapter('network');
    assertNotNull(a);
    assert(a._isNullAdapter === true, 'CI-4: FULL adapter is null in replay');
  });
  test('CI-4b LOCAL_ONLY adapters are null in replay context', () => {
    const s = createAdapterSandbox();
    s.register('local', makeFactory(), { policy: POLICY_LOCAL_ONLY });
    const rc = createReplayContext(makeSnap(), { sandbox: s });
    assert(rc.getAdapter('local')._isNullAdapter === true, 'CI-4b');
  });
  test('CI-4c READ_ONLY adapters are real in replay context', () => {
    const s = createAdapterSandbox();
    s.register('stats', makeFactory('stats'), { policy: POLICY_READ_ONLY });
    const rc = createReplayContext(makeSnap(), { sandbox: s });
    const a  = rc.getAdapter('stats');
    assert(!a._isNullAdapter, 'CI-4c: READ_ONLY adapter is real in replay');
    assertEqual(a._label, 'stats');
  });
});

suite('ctx.CI5-gate-isolation', () => {
  test('CI-5 gates in replay write only to replay kernel', () => {
    const liveKernel = createKernel();
    let liveGateFired = false;
    liveKernel.registerGate('live:sentinel', (ev) => {
      liveGateFired = true;
      return [];
    }, { priority: 50 });

    // Build a snapshot from an independent kernel (no sentinel gate)
    const snap   = snapshot(buildPopulatedKernel());
    const replay = createReplayContext(snap);

    replay.run({ onStep: () => {} });

    assert(!liveGateFired, 'CI-5: live kernel gate never fired during replay');
  });
});

suite('ctx.CI6-determinism', () => {
  test('CI-6 same snapshot produces same event count', () => {
    const snap = makeSnap();
    const rc1  = createReplayContext(snap);
    const rc2  = createReplayContext(snap);
    assertEqual(
      rc1.getAll().length,
      rc2.getAll().length,
      'CI-6: deterministic event count'
    );
  });
  test('CI-6b same snapshot produces same event types in order', () => {
    const snap = makeSnap();
    const rc1  = createReplayContext(snap);
    const rc2  = createReplayContext(snap);
    const types1 = rc1.getAll().map(e => e.type);
    const types2 = rc2.getAll().map(e => e.type);
    assertEqual(types1, types2, 'CI-6b: same type sequence');
  });
});

// ── RUN-1..4 ──────────────────────────────────────────────────────────────────

suite('ctx.RUN1-4-run', () => {
  test('RUN-1 onStep called for each event', () => {
    const snap  = makeSnap();
    const rc    = createReplayContext(snap);
    const total = rc.eventCount;
    let   count = 0;
    rc.run({ onStep: () => { count++; } });
    assertEqual(count, total, 'RUN-1: onStep called for every event');
  });
  test('RUN-2 run() may only be called once', () => {
    const rc = createReplayContext(makeSnap());
    rc.run();
    assertThrows(() => rc.run(), 'may only be called once');
  });
  test('RUN-3 onStep errors do not halt replay', () => {
    const snap  = makeSnap();
    const rc    = createReplayContext(snap);
    let   count = 0;
    rc.run({ onStep: (ev, i) => {
      count++;
      if (i === 2) throw new Error('intentional onStep error');
    }});
    assertEqual(count, rc.eventCount, 'RUN-3: all events stepped despite error');
  });
  test('RUN-4 run() sets done=true', () => {
    const rc = createReplayContext(makeSnap());
    assert(!rc.done);
    rc.run();
    assert(rc.done);
  });
});

// ── COMP-1..5 ─────────────────────────────────────────────────────────────────

suite('ctx.COMP1-5-complete', () => {
  test('COMP-1 complete() returns frozen record', () => {
    const result = createReplayContext(makeSnap()).complete();
    assert(Object.isFrozen(result));
  });
  test('COMP-2 complete() includes ring and deltaStream', () => {
    const result = createReplayContext(makeSnap()).complete();
    assert(Array.isArray(result.ring));
    assert(Array.isArray(result.deltaStream));
    assert(result.ring.length > 0);
    assert(result.deltaStream.length > 0);
  });
  test('COMP-3 stabilityReport is a SigmaResult when data sufficient', () => {
    const result = createReplayContext(makeSnap()).complete();
    // stabilityReport is null only when deltaStream has < 3 records
    if (result.deltaStream.length >= 3) {
      assert(result.stabilityReport !== null, 'should have stabilityReport');
      assert(typeof result.stabilityReport.regime === 'string', 'regime is string');
    }
  });
  test('COMP-4 complete() works without run()', () => {
    const rc     = createReplayContext(makeSnap());
    // Do not call run() — complete() should still work
    const result = rc.complete();
    assertNotNull(result);
    assert(result.ring.length > 0);
  });
  test('COMP-5 eventCount matches ring length', () => {
    const rc     = createReplayContext(makeSnap());
    const result = rc.complete();
    assertEqual(result.eventCount, result.ring.length);
  });
});

// ── CTX-20..21 ───────────────────────────────────────────────────────────────

suite('ctx.CTX20-21-misc', () => {
  test('CTX-20 contextIds are unique across contexts', () => {
    const k  = createKernel();
    const c1 = createLiveContext(k);
    const c2 = createLiveContext(k);
    const r1 = createReplayContext(makeSnap());
    const r2 = createReplayContext(makeSnap());
    const ids = [c1.contextId, c2.contextId, r1.contextId, r2.contextId];
    const unique = new Set(ids);
    assertEqual(unique.size, 4, 'CTX-20: all contextIds unique');
  });
  test('CTX-21 type constants are correct strings', () => {
    assertEqual(CONTEXT_LIVE,   'live');
    assertEqual(CONTEXT_REPLAY, 'replay');
  });
});

export const result = report('context');
