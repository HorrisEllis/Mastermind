/**
 * @spatial/field — v1.0.0
 *
 * Relational geometry. Multi-subject.
 * Synchrony. Mirroring. Attunement. Tension.
 * Activates automatically on 2+ subjects on bus.
 *
 * §CS3 — cross-species field is first-class.
 * Human ↔ horse. Human ↔ dog. Any combination.
 * The field between a trauma survivor and a therapy horse
 * is a real spatial relationship. Field maps it.
 */
'use strict';

export const FIELD_VERSION = '1.0.0';

function r4(v) { return Math.round((v??0)*10000)/10000; }

// ── Synchrony ─────────────────────────────────────────────────────────────────
// Cross-correlation of latent vectors, ±400ms lag tolerance

export function computeSynchrony(historyA, historyB, { lagTolerance = 3 } = {}) {
  if (!historyA?.length || !historyB?.length) return 0;
  const len = Math.min(historyA.length, historyB.length, 20);
  const a = historyA.slice(-len);
  const b = historyB.slice(-len);
  let best = 0;
  for (let lag = -lagTolerance; lag <= lagTolerance; lag++) {
    let sum = 0, count = 0;
    for (let i = 0; i < len; i++) {
      const j = i + lag;
      if (j < 0 || j >= len) continue;
      // dot product of normalized 5D vectors
      let dot = 0, magA = 0, magB = 0;
      for (let k = 0; k < 5; k++) {
        dot  += (a[i][k]??0) * (b[j][k]??0);
        magA += (a[i][k]??0) ** 2;
        magB += (b[j][k]??0) ** 2;
      }
      const mag = Math.sqrt(magA) * Math.sqrt(magB);
      sum += mag > 0 ? dot/mag : 0;
      count++;
    }
    const score = count > 0 ? (sum/count + 1) / 2 : 0; // normalize -1..1 → 0..1
    if (score > best) best = score;
  }
  return r4(best);
}

// ── Mirroring ─────────────────────────────────────────────────────────────────
// Latency-typed: <300ms = involuntary (empathy), 300-900ms = conscious

export class MirroringDetector {
  constructor() { this._events = []; }

  ingest({ subjectId, signal, ts }) {
    this._events.push({ subjectId, signal, ts });
    if (this._events.length > 200) this._events.shift();
  }

  detect({ subjectA, subjectB }) {
    const evA = this._events.filter(e => e.subjectId === subjectA);
    const evB = this._events.filter(e => e.subjectId === subjectB);
    const mirrors = [];
    for (const ea of evA) {
      for (const eb of evB) {
        if (ea.signal !== eb.signal) continue;
        const lag = Math.abs(ea.ts - eb.ts);
        if (lag < 50 || lag > 1200) continue;
        mirrors.push({
          source:  ea.ts < eb.ts ? subjectA : subjectB,
          mirror:  ea.ts < eb.ts ? subjectB : subjectA,
          signal:  ea.signal,
          latency: lag,
          type:    lag < 300 ? 'involuntary' : 'conscious',
        });
      }
    }
    return mirrors;
  }
}

// ── Attunement ────────────────────────────────────────────────────────────────
// Composite: synchrony + mirroring rate + shared entropy slope

export function computeAttunement({ synchrony, mirroringRate, sharedEntropySlope }) {
  const s = synchrony       ?? 0;
  const m = mirroringRate   ?? 0;
  const e = 1 - Math.min(1, Math.abs(sharedEntropySlope ?? 0)); // low divergence = high attunement
  return r4((s * 0.45) + (m * 0.30) + (e * 0.25));
}

// ── Tension ───────────────────────────────────────────────────────────────────
// Oppositional signal density: one opens while one closes

export function computeTension(historyA, historyB) {
  if (!historyA?.length || !historyB?.length) return 0;
  const len = Math.min(historyA.length, historyB.length, 16);
  const a = historyA.slice(-len);
  const b = historyB.slice(-len);
  let oppositions = 0;
  for (let i = 0; i < len; i++) {
    // valence opposition: one positive, one negative
    const vOpp = (a[i][0]??0) * (b[i][0]??0) < -0.05;
    // arousal opposition: one rising, one falling (need 2+ points)
    let aOpp = false;
    if (i > 0) {
      const dA = (a[i][1]??0) - (a[i-1][1]??0);
      const dB = (b[i][1]??0) - (b[i-1][1]??0);
      aOpp = dA * dB < -0.01;
    }
    if (vOpp || aOpp) oppositions++;
  }
  return r4(oppositions / len);
}

// ── FieldEngine — bus-aware ───────────────────────────────────────────────────

export class FieldEngine {
  constructor({ bus } = {}) {
    if (!bus) throw new Error('[FieldEngine] bus required');
    this._bus       = bus;
    this._histories = new Map();  // subjectId → vector[]
    this._mirroring = new MirroringDetector();
    this._regimes   = new Map();  // subjectId → sigma regime
    this._subjects  = new Set();
    this._attach();
  }

  _attach() {
    this._bus.on('spatial.kernel.latent.update', ({ vector, subject, ts }) => {
      const id = subject ?? 'default';
      this._subjects.add(id);
      if (!this._histories.has(id)) this._histories.set(id, []);
      const h = this._histories.get(id);
      h.push(vector);
      if (h.length > 30) h.shift();
      if (this._subjects.size >= 2) this._computeField(ts);
    });

    this._bus.on('spatial.kernel.behavior.detected', ({ subject, type, subtype, ts }) => {
      this._mirroring.ingest({ subjectId: subject, signal: `${type}${subtype?'.'+subtype:''}`, ts });
    });

    this._bus.on('spatial.sigma.regime.changed', ({ subject, next }) => {
      this._regimes.set(subject, next);
    });

    this._bus.on('spatial.kernel.subject.remove', ({ id }) => {
      this._subjects.delete(id);
      this._histories.delete(id);
    });
  }

  _computeField(ts) {
    const subjects = Array.from(this._subjects);
    // Compute pairwise
    for (let i = 0; i < subjects.length; i++) {
      for (let j = i+1; j < subjects.length; j++) {
        const a = subjects[i], b = subjects[j];
        const hA = this._histories.get(a) ?? [];
        const hB = this._histories.get(b) ?? [];
        if (hA.length < 3 || hB.length < 3) continue;

        const synchrony = computeSynchrony(hA, hB);
        const mirrors   = this._mirroring.detect({ subjectA: a, subjectB: b });
        const mirroringRate = Math.min(1, mirrors.length / 10);

        // Shared entropy slope: how different are their sigma regimes?
        const REGIME_ORDER = { stable:0, activating:1, ungrounded:2, dysregulated:3, oscillatory:3, collapsing:4, offline:5 };
        const rA = REGIME_ORDER[this._regimes.get(a) ?? 'stable'] ?? 0;
        const rB = REGIME_ORDER[this._regimes.get(b) ?? 'stable'] ?? 0;
        const sharedEntropySlope = (rA - rB) / 5;

        const attunement = computeAttunement({ synchrony, mirroringRate, sharedEntropySlope });
        const tension    = computeTension(hA, hB);

        this._bus.emit('spatial.field.synchrony.update',  { subjectA:a, subjectB:b, score:synchrony, ts });
        this._bus.emit('spatial.field.attunement.update', { subjects:[a,b], index:attunement, synchrony, mirroringRate, tension, ts });
        this._bus.emit('spatial.field.tension.update',    { subjects:[a,b], score:tension, ts });

        if (mirrors.length) {
          for (const m of mirrors) {
            this._bus.emit('spatial.field.mirroring.detected', { ...m, ts });
          }
        }

        // Shared referent: both subjects showing same signal pattern
        const lastA = hA[hA.length-1] ?? [];
        const lastB = hB[hB.length-1] ?? [];
        const valDiff = Math.abs((lastA[0]??0)-(lastB[0]??0));
        if (valDiff < 0.12 && synchrony > 0.7) {
          this._bus.emit('spatial.field.referent.emerging', { subjects:[a,b], synchrony, ts });
        }
      }
    }
  }

  snapshot(subjectA, subjectB) {
    const hA = this._histories.get(subjectA) ?? [];
    const hB = this._histories.get(subjectB) ?? [];
    return {
      synchrony:  computeSynchrony(hA, hB),
      tension:    computeTension(hA, hB),
      subjects:   [subjectA, subjectB],
    };
  }
}
