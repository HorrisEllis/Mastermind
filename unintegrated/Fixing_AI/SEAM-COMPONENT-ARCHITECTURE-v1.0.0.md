# SEAM COMPONENT ARCHITECTURE
## How to code in batches using seams as cut points
**Author:** James Brooks
**Date:** 2026-05-29
**UUID:** seam-arch-0000-2026-0529-jamesbrooks-001
**Status:** `named` — pattern defined, ready to apply to any project

> *"Harmony lives in the seams. That's where growth, invention, and co-creation happen."*
> The seam is not just where systems touch — it is the cut point.
> Code to the seam. Stop. Verify. Continue.

---

## THE INSIGHT

Every monolith fails at the same place: coupling hides across the whole codebase.
You can't batch-build a monolith because every batch depends on every other.

The seam inverts this. A seam is a **formally declared interface between two components**
where:
- Each side knows only the contract, not the implementation
- Either side can be replaced without the other changing
- The seam itself is testable in isolation (mock one side, verify the other)
- The seam is where you **cut** — build up to it, stop, ship, verify, continue

This is not just modular design. It is **temporal architecture** —
the seam defines *when* you can pause, *what* you can ship,
and *where* the next batch begins.

---

## THE PATTERN

```
COMPONENT A
    |
    |  implements →  SEAM CONTRACT
    |                (declared interface)
    ↓
COMPONENT B
```

**Each component:**
- Implements its side of the seam contract
- Has no knowledge of what's on the other side
- Is buildable and testable independently

**Each seam:**
- Is a named, typed, versioned contract
- Declares exactly what crosses it (events, calls, data shapes)
- Is the SNR gate — signal passes through, noise is logged

**Each batch:**
- Builds one component up to one seam
- Delivers a working, testable artifact
- The seam is the acceptance criterion

---

## HOW TO DECLARE A SEAM

```javascript
// seam: [SEAM_NAME]
// version: 1.0.0
// direction: A → B  |  B → A  |  bidirectional
// contract:
//   sends:    { type, payload shape }
//   receives: { type, payload shape }
//   errors:   { type, handling }
// isolation: A cannot call B directly. All traffic through this seam.
// test:       mock B, verify A emits correct events. mock A, verify B handles them.
```

Seams are declared as comments at the top of the file that owns them,
or as a standalone `seams/[NAME].seam.js` contract file.

---

## APPLIED TO THE STACK

Every SNR gate in the stack architecture IS a seam.
The gate is the seam. The seam is the cut point.

```
META LAYER
    ↕  seam: META_CONTRACT
ORCHESTRATOR
    ↕  seam: DISPATCH_CONTRACT
UI / WEB SERVER
    ↕  seam: HTTP_CONTRACT
INTERACTIVE LAYER
    ↕  seam: EVENT_CONTRACT
API LAYER
    ↕  seam: COMMAND_CONTRACT
CLI
    ↕  seam: STORAGE_CONTRACT
IMMUTABLE CORE
```

**Batch 1:** Build the IMMUTABLE CORE up to the STORAGE_CONTRACT seam.
**Batch 2:** Build the CLI against the STORAGE_CONTRACT seam.
**Batch 3:** Build the API LAYER against the COMMAND_CONTRACT seam.
**Batch 4:** Build the INTERACTIVE LAYER against the EVENT_CONTRACT seam.
**Batch 5:** Build the UI/WEB SERVER against the HTTP_CONTRACT seam.
**Batch 6:** Build the ORCHESTRATOR against the DISPATCH_CONTRACT seam.
**Batch 7:** Build the META LAYER against the META_CONTRACT seam.

Each batch is independently deliverable.
Each seam is independently testable.
You can stop after any batch and have a working system.

---

## THE SEAM FILE FORMAT

```javascript
/**
 * SEAM: [NAME]
 * version: 1.0.0
 * status: active | draft | deprecated
 * between: [COMPONENT_A] ↔ [COMPONENT_B]
 * description: one sentence
 */

const SEAM = {
  name: 'STORAGE_CONTRACT',
  version: '1.0.0',

  // What A can ask of B
  commands: {
    'store.write':  { payload: { key: 'string', value: 'any', decay?: 'DecayProfile' }, returns: 'StoreResult' },
    'store.read':   { payload: { key: 'string' },                                        returns: 'StoreResult | null' },
    'store.delete': { payload: { key: 'string' },                                        returns: 'boolean' },
    'store.query':  { payload: { table: 'string', where?: 'object' },                   returns: 'Row[]' },
  },

  // What B emits to A
  events: {
    'store.written':  { payload: { key: 'string', ts: 'number' } },
    'store.error':    { payload: { key: 'string', error: 'string', code: 'string' } },
  },

  // What neither side is allowed to do
  isolation: [
    'A cannot import B directly',
    'B cannot call A methods',
    'All communication through this seam object',
  ],

  // How to test this seam
  test: {
    mock_B: 'Return fixed StoreResult for any write. Verify A emits store.write with correct shape.',
    mock_A: 'Emit store.write with malformed payload. Verify B emits store.error, does not throw.',
  },
};

module.exports = SEAM;
```

---

## CODING IN BATCHES — THE RITUAL

**Before each batch:**
```
1. Name the seam you're building TO
2. Write the seam contract (commands + events + isolation)
3. Write the mock for the other side
4. Confirm: "batch complete" = seam contract fully satisfied
```

**During each batch:**
```
- Build bottom-up within the batch
- At every internal boundary: add a seam comment
- Never reach past your seam into the next layer
- If you need something from the next layer: define it in the contract, mock it
```

**After each batch:**
```
1. Run the seam test (mock the other side, verify your side)
2. Document what the seam now guarantees
3. Update the living document: "seam X is complete, verified"
4. Next batch starts from the other side of the same seam
```

---

## SEAM COMMENT SYNTAX (in-code)

```javascript
// ═══════════════════════════════════════════════════════
// SEAM: STORAGE_CONTRACT  ←  you are here, building TO this
// A: CLI layer  →  calls commands defined in this seam
// B: Core store ←  implements these commands
// Version: 1.0.0
// ═══════════════════════════════════════════════════════

function writeToStore(key, value) {
  // SEAM CALL: store.write
  // Payload: { key: string, value: any }
  // Returns: StoreResult
  return seam.call('store.write', { key, value });
}
```

---

## WHY THIS IS DIFFERENT FROM INTERFACES

Interfaces in most languages are type contracts — they say *what shape* a thing is.

Seams are **temporal contracts** — they say:
- *When* you can stop building (batch boundary)
- *What* must be true on both sides before you continue (acceptance criterion)
- *How* either side can be replaced (disposability guarantee)
- *Where* you test (the seam itself, not either implementation)

The seam is a **living boundary** — it can be versioned, deprecated, replaced.
When a seam changes, both sides must update. The seam document is the source of truth.

This is §SEAM from the axioms: *"Growth happens at the seam — the high-information edge."*

The seam is not just where you cut. It is where the system can evolve.
