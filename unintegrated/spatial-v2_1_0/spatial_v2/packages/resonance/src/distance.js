/**
 * @spatial/resonance — distance.js
 *
 * Behavioral distance between two fingerprints.
 * This is the resonance score.
 * 0 = identical topology. 1 = maximum distance.
 *
 * Composite of:
 *   - spatial:    5D attractor space distance
 *   - grammar:    receiver grammar compatibility
 *   - suppression: suppression profile similarity
 */

'use strict';

function euclidean5(a, b) {
  let sum = 0;
  for (let i = 0; i < 5; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += d * d;
  }
  return Math.sqrt(sum / 5); // normalized 0..1
}

const MODE_COMPAT = {
  THINK_FIRST:   { THINK_FIRST: 0.0, FEEL_FIRST: 0.5, SOMATIC_FIRST: 0.6, UNKNOWN: 0.4 },
  FEEL_FIRST:    { FEEL_FIRST:  0.0, THINK_FIRST: 0.5, SOMATIC_FIRST: 0.3, UNKNOWN: 0.4 },
  SOMATIC_FIRST: { SOMATIC_FIRST: 0.0, FEEL_FIRST: 0.3, THINK_FIRST: 0.6, UNKNOWN: 0.4 },
  UNKNOWN:       { UNKNOWN: 0.0, THINK_FIRST: 0.4, FEEL_FIRST: 0.4, SOMATIC_FIRST: 0.4 },
};

const ATTACH_COMPAT = {
  SECURE:       { SECURE: 0.0, ANXIOUS: 0.4, AVOIDANT: 0.5, DISORGANIZED: 0.7, UNKNOWN: 0.3 },
  ANXIOUS:      { ANXIOUS: 0.2, SECURE: 0.4, AVOIDANT: 0.8, DISORGANIZED: 0.6, UNKNOWN: 0.4 },
  AVOIDANT:     { AVOIDANT: 0.2, SECURE: 0.5, ANXIOUS: 0.8, DISORGANIZED: 0.6, UNKNOWN: 0.4 },
  DISORGANIZED: { DISORGANIZED: 0.3, SECURE: 0.7, ANXIOUS: 0.6, AVOIDANT: 0.6, UNKNOWN: 0.5 },
  UNKNOWN:      { UNKNOWN: 0.0, SECURE: 0.3, ANXIOUS: 0.4, AVOIDANT: 0.4, DISORGANIZED: 0.5 },
};

/**
 * Compute behavioral distance between two fingerprints.
 * @returns {{ spatial, grammar, suppression, composite }}
 *   Each 0..1. composite is the resonance distance.
 *   Low composite = high resonance.
 */
export function distance(fpA, fpB) {
  // 1. 5D spatial distance (resting state)
  const spatial = euclidean5(fpA.restingState, fpB.restingState);

  // 2. Receiver grammar compatibility
  const modeA = fpA.receiverGrammar?.primaryMode ?? 'UNKNOWN';
  const modeB = fpB.receiverGrammar?.primaryMode ?? 'UNKNOWN';
  const attA  = fpA.receiverGrammar?.attachPattern ?? 'UNKNOWN';
  const attB  = fpB.receiverGrammar?.attachPattern ?? 'UNKNOWN';
  const modeD = (MODE_COMPAT[modeA]?.[modeB] ?? 0.5);
  const attD  = (ATTACH_COMPAT[attA]?.[attB] ?? 0.5);
  const grammar = (modeD * 0.6) + (attD * 0.4);

  // 3. Suppression profile similarity
  const suppA = fpA.suppressionProfile?.mean ?? 0;
  const suppB = fpB.suppressionProfile?.mean ?? 0;
  const suppression = Math.abs(suppA - suppB);

  // 4. Composite — weighted
  const composite = (spatial * 0.5) + (grammar * 0.3) + (suppression * 0.2);

  return {
    spatial:     Math.round(spatial     * 10000) / 10000,
    grammar:     Math.round(grammar     * 10000) / 10000,
    suppression: Math.round(suppression * 10000) / 10000,
    composite:   Math.round(composite   * 10000) / 10000,
    // resonance = 1 - composite. Low distance = high resonance.
    resonance:   Math.round((1 - Math.min(1, composite)) * 10000) / 10000,
  };
}

/** Rank a pool of fingerprints by resonance to a target. */
export function rank(target, pool) {
  return pool
    .map(fp => ({ fp, dist: distance(target, fp) }))
    .sort((a, b) => a.dist.composite - b.dist.composite);
}
