/**
 * @spatial/ase — v1.0.0
 * Art Signature Engine.
 * How art moves through people across time.
 * Not streams. Not likes. Behavioral geometry.
 */
'use strict';
import { createWorkSignature, recordEncounter } from './signature.js';

export { createWorkSignature, recordEncounter };

export class ASEEngine {
  constructor({ bus } = {}) {
    if (!bus) throw new Error('[ASEEngine] bus required');
    this._bus       = bus;
    this._works     = new Map();   // workId → signature
    this._preStates = new Map();   // personId → last latent vector (pre-encounter)
    this._active    = new Map();   // personId → { workId, startTs, preVector }
    this._attach();
  }

  _attach() {
    // Track pre-encounter state
    this._bus.on('spatial.kernel.latent.update', ({ vector, subject }) => {
      this._preStates.set(subject ?? 'default', vector);
    });

    // Encounter start: person engages with a work
    this._bus.on('spatial.ase.encounter.start', ({ workId, personId, ts }) => {
      const pre = this._preStates.get(personId) ?? [0,0,0,0,0];
      this._active.set(personId, { workId, startTs: ts ?? Date.now(), preVector: [...pre] });
    });

    // Encounter end: measure what changed
    this._bus.on('spatial.ase.encounter.end', ({ personId, personFingerprint, returnCount = 1, ts }) => {
      const session = this._active.get(personId);
      if (!session) return;
      this._active.delete(personId);
      const responseVector = this._preStates.get(personId) ?? [0,0,0,0,0];
      const duration = (ts ?? Date.now()) - session.startTs;
      if (!this._works.has(session.workId)) {
        this._works.set(session.workId, createWorkSignature({ workId: session.workId }));
      }
      const sig = this._works.get(session.workId);
      recordEncounter(sig, { personFingerprint, responseVector, preVector: session.preVector, duration, returnCount, ts });
      this._bus.emit('spatial.ase.encounter.recorded', { workId: session.workId, personId, response: responseVector, delta: responseVector.map((v,i)=>v-(session.preVector[i]??0)), ts });
      this._bus.emit('spatial.ase.signature.updated',  { workId: session.workId, signature: sig.signature, ts });
      this._bus.emit('spatial.ase.trajectory.updated', { workId: session.workId, trajectory: sig.trajectory, ts });
    });
  }

  register(opts)          { const s = createWorkSignature(opts); this._works.set(s.workId, s); return s; }
  signature(workId)       { return this._works.get(workId) ?? null; }
  trajectory(workId)      { return this._works.get(workId)?.trajectory ?? null; }
  allWorks()              { return Array.from(this._works.values()); }
  topByResonance(n = 10)  { return [...this._works.values()].sort((a,b)=>b.trajectory.currentResonance-a.trajectory.currentResonance).slice(0,n); }
  trending(n = 10)        { return [...this._works.values()].filter(w=>w.trajectory.trend==='deepening').sort((a,b)=>b.trajectory.totalEncounters-a.trajectory.totalEncounters).slice(0,n); }
}
