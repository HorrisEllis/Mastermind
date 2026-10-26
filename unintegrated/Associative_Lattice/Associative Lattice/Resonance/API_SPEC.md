# RESONANCE ENGINE — API SPECIFICATION
version: 0.1.0

---

## Overview

The Resonance Engine models how two evolving human expression systems relate.

It is **not** a similarity engine. It is a **phase-detection system** for meaning construction.

Three layers:

1. **Signal Extraction** — converts raw text into a structured feature vector
2. **Trajectory + Oscillation** — builds a time-series model of a person's expression dynamics
3. **Resonance + ASE** — computes how two systems interact, and tracks identity drift

---

## Core Objects

### SignalVector
A single text sample reduced to a multi-axis expression vector.

```json
{
  "userId": "string",
  "timestamp": 1714000000000,
  "text": "original text",
  "cognition": {
    "abstractionLevel": 0.0,
    "linearity": 0.0,
    "recursionDepth": 0.0,
    "systemThinking": 0.0,
    "compression": 0.0
  },
  "affect": {
    "valence": 0.5,
    "volatility": 0.0,
    "attachmentLoad": 0.0,
    "urgency": 0.0,
    "somaticDensity": 0.0
  },
  "language": {
    "metaphorDensity": 0.0,
    "symbolicUsage": 0.0,
    "poeticness": 0.0,
    "analyticalness": 0.0,
    "narrativeStructure": 0.0
  },
  "entropy": 0.0,
  "intensity": 0.0,
  "extractionMethod": "heuristic | llm | hybrid",
  "confidence": 0.0
}
```

All numeric values: `float [0.0–1.0]`.

---

### OscillationProfile
Computed from a user's signal history. Describes how their expression moves.

```json
{
  "userId": "string",
  "windowSize": 20,
  "computedAt": 1714000000000,
  "amplitude": {
    "cognition": 0.0,
    "affect": 0.0,
    "language": 0.0,
    "overall": 0.0
  },
  "frequency": {
    "cognition": 0.0,
    "affect": 0.0,
    "language": 0.0
  },
  "phaseShift": {
    "direction": "ascending | descending | stable | oscillating",
    "magnitude": 0.0
  },
  "stability": 0.0,
  "recovery": 0.0,
  "currentPhase": 0.0
}
```

`currentPhase` [0–1]: position in current oscillation cycle.
`stability` [0–1]: 0 = chaotic, 1 = stable.
`recovery` [0–1]: 0 = slow to return to baseline, 1 = fast.

---

### ResonanceResult

```json
{
  "userA": "string",
  "userB": "string",
  "computedAt": 1714000000000,
  "structural": 0.0,
  "oscillation": 0.0,
  "temporal": 0.0,
  "total": 0.0,
  "matchType": "mirror | complementary | friction | dissonant",
  "insights": ["string"],
  "axes": {
    "cognition": 0.0,
    "affect": 0.0,
    "language": 0.0
  }
}
```

**Match types:**

| Type | Description |
|------|-------------|
| `mirror` | High similarity across all axes — recognition |
| `complementary` | Similar structure, different oscillation — mutual stabilization |
| `friction` | Shared cognition, different affect — growth tension |
| `dissonant` | Low structural + oscillation match |

**Score weights:**
```
total = structural × 0.45 + oscillation × 0.45 + temporal × 0.10
```

---

### AuthorshipSignature
The stable, evolving model of a person's expression identity.
Updated via exponential moving average — resistant to single-event noise.

```json
{
  "userId": "string",
  "version": 1,
  "createdAt": 1714000000000,
  "updatedAt": 1714000000000,
  "sampleSize": 0,
  "core": {
    "cognition": { ... },
    "affect": { ... },
    "language": { ... },
    "entropy": 0.0,
    "intensity": 0.0
  },
  "fingerprint": {
    "highVarianceAxes": ["string"],
    "lowVarianceAxes": ["string"],
    "dominantMode": "string",
    "secondaryMode": "string"
  },
  "drift": {
    "magnitude": 0.0,
    "direction": ["string"],
    "lastShiftAt": null,
    "isShifting": false
  }
}
```

**Dominant modes:**
- `systems-architect` — high abstraction, causal modeling
- `symbolic-poet` — metaphor-rich, archetypal language
- `deep-internal-processor` — high self-reference, low relational load
- `somatic-emotive` — body-grounded, emotional volatility
- `analytical-structured` — logical connectors, linear structure
- `relational-narrator` — high attachment load, narrative arc
- `high-entropy-synthesizer` — novel, dense, nonlinear
- `high-intensity-driver` — urgency + saturation
- `adaptive-generalist` — no dominant axis

---

## Endpoints

Base URL: `http://localhost:4747/api`

---

### POST `/signal/ingest`

Ingest a text signal for a user. Updates their trajectory and authorship signature.

**Request:**
```json
{
  "userId": "alice",
  "text": "Full text of post, message, or input",
  "forceLLM": false
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | yes | User identifier |
| `text` | string | yes | Raw text (min 5 chars) |
| `forceLLM` | boolean | no | Override threshold, always use LLM extraction |

**Response:**
```json
{
  "signal": { ... SignalVector },
  "signature": { ... AuthorshipSignature },
  "trusted": true,
  "sampleCount": 12
}
```

`trusted: true` when `sampleCount >= 5` (configurable).

---

### GET `/trajectory/:userId`

Full signal history + oscillation profile for a user.

**Query params:**
- `window=N` — only return last N signals (default: all)

**Response:**
```json
{
  "userId": "alice",
  "count": 42,
  "signals": [ ... SignalVector[] ],
  "oscillation": { ... OscillationProfile },
  "signature": { ... AuthorshipSignature }
}
```

---

### GET `/oscillation/:userId`

Oscillation profile only.

**Query params:**
- `window=N` — compute over last N signals

**Response:** `OscillationProfile`

---

### POST `/resonance/query`

Compute resonance between two users.

**Request:**
```json
{
  "userA": "alice",
  "userB": "bob",
  "window": 20
}
```

**Response:** `ResonanceResult`

---

### POST `/resonance/batch`

Compare one user against many targets. Returns sorted by total resonance.

**Request:**
```json
{
  "userId": "alice",
  "targets": ["bob", "carol", "dan"],
  "window": 20
}
```

**Response:**
```json
{
  "userId": "alice",
  "results": [ ... ResonanceResult[] ]
}
```

Results ordered by `total` descending. No hierarchy of worth — only dynamics.

---

### GET `/signature/:userId`

Authorship signature for a user.

**Response:** `AuthorshipSignature`

---

### GET `/signature/distance/:a/:b`

Signature-level distance between two users.
Slower to move than raw resonance — reflects stable identity, not current state.

**Response:**
```json
{
  "userA": "alice",
  "userB": "bob",
  "distance": 0.18,
  "similarity": 0.82
}
```

`distance` [0–1]: 0 = identical signatures, 1 = maximally different.

---

### GET `/health`

```json
{
  "status": "ok",
  "users": 7,
  "timestamp": 1714000000000
}
```

---

## Extraction Pipeline

```
text input
    │
    ▼
heuristics.ts          ← lexicon + pattern matching, <1ms, no network
    │
    ▼
confidence score
    │
    ├─ confidence >= threshold (default 0.55) ──► return heuristic signal
    │
    └─ confidence < threshold ──► extractLLM()
                                      │
                                      ▼
                                  Claude API
                                  structured JSON response
                                      │
                                      ▼
                                  blend(heuristic, llm, confidence)
                                      │
                                      ▼
                                  hybrid signal
```

**Confidence degrades when:**
- Text is < 20 words
- All feature scores cluster near zero
- Very low variance across axes (neutral/ambiguous text)

**LLM extraction disabled** if no `ANTHROPIC_API_KEY` — falls back to heuristic with degraded confidence flag.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `4747` | Server port |
| `ANTHROPIC_API_KEY` | — | Enable LLM extraction |
| `DATA_DIR` | `./data` | Root data directory |

---

## Programmatic Usage (no server)

```typescript
import { ResonanceEngine } from 'resonance-engine';

const engine = new ResonanceEngine({
  dataDir: './data',
  apiKey: process.env.ANTHROPIC_API_KEY,
  llmThreshold: 0.55
});

// Ingest
await engine.ingest('alice', 'some text from alice...');
await engine.ingest('bob', 'some text from bob...');

// Resonance
const result = engine.resonance('alice', 'bob');
console.log(result.matchType, result.total, result.insights);

// Signature
const sig = engine.signature('alice');
console.log(sig?.fingerprint.dominantMode);
```

---

## Design Invariants

1. **People are time-series systems, not points.** Never collapse a user to a single score.
2. **Resonance describes dynamics, not worth.** No hierarchy. No "best match."
3. **Signatures drift slowly by design.** EMA alpha = 0.15. One bad day doesn't rewrite identity.
4. **LLM is a refinement layer, not the foundation.** Heuristics run first, always.
5. **Match type is a description of relationship physics**, not personality compatibility.
6. **Insights explain WHAT matched**, not WHO someone is.

---

---

# INTIMACY DYNAMICS LAYER (IDL) — v0.1

Sits on top of the Resonance Engine. Models how a person behaves under relational load — not personality, not identity. State-dependent behavior patterns derived from signal history.

---

## Additional Core Objects

### IntimacyVector

Computed from a user's full signal history. Four axes, all values `float [0.0–1.0]`.

```json
{
  "userId": "alice",
  "computedAt": 1714000000000,
  "sampleSize": 18,

  "persistence": {
    "bondRetention": 0.0,
    "repairTendency": 0.0,
    "returnLikelihood": 0.0
  },

  "elasticity": {
    "separationTolerance": 0.0,
    "independenceStability": 0.0,
    "nonCling": 0.0
  },

  "regulation": {
    "predictability": 0.0,
    "emotionalConsistency": 0.0,
    "relationalPacing": 0.0
  },

  "latency": {
    "internalDepth": 0.0,
    "expressionDelay": 0.0,
    "integrationTime": 0.0
  }
}
```

**Axes:**

| Axis | What it measures |
|------|-----------------|
| `persistence` | Bond inertia — does the person stay, repair, return? |
| `elasticity` | Separation tolerance — can they self-regulate at distance? |
| `regulation` | Rhythm consistency — predictable or volatile relational pacing? |
| `latency` | Processing depth — internal-first or external-first expression? |

All four are inferred from signal history. No separate input required.

---

### IntimacyMode

Dominant behavioral attractor. **Not an identity label. A state cluster.**

```json
{
  "primary": "deep-processor",
  "secondary": "structured-devotional",
  "confidence": 0.72,
  "description": "Internalizes before expressing. Emotion is compressed and integrated before output. Silence is not absence."
}
```

**Mode names:**

| Mode | Signature |
|------|-----------|
| `structured-devotional` | High persistence + low volatility. Bonds hold. Repair-oriented. |
| `chaotic-attachment` | High amplitude oscillation. Intense closeness followed by distance. |
| `detached-autonomous` | High elasticity. Stable internal state independent of proximity. |
| `deep-processor` | High latency. Internal integration before expression. |
| `fluid-relational` | Adaptive. No dominant axis. Context-sensitive bonding. |
| `anxious-attacher` | Low elasticity + reactive. Separation activates distress. |
| `reciprocal-builder` | High repair + steady pacing. Grows bonds deliberately. |

`confidence` [0–1]: gap between primary and secondary score. Low confidence = genuinely mixed pattern.

---

### RelationalDynamic

Interaction physics between two users' IDL profiles. Describes the **shape of how two systems meet**, not whether they should.

```json
{
  "userA": "alice",
  "userB": "bob",
  "computedAt": 1714000000000,

  "type": "stabilizing",
  "description": "One system stabilizes the other's oscillation...",
  "warnings": [
    "Processing speed mismatch (Δ0.42): User B externalizes faster..."
  ],

  "axes": {
    "persistenceDelta": 0.0,
    "elasticityDelta": 0.0,
    "regulationDelta": 0.0,
    "latencyDelta": 0.0
  },

  "processingCompatibility": 0.0,
  "regulationCompatibility": 0.0,
  "overallFit": 0.0
}
```

**Dynamic types:**

| Type | Description |
|------|-------------|
| `mirroring` | Same pattern — immediate recognition, watch for shared blind spots |
| `stabilizing` | One grounds the other's volatility |
| `oscillating` | Both high-amplitude — amplify each other |
| `complementary` | Different axes that complete each other |
| `friction-growth` | Generative mismatch — pressure without damage when both systems are stable |
| `asymmetric` | Large latency mismatch — pacing is the primary load-bearing risk |

**`warnings[]`** — not red flags. Load-bearing dynamics that, when named explicitly, lose most of their destructive potential.

`overallFit` [0–1]: weighted composite of axis similarity + processing/regulation compatibility + dynamic type modifier.

---

## IDL Endpoints

### GET `/idl/:userId`

Compute IntimacyVector + IntimacyMode for a user from their full signal history.

Requires at least **3 ingested signals**.

**Response:**
```json
{
  "userId": "alice",
  "vector": { ... IntimacyVector },
  "mode": { ... IntimacyMode }
}
```

---

### POST `/idl/dynamic`

Compute relational dynamic between two users.

**Request:**
```json
{
  "userA": "alice",
  "userB": "bob"
}
```

Both users must have at least 3 signals.

**Response:**
```json
{
  "dynamic": { ... RelationalDynamic },
  "modeA": { ... IntimacyMode },
  "modeB": { ... IntimacyMode }
}
```

---

### POST `/idl/batch`

Compare one user's IDL profile against multiple targets. Returns sorted by `overallFit` descending.

**Request:**
```json
{
  "userId": "alice",
  "targets": ["bob", "carol", "dan"]
}
```

**Response:**
```json
{
  "userId": "alice",
  "modeA": { ... IntimacyMode },
  "results": [
    {
      "targetId": "bob",
      "dynamic": { ... RelationalDynamic },
      "modeB": { ... IntimacyMode }
    }
  ]
}
```

Targets with fewer than 3 signals are silently skipped.

---

---

# FEED — v0.1

A resonance feed. Surfaces content from other users whose expression systems meaningfully intersect with the viewer's — across resonance structure, IDL dynamic, novelty, and temporal phase.

**Not an engagement feed. Not ranked by popularity, recency, or predicted click.**

---

## Additional Core Objects

### FeedScore

```json
{
  "total": 0.0,
  "resonanceScore": 0.0,
  "dynamicScore": 0.0,
  "noveltyScore": 0.0,
  "phaseScore": 0.0,
  "primaryReason": "Different oscillation patterns — they carry what you're not holding right now.",
  "matchType": "complementary",
  "dynamicType": "stabilizing"
}
```

**Score weights (by preset):**

| Preset | resonance | dynamic | novelty | phase |
|--------|-----------|---------|---------|-------|
| `balanced` | 0.40 | 0.35 | 0.15 | 0.10 |
| `resonance-heavy` | 0.65 | 0.20 | 0.10 | 0.05 |
| `dynamic-heavy` | 0.25 | 0.55 | 0.10 | 0.10 |
| `novel` | 0.30 | 0.25 | 0.35 | 0.10 |

**Novelty decay:**

| Time since last surfaced | Novelty score |
|--------------------------|---------------|
| < 1 hour | 0.10 |
| 1–6 hours | 0.30 |
| 6–24 hours | 0.60 |
| 24–72 hours | 0.85 |
| > 72 hours | 1.00 |

**Resonance type modifiers applied to `resonanceScore`:**

| matchType | modifier |
|-----------|----------|
| `complementary` | +0.10 |
| `mirror` | +0.05 |
| `friction` | +0.05 |
| `dissonant` | −0.10 (filtered unless `novel` preset) |

**Dynamic type modifiers applied to `dynamicScore`:**

| dynamicType | modifier |
|-------------|----------|
| `stabilizing` | +0.10 |
| `complementary` | +0.08 |
| `mirroring` | +0.05 |
| `friction-growth` | +0.02 |
| `asymmetric` | −0.05 |
| `oscillating` | −0.08 |

---

### FeedItem (slim — from `/feed/generate`)

```json
{
  "targetUserId": "bob",
  "targetSignalTimestamp": 1714000000000,
  "targetTextPreview": "first 200 chars of the signal that triggered this item",
  "score": { ... FeedScore },
  "resonanceMatchType": "complementary",
  "resonanceTotal": 0.74,
  "resonanceInsights": ["string"],
  "dynamicType": "stabilizing",
  "dynamicDescription": "One system stabilizes the other's oscillation...",
  "dynamicWarnings": [],
  "modeA": { ... IntimacyMode },
  "modeB": { ... IntimacyMode }
}
```

---

## Feed Endpoints

### POST `/feed/generate`

Generate a resonance feed for a viewer. Returns slim items — optimized for client display.

**Request:**
```json
{
  "userId": "alice",
  "limit": 20,
  "excludeUserIds": [],
  "freshWindowHours": 48,
  "weightPreset": "balanced"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `userId` | string | required | Viewer |
| `limit` | number | 20 | Max items returned |
| `excludeUserIds` | string[] | [] | Users to never surface |
| `freshWindowHours` | number | 48 | Only consider signals newer than N hours |
| `weightPreset` | string | `balanced` | One of: `balanced`, `resonance-heavy`, `dynamic-heavy`, `novel` |

**Response:**
```json
{
  "viewerId": "alice",
  "generatedAt": 1714000000000,
  "totalCandidates": 34,
  "returned": 20,
  "weights": { "resonance": 0.40, "dynamic": 0.35, "novelty": 0.15, "phase": 0.10 },
  "items": [ ... FeedItem[] ]
}
```

`totalCandidates` — how many users were evaluated before filtering. Useful for debugging feed sparsity.

---

### POST `/feed/full`

Same as `/feed/generate` but returns complete `ResonanceResult` and `RelationalDynamic` objects per item. Heavier payload — use for debug or rich client rendering.

Same request shape as `/feed/generate`.

**Response:** Full `FeedResult` with nested objects intact.

---

---

# Updated: `/signal/ingest` Response (v2)

`idlVector` is now included in the ingest response once the user has 3+ signals. No separate IDL call needed during normal ingestion flow.

```json
{
  "signal": { ... SignalVector },
  "signature": { ... AuthorshipSignature },
  "idlVector": { ... IntimacyVector } | null,
  "trusted": true,
  "sampleCount": 12
}
```

`idlVector` is `null` for the first two signals, then populated automatically on every ingest thereafter.

---

# Updated: Design Invariants (v2)

7. **IDL modes are attractors, not identities.** The same person can shift modes under different relational conditions. `chaotic-attachment` is not a diagnosis — it is a high-variance waveform.
8. **Warnings name dynamics, they do not prohibit connection.** A latency mismatch named explicitly loses most of its damage potential.
9. **The feed surfaces what will meet you, not what will please you.** `complementary` outscores `mirror` because echo chambers degrade over time.
10. **IDL is computed from signals — no separate intake.** The signal history carries enough structure to derive relational behavior. No surveys, no self-report.
