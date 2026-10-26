/**
 * RHEON KERNEL — ENGINE: BEP (Behavior Pattern Engine)
 *
 * The BEP watches the accumulating ledger and detects second-order patterns.
 * It does not process individual nodes — it processes the shape of the session.
 *
 * Every N nodes (configurable), BEP runs a full pass and emits signals.
 * Signals are stored in Jaa and pushed to UI via bus.
 *
 * PATTERNS DETECTED:
 *
 *   CONVERGENCE      — multiple threads suddenly reference the same concept cluster.
 *                      Signal: synthesis is forming. The focal point is near.
 *
 *   RECURSION        — speaker returning to same attractor basin repeatedly.
 *                      Two sub-types: DEEPENING (productive) or STUCK (looping).
 *                      Distinction: coherence rising on each visit = deepening.
 *
 *   DEPTH_CASCADE    — SURFACE → SUBTEXT → CORE across consecutive nodes.
 *                      Signal: speaker is reaching something real.
 *
 *   GAP_VELOCITY     — gaps opening faster than they're closing (cognitive overload).
 *                      Signal: too much unresolved tension. May need grounding.
 *
 *   FOCAL_STAGE      — maps session state to the five Focal Point Mechanism stages:
 *                      EXPANSION, EDGE_DETECTION, TENSION_HOLDING, FOCAL_FORMATION, CONTRACTION
 *                      (From FOCAL-POINT-MECHANISM-v1_0_0.md — James Brooks)
 *
 *   EMERGENCE        — a concept appears with no ancestor in any prior thread.
 *                      Signal: genuinely new territory.
 *
 * §LAW: BEP is read-only. It observes. It never modifies nodes or threads.
 * §LAW: Every signal is timestamped, node-referenced, confidence-scored.
 * §LAW: Signals are stored in Jaa bep_signals table for long-term pattern archaeology.
 */

import { bus } from '../core/bus.js';
import { KernelEvents } from '../schema/kernel.schema.js';

// ── FOCAL POINT STAGES (from FOCAL-POINT-MECHANISM-v1_0_0.md) ────────────────
const FOCAL_STAGES = Object.freeze({
  EXPANSION:        'EXPANSION',        // holding multiple domains, pre-synthesis
  EDGE_DETECTION:   'EDGE_DETECTION',   // noticing where domains touch
  TENSION_HOLDING:  'TENSION_HOLDING',  // staying in multi-axis state
  FOCAL_FORMATION:  'FOCAL_FORMATION',  // intersection crystallising
  CONTRACTION:      'CONTRACTION',      // invariant named, made portable
});

const SIGNAL_TYPES = Object.freeze({
  CONVERGENCE:   'CONVERGENCE',
  RECURSION:     'RECURSION',
  DEPTH_CASCADE: 'DEPTH_CASCADE',
  GAP_VELOCITY:  'GAP_VELOCITY',
  FOCAL_STAGE:   'FOCAL_STAGE',
  EMERGENCE:     'EMERGENCE',
  SYNTHESIS:     'SYNTHESIS',
});

class BehaviorPatternEngine {
  constructor(store) {
    this._store          = store;
    this._runEvery       = 5;       // run BEP after every N new nodes
    this._nodesSinceRun  = 0;
    this._lastStage      = null;
    this._sessionStart   = Date.now();
    this._signals        = [];      // in-memory recent signals
  }

  // Called by kernel after every committed node
  onNode(node, sessionContext) {
    this._nodesSinceRun++;
    if (this._nodesSinceRun >= this._runEvery) {
      this._nodesSinceRun = 0;
      this._run(sessionContext);
    }
  }

  _run(ctx) {
    if (!ctx || !ctx.nodes || ctx.nodes.length < 3) return;

    const signals = [];

    signals.push(...this._detectDepthCascade(ctx));
    signals.push(...this._detectRecursion(ctx));
    signals.push(...this._detectConvergence(ctx));
    signals.push(...this._detectGapVelocity(ctx));
    signals.push(...this._detectEmergence(ctx));

    const stage = this._computeFocalStage(ctx, signals);
    if (stage !== this._lastStage) {
      const stageSignal = this._makeSignal(SIGNAL_TYPES.FOCAL_STAGE, {
        stage,
        prevStage:   this._lastStage,
        confidence:  0.7,
        nodeIds:     ctx.nodes.slice(-3).map(n => n.id),
        description: `Focal stage: ${stage}. ${this._stageDescription(stage)}`,
      });
      signals.push(stageSignal);
      this._lastStage = stage;
    }

    signals.forEach(sig => {
      this._signals.push(sig);
      if (this._signals.length > 100) this._signals.shift();
      if (this._store) this._store.insertBepSignal(sig, ctx.sessionId);
      bus.emit(KernelEvents.BEP_SIGNAL, sig, 'BEP');
    });

    if (stage) {
      bus.emit(KernelEvents.BEP_STAGE, { stage, confidence: 0.7 }, 'BEP');
    }
  }

  // ── PATTERN DETECTORS ─────────────────────────────────────────

  _detectDepthCascade(ctx) {
    const recent = ctx.nodes.slice(-5);
    if (recent.length < 3) return [];

    // Look for SURFACE → SUBTEXT → CORE sequence
    const layers = recent.map(n => n.layer || 'SURFACE');
    let cascade = false;
    for (let i = 0; i < layers.length - 2; i++) {
      if (layers[i] === 'SURFACE' && layers[i+1] === 'SUBTEXT' && layers[i+2] === 'CORE') {
        cascade = true; break;
      }
      // Also: any downward movement to CORE
      if (layers[i+1] === 'CORE' || layers[i+2] === 'CORE') cascade = true;
    }
    if (!cascade) return [];

    return [this._makeSignal(SIGNAL_TYPES.DEPTH_CASCADE, {
      confidence:  0.85,
      stage:       FOCAL_STAGES.FOCAL_FORMATION,
      nodeIds:     recent.slice(-3).map(n => n.id),
      description: 'Depth cascade detected: speaker is reaching CORE layer. High-signal moment.',
    })];
  }

  _detectRecursion(ctx) {
    if (!ctx.shape || !ctx.shape.attractors || ctx.shape.attractors.length === 0) return [];

    const topAttractor = ctx.shape.attractors[0];
    if (!topAttractor || topAttractor.visits < 3) return [];

    // Is the coherence rising on each visit? (deepening vs stuck)
    const attVisitNodes = ctx.nodes.filter(n => n.attractorId === topAttractor.id);
    if (attVisitNodes.length < 3) return [];

    const cohs = attVisitNodes.map(n => n.coherenceScore || 0);
    const rising = cohs[cohs.length - 1] > cohs[0] + 0.1;

    return [this._makeSignal(SIGNAL_TYPES.RECURSION, {
      confidence:   rising ? 0.75 : 0.65,
      stage:        rising ? FOCAL_STAGES.TENSION_HOLDING : FOCAL_STAGES.EXPANSION,
      nodeIds:      attVisitNodes.slice(-3).map(n => n.id),
      attractorId:  topAttractor.id,
      subtype:      rising ? 'DEEPENING' : 'STUCK',
      visits:       topAttractor.visits,
      description:  rising
        ? `Attractor revisited ${topAttractor.visits}x with rising coherence — productive deepening.`
        : `Attractor revisited ${topAttractor.visits}x, coherence flat — possible loop.`,
    })];
  }

  _detectConvergence(ctx) {
    if (!ctx.threads || ctx.threads.length < 2) return [];

    // Look for threads that recently referenced overlapping concept clusters
    // Proxy: threads whose last nodes have similar field vectors (distance < 0.25)
    const recentThreads = ctx.threads.filter(t => !t.closed).slice(-3);
    if (recentThreads.length < 2) return [];

    const lastNodes = recentThreads.map(t => {
      return ctx.nodes.find(n => n.id === t.lastNodeId);
    }).filter(Boolean);

    if (lastNodes.length < 2) return [];

    // Use shape distances from trajectory
    let convergent = false;
    const traj = ctx.shape?.trajectory || [];
    for (let i = 0; i < lastNodes.length - 1; i++) {
      const stepA = traj.find(s => s.entryId === lastNodes[i].id);
      const stepB = traj.find(s => s.entryId === lastNodes[i+1].id);
      if (stepA && stepB) {
        // Euclidean distance between vectors
        const dist = _vecDist(stepA.vector, stepB.vector);
        if (dist < 0.25) convergent = true;
      }
    }
    if (!convergent) return [];

    return [this._makeSignal(SIGNAL_TYPES.CONVERGENCE, {
      confidence:  0.8,
      stage:       FOCAL_STAGES.EDGE_DETECTION,
      nodeIds:     lastNodes.map(n => n.id),
      threadIds:   recentThreads.map(t => t.id),
      description: `${recentThreads.length} threads converging in field space. Synthesis may be forming.`,
    })];
  }

  _detectGapVelocity(ctx) {
    if (!ctx.gaps) return [];
    const velocity = ctx.gaps.velocity?.();
    if (!velocity) return [];
    if (!velocity.diverging) return [];

    return [this._makeSignal(SIGNAL_TYPES.GAP_VELOCITY, {
      confidence:  0.9,
      stage:       FOCAL_STAGES.EXPANSION,
      nodeIds:     ctx.nodes.slice(-2).map(n => n.id),
      open:        velocity.open,
      closed:      velocity.closed,
      description: `Gaps opening faster than closing (${velocity.open} open, ${velocity.closed} closed). Possible cognitive overload — or productive expansion.`,
    })];
  }

  _detectEmergence(ctx) {
    if (ctx.nodes.length < 5) return [];

    const recent = ctx.nodes.slice(-3);
    const historical = ctx.nodes.slice(0, -3);

    // Concept emergence proxy: words in recent nodes not appearing in any prior node
    const historicalWords = new Set(
      historical.flatMap(n => _sigTokens(n.text || ''))
    );
    const recentWords = recent.flatMap(n => _sigTokens(n.text || ''));
    const newWords = recentWords.filter(w => !historicalWords.has(w));
    const uniqueNew = [...new Set(newWords)];

    if (uniqueNew.length < 3) return [];

    return [this._makeSignal(SIGNAL_TYPES.EMERGENCE, {
      confidence:  0.6,
      stage:       FOCAL_STAGES.FOCAL_FORMATION,
      nodeIds:     recent.map(n => n.id),
      newConcepts: uniqueNew.slice(0, 8),
      description: `${uniqueNew.length} new concept(s) appeared with no ancestor: ${uniqueNew.slice(0,4).join(', ')}`,
    })];
  }

  // ── FOCAL STAGE COMPUTATION ───────────────────────────────────

  _computeFocalStage(ctx, recentSignals) {
    const nodes = ctx.nodes;
    if (nodes.length < 3) return FOCAL_STAGES.EXPANSION;

    const recent = nodes.slice(-5);
    const avgCoh = recent.reduce((s, n) => s + (n.coherenceScore || 0), 0) / recent.length;
    const avgDys = recent.reduce((s, n) => s + (n.dysfluencyScore || 0), 0) / recent.length;
    const layers = recent.map(n => n.layer || 'SURFACE');
    const hasCORE = layers.includes('CORE');
    const hasConvergence = recentSignals.some(s => s.type === SIGNAL_TYPES.CONVERGENCE);
    const hasCascade     = recentSignals.some(s => s.type === SIGNAL_TYPES.DEPTH_CASCADE);
    const threadCount    = ctx.threads?.filter(t => !t.closed).length || 0;

    // Stage heuristics (from Focal Point Mechanism doc)
    if (hasCORE && hasCascade) return FOCAL_STAGES.FOCAL_FORMATION;
    if (hasConvergence)        return FOCAL_STAGES.EDGE_DETECTION;
    if (avgCoh > 0.6 && avgDys < 0.3) return FOCAL_STAGES.TENSION_HOLDING;
    if (threadCount > 2)       return FOCAL_STAGES.EXPANSION;
    if (avgCoh > 0.7 && !hasCORE) return FOCAL_STAGES.CONTRACTION;
    return FOCAL_STAGES.EXPANSION;
  }

  _stageDescription(stage) {
    const desc = {
      EXPANSION:      'Holding multiple domains. Pre-synthesis. This feels like confusion — it is not confusion.',
      EDGE_DETECTION: 'Domains are touching at their edges. Maximum information density here.',
      TENSION_HOLDING:'Staying in multi-axis state. Do not collapse the tension prematurely.',
      FOCAL_FORMATION:'The intersection is crystallising. This arrives whole. Analysis comes after.',
      CONTRACTION:    'The invariant is being named and made portable. Synthesis complete.',
    };
    return desc[stage] || '';
  }

  // ── OUTPUT ────────────────────────────────────────────────────

  _makeSignal(type, data) {
    return {
      id:          crypto.randomUUID ? crypto.randomUUID() : _uid(),
      type,
      ts:          Date.now(),
      stage:       data.stage || null,
      confidence:  data.confidence || 0.5,
      nodeIds:     data.nodeIds || [],
      description: data.description || '',
      data,
    };
  }

  recentSignals(limit) {
    return this._signals.slice(-(limit || 20));
  }

  currentStage() { return this._lastStage || FOCAL_STAGES.EXPANSION; }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

const STOP = new Set(['the','and','for','are','but','not','you','all','can','was','had','with','that','this','have','from','they','been','some','than','then','when','your','into','about','after']);

function _sigTokens(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 3 && !STOP.has(w));
}

function _vecDist(va, vb) {
  if (!va || !vb) return 1;
  let sum = 0;
  for (let i = 0; i < Math.min(va.length, vb.length); i++) {
    const d = (va[i] || 0) - (vb[i] || 0);
    sum += d * d;
  }
  return Math.sqrt(sum) / Math.sqrt(va.length || 7);
}

function _uid() { return Math.random().toString(36).slice(2, 10); }

export { BehaviorPatternEngine, FOCAL_STAGES, SIGNAL_TYPES };
