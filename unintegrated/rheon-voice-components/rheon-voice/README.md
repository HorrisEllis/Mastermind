# Rheon Voice v7

**Behavioral signal intelligence for spoken thought.**

Part of the [Spatial ecosystem](https://rheon.world) — an operating system for the space between people.

---

## What it does

Records your voice, transcribes it in real-time, and runs a full behavioral analytics pipeline on every utterance:

- **Signal topology** — SlopeEngine, StabilityEngine, OscillationEngine, PolarityEngine, InvariantBaseline
- **Friction analysis** — disfluency (acoustic-fused, see below), filler words, memory gaps, cognitive load, tension, denial
- **Association engine** — Jaccard content-word graph, n-gram redundancy, invariant word detection
- **Predictive engine** — Markov-1 tag transitions, trigram word prediction
- **Resonance engine** — temporal cosine similarity across session nodes
- **Drift engine** — 7-signal behavioral drift detection with confidence propagation
- **Flow state scoring** — composite score from coherence, dysfluency, WPM stability
- **LLM mirror** — Claude API (primary) → Ollama (fallback) → offline stripping

Plus an **external mic client** (`mic.html`) that lets a phone/tablet send audio + transcripts to the host over peer-to-peer WebRTC.

---

## Project structure

```
rheon-voice-v7/
├── index.html              — Main voice app (open in Chrome)
├── mic.html                — External mic client (open on phone/tablet)
├── package.json
├── README.md
├── css/
│   └── main.css            — Full design system, dark terminal aesthetic
├── js/
│   ├── codec-engines.js    — RollingStats, FrictionAnalyzer, AssociationEngine,
│   │                         PredictiveEngine, InvariantBaseline, PolarityEngine,
│   │                         TopologyEngine, scoreSentiment
│   ├── analysis-engine.js  — SlopeEngine, StabilityEngine, OscillationEngine,
│   │                         PitchEngine, ResonanceEngine, DriftEngine,
│   │                         ReceiverGrammar, FlowState, text helpers
│   ├── audio-engine.js     — AudioContext + GainNode (user-adjustable 1-32x,
│   │                         default 8x/+18dB), ResizeObserver canvas,
│   │                         min/max envelope waveform, cached signal
│   │                         extraction, fused acoustic dysfluency
│   │                         (loudness/pitch-stability/spectral-flux)
│   └── app.js              — Orchestration, speech engine, LLM mirror,
│                             domain system, ext mic PeerJS host, render, storage
└── server/
    └── server.js           — Minimal Express static server (optional)
```

---

## Quick start

### Option A — Open directly (no server)

The single-file build at `outputs/rheon-voice-v7.html` has everything inlined. Open it directly in Chrome. No installation needed.

### Option B — Local server

```bash
npm install
npm start
# → http://localhost:3000
```

Open `http://localhost:3000` in Chrome for the main app.
Open `http://localhost:3000/mic.html` on a phone/tablet for the external mic.

---

## External mic setup

The external mic lets you speak from a separate device (phone, tablet) and have the transcript appear in the main app.

1. Start the server: `npm start`
2. Open `http://<your-ip>:3000/mic.html` on your phone (same WiFi network)
3. In the main app: go to **EXT MIC** tab → enter a password → click **INIT HOST**
4. On the phone: enter the **same password** → click **CONNECT TO HOST**
5. Tap the orb to start recording — transcripts appear as nodes in the main app

### How it works

```
mic.html (phone)                    index.html (desktop)
────────────────                    ────────────────────
SpeechRecognition                   PeerJS host peer
  ↓ final transcript                AudioEngine (receives stream)
  ↓ cmd: 'transcript'  ──WebRTC──►  addNode(text, audioMetrics)
  ↓ MediaStream audio  ──WebRTC──►  Waveform + signal analysis
```

No server is involved in the peer connection — it's WebRTC direct (P2P via PeerJS public STUN/TURN servers).

---

## Domains

The app supports 5 analysis domains, each adding domain-specific framework pattern detection:

| Icon | Domain | Extra patterns |
|------|---------|---------------|
| ◈ | VOICE (default) | Base patterns only |
| ⬡ | THERAPY | Projection, catastrophising, minimising, attachment |
| ⌥ | CODE | Bug reasons, design debt, uncertainty |
| ◆ | STRATEGY | Constraints, leverage, risk framing |
| ⊗ | JOURNAL | Self-compassion, gratitude, intention |

Switch domains via the icon buttons in the topbar. Domain is saved with session export.

---

## LLM Mirror

Every node gets a cleaned mirror (filler-stripped, hedge-stripped, precision-translated).

Priority:
1. **Claude API** (`claude-sonnet-4-20250514`) — streaming via `anthropic-dangerous-direct-browser-access`
2. **Ollama** (`http://localhost:11434`) — any local model (default: `mistral:7b`)
3. **Offline** — regex-based filler/hedge stripping, no network needed

The mirror prompt includes: sigma regime, topology state, friction types, resonance class, domain context.

---

## Architecture notes

### Audio pipeline
- `getUserMedia` with `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`
- `GainNode` at 4× amplification before the `AnalyserNode`
- One stream acquired per session, reused across stop/start cycles
- Waveform drawn with min/max envelope downsampling (512 pts max), `ResizeObserver` for correct DPR scaling

### Codec engines load order (required)
```html
<script src="js/codec-engines.js"></script>    <!-- RollingStats, etc. -->
<script src="js/analysis-engine.js"></script>  <!-- slopeEngine, etc. -->
<script src="js/audio-engine.js"></script>     <!-- AudioEngine -->
<script src="js/app.js"></script>              <!-- app orchestration -->
```

### Storage
- `localStorage` by default (falls back to `window.storage` if available in NEXUS/Claude.ai context)
- Save is debounced 2s to avoid blocking on every utterance
- Word bank render is throttled to 1/sec
- Export is full JSON including topology, invariants, domain, codec batches

---

## Invariants

```
§1.1  Nothing pretends. Every value is computed, not estimated.
§1.2  All errors are loud and traceable. Zero silent failures.
§5.5  Zero external runtime dependencies in browser engines.
§5.7  One getUserMedia call per session. All engines share the stream.
§MIC  Hash parity: _vlHashPw() in app.js ≡ micHashPw() in mic.html.
§MIC  ICE config: EXT_MIC_ICE in app.js ≡ ICE_CONFIG in mic.html.
§MIC  PeerJS room convention: {roomId}-HOST / {roomId}-MIC-{rand}.
§COH  scoreCoherence() is TF-IDF weighted cosine + recency decay (0.80^dist),
      IDF rebuilt per-call from the passed `nodes` array — pure function,
      no module-level cache. Merged from v4.2 line, see GAPS.md #1.
§DYS  scoreDysfluencyFused(text, acousticDysfluency) is the default scorer
      (60% acoustic / 40% lexical). scoreDysfluency(text, zcr) is the
      lexical-only fallback when no AudioEngine snapshot is available.
§GAIN AudioEngine gain is user-adjustable (1x–32x, default 8x/+18dB) via
      setInputGain(). classifyFrame() thresholds are calibrated to this
      default — recalibrate both together if the default changes.
```

---

## Browser requirements

- **Chrome** (or any Chromium browser) — Web Speech API is required
- **Firefox** — audio visualisation works, transcription does not
- **Safari** — partial Web Speech API support (experimental)

The external mic client (`mic.html`) works on Chrome for Android/iOS.

---

*Part of the Spatial ecosystem. The space between people. Finally visible.*
