// ============================================================
// ErosmancerOS — Behavior Engine
//
// Sandboxed transform layer: intent → execution plan.
// NEVER touches DOM. NEVER sends CDP commands.
// NEVER mutates registry or selectors.
//
// It only answers: HOW should this action happen?
//
// Pipeline:
//   BehaviorIntent → ProfileSelection → VariantSelection
//   → StepDecomposition → TimingModel → VarianceInjection
//   → ExecutionPlan
// ============================================================

import { randomUUID } from "crypto";
import EventEmitter from "eventemitter3";
import type {
  BehaviorIntent,
  BehaviorContext,
  BehaviorProfile,
  BehaviorProfileName,
  ExecutionPlan,
  ExecutionStep,
  ExecutionVariant,
  TimingModel,
  VarianceConfig,
  SessionSnapshot,
  OSConfig,
} from "../types/index.ts";
import type { Telemetry } from "../telemetry/index.ts";

// ─── Math Primitives ─────────────────────────────────────────

/** Box-Muller transform → normal distribution sample */
function normalSample(mu: number, sigma: number): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function randBetween(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Weighted random pick */
function weightedPick<T extends string>(weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((s, [, w]) => s + (w ?? 0), 0);
  let r = Math.random() * total;
  for (const [key, weight] of entries) {
    r -= weight ?? 0;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** Cubic Bezier point at t ∈ [0,1] */
function bezierPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt ** 3 * p0.x + 3 * mt ** 2 * t * p1.x + 3 * mt * t ** 2 * p2.x + t ** 3 * p3.x,
    y: mt ** 3 * p0.y + 3 * mt ** 2 * t * p1.y + 3 * mt * t ** 2 * p2.y + t ** 3 * p3.y,
  };
}

// ─── Profiles ────────────────────────────────────────────────

export const BEHAVIOR_PROFILES: Record<BehaviorProfileName, BehaviorProfile> = {
  precise: {
    name:             "precise",
    baseDelayMu:      115,
    baseDelaySigma:   22,
    hesitationRate:   0.05,
    correctionRate:   0.02,
    hoverProbability: 0.10,
    movementStyle:    "direct",
    variantWeights:   { direct: 0.72, hover: 0.20, stepwise: 0.08 },
  },
  cautious: {
    name:             "cautious",
    baseDelayMu:      260,
    baseDelaySigma:   65,
    hesitationRate:   0.22,
    correctionRate:   0.09,
    hoverProbability: 0.48,
    movementStyle:    "curved",
    variantWeights:   { direct: 0.18, hover: 0.52, stepwise: 0.30 },
  },
  exploratory: {
    name:             "exploratory",
    baseDelayMu:      400,
    baseDelaySigma:   120,
    hesitationRate:   0.45,
    correctionRate:   0.28,
    hoverProbability: 0.78,
    movementStyle:    "noisy",
    variantWeights:   { direct: 0.05, hover: 0.32, stepwise: 0.38, miss: 0.25 },
  },
  turbo: {
    name:             "turbo",
    baseDelayMu:      35,
    baseDelaySigma:   8,
    hesitationRate:   0.01,
    correctionRate:   0.003,
    hoverProbability: 0.02,
    movementStyle:    "direct",
    variantWeights:   { direct: 0.96, hover: 0.04 },
  },
};

// ─── Session State ────────────────────────────────────────────

class SessionState {
  readonly sessionId: string;
  actionCount = 0;
  readonly startedAt: number;
  lastProfile: BehaviorProfileName = "precise";
  private errorWindow: boolean[] = [];  // true = error, ring buffer 20

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startedAt = Date.now();
  }

  get elapsedMs(): number  { return Date.now() - this.startedAt; }
  get elapsedSec(): number { return this.elapsedMs / 1_000; }

  /** Fatigue 0→1 rising logarithmically with elapsed time */
  get fatigue(): number {
    return clamp(Math.log1p(this.elapsedSec / 60) / 4.2, 0, 1);
  }

  get errorRate(): number {
    if (!this.errorWindow.length) return 0;
    return this.errorWindow.filter(Boolean).length / this.errorWindow.length;
  }

  record(success: boolean): void {
    this.actionCount++;
    this.errorWindow.push(!success);
    if (this.errorWindow.length > 20) this.errorWindow.shift();
  }

  snapshot(): SessionSnapshot {
    return {
      sessionId:   this.sessionId,
      actionCount: this.actionCount,
      elapsedSec:  Math.round(this.elapsedSec),
      fatigue:     this.fatigue,
      errorRate:   this.errorRate,
      lastProfile: this.lastProfile,
    };
  }
}

// ─── Behavior Engine ─────────────────────────────────────────

interface BehaviorEvents {
  "plan:generated": [plan: ExecutionPlan];
  "outcome:recorded": [sessionId: string, success: boolean, errorRate: number];
  "profile:override": [sessionId: string, profile: BehaviorProfileName];
}

export class BehaviorEngine extends EventEmitter<BehaviorEvents> {
  private readonly config: OSConfig["behavior"];
  private readonly telemetry: Telemetry;

  private sessions  = new Map<string, SessionState>();
  private overrides = new Map<string, BehaviorProfileName>();

  constructor(config: OSConfig["behavior"], telemetry: Telemetry) {
    super();
    this.config    = config;
    this.telemetry = telemetry;
  }

  // ─── Public API ────────────────────────────────────────────

  /**
   * Core entry point.
   * Pure function from the OS's perspective — no side effects on DOM or bridge.
   */
  processIntent(
    intent:  BehaviorIntent,
    context: BehaviorContext,
    options: { sandbox?: boolean } = {}
  ): ExecutionPlan {
    this.validate(intent, context);

    const session     = this.getOrCreateSession(context.sessionId);
    const profileName = this.selectProfile(context, session);
    const profile     = BEHAVIOR_PROFILES[profileName];

    session.lastProfile = profileName;

    const variant  = this.selectVariant(intent, profile);
    const steps    = this.decompose(intent, profile, variant);
    const timing   = this.buildTimingModel(profile, session);
    const variance = this.buildVariance(profile, session, context);

    const plan: ExecutionPlan = {
      planId:   `plan-${randomUUID()}`,
      intentId: intent.id,
      profile:  profileName,
      variant,
      steps,
      timing,
      variance,
      sandbox:  options.sandbox ?? this.config.sandboxByDefault,
      meta: {
        confidence:     this.computeConfidence(profile, session, context),
        sessionFatigue: session.fatigue,
        errorRate:      session.errorRate,
      },
    };

    this.emit("plan:generated", plan);

    this.telemetry.debug("system", `Plan generated [${profileName}/${variant}]`, {
      planId:    plan.planId,
      intentId:  intent.id,
      steps:     steps.length,
      sandbox:   plan.sandbox,
    });

    return plan;
  }

  /** Record execution outcome — feeds session error rate and fatigue */
  recordOutcome(sessionId: string, success: boolean): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.record(success);
    this.emit("outcome:recorded", sessionId, success, session.errorRate);
  }

  /** Force a specific profile for a session */
  overrideProfile(sessionId: string, profile: BehaviorProfileName): void {
    if (!BEHAVIOR_PROFILES[profile]) {
      throw new Error(`[BehaviorEngine] Unknown profile: ${profile}`);
    }
    this.overrides.set(sessionId, profile);
    this.emit("profile:override", sessionId, profile);
    this.telemetry.info("system", `Profile override → ${profile}`, { sessionId });
  }

  clearOverride(sessionId: string): void {
    this.overrides.delete(sessionId);
  }

  sessionSnapshot(sessionId: string): SessionSnapshot | null {
    return this.sessions.get(sessionId)?.snapshot() ?? null;
  }

  availableProfiles(): BehaviorProfileName[] {
    return Object.keys(BEHAVIOR_PROFILES) as BehaviorProfileName[];
  }

  /** Purge sessions older than maxSessionAgeMs */
  gc(): number {
    const cutoff = Date.now() - this.config.maxSessionAgeMs;
    let removed  = 0;
    for (const [id, sess] of this.sessions) {
      if (sess.startedAt < cutoff) {
        this.sessions.delete(id);
        this.overrides.delete(id);
        removed++;
      }
    }
    if (removed > 0) {
      this.telemetry.debug("system", `BehaviorEngine GC: ${removed} sessions purged`);
    }
    return removed;
  }

  // ─── Profile Selection ─────────────────────────────────────

  private selectProfile(
    context: BehaviorContext,
    session: SessionState
  ): BehaviorProfileName {
    const override = this.overrides.get(context.sessionId);
    if (override) return override;

    const { detectionRisk = 0, stabilityScore = 1 } = context.environment;

    if (detectionRisk  > 0.72)  return "exploratory";
    if (session.errorRate > 0.38) return "cautious";
    if (stabilityScore   < 0.35) return "cautious";
    if (session.fatigue  > 0.80) return "cautious";

    // Default to configured profile
    return this.config.defaultProfile;
  }

  // ─── Variant Selection ─────────────────────────────────────

  private selectVariant(
    intent:  BehaviorIntent,
    profile: BehaviorProfile
  ): ExecutionVariant {
    // Non-click actions have fixed variants
    if (intent.action === "type"     || intent.action === "evaluate") return "direct";
    if (intent.action === "scroll")                                    return "scroll";

    return weightedPick(profile.variantWeights);
  }

  // ─── Step Decomposition ────────────────────────────────────

  private decompose(
    intent:  BehaviorIntent,
    profile: BehaviorProfile,
    variant: ExecutionVariant
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    const bbox = intent.target?.boundingBox;

    switch (intent.action) {
      case "click":
        steps.push(...this.clickSteps(bbox, profile, variant));
        break;

      case "type":
        steps.push(...this.typeSteps(
          typeof intent.payload === "string" ? intent.payload : "",
          profile
        ));
        break;

      case "scroll": {
        const p = intent.payload as Record<string, number> | null;
        steps.push(...this.scrollSteps(bbox, p?.deltaY ?? 300, p?.deltaX ?? 0));
        break;
      }

      case "hover":
        if (bbox) steps.push(...this.moveSteps(bbox, profile));
        steps.push({ type: "hover", duration: Math.round(normalSample(220, 55)) });
        break;

      case "evaluate":
        steps.push({
          type:       "evaluate",
          expression: typeof intent.payload === "string" ? intent.payload : "undefined",
        });
        break;
    }

    return steps;
  }

  // ─── Click Steps ───────────────────────────────────────────

  private clickSteps(
    bbox:    { x: number; y: number; width: number; height: number } | undefined,
    profile: BehaviorProfile,
    variant: ExecutionVariant
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    if (bbox && profile.movementStyle !== "direct") {
      steps.push(...this.moveSteps(bbox, profile));
    }

    // Hesitation
    if (Math.random() < profile.hesitationRate) {
      steps.push({ type: "delay", duration: Math.round(normalSample(160, 55)) });
    }

    if (variant === "hover") {
      steps.push({ type: "hover", duration: Math.round(normalSample(185, 65)) });
    }

    if (variant === "miss" && Math.random() < profile.correctionRate) {
      // Intentional miss, then correction
      steps.push({ type: "click", button: "left", miss: true });
      steps.push({ type: "delay", duration: Math.round(normalSample(90, 30)) });
    }

    steps.push({ type: "click", button: "left", miss: false });
    return steps;
  }

  // ─── Type Steps ────────────────────────────────────────────

  private typeSteps(text: string, profile: BehaviorProfile): ExecutionStep[] {
    const steps: ExecutionStep[] = [];

    for (const char of text) {
      const delay = clamp(
        normalSample(profile.baseDelayMu * 0.48, profile.baseDelaySigma * 0.75),
        18, 450
      );
      steps.push({ type: "delay",    duration: Math.round(delay) });
      steps.push({ type: "keypress", char });

      // Occasional mid-word pause (reading/thinking simulation)
      if (Math.random() < profile.correctionRate * 0.25) {
        steps.push({ type: "delay", duration: Math.round(normalSample(320, 110)) });
      }
    }

    return steps;
  }

  // ─── Scroll Steps ──────────────────────────────────────────

  private scrollSteps(
    _bbox:  { x: number; y: number; width: number; height: number } | undefined,
    deltaY: number,
    deltaX: number
  ): ExecutionStep[] {
    const steps: ExecutionStep[] = [];
    if (Math.random() < 0.28) {
      steps.push({ type: "delay", duration: Math.round(normalSample(110, 40)) });
    }
    steps.push({ type: "scroll", deltaX, deltaY });
    return steps;
  }

  // ─── Move Steps (cursor path) ──────────────────────────────

  private moveSteps(
    bbox:    { x: number; y: number; width: number; height: number },
    profile: BehaviorProfile
  ): ExecutionStep[] {
    const tx = bbox.x + bbox.width  / 2 + randBetween(-4, 4);
    const ty = bbox.y + bbox.height / 2 + randBetween(-4, 4);

    if (profile.movementStyle === "direct") {
      return [{ type: "move", x: Math.round(tx), y: Math.round(ty) }];
    }

    // Bezier path
    const sx  = randBetween(100, 700);
    const sy  = randBetween(100, 500);
    const cp1 = {
      x: sx + (tx - sx) * 0.3 + randBetween(-90, 90),
      y: sy + randBetween(-90, 90),
    };
    const cp2 = {
      x: sx + (tx - sx) * 0.7 + randBetween(-90, 90),
      y: ty + randBetween(-90, 90),
    };

    const STEPS = profile.movementStyle === "noisy" ? 18 : 11;
    const path: Array<{ x: number; y: number }> = [];

    for (let i = 1; i <= STEPS; i++) {
      const pt = bezierPoint({ x: sx, y: sy }, cp1, cp2, { x: tx, y: ty }, i / STEPS);
      if (profile.movementStyle === "noisy") {
        pt.x += randBetween(-2.5, 2.5);
        pt.y += randBetween(-2.5, 2.5);
      }
      path.push({ x: Math.round(pt.x), y: Math.round(pt.y) });
    }

    return [{ type: "move", path }];
  }

  // ─── Timing Model ──────────────────────────────────────────

  private buildTimingModel(
    profile: BehaviorProfile,
    session: SessionState
  ): TimingModel {
    return {
      nextDelay: (stepIndex: number, fatigue: number): number => {
        const base    = normalSample(profile.baseDelayMu, profile.baseDelaySigma);
        const fMult   = 1 + fatigue * 0.65;            // up to +65% at max fatigue
        const wave    = 1 + 0.08 * Math.sin(stepIndex / 3.5);  // oscillation
        const latency = 1 + (session.elapsedSec > 300 ? 0.1 : 0); // long session drift
        return Math.round(clamp(base * fMult * wave * latency, 8, 2_500));
      },
    };
  }

  // ─── Variance ──────────────────────────────────────────────

  private buildVariance(
    profile:  BehaviorProfile,
    session:  SessionState,
    context:  BehaviorContext
  ): VarianceConfig {
    return {
      temporal: clamp(0.10 + session.fatigue * 0.30, 0.04, 0.65),
      spatial:  clamp(0.08 + context.environment.detectionRisk * 0.45, 0.02, 0.85),
      decision: clamp(0.15 + session.errorRate  * 0.55, 0.08, 0.92),
    };
  }

  // ─── Confidence ────────────────────────────────────────────

  private computeConfidence(
    profile:  BehaviorProfile,
    session:  SessionState,
    context:  BehaviorContext
  ): number {
    let c = 1.0;
    c -= session.errorRate  * 0.42;
    c -= session.fatigue    * 0.22;
    c -= (context.environment.detectionRisk ?? 0) * 0.20;
    c += profile.name === "precise" ? 0.08 : 0;
    return clamp(c, 0, 1);
  }

  // ─── Validation ────────────────────────────────────────────

  private validate(intent: BehaviorIntent, context: BehaviorContext): void {
    if (!intent?.id)          throw new Error("[BehaviorEngine] intent.id required");
    if (!intent?.action)      throw new Error("[BehaviorEngine] intent.action required");
    if (!context?.sessionId)  throw new Error("[BehaviorEngine] context.sessionId required");

    const validActions = ["click", "type", "scroll", "hover", "evaluate"] as const;
    if (!validActions.includes(intent.action)) {
      throw new Error(`[BehaviorEngine] Unknown action: ${intent.action}`);
    }
  }

  // ─── Session Management ────────────────────────────────────

  private getOrCreateSession(sessionId: string): SessionState {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new SessionState(sessionId));
    }
    return this.sessions.get(sessionId)!;
  }
}
