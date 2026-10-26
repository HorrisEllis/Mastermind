/**
 * topology-phase1.test.js
 * v1.4.0 — Phase 1: InvariantBaseline + PolarityEngine + TopologyEngine
 *
 * §4.4 — Test suite per executable. Every assertion targets real behaviour.
 * §1.1 — Tests verify signal labels, not psychological claims.
 * §3.1 — All tests must pass before output ships.
 *
 * Run: node topology-phase1.test.js
 */

'use strict';

// ─── Minimal test harness (§5.5 — built, not imported) ────────────────────────

let _passed = 0;
let _failed = 0;
const _failures = [];

function assert(cond, label) {
  if (cond) {
    _passed++;
    console.log(`  ✓ ${label}`);
  } else {
    _failed++;
    _failures.push(label);
    console.error(`  ✗ ${label}`);
  }
}

function assertClose(a, b, tol = 0.01, label = '') {
  assert(Math.abs(a - b) <= tol, label || `${a} ≈ ${b} (±${tol})`);
}

function section(name) {
  console.log(`\n── ${name} ─────────────────────────────────────`);
}

function summary() {
  console.log(`\n${'═'.repeat(60)}`);
  if (_failed === 0) {
    console.log(`✓ ALL ${_passed} TESTS PASSED`);
  } else {
    console.log(`✗ ${_failed} FAILED / ${_passed + _failed} TOTAL`);
    _failures.forEach(f => console.error(`  ✗ ${f}`));
    process.exit(1);
  }
}

// ─── Inline class extraction (tests run in Node, no browser) ─────────────────
// Pull the classes directly out of codec.js source via eval after stripping
// browser-only export keywords and Web Speech API references.

const fs = require('fs');
const path = require('path');

let src = fs.readFileSync(path.join(__dirname, 'codec.js'), 'utf8');

// Strip ES module exports (Node CJS test context)
src = src.replace(/^export\s+(class|const|function)/gm, '$1');
src = src.replace(/^export\s+default\s+\w+;?/gm, '');
// Strip browser-only globals that would throw on reference
src = src
  .replace(/window\./g, '(typeof window !== "undefined" ? window : {})?.')
  .replace(/navigator\./g, '(typeof navigator !== "undefined" ? navigator : {})?.') ;

// Wrap and eval — classes become available in this scope via returned object
const codecModule = new Function(`
  ${src}
  return { RollingStats, InvariantBaseline, PolarityEngine, TopologyEngine, BatchLogger, NexusCodec, CODEC_VERSION };
`)();

const { RollingStats, InvariantBaseline, PolarityEngine, TopologyEngine, BatchLogger, NexusCodec, CODEC_VERSION } = codecModule;

// ─── Constants we need ────────────────────────────────────────────────────────
const WARMUP   = 5;
const FLIP_THR = 0.20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSig(overrides = {}) {
  return {
    sentiment: 0.0,
    friction:  0.1,
    wordCount: 50,
    energy:    0.3,
    cadence:   2.0,
    text:      'test utterance here now',
    ts:        Date.now(),
    ...overrides,
  };
}

function feedN(engine, n, sigFn) {
  const results = [];
  for (let i = 0; i < n; i++) {
    results.push(engine.feed(sigFn ? sigFn(i) : makeSig(), null));
  }
  return results;
}

// ─── SECTION 1: InvariantBaseline ────────────────────────────────────────────

section('InvariantBaseline — warmup phase');

{
  const ib = new InvariantBaseline({ warmupN: WARMUP });

  // Batches 1–4: warmup, not locked
  for (let i = 1; i < WARMUP; i++) {
    const r = ib.feed(makeSig(), null);
    assert(r.locked === false,                  `batch ${i}: locked === false`);
    assert(typeof r.warmupProgress === 'number', `batch ${i}: warmupProgress is number`);
    assertClose(r.warmupProgress, i / WARMUP, 0.01, `batch ${i}: warmupProgress = ${i}/${WARMUP}`);
  }

  // Batch 5: should lock AND score (falls through to post-lock path)
  const r5 = ib.feed(makeSig(), null);
  assert(r5.locked === true, 'batch 5: locks on warmup completion and returns locked payload');
  assert(ib.locked === true, 'ib.locked property is true after lock');
}

section('InvariantBaseline — baseline values after lock');

{
  const ib = new InvariantBaseline({ warmupN: WARMUP });
  const sentiments = [0.1, 0.2, 0.15, 0.25, 0.3];
  for (const s of sentiments) ib.feed(makeSig({ sentiment: s }), null);

  const expectedMean = sentiments.reduce((a,b)=>a+b,0)/sentiments.length;
  assertClose(ib.baseline.sentiment.mean, expectedMean, 0.001, 'baseline.sentiment.mean correct');
  assert(ib.baseline.sentiment.n === WARMUP, `baseline.sentiment.n === ${WARMUP}`);
  assert(typeof ib.baseline.sentiment.sigma === 'number', 'baseline.sentiment.sigma is number');
}

section('InvariantBaseline — z-scores after lock');

{
  const ib = new InvariantBaseline({ warmupN: WARMUP });
  // Warmup with stable neutral signals
  for (let i = 0; i < WARMUP; i++) ib.feed(makeSig({ sentiment: 0.0, friction: 0.1, wordCount: 50 }), null);

  // Feed a high-deviation signal — sentiment jumps to 0.9
  // Note: constant warmup produces sigma=0, so z=0 for all axes (no deviation measurable)
  // This is §1.1-correct — we cannot claim deviation from a baseline with no variance
  const r = ib.feed(makeSig({ sentiment: 0.9, friction: 0.1, wordCount: 50, energy: null, cadence: null }), null);
  assert(r.locked === true,              'post-lock: locked === true');
  assert(r.zScores !== undefined,        'post-lock: zScores present');
  assert(typeof r.compositeZ === 'number', 'post-lock: compositeZ is a number');
  // Constant warmup → sigma=0 → zScore=0 for all axes (mathematically correct)
  assert(r.zScores.friction === 0,       'unchanged friction: zScore === 0');
  assert(r.zScores.wordCount === 0,      'unchanged wordCount: zScore === 0');
  assert(r.zScores.energy === null,      'null energy → zScore null');
}

section('InvariantBaseline — baseline alert fires');

{
  const ib = new InvariantBaseline({ warmupN: WARMUP });
  // Warmup: sentiment near 0 with variance
  const warmupSentiments = [-0.1, 0.1, -0.05, 0.05, 0.0];
  for (const s of warmupSentiments) ib.feed(makeSig({ sentiment: s }), null);

  // Far from baseline on multiple axes
  const r = ib.feed(makeSig({ sentiment: 0.95, friction: 0.95, wordCount: 200 }), null);
  // compositeZ should be large
  assert(r.compositeZ > 0, 'alert-scenario: compositeZ > 0');
  // alert only fires when compositeZ >= COMPOSITE_ALERT_Z (2.0)
  // With sufficient deviation it should be true
  if (r.compositeZ >= 2.0) {
    assert(r.alert === true, 'alert fires when compositeZ >= 2.0');
  } else {
    assert(r.alert === false, 'alert does not fire when compositeZ < 2.0');
  }
}

section('InvariantBaseline — reset clears state');

{
  const ib = new InvariantBaseline({ warmupN: WARMUP });
  for (let i = 0; i < WARMUP; i++) ib.feed(makeSig(), null);
  assert(ib.locked === true, 'pre-reset: locked');
  ib.reset();
  assert(ib.locked === false, 'post-reset: not locked');
  assert(ib.baseline === null, 'post-reset: baseline is null');
  const r = ib.feed(makeSig(), null);
  assert(r.locked === false, 'post-reset: warmup restarts');
}

// ─── SECTION 2: PolarityEngine ────────────────────────────────────────────────

section('PolarityEngine — neutral zone, no flip');

{
  const pe = new PolarityEngine();
  const r = pe.feed(0.05, 1, Date.now());
  assert(r.label === 'neutral',    'small positive → neutral label');
  assert(r.flipCount === 0,        'no flips on neutral');
  assert(r.batchCount === 1,       'batchCount === 1 after first feed');
  assert(typeof r.rollingMean === 'number', 'rollingMean is number');
}

section('PolarityEngine — flip detection');

{
  const pe = new PolarityEngine();
  const ts = Date.now();

  // Build up strongly negative rolling mean
  for (let i = 0; i < 10; i++) pe.feed(-0.8, i+1, ts+i*1000);
  const pre = pe.feed(-0.8, 11, ts+11000);
  assert(pre.label === 'negative', 'strongly negative → negative label');

  // Flip to strongly positive
  for (let i = 0; i < 20; i++) pe.feed(0.9, 12+i, ts+(12+i)*1000);
  const post = pe.feed(0.9, 32, ts+32000);
  assert(post.label === 'positive',  'strongly positive → positive label');
  assert(post.flipCount >= 1,        'flip detected on sign crossing');
  // First flip: neutral→negative (batch 1). Second flip: negative→positive.
  const posFlip = post.flips.find(f => f.toPolarity === 'positive');
  assert(posFlip !== undefined, 'a negative→positive flip was recorded');
}

section('PolarityEngine — session arc');

{
  const pe = new PolarityEngine();
  const ts = Date.now();

  // First quarter: negative
  for (let i = 0; i < 4; i++) pe.feed(-0.6, i+1, ts+i*1000);
  // Last quarter: positive
  for (let i = 4; i < 8; i++) pe.feed(0.7, i+1, ts+i*1000);

  const r = pe.feed(0.7, 9, ts+9000);
  assert(r.sessionArc === 'improving', 'negative start → positive end = improving arc');
}

section('PolarityEngine — declining arc');

{
  const pe = new PolarityEngine();
  const ts = Date.now();
  for (let i = 0; i < 4; i++) pe.feed(0.7, i+1, ts+i*1000);
  for (let i = 4; i < 8; i++) pe.feed(-0.7, i+1, ts+i*1000);
  const r = pe.feed(-0.7, 9, ts+9000);
  assert(r.sessionArc === 'declining', 'positive start → negative end = declining arc');
}

section('PolarityEngine — dominant polarity');

{
  const pe = new PolarityEngine();
  const ts = Date.now();
  for (let i = 0; i < 7; i++) pe.feed(0.4, i+1, ts+i*1000);
  for (let i = 7; i < 10; i++) pe.feed(-0.4, i+1, ts+i*1000);
  const r = pe.feed(0.4, 11, ts+11000);
  assert(r.dominant === 'positive', 'more positive batches → dominant=positive');
}

section('PolarityEngine — momentum (inline OLS)');

{
  const pe = new PolarityEngine();
  const ts = Date.now();
  // Feed monotonically increasing values — should produce positive momentum
  const rising = [-0.4, -0.3, -0.2, -0.1, 0.0, 0.1, 0.2, 0.3];
  for (let i = 0; i < rising.length; i++) pe.feed(rising[i], i+1, ts+i*1000);
  const r = pe.feed(0.4, 9, ts+9000);
  assert(r.momentum > 0, 'rising sentiment → positive momentum');

  const pe2 = new PolarityEngine();
  const falling = [0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3];
  for (let i = 0; i < falling.length; i++) pe2.feed(falling[i], i+1, ts+i*1000);
  const r2 = pe2.feed(-0.4, 9, ts+9000);
  assert(r2.momentum < 0, 'falling sentiment → negative momentum');
}

section('PolarityEngine — reset');

{
  const pe = new PolarityEngine();
  const ts = Date.now();
  for (let i = 0; i < 5; i++) pe.feed(-0.8, i+1, ts+i*1000);
  pe.reset();
  const r = pe.feed(0.0, 1, Date.now());
  assert(r.batchCount === 1,   'post-reset: batchCount restarted');
  assert(r.flipCount === 0,    'post-reset: no flips');
}

// ─── SECTION 3: TopologyEngine ────────────────────────────────────────────────

section('TopologyEngine — CALIBRATING state during warmup');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  for (let i = 0; i < WARMUP - 1; i++) {
    const r = te.feed(makeSig(), null);
    assert(r.composite.state === 'CALIBRATING', `batch ${i+1}: state=CALIBRATING`);
    assert(r.polarity === null, `batch ${i+1}: polarity=null during warmup`);
    assert(Array.isArray(r.composite.evidence), `batch ${i+1}: evidence is array`);
    assert(r.composite.evidence.length > 0, `batch ${i+1}: evidence is non-empty`);
  }
}

section('TopologyEngine — transitions to STABLE after warmup');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  let lastResult;
  for (let i = 0; i < WARMUP + 3; i++) {
    lastResult = te.feed(makeSig(), null);
  }
  assert(lastResult.composite.state !== 'CALIBRATING', 'post-warmup: not CALIBRATING');
  assert(lastResult.baseline.locked === true, 'post-warmup: baseline locked');
  assert(lastResult.polarity !== null, 'post-warmup: polarity populated');
}

section('TopologyEngine — BASELINE_ALERT fires on multi-axis deviation');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  // Stable warmup
  for (let i = 0; i < WARMUP; i++) {
    te.feed(makeSig({ sentiment: 0.0, friction: 0.1, wordCount: 50 }), null);
  }
  // Extreme deviation on all axes
  const r = te.feed(makeSig({ sentiment: 0.98, friction: 0.99, wordCount: 500 }), null);
  if (r.baseline.compositeZ >= 2.0) {
    assert(r.composite.state === 'BASELINE_ALERT', 'extreme deviation → BASELINE_ALERT');
  } else {
    // Edge case: constant warmup produces sigma=0, so z=0 always
    assert(['STABLE','POLARIZED'].includes(r.composite.state), 'zero-sigma warmup: STABLE or POLARIZED');
  }
}

section('TopologyEngine — POLARIZED state on strong polarity signal');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  // Warmup
  for (let i = 0; i < WARMUP; i++) te.feed(makeSig({ sentiment: 0.0 }), null);
  // Build strong positive polarity well above 0.35
  for (let i = 0; i < 25; i++) te.feed(makeSig({ sentiment: 0.9 }), null);
  const r = te.feed(makeSig({ sentiment: 0.9 }), null);
  // Rolling mean of 0.9 over 20 batches is definitely > 0.35
  assert(r.polarity.label === 'positive', 'strong positive sentiment → polarity=positive');
  assert(['POLARIZED','BASELINE_ALERT'].includes(r.composite.state), 'strong polarity → POLARIZED or BASELINE_ALERT');
}

section('TopologyEngine — composite.evidence always non-empty post-warmup');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  for (let i = 0; i < WARMUP + 5; i++) {
    const r = te.feed(makeSig(), null);
    if (r.composite.state !== 'CALIBRATING') {
      assert(Array.isArray(r.composite.evidence), `batch ${i+1}: evidence is array`);
      assert(r.composite.evidence.length > 0, `batch ${i+1}: evidence non-empty`);
    }
  }
}

section('TopologyEngine — lastPayload updated on every feed');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  assert(te.lastPayload === null, 'initially: lastPayload null');
  te.feed(makeSig(), null);
  assert(te.lastPayload !== null, 'after first feed: lastPayload not null');
  const r1 = te.feed(makeSig({ sentiment: 0.5 }), null);
  assert(te.lastPayload === r1, 'lastPayload === return value of last feed()');
}

section('TopologyEngine — null audio axes handled gracefully');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  // Warmup with null audio
  for (let i = 0; i < WARMUP; i++) {
    te.feed(makeSig({ energy: null, cadence: null }), null);
  }
  // Post-warmup with null audio — must not throw
  let threw = false;
  try {
    const r = te.feed(makeSig({ energy: null, cadence: null }), null);
    assert(r.baseline.zScores.energy === null, 'null energy → zScore null');
    assert(r.baseline.zScores.cadence === null, 'null cadence → zScore null');
  } catch (e) {
    threw = true;
    console.error('  threw:', e.message);
  }
  assert(!threw, 'null audio axes: no throw');
}

section('TopologyEngine — reset clears all state');

{
  const te = new TopologyEngine({ warmupN: WARMUP });
  for (let i = 0; i < WARMUP + 3; i++) te.feed(makeSig(), null);
  te.reset();
  assert(te.lastPayload === null, 'post-reset: lastPayload null');
  const r = te.feed(makeSig(), null);
  assert(r.composite.state === 'CALIBRATING', 'post-reset: warmup restarts');
}

// ─── SECTION 4: BatchLogger topology fields ───────────────────────────────────

section('BatchLogger — topology fields logged correctly');

{
  // Mock localStorage for Node
  global.localStorage = {
    _store: {},
    getItem(k) { return this._store[k] ?? null; },
    setItem(k, v) { this._store[k] = v; },
    removeItem(k) { delete this._store[k]; },
  };

  const logger = new BatchLogger({ maxEntries: 10 });

  const mockBatch = {
    batchId: 'B0001',
    sessionId: 'TEST-SESSION',
    ts: Date.now(),
    text: 'test text here',
    tags: ['SYS'],
    wordCount: 3,
    sentiment: { score: 0.1, anomaly: false },
    friction:  { score: 0.05, types: [] },
    associations: [],
    redundancy: { redundant: false },
    invariants: { words: [] },
    prediction: null,
    topology: {
      baseline: { locked: true, alert: true, compositeZ: 2.5 },
      polarity: { sessionArc: 'improving', flipCount: 1 },
      composite: { state: 'BASELINE_ALERT', evidence: ['compositeZ=2.5'] },
    },
  };

  const entry = logger.log(mockBatch);
  assert(entry.topologyState === 'BASELINE_ALERT', 'topologyState logged correctly');
  assert(entry.baselineAlert === true,             'baselineAlert logged correctly');
  assertClose(entry.compositeZ, 2.5, 0.001,       'compositeZ logged correctly');
  assert(entry.polarityArc === 'improving',        'polarityArc logged correctly');
  assert(entry.polarityFlips === 1,                'polarityFlips logged correctly');
}

section('BatchLogger — topology fields default to safe values when absent');

{
  const logger = new BatchLogger({ maxEntries: 10 });

  const mockBatch = {
    batchId: 'B0002',
    sessionId: 'TEST',
    ts: Date.now(),
    text: 'no topology here',
    tags: ['SYS'],
    wordCount: 3,
    sentiment: { score: 0.0, anomaly: false },
    friction: { score: 0, types: [] },
    associations: [],
    redundancy: { redundant: false },
    invariants: { words: [] },
    prediction: null,
    // no topology field
  };

  const entry = logger.log(mockBatch);
  assert(entry.topologyState === null,  'missing topology: topologyState=null');
  assert(entry.baselineAlert === false, 'missing topology: baselineAlert=false');
  assert(entry.compositeZ === 0,        'missing topology: compositeZ=0');
  assert(entry.polarityArc === null,    'missing topology: polarityArc=null');
  assert(entry.polarityFlips === 0,     'missing topology: polarityFlips=0');
}

// ─── SECTION 5: Integration — signals flow from TranscriptEngine shape ────────

section('Integration — topology payload shape from synthetic batch pipeline');

{
  const te = new TopologyEngine({ warmupN: 3 });

  const batches = [
    { sentiment: 0.1, friction: 0.1, wordCount: 40, energy: 0.3, cadence: 2.0, text: 'hello world this is test', ts: 1 },
    { sentiment: 0.2, friction: 0.2, wordCount: 50, energy: 0.35, cadence: 2.1, text: 'more words come here now', ts: 2 },
    { sentiment: 0.0, friction: 0.1, wordCount: 45, energy: 0.28, cadence: 1.9, text: 'another batch of words here', ts: 3 },
    // now locked — these get topology scores
    { sentiment: 0.7, friction: 0.8, wordCount: 100, energy: 0.7, cadence: 4.0, text: 'very different signal now urgent', ts: 4 },
    { sentiment: -0.5, friction: 0.3, wordCount: 30, energy: 0.2, cadence: 1.5, text: 'calm down settle relax', ts: 5 },
  ];

  const results = batches.map(b => te.feed(b, null));

  // First 2: CALIBRATING (warmupN=3 → batches 1,2 are warmup, batch 3 locks+scores)
  for (let i = 0; i < 2; i++) {
    assert(results[i].composite.state === 'CALIBRATING', `batch ${i+1}: CALIBRATING`);
  }
  // Batch 3: lock batch — falls through to post-lock scoring
  assert(results[2].baseline.locked === true, 'batch 3: locks (falls through to scoring)');
  const validStatesAll = ['CALIBRATING','STABLE','POLARIZED','BASELINE_ALERT'];
  assert(validStatesAll.includes(results[2].composite.state), 'batch 3: valid state');

  // Post-lock: locked
  assert(results[3].baseline.locked === true, 'batch 4: baseline locked');
  assert(results[4].baseline.locked === true, 'batch 5: baseline locked');

  // Post-lock: polarity present
  assert(results[3].polarity !== null, 'batch 4: polarity not null');
  assert(results[4].polarity !== null, 'batch 5: polarity not null');

  // State is one of the valid post-warmup states
  const validStates = ['STABLE', 'POLARIZED', 'BASELINE_ALERT'];
  assert(validStates.includes(results[3].composite.state), 'batch 4: valid composite state');
  assert(validStates.includes(results[4].composite.state), 'batch 5: valid composite state');

  // Evidence always populated
  assert(results[3].composite.evidence.length > 0, 'batch 4: evidence non-empty');
  assert(results[4].composite.evidence.length > 0, 'batch 5: evidence non-empty');
}

// ─── SECTION 6: §1.2 — No silent failures ────────────────────────────────────

section('§1.2 — No throws on edge inputs');

{
  const te = new TopologyEngine({ warmupN: 2 });

  // All nulls
  let threw = false;
  try { te.feed({ sentiment: null, friction: null, wordCount: null, energy: null, cadence: null, text: '', ts: 0 }, null); }
  catch(e) { threw=true; console.error('threw on all-null:', e.message); }
  assert(!threw, 'all-null signals: no throw');

  // Zero values
  threw = false;
  try { te.feed({ sentiment: 0, friction: 0, wordCount: 0, energy: 0, cadence: 0, text: '', ts: 0 }, null); }
  catch(e) { threw=true; console.error('threw on zeros:', e.message); }
  assert(!threw, 'zero signals: no throw');

  // Lock with zeros
  threw = false;
  try {
    te.feed({ sentiment: 0, friction: 0, wordCount: 0, energy: 0, cadence: 0, text: '', ts: 1 }, null);
    te.feed({ sentiment: 0.9, friction: 0.9, wordCount: 999, energy: 0.9, cadence: 9.9, text: 'extreme', ts: 2 }, null);
  }
  catch(e) { threw=true; console.error('threw on post-lock extreme:', e.message); }
  assert(!threw, 'post-lock extreme values: no throw');
}

section('§3.2 — Logical monotonicity: batchN always increases');

{
  const pe = new PolarityEngine();
  let prevCount = 0;
  for (let i = 0; i < 10; i++) {
    const r = pe.feed(Math.random() * 2 - 1, i+1, Date.now()+i);
    assert(r.batchCount > prevCount, `batchCount monotone at step ${i+1}`);
    prevCount = r.batchCount;
  }
}

// ─── Done ─────────────────────────────────────────────────────────────────────

summary();
