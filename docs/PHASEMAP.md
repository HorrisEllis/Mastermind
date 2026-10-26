# PHASEMAP — bottom up

| | |
|---|---|
| **Version** | 2 · 2026-08-12 · at project v0.1.18 |
| **Ordering** | Strict dependency order. A phase may only use what is below it. |
| **Rule** | §3.2 — one thing at a time, verified. A phase is not done because it is written; it is done when its exit criterion is demonstrated. |
| **Rule** | §1.1 — nothing exists until it runs under real conditions. "Tests pass" is not an exit criterion on its own. |

Read from the bottom. Everything above P1 is blocked on P1.

---

## P0 — GROUND · durability and truth · **95% done**

Nothing above this matters if the data does not survive or the app lies about
its own state.

| | Status |
|---|---|
| v6 envelope · salt + KDF in header · portable vault | done (0.1.2) |
| AAD-bound header — savedAt/saveCount/anchor authenticated | done (0.1.2) |
| Hash-chained audit ledger, anchored in the vault | done (0.1.2) |
| Invariant 0 — header describes the key, enforced by the language | done (0.1.4) |
| Zero credentials outside the vault | done (0.1.4) |
| Snapshots — verified, reversible restore, pruned | done (0.1.5) |
| Boot sequence — nine gates, on screen, before unlock | done (0.1.7) |
| Vault file watcher — deletion → read-only | done (0.1.5) |
| Git history durability — bundle, clone-verified | done (0.1.2) |
| Version consistency — one source, enforced by test | done (0.1.6) |
| Real autosave (the toggle was decorative) | done (0.1.8) |
| Local Whisper + ordered buffer + voice-note import | done (0.1.12–13) |
| YIN pitch · clarity · voicing/segmentation | done (0.1.14–15) |
| **Electron / IPC verification on real hardware** | **IN PROGRESS** |

### P0 field log

Three runs on the Windows machine. Every one found something no test in
this repository could have found, and each is now covered.

| Run | Symptom | Cause | Fixed |
|---|---|---|---|
| 2026-08-11 | Unlock fine, all 3 saves failed at `seal` | legacy login bound neither KDF params nor a vault identity | 0.1.3 |
| 2026-08-12 a | `Cannot access 'VAULT' before initialization` | the AUTH.key guard ran at load time against a `const` declared in a later script; the throw aborted the rest of the file | 0.1.16 |
| 2026-08-12 b | Correct password refused after recreating | recreation wrote a **v5** envelope keyed from a random salt stored nowhere | 0.1.17 |
| 2026-08-12 b | Boot screen and recovery form drawn on top of each other | `style.display='flex'` inline beats the `.hidden` class; 3 call sites | 0.1.17 |

**What the runs also proved works**, from the boot screen's own report:
Electron bridge present · AES-256-GCM round trip verified, KDF 46 ms ·
data folder resolved · vault file read · vault watcher armed · the nine
gates render and report accurately, including correctly flagging a v5
file as un-integrity-checkable.

> **P0 exit:** create a vault, restart, unlock it, save, restart again,
> and see nine green checks with **file integrity: OK**. Not yet reached —
> the last run was still opening a v5 file. One more cycle should do it.
>
> Note on the pattern: all four defects were **integration** faults —
> load order, screen z-order, which envelope a path writes. Every unit
> test passed through all of them. The tests added since
> (`run-load-order.test.js`) are source- and evaluation-level for exactly
> that reason.

---

## P1 — SUBSTRATE · the node envelope and the event log · **not started**

The single blocker under the entire roadmap. Voice lattice, ideation, ALM,
compartments, the intelligence system — all of them need a node to exist and
a way to record that something happened.

**Build**

1. **Node envelope.** Shared header + typed payload, mirroring the vault
   envelope's own shape:
   `{ id, type, created, source, provenance, mode, links[], payload }`
   - `provenance` — human, or model-and-which (DR-003 requires it)
   - `mode` — which compartment produced it (P8 depends on this existing
     from day one; retrofitting it later means every old node is unlabelled)
   - `links[]` — typed edges, not just ids
2. **Type registry.** v7's eight canvas types + the VL sentence type +
   heuristic, codex entry, ritual, seed, idea. Salvaged shapes in
   `assets/salvage-v7/nodeTypes.json` are the draft input.
3. **Event log.** One append-only log, typed events, inside the vault
   payload. Per-module views are projections of it, not separate logs —
   three ledger systems means three sync bugs.
4. **serialize/hydrate.** The only persistence surface a module ever sees.

**Spec first (§8.5):** `docs/NODE.spec.md` does not exist yet. Write it
before any code.

> **P1 exit:** a node of every registered type round-trips through the vault
> and back with provenance intact; the event log replays to the same state
> twice.

---

## P2 — CONTRACT · modules decoupled from the foundation · **specified only**

`docs/MODULE.spec.md` exists. Nothing is built against it.

**Build**

1. `module.json` manifest — id, uuid, version, events in/out, **and the
   assistance block**:
   ```json
   "assistance": { "enabled": false, "provider": "local",
                   "may_send": ["idea.seed"], "never_send": ["node.body"] }
   ```
   This is the "config file per module" idea, and it makes DR-003 an
   inspectable property of a file rather than a promise in prose.
2. Migrate in order: `memory` → `leverage-map` → `alm` → the rest.
   Canvas and brain map last; they are the most entangled.
3. Extract each module's HTML and CSS out of the 5,143-line
   `index-browser.html` into its own folder as it migrates.

> **P2 exit:** `memory` loads, saves, and renders with zero references into
> anything it did not create, and `index-browser.html` is smaller by exactly
> that module's markup.

---

## P3 — LATTICE PRIMITIVES · pure, local, no AI · **salvaged, not rebuilt**

Fully specified already in `assets/salvage-v7/latticeRules.json`. Pure
functions over text — no DOM, no network, no model. The cheapest real value
on the whole map.

**Build**

1. **Auto-tag** — 5 regexes: FRICTION (filler words), BLOCK, LOOP, GAP, REL.
2. **Association** — 4+ character word overlap, bidirectional edges.
3. **Loop detection** — word frequency ≥ 3 across nodes.
4. **Word bank** — frequency map + 6-domain classification by substring.
5. **Seeds** — `seedFlag` + priority + context. One boolean that turns
   capture into selection.

> **P3 exit:** a transcript of real speech produces tagged, associated nodes
> with detected loops, entirely offline, in a headless test.
>
> Note for P6: find out how far this gets *before* adding an assistant. v7
> suggests further than expected.

---

## P4 — HEURISTIC LIBRARY · **content salvaged, mechanism gone**

**Build**

1. Load `assets/salvage-v7/heuristics.json`, `codex.json`, `rituals.json`.
2. **Fire** a heuristic → creates a node (P1) tagged with its origin.
3. **`saveClusterAsHeuristic`** — select nodes → they become a named,
   domain-tagged, strength-rated heuristic → which spawns a node pointing
   back at the cluster. The closed loop from capture to reusable tool and
   back. This is the single best idea in v7 and nothing currently does it.
4. **Counters are first-class.** Every heuristic knows what makes it stop
   working; surface it next to the heuristic, not buried in a field.

> **P4 exit:** a cluster of canvas nodes becomes a heuristic, that heuristic
> fires to create a new node, and the new node links back to the cluster.

---

## P4b — MUTATION OPERATORS · **salvaged, pure functions** · needs P1

Nine operators from v7, already specified in
`assets/salvage-v7/structuralSystems.json`. Each transforms one node into
another, so each is a pure function over the P1 envelope — same shape as P3,
same testability, no AI required.

Generative: Expand · Compress · Fork · Synthesize
Structural: Causal Chain · Shadow Side · Extract Tension · Dialectic Split ·
End-State Simulation

This is the mutation half of the "mutation, integration and embodiment lab".

> **P4b exit:** each operator produces a correctly-typed, correctly-linked
> child node in a headless test, with the parent recorded in `links[]`.

---

## P5 — THE BRIDGE · cross-module flow · needs P1 + P2

v7 had this working (`NEXUS.emit`/`on`, seven events, cross-system sends).
Rebuild it over the WARP bus under the P2 contract, not as direct calls.

`sendNodeTo(target, id)` · `pushSeedsToVault()` · `clusterToCanvas()` ·
`heuristicToBrainMap()` · `wordBankToCanvas()`

> **P5 exit:** a node created in the voice lattice appears in the brain map
> without either module referencing the other.

---

## P6 — CAPTURE MODES · needs P1 + P2 + P3 · **transport built**

Manual · voice · **imported voice notes** · **AI-assisted**.

The transport layer is done ahead of schedule because DR-004 forced it:
local Whisper (`foundation/ai/whisper.js`), an ordered buffer
(`foundation/ai/transcribe-queue.js`), and the virtual input
(`foundation/ai/audio-import.js`) which feeds a backlog of existing
recordings through the SAME queue as the live microphone. One pipeline,
two sources; the lattice cannot tell them apart, which is the point.

What remains here is the mode UI and the connection to P1 nodes. Session ledger per conversation, projected
from the P1 event log.

The assistant enters here and nowhere earlier, gated by the P2 manifest.
Everything below this line works without it — which is the point.

> **P6 exit:** a full capture session in each mode produces nodes with correct
> provenance, and the assistance boundary is verifiable from `module.json`.

---

## P7 — IDEATION · spatial void rebuilt · needs P3 + P4 + P6

`+ Add idea` → *Your own idea* | *Generate with AI* → wonder → logic.
Inspirations library, priming rituals (P4 supplies the ritual engine),
ideation methods.

The screen sequence *is* the schema: idea → wonder → logic → question,
tagged by which screen produced it. Structure for free, no categorising
mid-flow.

> **P7 exit:** one complete run from empty canvas to a logic chain, with
> every node correctly typed by its originating screen.

---

## P8 — COMPARTMENTS · epistemics · needs P1's `mode` field

Ideation and synthesis obey different rules and must not leak into each
other. Suspended judgment in the sandbox; Bayesian updating in synthesis.

This is why `mode` belongs in the P1 envelope from the start: a node born in
the sandbox must not be weighed like an observation.

**Half of this is salvaged.** v7's epistemic register already records claim,
evidence, domain and confidence — including a `testing / exploring` level
that distinguishes "I am uncertain" from "I am holding this loosely on
purpose". That distinction is the compartment boundary.

The missing half is precise: **it never updates.** No prior, no posterior, no
trigger that revisits a belief when evidence arrives. Adding a review trigger
and an update history is the entirety of "Bayesian updating for models".

> **P8 exit:** the same claim carries different confidence in each
> compartment, and moving it between them is an explicit, logged act.

---

## P9 — ALM · feedback loops · compression · needs P3 + P8

Lexicon and grammar built from the lattice. Mental simulation. Mutation and
integration lab — test an integration before committing it.

## P10 — HORIZON · embodiment · needs P7 + P8

Model of who you want to be. **Add the obstacle step** — mental contrasting
plus if-then planning, not positive fantasy. Non-skippable. (Reasoning: see
the 2026-08-12 exchange; indulging alone measurably reduces follow-through.)

## P11 — INTELLIGENCE SYSTEM · needs everything

AI maintains the domain map, generates open loops from gaps, drives
iteration.

**The vocabulary already exists.** v7's 22-type intelligence taxonomy is
hand-applied across all 16 library entries and all 23 scenarios — the domain
map's axes, plus ~40 worked examples of correct tagging. That is both the
schema and the evaluation set, already written.

---

## Critical path

```
P0 hardware verification
   └─ P1 node envelope + event log     ← everything waits here
        ├─ P2 module contract
        │    └─ P5 bridge ─── P6 capture modes ── P7 ideation ── P10 horizon
        ├─ P3 lattice primitives ── P4 heuristics ── P4b mutations ──┘
        │                                                    └─ P9 ALM
        └─ P8 compartments (needs `mode` in the envelope from day one)
                                                    └─ P11 intelligence
```

**Two things carry disproportionate weight.**

`mode` and `provenance` in the P1 envelope. Both are one field each, both are
trivial now, and both are near-impossible to add later — every node written
before them is permanently unlabelled, and P8 and DR-003 are unbuildable on
unlabelled data.

**Next action:** one more create/restart/unlock cycle to close P0. Then
`docs/NODE.spec.md` — before any P1 code. Its draft input now exists:
`emergence-6`'s `idea.schema.json`, `idea-edge.schema.json` (typed links,
including `contradicts`) and `ledger-record.schema.json` (hash-chained on
`prev`, independently the same shape as the vault audit ledger), plus the
per-field LIVE/PINNED liveness annotation from `observation.schema.json`.

---

## The homepage, mapped to phases

Eight tiles, four across. What exists, and what each is waiting on:

| Tile | Phase | State |
|---|---|---|
| Brain Map | P2 migration (last — most entangled) | live |
| Spatial Void | P7 ideation | live, rebuild planned |
| Horizon Living | P10 | live |
| ALM | P9 | live |
| Memory | **P2 first migration** | live |
| Voice Lattice | P3 + P6 | live; capture transport done, knowledge layer absent |
| *(slot 7)* | — | **empty** |
| *(slot 8)* | — | **empty** |

The two empty slots are deliberate. The obvious candidates are a
**Heuristics** tile (P4 — content already salvaged into
`assets/salvage-v7/`, and `saveClusterAsHeuristic` is the closed loop) and
a **Capture** tile (P6 — Whisper, the ordered buffer and voice-note import
are all built and have no front door). Neither is decided; §8.5 wants a
spec before either is built.

---

## Request map — 2026-08-22 session

AXIOMS v3.1 landed this session (`docs/AXIOMS-v3_1.md`) — referenced by
section number throughout this document already (§8.5, DR-003 crosslinks)
but never actually committed until now. Per §3.3, every item from the
2026-08-22 request is mapped below to the phase that already owns it,
rather than treated as new scope. Most of it isn't new — it's this plan,
asked for out of critical-path order.

| Ask | Maps to | Status |
|---|---|---|
| Decouple modules, event interaction contract, handshake verification | **P2 — CONTRACT** | Specified only. **Blocked on P1** (needs the node envelope's `mode`/`provenance` fields to exist first). |
| Split + rename `nexus-engine.js`/`nexus-canvas.js` → `mastermind-engine.js`/`mastermind-canvas.js` | **P2 — CONTRACT** | Same blocker — a rename-and-split done before P1 produces the exact kind of half-migrated state §3.1 (bottom-up only) exists to prevent. |
| Split CSS out of `index-browser.html` into `style.css` | **P2 — CONTRACT** (§5.13, syntax is not architecture) | Not blocked on P1 — pure presentation extraction, no event-bus dependency. Candidate for doing now, ahead of the rest of P2. |
| Domain dropdown → AI-assisted, lattice improves over time, predicts ambiguity | **P8 — COMPARTMENTS** + **P11 — INTELLIGENCE SYSTEM** | Needs P1's `mode` field (not started) and is explicitly listed as needing "everything." |
| AI-assisted tag library across every module (domain, framework, thinking-type, reasoning/scaffold, intelligence, intuition tags) | **P8** + **P11**, new — not previously named as its own phase | Recommend naming as **P8a — TAG TAXONOMY**, since P8/P11 as written don't cover a cross-module tag *library* specifically. |
| AI touching the vault, consent toggle | **Reverses DR-003** (`docs/decisions/DR-003-ai-never-touches-the-vault.md`, Accepted principle) | Not a phase — a Decision Record change. P1's `provenance` field and P8 are both described in this document as depending on DR-003 holding. Needs its own DR before any phase touches it (§17.3 — alternatives and rejections recorded, not silently reversed). |
| Domain / Intuition / Intelligence-type / ALM connection, real-world scenarios scored per intelligence-type | **P9 — ALM** + **P11** | "The vocabulary already exists" per P11's own note — v7's 22-type taxonomy, 16 library entries, 23 scenarios, already hand-tagged. |
| Cross-domain section (ALM × Spatial Void synthesis) | **P7 — IDEATION** + **P9** | P7 needs P3+P4+P6 first. |
| Session → ledger history, per-session transcript, friction/tension/negative-belief scoring | **P1 — SUBSTRATE** (event log) + this session's `session.end` ledger work | Partially done this session (see mastermind-vault.js `sessionHistory` / vault-ledger.js `capture.session.end`) — friction/tension/negative-belief scoring on top of it is new, maps to P8. |
| Node editing with full metadata | **P1 — SUBSTRATE** | Needs the node envelope spec to exist first — "full metadata" is exactly what P1's `docs/NODE.spec.md` is supposed to define before any editing UI is built against it. |
| Session audio playback (open a session, hear the recording) | **P6 — CAPTURE MODES** | "Transport built" — audio segments already land on disk per-segment (`captureWriteSegment`); playback UI against them is a P6 front-door, not new capability. |
| Consolidate Voice + Lattice modules, remove from main menu | **P2 — CONTRACT** | Module boundary decision — same blocker as the engine split. |
| "Step 3" one-time popup with a persistent dismiss flag | Not phase-mapped — small, standalone, no P1 dependency | Buildable now. |
| Verification screen opens behind Settings | Not phase-mapped — UI routing only | Buildable now. |
| Icon/button visual complaints (zone icon, SYS/LVG, Horizon/Save/Clear buttons) | Not phase-mapped — polish | Buildable now, no dependency. |

**What this means for build order (§3.1, §8.5):** the two largest asks —
the engine split/event-contract work and the AI-vault-consent toggle — both
sit on top of P1, which this document's own critical path says is "not
started" and gated on closing P0 first. Building them now, out of order,
is exactly the failure mode §3.1 names: something built on a foundation
that doesn't exist yet. The smaller, unblocked items (CSS split, the
one-time popup, icon fixes, button-label fix, audio-playback front-door,
tag-library naming as P8a) don't have this problem and can proceed
independently.

