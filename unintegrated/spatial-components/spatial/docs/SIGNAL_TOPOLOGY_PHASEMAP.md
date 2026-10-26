# NEXUS-CODEC — Signal Topology Engine
## Phase Map v1.0 — Slopes · Stability · Oscillations · Polarity · Invariant Baseline
**Scope:** `codec.js` — four new classes + wiring into `TranscriptEngine` and `NexusCodec`  
**Depends on:** `RollingStats`, `AssociationEngine`, `FrictionAnalyzer`, `TranscriptEngine`  
**Status:** Phase 0 — Invented. Build not started.

---

## 1. The Problem Set

`RollingStats` gives you a single point in time: current value, how far it is from the recent mean, whether it crossed a threshold. That's sufficient for alerting. It is not sufficient for understanding.

Understanding requires **topology** — the shape of a signal over time, not just its current position.

Four topological properties are missing entirely:

| Property | Question it answers | Current state |
|---|---|---|
| **Slope** | Is this signal rising, falling, or flat? At what rate? | Not computed anywhere |
| **Stability** | Is this signal consistent or erratic over time? | Not computed anywhere |
| **Oscillation** | Is this signal cycling? What period? What amplitude? | Not computed anywhere |
| **Polarity** | What is the dominant valence? Has it flipped? | Partially — sentiment score exists but no session-level polarity arc |
| **Invariant baseline** | What is this person's norm? How far have they drifted from it? | Not computed anywhere |

These five engines together produce a **signal topology** — not just "what is happening now" but "what kind of thing is happening and has been happening."

---

## 2. Conceptual Architecture

```
Session timeline →→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→→

Batches:        B0001  B0002  B0003  B0004  B0005  B0006 ...
                  │      │      │      │      │      │
                  ▼      ▼      ▼      ▼      ▼      ▼
Per-batch     [sentiment, friction, wordCount, energy, cadence]
signals:          │
                  │
         ┌────────┼────────────────────────────────────────┐
         │        │      SIGNAL TOPOLOGY ENGINE             │
         │        │                                        │
         │   ┌────▼────────┐                               │
         │   │InvariantBase│  warmup(5) → lock → z-score   │
         │   │line         │  vs frozen session norm        │
         │   └─────────────┘                               │
         │                                                 │
         │   ┌─────────────┐                               │
         │   │SlopeEngine  │  linear regression over        │
         │   │             │  sliding window → rate + dir   │
         │   └─────────────┘                               │
         │                                                 │
         │   ┌─────────────┐                               │
         │   │Stability    │  variance of variance →        │
         │   │Engine       │  stable / drifting / chaotic  │
         │   └─────────────┘                               │
         │                                                 │
         │   ┌─────────────┐                               │
         │   │Oscillation  │  zero-crossing rate + peak    │
         │   │Engine       │  detection → cycle + amplitude│
         │   └─────────────┘                               │
         │                                                 │
         │   ┌─────────────┐                               │
         │   │Polarity     │  cumulative valence arc +      │
         │   │Engine       │  flip detection + dominance   │
         │   └─────────────┘                               │
         └────────────────────────────────────────────────┘
                  │
                  ▼
         topology: {
           baseline, slope, stability,
           oscillation, polarity,
           compositeState, stateLabel
         }
```

All five engines operate on the same set of per-batch signals. All output is additive to the existing `onBatch` payload — nothing removed, `topology` field appended.

---

## 3. Engine Specifications

---

### 3.1 `InvariantBaseline`

**What it does:** Establishes a frozen reference for each signal axis from the first N batches. Every subsequent batch is z-scored against that frozen reference, not against the current rolling mean.

**The invariant:** the baseline never updates after lock. The rolling mean is a follower. The baseline is a stake in the ground.

```js
class InvariantBaseline {
  constructor({ warmupN = 5 } = {})

  // Internal state
  _warmupN        // batches needed to lock
  _warmup         // { sentiment:[], friction:[], wordCount:[], energy:[], cadence:[] }
  _baseline       // { sentiment:{mean,sigma}, friction:{...}, ... } — frozen on lock
  _locked         // bool
  _contentMap     // Map<word, { present:{...RollingStats}, absent:{...RollingStats} }>

  // Methods
  feed(signals, assocEngine)
    // signals: { sentiment, friction, wordCount, energy?, cadence?, text }
    // During warmup: accumulate. On batch _warmupN+1: lock.
    // After lock: call score() and update _contentMap
    // Returns: baselineScore | { locked:false, warmupProgress: n/N }

  score(signals, assocEngine)
    // Compute z-score per axis against frozen baseline
    // Update content×signal correlation map
    // Return full baselineScore payload

  _lock()
    // Compute mean+sigma from warmup arrays for each axis
    // Freeze _baseline. Set _locked = true.

  _updateContentMap(signals, assocEngine)
    // Get invariant words from assocEngine.invariants().words
    // Get content words from current text
    // For each invariant word: route signals to present or absent RollingStats
    // Compute lift = present.mean - absent.mean per signal axis

  reset()
}
```

**Output shape (post-lock):**
```js
{
  locked: true,
  warmupN: 5,
  axes: {
    sentiment: { baseline:{mean,sigma}, current, delta, zScore, anomaly },
    friction:  { baseline:{mean,sigma}, current, delta, zScore, anomaly },
    wordCount: { baseline:{mean,sigma}, current, delta, zScore, anomaly },
    energy:    { baseline:{mean,sigma}, current, delta, zScore, anomaly },  // null if no audio
    cadence:   { baseline:{mean,sigma}, current, delta, zScore, anomaly },  // null if no audio
  },
  anomalyCount: 3,
  anomalyAxes: ['friction','energy','cadence'],
  compositeZ: 2.4,           // mean |zScore| across available axes
  alert: true,               // compositeZ > 1.8
  contentCorrelations: [
    {
      word: 'pain',
      frictionLift: 0.19,    // present.friction.mean - absent.friction.mean
      energyLift:   0.11,
      sentimentLift:-0.34,
      frictionZ:    2.1,     // frictionLift / baseline.friction.sigma
    }
  ]
}
```

---

### 3.2 `SlopeEngine`

**What it does:** Computes the rate and direction of change for each signal axis over a sliding window of recent batches. Uses ordinary least squares (OLS) linear regression — the most stable slope estimator for small noisy windows.

**Why OLS not delta:** `delta = current - previous` captures one-step change and is extremely sensitive to noise. OLS over N points fits the best-fit line through the window, giving a slope that represents the trend, not the jitter. A person can stutter up and down while trending unmistakably downward — OLS sees the trend, delta sees the noise.

```js
class SlopeEngine {
  constructor({ window = 8 } = {})
    // window: number of recent batches for regression
    // 8 batches ≈ 80 seconds — enough to see a trend, short enough to be local

  // Internal state
  _bufs   // Map<axis, number[]> — sliding buffer per axis
  _window // int

  // Methods
  push(axis, value)
    // Append to _bufs[axis], trim to window

  slope(axis)
    // OLS linear regression on _bufs[axis]
    // Returns: { slope, intercept, r2, direction, magnitude, confidence }
    //   slope:      units-per-batch rate of change (signed)
    //   intercept:  y-intercept of fit line
    //   r2:         coefficient of determination [0,1] — fit quality
    //   direction:  'rising' | 'falling' | 'flat'  (|slope| < FLAT_THRESHOLD → flat)
    //   magnitude:  |slope| — absolute rate
    //   confidence: r2 — how well the line explains the variance

  _ols(ys)
    // Pure OLS: given y values at x=0,1,2...n-1, returns {slope, intercept, r2}
    // No external deps. 5 lines of math.

  allSlopes()
    // Returns slope() for every axis with sufficient data (≥3 points)

  reset()
}
```

**OLS implementation (no deps):**
```js
_ols(ys) {
  const n = ys.length;
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  let sumX=0, sumY=0, sumXY=0, sumX2=0, sumY2=0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += ys[i];
    sumXY += i * ys[i]; sumX2 += i * i; sumY2 += ys[i] * ys[i];
  }
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const intercept = (sumY - slope*sumX) / n;
  const ssTot = sumY2 - (sumY*sumY)/n;
  const ssRes = ys.reduce((acc,y,i) => acc + (y - (slope*i+intercept))**2, 0);
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes/ssTot) : 1;
  return { slope, intercept, r2 };
}
```

**Constants:**
```js
const SLOPE_FLAT_THRESHOLD = 0.01;  // |slope| below this = flat per axis unit/batch
const SLOPE_WINDOW         = 8;     // batches in regression window
```

**Output shape (per axis):**
```js
{
  slope:      -0.023,       // friction dropping 0.023 units per batch
  intercept:   0.31,
  r2:          0.87,        // 87% of variance explained by trend — strong
  direction:  'falling',
  magnitude:   0.023,
  confidence:  0.87,
}
```

**Full `topology.slope` payload:**
```js
{
  sentiment: { slope, direction:'rising', magnitude, r2, confidence },
  friction:  { slope, direction:'falling', magnitude, r2, confidence },
  wordCount: { slope, direction:'flat', magnitude, r2, confidence },
  energy:    { slope, direction:'rising', magnitude, r2, confidence },
  cadence:   { slope, direction:'rising', magnitude, r2, confidence },
  dominant:  'friction',    // axis with highest |slope| × r2 (weighted magnitude)
  narrative: 'friction falling, sentiment rising — system de-escalating',
}
```

---

### 3.3 `StabilityEngine`

**What it does:** Measures how consistent or erratic a signal has been over the session. Not whether it is high or low — whether it is **predictable**.

**The core insight:** variance of the rolling variance. If a signal's variance is itself stable, the signal is in a consistent regime (stable high, stable low, or stable oscillation). If the variance of variance is high, the signal is chaotic — unpredictably switching between regimes.

Three stability states:
- **STABLE** — signal moves within a narrow band. Low variance. Low variance-of-variance.
- **DRIFTING** — signal is trending in one direction. Variance is moderate, variance-of-variance is low. (Distinguishable from stable by slope — use `SlopeEngine` in combination.)
- **CHAOTIC** — signal variance is itself highly variable. Unpredictable regime switching.

```js
class StabilityEngine {
  constructor({ window = 12, varWindow = 6 } = {})
    // window:    rolling variance window (batches)
    // varWindow: window for variance-of-variance

  // Internal state
  _varStats   // Map<axis, RollingStats>  — rolling variance per axis
  _vovStats   // Map<axis, RollingStats>  — rolling variance-of-variance per axis
  _rawBufs    // Map<axis, number[]>      — raw values for local variance
  _window     // int
  _varWindow  // int

  // Methods
  push(axis, value)
    // 1. Append value to _rawBufs[axis], trim to _window
    // 2. Compute local variance from _rawBufs[axis]
    // 3. Push local variance into _varStats[axis] (RollingStats)
    // 4. Push _varStats[axis].variance into _vovStats[axis]

  stability(axis)
    // Returns: { state, variance, vov, stabilityScore, regime }
    //   variance:       current rolling variance
    //   vov:            variance of variance
    //   stabilityScore: 1 - normalize(vov)  — 1=perfectly stable, 0=chaotic
    //   state:          'STABLE' | 'DRIFTING' | 'CHAOTIC'
    //   regime:         if STABLE → 'high'|'mid'|'low' (position relative to session mean)

  _localVariance(buf)
    // Compute variance of array without full Welford — small buf, simple formula

  allStability()
    // Returns stability() for each axis

  reset()
}
```

**State classification:**
```js
// After computing variance (v) and variance-of-variance (vov):
if (vov < VOV_STABLE_THRESHOLD)  → 'STABLE'   // variance is itself predictable
else if (vov < VOV_CHAOS_THRESHOLD) → 'DRIFTING' // variance growing/shrinking
else → 'CHAOTIC'                               // variance swings unpredictably
```

**Constants:**
```js
const VOV_STABLE_THRESHOLD = 0.002;  // vov below this = stable regime
const VOV_CHAOS_THRESHOLD  = 0.015;  // vov above this = chaotic
const STABILITY_WINDOW     = 12;     // batches for variance calculation
const STABILITY_VAR_WINDOW = 6;      // batches for variance-of-variance
```

**Output shape:**
```js
{
  sentiment: { state:'STABLE',  variance:0.008, vov:0.0006, stabilityScore:0.94, regime:'mid' },
  friction:  { state:'CHAOTIC', variance:0.041, vov:0.022,  stabilityScore:0.21, regime:null  },
  wordCount: { state:'DRIFTING',variance:0.019, vov:0.009,  stabilityScore:0.55, regime:null  },
  energy:    { state:'STABLE',  variance:0.003, vov:0.0004, stabilityScore:0.97, regime:'low' },
  cadence:   { state:'DRIFTING',variance:0.025, vov:0.011,  stabilityScore:0.44, regime:null  },
  overall:   'MIXED',           // STABLE | DRIFTING | CHAOTIC | MIXED
  leastStable: 'friction',      // axis with lowest stabilityScore
  mostStable:  'energy',
}
```

---

### 3.4 `OscillationEngine`

**What it does:** Detects rhythmic cycling in a signal — periodic rise-and-fall patterns. Measures cycle frequency (how often), amplitude (how much it swings), and regularity (how consistent the cycles are).

**Why this matters:** A person in a stable emotional state has low-frequency, low-amplitude signal variation. A person oscillating between approach and avoidance (ambivalence) shows a characteristic medium-frequency, high-amplitude pattern on friction and sentiment. A person in cognitive overload shows high-frequency, irregular micro-oscillations on word count and cadence.

**Method:** Zero-crossing rate on the mean-subtracted signal, combined with peak detection. No FFT needed — the batch rate is too slow (one per 10s) for spectral analysis to be meaningful. Instead:

1. Subtract session mean from each value → centered signal
2. Count zero-crossings (sign changes) per N batches → oscillation rate
3. Detect local peaks/troughs (value > both neighbors) → amplitude
4. Measure inter-peak intervals → period regularity

```js
class OscillationEngine {
  constructor({ window = 16 } = {})
    // window: batches to analyze for oscillation
    // 16 batches = ~160 seconds — enough for 2-3 cycles to be visible

  // Internal state
  _bufs       // Map<axis, number[]>  — raw values
  _window     // int

  // Methods
  push(axis, value)

  oscillation(axis)
    // Returns: { detected, rate, period, amplitude, regularity, phase }
    //   detected:    bool — is there a meaningful oscillation?
    //   rate:        zero-crossings per 10 batches (normalized)
    //   period:      estimated batches per cycle (null if < 2 cycles detected)
    //   amplitude:   mean peak-to-trough distance
    //   regularity:  stddev of inter-peak intervals, normalized → [0,1]
    //                1 = perfectly regular, 0 = irregular
    //   phase:       'rising'|'falling'|'peak'|'trough' — current position in cycle

  _zeroCrossings(centered)
    // Count sign changes in array. Returns count.

  _detectPeaks(vals, minProminence)
    // Local maxima where val[i] > val[i-1] && val[i] > val[i+1]
    // Only count peaks with prominence >= minProminence (filters noise)
    // Returns: [{ idx, value }]

  _detectTroughs(vals, minProminence)
    // Same but minima

  _currentPhase(centered)
    // Last few values rising → 'rising', falling → 'falling'
    // Current value near max of window → 'peak', near min → 'trough'

  allOscillations()

  reset()
}
```

**Constants:**
```js
const OSC_WINDOW           = 16;   // batches in oscillation window
const OSC_MIN_CROSSINGS    = 2;    // min zero-crossings to flag oscillation
const OSC_MIN_PROMINENCE   = 0.05; // minimum peak/trough prominence (normalized)
const OSC_MIN_AMPLITUDE    = 0.08; // minimum amplitude to count as oscillation
```

**Output shape:**
```js
{
  sentiment: {
    detected: true,
    rate:      1.6,          // 1.6 zero-crossings per 10 batches
    period:    6.2,          // ~62s cycle (6.2 batches × 10s)
    amplitude: 0.38,         // swings 0.38 units peak-to-trough
    regularity:0.71,         // moderately regular
    phase:    'falling',     // currently in falling half of cycle
  },
  friction:  { detected:false, rate:0.4, period:null, amplitude:0.03, regularity:0, phase:null },
  wordCount: { detected:true,  rate:2.1, period:4.8,  amplitude:12.4, regularity:0.58, phase:'trough' },
  energy:    { detected:false, rate:0.2, period:null,  amplitude:0.01, regularity:0, phase:null },
  cadence:   { detected:true,  rate:1.9, period:5.3,   amplitude:0.19, regularity:0.64, phase:'rising' },
  oscillating: ['sentiment','wordCount','cadence'],   // axes with detected=true
  dominant:    'sentiment',   // highest amplitude oscillation
}
```

---

### 3.5 `PolarityEngine`

**What it does:** Tracks the **cumulative emotional arc** of a session — not just current sentiment but the overall valence trajectory. Detects polarity flips (positive-to-negative or reverse), dominant valence across the session, and the degree of polarization (how far from neutral the session sits).

**Distinct from sentiment score:** The batch sentiment score is a point measurement. Polarity is the integral — the area under the curve. A session can score neutral at every individual batch but have a strongly negative polarity arc if it oscillated between negative peaks and brief positive recoveries.

```js
class PolarityEngine {
  constructor({ window = 20, flipThreshold = 0.25 } = {})
    // window:       batches for current-polarity window
    // flipThreshold: sentiment shift magnitude to count as a polarity flip

  // Internal state
  _history       // { sentiment, ts, batchId }[] — full session
  _rollingPol    // RollingStats — rolling polarity (current window)
  _flips         // { fromPolarity, toPolarity, batchN, ts }[] — flip events
  _sessionStart  // timestamp
  _lastPolarity  // 'positive'|'negative'|'neutral' — previous period label
  _cumulative    // running sum of sentiment scores

  // Methods
  push(sentimentScore, batchId)
    // Append to _history
    // Update _rollingPol
    // Detect flip: if sign(_rollingPol.mean) changed from previous period → record flip
    // Update _cumulative

  polarity()
    // Returns: { current, dominant, arc, flips, flipCount, polarization, momentum }
    //   current:      current rolling mean sentiment [-1,1]
    //   label:        'positive'|'negative'|'neutral'
    //   dominant:     'positive'|'negative'|'neutral' — which has more session time
    //   arc:          'opening_positive'|'opening_negative'|'neutral_opening'
    //                 + 'arc_toward_positive'|'arc_toward_negative'|'arc_flat'
    //   flips:        array of flip events
    //   flipCount:    total polarity reversals this session
    //   polarization: |cumulative| / batchCount — how far from neutral
    //   momentum:     slope of recent sentiment (positive = improving, negative = declining)

  _sessionArc()
    // Compare first-quarter mean to last-quarter mean
    // 'improving' | 'declining' | 'stable' | 'insufficient_data'

  _dominantPolarity()
    // Count batches above/below zero → whichever has more is dominant
    // Ties → 'neutral'

  reset()
}
```

**Constants:**
```js
const POLARITY_FLIP_THRESHOLD = 0.20;  // rolling mean must cross this far to register flip
const POLARITY_NEUTRAL_BAND   = 0.10;  // |mean| < this = neutral
const POLARITY_WINDOW         = 20;    // batches for rolling polarity
```

**Output shape:**
```js
{
  current:       -0.23,
  label:         'negative',
  dominant:      'negative',           // more batches below 0 than above
  arc:           'arc_toward_negative',// opening was neutral, trending down
  flips: [
    { fromPolarity:'positive', toPolarity:'negative', batchN:7, ts:1234567890 },
    { fromPolarity:'negative', toPolarity:'positive', batchN:11, ts:... },
    { fromPolarity:'positive', toPolarity:'negative', batchN:14, ts:... },
  ],
  flipCount:     3,
  polarization:  0.31,    // significantly non-neutral session
  momentum:     -0.018,   // sentiment declining (negative slope)
  sessionArc:   'declining',
}
```

---

## 4. Composite State — `TopologyEngine`

The five engines are wrapped by a single `TopologyEngine` that coordinates them and produces one unified `topology` payload per batch.

```js
class TopologyEngine {
  constructor({ warmupN = 5, slopeWindow = 8, stabilityWindow = 12, oscWindow = 16 } = {})

  _baseline     // InvariantBaseline
  _slope        // SlopeEngine
  _stability    // StabilityEngine
  _oscillation  // OscillationEngine
  _polarity     // PolarityEngine
  _batchN       // int

  feed(signals, assocEngine)
    // signals: { sentiment, friction, wordCount, energy?, cadence?, text, batchId }
    // 1. Push all axes into all engines
    // 2. Call each engine's output method
    // 3. Compute compositeState
    // 4. Return full topology payload

  compositeState(baseline, slope, stability, oscillation, polarity)
    // Synthesize a single state label from all engines
    // Priority order: anomaly > chaos > oscillation > drift > stable
    // Returns: { state, label, confidence, evidence[] }

  reset()
}
```

**Composite state labels (priority-ordered):**

| State | Condition | Label |
|---|---|---|
| `BASELINE_ALERT` | baseline.alert && compositeZ > 2.5 | "Multi-axis deviation from session norm" |
| `CHAOTIC` | stability.overall === 'CHAOTIC' | "Signal regime unstable — unpredictable" |
| `OSCILLATING` | oscillation.oscillating.length ≥ 2 | "Rhythmic cycling detected — ambivalence pattern" |
| `DRIFTING_DOWN` | slope.dominant direction falling && polarity.momentum < -0.015 | "System declining across multiple axes" |
| `DRIFTING_UP` | slope.dominant direction rising && polarity.momentum > 0.015 | "System improving across multiple axes" |
| `POLARIZED` | polarity.polarization > 0.4 | "Strong valence dominance — far from neutral" |
| `STABLE` | stability.overall === 'STABLE' && !baseline.alert | "System in stable regime" |
| `CALIBRATING` | !baseline.locked | "Establishing baseline — {warmupProgress}" |

**Full `topology` payload appended to every batch:**
```js
topology: {
  batchN:      14,
  baseline:    { ... },       // InvariantBaseline output
  slope:       { ... },       // SlopeEngine output
  stability:   { ... },       // StabilityEngine output
  oscillation: { ... },       // OscillationEngine output
  polarity:    { ... },       // PolarityEngine output
  composite: {
    state:      'OSCILLATING',
    label:      'Rhythmic cycling detected — ambivalence pattern',
    confidence: 0.78,
    evidence: [
      'sentiment oscillating (period 62s, amplitude 0.38)',
      'wordCount oscillating (period 48s, amplitude 12.4)',
      'friction slope falling (r²=0.87)',
    ],
  },
}
```

---

## 5. Wiring into `TranscriptEngine`

### 5.1 Constructor addition
```js
this._topology = new TopologyEngine({
  warmupN:         5,
  slopeWindow:     8,
  stabilityWindow: 12,
  oscWindow:       16,
});
```

### 5.2 `_flushBatch()` addition
After existing analytics (friction, assoc, sentiment, prediction), before `this._onBatch?.()`:

```js
const topology = this._topology.feed({
  sentiment:  sentimentScore,
  friction:   frictionResult?.density ?? 0,
  wordCount,
  text,
  batchId,
  energy:     this._lastAudioFrame?.energy  ?? null,
  cadence:    this._lastAudioFrame?.cadence ?? null,
}, this._assoc);
```

Add `topology` to `onBatch` payload.

### 5.3 Audio frame tracking
`NexusCodec.start()` wires `GPGPUAudioProcessor.onFrame` to `this._onAudioFrame`. Add:

```js
this._lastAudioFrame = null;
// in GPGPUAudioProcessor onFrame:
this._lastAudioFrame = frame;
```

Pass `this._lastAudioFrame` into `TranscriptEngine` so `_flushBatch` has it.

### 5.4 `reset()` chain
`TranscriptEngine.reset()` calls `this._topology.reset()`.

---

## 6. `BatchLogger` additions

```js
// In log(batch):
topologyState:   batch.topology?.composite?.state  ?? null,
topologyLabel:   batch.topology?.composite?.label  ?? null,
slopeDirection:  batch.topology?.slope?.dominant   ?? null,
stabilityState:  batch.topology?.stability?.overall ?? null,
oscillating:     batch.topology?.oscillation?.oscillating ?? [],
polarityArc:     batch.topology?.polarity?.sessionArc ?? null,
polarityFlips:   batch.topology?.polarity?.flipCount ?? 0,
baselineAlert:   batch.topology?.baseline?.alert ?? false,
compositeZ:      batch.topology?.baseline?.compositeZ ?? 0,
```

---

## 7. ALK Kernel Events (Phase 4 forward)

| Event | Condition |
|---|---|
| `alk.behavior.baseline.alert` | `baseline.alert === true` |
| `alk.behavior.topology.oscillation` | `oscillation.oscillating.length >= 2` |
| `alk.behavior.topology.polarity_flip` | new entry in `polarity.flips` |
| `alk.behavior.topology.chaos` | `stability.overall === 'CHAOTIC'` |
| `alk.behavior.topology.drift` | `composite.state` starts with 'DRIFTING' |
| `alk.behavior.topology.state_change` | `composite.state` changed from previous batch |

---

## 8. Phase Breakdown

### Phase 1 — `InvariantBaseline` + `PolarityEngine` (codec.js)
Both are batch-level only (no audio axes needed yet). Simplest to build first, immediately useful.

**Deliverables:**
- `InvariantBaseline` class
- `PolarityEngine` class  
- `TopologyEngine` shell — wraps just these two for now
- Wired into `TranscriptEngine._flushBatch()`
- `topology.baseline` and `topology.polarity` in `onBatch` payload
- `BatchLogger` updated

**Exit criteria:** After 5 batches, `topology.baseline.locked === true`. `topology.polarity.flips` records correctly. `topology.composite.state` is one of: `CALIBRATING`, `POLARIZED`, `STABLE`.

---

### Phase 2 — `SlopeEngine` (codec.js)
OLS regression. Self-contained math, no deps.

**Deliverables:**
- `SlopeEngine` class with `_ols()`
- `TopologyEngine` updated to include slope
- `topology.slope` in `onBatch` payload
- `topology.composite` updated with DRIFTING states

**Exit criteria:** After 8 batches, `topology.slope.sentiment.direction` reflects actual signal direction. `r2 > 0.7` on a monotone signal.

---

### Phase 3 — `StabilityEngine` (codec.js)
Variance-of-variance. Requires sufficient batch history.

**Deliverables:**
- `StabilityEngine` class
- `TopologyEngine` updated
- `topology.stability` in payload
- CHAOTIC state added to composite

**Exit criteria:** A constant signal scores `stability.state === 'STABLE'`. A randomly switching signal scores `CHAOTIC`.

---

### Phase 4 — `OscillationEngine` + audio axes (codec.js)
Peak detection, zero-crossing, amplitude. Also wires energy/cadence from `GPGPUAudioProcessor` into all engines.

**Deliverables:**
- `OscillationEngine` class
- `_lastAudioFrame` tracking in `NexusCodec`
- Energy + cadence axes in `InvariantBaseline`, `SlopeEngine`, `StabilityEngine`
- `topology.oscillation` in payload
- OSCILLATING state in composite

**Exit criteria:** A sine-wave-shaped signal sequence (manually injected in test) produces `oscillation.detected === true` with correct period estimate.

---

### Phase 5 — ALK kernel events + BehaviorModule integration
- `alk.behavior.topology.*` events emitted
- `BehaviorAnalysisModule` subscribes to topology events and enriches its interpretation strings with slope/stability/polarity context
- Video motion baseline fed into `TopologyEngine` from `GPGPUVideoProcessor`

---

## 9. Invariants (§1.1 — nothing pretends)

| Invariant | Rule |
|---|---|
| Baseline is frozen | `_baseline` never mutates after `_lock()`. Confirmed by making it `Object.freeze()` on lock. |
| Warmup batches are silent | No topology output during warmup except `{ locked:false, warmupProgress:n/N }`. |
| OLS requires ≥ 2 points | `_ols()` returns `{ slope:0, r2:0 }` for insufficient data. Never divide by zero. |
| Oscillation requires ≥ 2 cycles | `detected` is false until at least 2 full peak-trough-peak sequences observed. |
| Polarity flip requires threshold | A momentary dip below zero is not a flip. Rolling mean must cross `POLARITY_FLIP_THRESHOLD` magnitude from neutral to register. |
| Composite state is evidence-backed | `composite.evidence[]` always populated with specific measurements that triggered the state. Never a label without a number behind it. |
| Audio axes are optional | If `energy`/`cadence` are null, those axes are excluded from composite scoring. `axes.energy = null` in baseline payload. System does not fail or degrade — it scores the available axes only. |
| §1.1 — labels are topology, not diagnosis | `OSCILLATING` means the signal is cycling. `CHAOTIC` means the variance is unpredictable. `DRIFTING_DOWN` means the slope is negative. None of these are psychological assertions. |

---

## 10. Open Questions

1. **Warmup length** — 5 batches (~50s) assumes natural speech from the start. Does it need to be configurable per use-case (therapy session = longer warmup vs. quick demo = shorter)?

2. **Cross-session persistence** — `PolarityEngine` and `InvariantBaseline` reset on `codec.reset()`. Session-to-session continuity (does today's baseline differ from yesterday's?) requires `BatchLogger` or external storage. Scope for a later phase?

3. **OLS window vs. session length** — the slope window (8 batches) is fixed. For long sessions (2+ hours), local slope and global slope diverge. Should `SlopeEngine` expose both local (last 8) and global (full session) slopes?

4. **Video topology** — `GPGPUVideoProcessor` has its own motion/luminance signals. Should video axes have their own `TopologyEngine` instance, or should they be merged into the same instance as audio/transcript? Merging gives cross-modal composite states. Separate gives cleaner per-modality readings.

5. **Oscillation minimum period** — at one batch per 10s, the shortest detectable cycle is ~20s (2 batches). Is that too sensitive? Should the minimum period floor be higher (e.g. 4 batches = 40s) to avoid flagging normal conversational rhythm as oscillation?
