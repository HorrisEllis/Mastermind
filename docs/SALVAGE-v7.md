# SALVAGE — NEXUS Mastermind v7

| | |
|---|---|
| **Source** | `mastermind_old.zip` → `index.html`, 11,125 lines, 632 KB, single file |
| **Reference** | `NEXUS_Feature_Reference.docx` — 2,205 lines, 24 sections. The two .docx files are byte-identical (same MD5); one document, two filenames. |
| **Audited** | 2026-08-12, against the current build at v0.1.8 |
| **Verdict** | The interconnection layer is the loss. The content is recoverable and has been extracted. |

---

## 1. What v7 actually was

Self-reported: 462 functions, 518 element IDs, 2 script blocks, 24 subsystems.
No dependencies beyond Google Fonts. One file.

Modes: Mind Map · Brain Map · **Voice Lattice** · Leverage Map · Synthesis Lab ·
Frameworks · Insight Vault · Metadata Sort · Playground · Horizon Plan ·
Collaboration · Scenarios · Node Library · Import · Notion/Obsidian sync ·
AI config · **Interdependency Bridge**.

## 2. What survived into v0.1.8 — checked, not assumed

| v7 system | Present now? | Where |
|---|---|---|
| `vlAddNode` | **yes** | `modules/voice-lattice/speech.js` |
| word bank | partial | `modules/capture/capture.js` |
| rituals | partial | `nexus-engine.js` |
| `_vlAutoTag` (tag rules) | **GONE** | — |
| `_vlComputeAssoc` (association engine) | **GONE** | — |
| `_vlDetectLoops` (loop detection) | **GONE** | — |
| `VL2` (heuristics · rituals · codex · wordBank) | **GONE** | — |
| `vlFireHeuristic` | **GONE** | — |
| `seedFlag` / seeds | **GONE** | — |
| codex | **GONE** | — |
| Interdependency Bridge (`NEXUS.emit/on`) | **GONE** | — |

Nine of eleven checked systems are absent. The Voice Lattice that remains is
the microphone and the node list — the capture end. Everything that made
captured sentences *become* something is missing.

## 3. The actual loss: the bridge, not the features

Section 22 of the reference describes a global event bus (`NEXUS.emit` /
`NEXUS.on`) with seven declared events, and a set of cross-system send
functions. Every mode could hand data to every other mode:

```
heuristic:created · heuristic:fired · vl:node_added
vault:item_added  · vault:seeds_pushed
canvas:node_spawned · wordbank:updated
```

```
sendNodeToBrainMap(id) · sendNodeToVault(id) · sendNodeToVoiceLattice(id)
vlPushSeedsToVaultBridged() · vlExportClusterToCanvas()
vlHeuristicToBrainMap(id) · vlCodexToLeverageMap()
nexusShowWordBankOnCanvas()
```

**This is the module contract, already prototyped.** `docs/MODULE.spec.md`
proposes `mm.<module>.<verb>` events and a foundation that only emits — v7
had exactly that shape, working, in 2026. The current WARP bus is the
successor; it just has almost nothing wired into it.

The single most valuable idea in the whole file is **`saveClusterAsHeuristic()`**:
select several canvas nodes → Ctrl+H → they become a named, domain-tagged,
strength-rated heuristic → which spawns a framework node pointing back at the
cluster → which can then be fired to create new nodes elsewhere. A closed
loop from raw capture to reusable thinking tool and back. Nothing in the
current build does this.

## 4. Extracted content — `assets/salvage-v7/`

Content is not code. These survive any rewrite and were pulled out verbatim:

| File | Contents |
|---|---|
| `heuristics.json` | 6 seeded heuristics — Inversion, First Principles, Slope Amplifier, Signal vs Noise Filter, Somatic Validation, Horizontal Contamination. Each with body, worked example, trigger list, **counter-heuristic**, domain, strength. |
| `rituals.json` | 3 rituals — Pre-Session Ignition, Post-Session Integration, Morning Externalization Burst. Full step protocols, timing, linked heuristics. |
| `codex.json` | 4 entries — Leverage = T×W×f(Slope), Reciprocation Is Not Mimicry, Process Is Not Living, Capture First Filter Never. Each with origin, when-it-fires, **counter-condition**, status. |
| `latticeRules.json` | 5 auto-tag regexes (FRICTION/BLOCK/LOOP/GAP/REL), association parameters, loop-detection threshold, the four capture modes, and the force-directed physics constants. |
| `wordbankDomains.json` | 6 domains × ~14 substring keys for automatic word classification. |
| `nodeTypes.json` | 8 canvas node types with icons and colours. |

Two design details in that content are worth naming, because they are the
non-obvious part and easy to drop in a rewrite:

- **Every heuristic has a `counter`.** Inversion's counter is Forward
  Projection; Somatic Validation's is Somatic Bias. The library knows when
  each tool stops working. That is what separates a heuristic library from a
  list of tips.
- **Every codex entry has a `counter` condition too** — "Process Is Not
  Living" carries "some processing IS the work." The laws argue with
  themselves.

## 4b. Second pass — the larger trove

The first pass took the Voice Lattice. The rest of the file holds more, and
most of it is **content and mechanism, not UI** — which means it survives a
rewrite untouched.

| File | Contents |
|---|---|
| `library.json` | **16 cognitive tools, frameworks and patterns** — Six Eyes, Sandbox OS, Tension Harvesting, The Council Method, IV Bag, End-State Simulation, Meta Compression, Relational Oscillation Theory, Non-Linear Horizon Planning, Cross-Domain Synthesis, Bayesian Reasoning, First Principles, and four structural patterns. Each with description, intelligence tags, domains, use cases, **and 1–2 worked scenarios with a concrete action**. |
| `scenarios.json` | **23 scenarios in 6 groups** — learning, worth, mental health, potential, neurodivergence, seniors. Each with context, framing text, a specific action, and intelligence tags. |
| `frameworkTemplates.json` | 6 structures — 3-Layer, Causal Loop, Dialectic, OODA, Problem Space, Meaning Making. |
| `reframeMethods.json` | 6 reframing methods — CPT, Sovereignty, Contrast, Existential Rewrite, Inversion, Meaning Making. |
| `horizonDomains.json` | 8 life domains with icons and colours. |
| `structuralSystems.json` | The mechanisms: mutation operators, the leverage equation, the epistemic register, metadata categories, the 22-type intelligence taxonomy, synthesis lab, vault entry schema. |

### Four things in there that change the phase map

**1. The mutation lab already exists.** Nine operators — Expand, Compress,
Fork, Synthesize, Chain, Shadow, Tension, Dialectic, End-State. The design
notes ask for a "mutation, integration and embodiment lab"; the mutation half
is specified and was working. Each operator is a transformation from one node
to another, which makes them **pure functions over the P1 envelope** — the
same shape as the lattice primitives in P3, and just as testable.

**2. The intelligence taxonomy is the domain map's vocabulary.** 22 types,
already applied consistently across all 16 library entries and all 23
scenarios. The design notes ask for AI to "track and update the intelligence
system and domain map" — the map's axes already exist, hand-tagged, with ~40
worked examples. That is training data for the classifier and a schema for
the domain map, free.

**3. The epistemic register is the Bayesian requirement, half-built.** It
records claim, evidence, domain and confidence (high / medium / low /
**testing**), with pattern frequencies over time.

The gap is precise and small: **it never updates.** There is no trigger that
revisits a belief when evidence arrives — no prior, no posterior, no
re-rating prompt. It is a belief *log*, not a belief *system*. Adding a
review trigger and an update history is a contained piece of work, and it is
the whole of "Bayesian updating for models" from the design notes.

The `testing / exploring` confidence level is the sleeper. It separates "I am
uncertain" from "I am deliberately holding this loosely while I check" —
which is exactly the distinction P8 compartments need in order to keep
sandbox ideas from being weighed like observations.

**4. `source` on the vault entry is the ancestor of `provenance`.** v7
already recorded which mode produced each entry. P1 needs to widen that from
mode to author (human / which model), but the field's justification is
already established in the old design.

### And one to notice

The scenario titled **"Building Worth From the Inside Out"** is in
`scenarios.json` under `worth`, tagged Meta-Cognition, Ethical Reasoning,
Resilience, Self-Sovereignty. Its method: build an evidence log of what you
have actually done, because "beliefs update on evidence, not affirmations."

The tagline came from your own build, and the scenario behind it is the
mental-contrasting correction to P10 — already written, in your words, in
March.

## 5. The one that maps onto current work

`latticeRules.json`'s FRICTION tag fires on filler words — *uh, um, err, hm*.
Hesitation treated as signal rather than noise. That is the associative voice
lattice's actual thesis, in five regexes, and it is the smallest possible
version of "tagged and tracked" that needs no AI at all.

Which matters given DR-003: **the v7 tagger was entirely local.** Regex,
word-overlap association, frequency-based loop detection. No model, no
network, no egress. It is worth knowing how far the mechanical version gets
before reaching for an assistant — the old build suggests: quite far.

## 6. Rebuild order

Not a plan to rebuild v7. It is 11,125 lines with no tests, no vault, no
module boundary, and its persistence was `localStorage`. The current
foundation is better. But these come back, in this order:

1. **Node envelope + event log** — still the blocker
   (`docs/MODULE.spec.md` §6). v7's three schemas (canvas node, VL node,
   heuristic) are the draft input.
2. **Auto-tag + association + loop detection** — pure functions over text,
   fully specified in `latticeRules.json`, testable headless, no AI.
3. **Seeds** — `seedFlag` + priority + context. One boolean that turns
   capture into selection.
4. **Heuristic library** — load `heuristics.json`, plus `fire` and
   `saveClusterAsHeuristic`. This is the "heuristics for clusters of
   frameworks" ask, and v7 already had it working.
5. **Codex + rituals** — mostly content, already extracted.
6. **The bridge** — cross-module sends, over the WARP bus, under the
   module contract.

## 7. Not salvaged, deliberately

- **Camera analysis** (`_vlcProcessFrame`) — motion diff, skin-tone ratio as
  face position, brightness asymmetry as gaze direction, and a "stress proxy"
  from contrast variance. These are not validated measures of expression,
  posture, gaze or stress; they are pixel statistics with psychological
  labels attached. Rebuilding it would mean generating confident-looking
  numbers about your emotional state from brightness noise, then storing them
  next to real data. If camera signal is wanted later it needs a real model
  and honest error bars.
- **Notion / Obsidian sync** — direct conflict with DR-003 and the
  nothing-outside-the-vault rule. Needs an explicit decision, not a port.
- **`localStorage` persistence** — superseded.
