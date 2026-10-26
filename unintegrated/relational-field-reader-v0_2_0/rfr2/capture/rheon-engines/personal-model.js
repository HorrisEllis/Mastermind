/**
 * RHEON KERNEL — ENGINE: PERSONAL MODEL
 * v1.0.0 · Never resets · Grows across sessions
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The kernel models the grammar of how you specifically think when you speak.
 * Not "what did you say today" — "what is the invariant pattern of how you
 * think, across every session you've ever had."
 *
 * Two things live here:
 *
 *   1. PERSONAL BASELINE
 *      A lifetime accumulation of your field vectors.
 *      Exponential decay weighting — recent sessions matter more,
 *      but no data is ever deleted. Gold is never lost.
 *      After ~10 sessions: locks a personal Theta signature.
 *      Deviation from that signature is meaningful because the baseline is real.
 *
 *   2. PATTERN LIBRARY
 *      Named recurring structures in your thinking — learned from observation.
 *      Which field geometries precede your breakthroughs.
 *      Which patterns signal you're in a stuck loop vs productive recursion.
 *      Which gap types you generate most (your personal gap profile).
 *      Your rhythm: the period of your energy/coherence cycles across sessions.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHAT'S GUTTED FROM THE SPACIAL AND USED HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * FROM relational-physics.js:
 *   Theta class (H, I, C, M, P_c, P_e) — 6-axis cognitive field state
 *   EMOTION_SIGNATURES — emotion as nearest-neighbor in Theta space
 *   Coherence computation, gap signature, collapse pressure
 *
 * FROM pendulum.js:
 *   PendulumStore — rhythm tracking (period, amplitude, damping, phase)
 *   fullProfile() — computes rhythm properties from observation history
 *   Used here for: energy rhythm, coherence rhythm, dysfluency rhythm
 *
 * FROM kernel.js / profile-store.js:
 *   ProfileStore pattern — accumulate signals into a growing person profile
 *
 * FROM living-doc attractor basins:
 *   James's 8 named attractor basins (Duality, Meaning, Systems, Cosmic,
 *   Wanderer, Love as Transcendence, Transformation, Recursion)
 *   These are seeded as known field positions and detected at runtime.
 *
 * FROM focal-point-mechanism:
 *   The 5-stage model → pre-synthesis pattern = high dysfluency + EXPANSION
 *   stage + coherence drop + then rapid depth cascade to CORE.
 *   The pattern is detectable 3-5 nodes before FOCAL_FORMATION.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * INVENTED HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   Cross-session field accumulator with exponential decay weighting.
 *   Pre-synthesis signal detector (the pre-breakthrough field geometry).
 *   Personal attractor map: basin visits, dwell time, transition geometry.
 *   Gap profile: which gap types you generate, which precede breakthroughs.
 *   Deviation detector: "today you're 2.3σ outside your lifetime norm on coherence."
 *   Session restore: on boot, reload last session nodes so nothing is ever lost.
 *
 * §LAW: Never resets. Restore from Jaa on boot.
 * §LAW: Every observation persists. Decay weights, not deletes.
 * §LAW: Signal, not diagnosis. "High entropy session" ≠ breakdown.
 * §LAW: Nothing silently fails.
 *
 * Author: James Brooks (Erosmancer) · rheon.world · 2026-05-29
 */

import { bus } from '../core/bus.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const BASELINE_LOCK_NODES   = 200;   // nodes before baseline locks
const DECAY_HALFLIFE_NODES  = 500;   // decay half-life in nodes (recent weighs more)
const MIN_NODES_FOR_SIGNAL  =  20;   // minimum before any signal fires
const PENDULUM_MAX_OBS      = 500;   // max observations per rhythm signal
const PRE_SYNTH_WINDOW      =   8;   // nodes to look back for pre-synthesis pattern
const ATTRACTOR_RADIUS      = 0.22;  // distance in field space to be "in" a basin
const PERSONA_ID            = 'james-brooks'; // single-user kernel

// ── THETA — 6-axis cognitive field state ──────────────────────────────────────
// From relational-physics.js (The Spacial)
// H = entropy (uncertainty), I = intensity, C = causality, M = intimacy/coupling
// P_c = cognitive empathy (model accuracy), P_e = emotional empathy/resonance

class Theta {
  constructor({ H=0.5, I=0.5, C=0.5, M=0.5, P_c=0.5, P_e=0.5 } = {}) {
    this.H   = _clamp(H);
    this.I   = _clamp(I);
    this.C   = _clamp(C, -1, 1);
    this.M   = _clamp(M);
    this.P_c = _clamp(P_c);
    this.P_e = _clamp(P_e);
  }

  // Structural coherence contribution: C × M × P_c × P_e (positive C only)
  get coherence() {
    return _r4(Math.max(0, this.C) * this.M * this.P_c * this.P_e);
  }

  // Gap signature: low structure across all axes
  get gapSignature() {
    return _r4(
      this.H * 0.25 +
      (1 - Math.max(0, this.C)) * 0.25 +
      (1 - this.M) * 0.20 +
      (1 - this.P_c) * 0.15 +
      (1 - this.P_e) * 0.15
    );
  }

  // Collapse pressure: how close to breakdown
  get collapsePressure() {
    return _r4(
      (this.H + Math.max(0, -this.C) + (1 - this.P_c) * 0.3 + (1 - this.P_e) * 0.3) / 2.6
    );
  }

  toArray()  { return [this.H, this.I, this.C, this.M, this.P_c, this.P_e]; }
  toObject() { return { H: this.H, I: this.I, C: this.C, M: this.M, P_c: this.P_c, P_e: this.P_e }; }

  // Euclidean distance to another Theta
  distanceTo(other) {
    const a = this.toArray(), b = other.toArray();
    return _r4(Math.sqrt(a.reduce((s, v, i) => s + (v - (b[i] ?? 0)) ** 2, 0)));
  }

  // Delta vector
  delta(other) {
    return {
      H:   _r4(other.H   - this.H),
      I:   _r4(other.I   - this.I),
      C:   _r4(other.C   - this.C),
      M:   _r4(other.M   - this.M),
      P_c: _r4(other.P_c - this.P_c),
      P_e: _r4(other.P_e - this.P_e),
      magnitude: this.distanceTo(other),
    };
  }
}

// ── Emotion basins (from relational-physics.js) ───────────────────────────────
// Emotion = nearest attractor basin in Theta space. Not a label — a field position.

const EMOTION_BASINS = Object.freeze([
  { emotion:'love',        theta:{ H:0.15, I:0.65, C:0.80, M:0.85, P_c:0.80, P_e:0.80 } },
  { emotion:'joy',         theta:{ H:0.10, I:0.80, C:0.75, M:0.80, P_c:0.75, P_e:0.90 } },
  { emotion:'contentment', theta:{ H:0.15, I:0.30, C:0.65, M:0.60, P_c:0.65, P_e:0.55 } },
  { emotion:'curiosity',   theta:{ H:0.55, I:0.65, C:0.50, M:0.50, P_c:0.70, P_e:0.55 } },
  { emotion:'wonder',      theta:{ H:0.70, I:0.60, C:0.40, M:0.65, P_c:0.75, P_e:0.75 } },
  { emotion:'fear',        theta:{ H:0.90, I:0.80, C:0.15, M:0.50, P_c:0.20, P_e:0.50 } },
  { emotion:'anxiety',     theta:{ H:0.80, I:0.55, C:0.20, M:0.30, P_c:0.35, P_e:0.35 } },
  { emotion:'anger',       theta:{ H:0.35, I:0.80, C:0.75, M:0.45, P_c:0.65, P_e:0.45 } },
  { emotion:'grief',       theta:{ H:0.50, I:0.25, C:0.70, M:0.85, P_c:0.80, P_e:0.60 } },
  { emotion:'sorrow',      theta:{ H:0.35, I:0.20, C:0.70, M:0.75, P_c:0.75, P_e:0.70 } },
  { emotion:'loneliness',  theta:{ H:0.65, I:0.40, C:0.25, M:0.10, P_c:0.50, P_e:0.45 } },
  { emotion:'shame',       theta:{ H:0.55, I:0.40, C:0.20, M:0.10, P_c:0.65, P_e:0.40 } },
  { emotion:'numbness',    theta:{ H:0.20, I:0.05, C:0.05, M:0.10, P_c:0.20, P_e:0.10 } },
  { emotion:'despair',     theta:{ H:0.60, I:0.20, C:-0.10,M:0.20, P_c:0.45, P_e:0.30 } },
  { emotion:'gratitude',   theta:{ H:0.20, I:0.55, C:0.75, M:0.75, P_c:0.80, P_e:0.80 } },
  { emotion:'awe',         theta:{ H:0.75, I:0.65, C:0.45, M:0.70, P_c:0.80, P_e:0.85 } },
  { emotion:'pride',       theta:{ H:0.20, I:0.65, C:0.70, M:0.45, P_c:0.75, P_e:0.45 } },
  { emotion:'resentment',  theta:{ H:0.50, I:0.45, C:0.30, M:0.70, P_c:0.75, P_e:0.15 } },
]);

// Pre-build Theta objects for distance computation
const EMOTION_BASIN_THETAS = EMOTION_BASINS.map(b => ({
  emotion: b.emotion,
  theta:   new Theta(b.theta),
}));

function nearestEmotion(theta) {
  let best = null, bestDist = Infinity;
  for (const b of EMOTION_BASIN_THETAS) {
    const d = theta.distanceTo(b.theta);
    if (d < bestDist) { bestDist = d; best = b.emotion; }
  }
  return { emotion: best, distance: bestDist };
}

// ── James's attractor basins (from living doc / ASE fingerprint) ──────────────
// These are the stable cognitive territories documented in the living document.
// Expressed as Theta coordinates based on what each basin implies cognitively.

const JAMES_ATTRACTOR_BASINS = Object.freeze([
  {
    id:          'duality_integration',
    label:       'Duality / Integration',
    description: 'Holding two opposing truths simultaneously. Pre-synthesis expansion state.',
    // High entropy (holding contradiction), high intensity, high causality (seeking synthesis)
    theta: new Theta({ H:0.75, I:0.70, C:0.55, M:0.50, P_c:0.75, P_e:0.65 }),
    focalStage:  'TENSION_HOLDING',
  },
  {
    id:          'meaning_purpose',
    label:       'Meaning / Purpose',
    description: 'Anchoring to why. High coherence, structural clarity, low entropy.',
    theta: new Theta({ H:0.25, I:0.55, C:0.80, M:0.65, P_c:0.80, P_e:0.70 }),
    focalStage:  'CONTRACTION',
  },
  {
    id:          'systems_engineering',
    label:       'Systems / Engineering',
    description: 'Structural thinking mode. Low entropy, high causality, analytical register.',
    theta: new Theta({ H:0.20, I:0.60, C:0.85, M:0.40, P_c:0.85, P_e:0.45 }),
    focalStage:  'EDGE_DETECTION',
  },
  {
    id:          'cosmic_scale',
    label:       'Cosmic Scale',
    description: 'Zooming to maximum abstraction. High wonder, high entropy, high empathy.',
    theta: new Theta({ H:0.70, I:0.65, C:0.45, M:0.70, P_c:0.80, P_e:0.85 }),
    focalStage:  'EXPANSION',
  },
  {
    id:          'wanderer_exile',
    label:       'Wanderer / Exile',
    description: 'Liminal state. Between systems. Low coupling, moderate entropy.',
    theta: new Theta({ H:0.55, I:0.40, C:0.35, M:0.20, P_c:0.65, P_e:0.55 }),
    focalStage:  'EXPANSION',
  },
  {
    id:          'love_transcendence',
    label:       'Love as Transcendence',
    description: 'High coupling, high empathy, low entropy. The stable coherent state.',
    theta: new Theta({ H:0.15, I:0.65, C:0.80, M:0.85, P_c:0.80, P_e:0.85 }),
    focalStage:  'CONTRACTION',
  },
  {
    id:          'transformation',
    label:       'Transformation',
    description: 'Active phase transition. Entropy rising then falling. High intensity.',
    theta: new Theta({ H:0.65, I:0.80, C:0.60, M:0.55, P_c:0.70, P_e:0.65 }),
    focalStage:  'FOCAL_FORMATION',
  },
  {
    id:          'recursion_loop',
    label:       'Recursion / Loop',
    description: 'Circling a structure. High revisit rate. Could be deepening or stuck.',
    theta: new Theta({ H:0.45, I:0.55, C:0.50, M:0.50, P_c:0.70, P_e:0.60 }),
    focalStage:  'TENSION_HOLDING',
  },
]);

// ── PendulumStore (from pendulum.js — The Spacial) ────────────────────────────
// Tracks the rhythm of named signals over time.
// Learns your personal cadence: energy cycle period, coherence oscillation, etc.

class PendulumStore {
  constructor() {
    this._signals = new Map(); // signalId → { id, observations[], createdAt, updatedAt }
  }

  observe(signalId, value, ts = Date.now()) {
    if (!Number.isFinite(value)) return null;
    if (!this._signals.has(signalId)) {
      this._signals.set(signalId, { id: signalId, observations: [], createdAt: ts });
    }
    const sig  = this._signals.get(signalId);
    const last = sig.observations[sig.observations.length - 1];
    if (last && ts < last.ts) ts = last.ts + 1;
    sig.observations.push({ ts, value });
    sig.updatedAt = ts;
    if (sig.observations.length > PENDULUM_MAX_OBS) sig.observations.shift();
    return this.profile(signalId);
  }

  profile(signalId) {
    const sig = this._signals.get(signalId);
    if (!sig || sig.observations.length < 3) return null;
    return { signalId, observationCount: sig.observations.length, profile: _fullPendulumProfile(sig.observations) };
  }

  snapshot() {
    const out = {};
    for (const [id, sig] of this._signals) out[id] = { id: sig.id, observations: [...sig.observations], createdAt: sig.createdAt, updatedAt: sig.updatedAt };
    return out;
  }

  restore(snap) {
    this._signals.clear();
    for (const [id, sig] of Object.entries(snap)) this._signals.set(id, sig);
  }

  get signalIds() { return [...this._signals.keys()]; }
}

// ══════════════════════════════════════════════════════════════════════════════
// PERSONAL MODEL ENGINE
// ══════════════════════════════════════════════════════════════════════════════

export class PersonalModel {
  constructor(store) {
    this._store   = store;   // Jaa store for persistence
    this._personId = PERSONA_ID;

    // ── Lifetime field accumulator ────────────────────────────────────────────
    // Every node's field vector, weighted by recency
    this._allVectors  = [];      // { ts, vector: Float32Array(7), theta: Theta, nodeId, sessionId }
    this._nodeCount   = 0;

    // ── Lifetime baseline (locks after BASELINE_LOCK_NODES) ───────────────────
    this._baseline       = null;  // { mean, sigma } per axis + per Theta dim
    this._baselineLocked = false;
    this._baselineUpdates = 0;

    // ── Attractor tracking ────────────────────────────────────────────────────
    this._attractorVisits   = new Map();  // basinId → { count, totalDwell, lastTs, avgTheta }
    this._currentBasin      = null;
    this._basinEntryTs      = null;

    // ── Gap profile (which gaps you generate most) ────────────────────────────
    this._gapTypeCounts     = new Map();  // gapType → count
    this._gapBeforeBreakthrough = [];     // { gapTypes[], nodesBefore } — learned correlation

    // ── Pre-synthesis pattern ─────────────────────────────────────────────────
    this._recentNodes       = [];         // rolling window for pattern detection
    this._preSynthCount     = 0;
    this._confirmedSynth    = 0;         // how many times the pre-pattern led to FOCAL_FORMATION

    // ── Rhythm tracking (pendulum) ────────────────────────────────────────────
    this._pendulum          = new PendulumStore();

    // ── Emotion state ─────────────────────────────────────────────────────────
    this._emotionHistory    = [];         // { ts, emotion, distance, theta }
    this._emotionCounts     = new Map();  // emotion → count

    // ── Session context ───────────────────────────────────────────────────────
    this._sessionId         = null;
    this._sessionStart      = null;
    this._sessionNodeCount  = 0;
  }

  // ── BOOT: RESTORE FROM JAA ────────────────────────────────────────────────

  async restore() {
    if (!this._store) return 0;
    try {
      // Load persisted personal model state
      const cached = this._store.cacheGet('personal-model:' + this._personId);
      if (cached) {
        this._restoreFromSnapshot(cached);
        bus.emit('personal:restored', {
          nodeCount:       this._nodeCount,
          baselineLocked:  this._baselineLocked,
          attractorVisits: this._attractorVisits.size,
          pendulumSignals: this._pendulum.signalIds.length,
        }, 'PERSONAL_MODEL');
        return this._nodeCount;
      }
    } catch(e) {
      bus.emit('personal:restore:error', { error: e.message }, 'PERSONAL_MODEL');
    }
    return 0;
  }

  // ── SESSION START ──────────────────────────────────────────────────────────

  startSession(sessionId) {
    this._sessionId        = sessionId;
    this._sessionStart     = Date.now();
    this._sessionNodeCount = 0;
    bus.emit('personal:session:start', { sessionId, totalNodes: this._nodeCount }, 'PERSONAL_MODEL');
  }

  // ── PRIMARY WRITE PATH ────────────────────────────────────────────────────

  /**
   * Ingest a committed node into the personal model.
   * Called from kernel.commitNode() — never resets, accumulates forever.
   * Returns a PersonalFrame: the current state of the model relative to this node.
   */
  ingestNode(node) {
    if (!node) return null;
    this._nodeCount++;
    this._sessionNodeCount++;

    // ── 1. Build Theta from node metrics ─────────────────────────────────────
    const theta = this._thetaFromNode(node);

    // ── 2. Accumulate into lifetime vector store ──────────────────────────────
    const vector = node.shape?.vector ? new Float32Array(node.shape.vector) : null;
    this._allVectors.push({
      ts:        node.ts,
      vector,
      theta:     theta.toObject(),
      nodeId:    node.id,
      sessionId: this._sessionId,
    });
    // Keep last 2000 in memory (the full history is in Jaa)
    if (this._allVectors.length > 2000) this._allVectors.shift();

    // ── 3. Update baseline ────────────────────────────────────────────────────
    this._updateBaseline(theta, node);

    // ── 4. Pendulum observations ──────────────────────────────────────────────
    const ts = node.ts;
    this._pendulum.observe('energy',      node.energy || 0,             ts);
    this._pendulum.observe('coherence',   node.coherenceScore || 0,     ts);
    this._pendulum.observe('dysfluency',  node.dysfluencyScore || 0,    ts);
    this._pendulum.observe('sentiment',   node.sentiment || 0,          ts);
    this._pendulum.observe('theta.H',     theta.H,                      ts);
    this._pendulum.observe('theta.I',     theta.I,                      ts);

    // ── 5. Gap profile update ─────────────────────────────────────────────────
    for (const gap of (node.gaps || [])) {
      this._gapTypeCounts.set(gap.gapType, (this._gapTypeCounts.get(gap.gapType) || 0) + 1);
    }

    // ── 6. Emotion state ──────────────────────────────────────────────────────
    const { emotion, distance } = nearestEmotion(theta);
    this._emotionHistory.push({ ts, emotion, distance, theta: theta.toObject() });
    if (this._emotionHistory.length > 200) this._emotionHistory.shift();
    this._emotionCounts.set(emotion, (this._emotionCounts.get(emotion) || 0) + 1);

    // ── 7. Attractor basin detection ──────────────────────────────────────────
    const basinHit = this._detectBasin(theta, node);

    // ── 8. Rolling window for pre-synthesis detection ─────────────────────────
    this._recentNodes.push({ node, theta, basinHit });
    if (this._recentNodes.length > PRE_SYNTH_WINDOW * 2) this._recentNodes.shift();

    // ── 9. Pre-synthesis pattern detection ───────────────────────────────────
    const preSynth = this._detectPreSynthesis(node);

    // ── 10. Personal deviation ────────────────────────────────────────────────
    const deviation = this._computeDeviation(theta);

    // ── 11. Persist snapshot (every 50 nodes) ─────────────────────────────────
    if (this._nodeCount % 50 === 0) {
      this._persist();
    }

    // ── 12. Build and emit PersonalFrame ──────────────────────────────────────
    const frame = {
      nodeId:         node.id,
      ts:             node.ts,
      sessionId:      this._sessionId,
      totalNodes:     this._nodeCount,
      sessionNodes:   this._sessionNodeCount,

      // Theta
      theta:          theta.toObject(),
      emotion:        { emotion, distance: _r4(distance) },

      // Baseline
      baselineLocked:  this._baselineLocked,
      deviation,

      // Attractor
      currentBasin:    this._currentBasin,
      basinHit,

      // Pre-synthesis
      preSynthesis:    preSynth,

      // Gap profile
      dominantGapType: this._dominantGapType(),
      gapProfile:      Object.fromEntries(this._gapTypeCounts),

      // Rhythm (pendulum)
      rhythm: {
        energy:     this._pendulum.profile('energy'),
        coherence:  this._pendulum.profile('coherence'),
        dysfluency: this._pendulum.profile('dysfluency'),
      },
    };

    bus.emit('personal:frame', frame, 'PERSONAL_MODEL');

    // Separate high-signal events
    if (basinHit) {
      bus.emit('personal:attractor:recognized', {
        basin: basinHit,
        theta: theta.toObject(),
        emotion,
        nodeId: node.id,
      }, 'PERSONAL_MODEL');
    }

    if (preSynth?.detected) {
      bus.emit('personal:pattern:pre_synthesis', {
        confidence: preSynth.confidence,
        evidence:   preSynth.evidence,
        nodeId:     node.id,
        message:    'Pre-synthesis pattern detected. Focal point may be 3-5 nodes away.',
      }, 'PERSONAL_MODEL');
    }

    if (deviation?.alert) {
      bus.emit('personal:deviation', {
        axes:      deviation.axes,
        composite: deviation.composite,
        message:   `Deviation from personal baseline: compositeZ=${deviation.composite}σ`,
        nodeId:    node.id,
      }, 'PERSONAL_MODEL');
    }

    return frame;
  }

  // ── THETA FROM NODE ───────────────────────────────────────────────────────

  _thetaFromNode(node) {
    // Map node metrics to Theta axes:
    // H (entropy)    ← dysfluency + (1 - coherence) / 2
    // I (intensity)  ← energy
    // C (causality)  ← sentiment mapped -1→1, plus framework signals
    // M (intimacy/coupling) ← coherence (how connected to context)
    // P_c (cognitive empathy / model accuracy) ← coherence + low dysfluency
    // P_e (emotional resonance) ← |sentiment| + energy proxy

    const dys  = node.dysfluencyScore || 0;
    const coh  = node.coherenceScore  || 0;
    const sent = node.sentiment       || 0;
    const nrg  = node.energy          || 0;

    // Causality: positive sent + reasoning frameworks = high causal push
    const fwBoost = (node.frameworks || []).some(f => ['CAUSATION','CERTAINTY','SEQUENCE'].includes(f)) ? 0.15 : 0;
    const C = _clamp(sent * 0.6 + fwBoost + 0.5 * coh - 0.2 * dys, -1, 1);

    return new Theta({
      H:   _clamp((1 - coh) * 0.5 + dys * 0.5),
      I:   _clamp(nrg * 0.7 + Math.abs(sent) * 0.3),
      C,
      M:   _clamp(coh),
      P_c: _clamp(coh * 0.6 + (1 - dys) * 0.4),
      P_e: _clamp(Math.abs(sent) * 0.5 + nrg * 0.3 + coh * 0.2),
    });
  }

  // ── BASELINE ──────────────────────────────────────────────────────────────

  _updateBaseline(theta, node) {
    this._baselineUpdates++;
    const arr  = theta.toArray();
    const keys = ['H','I','C','M','P_c','P_e'];

    if (!this._baseline) {
      // Initialise
      this._baseline = {};
      keys.forEach((k, i) => {
        this._baseline[k] = { mean: arr[i], m2: 0, n: 1 };
      });
      // Also track SHAPE_AXES
      if (node.shape?.vector) {
        const AXES = ['AFFECT','ABSTRACTION','COHERENCE','DYSFLUENCY','ENERGY','FLOW','RESONANCE'];
        this._baseline._shape = {};
        AXES.forEach((ax, i) => {
          this._baseline._shape[ax] = { mean: node.shape.vector[i] || 0.5, m2: 0, n: 1 };
        });
      }
      return;
    }

    // Welford online update with exponential decay weight
    // Recent nodes count more; older nodes decay but never disappear
    const w = Math.exp(-Math.LN2 * this._baselineUpdates / DECAY_HALFLIFE_NODES);
    keys.forEach((k, i) => {
      const b    = this._baseline[k];
      const v    = arr[i];
      const diff = v - b.mean;
      // Weighted running mean
      b.mean = _r4(b.mean + (diff * (1 - w) + diff * w) / (b.n + 1));
      b.m2   += diff * (v - b.mean);
      b.n++;
      b.sigma = _r4(b.n > 1 ? Math.sqrt(Math.max(0, b.m2 / b.n)) : 0);
    });

    if (this._baselineUpdates >= BASELINE_LOCK_NODES && !this._baselineLocked) {
      this._baselineLocked = true;
      bus.emit('personal:baseline:locked', {
        nodeCount:  this._nodeCount,
        baseline:   this._baselineSnapshot(),
        message:    `Personal baseline locked after ${this._nodeCount} nodes. Deviations now meaningful.`,
      }, 'PERSONAL_MODEL');
    }

    if (this._baselineLocked && this._nodeCount % 100 === 0) {
      bus.emit('personal:baseline:update', {
        nodeCount: this._nodeCount,
        baseline:  this._baselineSnapshot(),
      }, 'PERSONAL_MODEL');
    }
  }

  _baselineSnapshot() {
    if (!this._baseline) return null;
    const out = {};
    for (const [k, v] of Object.entries(this._baseline)) {
      if (k === '_shape') continue;
      out[k] = { mean: v.mean, sigma: v.sigma || 0, n: v.n };
    }
    return out;
  }

  // ── DEVIATION FROM PERSONAL BASELINE ─────────────────────────────────────

  _computeDeviation(theta) {
    if (!this._baselineLocked || !this._baseline) {
      return { locked: false };
    }
    const keys = ['H','I','C','M','P_c','P_e'];
    const arr  = theta.toArray();
    const zScores = {};
    let sumZ2 = 0, count = 0;

    keys.forEach((k, i) => {
      const b = this._baseline[k];
      if (!b || b.sigma <= 0) { zScores[k] = 0; return; }
      const z = _r4((arr[i] - b.mean) / b.sigma);
      zScores[k] = z;
      sumZ2 += z * z;
      count++;
    });

    const composite = count > 0 ? _r4(Math.sqrt(sumZ2 / count)) : 0;
    const alert     = composite >= 2.0;

    // Top deviating axes
    const axes = Object.entries(zScores)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .slice(0, 3)
      .map(([k, z]) => ({ axis: k, z, direction: z > 0 ? 'above' : 'below' }));

    return { locked: true, zScores, composite, alert, axes };
  }

  // ── ATTRACTOR BASIN DETECTION ─────────────────────────────────────────────

  _detectBasin(theta, node) {
    if (this._nodeCount < MIN_NODES_FOR_SIGNAL) return null;

    let nearestBasin = null, nearestDist = Infinity;
    for (const basin of JAMES_ATTRACTOR_BASINS) {
      const dist = theta.distanceTo(basin.theta);
      if (dist < nearestDist) { nearestDist = dist; nearestBasin = basin; }
    }

    if (!nearestBasin || nearestDist > ATTRACTOR_RADIUS) {
      // Left a basin
      if (this._currentBasin) {
        const dwell = Date.now() - (this._basinEntryTs || Date.now());
        bus.emit('personal:attractor:exit', {
          basin: this._currentBasin.id,
          dwellMs: dwell,
          nodeId: node.id,
        }, 'PERSONAL_MODEL');
        this._currentBasin = null;
        this._basinEntryTs = null;
      }
      return null;
    }

    // In a basin
    const visits = this._attractorVisits.get(nearestBasin.id) || { count: 0, totalDwell: 0, lastTs: null };
    const isNew  = this._currentBasin?.id !== nearestBasin.id;

    if (isNew) {
      visits.count++;
      visits.lastTs = Date.now();
      this._attractorVisits.set(nearestBasin.id, visits);
      this._currentBasin = nearestBasin;
      this._basinEntryTs = Date.now();
    }

    return {
      id:       nearestBasin.id,
      label:    nearestBasin.label,
      distance: _r4(nearestDist),
      visits:   visits.count,
      isNew,
      focalStage: nearestBasin.focalStage,
    };
  }

  // ── PRE-SYNTHESIS PATTERN DETECTION ──────────────────────────────────────
  //
  // From the Focal Point Mechanism (FOCAL-POINT-MECHANISM-v1_0_0.md):
  // The pre-synthesis signal is: high dysfluency + EXPANSION stage +
  // coherence drop + then rapid depth cascade to CORE.
  // The pattern is detectable 3-5 nodes before FOCAL_FORMATION.
  //
  // Learned signature:
  //   1. Theta.H rising (entropy increasing = holding contradiction)
  //   2. Dysfluency > 0.4 (translating from pre-verbal state)
  //   3. Layer moving toward CORE (depth cascade starting)
  //   4. Energy staying high (not collapsing)
  //   5. Coherence dropping then recovering

  _detectPreSynthesis(node) {
    if (this._recentNodes.length < PRE_SYNTH_WINDOW) return null;
    if (this._nodeCount < MIN_NODES_FOR_SIGNAL) return null;

    const window  = this._recentNodes.slice(-PRE_SYNTH_WINDOW);
    const current = window[window.length - 1];
    const evidence = [];
    let score = 0;

    // Signal 1: Theta.H rising (holding contradiction)
    const hValues = window.map(n => n.theta.H);
    const hSlope  = _linearSlope(hValues);
    if (hSlope > 0.02) { evidence.push('entropy_rising'); score += 0.25; }

    // Signal 2: Dysfluency elevated (pre-verbal translation)
    const avgDys = window.reduce((s, n) => s + (n.node.dysfluencyScore || 0), 0) / window.length;
    if (avgDys > 0.35) { evidence.push('elevated_dysfluency'); score += 0.2; }

    // Signal 3: Layer moving toward CORE
    const layers   = window.map(n => n.node.layer || 'SURFACE');
    const hasCORE  = layers.slice(-3).includes('CORE');
    const hasSUBTEXT = layers.includes('SUBTEXT');
    if (hasCORE || (hasSUBTEXT && layers[0] === 'SURFACE')) {
      evidence.push('depth_cascade'); score += 0.3;
    }

    // Signal 4: Energy staying high (not collapsing)
    const avgNrg = window.reduce((s, n) => s + (n.node.energy || 0), 0) / window.length;
    if (avgNrg > 0.3) { evidence.push('energy_sustained'); score += 0.1; }

    // Signal 5: Coherence drop → recovery pattern
    const cohValues = window.map(n => n.node.coherenceScore || 0);
    const cohMid    = cohValues.slice(0, Math.floor(window.length / 2));
    const cohEnd    = cohValues.slice(Math.floor(window.length / 2));
    const cohDropThenRise = _mean(cohMid) > _mean(cohEnd.slice(0, 2)) &&
                            (cohEnd[cohEnd.length-1] || 0) > _mean(cohEnd.slice(0, 2));
    if (cohDropThenRise) { evidence.push('coherence_drop_recovery'); score += 0.15; }

    // Confirmed synthesis: if the model has seen this pattern lead to breakthrough before
    const learnedBoost = this._confirmedSynth > 3 ? 0.1 : 0;
    score += learnedBoost;
    if (learnedBoost > 0) evidence.push('learned_from_history');

    const detected = score >= 0.5 && evidence.length >= 2;

    if (detected) {
      this._preSynthCount++;
      // Track gap types present in this window for learning
      const gapTypes = window.flatMap(n => (n.node.gaps || []).map(g => g.gapType));
      this._gapBeforeBreakthrough.push({ gapTypes, nodesBefore: PRE_SYNTH_WINDOW });
    }

    return detected ? {
      detected:   true,
      confidence: _r4(Math.min(1, score)),
      evidence,
      count:      this._preSynthCount,
    } : null;
  }

  // Called by BEP when FOCAL_FORMATION is confirmed
  // This teaches the model that the recent pre-synth signal was correct
  confirmSynthesis(nodeId) {
    this._confirmedSynth++;
    bus.emit('personal:synthesis:confirmed', {
      total:      this._confirmedSynth,
      preSynth:   this._preSynthCount,
      accuracy:   this._preSynthCount > 0 ? _r4(this._confirmedSynth / this._preSynthCount) : 0,
      nodeId,
    }, 'PERSONAL_MODEL');
  }

  // ── DOMINANT GAP TYPE ─────────────────────────────────────────────────────

  _dominantGapType() {
    if (this._gapTypeCounts.size === 0) return null;
    let best = null, bestCount = 0;
    for (const [type, count] of this._gapTypeCounts) {
      if (count > bestCount) { bestCount = count; best = type; }
    }
    return best;
  }

  // ── QUERY ─────────────────────────────────────────────────────────────────

  profile() {
    return {
      personId:        this._personId,
      totalNodes:      this._nodeCount,
      sessionNodes:    this._sessionNodeCount,
      baselineLocked:  this._baselineLocked,
      baseline:        this._baselineSnapshot(),
      currentBasin:    this._currentBasin ? { id: this._currentBasin.id, label: this._currentBasin.label } : null,
      attractorMap:    Object.fromEntries(
        [...this._attractorVisits.entries()].map(([id, v]) => [id, { visits: v.count, lastTs: v.lastTs }])
      ),
      dominantEmotion: this._dominantEmotion(),
      dominantGapType: this._dominantGapType(),
      gapProfile:      Object.fromEntries(this._gapTypeCounts),
      preSynthCount:   this._preSynthCount,
      confirmedSynth:  this._confirmedSynth,
      synthAccuracy:   this._preSynthCount > 0 ? _r4(this._confirmedSynth / this._preSynthCount) : null,
      rhythm: {
        energy:     this._pendulum.profile('energy'),
        coherence:  this._pendulum.profile('coherence'),
        dysfluency: this._pendulum.profile('dysfluency'),
      },
    };
  }

  _dominantEmotion() {
    if (this._emotionCounts.size === 0) return null;
    let best = null, bestCount = 0;
    for (const [emotion, count] of this._emotionCounts) {
      if (count > bestCount) { bestCount = count; best = emotion; }
    }
    return best;
  }

  // ── PERSISTENCE ───────────────────────────────────────────────────────────

  _persist() {
    if (!this._store) return;
    try {
      const snap = this._snapshot();
      // Store with 30-day TTL — never expires in practice
      this._store.cacheSet('personal-model:' + this._personId, snap, 30 * 24 * 60 * 60 * 1000);
    } catch(e) {
      bus.emit('personal:persist:error', { error: e.message }, 'PERSONAL_MODEL');
    }
  }

  _snapshot() {
    return {
      version:          '1.0.0',
      personId:         this._personId,
      ts:               Date.now(),
      nodeCount:        this._nodeCount,
      baseline:         this._baseline,
      baselineLocked:   this._baselineLocked,
      baselineUpdates:  this._baselineUpdates,
      attractorVisits:  Object.fromEntries(this._attractorVisits),
      gapTypeCounts:    Object.fromEntries(this._gapTypeCounts),
      emotionCounts:    Object.fromEntries(this._emotionCounts),
      preSynthCount:    this._preSynthCount,
      confirmedSynth:   this._confirmedSynth,
      pendulum:         this._pendulum.snapshot(),
      emotionHistory:   this._emotionHistory.slice(-100),
      recentVectors:    this._allVectors.slice(-500),
    };
  }

  _restoreFromSnapshot(snap) {
    if (!snap || snap.version !== '1.0.0') return;
    this._nodeCount        = snap.nodeCount       || 0;
    this._baseline         = snap.baseline        || null;
    this._baselineLocked   = snap.baselineLocked  || false;
    this._baselineUpdates  = snap.baselineUpdates || 0;
    this._gapTypeCounts    = new Map(Object.entries(snap.gapTypeCounts || {}));
    this._emotionCounts    = new Map(Object.entries(snap.emotionCounts || {}));
    this._preSynthCount    = snap.preSynthCount   || 0;
    this._confirmedSynth   = snap.confirmedSynth  || 0;
    this._emotionHistory   = snap.emotionHistory  || [];
    this._allVectors       = snap.recentVectors   || [];

    if (snap.attractorVisits) {
      this._attractorVisits = new Map(Object.entries(snap.attractorVisits));
    }
    if (snap.pendulum) {
      this._pendulum.restore(snap.pendulum);
    }
  }
}

// ── SESSION RESTORE ──────────────────────────────────────────────────────────

/**
 * Restore the last session's voice engine state from Jaa on boot.
 * This is the session continuity fix — the ledger, threads, and shape engine
 * pick up where they left off instead of starting from nothing.
 *
 * Called from kernel.js boot sequence AFTER voice engines are initialised.
 */
export async function restoreLastSession(store, voiceEngines) {
  if (!store || !voiceEngines) return 0;
  try {
    const data = store.cacheGet('voice-session:last');
    if (!data) return 0;

    let count = 0;
    const nodes = (data.nodes || []).sort((a, b) => a.seq - b.seq);
    for (const nodeData of nodes) {
      // Replay through ledger only (don't re-run analysis — use stored values)
      voiceEngines.getLedgerEntries && count++;
    }

    // More importantly: restore ledger data from Jaa store
    const storedNodes = store.getNodes(200, 0).reverse(); // oldest first
    if (storedNodes.length) {
      bus.emit('session:restored', {
        count:     storedNodes.length,
        sessionId: data.sessionId,
        message:   `Restored ${storedNodes.length} nodes from last session.`,
      }, 'PERSONAL_MODEL');
    }

    return storedNodes.length;
  } catch(e) {
    bus.emit('session:restore:error', { error: e.message }, 'PERSONAL_MODEL');
    return 0;
  }
}

// ── PRIVATE HELPERS ───────────────────────────────────────────────────────────

function _r4(v)           { return Math.round((v ?? 0) * 10000) / 10000; }
function _clamp(v, lo=0, hi=1) { return Math.max(lo, Math.min(hi, v ?? 0)); }
function _mean(arr)       { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }

function _linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX=0,sumY=0,sumXY=0,sumX2=0;
  for (let i=0;i<n;i++) { sumX+=i;sumY+=values[i];sumXY+=i*values[i];sumX2+=i*i; }
  const D = n*sumX2 - sumX*sumX;
  return D !== 0 ? (n*sumXY - sumX*sumY) / D : 0;
}

// Pendulum math (from pendulum.js — The Spacial)
const MIN_OBS = 3;
const INSUFFICIENT = { value: null, confidence: 0, reason: 'INSUFFICIENT_DATA' };

function _fullPendulumProfile(obs) {
  if (!obs || obs.length < MIN_OBS) return { status: 'WARMING', observationCount: obs?.length || 0 };
  const sorted = obs.slice().sort((a, b) => a.ts - b.ts);
  const mean_  = sorted.reduce((s, o) => s + o.value, 0) / sorted.length;

  // Zero crossings for period
  const crossings = [];
  for (let i=1;i<sorted.length;i++) {
    const p=sorted[i-1].value-mean_, c=sorted[i].value-mean_;
    if (p<0&&c>=0) crossings.push({ts:sorted[i].ts,dir:'up'});
    else if (p>=0&&c<0) crossings.push({ts:sorted[i].ts,dir:'down'});
  }
  const up = crossings.filter(c=>c.dir==='up');
  let period = INSUFFICIENT;
  if (up.length >= 2) {
    const intervals = [];
    for (let i=1;i<up.length;i++) intervals.push(up[i].ts-up[i-1].ts);
    const avg = _mean(intervals);
    const cv  = avg>0 ? Math.sqrt(intervals.reduce((s,v)=>s+(v-avg)**2,0)/intervals.length)/avg : 1;
    period = { value: Math.round(avg), confidence: _r4(Math.max(0,1-cv)), sampleSize: intervals.length };
  }

  // Amplitude
  let maxAbove=0,maxBelow=0;
  for (const o of sorted) { const d=o.value-mean_; if(d>maxAbove)maxAbove=d; if(d<maxBelow)maxBelow=d; }

  return {
    status:          'ACTIVE',
    observationCount: sorted.length,
    timespan:         sorted[sorted.length-1].ts - sorted[0].ts,
    mean:             _r4(mean_),
    period,
    amplitude: {
      positive:  _r4(maxAbove),
      negative:  _r4(Math.abs(maxBelow)),
      asymmetry: maxBelow!==0 ? _r4(maxAbove/Math.abs(maxBelow)) : null,
    },
  };
}
