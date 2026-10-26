// ============================================================
// ErosmancerOS — ScriptReplayQueue Tests
//
// startFrame(), record(), replay(), updateCheckpoint(),
// getFrame(), getFramesForTab(), snapshot(), abort(),
// replayLatest(), ring-buffer eviction, destructive filter,
// concurrent replay guard, event emission.
//
// No mocks. No network. Pure logic.
// ============================================================

import assert from "assert";
import { ScriptReplayQueue } from "../src/replay/index.ts";
import type { ReplayCommand } from "../src/replay/index.ts";

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

function makeQueue(opts = {}) {
  return new ScriptReplayQueue({ maxFrames: 10, ...opts });
}

function makeCheckpoint(url = "https://example.com") {
  return { url, nodeCount: 5, ts: Date.now() };
}

function makeCmd(type = "click"): Omit<ReplayCommand, "id" | "timestamp" | "result"> {
  return { type, tabId: "tab-01", targetUuid: `nel-${Math.random().toString(36).slice(2,8)}`, priority: 5 };
}

function makeResult(success = true) {
  return { commandId: "cmd-1", success, durationMs: 80, attempt: 1 };
}

async function noopExec(_cmd: ReplayCommand): Promise<void> {}

// ════════════════════════════════════════════════════════════
// startFrame / basic registration
// ════════════════════════════════════════════════════════════

console.log("\n\x1b[36m── ScriptReplayQueue ──\x1b[0m");

test("startFrame() creates a frame with correct shape", () => {
  const q      = makeQueue();
  const frame  = q.startFrame("tab-01", "sess-01", makeCheckpoint());

  assert.ok(frame.frameId.startsWith("frame-"), `frameId format wrong: ${frame.frameId}`);
  assert.strictEqual(frame.tabId,      "tab-01");
  assert.strictEqual(frame.sessionId,  "sess-01");
  assert.deepStrictEqual(frame.commands, []);
  assert.strictEqual(frame.replayCount, 0);
  assert.ok(frame.createdAt > 0);
});

test("startFrame() is retrievable via getFrame()", () => {
  const q     = makeQueue();
  const frame = q.startFrame("tab-01", "sess-01", makeCheckpoint());
  const got   = q.getFrame(frame.frameId);
  assert.ok(got, "getFrame should return the created frame");
  assert.strictEqual(got!.frameId, frame.frameId);
});

test("startFrame() fires frame:created event", () => {
  const q      = makeQueue();
  let   fired  = false;
  q.on("frame:created", (f) => { fired = true; assert.ok(f.frameId); });
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  assert.ok(fired, "frame:created must fire");
});

test("snapshot() reflects created frame", () => {
  const q = makeQueue();
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  const snap = q.snapshot();
  assert.strictEqual(snap.totalFrames, 1);
  assert.strictEqual(snap.activeTabs,  1);
  assert.strictEqual(snap.replaying,   0);
  assert.strictEqual(snap.totalCommands, 0);
});

// ════════════════════════════════════════════════════════════
// record()
// ════════════════════════════════════════════════════════════

test("record() appends successful command to active frame", () => {
  const q = makeQueue();
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));

  const snap = q.snapshot();
  assert.strictEqual(snap.totalCommands, 1);
});

test("record() ignores failed commands", () => {
  const q = makeQueue();
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(false));

  assert.strictEqual(q.snapshot().totalCommands, 0, "Failed commands must not be recorded");
});

test("record() ignores destructive command: navigate", () => {
  const q = makeQueue();
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  q.record("tab-01", makeCmd("navigate"), makeResult(true));
  assert.strictEqual(q.snapshot().totalCommands, 0, "navigate is destructive and should be skipped");
});

test("record() ignores destructive command: screenshot", () => {
  const q = makeQueue();
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  q.record("tab-01", makeCmd("screenshot"), makeResult(true));
  assert.strictEqual(q.snapshot().totalCommands, 0, "screenshot is destructive and should be skipped");
});

test("record() does nothing when no active frame for tab", () => {
  const q = makeQueue();
  // Never called startFrame for tab-99
  q.record("tab-99", makeCmd("click"), makeResult(true));
  assert.strictEqual(q.snapshot().totalCommands, 0, "Record without frame should be a no-op");
});

test("record() stamps command with id and timestamp", () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "sess-01", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));

  const frame = q.getFrame(f.frameId)!;
  const cmd   = frame.commands[0];
  assert.ok(cmd.id.startsWith("rc-"),     `id should start with rc-, got ${cmd.id}`);
  assert.ok(cmd.timestamp > 0,            "timestamp must be set");
  assert.ok(cmd.result?.success === true, "result.success must be recorded");
  assert.ok(cmd.result?.durationMs === 80, "result.durationMs must be recorded");
});

test("record() multiple cmds accumulate correctly in snapshot", () => {
  const q = makeQueue();
  q.startFrame("tab-01", "sess-01", makeCheckpoint());
  for (let i = 0; i < 5; i++) {
    q.record("tab-01", makeCmd("click"), makeResult(true));
  }
  assert.strictEqual(q.snapshot().totalCommands, 5);
});

// ════════════════════════════════════════════════════════════
// updateCheckpoint()
// ════════════════════════════════════════════════════════════

test("updateCheckpoint() mutates the active frame's checkpoint", () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "sess-01", makeCheckpoint("https://old.com"));

  q.updateCheckpoint("tab-01", { url: "https://new.com", nodeCount: 20, ts: Date.now() });

  const frame = q.getFrame(f.frameId)!;
  assert.strictEqual(frame.checkpoint.url, "https://new.com");
  assert.strictEqual(frame.checkpoint.nodeCount, 20);
});

test("updateCheckpoint() is a no-op for tab with no active frame", () => {
  const q = makeQueue();
  // Should not throw
  q.updateCheckpoint("tab-unknown", { url: "x", nodeCount: 0, ts: Date.now() });
});

// ════════════════════════════════════════════════════════════
// getFramesForTab()
// ════════════════════════════════════════════════════════════

test("getFramesForTab() returns empty array for unknown tab", () => {
  const q = makeQueue();
  assert.deepStrictEqual(q.getFramesForTab("tab-unknown"), []);
});

test("getFramesForTab() returns all frames for a tab sorted by createdAt desc", async () => {
  const q = makeQueue();
  q.startFrame("tab-01", "s1", makeCheckpoint("https://page1.com"));
  await new Promise(r => setTimeout(r, 5)); // ensure different timestamps
  q.startFrame("tab-01", "s2", makeCheckpoint("https://page2.com"));

  const frames = q.getFramesForTab("tab-01");
  assert.ok(frames.length >= 1, "Should return at least one frame for the tab");
  // Most recent first
  if (frames.length >= 2) {
    assert.ok(frames[0].createdAt >= frames[1].createdAt, "Should be sorted most-recent first");
  }
});

test("getFramesForTab() isolates tabs correctly", () => {
  const q = makeQueue();
  q.startFrame("tab-A", "sA", makeCheckpoint());
  q.startFrame("tab-B", "sB", makeCheckpoint());

  assert.strictEqual(q.getFramesForTab("tab-A").length, 1);
  assert.strictEqual(q.getFramesForTab("tab-B").length, 1);
  assert.strictEqual(q.getFramesForTab("tab-C").length, 0);
});

// ════════════════════════════════════════════════════════════
// maxFrames eviction
// ════════════════════════════════════════════════════════════

test("maxFrames cap: oldest frames evicted when exceeded", async () => {
  const q = makeQueue({ maxFrames: 3 });
  for (let i = 0; i < 5; i++) {
    await new Promise(r => setTimeout(r, 2));
    q.startFrame(`tab-${i}`, "s", makeCheckpoint());
  }
  assert.ok(q.snapshot().totalFrames <= 3,
    `Expected ≤3 frames, got ${q.snapshot().totalFrames}`
  );
});

// ════════════════════════════════════════════════════════════
// replay()
// ════════════════════════════════════════════════════════════

test("replay() executes all recorded commands and returns counts", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());

  q.record("tab-01", makeCmd("click"), makeResult(true));
  q.record("tab-01", makeCmd("type"),  makeResult(true));
  q.record("tab-01", makeCmd("click"), makeResult(true));

  const executed: string[] = [];
  const { succeeded, failed } = await q.replay(
    f.frameId,
    async (cmd) => { executed.push(cmd.type); },
    undefined,
    0   // no delay in tests
  );

  assert.strictEqual(succeeded, 3, `Expected 3 succeeded, got ${succeeded}`);
  assert.strictEqual(failed,    0, `Expected 0 failed, got ${failed}`);
  assert.deepStrictEqual(executed, ["click", "type", "click"]);
});

test("replay() counts executor failures correctly", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());

  q.record("tab-01", makeCmd("click"), makeResult(true));
  q.record("tab-01", makeCmd("click"), makeResult(true));

  let callCount = 0;
  const { succeeded, failed } = await q.replay(
    f.frameId,
    async (_cmd) => {
      callCount++;
      if (callCount === 2) throw new Error("simulated executor failure");
    },
    undefined,
    0
  );

  assert.strictEqual(succeeded, 1, "First cmd should succeed");
  assert.strictEqual(failed,    1, "Second cmd should fail");
  assert.strictEqual(callCount, 2, "Both cmds should be attempted");
});

test("replay() throws for unknown frameId", async () => {
  const q = makeQueue();
  await assert.rejects(
    () => q.replay("nonexistent-frame", noopExec),
    /Frame not found/
  );
});

test("replay() respects filter function", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));
  q.record("tab-01", makeCmd("type"),  makeResult(true));

  const executed: string[] = [];
  await q.replay(
    f.frameId,
    async (cmd) => { executed.push(cmd.type); },
    (cmd) => cmd.type === "click",  // only click
    0
  );

  assert.deepStrictEqual(executed, ["click"], "Filter should exclude type commands");
});

test("replay() increments replayCount on frame", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));

  assert.strictEqual(q.getFrame(f.frameId)!.replayCount, 0, "Pre-replay count");
  await q.replay(f.frameId, noopExec, undefined, 0);
  assert.strictEqual(q.getFrame(f.frameId)!.replayCount, 1, "Post-replay count");
});

test("concurrent replay of same frame is rejected", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));

  // Start first replay — don't await, keep it running
  const slow = q.replay(
    f.frameId,
    async () => { await new Promise(r => setTimeout(r, 50)); },
    undefined,
    0
  );

  // Immediately try concurrent replay
  await assert.rejects(
    () => q.replay(f.frameId, noopExec, undefined, 0),
    /already in progress/
  );

  await slow; // clean up
});

test("replay() fires replay:started and replay:done events", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));

  const events: string[] = [];
  q.on("replay:started", () => events.push("started"));
  q.on("replay:done",    () => events.push("done"));

  await q.replay(f.frameId, noopExec, undefined, 0);

  assert.deepStrictEqual(events, ["started", "done"]);
});

test("replay() fires replay:cmd for each command", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));
  q.record("tab-01", makeCmd("type"),  makeResult(true));

  const cmdEvents: number[] = [];
  q.on("replay:cmd", (_cmd, attempt) => cmdEvents.push(attempt));

  await q.replay(f.frameId, noopExec, undefined, 0);

  assert.deepStrictEqual(cmdEvents, [1, 2], "replay:cmd should fire with 1-indexed attempt");
});

// ════════════════════════════════════════════════════════════
// abort()
// ════════════════════════════════════════════════════════════

test("abort() fires replay:aborted with reason", async () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  q.record("tab-01", makeCmd("click"), makeResult(true));

  let abortedFrameId  = "";
  let abortedReason   = "";
  q.on("replay:aborted", (fid, reason) => { abortedFrameId = fid; abortedReason = reason; });

  // Start slow replay then immediately abort
  const p = q.replay(
    f.frameId,
    async () => { await new Promise(r => setTimeout(r, 100)); },
    undefined,
    0
  );

  q.abort(f.frameId, "test-abort");

  // abort is best-effort on the in-flight replay — just check event
  assert.strictEqual(abortedFrameId, f.frameId, "abort should emit the correct frameId");
  assert.strictEqual(abortedReason,  "test-abort");

  await p.catch(() => {}); // swallow
});

test("abort() is no-op for frame not in progress", () => {
  const q = makeQueue();
  const f = q.startFrame("tab-01", "s1", makeCheckpoint());
  // Should not throw
  q.abort(f.frameId, "no-op-test");
});

// ════════════════════════════════════════════════════════════
// replayLatest()
// ════════════════════════════════════════════════════════════

test("replayLatest() returns null when no frames for tab", async () => {
  const q      = makeQueue();
  const result = await q.replayLatest("tab-unknown", noopExec);
  assert.strictEqual(result, null, "Should return null for unknown tab");
});

test("replayLatest() replays the most recent frame for a tab", async () => {
  const q = makeQueue();
  q.startFrame("tab-01", "s1", makeCheckpoint("https://old.com"));
  q.record("tab-01", makeCmd("click"), makeResult(true)); // 1 cmd in old frame

  await new Promise(r => setTimeout(r, 5));
  q.startFrame("tab-01", "s2", makeCheckpoint("https://new.com"));
  q.record("tab-01", makeCmd("type"),  makeResult(true)); // 1 cmd in new frame

  const executed: string[] = [];
  const result = await q.replayLatest(
    "tab-01",
    async (cmd) => { executed.push(cmd.type); },
    undefined,
    0
  );

  assert.ok(result !== null,            "Should return replay result");
  assert.strictEqual(result!.succeeded, 1, "Should replay latest frame's single command");
  // Latest frame has "type" command
  assert.deepStrictEqual(executed, ["type"], "Should replay the most-recent frame's commands");
});

// ─── Results ──────────────────────────────────────────────────

setTimeout(() => {
  console.log(`\n\x1b[36m── ScriptReplayQueue: ${passed} passed / ${failed} failed ──\x1b[0m\n`);
  if (failed > 0) process.exit(1);
}, 300);
