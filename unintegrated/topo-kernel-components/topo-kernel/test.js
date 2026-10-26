'use strict';

/**
 * TOPO-KERNEL — Test Suite
 * Real signals. No mocks. Nothing pretends to work.
 */

const { TopoKernel, EVENT_TYPES } = require('./index');

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

section('Boot');
const kernel = new TopoKernel();
assert(kernel.bus, 'bus instantiated');
assert(kernel.snr, 'snr engine instantiated');

// ── Valid signal passes ───────────────────────────────────────────────────────

section('Valid signal — relational / connection');
const sig1 = {
  sourceId: 'sensor-A',
  field:    'relational',
  axis:     'connection',
  value:    0.72,
  ts:       Date.now(),
};

// Feed 20 times to build IME history
for (let i = 0; i < 20; i++) {
  kernel.feed({ ...sig1, value: 0.6 + Math.random() * 0.2 }); // consistent range
}
const r1 = kernel.feed(sig1);
assert(typeof r1.snr === 'number', 'snr is a number');
assert(r1.snr >= 0 && r1.snr <= 1, 'snr is [0-1]');
assert(r1.gateScores.fidelity > 0.5, 'fidelity gate: declared field + axis + in-range value');
assert(r1.gateScores.causality > 0.5, 'causality gate: has sourceId + fresh ts');
console.log(`  snr=${r1.snr.toFixed(3)} passed=${r1.passed}`);

// ── Noise signal dropped ──────────────────────────────────────────────────────

section('Noise signal — random chaotic values');
const noiseSig = {
  sourceId: 'chaos-source',
  field:    'threat',
  axis:     'fear',
  value:    0,
  ts:       Date.now(),
};

// Feed pure random noise
let noiseDropped = 0;
for (let i = 0; i < 30; i++) {
  const v = (Math.random() * 2 - 1); // full random [-1,1]
  const r = kernel.feed({ ...noiseSig, value: v, values: Array.from({ length: 10 }, () => Math.random() * 2 - 1) });
  if (!r.passed) noiseDropped++;
}
assert(noiseDropped > 15, `noise source dropped ${noiseDropped}/30 signals (high entropy)`);

// ── Blacklist ─────────────────────────────────────────────────────────────────

section('Blacklist');
kernel.blacklist('bad-actor');
const rBlack = kernel.feed({ sourceId: 'bad-actor', field: 'threat', axis: 'hate', value: -0.9, ts: Date.now() });
assert(!rBlack.passed, 'blacklisted source is always dropped');
assert(rBlack.reason === 'blacklisted', 'reason is blacklisted');

// ── Whitelist ─────────────────────────────────────────────────────────────────

section('Whitelist');
kernel.whitelist('trusted-sensor');
const rWhite = kernel.feed({
  sourceId: 'trusted-sensor',
  field:    'spatial',
  axis:     'safety',
  value:    0.9,
  ts:       Date.now(),
});
assert(rWhite.passed, 'whitelisted source always passes');
assert(rWhite.snr === 1, 'whitelisted snr = 1');

// ── Bus events ────────────────────────────────────────────────────────────────

section('Bus events');
let passedEvents = 0;
let droppedEvents = 0;
kernel.on(EVENT_TYPES.SIGNAL_PASSED,  () => passedEvents++);
kernel.on(EVENT_TYPES.SIGNAL_DROPPED, () => droppedEvents++);

kernel.feed({ sourceId: 'bus-test', field: 'bonding', axis: 'attachment', value: 0.5, ts: Date.now() });
kernel.feed({ sourceId: 'bad-actor', field: 'threat', axis: 'fear', value: -0.5, ts: Date.now() }); // blacklisted

// Give sync handlers a tick
assert(droppedEvents >= 1, 'SIGNAL_DROPPED emitted for blacklisted source');

// ── Invalid signal ────────────────────────────────────────────────────────────

section('Invalid / malformed signals');
const rNull    = kernel.feed(null);
const rEmpty   = kernel.feed({});
const rNoTs    = kernel.feed({ sourceId: 's', field: 'relational', axis: 'connection', value: 0.5 });

assert(!rNull.passed,  'null signal dropped');
assert(rNull.snr === 0, 'null signal snr=0');
assert(typeof rEmpty.snr === 'number', 'empty signal returns snr number');
assert(typeof rNoTs.snr  === 'number', 'no-ts signal returns snr number');
// No ts should hurt causality score
assert(rNoTs.gateScores.causality < 0.8, 'missing ts reduces causality score');

// ── Stale timestamp ───────────────────────────────────────────────────────────

section('Stale timestamp');
const rStale = kernel.feed({
  sourceId: 'stale-src',
  field:    'temporal',
  axis:     'time',
  value:    0.3,
  ts:       Date.now() - 600000, // 10 minutes old — clearly stale
});
assert(rStale.gateScores.causality < 0.7, 'stale timestamp reduces causality score');

// ── Repeated identical value (pattern noise) ──────────────────────────────────

section('Pattern noise — identical repeating value');
const flatSig = { sourceId: 'flat-signal', field: 'bonding', axis: 'alignment', value: 0.5, ts: Date.now() };
for (let i = 0; i < 60; i++) kernel.feed({ ...flatSig, ts: Date.now() });
const rFlat = kernel.feed(flatSig);
assert(rFlat.gateScores.pattern < 0.5, 'perfectly repeating value flagged by pattern gate');

// ── Trust updates over time ───────────────────────────────────────────────────

section('Bayesian trust — consistent source builds trust');
const reliableSig = { sourceId: 'reliable-source', field: 'spatial', axis: 'patience', value: 0, ts: Date.now() };
for (let i = 0; i < 50; i++) {
  kernel.feed({ ...reliableSig, value: 0.3 + Math.sin(i * 0.2) * 0.1, ts: Date.now() }); // clean oscillation
}
const trust = kernel.trust('reliable-source');
assert(trust !== null, 'IME record created for source');
assert(trust.totalSignals >= 50, 'all signals recorded');
assert(trust.trustScore > 0.5, `trust score built up: ${trust.trustScore?.toFixed(3)}`);

// ── Stats ─────────────────────────────────────────────────────────────────────

section('Stats');
const stats = kernel.stats();
assert(stats.snr.processed > 0, 'snr processed count > 0');
assert(stats.bus.emitted   > 0, 'bus emitted count > 0');
console.log(`  snr: processed=${stats.snr.processed} passed=${stats.snr.passed} dropped=${stats.snr.dropped}`);
console.log(`  bus: emitted=${stats.bus.emitted} delivered=${stats.bus.delivered}`);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(40)}`);
console.log(`${passed + failed} tests  |  ${passed} passed  |  ${failed} failed`);
if (failed > 0) {
  console.error('\nSYSTEM BROKEN. Fix before building further.');
  process.exit(1);
}
console.log('\nSYSTEM VALID. SNR root is solid.');
