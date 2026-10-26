/**
 * Causality, Identity, and Time Unit Tests
 */

import {
  suite, test, assert, assertEqual, assertNotEqual, assertNull,
  assertThrows, assertIncludes, assertArrayLength, assertUUID,
  assertFrozen, report, reset,
} from '../runner.js';

import {
  EDGE_CAUSAL_EXPLICIT, EDGE_CAUSAL_RULE, EDGE_CAUSAL_ADAPTER, EDGE_OBSERVATIONAL,
  CAUSAL_EDGE_TYPES, isCausalEdge, createEdge, createCausalStore, createCalltoMap,
} from '../../src/causality/index.js';

import {
  newEventId, isValidEventId, shortId, canonicalize, hash64,
  contentHash, dedupKey, assertUniqueIds,
} from '../../src/identity/index.js';

import {
  createClock, wallNow, causalOrder, seqPrecedes, formatWallTs, formatEventTs,
} from '../../src/time/index.js';

reset();

// ── Identity ──────────────────────────────────────────────────────────────────

suite('identity.newEventId', () => {
  test('generates UUID v4',       () => assertUUID(newEventId()));
  test('unique on each call',     () => assertNotEqual(newEventId(), newEventId()));
  test('1000 calls all unique',   () => {
    const ids = new Set();
    for (let i=0;i<1000;i++) ids.add(newEventId());
    assertEqual(ids.size, 1000);
  });
  test('isValidEventId true',     () => assert(isValidEventId(newEventId())));
  test('isValidEventId rejects non-UUID', () => {
    assert(!isValidEventId('not-a-uuid'));
    assert(!isValidEventId(null));
    assert(!isValidEventId(42));
  });
});

suite('identity.shortId', () => {
  test('returns last segment of UUID', () => {
    const id  = '00000000-0000-4000-8000-aabbccddeeff';
    assertEqual(shortId(id), 'aabbccddeeff');
  });
  test('returns ? for null/empty', () => assertEqual(shortId(null), '?'));
  test('shortId is unique for unique UUIDs', () => {
    const a = newEventId(), b = newEventId();
    assertNotEqual(shortId(a), shortId(b));
  });
});

suite('identity.contentHash', () => {
  test('same inputs → same hash',  () => assertEqual(contentHash('t',{x:1},'s'), contentHash('t',{x:1},'s')));
  test('different type → different hash', () => assertNotEqual(contentHash('a',{},'s'), contentHash('b',{},'s')));
  test('different payload → different hash', () => assertNotEqual(contentHash('t',{x:1},'s'), contentHash('t',{x:2},'s')));
  test('hash independent of id (I-2)', () => {
    const h1 = contentHash('t',{x:1},'s');
    const h2 = contentHash('t',{x:1},'s');
    assertEqual(h1, h2); // contentHash never includes id
  });
  test('16 hex chars', () => assert(/^[0-9a-f]{16}$/.test(contentHash('t',{},'s'))));
});

suite('identity.canonicalize', () => {
  test('null/undefined → "null"',  () => { assertEqual(canonicalize(null),'null'); assertEqual(canonicalize(undefined),'null'); });
  test('booleans',                  () => { assertEqual(canonicalize(true),'true'); assertEqual(canonicalize(false),'false'); });
  test('object keys sorted',        () => assertEqual(canonicalize({b:2,a:1}), canonicalize({a:1,b:2})));
  test('arrays preserve order',     () => assertNotEqual(canonicalize([1,2]), canonicalize([2,1])));
});

suite('identity.assertUniqueIds', () => {
  test('passes for unique IDs',     () => assert(assertUniqueIds([{id:'a'},{id:'b'},{id:'c'}])));
  test('throws for duplicate IDs',  () => assertThrows(()=>assertUniqueIds([{id:'a'},{id:'a'}]), 'duplicate'));
});

// ── Time ─────────────────────────────────────────────────────────────────────

suite('time.createClock', () => {
  test('starts at tick=0 seq=0',  () => { const c=createClock(); assertEqual(c.tick,0); assertEqual(c.seq,0); });
  test('nextTick increments',     () => { const c=createClock(); assertEqual(c.nextTick(),1); assertEqual(c.nextTick(),2); });
  test('nextSeq increments',      () => { const c=createClock(); assertEqual(c.nextSeq(),1); assertEqual(c.nextSeq(),2); });
  test('tick/seq are independent',() => { const c=createClock(); c.nextTick(); c.nextTick(); c.nextSeq(); assertEqual(c.tick,2); assertEqual(c.seq,1); });
  test('reset zeros both',        () => { const c=createClock(); c.nextTick(); c.nextSeq(); c.reset(); assertEqual(c.tick,0); assertEqual(c.seq,0); });
  test('two clocks are independent (T-1)', () => {
    const a=createClock(), b=createClock();
    a.nextTick(); a.nextTick(); a.nextTick();
    assertEqual(a.tick,3); assertEqual(b.tick,0);
  });
});

suite('time.causalOrder', () => {
  test('a.seq < b.seq → -1', () => assertEqual(causalOrder({seq:1},{seq:2}), -1));
  test('a.seq > b.seq → 1',  () => assertEqual(causalOrder({seq:2},{seq:1}), 1));
  test('equal seq → 0',       () => assertEqual(causalOrder({seq:1},{seq:1}), 0));
});

suite('time.seqPrecedes', () => {
  test('lower seq precedes',  () => assert(seqPrecedes({seq:1},{seq:2})));
  test('higher does not',     () => assert(!seqPrecedes({seq:2},{seq:1})));
  test('equal does not',      () => assert(!seqPrecedes({seq:1},{seq:1})));
});

suite('time.format', () => {
  test('formatWallTs returns HH:MM:SS.mmm', () => assert(/^\d{2}:\d{2}:\d{2}\.\d{3}$/.test(formatWallTs(Date.now()))));
  test('formatEventTs returns [ets:N]',     () => assertEqual(formatEventTs(42), '[ets:42]'));
});

// ── Causality: edge types ─────────────────────────────────────────────────────

suite('causality.edge-types', () => {
  test('CAUSAL_EDGE_TYPES contains explicit/rule/adapter', () => {
    assert(CAUSAL_EDGE_TYPES.has(EDGE_CAUSAL_EXPLICIT));
    assert(CAUSAL_EDGE_TYPES.has(EDGE_CAUSAL_RULE));
    assert(CAUSAL_EDGE_TYPES.has(EDGE_CAUSAL_ADAPTER));
  });
  test('observational NOT in CAUSAL_EDGE_TYPES (C-3)', () => assert(!CAUSAL_EDGE_TYPES.has(EDGE_OBSERVATIONAL)));
  test('isCausalEdge true for causal types',  () => assert(isCausalEdge({edgeType:EDGE_CAUSAL_EXPLICIT})));
  test('isCausalEdge false for observational', () => assert(!isCausalEdge({edgeType:EDGE_OBSERVATIONAL})));
});

suite('causality.createEdge', () => {
  test('creates frozen edge',         () => assertFrozen(createEdge('a','b',EDGE_CAUSAL_EXPLICIT,'',0)));
  test('fromId required',             () => assertThrows(()=>createEdge(null,'b',EDGE_CAUSAL_EXPLICIT,'',0),'fromId'));
  test('toId required',               () => assertThrows(()=>createEdge('a',null,EDGE_CAUSAL_EXPLICIT,'',0),'toId'));
  test('unknown edgeType throws',     () => assertThrows(()=>createEdge('a','b','invalid','',0),'edgeType'));
  test('observational allowed',       () => assert(createEdge('a','b',EDGE_OBSERVATIONAL,'',0)));
  test('correct fields',              () => {
    const e = createEdge('from','to',EDGE_CAUSAL_RULE,'rule',100,0.9);
    assertEqual(e.fromId,'from'); assertEqual(e.toId,'to');
    assertEqual(e.edgeType,EDGE_CAUSAL_RULE); assertEqual(e.confidence,0.9);
  });
});

// ── Causality: store ──────────────────────────────────────────────────────────

suite('causality.createCausalStore', () => {
  test('addEdge + getEdge roundtrip', () => {
    const s = createCausalStore();
    const e = createEdge('p','c',EDGE_CAUSAL_EXPLICIT,'',0);
    s.addEdge(e);
    assertEqual(s.getEdge('c'), e);
  });
  test('diamond graph rejected', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('p1','c',EDGE_CAUSAL_EXPLICIT,'',0));
    assertThrows(()=>s.addEdge(createEdge('p2','c',EDGE_CAUSAL_EXPLICIT,'',0)), 'already has a parent');
  });
  test('getChildren returns correct Set', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('p','c1',EDGE_CAUSAL_EXPLICIT,'',0));
    s.addEdge(createEdge('p','c2',EDGE_CAUSAL_EXPLICIT,'',0));
    const kids = s.getChildren('p');
    assert(kids.has('c1')); assert(kids.has('c2'));
  });
  test('observational edges excluded from causalChildren', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('p','c',EDGE_OBSERVATIONAL,'',0));
    assertEqual(s.getCausalChildren('p').size, 0);
  });
  test('traceToRoot returns correct path', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('a','b',EDGE_CAUSAL_EXPLICIT,'',0));
    s.addEdge(createEdge('b','c',EDGE_CAUSAL_EXPLICIT,'',0));
    const { path } = s.traceToRoot('c');
    assertEqual(path, ['a','b','c']);
  });
  test('traceToRoot respects maxDepth', () => {
    const s = createCausalStore();
    for (let i=0;i<10;i++) s.addEdge(createEdge(String(i),String(i+1),EDGE_CAUSAL_EXPLICIT,'',0));
    const { truncated } = s.traceToRoot('10', 5);
    assert(truncated);
  });
  test('pruneEdgesFor removes edges (H-1)', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('p','c',EDGE_CAUSAL_EXPLICIT,'',0));
    s.pruneEdgesFor('c');
    assertNull(s.getEdge('c'));
  });
  test('descendants BFS via causal edges', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('r','a',EDGE_CAUSAL_EXPLICIT,'',0));
    s.addEdge(createEdge('r','b',EDGE_CAUSAL_EXPLICIT,'',0));
    s.addEdge(createEdge('a','c',EDGE_CAUSAL_EXPLICIT,'',0));
    const d = s.descendants('r');
    assert(d.includes('a')); assert(d.includes('b')); assert(d.includes('c'));
  });
  test('clear empties all state', () => {
    const s = createCausalStore();
    s.addEdge(createEdge('p','c',EDGE_CAUSAL_EXPLICIT,'',0));
    s.clear();
    assertEqual(s.size, 0);
    assertNull(s.getEdge('c'));
  });
});

// ── CalltoMap ─────────────────────────────────────────────────────────────────

suite('causality.createCalltoMap', () => {
  test('register + resolve removes entry', () => {
    const m = createCalltoMap();
    m.register('cto', 'evt-id', 0);
    assertEqual(m.resolve('cto'), 'evt-id');
    assertNull(m.resolve('cto')); // second resolve = null (consumed)
  });
  test('peek does not consume', () => {
    const m = createCalltoMap();
    m.register('cto', 'evt-id', 0);
    assertEqual(m.peek('cto'), 'evt-id');
    assertEqual(m.peek('cto'), 'evt-id'); // still there
  });
  test('orphanCount increments on overwrite', () => {
    const m = createCalltoMap();
    m.register('cto','e1',0);
    m.register('cto','e2',0); // overwrites, orphanCount++
    assertEqual(m.orphanCount, 1);
  });
  test('expire with TTL', () => {
    const m = createCalltoMap({ ttlTicks: 5 });
    m.register('old','evt',0);
    const expired = m.expire(10);
    assertEqual(expired.length, 1);
    assertEqual(expired[0].calltoId, 'old');
  });
  test('expire TTL=0 returns []', () => {
    const m = createCalltoMap({ ttlTicks: 0 });
    m.register('x','y',0);
    assertEqual(m.expire(100).length, 0);
  });
  test('clear empties map', () => {
    const m = createCalltoMap();
    m.register('x','y',0);
    m.clear();
    assertEqual(m.size, 0);
  });
});

export const result = report('causality+identity+time');
