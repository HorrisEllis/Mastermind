# NEXUS — Guardian Layer Spec
**Modules:** Siphon · Pulse · Watchman  
**Files:** `guardian/siphon.js` · `guardian/pulse.js` · `guardian/watchman.js`  
**Boot phase:** PHASE 11 (SOFT — Guardian connection optional)  
**Mastevos ref:** §10.2 · §10.3 · §10.4  
**Date:** 2026-05-26  
**Supersedes:** stub entries in v8.0 §10.2–10.4

---

## READING THIS SPEC

This spec answers What/Why/How/When/Where/Who for every behavior in these three modules. Nothing is left abstract. Every table name is exact. Every toast is specified. Every failure mode is documented.

These three modules form the server-side nervous system of the Guardian layer. Guardian (the Firefox extension) already produces data. These modules catch, organize, and monitor that data without touching the extension at all.

---

## CONSTITUTIONAL CONSTRAINTS

All three modules operate under all six NEXUS laws. Violations specific to this layer:

- **LAW I:** Siphon must not trigger agent calls. It normalizes data already in flight.
- **LAW II:** Every heartbeat, every message, every gap — JAA row first, behavior second. No in-memory-only state.
- **LAW III:** None of these modules imports from another. Pulse writes `guardian_nodes`. Watchman reads `guardian_nodes`. They never call each other.
- **LAW IV:** All rows validated against `guardian-chat.schema.json` and `guardian-health.schema.json` before insert. Schema violation = `law_violations` insert + toast.error + gap.found.
- **LAW V:** Every operational state reachable via CLI. No silent internal state.
- **LAW VI:** Every transition toasted. No silent pass, no silent fail.

---

## SCHEMAS REQUIRED BEFORE BUILD

Both schemas are `🔴 BUILD` status in §20.1. They must exist and pass AJV validation before any module in this spec is instantiated.

### `schemas/guardian-chat.schema.json`

Covers four tables: `chat_sessions`, `chat_messages`, `chat_completions`, `guardian_nodes`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Guardian Chat Schema",
  "definitions": {
    "chat_session": {
      "type": "object",
      "required": ["uuid", "sessionUuid", "provider", "instanceId", "startedAt", "source", "causedBy"],
      "properties": {
        "uuid":        { "type": "string" },
        "sessionUuid": { "type": "string", "description": "Conversation UUID from Guardian IR layer" },
        "provider":    { "type": "string", "enum": ["claude", "chatgpt", "gemini", "unknown"] },
        "instanceId":  { "type": "string", "description": "Guardian extension instanceId" },
        "startedAt":   { "type": "integer" },
        "endedAt":     { "type": ["integer", "null"] },
        "source":      { "type": "string" },
        "causedBy":    { "type": ["string", "null"] }
      }
    },
    "chat_message": {
      "type": "object",
      "required": ["uuid", "sessionUuid", "role", "text", "provider", "instanceId", "ts", "source", "causedBy"],
      "properties": {
        "uuid":        { "type": "string" },
        "sessionUuid": { "type": "string" },
        "role":        { "type": "string", "enum": ["user", "assistant"] },
        "text":        { "type": "string" },
        "provider":    { "type": "string", "enum": ["claude", "chatgpt", "gemini", "unknown"] },
        "instanceId":  { "type": "string" },
        "complete":    { "type": "boolean" },
        "ts":          { "type": "integer" },
        "source":      { "type": "string" },
        "causedBy":    { "type": ["string", "null"] }
      }
    },
    "chat_completion": {
      "type": "object",
      "required": ["uuid", "sessionUuid", "text", "provider", "instanceId", "ts", "source", "causedBy"],
      "properties": {
        "uuid":        { "type": "string" },
        "sessionUuid": { "type": "string" },
        "text":        { "type": "string" },
        "provider":    { "type": "string", "enum": ["claude", "chatgpt", "gemini", "unknown"] },
        "instanceId":  { "type": "string" },
        "complete":    { "type": "boolean", "const": true },
        "causedByCallto": { "type": ["string", "null"], "description": "agent_calls UUID if this was an orchestrated call" },
        "ts":          { "type": "integer" },
        "source":      { "type": "string" },
        "causedBy":    { "type": ["string", "null"] }
      }
    },
    "guardian_node": {
      "type": "object",
      "required": ["uuid", "instanceId", "lastSeen", "healthScore", "ts", "source"],
      "properties": {
        "uuid":          { "type": "string" },
        "instanceId":    { "type": "string" },
        "lastSeen":      { "type": "integer" },
        "capabilities":  { "type": "array", "items": { "type": "string" } },
        "tabCount":      { "type": "integer", "minimum": 0 },
        "listenerCount": { "type": "integer", "minimum": 0 },
        "healthScore":   { "type": "number", "minimum": 0, "maximum": 1 },
        "ts":            { "type": "integer" },
        "source":        { "type": "string" }
      }
    }
  }
}
```

### `schemas/guardian-health.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Guardian Health",
  "type": "object",
  "required": ["uuid", "connected", "listenerCount", "sessionCount", "healthScore", "ts", "source"],
  "properties": {
    "uuid":          { "type": "string" },
    "connected":     { "type": "boolean" },
    "listenerCount": { "type": "integer", "minimum": 0 },
    "sessionCount":  { "type": "integer", "minimum": 0 },
    "staleNodes":    { "type": "array", "items": { "type": "string" }, "description": "instanceIds of stale nodes" },
    "lostListeners": { "type": "array", "items": { "type": "string" }, "description": "instanceIds that lost listeners since last poll" },
    "healthScore":   { "type": "number", "minimum": 0, "maximum": 1 },
    "ts":            { "type": "integer" },
    "source":        { "type": "string" },
    "causedBy":      { "type": ["string", "null"] }
  }
}
```

---

## MODULE 1: SIPHON — `guardian/siphon.js`

### What

JAA-first ingestion normalizer. Watches `event_log` for all events where `type` starts with `guardian.`, extracts structured fields from the raw event payload, and writes clean records into three new tables: `chat_sessions`, `chat_messages`, `chat_completions`.

Zero extension changes. Data already flows from Guardian to `event_log`. Siphon is purely a server-side reader.

### Why

Guardian currently posts every captured Claude/ChatGPT message to NEXUS via the IR layer. These events land in `event_log` as raw, unstructured payloads. Without Siphon, there is no indexed account of AI conversations — only an undifferentiated stream. Siphon creates the relational structure that every downstream module (Lattice-index, Crystal, Self-model, Seam, Callto-executor) depends on.

### COBALT Declaration

```json
{
  "id": "guardian.siphon",
  "file": "guardian/siphon.js",
  "layer": "guardian",
  "title": "guardian.siphon",
  "description": "Chat ingestion normalizer. Watches event_log for guardian.* events, writes structured records to chat_sessions, chat_messages, chat_completions.",
  "reads": ["event_log"],
  "writes": ["chat_sessions", "chat_messages", "chat_completions", "toasts", "failures", "gaps", "event_log"],
  "polls": true,
  "pollIntervalMs": 2000,
  "bootPhase": 11,
  "gapContract": {
    "maxLatencyMs": 5000,
    "onMiss": "gap.found type=behavior_gap severity=medium"
  },
  "cli": [
    {
      "command": "guardian siphon status",
      "args": [],
      "flags": [],
      "emits": "cli.siphon.status",
      "reads": ["chat_sessions", "chat_messages", "chat_completions"],
      "writes": [],
      "intent": "Show siphon stats: session count, message count, last event processed, per-provider breakdown",
      "example": "nexus guardian siphon status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "guardian siphon sessions [--provider claude|chatgpt|gemini] [--n 20]",
      "args": [],
      "flags": ["--provider <p>", "--n <n>"],
      "emits": "cli.siphon.sessions",
      "reads": ["chat_sessions"],
      "writes": [],
      "intent": "List recent chat sessions with provider, instanceId, message count, duration",
      "example": "nexus guardian siphon sessions --provider claude --n 10",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "guardian siphon messages <session-uuid> [--n 50]",
      "args": ["<session-uuid>"],
      "flags": ["--n <n>"],
      "emits": "cli.siphon.messages",
      "reads": ["chat_messages"],
      "writes": [],
      "intent": "Show all messages for a session UUID, in order, with role and text preview",
      "example": "nexus guardian siphon messages abc-123 --n 20",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Poll Loop

Siphon runs on a 2-second poll loop via `poll-registry.js`. On each tick:

**1. Watermark tracking (LAW II)**

Siphon maintains a `_lastEventId` watermark in memory, initialized from the last-processed row at `init()`. Only events with `_rowId > _lastEventId` are processed. This prevents double-processing after restart without requiring a separate watermark table (the `_rowId` is assigned by JAA on insert and is monotone).

On `init()`, Siphon reads the most recent `chat_messages` row and uses its `causedBy` to find the source event_log row's `_rowId`. This is the resume point.

**2. Event scan**

```
jaaDB.query('event_log', e => e.type && e.type.startsWith('guardian.') && e._rowId > _lastEventId, 200)
```

Process at most 200 rows per tick to prevent tick overruns. If 200 rows returned, next tick processes the next 200. This creates natural backpressure.

**3. Event classification**

Guardian posts several event types. Siphon handles exactly these:

| `event_log.type` | Action |
|---|---|
| `guardian.chat.message` | Upsert `chat_sessions` + insert `chat_messages` |
| `guardian.chat.response` | Upsert `chat_sessions` + insert `chat_messages` (role=assistant) |
| `guardian.chat.complete` | Insert `chat_completions` (only fires when `payload.complete === true`) |
| `guardian.session.start` | Insert `chat_sessions` only (no message yet) |
| `guardian.session.end` | Update `chat_sessions.endedAt` |
| Any other `guardian.*` | Pass through, no action, advance watermark |

**4. Field extraction**

Guardian IR layer (guardian/ir-layer.js) posts events with a structured payload. Siphon extracts:

```
provider    = event.payload.provider ?? _inferProvider(event.payload.url)
sessionUuid = event.payload.conversationId ?? event.payload.sessionId
role        = event.payload.role ?? ('message' in event.type ? 'user' : 'assistant')
text        = event.payload.text ?? event.payload.content ?? ''
complete    = event.payload.complete ?? false
instanceId  = event.source  (Guardian sets source = its instanceId on all events)
```

`_inferProvider(url)`: `claude.ai` → `'claude'`, `chat.openai.com` → `'chatgpt'`, `gemini.google.com` → `'gemini'`, else `'unknown'`.

**5. chat_sessions upsert**

Before inserting a message, Siphon checks:
```
existing = jaaDB.query('chat_sessions', r => r.sessionUuid === sessionUuid, 1)[0]
```
If none: insert new `chat_sessions` row.  
If exists: no action (session already open).  
On `guardian.session.end`: `jaaDB.update('chat_sessions', existing.uuid, { endedAt: event.ts })`.

`chat_sessions` row:
```json
{
  "uuid":        "<new uuid>",
  "sessionUuid": "<conversationId from Guardian>",
  "provider":    "claude | chatgpt | gemini | unknown",
  "instanceId":  "<event.source>",
  "startedAt":   "<event.ts>",
  "endedAt":     null,
  "source":      "guardian.siphon",
  "causedBy":    "<event.uuid>"
}
```

**6. chat_messages insert**

Every `guardian.chat.message` or `guardian.chat.response` event → one `chat_messages` row.

```json
{
  "uuid":        "<new uuid>",
  "sessionUuid": "<conversationId>",
  "role":        "user | assistant",
  "text":        "<full message text>",
  "provider":    "claude | chatgpt | gemini | unknown",
  "instanceId":  "<event.source>",
  "complete":    false,
  "ts":          "<event.ts>",
  "source":      "guardian.siphon",
  "causedBy":    "<event.uuid>"
}
```

**7. chat_completions insert**

Only on events where `payload.complete === true`. This is the signal downstream modules wait for.

```json
{
  "uuid":           "<new uuid>",
  "sessionUuid":    "<conversationId>",
  "text":           "<full completed response text>",
  "provider":       "claude | chatgpt | gemini | unknown",
  "instanceId":     "<event.source>",
  "complete":       true,
  "causedByCallto": "<payload.calltoUuid ?? null>",
  "ts":             "<event.ts>",
  "source":         "guardian.siphon",
  "causedBy":       "<event.uuid>"
}
```

`causedByCallto` is populated when the Guardian event payload carries a `calltoUuid` field — set by Callto-executor when it orchestrates a tab dispatch. This is the link Seam uses to detect sibling completions.

**8. Watermark advance**

After each event processed (success or skip), advance `_lastEventId = max(_lastEventId, event._rowId)`.

**9. Schema validation**

Before every insert, run AJV against `guardian-chat.schema.json` definitions. Validation failure:
- Do NOT insert the row.
- Insert into `law_violations`: `{ law: 'LAW_IV', module: 'guardian.siphon', description: 'schema violation on <table>', severity: 'high', ts }`
- Insert into `gaps`: `{ type: 'schema_violation', severity: 'medium', path: '<table>/siphon-insert', causedBy: event.uuid }`
- Emit `toast.error` RED.
- Continue processing next event (do not halt).

### Failure Modes

| Failure | Behavior |
|---|---|
| `event_log` unreadable | Insert `failures` row. Toast.error. Do not advance watermark. Retry next tick. |
| `chat_sessions` insert fails | Insert `failures` row. Toast.error. Gap type=`stuck_call` severity=`medium`. |
| `chat_messages` insert fails | Insert `failures` row. Toast.error. Gap. |
| `chat_completions` insert fails | Insert `failures` row. Toast.error. Gap severity=`high` (downstream modules depend on this). |
| Malformed Guardian payload (missing `conversationId`) | Log to `failures`. Skip event. Advance watermark. Emit `toast.warn` AMBER. |
| Unexpected `guardian.*` event type | Log to `event_log` type=`siphon.unknown_event`. Skip. Continue. No toast. |

### Toast Contracts

| Event | Type | Color | Message |
|---|---|---|---|
| New session opened | `toast.info` | BLUE | `Siphon: new <provider> session <short-uuid>` |
| Any init failure | `toast.error` | RED | `guardian.siphon init failed: <error>` |
| Insert failure | `toast.error` | RED | `Siphon: insert failed on <table>: <error>` |
| Schema violation | `toast.error` | RED | `Siphon: LAW IV violation — schema mismatch on <table>` |
| Malformed event | `toast.warn` | AMBER | `Siphon: malformed guardian event <event-uuid> — skipped` |

Session open toast fires only once per session UUID. Siphon tracks `_toastedSessions` Set in memory.

### CLI Output Format

```
nexus guardian siphon status
[09:54:12] [SIPHON] OK     sessions: 47 total (claude: 31, chatgpt: 12, gemini: 4)
[09:54:12] [SIPHON] OK     messages: 1,847 total (last: 14s ago)
[09:54:12] [SIPHON] OK     completions: 203 (last: 14s ago)
[09:54:12] [SIPHON] OK     watermark: event_log row 14,293
[09:54:12] [SIPHON] OK     last error: none
```

---

## MODULE 2: PULSE — `guardian/pulse.js`

### What

Server-side heartbeat consumer. Reads `guardian.heartbeat` events from `event_log` and builds a live mesh topology in the `guardian_nodes` JAA table. Detects stale nodes (no heartbeat in 25s) and writes gap events. Provides the live data behind the cockpit's guardian-pill indicator and behind Watchman's health assessment.

### Why

Guardian's background.js sends a heartbeat to `/guardian/heartbeat` every 8 seconds. The NEXUS handshake module calls `nodeRegistry.seen()` and stops there. Nothing meaningful happens — there is no persistent record of connected nodes, no health scoring, no stale detection. Pulse closes this gap. Every module that needs to know if Guardian is connected reads `guardian_nodes`. Without Pulse, that table is empty.

### COBALT Declaration

```json
{
  "id": "guardian.pulse",
  "file": "guardian/pulse.js",
  "layer": "guardian",
  "title": "guardian.pulse",
  "description": "Heartbeat consumer and mesh topology builder. Reads guardian.heartbeat events, maintains guardian_nodes table, detects stale nodes.",
  "reads": ["event_log"],
  "writes": ["guardian_nodes", "gaps", "toasts", "failures", "event_log"],
  "polls": true,
  "pollIntervalMs": 3000,
  "bootPhase": 11,
  "gapContract": {
    "maxLatencyMs": 8000,
    "onMiss": "gap.found type=stale_module severity=high"
  },
  "cli": [
    {
      "command": "guardian pulse status",
      "args": [],
      "flags": [],
      "emits": "cli.pulse.status",
      "reads": ["guardian_nodes"],
      "writes": [],
      "intent": "Show all known Guardian nodes with instanceId, lastSeen delta, tabCount, listenerCount, healthScore",
      "example": "nexus guardian pulse status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "guardian pulse node <instanceId>",
      "args": ["<instanceId>"],
      "flags": [],
      "emits": "cli.pulse.node",
      "reads": ["guardian_nodes"],
      "writes": [],
      "intent": "Show full history of heartbeat records for a specific Guardian instance",
      "example": "nexus guardian pulse node guardian-abc123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Heartbeat Event Shape

Guardian background.js POSTs to `/guardian/heartbeat` with body:
```json
{
  "instanceId": "guardian-<short-hash>",
  "capabilities": ["claude", "chatgpt", "capture", "inject"],
  "tabCount": 3,
  "listenerCount": 2,
  "ts": 1716123456789
}
```

The NEXUS handshake endpoint (already built) writes this as an `event_log` row:
```json
{
  "uuid": "<event-uuid>",
  "type": "guardian.heartbeat",
  "source": "<instanceId>",
  "payload": { "instanceId": "...", "capabilities": [...], "tabCount": 3, "listenerCount": 2 },
  "ts": 1716123456789
}
```

Pulse reads these rows. It never touches the HTTP layer.

### How — Poll Loop

Every 3 seconds:

**1. Read new heartbeat events**

```
events = jaaDB.query('event_log', e => e.type === 'guardian.heartbeat' && e._rowId > _lastHbRowId, 100)
```

**2. For each heartbeat event: upsert guardian_nodes**

Pulse looks for an existing row:
```
existing = jaaDB.query('guardian_nodes', n => n.instanceId === payload.instanceId, 1)[0]
```

Compute `healthScore`:
```
healthScore = _computeHealthScore(payload)
```

`_computeHealthScore` algorithm:
- Base score: `1.0`
- Deduct `0.3` if `listenerCount === 0` (no active listeners = effectively disconnected)
- Deduct `0.2` if `tabCount === 0` (no open tabs)
- Deduct `0.1` for each capability missing from expected set (`['claude', 'chatgpt', 'capture', 'inject']`)
- Clamp to `[0, 1]`

If no existing row: **insert** new `guardian_nodes` row.  
If existing: **update** (via `jaaDB.update`) with new `lastSeen`, `tabCount`, `listenerCount`, `healthScore`, `capabilities`.

`guardian_nodes` row:
```json
{
  "uuid":          "<new uuid on insert, existing uuid on update>",
  "instanceId":    "<payload.instanceId>",
  "lastSeen":      "<event.ts>",
  "capabilities":  ["claude", "chatgpt", "capture", "inject"],
  "tabCount":      3,
  "listenerCount": 2,
  "healthScore":   0.85,
  "ts":            "<event.ts>",
  "source":        "guardian.pulse"
}
```

**3. Stale detection**

After processing new heartbeats, scan ALL `guardian_nodes` rows:
```
allNodes = jaaDB.scan('guardian_nodes')
staleThresholdMs = 25000
now = Date.now()
staleNodes = allNodes.filter(n => now - n.lastSeen > staleThresholdMs)
```

For each stale node **not already gapped** (Pulse tracks `_gappedInstances` Set in memory):

- Insert `gaps` row:
```json
{
  "uuid":     "<gap-uuid>",
  "type":     "stale_module",
  "path":     "guardian_nodes/<instanceId>",
  "body":     "Guardian instance <instanceId> stale — last heartbeat <delta>ms ago",
  "severity": "high",
  "nodeId":   "guardian.pulse",
  "status":   "open",
  "causedBy": "<last-heartbeat-event-uuid>",
  "createdAt": "<now>"
}
```

- Emit `toast.gap` RED: `"Guardian instance <instanceId> stale — last seen <delta>s ago"`
- Add instanceId to `_gappedInstances`

When a stale node sends a fresh heartbeat:
- Remove from `_gappedInstances`
- Find open gap for this instanceId and `jaaDB.update` its status to `'filled'`
- Emit `toast.success` GREEN: `"Guardian instance <instanceId> reconnected"`

**4. Dead node pruning**

Nodes not seen for `120s` are considered dead. Pulse removes them from in-memory tracking (`_gappedInstances`). The JAA row remains for audit purposes — it is not deleted (§M1: everything stored). Pulse inserts a final `event_log` row: `{ type: 'guardian.node.dead', source: 'guardian.pulse', payload: { instanceId } }`.

### healthScore Formula (complete)

```
healthScore = 1.0
  - (listenerCount === 0 ? 0.3 : 0)
  - (tabCount === 0 ? 0.2 : 0)
  - missingCapabilities * 0.1
  - (ageMs > 15000 ? 0.2 : 0)     // heartbeat is late (should be every 8s)
  clamped to [0, 1]
```

`ageMs` is computed at the moment Pulse processes the event: `Date.now() - event.ts`. If Guardian's clock is significantly skewed, this will produce incorrect scores — acceptable given local-first architecture.

### Failure Modes

| Failure | Behavior |
|---|---|
| `event_log` unreadable | Insert `failures`. Toast.error. Hold watermark. Retry next tick. |
| `guardian_nodes` insert fails | Insert `failures`. Toast.error. Gap severity=`medium`. |
| `guardian_nodes` update fails | Insert `failures`. Toast.error. Old data persists — stale detection still works. |
| Heartbeat payload missing `instanceId` | Log to `failures`. Skip. Emit `toast.warn`. Do not insert node row. |
| Malformed `capabilities` field | Use empty array `[]`. Deduct max capability penalty from healthScore. Continue. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| New Guardian instance seen (first heartbeat) | `toast.info` | BLUE |
| Node goes stale | `toast.gap` | RED |
| Node reconnects (fresh heartbeat after stale) | `toast.success` | GREEN |
| Node declared dead (120s) | `toast.warn` | AMBER |
| Any init failure | `toast.error` | RED |
| Any insert/update failure | `toast.error` | RED |

### CLI Output Format

```
nexus guardian pulse status
[09:54:12] [PULSE]  OK     2 Guardian node(s) connected
[09:54:12] [PULSE]  OK     guardian-a1b2c3 | claude,chatgpt | tabs:2 | listeners:1 | health:0.85 | last:4s ago
[09:54:12] [PULSE]  WARN   guardian-d4e5f6 | claude       | tabs:0 | listeners:0 | health:0.50 | last:22s ago
[09:54:12] [PULSE]  INFO   no stale nodes (threshold: 25s)
```

---

## MODULE 3: WATCHMAN — `guardian/watchman.js`

### What

Guardian health synthesizer and alarm system. Reads `guardian_nodes` every 5 seconds, computes a composite `guardian_health` record, writes it to JAA, and emits high-severity gaps and RED toasts when `healthScore < 0.3` or `connected = false`.

Also serves as the pre-flight check for any automation workflow with a `guardian-claude` or `guardian-chatgpt` step — those workflows read `guardian_health` before enqueuing, enabling automatic fallback to API Claude (LAW I compliance).

### Why

The cockpit's guardian-pill has `connected/disconnected` states but nothing to drive them except socket state. Pulse gives nodes data. Watchman synthesizes that into a single authoritative health record that the cockpit, the queue manager, and any module needing Guardian can read. It is the single source of truth for "is Guardian available right now?"

Without Watchman, Guardian failures are invisible until something depending on Guardian fails. With Watchman, a disconnection generates a gap within 5 seconds, and healer can react before any workflow attempts to use it.

### COBALT Declaration

```json
{
  "id": "guardian.watchman",
  "file": "guardian/watchman.js",
  "layer": "guardian",
  "title": "guardian.watchman",
  "description": "Guardian health synthesizer. Reads guardian_nodes, writes guardian_health every 5s, emits severity:high gap when Guardian unavailable.",
  "reads": ["guardian_nodes"],
  "writes": ["guardian_health", "gaps", "toasts", "failures", "event_log"],
  "polls": true,
  "pollIntervalMs": 5000,
  "bootPhase": 11,
  "gapContract": {
    "maxLatencyMs": 10000,
    "onMiss": "gap.found type=stale_module severity=high"
  },
  "cli": [
    {
      "command": "guardian watchman status",
      "args": [],
      "flags": [],
      "emits": "cli.watchman.status",
      "reads": ["guardian_health"],
      "writes": [],
      "intent": "Show latest guardian_health record: connected, listenerCount, sessionCount, healthScore, stale/lost nodes",
      "example": "nexus guardian watchman status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "guardian watchman history [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.watchman.history",
      "reads": ["guardian_health"],
      "writes": [],
      "intent": "Show last N guardian_health records with timestamps — shows health trend over time",
      "example": "nexus guardian watchman history --n 20",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Poll Loop

Every 5 seconds:

**1. Read guardian_nodes**

```
allNodes = jaaDB.scan('guardian_nodes')
now = Date.now()
```

**2. Classify nodes**

```
freshThresholdMs = 12000   // connected if heartbeat within 12s
staleThresholdMs = 25000   // stale if heartbeat > 25s ago

activeNodes = allNodes.filter(n => now - n.lastSeen <= freshThresholdMs)
staleNodes  = allNodes.filter(n => now - n.lastSeen > staleThresholdMs)
connected   = activeNodes.length > 0
```

**3. Compute aggregate stats**

```
listenerCount = sum(activeNodes.map(n => n.listenerCount))
sessionCount  = sum(activeNodes.map(n => n.tabCount))
staleNodeIds  = staleNodes.map(n => n.instanceId)
```

**4. Detect lost listeners**

Compare to previous `guardian_health` record:
```
prev = jaaDB.tail('guardian_health', 1)[0]
prevListenerCount = prev?.listenerCount ?? 0
lostListeners = []

if (listenerCount < prevListenerCount) {
  // Find which nodes lost listeners vs last tick
  // (requires comparing current node state to prev node state — use prev health record's embedded node snapshot)
  lostListeners = _identifyLostListeners(allNodes, prev)
}
```

`_identifyLostListeners`: stores a map of `{ instanceId → listenerCount }` at each tick in `_prevNodeListeners` (in-memory). Compares current vs prev. Returns instanceIds where `currentCount < prevCount`.

**5. Compute composite healthScore**

```
if (!connected) {
  healthScore = 0
} else {
  listenerScore  = Math.min(1, listenerCount / 2)          // 2+ listeners = full score
  sessionScore   = Math.min(1, sessionCount / 1)            // at least 1 tab = full score
  staleRatio     = staleNodes.length / Math.max(1, allNodes.length)
  healthScore    = 0.4 * listenerScore + 0.4 * sessionScore + 0.2 * (1 - staleRatio)
  healthScore    = Math.max(0, Math.min(1, healthScore))
}
```

**6. Write guardian_health row**

```json
{
  "uuid":          "<new uuid>",
  "connected":     true,
  "listenerCount": 3,
  "sessionCount":  2,
  "staleNodes":    [],
  "lostListeners": [],
  "healthScore":   0.87,
  "ts":            "<now>",
  "source":        "guardian.watchman",
  "causedBy":      "<latest guardian_nodes row uuid>"
}
```

Schema validated against `guardian-health.schema.json` before insert (LAW IV).

**7. Threshold checks and gap emission**

After writing `guardian_health`:

**Condition A — disconnected:**
```
if (!connected && !_disconnectedGapOpen) {
  insert gap: { type: 'dead_listener', path: 'guardian/all', severity: 'high', body: 'All Guardian instances disconnected', ... }
  toast.error RED: "Guardian disconnected — no active instances"
  _disconnectedGapOpen = true
}
if (connected && _disconnectedGapOpen) {
  update gap status → 'filled'
  toast.success GREEN: "Guardian reconnected — <activeNodes.length> instance(s) active"
  _disconnectedGapOpen = false
}
```

**Condition B — low health:**
```
if (healthScore < 0.3 && !_lowHealthGapOpen) {
  insert gap: { type: 'behavior_gap', path: 'guardian/health', severity: 'high', body: `Guardian health degraded: ${healthScore.toFixed(2)}`, ... }
  toast.error RED: `Guardian health degraded: score=${healthScore.toFixed(2)}`
  _lowHealthGapOpen = true
}
if (healthScore >= 0.5 && _lowHealthGapOpen) {
  update gap status → 'filled'
  toast.success GREEN: `Guardian health restored: score=${healthScore.toFixed(2)}`
  _lowHealthGapOpen = false
}
```

**Condition C — lost listeners:**
```
if (lostListeners.length > 0) {
  // Emit warning only — not a gap unless also disconnected
  toast.warn AMBER: `Guardian: ${lostListeners.length} listener(s) lost (instances: ${lostListeners.join(', ')})`
  insert event_log: { type: 'guardian.listeners.lost', payload: { lostListeners }, source: 'guardian.watchman' }
}
```

**8. cobalt.resonance.* events (cockpit integration)**

The cockpit's stream view listens for `cobalt.resonance.*` events via SSE. Watchman emits these as `event_log` rows that the admin SSE stream forwards:

```
if (!connected || healthScore < 0.3) {
  insert event_log: { type: 'cobalt.resonance.guardian', payload: { state: 'critical', healthScore, connected }, source: 'guardian.watchman' }
} else if (healthScore < 0.6) {
  insert event_log: { type: 'cobalt.resonance.guardian', payload: { state: 'degraded', healthScore }, source: 'guardian.watchman' }
} else {
  insert event_log: { type: 'cobalt.resonance.guardian', payload: { state: 'healthy', healthScore }, source: 'guardian.watchman' }
}
```

The cockpit guardian-pill reads these events from the SSE stream and applies the correct visual state (green/amber/red). No cockpit code changes required.

### Queue Manager Integration

Watchman does NOT integrate with the queue manager directly. The queue manager (automation/queue-manager.js) reads `guardian_health` directly:

```javascript
// In queue-manager.js — gate condition for guardian-dependent steps:
// "condition": "$.guardianConnected === true"
// Resolved by reading: jaaDB.tail('guardian_health', 1)[0]?.connected ?? false
```

This is LAW III: Watchman writes the table, queue-manager reads it. No direct module call.

When `guardian_health.connected === false` and a queued item has a `guardian-claude` or `guardian-chatgpt` step:
- Queue manager delays that item (not fails it)
- Inserts an `event_log` row: `{ type: 'queue.guardian.fallback', payload: { itemId, reason: 'guardian_disconnected' } }`
- RAID falls back to API Claude per LAW I evaluation order

### Failure Modes

| Failure | Behavior |
|---|---|
| `guardian_nodes` unreadable | Insert `failures`. Toast.error. Write `guardian_health` row with `connected=false, healthScore=0`. Ensures queue manager sees Guardian as unavailable — safe degradation. |
| `guardian_health` insert fails | Insert `failures`. Toast.error. In-memory state still valid — gap tracking continues. Next tick will attempt insert again. |
| Previous health record missing (first tick) | Treat `prevListenerCount = 0`. `lostListeners = []`. Proceed normally. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Guardian disconnected (all nodes gone) | `toast.error` | RED |
| Guardian reconnected | `toast.success` | GREEN |
| Health degraded (< 0.3) | `toast.error` | RED |
| Health restored (>= 0.5 after degraded) | `toast.success` | GREEN |
| Listeners lost (but still connected) | `toast.warn` | AMBER |
| Init failure | `toast.error` | RED |

### CLI Output Format

```
nexus guardian watchman status
[09:54:12] [WATCHMAN] OK     connected: YES (2 active nodes)
[09:54:12] [WATCHMAN] OK     listeners: 3 total  sessions: 2 tabs
[09:54:12] [WATCHMAN] OK     health score: 0.87
[09:54:12] [WATCHMAN] INFO   stale nodes: none
[09:54:12] [WATCHMAN] INFO   lost listeners: none (since last poll)
[09:54:12] [WATCHMAN] INFO   last health record: 3s ago
```

```
nexus guardian watchman status   # when disconnected
[09:54:12] [WATCHMAN] ERROR  connected: NO — last node seen 47s ago
[09:54:12] [WATCHMAN] ERROR  health score: 0.00
[09:54:12] [WATCHMAN] ERROR  open gap: guardian/all (severity: high, age: 42s)
[09:54:12] [WATCHMAN] INFO   fallback: queue manager routing to API Claude (LAW I)
```

---

## JAA TABLE SUMMARY

| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `chat_sessions` | guardian/siphon | sessionUuid, provider, instanceId, startedAt, endedAt | guardian-chat.schema.json |
| `chat_messages` | guardian/siphon | sessionUuid, role, text, provider, instanceId, complete, ts | guardian-chat.schema.json |
| `chat_completions` | guardian/siphon | sessionUuid, text, provider, instanceId, complete, causedByCallto, ts | guardian-chat.schema.json |
| `guardian_nodes` | guardian/pulse | instanceId, lastSeen, capabilities[], tabCount, listenerCount, healthScore | guardian-chat.schema.json |
| `guardian_health` | guardian/watchman | connected, listenerCount, sessionCount, staleNodes[], lostListeners[], healthScore | guardian-health.schema.json |

All five tables added to `ALL_TABLES` in `memory/jaa-db.js` before PHASE 3 boot. PHASE 3 opens append streams for all declared tables. Missing table declaration = boot failure.

---

## BOOT SEQUENCE INTEGRATION

All three modules start in **PHASE 11** (SOFT). Boot continues even if Guardian is unavailable — that is the expected production state when Guardian is not open.

Boot order within PHASE 11:
1. Pulse — must start before Watchman (Watchman reads `guardian_nodes` which Pulse writes)
2. Siphon — independent, can start in parallel with Pulse
3. Watchman — depends on `guardian_nodes` having at least one read attempt

If Pulse fails init: Watchman still starts but immediately writes `guardian_health` with `connected=false, healthScore=0`. All guardian-dependent workflows fall back to LAW I alternatives. System is degraded but operational.

If all three fail init: write `boot_records` row with phase=11, status='degraded', detail='guardian layer failed'. Boot continues to PHASE 12.

---

## INTER-MODULE DATA FLOW

```
Guardian Extension (browser)
  │
  │  POST /guardian/heartbeat  (every 8s)
  │  POST /api/event (guardian.chat.*)
  │
  ▼
NEXUS HTTP admin server (port 3748)
  │
  │  Writes to event_log
  │
  ▼
event_log (JAA)
  │
  ├── Siphon (polls every 2s)
  │     Reads: event_log (guardian.chat.*)
  │     Writes: chat_sessions, chat_messages, chat_completions
  │
  └── Pulse (polls every 3s)
        Reads: event_log (guardian.heartbeat)
        Writes: guardian_nodes
              │
              ▼
           Watchman (polls every 5s)
              Reads: guardian_nodes
              Writes: guardian_health
                       │
                       ├── Queue manager (reads before dispatching guardian-* steps)
                       ├── RAID (reads before routing to guardian-claude)
                       ├── Callto-executor (reads before enqueuing GUARDIAN_EXECUTE_INTENT)
                       └── Cockpit guardian-pill (via cobalt.resonance.guardian SSE events)
```

---

## WHAT THESE MODULES UNLOCK (downstream)

- **Siphon → Lattice-index:** Every chat message feeds the associative word lattice
- **Siphon → Delta-engine:** Completed responses feed the surprise scorer
- **Siphon → Seam:** Sibling completions (same `causedByCallto`) trigger multi-AI merge
- **Pulse → Callto-executor:** Healthy Guardian instances selected for tab dispatch
- **Pulse → RAID:** Guardian-Claude routing check (§5.1 step 2 of routing algorithm)
- **Watchman → Queue manager:** Guardian-dependent workflow gating
- **Watchman → Cockpit:** Guardian-pill visual state (green/amber/red) via SSE
- **Watchman → Self-model:** `systemHealth.guardianConnected` field (§14.3)
