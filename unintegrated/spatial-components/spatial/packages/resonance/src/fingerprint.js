/**
 * @spatial/resonance — fingerprint.js
 *
 * Behavioral fingerprint. No PII. Pure geometry.
 * Derived from attractor landscape + codec invariants + receiver grammar.
 * Stable across sessions for the same person.
 * Different across people.
 * §P1 — behavioral hash only.
 */

'use strict';

export const FINGERPRINT_VERSION = '1.0.0';

// FNV-1a 32-bit hash — same as attractor-landscape.js
function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

function quantize(v, decimals = 2) {
  const m = Math.pow(10, decimals);
  return Math.round((v ?? 0) * m) / m;
}

/**
 * Derive a stable fingerprint ID from attractor landscape.
 * Same person → same ID across sessions.
 * No names, no email, no device ID.
 */
export function deriveId(landscape) {
  const { restingState = [0,0,0,0,0], attractors = [] } = landscape;
  const qState = restingState.map(v => quantize(v, 2)).join(',');
  const dominant = attractors
    .sort((a,b) => (b.depth ?? 0) - (a.depth ?? 0))
    .slice(0, 3)
    .map(a => a.label ?? 'unknown')
    .join('|');
  const suppShape = attractors.length
    ? quantize(attractors.reduce((s,a) => s + (a.suppProfile?.mean ?? 0), 0) / attractors.length, 2)
    : 0;
  return `sp-${fnv1a32(`${qState}:${dominant}:${suppShape}`)}`;
}

/**
 * Build a full fingerprint from:
 *  - landscape   (from @spatial/kernel landscape events)
 *  - grammar     (from @spatial/kernel codec.invariants events)
 *  - aseSignature (from @spatial/ase — optional)
 *  - species     (default 'human')
 */
export function buildFingerprint({ landscape, grammar = {}, aseSignature = null, species = 'human' }) {
  const id = deriveId(landscape);
  const { restingState = [0,0,0,0,0], attractors = [], edges = [], sessionCount = 1 } = landscape;

  // Dominant attractor — deepest basin
  const sorted = [...attractors].sort((a,b) => (b.depth ?? 0) - (a.depth ?? 0));
  const dominant = sorted[0] ?? null;

  // Suppression profile
  const suppValues = attractors.map(a => a.suppProfile?.mean ?? 0).filter(v => v > 0);
  const suppMean   = suppValues.length ? suppValues.reduce((s,v) => s+v, 0) / suppValues.length : 0;
  const suppPeak   = suppValues.length ? Math.max(...suppValues) : 0;
  const suppPattern = suppMean < 0.2 ? 'low' : suppMean < 0.5 ? 'moderate' : 'high';

  return {
    id,
    species,
    version:      FINGERPRINT_VERSION,
    restingState: restingState.map(v => quantize(v)),
    topology: {
      attractors:   sorted.map(a => ({
        center:  (a.center ?? [0,0,0,0,0]).map(v => quantize(v)),
        radius:  quantize(a.radius ?? 0.1),
        depth:   quantize(a.depth ?? 0),
        label:   a.label ?? 'unnamed',
        visits:  a.visits ?? 1,
      })),
      edges: edges.map(e => ({
        from:      e.from,
        to:        e.to,
        frequency: quantize(e.frequency ?? 0),
        barrier:   quantize(e.barrier ?? 0.5),
      })),
      dominantLabel: dominant?.label ?? 'unknown',
    },
    receiverGrammar: {
      primaryMode:   grammar.primaryMode   ?? 'UNKNOWN',
      bandwidth:     grammar.bandwidth     ?? 'FULL',
      attachPattern: grammar.attachPattern ?? 'UNKNOWN',
      invariants:    grammar.invariants    ?? [],
    },
    suppressionProfile: {
      mean:    quantize(suppMean),
      peak:    quantize(suppPeak),
      pattern: suppPattern,
    },
    aseSignature,
    sessionCount,
    lastUpdated: Date.now(),
  };
}
