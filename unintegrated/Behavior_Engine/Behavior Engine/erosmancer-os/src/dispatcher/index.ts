// ============================================================
// ErosmancerOS — Signal Dispatcher
//
// The hands. Takes Command objects, resolves their target node,
// routes to the right CDP session, executes, retries on failure.
//
// Execution order: priority queue (0 = highest)
// Retry: bounded exponential backoff
// Failure: emits commandFailed event → upstream can adapt
// ============================================================

import { randomUUID } from "crypto";
import EventEmitter from "eventemitter3";
import type { BridgeCore } from "../bridge/index.ts";
import type { SelectorEngine } from "../selector/index.ts";
import type { NodeRegistry } from "../registry/index.ts";
import type { Command, CommandResult, OSConfig } from "../types/index.ts";
import type { Telemetry } from "../telemetry/index.ts";

interface DispatcherEvents {
  commandQueued: [command: Command];
  commandStarted: [command: Command];
  commandSuccess: [result: CommandResult];
  commandFailed: [result: CommandResult, command: Command];
  queueDrained: [];
}

export class SignalDispatcher extends EventEmitter<DispatcherEvents> {
  private readonly config: OSConfig["dispatcher"];
  private readonly bridge: BridgeCore;
  private readonly selector: SelectorEngine;
  private readonly registry: NodeRegistry;
  private readonly telemetry: Telemetry;

  // Priority queue: sorted by priority ASC (0 = highest)
  private queue: Command[] = [];
  private running = false;
  private activeCommands = new Map<string, Command>();

  constructor(
    config: OSConfig["dispatcher"],
    bridge: BridgeCore,
    selector: SelectorEngine,
    registry: NodeRegistry,
    telemetry: Telemetry
  ) {
    super();
    this.config = config;
    this.bridge = bridge;
    this.selector = selector;
    this.registry = registry;
    this.telemetry = telemetry;
  }

  // ─── Public API ───────────────────────────────────────────

  enqueue(partial: Omit<Command, "id" | "createdAt" | "retryCount">): Command {
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error(`Dispatcher queue full (max=${this.config.maxQueueSize})`);
    }

    const command: Command = {
      ...partial,
      id: randomUUID(),
      createdAt: Date.now(),
      retryCount: 0,
      maxRetries: partial.maxRetries ?? this.config.defaultMaxRetries,
      priority: partial.priority ?? 5,
      timeout: partial.timeout ?? 30_000,
    };

    this.insertSorted(command);
    this.emit("commandQueued", command);
    this.telemetry.debug("dispatcher", `Queued ${command.type}`, {
      id: command.id.slice(0, 8),
      priority: command.priority,
      queueLen: this.queue.length,
    });

    if (!this.running) this.drain();
    return command;
  }

  /** Convenience: click a node by UUID */
  click(uuid: string, tabId: string, opts?: Partial<Command>): Command {
    return this.enqueue({ type: "click", targetUuid: uuid, tabId, ...opts });
  }

  /** Convenience: type into a node by UUID */
  type(uuid: string, tabId: string, text: string, opts?: Partial<Command>): Command {
    return this.enqueue({
      type: "type",
      targetUuid: uuid,
      tabId,
      payload: { text },
      ...opts,
    });
  }

  /** Convenience: evaluate JS in a tab */
  evaluate(tabId: string, expression: string, opts?: Partial<Command>): Command {
    return this.enqueue({
      type: "evaluate",
      tabId,
      payload: { expression },
      ...opts,
    });
  }

  /** Convenience: navigate a tab to URL */
  navigate(tabId: string, url: string, opts?: Partial<Command>): Command {
    return this.enqueue({
      type: "navigate",
      tabId,
      payload: { url },
      priority: 0,
      ...opts,
    });
  }

  queueLength(): number {
    return this.queue.length;
  }

  activeCount(): number {
    return this.activeCommands.size;
  }

  // ─── Queue Drain ──────────────────────────────────────────

  private async drain(): Promise<void> {
    this.running = true;

    while (this.queue.length > 0) {
      const command = this.queue.shift()!;
      this.activeCommands.set(command.id, command);
      this.emit("commandStarted", command);

      const result = await this.execute(command);

      this.activeCommands.delete(command.id);

      if (result.success) {
        this.emit("commandSuccess", result);
      } else if (command.retryCount < command.maxRetries) {
        // Requeue with incremented retryCount
        const retry: Command = { ...command, retryCount: command.retryCount + 1 };
        const delay = this.config.retryDelayMs * Math.pow(2, retry.retryCount - 1);

        this.telemetry.warn("dispatcher", `Retry ${retry.retryCount}/${retry.maxRetries} for ${retry.type}`, {
          id: retry.id.slice(0, 8),
          delayMs: delay,
        });

        await sleep(delay);
        this.insertSorted(retry);
      } else {
        this.emit("commandFailed", result, command);
        this.telemetry.error("dispatcher", `Command failed permanently: ${command.type}`, {
          id: command.id.slice(0, 8),
          error: result.error,
        });
      }
    }

    this.running = false;
    this.emit("queueDrained");
  }

  // ─── Execution ────────────────────────────────────────────

  private async execute(command: Command): Promise<CommandResult> {
    const start = Date.now();

    try {
      const sessionId = this.bridge.getSession(command.tabId);
      if (!sessionId) {
        return this.fail(command, start, `No session for tab ${command.tabId}`);
      }

      // Resolve target node if command requires one
      let nodeId: number | undefined;
      if (command.targetUuid) {
        const resolution = await this.selector.resolve(command.targetUuid, sessionId);
        if (!resolution.found || !resolution.nodeId) {
          return this.fail(command, start, `Node resolution failed for ${command.targetUuid}`);
        }
        nodeId = resolution.nodeId;
      }

      const data = await this.route(command, sessionId, nodeId);

      return {
        commandId: command.id,
        success: true,
        data,
        durationMs: Date.now() - start,
        attempt: command.retryCount + 1,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.fail(command, start, msg);
    }
  }

  // ─── Command Routing ──────────────────────────────────────

  private async route(
    command: Command,
    sessionId: string,
    nodeId?: number
  ): Promise<unknown> {
    switch (command.type) {
      case "click":
        return this.execClick(sessionId, nodeId!, command);

      case "type":
        return this.execType(sessionId, nodeId!, command);

      case "hover":
        return this.execHover(sessionId, nodeId!, command);

      case "scroll":
        return this.execScroll(sessionId, nodeId, command);

      case "evaluate":
        return this.execEvaluate(sessionId, command);

      case "navigate":
        return this.execNavigate(sessionId, command);

      case "screenshot":
        return this.execScreenshot(sessionId, command);

      case "getAttribute":
        return this.execGetAttribute(sessionId, nodeId!, command);

      case "getProperty":
        return this.execGetProperty(sessionId, nodeId!, command);

      case "waitForSelector":
        return this.execWaitForSelector(sessionId, command);

      default:
        throw new Error(`Unknown command type: ${(command as Command).type}`);
    }
  }

  // ─── CDP Primitives ───────────────────────────────────────

  private async execClick(
    sessionId: string,
    nodeId: number,
    _command: Command
  ): Promise<unknown> {
    // Resolve to DOM coordinates via node bounding box
    const box = await this.bridge.send<{
      model: { content: number[] };
    }>("DOM.getBoxModel", { nodeId }, sessionId);

    const content = box.model.content;
    const cx = (content[0] + content[2]) / 2;
    const cy = (content[1] + content[5]) / 2;

    await this.bridge.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: cx, y: cy, button: "none", clickCount: 0 },
      sessionId
    );
    await this.bridge.send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 },
      sessionId
    );
    await this.bridge.send(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 },
      sessionId
    );

    return { cx, cy };
  }

  private async execType(
    sessionId: string,
    nodeId: number,
    command: Command
  ): Promise<unknown> {
    const text = (command.payload?.text as string) ?? "";

    // Focus the element first
    await this.bridge.send("DOM.focus", { nodeId }, sessionId);

    for (const char of text) {
      await this.bridge.send(
        "Input.dispatchKeyEvent",
        { type: "keyDown", text: char },
        sessionId
      );
      await this.bridge.send(
        "Input.dispatchKeyEvent",
        { type: "keyUp", text: char },
        sessionId
      );
    }

    return { typed: text.length };
  }

  private async execHover(
    sessionId: string,
    nodeId: number,
    _command: Command
  ): Promise<unknown> {
    const box = await this.bridge.send<{ model: { content: number[] } }>(
      "DOM.getBoxModel",
      { nodeId },
      sessionId
    );
    const content = box.model.content;
    const cx = (content[0] + content[2]) / 2;
    const cy = (content[1] + content[5]) / 2;

    await this.bridge.send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", x: cx, y: cy, button: "none", clickCount: 0 },
      sessionId
    );

    return { cx, cy };
  }

  private async execScroll(
    sessionId: string,
    nodeId: number | undefined,
    command: Command
  ): Promise<unknown> {
    const deltaY = (command.payload?.deltaY as number) ?? 300;

    if (nodeId) {
      const box = await this.bridge.send<{ model: { content: number[] } }>(
        "DOM.getBoxModel",
        { nodeId },
        sessionId
      );
      const content = box.model.content;
      const cx = (content[0] + content[2]) / 2;
      const cy = (content[1] + content[5]) / 2;

      await this.bridge.send(
        "Input.dispatchMouseEvent",
        { type: "mouseWheel", x: cx, y: cy, deltaX: 0, deltaY },
        sessionId
      );
    } else {
      await this.bridge.send(
        "Input.dispatchMouseEvent",
        { type: "mouseWheel", x: 400, y: 400, deltaX: 0, deltaY },
        sessionId
      );
    }

    return { deltaY };
  }

  private async execEvaluate(sessionId: string, command: Command): Promise<unknown> {
    const expression = (command.payload?.expression as string) ?? "undefined";
    const result = await this.bridge.send<{ result: { value?: unknown; description?: string } }>(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId
    );
    return result.result?.value;
  }

  private async execNavigate(sessionId: string, command: Command): Promise<unknown> {
    const url = (command.payload?.url as string) ?? "about:blank";
    const result = await this.bridge.send<{ frameId: string; errorText?: string }>(
      "Page.navigate",
      { url },
      sessionId
    );
    if (result.errorText) throw new Error(`Navigation error: ${result.errorText}`);
    return { frameId: result.frameId };
  }

  private async execScreenshot(sessionId: string, _command: Command): Promise<unknown> {
    const result = await this.bridge.send<{ data: string }>(
      "Page.captureScreenshot",
      { format: "png", quality: 90 },
      sessionId
    );
    return { base64: result.data, format: "png" };
  }

  private async execGetAttribute(
    sessionId: string,
    nodeId: number,
    command: Command
  ): Promise<unknown> {
    const name = command.payload?.name as string;
    const result = await this.bridge.send<{ value: string }>(
      "DOM.getAttributeValue",
      { nodeId, name },
      sessionId
    );
    return result.value;
  }

  private async execGetProperty(
    sessionId: string,
    nodeId: number,
    command: Command
  ): Promise<unknown> {
    const prop = command.payload?.property as string;
    const resolveResult = await this.bridge.send<{ object: { objectId: string } }>(
      "DOM.resolveNode",
      { nodeId },
      sessionId
    );
    const objectId = resolveResult.object.objectId;

    const result = await this.bridge.send<{ result: { value?: unknown } }>(
      "Runtime.getProperties",
      { objectId, accessorPropertiesOnly: false, generatePreview: false },
      sessionId
    );

    return (result as unknown as { result: Array<{ name: string; value?: { value?: unknown } }> })
      .result.find((p) => p.name === prop)?.value?.value;
  }

  private async execWaitForSelector(sessionId: string, command: Command): Promise<unknown> {
    const selector = command.payload?.selector as string;
    const timeout = command.timeout ?? 10_000;
    const interval = 250;
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      try {
        const doc = await this.bridge.send<{ nodeId: number }>(
          "DOM.getDocument",
          { depth: 0 },
          sessionId
        );
        const result = await this.bridge.send<{ nodeId: number }>(
          "DOM.querySelector",
          { nodeId: doc.nodeId, selector },
          sessionId
        );
        if (result.nodeId && result.nodeId !== 0) {
          return { nodeId: result.nodeId, selector };
        }
      } catch {
        // keep polling
      }
      await sleep(interval);
    }

    throw new Error(`waitForSelector timeout: "${selector}" not found in ${timeout}ms`);
  }

  // ─── Helpers ──────────────────────────────────────────────

  private fail(command: Command, start: number, error: string): CommandResult {
    return {
      commandId: command.id,
      success: false,
      error,
      durationMs: Date.now() - start,
      attempt: command.retryCount + 1,
    };
  }

  private insertSorted(command: Command): void {
    let lo = 0;
    let hi = this.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.queue[mid].priority <= command.priority) lo = mid + 1;
      else hi = mid;
    }
    this.queue.splice(lo, 0, command);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
