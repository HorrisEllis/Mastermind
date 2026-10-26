// ============================================================
// FEED GENERATOR
// Assembles a resonance feed for a given viewer.
// Pulls from trajectory store, resonance engine, IDL.
// ============================================================

import type { SignalVector } from '../types';
import type { IntimacyVector, IntimacyMode } from '../idl/types';
import { TrajectoryStore } from '../trajectory/store';
import { computeOscillation } from '../trajectory/oscillation';
import { computeResonance } from '../resonance/scoring';
import { computeIntimacyVector } from '../idl/axes';
import { classifyIntimacyMode } from '../idl/modes';
import { computeRelationalDynamic } from '../idl/dynamics';
import { IDLStore } from '../idl/store';
import { scoreFeedItem } from './scorer';
import type { FeedContext, FeedItem, FeedResult, FeedWeights } from './types';
import { WEIGHT_PRESETS } from './types';

// ─── Seen history (in-memory for now, swap for Redis/DB) ──────

const seenHistory = new Map<string, Map<string, number>>();
// structure: viewerId → (targetUserId → timestamp of last surface)

function lastSeen(viewerId: string, targetId: string): number | null {
  const viewer = seenHistory.get(viewerId);
  if (!viewer) return null;
  return viewer.get(targetId) ?? null;
}

function markSeen(viewerId: string, targetId: string): void {
  if (!seenHistory.has(viewerId)) seenHistory.set(viewerId, new Map());
  seenHistory.get(viewerId)!.set(targetId, Date.now());
}

// ─── Feed generator ───────────────────────────────────────────

export class FeedGenerator {
  private trajectoryStore: TrajectoryStore;
  private idlStore: IDLStore;
  private signalWindowSize: number;

  constructor(trajectoryStore: TrajectoryStore, idlStore: IDLStore, signalWindowSize = 20) {
    this.trajectoryStore = trajectoryStore;
    this.idlStore = idlStore;
    this.signalWindowSize = signalWindowSize;
  }

  async generate(context: FeedContext): Promise<FeedResult> {
    const weights: FeedWeights = WEIGHT_PRESETS[context.weightPreset ?? 'balanced'];
    const limit = context.limit ?? 20;
    const freshWindowMs = context.freshWindowMs ?? 48 * 60 * 60 * 1000; // 48 hours
    const excludeSet = new Set(context.excludeUserIds ?? []);
    excludeSet.add(context.viewerId); // never surface yourself

    // Get viewer's signals + oscillation + IDL
    const viewerSignals = this.trajectoryStore.getWindow(context.viewerId, this.signalWindowSize);
    if (viewerSignals.length === 0) {
      return { viewerId: context.viewerId, generatedAt: Date.now(), items: [], totalCandidates: 0, weights };
    }

    const viewerOsc = computeOscillation(context.viewerId, viewerSignals);
    const viewerIDL = this.getOrComputeIDL(context.viewerId, viewerSignals);
    const viewerMode = classifyIntimacyMode(viewerIDL);

    // Get all candidate users
    const allUsers = this.trajectoryStore.listUsers().filter(u => !excludeSet.has(u));
    let totalCandidates = 0;
    const scored: Array<{ item: FeedItem; score: number }> = [];

    for (const targetId of allUsers) {
      const targetSignals = this.trajectoryStore.getWindow(targetId, this.signalWindowSize);
      if (targetSignals.length === 0) continue;

      // Only surface recent signals
      const mostRecent = targetSignals[targetSignals.length - 1];
      if (Date.now() - mostRecent.timestamp > freshWindowMs) continue;

      totalCandidates++;

      const targetOsc = computeOscillation(targetId, targetSignals);
      const resonance = computeResonance({
        userA: context.viewerId, signalsA: viewerSignals, oscA: viewerOsc,
        userB: targetId, signalsB: targetSignals, oscB: targetOsc,
        windowSize: this.signalWindowSize
      });

      // Skip dissonant unless novelty weight is high
      if (resonance.matchType === 'dissonant' && weights.novelty < 0.30) continue;

      // IDL dynamic (if both have enough data)
      let dynamic = null;
      let targetMode: IntimacyMode | null = null;
      if (viewerSignals.length >= 5 && targetSignals.length >= 5) {
        const targetIDL = this.getOrComputeIDL(targetId, targetSignals);
        targetMode = classifyIntimacyMode(targetIDL);
        dynamic = computeRelationalDynamic(viewerIDL, viewerMode, targetIDL, targetMode);
      }

      const lastSeenMs = (() => {
        const ts = lastSeen(context.viewerId, targetId);
        return ts ? Date.now() - ts : null;
      })();

      const feedScore = scoreFeedItem(resonance, dynamic, lastSeenMs, weights);

      const item: FeedItem = {
        targetUserId: targetId,
        targetSignalTimestamp: mostRecent.timestamp,
        targetTextPreview: mostRecent.text.slice(0, 200),
        resonance,
        dynamic,
        modeA: viewerMode,
        modeB: targetMode,
        score: feedScore
      };

      scored.push({ item, score: feedScore.total });
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top N and mark as seen
    const items = scored.slice(0, limit).map(({ item }) => {
      markSeen(context.viewerId, item.targetUserId);
      return item;
    });

    return {
      viewerId: context.viewerId,
      generatedAt: Date.now(),
      items,
      totalCandidates,
      weights
    };
  }

  private getOrComputeIDL(userId: string, signals: SignalVector[]): IntimacyVector {
    const stored = this.idlStore.get(userId);
    if (stored && Date.now() - stored.computedAt < 30 * 60 * 1000) {
      return stored; // cache: recompute every 30 min
    }
    const vector = computeIntimacyVector(userId, signals);
    this.idlStore.save(vector);
    return vector;
  }
}
