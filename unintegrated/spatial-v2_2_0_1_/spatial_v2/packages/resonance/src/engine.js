/**
 * @spatial/resonance — engine.js
 *
 * ResonanceEngine — live fingerprint registry.
 * Listens to @spatial/bus. Updates fingerprints.
 * Answers matching queries.
 */

'use strict';

import { buildFingerprint } from './fingerprint.js';
import { distance, rank }   from './distance.js';
import { EV }               from '@spatial/bus';

export class ResonanceEngine {
  constructor({ bus, threshold = 0.72 } = {}) {
    if (!bus) throw new Error('[ResonanceEngine] bus required');
    this._bus       = bus;
    this._threshold = threshold;
    this._prints    = new Map();  // personId → fingerprint
    this._landscapes = new Map(); // personId → latest landscape
    this._grammars  = new Map();  // personId → latest grammar
    this._attach();
  }

  _attach() {
    this._bus.on(EV.KERNEL_LANDSCAPE_UPDATED, ({ personId, landscape }) => {
      this._landscapes.set(personId, landscape);
      this._rebuild(personId);
    });
    this._bus.on(EV.KERNEL_CODEC_INVARIANTS, ({ personId, ...grammar }) => {
      this._grammars.set(personId, grammar);
      this._rebuild(personId);
    });
  }

  _rebuild(personId) {
    const landscape = this._landscapes.get(personId);
    if (!landscape) return;
    const grammar = this._grammars.get(personId) ?? {};
    const fp = buildFingerprint({ landscape, grammar });
    this._prints.set(personId, fp);
    this._bus.emit(EV.RESONANCE_FINGERPRINT, { personId, fingerprint: fp, ts: Date.now() });
  }

  /** Get current fingerprint for personId */
  fingerprint(personId) { return this._prints.get(personId) ?? null; }

  /** Distance between two fingerprints */
  distance(fpA, fpB)    { return distance(fpA, fpB); }

  /** Score two people by personId */
  score(idA, idB) {
    const a = this._prints.get(idA);
    const b = this._prints.get(idB);
    if (!a || !b) return null;
    const dist = distance(a, b);
    this._bus.emit(EV.RESONANCE_SCORED, { a: idA, b: idB, ...dist, ts: Date.now() });
    return dist;
  }

  /** Match personId against a pool of personIds. Returns ranked array. */
  match(personId, pool) {
    const target = this._prints.get(personId);
    if (!target) return [];
    const poolFps = pool.map(id => this._prints.get(id)).filter(Boolean);
    const ranked = rank(target, poolFps);
    const matches = ranked
      .filter(r => r.dist.resonance >= this._threshold)
      .map(r => ({ personId: r.fp.id, ...r.dist }));
    this._bus.emit(EV.RESONANCE_MATCH_READY, { personId, matches, ts: Date.now() });
    return matches;
  }

  /** Top n closest from pool */
  nearby(personId, pool, n = 10) {
    return this.match(personId, pool).slice(0, n);
  }

  get size() { return this._prints.size; }
}
