# SPEC-REGISTRY

§6.3 — every `.spec` built for the system is entered here on creation, and
updated every time it is checked for drift. A spec not in this registry is
unaccounted for: it can drift indefinitely with nobody knowing to look.

| Spec | Version | Governs | Last checked against code | Status |
|---|---|---|---|---|
| `docs/VAULT.spec.md` | 6 | Vault file format, KDF, audit ledger, tamper/rollback verdicts | 2026-08-11 | Implemented · Verified in isolation · **not Released** |
| `phasemap/COMPONENTS.md` | 1 | v7 decomposed per §8.5 — ids, parents, hooks, wires, consumers | 2026-08-13 | Specified · nothing built |
| `phasemap/PHASEMAP.md` | 3 | Full dependency-ordered plan, P0–P14, one spec per module | 2026-08-13 | Live · rendered in Settings → Roadmap from phases.json |
| `docs/AI-CONTRACT.md` | 1 | AI egress boundary, schemas, proposals-not-actions | 2026-08-12 | Implemented · no transport bridge yet |
| `docs/MODULE.spec.md` | 1 | Module boundary: folder layout, event contract, persistence via serialize/hydrate | 2026-08-12 | **Specified — nothing built against it yet** |
| `docs/PHASEMAP.md` | 1 | Dependency-ordered build plan, P0–P11, with exit criteria | 2026-08-12 | Live — update as phases close |
| `docs/TRIAGE-2026-08-12.md` | — | Audit of AssociativeLattice, resonance-v2, resonance-webapp-stack, spatial_v2 | 2026-08-12 | Complete |
| `docs/TRIAGE-components.md` | — | Audit of nine component archives; voicing + clarity built from them | 2026-08-12 | Complete |
| `docs/SALVAGE-v7.md` | — | Audit of NEXUS Mastermind v7: what existed, what survived, what was extracted | 2026-08-12 | Complete — content extracted to `assets/salvage-v7/` |
| `docs/NEXUS-SPEC.md` | — | Pre-existing. Not authored or checked this session. | never | Unaccounted — needs a drift check |
| `cobalt.manifest.json` | 1.4.0 | Cobalt sealed core integrity (§C1) | 2026-08-11 | 1 of 7 declared files present in the delivered zip |
| `docs/AXIOMS-v3_1.md` | 3.1 | System design laws — governs every spec and decision above it | 2026-08-22 | Committed to the repo this session — was referenced by section number (§8.5, DR-003 crosslinks) throughout `docs/PHASEMAP.md` since 2026-08-12 but never actually present as a file until now |

## Decision records (§17.3)

| ID | Subject | Status |
|---|---|---|
| `docs/decisions/DR-001-vault-v6.md` | Envelope, KDF policy, integrity, rollback anchoring | Accepted |
| `docs/decisions/DR-002-history-durability.md` | Git history has no remote; bundle archiving | Accepted |
| `docs/decisions/DR-003-ai-never-touches-the-vault.md` | AI assistance operates outside the vault boundary; provenance required on generated nodes | Accepted (principle) |
| `docs/decisions/DR-004-local-speech.md` | Local Whisper only; webkitSpeechRecognition sent audio to Google; ordered transcription buffer | Accepted |

## Open registry debt

- `NEXUS-SPEC.md` has never been checked for drift. Per §6.3 that is the
  registry's own oldest gap.
- No spec exists for Cobalt's ledger amendment, which §8.5 requires *before*
  that work starts.
- ~~`docs/NODE.spec.md` does not exist~~ — the P1 envelope now exists as
  `schemas/node.schema.json` and `schemas/edge.schema.json`, with `provenance`
  and `mode` required. A prose spec around them is still owed.
  Its draft input now exists: `emergence-6/emergence/schemas/idea.schema.json`,
  `idea-edge.schema.json` (typed links incl. `contradicts`) and
  `ledger-record.schema.json` (hash-chained on `prev`), plus the per-field
  liveness annotation practice from `observation.schema.json`.
- No spec exists for the node schema / capture event log, which DR-003, the
  module contract's rule 4, and the planned lattice, ideation and
  spatial-void work all depend on. §8.5 requires it before any of that is
  built. This is now the single largest blocker on the roadmap.
