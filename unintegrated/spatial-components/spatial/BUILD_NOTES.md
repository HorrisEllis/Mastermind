# Build Notes — this package

Base: `spatial-v2_2_0.zip` (highest package count of the four spatial revisions uploaded — v1.0.0
→ v2.2.0 — checked file-by-file for regressions: `sigma`'s `index.js_tmp` and `lattice`'s
`lattice-exports.js` both look like drops between versions but aren't — the former was a stray
temp file cleaned up, the latter's exports were folded directly into `lattice/src/index.js`
verbatim. No content lost between v1.0.0 and v2.2.0.)

**Added:** `packages/gaphunter/` — from `spatial-gaphunter-v2_0_0.zip`. Not previously a package in
this monorepo; `gap-hunter.js` existed only inline at `packages/kernel/src/modules/gap-hunter.js`
(1101 lines, byte-for-byte the same logic as this package's `gap-hunter-core.js` — 4-line diff, a
header change). This package is a decomposed, `@spatial/gaphunter`-namespaced evolution of that
same file: `gap-hunter-core.js` + `gap-taxonomy.js` + `gap-text.js` + `gap-bus.js` +
`kernel-stub.js` + a `gaphunter.js` entry point, plus its own local SISO primitives
(`lib/siso-*.js`) and `lib/ledger.js` so it can run without depending on `packages/bus`. Picked up
automatically by the root `package.json`'s `"packages/*"` workspace glob — no config changes
needed. `STRUCTURE.md`/`PACKAGES.md`/`AUDIT.md` were not updated to mention it — left those as the
project's own planning docs rather than rewriting them.

**Not merged:** `spatial-resonance-v1_0_0.zip`. Same package (`@spatial/resonance` v1.0.0), but a
decoupled variant — it inlines the `EV` event constants and ships its own `bus.js` instead of
importing `@spatial/bus`, so `@spatial/resonance` can run standalone outside this monorepo. The
in-monorepo version imports `EV` from `@spatial/bus` properly. Merging the standalone variant in
would duplicate the `EV` constants in two places — the exact kind of drift the rest of this
codebase treats as a hard error (see ALK's SISO "collision as hard error" convention, which this
monorepo's `kernel` package inherits). Left the monorepo version as-is; the standalone copy still
exists in the original upload if a decoupled build is ever wanted.

All `.js` in this tree passes `node --check`.
