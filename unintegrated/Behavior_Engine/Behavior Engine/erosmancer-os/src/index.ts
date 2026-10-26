// ============================================================
// ErosmancerOS — Orchestrator v2
// All 9 modules wired. One start(), one shutdown().
// ============================================================

import EventEmitter from "eventemitter3";
import { BridgeCore }       from "./bridge/index.ts";
import { NodeRegistry }     from "./registry/index.ts";
import { SelectorEngine }   from "./selector/index.ts";
import { SignalDispatcher } from "./dispatcher/index.ts";
import { Telemetry }        from "./telemetry/index.ts";
import { BehaviorEngine }   from "./behavior/index.ts";
import { RoutingEngine }    from "./routing/index.ts";
import { DOMObserver, ShadowDOMMapper } from "./observer/index.ts";
import {
  DEFAULT_CONFIG, BEHAVIOR_DEFAULTS,
  type OSConfig, type Node, type Tab, type Command, type CommandResult,
  type BridgeTarget, type BehaviorIntent, type BehaviorContext,
  type BehaviorProfileName, type ExecutionPlan, type SessionSnapshot,
  type RouteLevel, type DOMChange,
} from "./types/index.ts";

export type {
  Node, Tab, Command, CommandResult, BridgeTarget, OSConfig,
  BehaviorIntent, BehaviorContext, ExecutionPlan, BehaviorProfileName,
  SessionSnapshot, RouteLevel, DOMChange,
};
export { DEFAULT_CONFIG, BEHAVIOR_DEFAULTS };
export { BehaviorEngine, BEHAVIOR_PROFILES } from "./behavior/index.ts";
export { RoutingEngine }                     from "./routing/index.ts";
export { DOMObserver, ShadowDOMMapper }      from "./observer/index.ts";
export { Telemetry }                         from "./telemetry/index.ts";

interface OSEvents {
  ready:             [];
  shutdown:          [];
  "node:registered": [node: Node];
  "node:missing":    [uuid: string];
  "tab:opened":      [tab: Tab];
  "tab:closed":      [targetId: string];
  "command:success": [result: CommandResult];
  "command:failed":  [result: CommandResult, command: Command];
  "behavior:plan":   [plan: ExecutionPlan];
  "route:escalated": [from: RouteLevel, to: RouteLevel, reason: string];
  "dom:changed":     [change: DOMChange];
}

type FullConfig = OSConfig & typeof BEHAVIOR_DEFAULTS;

export class ErosmancerOS extends EventEmitter<OSEvents> {

  readonly telemetry:  Telemetry;
  readonly bridge:     BridgeCore;
  readonly registry:   NodeRegistry;
  readonly selector:   SelectorEngine;
  readonly dispatcher: SignalDispatcher;
  readonly behavior:   BehaviorEngine;
  readonly routing:    RoutingEngine;
  readonly observer:   DOMObserver;
  readonly shadow:     ShadowDOMMapper;

  private readonly config:  FullConfig;
  private initialized = false;

  constructor(config?: Partial<FullConfig>) {
    super();
    this.config = this.mergeConfig(config);

    this.telemetry  = new Telemetry(this.config.telemetry);
    this.bridge     = new BridgeCore(this.config.bridge, this.telemetry);
    this.registry   = new NodeRegistry(this.config.registry, this.telemetry);
    this.selector   = new SelectorEngine(
      this.config.selector, this.bridge, this.registry, this.telemetry
    );
    this.dispatcher = new SignalDispatcher(
      this.config.dispatcher, this.bridge, this.selector, this.registry, this.telemetry
    );
    this.behavior   = new BehaviorEngine(this.config.behavior, this.telemetry);
    this.routing    = new RoutingEngine(this.config.routing,  this.bridge, this.telemetry);
    this.observer   = new DOMObserver(
      this.config.observer, this.bridge, this.registry, this.telemetry
    );
    this.shadow     = new ShadowDOMMapper(this.bridge, this.registry, this.telemetry);

    this.wire();
  }

  // ─── Lifecycle ────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.initialized) return;
    this.telemetry.info("system", "ErosmancerOS starting...");
    await this.bridge.connect();
    await this.bridge.send("Target.setDiscoverTargets", { discover: true });
    this.initialized = true;
    this.telemetry.info("system", "ErosmancerOS ready ✓");
    this.emit("ready");
  }

  async shutdown(): Promise<void> {
    this.telemetry.info("system", "ErosmancerOS shutting down...");
    this.behavior.gc();
    await this.bridge.disconnect();
    this.registry.destroy();
    this.telemetry.destroy();
    this.initialized = false;
    this.emit("shutdown");
  }

  // ─── Tab API ─────────────────────────────────────────────

  async openTab(url?: string): Promise<Tab> {
    const targetId  = await this.bridge.openTab(url);
    const sessionId = await this.bridge.attachToTarget(targetId);
    const now       = new Date().toISOString();
    this.routing.registerSession(targetId, sessionId, "primary");
    if (this.config.observer.enabled) {
      await this.observer.watchTab(targetId, sessionId).catch(() => {});
    }
    return {
      tabId: targetId, targetId, url: url ?? "about:blank",
      role: "primary", state: "active", wsUrl: "",
      createdAt: now, lastActiveAt: now,
    };
  }

  async closeTab(tabId: string): Promise<void> {
    this.registry.evictTab(tabId);
    this.routing.deregisterSession(tabId);
    await this.bridge.closeTab(tabId);
  }

  async listTabs(): Promise<Array<{ targetId: string; url: string; title: string }>> {
    return this.bridge.listTargets();
  }

  async attachTab(targetId: string): Promise<string> {
    const sessionId = await this.bridge.attachToTarget(targetId);
    this.routing.registerSession(targetId, sessionId, "primary");
    if (this.config.observer.enabled) {
      await this.observer.watchTab(targetId, sessionId).catch(() => {});
    }
    return sessionId;
  }

  async attachShadowTab(targetId: string): Promise<string> {
    const sessionId = await this.bridge.attachToTarget(targetId);
    this.routing.registerSession(targetId, sessionId, "shadow");
    return sessionId;
  }

  // ─── Node API ────────────────────────────────────────────

  registerNode(input: Parameters<NodeRegistry["register"]>[0]): Node {
    return this.registry.register(input);
  }

  getNode(uuid: string):            Node | undefined { return this.registry.get(uuid); }
  getNodesByTab(tabId: string):     Node[]            { return this.registry.getByTab(tabId); }
  sweepStaleNodes():                void              { this.registry.sweepStale(); }

  async mapShadowDOM(tabId: string): Promise<number> {
    const sessionId = this.bridge.getSession(tabId);
    if (!sessionId) throw new Error(`No session for tab: ${tabId}`);
    return this.shadow.mapTab(tabId, sessionId);
  }

  // ─── Command API ─────────────────────────────────────────

  click(uuid: string, tabId: string): Command {
    return this.dispatcher.click(uuid, tabId);
  }
  type(uuid: string, tabId: string, text: string): Command {
    return this.dispatcher.type(uuid, tabId, text);
  }
  evaluate(tabId: string, expression: string): Command {
    return this.dispatcher.evaluate(tabId, expression);
  }
  navigate(tabId: string, url: string): Command {
    return this.dispatcher.navigate(tabId, url);
  }
  screenshot(tabId: string): Command {
    return this.dispatcher.enqueue({ type: "screenshot", tabId, priority: 1 });
  }
  scroll(uuid: string, tabId: string, deltaY = 300): Command {
    return this.dispatcher.enqueue({
      type: "scroll", targetUuid: uuid, tabId, payload: { deltaY }, priority: 5,
    });
  }
  waitForSelector(tabId: string, selector: string, timeoutMs = 10_000): Command {
    return this.dispatcher.enqueue({
      type: "waitForSelector", tabId, payload: { selector }, timeout: timeoutMs, priority: 2,
    });
  }

  // ─── Behavior API ────────────────────────────────────────

  planIntent(intent: BehaviorIntent, context: BehaviorContext): ExecutionPlan {
    return this.behavior.processIntent(intent, context, { sandbox: true });
  }
  setProfile(sessionId: string, profile: BehaviorProfileName): void {
    this.behavior.overrideProfile(sessionId, profile);
  }
  clearProfile(sessionId: string): void {
    this.behavior.clearOverride(sessionId);
  }
  sessionSnapshot(sessionId: string): SessionSnapshot | null {
    return this.behavior.sessionSnapshot(sessionId);
  }

  // ─── Routing API ─────────────────────────────────────────

  setRouteLevel(level: RouteLevel, reason?: string): void {
    this.routing.setLevel(level, reason ?? "manual");
  }
  get routeLevel(): RouteLevel { return this.routing.level; }

  // ─── Raw CDP ─────────────────────────────────────────────

  async cdp<T extends Record<string, unknown>>(
    tabId: string, method: string, params?: Record<string, unknown>
  ): Promise<T> {
    const sessionId = this.bridge.getSession(tabId);
    return this.bridge.send<T>(method, params, sessionId);
  }

  // ─── Status ──────────────────────────────────────────────

  status() {
    return {
      bridge:      this.bridge.getState(),
      nodes:       this.registry.size(),
      queue:       this.dispatcher.queueLength(),
      active:      this.dispatcher.activeCount(),
      routing:     this.routing.snapshot(),
      initialized: this.initialized,
    };
  }

  // ─── Wiring ──────────────────────────────────────────────

  private wire(): void {
    this.registry.on("node:registered", (n)    => this.emit("node:registered", n));
    this.registry.on("node:missing",    (uuid)  => this.emit("node:missing", uuid));

    this.bridge.on("tab:opened", (tab)         => this.emit("tab:opened", tab));
    this.bridge.on("tab:closed", (targetId)    => {
      this.registry.evictTab(targetId);
      this.routing.deregisterSession(targetId);
      this.emit("tab:closed", targetId);
    });

    this.dispatcher.on("commandSuccess", (r)    => this.emit("command:success", r));
    this.dispatcher.on("commandFailed",  (r, c) => this.emit("command:failed", r, c));

    this.behavior.on("plan:generated", (plan)           => this.emit("behavior:plan", plan));
    this.routing.on("route:escalated", (from, to, why)  => this.emit("route:escalated", from, to, why));
    this.observer.on("dom:changed",    (change)         => this.emit("dom:changed", change));

    this.bridge.on("reconnecting", (attempt) => {
      this.telemetry.warn("system", `Bridge reconnecting (attempt ${attempt})`);
      this.routing.setLevel("parallel", "bridge-reconnect");
    });
    this.bridge.on("connected", () => {
      setTimeout(() => {
        if (this.routing.level === "parallel") {
          this.routing.setLevel("direct", "bridge-recovered");
        }
      }, 5_000);
    });
    this.bridge.on("failed", (reason) => {
      this.telemetry.error("system", `Bridge failed permanently: ${reason}`);
    });
  }

  private mergeConfig(partial?: Partial<FullConfig>): FullConfig {
    const base: FullConfig = { ...DEFAULT_CONFIG, ...BEHAVIOR_DEFAULTS };
    if (!partial) return base;
    return {
      bridge:     { ...base.bridge,     ...partial.bridge     },
      registry:   { ...base.registry,   ...partial.registry   },
      selector:   { ...base.selector,   ...partial.selector   },
      dispatcher: { ...base.dispatcher, ...partial.dispatcher },
      telemetry:  { ...base.telemetry,  ...partial.telemetry  },
      behavior:   { ...base.behavior,   ...partial.behavior   },
      routing:    { ...base.routing,    ...partial.routing    },
      observer:   { ...base.observer,   ...partial.observer   },
    };
  }
}
