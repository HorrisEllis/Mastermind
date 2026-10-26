# ErosmancerOS — Roadmap

**Current:** 0.1.0 — Foundation  
**Target:** 1.0.0 — Adaptive perception engine  
**Axiom:** Nothing ships until it survives hostile verification.

---

## Version Scheme

| Change | Delta |
|--------|-------|
| Architectural layer | +0.2 |
| Major feature / subsystem | +0.1 |
| Integration / wiring | +0.05 |
| Bug fix / patch | +0.01 |

---

## Phase Map

### Phase 1 — Security Patch · v0.11
**Blocker. Ship before anything else.**

- [ ] Replace string interpolation in `byTextMatch` and `byRelativePosition` with `Runtime.callFunctionOn` + serialized args. Eliminates JS injection vector.
- [ ] Add concurrency cap to `BridgeCore.send()`. Max N pending commands. Queue excess. Prevents CDP overload cascade.
- [ ] Add `.gitignore` — no secrets in history.

---

### Phase 2 — Mock Bridge + Test Coverage · v0.12
**The riskiest code has zero coverage. Fix this before building more.**

- [ ] `MockBridgeCore` — implements `BridgeCore` interface, returns scripted CDP responses from fixtures
- [ ] Full selector strategy coverage: one test per strategy — success, fallback trigger, null return
- [ ] Dispatcher queue ordering tests: priority sort, retry backoff timing
- [ ] Telemetry flush tests: ring buffer eviction, disk write

---

### Phase 3 — Resolution Profile · v0.22
**Every node learns which strategy works for it. System stops starting from zero.**

- [ ] Add `resolutionProfile` to `Node`:
  ```typescript
  interface ResolutionProfile {
    lastSuccessfulStrategy: SelectorStrategy | null;
    successCounts: Partial<Record<SelectorStrategy, number>>;
    failureCounts: Partial<Record<SelectorStrategy, number>>;
    volatilityScore: number; // 0-1, decay toward 0 on sustained success
  }
  ```
- [ ] `SelectorEngine.resolve()` tries `lastSuccessfulStrategy` first, falls back to chain
- [ ] On success: increment `successCounts`, update `lastSuccessfulStrategy`, decay `volatilityScore`
- [ ] On failure: increment `failureCounts`, escalate `volatilityScore`
- [ ] High volatility nodes skip fragile strategies (`cssSelector`, `xpath`) earlier in chain

---

### Phase 4 — True Relational Positioning · v0.32
**`relativePosition` currently does what `textMatch` already does. Build the real thing.**

- [ ] Capture DOM structural path at node registration: `main > section:nth-child(2) > div > button:nth-child(3)`
  - Generate via `DOM.getNodeForLocation` + `DOM.getDocument` traversal at registration time
  - Store as `node.structuralPath: string`
- [ ] `byRelativePosition` traverses from a live anchor node using structural path delta
- [ ] Anchor selection: prefer nodes with `state === 'active'` and `successCounts.backendNodeId > 0`
- [ ] Fallback: structural path re-query from document root when no anchor available

---

### Phase 5 — Scoring Engine · v0.42
**Replace static chain with ranked resolution.**

- [ ] Per-node strategy scoring: `score(node, strategy) → float`
  - Base: `resolutionProfile.successCounts[s] / (successCounts[s] + failureCounts[s])`
  - Penalize by `volatilityScore`
  - Clamp missing data to domain average
- [ ] `resolve()` sorts strategies by score descending before attempting
- [ ] Domain-level aggregation: running success rates across all nodes per strategy
- [ ] Emit `telemetry.debug` with score vector on each resolution (off by default, config flag)

---

### Phase 6 — Multi-Candidate Resolution · v0.47
**First match wins is wrong when confidence is low.**

- [ ] When `volatilityScore > 0.7`: collect top 3 candidates across strategies, return highest-confidence match
- [ ] `ResolutionResult` extended: `candidates?: Array<{ nodeId, strategy, confidence }>`
- [ ] Caller can inspect candidates for disambiguation

---

### Phase 7 — Node Graph · v0.57
**Nodes are not isolated. They live in a DOM tree.**

- [ ] `NodeGraph` module: parent / children / siblings per node per tab
- [ ] Populate on registration via `DOM.getDocument` traversal (lazy, on-demand)
- [ ] Graph-aware resolution: "find node adjacent to this stable anchor"
- [ ] Graph invalidation on tab navigation events

---

### Phase 8 — Firefox Extension Bridge Mode · v0.67
**ErosmancerOS is external-process only. For in-extension use, the transport changes.**

- [ ] `ExtensionBridgeCore` — implements `BridgeCore` interface, uses `browser.debugger.sendCommand` instead of WebSocket
- [ ] Drop-in replacement: `new ErosmancerOS({ bridge: { target: { type: 'extension' } } })`
- [ ] Extension context detection: auto-select transport
- [ ] NEXUS Bridge integration: ErosmancerOS instances managed by bridge server, sessions routed via `/eros/*` endpoints

---

### Phase 9 — NEXUS Hub Integration · v0.72
**Wire into the ecosystem. ErosmancerOS sessions managed by NEXUS bridge.**

- [ ] Session registration: POST `/eros/session/register` with sessionId, tabId, hookId
- [ ] Command routing: NEXUS bridge routes automation commands to ErosmancerOS instances
- [ ] Telemetry relay: ErosmancerOS telemetry streams to NEXUS event bus
- [ ] UUID compatibility: `Node.uuid` format aligned with NEXUS UUID registry

---

### Phase 10 — Hardening + 1.0 · v1.0
- [ ] All stubs removed
- [ ] 100% strategy coverage in tests
- [ ] Security audit pass (no injection surfaces)
- [ ] Performance: < 50ms average resolution time on warm node
- [ ] Firefox + Chromium parity verified
