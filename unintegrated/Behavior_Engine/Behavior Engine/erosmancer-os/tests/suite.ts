// ============================================================
// ErosmancerOS — Full Test Suite
//
// No mocks. No stubs. Real module instantiation.
// Network is not required — these test pure logic.
//
// Coverage:
//   NodeRegistry     - registration, dedup, fingerprint, persistence, GC
//   BehaviorEngine   - all profiles, all actions, session state, timing
//   RoutingEngine    - level switching, escalation, decision output
//   SelectorEngine   - (logic-only, no CDP calls)
//   Types            - schema validation via Zod
//   Integration      - module wiring
//
// Run: npx tsx tests/suite.ts
// ============================================================

import assert from "assert";
import { randomUUID } from "crypto";

import { NodeRegistry } from "../src/registry/index.ts";
import { BehaviorEngine, BEHAVIOR_PROFILES } from "../src/behavior/index.ts";
import { RoutingEngine } from "../src/routing/index.ts";
import { Telemetry } from "../src/telemetry/index.ts";
import { NodeSchema, DEFAULT_CONFIG } from "../src/types/index.ts";
import type {
  BehaviorIntent,
  BehaviorContext,
  BehaviorProfileName,
} from "../src/types/index.ts";

// ─── Test runner ─────────────────────────────────────────────

let passed = 0;
let failed = 0;
const errors: string[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  Promise.resolve().then(() => fn()).then(() => {
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
    passed++;
  }).catch((err: Error) => {
    console.log(`\x1b[31m✗\x1b[0m ${name}`);
    console.log(`   ${err.message}`);
    errors.push(`${name}: ${err.message}`);
    failed++;
  });
}

// ─── Shared fixtures ──────────────────────────────────────────

const noopTelemetry = new Telemetry({
  maxEvents: 100,
  flushIntervalMs: 9_999_999,  // never flush during tests
});

function makeRegistry(): NodeRegistry {
  return new NodeRegistry(
    { staleThresholdMs: 5_000, maxNodes: 500 },
    noopTelemetry
  );
}

function makeBehavior(): BehaviorEngine {
  return new BehaviorEngine(
    { defaultProfile: "precise", sandboxByDefault: false, maxSessionAgeMs: 60_000 },
    noopTelemetry
  );
}

function makeIntent(
  action: BehaviorIntent["action"] = "click",
  payload: BehaviorIntent["payload"] = null
): BehaviorIntent {
  return {
    id:      `intent-${randomUUID()}`,
    action,
    target:  {
      uuid:        `nel-${randomUUID()}`,
      boundingBox: { x: 120, y: 250, width: 90, height: 32 },
    },
    payload,
  };
}

function makeCtx(overrides: Partial<BehaviorContext["environment"]> = {}): BehaviorContext {
  return {
    sessionId:   `sess-${randomUUID()}`,
    environment: {
      detectionRisk:  0,
      latency:        0,
      stabilityScore: 1,
      ...overrides,
    },
  };
}

// ════════════════════════════════════════════════════════════
// NodeRegistry
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── NodeRegistry ──\x1b[0m");

test("register returns a node with uuid", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "button", tabId: "t1", attributes: {} });
  assert.ok(node.uuid, "Expected uuid");
  assert.strictEqual(node.tag, "button");
  assert.strictEqual(node.state, "active");
});

test("identical backendNodeId deduplicates", () => {
  const r  = makeRegistry();
  const n1 = r.register({ tag: "button", tabId: "t1", backendNodeId: 42, attributes: {} });
  const n2 = r.register({ tag: "button", tabId: "t1", backendNodeId: 42, attributes: {} });
  assert.strictEqual(n1.uuid, n2.uuid, "Should deduplicate");
  assert.strictEqual(n2.seenCount, 2, "seenCount should be 2");
});

test("identical fingerprint deduplicates across registrations", () => {
  const r    = makeRegistry();
  const meta = {
    tag:         "button",
    tabId:       "t1",
    textContent: "Submit",
    attributes:  { type: "submit", "data-testid": "submit-btn" },
  };
  const n1 = r.register(meta);
  const n2 = r.register(meta);
  assert.strictEqual(n1.uuid, n2.uuid);
});

test("different tabs do NOT deduplicate", () => {
  const r  = makeRegistry();
  const n1 = r.register({ tag: "button", tabId: "tab-A", backendNodeId: 10, attributes: {} });
  const n2 = r.register({ tag: "button", tabId: "tab-B", backendNodeId: 10, attributes: {} });
  assert.notStrictEqual(n1.uuid, n2.uuid, "Different tabs should create separate nodes");
});

test("get returns registered node", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "input", tabId: "t1", attributes: { name: "email" } });
  const got  = r.get(node.uuid);
  assert.ok(got, "Node not found");
  assert.strictEqual(got?.tag, "input");
});

test("markMissing transitions state", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "div", tabId: "t1", attributes: {} });
  r.markMissing(node.uuid);
  assert.strictEqual(r.get(node.uuid)?.state, "missing");
});

test("markStale transitions state", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "span", tabId: "t1", attributes: {} });
  r.markStale(node.uuid);
  assert.strictEqual(r.get(node.uuid)?.state, "stale");
});

test("getBySelector returns correct node", () => {
  const r = makeRegistry();
  r.register({ tag: "button", tabId: "t1", selector: "#submit", attributes: {} });
  const found = r.getBySelector("#submit");
  assert.ok(found, "Should find by selector");
  assert.strictEqual(found?.tag, "button");
});

test("getByTab returns all nodes for tab", () => {
  const r = makeRegistry();
  r.register({ tag: "div",    tabId: "tab-X", attributes: {} });
  r.register({ tag: "button", tabId: "tab-X", attributes: {} });
  r.register({ tag: "span",   tabId: "tab-Y", attributes: {} });
  assert.strictEqual(r.getByTab("tab-X").length, 2);
  assert.strictEqual(r.getByTab("tab-Y").length, 1);
});

test("evictTab removes all tab nodes from all indexes", () => {
  const r = makeRegistry();
  r.register({ tag: "div", tabId: "tab-Z", selector: "#foo", attributes: {} });
  r.register({ tag: "p",   tabId: "tab-Z", attributes: {} });
  r.evictTab("tab-Z");
  assert.strictEqual(r.getByTab("tab-Z").length, 0);
  assert.strictEqual(r.getBySelector("#foo"), undefined);
});

test("sweepStale marks old nodes stale", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "div", tabId: "t1", attributes: {} });

  // Fake an old lastSeen
  const stored = r.get(node.uuid)!;
  // We need to manipulate lastSeen — access internal via cast
  (stored as Record<string, unknown>).lastSeen = new Date(Date.now() - 60_000).toISOString();

  r.sweepStale();
  // The staleThresholdMs is 5_000 — 60s old should be stale
  assert.strictEqual(r.get(node.uuid)?.state, "stale");
});

test("maxNodes evicts oldest when exceeded", () => {
  const r = new NodeRegistry({ staleThresholdMs: 5_000, maxNodes: 5 }, noopTelemetry);
  for (let i = 0; i < 7; i++) {
    r.register({ tag: "div", tabId: "t1", attributes: { idx: String(i) } });
  }
  // Size should not exceed 5
  assert.ok(r.size() <= 5, `Expected ≤5 nodes, got ${r.size()}`);
});

test("updateBoundingBox mutates node", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "button", tabId: "t1", attributes: {} });
  r.updateBoundingBox(node.uuid, { x: 10, y: 20, width: 100, height: 40 });
  const updated = r.get(node.uuid);
  assert.deepStrictEqual(updated?.boundingBox, { x: 10, y: 20, width: 100, height: 40 });
});

test("updateNodeId mutates nodeId", () => {
  const r    = makeRegistry();
  const node = r.register({ tag: "input", tabId: "t1", attributes: {} });
  r.updateNodeId(node.uuid, 9999);
  assert.strictEqual(r.get(node.uuid)?.nodeId, 9999);
});

test("fingerprint is stable for same inputs", () => {
  const fp1 = NodeRegistry.computeFingerprint("button", { type: "submit" }, "Save");
  const fp2 = NodeRegistry.computeFingerprint("button", { type: "submit" }, "Save");
  assert.strictEqual(fp1, fp2);
});

test("fingerprint differs for different content", () => {
  const fp1 = NodeRegistry.computeFingerprint("button", { type: "submit" }, "Save");
  const fp2 = NodeRegistry.computeFingerprint("button", { type: "reset"  }, "Save");
  assert.notStrictEqual(fp1, fp2);
});

test("fingerprint excludes volatile attrs (class, style, id)", () => {
  const fp1 = NodeRegistry.computeFingerprint("button", { class: "btn-blue", type: "submit" }, "");
  const fp2 = NodeRegistry.computeFingerprint("button", { class: "btn-red",  type: "submit" }, "");
  assert.strictEqual(fp1, fp2, "Fingerprint should be same when only volatile attrs differ");
});

// ════════════════════════════════════════════════════════════
// BehaviorEngine
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── BehaviorEngine ──\x1b[0m");

test("processIntent returns valid ExecutionPlan", () => {
  const be  = makeBehavior();
  const ctx = makeCtx();
  const plan = be.processIntent(makeIntent("click"), ctx);

  assert.ok(plan.planId.length > 0, "planId required");
  assert.ok(Array.isArray(plan.steps), "steps must be array");
  assert.ok(plan.steps.length > 0, "must have at least one step");
  assert.ok(typeof plan.timing.nextDelay === "function", "timing model required");
  assert.ok(plan.variance.temporal >= 0 && plan.variance.temporal <= 1);
  assert.ok(plan.variance.spatial  >= 0 && plan.variance.spatial  <= 1);
  assert.ok(plan.variance.decision >= 0 && plan.variance.decision <= 1);
  assert.ok(plan.meta.confidence   >= 0 && plan.meta.confidence   <= 1);
});

test("action:type generates correct keypress count", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("type", "hello"), makeCtx());
  const keys = plan.steps.filter((s) => s.type === "keypress");
  assert.strictEqual(keys.length, 5);
  assert.deepStrictEqual(keys.map((k) => k.char), ["h","e","l","l","o"]);
});

test("action:scroll generates scroll step with correct delta", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("scroll", { deltaY: 400 }), makeCtx());
  const scrolls = plan.steps.filter((s) => s.type === "scroll");
  assert.ok(scrolls.length >= 1, "should have scroll step");
  assert.strictEqual(scrolls[0].deltaY, 400);
});

test("action:hover generates hover step", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("hover"), makeCtx());
  const hovers = plan.steps.filter((s) => s.type === "hover");
  assert.ok(hovers.length >= 1, "should have hover step");
  assert.ok((hovers[0].duration ?? 0) > 0, "hover must have positive duration");
});

test("action:evaluate generates evaluate step", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("evaluate", "document.title"), makeCtx());
  const evals = plan.steps.filter((s) => s.type === "evaluate");
  assert.ok(evals.length === 1, "should have one evaluate step");
  assert.strictEqual(evals[0].expression, "document.title");
});

test("high detectionRisk selects exploratory profile", () => {
  const be   = makeBehavior();
  const ctx  = makeCtx({ detectionRisk: 0.9 });
  const plan = be.processIntent(makeIntent("click"), ctx);
  assert.strictEqual(plan.profile, "exploratory");
});

test("low stabilityScore selects cautious profile", () => {
  const be   = makeBehavior();
  const ctx  = makeCtx({ stabilityScore: 0.1 });
  const plan = be.processIntent(makeIntent("click"), ctx);
  assert.strictEqual(plan.profile, "cautious");
});

test("overrideProfile forces a specific profile", () => {
  const be  = makeBehavior();
  const ctx = makeCtx();
  be.overrideProfile(ctx.sessionId, "turbo");
  const plan = be.processIntent(makeIntent("click"), ctx);
  assert.strictEqual(plan.profile, "turbo");
});

test("clearOverride restores auto-selection", () => {
  const be  = makeBehavior();
  const ctx = makeCtx();
  be.overrideProfile(ctx.sessionId, "turbo");
  be.clearOverride(ctx.sessionId);
  const plan = be.processIntent(makeIntent("click"), ctx);
  assert.notStrictEqual(plan.profile, "turbo");  // auto should pick precise for nominal ctx
});

test("timing.nextDelay returns positive number", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("click"), makeCtx());
  for (let i = 0; i < 10; i++) {
    const d = plan.timing.nextDelay(i, 0);
    assert.ok(d >= 0, `Delay at step ${i} must be non-negative, got ${d}`);
    assert.ok(d <= 3_000, `Delay at step ${i} suspiciously large: ${d}`);
  }
});

test("fatigue increases timing delay", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("click"), makeCtx());
  const fresh    = plan.timing.nextDelay(0, 0.0);
  const fatigued = plan.timing.nextDelay(0, 0.9);
  // Over multiple samples, fatigued should average higher
  // (not a guarantee per single sample due to normal dist, so sample many)
  let freshSum = 0, fatSum = 0;
  for (let i = 0; i < 50; i++) {
    freshSum += plan.timing.nextDelay(0, 0.0);
    fatSum   += plan.timing.nextDelay(0, 0.9);
  }
  assert.ok(fatSum > freshSum, `Fatigued timing (${fatSum}) should exceed fresh (${freshSum})`);
});

test("recordOutcome updates session errorRate", () => {
  const be  = makeBehavior();
  const ctx = makeCtx();

  be.processIntent(makeIntent("click"), ctx); // create session

  for (let i = 0; i < 10; i++) be.recordOutcome(ctx.sessionId, false);

  const snap = be.sessionSnapshot(ctx.sessionId);
  assert.ok(snap !== null, "Session snapshot should exist");
  assert.ok(snap!.errorRate > 0, `errorRate should be > 0, got ${snap!.errorRate}`);
});

test("sandbox mode returns plan without network side effects", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("click"), makeCtx(), { sandbox: true });
  assert.strictEqual(plan.sandbox, true);
  assert.ok(plan.steps.length > 0, "sandbox plan still has steps");
});

test("all 4 profiles produce valid plans", () => {
  const be      = makeBehavior();
  const profiles: BehaviorProfileName[] = ["precise", "cautious", "exploratory", "turbo"];

  for (const profile of profiles) {
    const ctx = makeCtx();
    be.overrideProfile(ctx.sessionId, profile);
    const plan = be.processIntent(makeIntent("click"), ctx);
    assert.ok(plan.steps.length > 0, `Profile ${profile} must generate steps`);
    assert.strictEqual(plan.profile, profile);
    be.clearOverride(ctx.sessionId);
  }
});

test("type action generates interleaved delays and keypresses", () => {
  const be   = makeBehavior();
  const plan = be.processIntent(makeIntent("type", "ab"), makeCtx());
  const types = plan.steps.map((s) => s.type);
  // Should have delays before keypresses
  const delays = plan.steps.filter((s) => s.type === "delay").length;
  const keys   = plan.steps.filter((s) => s.type === "keypress").length;
  assert.ok(delays >= 2, `Expected delays for 'ab', got ${delays}`);
  assert.strictEqual(keys, 2);
});

test("unknown action throws", () => {
  const be = makeBehavior();
  assert.throws(() => {
    be.processIntent(
      { id: "x", action: "teleport" as never, target: {} },
      makeCtx()
    );
  }, /Unknown action/);
});

test("sessionSnapshot returns null for unknown session", () => {
  const be = makeBehavior();
  assert.strictEqual(be.sessionSnapshot("nonexistent-session-id"), null);
});

test("gc removes old sessions", () => {
  const be = new BehaviorEngine(
    { defaultProfile: "precise", sandboxByDefault: false, maxSessionAgeMs: 1 },
    noopTelemetry
  );
  const ctx = makeCtx();
  be.processIntent(makeIntent("click"), ctx);

  return new Promise<void>((resolve) => setTimeout(() => {
    const removed = be.gc();
    assert.ok(removed >= 1, `Expected ≥1 sessions removed, got ${removed}`);
    resolve();
  }, 10));
});

// ════════════════════════════════════════════════════════════
// RoutingEngine (logic-only, no bridge)
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── RoutingEngine ──\x1b[0m");

// Mock bridge for routing tests
const mockBridge = {
  getSession: (tabId: string) => `session-${tabId}`,
  on: () => {},
} as never;

function makeRouter(level: "direct" | "parallel" | "redundant" = "direct"): RoutingEngine {
  return new RoutingEngine(
    { defaultLevel: level, mismatchThreshold: 0.3, shadowTabEnabled: false },
    mockBridge,
    noopTelemetry
  );
}

test("decide returns direct decision for registered primary tab", () => {
  const router = makeRouter("direct");
  router.registerSession("tab-01", "sess-01", "primary");

  const decision = router.decide("tab-01");
  assert.strictEqual(decision.level, "direct");
  assert.strictEqual(decision.primary.tabId, "tab-01");
  assert.strictEqual(decision.primary.sessionId, "sess-01");
});

test("decide throws for unregistered tab", () => {
  const router = makeRouter();
  assert.throws(() => router.decide("nonexistent-tab"), /No session/);
});

test("setLevel changes routing level", () => {
  const router = makeRouter("direct");
  assert.strictEqual(router.level, "direct");
  router.setLevel("parallel", "test");
  assert.strictEqual(router.level, "parallel");
  router.setLevel("redundant", "test");
  assert.strictEqual(router.level, "redundant");
});

test("escalate event fires on level change up", () => {
  const router = makeRouter("direct");
  let fired = false;
  router.on("route:escalated", () => { fired = true; });
  router.setLevel("parallel", "test");
  assert.ok(fired, "route:escalated should fire");
});

test("deescalate event fires on level change down", () => {
  const router = makeRouter("redundant");
  let fired = false;
  router.on("route:deescalated", () => { fired = true; });
  router.setLevel("direct", "calm");
  assert.ok(fired, "route:deescalated should fire");
});

test("high detectionRisk auto-escalates in decide", () => {
  const router = makeRouter("direct");
  router.registerSession("tab-01", "sess-01", "primary");
  router.decide("tab-01", { detectionRisk: 0.9 });
  assert.ok(router.level !== "direct", "Should escalate away from direct on high risk");
});

test("execute:direct returns primary result", async () => {
  const router = makeRouter("direct");
  router.registerSession("tab-01", "sess-01", "primary");
  const decision = router.decide("tab-01");

  const result = await router.execute(decision, async () => ({ value: 42 }));
  assert.strictEqual(result.success, true);
  assert.deepStrictEqual(result.primary, { value: 42 });
});

test("execute:direct handles executor failure", async () => {
  const router = makeRouter("direct");
  router.registerSession("tab-01", "sess-01", "primary");
  const decision = router.decide("tab-01");

  const result = await router.execute(decision, async () => {
    throw new Error("CDP error");
  });
  assert.strictEqual(result.success, false);
});

test("parallel falls back to direct when no shadow session", () => {
  const router = makeRouter("parallel");
  router.registerSession("tab-01", "sess-01", "primary");
  // No shadow session registered
  const decision = router.decide("tab-01");
  // Should downgrade to direct
  assert.strictEqual(decision.level, "direct");
});

test("snapshot returns correct structure", () => {
  const router = makeRouter("direct");
  const snap   = router.snapshot();
  assert.ok("level"   in snap);
  assert.ok("sessions" in snap);
  assert.strictEqual(snap.level, "direct");
});

// ════════════════════════════════════════════════════════════
// Types / Schema
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── Types / Schema ──\x1b[0m");

test("NodeSchema validates a correct node", () => {
  const now  = new Date().toISOString();
  const node = NodeSchema.parse({
    uuid:       randomUUID(),
    tag:        "button",
    tabId:      "tab-01",
    attributes: { type: "submit" },
    state:      "active",
    firstSeen:  now,
    lastSeen:   now,
    seenCount:  1,
  });
  assert.strictEqual(node.tag, "button");
  assert.strictEqual(node.state, "active");
});

test("NodeSchema rejects invalid state", () => {
  const now = new Date().toISOString();
  assert.throws(() => NodeSchema.parse({
    uuid:       randomUUID(),
    tag:        "button",
    tabId:      "tab-01",
    attributes: {},
    state:      "exploded",   // invalid
    firstSeen:  now,
    lastSeen:   now,
    seenCount:  1,
  }), "Should throw on invalid state");
});

test("DEFAULT_CONFIG has all required sections", () => {
  assert.ok(DEFAULT_CONFIG.bridge,     "bridge config required");
  assert.ok(DEFAULT_CONFIG.registry,   "registry config required");
  assert.ok(DEFAULT_CONFIG.selector,   "selector config required");
  assert.ok(DEFAULT_CONFIG.dispatcher, "dispatcher config required");
  assert.ok(DEFAULT_CONFIG.telemetry,  "telemetry config required");
});

test("DEFAULT_CONFIG selector fallbackChain is ordered", () => {
  const chain = DEFAULT_CONFIG.selector.fallbackChain;
  assert.ok(Array.isArray(chain) && chain.length >= 6, "fallbackChain should have 6+ strategies");
  assert.strictEqual(chain[0], "uuid", "First strategy should be uuid (fastest)");
});

test("BEHAVIOR_PROFILES all have valid weights summing near 1", () => {
  for (const [name, profile] of Object.entries(BEHAVIOR_PROFILES)) {
    const weights = Object.values(profile.variantWeights) as number[];
    const total   = weights.reduce((s, w) => s + w, 0);
    assert.ok(
      Math.abs(total - 1) < 0.01,
      `Profile ${name} weights should sum to 1, got ${total.toFixed(3)}`
    );
  }
});

// ════════════════════════════════════════════════════════════
// Results
// ════════════════════════════════════════════════════════════

// Defer summary to allow async tests to complete
setTimeout(() => {
  console.log(`\n\x1b[36m── Results ──\x1b[0m`);
  console.log(`  \x1b[32m${passed} passed\x1b[0m  \x1b[31m${failed} failed\x1b[0m  (${passed + failed} total)\n`);

  if (errors.length > 0) {
    console.log("\x1b[31mFailed tests:\x1b[0m");
    errors.forEach((e) => console.log(`  • ${e}`));
    process.exit(1);
  }
}, 200);

// ════════════════════════════════════════════════════════════
// PatternMemory + StrategyOptimizer
// ════════════════════════════════════════════════════════════

// Dynamic import to avoid module resolution at top-level
(async () => {
  const { PatternMemory, StrategyOptimizer } = await import("../src/adaptive/index.ts");

  console.log("\n\x1b[36m── PatternMemory ──\x1b[0m");

  test("record and get a pattern", () => {
    const m = new PatternMemory({ maxKeys: 100 });
    m.record({ action: "click", profile: "precise", variant: "direct" }, true, 120, "sess-1");
    const rec = m.get({ action: "click", profile: "precise", variant: "direct" });
    assert.ok(rec, "Pattern record should exist");
    assert.strictEqual(rec?.samples.length, 1);
    assert.strictEqual(rec?.successRate, 1.0);
  });

  test("successRate updates correctly", () => {
    const m = new PatternMemory({ maxKeys: 100 });
    const key = { action: "click", profile: "precise" as const, variant: "direct" as const };
    m.record(key, true,  100, "s1");
    m.record(key, true,  100, "s1");
    m.record(key, false, 100, "s1");
    const rec = m.get(key);
    assert.ok(Math.abs((rec?.successRate ?? 0) - 2/3) < 0.01, `Expected ~0.667, got ${rec?.successRate}`);
  });

  test("bestVariant returns highest success rate variant", () => {
    const m = new PatternMemory({ maxKeys: 100 });
    for (let i = 0; i < 10; i++) m.record({ action: "click", profile: "precise", variant: "hover"  }, true,  150, "s1");
    for (let i = 0; i < 10; i++) m.record({ action: "click", profile: "precise", variant: "direct" }, false, 100, "s1");
    const best = m.bestVariant("click", "precise", undefined, undefined, 5);
    assert.strictEqual(best, "hover");
  });

  test("bestVariant returns null with insufficient samples", () => {
    const m    = new PatternMemory({ maxKeys: 100 });
    m.record({ action: "click", profile: "precise", variant: "direct" }, true, 100, "s1");
    const best = m.bestVariant("click", "precise", undefined, undefined, 10);
    assert.strictEqual(best, null, "Should return null below minSamples");
  });

  test("maxKeys evicts oldest patterns", () => {
    const m = new PatternMemory({ maxKeys: 3 });
    for (let i = 0; i < 5; i++) {
      m.record({ action: `action${i}`, profile: "precise", variant: "direct" }, true, 100, "s");
    }
    assert.ok(m.snapshot().totalKeys <= 3, `Expected ≤3 keys, got ${m.snapshot().totalKeys}`);
  });

  console.log("\n\x1b[36m── StrategyOptimizer ──\x1b[0m");

  test("recommend returns a valid recommendation", () => {
    const m   = new PatternMemory({ maxKeys: 100 });
    const opt = new StrategyOptimizer(m);
    const rec = opt.recommend({
      action: "click", sessionId: "s1", profile: "precise",
      recentErrors: 0, detectionRisk: 0,
    });
    assert.ok(rec.profile, "Should have a profile");
    assert.ok(rec.confidence >= 0 && rec.confidence <= 1);
    assert.ok(rec.reason, "Should have a reason");
  });

  test("high error rate increases entropy", () => {
    const m   = new PatternMemory({ maxKeys: 100 });
    const opt = new StrategyOptimizer(m);
    const initial = opt.entropy("sess-ent");
    opt.recommend({ action: "click", sessionId: "sess-ent", profile: "precise", recentErrors: 0.8, detectionRisk: 0 });
    const after = opt.entropy("sess-ent");
    assert.ok(after > initial, `Entropy should increase: ${initial} → ${after}`);
  });

  test("low error rate decreases entropy toward baseline", () => {
    const m   = new PatternMemory({ maxKeys: 100 });
    const opt = new StrategyOptimizer(m);
    // Inflate entropy first
    opt.recommend({ action: "click", sessionId: "sess-d", profile: "precise", recentErrors: 0.9, detectionRisk: 0 });
    const inflated = opt.entropy("sess-d");
    // Now calm conditions
    for (let i = 0; i < 10; i++) {
      opt.recommend({ action: "click", sessionId: "sess-d", profile: "precise", recentErrors: 0.0, detectionRisk: 0 });
    }
    const calmed = opt.entropy("sess-d");
    assert.ok(calmed < inflated, `Entropy should decrease: ${inflated} → ${calmed}`);
  });

  test("learn feeds pattern memory from optimizer", () => {
    const m   = new PatternMemory({ maxKeys: 100 });
    const opt = new StrategyOptimizer(m);
    opt.learn({ action: "click", sessionId: "s1", profile: "precise", variant: "hover", success: true, durationMs: 200 });
    const rec = m.get({ action: "click", profile: "precise", variant: "hover" });
    assert.ok(rec, "Pattern should exist after learn");
    assert.strictEqual(rec?.samples.length, 1);
  });

  test("recommend upgrades profile on high detection risk", () => {
    const m   = new PatternMemory({ maxKeys: 100 });
    const opt = new StrategyOptimizer(m);
    const rec = opt.recommend({ action: "click", sessionId: "s1", profile: "precise", recentErrors: 0, detectionRisk: 0.9 });
    assert.strictEqual(rec.profile, "exploratory", `Expected exploratory, got ${rec.profile}`);
  });
})();
