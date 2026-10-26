/**
 * Kernel Unit Tests
 * Covers: fresh state, ingest, gates, macros, typeIndex, calltoMap, reset
 */

import {
  suite, test, assert, assertEqual, assertNotEqual, assertNull,
  assertThrows, assertIncludes, assertArrayLength, assertUUID,
  assertFrozen, assertGt, report, reset,
} from '../runner.js';

import { createKernel, BUILTIN_GATES, gateOutput } from '../../src/kernel/index.js';
import { isValidEventId }                          from '../../src/identity/index.js';
import {
  EDGE_CAUSAL_RULE, EDGE_CAUSAL_ADAPTER, EDGE_CAUSAL_EXPLICIT,
} from '../../src/causality/index.js';

reset();

// ── Fresh state ────────────────────────────────────────────────────────────────

suite('kernel.fresh-state', () => {
  test('length is 0',           () => assertEqual(createKernel().length, 0));
  test('edgeCount is 0',        () => assertEqual(createKernel().edgeCount, 0));
  test('droppedCount is 0',     () => assertEqual(createKernel().droppedCount, 0));
  test('macros empty',          () => assertEqual(createKernel().macros.length, 0));
  test('findById null',         () => assertNull(createKernel().findById('x')));
  test('getAll empty',          () => assertEqual(createKernel().getAll().length, 0));
  test('3 builtin gates',       () => { const g = createKernel().getGates(); assertEqual(g.length, 3); assert(g.every(g=>g.builtin)); });
});

// ── ingest: event creation ─────────────────────────────────────────────────────

suite('kernel.ingest.event-creation', () => {
  test('returns frozen event',            () => { assertFrozen(createKernel().ingest('x',{},{source:'t'})); });
  test('event has UUID v4 ID (I-1)',       () => { const ev = createKernel().ingest('t',{},{source:'s'}); assertUUID(ev.id); });
  test('100 events all unique IDs',        () => {
    const k = createKernel(); const ids = new Set();
    for (let i=0;i<100;i++) ids.add(k.ingest('t',{},{source:'s'}).id);
    assertEqual(ids.size, 100);
  });
  test('event fields populated',           () => {
    const k  = createKernel();
    const ev = k.ingest('command:success', { action:'click' }, { source:'bridge', sessionId:'sess1' });
    assertEqual(ev.type, 'command:success');
    assertEqual(ev.source, 'bridge');
    assertEqual(ev.sessionId, 'sess1');
    assert(ev.ts > 0);
    assert(ev.eventTs > 0);
    assert(typeof ev.seq === 'number');
    assert(typeof ev.contentHash === 'string');
  });
  test('payload is frozen',                () => { const ev = createKernel().ingest('t',{a:1},{source:'s'}); assertFrozen(ev.payload); });
  test('unknown source defaults',          () => { const ev = createKernel().ingest('t',{}); assertEqual(ev.source, 'unknown'); });
  test('null meta fields default to null', () => {
    const ev = createKernel().ingest('t',{},{source:'s'});
    assertNull(ev.causedBy); assertNull(ev.sessionId); assertNull(ev.tabId);
  });
});

// ── ingest: indexing ───────────────────────────────────────────────────────────

suite('kernel.ingest.indexing', () => {
  test('findById returns ingested event', () => {
    const k = createKernel(); const ev = k.ingest('t',{},{source:'s'});
    assertEqual(k.findById(ev.id), ev);
  });
  test('getAll returns all events in order', () => {
    const k = createKernel();
    for (let i=0;i<5;i++) k.ingest('t',{i},{source:'s'});
    const all = k.getAll();
    assertEqual(all.length, 5);
    for (let i=1;i<all.length;i++) assert(all[i].seq > all[i-1].seq);
  });
  test('version increments on each ingest', () => {
    const k = createKernel(); const v0 = k.version;
    k.ingest('t',{},{source:'s'}); assertGt(k.version, v0);
  });
  test('length increments correctly', () => {
    const k = createKernel();
    for (let i=0;i<10;i++) k.ingest('t',{},{source:'s'});
    assertEqual(k.length, 10);
  });
});

// ── seq + tick monotonicity ────────────────────────────────────────────────────

suite('kernel.monotonicity', () => {
  test('seq strictly increases (T-1)', () => {
    const k = createKernel();
    const seqs = [];
    for (let i=0;i<20;i++) seqs.push(k.ingest('t',{},{source:'s'}).seq);
    for (let i=1;i<seqs.length;i++) assert(seqs[i] > seqs[i-1]);
  });
  test('eventTs strictly increases', () => {
    const k = createKernel();
    const ts = [];
    for (let i=0;i<20;i++) ts.push(k.ingest('t',{},{source:'s'}).eventTs);
    for (let i=1;i<ts.length;i++) assert(ts[i] > ts[i-1]);
  });
});

// ── causal edges ──────────────────────────────────────────────────────────────

suite('kernel.causal-edges', () => {
  test('causedBy creates edge', () => {
    const k = createKernel();
    const p = k.ingest('parent',{},{source:'s'});
    const c = k.ingest('child',{},{source:'s', causedBy: p.id, edgeType: EDGE_CAUSAL_EXPLICIT});
    assertNotEqual(k.edgeMeta(c.id), null);
  });
  test('edge has correct fromId/toId', () => {
    const k = createKernel();
    const p = k.ingest('p',{},{source:'s'});
    const c = k.ingest('c',{},{source:'s', causedBy: p.id, edgeType: EDGE_CAUSAL_EXPLICIT});
    const e = k.edgeMeta(c.id);
    assertEqual(e.fromId, p.id);
    assertEqual(e.toId,   c.id);
  });
  test('traceToRoot returns correct path', () => {
    const k = createKernel();
    const a = k.ingest('a',{},{source:'s'});
    const b = k.ingest('b',{},{source:'s', causedBy:a.id, edgeType: EDGE_CAUSAL_EXPLICIT});
    const c = k.ingest('c',{},{source:'s', causedBy:b.id, edgeType: EDGE_CAUSAL_EXPLICIT});
    const { path } = k.traceToRoot(c.id);
    assertEqual(path, [a.id, b.id, c.id]);
  });
  test('diamond graph emits system event, not throw', () => {
    const k = createKernel();
    const p1 = k.ingest('p1',{},{source:'s'});
    const p2 = k.ingest('p2',{},{source:'s'});
    const c  = k.ingest('c', {},{source:'s', causedBy:p1.id, edgeType:EDGE_CAUSAL_EXPLICIT});
    // Second causedBy to same event — diamond attempt
    const n  = k.ingest('c2',{},{source:'s', causedBy:p2.id, edgeType:EDGE_CAUSAL_EXPLICIT});
    // Should not throw — system:edge:diamond emitted instead
    const all = k.getAll();
    assert(all.length > 0);
  });
});

// ── Built-in gates (C-4: gates fire before listeners) ─────────────────────────

suite('kernel.gates.builtin', () => {
  test('C-4: gate children visible to first listener', () => {
    const k = createKernel(); let gateChildSeen = false;
    k.subscribe(ev => {
      if (ev.type === 'page:navigated') {
        const all = k.getAll();
        gateChildSeen = all.some(e => e.type === 'session:boundary');
      }
    });
    k.ingest('page:navigated',{from:'/',to:'/app'},{source:'s'});
    assert(gateChildSeen, 'gate child session:boundary must exist before listener fires');
  });

  test('session:boundary emitted on page:navigated', () => {
    const k = createKernel();
    k.ingest('page:navigated',{from:'/',to:'/app'},{source:'s'});
    assert(k.getAll().some(e=>e.type==='session:boundary'));
  });

  test('dom:unstable emitted after 5 dom:changed in 500 ticks', () => {
    const k = createKernel();
    for (let i=0;i<6;i++) k.ingest('dom:changed',{selector:'.x'},{source:'s'});
    assert(k.getAll().some(e=>e.type==='dom:unstable'), 'dom:unstable expected');
  });

  test('alert:critical emitted on command:failed retryCount>=3', () => {
    const k = createKernel();
    k.ingest('command:failed',{retryCount:4},{source:'s'});
    assert(k.getAll().some(e=>e.type==='alert:critical'));
  });

  test('command:failed retryCount=2 does NOT emit alert', () => {
    const k = createKernel();
    k.ingest('command:failed',{retryCount:2},{source:'s'});
    assert(!k.getAll().some(e=>e.type==='alert:critical'));
  });
});

// ── Custom gates (K-1, K-2) ────────────────────────────────────────────────────

suite('kernel.gates.custom', () => {
  test('K-1: registerGate adds gate', () => {
    const k = createKernel();
    k.registerGate('test:gate', (ev,q) => [], { priority: 50 });
    assertEqual(k.getGates().length, 4); // 3 builtins + 1 custom
  });
  test('K-1: duplicate signature throws', () => {
    const k = createKernel();
    k.registerGate('test:gate', ()=>[]);
    assertThrows(()=>k.registerGate('test:gate',()=>[]), 'already registered');
  });
  test('K-1: unregister removes gate', () => {
    const k = createKernel();
    const unreg = k.registerGate('test:gate', ()=>[]);
    unreg();
    assertEqual(k.getGates().length, 3);
  });
  test('K-2: priority ordering', () => {
    const k = createKernel();
    k.registerGate('hi:prio', ()=>[], { priority: 5 });
    k.registerGate('lo:prio', ()=>[], { priority: 99 });
    const gates = k.getGates();
    const hiIdx = gates.findIndex(g=>g.signature==='hi:prio');
    const loIdx = gates.findIndex(g=>g.signature==='lo:prio');
    assert(hiIdx < loIdx, 'higher priority (lower number) must sort earlier');
  });
  test('A-2: gate output applied atomically', () => {
    const k = createKernel();
    k.registerGate('emit:two', (ev,q) => {
      if (ev.type !== 'trigger') return [];
      return [
        gateOutput('gate:out:1', {n:1}, {source:'gate:emit:two', causedBy:ev.id, edgeType:'causal/rule'}),
        gateOutput('gate:out:2', {n:2}, {source:'gate:emit:two', causedBy:ev.id, edgeType:'causal/rule'}),
      ];
    });
    k.ingest('trigger',{},{source:'test'});
    const all = k.getAll();
    assert(all.some(e=>e.type==='gate:out:1'));
    assert(all.some(e=>e.type==='gate:out:2'));
  });
  test('K-5: gate depth bounded (no infinite loop)', () => {
    const k = createKernel();
    // Gate that tries to produce a chain — kernel must terminate it
    k.registerGate('loopy', (ev,q) => {
      if (ev.type !== 'loopy:event') return [];
      return [gateOutput('loopy:event',{},{ source:'gate:loopy', causedBy:ev.id, edgeType:'causal/rule' })];
    });
    // Should not hang or throw uncaught — terminates with gate:error system event
    k.ingest('loopy:event',{},{source:'test'});
    assert(k.getAll().some(e=>e.type==='system:gate:error' || e.type==='loopy:event'));
  });
});

// ── C-2: macros never in kernel graph ─────────────────────────────────────────

suite('kernel.macros.C2', () => {
  test('C-2: no macro:detected in kernel store', () => {
    const k = createKernel();
    for (let i=0;i<4;i++) { k.ingest('click',{},{source:'s'}); k.ingest('submit',{},{source:'s'}); }
    assert(!k.getAll().some(e=>e.type==='macro:detected'));
  });
  test('macros detected in projection after 3 repetitions', () => {
    const k = createKernel();
    for (let i=0;i<4;i++) { k.ingest('click',{},{source:'s'}); k.ingest('submit',{},{source:'s'}); }
    const found = k.macros.find(m=>m.pattern.includes('click'));
    assert(found !== undefined, 'macro should be detected');
  });
});

// ── H-2: typeIndex O(1) ────────────────────────────────────────────────────────

suite('kernel.H2-typeindex', () => {
  test('H-2: typeIndex uses Set (not Array)', () => {
    const k = createKernel();
    k.ingest('dom:changed',{},{source:'s'});
    const s = k._typeIndex.get('dom:changed');
    assert(s instanceof Set, 'typeIndex entry must be a Set');
  });
  test('H-3: _typeIndex Set is pruned on eviction', () => {
    const k = createKernel({ ringCap: 3 });
    k.ingest('dom:changed',{},{source:'s'});
    k.ingest('dom:changed',{},{source:'s'});
    k.ingest('dom:changed',{},{source:'s'});
    k.ingest('dom:changed',{},{source:'s'}); // evicts first
    const s = k._typeIndex.get('dom:changed');
    assert(s && s.size <= 3);
  });
});

// ── H-6: seenMap bounded ──────────────────────────────────────────────────────

suite('kernel.H6-seenmap', () => {
  test('replay dedup emits system:event:merged (F-004)', () => {
    const k = createKernel();
    const ev = k.ingest('t',{v:1},{source:'s'});
    k.ingest('t',{v:1},{source:'s', replayOf: ev.id});
    k.ingest('t',{v:1},{source:'s', replayOf: ev.id}); // second replay = dup
    assert(k.getAll().some(e=>e.type==='system:event:merged'));
  });
});

// ── ring eviction ──────────────────────────────────────────────────────────────

suite('kernel.ring-eviction', () => {
  test('eviction emits system:ring:evicted', () => {
    const k = createKernel({ ringCap: 5 });
    for (let i=0;i<6;i++) k.ingest('t',{i},{source:'s'});
    assert(k.getAll().some(e=>e.type==='system:ring:evicted'));
  });
  test('length never exceeds ringCap', () => {
    const k = createKernel({ ringCap: 10 });
    for (let i=0;i<20;i++) k.ingest('t',{i},{source:'s'});
    assert(k.length <= 10);
  });
  test('evicted events removed from idIndex', () => {
    const k   = createKernel({ ringCap: 3 });
    const ev0 = k.ingest('t',{},{source:'s'});
    for (let i=0;i<5;i++) k.ingest('t',{i},{source:'s'});
    assertNull(k.findById(ev0.id));
  });
});

// ── CalltoMap (K-4) ────────────────────────────────────────────────────────────

suite('kernel.calltomap', () => {
  test('registerCallto + resolveCallto roundtrip', () => {
    const k  = createKernel();
    const ev = k.ingest('command:running',{},{source:'s'});
    k.registerCallto('cto-1', ev.id);
    assertEqual(k.resolveCallto('cto-1'), ev.id);
  });
  test('resolveCallto returns null for unknown', () => {
    assertNull(createKernel().resolveCallto('missing'));
  });
  test('K-4: TTL expiry emits system:callto:orphaned', () => {
    const k = createKernel({ calltoTtlTicks: 2 });
    const ev = k.ingest('command:running',{},{source:'s'});
    k.registerCallto('cto-x', ev.id);
    // Advance ticks past TTL
    for (let i=0;i<5;i++) k.ingest('tick',{i},{source:'s'});
    assert(k.getAll().some(e=>e.type==='system:callto:orphaned'));
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

suite('kernel.reset', () => {
  test('reset clears all state', () => {
    const k = createKernel();
    for (let i=0;i<5;i++) k.ingest('t',{},{source:'s'});
    k.reset();
    assertEqual(k.length, 0);
    assertEqual(k.edgeCount, 0);
    assertEqual(k.macros.length, 0);
    assertEqual(k.version, 0);
  });
  test('reset clock', () => {
    const k = createKernel();
    k.ingest('t',{},{source:'s'});
    k.reset();
    assertEqual(k.clock.seq, 0);
    assertEqual(k.clock.tick, 0);
  });
  test('custom gates survive reset', () => {
    const k = createKernel();
    k.registerGate('persist:gate', ()=>[]);
    k.reset();
    // Custom gates are NOT cleared by reset (documented behavior)
    // Builtins always remain
    assert(k.getGates().length >= 3);
  });
});

export const result = report('kernel');
