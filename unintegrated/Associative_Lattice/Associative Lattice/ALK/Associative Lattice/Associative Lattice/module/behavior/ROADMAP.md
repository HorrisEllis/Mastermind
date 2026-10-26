# ROADMAP
**Associative Lattice Kernel (ALK)**
*Phase map. Written for what is planned, updated to record what was built. §6.1*

---

## Completed

### v1.0.0 — Foundation ✓
Kernel, ring buffer, lattice graph, gates, VerbalModule, MemoryModule, OllamaModule, CausalNexusBridge, Watchdog, spec dashboard.

### v1.1.0 — VideoModule ✓
Real MediaPipe wiring (FaceMesh 478pt + blendshapes, Pose 33pt, Hands 21pt×2). Node server adapter. Codec-native frame pipeline (CodecFrameExtractor). Live demo.

### v1.2.0 — BehaviorAnalysisModule ✓
Ten psychology/linguistics detection domains. VideoNarrativeTranslator (video→text). Test suite 53/53. Axiom remediation (§1.8, §5.4, §4.4).

---

## Planned

---

### v1.3.0 — TextModule + pat-from-pcm CLI ✓
Completed 2026-05-09. Tests: 89/89 passing.

- `text-module.js` — NLP on written communication
  - Chat log / email / document / note ingestion via `alk.text.ingest`
  - Topic modeling: co-occurrence matrix + greedy cluster expansion (§5.5 — no external deps)
  - Named entity tracking: proper nouns + high-frequency token promotion
  - Discourse coherence scoring: Jaccard content-word overlap + connector bonus
  - Semantic field coverage: 12 domains (SELF, OTHER, PAST, FUTURE, BODY, EMOTION,
    COGNITION, RELATIONSHIP, CONFLICT, RESOLUTION, UNCERTAINTY, AGENCY)
  - Lexical density + hedge detection + negation density
  - §1.8 pulse. §1.2 loud errors. §5.7 kernel-only I/O.

- `pat-from-pcm.js` — CLI raw-PCM→PAT pipeline (codec-native, no ffmpeg)
  - stdin float32-LE → FrameAnalyzer (codec-equivalent math) → PatEncoder → .pat file
  - Single file, batch directory, JSON, JSONL, decode modes
  - .pat header: 68 bytes. Body: 32 bytes × chunk. Flags: silence/shift/transcript/anomaly.

---

- `text-module.js` — NLP on written communication
  - Chat log ingestion
  - Email/document ingestion
  - Topic modeling (LDA-style, built not imported §5.5)
  - Named entity tracking across session
  - Discourse coherence scoring

- `pat-from-pcm.js` — CLI raw-PCM→PAT pipeline (codec GPGPUAudioProcessor math)
  - stdin float32 → tone analysis → PatEncoder → .pat file
  - Batch directory mode
  - Session ID from CLI arg or auto-generated

---

### v1.4.0 — CausalNexus Engine (Phase 3-A from roadmap)
**Gate:** v1.3.0 tests pass ✓
**Status:** Phase 1 COMPLETE (2026-05-09) — Tests 121/121

**Phase 1 complete:** `InvariantBaseline` + `PolarityEngine` + `TopologyEngine` shell wired into `TranscriptEngine` and `BatchLogger`. All exit criteria satisfied.

**Phase 2 next:** `SlopeEngine` — OLS linear regression over sliding window per axis.

**Remaining phases (per NEXUS_MASTER_PHASEMAP):**
- Phase 2: `SlopeEngine` (OLS per axis, narrative string, DRIFTING states)
- Phase 3: `StabilityEngine` (variance of variance, CHAOTIC/DRIFTING/STABLE)
- Phase 4: `OscillationEngine` + audio axes wired (ZCR, peak detection, period)
- Phase 5: Host Receiver in index.html (PeerJS, EXT MIC tab)
- Phase 6: STT Bridge mic.html → index.html
- Phase 7: Topology → VL Node Enrichment
- Phase 8: ALK Kernel in index.html + full event pipeline
- Phase 9: Video Topology + Cross-Modal Composite
- Phase 10: Cross-Session Baseline Persistence
- Phase 11: Polish + Multiple Mics

---

### v1.5.0 — Emotional Field Model (Phase 3-E / 4-C from roadmap)
**Gate:** v1.4.0 tests pass

- `emotional-field.js`
  - Continuous emotional surface over time (grid-based)
  - Field evolution via convolution kernel (diffusion)
  - Resonance zones, suppression zones, stability basins
  - WebGL field renderer
  - `alk.field.state` event stream

---

### v1.6.0 — Predictive Emotional Dynamics (Phase 3-C from roadmap)

- `predictor-module.js`
  - `E(t+1) = f(E(t), ∇E(t), Vt, Mt)` — linear predictor with online weight update
  - Outputs: `next_emotion_vector`, `confidence_entropy`, `drift_forecast`
  - `alk.predictor.forecast` events
  - Integrates with BehaviorAnalysisModule escalation signals

---

### v1.7.0 — Multi-Person Lattice Fusion (Phase 4-B from roadmap)
**Gate:** v1.6.0 tests pass

- `fusion-module.js`
  - Per-person sub-lattice
  - FusionNode — shared emotional field across N participants
  - FusionEdge — inter-person influence vectors
  - Tension index: variance of emotional states across group
  - `alk.fusion.state` events
  - Supports: therapy room, couples, group dynamics, triads

---

### v2.0.0 — Self-Reflective Lattice (Phase 5-A from roadmap)
**Gate:** All v1.x tests pass

System that models its own prediction errors over time.

- `reflection-module.js`
  - ErrorNode: predicted vs actual delta per modality
  - Self-correction loop: weight adjustment on persistent error
  - Error attribution: which modality (verbal/video/text) caused drift
  - Confidence calibration: outputs uncertainty alongside predictions
  - `alk.reflection.error` events
  - `alk.reflection.correction` events

---

### v2.1.0 — Ethical Boundary Layer (Phase 5-B from roadmap)

- `ethics-module.js`
  - Semantic permission system over influence simulation
  - Manipulation pattern detection (asymmetric influence, steering bias)
  - Prediction overconfidence degradation
  - Hard rule: if `system_confidence > human_signal_clarity` → degrade output certainty
  - `alk.ethics.flag` events
  - Non-blocking: all flags are events, never suppression

---

### v2.2.0 — WebGL Emotion Weather Map (Phase 5-C from roadmap)

- `weather-renderer.js`
  - Heat gradients = emotional intensity
  - Flow vectors = conversational drift
  - Vortices = conflict loops
  - Calm basins = resolution states
  - Real-time WebGL shader pipeline
  - Interventions reshape the "storm map" in real time

---

### v2.3.0 — Intervention Optimization Engine (Phase 9-A from roadmap)

> "Which actions produce the most stable future distributions?"

- `intervention-engine.js`
  - Intervention: `(Actor, Action, Target, Context)`
  - Simulates each intervention across all tracked timelines
  - System stability function: `avg_trust - avg_volatility + repair_density - conflict_propagation`
  - "Pebble → tidal wave" sensitivity index
  - Ripple amplification factor: `emotional_centrality × network_degree × historical_volatility`
  - Output: ranked interventions with expected stability gain and variance

---

### v2.4.0 — Attachment Trajectory Engine (Phase 7-B from roadmap)

- Extends BehaviorAnalysisModule.AttachmentDetector
- Cross-session persistence of attachment trajectory
- Trend detection: increasing anxiety, stabilizing secure patterns
- Relational-pair specific state: `Attachment(A↔B) ≠ Attachment(A↔C)`
- `alk.attachment.trajectory` events

---

### v2.5.0 — Distributed Kernel Mesh

- Multi-kernel communication over WebSocket
- `alk.mesh.*` event namespace
- Each kernel is a node in the mesh
- Events route across nodes by session ID
- CQL query engine port from causal-nexus v5

---

### v3.0.0 — Forge Integration (AI self-modification)

- AI-powered self-modification of module configs via events
- Module manifests as mutable config surfaces
- Idea Ledger + Upgrade Ledger implementation (§7.1)
- Sigma engine: idea-to-upgrade conversion rate, gate latency, branch entropy

---

## Idea Ledger (unvalidated — §7.2 — these cannot affect runtime)

- Olfaction module — chemical/environmental sensor data ingestion
- EEG integration — raw electrical signals as lattice events
- Multimodal embedding alignment — project verbal, video, text into shared vector space
- "Hermit patterns" — identifying complete social withdrawal across sessions
- Rhyme and meter analysis — prosodic poetry structure detection in speech
- Cross-session identity continuity — person recognition across sessions via behavioral fingerprint

---

*§7.3 — Ideas in the Idea Ledger pass through a validation gate before becoming upgrades.*
*§3.1 — No phase starts until the phase below it has passing tests.*
*§5.4 — Version bumps 0.1 per phase.*
