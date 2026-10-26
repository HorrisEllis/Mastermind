// ============================================================
// FEED SCORER
// Combines resonance engine output + IDL dynamic into
// a single feed score per candidate.
// ============================================================

import type { ResonanceResult } from '../types';
import type { RelationalDynamic, IntimacyMode } from '../idl/types';
import type { FeedScore, FeedWeights } from './types';

// ─── Resonance → feed score ───────────────────────────────────
// Not just total resonance. The *type* of resonance matters.

function scoreResonance(resonance: ResonanceResult): number {
  // Base: total resonance
  let score = resonance.total;

  // Bonus for high-quality match types that indicate real interaction value
  const typeBonus: Record<ResonanceResult['matchType'], number> = {
    'mirror': 0.05,          // strong but can be an echo chamber
    'complementary': 0.10,   // best signal — different oscillation, same structure
    'friction': 0.05,        // valuable but harder
    'dissonant': -0.10       // penalize — this is noise in the feed
  };

  score += typeBonus[resonance.matchType] ?? 0;
  return Math.max(0, Math.min(1, score));
}

// ─── IDL dynamic → feed score ─────────────────────────────────

function scoreDynamic(dynamic: RelationalDynamic | null): number {
  if (!dynamic) return 0.5; // no IDL data = neutral

  let score = dynamic.overallFit;

  // Type-specific adjustments for feed context
  // What makes a feed item valuable is not just "fit" but contact readiness
  const typeModifier: Record<RelationalDynamic['type'], number> = {
    'stabilizing': 0.10,     // high value — grounds volatility
    'complementary': 0.08,   // different but completing
    'mirroring': 0.05,       // feels good but watch for echo chamber
    'friction-growth': 0.02, // generative but demanding
    'asymmetric': -0.05,     // requires explicit work — lower default priority
    'oscillating': -0.08     // high noise potential in feed context
  };

  score += typeModifier[dynamic.type] ?? 0;

  // Penalize if there are many warnings (indicates high cognitive/relational load)
  if (dynamic.warnings.length >= 3) score -= 0.08;
  if (dynamic.warnings.length >= 2) score -= 0.04;

  return Math.max(0, Math.min(1, score));
}

// ─── Novelty score ────────────────────────────────────────────
// Penalizes showing the same person repeatedly.
// lastSeenMs = ms since viewer last saw content from this target.
// null = never seen.

export function scoreNovelty(lastSeenMs: number | null): number {
  if (lastSeenMs === null) return 1.0; // never seen — full novelty

  const hoursSince = lastSeenMs / (1000 * 60 * 60);

  if (hoursSince < 1) return 0.1;    // just shown — almost completely penalized
  if (hoursSince < 6) return 0.3;
  if (hoursSince < 24) return 0.6;
  if (hoursSince < 72) return 0.85;
  return 1.0;                         // >3 days — fully fresh again
}

// ─── Phase score ──────────────────────────────────────────────
// Are they in a compatible phase right now?
// temporal from resonance, plus IDL phase shift direction.

function scorePhase(
  resonance: ResonanceResult,
  dynamic: RelationalDynamic | null
): number {
  // Temporal alignment from resonance engine
  const base = resonance.temporal;

  // If processing compatibility is very low, deprioritize even if phase matches
  if (dynamic && dynamic.processingCompatibility < 0.3) {
    return base * 0.7;
  }

  return base;
}

// ─── Reason generator ────────────────────────────────────────
// One-line surface explanation shown to the viewer.

function primaryReason(
  resonance: ResonanceResult,
  dynamic: RelationalDynamic | null
): string {
  // Lead with what's most notable

  if (resonance.matchType === 'complementary' && dynamic?.type === 'stabilizing') {
    return 'Different oscillation patterns — they carry what you\'re not holding right now.';
  }

  if (resonance.matchType === 'mirror') {
    return 'Expression architecture aligns closely — same cognitive rhythm.';
  }

  if (dynamic?.type === 'stabilizing') {
    return 'Regulation patterns are complementary — one grounds, one moves.';
  }

  if (resonance.matchType === 'complementary') {
    return 'Similar structure, different dynamics — completing, not echoing.';
  }

  if (dynamic?.type === 'deep-processor' as any || resonance.axes.cognition > 0.75) {
    return 'Shared abstraction depth and cognitive density.';
  }

  if (resonance.axes.affect > 0.75) {
    return 'Emotional processing patterns closely aligned.';
  }

  if (resonance.axes.language > 0.75) {
    return 'Language architecture and symbolic register match.';
  }

  if (dynamic?.type === 'friction-growth') {
    return 'Generative tension — different processing, shared foundation.';
  }

  // Fall back to best insight from resonance engine
  return resonance.insights[0] ?? 'Signal pattern overlap detected.';
}

// ─── Main ─────────────────────────────────────────────────────

export function scoreFeedItem(
  resonance: ResonanceResult,
  dynamic: RelationalDynamic | null,
  lastSeenMs: number | null,
  weights: FeedWeights
): FeedScore {
  const resonanceScore = scoreResonance(resonance);
  const dynamicScore = scoreDynamic(dynamic);
  const noveltyScore = scoreNovelty(lastSeenMs);
  const phaseScore = scorePhase(resonance, dynamic);

  const total =
    resonanceScore * weights.resonance +
    dynamicScore   * weights.dynamic +
    noveltyScore   * weights.novelty +
    phaseScore     * weights.phase;

  return {
    total: Math.max(0, Math.min(1, total)),
    resonanceScore,
    dynamicScore,
    noveltyScore,
    phaseScore,
    primaryReason: primaryReason(resonance, dynamic),
    matchType: resonance.matchType,
    dynamicType: dynamic?.type ?? null
  };
}
