# CHANGELOG
**Associative Lattice Kernel (ALK)**
*Append-only. Written after the fact. §6.1 — Documentation is generated from proof.*

---

## v1.4.0 — Topology Engine Phase 1: InvariantBaseline + PolarityEngine

**Date:** 2026-05-09
**Phase:** NEXUS Master Phasemap — Phase 1 (Stream A: codec.js Signal Topology)
**Tests:** 121/121 passing (`topology-phase1.test.js`)

### New: `InvariantBaseline` (in `video/codec.js`)

Freezes who this person is at session open. Warmup collects first N batches (default 5). On batch N, computes mean + sigma per axis and `Object.freeze()`s the baseline — it never mutates. After lock, every incoming batch is z-scored against the frozen reference per axis. CompositeZ (RMS of per-axis z-scores) fires `alert=true` when ≥ COMPOSITE_ALERT_Z (2.0).

- Axes tracked: `sentiment`, `friction`, `wordCount`, `energy`, `cadence`
- Null axes (energy/cadence when no audio) excluded from compositeZ silently — system never degrades
- Content-signal map: per invariant word, tracks `present` vs `absent` signal rolling stats and computes lift
- Warmup returns `{ locked:false, warmupProgress }` — no scores, no nulls that crash consumers
- Lock batch falls through to post-lock scoring (returns `locked:true` with z-scores on the batch that triggers lock)

**§1.1 invariant:** All output is labeled as deviation from THIS SESSION'S opening. "BASELINE_ALERT" = multi-axis deviation from session norm. Not a psychological assertion.

### New: `PolarityEngine` (in `video/codec.js`)

Cumulative emotional arc for the full session.

- Rolling mean over last 20 batches → current polarity label (`positive` / `negative` / `neutral`)
- Flip detection: rolling mean must cross `POLARITY_FLIP_THRESHOLD` (0.20) in magnitude to register — momentary dips ignored
- Session arc: first-quarter mean vs last-quarter mean → `improving` / `declining` / `stable`
- Dominant polarity: count of batches above vs below zero
- Polarization: `|cumulative| / batchCount`
- Momentum: inline OLS slope over last 8 sentiment values (to be replaced by `SlopeEngine` in Phase 2)

### New: `TopologyEngine` Phase 1 shell (in `video/codec.js`)

Wraps `InvariantBaseline` + `PolarityEngine`. Returns unified topology payload on every `feed()` call.

**Composite states:**
- `CALIBRATING` — warmup, no scores
- `BASELINE_ALERT` — compositeZ ≥ 2.0 (evidence: top deviating axes + z-scores)
- `POLARIZED` — strong polarity signal, rollingMean > 0.35 in magnitude
- `STABLE` — post-warmup, neither of the above

**Invariants (§1.1):**
- `composite.evidence[]` always non-empty when `state !== 'CALIBRATING'`
- Every composite state has a measurement behind it — never a label without a number
- `lastPayload` exposed for pulse emission (§1.8)

### Wiring: `TranscriptEngine` updated

- `this._topology = new TopologyEngine()` added to constructor
- `this._lastAudioFrame = null` tracked — updated by `NexusCodec` audio processor on every frame
- `_flushBatch()` calls `this._topology.feed({ sentiment, friction, wordCount, text, batchId, ts, energy, cadence })` before dispatch
- `onBatch` payload now includes `topology` field
- `reset()` resets topology engine and clears `_lastAudioFrame`

### Wiring: `NexusCodec` updated

- `GPGPUAudioProcessor.onFrame` callback now pushes each frame to `this._transcript._lastAudioFrame` — audio axes flow into topology on every transcript batch

### Wiring: `BatchLogger` updated

Five new fields logged per batch entry:
```
topologyState:  composite.state  (null during calibration)
baselineAlert:  baseline.alert   (false by default)
compositeZ:     baseline.compositeZ (0 by default)
polarityArc:    polarity.sessionArc (null during calibration)
polarityFlips:  polarity.flipCount  (0 by default)
```
Console log now shows `[STATE]` tag on every batch header and prints topology detail on expand.

### Bug fixes
- `InvariantBaseline.feed()` correctly returns `locked:true` on the lock batch (previously returned `locked:false` on batch N because the return ran before the lock check could fall through)

### Constants added
```js
TOPOLOGY_WARMUP_N       = 5      // batches before baseline locks
POLARITY_FLIP_THRESHOLD = 0.20   // rolling mean magnitude to register flip
POLARITY_WINDOW         = 20     // batches in polarity rolling mean
COMPOSITE_ALERT_Z       = 2.0    // multi-axis z-score threshold for alert
```

### Version
All files bumped to v1.4.0 (§5.4 — one version, everywhere).

### Gate status for Phase 2 (SlopeEngine)
All Phase 1 exit criteria satisfied:
- ✓ `onBatch.topology.baseline.locked === false` with `warmupProgress` for first N-1 batches
- ✓ `onBatch.topology.baseline.locked === true` from batch N onward with z-scores per axis
- ✓ `onBatch.topology.polarity.flips` records correctly on sign reversal
- ✓ `onBatch.topology.composite.state` is one of: `CALIBRATING`, `POLARIZED`, `STABLE`, `BASELINE_ALERT`
- ✓ `BatchLogger` logs topology fields without error

---

## v1.3.0 — TextModule + pat-from-pcm CLI

**Date:** 2026-05-09  
**Phase:** 3 — Written Text + PCM Pipeline  
**Tests:** 89/89 passing

### New: `module/text-module.js`

Full NLP analysis engine for written text. Receives via `alk.text.ingest`. All processing built from first principles (§5.5).

**Detection engines:**
- `TopicModel` — co-occurrence matrix + greedy cluster expansion → 4 latent topic clusters, per-chunk fingerprint, session topic arc
- `EntityTracker` — proper noun detection (capitalized non-sentence-start tokens) + high-frequency token promotion (≥3 mentions), session entity registry
- `CoherenceScorer` — Jaccard content-word overlap between consecutive chunks + connector word bonus (0.15). Low coherence fires `alk.text.coherence.low`
- `SemanticFieldAnalyzer` — 12 semantic domains (SELF, OTHER, PAST, FUTURE, BODY, EMOTION, COGNITION, RELATIONSHIP, CONFLICT, RESOLUTION, UNCERTAINTY, AGENCY), per-chunk active domains, session coverage map
- `LexicalAnalyzer` — lexical density (content words / raw word count), hedge pattern detection (17 patterns), negation density

**Event surface:**
- Listens: `alk.text.ingest`, `alk.session.capture.start/stop`, `alk.text.config`
- Emits: `alk.text.chunk.analyzed`, `alk.text.topic.update`, `alk.text.entity.detected`, `alk.text.coherence.low`, `alk.text.summary`, `alk.text.pulse`, `alk.text.error`

**UUID:** `alk-mod-text-0000-1300-0000-000000000060`

### New: `module/pat-from-pcm.js`

CLI pipeline: raw float32-LE PCM → .pat binary. No ffmpeg. No external dependencies.

**Audio math:** `FrameAnalyzer` mirrors `GPGPUAudioProcessor._analyzeFrame()` exactly — RMS energy, ZCR, two-band spectral centroid approximation, cadence (energy peaks/second), rolling stats (mean/sigma/z-score/anomaly).

**PatEncoder:** 68-byte header (magic PAT1, version, session ID, timestamps, chunk count, sample rate, chunk duration, 3-byte padding) + 32 bytes per 500ms chunk (timestamp offset, energy, ZCR, spectral centroid, cadence, sentiment, energy z-score, flags).

**Modes:** stdin, `--input FILE`, `--dir DIR` batch, `--json`, `--jsonl`, `--decode FILE`

### Bug fixes
- `CoherenceScorer.score()` now uses configurable threshold (was hardcoded constant)
- `LexicalAnalyzer.analyze()` now uses raw word count as denominator (was using pre-filtered content word count, always returning ~1.0)
- `.pat` header expanded from 64 to 68 bytes (64 was 1 byte short for all declared fields)

---



**Date:** 2026-05-09
**Phase:** Refactor — Zero-Binary Media Pipeline

### What Changed

**`video-module.server.js` — complete rewrite**

| Removed | Replaced With |
|---------|--------------|
| `FFMPEGExtractor` (spawns `ffmpeg`, RGB24 pipe) | `CodecFrameExtractor` (canvas.loadImage + raw RGBA Readable) |
| `spawn(FFMPEG_PATH, ...)` | No child process. No system binary. |
| `FFMPEG_PATH` env var | Removed entirely. |
| `Buffer` → RGB24 → RGBA conversion (manual) | `bufferToImageData()` kept as utility for external RGB24 sources |
| `ffmpeg` required in PATH | No runtime binary requirement |

**New classes:**
- `CodecFrameExtractor` — three source modes: frame-dir (JPEG/PNG), raw RGBA Readable, raw RGBA file
- `NodeVideoProcessor` — drives `GPGPUVideoProcessor` (codec.js) in Node without `requestAnimationFrame` or `HTMLVideoElement`; installs `OffscreenCanvas` + `ImageData` polyfills via canvas package

**Codec pixel math now applied on every frame:**
- Adaptive resolution scaling (dark scenes → lower res, high motion → lower res)
- Temporal alpha-blend background model
- Invariant pixel detection (Welford variance, every 30 frames)
- Frame diff / motion scoring
- RollingStats: mean, sigma, z-score, anomaly flag

**`alk.video.frame.ingest` events now include `codecFrame` field** — the full codec metrics payload (luminance, motionScore, motionAnomaly, isDark, deltaPixelCount, etc.).

**Container files (.mp4, .webm):** explicitly rejected with `CONTAINER_UNSUPPORTED` error. Pre-extract frames to JPEG/PNG directory, then use `processFrameDir()`. This is documented in README §Frame Extraction and the CLI help text.

**`behavior/README.md`:**
- File table: FFMPEG reference removed, CodecFrameExtractor noted
- `.pat` pipeline section: ffmpeg shell command replaced with codec-native JS examples (browser mic via `NexusCodec`, server PCM via raw read + `GPGPUAudioProcessor` math)

**`codec.js`** added to project root (`/codec.js`). UUID: `nexus-codec-0000-1200-0000-000000000001`. No npm dependencies — built from first principles (§5.5).

### Axioms Satisfied

| Axiom | Satisfied By |
|-------|-------------|
| §1.1 — nothing pretends | Container rejection is explicit + loud; codec metrics are labeled as what they compute |
| §1.2 — loud errors | `CONTAINER_UNSUPPORTED`, `DIR_READ_FAILED`, `NO_FRAMES`, `STREAM_READ_ERROR` all emitted as `alk.video.error` events |
| §5.5 — no external runtime deps | ffmpeg binary removed; only canvas + @mediapipe remain |

---



**Date:** 2026-05-09
**Phase:** 2 — Behavior Intelligence + Axiom Remediation

### Axiom Fixes Applied

| Axiom | Violation | Fix |
|-------|-----------|-----|
| §1.8 | No pulse emission anywhere | `kernel.startPulse(ms)` added. Returns unsub fn. Emits `alk.kernel.pulse` with tick, ringSize, version, lattice stats. `BehaviorAnalysisModule` emits `alk.behavior.pulse` every 10s. |
| §5.4 | Version drift: `video-module` at v1.1.0, rest at v1.0.0 | All files bumped to v1.2.0. |
| §4.4 | No test suites existed | `behavior-module.test.js` — 53 tests, all pass. |
| §1.7 / §5.6 | No CHANGELOG, no ROADMAP | This file created. `ROADMAP.md` created. |
| §6.2 | README did not reflect v1.1 video work | README updated to v1.2.0. |

### New: BehaviorAnalysisModule (`behavior-module.js`)

**UUID:** `alk-mod-behavior-0000-1200-0000-000000000080`

Ten detection domains, all §1.1-compliant (every output labeled as what it computes):

1. **ContrastiveDetector** — hedge density, negation density, yes-but patterns, I-know-however constructions. Detects linguistic markers of saying one thing while meaning another.

2. **NegativeSpaceDetector** — absence of somatic vocabulary, absence of emotion words, pronoun omission, topic field gaps. Detects what is NOT said across a rolling 200-word window.

3. **ShadowDetector** — Jungian shadow markers: projection pronoun displacement, acoustic displacement (high energy + neutral text), over-qualification, external vs internal locus of control scoring.

4. **RhythmDetector** — cadence regularity variance, prosodic contour (rising/falling/flat), pause topology, word repetition / perseveration, turn-taking rhythm.

5. **EscalationDetector** — sentiment gradient (rate of change), shift clustering (3+ micro-shifts in 30s), repair attempt detection, linguistic amplifier density. Emits `alk.behavior.escalation.alert` when level > 0.5.

6. **AttachmentDetector** — time-evolving attachment-like behavioral pattern scoring over 4 dimensions (secure/anxious/avoidant/disorganized). Scored as probability distribution, never as label.

7. **HermeticDetector** — certainty density, absolute quantifier density, low question rate. Detects closed-system / non-falsifiable thinking patterns.

8. **CrossModalDetector** — multi-stream congruence: positive words + negative facial cues, neutral words + somatic stress signals, negative words + genuine smile.

9. **VideoNarrativeTranslator** — converts landmark geometry events into plain-text behavioral descriptions. Every sentence prefixed with confidence level. Covers gaze deviation, head tilt, blink rate, shoulder tension, all 25 visual cue types.

10. **EscalationTopology** — emotional momentum with inflection mapping, rupture/repair cycle detection, de-escalation attempt scoring.

### Event Surface Added

- `alk.behavior.pattern.detected` — primary output per detector
- `alk.behavior.narrative.frame` — video→text translation (1/sec)
- `alk.behavior.escalation.alert` — momentum threshold crossed
- `alk.behavior.shadow.signal` — Jungian shadow marker
- `alk.behavior.somatic.state` — body-state composite
- `alk.behavior.attachment.signal` — attachment behavioral signature
- `alk.behavior.summary` — 5s interval composite report
- `alk.behavior.pulse` — §1.8 heartbeat

### Test Suite

`behavior-module.test.js` — 53 tests covering:
- All 8 detector classes (unit)
- BehaviorAnalysisModule integration (event flow)
- §1.2 error-as-events (no throw)
- §3.2 logical tick monotonicity
- §1.8 pulse emission
- §5.4 version consistency

---

## v1.1.0 — VideoModule Real MediaPipe Wiring

**Date:** 2026-05-09
**Phase:** 1b — Video Module

### Added

- `video-module.js` — Full VideoModule replacing stub
  - FaceMesh 478 points + blendshapes
  - Pose 33 landmarks
  - Hands 21pt × 2
  - EMA smoother on all metrics
  - Cue taxonomy: 25+ cue types across 5 categories
  - Cue state machine: detected → sustained → released
  - Per-second summary
  - All thresholds runtime-configurable via `alk.video.config`

- `video-module.server.js` — Node.js headless adapter
  - `FFMPEGExtractor` — rawvideo RGB24 pipe
  - `loadMediaPipeNode` — headless MediaPipe + canvas polyfill
  - `VideoFileProcessor` — file → ALK events
  - `VideoStreamProcessor` — RTSP/HLS → ALK events
  - CLI: `node video-module.server.js --input recording.mp4`

- `video-demo.html` — Live browser demo
  - Night-vision phosphor-green aesthetic
  - Real MediaPipe via CDN
  - Landmark overlay canvas
  - Live event stream sidebar
  - Active cue pills
  - 6-cell metric bar

---

## v1.0.0 — Kernel + Core Modules

**Date:** 2026-05-09
**Phase:** 1a — Foundation

### Added

- `kernel.js`
  - Ring buffer (configurable cap, clean eviction)
  - Lattice graph (causal + semantic edges)
  - Gate system (atomic, depth-capped at 20)
  - Pattern subscription (`*`, `**`, mid-pattern wildcards)
  - ALKModule base class
  - Logical clock (strictly monotone)

- `modules.js`
  - VerbalModule — audio pipeline, tone, sentiment, shift, .pat
  - MemoryModule — rolling session buffer (5m–2h)
  - OllamaModule — LLM fire-and-forget via events
  - VideoModule — stub (replaced in v1.1.0)
  - CausalNexusBridge — causal-nexus v5 mirror
  - WatchdogModule — health polling

- `index.html` — Interactive spec dashboard
  - Animated lattice graph
  - Live event simulator
  - PAT format byte map
  - FFMPEG docs
  - Contract grid

---

*§7.6 — The CHANGELOG is the Upgrade Ledger. The codebase is its materialized view.*
