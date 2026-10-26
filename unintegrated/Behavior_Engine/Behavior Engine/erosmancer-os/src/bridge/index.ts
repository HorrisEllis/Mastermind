// ============================================================
// ErosmancerOS — Bridge Core (continued)
// Completes the BridgeCore class from bridge/core.ts
// This file exports the complete, unified BridgeCore.
// ============================================================

import WebSocket from "ws";
import EventEmitter from "eventemitter3";
import type {
  BridgeTarget,
  CDPMessage,
  CDPResponse,
  CDPEvent,
  ConnectionState,
  OSConfig,
  Tab,
} from "../types/index.ts";
import type { Telemetry } from "../telemetry/index.ts";

interface PendingCommand {
  resolve: (result: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface BridgeEvents {
  connected: [];
  disconnected: [reason: string];
  reconnecting: [attempt: number];
  failed: [reason: string];
  event: [event: CDPEvent];
  "tab:opened": [tab: Tab];
  "tab:closed": [targetId: string];
}

export class BridgeCore extends EventEmitter<BridgeEvents> {
  private readonly config: OSConfig["bridge"];
  private readonly telemetry: Telemetry;

  private ws: WebSocket | null = null;
  private _state: ConnectionState = "disconnected";
  private msgId = 0;
  private pending = new Map<number, PendingCommand>();
  private sessions = new Map<string, string>();   // targetId → CDP sessionId
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private browserWsUrl: string | null = null;

  constructor(config: OSConfig["bridge"], telemetry: Telemetry) {
    super();
    this.config = config;
    this.telemetry = telemetry;
  }

  // ─── Public API ────────────────────────────────────────────

  getState(): ConnectionState {
    return this._state;
  }

  async connect(): Promise<void> {
    if (this._state === "connected" || this._state === "connecting") return;
    this.setState("connecting");
    this.browserWsUrl = await this.resolveBrowserWsUrl();
    await this.openSocket(this.browserWsUrl);
  }

  async disconnect(): Promise<void> {
    this.stopPing();
    this.setState("disconnected");
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
    this.rejectAllPending("Bridge disconnected");
    this.telemetry.info("bridge", "Disconnected cleanly");
  }

  /**
   * Send a raw CDP command. Returns the result or throws on error/timeout.
   * sessionId routes to a specific tab's CDP session.
   */
  async send<T extends Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
    sessionId?: string
  ): Promise<T> {
    if (this._state !== "connected") {
      throw new Error(`Bridge not connected (state=${this._state})`);
    }

    const id = ++this.msgId;
    const msg: CDPMessage = { id, method };
    if (params) msg.params = params;
    if (sessionId) msg.sessionId = sessionId;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method} (id=${id})`));
      }, this.config.commandTimeoutMs);

      this.pending.set(id, {
        resolve: resolve as (r: Record<string, unknown>) => void,
        reject,
        timer,
      });

      try {
        this.ws!.send(JSON.stringify(msg));
        this.telemetry.debug("bridge", `→ ${method}`, { id, sessionId });
      } catch (err) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(err as Error);
      }
    });
  }

  /**
   * Attach to a CDP target (a tab) and return its sessionId.
   * Subsequent commands for that tab use this sessionId.
   */
  async attachToTarget(targetId: string): Promise<string> {
    const result = await this.send<{ sessionId: string }>("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    this.sessions.set(targetId, result.sessionId);
    this.telemetry.info("bridge", `Attached → ${targetId}`, { sessionId: result.sessionId });
    return result.sessionId;
  }

  getSession(targetId: string): string | undefined {
    return this.sessions.get(targetId);
  }

  /** List all page-type targets in the browser. */
  async listTargets(): Promise<
    Array<{ targetId: string; url: string; title: string; type: string }>
  > {
    const r = await this.send<{
      targetInfos: Array<{ targetId: string; url: string; title: string; type: string }>;
    }>("Target.getTargets");
    return r.targetInfos.filter((t) => t.type === "page");
  }

  /** Open a new tab, returns targetId. */
  async openTab(url = "about:blank"): Promise<string> {
    const r = await this.send<{ targetId: string }>("Target.createTarget", { url });
    this.telemetry.info("bridge", `Tab opened → ${r.targetId}`, { url });
    return r.targetId;
  }

  /** Close a tab by targetId. */
  async closeTab(targetId: string): Promise<void> {
    await this.send("Target.closeTarget", { targetId });
    this.sessions.delete(targetId);
    this.telemetry.info("bridge", `Tab closed → ${targetId}`);
  }

  // ─── URL Resolution ────────────────────────────────────────

  private async resolveBrowserWsUrl(): Promise<string> {
    const target = this.config.target;

    if (target.type === "remote") {
      this.telemetry.info("bridge", "Remote WS target", { url: target.wsUrl });
      return target.wsUrl;
    }

    const host = target.host ?? "localhost";
    const port = target.port;
    const endpoint = `http://${host}:${port}/json/version`;

    this.telemetry.info("bridge", `Probing local CDP at ${endpoint}`);

    const resp = await fetch(endpoint);
    if (!resp.ok) {
      throw new Error(`CDP probe failed: ${resp.status} ${resp.statusText} at ${endpoint}`);
    }

    const json = (await resp.json()) as { webSocketDebuggerUrl?: string };
    if (!json.webSocketDebuggerUrl) {
      throw new Error("CDP version endpoint returned no webSocketDebuggerUrl");
    }

    this.telemetry.info("bridge", "Local WS URL resolved", { url: json.webSocketDebuggerUrl });
    return json.webSocketDebuggerUrl;
  }

  // ─── Socket Lifecycle ─────────────────────────────────────

  private async openSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;

      ws.once("open", () => {
        this.reconnectAttempts = 0;
        this.setState("connected");
        this.startPing();
        this.telemetry.info("bridge", "WS open", { url });
        resolve();
      });

      ws.on("close", (code, reason) => {
        this.stopPing();
        const msg = `WS closed code=${code} reason=${reason.toString()}`;
        this.telemetry.warn("bridge", msg);
        this.rejectAllPending("WebSocket closed");
        if (this._state !== "disconnected") {
          this.scheduleReconnect();
        }
      });

      ws.on("error", (err) => {
        this.telemetry.error("bridge", "WS error", { message: err.message });
        if (this._state === "connecting") {
          reject(err);
        }
      });

      ws.on("message", (raw) => {
        this.handleMessage(raw.toString());
      });
    });
  }

  // ─── Message Routing ──────────────────────────────────────

  private handleMessage(raw: string): void {
    let msg: CDPResponse & Partial<CDPEvent>;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.telemetry.warn("bridge", "Unparseable WS message", { raw: raw.slice(0, 300) });
      return;
    }

    // Command response — has numeric id
    if (typeof msg.id === "number") {
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(msg.id);

      if (msg.error) {
        pending.reject(
          new Error(`CDP [${msg.error.code}]: ${msg.error.message}`)
        );
      } else {
        pending.resolve((msg.result ?? {}) as Record<string, unknown>);
      }
      return;
    }

    // CDP event — has method string
    if (typeof msg.method === "string") {
      const event: CDPEvent = {
        method: msg.method,
        params: (msg.params ?? {}) as Record<string, unknown>,
        sessionId: msg.sessionId,
      };
      this.telemetry.debug("bridge", `← ${event.method}`, { sessionId: event.sessionId });
      this.emit("event", event);
      this.routeLifecycleEvent(event);
    }
  }

  private routeLifecycleEvent(event: CDPEvent): void {
    if (event.method === "Target.targetCreated") {
      const info = event.params.targetInfo as {
        targetId: string; url: string; title: string; type: string;
      };
      if (info?.type === "page") {
        const now = new Date().toISOString();
        const tab: Tab = {
          tabId: info.targetId,
          targetId: info.targetId,
          url: info.url,
          title: info.title ?? "",
          role: "primary",
          state: "active",
          wsUrl: this.browserWsUrl ?? "",
          createdAt: now,
          lastActiveAt: now,
        };
        this.emit("tab:opened", tab);
      }
    }

    if (event.method === "Target.targetDestroyed") {
      const targetId = event.params.targetId as string;
      if (targetId) {
        this.sessions.delete(targetId);
        this.emit("tab:closed", targetId);
      }
    }
  }

  // ─── Reconnect ────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.setState("failed");
      this.emit("failed", "Max reconnect attempts exceeded");
      this.telemetry.error("bridge", "Reconnect abandoned — ceiling hit");
      return;
    }

    this.reconnectAttempts++;
    // Exponential backoff capped at 30s
    const delay = Math.min(
      this.config.reconnectDelayMs * Math.pow(1.5, this.reconnectAttempts - 1),
      30_000
    );

    this.setState("reconnecting");
    this.emit("reconnecting", this.reconnectAttempts);
    this.telemetry.warn("bridge", `Reconnect attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(async () => {
      try {
        if (!this.browserWsUrl) {
          this.browserWsUrl = await this.resolveBrowserWsUrl();
        }
        await this.openSocket(this.browserWsUrl);
      } catch (err) {
        this.telemetry.error("bridge", "Reconnect attempt failed", { err });
        this.scheduleReconnect();
      }
    }, delay);
  }

  // ─── Ping ─────────────────────────────────────────────────

  private startPing(): void {
    this.pingTimer = setInterval(async () => {
      try {
        await this.send("Browser.getVersion");
        this.telemetry.debug("bridge", "Ping ✓");
      } catch {
        this.telemetry.warn("bridge", "Ping miss — socket may be dead");
      }
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  private setState(next: ConnectionState): void {
    this._state = next;
    if (next === "connected") this.emit("connected");
    if (next === "disconnected") this.emit("disconnected", "manual");
  }

  private rejectAllPending(reason: string): void {
    for (const [id, cmd] of this.pending) {
      clearTimeout(cmd.timer);
      cmd.reject(new Error(reason));
      this.pending.delete(id);
    }
  }
}
