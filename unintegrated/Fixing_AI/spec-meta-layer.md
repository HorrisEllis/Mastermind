# NEXUS — Meta Layer Spec
**Modules:** Self-model · Cortex v2  
**Files:** `core/self-model.js` · `core/cortex-v2.js` (replaces `cortex.js`)  
**Boot phase:** PHASE 15 (SOFT — runs last, reads everything)  
**Mastevos ref:** §14.3 · §14.4  
**Date:** 2026-05-26  
**Supersedes:** stub entries in v8.0 §14.3, §14.4

---

## READING THIS SPEC

The meta layer sits above all other layers. It reads across the entire system — signal, memory, cognition, guardian — and produces two things:

- **Self-model:** A rolling machine-readable portrait of the system's own behavior. Not narrative. Not self-report. Computed from actual observed data: creativity index, dominant intent clusters, constraint patterns, trust landscape, open questions. Updated hourly.
- **Cortex v2:** The extended CLI. Everything the system knows is now accessible from the terminal. Replaces `cortex.js` with backward-compatible commands and adds all the missing verbs: `memory search`, `versionium chain`, `self`, `intent`, `orion`, `seam`, `snr`, `guardian`.

These are not features. They are the lens the system uses to understand itself and the interface through which you command it.

---

## CONSTITUTIONAL CONSTRAINTS

- **LAW I:** Self-model never triggers agent calls. It reads data, computes metrics, writes one JAA row per hour. Pure analytics.
- **LAW II:** Every self_model snapshot is a JAA row. The system's self-portrait is as durable as everything else.
- **LAW III:** Self-model reads from six tables across five layers. It never imports any of the modules that write those tables. It only reads JAA.
- **LAW IV:** `self-model.schema.json` (🔴 BUILD). Every snapshot validated before insert.
- **LAW V:** `nexus self` renders the current self_model snapshot. `nexus self history` shows the last N. Every field is CLI-accessible.
- **LAW VI:** Self-model write toasted TEAL every hour. First write toasted with additional INFO context.

Cortex v2 inherits all LAW V requirements: every command exits non-zero on failure, every failure logged to `failures`, every response structured for pipe-ability.

---

## SCHEMAS REQUIRED BEFORE BUILD

### `schemas/self-model.schema.json`

Status: `🔴 BUILD` (§20.1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Self Model",
  "type": "object",
  "required": ["uuid", "creativityIndex", "dominantIntentClusters", "constraintPatterns",
               "divergenceTrend", "trustLandscape", "openQuestions", "systemHealth",
               "windowDays", "computedAt", "ts", "source"],
  "properties": {
    "uuid":             { "type": "string" },
    "creativityIndex":  { "type": ["number", "null"], "minimum": 0, "maximum": 1,
                          "description": "Mean surpriseScore from delta_records over windowDays" },
    "dominantIntentClusters": {
      "type": "array",
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["uuid", "text", "callCount", "successRate"],
        "properties": {
          "uuid":        { "type": "string" },
          "text":        { "type": "string" },
          "callCount":   { "type": "integer" },
          "successRate": { "type": "number" }
        }
      },
      "description": "Top 5 intent nodes by callCount — what the system actually works on"
    },
    "constraintPatterns": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["uuid", "text", "successRate", "retryCount"],
        "properties": {
          "uuid":        { "type": "string" },
          "text":        { "type": "string" },
          "successRate": { "type": "number" },
          "retryCount":  { "type": "integer" }
        }
      },
      "description": "Intent nodes with low successRate + high retryCount — where the system hits walls"
    },
    "divergenceTrend": {
      "type": ["number", "null"],
      "description": "7-day slope of creativityIndex. Positive = getting more novel. Negative = more repetitive."
    },
    "trustLandscape": {
      "type": "object",
      "required": ["top5", "bottom5"],
      "properties": {
        "top5":    { "type": "array", "maxItems": 5, "items": { "type": "object",
                     "properties": { "sourceUuid": { "type": "string" }, "score": { "type": "number" } } } },
        "bottom5": { "type": "array", "maxItems": 5, "items": { "type": "object",
                     "properties": { "sourceUuid": { "type": "string" }, "score": { "type": "number" } } } }
      },
      "description": "Top 5 and bottom 5 sources by IME trust score"
    },
    "openQuestions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["uuid", "text", "callCount"],
        "properties": {
          "uuid":      { "type": "string" },
          "text":      { "type": "string" },
          "callCount": { "type": "integer" }
        }
      },
      "description": "Intent nodes with zero associatedCrystals — asked but never resolved"
    },
    "systemHealth": {
      "type": "object",
      "properties": {
        "openGapCount":      { "type": "integer" },
        "staleModuleCount":  { "type": "integer" },
        "crystalCount":      { "type": "integer" },
        "fragileCount":      { "type": "integer", "description": "Crystals with fragility > 0.6" },
        "guardianConnected": { "type": "boolean" },
        "guardianHealthScore": { "type": ["number", "null"] },
        "lawViolationCount": { "type": "integer" }
      }
    },
    "windowDays":  { "type": "integer", "description": "Days of data used to compute this snapshot (default: 7)" },
    "computedAt":  { "type": "integer" },
    "ts":          { "type": "integer" },
    "source":      { "type": "string" }
  }
}
```

---

## MODULE 13: SELF-MODEL — `core/self-model.js`

### What

A rolling self-portrait of the NEXUS system — stored as `self_model` JAA rows, updated once per hour. Seven computed fields drawn from data across the entire system. The self_model snapshot answers the `hub.md` request: "understand my creativity, methods of problem solving and working around constraints" — as a data object, not a narrative.

### Why

Without Self-model, the system has no integrated view of itself. Individual modules know their own state. The cockpit knows visual state. But no single artifact answers: "over the last week, what has this system actually been doing, and is it doing it well?" Self-model creates that artifact. It also serves as the dashboard data source — the cockpit's overview panel reads the latest `self_model` row rather than querying five separate tables.

### COBALT Declaration

```json
{
  "id": "core.self-model",
  "file": "core/self-model.js",
  "layer": "core",
  "title": "core.self-model",
  "description": "Hourly rolling self-portrait. Reads delta_records, intent_nodes, trust_scores, crystals, gaps, guardian_health. Writes self_model row. Does not call agents.",
  "reads": ["delta_records", "intent_nodes", "trust_scores", "crystals", "gaps", "guardian_health", "law_violations"],
  "writes": ["self_model", "toasts", "failures", "event_log"],
  "polls": false,
  "pollIntervalMs": 3600000,
  "bootPhase": 15,
  "gapContract": {
    "maxLatencyMs": 7200000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "self",
      "args": [],
      "flags": ["--json"],
      "emits": "cli.self.current",
      "reads": ["self_model"],
      "writes": [],
      "intent": "Render current self_model snapshot: creativityIndex, top intent clusters, constraint patterns, trust landscape, open questions, system health",
      "example": "nexus self",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "self history [--n 24]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.self.history",
      "reads": ["self_model"],
      "writes": [],
      "intent": "List last N self_model snapshots with creativityIndex and divergenceTrend over time",
      "example": "nexus self history --n 24",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "self refresh",
      "args": [],
      "flags": [],
      "emits": "cli.self.refresh",
      "reads": [],
      "writes": ["self_model"],
      "intent": "Force an immediate self_model recompute outside the hourly schedule",
      "example": "nexus self refresh",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Compute Cycle

Self-model uses `setInterval(3600000)` rather than poll-registry (it is not a poll-loop — it runs once per hour unconditionally). Additionally: `self refresh` CLI command triggers immediate recompute by emitting `cli.self.refresh` to `event_log`, which the self-model listener catches.

On each compute cycle:

**1. creativityIndex**

```javascript
const windowMs = WINDOW_DAYS * 86400000;  // default: 7 days
const since = Date.now() - windowMs;

const deltas = jaaDB.query('delta_records',
  r => r.ts > since && r.surpriseScore !== null,
  5000  // cap — prevents memory exhaustion on large datasets
);

const creativityIndex = deltas.length === 0
  ? null
  : deltas.reduce((sum, d) => sum + d.surpriseScore, 0) / deltas.length;
```

**2. dominantIntentClusters**

```javascript
const allNodes = jaaDB.scan('intent_nodes');  // full scan — intent_nodes expected < 10K rows

const dominantIntentClusters = allNodes
  .sort((a, b) => b.callCount - a.callCount)
  .slice(0, 5)
  .map(n => ({ uuid: n.uuid, text: n.text, callCount: n.callCount, successRate: n.successRate }));
```

**3. constraintPatterns**

```javascript
// Where the system hits walls: low successRate + high retryCount
const constraintPatterns = allNodes
  .filter(n => n.successRate < 0.5 && n.retryCount > 2 && n.callCount >= 3)
  .sort((a, b) => b.retryCount - a.retryCount)
  .slice(0, 10)
  .map(n => ({ uuid: n.uuid, text: n.text, successRate: n.successRate, retryCount: n.retryCount }));
```

These are the patterns `hub.md` asked for: "methods of working around constraints." High retry + low success = the system is repeatedly attempting something and partially failing. These deserve attention.

**4. divergenceTrend**

The 7-day slope of `creativityIndex`, computed by comparing the 7-day window mean to the prior 7-day window mean:

```javascript
const prevWindowSince = since - windowMs;
const prevDeltas = jaaDB.query('delta_records',
  r => r.ts > prevWindowSince && r.ts <= since && r.surpriseScore !== null,
  5000
);

const prevCreativity = prevDeltas.length === 0
  ? null
  : prevDeltas.reduce((sum, d) => sum + d.surpriseScore, 0) / prevDeltas.length;

const divergenceTrend = (creativityIndex === null || prevCreativity === null)
  ? null
  : creativityIndex - prevCreativity;
  // Positive: more novel than last week
  // Negative: more repetitive than last week
```

**5. trustLandscape**

```javascript
const allTrust = jaaDB.scan('trust_scores');  // expected < 1K rows

const sorted = allTrust.sort((a, b) => b.score - a.score);
const trustLandscape = {
  top5:    sorted.slice(0, 5).map(r => ({ sourceUuid: r.sourceUuid, score: r.score })),
  bottom5: sorted.slice(-5).map(r => ({ sourceUuid: r.sourceUuid, score: r.score }))
};
```

**6. openQuestions**

```javascript
// Intent nodes with no crystallized answers
const openQuestions = allNodes
  .filter(n => (n.associatedCrystals ?? []).length === 0 && n.callCount >= 2)
  .sort((a, b) => b.callCount - a.callCount)
  .slice(0, 20)
  .map(n => ({ uuid: n.uuid, text: n.text, callCount: n.callCount }));
```

`callCount >= 2` filter: a single unanswered question might be noise. Asked twice without crystallization = genuinely open.

**7. systemHealth**

```javascript
const openGaps = jaaDB.query('gaps', r => r.status === 'open', 10000);
const staleModuleGaps = openGaps.filter(g => g.type === 'stale_module');
const allCrystals = jaaDB.query('crystals', r => r.state !== 'invalidated', 10000);
const fragileCrystals = allCrystals.filter(c => c.fragility > 0.6);
const latestGuardianHealth = jaaDB.tail('guardian_health', 1)[0];
const lawViolations = jaaDB.query('law_violations', r => r.ts > since, 10000);

const systemHealth = {
  openGapCount:        openGaps.length,
  staleModuleCount:    staleModuleGaps.length,
  crystalCount:        allCrystals.length,
  fragileCount:        fragileCrystals.length,
  guardianConnected:   latestGuardianHealth?.connected ?? false,
  guardianHealthScore: latestGuardianHealth?.healthScore ?? null,
  lawViolationCount:   lawViolations.length
};
```

**8. Validate and write**

```javascript
const snapshot = {
  uuid:                    uid(),
  creativityIndex,
  dominantIntentClusters,
  constraintPatterns,
  divergenceTrend,
  trustLandscape,
  openQuestions,
  systemHealth,
  windowDays:              WINDOW_DAYS,
  computedAt:              Date.now(),
  ts:                      Date.now(),
  source:                  'core.self-model'
};

// LAW IV: schema validate
const valid = ajv.validate('self-model.schema.json', snapshot);
if (!valid) {
  await jaaDB.insert('law_violations', { law: 'LAW_IV', module: 'core.self-model',
    description: 'self_model snapshot failed schema validation', severity: 'high', ts: Date.now() });
  _toast('toast.error', 'Self-model: LAW IV — snapshot schema invalid. Check law_violations.', {});
  return;  // Do not write invalid snapshot
}

await jaaDB.insert('self_model', snapshot);

_toast('toast.crystal', `Self-model updated — creativity: ${creativityIndex?.toFixed(3) ?? 'n/a'} | crystals: ${systemHealth.crystalCount} | open: ${openQuestions.length}`, {});
```

**9. Emit event_log row**

```javascript
await jaaDB.insert('event_log', {
  uuid: uid(), type: 'self_model.updated',
  source: 'core.self-model',
  payload: { snapshotUuid: snapshot.uuid, creativityIndex, crystalCount: systemHealth.crystalCount },
  ts: Date.now()
});
```

### Failure Modes

| Failure | Source table | Behavior |
|---|---|---|
| `delta_records` unreadable | creativityIndex | Set `null`. Continue. |
| `intent_nodes` unreadable | dominantIntentClusters, constraintPatterns, openQuestions | Set empty arrays. Continue. |
| `trust_scores` unreadable | trustLandscape | Set `{ top5: [], bottom5: [] }`. Continue. |
| `crystals` unreadable | systemHealth.crystalCount | Set 0. Continue. |
| `guardian_health` unreadable | systemHealth.guardianConnected | Set `false`. Continue. |
| `self_model` insert fails | — | Insert `failures`. Toast.error. In-memory snapshot still exists for CLI. |
| Schema validation fails | — | Insert `law_violations`. Toast.error. Abort write. Retry next hour with corrected data. |

Partial data is preferable to no snapshot. All field failures degrade gracefully to null/empty rather than aborting the compute.

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Hourly snapshot written | `toast.crystal` | TEAL |
| First-ever snapshot (boot) | `toast.info` | BLUE + extra context |
| Schema validation failure | `toast.error` | RED |
| creativityIndex is null (no delta data yet) | `toast.info` | BLUE (first time only, then silent) |

### CLI Output Format

```
nexus self
╔═══════════════════════════════════════════════════════════════╗
║  NEXUS SELF-MODEL  │  snapshot 4h ago  │  window: 7 days     ║
╠══════════════╦════════════════════════════════════════════════╣
║  CREATIVITY  ║  index: 0.431  │  trend: +0.024 (↑ improving) ║
╠══════════════╬════════════════════════════════════════════════╣
║  INTENT      ║  1. build resonance engine (47 calls, 89%)     ║
║  TOP 5       ║  2. expand NEXUS cockpit (31 calls, 82%)       ║
║              ║  3. implement JAA module (28 calls, 91%)       ║
║              ║  4. debug signal pipeline (19 calls, 63%)      ║
║              ║  5. draft spec document (14 calls, 100%)       ║
╠══════════════╬════════════════════════════════════════════════╣
║  CONSTRAINTS ║  1. guardian tab inject (8 retries, 34% ok)   ║
║              ║  2. seam merge empty response (5 retries, 20%) ║
╠══════════════╬════════════════════════════════════════════════╣
║  TRUST       ║  top: memory.crystal (0.94), orion/sensor (0.91)║
║  LANDSCAPE   ║  low: unknown-source (0.21), agent-timeout (0.18)║
╠══════════════╬════════════════════════════════════════════════╣
║  CRYSTALS    ║  stable: 23  │  fragile: 3  │  decaying: 1    ║
╠══════════════╬════════════════════════════════════════════════╣
║  OPEN Q's    ║  21 intent nodes with no associated crystals   ║
║              ║  top: "how does topo-kernel weight gates?" (7×) ║
╠══════════════╬════════════════════════════════════════════════╣
║  HEALTH      ║  gaps: 4 open  │  guardian: ✓ (0.87)          ║
║              ║  law violations (7d): 2                        ║
╚══════════════╩════════════════════════════════════════════════╝
```

---

## MODULE 14: CORTEX V2 — `core/cortex-v2.js`

### What

Backward-compatible replacement for `cortex.js`. Every existing command continues to work identically. Cortex v2 adds all the commands needed to navigate the expanded system: multi-table memory search, versionium chain walk, self-model rendering, intent browsing, Orion session history, seam inspection, SNR trust scores, Guardian status.

Also fixes the `ask` command: instead of only polling `cortex_memory`, it now searches `memory_index` via tags and term match, pre-pends relevant crystals as context, and displays the combined result.

### Why

NEXUS has built a complete system for understanding itself. Without Cortex v2, none of that understanding is accessible from the terminal. The CLI is the primary interface (LAW V). Every table must be queryable. Every computation must be renderable. Cortex v2 is the completion of LAW V.

### Architecture Notes

Cortex v2 is not a replacement binary. It extends the existing CLI handler by registering additional command routes. The entry point remains the same (`core/cortex.js` or equivalent). Cortex v2 either:

**Option A (preferred):** Is implemented as `core/cortex-v2.js` which imports the existing cortex command registry and registers new commands via `registry.add(...)`. The existing cortex.js `main()` entry point loads both registries.

**Option B (fallback):** Directly extends `core/cortex.js` by appending new command handlers. Single file. No import chain.

The choice depends on how the existing cortex.js is structured. Read the file before implementing. If it uses a switch/case dispatch: Option B. If it uses a registry/map pattern: Option A.

### COBALT Declaration

```json
{
  "id": "core.cortex-v2",
  "file": "core/cortex-v2.js",
  "layer": "core",
  "title": "core.cortex-v2",
  "description": "Extended CLI. Backward-compatible replacement for cortex.js. Adds memory search, versionium chain walk, self model, intent browsing, orion history, seam, snr, guardian commands. Fixes ask to include memory_index + crystals.",
  "reads": ["memory_index", "cortex_memory", "crystals", "intent_nodes", "orion_sessions", "seam_records", "snr_records", "guardian_nodes", "guardian_health", "self_model", "bep_patterns"],
  "writes": ["failures", "event_log"],
  "polls": false,
  "bootPhase": 15,
  "gapContract": {
    "maxLatencyMs": null,
    "onMiss": null
  },
  "cli": [
    {
      "command": "ask <query>",
      "args": ["<query>"],
      "flags": ["--n <n>", "--raw"],
      "emits": "cli.ask",
      "reads": ["cortex_memory", "memory_index", "crystals"],
      "writes": [],
      "intent": "Ask the system a question. Searches cortex_memory + memory_index. Pre-pends matching stable crystals as context. Returns top N results.",
      "example": "nexus ask 'what do I know about bayesian posteriors'",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "memory search <query> [--tags <t,t>] [--n 20]",
      "args": ["<query>"],
      "flags": ["--tags <tags>", "--n <n>"],
      "emits": "cli.memory.search",
      "reads": ["memory_index"],
      "writes": [],
      "intent": "Search memory_index by text content and optional tags. Returns matching rows sorted by score DESC.",
      "example": "nexus memory search 'signal geometry' --tags seam,merged",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "memory index [<query>] [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.memory.index",
      "reads": ["memory_index"],
      "writes": [],
      "intent": "Browse memory_index. Optional text filter. Newest first.",
      "example": "nexus memory index --n 50",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "memory cortex [<query>] [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.memory.cortex",
      "reads": ["cortex_memory"],
      "writes": [],
      "intent": "Browse cortex_memory. Optional text filter. Newest first.",
      "example": "nexus memory cortex 'resonance'",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "memory forget <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.memory.forget",
      "reads": [],
      "writes": ["memory_index"],
      "intent": "Soft-delete a memory_index entry by UUID (sets tier to 'forgotten', does not physically delete — LAW §M1).",
      "example": "nexus memory forget abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "versionium [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.versionium",
      "reads": ["shape_samples"],
      "writes": [],
      "intent": "Show recent versionium commits (sigma > 0.7 shape_samples) with timestamp, module, and sigma value. HEAD = most recent.",
      "example": "nexus versionium",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "versionium chain <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.versionium.chain",
      "reads": ["shape_samples", "event_log"],
      "writes": [],
      "intent": "Walk the causal chain for a UUID — from the event that triggered the sigma spike back through causedBy fields to the root cause.",
      "example": "nexus versionium chain abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "self [--json]",
      "args": [],
      "flags": ["--json"],
      "emits": "cli.self.current",
      "reads": ["self_model"],
      "writes": [],
      "intent": "Render current self_model snapshot. --json outputs raw JSON for pipe-ability.",
      "example": "nexus self",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "intent [<query>] [--n 20] [--sort callCount|successRate|surpriseScore]",
      "args": [],
      "flags": ["--n <n>", "--sort <field>"],
      "emits": "cli.intent.list",
      "reads": ["intent_nodes"],
      "writes": [],
      "intent": "Browse intent_nodes. Optional text filter. Optional sort field.",
      "example": "nexus intent bayesian --sort surpriseScore",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "orion [--n 20] [--status verified|pending|rejected]",
      "args": [],
      "flags": ["--n <n>", "--status <s>"],
      "emits": "cli.orion.list",
      "reads": ["orion_sessions"],
      "writes": [],
      "intent": "List recent ORION sessions. Filter by status.",
      "example": "nexus orion --n 20 --status verified",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "seam [--n 20] [--verified]",
      "args": [],
      "flags": ["--n <n>", "--verified"],
      "emits": "cli.seam.list",
      "reads": ["seam_records"],
      "writes": [],
      "intent": "List recent seam records. --verified filters to only verified seams.",
      "example": "nexus seam --n 10 --verified",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "snr <source-uuid>",
      "args": ["<source-uuid>"],
      "flags": [],
      "emits": "cli.snr.source",
      "reads": ["snr_records", "trust_scores"],
      "writes": [],
      "intent": "Show trust score and recent SNR records for a source UUID. Combines snr_records posterior with ime trust_scores score.",
      "example": "nexus snr guardian-a1b2c3",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "guardian [--n 5]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.guardian.list",
      "reads": ["guardian_nodes", "guardian_health"],
      "writes": [],
      "intent": "List connected Guardian instances with instanceId, health score, capabilities, last heartbeat. Alias for: nexus guardian pulse status.",
      "example": "nexus guardian",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — ask command (fixed)

The existing `ask` command only queries `cortex_memory`. The fix adds two additional sources and prepends crystal context:

```javascript
async function handleAsk(query, flags) {
  const n = flags.n ?? 10;
  const queryStems = _tokenize(query);

  // Source 1: cortex_memory — full-text match (existing behavior)
  const cortexResults = jaaDB.query('cortex_memory',
    r => queryStems.some(s => (r.content ?? '').toLowerCase().includes(s)),
    n
  );

  // Source 2: memory_index — tag + term match (new)
  const indexResults = jaaDB.query('memory_index',
    r => queryStems.some(s => (r.content ?? '').toLowerCase().includes(s)) ||
         (r.tags ?? []).some(t => queryStems.includes(t)),
    n
  );

  // Source 3: crystals — term match on statement (new)
  const crystalMatches = jaaDB.query('crystals',
    r => r.state === 'stable' &&
         queryStems.some(s => (r.statement ?? '').toLowerCase().includes(s)),
    5
  );

  // Render: crystals first (as "what the system believes"), then results
  if (crystalMatches.length > 0) {
    console.log('\n  ── CRYSTALS (established beliefs) ──');
    for (const c of crystalMatches) {
      console.log(`  [${(c.confidence * 100).toFixed(0)}% | ${c.state}] ${c.statement}`);
    }
    console.log('');
  }

  // Deduplicate and merge cortex + index results
  const allResults = _deduplicateByContent([...cortexResults, ...indexResults]);
  const topN = allResults.slice(0, n);

  if (topN.length === 0) {
    console.log('  No results found in memory or memory index.');
    return;
  }

  console.log('  ── MEMORY RESULTS ──');
  for (const r of topN) {
    const source = r.agent ?? r.source ?? 'unknown';
    const preview = (r.content ?? '').slice(0, 200);
    const ts = new Date(r.ts).toISOString().slice(0, 16);
    console.log(`  [${ts}] [${source}] ${preview}${preview.length === 200 ? '...' : ''}`);
  }
}
```

`_deduplicateByContent`: removes results where `content` is > 0.9 cosine similar to an already-included result. Prevents the same fact appearing from both cortex_memory and memory_index.

### How — versionium chain walk

```javascript
async function handleVersioniumChain(uuid) {
  // Start from the given UUID — could be a shape_samples row, event_log row, or any JAA UUID
  const chain = [];
  let currentUuid = uuid;
  const MAX_DEPTH = 20;

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    // Search all relevant tables for this UUID
    const row = _findRowByUuid(currentUuid);  // searches event_log, shape_samples, agent_calls, cortex_memory, etc.
    if (!row) break;

    chain.push({
      depth,
      uuid: currentUuid,
      table: row._table,
      type: row.type ?? row.status ?? 'unknown',
      source: row.source ?? 'unknown',
      ts: row.ts
    });

    // Follow causedBy chain
    if (!row.causedBy || row.causedBy === currentUuid) break;
    currentUuid = row.causedBy;
  }

  // Render chain (newest first in chain = innermost cause first)
  console.log(`\n  ── CAUSAL CHAIN for ${uuid.slice(0, 8)}... ──`);
  for (const step of chain) {
    const indent = '  '.repeat(step.depth);
    const ts = new Date(step.ts).toISOString().slice(0, 19);
    console.log(`  ${indent}[${step.depth}] ${step.table}.${step.type} @ ${ts} (${step.uuid.slice(0, 8)})`);
  }
}

function _findRowByUuid(uuid) {
  const SEARCH_TABLES = ['event_log', 'shape_samples', 'agent_calls', 'cortex_memory',
    'delta_records', 'seam_records', 'crystals', 'gaps', 'orion_sessions', 'chat_completions'];
  for (const table of SEARCH_TABLES) {
    const row = jaaDB.get(table, uuid);
    if (row) return { ...row, _table: table };
  }
  return null;
}
```

### How — memory forget (soft delete)

```javascript
async function handleMemoryForget(uuid) {
  const row = jaaDB.get('memory_index', uuid);
  if (!row) {
    console.error(`  No memory_index row with UUID ${uuid}`);
    process.exit(1);
  }

  // Soft delete: set tier to 'forgotten' — row persists (LAW §M1)
  await jaaDB.update('memory_index', uuid, {
    tier:   'forgotten',
    tags:   [...(row.tags ?? []), 'forgotten'],
    ts:     Date.now(),
    source: 'cli.memory.forget'
  });

  // Emit event_log
  await jaaDB.insert('event_log', {
    uuid:    uid(), type: 'memory.forgotten',
    source:  'core.cortex-v2',
    payload: { forgottenUuid: uuid, originalContent: row.content?.slice(0, 100) },
    ts:      Date.now()
  });

  console.log(`  Memory ${uuid.slice(0, 8)}... marked as forgotten. Row retained for audit.`);
}
```

`tier: 'forgotten'` is excluded from:
- `memory search` results (filter: `r.tier !== 'forgotten'`)
- `ask` results (same filter)
- Crystal source scanning
- Lattice-index ingestion (watermark advance skips `tier === 'forgotten'` rows)

But the row remains in JAA for audit, causal chain walks, and LAW §M1 compliance.

### How — Backward Compatibility

All existing cortex.js commands are preserved without modification. Cortex v2 adds new command routes alongside them. The extended switch/case or registry lookup handles both.

Existing commands (unchanged behavior):
- `ask <query>` — **FIXED** (new behavior described above, backward compatible for callers)
- `memory` — original command preserved as alias for `memory cortex`
- `log [--n N]` — existing behavior unchanged
- All other existing commands — pass through to existing handlers

Breaking changes: **none**. The `ask` fix is additive — it returns more results and adds crystal context, but does not remove any existing output. Scripts that parse `ask` output may need updating if they rely on exact line counts.

### CLI Output Examples

```
nexus memory search 'bayesian posterior' --tags seam
  ── MEMORY INDEX RESULTS (6 matches) ──
  [2026-05-24T14:32] [memory.seam]     The posterior trust score for guardian-claude is 0.91 based on...
  [2026-05-23T09:15] [agents.callto]   Bayesian update applied: alpha=47 beta=12 → posterior=0.797...
  [2026-05-22T21:07] [orion.ext]       Seam verified: agreementCoverage=0.72, providers=claude×chatgpt...
```

```
nexus versionium --n 5
  ── VERSIONIUM COMMITS (most recent first) ──
  HEAD  2026-05-26T09:41  sigma: 0.94  guardian-claude   novel: crystallization, bayesian, posterior
    #2  2026-05-25T14:22  sigma: 0.88  ollama-agent      novel: attractor, topology, mesh
    #3  2026-05-24T18:03  sigma: 0.82  guardian-chatgpt  novel: bifurcation, regime, sigma
    #4  2026-05-23T11:15  sigma: 0.79  ollama-agent      novel: invariant, delta, lattice
    #5  2026-05-22T08:44  sigma: 0.71  guardian-claude   novel: seam, convergence, verified
```

```
nexus versionium chain abc-12345
  ── CAUSAL CHAIN for abc-1234... ──
  [0] shape_samples.sigma_spike @ 2026-05-26T09:41:12 (abc-1234)
    [1] cortex_memory.stored @ 2026-05-26T09:41:10 (def-5678)
      [2] agent_calls.complete @ 2026-05-26T09:41:05 (ghi-9012)
        [3] event_log.guardian.chat.complete @ 2026-05-26T09:41:03 (jkl-3456)
          [4] event_log.GUARDIAN_EXECUTE_INTENT @ 2026-05-26T09:40:47 (mno-7890)
            [5] agent_calls.pending @ 2026-05-26T09:40:46 (pqr-1234)
```

```
nexus snr guardian-a1b2c3
  [SNR]  source:   guardian-a1b2c3
  [SNR]  events:   1,203 processed
  [SNR]  posterior: 0.87  (Bayesian trust — topo-wire)
  [IME]  ime score: 0.91  (behavioral consistency — ime-wire)
  [SNR]  drops:     22 (1.8%)
  [SNR]  last drop: guardian.chat.message (gate g4_spike failed) — 4h ago
  [SNR]  combined:  0.89  (mean of posterior and ime score)
```

```
nexus guardian
  ── GUARDIAN INSTANCES ──
  guardian-a1b2c3 | health: 0.87 | caps: claude,chatgpt,capture,inject | tabs: 2 | listeners: 1 | last: 6s
  guardian-d4e5f6 | health: 0.50 | caps: claude                        | tabs: 0 | listeners: 0 | last: 19s
  ──
  connected: YES  │  composite health: 0.69  │  last watchman check: 3s ago
```

---

## JAA TABLE SUMMARY

| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `self_model` | core/self-model | creativityIndex, dominantIntentClusters[], constraintPatterns[], divergenceTrend, trustLandscape{}, openQuestions[], systemHealth{}, windowDays, computedAt | self-model.schema.json (🔴 BUILD) |

Cortex v2 writes no new tables. It reads from: `memory_index`, `cortex_memory`, `crystals`, `intent_nodes`, `orion_sessions`, `seam_records`, `snr_records`, `trust_scores`, `guardian_nodes`, `guardian_health`, `self_model`, `shape_samples`, `event_log`, `agent_calls`.

---

## BOOT SEQUENCE INTEGRATION

Both modules start in **PHASE 15** (the final soft phase). Self-model requires:
- `delta_records` (PHASE 10 — Signal layer)
- `intent_nodes` (PHASE 14 — Cognition layer)
- `trust_scores` (PHASE 10 — Signal layer)
- `crystals` (PHASE 9 — Memory layer)
- `guardian_health` (PHASE 11 — Guardian layer)

All prerequisites are available before PHASE 15. On first boot (all tables empty), Self-model produces a valid snapshot with null/empty fields — this is the expected cold-start state.

Cortex v2 starts at PHASE 15 alongside Self-model. CLI is available throughout boot — the cortex.js entry point registers all commands at module load, not at first query. PHASE 15 registration adds the v2 commands to the already-running CLI handler.

Boot order within PHASE 15:
1. Self-model — writes first snapshot (mostly null on cold start)
2. Cortex v2 — registers new command routes

---

## THE COMPLETE SYSTEM — END-TO-END CHAIN

This is what the full 15-module system looks like at steady state, following one conversation through the entire pipeline:

```
You open Claude.ai in a browser with Guardian connected
  │
  ▼
Guardian MutationObserver captures every message
  POSTs to /api/event: guardian.chat.message, guardian.chat.response, guardian.chat.complete
  │
  ▼
Siphon (2s tick): normalizes events → chat_sessions, chat_messages, chat_completions
  │
  ├── Pulse (3s tick): heartbeats → guardian_nodes → Watchman (5s) → guardian_health
  │
  ├── IME-wire (2.5s tick): behavioral profile update → ime_profiles, trust_scores
  │
  ├── Topo-wire (1.5s tick): 8-gate SNR → snr_records, shape_samples
  │
  └── Delta-engine (2s tick): on chat.complete → delta_records
        │ if surpriseScore > 0.7:
        └── shape_samples sigma spike → Versionium auto-commit
              (your intellectual breakthrough is timestamped)
  │
  ▼
memory_index (written by agent-memory handler)
  │
  ▼
Lattice-index (10s tick): tokenize → lattice_nodes, lattice_edges
  │ if coCount > 5:
  └── lattice.pattern.emerging event
  │
  ▼
Crystal (30s tick):
  reads lattice_edges (coCount > 15) + seam_records (verified=true)
  → crystals (candidate → stable)
  │
  ├── BEP-engine (15s tick): crystals + delta_records + lattice_edges → bep_patterns
  │     │ if contradiction detected:
  │     └── bep.contradiction.detected → Crystal decrements confidence → state: decaying
  │
  └── Intent-map (5s tick): links intent_nodes.associatedCrystals[]
  │
  ▼
Self-model (hourly):
  reads everything above → self_model snapshot
  creativityIndex tells you how novel you've been
  openQuestions tells you what remains unresolved
  constraintPatterns tells you where you're hitting walls
  │
  ▼
nexus self
  ╔═══════════════════════════════╗
  ║  Everything the system knows  ║
  ║  about how it thinks,         ║
  ║  in one terminal command.     ║
  ╚═══════════════════════════════╝
```

For parallel AI calls (Callto-executor --parallel):

```
Callto-executor dispatches to guardian-claude + guardian-chatgpt simultaneously
  │
  ▼
Both complete → Siphon writes chat_completions (shared causedByCallto UUID)
  │
  ▼
Seam detects siblings → structural diff → seam_records (verified: false)
  │
  ▼
Orion-ext: 3-stage gate (record → policy → verify)
  if agreementCoverage >= 0.60 → seam_records.verified = true
  │
  ▼
Crystal reads verified seam → stable crystal formed instantly
  (cross-AI consensus = highest confidence belief source in the system)
  │
  ▼
That crystal appears in: nexus self, nexus crystal list, nexus ask, bep_patterns
```
