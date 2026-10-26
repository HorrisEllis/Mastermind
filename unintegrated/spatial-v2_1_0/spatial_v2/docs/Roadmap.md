# NEXUS — Master Phase Map
**Version:** 1.0  
**Date:** 2026-05-09  
**Author:** James Brooks (Erosmancer) + Claude  
**Status:** Audit complete. Phase 1 not started.

---

## System Overview

Three work streams. One sequence. Each phase has exactly one exit criterion — a thing that either works or doesn't.

```
STREAM A — codec.js: Signal Topology Engine
  InvariantBaseline → PolarityEngine → SlopeEngine →
  StabilityEngine → OscillationEngine → TopologyEngine

STREAM B — index.html + mic.html: External Mic Integration
  Host receiver → Audio pipeline → STT bridge →
  ALK wiring → Polish

STREAM C — ALK kernel: Cross-modal integration
  topology events → BehaviorModule enrichment →
  video topology → cross-session persistence
```

Streams A and B are independent until Phase 8 (ALK integration), where they converge.

---

## Current State Inventory

### What exists and works

| Component | File | State |
|---|---|---|
| `RollingStats` | codec.js | ✓ Complete — rolling mean, sigma, z-score, delta, anomaly |
| `FrictionAnalyzer` | codec.js | ✓ Complete — disfluency, filler, memory gap, tension, denial |
| `AssociationEngine` | codec.js | ✓ Complete — Jaccard overlap, ngram redundancy, content invariants |
| `PredictiveEngine` | codec.js | ✓ Complete — Markov-1 tag transitions, trigram word prediction |
| `GPGPUAudioProcessor` | codec.js | ✓ Complete — RMS energy, ZCR, spectral centroid, cadence, rolling stats |
| `GPGPUVideoProcessor` | codec.js | ✓ Complete — adaptive res, pixel diff, bg model, invariant mask |
| `TranscriptEngine` | codec.js | ✓ Complete — Web Speech API, 10s batch, friction+assoc+sentiment+prediction |
| `NexusCodec` | codec.js | ✓ Complete — one getUserMedia, shared stream, all engines |
| `BatchLogger` | codec.js | ✓ Complete — localStorage rolling log, console groups |
| VL node graph | index.html | ✓ Complete — nodes, lattice, associations, tags, heuristics |
| `vlAddNode()` | index.html | ✓ Complete |
| VL recording | index.html | ✓ Complete — `_vlStartRecord/Stop`, waveform, timer |
| Options panel | index.html | ✓ Complete — AI BACKEND, LM STUDIO, OLLAMA, DISPLAY, DATA |
| mic.html client | mic.html | ✓ Complete — login, PeerJS, data channel, audio call, waveform, recording |
| ALK kernel | kernel.js | ✓ Complete — event ring, lattice, subscriptions, patterns |
| VideoModule | video-module.js | ✓ Complete — MediaPipe FaceMesh/Pose/Hands, cue taxonomy |
| BehaviorModule | behavior-module.js | ✓ Complete — cross-modal analysis, somatic/verbal/ocular interpretation |
| video-demo.html | video-demo.html | ✓ Working — 30fps, EAR fixed, EMA split, module scope fix |

### What is missing

| Gap | Affects |
|---|---|
| No `InvariantBaseline` | codec.js — no frozen session reference |
| No `TopologyEngine` (slope/stability/oscillation/polarity) | codec.js — no signal shape over time |
| No `TopologyEngine` wired into `TranscriptEngine` | onBatch payload incomplete |
| `_lastAudioFrame` not tracked in `NexusCodec` | audio axes missing from topology |
| No PeerJS host in index.html | mic.html has nothing to connect to |
| No EXT MIC tab in options panel | no UI to init the host peer |
| No `_vlHashPw()` in index.html | cannot derive same room ID as mic.html |
| No `VL.extMic` state object | no host-side peer/conn/stream tracking |
| No STT on mic.html | transcript stays local, never reaches host |
| No `vlAddNode()` on incoming transcript | ext mic speech not captured in VL |
| ALK kernel not in index.html | no topology events in Mastermind |

---

## The Signal Axes

Every topology engine operates on the same set of per-batch signals. Audio axes are optional (null if no audio frames received during warmup).

| Axis | Source | Range | Batch or Frame |
|---|---|---|---|
| `sentiment` | `TranscriptEngine._scoreSentiment()` | [-1, 1] | batch |
| `friction` | `FrictionAnalyzer.analyze().density` | [0, 1] | batch |
| `wordCount` | `text.split(/\s+/).length` | [0, ∞) | batch |
| `energy` | `GPGPUAudioProcessor._analyzeFrame().energy` | [0, 1] | frame → batch |
| `cadence` | `GPGPUAudioProcessor._analyzeFrame().cadence` | [0, ∞) | frame → batch |
| `motionScore` | `GPGPUVideoProcessor._frameDiff().score` | [0, 1] | frame (Phase 8+) |

---

## Phase Map

---

### PHASE 0 — Audit ✓ COMPLETE
- [x] codec.js fully read and inventoried
- [x] index.html + mic.html connection protocol documented
- [x] All gaps identified
- [x] All five topology engines designed from first principles
- [x] Open questions catalogued

---

### PHASE 1 — `InvariantBaseline` + `PolarityEngine`
**Stream:** A — codec.js  
**Depends on:** nothing new (uses existing `RollingStats`, `AssociationEngine`)  
**Size:** ~150 lines

**What to build:**

`InvariantBaseline` — freezes who this person is at session open.

- Warmup: collect first 5 batches (`_warmupN`, configurable)
- On batch 6: compute `mean` + `sigma` per axis from warmup arrays → freeze as `Object.freeze(_baseline)`
- After lock: z-score every incoming batch against the frozen reference
- Content × signal map: once `AssociationEngine.invariants().words` has entries, for each invariant word route `{ energy, friction, sentiment, wordCount }` into `present` vs `absent` RollingStats per word. Compute lift = `present.mean - absent.mean`.
- During warmup: emit `{ locked:false, warmupProgress: n/N }` — no scores, no nulls that crash consumers

`PolarityEngine` — cumulative emotional arc.

- Track full session history of sentiment scores
- Rolling mean over last 20 batches → current polarity label (positive / negative / neutral)
- Flip detection: when rolling mean crosses `POLARITY_FLIP_THRESHOLD` (0.20) in magnitude from neutral, record `{ fromPolarity, toPolarity, batchN, ts }`
- Session arc: compare first-quarter mean to last-quarter mean → improving / declining / stable
- Dominant polarity: count batches above vs below zero
- Polarization: `|cumulative| / batchCount`
- Momentum: OLS slope of last 8 sentiment values (reuse `SlopeEngine._ols()` once built, or inline for now)

`TopologyEngine` shell — wraps both, feeds them, returns unified payload.

```js
class TopologyEngine {
  constructor({ warmupN=5 } = {})
  feed(signals, assocEngine)  // returns topology payload
  reset()
}
```

Wiring into `TranscriptEngine`:
- Add `this._topology = new TopologyEngine()` to constructor
- Add `this._lastAudioFrame = null` tracking
- In `_flushBatch()`: call `this._topology.feed({ sentiment, friction, wordCount, text, batchId, energy: this._lastAudioFrame?.energy ?? null, cadence: this._lastAudioFrame?.cadence ?? null }, this._assoc)`
- Append `topology` to `onBatch` payload

`BatchLogger` additions:
```js
topologyState:   batch.topology?.composite?.state  ?? null,
baselineAlert:   batch.topology?.baseline?.alert   ?? false,
compositeZ:      batch.topology?.baseline?.compositeZ ?? 0,
polarityArc:     batch.topology?.polarity?.sessionArc ?? null,
polarityFlips:   batch.topology?.polarity?.flipCount  ?? 0,
```

**Exit criteria:**
- `onBatch.topology.baseline.locked === false` with `warmupProgress` for first 5 batches
- `onBatch.topology.baseline.locked === true` from batch 6 onward with correct z-scores per axis
- `onBatch.topology.polarity.flips` records correctly on sign reversal
- `onBatch.topology.composite.state` is one of: `CALIBRATING`, `POLARIZED`, `STABLE`
- `BatchLogger` logs alert fields without error

---

### PHASE 2 — `SlopeEngine`
**Stream:** A — codec.js  
**Depends on:** Phase 1 complete  
**Size:** ~80 lines

**What to build:**

`SlopeEngine` — OLS linear regression over sliding window.

```js
_ols(ys) {
  const n = ys.length;
  if (n < 2) return { slope:0, intercept: ys[0]??0, r2:0 };
  let sumX=0,sumY=0,sumXY=0,sumX2=0,sumY2=0;
  for (let i=0;i<n;i++) { sumX+=i; sumY+=ys[i]; sumXY+=i*ys[i]; sumX2+=i*i; sumY2+=ys[i]*ys[i]; }
  const slope=(n*sumXY-sumX*sumY)/(n*sumX2-sumX*sumX);
  const intercept=(sumY-slope*sumX)/n;
  const ssTot=sumY2-(sumY*sumY)/n;
  const ssRes=ys.reduce((a,y,i)=>a+(y-(slope*i+intercept))**2,0);
  const r2=ssTot>0?Math.max(0,1-ssRes/ssTot):1;
  return {slope,intercept,r2};
}
```

Per axis: sliding buffer of last 8 values. `slope()` returns `{ slope, intercept, r2, direction, magnitude, confidence }` where `direction` is `rising` / `falling` / `flat` (|slope| < 0.01 threshold).

`allSlopes()` returns dominant axis (highest `|slope| × r2` — weighted by fit quality so a noisy flat line doesn't dominate).

Narrative string: `'friction falling (r²=0.87), sentiment rising (r²=0.74) — de-escalating'`

`TopologyEngine` updated — incorporate slope output, add `DRIFTING_UP` / `DRIFTING_DOWN` to composite state logic.

**Exit criteria:**
- 8 monotone-increasing values → `direction: 'rising'`, `r2 > 0.9`
- 8 constant values → `direction: 'flat'`, `magnitude < 0.01`
- `narrative` string populated when ≥2 axes have data

---

### PHASE 3 — `StabilityEngine`
**Stream:** A — codec.js  
**Depends on:** Phase 2 complete  
**Size:** ~80 lines

**What to build:**

`StabilityEngine` — variance of rolling variance.

Per axis:
1. Raw buffer (last 12 values) → local variance via simple formula
2. Local variance pushed into `RollingStats` → `_varStats`
3. `_varStats.variance` pushed into second `RollingStats` → `_vovStats` (variance of variance)

State classification:
- `vov < 0.002` → `STABLE`
- `vov < 0.015` → `DRIFTING`  
- `vov >= 0.015` → `CHAOTIC`

`stabilityScore = 1 - clamp(vov / 0.015, 0, 1)` — 1=perfectly stable, 0=chaotic

`regime` (only when STABLE): `high` / `mid` / `low` relative to session mean from `InvariantBaseline`.

`overall` across all axes: if any axis is CHAOTIC → MIXED or CHAOTIC (majority wins). `leastStable` / `mostStable` axis names.

`TopologyEngine` updated — CHAOTIC state added to composite priority chain.

**Exit criteria:**
- Constant signal → `state: 'STABLE'`, `stabilityScore > 0.95`
- Random signal → `state: 'CHAOTIC'`, `stabilityScore < 0.3`
- `overall` field correct for mixed-state sessions

---

### PHASE 4 — `OscillationEngine` + Audio Axes
**Stream:** A — codec.js  
**Depends on:** Phase 3 complete  
**Size:** ~120 lines

**What to build:**

`OscillationEngine` — zero-crossing rate + peak detection.

Per axis, on a 16-batch window:
1. Subtract session mean → centered signal
2. Count sign changes → `rate` (zero-crossings per 10 batches, normalized)
3. Detect peaks: local maxima where `val[i] > val[i-1] && val[i] > val[i+1]`, prominence ≥ 0.05
4. Detect troughs: same but minima
5. `amplitude` = mean peak-to-trough distance across detected peak/trough pairs
6. `period` = mean inter-peak interval in batches (null if < 2 peaks)
7. `regularity` = 1 - (stddev(inter-peak intervals) / mean(inter-peak intervals)) — 1=perfectly regular
8. `detected` = `rate >= 2 crossings/10batches && amplitude >= 0.08 && period not null`
9. `phase` = current position: rising / falling / peak / trough (last 2-3 values trend)

`oscillating[]` — axes where `detected === true`. `dominant` — highest amplitude.

Audio axes wired in full:
- `NexusCodec` tracks `this._lastAudioFrame = null`, updated in `GPGPUAudioProcessor.onFrame`
- `TranscriptEngine` receives lastAudioFrame at flush time
- `energy` and `cadence` now flow into `InvariantBaseline`, `SlopeEngine`, `StabilityEngine`, `OscillationEngine`

`TopologyEngine` updated — OSCILLATING state (≥2 axes oscillating) added.

**Exit criteria:**
- Sine-wave sequence → `detected: true`, `period` within 1 batch of actual period
- Flat signal → `detected: false`
- `energy` and `cadence` in baseline payload with correct z-scores after audio warmup

---

### PHASE 5 — Host Receiver (index.html)
**Stream:** B — External Mic  
**Depends on:** Phase 1 complete (audio pipeline exists to attach to)  
**Size:** ~200 lines in index.html

**What to build:**

Password hash function — identical to `mic.html`'s `micHashPw()`:
```js
function _vlHashPw(pw) {
  let h=0x811c9dc5; for(let i=0;i<pw.length;i++){h^=pw.charCodeAt(i);h=(h*0x01000193)>>>0;}
  let h2=0xdeadbeef; for(let i=0;i<pw.length;i++){h2=((h2<<5)+h2)^pw.charCodeAt(i);h2=h2>>>0;}
  return 'nx_'+h.toString(16).padStart(8,'0')+h2.toString(16).padStart(8,'0');
}
function _vlDeriveRoomId(pw) {
  const h=_vlHashPw(pw);
  return 'NX-'+h.slice(3,9).toUpperCase()+'-'+h.slice(9,15).toUpperCase();
}
```

ICE config — identical object to mic.html (3× Google STUN + 3× openrelay TURN including TCP fallback).

`VL.extMic` state object:
```js
VL.extMic = { peer:null, conns:[], calls:[], streams:[], roomId:null, enabled:false };
```

`_vlInitExtMic(password)` function:
- Destroy existing peer if any
- Derive roomId → `VL.extMic.roomId`
- `new Peer(roomId+'-HOST', { ...ICE })`
- `peer.on('connection', conn => { VL.extMic.conns.push(conn); _vlWireDataConn(conn); })`
- `peer.on('call', call => { call.answer(); call.on('stream', s => VL.extMic.streams.push(s)); VL.extMic.calls.push(call); })`

`_vlWireDataConn(conn)` — handles incoming commands:
- `recording_started` / `recording_stopped` → update host UI badge
- `pong` → heartbeat confirmed
- Sends `ping` every 30s to detect dropped connections

State sync — patch `_vlStartRecord()` and `_vlStopRecord()` to send `record_start` / `record_stop` to all `VL.extMic.conns`.

EXT MIC tab in Options panel — new tab after DATA:
- Password field + `INIT HOST` button
- Room ID display (derived, read-only, copy button)
- Connected mic list (peerId, status dot, disconnect button)
- `SYNC STATE` button

Add PeerJS CDN to `index.html` `<head>`:
```html
<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>
```

**Exit criteria:**
- mic.html connects to index.html host
- `conn-dot` on mic.html shows green
- `record_start` sent from index.html reaches mic.html and starts recording
- `recording_started` sent from mic.html appears in host UI

---

### PHASE 6 — STT Bridge (mic.html → index.html)
**Stream:** B — External Mic  
**Depends on:** Phase 5 complete  
**Size:** ~60 lines in mic.html, ~30 lines in index.html

**What to build:**

STT on mic.html — add `SpeechRecognition` loop that runs while connected and recording:
```js
// mic.html addition inside startLocalRec():
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  micRec = new SR();
  micRec.continuous = true; micRec.interimResults = false; micRec.lang = 'en-US';
  micRec.onresult = evt => {
    for (let i=evt.resultIndex;i<evt.results.length;i++) {
      if (evt.results[i].isFinal) {
        const txt = evt.results[i][0].transcript.trim();
        if (txt.length > 2) sendCmd('transcript', { text:txt, ts:Date.now() });
      }
    }
  };
  micRec.onend = () => { if (isRec) try { micRec.start(); } catch(_){} };
  micRec.start();
}
```

Stop `micRec` in `stopLocalRec()`.

Audio analytics on host — attach `GPGPUAudioProcessor` to received stream:
```js
// index.html, in call.on('stream', remoteStream => {...}):
const extAudio = new GPGPUAudioProcessor({
  onFrame: f => { VL.extMic.lastFrame = f; }
});
extAudio.attach(remoteStream);
VL.extMic.audioProc = extAudio;
```

`vlAddNode()` on incoming transcript:
```js
// index.html, in _vlWireDataConn():
if (msg.cmd === 'transcript') {
  vlAddNode(msg.text, {
    source:       'ext-mic',
    rhythmSig:    'ext-voice',
    energy:       VL.extMic.lastFrame?.energy       ?? null,
    cadence:      VL.extMic.lastFrame?.cadence      ?? null,
    energyAnomaly:VL.extMic.lastFrame?.energyAnomaly ?? null,
  });
}
```

Desktop fallback note (for future): on Electron/Bridge install, route remote MediaStream through virtual audio device (VB-Cable / BlackHole / WASAPI loopback) so OS default mic = remote stream and Web Speech API picks it up natively — zero API hacks.

**Exit criteria:**
- Speech on mic.html → `sendCmd('transcript')` → `vlAddNode()` on host
- VL lattice shows nodes from ext-mic source with `energy` field populated
- `energyAnomaly` correctly reflects audio state at time of utterance

---

### PHASE 7 — Topology → VL Node Enrichment
**Stream:** A + B convergence  
**Depends on:** Phase 4 (topology complete) + Phase 6 (ext mic transcript flowing)  
**Size:** ~50 lines

**What to build:**

`NexusCodec` in index.html (or `TopologyEngine` standalone) running on the remote audio stream. Every 10s batch flush (triggered by the transcript data channel message interval) enriches the incoming VL node with topology output:

```js
if (msg.cmd === 'transcript') {
  const topo = VL.extMic.topology?.latest ?? null;
  vlAddNode(msg.text, {
    source:         'ext-mic',
    rhythmSig:      'ext-voice',
    energy:         VL.extMic.lastFrame?.energy ?? null,
    cadence:        VL.extMic.lastFrame?.cadence ?? null,
    energyAnomaly:  VL.extMic.lastFrame?.energyAnomaly ?? null,
    topologyState:  topo?.composite?.state ?? null,
    baselineAlert:  topo?.baseline?.alert ?? false,
    polarityArc:    topo?.polarity?.sessionArc ?? null,
    slopeDirection: topo?.slope?.dominant ?? null,
  });
}
```

**Exit criteria:**
- VL nodes from ext-mic source have `topologyState` field populated
- `baselineAlert: true` on nodes where composite z-score exceeded threshold

---

### PHASE 8 — ALK Kernel in index.html + Full Event Pipeline
**Stream:** C — ALK integration  
**Depends on:** Phase 7 complete  
**Size:** ~100 lines

**What to build:**

ALK kernel in index.html — three options (pick one with Jonathan):
- Option A: Inline kernel.js source (same pattern as video-demo.html)
- Option B: `<script type="module" src="./kernel.js">` if served as a module
- Option C: `BroadcastChannel('alk-kernel')` bridge between video-demo.html and index.html windows

Topology ALK events emitted from `TopologyEngine.feed()`:

| Event | Condition |
|---|---|
| `alk.behavior.baseline.alert` | `baseline.alert === true` |
| `alk.behavior.topology.polarity_flip` | new flip recorded in `PolarityEngine` |
| `alk.behavior.topology.oscillation` | `oscillation.oscillating.length >= 2` |
| `alk.behavior.topology.chaos` | `stability.overall === 'CHAOTIC'` |
| `alk.behavior.topology.drift` | `composite.state` starts with `DRIFTING` |
| `alk.behavior.topology.state_change` | `composite.state` changed from previous batch |
| `alk.verbal.transcript` | every transcript from ext-mic |
| `alk.audio.frame` | every audio frame from ext-mic stream |

`BehaviorAnalysisModule` enrichment — subscribe to topology events and inject into interpretation strings:
- On `topology.state_change` → append to current behavior interpretation: `"System entering OSCILLATING state (sentiment cycling 62s period, amplitude 0.38)"`
- On `baseline.alert` → prepend: `"Multi-axis deviation from session norm (compositeZ=2.4): friction +2.1σ, energy +1.9σ, cadence +2.3σ"`

**Exit criteria:**
- `alk.behavior.baseline.alert` appears in ALK event log when threshold crossed
- `BehaviorAnalysisModule` interpretation strings reference topology state
- `alk.verbal.transcript` events carry `source:'ext-mic'` metadata

---

### PHASE 9 — Video Topology + Cross-Modal Composite
**Stream:** C — ALK integration  
**Depends on:** Phase 8 complete  
**Size:** ~80 lines

**What to build:**

Video axes into `TopologyEngine`:
- `motionScore` from `GPGPUVideoProcessor` → fed into `TopologyEngine` at ALK event `alk.video.frame.analyzed`
- `luminance` similarly
- New axes: `gaze_deviation`, `EAR` (eye aspect ratio) — smoothed per session, baselined

Cross-modal composite alert — when topology state AND video cue state are simultaneously anomalous:
```
baseline.alert (verbal) + motionScore spike (video) + energy anomaly (audio)
→ alk.behavior.cross_modal.alert
  { verbal: topology.composite, video: { motionAnomaly, activeCues }, audio: { energyZ } }
```

**Exit criteria:**
- `motionScore` appears in `topology.slope` and `topology.stability` output
- `alk.behavior.cross_modal.alert` fires when all three modalities simultaneously anomalous
- ALK event log shows cross-modal event with correct multi-source payload

---

### PHASE 10 — Cross-Session Baseline Persistence
**Stream:** C — ALK integration  
**Depends on:** Phase 9 complete  
**Size:** ~60 lines in `BatchLogger`

**What to build:**

Persist baseline per user across sessions via `BatchLogger`:
```js
// On session end (codec.stop()):
BatchLogger.saveSessionBaseline(sessionId, {
  baseline: topology.baseline._baseline,
  polarityDominant: topology.polarity.dominant,
  sessionArc: topology.polarity.sessionArc,
  ts: Date.now(),
});

// On session start:
const prev = BatchLogger.loadLastBaseline();
if (prev) {
  // Show delta vs today's opening:
  // "Your baseline energy last session: 0.31. Today's opening: 0.44 — elevated at start."
}
```

Cross-session invariant drift: compare `InvariantBaseline._baseline` across sessions. If sentiment baseline drops session-over-session → flag longitudinal decline.

**Exit criteria:**
- `BatchLogger` persists and reloads session baselines from localStorage
- `onBatch` payload includes `crossSessionDelta` when prior baseline exists
- Longitudinal trend flag appears after 3+ sessions

---

### PHASE 11 — Polish + Multiple Mics
**Stream:** B — External Mic  
**Depends on:** Phase 8 complete  
**Size:** ~100 lines

**What to build:**

Reconnection handling — host side mirrors mic.html's reconnect logic:
```js
peer.on('disconnected', () => {
  if (!peer.destroyed) setTimeout(() => peer.reconnect(), 2000);
});
```

Multiple simultaneous mics — `VL.extMic.conns` is already an array. Add per-conn identity:
- Each `conn` gets `conn.metadata.peerId` for attribution
- VL nodes carry `source: 'ext-mic-' + peerId.slice(-6)`
- Options panel shows each connected mic as a row: peerId, status, transcript count, disconnect button

TURN server migration — replace openrelay (rate-limited, unreliable) with self-hosted Coturn on rheon.world or a paid TURN (Metered, Twilio). This is a config change, not a code change. ICE config object already abstracted — one update in both files.

mic.html STT language — read from a `lang` command sent by host on connection:
```js
// host → mic on dataConn.open:
sendCmd('config', { lang: VL.lang || 'en-US' });
// mic handler:
if (msg.cmd === 'config') { micLang = msg.lang; }
```

**Exit criteria:**
- Two mic.html tabs both connected simultaneously → VL nodes attributed separately
- Host reconnects to existing mic after page refresh
- mic.html STT language matches VL language setting

---

## Invariants — All Phases (§1.1 — nothing pretends)

| Invariant | Rule |
|---|---|
| Baseline is frozen | `_baseline` is `Object.freeze()`'d on lock. Never mutates. |
| Warmup is silent | No topology scores emitted until `locked === true`. Consumers see `{ locked:false, warmupProgress }` only. |
| OLS never divides by zero | `_ols()` guards: `if (n<2) return {slope:0,r2:0}`. |
| Oscillation requires 2 full cycles | `detected:false` until 2 complete peak-trough-peak sequences observed. |
| Polarity flip requires threshold crossing | Momentary dip below zero is not a flip. Rolling mean must cross `POLARITY_FLIP_THRESHOLD` in magnitude. |
| Composite state is evidence-backed | `composite.evidence[]` always non-empty when `state !== 'CALIBRATING'`. Every label has a measurement behind it. |
| Audio axes are optional | `null` when no audio frames received. Composite scoring excludes null axes silently. System never degrades — it scores available axes only. |
| Hash parity | `_vlHashPw()` in index.html produces identical output to `micHashPw()` in mic.html — same FNV-1a + djb2, same concatenation. Verified by test before Phase 5 ships. |
| ICE parity | Host and mic ICE configs are identical objects. Mismatched STUN/TURN = NAT failure. |
| One host peer per session | Only one `Peer('{roomId}-HOST')` exists at a time. Destroy before re-init. |
| STT cannot target remote stream | Web Speech API is OS-level. Do not pass remoteStream to SpeechRecognition — it ignores it silently. STT on mic device, analytics on host. |
| Labels are topology, not diagnosis | `OSCILLATING` = signal is cycling. `CHAOTIC` = variance is unpredictable. `BASELINE_ALERT` = multi-axis deviation from this person's session opening. None are psychological assertions. |

---

## Open Questions (consolidated)

| # | Question | Affects |
|---|---|---|
| 1 | **Warmup length** — 5 batches (~50s). Configurable per use-case? Auto-extend if warmup variance is high? | Phases 1, 10 |
| 2 | **Session re-baselining** — for sessions > 2 hours, should baseline optionally re-lock at midpoint? | Phase 1 |
| 3 | **OLS local vs global slope** — expose both local (last 8 batches) and global (full session) slopes? | Phase 2 |
| 4 | **Oscillation minimum period** — floor at 4 batches (40s) to avoid flagging normal conversational rhythm? | Phase 4 |
| 5 | **Video topology** — separate `TopologyEngine` instance for video, or merge into one cross-modal instance? | Phase 9 |
| 6 | **ALK kernel in index.html** — inline, module import, or BroadcastChannel bridge from video-demo.html? | Phase 8 |
| 7 | **TURN server** — self-hosted Coturn on rheon.world, or paid TURN (Metered/Twilio)? | Phase 11 |
| 8 | **Multiple mics max** — is there a cap on simultaneous external mics? Transcript interleaving attribution? | Phase 11 |
| 9 | **mic.html codec analytics** — should mic.html run codec locally and send `{ text, energy, friction, cadence }` enriched payloads, or stay minimal and let host enrich from audio stream? | Phase 6 |
| 10 | **Cross-session baseline storage** — localStorage (already used by BatchLogger) or Jaa/server-side via Jonathan's stack? | Phase 10 |

---

## File Change Map

| File | Phases | Changes |
|---|---|---|
| `codec.js` | 1–4 | Add: `InvariantBaseline`, `PolarityEngine`, `SlopeEngine`, `StabilityEngine`, `OscillationEngine`, `TopologyEngine`. Wire into `TranscriptEngine`, `NexusCodec`. Update `BatchLogger`. |
| `index.html` | 5–8, 11 | Add: PeerJS CDN, `_vlHashPw`, `_vlDeriveRoomId`, `VL.extMic`, `_vlInitExtMic`, `_vlWireDataConn`, EXT MIC options tab. Patch `_vlStartRecord/Stop`. Add ALK kernel (Phase 8). |
| `mic.html` | 6, 11 | Add: STT loop in `startLocalRec/stopLocalRec`, `sendCmd('transcript')`, `config` command handler for lang. |
| `kernel.js` | 8 | No changes — already complete. |
| `behavior-module.js` | 8–9 | Subscribe to topology events. Enrich interpretation strings with state context. |
| `video-demo.html` | 9 | Feed `motionScore` and `luminance` into `TopologyEngine` via ALK event. |
| `BatchLogger` (in codec.js) | 1, 10 | Add topology fields. Add `saveSessionBaseline` / `loadLastBaseline`. |
