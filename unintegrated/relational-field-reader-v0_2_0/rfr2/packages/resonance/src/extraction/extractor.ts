// ============================================================
// HYBRID EXTRACTOR
// Runs heuristic first. If confidence is low, calls LLM to
// correct/refine. LLM can also be forced for any text.
// ============================================================

import type { SignalVector } from '../types';
import { extractHeuristic } from './heuristics';
import { extractLLM } from './llm';

interface ExtractorConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  llmThreshold?: number;   // confidence below this → call LLM (default 0.55)
  forceLLM?: boolean;      // always use LLM regardless of confidence
}

// ─── Confidence scoring ──────────────────────────────────────
// Short texts, very low lexical diversity, or edge-case distributions
// get flagged for LLM refinement.

function scoreHeuristicConfidence(
  signal: Omit<SignalVector, 'extractionMethod' | 'confidence'>,
  text: string
): number {
  let score = 1.0;

  // Too short — heuristics can't extract reliably
  const wordCount = text.split(/\s+/).length;
  if (wordCount < 20) score -= 0.4;
  else if (wordCount < 50) score -= 0.15;

  // All features clumped near zero — likely all lexicon misses
  const cogValues = Object.values(signal.cognition);
  const affValues = Object.values(signal.affect);
  const langValues = Object.values(signal.language);
  const allValues = [...cogValues, ...affValues, ...langValues];
  const allNearZero = allValues.every(v => v < 0.1);
  if (allNearZero) score -= 0.4;

  // Very little variance — might be neutral noise
  const variance = computeVariance(allValues);
  if (variance < 0.005) score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

function computeVariance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

// ─── Merge heuristic + LLM ───────────────────────────────────
// LLM scores are weighted more heavily when heuristic confidence is low.

function mergeSignals(
  heuristic: Omit<SignalVector, 'extractionMethod' | 'confidence'>,
  llmResult: Awaited<ReturnType<typeof extractLLM>>,
  heuristicConfidence: number
): SignalVector {
  const llmWeight = 1 - heuristicConfidence;  // if confidence=0.3, LLM gets 0.7
  const hWeight = heuristicConfidence;

  function blend(h: number, l: number) {
    return h * hWeight + l * llmWeight;
  }

  function blendGroup(
    h: Record<string, number>,
    l: Record<string, number>
  ): Record<string, number> {
    const result: Record<string, number> = {};
    Object.keys(h).forEach(k => {
      result[k] = blend(h[k], l[k] ?? h[k]);
    });
    return result;
  }

  return {
    userId: heuristic.userId,
    timestamp: heuristic.timestamp,
    text: heuristic.text,
    cognition: blendGroup(heuristic.cognition as any, llmResult.cognition as any) as SignalVector['cognition'],
    affect: blendGroup(heuristic.affect as any, llmResult.affect as any) as SignalVector['affect'],
    language: blendGroup(heuristic.language as any, llmResult.language as any) as SignalVector['language'],
    entropy: blend(heuristic.entropy, llmResult.entropy),
    intensity: blend(heuristic.intensity, llmResult.intensity),
    extractionMethod: 'hybrid',
    confidence: Math.min(1, heuristicConfidence + 0.3) // boosted by LLM refinement
  };
}

// ─── Main entry point ────────────────────────────────────────

export async function extract(
  userId: string,
  text: string,
  config: ExtractorConfig = {}
): Promise<SignalVector> {
  const threshold = config.llmThreshold ?? 0.55;

  // Always start with heuristic (fast, free)
  const heuristic = extractHeuristic(userId, text);
  const confidence = scoreHeuristicConfidence(heuristic, text);

  const needsLLM = config.forceLLM || confidence < threshold;

  if (!needsLLM) {
    return {
      ...heuristic,
      extractionMethod: 'heuristic',
      confidence
    };
  }

  // LLM refinement
  if (!config.apiKey) {
    // No key provided — return heuristic with low confidence flagged
    console.warn('[extractor] LLM needed but no apiKey provided, returning heuristic only');
    return {
      ...heuristic,
      extractionMethod: 'heuristic',
      confidence: confidence * 0.7  // mark it as degraded
    };
  }

  try {
    const llmResult = await extractLLM(userId, text, {
      apiKey: config.apiKey,
      model: config.model,
      baseUrl: config.baseUrl
    });

    return mergeSignals(heuristic, llmResult, confidence);
  } catch (err) {
    console.error('[extractor] LLM call failed, falling back to heuristic:', err);
    return {
      ...heuristic,
      extractionMethod: 'heuristic',
      confidence: confidence * 0.8
    };
  }
}
