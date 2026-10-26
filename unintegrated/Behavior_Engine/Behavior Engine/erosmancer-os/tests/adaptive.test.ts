// ============================================================
// ErosmancerOS — AdaptiveLayer Tests
//
// PatternMemory: record(), get(), bestVariant(), topPatterns(),
//   snapshot(), ring-buffer eviction, dirty flag, deduplication
//
// StrategyOptimizer: recommend(), learn(), entropy tuning,
//   profile escalation, confidence computation
//
// No mocks. No network. Pure logic.
// ============================================================

import assert from "assert";
import { PatternMemory, StrategyOptimizer } from "../src/adaptive/index.ts";
import type { PatternKey } from "../src/adaptive/index.ts";

// ─── Test runner ─────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve()
    .then(() => fn())
    .then(() => { console.log(`\x1b[32m✓\x1b[0m ${name}`); passed++; })
    .catch((err: Error) => {
      console.log(`\x1b[31m✗\x1b[0m ${name}`);
      console.log(`   ${err.message}`);
      failed++;
    });
}

// ─── Helpers ─────────────────────────────────────────────────

function makeMemory(opts = {}) {
  return new PatternMemory({ maxKeys: 200, maxSamplesPerKey: 20, ...opts });
}

function makeKey(overrides: Partial<PatternKey> = {}): PatternKey {
  return {
    action:  "click",
    profile: "precise",
    variant: "direct",
    ...overrides,
  };
}

function recordMany(
  mem:     PatternMemory,
  key:     PatternKey,
  count:   number,
  success: boolean,
  durationMs = 120
): void {
  for (let i = 0; i < count; i++) {
    mem.record(key, success, durationMs, `sess-${i}`);
  }
}

// ════════════════════════════════════════════════════════════
// PatternMemory
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── PatternMemory ──\x1b[0m");

test("record() creates a new pattern entry", () => {
  const mem = makeMemory();
  const key = makeKey();
  mem.record(key, true, 100, "sess-1");

  const rec = mem.get(key);
  assert.ok(rec, "Record should exist after first record()");
  assert.strictEqual(rec!.samples.length, 1);
  assert.strictEqual(rec!.samples[0].success, true);
  assert.strictEqual(rec!.samples[0].durationMs, 100);
});

test("record() updates successRate correctly", () => {
  const mem = makeMemory();
  const key = makeKey();

  recordMany(mem, key, 7, true);
  recordMany(mem, key, 3, false);

  const rec = mem.get(key);
  assert.ok(rec, "Record must exist");
  assert.ok(
    Math.abs(rec!.successRate - 0.7) < 0.001,
    `Expected successRate ≈ 0.7, got ${rec!.successRate}`
  );
});

test("record() updates avgDurationMs correctly", () => {
  const mem = makeMemory();
  const key = makeKey();
  mem.record(key, true, 100, "s1");
  mem.record(key, true, 200, "s2");

  const rec = mem.get(key);
  assert.ok(Math.abs(rec!.avgDurationMs - 150) < 1, `Expected 150ms avg, got ${rec!.avgDurationMs}`);
});

test("record() ring-buffer evicts oldest when maxSamplesPerKey exceeded", () => {
  const mem = makeMemory({ maxSamplesPerKey: 5 });
  const key = makeKey();

  for (let i = 0; i < 8; i++) {
    mem.record(key, i % 2 === 0, i * 10, `s${i}`);
  }

  const rec = mem.get(key);
  assert.strictEqual(rec!.samples.length, 5, `Expected exactly 5 samples, got ${rec!.samples.length}`);
  // Most recent sample should be the last one recorded (i=7, durationMs=70)
  assert.strictEqual(rec!.samples[rec!.samples.length - 1].durationMs, 70);
});

test("get() returns undefined for unrecorded key", () => {
  const mem = makeMemory();
  const result = mem.get(makeKey({ action: "scroll" }));
  assert.strictEqual(result, undefined);
});

test("different keys are stored independently", () => {
  const mem  = makeMemory();
  const kA   = makeKey({ action: "click" });
  const kB   = makeKey({ action: "type" });

  recordMany(mem, kA, 10, true);
  recordMany(mem, kB, 3, false);

  const rA = mem.get(kA)!;
  const rB = mem.get(kB)!;

  assert.ok(rA.successRate > 0.9, "click pattern should be high-success");
  assert.strictEqual(rB.successRate, 0, "type pattern should be all-fail");
});

test("elementTag is part of key discrimination", () => {
  const mem   = makeMemory();
  const kBtn  = makeKey({ elementTag: "button" });
  const kInp  = makeKey({ elementTag: "input" });

  recordMany(mem, kBtn, 10, true);
  recordMany(mem, kInp, 10, false);

  assert.ok(mem.get(kBtn)!.successRate > 0.9, "button pattern correct");
  assert.strictEqual(mem.get(kInp)!.successRate, 0, "input pattern correct");
  assert.notStrictEqual(
    mem.get(kBtn)!.key,
    mem.get(kInp)!.key,
    "Keys should differ by elementTag"
  );
});

test("bestVariant() returns null with < minSamples", () => {
  const mem = makeMemory();
  recordMany(mem, makeKey({ variant: "hover" }), 4, true); // needs 5 min
  const best = mem.bestVariant("click", "precise");
  assert.strictEqual(best, null, "Should return null below minSamples threshold");
});

test("bestVariant() returns highest-success variant", () => {
  const mem = makeMemory();

  // direct: 60% success
  recordMany(mem, makeKey({ variant: "direct" }), 6, true);
  recordMany(mem, makeKey({ variant: "direct" }), 4, false);

  // hover: 90% success
  recordMany(mem, makeKey({ variant: "hover" }), 9, true);
  recordMany(mem, makeKey({ variant: "hover" }), 1, false);

  // stepwise: 40% success
  recordMany(mem, makeKey({ variant: "stepwise" }), 4, true);
  recordMany(mem, makeKey({ variant: "stepwise" }), 6, false);

  const best = mem.bestVariant("click", "precise");
  assert.strictEqual(best, "hover", `Expected 'hover' to win, got '${best}'`);
});

test("bestVariant() respects elementTag filter", () => {
  const mem = makeMemory();

  // button: hover wins
  recordMany(mem, makeKey({ variant: "hover",  elementTag: "button" }), 9, true);
  recordMany(mem, makeKey({ variant: "direct", elementTag: "button" }), 5, false);

  // input: direct wins
  recordMany(mem, makeKey({ variant: "direct", elementTag: "input" }), 9, true);
  recordMany(mem, makeKey({ variant: "hover",  elementTag: "input" }), 5, false);

  const bestBtn = mem.bestVariant("click", "precise", "button");
  const bestInp = mem.bestVariant("click", "precise", "input");

  assert.strictEqual(bestBtn, "hover",  `button best should be hover, got ${bestBtn}`);
  assert.strictEqual(bestInp, "direct", `input best should be direct, got ${bestInp}`);
});

test("topPatterns() requires minSamples=3 and sorts by successRate", () => {
  const mem = makeMemory();

  // 2 samples — should be excluded (< 3)
  recordMany(mem, makeKey({ variant: "miss" }), 2, true);

  // 5 samples each, different rates
  recordMany(mem, makeKey({ variant: "direct"   }), 5, false);            // 0%
  recordMany(mem, makeKey({ variant: "hover"    }), 3, true);             // 60%? varies
  recordMany(mem, makeKey({ variant: "stepwise" }), 5, true);             // 100%

  const top = mem.topPatterns("precise", 10);
  assert.ok(top.length >= 2, `Expected ≥2 patterns, got ${top.length}`);
  // First entry must have highest success rate
  assert.ok(
    top[0].successRate >= top[1].successRate,
    `topPatterns should be sorted desc: ${top[0].successRate} >= ${top[1].successRate}`
  );
  // miss (2 samples) must not appear
  const hasMiss = top.some(r => r.key.includes("miss"));
  assert.ok(!hasMiss, "Patterns with < 3 samples should be excluded from topPatterns");
});

test("topPatterns() respects profile filter", () => {
  const mem = makeMemory();
  recordMany(mem, makeKey({ profile: "precise",     variant: "direct" }), 5, true);
  recordMany(mem, makeKey({ profile: "exploratory", variant: "hover"  }), 5, true);

  const preciseTop     = mem.topPatterns("precise");
  const exploratoryTop = mem.topPatterns("exploratory");

  assert.ok(preciseTop.every(r => r.key.includes("precise")),
    "precise topPatterns should only include precise profile entries");
  assert.ok(exploratoryTop.every(r => r.key.includes("exploratory")),
    "exploratory topPatterns should only include exploratory profile entries");
});

test("snapshot() reflects recorded state", () => {
  const mem = makeMemory();
  recordMany(mem, makeKey({ variant: "direct" }), 5, true);
  recordMany(mem, makeKey({ variant: "hover"  }), 3, false);

  const snap = mem.snapshot();
  assert.strictEqual(snap.totalKeys,    2, `Expected 2 keys, got ${snap.totalKeys}`);
  assert.strictEqual(snap.totalSamples, 8, `Expected 8 samples, got ${snap.totalSamples}`);
  assert.strictEqual(snap.dirty,        true, "Should be dirty after records");
});

test("snapshot() totalKeys stays 0 before any records", () => {
  const mem  = makeMemory();
  const snap = mem.snapshot();
  assert.strictEqual(snap.totalKeys, 0);
  assert.strictEqual(snap.totalSamples, 0);
  assert.strictEqual(snap.dirty, false);
});

test("maxKeys evicts oldest when exceeded", () => {
  const mem = makeMemory({ maxKeys: 3 });

  recordMany(mem, makeKey({ action: "click",    variant: "direct" }), 5, true);
  recordMany(mem, makeKey({ action: "type",     variant: "direct" }), 5, true);
  recordMany(mem, makeKey({ action: "scroll",   variant: "scroll" }), 5, true);
  recordMany(mem, makeKey({ action: "hover",    variant: "hover"  }), 5, true); // triggers evict

  const snap = mem.snapshot();
  assert.ok(snap.totalKeys <= 3, `Expected ≤3 keys after eviction, got ${snap.totalKeys}`);
});

test("pattern:recorded event fires with key and success", () => {
  const mem    = makeMemory();
  const events: Array<{ key: string; success: boolean }> = [];
  mem.on("pattern:recorded", (key, success) => events.push({ key, success }));

  mem.record(makeKey(), true, 100, "s1");
  mem.record(makeKey(), false, 200, "s2");

  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].success, true);
  assert.strictEqual(events[1].success, false);
});

// ════════════════════════════════════════════════════════════
// StrategyOptimizer
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── StrategyOptimizer ──\x1b[0m");

test("recommend() returns valid OptimizationRecommendation shape", () => {
  const mem  = makeMemory();
  const opt  = new StrategyOptimizer(mem);

  const rec = opt.recommend({
    action:       "click",
    sessionId:    "sess-01",
    profile:      "precise",
    recentErrors: 0.0,
    detectionRisk: 0.0,
  });

  assert.ok(rec,                           "Must return a recommendation");
  assert.ok(rec.profile,                   "Must have profile");
  assert.ok(typeof rec.entropyAdjust === "number", "entropyAdjust must be number");
  assert.ok(rec.confidence >= 0 && rec.confidence <= 1, `confidence out of range: ${rec.confidence}`);
  assert.ok(typeof rec.reason === "string" && rec.reason.length > 0, "reason must be non-empty string");
});

test("recommend() with no data returns insufficient-data reason", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  const rec = opt.recommend({
    action: "click", sessionId: "s1", profile: "precise",
    recentErrors: 0, detectionRisk: 0,
  });

  assert.ok(
    rec.reason.includes("insufficient") || rec.confidence <= 0.35,
    `No data should produce low confidence, got: reason='${rec.reason}' confidence=${rec.confidence}`
  );
});

test("recommend() returns best variant when sufficient data exists", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  // hover wins overwhelmingly
  recordMany(mem, makeKey({ variant: "hover"  }), 10, true,  80);
  recordMany(mem, makeKey({ variant: "direct" }), 10, false, 120);

  const rec = opt.recommend({
    action: "click", sessionId: "s1", profile: "precise",
    recentErrors: 0, detectionRisk: 0,
  });

  assert.strictEqual(
    rec.variant, "hover",
    `Expected hover from pattern memory, got '${rec.variant}'`
  );
});

test("recommend() escalates to exploratory on high detectionRisk", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  const rec = opt.recommend({
    action: "click", sessionId: "s1", profile: "precise",
    recentErrors: 0, detectionRisk: 0.9,
  });

  assert.strictEqual(
    rec.profile, "exploratory",
    `High detection risk should recommend exploratory, got '${rec.profile}'`
  );
});

test("recommend() escalates to cautious on high error rate with precise profile", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  const rec = opt.recommend({
    action: "click", sessionId: "s1", profile: "precise",
    recentErrors: 0.45, detectionRisk: 0.0,
  });

  assert.strictEqual(
    rec.profile, "cautious",
    `High error rate + precise should recommend cautious, got '${rec.profile}'`
  );
});

test("recommend() de-escalates cautious → precise when conditions clear", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  const rec = opt.recommend({
    action: "click", sessionId: "s1", profile: "cautious",
    recentErrors: 0.01, detectionRisk: 0.05,
  });

  assert.strictEqual(
    rec.profile, "precise",
    `Clean conditions + cautious should recommend precise, got '${rec.profile}'`
  );
});

test("entropy starts at 1.0 for new session", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);
  assert.strictEqual(opt.entropy("brand-new-session"), 1.0);
});

test("entropy increases on high error rate", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  opt.recommend({
    action: "click", sessionId: "sess-err", profile: "precise",
    recentErrors: 0.6, detectionRisk: 0.0,
  });

  assert.ok(opt.entropy("sess-err") > 1.0,
    `Entropy should exceed 1.0 after high error rate, got ${opt.entropy("sess-err")}`
  );
});

test("entropy decreases on smooth sailing", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  // Start entropy elevated
  opt.recommend({ action: "click", sessionId: "sess-ok", profile: "precise", recentErrors: 0.6, detectionRisk: 0.0 });
  const elevated = opt.entropy("sess-ok");

  // Then conditions normalize — multiple smooth calls
  for (let i = 0; i < 5; i++) {
    opt.recommend({ action: "click", sessionId: "sess-ok", profile: "precise", recentErrors: 0.0, detectionRisk: 0.0 });
  }

  assert.ok(opt.entropy("sess-ok") < elevated,
    `Entropy should decrease after smooth conditions. Before=${elevated} After=${opt.entropy("sess-ok")}`
  );
});

test("entropy:tuned event fires on entropy change", () => {
  const mem    = makeMemory();
  const opt    = new StrategyOptimizer(mem);
  const events: string[] = [];
  opt.on("entropy:tuned", (action) => events.push(action));

  opt.recommend({
    action: "click", sessionId: "s-tune", profile: "precise",
    recentErrors: 0.8, detectionRisk: 0.0,
  });

  assert.ok(events.length >= 1, "entropy:tuned should fire on entropy change");
  assert.strictEqual(events[0], "click");
});

test("resetEntropy resets to 1.0", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  opt.recommend({ action: "click", sessionId: "s-reset", profile: "precise", recentErrors: 0.7, detectionRisk: 0 });
  assert.ok(opt.entropy("s-reset") !== 1.0, "Entropy should have changed");

  opt.resetEntropy("s-reset");
  assert.strictEqual(opt.entropy("s-reset"), 1.0, "After reset, entropy should be 1.0");
});

test("learn() writes into pattern memory via optimizer", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  opt.learn({
    action: "click", sessionId: "s1", profile: "precise", variant: "hover",
    elementTag: "button", success: true, durationMs: 90,
  });

  const rec = mem.get(makeKey({ variant: "hover", elementTag: "button" }));
  assert.ok(rec, "PatternMemory should have the learned entry");
  assert.strictEqual(rec!.samples.length, 1);
  assert.strictEqual(rec!.samples[0].success, true);
});

test("recommendation event fires with correct shape", () => {
  const mem  = makeMemory();
  const opt  = new StrategyOptimizer(mem);
  let   fired = false;
  opt.on("recommendation", (rec) => {
    assert.ok(rec.profile,                    "rec.profile required");
    assert.ok(typeof rec.confidence === "number", "confidence must be number");
    fired = true;
  });

  opt.recommend({ action: "click", sessionId: "s1", profile: "precise", recentErrors: 0, detectionRisk: 0 });
  assert.ok(fired, "recommendation event must fire");
});

test("learn() + recommend() cycle: more data → higher confidence", () => {
  const mem = makeMemory();
  const opt = new StrategyOptimizer(mem);

  // Recommend with no data
  const rec0 = opt.recommend({ action: "click", sessionId: "s1", profile: "precise", recentErrors: 0, detectionRisk: 0 });

  // Feed 20 successes
  for (let i = 0; i < 20; i++) {
    opt.learn({ action: "click", sessionId: `s${i}`, profile: "precise", variant: "hover", success: true, durationMs: 100 });
  }

  // Recommend again
  const rec1 = opt.recommend({ action: "click", sessionId: "s1", profile: "precise", recentErrors: 0, detectionRisk: 0 });

  assert.ok(rec1.confidence >= rec0.confidence,
    `Confidence should be ≥ with more data. Before=${rec0.confidence.toFixed(3)} After=${rec1.confidence.toFixed(3)}`
  );
});

// ─── Results ──────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n\x1b[36m── AdaptiveLayer: ${passed} passed / ${failed} failed ──\x1b[0m\n`);
  if (failed > 0) process.exit(1);
}, 200);
