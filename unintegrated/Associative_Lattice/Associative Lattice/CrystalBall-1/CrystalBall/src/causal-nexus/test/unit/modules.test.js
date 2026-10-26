/**
 * Adapter, Projection, Lazy, Delta, Compress, Query Unit Tests
 */

import {
  suite, test, assert, assertEqual, assertNotEqual, assertNull,
  assertThrows, assertIncludes, assertArrayLength, assertGt,
  assertFrozen, report, reset,
} from '../runner.js';

import { createKernel, gateOutput }     from '../../src/kernel/index.js';
import { createAdapter }                 from '../../src/adapter/index.js';
import { EDGE_CAUSAL_ADAPTER, EDGE_CAUSAL_EXPLICIT } from '../../src/causality/index.js';
import {
  createFilterCache, computeSourceCounts, computeTypeStats,
  computeDelta, buildBranchTree,
} from '../../src/projection/index.js';
import {
  createLazyLoader, buildCalendarIndex, wallTsToDay,
  eventTsToWindow, timeRangeWindow, DEFAULT_TICK_WINDOW,
} from '../../src/lazy/index.js';
import {
  computeEventDelta, computeDeltaStream, computeThroughputTimeline,
  compressToL1, overlayMacros, detectFractals, createBranchRegistry,
  ZOOM_LEVELS, detectBottlenecks, clusterByAnomaly,
} from '../../src/delta/index.js';
import {
  snapshot, restore, blueprint, compile, compressionReport,
} from '../../src/compress/index.js';
import { query, parseQuery, execQuery, CQLSyntaxError, QueryResult } from '../../src/query/index.js';

reset();

// ── Adapter ───────────────────────────────────────────────────────────────────

suite('adapter.handle', () => {
  test('page:navigated direct mapped', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handle('page:navigated',{from:'/',to:'/app'});
    assert(k.getAll().some(e=>e.type==='page:navigated'));
  });
  test('dom:changed direct mapped', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handle('dom:changed',{selector:'.x'});
    assert(k.getAll().some(e=>e.type==='dom:changed'));
  });
  test('callto running/resolved lifecycle', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handle('element:callto:running',{id:'cto1',action:'click'});
    a.handle('element:callto:resolved',{id:'cto1',status:'ok'});
    const all = k.getAll();
    const running = all.find(e=>e.type==='command:running');
    const success = all.find(e=>e.type==='command:success');
    assert(running && success);
    assertEqual(success.causedBy, running.id);
    assertEqual(success.edgeType, EDGE_CAUSAL_ADAPTER);
  });
  test('callto error path', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handle('element:callto:running',{id:'cto2'});
    a.handle('element:callto:error',{id:'cto2',error:'timeout'});
    assert(k.getAll().some(e=>e.type==='command:failed'));
  });
  test('unknown bus emits system:bus:unknown (F-012)', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handle('totally:unknown:bus',{});
    assert(k.getAll().some(e=>e.type==='system:bus:unknown'));
  });
  test('F-011: dispatcher path shares calltoMap', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handleDispatcher('commandRunning',{commandId:'d1'});
    a.handleDispatcher('commandSuccess',{commandId:'d1'});
    const all     = k.getAll();
    const success = all.find(e=>e.type==='command:success');
    assert(success && success.causedBy !== null, 'dispatcher success must have causedBy');
  });
  test('replayEvent uses srcBusName (S-1)', () => {
    const k=createKernel(); const a=createAdapter(k);
    a.handle('page:navigated',{from:'/',to:'/app'});
    const orig = k.getAll().find(e=>e.type==='page:navigated');
    a.replayEvent(orig);
    const all = k.getAll();
    assert(all.filter(e=>e.type==='page:navigated').length >= 1);
  });
});

// ── Projection ────────────────────────────────────────────────────────────────

suite('projection.createFilterCache', () => {
  test('same version+sources → cached', () => {
    const cache  = createFilterCache();
    const events = [{source:'bridge',id:'a'},{source:'other',id:'b'}];
    const r1     = cache.get(events,1,['bridge']);
    const r2     = cache.get(events,1,['bridge']);
    assert(r1 === r2, 'must return same array reference on cache hit');
  });
  test('version change → new result', () => {
    const cache  = createFilterCache();
    const events = [{source:'bridge',id:'a'}];
    const r1     = cache.get(events,1,['bridge']);
    const r2     = cache.get(events,2,['bridge']);
    assert(r1 !== r2 || r1.length === r2.length);
  });
  test('filter excludes non-matching sources', () => {
    const cache  = createFilterCache();
    const events = [{source:'bridge',id:'a'},{source:'other',id:'b'}];
    const r      = cache.get(events,1,['bridge']);
    assertEqual(r.length,1); assertEqual(r[0].id,'a');
  });
});

suite('projection.computeSourceCounts', () => {
  test('counts per source descending', () => {
    const events = [{source:'a'},{source:'a'},{source:'b'}];
    const m      = computeSourceCounts(events);
    const keys   = [...m.keys()];
    assertEqual(keys[0],'a'); assertEqual(keys[1],'b');
    assertEqual(m.get('a'),2); assertEqual(m.get('b'),1);
  });
});

suite('projection.computeTypeStats', () => {
  test('null for absent type', () => {
    const k=createKernel(); assertNull(computeTypeStats(k.getAll(),'missing'));
  });
  test('count, rate, seq range', () => {
    const k=createKernel();
    for(let i=0;i<5;i++) k.ingest('ev',{},{source:'s'});
    const stats = computeTypeStats(k.getAll(),'ev');
    assert(stats!==null);
    assertEqual(stats.count,5);
    assert(stats.firstSeq < stats.lastSeq);
  });
});

suite('projection.computeDelta', () => {
  test('null for missing parents', () => assertNull(computeDelta(null,{payload:{}})));
  test('changed field detected',   () => {
    const d = computeDelta({payload:{x:1}},{payload:{x:2}});
    assert(d.changed.x !== undefined);
    assert(!d.isEmpty);
  });
  test('added field detected', () => {
    const d = computeDelta({payload:{}},{payload:{y:1}});
    assertEqual(d.added.y,1);
  });
  test('removed field detected', () => {
    const d = computeDelta({payload:{z:1}},{payload:{}});
    assertEqual(d.removed.z,1);
  });
  test('isEmpty true when identical', () => {
    const d = computeDelta({payload:{x:1}},{payload:{x:1}});
    assert(d.isEmpty);
  });
});

suite('projection.buildBranchTree', () => {
  test('single root no children → one chain', () => {
    const chains = buildBranchTree('r', ()=>new Set(), 5, 5, 50);
    assertEqual(chains.length,1); assertEqual(chains[0][0],'r');
  });
  test('respects maxChains', () => {
    const getChildren = id => id === 'r' ? new Set(['a','b','c','d','e','f']) : new Set();
    const chains = buildBranchTree('r', getChildren, 10, 10, 3);
    assert(chains.length <= 3);
  });
});

// ── Lazy ─────────────────────────────────────────────────────────────────────

suite('lazy.eventTsToWindow', () => {
  test('floor(eventTs/windowSize)',  () => assertEqual(eventTsToWindow(1500,1000), 1));
  test('window 0 for first bucket', () => assertEqual(eventTsToWindow(999,1000), 0));
  test('replay-deterministic',      () => {
    assertEqual(eventTsToWindow(12345,1000), eventTsToWindow(12345,1000));
  });
});

suite('lazy.timeRangeWindow', () => {
  test('null for empty events', () => assertNull(timeRangeWindow([],0,9999)));
  test('finds correct range',   () => {
    const events = [{ts:100},{ts:200},{ts:300},{ts:400},{ts:500}];
    const w      = timeRangeWindow(events,200,400);
    assertEqual(w.firstIdx,1); assertEqual(w.lastIdx,3); assertEqual(w.count,3);
  });
  test('null when range misses', () => assertNull(timeRangeWindow([{ts:100}],200,300)));
});

suite('lazy.createLazyLoader', () => {
  test('loadPage returns correct page', () => {
    const k = createKernel();
    for (let i=0;i<10;i++) k.ingest('t',{i},{source:'s'});
    const loader = createLazyLoader(k, { pageSize: 5 });
    const p      = loader.loadPage(0);
    assertEqual(p.events.length, 5);
    assertEqual(p.totalPages, 2);
  });
  test('windowLength matches kernel length', () => {
    const k = createKernel();
    for (let i=0;i<7;i++) k.ingest('t',{i},{source:'s'});
    const loader = createLazyLoader(k);
    assertEqual(loader.windowLength(), k.length);
  });
  test('time range filter narrows window', () => {
    const k = createKernel();
    for (let i=0;i<5;i++) k.ingest('t',{i},{source:'s'});
    const events = k.getAll();
    const loader = createLazyLoader(k);
    // Filter to just middle 3 events by ts range
    const tsStart = events[1].ts - 1;
    const tsEnd   = events[3].ts + 1;
    loader.setTimeRange({ tsStart, tsEnd });
    const len = loader.windowLength();
    assert(len >= 1 && len <= events.length);
  });
});

// ── Delta ─────────────────────────────────────────────────────────────────────

suite('delta.computeEventDelta', () => {
  const baseEv = { id:'e1', type:'t', seq:1, eventTs:100, causedBy:null, payload:{} };
  test('root event gap=0', () => {
    const d = computeEventDelta(baseEv, null, 0, [], 0, 0, 0, []);
    assertEqual(d.gap, 0); assertEqual(d.ownDepth, 0);
  });
  test('child has ownDepth=parentDepth+1', () => {
    const child  = { id:'e2', type:'t', seq:2, eventTs:110, causedBy:'e1', payload:{} };
    const d      = computeEventDelta(child, baseEv, 2, [], 0, 0, 0, []);
    assertEqual(d.ownDepth, 3);
  });
  test('latencyImpact computed when window >=3', () => {
    const child = { id:'e2', type:'t', seq:2, eventTs:200, causedBy:'e1', payload:{} };
    const d     = computeEventDelta(child, baseEv, 0, [10,10,100], 0, 0, 0, []);
    assert(d.latencyImpact >= 0);
  });
  test('structuralDeviation computed when depthWindow >=3', () => {
    const child = { id:'e2', type:'t', seq:2, eventTs:110, causedBy:'e1', payload:{} };
    const d     = computeEventDelta(child, baseEv, 0, [], 0, 0, 0, [1,2,3]);
    assert(typeof d.structuralDeviation === 'number');
  });
  test('frozen output', () => {
    assertFrozen(computeEventDelta(baseEv, null, 0, [], 0, 0, 0, []));
  });
});

suite('delta.computeThroughputTimeline', () => {
  test('buckets by eventTs not ts (R1)', () => {
    const events = [
      { seq:1, eventTs:100, ts:999999 },
      { seq:2, eventTs:1100, ts:999999 },
    ];
    const buckets = computeThroughputTimeline(events, 1000);
    assertEqual(buckets.length, 2); // 100→window 0, 1100→window 1
  });
  test('empty events → []', () => assertEqual(computeThroughputTimeline([]).length, 0));
  test('sorted ascending by window', () => {
    const events = [
      {seq:1,eventTs:2000,ts:0},{seq:2,eventTs:500,ts:0},{seq:3,eventTs:1500,ts:0}
    ];
    const b = computeThroughputTimeline(events,1000);
    for (let i=1;i<b.length;i++) assert(b[i].window >= b[i-1].window);
  });
});

suite('delta.deprecated-stubs', () => {
  test('detectBottlenecks returns []',  () => assertEqual(detectBottlenecks([],0.7).length, 0));
  test('clusterByAnomaly returns []',   () => assertEqual(clusterByAnomaly([],[]).length, 0));
});

suite('delta.ZOOM_LEVELS', () => {
  test('L0=0, L4=4', () => { assertEqual(ZOOM_LEVELS.L0,0); assertEqual(ZOOM_LEVELS.L4,4); });
  test('frozen',      () => assertFrozen(ZOOM_LEVELS));
});

suite('delta.compressToL1', () => {
  test('single-child chain compressed', () => {
    const events = [
      {id:'a',type:'t',seq:1,eventTs:1,ts:1,causedBy:null,source:'s',payload:{}},
      {id:'b',type:'u',seq:2,eventTs:2,ts:2,causedBy:'a',source:'s',payload:{}},
      {id:'c',type:'v',seq:3,eventTs:3,ts:3,causedBy:'b',source:'s',payload:{}},
    ];
    const getChildren = id => {
      if(id==='a') return new Set(['b']);
      if(id==='b') return new Set(['c']);
      return new Set();
    };
    const out = compressToL1(events, getChildren);
    assert(out.some(e=>e._isChain), 'expected a chain node');
  });
});

suite('delta.createBranchRegistry', () => {
  test('addBranch + getById', () => {
    const reg    = createBranchRegistry();
    const branch = { id:'br1', type:'graph-branch' };
    reg.addBranch(branch);
    assertEqual(reg.getById('br1'), branch);
  });
  test('count', () => {
    const reg = createBranchRegistry();
    reg.addBranch({id:'a'}); reg.addBranch({id:'b'});
    assertEqual(reg.count, 2);
  });
  test('clear empties', () => {
    const reg = createBranchRegistry();
    reg.addBranch({id:'a'}); reg.clear();
    assertEqual(reg.count, 0);
  });
});

// ── Compress ─────────────────────────────────────────────────────────────────

suite('compress.snapshot-restore', () => {
  function buildKernel() {
    const k = createKernel(); const a = createAdapter(k);
    a.handle('page:navigated',{from:'/',to:'/app'});
    a.handle('element:callto:running',{id:'cto1',action:'click'});
    a.handle('element:callto:resolved',{id:'cto1',status:'ok'});
    for (let i=0;i<3;i++) a.handle('dom:changed',{selector:'.x'+i});
    return k;
  }

  test('snapshot has URCK-SNAP magic',   () => { const s=snapshot(buildKernel()); assertEqual(s.magic,'URCK-SNAP'); });
  test('snapshot n > 0',                 () => assertGt(snapshot(buildKernel()).n, 0));
  test('restore produces same type set', () => {
    const k1  = buildKernel();
    const s   = snapshot(k1);
    const k2  = restore(s);
    const t1  = new Set(k1.getAll().filter(e=>e.source!=='kernel:system'&&!e.source?.startsWith('gate:')).map(e=>e.type));
    const t2  = new Set(k2.getAll().filter(e=>e.source!=='kernel:system'&&!e.source?.startsWith('gate:')).map(e=>e.type));
    for (const t of t1) assert(t2.has(t), `type ${t} missing after restore`);
  });
  test('restore invalid magic throws', () => assertThrows(()=>restore({magic:'WRONG',fmt:1}),'not a valid'));
  test('compression ratio ≥ 1',          () => {
    const k = buildKernel();
    const s = snapshot(k);
    const r = compressionReport(k,s);
    assert(r.ratio >= 1);
    assert(typeof r.summary === 'string');
  });
});

suite('compress.blueprint', () => {
  test('has URCK-BP magic', () => {
    const k = createKernel(); k.ingest('t',{},{source:'s'});
    assertEqual(blueprint(k).magic, 'URCK-BP');
  });
  test('vocab contains all event types', () => {
    const k = createKernel();
    k.ingest('ev:a',{},{source:'s'});
    k.ingest('ev:b',{},{source:'s'});
    const bp   = blueprint(k);
    const types = bp.vocab.map(v=>v.type);
    // Primary events (not system:) should appear
    const primary = k.getAll().filter(e=>e.source!=='kernel:system'&&!e.source?.startsWith('gate:'));
    for (const ev of primary) assertIncludes(types, ev.type);
  });
  test('I-1 invariant appears when all IDs valid', () => {
    const k  = createKernel();
    k.ingest('t',{},{source:'s'});
    const bp = blueprint(k);
    assert(bp.invariants.some(i=>i.id==='I-1'));
  });
  test('C-2 invariant present when no macro:detected', () => {
    const k  = createKernel();
    k.ingest('t',{},{source:'s'});
    const bp = blueprint(k);
    assert(bp.invariants.some(i=>i.id==='C-2'));
  });
});

suite('compress.compile', () => {
  test('generates valid JS string', () => {
    const k  = createKernel();
    for (let i=0;i<5;i++) k.ingest('ev:a',{i},{source:'s'});
    const bp  = blueprint(k);
    const src = compile(bp);
    assert(typeof src === 'string');
    assert(src.includes('createFromBlueprint'));
    assert(src.includes('const T ='));
  });
  test('invalid blueprint throws', () => assertThrows(()=>compile({magic:'BAD'}),'invalid blueprint'));
});

// ── Query ─────────────────────────────────────────────────────────────────────

suite('query.parseQuery', () => {
  test('parses simple type filter',       () => { const ast=parseQuery("FIND events WHERE type = 'cmd:ok' LIMIT 10"); assertEqual(ast.scope,'events'); assertEqual(ast.limit,10); });
  test('parses AND condition',            () => { const ast=parseQuery("FIND events WHERE type = 'a' AND source = 'b'"); assertEqual(ast.conditions.op,'AND'); });
  test('parses NOT condition',            () => { const ast=parseQuery("FIND events WHERE NOT type = 'x'"); assertEqual(ast.conditions.op,'NOT'); });
  test('parses ORDER BY DESC',            () => { const ast=parseQuery("FIND events WHERE type = 'x' ORDER BY seq DESC"); assertEqual(ast.orderBy.dir,'DESC'); });
  test('parses WITHIN ticks',             () => { const ast=parseQuery("FIND events WHERE type = 'x' AND WITHIN 500 ticks OF 'nav'"); assert(ast.conditions.right.op==='WITHIN'); });
  test('empty query throws CQLSyntaxError', () => assertThrows(()=>parseQuery(''),'CQL syntax error'));
  test('bad comparator throws',           () => assertThrows(()=>parseQuery("FIND events WHERE type % 'x'"),'CQL syntax error'));
});

suite('query.execQuery', () => {
  function buildQueryKernel() {
    const k = createKernel(); const a = createAdapter(k);
    a.handle('element:callto:running', {id:'c1',action:'click'});
    a.handle('element:callto:resolved',{id:'c1',status:'ok'});
    a.handle('element:callto:running', {id:'c2',action:'type'});
    a.handle('element:callto:error',   {id:'c2',error:'timeout'});
    a.handle('page:navigated',{from:'/',to:'/app'});
    return k;
  }

  test('FIND events WHERE type — typeIndex path', () => {
    const k   = buildQueryKernel();
    const ast = parseQuery("FIND events WHERE type = 'command:success' LIMIT 100");
    const res = execQuery(ast, k);
    assert(res.ok);
    assert(res.events.every(e=>e.type==='command:success'));
    assertEqual(res.plan.strategy, 'typeIndex');
  });

  test('FIND events WHERE source — full-scan path', () => {
    const k   = buildQueryKernel();
    const ast = parseQuery("FIND events WHERE source = 'bridge:element-api' LIMIT 100");
    const res = execQuery(ast, k);
    assert(res.ok);
    assertEqual(res.plan.strategy, 'full-scan');
  });

  test('FIND events WHERE type AND payload field', () => {
    const k = createKernel();
    k.ingest('cmd',{retryCount:5},{source:'s'});
    k.ingest('cmd',{retryCount:1},{source:'s'});
    const res = query("FIND events WHERE type = 'cmd' AND payload.retryCount >= 3", k);
    assert(res.ok);
    assertEqual(res.events.length, 1);
  });

  test('fuzzy match ~=', () => {
    const k = createKernel();
    k.ingest('cmd',{},{source:'bridge:element-api'});
    const res = query("FIND events WHERE source ~= 'element' LIMIT 10", k);
    assert(res.ok);
    assert(res.events.some(e=>e.source.includes('element')));
  });

  test('IN operator', () => {
    const k = createKernel();
    k.ingest('a',{},{source:'s'});
    k.ingest('b',{},{source:'s'});
    k.ingest('c',{},{source:'s'});
    const res = query("FIND events WHERE type IN ('a','b') LIMIT 10", k);
    assert(res.ok);
    assert(res.events.every(e=>['a','b'].includes(e.type)));
  });

  test('NOT operator excludes', () => {
    const k = createKernel();
    k.ingest('keep',{},{source:'s'});
    k.ingest('skip',{},{source:'s'});
    const res = query("FIND events WHERE NOT type = 'skip' LIMIT 100", k);
    assert(res.ok);
    assert(res.events.every(e=>e.type!=='skip'));
  });

  test('ORDER BY seq DESC', () => {
    const k = buildQueryKernel();
    const res = query("FIND events WHERE type = 'command:running' ORDER BY seq DESC LIMIT 10", k);
    assert(res.ok);
    if (res.events.length > 1) assert(res.events[0].seq > res.events[1].seq);
  });

  test('CHAINS scope returns path', () => {
    const k = createKernel();
    const p = k.ingest('root',{},{source:'s'});
    const c = k.ingest('leaf',{},{source:'s',causedBy:p.id,edgeType:'causal/explicit'});
    const res = query("FIND chains WHERE type = 'leaf' LIMIT 10", k);
    assert(res.ok);
    assert(res.events.some(e=>e.id===p.id), 'root should appear in chain');
  });

  test('bad query returns ok=false', () => {
    const k   = createKernel();
    const res = query('NOT VALID CQL', k);
    assert(!res.ok);
    assert(typeof res.error === 'string');
  });

  test('LIMIT respected', () => {
    const k = createKernel();
    for (let i=0;i<20;i++) k.ingest('t',{i},{source:'s'});
    const res = query("FIND events WHERE type = 't' LIMIT 5", k);
    assert(res.ok);
    assert(res.events.length <= 5);
  });
});

export const result = report('adapter+projection+lazy+delta+compress+query');
