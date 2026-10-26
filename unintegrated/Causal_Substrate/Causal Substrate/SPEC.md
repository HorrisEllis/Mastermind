# Causal Nexus Compress v6
## Intent, API, CLI, and Systems Thinking Specification

---

## 1. Intent

### What This Is

Causal Nexus Compress v6 is the **persistence, comparison, and structural health layer** for Causal Nexus kernels. It answers three questions that v5 could not:

1. **Is this kernel healthy?** — Not "did it pass a static checklist" but "how has health evolved, where is the peak, and is it trending toward or away from that peak?"
2. **How do multiple kernels relate?** — Not "here are two snapshots" but "these are named trajectories with causal lineage; fork one, merge two, compare all axes simultaneously."
3. **What is the optimal state?** — Not "current state" but "the best observed window of behavior, with a map to get back there."

### What This Is Not

- Not a query engine (that is `modules/query`)
- Not a persistence backend (that is `modules/persist`)
- Not a causal graph walker (that is `modules/causality`)
- Not an observation layer (that is `modules/sigma`)

The compress module is **structure-preserving transport and relational health tracking**. It does not modify the kernel. It reads, encodes, compares, and reports.

### Design Laws

```
§C-1  Nothing is estimated. Every invariant score is computed, not assumed.
§C-2  All errors are loud. No silent compression failures.
§C-3  Invariants are signals, not judgments. Score 0.87 ≠ "broken". It means "17% of events deviate from expected structure."
§C-4  Timelines are first-class objects. A kernel is not a blob — it is a trajectory with lineage.
§C-5  The baseline evolves. A static checklist is a snapshot of a moment. A dynamic baseline is the truth over time.
§C-6  Format is versioned and backward-compatible. v2 restores v1 snapshots.
§C-7  Compression never modifies the kernel. The compress module is read-only on the event store.
```

---

## 2. Core Concepts

### 2.1 Snapshot (NEX-SNAP)

A snapshot is a compact, lossless serialization of all primary events in a kernel ring. Primary events are those not produced by the gate or system subsystems; gate and system events are re-emitted on restore.

**Encoding pipeline (v6):**
```
Raw events
  → filter primary (gate/system excluded)
  → build type dictionary (index → string)
  → build source dictionary (index → string)
  → build string interning pool (value → pool index)
  → per-event: timestamp delta, causedBy as position index, payload delta
  → payload delta: numeric fields encoded as Δ (delta) not full value
  → edge type: 1-char code (x/r/a/o)
  → null stripping: trailing nulls removed from each event tuple
  → embed string pool in header
```

This achieves 5–12× compression over raw JSON (v5 was 3–5×). The improvement comes from:
- String interning (20–40% on verbose payloads)
- Numeric delta encoding (meaningful on time-series data)
- Null stripping (saves ~2 bytes/event on average)

### 2.2 Timeline (Trajectory)

A **timeline** is a kernel registered with the system under a stable UUID. It is not just a snapshot — it has:
- Identity (UUID, name, label, tags)
- Lineage (parentId, forkSeq)
- A dynamic invariant baseline that updates as the kernel runs
- A history of snapshots

Timelines can be:
- **Created** — from any kernel instance
- **Forked** — diverges from a parent at a specific seq
- **Branched** — a clip-bounded sub-trajectory of a parent
- **Merged** — combines two or more timelines into a new trajectory
- **Compared** — multi-axis relational diff across any set of timelines

### 2.3 Invariant Baseline

The baseline is **not a static checklist**. It is a continuous signal for each invariant:

```
Invariant {
  id:      'C-1'
  text:    'All causedBy references have declared edges'
  score:   0.0–1.0           // current
  history: number[]          // rolling window of scores
  mean:    number            // rolling mean
  std:     number            // rolling std
  trend:   improving|stable|degrading
  peak:    { score, ts }     // best ever observed
  nadir:   { score, ts }     // worst ever observed
  status:  pass|warn|fail    // score >= 0.95 → warn, < 0.80 → fail
}
```

The baseline has a **composite score** (mean of all invariant scores) with its own trend and history. The `detectPeak()` function finds the optimal window — not just the maximum instant — using a rolling mean over the composite history.

### 2.4 Invariant Map

The invariant map adds **relational structure** to the baseline:
- Correlation matrix between invariant score histories
- Cluster grouping by prefix (I-group, C-group, T-group, S-group, K-group)
- Critical path: lowest-scoring invariants sorted by impact
- Summary: passing/warning/failing counts

Use the map to understand which invariants move together (are causally linked) and which are independent.

### 2.5 Blueprint

A blueprint is a **structural digest** of a kernel — not the data, but the shape. It contains:
- Vocabulary: event types with frequency, successors, parents, isRoot
- Causal grammar: the grammar of which types follow which
- Macro patterns: recurring causal chains
- Payload schemas: inferred from live events (NEW v6)
- Dynamic invariant baseline (NEW v6)
- Invariant map (NEW v6)
- Invariant peak detection (NEW v6)

Blueprints are used to `compile()` executable modules that embed the grammar, constants, and invariant state.

---

## 3. API Reference

### 3.1 Snapshot API

```js
import {
  snapshot,
  restore,
  compressionReport,
} from './modules/compress/index.js';

// Take a snapshot
const snap = snapshot(kernel);
// With options:
const snap = snapshot(kernel, {
  embedBaseline: true,  // embed invariant baseline in snapshot
  embedSchemas:  true,  // embed inferred payload schemas
});

// Restore a kernel from snapshot
const kernel2 = restore(snap);
// With options:
const kernel2 = restore(snap, {
  ringCap: 100_000,     // override ring buffer capacity
});

// Compression report
const report = compressionReport(kernel, snap);
// {
//   rawBytes, snapBytes, ratio,
//   primaryCount, totalCount, eventCount,
//   bytesPerEvent, stringPoolSize, stringPoolSavingsEstimate,
//   summary: '1024.0 KB raw → 102.4 KB snap (10×)'
// }
```

### 3.2 Timeline API

```js
import {
  createTimeline,
  forkTimeline,
  branchTimeline,
  mergeTimelines,
  getTimeline,
  listTimelines,
  dropTimeline,
  refreshTimeline,
  compareTimelines,
} from './modules/compress/index.js';

// Register a kernel as a timeline
const tlId = createTimeline(kernel, {
  name:  'production-session-1',
  label: 'baseline',
  tags:  ['prod', 'session'],
  meta:  { region: 'us-west-2' },
});

// Fork at current seq
const forkId = forkTimeline(tlId, forkedKernel, {
  name: 'experiment-branch',
});

// Branch: extract seq range 100–500 as a new timeline
const branchId = branchTimeline(tlId, [100, 500], {
  name: 'incident-window',
});

// Merge two timelines (interleave by eventTs)
const mergedId = mergeTimelines([tlIdA, tlIdB], 'interleave', {
  name: 'combined-session',
});
// strategies: 'interleave' | 'append' | 'union'

// List all timelines (summaries)
const list = listTimelines();
// [{ id, name, label, parentId, forkSeq, eventCount, composite, tags, meta }]

// Get full timeline record
const tl = getTimeline(tlId);
// { id, name, kernel, baseline, snapshots, ... }

// Refresh invariant baseline
const baseline = refreshTimeline(tlId);

// Remove from registry
dropTimeline(tlId);

// Compare two or more timelines
const comparison = compareTimelines([tlIdA, tlIdB, tlIdC]);
// {
//   timelines: [...summaries],
//   axisMatrix: { 'I-1': [{tlId, score},...], ... },
//   divergence: { 'abc↔def': { l1, normalized } },
//   vocabMatrix: { 'abc↔def': { jaccard, onlyInA, onlyInB, shared } },
//   mostSimilar, mostDivergent
// }
```

### 3.3 Invariant Baseline API

```js
import {
  createInvariantBaseline,
  updateBaseline,
  detectPeak,
  invariantMap,
  INV,   // all invariant IDs and descriptions
} from './modules/compress/index.js';

// Create baseline from live kernel
const baseline = createInvariantBaseline(kernel);

// Roll baseline forward (call periodically as kernel ingests)
updateBaseline(baseline, kernel);  // mutates in-place, returns baseline

// Detect peak composite score and optimal window
const peak = detectPeak(baseline);
// {
//   peakScore, peakTs, peakIdx,
//   optimalWindowStart, optimalWindowEnd, optimalWindowMean,
//   totalSamples, currentScore, trend
// }

// Full relational invariant map
const map = invariantMap(baseline);
// {
//   correlationMatrix: { 'I-1': { 'C-1': 0.87, ... }, ... },
//   clusters: { I: ['I-1'], C: ['C-1','C-2','C-3','C-4'], T: [...], S: [...], K: [...] },
//   criticalPath: [{ id, score, trend, impact }],
//   summary: { passing, warning, failing, composite }
// }

// All invariant definitions
console.log(INV['C-1']); // 'All causedBy references have declared edges'
```

### 3.4 Blueprint API

```js
import {
  blueprint,
  compile,
} from './modules/compress/index.js';

// Generate blueprint from live kernel
const bp = blueprint(kernel);
// With options:
const bp = blueprint(kernel, {
  // (future: filter, zoom level, etc.)
});

// Compile blueprint to executable module
const code = compile(bp, {
  ringCap:     1_000_000,  // default ring capacity in generated factory
  includeSeed: true,        // include seed flag in factory signature
  format:      'esm',       // 'esm' | 'cjs'
});
// Returns a string of JS source code
```

---

## 4. CLI Reference

### Installation

```bash
# From the nexus package root:
npm install -g .
# Or run directly:
node cli/nexus.js <command>
```

### Global Flags

| Flag | Values | Default | Description |
|------|--------|---------|-------------|
| `--format` | `pretty`, `json` | `pretty` | Output format |
| `--out` | `<file>` | stdout | Write output to file |
| `--quiet` | flag | off | Suppress headers |
| `--debug` | flag | off | Show stack traces on error |

### State

The CLI maintains a `.nexus-state.json` in the current working directory. This stores timeline registry, snapshot data, and baselines between invocations.

---

### `nexus timeline`

```bash
# List all timelines
nexus timeline list

# Show detailed info for a timeline
nexus timeline show --id <uuid-or-prefix>

# Register a snapshot as a new timeline
nexus timeline create --file session.snap.json --name "prod-run-1" --label baseline --tags prod,session

# Fork a timeline
nexus timeline fork --from <uuid> --file new.snap.json --name "experiment"

# Extract a seq-range branch
nexus timeline branch --from <uuid> --start 100 --end 500 --name "incident-window"

# Merge timelines
nexus timeline merge --ids <uuid1>,<uuid2> --strategy interleave --name combined

# Compare timelines across invariant axes
nexus timeline compare --ids <uuid1>,<uuid2>,<uuid3>

# Recompute invariant baseline
nexus timeline refresh --id <uuid>

# Remove timeline
nexus timeline drop --id <uuid>
nexus timeline drop --id <uuid> --force   # skip confirmation
```

### `nexus snapshot`

```bash
# Write snapshot to file
nexus snapshot take --id <uuid> --out session.snap.json

# Report on a snapshot file
nexus snapshot report --file session.snap.json

# Register snapshot as timeline (alias for timeline create)
nexus snapshot restore --file session.snap.json --name "restored"
```

### `nexus blueprint`

```bash
# Generate blueprint from snapshot
nexus blueprint generate --file session.snap.json --out session.bp.json

# Show blueprint summary
nexus blueprint show --file session.bp.json

# Compile blueprint to executable module
nexus blueprint compile --file session.bp.json --format esm --out session.module.mjs
nexus blueprint compile --file session.bp.json --format cjs --out session.module.cjs
```

### `nexus invariant`

```bash
# Show invariant baseline for a timeline
nexus invariant baseline --id <uuid>

# Detect peak and optimal window
nexus invariant peak --id <uuid>

# Show relational invariant map
nexus invariant map --id <uuid>

# Live-watch invariant baseline
nexus invariant watch --id <uuid> --interval 5
```

### `nexus clip`

```bash
# Extract a bounded clip as a new timeline
nexus clip extract --id <uuid> --start 200 --end 800 --name "clip-incident"
```

### `nexus repl`

```bash
# Open interactive session
nexus repl
```

---

## 5. Systems Thinking

### 5.1 The Invariant as a Signal

Traditional invariants are binary: pass or fail. The v6 system treats each invariant as a **continuous signal with a trajectory**:

```
Time →

I-1 (UUID format):   ████████████████████  1.00  stable
C-1 (edge refs):     ███████████████░░░░░  0.75  degrading ↓
T-1 (seq order):     ████████████████████  1.00  stable
S-2 (vocab stable):  ██████████████░░░░░░  0.70  degrading ↓
```

When C-1 and S-2 both degrade together, the correlation matrix reveals they're linked — probably because a new event source is being introduced without proper causality wiring. The invariant map makes this visible before it becomes a violation.

### 5.2 The Peak as a Reference Point

The optimal baseline is not "right now" — it's the best observed window of behavior. `detectPeak()` uses a rolling mean over the composite score history to find not just the highest instant, but the most sustained high-quality window.

This is useful for:
- **Regression detection**: current score vs optimal window score
- **Capacity planning**: the peak shows what the system is capable of
- **Post-incident analysis**: "were we already degrading before the incident?"

### 5.3 Timeline Lineage and Relational Analysis

Every timeline knows its parent. This enables:

```
production (tlId: aaa)
  ├── experiment-a (tlId: bbb)  ← fork at seq 5000
  │     └── experiment-a-branch (tlId: ddd)  ← branch seq 5200–5400
  └── experiment-b (tlId: ccc)  ← fork at seq 5000
        
merged-experiments (tlId: eee) ← merge(bbb, ccc, strategy=union)
```

`compareTimelines([bbb, ccc])` will tell you:
- Which event types each experiment introduced that the other didn't
- The L1 divergence across all invariant axes
- Which invariants degraded in experiment-a but not experiment-b (causal diff)

This is **multi-stream causal analysis** — not just "compare these two logs" but "compare the structural health trajectory of two diverging timelines that share a common ancestor."

### 5.4 Compression as a Health Signal

The compression ratio is itself a health signal. A kernel with:
- High type diversity → lower ratio (many unique strings)
- High payload repetition → higher ratio (delta encoding wins)
- Many causal chains → ratio improves (causedBy as position index is compact)
- Structural volatility → ratio drops (payload deltas grow, string pool misses)

A sudden drop in compression ratio (visible in `nexus snapshot report`) can indicate:
- A new event type was introduced (vocab expansion)
- Payload structure changed (delta encoding breaks down)
- A source of noise events appeared (many small unrelated payloads)

### 5.5 Blueprint as a Grammar

The compiled blueprint is not just a convenience — it is the **grammar of the domain**. The `GRAMMAR` map encodes which event types causally precede which. The `T` constants give type-safe names. `SCHEMAS` gives the inferred shape of every payload.

A compiled blueprint is the **minimum representation** of everything a new kernel needs to know about the history of a system, without replaying every event.

### 5.6 Format Versioning and Migration

```
v1 (5.0.2): no string pool, no numeric delta, full event tuples
v2 (6.0.0): string pool, numeric delta, null stripping, dynamic invariants

Backward compatibility:
  restore(v1_snap) → works (no string pool → treated as empty pool)
  restore(v2_snap) → works
  snapshot() always emits v2
```

Future versions must increment `FORMAT_VERSION`. The restore function gates on `snap.fmt > FORMAT_VERSION` and throws, not silently corrupts.

---

## 6. Invariant Reference

| ID | Group | Description | Score method |
|----|-------|-------------|-------------|
| I-1 | Identity | All event IDs are UUID v4 | % of events with valid UUID v4 |
| C-1 | Causality | All causedBy references have declared edges | % of causal events with edgeMeta |
| C-2 | Causality | No macro:detected events in kernel store | binary (1.0 or 0.0) |
| C-3 | Causality | Causal depth ≤ structural maximum (50) | % of sampled roots within depth |
| C-4 | Causality | Gate events not in primary sequence | % of primary events that are not gate-produced |
| T-1 | Temporal | seq strictly monotonically increasing | % of consecutive pairs with seq[i] > seq[i-1] |
| T-2 | Temporal | eventTs non-decreasing | % of consecutive pairs with eventTs[i] >= eventTs[i-1] |
| T-3 | Temporal | No future timestamps | % of events with ts ≤ now + 1000ms |
| S-1 | Structural | Referenced parents exist in ring or archive | % of causedBy events where findById succeeds |
| S-2 | Structural | Type vocabulary stable across rolling window | Jaccard similarity of first-half vs second-half vocab |
| S-3 | Structural | Fan-out per event ≤ structural maximum (100) | % of sampled events with children ≤ 100 |
| K-1 | Compression | Snapshot round-trips to identical event count | Set to 1.0 at baseline, updated by round-trip test |
| K-2 | Compression | Payload delta reconstruction is lossless | Set to 1.0 at baseline, updated by round-trip test |
| K-3 | Compression | Timeline UUIDs are globally unique | binary, always 1.0 within a registry |

---

## 7. Data Formats

### Snapshot (NEX-SNAP v2)

```json
{
  "magic":      "URCK-SNAP",
  "fmt":        2,
  "ts":         1715000000000,
  "cseq":       12345,
  "ctick":      12345,
  "ver":        "5.0.2",
  "types":      ["user:action", "system:ready", ...],
  "sources":    ["app", "worker", ...],
  "stringPool": ["frequently-repeated-value", ...],
  "ev": [
    [0, 0, 1000, 1000, null, null, {"_full": {...}}, null],
    [0, 0, 100, 100, 0, "x", {"field": {"$d": 5}}, null],
    [1, 1, 200, 200, 1, null, null]
  ],
  "macros":   [{"p": "a → b → c", "c": 12, "s": 100, "t": 1715000000000}],
  "gates":    [{"sig": "gate:custom", "pri": 10}],
  "n":        1000,
  "total":    1050,
  "edges":    980,
  "drops":    5,
  "baseline": { ... },
  "schemas":  { ... }
}
```

**Event tuple fields (positional):**
| Pos | Field | Description |
|-----|-------|-------------|
| 0 | typeIdx | Index into `types` array |
| 1 | srcIdx | Index into `sources` array |
| 2 | dts | Timestamp delta (ts - prev ts) |
| 3 | det | EventTs delta |
| 4 | cb | causedBy as position index in primary sequence |
| 5 | et | Edge type 1-char code |
| 6 | pd | Payload delta (or null if unchanged) |
| 7 | sessionId | Session identifier (or null) |
| 8 | srcBusName | Source bus name (or null) |

Trailing nulls are stripped (null stripping). Restore pads short tuples back to full width.

**Payload delta special values:**
- `null` — payload unchanged from previous event of same type
- `{ "_full": {...} }` — first occurrence; full payload
- `{ "key": { "$d": 5 } }` — numeric delta: `prev.key + 5`
- `{ "key": { "$s": 3 } }` — string pool reference: `stringPool[3]`
- `{ "key": undefined }` — key deleted from payload

### Blueprint (URCK-BP v2)

```json
{
  "magic":   "URCK-BP",
  "fmt":     2,
  "ts":      1715000000000,
  "session": {
    "eventCount":     10000,
    "primaryCount":   9800,
    "edgeCount":      9200,
    "macroCount":     12,
    "uniqueTypes":    24,
    "maxCausalDepth": 8
  },
  "vocab":   [{ "type": "user:action", "count": 5000, "pct": 50.0, "successors": [...], "parents": [...] }],
  "gates":   [...],
  "patterns":[...],
  "schemas": { "user:action": { "count": 5000, "fields": { "id": { "type": "string", "required": true, "coverage": 1.0 } } } },
  "invariantBaseline": { ... },
  "invariantMap":      { ... },
  "invariantPeak":     { ... }
}
```

---

## 8. Integration Patterns

### 8.1 Continuous Baseline Monitoring

```js
import { createTimeline, refreshTimeline, detectPeak, invariantMap } from './modules/compress/index.js';

// On kernel creation
const tlId = createTimeline(kernel, { name: 'live-session' });

// Every N events or N seconds
kernel.subscribe('*', () => {
  if (kernel.length % 1000 === 0) {
    const baseline = refreshTimeline(tlId);
    const peak     = detectPeak(baseline);
    const map      = invariantMap(baseline);

    if (map.summary.failing > 0) {
      console.warn('Invariant violations:', map.criticalPath);
    }
    if (peak.currentScore < peak.peakScore * 0.90) {
      console.warn(`10% regression from peak: ${peak.currentScore} vs ${peak.peakScore}`);
    }
  }
});
```

### 8.2 Multi-Session Comparison

```js
import { createTimeline, compareTimelines, mergeTimelines } from './modules/compress/index.js';

// Register multiple kernels
const ids = sessions.map((kernel, i) =>
  createTimeline(kernel, { name: `session-${i}` })
);

// Compare all sessions
const comparison = compareTimelines(ids);
console.log('Most divergent pair:', comparison.mostDivergent);
console.log('Vocab differences:', comparison.vocabMatrix);

// Merge all sessions for aggregate analysis
const mergedId = mergeTimelines(ids, 'interleave', { name: 'aggregate' });
```

### 8.3 Snapshot Pipeline (Node.js)

```js
import { snapshot, restore, compressionReport } from './modules/compress/index.js';
import { writeFileSync, readFileSync } from 'fs';

// Write
const snap = snapshot(kernel, { embedBaseline: true, embedSchemas: true });
writeFileSync('kernel.snap.json', JSON.stringify(snap));

// Report
const report = compressionReport(kernel, snap);
console.log(report.summary);

// Read + restore
const loaded  = JSON.parse(readFileSync('kernel.snap.json', 'utf8'));
const kernel2 = restore(loaded);
```

---

## 9. Changelog

### v6.0.0 (this release)
- Dynamic invariant baseline replacing static checklist
- Multi-timeline registry: create, fork, branch, merge, compare
- String interning pool in snapshot encoding
- Numeric delta encoding for number payload fields
- Null stripping in event tuples
- Per-type payload schema inference
- `detectPeak()` with rolling-mean optimal window
- `invariantMap()` with correlation matrix and critical path
- `compareTimelines()` multi-axis relational comparison
- Full CLI (`nexus`) with REPL
- Format version bumped to 2 (backward-compatible with v1)

### v5.0.2 (previous)
- Static invariant checklist (I-1, C-1, C-2, T-1)
- Single timeline, no lineage
- 3–5× compression ratio
- No schema inference
- No baseline evolution
