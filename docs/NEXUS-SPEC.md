# NEXUS SPEC — Mastermind: As-Is, Modular Architecture, Becoming Engine

**Status, direct answer:** Phase 1 (foundation extraction) is started —
6 already-self-contained files physically moved into `foundation/`
subfolders, script paths and the electron-builder file list updated to
match. See "Phase 1 progress" at the end of Part 2 for exactly what moved,
what didn't, and why. Everything else in Part 2 and all of Part 3 is still
unbuilt. Living doc: update it in place as phases land, don't fork it.

---

## PART 1 — AS-IS (audited against the actual code, not assumed)

### 1.1 Architecture

| File | Lines | What's actually in it |
|---|---|---|
| `nexus-engine.js` | 14,304 | Everything: Brain Map, Horizon, ALM, Voice Lattice, Mirror, Systems, Relational, Options, Auth, Search, all state objects, all UI wiring — one file, no module boundaries |
| `nexus-canvas.js` | 2,110 | Canvas engine (node graph), homepage, startup screen, ambient backgrounds |
| `mastermind-vault.js` | 1,095 | Already separate — encrypted vault, closest thing to a real module today |
| `mastermind-foundation.js` | 1,827 | Partially foundation already (boundary vs. nexus-engine.js unaudited — needs a pass in Phase 1) |
| `mastermind-siso-jaa.js` | 381 | SISO/JAA ledger — foundation-layer, already isolated |
| `warp-core.js` + `mastermind-warp-spine.js` | ~330 | The event bus, already proven on Brain Map nav + homepage cards, not yet adopted app-wide |
| `main.js` / `preload.js` | 290 | Electron shell — already foundation |

**Persistence sprawl** — 13 separate `localStorage` keys, one per module,
each reinventing save/load:
```
nexus_auth_vault   nexus_theme          nexus_options       nexus_ai_config
nexus_body_state   nexus_domain_state   nexus_gap_state     nexus_systems_state
nexus_void_state   mm_horizon_state     mm_alm_state_v2     mm_alm_deltas
mm_relational_state  mm_mirror_state    mm_vl_state_v2      mm_vault_data / mm_vault_meta
```
This is the concrete case for "vault as nodes" (Part 2.4) — not a stylistic
preference, 13 independent failure points doing the same job differently.

### 1.2 Module inventory — real, verified data shapes

**Brain Map (BMV2)** — `nexus_domain_state`. 13 fixed meta-domains, real
orbit camera (azimuth/elevation, top-down default per spec), zoom tiers
(META → DOMAINS → DETAIL). Delete now works: canvas nodes route through the
actual canvas delete path (undo, ledger, autosave), custom domains through
their own remove function, meta/domain/sub nodes explain they're taxonomy
not data rather than silently doing nothing.

**Horizon** — `mm_horizon_state`. One array, `HORIZON_STATE.plans[]`:
```js
{
  id, title, endState, timeframe,
  conditions: [],   // reverse-causal conditions
  constraints: [],  // current + future constraints
  failureModes: [], // how this could fail
  resources: {},    // resource estimates
  milestones: [],   // { id, label, timeframe, done }
  slopes: [],       // { id, domain, current, target, rate, note }
  deltas: [],       // tracked progress deltas
  created, modified,
}
```
`slopes` and `deltas` are declared in `horizonNewPlan()` and never read
anywhere else in the file. Real, pre-existing stub.

**ALM** — extracted to `modules/alm/` this session (see its README for
what moved and why). `mm_alm_state_v2` + a second, disconnected key
`mm_alm_deltas`:
```js
{
  activeTab, activeFunction, activeModel,
  functionLog: [],       // { fnKey, note, quality, ts } — cognitive function training (Ni/Ne/Ti/Te/etc.)
  modelLog: [],           // { modelKey, field, value, ts }
  experiments: [],        // { id, fnKey, prompt, observation, ts }
  heuristics: [],          // { id, text, domain, reliability, tags[], ts }
  frameworks: [],          // { id, name, description, source, tags[], ts }
  externalizations: [],    // { id, text, type: 'question'|'observation'|'hypothesis'|'pattern', fnKey, ts }
}
```
The separate Delta Log (`mm_alm_deltas`) types: `insight | skill | pattern
| intuition | inner-work | horizon`. **`'horizon'` exists in the type-color
map and is never filtered, queried, or cross-referenced against
`HORIZON_STATE.plans`.** Second pre-existing stub — this is the literal
undone wire between ALM and Horizon.

Correction against the homepage card copy: ALM's card claims "sleep
integration scheduling" — no such tracking exists in code. The only
sleep-adjacent thing is a phrase-detector ("sleep on it", "shower thought")
under "Delayed Synthesis." Flagging before either of us designs around a
feature that isn't there.

**Voice Lattice** — `mm_vl_state_v2`. Not deep-audited this session — flagging
the gap rather than describing internals I haven't verified.

**Dormant modules** — Mirror (`mm_mirror_state`), Systems
(`nexus_systems_state`, folded into Brain Map's Relational Systems mode),
Relational (`mm_relational_state`, folded into Ecosystems mode). Code and
state intact, no menu entry point.

**Vault** — `mastermind-vault.js`, real AES-256-GCM. No node-shaped
read/write API yet.

### 1.3 The core finding

The ALM↔Horizon connection isn't new work — `plan.slopes`, `plan.deltas`,
and the delta log's `'horizon'` type are seams that already exist and were
never wired. Part 3 finishes wires that are already there, not new surface
area.

---

## PART 2 — PLANNED: Modular Architecture

*"The UI for the foundation, encryption, everything but modules — the
entire skeleton without any modules/canvas. Then each menu item is a
module, isolated from everything else, connected with an event bus, all
data saves to the vault as nodes."*

### 2.1 Target shape

```
/foundation/                  the skeleton. no module knows this exists in detail.
  /shell/                     window chrome, titlebar, RGB border, layout frame
  /theme/                     mastermind-theme.css, palette, per-module color tokens
  /auth/                      passphrase/PIN unlock, session, _assertAuth()
  /vault/                     encrypted storage + the node read/write API modules call
  /bus/                       event bus (WARP core + spine, extended)
  /siso-jaa/                  UUID registry, delta ledger, hostile-review hooks
  /canvas-engine/             shared primitives (pan/zoom, node/edge draw, hit-test, render-loop scaffolding) — a toolkit, not a canvas
  /window-manager/            overlay open/close lifecycle, focus stack, z-index arbitration

/modules/
  /brain-map/    engine.js  canvas.js  ui.js  events.js  vault.js  README.md
  /horizon/      (same shape)
  /alm/          (same shape)
  /voice-lattice/
  /becoming/     ← new, see Part 3 (reads horizon+alm via bus only)
  /mirror/ /systems/ /relational/   (dormant — migrate when reactivated)
  /vault-ui/     the vault's own screens (distinct from foundation/vault, the storage engine)
```

**Hard rule:** a module never imports or calls another module directly. The
only door between modules is the bus.

### 2.2 Foundation — what belongs and why

| Piece | Currently lives in | Moves to |
|---|---|---|
| Window chrome, titlebar, RGB border | `index-browser.html` inline | `foundation/shell/` |
| Theme/palette | `mastermind-theme.css` | `foundation/theme/` (mostly already there) |
| Auth | scattered in `nexus-engine.js` | `foundation/auth/` |
| Vault storage engine | `mastermind-vault.js` | `foundation/vault/` + new node API |
| Event bus | `warp-core.js`, `mastermind-warp-spine.js` | `foundation/bus/` |
| SISO/JAA | `mastermind-siso-jaa.js` | `foundation/siso-jaa/` (mostly already there) |
| Shared canvas primitives | mixed into `nexus-canvas.js` | `foundation/canvas-engine/` (extracted, not the whole file) |
| Overlay/window lifecycle | ad hoc per module (`openBrainMap`, `openHorizon` each reinvent show/hide) | `foundation/window-manager/` |

Non-goal: foundation has no domain knowledge. If code knows what a
"meta-domain" or "causal loop" is, it's misplaced module code, not foundation.

### 2.3 Event bus

`MM_WARP` already proves the pattern (Event → Axiom → Gate.transform() →
StreamLog) on Brain Map nav. This phase is breadth, not redesign:
one `Stream`, foundation-owned, every module registers Gates on it.
Naming convention already established (`brain.mode.enter`) extends to
every module: `horizon.plan.create`, `alm.delta.log`, `voice.intent.route`.
Cross-module events get a shared namespace: `vault.node.saved`,
`vault.node.deleted`. Every module's `events.js` declares `emits[]` and
`listens[]` — that file *is* its public contract.

### 2.4 Module contract — folder template

```
/modules/<name>/
  engine.js      pure logic — state shape, transforms, no DOM
  ui.js          DOM/canvas rendering for this module only
  events.js      bus contract: emits[], listens[]
  vault.js       maps this module's state to vault nodes
  README.md      what this module is, its config, its axioms
  canvas.js      (only for modules with spatial visualization, e.g. Brain Map)
```

Brain Map's own `engine.js`-shaped logic (`BRAIN_MODES`, `BMV2` state,
`_bmBuildGraph`) and `canvas.js`-shaped logic (`bmv2Render`, the shared
orbit projection) already split this way internally — just not yet
physically moved into that folder.

### 2.5 Vault as nodes

Every module writes through one API instead of its own `localStorage` key:
```js
Vault.writeNode({ module: 'horizon', type: 'plan', id, data, tags })
Vault.readNodes({ module: 'horizon', type: 'plan' })
Vault.deleteNode(id)
```
Vault owns encryption + versioning, emits `vault.node.saved` /
`vault.node.deleted` on the bus. "As nodes" is a storage *shape* (uniform
envelope), not a mandate that every module's data visually appears on the
Brain Map canvas — that's a per-module call, documented in its `README.md`.

### 2.6 Migration order

| Phase | Module | Why this order | Done when |
|---|---|---|---|
| **1** | Foundation extraction | Nothing else can move until modules have somewhere to land | `foundation/` folders exist, app boots identically |
| **2** | Brain Map | Named explicitly; already closest to target shape | Fully isolated, only talks via bus, `nexus_domain_state` migrated to vault nodes |
| **3** | Horizon | Clean, self-contained state already | Same criteria |
| **4** | ALM | Two keys (`mm_alm_state_v2` + `mm_alm_deltas`) collapse into one vault-node shape | File boundary done (`modules/alm/`) — still on raw `localStorage`, not vault nodes yet |
| **5** | Voice Lattice | Routes into other modules today — good test of cross-module bus calls | Intent-routing goes through bus events, not direct calls |
| **5.5** | Becoming | New module, built once Horizon + ALM are on the bus (needs `alm.delta.logged` / `horizon.plan.updated` to exist) | See Part 3.6 |
| **6** | Dormant modules | No active entry point, lowest urgency | Migrated when reactivated |
| **7** | Foundation hardening | Hostile review (Six Lenses) on the whole bus/vault contract | No module reaches around the bus into another's internals |

Each phase ships as its own zip, per the no-patches, full-zip workflow —
not one rewrite delivered at the end.

### 2.6.1 Phase 1 progress (started, not complete)

**Moved** — 6 files with no internal dependency on `nexus-engine.js` /
`nexus-canvas.js` content, safe to relocate with zero risk of breaking
cross-references:
```
mastermind-vault.js          → foundation/vault/
mastermind-siso-jaa.js        → foundation/siso-jaa/
warp-core.js                  → foundation/bus/
mastermind-warp-spine.js      → foundation/bus/
mastermind-foundation.js      → foundation/core/
mastermind-bg.js              → foundation/theme/
mastermind-theme.css          → foundation/theme/  (see finding below)
MASTERMIND_THEME_EXPORT.css   → foundation/theme/
```
Script paths in `index-browser.html` and the electron-builder `files` list
in `package.json` updated to match. Also removed a stray dead `<script
src="bayesian-bg.js">` tag left over from before that file was renamed to
`mastermind-bg.js`.

**Real bug found and fixed in the same pass:** `warp-core.js` and
`mastermind-warp-spine.js` were never added to `package.json`'s
electron-builder file list at all — meaning every packaged Windows build
since the navigation spine was introduced has shipped without it. The app
degrades gracefully when those files are missing (falls back to direct
calls), so this wouldn't have crashed, but the spine — including its
audit trail — would have silently been dead in every installed build.
Fixed as part of updating the file list for the new paths.

**Real finding, not yet acted on:** `mastermind-theme.css` has zero
references anywhere in the codebase. All live styling is inline `<style>`
in `index-browser.html` itself (~260KB, mostly CSS). The file is dead
weight riding along in every build. Relocated it for tidiness since it's
clearly meant to be the theme layer, but actually extracting the real
inline styles out of `index-browser.html` into it is separate, much larger
work — that inline stylesheet is thousands of interdependent lines I can't
safely restructure without being able to render-test the result.

**Real finding, resolved as non-issue:** `mastermind-foundation.js`
already contains a working event bus (`_MM_BUS`), UUID registry
(`MMRegistry`), delta ledger (`MMDelta`), and a second vault-shaped system
(`MMVault`) — genuinely already foundation-shaped, confirming the phase
map's guess. Checked whether `MMVault` (localStorage-based app-state
snapshots/backups/integrity checks) collides with `mastermind-vault.js`
(the AES-256-GCM encrypted auth vault) — it doesn't. Different localStorage
key namespaces, different jobs: one is identity/auth, the other is
snapshot/restore. Both real, both actively called, not dead code. Worth
knowing they're two distinct concerns before anyone tries to merge them
into one "vault" module later.

**Deliberately not moved:** `main.js` and `preload.js` stay at project
root. They're logically foundation (Electron shell), but they're also
Electron's actual entry points — `package.json`'s `"main"` field, the
`electron .` launch command, and electron-builder's packaging all carry
assumptions about root-level placement. Moving them for organizational
tidiness risked breaking the app from launching at all, for a benefit that
doesn't matter until Phase 7 anyway. Not an oversight, a considered call.

**Not started:** extracting `foundation/auth/`, `foundation/shell/`,
`foundation/window-manager/`, and `foundation/canvas-engine/` out of
`nexus-engine.js` / `nexus-canvas.js` themselves. Those aren't standalone
files today — they're clusters of functions embedded in the 14,411-line
monolith with real cross-references throughout. Cutting them out safely
needs the grep-and-map boundary audit this phase already calls for, done
properly, not rushed alongside a file-relocation pass.

### 2.7 Risks / non-goals

- Not a visual redesign — every phase should be invisible to you as a user
  until Phase 7. Same screens, different file boundaries underneath.
- Not a manual data migration — old `localStorage` key gets read once,
  converted to node shape, written through the new API, retired. Not
  re-entering data by hand.
- Real risk: `nexus-engine.js` at 14,304 lines almost certainly has
  functions reaching across what should be module boundaries. Phase 1
  includes an actual grep-and-map audit before Phase 2 starts.

---

## PART 3 — PLANNED: The Becoming Engine

*Connect ALM to Horizon. Model who you're becoming. Seeds for knowledge
toward an end-state. Compounding. A slope for most progress/learning for
least effort. A parallel creativity system with its own slope — closer to
unstable without destabilizing, more novel output. Open loops creating
tension. Mind judo.*

### 3.1 End-State Seeds — built and wired

A seed is a small, concrete belief/practice/skill marker planted because it
points at a Horizon plan's `endState`. Real field on every plan now, not
a spec:
```js
plan.seeds = [
  { id, text, plantedAt, sproutedAt: null }
]
```
Planted and tended from Horizon directly (Seeds section on every plan,
with a 🌱 sprout action). The interconnection this section originally
called dormant is real now: sprouting a seed calls
`window.almWriteDelta('horizon', ...)` — ALM's exposed public entry point
for logging real growth signal, not a reach into its internals — which
writes a real entry to the same Delta Log the `'horizon'` type sat unused
in for months. Verified end-to-end: sprout a seed, confirm the delta
actually lands in `localStorage['mm_alm_deltas']` with the right type and
text, not just that the function runs without throwing.

Same wire, same mechanism, for If-Then Commitments (3.1a below) and
Leverage Map's high-scoring moments (3.3) — one shared substrate, three
real senders into it, all through the one exposed function rather than
three different bespoke integrations.

### 3.1a If-Then Commitments — built and wired

Not originally in this spec — added because it's what "seeds" and
"preemptive problem solving" turn into when they're actionable, not just
observed: `{ ifCondition, thenAction, done, ts }` on every plan, its own
section right below Seeds. Marking one done (not un-doing — verified the
guard against logging on the reverse transition) writes the same kind of
`horizon`-typed delta as a sprouted seed.

### 3.1b AI End-State Generation & Backward Condition-Mapping — built and wired

Inverts how a plan starts. Before this, `horizonNewPlanPrompt()` opened a
blank form — you typed the `endState` first, by hand. This adds an AI-first
entry path: generate speculative end-states, pick one, then AI
backward-maps the conditions that would have to be true to reach it. AI as
provocateur, the person as the one who decides what's real — matches the
existing Void pattern (`voidExpandWhatifAI`, `voidBridgeAI`), reuses its
transport exactly, added zero new AI infrastructure.

**Two functions, both in `nexus-engine.js` next to the other `horizon*`
functions until Phase 5 modularization moves Horizon out:**

- `horizonGenerateEndStates(seedContext)` — `seedContext` optional
  (domain/theme); empty still hands AI real context (recent ALM deltas +
  existing plan titles/endStates via `_horizonAIContext()`), never a blank
  prompt. `aiCall` → JSON array of `{title, endState}`, 5 items, rendered
  as picker cards (`_renderEndStatePicker`) — stays Horizon-scoped, doesn't
  touch canvas nodes.
- `horizonBackmapConditions(planId)` — runs once, immediately after
  `horizonAdoptGeneratedEndState()` creates a plan from a picked end-state.
  `aiCall` → JSON `{conditions, milestones}`, writes into the plan's
  *existing* fields (`horizonAddCondition`/`horizonAddMilestone`) — no new
  data shape.

**Wire target**: same funnel as every other AI feature —
`aiCall → clearglassCall → (NXAPI.cgAsk | userscript fallback)`. No new
transport, no new state store, no vault-node type change. This also means
it inherits every fix already made to that funnel (Page Visibility
windowing, the paste-event injection fallback, etc.) automatically.

**Honest gap carried forward from Part 1, still open**: this only fixes
the *input* side of `plan.slopes`/`plan.deltas` — condition/milestone data
now exists. Computing the slope itself is still 3.2's separate unblocked
work (reading the delta log, deciding what "effort" means, 3.7 Q1).
Backmapped conditions give 3.2 something real to read; they don't compute
a slope on their own.

**3.7.5 resolved as built**: a generated end-state is adopted as a real,
immediately-visible draft plan (matches Void's precedent — spawns
immediately, undo via delete), not held back in the picker until confirmed
twice.

### 3.2 Growth Slope — still not built, now unblocked

The reason it's unblocked: this needed real delta data flowing in before
a slope was computable from anything, and that data now exists — Horizon
seeds/commitments and Leverage Map's high scores all land in the same
delta log. Still genuinely separate work (reading that log, computing a
rate, deciding what "effort" means per open question 3.7 Q1), not
something the interconnection wiring did for free.

Finishes the existing-but-empty `plan.slopes[]`:
```
slope = Δ(progress toward end-state) / Δ(effort invested)
```
A rate, not a total — matches the leverage-equation logic already in your
Mastermind cognitive framework. Progress comes from sprouted seeds +
tagged deltas. Effort needs one decision from you (3.7, Q1). Compounding
shows as the slope's own trend — accelerating (good) vs. flattening
(diminishing returns) — which is the actual point of tracking a rate
instead of a total.

### 3.3 Creativity System — instability slope

Separate metric, measures novelty. Real creativity-theory idea (edge-of-
chaos, flow-at-the-boundary), built with real guardrails since it's about
your own internal state:
- Self-rated (1–10), not algorithmically inferred
- Bounded by a ceiling *you* set — "closer to unstable" always means closer
  to your own stated limit, never a theoretical max
- Reuses Horizon's existing `constraints[]` / `failureModes[]` — no new
  data shape, destabilization risk defined up front like any other plan risk
- No score, streak, or leaderboard — reflective log, not a game
- Every session closes (ties into 3.4)

### 3.4 Open Loops

Deliberately unresolved threads held open for productive tension. New
field on ALM's existing `externalizations[]` (already has `'question'` and
`'hypothesis'` types):
```js
externalization.loop = {
  status: 'open' | 'closed' | 'composted',
  openedAt, closedAt: null,
  revisits: [],  // timestamps — this is the tension signal, made legible
}
```
"Composted" is the escape valve — deliberately released, not forced to
resolution, so loops can't accumulate into an anxiety trap.

### 3.5 Mind Judo

Not a data store — a response layer reading signals from 3.2–3.4.
Triggers: a slope flattening on an actively-logged plan, an open loop with
revisits but no movement, a high-instability session with no resolution.
Response is always redirect, never push: reframe resistance as data,
suggest a smaller adjacent action, or offer to compost. Sits on top of the
other three, no vault-node type of its own.

### 3.6 Where this lives

`modules/becoming/` — reads Horizon and ALM only via bus events, per the
hard rule in Part 2.1. New events: `alm.delta.logged`, `horizon.plan.updated`,
`becoming.seed.planted`, `becoming.seed.sprouted`, `becoming.slope.updated`,
`becoming.loop.opened` / `.closed` / `.composted`. New vault-node types
under `module: 'becoming'`: `seed`, `slope-snapshot`, `loop`.

### 3.7 Open questions

1. **Effort proxy** — time logged, session count, or a 1–10 self-rating at
   log time? Whichever you'll actually fill in consistently beats the
   "best" metric you skip.
2. **Becoming's own module + UI, or a lens over Horizon/ALM's existing
   screens?**
3. **Instability ceiling** — set once and revisited occasionally, or
   re-declared per session?
4. **Build order** — against the current monolith now, or held until
   Horizon + ALM land on the bus in Phase 5/5.5?
