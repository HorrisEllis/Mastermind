/**
 * Sigma Module Tests — 40 tests
 *
 * SG-1..5   DEFAULT_CONSTRAINT_CONFIG and constants
 * SG-6..12  computeFeatureTree
 * SG-13..28 classify() — regime coverage + precedence + edge cases
 * SG-29..34 createSigmaEngine — factory, hot-swap config
 * SG-35..40 invariants: pure function, no mutation, output shape
 */

import {
  suite, test, assert, assertEqual, assertThrows,
  report, reset,
} from '../runner.js';

import {
  classify, createSigmaEngine, computeFeatureTree,
  DEFAULT_CONSTRAINT_CONFIG, REGIMES, DOMINANT_CAUSES,
} from '../../src/sigma/index.js';

import { createKernel }      from '../../src/kernel/index.js';
import { createAdapter }     from '../../src/adapter/index.js';
import { computeDeltaStream }from '../../src/delta/index.js';

reset();

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDelta(overrides = {}) {
  return {
    eventId:            'test-id',
    eventType:          'test:event',
    eventTs:            overrides.eventTs      ?? 100,
    seq:                overrides.seq          ?? 1,
    gap:                overrides.gap          ?? 1,
    latencyImpact:      overrides.latencyImpact     ?? 0,
    throughputChange:   overrides.throughputChange  ?? 0,
    structuralDeviation:overrides.structuralDeviation ?? 0,
    childCount:         overrides.childCount   ?? 0,
    ownDepth:           overrides.ownDepth     ?? 0,
  };
}

function makeWindow(n, latency = 0, throughput = 0, structural = 0) {
  return Array.from({ length: n }, (_, i) => makeDelta({
    seq: i + 1, eventTs: (i + 1) * 10,
    latencyImpact: latency, throughputChange: throughput,
    structuralDeviation: structural,
  }));
}

function buildRealWindow() {
  const k = createKernel({ ringCap: 1000 });
  const a = createAdapter(k);
  for (let i = 0; i < 20; i++) {
    a.handle('element:callto:running',  { id: `c${i}`, action: 'click' });
    a.handle('element:callto:resolved', { id: `c${i}`, status: 'ok' });
  }
  const all = k.getAll();
  return computeDeltaStream(all, id => k.findById(id), id => k.edgeMeta(id), id => k.getChildren(id));
}

// ── SG-1..5: constants ────────────────────────────────────────────────────────

suite('sg.SG1-5-constants', () => {
  test('SG-1 REGIMES has all five values', () => {
    assertEqual(REGIMES.STABLE,            'stable');
    assertEqual(REGIMES.DEGRADED,          'degraded');
    assertEqual(REGIMES.COLLAPSING,        'collapsing');
    assertEqual(REGIMES.OSCILLATORY,       'oscillatory');
    assertEqual(REGIMES.INSUFFICIENT_DATA, 'insufficient_data');
  });
  test('SG-2 DOMINANT_CAUSES has S K O C', () => {
    assertEqual(DOMINANT_CAUSES.S, 'S');
    assertEqual(DOMINANT_CAUSES.K, 'K');
    assertEqual(DOMINANT_CAUSES.O, 'O');
    assertEqual(DOMINANT_CAUSES.C, 'C');
  });
  test('SG-3 DEFAULT_CONSTRAINT_CONFIG is frozen', () => {
    assert(Object.isFrozen(DEFAULT_CONSTRAINT_CONFIG));
  });
  test('SG-4 DEFAULT_CONSTRAINT_CONFIG has all required fields', () => {
    const c = DEFAULT_CONSTRAINT_CONFIG;
    assert(typeof c.version          === 'string');
    assert(typeof c.minWindow        === 'number');
    assert(typeof c.slopeThreshold   === 'number');
    assert(typeof c.accelThreshold   === 'number');
    assert(typeof c.oscillationCount === 'number');
    assert(typeof c.depthDeviation   === 'number');
  });
  test('SG-5 minWindow is 3', () => {
    assertEqual(DEFAULT_CONSTRAINT_CONFIG.minWindow, 3);
  });
});

// ── SG-6..12: computeFeatureTree ─────────────────────────────────────────────

suite('sg.SG6-12-featureTree', () => {
  test('SG-6 empty window returns all zeros', () => {
    const ft = computeFeatureTree([]);
    assertEqual(ft.S, 0); assertEqual(ft.K, 0);
    assertEqual(ft.O, 0); assertEqual(ft.C, 0);
  });
  test('SG-7 single delta with high latency → S elevated', () => {
    const ft = computeFeatureTree([makeDelta({ latencyImpact: 2.5 })]);
    assertEqual(ft.S, 2.5);
  });
  test('SG-8 high throughputChange → K elevated', () => {
    const ft = computeFeatureTree([makeDelta({ throughputChange: 0.8 })]);
    assertEqual(ft.K, 0.8);
  });
  test('SG-9 high structuralDeviation → C elevated', () => {
    const ft = computeFeatureTree([makeDelta({ structuralDeviation: 3.0 })]);
    assertEqual(ft.C, 3.0);
  });
  test('SG-10 oscillation counted on sign flip in latencyImpact', () => {
    const window = [
      makeDelta({ latencyImpact:  0.5 }),
      makeDelta({ latencyImpact: -0.5 }),
      makeDelta({ latencyImpact:  0.5 }),
      makeDelta({ latencyImpact: -0.5 }),
      makeDelta({ latencyImpact:  0.5 }),
    ];
    const ft = computeFeatureTree(window);
    assert(ft.O >= 1, `expected O >= 1, got ${ft.O}`);
  });
  test('SG-11 S takes max across window', () => {
    const window = [
      makeDelta({ latencyImpact: 0.1 }),
      makeDelta({ latencyImpact: 5.0 }),
      makeDelta({ latencyImpact: 0.2 }),
    ];
    assertEqual(computeFeatureTree(window).S, 5.0);
  });
  test('SG-12 feature tree has meanS meanK meanC', () => {
    const ft = computeFeatureTree(makeWindow(5, 0.4, 0.2, 0.1));
    assert(typeof ft.meanS === 'number');
    assert(typeof ft.meanK === 'number');
    assert(typeof ft.meanC === 'number');
  });
});

// ── SG-13..28: classify() ─────────────────────────────────────────────────────

suite('sg.SG13-28-classify', () => {
  test('SG-13 null window → insufficient_data', () => {
    assertEqual(classify(null).regime, REGIMES.INSUFFICIENT_DATA);
  });
  test('SG-14 empty window → insufficient_data', () => {
    assertEqual(classify([]).regime, REGIMES.INSUFFICIENT_DATA);
  });
  test('SG-15 window < minWindow → insufficient_data', () => {
    assertEqual(classify(makeWindow(2)).regime, REGIMES.INSUFFICIENT_DATA);
  });
  test('SG-16 window = minWindow, all zeros → stable', () => {
    const r = classify(makeWindow(3));
    assertEqual(r.regime, REGIMES.STABLE);
  });
  test('SG-17 K >= accelThreshold → collapsing', () => {
    const w = makeWindow(5, 0, 0.6); // throughputChange=0.6 > default 0.5
    const r = classify(w);
    assertEqual(r.regime,         REGIMES.COLLAPSING);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.K);
  });
  test('SG-18 O >= oscillationCount → oscillatory', () => {
    // Build window with 3+ true sign flips (positive ↔ negative)
    const w = [
      makeDelta({ seq:1, eventTs:10,  latencyImpact:  0.5 }),
      makeDelta({ seq:2, eventTs:20,  latencyImpact: -0.5 }),
      makeDelta({ seq:3, eventTs:30,  latencyImpact:  0.5 }),
      makeDelta({ seq:4, eventTs:40,  latencyImpact: -0.5 }),
      makeDelta({ seq:5, eventTs:50,  latencyImpact:  0.5 }),
      makeDelta({ seq:6, eventTs:60,  latencyImpact: -0.5 }),
      makeDelta({ seq:7, eventTs:70,  latencyImpact:  0.5 }),
    ];
    const r = classify(w);
    assertEqual(r.regime,         REGIMES.OSCILLATORY);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.O);
  });
  test('SG-19 S >= slopeThreshold → degraded', () => {
    const w = makeWindow(5, 0.5); // latencyImpact=0.5 > default 0.3
    const r = classify(w);
    assertEqual(r.regime,         REGIMES.DEGRADED);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.S);
  });
  test('SG-20 C >= depthDeviation, S/K/O below → stable with C cause', () => {
    const w = makeWindow(5, 0, 0, 2.5); // structuralDeviation=2.5 > default 2.0
    const r = classify(w);
    assertEqual(r.regime,         REGIMES.STABLE);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.C);
    assert(r.confidence > 0);
  });
  test('SG-21 collapsing takes precedence over degraded', () => {
    // Both K and S above threshold — K wins
    const w = makeWindow(5, 0.5, 0.8); // both above defaults
    const r = classify(w);
    assertEqual(r.regime,         REGIMES.COLLAPSING);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.K);
  });
  test('SG-22 result is frozen', () => {
    assert(Object.isFrozen(classify(makeWindow(5))));
  });
  test('SG-23 result.window is frozen array of two numbers', () => {
    const r = classify(makeWindow(5));
    assert(Object.isFrozen(r.window));
    assert(Array.isArray(r.window) || (r.window[0] !== undefined));
    assert(typeof r.window[0] === 'number');
    assert(typeof r.window[1] === 'number');
  });
  test('SG-24 confidence is 0..1', () => {
    const r = classify(makeWindow(5, 0.5));
    assert(r.confidence >= 0 && r.confidence <= 1, `confidence out of range: ${r.confidence}`);
  });
  test('SG-25 policy_version matches config version', () => {
    const cfg = { ...DEFAULT_CONSTRAINT_CONFIG, version: 'test-1.2.3' };
    const r   = classify(makeWindow(5), null, cfg);
    assertEqual(r.policy_version, 'test-1.2.3');
  });
  test('SG-26 duration_ticks = last.eventTs - first.eventTs', () => {
    const w = [
      makeDelta({ seq:1, eventTs: 100 }),
      makeDelta({ seq:2, eventTs: 150 }),
      makeDelta({ seq:3, eventTs: 250 }),
    ];
    assertEqual(classify(w).duration_ticks, 150);
  });
  test('SG-27 custom config changes thresholds', () => {
    // With very low slopeThreshold, even zero latency crosses it... unless latency is 0
    // Use K threshold override
    const cfg = { ...DEFAULT_CONSTRAINT_CONFIG, accelThreshold: 0.1 };
    const w   = makeWindow(5, 0, 0.15); // K=0.15 < default 0.5, but > custom 0.1
    const r   = classify(w, null, cfg);
    assertEqual(r.regime, REGIMES.COLLAPSING);
  });
  test('SG-28 classify with pre-computed featureTree uses it directly', () => {
    const w  = makeWindow(5);
    const ft = { S: 0.5, K: 0, O: 0, C: 0, meanS: 0.5, meanK: 0, meanC: 0 };
    const r  = classify(w, ft);
    assertEqual(r.regime,         REGIMES.DEGRADED);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.S);
  });
});

// ── SG-29..34: createSigmaEngine ─────────────────────────────────────────────

suite('sg.SG29-34-engine', () => {
  test('SG-29 engine.classify delegates to classify()', () => {
    const eng = createSigmaEngine();
    const r   = eng.classify(makeWindow(5));
    assert(['stable','degraded','collapsing','oscillatory','insufficient_data']
      .includes(r.regime));
  });
  test('SG-30 engine.getConfig returns current config', () => {
    const eng = createSigmaEngine({ slopeThreshold: 0.1 });
    assertEqual(eng.getConfig().slopeThreshold, 0.1);
  });
  test('SG-31 updateConfig hot-swaps fields', () => {
    const eng = createSigmaEngine();
    eng.updateConfig({ slopeThreshold: 0.1 });
    assertEqual(eng.getConfig().slopeThreshold, 0.1);
    // Other fields unchanged
    assertEqual(eng.getConfig().minWindow, DEFAULT_CONSTRAINT_CONFIG.minWindow);
  });
  test('SG-32 updateConfig changes classification result', () => {
    const eng = createSigmaEngine();
    const w   = makeWindow(5, 0.2); // latency=0.2, default threshold=0.3 → stable
    assertEqual(eng.classify(w).regime, REGIMES.STABLE);
    eng.updateConfig({ slopeThreshold: 0.1 }); // now 0.2 > 0.1 → degraded
    assertEqual(eng.classify(w).regime, REGIMES.DEGRADED);
  });
  test('SG-33 updateConfig with invalid arg throws', () => {
    assertThrows(() => createSigmaEngine().updateConfig(null), 'must be an object');
  });
  test('SG-34 engine.computeFeatureTree is exposed', () => {
    const eng = createSigmaEngine();
    const ft  = eng.computeFeatureTree(makeWindow(3, 0.5));
    assert(typeof ft.S === 'number');
  });
});

// ── SG-35..40: invariants ─────────────────────────────────────────────────────

suite('sg.SG35-40-invariants', () => {
  test('SG-35 classify is pure — same input same output', () => {
    const w  = makeWindow(5, 0.4);
    const r1 = classify(w);
    const r2 = classify(w);
    assertEqual(r1.regime,    r2.regime);
    assertEqual(r1.confidence,r2.confidence);
  });
  test('SG-36 classify does not mutate input window', () => {
    const w    = makeWindow(5, 0.4);
    const orig = JSON.stringify(w);
    classify(w);
    assertEqual(JSON.stringify(w), orig);
  });
  test('SG-37 SigmaResult has all required fields', () => {
    const r = classify(makeWindow(5));
    assert('regime'         in r);
    assert('confidence'     in r);
    assert('dominant_cause' in r);
    assert('duration_ticks' in r);
    assert('policy_version' in r);
    assert('window'         in r);
  });
  test('SG-38 sigma output on real delta stream produces valid regime', () => {
    const deltas = buildRealWindow();
    const r      = classify(deltas);
    assert(Object.values(REGIMES).includes(r.regime), `unknown regime: ${r.regime}`);
    assert(r.confidence >= 0 && r.confidence <= 1);
  });
  test('SG-39 sigma can be used with clip stabilityProfile sigmaRegime', () => {
    // After sigma exists, clip.computeStabilityProfile can return real sigmaRegime.
    // Verify the integration point: sigma output regime strings match what
    // stabilityProfile.sigmaRegime will carry.
    const valid = Object.values(REGIMES);
    const r     = classify(makeWindow(5));
    assert(valid.includes(r.regime));
  });
  test('SG-40 insufficient_data result has null dominant_cause', () => {
    const r = classify([]);
    assertEqual(r.regime, REGIMES.INSUFFICIENT_DATA);
    assertEqual(r.dominant_cause, null);
  });
});

// ── SG-41..52: session shape validation ──────────────────────────────────────
// R5 exit criteria: classify() validated against known session shapes.
// Each test represents a recognisable real-world session pattern.

suite('sg.SG41-52-session-shapes', () => {

  // Shape 1: Healthy steady-state session
  test('SG-41 healthy session — all signals near zero → stable', () => {
    const w = makeWindow(10, 0.05, 0.02, 0.1);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.STABLE);
    assert(r.confidence >= 0 && r.confidence <= 1);
  });

  // Shape 2: Latency spike pattern (S dominates)
  test('SG-42 latency spike session → degraded with S cause', () => {
    const w = makeWindow(8, 0.8, 0.1, 0.1);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.DEGRADED);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.S);
  });

  // Shape 3: Throughput collapse (K dominates)
  test('SG-43 throughput collapse session → collapsing with K cause', () => {
    const w = makeWindow(6, 0.1, 2.0, 0.1);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.COLLAPSING);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.K);
  });

  // Shape 4: Back-and-forth latency (oscillatory)
  test('SG-44 oscillating latency session → oscillatory', () => {
    const w = [
      makeDelta({ seq:1, eventTs:10,  latencyImpact: 0.5 }),
      makeDelta({ seq:2, eventTs:20,  latencyImpact:-0.5 }),
      makeDelta({ seq:3, eventTs:30,  latencyImpact: 0.5 }),
      makeDelta({ seq:4, eventTs:40,  latencyImpact:-0.5 }),
      makeDelta({ seq:5, eventTs:50,  latencyImpact: 0.5 }),
    ];
    const r = classify(w);
    assertEqual(r.regime, REGIMES.OSCILLATORY);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.O);
  });

  // Shape 5: Structural anomaly (C only, S/K/O below threshold)
  test('SG-45 structural anomaly only → stable with C cause', () => {
    const w = makeWindow(5, 0.0, 0.0, 3.0);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.STABLE);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.C);
  });

  // Shape 6: Cold start (too few events)
  test('SG-46 cold-start session (2 events) → insufficient_data', () => {
    const w = makeWindow(2, 0.9, 0.9, 0.9);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.INSUFFICIENT_DATA);
    assertEqual(r.dominant_cause, null);
  });

  // Shape 7: Collapsing overrides oscillatory (precedence)
  test('SG-47 K + O both above threshold → collapsing wins', () => {
    const w = [
      makeDelta({ seq:1, eventTs:10,  latencyImpact: 0.5,  throughputChange: 2.0 }),
      makeDelta({ seq:2, eventTs:20,  latencyImpact:-0.5,  throughputChange: 2.0 }),
      makeDelta({ seq:3, eventTs:30,  latencyImpact: 0.5,  throughputChange: 2.0 }),
      makeDelta({ seq:4, eventTs:40,  latencyImpact:-0.5,  throughputChange: 2.0 }),
      makeDelta({ seq:5, eventTs:50,  latencyImpact: 0.5,  throughputChange: 2.0 }),
    ];
    const r = classify(w);
    assertEqual(r.regime, REGIMES.COLLAPSING, 'collapsing should take precedence over oscillatory');
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.K);
  });

  // Shape 8: Degraded overrides structural (precedence)
  test('SG-48 S + C both above threshold → degraded wins, cause = S', () => {
    const w = makeWindow(5, 0.8, 0.1, 3.0);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.DEGRADED);
    assertEqual(r.dominant_cause, DOMINANT_CAUSES.S);
  });

  // Shape 9: High-confidence collapse
  test('SG-49 very high K → confidence at 1.0', () => {
    const w = makeWindow(5, 0.0, 100.0, 0.0);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.COLLAPSING);
    assertEqual(r.confidence, 1.0);
  });

  // Shape 10: Boundary — exactly at slopeThreshold
  test('SG-50 S exactly at slopeThreshold → degraded', () => {
    const threshold = DEFAULT_CONSTRAINT_CONFIG.slopeThreshold;
    const w = makeWindow(5, threshold, 0.0, 0.0);
    const r = classify(w);
    assertEqual(r.regime, REGIMES.DEGRADED);
  });

  // Shape 11: Duration ticks computed correctly
  test('SG-51 duration_ticks = last.eventTs - first.eventTs across shape', () => {
    const w = [
      makeDelta({ seq:1, eventTs: 100 }),
      makeDelta({ seq:2, eventTs: 200 }),
      makeDelta({ seq:3, eventTs: 400 }),
    ];
    const r = classify(w);
    assertEqual(r.duration_ticks, 300);
  });

  // Shape 12: Hot-swapped config changes shape classification
  test('SG-52 hot-swapped config reclassifies same session shape', () => {
    const w   = makeWindow(5, 0.4, 0.1, 0.1); // S=0.4, above default 0.3 → degraded
    const eng = createSigmaEngine();
    assertEqual(eng.classify(w).regime, REGIMES.DEGRADED, 'default config → degraded');

    eng.updateConfig({ slopeThreshold: 0.5, version: 'test-swap' }); // raise threshold
    assertEqual(eng.classify(w).regime, REGIMES.STABLE, 'raised threshold → stable');
    assertEqual(eng.classify(w).policy_version, 'test-swap');
  });

});

export const result = report('sigma');
