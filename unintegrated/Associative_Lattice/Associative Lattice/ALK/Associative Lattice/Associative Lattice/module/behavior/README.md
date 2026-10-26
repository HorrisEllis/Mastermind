# Associative Lattice Kernel (ALK)
**v1.2.0 — General-purpose decoupled event fabric + BehaviorAnalysisModule**

---

## What ALK Is

ALK is not a voice system. It is not a therapy tool. It is not a sensor pipeline.

It is the **substrate beneath all of those** — a general-purpose, domain-agnostic event kernel that any module can plug into. Modules communicate only through events. No module holds a reference to any other module. All structure — causal chains, semantic associations, temporal patterns — emerges from the lattice.

```
                    ┌────────────────────────────────────────┐
                    │              ALK KERNEL                │
                    │                                        │
  Producer          │  emit()  →  [Gate Chain]  →  Ring     │
     │              │                  │              │      │
     └──────────────│──────────────────▼──────────────▼──── │
                    │            Lattice Graph   Subscribers │
                    │         (causal + semantic)  (pattern) │
                    └────────────────────────────────────────┘
```

---

## Files

| File | Purpose |
|------|---------|
| `kernel.js` | Core kernel: ring buffer, lattice graph, gate system, clock, pattern routing, pulse (§1.8) |
| `modules.js` | Standard module library: Verbal, Memory, Video, Ollama, CausalNexusBridge, Watchdog |
| `behavior-module.js` | BehaviorAnalysisModule: 10 psychology/linguistics detectors, VideoNarrativeTranslator |
| `behavior-module.test.js` | Test suite: 53 tests, all §4.4 / §8.6 compliant |
| `video-module.js` | VideoModule: real MediaPipe (FaceMesh 478pt, Pose 33pt, Hands 21pt×2) |
| `video-module.server.js` | Node.js adapter: codec-native frame extraction (CodecFrameExtractor), headless MediaPipe, VideoFileProcessor |
| `video-demo.html` | Live browser demo: webcam + landmark overlay + event stream |
| `index.html` | Interactive spec dashboard with live event simulator |
| `CHANGELOG.md` | Living document — §1.7 §5.6 §6.1 |
| `ROADMAP.md` | Phase map — §3.1 |
| `README.md` | This file |

---

## Kernel Contracts

| # | Contract |
|---|----------|
| §K1 | Events are frozen on construction. `Object.freeze()` enforced on event, payload, and meta. |
| §K2 | Gate output is collected atomically. Gates never call `emit()` directly. Depth-capped at 20. |
| §K3 | Channels are dot-namespaced. `*` = one segment. `**` = any depth. Mid-pattern wildcards supported. |
| §K4 | Logical clock is strictly monotone. Wall clock is advisory only. |
| §K5 | Ring buffer is bounded. Old events are evicted cleanly — lattice edges pruned on eviction. |
| §K6 | No module may call another module directly. All communication via `kernel.emit()`. |
| §K7 | All errors surface as `alk.kernel.error` events. The kernel never throws to callers. |
| §K8 | Module UUIDs are opaque. No module introspects another's internals. |

---

## Quick Start

```js
import { createKernel } from './kernel.js';
import { VerbalModule, MemoryModule } from './modules.js';

const kernel = createKernel({ ringCap: 50_000 });
const verbal  = new VerbalModule({ kernel });
const memory  = new MemoryModule({ kernel, config: { windowMs: 600_000 } });

// Subscribe to anything with wildcards
kernel.subscribe('alk.verbal.analysis.**', (ev) => {
  console.log(ev.type, ev.payload);
});

// Subscribe to ALL events
kernel.subscribe('**', (ev) => {
  console.log(`[${ev.meta.tick}]`, ev.type);
});

// Start a session
kernel.emit('alk.session.capture.start', { sessionId: 'sess-001' });

// Push an audio chunk (Float32Array of PCM samples)
kernel.emit('alk.verbal.chunk.ingest', {
  samples:    myFloat32Array,
  durationMs: 500,
  transcript: 'I feel really good about this',
  sessionId:  'sess-001',
});

// Stop session
kernel.emit('alk.session.capture.stop', { sessionId: 'sess-001' });
```

---

## Module Event Surfaces

### VerbalModule

**Listens:**
- `alk.session.capture.start` — begins capture
- `alk.session.capture.stop`  — ends capture
- `alk.verbal.chunk.ingest`   — `{ samples: Float32Array, durationMs, transcript? }`

**Emits:**
- `alk.verbal.capture.start/stop`
- `alk.verbal.chunk.raw` — `{ chunkIndex, durationMs, byteLength }`
- `alk.verbal.chunk.transcribed` — `{ text, chunkIndex }`
- `alk.verbal.analysis.tone` — `{ energy, zcr, spectralCentroid, cadence, silence }`
- `alk.verbal.analysis.sentiment` — `{ score[-1..1], valence, confidence, rollingAvg }`
- `alk.verbal.analysis.shift` — `{ primary, allShifts, shiftIndex }` — statistical micro-shift
- `alk.verbal.pattern.emit` — `.pat` chunk data

### MemoryModule

**Listens:** `**` (all events), `alk.memory.request.replay`, `alk.memory.config`

**Emits:**
- `alk.memory.snapshot` — periodic health snapshot
- `alk.memory.replay` — `{ count, events[] }`
- `alk.memory.evicted` — `{ count }`

Config: `windowMs` (5m–2h), `enabled`, `excludePatterns[]`

### OllamaModule

**Listens:**
- `alk.ollama.analyze`   — `{ prompt, model?, context?, requestId }`
- `alk.ollama.summarize` — `{ text, model?, requestId }`

**Emits:**
- `alk.ollama.request.sent`
- `alk.ollama.response.received` — `{ requestId, response, totalMs, context }`

### VideoModule

**Listens:**
- `alk.session.capture.start/stop`
- `alk.video.frame.ingest` — `{ landmarks, frameIndex }`

**Emits:**
- `alk.video.capture.start/stop`
- `alk.video.frame.analyzed`
- `alk.video.cue.detected` — `{ cueType, confidence, detail }`

Cue types: `gaze_aversion`, `head_tilt`, `posture_shift`, `microexpression`, `hand_gesture`, `eye_contact`, `facial_tension`

### CausalNexusBridge

Mirrors **causal-nexus v5** events into ALK lattice.

```js
import { createKernel as createNexus } from 'causal-nexus';
const nexus = createNexus();

kernel.emit('alk.causal.nexus.attach', { nexusKernel: nexus });
// All nexus events now appear as alk.causal.nexus.event in the ALK lattice
```

Bidirectional mode: `config.bidirectional = true` — ALK `alk.causal.**` events pushed back into nexus.

### WatchdogModule

**Listens:** `alk.watchdog.register`, `alk.watchdog.deregister`, `alk.watchdog.poll`

**Emits:**
- `alk.watchdog.heartbeat` — `{ report{}, moduleCount }`
- `alk.watchdog.alert` — `{ name, status: 'DEGRADED' | 'OFFLINE', health }`

---

## Gate System

```js
kernel.registerGate('my-gate', (ev) => {
  if (ev.type !== 'alk.verbal.analysis.sentiment') return null;
  if (ev.payload.score < -0.8) {
    return {
      emit: [{ type: 'alk.alert.crisis', payload: { score: ev.payload.score }, meta: { causedBy: ev.id, edgeType: 'rule' } }]
    };
  }
  return null;
}, { priority: 30 });
```

Gate return values:
- `{ block: true }` — prevent event from reaching subscribers
- `{ emit: [...] }` — atomically emit additional events
- `{ transform: newPayload }` — replace event payload
- `null` — pass through

---

## Lattice Queries

```js
// Causal chain — trace an event back to its root
const chain = kernel.traceToRoot(eventId);

// All events caused by a given event (transitively)
const descendants = kernel.descendants(eventId);

// Parent event
const parent = kernel.parent(eventId);

// Children
const children = kernel.children(eventId);

// Stats
const s = kernel.stats();
// → { tick, ringSize, subscriptions, lattice: { nodes, edges } }
```

---

## .pat Binary Format

The `.pat` file is the ALK pattern interchange format. It encodes vocal pattern data in a compact, diffable, machine-readable binary.

**Browser (live mic — codec-native, no ffmpeg):**
```js
import { NexusCodec } from '../codec.js';

const codec = new NexusCodec({
  onAudioFrame: (frame) => {
    // frame: { energy, zcr, spectralCentroid, cadence, silence,
    //          energyDelta, energySigma, energyZ, energyAnomaly, ... }
    // Feed directly to pat-from-pcm.js or VerbalModule
  },
  onBatch: (batch) => {
    // batch: { text, tags, sentiment, friction, associations, ... }
  },
});
await codec.start();
```

**Server-side (raw PCM file — no ffmpeg):**
```js
// Read raw float32-LE PCM at 16kHz, mono, from any source
// and pipe through the codec's audio math directly.
import fs from 'fs';
import { GPGPUAudioProcessor } from '../codec.js';  // if exported separately
// or drive the RollingStats + energy/ZCR math manually:
// see codec.js GPGPUAudioProcessor._analyzeFrame() for the exact formulas.
```

> **Frame Extraction (video files):** To process `.mp4`/`.webm` containers
> server-side, pre-extract frames to a JPEG/PNG directory first using any
> tool, then pass the directory to `VideoFileProcessor.processFrameDir()`.
> The codec handles all subsequent pixel math (no ffmpeg at runtime).

**Header** (64 bytes): magic `PAT1`, version, session ID, start/end timestamps, chunk count, sample rate, chunk duration.

**Body** (32 bytes × chunk count): timestamp offset, energy (float32), ZCR (float32), spectral centroid (float32), cadence (float32), sentiment (float32), flags (silence | shift | hasTranscript).

---

## Module UUID Registry

| Module | UUID prefix |
|--------|-------------|
| Kernel | `alk-kernel-0000-0000-1000-0000-000000000001` |
| Verbal | `alk-mod-verbal-0000-1000-0000-000000000020` |
| Memory | `alk-mod-memory-0000-1000-0000-000000000030` |
| Ollama | `alk-mod-ollama-0000-1000-0000-000000000040` |
| Video  | `alk-mod-video-0000-1100-0000-000000000050` |
| Causal Bridge | `alk-mod-causal-bridge-0000-1000-0000-000000000060` |
| Watchdog | `alk-mod-watchdog-0000-1000-0000-000000000070` |
| Behavior | `alk-mod-behavior-0000-1200-0000-000000000080` |

---

## Design Principles

1. **Nothing pretends.** Every computed value documents what it actually computes. Approximations are labeled as approximations (§1.1 from ALV verbal spec).

2. **Zero direct calls.** Modules are isolated. The only connective tissue is the event lattice. Adding a module never requires touching another module.

3. **Errors are events.** No module throws into the kernel. Errors are first-class data in the event stream, queryable, storable, and analyzable like anything else.

4. **Causality is structural.** The lattice isn't a log — it's a graph. Every event can know its parent, its children, and its semantic relatives. Causal chains are traversable.

5. **Memory is configurable.** The MemoryModule's rolling window is the "forget to hit save" safety net. 5 minutes by default, up to 2 hours. Toggle anytime via event.

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phase map.

| Phase | Item | Status |
|-------|------|--------|
| v1.0 | Kernel, VerbalModule, MemoryModule, OllamaModule, CausalNexusBridge, Watchdog | ✓ Done |
| v1.1 | VideoModule — real MediaPipe (FaceMesh 478pt, Pose, Hands) | ✓ Done |
| v1.2 | BehaviorAnalysisModule — 10 psychology domains, VideoNarrativeTranslator | ✓ Done |
| v1.3 | TextModule, pat-from-pcm CLI | Planned |
| v1.4 | CausalNexus Engine — do-calculus, counterfactual divergence | Planned |
| v1.5 | Emotional Field Model — continuous surface, WebGL | Planned |
| v1.6 | Predictive Emotional Dynamics — next-state forecasting | Planned |
| v1.7 | Multi-Person Lattice Fusion — group dynamics | Planned |
| v2.0 | Self-Reflective Lattice — models own prediction errors | Planned |
| v2.1 | Ethical Boundary Layer — manipulation detection, confidence degradation | Planned |
| v2.2 | WebGL Emotion Weather Map | Planned |
| v2.3 | Intervention Optimization Engine | Planned |
| v3.0 | Forge Integration — AI self-modification | Planned |
