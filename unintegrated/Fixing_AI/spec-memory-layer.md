# NEXUS — Memory Layer Spec
**Modules:** Lattice-index · Crystal · Seam  
**Files:** `memory/lattice-index.js` · `memory/crystal.js` · `memory/seam.js`  
**Boot phase:** PHASE 9 (SOFT)  
**Mastevos ref:** §8.2 · §8.3 · §8.4  
**Date:** 2026-05-26  
**Supersedes:** stub entries in v8.0 §8.2–8.4

---

## READING THIS SPEC

The memory layer transforms raw agent output into durable, structured knowledge. Three modules — three stages of compression:

- **Lattice-index:** Tokenizes all incoming memory entries and builds an associative word lattice. Terms that appear together frequently are linked. High-weight edges are patterns. This is the pattern recognition substrate.
- **Crystal:** Reads delta records and lattice edges to find facts that have appeared consistently without contradiction. Writes them as `crystals` — stable, long-lived beliefs. The `crystals` table already exists in JAA; Crystal is its first writer.
- **Seam:** Detects when Callto-executor ran the same prompt through multiple AI providers in parallel. Diffs the responses structurally. Writes the structural diff as a `seam_record`. Crystal only crystallizes from verified seams.

The pipeline is: **raw events → memory_index → Lattice-index → lattice patterns → Crystal → stable beliefs → Seam verification → verified beliefs → BEP triples**.

---

## CONSTITUTIONAL CONSTRAINTS

- **LAW I:** None of these modules makes agent calls. All computation is local, no-API.
- **LAW II:** Every lattice node, every edge, every crystal, every seam record — JAA row before behavior. Lattice is not held only in memory.
- **LAW III:** Lattice-index, Crystal, and Seam never import each other. Crystal reads `lattice_edges` (written by Lattice-index) via JAA poll. Seam reads `chat_completions` (written by Siphon) via JAA poll. No direct calls.
- **LAW IV:** Crystal rows validated against reconciled `crystal.schema.json` (§20.3). Seam rows validated against `seam.schema.json` (🔴 BUILD). Lattice rows validated inline.
- **LAW V:** Full lattice, crystal, and seam state accessible via CLI.
- **LAW VI:** Crystal formation toasted TEAL. Seam verification toasted GREEN. Pattern emergence toasted BLUE.

---

## SCHEMAS REQUIRED BEFORE BUILD

### `schemas/seam.schema.json`

Status: `🔴 BUILD` (§20.1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Seam Record",
  "type": "object",
  "required": ["uuid", "intentUuid", "providerA", "providerB", "agreementZones", "disagreementZones", "uniqueToA", "uniqueToB", "agreementCoverage", "verified", "ts", "source", "causedBy"],
  "properties": {
    "uuid":              { "type": "string" },
    "intentUuid":        { "type": "string", "description": "Original agent_calls or event UUID that triggered both completions" },
    "providerA":         { "type": "string", "enum": ["claude", "chatgpt", "gemini", "ollama", "unknown"] },
    "providerB":         { "type": "string", "enum": ["claude", "chatgpt", "gemini", "ollama", "unknown"] },
    "completionUuidA":   { "type": "string" },
    "completionUuidB":   { "type": "string" },
    "agreementZones": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["text", "confidence"],
        "properties": {
          "text":       { "type": "string" },
          "confidence": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "disagreementZones": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["a", "b", "delta"],
        "properties": {
          "a":     { "type": "string" },
          "b":     { "type": "string" },
          "delta": { "type": "number", "minimum": 0, "maximum": 1 }
        }
      }
    },
    "uniqueToA":          { "type": "array", "items": { "type": "string" } },
    "uniqueToB":          { "type": "array", "items": { "type": "string" } },
    "agreementCoverage":  { "type": "number", "minimum": 0, "maximum": 1, "description": "Fraction of response covered by agreement zones" },
    "verified":           { "type": "boolean", "description": "Set true by Orion verify stage when agreementCoverage >= threshold" },
    "ts":                 { "type": "integer" },
    "source":             { "type": "string" },
    "causedBy":           { "type": "string" }
  }
}
```

### `crystal.schema.json` — Reconcile (§20.3)

Status: `⚠️ RECONCILE`. The reconciled schema must carry all fields from both the existing MCL schema and the Mastermind.md belief model:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Crystal",
  "type": "object",
  "required": ["uuid", "statement", "confidence", "ageMs", "supportCount", "sourceUuids", "fragility", "state", "ts", "source"],
  "properties": {
    "uuid":              { "type": "string" },
    "statement":         { "type": "string", "description": "The crystallized belief in plain language" },
    "confidence":        { "type": "number", "minimum": 0, "maximum": 1 },
    "ageMs":             { "type": "integer", "description": "Milliseconds since first supporting evidence" },
    "supportCount":      { "type": "integer", "minimum": 1 },
    "sourceUuids":       { "type": "array", "items": { "type": "string" }, "description": "event_log or seam_record UUIDs that support this belief" },
    "fragility":         { "type": "number", "minimum": 0, "maximum": 1, "description": "High = recent high-surprise events near this belief's terms" },
    "state":             { "type": "string", "enum": ["candidate", "stable", "decaying", "invalidated"] },
    "coreEventId":       { "type": ["string", "null"], "description": "First event UUID that seeded this crystal" },
    "stabilityScore":    { "type": "number", "minimum": 0, "maximum": 1 },
    "crossLaneCount":    { "type": "integer", "description": "How many distinct providers/agents supported this belief" },
    "recurrenceHalfLife":{ "type": ["integer", "null"], "description": "Ms between appearances. Lower = more frequent = more stable." },
    "feedbackAlignment": { "type": "number", "minimum": 0, "maximum": 1 },
    "causalIntegration": { "type": "number", "minimum": 0, "maximum": 1 },
    "contradictionScore":{ "type": "number", "minimum": 0, "maximum": 1 },
    "accessCount":       { "type": "integer" },
    "promotedAt":        { "type": ["integer", "null"] },
    "createdAt":         { "type": "integer" },
    "ts":                { "type": "integer" },
    "source":            { "type": "string" },
    "causedBy":          { "type": ["string", "null"] }
  }
}
```

---

## MODULE 7: LATTICE-INDEX — `memory/lattice-index.js`

### What

Associative word lattice for pattern recognition. Every 10 seconds, Lattice-index reads new `memory_index` entries, tokenizes their `content`, and updates two JAA tables:
- `lattice_nodes`: one row per unique term with frequency and source tracking
- `lattice_edges`: one row per co-occurring term pair, with PMI weight

When an edge's co-occurrence count crosses a configurable threshold (default 5), a `lattice.pattern.emerging` event is emitted. BEP-engine reads `lattice_edges` for the pattern cluster component of BEP triples.

**Note:** Lattice-index is listed as `BUILT` in §21 of Mastevos directory structure. This spec provides the authoritative complete specification for verifying or extending that implementation.

### Why

The `bep_patterns` table has been empty since it was declared. Lattice-index is the mechanism that finds the patterns. It requires no external NLP library, no ML model, no API call. PMI (Pointwise Mutual Information) is computable from counts alone and is the standard statistical measure of term association strength.

### COBALT Declaration

```json
{
  "id": "memory.lattice-index",
  "file": "memory/lattice-index.js",
  "layer": "memory",
  "title": "memory.lattice-index",
  "description": "Associative word lattice. Tokenizes memory_index entries, builds lattice_nodes and lattice_edges with PMI weights. Emits lattice.pattern.emerging events when co-occurrence threshold crossed.",
  "reads": ["memory_index"],
  "writes": ["lattice_nodes", "lattice_edges", "toasts", "failures", "event_log"],
  "polls": true,
  "pollIntervalMs": 10000,
  "bootPhase": 9,
  "gapContract": {
    "maxLatencyMs": 30000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "lattice status",
      "args": [],
      "flags": [],
      "emits": "cli.lattice.status",
      "reads": ["lattice_nodes", "lattice_edges"],
      "writes": [],
      "intent": "Show lattice stats: node count, edge count, top terms by frequency, top edges by PMI weight",
      "example": "nexus lattice status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "lattice search <term>",
      "args": ["<term>"],
      "flags": ["--depth <n>"],
      "emits": "cli.lattice.search",
      "reads": ["lattice_nodes", "lattice_edges"],
      "writes": [],
      "intent": "Find a term in the lattice and show its top co-occurring terms by PMI weight",
      "example": "nexus lattice search bayesian --depth 2",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "lattice patterns [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.lattice.patterns",
      "reads": ["lattice_edges"],
      "writes": [],
      "intent": "List top N edges by PMI weight (strongest term associations in memory)",
      "example": "nexus lattice patterns --n 20",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Tokenization

```javascript
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','can','shall',
  'i','you','he','she','it','we','they','what','which','who','whom','this','that',
  'these','those','am','to','of','in','for','on','with','at','by','from','up',
  'about','into','through','during','before','after','above','below','between',
  'each','all','both','few','more','most','other','some','such','no','not','only',
  'own','same','than','too','very','just','but','and','or','nor','so','yet','both',
  'either','neither','one','two','three','also','then','there','here','when','where',
  'why','how','its','our','their','my','your','his','her'
]);

function _tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w))
    .map(w => w.slice(0, 5));   // stem to 5-char prefix
}
```

5-char prefix stemming: "bayesian" → "bayes", "crystallization" → "cryst", "architectural" → "archi". Imprecise but dependency-free and consistent.

### How — PMI Computation

PMI (Pointwise Mutual Information) measures how much more often two terms co-occur than would be expected by chance:

```
PMI(A, B) = log( P(A,B) / (P(A) * P(B)) )
           = log( (coCount(A,B) * totalDocs) / (count(A) * count(B)) )
```

All inputs are counts stored in `lattice_nodes` and `lattice_edges`. No external computation needed.

In practice, PMI is computed at query time (CLI display or BEP-engine read), not stored — `lattice_edges` stores `coCount` and the raw term counts are in `lattice_nodes`. PMI is derived:

```javascript
function pmi(termA, termB, totalDocs) {
  const coCount = edge.coCount;
  const countA  = nodeA.termCount;
  const countB  = nodeB.termCount;
  return Math.log((coCount * totalDocs) / (countA * countB));
}
```

The `weight` field in `lattice_edges` stores a **normalized PMI** (NPMI) in [0,1]:

```
NPMI(A, B) = PMI(A, B) / -log(P(A,B))
           = PMI(A, B) / -log(coCount / totalDocs)
```

NPMI = 1: terms always appear together. NPMI = 0: terms independent. NPMI < 0: terms avoid each other.

### How — Poll Loop

Every 10 seconds:

**1. Read new memory_index entries** (watermark `_lastMemRowId`):

```javascript
const newEntries = jaaDB.query('memory_index', r => r._rowId > _lastMemRowId, 100);
```

**2. For each entry: tokenize**

```javascript
const tokens = _tokenize(entry.content);
const uniqueTokens = [...new Set(tokens)];
```

**3. Update lattice_nodes**

For each unique token in `uniqueTokens`:

```javascript
const existing = _nodeCache.get(token);  // in-memory cache keyed by term stem
if (!existing) {
  const row = { uuid: uid(), term: token, termCount: 1, lastSeen: entry.ts, sourceUuids: [entry.uuid], ts: Date.now(), source: 'memory.lattice-index' };
  await jaaDB.insert('lattice_nodes', row);
  _nodeCache.set(token, row);
} else {
  const updated = { ...existing, termCount: existing.termCount + 1, lastSeen: entry.ts, sourceUuids: [...new Set([...existing.sourceUuids, entry.uuid])].slice(0, 50) };
  await jaaDB.update('lattice_nodes', existing.uuid, updated);
  _nodeCache.set(token, updated);
}
_totalDocs++;
```

`sourceUuids` capped at 50 most recent. `_totalDocs` is the running document count (incremented once per `memory_index` entry, not per token).

**4. Update lattice_edges**

For each unique pair `(tokenA, tokenB)` where `tokenA < tokenB` (lexicographic — ensures each pair has one canonical edge):

```javascript
const edgeKey = `${tokenA}:${tokenB}`;
const existing = _edgeCache.get(edgeKey);
if (!existing) {
  const row = { uuid: uid(), termA: tokenA, termB: tokenB, coCount: 1, weight: 0, ts: Date.now(), source: 'memory.lattice-index' };
  await jaaDB.insert('lattice_edges', row);
  _edgeCache.set(edgeKey, row);
} else {
  const newCoCount = existing.coCount + 1;
  const weight = _npmi(tokenA, tokenB, newCoCount);
  const updated = { ...existing, coCount: newCoCount, weight, ts: Date.now() };
  await jaaDB.update('lattice_edges', existing.uuid, updated);
  _edgeCache.set(edgeKey, updated);

  // Pattern emergence check
  if (existing.coCount < PATTERN_THRESHOLD && newCoCount >= PATTERN_THRESHOLD) {
    _emitPatternEmerging(tokenA, tokenB, weight, entry.uuid);
  }
}
```

`PATTERN_THRESHOLD` = 5 (configurable via `config.json`: `lattice.patternThreshold`).

**5. Emit pattern emergence event**

```javascript
function _emitPatternEmerging(termA, termB, weight, causedBy) {
  jaaDB.insert('event_log', {
    uuid: uid(), type: 'lattice.pattern.emerging',
    source: 'memory.lattice-index',
    payload: { termA, termB, weight, coCount: PATTERN_THRESHOLD },
    causedBy, ts: Date.now()
  });
  _toast('toast.info', `Lattice: pattern emerging — "${termA}" + "${termB}" (weight: ${weight.toFixed(3)})`, {});
}
```

BEP-engine subscribes to `lattice.pattern.emerging` via JAA poll on `event_log`.

**6. Advance watermark**

### Pair Generation

For an entry with N unique tokens, the number of pairs is N*(N-1)/2. For large entries (many unique tokens), this becomes expensive. Cap:

- If `uniqueTokens.length > 30`: randomly sample 30 tokens before pair generation. Log to `event_log` that sampling occurred. This bounds pairs at 435 per entry.
- 30-token cap covers nearly all practical memory entries (most are <200 words, producing <30 unique non-stop stems).

### In-Memory Caches

`_nodeCache` (Map: term → node row) and `_edgeCache` (Map: `termA:termB` → edge row) are built at `init()` by scanning all existing `lattice_nodes` and `lattice_edges` rows. This is a one-time full scan at boot.

At high lattice sizes (>100K nodes, >1M edges), this scan takes seconds — acceptable at PHASE 9 boot time. Once cached, per-tick operations are O(N) in token count, not in lattice size.

### Failure Modes

| Failure | Behavior |
|---|---|
| `memory_index` unreadable | Insert `failures`. Toast.error. Hold watermark. Retry next tick. |
| `lattice_nodes` insert/update fails | Insert `failures`. Toast.error. Remove from cache (force re-check next tick). |
| `lattice_edges` insert/update fails | Insert `failures`. Toast.error. Remove from edge cache. |
| Cache rebuild fails at init | Toast.error. Boot with empty cache — lattice rebuilds from live events. Duplicate rows possible until compaction. |
| Entry with no usable tokens (all stopwords or sub-3-char) | Skip. No JAA write. Advance watermark. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Pattern emerging (edge crosses threshold) | `toast.info` | BLUE |
| Init cache rebuild complete | `toast.info` | BLUE |
| Node/edge insert failure | `toast.error` | RED |
| Init failure | `toast.error` | RED |

---

## MODULE 8: CRYSTAL — `memory/crystal.js`

### What

Belief crystallizer. Reads `delta_records` and `lattice_edges` to find facts that have appeared consistently across multiple conversations without contradiction, then crystallizes them into the `crystals` table. Crystal is the first and only writer to `crystals` — the table has existed in JAA since v8.0 but has had no writer until now.

Crystal only crystallizes beliefs from **verified seams** (where `seam_records.verified === true`). Raw agent output produces `candidate` state crystals. Cross-AI agreement verified by Orion promotes them to `stable`.

### Why

The cockpit's Versionium "Age of knowledge" sigma display needs a data source. The BEP-engine needs beliefs. The self-model needs `crystalCount`. Watchman uses crystal fragility as a system health proxy. All of these have been waiting for Crystal to write its first row.

More fundamentally: without Crystal, there is no compressed long-term memory. Every agent call re-generates everything from scratch. Crystal is how the system accumulates knowledge rather than just generating it.

### COBALT Declaration

```json
{
  "id": "memory.crystal",
  "file": "memory/crystal.js",
  "layer": "memory",
  "title": "memory.crystal",
  "description": "Belief crystallizer. Reads delta_records and lattice_edges, finds stable repeated facts, writes crystals. Only verified seams produce stable crystals. Computes fragility from recent surprise scores near crystal terms.",
  "reads": ["delta_records", "lattice_edges", "lattice_nodes", "seam_records", "memory_index"],
  "writes": ["crystals", "toasts", "failures", "event_log", "gaps"],
  "polls": true,
  "pollIntervalMs": 30000,
  "bootPhase": 9,
  "gapContract": {
    "maxLatencyMs": 120000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "crystal list [--state stable|candidate|decaying] [--n 20]",
      "args": [],
      "flags": ["--state <s>", "--n <n>"],
      "emits": "cli.crystal.list",
      "reads": ["crystals"],
      "writes": [],
      "intent": "List crystals filtered by state, sorted by confidence DESC",
      "example": "nexus crystal list --state stable",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "crystal show <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.crystal.show",
      "reads": ["crystals"],
      "writes": [],
      "intent": "Full crystal detail: statement, confidence, age, support count, fragility, source UUIDs",
      "example": "nexus crystal show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "crystal search <term>",
      "args": ["<term>"],
      "flags": [],
      "emits": "cli.crystal.search",
      "reads": ["crystals"],
      "writes": [],
      "intent": "Find crystals whose statement contains the search term",
      "example": "nexus crystal search bayesian",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "crystal age",
      "args": [],
      "flags": [],
      "emits": "cli.crystal.age",
      "reads": ["crystals"],
      "writes": [],
      "intent": "Show age distribution of crystals (histogram of ageMs), plus mean confidence vs age scatter",
      "example": "nexus crystal age",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Candidate Seeding

Crystal does not scan all of `memory_index` looking for facts to crystallize (too slow, too imprecise). It has two feed paths:

**Path A — Seam-verified:** When a `seam_records` row exists with `verified = true`, Crystal reads its `agreementZones`. Each agreement zone is a candidate belief. Zones with `confidence > 0.85` are promoted directly to `stable`.

**Path B — Repeated memory entries:** Crystal scans the last 500 `memory_index` rows (capped — not full scan). It looks for term clusters (`lattice_edges` with `coCount > 15` — higher threshold than pattern emergence) and checks if these clusters appear in multiple memory entries from **different** `source` UUIDs (i.e., different agents mentioned the same concepts independently).

If a term cluster appears in ≥ 3 entries from ≥ 2 distinct sources with `coCount > 15`: a `candidate` crystal is created.

### How — Statement Generation

Crystal does not call an LLM to generate the belief statement. It constructs it from the source material:

**For seam-verified beliefs:** `statement = agreementZone.text`. The agreement zone text is the statement. It came from two AIs agreeing, filtered to `confidence > 0.85`. It is already precise enough.

**For lattice-cluster beliefs:** `statement = "Pattern: [termA] + [termB] + [termC] consistently associated across [sourceCount] sources"`. Not a natural-language belief — a structured pattern descriptor. This is sufficient for BEP-engine matching and self-model rendering.

Future enhancement: Cortex v2's `ask` command can use these pattern descriptors as context.

### How — Confidence Computation

For seam-verified crystals: `confidence = agreementZone.confidence`. Directly from Seam.

For lattice-cluster crystals: Bayesian computation from evidence counts.

```javascript
function _computeConfidence(coCount, sourceCount, totalDocs) {
  // P(belief is real) ∝ how often terms co-occur * how many distinct sources
  const freqScore    = Math.min(1, coCount / 50);          // 50+ cooccurrences = max freq score
  const sourceScore  = Math.min(1, (sourceCount - 1) / 5); // 6+ distinct sources = max source score
  const priorWeight  = 0.6;  // slight prior toward frequent patterns being real
  return priorWeight * freqScore + (1 - priorWeight) * sourceScore;
}
```

### How — Fragility Scoring

Fragility measures how much the neighborhood of a crystal's terms is currently shifting. High fragility = something nearby is changing, crystal may become outdated.

```javascript
async function _computeFragility(crystal) {
  // Get the stems of the crystal's statement
  const crystalStems = _tokenize(crystal.statement);

  // Get recent delta_records (last 24h) with high surpriseScore
  const recentDeltas = jaaDB.query('delta_records',
    r => r.ts > Date.now() - 86400000 && r.surpriseScore > 0.5,
    100
  );

  // For each high-surprise delta, check if its novelTerms overlap with crystalStems
  let overlapCount = 0;
  for (const delta of recentDeltas) {
    const deltaStems = (delta.novelTerms ?? []).map(t => t.slice(0, 5));
    const overlap = deltaStems.filter(t => crystalStems.includes(t));
    if (overlap.length > 0) overlapCount++;
  }

  // Fragility = proportion of recent high-surprise events that touched this crystal's terms
  return Math.min(1, overlapCount / Math.max(1, recentDeltas.length));
}
```

Fragility is recomputed on every Crystal tick (30s) for all existing `stable` crystals. High fragility (> 0.6) → emit `toast.warn` AMBER: `"Crystal fragile: [statement excerpt] — nearby concepts shifting"`. Write `event_log` row: `{ type: 'crystal.fragility.high', payload: { crystalUuid, fragility } }`.

Watchman reads crystal fragility via these event_log rows to contribute to system health scoring.

### How — State Machine

```
candidate → stable    when: verified=true via Orion/Seam (seam-path)
                        OR: supportCount >= 5 AND confidence >= 0.75 AND contradictionScore < 0.2
candidate → decaying  when: no new supporting evidence in 7 days (ageMs > 604800000 without new sourceUuids)
stable    → decaying  when: contradictionScore > 0.4 (BEP-engine sets this via bep.contradiction.detected)
decaying  → invalidated when: contradictionScore > 0.7
invalidated           terminal state — row remains for audit (§M1)
```

**contradictionScore update:** BEP-engine emits `bep.contradiction.detected` to `event_log` when a new delta_record contradicts a crystal's support cluster. Crystal polls `event_log` for these events and updates `contradictionScore`:

```javascript
// Crystal polls event_log for bep.contradiction.detected events (watermark pattern)
// On detection:
const existing = jaaDB.get('crystals', event.payload.crystalUuid);
const newContradictionScore = Math.min(1, existing.contradictionScore + 0.15);
await jaaDB.update('crystals', existing.uuid, { contradictionScore: newContradictionScore, ts: Date.now() });
// Apply state transition if thresholds crossed
```

### How — Crystal Row Construction

```json
{
  "uuid":               "<new uuid>",
  "statement":          "<belief text or pattern descriptor>",
  "confidence":         0.87,
  "ageMs":              86400000,
  "supportCount":       7,
  "sourceUuids":        ["seam-uuid-1", "chat_completion-uuid-2", "memory_index-uuid-3"],
  "fragility":          0.12,
  "state":              "stable",
  "coreEventId":        "<first seam or memory_index UUID>",
  "stabilityScore":     0.88,
  "crossLaneCount":     2,
  "recurrenceHalfLife": 172800000,
  "feedbackAlignment":  0.92,
  "causalIntegration":  0.78,
  "contradictionScore": 0.05,
  "accessCount":        0,
  "promotedAt":         "<timestamp of stable promotion>",
  "createdAt":          "<timestamp of candidate creation>",
  "ts":                 "<now>",
  "source":             "memory.crystal",
  "causedBy":           "<seam_record UUID or lattice_edge UUID>"
}
```

MCL fields (`stabilityScore`, `crossLaneCount`, `recurrenceHalfLife`, `feedbackAlignment`, `causalIntegration`):
- `stabilityScore = confidence * (1 - fragility)`
- `crossLaneCount = count of distinct providers in sourceUuids` (derived from chat_completions rows)
- `recurrenceHalfLife`: computed from timestamps of sourceUuids — median interval between supporting events
- `feedbackAlignment = 1 - contradictionScore`
- `causalIntegration`: fraction of sourceUuids that are causally linked (share `causedBy` chains) — computed via `jaaDB.query('causality_nodes', ...)` if available, else `0.5`

### How — Poll Loop

Every 30 seconds:

1. **Path A — Seam feed:** Read new `seam_records` where `verified = true` and `_rowId > _lastSeamRowId`. For each: extract agreement zones with confidence > 0.85. For each zone: check if a crystal with similar statement already exists (term overlap > 0.7). If yes: increment `supportCount`, update `sourceUuids`. If no: create new `candidate` crystal, immediately promote to `stable`.

2. **Path B — Lattice feed:** Read `lattice_edges` where `coCount > 15` and `_rowId > _lastEdgeRowId`. For each high-weight edge: check if crystal exists for this term pair. If no: gather supporting `memory_index` entries (entries containing both terms), count distinct sources. If ≥ 3 entries from ≥ 2 sources: create `candidate` crystal.

3. **Fragility update:** For all `stable` crystals, recompute `fragility`. Update rows where fragility changed by > 0.05. Emit fragility events.

4. **State transitions:** Scan all `candidate` and `stable` crystals for state transition triggers. Apply transitions. Emit toasts.

5. **Advance watermarks** for seam_records and lattice_edges.

**Batch cap per tick:** Path A: 20 seams. Path B: 50 edges. Fragility: all stable crystals (expected to be < 500 in practice).

### Failure Modes

| Failure | Behavior |
|---|---|
| `seam_records` unreadable | Insert `failures`. Skip Path A this tick. Toast.warn. |
| `lattice_edges` unreadable | Insert `failures`. Skip Path B this tick. Toast.warn. |
| `crystals` insert fails | Insert `failures`. Toast.error. Gap severity=`medium` (memory accumulation blocked). |
| `crystals` update fails (fragility, state) | Insert `failures`. Toast.warn. Old values persist — functionally degraded but not broken. |
| Statement similarity check (checking for duplicates) is too slow | Cap duplicate check at 100 most recent crystals. Accept occasional duplicates — compaction deduplicates. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| New crystal formed (any state) | `toast.crystal` | TEAL |
| Crystal promoted to stable | `toast.crystal` | TEAL |
| Crystal fragility high (> 0.6) | `toast.warn` | AMBER |
| Crystal state → decaying | `toast.warn` | AMBER |
| Crystal state → invalidated | `toast.warn` | AMBER |
| Init failure | `toast.error` | RED |

---

## MODULE 9: SEAM — `memory/seam.js`

### What

Multi-AI response merger. Watches `chat_completions` for sibling completions — two rows with the same `causedByCallto` (i.e., spawned by the same Callto-executor dispatch). When siblings are found, diffs the two responses at sentence level, identifies agreement zones, disagreement zones, and unique regions, then writes a `seam_record`.

The seam record is picked up by Orion-ext for its 4-stage quality gate. Only seams with `verified = true` (set by Orion verify stage) feed Crystal for stable belief formation.

### Why

This is the first time NEXUS has a cross-AI perspective on any single question. Without Seam, parallel AI calls produce two separate responses that never interact. With Seam, the agreement between two independent AIs is identified, measured, and preserved. That agreement is exactly the kind of epistemic evidence that should persist as a crystal.

Over time, seams also reveal where providers systematically disagree — those disagreement zones are themselves signal worth its own crystal ("Claude and ChatGPT consistently disagree about X").

### COBALT Declaration

```json
{
  "id": "memory.seam",
  "file": "memory/seam.js",
  "layer": "memory",
  "title": "memory.seam",
  "description": "Multi-AI response merger. Detects sibling chat_completions (same causedByCallto), diffs at sentence level, writes seam_records. Sets up Orion verify → Crystal formation pipeline.",
  "reads": ["chat_completions"],
  "writes": ["seam_records", "memory_index", "toasts", "failures", "event_log"],
  "polls": true,
  "pollIntervalMs": 5000,
  "bootPhase": 9,
  "gapContract": {
    "maxLatencyMs": 15000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "seam list [--n 20] [--verified]",
      "args": [],
      "flags": ["--n <n>", "--verified"],
      "emits": "cli.seam.list",
      "reads": ["seam_records"],
      "writes": [],
      "intent": "List recent seam records with provider pair, agreement coverage, and verified status",
      "example": "nexus seam list --n 10 --verified",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "seam show <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.seam.show",
      "reads": ["seam_records"],
      "writes": [],
      "intent": "Show full seam record: agreement zones, disagreement zones, unique content per provider",
      "example": "nexus seam show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "seam disagreements [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.seam.disagreements",
      "reads": ["seam_records"],
      "writes": [],
      "intent": "List the highest-delta disagreement zones across all seam records — where AIs consistently diverge",
      "example": "nexus seam disagreements",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Sibling Detection

Seam polls `chat_completions` for new rows (watermark pattern). On each new row, it checks:

```javascript
// Is there already a completion with the same causedByCallto?
if (!newRow.causedByCallto) return;  // Not an orchestrated call — skip
const sibling = jaaDB.query('chat_completions',
  r => r.causedByCallto === newRow.causedByCallto &&
       r.uuid !== newRow.uuid &&
       r.complete === true,
  1
)[0];
```

If a sibling exists: trigger merge. If not: put `newRow.causedByCallto` into `_pendingCalltos` Set. When the second sibling arrives (next tick): match it to the waiting partner, trigger merge, remove from `_pendingCalltos`.

`_pendingCalltos` has a TTL: entries older than 300 seconds (5 minutes) are evicted. A callto that only produces one completion (one AI failed or timed out) is not seamed — it has no sibling.

### How — Sentence Tokenization

```javascript
function _sentenceTokenize(text) {
  // Split on sentence boundaries: . ! ? followed by space + capital, or newline
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=[.!?])\n+|\n\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);  // discard very short fragments
}
```

### How — Agreement Detection

For each sentence in responseA, compute cosine similarity against all sentences in responseB:

```javascript
function _findAgreementZones(sentencesA, sentencesB) {
  const AGREEMENT_THRESHOLD = 0.85;
  const zones = [];

  for (const sA of sentencesA) {
    const tfA = _termFrequency(_tokenize(sA));
    let bestSim = 0, bestSentence = null;
    for (const sB of sentencesB) {
      const tfB = _termFrequency(_tokenize(sB));
      const sim = _cosineSimilarity(tfA, tfB);
      if (sim > bestSim) { bestSim = sim; bestSentence = sB; }
    }
    if (bestSim >= AGREEMENT_THRESHOLD) {
      zones.push({ text: sA, confidence: bestSim });
    }
  }
  return zones;
}
```

`_termFrequency` and `_cosineSimilarity` are identical to the implementations in Delta-engine (copy, not import — LAW III).

### How — Disagreement Detection

Disagreement zones: sentences from A whose best match in B has similarity between 0.3 and 0.65. These are sentences about the same topic but saying something different — not completely unrelated (< 0.3), not in agreement (> 0.85).

```javascript
function _findDisagreementZones(sentencesA, sentencesB) {
  const zones = [];
  for (const sA of sentencesA) {
    const tfA = _termFrequency(_tokenize(sA));
    for (const sB of sentencesB) {
      const tfB = _termFrequency(_tokenize(sB));
      const sim = _cosineSimilarity(tfA, tfB);
      if (sim > 0.3 && sim < 0.65) {
        zones.push({ a: sA, b: sB, delta: 1 - sim });
      }
    }
  }
  // Deduplicate: a sentence pair can match multiple times with slight variation
  return _deduplicateZones(zones);
}
```

`_deduplicateZones`: removes pairs where either sentence already appears in a higher-delta zone.

### How — Unique Region Detection

```javascript
const uniqueToA = sentencesA.filter(sA => {
  const tfA = _termFrequency(_tokenize(sA));
  return !sentencesB.some(sB => _cosineSimilarity(tfA, _termFrequency(_tokenize(sB))) > 0.4);
});
const uniqueToB = sentencesB.filter(sB => {
  const tfB = _termFrequency(_tokenize(sB));
  return !sentencesA.some(sA => _cosineSimilarity(_termFrequency(_tokenize(sA)), tfB) > 0.4);
});
```

### How — Agreement Coverage

```javascript
const agreementCoverage = agreementZones.length / Math.max(1, Math.max(sentencesA.length, sentencesB.length));
```

This is the fraction of the larger response covered by agreement zones. Used by Orion verify stage to gate crystal promotion.

### How — seam_records Write

After computing all zones:

```javascript
const seamRecord = {
  uuid:             uid(),
  intentUuid:       newRow.causedByCallto,
  providerA:        completionA.provider,
  providerB:        completionB.provider,
  completionUuidA:  completionA.uuid,
  completionUuidB:  completionB.uuid,
  agreementZones,
  disagreementZones,
  uniqueToA,
  uniqueToB,
  agreementCoverage,
  verified:         false,   // Orion verify stage sets this to true
  ts:               Date.now(),
  source:           'memory.seam',
  causedBy:         newRow.causedByCallto
};

// Schema validate (LAW IV)
const valid = ajv.validate('seam.schema.json', seamRecord);
if (!valid) { /* law_violations + gap + toast.error + skip */ }

await jaaDB.insert('seam_records', seamRecord);
```

### How — memory_index Write

After inserting `seam_records`, write to `memory_index` so Lattice-index and Crystal pick it up:

```javascript
await jaaDB.insert('memory_index', {
  uuid:     uid(),
  tier:     'working',
  content:  agreementZones.map(z => z.text).join(' '),  // Only agreement text goes into memory
  tags:     ['seam', 'merged', completionA.provider, completionB.provider],
  score:    agreementCoverage,
  stability:{ contradictionCount: 0, lastStabilizedAt: Date.now() },
  ts:       Date.now(),
  source:   'memory.seam',
  causedBy: seamRecord.uuid
});
```

This means the agreement text feeds Lattice-index automatically, enriching the lattice with cross-AI consensus terms.

### How — Orion-ext Signal

After inserting the seam record, Seam emits an `event_log` row that Orion-ext polls:

```javascript
await jaaDB.insert('event_log', {
  uuid:    uid(),
  type:    'seam.created',
  source:  'memory.seam',
  payload: { seamUuid: seamRecord.uuid, intentUuid: seamRecord.intentUuid, agreementCoverage },
  causedBy: newRow.causedByCallto,
  ts:      Date.now()
});
```

Orion-ext picks this up, creates an ORION session for the seam, runs it through verify stage. If `agreementCoverage >= 0.60` (default threshold): sets `seam_records.verified = true` via `jaaDB.update`. Crystal then picks up the verified seam on its next 30s tick.

### Failure Modes

| Failure | Behavior |
|---|---|
| Sibling not found within 300s | Evict from `_pendingCalltos`. Log to `event_log`: `{ type: 'seam.sibling_timeout', payload: { causedByCallto } }`. Toast.warn. |
| `chat_completions` unreadable | Insert `failures`. Hold watermark. Toast.error. |
| Sentence tokenization produces 0 sentences (very short response) | Write seam with empty agreement/disagreement zones. `agreementCoverage = 0`. Orion will reject (below 0.60 threshold). Normal path — no error. |
| `seam_records` insert fails | Insert `failures`. Toast.error. Gap severity=`medium` (Crystal feed blocked). |
| `memory_index` insert fails | Insert `failures`. Toast.warn. Seam record still written — Lattice feed degraded but seam usable. |
| Schema validation fails | Insert `law_violations`. Insert `gaps` (schema_violation). Toast.error. Skip this seam. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Seam created (any coverage) | `toast.info` | BLUE |
| Seam verified by Orion (verified=true) | `toast.success` | GREEN |
| High-agreement seam (coverage > 0.8) | `toast.info` | BLUE |
| Sibling timeout (single completion only) | `toast.warn` | AMBER |
| Seam insert failure | `toast.error` | RED |
| Init failure | `toast.error` | RED |

### CLI Output Format

```
nexus seam list --n 5
[09:54:12] [SEAM]  OK     seam-a1b2 | claude×chatgpt | coverage: 0.72 | verified: YES | 3 agreement zones, 1 disagreement
[09:54:12] [SEAM]  OK     seam-c3d4 | claude×chatgpt | coverage: 0.58 | verified: NO  | 2 agreement zones, 2 disagreements
[09:54:12] [SEAM]  INFO   seam-e5f6 | ollama×claude  | coverage: 0.91 | verified: YES | 7 agreement zones, 0 disagreements
```

---

## JAA TABLE SUMMARY

| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `lattice_nodes` | memory/lattice-index | term, termCount, lastSeen, sourceUuids[] | inline |
| `lattice_edges` | memory/lattice-index | termA, termB, coCount, weight (NPMI), ts | inline |
| `crystals` | memory/crystal | statement, confidence, ageMs, supportCount, fragility, state, contradictionScore, ... | crystal.schema.json (reconciled) |
| `seam_records` | memory/seam | intentUuid, providerA, providerB, agreementZones[], disagreementZones[], agreementCoverage, verified | seam.schema.json |

---

## BOOT SEQUENCE INTEGRATION

All three modules start in **PHASE 9** (SOFT). Boot order within PHASE 9:

1. Lattice-index — reads `memory_index` (available from PHASE 3). Can start immediately.
2. Seam — reads `chat_completions` (written by Siphon, PHASE 11). Cold-start acceptable. Table will be empty until Siphon runs.
3. Crystal — reads `seam_records` (Seam) and `lattice_edges` (Lattice-index). Cold-start acceptable. Both tables may be empty initially.

Crystal and Seam will have empty inputs at first boot. They poll on their schedules and start producing output once upstream tables are populated. This is the expected behavior — no intervention needed.

---

## FULL PIPELINE

```
Callto-executor (PHASE 11 / agents layer)
  Dispatches same prompt to claude + chatgpt via Guardian
  Writes causedByCallto to both agent_calls rows
  │
  ▼
Guardian captures both responses
  Siphon writes to chat_completions (with causedByCallto field)
  │
  ▼
Seam (polls chat_completions every 5s)
  Detects sibling pair → diffs → writes seam_records + memory_index
  Emits seam.created event
  │
  ▼
Orion-ext (polls event_log for seam.created)
  Runs 4-stage ORION quality gate
  If agreementCoverage >= 0.60: seam_records.verified = true
  │
  ▼
Crystal (polls seam_records every 30s)
  Finds verified seams → extracts agreement zones
  Writes crystals (state: stable, confidence from zone.confidence)
  Emits toast.crystal TEAL
  │
  ▼
BEP-engine (polls crystals)
  Builds BEP triples: (belief, delta_records evidence, lattice pattern cluster)
  Writes bep_patterns
  │
  ▼
Self-model (polls crystals, bep_patterns)
  Reads crystalCount, fragility distribution
  Updates self_model systemHealth.crystalCount
```

Simultaneously:

```
memory_index (written by agent-memory, Seam)
  │
  ▼
Lattice-index (polls every 10s)
  Tokenizes → updates lattice_nodes + lattice_edges
  Emits lattice.pattern.emerging when coCount crosses threshold
  │
  ▼
Crystal (polls lattice_edges for high-weight edges)
  Creates candidate crystals from repeated co-occurrence patterns
  │
  ▼
BEP-engine (reads lattice_edges for pattern cluster)
  Includes lattice patterns in BEP triple pattern_cluster field
```
