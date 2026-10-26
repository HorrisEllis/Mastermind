# NEXUS — Mastevos Extension Master Index
**Spec set version:** 1.0.0  
**Mastevos base:** v8.0  
**Date:** 2026-05-26  
**Total new modules:** 15  
**Total new JAA tables:** 20  
**Total new schemas:** 6 (3 BUILD · 2 RECONCILE · 1 BUILT)

---

## SPEC FILES IN THIS SET

| File | Layer | Modules covered |
|---|---|---|
| `spec-guardian-layer.md` | Guardian | Siphon · Pulse · Watchman |
| `spec-signal-layer.md` | Signal | Topo-wire · IME-wire · Delta-engine |
| `spec-memory-layer.md` | Memory | Lattice-index · Crystal · Seam |
| `spec-cognition-layer.md` | Cognition | Callto-executor · Orion-ext · BEP-engine · Intent-map |
| `spec-meta-layer.md` | Meta | Self-model · Cortex v2 |

Read the spec file for a layer before implementing any module in that layer. Every spec file contains: exact JAA table schemas, COBALT declarations, poll intervals, toast contracts, failure modes, CLI output formats, and inter-module data flows. Nothing is left abstract.

---

## CANONICAL MODULE REGISTRY

| # | Module | File | Layer | Boot phase | Poll interval | Status |
|---|---|---|---|---|---|---|
| 1 | Siphon | `guardian/siphon.js` | guardian | 11 | 2s | 🔴 BUILD |
| 2 | Pulse | `guardian/pulse.js` | guardian | 11 | 3s | 🔴 BUILD |
| 3 | Watchman | `guardian/watchman.js` | guardian | 11 | 5s | 🔴 BUILD |
| 4 | Topo-wire | `foundation/topo-wire.js` | foundation | 10 | 1.5s | 🔴 BUILD |
| 5 | IME-wire | `foundation/ime-wire.js` | foundation | 10 | 2.5s | 🔴 BUILD |
| 6 | Delta-engine | `core/delta/index.js` | core | 10 | 2s | 🔴 BUILD |
| 7 | Lattice-index | `memory/lattice-index.js` | memory | 9 | 10s | ⚠️ VERIFY (§21 lists BUILT — confirm against this spec) |
| 8 | Crystal | `memory/crystal.js` | memory | 9 | 30s | 🔴 BUILD |
| 9 | Seam | `memory/seam.js` | memory | 9 | 5s | 🔴 BUILD |
| 10 | Callto-executor | `agents/callto/index.js` | agents | 8 | 2s | 🔴 BUILD |
| 11 | Orion-ext | `orion/ext.js` | orion | 14 | 5s | 🔴 BUILD |
| 12 | BEP-engine | `core/bep/index.js` | core | 14 | 15s | 🔴 BUILD |
| 13 | Intent-map | `core/intent/index.js` | core | 14 | 5s | 🔴 BUILD |
| 14 | Self-model | `core/self-model.js` | core | 15 | 1h | 🔴 BUILD |
| 15 | Cortex v2 | `core/cortex-v2.js` | core | 15 | — | 🔴 BUILD |

---

## NEW JAA TABLES — COMPLETE MANIFEST

All 20 tables must be added to `ALL_TABLES` in `memory/jaa-db.js` **before PHASE 3 boot**. PHASE 3 opens append streams for every declared table. A missing entry causes boot failure for the module that tries to write to it.

### `memory/jaa-db.js` — ALL_TABLES patch

Find the existing `ALL_TABLES` array (or equivalent constant) and append:

```javascript
// ── GUARDIAN LAYER ──────────────────────────────────────────
'chat_sessions',       // guardian/siphon.js     — one row per AI conversation UUID
'chat_messages',       // guardian/siphon.js     — one row per conversation turn
'chat_completions',    // guardian/siphon.js     — one row per complete AI response
'guardian_nodes',      // guardian/pulse.js      — one row per Guardian instance (upserted)
'guardian_health',     // guardian/watchman.js   — one row per 5s health check

// ── SIGNAL LAYER ────────────────────────────────────────────
'snr_records',         // foundation/topo-wire.js — SNR gate scores + Bayesian posterior
'ime_profiles',        // foundation/ime-wire.js  — behavioral profiles per source UUID
'trust_scores',        // foundation/ime-wire.js  — trust score per source UUID
'delta_records',       // core/delta/index.js     — surprise scores per agent response

// ── MEMORY LAYER ────────────────────────────────────────────
'lattice_nodes',       // memory/lattice-index.js — term frequency + source tracking
'lattice_edges',       // memory/lattice-index.js — term co-occurrence + NPMI weight
// 'crystals' already declared — no change needed
'seam_records',        // memory/seam.js          — multi-AI structural diff records

// ── COGNITION LAYER ─────────────────────────────────────────
// 'bep_patterns' already declared — no change needed
// 'orion_sessions' already declared — no change needed
'intent_nodes',        // core/intent/index.js    — semantic intent graph nodes
'intent_edges',        // core/intent/index.js    — sequential intent transitions

// ── META LAYER ──────────────────────────────────────────────
'self_model',          // core/self-model.js      — hourly system self-portrait
```

**Net new tables: 18.** `crystals`, `bep_patterns`, and `orion_sessions` already exist.

### Table → Module Ownership (single writer per table)

| Table | Single writer | Multiple readers |
|---|---|---|
| `chat_sessions` | guardian/siphon | Lattice-index, Crystal, Intent-map, Self-model |
| `chat_messages` | guardian/siphon | Lattice-index, Self-model |
| `chat_completions` | guardian/siphon | Seam, Callto-executor, Delta-engine |
| `guardian_nodes` | guardian/pulse | Watchman, Callto-executor, RAID |
| `guardian_health` | guardian/watchman | Callto-executor, Queue-manager, Self-model, Cockpit |
| `snr_records` | foundation/topo-wire | Self-model, Orion-ext, Healer, RAID |
| `ime_profiles` | foundation/ime-wire | Self-model |
| `trust_scores` | foundation/ime-wire | Self-model, Orion-ext policy stage |
| `delta_records` | core/delta | BEP-engine, Crystal (fragility), Self-model |
| `lattice_nodes` | memory/lattice-index | BEP-engine, Intent-map |
| `lattice_edges` | memory/lattice-index | Crystal, BEP-engine |
| `seam_records` | memory/seam | Orion-ext, Crystal, Self-model, Cortex v2 |
| `crystals` | memory/crystal | BEP-engine, Intent-map, Self-model, Cortex v2 `ask` |
| `bep_patterns` | core/bep | RAID (BEG reconstruction), Cortex v2 |
| `intent_nodes` | core/intent | Orion-ext, Self-model, Cortex v2 |
| `intent_edges` | core/intent | Cortex v2 `intent graph` |
| `self_model` | core/self-model | Cortex v2 `self`, Cockpit overview panel |
| `orion_sessions` | orion/* + orion/ext | Cortex v2 `orion` |

---

## SCHEMA STATUS CHECKLIST

All schemas must exist and pass AJV validation before any module writes data. Create schemas before starting module implementation.

| Schema file | Status | Used by | Action |
|---|---|---|---|
| `schemas/guardian-chat.schema.json` | 🔴 BUILD | Siphon (chat_sessions, chat_messages, chat_completions, guardian_nodes) | Create per spec-guardian-layer.md §SCHEMAS |
| `schemas/guardian-health.schema.json` | 🔴 BUILD | Watchman (guardian_health) | Create per spec-guardian-layer.md §SCHEMAS |
| `schemas/snr-record.schema.json` | 🔴 BUILD | Topo-wire (snr_records) | Create per spec-signal-layer.md §SCHEMAS |
| `schemas/delta.schema.json` | 🔴 BUILD | Delta-engine (delta_records) | Create per spec-signal-layer.md §SCHEMAS |
| `schemas/seam.schema.json` | 🔴 BUILD | Seam (seam_records) | Create per spec-memory-layer.md §SCHEMAS |
| `schemas/crystal.schema.json` | ⚠️ RECONCILE | Crystal (crystals) | Reconcile existing MCL schema + Mastermind.md fields per spec-memory-layer.md §SCHEMAS |
| `schemas/intent-node.schema.json` | 🔴 BUILD | Intent-map (intent_nodes) | Create per spec-cognition-layer.md §SCHEMAS |
| `schemas/self-model.schema.json` | 🔴 BUILD | Self-model (self_model) | Create per spec-meta-layer.md §SCHEMAS |
| `schemas/bep-pattern.schema.json` | ✅ BUILT | BEP-engine (bep_patterns) | No action — verify AJV registration |
| `schemas/callto.schema.json` | ✅ BUILT (§20.2) | Callto-executor (agent_calls) | No action — already referenced |

**Build order for schemas:**
1. guardian-chat + guardian-health (Siphon + Pulse + Watchman need them at PHASE 11 init)
2. snr-record + delta (Topo-wire + Delta-engine, PHASE 10)
3. seam + crystal reconcile (Memory layer, PHASE 9)
4. intent-node (Cognition layer, PHASE 14)
5. self-model (Meta layer, PHASE 15)

---

## BUILD ORDER — RECOMMENDED SEQUENCE

Build in dependency order. Each phase assumes all prior phases are complete and verified.

### Phase 0 — Schema infrastructure

Create all 🔴 BUILD schemas. Register all in AJV schema registry. Reconcile crystal schema. Verify bep-pattern and callto are registered.

Test: instantiate AJV with all schemas, call `ajv.validate(schemaId, {})` for each — expect validation errors (empty object fails) but no "schema not found" errors.

### Phase 1 — ALL_TABLES patch

Add all 18 new table names to `ALL_TABLES`. Restart NEXUS. Verify PHASE 3 logs show append streams opened for all 18.

Test: `jaaDB.insert('chat_sessions', { test: true })` — no "unknown table" error.

### Phase 2 — Guardian layer (PHASE 11)

Build order within layer:
1. `guardian/pulse.js` — standalone, reads event_log only
2. `guardian/siphon.js` — standalone, reads event_log only
3. `guardian/watchman.js` — reads guardian_nodes (Pulse must be running)

Test sequence:
- Start Pulse. Send synthetic heartbeat to `/guardian/heartbeat`. Verify `guardian_nodes` row created.
- Start Watchman. Verify `guardian_health` row written within 5s.
- Start Siphon. POST synthetic `guardian.chat.message` event to `/api/event`. Verify `chat_sessions` + `chat_messages` rows created.
- POST synthetic `guardian.chat.complete` event with `complete: true`. Verify `chat_completions` row created.
- Stop all heartbeats for 30s. Verify `gaps` row of type `stale_module` created by Pulse. Verify Watchman writes `connected: false` health row.

### Phase 3 — Signal layer (PHASE 10)

Build order within layer (all independent — can be built in parallel):
1. `foundation/topo-wire.js`
2. `foundation/ime-wire.js`
3. `core/delta/index.js`

Test sequence:
- Start Topo-wire. Insert synthetic `event_log` row of type `agent.response.received`. Within 1.5s verify `snr_records` row exists with `posterior` field.
- Start IME-wire. Insert 60 synthetic events from two source UUIDs. Verify `ime_profiles` rows exist for both. Verify `trust_scores` rows exist.
- Start Delta-engine. Insert 3 `cortex_memory` rows for same agent, then insert `agent.response.received` event. Verify `delta_records` row created with `surpriseScore`.
- Force surpriseScore > 0.7 (insert clearly different response text). Verify `shape_samples` row created with `sigma > 0.7`.

### Phase 4 — Memory layer (PHASE 9)

Build order within layer:
1. `memory/lattice-index.js` — reads memory_index only
2. `memory/seam.js` — reads chat_completions (from Phase 2 Siphon)
3. `memory/crystal.js` — reads lattice_edges + seam_records (both must be running)

Test sequence:
- Start Lattice-index. Insert 5 synthetic `memory_index` rows with overlapping content. Within 10s verify `lattice_nodes` + `lattice_edges` rows exist. Insert same co-occurring pair 5 times — verify `lattice.pattern.emerging` event emitted.
- Start Seam. Insert two synthetic `chat_completions` rows with same `causedByCallto` UUID. Within 5s verify `seam_records` row created with `agreementZones` and `disagreementZones`.
- Start Crystal. Verify after 30s: no crash. Insert seam_record with `verified: true` and high agreement. Within 60s verify `crystals` row created with `state: 'stable'`.

### Phase 5 — Cognition layer (PHASE 8 + PHASE 14)

Build order:
1. `agents/callto/index.js` (PHASE 8 — must start before cognition)
2. `core/intent/index.js` (PHASE 14)
3. `core/bep/index.js` (PHASE 14)
4. `orion/ext.js` (PHASE 14)

Test sequence:
- Start Callto-executor. Insert `agent_calls` row with `routedTo: 'guardian-claude'`, `status: 'pending'`. With Guardian disconnected: verify row updated to `status: 'failed'` with LAW I fallback logged. With Guardian connected: verify GUARDIAN_EXECUTE_INTENT event posted to `/api/event`.
- Start Intent-map. Insert 5 `agent_calls` rows with similar intent text. Verify they cluster to 1–2 `intent_nodes` rows (Jaccard > 0.6 → same cluster).
- Start BEP-engine. Ensure ≥1 stable crystal exists. Within 15s verify `bep_patterns` row created for that crystal.
- Start Orion-ext. Insert unverified `seam_record` row with `agreementCoverage: 0.72`. Within 5s verify `seam_records.verified = true` and `orion_sessions` row created with `status: 'verified'`.

### Phase 6 — Meta layer (PHASE 15)

Build order:
1. `core/self-model.js`
2. `core/cortex-v2.js`

Test sequence:
- Start Self-model. Run `nexus self refresh`. Verify `self_model` row created. Check `creativityIndex`, `systemHealth.crystalCount`, `openQuestions` populated correctly from test data.
- Start Cortex v2. Run `nexus memory search test`. Verify results from both `cortex_memory` and `memory_index`. Run `nexus ask test`. Verify crystals prepended. Run all new commands against test data — verify non-zero output and correct exit codes.

---

## BOOT PHASE INTEGRATION — FULL MAP

```
PHASE 3   JAA opens append streams for all 20 tables (ALL_TABLES must include all 18 new tables)
PHASE 8   Callto-executor   — agents/callto/index.js
PHASE 9   Lattice-index     — memory/lattice-index.js
          Seam              — memory/seam.js
          Crystal           — memory/crystal.js
PHASE 10  Topo-wire         — foundation/topo-wire.js
          IME-wire          — foundation/ime-wire.js
          Delta-engine      — core/delta/index.js
PHASE 11  Siphon            — guardian/siphon.js
          Pulse             — guardian/pulse.js
          Watchman          — guardian/watchman.js   (after Pulse)
PHASE 14  Intent-map        — core/intent/index.js
          BEP-engine        — core/bep/index.js
          Orion-ext         — orion/ext.js
PHASE 15  Self-model        — core/self-model.js
          Cortex v2         — core/cortex-v2.js
```

All phases are SOFT. Boot continues if any phase fails. A failed module writes to `boot_records` with `status: 'degraded'` and a `detail` field describing the failure.

---

## COBALT REGISTRY ADDITIONS

Add the following entries to `cobalt-registry.json` (or equivalent COBALT declaration store):

```json
[
  { "id": "guardian.siphon",     "file": "guardian/siphon.js",       "layer": "guardian",    "bootPhase": 11 },
  { "id": "guardian.pulse",      "file": "guardian/pulse.js",        "layer": "guardian",    "bootPhase": 11 },
  { "id": "guardian.watchman",   "file": "guardian/watchman.js",     "layer": "guardian",    "bootPhase": 11 },
  { "id": "foundation.topo-wire","file": "foundation/topo-wire.js",  "layer": "foundation",  "bootPhase": 10 },
  { "id": "foundation.ime-wire", "file": "foundation/ime-wire.js",   "layer": "foundation",  "bootPhase": 10 },
  { "id": "core.delta",          "file": "core/delta/index.js",      "layer": "core",        "bootPhase": 10 },
  { "id": "memory.lattice-index","file": "memory/lattice-index.js",  "layer": "memory",      "bootPhase": 9  },
  { "id": "memory.crystal",      "file": "memory/crystal.js",        "layer": "memory",      "bootPhase": 9  },
  { "id": "memory.seam",         "file": "memory/seam.js",           "layer": "memory",      "bootPhase": 9  },
  { "id": "agents.callto",       "file": "agents/callto/index.js",   "layer": "agents",      "bootPhase": 8  },
  { "id": "orion.ext",           "file": "orion/ext.js",             "layer": "orion",       "bootPhase": 14 },
  { "id": "core.bep",            "file": "core/bep/index.js",        "layer": "core",        "bootPhase": 14 },
  { "id": "core.intent",         "file": "core/intent/index.js",     "layer": "core",        "bootPhase": 14 },
  { "id": "core.self-model",     "file": "core/self-model.js",       "layer": "core",        "bootPhase": 15 },
  { "id": "core.cortex-v2",      "file": "core/cortex-v2.js",        "layer": "core",        "bootPhase": 15 }
]
```

---

## POLL-REGISTRY ADDITIONS

All poll-loop modules register with `poll-registry.js` at `init()`. Add the following registrations:

```javascript
// guardian layer
pollRegistry.register('guardian.siphon',      siphon.tick,      2000);
pollRegistry.register('guardian.pulse',       pulse.tick,       3000);
pollRegistry.register('guardian.watchman',    watchman.tick,    5000);

// signal layer
pollRegistry.register('foundation.topo-wire', topoWire.tick,    1500);
pollRegistry.register('foundation.ime-wire',  imeWire.tick,     2500);
pollRegistry.register('core.delta',           deltaEngine.tick, 2000);

// memory layer
pollRegistry.register('memory.lattice-index', latticeIndex.tick, 10000);
pollRegistry.register('memory.crystal',       crystal.tick,     30000);
pollRegistry.register('memory.seam',          seam.tick,        5000);

// agents layer
pollRegistry.register('agents.callto',        calltoExecutor.tick, 2000);

// cognition layer
pollRegistry.register('core.intent',          intentMap.tick,   5000);
pollRegistry.register('core.bep',             bepEngine.tick,   15000);
pollRegistry.register('orion.ext',            orionExt.tick,    5000);
```

Self-model uses `setInterval` directly (not poll-registry) because it runs hourly — poll-registry is designed for sub-60s loops.

---

## SHARED UTILITIES — COPY RULES (LAW III)

Several modules implement the same pure functions. LAW III forbids importing between modules. Each module that needs these functions copies them locally:

| Function | Used by | Copy from |
|---|---|---|
| `_tokenize(text)` | Lattice-index, Crystal, Seam, Delta-engine, Intent-map, BEP-engine, Self-model | `memory/lattice-index.js` (canonical) |
| `_termFrequency(tokens)` | Delta-engine, Seam, BEP-engine | `core/delta/index.js` |
| `_cosineSimilarity(tfA, tfB)` | Delta-engine, Seam, BEP-engine | `core/delta/index.js` |
| `_jaccardSimilarity(setA, setB)` | BEP-engine, Intent-map | `core/bep/index.js` |
| `_npmi(termA, termB, coCount)` | Lattice-index (internal) | — |
| `_intentHash(text)` | Intent-map, Cortex v2 | `core/intent/index.js` |

The STOPWORDS constant is also copied into each module that uses `_tokenize`. Keep in sync manually when extending.

**Why copy instead of a shared util module?**
LAW III: "No module imports from another module in the same system." A shared `utils.js` would violate this by creating a hidden dependency graph. Copying is the compliant pattern. If the functions diverge, that's intentional — each module can tune its own tokenization without affecting others.

---

## WATERMARK PATTERN — CANONICAL IMPLEMENTATION

Every poll-loop module that reads `event_log` uses this watermark pattern. It must be implemented identically in all modules to prevent double-processing and resume correctly after restart.

```javascript
// At module scope:
let _lastEventRowId = 0;

// In init():
async function init() {
  // Rebuild watermark from own output table
  // Each module uses its own last-written row to determine resume point
  const lastOwn = jaaDB.tail('<own_output_table>', 1)[0];
  if (lastOwn?.causedBy) {
    const sourceEvent = jaaDB.get('event_log', lastOwn.causedBy);
    if (sourceEvent?._rowId) _lastEventRowId = sourceEvent._rowId;
  }
  // If no prior output: _lastEventRowId = 0 → process all events from beginning
  // This is the correct cold-start behavior — it may be slow on first boot
  // but produces correct output.
}

// In tick():
async function tick() {
  const events = jaaDB.query('event_log',
    e => e._rowId > _lastEventRowId,
    BATCH_SIZE  // per-module constant
  );

  for (const event of events) {
    try {
      await _processEvent(event);
    } catch (err) {
      await jaaDB.insert('failures', {
        uuid: uid(), module: MODULE_ID,
        error: err.message, eventUuid: event.uuid, ts: Date.now()
      });
      _toast('toast.error', `${MODULE_ID}: processing error on ${event.type}: ${err.message}`, {});
    } finally {
      _lastEventRowId = Math.max(_lastEventRowId, event._rowId ?? 0);
    }
  }
}
```

Key invariants:
- Watermark advances in the `finally` block — even if processing fails, the watermark advances to prevent infinite retry on a bad event.
- `_lastEventRowId` starts at 0 on cold start — processes all historical events.
- Resume after restart: watermark rebuilt from own output table's `causedBy` field.
- Batch size cap per module: Siphon=200, Topo-wire=150, IME-wire=200, Delta-engine=50, Lattice-index=100, Seam=N/A (reads chat_completions not event_log), Crystal=N/A (reads seam_records + lattice_edges), Callto-executor=5, Intent-map=100, BEP-engine=50.

---

## NEW CLI COMMANDS — COMPLETE LIST

All commands accessible from the NEXUS CLI after Cortex v2 is built:

```
# Guardian layer
nexus guardian                          List connected Guardian instances
nexus guardian siphon status            Siphon ingestion stats
nexus guardian siphon sessions          List recent chat sessions
nexus guardian siphon messages <uuid>   Messages for a session
nexus guardian pulse status             Live Guardian node topology
nexus guardian pulse node <instanceId>  Heartbeat history for a node
nexus guardian watchman status          Current guardian health
nexus guardian watchman history         Health trend over time

# Signal layer
nexus snr status                        SNR pipeline stats
nexus snr source <uuid>                 Trust score for a source
nexus snr trust [--top] [--bottom]      Ranked trust scores
nexus snr drops [--n]                   Recent SNR drops
nexus ime profile <uuid>                Behavioral profile for a source
nexus ime trust <uuid>                  IME trust score for a source
nexus ime anomalies [--source]          Recent behavioral anomalies
nexus ime profiles                      All behavioral profiles
nexus delta status                      Delta-engine stats
nexus delta agent <uuid>                Per-agent delta records
nexus delta breakthroughs               High-surprise events (your intellectual history)
nexus delta creativity [--days]         Actual creativity index over N days

# Memory layer
nexus lattice status                    Lattice stats: node/edge counts, top terms
nexus lattice search <term>             Term neighbors by PMI weight
nexus lattice patterns                  Strongest term associations
nexus crystal list [--state]            List crystals by state
nexus crystal show <uuid>               Full crystal detail
nexus crystal search <term>             Find crystals by term
nexus crystal age                       Age distribution of beliefs
nexus seam list [--verified]            List seam records
nexus seam show <uuid>                  Full seam structural diff
nexus seam disagreements                Where AIs consistently diverge

# Cognition layer
nexus callto dispatch <agent> <prompt>  Dispatch to Guardian agent
nexus callto status                     Recent callto dispatches
nexus callto show <uuid>                Full callto detail
nexus orion [--status]                  ORION session history
nexus orion show <uuid>                 Full ORION session detail
nexus bep list [--layer]                BEP pattern triples
nexus bep show <uuid>                   Full BEP triple
nexus bep contradictions                Recent contradiction detections
nexus intent [<query>] [--sort]         Browse intent graph
nexus intent show <uuid>                Full intent node detail
nexus intent search <term>              Find intents by term
nexus intent graph                      ASCII force-directed intent graph
nexus intent unresolved                 Intents with no associated crystals

# Meta layer
nexus self                              Current system self-portrait
nexus self history [--n]                Self-model snapshots over time
nexus self refresh                      Force immediate recompute

# Extended existing commands (Cortex v2 fixes)
nexus ask <query>                       Search cortex + index + prepend crystals
nexus memory search <query> [--tags]    Multi-source memory search
nexus memory index [<query>]            Browse memory_index
nexus memory cortex [<query>]           Browse cortex_memory
nexus memory forget <uuid>              Soft-delete a memory entry
nexus versionium [--n]                  Commits (sigma spikes) newest first
nexus versionium chain <uuid>           Walk causal chain for any UUID
```

---

## EVENT TYPES — NEW EMISSIONS

These event types are new to the system. Any module polling `event_log` for patterns should be aware of them.

| Event type | Emitted by | Meaning |
|---|---|---|
| `guardian.heartbeat` | Guardian extension (existing) | Liveness probe |
| `guardian.chat.message` | Guardian extension (existing) | User message captured |
| `guardian.chat.response` | Guardian extension (existing) | Assistant response streaming |
| `guardian.chat.complete` | Guardian extension (existing) | Response fully complete |
| `guardian.node.dead` | guardian/pulse | Instance not seen for 120s |
| `guardian.listeners.lost` | guardian/watchman | Listener count dropped |
| `cobalt.resonance.guardian` | guardian/watchman | Guardian health state for cockpit |
| `cobalt.resonance.snr` | foundation/topo-wire | SNR signal passed for cockpit |
| `ime.profile.created` | foundation/ime-wire | New behavioral profile |
| `ime.anomaly.detected` | foundation/ime-wire | Unexpected event type from source |
| `delta.breakthrough` | core/delta | surpriseScore > 0.7 |
| `lattice.pattern.emerging` | memory/lattice-index | Co-occurrence threshold crossed |
| `seam.created` | memory/seam | Structural diff written |
| `seam.verified` | orion/ext | Seam passed Orion quality gate |
| `seam.rejected` | orion/ext | Seam failed Orion quality gate |
| `bep.contradiction.detected` | core/bep | New delta contradicts existing crystal |
| `GUARDIAN_EXECUTE_INTENT` | agents/callto | Dispatch command to Guardian |
| `callto.guardian.fallback` | agents/callto | Guardian unavailable, RAID fallback |
| `queue.guardian.fallback` | queue-manager | Queue item held pending Guardian |
| `self_model.updated` | core/self-model | Hourly self-model snapshot written |
| `memory.forgotten` | core/cortex-v2 | memory_index entry soft-deleted |

---

## TOAST VOCABULARY ADDITIONS

New toast types used by modules in this spec set. Must be registered in the toast handler before module init:

| Toast type | Color | Used by | Trigger |
|---|---|---|---|
| `toast.crystal` | TEAL | memory/crystal, core/self-model | Crystal formation, self-model write |
| `toast.agent` | PURPLE | agents/callto | Guardian dispatch sent/received |
| `toast.gap` | RED | guardian/pulse | Node stale/dead gap created |

All other toast types (`toast.info` BLUE, `toast.success` GREEN, `toast.warn` AMBER, `toast.error` RED) are existing types used as-is.

---

## COCKPIT IMPACT SUMMARY

These modules provide data to existing cockpit panels that have been empty or placeholder-only. No cockpit code changes required for any of them — they write to tables and event types the cockpit already polls.

| Cockpit panel | Previously empty | Now populated by |
|---|---|---|
| Guardian pill (connected/disconnected/degraded) | Guardian socket state only | Watchman `cobalt.resonance.guardian` SSE events |
| SNR display (`cobalt.resonance.*`) | Empty | Topo-wire `cobalt.resonance.snr` SSE events |
| BEP patterns tab | Empty | BEP-engine (`bep_patterns` first writer) |
| Versionium "Age of knowledge" sigma | Empty | Crystal writes `crystals`, Delta-engine writes `shape_samples` sigma spikes |
| Memory inspector (crystals, cortex, index) | Partial | Crystal + Siphon + Lattice-index all writing |
| Map panel sigma stream | Topo-kernel stubs | Topo-wire feeding full 8-gate pipeline |

---

## KNOWN LIMITATIONS AND DEFERRED WORK

These are known gaps in the current spec set — not defects, but explicitly deferred:

**1. Lattice compaction**
`lattice_nodes` and `lattice_edges` grow unboundedly. The watermark pattern prevents re-processing but does not deduplicate rows if multiple writes race. A compaction job (weekly, reads all rows, deduplicates, rewrites canonical rows) should be added in a future spec. Acceptable for now: JAA's append-only structure means older duplicate rows are simply superseded by newer rows with higher counts.

**2. IME profile compaction**
`ime_profiles` uses JAA `update` (append of new row with same UUID). Over time, many historical profile rows accumulate for each sourceId. A compaction pass (keep only latest per UUID) is deferred. Not functionally harmful — `jaaDB.get(uuid)` returns the latest row.

**3. Crystal garbage collection**
Crystals in `state: 'invalidated'` accumulate indefinitely (LAW §M1: everything stored). A reporting command (`nexus crystal gc --dry-run`) that shows invalidated crystals older than 30 days, without deleting them, is deferred.

**4. Intent graph rendering**
`nexus intent graph` is specified as ASCII force-directed layout. The rendering algorithm (Fruchterman-Reingold or equivalent, pure JS, no external deps) is not fully specified here. The CLI handler should produce a basic ranked-node list until the ASCII renderer is implemented.

**5. Multi-provider beyond claude + chatgpt**
Seam's sibling detection is designed for 2 providers. N-way merges (3+ providers in parallel) are not specified. This is an intentional simplification — Seam detects the first sibling pair only.

**6. topo-kernel stub mode**
If `topo-kernel` module is unavailable, Topo-wire falls back to a single-gate Bayesian accumulator. The stub is specified in this document. However: when topo-kernel becomes available and Topo-wire switches from stub to full mode, existing `snr_records` rows from stub mode will have `gateScores` with all 8 gates set to the same value (the raw snrValue). These rows remain valid — downstream modules use `posterior` which is computed correctly in both modes.

---

## QUICK REFERENCE — MODULE READS/WRITES

```
Siphon        reads: event_log                  writes: chat_sessions, chat_messages, chat_completions
Pulse         reads: event_log                  writes: guardian_nodes
Watchman      reads: guardian_nodes             writes: guardian_health
Topo-wire     reads: event_log                  writes: snr_records, shape_samples
IME-wire      reads: event_log                  writes: ime_profiles, trust_scores
Delta-engine  reads: event_log, cortex_memory,  writes: delta_records, shape_samples
                     chat_completions
Lattice-index reads: memory_index               writes: lattice_nodes, lattice_edges
Crystal       reads: delta_records, lattice_edges, writes: crystals
                     seam_records, memory_index
Seam          reads: chat_completions           writes: seam_records, memory_index
Callto-exec   reads: agent_calls,               writes: agent_calls, cortex_memory
                     guardian_nodes, guardian_health
Orion-ext     reads: seam_records, intent_nodes, writes: orion_sessions, seam_records
                     trust_scores
BEP-engine    reads: crystals, delta_records,   writes: bep_patterns
                     lattice_edges
Intent-map    reads: agent_calls, lattice_nodes, writes: intent_nodes, intent_edges
                     delta_records, crystals
Self-model    reads: delta_records, intent_nodes, writes: self_model
                     trust_scores, crystals,
                     gaps, guardian_health,
                     law_violations
Cortex v2     reads: all                        writes: failures, event_log (soft-delete marker)
```

All modules also write to: `toasts`, `failures`, `gaps`, `event_log` (as needed for their operational events).
