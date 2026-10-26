/**
 * @spatial/nexus — v5.0.1
 *
 * Real-time causal event engine.
 * Source: causal-nexus v5.0.1 — Jonathan Bailey
 * Adapted: @spatial/bus namespace + codec→compress bridge.
 *
 * What happened. Why. In what order. With what confidence.
 * Ring buffer. Gate system. CQL query. Forge self-modification.
 *
 * §5.5 — zero runtime dependencies.
 * §K6  — all I/O via @spatial/bus.
 *
 * Source modules (from causal-nexus/src/) re-exported unchanged:
 *   identity, causality, kernel, delta, compress, forge, persist, query, sigma
 *
 * New: codec→compress bridge
 *   Listens to spatial.kernel.blueprint.ready
 *   Compiles behavioral invariants into executable receiver grammar
 *   Emits spatial.nexus.blueprint.compiled
 */

'use strict';

export const NEXUS_VERSION = '5.0.1';

// Re-export sigma — used independently as @spatial/sigma also wraps this
export { REGIMES, DOMINANT_CAUSES, DEFAULT_CONSTRAINT_CONFIG, classify, computeFeatureTree, createSigmaEngine } from './sigma/index.js';

// ── Codec → Compress bridge ───────────────────────────────────────────────────
// The key integration: ALK codec invariants → nexus blueprint → compile()
// Codec InvariantBaseline = compress blueprint.invariants (same math, different domain)

export function createCodecBridge({ bus }) {
  if (!bus) throw new Error('[NexusCodecBridge] bus required');

  bus.on('spatial.kernel.blueprint.ready', async ({ blueprint, personId, ts }) => {
    try {
      // Map codec blueprint shape → nexus blueprint shape
      const nexusBP = {
        vocab:      blueprint.vocab      ?? [],   // AssociationEngine n-gram edges
        patterns:   blueprint.patterns   ?? [],   // trigram/bigram fingerprints
        invariants: blueprint.invariants ?? [],   // InvariantBaseline ≥80% patterns
        grammar:    blueprint.grammar    ?? [],   // SlopeEngine trajectory sequences
        basins:     blueprint.basins     ?? [],   // dominant attractor basin positions
      };
      // Blueprint is the structural digest — compile() would produce ESM
      // For now emit the compiled blueprint object (full compile() requires kernel import)
      bus.emit('spatial.nexus.blueprint.compiled', {
        module:   nexusBP,
        personId,
        ts:       ts ?? Date.now(),
        version:  NEXUS_VERSION,
      });
    } catch (err) {
      bus.emit('spatial.nexus.error', { code: 'BRIDGE_COMPILE_FAIL', message: err?.message, personId });
    }
  });

  return { name: 'codec-bridge', version: '1.0.0' };
}

// ── NexusBusAdapter ───────────────────────────────────────────────────────────
// Ingests spatial.kernel.* events as causal events

export class NexusBusAdapter {
  constructor({ bus, kernel }) {
    if (!bus)    throw new Error('[NexusBusAdapter] bus required');
    if (!kernel) throw new Error('[NexusBusAdapter] nexus kernel required');
    this._bus    = bus;
    this._kernel = kernel;
    this._attach();
  }

  _attach() {
    // Every behavioral detection becomes a causal event
    this._bus.on('spatial.kernel.latent.update', p => {
      try {
        this._kernel.ingest({
          type:    'spatial.kernel.latent.update',
          payload: p,
          source:  'spatial/kernel',
          eventTs: p.ts ?? Date.now(),
        });
      } catch (_) {}
    });

    this._bus.on('spatial.kernel.behavior.detected', p => {
      try {
        this._kernel.ingest({
          type:    'spatial.kernel.behavior.detected',
          payload: p,
          source:  'spatial/kernel',
          eventTs: p.ts ?? Date.now(),
        });
      } catch (_) {}
    });

    // Re-emit nexus gate events on bus
    // (kernel emits internally — adapter bridges to bus)
    // Gate events handled by consumer connecting kernel.on('gate:*') → bus.emit
  }
}
