// ============================================================
// ErosmancerOS — Adaptive Layer
//
// Two components:
//
// 1. PatternMemory
//    Records execution outcomes per (action × profile × variant).
//    Computes success rates. Surfaces which combos work best
//    per element type, per environment fingerprint.
//    Ring-buffered per key. Persists to disk.
//
// 2. StrategyOptimizer
//    Consumes PatternMemory. Recommends optimal
//    (profile × variant) for incoming intents.
//    Implements entropy tuning: high uncertainty → increase
//    variance; high confidence → reduce it.
//    Feeds recommendations back into BehaviorEngine overrides.
// ============================================================

import { randomUUID }                           from "crypto";
import { writeFileSync, readFileSync,
         existsSync, mkdirSync }                from "fs";
import { dirname }                              from "path";
import EventEmitter                             from "eventemitter3";
import type { BehaviorProfileName,
              ExecutionVariant }                from "../types/index.ts";

// ─── PatternMemory ───────────────────────────────────────────

export interface PatternKey {
  action:      string;
  profile:     BehaviorProfileName;
  variant:     ExecutionVariant;
  elementTag?: string;          // button | input | a | etc.
  envBucket?:  string;          // "low-risk" | "med-risk" | "high-risk"
}

export interface PatternSample {
  ts:        number;
  success:   boolean;
  durationMs: number;
  sessionId: string;
}

export interface PatternRecord {
  key:         string;            // serialized PatternKey
  samples:     PatternSample[];   // ring buffer, max 100
  successRate: number;            // rolling
  avgDurationMs: number;          // rolling
  lastUpdated: number;
}

interface PatternMemoryEvents {
  "pattern:recorded": [key: string, success: boolean];
  "pattern:pruned":   [removed: number];
}

export class PatternMemory extends EventEmitter<PatternMemoryEvents> {
  private readonly maxSamplesPerKey: number;
  private readonly maxKeys:          number;
  private readonly persistPath?:     string;

  private patterns = new Map<string, PatternRecord>();
  private dirty    = false;

  constructor(options: {
    maxSamplesPerKey?: number;
    maxKeys?:          number;
    persistPath?:      string;
  } = {}) {
    super();
    this.maxSamplesPerKey = options.maxSamplesPerKey ?? 100;
    this.maxKeys          = options.maxKeys          ?? 2_000;
    this.persistPath      = options.persistPath;
    this.load();
  }

  // ─── Recording ────────────────────────────────────────────

  record(
    key:       PatternKey,
    success:   boolean,
    durationMs: number,
    sessionId: string
  ): void {
    const k = this.serializeKey(key);

    if (!this.patterns.has(k)) {
      if (this.patterns.size >= this.maxKeys) this.prune();
      this.patterns.set(k, {
        key:           k,
        samples:       [],
        successRate:   0,
        avgDurationMs: 0,
        lastUpdated:   Date.now(),
      });
    }

    const record = this.patterns.get(k)!;

    record.samples.push({ ts: Date.now(), success, durationMs, sessionId });
    if (record.samples.length > this.maxSamplesPerKey) record.samples.shift();

    // Recompute rolling metrics
    const n = record.samples.length;
    record.successRate   = record.samples.filter((s) => s.success).length / n;
    record.avgDurationMs = record.samples.reduce((sum, s) => sum + s.durationMs, 0) / n;
    record.lastUpdated   = Date.now();

    this.dirty = true;
    this.emit("pattern:recorded", k, success);
  }

  // ─── Query ────────────────────────────────────────────────

  get(key: PatternKey): PatternRecord | undefined {
    return this.patterns.get(this.serializeKey(key));
  }

  /**
   * Returns the best-performing variant for a given action + element type.
   * "Best" = highest successRate with ≥ MIN_SAMPLES samples.
   */
  bestVariant(
    action:      string,
    profile:     BehaviorProfileName,
    elementTag?: string,
    envBucket?:  string,
    minSamples   = 5
  ): ExecutionVariant | null {
    const candidates: Array<{ variant: ExecutionVariant; successRate: number }> = [];

    for (const record of this.patterns.values()) {
      if (record.samples.length < minSamples) continue;

      const parsed = this.parseKey(record.key);
      if (!parsed) continue;
      if (parsed.action  !== action)  continue;
      if (parsed.profile !== profile) continue;
      if (elementTag && parsed.elementTag !== elementTag) continue;
      if (envBucket  && parsed.envBucket  !== envBucket)  continue;

      candidates.push({ variant: parsed.variant, successRate: record.successRate });
    }

    if (!candidates.length) return null;

    candidates.sort((a, b) => b.successRate - a.successRate);
    return candidates[0].variant;
  }

  /**
   * Returns all patterns for a given profile, sorted by success rate.
   */
  topPatterns(
    profile: BehaviorProfileName,
    limit    = 10
  ): PatternRecord[] {
    return [...this.patterns.values()]
      .filter((r) => {
        const p = this.parseKey(r.key);
        return p?.profile === profile && r.samples.length >= 3;
      })
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  snapshot(): {
    totalKeys:    number;
    totalSamples: number;
    dirty:        boolean;
  } {
    const totalSamples = [...this.patterns.values()]
      .reduce((s, r) => s + r.samples.length, 0);
    return { totalKeys: this.patterns.size, totalSamples, dirty: this.dirty };
  }

  // ─── Persistence ──────────────────────────────────────────

  flush(): void {
    if (!this.persistPath || !this.dirty) return;
    try {
      const dir = dirname(this.persistPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const data = {
        patterns: [...this.patterns.values()],
        savedAt:  new Date().toISOString(),
      };
      writeFileSync(this.persistPath, JSON.stringify(data), "utf8");
      this.dirty = false;
    } catch { /* non-fatal */ }
  }

  private load(): void {
    if (!this.persistPath || !existsSync(this.persistPath)) return;
    try {
      const raw  = readFileSync(this.persistPath, "utf8");
      const data = JSON.parse(raw) as { patterns: PatternRecord[] };
      for (const rec of data.patterns ?? []) {
        this.patterns.set(rec.key, rec);
      }
    } catch { /* start fresh */ }
  }

  private prune(): void {
    // Evict oldest 10% by lastUpdated
    const sorted = [...this.patterns.values()]
      .sort((a, b) => a.lastUpdated - b.lastUpdated);
    const toRemove = Math.ceil(this.maxKeys * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.patterns.delete(sorted[i].key);
    }
    this.emit("pattern:pruned", toRemove);
  }

  // ─── Key serialization ────────────────────────────────────

  private serializeKey(key: PatternKey): string {
    return [
      key.action,
      key.profile,
      key.variant,
      key.elementTag ?? "_",
      key.envBucket  ?? "_",
    ].join(":");
  }

  private parseKey(raw: string): PatternKey | null {
    const parts = raw.split(":");
    if (parts.length !== 5) return null;
    return {
      action:      parts[0],
      profile:     parts[1] as BehaviorProfileName,
      variant:     parts[2] as ExecutionVariant,
      elementTag:  parts[3] === "_" ? undefined : parts[3],
      envBucket:   parts[4] === "_" ? undefined : parts[4],
    };
  }
}

// ─── StrategyOptimizer ───────────────────────────────────────

export interface OptimizationRecommendation {
  profile:         BehaviorProfileName;
  variant?:        ExecutionVariant;   // null = let BehaviorEngine pick
  entropyAdjust:   number;             // -1 to +1: negative = reduce variance, positive = increase
  confidence:      number;             // 0-1
  reason:          string;
}

interface OptimizerEvents {
  "recommendation": [rec: OptimizationRecommendation];
  "entropy:tuned":  [action: string, old: number, next: number];
}

export class StrategyOptimizer extends EventEmitter<OptimizerEvents> {
  private readonly memory: PatternMemory;

  // Per-session entropy levels: sessionId → entropy multiplier (1.0 = baseline)
  private entropyMap = new Map<string, number>();

  constructor(memory: PatternMemory) {
    super();
    this.memory = memory;
  }

  // ─── Public API ───────────────────────────────────────────

  /**
   * Recommend a strategy for an incoming intent.
   * Call this before processIntent in BehaviorEngine.
   */
  recommend(options: {
    action:      string;
    sessionId:   string;
    profile:     BehaviorProfileName;
    elementTag?: string;
    envBucket?:  string;
    recentErrors: number;   // 0-1 error rate
    detectionRisk: number;  // 0-1
  }): OptimizationRecommendation {
    const {
      action, sessionId, profile,
      elementTag, envBucket,
      recentErrors, detectionRisk,
    } = options;

    // Ask memory what variant works best here
    const bestVariant = this.memory.bestVariant(
      action, profile, elementTag, envBucket
    );

    // Entropy tuning
    const currentEntropy = this.entropyMap.get(sessionId) ?? 1.0;
    let   nextEntropy    = currentEntropy;

    if (recentErrors > 0.4) {
      // High error rate → increase variance (try different approaches)
      nextEntropy = Math.min(currentEntropy * 1.25, 3.0);
    } else if (recentErrors < 0.05 && detectionRisk < 0.1) {
      // Smooth sailing → tighten variance (stay on what works)
      nextEntropy = Math.max(currentEntropy * 0.92, 0.3);
    }

    if (nextEntropy !== currentEntropy) {
      this.entropyMap.set(sessionId, nextEntropy);
      this.emit("entropy:tuned", action, currentEntropy, nextEntropy);
    }

    const entropyAdjust = nextEntropy - 1.0;   // normalize to -0.7..+2.0

    // Select profile based on conditions
    let recommendedProfile = profile;
    if (detectionRisk > 0.75) recommendedProfile = "exploratory";
    else if (recentErrors > 0.3 && profile === "precise") recommendedProfile = "cautious";
    else if (recentErrors < 0.02 && profile === "cautious") recommendedProfile = "precise";

    const rec: OptimizationRecommendation = {
      profile:       recommendedProfile,
      variant:       bestVariant ?? undefined,
      entropyAdjust,
      confidence:    bestVariant ? this.computeConfidence(action, profile, elementTag, envBucket) : 0.3,
      reason:        bestVariant
        ? `pattern-memory:${action}×${elementTag ?? "any"} → ${bestVariant}`
        : "insufficient-data",
    };

    this.emit("recommendation", rec);
    return rec;
  }

  /**
   * Feed outcome back into pattern memory and update entropy.
   */
  learn(options: {
    action:      string;
    sessionId:   string;
    profile:     BehaviorProfileName;
    variant:     ExecutionVariant;
    elementTag?: string;
    envBucket?:  string;
    success:     boolean;
    durationMs:  number;
  }): void {
    this.memory.record(
      {
        action:     options.action,
        profile:    options.profile,
        variant:    options.variant,
        elementTag: options.elementTag,
        envBucket:  options.envBucket,
      },
      options.success,
      options.durationMs,
      options.sessionId
    );
  }

  /**
   * Get current entropy multiplier for a session.
   */
  entropy(sessionId: string): number {
    return this.entropyMap.get(sessionId) ?? 1.0;
  }

  resetEntropy(sessionId: string): void {
    this.entropyMap.set(sessionId, 1.0);
  }

  // ─── Internal ─────────────────────────────────────────────

  private computeConfidence(
    action:      string,
    profile:     BehaviorProfileName,
    elementTag?: string,
    envBucket?:  string
  ): number {
    const top = this.memory.topPatterns(profile, 5);
    if (!top.length) return 0.2;

    const matching = top.filter((r) => {
      const p = (r.key as string).split(":");
      return p[0] === action;
    });

    if (!matching.length) return 0.3;

    // Confidence = avg success rate weighted by sample count
    const totalSamples = matching.reduce((s, r) => s + r.samples.length, 0);
    const weightedRate = matching.reduce(
      (s, r) => s + r.successRate * r.samples.length, 0
    ) / Math.max(totalSamples, 1);

    // Scale by sample density: more samples = more confidence
    const density = Math.min(totalSamples / 50, 1.0);
    return 0.2 + density * weightedRate * 0.8;
  }
}
