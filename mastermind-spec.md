# MASTERMIND — Full Spec
**Date: 2026-04-16 | Version: 3.0.5 → 3.1.0**

---

## BLACK SCREEN FIX (do this first)

**Root cause:** `index-browser.html` (what `main.js` loads) is missing `nexus-canvas.js`
from its script list. The load order goes:
```
mastermind-foundation.js → nexus-engine.js   ← WRONG
```
Engine fires at line 21: `if (typeof window.CANVAS === 'undefined')` → hard fail → black screen.

**Fix — add two lines to index-browser.html before nexus-engine.js:**
```html
<!-- ADD THESE TWO LINES before nexus-engine.js -->
<script src="mastermind-siso-jaa.js" onerror="console.warn('siso-jaa not found')"></script>
<script src="nexus-canvas.js" onerror="document.body.innerHTML='CANVAS LOAD FAILED'"></script>
<script src="mastermind-vault.js" onerror="console.warn('vault not found')"></script>
<!-- then nexus-engine.js -->
<script src="nexus-engine.js"></script>
```

**Correct load order (mandatory):**
1. `mastermind-siso-jaa.js`    ← MM_BUS, MM_RUNNER
2. `mastermind-foundation.js`  ← utilities
3. `nexus-canvas.js`           ← sets window.CANVAS ← THIS WAS MISSING
4. `mastermind-vault.js`       ← vault watchdog
5. `nexus-engine.js`           ← reads window.CANVAS

That's it. One file added to index-browser.html. Mastermind runs.

---

## What Exists (Audited)

**Architecture: split canvas + engine**
- `nexus-canvas.js` (970L) — canvas state, rendering, nodes, connections, undo/redo, pan/zoom
- `nexus-engine.js` (7,740L) — all application modules
- `window.CANVAS` — the only interface between them

**Modules that exist and work:**
- Auth + Vault (scrypt, AES-256-GCM, brute-force throttle, session seal)
- Brain Map v2 (13 meta-domains, radial canvas, intelligence ratings, synthesis detection)
- Spatial Void (seeds, open loops, what-ifs, create/express, priming methods)
- Horizon Living (end-state planning, conditions not tasks, canvas export)
- ALM (application lifecycle canvas)
- Toast system
- SISO MM_BUS (all actions emit events)
- Jaa MM_RUNNER (localStorage fallback active — violation of persistence rule)
- Feature gate system (brain/void/horizon/alm toggles)

**Modules that are partial/stub:**
- GAP module — partial, uses localStorage
- Signal module — `renderSignalItems` referenced but implementation unclear
- Threads module — `renderThreads` referenced but implementation unclear
- Body module — somatic signals, body patterns, body invariants exist in VOID_STATE
  but no dedicated UI

**Known bugs:**
- MM-001 HIGH: localStorage everywhere — violates persistence rule → needs Jaa FileStore
- MM-002: index-browser.html missing nexus-canvas.js → BLACK SCREEN (fix above)
- MM-003: No bridge registration
- MM-004: No human system models (the 8 models you described)

---

## What's Needed — The Human System Models

These 8 models become new tabs/sections inside Mastermind.
Each is a module in nexus-engine.js following the existing pattern.

---

### THE BRIDGE BETWEEN COGNITIVE AND EXPERIENTIAL

This is the most important conceptual anchor before anything else:

**Cognitive system (measurable):**
- input → processing → output
- functions: Ni (convergent intuition), Ti (analytical logic), Ne (divergent), Te (execution), etc.
- measurable through behavior and output patterns

**Experiential system (felt, not measured):**
- sensation → awareness → interpretation
- mapped to body regions
- the "chakra" model in grounded terms

**The translation:**
"Open your chakras" = increased body awareness + reduced internal resistance +
emotional processing + attention shifting from mind → body.

More precise: "attention and regulation improving across internal states"

This translation is the bridge. Mastermind holds both systems and the space between them.
The canvas is where they meet — a node connecting a Ni function (cognitive) to
a body region (experiential) is a genuine insight about how you process reality.

---

### THE 8 HUMAN SYSTEM MODELS

#### 1. BIOLOGICAL MODEL — The Hardware
```
Source: Neuroscience + Biology
Human = brain + nervous system + hormones + body states
Core: Behavior = output of physical processes
Key invariant: If this layer is off (sleep, stress, trauma) → everything else distorts

Canvas node types: biological nodes (new type: 'biological', icon: '⬡', color: '#22ddaa')
Tracks:
  - Sleep quality (0-10, daily)
  - Stress level (0-10, current)
  - Nervous system state: regulated / activated / shutdown
  - Hormonal context (e.g. high cortisol, low dopamine signals)
  - Body state: rested / depleted / hyperactivated
```

#### 2. COGNITIVE MODEL — The Processor
```
Source: Cognitive Psychology
Human = perception + memory + thinking + decision-making
Includes: cognitive functions (Ni, Ti, Ne, Te, Fi, Fe, Si, Se), biases, mental models
Core: The mind interprets reality — it doesn't mirror it

Tracks:
  - Dominant function active right now (e.g. "currently in Ti mode")
  - Active cognitive biases (e.g. confirmation bias, sunk cost)
  - Mental models in use
  - Processing mode: convergent / divergent / analytical / associative
  - Clarity level (0-10)
```

#### 3. AFFECTIVE MODEL — The Value Engine
```
Source: Affective Neuroscience
Human = emotions + motivation + internal meaning
Core: You don't act on logic — you act on what feels meaningful

Tracks:
  - Current emotion (named, not just "good/bad")
  - Motivation source: intrinsic / extrinsic / avoidance / purpose
  - Meaning level (0-10): does what you're doing feel meaningful right now?
  - Emotional blocks active
  - Affect-action bridge: what emotion is driving current behavior?
```

#### 4. BEHAVIORAL MODEL — The Observable Output
```
Source: Behaviorism
Human = habits + actions + conditioning
Core: What you repeatedly do becomes what you are

Tracks:
  - Active habits (logging, streaks optional)
  - Conditioning patterns (what triggers what behavior)
  - Behavioral anchors: actions that reliably produce desired states
  - Pattern recognition: what behavior clusters tend to appear together
```

#### 5. RELATIONAL MODEL — The Social System
```
Source: Attachment Theory
Human = bonding patterns + communication + co-regulation
Core: You are shaped in relationship, not isolation

Tracks:
  - Attachment orientation: secure / anxious / avoidant / disorganized
  - Co-regulation state: who you regulate with, what works
  - Communication patterns active
  - Relational needs right now
  - Connection quality log
```

#### 6. SYSTEMS MODEL — The Meta-Layer
```
Source: Systems Theory
Human = interacting subsystems + feedback loops + adaptation over time
Core: Patterns repeat because structures produce them

Tracks:
  - Active feedback loops (positive = amplifying, negative = stabilizing)
  - System leverage points: where a small change would cascade
  - Structural patterns: what structures in your life produce your current patterns
  - Adaptation tracking: how are you changing in response to feedback
```

#### 7. PHENOMENOLOGICAL MODEL — The Lived Experience
```
Source: Phenomenology
Human = what it feels like to be you + perception of meaning + inner narrative
Core: Reality is filtered through experience, not just facts

Tracks:
  - Inner narrative right now (the story you're telling yourself)
  - Perception of meaning: what this moment means to you
  - Lived texture: the felt quality of experience (not measurable, just noted)
  - Phenomenological journal: stream-of-consciousness entries, no structure required
```

#### 8. DEVELOPMENTAL MODEL — Change Over Time
```
Source: Developmental Psychology
Human = stages + growth patterns + adaptation across life
Core: You are not static — you are a trajectory

Tracks:
  - Current developmental stage/theme
  - Growth edge: what you're actively developing
  - Historical pattern: how you've grown through past challenges
  - Trajectory: where you're headed (connects to Horizon module)
```

---

## Embodiment Module (expanded from Body tab)

The existing Body tab in Mastermind has: somaticSignals, bodyPatterns, bodyInvariants.
That's the skeleton. What's needed is the full embodiment system.

### Sub-sections:

**SOMATIC STATE** (exists, needs UI)
- Body scan: attention moving through body regions
- Signal log: what sensations are present
- Polyvagal state: safe/social → fight/flight → shutdown
- Regulation tools available

**FLOW**
- Flow state tracker
- What conditions produced flow in the past
- Current preconditions: are they met?
- Flow induction: which priming methods have worked (syncs to Void priming log)
- Post-flow debrief: what happened, what made it work

**LAB**
- Experimentation space: try a somatic intervention, log the result
- Protocol builder: sequence of somatic steps with outcome tracking
- Hypothesis: "If I do X before deep work, I enter flow faster"
- Evidence log: outcomes over time

**GETTING BACK INTO YOUR BODY**
- For when you're fully dissociated / in your head
- Grounding sequence: step-by-step body re-entry
  - Feet on floor (5 physical things you can feel)
  - Breath awareness (not control — just noticing)
  - Peripheral vision (opens the nervous system)
  - Sound (what can you hear right now)
  - Movement (smallest possible: finger, toe)
- Tracks: how often you need this, which steps help most

**POLYVAGAL HEALING**
- Nervous system state map: safe/social → mobilization → immobilization
- VVC (Ventral Vagal Complex) — safety, connection, calm alertness
- SNS (Sympathetic) — fight/flight, activation, preparation
- DVC (Dorsal Vagal) — shutdown, collapse, dissociation
- Which state are you in now?
- Regulation pathways: specific tools for each state transition
  - SNS → VVC: slow exhale, humming, eye contact, co-regulation
  - DVC → SNS: movement, cold water, bouncing, orienting
  - VVC practices: singing, gargling, slow diaphragmatic breathing
- Progress log: nervous system stability over time

**COMPLETE SOMATIC INTEGRATION**
- The synthesis view: all body data together
- Biological layer (sleep, stress, hormones) ↔ Somatic layer (sensations, polyvagal)
- Integration score: how well-regulated are you right now across all layers
- Canvas export: spawn a SYNTHESIS node that captures current somatic integration state

---

## Canvas Integration — New Node Types

Add to NT in nexus-canvas.js:
```js
biological:    { icon: '⬡', color: '#22ddaa', badge: 'BIO', domain: 'Body',         ph: 'Biological state or process...' },
affective:     { icon: '♥', color: '#ff6688', badge: 'AFF', domain: 'Emotion',      ph: 'Emotional state or driver...' },
relational:    { icon: '⬡', color: '#ff8c22', badge: 'REL', domain: 'Relationship', ph: 'Relational pattern or bond...' },
somatic:       { icon: '◎', color: '#88ffcc', badge: 'SOM', domain: 'Body',         ph: 'Somatic signal or body state...' },
developmental: { icon: '▲', color: '#cc44ff', badge: 'DEV', domain: 'Growth',       ph: 'Developmental stage or edge...' },
```

---

## Bridge Integration (MM-003 fix)

Add to nexus-engine.js boot sequence:
```js
// Register with bridge on load
async function registerWithBridge() {
  try {
    await fetch('http://localhost:3747/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mastermind',
        url: 'electron://mastermind',
        capabilities: ['canvas', 'brain-map', 'voice-lattice', 'human-models'],
        uuid: 'mastermind-cognitive-canvas-v3-000-000000000001'
      })
    });

    // Emit bridge connection event
    if (typeof MM_BUS !== 'undefined') {
      MM_BUS.emit('mm.bridge.connected', { bridgeUrl: 'http://localhost:3747' });
    }
  } catch {
    // Bridge offline — degrade gracefully, Mastermind still works
  }
}
```

Bridge status dot in topbar: small circle, green = connected, grey = offline.
Never blocks Mastermind from loading if bridge is down.

---

## Voice Lattice Integration

Voice Lattice is already partially spec'd in the Embodiment Timer.
In Mastermind it appears as a tab in the Embodiment module.

Key difference from Embodiment Timer's Voice Lattice:
- Mastermind VL: for externalizing internal state — "what is happening inside me right now"
- Embodiment Timer VL: for capturing ideas and day context

Implementation is the same (ring buffer, 10s chunks, save last N minutes).
Mastermind's VL auto-tags recordings with the current active module:
- Recording while in Somatic State → tagged 'somatic'
- Recording while in Biological Model → tagged 'biological'
- Recording while on canvas → tagged 'canvas-session'

---

## Persistence Migration (MM-001 fix)

Replace all localStorage calls with Jaa FileStore:

```js
// Current (wrong):
localStorage.setItem('nexus_mm_v3', JSON.stringify(data))

// Target (correct):
// nexus-canvas.js saveCanvas():
async saveCanvas(data) {
  if (window.NX_IPC?.write) {
    // Electron: write via IPC (already implemented in main.js)
    await window.NX_IPC.write(
      path.join(dataDir, 'canvas-state.json'),
      JSON.stringify(data, null, 2)
    );
  } else {
    // Browser fallback: still localStorage but flagged
    localStorage.setItem('nexus_mm_v3', JSON.stringify(data));
  }
}
```

Full Jaa integration (Phase 2) replaces this with:
```js
MM_RUNNER.run('INSERT INTO canvas_snapshots (uuid, data, ts) VALUES (?, ?, ?)',
  [uuid(), JSON.stringify(data), Date.now()]);
```

---

## Module Build Order

```
IMMEDIATE (unblocks everything):
  Fix-01: Add nexus-canvas.js to index-browser.html load order  ← 1 line, fixes black screen

SHORT TERM:
  Fix-02: Bridge registration (registerWithBridge() in engine boot)
  Fix-03: Bridge status dot in topbar

MEDIUM TERM (new modules):
  MM-New-01: Biological Model tab
  MM-New-02: Cognitive Model tab (with cognitive function tracker)
  MM-New-03: Affective Model tab
  MM-New-04: Behavioral Model tab
  MM-New-05: Relational Model tab
  MM-New-06: Systems Model tab
  MM-New-07: Phenomenological Model tab
  MM-New-08: Developmental Model tab
  MM-New-09: Embodiment module expansion (Flow, Lab, Getting Back, Polyvagal, Integration)
  MM-New-10: Voice Lattice tab in Embodiment module

LONGER TERM:
  MM-Phase-2: localStorage → Jaa FileStore migration
  MM-Phase-3: Canvas node type additions (biological, affective, somatic, etc.)
  MM-Phase-4: Cross-model synthesis view (how Biological affects Cognitive affects Affective)
```

---

## The Cross-Model Synthesis View

This is the most important feature that doesn't exist yet.

The 8 models interact. The point of having all of them is seeing how they affect each other.

```
BIOLOGICAL ──→ COGNITIVE    Sleep off → Ni can't converge → decisions degrade
BIOLOGICAL ──→ AFFECTIVE    High cortisol → negative affect amplified
AFFECTIVE  ──→ BEHAVIORAL   Low meaning → avoidance behaviors increase
COGNITIVE  ──→ PHENOMENOLOGICAL  Dominant function colors entire lived experience
RELATIONAL ──→ BIOLOGICAL   Co-regulation with safe person → VVC activation
SYSTEMS    ──→ DEVELOPMENTAL Structural patterns → growth trajectory shaped by feedback loops
```

The synthesis view shows these interactions as a live canvas cluster.
Current state in each model → visible arrows showing active influences.
Click an arrow → spawn a SYNTHESIS node on the main canvas documenting the connection.

This is not a dashboard. It's a cognitive map of your own system interactions.

---

## What Mastermind IS (Clarified)

After all of this: Mastermind is a cognitive operating system for self-understanding.

Not a productivity tool. Not a note app. Not a goal tracker.

It maps:
- How you think (Cognitive Model + Brain Map)
- What drives you (Affective Model)
- What you do (Behavioral Model)
- What your body is doing (Biological + Embodiment)
- How you relate (Relational Model)
- How your patterns emerge (Systems Model)
- What it feels like from inside (Phenomenological Model)
- How you're changing (Developmental Model)

The canvas is where all of this becomes visible as a connected graph.
The Bridge is how it talks to everything else in your ecosystem.
Jaa is how none of it disappears.

---

*Built from: SISO Core (Jonathan Bailey) + Jaa (Jonathan Bailey)*
*Application layer: James Brooks*
*Last updated: 2026-04-16*
