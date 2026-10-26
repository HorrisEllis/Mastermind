# NEXUS-CODEC — Behavioral Invariant Baseline Engine
## Phase Map v1.0
**Scope:** `codec.js` — new `InvariantBaseline` class + wiring into `TranscriptEngine._flushBatch()`  
**Depends on:** existing `RollingStats`, `AssociationEngine`, `TranscriptEngine`  
**Status:** Phase 0 — Audit complete. Build not started.

---

## 1. The Problem Precisely

`RollingStats` currently measures deviation from a **chasing mean** — a rolling window of the last 20 samples. The mean moves with the signal. This is good for moment-to-moment anomaly detection but useless for answering:

> "Is this person's energy right now anomalous relative to *who they normally are*?"

The rolling mean cannot answer that because it forgets the session opening and adapts to the current state. If someone enters a sustained high-friction state for 5 minutes, the rolling mean rises to match it and stops flagging it as anomalous. **The window normalizes the deviation away.**

A behavioral invariant baseline is computed once — from the first N batches of a session — and then held fixed. Every subsequent batch is scored against that fixed reference. Deviation from the baseline is the signal. The baseline is the invariant.

---

## 2. What Needs to Exist

### 2.1 Signal Axes to Baseline

Per-batch signals already emitted by `TranscriptEngine._flushBatch()`:

| Signal | Current form | Baseline target |
|---|---|---|
| `sentiment.score` | `RollingStats` mean/sigma | fixed session baseline mean + sigma |
| `friction.density` | raw per-batch value | fixed baseline mean + sigma |
| `wordCount` | `RollingStats` | fixed baseline mean + sigma |
| `wordCountStats.delta` | rolling | derived from baseline |
| Audio: `energy` | `RollingStats` in `GPGPUAudioProcessor` | fixed baseline per session |
| Audio: `cadence` | `RollingStats` in `GPGPUAudioProcessor` | fixed baseline per session |
| Video: `motionScore` | `RollingStats` in `GPGPUVideoProcessor` | fixed baseline per session |
| Video: `luminance` | `RollingStats` | fixed baseline (lighting = invariant) |

### 2.2 Content Invariant × Signal Correlation

`AssociationEngine.invariants()` already produces `{ words: [...] }` — topic anchors stable across ≥80% of nodes.

The missing layer: for each content invariant word, track what the signal axes look like in batches that *contain* that word vs. batches that *don't*. This is the content→signal correlation map.

Example output:
```
invariant: "pain"
  energy when present:    mean=0.42, sigma=0.08
  energy when absent:     mean=0.31, sigma=0.06
  Δ energy:               +0.11 (35% elevation)
  friction when present:  mean=0.28, sigma=0.11
  friction when absent:   mean=0.09, sigma=0.04
  Δ friction:             +0.19 (2.1σ above baseline)
```

This answers: "every time 'pain' appears, energy is 35% above baseline and friction is 2.1σ above the session norm."

---

## 3. Architecture

### 3.1 `InvariantBaseline` class (new, in codec.js)

```
InvariantBaseline
  │
  ├── _warmupBatches: []          — first N batches collected during warmup
  ├── _warmupN: 5                 — batches needed to establish baseline
  ├── _locked: false              — true once baseline is frozen
  │
  ├── _baseline: {                — frozen after warmup
  │     sentiment:  { mean, sigma }
  │     friction:   { mean, sigma }
  │     wordCount:  { mean, sigma }
  │     energy:     { mean, sigma }   ← fed from GPGPUAudioProcessor
  │     cadence:    { mean, sigma }   ← fed from GPGPUAudioProcessor
  │   }
  │
  ├── _contentSignalMap: Map<word, {  — invariant word → signal stats
  │     present: { energy, friction, sentiment, wordCount }   ← RollingStats each
  │     absent:  { energy, friction, sentiment, wordCount }   ← RollingStats each
  │   }>
  │
  ├── feed(batch, audioFrame?)    — call every _flushBatch; builds warmup or scores
  ├── score(batch, audioFrame?)   — returns baselineScore payload
  ├── lock()                      — freeze baseline manually (skip remaining warmup)
  ├── isLocked                    — getter
  └── reset()
```

### 3.2 Warmup Phase

First `_warmupN` batches (default 5, ~50 seconds of speech) are collected without scoring. On batch N+1, the baseline is computed from the warmup set and frozen:

```
baseline.sentiment.mean  = mean(warmup[*].sentiment.score)
baseline.sentiment.sigma = stddev(warmup[*].sentiment.score)
// same for friction.density, wordCount, energy, cadence
```

Rationale for 5 batches: enough samples for a stable Welford estimate, short enough to not miss important session-opening state. Configurable.

### 3.3 Scoring (post-warmup)

Every batch after lock produces a `baselineScore` payload:

```js
{
  locked:    true,
  warmupN:   5,

  // Per-signal z-scores against baseline (not rolling mean)
  sentiment: {
    baseline: { mean, sigma },
    current:  score,
    delta:    score - baseline.mean,           // Δ from baseline
    zScore:   (score - baseline.mean) / baseline.sigma,
    anomaly:  |zScore| > 2.0,
  },
  friction: { baseline, current, delta, zScore, anomaly },
  wordCount: { baseline, current, delta, zScore, anomaly },
  energy:    { baseline, current, delta, zScore, anomaly },
  cadence:   { baseline, current, delta, zScore, anomaly },

  // Composite: how many axes are simultaneously anomalous
  anomalyCount:  3,                            // N axes above threshold
  anomalyAxes:   ['friction', 'energy', 'cadence'],
  compositeZ:    2.4,                          // mean z-score across all axes
  alert:         true,                         // compositeZ > 1.8

  // Content invariant correlations (populated once invariants exist)
  contentCorrelations: [
    {
      word: 'pain',
      present: { energy: { mean, sigma }, friction: { mean, sigma } },
      absent:  { energy: { mean, sigma }, friction: { mean, sigma } },
      energyLift:   0.11,    // mean energy delta when word present
      frictionLift: 0.19,    // mean friction delta when word present
      frictionZ:    2.1,     // how many sigma above absent-baseline
    }
  ],
}
```

### 3.4 Content × Signal Map — update logic

After baseline is locked, for every new batch:

1. Get content words from `AssociationEngine` (same `_contentWords()` logic)
2. Get current invariant words from `AssociationEngine.invariants().words`
3. For each invariant word:
   - If present in current batch → feed `energy`, `friction`, `sentiment`, `wordCount` into `present` RollingStats
   - If absent → feed into `absent` RollingStats
4. Compute lift = `present.mean - absent.mean` for each signal axis
5. Compute frictionZ = `(present.friction.mean - baseline.friction.mean) / baseline.friction.sigma`

---

## 4. Wiring

### 4.1 Into `TranscriptEngine`

`TranscriptEngine` owns `_friction`, `_assoc`, `_predictor`, `_sentiment`, `_wordCount`. Add:

```js
this._baseline = new InvariantBaseline();
```

In `_flushBatch()`, after existing analytics:

```js
const baselineScore = this._baseline.feed({
  sentiment:  sentimentScore,
  friction:   frictionResult.density,
  wordCount,
  text,
  assoc:      this._assoc,   // pass ref for invariant word lookup
});
```

Add `baselineScore` to the `onBatch` payload.

### 4.2 Audio frame injection

`GPGPUAudioProcessor` emits frames independently of batches. `TranscriptEngine` needs to track the latest audio frame values so they can be passed into `InvariantBaseline.feed()` at flush time.

In `NexusCodec.start()`, the audio processor already fires `onAudioFrame`. Add to the codec:

```js
this._lastAudioFrame = null;
// in GPGPUAudioProcessor onFrame callback:
this._lastAudioFrame = frame;
// pass to transcript engine on each batch flush:
// transcript._baseline.feedAudio(this._lastAudioFrame)
```

Or: pass `lastAudioFrame` into `_flushBatch()` directly — simpler, no architectural change.

### 4.3 Into `BatchLogger`

`BatchLogger.log(batch)` already extracts fields. Add:

```js
baselineAlert:   batch.baselineScore?.alert ?? false,
compositeZ:      batch.baselineScore?.compositeZ ?? 0,
anomalyAxes:     batch.baselineScore?.anomalyAxes ?? [],
contentCorr:     batch.baselineScore?.contentCorrelations ?? [],
```

### 4.4 ALK kernel event (Phase 3 forward)

When `baselineScore.alert === true`, emit:

```js
kernel.emit('alk.behavior.baseline.alert', {
  sessionId,
  compositeZ:    baselineScore.compositeZ,
  anomalyAxes:   baselineScore.anomalyAxes,
  contentCorr:   baselineScore.contentCorrelations,
  batchId,
});
```

---

## 5. Invariants (§1.1)

| Invariant | Rule |
|---|---|
| Baseline is frozen, never updated | Once `_locked = true`, `_baseline` values never change. The rolling mean is not the baseline. |
| Warmup batches are not scored | No `baselineScore` is emitted until `_locked = true`. Payload field is `null` during warmup. |
| Warmup progress is reported | Batch payload includes `{ baselineScore: { locked: false, warmupProgress: n/N } }` during warmup so UI can show "calibrating (3/5)". |
| Content invariants require minimum nodes | `contentCorrelations` is empty until `AssociationEngine` has ≥3 nodes and at least one invariant word. |
| Signal anomaly threshold is per-axis | Each axis has its own threshold. Composite alert fires when `compositeZ > 1.8` — not when any single axis crosses 2σ. Single-axis crossings are reported but do not fire alert. |
| Audio baseline requires audio frames | If no audio frames have been received during warmup (e.g. audio-off session), energy and cadence baseline axes are marked `unavailable` and excluded from composite scoring. |
| §1.1 — labels are signal, not diagnosis | `alert: true` means "multi-axis deviation from this person's own session opening". It does not mean stress, deception, or distress. |

---

## 6. Phase Breakdown

### Phase 1 — `InvariantBaseline` class (codec.js only)
- `InvariantBaseline` class with warmup, lock, `feed()`, `score()`
- No content correlation yet — just signal axes (sentiment, friction, wordCount)
- Wired into `TranscriptEngine._flushBatch()`
- `baselineScore` added to `onBatch` payload
- `BatchLogger` updated to log alert fields
- No audio axes yet

**Exit criteria:** `onBatch` payload contains `baselineScore` with correct z-scores after 5 batches. `baselineScore.locked === false` during warmup with `warmupProgress` field.

### Phase 2 — Audio axis injection
- `NexusCodec` tracks `_lastAudioFrame`
- `_flushBatch()` receives latest audio frame
- `InvariantBaseline.feedAudio()` incorporates energy + cadence into baseline and scoring
- Baseline energy/cadence from warmup audio frames

**Exit criteria:** `baselineScore.energy` and `baselineScore.cadence` populated with correct z-scores.

### Phase 3 — Content × Signal correlation map
- `_contentSignalMap` built from invariant words × signal axes
- `contentCorrelations` array in `baselineScore` payload
- Lift and frictionZ computed per invariant word

**Exit criteria:** After 10+ batches, `baselineScore.contentCorrelations` contains correct per-word energy and friction lift values.

### Phase 4 — ALK kernel event + BehaviorModule integration
- `alk.behavior.baseline.alert` event emitted on composite alert
- `BehaviorAnalysisModule` subscribes and enriches interpretation strings with baseline context
- Video module motion baseline fed from `GPGPUVideoProcessor` session mean

**Exit criteria:** ALK event log shows `alk.behavior.baseline.alert` with correct payload. BehaviorModule interpretation references baseline deviation.

---

## 7. Open Questions

1. **Warmup window size** — 5 batches (~50s) is the proposal. Too short for people who need several minutes to settle into natural speech. Should it be configurable per session, or auto-extended if variance during warmup is high (unstable opening)?

2. **Session re-baselining** — if a session runs for 2 hours, the 5-batch opening may no longer represent the person's norm. Should the baseline optionally re-lock at a midpoint (e.g. every 30 min)?

3. **Cross-session baseline** — eventually: persist the baseline across sessions for the same user. "This person's baseline energy is 0.31 across all sessions" vs. "today's baseline is 0.44 — already elevated at session start." This is a `BatchLogger` / storage concern, not a codec concern.

4. **Video baseline** — `GPGPUVideoProcessor` has its own `RollingStats` for motion and luminance but no session baseline. Phase 4 proposes feeding video into the baseline. Should video get its own `InvariantBaseline` instance or share one with audio?

5. **Composite alert threshold** — `compositeZ > 1.8` is the proposal (lower than per-axis 2σ because multi-axis co-occurrence is rarer). Needs empirical tuning. Should it be exposed as a configurable constant?
