// ============================================================
// PROGRAMMATIC API — full stack
// ============================================================

export type { SignalVector, OscillationProfile, ResonanceResult, AuthorshipSignature } from './types';
export type { IntimacyVector, IntimacyMode, RelationalDynamic, IntimacyModeName, RelationalDynamicType } from './idl/types';
export type { FeedItem, FeedScore, FeedContext, FeedResult, FeedWeights, FeedWeightPreset } from './feed/types';
export type { ResonanceInput } from './resonance/scoring';

export { extract } from './extraction/extractor';
export { extractHeuristic } from './extraction/heuristics';
export { extractLLM, generateInsight } from './extraction/llm';
export { TrajectoryStore } from './trajectory/store';
export { computeOscillation } from './trajectory/oscillation';
export { computeResonance } from './resonance/scoring';
export { AuthorshipSignatureEngine } from './ase/signature';
export { computeIntimacyVector } from './idl/axes';
export { classifyIntimacyMode } from './idl/modes';
export { computeRelationalDynamic } from './idl/dynamics';
export { IDLStore } from './idl/store';
export { FeedGenerator } from './feed/generator';
export { scoreFeedItem } from './feed/scorer';
export { WEIGHT_PRESETS } from './feed/types';

// ─── ResonanceEngine — single entry point ─────────────────────

import { extract } from './extraction/extractor';
import { TrajectoryStore } from './trajectory/store';
import { computeOscillation } from './trajectory/oscillation';
import { computeResonance } from './resonance/scoring';
import { AuthorshipSignatureEngine } from './ase/signature';
import { computeIntimacyVector } from './idl/axes';
import { classifyIntimacyMode } from './idl/modes';
import { computeRelationalDynamic } from './idl/dynamics';
import { IDLStore } from './idl/store';
import { FeedGenerator } from './feed/generator';
import type { ResonanceResult, AuthorshipSignature } from './types';
import type { IntimacyVector, IntimacyMode, RelationalDynamic } from './idl/types';
import type { FeedResult, FeedWeightPreset } from './feed/types';

interface EngineConfig {
  dataDir?: string;
  apiKey?: string;
  model?: string;
  llmThreshold?: number;
  emaAlpha?: number;
}

export class ResonanceEngine {
  store: TrajectoryStore;
  ase: AuthorshipSignatureEngine;
  idlStore: IDLStore;
  feed: FeedGenerator;
  private cfg: EngineConfig;

  constructor(config: EngineConfig = {}) {
    this.cfg = config;
    const base = config.dataDir ?? './data';
    this.store    = new TrajectoryStore({ dataDir: `${base}/trajectories` });
    this.ase      = new AuthorshipSignatureEngine({ dataDir: `${base}/signatures`, emaAlpha: config.emaAlpha });
    this.idlStore = new IDLStore(`${base}/idl`);
    this.feed     = new FeedGenerator(this.store, this.idlStore);
  }

  async ingest(userId: string, text: string, forceLLM = false): Promise<{ signature: AuthorshipSignature; idl: IntimacyVector | null }> {
    const signal = await extract(userId, text, { apiKey: this.cfg.apiKey, model: this.cfg.model, llmThreshold: this.cfg.llmThreshold, forceLLM });
    this.store.append(signal);
    const signature = this.ase.ingest(signal);
    const all = this.store.getAll(userId);
    const idl = all.length >= 3 ? (() => { const v = computeIntimacyVector(userId, all); this.idlStore.save(v); return v; })() : null;
    return { signature, idl };
  }

  resonance(userA: string, userB: string, window = 20): ResonanceResult {
    const sA = this.store.getWindow(userA, window);
    const sB = this.store.getWindow(userB, window);
    return computeResonance({ userA, signalsA: sA, oscA: computeOscillation(userA, sA), userB, signalsB: sB, oscB: computeOscillation(userB, sB), windowSize: window });
  }

  idl(userId: string): { vector: IntimacyVector; mode: IntimacyMode } | null {
    const signals = this.store.getAll(userId);
    if (signals.length < 3) return null;
    const vector = computeIntimacyVector(userId, signals);
    this.idlStore.save(vector);
    return { vector, mode: classifyIntimacyMode(vector) };
  }

  dynamic(userA: string, userB: string): { dynamic: RelationalDynamic; modeA: IntimacyMode; modeB: IntimacyMode } | null {
    const a = this.idl(userA);
    const b = this.idl(userB);
    if (!a || !b) return null;
    return { dynamic: computeRelationalDynamic(a.vector, a.mode, b.vector, b.mode), modeA: a.mode, modeB: b.mode };
  }

  generateFeed(userId: string, limit = 20, preset: FeedWeightPreset = 'balanced'): Promise<FeedResult> {
    return this.feed.generate({ viewerId: userId, requestedAt: Date.now(), limit, weightPreset: preset });
  }

  signature(userId: string): AuthorshipSignature | null { return this.ase.get(userId); }
  oscillation(userId: string, window?: number) {
    const s = window ? this.store.getWindow(userId, window) : this.store.getAll(userId);
    return computeOscillation(userId, s, window);
  }
}
