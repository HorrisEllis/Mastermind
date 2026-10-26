# unintegrated/

Source files only — every `.js/.ts/.html/.css/.md/.json/.svg` from the
component drops, stripped of `node_modules/`, `.git/`, `dist/`, `build/`,
`coverage/`, nested `legacy-zips/`, and `package-lock.json`. Nothing here
is wired into MASTERMIND. Nothing here has been read file-by-file — this
is a clean, organized parking lot, not an audit. Read the relevant
SKILL/README inside each folder before pulling anything from it into the
real codebase.

## Why nothing here is integrated

Two different reasons, per project:

**Different architecture — needs a real integration decision, not a port.**
These use an ESM `import`/`export` module system and a SISO event bus
(`Stream`/`Gate`/`Event`) that MASTERMIND doesn't have. Porting means
either building a SISO adapter or rewriting every file to plain global
scripts — a real design choice, not something to guess at:

- `ALK-components/`, `spatial-components/`, `spatial-v2_0_0/`,
  `spatial-v2_1_0/`, `spatial-v2_2_0_1_/` — the ALK kernel and its
  `spatial` monorepo repackaging. Three version snapshots kept as-is
  (2.0.0 → 2.1.0 → 2.2.0.1) rather than collapsed to latest-only,
  because collapsing loses the diff between them and nobody asked for
  that yet.
- `resonance-app-components/`, `resonance-engine-v5_1_0-components/`,
  `resonance-v5_1_0-patches/` — Resonance engine + app.
- `rheon-voice-components/` — Rheon Voice app (a duplicate copy,
  `rheon-voice-v7`, existed in the original upload and was left out
  here rather than kept twice).
- `telemetry-codec-components/`, `telemetry-codec-v1_0_0/` — codec.
- `topo-kernel-components/`, `topo-kernel/` — topology kernel.
- `ase-persistent-scanner-components/` — ASE scanner.
- `Behavior_Engine/`, `Behavioral_Drift_Analyze/`, `Causal_Substrate/`,
  `pendulum-swing-v0_1_1/`, `relational-field-reader-v0_2_0/`, `SNR/` —
  not yet read closely; same ESM/SISO shape as the above on a skim of
  their entry files.
- `xlat-bridge.js` — a translation/bridge layer between two of the
  above; standalone file, not read in depth.

**Tag-semantics decision needed before wiring, even though the code is
portable.** These ARE plain-portable (same shape as the two detectors
already ported into `foundation/ai/pattern-detect.js`) but each adds a
new kind of tag or score to a node, and that's a product decision, not
a code one:

- Topic modeling (LDA), named-entity tracking, discourse-coherence
  scoring — inside `spatial-components/.../text-module.js` and the ALK
  copy. What should a "topic" tag or a coherence score *do* once a node
  has one — still open.
- The other five GapHunter detectors (shadow field, contrastive,
  negative space, structural, reversal) — inside
  `spatial-components/packages/gaphunter/src/gap-hunter-core.js`. Same
  shape as `WeakAssumptionHunter`, which WAS ported. Each of the other
  five needs its own tag name, color, and trigger threshold decided.
- `Liminal___The_Gap_Detection_System/`, `Fixing_AI/`, `CrystalBall-1__2_/`,
  `Associative_Lattice/` — larger write-ups / prior iterations of the
  same gap-detection and associative-lattice ideas MASTERMIND's own
  `modules/voice-lattice/` already implements a version of. Worth a
  read for ideas, not a mechanical port — these are design documents
  and prototypes as much as they are code.
- `signature_authorship_engine_architecture.svg` — architecture diagram,
  reference only.

Say which piece to pull from next and I'll read it properly before
touching the real tree — same as `pattern-detect.js`.
