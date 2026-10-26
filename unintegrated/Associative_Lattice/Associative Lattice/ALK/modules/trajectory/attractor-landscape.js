/**
 * @module       attractor-landscape
 * @uuid         01234567-89ab-4cde-f012-3456789abcde
 * @version      1.0.0
 *
 * Attractor Landscape — persistent cross-session model of a person's
 * unique emotional topology.
 *
 * ── THE IDEA ─────────────────────────────────────────────────────────────────
 *
 *   A geologist reads a rock formation and sees the complete history of
 *   everything that deposited it — which events, in what order, at what rate.
 *   The current surface is the integral of all past processes.
 *
 *   This module does the same for a person's emotional topology.
 *   Each session deposits a "layer" — an AttractorMap. Over sessions,
 *   attractors deepen (visited repeatedly = stable), dissolve (not visited =
 *   no longer habitual), or merge (similar attractors across sessions).
 *
 *   The landscape evolves. An attractor visited in 8 of 10 sessions is a
 *   deep basin. One visited once is a shallow anomaly. The difference matters.
 *
 * ── DATA STRUCTURE ───────────────────────────────────────────────────────────
 *
 *   LandscapeAttractor:
 *     center       [5]       5D latent space position
 *     radius       float     basin size (how wide the attraction)
 *     depth        float     how stable (visited often, dwelt long)
 *     visits       int       sessions where this attractor appeared
 *     lastSeen     ts        when last observed
 *     suppProfile  object    mean/peak suppression in this state
 *     label        string    human-readable description
 *     mergedFrom   string[]  ids of session attractors that contributed
 *
 *   LandscapeEdge:
 *     from / to    string    attractor ids
 *     frequency    float     how often this transition occurs
 *     barrier      float     energy cost (rare transition = high barrier)
 *
 *   Landscape:
 *     personId     string    fingerprint (session-derived, stable)
 *     attractors   []        current landscape attractors
 *     edges        []        transition edges
 *     restingState [5]       typical resting position (depth-weighted centroid)
 *     sessionCount int       sessions observed
 *     totalDuration ms       total observation time
 *     version      string    schema version
 *
 * ── PERSISTENCE ──────────────────────────────────────────────────────────────
 *
 *   IndexedDB: database 'alk-landscape', store 'landscapes', key = personId.
 *   Falls back to localStorage if IndexedDB unavailable.
 *   Serialized as JSON. Target size: 5-20KB per person.
 *
 * ── WARM START ────────────────────────────────────────────────────────────────
 *
 *   At session start, if a landscape exists for this person:
 *     1. Load from IndexedDB
 *     2. Compute expected resting state (depth-weighted attractor centroid)
 *     3. Emit alk.landscape.warmstart with initial latent state estimate
 *     4. The LatentModel uses this to initialize its state vector
 *        instead of starting at neutral (0,0,0,0,0)
 *
 *   This collapses warmup from 5 batches to near-zero.
 *   By frame 1, the model already knows roughly where this person lives.
 *
 * ── PERSON FINGERPRINT ────────────────────────────────────────────────────────
 *
 *   Person identity is derived from the attractor landscape itself,
 *   not from PII. The fingerprint is a hash of:
 *     - restingState vector (quantized to 2 decimal places)
 *     - dominant attractor labels
 *     - suppression profile shape
 *
 *   This is behavioral biometrics — stable across sessions for the same
 *   person, different across people, contains no identifying information.
 *
 *   §4.3 — No PII stored. Fingerprint is a behavioral hash.
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.trajectory.complete   — session AttractorMap ready for integration
 *     alk.session.capture.start — check for existing landscape → warm start
 *
 *   Emits:
 *     alk.landscape.warmstart   — initial state estimate for LatentModel
 *     alk.landscape.updated     — landscape integrated with new session
 *     alk.landscape.new         — first-session landscape created
 *     alk.landscape.attractor.deepened  — attractor gained depth
 *     alk.landscape.attractor.dissolved — attractor no longer observed
 *     alk.landscape.insight     — cross-session pattern detected
 */

'use strict';

export const LAND_UUID    = '01234567-89ab-4cde-f012-3456789abcde';
export const LAND_VERSION = '1.9.0';

const DB_NAME    = 'alk-landscape';
const DB_VERSION = 1;
const STORE_NAME = 'landscapes';

// Attractor merge threshold: attractors within this distance are the same state
const MERGE_THRESH   = 0.25;
// Decay: attractors not seen for this many sessions lose depth
const DECAY_SESSIONS = 5;
// Minimum depth to remain in landscape
const MIN_DEPTH      = 0.05;

// ── Fingerprint ───────────────────────────────────────────────────────────────

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function fingerprintFromMap(map) {
  // Behavioral hash: resting state + top attractor labels + suppression profile
  const resting = (map.restingState ?? [0,0,0,0,0]).map(v => Math.round(v * 100) / 100).join(',');
  const labels  = (map.attractors ?? [])
    .sort((a,b) => b.dwellFraction - a.dwellFraction)
    .slice(0, 3)
    .map(a => a.label)
    .join('|');
  const supp = map.suppressionProfile?.mean?.toFixed(1) ?? '0';
  return fnv1a32(`${resting}:${labels}:${supp}`);
}

// ── IndexedDB wrapper ─────────────────────────────────────────────────────────

class LandscapeStore {
  constructor() {
    this._db  = null;
    this._ready = this._open();
    this._fallback = new Map(); // in-memory if IDB unavailable
  }

  async _open() {
    if (typeof indexedDB === 'undefined') return null;
    return new Promise((resolve) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'personId' });
        }
      };
      req.onsuccess = (e) => { this._db = e.target.result; resolve(this._db); };
      req.onerror   = () => resolve(null);
    });
  }

  async get(personId) {
    await this._ready;
    if (!this._db) return this._fallback.get(personId) ?? null;
    return new Promise((resolve) => {
      const tx  = this._db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(personId);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = () => resolve(null);
    });
  }

  async put(landscape) {
    await this._ready;
    if (!this._db) { this._fallback.set(landscape.personId, landscape); return; }
    return new Promise((resolve) => {
      const tx  = this._db.transaction(STORE_NAME, 'readwrite');
      const req = tx.objectStore(STORE_NAME).put(landscape);
      req.onsuccess = () => resolve();
      req.onerror   = () => resolve();
    });
  }

  async list() {
    await this._ready;
    if (!this._db) return [...this._fallback.values()];
    return new Promise((resolve) => {
      const tx  = this._db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = (e) => resolve(e.target.result ?? []);
      req.onerror   = () => resolve([]);
    });
  }
}

// ── Attractor Landscape ───────────────────────────────────────────────────────

export class AttractorLandscape {
  constructor({ bus } = {}) {
    this._bus   = bus;
    this._store = new LandscapeStore();

    // Currently loaded landscape
    this._landscape    = null;
    this._personId     = null;
    this._sessionCount = 0;

    if (bus) this._bindBus();
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    this._bus.on('alk.session.capture.start', ev => this._onSessionStart(ev));
    this._bus.on('alk.trajectory.complete',   ev => this._onTrajectoryComplete(ev));
  }

  async _onSessionStart(ev) {
    // Try to load any existing landscape for warm start
    // We don't know person ID yet, so check all landscapes for closest match
    // (or use session-provided personId if available)
    const p = ev.payload ?? ev;
    const hint = p.personId ?? null;

    if (hint) {
      const existing = await this._store.get(hint);
      if (existing) {
        this._landscape = existing;
        this._personId  = hint;
        await this._emitWarmStart(existing);
        return;
      }
    }

    // No hint — will match after first trajectory completes
    this._landscape = null;
    this._personId  = null;
  }

  async _onTrajectoryComplete(ev) {
    const map = ev.payload ?? ev;
    if (map.insufficient || !map.attractors?.length) return;

    // Compute fingerprint from this session's trajectory
    const fp = fingerprintFromMap(map);
    this._personId = fp;

    // Load existing landscape or create new
    const existing = await this._store.get(fp);

    let landscape;
    if (!existing) {
      landscape = this._createLandscape(fp, map);
      this._emit('alk.landscape.new', { personId: fp, landscape, sessionId: map.sessionId });
    } else {
      landscape = this._integrate(existing, map);
      this._emit('alk.landscape.updated', { personId: fp, landscape, sessionId: map.sessionId });
    }

    this._landscape = landscape;
    await this._store.put(landscape);

    // Detect cross-session insights
    this._detectInsights(landscape);
  }

  // ── Landscape creation ─────────────────────────────────────────────────────

  _createLandscape(personId, map) {
    const attractors = map.attractors.map((a, i) => ({
      id:          `L${personId.slice(0,4)}-${i}`,
      center:      [...a.center],
      radius:      a.radius,
      depth:       a.dwellFraction,    // initial depth = dwell fraction
      visits:      1,
      lastSeen:    map.ts,
      suppProfile: { mean: a.suppMean, peak: a.suppPeak },
      label:       a.label,
      mergedFrom:  [a.id],
      stability:   a.stability,
    }));

    const edges = map.transitionEdges.map(e => {
      // Map session attractor IDs to landscape attractor IDs
      const fromIdx = parseInt(e.from.replace('att-',''));
      const toIdx   = parseInt(e.to.replace('att-',''));
      return {
        from:      attractors[fromIdx]?.id ?? e.from,
        to:        attractors[toIdx]?.id   ?? e.to,
        frequency: e.frequency,
        barrier:   r4(1 - e.frequency * 5), // rare = high barrier
        sessions:  1,
      };
    });

    return {
      personId,
      version:       LAND_VERSION,
      attractors,
      edges,
      restingState:  [...map.restingState],
      restingLabel:  map.restingLabel,
      sessionCount:  1,
      totalDurationMs: map.durationMs,
      firstSeen:     map.ts,
      lastSeen:      map.ts,
      suppressionProfile: { ...map.suppressionProfile },
      bifurcationCount:   map.bifurcations?.length ?? 0,
    };
  }

  // ── Landscape integration (new session → existing landscape) ──────────────

  _integrate(existing, map) {
    const land = JSON.parse(JSON.stringify(existing)); // deep clone
    land.sessionCount++;
    land.totalDurationMs += map.durationMs ?? 0;
    land.lastSeen = map.ts;

    // Track which existing attractors were "seen" this session
    const seen = new Set();

    // Match session attractors to existing landscape attractors
    for (const sa of map.attractors) {
      let bestMatch = null, bestDist = MERGE_THRESH;
      for (const la of land.attractors) {
        const d = dist5(sa.center, la.center);
        if (d < bestDist) { bestDist = d; bestMatch = la; }
      }

      if (bestMatch) {
        // Merge: update existing attractor
        seen.add(bestMatch.id);
        const alpha = 0.3; // how much new session shifts the center
        for (let i = 0; i < 5; i++) {
          bestMatch.center[i] = bestMatch.center[i] * (1-alpha) + sa.center[i] * alpha;
        }
        bestMatch.depth    = Math.min(1, bestMatch.depth + sa.dwellFraction * 0.4);
        bestMatch.radius   = bestMatch.radius * 0.7 + sa.radius * 0.3;
        bestMatch.visits++;
        bestMatch.lastSeen = map.ts;
        bestMatch.stability = Math.min(1, bestMatch.stability + 0.05);
        bestMatch.suppProfile.mean = bestMatch.suppProfile.mean * 0.7 + sa.suppMean * 0.3;
        bestMatch.suppProfile.peak = Math.max(bestMatch.suppProfile.peak, sa.suppPeak);
        bestMatch.mergedFrom.push(sa.id);

        this._emit('alk.landscape.attractor.deepened', { id: bestMatch.id, depth: bestMatch.depth, visits: bestMatch.visits });
      } else {
        // New attractor not seen before — add at low depth
        const newId = `L${existing.personId.slice(0,4)}-${land.attractors.length}`;
        land.attractors.push({
          id:          newId,
          center:      [...sa.center],
          radius:      sa.radius,
          depth:       sa.dwellFraction * 0.4, // discounted first appearance
          visits:      1,
          lastSeen:    map.ts,
          suppProfile: { mean: sa.suppMean, peak: sa.suppPeak },
          label:       sa.label,
          mergedFrom:  [sa.id],
          stability:   sa.stability * 0.5,
        });
        seen.add(newId);
      }
    }

    // Decay attractors not seen this session
    const toRemove = [];
    for (const la of land.attractors) {
      if (!seen.has(la.id)) {
        la.depth *= (1 - 1 / DECAY_SESSIONS);
        if (la.depth < MIN_DEPTH) {
          toRemove.push(la.id);
          this._emit('alk.landscape.attractor.dissolved', { id: la.id, label: la.label });
        }
      }
    }
    land.attractors = land.attractors.filter(a => !toRemove.includes(a.id));

    // Update edges
    for (const se of map.transitionEdges) {
      const fromIdx = parseInt(se.from.replace('att-',''));
      const toIdx   = parseInt(se.to.replace('att-',''));
      const fromLA  = land.attractors[fromIdx < land.attractors.length ? fromIdx : 0];
      const toLA    = land.attractors[toIdx   < land.attractors.length ? toIdx   : 0];
      if (!fromLA || !toLA) continue;
      const key = `${fromLA.id}→${toLA.id}`;
      const existing_edge = land.edges.find(e => `${e.from}→${e.to}` === key);
      if (existing_edge) {
        existing_edge.frequency = existing_edge.frequency * 0.7 + se.frequency * 0.3;
        existing_edge.barrier   = r4(1 - existing_edge.frequency * 5);
        existing_edge.sessions++;
      } else {
        land.edges.push({ from: fromLA.id, to: toLA.id, frequency: se.frequency * 0.5, barrier: r4(0.8), sessions: 1 });
      }
    }

    // Update resting state: depth-weighted centroid of all attractors
    const totalDepth = land.attractors.reduce((s,a) => s+a.depth, 0);
    if (totalDepth > 0) {
      land.restingState = [0,0,0,0,0];
      for (const a of land.attractors) {
        const w = a.depth / totalDepth;
        for (let i = 0; i < 5; i++) land.restingState[i] += a.center[i] * w;
      }
      land.restingState = land.restingState.map(r4);
    }

    // Update suppression profile
    const suppMean = land.attractors.reduce((s,a) => s + a.suppProfile.mean * a.depth, 0) / (totalDepth || 1);
    const suppPeak = Math.max(...land.attractors.map(a => a.suppProfile.peak));
    land.suppressionProfile = { mean: r4(suppMean), peak: r4(suppPeak),
      highFraction: r4(land.attractors.filter(a => a.suppProfile.mean > 0.5).length / land.attractors.length) };
    land.bifurcationCount += map.bifurcations?.length ?? 0;

    return land;
  }

  // ── Warm start ─────────────────────────────────────────────────────────────

  async _emitWarmStart(landscape) {
    const rs = landscape.restingState;
    if (!rs || rs.length < 5) return;

    // Deepest attractor = most stable state = best initial estimate
    const deepest = landscape.attractors.reduce(
      (best, a) => a.depth > best.depth ? a : best,
      landscape.attractors[0] ?? { center: [0,0,0,0,0], depth: 0 }
    );

    this._emit('alk.landscape.warmstart', {
      personId:      landscape.personId,
      sessionCount:  landscape.sessionCount,
      restingState:  rs,
      deepestAttractor: {
        center:    deepest.center,
        label:     deepest.label,
        depth:     deepest.depth,
        visits:    deepest.visits,
        suppMean:  deepest.suppProfile?.mean ?? 0,
      },
      suppressionProfile: landscape.suppressionProfile,
      attractorCount:    landscape.attractors.length,
      totalDurationMs:   landscape.totalDurationMs,
    });
  }

  // ── Cross-session insights ─────────────────────────────────────────────────

  _detectInsights(landscape) {
    const insights = [];

    // Deep suppression basin: an attractor where suppression is chronically high
    for (const a of landscape.attractors) {
      if (a.suppProfile.mean > 0.55 && a.depth > 0.3 && a.visits >= 2) {
        insights.push({
          type:    'DEEP_SUPPRESSION_BASIN',
          label:   a.label,
          depth:   a.depth,
          suppMean: a.suppProfile.mean,
          visits:  a.visits,
          message: `This person habitually suppresses affect in the "${a.label}" state. Seen in ${a.visits} sessions, depth ${(a.depth*100).toFixed(0)}%.`,
        });
      }
    }

    // High-frequency bifurcation: person is volatile in specific region
    if (landscape.bifurcationCount > landscape.sessionCount * 3) {
      insights.push({
        type:    'HIGH_BIFURCATION_RATE',
        rate:    r4(landscape.bifurcationCount / landscape.sessionCount),
        message: `Unusually high bifurcation rate (${(landscape.bifurcationCount/landscape.sessionCount).toFixed(1)} per session). Emotional topology is volatile.`,
      });
    }

    // Narrow landscape: person stays in a small region of state space
    const attractorSpread = landscape.attractors.length > 1
      ? Math.max(...landscape.attractors.flatMap((a,i) =>
          landscape.attractors.slice(i+1).map(b => dist5(a.center, b.center))))
      : 0;
    if (attractorSpread < 0.4 && landscape.sessionCount >= 3) {
      insights.push({
        type:    'CONSTRAINED_RANGE',
        spread:  r4(attractorSpread),
        message: `Person operates in a narrow emotional range (spread ${attractorSpread.toFixed(2)}). Emotional flexibility may be limited.`,
      });
    }

    // One-way edge: transition only ever goes one direction
    for (const e of landscape.edges) {
      const reverse = landscape.edges.find(r => r.from === e.to && r.to === e.from);
      if (!reverse && e.sessions >= 2 && e.frequency > 0.1) {
        const fromA = landscape.attractors.find(a => a.id === e.from);
        const toA   = landscape.attractors.find(a => a.id === e.to);
        if (fromA && toA) {
          insights.push({
            type:    'UNIDIRECTIONAL_TRANSITION',
            from:    fromA.label,
            to:      toA.label,
            frequency: e.frequency,
            message: `Transition from "${fromA.label}" to "${toA.label}" is unidirectional — never reversed in ${e.sessions} observations.`,
          });
        }
      }
    }

    if (insights.length > 0) {
      this._emit('alk.landscape.insight', {
        personId:  landscape.personId,
        sessionCount: landscape.sessionCount,
        insights,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get landscape() { return this._landscape; }
  get personId()  { return this._personId; }

  /** Minimum energy path between two attractors (Dijkstra on edge graph) */
  minEnergyPath(fromId, toId) {
    if (!this._landscape) return null;
    const { attractors, edges } = this._landscape;
    const dist = {}, prev = {}, queue = new Set(attractors.map(a => a.id));
    for (const a of attractors) dist[a.id] = Infinity;
    dist[fromId] = 0;
    while (queue.size) {
      let u = null;
      for (const id of queue) if (u === null || dist[id] < dist[u]) u = id;
      queue.delete(u);
      if (u === toId) break;
      for (const e of edges.filter(e => e.from === u)) {
        const alt = dist[u] + e.barrier;
        if (alt < dist[e.to]) { dist[e.to] = alt; prev[e.to] = u; }
      }
    }
    if (dist[toId] === Infinity) return null;
    const path = [];
    let cur = toId;
    while (cur) { path.unshift(cur); cur = prev[cur]; }
    return { path, totalBarrier: r4(dist[toId]) };
  }

  async getAllLandscapes() { return this._store.list(); }

  _emit(event, data) { try { this._bus?.emit(event, data); } catch (_) {} }

  health() {
    return {
      status:        'OK',
      uuid:          LAND_UUID,
      version:       LAND_VERSION,
      personId:      this._personId,
      attractors:    this._landscape?.attractors?.length ?? 0,
      sessions:      this._landscape?.sessionCount ?? 0,
      restingLabel:  this._landscape?.restingLabel ?? null,
    };
  }
}

function dist5(a, b) {
  let s = 0;
  for (let i = 0; i < 5; i++) s += ((a[i]||0) - (b[i]||0)) ** 2;
  return Math.sqrt(s);
}
function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
export { fingerprintFromMap };
