/**
 * @spatial/pat — schema.js
 * Session schema v1.0.0
 * The canonical shape of a .pat file.
 * Every layer writes here. Nothing is lost.
 */
'use strict';

export const SCHEMA_VERSION = '1.0.0';
export const PAT_MAGIC      = 'SPATIAL-PAT';

/** Create an empty session record */
export function createSession({ dataDir = '', subjects = [], frameRate = 30 } = {}) {
  return {
    magic:          PAT_MAGIC,
    schemaVersion:  SCHEMA_VERSION,
    id:             generateId(),
    createdAt:      Date.now(),
    dataDir,
    subjects:       subjects.map(s => ({
      id:          s.id,
      species:     s.species ?? 'human',
      fingerprint: s.fingerprint ?? null,
    })),
    frameRate,
    // All layers
    signal_events:  [],   // { t, subjectId, layer, signal, subtype, confidence, bbox?, species }
    vats_overrides: [],   // { t, subjectId, zone, signal, confidenceOverride, annotator, notes }
    entropy_log:    [],   // { t, subjectId, regime, confidence, dominantCause, slopes }
    lattice_refs:   [],   // { nodeId, resonance, t, subjectId }
    social_field:   null, // { active, subjects[], synchrony, mirroring, attunement, tension }
    bridge_log:     [],   // { t, type, subjectA, subjectB, mode, bandwidth, held, referent }
    resonance_log:  [],   // { t, subjectA, subjectB, spatial, grammar, suppression, composite, resonance }
    ase_encounters: [],   // { t, workId, subjectId, responseVector, delta, duration }
    closedAt:       null,
    durationMs:     null,
  };
}

export function closeSession(session) {
  return {
    ...session,
    closedAt:   Date.now(),
    durationMs: Date.now() - session.createdAt,
  };
}

function generateId() {
  // §P1 — no PII. session ID is timestamp + random suffix
  return `pat-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
