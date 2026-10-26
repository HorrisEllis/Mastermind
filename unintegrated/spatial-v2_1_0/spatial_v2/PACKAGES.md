# @spatial — package registry

Every package: ESM only. Node >=18. Zero runtime dependencies.
All I/O via @spatial/bus. No direct module calls. §K6.
All errors surface as events, never throws. §K7.

---

## @spatial/bus
**source:** siso.js (CrystalBall/ALK)
**status:** WRAP — already written, needs package.json + namespace
**size:** ~200 lines

### What it is
SISO event bus. Stream → Event → Gate → StreamLog.
The only thing everything depends on.
No module may communicate except through this.

### API
```js
import { SISOBus, Event, Gate, StreamLog, compilePattern } from '@spatial/bus'

const bus = new SISOBus({ log: new StreamLog('DATA') })

const unsub = bus.on('spatial.latent.*', payload => { ... })
bus.emit('spatial.latent.update', { vector: [...], ts: Date.now() })
bus.tail(100)     // last 100 events for debug
bus.stats         // { emitted, claimed, pending, subscribers }
bus.setLogLevel('EVENTS' | 'DEEP' | 'DATA' | 'OFF')
unsub()
```

### Event naming contract
All Spatial events: `spatial.<package>.<noun>.<verb>`
Examples:
  spatial.kernel.latent.update
  spatial.resonance.fingerprint.scored
  spatial.bridge.transmission.render
  spatial.bridge.buffer.held
  spatial.field.synchrony.update
  spatial.nexus.gate.fired
  spatial.ase.trajectory.updated
  spatial.pat.session.written
  spatial.sigma.regime.changed
  spatial.lattice.edge.connected

Cross-species prefix: `spatial.species.<id>.<...>`
  spatial.species.equine.latent.update
  spatial.species.canine.latent.update

### Package.json shape
```json
{
  "name": "@spatial/bus",
  "version": "1.0.0",
  "type": "module",
  "exports": { ".": "./src/index.js" },
  "engines": { "node": ">=18" }
}
```

---

## @spatial/kernel
**source:** ALK — kernel.js + all modules/
**status:** EXTRACT + WRAP
**size:** ~3000 lines across modules

### What it is
Behavioral signal runtime.
Video/audio/text → 5D latent state vector.
Runs headless. Browser or Node (webcam via getUserMedia or file input).
Bus-only I/O. §K6.

### Core latent vector
```
[valence, arousal, suppression, coherence, engagement]
 float    float    float        float      float
 -1..1    -1..1    0..1         0..1       0..1
```

### Submodules (all internal, bus-only external surface)
- `video`        — frame pipeline, MediaPipe face/pose
- `expression`   — expression engine, AU detection
- `signal`       — latent model, suppression score, signal topology
- `trajectory`   — trajectory recorder, attractor landscape, field portrait
- `behavior`     — behavior module (gesture, regulation, gaze)
- `codec-v2`     — NexusRuntime, SlopeEngine, PitchEngine, StabilityEngine
- `codec`        — InvariantBaseline, AssociationEngine, PredictiveEngine
- `htl`          — HumanTranslatorLayer (feeds @spatial/bridge)

### Bus surface
```
Emits:
  spatial.kernel.latent.update        { vector[5], ts, subject, confidence }
  spatial.kernel.expression.update    { aus, valence, arousal, ts }
  spatial.kernel.suppression.update   { score, delta, ts }
  spatial.kernel.behavior.detected    { type, subtype, zone, confidence, ts }
  spatial.kernel.trajectory.complete  { attractorMap, duration, ts }
  spatial.kernel.landscape.warmstart  { vector[5], personId, ts }
  spatial.kernel.landscape.updated    { landscape, personId, ts }
  spatial.kernel.blueprint.ready      { blueprint, personId, ts }
  spatial.kernel.codec.invariants     { invariants, vocab, patterns, ts }
  spatial.kernel.error                { code, message, module }

Listens:
  spatial.session.start               { personId?, dataDir }
  spatial.session.stop
  spatial.kernel.subject.add          { id, species? }
  spatial.kernel.subject.remove       { id }
```

### Species extension
Kernel supports non-human subjects via `species` param.
Species profiles define axis remapping + signal vocabulary.
Built-in: `human` (default), `equine`, `canine`.
Custom: pass `speciesProfile` object at subject registration.

```js
bus.emit('spatial.kernel.subject.add', {
  id: 'horse-01',
  species: 'equine',
  speciesProfile: EQUINE_PROFILE  // optional — uses built-in if omitted
})
```

Species profile shape:
```js
{
  id: 'equine',
  axes: {
    valence:    { range: [-1,1], resolution: 0.05 },
    arousal:    { range: [-1,1], resolution: 0.05 },
    suppression:{ range: [0,1],  resolution: 0.02 },  // minimal suppression layer
    coherence:  { range: [0,1],  resolution: 0.05 },
    engagement: { range: [0,1],  resolution: 0.05 }
  },
  signalVocab: [
    'ear.forward', 'ear.back', 'ear.asymmetric',
    'tail.raised', 'tail.clamped', 'tail.swish',
    'nostril.flare', 'eye.white', 'eye.soft',
    'posture.hollow', 'posture.engaged', 'posture.freeze',
    'head.high', 'head.low', 'lick.chew',
    'weight.shift', 'foot.stamp', 'skin.twitch'
  ],
  suppressionLayer: false,   // animals: signal IS state
  culturalCalibration: false
}
```

---

## @spatial/nexus
**source:** causal-nexus v5.0.1
**status:** RENAME + namespace events
**size:** ~4000 lines, 15 submodules, already packaged

### What it is
Real-time causal event engine.
What happened. Why. In what order. With what confidence.
Ring buffer, gate system, CQL query, Forge self-modification.

### Already has
- `identity`    UUID v4, hash, dedup
- `time`        kernel-local clocks
- `causality`   edges, graph, causal map
- `kernel`      ring buffer, gate system
- `delta`       kinematic delta stream
- `compress`    snapshot/blueprint/compile — the codec bridge lives here
- `forge`       AI self-modification via Anthropic API
- `persist`     WAL + archive + recovery
- `query`       CQL query engine
- `sigma`       slope + regime classification

### Codec → compress bridge (new work)
```js
// @spatial/kernel emits spatial.kernel.blueprint.ready
// @spatial/nexus/compress ingests it

bus.on('spatial.kernel.blueprint.ready', ({ blueprint, personId }) => {
  // codec invariants → compress blueprint format
  const nexusBP = {
    vocab:      blueprint.vocab,       // AssociationEngine edges
    patterns:   blueprint.patterns,    // n-gram fingerprints
    invariants: blueprint.invariants,  // InvariantBaseline ≥80% patterns
    grammar:    blueprint.grammar,     // SlopeEngine trajectory sequences
    basins:     blueprint.basins       // dominant attractor positions
  }
  const module = await compile(nexusBP)
  // executable receiver grammar — loaded by @spatial/bridge
  bus.emit('spatial.nexus.blueprint.compiled', { module, personId })
})
```

### Bus surface (renamed)
```
Emits:
  spatial.nexus.gate.fired            { gateId, eventType, depth, ts }
  spatial.nexus.causal.chain          { root, descendants, edgeMeta }
  spatial.nexus.delta.update          { S, C, kinematic, behavioral }
  spatial.nexus.regime.changed        { prev, next, confidence, ts }
  spatial.nexus.blueprint.compiled    { module, personId, ts }
  spatial.nexus.forge.patch.applied   { diff, gateId, ts }
  spatial.nexus.error                 { code, message }

Listens:
  spatial.kernel.latent.update        → ingests as causal event
  spatial.kernel.behavior.detected    → ingests as causal event
  spatial.kernel.blueprint.ready      → triggers compress/compile
  spatial.session.start/stop
```

---

## @spatial/bridge
**source:** xlat-bridge.js
**status:** WRAP — already written, needs package.json + namespace
**size:** 1433 lines

### What it is
XLAT translation layer. Five-stage pipeline per direction.
Mode conversion (photonics). Bandwidth adaptation (codec).
Temporal buffer. Shared referent engine. Irrecoverable detector.

### Core pipeline (already implemented)
```
[RECEIVE] → [DECODE] → [PROFILE] → [TRANSCODE] → [RENDER]
```

### Cross-species extension (new work)
Profile stage extended for non-human receivers:
```js
// Receiver profile — human
{
  nsState: 'VENTRAL',
  bandwidth: 'MODERATE',
  attachGrammar: 'SECURE',
  cogMode: 'THINK_FIRST',
  culturalFrame: 'SCANDINAVIAN',
  receiverBP: compiledModule  // from @spatial/nexus blueprint
}

// Receiver profile — equine
{
  species: 'equine',
  arousal: 0.7,
  bandwidth: 'REDUCED',  // same bandwidth levels apply
  signalMode: 'SOMATIC_PRIMARY',
  threatSensitivity: 0.8,
  receiverBP: equineProfile
}
```

Bandwidth levels apply universally across species.
A horse in high arousal: `REDUCED` — single-mode transmission only.
A horse in freeze: `OFFLINE` — buffer everything.
The same logic. Different profiles.

### Bus surface
```
Emits (unchanged from xlat-bridge.js, namespaced):
  spatial.bridge.transmission.ready   { decoded, transcoded, personA, personB }
  spatial.bridge.render.A             { content, mode, bandwidth, ts }
  spatial.bridge.render.B             { content, mode, bandwidth, ts }
  spatial.bridge.referent.found       { referentA, referentB, shared, ts }
  spatial.bridge.buffer.held          { transmission, reason, ts }
  spatial.bridge.buffer.released      { transmission, ts }
  spatial.bridge.irrecoverable        { reason, subject, ts }
  spatial.bridge.bandwidth.update     { subject, prev, next, ts }
  spatial.bridge.mode.converted       { from, to, subject, ts }
  spatial.bridge.window.open          { subject, ts }

Listens:
  spatial.kernel.latent.update        → update person state
  spatial.nexus.blueprint.compiled    → load receiver grammar
  spatial.kernel.behavior.detected    → update receiver profile
  spatial.session.start/stop
```

---

## @spatial/resonance
**source:** new — draws from attractor-landscape.js + codec fingerprint
**status:** WRITE
**size:** est. ~600 lines

### What it is
Behavioral fingerprint engine. Attractor distance. Matching query.
Standalone — works on text interaction patterns alone (no camera).
Richer with @spatial/kernel signals.

### Fingerprint schema
```js
{
  id:            string,    // fnv1a32 hash — no PII
  restingState:  float[5],  // depth-weighted attractor centroid
  topology: {
    attractors:  [{center, radius, depth, label}],
    edges:       [{from, to, frequency, barrier}],
    dominantMode: string,   // most-visited basin label
  },
  receiverGrammar: {
    primaryMode:  string,   // THINK_FIRST | FEEL_FIRST | SOMATIC_FIRST
    bandwidth:    string,   // typical processing capacity
    attachPattern: string,
  },
  suppressionProfile: {
    mean: float, peak: float, pattern: string
  },
  aseSignature:  string,    // art resonance fingerprint (if @spatial/ase present)
  species:       string,    // 'human' | 'equine' | 'canine' | ...
  sessionCount:  int,
  lastUpdated:   ts
}
```

### Distance metric
Weighted Euclidean in 5D attractor space +
receiver grammar compatibility score +
suppression profile alignment

```js
distance(fpA, fpB) → {
  spatial:    float,  // 5D attractor distance — 0=identical, 1=maximum
  grammar:    float,  // receiver grammar compatibility — 0=no translation needed
  suppression: float, // suppression profile similarity
  composite:  float   // weighted composite — THE resonance score
}
```

### API
```js
import { ResonanceEngine } from '@spatial/resonance'

const engine = new ResonanceEngine({ bus, threshold: 0.72 })

engine.fingerprint(personId)         // → current fingerprint
engine.distance(fpA, fpB)            // → distance object
engine.match(personId, pool)         // → ranked matches from pool
engine.nearby(personId, pool, n)     // → top n closest
```

### Bus surface
```
Emits:
  spatial.resonance.fingerprint.updated   { personId, fingerprint, ts }
  spatial.resonance.scored                { a, b, distance, ts }
  spatial.resonance.match.ready           { personId, matches[], ts }

Listens:
  spatial.kernel.landscape.updated        → update fingerprint
  spatial.kernel.codec.invariants         → update receiver grammar
  spatial.ase.signature.updated           → update ase component
  spatial.session.start
```

---

## @spatial/ase
**source:** new — ASE system
**status:** WRITE (core) + INTEGRATE (bus events)
**size:** est. ~800 lines

### What it is
Art Signature Engine. Work fingerprint. Resonance trajectory.
How a piece moves through people across time.
Not streams. Not likes. Behavioral geometry of encounter.

### Work signature schema
```js
{
  workId:        string,
  title:         string,
  medium:        string,
  creatorId:     string,   // fingerprint — no PII
  signature: {
    tonalCenter:   float[5],   // mean latent response across encounters
    radiusProfile: float[5],   // variance — how differently people respond
    suppressionLift: float,    // avg suppression change at encounter
    coherenceShift:  float,    // avg coherence change at encounter
    engagementArc:   string,   // rising | falling | sustained | spike
  },
  encounters:    [{
    personFingerprint: string,
    responseVector:    float[5],
    delta:             float[5],  // their state change
    duration:          int,       // ms engaged
    returnCount:       int,       // times returned to this work
    ts:                ts
  }],
  trajectory: {
    firstEncounters:   ts,
    totalEncounters:   int,
    resonanceOverTime: [{ts, score, encounterCount}],
    peakResonance:     float,
    currentResonance:  float,
    trend:             string,    // deepening | dissolving | stable | emerging
  }
}
```

### The long arc
A work that resonates deeply with few people is structurally different
from one that touches many people lightly.
ASE measures depth × spread × persistence.
A piece that seems to fail in year one may be deepening in year seven.
The trajectory is the record.

### Bus surface
```
Emits:
  spatial.ase.encounter.recorded      { workId, personId, response, delta }
  spatial.ase.signature.updated       { workId, signature, ts }
  spatial.ase.trajectory.updated      { workId, trajectory, ts }
  spatial.ase.resonance.found         { workId, personId, score, ts }

Listens:
  spatial.kernel.latent.update        → record encounter response
  spatial.resonance.fingerprint.updated → link work to person fingerprint
  spatial.session.start/stop
```

---

## @spatial/field
**source:** new — draws from CrystalBall social module
**status:** WRITE
**size:** est. ~500 lines

### What it is
Relational geometry. Multi-subject.
Synchrony. Mirroring. Attunement. Tension.
Activates automatically on 2+ subjects on bus.

### Algorithms
- Synchrony: cross-correlation of latent vectors, ±400ms lag tolerance
- Mirroring: gesture sequence similarity, latency-typed (involuntary <300ms)
- Attunement: composite — synchrony + mirroring + shared entropy slope
- Tension: oppositional signal density — one opens, one closes

### Cross-species field
Field works across species. Human ↔ horse. Human ↔ dog.
The relational geometry between a trauma survivor and a therapy horse
is a real spatial relationship. Field maps it.

### Bus surface
```
Emits:
  spatial.field.synchrony.update      { subjectA, subjectB, score, lag, ts }
  spatial.field.mirroring.detected    { source, mirror, latency, type, ts }
  spatial.field.attunement.update     { subjects[], index, ts }
  spatial.field.tension.update        { subjects[], score, ts }
  spatial.field.referent.emerging     { subjects[], signal, ts }

Listens:
  spatial.kernel.latent.update        → per-subject state
  spatial.kernel.behavior.detected    → gesture/posture for mirroring
  spatial.kernel.subject.add/remove
```

---

## @spatial/pat
**source:** .pat schema (new) + causal-nexus/persist (WAL)
**status:** WRITE schema + INTEGRATE nexus persist
**size:** est. ~400 lines

### What it is
Canonical session record.
Everything writes here. Everything can be replayed from here.
CQL queryable. Compress/restore. Blueprint compile pipeline.
Cross-species sessions natively supported.

### Session schema v1
```js
{
  id:             string,
  createdAt:      ts,
  dataDir:        string,
  subjects:       [{ id, species, fingerprint }],
  frameRate:      int,
  schemaVersion:  '1.0.0',

  signal_events:  [{
    t, subjectId, layer, signal, subtype, confidence, bbox, species
  }],
  vats_overrides: [{
    t, subjectId, zone, signal, confidenceOverride, annotator, notes
  }],
  entropy_log:    [{
    t, subjectId, slopeWindow, deterministic, deductions:[{label,entropy,confidence}]
  }],
  lattice_refs:   [{ nodeId, resonance, t }],
  social_field:   { active, subjects[], synchrony, mirroring, attunement, tension },
  bridge_log:     [{
    t, type, subjectA, subjectB, mode, bandwidth, held, referent
  }]
}
```

### Bus surface
```
Emits:
  spatial.pat.session.written         { sessionId, path, ts }
  spatial.pat.session.restored        { sessionId, ts }
  spatial.pat.query.result            { query, result, ts }

Listens:
  spatial.*                           → writes everything to session record
  spatial.session.start/stop          → open/close session file
```

---

## @spatial/sigma
**source:** causal-nexus/sigma + ALK SlopeEngine (codec-v2)
**status:** EXTRACT + EXTEND
**size:** ~300 lines core + SlopeEngine integration

### What it is
Entropy detection. Slope. Trajectory.
Where things are going before they get there.
Probabilistic — never binary except at confirmed threshold.

### Regimes
```
STABLE       — low entropy, coherent, predictable
ACTIVATING   — entropy rising from stable — mobilization, not dysregulation
UNGROUNDED   — moderate entropy, fragmented, drifting
DYSREGULATED — high entropy, multi-layer spike, low predictability
OSCILLATORY  — alternating between states, no settling
COLLAPSING   — rapid entropy increase toward OFFLINE
OFFLINE      — DORSAL/FREEZE — nothing receivable
```

### Species note
Sigma applies to any nervous system.
An equine DYSREGULATED is structurally identical mathematics to human.
The regime vocabulary changes (no COGNITIVE suppression in animals) but
the slope-based detection is species-agnostic.

---

## @spatial/lattice
**source:** new — ALK AssociationEngine + lattice CLI design
**status:** WRITE
**size:** est. ~500 lines

### What it is
Associative memory. Resonance-weighted graph.
One observation = one node. One similarity = one edge.
Meaning emerges from clusters.
CLI: /find · /connect · /inspect · /cluster · /graph

### Node schema
```js
{
  id:         string,       // spatial-lattice-<uuid>
  label:      string,
  tags:       string[],
  vector:     float[5],     // latent space position at time of observation
  species:    string,
  sessionId:  string,
  subjectId:  string,
  ts:         ts,
  confidence: float
}
```

### Edge schema
```js
{
  a:          string,       // node id
  b:          string,       // node id
  weight:     float,        // resonance score 0..1
  type:       'auto'|'manual',
  createdAt:  ts
}
```

### CLI
```
/find [query]           semantic search → ranked nodes by resonance
/connect [a] [b]        create/strengthen edge
/inspect [id]           full node dump
/cluster                list clusters, counts, dominant signal
/graph                  emit spatial.lattice.graph.ready for visualization
/threshold [n]          set resonance threshold (default 0.72)
```

---

## BUILD ORDER

1. @spatial/bus          — foundation. everything depends on it.
2. @spatial/nexus        — rename + namespace. causal memory.
3. @spatial/kernel       — extract + species extension. sensor array.
4. @spatial/bridge       — wrap + species profiles. translation.
5. @spatial/sigma        — extract + extend. entropy.
6. @spatial/pat          — write schema + integrate nexus/persist.
7. @spatial/resonance    — write. matching core.
8. @spatial/lattice      — write. meaning memory.
9. @spatial/field        — write. relational geometry.
10. @spatial/ase         — write. art analytics.

---

## AXIOMS (shared across all packages)

§1.1  All outputs labeled as signals. Not diagnoses. Not verdicts.
§1.2  All errors loud. Zero silent failures.
§3.1  Bottom-up only. Data → structure → inference → action.
§5.1  UUID + hook + bus registration per module.
§5.5  No external runtime dependencies.
§5.7  Zero direct module calls. All I/O via @spatial/bus.
§5.8  Composable layers, not configured monolith.
§7.0  Event ontology: observational vs authoritative separated.
§K6   No module calls another module directly.
§K7   All errors as events. Never throws.
§P1   No PII stored. Fingerprints are behavioral hashes.
§CS1  Species-agnostic mathematics. Signal is signal.
§CS2  Suppression layer optional per species profile.
§CS3  Cross-species field is a first-class relational type.
