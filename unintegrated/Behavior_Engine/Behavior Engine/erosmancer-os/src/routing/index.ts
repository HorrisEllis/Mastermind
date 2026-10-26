// ============================================================
// ErosmancerOS — Routing Engine
//
// The nervous system. Every command flows through a routing
// decision before execution.
//
// Three levels:
//   direct    → primary tab only (default)
//   parallel  → primary + secondary socket simultaneously
//   redundant → primary + proxy tab; compare results; flag mismatch
//
// Strategy switching:
//   Rule-based thresholds → profile escalation signals
//   Event-driven → error/timeout triggers reroute
//   Scheduled   → cycle every N commands for stealth
// ============================================================

import EventEmitter from "eventemitter3";
import type {
  RouteLevel,
  RouteTarget,
  RoutingDecision,
  RouteResult,
  OSConfig,
} from "../types/index.ts";
import type { BridgeCore } from "../bridge/index.ts";
import type { Telemetry } from "../telemetry/index.ts";

interface RouteSession {
  tabId:      string;
  sessionId:  string;
  role:       RouteTarget["role"];
  errorCount: number;
  cmdCount:   number;
  lastUsed:   number;
}

interface RoutingEvents {
  "route:decided":    [decision: RoutingDecision];
  "route:mismatch":   [primary: unknown, secondary: unknown];
  "route:escalated":  [from: RouteLevel, to: RouteLevel, reason: string];
  "route:deescalated":[from: RouteLevel, to: RouteLevel];
}

export class RoutingEngine extends EventEmitter<RoutingEvents> {
  private readonly config:    OSConfig["routing"];
  private readonly bridge:    BridgeCore;
  private readonly telemetry: Telemetry;

  private sessions    = new Map<string, RouteSession>();
  private currentLevel: RouteLevel;
  private cmdsSinceSwitch = 0;
  private readonly SCHEDULE_INTERVAL = 80;  // cycle after N commands

  constructor(
    config:    OSConfig["routing"],
    bridge:    BridgeCore,
    telemetry: Telemetry
  ) {
    super();
    this.config       = config;
    this.bridge       = bridge;
    this.telemetry    = telemetry;
    this.currentLevel = config.defaultLevel;
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Register a tab with the router.
   * Must be called before routing commands to that tab.
   */
  registerSession(
    tabId:     string,
    sessionId: string,
    role:      RouteTarget["role"] = "primary"
  ): void {
    this.sessions.set(tabId, {
      tabId,
      sessionId,
      role,
      errorCount: 0,
      cmdCount:   0,
      lastUsed:   Date.now(),
    });
    this.telemetry.info("system", `Route session registered [${role}]`, { tabId, sessionId });
  }

  deregisterSession(tabId: string): void {
    this.sessions.delete(tabId);
  }

  /**
   * Decide how to route a command for a given tabId.
   * Returns a RoutingDecision with primary (and optional secondary) targets.
   */
  decide(
    tabId:    string,
    context?: { detectionRisk?: number; errorRate?: number }
  ): RoutingDecision {
    const primary = this.sessions.get(tabId);
    if (!primary) {
      throw new Error(`[RoutingEngine] No session for tabId: ${tabId}`);
    }

    // Auto-escalate based on signals
    this.maybeEscalate(context ?? {});

    // Scheduled cycling for stealth
    this.cmdsSinceSwitch++;
    if (this.cmdsSinceSwitch >= this.SCHEDULE_INTERVAL) {
      this.cmdsSinceSwitch = 0;
      // Brief deescalate to break pattern predictability
      if (this.currentLevel === "redundant") {
        this.setLevel("parallel", "scheduled-cycle");
      }
    }

    const primaryTarget: RouteTarget = {
      tabId:     primary.tabId,
      sessionId: primary.sessionId,
      role:      primary.role,
      priority:  0,
    };

    let level     = this.currentLevel;
    let secondary: RouteTarget | undefined;

    if (level !== "direct") {
      // Find a shadow/proxy session if available
      const shadowSession = [...this.sessions.values()].find(
        (s) => s.tabId !== tabId && (s.role === "shadow" || s.role === "proxy")
      );

      if (shadowSession) {
        secondary = {
          tabId:     shadowSession.tabId,
          sessionId: shadowSession.sessionId,
          role:      shadowSession.role,
          priority:  1,
        };
      } else {
        // No shadow tab — fall back to direct even if level is higher
        level    = "direct";
      }
    }

    const decision: RoutingDecision = {
      level,
      primary: primaryTarget,
      secondary,
      reason:  this.levelReason(level),
    };

    this.emit("route:decided", decision);
    return decision;
  }

  /**
   * Execute a command through a routing decision.
   * Handles parallel/redundant execution and mismatch detection.
   *
   * @param decision - from decide()
   * @param exec     - function that sends a command to a sessionId and returns result
   */
  async execute(
    decision: RoutingDecision,
    exec: (sessionId: string) => Promise<unknown>
  ): Promise<RouteResult> {
    const start = Date.now();

    try {
      if (decision.level === "direct" || !decision.secondary) {
        const result = await exec(decision.primary.sessionId);
        this.recordSuccess(decision.primary.tabId);
        return {
          success:    true,
          level:      decision.level,
          primary:    result,
          durationMs: Date.now() - start,
        };
      }

      // Parallel / redundant: fire both
      const [primaryResult, secondaryResult] = await Promise.allSettled([
        exec(decision.primary.sessionId),
        exec(decision.secondary.sessionId),
      ]);

      const primaryOk   = primaryResult.status === "fulfilled";
      const secondaryOk = secondaryResult.status === "fulfilled";

      const primaryVal   = primaryOk   ? primaryResult.value   : null;
      const secondaryVal = secondaryOk ? secondaryResult.value : null;

      // Mismatch detection for redundant mode
      let mismatch = false;
      if (
        decision.level === "redundant" &&
        primaryOk && secondaryOk &&
        this.isMismatch(primaryVal, secondaryVal)
      ) {
        mismatch = true;
        this.emit("route:mismatch", primaryVal, secondaryVal);
        this.telemetry.warn("system", "Redundant route mismatch detected", {
          primary:   JSON.stringify(primaryVal).slice(0, 100),
          secondary: JSON.stringify(secondaryVal).slice(0, 100),
        });
        // Auto-escalate: something is inconsistent
        this.setLevel("redundant", "mismatch");
      }

      if (primaryOk) {
        this.recordSuccess(decision.primary.tabId);
      } else {
        this.recordError(decision.primary.tabId);
        // Primary failed — fall back to secondary result
        if (secondaryOk) {
          this.telemetry.warn("system", "Primary route failed, secondary succeeded", {
            error: (primaryResult as PromiseRejectedResult).reason?.message,
          });
          return {
            success:    true,
            level:      decision.level,
            primary:    secondaryVal,
            secondary:  secondaryVal,
            mismatch:   false,
            durationMs: Date.now() - start,
          };
        }
        // Both failed
        throw new Error(
          `Both routes failed. Primary: ${(primaryResult as PromiseRejectedResult).reason?.message}`
        );
      }

      return {
        success:    true,
        level:      decision.level,
        primary:    primaryVal,
        secondary:  secondaryVal,
        mismatch,
        durationMs: Date.now() - start,
      };

    } catch (err) {
      this.recordError(decision.primary.tabId);
      return {
        success:    false,
        level:      decision.level,
        durationMs: Date.now() - start,
      };
    }
  }

  /**
   * Manually force routing level.
   */
  setLevel(level: RouteLevel, reason = "manual"): void {
    if (level === this.currentLevel) return;
    const prev          = this.currentLevel;
    this.currentLevel   = level;
    this.cmdsSinceSwitch = 0;

    if (
      (prev === "direct" && level !== "direct") ||
      (prev === "parallel" && level === "redundant")
    ) {
      this.emit("route:escalated", prev, level, reason);
    } else {
      this.emit("route:deescalated", prev, level);
    }

    this.telemetry.info("system", `Route level: ${prev} → ${level} [${reason}]`);
  }

  get level(): RouteLevel { return this.currentLevel; }

  snapshot(): {
    level: RouteLevel;
    sessions: number;
    cmdsSinceSwitch: number;
  } {
    return {
      level:            this.currentLevel,
      sessions:         this.sessions.size,
      cmdsSinceSwitch:  this.cmdsSinceSwitch,
    };
  }

  // ─── Internal ──────────────────────────────────────────────

  private maybeEscalate(ctx: { detectionRisk?: number; errorRate?: number }): void {
    const { detectionRisk = 0, errorRate = 0 } = ctx;

    if (detectionRisk > 0.75 && this.currentLevel === "direct") {
      this.setLevel("parallel", "detection-risk");
    }

    if (detectionRisk > 0.90 && this.currentLevel === "parallel") {
      this.setLevel("redundant", "high-detection-risk");
    }

    if (errorRate > 0.40 && this.currentLevel === "direct") {
      this.setLevel("parallel", "high-error-rate");
    }

    // Auto-deescalate on calm conditions
    if (detectionRisk < 0.15 && errorRate < 0.05 && this.currentLevel !== "direct") {
      if (this.cmdsSinceSwitch > 40) {
        this.setLevel("direct", "conditions-normalized");
      }
    }
  }

  private isMismatch(a: unknown, b: unknown): boolean {
    // Deep compare serialized results — flag if structurally different
    try {
      const aStr = JSON.stringify(a ?? null);
      const bStr = JSON.stringify(b ?? null);
      // Simple check: if both non-null and very different lengths → mismatch
      if (aStr === bStr) return false;
      const ratio = Math.abs(aStr.length - bStr.length) / Math.max(aStr.length, bStr.length, 1);
      return ratio > this.config.mismatchThreshold;
    } catch {
      return false;
    }
  }

  private recordSuccess(tabId: string): void {
    const s = this.sessions.get(tabId);
    if (s) { s.cmdCount++; s.lastUsed = Date.now(); }
  }

  private recordError(tabId: string): void {
    const s = this.sessions.get(tabId);
    if (s) { s.errorCount++; s.lastUsed = Date.now(); }
  }

  private levelReason(level: RouteLevel): string {
    const reasons: Record<RouteLevel, string> = {
      direct:    "nominal",
      parallel:  "elevated-risk",
      redundant: "high-risk-verify",
    };
    return reasons[level];
  }
}
