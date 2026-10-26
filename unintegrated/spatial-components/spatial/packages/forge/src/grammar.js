/**
 * @spatial/forge — grammar.js
 *
 * Behavioral Grammar — the formal language that maps observed patterns
 * to generatable code structures.
 *
 * A behavioral pattern is a sequence of signals with temporal structure.
 * A grammar rule maps a pattern to a code template with parameters.
 * The compiler matches patterns against grammar, fills templates, emits code.
 *
 * This is the invention:
 *   You observe a person. You see their patterns.
 *   The system generates the code that describes those patterns.
 *   The generated code becomes a module that can detect, predict,
 *   and respond to those patterns in future sessions.
 *
 * The loop:
 *   Observe → Detect pattern → Compile to code → Deploy as module
 *   → Module observes → Detects refined pattern → Recompiles → ...
 *
 * This is what Forge in causal-nexus was pointing toward.
 * Here it completes.
 */

'use strict';

export const GRAMMAR_VERSION = '1.0.0';

// ── Signal types ──────────────────────────────────────────────────────────────

export const SIGNAL_TYPES = Object.freeze({
  // Behavioral signals (from @spatial/kernel)
  GESTURE:     'gesture',
  EXPRESSION:  'expression',
  GAZE:        'gaze',
  POSTURE:     'posture',
  REGULATION:  'regulation',
  VOCALIZATION:'vocalization',

  // Relational signals (from @spatial/field)
  SYNCHRONY:   'synchrony',
  MIRRORING:   'mirroring',
  ATTUNEMENT:  'attunement',
  TENSION:     'tension',

  // State signals (from @spatial/sigma)
  REGIME:      'regime',
  ENTROPY:     'entropy',

  // Cross-species signals
  SPECIES_SIGNAL: 'species_signal',
});

// ── Pattern shape ─────────────────────────────────────────────────────────────

/**
 * A BehavioralPattern is an observed sequence of signals with:
 * - temporal structure (how long, in what order)
 * - confidence (how reliable is this observation)
 * - context (what other signals were co-present)
 * - subject (who / what species)
 */
export function createPattern({
  id = null,
  label,
  signals = [],
  temporalWindow = 3000,  // ms
  confidence = 0,
  context = {},
  subject = null,
  species = 'human',
  sessionId = null,
  occurrences = 1,
  ts = Date.now(),
}) {
  return {
    id:             id ?? `pat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`,
    label,
    signals,         // [{ type, subtype, confidence, ts, duration }]
    temporalWindow,
    confidence,
    context,         // { regime, arousal, suppression, ... }
    subject,
    species,
    sessionId,
    occurrences,
    ts,
  };
}

// ── Grammar rules ─────────────────────────────────────────────────────────────

/**
 * A GrammarRule maps a pattern template to code generation logic.
 *
 * pattern:   what to match (signal sequence + context constraints)
 * template:  which code template to use
 * params:    how to extract parameters from matched pattern
 * threshold: minimum confidence to trigger code generation
 */
export const GRAMMAR_RULES = [

  // ── Regulation patterns → detector module
  {
    id: 'regulation-cluster',
    label: 'Regulatory behavior cluster',
    match: (pattern) =>
      pattern.signals.some(s => s.type === SIGNAL_TYPES.GESTURE && s.subtype?.includes('self')) &&
      pattern.occurrences >= 3,
    template: 'DETECTOR_MODULE',
    params: (pattern) => ({
      moduleName:  `${pattern.species}_${pattern.subject ?? 'subject'}_regulation_detector`,
      signalTypes: pattern.signals.map(s => s.subtype).filter(Boolean),
      threshold:   pattern.confidence,
      windowMs:    pattern.temporalWindow,
      species:     pattern.species,
    }),
    threshold: 0.65,
  },

  // ── Suppression pattern → suppression profile module
  {
    id: 'suppression-profile',
    label: 'Suppression signature',
    match: (pattern) =>
      pattern.context?.suppression > 0.5 && pattern.occurrences >= 2,
    template: 'SUPPRESSION_MODULE',
    params: (pattern) => ({
      moduleName:     `${pattern.subject ?? 'subject'}_suppression_profile`,
      suppressionMean: pattern.context.suppression,
      triggerSignals:  pattern.signals.map(s => s.subtype).filter(Boolean),
    }),
    threshold: 0.70,
  },

  // ── Relational field pattern → field detector
  {
    id: 'field-synchrony-pattern',
    label: 'Synchrony signature between subjects',
    match: (pattern) =>
      pattern.signals.some(s => s.type === SIGNAL_TYPES.SYNCHRONY) &&
      pattern.occurrences >= 2,
    template: 'FIELD_DETECTOR',
    params: (pattern) => ({
      moduleName: `field_synchrony_${pattern.subject ?? 'pair'}`,
      syncThreshold: pattern.context?.synchrony ?? 0.7,
      subjects:      pattern.context?.subjects ?? [],
    }),
    threshold: 0.60,
  },

  // ── Regime transition pattern → transition predictor
  {
    id: 'regime-transition',
    label: 'Predictable regime transition',
    match: (pattern) =>
      pattern.signals.filter(s => s.type === SIGNAL_TYPES.REGIME).length >= 2,
    template: 'TRANSITION_PREDICTOR',
    params: (pattern) => {
      const regimes = pattern.signals.filter(s => s.type === SIGNAL_TYPES.REGIME);
      return {
        moduleName:  `${pattern.subject ?? 'subject'}_transition_predictor`,
        fromRegime:  regimes[0]?.subtype,
        toRegime:    regimes[regimes.length-1]?.subtype,
        precursors:  pattern.signals.filter(s => s.type !== SIGNAL_TYPES.REGIME).map(s => s.subtype),
        windowMs:    pattern.temporalWindow,
      };
    },
    threshold: 0.72,
  },

  // ── Cross-species attunement → bridge profile
  {
    id: 'cross-species-attunement',
    label: 'Cross-species attunement signature',
    match: (pattern) =>
      pattern.context?.species?.length > 1 ||
      (pattern.signals.some(s => s.type === SIGNAL_TYPES.ATTUNEMENT) && pattern.species !== 'human'),
    template: 'SPECIES_BRIDGE_MODULE',
    params: (pattern) => ({
      moduleName:   `cross_species_bridge_${(pattern.context?.species ?? [pattern.species]).join('_')}`,
      speciesA:     pattern.context?.species?.[0] ?? 'human',
      speciesB:     pattern.context?.species?.[1] ?? pattern.species,
      attunementBaseline: pattern.context?.attunement ?? 0.5,
      bridgeSignals: pattern.signals.map(s => s.subtype).filter(Boolean),
    }),
    threshold: 0.60,
  },

  // ── Resonance fingerprint → matcher module
  {
    id: 'resonance-fingerprint',
    label: 'Resonance fingerprint for matching',
    match: (pattern) =>
      pattern.context?.fingerprint != null,
    template: 'RESONANCE_MATCHER',
    params: (pattern) => ({
      moduleName:  `resonance_matcher_${pattern.subject ?? 'subject'}`,
      fingerprint: pattern.context.fingerprint,
      threshold:   0.72,
    }),
    threshold: 0.75,
  },
];

/**
 * Match a pattern against all grammar rules.
 * Returns matched rules sorted by confidence.
 */
export function matchGrammar(pattern) {
  return GRAMMAR_RULES
    .filter(rule => pattern.confidence >= rule.threshold && rule.match(pattern))
    .map(rule => ({ rule, params: rule.params(pattern) }));
}
