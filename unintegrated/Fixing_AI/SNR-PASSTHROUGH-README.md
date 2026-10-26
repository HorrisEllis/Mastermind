# SNR Passthrough

**File:** `core/snr-passthrough.js`  
**UI:** `snr-passthrough-ui.html`  
**Port:** 7825 (`SNR_PORT` env to override)  
**COBALT ID:** `core.snr-passthrough`  
**Boot phase:** 6 — after JAA, before agents  
**Writes:** `event_log` only (via NEXUS `/api/event`)  
**Zero external dependencies** — Node.js stdlib only

---

## What This Is

A pluggable signal processing pipeline. Data enters one end, travels through a configurable chain of plugins, and exits the other. Each plugin is a lens. The shape of the pipeline determines what passes, what gets enriched, what gets dropped, and what gets flagged.

```
INPUT → [checkpoint] → [snr-gate] → [list-filter] → [tagger]
      → [first-principles] → [behavior-pattern] → [resonance-field]
      → [context-injector] → [feedback-loop] → [analytics] → OUTPUT
```

Every node in that chain is optional, reorderable, and runtime-togglable without a restart. The pipeline is just an array of names. Changing it is a PUT request.

---

## Why It Exists

NEXUS has signal everywhere — agent calls, browser events, memory writes, Guardian heartbeats, delta scores. All of it flows as raw events. There's no universal layer that asks: *is this worth processing? Is it noise? Does it fit a known pattern? Has it been seen before? Should it go back for correction?*

SNR Passthrough is that layer. It sits between any two points in the system where signal quality matters. At its most basic it's a gate. At full configuration it's a pipeline with scoring, tagging, pattern detection, anomaly alerting, context enrichment, and a feedback loop that routes low-quality output back to an agent for correction before re-entry.

The name is literal. Signal-to-noise is the ratio it enforces.

---

## System Position

SNR Passthrough is infrastructure, not a feature. It doesn't belong to any single module. It can be inserted anywhere:

```
Guardian userscript → [SNR] → NEXUS event bus
Cortex /ask → [SNR] → Ollama
Agent response → [SNR] → memory write
Callto dispatch → [SNR] → Seam intake
External API → [SNR] → NEXUS
```

Use it inline (`require('./core/snr-passthrough').runPipeline(signal)`) or as an HTTP proxy (`POST /snr/input`). Both modes are equivalent.

---

## Signal Envelope

Every value entering the pipeline is wrapped in a Signal. Plugins never see raw payloads — they see Signals.

```js
{
  uuid:    'string  — unique ID. Never mutate.',
  ts:      'number  — creation timestamp ms. Never mutate.',
  payload: 'any     — the actual data. Mutate freely.',

  meta: {
    source:     'string   — origin identifier',
    topic:      'string   — routing key, used by list-filter',
    tags:       'string[] — append-only. Never remove.',
    snrScore:   'number   — 0–1, set by snr-gate plugin',
    passed:     'boolean  — false if dropped',
    drop:       '{ plugin, reason } | null',
    feedback:   'boolean  — true if this is a corrected re-entry',
    loopDepth:  'number   — feedback iteration depth (0 = original)',
    resonance:  'number   — 0–1, set by resonance-field plugin',
    burst:      'object | null — set by behavior-pattern on burst',
    anomaly:    'object | null — set by behavior-pattern on z-score outlier',
    violations: 'array | null — set by first-principles on failure',
  },

  history: [
    { plugin: 'snr-gate', action: 'pass', ts: 1716998400000 },
    { plugin: 'tagger',   action: 'pass', ts: 1716998400001 },
  ],
}
```

`history` is the pipeline trace. After a signal completes, `history` shows exactly which plugins ran, in which order, and what each did. Drop events include a `note` with the reason.

---

## Built-In Plugins

Ten plugins ship with the system. All are registered by default. Each can be enabled/disabled independently and reconfigured at runtime via the HTTP API.

---

### `checkpoint`
**Position: first in default pipeline**

Named progress gates. Each check is a boolean test against the signal. Failed checks emit a `toast.warn` or `toast.error` NEXUS event. Checks can be configured to drop the signal on failure or let it through with a tag.

This is the CI gate. Before the signal is scored, it must pass basic structural validity. Default checks: `has-payload` (drops on fail), `not-empty` (warns only).

```js
config: {
  checks: [
    {
      name:       'has-payload',
      test:       s => s.payload !== null && s.payload !== undefined,
      dropOnFail: true,
      severity:   'error',
    }
  ]
}
```

---

### `snr-gate`
**Position: second**

The primary quality gate. Scores the signal 0–1 using a built-in heuristic (payload length, presence of known fields, error indicators) or a custom `scorer` function. Signals below `threshold` are dropped.

Default threshold: `0.25`. Anything above that passes. Set it higher for stricter pipelines. Set it to `0` to disable dropping while keeping the score.

The score is written to `meta.snrScore` and is available to every downstream plugin.

```js
config: {
  threshold: 0.25,
  scorer: null,  // null = built-in heuristics. Replace with fn(signal) → 0–1
}
```

To replace the scorer entirely:
```js
const snr = require('./core/snr-passthrough');
snr.plugins.snrGate.config.scorer = (signal) => {
  // your domain-specific scoring logic
  return signal.payload?.confidence ?? 0.5;
};
```

---

### `list-filter`
**Position: third**

DNS-style allow/deny by topic, source, or tag. Blacklist is checked first in default mode. Whitelist-only mode drops anything not explicitly allowed.

```js
config: {
  blacklist: { topics: ['heartbeat'], sources: [], tags: ['junk'] },
  whitelist: { topics: [], sources: [], tags: [] },
  mode: 'blacklist-first',  // or 'whitelist-only'
}
```

Use this to keep heartbeats, status pings, and diagnostic noise out of the pipeline without touching the source that generates them.

---

### `tagger`
**Position: fourth**

Applies tag rules to signals. Rules are functions — any logic you can write in a function can be a tag rule. Tags accumulate; they are never removed by downstream plugins.

```js
config: {
  rules: [
    { match: s => s.meta.topic === 'agent',      tags: ['agent'] },
    { match: s => s.meta.snrScore > 0.80,        tags: ['high-signal'] },
    { match: s => s.meta.loopDepth > 0,          tags: [`loop-${s.meta.loopDepth}`] },
  ]
}
```

Tags are the primary mechanism downstream systems use to route, filter, and categorize signals. The analytics panel aggregates them. The behavior-pattern plugin tracks their sequences. Memory writes can be tagged at ingestion.

---

### `first-principles`
**Position: fifth**

Validates signals against named invariants. Unlike checkpoint (which validates structure), first-principles validates semantics — things that should always be true by system law.

Default principles: `P1` (non-empty payload), `P2` (known source), `P3` (loop depth bounded < 10).

Violations emit a `toast.warn` and tag the signal `principle-violation`. They do not drop the signal by default — set `dropOnViolation: true` to make violations fatal.

This is where you encode your system's constitutional constraints. Any invariant that must hold across all signal types belongs here.

---

### `behavior-pattern`
**Position: sixth**

Stateful across pipeline runs. Tracks three behavioral dimensions:

**Burst detection** — counts signals from each source within a rolling time window. If the count exceeds `burstThreshold` in `burstWindow` ms, the signal is tagged `burst` and `meta.burst` is populated with the count and window. Source is throttling without rate limiting — the signal still passes, but the burst is visible downstream.

**Topic sequence** — maintains the last 20 topics seen. Used for pattern visibility in the analytics panel.

**Anomaly detection** — computes z-scores on per-topic signal counts. Topics that arrive far more or far less frequently than average (beyond `anomalyZScore` threshold) are tagged `anomaly` and `meta.anomaly` is populated with z-score and mean.

This is the behavioral fingerprint layer. Over time it shows you what the system is actually doing versus what you thought it was doing.

---

### `resonance-field`
**Position: seventh**

Geometric scoring. Builds a moving field from recent signal vectors (using configurable meta axes — default: `snrScore` and `loopDepth`). For each new signal, computes its Euclidean distance from the field mean. Resonance is `1 - normalized_distance`.

High resonance = familiar territory. Low resonance = this signal is structurally unlike recent ones.

This is not a quality score — it's a novelty score in the geometric sense. A high-quality signal that's completely unlike anything the system has seen recently will have low resonance. A low-quality signal that looks exactly like everything else will have high resonance.

Extend the axes to include more meta fields for a richer field geometry:
```js
config: {
  axes: ['snrScore', 'loopDepth', 'resonance'],  // any numeric meta field
  windowSize: 50,
}
```

---

### `context-injector`
**Position: eighth | disabled by default**

Enriches signals with system context from NEXUS memory tables. Pulls stable crystals every 30 seconds (cached), matches them to the signal's topic, and injects them into `payload._context`.

Requires a running NEXUS stack. Enable it:
```js
snr.plugins.contextInjector.enabled = true;
```

Use this when signals need to carry system knowledge forward — for example, when routing to an agent that needs established beliefs prepended to its prompt context.

---

### `feedback-loop`
**Position: ninth | disabled by default**

The correction circuit. After a signal passes the full pipeline, the feedback-loop plugin submits it to a NEXUS agent (default: `guardian-claude`) with a correction prompt. The agent's response is expected to arrive via `POST /snr/feedback` with the original `correlationUuid` and a `correctedPayload`.

The corrected signal re-enters the pipeline as a new Signal with `meta.feedback: true` and `meta.loopDepth` incremented. It runs the full chain again.

Guards:
- `maxLoopDepth: 3` — prevents infinite correction loops
- `scoreThreshold: 0.60` — only corrects signals with SNR ≥ threshold (low-quality signals aren't worth correcting)
- `triggerTag: null` — set to a tag name to only loop tagged signals

Enable and configure:
```js
snr.plugins.feedbackLoop.enabled = true;
snr.plugins.feedbackLoop.config.agentRoute = 'guardian-claude';
snr.plugins.feedbackLoop.config.maxLoopDepth = 2;
```

The feedback loop is the most powerful and most dangerous plugin. Use it selectively. Poorly configured it will generate infinite API calls. Correctly configured it's a self-correcting data pipeline.

---

### `analytics`
**Position: last — always**

Passive accumulator. Tracks total signals, mean SNR, throughput (Hz), loopback count, and per-topic distribution. Never drops or mutates signals. Always last in the pipeline — it needs to see the final state of every signal.

Exposed at `GET /snr/analytics`.

---

## HTTP API

All commands are stateless. The pipeline state lives in memory. Restart clears it.

### Process a signal
```http
POST /snr/input
Content-Type: application/json

{
  "payload": { "type": "agent.response", "content": "..." },
  "topic":   "agent",
  "source":  "cortex-v2",
  "tags":    ["important"]
}
```

Response:
```json
{
  "ok": true,
  "signal": { "uuid": "...", "meta": { "passed": true, "snrScore": 0.74, ... }, ... }
}
```

### Batch
```http
POST /snr/batch
{ "signals": [ { "payload": {...}, "topic": "..." }, ... ] }
```
Up to 100 signals per request. Returns array of Signal results.

### Agent correction (feedback loop)
```http
POST /snr/feedback
{ "correlationUuid": "original-signal-uuid", "payload": { ...corrected... } }
```

### Pipeline management
```http
GET  /snr/status            — full status, plugin list, analytics
GET  /snr/plugins           — registry + schema
PUT  /snr/plugins/:name     — enable/disable, reconfigure
PUT  /snr/pipeline          — reorder chain: { "pipeline": ["snr-gate", "tagger", ...] }
GET  /snr/log?n=20          — recent passed + dropped signals
GET  /snr/analytics         — throughput, BPE stats, topic distribution
```

---

## Plugin Schema

A plugin is an object with five required fields and two optional:

```js
{
  // Required
  name:        'kebab-case-id',           // string
  label:       'Human Display Name',      // string
  description: 'What it does.',           // string
  enabled:     true,                       // boolean — runtime-mutable
  config:      { threshold: 0.5, ... },   // object — runtime-mutable via API
  process(signal) {
    // Receives: Signal
    // Returns:  Signal (pass) | null (drop) | false (drop)
    // Async supported.
    return signal;
  },

  // Optional
  stats() {
    // Returns plugin-specific stats object
    // Exposed at GET /snr/analytics
    return { processed: this._count };
  },
}
```

### Registering a plugin

```js
const snr = require('./core/snr-passthrough');

const myPlugin = {
  name:        'rate-limiter',
  label:       'Rate Limiter',
  description: 'Drop signals from sources above N/sec.',
  enabled:     true,
  config:      { maxPerSecond: 10 },
  _windows:    {},

  process(signal) {
    const now = Date.now();
    const k   = signal.meta.source;
    this._windows[k] = (this._windows[k] || []);
    this._windows[k].push(now);
    while (this._windows[k][0] < now - 1000) this._windows[k].shift();
    if (this._windows[k].length > this.config.maxPerSecond) return null;
    return signal;
  },
};

snr.registerPlugin(myPlugin);
snr.setPipeline([...snr.DEFAULT_PIPELINE, 'rate-limiter']);
```

### Plugin ideas

These are structurally identical to the built-ins — register them the same way:

| Plugin | What it does |
|---|---|
| `rate-limiter` | Drop signals above N/sec per source |
| `deduplicator` | Drop signals with duplicate payload hash within a window |
| `schema-validator` | Validate payload against a JSON schema |
| `pii-scrubber` | Strip or hash PII fields before downstream processing |
| `compressor` | Truncate large payloads to a size limit |
| `router` | Fork signals to different downstream endpoints by topic |
| `delta-gate` | Drop signals whose SNR hasn't changed by Δ from the last signal of the same topic |
| `latency-tracker` | Measure time between signal creation and pipeline completion |
| `crystal-gate` | Drop signals whose topic has an established crystal with confidence > 0.9 (already known) |
| `priority-queue` | Buffer low-priority signals and release them when high-priority traffic is low |

---

## Feedback Loop Architecture

The feedback loop is the most architecturally interesting pattern here. It implements a self-correcting data system:

```
Signal enters pipeline
  → passes all gates
  → feedback-loop plugin submits to agent:
      "Review this signal payload. Return a corrected version."
  → original signal exits pipeline normally (not blocked)

Agent produces correction
  → POST /snr/feedback { correlationUuid, payload: correctedPayload }
  → corrected Signal re-enters pipeline with:
      meta.feedback = true
      meta.loopDepth = 1
      tags += ['corrected']
  → runs full pipeline again
  → analytics tracks as loopback
```

This is the general pattern for any system that wants to close the loop between output and input. The agent is the correction oracle. The pipeline is the enforcement mechanism that validates the correction before accepting it.

Extend to multi-agent by dispatching to two routes and merging corrections via Seam before re-entry.

---

## Inline Usage

The HTTP server is optional. Use the pipeline directly in any module:

```js
const { init, runPipeline, mkSignal, registerPlugin } = require('./core/snr-passthrough');

// Start without HTTP server
init({ enableServer: false });

// Process a signal
const signal = mkSignal(
  { type: 'agent.response', content: 'hello' },
  { source: 'cortex-v2', topic: 'agent' }
);

const result = await runPipeline(signal);

if (result.meta.passed) {
  // write to memory, dispatch to seam, etc.
} else {
  console.log('dropped by:', result.meta.drop.plugin);
}
```

Listen to pipeline events:
```js
const { on } = require('./core/snr-passthrough');

on('signal.passed',  signal => { /* write to JAA, forward to seam */ });
on('signal.dropped', signal => { /* log, increment failure counter */ });
```

---

## File Spec

```
core/snr-passthrough.js    1,104 lines
snr-passthrough-ui.html    1,287 lines

Dependencies:   none (Node.js stdlib only: http, crypto)
External calls: NEXUS /api/event (non-fatal if offline)
Port:           7825 (SNR_PORT env to override)
NEXUS port:     3748 (NEXUS_PORT env to override)
Boot:           node core/snr-passthrough.js
```
