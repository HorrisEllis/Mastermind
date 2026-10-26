// ============================================================
// INTIMACY DYNAMICS LAYER — Types
// ============================================================

// The 4 core axes of relational behavior.
// Not personality. Not identity. State-dependent behavior under relational load.

export interface IntimacyVector {
  userId: string;
  computedAt: number;
  sampleSize: number;

  // A. Attachment persistence
  // How strongly does bond inertia hold?
  persistence: {
    bondRetention: number;      // 0=severs fast → 1=holds through rupture
    repairTendency: number;     // 0=no repair → 1=always attempts reconciliation
    returnLikelihood: number;   // 0=doesn't return → 1=always returns after distance
  };

  // B. Attachment elasticity
  // How does the person regulate around separation?
  elasticity: {
    separationTolerance: number;    // 0=distressed by distance → 1=stable alone
    independenceStability: number;  // 0=needs contact to self-regulate → 1=internally stable
    nonCling: number;               // 0=high dependency spike → 1=low grip on others
  };

  // C. Regulation style (structure ↔ chaos)
  // How consistent is their relational rhythm?
  regulation: {
    predictability: number;         // 0=volatile/unpredictable → 1=steady/consistent
    emotionalConsistency: number;   // 0=high fluctuation → 1=even baseline
    relationalPacing: number;       // 0=erratic timing → 1=steady rhythm
  };

  // D. Processing latency
  // How does this person integrate emotion before expression?
  latency: {
    internalDepth: number;          // 0=external processor → 1=deep internal first
    expressionDelay: number;        // 0=immediate output → 1=delayed/compressed
    integrationTime: number;        // 0=fast/reactive → 1=slow/deliberate
  };
}

// ─── Intimacy Mode ────────────────────────────────────────────
// Emergent behavioral attractor — NOT an identity label.
// Describes dominant relational pattern under load.

export type IntimacyModeName =
  | 'structured-devotional'    // high persistence + low volatility
  | 'chaotic-attachment'       // high intensity + high volatility
  | 'detached-autonomous'      // high elasticity + low dependency
  | 'deep-processor'           // high latency + internal-first
  | 'fluid-relational'         // adaptive, context-sensitive
  | 'anxious-attacher'         // low elasticity + low repair + high urgency
  | 'reciprocal-builder'       // balanced all axes, high repair

export interface IntimacyMode {
  primary: IntimacyModeName;
  secondary: IntimacyModeName | null;
  confidence: number;          // 0–1 how clearly this mode is expressed
  description: string;
}

// ─── Relational Dynamic ───────────────────────────────────────
// Describes the interaction physics between two people's IDL profiles.
// Not compatibility. The shape of how they meet.

export type RelationalDynamicType =
  | 'stabilizing'      // one grounds the other's volatility
  | 'mirroring'        // same rhythm, same pattern
  | 'oscillating'      // pull/push cycles — high amplitude together
  | 'asymmetric'       // very different latency/elasticity — risk of mismatch
  | 'complementary'    // different axes, mutual completion
  | 'friction-growth'  // conflict-prone but generative

export interface RelationalDynamic {
  userA: string;
  userB: string;
  computedAt: number;

  type: RelationalDynamicType;
  description: string;
  warnings: string[];    // what to watch — not "bad", just load-bearing dynamics

  axes: {
    persistenceDelta: number;    // difference in bond retention
    elasticityDelta: number;     // difference in separation tolerance
    regulationDelta: number;     // difference in consistency
    latencyDelta: number;        // difference in processing speed
  };

  processingCompatibility: number;  // 0–1 — latency alignment
  regulationCompatibility: number;  // 0–1 — rhythm alignment
  overallFit: number;               // 0–1 — weighted composite
}
