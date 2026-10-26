# @spatial/liminal — The Gap Detection System

**v1.0.0 · UUID: lim-pkg-0000-0000-1000-0000-000000000001**

> *"GapHunter surfaces the structure of what is NOT being said, NOT being thought, or NOT being seen."*

The Liminal system detects **200+ named gap types** across 60+ domains.  
Every module is isolated — no module calls another. All coupling is via named event channels.  
The kernel is the API. The bus is the only wire.

---

## Architecture

```
@spatial/liminal
│
├── bus/               — LiminalBus: event fabric, all channels
│   └── index.js       — LIM channel registry, createBus()
│
├── core/              — shared taxonomy, types, utilities
│   └── index.js       — GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, classifySigma()
│
├── kernel/            — LiminalKernel: API engine
│   └── index.js       — boots all modules, exposes clean API, owns ledger
│
├── modules/           — gap detectors, each fully isolated
│   ├── assumption/    — load-bearing assumptions treated as facts
│   ├── shadow/        — present-but-unspoken content
│   ├── contrastive/   — word/behavior/body divergence
│   ├── negative-space/ — systematic avoidance, circling without landing
│   ├── structural/    — frame, presupposition, power geometry
│   ├── reversal/      — meaning inversions ("fine" meaning not fine)
│   ├── field/         — oscillation, edges, plateaus, field geometry
│   ├── relational/    — gaslighting, manipulation, communication gaps
│   ├── oscillatory/   — sigma regime, pendulum, intermittent reinforcement
│   ├── music/         — harmonic, lyric, rhythm, songwriting gaps
│   ├── code/          — language-specific + architectural code gaps
│   └── existential/   — identity, values, meaning, purpose, shadow
│
└── index.js           — package entry point, all exports
```

---

## Module Isolation Contract

```
§B1  Zero cross-module imports. All coupling via LIM.* channel strings.
§B2  All errors surface as LIM.ERROR events. Never throws to caller.
§B3  All events are immutable once emitted.
§C1  No module imports from another module. Only from core/.
§C2  All outputs are signals. Not diagnoses. Not judgments.
§K1  No module calls another. All via bus.
§K2  All errors as events.
§K3  The kernel never interprets signals. It routes them.
```

---

## Quick Start

```js
import { createLiminal, LIM } from '@spatial/liminal';

const kernel = createLiminal({ debug: false });

// Subscribe to all gap events
kernel.on('lim.gap.*', gap => {
  console.log(`[${gap.type}/${gap.subtype}] score=${gap.score} — ${gap.description}`);
  console.log(`  question: ${gap.loadBearingQuestion}`);
});

// Subscribe to composites only (windowed aggregation)
kernel.on(LIM.GAP_COMPOSITE, ({ gaps, pressure, dominantType, sigma }) => {
  console.log(`composite: ${gaps.length} gaps, pressure=${pressure}, sigma=${sigma}`);
});

// Process messages
kernel.process({ text: "That never happened.", author: 'alex', ts: Date.now() });
kernel.process({ text: "I'm fine. It doesn't matter.", author: 'alex' });
kernel.process({ text: "Everyone always does this.", author: 'alex' });
kernel.process({ text: "try { doThing() } catch (e) {}", source: 'code' });

// Query
const top5    = kernel.topGaps(5);
const relGaps = kernel.query({ domain: 'abuse_manipulation', minScore: 0.6 });
const summary = kernel.summary();
```

---

## Channel Map

| Channel | Module | Payload |
|---------|--------|---------|
| `lim.ingest` | kernel | `{ text, author, ts, id, platform? }` |
| `lim.ingest.translated` | kernel | `{ id, text, resonanceText, author, ts, surfaceType }` |
| `lim.gap.assumption` | AssumptionModule | GapSignal |
| `lim.gap.shadow` | ShadowFieldModule | GapSignal |
| `lim.gap.contrastive` | ContrastiveModule | GapSignal |
| `lim.gap.negative_space` | NegativeSpaceModule | GapSignal |
| `lim.gap.structural` | StructuralAssumptionModule | GapSignal |
| `lim.gap.reversal` | ReversalModule | GapSignal |
| `lim.gap.field` | FieldModule | GapSignal |
| `lim.gap.relational` | RelationalModule | GapSignal |
| `lim.gap.oscillatory` | OscillatoryModule | GapSignal |
| `lim.gap.music` | MusicModule | GapSignal |
| `lim.gap.code` | CodeModule | GapSignal |
| `lim.gap.existential` | ExistentialModule | GapSignal |
| `lim.gap.*` | all | wildcard — every gap event |
| `lim.gap.composite` | kernel aggregator | `{ gaps[], pressure, dominantType, sigma }` |
| `lim.gap.shadow.field` | ShadowFieldModule | `{ text, signals[], score }` |
| `lim.gap.field.update` | kernel | `{ entityId, field }` |
| `lim.error` | bus | `{ source, error, stack }` |
| `lim.module.ready` | each module | `{ moduleId, version }` |
| `lim.ready` | kernel | `{ module, version }` |

---

## GapSignal Shape

Every module emits `GapSignal` objects:

```ts
{
  id:                   string          // unique UUID
  moduleId:             string          // which module detected this
  type:                 GAP_TYPE        // logical | evidential | temporal | assumption | ...
  subtype:              string          // specific sub-classification
  domain:               DOMAIN          // epistemological | code | relational | music | ...
  score:                number          // 0–1 detection confidence
  criticality:          number          // 0–1 how load-bearing this gap is
  description:          string          // human-readable gap description
  reason:               GAP_REASON[]    // why this gap exists
  evidence:             string[]        // detection signals
  textExcerpt:          string          // source excerpt (max 200 chars)
  loadBearingQuestion:  string          // the question that opens this gap
  axes:                 Axis[]          // contributing detection axes with scores
  asAbove:              string?         // scale-invariant analogue (As Above So Below)
  signal_note:          string          // always: "This is a detected pattern, not a judgment."
  author:               string?
  ts:                   number
}
```

---

## Kernel API

```ts
kernel.process(msg)              // run message through all modules → message ID
kernel.processBatch(msgs[])      // sorted batch processing → ID[]
kernel.query(filters)            // query ledger: { domain, type, minScore, limit, openOnly }
kernel.topGaps(n)                // top N gaps by criticality × score
kernel.pressure(n)               // gap pressure sequence (last N values)
kernel.summary()                 // full session summary with patterns
kernel.resolve(gapId, resolution)// mark gap as addressed
kernel.on(channel, fn)           // subscribe → returns unsubscribe fn
kernel.module(name)              // direct module access
kernel.history(prefix, n)        // bus event history
```

---

## Gap Taxonomy

### 16 Gap Types

`logical` `evidential` `temporal` `definitional` `reference` `obligation`  
`assumption` `contradiction` `identity_attack` `consent` `boundary`  
`hierarchy` `coercion` `isolation` `oscillatory` `condition`

### 9 Reasons Gaps Exist

| Reason | Description |
|--------|-------------|
| `compression` | Too much information, not enough bandwidth |
| `avoidance` | Content too threatening to hold consciously |
| `compatibility` | Two systems that cannot fully interoperate |
| `attention` | Finite attention cannot cover everything |
| `emotional_occlusion` | Strong emotion casts a blind spot |
| `narrative_soothing` | The story needs the gap to hold together |
| `identity_reflection` | The gap protects an identity |
| `deferred_variable` | Known to exist, explicitly not processed yet |
| `structural_limit` | The system cannot represent the content |

### Sigma Regimes (for sequences)

| Regime | Meaning |
|--------|---------|
| `STABLE` | Gap pressure consistent, system coherent |
| `DEGRADED` | Slow upward slope, normalisation risk |
| `COLLAPSING` | Accelerating pressure, hard edge approaching |
| `OSCILLATORY` | Cycling without resolution — most dangerous |

---

## Invariants

1. The most critical gap is the one most avoided.  
2. Assumption gaps are always more load-bearing than they appear.  
3. Temporal gaps compound — small errors grow with time.  
4. Contradiction gaps generate energy — the oscillation is fuel if redirected before collapse.  
5. The observer always has blind spots that cannot be seen from inside the observation.  
6. Normalisation hides accumulation — point-in-time analysis misses what longitudinal reveals.  
7. Every system is optimised for what it actually rewards, not for what it says it values.  
8. The frame determines what can be found — the most important gaps are often outside the frame.  
9. Completeness is an illusion that causes premature closure.  
10. **The gap in the gap detector is the most dangerous gap.**

---

## Integration with @spatial/kernel

The Liminal system integrates with the spatial kernel via the `CH.GAP_*` channels:

```js
// In spatial kernel — wire liminal into the spatial bus
import { createLiminal, LIM } from '@spatial/liminal';
import { CH } from '@spatial/bus';

const liminal = createLiminal();

// Bridge: spatial bus → liminal
spatialBus.on(CH.UTL_TRANSLATED, ({ id, resonanceText, author, ts }) => {
  liminal.process({ text: resonanceText, author, ts, id });
});

// Bridge: liminal gaps → spatial bus
liminal.on(LIM.GAP_COMPOSITE, (composite) => {
  spatialBus.emit(CH.GAP_COMPOSITE, composite);
});

liminal.on('lim.gap.*', (gap) => {
  spatialBus.emit(CH.GAP_DETECTED, gap);
});
```
