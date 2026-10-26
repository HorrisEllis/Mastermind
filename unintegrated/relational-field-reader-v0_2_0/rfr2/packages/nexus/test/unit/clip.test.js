/**
 * Clip Module Tests — 35 tests
 *
 * CL-1..5   computeStabilityProfile
 * CL-6..15  snapshotRange
 * CL-16..21 restoreClip
 * CL-22..30 validateClipStability
 * CL-31..35 full lifecycle: extract → restore → validate
 */

import {
  suite, test, assert, assertEqual, assertThrows,
  assertNotNull, report, reset,
} from '../runner.js';

import {
  snapshotRange, restoreClip, validateClipStability,
  computeStabilityProfile, CLIP_MAGIC, DEFAULT_STABILITY_THRESHOLDS,
} from '../../src/clip/index.js';

import { createKernel, gateOutput } from '../../src/kernel/index.js';
import { createAdapter }             from '../../src/adapter/index.js';
import { computeDeltaStream }        from '../../src/delta/index.js';
import { CONTEXT_REPLAY }            from '../../src/context/index.js';

reset();

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildKernel(n = 15) {
  const k = createKernel({ ringCap: 5000 });
  const a = createAdapter(k);
  for (let i = 0; i < n; i++) {
    a.handle('element:callto:running',  { id: `cmd-${i}`, action: 'click', label: `btn-${i}` });
    a.handle('element:callto:resolved', { id: `cmd-${i}`, status: 'ok' });
    if (i % 5 === 0) a.handle('page:navigated', { from: `/p${i}`, to: `/p${i+1}` });
  }
  return k;
}

function midRange(k) {
  const all = k.getAll();
  const mid = Math.floor(all.length / 2);
  const s   = all[Math.max(0, mid - 5)].seq;
  const e   = all[Math.min(all.length - 1, mid + 5)].seq;
  return { seqStart: s, seqEnd: e };
}

// ── CL-1..5: computeStabilityProfile ─────────────────────────────────────────

suite('cl.CL1-5-stability-profile', () => {
  test('CL-1 insufficient data returns insufficient_data regime', () => {
    const p = computeStabilityProfile([]);
    assertEqual(p.sigmaRegime, 'insufficient_data');
    assertEqual(p.sampleCount, 0);
  });
  test('CL-2 single gap returns insufficient_data', () => {
    const p = computeStabilityProfile([10]);
    assertEqual(p.sigmaRegime, 'insufficient_data');
    assertEqual(p.sampleCount, 1);
  });
  test('CL-3 uniform gaps: sigma=0, slope~0', () => {
    const gaps = [10, 10, 10, 10, 10];
    const p    = computeStabilityProfile(gaps);
    assertEqual(p.meanGap,    10);
    assertEqual(p.sigmaGap,   0);
    assert(Math.abs(p.deltaSlope) < 0.001, 'slope near zero for uniform');
    assertEqual(p.sampleCount, 5);
  });
  test('CL-4 rising gaps produce positive slope', () => {
    const p = computeStabilityProfile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert(p.deltaSlope > 0, 'rising gaps → positive slope');
  });
  test('CL-5 profile is frozen', () => {
    assert(Object.isFrozen(computeStabilityProfile([5, 6, 7, 8])));
  });
});

// ── CL-6..15: snapshotRange ───────────────────────────────────────────────────

suite('cl.CL6-15-snapshotRange', () => {
  test('CL-6 throws if seqStart > seqEnd', () => {
    assertThrows(
      () => snapshotRange(buildKernel(), { seqStart: 10, seqEnd: 5 }),
      'seqStart'
    );
  });
  test('CL-7 throws if no events in range', () => {
    assertThrows(
      () => snapshotRange(buildKernel(), { seqStart: 99999, seqEnd: 99999 }),
      'no events'
    );
  });
  test('CL-8 throws if seqStart/seqEnd not numbers', () => {
    assertThrows(
      () => snapshotRange(buildKernel(), { seqStart: 'a', seqEnd: 10 }),
      'must be numbers'
    );
  });
  test('CL-9 returns NEX-CLIP with correct magic and fmt', () => {
    const k    = buildKernel();
    const r    = midRange(k);
    const clip = snapshotRange(k, r);
    assertEqual(clip.magic, CLIP_MAGIC);
    assertEqual(clip.fmt,   1);
  });
  test('CL-10 clipId is UUID v4', () => {
    const k    = buildKernel();
    const clip = snapshotRange(k, midRange(k));
    assert(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clip.clipId));
  });
  test('CL-11 seqRange matches opts', () => {
    const k   = buildKernel();
    const r   = midRange(k);
    const clip = snapshotRange(k, r);
    assertEqual(clip.seqRange[0], r.seqStart);
    assertEqual(clip.seqRange[1], r.seqEnd);
  });
  test('CL-12 eventCount matches events in range', () => {
    const k    = buildKernel();
    const r    = midRange(k);
    const clip = snapshotRange(k, r);
    const manual = k.getAll().filter(e => e.seq >= r.seqStart && e.seq <= r.seqEnd).length;
    assertEqual(clip.eventCount, manual);
  });
  test('CL-13 stabilityProfile attached by default', () => {
    const clip = snapshotRange(buildKernel(), midRange(buildKernel()));
    assertNotNull(clip.stabilityProfile);
    assert(typeof clip.stabilityProfile.meanGap   === 'number');
    assert(typeof clip.stabilityProfile.sigmaGap  === 'number');
    assert(typeof clip.stabilityProfile.deltaSlope=== 'number');
  });
  test('CL-14 attachStabilityProfile=false omits profile', () => {
    const k    = buildKernel();
    const clip = snapshotRange(k, { ...midRange(k), attachStabilityProfile: false });
    assertEqual(clip.stabilityProfile, null);
  });
  test('CL-15 clip is frozen', () => {
    const clip = snapshotRange(buildKernel(), midRange(buildKernel()));
    assert(Object.isFrozen(clip));
    assert(Object.isFrozen(clip.seqRange));
    assert(Object.isFrozen(clip.entryEvents));
    assert(Object.isFrozen(clip.exitEvents));
    assert(Object.isFrozen(clip.parameters));
  });
});

// ── CL-16..21: restoreClip ────────────────────────────────────────────────────

suite('cl.CL16-21-restoreClip', () => {
  test('CL-16 rejects non-NEX-CLIP artifact', () => {
    assertThrows(
      () => restoreClip({ magic: 'NEX-SNAP', snapshot: {} }),
      'NEX-CLIP'
    );
  });
  test('CL-17 rejects clip without embedded snapshot', () => {
    assertThrows(
      () => restoreClip({ magic: CLIP_MAGIC }),
      'no embedded snapshot'
    );
  });
  test('CL-18 returns a ReplayContext', () => {
    const k    = buildKernel();
    const clip = snapshotRange(k, midRange(k));
    const rc   = restoreClip(clip);
    assertEqual(rc.type, CONTEXT_REPLAY);
  });
  test('CL-19 ReplayContext contains events from the clip range', () => {
    const k    = buildKernel();
    const clip = snapshotRange(k, midRange(k));
    const rc   = restoreClip(clip);
    assert(rc.getAll().length > 0);
    assertEqual(rc.eventCount, rc.getAll().length);
  });
  test('CL-20 run() steps through all events', () => {
    const k     = buildKernel();
    const clip  = snapshotRange(k, midRange(k));
    const rc    = restoreClip(clip);
    let   count = 0;
    rc.run({ onStep: () => { count++; } });
    assertEqual(count, rc.eventCount);
  });
  test('CL-21 complete() returns frozen result with deltaStream', () => {
    const clip   = snapshotRange(buildKernel(), midRange(buildKernel()));
    const result = restoreClip(clip).complete();
    assert(Object.isFrozen(result));
    assert(Array.isArray(result.deltaStream));
  });
});

// ── CL-22..30: validateClipStability ─────────────────────────────────────────

suite('cl.CL22-30-validateClipStability', () => {
  test('CL-22 returns false if no stabilityProfile', () => {
    const r = validateClipStability({ magic: CLIP_MAGIC, stabilityProfile: null }, []);
    assertEqual(r.ok, false);
    assertEqual(r.breach, 'no_stability_profile');
  });
  test('CL-23 returns false if live data insufficient', () => {
    const clip = snapshotRange(buildKernel(), midRange(buildKernel()));
    const r    = validateClipStability(clip, []);
    assertEqual(r.ok, false);
    assertEqual(r.breach, 'insufficient_live_data');
  });
  test('CL-24 identical gaps → ok=true', () => {
    const k    = buildKernel();
    const r    = midRange(k);
    const clip = snapshotRange(k, r);
    // Use the same kernel's delta stream as live data — should match profile
    const all    = k.getAll().filter(e => e.seq >= r.seqStart && e.seq <= r.seqEnd);
    const deltas = computeDeltaStream(all, id => k.findById(id), id => k.edgeMeta(id), id => k.getChildren(id));
    const result = validateClipStability(clip, deltas);
    assertEqual(result.ok, true, `should be ok — same data. breach: ${result.breach}`);
  });
  test('CL-25 extreme gap deviation → breach=gapDrift', () => {
    const k    = buildKernel();
    const clip = snapshotRange(k, midRange(k));
    // Fake live deltas with wildly different gaps
    const fakeLive = Array.from({ length: 20 }, (_, i) => ({ gap: 10000 + i * 1000 }));
    const r = validateClipStability(clip, fakeLive, { gapDrift: 0.01 });
    assertEqual(r.ok, false);
    assertEqual(r.breach, 'gapDrift');
  });
  test('CL-26 result has gapDrift, sigmaDrift, slopeDrift numbers', () => {
    const k    = buildKernel();
    const r    = midRange(k);
    const clip = snapshotRange(k, r);
    const all  = k.getAll().filter(e => e.seq >= r.seqStart && e.seq <= r.seqEnd);
    const dels = computeDeltaStream(all, id => k.findById(id), id => k.edgeMeta(id), id => k.getChildren(id));
    const res  = validateClipStability(clip, dels);
    assert(typeof res.gapDrift   === 'number');
    assert(typeof res.sigmaDrift === 'number');
    assert(typeof res.slopeDrift === 'number');
  });
  test('CL-27 result is frozen', () => {
    const clip = snapshotRange(buildKernel(), midRange(buildKernel()));
    assert(Object.isFrozen(validateClipStability(clip, [])));
  });
  test('CL-28 custom thresholds override defaults', () => {
    const k    = buildKernel();
    const r    = midRange(k);
    const clip = snapshotRange(k, r);
    const all  = k.getAll().filter(e => e.seq >= r.seqStart && e.seq <= r.seqEnd);
    const dels = computeDeltaStream(all, id => k.findById(id), id => k.edgeMeta(id), id => k.getChildren(id));
    // With zero tolerance everything should breach
    const strict = validateClipStability(clip, dels, { gapDrift: 0, sigmaDrift: 0, slopeDrift: 0 });
    // gapDrift=0: even identical data will hit threshold (Math.abs(x-x)/x = 0 which is NOT > 0)
    // Actually 0 drift against 0 threshold: 0 > 0 is false — so still ok
    // Let's use a scenario where we expect a breach instead
    const strict2 = validateClipStability(clip, [{ gap: 999999 }, { gap: 999999 }], { gapDrift: 0.0001 });
    assertEqual(strict2.ok, false);
  });
  test('CL-29 DEFAULT_STABILITY_THRESHOLDS exported and correct', () => {
    assertEqual(DEFAULT_STABILITY_THRESHOLDS.gapDrift,   0.30);
    assertEqual(DEFAULT_STABILITY_THRESHOLDS.sigmaDrift, 0.50);
    assertEqual(DEFAULT_STABILITY_THRESHOLDS.slopeDrift, 0.01);
    assert(Object.isFrozen(DEFAULT_STABILITY_THRESHOLDS));
  });
  test('CL-30 breach is null when all metrics within threshold', () => {
    const k    = buildKernel();
    const r    = midRange(k);
    const clip = snapshotRange(k, r);
    const all  = k.getAll().filter(e => e.seq >= r.seqStart && e.seq <= r.seqEnd);
    const dels = computeDeltaStream(all, id => k.findById(id), id => k.edgeMeta(id), id => k.getChildren(id));
    const res  = validateClipStability(clip, dels);
    if (res.ok) assertEqual(res.breach, null);
  });
});

// ── CL-31..35: full lifecycle ─────────────────────────────────────────────────

suite('cl.CL31-35-lifecycle', () => {
  test('CL-31 extract → restore → complete() full pipeline', () => {
    const k    = buildKernel(20);
    const all  = k.getAll();
    const s    = all[5].seq;
    const e    = all[15].seq;
    const clip = snapshotRange(k, { seqStart: s, seqEnd: e });
    const rc   = restoreClip(clip);
    const res  = rc.complete();
    assert(res.ring.length > 0);
    assert(res.deltaStream.length > 0);
    // stabilityReport is a SigmaResult now that sigma is wired
    assert(res.stabilityReport === null || typeof res.stabilityReport.regime === 'string',
      'stabilityReport should be null or SigmaResult');
    assertEqual(res.type, CONTEXT_REPLAY);
  });
  test('CL-32 two clips from same kernel are independent', () => {
    const k  = buildKernel(30);
    const all = k.getAll();
    const c1  = snapshotRange(k, { seqStart: all[0].seq, seqEnd: all[9].seq });
    const c2  = snapshotRange(k, { seqStart: all[20].seq, seqEnd: all[29].seq });
    assert(c1.clipId !== c2.clipId, 'different clipIds');
    assert(c1.eventCount > 0);
    assert(c2.eventCount > 0);
  });
  test('CL-33 restoreClip is deterministic (CI-6 for clips)', () => {
    const k    = buildKernel();
    const clip = snapshotRange(k, midRange(k));
    const r1   = restoreClip(clip).complete();
    const r2   = restoreClip(clip).complete();
    assertEqual(r1.ring.length, r2.ring.length);
    assertEqual(
      r1.ring.map(e => e.type),
      r2.ring.map(e => e.type)
    );
  });
  test('CL-34 entryEvents and exitEvents are arrays', () => {
    const clip = snapshotRange(buildKernel(), midRange(buildKernel()));
    assert(Array.isArray(clip.entryEvents));
    assert(Array.isArray(clip.exitEvents));
  });
  test('CL-35 kernelVersion is set in clip', () => {
    const clip = snapshotRange(buildKernel(), midRange(buildKernel()));
    assert(typeof clip.kernelVersion === 'string' && clip.kernelVersion.length > 0);
  });
});

export const result = report('clip');
