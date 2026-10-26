/**
 * @module       trajectory-recorder
 * @uuid         f0a1b2c3-d4e5-4f60-7819-2a3b4c5d6e7f
 * @version      1.0.0
 *
 * Trajectory Recorder — captures a person's path through latent state space
 * during a session, then compresses it into an attractor map.
 *
 * ── THE IDEA ─────────────────────────────────────────────────────────────────
 *
 *   The latent model produces a 5D point estimate every frame. Over a session,
 *   these points trace a trajectory through state space. That trajectory has
 *   geometric structure:
 *
 *   ATTRACTORS — regions the trajectory returns to repeatedly and dwells in.
 *                These are the person's stable emotional states.
 *
 *   REPELLERS — regions the trajectory avoids or passes through only briefly.
 *               States this person doesn't inhabit.
 *
 *   TRANSITIONS — edges between attractor regions. Some are easy (low energy
 *                 barrier), some are rare (high energy, rarely crossed).
 *
 *   BIFURCATIONS — moments where a small stimulus caused a large state change.
 *                  The most information-rich events in the trajectory.
 *
 * ── ALGORITHM ─────────────────────────────────────────────────────────────────
 *
 *   1. SAMPLING: Record latent state every SAMPLE_INTERVAL frames.
 *               Don't record every frame — trajectory is too noisy.
 *               EMA-smooth before recording to capture true dwell patterns.
 *
 *   2. CLUSTERING: After session, cluster trajectory points using online
 *                  k-means (k=AUTO, determined by silhouette score).
 *                  Each cluster center = one attractor.
 *                  Cluster radius = attractor basin size (stability).
 *
 *   3. DWELL TIME: Per-cluster dwell time = how long trajectory spent there.
 *                  Heavy dwell → deep attractor (hard to leave).
 *                  Brief dwell → unstable state or transition.
 *
 *   4. TRANSITIONS: For each consecutive pair of cluster memberships,
 *                   record the transition edge. Frequency = edge weight.
 *                   Most-traveled edges = most common emotional transitions.
 *
 *   5. BIFURCATIONS: Detect when trajectory velocity (state-space speed)
 *                    spikes AND simultaneous suppression spike OR signal shift.
 *                    These are the moments worth understanding.
 *
 *   6. COMPRESSION: Output is a compact AttractorMap — typically 5-12 attractors,
 *                   O(k²) edges, O(B) bifurcations. ~1-4KB per session.
 *                   Stored in IndexedDB under person fingerprint.
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.latent.update         — 5D state every frame
 *     alk.latent.shift          — significant state transitions
 *     alk.suppression.event     — suppression level changes
 *     alk.signal.transition     — dominant behavioral state changes
 *     alk.session.capture.start — begin recording
 *     alk.session.capture.stop  — end recording → compress → emit map
 *
 *   Emits:
 *     alk.trajectory.sample     — each recorded sample (for live viz)
 *     alk.trajectory.bifurcation — detected bifurcation event
 *     alk.trajectory.complete   — session complete with full AttractorMap
 *     alk.trajectory.pulse      — §1.8 heartbeat
 */

'use strict';

export const TRAJ_UUID    = 'f0a1b2c3-d4e5-4f60-7819-2a3b4c5d6e7f';
export const TRAJ_VERSION = '1.9.0';

const SAMPLE_INTERVAL   = 10;  // record every N frames
const MAX_SAMPLES       = 600; // max 600 samples per session (~5 min at 30fps/10)
const K_MIN             = 3;   // minimum attractors to detect
const K_MAX             = 10;  // maximum attractors
const KMEANS_ITERS      = 50;  // k-means iterations
const BIFURC_VEL_THRESH = 0.08; // min state-space velocity for bifurcation
const BIFURC_SUPP_THRESH= 0.15; // min suppression change for bifurcation
const EMA_ALPHA         = 0.15; // smoothing before recording (slow EMA)

// ── Geometry helpers ──────────────────────────────────────────────────────────

function dist5(a, b) {
  let s = 0;
  for (let i = 0; i < 5; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

function centroid(points) {
  const c = new Array(5).fill(0);
  for (const p of points) for (let i = 0; i < 5; i++) c[i] += p[i];
  for (let i = 0; i < 5; i++) c[i] /= points.length;
  return c;
}

function cloneVec(v) { return [...v]; }

// ── Online k-means ────────────────────────────────────────────────────────────
// Deterministic: initialize centers using k-means++ strategy

function kmeanspp(points, k) {
  const centers = [cloneVec(points[Math.floor(points.length / 2)])];
  while (centers.length < k) {
    // Choose next center with probability proportional to min distance² to existing centers
    const dists = points.map(p => Math.min(...centers.map(c => dist5(p, c) ** 2)));
    const total  = dists.reduce((s, d) => s + d, 0);
    let r = total * 0.5; // deterministic: use midpoint not random
    let chosen = points[0];
    for (let i = 0; i < points.length; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = points[i]; break; }
    }
    centers.push(cloneVec(chosen));
  }
  return centers;
}

function kmeans(points, k) {
  if (points.length < k) k = Math.max(1, points.length);
  let centers = kmeanspp(points, k);
  let assignments = new Array(points.length).fill(0);

  for (let iter = 0; iter < KMEANS_ITERS; iter++) {
    // Assign
    let changed = false;
    for (let i = 0; i < points.length; i++) {
      let best = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = dist5(points[i], centers[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // Update centers
    const newCenters = Array.from({length: k}, () => new Array(5).fill(0));
    const counts     = new Array(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i];
      for (let d = 0; d < 5; d++) newCenters[c][d] += points[i][d];
      counts[c]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        for (let d = 0; d < 5; d++) newCenters[j][d] /= counts[j];
        centers[j] = newCenters[j];
      }
    }
  }

  return { centers, assignments };
}

// ── Silhouette score (choose best k) ─────────────────────────────────────────
// Simplified: intra-cluster cohesion vs inter-cluster separation

function silhouette(points, centers, assignments, k) {
  if (k === 1) return 0;
  let totalS = 0;
  for (let i = 0; i < points.length; i++) {
    const ci = assignments[i];
    // a: mean distance to same-cluster points
    const sameCluster = points.filter((_, j) => assignments[j] === ci);
    const a = sameCluster.length > 1
      ? sameCluster.reduce((s, p) => s + dist5(points[i], p), 0) / (sameCluster.length - 1)
      : 0;
    // b: min mean distance to any other cluster
    let b = Infinity;
    for (let j = 0; j < k; j++) {
      if (j === ci) continue;
      const otherCluster = points.filter((_, idx) => assignments[idx] === j);
      if (!otherCluster.length) continue;
      const bj = otherCluster.reduce((s, p) => s + dist5(points[i], p), 0) / otherCluster.length;
      if (bj < b) b = bj;
    }
    const s = b === Infinity ? 0 : (b - a) / Math.max(a, b);
    totalS += s;
  }
  return totalS / points.length;
}

// ── Trajectory Recorder ───────────────────────────────────────────────────────

export class TrajectoryRecorder {
  /**
   * @param {object} opts
   * @param {object} opts.bus
   * @param {string} [opts.sessionId]
   */
  constructor({ bus, sessionId = null } = {}) {
    this._bus       = bus;
    this._sessionId = sessionId;
    this._recording = false;
    this._frame     = 0;

    // Trajectory state
    this._samples      = [];  // [{ vec: [5], frame, ts, suppression, dominant }]
    this._smoothed     = [0, 0, 0, 0, 0];  // EMA-smoothed current state
    this._prevSmoothed = [0, 0, 0, 0, 0];
    this._prevSupp     = 0;
    this._bifurcations = [];  // detected bifurcation events

    // Contextual annotations for samples
    this._currentSuppression = 0;
    this._currentDominant    = null;
    this._currentSuppLevel   = 'AUTHENTIC';

    // Session metadata
    this._sessionStart = null;
    this._sessionEnd   = null;

    this.stats = {
      samplesRecorded:   0,
      bifurcations:      0,
      sessionDurationMs: 0,
    };

    if (bus) this._bindBus();
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;
    b.on('alk.session.capture.start', ev => this._onSessionStart(ev));
    b.on('alk.session.capture.stop',  ev => this._onSessionStop(ev));
    b.on('alk.latent.update',         ev => this._onLatent(ev));
    b.on('alk.latent.shift',          ev => this._onShift(ev));
    b.on('alk.suppression.update',    ev => this._onSuppression(ev));
    b.on('alk.signal.transition',     ev => this._onSignalTransition(ev));
    b.on('alk.video.frame.analyzed',  ev => { this._frame = (ev.payload ?? ev).frameIndex ?? this._frame + 1; });
  }

  _onSessionStart(ev) {
    const p = ev.payload ?? ev;
    this._sessionId    = p.sessionId ?? this._sessionId;
    this._recording    = true;
    this._sessionStart = Date.now();
    this._samples      = [];
    this._bifurcations = [];
    this._smoothed.fill(0);
    this.stats.samplesRecorded = 0;
    this.stats.bifurcations = 0;
  }

  _onSessionStop(ev) {
    if (!this._recording) return;
    this._recording    = false;
    this._sessionEnd   = Date.now();
    this.stats.sessionDurationMs = this._sessionEnd - (this._sessionStart ?? this._sessionEnd);
    this._compress();
  }

  _onLatent(ev) {
    if (!this._recording) return;
    const p = ev.payload ?? ev;
    if (!p.valence && p.valence !== 0) return;

    // EMA smooth — captures dwell, not noise
    const vec = [p.valence, p.arousal, p.suppression, p.coherence, p.engagement];
    for (let i = 0; i < 5; i++) {
      this._smoothed[i] = this._smoothed[i] * (1 - EMA_ALPHA) + vec[i] * EMA_ALPHA;
    }

    // Sample every N frames
    if (this._frame % SAMPLE_INTERVAL !== 0) return;
    if (this._samples.length >= MAX_SAMPLES) {
      // Reservoir sampling: replace random early sample
      const idx = Math.floor(this._samples.length * 0.3 + Math.random() * this._samples.length * 0.3);
      this._samples[idx] = this._makeSample();
    } else {
      this._samples.push(this._makeSample());
    }
    this.stats.samplesRecorded++;

    // State-space velocity
    const velocity = dist5(this._smoothed, this._prevSmoothed);
    const suppDelta = Math.abs(this._currentSuppression - this._prevSupp);

    // Bifurcation: high velocity + suppression spike OR large shift
    if (velocity > BIFURC_VEL_THRESH && suppDelta > BIFURC_SUPP_THRESH) {
      this._recordBifurcation(velocity, suppDelta);
    }

    this._prevSmoothed = cloneVec(this._smoothed);
    this._prevSupp     = this._currentSuppression;

    this._emit('alk.trajectory.sample', {
      vec:        cloneVec(this._smoothed),
      frame:      this._frame,
      velocity,
      suppression: this._currentSuppression,
      dominant:   this._currentDominant,
    });

    // §1.8 pulse
    if (this._samples.length % 30 === 0) {
      this._emit('alk.trajectory.pulse', {
        samples:      this._samples.length,
        bifurcations: this._bifurcations.length,
        sessionMs:    Date.now() - (this._sessionStart ?? Date.now()),
      });
    }
  }

  _onShift(ev) {
    const p = ev.payload ?? ev;
    if (!p.shifts?.length) return;
    // Large shifts are bifurcation candidates
    for (const shift of p.shifts) {
      if (Math.abs(shift.delta) > BIFURC_VEL_THRESH * 1.5) {
        this._recordBifurcation(Math.abs(shift.delta), this._currentSuppression, shift);
      }
    }
  }

  _onSuppression(ev) {
    const p = ev.payload ?? ev;
    this._currentSuppression = p.suppressionScore ?? 0;
    this._currentSuppLevel   = p.level ?? 'AUTHENTIC';
  }

  _onSignalTransition(ev) {
    const p = ev.payload ?? ev;
    this._currentDominant = p.to ?? null;
  }

  // ── Sample + bifurcation recording ────────────────────────────────────────

  _makeSample() {
    return {
      vec:        cloneVec(this._smoothed),
      frame:      this._frame,
      ts:         Date.now(),
      suppression: this._currentSuppression,
      suppLevel:  this._currentSuppLevel,
      dominant:   this._currentDominant,
    };
  }

  _recordBifurcation(velocity, suppDelta, shift = null) {
    const bif = {
      frame:      this._frame,
      ts:         Date.now(),
      vec:        cloneVec(this._smoothed),
      velocity:   r4(velocity),
      suppDelta:  r4(suppDelta),
      shift:      shift ?? null,
      suppLevel:  this._currentSuppLevel,
      dominant:   this._currentDominant,
      sessionMs:  Date.now() - (this._sessionStart ?? Date.now()),
    };
    this._bifurcations.push(bif);
    this.stats.bifurcations++;
    this._emit('alk.trajectory.bifurcation', bif);
  }

  // ── Compression: trajectory → AttractorMap ────────────────────────────────

  _compress() {
    if (this._samples.length < K_MIN) {
      this._emit('alk.trajectory.complete', {
        sessionId:    this._sessionId,
        insufficient: true,
        samples:      this._samples.length,
        message:      `Need ≥${K_MIN} samples, got ${this._samples.length}`,
      });
      return;
    }

    const points = this._samples.map(s => s.vec);

    // Find best k via silhouette score
    let bestK = K_MIN, bestScore = -Infinity, bestResult = null;
    const kRange = Math.min(K_MAX, Math.floor(points.length / 3));
    for (let k = K_MIN; k <= kRange; k++) {
      const result = kmeans(points, k);
      const score  = silhouette(points, result.centers, result.assignments, k);
      if (score > bestScore) { bestScore = score; bestK = k; bestResult = result; }
    }

    const { centers, assignments } = bestResult ?? kmeans(points, K_MIN);
    const k = centers.length;

    // Build attractors
    const attractors = centers.map((center, ci) => {
      const memberSamples = this._samples.filter((_, i) => assignments[i] === ci);
      const memberPoints  = points.filter((_, i) => assignments[i] === ci);

      // Basin radius: mean distance from center to members
      const radius = memberPoints.length > 0
        ? memberPoints.reduce((s, p) => s + dist5(p, center), 0) / memberPoints.length
        : 0;

      // Dwell: fraction of total samples in this cluster
      const dwellFraction = memberSamples.length / this._samples.length;

      // Suppression profile: mean + peak suppression while in this attractor
      const suppValues   = memberSamples.map(s => s.suppression);
      const suppMean     = suppValues.reduce((a,b) => a+b, 0) / (suppValues.length || 1);
      const suppPeak     = Math.max(...suppValues, 0);

      // Dominant signal while in this attractor
      const dominantCounts = {};
      for (const s of memberSamples) {
        if (s.dominant) dominantCounts[s.dominant] = (dominantCounts[s.dominant] ?? 0) + 1;
      }
      const dominantSignal = Object.entries(dominantCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? null;

      // Label from center position
      const label = this._labelAttractor(center);

      return {
        id:           `att-${ci}`,
        center:       center.map(r4),
        radius:       r4(radius),
        dwellFraction: r4(dwellFraction),
        sampleCount:  memberSamples.length,
        suppMean:     r4(suppMean),
        suppPeak:     r4(suppPeak),
        dominantSignal,
        label,
        // Stability: inverse of intra-cluster variance
        stability:    r4(Math.max(0, 1 - radius * 2)),
      };
    });

    // Build transition edges
    const edges = new Map(); // `ci→cj` → { count, suppMeanOnTransition }
    for (let i = 1; i < assignments.length; i++) {
      const from = assignments[i-1], to = assignments[i];
      if (from === to) continue;
      const key = `${from}→${to}`;
      if (!edges.has(key)) edges.set(key, { from, to, count: 0, suppSum: 0 });
      const e = edges.get(key);
      e.count++;
      e.suppSum += this._samples[i].suppression;
    }
    const transitionEdges = [...edges.values()].map(e => ({
      from:     `att-${e.from}`,
      to:       `att-${e.to}`,
      frequency: r4(e.count / this._samples.length),
      suppMean: r4(e.suppSum / e.count),
    })).sort((a,b) => b.frequency - a.frequency);

    // Resting state: highest-dwell attractor
    const restingAttractor = attractors.reduce((best, a) =>
      a.dwellFraction > best.dwellFraction ? a : best, attractors[0]);

    // Compile AttractorMap
    const map = {
      sessionId:     this._sessionId,
      version:       TRAJ_VERSION,
      ts:            Date.now(),
      durationMs:    this.stats.sessionDurationMs,
      sampleCount:   this._samples.length,
      k:             k,
      silhouette:    r4(bestScore),
      attractors,
      transitionEdges,
      bifurcations:  this._bifurcations,
      restingState:  restingAttractor.center,
      restingLabel:  restingAttractor.label,
      // Session-level statistics
      valenceRange:  this._dimRange(points, 0),
      arousalRange:  this._dimRange(points, 1),
      suppRange:     this._dimRange(points, 2),
      engagementRange: this._dimRange(points, 4),
      suppressionProfile: {
        mean: r4(this._samples.reduce((s,x) => s+x.suppression, 0) / this._samples.length),
        peak: r4(Math.max(...this._samples.map(s => s.suppression))),
        highFraction: r4(this._samples.filter(s => s.suppression > 0.6).length / this._samples.length),
      },
    };

    this.stats.sessionDurationMs = this.stats.sessionDurationMs;
    this._emit('alk.trajectory.complete', map);
    return map;
  }

  _dimRange(points, dim) {
    const vals = points.map(p => p[dim]);
    return { min: r4(Math.min(...vals)), max: r4(Math.max(...vals)), range: r4(Math.max(...vals) - Math.min(...vals)) };
  }

  _labelAttractor(center) {
    // [valence, arousal, suppression, coherence, engagement]
    const [v, a, s, c, e] = center;
    const parts = [];
    if (v > 0.3)        parts.push('positive');
    else if (v < -0.3)  parts.push('negative');
    else                parts.push('neutral');
    if (a > 0.6)        parts.push('activated');
    else if (a < 0.3)   parts.push('calm');
    if (s > 0.5)        parts.push('suppressed');
    if (c < 0.35)       parts.push('fragmented');
    if (e > 0.4)        parts.push('approach');
    else if (e < -0.4)  parts.push('withdrawn');
    return parts.join('/') || 'neutral';
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Force end-of-session compression (call if bus stop event not fired) */
  finalize() { this._onSessionStop({}); }

  get samples()      { return this._samples; }
  get bifurcations() { return this._bifurcations; }
  get isRecording()  { return this._recording; }

  _emit(event, data) { try { this._bus?.emit(event, data); } catch (_) {} }

  health() {
    return {
      status:    this._recording ? 'RECORDING' : 'IDLE',
      uuid:      TRAJ_UUID,
      version:   TRAJ_VERSION,
      samples:   this._samples.length,
      bifurcations: this._bifurcations.length,
      sessionMs: Date.now() - (this._sessionStart ?? Date.now()),
      stats:     { ...this.stats },
    };
  }
}

function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
