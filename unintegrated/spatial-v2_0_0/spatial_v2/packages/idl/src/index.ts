/**
 * @spatial/idl — v0.2.0
 *
 * Relational Dynamics IDL — the formal language of the space between people.
 *
 * Axes computed:
 *   IntimacyVector    — persistence, elasticity, regulation, latency, permeability
 *   OscillationModel  — frequency, amplitude, recurrence, recovery, stabilization
 *   DriftModel        — structural, emotional, philosophical, intimacy drift
 *   ResonanceResult   — harmonic_stability | growth_friction | asynchronous_drift | volatile_coupling
 *
 * This is the TypeScript specification layer.
 * Runtime implementations live in @spatial/resonance (JS) and @spatial/nexus.
 */
export type { IntimacyAxes, IntimacySystem, IntimacyWaveState } from './idl-v0.1';
export type { AdaptiveAxes, InteractionEvent } from './idl-v0.2';
export type { ResonanceVector, ResonanceResult }                 from './resonance-engine-v0.1';
export { computeResonance }                                      from './resonance-engine-v0.1';
export { updateAxesFromInteraction }                             from './idl-v0.2';
