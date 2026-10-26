// ============================================================
// RESONANCE ENGINE — Core Types
// ============================================================

export interface SignalVector {
  timestamp: number;
  userId: string;
  text: string;

  cognition: {
    abstractionLevel: number;   // 0=concrete → 1=abstract
    linearity: number;          // 0=nonlinear → 1=step-by-step
    recursionDepth: number;     // 0=shallow → 1=deep self-reference
    systemThinking: number;     // 0=isolated → 1=relational/causal
    compression: number;        // 0=sparse → 1=idea-dense
  };

  affect: {
    valence: number;            // 0=negative → 1=positive
    volatility: number;         // 0=calm → 1=volatile
    attachmentLoad: number;     // 0=self-contained → 1=highly relational
    urgency: number;            // 0=relaxed → 1=pressured
    somaticDensity: number;     // 0=abstract → 1=body-grounded
  };

  language: {
    metaphorDensity: number;    // 0=literal → 1=metaphor-rich
    symbolicUsage: number;      // 0=mundane → 1=archetypal
    poeticness: number;         // 0=prosaic → 1=poetic
    analyticalness: number;     // 0=intuitive → 1=analytical
    narrativeStructure: number; // 0=fragmentary → 1=structured arc
  };

  entropy: number;              // 0=predictable → 1=novel/surprising
  intensity: number;            // 0=low energy → 1=saturated

  extractionMethod: 'heuristic' | 'llm' | 'hybrid';
  confidence: number;           // 0–1
}

export interface OscillationProfile {
  userId: string;
  windowSize: number;
  computedAt: number;

  amplitude: {
    cognition: number;
    affect: number;
    language: number;
    overall: number;
  };

  frequency: {
    cognition: number;
    affect: number;
    language: number;
  };

  phaseShift: {
    direction: 'ascending' | 'descending' | 'stable' | 'oscillating';
    magnitude: number;
  };

  stability: number;     // 0=chaotic → 1=stable
  recovery: number;      // 0=slow recovery → 1=fast
  currentPhase: number;  // 0–1, position in current cycle
}

export interface ResonanceResult {
  userA: string;
  userB: string;
  computedAt: number;

  structural: number;    // 0–1 mean signal similarity
  oscillation: number;   // 0–1 oscillation profile similarity
  temporal: number;      // 0–1 phase alignment
  total: number;         // 0–1 weighted composite

  matchType: 'mirror' | 'complementary' | 'friction' | 'dissonant';

  insights: string[];    // human-readable explanations of what matched

  axes: {
    cognition: number;
    affect: number;
    language: number;
  };
}

export interface AuthorshipSignature {
  userId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  sampleSize: number;

  // Exponentially weighted stable core
  core: {
    cognition: Record<string, number>;
    affect: Record<string, number>;
    language: Record<string, number>;
    entropy: number;
    intensity: number;
  };

  // What makes this person's expression unique
  fingerprint: {
    highVarianceAxes: string[];  // axes that fluctuate
    lowVarianceAxes: string[];   // stable anchors
    dominantMode: string;        // primary expression archetype
    secondaryMode: string;
  };

  // Identity drift tracking
  drift: {
    magnitude: number;           // 0=no drift → 1=complete shift
    direction: string[];         // which axes are moving
    lastShiftAt: number | null;
    isShifting: boolean;
  };
}
