# Leverage Map

**Status:** v1.0.0 — built, first real module in `modules/`.

## What it is

The leverage equation, ported from the old v7 prototype and confirmed
real there (not just documented) before porting:

```
L = Tension × Weight × Slope   (each 0–10, score normalized to 0–10)
```

A node's leverage score tells you how much productive tension it holds,
how consequential it is, and how fast it's moving — multiplied together
because a high score on only one axis isn't leverage, it's noise.

## Why it's a lens, not a parallel canvas

The old prototype built leverage as its own force-directed canvas with
its own node array (`lvgNodes`), completely disconnected from the real
Mind Map. That's the monolith pattern this port deliberately avoids.

Here, any real Mastermind canvas node (`CANVAS.NX.nodes[i]`) can carry
`tension`, `weight`, `slope`, and `lvgKind` fields directly. They're just
more properties on the same node object — which means:

- They persist through the canvas's existing save/autosave path. No new
  storage code was written for this.
- Leverage-scored nodes show up everywhere else a canvas node already
  shows up (Brain Map's canvas-node tagging, search, etc.) without any
  extra wiring.
- Access is a tab in the existing side panel (`LVG`, next to DETAIL /
  CONNS / DELTAS / STATS), not a new sliding panel with its own open/
  close mechanics.

## Files

- `engine.js` — pure scoring logic (`lvgCalcScore`, `lvgMutationProbability`,
  `lvgScoreColor`). No DOM. Safe to unit-test in isolation.
- `ui.js` — the LVG side-panel tab, slider wiring, and the canvas-wide
  "leverage view" toggle that recolors/glows real node elements by score.
- `events.js` — the bus contract. Two real Gates registered on `MM_WARP`:
  `leverage.node.scored` and `leverage.node.kind_set`.

## Bus contract

```
emits:   leverage.node.scored     { id, score, tension, weight, slope }
         leverage.node.kind_set   { id, kind }
listens: none yet
```

The Becoming Engine (`NEXUS-SPEC.md` Part 3) is the intended consumer of
`leverage.node.scored` for Growth Slope — it should listen for these
events rather than Leverage Map reaching into Becoming's state. That's
the correct dependency direction per the module contract: nothing reaches
across module boundaries except through the bus.

## Entry point

Toolbar button `◈ LVG` (next to `∿ SYS`) opens the side panel to the
Leverage tab. Select a node on the canvas first — the tab shows "select a
node to score" until one is selected. Sliders write directly onto that
node; the kind buttons (FRICTION / LEVERAGE / NEUTRAL) set `lvgKind`.
"Toggle Leverage View" recolors every scored node's glow/outline by score
across the whole canvas, not just the selected one.

## Not built yet

- No mutation/synthesis action wired to the mutation-probability readout
  yet — v7 only ever *displayed* that number too, never acted on it, so
  this isn't a regression, just an honest note that it's descriptive for
  now, not yet a trigger for anything.
- No dedicated force-directed "leverage overview" — you use the real
  canvas's existing pan/zoom/layout. If a distinct high-level view (e.g.
  "show me only nodes scoring above 7") turns out to be wanted, that's a
  filter/query feature to add to `ui.js`, not a new canvas.
