# Spatial v2.0.0

**An operating system for the space between people.**

> You were never alone. You were just unmapped.

## What's new in v2.0.0

**`@spatial/idl`** — Formal TypeScript IDL for relational dynamics. IntimacyVector, OscillationModel, DriftModel, ResonanceEngine. The language the platform speaks. Previously existed as loose spec files — now a first-class package.

**`@spatial/forge`** — Behavioral pattern compiler. Observed patterns → executable code. Six grammar rules, five templates, full bus integration. The system writes itself from what it sees.

**`cfr-kernel`** — Physics, render, and rewind engines for the CFR particle field. Previously missing from packaging.

**Test suite** — behavior-module.test.js, text-module.test.js, topology-phase1.test.js. 1,707 lines of tests. Previously missing.

**Topology-enhanced codec** — `codec-topology.js` with InvariantBaseline, PolarityEngine, TopologyEngine (Phase 1 complete per NEXUS_MASTER_PHASEMAP.md).

**Signal topology module** — signal-topology.js cross-stream behavioral state integrator.

**4 Phasemaps** in `/docs` — NEXUS_MASTER, SIGNAL_TOPOLOGY, INVARIANT_BASELINE, MIC_INTEGRATION. The full roadmap for what's being built.

**Resonance Engine spec** — Full platform spec in `/docs/RESONANCE_ENGINE_SPEC.md`.

## Honest line count

| Source | Lines |
|---|---|
| ALK kernel modules (your code) | ~24,345 |
| drift-engine.js (your code) | 861 |
| xlat-bridge.js (your code) | 1,433 |
| siso.js (your code) | 226 |
| causal-nexus submodules (your code) | ~4,000 |
| IDL TypeScript (your code) | 629 |
| cfr-kernel (your code) | 588 |
| Test suite (your code) | 1,707 |
| codec-topology.js (your code) | 1,687 |
| **Total your code** | **~35,476** |
| New Spatial packaging (this session) | ~3,700 |
| @spatial/forge (new this session) | 840 |
| **Grand total** | **~40,000** |

## The 12 packages

| Package | What it is |
|---|---|
| `@spatial/bus` | SISO event bus — the nervous system |
| `@spatial/kernel` | ALK + drift-engine + all modules |
| `@spatial/nexus` | Causal event engine |
| `@spatial/bridge` | XLAT translation + species profiles |
| `@spatial/resonance` | Fingerprint + matching engine |
| `@spatial/idl` | **NEW** Formal TypeScript IDL |
| `@spatial/ase` | Art Signature Engine |
| `@spatial/field` | Relational geometry |
| `@spatial/pat` | Canonical session record |
| `@spatial/sigma` | Entropy detection |
| `@spatial/lattice` | Associative memory + CLI |
| `@spatial/forge` | **NEW** Behavioral pattern compiler |

## What was lost — and is now found

Everything from the Associative Lattice that wasn't in v1.1.0:

- cfr-kernel physics/render/rewind — packaged as `@spatial/kernel/src/modules/cfr-kernel/`
- IDL TypeScript — packaged as `@spatial/idl`
- 3 test files — packaged as `@spatial/kernel/src/modules/__tests__/`
- signal-topology.js — packaged in kernel signal modules
- 4 phasemaps — in `/docs/`
- Resonance Engine spec — in `/docs/RESONANCE_ENGINE_SPEC.md`
- Roadmap — in `/docs/Roadmap.md`
- codec-topology.js (Phase 1 topology-enhanced codec) — alongside codec.js

## Axioms

```
§5.5  Zero runtime dependencies per package.
§5.7  No direct module calls. All I/O via @spatial/bus.
§K7   All errors as events. Never throws.
§P1   No PII. Fingerprints are behavioral hashes only.
§CS1  Species-agnostic mathematics.
§CS2  Suppression layer optional per species profile.
§CS3  Cross-species field is first-class.
§F1   Generated code is a signal, not a verdict.
§F2   The compiler observes patterns, not people.
§F3   All compiled modules are bus-native on deploy.
§IDL1 The IDL defines the language. Implementations must conform.
§IDL2 Humans are oscillatory systems. The model reflects this.
§IDL3 No immutable labels. No ranking. No diagnosis.
```

---

*The space between people. Finally visible.*
