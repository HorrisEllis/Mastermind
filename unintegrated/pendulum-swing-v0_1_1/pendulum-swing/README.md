# Pendulum Swing v0.1.1

Signal rhythm analysis kernel. Tracks named signals over time and computes measurable rhythm properties.

## What it measures

- **Period** — time between equivalent states in the signal
- **Amplitude** — distance from mean to peaks (positive and negative separately)
- **Damping** — whether swings are stabilizing, amplifying, or holding steady
- **Phase** — where in the current cycle the signal sits right now
- **Forced** — whether the signal is being held from its natural position

## What it does not do

- Does not interpret signals — interpretation is the layer above this
- Does not claim precision with insufficient data — outputs explicit confidence scores
- Does not connect to external systems — all external connections go through `kernel.observe()` only
- Does not silently fail — throws on invalid input, causality violations, or corrupt state

## Requirements

- Node.js 14+
- No external dependencies

## Installation

```bash
# No npm install required — zero dependencies
node test/test.js   # verify 36/36 pass
```

## Quick start

```js
const ps = require('./src/kernel');

// Initialize — creates data file if it doesn't exist
ps.init();
// or: ps.init('/path/to/your/data.json')

// Record an observation
// observe(signalId, value, source, timestamp)
// - signalId: any string name for the signal
// - value: any number (normalize to 0-1 recommended but not required)
// - source: string describing what produced this observation
// - timestamp: Unix ms (optional, defaults to Date.now())
ps.observe('valence', 0.71, 'ase-scan', Date.now());

// Get the full rhythm profile
const p = ps.profile('valence');
console.log(p.profile.period.value);      // estimated period in ms, or null
console.log(p.profile.phase.position);    // 'trough' | 'rising' | 'peak' | 'falling'
console.log(p.profile.damping.direction); // 'damping' | 'amplifying' | 'neutral'
console.log(p.profile.forced.isForced);   // boolean
console.log(p.profile.forced.tensionScore); // 0-1

// List all tracked signals
ps.signals();
// [ { id: 'valence', observationCount: 1, createdAt: ..., updatedAt: ... } ]

// Compare two signals
const cmp = ps.compare('valence', 'arousal');
console.log(cmp.inPhase);      // boolean
console.log(cmp.inAntiPhase);  // boolean
console.log(cmp.phaseDelta);   // 0-1, or null if insufficient data
console.log(cmp.periodRatio);  // ratio of periods, or null

// Snapshot state (for backup or external persistence)
const snap = ps.snapshot();
ps.restore(snap);

// Remove a signal
ps.remove('valence');
```

## File structure

```
pendulum-swing/
  src/
    math.js       pure signal math — no I/O, no side effects
    store.js      observation storage, atomic disk writes
    kernel.js     public interface — all interaction goes through here
  test/
    test.js       36 tests, zero external dependencies
  seed.js         historical seeder — loads dated observations from source data
  pendulum-data.json   persisted signal state (created on first run)
  package.json
  README.md
```

## Signal status

A signal moves through three states:

| Status | Meaning |
|--------|---------|
| `NO_DATA` | No observations recorded |
| `WARMING` | Fewer than 3 observations — math runs but confidence is low |
| `ACTIVE` | 3+ observations — all properties computed |

Period and phase estimates require multiple full cycles. Until enough cycles exist, `period.value` returns `null` and `period.reason` explains why.

## Causality enforcement

Observations must be submitted in chronological order. Submitting an observation with a timestamp earlier than the last recorded observation throws:

```
PENDULUM: out-of-order timestamp. New ts X < last ts Y
```

This is intentional. Cause must precede effect.

## Seeding historical data

Use `seed.js` as a template for loading historical observations with known dates:

```js
// Each observation needs: date, signal, value, source, quality
kernel.observe('valence', 0.08, 'source-name:confirmed', new Date('2025-09-28').getTime());
kernel.observe('valence', 0.71, 'source-name:confirmed', new Date('2026-10-13').getTime());
```

Label quality as `confirmed` (explicit date in source) or `estimated` (inferred from context).

## External connections

The single intake point is `kernel.observe()`. Wire any external signal source to this method. No other entry points exist at v0.1.1.

Suggested pattern for Guardian or event bus integration:

```js
// In your Guardian listener or event bus handler:
const ps = require('./pendulum-swing/src/kernel');
ps.init('/path/to/shared/pendulum-data.json');

eventBus.on('signal:observed', function(event) {
  ps.observe(event.signalId, event.value, event.source, event.ts);
});
```
