# MODULE.spec — the module contract

| | |
|---|---|
| **Spec version** | 1 (draft — not yet implemented) |
| **Project version** | 0.1.8 |
| **Owner** (§17.1) | James Brooks |
| **Lifecycle** (§17.2) | **Specified.** Nothing built against it yet. |
| **Governs** | how a module is loaded, where its UI lives, how it talks to anything outside itself |

§8.5: the spec comes before the build. This one is written first because
the extraction it describes touches ~5,000 lines of `index-browser.html`,
and a refactor of that size done without an agreed boundary produces a
differently-shaped monolith.

---

## 1. The problem, measured

| | |
|---|---|
| `index-browser.html` | 5,143 lines — markup, styles and screens for every module |
| `nexus-engine.js` | ~6,400 lines |
| Modules that own their own DOM today | 2 of 8 (`alm`, `leverage-map`) |
| Modules with a `ui.js` | 3 of 8 |

ALM proves the pattern already works: it builds `#mm-alm-overlay` itself
at runtime, its only external touch point is `openALM()`, and it was
extracted from the monolith without changing behaviour. Everything below
generalises what ALM already does.

## 2. The contract

A module is a folder under `modules/<id>/` containing:

```
modules/<id>/
  module.json     manifest — id, title, uuid, version, events in/out
  engine.js       state + logic. NO DOM. Testable headless.
  ui.js           owns its own DOM. Builds its overlay, tears it down.
  ui.css          its styles, scoped under #mm-<id>-overlay
  README.md       what it is, what it owns
```

**Rules**

1. **A module never reaches outside its own overlay.** No
   `getElementById` for anything it did not create.
2. **A module never calls another module.** Cross-module effects go
   through the bus. `openALM()` from a homepage card is a bus event, not
   a function call across a boundary.
3. **The foundation never reaches into a module.** It emits, and it
   provides services (vault, bus, log, session, dialogs).
4. **Persistence is a request, not a write.** A module returns its state
   from `serialize()` and receives it in `hydrate()`. It never touches
   the vault, localStorage, or the filesystem. This is what keeps the
   "nothing outside the vault" rule enforceable — a module with its own
   save path is a hole in it.
5. **`engine.js` has no DOM.** That is what makes it testable, and every
   module that follows this rule gets a headless test suite for free.

## 3. Events

Named `mm.<module>.<verb>`. The manifest declares what a module emits
and what it listens for, so the wiring is inspectable without reading
the code.

**Foundation → module**

| Event | Meaning |
|---|---|
| `mm.module.open` | show yourself |
| `mm.module.close` | tear down, release timers and RAF |
| `mm.module.resume` | open at `{ tab }` — from a resumed session |
| `mm.vault.loaded` | `hydrate(state)` is now safe |
| `mm.vault.saving` | return your state from `serialize()` |

**Module → foundation**

| Event | Meaning |
|---|---|
| `mm.module.ready` | loaded, registered, with uuid + version |
| `mm.module.dirty` | I changed something — schedule a save |
| `mm.<id>.*` | anything domain-specific |

## 4. Migration order

Smallest and best-isolated first, so the contract is proven on easy
cases before it meets a hard one. Each step ships and is verified
before the next begins (§3.2 — one thing at a time, verified).

1. `memory` — has `engine.js` + `ui.js` already, 11 passing tests
2. `leverage-map` — already has `events.js`, closest to the contract
3. `alm` — already owns its DOM; mostly manifest + CSS extraction
4. `voice-lattice`, `pattern-engine`, `lattice`, `capture`, `ai-status`
5. `brain-map`, `spatial-void`, `canvas` — the big ones, last, because
   they are the most entangled with the toolbar and each other

## 5. What this unlocks

Every item in the 2026-08-12 design notes — the node schema, the session
ledger, the voice lattice, the ideation pipeline, spatial void, ALM
feedback loops, the intelligence system — needs the same two things:
a shared node envelope, and a way for a module to record events without
owning its own storage. Rules 4 and 5 above are that. The contract is
not a tidiness exercise; it is the dependency under the whole roadmap.

## 6. Not decided yet

- **Node schema.** Needs its own spec. Shared envelope
  (`id`, `type`, `created`, `source`, `provenance`, `links[]`) plus a
  typed payload, per DR-003's provenance requirement.
- **Session/capture event log.** Whether modules append to one shared
  log or keep per-module logs projected into one view.
- **CSS isolation mechanism.** Scoped selectors are the cheap answer;
  shadow DOM is the correct one and would break the existing theme
  variables. Not resolved.
