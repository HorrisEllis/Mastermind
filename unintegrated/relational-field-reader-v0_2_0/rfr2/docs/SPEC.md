# Relational Field Reader — v0.2.0 Spec

**Author:** James Brooks (Erosmancer)
**Status:** DRAFT — corrected for full depth after v0.1.0 under-sampled ALK and
flattened the 12-package model.
**Composed from:** GapHunter-v3, Liminal, spatial-v2 (1.0/2.1/2.2), telemetry-codec,
topo-kernel, rheon-kernel, Associative Lattice (full tree, incl. CrystalBall),
relational.zip scanners, rheon-v0.3.0 (Idea OS), Everything_seeer (causal-nexus
spec + ledger), master_compendium_encyclopedia, resonance-v3.

---

## §0. What changed since v0.1.0

v0.1.0 collapsed the system into 8 generic layers and lost resolution doing it:

- `sigma`, `pat`, and `idl` got folded into other layers as side-notes instead
  of standing on their own.
- `@spatial/nexus` was packaged as its 14KB loader stub. The real thing —
  found in `Associative_Lattice.zip → CrystalBall-1/CrystalBall/src/causal-nexus/`
  — is a **21-module implementation matching the v6.0.0 spec exactly**:
  identity, time, causality, kernel, adapter, adapter-sandbox, projection,
  lazy, delta, compress, forge, loader, persist, query, observer, sigma,
  clip, context, version-gate, enforcement, index. It has its own test suite
  (11 files) mirroring every module. This is now `packages/nexus/`.
- `@spatial/resonance` was packaged as its npm stub. The real implementation —
  `CrystalBall/modules/Resonance/src/` — has api, ase, extraction (with an
  `llm.ts` extraction path), feed (generator + scorer), idl (axes, dynamics,
  modes, store), resonance scoring, social-module, and trajectory
  (oscillation + store). Now `packages/resonance/`.
- **IRS — Integrative Relational Systems** (`CrystalBall/modules/irs/irs.js`)
  was missing entirely from v0.1.0. This is the literal "shape of a person/
  relationship" module: it defines GAP (σ deviation above tolerance band),
  EDGE (stabilized low-σ constraint between agents), and INVERSION
  (reinterpretation of the σ mapping function, not a state flip) as the
  primitive vocabulary for relational structure. Everything else in this
  package — Liminal's gaps, `relational.js`'s rupture/repair, ASE's
  signature drift — is IRS's vocabulary applied at a specific scale. It now
  has its own package: `packages/irs/`.
- ALK was previously sampled at `kernel.js` only. The full tree (102 unique
  files after deduplicating ~177 nested copies) includes detector classes
  never packaged before: `AttachmentDetector`, `ShadowDetector`,
  `EscalationDetector`, `RhythmDetector`, `ContrastiveDetector`,
  `NegativeSpaceDetector`, `CrossModalDetector`, `HermeticDetector` (all in
  `behavior-module.js`), plus `social-module.js`, `speech-state-module.js`,
  `framework-model.js`, and a second, distinct `relational.js` (ALK's own,
  separate from spatial's). Now under `packages/kernel-alk/`.
- There were also two genuinely separate "Rheon" projects in play under one
  name — `rheon-kernel` (voice/cognitive runtime) and `rheon-v0.3.0` (Idea OS:
  spec library, project ledger, seam contracts). They're kept apart:
  `capture/` vs `build-tools/rheon-idea-os/`.

---

## §1. The Recursion Contract (unchanged)

```
SCALE 0 — Utterance   → identity (ASE) + gap (Liminal) + behavior (ALK detectors)
SCALE 1 — Exchange     → relational (ALK's + spatial's relational.js) + IRS edges/gaps
SCALE 2 — Session      → field/topology + sigma + drift-engine + nexus causal graph
SCALE 3 — Relationship → lattice + pat + codec, longitudinal
SCALE 4 — Meta         → forge compiles new detectors from the system's own misses
```

IRS sits underneath all four scales as the shared vocabulary — gap, edge,
inversion are scale-agnostic. A gap at the utterance level and a gap at the
relationship level are the same primitive at different σ windows.

---

## §2. Package Map (full 12 + 2 new)

| Package | Role | Source |
|---|---|---|
| `bus` | SISO event bus | spatial `@spatial/bus`, ALK `siso.js` |
| `kernel-alk` | Substrate + 9 behavior detectors + text/video/social/speech/framework modules | Full ALK tree, deduplicated |
| `nexus` | Causal event engine, 21 modules + ledger (dual upgrade/idea) | **CrystalBall's real implementation** + Everything_seeer spec + ledger-v1.0.0 |
| `bridge-xlat` | Universal translator | ALK's real `xlat-bridge.js` + spatial `bridge`/`idl` stubs |
| `ase` | Authorship Signature Engine | spatial `@spatial/ase`, `ase-profile-card.html` |
| `irs` | **Integrative Relational Systems** — gap/edge/inversion primitives | `CrystalBall/modules/irs/` (new) |
| `gap` | Sentence-level gap detection | Liminal (canonical), GapHunter/spatial-embedded (legacy reference) |
| `field` | Session-level composite signal | spatial `field`, `math`, `signal` modules, spatial's `relational.js` |
| `sigma` | Entropy/regime detection | spatial `sigma`, topo-kernel `snr.js` |
| `pat` | Canonical session record | spatial `pat` |
| `lattice` | Causal/semantic memory | spatial `lattice`, topo-kernel (reference), rheon Idea OS storage (reference) |
| `forge` | Pattern → detector compiler | spatial `forge`, `NEXUS-FORGE-IDE.html` / `NEXUS-FORGE-WIN11.html` |
| `codec` | Longitudinal compression | telemetry-codec (reference pattern) — `RelationshipFrame` still TBD |

Plus, outside the package recursion:

| Folder | Role |
|---|---|
| `capture/` | Voice/video ingest — rheon-kernel engines, ALK video/mic |
| `knowledge/` | `master_compendium_encyclopedia.html` — named frameworks (Gottman, Attachment Theory, Shadow Work) grounding what the detectors compute |
| `application/` | Product surfaces — `resonance-v3.html` (full social platform: friends, DMs, nexus-graph, word-lattice), plus `the-listener.html`, `mimi.html`, `alk-social-module.html`, `mastermind_v3.html` (purpose of these last four not yet confirmed — flagged for follow-up, not guessed at) |
| `scanners/` | Visualization shells — ase scanner, fractal map, cosmos scanner, crystalball test suite, alk-pipeline |
| `build-tools/rheon-idea-os/` | The *other* Rheon — spec library / project ledger / seam contracts, used to manage building this package, not part of the analysis recursion |
| `legacy-zips/` | Every original source file, untouched |

---

## §3. IRS as the Spine

```js
GAP       = σ deviation above tolerance band       // significant misalignment
EDGE      = stabilized low-σ constraint            // repeatable relational channel
INVERSION = reinterpretation of the σ mapping fn   // model changes, not the world-state
```

§3.1 — All outputs labeled signals, not diagnoses, not judgments (inherited
unchanged, IRS's own header states this explicitly).
§3.2 — Liminal's 200+ gap types are GAP instantiated at the utterance scale.
§3.3 — ALK's `relational.js` rupture/repair are EDGE breaking/reforming at
the exchange scale.
§3.4 — ASE signature drift is INVERSION at the identity scale — not "this
person changed," but "the model of how to read this person needs to change."

---

## §4. The RelationshipFrame (still the open build item)

Unchanged from v0.1.0 §4 — port telemetry-codec's `ServiceFrame` pattern,
now explicitly extended with an `irs` block:

```js
RelationshipFrame {
  ...
  irs: {
    gaps:       [{ axis, sigma, confidence }],
    edges:      [{ axis, stability, since }],
    inversions: [{ axis, ts, magnitude }],
  },
}
```

This is the one piece of code in the whole package that doesn't exist yet
anywhere across the nine-plus source archives. Everything else here is
real, found code — this is the actual gap (in the IRS sense) in the corpus
itself.

---

## §5. Build Order

1. `relationship-frame.js` — port telemetry-codec's adapter/runtime shape,
   source from `nexus`'s `kernel`/`observer`/`sigma` modules + IRS's
   gap/edge/inversion output instead of service metrics.
2. Wire `nexus`'s real 21-module kernel to `kernel-alk`'s detectors — right
   now they're parallel implementations that have never talked; nexus has
   the causal graph, ALK has the detectors that should be feeding it.
3. Wire one scanner end-to-end (`spatial-scanner-cosmos.html` → real
   `relational.js` + IRS output, replacing its current mock strings).
4. Confirm what `the-listener.html`, `mimi.html`, `mastermind_v3.html`, and
   `alk-social-module.html` actually are before deciding where they sit —
   not guessed at in this spec.
5. Forge pass — only after 1–3 produce enough real frame history.

---

## §6. Inherited Axioms (span all sources, unchanged)

```
§K6 / §5.7   No module calls another directly. All I/O via event bus.
§K7          All errors surface as events. Never throws to caller.
§F1          Generated code (Forge output) is a signal, not a verdict.
§IDL3        No immutable labels. No ranking. No diagnosis.
§3.1 (IRS)   Bottom-up only. Data → structure → inference → action.
§8.2 (IRS)   Hostile review before spec: conditions gate all inversions.
```
