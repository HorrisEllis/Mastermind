/**
 * @spatial/pat — store.js
 * WAL-backed session store.
 * Node: filesystem JSONL. Browser: IndexedDB.
 * Wraps causal-nexus/persist backend pattern.
 */
'use strict';

import { createSession, closeSession, SCHEMA_VERSION } from './schema.js';

export class PatStore {
  constructor({ bus, backend = 'auto', dataDir = './sessions' } = {}) {
    if (!bus) throw new Error('[PatStore] bus required');
    this._bus      = bus;
    this._dataDir  = dataDir;
    this._backend  = backend;
    this._session  = null;
    this._buffer   = [];
    this._flushN   = 50;   // flush to WAL every N events
    this._count    = 0;
    this._wal      = [];   // in-memory WAL (extend with fs/idb for real persistence)
    this._attach();
  }

  _attach() {
    const b = this._bus;

    b.on('spatial.session.start', ({ subjects = [], frameRate = 30, dataDir }) => {
      this._session = createSession({ dataDir: dataDir ?? this._dataDir, subjects, frameRate });
      this._buffer  = [];
      this._count   = 0;
    });

    b.on('spatial.session.stop', () => { this._close(); });

    // Signal events
    b.on('spatial.kernel.behavior.detected', p => this._append('signal_events', {
      t: p.ts, subjectId: p.subject, layer: p.layer ?? 'behavior',
      signal: p.type, subtype: p.subtype, confidence: p.confidence, species: p.species,
    }));

    // Entropy
    b.on('spatial.sigma.entropy.update', p => this._append('entropy_log', {
      t: p.ts, subjectId: p.subject, regime: p.regime,
      confidence: p.confidence, dominantCause: p.dominantCause,
    }));

    // Lattice
    b.on('spatial.lattice.edge.connected', p => this._append('lattice_refs', {
      t: p.ts, nodeId: p.nodeId, resonance: p.weight, subjectId: p.subjectId,
    }));

    // Bridge
    b.on('spatial.bridge.buffer.held', p => this._append('bridge_log', {
      t: p.ts, type: 'held', subjectA: p.subjectA, subjectB: p.subjectB,
      mode: p.mode, bandwidth: p.bandwidth, held: true,
    }));
    b.on('spatial.bridge.render.A', p => this._append('bridge_log', {
      t: p.ts, type: 'render', subjectA: p.subject, mode: p.mode, bandwidth: p.bandwidth,
    }));
    b.on('spatial.bridge.referent.found', p => this._append('bridge_log', {
      t: p.ts, type: 'referent', referent: p.shared,
      subjectA: p.subjectA, subjectB: p.subjectB,
    }));

    // Resonance
    b.on('spatial.resonance.scored', p => this._append('resonance_log', {
      t: p.ts, subjectA: p.a, subjectB: p.b,
      spatial: p.spatial, grammar: p.grammar,
      suppression: p.suppression, composite: p.composite, resonance: p.resonance,
    }));

    // Social field
    b.on('spatial.field.attunement.update', p => {
      if (!this._session) return;
      this._session.social_field = {
        active:     true,
        subjects:   p.subjects,
        synchrony:  p.synchrony  ?? this._session.social_field?.synchrony  ?? 0,
        mirroring:  p.mirroring  ?? this._session.social_field?.mirroring  ?? 0,
        attunement: p.index,
        tension:    p.tension    ?? this._session.social_field?.tension    ?? 0,
      };
    });

    // VATS
    b.on('spatial.kernel.vats.override', p => this._append('vats_overrides', {
      t: p.ts, subjectId: p.subjectId, zone: p.zone,
      signal: p.signal, confidenceOverride: p.confidence,
      annotator: p.annotator ?? 'manual', notes: p.notes ?? '',
    }));

    // ASE
    b.on('spatial.ase.encounter.recorded', p => this._append('ase_encounters', {
      t: p.ts, workId: p.workId, subjectId: p.personId,
      responseVector: p.response, delta: p.delta,
    }));
  }

  _append(layer, record) {
    if (!this._session) return;
    this._session[layer].push(record);
    this._buffer.push({ layer, record });
    this._count++;
    if (this._count % this._flushN === 0) this._flush();
  }

  _flush() {
    if (!this._buffer.length) return;
    this._wal.push({ ts: Date.now(), batch: [...this._buffer] });
    this._buffer = [];
  }

  _close() {
    if (!this._session) return;
    this._flush();
    this._session = closeSession(this._session);
    const s = this._session;
    this._bus.emit('spatial.pat.session.written', { sessionId: s.id, session: s, ts: Date.now() });
    this._session = null;
  }

  /** Current live session snapshot */
  snapshot()          { return this._session ? { ...this._session } : null; }
  /** WAL entries */
  get wal()           { return [...this._wal]; }
  /** Restore from raw session object */
  restore(session)    {
    this._session = session;
    this._bus.emit('spatial.pat.session.restored', { sessionId: session.id, ts: Date.now() });
  }
}
