// ============================================================
// ErosmancerOS — HostileDetection Tests
//
// Tests real detection logic: signal matching, score accumulation,
// threshold-driven level escalation, state persistence, clearing.
// No browser, no network. Pure logic.
// ============================================================

import assert from "assert";
import { HostileDetection } from "../src/hostile/index.ts";
import { Telemetry }        from "../src/telemetry/index.ts";
import type { ThreatLevel } from "../src/hostile/index.ts";

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

// ─── Shared fixtures ──────────────────────────────────────────

const noopTelemetry = new Telemetry({
  maxEvents:       100,
  flushIntervalMs: 9_999_999,
});

// Minimal bridge stub — HostileDetection only needs bridge.on() and bridge.send()
function makeBridge() {
  const listeners = new Map<string, Array<(params: unknown) => void>>();
  return {
    on: (event: string, fn: (params: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(fn);
    },
    send: async () => ({}),
    emit: (event: string, params: unknown) => {
      for (const fn of listeners.get(event) ?? []) fn(params);
    },
    _listeners: listeners,
  };
}

// ════════════════════════════════════════════════════════════
// HostileDetection
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── HostileDetection ──\x1b[0m");

test("initial state is none/0", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);
  const state   = hostile.getState("tab-01");
  assert.strictEqual(state.level, "none");
  assert.strictEqual(state.score, 0);
  assert.deepStrictEqual(state.activeSignals, []);
});

test("getState returns empty state for unknown tab", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);
  const state   = hostile.getState("nonexistent-tab");
  assert.ok(state, "Should return a state object, not null");
  assert.strictEqual(state.level, "none");
});

test("evaluate: cloudflare title raises score", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:   "https://example.com",
    title: "Just a moment... | Cloudflare",
  });

  const state = hostile.getState("tab-01");
  assert.ok(state.score > 0, `Score should be > 0 after Cloudflare title, got ${state.score}`);
});

test("evaluate: 429 status raises score", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:        "https://example.com/api",
    statusCode: 429,
  });

  const state = hostile.getState("tab-01");
  assert.ok(state.score > 0, `Score should be > 0 after 429, got ${state.score}`);
});

test("evaluate: clean URL+title keeps score 0", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:   "https://example.com/dashboard",
    title: "My App — Dashboard",
  });

  const state = hostile.getState("tab-01");
  assert.strictEqual(state.score, 0, `Clean page should score 0, got ${state.score}`);
});

test("multiple signals accumulate score above single signal", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:        "https://example.com",
    title:      "Just a moment... | Cloudflare",
    statusCode: 403,
  });

  hostile.evaluate("tab-02", {
    url:   "https://example.com",
    title: "Just a moment... | Cloudflare",
  });

  const s1 = hostile.getState("tab-01").score;
  const s2 = hostile.getState("tab-02").score;

  assert.ok(
    s1 >= s2,
    `Multiple signals should score >= single signal. Got tab-01=${s1} tab-02=${s2}`
  );
});

test("score drives level: high score → high/critical level", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  // Pump multiple hostile signals to drive score up
  const signals = [
    { url: "https://x.com", title: "Just a moment... | Cloudflare", statusCode: 403 },
    { url: "https://x.com", title: "CAPTCHA verification required" },
    { url: "https://x.com", bodySnippet: "grecaptcha.execute" },
    { url: "https://x.com", bodySnippet: "cf-challenge-running" },
  ];

  for (const s of signals) {
    hostile.evaluate("tab-01", s);
  }

  const state = hostile.getState("tab-01");
  const highLevels: ThreatLevel[] = ["medium", "high", "critical"];
  assert.ok(
    highLevels.includes(state.level),
    `High score should produce medium/high/critical level, got '${state.level}' (score=${state.score})`
  );
});

test("recommendProfile is valid behavior profile", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:   "https://x.com",
    title: "Just a moment... | Cloudflare",
  });

  const state = hostile.getState("tab-01");
  const valid = ["precise", "cautious", "exploratory", "turbo"];
  assert.ok(
    valid.includes(state.recommendProfile),
    `recommendProfile should be a valid behavior profile, got '${state.recommendProfile}'`
  );
});

test("recommendRoute is valid route level", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:   "https://x.com",
    title: "Just a moment... | Cloudflare",
  });

  const state = hostile.getState("tab-01");
  const valid = ["direct", "parallel", "redundant"];
  assert.ok(
    valid.includes(state.recommendRoute),
    `recommendRoute should be valid, got '${state.recommendRoute}'`
  );
});

test("clear() resets tab state to none", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:   "https://x.com",
    title: "Just a moment... | Cloudflare",
  });

  assert.ok(hostile.getState("tab-01").score > 0, "Pre-clear: score should be > 0");

  hostile.clear("tab-01");

  const state = hostile.getState("tab-01");
  assert.strictEqual(state.level, "none");
  assert.strictEqual(state.score, 0);
  assert.deepStrictEqual(state.activeSignals, []);
});

test("clear() emits threat:cleared event", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  let cleared = "";
  hostile.on("threat:cleared", (tabId) => { cleared = tabId; });

  hostile.evaluate("tab-01", { url: "https://x.com", title: "Just a moment... | Cloudflare" });
  hostile.clear("tab-01");

  assert.strictEqual(cleared, "tab-01", "threat:cleared should emit the cleared tabId");
});

test("threat:detected event fires with correct shape", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  let signal: unknown = null;
  let state:  unknown = null;
  hostile.on("threat:detected", (sig, st) => { signal = sig; state = st; });

  hostile.evaluate("tab-01", {
    url:   "https://x.com",
    title: "Just a moment... | Cloudflare",
  });

  assert.ok(signal !== null,               "threat:detected should have fired");
  assert.ok((signal as Record<string, unknown>).type,  "signal must have type");
  assert.ok((signal as Record<string, unknown>).level, "signal must have level");
  assert.ok((state as Record<string, unknown>).score !== undefined, "state must have score");
});

test("allStates() returns map of all tracked tabs", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", { url: "https://x.com", title: "Just a moment..." });
  hostile.evaluate("tab-02", { url: "https://y.com", title: "Verification required" });

  const states = hostile.allStates();
  assert.ok("tab-01" in states, "tab-01 should be in allStates");
  assert.ok("tab-02" in states, "tab-02 should be in allStates");
});

test("separate tabs have independent state", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-A", { url: "https://x.com", title: "Just a moment... | Cloudflare" });
  // tab-B gets no hostile signals
  hostile.evaluate("tab-B", { url: "https://clean.com", title: "Welcome!" });

  const sA = hostile.getState("tab-A").score;
  const sB = hostile.getState("tab-B").score;

  assert.ok(sA > 0,  `tab-A should have score > 0, got ${sA}`);
  assert.strictEqual(sB, 0, `tab-B should stay at 0, got ${sB}`);
});

test("recaptcha body snippet detected", () => {
  const bridge  = makeBridge();
  const hostile = new HostileDetection(bridge as never, noopTelemetry);

  hostile.evaluate("tab-01", {
    url:         "https://x.com/login",
    bodySnippet: "grecaptcha.execute('token', {action: 'submit'})",
  });

  const state = hostile.getState("tab-01");
  assert.ok(state.score > 0, `reCAPTCHA snippet should score > 0, got ${state.score}`);
});

// ─── Results ──────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n\x1b[36m── HostileDetection: ${passed} passed / ${failed} failed ──\x1b[0m\n`);
  if (failed > 0) process.exit(1);
}, 200);
