/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK SPEECH STATE MODULE  ·  speech-state-module.js  ·  v1.0.0        ║
 * ║  UUID: alk-mod-speech-0000-2700-0000-000000000001                      ║
 * ║  HOOK: alk.module.speech:speech-state:00001                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signal, not diagnosis.
 * §1.2 — All errors loud. Zero silent failures.
 * §4.3 — No PII. Behavioral signals only.
 * §5.5 — No external dependencies. All analysis built from first principles.
 * §5.7 — Zero direct module calls. All I/O via kernel bus only.
 * §K1  — Events immutable after construction.
 * §K6  — No module may call another module directly.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The gap between what the text module sees and what the person is actually
 * doing with language. Text analysis reads content. This module reads the
 * MODE of speech — the relationship between the speaker and their own words.
 *
 * A person can say the same sentence as:
 *   — external processing (thinking out loud, working something out)
 *   — self-talk (talking to themselves, inner voice audible)
 *   — performance (narrating for an audience)
 *   — fragmented (losing the thread, dysregulated)
 *   — integrated (coherent, grounded, organized)
 *
 * These modes are NOT about content. They are about the structural and
 * prosodic relationship between the speaker's nervous system and their
 * speech production system.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECTION DOMAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. SPEECH MODE CLASSIFICATION
 *    external_processing | self_talk | performative | integrated | collapsed
 *
 * 2. FRAGMENTATION TOPOLOGY
 *    Sentence completion rate, mid-sentence derailment, clause abandonment,
 *    topic drift within utterance, referential failure (pronouns with no
 *    clear antecedent), syntactic collapse under arousal.
 *
 * 3. DYSREGULATION SIGNATURE
 *    Cross-modal: audio energy + speech structure + semantic coherence.
 *    Seven subtypes: flooding, freeze-speech, fawn-speech, rage-speech,
 *    grief-speech, dorsal-collapse, hypervigilant-scan.
 *
 * 4. GROUNDING DETECTION
 *    Present-moment language, sensory anchoring, embodied reference.
 *    Contrasted with dissociation markers and temporal displacement.
 *
 * 5. EMOTIONAL SPECTRUM — 4K RESOLUTION
 *    Not 7 basic emotions. Full dimensional mapping:
 *    — Primary affect circuits (Panksepp)
 *    — Secondary blends (grief-rage, fear-shame, love-grief)
 *    — Tertiary states (ambivalence, awe, existential dread, tender ache)
 *    — Suppressed variants (each primary has a masked form)
 *    — Somatic emotion (felt but not named — body-first, word-absent)
 *    — Transition states (one emotion becoming another)
 *
 * 6. INTEGRATION LEVEL
 *    How well is experience being organized into coherent narrative?
 *    Five levels: collapsed → fragmented → partial → coherent → integrated
 *
 * 7. SELF-REFERENTIAL STRUCTURE
 *    First-person density, self-observation vs self-identification,
 *    metacognitive markers ("I notice I'm..."), locus of control shifts.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT CONTRACT — INBOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  alk.verbal.transcript          { text, duration_ms, words_per_min }
 *  alk.verbal.analysis.tone       { energy, zcr, cadence, spectral }
 *  alk.verbal.analysis.sentiment  { score, polarity, rollingAvg }
 *  alk.verbal.analysis.shift      { type, magnitude }
 *  alk.latent.update              { valence, arousal, suppression, coherence, engagement }
 *  alk.htl.ns.state               { polyvagalState, windowZone, capacity }
 *  alk.htl.emo.state              { dominant, active, scores }
 *  alk.video.cue.detected         { cueType, category, intensity }
 *  alk.video.cue.released         { cueType }
 *  alk.session.capture.start
 *  alk.session.capture.stop
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT CONTRACT — OUTBOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  alk.speech.mode                { mode, confidence, evidence }
 *  alk.speech.fragmentation       { level, type, markers, score }
 *  alk.speech.dysregulation       { active, subtype, intensity, signature }
 *  alk.speech.grounding           { level, anchors, displacement }
 *  alk.speech.emotion.spectrum    { primary, secondary, tertiary, suppressed,
 *                                   somatic, transition, dimensional }
 *  alk.speech.integration         { level, narrative_coherence, self_access }
 *  alk.speech.self_reference      { structure, metacognitive, locus }
 *  alk.speech.rhythm              { rate, variance, pause_topology, breath_phrase }
 *  alk.speech.summary             { session-end composite }
 *  alk.speech.error
 */

'use strict';

export const MODULE_UUID    = 'alk-mod-speech-0000-2700-0000-000000000001';
export const MODULE_VERSION = '1.0.0';

// ─── Utilities ────────────────────────────────────────────────────────────────

function r4(n) { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr) { return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0; }
function stddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function tokenize(text) {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean);
}

function sentences(text) {
  return (text ?? '').split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

class SlidingWindow {
  constructor(maxLen = 30) { this._buf = []; this._max = maxLen; }
  push(v)  { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); return this; }
  get vals()  { return [...this._buf]; }
  get len()   { return this._buf.length; }
  avg()       { return this._buf.length ? mean(this._buf) : 0; }
  sd()        { return stddev(this._buf); }
  last()      { return this._buf[this._buf.length - 1] ?? null; }
  clear()     { this._buf = []; }
  delta()     {
    if (this._buf.length < 2) return 0;
    return this._buf[this._buf.length - 1] - this._buf[0];
  }
}

// ─── Lexicon Banks ────────────────────────────────────────────────────────────
// §5.5 — built, not imported. Every lexicon documented with source.

/**
 * SELF_TALK_MARKERS — internal monologue made audible.
 * Characterized by: incomplete address (no "you"), self-directed imperatives,
 * self-answering question structures, lower social register.
 */
const SELF_TALK_PATTERNS = [
  /\bokay\s+so\b/gi,
  /\blet me\s+(think|see|just|check|try)\b/gi,
  /\bwait[,.]?\s*(no|actually|okay|so|what)\b/gi,
  /\bno no no\b/gi,
  /\bwhat (am i|was i|were we)\b/gi,
  /\bwhere (was i|were we|did i)\b/gi,
  /\banyway[,.]?\s*so\b/gi,
  /\bright[,.]?\s*(so|okay|yeah)\b/gi,
  /\byeah no\b/gi,
  /\bno yeah\b/gi,
  /\boh god\b/gi,
  /\buh+ (so|okay|well|right)\b/gi,
  /\berm+\b/gi,
];

/**
 * EXTERNAL_PROCESSING_MARKERS — working something out in real time.
 * The listener is witness, not audience. Thought is being generated, not reported.
 */
const EXTERNAL_PROCESSING_PATTERNS = [
  /\bi('m| am) (thinking|realizing|noticing|seeing|wondering|working out)\b/gi,
  /\bas i('m| am) (saying|talking|speaking)\b/gi,
  /\bthat('s| is) (interesting|weird|funny|strange|odd)\b/gi,
  /\bi (didn't|don't) (know|realize|think) (that|i|it|this)\b/gi,
  /\bwhere (did|does) that come from\b/gi,
  /\bso if i (think|understand|follow)\b/gi,
  /\bactually[,.]?\s+(now that|when i|thinking about)\b/gi,
  /\bwhat i mean is\b/gi,
  /\bor (maybe|actually|wait)\b/gi,
  /\bno wait[,.]?\s*that('s| is)\b/gi,
  /\bwhich is (interesting|strange|weird|funny)\b/gi,
  /\bso (this|that|it|we) (means|suggest|imply|is saying)\b/gi,
];

/**
 * FRAGMENTATION_MARKERS — syntactic and semantic breakdown.
 * Linguistic signatures of arousal overwhelming speech production.
 */
const FRAGMENTATION_PATTERNS = {
  // Abandoned clauses — sentence starts and doesn't complete
  clause_abandon: [
    /\b(because|and|but|so|which|that|if|when|while|although)\s*[.!?]$/gim,
    /\bi (mean|think|feel|don't|just)[.!?]$/gim,
    /\b(it's|that's|this is|there's)\s*[.!?]$/gim,
  ],
  // Repetition loops — sign of search/dysregulation
  repetition_loop: [
    /\b(\w{3,})\s+\1\s+\1\b/gi,             // word word word (triple)
    /\b(\w{3,})\s+\1\b(?:.*\b\1\b){2,}/gi,  // word appearing 4+ times
  ],
  // Mid-sentence topic switch (approximated by conjunction + abrupt topic)
  topic_derail: [
    /\b(anyway|but anyway|but yeah|so yeah|i don't know)[,.]?\s+\w/gi,
  ],
  // Referential failure — pronoun with ambiguous/absent antecedent
  referential_fail: [
    /^(it|they|that|this|he|she)\s+(is|was|were|are|said|told|did)/gim,
  ],
};

/**
 * GROUNDING ANCHORS — present-moment, sensory, embodied language.
 * Derived from somatic experiencing, mindfulness, and present-tense anchoring.
 */
const GROUNDING_LEXICON = new Set([
  'right now', 'in this moment', 'here', 'now', 'present', 'currently',
  'i can feel', 'i feel', 'i notice', 'i sense', 'i hear', 'i see',
  'in my body', 'in my chest', 'in my stomach', 'my breath', 'breathing',
  'grounded', 'settled', 'solid', 'here now', 'this', 'today',
]);

/**
 * TEMPORAL DISPLACEMENT — not here, not now. Dissociation and rumination markers.
 */
const DISPLACEMENT_PATTERNS = [
  /\b(back then|used to|would always|would never|when i was)\b/gi,
  /\b(someday|one day|eventually|in the future|when things)\b/gi,
  /\b(what if|if only|should have|could have|would have)\b/gi,
  /\b(never|always|every time|all the time|constantly)\b/gi,
];

/**
 * METACOGNITIVE MARKERS — self-observation, watching the self.
 * "I notice I'm..." vs "I am..." — the distance is the signal.
 */
const METACOGNITIVE_PATTERNS = [
  /\bi notice (i('m| am)|my|that i)\b/gi,
  /\bi('m| am) aware (that|of|i)\b/gi,
  /\bi can (see|observe|notice|feel) (that i|myself|my)\b/gi,
  /\bpart of me\b/gi,
  /\bwatching myself\b/gi,
  /\bthere('s| is) a part\b/gi,
  /\bsomething in me\b/gi,
  /\bi('m| am) noticing\b/gi,
  /\bi realize i('m| am| was)\b/gi,
  /\bi find myself\b/gi,
];

/**
 * DYSREGULATION SUBTYPE LEXICONS
 * Each dysregulation state has linguistic fingerprints.
 */
const DYSREGULATION_LEXICONS = {
  FLOODING: {
    patterns: [
      /\bi (can't|cannot) (think|breathe|stop|handle|do this)\b/gi,
      /\btoo much\b/gi,
      /\boverwhelm/gi,
      /\bcan't (even|stop|think)\b/gi,
      /\beverything (is|at once|all at)\b/gi,
    ],
    audio_signature: { energy_high: true, variance_high: true, rate_fast: true },
  },
  FREEZE_SPEECH: {
    patterns: [
      /\bi don't know\b/gi,
      /\bi (can't|don't) (remember|recall|think)\b/gi,
      /\bblank\b/gi,
      /\bnot sure\b/gi,
      /\b(nothing|nowhere|no one)\b/gi,
    ],
    audio_signature: { energy_low: true, variance_low: true, long_pauses: true },
  },
  FAWN_SPEECH: {
    patterns: [
      /\bwhatever you (think|want|need|say)\b/gi,
      /\bi('m| am) (fine|okay|good)[.!]?\s*$/gim,
      /\bno (it's|that's) (okay|fine|alright)\b/gi,
      /\bdon't worry (about me|about it)\b/gi,
      /\bi (don't|didn't) (mind|care)\b/gi,
      /\bit('s| is) (fine|okay|not a big deal)\b/gi,
    ],
    audio_signature: { energy_low: true, variance_low: true, rate_flat: true },
  },
  RAGE_SPEECH: {
    patterns: [
      /\b(always|never|every time|constantly) (you|they|he|she)\b/gi,
      /\bthat('s| is) (so|completely|absolutely) (wrong|unfair|stupid|ridiculous)\b/gi,
      /\bi (can't believe|cannot believe)\b/gi,
      /\bhow (dare|could|can)\b/gi,
      /\bfucking|goddamn|bullshit|what the\b/gi,
    ],
    audio_signature: { energy_high: true, zcr_high: true, rate_fast: true },
  },
  GRIEF_SPEECH: {
    patterns: [
      /\bi (miss|missed|miss so much)\b/gi,
      /\b(gone|lost|not (here|there|coming back))\b/gi,
      /\bwhy (did|does|would|couldn't)\b/gi,
      /\b(never|anymore|used to)\b/gi,
      /\bi (loved|cared|wanted)\b/gi,
      /\bif only\b/gi,
    ],
    audio_signature: { energy_low: true, cadence_slow: true, pauses_long: true },
  },
  DORSAL_COLLAPSE: {
    patterns: [
      /\bi (don't|can't) (care|feel|matter)\b/gi,
      /\bwhat('s| is) the (point|use)\b/gi,
      /\bnothing (matters|works|helps|changes)\b/gi,
      /\b(exhausted|nothing|empty|hollow|flat)\b/gi,
      /\bjust (leave me|let me|forget it)\b/gi,
    ],
    audio_signature: { energy_very_low: true, monotone: true, minimal_variance: true },
  },
  HYPERVIGILANT_SCAN: {
    patterns: [
      /\bwhat (if|about|does that|did (they|he|she|you) mean)\b/gi,
      /\b(does that mean|is that|are you)\b/gi,
      /\bwhy (did|would|would you)\b/gi,
      /\bare (you|we|they) (sure|okay|good|still)\b/gi,
      /\bwait[,.]?\s*did (you|they|he|she)\b/gi,
    ],
    audio_signature: { energy_variable: true, rate_fast: true, pauses_short: true },
  },
};

/**
 * EMOTIONAL SPECTRUM — 4K resolution mapping.
 *
 * Three tiers:
 *   PRIMARY — Panksepp's 7 + core somatic states
 *   SECONDARY — blends of two primaries
 *   TERTIARY — complex, culturally-inflected, often nameless
 *
 * Each state has:
 *   lexicon    — words that appear in this state
 *   syntax     — structural features (questions, fragments, long sentences)
 *   prosody    — audio signature
 *   somatic    — body markers that co-occur
 *   suppressed — what the masked version looks like
 */
const EMOTIONAL_SPECTRUM = {

  // ── PRIMARY TIER ──────────────────────────────────────────────────────────

  SEEKING: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'curious', 'wondering', 'what if', 'imagine', 'possibility',
      'maybe', 'could', 'might', 'explore', 'discover', 'find out',
      'interested', 'fascinated', 'want to know', 'tell me', 'how does',
    ]),
    syntax: { questions: true, conditional: true, forward_tense: true },
    prosody: { energy: 'rising', rate: 'variable', zcr: 'mid' },
    somatic_cues: ['lean_forward', 'eye_widen', 'head_tilt_left'],
    suppressed_form: 'SEEKING_SUPPRESSED',
  },

  RAGE: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'angry', 'furious', 'rage', 'unfair', 'wrong', 'hate',
      'always', 'never', 'how could', 'how dare', 'ridiculous',
      'not okay', 'unacceptable', 'enough', 'tired of',
    ]),
    syntax: { absolutes: true, short_sentences: true, imperatives: true },
    prosody: { energy: 'high', rate: 'fast', zcr: 'high' },
    somatic_cues: ['jaw_clench', 'shoulder_asymmetry', 'contempt_micro'],
    suppressed_form: 'RAGE_SUPPRESSED',
  },

  FEAR: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'scared', 'afraid', 'terrified', 'anxious', 'worried', 'dread',
      'panic', 'threat', 'danger', 'unsafe', 'what if', 'something wrong',
      'bad feeling', 'can\'t', 'what happens if',
    ]),
    syntax: { questions: true, conditional: true, catastrophizing: true },
    prosody: { energy: 'variable', rate: 'fast', zcr: 'high' },
    somatic_cues: ['shoulder_raise', 'brow_raise', 'gaze_aversion'],
    suppressed_form: 'FEAR_SUPPRESSED',
  },

  CARE: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'love', 'care', 'worried about', 'want you to', 'need you',
      'matter', 'important', 'here for', 'together', 'safe', 'warm',
      'i\'m here', 'won\'t leave', 'always', 'unconditional',
    ]),
    syntax: { second_person: true, reassurance: true, long_sentences: true },
    prosody: { energy: 'soft', rate: 'slow', zcr: 'low' },
    somatic_cues: ['smile_genuine', 'lean_forward', 'head_tilt_right'],
    suppressed_form: 'CARE_SUPPRESSED',
  },

  GRIEF: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'miss', 'loss', 'gone', 'empty', 'hollow', 'wish',
      'used to', 'anymore', 'never again', 'if only', 'why',
      'ache', 'still', 'remember when', 'can\'t believe',
    ]),
    syntax: { past_tense: true, negation: true, incomplete_sentences: true },
    prosody: { energy: 'low', rate: 'slow', pauses: 'long' },
    somatic_cues: ['gaze_down', 'self_touch_face', 'shoulder_drop'],
    suppressed_form: 'GRIEF_SUPPRESSED',
  },

  PLAY: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'funny', 'laugh', 'ridiculous', 'absurd', 'joke', 'imagine',
      'what if', 'silly', 'fun', 'joy', 'ha', 'oh come on',
      'can you believe', 'no way', 'amazing', 'love that',
    ]),
    syntax: { exclamations: true, rhetorical: true, playful_inversion: true },
    prosody: { energy: 'variable', rate: 'fast', variation: 'high' },
    somatic_cues: ['smile_genuine', 'eye_widen', 'lean_forward'],
    suppressed_form: 'PLAY_SUPPRESSED',
  },

  // Somatic-primary — felt in body, resists naming
  SOMATIC_ACTIVATION: {
    tier: 'PRIMARY',
    lexicon: new Set([
      'chest', 'stomach', 'throat', 'hands', 'jaw', 'shoulders',
      'body', 'tight', 'heavy', 'warm', 'cold', 'numb', 'shaking',
      'can feel it', 'in my body', 'physically', 'hard to breathe',
    ]),
    syntax: { body_reference: true, present_tense: true },
    prosody: { energy: 'variable', pauses: 'mid' },
    somatic_cues: ['self_touch_face', 'shoulder_raise', 'breath_hold'],
    suppressed_form: null,
  },

  // ── SUPPRESSED PRIMARIES ──────────────────────────────────────────────────

  SEEKING_SUPPRESSED: {
    tier: 'PRIMARY_SUPPRESSED',
    description: 'Curiosity suppressed by fear of rejection or shame for wanting',
    markers: [
      /\bnever mind\b/gi,
      /\bdon't worry (about it|about that)\b/gi,
      /\bforgot what i was going to say\b/gi,
      /\bit('s| is) (fine|nothing|not important)\b/gi,
    ],
    audio: { energy_drop: true, sentence_abandon: true },
  },

  RAGE_SUPPRESSED: {
    tier: 'PRIMARY_SUPPRESSED',
    description: 'Rage suppressed into over-calm, flatness, or over-politeness',
    markers: [
      /\bi('m| am) (fine|not angry|not upset|not bothered)\b/gi,
      /\bit('s| is) (fine|okay|whatever)\b/gi,
      /\bi (understand|get it|see your point)\b(?=.*\bbut\b)/gi,
      /\b(very|quite|rather) (interesting|surprising|curious)\b/gi,
    ],
    audio: { energy_flat: true, zcr_low: true, controlled_rate: true },
  },

  FEAR_SUPPRESSED: {
    tier: 'PRIMARY_SUPPRESSED',
    description: 'Fear masked as competence, control, or humor',
    markers: [
      /\bi('ve| have) got (this|it)\b/gi,
      /\b(no problem|totally fine|not worried|not scared)\b/gi,
      /\bhaha\b/gi,
      /\bjust\b/gi, // minimizer under threat
    ],
    audio: { energy_controlled: true, rate_slightly_fast: true },
  },

  GRIEF_SUPPRESSED: {
    tier: 'PRIMARY_SUPPRESSED',
    description: 'Grief held back — the throat closes before the sentence finishes',
    markers: [
      /\banyway\b/gi,
      /\b(moving on|next topic|never mind)\b/gi,
      /\bi('m| am) (fine|okay|good)[,.]?\s*$/gim,
    ],
    audio: { voice_break_risk: true, energy_spike_then_drop: true },
  },

  CARE_SUPPRESSED: {
    tier: 'PRIMARY_SUPPRESSED',
    description: 'Care suppressed by fear of vulnerability or rejection',
    markers: [
      /\bnot that i (care|mind|matter)\b/gi,
      /\bjust (checking|wondering|asking)\b/gi,
      /\bno reason[,.]?\s*(just|i)\b/gi,
    ],
    audio: { energy_soft: true, rate_quick: true }, // say it fast, don't linger
  },

  // ── SECONDARY TIER — BLENDS ───────────────────────────────────────────────

  GRIEF_RAGE: {
    tier: 'SECONDARY',
    description: 'Grief + rage — betrayal grief, profound loss with anger at its cause',
    blend: ['GRIEF', 'RAGE'],
    lexicon: new Set([
      'how could', 'why would', 'after everything', 'i trusted',
      'destroyed', 'not fair', 'didn\'t deserve', 'how dare they',
      'loved and lost', 'nothing left',
    ]),
    syntax: { why_questions: true, past_tense_positive_present_rage: true },
    prosody: { energy: 'variable', breaks: true, rate: 'irregular' },
  },

  FEAR_SHAME: {
    tier: 'SECONDARY',
    description: 'Fear + shame — the paralysis of being seen as inadequate',
    blend: ['FEAR', 'SHAME'],
    lexicon: new Set([
      'stupid', 'pathetic', 'shouldn\'t have', 'embarrassing', 'ridiculous',
      'what\'s wrong with me', 'i should know better', 'why can\'t i',
      'normal people', 'everyone else can', 'just me',
    ]),
    syntax: { self_attack: true, comparison: true, rhetorical_self_blame: true },
    prosody: { energy: 'low_then_spike', rate: 'hesitant' },
  },

  LOVE_GRIEF: {
    tier: 'SECONDARY',
    description: 'Care + grief — loving someone or something no longer present',
    blend: ['CARE', 'GRIEF'],
    lexicon: new Set([
      'loved', 'miss you', 'used to', 'i still', 'can\'t stop',
      'even now', 'every time i', 'reminds me of', 'wish you were',
      'would have loved', 'you would have',
    ]),
    syntax: { past_tense: true, second_person_absent: true },
    prosody: { energy: 'soft', breaks: true, rate: 'slow' },
  },

  APPROACH_AVOIDANCE: {
    tier: 'SECONDARY',
    description: 'Seeking + fear — wanting to move forward but terrified to',
    blend: ['SEEKING', 'FEAR'],
    lexicon: new Set([
      'want to but', 'scared to', 'wish i could', 'what if it',
      'trying to', 'hard to', 'want and afraid', 'can\'t bring myself',
      'part of me wants', 'another part',
    ]),
    syntax: { but_constructions: true, internal_split: true },
    prosody: { energy: 'variable', hesitations: true },
  },

  RAGE_GRIEF: {
    tier: 'SECONDARY',
    description: 'Rage + grief — anger as armor over pain',
    blend: ['RAGE', 'GRIEF'],
    lexicon: new Set([
      'don\'t care anymore', 'whatever', 'fine', 'over it',
      'doesn\'t matter', 'never again', 'i\'m done',
    ]),
    syntax: { dismissal: true, past_tense: true, absolutism: true },
    prosody: { energy: 'flat_or_spike', variance: 'low_then_high' },
  },

  SHAME_RAGE: {
    tier: 'SECONDARY',
    description: 'Shame turned outward — self-contempt projected onto others',
    blend: ['SHAME', 'RAGE'],
    lexicon: new Set([
      'pathetic', 'ridiculous', 'how could they', 'they have no right',
      'who do they think', 'so wrong', 'absolute',
    ]),
    syntax: { projection: true, absolutes: true, contempt_language: true },
    prosody: { energy: 'high', contempt_flat: true },
  },

  // ── TERTIARY TIER — COMPLEX STATES ───────────────────────────────────────

  AMBIVALENCE: {
    tier: 'TERTIARY',
    description: 'Holding two contradictory truths simultaneously without resolution',
    lexicon: new Set([
      'and also', 'at the same time', 'both', 'but also', 'on one hand',
      'on the other', 'i love and', 'i hate that i love', 'complicated',
      'mixed', 'don\'t know how to feel', 'more than one thing',
    ]),
    syntax: { concessive_structure: true, parallel_construction: true },
  },

  AWE: {
    tier: 'TERTIARY',
    description: 'Expansion beyond the self — vastness, smallness, beauty, terror',
    lexicon: new Set([
      'incredible', 'can\'t describe', 'beyond', 'larger than',
      'something bigger', 'don\'t have words', 'overwhelming beauty',
      'makes me feel small', 'infinite', 'profound',
    ]),
    syntax: { inadequacy_of_language: true, comparison_to_infinite: true },
  },

  EXISTENTIAL_DREAD: {
    tier: 'TERTIARY',
    description: 'Fear without object — the ground itself is unstable',
    lexicon: new Set([
      'what\'s the point', 'nothing means', 'doesn\'t matter', 'in the end',
      'meaningless', 'why bother', 'all going to', 'temporary', 'nothing lasts',
      'what are we even', 'fundamentally',
    ]),
    syntax: { abstract: true, rhetorical: true, present_tense: true },
    prosody: { energy: 'flat', rate: 'slow', cadence: 'even' },
  },

  TENDER_ACHE: {
    tier: 'TERTIARY',
    description: 'Love + grief + beauty simultaneously — Japanese mono no aware',
    lexicon: new Set([
      'beautiful and sad', 'bittersweet', 'fleeting', 'precious because',
      'won\'t last', 'while i can', 'right now', 'in this moment',
      'already gone', 'transient', 'brief',
    ]),
    syntax: { present_tense: true, impermanence: true },
  },

  SHAME: {
    tier: 'TERTIARY',
    description: 'Not guilt (I did something wrong) but shame (I am wrong)',
    lexicon: new Set([
      'wrong with me', 'broken', 'not normal', 'should be',
      'everyone else', 'just me', 'always been', 'can\'t be fixed',
      'unlovable', 'too much', 'not enough',
    ]),
    syntax: { self_as_defect: true, universalizing: true },
    prosody: { energy: 'low', rate: 'slow', voice_quality: 'constricted' },
  },

  LONGING: {
    tier: 'TERTIARY',
    description: 'Desire for something absent — person, state, time, self',
    lexicon: new Set([
      'wish', 'if only', 'i want', 'yearn', 'long for', 'crave',
      'used to', 'want to go back', 'remember when', 'miss that',
      'want to feel', 'want to be',
    ]),
    syntax: { conditional: true, past_positive: true },
    prosody: { energy: 'soft', rate: 'slow', pauses: 'present' },
  },

  DISSOCIATION_AFFECT: {
    tier: 'TERTIARY',
    description: 'Emotional numbness, unreality, watching from outside',
    lexicon: new Set([
      'numb', 'nothing', 'don\'t feel', 'weird', 'not real',
      'like it\'s not happening', 'watching myself', 'from outside',
      'disconnected', 'can\'t feel', 'should feel but', 'strange',
    ]),
    syntax: { observer_language: true, negated_feeling: true },
    prosody: { energy: 'flat', rate: 'slow', monotone: true },
  },

  RELIEF: {
    tier: 'TERTIARY',
    description: 'Release of held tension — exhale after long inhale',
    lexicon: new Set([
      'finally', 'over', 'can breathe', 'let go', 'relief',
      'weight lifted', 'done', 'glad it\'s', 'didn\'t realize how',
      'feels so much better', 'lighter',
    ]),
    syntax: { past_tense_negative_now_positive: true },
    prosody: { energy: 'drop_then_settle', exhale_quality: true },
  },

  ANTICIPATORY_DREAD: {
    tier: 'TERTIARY',
    description: 'Fear about a specific future event — not diffuse anxiety',
    lexicon: new Set([
      'dreading', 'not looking forward', 'going to be awful',
      'can\'t stop thinking about', 'keep imagining', 'what if it',
      'already anxious', 'just want it over',
    ]),
    syntax: { future_tense: true, catastrophizing: true, repetitive_return: true },
    prosody: { energy: 'moderate', rate: 'slightly_fast' },
  },

  PROTECTIVE_NUMBNESS: {
    tier: 'TERTIARY',
    description: 'Chosen not-feeling as self-protection — not dissociation, decision',
    lexicon: new Set([
      'not going to let', 'won\'t let it', 'protecting myself',
      'don\'t want to feel', 'if i feel it i\'ll', 'keeping it together',
      'can\'t afford to', 'not now',
    ]),
    syntax: { volitional: true, future_risk: true, control_language: true },
    prosody: { energy: 'controlled', flatness: 'deliberate' },
  },
};

// ─── Integration Level Rubric ─────────────────────────────────────────────────
/**
 * Five levels of narrative/experiential integration.
 * Based on: Siegel's window of tolerance + EMDR processing markers +
 * coherent narrative theory (Main & Goldwyn AAI coding).
 */
export const INTEGRATION_LEVELS = Object.freeze({
  COLLAPSED:    { level: 0, label: 'collapsed',    description: 'System offline — minimal language, no narrative structure' },
  FRAGMENTED:   { level: 1, label: 'fragmented',   description: 'Experience present but cannot be organized — fragments, loops, breaks' },
  PARTIAL:      { level: 2, label: 'partial',      description: 'Narrative emerging but incomplete — coherent in places, lost in others' },
  COHERENT:     { level: 3, label: 'coherent',     description: 'Experience organized into intelligible narrative — cause, sequence, meaning' },
  INTEGRATED:   { level: 4, label: 'integrated',   description: 'Experience metabolized — present, reflective, embodied, forward-moving' },
});

// ─── Speech Mode Definitions ──────────────────────────────────────────────────
export const SPEECH_MODES = Object.freeze({
  EXTERNAL_PROCESSING: 'external_processing',  // thinking out loud, listener is witness
  SELF_TALK:           'self_talk',             // talking to self, lower social register
  PERFORMATIVE:        'performative',           // narrating for audience, managed
  INTEGRATED:          'integrated',             // grounded, organized, addressed
  COLLAPSED:           'collapsed',              // system offline, minimal coherent speech
});

// ─── Main Module ──────────────────────────────────────────────────────────────

export class SpeechStateModule {
  static UUID    = MODULE_UUID;
  static VERSION = MODULE_VERSION;

  constructor({ kernel, config = {} } = {}) {
    if (!kernel) throw new Error('[SpeechStateModule §1.2] kernel is required');

    this.uuid    = MODULE_UUID;
    this.version = MODULE_VERSION;
    this._kernel = kernel;
    this._cfg    = {
      fragmentationThreshold:  config.fragmentationThreshold  ?? 0.35,
      dysregulationThreshold:  config.dysregulationThreshold  ?? 0.40,
      emotionConfidence:       config.emotionConfidence        ?? 0.30,
      integrationWindow:       config.integrationWindow        ?? 10,    // utterances
      summaryIntervalMs:       config.summaryIntervalMs        ?? 5000,
    };

    // ── State ──────────────────────────────────────────────────────────────

    // Audio stream
    this._energy    = 0;
    this._zcr       = 0;
    this._cadence   = 0;
    this._spectral  = 0;
    this._energyW   = new SlidingWindow(30);
    this._zcrW      = new SlidingWindow(30);
    this._cadenceW  = new SlidingWindow(30);
    this._rateW     = new SlidingWindow(20);   // words per minute

    // Latent / NS / Emo
    this._latent    = { valence: 0, arousal: 0, suppression: 0, coherence: 0.5, engagement: 0 };
    this._nsState   = null;
    this._emoState  = null;

    // Video cues
    this._activeCues = new Set();

    // Transcript accumulation
    this._utterances       = [];    // last N utterances (full objects)
    this._allText          = '';    // session text for topic tracking
    this._utteranceCount   = 0;

    // Fragmentation tracking
    this._fragmentScores   = new SlidingWindow(15);
    this._abandonCount     = 0;
    this._repetitionCount  = 0;
    this._derailCount      = 0;

    // Rhythm
    this._speechOnset      = null;
    this._pauseDurations   = new SlidingWindow(20);
    this._breathPhrases    = new SlidingWindow(20); // syllable groups between pauses

    // Emotion spectrum state
    this._emotionScores    = {};
    Object.keys(EMOTIONAL_SPECTRUM).forEach(k => { this._emotionScores[k] = 0; });

    // Integration
    this._integrationScores = new SlidingWindow(10);

    // Self-reference
    this._metacognitiveCount = 0;
    this._selfAttackCount    = 0;
    this._externalLocusCount = 0;
    this._internalLocusCount = 0;

    // Summary timer
    this._summaryTimer = null;
    this._sessionStart = null;
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  start() {
    const k = this._kernel;
    const s = (ch, fn) => k.subscribe(ch, ev => fn(ev.payload ?? ev));

    s('alk.verbal.transcript',          ev => this._onTranscript(ev));
    s('alk.verbal.analysis.tone',       ev => this._onTone(ev));
    s('alk.verbal.analysis.sentiment',  ev => this._onSentiment(ev));
    s('alk.latent.update',              ev => this._onLatent(ev));
    s('alk.htl.ns.state',               ev => { this._nsState  = ev; });
    s('alk.htl.emo.state',              ev => { this._emoState = ev; });
    s('alk.video.cue.detected',         ev => this._activeCues.add(ev.cueType ?? ev.cue));
    s('alk.video.cue.released',         ev => this._activeCues.delete(ev.cueType ?? ev.cue));
    s('alk.session.capture.start',      ()  => this._onSessionStart());
    s('alk.session.capture.stop',       ()  => this._onSessionStop());

    this._kernel.emit('alk.speech.ready', { uuid: MODULE_UUID, version: MODULE_VERSION });
  }

  // ── Session lifecycle ──────────────────────────────────────────────────────

  _onSessionStart() {
    this._sessionStart    = Date.now();
    this._utterances      = [];
    this._allText         = '';
    this._utteranceCount  = 0;
    this._fragmentScores.clear();
    this._energyW.clear();
    this._zcrW.clear();
    this._cadenceW.clear();
    this._pauseDurations.clear();
    this._integrationScores.clear();
    Object.keys(this._emotionScores).forEach(k => { this._emotionScores[k] = 0; });
    this._summaryTimer = setInterval(() => this._emitSummary(), this._cfg.summaryIntervalMs);
  }

  _onSessionStop() {
    clearInterval(this._summaryTimer);
    this._emitSummary();
    this._emitSessionSummary();
  }

  // ── Inbound handlers ───────────────────────────────────────────────────────

  _onTone(p) {
    this._energy   = p.energy   ?? this._energy;
    this._zcr      = p.zcr      ?? this._zcr;
    this._cadence  = p.cadence  ?? this._cadence;
    this._spectral = p.spectral ?? this._spectral;
    this._energyW.push(this._energy);
    this._zcrW.push(this._zcr);
    this._cadenceW.push(this._cadence);

    // Track speech onset for pause detection
    if (this._energy > 0.02) {
      if (!this._speechOnset) this._speechOnset = Date.now();
    } else {
      if (this._speechOnset) {
        const dur = Date.now() - this._speechOnset;
        if (dur > 200) this._pauseDurations.push(dur);
        this._speechOnset = null;
      }
    }
  }

  _onSentiment(p) {
    // Sentiment feeds emotion scoring indirectly through latent model
  }

  _onLatent(p) {
    this._latent.valence    = p.valence    ?? this._latent.valence;
    this._latent.arousal    = p.arousal    ?? this._latent.arousal;
    this._latent.suppression = p.suppression ?? this._latent.suppression;
    this._latent.coherence  = p.coherence  ?? this._latent.coherence;
    this._latent.engagement = p.engagement ?? this._latent.engagement;
  }

  _onTranscript(p) {
    const text = (p.text ?? '').trim();
    if (!text || text.length < 3) return;

    this._utteranceCount++;
    const words     = tokenize(text);
    const sents     = sentences(text);
    const wpm       = p.words_per_min ?? (words.length / ((p.duration_ms ?? 3000) / 60000));
    this._rateW.push(wpm);
    this._allText += ' ' + text;

    // Store utterance with context snapshot
    const utterance = {
      text, words, sents,
      n:          this._utteranceCount,
      ts:         Date.now(),
      wpm,
      energy:     this._energy,
      zcr:        this._zcr,
      cadence:    this._cadence,
      arousal:    this._latent.arousal,
      valence:    this._latent.valence,
      suppression: this._latent.suppression,
      ns:         this._nsState?.polyvagalState,
      cues:       new Set(this._activeCues),
    };

    this._utterances.push(utterance);
    if (this._utterances.length > 30) this._utterances.shift();

    // Run all analyzers
    const mode          = this._classifySpeechMode(utterance);
    const fragmentation = this._analyzeFragmentation(utterance);
    const dysregulation = this._analyzeDysregulation(utterance);
    const grounding     = this._analyzeGrounding(utterance);
    const emotion       = this._analyzeEmotionSpectrum(utterance);
    const integration   = this._analyzeIntegration(utterance, fragmentation, emotion);
    const selfRef       = this._analyzeSelfReference(utterance);
    const rhythm        = this._analyzeRhythm(utterance);

    // Emit per-utterance events
    this._emit('alk.speech.mode',             mode);
    this._emit('alk.speech.fragmentation',    fragmentation);
    this._emit('alk.speech.grounding',        grounding);
    this._emit('alk.speech.emotion.spectrum', emotion);
    this._emit('alk.speech.integration',      integration);
    this._emit('alk.speech.self_reference',   selfRef);
    this._emit('alk.speech.rhythm',           rhythm);

    if (dysregulation.active) {
      this._emit('alk.speech.dysregulation', dysregulation);
    }
  }

  // ── Speech Mode Classifier ─────────────────────────────────────────────────

  _classifySpeechMode(u) {
    const { text, words, arousal, suppression, energy } = u;

    let selfTalkScore  = 0;
    let externalScore  = 0;
    let performScore   = 0;
    let collapsedScore = 0;

    // Self-talk patterns
    for (const p of SELF_TALK_PATTERNS) {
      if (p.test(text)) selfTalkScore += 0.15;
      p.lastIndex = 0;
    }

    // External processing patterns
    for (const p of EXTERNAL_PROCESSING_PATTERNS) {
      if (p.test(text)) externalScore += 0.15;
      p.lastIndex = 0;
    }

    // Performative markers: high lexical density, organized syntax, second-person address
    const lexDensity = words.filter(w => w.length > 4 && !['about','would','could','should','their','there'].includes(w)).length / Math.max(words.length, 1);
    const hasYou     = /\byou\b/i.test(text);
    const hasWell    = /\bwell[,.]?\s/i.test(text);
    const organized  = u.sents.length > 1 && words.length / u.sents.length > 8;
    if (lexDensity > 0.5 && organized && hasYou) performScore += 0.4;
    if (hasWell && organized) performScore += 0.2;

    // Collapsed: very short, very low energy, minimal content
    if (words.length < 4 && energy < 0.03) collapsedScore += 0.6;
    if (this._nsState?.polyvagalState === 'DORSAL' && words.length < 6) collapsedScore += 0.3;

    // Audio adjustments
    const energyAvg = this._energyW.avg();
    if (energyAvg < 0.04) selfTalkScore  += 0.15;  // quiet = self-directed
    if (u.zcr > 0.15)     externalScore  += 0.10;  // higher ZCR = engagement

    // Suppression pushes toward performative
    if (suppression > 0.55) performScore += 0.2;

    // Determine mode
    const scores = {
      [SPEECH_MODES.SELF_TALK]:           clamp(selfTalkScore),
      [SPEECH_MODES.EXTERNAL_PROCESSING]: clamp(externalScore),
      [SPEECH_MODES.PERFORMATIVE]:        clamp(performScore),
      [SPEECH_MODES.COLLAPSED]:           clamp(collapsedScore),
    };

    const dominated = Object.entries(scores).sort(([,a],[,b]) => b - a);
    const topMode   = dominated[0];
    const topScore  = topMode[1];

    // Default to integrated if nothing dominates
    const mode = topScore > 0.25 ? topMode[0] : SPEECH_MODES.INTEGRATED;

    return {
      mode,
      scores,
      confidence: r4(topScore),
      utteranceN: u.n,
      evidence: [
        `wpm=${r4(u.wpm)}`,
        `energy=${r4(energy)}`,
        `suppression=${r4(suppression)}`,
        `ns=${u.ns ?? 'unknown'}`,
      ],
    };
  }

  // ── Fragmentation Analyzer ────────────────────────────────────────────────

  _analyzeFragmentation(u) {
    const { text, words, sents } = u;
    let score = 0;
    const markers = [];

    // Clause abandonment
    for (const p of FRAGMENTATION_PATTERNS.clause_abandon) {
      if (p.test(text)) { score += 0.25; markers.push('clause_abandoned'); }
      p.lastIndex = 0;
    }

    // Repetition loops
    for (const p of FRAGMENTATION_PATTERNS.repetition_loop) {
      if (p.test(text)) { score += 0.20; markers.push('repetition_loop'); this._repetitionCount++; }
      p.lastIndex = 0;
    }

    // Topic derailment
    for (const p of FRAGMENTATION_PATTERNS.topic_derail) {
      if (p.test(text)) { score += 0.15; markers.push('topic_derail'); this._derailCount++; }
      p.lastIndex = 0;
    }

    // Referential failure (pronoun without context)
    if (this._utterances.length < 2) {
      for (const p of FRAGMENTATION_PATTERNS.referential_fail) {
        if (p.test(text)) { score += 0.10; markers.push('referential_fail'); }
        p.lastIndex = 0;
      }
    }

    // Sentence length variance (high variance = fragmented)
    const sentLengths = sents.map(s => tokenize(s).length);
    if (sentLengths.length > 1) {
      const sd = stddev(sentLengths);
      const m  = mean(sentLengths);
      if (m > 0 && sd / m > 0.8) { score += 0.15; markers.push('length_variance_high'); }
    }

    // Word count very low under arousal (speech production failing)
    if (words.length < 5 && u.arousal > 0.55) {
      score += 0.20;
      markers.push('arousal_speech_collapse');
    }

    // Rate variance (if we have enough history)
    if (this._rateW.len >= 5 && this._rateW.sd() > 40) {
      score += 0.10;
      markers.push('rate_unstable');
    }

    // Disfluency density (uh, um, er, like as filler)
    const disfluencies = (text.match(/\b(uh+|um+|er+|like[,\s]|you know[,\s])\b/gi) ?? []).length;
    const disfluencyDensity = disfluencies / Math.max(words.length, 1);
    if (disfluencyDensity > 0.08) {
      score += clamp(disfluencyDensity * 3, 0, 0.30);
      markers.push('high_disfluency');
    }

    score = clamp(score);
    this._fragmentScores.push(score);

    const sessionAvg = this._fragmentScores.avg();

    // Classify fragmentation type
    let type = 'none';
    if (score > 0.6)        type = 'severe';
    else if (score > 0.4)   type = 'moderate';
    else if (score > 0.2)   type = 'mild';

    return {
      score:        r4(score),
      session_avg:  r4(sessionAvg),
      level:        type,
      markers,
      disfluency_density: r4(disfluencyDensity),
      under_arousal: u.arousal > 0.55 && score > 0.25,
    };
  }

  // ── Dysregulation Analyzer ────────────────────────────────────────────────

  _analyzeDysregulation(u) {
    const { text, energy } = u;
    const energyAvg = this._energyW.avg();
    const energySD  = this._energyW.sd();
    const zcrAvg    = this._zcrW.avg();
    const ar        = u.arousal;
    const ns        = this._nsState;

    // Score each subtype
    const subtypeScores = {};

    for (const [subtype, def] of Object.entries(DYSREGULATION_LEXICONS)) {
      let score = 0;

      // Lexical match
      for (const p of def.patterns) {
        if (p.test(text)) score += 0.20;
        p.lastIndex = 0;
      }

      // Audio signature match
      const sig = def.audio_signature;
      if (sig.energy_high        && energyAvg > 0.12)       score += 0.15;
      if (sig.energy_low         && energyAvg < 0.04)       score += 0.15;
      if (sig.energy_very_low    && energyAvg < 0.02)       score += 0.20;
      if (sig.variance_high      && energySD > 0.06)        score += 0.10;
      if (sig.variance_low       && energySD < 0.01)        score += 0.10;
      if (sig.zcr_high           && zcrAvg > 0.18)          score += 0.10;
      if (sig.rate_fast          && this._rateW.avg() > 180) score += 0.10;
      if (sig.monotone           && energySD < 0.005)       score += 0.15;
      if (sig.long_pauses        && this._pauseDurations.avg() > 3000) score += 0.15;

      // NS state alignment
      if (subtype === 'FLOODING'        && ns?.windowZone === 'HYPER')         score += 0.20;
      if (subtype === 'FREEZE_SPEECH'   && ns?.polyvagalState === 'FREEZE')     score += 0.25;
      if (subtype === 'FAWN_SPEECH'     && ns?.polyvagalState === 'FAWN')       score += 0.20;
      if (subtype === 'RAGE_SPEECH'     && ar > 0.70)                           score += 0.15;
      if (subtype === 'GRIEF_SPEECH'    && ar < 0.30 && u.valence < -0.3)      score += 0.15;
      if (subtype === 'DORSAL_COLLAPSE' && ns?.polyvagalState === 'DORSAL')     score += 0.25;
      if (subtype === 'HYPERVIGILANT_SCAN' && ns?.polyvagalState === 'SYMPATHETIC') score += 0.10;

      subtypeScores[subtype] = r4(clamp(score));
    }

    // Find dominant subtype
    const sorted  = Object.entries(subtypeScores).sort(([,a],[,b]) => b - a);
    const top     = sorted[0];
    const active  = top[1] > this._cfg.dysregulationThreshold;

    // Overall dysregulation intensity
    const intensity = r4(clamp(
      ar * 0.30 +
      (1 - this._latent.coherence) * 0.25 +
      this._fragmentScores.avg() * 0.25 +
      (active ? top[1] * 0.20 : 0)
    ));

    return {
      active,
      subtype:   active ? top[0] : null,
      intensity,
      scores:    subtypeScores,
      signature: active ? this._buildDysregulationSignature(top[0], u) : null,
      evidence: [
        `arousal=${r4(ar)}`,
        `energy=${r4(energyAvg)}`,
        `ns=${ns?.polyvagalState ?? 'unknown'}`,
        `fragment=${r4(this._fragmentScores.avg())}`,
      ],
    };
  }

  _buildDysregulationSignature(subtype, u) {
    const signatures = {
      FLOODING:          'System overwhelmed — speech production collapsing under load. Give space, reduce input.',
      FREEZE_SPEECH:     'Shutdown response — words available but access blocked. Wait. No new information.',
      FAWN_SPEECH:       'Appeasement response active — speaker suppressing own needs/position. Signal safety.',
      RAGE_SPEECH:       'Sympathetic activation with outward expression — underlying pain present. Hear the pain, not the volume.',
      GRIEF_SPEECH:      'Grief state — slow, heavy, past-oriented. Witness only. Do not fix or redirect.',
      DORSAL_COLLAPSE:   'Dorsal vagal — system offline. Presence only. No complex language.',
      HYPERVIGILANT_SCAN:'Threat-scanning mode — rapid questions, checking for danger signals. Slow everything down.',
    };
    return signatures[subtype] ?? 'Dysregulation detected.';
  }

  // ── Grounding Analyzer ────────────────────────────────────────────────────

  _analyzeGrounding(u) {
    const { text, words } = u;
    let groundingScore = 0;
    const anchors = [];

    // Present-moment language
    for (const anchor of GROUNDING_LEXICON) {
      if (text.toLowerCase().includes(anchor)) {
        groundingScore += 0.12;
        anchors.push(anchor);
      }
    }

    // Sensory language (present-tense body)
    const sensory = (text.match(/\b(see|hear|feel|smell|taste|touch|sense|notice)\s+(right now|now|that|a|the|it)\b/gi) ?? []).length;
    groundingScore += sensory * 0.10;
    if (sensory > 0) anchors.push('sensory_present');

    // Present-tense verb density
    const presentVerbs = (text.match(/\b(is|are|am|feel|see|hear|notice|sense|have|do|know|want|think|find)\b/gi) ?? []).length;
    const verbDensity  = presentVerbs / Math.max(words.length, 1);
    groundingScore += verbDensity * 0.3;

    // Displacement (reduces grounding)
    let displacementScore = 0;
    for (const p of DISPLACEMENT_PATTERNS) {
      const m = (text.match(p) ?? []).length;
      displacementScore += m * 0.12;
      p.lastIndex = 0;
    }

    // Temporal absolutism (never/always = ungrounded from present reality)
    const absolutes = (text.match(/\b(never|always|every time|constantly|all the time)\b/gi) ?? []).length;
    displacementScore += absolutes * 0.08;

    // NS alignment
    if (this._nsState?.polyvagalState === 'VENTRAL') groundingScore += 0.15;
    if (this._nsState?.polyvagalState === 'DORSAL')  groundingScore -= 0.30;

    const net = clamp(groundingScore - displacementScore * 0.5);

    let level;
    if (net > 0.60)       level = 'strongly_grounded';
    else if (net > 0.35)  level = 'grounded';
    else if (net > 0.15)  level = 'partial';
    else if (net > 0.05)  level = 'ungrounded';
    else                  level = 'dissociated';

    return {
      level,
      score:       r4(net),
      anchors:     [...new Set(anchors)],
      displacement: r4(clamp(displacementScore)),
      present_tense_density: r4(verbDensity),
    };
  }

  // ── Emotion Spectrum Analyzer ─────────────────────────────────────────────

  _analyzeEmotionSpectrum(u) {
    const { text, words, arousal, valence } = u;
    const wordSet  = new Set(words);
    const emo      = this._emoState;
    const cues     = this._activeCues;

    const scores = {};

    // Score each emotion state
    for (const [key, def] of Object.entries(EMOTIONAL_SPECTRUM)) {
      let score = 0;

      // Lexicon match
      if (def.lexicon) {
        let hits = 0;
        for (const word of def.lexicon) {
          if (wordSet.has(word) || text.toLowerCase().includes(word)) hits++;
        }
        score += hits * 0.12;
      }

      // Pattern match (suppressed forms, blends)
      if (def.markers) {
        for (const p of def.markers) {
          if (p.test(text)) score += 0.18;
          p.lastIndex = 0;
        }
      }

      // Syntax features
      if (def.syntax) {
        const sx = def.syntax;
        const qCount   = (text.match(/\?/g) ?? []).length;
        const exCount  = (text.match(/!/g) ?? []).length;
        const pastCount = (text.match(/\b(was|were|had|did|used to|loved|missed|went)\b/gi) ?? []).length;
        const futCount  = (text.match(/\b(will|going to|shall|want to|hope to|plan to)\b/gi) ?? []).length;
        const negCount  = (text.match(/\b(not|never|no|don't|can't|won't|didn't)\b/gi) ?? []).length;
        const absCount  = (text.match(/\b(always|never|everyone|everything|nothing|no one)\b/gi) ?? []).length;
        const condCount = (text.match(/\b(if|unless|assuming|suppose|imagine|what if)\b/gi) ?? []).length;
        const but       = /\bbut\b/i.test(text);
        const selfRef   = (text.match(/\b(i|me|my|mine|myself)\b/gi) ?? []).length / Math.max(words.length, 1);

        if (sx.questions        && qCount > 0)                             score += 0.08 * qCount;
        if (sx.conditional      && condCount > 0)                          score += 0.08 * condCount;
        if (sx.past_tense       && pastCount > 1)                          score += 0.10;
        if (sx.forward_tense    && futCount > 0)                           score += 0.08;
        if (sx.absolutes        && absCount > 0)                           score += 0.10;
        if (sx.exclamations     && exCount > 0)                            score += 0.08;
        if (sx.negation         && negCount > 2)                           score += 0.08;
        if (sx.but_constructions && but)                                    score += 0.10;
        if (sx.self_attack      && selfRef > 0.15 && negCount > 0)         score += 0.12;
        if (sx.observer_language && /\bwatching|from outside|like i'm\b/i.test(text)) score += 0.15;
        if (sx.negated_feeling  && /\bdon't feel|can't feel|numb|nothing\b/i.test(text)) score += 0.15;
        if (sx.volitional       && /\bwon't let|not going to|choosing not\b/i.test(text)) score += 0.12;
        if (sx.impermanence     && /\bwon't last|fleeting|brief|temporary|while\b/i.test(text)) score += 0.12;
        if (sx.internal_split   && /\bpart of me|another part|one side|other side\b/i.test(text)) score += 0.15;
        if (sx.inadequacy_of_language && /\bcan't describe|no words|beyond words|don't have words\b/i.test(text)) score += 0.18;
      }

      // Prosody alignment
      if (def.prosody) {
        const pr = def.prosody;
        const energyAvg = this._energyW.avg();
        const rateAvg   = this._rateW.avg();
        if (pr.energy === 'high'     && energyAvg > 0.10)  score += 0.08;
        if (pr.energy === 'low'      && energyAvg < 0.04)  score += 0.08;
        if (pr.energy === 'soft'     && energyAvg < 0.06)  score += 0.06;
        if (pr.energy === 'flat'     && this._energyW.sd() < 0.015) score += 0.08;
        if (pr.rate   === 'fast'     && rateAvg > 170)     score += 0.06;
        if (pr.rate   === 'slow'     && rateAvg < 100)     score += 0.06;
        if (pr.pauses === 'long'     && this._pauseDurations.avg() > 2000) score += 0.08;
        if (pr.monotone              && this._energyW.sd() < 0.01)  score += 0.10;
      }

      // Somatic cue alignment
      if (def.somatic_cues) {
        for (const cue of def.somatic_cues) {
          if (cues.has(cue)) score += 0.10;
        }
      }

      // HTL emotion model alignment
      if (emo?.dominant) {
        const dominantMap = {
          'SEEKING': ['SEEKING', 'APPROACH_AVOIDANCE'],
          'RAGE':    ['RAGE', 'RAGE_SPEECH', 'SHAME_RAGE', 'RAGE_GRIEF'],
          'FEAR':    ['FEAR', 'FEAR_SHAME', 'APPROACH_AVOIDANCE', 'EXISTENTIAL_DREAD', 'ANTICIPATORY_DREAD'],
          'CARE':    ['CARE', 'LOVE_GRIEF', 'TENDER_ACHE'],
          'GRIEF':   ['GRIEF', 'LOVE_GRIEF', 'GRIEF_RAGE', 'TENDER_ACHE', 'LONGING'],
          'PLAY':    ['PLAY', 'AWE'],
        };
        if (dominantMap[emo.dominant]?.includes(key)) score += 0.15;
      }

      // Latent alignment
      if (valence < -0.3) {
        if (['GRIEF','FEAR','RAGE','SHAME','EXISTENTIAL_DREAD','DISSOCIATION_AFFECT'].includes(key)) score += 0.08;
      }
      if (valence > 0.3) {
        if (['SEEKING','CARE','PLAY','RELIEF','AWE','TENDER_ACHE'].includes(key)) score += 0.08;
      }

      // EMA with previous score for smoothing
      const prev = this._emotionScores[key] ?? 0;
      const smoothed = prev * 0.6 + clamp(score) * 0.4;
      this._emotionScores[key] = r4(smoothed);
      scores[key] = r4(smoothed);
    }

    // Tier separation
    const primary    = this._topByTier(scores, 'PRIMARY', 2);
    const secondary  = this._topByTier(scores, 'SECONDARY', 2);
    const tertiary   = this._topByTier(scores, 'TERTIARY', 3);
    const suppressed = this._topByTier(scores, 'PRIMARY_SUPPRESSED', 2);

    // Somatic emotion: high body cues, low verbal emotional content
    const bodyCues   = ['shoulder_raise','self_touch_face','jaw_clench','lean_back','lean_forward'].filter(c => cues.has(c)).length;
    const verbalEmo  = primary[0]?.score ?? 0;
    const somatic    = bodyCues > 1 && verbalEmo < 0.25;

    // Transition: two primaries both rising
    const transition = primary.length >= 2 &&
                       primary[0].score > 0.25 &&
                       primary[1].score > 0.20;

    // Dimensional coordinates (circumplex model)
    const dimensional = {
      valence:  r4(this._latent.valence),
      arousal:  r4(this._latent.arousal),
      approach: r4(this._latent.engagement),
      suppression: r4(this._latent.suppression),
    };

    return {
      primary,
      secondary,
      tertiary,
      suppressed,
      somatic_emotion:  somatic,
      in_transition:    transition,
      dimensional,
      confidence: r4(primary[0]?.score ?? 0),
      // §1.1
      note: 'Signal only. Not diagnosis. Emotion scores are inferred from behavioral patterns.',
    };
  }

  _topByTier(scores, tier, n) {
    return Object.entries(EMOTIONAL_SPECTRUM)
      .filter(([k, def]) => def.tier === tier && scores[k] > this._cfg.emotionConfidence)
      .map(([k]) => ({ emotion: k, score: scores[k], description: EMOTIONAL_SPECTRUM[k].description ?? '' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, n);
  }

  // ── Integration Analyzer ──────────────────────────────────────────────────

  _analyzeIntegration(u, fragmentation, emotion) {
    const { text, words, sents } = u;
    let score = 0;

    // Coherent sentence structure
    const avgSentLen = words.length / Math.max(sents.length, 1);
    if (avgSentLen > 8 && avgSentLen < 30) score += 0.20;

    // Causal reasoning (because, therefore, which means)
    const causal = (text.match(/\b(because|therefore|which means|so that|as a result|since|this is why)\b/gi) ?? []).length;
    score += Math.min(causal * 0.10, 0.20);

    // Temporal sequencing (first, then, after, before)
    const sequential = (text.match(/\b(first|then|after|before|when|while|since|until|next)\b/gi) ?? []).length;
    score += Math.min(sequential * 0.06, 0.15);

    // Self-observation (integration marker from AAI research)
    const metacog = (METACOGNITIVE_PATTERNS.filter(p => { const m = p.test(text); p.lastIndex = 0; return m; })).length;
    score += metacog * 0.12;

    // Penalize fragmentation
    score -= fragmentation.score * 0.5;

    // Penalize dorsal state
    if (this._nsState?.polyvagalState === 'DORSAL')  score -= 0.30;
    if (this._nsState?.windowZone === 'HYPER')       score -= 0.20;

    // Grounding boosts integration
    if (u.arousal < 0.50 && this._latent.coherence > 0.5) score += 0.15;

    score = clamp(score);
    this._integrationScores.push(score);
    const sessionAvg = this._integrationScores.avg();

    // Map to level
    let level;
    if (score > 0.70)       level = INTEGRATION_LEVELS.INTEGRATED;
    else if (score > 0.50)  level = INTEGRATION_LEVELS.COHERENT;
    else if (score > 0.30)  level = INTEGRATION_LEVELS.PARTIAL;
    else if (score > 0.10)  level = INTEGRATION_LEVELS.FRAGMENTED;
    else                    level = INTEGRATION_LEVELS.COLLAPSED;

    return {
      level:               level.label,
      level_code:          level.level,
      score:               r4(score),
      session_avg:         r4(sessionAvg),
      narrative_coherence: r4(clamp(causal * 0.12 + sequential * 0.08)),
      self_access:         r4(clamp(metacog * 0.15)),
      under_window:        this._nsState?.windowZone === 'WINDOW',
      description:         level.description,
    };
  }

  // ── Self-Reference Analyzer ───────────────────────────────────────────────

  _analyzeSelfReference(u) {
    const { text, words } = u;

    // Metacognitive density
    const metacog = METACOGNITIVE_PATTERNS.filter(p => { const m = p.test(text); p.lastIndex = 0; return m; }).length;
    this._metacognitiveCount += metacog;

    // Self-attack patterns
    const selfAttack = /\bwhat'?s? wrong with me|i('m| am) (so |such a )?(stupid|pathetic|broken|useless|terrible)|i should(n't)? (know|be|have)/gi.test(text);
    if (selfAttack) this._selfAttackCount++;

    // Locus of control
    const externalLocus = /\b(because of|made me|forced|had to|no choice|their fault|caused by|they made|out of my hands)\b/gi.test(text);
    const internalLocus = /\b(i chose|i decided|my choice|i caused|my responsibility|i take)\b/gi.test(text);
    if (externalLocus) this._externalLocusCount++;
    if (internalLocus) this._internalLocusCount++;

    // First-person density
    const selfTokens = words.filter(w => ['i','me','my','mine','myself'].includes(w)).length;
    const selfDensity = selfTokens / Math.max(words.length, 1);

    // Structure: observation vs identification
    // "I notice I'm angry" (metacognitive distance) vs "I am angry" (identification)
    const observed   = metacog > 0;
    const identified = /\bi('m| am) (angry|scared|sad|hurt|furious|devastated|broken)\b/gi.test(text);

    const locus = this._externalLocusCount > this._internalLocusCount * 1.5 ? 'external'
                : this._internalLocusCount > this._externalLocusCount * 1.5 ? 'internal'
                : 'mixed';

    return {
      structure:     observed ? 'metacognitive' : identified ? 'identified' : 'neutral',
      metacognitive: r4(clamp(metacog * 0.20)),
      self_density:  r4(selfDensity),
      self_attack:   selfAttack,
      locus,
      session_locus_ratio: r4(this._internalLocusCount / Math.max(1, this._externalLocusCount + this._internalLocusCount)),
    };
  }

  // ── Rhythm Analyzer ───────────────────────────────────────────────────────

  _analyzeRhythm(u) {
    const rateAvg  = this._rateW.avg();
    const rateSD   = this._rateW.sd();
    const pauseAvg = this._pauseDurations.avg();
    const pauseSD  = this._pauseDurations.sd();

    // Breath phrase length (words between pauses — proxy for breath groups)
    // Approximated from words per utterance and pause history
    const breathPhrase = u.words.length;
    this._breathPhrases.push(breathPhrase);

    // Rate classification
    const rateClass = rateAvg > 200 ? 'racing'
                    : rateAvg > 160 ? 'fast'
                    : rateAvg > 120 ? 'moderate'
                    : rateAvg > 80  ? 'slow'
                    : 'very_slow';

    // Pause topology
    const pauseClass = pauseAvg > 4000 ? 'long_gaps'
                     : pauseAvg > 2000 ? 'considered'
                     : pauseAvg > 800  ? 'natural'
                     : pauseAvg > 300  ? 'rapid'
                     : 'minimal';

    // Rhythm regularity (low SD = metronomic, high SD = organic or dysregulated)
    const regularity = rateSD > 0 ? r4(clamp(1 - rateSD / Math.max(rateAvg, 1))) : 0.5;

    return {
      words_per_min:       r4(rateAvg),
      rate_variance:       r4(rateSD),
      rate_class:          rateClass,
      pause_avg_ms:        Math.round(pauseAvg),
      pause_variance_ms:   Math.round(pauseSD),
      pause_topology:      pauseClass,
      breath_phrase_avg:   r4(this._breathPhrases.avg()),
      rhythm_regularity:   regularity,
      arousal_rate_match:  r4(clamp(u.arousal * 200 - rateAvg, -1, 1)), // positive = faster than expected, negative = slower
    };
  }

  // ── Summary emission ──────────────────────────────────────────────────────

  _emitSummary() {
    if (this._utteranceCount < 2) return;

    // Top emotions across session
    const topEmotions = Object.entries(this._emotionScores)
      .filter(([, v]) => v > 0.20)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([k, v]) => ({ emotion: k, score: r4(v), tier: EMOTIONAL_SPECTRUM[k]?.tier }));

    this._emit('alk.speech.summary', {
      utterance_count:      this._utteranceCount,
      session_ms:           Date.now() - (this._sessionStart ?? Date.now()),
      fragmentation_avg:    r4(this._fragmentScores.avg()),
      integration_avg:      r4(this._integrationScores.avg()),
      rate_avg:             r4(this._rateW.avg()),
      top_emotions:         topEmotions,
      metacognitive_count:  this._metacognitiveCount,
      locus_ratio:          r4(this._internalLocusCount / Math.max(1, this._externalLocusCount + this._internalLocusCount)),
    });
  }

  _emitSessionSummary() {
    this._emitSummary();
  }

  // ── Error surface ──────────────────────────────────────────────────────────

  _emit(type, payload) {
    try {
      this._kernel.emit(type, payload, { sourceUUID: MODULE_UUID });
    } catch (err) {
      this._kernel.emit('alk.speech.error', {
        source:  type,
        message: err.message,
        payload,
      }, { sourceUUID: MODULE_UUID });
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and start a SpeechStateModule.
 *
 * @param {object} opts
 * @param {object} opts.kernel   — ALK kernel (emit/subscribe)
 * @param {object} [opts.config] — optional config overrides
 * @returns {SpeechStateModule}
 *
 * Usage:
 *   import { createSpeechStateModule } from './speech-state-module.js';
 *   const speech = createSpeechStateModule({ kernel });
 *   speech.start();
 *   kernel.subscribe('alk.speech.emotion.spectrum', ev => console.log(ev.payload));
 */
export function createSpeechStateModule({ kernel, config = {} } = {}) {
  const mod = new SpeechStateModule({ kernel, config });
  return mod;
}

export default {
  createSpeechStateModule,
  SpeechStateModule,
  EMOTIONAL_SPECTRUM,
  INTEGRATION_LEVELS,
  SPEECH_MODES,
  MODULE_UUID,
  MODULE_VERSION,
};
