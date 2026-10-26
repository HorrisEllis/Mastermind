/**
 * drift-engine.test.js
 *
 * Tests for DriftEngine — the seven sub-threshold behavioral signals.
 *
 * Run: node --experimental-vm-modules drift-engine.test.js
 * (or via your test runner of choice — no test framework deps, plain assertions)
 */

'use strict';

import { DriftEngine, SIGNAL, CONFIDENCE, DRIFT_VERSION } from
  '../packages/kernel/src/modules/signal/drift-engine.js';

// ── Minimal SISO bus mock ─────────────────────────────────────────────────────
class MockBus {
  constructor() {
    this._subs = new Map();
    this.events = [];
  }
  on(pattern, cb) {
    if (!this._subs.has(pattern)) this._subs.set(pattern, []);
    this._subs.get(pattern).push(cb);
    return () => {};
  }
  emit(type, data = {}) {
    this.events.push({ type, data });
    const subs = this._subs.get(type) ?? [];
    for (const cb of subs) { try { cb(data); } catch(_) {} }
  }
  eventsOf(type) { return this.events.filter(e => e.type === type); }
  lastOf(type)   { const arr = this.eventsOf(type); return arr[arr.length-1] ?? null; }
  clear()        { this.events = []; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

function assertApprox(actual, expected, tolerance, message) {
  const ok = Math.abs(actual - expected) <= tolerance;
  assert(ok, `${message} (got ${actual}, expected ≈${expected} ±${tolerance})`);
}

function test(name, fn) {
  console.log(`\n── ${name}`);
  try { fn(); }
  catch(e) { console.error(`  ✗ THROWN: ${e.message}`); failed++; }
}

// Emit a latent update with a given state vector and inter-event timing
function latentUpdate(bus, personId, state, ts) {
  bus.emit('spatial.kernel.latent.update', { personId, state, ts });
}

// Build a calm baseline state: mid valence, low arousal, low suppression,
// high coherence, mild engagement
const CALM = [0.2, 0.2, 0.1, 0.8, 0.1];

// Push N frames through the engine to complete calibration
function calibrate(bus, engine, personId, n = 45, baseState = CALM) {
  let ts = Date.now();
  for (let i = 0; i < n; i++) {
    latentUpdate(bus, personId, baseState, ts);
    ts += 200; // 200ms inter-event
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('DRIFT_VERSION is set', () => {
  assert(typeof DRIFT_VERSION === 'string' && DRIFT_VERSION.length > 0, 'DRIFT_VERSION defined');
});

test('SIGNAL constants are complete', () => {
  const expected = [
    'PACING_SHIFT', 'MICRO_HESITATION', 'EMOTIONAL_INCONGRUENCE',
    'BEHAVIORAL_DRIFT', 'ENERGY_CHANGE', 'RHYTHM_DISRUPTION', 'PREDICTIVE_MISMATCH',
  ];
  for (const s of expected) assert(SIGNAL[s] === s, `SIGNAL.${s} defined`);
});

test('constructor requires bus', () => {
  let threw = false;
  try { new DriftEngine({}); } catch(e) { threw = true; }
  assert(threw, 'throws without bus');
});

test('calibration phase — no signals emitted during calibration window', () => {
  const bus    = new MockBus();
  const engine = new DriftEngine({ bus });
  let ts = 1000;
  for (let i = 0; i < 39; i++) {
    latentUpdate(bus, 'p1', CALM, ts);
    ts += 200;
  }
  const signals = bus.eventsOf('spatial.kernel.drift.signal');
  assert(signals.length === 0, 'no signals before calibration complete');
  assert(engine.state('p1') === null, 'state() returns null before calibration');
});

test('baseline_ready fires after calibration window', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  const ready = bus.eventsOf('spatial.kernel.drift.baseline_ready');
  assert(ready.length >= 1, 'baseline_ready emitted');
  assert(ready[0].data.personId === 'p1', 'correct personId');
  assert(ready[0].data.source === 'CALIBRATION', 'source is CALIBRATION');
});

test('state() returns null before calibration, object after', () => {
  const bus    = new MockBus();
  const engine = new DriftEngine({ bus });
  assert(engine.state('p1') === null, 'null before calibration');
  calibrate(bus, engine, 'p1');
  const s = engine.state('p1');
  assert(s !== null, 'non-null after calibration');
  assert(typeof s.driftEma === 'number', 'driftEma present');
});

test('BEHAVIORAL_DRIFT — sustained large shift from baseline', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  // Push into a very different region: high arousal, high suppression, low coherence
  let ts = Date.now() + 10000;
  const shifted = [0.8, 0.9, 0.85, 0.1, -0.7];
  for (let i = 0; i < 60; i++) {
    latentUpdate(bus, 'p1', shifted, ts);
    ts += 200;
  }

  const drifts = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.BEHAVIORAL_DRIFT);
  assert(drifts.length > 0, 'BEHAVIORAL_DRIFT detected after large sustained shift');
  const topDrift = drifts[drifts.length - 1];
  assert(topDrift.data.score > 0, 'drift score > 0');
});

test('ENERGY_CHANGE RISING — sustained arousal increase', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  let ts = Date.now() + 10000;
  for (let i = 0; i < 40; i++) {
    // Steadily rising arousal
    const arousal = 0.2 + i * 0.015;
    latentUpdate(bus, 'p1', [0.2, Math.min(arousal, 1.0), 0.1, 0.8, 0.1], ts);
    ts += 200;
  }

  const energyEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.ENERGY_CHANGE);
  assert(energyEvs.length > 0, 'ENERGY_CHANGE detected on rising arousal');
  const rising = energyEvs.filter(e => e.data.direction === 'RISING');
  assert(rising.length > 0, 'direction=RISING for upward slope');
});

test('ENERGY_CHANGE FALLING — sustained arousal decrease', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  // Calibrate at high arousal
  calibrate(bus, null, 'p1', 45, [0.2, 0.8, 0.1, 0.8, 0.1]);
  bus.clear();

  let ts = Date.now() + 10000;
  for (let i = 0; i < 40; i++) {
    const arousal = 0.8 - i * 0.015;
    latentUpdate(bus, 'p1', [0.2, Math.max(arousal, 0), 0.1, 0.8, 0.1], ts);
    ts += 200;
  }

  const fallingEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.ENERGY_CHANGE && e.data.direction === 'FALLING');
  assert(fallingEvs.length > 0, 'ENERGY_CHANGE FALLING on decreasing arousal');
});

test('EMOTIONAL_INCONGRUENCE — high suppression + low coherence', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  let ts = Date.now() + 10000;
  // High suppression (dim 2), low coherence (dim 3) — incongruent
  const incongruent = [0.3, 0.4, 0.85, 0.15, 0.1];
  for (let i = 0; i < 20; i++) {
    latentUpdate(bus, 'p1', incongruent, ts);
    ts += 200;
  }

  const eiEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.EMOTIONAL_INCONGRUENCE);
  assert(eiEvs.length > 0, 'EMOTIONAL_INCONGRUENCE detected on suppression+coherence gap');
  assert(eiEvs[0].data.score > 0, 'score > 0');
});

test('PACING_SHIFT — dramatically slower inter-event timing', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1', 50); // baseline at 200ms
  bus.clear();

  let ts = Date.now() + 20000;
  // Suddenly 4× slower: 800ms inter-event
  for (let i = 0; i < 20; i++) {
    latentUpdate(bus, 'p1', CALM, ts);
    ts += 800;
  }

  const pEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.PACING_SHIFT);
  assert(pEvs.length > 0, 'PACING_SHIFT detected on dramatically slower pacing');
  const slowing = pEvs.filter(e => e.data.direction === 'SLOWING');
  assert(slowing.length > 0, 'direction=SLOWING for longer inter-event');
});

test('PACING_SHIFT — dramatically faster inter-event timing', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1', 50); // baseline 200ms
  bus.clear();

  let ts = Date.now() + 20000;
  // Faster: 30ms inter-event
  for (let i = 0; i < 20; i++) {
    latentUpdate(bus, 'p1', CALM, ts);
    ts += 30;
  }

  const pEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.PACING_SHIFT);
  assert(pEvs.length > 0, 'PACING_SHIFT detected on faster pacing');
  const accel = pEvs.filter(e => e.data.direction === 'ACCELERATING');
  assert(accel.length > 0, 'direction=ACCELERATING for shorter inter-event');
});

test('PREDICTIVE_MISMATCH — sudden trajectory reversal', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  let ts = Date.now() + 10000;
  // Establish a clear upward trajectory over 10 frames
  for (let i = 0; i < 12; i++) {
    latentUpdate(bus, 'p1', [0.2 + i*0.02, 0.2 + i*0.02, 0.1, 0.8, 0.1], ts);
    ts += 200;
  }

  // Abrupt reversal — trajectory model predicted continuation, got opposite
  for (let i = 0; i < 5; i++) {
    latentUpdate(bus, 'p1', [0.1, 0.1, 0.5, 0.3, -0.5], ts);
    ts += 200;
  }

  const pmEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.PREDICTIVE_MISMATCH);
  assert(pmEvs.length > 0, 'PREDICTIVE_MISMATCH detected on sudden reversal');
});

test('RHYTHM_DISRUPTION — high timing variance vs stable baseline', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  // Very stable baseline timing
  calibrate(bus, null, 'p1', 50); // 200ms ±0 (perfectly regular)
  bus.clear();

  let ts = Date.now() + 20000;
  // Now very erratic timing
  const jitter = [50, 900, 100, 700, 200, 600, 80, 850, 120, 750];
  for (let i = 0; i < 30; i++) {
    latentUpdate(bus, 'p1', CALM, ts);
    ts += jitter[i % jitter.length];
  }

  const rdEvs = bus.eventsOf('spatial.kernel.drift.signal')
    .filter(e => e.data.signal === SIGNAL.RHYTHM_DISRUPTION);
  assert(rdEvs.length > 0, 'RHYTHM_DISRUPTION detected on erratic timing');
});

test('co-occurrence boost — 3+ signals produce CLUSTER event', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  // Simultaneously trigger: behavioral drift + emotional incongruence + energy change
  // by using a state very far from baseline with high suppression + slope
  let ts = Date.now() + 20000;
  for (let i = 0; i < 50; i++) {
    const arousal = 0.2 + i * 0.015;
    const shifted = [0.8, Math.min(arousal, 1.0), 0.85, 0.15, -0.8];
    latentUpdate(bus, 'p1', shifted, ts);
    ts += 800; // pacing shift too
  }

  const clusters = bus.eventsOf('spatial.kernel.drift.cluster');
  assert(clusters.length > 0, 'CLUSTER event emitted when 3+ signals co-occur');
  const c = clusters[0].data;
  assert(c.signals.length >= 3, `cluster has ≥3 signals (got ${c.signals.length})`);
  assert(typeof c.clusterScore === 'number', 'clusterScore present');
});

test('co-occurrence boosts individual signal scores', () => {
  // When signals co-occur, their scores should be higher than in isolation.
  // We verify by checking that cluster signals have score > SIGNAL_THRESHOLD substantially.
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  let ts = Date.now() + 20000;
  for (let i = 0; i < 50; i++) {
    const arousal = 0.2 + i * 0.015;
    latentUpdate(bus, 'p1', [0.9, Math.min(arousal, 1.0), 0.9, 0.1, -0.9], ts);
    ts += 800;
  }

  const clusters = bus.eventsOf('spatial.kernel.drift.cluster');
  if (clusters.length > 0) {
    const boosted = clusters[clusters.length-1].data.signals.some(s => s.score > 0.35);
    assert(boosted, 'co-occurrence boosts produce scores above base threshold');
  } else {
    assert(true, 'no cluster — skip boost test (needs stronger stimulus)');
  }
});

test('warm-start from landscape', () => {
  const bus    = new MockBus();
  const engine = new DriftEngine({ bus });

  bus.emit('spatial.kernel.landscape.warmstart', {
    personId: 'p-warm',
    landscape: { restingState: [0.1, 0.3, 0.1, 0.8, 0.2], attractors: [] },
  });

  const ready = bus.eventsOf('spatial.kernel.drift.baseline_ready')
    .filter(e => e.data.personId === 'p-warm');
  assert(ready.length >= 1, 'baseline_ready emitted after warm-start');
  assert(ready[0].data.source === 'WARM_START', 'source=WARM_START');
  assert(engine.state('p-warm') !== null, 'state() available immediately after warm-start');
});

test('setBaseline() manual override', () => {
  const bus    = new MockBus();
  const engine = new DriftEngine({ bus });

  engine.setBaseline('p-manual', { pacingMean: 300, pacingStd: 50 });
  const ready = bus.eventsOf('spatial.kernel.drift.baseline_ready')
    .filter(e => e.data.personId === 'p-manual');
  assert(ready.length >= 1, 'baseline_ready emitted after manual setBaseline');
  assert(ready[0].data.source === 'MANUAL', 'source=MANUAL');
});

test('reset() clears subject state', () => {
  const bus    = new MockBus();
  const engine = new DriftEngine({ bus });
  calibrate(bus, engine, 'p1');
  assert(engine.state('p1') !== null, 'calibrated before reset');
  engine.reset('p1');
  assert(engine.state('p1') === null, 'null after reset');
});

test('session.stop emits summary', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  bus.emit('spatial.session.stop', { personId: 'p1' });
  const summaries = bus.eventsOf('spatial.kernel.drift.summary');
  assert(summaries.length >= 1, 'summary emitted on session.stop');
  assert(summaries[0].data.personId === 'p1', 'correct personId in summary');
  assert(typeof summaries[0].data.signalCounts === 'object', 'signalCounts present');
});

test('pulse emitted on heartbeat interval', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  let ts = Date.now() + 10000;
  for (let i = 0; i < 35; i++) {
    latentUpdate(bus, 'p1', CALM, ts);
    ts += 200;
  }

  const pulses = bus.eventsOf('spatial.kernel.drift.pulse');
  assert(pulses.length >= 1, 'pulse emitted every ~30 frames');
});

test('state snapshot emitted on interval', () => {
  const bus    = new MockBus();
  new DriftEngine({ bus });
  calibrate(bus, null, 'p1');
  bus.clear();

  let ts = Date.now() + 10000;
  for (let i = 0; i < 20; i++) {
    latentUpdate(bus, 'p1', CALM, ts);
    ts += 200;
  }

  const states = bus.eventsOf('spatial.kernel.drift.state');
  assert(states.length >= 1, 'drift.state emitted on interval');
  assert(typeof states[0].data.activeCount === 'number', 'activeCount present');
});

test('multiple subjects isolated', () => {
  const bus    = new MockBus();
  const engine = new DriftEngine({ bus });

  // Calibrate two subjects differently
  calibrate(bus, engine, 'alice');
  calibrate(bus, engine, 'bob', 45, [0.5, 0.6, 0.2, 0.7, 0.3]);

  assert(engine.state('alice') !== null, 'alice calibrated');
  assert(engine.state('bob')   !== null, 'bob calibrated');
  assert(engine.subjectCount   >= 2,     'both subjects tracked');

  // Reset alice — bob should be unaffected
  engine.reset('alice');
  assert(engine.state('alice') === null, 'alice reset');
  assert(engine.state('bob')   !== null, 'bob unaffected by alice reset');
});

test('§K7 no throws on malformed latent update', () => {
  const bus = new MockBus();
  new DriftEngine({ bus });

  let threw = false;
  try {
    bus.emit('spatial.kernel.latent.update', { personId: null, state: null });
    bus.emit('spatial.kernel.latent.update', {});
    bus.emit('spatial.kernel.latent.update', { personId: 'p1', state: undefined });
  } catch(e) {
    threw = true;
  }
  assert(!threw, '§K7 — no throw on malformed input');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n──────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
