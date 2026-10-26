# COMPONENTS — NEXUS v7 decomposed

| | |
|---|---|
| **Source** | `mastermind_old/index.html` — 11,125 lines, 462 functions, one file |
| **Method** | §3.3 map before build. Every count here is measured, not recalled. |
| **Shape** | §8.5 — component id · parent · children · foundation connection · hooks · wires · consumers · context |
| **Status** | **Specified.** Nothing here is built. §8.5 forbids building without a spec first; this is that spec. |
| **Lifecycle** (§17.2) | Draft → **Specified** → Implemented → Verified → Released |

---

## Measured inventory

| Prefix | Functions | What it is |
|---|---|---|
| *(unprefixed)* | 232 | canvas, library, modals, persistence, colour — the undifferentiated core |
| `vl` | 107 | Voice Lattice |
| `hz` | 36 | Horizon planning + epistemic register |
| `collab` | 20 | WebRTC collaboration |
| `syn` | 17 | Synthesis lab |
| `opt` | 11 | Options |
| `brain` | 10 | Brain map |
| `vault` | 9 | Insight vault |
| `import` | 6 | Notion / Obsidian / text import |
| `nexus` | 6 | **The bridge** |
| `play` | 4 | Playground / reframing |
| `ai` | 3 | AI provider config |
| `wb` | 1 | Word bank domain detection |

**232 of 462 functions have no prefix.** That is the finding. The old build
had six clearly-named subsystems and one undifferentiated mass half the size
of the whole file. Decomposition starts there, not with the lattice.

---

## Foundation (immutable core — §8.5)

Everything below is additive to these. They do not import each other.

| id | Owner (§17.1) | Responsibility |
|---|---|---|
| `F.vault` | `foundation/vault/` | Encryption, envelope, ledger, snapshots. The only write authority for persisted state (§10.1). |
| `F.bus` | `foundation/bus/` | WARP event bus. All inter-module traffic (§5.7). |
| `F.jaa` | `foundation/siso-jaa/` | UUID ledger, identity. |
| `F.core` | `foundation/core/` | Registry, session, logging. |
| `F.ai` | `foundation/ai/` | Capture transport, lexicon, taxonomy, assist contract. Pure; no module reaches into it. |

---

## Components

Each is `modules/<id>/` with `module.json` · `engine.js` · `ui.js` · `ui.css`
· `README.md` (§8.5 order: js → config → manifest → registry → readme).

### `C.lattice` — Voice Lattice · parent `F.core`

Children: `C.lattice.capture` · `C.lattice.graph` · `C.lattice.detail` ·
`C.lattice.wordbank` · `C.lattice.seeds`

| | |
|---|---|
| **Emits** | `mm.lattice.node` · `mm.lattice.edge` · `mm.lattice.seed` · `mm.lattice.loop` |
| **Listens** | `mm.capture.node` · `mm.vault.loaded` · `mm.vault.saving` |
| **Wires** | `F.ai` capture-bridge → in. `F.vault` serialize/hydrate → persistence. `C.brain`, `C.horizon` ← out via `F.bus`. |
| **Consumers** | `C.brain` (nodes), `C.horizon` (seeds), `C.heuristics` (clusters) |
| **Context** | The only capture surface. Everything else consumes what it produces. |

**Take from v7** — orb (3 rings + core, click to record) · waveform canvas ·
timer · force-directed graph with `VL_TAG_COL` · detail panel with
`contenteditable` · node list with search + tag + heuristic filters · mode
selector · two-column layout.
**Leave** — the nine tabs (that was the clutter) · camera panel ·
`EXPR/POSTURE/GAZE/STRESS` (pixel statistics with psychological labels) ·
tone-bar `STRESS` readout.

### `C.brain` — Brain Map · parent `F.core`
Emits `mm.brain.cluster` · `mm.brain.domain`. Listens `mm.lattice.node`.
Consumers: `C.synthesis`. 13 meta-domains; cross-domain synthesis.
v7's `brainPullVoiceNodes` / `brainPushVoiceToCanvas` are the wire — rebuild
as bus events, not direct calls (§5.7).

### `C.horizon` — Horizon + Epistemic Register · parent `F.core`
Emits `mm.horizon.plan` · `mm.belief.updated`. Listens `mm.lattice.seed`.
**36 functions, and `hzEpi*` is the half-built Bayesian layer**: it records
claim, evidence, domain and confidence including a `testing` level, and never
updates. Adding the review trigger is the whole of P11.
The obstacle step is non-skippable (mental contrasting, not fantasy).

### `C.heuristics` — Library + Codex + Rituals · parent `F.core`
Emits `mm.heuristic.fired` · `mm.heuristic.created`.
`saveClusterAsHeuristic` is the closed loop: select nodes → named,
domain-tagged, strength-rated heuristic → spawns a node pointing back → can be
fired to create new nodes. Content already salvaged to `assets/salvage-v7/`.
Every heuristic carries its `counter` — surfaced beside it, not buried.

### `C.synthesis` — Synthesis Lab · parent `F.core`
17 functions. The matrix view is the part worth keeping: an N×N grid forces
every pair to be considered, which makes cross-domain synthesis systematic
rather than lucky.

### `C.void` — Spatial Void · parent `F.core`
Ideation pipeline: idea → wonder → logic → question. The screen sequence **is**
the schema. Reframe methods salvaged (`reframeMethods.json`).

### `C.canvas` — Node Canvas · parent `F.core`
Most of the 232 unprefixed functions. **Migrate last** — most entangled.

### `C.library` — Node Library · parent `F.core`
16 tools/frameworks/patterns with worked scenarios. Content salvaged.

### `C.import` — Import · parent `F.core`
Text and paste only. **Notion/Obsidian sync is not carried forward** — it
conflicts with DR-003 and needs its own decision, not a port.

### `C.collab` — Collaboration · parent `F.core` · **DEFERRED**
20 functions of WebRTC. Peer connections move data off-machine. Needs a
decision against DR-003 before any of it is rebuilt. Recorded here so it is
not silently dropped (§0.3), not scheduled.

---

## The bridge — `F.bus` wiring

v7's `nexus*` functions were it, working, in six functions:
`nexusRequestClose` · `_nexusSyncBrainHeuristics` · `_nexusBrainActivity` ·
`nexusGetAllTags` · `nexusShowWordBankOnCanvas`.

Rebuild as named edges (§13.2), each with protocol, auth and failure mode:

| Edge | From → To | Payload |
|---|---|---|
| `lattice→brain` | `C.lattice` → `C.brain` | node id |
| `lattice→horizon` | `C.lattice` → `C.horizon` | seed |
| `cluster→heuristic` | `C.lattice` → `C.heuristics` | node ids |
| `heuristic→brain` | `C.heuristics` → `C.brain` | heuristic id |
| `wordbank→canvas` | `C.lattice` → `C.canvas` | word list |

**`nexusGetAllTags` is the system-wide tag index.** One vocabulary, every
module reading it. That is what makes the lattice interconnect rather than sit
beside things.

---

## Migration order (§3.1 bottom-up, §16.1 nearest gap)

1. `C.lattice` UI — the only capture surface; everything else is downstream
2. `C.heuristics` — content already salvaged, closes the capture→tool loop
3. `C.horizon` — consumes seeds; unlocks the belief-update trigger
4. `C.brain` — consumes nodes
5. `C.synthesis` · `C.void` · `C.library` · `C.import`
6. `C.canvas` — last, most entangled
7. `C.collab` — only after a DR-003 decision

---

## Open questions (§0.1 — named, not guessed)

- **`C.canvas` boundary is undecided.** 232 unprefixed functions have not been
  attributed to components. Decomposing them is its own mapping job and must
  happen before `C.canvas` is touched.
- **Does `C.brain` own domains, or does `F.ai/taxonomy`?** Two candidates for
  one write authority is a §10.1 violation waiting to happen. Unresolved.
