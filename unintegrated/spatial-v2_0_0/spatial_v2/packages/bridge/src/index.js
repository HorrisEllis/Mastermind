/**
 * @spatial/bridge — v1.0.0
 *
 * XLAT relational translation layer.
 * Source: xlat-bridge.js — Jonathan Bailey
 * Adapted: @spatial/bus namespace + species extension.
 *
 * Five-stage pipeline per transmission:
 * RECEIVE → DECODE → PROFILE → TRANSCODE → RENDER
 *
 * §CS3 — cross-species receiver profiles supported.
 * §5.7 — all I/O via @spatial/bus.
 */
'use strict';

export const BRIDGE_VERSION = '1.0.0';

export { EQUINE_RECEIVER_PROFILE } from './species/equine-profile.js';
export { CANINE_RECEIVER_PROFILE  } from './species/canine-profile.js';

// ── Bandwidth levels ──────────────────────────────────────────────────────────
export const BANDWIDTH = Object.freeze({
  FULL:     { maxTokens: null, maxSentences: null, label: 'Full'     },
  MODERATE: { maxTokens: 80,   maxSentences: 4,    label: 'Moderate' },
  REDUCED:  { maxTokens: 30,   maxSentences: 2,    label: 'Reduced'  },
  MINIMAL:  { maxTokens: 10,   maxSentences: 1,    label: 'Minimal'  },
  OFFLINE:  { maxTokens: 0,    maxSentences: 0,    label: 'Offline'  },
});

// ── NS State → Bandwidth (human default) ──────────────────────────────────────
export function bandwidthFromNSState(nsState, arousal = 0) {
  if (nsState === 'DORSAL'  || arousal > 0.92) return 'OFFLINE';
  if (nsState === 'SYMPATHETIC_HIGH' || arousal > 0.72) return 'REDUCED';
  if (nsState === 'SYMPATHETIC_MOD'  || arousal > 0.50) return 'MODERATE';
  if (nsState === 'VENTRAL') return 'FULL';
  return 'MODERATE';
}

// ── Mode taxonomy ─────────────────────────────────────────────────────────────
export const MODES = Object.freeze([
  'RAGE','GRIEF','FEAR','SHAME','NEED',
  'SOMATIC','RELATIONAL','COGNITIVE','NARRATIVE','DIRECTIVE',
]);

// ── Transmission buffer ───────────────────────────────────────────────────────
export class TransmissionBuffer {
  constructor() { this._queue = []; }
  hold(transmission)    { this._queue.push({ ...transmission, heldAt: Date.now() }); }
  release(bandwidth)    {
    if (bandwidth === 'OFFLINE' || bandwidth === 'MINIMAL') return [];
    const ready = this._queue.filter(t => this._canLand(t, bandwidth));
    this._queue = this._queue.filter(t => !this._canLand(t, bandwidth));
    return ready;
  }
  _canLand(t, bw)       { return bw === 'FULL' || bw === 'MODERATE'; }
  get size()            { return this._queue.length; }
}

// ── BridgeEngine — bus-aware ──────────────────────────────────────────────────
export class BridgeEngine {
  constructor({ bus } = {}) {
    if (!bus) throw new Error('[BridgeEngine] bus required');
    this._bus        = bus;
    this._states     = new Map();   // subjectId → { nsState, arousal, species, bandwidth, mode }
    this._blueprints = new Map();   // personId → compiled receiver grammar
    this._buffers    = new Map();   // subjectId → TransmissionBuffer
    this._attach();
  }

  _attach() {
    this._bus.on('spatial.kernel.latent.update', ({ vector, subject }) => {
      const id = subject ?? 'default';
      const arousal  = vector?.[1] ?? 0;
      const valence  = vector?.[0] ?? 0;
      const existing = this._states.get(id) ?? {};
      const species  = existing.species ?? 'human';

      let bandwidth;
      if (species !== 'human') {
        const profile = this._getSpeciesProfile(species);
        bandwidth = profile?.bandwidthFromArousal(arousal) ?? 'MODERATE';
      } else {
        const ns = arousal > 0.72 ? 'SYMPATHETIC_HIGH' : arousal > 0.5 ? 'SYMPATHETIC_MOD' : 'VENTRAL';
        bandwidth = bandwidthFromNSState(ns, arousal);
      }

      const prev = existing.bandwidth;
      this._states.set(id, { ...existing, arousal, valence, bandwidth });

      if (bandwidth !== prev) {
        this._bus.emit('spatial.bridge.bandwidth.update', { subject: id, prev, next: bandwidth, ts: Date.now() });
        if (bandwidth !== 'OFFLINE' && bandwidth !== 'MINIMAL') {
          const buf = this._buffers.get(id);
          if (buf?.size) {
            const released = buf.release(bandwidth);
            if (released.length) this._bus.emit('spatial.bridge.buffer.released', { subject: id, count: released.length, transmissions: released, ts: Date.now() });
          }
          this._bus.emit('spatial.bridge.window.open', { subject: id, bandwidth, ts: Date.now() });
        }
      }
    });

    this._bus.on('spatial.kernel.subject.add', ({ id, species = 'human' }) => {
      this._states.set(id, { species, bandwidth: 'FULL', arousal: 0, valence: 0 });
      this._buffers.set(id, new TransmissionBuffer());
    });

    this._bus.on('spatial.nexus.blueprint.compiled', ({ module, personId }) => {
      this._blueprints.set(personId, module);
    });
  }

  /**
   * Transmit: full five-stage pipeline.
   * @param {string} fromId — sender subject id
   * @param {string} toId   — receiver subject id
   * @param {string} content — raw transmission content
   * @param {string} [mode]  — detected/declared mode
   */
  transmit(fromId, toId, content, mode = null) {
    const receiver   = this._states.get(toId) ?? {};
    const bandwidth  = receiver.bandwidth ?? 'MODERATE';
    const species    = receiver.species   ?? 'human';
    const ts         = Date.now();

    // OFFLINE — buffer everything
    if (bandwidth === 'OFFLINE') {
      const buf = this._buffers.get(toId) ?? new TransmissionBuffer();
      buf.hold({ fromId, toId, content, mode, ts });
      this._buffers.set(toId, buf);
      this._bus.emit('spatial.bridge.buffer.held', { subjectA: fromId, subjectB: toId, mode, bandwidth, ts });
      return null;
    }

    // Transcode
    let rendered = content;
    let finalMode = mode;
    if (species !== 'human') {
      const profile = this._getSpeciesProfile(species);
      if (profile) {
        const result = profile.transcode(mode, bandwidth);
        finalMode = result.mode;
        rendered  = result.instruction;
      }
    }

    const result = { fromId, toId, content, rendered, mode: finalMode, bandwidth, species, ts };
    this._bus.emit('spatial.bridge.transmission.ready', result);
    this._bus.emit('spatial.bridge.render.A', { subject: toId, content: rendered, mode: finalMode, bandwidth, ts });
    return result;
  }

  _getSpeciesProfile(species) {
    const profiles = { equine: 'EQUINE_RECEIVER_PROFILE', canine: 'CANINE_RECEIVER_PROFILE' };
    return null; // resolved at import by consumer — bus event carries species
  }

  getState(subjectId)     { return this._states.get(subjectId) ?? null; }
  getBandwidth(subjectId) { return this._states.get(subjectId)?.bandwidth ?? 'MODERATE'; }
}
