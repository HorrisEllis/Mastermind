# Spatial v2 — Full Code Audit
**Date:** 2026-05-19  
**Scope:** All 13 packages, 44,121 lines  
**Method:** Full read, import graph, content hash comparison, cross-reference

---

## 1. Duplicate Files (exact content matches)

Three pairs of identical files. All three are copy artifacts, not intentional mirrors.

| File A | File B | What to do |
|---|---|---|
| `kernel/src/modules/htl/htl.js` | `kernel/src/modules/htl.js` | Delete the top-level `htl.js`. The canonical location is `htl/htl.js`. The flat copy is from before the directory was created. |
| `kernel/src/modules/video/codec.js` | `kernel/src/modules/__tests__/codec.js` | The test copied codec.js because topology-phase1.test.js needed it at a relative path. Now that the test path is fixed, delete `__tests__/codec.js`. The test uses `new Function()` to eval the source — update the path to `../video/codec.js`. |
| `lattice/src/lattice-exports.js` | `lattice/src/index.js` | Delete `lattice-exports.js`. It's an old name for `index.js`, exactly identical. Nothing imports it. |

---

## 2. Duplicated Math (same logic, independent implementations)

These are §5.5-safe (zero deps), but the duplication means bugs get fixed in one place and not the others.

### FNV-1a 32-bit hash — 5 separate implementations

| Location | Use |
|---|---|
| `kernel/src/kernel.js:66` | Content dedup in event ring |
| `kernel/src/modules/trajectory/attractor-landscape.js:113` | Behavioral fingerprint from attractor map |
| `resonance/src/fingerprint.js:16` | Same fingerprint — different package |
| `nexus/src/identity/index.js:98` | Event ID generation (64-bit, two 32-bit lanes) |
| `nexus/src/forge/index.js:134` | Stable UUID from seed |
| `kernel/src/modules/mesh/alk-mesh.js:141` | ICE candidate fingerprint for WebRTC |

**`attractor-landscape.js` and `resonance/fingerprint.js` are computing the same fingerprint using the same algorithm.** The resonance package's `deriveId()` is meant to consume an attractor landscape object and produce a stable person ID. These two should share one implementation. The canonical location is `resonance/src/fingerprint.js` — `attractor-landscape.js` should import from it. Currently they're independent, so any change to the quantization or hash format will desync them.

The nexus/identity 64-bit version is intentionally different (two lanes for collision resistance in the event store). Don't consolidate that one.

### OLS slope — 5 separate implementations

| Location | Notes |
|---|---|
| `kernel/src/modules/signal/drift-engine.js:178` | Used for ENERGY_CHANGE detection |
| `kernel/src/modules/video/codec.js:1137` | Inline, labeled "Phase 2 pending" |
| `kernel/src/modules/video/codec-topology.js:1087` | Same inline copy |
| `kernel/src/modules/video/codec-v2.js:122` | SlopeEngine — the proper implementation |
| `sigma/src/sigma.js:56` | Used for regime feature axes |

`codec-v2.js` has the full `SlopeEngine` with direction, magnitude, r², narrative string. The codec.js and codec-topology.js inline versions are explicitly marked "SlopeEngine comes in Phase 2" — meaning they know the proper version exists and haven't been updated. `drift-engine.js` and `sigma.js` have standalone 8-line versions that are correct but isolated.

**Action:** `SlopeEngine` from `codec-v2.js` should be extracted to `@spatial/kernel/signal` and re-imported by all five. It already does what all of them need.

### RollingStats — 3 separate implementations

| Location | Notes |
|---|---|
| `kernel/src/modules/video/codec.js:193` | The original, most complete |
| `kernel/src/modules/text/pat-from-pcm.js:91` | Explicitly comments "mirrors codec.js RollingStats exactly" |
| `kernel/src/modules/text/text-module.js:146` | Named `_RollingStats`, prefixed underscore to flag it as local copy |

`pat-from-pcm.js` knows it's a copy. `text-module.js` knows too (the underscore prefix). Both exist because `§5.5 — zero runtime dependencies` and there was no shared math module to import from. 

**Action:** Create `kernel/src/modules/math.js` with `RollingStats`, `slope()`, `mean()`, `stddev()`, `variance()` — these are used in at minimum 8 modules. This is the one place where consolidation directly serves the axioms rather than violating them.

### Trigram Jaccard — 2 separate implementations

| Location | Notes |
|---|---|
| `lattice/src/lattice.js:82` | For `/find` similarity scoring |
| `ingest/src/social.js:82` (via `file.js`) | For format detection (not actually used there) |

Wait — `ingest/src/social.js` doesn't actually use Jaccard. The implementation in `ingest/src/file.js` uses trigram Jaccard in the lattice. These are genuinely the same function in two different packages with no shared dependency. The lattice version is correct and complete. Not a blocking issue but worth noting.

---

## 3. Modules With No Export Path

These modules exist in `kernel/src/modules/` but are not exported from `kernel/src/index.js` or any named export path in `kernel/package.json`. They're invisible to consumers.

### Currently orphaned (real, complete modules):

| Module | What it is | Where it should go |
|---|---|---|
| `signal/signal-topology.js` | Cross-stream composite behavioral state integrator. 10 named states (STRESS_ACUTE, SOCIAL_MASK, GENUINE_ENGAGEMENT, etc.). Subscribes to video/expression/verbal streams. **Complete and deployable.** | Export from `@spatial/kernel/signal` |
| `signal/latent-model.js` | Bayesian (Kalman variant) fusion of all sensor streams into the 5D latent vector. The central estimation engine. **This is the thing that makes the numbers.** | Export from `@spatial/kernel/signal` |
| `signal/suppression-score.js` | The gap between presented and felt state. Three evidence streams: surface-subsurface gap, micro-expression rate, cross-channel incongruence. **Complete.** | Export from `@spatial/kernel/signal` |
| `trajectory/trajectory-recorder.js` | Records 5D path through state space, compresses to attractor map via online k-means. **Complete.** | Export from `@spatial/kernel/trajectory` |
| `trajectory/attractor-landscape.js` | Cross-session persistent model. Merges session attractors. IndexedDB persistence. Warm-start. **Complete.** | Export from `@spatial/kernel/trajectory` |
| `trajectory/field-portrait.js` | Maps attractor landscape → CFR field parameters. Person-specific physics. | Export from `@spatial/kernel/trajectory` |
| `expression/expression-engine.js` | Full FACS/AU spectrum. Micro/partial/macro/composite. Duchenne detection. **Complete.** | Export from `@spatial/kernel/expression` (path exists in package.json but has no index.js) |
| `behavior/behavior-module.js` | Cross-modal analysis: somatic/verbal/ocular interpretation. **Tested (§8.6).** | Export from `@spatial/kernel/behavior` (path exists, needs index.js) |
| `gap-hunter.js` | Detects the shape of what's NOT being said. Weak assumptions, shadow fields, contrastive gaps, negative space. **Complete.** | Export from `@spatial/kernel` |
| `relational.js` | Co-created meaning tracker, decay detector, rupture/repair engine, trajectory. **Complete.** | Export from `@spatial/kernel` |
| `framework-model.js` | Bayesian belief structure tracker. Which frameworks active, challenged, rigidly defended. **Complete.** | Export from `@spatial/kernel` |
| `speech-state-module.js` | Speech mode (external processing / self-talk / performative / collapsed), fragmentation topology, dysregulation signature. **Complete.** | Export from `@spatial/kernel` |
| `cfr-kernel/` | Physics, render, rewind. The CFR particle engine. Three files, zero dependencies. **Tested indirectly.** | Already at `@spatial/kernel/src/modules/cfr-kernel/` — needs named export path |
| `cfr/alk-gl.js` | WebGL2 ping-pong texture particle renderer. MediaPipe blendshape deformer. Browser only. | Browser-only — export with note |
| `cfr/cfr-mesh-bridge.js` | 34-point face/pose/hand skeleton → CFR attractors. Behavioral cue → field entropy. | Browser-only — export with note |
| `mesh/alk-mesh.js` | Zero-server WebRTC via BLE/mDNS/QR magnet links. **Novel architecture.** | Export separately — `@spatial/mesh` candidate |
| `video/video-module.js` | MediaPipe face/pose/hands pipeline. Browser only. | Browser-only export |
| `video/codec-v2.js` | SlopeEngine, StabilityEngine, OscillationEngine, PitchEngine, ConfidencePropagator, NexusRuntime. **Phase 2 complete.** | Export from `@spatial/kernel/video` |

### `alk-wire.js` — special case

`alk-wire.js` is browser-only UI wiring code. It manipulates `document.getElementById` directly and references `window._analyser`. It is explicitly a drop-in adapter for `index.html` — not a package module. It belongs in the browser layer, not in `@spatial/kernel`. It shouldn't be exported from the package. It should be documented as a UI integration guide, which its own comments already do.

---

## 4. Packages With Incomplete Export Surfaces

### `@spatial/nexus` — 20 submodules, exports 3 things

The nexus kernel exposes 20 internal modules (kernel, causality, delta, compress, clip, context, query, persist, forge, observer, projection, enforcement, loader, sigma, identity, time, lazy, adapter, version-gate, adapter-sandbox) but `index.js` only exports sigma, the codec bridge, and `NexusBusAdapter`.

The unexported modules that consumers will need:

| Module | Needed for |
|---|---|
| `kernel/index.js` | `createKernel()` — the actual nexus ring buffer |
| `query/index.js` | CQL query surface over the event ring |
| `persist/index.js` | WAL event store |
| `delta/index.js` | Kinematic delta stream |
| `clip/index.js` | Causal subgraph extraction and replay |
| `causality/index.js` | Edge types and causal graph store |
| `projection/index.js` | Read-only projections over event arrays |
| `enforcement/index.js` | RuntimeGuard and BoundaryIndex |
| `observer/index.js` | Scoped typed subscription bus |

All of these are complete and tested (the nexus test suite is 1,707 lines per the README). They're just not surfaced.

### `@spatial/kernel` — 18 modules, exports 5 things

The kernel package.json lists named export paths (`./signal`, `./trajectory`, `./behavior`, `./video`, `./expression`) but most have no `index.js`. Only `./signal` has content (just `drift-engine.js`). The others need barrel files wiring the modules above.

### `@spatial/pat` — missing `query.js`

`PAT_QUERY_RESULT` event is defined in the bus. `STRUCTURE.md` lists `query.js` as a package file. It doesn't exist. Something needs to be able to query the PAT store by time range, subject ID, or signal type. The bus event exists, the schema has the data, the query surface is absent.

### `@spatial/ase` — missing `encounter.js` and `trajectory.js`

`STRUCTURE.md` lists both. The logic currently lives inside `index.js` (encounter tracking) and `signature.js` (trajectory computation). They're correct but collocated. Not a bug — just not organized per the spec.

---

## 5. Cross-Package Alignment Issues

### `resonance/distance.js` MODE_COMPAT vs `bridge/xlat-bridge.js` GRAMMAR modes

Both define `THINK_FIRST`, `FEEL_FIRST`, `SOMATIC_FIRST` as a taxonomy of processing modes. They're the same taxonomy from different angles. The bridge derives the mode from the receiver's current state and bandwidth. The distance function uses it to score fingerprint compatibility.

Currently they're independent. If a new mode is added (say `BODY_FIRST` distinct from `SOMATIC_FIRST`), it needs to be added in both places. The canonical definition should live in `@spatial/bus` as an extension of `EV`, or in `@spatial/idl` (which already has `AdaptiveAxes`).

### `attractor-landscape.js` fingerprint vs `resonance/fingerprint.js`

`attractor-landscape.js` computes a behavioral fingerprint from session data at the end of a session. `resonance/fingerprint.js` builds the same fingerprint from a landscape object. They use the same FNV-1a, same quantization, same fields. But they're separate implementations.

The intended flow is: trajectory-recorder → attractor-landscape → landscape object → resonance/fingerprint.js → `deriveId()`. The `attractor-landscape.js:fingerprintFromMap()` function should be removed and replaced with a call to `resonance/fingerprint.deriveId()`. This is currently broken by the package boundary — `attractor-landscape.js` can't import `@spatial/resonance` without a circular dependency risk (resonance imports kernel events via bus). Use bus event instead: landscape emits `spatial.kernel.landscape.updated`, resonance engine already listens to this and builds the fingerprint.

### `ingest/src/notion.js` imports `chunk()` from `./file.js`

This is correct and intentional — Notion text gets chunked the same way file text does. But the `chunk()` function is now a dependency of two ingestors. If it moves, both need updating. Fine as-is but worth noting if `file.js` ever gets split.

---

## 6. Bus Event Coverage Gaps

Events defined in `bus/src/index.js` with no emitter anywhere in the codebase:

| Event | Defined | Emitted anywhere |
|---|---|---|
| `KERNEL_TRAJECTORY_COMPLETE` | ✓ | Only in trajectory-recorder.js (not exported) |
| `KERNEL_LANDSCAPE_WARMSTART` | ✓ | Only in attractor-landscape.js (not exported) |
| `KERNEL_EXPRESSION_UPDATE` | ✓ | Only in expression-engine.js (not exported) |
| `KERNEL_BEHAVIOR_DETECTED` | ✓ | Only in behavior-module.js (not exported) |
| `LATTICE_NODE_ADDED` | ✓ | Not emitted anywhere — lattice.js doesn't emit it |
| `LATTICE_EDGE_CONNECTED` | ✓ | Not emitted anywhere |
| `LATTICE_CLUSTER_UPDATED` | ✓ | Not emitted anywhere |
| `PAT_QUERY_RESULT` | ✓ | No query.js exists to emit it |

The lattice events are a real gap. The `LatticeEngine` should emit `spatial.lattice.node.added` when `addNode()` is called and `spatial.lattice.edge.connected` when `addEdge()` is called. These are supposed to be the bus surface. Currently the lattice operates entirely in-process with no bus visibility.

---

## 7. What Should Be a Separate Package

### `@spatial/mesh` — `alk-mesh.js`

Zero-server WebRTC via BLE/mDNS/QR magnet links is a genuinely standalone invention. Nothing about it is specific to the kernel. The magnet link format, BLE signaling, mDNS discovery, and WebRTC wiring are reusable for any peer-to-peer audio application. It's currently buried inside `kernel/src/modules/mesh/`. It should be `packages/mesh/` with its own package.json.

### `@spatial/math` — shared math primitives

`RollingStats`, `slope()`, `mean()`, `stddev()`, `variance()`, `fnv1a32()` appear in 8+ modules. A single `@spatial/math` package with zero deps would eliminate all the copies and give every package a shared foundation. This is the one consolidation that pays compound interest — every future module gets the primitives for free.

---

## 8. What Is Genuinely Missing (referenced but not built)

| Gap | Where referenced | Priority |
|---|---|---|
| `pat/src/query.js` | `PAT_QUERY_RESULT` bus event, STRUCTURE.md | High — PAT store is useless without query |
| `kernel` named export barrel files | `kernel/package.json` export paths | High — modules are invisible without them |
| Nexus full export surface | index.js only exports 3 of 20 modules | High — kernel, query, persist are needed |
| Lattice bus emissions | Bus events defined but never emitted | Medium — breaks the bus-only contract |
| Math primitive consolidation | 8+ duplicate implementations | Medium — bug surface |
| `attractor-landscape` → `resonance/fingerprint` deduplication | Two implementations of same fingerprint | Medium — desync risk |

---

## 9. What Is Complete and Correct As-Is

**Not broken, not missing, works as intended:**

- `@spatial/bus` — clean, complete, well-specced
- `@spatial/nexus` internal modules — all tested, correct
- `@spatial/sigma` — correct, tested, properly exported
- `@spatial/field` — synchrony, mirroring, attunement, tension all correct
- `@spatial/resonance` fingerprint + distance + engine — correct
- `@spatial/forge` grammar + compiler + emit + templates — correct
- `@spatial/bridge` XLAT pipeline — five layers, species extension, complete
- `@spatial/pat` schema + store — correct (missing query)
- `@spatial/ase` engine + signature — correct (missing separate encounter/trajectory files per spec)
- `@spatial/ingest` file + notion + social — new, tested, 50/50 passing
- `@spatial/idl` TypeScript IDL — compiled, loads correctly
- `DriftEngine` — 53/53 tests pass
- `TopologyEngine` stack (InvariantBaseline, PolarityEngine, SlopeEngine, StabilityEngine) — 121/121 tests pass
- CFR physics/render/rewind — correct, used by visualization layer
- Species profiles (human, equine, canine) — correct

---

## Summary Table

| Finding | Count | Action |
|---|---|---|
| Exact duplicate files | 3 | Delete copies |
| Duplicated math implementations | 4 algorithms × 2–5 copies | Extract `@spatial/math` |
| Complete modules with no export path | 18 | Add barrel files to kernel named exports |
| Nexus unexported submodules | 9 | Expand nexus index.js |
| Missing files (referenced, not built) | 4 | Build query.js, barrel files |
| Bus events with no emitter | 8 | Wire lattice events, expose trajectory/expression modules |
| Packages that should be separated | 2 | `@spatial/mesh`, `@spatial/math` |
| Cross-package fingerprint desync risk | 1 | Route through bus, remove duplicate |
