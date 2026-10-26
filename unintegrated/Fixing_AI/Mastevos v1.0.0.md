# NEXUS — Unified Specification v8.0
**Date:** 2026-05-23  
**Supersedes:** All prior specs v1.0–v7.0  
**Classification:** Living document — editable, versioned, schema-enforced  
**Source truth:** v7.0 (full JAA/CLI/Idearium model) + Infrastructure code + ALK v2.0.0 signal primitives + NSSM service layer + SELFFORM concepts  
**Architecture:** CLI-first · Memory-first (JAA) · Poll-based · SISO event fabric · Causal Nexus · ALK signal topology · NSSM service management · BEG behavioral gravity

---

## READING THIS DOCUMENT

This is not a description of a system. This is the system, encoded as knowledge. Every section answers a question a builder should never have to ask:

- **What** — exact behavior, not approximation
- **Why** — the intent behind every decision
- **How** — the mechanism, not the idea
- **When** — the trigger, the timing, the condition
- **Where** — the file, the table, the event channel
- **Who** — the module, the agent, the layer
- **What connects to what** — the causal map, the hook map, the friction map

Nothing is left abstract. If a word could mean two things, it is defined. If a module could behave two ways, the correct way is specified. If a failure is possible, its failure mode is documented.

---

## 0. CONSTITUTIONAL LAWS

These are not guidelines. They are enforced at runtime by the kernel, the schema validator, and the law-watcher module. Violation = `law_violations` JAA insert + `toast.error` + `gap.found`.

```
LAW I    LOCAL FIRST
         Evaluation order for agent dispatch:
           1. Ollama (local, no token cost, always first evaluated)
           2. Guardian-Claude (browser tab, no API key, free when Guardian connected)
           3. Guardian-ChatGPT (browser tab, no API key, free when Guardian connected)
           4. API Claude (costs tokens — only when LAW I alternatives are exhausted or failed)
           5. API ChatGPT (costs tokens — only when above are exhausted or failed)
         RAID routes away from local ONLY when:
           - Ollama usage > 90% for last 60s, OR
           - Ollama returned error 3 consecutive times, OR
           - Task explicitly requires a capability Ollama cannot provide (declared in intent)
         Guardian-Claude before API-Claude at all times when Guardian is connected.

LAW II   MEMORY AUTHORITY
         No state changes without a JAA row. PERIOD.
         No kernel.emit() for coordination between modules.
         No module holds truth in-memory without a JAA backing row.
         Every module transition: jaaDB.update() or jaaDB.insert() first, then behavior.
         History is replayable from first row in event_log to present. Always.
         If JAA is unavailable, the module writes to a local queue and replays on reconnect.

LAW III  LAYER SOVEREIGNTY  
         Each layer has exactly one job (declared in COBALT record).
         No module imports another module. Ever.
         All cross-module communication: write to JAA table → other module polls that table.
         Layer identity declared in cobalt record. Runtime enforces load order.
         foundation → core → gate/healer → memory → agents → guardian → automation → canvas → ui
         Lower layers do not import from higher layers. Upper layers do not reach down.

LAW IV   SCHEMA OVER CODE
         Every module declares its behavior in a module.schema.json instance.
         Manifests always temp:0, schema-validated by AJV before execution.
         Every gap, crystal, event, intent, callto, artifact: validated against its schema.
         A module that writes a row not matching its schema has violated LAW IV.
         Schema is the source of truth. Code implements the schema. Not the reverse.

LAW V    CLI FIRST
         Every feature exists as a CLI command before it exists as UI.
         The UI renders the output of CLI commands. Nothing more.
         No UI action that has no CLI equivalent.
         Every CLI command: emits JAA event_log row → prints structured stdout → 
           on failure: stderr + failures table insert + toast.error + exit 1.
         No silent success (must print confirmation). No silent failure (must print why).
         The orchestrator (RAID) is driven by CLI. The cockpit is a skin.

LAW VI   TOAST AUTHORITY  (NEW in v8.0)
         Every failure to execute, run, or do anything beyond expected runtime behavior
         MUST emit a toast. Toast color: RED (error), GREEN (success), AMBER (warning), 
         BLUE (info), TEAL (crystal formed), GREY (snapshot written).
         Toasts are not optional. They are the user's runtime nervous system.
         Every toast: uuid, causedBy, module, message, actions[], ts.
         A module that fails silently has violated LAW VI.
```

---

## 0.1 AXIOMS (Inherited by all modules)

```
§1.1   Nothing pretends to work. If it doesn't work, it says so.
§1.2   Nothing silently fails. Every error: loud, specific, logged, toasted.
§1.3   No stubs in production. If it's not built, it says BUILD REQUIRED.
§2.1   Persistence is the golden rule. JAA on everything.
§3.1   Bottom-up build order. Foundation before modules. Architecture before code.
§3.2   Logical time (tick) is the ordering axis. Wall time is advisory only.
§4.1   A system that cannot be tested cannot be trusted.
§4.3   Enterprise and military grade from line one.
§5.1   UUID on everything that does anything.
§5.5   What does not exist must be built. No external runtime dependencies in core.
§5.7   Zero direct module calls. All I/O via JAA tables only.
§6.1   Documentation generated from proof, not written as aspiration.
§M1    Everything that happens gets stored. No exceptions.
§M2    Failures are first-class data. Always structured, tagged, stored.
§M3    The system improves by accumulation, not retraining.
§M4    Agents know themselves. Every agent carries a live self-model.
§K1    Events are immutable after construction. Object.freeze() enforced.
§K2    Gate output collected atomically. Gates never call emit() directly.
§K3    Channel strings dot-namespaced. Wildcards: * (one segment), ** (any depth).
§K4    Logical clock strictly monotone. Wall clock advisory only.
§K5    Ring buffer bounded. Old events evicted (not deleted). Eviction pruned from lattice.
§K6    No module calls another module directly. All communication via JAA / event bus.
§K7    All errors surface as events, never uncaught throws.
§K8    Module UUIDs opaque strings. No module introspects another module's internals.
§A1    Behavioral Execution Geometry: successful executions create gravitational attractors.
§A2    Failure = field distortion, not moral failure. Recompute geometry, don't just patch.
§A3    Every JAA insert carries causedBy or source. No orphan rows.
```

---

## 0.2 PORT MAP

```
§P1    3748  — NEXUS unified port. CLI admin server, Guardian handshake, SSE stream, API.
§P2    3747  — RESERVED for Bridge OS only. NEXUS never binds 3747.
§P3    No two NEXUS services share a port. Enforced in saveSettings().
§P4    4242  — Forge server (filesystem, compiler, revisions, agent dispatch).
§P5    11434 — Ollama (local LLM). Default, configurable.
§P6    8081  — Causal Playground PHP sandbox.
§P7    8082  — Causal Playground Node sandbox.
§P8    8083  — Causal Playground Python/Flask sandbox.
§P9    3306  — MySQL (test env).
§P10   6379  — Redis (test env, caching).
§P11   5432  — PostgreSQL (test env).
§P12   1025  — Mailhog SMTP (test env).
§P13   8025  — Mailhog UI (test env).
```

---

## 0.3 TOAST SYSTEM (Complete Specification)

Every module that does anything emits toasts. This is not optional.

**Toast event shape:**
```json
{
  "uuid":      "toast-uuid",
  "type":      "toast.error",
  "module":    "healer",
  "message":   "MAX_DEPTH:5 reached — escalating to human",
  "causedBy":  "gap-uuid",
  "ts":        1716123456789,
  "actions":   [{ "label": "View gap", "command": "nexus gap show <uuid>" }],
  "autoClose": 5000
}
```

**Toast types:**
```
toast.error    RED    — unrecoverable failure, action required immediately
toast.warn     AMBER  — recoverable, logged, watch this
toast.info     BLUE   — status update, no action needed
toast.success  GREEN  — operation complete successfully
toast.gap      RED    — gap detected, healer engaged (always has CLI action)
toast.crystal  TEAL   — new crystal formed (memory stabilized)
toast.snapshot GREY   — .nex snapshot written
toast.agent    PURPLE — agent call dispatched / received
toast.boot     CYAN   — service started / stopped (NSSM events)
```

**Mandatory toast triggers (every module must fire these):**
| Event | Toast type | Trigger |
|---|---|---|
| Any `init()` failure | toast.error | RED — module name + error message |
| Any `_tick()` uncaught error | toast.error | RED — module + operation + stack |
| Any JAA insert failure | toast.error | RED |
| Any agent call timeout | toast.warn | AMBER |
| Any gap found | toast.gap | RED with "nexus gap show" action |
| Any gap healed | toast.success | GREEN |
| Any crystal formed | toast.crystal | TEAL |
| Any .nex snapshot | toast.snapshot | GREY |
| Healer exhausted | toast.error | RED with escalation action |
| Service crash (NSSM) | toast.error | RED with restart action |
| Service started (NSSM) | toast.boot | CYAN |
| Law violation detected | toast.error | RED with law ID |


---

## 1. THE CLI-FIRST CONTRACT

### 1.1 The Rule
Every feature in NEXUS exists as a CLI command first. The UI renders the output of CLI commands. Nothing in the UI does something the CLI cannot do. If it exists in the UI and not in the CLI, it is a gap.

### 1.2 What Every CLI Command Must Do
```
1. Emit a JAA event_log row BEFORE anything else:
   { uuid, type: 'cli.command', command, args, flags, ts, source: 'cli', session: <terminal-session-id> }

2. Print structured stdout:
   Format: [HH:MM:SS] [MODULE] STATUS  message
   e.g.:   [09:54:12] [HEALER] OK      gap healed: gate/gap-finder.js §MISSING
           [09:54:13] [GAP]    FOUND   agent_calls/uuid stuck — 47s, agent: ollama

3. On any failure:
   - Print full error to stderr with stack
   - Insert into JAA failures table
   - Emit toast.error (UI picks up via SSE)
   - Log to JAA event_log: { type: 'cli.result', status: 'failed', causedBy: <command-uuid> }
   - Return exit code 1

4. On success:
   - Print success line to stdout
   - Emit toast.success
   - Log to JAA event_log: { type: 'cli.result', status: 'complete', durationMs, output }
   - Return exit code 0

5. Never exit silently. Every command either:
   - Succeeds with output
   - Fails with a reason
   - Asks for clarification (logged)
```

### 1.3 CLI Grammar
```
nexus <module> <command> [args...] [--flags]
```

Every module registers commands at init via COBALT.cli[]. Runtime builds the full command map from registered cobalt records. This means the CLI is dynamic — new modules add commands automatically.

### 1.4 CLI Command Registration Format
```json
{
  "command": "healer retry",
  "args": ["<gap-uuid>"],
  "flags": ["--depth <n>", "--agent <id>", "--dry-run"],
  "emits": "healer.retry.request",
  "reads": ["gaps", "fix_map"],
  "writes": ["healer_log", "gaps"],
  "intent": "Retry a gap fix from scratch, injecting prior failure context",
  "example": "nexus healer retry abc-123 --depth 3 --agent ollama",
  "toastOnSuccess": "toast.success",
  "toastOnFail": "toast.error"
}
```

### 1.5 Dynamic CLI — The Orchestrator Shell
The RAID orchestrator exposes a full REPL. When you type `nexus shell` or launch via `--cli` flag, you get a live terminal that:
- Shows real-time toast stream in the right panel
- Auto-completes from registered COBALT commands
- Shows JAA table writes as they happen
- Has full history (stored in JAA `cli_history` table)
- Supports piping: `nexus gap list | nexus healer retry --all`
- Supports `nexus watch <table>` — live tail of any JAA table

**Orchestrator shell schema (cli_history table):**
```json
{
  "uuid": "uuid",
  "command": "nexus gap list",
  "args": [],
  "flags": {},
  "output": "...",
  "exitCode": 0,
  "durationMs": 45,
  "session": "terminal-session-uuid",
  "ts": 1716123456789
}
```

---

## 2. FOUNDATION LAYER

### 2.1 SISO Core — `foundation/siso.js`

**What it is:** The event fabric. Every event that flows through NEXUS is a SISOEvent. The SISO Bus provides pattern-matched pub/sub. StreamLog records everything.

**From ALK:** The kernel, pattern compiler, ring buffer, and lattice graph are all directly portable. ALK's `compilePattern()` (dot-namespace wildcards `*` and `**`) is the canonical channel matcher. ALK's `createLattice()` (parent/child/semantic edge graph) provides causal chain walking.

**Components:**
```
SISOEvent    — immutable event atom
               { id, type, tick, wall, causedBy, relatedTo[], payload, meta.sourceUUID, meta.sessionId }
               Object.freeze() enforced on construction (§K1)
               hash: FNV-1a(type + JSON.stringify(payload)) for dedup

StreamLog    — bounded ring buffer, configurable capacity (default 10,000)
               Levels: OFF, EVENTS, DEEP, DATA
               .tail(n) for debug panel
               .sample() for snapshot

SISOBus      — ALK-compatible event bus
               .on(pattern, cb) — wildcard subscribe
               .emit(type, data) — route through all matching subscribers
               Errors in subscribers caught and re-emitted as alk.kernel.sub.error (§K7)

ALKKernel    — full ALK kernel (from ALK v2.0.0)
               .emit(), .subscribe(), .registerGate(), .removeGate()
               .traceToRoot(), .descendants(), .parent(), .children(), .related()
               .stats() for observability
               .startPulse(5000) — proof-of-life heartbeat (§1.8)
```

**Causal graph from ALK:**
The lattice is the causal graph. Every event can link to a parent (causedBy) and semantic associations (relatedTo[]). Queries traverse the lattice:
- `traceToRoot(id)` → causal chain to origin (debug any event's ancestry)
- `descendants(id)` → all events caused transitively by this event
- `edgeMeta(a, b)` → edge type: causal | semantic | temporal | rule

**SISO exports for modules:**
```js
const { SISOEvent, StreamLog, SISOBus, ALKKernel, ALKModule, compilePattern } = require('./siso');
```

**Intent:** Provide the event backbone. Everything that happens is an event. Nothing is state that isn't a JAA row backed by an event.

**Expected runtime behavior:** Zero events lost. Every emit returns the event object. Gate depth max 20 (prevents infinite recursion). Subscriber errors never kill the bus.

**Failure mode:** If SISOBus crashes, emit `alk.kernel.error` — never throw. If gate chain exceeds depth, emit error and abort that event.

---

### 2.2 JAA Database — `memory/jaa-db.js`

**What it is:** The only shared data surface in NEXUS. Every module reads and writes through this interface. No module imports another module. No module holds authoritative state in memory.

**Architecture:** In-memory arrays as hot path. Append-only JSONL files per table as truth layer. On `open()`, JSONL files are replayed into memory. Writes go to both memory and append stream simultaneously.

**API:**
```js
await jaaDB.open()                        // replay persisted data, open append streams
await jaaDB.insert(table, record)         // append row, assign _rowId
       jaaDB.query(table, predFn, limit)  // filtered scan (synchronous, newest first)
await jaaDB.get(table, uuid)              // single row by uuid
await jaaDB.update(table, uuid, patch)    // shallow merge (writes new row for JSONL append)
       jaaDB.count(table)                 // row count
await jaaDB.compact(table)                // deduplicate, rewrite JSONL
       jaaDB.tail(table, n)              // last N rows (most recent)
       jaaDB.scan(table)                  // full table as array
await jaaDB.close()                       // flush and close all streams
```

**Claim pattern (prevents double-processing across poll cycles):**
```js
await jaaDB.update(TABLE, item.uuid, { status: 'processing', claimedAt: Date.now() });
const confirmed = await jaaDB.get(TABLE, item.uuid);
if (confirmed.status !== 'processing') continue; // race lost — skip
```

**Status convention on every work table:** `pending → processing → complete | failed`

**Every record carries (§A3):**
- `uuid` — always present (§5.1)
- `causedBy` or `source` — always present (§A3)
- `ts` — wall timestamp (Date.now())
- `_rowId` — assigned by JAA on insert (not user-settable)

**Browser adapter:** IndexedDB-backed, same API. Used by admin panel and canvas.

---

### 2.3 Causal Nexus — `causal-nexus/`

**What it is:** Sigma/delta/causality computation on top of JAA. Tracks divergence, computes stability scores, triggers snapshots.

```
sigma/index.js      — regime classifier
                      Regimes: stable | degrading | anomaly | diverging | recovering
                      Input: shape_samples rows (sigma, delta, slope, snr)
                      Output: regime string + confidence + changeReason

delta/index.js      — divergence engine  
                      Input: two JAA rows or two file versions
                      Output: { similarity, surpriseScore, novelTerms[], changedFields[] }
                      surpriseScore = 1 - max(similarity_to_prev). 0 = identical, 1 = completely new.

causality/index.js  — causedBy chain walker
                      Input: uuid + jaaDB reference
                      Output: causal chain (array of JAA rows, tracing causedBy links)
                      Depth limited (default 100 hops)
                      Used by: Versionium, Debugger, gap-finder, self-model
```

**Every module that writes to JAA includes sigma context:**
```json
{
  "uuid": "...",
  "causedBy": "...",
  "source": "module-id",
  "cobaltId": "cobalt-module-id",
  "ts": 1716123456789
}
```

---

### 2.4 Poll Registry — `foundation/poll-registry.js`

**What it is:** The single point where all module poll intervals are declared. The only place you look to understand module lifecycle. boot.js calls `pollRegistry.start()` after `jaaDB.open()`.

**Load order (bottom-up, §3.1):**
```
Layer 1: foundation
  bus-log           1000ms  — JAA event_log writer (replaces *.* subscription)
  cobalt-registry   5000ms  — auto-registers modules from COBALT records
  shape-sampler     2000ms  — sigma/delta/slope/snr computation

Layer 2: core
  raid              3000ms  — agent routing and decision engine
  manifest          5000ms  — manifest builder and schema validator
  translation       3000ms  — intent translation layer
  usage             5000ms  — token/usage tracking

Layer 3: gate / healer
  gap-finder        2000ms  — gap detection across all tables
  healer            5000ms  — gap resolution and self-healing

Layer 4: agents
  agents            2000ms  — dispatcher
  ollama            2000ms  — local LLM agent
  claude            3000ms  — cloud Claude agent (LAW I: last resort)
  callto            2000ms  — Guardian tab dispatch

Layer 5: memory
  agent-memory      4000ms  — memory index writer
  lattice-index     10000ms — associative word lattice
  crystal           15000ms — belief crystallizer
  seam              5000ms  — multi-AI response merger
  delta-engine      3000ms  — surprise scoring + versionium triggers
  fix-map           5000ms  — gap→fix knowledge base

Layer 6: signal
  topo-wire         2000ms  — SNR pipeline bridge
  ime-wire          3000ms  — behavioral profile builder
  orion-sensor      1000ms  — ORION measure stage
  orion-record      1000ms  — ORION record stage
  orion-policy      2000ms  — ORION policy stage
  orion-verify      3000ms  — ORION verify stage

Layer 7: versioning
  versionium        3000ms  — auto-commit on sigma spike

Layer 8: guardian
  siphon            2000ms  — chat ingestion normalizer
  pulse             5000ms  — mesh topology from heartbeats
  watchman          5000ms  — Guardian health monitor

Layer 9: idearium
  idearium          5000ms  — idea OS core
  spec-builder      5000ms  — guided spec creation
  tension           10000ms — tension scoring
  divergence        10000ms — snapshot diffing

Layer 10: cognition
  intent-map        5000ms  — intent graph
  bep-engine        10000ms — BEP triple engine
  self-model        3600000ms — hourly self-portrait

Layer 11: automation
  automation-engine 2000ms  — schedule/workflow runner
  queue-manager     1000ms  — priority queue with dependency gating

Layer 12: playground / service
  causal-playground 5000ms  — sandbox lifecycle
  nsm-watchdog      3000ms  — service health (NSSM bridge)
```

**start(overrides = {}):** Starts all modules in declaration order. overrides map module id → custom pollMs.  
**stop():** Stops all modules in reverse declaration order (graceful drain).

---

### 2.5 Cobalt Registry — `foundation/cobalt-registry.js`

**What it is:** Auto-registration. Every module declares a COBALT object. On `init()`, the module inserts its COBALT record into `agent_signatures`. The registry polls `agent_signatures` and maintains a live map of all registered modules.

**Cobalt record (required on every module):**
```js
const COBALT = {
  id:      'module-id',           // dot-namespaced: 'gate.gap-finder'
  uuid:    'uuid-here',           // permanent, never reuse (format: nexus-mod-<name>-timestamp)
  file:    __filename,            // absolute path
  layer:   'gate',                // foundation|core|gate|healer|memory|agent|guardian|automation|canvas|ui
  version: '1.0.0',
  intent:  'what this module does in one sentence',
  reads:   ['table_a', 'table_b'],   // §M2 enforced — only read declared tables
  writes:  ['own_table'],            // §M2 enforced — only write declared tables
  pollMs:  3000,                     // default, overridden by poll-registry
  cli: [                             // commands this module contributes
    {
      command: 'module action',
      args: ['<required>', '[optional]'],
      flags: ['--dry-run', '--depth <n>'],
      intent: 'what it does',
      emits: 'event.type',
      example: 'nexus module action abc --flag',
      toastOnSuccess: 'toast.success',
      toastOnFail: 'toast.error'
    }
  ],
  hooks: {                           // event channels this module responds to
    'event.type': 'handlerMethod'
  },
  expectation: {
    summary: 'one sentence',
    successCondition: 'observable outcome = working',
    failureCondition: 'observable outcome = broken',
    slaMs: 5000
  },
  gapContract: {
    bridges: 'what gap between components this spans',
    fills: 'what missing capability this closes',
    creates: 'what new gap this introduces by existing'
  }
};
```

---

### 2.6 Shape Sampler — `foundation/shape-sampler.js`

**What it is:** Computes sigma/delta/slope/snr/oscillation from the event stream and writes `shape_samples` rows. Used by versionium (sigma spike → auto-commit), healer (priority), idearium (tension score).

**Metrics:**
```
sigma        0.0–1.0   Friction coefficient. 0 = no friction, 1 = total friction.
                       Computed from: event latency variance + retry count + gap density.
             
delta        0.0–1.0   Contrast score. 0 = perfect alignment, 1 = complete divergence.
                       Computed from: expected behavior vs observed behavior (intent maps).

slope        -1.0–1.0  Drift direction. Positive = improving, negative = degrading.
                       Magnitude = rate per 100 ticks.

oscillation  object    { frequency, amplitude, stable }
                       stable=false means system is thrashing (rapid mode switching).

snr          0.0–1.0   Signal-to-noise ratio. Signal = meaningful state-change events.
                       Below 0.3 = noise-dominated.

compatibility object   { fingerprint[], minCompatScore, incompatibleWith[] }
                       fingerprint = sorted list of event channels produced/consumed.
                       Used for module compatibility Jaccard score.
```

**Writes `shape_samples` row every pollMs. Versionium watches `shape_samples` for sigma > 0.7.**

---

### 2.7 Bus Log — `foundation/bus-log.js`

**What it is:** Replaces the old `*.* subscription` pattern. Polls `event_log` for new rows and writes them to the StreamLog ring buffer. Provides the `nexus watch event_log` command with live tail.

**This module must start first (load order 1) because it provides the event_log → StreamLog bridge that all other modules depend on for observability.**

---

## 3. MODULE CONTRACT

Every module without exception follows this pattern:

```js
'use strict';

const COBALT = { /* see §2.5 */ };
const { jaaDB, uid } = require('../memory/jaa-db');

const TABLE    = 'own_table_name';
const MODULE_ID = 'module/name';

let _interval = null;
let _cfg = {};

async function init(cfg = {}) {
  _cfg = cfg;
  // 1. Insert COBALT record
  await jaaDB.insert('agent_signatures', { ...COBALT, registeredAt: Date.now() });
  // 2. Start poll loop
  _interval = setInterval(_tick, _cfg.pollMs ?? COBALT.pollMs);
  _interval.unref(); // don't prevent process exit
  // 3. Emit toast.boot
  await _toast('toast.boot', `${MODULE_ID} initialized`);
}

function stop() {
  clearInterval(_interval);
  _interval = null;
}

async function _tick() {
  try {
    const work = jaaDB.query(TABLE, r => r.status === 'pending', 50);
    for (const item of work) {
      // Claim (prevent double-processing)
      await jaaDB.update(TABLE, item.uuid, { status: 'processing', claimedAt: Date.now() });
      const claimed = await jaaDB.get(TABLE, item.uuid);
      if (claimed?.status !== 'processing') continue;

      const result = await _process(item);

      await jaaDB.update(TABLE, item.uuid, {
        status:      result.ok ? 'complete' : 'failed',
        result:      result.data ?? null,
        error:       result.error ?? null,
        completedAt: Date.now(),
      });

      // Emit toast on failure (§LAW VI)
      if (!result.ok) {
        await _toast('toast.error', result.error, { causedBy: item.uuid });
      }
    }
  } catch (err) {
    // §1.2 — NEVER throw, ALWAYS log AND toast
    await jaaDB.insert('failures', {
      uuid: uid(), source: MODULE_ID,
      error: err.message, stack: err.stack, ts: Date.now(),
    }).catch(() => {});
    await _toast('toast.error', `${MODULE_ID}: ${err.message}`, { stack: err.stack });
  }
}

async function _toast(type, message, extra = {}) {
  const toastRow = {
    uuid: uid(), type, module: MODULE_ID,
    message, ts: Date.now(), ...extra,
    actions: extra.actions ?? [],
    autoClose: type === 'toast.error' ? 0 : 5000, // errors stay until dismissed
  };
  await jaaDB.insert('toasts', toastRow);
  // Admin SSE picks up toasts table via poll
}

module.exports = { init, stop, COBALT };
```

---

## 4. NSSM SERVICE LAYER

### 4.1 What NSSM Provides

NSSM (Non-Sucking Service Manager) wraps NEXUS as a Windows service. The NSM module (our pure-Node wrapper) provides the same for all platforms.

**Service names and what they manage:**
```
NexusStack    — Orchestrates bridge + ollama + testenv as a coordinated stack
NexusBridge   — The NEXUS admin server (port 3748)
NexusOllama   — Ollama local LLM (port 11434)
NexusTestEnv  — PHP/MySQL/Apache/Redis sandboxes
```

### 4.2 Deterministic Boot Sequence

The boot sequence is a contract. Every phase is a hard gate (abort on failure) or soft gate (degrade gracefully but continue).

```
PHASE 0   System checks           HARD
          - Node.js version >= 18
          - Port 3748 available
          - JAA data directory writable
          - nssm.exe / node-windows available (Windows only)

PHASE 1   Crypto self-test         HARD
          - SHA-256 test vector
          - UUID generation test
          - FNV-1a hash test

PHASE 2   File integrity check     HARD (configurable: default enabled)
          - Hash check core files: jaa-db.js, siso.js, boot.js, poll-registry.js
          - Tamper detected → boot aborted, toast.error, PHASE_LOG written

PHASE 3   JAA database open        HARD
          - Create data directory
          - Replay all JSONL files
          - Open append streams for ALL_TABLES
          - Emit boot.jaa.ready

PHASE 4   SISO / ALK Kernel init   HARD
          - Create kernel instance (ringCap: 50,000)
          - Start pulse (5000ms)
          - Emit boot.siso.ready

PHASE 5   Poll registry start      HARD
          - Start foundation layer modules (bus-log, cobalt-registry, shape-sampler)
          - These must be running before anything else

PHASE 6   Core layer start         HARD
          - RAID, manifest, translation, usage
          - RAID must be routing before agents start

PHASE 7   Gate / Healer start      HARD
          - gap-finder, healer
          - Must be running before first agent call

PHASE 8   Agent layer start        SOFT (if Ollama unavailable, degrade to cloud)
          - ollama, agents dispatcher, callto
          - Health check: GET http://localhost:11434/api/tags — if 404: LAW I fallback
          - Toast: toast.boot GREEN if Ollama live, toast.warn AMBER if not

PHASE 9   Memory layer start       SOFT
          - agent-memory, lattice-index, crystal, seam, delta-engine

PHASE 10  Signal layer start       SOFT
          - topo-wire, ime-wire, orion pipeline

PHASE 11  Guardian layer start     SOFT (Guardian connection optional)
          - siphon, pulse, watchman
          - Watchman monitors Guardian health, toasts if disconnected

PHASE 12  HTTP admin server        HARD
          - Port 3748, bind to 127.0.0.1
          - Routes: /api/*, /admin/*, /health, /sse
          - SSE stream: polls toasts, event_log for live push

PHASE 13  Automation / Idearium    SOFT
          - automation-engine, queue-manager
          - idearium, spec-builder, tension, divergence

PHASE 14  Cognition layer start    SOFT
          - intent-map, bep-engine
          - self-model (hourly tick)

PHASE 15  Playground + NSSM bridge SOFT
          - causal-playground, nsm-watchdog
          - testenv-runner

PHASE 16  Boot complete            INFO
          - Emit toast.boot "NEXUS v8.0 ready" GREEN
          - Write boot_record to JAA event_log
          - Start background .nex snapshot (2s interval)

Boot failure at any HARD phase: write PHASE_LOG to data/boot-failure.json, exit 1.
```

### 4.3 NSM Commands (CLI → NSM bridge)
```
nexus service install   [name]       — install as OS service (win/linux/mac auto-detected)
nexus service uninstall [name]       — remove OS service
nexus service start     [name]       — start service
nexus service stop      [name]       — stop service gracefully
nexus service restart   [name]       — restart with backoff
nexus service status    [name|all]   — live health dashboard
nexus service logs      [name]       — tail structured logs with level filter
nexus service metrics   [name]       — query metrics JSONL stream
nexus service watchdog  [name]       — run watchdog foreground
nexus service profile   [dev|prod]   — start service profile
nexus service build-exe [name]       — package as standalone EXE (pkg/nexe/SEA)
```

### 4.4 NSM Features (from nsm.js v2.0)
- **Dependency graph:** Services declare `after: ['bridge']` — startup ordered, shutdown reversed
- **Health-contract restarts:** HTTP health probe. Process alive but unhealthy = killed + restarted
- **Exponential backoff with jitter:** base * 2^n + rand(0, base). Caps at maxDelay (30s). Resets on 60s clean window
- **Structured metrics stream:** Every event written as JSONL to metrics file. Queryable with `nsm metrics`
- **Service profiles:** `--profile dev` reads `profiles/dev.json`. Composable (profile extends profile)
- **Environment injection with secret masking:** Secrets masked in logs (replaced with ***)
- **Graceful drain on SIGTERM:** Reverse dependency order. Configurable `shutdownTimeout` before SIGKILL
- **Cross-platform service install:** Windows (node-windows | sc.exe), Linux (systemd), macOS (launchd)
- **EXE packaging:** `build-exe` → pkg, nexe, or Node SEA depending on availability

### 4.5 NSSM Install (Windows)
```powershell
nssm install NexusBridge "C:\path\to\node.exe" "C:\path\to\nexus\boot.js"
nssm set NexusBridge AppDirectory "C:\path\to\nexus"
nssm set NexusBridge AppEnvironmentExtra NEXUS_PORT=3748 DATA_DIR=C:\path\to\nexus\data
nssm set NexusBridge AppStdout "C:\path\to\nexus\data\logs\nexus.log"
nssm set NexusBridge AppStderr "C:\path\to\nexus\data\logs\nexus-error.log"
nssm set NexusBridge AppRotateFiles 1
nssm set NexusBridge AppRotateBytes 10485760
nssm set NexusBridge AppRestartDelay 2000
nssm set NexusBridge Start SERVICE_AUTO_START
nssm start NexusBridge
```

### 4.6 Crash Prompt — `service/crash-prompt.js`
On service crash, NEXUS writes a structured `crash-report.json` and emits a toast with:
- Last 50 event_log rows (causal context)
- Last 20 failures rows
- PHASE_LOG
- System metrics at time of crash
- Suggested fix commands
The cockpit shows a crash-recovery panel on next launch.


---

## 5. CORE LAYER

### 5.1 RAID — `core/raid/`
**Routing and AI Dispatch**

**What it is:** The orchestration and decision-making layer. RAID (Routing, Analysis, Inference, Dispatch) routes every request to the correct agent in LAW I order. It is not just a router — it learns from execution history and applies behavioral gravity to future routing decisions.

**Files:**
```
core/raid/index.js      — main poll loop, routes agent_calls
core/raid/learner.js    — learns from outcomes, updates weights
core/raid/weights.js    — agent weight table (loaded from config/raid-weights.json)
core/raid/fallback.js   — fallback chain logic when primary agent fails
```

**Routing algorithm (LAW I enforced):**
```
1. Check ollama health (GET :11434/api/tags, timeout 2s)
   → PASS: route to ollama
   → FAIL / usage > 90%: go to step 2

2. Check Guardian connection (guardian_nodes table, lastSeen < 12s)
   → Guardian-Claude available: route to callto/claude
   → Guardian-ChatGPT available: route to callto/chatgpt
   → Neither: go to step 3

3. Route to API Claude (costs tokens — LAW I last resort)
   → FAIL: route to API ChatGPT
   → All fail: write gap, escalate to human
```

**Behavioral gravity (from ALK SELFFORM):**
Successful routing decisions create attractors. RAID tracks:
- `successRate` per (intent × agent) pair
- `surpriseScore` from delta-engine (high surprise = novel territory)
- `avgLatencyMs` per agent
Gravity pulls future routing toward previously successful (intent × agent) basins. This replaces hard routing rules for ambiguous cases.

**BEG reconstruction (§A1):** When routing a familiar intent, RAID retrieves similar BEG (Behavioral Execution Geometry) fragments from memory and reconstructs the execution path rather than generating it fresh. Novel intents get full generation.

**COBALT CLI:**
```
nexus raid status           — show current agent weights, health, last routing decision
nexus raid route <intent>   — simulate routing for a given intent (dry-run)
nexus raid weights set <agent> <weight>  — manually adjust routing weight
nexus raid history [n]      — last N routing decisions with outcomes
nexus raid reset            — reset all learned weights to defaults
```

---

### 5.2 Manifest — `core/manifest/index.js`

**What it is:** Builds, validates, and distributes the runtime manifest. The manifest is the current system state declaration: what modules are registered, what their declared behavior is, what constraints are active.

**Manifest structure (manifest.schema.json enforced):**
```json
{
  "id": "manifest-uuid",
  "tick": 847,
  "temp": 0,
  "nodes": [
    { "id": "cobalt-id", "type": "module", "title": "gate.gap-finder", "status": "active" }
  ],
  "constraints": {
    "tokenBudget": 32000,
    "temp": 0,
    "schemaEnforced": true,
    "lawsActive": ["LAW_I", "LAW_II", "LAW_III", "LAW_IV", "LAW_V", "LAW_VI"]
  }
}
```

**temp: 0 is immutable.** Any manifest with temp ≠ 0 is rejected by AJV before execution. This is §LAW IV.

**On `manifest.ready` event:** Gate runner starts. Modules registered after manifest.ready are hotplugged — manifest is rebuilt, gate re-runs for new nodes.

---

### 5.3 Translation — `core/translation/`

**What it is:** Intent translation layer. Takes raw user input → structured intent record. Uses Ollama first (LAW I) for LLM-assisted disambiguation. Falls back to heuristic matching against `lattice_nodes` term index.

```
core/translation/index.js    — translation pipeline
core/translation/learner.js  — learns from successful translations
core/translation/alignment.js — aligns translated intent to known BEP patterns
```

**Output (intent-ir.schema.json):**
```json
{
  "sessionId": "session-uuid",
  "input": "raw user text",
  "lang": "javascript",
  "framework": null,
  "db": null,
  "features": ["event-driven", "persistence"],
  "tests": true,
  "docs": false,
  "ambiguities": ["could mean X or Y"],
  "groundedConcepts": ["JAA", "poll loop", "gap-finder"],
  "needsLLM": false,
  "causedBy": "cli-command-uuid"
}
```

---

### 5.4 Usage — `core/usage/index.js`

**What it is:** Tracks token usage, costs, and agent utilization. Feeds RAID routing decisions (usage > 90% triggers fallback). Writes to `usage_log` table.

**Tracks per agent:** total tokens in/out, cost estimate, calls/hour, avg latency, error rate, last call ts.

**CLI:**
```
nexus usage status     — current usage dashboard (all agents)
nexus usage reset      — reset usage counters (doesn't affect history)
nexus usage report     — generate usage report (last 24h, 7d, 30d)
nexus usage limit set <agent> <tokens/hour>  — set rate limit
```

---

## 6. GATE / HEALER LAYER

### 6.1 Gap Finder — `gate/gap-finder.js`

**What it is:** Continuously scans all JAA tables for behavioral deviations. Every detected gap is written to the `gaps` table. Gap-finder does NOT heal — it only finds and classifies.

**Detection strategies:**
```
stale_module     — module not seen in 60s (project_registry lastSeenAt)
stuck_call       — agent_call status='processing' for > 35s
recurring_failure — source with ≥ 3 failures in recent window (50 rows)
missing_response — agent_call completed but no response row
schema_violation — JAA row doesn't match declared schema
law_violation    — module wrote to undeclared table (§M2)
behavior_gap     — declared expectedFlow not observed within SLA
dead_listener    — module registered but emitting no events for 2+ minutes
```

**Gap severity:** fatal | high | medium | low  
**Gap status:** open | filled | ignored | escalated

**Gap record (gap.schema.json):**
```json
{
  "uuid": "gap-uuid",
  "type": "stuck_call",
  "path": "agent_calls/call-uuid",
  "body": "agent_call abc stuck in 'processing' for 47s — agent: ollama",
  "severity": "high",
  "nodeId": "cobalt-id",
  "status": "open",
  "causedBy": "call-uuid",
  "createdAt": 1716123456789,
  "attempts": 0
}
```

**On gap.found:** Immediately write to `gaps` table + emit `toast.gap` (RED, always has CLI action).

**CLI:**
```
nexus gap list [--severity high] [--status open]  — list gaps with filters
nexus gap show <uuid>                              — full gap detail + causal chain
nexus gap ignore <uuid> --reason "..."             — mark ignored (logged)
nexus gap stats                                    — gap count by type/severity/age
```

---

### 6.2 Healer — `healer/index.js`

**What it is:** Reads `gaps` table (status=open), applies fixes from `fix_map`, retries with failure context injection, escalates when exhausted.

**Healing loop:**
```
1. Poll gaps (status='open'), sorted by severity DESC, createdAt ASC
2. Claim gap (status='processing')
3. Look up fix_map for gap.path + gap.type
4. Apply fix:
   - For stuck_call: cancel + requeue with failure context
   - For stale_module: restart via poll-registry
   - For recurring_failure: inject failure mode into next agent context
   - For schema_violation: log + notify human (cannot auto-fix schema errors)
   - For behavior_gap: rerun expected flow or dequeue stuck item
5. If fix succeeds: update gap status='filled', toast.success GREEN
6. If fix fails: increment gap.attempts, inject failure context into next attempt
7. If attempts >= MAX_DEPTH (5): gap status='escalated', toast.error RED, nexus.human.escalation
```

**Behavior contracts (behavior.gate-healer.json):**
- gate.failed → gap.found within 500ms → healer.started within 2000ms (or gap.found.fatal)
- healer.started → healer.resolved | healer.exhausted within 30s (or gap.found.fatal)
- healer.exhausted → nexus.human.escalation within 1000ms (or toast.error)

**Self-healing injection:** When retrying after failure, the healer prepends a structured failure context packet to the agent's next request:
```
FAILURE CONTEXT:
  Attempt: 2 of 5
  Previous error: [exact error message]
  Stack: [relevant lines]
  Gap path: [path]
  Suggested approach: [from fix_map or BEP pattern]
  Do not repeat: [specific actions that failed]
```

**CLI:**
```
nexus healer status               — current healing queue
nexus healer retry <gap-uuid>     — manual retry (resets attempt count)
nexus healer escalate <gap-uuid>  — manually escalate to human
nexus healer history [n]          — last N healing attempts with outcomes
nexus healer fix-map list         — show known gap→fix pairs
nexus healer fix-map add <path> <fix>  — teach new fix pattern
```

---

## 7. AGENT LAYER

### 7.1 Agent Base — `agents/base.js`

**What it is:** Base class for all agents. Provides context packet assembly, response parsing, error surfacing, and JAA row writing.

**Context packet format (Ollama/Claude/ChatGPT):**
```json
{
  "system": "You are NEXUS agent <role>. Axioms: §1.1 §1.2 §2.1...",
  "memory": [
    { "tier": "crystal", "content": "..." },
    { "tier": "recent", "content": "..." },
    { "tier": "failure", "content": "FAILURE CONTEXT: ..." }
  ],
  "intent": { /* intent-ir record */ },
  "constraints": {
    "temp": 0,
    "maxTokens": 4096,
    "format": "structured",
    "schemaRef": "schemas/output.schema.json"
  },
  "beg": { /* Behavioral Execution Geometry fragment, if available */ }
}
```

**Five memory injection tiers (from v7.0, expanded):**
```
TIER 1: crystal    — stable crystallized beliefs (long-term, high confidence)
TIER 2: project    — current project context (spec, phase, open gaps)
TIER 3: recent     — last N agent responses (working memory)
TIER 4: failure    — injected failure context (from healer)
TIER 5: recall     — associative lattice results for this intent
```

Memory is assembled from JAA tables (`crystals`, `projects`, `cortex_memory`, `fix_map`, `memory_index`) before every agent call. Total token budget managed by usage module.

---

### 7.2 Ollama — `agents/ollama/index.js`

**What it is:** Local LLM agent. Always first (LAW I). Communicates with Ollama at `http://localhost:11434/api/chat`.

**Health check:** GET `/api/tags` — if 404 or timeout > 2s: emit `toast.warn` + set status='unavailable' in JAA + RAID routes to next option.

**Model selection:** From `config/raid-weights.json`. Default: `deepseek-coder-v2:16b-lite-instruct-q4_K_M`.

**CLI:**
```
nexus ollama status     — health, model, current usage
nexus ollama models     — list available models
nexus ollama use <model>  — switch active model
nexus ollama pull <model> — pull new model (wraps ollama CLI)
```

---

### 7.3 Callto Executor — `agents/callto/index.js`

**What it is:** Routes requests to Guardian browser tabs (LAW I step 2). Enables full AI capability without API keys when Guardian is connected.

**Flow:**
```
1. Read guardian_nodes table — find healthy instance (lastSeen < 12s)
2. Write agent_call with routedTo='guardian-claude' | 'guardian-chatgpt'
3. Send GUARDIAN_EXECUTE_INTENT via /api/event → Guardian BroadcastChannel bridge
4. Guardian: open tab if needed, inject prompt, wait for completion
5. Guardian: response arrives via existing _responseStore → /guardian/response
6. Callto polls agent_calls until status='complete' or timeout 120s
7. On complete: write response to cortex_memory + seam triggers on sibling completions
```

**Parallel multi-AI:** Callto can dispatch the same prompt to Claude + ChatGPT simultaneously (both with same causedBy intent UUID). Seam module detects sibling completions and merges.

**CLI:**
```
nexus callto status               — Guardian connection status
nexus callto dispatch <agent> <prompt>  — manual dispatch to browser tab
nexus callto history [n]          — recent callto sessions
```

---

### 7.4 Agent Profiles (from New_folder__4_)

Each cloud agent has a full behavioral profile. These are loaded into the agent's system prompt and context packet.

**Profile fields (chatgpt-coding-profile.json pattern):**
```json
{
  "agent": "chatgpt | claude | ollama",
  "role": "...",
  "mission": "...",
  "best_at": [...],
  "weaknesses": { "common_failure_modes": [...] },
  "output_contract": {
    "format": "...",
    "required_sections": [...]
  },
  "axioms": ["A1: ...", "A2: ..."],
  "context_rules": {
    "optimal_input_format": [...],
    "what_to_avoid_in_prompt": [...]
  }
}
```

**Agent sub-roles (from agents/chatgpt/ directory):**
Each agent can be invoked in a specific role. RAID selects the role based on intent type:
```
architect    — system design, decomposition, API contracts, tradeoffs
debugger     — root cause analysis, error tracing, state reconstruction
reviewer     — code quality, logic verification, edge case detection
optimizer    — refactoring, algorithm optimization, complexity reduction
adversarial  — find failure modes, break assumptions, stress test
```

**Agent routing map (agent-routing-map.json):**
```json
{
  "routing": {
    "architecture":    "architect",
    "system design":   "architect",
    "bug":             "debugger",
    "error":           "debugger",
    "code review":     "reviewer",
    "security review": "adversarial",
    "performance":     "optimizer",
    "unknown failure": "adversarial + debugger (parallel)"
  },
  "fallback_chain": ["debugger", "reviewer", "adversarial"]
}
```

---

## 8. MEMORY LAYER

### 8.1 Agent Memory — `memory/agent-memory.js`

**What it is:** The memory index writer. Processes all agent_calls, extracts content, writes to `memory_index` with tiers and tags. Applies stability scoring.

**Memory tiers:**
```
crystal   — stable beliefs (promoted from candidate by crystal.js)
spec      — project spec sections
session   — active session context
recent    — last N responses (rolling window)
failure   — failure modes and fix patterns
index     — general indexed content (lowest priority)
```

**Stability metrics (per memory_index row):**
```
execution    0.1–2.0  Does it still run? Duration stability.
runtime      0.1–2.0  Deviation from expected runtime behavior.
effectiveness 0.1–2.0 Impact magnitude (positive or negative).
rigidity     0.1–2.0  Tolerance before complete failure. Low = brittle.
persistence  0.1–2.0  How long a problem persists despite fixes.
```
Score > 1.0 = above baseline. Score < 0.5 = degraded. All five feed: crystal fragility, BEP contradiction, healer priority, Idearium tension, Playground test targeting.

---

### 8.2 Lattice Index — `memory/lattice-index.js` (BUILT)

**What it is:** Associative word lattice for pattern recognition. Tokenizes memory_index content, builds term co-occurrence graph, emits `lattice.pattern.emerging` when co-occurrence crosses threshold.

**Algorithm:** Tokenize → lowercase → remove stopwords → stem to 5-char prefix. Update:
- `lattice_nodes`: one row per unique term (termCount, lastSeen, sourceUuids[])
- `lattice_edges`: one row per term co-occurrence pair (coCount, PMI weight)

When `coCount` crosses threshold (default 5): emit `lattice.pattern.emerging` → BEP-engine picks up.

**Behavioral Gravity application (§A1):** High-weight lattice edges are attractors. RAID uses these to pull routing toward previously successful execution paths.

---

### 8.3 Crystal — `memory/crystal.js`

**What it is:** Belief crystallizer. Reads delta_records and lattice_edges to find facts that have appeared consistently across multiple conversations without contradiction.

**Crystal lifecycle:**
```
candidate   — first observed (confidence < 0.7)
stable      — confirmed across ≥ 3 independent events without contradiction (confidence ≥ 0.7)
decaying    — contradiction accumulation (contradictionScore rising)
dissolved   — removed from active memory (written to archival table)
```

**Crystal record (crystal.schema.json reconciled with v8.0):**
```json
{
  "uuid": "crystal-uuid",
  "statement": "human-readable belief",
  "confidence": 0.85,
  "ageMs": 86400000,
  "supportCount": 7,
  "sourceUuids": ["event-1", "event-2"],
  "fragility": 0.12,
  "state": "stable",
  "coreEventId": "first-event-uuid",
  "stabilityScore": 0.88,
  "crossLaneCount": 3,
  "recurrenceHalfLife": 172800000,
  "feedbackAlignment": 0.92,
  "causalIntegration": 0.78,
  "contradictionScore": 0.08,
  "accessCount": 14,
  "promotedAt": 1716123456789,
  "createdAt": 1716000000000
}
```

**Only verified seams (from Seam module) contribute to crystal promotion.** Raw agent output → candidate. Seam-verified cross-AI agreement → stable.

**CLI:**
```
nexus crystal list [--state stable]  — list crystals
nexus crystal show <uuid>            — full crystal detail
nexus crystal search <term>          — find crystals by term match
nexus crystal age                    — age distribution of crystals
```

---

### 8.4 Seam — `memory/seam.js`

**What it is:** Multi-AI response merger. Detects sibling completions (same causedBy), diffs them structurally, writes seam_records.

**Merge algorithm:**
```
1. Detect: two chat_completions with same causedBy (from Callto parallel dispatch)
2. Tokenize both responses at sentence level
3. Find agreement zones (sentences present in both, cosine similarity > 0.85)
4. Find disagreement zones (sentences contradicting each other)
5. Find unique-to-A and unique-to-B zones
6. Write seam_record with full structural diff
7. Write seam_record to memory_index with tags: ['seam', 'merged', providerA, providerB]
8. Orion-ext picks up seam for ORION quality gate
```

**Seam record (seam.schema.json):**
```json
{
  "uuid": "seam-uuid",
  "intentUuid": "original-intent-uuid",
  "providerA": "claude",
  "providerB": "chatgpt",
  "agreementZones": [{ "text": "...", "confidence": 0.92 }],
  "disagreementZones": [{ "a": "...", "b": "...", "delta": 0.73 }],
  "uniqueToA": ["..."],
  "uniqueToB": ["..."],
  "agreementCoverage": 0.68,
  "verified": false,
  "causedBy": "callto-uuid",
  "ts": 1716123456789
}
```

**Crystal only crystallizes from verified seams (Orion verify stage sets verified=true).**

---

### 8.5 Delta Engine — `core/delta/index.js`

**What it is:** Surprise scoring. Computes divergence between consecutive agent responses.

**Algorithm:**
```
On agent.response.received:
1. Pull last 5 responses from cortex_memory for same agent
2. Compute term-overlap cosine similarity (bag-of-words, no external deps)
3. Write delta_record:
   { uuid, agentUuid, responseUuid, similarity_to_prev[], surprise_score, novel_terms[], ts }
4. surprise_score = 1 - max(similarity_to_prev)
5. If surprise_score > 0.7: sigma spike → versionium auto-commits (breakthrough)
6. If surprise_score < 0.1: flag potential stuck loop → gap.found
```

**Behavioral Gravity (§A1):** Delta records build the agent's creativity baseline. High consistent surprise_score = creative mode. Low = routine mode. Self-model reads this for `creativityIndex`.

---

### 8.6 Fix Map — `memory/fix-map.js` (BUILT)

**What it is:** Growing knowledge base of gap-type → fix mapping. Every successful healer fix is written here. Every failed attempt is also written (with failure mode). Healer reads this before attempting any fix.

**Record:** `{ gap_path, gap_type, fix_description, fix_code, success_count, failure_count, last_success, last_failure, causedBy }`

**Feedback loop:** success_count / (success_count + failure_count) = fix confidence. Healer weights fix selection by confidence.

---

## 9. SIGNAL LAYER (from ALK)

The ALK signal modules provide the behavioral intelligence substrate. These are first-principles signal processing — no external ML dependencies.

### 9.1 Signal Topology — `core/signal/signal-topology.js`

**What it is (from ALK v2.0.0):** Cross-stream behavioral state integrator. Computes composite behavioral states from multiple simultaneous signal streams. In NEXUS context: applies to agent communication patterns, Guardian session streams, and system behavior.

**Composite states (ported from ALK, recontextualized for NEXUS):**
```
COGNITIVE_LOAD        — brow furrow + gaze stable + jaw tension + reduced movement
                        NEXUS context: agent stuck, high retry rate, slow response
GENUINE_ENGAGEMENT    — Duchenne joy + forward lean + open posture + low micro rate
                        NEXUS context: agent producing high-confidence, low-surprise responses
CONCEALMENT           — suppressed micro + hand-to-mouth + gaze aversion cluster
                        NEXUS context: agent avoiding topic, contradiction accumulation
DISSONANCE            — positive verbal + negative somatic
                        NEXUS context: agent output contradicts memory context
STRESS_ACUTE          — high-freq micro + shoulder raise + gaze aversion
                        NEXUS context: repeated failures, gap density spike, healer thrashing
APPROACH              — forward lean + eye contact + open palm
                        NEXUS context: high engagement, low latency, high success rate
WITHDRAWAL            — backward lean + gaze aversion + shoulder raise
                        NEXUS context: agent backing off, confidence dropping, retry rate rising
```

**In NEXUS:** These composite states are mapped from system metrics (gap density, retry rates, latency curves, success rates) rather than video landmarks. The same mathematical model applies.

**Bus events:**
```
Emits: alk.signal.composite  — named behavioral state with score
       alk.signal.state       — full state snapshot
       alk.signal.transition  — when dominant state changes
       alk.signal.pulse       — §1.8 heartbeat every 30 ticks
```

---

### 9.2 Latent Model — `core/signal/latent-model.js`

**What it is:** Bayesian fusion of all signal streams into a unified 5D system state model. In NEXUS context: fuses gap density, latency, success rates, surprise scores, and crystal fragility into a unified system health state.

**5D latent dimensions (recontextualized from ALK):**
```
VALENCE      [-1, +1]  Negative (degrading) ↔ Positive (improving) system affect
AROUSAL      [0, 1]    Calm (stable, low activity) ↔ Activated (high gap rate, thrashing)
SUPPRESSION  [0, 1]    Authentic (outputs match expectations) ↔ Masked (divergence high)
COHERENCE    [0, 1]    Integrated (all channels coherent) ↔ Fragmented (contradictions)
ENGAGEMENT   [-1, +1]  Withdrawal (agent backing off) ↔ Approach (high confidence, output)
```

**Update architecture:** Extended Kalman filter. Each observation updates the 5D state vector. Uncertainty (covariance P) grows when observations are absent, shrinks when reliable observations arrive.

**Observation reliability (R values for NEXUS signals):**
```
Gap density             R = 0.15  (very reliable system health proxy)
Latency deviation       R = 0.20  (reliable for arousal)
Success rate            R = 0.20  (reliable for valence)
Surprise score          R = 0.25  (reliable for engagement direction)
Crystal fragility       R = 0.15  (high-value integrated signal)
Healer retry count      R = 0.10  (definitive stress indicator)
Cross-agent agreement   R = 0.15  (coherence proxy)
```

---

### 9.3 Suppression Score — `core/signal/suppression-score.js`

**What it is (NEXUS recontextualized):** Detects when the system is "suppressing" — when observed outputs diverge from internal state. High suppression = the system is hiding something (e.g., agent producing confident output while internally in high-failure mode).

**Evidence streams:**
1. Surface–subsurface gap: what agent outputs vs what memory/gaps show
2. Cross-channel incongruence: high success rate claim + high failure_count in failures table
3. Temporal consistency: sustained suppression increases logarithmically

**Output:** `{ suppressionScore, confidence, dominantEvidence, surfaceState, inferredState, gap, sustainedMs }`

---

### 9.4 Trajectory Recorder — `core/trajectory/trajectory-recorder.js`

**What it is:** Captures the system's path through the 5D latent state space during a session. Compresses into an AttractorMap.

**Attractors in NEXUS context:** Repeated stable states the system returns to (e.g., "routine code generation mode" is a deep attractor; "debugging crisis mode" is a shallow attractor).

**Output (per session):** AttractorMap — 5-12 attractors, O(k²) edges, bifurcation events. Stored in `trajectory_sessions` JAA table. ~1-4KB per session.

**Bifurcations:** Moments where a small stimulus caused a large state change (high surprise_score + rapid latent state shift). These are the most information-rich system events.

---

### 9.5 Attractor Landscape — `core/trajectory/attractor-landscape.js`

**What it is:** Persistent cross-session model of the system's emotional topology. Each session deposits an AttractorMap layer. Over sessions, attractors deepen (visited repeatedly = stable basin) or dissolve.

**Behavioral Gravity (§A1):** The attractor landscape IS the behavioral gravity field. Future routing is pulled toward deep attractors (proven stable modes).

---

### 9.6 Topo Wire — `foundation/topo-wire.js`

**What it is:** Bridge between event_log and the 8-gate SNR pipeline (topo-kernel). Normalizes JAA events into topo-kernel signals, writes `snr_records`.

**Normalization:**
```
agent responses       → snr value 0.7–1.0 (high signal)
failures              → snr value 0.1–0.3 (low signal, noise)
gap events            → snr value 0.4–0.6 (mid — system correcting)
crystal formed        → snr value 0.9–1.0 (very high signal, stable knowledge)
```

After 100 events: every module has a trust score (Bayesian posterior). Healer reads trust scores before acting.

---

### 9.7 IME Wire — `foundation/ime-wire.js`

**What it is:** Behavioral profile builder. Translates JAA events into `ime.ingest()` calls, builds behavioral baselines per source UUID.

**Profiles:** `ime_profiles` table — event_type_counts, baseline_hash, anomaly_count. Anomalies → `gaps` as `ime_anomaly` type. Trust scores → `trust_scores` table.

After a week: every agent, module, and Guardian instance has a behavioral baseline. Pattern deviations auto-generate gaps.

---

## 10. GUARDIAN LAYER

### 10.1 Guardian (Chrome Extension) — `guardian/`

**What it is:** The eyes and hands of NEXUS in the browser. Captures AI conversations (Claude.ai, ChatGPT, Gemini) via MutationObserver, dispatches prompts to AI tabs, routes responses back.

**Guardian components:**
```
guardian/manifest.json   — Chrome extension manifest
guardian/background.js   — service worker, maintains connection to NEXUS :3748
guardian/content.js      — page-level MutationObserver, captures responses
guardian/ir-layer.js     — Intent Recognition — structures raw page events
guardian/app.js          — main Guardian logic
guardian/handshake.js    — NEXUS connection handshake (port :3748)
guardian/cfr.js          — Causal Forensic Recorder for Guardian events
guardian/modules/
  base-module.js         — base class for per-site modules
  chatgpt.js             — ChatGPT.com selectors and response capture
  claude.js              — Claude.ai selectors and response capture
  threads.js             — Threads.com (social)
  instagram.js           — Instagram (social)
  urck/urck.js           — URCK module
```

**Heartbeat:** Every 8 seconds, Guardian pings /guardian/heartbeat on :3748. Pulse module reads this and maintains `guardian_nodes` table.

**Command flow:**
```
CLI: nexus callto dispatch claude "Build hello world"
→ NEXUS writes to agent_calls (routedTo='guardian-claude')
→ Callto executor: finds healthy Guardian instance in guardian_nodes
→ POST /api/event: GUARDIAN_EXECUTE_INTENT
→ Guardian background.js: picks up via BroadcastChannel bridge
→ Guardian: opens Claude.ai tab (or uses existing), injects prompt
→ Guardian content.js: MutationObserver captures response as it streams
→ Guardian: POST /guardian/response to NEXUS :3748
→ Callto: agent_call status='complete', response stored
→ Toast: toast.agent GREEN
```

**Request log (from Mastermind.md):**
```json
{
  "uuid": "request-uuid",
  "agent": "ChatGPT",
  "intent": "Code",
  "choice": "user | orchestrator",
  "content": "...",
  "context": "...",
  "dateOfRequest": "2026-05-23T09:55:00Z",
  "status": "Unfulfilled | Delivered | Fulfilled",
  "tags": {
    "buildStatus": "Never built | Partially built | Completed",
    "deliveryStatus": "Requested | Delivered | Fulfilled"
  },
  "compartment": "Nexus | Forge | Versionium | Cortex"
}
```

---

### 10.2 Siphon — `guardian/siphon.js`

**What it is:** Chat ingestion normalizer. Watches `event_log` for `guardian.*` events, extracts structured fields, writes clean records to `chat_sessions`, `chat_messages`, `chat_completions`.

**Zero extension changes.** Data already flows from Guardian — Siphon catches and organizes it.

**New JAA tables:** `chat_sessions`, `chat_messages`, `chat_completions`

---

### 10.3 Pulse — `guardian/pulse.js`

**What it is:** Reads heartbeat events from event_log, builds live mesh topology in `guardian_nodes` table. Detects stale nodes (no heartbeat > 25s) → gap.found.

**guardian_nodes row:** `{ instanceId, lastSeen, capabilities[], tabCount, listenerCount, healthScore }`

---

### 10.4 Watchman — `guardian/watchman.js`

**What it is:** Monitors Guardian health. Writes `guardian_health` every 5s. When healthScore < 0.3 or connected=false: severity:high gap + toast.error RED.

**guardian_health row:** `{ connected, listenerCount, sessionCount, staleNodes[], lostListeners[], healthScore }`

For Guardian-dependent workflows: any automation that has a `guardian-claude` step checks `guardian_health` before enqueuing. Zero Guardian = automatic fallback to API Claude.

---

## 11. ORION PIPELINE

**What it is:** 4-stage quality gate for every agent output. Measure → Record → Policy → Verify.

### 11.1 Sensor — `orion/sensor.js`

Reads `bridge_messages` from Guardian. Groups by calltoId. Writes buffering sessions to `orion_sessions` (status='buffering'). When no new events for SESSION_TTL (120s): marks session complete (status='measured'). SNR features computed from event window.

### 11.2 Record — `orion/record.js`

Reads `orion_sessions` (status='measured'). Persists full session with seam record if available. Status → 'recorded'.

### 11.3 Policy — `orion/policy.js`

Reads `orion_sessions` (status='recorded'). Applies trust scores from IME-wire to decide accept/retry. Checks seam agreement_zone coverage against threshold. Status → 'policy_applied'.

### 11.4 Verify — `orion/verify.js`

Reads `orion_sessions` (status='policy_applied'). Checks seam.agreementCoverage >= threshold (default 0.60). If yes: sets seam.verified=true. Crystal only crystallizes beliefs from verified seams. Status → 'verified' | 'rejected'.

### 11.5 Orion-Ext — `orion/ext.js`

Multi-provider coordinator. Reads intent_map for intents tagged `multi-agent`. Creates Orion sessions for each, orchestrates sensor/record/policy/verify as a single ORION flow. Fully auditable multi-AI call with 4-stage quality gate.

---

## 12. VERSIONIUM

### 12.1 Index — `versionium/index.js` (BUILT)

**What it is:** Causal version control. Reads `artifacts` + `shape_samples` for sigma deviations. Auto-commits when sigma > 0.7. Every breakthrough (high surprise_score) commits automatically. Your intellectual history is your commit log.

**Commit record (versionium.schema.json):**
- `commitId`: vtm-<hex12>
- `parentId`: parent commit (null = root)
- `branch`: current branch name
- `author.agentId`: who made the change
- `snapshot.ringSlice`, `snapshot.shapes`, `snapshot.gapSurface`, `snapshot.crystalState`
- `files[]`: FileVersion records with `shapeAtCommit` reference
- `bottlenecks[]`: Bottleneck records from sigma analysis

**Calendar index:** Every commit indexed by date for `nexus versionium calendar <date>` browsing.

**CLI:**
```
nexus versionium status            — current HEAD, branch, uncommitted changes
nexus versionium log [n]           — recent commits with messages
nexus versionium show <commit-id>  — full commit detail
nexus versionium chain <uuid>      — causal chain for any event UUID
nexus versionium diff <a> <b>      — diff two commits
nexus versionium checkout <id>     — rewind to commit state (§rewind.schema.json)
nexus versionium branch <name>     — create branch
nexus versionium merge <branch>    — merge branch to current
nexus versionium calendar <date>   — commits on date
nexus versionium replay <from> <to> [--mode fork|dry-run|live] — temporal replay
```


---

## 13. IDEARIUM — THE IDEA OS

### 13.1 What Idearium Is

Idearium is not a notes app. It is the cognitive operating system of NEXUS — the interface between human thinking and system building. Every idea that enters Idearium becomes a traceable artifact with a causal history, a tension score, and a spec-build checklist.

**Axiom:** Ideas are the input to specifications. Specifications are the input to gate runs. Gate runs produce artifacts. Artifacts feed back into memory. Memory feeds back into ideas.

The loop: `idea → spec → gate → artifact → memory → crystal → idea`

---

### 13.2 Idearium Core — `idearium/index.js`

**What it is:** Core Idearium OS. Manages `ideas` and `projects` tables. Provides the idea lifecycle.

**Idea lifecycle:**
```
seed       — raw idea, not yet structured (just text + tags)
expanding  — being fleshed out (spec sections being written)
tensioned  — tension score computed (competing ideas, open gaps identified)
specced    — full spec built, ready for gate run
building   — gate run in progress
complete   — all gates passed, artifacts in Forge
archived   — intentionally set aside (not deleted — nothing is deleted)
```

**Idea record (ideas table):**
```json
{
  "uuid": "idea-uuid",
  "text": "the raw idea",
  "tags": ["architecture", "memory", "agents"],
  "phase": "expanding",
  "tension": 0.42,
  "causedBy": "cli-command-uuid | another-idea-uuid | null",
  "parentIdea": "parent-idea-uuid | null",
  "linkedSpec": "spec-uuid | null",
  "stability": { "execution": 1.1, "runtime": 0.9, "effectiveness": 1.4, "rigidity": 0.8, "persistence": 1.2 },
  "openGaps": ["gap-uuid-1", "gap-uuid-2"],
  "ts": 1716123456789
}
```

**CLI:**
```
nexus idea add "..."                    — create new idea
nexus idea list [--phase expanding]     — list ideas with filter
nexus idea show <uuid>                  — full idea detail + tension + causal chain
nexus idea link <uuid> <uuid>           — link two ideas (causal | semantic | temporal)
nexus idea tension <uuid>               — compute tension score
nexus idea spec <uuid>                  — start spec builder for idea
nexus idea search <term>                — search ideas by content
nexus idea tree                         — idea graph visualization (ASCII)
```

---

### 13.3 Spec Builder — `idearium/spec-builder.js`

**What it is:** Guided spec creation. Takes an idea UUID → walks through spec sections → produces a complete spec that can be fed into the gate runner one file at a time.

**Spec builder is the one place where the module and system spec schema matters most.** Every module section has a checklist that the builder enforces before marking a section complete.

**Spec record (specs table, idearium-spec.schema.json):**
```json
{
  "uuid": "spec-uuid",
  "name": "spec name",
  "version": "1.0.0",
  "ideaUuid": "source-idea-uuid",
  "sections": [
    {
      "id": "intent",
      "title": "Intent & Purpose",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "has_uuid", "label": "UUID declared", "done": false },
        { "id": "has_intent", "label": "Intent statement written", "done": false },
        { "id": "has_not_this", "label": "What this is NOT written", "done": false }
      ]
    },
    {
      "id": "api_callto",
      "title": "API Calls & Calltos",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "all_endpoints_declared", "label": "All external endpoints declared", "done": false },
        { "id": "all_guardian_calltos", "label": "All Guardian calltos declared", "done": false },
        { "id": "all_jaa_reads", "label": "All JAA tables read declared in COBALT.reads", "done": false },
        { "id": "all_jaa_writes", "label": "All JAA tables written declared in COBALT.writes", "done": false }
      ]
    },
    {
      "id": "module_hooks",
      "title": "Module Hooks & Bridge Points",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "subscribes_declared", "label": "All subscribes[] declared in module.schema.json", "done": false },
        { "id": "publishes_declared", "label": "All publishes[] declared in module.schema.json", "done": false },
        { "id": "hook_map_complete", "label": "COBALT.hooks map complete", "done": false },
        { "id": "event_channels_named", "label": "All event channel names declared (no wildcards in hooks)", "done": false }
      ]
    },
    {
      "id": "gap_contract",
      "title": "Gap Contract",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "bridges", "label": "cobalt.gapContract.bridges filled", "done": false },
        { "id": "fills", "label": "cobalt.gapContract.fills filled", "done": false },
        { "id": "creates", "label": "cobalt.gapContract.creates filled", "done": false }
      ]
    },
    {
      "id": "cli_spec",
      "title": "CLI Commands",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "every_feature_has_cli", "label": "Every feature has a CLI command", "done": false },
        { "id": "all_commands_registered", "label": "All commands declared in COBALT.cli[]", "done": false },
        { "id": "success_toast", "label": "toastOnSuccess declared for each command", "done": false },
        { "id": "fail_toast", "label": "toastOnFail declared for each command", "done": false }
      ]
    },
    {
      "id": "schemas",
      "title": "Schemas",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "jaa_tables_schemed", "label": "All JAA tables owned by this module have schemas", "done": false },
        { "id": "output_schema", "label": "Agent output schema declared (if applicable)", "done": false },
        { "id": "module_schema", "label": "module.schema.json instance created", "done": false }
      ]
    },
    {
      "id": "phase_map",
      "title": "Phase Map",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "phase_declared", "label": "Build phase declared", "done": false },
        { "id": "gate_order", "label": "Gate order declared", "done": false },
        { "id": "dependencies", "label": "Module dependencies listed", "done": false }
      ]
    },
    {
      "id": "failure_modes",
      "title": "Failure Modes",
      "complete": false,
      "required": true,
      "content": "",
      "checklist": [
        { "id": "failure_modes_listed", "label": "All known failure modes listed", "done": false },
        { "id": "gap_types_declared", "label": "Gap types this module generates declared", "done": false },
        { "id": "toast_for_each_failure", "label": "Toast type declared for each failure mode", "done": false }
      ]
    },
    {
      "id": "tests",
      "title": "Test Suite",
      "complete": false,
      "required": false,
      "content": "",
      "checklist": [
        { "id": "test_file_path", "label": "Test file path declared in COBALT.tests.suite", "done": false },
        { "id": "coverage_declared", "label": "Coverage targets declared", "done": false },
        { "id": "required_pass_rate", "label": "Required pass rate declared (1.0 for core)", "done": false }
      ]
    }
  ],
  "modules": [
    { "name": "module-name", "file": "path/to/module.js", "intent": "...", "status": "planned | building | complete" }
  ],
  "wired": {
    "eventBus": false,
    "cli": false,
    "jaa": false,
    "toast": false,
    "schemaValidated": false
  },
  "buildOrder": [1, 2, 3],
  "agentAssignments": { "gate-1": "ollama", "gate-2": "claude", "gate-3": "claude" },
  "causedBy": "idea-uuid",
  "ts": 1716123456789
}
```

**System & Module Awareness:** The spec builder is aware of all registered modules (from agent_signatures JAA table). When speccing a new module, it:
1. Shows which existing modules it will interact with (based on declared JAA tables)
2. Highlights potential friction points (tables used by multiple modules)
3. Auto-suggests hook points based on similar module patterns
4. Warns when a new module writes to a table owned by another module

**CLI:**
```
nexus spec new <idea-uuid>              — start guided spec builder
nexus spec show <uuid>                  — show spec with checklist status
nexus spec section <uuid> <section-id>  — edit a section
nexus spec check <uuid>                 — run all checklist items, show what's missing
nexus spec build <uuid>                 — feed completed spec into gate runner
nexus spec list [--complete]            — list all specs
nexus spec export <uuid>                — export as markdown
nexus spec audit <uuid>                 — audit against all existing modules for friction
```

---

### 13.4 Tension — `idearium/tension.js`

**What it is:** Tension scoring engine. Computes how much an idea "wants" to exist — the pull between what it promises and what stands in the way.

**Tension score (0.0–1.0):**
```
Component weights:
  gap_density      0.30  — how many open gaps are in the idea's domain
  contradiction    0.25  — how many existing crystals contradict this idea
  novelty          0.20  — surprise_score of related delta_records
  resource_cost    0.15  — estimated token/time cost to spec+build
  dependency_depth 0.10  — how many other modules this depends on

High tension (> 0.7) = idea wants to exist badly, multiple forces pushing for it
Low tension (< 0.3)  = idea is smooth, low resistance — may be too simple
Very high tension (> 0.9) = contradictions may block — needs resolution first
```

**tension.score feeds:** Idearium sort order (high tension first), healer priority for related gaps, crystal fragility adjustment.

---

### 13.5 Divergence — `idearium/divergence.js`

**What it is:** Before/after snapshot pairs. Records system state before an idea becomes a spec, and after it's built. The diff IS the value delivered.

**divergence_record:**
```json
{
  "uuid": "divergence-uuid",
  "subjectUuid": "idea-uuid | spec-uuid | artifact-uuid",
  "beforeSnapshot": { "gapCount": 12, "crystalCount": 7, "sigma": 0.4, "modules": [...] },
  "afterSnapshot": { "gapCount": 3, "crystalCount": 11, "sigma": 0.2, "modules": [...] },
  "sigma": 0.18,
  "delta": { "gapReduction": 9, "crystalGrowth": 4, "sigmaImprovement": 0.2 },
  "metricsAfter": { "execution": 1.4, "runtime": 1.1 }
}
```

---

### 13.6 README Generator — `idearium/readme-gen.js`

**What it is:** Generates README from JAA state. Reads spec, artifacts, gap history, crystal statements. Documentation is generated from proof — not written as aspiration (§6.1).

```
nexus readme generate <spec-uuid>  — generate README from spec + JAA state
nexus readme update <uuid>         — regenerate README after state change
```

---

### 13.7 Changelog Generator — `idearium/changelog-gen.js`

**What it is:** Generates CHANGELOG from versionium commit history, gap fills, crystal formations.

```
nexus changelog generate [--since <date>]  — generate changelog from versionium history
nexus changelog entry add "..."            — manually add entry
```

---

## 14. COGNITION LAYER

### 14.1 Intent Map — `core/intent/index.js`

**What it is:** Promotes free-text `intent` fields into a first-class UUID-keyed semantic graph.

**On every agent_call insert:** Intent-map extracts the intent, fuzzy-matches against `lattice_nodes`, links or creates `intent_nodes` row.

**intent_nodes row (intent-node.schema.json):**
```json
{
  "uuid": "intent-node-uuid",
  "text": "intent text",
  "intentHash": "fnv1a-hash",
  "callCount": 14,
  "successRate": 0.86,
  "avgSurpriseScore": 0.42,
  "preferredAgent": "ollama",
  "associatedCrystals": ["crystal-uuid-1"],
  "tags": ["architecture", "memory"],
  "lastCalled": 1716123456789
}
```

**Intent node insights:**
- High callCount + high successRate = reliable workflow (crystallize the pattern)
- High avgSurpriseScore = novel territory (track for creativity index)
- No associatedCrystals = unresolved question (show in self-model as open question)
- Low successRate + high retryCount = constraint wall (show in self-model as constraint pattern)

**intent_edges:** Directed graph of intent transitions (which intent follows which).

**CLI:**
```
nexus intent list [--sort callCount]  — list intent nodes
nexus intent show <uuid>              — detail + associated crystals + success rate
nexus intent search <term>            — find by text
nexus intent graph                    — force-directed ASCII graph
```

---

### 14.2 BEP Engine — `core/bep/index.js`

**What it is:** Belief-Evidence-Pattern engine. Reads `crystals` (beliefs), `delta_records` (evidence), `lattice_edges` (patterns). Builds BEP triples and writes to `bep_patterns`.

**BEP triple:** `(belief, supporting_evidence[], pattern_cluster)`

A BEP triple answers: "this is what the system currently believes, here is the evidence trail, and here is the word-pattern cluster it belongs to."

**BEP contradiction detection:** When a new delta_record contradicts a crystal (low cosine similarity to belief's supportCount cluster), BEP-engine emits `bep.contradiction.detected` → gap.found (high severity). This closes: raw evidence → structured belief → contradiction → system self-repair.

**Behavioral Geometry (from SELFFORM §A1):** BEP patterns are the behavioral attractors. High-metrics BEPs (successRate, useCount) are deep attractors. RAID uses BEP patterns for routing: reconstruct execution path from BEG rather than generate fresh.

**bep_patterns row (bep-pattern.schema.json):**
```json
{
  "uuid": "bep-uuid",
  "intent": "intent text",
  "intentHash": "hash",
  "layer": "gate | healer | manifest | translation | foundation",
  "tags": ["architecture"],
  "inputContract": {},
  "outputContract": {},
  "behaviorGraph": {
    "steps": [{ "action": "...", "result": "..." }],
    "invariants": ["always emit toast on failure"]
  },
  "constraints": ["max 5 retries"],
  "failureModes": ["timeout", "schema violation"],
  "implementations": ["gate/gap-finder.js"],
  "metrics": {
    "useCount": 23,
    "successRate": 0.87,
    "avgLatencyMs": 340,
    "regressionCount": 1,
    "lastUsed": 1716123456789
  }
}
```

---

### 14.3 Self Model — `core/self-model.js`

**What it is:** Rolling self-portrait of the system. Updated hourly. Reads delta_records, intent_nodes, ime_profiles, bep_patterns.

**self_model row:**
```json
{
  "uuid": "self-model-uuid",
  "generatedAt": 1716123456789,
  "creativityIndex": 0.43,
  "divergenceTrend": 0.02,
  "dominantIntentClusters": [
    { "intentHash": "hash", "text": "architecture planning", "callCount": 47, "successRate": 0.89 }
  ],
  "constraintPatterns": [
    { "intentHash": "hash", "text": "database schema design", "successRate": 0.31, "retryCount": 12 }
  ],
  "trustLandscape": {
    "top5": [{ "uuid": "source-uuid", "score": 0.94, "label": "ollama/deepseek" }],
    "bottom5": [{ "uuid": "source-uuid", "score": 0.22, "label": "guardian-gemini" }]
  },
  "openQuestions": [
    { "intentHash": "hash", "text": "how to handle 4TB NAS sync efficiently", "callCount": 3 }
  ],
  "systemHealth": {
    "latentState": { "valence": 0.6, "arousal": 0.3, "suppression": 0.1, "coherence": 0.85, "engagement": 0.7 },
    "dominantRegime": "stable",
    "gapDensity": 2,
    "crystalCount": 23,
    "ollamaAvailable": true,
    "guardianConnected": true
  }
}
```

**CLI:**
```
nexus self                    — print current self-model snapshot
nexus self history [n]        — last N self-model snapshots
nexus self diff <a> <b>       — diff two self-model snapshots
nexus self constraints        — show constraint patterns only
nexus self questions          — show open questions only
```

---

## 15. AUTOMATION LAYER

### 15.1 Automation Engine — `automation/engine.js` (BUILT)

**What it is:** Schedule and workflow runner. Reads `schedules` table, executes steps, writes `workflow_runs`.

**Trigger types (schedule.schema.json):** cron | interval | event | condition | chain | manual

**Step types:** emit | agent_call | loop | condition | store | memory | delay | notify | cli

**CLI:**
```
nexus automation list              — list all schedules
nexus automation show <uuid>       — schedule detail + last runs
nexus automation create            — interactive schedule builder
nexus automation run <uuid>        — manual trigger
nexus automation pause <uuid>      — pause schedule
nexus automation history <uuid>    — run history with outcomes
```

---

### 15.2 Queue Manager — `automation/queue-manager.js` (BUILT)

**What it is:** Priority queue with dependency gating. Items declare `dependsOn[]` — queue holds until dependencies are complete.

**Queues:** build | gate | nas-push | replay | agent_call

**Priority aging:** Items not processed for 60s get +10 priority (prevents starvation).

**Build queue item (build-queue.schema.json):**
```json
{
  "queueId": "build",
  "itemId": "item-uuid",
  "type": "gate-check | manifest-build | versionium-commit | nas-push | replay | agent-call | pipeline-step",
  "priority": 50,
  "status": "pending",
  "enqueuedAt": 1716123456789,
  "enqueuedBy": "cli | orchestrator | healer",
  "gate": {
    "waitForEvents": ["manifest.ready"],
    "waitForItems": ["item-uuid-dependency"],
    "condition": "$.guardianConnected === true",
    "timeoutMs": 30000
  }
}
```

---

## 16. CAUSAL PLAYGROUND

### 16.1 What the Playground Is

**The Causal Playground is the sandboxed isolated environment for testing projects.** It replaces the old "Test ENV" concept with a fully causality-linked, snapshot-capable test infrastructure.

Every test run is a `playground_run` JAA row with full causality. Every test result is causally linked to the run. Failures feed directly into gap-finder. Successes feed into fix_map.

### 16.2 Supported Environments

**Web servers:** Apache2, Nginx, Flask (Python), Node (npx serve)  
**Databases:** MySQL, SQLite, PostgreSQL, JAA  
**Languages:** PHP (w/ phpMyAdmin), Python, Node.js, Ruby  
**Email:** Mailhog (SMTP :1025, UI :8025)  
**Caching:** Redis

**Each environment has:** A config editor in the cockpit + CLI management.

### 16.3 Modules

```
causal-playground/index.js          — sandbox lifecycle manager
causal-playground/env-manager.js    — environment config CRUD (env_configs table)
causal-playground/test-runner.js    — causality-linked test execution
causal-playground/server-manager.js — per-server start/stop/config/health
causal-playground/db-manager.js     — multi-engine DB with snapshot/restore
```

### 16.4 Test Runner (from Infrastructure runner.js + NSSM testenv-runner.js)

**Zero-dependency test runner:** `test()`, `assert()`, `assertEqual()`, `section()`, `report()`.

Every test assertion: causally linked to its `playground_run`. On failure: gap.found auto-created. On success: fix_map updated.

**CLI:**
```
nexus playground run <spec-uuid>         — run test suite for spec
nexus playground run --env php           — run in specific environment
nexus playground env list                — list available environments
nexus playground env create <name>       — create environment config
nexus playground env start <name>        — start environment
nexus playground env stop <name>         — stop environment
nexus playground env snapshot <name>     — snapshot current state
nexus playground env restore <name> <snap>  — restore from snapshot
nexus playground db import <env> <file>  — import database
nexus playground db export <env>         — export database
nexus playground status                  — all environment health
```

---

## 17. DEBUGGING, DIAGNOSTIC AND AUDITING PANEL

### 17.1 What the Debug Panel Is

A full-system introspection interface. CLI-first. UI is a rendered view of the same data.

**Three sub-systems:**
- **System Diagnostic** — health snapshot of every module, every service, every JAA table
- **Causal Debugger** — trace any event/gap back through its causal chain
- **System Auditor** — find friction, gaps, anomalies, law violations across all modules

### 17.2 System Diagnostic — `nexus-diag.js` (from Infrastructure)

**Standalone — completely isolated from NEXUS.** Diagnoses from the outside.

**What it checks:**
```
System:      Node.js version, OS, RAM, CPU, disk space
Ports:       3748 (admin), 11434 (ollama), 3747 (bridge), all sandbox ports
Services:    Bridge health, Ollama health, Guardian connection
JAA:         Table counts, last write timestamps, file sizes
NEXUS:       PID file check, uptime
Config:      Environment variables, required files present
Schemas:     All registered schemas validating against their tables
Law:         Check law_violations table for recent violations
```

**CLI:**
```
nexus diag                   — full diagnostic, structured output
nexus diag --watch           — continuous monitoring, show on changes
nexus diag --json            — JSON output for machine consumption
nexus diag --guardian        — test Guardian execute flow end-to-end
nexus diag module <id>       — diagnose specific module
nexus diag table <name>      — diagnose specific JAA table
nexus diag laws              — check all law violations
nexus diag schema <name>     — validate schema against table contents
```

**Output format:**
```
[09:54:12] [DIAG]  ✓  Node.js v20.11.0
[09:54:12] [DIAG]  ✓  Port 3748 — NEXUS admin server responding
[09:54:12] [DIAG]  ✓  Port 11434 — Ollama live (deepseek-coder-v2:16b)
[09:54:12] [DIAG]  ✗  Port 3747 — Bridge OS not responding (expected)
[09:54:12] [DIAG]  ⚠  Guardian — disconnected (last seen 47s ago)
[09:54:12] [DIAG]  ✓  JAA — 28 tables, 142,847 rows, 23MB
[09:54:12] [DIAG]  ✗  law_violations — 2 recent (LAW_II: 1, LAW_VI: 1)
```

### 17.3 Causal Debugger

Uses causal-nexus `causality/index.js` + versionium chain walking.

**CLI:**
```
nexus debug trace <uuid>           — trace event/gap/artifact to root cause
nexus debug chain <uuid>           — full causal chain as tree
nexus debug replay <from> <to>     — replay event sequence
nexus debug diff <uuid-a> <uuid-b> — diff two states
nexus debug module <id>            — module-level debug: subscriptions, last events, errors
nexus debug agent <call-uuid>      — debug single agent call: context sent, response received, gaps created
nexus debug gap <uuid>             — debug gap: origin, attempts, fix_map, related failures
nexus debug law <violation-uuid>   — debug law violation: what rule, which module, what event
```

### 17.4 System Auditor

Runs friction detection across all module interactions. Outputs a prioritized list of improvements.

**CLI:**
```
nexus audit friction              — map all inter-module friction points
nexus audit gaps                  — all open gaps with age and severity
nexus audit schemas               — validate all JAA tables against schemas
nexus audit coverage              — test coverage across all modules
nexus audit performance           — latency distribution, bottlenecks
nexus audit laws                  — law compliance report
nexus audit memory                — memory usage, stale data, compaction opportunities
nexus audit report                — full audit report (writes to versionium)
```

---

## 18. AGENT CONTROL & CUSTOMIZATION PANEL

### 18.1 What the Panel Is

Full agent management — customize behavior, view live execution, adjust routing, test profiles. CLI-first. Cockpit renders the same data.

### 18.2 Agent Status Dashboard

```
nexus agent list                  — all agents with status (healthy/unavailable), usage, success rate
nexus agent status <agent>        — detailed status: health, current calls, queue depth, last error
nexus agent calls [--agent ollama] — live agent call queue
nexus agent history <agent> [n]   — last N calls with prompts/responses (truncated)
```

### 18.3 Agent Profile Management

**Profiles are live, editable JSON.** Edit via CLI → immediately affects next routing decision.

```
nexus agent profile show <agent>           — current profile
nexus agent profile edit <agent>           — open in $EDITOR or cockpit editor
nexus agent profile set <agent> <key> <val>  — set single field
nexus agent profile reset <agent>          — reset to default profile
nexus agent profile compare <a> <b>        — diff two agent profiles
nexus agent profile test <agent> <prompt>  — test agent with custom prompt (dry-run, shows context packet)
```

### 18.4 Sub-Role Management

```
nexus agent role list <agent>              — list available roles (architect/debugger/etc)
nexus agent role assign <agent> <role>     — set default role for routing type
nexus agent role weights                   — show routing map (intent → role)
nexus agent role weights set <intent> <agent> <role>  — set routing rule
```

### 18.5 Routing Control

```
nexus raid route simulate <intent>         — show routing decision without executing
nexus raid weights                         — current weight table
nexus raid override <agent> <priority>     — temporary override (resets after restart)
nexus raid blacklist <agent>               — remove from routing (until cleared)
nexus raid history                         — routing decision history
```

### 18.6 Context Packet Inspector

```
nexus agent context show <call-uuid>       — show full context packet sent for call
nexus agent context template <agent> <role>  — show default context template
nexus agent context memory <intent>        — show what memory would be injected for intent
nexus agent context beg <intent>           — show BEG fragment that would be used
```

---

## 19. COMPLETE JAA TABLE REFERENCE

### Foundation
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `event_log` | bus-log | type, tick, causedBy, source, payload_summary | event.schema.json |
| `agent_signatures` | cobalt-registry | cobalt_id, file, agent, layer, reads[], writes[] | cobalt.schema.json |
| `shape_samples` | shape-sampler | sigma, delta, slope, oscillation, snr, tick, module | shape.schema.json |
| `failures` | any module | source, operation, error, stack, causedBy, ts | failure.schema.json |
| `toasts` | any module | type, module, message, causedBy, actions[], autoClose, ts | toast.schema.json |
| `cli_history` | cli.js | command, args, flags, output, exitCode, durationMs, session | — |
| `law_violations` | kernel/law-watcher | law, module, description, severity, ts | — |
| `boot_records` | boot.js | phase, status, detail, ts, duration | — |

### Gate / Healer
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `gaps` | gate/gap-finder | type, path, body, severity, status, attempts, causedBy, createdAt | gap.schema.json |
| `artifacts` | gate/runner | type, file_path, hash, pipeline_id, gate_id, ts | artifact.schema.json |
| `healer_log` | healer/index | gap_path, fix_applied, depth, agent, success, error, attempt, ts | healer-log.schema.json |
| `fix_map` | memory/fix-map | gap_path, gap_type, fix_description, success_count, failure_count | fix-map.schema.json |

### Agent / Call
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `agent_calls` | brainos / agents | agent_id, model, prompt, response, tokens_in/out, duration_ms, routedTo, status | callto.schema.json |
| `active_traces` | orion/record | callto_id, service, regime, features, session_events | — |
| `bridge_messages` | compartment/bus | source, target, type, payload, sampled | — |
| `requests` | guardian/siphon | agent, intent, content, status, tags, compartment, ts | guardian-request.schema.json |
| `usage_log` | core/usage | agent, tokens_in, tokens_out, cost_estimate, duration_ms, ts | — |

### Memory
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `memory_index` | memory/agent-memory | tier, content, tags, score, stability{}, expires_at | memory-index.schema.json |
| `memory_queries` | crystalball/mql | query_intent, lanes_fired, items_used[], trace_id | — |
| `crystals` | memory/crystal | statement, confidence, age_ms, support_count, fragility, state, stabilityScore | crystal.schema.json |
| `bep_patterns` | crystalball/bep-engine | intent_hash, intent, behavior_graph, metrics{} | bep-pattern.schema.json |
| `cortex_memory` | cortex.js | content, agent, session, tags, ts | — |
| `delta_records` | core/delta | agent_uuid, response_uuid, similarity_to_prev[], surprise_score, novel_terms[] | delta.schema.json |
| `seam_records` | memory/seam | intent_uuid, provider_a, provider_b, agreement_zones[], disagreement_zones[], verified | seam.schema.json |

### Signal / Lattice
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `signal_composites` | signal-topology | composite_type, channels[], confidence, species, ts | — |
| `pendulum_signals` | pendulum/bridge | signal_id, profile, forced, antiphase, confidence | — |
| `stream_frames` | stream/manager | frame_id, stream_id, window_id, inference, anomaly | — |
| `snr_records` | foundation/topo-wire | source_id, gate_scores{}, posterior, passed, fail_reason | — |
| `ime_profiles` | foundation/ime-wire | uuid, event_type_counts{}, baseline_hash, anomaly_count | — |
| `trust_scores` | foundation/ime-wire | uuid, score, event_count, last_anomaly_ts | — |
| `lattice_nodes` | memory/lattice-index | term, termCount, lastSeen, sourceUuids[] | — |
| `lattice_edges` | memory/lattice-index | term_a, term_b, coCount, weight, ts | — |
| `trajectory_sessions` | core/trajectory | session_id, person_id, samples[], attractors[], bifurcations[], ts | — |

### Versionium
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `versionium_commits` | versionium/index | commit_id, parent_id, branch, tick, message, file_count, author | versionium.schema.json |
| `versionium_objects` | versionium/index | object_id, commit_id, file_path, hash | — |
| `versionium_calendar` | versionium/index | date, commit_ids[], summary | — |
| `versionium_file_index` | versionium/index | file_path, commit_ids[] | — |
| `versionium_branches` | versionium/index | branch_name, head_commit_id, diverged_from, status | — |

### Automation / Queue
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `schedules` | automation/engine | name, trigger{}, steps[], enabled, last_run | schedule.schema.json |
| `workflow_runs` | automation/engine | workflow_id, status, steps[], result, duration_ms | — |
| `queue_items` | automation/queue-manager | queue_id, type, priority, depends_on[], status | build-queue.schema.json |
| `nas_transfer_log` | nas/router | route_id, command, remote_id, duration_ms, status | nas-remote.schema.json |

### Guardian / Chat
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `chat_sessions` | guardian/siphon | session_uuid, provider, instance_id, started_at | guardian-chat.schema.json |
| `chat_messages` | guardian/siphon | msg_uuid, session_uuid, role, text, provider, ts | guardian-chat.schema.json |
| `chat_completions` | guardian/siphon | completion_uuid, session_uuid, text, complete, causedBy | guardian-chat.schema.json |
| `guardian_nodes` | guardian/pulse | instance_id, last_seen, capabilities[], health_score, tabCount | guardian-chat.schema.json |
| `guardian_health` | guardian/watchman | connected, listener_count, session_count, health_score, stale_nodes[] | guardian-health.schema.json |

### Idearium
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `ideas` | idearium/index | uuid, text, tags[], phase, tension, causedBy, parentIdea, linkedSpec | idearium-spec.schema.json |
| `specs` | idearium/spec-builder | uuid, name, sections[]{complete,checklist[]}, modules[], wired{}, buildOrder | idearium-spec.schema.json |
| `divergence_records` | idearium/divergence | subject_uuid, before_snapshot, after_snapshot, sigma, delta{} | — |
| `projects` | idearium/index | uuid, name, spec_uuid, phase, gate_progress{}, open_gaps[] | — |

### Causal Playground
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `playground_runs` | causal-playground/test-runner | run_uuid, gate_uuid, env, status, passed, failed, duration_ms | playground.schema.json |
| `test_results` | causal-playground/test-runner | run_uuid, file, assertion, passed, expected, actual | — |
| `env_configs` | causal-playground/env-manager | name, servers{}, dbs{}, config{}, last_modified | — |
| `playground_events` | causal-playground/index | type, run_uuid, causedBy, payload, ts | — |

### Intelligence / Cognition
| Table | Owner | Key Fields | Schema |
|---|---|---|---|
| `intent_nodes` | core/intent | uuid, text, intentHash, callCount, successRate, preferredAgent, associatedCrystals[] | intent-node.schema.json |
| `intent_edges` | core/intent | from_uuid, to_uuid, weight, ts | — |
| `self_model` | core/self-model | creativityIndex, dominantIntentClusters[], constraintPatterns[], systemHealth{} | self-model.schema.json |
| `orion_sessions` | orion/* | callto_id, status, regime, features, verified | — |
| `causality_nodes` | causal-nexus/causality | event_uuid, caused_by, children[], depth, ts | causality.schema.json |


---

## 20. COMPLETE SCHEMA REGISTRY

Every schema below is AJV-validated. All required before the corresponding module is built.

### 20.1 Schema Status Table

| Schema | File | Status | Owner Module | Notes |
|---|---|---|---|---|
| cobalt.schema.json | schemas/cobalt.schema.json | ✅ BUILT | cobalt-registry | The backbone. gapContract required. |
| module.schema.json | schemas/module.schema.json | ✅ BUILT | all modules | subscribes, publishes, invariants, expectedFlows, cli[] |
| module.gate.json | schemas/module.gate.json | ✅ BUILT | gate/runner | Example instance |
| behavior.schema.json | schemas/behavior.schema.json | ✅ BUILT | healer | trigger→expects→onViolation model |
| behavior.gate-healer.json | schemas/behavior.gate-healer.json | ✅ BUILT | healer | Concrete behavior contract instance |
| event.schema.json | schemas/event.schema.json | ✅ BUILT | siso.js | Immutable, minimal |
| manifest.schema.json | schemas/manifest.schema.json | ✅ BUILT | core/manifest | temp:const:0 enforced |
| gap.schema.json | schemas/gap.schema.json | ✅ BUILT | gate/gap-finder | type enum, severity, status |
| versionium.schema.json | schemas/versionium.schema.json | ✅ BUILT | versionium | Commit/Branch/FileVersion/Bottleneck |
| shape.schema.json | schemas/shape.schema.json | ✅ BUILT | shape-sampler | sigma/delta/slope/snr/compat |
| causality.schema.json | schemas/causality.schema.json | ✅ BUILT | causal-nexus | causeChain/effectChain/depth |
| schedule.schema.json | schemas/schedule.schema.json | ✅ BUILT | automation/engine | 6 trigger types |
| build-queue.schema.json | schemas/build-queue.schema.json | ✅ BUILT | queue-manager | gate.waitForEvents/waitForItems |
| crystal.schema.json | schemas/crystal.schema.json | ⚠️ RECONCILE | memory/crystal | Must add: statement, confidence, age_ms, support_count, fragility, state |
| bep-pattern.schema.json | schemas/bep-pattern.schema.json | ✅ BUILT | bep-engine | behaviorGraph.steps/invariants |
| rewind.schema.json | schemas/rewind.schema.json | ✅ BUILT | versionium | tied to module enum — update when modules added |
| nas-remote.schema.json | schemas/nas-remote.schema.json | ✅ BUILT | nas/router | SSH key from env, not plaintext |
| plugin.schema.json | schemas/plugin.schema.json | ✅ BUILT | plugin-system | extends module.schema.json |
| intent.schema.json | schemas/intent.schema.json | ✅ BUILT | translation | IR parse shape only — rename intent-ir.schema.json |
| callto.schema.json | schemas/callto.schema.json | 🔴 EMPTY | agents/callto | CRITICAL — must be filled before callto build |
| **intent-node.schema.json** | schemas/intent-node.schema.json | 🔴 BUILD | core/intent | Separate from intent-ir. See §14.1 |
| **idearium-spec.schema.json** | schemas/idearium-spec.schema.json | 🔴 BUILD | spec-builder | spec sections, modules[], checklist[], wired{} |
| **delta.schema.json** | schemas/delta.schema.json | 🔴 BUILD | core/delta | delta_records table schema |
| **seam.schema.json** | schemas/seam.schema.json | 🔴 BUILD | memory/seam | seam_records table schema |
| **guardian-chat.schema.json** | schemas/guardian-chat.schema.json | 🔴 BUILD | guardian/siphon | chat_sessions, chat_messages, completions, nodes |
| **guardian-health.schema.json** | schemas/guardian-health.schema.json | 🔴 BUILD | guardian/watchman | guardian_health table |
| **guardian-request.schema.json** | schemas/guardian-request.schema.json | 🔴 BUILD | guardian/siphon | request log from Mastermind.md |
| **memory-index.schema.json** | schemas/memory-index.schema.json | 🔴 BUILD | memory/agent-memory | memory_index table with tiers + stability metrics |
| **self-model.schema.json** | schemas/self-model.schema.json | 🔴 BUILD | core/self-model | creativityIndex, clusters, constraints, openQuestions |
| **toast.schema.json** | schemas/toast.schema.json | 🔴 BUILD | any module | toasts table — LAW VI enforcement |
| **failure.schema.json** | schemas/failure.schema.json | 🔴 BUILD | any module | failures table — structured failures |
| **artifact.schema.json** | schemas/artifact.schema.json | 🔴 BUILD | gate/runner | artifacts table |
| **healer-log.schema.json** | schemas/healer-log.schema.json | 🔴 BUILD | healer | healer_log table |
| **fix-map.schema.json** | schemas/fix-map.schema.json | 🔴 BUILD | memory/fix-map | fix_map table |
| **playground.schema.json** | schemas/playground.schema.json | 🔴 BUILD | causal-playground | playground_runs, env_configs |
| **snr-record.schema.json** | schemas/snr-record.schema.json | 🔴 BUILD | foundation/topo-wire | snr_records table |

### 20.2 callto.schema.json (CRITICAL — fill before callto build)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Callto Request",
  "type": "object",
  "required": ["uuid", "agent_id", "prompt", "status", "routedTo", "causedBy", "ts"],
  "properties": {
    "uuid":        { "type": "string" },
    "agent_id":    { "type": "string", "description": "agent profile id: ollama | claude | chatgpt | guardian-claude | guardian-chatgpt" },
    "role":        { "type": "string", "enum": ["architect", "debugger", "reviewer", "optimizer", "adversarial", "default"] },
    "model":       { "type": "string" },
    "prompt":      { "type": "string", "minLength": 1 },
    "context_packet": { "type": ["object", "null"] },
    "response":    { "type": ["string", "null"] },
    "status":      { "type": "string", "enum": ["pending", "processing", "delivered", "complete", "failed", "timeout"] },
    "routedTo":    { "type": "string" },
    "routingReason": { "type": "string" },
    "tokens_in":   { "type": ["integer", "null"] },
    "tokens_out":  { "type": ["integer", "null"] },
    "duration_ms": { "type": ["integer", "null"] },
    "retryCount":  { "type": "integer", "default": 0 },
    "failureContext": { "type": ["string", "null"] },
    "causedBy":    { "type": ["string", "null"] },
    "intentUuid":  { "type": ["string", "null"] },
    "sessionId":   { "type": ["string", "null"] },
    "source":      { "type": "string" },
    "ts":          { "type": "integer" },
    "startedAt":   { "type": ["integer", "null"] },
    "completedAt": { "type": ["integer", "null"] }
  }
}
```

### 20.3 crystal.schema.json (RECONCILE — merge MCL fields with v8.0 table definition)

The existing crystal.schema.json contains MCL (Memory Crystallization Layer) fields. The JAA `crystals` table needs both the MCL metadata AND the Mastermind.md belief fields. The reconciled schema must include all of:

**From Mastermind.md / JAA table definition:** `statement`, `confidence`, `ageMs`, `supportCount`, `sourceUuids[]`, `fragility`, `state`  
**From existing crystal.schema.json:** `coreEventId`, `stabilityScore`, `crossLaneCount`, `recurrenceHalfLife`, `feedbackAlignment`, `causalIntegration`, `contradictionScore`, `accessCount`, `promotedAt`, `createdAt`

The reconciled schema treats `statement` + `confidence` + `fragility` + `state` as the user-facing belief model, and the MCL fields as the computational substrate. Both are required.

### 20.4 .nex File Format (v8.0 — adds schemaVersions)

```json
{
  "version": "8.0.0",
  "uuid": "nex-uuid",
  "ts": 1716123456789,
  "tick": 8472,
  "source": "snapshot-daemon | cli | gate-complete",
  "causedBy": "event-uuid | null",
  "schemaVersions": {
    "crystals":     "1.1.0",
    "agent_calls":  "1.0.0",
    "gaps":         "1.0.0",
    "memory_index": "1.0.0"
  },
  "tables": {
    "crystals":        { "rows": [], "rowCount": 23 },
    "gaps":            { "rows": [], "rowCount": 2 },
    "agent_signatures":{ "rows": [], "rowCount": 31 }
  },
  "meta": {
    "systemHealth": { "ollamaAvailable": true, "guardianConnected": false, "activeGaps": 2 },
    "gitHead": "vtm-abc12345",
    "branch": "main",
    "sigmaAtSnapshot": 0.18,
    "latentState": { "valence": 0.6, "arousal": 0.3, "suppression": 0.1, "coherence": 0.85, "engagement": 0.7 },
    "triggeredBy": "sigma_spike | cli | gate_complete | interval"
  }
}
```

`schemaVersions` is required in v8.0. When replaying a .nex file, the JAA migration layer checks each table's `schemaVersions` entry against the current schema. Version mismatch → migration attempted → if migration fails → gap.found.

---

## 21. COMPLETE DIRECTORY STRUCTURE

```
nexus/
├── boot.js                         — entry point, deterministic boot sequence (§4.2)
├── config.json                     — runtime configuration (port, paths, agent models)
├── config/
│   ├── raid-weights.json           — agent routing weights
│   ├── agent-profiles/             — per-agent behavioral profiles
│   │   ├── ollama.json
│   │   ├── claude.json
│   │   ├── chatgpt.json
│   │   └── gemini.json
│   └── profiles/                   — NSM service profiles
│       ├── dev.json
│       └── prod.json
│
├── foundation/
│   ├── siso.js                     — SISO event bus + ALK kernel (§2.1)
│   ├── poll-registry.js            — module lifecycle (§2.4)
│   ├── cobalt-registry.js          — auto-registration (§2.5)
│   ├── shape-sampler.js            — sigma/delta/slope/snr (§2.6)
│   ├── bus-log.js                  — event_log writer (§2.7)
│   ├── topo-wire.js                — SNR pipeline bridge (§9.6)
│   └── ime-wire.js                 — behavioral profile builder (§9.7)
│
├── causal-nexus/
│   ├── sigma/index.js              — regime classifier
│   ├── delta/index.js              — divergence engine
│   └── causality/index.js         — causedBy chain walker
│
├── core/
│   ├── raid/
│   │   ├── index.js                — routing engine (§5.1)
│   │   ├── learner.js              — behavioral gravity learning
│   │   ├── weights.js              — agent weight table
│   │   └── fallback.js            — fallback chain logic
│   ├── manifest/
│   │   └── index.js               — manifest builder + schema validator (§5.2)
│   ├── translation/
│   │   ├── index.js               — intent translation (§5.3)
│   │   ├── learner.js
│   │   └── alignment.js
│   ├── usage/
│   │   └── index.js               — token/usage tracking (§5.4)
│   ├── signal/
│   │   ├── signal-topology.js     — composite state engine (§9.1)
│   │   ├── latent-model.js        — 5D Bayesian state model (§9.2)
│   │   └── suppression-score.js  — divergence/suppression detector (§9.3)
│   ├── trajectory/
│   │   ├── trajectory-recorder.js — session path recorder (§9.4)
│   │   └── attractor-landscape.js — cross-session topology (§9.5)
│   ├── delta/
│   │   └── index.js               — surprise scoring (§8.5)
│   ├── intent/
│   │   └── index.js               — intent graph (§14.1)
│   ├── bep/
│   │   └── index.js               — BEP triple engine (§14.2)
│   └── self-model.js              — rolling self-portrait (§14.3)
│
├── gate/
│   └── gap-finder.js              — gap detection (§6.1)
│
├── healer/
│   └── index.js                   — self-healing loop (§6.2)
│
├── agents/
│   ├── base.js                    — agent base class (§7.1)
│   ├── index.js                   — dispatcher
│   ├── ollama/
│   │   └── index.js               — local LLM (§7.2)
│   ├── claude/
│   │   └── index.js               — API Claude
│   ├── chatgpt/
│   │   └── index.js               — API ChatGPT
│   └── callto/
│       └── index.js               — Guardian tab dispatch (§7.3)
│
├── memory/
│   ├── jaa-db.js                  — JAA database (§2.2)
│   ├── agent-memory.js            — memory index writer (§8.1)
│   ├── lattice-index.js           — associative word lattice (§8.2) BUILT
│   ├── crystal.js                 — belief crystallizer (§8.3)
│   ├── seam.js                    — multi-AI merger (§8.4)
│   └── fix-map.js                 — gap→fix knowledge base (§8.6) BUILT
│
├── orion/
│   ├── sensor.js                  — measure stage (§11.1) BUILT
│   ├── record.js                  — record stage (§11.2) BUILT
│   ├── policy.js                  — policy stage (§11.3) BUILT
│   ├── verify.js                  — verify stage (§11.4) BUILT
│   └── ext.js                     — multi-provider coordinator (§11.5)
│
├── versionium/
│   └── index.js                   — causal version control (§12.1) BUILT
│
├── guardian/
│   ├── siphon.js                  — chat ingestion (§10.2)
│   ├── pulse.js                   — mesh topology (§10.3)
│   ├── watchman.js                — health monitor (§10.4)
│   └── extension/                 — Chrome extension source (§10.1)
│       ├── manifest.json
│       ├── background.js
│       ├── content.js
│       ├── ir-layer.js
│       ├── app.js
│       ├── handshake.js
│       ├── cfr.js
│       └── modules/
│           ├── base-module.js
│           ├── chatgpt.js
│           ├── claude.js
│           ├── threads.js
│           └── instagram.js
│
├── idearium/
│   ├── index.js                   — idea OS core (§13.2)
│   ├── spec-builder.js            — guided spec creation (§13.3)
│   ├── tension.js                 — tension scoring (§13.4)
│   ├── divergence.js              — snapshot diffing (§13.5)
│   ├── readme-gen.js              — README from JAA state (§13.6)
│   └── changelog-gen.js           — CHANGELOG from versionium (§13.7)
│
├── automation/
│   ├── engine.js                  — schedule/workflow runner (§15.1) BUILT
│   └── queue-manager.js           — priority queue (§15.2) BUILT
│
├── causal-playground/
│   ├── index.js                   — sandbox lifecycle (§16.3)
│   ├── env-manager.js             — environment config CRUD
│   ├── test-runner.js             — causality-linked test execution
│   ├── server-manager.js          — per-server start/stop/health
│   └── db-manager.js             — multi-engine DB management
│
├── service/
│   ├── boot-kernel.js             — bridge-boot-kernel port for NEXUS
│   ├── nsm.js                     — NSM v2.0 cross-platform service manager
│   ├── nexus-service.js           — node-windows wrapper
│   ├── nexus-svc.js               — watchdog + Windows service
│   ├── nexus-diag.js              — standalone diagnostic (§17.2)
│   ├── crash-prompt.js            — crash recovery handler (§4.6)
│   ├── stack-runner.js            — coordinated stack start
│   ├── testenv-runner.js          — PHP/MySQL/Apache/Redis manager
│   └── registry/
│       ├── bridge.json
│       ├── nexus-stack.json
│       ├── ollama.json
│       └── testenv.json
│
├── cockpit/                       — admin UI (read-only view of CLI state)
│   ├── index.html                 — entry point
│   ├── app.js                     — React SPA
│   ├── panels/
│   │   ├── debug-panel.js         — system diagnostic + causal debugger (§17)
│   │   ├── agent-panel.js         — agent control + customization (§18)
│   │   ├── idearium-panel.js      — Idearium / spec builder
│   │   ├── versionium-panel.js    — version history + timeline
│   │   ├── memory-panel.js        — crystals + BEP patterns + lattice
│   │   ├── guardian-panel.js      — Guardian connection + chat sessions
│   │   ├── signal-panel.js        — latent state + signal topology
│   │   └── playground-panel.js   — test environment management
│   └── components/
│       ├── toast-stream.js        — live toast feed (SSE)
│       ├── jaa-inspector.js       — JAA table browser
│       ├── causal-tree.js         — causedBy tree visualizer
│       └── cli-panel.js           — embedded CLI shell
│
├── schemas/
│   ├── *.schema.json              — all schemas (see §20.1)
│   └── examples/
│       └── module.gate.json       — example module instance
│
├── agents/
│   └── chatgpt/                   — ChatGPT agent profiles (§7.4)
│       ├── architect.json
│       ├── debugger.json
│       ├── reviewer.json
│       ├── optimizer.json
│       ├── adversarial.json
│       ├── agent-routing-map.json
│       └── chatgpt-runtime-behavior.json
│
├── test/
│   ├── runner.js                  — zero-dependency test runner
│   ├── foundation/
│   ├── core/
│   ├── gate/
│   ├── healer/
│   └── integration/
│
└── data/                          — runtime data (not committed)
    ├── *.jsonl                    — JAA table files (one per table)
    ├── logs/
    │   ├── nexus.log
    │   ├── nexus-error.log
    │   └── service-metrics.jsonl  — NSM structured metrics
    ├── snapshots/                 — .nex snapshot files
    │   └── *.nex
    ├── profiles/                  — person attractor landscapes
    └── crash-report.json          — last crash report (if any)
```

---

## 22. COMPLETE CLI COMMAND REFERENCE

Format: `nexus <module> <command> [args] [--flags]`

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus status                        — full system status dashboard
nexus health                        — quick health check (all services)
nexus shell                         — enter NEXUS REPL (live toast + completions)
nexus watch <table>                 — live tail JAA table
nexus snapshot                      — write .nex snapshot now
nexus snapshot list                 — list all snapshots
nexus snapshot restore <file>       — restore from .nex
nexus reset --confirm               — wipe runtime data (keeps config)
nexus version                       — show version + build hash
nexus upgrade                       — pull + restart with zero-downtime

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SERVICE (NSM)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus service install [name]
nexus service uninstall [name]
nexus service start [name|all]
nexus service stop [name|all]
nexus service restart [name]
nexus service status [name|all]
nexus service logs [name] [--level error] [--follow]
nexus service metrics [name] [--since <iso>]
nexus service watchdog [name]
nexus service profile [dev|prod]
nexus service build-exe [name] [--target win-x64]
nexus service list

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RAID / ROUTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus raid status
nexus raid route <intent>           — simulate routing
nexus raid weights
nexus raid weights set <agent> <w>
nexus raid override <agent> <pri>
nexus raid blacklist <agent>
nexus raid history [n]
nexus raid reset

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus agent list
nexus agent status <agent>
nexus agent calls [--agent <id>]
nexus agent history <agent> [n]
nexus agent profile show <agent>
nexus agent profile edit <agent>
nexus agent profile set <agent> <key> <val>
nexus agent profile reset <agent>
nexus agent profile compare <a> <b>
nexus agent profile test <agent> <prompt>
nexus agent role list <agent>
nexus agent role assign <agent> <role>
nexus agent role weights
nexus agent role weights set <intent> <agent> <role>
nexus agent context show <call-uuid>
nexus agent context template <agent> <role>
nexus agent context memory <intent>
nexus agent context beg <intent>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CALLTO (Guardian dispatch)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus callto status
nexus callto dispatch <agent> <prompt>
nexus callto dispatch <agent> <prompt> --parallel  — send to both Claude + ChatGPT
nexus callto history [n]
nexus callto cancel <uuid>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OLLAMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus ollama status
nexus ollama models
nexus ollama use <model>
nexus ollama pull <model>
nexus ollama test <prompt>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus gap list [--severity high] [--status open]
nexus gap show <uuid>
nexus gap ignore <uuid> --reason "..."
nexus gap stats
nexus gap close <uuid>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEALER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus healer status
nexus healer retry <gap-uuid> [--depth 3] [--agent ollama]
nexus healer escalate <gap-uuid>
nexus healer history [n]
nexus healer fix-map list
nexus healer fix-map add <path> <fix>
nexus healer fix-map show <path>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEMORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus memory search <q>
nexus memory index [q]
nexus memory cortex [q]
nexus memory forget <uuid>
nexus memory tier <uuid> <tier>     — promote/demote memory item tier
nexus memory stats

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRYSTAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus crystal list [--state stable]
nexus crystal show <uuid>
nexus crystal search <term>
nexus crystal age
nexus crystal dissolve <uuid> --reason "..."
nexus crystal promote <uuid>       — manually promote candidate to stable

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERSIONIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus versionium status
nexus versionium log [n]
nexus versionium show <commit-id>
nexus versionium chain <uuid>
nexus versionium diff <a> <b>
nexus versionium checkout <id>
nexus versionium branch <name>
nexus versionium merge <branch>
nexus versionium calendar <date>
nexus versionium replay <from> <to> [--mode fork|dry-run|live]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
IDEA / SPEC (Idearium)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus idea add "..."
nexus idea list [--phase expanding]
nexus idea show <uuid>
nexus idea link <uuid> <uuid>
nexus idea tension <uuid>
nexus idea spec <uuid>
nexus idea search <term>
nexus idea tree

nexus spec new <idea-uuid>
nexus spec show <uuid>
nexus spec section <uuid> <section-id>
nexus spec check <uuid>
nexus spec build <uuid>
nexus spec list [--complete]
nexus spec export <uuid>
nexus spec audit <uuid>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INTENT / COGNITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus intent list [--sort callCount]
nexus intent show <uuid>
nexus intent search <term>
nexus intent graph

nexus self
nexus self history [n]
nexus self diff <a> <b>
nexus self constraints
nexus self questions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SIGNAL / LATENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus signal state                  — current 5D latent state
nexus signal composites             — active composite states
nexus signal history [n]            — recent state transitions
nexus signal trust <source>         — trust score for source UUID
nexus signal snr <source>           — SNR posterior for source

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GUARDIAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus guardian status
nexus guardian nodes
nexus guardian sessions [n]
nexus guardian chat <session-uuid>  — show chat messages for session
nexus guardian health

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ORION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus orion list [n]                — recent ORION sessions
nexus orion show <uuid>             — full session detail
nexus orion seam <uuid>             — seam detail for session
nexus orion retry <uuid>            — re-run ORION pipeline for session

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLAYGROUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus playground run <spec-uuid> [--env php]
nexus playground env list
nexus playground env create <name>
nexus playground env start <name>
nexus playground env stop <name>
nexus playground env snapshot <name>
nexus playground env restore <name> <snap>
nexus playground db import <env> <file>
nexus playground db export <env>
nexus playground status
nexus playground logs <env> [--follow]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIAGNOSTICS / AUDIT / DEBUG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus diag
nexus diag --watch
nexus diag --json
nexus diag --guardian
nexus diag module <id>
nexus diag table <name>
nexus diag laws
nexus diag schema <name>

nexus debug trace <uuid>
nexus debug chain <uuid>
nexus debug replay <from> <to>
nexus debug diff <uuid-a> <uuid-b>
nexus debug module <id>
nexus debug agent <call-uuid>
nexus debug gap <uuid>
nexus debug law <violation-uuid>

nexus audit friction
nexus audit gaps
nexus audit schemas
nexus audit coverage
nexus audit performance
nexus audit laws
nexus audit memory
nexus audit report

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
USAGE / COST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus usage status
nexus usage reset
nexus usage report [--since 7d]
nexus usage limit set <agent> <tokens/hour>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTOMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus automation list
nexus automation show <uuid>
nexus automation create
nexus automation run <uuid>
nexus automation pause <uuid>
nexus automation history <uuid>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORGE (compile / build / export)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus forge build <spec-uuid>       — run full gate pipeline
nexus forge compile <target>        — electron | apk | web | docker
nexus forge package <name>          — package project as distributable
nexus forge keys generate           — generate crypto keypair
nexus forge keys rotate             — rotate active keypair
nexus forge sign <file>             — sign artifact with active key
nexus forge verify <file>           — verify artifact signature

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
README / CHANGELOG
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
nexus readme generate <spec-uuid>
nexus readme update <uuid>
nexus changelog generate [--since <date>]
nexus changelog entry add "..."
```

---

## 23. FULL EVENT / PIPELINE FLOW (v8.0)

```
USER INPUT
    │
    ▼ CLI command captured
    ├── event_log insert: { type: 'cli.command', ... }
    ├── toast.info "processing..."
    │
    ▼ Translation (§5.3)
    ├── event_log insert: { type: 'translation.started', ... }
    ├── Ollama (LAW I): intent disambiguation
    ├── intent-node lookup/create
    ├── BEG retrieval (§A1) — familiar intent → reconstruct, novel → generate
    │
    ▼ RAID routing (§5.1)
    ├── LAW I evaluation: Ollama → Guardian → API
    ├── agent_call insert: { status: 'pending', routedTo, intentUuid, ... }
    ├── event_log insert: { type: 'raid.routed', agent, reason }
    ├── toast.agent PURPLE "dispatched to [agent]"
    │
    ▼ Agent execution
    ├── Memory injection (5 tiers)
    ├── Context packet assembled
    ├── event_log insert: { type: 'agent.call.started', callUuid }
    ├── [if Guardian callto] → GUARDIAN_EXECUTE_INTENT → browser tab
    ├── [if ollama] → POST http://localhost:11434/api/chat
    ├── [if API] → Anthropic/OpenAI API
    │
    ▼ Response received
    ├── agent_call update: { status: 'complete', response, tokens, duration_ms }
    ├── cortex_memory insert
    ├── event_log insert: { type: 'agent.response.received', ... }
    ├── toast.success GREEN "response received"
    │
    ▼ Delta engine (§8.5)
    ├── Surprise score computation
    ├── delta_records insert
    ├── [if surprise > 0.7] → shape_samples insert (sigma spike)
    ├── [if surprise < 0.1] → gap.found (stuck loop)
    │
    ▼ [if parallel callto] Seam (§8.4)
    ├── Sibling completions detected (same causedBy)
    ├── Structural diff computed
    ├── seam_records insert
    ├── Orion-ext picks up for ORION quality gate
    │
    ▼ ORION pipeline (§11)
    ├── Sensor: group events by calltoId
    ├── Record: persist session with seam
    ├── Policy: apply trust scores, check agreement coverage
    ├── Verify: seam.verified=true | rejected
    │
    ▼ Crystal check (§8.3)
    ├── Verified seams → crystal promotion evaluation
    ├── [if crystal formed] → crystals insert, toast.crystal TEAL
    ├── BEP-engine: bep_patterns update
    ├── Intent-map: intent_nodes update
    │
    ▼ Versionium (§12)
    ├── [if sigma spike] → auto-commit
    ├── versionium_commits insert
    │
    ▼ Gap finder (§6.1) — runs continuously in parallel
    ├── Scans all tables for deviations
    ├── [if gap found] → gaps insert, toast.gap RED
    │
    ▼ Healer (§6.2) — runs continuously in parallel
    ├── Reads open gaps
    ├── Applies fix_map
    ├── Injects failure context
    ├── [if healed] → toast.success GREEN
    ├── [if exhausted] → toast.error RED, escalate to human
    │
    ▼ Self-model (§14.3) — hourly
    ├── Reads delta_records, intent_nodes, ime_profiles, bep_patterns
    ├── Updates creativityIndex, constraintPatterns, openQuestions
    ├── self_model insert
    │
    ▼ .nex snapshot — every 2s
    ├── Triggered by snapshot-daemon OR cli OR gate-complete
    ├── snapshots/[timestamp].nex written
    ├── toast.snapshot GREY
```

---

## 24. PHASE MAP (Build Order v8.0)

**Rule:** Nothing is built until its schema exists and its dependencies are complete.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRE-BUILD (schemas — ~8 hours total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
P0.1  Fill callto.schema.json                    CRITICAL (30 min)
P0.2  Reconcile crystal.schema.json              CRITICAL (30 min)
P0.3  Create intent-node.schema.json             (20 min)
P0.4  Create idearium-spec.schema.json           (1 hr)
P0.5  Create delta.schema.json                   (20 min)
P0.6  Create seam.schema.json                    (20 min)
P0.7  Create guardian-chat.schema.json           (30 min)
P0.8  Create guardian-health.schema.json         (15 min)
P0.9  Create guardian-request.schema.json        (20 min)
P0.10 Create memory-index.schema.json            (20 min)
P0.11 Create self-model.schema.json              (20 min)
P0.12 Create toast.schema.json                   (15 min)
P0.13 Create failure.schema.json                 (15 min)
P0.14 Create artifact.schema.json                (15 min)
P0.15 Create healer-log.schema.json              (15 min)
P0.16 Create fix-map.schema.json                 (15 min)
P0.17 Create playground.schema.json              (20 min)
P0.18 Create snr-record.schema.json              (15 min)
P0.19 Rename intent.schema.json → intent-ir      (5 min)
P0.20 Add schemaVersions to .nex spec            (10 min)
P0.21 Add Ollama agent profiles to agents/       (1 hr)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — FOUNDATION (load order 1)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1.1   memory/jaa-db.js                  ✅ BUILT
1.2   foundation/siso.js (ALK kernel)   needs port + merge
1.3   foundation/bus-log.js             needs JAA
1.4   foundation/cobalt-registry.js     needs JAA + siso
1.5   foundation/shape-sampler.js       needs JAA + causal-nexus
1.6   foundation/poll-registry.js       needs all of above
1.7   boot.js (deterministic sequence)  needs poll-registry
1.8   service/nsm.js                    ✅ EXISTS (from NSSM folder)
1.9   service/nexus-diag.js             ✅ EXISTS (from NSSM folder)
1.10  service/boot-kernel.js            adapt from bridge-boot-kernel.js
1.11  cli.js (base CLI parser)          needs cobalt-registry for dynamic commands
1.12  admin server (:3748 + SSE)        needs JAA + siso
1.13  toast emission layer              needs admin server + JAA

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — CORE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2.1   causal-nexus/delta/index.js        (§8.5 — surprise scoring)
2.2   causal-nexus/causality/index.js    (chain walker)
2.3   causal-nexus/sigma/index.js        (regime classifier)
2.4   core/usage/index.js                (token tracking)
2.5   core/manifest/index.js             (temp:0 enforced)
2.6   core/translation/index.js          (intent IR)
2.7   core/raid/index.js                 (LAW I routing)
2.8   core/raid/learner.js               (behavioral gravity)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 3 — GATE / HEALER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3.1   gate/gap-finder.js                 ✅ EXISTS (adapt v5 from Infrastructure)
3.2   healer/index.js                    (failure context injection)
3.3   memory/fix-map.js                  ✅ BUILT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 4 — AGENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4.1   agents/base.js                     (context packet assembly)
4.2   agents/ollama/index.js
4.3   agents/claude/index.js
4.4   agents/chatgpt/index.js
4.5   agents/callto/index.js             (Guardian dispatch)
4.6   agents/index.js                    (dispatcher)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 5 — MEMORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5.1   memory/agent-memory.js            (stability metrics)
5.2   memory/lattice-index.js           ✅ BUILT
5.3   memory/crystal.js                 (after crystal.schema.json reconciled)
5.4   memory/seam.js                    (after seam.schema.json)
5.5   core/delta/index.js               (delta engine, sigma spike trigger)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 6 — SIGNAL (ALK ports)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
6.1   foundation/topo-wire.js
6.2   foundation/ime-wire.js
6.3   core/signal/latent-model.js       (port from ALK, recontextualize)
6.4   core/signal/signal-topology.js    (port from ALK, recontextualize)
6.5   core/signal/suppression-score.js  (port from ALK, recontextualize)
6.6   core/trajectory/trajectory-recorder.js
6.7   core/trajectory/attractor-landscape.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 7 — ORION + VERSIONIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
7.1   orion/sensor.js                   ✅ EXISTS (Infrastructure)
7.2   orion/record.js                   ✅ EXISTS (Infrastructure)
7.3   orion/policy.js                   ✅ EXISTS (Infrastructure)
7.4   orion/verify.js                   ✅ EXISTS (Infrastructure)
7.5   orion/ext.js                      (multi-provider coordinator)
7.6   versionium/index.js               ✅ BUILT

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 8 — GUARDIAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
8.1   guardian/siphon.js
8.2   guardian/pulse.js
8.3   guardian/watchman.js
8.4   guardian/extension/*              (Chrome extension — adapt existing)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 9 — IDEARIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
9.1   idearium/index.js
9.2   idearium/spec-builder.js          (requires idearium-spec.schema.json)
9.3   idearium/tension.js
9.4   idearium/divergence.js
9.5   idearium/readme-gen.js
9.6   idearium/changelog-gen.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 10 — COGNITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
10.1  core/intent/index.js
10.2  core/bep/index.js
10.3  core/self-model.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 11 — AUTOMATION + PLAYGROUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
11.1  automation/engine.js              ✅ BUILT
11.2  automation/queue-manager.js       ✅ BUILT
11.3  causal-playground/index.js
11.4  causal-playground/test-runner.js
11.5  causal-playground/env-manager.js
11.6  causal-playground/server-manager.js
11.7  causal-playground/db-manager.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 12 — LAW II MIGRATION (G-V5-01)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
12.1  Audit all modules for kernel.emit() calls
12.2  Replace each with JAA insert + polling pattern
12.3  law-watcher module (enforces §M2 at runtime)
12.4  Verify 0 law_violations in law_violations table

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 13 — COCKPIT UI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
13.1  Admin server SSE stream (toasts, event_log live tail)
13.2  cockpit/panels/debug-panel.js     (system diag + causal debugger)
13.3  cockpit/panels/agent-panel.js     (agent control + customization)
13.4  cockpit/panels/idearium-panel.js
13.5  cockpit/panels/versionium-panel.js
13.6  cockpit/panels/memory-panel.js
13.7  cockpit/panels/guardian-panel.js
13.8  cockpit/panels/signal-panel.js    (latent state visualizer)
13.9  cockpit/panels/playground-panel.js
13.10 cockpit/components/toast-stream.js (live RED/GREEN/AMBER toast feed)
13.11 cockpit/components/cli-panel.js   (embedded NEXUS shell)
13.12 cockpit/components/jaa-inspector.js
13.13 cockpit/components/causal-tree.js

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 14 — FORGE (compiler + IDE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
14.1  forge/index.js                   — gate pipeline runner
14.2  forge/compiler.js                — Electron / APK / Web builder
14.3  forge/crypto.js                  — full crypto suite
14.4  forge/ide.js                     — dual-pane IDE + AI code editing
```

---

## 25. OPEN GAPS (v8.0 Inherited + New)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL (BLOCK BUILD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G-S-01   callto.schema.json is empty
         BLOCKS: agents/callto, ORION pipeline, Guardian routing, seam detection
         FIX: fill per §20.2 (30 min)

G-S-02   crystal.schema.json mismatched with JAA table definition
         BLOCKS: memory/crystal.js, BEP engine, Self-model
         FIX: reconcile per §20.3 (30 min)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIGH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G-S-03   intent.schema.json conflates IR parse and intent graph node
         BLOCKS: core/intent/index.js, self-model openQuestions
         FIX: rename to intent-ir.schema.json, create intent-node.schema.json

G-S-04   12 JAA tables have no schema (see §20.1 table — all 🔴 BUILD rows)
         BLOCKS: schema validation at runtime, AJV row enforcement
         FIX: 8 hours pre-build schema work total

G-V5-01  Existing modules still use kernel.emit/on for coordination (LAW II violation)
         BLOCKS: full LAW II compliance
         FIX: Phase 12 migration — audit + replace with JAA poll pattern
         Note: dual-mode period acceptable until Phase 12

G-B-10   boot.js Phase 5 to 7 may start agents before gate/healer is live
         BLOCKS: first agent calls in a fresh boot may be ungated
         FIX: boot sequence Phase 7 (gate/healer) must complete before Phase 8 (agents start)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEDIUM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G-NX-01  .nex snapshots do not yet carry schemaVersions
         BLOCKS: safe replay of old .nex on schema upgrade
         FIX: add schemaVersions field per §20.4

G-NX-02  No Ollama agent profile in agents/ollama/
         Only ChatGPT profiles exist. LAW I (Ollama first) has no profile contract.
         FIX: Create agents/ollama/profiles/ mirroring agents/chatgpt/ structure

G-NX-03  toast.schema.json does not exist
         BLOCKS: AJV validation of toast rows, cockpit toast feed schema enforcement
         FIX: Create per §20.1

G-NX-04  Law-watcher module not specified
         BLOCKS: runtime LAW II and LAW VI enforcement
         FIX: foundation/law-watcher.js — polls agent_signatures for undeclared table writes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G-NX-05  rewind.schema.json tied to module enum — needs update when modules added
         FIX: replace static enum with dynamic lookup from agent_signatures

G-NX-06  No NEXUS port alias for port 3748 in all existing service registry files
         FIX: update service/registry/*.json to use 3748

G-NX-07  ALK signal modules use browser-context (IndexedDB, MediaPipe landmarks)
         Recontextualization to NEXUS system metrics context is specified (§9.1-9.5)
         but not yet implemented. No blocker — purely new work.
```

---

## 26. THINGS FROM ALK TO KEEP (First Principles Extraction)

The ALK codebase is a behavioral signal runtime designed for person-observation. After first-principles extraction, here is what maps cleanly to NEXUS and what doesn't:

### KEEP — Direct port, high value:
| ALK Component | NEXUS Use | File |
|---|---|---|
| `kernel.js` — Lattice, Ring Buffer, Gate Registry, Clock, Pattern matching | Core SISO event fabric. The kernel is domain-agnostic and maps 1:1. | `foundation/siso.js` |
| `siso.js` — SISOBus, StreamLog, compilePattern | Event bus with audit trail. Already NEXUS-compatible. | `foundation/siso.js` |
| `jaa-browser.js` — JaaStore (FNV-1a content-addressed), JaaRefs | Content-addressing for artifacts and memory. The hash model is correct. | `memory/jaa-db.js` extensions |
| `modules/signal/latent-model.js` — Extended Kalman filter, 5D state, observation noise | Recontextualize dimensions to system health (§9.2). Algorithm is solid. | `core/signal/latent-model.js` |
| `modules/signal/signal-topology.js` — Composite state scoring, SignalWindow decay | Recontextualize to system metrics inputs. Scoring math is correct. | `core/signal/signal-topology.js` |
| `modules/signal/suppression-score.js` — 3-stream evidence fusion | Recontextualize to agent output vs memory state divergence. | `core/signal/suppression-score.js` |
| `modules/trajectory/trajectory-recorder.js` — k-means attractor detection, bifurcations | Behavioral gravity basins for RAID routing. Algorithm direct-port. | `core/trajectory/trajectory-recorder.js` |
| `modules/trajectory/attractor-landscape.js` — Cross-session topology, attractor depth | Persistent routing attractor model. Port directly. | `core/trajectory/attractor-landscape.js` |
| `modules/gap-hunter.js` — 6 gap detection domains (weak assumptions, shadow field, etc.) | Recontextualize from verbal/behavioral to system module gaps. The detection taxonomy is brilliant. | `gate/gap-finder.js` (extend) |
| `modules/behavior/behavior-module.js` — 10 detection domains, event surface contract | The §5.7 and §K6 patterns (zero direct calls, all via events) are the Module Contract. | All modules |

### RECONTEXTUALIZE (keep the math, change the inputs):
| ALK Component | Current Input | NEXUS Input |
|---|---|---|
| Latent dimensions | Face/voice/body landmarks | Gap density, latency, success rate, surprise score |
| Signal topology composites | Facial expressions, posture, gaze | Agent retry rate, confidence curve, output divergence |
| Suppression score | Micro-expression vs face overlay | Agent output confidence vs failures table |
| Trajectory | 5D person latent state over session | 5D system health state over session |
| GapHunter: shadow field | What person avoids saying | What modules never report (dead listeners) |
| GapHunter: negative space | Topic orbit without landing | Intent nodes called many times, never crystallized |

### DISCARD — Domain-specific to person-observation, no NEXUS equivalent:
| ALK Component | Why discard |
|---|---|
| `modules/video/` — WebRTC, MediaPipe, codec | Video processing pipeline. NEXUS has no camera input. |
| `modules/cfr/alk-gl.js` — WebGL2 particle field | Visualization engine for face-tracking. No equivalent need. |
| `modules/expression/expression-engine.js` | Facial blendshape analysis. NEXUS has no face input. |
| `modules/text/text-module.js` | Speech transcription pipeline (ASR). Different domain. |
| `modules/mesh/alk-mesh.js` | LAN mesh for multi-device person tracking. No NEXUS equivalent. |
| `modules/htl/htl.js` | HTL (Head Tilt Logic). Face geometry. Discard. |
| `mic.html`, `video-demo.html` | Demo UIs. Discard. |
| `DEPLOY.md` | ALK deployment instructions. Replace with NEXUS service install. |

### NEW (from SELFFORM + behavioral gravity not in ALK):
| Concept | Where it goes |
|---|---|
| BEG (Behavioral Execution Geometry) | `core/raid/learner.js` + `memory/bep` — reconstruct paths not generate |
| Behavioral gravity (success attractor) | `core/raid/index.js` — route toward successful execution basins |
| Agent as render function (not role) | `agents/base.js` — agents reconstruct from BEG, not prompt-match |
| Memory as phase field | `memory/crystal.js` — raw_trace → compressed_beg → crystal → decay |
| Failure = field distortion | `healer/index.js` + `gate/gap-finder.js` — recompute geometry, don't patch |

---

## 27. CONSTRAINTS (HARD LIMITS)

```
ChatGPT output token limit: ~13,000 tokens per response
  → Split large spec sections into < 8,000 token files before dispatch
  → gate runner handles splitting via spec file gating (one file per gate)
  → Never send full spec in one prompt — use gate file per spec section

Claude output: context-limited, metered
  → LAW I: Ollama first. Claude only when Ollama cannot provide capability.
  → Guardian-Claude (browser tab) before API-Claude (token cost)

Gemini: high hallucination rate on code generation
  → Not used for code. Can be used for ideation only (explicitly tagged).
  → agent profile for Gemini sets role=ideation, code generation disabled.

NEXUS output budget: 32,000 tokens per manifest (configurable)
  → Usage module enforces. Over budget → queue + dequeue after reset.

4TB NAS storage: available for cortex memory, .nex snapshots, session recordings
  → nas-remote.schema.json provides SSH routing
  → NAS sync via automation engine schedule (daily backup, real-time for .nex)

Port conflicts: NEXUS on 3748, Bridge OS on 3747. Never overlap.
  → Enforced in saveSettings() and boot.js Phase 0.

No external runtime dependencies in core modules (§5.5)
  → exception: Ollama binary (local), Node.js stdlib only in core
  → JAA uses fs, path, crypto — all stdlib
```

---

## 28. RESONANCE ENGINE (from resonance-engine-v2)

The Resonance Engine provides conversation pattern scoring — comparing conversations or agent outputs for alignment, drift, and gap bridging. In NEXUS context: measures miscommunication between the user and agents, and alignment between parallel agent outputs (feeds Seam module).

**From resonance-engine/src:**
```
scoring.ts      — resonance scoring (shared context + weight decay + SNR)
extractor.ts    — IDL extraction (heuristic + LLM)
drift/drift.ts  — drift detection (oscillation, slope)
feed/scorer.ts  — feed scoring for ranked output
ase/signature.ts — Associative Signature (ASE) — unique behavioral fingerprint per source
idl/           — IDL axes, dynamics, modes, types (interaction pattern vocabulary)
```

**What to keep:**
- **ASE (Associative Signature Engine):** `signature.ts` — builds a behavioral fingerprint per source UUID. Port to `core/signal/ase.js`. Used by IME-wire + trust_scores.
- **Drift detection:** `drift.ts` — oscillation + slope model feeds `shape_samples` (snr + slope fields already match).
- **Resonance scoring:** Maps to the gap-bridging communication analysis from the original Mastermind.md request. Port to `memory/resonance.js` — scores inter-agent and user-agent communication alignment.
- **IDL vocabulary:** The interaction pattern taxonomy (axes, dynamics, modes) provides the vocabulary for `behavior.schema.json` flow descriptions and `bep_patterns` intent taxonomy.

**Port targets:**
```
resonance-engine/src/ase/signature.ts   → core/signal/ase.js
resonance-engine/src/trajectory/       → core/trajectory/ (supplements ALK trajectory)
resonance-engine/src/resonance/scoring.ts → memory/resonance.js
resonance-engine/src/extraction/       → core/translation/ (intent extraction improvement)
```

---

## 29. EDITING THIS DOCUMENT

This spec is a living document. It lives in the `specs` JAA table as a spec record (see §13.3). Every edit is a versionium commit. Every section has a `complete` boolean and a `checklist[]`.

**To edit a section:**
```
nexus spec section <spec-uuid> <section-id>  — opens in $EDITOR or cockpit spec editor
```

**To check what's missing:**
```
nexus spec check <spec-uuid>  — runs all checklist items, shows incomplete
```

**To see what changed:**
```
nexus versionium chain <spec-uuid>  — full causal history of this spec
nexus versionium diff <commit-a> <commit-b>  — what changed between versions
```

**To add a new module to this spec:**
1. Add its entry to §21 (Directory Structure)
2. Add its COBALT record to §2.5 pattern
3. Add its JAA tables to §19
4. Add its CLI commands to §22
5. Add its schemas to §20.1
6. Add its build step to §24
7. Add its failure modes to §25 (if applicable)
8. Run: `nexus spec check <this-spec-uuid>` — must show 0 missing

**Sections that are automatically generated (do not hand-edit):**
- §19 JAA table reference → generated from `agent_signatures` COBALT.reads/writes
- §22 CLI command reference → generated from `agent_signatures` COBALT.cli[]
- §24 Phase map → generated from `specs` table buildOrder
- §25 Open gaps → generated from `gaps` table (open status)

Everything else is hand-maintained and versioned.

