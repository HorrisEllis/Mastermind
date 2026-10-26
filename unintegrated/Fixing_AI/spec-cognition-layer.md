# NEXUS — Cognition Layer Spec
**Modules:** Orion-ext · BEP-engine · Intent-map · Callto-executor  
**Files:** `orion/ext.js` · `core/bep/index.js` · `core/intent/index.js` · `agents/callto/index.js`  
**Boot phase:** PHASE 14 (cognition, SOFT) · PHASE 8 (Callto-executor, SOFT)  
**Mastevos ref:** §11.5 · §14.2 · §14.1 · §7.3  
**Date:** 2026-05-26  
**Supersedes:** stub entries in v8.0 §11.5, §14.2, §14.1, §7.3

---

## READING THIS SPEC

The cognition layer is where individual data points become structured knowledge and coordinated action. Four modules:

- **Callto-executor:** Exposes Guardian tab dispatch as a first-class agent. Any module can enqueue a `guardian-claude` or `guardian-chatgpt` call without touching the cockpit. Enables cross-AI workflows.
- **Orion-ext:** Multi-provider session coordinator. Takes seam records through ORION's 4-stage quality gate. Sets `verified = true` on seams that pass. The gatekeeper between raw multi-AI output and crystallized belief.
- **BEP-engine:** Belief-Evidence-Pattern engine. Builds the BEP triples that connect beliefs (crystals), evidence (delta_records), and patterns (lattice_edges). The first writer to `bep_patterns`.
- **Intent-map:** Promotes free-text agent call intents into a UUID-keyed semantic graph. Accumulates call history, success rates, surprise scores per intent. The map of everything you've ever asked the system.

---

## CONSTITUTIONAL CONSTRAINTS

- **LAW I:** Callto-executor enforces full LAW I evaluation order. Guardian-Claude is checked before API Claude. Guardian availability from `guardian_health` (Watchman). If Guardian disconnected: automatic fallback per LAW I chain.
- **LAW II:** Every callto dispatch, every intent node, every BEP triple, every Orion session — JAA row before action. Callto-executor does not POST to Guardian without first writing the `agent_calls` row.
- **LAW III:** None of these four modules imports another. Callto-executor writes to `agent_calls` and reads `guardian_nodes`. Orion-ext reads `seam_records` and `orion_sessions`. BEP-engine reads `crystals`, `delta_records`, `lattice_edges`. Intent-map reads `agent_calls` and `lattice_nodes`. All communication via JAA tables.
- **LAW IV:** All rows schema-validated. `callto.schema.json` (§20.2 — already defined). `bep-pattern.schema.json` (✅ BUILT). `intent-node.schema.json` (🔴 BUILD). Orion session rows use existing orion session schema.
- **LAW V:** Every dispatch, every intent query, every BEP lookup — CLI-accessible.
- **LAW VI:** Every agent dispatch toasted PURPLE. Every BEP contradiction toasted RED. Every Orion rejection toasted AMBER.

---

## SCHEMAS REQUIRED BEFORE BUILD

### `schemas/intent-node.schema.json`

Status: `🔴 BUILD` (§20.1)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Intent Node",
  "type": "object",
  "required": ["uuid", "text", "intentHash", "callCount", "ts", "source"],
  "properties": {
    "uuid":                { "type": "string" },
    "text":                { "type": "string", "description": "Canonical intent text (or cluster representative)" },
    "intentHash":          { "type": "string", "description": "SHA-256 of normalized intent text — used for dedup" },
    "callCount":           { "type": "integer", "minimum": 0 },
    "successRate":         { "type": "number", "minimum": 0, "maximum": 1 },
    "avgSurpriseScore":    { "type": ["number", "null"], "minimum": 0, "maximum": 1 },
    "preferredAgent":      { "type": ["string", "null"], "description": "Agent ID with highest success rate for this intent" },
    "associatedCrystals":  { "type": "array", "items": { "type": "string" }, "description": "crystal UUIDs" },
    "tags":                { "type": "array", "items": { "type": "string" } },
    "multiAgent":          { "type": "boolean", "description": "true if this intent is tagged for multi-agent dispatch (Orion-ext)" },
    "retryCount":          { "type": "integer", "minimum": 0 },
    "lastCalledAt":        { "type": ["integer", "null"] },
    "ts":                  { "type": "integer" },
    "source":              { "type": "string" },
    "causedBy":            { "type": ["string", "null"] }
  }
}
```

---

## MODULE 3 (Cognition): CALLTO-EXECUTOR — `agents/callto/index.js`

### What

First-class Guardian agent sub-module. Reads `agent_calls` where `routedTo` starts with `guardian-`, finds a healthy Guardian instance in `guardian_nodes`, and orchestrates the full dispatch cycle:

1. POST `GUARDIAN_EXECUTE_INTENT` event to `/api/event` (the internal bus endpoint)
2. Guardian's background.js picks this up via BroadcastChannel bridge
3. Guardian opens the correct AI tab (or reuses existing), injects the prompt
4. Guardian content.js MutationObserver captures the response as it streams
5. Guardian POSTs back to `/guardian/response`
6. Callto-executor polls for completion, stores response, marks `agent_calls` complete

Any module can now enqueue a `guardian-claude` or `guardian-chatgpt` call by inserting an `agent_calls` row. No human, no cockpit panel required.

### Why

Currently, Guardian tab dispatch can only be triggered from the cockpit chat panel. This means the system cannot autonomously route to Guardian. LAW I step 2 (Guardian before API Claude) exists in theory but has no executor. Callto-executor makes it real: RAID's routing algorithm can select `guardian-claude` and the call will actually happen.

This also enables the cross-AI workflow: Callto-executor dispatches the same prompt to both `guardian-claude` and `guardian-chatgpt` in parallel, setting the same `causedByCallto` on both `chat_completions` rows. Seam then detects the siblings and merges them.

### COBALT Declaration

```json
{
  "id": "agents.callto",
  "file": "agents/callto/index.js",
  "layer": "agents",
  "title": "agents.callto",
  "description": "Guardian tab dispatch executor. Reads agent_calls where routedTo starts with guardian-, orchestrates Guardian prompt injection, polls for response, stores to cortex_memory.",
  "reads": ["agent_calls", "guardian_nodes", "guardian_health"],
  "writes": ["agent_calls", "cortex_memory", "event_log", "toasts", "failures", "gaps"],
  "polls": true,
  "pollIntervalMs": 2000,
  "bootPhase": 8,
  "gapContract": {
    "maxLatencyMs": 60000,
    "onMiss": "gap.found type=stuck_call severity=high"
  },
  "cli": [
    {
      "command": "callto dispatch <agent> <prompt> [--intent <text>] [--parallel]",
      "args": ["<agent>", "<prompt>"],
      "flags": ["--intent <text>", "--parallel", "--model <m>", "--role <r>"],
      "emits": "cli.callto.dispatch",
      "reads": ["guardian_nodes", "guardian_health"],
      "writes": ["agent_calls"],
      "intent": "Dispatch a prompt to guardian-claude or guardian-chatgpt. --parallel dispatches to both simultaneously.",
      "example": "nexus callto dispatch guardian-claude 'Explain the Bayesian update rule' --parallel",
      "toastOnSuccess": "toast.agent",
      "toastOnFail": "toast.error"
    },
    {
      "command": "callto status [--n 20]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.callto.status",
      "reads": ["agent_calls"],
      "writes": [],
      "intent": "List recent guardian agent calls with status, latency, and response preview",
      "example": "nexus callto status",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "callto show <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.callto.show",
      "reads": ["agent_calls", "cortex_memory"],
      "writes": [],
      "intent": "Full detail of a callto dispatch: prompt, response, timing, Guardian instance used",
      "example": "nexus callto show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Guardian Availability Check (LAW I)

Before processing any `guardian-*` call:

```javascript
const health = jaaDB.tail('guardian_health', 1)[0];
const guardianConnected = health?.connected === true && health?.healthScore > 0.3;
```

If `!guardianConnected`:
- Update `agent_calls` row: `{ status: 'failed', error: 'Guardian disconnected — LAW I fallback', completedAt: Date.now() }`
- Insert `event_log`: `{ type: 'callto.guardian.fallback', payload: { callUuid, reason: 'guardian_disconnected' } }`
- RAID's fallback chain picks up the failed call and re-routes to API Claude (LAW I step 4)
- Emit `toast.warn` AMBER: `"Callto: Guardian unavailable — falling back to API Claude (LAW I)"`
- Do NOT proceed with Guardian dispatch

If Guardian is connected: select the node with highest `healthScore` from `guardian_nodes` where `lastSeen < 12000ms`.

### How — Dispatch Cycle

**Step 1: Claim the call**

```javascript
// Only process calls in 'pending' status
const calls = jaaDB.query('agent_calls',
  r => r.routedTo?.startsWith('guardian-') && r.status === 'pending',
  5  // at most 5 concurrent guardian dispatches
);

for (const call of calls) {
  await jaaDB.update('agent_calls', call.uuid, {
    status: 'processing',
    startedAt: Date.now(),
    source: 'agents.callto'
  });
}
```

**Step 2: Build GUARDIAN_EXECUTE_INTENT payload**

```javascript
const payload = {
  callUuid:    call.uuid,
  instanceId:  selectedNode.instanceId,     // which Guardian instance to use
  provider:    call.routedTo.replace('guardian-', ''),   // 'claude' or 'chatgpt'
  prompt:      call.prompt,
  role:        call.role ?? 'default',
  calltoUuid:  call.uuid                    // echoed back in chat_completions.causedByCallto
};
```

**Step 3: POST to internal event bus**

```javascript
// POST to NEXUS's own /api/event endpoint (localhost:3748)
// This event is picked up by Guardian's BroadcastChannel bridge
const response = await fetch('http://localhost:3748/api/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-nexus-key': NEXUS_API_KEY },
  body: JSON.stringify({
    type:    'GUARDIAN_EXECUTE_INTENT',
    source:  'agents.callto',
    payload,
    causedBy: call.uuid
  })
});
```

`NEXUS_API_KEY` = `process.env.NEXUS_API_KEY` = `'Nexus-James-2026-Erosmancer'` (from environment, per §27 NEXUS API key).

**Step 4: Poll for completion**

After dispatch, Callto-executor polls `chat_completions` for a row with `causedByCallto === call.uuid`:

```javascript
const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = 120000;  // 2 minutes — long enough for complex responses
let elapsed = 0;

while (elapsed < TIMEOUT_MS) {
  await sleep(POLL_INTERVAL_MS);
  elapsed += POLL_INTERVAL_MS;

  const completion = jaaDB.query('chat_completions',
    r => r.causedByCallto === call.uuid && r.complete === true,
    1
  )[0];

  if (completion) {
    await _handleCompletion(call, completion);
    return;
  }
}

// Timeout
await _handleTimeout(call);
```

`_handleTimeout`: update `agent_calls.status = 'timeout'`. Insert `gaps`: `{ type: 'stuck_call', severity: 'high', body: 'Guardian callto timed out after 120s', causedBy: call.uuid }`. Toast.error RED.

**Step 5: Handle completion**

```javascript
async function _handleCompletion(call, completion) {
  // 1. Update agent_calls
  await jaaDB.update('agent_calls', call.uuid, {
    status:      'complete',
    response:    completion.text,
    completedAt: Date.now(),
    duration_ms: Date.now() - call.startedAt
  });

  // 2. Write to cortex_memory (triggers delta-engine)
  await jaaDB.insert('cortex_memory', {
    uuid:    uid(),
    content: completion.text,
    agent:   call.routedTo,
    session: call.sessionId ?? 'callto-session',
    tags:    ['callto', completion.provider, call.role ?? 'default'],
    ts:      Date.now(),
    source:  'agents.callto',
    causedBy: call.uuid
  });

  // 3. Emit agent.response.received (triggers delta-engine)
  await jaaDB.insert('event_log', {
    uuid:    uid(),
    type:    'agent.response.received',
    source:  call.routedTo,
    payload: { agentId: call.routedTo, responseUuid: cortexRow.uuid, response: completion.text.slice(0, 500) },
    causedBy: call.uuid,
    ts:      Date.now()
  });

  // 4. Toast
  _toast('toast.agent', `Callto: ${call.routedTo} completed (${duration_ms}ms)`, { causedBy: call.uuid });
}
```

### How — Parallel Dispatch

For `--parallel` CLI flag or for calls where `call.tags.includes('multi-agent')`:

Callto-executor creates **two** `agent_calls` rows — one for `guardian-claude`, one for `guardian-chatgpt` — both with the same `intentUuid` and the same `causedBy`. The `causedByCallto` field set on the resulting `chat_completions` rows will match, making them siblings detectable by Seam.

```javascript
const callA = { ...baseCall, uuid: uid(), routedTo: 'guardian-claude' };
const callB = { ...baseCall, uuid: uid(), routedTo: 'guardian-chatgpt',
                causedByCallto: callA.uuid };  // Link B to A's UUID as the shared causedByCallto
// Both callA and callB written to agent_calls
// Guardian dispatches both
// Siphon sets causedByCallto = callA.uuid on BOTH chat_completions rows
// Seam detects: two completions with same causedByCallto → merge
```

**Important:** The `causedByCallto` shared key must be the same UUID for both completions. Callto-executor sets this by using `callA.uuid` as the shared key. Siphon picks it up from the GUARDIAN_EXECUTE_INTENT payload's `calltoUuid` field.

### How — poll-registry Integration

Callto-executor's main poll loop is registered with poll-registry. It has two responsibilities per tick:
1. Process new `pending` guardian-routed calls (above)
2. Check in-progress dispatches for timeout (walk all `processing` calls older than 120s)

The timeout check prevents stuck-call accumulation if Guardian goes silent mid-response.

### Failure Modes

| Failure | Behavior |
|---|---|
| Guardian disconnected | Update call to `failed`. Insert event_log for RAID fallback. Toast.warn. RAID re-routes. |
| `/api/event` POST fails | Update call to `failed`. Insert `failures`. Insert `gaps` severity=`high`. Toast.error. Healer picks up. |
| Guardian picks up event but never sends `/guardian/response` | Detected by timeout poll (120s). Gap stuck_call. |
| `cortex_memory` insert fails after completion | Insert `failures`. Toast.warn. Call marked `complete` — response still in `agent_calls.response`. |
| Parallel dispatch — one provider fails | The other completion still exists. Seam finds only one completion for the `causedByCallto`. Seam's sibling-timeout (300s) evicts the pending entry. Toast.warn AMBER. |

### Toast Contracts

| Event | Type | Color |
|---|---|---|
| Guardian dispatch sent | `toast.agent` | PURPLE |
| Response received | `toast.agent` | PURPLE |
| Guardian unavailable → LAW I fallback | `toast.warn` | AMBER |
| Timeout (120s) | `toast.error` | RED |
| Parallel dispatch initiated | `toast.agent` | PURPLE |
| Init failure | `toast.error` | RED |

---

## MODULE 10 (Cognition): ORION-EXT — `orion/ext.js`

### What

Multi-provider ORION session coordinator. Reads `seam_records` for newly created (unverified) seams and runs them through the existing ORION 4-stage pipeline (sensor → record → policy → verify) as a single coordinated flow. Sets `seam_records.verified = true` when the seam passes the verify stage's `agreementCoverage >= 0.60` threshold.

Also reads `intent_nodes` (from Intent-map) for intents tagged `multi-agent`. For these intents, creates coordinated ORION sessions before dispatch — measuring intent quality before the call, not just after.

### Why

The ORION pipeline (sensor, record, policy, verify) is built and running for single-provider sessions. But seams require a different entry point: they arrive as pre-computed structural diffs, not as raw bridge messages. Orion-ext is the adapter that feeds seams into ORION's record/policy/verify stages (skipping sensor, which is irrelevant for already-complete seams).

Without Orion-ext, seams are never verified. Without verification, Crystal never promotes beliefs to `stable`. The entire crystal formation pipeline is blocked.

### COBALT Declaration

```json
{
  "id": "orion.ext",
  "file": "orion/ext.js",
  "layer": "orion",
  "title": "orion.ext",
  "description": "Multi-provider ORION session coordinator. Feeds seam_records into ORION quality gate. Verifies seams with agreementCoverage >= 0.60. Sets seam_records.verified = true for qualifying seams.",
  "reads": ["seam_records", "event_log", "intent_nodes", "trust_scores"],
  "writes": ["orion_sessions", "seam_records", "event_log", "toasts", "failures"],
  "polls": true,
  "pollIntervalMs": 5000,
  "bootPhase": 14,
  "gapContract": {
    "maxLatencyMs": 30000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "orion list [--n 20] [--status verified|pending|rejected]",
      "args": [],
      "flags": ["--n <n>", "--status <s>"],
      "emits": "cli.orion.list",
      "reads": ["orion_sessions"],
      "writes": [],
      "intent": "List recent ORION sessions with status, seam UUID, and coverage score",
      "example": "nexus orion list --status verified",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "orion show <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.orion.show",
      "reads": ["orion_sessions", "seam_records"],
      "writes": [],
      "intent": "Full ORION session detail: all 4 stage outcomes, trust scores used, policy decision, verify result",
      "example": "nexus orion show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Seam Intake (Poll Loop)

Every 5 seconds, Orion-ext reads new `seam_records` where `verified = false` and `_rowId > _lastSeamRowId`.

For each unverified seam: create an `orion_sessions` entry and run the 3-stage ORION pipeline (sensor is skipped for seams):

**Stage 1 — Record:**

```javascript
// Record stage: persist the seam as the session artifact
await jaaDB.insert('orion_sessions', {
  uuid:        uid(),
  calltoId:    seam.intentUuid,
  status:      'recorded',
  regime:      _determineRegime(seam),
  features: {
    seamUuid:          seam.uuid,
    agreementCoverage: seam.agreementCoverage,
    providerPair:      `${seam.providerA}×${seam.providerB}`,
    agreementZoneCount: seam.agreementZones.length,
    disagreementZoneCount: seam.disagreementZones.length
  },
  verified: false,
  ts: Date.now(),
  source: 'orion.ext',
  causedBy: seam.uuid
});
```

`_determineRegime`: if `agreementCoverage > 0.8` → `'high_consensus'`. If `0.6–0.8` → `'moderate_consensus'`. If `< 0.6` → `'low_consensus'`.

**Stage 2 — Policy:**

Policy applies trust scores to decide whether to accept or retry.

```javascript
// Get trust scores for both providers
const trustA = jaaDB.query('trust_scores', r => r.sourceUuid.includes(seam.providerA), 1)[0]?.score ?? 0.5;
const trustB = jaaDB.query('trust_scores', r => r.sourceUuid.includes(seam.providerB), 1)[0]?.score ?? 0.5;
const compositeTrust = (trustA + trustB) / 2;

// Policy: if both providers have low trust (< 0.3), reject regardless of coverage
const policyAccept = compositeTrust >= 0.3;

await jaaDB.update('orion_sessions', session.uuid, {
  status: 'policy_applied',
  features: { ...session.features, compositeTrust, policyAccept }
});
```

If `!policyAccept`: update session status to `'rejected'`. Update seam_records: `{ rejected: true }`. Toast.warn AMBER: `"Orion: seam rejected by policy — trust too low (${compositeTrust.toFixed(2)})"`. Skip verify stage.

**Stage 3 — Verify:**

```javascript
const COVERAGE_THRESHOLD = 0.60;  // configurable: config.json orion.verifyThreshold
const verified = seam.agreementCoverage >= COVERAGE_THRESHOLD;

// Update seam_records
await jaaDB.update('seam_records', seam.uuid, {
  verified,
  ts: Date.now()
});

// Update orion_session
await jaaDB.update('orion_sessions', session.uuid, {
  status: verified ? 'verified' : 'rejected',
  verified
});

// Emit event (Crystal polls this)
await jaaDB.insert('event_log', {
  uuid: uid(), type: verified ? 'seam.verified' : 'seam.rejected',
  source: 'orion.ext',
  payload: { seamUuid: seam.uuid, agreementCoverage: seam.agreementCoverage, verified },
  causedBy: seam.uuid, ts: Date.now()
});

// Toast
if (verified) {
  _toast('toast.success', `Orion: seam verified (coverage: ${(seam.agreementCoverage * 100).toFixed(0)}%)`, { causedBy: seam.uuid });
} else {
  _toast('toast.warn', `Orion: seam rejected — coverage ${(seam.agreementCoverage * 100).toFixed(0)}% below threshold ${(COVERAGE_THRESHOLD * 100).toFixed(0)}%`, { causedBy: seam.uuid });
}
```

### How — Intent-tagged Multi-Agent Flow

Orion-ext also reads `intent_nodes` for intents with `multiAgent = true`:

```javascript
const multiAgentIntents = jaaDB.query('intent_nodes', r => r.multiAgent === true && r.lastCalledAt > _lastIntentTs, 20);
```

For these intents, Orion-ext creates an ORION session **before** dispatch (sensor stage) to measure intent quality using SNR scores:

```javascript
const intentSNR = jaaDB.query('snr_records',
  r => r.sourceId === intentNode.uuid,
  10
);
const avgPosterior = intentSNR.reduce((a, r) => a + r.posterior, 0) / Math.max(1, intentSNR.length);

// High posterior (> 0.7) → high-quality intent → dispatch immediately
// Low posterior (< 0.3) → low-quality intent → flag for review, dispatch with warning
```

This pre-dispatch quality gate is lightweight — it does not block the call, it annotates the resulting ORION session with intent quality context.

### Failure Modes

| Failure | Behavior |
|---|---|
| `seam_records` unreadable | Insert `failures`. Hold watermark. Toast.error. |
| `orion_sessions` insert fails | Insert `failures`. Toast.error. Seam remains unverified. Next tick retries. |
| `seam_records` update (verified) fails | Insert `failures`. Toast.error. Gap severity=`medium` — Crystal feed blocked. |
| Trust score lookup fails (table empty) | Use default trust 0.5. Policy accepts. Log to `event_log`. |

---

## MODULE 11 (Cognition): BEP-ENGINE — `core/bep/index.js`

### What

Belief-Evidence-Pattern engine. Reads three tables — `crystals` (beliefs), `delta_records` (evidence), `lattice_edges` (patterns) — and builds BEP triples. Each triple answers: "this is what the system currently believes, here is the evidence trail, and here is the word-pattern cluster it belongs to." Writes to `bep_patterns` — the first writer to that table.

Also runs contradiction detection: when a new `delta_record` has low cosine similarity to a crystal's supporting terms, it emits `bep.contradiction.detected` to `event_log`, which Crystal picks up to increment `contradictionScore` and potentially decay the crystal.

### Why

The cockpit's memory inspector BEP tab has been empty since `bep_patterns` was declared. BEP-engine is the only writer. More importantly: BEP triples are how RAID reconstructs execution paths for familiar intents (§A1 behavioral gravity). Without BEP patterns, RAID has no prior execution geometry — every routing decision is ground-up. With BEP patterns, RAID can reconstruct: "this intent succeeded 23 times before with ollama in architect role."

### COBALT Declaration

```json
{
  "id": "core.bep",
  "file": "core/bep/index.js",
  "layer": "core",
  "title": "core.bep",
  "description": "Belief-Evidence-Pattern engine. Builds BEP triples from crystals + delta_records + lattice_edges. First writer to bep_patterns. Detects contradictions and emits bep.contradiction.detected.",
  "reads": ["crystals", "delta_records", "lattice_edges", "lattice_nodes"],
  "writes": ["bep_patterns", "event_log", "toasts", "failures"],
  "polls": true,
  "pollIntervalMs": 15000,
  "bootPhase": 14,
  "gapContract": {
    "maxLatencyMs": 60000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "bep list [--layer <layer>] [--n 20]",
      "args": [],
      "flags": ["--layer <l>", "--n <n>"],
      "emits": "cli.bep.list",
      "reads": ["bep_patterns"],
      "writes": [],
      "intent": "List BEP triples filtered by layer, sorted by metrics.useCount DESC",
      "example": "nexus bep list --layer gate",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "bep show <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.bep.show",
      "reads": ["bep_patterns"],
      "writes": [],
      "intent": "Full BEP triple: intent, behavior graph, supporting evidence UUIDs, pattern cluster terms",
      "example": "nexus bep show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "bep contradictions [--n 10]",
      "args": [],
      "flags": ["--n <n>"],
      "emits": "cli.bep.contradictions",
      "reads": ["event_log"],
      "writes": [],
      "intent": "List recent bep.contradiction.detected events with crystal UUID and delta that triggered it",
      "example": "nexus bep contradictions",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — BEP Triple Construction

BEP-engine runs on a 15-second tick. On each tick:

**1. Read stable crystals** (the belief layer):

```javascript
const crystals = jaaDB.query('crystals', r => r.state === 'stable', 100);
```

**2. For each crystal, find supporting delta_records** (the evidence layer):

```javascript
const crystalStems = _tokenize(crystal.statement);

// Find delta_records whose novelTerms overlap with crystal stems
const supporting = jaaDB.query('delta_records', r => {
  if (!r.novelTerms?.length) return false;
  const deltaStems = r.novelTerms.map(t => t.slice(0, 5));
  return crystalStems.some(s => deltaStems.includes(s));
}, 20);
```

These are the evidence records — moments when an agent said something novel that touched this crystal's terms.

**3. Find pattern cluster** (the pattern layer):

```javascript
// Find lattice_edges with both terms appearing in crystal statement stems
const patternCluster = jaaDB.query('lattice_edges', r =>
  crystalStems.includes(r.termA) || crystalStems.includes(r.termB),
  10
).sort((a, b) => b.weight - a.weight)  // sort by NPMI weight DESC
 .slice(0, 5);                          // top 5 edges = pattern cluster
```

**4. Check if BEP pattern already exists for this crystal:**

```javascript
const existing = jaaDB.query('bep_patterns', r => r.intentHash === crystal.uuid, 1)[0];
```

Using `crystal.uuid` as `intentHash` ties each BEP pattern to exactly one crystal.

**5a. If no existing pattern: INSERT**

```javascript
const bepRow = {
  uuid:        uid(),
  intent:      crystal.statement,
  intentHash:  crystal.uuid,
  layer:       _inferLayer(crystal),
  tags:        crystalStems.slice(0, 10),
  inputContract:  {},
  outputContract: {},
  behaviorGraph: {
    steps: supporting.slice(0, 5).map(d => ({
      action:  `agent ${d.agentUuid} response`,
      result:  `surprise_score: ${d.surpriseScore?.toFixed(2) ?? 'n/a'}`
    })),
    invariants: ['Evidence from verified seam']
  },
  constraints:   [],
  failureModes:  [],
  implementations: crystal.sourceUuids ?? [],
  metrics: {
    useCount:       0,
    successRate:    crystal.confidence,
    avgLatencyMs:   0,
    regressionCount: 0,
    lastUsed:       null
  },
  ts:     Date.now(),
  source: 'core.bep',
  causedBy: crystal.uuid
};
```

`_inferLayer(crystal)`: checks `crystal.statement` for keywords — "gap" → `'gate'`, "healer" → `'healer'`, "manifest" → `'manifest'`, "signal" → `'foundation'`, default → `'memory'`.

**5b. If existing: UPDATE metrics**

```javascript
await jaaDB.update('bep_patterns', existing.uuid, {
  metrics: {
    ...existing.metrics,
    useCount: existing.metrics.useCount + 1,
    lastUsed: Date.now()
  },
  ts: Date.now()
});
```

### How — Contradiction Detection

After building/updating BEP triples, BEP-engine scans new `delta_records` (watermark on `delta_records._rowId`) to check for contradictions:

```javascript
const newDeltas = jaaDB.query('delta_records', r => r._rowId > _lastDeltaRowId, 50);

for (const delta of newDeltas) {
  if ((delta.surpriseScore ?? 0) < 0.3) continue;  // low surprise = not novel = can't contradict

  const deltaStems = (delta.novelTerms ?? []).map(t => t.slice(0, 5));

  for (const crystal of stableCrystals) {
    const crystalStems = _tokenize(crystal.statement);
    const overlap = deltaStems.filter(t => crystalStems.includes(t));

    if (overlap.length === 0) continue;  // no term overlap = can't be about this crystal

    // Term overlap exists. Is the delta's response similar to the crystal's evidence?
    // Get the crystal's supporting evidence (their novelTerms)
    const supportingStems = supporting.flatMap(s => (s.novelTerms ?? []).map(t => t.slice(0, 5)));
    const noveltyVsSupport = _jaccardSimilarity(deltaStems, supportingStems);

    // Low Jaccard similarity + high surpriseScore + term overlap = contradiction
    if (noveltyVsSupport < 0.2 && delta.surpriseScore > 0.5) {
      await jaaDB.insert('event_log', {
        uuid: uid(), type: 'bep.contradiction.detected',
        source: 'core.bep',
        payload: { crystalUuid: crystal.uuid, deltaUuid: delta.uuid, overlap, noveltyVsSupport },
        causedBy: delta.uuid, ts: Date.now()
      });
      _toast('toast.error', `BEP: contradiction detected — crystal "${crystal.statement.slice(0, 60)}..." challenged by new evidence`, { causedBy: delta.uuid, actions: [{ label: 'Show crystal', command: `nexus crystal show ${crystal.uuid}` }] });
    }
  }
}
```

`_jaccardSimilarity(setA, setB)`: `|A ∩ B| / |A ∪ B|`. Pure set math, no dependencies.

Crystal's event_log polling picks up `bep.contradiction.detected` and increments `contradictionScore`. This is the closed loop: evidence → BEP → contradiction → crystal decay → self-repair.

### Failure Modes

| Failure | Behavior |
|---|---|
| `crystals` unreadable | Insert `failures`. Skip this tick. Toast.error. |
| `bep_patterns` insert fails | Insert `failures`. Toast.error. Gap severity=`low`. Retry next tick. |
| Contradiction detection loop throws | Insert `failures`. Toast.error. Continue to next delta. |

---

## MODULE 12 (Cognition): INTENT-MAP — `core/intent/index.js`

### What

Semantic intent graph. On every new `agent_calls` row insert, Intent-map extracts the intent text, fuzzy-matches it against existing `intent_nodes` via term overlap against `lattice_nodes`, and either links to an existing node or creates a new one. Each intent node accumulates `callCount`, `successRate`, `avgSurpriseScore`, `preferredAgent`, and `associatedCrystals[]`.

Over time: a semantic map of everything the system has ever been asked to do. High-`callCount` + high-`successRate` nodes are reliable workflows. High-`avgSurpriseScore` nodes are where novel thinking happens. Nodes with no `associatedCrystals` are unresolved questions.

### Why

Currently, intent is a free-text string on each `agent_calls` row. There is no way to ask "how often has the system been asked to do X?" or "which agent handles X best?" Intent-map creates the answer. It also provides the vocabulary for RAID's BEG reconstruction — `intent_nodes` with deep BEP associations tell RAID which execution geometry to reconstruct.

### COBALT Declaration

```json
{
  "id": "core.intent",
  "file": "core/intent/index.js",
  "layer": "core",
  "title": "core.intent",
  "description": "Semantic intent graph. Reads agent_calls, extracts and clusters intents into intent_nodes and intent_edges. Accumulates call history, success rates, surprise scores per intent cluster.",
  "reads": ["agent_calls", "lattice_nodes", "delta_records", "crystals"],
  "writes": ["intent_nodes", "intent_edges", "event_log", "toasts", "failures"],
  "polls": true,
  "pollIntervalMs": 5000,
  "bootPhase": 14,
  "gapContract": {
    "maxLatencyMs": 20000,
    "onMiss": "gap.found type=stale_module severity=low"
  },
  "cli": [
    {
      "command": "intent list [--n 20] [--sort callCount|successRate|surpriseScore]",
      "args": [],
      "flags": ["--n <n>", "--sort <field>"],
      "emits": "cli.intent.list",
      "reads": ["intent_nodes"],
      "writes": [],
      "intent": "List intent nodes sorted by specified field. Default sort: callCount DESC.",
      "example": "nexus intent list --sort successRate",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "intent show <uuid>",
      "args": ["<uuid>"],
      "flags": [],
      "emits": "cli.intent.show",
      "reads": ["intent_nodes"],
      "writes": [],
      "intent": "Full intent node detail: text, callCount, successRate, preferredAgent, associatedCrystals",
      "example": "nexus intent show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "intent search <term>",
      "args": ["<term>"],
      "flags": [],
      "emits": "cli.intent.search",
      "reads": ["intent_nodes"],
      "writes": [],
      "intent": "Find intent nodes by text search (term overlap matching)",
      "example": "nexus intent search bayesian",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "intent graph",
      "args": [],
      "flags": [],
      "emits": "cli.intent.graph",
      "reads": ["intent_nodes", "intent_edges"],
      "writes": [],
      "intent": "Render intent graph as ASCII force-directed layout (top N nodes by callCount, edges by weight)",
      "example": "nexus intent graph",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "intent unresolved",
      "args": [],
      "flags": [],
      "emits": "cli.intent.unresolved",
      "reads": ["intent_nodes"],
      "writes": [],
      "intent": "List intent nodes where associatedCrystals is empty — things asked but never crystallized",
      "example": "nexus intent unresolved",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Intent Extraction

```javascript
function _extractIntent(call) {
  // intent field preferred; fall back to first 100 chars of prompt
  return (call.intent ?? call.prompt ?? '').slice(0, 200).trim();
}

function _intentHash(intentText) {
  // Normalize: lowercase, collapse whitespace, sort words, hash
  const normalized = intentText.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .sort()
    .join(' ');
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
}
```

### How — Fuzzy Matching Against Existing Nodes

Exact hash match → use existing node directly.

No exact match → fuzzy match via term overlap:

```javascript
function _findMatchingNode(intentStems, existingNodes) {
  let bestNode = null, bestScore = 0;

  for (const node of existingNodes) {
    const nodeStems = _tokenize(node.text);
    const intersection = intentStems.filter(s => nodeStems.includes(s)).length;
    const union = new Set([...intentStems, ...nodeStems]).size;
    const jaccard = intersection / union;
    if (jaccard > 0.6 && jaccard > bestScore) {
      bestScore = jaccard;
      bestNode = node;
    }
  }
  return bestNode;  // null if no match above 0.6 threshold
}
```

Jaccard threshold 0.6: two intents need to share 60% of their term vocabulary to be considered the same intent cluster.

`existingNodes` is loaded from the `_nodeCache` (Map of all `intent_nodes` by UUID, built at `init()`).

### How — node creation and update

**New node (no match):**

```javascript
const node = {
  uuid:             uid(),
  text:             intentText,
  intentHash:       hash,
  callCount:        1,
  successRate:      call.status === 'complete' ? 1 : 0,
  avgSurpriseScore: null,
  preferredAgent:   call.routedTo ?? null,
  associatedCrystals: [],
  tags:             call.tags ?? [],
  multiAgent:       (call.tags ?? []).includes('multi-agent'),
  retryCount:       0,
  lastCalledAt:     call.ts,
  ts:               Date.now(),
  source:           'core.intent',
  causedBy:         call.uuid
};
await jaaDB.insert('intent_nodes', node);
_nodeCache.set(node.uuid, node);
```

**Existing node (match found):**

```javascript
const updated = {
  callCount:     existing.callCount + 1,
  successRate:   _updateSuccessRate(existing, call),
  preferredAgent: _updatePreferredAgent(existing, call),
  lastCalledAt:  call.ts,
  retryCount:    existing.retryCount + (call.retryCount ?? 0),
  ts:            Date.now()
};
await jaaDB.update('intent_nodes', existing.uuid, updated);
_nodeCache.set(existing.uuid, { ...existing, ...updated });
```

`_updateSuccessRate`: exponential moving average with `alpha = 0.1`: `(1-0.1) * existing.successRate + 0.1 * (call.status === 'complete' ? 1 : 0)`.

`_updatePreferredAgent`: runs a frequency count of `routedTo` across all calls for this node (stored in a side table `_agentPreferences` in memory, keyed by `nodeUuid`). Preferred agent = most frequent successful agent.

### How — Crystal Association

On every Crystal tick, Intent-map's crystal association is updated reactively:

Intent-map polls `crystals` for new `stable` crystals (watermark `_lastCrystalRowId`). For each new crystal, it finds matching intent nodes via term overlap:

```javascript
const crystalStems = _tokenize(crystal.statement);
const matchingNodes = [..._nodeCache.values()].filter(node => {
  const nodeStems = _tokenize(node.text);
  return crystalStems.some(s => nodeStems.includes(s));
});

for (const node of matchingNodes) {
  const alreadyLinked = node.associatedCrystals.includes(crystal.uuid);
  if (!alreadyLinked) {
    const updatedCrystals = [...node.associatedCrystals, crystal.uuid];
    await jaaDB.update('intent_nodes', node.uuid, { associatedCrystals: updatedCrystals, ts: Date.now() });
    _nodeCache.set(node.uuid, { ...node, associatedCrystals: updatedCrystals });
  }
}
```

### How — Intent Edges

When two intents are called in sequence within the same session (same `sessionId`), Intent-map creates or updates an `intent_edges` row:

```javascript
// Track: { sessionId → last intent node UUID }
const prevNodeUuid = _sessionLastIntent.get(call.sessionId);
if (prevNodeUuid && currentNodeUuid !== prevNodeUuid) {
  const edgeKey = `${prevNodeUuid}:${currentNodeUuid}`;
  const existing = _edgeCache.get(edgeKey);
  if (!existing) {
    await jaaDB.insert('intent_edges', { uuid: uid(), from_uuid: prevNodeUuid, to_uuid: currentNodeUuid, weight: 1, ts: Date.now(), source: 'core.intent' });
  } else {
    await jaaDB.update('intent_edges', existing.uuid, { weight: existing.weight + 1, ts: Date.now() });
  }
}
_sessionLastIntent.set(call.sessionId, currentNodeUuid);
```

Intent edges are the semantic workflow graph. High-weight edges are frequent sequences — your habitual workflows. The cockpit can render this as a force-directed graph (per CLI `nexus intent graph`).

### Failure Modes

| Failure | Behavior |
|---|---|
| `agent_calls` unreadable | Insert `failures`. Hold watermark. Toast.error. |
| `intent_nodes` insert/update fails | Insert `failures`. Toast.error. In-memory cache not updated — next tick re-checks JAA. |
| `intent_edges` insert/update fails | Insert `failures`. Toast.warn. Edge data degraded. |
| `crystals` unreadable (association update) | Insert `failures`. Toast.warn. Association update skipped this tick. |

---

## JAA TABLE SUMMARY

| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `orion_sessions` | orion/* | calltoId, status, regime, features{}, verified | — (existing) |
| `bep_patterns` | core/bep | intent, intentHash, layer, behaviorGraph{}, metrics{} | bep-pattern.schema.json (✅ BUILT) |
| `intent_nodes` | core/intent | text, intentHash, callCount, successRate, avgSurpriseScore, preferredAgent, associatedCrystals[] | intent-node.schema.json (🔴 BUILD) |
| `intent_edges` | core/intent | from_uuid, to_uuid, weight | — (inline) |

Callto-executor writes to `agent_calls` and `cortex_memory` — both existing tables, no new tables required.

---

## BOOT SEQUENCE INTEGRATION

**Callto-executor** — PHASE 8 (SOFT, with agent layer). Must start before Guardian-routed calls can be processed. If Guardian is unavailable at boot, Callto-executor starts normally and falls back to LAW I alternatives for every guardian-* call until Guardian connects.

**Orion-ext, BEP-engine, Intent-map** — PHASE 14 (SOFT, cognition layer). These read tables populated by PHASE 9 (memory) and PHASE 10 (signal). Cold-start acceptable. Empty tables at first boot, data accumulates as upstream layers run.

Boot order within PHASE 14:
1. Intent-map — starts indexing agent_calls immediately
2. BEP-engine — reads crystals (may be empty initially)
3. Orion-ext — reads seam_records (may be empty initially)

---

## CROSS-LAYER DATA FLOW

```
Human or Automation Engine writes agent_calls
  │
  ├── RAID routes to guardian-claude (LAW I step 2)
  │     │
  │     ▼
  │   Callto-executor (PHASE 8)
  │     Checks guardian_health → dispatches GUARDIAN_EXECUTE_INTENT
  │     Polls chat_completions for causedByCallto completion
  │     Writes cortex_memory + emits agent.response.received
  │     │
  │     ├── Delta-engine: computes surpriseScore → delta_records
  │     ├── Siphon: writes chat_messages + chat_completions
  │     └── Intent-map: indexes this call's intent → intent_nodes
  │
  └── For --parallel: TWO dispatches (guardian-claude + guardian-chatgpt)
        Both completions share causedByCallto UUID
        │
        ▼
      Seam: detects siblings → structural diff → seam_records
        │
        ▼
      Orion-ext: quality gate → seam_records.verified = true (if coverage ≥ 0.60)
        │
        ▼
      Crystal: extracts verified agreement zones → crystals (state: stable)
        │
        ├── BEP-engine: builds BEP triple → bep_patterns
        ├── Intent-map: associates crystal → intent_nodes.associatedCrystals[]
        └── Self-model: reads crystalCount, creativity metrics → self_model
```
