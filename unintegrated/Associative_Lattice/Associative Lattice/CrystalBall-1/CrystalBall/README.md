# CrystalBall

Associative Lattice Kernel — behavioral signal runtime in an Electron container.

## Structure

```
CrystalBall/
  main.js                     ← Electron main process (kernel container)
  src/
    preload.js                ← Context bridge (safe IPC to renderer)
    updater.js                ← Git-based hot reload (chokidar + simple-git)
    ws-server.js              ← Local WebSocket bridge (binary streaming)
    vcam.js                   ← Virtual camera (canvas stream + v4l2loopback)
    pipeline.js               ← Codec + 2s jitter buffer + bitstream monitor
  modules/
    ALK/                      ← Full ALK stack (video, audio, signal, HTL, mesh)
      modules/
        speech-state-module.js  ← Speech mode, fragmentation, dysregulation, emotion spectrum
        framework-model.js      ← Bayesian belief systems, sigma fields, simulation detection
        alk-wire.js             ← Wiring: SpeechState + FrameworkModel into ALK bus
      crystalball-renderer.js   ← Renderer bridge (vcam, WebRTC, bitstream, bus)
      index.html                ← Main UI (patched to load CB renderer first)
    Resonance/                ← Resonance Engine + ASE + IDL (TypeScript server)
    irs/                      ← IRS indexer + UI
```

## Setup

```bash
# Install
npm install

# Run (no auto-update, local dev mode)
npm run dev

# Run with git auto-update
CB_REPO=https://github.com/youruser/crystalball.git npm start

# Build distributable
npm run dist
```

## Auto-Update

Set `CB_REPO` env var to your git repo URL.

CrystalBall polls the remote every 30s. On new commits:
1. `git pull --ff-only` into `modules/`
2. Renderer reloads automatically
3. All running sessions continue (WS connection survives reload)

Without `CB_REPO`: chokidar watches `modules/` for file changes and reloads on save.

## Virtual Camera

Uploaded files (MP4, MOV, images) are streamed through the pipeline:

```
File → Node decode (ffmpeg if available, raw RGBA otherwise)
     → 2s jitter buffer
     → WS binary stream → VCAM_FRAME channel
     → Renderer OffscreenCanvas
     → canvas.captureStream(30)
     → MediaStream (looks like a webcam to MediaPipe)
```

To use:
```js
// In renderer, after loading crystalball-renderer.js:
await window.__cbRenderer.uploadFile('/path/to/video.mp4');
// Then start session — MediaPipe will use the virtual stream
```

## WebRTC Encrypted Pipeline

Uses the existing magnet link format with encryption extension:

```
alk://v1/{sessionId}/{iceHash}/{ts}/{ttl}?sr=48000&ch=1&codec=opus&role=mic&enc=aes256gcm
```

E2E encryption: AES-256-GCM, key derived via HKDF-SHA256 from sessionId.
IV: per-frame counter. Tag: 16 bytes GCM.

DTLS 1.3 (WebRTC mandatory) + AES-256-GCM DataChannel = defense in depth.

## Bitstream Monitor

The bitstream panel appears bottom-left (dev mode: always visible).
Shows live: fps, raw bps, compressed bps, compression ratio, buffer fill, latency.

Pipeline stats available via:
```js
const stats = await window.__cbRenderer.getPipelineStats();
// { video: { buffered, fillRatio, latencyMs, drops }, audio: {...} }
```

## Signal Stack

```
MediaPipe (face 478pt + pose 33pt + hands 42pt)
  → VideoModule → ExpressionEngine (52 blendshapes, FACS, micro-expression)
  → SignalTopology (cross-modal composites)
  → LatentModel (Kalman 5D: valence, arousal, suppression, coherence, engagement)
  → SuppressionScore (surface/subsurface gap, micro rate, cross-channel)
  → TrajectoryRecorder → AttractorLandscape → FieldPortrait
  → ALKMesh (zero-server WebRTC via magnet link)
  → HTL (12 modules: NS polyvagal, EMO Panksepp, COG, NEED NVC, VAL Haidt,
          ATT attachment, MOD love languages, LANG cultural calibration,
          SOM somatic bridge, GAP 9 silence types, XLAT translator, REL dyad)
  → SpeechStateModule (mode, fragmentation, dysregulation ×7, grounding,
                        emotion spectrum ×35, integration, self-reference, rhythm)
  → FrameworkModel (10 belief systems, Bayesian update, 4σ fields,
                     simulation detection, coherence, inversion, anomaly)
```
