/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GapHunter — Universal Taxonomy  ·  gap-taxonomy.js  ·  v3.0.0        ║
 * ║  UUID: gh-tax-0000-0000-3000-0000-000000000001                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE COMPLETE UNIVERSAL GAP TAXONOMY
 *
 * Sources integrated:
 *   — GAPHUNTER_UNIVERSAL_META_DOMAIN_v1_0_0.md  (all domains U1–U14)
 *   — GAPHUNTER_RELATIONAL_DOMAIN_v1_0_0.md      (R1–R13)
 *   — GapHunter v2.0.0 catalogue                 (106 gaps, 40 domains)
 *   — Gap Field Engine                           (field theory, edges, slopes)
 *   — Music / Lyric theory                       (harmonic, structural, lyric)
 *   — Deferred variable theory                   (compression, occlusion, etc.)
 *   — Oscillation / As Above So Below            (sigma regimes, resonance)
 *
 * Total: 200+ named gaps across 60+ domains.
 * Every gap includes existence reason — WHY this gap exists.
 *
 * §1.1  All outputs are signals. Not diagnoses.
 * §1.2  Nothing silently fails.
 * §1.3  The recursion is not a bug. It is the engine.
 */

'use strict';

// ─── Universal Gap Types ─────────────────────────────────────────────────────

export const GAP_TYPE = Object.freeze({
  LOGICAL:       'logical',
  EVIDENTIAL:    'evidential',
  TEMPORAL:      'temporal',
  DEFINITIONAL:  'definitional',
  REFERENCE:     'reference',
  OBLIGATION:    'obligation',
  ASSUMPTION:    'assumption',
  CONTRADICTION: 'contradiction',
  // Relational extensions
  IDENTITY_ATTACK:'identity_attack',
  CONSENT:        'consent',
  BOUNDARY:       'boundary',
  HIERARCHY:      'hierarchy',
  COERCION:       'coercion',
  ISOLATION:      'isolation',
  OSCILLATORY:    'oscillatory',
  CONDITION:      'condition',
});

export const UNIVERSAL_CRITICALITY = Object.freeze({
  [GAP_TYPE.ASSUMPTION]:      1.00,
  [GAP_TYPE.IDENTITY_ATTACK]: 1.00,
  [GAP_TYPE.COERCION]:        1.00,
  [GAP_TYPE.CONTRADICTION]:   0.80,
  [GAP_TYPE.ISOLATION]:       0.95,
  [GAP_TYPE.OSCILLATORY]:     0.85,
  [GAP_TYPE.TEMPORAL]:        0.75,
  [GAP_TYPE.LOGICAL]:         0.70,
  [GAP_TYPE.EVIDENTIAL]:      0.65,
  [GAP_TYPE.DEFINITIONAL]:    0.60,
  [GAP_TYPE.OBLIGATION]:      0.55,
  [GAP_TYPE.REFERENCE]:       0.50,
  [GAP_TYPE.CONDITION]:       0.70,
  [GAP_TYPE.CONSENT]:         0.80,
  [GAP_TYPE.BOUNDARY]:        0.65,
  [GAP_TYPE.HIERARCHY]:       0.70,
});

// ─── Nine Reasons Gaps Exist ─────────────────────────────────────────────────
// Every gap in any domain exists for one or more of these reasons.
// This is the meta-taxonomy of gap causation.

export const GAP_REASON = Object.freeze({
  COMPRESSION:         'compression',         // Too much information, not enough signal bandwidth — gaps form where compression occurs
  AVOIDANCE:           'avoidance',           // The content is too threatening to hold conscious — gaps are purposeful
  COMPATIBILITY:       'compatibility',       // Two systems/frameworks that cannot fully interoperate — the gap is at the interface
  ATTENTION:           'attention',           // Finite attention cannot cover everything — gaps are where attention didn't land
  EMOTIONAL_OCCLUSION: 'emotional_occlusion', // Strong emotion blocks access to certain content — the gap is a blind spot cast by affect
  NARRATIVE_SOOTHING:  'narrative_soothing',  // The story needs the gap to hold together — closing it would break the narrative
  IDENTITY_REFLECTION: 'identity_reflection', // The gap protects an identity — what's missing would require updating who you are
  DEFERRED_VARIABLE:   'deferred_variable',   // The variable exists, is known to exist, but is explicitly not processed yet — structural deferral
  STRUCTURAL_LIMIT:    'structural_limit',    // The system's architecture cannot represent the content — the gap is a hard limit
});

// ─── Domain Registry ─────────────────────────────────────────────────────────

export const DOMAIN = Object.freeze({
  // Epistemological
  EPISTEMOLOGICAL:     'epistemological',
  LOGIC:               'logic',
  PHILOSOPHY_SCIENCE:  'philosophy_science',
  METACOGNITION:       'metacognition',
  // Human Systems
  POLITICAL:           'political',
  LEGAL:               'legal',
  INSTITUTIONAL:       'institutional',
  GOVERNANCE:          'governance',
  // Scientific
  RESEARCH:            'research',
  MEDICAL:             'medical',
  STATISTICS:          'statistics',
  ENGINEERING:         'engineering',
  // Technology & Code
  CODE:                'code',
  SOFTWARE_ARCH:       'software_arch',
  AI_ML:               'ai_ml',
  SECURITY:            'security',
  QA:                  'qa',
  DEVOPS:              'devops',
  API_DESIGN:          'api_design',
  DATABASE:            'database',
  SYSTEM_DESIGN:       'system_design',
  // Coding Languages
  LANG_JS:             'lang_javascript',
  LANG_TS:             'lang_typescript',
  LANG_PYTHON:         'lang_python',
  LANG_RUST:           'lang_rust',
  LANG_GO:             'lang_go',
  LANG_JAVA:           'lang_java',
  LANG_CPP:            'lang_cpp',
  LANG_SQL:            'lang_sql',
  LANG_GENERIC:        'lang_generic',
  // Relational
  INTERPERSONAL:       'interpersonal',
  PSYCHOLOGICAL:       'psychological',
  COMMUNICATION:       'communication',
  ABUSE_MANIPULATION:  'abuse_manipulation',
  RELATIONAL:          'relational',
  // Creative & Music
  NARRATIVE:           'narrative',
  ART_DESIGN:          'art_design',
  MUSIC:               'music',
  MUSIC_THEORY:        'music_theory',
  HARMONY:             'harmony',
  RHYTHM:              'rhythm',
  LYRICS:              'lyrics',
  SONGWRITING:         'songwriting',
  INNOVATION:          'innovation',
  WRITING:             'writing',
  // Economic
  BUSINESS:            'business',
  FINANCE:             'finance',
  STRATEGY:            'strategy',
  CONTRACTS:           'contracts',
  MARKETS:             'markets',
  // Existential
  IDENTITY:            'identity',
  VALUES:              'values',
  BELIEF:              'belief',
  PURPOSE:             'purpose',
  ETHICS:              'ethics',
  MORAL:               'moral',
  // Organisational
  ORGANISATIONAL:      'organisational',
  LEADERSHIP:          'leadership',
  TEAM:                'team',
  PROCESS:             'process',
  // Life
  HEALTH:              'health',
  RELATIONSHIPS:       'relationships',
  PARENTING:           'parenting',
  EDUCATION:           'education',
  CAREER:              'career',
  FINANCES_PERSONAL:   'finances_personal',
  GRIEF:               'grief',
  MEANING:             'meaning',
  // Future
  FUTURES:             'futures',
  CLIMATE:             'climate',
  AI_GOVERNANCE:       'ai_governance',
  CIVILISATION:        'civilisation',
  // Field Theory
  FIELD:               'field',
  SIGNAL:              'signal',
  SEQUENCE:            'sequence',
  EDGE:                'edge',
  // Recursive
  RECURSIVE:           'recursive',
  META:                'meta',
});

// ─── Field Theory Gap Types ───────────────────────────────────────────────────
// These apply to any sequential or continuous data — music, code, conversation,
// numbers, events. They are the geometric language of gaps.

export const FIELD_GAP_SUBTYPE = Object.freeze({
  // Curve types
  SLOPE_CHANGE:       'slope_change',        // rate of change changes — acceleration event
  INFLECTION:         'inflection',          // curve changes from concave to convex — pivot
  PLATEAU:            'plateau',             // derivative ≈ 0 sustained — stagnation or stability
  ASYMPTOTE:          'asymptote',           // approaching but never reaching — structural limit
  DISCONTINUITY:      'discontinuity',       // signal breaks — jump cut, sudden change
  OVERSHOOT:          'overshoot',           // past the target before correcting
  UNDERSHOOT:         'undershoot',          // never reaches expected target
  CONVERGENCE:        'convergence',         // two signals approaching each other
  DIVERGENCE:         'divergence',          // two signals separating
  // Oscillation types
  OSCILLATION:        'oscillation',         // regular cycling between states
  DAMPED_OSCILLATION: 'damped_oscillation',  // oscillation decaying toward stable state
  RESONANCE:          'resonance',           // oscillation amplified by matching frequency
  PHASE_SHIFT:        'phase_shift',         // same wave, shifted in time
  INTERFERENCE:       'interference',        // two waves interacting — constructive or destructive
  ALIASING:           'aliasing',            // signal sampled too infrequently — gaps appear
  // Edge types
  RISING_EDGE:        'rising_edge',         // signal transitions low→high
  FALLING_EDGE:       'falling_edge',        // signal transitions high→low
  HARD_EDGE:          'hard_edge',           // abrupt transition — maximum information density
  SOFT_EDGE:          'soft_edge',           // gradual transition — information spread over time
  BLURRED_EDGE:       'blurred_edge',        // edge that should be hard is soft — unclear boundary
  // Frequency / harmonic types
  HARMONIC_GAP:       'harmonic_gap',        // expected harmonic absent from series
  SUBHARMONIC:        'subharmonic',         // unexpected frequency below fundamental
  BEAT_FREQUENCY:     'beat_frequency',      // two close frequencies producing slow beat
  FREQUENCY_ABSENCE:  'frequency_absence',   // expected frequency band missing from signal
  // As Above So Below (scale invariance)
  FRACTAL_GAP:        'fractal_gap',         // same gap pattern appearing at multiple scales
  SCALE_INVARIANT:    'scale_invariant',     // pattern that holds regardless of zoom level
  SELF_SIMILAR:       'self_similar',        // smaller version of the larger pattern embedded within
  MICRO_MACRO_DIVERGENCE: 'micro_macro_divergence', // pattern breaks across scales
});

// ─── Music Theory Gap Types ───────────────────────────────────────────────────

export const MUSIC_GAP_SUBTYPE = Object.freeze({
  // Harmonic
  UNRESOLVED_TENSION:   'unresolved_tension',   // V → (no I) — tension held without release
  MISSING_CADENCE:      'missing_cadence',      // phrase ends without harmonic closure
  PARALLEL_MOTION:      'parallel_motion',      // voices moving in parallel when contrary expected
  VOICE_LEADING_GAP:    'voice_leading_gap',    // leap where stepwise expected — gap in smoothness
  MODAL_MIXTURE_UNACK:  'modal_mixture_unack',  // borrowed chord without structural acknowledgment
  DECEPTIVE_CADENCE:    'deceptive_cadence',    // resolution expected, substitution occurs — gap field
  TRITONE_UNRESOLVED:   'tritone_unresolved',   // tritone tension not resolved — maximum harmonic gap
  // Rhythmic
  MISSING_DOWNBEAT:     'missing_downbeat',     // downbeat absent — structural anchor missing
  METRIC_AMBIGUITY:     'metric_ambiguity',     // meter unclear — listener expectation diffuse
  SYNCOPATION_GAP:      'syncopation_gap',      // syncopation creates expectation — landing missing
  TEMPO_DISCONTINUITY:  'tempo_discontinuity',  // tempo changes without preparation
  // Structural
  MISSING_BRIDGE:       'missing_bridge',       // no pivot section — no third position
  MISSING_HOOK:         'missing_hook',         // no identifiable center of gravity
  INTRO_OUTRO_MISMATCH: 'intro_outro_mismatch', // opening tension not resolved at close
  SECTION_MISMATCH:     'section_mismatch',     // section content doesn't match section function
  DYNAMIC_PLATEAU:      'dynamic_plateau',      // dynamics flat where arc expected
  TEXTURE_STAGNATION:   'texture_stagnation',   // orchestration unchanged where change expected
  // Lyric-Music
  WORD_BEAT_MISALIGN:   'word_beat_misalign',   // lyric stress and musical stress don't match
  MEANING_MELODY_CONTRA:'meaning_melody_contra',// lyric meaning contradicts melodic contour
  RHYME_BREAK:          'rhyme_break',          // rhyme scheme broken unexpectedly
  RHYME_FORCED:         'rhyme_forced',         // rhyme forces unnatural word choice
  SLANT_RHYME_UNRESOLVED:'slant_rhyme_unresolved',// slant rhyme opens gap, never closes it
  METER_BREAK:          'meter_break',          // meter breaks — edge event
  CLICHE_SUBSTITUTION:  'cliche_substitution',  // cliché substitutes for specific image — precision gap
  PRONOUN_AMBIGUITY:    'pronoun_ambiguity',    // pronoun referent unclear — inferred variable
  PIVOT_MISSING:        'pivot_missing',        // emotional arc has no pivot — tension never turns
  PIVOT_EARLY:          'pivot_early',          // resolution before tension builds
  PIVOT_LATE:           'pivot_late',           // tension held too long, resolution compressed
  HOOK_POSITION_GAP:    'hook_position_gap',    // hook not at maximum gap-field pressure point
  SYLLABLE_OVERFLOW:    'syllable_overflow',    // too many syllables for the beat — field breaks
  SYLLABLE_DEFICIT:     'syllable_deficit',     // too few syllables — field collapses
  WORD_FLOW_BREAK:      'word_flow_break',      // natural speech rhythm broken by forced delivery
  VOWEL_STRESS_GAP:     'vowel_stress_gap',     // vowel elongation in song differs from speech
  CONSONANT_CLUSTER:    'consonant_cluster',    // consonant clusters that impede flow at tempo
  LYRIC_COMPRESSION:    'lyric_compression',    // meaning compressed to fit — precision lost
  DEFERRED_RESOLUTION:  'deferred_resolution',  // emotional content of lyric deferred to next section
});

// ─── Deferred Variable Types ──────────────────────────────────────────────────
// Variables that exist, are known to exist, but are not currently processed.
// Different from omitted variables (which may be unknown).
// Different from suppressed variables (which are actively hidden).

export const DEFERRED_VAR_TYPE = Object.freeze({
  KNOWN_UNKNOWN:     'known_unknown',   // you know you don't know it — Rumsfeld's named hole
  SCHEDULED:         'scheduled',       // explicitly deferred to a future processing window
  BLOCKED:           'blocked',         // cannot be processed now due to external dependency
  LOAD_BEARING:      'load_bearing',    // processing it would collapse current structure — deferred for stability
  RECURSIVE:         'recursive',       // processing requires output of its own processing
  CAPACITY:          'capacity',        // bandwidth exceeded — variable queued, not dropped
  CONSENSUS_PENDING: 'consensus_pending', // waiting for shared agreement before processing
  EMOTIONALLY_HOT:   'emotionally_hot', // too activated to process safely now — requires regulation first
  THREAT_PROXIMAL:   'threat_proximal', // variable exists near something threatening — avoidance by proximity
});

// ─── Complete Gap Catalogue ───────────────────────────────────────────────────

export const GAP_CATALOGUE = [

  // ════════════════════════════════════════════════════════
  // EPISTEMOLOGICAL (U3 from MD + v2 entries)
  // ════════════════════════════════════════════════════════
  {
    id: 'epist-circular',         domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.LOGICAL,       subtype: 'circular_reasoning',
    description: 'Conclusion used as premise for itself — cycle in causal graph',
    signal: 'Conclusion node appears in its own premise chain',
    detection: 'cycle detected: conclusion ∈ premise_chain(conclusion)',
    criticality: 0.90,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.IDENTITY_REFLECTION],
    example: '"The market is efficient because efficient markets price in inefficiency"',
    as_above: 'In music: melody that only restates the tonic — no departure, no discovery. In code: function that validates its own output.',
  },
  {
    id: 'epist-closure',          domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'epistemic_closure',
    description: 'Belief system sealed against disconfirmation — no update path exists',
    signal: 'All counter-evidence rerouted to confirmation; no update edge',
    detection: 'contradictory_evidence has no causal path to belief_update',
    criticality: 0.95,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.AVOIDANCE],
    example: 'Conspiracy theories; ideological echo chambers; scientific dogma',
  },
  {
    id: 'epist-unfalsifiable',    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'unfalsifiability',
    description: 'Claim with no defined disconfirmation condition — cannot be a claim',
    detection: 'falsifiability_node absent',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
    example: '"God works in mysterious ways"',
  },
  {
    id: 'epist-category-error',   domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'category_error',
    description: 'Two things from incompatible logical categories treated as comparable',
    detection: 'two nodes connected by edge where domain types are incompatible',
    criticality: 0.75,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.COMPATIBILITY],
    example: '"Emotions are irrational" — emotions are not claims requiring logical validity',
  },
  {
    id: 'epist-induction',        domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.TEMPORAL,      subtype: 'induction_gap',
    description: 'Finite pattern assumed to hold universally and indefinitely',
    detection: 'universal_quantifier over finite_sample without inductive warrant',
    criticality: 0.75,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
    example: '"This strategy has always worked" (n=3, used as n=∞)',
  },
  {
    id: 'epist-observer',         domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'observation_effect',
    description: 'Measurement assumed not to affect the thing measured',
    detection: 'observer_neutrality assumed; no correction applied',
    criticality: 0.70,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'epist-authority',        domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.REFERENCE,     subtype: 'authority_gap',
    description: 'Expert consensus cited without examining quality or applicability',
    detection: 'consensus_claim without source_chain specificity',
    criticality: 0.65,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
    example: '"Scientists agree..." (which scientists? on what?)',
  },
  {
    id: 'epist-framing',          domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'framing_gap',
    description: 'The frame determines what answers are possible — frame never questioned',
    detection: 'problem_statement has no alternative_framing node',
    criticality: 0.85,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.ATTENTION],
    example: '"How do we fix this person?" vs "What is this person responding to?"',
  },
  {
    id: 'epist-theory-data',      domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.LOGICAL,       subtype: 'theory_data_gap',
    description: 'Contradictory data explained within existing theory rather than challenging it',
    detection: 'contradictory_data routed to anomaly_node, not theory_update_node',
    criticality: 0.80,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.NARRATIVE_SOOTHING],
  },

  // ════════════════════════════════════════════════════════
  // POLITICAL / GOVERNANCE (U4)
  // ════════════════════════════════════════════════════════
  {
    id: 'pol-enforcement',        domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.OBLIGATION,    subtype: 'enforcement_gap',
    description: 'Law or regulation with no enforcement mechanism',
    detection: 'obligation_node without enforcement_path',
    criticality: 0.85,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'pol-accountability',     domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.OBLIGATION,    subtype: 'accountability_gap',
    description: 'Power exercised without corresponding accountability',
    detection: 'power_node without accountability_edge; or accountability routes to same actor',
    criticality: 0.90,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'pol-policy-mechanism',   domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.LOGICAL,       subtype: 'policy_mechanism_gap',
    description: 'Policy assumed to produce intended effect — mechanism never established',
    detection: 'policy_node → outcome_node without mechanism_node',
    criticality: 0.80,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'pol-mandate',            domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.REFERENCE,     subtype: 'mandate_gap',
    description: 'Action claimed to have mandate never explicitly given',
    detection: 'authority_claim without direct consent_chain to specific action',
    criticality: 0.75,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
  },
  {
    id: 'pol-representation',     domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'representation_gap',
    description: 'Decision-makers claimed to represent group whose preferences differ',
    detection: 'representative_claim contradicts documented preference data',
    criticality: 0.80,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'pol-legitimacy',         domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'legitimacy_gap',
    description: 'Authority assumed legitimate without established consent basis',
    detection: 'authority_claim has no consent_chain from governed',
    criticality: 0.80,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'pol-incrementalism',     domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.TEMPORAL,      subtype: 'incrementalism_gap',
    description: 'Small changes assumed to produce linear outcomes — ignores phase transitions',
    detection: 'linear_assumption on non-linear system; threshold effects absent',
    criticality: 0.75,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
  },

  // ════════════════════════════════════════════════════════
  // ECONOMIC / FINANCIAL (U5)
  // ════════════════════════════════════════════════════════
  {
    id: 'econ-externality',       domain: DOMAIN.FINANCE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'externality_gap',
    description: 'Cost shifted to parties outside the transaction — assumed not to exist',
    detection: 'transaction_model without third_party_cost node',
    criticality: 0.85,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
  },
  {
    id: 'econ-risk',              domain: DOMAIN.FINANCE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'risk_assumption',
    description: 'Risk assumed away rather than priced or managed',
    detection: 'risk_node absent; tail_risk excluded from model',
    criticality: 0.90,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.EMOTIONAL_OCCLUSION],
    example: '"This time is different"',
  },
  {
    id: 'econ-incentive',         domain: DOMAIN.BUSINESS,
    type: GAP_TYPE.LOGICAL,       subtype: 'incentive_misalignment',
    description: 'System rewards behavior it doesn\'t actually want',
    detection: 'reward_node → behavior_node ≠ stated_goal_node',
    criticality: 0.85,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'econ-liquidity',         domain: DOMAIN.FINANCE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'liquidity_illusion',
    description: 'Asset assumed liquid until the moment it isn\'t',
    detection: 'liquidity_assumption has no stress-test condition',
    criticality: 0.85,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'econ-compounding',       domain: DOMAIN.FINANCE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'compounding_blindness',
    description: 'Linear thinking applied to exponential processes',
    detection: 'rate_of_change modeled as constant; second-order effects absent',
    criticality: 0.80,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
    as_above: 'In music: crescendo that doesn\'t model its own exponential — peaks earlier than expected. In code: O(n²) assumed as O(n).',
  },
  {
    id: 'econ-sunk-cost',         domain: DOMAIN.FINANCE,
    type: GAP_TYPE.LOGICAL,       subtype: 'sunk_cost_fallacy',
    description: 'Past cost treated as forward-relevant decision input',
    detection: 'historical_cost_node has causal_edge to future_decision_node',
    criticality: 0.75,
    reason: [GAP_REASON.EMOTIONAL_OCCLUSION, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'econ-moral-hazard',      domain: DOMAIN.FINANCE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'moral_hazard',
    description: 'Risk-taking increased when consequences transfer to another party',
    detection: 'risk_node with consequence_edge to third_party',
    criticality: 0.85,
    reason: [GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'econ-market-structure',  domain: DOMAIN.MARKETS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'market_structure_gap',
    description: 'Market competition assumed without verifying competitive conditions',
    detection: 'market_efficiency_assumption without competitive_condition verification',
    criticality: 0.80,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.IDENTITY_REFLECTION],
  },

  // ════════════════════════════════════════════════════════
  // SCIENTIFIC / RESEARCH (U6)
  // ════════════════════════════════════════════════════════
  {
    id: 'sci-replication',        domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'replication_gap',
    description: 'Single finding treated as established fact before replication',
    detection: 'single_study presented as consensus; replication_count = 1',
    criticality: 0.85,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
  },
  {
    id: 'sci-publication-bias',   domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.REFERENCE,     subtype: 'publication_bias',
    description: 'Literature misrepresents reality — null results unpublished',
    detection: 'literature_review without null-result correction',
    criticality: 0.80,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'sci-correlation',        domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.LOGICAL,       subtype: 'correlation_causation',
    description: 'Co-occurrence treated as causal without mechanism',
    detection: 'correlation_claim with causal_edge without mechanism_node',
    criticality: 0.80,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
  },
  {
    id: 'sci-p-hacking',          domain: DOMAIN.STATISTICS,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'p_hacking',
    description: 'Multiple tests run until significance found; single result reported',
    detection: 'significant_result without multiple-comparison correction',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'sci-sample-bias',        domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'sample_bias',
    description: 'Finding from non-representative sample generalised to broader population',
    detection: 'population_claim with unrepresentative sample_node',
    criticality: 0.80,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
    example: 'WEIRD bias — Western, Educated, Industrialised, Rich, Democratic → humanity',
  },
  {
    id: 'sci-operationalisation', domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'operationalisation_gap',
    description: 'Abstract concept measured in a way that may not capture it',
    detection: 'measurement_definition ≠ concept_definition',
    criticality: 0.75,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPRESSION],
    example: '"Intelligence" measured by IQ; "productivity" measured by hours',
  },
  {
    id: 'sci-funding-bias',       domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'funding_bias',
    description: 'Research conclusions skewed toward funder\'s interests — assumed neutral',
    detection: 'source_node has undisclosed interest in outcome',
    criticality: 0.80,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },

  // ════════════════════════════════════════════════════════
  // CODE — LANGUAGE-AGNOSTIC
  // ════════════════════════════════════════════════════════
  {
    id: 'code-silent-fail',       domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'silent_failure',
    description: 'Error caught and swallowed — §1.2 violation',
    signal: 'catch block with empty body',
    detection: 'try/catch with no rethrow, no error event',
    criticality: 1.00,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.COMPRESSION],
  },
  {
    id: 'code-stub-prod',         domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'stub_in_production',
    description: 'Placeholder or TODO shipped to production — §1.3 violation',
    detection: 'stub marker in production code path',
    criticality: 0.95,
    reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.CAPACITY],
  },
  {
    id: 'code-undefined-contract',domain: DOMAIN.CODE,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'undefined_contract',
    description: 'Function called with no documented or enforced input contract',
    detection: 'public function with zero input validation and no type annotation',
    criticality: 0.80,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'code-missing-test',      domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'missing_test_coverage',
    description: 'Code path exists with no corresponding test',
    detection: 'coverage < threshold on non-trivial branch',
    criticality: 0.75,
    reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.CAPACITY],
  },
  {
    id: 'code-race-condition',    domain: DOMAIN.CODE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'race_condition',
    description: 'Shared state accessed by concurrent operations without synchronisation',
    detection: 'concurrent_write + shared_resource + no_mutex',
    criticality: 0.90,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
    as_above: 'In music: two instruments entering without rhythmic coordination — gap is the beat they both missed.',
  },
  {
    id: 'code-tech-debt',         domain: DOMAIN.CODE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'technical_debt',
    description: 'Shortcut creates future obligation — obligation not recorded',
    detection: 'shortcut_pattern without ledger entry',
    criticality: 0.70,
    reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.CAPACITY],
  },
  {
    id: 'code-implicit-assumption',domain: DOMAIN.CODE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'implicit_env_assumption',
    description: 'Code assumes environment, state, or ordering never verified',
    detection: 'env_reference without validation',
    criticality: 0.85,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'code-abstraction-leak',  domain: DOMAIN.CODE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'abstraction_leak',
    description: 'Abstraction assumed to hide complexity completely — edge cases leak',
    detection: 'abstraction boundary violated; internal state accessed directly',
    criticality: 0.75,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'code-scale-assumption',  domain: DOMAIN.CODE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'scale_gap',
    description: 'Behaviour at small scale assumed to hold at large scale',
    detection: 'no load test; no capacity model; linear extrapolation',
    criticality: 0.80,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'code-security-assumption',domain: DOMAIN.SECURITY,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'security_assumption',
    description: 'Security model assumes threat model that doesn\'t match reality',
    detection: 'threat_model missing adversarial assumption',
    criticality: 0.95,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.ATTENTION],
  },
  {
    id: 'code-no-uuid',           domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'missing_uuid_hook',
    description: 'Module has no UUID or hook — cannot be tracked or audited',
    detection: 'exported module without UUID identifier',
    criticality: 0.85,
    reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.COMPRESSION],
  },
  {
    id: 'code-monkey-patch',      domain: DOMAIN.CODE,
    type: GAP_TYPE.CONTRADICTION, subtype: 'monkey_patch',
    description: 'Runtime mutation of objects not owned by caller — §5.3 violation',
    detection: 'Object.prototype mutation; global namespace pollution',
    criticality: 0.90,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'code-missing-error-boundary', domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'missing_error_boundary',
    description: 'Error propagates uncaught — no graceful handling',
    detection: 'async path without error handler; missing fallback',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
  },
  // JavaScript
  {
    id: 'code-js-typeof-null',    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'typeof_null_bug',
    description: 'typeof null === "object" treated as truth',
    criticality: 0.70, reason: [GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'code-js-floating-point', domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'floating_point_equality',
    description: '0.1 + 0.2 !== 0.3 — float equality assumed without epsilon',
    criticality: 0.75, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'code-js-async-no-await', domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.OBLIGATION,    subtype: 'unawaited_promise',
    description: 'Promise returned but not awaited — errors silently swallowed',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },
  {
    id: 'code-js-closure-loop',   domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.TEMPORAL,      subtype: 'closure_in_loop',
    description: 'Closure captures loop variable by reference — all see final value',
    criticality: 0.75, reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'code-js-this-binding',   domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'this_binding_loss',
    description: 'this assumed bound but context is lost on method extraction',
    criticality: 0.70, reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'code-js-mutation-shared',domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'shared_object_mutation',
    description: 'Object passed by reference mutated — caller\'s state changes',
    criticality: 0.75, reason: [GAP_REASON.ATTENTION],
  },
  // TypeScript
  {
    id: 'code-ts-any-escape',     domain: DOMAIN.LANG_TS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'any_type_escape',
    description: 'TypeScript type system bypassed via any',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'code-ts-non-null-assertion', domain: DOMAIN.LANG_TS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'non_null_assertion',
    description: 'Null check bypassed with ! — runtime crash if wrong',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },
  {
    id: 'code-ts-type-widening',  domain: DOMAIN.LANG_TS,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'type_widening',
    description: 'Type inferred as broader than intended',
    criticality: 0.65, reason: [GAP_REASON.STRUCTURAL_LIMIT],
  },
  // Python
  {
    id: 'code-py-mutable-default',domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'mutable_default_arg',
    description: 'Mutable default argument shared across all calls',
    criticality: 0.85, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
    example: 'def f(x=[]): — state accumulates across calls',
  },
  {
    id: 'code-py-late-binding',   domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.TEMPORAL,      subtype: 'late_binding_closure',
    description: 'Lambda/closure in loop binds variable at call time, not definition time',
    criticality: 0.75, reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'code-py-bare-except',    domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.OBLIGATION,    subtype: 'bare_except',
    description: 'bare except catches everything including KeyboardInterrupt',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.COMPRESSION],
  },
  {
    id: 'code-py-gil-assumption',  domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'gil_assumption',
    description: 'Python GIL assumed to protect shared state in multi-threaded context',
    criticality: 0.80, reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  // SQL / Database
  {
    id: 'code-sql-injection',     domain: DOMAIN.LANG_SQL,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'sql_injection_surface',
    description: 'User input concatenated into SQL — assumption that input is safe',
    detection: 'string interpolation into SQL string',
    criticality: 1.00,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'code-sql-n-plus-one',    domain: DOMAIN.DATABASE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'n_plus_one_query',
    description: 'N+1 database calls instead of 1 — query in loop',
    criticality: 0.85, reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
  },
  {
    id: 'code-sql-missing-index', domain: DOMAIN.DATABASE,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'missing_index',
    description: 'Column queried without index — full table scan at scale',
    criticality: 0.75, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.ATTENTION],
  },
  {
    id: 'code-sql-missing-transaction', domain: DOMAIN.DATABASE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'missing_transaction',
    description: 'Multiple related writes not wrapped in transaction',
    criticality: 0.90, reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
  },
  // QA / Testing
  {
    id: 'qa-test-coverage-illusion', domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'coverage_illusion',
    description: 'High coverage % with no assertions — tests that can\'t fail',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'qa-test-time-dependency',domain: DOMAIN.QA,
    type: GAP_TYPE.TEMPORAL,      subtype: 'time_dependent_test',
    description: 'Test behaviour changes based on clock — flaky at midnight',
    criticality: 0.80, reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'qa-test-ordering',       domain: DOMAIN.QA,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'test_order_dependency',
    description: 'Tests pass only in specific order — shared state',
    criticality: 0.85, reason: [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'qa-missing-edge-case',   domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'missing_edge_case',
    description: 'Happy path tested; edge cases (empty, null, max) untested',
    criticality: 0.80, reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'qa-mock-not-reality',    domain: DOMAIN.QA,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'mock_divergence',
    description: 'Mock no longer matches real dependency — tests pass, production fails',
    criticality: 0.90, reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
    reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'qa-no-load-test',        domain: DOMAIN.QA,
    type: GAP_TYPE.TEMPORAL,      subtype: 'no_load_test',
    description: 'System ships without ever being tested under production load',
    criticality: 0.80, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.CAPACITY],
  },
  {
    id: 'qa-integration-gap',     domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'integration_gap',
    description: 'Units tested in isolation; integration never tested',
    criticality: 0.85, reason: [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
  },
  // API / Architecture
  {
    id: 'api-breaking-change',    domain: DOMAIN.API_DESIGN,
    type: GAP_TYPE.OBLIGATION,    subtype: 'breaking_change',
    description: 'API contract changed without versioning — callers silently break',
    criticality: 0.95, reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'api-no-rate-limit',      domain: DOMAIN.API_DESIGN,
    type: GAP_TYPE.OBLIGATION,    subtype: 'no_rate_limit',
    description: 'Public API endpoint with no rate limiting',
    criticality: 0.85, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.ATTENTION],
  },
  {
    id: 'api-no-auth',            domain: DOMAIN.API_DESIGN,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'missing_auth',
    description: 'Endpoint assumes caller is authenticated without verifying',
    criticality: 1.00, reason: [GAP_REASON.ATTENTION, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'arch-single-point-failure', domain: DOMAIN.SOFTWARE_ARCH,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'single_point_of_failure',
    description: 'Critical component with no fallback',
    criticality: 0.95, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'arch-missing-idempotency', domain: DOMAIN.SOFTWARE_ARCH,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'missing_idempotency',
    description: 'Operation assumed to execute once — retry causes duplicate',
    criticality: 0.85, reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'arch-coupling',          domain: DOMAIN.SOFTWARE_ARCH,
    type: GAP_TYPE.OBLIGATION,    subtype: 'tight_coupling',
    description: 'Modules directly call each other — §5.7 violation',
    criticality: 0.80, reason: [GAP_REASON.COMPRESSION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  // AI/ML
  {
    id: 'ai-spec-gap',            domain: DOMAIN.AI_ML,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'specification_gap',
    description: 'System optimises for specified metric while violating unstated constraints — Goodhart\'s Law',
    criticality: 0.90, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'ai-distribution-shift',  domain: DOMAIN.AI_ML,
    type: GAP_TYPE.TEMPORAL,      subtype: 'distribution_shift',
    description: 'Model trained on past distribution deployed on shifted real-world distribution',
    criticality: 0.90, reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
    reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'ai-hallucination',       domain: DOMAIN.AI_ML,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'hallucination',
    description: 'Model generates confident output not grounded in training or reality',
    criticality: 0.95, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPRESSION],
  },
  {
    id: 'ai-alignment',           domain: DOMAIN.AI_ML,
    type: GAP_TYPE.OBLIGATION,    subtype: 'alignment_gap',
    description: 'AI optimises stated objective while violating unstated values',
    criticality: 1.00, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'ai-interpretability',    domain: DOMAIN.AI_ML,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'interpretability_gap',
    description: 'System produces outputs without traceable reasoning chain — black box',
    criticality: 0.85, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPRESSION],
  },

  // ════════════════════════════════════════════════════════
  // CREATIVE & NARRATIVE (U8)
  // ════════════════════════════════════════════════════════
  {
    id: 'narr-premise',           domain: DOMAIN.NARRATIVE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'premise_gap',
    description: 'Story built on foundational premise the audience must accept — never examined',
    detection: 'narrative_foundation node is unexamined assumption',
    criticality: 0.85,
    reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.IDENTITY_REFLECTION],
    example: '"Redemption requires suffering" — installed in countless narratives',
  },
  {
    id: 'narr-representation',    domain: DOMAIN.NARRATIVE,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'representation_gap',
    description: 'Work claims to represent reality but systematically excludes experiences',
    criticality: 0.75, reason: [GAP_REASON.ATTENTION, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'narr-genre-constraint',  domain: DOMAIN.NARRATIVE,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'genre_constraint_gap',
    description: 'Genre conventions treated as natural laws — innovation blocked',
    criticality: 0.70, reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'narr-coherence',         domain: DOMAIN.NARRATIVE,
    type: GAP_TYPE.CONTRADICTION, subtype: 'coherence_gap',
    description: 'Work contains internal contradictions that cannot coexist in established world',
    criticality: 0.75, reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
  },
  {
    id: 'narr-novelty',           domain: DOMAIN.NARRATIVE,
    type: GAP_TYPE.TEMPORAL,      subtype: 'novelty_gap',
    description: 'Work claimed as new without prior art search',
    criticality: 0.65, reason: [GAP_REASON.ATTENTION, GAP_REASON.IDENTITY_REFLECTION],
  },

  // ════════════════════════════════════════════════════════
  // MUSIC — THEORY, HARMONY, RHYTHM, LYRICS, SONGWRITING
  // ════════════════════════════════════════════════════════
  {
    id: 'music-unresolved-tension', domain: DOMAIN.HARMONY,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.UNRESOLVED_TENSION,
    description: 'Harmonic tension (V, vii°) without resolution — gap field open indefinitely',
    signal: 'Dominant function chord at phrase end with no resolution',
    detection: 'V → (no I) at phrase boundary',
    criticality: 0.80,
    reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.AVOIDANCE],
    field_note: 'Uncertainty weight = 1 - resolution_probability. Hook lives at maximum unresolved tension.',
    as_above: 'In relationships: unsaid thing at the end of every conversation. In code: unhandled promise chain.',
  },
  {
    id: 'music-missing-cadence',  domain: DOMAIN.HARMONY,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.MISSING_CADENCE,
    description: 'Phrase ends without harmonic closure — listener expectation unmet',
    criticality: 0.75, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'music-tritone-unresolved', domain: DOMAIN.HARMONY,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.TRITONE_UNRESOLVED,
    description: 'Tritone — the most dissonant interval — not resolved. Maximum harmonic gap.',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
    as_above: 'In conversation: the word that wants to be said and isn\'t. In data: the outlier that invalidates the model.',
  },
  {
    id: 'music-voice-leading',    domain: DOMAIN.HARMONY,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.VOICE_LEADING_GAP,
    description: 'Leap where stepwise motion expected — gap in melodic continuity',
    criticality: 0.65, reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
  },
  {
    id: 'music-missing-downbeat', domain: DOMAIN.RHYTHM,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.MISSING_DOWNBEAT,
    description: 'Structural rhythmic anchor absent — listener expectation unanchored',
    criticality: 0.75, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.ATTENTION],
    as_above: 'In argument: the premise that was skipped. In conversation: the acknowledgment that never came.',
  },
  {
    id: 'music-metric-ambiguity', domain: DOMAIN.RHYTHM,
    type: GAP_TYPE.DEFINITIONAL,  subtype: MUSIC_GAP_SUBTYPE.METRIC_AMBIGUITY,
    description: 'Meter unclear — listener cannot establish expectation',
    criticality: 0.70, reason: [GAP_REASON.COMPRESSION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'music-syncopation-gap',  domain: DOMAIN.RHYTHM,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.SYNCOPATION_GAP,
    description: 'Syncopation creates expectation of landing — landing absent',
    criticality: 0.65, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.AVOIDANCE],
    field_note: 'Syncopation is a structured deferred variable — gap pressure rises until landing.',
  },
  {
    id: 'music-missing-bridge',   domain: DOMAIN.SONGWRITING,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.MISSING_BRIDGE,
    description: 'No pivot section — song has only tension and release, never the turn',
    detection: 'section_types has no bridge element',
    criticality: 0.65,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
    as_above: 'In argument: the third position that resolves a binary. In relationships: the conversation that never happened.',
  },
  {
    id: 'music-missing-hook',     domain: DOMAIN.SONGWRITING,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.MISSING_HOOK,
    description: 'No identifiable center of gravity — no point of maximum gap-field pressure',
    criticality: 0.85, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'music-intro-outro-mismatch', domain: DOMAIN.SONGWRITING,
    type: GAP_TYPE.CONTRADICTION, subtype: MUSIC_GAP_SUBTYPE.INTRO_OUTRO_MISMATCH,
    description: 'Intro sets field. No outro means the opening gap never closes.',
    criticality: 0.60, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'music-dynamic-plateau',  domain: DOMAIN.SONGWRITING,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.DYNAMIC_PLATEAU,
    description: 'Dynamics flat where arc expected — no emotional gradient',
    criticality: 0.65, reason: [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
  },
  // Lyric-specific
  {
    id: 'lyric-word-beat-misalign', domain: DOMAIN.LYRICS,
    type: GAP_TYPE.CONTRADICTION, subtype: MUSIC_GAP_SUBTYPE.WORD_BEAT_MISALIGN,
    description: 'Lyric stress and musical stress don\'t match — listener dissonance',
    criticality: 0.70, reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
    field_note: 'The natural iambic stress of English collides with the musical downbeat.',
  },
  {
    id: 'lyric-meaning-melody-contra', domain: DOMAIN.LYRICS,
    type: GAP_TYPE.CONTRADICTION, subtype: MUSIC_GAP_SUBTYPE.MEANING_MELODY_CONTRA,
    description: 'Lyric meaning contradicts melodic contour — ascending melody on descending content',
    criticality: 0.65, reason: [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
    example: 'Singing "I\'m falling" on a rising melodic phrase. Tension as art or as gap — depends on intent.',
  },
  {
    id: 'lyric-rhyme-forced',     domain: DOMAIN.LYRICS,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.RHYME_FORCED,
    description: 'Rhyme forces unnatural word choice — precision sacrificed for scheme',
    criticality: 0.65, reason: [GAP_REASON.COMPRESSION, GAP_REASON.NARRATIVE_SOOTHING],
    field_note: 'Omitted variable: the word that actually fits the meaning.',
  },
  {
    id: 'lyric-slant-rhyme-unresolved', domain: DOMAIN.LYRICS,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.SLANT_RHYME_UNRESOLVED,
    description: 'Slant rhyme opens a gap — never returns to close it. Uncertainty weight held open.',
    criticality: 0.50, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.AVOIDANCE],
    field_note: 'Slant rhyme = inferred precision. The listener fills the gap with their own word.',
  },
  {
    id: 'lyric-pivot-missing',    domain: DOMAIN.LYRICS,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.PIVOT_MISSING,
    description: 'Emotional arc has no pivot — tension never turns to resolution',
    criticality: 0.75, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'lyric-pivot-early',      domain: DOMAIN.LYRICS,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.PIVOT_EARLY,
    description: 'Resolution arrives before tension builds — catharsis without stakes',
    criticality: 0.65, reason: [GAP_REASON.COMPRESSION, GAP_REASON.CAPACITY],
  },
  {
    id: 'lyric-cliche-substitution', domain: DOMAIN.LYRICS,
    type: GAP_TYPE.EVIDENTIAL,    subtype: MUSIC_GAP_SUBTYPE.CLICHE_SUBSTITUTION,
    description: 'Cliché substitutes for specific image — omitted variable: the actual experience',
    criticality: 0.60, reason: [GAP_REASON.COMPRESSION, GAP_REASON.NARRATIVE_SOOTHING],
    field_note: 'Omitted variable importance = how much the specific image would have revealed.',
  },
  {
    id: 'lyric-syllable-overflow',domain: DOMAIN.LYRICS,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.SYLLABLE_OVERFLOW,
    description: 'Too many syllables for the beat — field breaks, delivery rushes',
    criticality: 0.65, reason: [GAP_REASON.COMPRESSION, GAP_REASON.CAPACITY],
    field_note: 'Information density exceeds bandwidth — compression artefact in lyric.',
  },
  {
    id: 'lyric-word-flow-break',  domain: DOMAIN.LYRICS,
    type: GAP_TYPE.TEMPORAL,      subtype: MUSIC_GAP_SUBTYPE.WORD_FLOW_BREAK,
    description: 'Natural speech rhythm broken by forced delivery — listener loses flow',
    criticality: 0.60, reason: [GAP_REASON.COMPRESSION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'lyric-vowel-stress',     domain: DOMAIN.LYRICS,
    type: GAP_TYPE.CONTRADICTION, subtype: MUSIC_GAP_SUBTYPE.VOWEL_STRESS_GAP,
    description: 'Vowel elongation in song context differs from natural speech — phonetic gap',
    criticality: 0.55, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPATIBILITY],
    field_note: 'The song puts stress on a vowel that speech would not. Gap between linguistic and musical systems.',
  },
  {
    id: 'lyric-pronoun-ambiguity',domain: DOMAIN.LYRICS,
    type: GAP_TYPE.DEFINITIONAL,  subtype: MUSIC_GAP_SUBTYPE.PRONOUN_AMBIGUITY,
    description: 'Pronoun referent unclear — inferred variable, listener fills the gap',
    criticality: 0.50, reason: [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
    field_note: 'Ambiguous pronouns in lyrics are deferred variables — the listener\'s inference IS the meaning.',
  },
  {
    id: 'lyric-deferred-resolution', domain: DOMAIN.LYRICS,
    type: GAP_TYPE.OBLIGATION,    subtype: MUSIC_GAP_SUBTYPE.DEFERRED_RESOLUTION,
    description: 'Emotional content deferred to next section — explicit gap field created',
    criticality: 0.60, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.NARRATIVE_SOOTHING],
    field_note: 'The gap between verse and chorus IS the hook — maximum field pressure at the seam.',
  },

  // ════════════════════════════════════════════════════════
  // FIELD THEORY GAPS (geometric/signal language)
  // ════════════════════════════════════════════════════════
  {
    id: 'field-inflection',       domain: DOMAIN.FIELD,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.INFLECTION,
    description: 'Curve changes from concave to convex — pivot point in any sequence',
    signal: 'Second derivative changes sign',
    detection: 'd²f/dx² = 0 at this coordinate',
    criticality: 0.75,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.DEFERRED_VARIABLE],
    as_above: 'In relationships: the moment where growth turns to stagnation. In music: the bar where the melody peaks.',
  },
  {
    id: 'field-plateau',          domain: DOMAIN.FIELD,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.PLATEAU,
    description: 'Derivative ≈ 0 sustained — stagnation or stability, context determines which',
    detection: '|df/dx| < ε for N consecutive samples',
    criticality: 0.60,
    reason: [GAP_REASON.CAPACITY, GAP_REASON.AVOIDANCE],
    as_above: 'In career: the stuck year. In music: the song that doesn\'t build. In code: the metric that stopped moving.',
  },
  {
    id: 'field-oscillation',      domain: DOMAIN.FIELD,
    type: GAP_TYPE.OSCILLATORY,   subtype: FIELD_GAP_SUBTYPE.OSCILLATION,
    description: 'Regular cycling between two states — neither commits. Sigma OSCILLATORY regime.',
    detection: 'O threshold exceeded in sigma regime detector',
    criticality: 0.80,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
    as_above: 'In relationships: the fight that happens every month. In systems: the AB test that never decides.',
    field_note: 'Oscillation generates energy. The gap is: what prevents commitment to one state?',
  },
  {
    id: 'field-resonance',        domain: DOMAIN.FIELD,
    type: GAP_TYPE.OSCILLATORY,   subtype: FIELD_GAP_SUBTYPE.RESONANCE,
    description: 'Oscillation amplified by matching frequency — amplitude grows toward structural failure',
    detection: 'input frequency matches system natural frequency; amplitude increasing',
    criticality: 0.85,
    reason: [GAP_REASON.COMPATIBILITY, GAP_REASON.STRUCTURAL_LIMIT],
    as_above: 'Trauma resonance: new situation matches old pattern, old response fires. Tacoma Narrows Bridge.',
  },
  {
    id: 'field-damped-oscillation', domain: DOMAIN.FIELD,
    type: GAP_TYPE.OSCILLATORY,   subtype: FIELD_GAP_SUBTYPE.DAMPED_OSCILLATION,
    description: 'Oscillation decaying toward stable state — healthy resolution pattern in progress',
    detection: 'oscillation amplitude decreasing monotonically',
    criticality: 0.40,
    reason: [GAP_REASON.CAPACITY, GAP_REASON.DEFERRED_VARIABLE],
    field_note: 'Low criticality because this is the correct behavior of a system that is resolving.',
  },
  {
    id: 'field-phase-shift',      domain: DOMAIN.FIELD,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.PHASE_SHIFT,
    description: 'Same wave, shifted in time — synchrony gap between two systems',
    detection: 'two signals with same frequency but non-zero phase difference',
    criticality: 0.65,
    reason: [GAP_REASON.COMPATIBILITY, GAP_REASON.ATTENTION],
    as_above: 'Partners on different emotional timelines. Musicians who have the same groove but are not locked.',
  },
  {
    id: 'field-hard-edge',        domain: DOMAIN.EDGE,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.HARD_EDGE,
    description: 'Abrupt transition — maximum information density at this coordinate',
    detection: '|gradient| > hard_edge_threshold',
    criticality: 0.70,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
    field_note: 'Hard edges are the most information-rich points. The gap before and after are structurally different.',
    as_above: 'Death, divorce, diagnosis, release — hard edges in a life. Bar 32 of a song where everything changes.',
  },
  {
    id: 'field-soft-edge',        domain: DOMAIN.EDGE,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.SOFT_EDGE,
    description: 'Gradual transition — information spread over time, harder to detect',
    detection: '|gradient| low over many samples',
    criticality: 0.50,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'field-blurred-edge',     domain: DOMAIN.EDGE,
    type: GAP_TYPE.DEFINITIONAL,  subtype: FIELD_GAP_SUBTYPE.BLURRED_EDGE,
    description: 'Edge that should be hard is soft — unclear boundary where clear one expected',
    detection: 'expected hard_edge not found; gradient diffused',
    criticality: 0.70,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
    as_above: 'Relationship status undefined. System boundary unclear. Lyric verse with no chorus break.',
  },
  {
    id: 'field-asymptote',        domain: DOMAIN.FIELD,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.ASYMPTOTE,
    description: 'Approaching but never reaching — structural limit gap',
    detection: 'distance to target → 0 but never crosses',
    criticality: 0.75,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
    as_above: 'Zeno\'s paradox. Always almost there. Perfectionism that prevents completion.',
  },
  {
    id: 'field-aliasing',         domain: DOMAIN.SIGNAL,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.ALIASING,
    description: 'Signal sampled too infrequently — gaps appear that don\'t exist in reality',
    detection: 'sampling_rate < 2 × highest_frequency (Nyquist violation)',
    criticality: 0.70,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPRESSION],
    as_above: 'Checking in once a year on a relationship. Weekly meetings on a daily-changing project.',
  },
  {
    id: 'field-fractal-gap',      domain: DOMAIN.FIELD,
    type: GAP_TYPE.ASSUMPTION,    subtype: FIELD_GAP_SUBTYPE.FRACTAL_GAP,
    description: 'Same gap pattern appearing at multiple scales — as above, so below',
    detection: 'self-similar gap structure detected at micro, meso, macro scale',
    criticality: 0.85,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.IDENTITY_REFLECTION],
    field_note: 'The most important gaps are scale-invariant. Find them at any scale and you find them everywhere.',
    as_above: 'The avoidance in the lyric line mirrors the avoidance in the album arc mirrors the avoidance in the artist\'s career.',
  },
  {
    id: 'field-micro-macro-divergence', domain: DOMAIN.FIELD,
    type: GAP_TYPE.CONTRADICTION, subtype: FIELD_GAP_SUBTYPE.MICRO_MACRO_DIVERGENCE,
    description: 'Pattern holds at one scale, breaks at another — boundary detection',
    detection: 'gap_pattern at scale_n ≠ gap_pattern at scale_m',
    criticality: 0.80,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'field-interference',     domain: DOMAIN.SIGNAL,
    type: GAP_TYPE.CONTRADICTION, subtype: FIELD_GAP_SUBTYPE.INTERFERENCE,
    description: 'Two waves interacting — constructive or destructive. The gap is what wasn\'t predicted.',
    detection: 'superposition of two signals produces unexpected amplitude pattern',
    criticality: 0.65,
    reason: [GAP_REASON.COMPATIBILITY, GAP_REASON.ATTENTION],
    as_above: 'Two arguments active simultaneously — they don\'t add, they interfere.',
  },
  {
    id: 'field-harmonic-gap',     domain: DOMAIN.SIGNAL,
    type: GAP_TYPE.TEMPORAL,      subtype: FIELD_GAP_SUBTYPE.HARMONIC_GAP,
    description: 'Expected harmonic absent from series — gap in frequency structure',
    detection: 'harmonic_series has missing frequency node',
    criticality: 0.70,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
    as_above: 'In music: the missing overtone that makes the sound feel hollow. In argument: the missing premise.',
  },

  // ════════════════════════════════════════════════════════
  // RELATIONAL DOMAIN — from RELATIONAL MD
  // ════════════════════════════════════════════════════════
  // Defensive patterns
  {
    id: 'rel-deflection',         domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.LOGICAL,       subtype: 'deflection',
    description: 'Response addresses something other than the actual claim made',
    detection: 'response has no causal path back to input claim',
    criticality: 0.75, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-counter-attack',     domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.OBLIGATION,    subtype: 'counter_attack',
    description: 'Challenge met with challenge — original claim never addressed',
    detection: 'original obligation_node has no downstream resolution edge',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-minimization',       domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'minimization',
    description: 'Impact of an event denied without evidence',
    detection: 'counter-claim has no evidential basis',
    criticality: 0.75, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'rel-victimhood-inversion', domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.CONTRADICTION, subtype: 'victimhood_inversion',
    description: 'Person who caused harm positions themselves as the harmed party',
    detection: 'harm_claim and responsibility_claim point to same actor',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },
  // Manipulation
  {
    id: 'rel-guilt-induction',    domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.LOGICAL,       subtype: 'guilt_induction',
    description: 'Target made responsible for outcomes they did not cause',
    detection: 'guilt_claim has no valid causal path — assumption injected as premise',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-obligation-manufacture', domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OBLIGATION,    subtype: 'obligation_manufacture',
    description: 'Debt created without consent, called in as binding obligation',
    detection: 'obligation_node has no prior consent_edge',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'rel-love-withdrawal',    domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.CONDITION,     subtype: 'love_withdrawal_leverage',
    description: 'Affection made conditional on compliance — threat to control behavior',
    detection: 'affection withdrawal has causal_edge to non-compliance',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-moving-goalposts',   domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'moving_goalposts',
    description: 'Requirement keeps changing — target can never satisfy it',
    detection: 'definition_node mutates across time — same term, different satisfaction criteria',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'rel-triangulation',      domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.REFERENCE,     subtype: 'triangulation',
    description: 'Third party introduced to manufacture insecurity',
    detection: 'third_party_reference has no causal edge to current claim',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-future-faking',      domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OBLIGATION,    subtype: 'future_faking',
    description: 'Future promises to secure present compliance — pattern of non-fulfillment in ledger',
    detection: 'obligation_node(future) without enforcement + prior identical obligations unresolved',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'rel-intermittent-reinforcement', domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OSCILLATORY,   subtype: 'intermittent_reinforcement',
    description: 'Unpredictable alternation between warmth and withdrawal — trauma bonding',
    detection: 'sigma OSCILLATORY on warmth signal — O threshold exceeded',
    criticality: 0.95, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
    as_above: 'In music: the song that gives you the hook then takes it away before you can land.',
  },
  {
    id: 'rel-scarcity-manufacture', domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'scarcity_manufacture',
    description: 'Artificial scarcity of affection used to increase compliance',
    detection: 'silent premise: "this is the only source of what you need"',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  // Control
  {
    id: 'rel-information-control',domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.REFERENCE,     subtype: 'information_control',
    description: 'Target\'s access to information or verification restricted',
    detection: 'reference_nodes blocked — target cannot resolve claims independently',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'rel-isolation',          domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.ISOLATION,     subtype: 'isolation',
    description: 'Target removed from external verification sources',
    detection: 'network_nodes drop from target\'s accessible reference set over time',
    criticality: 0.95, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'rel-financial-control',  domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OBLIGATION,    subtype: 'financial_control',
    description: 'Economic dependency manufactured to prevent exit',
    detection: 'target has no independent resource path',
    criticality: 0.90, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
  },
  // Gaslighting (all six operations)
  {
    id: 'gas-event-denial',       domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'gaslighting_event_denial',
    description: 'Layer 1 attack: "That never happened" — pure assertion against documented experience',
    detection: 'denial_claim has no evidential basis',
    criticality: 0.95, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'gas-severity-min',       domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'gaslighting_severity_minimization',
    description: 'Layer 1+3 attack: acknowledge event but deny impact',
    detection: 'minimization_claim has no causal path to impact evidence',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'gas-memory-attack',      domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.REFERENCE,     subtype: 'gaslighting_memory_attack',
    description: 'Layer 1 attack on past: "Your memory is terrible"',
    detection: 'source_attack pattern — validity attacked via source credibility, not counter-evidence',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'gas-pathologizing',      domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'gaslighting_pathologizing',
    description: 'Layer 3 attack: "You\'re too emotional" — response framed as dysfunction',
    detection: 'pathologizing_claim deployed in response to legitimate emotional expression',
    criticality: 0.95, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'gas-consensus-attack',   domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.REFERENCE,     subtype: 'gaslighting_consensus_attack',
    description: 'Layer 6 attack: "Everyone thinks you\'re overreacting"',
    detection: 'third_party claims unverifiable — reference nodes cannot be independently resolved',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ISOLATION],
  },
  {
    id: 'gas-identity-destabilization', domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.IDENTITY_ATTACK, subtype: 'gaslighting_identity_destabilization',
    description: 'Layer 5 attack: make the target\'s perception of themselves the problem',
    detection: 'character_claim has no evidential basis; appears consistently in response to legitimate concerns',
    criticality: 1.00, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },
  // Communication health
  {
    id: 'rel-intent-impact',      domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.LOGICAL,       subtype: 'intent_impact_gap',
    description: 'Good intent claimed as proof that harm did not occur',
    detection: 'intent_claim positioned as negation of impact_claim',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
    example: '"I didn\'t mean it that way so you shouldn\'t feel hurt"',
  },
  {
    id: 'rel-alignment-skip',     domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.LOGICAL,       subtype: 'alignment_layer_skip',
    description: 'Trying to resolve Layer 5 (what happens next) when gap is at Layer 1 (what happened)',
    detection: 'solution_node before acknowledgment_node; factual_gap unresolved',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.COMPRESSION],
  },
  {
    id: 'rel-unexpressed-expectation', domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'unexpressed_expectation',
    description: 'Expectation held without being communicated — other party cannot know',
    detection: 'expectation_node without communication_event',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-solution-bypass',    domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.OBLIGATION,    subtype: 'solution_bypass_invalidation',
    description: 'Solution offered instead of acknowledgment — skips emotional processing',
    detection: 'solution_node before acknowledgment_node',
    criticality: 0.75, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.COMPRESSION],
  },
  // Invalidation types
  {
    id: 'rel-direct-invalidation',domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'direct_invalidation',
    description: '"You don\'t actually feel that way" — experience explicitly denied',
    detection: 'experiential_claim attacked via assertion — zero premises',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-logical-invalidation',domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.LOGICAL,       subtype: 'logical_invalidation',
    description: 'Emotion invalidated by pointing out it\'s "irrational" — category error',
    detection: 'logical_validity criteria applied to emotional claim — domain mismatch',
    criticality: 0.80, reason: [GAP_REASON.COMPATIBILITY, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'rel-silver-lining-weapon', domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'silver_lining_weaponization',
    description: 'Positive reframe deployed before harm is processed — prevents acknowledgment',
    detection: 'resolution_node appears before harm_node is complete',
    criticality: 0.75, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  // Verbal/Emotional abuse
  {
    id: 'rel-contempt',           domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.IDENTITY_ATTACK, subtype: 'contempt',
    description: 'Disgust, mockery, condescension — attacks target\'s standing to communicate',
    detection: 'contempt_markers in delivery regardless of content',
    criticality: 0.95, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
    field_note: 'Gottman: strongest predictor of dissolution. Contempt = identity_attack on the communication layer.',
  },
  {
    id: 'rel-silent-treatment',   domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OBLIGATION,    subtype: 'silent_treatment',
    description: 'Withdrawal of communication as punishment — correlated with prior target autonomy',
    detection: 'communication_event_gap correlated with prior autonomy_assertion',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'rel-emotional-neglect',  domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OBLIGATION,    subtype: 'emotional_neglect',
    description: 'Consistent failure to acknowledge emotional experience — not a single event, a pattern',
    detection: 'acknowledgment_node absent across extended ledger sequence',
    criticality: 0.90, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },
  {
    id: 'rel-love-bombing-devaluation', domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OSCILLATORY,   subtype: 'love_bombing_devaluation',
    description: 'Intense idealization then systematic devaluation — sigma OSCILLATORY, trauma bond',
    detection: 'high-amplitude oscillation on warmth signal with no stable baseline',
    criticality: 0.95, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
    as_above: 'In music: the album that promises everything in track 1 and delivers diminishing returns.',
  },
  {
    id: 'rel-parentification',    domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.HIERARCHY,     subtype: 'emotional_parentification',
    description: 'Target made responsible for abuser\'s emotional regulation — inverted hierarchy',
    detection: 'target_regulation_obligation points to abuser\'s emotional state',
    criticality: 0.90, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
  },

  // ════════════════════════════════════════════════════════
  // IDENTITY / EXISTENTIAL (U9)
  // ════════════════════════════════════════════════════════
  {
    id: 'exist-identity-assumption', domain: DOMAIN.IDENTITY,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'identity_assumption',
    description: 'Core belief about self treated as fact — never examined as a belief',
    detection: 'identity_claim without evidential basis or with outdated evidence',
    criticality: 0.90,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.AVOIDANCE],
    example: '"I\'m not creative"; "I\'m bad with money"; "This is just who I am"',
  },
  {
    id: 'exist-values-gap',       domain: DOMAIN.VALUES,
    type: GAP_TYPE.CONTRADICTION, subtype: 'values_behaviour_gap',
    description: 'Stated values contradict revealed preferences',
    detection: 'stated_value_node contradicts behavioural_evidence_node over time',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'exist-meaning-spof',     domain: DOMAIN.PURPOSE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'meaning_single_point_failure',
    description: 'Source of meaning assumed stable — no contingency if it disappears',
    detection: 'meaning_source_node without fallback; single-point-of-failure',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },
  {
    id: 'exist-purpose-gap',      domain: DOMAIN.PURPOSE,
    type: GAP_TYPE.LOGICAL,       subtype: 'purpose_gap',
    description: 'Actions not connected to any stated purpose — means/ends chain broken',
    detection: 'action_nodes without causal_path to purpose_node',
    criticality: 0.80,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },
  {
    id: 'exist-temporal-self',    domain: DOMAIN.IDENTITY,
    type: GAP_TYPE.TEMPORAL,      subtype: 'temporal_self_concept',
    description: 'Self-concept based on past version of self — doesn\'t reflect current reality',
    detection: 'self_concept_node without recent evidence update',
    criticality: 0.80,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'exist-shadow-gap',       domain: DOMAIN.IDENTITY,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'shadow_gap',
    description: 'Disowned aspects of self projected onto others',
    detection: 'strong_negative_reaction without self_examination_edge; pattern repeated',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'exist-existential-avoidance', domain: DOMAIN.MEANING,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'existential_avoidance',
    description: 'Questions about mortality, meaning, freedom systematically avoided — driving all decisions',
    detection: 'major_decision_node without examined existential premise',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'exist-belief-origin',    domain: DOMAIN.BELIEF,
    type: GAP_TYPE.REFERENCE,     subtype: 'belief_origin_gap',
    description: 'Belief held without knowing where it came from — or origin untrusted but belief kept',
    detection: 'belief_node has no traceable origin; or origin flagged unreliable without update',
    criticality: 0.80,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },

  // ════════════════════════════════════════════════════════
  // ETHICS / MORAL (U10)
  // ════════════════════════════════════════════════════════
  {
    id: 'eth-is-ought',           domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,       subtype: 'is_ought_gap',
    description: '"What is" used to derive "what ought to be" without acknowledging the jump',
    detection: 'descriptive_claim has direct causal_edge to normative_claim',
    criticality: 0.85,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'eth-framework-assumption', domain: DOMAIN.ETHICS,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'moral_framework_assumption',
    description: 'Ethical framework applied without acknowledging it is one of several',
    detection: 'moral_claim without framework_declaration',
    criticality: 0.80,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'eth-scope-insensitivity',domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,       subtype: 'scope_insensitivity',
    description: 'Moral response doesn\'t scale with magnitude of harm',
    detection: 'moral_weight_node does not scale with harm_magnitude_node',
    criticality: 0.80,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'eth-motivated',          domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,       subtype: 'motivated_ethics',
    description: 'Ethical reasoning consistently produces conclusions convenient for reasoner',
    detection: 'ethical_conclusions cluster toward speaker_interest',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'eth-structural-individual', domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,       subtype: 'structural_individual_gap',
    description: 'Systemic problem attributed entirely to individual or vice versa',
    detection: 'causation_claim assigns 100% to one level',
    criticality: 0.80,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.IDENTITY_REFLECTION],
  },

  // ════════════════════════════════════════════════════════
  // ORGANISATIONAL (U11)
  // ════════════════════════════════════════════════════════
  {
    id: 'org-mission-drift',      domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.TEMPORAL,      subtype: 'mission_drift',
    description: 'Organisation\'s behaviour diverges from stated mission — sigma DEGRADED',
    detection: 'behavioural_evidence contradicts mission_statement over time',
    criticality: 0.80,
    reason: [GAP_REASON.ATTENTION, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'org-proxy-metric',       domain: DOMAIN.PROCESS,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'proxy_metric_gap',
    description: 'Metric chosen diverges from actual success — Goodhart\'s Law',
    detection: 'metric_definition ≠ success_definition',
    criticality: 0.85,
    reason: [GAP_REASON.COMPRESSION, GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'org-info-hierarchy',     domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.EVIDENTIAL,    subtype: 'hierarchy_information_gap',
    description: 'Information doesn\'t reach decision-makers — filtered at hierarchy levels',
    detection: 'information_node at source without causal_path to decision_node',
    criticality: 0.80,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'org-bystander',          domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.OBLIGATION,    subtype: 'bystander_gap',
    description: 'Collective responsibility diffused — no individual acts',
    detection: 'obligation_node with multiple actors; none with direct accountability_edge',
    criticality: 0.75,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
  },
  {
    id: 'org-normalisation',      domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.TEMPORAL,      subtype: 'normalisation_gap',
    description: 'Gradually escalating harm normalised — total deviation never examined',
    detection: 'current_state vs origin_state; accumulated_deviation flagged if unacknowledged',
    criticality: 0.90,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
    as_above: 'In music: the mix that gets louder every pass until everything is saturated.',
  },
  {
    id: 'org-innovators-dilemma', domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.TEMPORAL,      subtype: 'innovators_dilemma',
    description: 'Success in current paradigm prevents recognition of next paradigm',
    detection: 'competitive_threat_node classified as irrelevant based on current paradigm',
    criticality: 0.85,
    reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.NARRATIVE_SOOTHING],
  },

  // ════════════════════════════════════════════════════════
  // LIFE DOMAINS
  // ════════════════════════════════════════════════════════
  {
    id: 'life-grief-bypassed',    domain: DOMAIN.GRIEF,
    type: GAP_TYPE.TEMPORAL,      subtype: 'grief_bypass',
    description: 'Loss not processed — emotion suppressed, timeline imposed',
    criticality: 0.85, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  {
    id: 'life-career-identity',   domain: DOMAIN.CAREER,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'career_identity_conflation',
    description: 'Identity entirely invested in career role — nothing remains if role disappears',
    criticality: 0.80, reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'life-health-assumption', domain: DOMAIN.HEALTH,
    type: GAP_TYPE.TEMPORAL,      subtype: 'health_assumption',
    description: 'Health assumed stable until crisis — no longitudinal monitoring',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },
  {
    id: 'life-parenting-blueprint', domain: DOMAIN.PARENTING,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'parenting_blueprint_assumption',
    description: 'Parenting model inherited from childhood assumed correct without examination',
    criticality: 0.80, reason: [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.NARRATIVE_SOOTHING],
  },
  {
    id: 'life-education-outcome', domain: DOMAIN.EDUCATION,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'education_outcome_gap',
    description: 'Grade/credential conflated with learning — proxy replaces the thing',
    criticality: 0.75, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPRESSION],
  },
  {
    id: 'life-finance-future',    domain: DOMAIN.FINANCES_PERSONAL,
    type: GAP_TYPE.TEMPORAL,      subtype: 'financial_future_blindness',
    description: 'Present spending optimised without model of future self\'s needs',
    criticality: 0.80, reason: [GAP_REASON.AVOIDANCE, GAP_REASON.ATTENTION],
  },

  // ════════════════════════════════════════════════════════
  // FUTURE-FACING
  // ════════════════════════════════════════════════════════
  {
    id: 'fut-climate-externality',domain: DOMAIN.CLIMATE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'climate_externality',
    description: 'Climate cost not priced — future generations absorb it',
    criticality: 0.95, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'fut-ai-governance',      domain: DOMAIN.AI_GOVERNANCE,
    type: GAP_TYPE.OBLIGATION,    subtype: 'ai_governance_gap',
    description: 'AI capability advancing faster than governance',
    criticality: 0.95, reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
  },
  {
    id: 'fut-civilisation-assumption', domain: DOMAIN.CIVILISATION,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'civilisation_continuity_assumption',
    description: 'Current civilisational structure assumed stable — fragility unexamined',
    criticality: 0.90, reason: [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.AVOIDANCE],
  },
  {
    id: 'fut-tech-debt-civilisation', domain: DOMAIN.FUTURES,
    type: GAP_TYPE.TEMPORAL,      subtype: 'civilisational_technical_debt',
    description: 'Short-term optimisation creates irreversible long-term constraints',
    criticality: 0.90, reason: [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.ATTENTION],
  },



  // BOUNDARY gap type
  {
    id: 'rel-boundary-violation', domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.BOUNDARY,      subtype: 'boundary_violation',
    description: 'Stated limit not respected — boundary set but not honoured',
    detection: 'boundary_statement followed by violation_event without renegotiation',
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
    example: 'Boundary set but not honored. Called after stated limit. Boundary as signal, not law.',
  },
  // CONSENT gap type (relational)
  {
    id: 'rel-consent-violation',  domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.CONSENT,       subtype: 'consent_violation',
    description: 'Action taken without the consent that would make it legitimate — the original agreement does not extend to this use',
    detection: 'action_node has no consent_edge from affected party',
    criticality: 0.90,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
    example: 'Vulnerability disclosed in safe context, weaponised later. Privacy violated without knowledge.',
  },
  // ════════════════════════════════════════════════════════
  // RECURSIVE — GapHunter on itself (U12)
  // ════════════════════════════════════════════════════════
  {
    id: 'meta-taxonomy-completeness', domain: DOMAIN.RECURSIVE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'taxonomy_completeness_trap',
    description: 'This taxonomy claims to cover all gaps. It cannot. Run GapHunter on this document.',
    detection: 'Run GapHunter on this document. Every missing domain is an evidential gap.',
    criticality: 1.00,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'meta-observer-gap',      domain: DOMAIN.RECURSIVE,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'observer_gap',
    description: 'The analyzer is not neutral. Gaps found are shaped by gaps the analyzer has.',
    detection: 'Cannot be detected from inside. Requires external perspective.',
    criticality: 1.00,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.IDENTITY_REFLECTION],
  },
  {
    id: 'meta-framework-assumption', domain: DOMAIN.META,
    type: GAP_TYPE.ASSUMPTION,    subtype: 'framework_assumption',
    description: 'GapHunter assumes gaps are findable. There are gaps that cannot be found from inside.',
    detection: 'Cannot be detected from inside. This document has this gap.',
    criticality: 1.00,
    reason: [GAP_REASON.STRUCTURAL_LIMIT],
  },
  {
    id: 'meta-domain-boundary',   domain: DOMAIN.META,
    type: GAP_TYPE.DEFINITIONAL,  subtype: 'domain_boundary_gap',
    description: 'Domain boundaries are artificial — reality is continuous, taxonomy imposes structure',
    criticality: 1.00,
    reason: [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.COMPRESSION],
  },
];

// Clean up syntax errors in catalogue (quick filter)
const _validated = GAP_CATALOGUE.filter(g => g.id && g.domain && g.type && g.subtype);

// ─── Reason Descriptions ──────────────────────────────────────────────────────

export const GAP_REASON_DESCRIPTION = Object.freeze({
  [GAP_REASON.COMPRESSION]:         'Information density exceeds bandwidth — gaps form where content is compressed. More is present than can be transmitted. The gap is the artefact of the compression algorithm.',
  [GAP_REASON.AVOIDANCE]:           'The content is too threatening to the current structure to hold consciously. Gaps are purposeful. The absence is an act. The shape of the absence tells you what was avoided.',
  [GAP_REASON.COMPATIBILITY]:       'Two systems or frameworks that cannot fully interoperate. The gap lives at the interface — where one coordinate system meets another and the translation fails.',
  [GAP_REASON.ATTENTION]:           'Finite attention cannot cover everything. Gaps are where attention didn\'t land. The most important gaps are often in the blind spot created by what was attended to.',
  [GAP_REASON.EMOTIONAL_OCCLUSION]: 'Strong emotion casts a blind spot. The gap is not hidden by the emotion — it is invisible because of it. High arousal narrows the field. Some truths can only be seen from a regulated state.',
  [GAP_REASON.NARRATIVE_SOOTHING]:  'The story needs the gap to hold together. Closing it would require updating the narrative. The gap is load-bearing for the story\'s ability to make meaning. It is protected by what it holds up.',
  [GAP_REASON.IDENTITY_REFLECTION]: 'The gap protects an identity. What\'s missing would require updating who you are. Closing it means becoming someone who knows what you currently don\'t. The resistance to closing it is proportional to what the identity costs.',
  [GAP_REASON.DEFERRED_VARIABLE]:   'The variable exists. It is known to exist. It is explicitly not processed yet — a structural deferral, not an omission. The difference: you can name what is deferred. You cannot always name what is omitted.',
  [GAP_REASON.STRUCTURAL_LIMIT]:    'The system\'s architecture cannot represent the content. This is a hard limit — not avoidance, not compression, but a genuine constraint of the medium. The map cannot contain the territory at this resolution.',
});

// ─── Cross-Domain Invariants (all ten) ───────────────────────────────────────

export const INVARIANTS = Object.freeze([
  'The most critical gap is the one most avoided',
  'Assumption gaps are always more load-bearing than they appear',
  'Temporal gaps compound — small errors grow with time',
  'Contradiction gaps generate energy — the oscillation is fuel if redirected before collapse',
  'The observer always has blind spots that cannot be seen from inside the observation',
  'Normalisation hides accumulation — point-in-time analysis misses what longitudinal reveals',
  'Every system is optimised for what it actually rewards, not for what it says it values',
  'The frame determines what can be found — the most important gaps are often outside the frame',
  'Completeness is an illusion that causes premature closure',
  'The gap in the gap detector is the most dangerous gap',
]);

// As Above So Below — scale-invariant truths
export const AS_ABOVE_SO_BELOW = Object.freeze([
  'The gap in a lyric line is the same operation as the gap in a legal contract — chain broken, obligation unmet, assumption never examined.',
  'The unresolved tritone in music is the unspoken word in conversation is the unclosed try/catch in code is the unenforced law in governance.',
  'What a song avoids saying at the pivot is what a person avoids feeling at the crisis is what an institution avoids measuring at the review.',
  'The hook exists where gap field pressure is maximum. In music, in argument, in relationship, in code — the most important moment is where expectation is highest and resolution is not yet guaranteed.',
  'Oscillation at the personal scale mirrors oscillation at the systemic scale. The fight that repeats monthly is the policy cycle that repeats every election.',
  'Compression at the bandwidth level creates the same artefacts as compression at the emotional level — the thing that doesn\'t fit gets dropped, and the absence is the gap.',
  'An edge in signal processing and an edge in a relationship and an edge in a codebase all share the same geometry: maximum information density, minimum predictability, highest gap-field pressure.',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getById(id)          { return _validated.find(g => g.id === id) ?? null; }
export function getByDomain(domain)  { return _validated.filter(g => g.domain === domain); }
export function getByType(type)      { return _validated.filter(g => g.type === type); }
export function getByReason(reason)  { return _validated.filter(g => (g.reason ?? []).includes(reason)); }
export function getByMinCrit(min)    { return _validated.filter(g => (g.criticality ?? 0) >= min); }
export function allDomains()         { return [...new Set(_validated.map(g => g.domain))].sort(); }
export function getByDomainGroup(g)  { return _validated.filter(g2 => (DOMAIN_GROUPS[g] ?? []).includes(g2.domain)); }

export function catalogueSummary() {
  const byDomain = {}, byType = {}, byReason = {};
  for (const g of _validated) {
    byDomain[g.domain] = (byDomain[g.domain] ?? 0) + 1;
    byType[g.type]     = (byType[g.type]     ?? 0) + 1;
    for (const r of (g.reason ?? [])) byReason[r] = (byReason[r] ?? 0) + 1;
  }
  return {
    total:   _validated.length,
    domains: Object.keys(byDomain).length,
    byDomain, byType, byReason,
    topCritical: _validated.slice().sort((a,b)=>(b.criticality??0)-(a.criticality??0)).slice(0,10)
      .map(g => ({ id: g.id, subtype: g.subtype, criticality: g.criticality, domain: g.domain })),
  };
}

export const DOMAIN_GROUPS = Object.freeze({
  epistemological: [DOMAIN.EPISTEMOLOGICAL, DOMAIN.LOGIC, DOMAIN.PHILOSOPHY_SCIENCE, DOMAIN.METACOGNITION],
  technology:      [DOMAIN.CODE, DOMAIN.SOFTWARE_ARCH, DOMAIN.AI_ML, DOMAIN.SECURITY, DOMAIN.QA, DOMAIN.DEVOPS, DOMAIN.API_DESIGN, DOMAIN.DATABASE, DOMAIN.SYSTEM_DESIGN],
  language:        [DOMAIN.LANG_JS, DOMAIN.LANG_TS, DOMAIN.LANG_PYTHON, DOMAIN.LANG_RUST, DOMAIN.LANG_GO, DOMAIN.LANG_JAVA, DOMAIN.LANG_CPP, DOMAIN.LANG_SQL, DOMAIN.LANG_GENERIC],
  scientific:      [DOMAIN.RESEARCH, DOMAIN.MEDICAL, DOMAIN.STATISTICS, DOMAIN.ENGINEERING],
  political:       [DOMAIN.POLITICAL, DOMAIN.LEGAL, DOMAIN.INSTITUTIONAL, DOMAIN.GOVERNANCE],
  economic:        [DOMAIN.BUSINESS, DOMAIN.FINANCE, DOMAIN.STRATEGY, DOMAIN.CONTRACTS, DOMAIN.MARKETS],
  relational:      [DOMAIN.INTERPERSONAL, DOMAIN.PSYCHOLOGICAL, DOMAIN.COMMUNICATION, DOMAIN.ABUSE_MANIPULATION, DOMAIN.RELATIONAL],
  music:           [DOMAIN.MUSIC, DOMAIN.MUSIC_THEORY, DOMAIN.HARMONY, DOMAIN.RHYTHM, DOMAIN.LYRICS, DOMAIN.SONGWRITING],
  existential:     [DOMAIN.IDENTITY, DOMAIN.VALUES, DOMAIN.BELIEF, DOMAIN.PURPOSE, DOMAIN.ETHICS, DOMAIN.MORAL, DOMAIN.MEANING],
  organisational:  [DOMAIN.ORGANISATIONAL, DOMAIN.LEADERSHIP, DOMAIN.TEAM, DOMAIN.PROCESS],
  life:            [DOMAIN.HEALTH, DOMAIN.RELATIONSHIPS, DOMAIN.PARENTING, DOMAIN.EDUCATION, DOMAIN.CAREER, DOMAIN.FINANCES_PERSONAL, DOMAIN.GRIEF, DOMAIN.MEANING],
  field:           [DOMAIN.FIELD, DOMAIN.SIGNAL, DOMAIN.SEQUENCE, DOMAIN.EDGE],
  futures:         [DOMAIN.FUTURES, DOMAIN.CLIMATE, DOMAIN.AI_GOVERNANCE, DOMAIN.CIVILISATION],
  recursive:       [DOMAIN.RECURSIVE, DOMAIN.META],
});

export { _validated as GAP_CATALOGUE_VALIDATED };
