// ============================================================
// LLM EXTRACTOR
// Uses Claude to score text on signal axes.
// Called when heuristic confidence is low, or explicitly requested.
// ============================================================

import type { SignalVector } from '../types';

interface LLMConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

interface LLMScores {
  cognition: SignalVector['cognition'];
  affect: SignalVector['affect'];
  language: SignalVector['language'];
  entropy: number;
  intensity: number;
  insight: string;  // one-line qualitative read
}

const SYSTEM_PROMPT = `You are a signal extraction engine. Your job is to analyze text and return a precise JSON object scoring the author's expression across multiple axes. You are NOT analyzing sentiment or meaning — you are analyzing the STRUCTURE and DYNAMICS of how someone writes.

Return ONLY valid JSON. No preamble, no explanation, no markdown fences.

All numeric scores are floats between 0.0 and 1.0.

Schema:
{
  "cognition": {
    "abstractionLevel": float,    // 0=concrete/physical, 1=abstract/conceptual
    "linearity": float,           // 0=fragmented/nonlinear, 1=sequential/structured
    "recursionDepth": float,      // 0=no self-reference, 1=deeply self-referential
    "systemThinking": float,      // 0=isolated observations, 1=relational/causal modeling
    "compression": float          // 0=sparse/simple, 1=dense with ideas per line
  },
  "affect": {
    "valence": float,             // 0=negative, 1=positive (0.5=neutral)
    "volatility": float,          // 0=calm/stable, 1=emotionally volatile
    "attachmentLoad": float,      // 0=self-contained, 1=relationally saturated
    "urgency": float,             // 0=no time pressure, 1=high urgency
    "somaticDensity": float       // 0=abstract/mental, 1=body/physical grounded
  },
  "language": {
    "metaphorDensity": float,     // 0=literal, 1=heavily metaphorical
    "symbolicUsage": float,       // 0=everyday language, 1=archetypal/mythic
    "poeticness": float,          // 0=prosaic/flat, 1=lyrical/musical
    "analyticalness": float,      // 0=intuitive/impressionistic, 1=logical/precise
    "narrativeStructure": float   // 0=fragmented, 1=story arc with arc/tension/resolution
  },
  "entropy": float,               // 0=predictable/formulaic, 1=novel/surprising
  "intensity": float,             // 0=low energy, 1=fully saturated/maximum charge
  "insight": string               // one sentence: what is structurally notable about this text
}`;

export async function extractLLM(
  userId: string,
  text: string,
  config: LLMConfig
): Promise<Omit<SignalVector, 'extractionMethod' | 'confidence'> & { insight: string }> {
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';
  const model = config.model || 'claude-sonnet-4-20250514';

  const userPrompt = `Analyze this text and return the JSON signal vector:\n\n---\n${text.slice(0, 3000)}\n---`;

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM extraction failed: ${response.status} ${err}`);
  }

  const data = await response.json() as any;
  const raw: string = data.content?.[0]?.text || '';

  let scores: LLMScores;
  try {
    scores = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    throw new Error(`LLM returned unparseable JSON: ${raw.slice(0, 200)}`);
  }

  return {
    userId,
    timestamp: Date.now(),
    text,
    cognition: scores.cognition,
    affect: scores.affect,
    language: scores.language,
    entropy: scores.entropy,
    intensity: scores.intensity,
    insight: scores.insight
  };
}

// Qualitative signature summary — called separately, not during ingestion
export async function generateInsight(
  userId: string,
  signals: SignalVector[],
  config: LLMConfig
): Promise<string> {
  const model = config.model || 'claude-sonnet-4-20250514';
  const baseUrl = config.baseUrl || 'https://api.anthropic.com';

  const avgSignal = averageSignals(signals);

  const prompt = `You are analyzing the authorship signature of a person based on their averaged signal vector over ${signals.length} text samples.

Signal vector:
${JSON.stringify(avgSignal, null, 2)}

Write 2–3 sentences describing the structural and dynamic patterns in how this person expresses themselves. Focus on HOW they think and write, not WHAT they think. Do not use labels like "INFJ" or personality types. Describe oscillation, density, and architecture of expression.`;

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json() as any;
  return data.content?.[0]?.text || '';
}

function averageSignals(signals: SignalVector[]): Record<string, any> {
  if (signals.length === 0) return {};

  const keys: (keyof Pick<SignalVector, 'cognition' | 'affect' | 'language'>)[] = [
    'cognition', 'affect', 'language'
  ];

  const result: any = { entropy: 0, intensity: 0 };
  keys.forEach(group => {
    result[group] = {};
    const sample = signals[0][group] as Record<string, number>;
    Object.keys(sample).forEach(axis => {
      result[group][axis] = signals.reduce((sum, s) => sum + (s[group] as any)[axis], 0) / signals.length;
    });
  });

  result.entropy = signals.reduce((s, v) => s + v.entropy, 0) / signals.length;
  result.intensity = signals.reduce((s, v) => s + v.intensity, 0) / signals.length;

  return result;
}
