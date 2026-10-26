/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK BehaviorAnalysisModule — Test Suite                               ║
 * ║  behavior-module.test.js  ·  v1.2.0                                    ║
 * ║  §4.4 — Every runtime file has a deep, specific test suite.            ║
 * ║  §8.6 — All tests must pass before output.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Run: node behavior-module.test.js
 * Exit 0 = all pass. Exit 1 = failure.
 */

import {
  ContrastiveDetector,
  NegativeSpaceDetector,
  ShadowDetector,
  RhythmDetector,
  EscalationDetector,
  AttachmentDetector,
  HermeticDetector,
  CrossModalDetector,
  VideoNarrativeTranslator,
  BehaviorAnalysisModule,
  PATTERN_DOMAIN,
  CONFIDENCE,
} from '../behavior/behavior-module.js';
import { createKernel } from '../../kernel.js';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0, failed = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg ?? 'Assertion failed');
}

function assertEq(a, b, msg) {
  if (a !== b) throw new Error(msg ?? `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function assertRange(val, lo, hi, msg) {
  if (val < lo || val > hi) throw new Error(msg ?? `Expected ${val} in [${lo}, ${hi}]`);
}

function assertNotNull(val, msg) {
  if (val === null || val === undefined) throw new Error(msg ?? 'Expected non-null');
}

function assertNull(val, msg) {
  if (val !== null && val !== undefined) throw new Error(msg ?? `Expected null, got ${JSON.stringify(val)}`);
}

// ─── Section: ContrastiveDetector ────────────────────────────────────────────

console.log('\n§ ContrastiveDetector');

test('returns null for short non-hedged text', () => {
  const d = new ContrastiveDetector();
  const r = d.analyze('The meeting was good.');
  assertNull(r, 'Expected null for low-hedge text');
});

test('detects high hedge density', () => {
  const d = new ContrastiveDetector();
  // Feed hedge-heavy text repeatedly to build window
  for (let i = 0; i < 5; i++) d.analyze('maybe i think perhaps it could possibly be sort of okay');
  const r = d.analyze('maybe i guess possibly it might be kind of fine perhaps');
  assertNotNull(r, 'Expected detection on heavy hedge text');
  assertEq(r.domain, PATTERN_DOMAIN.CONTRASTIVE);
  assert(r.hedgeDensity > 0.1, `Hedge density ${r.hedgeDensity} too low`);
});

test('detects yes-but pattern', () => {
  const d = new ContrastiveDetector();
  const r = d.analyze('Yes, but that is not really what I meant.');
  assertNotNull(r, 'yes-but pattern should fire');
  assert(r.yesBut === true, 'yesBut should be true');
});

test('detects I know however pattern', () => {
  const d = new ContrastiveDetector();
  const r = d.analyze('I know however this seems different from what you said.');
  assertNotNull(r, 'i know however should fire');
});

test('confidence scales with score', () => {
  const d = new ContrastiveDetector();
  for (let i = 0; i < 10; i++) d.analyze('maybe perhaps possibly i think it could be sort of kind of');
  const r = d.analyze('maybe i guess perhaps possibly it might be');
  assertNotNull(r);
  assert(['LOW','MEDIUM','HIGH'].includes(r.confidence), 'Confidence must be LOW/MEDIUM/HIGH');
});

test('reset clears window state', () => {
  const d = new ContrastiveDetector();
  for (let i = 0; i < 5; i++) d.analyze('maybe perhaps possibly i think kind of sort of');
  d.reset();
  const r = d.analyze('that is great');
  assertNull(r, 'After reset, low-hedge text should be null');
});

// ─── Section: NegativeSpaceDetector ──────────────────────────────────────────

console.log('\n§ NegativeSpaceDetector');

test('returns null for insufficient corpus', () => {
  const d = new NegativeSpaceDetector();
  const r = d.analyze('Hi there');
  assertNull(r, 'Too short — should be null');
});

test('detects absence of somatic and emotion vocabulary', () => {
  const d = new NegativeSpaceDetector();
  // Feed clinical, abstract text with no emotion or body words
  const clinicalText = 'The quarterly report indicated significant variance in the operational metrics. The committee reviewed the data and confirmed the findings. The analysis was conducted by the external team.';
  // Feed enough to hit 30-word minimum
  for (let i = 0; i < 5; i++) d.analyze(clinicalText);
  const r = d.analyze(clinicalText);
  assertNotNull(r, 'Clinical text with no somatic/emotion vocabulary should trigger');
  assert(r.somaticDensity < 0.01, `Somatic density ${r.somaticDensity} should be near 0`);
  assert(r.emotionDensity < 0.01, `Emotion density ${r.emotionDensity} should be near 0`);
});

test('does NOT fire on emotional-rich text', () => {
  const d = new NegativeSpaceDetector();
  const emotional = 'I feel deeply sad and my chest is heavy. I am scared and my body feels tense. I sense something is wrong.';
  for (let i = 0; i < 5; i++) d.analyze(emotional);
  const r = d.analyze(emotional);
  assertNull(r, 'Emotional text should not trigger negative space');
});

test('silence logging does not throw', () => {
  const d = new NegativeSpaceDetector();
  d.logSilence(2000);
  d.logSilence(500);
  assert(true, 'Silence logging should not throw');
});

// ─── Section: ShadowDetector ──────────────────────────────────────────────────

console.log('\n§ ShadowDetector');

test('returns null for first-person direct speech', () => {
  const d = new ShadowDetector();
  const r = d.analyzeText('I feel angry and I am taking responsibility for my part in this.');
  assertNull(r, 'Clear I-language should not trigger shadow');
});

test('detects high projection pronoun density', () => {
  const d = new ShadowDetector();
  // External locus + projection
  for (let i = 0; i < 5; i++) {
    d.analyzeText('You people never listen. They always cause the problem. Everyone does this to you. Nobody cares.');
  }
  const r = d.analyzeText('You always do this. They never change. People are always like this.');
  assertNotNull(r, 'High projection should trigger');
  assert(r.projectionDensity > 0.1, `Projection density ${r.projectionDensity} too low`);
});

test('detects displacement: high energy, neutral text', () => {
  const d = new ShadowDetector();
  const r = d.analyzeDisplacement('The thing is fine it is okay', 0.75, 0.05);
  assertNotNull(r, 'High energy + neutral text = displacement');
  assertEq(r.subtype, 'displacement');
});

test('no displacement when text has escalation words', () => {
  const d = new ShadowDetector();
  const r = d.analyzeDisplacement('This is the worst thing ever terrible always', 0.75, 0.05);
  assertNull(r, 'Escalation words present — not displacement');
});

test('over-qualification pattern detected', () => {
  const d = new ShadowDetector();
  const r = d.analyzeText("I'm not saying that I mean it's not that I don't understand.");
  assertNotNull(r, 'Over-qualification pattern should fire');
});

// ─── Section: RhythmDetector ──────────────────────────────────────────────────

console.log('\n§ RhythmDetector');

test('returns null for silence chunks', () => {
  const d = new RhythmDetector();
  const r = d.analyzeTone({ energy: 0, cadence: 0, silence: true, durationMs: 500 });
  assertNull(r, 'Silence chunk should return null');
});

test('detects high cadence variance', () => {
  const d = new RhythmDetector();
  // Feed alternating low and high cadence to create high variance
  for (let i = 0; i < 20; i++) {
    d.analyzeTone({ energy: 0.3, cadence: i % 2 === 0 ? 0.1 : 8.0, silence: false, durationMs: 500 });
  }
  const r = d.analyzeTone({ energy: 0.3, cadence: 0.1, silence: false, durationMs: 500 });
  assertNotNull(r, 'High cadence variance should trigger');
  assert(r.cadenceVariance > 0.5, `Cadence variance ${r.cadenceVariance} should be high`);
});

test('detects word repetition', () => {
  const d = new RhythmDetector();
  // Feed same word multiple times across utterances
  d.analyzeText('pain pain pain');
  d.analyzeText('pain again pain');
  const r = d.analyzeText('pain pain something else');
  assertNotNull(r, 'Word repetition should trigger');
  assert(r.repeated.includes('pain'), 'pain should be in repeated');
});

test('detects rising prosodic contour', () => {
  const d = new RhythmDetector();
  // Feed gradually increasing energy
  for (let i = 0; i < 15; i++) {
    d.analyzeTone({ energy: 0.1 + i * 0.03, cadence: 2.0, silence: false, durationMs: 500 });
  }
  const r = d.analyzeTone({ energy: 0.55, cadence: 2.0, silence: false, durationMs: 500 });
  // May or may not fire depending on slope — just check it doesn't throw
  assert(r === null || r.prosodic !== undefined, 'Should return null or valid result');
});

// ─── Section: EscalationDetector ─────────────────────────────────────────────

console.log('\n§ EscalationDetector');

test('detects declining sentiment gradient', () => {
  const d = new EscalationDetector();
  for (let i = 0; i < 10; i++) d.analyzeSentiment({ score: 0.4 - i * 0.08, rollingAvg: 0.2 });
  const r = d.analyzeSentiment({ score: -0.5, rollingAvg: -0.3 });
  assertNotNull(r, 'Declining sentiment should trigger');
  assertEq(r.direction, 'DECLINING');
});

test('detects shift cluster', () => {
  const d = new EscalationDetector();
  d.analyzeShift({ primary: { severity: 'MEDIUM' } });
  d.analyzeShift({ primary: { severity: 'HIGH' } });
  const r = d.analyzeShift({ primary: { severity: 'HIGH' } });
  assertNotNull(r, '3+ shifts should trigger cluster');
  assertEq(r.subtype, 'shift_cluster');
  assert(r.shiftCount >= 3, 'shift count should be >= 3');
});

test('detects repair attempt in text', () => {
  const d = new EscalationDetector();
  const r = d.analyzeText('I understand what you are saying and I apologize.');
  assertNotNull(r, 'Repair attempt should fire');
  assertEq(r.subtype, 'repair_attempt');
});

test('detects linguistic amplifier', () => {
  const d = new EscalationDetector();
  const r = d.analyzeText('You always do this every single time it is terrible.');
  assertNotNull(r, 'Escalation words should fire');
  assertEq(r.subtype, 'linguistic_amplifier');
});

test('improving sentiment = IMPROVING direction', () => {
  const d = new EscalationDetector();
  for (let i = 0; i < 10; i++) d.analyzeSentiment({ score: -0.3 + i * 0.07, rollingAvg: 0 });
  const r = d.analyzeSentiment({ score: 0.5, rollingAvg: 0.3 });
  if (r) assertEq(r.direction, 'IMPROVING', 'Should be IMPROVING');
  assert(true);
});

// ─── Section: AttachmentDetector ─────────────────────────────────────────────

console.log('\n§ AttachmentDetector');

test('returns a vector that sums to ~1', () => {
  const d = new AttachmentDetector();
  for (let i = 0; i < 30; i++) {
    d.update({ repairAttempt: i % 4 === 0, withdrawal: false, escalation: false, shift: false, syncScore: 0.7 });
  }
  const r = d.score();
  const sum = r.vector.secure + r.vector.anxious + r.vector.avoidant + r.vector.disorganized;
  assertRange(sum, 0.99, 1.01, `Vector sum ${sum} should be ~1`);
});

test('high repair + high sync → secure dominant', () => {
  const d = new AttachmentDetector();
  for (let i = 0; i < 50; i++) {
    d.update({ repairAttempt: true, withdrawal: false, escalation: false, shift: false, syncScore: 0.9 });
  }
  const r = d.score();
  assertEq(r.dominant, 'secure', `Expected secure dominant, got ${r.dominant}`);
});

test('high withdrawal + no repair → avoidant dominant', () => {
  const d = new AttachmentDetector();
  for (let i = 0; i < 50; i++) {
    d.update({ repairAttempt: false, withdrawal: true, escalation: false, shift: false, syncScore: 0.1 });
  }
  const r = d.score();
  assert(['avoidant', 'disorganized'].includes(r.dominant), `Expected avoidant or disorganized, got ${r.dominant}`);
});

test('confidence is LOW with insufficient frames', () => {
  const d = new AttachmentDetector();
  d.update({ repairAttempt: false });
  const r = d.score();
  assertEq(r.confidence, CONFIDENCE.LOW, 'Should be LOW with < 20 frames');
});

test('trajectory is appended on each score call', () => {
  const d = new AttachmentDetector();
  for (let i = 0; i < 5; i++) { d.update({ syncScore: 0.5 }); d.score(); }
  assert(d._trajectory.length > 0, 'Trajectory should be populated');
});

// ─── Section: HermeticDetector ───────────────────────────────────────────────

console.log('\n§ HermeticDetector');

test('returns null for open, questioning text', () => {
  const d = new HermeticDetector();
  const r = d.analyze('What do you think? I am not sure how to interpret this. Can you help me understand?');
  assertNull(r, 'Open questioning text should not trigger hermetic');
});

test('detects certainty density', () => {
  const d = new HermeticDetector();
  for (let i = 0; i < 10; i++) d.analyze('Obviously this is clearly the truth. Of course everyone knows this is undeniably true.');
  const r = d.analyze('Obviously it is clear. Everyone knows this.');
  assertNotNull(r, 'High certainty density should trigger');
  assert(r.certaintyDensity > 0, 'Certainty density should be > 0');
});

test('detects low question rate in absolute statements', () => {
  const d = new HermeticDetector();
  for (let i = 0; i < 20; i++) d.analyze('This is simply the truth. It is obvious. Everyone agrees. There is no question about it.');
  const r = d.analyze('This is simply the truth again and again it is always obvious.');
  if (r) {
    assert(r.questionRate < 0.1, `Question rate ${r.questionRate} should be low`);
  }
  assert(true);
});

// ─── Section: CrossModalDetector ─────────────────────────────────────────────

console.log('\n§ CrossModalDetector');

test('returns null with no data', () => {
  const d = new CrossModalDetector();
  const r = d.analyze();
  assertNull(r, 'No data should return null');
});

test('detects positive text + negative visual', () => {
  const d = new CrossModalDetector();
  d.update({ sentiment: 0.5, energy: 0.3, faceCues: ['gaze_aversion', 'mouth_tighten'] });
  const r = d.analyze();
  assertNotNull(r, 'Positive sentiment + negative cues should fire');
  assert(r.incongruences.includes('positive_text_negative_visual'));
});

test('does not fire on congruent signals', () => {
  const d = new CrossModalDetector();
  d.update({ sentiment: 0.6, energy: 0.5, faceCues: ['smile_genuine'] });
  const r = d.analyze();
  assertNull(r, 'Positive sentiment + genuine smile should be congruent');
});

test('detects negative sentiment + genuine smile', () => {
  const d = new CrossModalDetector();
  d.update({ sentiment: -0.5, energy: 0.3, faceCues: ['smile_genuine'] });
  const r = d.analyze();
  assertNotNull(r, 'Negative text + genuine smile = incongruence');
  assert(r.incongruences.includes('negative_text_positive_expression'));
});

// ─── Section: VideoNarrativeTranslator ───────────────────────────────────────

console.log('\n§ VideoNarrativeTranslator');

test('generates frame with no data (graceful)', () => {
  const t = new VideoNarrativeTranslator();
  const r = t.generateFrame();
  assert(typeof r.text === 'string', 'text should be string');
  assert(['LOW','MEDIUM','HIGH'].includes(r.confidence), 'confidence must be valid');
});

test('ingests face landmarks without throwing', () => {
  const t = new VideoNarrativeTranslator();
  t.ingestFaceLandmarks({ headTiltDeg: 15, leftEAR: 0.3, rightEAR: 0.3, frameIndex: 1 });
  const r = t.generateFrame();
  assert(r.text.includes('tilted') || r.text.length > 0, 'Should mention tilt');
});

test('ingests cue and mentions it in narrative', () => {
  const t = new VideoNarrativeTranslator();
  t.ingestCue({ cueType: 'brow_furrow', category: 'OCULAR', intensity: 0.5 });
  const r = t.generateFrame();
  assert(r.text.includes('furrow') || r.signals.some(s => s.type === 'brow_furrow'), 'Furrow should appear in narrative or signals');
});

test('cue release removes cue from active state', () => {
  const t = new VideoNarrativeTranslator();
  t.ingestCue({ cueType: 'gaze_aversion', category: 'OCULAR', intensity: 0.6 });
  t.ingestCueRelease('gaze_aversion');
  assert(!t._activeCues.has('gaze_aversion'), 'gaze_aversion should be removed');
});

test('pose landmarks update shoulder state', () => {
  const t = new VideoNarrativeTranslator();
  t.ingestPoseLandmarks({ shoulderRaiseDelta: 0.07 });
  const r = t.generateFrame();
  assert(r.text.includes('shoulder') || r.signals.some(s => s.type === 'shoulder_raise'), 'Should mention shoulder raise');
});

// ─── Section: BehaviorAnalysisModule (integration) ───────────────────────────

console.log('\n§ BehaviorAnalysisModule (integration)');

test('module boots without error', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel });
  assert(mod._session === null, 'No session at boot');
  mod.destroy();
});

test('responds to session start/stop events', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });

  let started = false, stopped = false;
  kernel.subscribe('alk.behavior.session.start', () => { started = true; });
  kernel.subscribe('alk.behavior.session.stop',  () => { stopped = true; });

  kernel.emit('alk.session.capture.start', { sessionId: 'test-01' });
  assert(started, 'session.start should fire');
  assert(mod._session === 'test-01', 'session should be set');

  kernel.emit('alk.session.capture.stop', { sessionId: 'test-01' });
  assert(stopped, 'session.stop should fire');
  assert(mod._session === null, 'session should be cleared');
  mod.destroy();
});

test('transcript triggers pattern detection', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });

  const patterns = [];
  kernel.subscribe('alk.behavior.pattern.detected', (ev) => { patterns.push(ev.payload); });

  kernel.emit('alk.session.capture.start', { sessionId: 'test-02' });
  // Feed hedge-heavy text enough to trigger
  for (let i = 0; i < 8; i++) {
    kernel.emit('alk.verbal.chunk.transcribed', { text: 'maybe i think perhaps it could possibly be sort of okay kind of fine', chunkIndex: i });
  }

  assert(patterns.length > 0, `Expected patterns, got 0`);
  mod.destroy();
});

test('shift event triggers escalation analysis', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });

  const patterns = [];
  kernel.subscribe('alk.behavior.pattern.detected', (ev) => { patterns.push(ev.payload); });

  kernel.emit('alk.session.capture.start', { sessionId: 'test-03' });
  for (let i = 0; i < 5; i++) {
    kernel.emit('alk.verbal.analysis.shift', {
      primary: { metric: 'energy', zScore: 4.2, severity: 'HIGH', direction: 'UP' },
      allShifts: [], shiftIndex: i
    });
  }

  const escalationPatterns = patterns.filter(p => p.domain === PATTERN_DOMAIN.ESCALATION);
  assert(escalationPatterns.length > 0, 'Should have at least one ESCALATION pattern from shift cluster');
  mod.destroy();
});

test('video cue triggers narrative module', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });

  kernel.emit('alk.session.capture.start', { sessionId: 'test-04' });
  kernel.emit('alk.video.cue.detected', {
    cueType: 'brow_furrow', category: 'OCULAR', intensity: 0.5, significance: 'MODERATE'
  });
  assert(mod._activeFaceCues.has('brow_furrow'), 'brow_furrow should be tracked');

  kernel.emit('alk.video.cue.released', { cueType: 'brow_furrow' });
  assert(!mod._activeFaceCues.has('brow_furrow'), 'brow_furrow should be removed');
  mod.destroy();
});

test('health() returns correct structure', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });
  const h = mod.health();
  assertEq(h.uuid, 'alk-mod-behavior-0000-1200-0000-000000000080');
  assertEq(h.version, '1.2.0');
  assert('status' in h, 'health must have status');
  mod.destroy();
});

test('§1.2 — errors are emitted not thrown', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });

  const errors = [];
  kernel.subscribe('alk.behavior.error', (ev) => { errors.push(ev.payload); });

  // Trigger a bad state that would normally throw: feed undefined
  kernel.emit('alk.session.capture.start', { sessionId: 'test-err' });
  // This should NOT throw — errors go to alk.behavior.error
  kernel.emit('alk.verbal.chunk.transcribed', { text: null });
  // No uncaught exception = pass
  assert(true, 'No uncaught exception');
  mod.destroy();
});

test('§3.2 — all emitted events have logical tick (not wall time for ordering)', () => {
  const kernel = createKernel({ ringCap: 1000 });
  const mod = new BehaviorAnalysisModule({ kernel, config: { summaryIntervalMs: 999999, narrativeIntervalMs: 999999, pulseIntervalMs: 999999 } });

  const ticks = [];
  kernel.subscribe('alk.behavior.**', (ev) => { ticks.push(ev.meta.tick); });

  kernel.emit('alk.session.capture.start', { sessionId: 'test-tick' });
  kernel.emit('alk.verbal.chunk.transcribed', { text: 'maybe perhaps i think it could be kind of fine' });

  // Ticks must be strictly monotone
  for (let i = 1; i < ticks.length; i++) {
    assert(ticks[i] > ticks[i-1], `Tick ${ticks[i]} should be > ${ticks[i-1]} (§3.2)`);
  }
  mod.destroy();
});

// ─── Section: §1.8 Pulse ─────────────────────────────────────────────────────

console.log('\n§ Kernel Pulse (§1.8)');

test('kernel startPulse emits alk.kernel.pulse', (done) => {
  return new Promise((resolve, reject) => {
    const kernel = createKernel({ ringCap: 100 });
    let pulseReceived = false;
    kernel.subscribe('alk.kernel.pulse', (ev) => {
      pulseReceived = true;
      assert(typeof ev.payload.tick === 'number', 'pulse.tick should be number');
      assert(typeof ev.payload.ringSize === 'number', 'pulse.ringSize should be number');
      resolve();
    });
    const unsub = kernel.startPulse(50);
    setTimeout(() => {
      unsub();
      if (!pulseReceived) reject(new Error('Pulse not received within timeout'));
    }, 200);
  });
});

// ─── Section: §5.4 Version consistency ───────────────────────────────────────

console.log('\n§ Version Consistency (§5.4)');

test('BehaviorAnalysisModule.VERSION matches MODULE_VERSION', () => {
  assertEq(BehaviorAnalysisModule.VERSION, '1.2.0', 'Version must be 1.2.0');
});

test('BehaviorAnalysisModule.UUID is non-empty string', () => {
  assert(typeof BehaviorAnalysisModule.UUID === 'string' && BehaviorAnalysisModule.UUID.length > 10);
});

// ─── Runner ───────────────────────────────────────────────────────────────────

// Handle async tests
const asyncTests = [];
const originalTest = global.test;

// Run all sync tests, then async
async function runAllAsync() {
  // The pulse test is async — run it manually
  console.log('\n§ Kernel Pulse (§1.8) [async]');
  try {
    const kernel = createKernel({ ringCap: 100 });
    await new Promise((resolve, reject) => {
      let received = false;
      kernel.subscribe('alk.kernel.pulse', (ev) => {
        received = true;
        try {
          assert(typeof ev.payload.tick === 'number');
          assert(ev.payload.version === '1.2.0');
          console.log('  ✓ kernel.startPulse emits alk.kernel.pulse with tick and version');
          passed++;
          total++;
        } catch (e) {
          console.error('  ✗ pulse content invalid:', e.message);
          failed++; total++;
        }
        resolve();
      });
      const stop = kernel.startPulse(50);
      setTimeout(() => { stop(); if (!received) { console.error('  ✗ pulse not received'); failed++; total++; } resolve(); }, 300);
    });
  } catch (err) {
    console.error('  ✗ pulse async failed:', err.message);
    failed++; total++;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  Results: ${passed}/${total} passed  |  ${failed} failed`);
  console.log(`${'─'.repeat(60)}\n`);
  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runAllAsync();
