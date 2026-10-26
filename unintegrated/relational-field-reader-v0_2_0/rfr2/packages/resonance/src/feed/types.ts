// ============================================================
// FEED — Types
// A resonance feed is not an engagement feed.
// It surfaces what a person's expression system will actually meet.
// ============================================================

import type { ResonanceResult } from '../types';
import type { RelationalDynamic, IntimacyMode } from '../idl/types';

export interface FeedItem {
  // What is being surfaced
  targetUserId: string;
  targetSignalTimestamp: number;
  targetTextPreview: string;    // first 200 chars of the signal that triggered this

  // Why it's being surfaced
  resonance: ResonanceResult;
  dynamic: RelationalDynamic | null;
  modeA: IntimacyMode | null;
  modeB: IntimacyMode | null;

  // The unified feed score
  score: FeedScore;
}

export interface FeedScore {
  total: number;              // 0–1 unified score

  // Components (all 0–1)
  resonanceScore: number;     // from resonance engine
  dynamicScore: number;       // from IDL relational dynamic
  noveltyScore: number;       // penalizes seeing same person too often
  phaseScore: number;         // temporal alignment — right moment?

  // What's driving this result
  primaryReason: string;      // one-line explanation surfaced to user
  matchType: string;          // from resonance matchType
  dynamicType: string | null; // from IDL dynamic type
}

export interface FeedContext {
  viewerId: string;
  requestedAt: number;
  limit: number;               // max items (default 20)
  excludeUserIds?: string[];   // already seen / blocked
  freshWindowMs?: number;      // only surface signals newer than N ms (default 48hr)
  weightPreset?: FeedWeightPreset;
}

export type FeedWeightPreset =
  | 'balanced'        // default
  | 'resonance-heavy' // maximize signal structural match
  | 'dynamic-heavy'   // maximize IDL relational fit
  | 'novel'           // prefer variety, lower resonance threshold

export interface FeedResult {
  viewerId: string;
  generatedAt: number;
  items: FeedItem[];
  totalCandidates: number;    // how many were evaluated
  weights: FeedWeights;
}

export interface FeedWeights {
  resonance: number;
  dynamic: number;
  novelty: number;
  phase: number;
}

// Weight presets
export const WEIGHT_PRESETS: Record<FeedWeightPreset, FeedWeights> = {
  'balanced':        { resonance: 0.40, dynamic: 0.35, novelty: 0.15, phase: 0.10 },
  'resonance-heavy': { resonance: 0.65, dynamic: 0.20, novelty: 0.10, phase: 0.05 },
  'dynamic-heavy':   { resonance: 0.25, dynamic: 0.55, novelty: 0.10, phase: 0.10 },
  'novel':           { resonance: 0.30, dynamic: 0.25, novelty: 0.35, phase: 0.10 }
};
