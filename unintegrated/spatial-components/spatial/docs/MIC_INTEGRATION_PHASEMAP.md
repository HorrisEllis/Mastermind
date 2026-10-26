# NEXUS — External Mic Integration Phase Map
**Document type:** Connection audit + phased build spec  
**Scope:** `mic.html` (external mic client) → `index.html` (Mastermind / Voice Lattice host)  
**Status:** Phase 0 — Audit complete. Build not started.

---

## 1. What Exists Now

### 1.1 `mic.html` — External Mic Client (COMPLETE)

A standalone PWA-ready page. Fully built. Ships with:

| Feature | Implementation |
|---|---|
| Login | Password → FNV-1a + djb2 dual hash → `localStorage('nexus_mastermind_pw')` |
| Session persistence | `sessionStorage('nexus_mic_auth')` — survives page refresh, dies on tab close |
| Room ID derivation | `'NX-' + hash.slice(3,9) + '-' + hash.slice(9,15)` — deterministic from password, zero manual entry needed |
| PeerJS identity | `{roomId}-MIC-{3-char random}` |
| Target host | `{roomId}-HOST` (hardcoded convention) |
| Transport | PeerJS 1.5.4 over `0.peerjs.com:443` (public STUN + openrelay TURN) |
| Channels | **Data channel** (JSON commands, reliable) + **Audio call** (MediaStream) |
| Commands sent | `pong`, `recording_started`, `recording_stopped` |
| Commands received | `record_start`, `record_stop`, `state_sync`, `ping` |
| Audio | `getUserMedia({audio: true})` → MediaStream → PeerJS call + local MediaRecorder |
| Waveform | Web Audio API analyser → canvas (mirrors VL orb waveform exactly) |
| Recording | MediaRecorder → `.webm` blob → auto-download on stop |
| UI | Pixel-perfect VL orb (same CSS keyframes as dashboard), room input, connect/disconnect |
| ICE config | 3× Google STUN + 3× openrelay TURN (TCP fallback included) |

**What mic.html does NOT have:**
- Codec integration (no `NexusCodec`, no `GPGPUAudioProcessor`, no behavioral analytics)
- Transcript → VL node injection (records locally only, sends audio stream to host)
- ALK kernel events
- Any knowledge of VL node structure

---

### 1.2 `index.html` — Mastermind / Voice Lattice Host (INCOMPLETE for this feature)

| What exists | State |
|---|---|
| `VL` object — full node graph, lattice, associations, heuristics | ✓ Complete |
| `vlAddNode(text, opts)` — creates a node from text | ✓ Complete |
| `_vlStartRecord()` / `_vlStopRecord()` — Web Speech API recognition loop | ✓ Complete |
| `_vlStartWave()` / `_vlStopWave()` — waveform canvas | ✓ Complete |
| Tag engine — FRICTION, BLOCK, LOOP, GAP, REL, SEED auto-tagging | ✓ Complete |
| Association engine — word-overlap Jaccard across nodes | ✓ Complete |
| Options panel — AI BACKEND, LM STUDIO, OLLAMA, DISPLAY, DATA tabs | ✓ Complete |
| **EXT MIC tab in options panel** | ✗ Missing |
| **PeerJS host receiver** — `new Peer('{roomId}-HOST')` | ✗ Missing |
| **Audio call answer** — `peer.on('call', ...)` | ✗ Missing |
| **Data channel handler** — `record_start/stop`, `state_sync` | ✗ Missing |
| **External audio → Web Speech API** | ✗ Missing (see §3 constraint) |
| **Codec wiring** — `NexusCodec` audio pipeline on received stream | ✗ Missing |
| **VL node injection from external transcript** | ✗ Missing |
| Password hash function matching `mic.html` | ✗ Missing (needs to match exactly) |

---

## 2. Connection Protocol (Fully Documented)

### 2.1 Authentication

Both sides derive the same room ID from the same password. No manual room ID exchange needed once password is set.

```
password
  │
  ├─ FNV-1a hash (h1) ─────────────────────────┐
  └─ djb2 hash (h2) ────────────────────────────┤
                                                 ▼
                          hash = 'nx_' + h1.hex8 + h2.hex8
                          roomId = 'NX-' + hash[3:9].upper + '-' + hash[9:15].upper

mic.html peerId  →  '{roomId}-MIC-{3random}'
index.html peerId → '{roomId}-HOST'
```

**The same hash function must exist in both files.** mic.html has `micHashPw()`. index.html currently has no equivalent — it would need `vlHashPw()` (identical algorithm) to validate the password and derive the same room ID.

### 2.2 Transport Architecture

```
mic.html                              index.html (host)
────────                              ─────────────────
Peer('{roomId}-MIC-xxx')              Peer('{roomId}-HOST')
  │                                     │
  ├── peer.connect(hostId) ─────────────► peer.on('connection') → dataConn
  │   [reliable JSON data channel]       │
  │                                      │  Commands host→mic:
  │   ◄── { cmd:'record_start' } ────────┤  trigger startLocalRec()
  │   ◄── { cmd:'record_stop'  } ────────┤  trigger stopLocalRec()
  │   ◄── { cmd:'state_sync',             recording:bool } ─┤  on reconnect
  │   ◄── { cmd:'ping' } ────────────────┤
  │   ──► { cmd:'pong' } ────────────────┤  heartbeat response
  │   ──► { cmd:'recording_started' } ───┤  mic confirms rec started
  │   ──► { cmd:'recording_stopped' } ───┤  mic confirms rec stopped
  │
  └── peer.call(hostId, localStream) ──► peer.on('call') → call.answer()
      [WebRTC audio MediaStream]           │
      mic audio → host receives stream     │
                                           ▼
                                    [host processes stream]
```

### 2.3 Audio Stream — The Hard Constraint

WebRTC delivers audio as a **live `MediaStream`**. The host receives it via `call.on('stream', remoteStream => {...})`.

**Critical limitation:** Web Speech API (`SpeechRecognition`) cannot be pointed at an arbitrary `MediaStream`. It always captures from the default system microphone. This means:

- The host **cannot** feed the remote mic stream directly into `SpeechRecognition`
- Two workarounds exist — see Phase 2 options

### 2.4 ICE / NAT Traversal

mic.html configures ICE with 3 Google STUN servers and 3 openrelay TURN servers (including TCP fallback on port 443). The host side needs the **identical ICE config object** — otherwise the WebRTC handshake will use mismatched ICE candidates and may fail on asymmetric NATs.

---

## 3. Phase Map

### Phase 0 — Audit (DONE)
- [x] Read both endpoints
- [x] Document protocol
- [x] Identify all missing host-side pieces
- [x] Document the audio→STT constraint

---

### Phase 1 — Host Receiver (index.html, no codec yet)
**Deliverable:** Dashboard can receive mic.html's audio stream and control recording state bidirectionally.

**What to build in index.html:**

1. **Password hash function** — identical to `micHashPw()` in mic.html. Add as `_vlHashPw(pw)`.

2. **EXT MIC tab in Options panel** — new tab alongside existing ones:
   - Password field (to derive room ID)
   - Status indicator (peer state)
   - `INIT HOST` button — creates `Peer('{roomId}-HOST')`
   - Room ID display (read-only, derived)
   - Connected mic list (who's connected)
   - `SYNC STATE` button — sends `state_sync` to all connected mics

3. **PeerJS host init** — `_vlInitExtMic(password)`:
   ```js
   const roomId = _vlDeriveRoomId(password);
   vlExtMic.peer = new Peer(roomId + '-HOST', { ...ICE_CONFIG });
   vlExtMic.peer.on('connection', dataConn => { /* wire commands */ });
   vlExtMic.peer.on('call', call => {
     call.answer();  // no local stream needed
     call.on('stream', remoteStream => { vlExtMic.stream = remoteStream; });
   });
   ```

4. **State sync** — when `_vlStartRecord()` / `_vlStopRecord()` fires, also send `record_start` / `record_stop` to all connected mics. When mic sends `recording_started/stopped`, mirror state on host UI.

5. **ICE config** — same as mic.html (3 STUN + 3 TURN).

**State object to add to VL:**
```js
VL.extMic = {
  peer: null,       // Peer instance
  conns: [],        // active data connections
  calls: [],        // active audio calls
  streams: [],      // received MediaStreams
  roomId: null,     // derived room ID
  enabled: false,
};
```

---

### Phase 2 — Audio Processing (Two Options)

Pick one. They are mutually exclusive architectures.

#### Option A — Codec on Host (Recommended)
Wire `NexusCodec` / `GPGPUAudioProcessor` to the received remote `MediaStream`.

```js
call.on('stream', remoteStream => {
  const extAudio = codec.attachExternalStream(remoteStream);
  // codec fires onAudioFrame (energy, ZCR, cadence, anomaly)
  // codec fires onBatch (transcript via host's own speech rec)
});
```

**Pro:** Codec behavioral analytics run on the incoming audio — energy, friction, cadence, anomaly detection all work.  
**Con:** Transcript still comes from host's own mic (Web Speech API limitation). Only works if host and mic are co-located OR if the host can hear the remote audio through speakers (feedback loop — not ideal).

#### Option B — STT on Mic, Transcript over Data Channel
mic.html runs `SpeechRecognition` locally, sends final transcript chunks via data channel:

```js
// mic.html addition:
r.onresult = evt => {
  if (evt.results[i].isFinal) {
    const txt = evt.results[i][0].transcript.trim();
    sendCmd('transcript', { text: txt, final: true });
  }
};

// index.html handler:
if (msg.cmd === 'transcript') {
  vlAddNode(msg.text, { source: 'ext-mic', rhythmSig: 'ext-voice' });
}
```

**Pro:** Clean transcript → VL node pipeline. Works regardless of distance.  
**Con:** mic.html needs modification. No codec audio analytics on host side (only text arrives).

#### Option C — Both (Full pipeline)
- mic.html: STT locally → transcript chunks over data channel → host calls `vlAddNode()`
- Host: `NexusCodec.attachExternalStream(remoteStream)` → audio analytics (energy, cadence, anomaly) enriching the VL node that was just created from the transcript

This is the correct architecture. Transcript source of truth = mic device (where the speech is). Analytics = host (where the codec runs). Node enrichment = merge both.

**Node created at host:**
```js
vlAddNode(msg.text, {
  source:      'ext-mic',
  rhythmSig:   'ext-voice',
  energy:      vlExtMic.lastFrame?.energy,
  cadence:     vlExtMic.lastFrame?.cadence,
  energyAnomaly: vlExtMic.lastFrame?.energyAnomaly,
});
```

---

### Phase 3 — ALK Integration
Wire the ext mic stream into the ALK Associative Lattice Kernel.

- mic.html sends `transcript` commands → host → `kernel.emit('alk.verbal.transcript', { text, source:'ext-mic', sessionId })`
- `GPGPUAudioProcessor` on remote stream → `kernel.emit('alk.audio.frame', { energy, cadence, ... })`
- `BehaviorAnalysisModule` receives both → cross-modal analysis (verbal friction + audio energy anomaly)
- ALK events visible in VL event log (same pipeline as video module)

This phase assumes ALK kernel is loaded in index.html (currently it is not — it lives in the video-demo separately).

---

### Phase 4 — Polish
- Reconnection handling (mic.html already has `peer.on('disconnected')` → `peer.reconnect()` after 2s; host needs same)
- Multiple simultaneous mics (VL.extMic.conns is an array — already planned for)
- Mic identity labels in VL node metadata (`source: 'ext-mic-{peerId}'`)
- Recording sync UI — host recording indicator shows "MIC CONNECTED" badge
- Options panel: show connected mic list with disconnect buttons per client

---

## 4. Invariants (§1.1 — nothing pretends)

| Invariant | Rule |
|---|---|
| Hash parity | `_vlHashPw(pw)` in index.html must produce identical output to `micHashPw(pw)` in mic.html — same FNV-1a + djb2 algorithm, same concatenation |
| ICE parity | Host ICE config must be identical to mic.html — mismatched STUN/TURN = NAT failure |
| PeerJS version | Both must use PeerJS 1.5.4 — host currently has no PeerJS CDN import; add `<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js">` |
| Room ID convention | `{roomId}-HOST` and `{roomId}-MIC-{random}` — never break this pattern |
| STT cannot target remote stream | Web Speech API is OS-level, not stream-level. Do not attempt to pass remoteStream to SpeechRecognition — it will be ignored |
| One host peer per session | Only one `Peer('{roomId}-HOST')` instance may exist — destroy before re-init |

---

## 5. Files to Modify / Create

| File | Change | Phase |
|---|---|---|
| `index.html` | Add PeerJS CDN script tag | 1 |
| `index.html` | Add `_vlHashPw()`, `_vlDeriveRoomId()` | 1 |
| `index.html` | Add EXT MIC tab to options panel HTML | 1 |
| `index.html` | Add `VL.extMic` state object | 1 |
| `index.html` | Add `_vlInitExtMic()`, data channel handlers, call answer | 1 |
| `index.html` | Wire `_vlStartRecord/Stop` → send to mics | 1 |
| `index.html` | `NexusCodec.attachExternalStream(remoteStream)` | 2 |
| `mic.html` | Add local STT → `sendCmd('transcript', {text})` | 2C |
| `index.html` | `vlAddNode()` on incoming transcript command | 2C |
| `index.html` | `kernel.emit(alk.verbal.transcript)` | 3 |
| `index.html` | ALK kernel import / inline | 3 |

---

## 6. Open Questions

1. **ALK kernel in index.html** — currently lives only in video-demo.html. Does it get inlined into index.html, or does index.html load it as a module, or do they communicate via `BroadcastChannel`?

2. **Public TURN servers** — openrelay is rate-limited and unreliable for production. For rheon.world deployment: does Jonathan have a Coturn instance, or should we move to a self-hosted TURN on the same server?

3. **mic.html STT language** — currently hardcoded `en-US`. Should it match the VL language setting from index.html, or be independently configurable?

4. **Multiple mics** — Phase 4 assumes support for multiple simultaneous external mics. Is there a max? Transcript interleaving from two mics into one VL session needs an attribution label per node.

5. **Codec in mic.html** — Phase 2C puts STT on the mic client. Should the mic also run codec analytics locally and send `{ text, energy, cadence, friction }` enriched payloads? Or keep mic.html minimal and let the host enrich from the audio stream?
