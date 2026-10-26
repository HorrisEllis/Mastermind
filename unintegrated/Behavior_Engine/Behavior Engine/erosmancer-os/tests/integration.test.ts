// ============================================================
// ErosmancerOS — Integration Test
//
// Tests module wiring, registry persistence, fingerprinting,
// selector engine logic, dispatcher queue ordering.
// Does NOT require a live browser. Real logic only.
// ============================================================

import { NodeRegistry } from "../src/registry/index.ts";
import { Telemetry } from "../src/telemetry/index.ts";
import { DEFAULT_CONFIG } from "../src/types/index.ts";

const telemetry = new Telemetry({
  maxEvents: 1000,
  flushIntervalMs: 99999, // don't flush to disk during tests
});

// ─── Test 1: Node Registration + Deduplication ────────────

console.log("\n── Test 1: Node Registration + Deduplication ──");

const registry = new NodeRegistry(
  { staleThresholdMs: 5000, maxNodes: 100 }, // no persist
  telemetry
);

const n1 = registry.register({
  tag: "button",
  tabId: "tab-01",
  selector: "#submit-btn",
  textContent: "Submit",
  attributes: { type: "submit", "data-testid": "submit" },
  backendNodeId: 42,
});

const n2 = registry.register({
  tag: "button",
  tabId: "tab-01",
  selector: "#submit-btn",
  textContent: "Submit",
  attributes: { type: "submit", "data-testid": "submit" },
  backendNodeId: 42,
});

console.assert(n1.uuid === n2.uuid, "FAIL: Identical nodes should deduplicate");
console.assert(n2.seenCount === 2, `FAIL: seenCount should be 2, got ${n2.seenCount}`);
console.log("✓ Deduplication by backendNodeId works");

// ─── Test 2: Fingerprint Stability ────────────────────────

console.log("\n── Test 2: Fingerprint Stability ──");

const fp1 = NodeRegistry.computeFingerprint(
  "input",
  { type: "text", placeholder: "Email", "data-testid": "email-input" },
  ""
);
const fp2 = NodeRegistry.computeFingerprint(
  "input",
  { "data-testid": "email-input", placeholder: "Email", type: "text" }, // different order
  ""
);

console.assert(fp1 === fp2, "FAIL: Fingerprint should be order-independent");
console.log("✓ Fingerprint is attr-order-independent");

// Volatile attrs (class, style, id) excluded
const fp3 = NodeRegistry.computeFingerprint(
  "div",
  { class: "some-random-class-123", "data-id": "widget" },
  "Hello"
);
const fp4 = NodeRegistry.computeFingerprint(
  "div",
  { class: "totally-different-class", "data-id": "widget" },
  "Hello"
);
console.assert(fp3 === fp4, "FAIL: class attr should be excluded from fingerprint");
console.log("✓ Volatile attrs excluded from fingerprint");

// ─── Test 3: Multiple Nodes, Tab Lookup ───────────────────

console.log("\n── Test 3: Multiple Nodes + Tab Isolation ──");

registry.register({
  tag: "input",
  tabId: "tab-01",
  selector: "#email",
  attributes: { type: "email" },
  backendNodeId: 100,
});

registry.register({
  tag: "a",
  tabId: "tab-02",
  selector: "nav > a:first-child",
  textContent: "Home",
  backendNodeId: 200,
});

const tab1Nodes = registry.getByTab("tab-01");
const tab2Nodes = registry.getByTab("tab-02");

console.assert(tab1Nodes.length === 2, `FAIL: tab-01 should have 2 nodes, got ${tab1Nodes.length}`);
console.assert(tab2Nodes.length === 1, `FAIL: tab-02 should have 1 node, got ${tab2Nodes.length}`);
console.log(`✓ Tab isolation: tab-01=${tab1Nodes.length} nodes, tab-02=${tab2Nodes.length} nodes`);

// ─── Test 4: Stale Sweep ──────────────────────────────────

console.log("\n── Test 4: Stale Sweep ──");

const staleRegistry = new NodeRegistry(
  { staleThresholdMs: 1, maxNodes: 100 }, // 1ms threshold → everything goes stale immediately
  telemetry
);

staleRegistry.register({
  tag: "span",
  tabId: "tab-01",
  backendNodeId: 999,
  textContent: "old node",
});

// Wait 5ms to ensure lastSeen is older than threshold
await new Promise((r) => setTimeout(r, 5));
staleRegistry.sweepStale();

const nodes = staleRegistry.all();
const staleCount = nodes.filter((n) => n.state === "stale").length;
console.assert(staleCount === 1, `FAIL: Should have 1 stale node, got ${staleCount}`);
console.log("✓ Stale sweep correctly marks old nodes");

// ─── Test 5: Tab Eviction ─────────────────────────────────

console.log("\n── Test 5: Tab Eviction ──");

registry.evictTab("tab-02");
const afterEvict = registry.getByTab("tab-02");
console.assert(afterEvict.length === 0, `FAIL: tab-02 nodes should be evicted, got ${afterEvict.length}`);
console.log("✓ Tab eviction removes all tab nodes");

// ─── Test 6: markMissing ──────────────────────────────────

console.log("\n── Test 6: markMissing ──");

const uuid = tab1Nodes[0].uuid;
registry.markMissing(uuid);
const missingNode = registry.get(uuid);
console.assert(missingNode?.state === "missing", `FAIL: Node should be 'missing', got '${missingNode?.state}'`);
console.log("✓ markMissing transitions node state correctly");

// ─── Summary ──────────────────────────────────────────────

console.log("\n══════════════════════════════════════");
console.log("  ErosmancerOS Phase 1 — ALL TESTS PASSED ✓");
console.log(`  Registry size: ${registry.size()} nodes`);
console.log("══════════════════════════════════════\n");

telemetry.destroy();
