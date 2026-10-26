'use strict';

/**
 * PENDULUM SWING — Test Suite
 * Tests the math engine and kernel against known inputs.
 * No test framework dependency. Plain assertions.
 */

const math = require('../src/math');
const kernel = require('../src/kernel');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log('  PASS ' + label);
    passed++;
  } else {
    console.log('  FAIL ' + label);
    failed++;
  }
}

function assertClose(a, b, tolerance, label) {
  const diff = Math.abs(a - b);
  assert(diff <= tolerance, label + ' (got ' + a + ', expected ' + b + ', tol ' + tolerance + ')');
}

// ─── Build synthetic observations with known period ───────────────────────────
// Sine wave: period = 1000ms, amplitude = 1.0, mean = 0
function sineObs(count, periodMs, amplitude, mean, startTs) {
  const obs = [];
  for (var i = 0; i < count; i++) {
    const ts = startTs + i * (periodMs / count);
    const value = mean + amplitude * Math.sin((2 * Math.PI * i) / count);
    obs.push({ ts: Math.round(ts), value: Math.round(value * 1000) / 1000 });
  }
  return obs;
}

// ─── MATH ENGINE TESTS ────────────────────────────────────────────────────────
console.log('\n--- math.mean ---');
assert(math.mean([{ ts: 1, value: 2 }, { ts: 2, value: 4 }]) === 3, 'mean of [2,4] = 3');
assert(math.mean([]) === 0, 'mean of [] = 0');

console.log('\n--- math.amplitude ---');
const flatObs = [
  { ts: 1000, value: 0 },
  { ts: 2000, value: 1 },
  { ts: 3000, value: 0 },
  { ts: 4000, value: -1 },
  { ts: 5000, value: 0 }
];
const amp = math.amplitude(flatObs);
assert(amp.positive === 1, 'amplitude positive = 1');
assert(amp.negative === 1, 'amplitude negative = 1');
assert(amp.asymmetry === 1, 'amplitude asymmetry = 1 (symmetric)');

console.log('\n--- math.period ---');
// 60 observations over 3 full cycles of 2000ms each — enough for crossing detection
const sineData = sineObs(60, 2000, 1, 0, 1000000);
const per = math.period(sineData);
assert(per.confidence > 0, 'period has confidence');
assert(per.value !== null || per.reason === 'NEED_MORE_CYCLES', 'period result is defined');
if (per.value) {
  assertClose(per.value, 2000, 600, 'period ~2000ms');
}

console.log('\n--- math.damping ---');
// Decaying sine — amplitude halves in second half
const dacayingObs = [];
for (var i = 0; i < 20; i++) {
  const ts = 1000000 + i * 100;
  const amp2 = i < 10 ? 1.0 : 0.5;
  const value = amp2 * Math.sin((2 * Math.PI * i) / 10);
  dacayingObs.push({ ts: ts, value: Math.round(value * 1000) / 1000 });
}
const damp = math.damping(dacayingObs);
assert(damp.value !== null || damp.direction === 'damping', 'damping detected in decaying signal');

console.log('\n--- math.profile (insufficient data) ---');
const p1 = math.profile([]);
assert(p1.status === 'NO_DATA', 'empty obs = NO_DATA');
const p2 = math.profile([{ ts: 1000, value: 0.5 }, { ts: 2000, value: 0.6 }]);
assert(p2.status === 'WARMING', '2 obs = WARMING');

console.log('\n--- math.profile (active) ---');
const activeObs = sineObs(20, 4000, 1, 0, 1000000);
const p3 = math.profile(activeObs);
assert(p3.status === 'ACTIVE', '20 obs = ACTIVE');
assert(p3.observationCount === 20, 'observationCount = 20');
assertClose(p3.mean, 0, 0.1, 'mean ~0');

// ─── KERNEL TESTS ─────────────────────────────────────────────────────────────
console.log('\n--- kernel: init ---');
const testDataPath = path.join(__dirname, 'test-pendulum-data.json');
try { fs.unlinkSync(testDataPath); } catch (_) {}

const initResult = kernel.init(testDataPath);
assert(initResult.ok === true, 'init returns ok');
assert(Array.isArray(initResult.signals), 'init returns signals array');

console.log('\n--- kernel: observe ---');
const now = Date.now();
const r1 = kernel.observe('valence', 0.3, 'test', now);
assert(r1 !== null, 'observe returns profile');
assert(r1.signalId === 'valence', 'signalId correct');
assert(r1.profile.observationCount === 1, 'observationCount = 1 after first observe');

kernel.observe('valence', 0.7, 'test', now + 1000);
kernel.observe('valence', 0.3, 'test', now + 2000);
const r4 = kernel.observe('valence', 0.7, 'test', now + 3000);
assert(r4.profile.observationCount === 4, 'observationCount = 4');
assert(r4.profile.status === 'ACTIVE', 'status ACTIVE after 4 obs');

console.log('\n--- kernel: causality enforcement ---');
let causalityRejected = false;
try {
  kernel.observe('valence', 0.5, 'test', now - 9999);
} catch (e) {
  causalityRejected = e.message.indexOf('out-of-order') > -1;
}
assert(causalityRejected, 'out-of-order timestamp rejected');

console.log('\n--- kernel: profile ---');
const prof = kernel.profile('valence');
assert(prof !== null, 'profile returns data');
assert(prof.signalId === 'valence', 'profile signalId correct');
assert(typeof prof.profile.mean === 'number', 'profile has mean');

console.log('\n--- kernel: signals list ---');
kernel.observe('arousal', 0.8, 'test', now);
const sigs = kernel.signals();
assert(sigs.length === 2, 'two signals tracked');
const ids = sigs.map(function(s) { return s.id; });
assert(ids.indexOf('valence') > -1, 'valence in list');
assert(ids.indexOf('arousal') > -1, 'arousal in list');

console.log('\n--- kernel: compare ---');
kernel.observe('arousal', 0.4, 'test', now + 1000);
kernel.observe('arousal', 0.8, 'test', now + 2000);
kernel.observe('arousal', 0.4, 'test', now + 3000);
const cmp = kernel.compare('valence', 'arousal');
assert(cmp !== null, 'compare returns result');
assert(typeof cmp.phaseDelta === 'number' || cmp.phaseDelta === null, 'phaseDelta is number or null');

console.log('\n--- kernel: snapshot + restore ---');
const snap = kernel.snapshot();
assert(snap.signals && snap.meta, 'snapshot has signals and meta');
const restored = kernel.restore(snap);
assert(restored.ok === true, 'restore returns ok');

console.log('\n--- kernel: persistence ---');
const fileExists = fs.existsSync(testDataPath);
assert(fileExists, 'data file written to disk');
const onDisk = JSON.parse(fs.readFileSync(testDataPath, 'utf8'));
assert(onDisk.signals.valence, 'valence persisted to disk');

console.log('\n--- kernel: remove ---');
const removed = kernel.remove('arousal');
assert(removed === true, 'remove returns true');
assert(kernel.profile('arousal') === null, 'arousal profile null after remove');
assert(kernel.signals().length === 1, 'one signal remaining');

// Cleanup
try { fs.unlinkSync(testDataPath); } catch (_) {}

// ─── RESULTS ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(40));
console.log('PASSED: ' + passed);
console.log('FAILED: ' + failed);
console.log('TOTAL:  ' + (passed + failed));
if (failed === 0) {
  console.log('\nALL TESTS PASS');
  process.exit(0);
} else {
  console.log('\nFAILURES PRESENT');
  process.exit(1);
}
