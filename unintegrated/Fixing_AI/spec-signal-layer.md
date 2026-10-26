# NEXUS — Signal Layer Spec
**Modules:** Topo-wire · IME-wire · Delta-engine  
**Files:** `foundation/topo-wire.js` · `foundation/ime-wire.js` · `core/delta/index.js`  
**Boot phase:** PHASE 10 (SOFT)  
**Mastevos ref:** §9.6 · §9.7 · §8.5  
**Date:** 2026-05-26  
**Supersedes:** stub entries in v8.0 §9.6, §9.7, §8.5

---

## READING THIS SPEC

The signal layer is the system's behavioral intelligence substrate. It sits between the raw event stream and the memory layer, computing trust, reputation, surprise, and behavioral fingerprints from JAA events — without any external ML library or LLM call.

Three modules. Three functions:
- **Topo-wire:** Routes events through the 8-gate SNR pipeline → per-source trust scores
- **IME-wire:** Builds behavioral baselines per source UUID → anomaly detection
- **Delta-engine:** Computes response divergence → surprise scores → versionium auto-commit triggers

After 100 events through Topo-wire, every module has a trust score. After a week through IME-wire, every agent has a behavioral baseline. After any agent response, Delta-engine tells you whether it said something genuinely novel.

---

## CONSTITUTIONAL CONSTRAINTS

- **LAW I:** None of these modules makes agent calls. They are pure data processors.
- **LAW II:** Every computed value — every trust score, every IME profile update, every delta record — is a JAA row before it drives any behavior.
- **LAW III:** Topo-wire, IME-wire, and Delta-engine never import each other. Each polls its own input tables and writes to its own output tables. If Topo-wire data is needed by IME-wire, IME-wire reads `snr_records` directly.
- **LAW IV:** `snr-record.schema.json`, `delta.schema.json`, IME profile rows all validated before insert.
- **LAW V:** All computed state accessible via CLI.
- **LAW VI:** Every anomaly, every stuck-loop detection, every sigma spike — toasted.

---

## SCHEMAS REQUIRED BEFORE BUILD

### `schemas/snr-record.schema.json`

Status: `🔴 BUILD` (§20.1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS SNR Record",
  "type": "object",
  "required": ["uuid", "sourceId", "eventUuid", "snrValue", "gateScores", "posterior", "passed", "ts", "source"],
  "properties": {
    "uuid":       { "type": "string" },
    "sourceId":   { "type": "string", "description": "module or agent UUID that produced the source event" },
    "eventUuid":  { "type": "string", "description": "event_log UUID this record was computed from" },
    "eventType":  { "type": "string" },
    "snrValue":   { "type": "number", "minimum": 0, "maximum": 1 },
    "gateScores": {
      "type": "object",
      "description": "Raw score at each of the 8 SNR gates",
      "properties": {
        "g1_range":      { "type": "number" },
        "g2_variance":   { "type": "number" },
        "g3_trend":      { "type": "number" },
        "g4_spike":      { "type": "number" },
        "g5_coherence":  { "type": "number" },
        "g6_recency":    { "type": "number" },
        "g7_context":    { "type": "number" },
        "g8_bayesian":   { "type": "number" }
      }
    },
    "posterior":  { "type": "number", "minimum": 0, "maximum": 1, "description": "Bayesian posterior trust score for sourceId" },
    "passed":     { "type": "boolean" },
    "failReason": { "type": ["string", "null"] },
    "ts":         { "type": "integer" },
    "source":     { "type": "string" },
    "causedBy":   { "type": ["string", "null"] }
  }
}
```

### `schemas/delta.schema.json`

Status: `🔴 BUILD` (§20.1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Delta Record",
  "type": "object",
  "required": ["uuid", "agentUuid", "responseUuid", "similarityToPrev", "surpriseScore", "ts", "source", "causedBy"],
  "properties": {
    "uuid":             { "type": "string" },
    "agentUuid":        { "type": "string" },
    "responseUuid":     { "type": "string", "description": "UUID of the cortex_memory or chat_completions row" },
    "similarityToPrev": {
      "type": "array",
      "items": { "type": "number", "minimum": 0, "maximum": 1 },
      "maxItems": 5,
      "description": "Cosine similarity to each of the last 5 responses (newest first)"
    },
    "surpriseScore":    { "type": "number", "minimum": 0, "maximum": 1 },
    "novelTerms":       { "type": "array", "items": { "type": "string" } },
    "windowSize":       { "type": "integer", "description": "How many prior responses were compared" },
    "ts":               { "type": "integer" },
    "source":           { "type": "string" },
    "causedBy":         { "type": "string" }
  }
}
```

### IME Profile rows (written to `ime_profiles` and `trust_scores`)

No standalone schema file needed — use inline AJV validation in IME-wire. Trust score row shape:

```json
{
  "uuid":          "string",
  "sourceUuid":    "string",
  "score":         "number [0,1]",
  "eventCount":    "integer >= 0",
  "lastAnomalyTs": "integer | null",
  "ts":            "integer",
  "source":        "string"
}
```

IME profile row shape:

```json
{
  "uuid":             "string",
  "sourceUuid":       "string",
  "eventTypeCounts":  "object (key: eventType, value: integer count)",
  "baselineHash":     "string (SHA-256 of sorted eventTypeCounts)",
  "anomalyCount":     "integer",
  "lastSeen":         "integer",
  "ts":               "integer",
  "source":           "string"
}
```

---

## MODULE 4: TOPO-WIRE — `foundation/topo-wire.js`

### What

The glue between `event_log` and the 8-gate SNR pipeline (`topo-kernel`). Topo-wire polls `event_log`, normalizes each event into a topo-kernel signal object, feeds it into the kernel, and writes the result — gate scores and Bayesian posterior — into `snr_records`. On `signal.dropped`, it also writes a gap.

The Bayesian posterior in each `snr_records` row is the per-source trust score. After 100 events from a source, that trust score is meaningful. Healer reads it before acting. RAID reads it for routing weight adjustments. Self-model reads it for `trustLandscape`.

### Why

The cockpit's `cobalt.resonance.*` SNR display has been empty since it was built. Topo-wire is the data source. More importantly: the system currently has no way to distinguish trustworthy module output from noisy or erratic output. Topo-wire creates that distinction automatically from behavioral evidence — no configuration required.

### COBALT Declaration

```json
{
  "id": "foundation.topo-wire",
  "file": "foundation/topo-wire.js",
  "layer": "foundation",
  "title": "foundation.topo-wire",
  "description": "Bridges event_log to the 8-gate SNR pipeline. Normalizes events into topo-kernel signals, writes snr_records with gate scores and Bayesian posterior trust scores per source.",
  "reads": ["event_log"],
  "writes": ["snr_records", "gaps", "toasts", "failures", "event_log", "shape_samples"],
  "polls": true,
  "pollIntervalMs": 1500,
  "bootPhase": 10,
  "gapContract": {
    "maxLatencyMs": 5000,
    "onMiss": "gap.found type=stale_module severity=medium"
  },
  "cli": [
    {
      "command": "snr status",
      "args": [],
      "flags": [],
      "emits": "cli.snr.status",
      "reads": ["snr_records"],
      "writes": [],
      "intent": "Show SNR pipeline status: events processed, pass rate, top trusted sources, recent drops",
      "example": "nexus snr status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "snr source <uuid>",
      "args": ["<uuid>"],
      "flags": ["--n <n>"],
      "emits": "cli.snr.source",
      "reads": ["snr_records"],
      "writes": [],
      "intent": "Show trust score and recent SNR records for a specific source UUID",
      "example": "nexus snr source ollama-agent-uuid",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "snr trust [--top 10] [--bottom 10]",
      "args": [],
      "flags": ["--top <n>", "--bottom <n>"],
      "emits": "cli.snr.trust",
      "reads": ["snr_records"],
      "writes": [],
      "intent": "List sources ranked by Bayesian posterior trust score. --top: highest trust. --bottom: lowest.",
      "example": "nexus snr trust --top 10",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "snr drops [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.snr.drops",
      "reads": ["snr_records"],
      "writes": [],
      "intent": "List recent SNR drops (passed=false) with failReason and source",
      "example": "nexus snr drops --n 20",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — SNR Value Normalization

Before the signal reaches the topo-kernel gates, each event is assigned a raw `snrValue` based on its type. This normalization is the key judgment: what counts as signal vs noise?

```javascript
function _snrValue(event) {
  const t = event.type ?? '';

  // High signal — agent produced meaningful output
  if (t === 'agent.response.received')           return _jitter(0.85, 0.10);
  if (t === 'guardian.chat.complete')            return _jitter(0.80, 0.10);
  if (t === 'crystal.formed')                    return _jitter(0.95, 0.05);
  if (t === 'healer.resolved')                   return _jitter(0.78, 0.08);
  if (t === 'versionium.commit')                 return _jitter(0.90, 0.05);
  if (t === 'seam.verified')                     return _jitter(0.88, 0.07);

  // Mid signal — system correcting, noteworthy but not pure output
  if (t.startsWith('gap.'))                      return _jitter(0.50, 0.10);
  if (t === 'healer.started')                    return _jitter(0.45, 0.10);
  if (t === 'guardian.heartbeat')                return _jitter(0.55, 0.08);
  if (t.startsWith('guardian.chat.message'))     return _jitter(0.60, 0.10);
  if (t === 'orion.session.complete')            return _jitter(0.65, 0.10);

  // Low signal — failure, noise, system overhead
  if (t.startsWith('failure') || t === 'agent.call.failed')   return _jitter(0.15, 0.10);
  if (t === 'agent.call.timeout')                              return _jitter(0.10, 0.05);
  if (t === 'law.violation')                                   return _jitter(0.05, 0.03);
  if (t.startsWith('toast.'))                                  return _jitter(0.30, 0.10);

  // Default — infrastructure events, cli commands, unknown
  return _jitter(0.40, 0.10);
}

// Jitter: prevents all events of same type from having identical SNR (would fool Bayesian model)
function _jitter(base, range) {
  return Math.max(0, Math.min(1, base + (Math.random() - 0.5) * range));
}
```

### How — Topo-Kernel Signal Format

Topo-wire creates a signal object matching the topo-kernel's expected input shape:

```javascript
{
  sourceId: event.source ?? event.causedBy ?? 'unknown',
  field:    'relational',
  axis:     'coherence',
  value:    _snrValue(event),
  ts:       event.ts ?? Date.now()
}
```

`field` and `axis` are fixed in this implementation. Future extension could derive them from event type — for now, all events run through the same coherence axis. This is sufficient for Bayesian posterior accumulation by `sourceId`.

### How — 8 Gate Pipeline

The topo-kernel runs the signal through 8 sequential gates. Topo-wire does not implement the gates — it calls `kernel.feed(signal)` and subscribes to the result events. The kernel is the external `topo-kernel` module (already exists in the system, referenced in §9 of Mastevos). Topo-wire is the adapter.

If the topo-kernel is not available at init (module not found), Topo-wire falls back to a **stub SNR pipeline**: a single-gate Bayesian accumulator that uses only `snrValue` as evidence. This produces less accurate trust scores but keeps the system operational. Stub mode is logged to `failures` and toasted AMBER at boot.

Gate scores for stub mode: all 8 gates set to `snrValue`. `posterior` = running Bayesian mean for this `sourceId`.

### How — Bayesian Posterior Computation

Each `sourceId` accumulates a running posterior trust score using Beta distribution updating:

```javascript
// In-memory per sourceId (backed by snr_records for replay)
_priors = {}  // { sourceId: { alpha, beta } }

function _updatePosterior(sourceId, passed) {
  if (!_priors[sourceId]) _priors[sourceId] = { alpha: 1, beta: 1 };  // Beta(1,1) = uniform prior
  const p = _priors[sourceId];
  if (passed) p.alpha += 1;
  else        p.beta  += 1;
  return p.alpha / (p.alpha + p.beta);  // posterior mean
}
```

On restart, `_priors` is rebuilt from `snr_records` by scanning all rows for each sourceId and re-applying the alpha/beta updates in order. This satisfies LAW II: no in-memory state without JAA backing.

### How — Poll Loop

Every 1.5 seconds:

1. Read new `event_log` rows (watermark pattern, same as Siphon)
2. For each event, compute `snrValue = _snrValue(event)`
3. Call `kernel.feed(signal)` — async
4. On `signal.passed` (kernel event): write `snr_records` row with gate scores and posterior. Write `shape_samples` row: `{ sigma: posterior, delta: snrValue - posterior, snr: snrValue, module: event.source, tick: event.tick ?? Date.now() }` — this feeds the shape-sampler and gives Versionium visibility into trust evolution.
5. On `signal.dropped`: write `snr_records` row with `passed=false` and `failReason`. Write `gaps` row: `{ type: 'snr_drop', path: 'snr/<sourceId>', severity: 'low', body: failReason, causedBy: event.uuid }`.
6. Advance watermark.

**Batch processing:** Process at most 150 events per tick. If 150 returned, next tick picks up from watermark. This bounds per-tick latency.

### cobalt.resonance.* SNR Feed

After each `signal.passed`, Topo-wire also writes an `event_log` row consumed by the cockpit's SNR display:

```javascript
jaaDB.insert('event_log', {
  uuid: uid(), type: 'cobalt.resonance.snr',
  source: 'foundation.topo-wire',
  payload: {
    sourceId: signal.sourceId,
    snrValue: signal.value,
    posterior: snrRecord.posterior,
    passed: true
  },
  ts: Date.now()
});
```

The cockpit's signal panel (currently empty `cobalt.resonance.*` display) picks this up via SSE. No cockpit code changes.

### Failure Modes

| Failure | Behavior |
|---|---|
| `topo-kernel` module missing | Boot in stub mode. Toast.warn AMBER. Log to `failures`. Continue. |
| `kernel.feed()` throws | Catch. Insert `failures`. Toast.error. Skip this event. Advance watermark. |
| `snr_records` insert fails | Insert `failures`. Toast.error. Posterior still updated in memory (will rebuild on next restart). |
| `shape_samples` insert fails | Insert `failures`. Silent degradation — SNR display unaffected. |
| `event_log` unreadable | Insert `failures`. Toast.error. Hold watermark. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Signal dropped (gate failed) — first time for source | `toast.warn` | AMBER |
| Signal dropped — source now has > 10 consecutive drops | `toast.error` | RED |
| Source trust score crosses below 0.2 (persistent low trust) | `toast.warn` | AMBER |
| Source trust score crosses above 0.8 (high trust established) | `toast.info` | BLUE |
| Init failure | `toast.error` | RED |
| Stub mode activated | `toast.warn` | AMBER |

Trust score threshold toasts fire at most once per source per hour (in-memory rate-limit map `_trustToastTs`).

### CLI Output Format

```
nexus snr trust --top 5
[09:54:12] [SNR]  OK     source: foundation.topo-wire       | trust: 0.94 | events: 2,147 | drops: 12
[09:54:12] [SNR]  OK     source: orion/sensor               | trust: 0.91 | events: 847  | drops: 8
[09:54:12] [SNR]  OK     source: guardian-a1b2c3            | trust: 0.87 | events: 1,203 | drops: 22
[09:54:12] [SNR]  OK     source: ollama-agent               | trust: 0.83 | events: 592  | drops: 31
[09:54:12] [SNR]  OK     source: memory/crystal             | trust: 0.79 | events: 143  | drops: 7
```

---

## MODULE 5: IME-WIRE — `foundation/ime-wire.js`

### What

Behavioral profile builder. IME-wire polls `event_log` and translates each event into an `ime.ingest()` call, using `event.source` (or Guardian `instanceId`) as the entity UUID. Each ingest updates an `ime_profiles` row (per-entity behavioral baseline) and, when an anomaly is detected, writes to `gaps` and `trust_scores`.

After a week of operation: every agent, every module, and every Guardian instance has a rich behavioral baseline. Pattern deviations auto-generate gaps. Trust scores are available for every entity that has ever produced an event.

### Why

The system currently has no identity model. A module that starts behaving erratically — emitting unusual event types, at unusual rates, with unusual payloads — is indistinguishable from normal operation until something breaks. IME-wire creates the identity layer Mastevos asked for in `hub.md`. It does this statistically, from observed behavior, without any configuration per entity.

### COBALT Declaration

```json
{
  "id": "foundation.ime-wire",
  "file": "foundation/ime-wire.js",
  "layer": "foundation",
  "title": "foundation.ime-wire",
  "description": "Behavioral profile builder. Translates JAA events into ime.ingest() calls, maintains ime_profiles and trust_scores tables, writes ime_anomaly gaps.",
  "reads": ["event_log"],
  "writes": ["ime_profiles", "trust_scores", "gaps", "toasts", "failures", "event_log"],
  "polls": true,
  "pollIntervalMs": 2500,
  "bootPhase": 10,
  "gapContract": {
    "maxLatencyMs": 8000,
    "onMiss": "gap.found type=stale_module severity=medium"
  },
  "cli": [
    {
      "command": "ime profile <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.ime.profile",
      "reads": ["ime_profiles"],
      "writes": [],
      "intent": "Show behavioral profile for a source UUID: event type distribution, baseline hash, anomaly count, last seen",
      "example": "nexus ime profile ollama-agent-uuid",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "ime trust <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.ime.trust",
      "reads": ["trust_scores"],
      "writes": [],
      "intent": "Show current trust score for a source UUID with event count and last anomaly timestamp",
      "example": "nexus ime trust guardian-a1b2c3",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "ime anomalies [--n 20] [--source <uuid>]",
      "args": [],
      "flags": ["--n <n>", "--source <uuid>"],
      "emits": "cli.ime.anomalies",
      "reads": ["gaps"],
      "writes": [],
      "intent": "List recent ime_anomaly gaps with source, description, and severity",
      "example": "nexus ime anomalies --n 10 --source guardian-a1b2c3",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "ime profiles [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.ime.profiles",
      "reads": ["ime_profiles"],
      "writes": [],
      "intent": "List all known behavioral profiles with summary stats, sorted by anomaly count DESC",
      "example": "nexus ime profiles",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Event Type Mapping

Bridge-IME's event type vocabulary maps onto NEXUS event types. IME-wire performs this translation before calling `ime.ingest()`:

| NEXUS `event.type` | IME mapped type | Notes |
|---|---|---|
| `guardian.chat.response` | `agent.session` | Guardian assistant output |
| `guardian.chat.complete` | `agent.session` | Final completion |
| `guardian.chat.message` | `agent.session` | User message |
| `agent.response.received` | `agent.session` | Any agent output |
| `gap.found` | `agent.tool_result` | System detected a problem |
| `gap.filled` | `agent.tool_result` | Problem resolved |
| `guardian.heartbeat` | `agent.tool_call` | Liveness probe |
| `healer.started` | `agent.tool_call` | Healer initiated action |
| `crystal.formed` | `agent.session` | High-value memory event |
| `failure.*` | `agent.tool_result` | Error event — counts as output |
| `law.violation` | `agent.tool_result` | Constitutional failure |
| `cli.command` | `agent.tool_call` | Human-initiated action |
| All others | `agent.session` | Default mapping |

### How — `ime.ingest()` Abstraction

IME-wire does not require an external `bridge-ime` module at runtime. It implements the IME behavioral model internally as a first-principles statistical engine. The `ime` API is an internal object:

```javascript
const ime = {
  ingest({ uuid, type, timestamp, payload }) {
    // 1. Get or create profile
    // 2. Update event type count
    // 3. Recompute baseline hash
    // 4. Check for anomaly
    // 5. Update trust score
    // 6. Write to JAA
  },
  getProfile(uuid) { /* return current profile for uuid */ },
  getTrust(uuid)   { /* return current trust score for uuid */ }
};
```

### How — Behavioral Baseline Algorithm

**Profile initialization:** On first event from a new `sourceId`, create an `ime_profiles` row with `eventTypeCounts = { [mappedType]: 1 }`, `anomalyCount = 0`, `baselineHash = sha256(JSON.stringify(sortedCounts))`.

**Ongoing ingestion:**

1. Load existing `ime_profiles` row for `sourceId` (from JAA or in-memory cache `_profileCache`).
2. Increment `eventTypeCounts[mappedType]`.
3. Compute `totalEvents = sum(Object.values(eventTypeCounts))`.
4. Compute **type probability distribution:** `p[type] = count[type] / totalEvents` for each observed type.
5. Compute new `baselineHash = sha256(JSON.stringify(Object.keys(counts).sort()))`.
6. **Anomaly check:** If `totalEvents > 50` (baseline established), check if current event's type has probability `p[mappedType] < 0.01` (1 in 100 chance or less). If so: anomaly detected.

Anomaly threshold is dynamic: for the first 50 events, no anomalies are flagged (building baseline). After 50 events, the threshold is `1 / (distinctEventTypes * 10)` — rarer types require more events to become anomalous.

**On anomaly detected:**
- Increment `anomalyCount`.
- Write `gaps` row: `{ type: 'ime_anomaly', path: 'ime/<sourceId>', severity: 'low', body: 'Unexpected event type <mappedType> from <sourceId> (p=<prob>)', causedBy: event.uuid }`.
- Severity escalation: if `anomalyCount > 5` in last 100 events → severity=`medium`. If `> 15` → severity=`high`.
- Toast AMBER: `"IME: behavioral anomaly — <sourceId> emitted unexpected <mappedType>"`.

**Trust score update:**

```javascript
function _updateTrust(sourceId, anomalyDetected) {
  const current = _trustCache[sourceId] ?? { score: 0.7, eventCount: 0 };
  const n = current.eventCount + 1;
  // Exponential moving average: trust decays on anomaly, recovers on normal events
  const alpha = 0.05;  // learning rate — slow, stable
  const observation = anomalyDetected ? 0.0 : 1.0;
  const newScore = (1 - alpha) * current.score + alpha * observation;
  _trustCache[sourceId] = { score: newScore, eventCount: n, lastAnomalyTs: anomalyDetected ? Date.now() : current.lastAnomalyTs };
  return newScore;
}
```

### How — JAA Write Pattern

On each `ime.ingest()` call:

**1. Update `ime_profiles`:**

Check if a row exists for `sourceId`:
- If none: `jaaDB.insert('ime_profiles', newProfile)` 
- If exists: `jaaDB.update('ime_profiles', existingUuid, { eventTypeCounts, baselineHash, anomalyCount, lastSeen: event.ts, ts: Date.now() })`

JAA's `update` is a shallow merge via a new append row with the same UUID. This is correct — the latest row for a UUID is the truth.

**2. Update `trust_scores`:**

On every ingest (not just anomalies), upsert `trust_scores`:
- Check: `jaaDB.query('trust_scores', r => r.sourceUuid === sourceId, 1)[0]`
- If none: insert. If exists: update.

`trust_scores` row:
```json
{
  "uuid":          "<stable per-sourceId uuid>",
  "sourceUuid":    "<sourceId>",
  "score":         0.82,
  "eventCount":    847,
  "lastAnomalyTs": null,
  "ts":            "<now>",
  "source":        "foundation.ime-wire"
}
```

**3. Write `event_log` row on profile created or anomaly:**

Profile created: `{ type: 'ime.profile.created', source: 'foundation.ime-wire', payload: { sourceId } }`  
Anomaly: `{ type: 'ime.anomaly.detected', source: 'foundation.ime-wire', payload: { sourceId, mappedType, probability } }`

### How — Poll Loop

Every 2.5 seconds:

1. Read new `event_log` rows (watermark pattern — same `_lastEventId` approach as Siphon and Topo-wire).
2. For each event: extract `sourceId = event.source ?? 'unknown'`.
3. Skip events where `source === 'foundation.ime-wire'` (avoid self-profiling loops). Also skip `source === 'foundation.topo-wire'` and `source === 'foundation.bus-log'` — infrastructure sources produce high-volume, regular, boring events that would dominate profiles without adding behavioral signal.
4. Map event type → IME type.
5. Call `ime.ingest({ uuid: sourceId, type: mappedType, timestamp: event.ts, payload: event.payload })`.
6. Write profile and trust score updates to JAA.
7. Advance watermark.

**Batch size:** 200 events per tick.

**In-memory cache:** `_profileCache` and `_trustCache` are Maps keyed by `sourceId`. On `init()`, rebuilt by scanning all `ime_profiles` and `trust_scores` rows. This avoids a JAA read per event per tick (would be prohibitive at volume).

### Failure Modes

| Failure | Behavior |
|---|---|
| `event_log` unreadable | Insert `failures`. Toast.error. Hold watermark. |
| `ime_profiles` insert/update fails | Insert `failures`. Toast.error. In-memory cache still valid — profile continues tracking. |
| `trust_scores` insert/update fails | Insert `failures`. Toast.error. In-memory cache still valid. |
| `gaps` insert fails on anomaly | Insert `failures`. Toast.error. Anomaly still counted in profile. |
| `_profileCache` rebuild fails at init | Toast.error. Boot with empty cache — profiles rebuild from live events. Data loss: anomaly detection delayed until 50 events re-accumulated. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| New behavioral profile created | `toast.info` | BLUE |
| Behavioral anomaly detected (first) | `toast.warn` | AMBER |
| Anomaly count > 5 (pattern of anomalies) | `toast.error` | RED |
| Trust score drops below 0.3 | `toast.warn` | AMBER |
| Trust score restored above 0.6 | `toast.info` | BLUE |
| Init failure | `toast.error` | RED |

### CLI Output Format

```
nexus ime profile ollama-agent-uuid
[09:54:12] [IME]  OK     source: ollama-agent-uuid
[09:54:12] [IME]  OK     events: 1,847 | distinct types: 6 | anomalies: 3
[09:54:12] [IME]  OK     distribution: agent.session(78%) agent.tool_result(14%) agent.tool_call(8%)
[09:54:12] [IME]  OK     trust score: 0.91
[09:54:12] [IME]  OK     last anomaly: none in last 200 events
[09:54:12] [IME]  OK     baseline hash: a3f7e2...
```

---

## MODULE 6: DELTA-ENGINE — `core/delta/index.js`

### What

Surprise scorer. On every `agent.response.received` event and every `guardian.chat.complete` event, Delta-engine wakes up and computes divergence between the new response and the last 5 responses from the same agent. Writes a `delta_records` row with similarity scores, `surpriseScore`, and novel terms.

Two threshold effects:
- `surpriseScore > 0.7`: sigma spike written to `shape_samples` → Versionium auto-commits (intellectual breakthrough marker)
- `surpriseScore < 0.1`: stuck-loop gap written → agent may be repeating itself

### Why

The system currently has no concept of novelty. Every agent response is treated identically regardless of whether it says something genuinely new. Delta-engine creates the creativity baseline — `surpriseScore` values over time are your actual novelty rate. Self-model reads this for `creativityIndex`. Versionium reads `shape_samples` sigma spikes for auto-commit triggers. BEP-engine reads `delta_records` for evidence in BEP triples.

### COBALT Declaration

```json
{
  "id": "core.delta",
  "file": "core/delta/index.js",
  "layer": "core",
  "title": "core.delta",
  "description": "Surprise scorer. Computes cosine similarity between consecutive agent responses, writes delta_records, triggers versionium auto-commit on high surprise, flags stuck loops on low surprise.",
  "reads": ["event_log", "cortex_memory", "chat_completions"],
  "writes": ["delta_records", "shape_samples", "gaps", "toasts", "failures", "event_log"],
  "polls": true,
  "pollIntervalMs": 2000,
  "bootPhase": 10,
  "gapContract": {
    "maxLatencyMs": 6000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "delta status",
      "args": [],
      "flags": [],
      "emits": "cli.delta.status",
      "reads": ["delta_records"],
      "writes": [],
      "intent": "Show delta engine stats: total records, mean surprise score, recent high-surprise events, stuck loop detections",
      "example": "nexus delta status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "delta agent <uuid> [--n 20]",
      "args": ["<uuid>"],
      "flags": ["--n <n>"],
      "emits": "cli.delta.agent",
      "reads": ["delta_records"],
      "writes": [],
      "intent": "Show recent delta records for a specific agent UUID, with surprise scores and novel terms",
      "example": "nexus delta agent ollama-uuid --n 10",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "delta breakthroughs [--n 10]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.delta.breakthroughs",
      "reads": ["delta_records"],
      "writes": [],
      "intent": "List high-surprise events (surpriseScore > 0.7) — your intellectual history",
      "example": "nexus delta breakthroughs --n 10",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "delta creativity [--days 7]",
      "args": [],
      "flags": ["--days <n>"],
      "emits": "cli.delta.creativity",
      "reads": ["delta_records"],
      "writes": [],
      "intent": "Compute mean surprise score over the last N days. This is your actual creativity index, not self-reported.",
      "example": "nexus delta creativity --days 7",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Trigger Events

Delta-engine watches for two event types:

1. **`agent.response.received`** — emitted by the agents dispatcher when any Ollama/API Claude/API ChatGPT response completes. Payload contains `agentId`, `responseUuid` (cortex_memory row UUID), `response` text (or truncated preview).

2. **`guardian.chat.complete`** — emitted by Siphon (via original guardian event). Payload contains `instanceId`, `sessionUuid`, `text`, `provider`.

Both event types represent "an agent said something." Delta-engine handles both identically.

### How — Text Retrieval

**For `agent.response.received`:** `responseUuid` points to a `cortex_memory` row. Full response text: `jaaDB.get('cortex_memory', responseUuid)?.content`.

**For `guardian.chat.complete`:** Text is directly in `event.payload.text`. `agentUuid` derived as `event.payload.instanceId + '/' + event.payload.provider` — a composite that uniquely identifies "this Guardian instance running Claude/ChatGPT."

If text cannot be retrieved (cortex_memory row missing): log to `failures`, emit `toast.warn`, skip this event.

### How — Cosine Similarity (Bag-of-Words)

No external dependencies. Pure JavaScript.

```javascript
function _tokenize(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// STOPWORDS: a minimal set of ~150 common English stopwords (the, is, at, which, etc.)
// Stored as a Set<string> constant in the module.

function _termFrequency(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return tf;
}

function _cosineSimilarity(tfA, tfB) {
  const allTerms = new Set([...Object.keys(tfA), ...Object.keys(tfB)]);
  let dot = 0, magA = 0, magB = 0;
  for (const t of allTerms) {
    const a = tfA[t] ?? 0;
    const b = tfB[t] ?? 0;
    dot  += a * b;
    magA += a * a;
    magB += b * b;
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
```

### How — Prior Response Retrieval

For `agentUuid`, pull the last 5 responses:

```javascript
// For API agents: scan cortex_memory
const priors = jaaDB.query('cortex_memory', r => r.agent === agentUuid, 5);

// For Guardian agents: scan chat_completions
const priors = jaaDB.query('chat_completions', r => r.instanceId === agentUuid, 5);
```

`jaaDB.query` returns newest-first by default (per §2.2 API: "newest first"). Take the first 5.

If fewer than 2 prior responses exist: write `delta_records` row with `windowSize = <count>`, `similarityToPrev = []`, `surpriseScore = null`. Null surprise score is not compared against thresholds. This is the cold-start case.

### How — Novel Term Extraction

After computing similarity:

```javascript
const newTerms  = new Set(tokens);
const priorTerms = new Set(priorTokens.flat());
const novelTerms = [...newTerms].filter(t => !priorTerms.has(t));
```

`priorTokens` is the union of all tokenized prior responses. `novelTerms` are tokens in the new response not seen in any of the last 5 responses. Capped at 50 terms.

### How — surpriseScore Computation

```javascript
const surpriseScore = similarityToPrev.length === 0
  ? null
  : 1 - Math.max(...similarityToPrev);
```

`1 - max(similarities)`: the surprise score is the complement of the best match to any prior response. If the new response is completely unlike all 5 priors (max similarity 0.1), surpriseScore = 0.9.

### How — Threshold Effects

**High surprise (surpriseScore > 0.7):**

1. Write `shape_samples` row:
```json
{
  "uuid":    "<new uuid>",
  "sigma":   "<surpriseScore>",
  "delta":   "<1 - surpriseScore>",
  "slope":   0,
  "snr":     "<posterior from latest snr_records for agentUuid, or 0.5 if not found>",
  "module":  "<agentUuid>",
  "tick":    "<Date.now()>",
  "ts":      "<Date.now()>",
  "causedBy": "<event.uuid>"
}
```

This sigma spike is what Versionium watches. Versionium's existing logic: `if sigma > 0.7 → auto-commit`. No changes to Versionium needed.

2. Emit `toast.info` BLUE: `"Delta: breakthrough from <agentId> — surprise score <score.toFixed(2)>"`

3. Write `event_log` row: `{ type: 'delta.breakthrough', source: 'core.delta', payload: { agentUuid, surpriseScore, novelTerms: novelTerms.slice(0, 10) } }`

**Low surprise (surpriseScore < 0.1):**

1. Write `gaps` row:
```json
{
  "uuid":     "<gap-uuid>",
  "type":     "behavior_gap",
  "path":     "core/delta/<agentUuid>",
  "body":     "Potential stuck loop: <agentId> surprise score <score> for last <n> responses",
  "severity": "low",
  "nodeId":   "core.delta",
  "status":   "open",
  "causedBy": "<event.uuid>",
  "createdAt": "<now>"
}
```

Severity escalates to `medium` if 3 consecutive sub-0.1 surpriseScores from same agent.

2. Emit `toast.warn` AMBER: `"Delta: possible stuck loop — <agentId> surprise score <score.toFixed(2)}>`"

### How — delta_records Row

```json
{
  "uuid":             "<new uuid>",
  "agentUuid":        "<agent identifier>",
  "responseUuid":     "<cortex_memory or chat_completions UUID>",
  "similarityToPrev": [0.32, 0.41, 0.28, 0.35, 0.39],
  "surpriseScore":    0.68,
  "novelTerms":       ["crystallization", "bayesian", "posterior"],
  "windowSize":       5,
  "ts":               1716123456789,
  "source":           "core.delta",
  "causedBy":         "<triggering event.uuid>"
}
```

### How — Poll Loop

Every 2 seconds:

1. Read new events from `event_log` where type is `agent.response.received` OR `guardian.chat.complete` (watermark pattern).
2. For each: retrieve full response text.
3. Retrieve last 5 prior responses for same agent.
4. Compute tokenization, similarity, novelTerms, surpriseScore.
5. Write `delta_records`.
6. Apply threshold effects.
7. Advance watermark.

**Batch size:** 50 per tick. Delta computation is more expensive than a simple JAA row read — limit batch to prevent tick overruns.

### Failure Modes

| Failure | Behavior |
|---|---|
| Response text not found in cortex_memory | Insert `failures`. Toast.warn. Skip. Advance watermark. |
| `delta_records` insert fails | Insert `failures`. Toast.error. shape_samples write still attempted. |
| `shape_samples` insert fails (high surprise) | Insert `failures`. Toast.warn AMBER. Log that versionium auto-commit may have been missed. |
| `gaps` insert fails (stuck loop) | Insert `failures`. Toast.error. Continue. |
| Tokenization produces empty token set (very short response) | Write `delta_records` with `windowSize=0, surpriseScore=null`. No threshold effects. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Breakthrough (surpriseScore > 0.7) | `toast.info` | BLUE |
| Stuck loop detected (< 0.1) | `toast.warn` | AMBER |
| Repeated stuck loop (3 consecutive) | `toast.error` | RED |
| Init failure | `toast.error` | RED |
| Text retrieval failure | `toast.warn` | AMBER |

### CLI Output Format

```
nexus delta creativity --days 7
[09:54:12] [DELTA] OK     creativity index (7d): 0.43
[09:54:12] [DELTA] OK     records: 847 | window avg: 4.2 prior responses
[09:54:12] [DELTA] OK     breakthroughs (>0.7): 23 (2.7%)
[09:54:12] [DELTA] OK     stuck loops (<0.1): 8 (0.9%)
[09:54:12] [DELTA] INFO   trend (7d slope): +0.02 (getting more novel)
```

```
nexus delta breakthroughs --n 5
[09:54:12] [DELTA] BREAK  2026-05-24 14:32 | ollama | score: 0.94 | novel: bayesian, crystallization, posterior
[09:54:12] [DELTA] BREAK  2026-05-23 09:15 | guardian-claude | score: 0.88 | novel: attractor, topology, mesh
[09:54:12] [DELTA] BREAK  2026-05-22 21:07 | ollama | score: 0.82 | novel: bifurcation, regime, sigma
...
```

---

## JAA TABLE SUMMARY

| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `snr_records` | foundation/topo-wire | sourceId, eventUuid, snrValue, gateScores{}, posterior, passed, failReason | snr-record.schema.json |
| `ime_profiles` | foundation/ime-wire | sourceUuid, eventTypeCounts{}, baselineHash, anomalyCount, lastSeen | inline validation |
| `trust_scores` | foundation/ime-wire | sourceUuid, score, eventCount, lastAnomalyTs | inline validation |
| `delta_records` | core/delta | agentUuid, responseUuid, similarityToPrev[], surpriseScore, novelTerms[] | delta.schema.json |

All four tables added to `ALL_TABLES` in `memory/jaa-db.js`. Required before PHASE 3.

---

## BOOT SEQUENCE INTEGRATION

All three modules start in **PHASE 10** (SOFT). Boot order within PHASE 10:

1. Topo-wire — no JAA table prerequisites beyond `event_log` (always available by PHASE 3)
2. IME-wire — no prerequisites beyond `event_log`
3. Delta-engine — requires `cortex_memory` (PHASE 9 memory layer) and `chat_completions` (PHASE 11 Siphon). Cold-start acceptable: Delta-engine polls empty tables until data arrives.

PHASE 10 failure behavior: if all three fail init, write degraded boot record, continue to PHASE 11. Loss: no trust scores, no behavioral profiles, no surprise scoring. System operational, memory/cognition layers degraded.

---

## INTER-MODULE DATA FLOW

```
event_log (written by everything)
  │
  ├── Topo-wire (polls every 1.5s)
  │     Normalizes → feeds topo-kernel → writes snr_records + shape_samples
  │     snr_records → Healer (trust before acting)
  │     snr_records → RAID (trust weight adjustments)
  │     snr_records → Self-model (trustLandscape)
  │     snr_records → IME-wire (trust score cross-reference)
  │     shape_samples → Versionium (sigma spike auto-commit)
  │     event_log (cobalt.resonance.snr) → Cockpit SNR display
  │
  ├── IME-wire (polls every 2.5s)
  │     Builds profiles → writes ime_profiles + trust_scores + gaps
  │     trust_scores → ORION policy stage (LAW I routing decisions)
  │     trust_scores → Self-model (trustLandscape composite)
  │     gaps (ime_anomaly) → Healer → fix_map
  │
  └── Delta-engine (polls every 2s)
        Computes surprise → writes delta_records + shape_samples + gaps
        delta_records → BEP-engine (evidence in BEP triples)
        delta_records → Crystal (fragility score input)
        delta_records → Self-model (creativityIndex, divergenceTrend)
        shape_samples (sigma > 0.7) → Versionium auto-commit
        gaps (stuck loop) → Healer
```
