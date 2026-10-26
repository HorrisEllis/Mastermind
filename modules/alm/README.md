# ALM — Accelerated Learning Module

**Status:** v2.0.0 — extracted from the `nexus-engine.js` monolith this
session, not rewritten. Same real implementation, physically moved.

## What moved

1,410 lines, previously embedded directly in `nexus-engine.js` between
two comment banners that had been sitting there since before this
extraction — one literally said `Stub — full implementation in next
iteration`, followed immediately by the real v2.0 implementation. That
was the exact boundary used to cut the block out cleanly.

- `COGNITIVE_FUNCTIONS`, `HUMAN_MODELS`, `ALM_STATE`, `almLoad`/`almSave`,
  `_almTimeAgo` → `engine.js` (state + pure data, no DOM)
- Every tab's render function and every button handler → `ui.js`
- Nothing changed about how any of it works — same functions, same
  data shapes, same tab structure. This was a relocation, not a rewrite.

Verified zero external references from the rest of `nexus-engine.js`
into ALM's internals before extraction — it was already well-isolated,
which is why the cut was clean. The only external touch point is the
global `openALM()` call from the homepage card (routed through the WARP
spine, `foundation/bus/mastermind-warp-spine.js`), which works exactly
the same whether `openALM` is defined in the monolith or in `ui.js` —
that's the actual point of a module boundary.

## Tabs

Cognitive Functions, 8 Models, Experiment, Externalize, Heuristics,
Frameworks, **Feedback Loops** (new — see below), Log.

## Feedback Loops — real, not a header claim

ALM's own header has said `ACCELERATED LEARNING · COGNITIVE FUNCTIONS ·
HUMAN MODELS · FEEDBACK` since before this extraction, with no tab
behind the "FEEDBACK" part. Built for real this pass:

```js
ALM_STATE.feedbackLoops = [
  { id, trigger, observation, adjustment,
    loopType: 'reinforcing' | 'balancing' | 'broken', ts }
]
```

Typed as a real systems-thinking unit, not a diary entry — reinforcing
(amplifies itself), balancing (self-corrects), or broken (should
self-correct but doesn't, which is worth naming on its own rather than
lumping in with the other two). Persists through the same
`Object.assign`/spread pattern `almLoad`/`almSave` already used for
every other field — no new storage code needed, same design win as
Leverage Map's node fields.

## Files

- `engine.js` — state + pure domain data
- `ui.js` — all 8 tabs' rendering and handlers
- `events.js` — bus contract (see below)

## Bus contract

```
emits:   alm.function.logged, alm.model.logged, alm.experiment.logged,
         alm.externalize.logged, alm.heuristic.added, alm.framework.added,
         alm.feedback.logged
listens: none yet
```

This is the real wire for `NEXUS-SPEC.md` Part 3 (the Becoming Engine).
The delta log's `'horizon'` type has existed since before this
extraction, declared and never used — Becoming, when it's built, is the
intended listener for these events. ALM doesn't reach into Becoming's or
Horizon's state directly, same one-way dependency direction as
Leverage Map's `leverage.node.scored`.

## Not done

- **Meta-cognition** — not built. ALM's Cognitive Functions tab already
  *is* a meta-cognition tool (tracking your own thinking-about-thinking
  by function), so building something else called "meta-cognition"
  without knowing what's actually wanted risked building a redundant
  second version of a tab that already exists. Needs a real answer to
  "what specifically, beyond Cognitive Functions" before this gets built.
- Model/Experiment/Externalize/Frameworks/Log tabs weren't touched
  beyond the physical move — no new capability added to those this pass,
  only Feedback Loops.
