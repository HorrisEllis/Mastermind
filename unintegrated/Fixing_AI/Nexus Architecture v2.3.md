# NEXUS Bridge Architecture — v2.3
**Date: 2026-04-16 | First principles restructure + Guardian integration**

---

## The Core Principle

> One static point. Dynamic endpoint. Everything else is a module that hooks in.

Strip it to this: **two nodes that can find each other from anywhere and talk securely.**
That's the irreducible core. Everything else is built on top of that.

---

## The 16 Modules (Renamed + Restructured)

| Old Name | New Name | Why |
|---|---|---|
| nexus-bridge-v5.js | **bridge-node** | It IS the node. The server file is the node. |
| bridge-network | **bridge-mesh** | It's a mesh, not just a network |
| bridge-chat | **bridge-cli** | It's a command interface, not a chat |
| bridge-network (zip) | **bridge-mesh** | The uploaded zip is now bridge-mesh |
| *(new)* | **bridge-data** | Data pipeline with SNR gate security layer |
| *(new)* | **bridge-identity** | Cryptographic node identity. The atom everything else rests on. |
| bridge-snr | **bridge-sngate** | Renamed to reflect its full role: programmable trust primitive, not just a filter |
| *(new)* | **bridge-IME** | Identity Memory Engine. Turns stateless gate decisions into stateful behavioral intelligence. |

---

## Module-by-Module: First Principles

---

### bridge-node (WAS: nexus-bridge-v5.js)

**What it is at its core:**
A process that runs on a machine, listens for connections, and routes everything.

**Rename rationale:** The server file IS the node. Calling it `nexus-bridge-v5.js` is an implementation name. `bridge-node.js` is what it actually is.

**What it does when you run it:**
1. Loads identity via bridge-identity (keypair + UUID derived from public key)
2. Registers itself on the ledger (JAA/delta log)
3. Starts listening on its port range
4. Immediately begins broadcasting a signed pulse on the local network
5. Connects to bridge-mesh automatically using signed handshake + WebRTC DTLS
6. Becomes discoverable and verifiable by other nodes

**How you run it (three modes, fallback chain):**
```
1. Windows NT service (nexus-bridge-service.js) — production, starts on boot
2. Electron application (bridge-hub) — desktop GUI, manages the service
3. CLI / daemon — node bridge-node.js, or as Linux systemd service
```
Each mode falls back to the next if unavailable. The node runs regardless of which shell it's in.

**The UUID scheme:**
```
[8 random]-[4 random]-[4 random]-[4 random]-[NNNNN]
                                              ↑
                                    last 5 = network identifier
                                    static to your network
                                    all your nodes share this suffix
```
Two nodes with matching last-5 = same network. They trust each other more than strangers.
A node from a different network (different last-5) is an external peer — can connect via bridge-mesh but with different trust level.

**Files:**
```
bridge-node/
├── bridge-node.js        ← RENAMED from nexus-bridge-v5.js (829L active)
├── bootloader.js         ← 8-phase deterministic boot (266L)
├── bus.js                ← SISO event bus (270L)
├── intent-parser.js      ← (282L)
├── intent-scoring.js     ← (235L)
├── intent-router.js      ← (298L)
├── agent-factory.js      ← (133L)
├── agent-registry.js     ← (163L)
├── agents/
│   ├── base-agent.js     ← (157L)
│   ├── ai-agent.js       ← (145L)
│   ├── automation-agent.js← (96L)
│   └── system-agent.js   ← (91L)
├── workflow-engine.js    ← (449L)
├── ai-adapters.js        ← 28 providers (1638L)
├── nexus-playwright-controller.js ← (404L, patched)
├── snr-filter.js         ← (1096L)
├── dns-server.js         ← (507L)
├── firewall.js           ← (298L)
├── ddns.js               ← (215L)
├── siso/
│   ├── Event.js, Gate.js, Stream.js, StreamLog.js
├── data/
│   └── bridge-config.json
├── package.json
├── README.md
├── CHANGELOG.md
├── MANIFEST.json
└── tests/
    ├── test-invariants.js  ← 10 tests
    ├── test-failures.js    ← 8 scenarios
    ├── test-traces.js
    └── benchmark.js
```

**Dead code moved to archive/ (NOT deleted yet):**
- nexus-bridge-server.js (v3, 1639L)
- ErosOS-bridge.js (pre-v5, 1359L)
- nexus-bridge-client.js (793L)
- adapters.js (622L), delta.js (638L), router.js (316L)
- WebRTC stack: nexus-webrtc-peer.js, nexus-p2p-router.js, nexus-peerserver.js
- account-manager.js, nexus-bridge-security.js, nexus-extension-module.js
- routing-engine.js, reverse-proxy.js, nexus-preload.js
- cmd.exe (binary — delete outright)

---

### bridge-mesh (WAS: bridge-network + the uploaded zip)

**What it is at its core:**
The connection layer between any two nodes, regardless of where they are.

**The uploaded zip is now this module.** It contains the P2P mesh, canvas, WebRTC DTLS, STUN/TURN, host rotation, DDNS — this becomes `bridge-mesh`.

**How two nodes connect:**
```
Node A (your laptop, home network)
  ↓ identity loaded via bridge-identity (Ed25519 keypair, UUID = SHA256(pubKey))
  ↓ broadcasts signed pulse on LAN: { uuid, publicKey, ts, sig }
  ↓ registers with DDNS: [uuid].nexus.mesh

Node B (your homelab, different network)
  ↓ same identity scheme, different UUID
  ↓ can't find Node A on LAN (different subnet)
  ↓ queries STUN → gets Node A's public IP + port
  ↓ performs signed handshake (verify sig, verify uuid = SHA256(pubKey), ts freshness)
  ↓ ECDH session key derived from both keypairs
  ↓ WebRTC DTLS channel opened, all traffic AES-256-GCM
  ↓ connection established, both nodes store each other as verified peers
```

**Discovery cascade (automatic, in order):**
1. **Local pulse** — broadcast signed UDP pulse on LAN, listen for responses
2. **DDNS lookup** — query for peer UUID records in nexus.mesh zone
3. **STUN probe** — get public endpoints for NAT traversal
4. **TURN relay** — if direct P2P fails, relay through known TURN server
5. **Manual registration** — via BrainOS hub mesh canvas (fallback for everything)

**Node identity in the mesh:**
```
UUID = SHA256(publicKey).slice(0,32) — formatted as standard UUID
     = immutable, derived, unforgeable without the private key

DDNS hostname: [uuid].nexus.mesh
               ↑
            full UUID — globally unique, cryptographically tied to keypair
```

**Network grouping (optional metadata, not cryptographic):**
```json
{ "groupHint": "home-lab" }
```
Carried in handshake payload. Used for canvas clustering and SNR trust hints.
Not a security claim — two nodes claiming the same group still verify by signature.

**Files:**
```
bridge-mesh/
├── index.js              ← mesh entry point, exports MeshNode
├── mesh/
│   ├── pulse-emitter.js  ← NEW: emits UDP pulse on LAN + heartbeat beat
│   ├── peer-discovery.js ← discovers peers via pulse + DDNS
│   ├── stun-client.js    ← STUN probe for public endpoint
│   ├── turn-relay.js     ← TURN fallback relay
│   └── webrtc-channel.js ← DTLS encrypted P2P channel
├── network/
│   ├── ddns.js           ← DDNS registration + zone management
│   ├── host-rotation.js  ← alternating hosts, bounce on block
│   └── port-registry.js  ← dynamic port range mapping
├── canvas/
│   ├── nexus-canvas.js   ← mesh visualization (2069L)
│   ├── bridge-live-canvas.html ← live canvas UI (1427L)
│   └── ErosOS.html       ← network control panel (1819L)
├── package.json
├── README.md             ← from uploaded zip
├── CHANGELOG.md
├── MANIFEST.json
└── ROADMAP.md
```

**What bridge-mesh gives you:**
- Any two nodes connect from anywhere
- No fixed IP required
- Connection survives port blocks (port remapping)
- Connection survives IP changes (DDNS + host rotation)
- All traffic AES-256-GCM + WebRTC DTLS
- Canvas shows the live mesh topology

---

### bridge-heartbeat

**What it is at its core:**
The pulse. Every node proves it's alive by beating. Silence = dead.

**How it works:**
```
Node starts
  ↓ registers with bridge-heartbeat
  ↓ starts beating every N ms (configurable, default 5000)

Each beat:
  ↓ POST to node's /health endpoint
  ↓ measure round-trip latency
  ↓ calculate BPM (moving average of inter-beat intervals)
  ↓ calculate health score: BPM_consistency × SNR_fidelity × latency_grade
  ↓ emit heartbeat:pulse on bus → mesh canvas updates arc color
  ↓ write to delta log

Miss threshold (3 missed beats):
  ↓ emit node:degraded on bus
  ↓ bridge-mesh attempts reconnect
  ↓ hub card goes amber

Miss ceiling (10 missed beats):
  ↓ emit node:dead on bus
  ↓ bridge-mesh marks node offline
  ↓ hub card goes red, stops routing to this node
```

**The heartbeat is also how nodes discover each other on the local network:**
```
Node A starts → broadcasts pulse on UDP :7777
Node B hears it → registers Node A → starts expecting heartbeats
Node A stops responding → Node B marks it dead after miss ceiling
```

**The hub can route commands through the heartbeat channel:**
- Heartbeat payload can carry a small metadata packet
- This is how the hub sends config updates to nodes without a full HTTP connection
- Emergency channel: even if the bridge-node HTTP server is down, heartbeat UDP channel stays up

**Files:**
```
bridge-heartbeat/
├── heartbeat.js     ← NEW ~200L: BPM monitor, health scoring, pulse detection
├── pulse.js         ← NEW ~80L: UDP pulse broadcast + listener
├── index.js         ← exports HeartbeatManager
├── package.json
├── README.md
├── CHANGELOG.md
└── MANIFEST.json
```

---

### bridge-cli (WAS: bridge-chat + Nexus-Chat)

**What it is at its core:**
A command interface to the node. Type a command, the node executes it.

**Rename rationale:** It's a CLI, not a chat. The word "chat" implies conversation. This is command automation. `bridge-cli` is honest.

**What it connects:**
```
bridge-cli (Nexus-Chat.html + wiring)
  ↓ accepts natural language OR structured commands
  ↓ routes through bridge-node intent router
  ↓ executes via agent factory
  ↓ returns result

Also:
  ↓ collaboration mode: multiple nodes share a command session
  ↓ command history with UUID ledger entries
  ↓ callto integration: commands can trigger registered calltos
```

**Files:**
```
bridge-cli/
├── Nexus-Chat.html     ← command UI (1321L) — RENAMED from Nexus-Chat
├── cli-router.js       ← NEW ~60L: wires chat UI to bridge intent router
├── index.js            ← entry
├── package.json
├── README.md
├── CHANGELOG.md
└── MANIFEST.json
```

---

### bridge-data (NEW)

**What it is at its core:**
Anything can be pushed through the mesh, identified, gated, and logged.

**The idea:**
Every module, every node, every service can push data through bridge-data.
The data is identified by the sender's UUID (with matching last-5 network suffix).
The SNR gate (bridge-snr) is the security layer — it decides what passes.
Everything is logged to the delta ledger.

**The UUID on the data:**
```
Data packet UUID: [random prefix]-[network-last5]
                                   ↑
                         identifies which network this came from
                         bridge-snr gates based on this
                         unknown network suffix = higher scrutiny
```

**Callto hook for data collection:**
```
POST /data/push
{
  "uuid": "a7f3-...-a1b2c",    ← sender UUID with network suffix
  "moduleUuid": "...",           ← which module is sending
  "payload": <anything>,
  "tag": "sensor|event|metric|log|..."
}
↓
bridge-snr gates it (fidelity check)
↓
logged to delta ledger with UUID
↓
emitted on bus: data:received { uuid, moduleUuid, tag, fidelity }
↓
callto hooks fire if registered for this moduleUuid
```

**The callto hook for data collection:**
- Any module registers a callto with bridge-data: "when you receive data from module X, call me"
- This is how bridge-plugin feeds captured browser data back into the system
- This is how ErosmancerOS feeds DOM telemetry back
- This is how heartbeat feeds pulse data back
- Universal intake — any data, any source, gated and logged

**Why this is important:**
This solves the "how does the plugin send data back" problem. The plugin captures a cookie, a DOM element, a page state — it pushes it through bridge-data. Bridge-SNR gates it. Delta log records it. The callto hook fires. The requesting module gets its data. Clean. Traceable. Gated.

**Files:**
```
bridge-data/
├── bridge-data.js    ← NEW ~150L: push handler, gate integration, ledger logging
├── callto-hooks.js   ← NEW ~80L: callto registration for data collection
├── index.js          ← exports DataBus
├── package.json
├── README.md
├── CHANGELOG.md
└── MANIFEST.json
```

**Depends on:** bridge-snr (gate), bridge-node bus (events), delta ledger

---

### bridge-IME (Identity Memory Engine — NEW)

**What it is at its core:**
The layer between who a node is and what it's allowed to do. It remembers.

Without IME, bridge-sngate evaluates events. With IME, bridge-sngate evaluates **entities** — everything they've done, across every protocol, over time.

**The architectural position:**
```
bridge-identity → WHO (cryptographic truth, immutable)
bridge-IME      → MEMORY (what they've done, behavioral profile, trust score)
bridge-sngate   → DECISION (evaluate with full context, not just current event)
```

IME sits between identity and the gate. It does not make decisions. It feeds context to the decision.

**What it ingests (everything flows through here):**
```js
IME.ingest({
  uuid:      "a7f3c2d1-...",   // verified by bridge-identity
  type:      "ssh.command" | "file.transfer" | "mesh.handshake" |
             "agent.tool_call" | "data.push" | "http.request",
  payload:   { ... },           // summarized, not full raw
  timestamp: Date.now()
})
```

**What it builds per UUID:**
```js
{
  uuid:        "...",
  trustScore:  0–10,            // dynamic, recalculated on every ingest
  firstSeen:   timestamp,
  lastSeen:    timestamp,
  eventCounts: {
    "ssh.command":    120,
    "agent.tool_call": 40,
    "file.transfer":   12
  },
  baseline: {
    avgFrequency:   number,     // events per hour, rolling 7-day
    commonPaths:    string[],   // top file paths accessed
    commonCommands: string[],   // top commands run
    typicalHours:   number[]    // hours of day with activity (0–23)
  },
  anomalies: [
    {
      id:        uuid,
      ts:        timestamp,
      type:      "burst" | "off-hours" | "new-path" | "escalation" | "drift",
      severity:  "low" | "medium" | "high",
      detail:    string,
      resolved:  boolean
    }
  ]
}
```

**Trust score calculation (no ML — pure signal):**
```
base = 5 (neutral starting point for verified identity)

+2  first seen > 30 days ago
+1  activity consistent with baseline (low entropy deviation)
+1  no anomalies in last 7 days
-2  burst detected (10× normal rate in <5 min)
-2  off-hours activity (outside typicalHours)
-3  escalating behavior across surfaces (e.g. read → write → exec sequence)
-5  identity drift detected (UUID valid, behavior profile diverges significantly)
-5  anomaly flagged as high severity

final = clamp(base + modifiers, 0, 10)
```

**The killer feature — cross-protocol escalation detection:**
```
UUID 'a7f3...' at 02:14:
  SSH: runs find / -name "*.key"         ← anomaly: off-hours + new path
  SFTP: uploads 847MB archive            ← anomaly: burst transfer
  Agent: requests external API callout   ← anomaly: escalation pattern

IME sees the sequence across all three surfaces.
trustScore drops from 8 → 2.
bridge-sngate receives profile with trustScore: 2 on next evaluation.
Gate denies. Audit trail shows the full cross-protocol sequence.
```

No existing system does this. UUID is the thread. IME holds the memory.

**Identity drift detection:**
```
UUID = valid (cryptographic check passes)
behavior profile deviates > 3σ from baseline

→ IME flags: "behavioral identity mismatch"
→ trustScore penalty applied
→ bridge-sngate observe mode triggered (log everything, don't block yet)
→ alert emitted on bus: ime:drift { uuid, deviation, severity }
```
This catches stolen keys. The attacker has the private key. They can't fake the behavioral history.

**What IME does NOT do:**
- Does not make allow/deny decisions — that's bridge-sngate's job
- Does not store full payloads — summaries and patterns only
- Does not use ML — statistical baselines and deviation scoring only
- Does not merge with bridge-sngate — they stay separate, always

**Public API:**
```js
const { IME } = require('bridge-IME');

IME.ingest(event)                    // feed an event
IME.getProfile(uuid)                 // → full profile or null
IME.getTrustScore(uuid)              // → number 0–10
IME.getAnomalies(uuid, { since })    // → anomaly[]
IME.getRelationships(uuid)           // → { peers, clusters }
IME.resetBaseline(uuid)              // explicit admin reset
```

**Relationship graph (v1 minimal):**
```js
// IME tracks which UUIDs interact with which
IME.getRelationships('a7f3...') → {
  peers: ['b2c1...', 'c3d2...'],    // UUIDs this node talks to
  clusters: ['home-lab']             // groupHints seen
}
```
Not a graph database. Just a map. Enough to see "this node is suddenly talking to nodes it never talked to before."

**Files:**
```
bridge-IME/
├── index.js              ← public API: { IME }
├── ingestion.js          ← event ingestion, type routing, summarization
├── profiler.js           ← baseline calculation, trust score, pattern building
├── anomaly.js            ← deviation detection, escalation sequences, drift
├── relationships.js      ← peer tracking, cluster membership
├── store.js              ← persistence: profiles written atomically to data/ime/
├── package.json
├── README.md
├── CHANGELOG.md
└── MANIFEST.json
```

**Wired into bridge-sngate:**
```js
// In bridge-sngate gate-engine.js, before rule evaluation:
const profile = await IME.getProfile(identity.uuid);

gate.evaluate({
  type,
  identity,
  behavior: profile,    // ← IME feeds this
  payload,
  context
})

// fidelity.js uses profile.trustScore as an input modifier
// High IME trust score → fidelity boost
// Low IME trust score → fidelity penalty
// Anomaly flagged → observe mode auto-triggered
```

**V1 scope — wire these two surfaces first, nothing else:**
1. SSH / CLI (interaction plane) — ingest every command, file path, session timing
2. Agent tool calls (agent plane) — ingest every tool request from bridge-ai

Everything else can be added later. Make it real before making it big.

**Invariants:**
1. IME ingests but never decides. Decision belongs to bridge-sngate.
2. IME never stores full payloads. Summaries and patterns only.
3. Profile writes are atomic. Crash mid-write cannot corrupt.
4. trustScore is recalculated on every ingest, never cached stale.
5. Anomaly detection does not block. It modifies trust score and emits events.
6. IME and bridge-sngate are always separate modules. Never merged.

---

### bridge-sngate (WAS: bridge-snr)

**What it is at its core:**
Programmable trust as a primitive. Not a filter. Not a WAF. One engine, three surfaces, one evaluation interface.

**The rename rationale:** `bridge-snr` implied it was just a signal/noise filter. `bridge-sngate` is what it actually is — a gate. Everything passes through it. It decides.

**The core abstraction:**
```js
gate.evaluate({
  type:     "request" | "intent" | "node" | "data",
  identity: { uuid, publicKey, sig, verified },
  payload:  <anything>,
  context:  { source, sessionId, history? }
})
→ { score: 0–10, decision: "allow"|"deny"|"observe", reason, trace, gateId }
```

**One engine, three adapters — not three separate gates:**
```
           [ SNR GATE ENGINE ]   ← snr-filter.js wrapped, not replaced
                    │
     ┌──────────────┼──────────────┐
     │              │              │
 Dev Adapter   Agent Adapter   Mesh Adapter
 (requests)    (AI intent)     (nodes/data)
```

**Dev surface** — HTTP middleware. Gates all requests to bridge-node. Shadow/observe mode lets you watch without blocking, tune rules, then enforce. Fidelity scoring + identity-aware = differentiated from rate limiters and WAFs.

**Agent surface** — Runtime permission system for AI. Sits between intent-router and agent-factory. Every tool call gated before execution. Every denial traced to a UUID. Auditable AI behavior. This is missing infrastructure in AI right now.

**Mesh surface** — Trust protocol for nodes and data packets. Not networking. Trust. Nodes decide if they should connect based on cryptographic identity + history + behavior. Data packets verified before touching the callto registry or bus.

**The three-state decision:**
- `allow` → proceed
- `deny` → block with reason and gateId
- `observe` → proceed but log (shadow mode — deploy first, tune second, enforce third)

**Identity failure is absolute:** Failed signature verification → fidelity 0, short-circuits before rule evaluation. No rule can override upward from identity failure. This invariant is enforced in code, not just convention.

**Migration from snr-filter.js:**
```
snr-filter.js (1096L, v0.1.0)
  → moved to: bridge-sngate/engine/gate-engine.js
  → wrapped by: bridge-sngate/index.js
  → all existing imports update: require('bridge-sngate')
  → zero behavioral change — same methods, same fidelity scale, same rule types
```

**Files:**
```
bridge-sngate/
├── index.js                  ← public API: { SNGate, gate }
├── engine/
│   ├── gate-engine.js        ← core evaluation loop (FROM: snr-filter.js)
│   ├── rule-store.js         ← rule CRUD, persistence, profiles
│   ├── fidelity.js           ← all scoring logic: identity + behavioral modifiers
│   └── trace-log.js          ← encrypted JSONL audit log, queryable
├── adapters/
│   ├── dev-adapter.js        ← HTTP request → evaluate()
│   ├── agent-adapter.js      ← AI intent → evaluate()
│   └── mesh-adapter.js       ← node handshake / data packet → evaluate()
├── middleware/
│   ├── express.js            ← app.use(SNGate.middleware())
│   ├── bridge-node.js        ← bridge-node request handler integration
│   └── bridge-data.js        ← bridge-data push integration
├── ui/
│   └── snr-gate-3d.html      ← 3D visualization (FROM: SNR/snr-gate-3d.html)
│                                Extended: three rings (Dev/Agent/Mesh),
│                                live decision particles, identity arcs
├── package.json
├── README.md
├── CHANGELOG.md
├── MANIFEST.json
└── tests/
    ├── test-engine.js
    ├── test-dev-adapter.js
    ├── test-agent-adapter.js
    └── test-mesh-adapter.js
```

**What doesn't change from snr-filter.js:**
- Fidelity scale 0–10, gate at ≥5
- Rule types: domain, URL, regex, hash, IP, content, intent, uuid
- Import formats: uBlock, DNS Firewall, antivirus, blacklist, whitelist
- Presets: adblocker, privacy, security
- AES-256-GCM log encryption
- Profile persistence
- Express middleware
- Bridge HTTP API (renamed /sngate/* from /snr/*)
- Hook system

---

### Guardian (WAS: bridge-plugin)

**What it is:**
Firefox extension. VPN-style — always on, every page. The browser face of the bridge ecosystem. Replaces the old Tampermonkey userscript approach entirely.

**Rename rationale:** Guardian is a purpose-built Firefox extension with a full UI, not a Tampermonkey script. `bridge-plugin` was a placeholder name for a proof-of-concept. Guardian is the real thing.

**What it does:**
- Element picker with green selection zone — hover to highlight, click to capture, generates callto UUID immediately
- Callto popup: label + action selection (click/type/focus/hover/extract/screenshot) → ADD TO INDEX
- Callto index persisted in `browser.storage.local`, synced to bridge-node at `POST /userscript/callto`
- URCK v4.1 causal kernel — every Guardian action is an event before any UI update. Ring buffer of 10,000 events. Causal edge graph. Macro pattern detection.
- Site modules (domain-scoped): instagram.com DMs + posts, threads.net posts, claude.ai chat, chatgpt.com chat — all emit URCK events to bridge-node `/bus/emit`
- Cookie capture via COOKIES button → `POST /data/cookies`
- Cross-device pipeline: DEVICES tab shows bridge mesh nodes, PIPE routes next callto to remote node
- Nexus service indicator: polls `localhost:3748/health` alongside bridge poll
- BroadcastChannel `guardian-bridge` heartbeat every 3s → nexus.html NexusBridgeSync

**How it fits with bridge-data:**
```
Browser element captured (picker)
  ↓ Guardian content.js → CALLTO_ADDED → background.js
  ↓ background.js POST /userscript/callto (bridge-node registers it)
  ↓ URCK.ingest('guardian.picker.capture', callto) — causal event logged
  ↓ POST /bus/emit → bridge-data event stream
  ↓ callto hook fires for the requesting workflow

Cookie capture:
  ↓ Guardian → POST /data/cookies (via bridge-data)
  ↓ includes moduleUuid = Guardian's session UUID
  ↓ bridge-sngate gates it
  ↓ callto hook fires for the requesting workflow

Site module events (IG, Threads, ChatGPT, Claude):
  ↓ DOM MutationObserver fires
  ↓ URCK.ingest(event) → POST /bus/emit
  ↓ bridge-data receives tagged event stream
```

**URCK kernel — what it provides to bridge-node:**
```
bridge-node /bus/emit receives:
  guardian.picker.capture  — element captured, callto registered
  guardian.cookies.capture — cookies captured
  guardian.ig.dm           — Instagram DM seen
  guardian.ig.post         — Instagram post seen
  guardian.threads.post    — Threads post seen
  guardian.chat.message    — User message in AI chat
  guardian.chat.response   — AI response in chat
  guardian.session.connect — Tab registered with bridge
  guardian.bridge.callto   — Callto pushed to bridge
  guardian.bridge.result   — Callto result received
```

**Guardian in nexus.html:**
The Bridge sub-tab now has four Guardian accordions replacing the old Playwright/CDP/ErosmancerOS sections:
- ⬡ GUARDIAN EXTENSION — live BC status, session count, Nexus indicator, URCK seq
- ⊕ ELEMENT PICKER · CALLTO INDEX — live capture feed, full index, execute callto form
- ⬡ URCK KERNEL v4.1 — events/edges/macros/seq metrics, live event feed from /bus/events
- ⬡ GUARDIAN DIAGNOSTICS — 6 tests: Bridge, Nexus, URCK, Callto pipeline, Guardian BC, Bus emit

**Installation:**
Firefox `about:debugging` → Load Temporary Add-on → select `manifest.json`.
Not via `about:addons` — temporary add-on only (Firefox unsigned extension policy).
Survives without bridge running — picks up calltos locally, syncs when bridge reconnects.

**Files:**
```
guardian/
├── manifest.json           ← MV2, Firefox, no debugger permission
├── background.js           ← session registry, CALLTO_ADDED relay, heartbeat BC
├── content.js              ← picker overlay, callto popup, site module init
├── urck.js                 ← URCK v4.1 kernel bundled (no ES modules)
├── popup.html + popup.js   ← 4 tabs: HOME, CAPTURE, DEVICES, SETTINGS
├── bridge-sync.js          ← bridge HTTP helpers
├── modules/
│   ├── base-module.js      ← domain-scoped observer base class
│   ├── instagram.js        ← DMs + posts observer
│   ├── threads.js          ← posts + replies observer
│   ├── chatgpt.js          ← chat message observer
│   └── claude.js           ← chat response observer
└── icons/                  ← guardian-16/32/48/128.png
```

**BC channel change:** `nexus-bridge-v2` → `guardian-bridge`
`nexus-bridge-sync.js` updated to listen on `guardian-bridge` and handle Guardian heartbeat payload structure (`{ type: 'HEARTBEAT', sessions, nexusAlive, urckSeq, ... }`).

---

### bridge-core (extraction target)

**What it is:**
The common primitives every module imports. SISO, bus, foundation.
After extraction, nothing copies these anymore.

```
bridge-core/
├── bus.js
├── foundation.js     ← lfs-foundation.js renamed
├── siso/
│   └── Event.js, Gate.js, Stream.js, StreamLog.js
├── registry/
│   ├── node-registry.js
│   └── callto-registry.js
└── index.js
```

---

### bridge-ai (extraction target)

**What it is:**
All AI features extracted from bridge-node.
Intent pipeline + agents + adapters + usage tracking.

---

### bridge-eros (bugs-first)

**What it is:**
ErosmancerOS TypeScript CDP engine.
**Do not wire until EROS-001 and EROS-002 are fixed.**

---

### bridge-ui

**What it is:**
BrainOS.html + bridge-control.html + all visual shells.
The mesh canvas lives here (imports from bridge-mesh).

---

### bridge-hub (last)

**What it is:**
The Electron shell. Card-based project manager. Auto-discovers node.js schema files.
Built last because it wraps everything.

---

## The Revised Module Map

```
bridge-hub (Electron tray — built last)
    │
    └── bridge-node (bridge-node.js — the server, Windows NT service)
            │
            ├── bridge-identity (keypair, KeyStore abstraction — built FIRST)
            ├── bridge-IME      (identity memory — WHO did WHAT, WHEN, across all protocols)
            ├── bridge-core     (SISO bus, foundation, registries)
            ├── bridge-ai       (intent pipeline, agents, adapters)
            ├── bridge-mesh     (P2P mesh, STUN/TURN, DDNS, canvas)
            │       └── bridge-heartbeat (pulse, BPM, discovery)
            ├── Guardian        (Firefox extension, element picker, URCK v4.1, callto index)
            ├── bridge-eros     (CDP engine — after bug fixes)
            ├── bridge-cli      (command interface, renamed from chat)
            ├── bridge-sngate   (programmable trust — evaluates with IME context)
            ├── bridge-data     (data pipeline, callto hooks)
            └── bridge-ui       (BrainOS canvas, control panel)
```

---

## bridge-identity — The Atom

**Everything rests on this. Built first.**

Two things, kept completely separate:

1. **Identity** — Ed25519 keypair. Immutable. Never regenerated unless explicit `--reset-identity`.
2. **Storage** — TPM / DPAPI / File. Replaceable envelopes. Identity doesn't care which one.

### The critical separation

```
publicKey → identity (immutable)
storage   → persistence layer (replaceable)
```

If you tie UUID to the storage backend:
- TPM change → identity changes → network fragmentation
- Storage migration → identity mutation → broken trust graph

The UUID is derived from the public key only. Storage is disposable. Identity is not.

### UUID derivation

```js
uuid = SHA256(publicKey.export({ type: 'spki', format: 'der' }))
         .digest('hex')
         .slice(0, 32)
// formatted as: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### KeyStore abstraction

```js
IF TPM available:
    use TPMKeyStore       // hardware-signed, key never leaves chip
ELSE IF DPAPI available:
    use DPAPIKeyStore     // Windows machine-bound encryption
ELSE:
    use FileKeyStore      // AES-256-GCM, machine fingerprint derived key
                          // dev/fallback only
```

Same interface regardless of backend. The rest of the system never knows which one is running.

### On first run

```
1. Generate Ed25519 keypair
2. Derive UUID from public key
3. KeyStore.save(uuid, privateKey)  ← goes to best available backend
4. Write data/identity.json         ← public only, not secret, can be backed up
   { uuid, publicKey, groupHint, createdAt }
```

### On every subsequent run

```
1. Load data/identity.json
2. KeyStore.load(uuid) → privateKey
3. Validate: SHA256(publicKey) === uuid  → if mismatch: HARD STOP, loud error
```

### Signing (used by bridge-mesh handshake)

```js
// TPM: hardware sign — private key never in memory
// DPAPI/File: software sign
const sig = await Identity.sign(payload);  // same call either way
```

### The signed handshake (bridge-mesh uses this)

```
Node A → Node B:
{ uuid, publicKey, ts: Date.now(), sig: sign(ts) }

Node B verifies:
1. sig valid against publicKey?         → proves A owns the private key
2. SHA256(publicKey) === uuid?          → proves UUID is legit
3. |ts - now| < 30000ms?               → replay protection

If all pass → verified peer
Session key = ECDH(A.private, B.public) → forward secrecy
```

### SNR trust from identity verification

```
Verified sig + known UUID in ledger     → fidelity 8
Verified sig + unknown UUID             → fidelity 6 (new node, watched)
Same groupHint metadata                 → +1 bonus
Failed sig verification                 → fidelity 0, hard block, log
UUID ≠ SHA256(publicKey)               → fidelity 0, hard block, log
Replay (stale ts)                       → fidelity 0, block this message
```

### TPM migration warning

TPM-bound keys cannot be exported — that's the security guarantee. If the machine dies, the private key is gone. The identity must be reset. Mitigation: back up `data/identity.json` (the public file only — it contains no secrets). On machine loss you'll know your old UUID and can manually remove it from peer ledgers.

### Explicit reset (only way identity changes)

```bash
node bridge-node.js --reset-identity
# Prompts for confirmation
# Generates new keypair → new UUID
# Old UUID becomes orphan in peer ledgers
# Other nodes see new UUID as fidelity 6 (new node) until re-verified
```

### Files

```
bridge-identity/
├── index.js              ← public API: { Identity, KeyStore }
├── identity.js           ← Ed25519 generation, UUID derivation, signing
├── keystore/
│   ├── index.js          ← abstraction: selects backend
│   ├── tpm-store.js      ← TPM 2.0 via node-tpm / tpm2-tools
│   ├── dpapi-store.js    ← Windows DPAPI machine-bound
│   └── file-store.js     ← AES-256-GCM fallback
├── package.json
├── README.md
├── CHANGELOG.md
└── MANIFEST.json
```

### Invariants

1. UUID derived from publicKey only. Never set directly.
2. Private key never in memory longer than needed for signing.
3. KeyStore backend selected automatically. Application code never specifies it.
4. `data/identity.json` contains NO secrets. Safe to back up, commit, inspect.
5. Key file contains ONLY secrets. Never logged, never transmitted.
6. UUID mismatch on load → hard stop, loud error. No silent corruption.

---

## Node Identity Scheme — Full Spec

```
UUID = SHA256(publicKey)[0:32], formatted as standard UUID
     = immutable
     = cryptographically bound to keypair
     = cannot be spoofed without the private key

DDNS hostname: [full-uuid].nexus.mesh
               e.g. a7f3c2d1-8b4e-4f2a-9c1d-e5f6a7b8c9d0.nexus.mesh

Network grouping (optional metadata, soft trust hint):
  groupHint: "home-lab"
  Carried in handshake. Used for canvas clustering + SNR trust bonus.
  NOT a cryptographic claim. Sig verification is still required.

bridge-data packet identity:
  Each push includes sender's { uuid, sig }
  bridge-snr verifies sig before gating
  Logged to delta ledger with verified UUID
```

---

## Build Order (First Principles, Bottom-Up)

```
Gate 0: Fix EROS-001 + EROS-002 (unblock ErosmancerOS — parallel track)

Gate 1: bridge-identity  ← THE ATOM. Nothing else builds without this.
  - Ed25519 keypair generation
  - UUID derivation from public key
  - KeyStore abstraction (TPM → DPAPI → File)
  - Signed handshake protocol
  - Tests: UUID derivation, sig verify, storage round-trip, mismatch detection

Gate 2: bridge-IME  ← Memory layer. bridge-sngate is blind without this.
  - Event ingestion pipeline (type routing, summarization)
  - Profile builder (baseline, trust score, event counts)
  - Anomaly detection (burst, off-hours, escalation, drift)
  - Relationship tracker (peer map)
  - Atomic persistence to data/ime/
  - V1 scope: wire SSH/CLI + agent tool calls only
  - Tests: ingest/profile/score/anomaly cycle, drift detection, atomic write

Gate 3: bridge-core
  - Extract SISO, bus, foundation into standalone module
  - Tests: bus delivery, SISO stream, registry CRUD

Gate 4: bridge-heartbeat
  - UDP pulse emitter + listener (pulses carry signed identity)
  - BPM calculation, health scoring
  - Emits on bridge-core bus
  - Tests: pulse send/receive, BPM accuracy, miss detection

Gate 5: bridge-mesh
  - Organize zip into structure
  - Wire signed handshake from bridge-identity
  - Wire pulse-emitter to bridge-heartbeat
  - STUN + TURN + WebRTC DTLS channel
  - DDNS with full UUID hostnames
  - Tests: two-node verified connection, handshake rejection on bad sig

Gate 6: bridge-sngate (rename + extend from snr-filter.js)
  - Wrap snr-filter.js as gate-engine.js — zero behavioral change
  - Add three-state decision (allow/deny/observe)
  - Wire bridge-IME profile into fidelity.js inputs
  - Add trace-log.js encrypted audit trail
  - Add dev-adapter, agent-adapter, mesh-adapter
  - Wire agent-adapter into bridge-ai agent-factory.js
  - Wire mesh-adapter into bridge-data push handler
  - Tests: all existing snr-filter tests + adapter tests + IME integration + trace tests

Gate 7: bridge-data
  - Push endpoint (accepts signed payloads)
  - bridge-sngate gate integration
  - Callto hook registry
  - Delta log write with verified UUID
  - IME.ingest() on every accepted push
  - Tests: push/verify/gate/log/callto cycle

Gate 8: bridge-node (rename + reorganize)
  - Rename nexus-bridge-v5.js → bridge-node.js
  - Wire: load identity from bridge-identity on start
  - Wire: auto-connect to bridge-mesh on start
  - Wire: register with bridge-heartbeat on start
  - Move dead code to archive/
  - Tests: existing invariant suite + mesh connection + identity load

Gate 9: bridge-ai (extract from bridge-node)
  - Intent pipeline, agents, adapters separate module
  - Usage tracking added
  - Agent tool calls feed IME.ingest()
  - Tests: intent pipeline, agent dispatch, IME ingest on tool call

Gate 10: Guardian (RENAMED from bridge-plugin)
  - Firefox extension replacing Tampermonkey approach
  - Element picker with green selection zone → callto popup → ADD TO INDEX
  - URCK v4.1 causal kernel bundled (browser-safe, no ES imports)
  - Site modules: instagram, threads, chatgpt, claude (domain-scoped observers)
  - Wire cookie capture to bridge-data via POST /data/cookies
  - Wire URCK events to bridge-node via POST /bus/emit
  - BroadcastChannel 'guardian-bridge' heartbeat → nexus.html NexusBridgeSync
  - Tests: picker capture → callto registration, URCK ingest, BC heartbeat, site module activation

Gate 11: bridge-eros (after bugs fixed at Gate 0)
  - Wire to bridge-node /eros/* endpoints
  - Tests: existing + mock bridge tests

Gate 12: bridge-cli (rename + wire)
  - Rename Nexus-Chat → bridge-cli
  - Wire to bridge-node intent router
  - Tests: command round-trip

Gate 13: bridge-ui (consolidate)
  - BrainOS.html + bridge-control + mesh canvas
  - All imports from bridge-core, bridge-mesh, bridge-node
  - IME anomaly feed wired to canvas alerts

Gate 14: bridge-hub (last)
  - Electron shell
  - Card-based project manager
  - Auto-discovers node.js schemas
  - Wraps everything
```

---

## What's Novel Here (Sigma Assessment)

The cryptographic node identity scheme is the foundation. UUID derived directly from public key means the UUID *is* a cryptographic claim — unforgeable without the private key. Combined with the KeyStore abstraction (TPM → DPAPI → File), you get hardware-anchored identity with graceful fallback and the same interface throughout. 4σ+ approach.

The bridge-IME layer is where this becomes a different category of system entirely. Identity tells you who. IME tells you what they've done, across every protocol, over time. The cross-protocol escalation detection — SSH command + SFTP transfer + agent tool call, all from the same UUID, all within minutes, forming a recognizable threat pattern — is something no existing open-source system does with this clarity. Identity drift detection (UUID valid, behavior wrong) catches stolen keys. The statistical baseline approach means no ML dependency — pure deviation scoring from a rolling window. Lean, auditable, impossible to accuse of being a black box.

The bridge-sngate agent surface wired with IME context is the commercial wedge. Not just "gate this request" but "gate this request from this entity, given everything we know about them." Every AI tool call evaluated against the agent's full behavioral history. Every anomaly traceable. That's auditable AI governance — missing infrastructure in the current AI ecosystem — and it's now a thin wiring job on top of a working gate engine.

The bridge-data callto hook pattern unifies all data intake into one pipeline with one security model and one audit trail. Sender identity verified. IME profile consulted. Gate decides. Everything logged.

---

## What You Told Me (Reflected Back Exactly)

1. ✅ bridge-node.js = rename of nexus-bridge-v5.js — it IS the node
2. ✅ Auto-connects to mesh on run
3. ✅ Manual registration via hub mesh canvas (hostname + UUID on ledger)
4. ✅ Three run modes: service / electron / CLI, with fallbacks
5. ✅ Heartbeat auto-links, discovers, registers new nodes
6. ✅ Nodes listen for local network pulses
7. ✅ bridge-network → bridge-mesh (uploaded zip is now bridge-mesh)
8. ✅ STUN + TURN + DDNS + WebRTC DTLS for external connections
9. ✅ Cryptographic node identity — Ed25519 keypair
10. ✅ UUID derived from public key — immutable, unforgeable
11. ✅ Signed handshake between nodes
12. ✅ Network grouping as optional metadata, not baked into identity
13. ✅ Local connections via LAN pulse (separate from mesh, implicit trust tier)
14. ✅ KeyStore abstraction: TPM → DPAPI → File (identity separate from storage)
15. ✅ Storage is disposable. Identity is not.
16. ✅ WebRTC encrypted pipeline to bridge-mesh
17. ✅ bridge-chat → bridge-cli
18. ✅ bridge-data: data pushed as pulse, identified by module UUID + signature
19. ✅ bridge-snr → bridge-sngate: one engine, three surfaces, one evaluation interface
20. ✅ Sender identity verified before gate runs — identity failure short-circuits all rules
21. ✅ bridge-data has callto hook for data collection
22. ✅ bridge-sngate agent surface = runtime permission system for AI (missing infrastructure)
23. ✅ Three-state decision: allow / deny / observe (shadow mode for safe deployment)
24. ✅ bridge-IME: identity memory engine — WHO did WHAT across every protocol over time
25. ✅ IME sits between identity and gate — feeds context, never makes decisions
26. ✅ Cross-protocol escalation detection: same UUID, multiple surfaces, threat pattern
27. ✅ Identity drift detection: UUID valid, behavior wrong = stolen key caught
28. ✅ No ML — statistical baselines, deviation scoring, auditable
29. ✅ IME and bridge-sngate are permanently separate modules — never merged
30. ✅ bridge-plugin renamed Guardian — purpose-built Firefox extension, not Tampermonkey
31. ✅ Guardian integrates URCK v4.1 causal kernel — every action is a causal event
32. ✅ BroadcastChannel updated: nexus-bridge-v2 → guardian-bridge
33. ✅ nexus.html Bridge sub-tab: Playwright/CDP/ErosmancerOS accordions replaced with Guardian pipeline UI
34. ✅ Nexus service (bridge-node as Windows NT service) monitored via Guardian Nexus pill at :3748


---

## External Critique — Pressure Points and Responses

*Source: ChatGPT architectural review, 2026-04-16*
*Every valid point is addressed. Nothing is dismissed.*

---

### Pressure Point 1: Identity models key continuity, not person continuity

**The critique:** OS reinstall, TPM wipe, VM cloning, accidental identity.json duplication — these don't break crypto but they break social continuity. The system will see "same human, new identity" and reset trust silently.

**Valid. Accepted.**

This is a real gap. The system currently models continuity of keys, not continuity of persons.

**Resolution added to bridge-identity spec:**

```
Identity Continuity Protocol:
- data/identity.json is the public record — back it up, it's not secret
- On key loss/reset: --migrate-identity <old-uuid> <new-uuid>
  → records a signed migration assertion in the delta ledger
  → other nodes see the migration, can choose to inherit trust
  → trust inheritance is opt-in per peer, never automatic
- On VM clone detection (same UUID, different machine fingerprint):
  → IME flags: identity:collision
  → both instances go to fidelity 4 (observe) until resolved manually
  → bridge-hub shows alert: "Duplicate identity detected"
```

The --migrate-identity path is the explicit tool for "same human, new keys." It doesn't solve the problem automatically — it gives the human a way to assert continuity that peers can verify and choose to honor. Automatic trust inheritance on key change would be a security hole. This is the correct trade-off.

---

### Pressure Point 2: IME trust scoring is overconfident

**The critique:** Behavioral baselines drift for benign reasons. Attackers can slowly poison the baseline. The scoring math creates an illusion of interpretability that isn't warranted. IME is a probabilistic narrative generator, not a truth machine.

**Valid. Critical. Accepted.**

The spec language was too confident. The scoring deltas (+2, -5) were presented as objective when they're heuristic estimates.

**Corrections added to bridge-IME invariants:**

```
IME Epistemic Invariants (added):
7.  IME scores are advisory signals, not verdicts. bridge-sngate decides.
8.  All score modifiers are configurable. No hardcoded thresholds in production.
9.  IME exposes its reasoning: every score change includes a reason string.
    No black box scoring. Every delta is auditable.
10. Baseline poisoning resistance:
    - Baselines use median, not mean (resistant to outlier injection)
    - Anomaly detection has a minimum sample floor (100 events before
      baseline is considered reliable)
    - Sudden baseline shifts > 2σ in < 24h are flagged as
      ime:baseline_shift events, not silently incorporated
11. False positive management:
    - observe mode is the default for first anomaly detection
    - deny requires explicit rule configuration, not just score threshold
    - Score alone never triggers deny. Score + matching rule triggers deny.
```

The key fix: **score alone never triggers deny.** Scores inform rules. Rules make decisions. This breaks the feedback loop where a noisy baseline causes false blocks.

---

### Pressure Point 3: bridge-sngate as centralized trust brain

**The critique:** Everything flows through it. If it misbehaves, everything misbehaves. You have a centralized intelligence in a decentralized design. Trust recursion loops are possible: gate depends on IME, IME feeds gate, gate could modify IME inputs indirectly.

**Valid. The recursion risk is real.**

**Hard constraints added as architectural invariants:**

```
Anti-Recursion Invariants (added to bridge-sngate):
11. bridge-sngate is a stateless evaluator. It reads context. It never writes
    to IME. Ever. No exceptions.
12. IME is read-only from bridge-sngate's perspective. IME.getProfile() is
    the only IME method bridge-sngate may call.
13. The evaluation path is strictly linear:
    bridge-identity → bridge-IME.getProfile() → bridge-sngate.evaluate()
    → decision
    No cycles. No callbacks into IME from inside evaluate().
14. bridge-sngate emits decisions on the bus. IME listens to the bus and
    may ingest gate decisions as events. But this path goes:
    sngate → bus → IME.ingest()
    Never: sngate → IME directly.
    The bus is the firebreak that prevents tight coupling.
```

The bus firebreak is the key structural fix. IME can learn from gate decisions by listening to the bus — but bridge-sngate never calls IME.ingest() directly. The direction of data flow is enforced by module boundary.

On the latency concern: bridge-sngate must be fast. IME.getProfile() must return from cache, not calculate on the hot path. Profile is pre-computed on ingest, not computed at gate evaluation time. This is an implementation constraint that needs to be in the IME spec.

**Added to bridge-IME spec:**
```
Performance invariant:
IME.getProfile(uuid) must return in < 5ms. Always from cache.
Profile is updated asynchronously after ingest, never on the read path.
```

---

### Pressure Point 4: LAN pulse ≠ trust elevation

**The critique:** LAN discovery and global mesh have fundamentally different trust models. Language in the spec implies partial trust uplift from LAN proximity. A LAN attack becomes a trust elevation shortcut.

**Valid. Language fixed.**

**Explicit rule added to bridge-mesh spec:**

```
LAN Trust Invariant (non-negotiable):
LAN pulse discovery = routing convenience only.
LAN pulse discovery ≠ trust increase.
A node discovered via LAN pulse still requires full signed handshake
before receiving any trust above fidelity 5 (gate threshold).
Proximity is not a credential.
```

The only thing LAN discovery grants is knowing a node exists. It earns nothing else.

---

### Pressure Point 5: Semantic dependency graph, not module graph

**The critique:** Every layer depends on every other for meaning. This creates versioning as an existential problem. Partial upgrades break system cognition. Testing becomes simulation-heavy.

**Valid. This is the deepest structural issue.**

This is addressed by the bridge-contracts proposal (below). But the honest acknowledgment belongs here: this system is a living system, not traditional software. It will require integration testing, not just unit testing. The test suites need to grow from "does module X work" to "does the system behave correctly under these conditions."

---

### Proposed Addition: bridge-contracts

**From the critique:**
> A frozen, versioned rule layer that defines interaction contracts between modules, versioned separately from runtime code, immutable during runtime execution, used for compatibility validation.

**Accepted. Adding as a cross-cutting concern, not a module.**

Bridge-contracts is not a 17th module. It is a specification layer that lives alongside the modules.

```
contracts/
├── identity-to-IME.contract.json      ← what identity guarantees IME can depend on
├── IME-to-sngate.contract.json        ← what IME guarantees sngate can depend on
├── sngate-to-adapters.contract.json   ← what sngate guarantees each adapter can depend on
├── mesh-to-heartbeat.contract.json    ← mesh ↔ heartbeat interaction contract
├── data-to-sngate.contract.json       ← what data guarantees before calling gate
└── VERSION                            ← contract schema version, incremented on any change
```

**Contract schema:**
```json
{
  "contract": "IME-to-sngate",
  "version": "1.0.0",
  "provider": "bridge-IME",
  "consumer": "bridge-sngate",
  "guarantees": [
    "IME.getProfile(uuid) returns in < 5ms",
    "IME.getProfile(uuid) never throws — returns null if unknown",
    "trustScore is always 0–10",
    "anomalies array is always present, may be empty"
  ],
  "prohibitions": [
    "consumer may not call IME.ingest() directly",
    "consumer may not write to IME state"
  ],
  "breakingChanges": "any field removal or type change increments major version"
}
```

**Why this matters:** When bridge-IME v2 ships, the contract is checked before the module loads. If the new IME doesn't honor the contract bridge-sngate depends on, the system refuses to start and tells you exactly why. This is the versioning safety net.

**Contract enforcement** is a startup check, not a runtime check. At boot:
```js
ContractValidator.validate('IME-to-sngate', 
  require('bridge-IME'), 
  require('bridge-sngate'))
// → pass or throw with contract violation detail
```

---

### The Core Existential Tension

**From the critique:**
> You are trying to achieve all 3 simultaneously:
> 1. Decentralization (mesh nodes)
> 2. Centralized intelligence (IME + sngate reasoning consistency)
> 3. Real-time trust enforcement (gate everywhere)

**This tension is real and is not fully resolved. It is acknowledged as a design constraint, not a flaw.**

The resolution is not to eliminate the tension but to manage it:

- Decentralization is preserved at the mesh layer. Nodes are autonomous.
- Intelligence (IME) is local per node, not shared. Each node builds its own behavioral model of the nodes it interacts with. There is no central IME.
- Trust enforcement is local. Each node's bridge-sngate runs independently.

The appearance of centralization comes from the architecture diagram showing everything under one bridge-node. In deployment, each machine runs its own full stack. The intelligence is distributed by geography of deployment, not by design of the module graph.

This does mean: two nodes may have different trust scores for the same third node. That's not a bug. It's an accurate reflection of different interaction histories from different vantage points.

---

### What the Critique Got Right (No Argument)

1. ✅ Identity models key continuity, not person continuity — gap acknowledged, migration protocol added
2. ✅ IME scoring is heuristic, not truth — epistemic invariants added, score-alone-never-denies rule added
3. ✅ bridge-sngate recursion risk is real — anti-recursion invariants added, bus firebreak enforced
4. ✅ LAN proximity ≠ trust — explicit invariant added to bridge-mesh
5. ✅ Semantic dependency graph is the deepest structural problem — bridge-contracts added as the versioning safety net
6. ✅ Three-state gate is genuinely important — confirmed
7. ✅ bridge-data as universal event ingestion layer is real platform thinking — confirmed
8. ✅ Identity / IME / sngate separation discipline is correct and rare — confirmed, hard constraints added to keep it

### What the Critique Got Wrong

The critique frames IME as "just" a probabilistic narrative generator, implying it has no real security value. That understates it. The value of IME is not precision — it's that it makes certain attack patterns structurally visible that are currently invisible to point-in-time gate evaluations. A stolen key used for the first time at 3am running commands never seen before is not caught by any stateless gate. IME catches it by flagging the deviation. The flag goes to observe mode, not auto-deny. A human reviews it. That's the correct security posture — not pretending statistical signals are verdicts, but surfacing them for human judgment. The critique assumes the alternative is "don't score behavior at all," which would be worse.

---

*First principles check: can two nodes find each other, talk securely, and be trusted over time?*
*Yes. bridge-identity + bridge-mesh + bridge-heartbeat + bridge-IME + bridge-sngate.*
*Everything else is features on top of that.*

---

## External Critique #2 — Bridge-Plugin Overhaul Weak Points

*Source: ChatGPT architectural review of bridge-plugin overhaul spec, 2026-04-16*
*Every valid point is addressed. Nothing is dismissed.*

---

### Weak Point 1: WS session ≠ capability guarantee

**The critique:** A WebSocket session existing doesn't mean the tab is in a valid state for execution. The tab may have navigated, the frame changed, the selector gone stale, or the userscript alive but pointing at the wrong context.

**Valid. Accepted.**

**Resolution — session capability model added to bridge-plugin spec:**

```js
session.capabilities = {
  domHash:           string,    // hash of current DOM state
  url:               string,    // current tab URL
  visibilityState:   string,    // "visible" | "hidden" | "prerender"
  lastInteractionTs: number,    // last confirmed DOM interaction
  supportedCalltos:  string[]   // what this tab can execute right now
}
```

Callto execution must validate capability match before routing:
- URL matches expected origin for this callto
- domHash not stale beyond threshold
- visibilityState is "visible" (configurable — some calltos can run hidden)
- requestedCallto is in supportedCalltos list

Heartbeat (every 15s) updates capabilities. Gateway rejects callto if capabilities stale > 30s. This prevents the "WS alive, context wrong" ghost execution problem.

---

### Weak Point 2: No routing lock — multiple sessions per origin = ambiguous routing

**The critique:** Multiple WS sessions can exist for the same origin. Without a primary executor lock, the system picks randomly under load. Wrong tab gets the callto.

**Valid. Accepted.**

**Resolution — active session lock per origin:**

```js
// Per origin, only ONE session is "primary executor"
// Others are: observer | shadow | backup

session.role = "primary" | "observer" | "shadow" | "backup"

// Lock assignment rules:
// First session to register for an origin → primary
// Subsequent sessions → observer by default
// Primary session disconnects → oldest observer promoted to primary
// Manual override: POST /userscript/session/:id/promote

// Callto routing:
// Always routes to primary for that origin
// If primary stale → promote next, then route
// Never ambiguous
```

The gateway maintains an `originPrimary` Map. One UUID per origin. Deterministic.

---

### Weak Point 3: Service mode vs child mode will desync state

**The critique:** Electron thinks bridge is running, service restarts independently, Electron holds stale session registry. Ghost sessions, broken intent routing, duplicate WS connections.

**Valid. Accepted.**

**Resolution — bridge state atom persisted by the service:**

```js
// Service writes on every state change:
data/runtime/bridge-state.json
{
  bootId:          uuid,       // new UUID on every service start
  startedAt:       timestamp,
  sessions:        { [sessionId]: { origin, role, lastSeen } },
  intentVersion:   number,
  intentHash:      sha256,
  wsRegistryVersion: number
}
```

Electron on connect:
1. Fetches `GET /runtime/state`
2. Compares `bootId` to last known — if different, full reconcile
3. Reconcile: clear local session cache, rebuild from service state
4. Never assumes freshness — always fetches before acting

This breaks the desync loop. Electron is always a client of the service's truth, never an authority.

---

### Weak Point 4: Non-DOM calltos will silently degrade without Playwright

**The critique:** Some actions are not possible via userscript: cross-origin iframes, permission prompts, downloads, file choosers, authentication popups. Fully demoting Playwright without defining these boundaries causes silent degradation.

**Valid. Critical. Accepted.**

**Resolution — NON-DOM callto class defined:**

These calltos MUST route to CDP/Playwright only. Never userscript:

```js
const NON_DOM_CALLTOS = [
  'browser.download',
  'browser.permission.request',
  'browser.window.create',
  'browser.tab.capture',
  'browser.file.choose',
  'browser.auth.popup',
  'browser.iframe.cross-origin',
  'browser.certificate.accept'
]

// In callto router:
if (NON_DOM_CALLTOS.includes(callto.action)) {
  // Skip userscript entirely
  // Route: ErosmancerOS CDP → Playwright
  // Never attempt WS — will always fail
}
```

These are documented in the callto registry with `requiresCDP: true`. The UI shows them as "CDP required" not "WS available". No silent fallback — if CDP unavailable, explicit error returned.

---

### Weak Point 5: WS gateway missing backpressure

**The critique:** A looped script in a tab can flood the bridge with callto results, DOM mutations, and heartbeat spam. No rate limiting, no queue depth control.

**Valid. Accepted.**

**Resolution — per-session rate limiter added to gateway:**

```js
session.rateLimiter = {
  maxEventsPerSecond: 50,        // hard cap on inbound events
  maxQueueDepth:      200,       // max pending calltos
  dropPolicy:         "oldest",  // "oldest" | "latest" | "reject"
  burstAllowance:     100,       // short burst before throttle kicks in
  throttledAt:        null       // timestamp when throttle activated
}

// On every inbound message:
if (session.rateLimiter.currentRate > maxEventsPerSecond) {
  // Apply drop policy
  // Emit: userscript:session:throttled on bus
  // Do NOT crash or disconnect — throttle is graceful
}
```

Callto queue depth enforced separately from event rate. A tab can emit DOM mutations at high rate without blocking callto execution queue.

---

### Weak Point 6: Intent sync needs versioning not just sync

**The critique:** `GET /intent` replacing the UI map with no conflict resolution means UI edits and bridge automation overwrites race each other. System already drifted once (MANIFEST shows "OUT OF SYNC").

**Valid. Accepted.**

**Resolution — intent as versioned graph:**

```js
// Every intent update increments version:
intentVersion++
intentHash = sha256(JSON.stringify(intentMap))
updatedAt = Date.now()
updatedBy = "bridge" | "ui" | "api"

// UI write rejected if:
// local intentVersion < bridge intentVersion
// → UI must fetch latest, show diff, prompt merge or overwrite

// Bridge write via API always wins (authoritative)
// UI write wins only if bridge version hasn't changed since UI last fetched

// GET /intent returns:
{ intentMap, intentVersion, intentHash, updatedAt, updatedBy }

// PUT /intent requires:
{ intentMap, expectedVersion }  // rejected if expectedVersion !== current
```

No more silent drift. Conflict is explicit. User decides.

---

### What the Critique Got Right (No Argument)

1. ✅ WS session ≠ capability guarantee — capability heartbeat model added
2. ✅ No routing lock = wrong tab under load — active session lock per origin added
3. ✅ Service/Electron desync — bridge state atom + reconcile on connect added
4. ✅ Non-DOM calltos need hard routing class — NON_DOM_CALLTOS defined, CDP-only
5. ✅ WS gateway needs backpressure — per-session rate limiter + queue depth added
6. ✅ Intent sync needs versioning — versioned intent graph with conflict detection added
7. ✅ Three parallel migrations at once is dangerous — acknowledged, build order enforces sequential gates

### What the Critique Got Wrong

The critique frames moving from Playwright-first to userscript-first as "removing Playwright." It's not removal — it's demotion with hard class boundaries. Playwright still exists, still runs, still handles NON_DOM_CALLTOS. The architecture is more precise after this critique, not less capable. The "paradigm change" framing is accurate but the risk is manageable with the locking, versioning, and capability validation now added.


---

## External Critique #3 — Emergent System-Level Risks

*Source: ChatGPT architectural review, 2026-04-16*
*These are not structural problems. They are emergent behavior risks at scale.*

---

### Risk 1: Trust Circularity — the slow convergence to rigidity

**The critique:** The system has a closed feedback loop:
```
behavior → IME memory → sngate enforcement → behavior
```
A small bias in IME baseline causes slightly stricter gate decisions, which reduces interaction diversity, which IME interprets as stable behavior, which tightens trust further. The system doesn't crash — it slowly becomes "safe but useless." Over-stabilized, increasingly blind.

**Valid. Real risk. Accepted.**

This is the most subtle of the three. It's not a bug, it's a convergence property of any feedback system with memory.

**Resolution — exploration pressure channel:**

IME needs a controlled uncertainty injection mechanism. Not random noise — deliberate periodic testing of whether history is still valid.

```js
// bridge-IME — exploration pressure (added to profiler.js)

const EXPLORATION_CONFIG = {
  pressureInterval: 86400000,  // daily
  sampleRate:       0.05,      // 5% of decisions get exploration pressure applied
  resetBaseline:    false,     // never wipe — just inject uncertainty
  pressureDecay:    0.95       // exploration pressure fades if no anomalies found
}

// On each IME.getProfile() call:
if (Math.random() < EXPLORATION_CONFIG.sampleRate) {
  // Return profile with trustScore temporarily deflated by 1-2 points
  // Emit: ime:exploration:pressure { uuid, deflation, reason: 'scheduled' }
  // sngate sees lower score → may shift to observe mode
  // If execution succeeds anyway → exploration confirms history still valid
  // If execution fails → anomaly was real, history was masking it
}

// This prevents the over-stabilization spiral.
// The system periodically asks: "would this still work if we trusted less?"
```

This is borrowed from epsilon-greedy exploration in reinforcement learning — not ML, just the principle. Keep exploiting known-good behavior most of the time, but inject occasional uncertainty to prevent the system from going blind.

---

### Risk 2: Identity fork reality — two valid nodes, diverging IME histories

**The critique:** When identity breaks (TPM loss, VM clone, partial restore), you get two cryptographically valid nodes with diverging behavioral histories. This isn't a security problem — it's a reality consistency problem. IME trust becomes meaningless across resets without lineage.

**Valid. Accepted.**

The migration protocol added in Critique #1 response handles the migration path. What's missing is the lineage graph that makes that migration verifiable to peers.

**Resolution — identity merkle lineage:**

Not a blockchain. A signed ancestry chain.

```js
// In bridge-identity, identity.json extended:
{
  uuid:       "current-uuid",
  publicKey:  "...",
  createdAt:  timestamp,
  lineage: [
    {
      ancestorUuid:  "old-uuid",
      migratedAt:    timestamp,
      reason:        "tpm-loss" | "reset" | "clone-resolution" | "scheduled",
      ancestorSig:   "...",   // signed by old private key if available
      selfSig:       "...",   // signed by new private key always
      peerWitnesses: ["peer-uuid-1", "peer-uuid-2"]  // peers that observed migration
    }
  ]
}
```

**Peer confirmation:** When a node resets identity, it broadcasts a signed migration claim to known peers. Peers that accept the claim add their UUID to `peerWitnesses`. Peers that reject it log a dispute. sngate trust for the new identity starts at 6 (unverified) and rises as peer witness count grows.

**IME continuity:** Old UUID's IME profile is archived, not deleted. New UUID starts fresh but can optionally inherit the archived profile with a lineage trust discount (trustScore capped at 7 until N days of fresh behavior observed).

This means identity resets are not catastrophic — they're auditable events with recoverable trust.

---

### Risk 3: Local Gods — nodes that disagree without arbitration

**The critique:** Each node is a self-consistent sovereign: identity authority, behavioral memory, enforcement logic, execution power. No global arbitration. Two nodes can have legitimately different trust scores for the same third node — both correct from their vantage point. The mesh becomes epistemically fragmented over time.

**Valid. Acknowledged as intentional design tension.**

This was noted in Critique #1 response as an intentional property: "Two nodes having different trust scores for the same third node is accurate, not a bug." That's still true. But the critique is right that without any dispute resolution signal, nodes can't even surface disagreement — let alone resolve it.

**Resolution — bridge-consensus-lite (dispute signal, not global truth):**

Not a consensus algorithm. Not blockchain. A lightweight dispute signal protocol.

```js
// When Node A and Node B compare notes on Node C:

// Node A: POST /mesh/trust-signal
{
  aboutUuid:    "node-c-uuid",
  myScore:      8,
  myEvidenceHash: sha256(IME.getProfile("node-c-uuid")),
  sig:          sign(payload)
}

// Node B receives, compares with its own score (3):
// Divergence > threshold (e.g. 4 points) → emit: mesh:trust:divergence
{
  nodeA:        "node-a-uuid",
  nodeB:        "node-b-uuid",
  aboutUuid:    "node-c-uuid",
  scoreA:       8,
  scoreB:       3,
  delta:        5,
  action:       "flag"   // never auto-resolve
}

// Both nodes log the divergence.
// Neither changes their score automatically.
// Both shift to "observe" mode for node-c until divergence resolves.
// Human or explicit admin command required to resolve.
```

**What this gives you:** Nodes can surface disagreement without either node being wrong. The mesh doesn't converge on false consensus. Divergence is a data point, not an error. The IME on each node continues building independent profiles — which is correct — but now both nodes know they see things differently.

**What this explicitly does NOT do:** force agreement, propagate scores, create a global truth layer. The sovereignty of each node is preserved. Dispute signals are advisory, not authoritative.

---

### The Four-Layer Architecture (Clean Description)

```
L1: Identity Layer     bridge-identity    cryptographic existence
L2: Memory Layer       bridge-IME         behavioral time series
L3: Enforcement Layer  bridge-sngate      deterministic decision engine
L4: Execution Layer    Guardian           real browser + node actions (Firefox extension)
                       bridge-mesh        transport reality
                       bridge-data        event bloodstream
                       bridge-heartbeat   liveness + discovery
```

This is a living distributed state machine across machines and browsers. The failure modes at this level are not crashes — they are trust drift, identity fragmentation, silent divergence, and over-stabilized behavior. All four now have mitigations in the spec.

---

### What the Critique Got Right

1. ✅ Trust circularity is a real emergent risk — exploration pressure channel added to bridge-IME
2. ✅ Identity fork reality needs lineage not just migration — merkle lineage added to bridge-identity
3. ✅ Local gods without arbitration = epistemically fragmented mesh — bridge-consensus-lite dispute signal added
4. ✅ The failure modes at this scale are not bugs — they are systemic properties requiring systemic responses

### What the Critique Got Wrong

"bridge-exploration-pressure" was framed as a separate module. It's not — it's a configuration option and behavior in `bridge-IME/profiler.js`. Adding a module for this would violate the separation invariant (IME is the memory layer, exploration pressure is a property of how memory is consulted, not a new system). Similarly "bridge-consensus-lite" is a protocol added to bridge-mesh's peer communication layer, not a new module. The architecture stays at 16 modules.

---

### Running Module Count: Still 16

Note: bridge-plugin is now named Guardian. Same module slot, renamed and rebuilt as a Firefox extension. No new module added — count stays at 16.

No new modules added. Three new capabilities added to existing modules:
- bridge-IME: exploration pressure in profiler.js
- bridge-identity: merkle lineage in identity.json schema + identity.js
- bridge-mesh: trust-signal protocol in peer communication layer

