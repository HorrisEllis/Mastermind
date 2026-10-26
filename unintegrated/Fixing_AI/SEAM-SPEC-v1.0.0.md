# SEAM SPECIFICATION
## Level 3 — Executable Seam
**Version:** 1.0.0
**Date:** 2026-05-29
**UUID:** seam-spec-0000-2026-0529-v1
**Status:** `stable`

> A seam is a boundary where architecture, testing, planning,
> observability, and implementation collapse into a single artifact.

---

## WHAT A SEAM IS

A seam is not an interface.
An interface declares shape.
A seam declares shape, behaviour, build boundary, test, and runtime health —
as a single source artifact from which everything else is derived.

```
Interface         shape only
Contract          shape + behaviour
Seam              shape + behaviour + build boundary
Executable Seam   shape + behaviour + build boundary
                  + generated tests
                  + generated mocks
                  + metrics
                  + causal traceability
                  + mechanical acceptance criterion
```

The seam is the source. Mocks, tests, documentation, monitoring scaffolding —
all derived. When the seam changes, everything derived from it regenerates.
Three artifacts that drift apart (spec, implementation, tests) become one.

---

## THE SEAM OBJECT

```javascript
const SEAM = {
  // ── Identity ──────────────────────────────────────────────
  name:        string,      // SCREAMING_SNAKE_CASE, globally unique
  version:     semver,      // bumped on any breaking change
  status:      enum,        // draft | active | deprecated | retired
  between:     [string, string],  // [producer, consumer] — directional
  description: string,      // one sentence, no jargon

  // ── Contract ──────────────────────────────────────────────
  contract: {
    commands: {
      // Producer receives these. Consumer sends these.
      [name]: {
        payload:     Schema,   // declared shape, no optionals without defaults
        returns:     Schema,
        errors:      ErrorSchema[],
        idempotent:  boolean,  // safe to retry?
        timeout_ms:  number,
      }
    },
    events: {
      // Producer emits these. Consumer subscribes.
      [name]: {
        payload:   Schema,
        ordering:  enum,   // guaranteed | best-effort | none
      }
    },
  },

  // ── Isolation ─────────────────────────────────────────────
  isolation: {
    rules: string[],
    // e.g.
    // "Consumer cannot import Producer module directly"
    // "No shared mutable state across this boundary"
    // "All communication through this seam object only"
    verified_by: enum,   // lint | test | runtime | manual
  },

  // ── Metrics ───────────────────────────────────────────────
  metrics: {
    latency_p95_ms:     number,
    latency_p99_ms:     number,
    throughput_per_sec: number,
    error_rate_pct:     number,
    availability_pct:   number,
    // Seam is invalid if live metrics breach these thresholds.
    // A seam that returns correct data in 45 seconds is broken.
  },

  // ── Traceability ──────────────────────────────────────────
  traceability: {
    trace_id:     boolean,  // every crossing gets a UUID
    causal_chain: boolean,  // crossing appended to causal chain
    ledger:       boolean,  // crossing produces a ledger entry
    // Ledger entry shape:
    // { traceId, seamId, version, source, destination,
    //   timestamp, payloadHash, durationMs, outcome }
  },

  // ── Acceptance ────────────────────────────────────────────
  // All four must be true for batch to be complete.
  // "Batch complete" is mechanically verifiable, not a judgment call.
  acceptance: {
    contract_tests:     boolean,  // generated from contract schema
    isolation_verified: boolean,  // isolation rules pass
    mock_generated:     boolean,  // usable mock exists for both sides
    metrics_verified:   boolean,  // live metrics within declared thresholds
  },
};
```

---

## THE CONTRACT SECTION

### Commands

A command is a synchronous or async request from consumer to producer.

```javascript
commands: {
  "store.write": {
    payload: {
      key:   { type: "string",  required: true  },
      value: { type: "any",     required: true  },
      decay: { type: "DecayProfile", required: false, default: "permanent" },
    },
    returns: {
      ok:        { type: "boolean" },
      key:       { type: "string"  },
      ts:        { type: "number"  },
      version:   { type: "number"  },
    },
    errors: [
      { code: "STORE_FULL",    message: "Storage capacity exceeded"    },
      { code: "KEY_INVALID",   message: "Key format rejected by store" },
      { code: "WRITE_TIMEOUT", message: "Write exceeded timeout_ms"    },
    ],
    idempotent:  false,
    timeout_ms:  500,
  },

  "store.read": {
    payload: {
      key: { type: "string", required: true },
    },
    returns: {
      ok:    { type: "boolean" },
      value: { type: "any | null" },
      ts:    { type: "number | null" },
      stale: { type: "boolean" },
    },
    errors: [
      { code: "READ_TIMEOUT", message: "Read exceeded timeout_ms" },
    ],
    idempotent:  true,
    timeout_ms:  100,
  },
}
```

### Events

An event is a one-way signal from producer to consumer.
The producer does not wait for a response.

```javascript
events: {
  "store.written": {
    payload: {
      key:     { type: "string" },
      version: { type: "number" },
      ts:      { type: "number" },
    },
    ordering: "guaranteed",
  },

  "store.error": {
    payload: {
      key:   { type: "string" },
      code:  { type: "string" },
      error: { type: "string" },
    },
    ordering: "best-effort",
  },
}
```

---

## THE ISOLATION SECTION

Isolation rules are the invariants.
They say what cannot cross the boundary regardless of what the contract allows.

```javascript
isolation: {
  rules: [
    "Consumer cannot import Producer module directly",
    "Producer cannot call Consumer methods",
    "No shared mutable state across this boundary",
    "All communication through this seam object only",
    "Errors do not propagate — they are caught, logged, and emitted as events",
  ],
  verified_by: "test",
  // lint:    static analysis catches direct imports
  // test:    isolation test suite verifies no cross-boundary calls
  // runtime: gate enforces contract at every crossing
  // manual:  human review (weakest — upgrade when possible)
}
```

**The no-hidden-edges rule:**
Every dependency in the system must be a named seam.
If you cannot name it, you cannot test it, version it, or batch it.
A dependency that is not a seam is a coupling waiting to fail.

---

## THE METRICS SECTION

Metrics declare the operational contract — the behaviour thresholds
that must hold for the seam to be considered healthy at runtime.

```javascript
metrics: {
  latency_p95_ms:     100,   // 95% of crossings complete within 100ms
  latency_p99_ms:     250,   // 99% within 250ms
  throughput_per_sec: 1000,  // must sustain 1000 crossings/sec under load
  error_rate_pct:     0.1,   // no more than 0.1% of crossings produce errors
  availability_pct:   99.9,  // seam must be reachable 99.9% of the time
}
```

A seam that returns correct data in 45 seconds satisfies the contract.
It does not satisfy the metrics. It is broken.
Metrics are not monitoring configuration. They are part of the seam definition.
If a system cannot meet the declared metrics, the seam is wrong —
either the metrics are too aggressive or the implementation is inadequate.
Both are worth knowing before deployment.

---

## THE TRACEABILITY SECTION

Every seam crossing produces a ledger entry.

```javascript
traceability: {
  trace_id:     true,
  causal_chain: true,
  ledger:       true,
}
```

**Ledger entry — emitted on every crossing:**

```javascript
{
  traceId:      "uuid-v4",
  seamId:       "STORAGE_CONTRACT",
  seamVersion:  "1.0.0",
  source:       "cli-layer",
  destination:  "core-store",
  timestamp:    1234567890000,
  payloadHash:  "sha256-of-payload",
  durationMs:   14,
  outcome:      "ok" | "error" | "timeout",
  errorCode:    "WRITE_TIMEOUT" | null,
}
```

The ledger is append-only. Entries are never modified.

**What this produces automatically:**

A traversable causal graph across the entire system.
Debugging changes from "why is this broken?" to
"show me the seam crossings that produced this output."

```
Input
  ↓ [INGEST_SEAM   — traceId: abc, 12ms, ok]
Storage
  ↓ [RETRIEVAL_SEAM — traceId: abc, 8ms,  ok]
Ranker
  ↓ [RANKING_SEAM  — traceId: abc, 3ms,  ok]
Context
  ↓ [CONTEXT_SEAM  — traceId: abc, 1ms,  ok]
Output
```

Every arrow is a ledger entry. The chain is the trace.

---

## THE ACCEPTANCE SECTION

All four must be true. Batch is complete when all four are true.
Not "mostly done." Not "good enough." Four boolean checks.

```javascript
acceptance: {
  contract_tests:     true,   // generated test suite passes
  isolation_verified: true,   // isolation rules verified by declared method
  mock_generated:     true,   // usable mock exists and passes contract tests
  metrics_verified:   true,   // live metrics within declared thresholds
}
```

### What "contract_tests: true" means

Tests are generated from the contract schema, not written by hand.
For every command: generate valid payloads, verify returns match schema.
For every error case: generate inputs that should fail, verify correct error code.
For every event: emit, verify payload matches declared shape.

If the contract changes, tests regenerate.
Tests never drift from the contract.

### What "mock_generated: true" means

A mock is a runnable implementation of the seam that:
- accepts all declared commands
- returns valid schema-matching responses
- emits all declared events on schedule
- enforces isolation rules (rejects out-of-contract calls)
- does not depend on any real infrastructure

The mock is the test harness for the other side.
The consumer builds against the mock.
The producer tests against the mock.
Neither needs the other to be built first.

### What "isolation_verified: true" means

The declared verification method has been run and passed.
For `verified_by: "test"`: isolation test suite passes.
For `verified_by: "lint"`: static analysis passes.
For `verified_by: "runtime"`: gate enforcement is live.

### What "metrics_verified: true" means

The live system has been measured against declared thresholds.
Not estimated. Measured.
Load test at declared `throughput_per_sec`.
Measure p95, p99 latency.
Measure error rate over a representative sample.
All within thresholds → `metrics_verified: true`.

---

## SEAM HEALTH (runtime)

Seams are first-class runtime objects. Not just design artifacts.

```javascript
seam.health()

// returns:
{
  seamId:       "STORAGE_CONTRACT",
  version:      "1.0.0",
  status:       "healthy" | "degraded" | "breached" | "unknown",
  uptime_pct:   99.97,
  calls:        120483,
  errors:       12,
  error_rate:   0.009,
  latency_p95:  14,
  latency_p99:  38,
  last_failure: "2026-05-29T12:44:00Z",
  last_checked: "2026-05-29T14:00:00Z",

  thresholds: {           // from metrics section
    latency_p95_ms:     100,
    error_rate_pct:     0.1,
  },
  breached: [],           // which thresholds are currently exceeded
}
```

**Status rules:**
- `healthy`  — all metrics within thresholds, no isolation violations
- `degraded` — metrics approaching thresholds (within 20% of limit)
- `breached` — one or more metrics exceed declared thresholds
- `unknown`  — insufficient data to evaluate (new seam, no crossings yet)

A system-wide health endpoint aggregates all seam health objects.
One call shows which boundaries are degraded or breached.
No need to inspect logs.

---

## SEAM VERSIONING

Seams are versioned. Both sides declare which version they implement.

```
STORAGE_CONTRACT v1
CLI v1         ↕       Core v1

STORAGE_CONTRACT v2
CLI v2         ↕       Core v2

During migration:
CLI v2         ↕       Core v1   (v2 is backward-compatible with v1)
CLI v2         ↕       Core v2   (migration complete, v1 retired)
```

**Version bump rules:**
- Patch: add optional field, tighten metrics
- Minor: add new command or event (backward-compatible)
- Major: change payload shape, remove command, change error codes

When a major version is released, the old version enters `deprecated` status.
Both versions coexist until all consumers migrate.
Retired versions are preserved in the seam registry for replay and archaeology.

Most breaking changes happen because contracts are implicit.
Explicit versioned seams make every breaking change visible before it breaks anything.

---

## THE SEAM GRAPH

A stack implies linear dependency: A → B → C → D.
Real systems have lateral dependencies.
The ranker needs signals from the decay engine.
The promotion layer needs signals from both storage and retrieval.

```
        Decay ◄──────────┐
          │               │
          ▼               │
Storage ──► Ranker ──► Retrieval
    │           │
    ▼           ▼
  Promotion ◄──┘
```

Seam architecture works for graphs, not just stacks.
The requirement is not linearity.
The requirement is: **no hidden edges**.

Every edge in the graph is a named seam.
Every seam has a contract, isolation rules, metrics, traceability, acceptance.
The graph of seams is the complete dependency map of the system.
Nothing is implicit.

**Layers and seams are orthogonal views:**

```
Layers answer:   where does this live?   (vertical organisation)
Seams answer:    what depends on what?   (boundary organisation)
```

A seam can cut across layers.
`AUTH_SEAM` might span UI, API, and Core simultaneously.
That is not a layer violation.
It is a cross-cutting seam, valid as long as every edge is named.

---

## BUILD ORDER

The seam is declared before either side is built.
Implementation is the last step, not the first.

```
Step 1 — Declare the seam
  Write the seam object.
  No implementation exists yet.

Step 2 — Generate tests
  Run: seam.generateTests()
  Output: [seam-name].contract.test.js
  Tests are runnable immediately. Both sides fail. That is correct.

Step 3 — Generate mocks
  Run: seam.generateMock("producer")
  Run: seam.generateMock("consumer")
  Output: mock-[seam-name]-producer.js
          mock-[seam-name]-consumer.js

Step 4 — Build producer against consumer mock
  Producer can be built and tested in isolation.
  It builds against mock-consumer, not the real consumer.

Step 5 — Build consumer against producer mock
  Consumer can be built in parallel with Step 4.
  It builds against mock-producer, not the real producer.

Step 6 — Integrate
  Replace mocks with real implementations.
  Run contract tests against live integration.
  Measure metrics.

Step 7 — Verify acceptance
  contract_tests:     true
  isolation_verified: true
  mock_generated:     true
  metrics_verified:   true

  Batch complete.
```

Steps 4 and 5 are parallelisable.
The seam makes them independent.
For AI-assisted development: Steps 4 and 5 can be separate sessions
with separate context windows. The seam is the entire shared context needed.

---

## AI CONTEXT COMPRESSION

Without seams, AI-assisted development requires global system knowledge:

```
Context needed:  entire codebase
Failure mode:    hidden coupling, inconsistent state, ambiguous completion
```

With seams, context collapses to local knowledge:

```
Context needed:  current seam contract
                 + mock for the other side
                 + acceptance criteria
Failure mode:    seam quality (not AI capability)
```

The AI does not build "the storage layer."
It satisfies `STORAGE_CONTRACT v1`.
The work package is bounded by the seam.
The completion condition is mechanical.

AI capability scales with seam quality.
Good seams: clear contract, clear isolation, clear metrics, clear acceptance.
Bad seams: the AI fails for the same reason a human team would.

---

## FULL EXAMPLE

```javascript
const STORAGE_CONTRACT = {
  name:        "STORAGE_CONTRACT",
  version:     "1.0.0",
  status:      "active",
  between:     ["cli-layer", "core-store"],
  description: "Synchronous read/write interface between CLI and persistence layer",

  contract: {
    commands: {
      "store.write": {
        payload: {
          key:   { type: "string",  required: true  },
          value: { type: "any",     required: true  },
          decay: { type: "string",  required: false, default: "permanent" },
        },
        returns: {
          ok:      { type: "boolean" },
          key:     { type: "string"  },
          ts:      { type: "number"  },
          version: { type: "number"  },
        },
        errors: [
          { code: "STORE_FULL",    message: "Storage capacity exceeded"    },
          { code: "KEY_INVALID",   message: "Key format rejected by store" },
          { code: "WRITE_TIMEOUT", message: "Write exceeded timeout_ms"    },
        ],
        idempotent: false,
        timeout_ms: 500,
      },
      "store.read": {
        payload: {
          key: { type: "string", required: true },
        },
        returns: {
          ok:    { type: "boolean"      },
          value: { type: "any | null"   },
          ts:    { type: "number | null"},
          stale: { type: "boolean"      },
        },
        errors: [
          { code: "READ_TIMEOUT", message: "Read exceeded timeout_ms" },
        ],
        idempotent: true,
        timeout_ms: 100,
      },
    },
    events: {
      "store.written": {
        payload: {
          key:     { type: "string" },
          version: { type: "number" },
          ts:      { type: "number" },
        },
        ordering: "guaranteed",
      },
      "store.error": {
        payload: {
          key:   { type: "string" },
          code:  { type: "string" },
          error: { type: "string" },
        },
        ordering: "best-effort",
      },
    },
  },

  isolation: {
    rules: [
      "cli-layer cannot import core-store module directly",
      "core-store cannot call cli-layer methods",
      "No shared mutable state across this boundary",
      "All communication through STORAGE_CONTRACT only",
      "Errors caught at boundary — never propagated raw",
    ],
    verified_by: "test",
  },

  metrics: {
    latency_p95_ms:     100,
    latency_p99_ms:     250,
    throughput_per_sec: 1000,
    error_rate_pct:     0.1,
    availability_pct:   99.9,
  },

  traceability: {
    trace_id:     true,
    causal_chain: true,
    ledger:       true,
  },

  acceptance: {
    contract_tests:     false,  // not yet verified
    isolation_verified: false,
    mock_generated:     false,
    metrics_verified:   false,
  },
};
```

When all four acceptance fields are `true`: batch complete.

---

## WHAT A SEAM IS NOT

- Not an interface. Interfaces have no isolation rules, no metrics, no acceptance criteria.
- Not a contract. Contracts have shape and behaviour but no build boundary or runtime health.
- Not a test suite. Test suites are derived from seams, not the source of truth.
- Not a monitoring config. Metrics in a seam are design declarations, not operational configuration.
- Not a deployment boundary. A seam can exist entirely within one process.
- Not a microservice boundary. A seam can separate two functions in the same file.

A seam is a **named boundary** with a complete, executable specification.
Its scope is the boundary, not the components on either side.

---

## SEAM REGISTRY

A system's seams are registered in one place.

```javascript
const REGISTRY = {
  seams: {
    "STORAGE_CONTRACT":  { version: "1.0.0", status: "active"     },
    "COMMAND_CONTRACT":  { version: "1.2.0", status: "active"     },
    "EVENT_CONTRACT":    { version: "2.0.0", status: "active"     },
    "DISPATCH_CONTRACT": { version: "1.0.0", status: "deprecated" },
    "AUTH_SEAM":         { version: "1.1.0", status: "active"     },
  },

  health() {
    // returns health() for every registered seam
    // single call, full system boundary status
  },

  graph() {
    // returns the seam graph — all named edges
    // complete dependency map, nothing implicit
  },
}
```

The registry is the system's self-knowledge at the boundary level.
The `.map` file describes what the system is.
The seam registry describes how the system is held together.

---

*A seam makes "done" measurable.
Contract exists. Mock exists. Tests pass. Isolation holds. Metrics verified.
Batch complete.*
