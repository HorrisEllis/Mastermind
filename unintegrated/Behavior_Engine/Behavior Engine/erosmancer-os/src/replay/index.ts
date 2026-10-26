// ============================================================
// ErosmancerOS — ScriptReplayQueue
//
// Survival mechanism. Records every successfully executed
// command sequence. On bridge reconnect or tab reload, can
// replay from a known-good checkpoint.
//
// Architecture:
//   - Ring buffer of ScriptFrames (max N frames)
//   - Each frame = { tabId, sessionId, commands[], checkpoint }
//   - Checkpoint = stable state description (URL + title + nodeCount)
//   - Replay walks commands in order through the dispatcher
//   - Idempotent commands replayed safely; destructive ones gated
//
// Not a macro recorder — it's a resilience layer.
// ============================================================

import { randomUUID } from "crypto";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import EventEmitter from "eventemitter3";
import type { CommandResult } from "../types/index.ts";

// ─── Types ───────────────────────────────────────────────────

export interface ReplayCommand {
  id:        string;
  type:      string;
  tabId:     string;
  targetUuid?: string;
  payload?:  Record<string, unknown>;
  priority:  number;
  timestamp: number;
  result?:   { success: boolean; durationMs: number };
}

export interface Checkpoint {
  url:       string;
  title?:    string;
  nodeCount: number;
  ts:        number;
}

export interface ScriptFrame {
  frameId:    string;
  sessionId:  string;
  tabId:      string;
  commands:   ReplayCommand[];
  checkpoint: Checkpoint;
  createdAt:  number;
  replayCount: number;
}

export type ReplayFilter = (cmd: ReplayCommand) => boolean;

interface ReplayEvents {
  "frame:created":  [frame: ScriptFrame];
  "frame:evicted":  [frameId: string];
  "replay:started": [frameId: string, tabId: string];
  "replay:cmd":     [cmd: ReplayCommand, attempt: number];
  "replay:done":    [frameId: string, succeeded: number, failed: number];
  "replay:aborted": [frameId: string, reason: string];
}

// ─── ScriptReplayQueue ───────────────────────────────────────

export class ScriptReplayQueue extends EventEmitter<ReplayEvents> {
  private readonly maxFrames:  number;
  private readonly persistPath?: string;

  private frames    = new Map<string, ScriptFrame>();  // frameId → frame
  private activeTab = new Map<string, string>();        // tabId → current frameId
  private replayInProgress = new Set<string>();         // frameIds currently replaying

  constructor(options: {
    maxFrames?:   number;
    persistPath?: string;
  } = {}) {
    super();
    this.maxFrames   = options.maxFrames   ?? 50;
    this.persistPath = options.persistPath;
    this.load();
  }

  // ─── Recording ────────────────────────────────────────────

  /**
   * Start a new recording frame for a tab.
   * Closes and archives the previous frame for this tab.
   */
  startFrame(tabId: string, sessionId: string, checkpoint: Checkpoint): ScriptFrame {
    // Evict previous frame for this tab if exists
    const prevId = this.activeTab.get(tabId);
    if (prevId) {
      this.archiveFrame(prevId);
    }

    const frame: ScriptFrame = {
      frameId:    `frame-${randomUUID()}`,
      sessionId,
      tabId,
      commands:   [],
      checkpoint,
      createdAt:  Date.now(),
      replayCount: 0,
    };

    this.frames.set(frame.frameId, frame);
    this.activeTab.set(tabId, frame.frameId);

    // Evict oldest if over limit
    if (this.frames.size > this.maxFrames) {
      this.evictOldest();
    }

    this.emit("frame:created", frame);
    return frame;
  }

  /**
   * Record a command execution result into the active frame for a tab.
   * Only records successful commands by default.
   */
  record(
    tabId:  string,
    cmd:    Omit<ReplayCommand, "id" | "timestamp" | "result">,
    result: CommandResult
  ): void {
    const frameId = this.activeTab.get(tabId);
    if (!frameId) return;

    const frame = this.frames.get(frameId);
    if (!frame) return;

    // Only persist successful, non-destructive commands
    if (!result.success) return;
    if (this.isDestructive(cmd.type)) return;

    const entry: ReplayCommand = {
      ...cmd,
      id:        `rc-${randomUUID()}`,
      timestamp: Date.now(),
      result:    { success: result.success, durationMs: result.durationMs },
    };

    frame.commands.push(entry);

    // Cap per-frame command buffer
    if (frame.commands.length > 500) {
      frame.commands.shift();
    }

    this.persist();
  }

  /**
   * Update checkpoint for the active frame (call after navigation, DOM settle).
   */
  updateCheckpoint(tabId: string, checkpoint: Checkpoint): void {
    const frameId = this.activeTab.get(tabId);
    if (!frameId) return;
    const frame = this.frames.get(frameId);
    if (frame) {
      frame.checkpoint = checkpoint;
      this.persist();
    }
  }

  // ─── Replay ───────────────────────────────────────────────

  /**
   * Replay a specific frame through an executor function.
   *
   * @param frameId   - which frame to replay
   * @param executor  - async function that executes a single ReplayCommand
   * @param filter    - optional filter to skip certain command types
   * @param delayMs   - inter-command delay (default 50ms)
   */
  async replay(
    frameId:  string,
    executor: (cmd: ReplayCommand) => Promise<unknown>,
    filter?:  ReplayFilter,
    delayMs   = 50
  ): Promise<{ succeeded: number; failed: number }> {
    const frame = this.frames.get(frameId);
    if (!frame) throw new Error(`[ScriptReplayQueue] Frame not found: ${frameId}`);

    if (this.replayInProgress.has(frameId)) {
      throw new Error(`[ScriptReplayQueue] Replay already in progress: ${frameId}`);
    }

    this.replayInProgress.add(frameId);
    frame.replayCount++;

    this.emit("replay:started", frameId, frame.tabId);

    let succeeded = 0;
    let failed    = 0;

    const cmds = filter
      ? frame.commands.filter(filter)
      : frame.commands;

    for (let i = 0; i < cmds.length; i++) {
      const cmd = cmds[i];
      this.emit("replay:cmd", cmd, i + 1);

      try {
        await executor(cmd);
        succeeded++;
      } catch (_err) {
        failed++;
        // Non-fatal — continue replay
      }

      if (delayMs > 0 && i < cmds.length - 1) {
        await sleep(delayMs);
      }
    }

    this.replayInProgress.delete(frameId);
    this.emit("replay:done", frameId, succeeded, failed);

    return { succeeded, failed };
  }

  /**
   * Replay the most recent successful frame for a tab.
   */
  async replayLatest(
    tabId:    string,
    executor: (cmd: ReplayCommand) => Promise<unknown>,
    filter?:  ReplayFilter,
    delayMs   = 50
  ): Promise<{ succeeded: number; failed: number } | null> {
    // Find most recent frame for this tab (by createdAt)
    const tabFrames = [...this.frames.values()]
      .filter((f) => f.tabId === tabId)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (!tabFrames.length) return null;
    return this.replay(tabFrames[0].frameId, executor, filter, delayMs);
  }

  /**
   * Abort a replay in progress.
   */
  abort(frameId: string, reason = "manual"): void {
    if (!this.replayInProgress.has(frameId)) return;
    this.replayInProgress.delete(frameId);
    this.emit("replay:aborted", frameId, reason);
  }

  // ─── Introspection ────────────────────────────────────────

  getFrame(frameId: string): ScriptFrame | undefined {
    return this.frames.get(frameId);
  }

  getFramesForTab(tabId: string): ScriptFrame[] {
    return [...this.frames.values()]
      .filter((f) => f.tabId === tabId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  snapshot(): {
    totalFrames:  number;
    activeTabs:   number;
    replaying:    number;
    totalCommands: number;
  } {
    const totalCommands = [...this.frames.values()]
      .reduce((s, f) => s + f.commands.length, 0);

    return {
      totalFrames:   this.frames.size,
      activeTabs:    this.activeTab.size,
      replaying:     this.replayInProgress.size,
      totalCommands,
    };
  }

  // ─── Internal ─────────────────────────────────────────────

  private archiveFrame(frameId: string): void {
    // Frame stays in map — just remove from active index
    // It will be evicted by LRU when maxFrames exceeded
    for (const [tabId, fid] of this.activeTab) {
      if (fid === frameId) {
        this.activeTab.delete(tabId);
      }
    }
  }

  private evictOldest(): void {
    let oldest: ScriptFrame | null = null;
    for (const frame of this.frames.values()) {
      if (!oldest || frame.createdAt < oldest.createdAt) oldest = frame;
    }
    if (!oldest) return;
    this.frames.delete(oldest.frameId);
    this.emit("frame:evicted", oldest.frameId);
  }

  /**
   * Commands that should never be replayed (state-mutating with side effects).
   */
  private isDestructive(type: string): boolean {
    const destructive = new Set(["screenshot", "navigate"]);
    return destructive.has(type);
  }

  // ─── Persistence ──────────────────────────────────────────

  private persist(): void {
    if (!this.persistPath) return;
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = {
        frames:    [...this.frames.values()],
        savedAt:   new Date().toISOString(),
      };
      writeFileSync(this.persistPath, JSON.stringify(data, null, 2), "utf8");
    } catch (_err) {
      // Non-fatal — replay queue is best-effort persistence
    }
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw  = readFileSync(this.persistPath, "utf8");
      const data = JSON.parse(raw) as { frames: ScriptFrame[] };
      for (const frame of data.frames ?? []) {
        this.frames.set(frame.frameId, frame);
      }
    } catch (_err) {
      // Non-fatal — start fresh
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
