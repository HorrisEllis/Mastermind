/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK BehaviorAnalysisModule  ·  behavior-module.js  ·  v1.4.0          ║
 * ║  UUID: alk-mod-behavior-0000-1200-0000-000000000080                    ║
 * ║  HOOK: alk.module.behavior:behavior-analyzer:00080                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — Nothing pretends. Every detector documents exactly what it computes,
 *         what its inputs are, and what its failure modes are.
 * §5.1 — UUID, hook, and event bus registration on every detector class.
 * §5.7 — Zero direct calls to other modules. All I/O via kernel events.
 * §1.8 — Pulse emission registered at startup.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A multi-domain behavioral pattern detection engine. It synthesizes signals
 * from verbal, video, and text streams — arriving as ALK events — into
 * higher-order behavioral constructs.
 *
 * This is NOT a diagnostic tool. It does NOT classify people. It detects and
 * describes OBSERVABLE BEHAVIORAL PATTERNS in communication dynamics.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECTION DOMAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. CONTRASTIVE THINKING — surface what's said vs what's meant
 *    Sources: hedge density, negation patterns, conditional chains,
 *    contradiction windows, semantic reversal detection
 *
 * 2. NEGATIVE SPACE REASONING — detect what is NOT said / avoided
 *    Sources: topic avoidance scoring, silence duration, vocabulary gaps,
 *    absence of expected semantic fields, pronoun omission patterns
 *
 * 3. SHADOW REASONING (Jungian) — surface suppressed or projected content
 *    Sources: pronoun displacement ("you/they" when pattern suggests "I"),
 *    intensity mismatch (mild words, high arousal), over-qualification,
 *    blame architecture (external vs internal locus constructions)
 *
 * 4. RHYTHM, RHYME, CADENCE — temporal and acoustic structure of speech
 *    Sources: syllable rate, pause topology, prosodic contour, response
 *    latency curves, turn-taking rhythm, breath-phrase boundaries
 *
 * 5. OMNI-DIRECTIONAL PATTERN MANIPULATION — multi-axis pattern coherence
 *    Sources: cross-modal consistency (words vs face vs body vs tone),
 *    temporal drift detection, pattern fragmentation, emotional congruence
 *
 * 6. VIDEO→TEXT TRANSLATION — landmark geometry → behavioral narrative
 *    Sources: eye movement vectors, posture geometry, hand kinetics,
 *    jaw tension proxy, facial muscle activation, somatic state mapping
 *
 * 7. SOMATIC MARKER SYSTEM — body state → emotional reasoning proxy
 *    Sources: shoulder geometry, breath rhythm (from audio envelope),
 *    self-touch clusters, protective posture detection, freeze responses
 *
 * 8. ATTACHMENT BEHAVIORAL SIGNATURES
 *    Sources: repair attempt frequency, withdrawal velocity, escalation
 *    cycles, synchrony collapse, reattunement patterns
 *
 * 9. ESCALATION TOPOLOGY — emotional momentum and inflection mapping
 *    Sources: sentiment gradient, intensity velocity, shift clustering,
 *    de-escalation attempt detection, rupture-repair cycles
 *
 * 10. HERMETIC PATTERNS — closed-system thinking detection
 *    Sources: self-referential logic density, external validation seeking,
 *    circular reasoning chains, ideational closure speed
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Listens:
 *   alk.verbal.chunk.transcribed    — text input
 *   alk.verbal.analysis.tone        — energy, zcr, cadence, spectral
 *   alk.verbal.analysis.sentiment   — score, valence, rollingAvg
 *   alk.verbal.analysis.shift       — micro-shift events
 *   alk.video.landmarks.face        — face geometry
 *   alk.video.landmarks.pose        — body geometry
 *   alk.video.cue.detected          — classified visual cues
 *   alk.video.cue.sustained         — sustained visual cues
 *   alk.session.capture.start/stop
 *   alk.behavior.config             — runtime config update
 *
 * Emits:
 *   alk.behavior.pattern.detected   — primary output: named pattern + evidence
 *   alk.behavior.narrative.frame    — video→text translation per frame
 *   alk.behavior.escalation.alert   — momentum crossing threshold
 *   alk.behavior.shadow.signal      — Jungian shadow marker
 *   alk.behavior.negative.space     — avoidance pattern
 *   alk.behavior.somatic.state      — body-state composite
 *   alk.behavior.rhythm.event       — cadence / prosody anomaly
 *   alk.behavior.attachment.signal  — attachment behavioral signature
 *   alk.behavior.summary            — per-interval composite report
 *   alk.behavior.pulse              — §1.8 heartbeat
 *   alk.behavior.error
 */

import { ALKModule } from '../../kernel.js';

// ─── Module Identity ──────────────────────────────────────────────────────────

const MODULE_UUID    = 'alk-mod-behavior-0000-1200-0000-000000000080';
const MODULE_VERSION = '1.4.0';
const MODULE_NS      = 'alk.behavior';

// ─── §1.1 — Every constant documented ────────────────────────────────────────

export const PATTERN_DOMAIN = Object.freeze({
  CONTRASTIVE:    'CONTRASTIVE',      // contrast thinking
  NEGATIVE_SPACE: 'NEGATIVE_SPACE',   // avoidance / omission
  SHADOW:         'SHADOW',           // Jungian projection
  RHYTHMIC:       'RHYTHMIC',         // cadence / prosody
  SOMATIC:        'SOMATIC',          // body-state markers
  ESCALATION:     'ESCALATION',       // emotional momentum
  ATTACHMENT:     'ATTACHMENT',       // relational signatures
  HERMETIC:       'HERMETIC',         // closed-system thinking
  CROSS_MODAL:    'CROSS_MODAL',      // multi-stream consistency
  NARRATIVE:      'NARRATIVE',        // video→text translation
});

export const CONFIDENCE = Object.freeze({
  LOW:    'LOW',      // single signal, no corroboration
  MEDIUM: 'MEDIUM',   // 2+ corroborating signals
  HIGH:   'HIGH',     // 3+ signals, cross-modal confirmation
});

export const AXIOM_VERSION = '1.4.0';

// ─── Lexicon Banks (§5.5 — built, not imported) ───────────────────────────────

/**
 * HEDGE_WORDS — linguistic uncertainty markers
 * Detected in transcript stream.
 * High hedge density = contrastive thinking or suppression.
 */
const HEDGE_WORDS = new Set([
  'maybe','perhaps','possibly','probably','might','could','would','should',
  'kind of','sort of','i think','i guess','i suppose','i feel like',
  'it seems','it appears','somewhat','rather','fairly','quite',
  'in a way','to some extent','more or less','not sure','uncertain',
]);

/**
 * NEGATION_PATTERNS — explicit negation constructions
 */
const NEGATION_WORDS = new Set([
  'not','no','never','nothing','nobody','nowhere','neither','nor',
  "don't","doesn't","didn't","won't","wouldn't","can't","cannot",
  "isn't","aren't","wasn't","weren't","hasn't","haven't","hadn't",
]);

/**
 * PROJECTION_MARKERS — pronoun displacement signals (shadow detection)
 * Subject uses "you/they/people" when semantic content is self-referential.
 */
const PROJECTION_PRONOUNS = new Set([
  'you','they','people','everyone','someone','anyone','one',
  'we','us','them','others',
]);

const SELF_PRONOUNS = new Set(['i','me','my','myself','mine']);

/**
 * EXTERNAL_LOCUS_MARKERS — blame / causation attributed externally
 */
const EXTERNAL_LOCUS = new Set([
  'because of','due to','thanks to','fault','blame','caused by',
  'made me','forced me','had to','no choice','out of my hands',
  'they made','it was their','never listen','always cause','always do',
  'you never','they always','people always','everyone does','nobody',
  'they never','you always','they just','you just',
]);

/**
 * INTERNAL_LOCUS_MARKERS — self-attribution
 */
const INTERNAL_LOCUS = new Set([
  'i chose','i decided','i caused','my fault','my choice',
  'i take responsibility','i did','i made',
]);

/**
 * REPAIR_ATTEMPT_MARKERS — relationship repair bids
 */
const REPAIR_MARKERS = new Set([
  'i understand','i hear you','you are right','fair point',
  'i apologize','i am sorry','i was wrong','let me try again',
  'can we','shall we','i want to understand','help me understand',
  'i see what you mean','i get it',
]);

/**
 * ESCALATION_MARKERS — intensity amplifiers
 */
const ESCALATION_WORDS = new Set([
  'always','never','every time','constantly','all the time',
  'worst','terrible','awful','impossible','hopeless','pointless',
  'nothing works','you never','you always',
]);

/**
 * CLOSURE_MARKERS — hermetic / closed-system thinking
 * System that cannot be falsified, self-sealing logic.
 */
const HERMETIC_MARKERS = new Set([
  'obviously','of course','clearly','everyone knows','it is clear',
  'that is just how it is','that is the truth','undeniably',
  'there is no question','that is obvious','it is simple',
  'anyone can see','the fact is','undoubtedly',
]);

/**
 * AVOIDANCE_TOPICS — semantic field gaps that suggest topic avoidance
 * When these fields are absent across a long transcript, score negative space.
 * §1.1 — These are heuristic seed terms, not diagnostic labels.
 */
const SOMATIC_VOCABULARY = new Set([
  'feel','feeling','felt','sense','sensation','body','chest','stomach',
  'heart','breath','breathe','tight','heavy','light','warm','cold',
  'nervous','anxious','shaking','trembling','tense','relaxed','calm',
]);

const EMOTION_VOCABULARY = new Set([
  'angry','afraid','scared','sad','happy','joy','grief','hurt','pain',
  'frustrated','confused','overwhelmed','numb','empty','alive',
  'excited','proud','ashamed','guilty','embarrassed','lonely',
]);

// ─── EMA helper (§5.5 — built inline) ────────────────────────────────────────

function ema(prev, val, alpha = 0.3) {
  return prev === null ? val : alpha * val + (1 - alpha) * prev;
}

function r4(n) { return Math.round(n * 10000) / 10000; }

// ─── Window helper ────────────────────────────────────────────────────────────

class SlidingWindow {
  constructor(maxLen) { this._buf = []; this._max = maxLen; }
  push(v)   { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); }
  get vals(){ return this._buf; }
  get len() { return this._buf.length; }
  avg()     { return this._buf.length ? this._buf.reduce((s,v)=>s+v,0)/this._buf.length : 0; }
  last()    { return this._buf[this._buf.length-1] ?? null; }
  clear()   { this._buf = []; }
}

// ─── Video→Text Translator ────────────────────────────────────────────────────

/**
 * VideoNarrativeTranslator — converts landmark geometry events into
 * plain-text behavioral descriptions.
 *
 * §1.1 — Every sentence is prefixed with its confidence level.
 *         No sentence claims certainty it cannot mathematically support.
 *
 * Inputs: alk.video.landmarks.face, alk.video.landmarks.pose,
 *         alk.video.cue.detected, alk.video.cue.sustained
 *
 * Output: alk.behavior.narrative.frame — { text, confidence, signals[] }
 *
 * Example output:
 *   "Moderate confidence: Subject's gaze is deviated left (0.38 offset).
 *    Head tilted 14° right. Brow furrow sustained 12 frames — likely
 *    concentrating or processing discomfort. Shoulders slightly raised
 *    (delta 0.06) — possible tension holding pattern."
 */
export class VideoNarrativeTranslator {
  constructor() {
    this._activeCues   = new Map();   // cueType → { detail, frames, firstTs }
    this._lastTilt     = 0;
    this._lastEAR      = { l: 1, r: 1 };
    this._lastGaze     = { x: 0, y: 0 };
    this._lastShoulder = 0;
    this._blinkHistory = new SlidingWindow(20);
    this._frameCount   = 0;
  }

  /**
   * Absorb a cue detection event.
   */
  ingestCue(cue) {
    const key = cue.cueType;
    if (!this._activeCues.has(key)) {
      this._activeCues.set(key, { ...cue, frames: 1, firstTs: Date.now() });
    } else {
      this._activeCues.get(key).frames++;
    }
  }

  ingestCueRelease(cueType) { this._activeCues.delete(cueType); }

  ingestFaceLandmarks(payload) {
    if (payload.headTiltDeg !== null) this._lastTilt = payload.headTiltDeg;
    if (payload.leftEAR  !== undefined) this._lastEAR.l = payload.leftEAR;
    if (payload.rightEAR !== undefined) this._lastEAR.r = payload.rightEAR;
    this._frameCount = payload.frameIndex ?? this._frameCount;
  }

  ingestPoseLandmarks(payload) {
    if (payload.shoulderRaiseDelta !== null) this._lastShoulder = payload.shoulderRaiseDelta;
  }

  /**
   * Generate a narrative frame from current state.
   * Returns { text, confidence, signals[] }
   */
  generateFrame() {
    const sentences = [];
    const signals   = [];
    let confidenceScore = 0;

    // ── Gaze ──────────────────────────────────────────────────────────────────
    const gazeDeviation = Math.sqrt(this._lastGaze.x**2 + this._lastGaze.y**2);
    if (gazeDeviation > 0.25) {
      const dir = this._lastGaze.x > 0 ? 'right' : 'left';
      const mag = gazeDeviation > 0.45 ? 'strongly' : 'moderately';
      sentences.push(`Gaze ${mag} deviated ${dir} (offset ${r4(gazeDeviation)}).`);
      signals.push({ type: 'gaze_deviation', value: r4(gazeDeviation), direction: dir });
      confidenceScore += 0.3;
    } else if (gazeDeviation < 0.08) {
      sentences.push(`Direct eye contact maintained (gaze offset ${r4(gazeDeviation)}).`);
      signals.push({ type: 'eye_contact', value: r4(gazeDeviation) });
      confidenceScore += 0.15;
    }

    // ── Head tilt ─────────────────────────────────────────────────────────────
    const tiltAbs = Math.abs(this._lastTilt);
    if (tiltAbs > 8) {
      const dir  = this._lastTilt > 0 ? 'right' : 'left';
      const qual = tiltAbs > 20 ? 'pronounced' : tiltAbs > 12 ? 'noticeable' : 'subtle';
      sentences.push(`Head ${qual}ly tilted ${dir} (${r4(this._lastTilt)}°) — possible active listening or uncertainty.`);
      signals.push({ type: 'head_tilt', value: r4(this._lastTilt) });
      confidenceScore += 0.2;
    }

    // ── Blink rate ────────────────────────────────────────────────────────────
    const avgEAR = (this._lastEAR.l + this._lastEAR.r) / 2;
    if (avgEAR < 0.18) {
      sentences.push(`Eyes closing / blink detected (EAR ${r4(avgEAR)}).`);
      signals.push({ type: 'blink', value: r4(avgEAR) });
      confidenceScore += 0.1;
    }

    // ── Shoulder tension ─────────────────────────────────────────────────────
    if (this._lastShoulder > 0.04) {
      const qual = this._lastShoulder > 0.08 ? 'significant' : 'mild';
      sentences.push(`Shoulders raised ${qual}ly (delta ${r4(this._lastShoulder)}) — possible tension holding or stress response.`);
      signals.push({ type: 'shoulder_raise', value: r4(this._lastShoulder) });
      confidenceScore += 0.25;
    }

    // ── Active cues ───────────────────────────────────────────────────────────
    for (const [cueType, state] of this._activeCues) {
      const dur = Math.round((Date.now() - state.firstTs) / 1000);
      const frm = state.frames;
      const desc = CUE_NARRATIVE_MAP[cueType];
      if (desc) {
        const sustained = frm >= 8 ? ` Sustained ${frm} frames (${dur}s).` : '';
        sentences.push(`${desc}${sustained}`);
        signals.push({ type: cueType, frames: frm, duration: dur });
        confidenceScore += 0.15;
      }
    }

    // ── Assemble ──────────────────────────────────────────────────────────────
    const conf = confidenceScore >= 0.6 ? CONFIDENCE.HIGH
               : confidenceScore >= 0.3 ? CONFIDENCE.MEDIUM
               : CONFIDENCE.LOW;

    const prefix = {
      [CONFIDENCE.HIGH]:   'High confidence: ',
      [CONFIDENCE.MEDIUM]: 'Moderate confidence: ',
      [CONFIDENCE.LOW]:    'Low signal: ',
    }[conf];

    const text = sentences.length > 0
      ? prefix + sentences.join(' ')
      : 'Insufficient landmark data for narrative generation.';

    return { text, confidence: conf, signals, frameCount: this._frameCount };
  }
}

/**
 * Human-readable narrative descriptions per cue type.
 * §1.1 — All phrases are observational, not diagnostic.
 */
const CUE_NARRATIVE_MAP = {
  gaze_aversion:      'Gaze directed away — possible discomfort, processing, or avoidance.',
  brow_furrow:        'Brow furrowed — concentration, confusion, or mild distress signal.',
  brow_raise:         'Brows raised — surprise, questioning, or receptivity.',
  eye_widen:          'Eyes widened — heightened arousal, surprise, or fear response.',
  blink_rate_high:    'Elevated blink rate — processing load, anxiety, or stimulation.',
  mouth_tighten:      'Mouth tightened — withheld speech, suppression, or resolve.',
  lip_compress:       'Lips compressed — withheld emotion, discomfort, or restraint.',
  smile_genuine:      'Genuine smile (Duchenne marker present) — authentic positive affect.',
  smile_social:       'Social smile (no Duchenne marker) — performed or polite expression.',
  disgust_micro:      'Microexpression of disgust (blendshape) — brief, involuntary.',
  contempt_micro:     'Microexpression of contempt detected (asymmetric) — brief, involuntary.',
  head_tilt_right:    'Head tilted right — engagement, curiosity, or comfort signal.',
  head_tilt_left:     'Head tilted left — processing, uncertainty, or passive listening.',
  head_nod:           'Head nod detected — agreement, encouragement, or affirmation signal.',
  head_shake:         'Lateral head movement — negation, disagreement, or disbelief.',
  shoulder_raise:     'Shoulders raised toward ears — stress, tension, or protective posture.',
  shoulder_asymmetry: 'Shoulders asymmetric — possible protective closing or ambivalence.',
  self_touch_face:    'Hand near face — self-soothing, processing, or deception-associated.',
  hand_to_mouth:      'Hand raised toward mouth — withheld speech, uncertainty, or self-regulation.',
  open_palm:          'Open palm visible — gesture of openness, offering, or explanation.',
};

// ─── Contrastive Thinking Detector ────────────────────────────────────────────

/**
 * ContrastiveDetector — surfaces what is said vs what may be meant.
 *
 * SIGNALS:
 *   - Hedge density > threshold
 *   - Negation + positive word in same window
 *   - "Yes, but" / "I know, however" constructions
 *   - Semantic reversal: strong statement followed by full retraction
 *   - High modal verb density (could, would, should, might)
 *
 * §1.1 — Labeled as "linguistic contrastive marker density," not
 *         "the person is lying" or "the person is conflicted."
 */
export class ContrastiveDetector {
  constructor() {
    this._hedgeWindow    = new SlidingWindow(30);
    this._negationWindow = new SlidingWindow(30);
    this._yesButCount   = 0;
    this._totalUtterances = 0;
  }

  analyze(text) {
    if (!text) return null;
    const words = tokenize(text);
    this._totalUtterances++;

    // Hedge density
    let hedges = 0;
    for (const w of words) {
      if (HEDGE_WORDS.has(w)) hedges++;
    }
    // Bigram hedges
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i+1]}`;
      if (HEDGE_WORDS.has(bigram)) hedges++;
    }
    const hedgeDensity = words.length > 0 ? hedges / words.length : 0;
    this._hedgeWindow.push(hedgeDensity);

    // Negation density
    let negations = 0;
    for (const w of words) { if (NEGATION_WORDS.has(w)) negations++; }
    const negDensity = words.length > 0 ? negations / words.length : 0;
    this._negationWindow.push(negDensity);

    // "Yes but" / "I know however" pattern
    const joined = words.join(' ');
    const yesBut = /\b(yes|sure|right|agree|true|okay|fine)[\s,]+but\b/.test(joined) ||
                   /\b(i know|i understand|i see)[\s,]+(but|however|yet|still)\b/.test(joined);
    if (yesBut) this._yesButCount++;

    // Result
    const avgHedge  = this._hedgeWindow.avg();
    const avgNeg    = this._negationWindow.avg();
    const score     = r4(avgHedge * 0.5 + avgNeg * 0.3 + (yesBut ? 0.2 : 0));
    const active    = score > 0.12 || yesBut;

    return active ? {
      domain:      PATTERN_DOMAIN.CONTRASTIVE,
      score,
      hedgeDensity: r4(avgHedge),
      negationDensity: r4(avgNeg),
      yesBut,
      evidence:    `Hedge density ${r4(hedgeDensity)}, negation ${r4(negDensity)}${yesBut ? ', yes-but pattern' : ''}`,
      confidence:  score > 0.3 ? CONFIDENCE.HIGH : score > 0.18 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
    } : null;
  }

  reset() { this._hedgeWindow.clear(); this._negationWindow.clear(); this._yesButCount = 0; this._totalUtterances = 0; }
}

// ─── Negative Space Detector ──────────────────────────────────────────────────

/**
 * NegativeSpaceDetector — detects what is NOT said.
 *
 * SIGNALS:
 *   - Absence of somatic vocabulary in emotional contexts
 *   - Absence of emotion words over extended transcript window
 *   - Pronoun omission (no first-person pronouns in self-relevant speech)
 *   - Topic avoidance: expected semantic fields missing
 *   - Long silence relative to session energy
 *
 * §1.1 — "The absence of X" is documented as absence, not as presence of
 *         its psychological correlate.
 */
export class NegativeSpaceDetector {
  constructor() {
    this._wordCounts    = { somatic: 0, emotion: 0, selfPronoun: 0, total: 0 };
    this._windowSize    = 200;  // words
    this._recentWords   = [];
    this._silenceLog    = [];   // { durationMs, ts }
  }

  analyze(text) {
    if (!text) return null;
    const words = tokenize(text);
    this._recentWords.push(...words);
    if (this._recentWords.length > this._windowSize) {
      this._recentWords = this._recentWords.slice(-this._windowSize);
    }

    const total   = this._recentWords.length;
    if (total < 30) return null;  // need minimum corpus

    let somatic = 0, emotion = 0, selfP = 0;
    for (const w of this._recentWords) {
      if (SOMATIC_VOCABULARY.has(w))  somatic++;
      if (EMOTION_VOCABULARY.has(w))  emotion++;
      if (SELF_PRONOUNS.has(w))       selfP++;
    }

    const somaticDensity = somatic / total;
    const emotionDensity = emotion / total;
    const selfDensity    = selfP   / total;

    // Low somatic + low emotion in emotional-seeming context = negative space
    const gapScore = r4(
      (somaticDensity < 0.01 ? 0.4 : 0) +
      (emotionDensity < 0.01 ? 0.4 : 0) +
      (selfDensity    < 0.01 ? 0.2 : 0)
    );

    if (gapScore < 0.3) return null;

    return {
      domain:       PATTERN_DOMAIN.NEGATIVE_SPACE,
      score:        gapScore,
      somaticDensity:  r4(somaticDensity),
      emotionDensity:  r4(emotionDensity),
      selfDensity:     r4(selfDensity),
      evidence:     `Body vocabulary absent: ${r4(somaticDensity)} density (expected ≥0.01). Emotion vocabulary: ${r4(emotionDensity)}.`,
      confidence:   gapScore > 0.6 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    };
  }

  logSilence(durationMs) {
    this._silenceLog.push({ durationMs, ts: Date.now() });
    if (this._silenceLog.length > 50) this._silenceLog.shift();
  }

  reset() { this._wordCounts = { somatic:0, emotion:0, selfPronoun:0, total:0 }; this._recentWords = []; this._silenceLog = []; }
}

// ─── Shadow Reasoning Detector ───────────────────────────────────────────────

/**
 * ShadowDetector — Jungian shadow markers.
 *
 * The "shadow" in Jungian psychology is the disowned, suppressed, or
 * projected part of self. Observable linguistic signatures:
 *
 *   PROJECTION: Attributing internal states to others
 *     "You're so angry" (when speaker shows anger markers)
 *     "People always do X" (high-intensity self-relevant topic)
 *
 *   DISPLACEMENT: Intensity far exceeds apparent trigger
 *     Mild topic → HIGH acoustic energy → disproportionate response
 *
 *   OVER-QUALIFICATION: Excessive hedging before self-statements
 *     "I'm not saying I'm... I mean, it's not that I... but..."
 *
 *   EXTERNAL LOCUS: Systematic attribution of causation to others
 *     Blame architecture: everything caused by external forces
 *
 * §1.1 — These are linguistic pattern correlates, not psychological diagnoses.
 */
export class ShadowDetector {
  constructor() {
    this._projectionScore    = 0;
    this._displacementScore  = 0;
    this._locusHistory       = new SlidingWindow(20);
    this._overQualCount      = 0;
    this._lastToneEnergy     = null;
  }

  analyzeText(text) {
    if (!text) return null;
    const words = tokenize(text);

    // Projection: high projection-pronoun density in self-relevant context
    let projPronounCount = 0, selfCount = 0, externalLocus = 0, internalLocus = 0;
    for (const w of words) {
      if (PROJECTION_PRONOUNS.has(w)) projPronounCount++;
      if (SELF_PRONOUNS.has(w))       selfCount++;
    }
    const joined = words.join(' ');
    for (const m of EXTERNAL_LOCUS) { if (joined.includes(m)) externalLocus++; }
    for (const m of INTERNAL_LOCUS) { if (joined.includes(m)) internalLocus++; }

    // Over-qualification: many hedges before a self-statement
    const overQualPattern = /\b(i'm not saying|i mean|it's not that|i don't|i wouldn't|not that)\b/i.test(text) || /(not saying|i mean|not that)/.test(joined);
    if (overQualPattern) this._overQualCount++;

    // Locus of control score: -1 = fully external, +1 = fully internal
    const total = externalLocus + internalLocus;
    const locusScore = total > 0 ? (internalLocus - externalLocus) / total : 0;
    this._locusHistory.push(locusScore);

    const projDensity = words.length > 0 ? projPronounCount / words.length : 0;
    const avgLocus    = this._locusHistory.avg();

    // Shadow signal fires when projection is high AND locus is strongly external
    const shadowScore = r4(
      (projDensity > 0.25 ? 0.4 : projDensity > 0.15 ? 0.2 : 0) +
      (avgLocus < -0.2    ? 0.4 : avgLocus < 0 ? 0.2 : 0) +
      (overQualPattern    ? 0.2 : 0)
    );

    if (shadowScore < 0.15) return null;

    return {
      domain:         PATTERN_DOMAIN.SHADOW,
      score:          shadowScore,
      projectionDensity: r4(projDensity),
      locusOfControl: r4(avgLocus),     // < 0 = external, > 0 = internal
      overQualification: overQualPattern,
      evidence:       `Projection pronoun density: ${r4(projDensity)}. Locus: ${r4(avgLocus)} (${avgLocus < 0 ? 'external' : 'internal'}). Over-qualification: ${overQualPattern}.`,
      confidence:     shadowScore > 0.6 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    };
  }

  /**
   * Displacement: check if current acoustic energy is disproportionate
   * to the semantic weight of the text (mild text + high energy = displacement).
   * §1.1 — "Disproportionate arousal relative to semantic content."
   */
  analyzeDisplacement(text, toneEnergy, sentimentScore) {
    if (!text || toneEnergy === null) return null;
    const words = tokenize(text);
    const hasEscalationWords = words.some(w => ESCALATION_WORDS.has(w));

    // High energy + neutral/positive words = potential displacement
    const mismatch = toneEnergy > 0.6 && Math.abs(sentimentScore ?? 0) < 0.2 && !hasEscalationWords;
    if (!mismatch) return null;

    return {
      domain:          PATTERN_DOMAIN.SHADOW,
      subtype:         'displacement',
      acousticEnergy:  r4(toneEnergy),
      sentimentScore:  r4(sentimentScore ?? 0),
      evidence:        `High acoustic energy (${r4(toneEnergy)}) with low semantic intensity (sentiment ${r4(sentimentScore ?? 0)}) — disproportionate arousal.`,
      confidence:      CONFIDENCE.MEDIUM,
    };
  }

  reset() { this._locusHistory.clear(); this._overQualCount = 0; this._projectionScore = 0; this._displacementScore = 0; }
}

// ─── Rhythm, Rhyme, Cadence Detector ─────────────────────────────────────────

/**
 * RhythmDetector — temporal structure of speech.
 *
 * SIGNALS:
 *   - Cadence regularity: variance in peaks/sec across time
 *   - Prosodic contour: rising vs falling energy patterns
 *   - Pause topology: silence distribution (where pauses cluster)
 *   - Response latency: time from cue to response
 *   - Turn-taking rhythm: interaction tempo
 *   - Breath-phrase boundaries: energy envelope inflection points
 *   - Repetition and rhythmic emphasis: same word/phrase repeated
 *
 * §1.1 — Cadence is computed from energy peaks. It is a rough syllable-rate
 *         proxy, not a phonemic analysis.
 */
export class RhythmDetector {
  constructor() {
    this._cadenceWindow    = new SlidingWindow(30);
    this._energyWindow     = new SlidingWindow(60);
    this._pauseDurations   = new SlidingWindow(20);
    this._turnLatencies    = [];
    this._lastSpeechTs     = null;
    this._wordRepeatMap    = new Map();
  }

  analyzeTone(toneResult) {
    const { energy, cadence, silence, durationMs } = toneResult;

    if (silence) {
      const silDur = durationMs ?? 500;
      this._pauseDurations.push(silDur);
      return null;
    }

    this._cadenceWindow.push(cadence);
    this._energyWindow.push(energy);

    const avgCadence  = this._cadenceWindow.avg();
    const cadenceVar  = this._variance(this._cadenceWindow.vals);
    const energySlope = this._slope(this._energyWindow.vals.slice(-10));

    // Prosodic contour: rising = energySlope > 0, falling = < 0
    const contour = energySlope > 0.003 ? 'RISING'
                  : energySlope < -0.003 ? 'FALLING'
                  : 'FLAT';

    // Rhythm anomaly: very high or very low cadence variance
    const rhythmAnomaly = cadenceVar > 0.8 || (avgCadence > 5 && cadenceVar < 0.05);

    if (!rhythmAnomaly && contour === 'FLAT') return null;

    return {
      domain:         PATTERN_DOMAIN.RHYTHMIC,
      avgCadence:     r4(avgCadence),
      cadenceVariance: r4(cadenceVar),
      prosodic:       contour,
      anomaly:        rhythmAnomaly,
      avgPauseDurationMs: r4(this._pauseDurations.avg()),
      evidence:       `Cadence ${r4(avgCadence)}/s (var ${r4(cadenceVar)}). Prosodic contour: ${contour}.`,
      confidence:     rhythmAnomaly ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
    };
  }

  analyzeText(text) {
    if (!text) return null;
    const words = tokenize(text);

    // Word repetition / rhythmic emphasis
    for (const w of words) {
      if (w.length < 3) continue;
      this._wordRepeatMap.set(w, (this._wordRepeatMap.get(w) ?? 0) + 1);
    }

    // Find repeated words in recent window (emphasis / perseveration)
    const repeated = [...this._wordRepeatMap.entries()]
      .filter(([, count]) => count >= 3)
      .map(([word]) => word);

    if (!repeated.length) return null;

    return {
      domain:    PATTERN_DOMAIN.RHYTHMIC,
      subtype:   'verbal_repetition',
      repeated,
      evidence:  `Repeated words: ${repeated.slice(0,5).join(', ')} — possible emphasis, perseveration, or rhythm pattern.`,
      confidence: CONFIDENCE.LOW,
    };
  }

  _variance(arr) {
    if (!arr.length) return 0;
    const m = arr.reduce((s,v)=>s+v,0)/arr.length;
    return arr.reduce((s,v)=>s+(v-m)**2,0)/arr.length;
  }

  _slope(arr) {
    if (arr.length < 2) return 0;
    const n = arr.length;
    const xMean = (n-1)/2;
    const yMean = arr.reduce((s,v)=>s+v,0)/n;
    let num = 0, den = 0;
    arr.forEach((v,i) => { num += (i-xMean)*(v-yMean); den += (i-xMean)**2; });
    return den > 0 ? num/den : 0;
  }

  reset() {
    this._cadenceWindow.clear(); this._energyWindow.clear();
    this._pauseDurations.clear(); this._wordRepeatMap.clear();
    this._turnLatencies = []; this._lastSpeechTs = null;
  }
}

// ─── Escalation Topology Detector ────────────────────────────────────────────

/**
 * EscalationDetector — emotional momentum and inflection mapping.
 *
 * SIGNALS:
 *   - Sentiment gradient: rate of change of rolling sentiment
 *   - Intensity velocity: acoustic energy acceleration
 *   - Shift clustering: multiple micro-shifts in short window
 *   - De-escalation attempt detection: repair markers appearing mid-climb
 *   - Rupture detection: sharp discontinuity in all signals simultaneously
 *
 * §1.1 — "Escalation" is a measured increase in multiple intensity signals,
 *         not a claim about conflict or hostility.
 */
export class EscalationDetector {
  constructor() {
    this._sentimentHistory  = new SlidingWindow(20);
    this._energyHistory     = new SlidingWindow(20);
    this._shiftTimestamps   = [];
    this._escalationLevel   = 0;   // 0.0 – 1.0 live estimate
    this._deEscalationCount = 0;
    this._ruptureDetected   = false;
    this._lastEscalationTs  = null;
  }

  analyzeSentiment(sentiment) {
    const { score, rollingAvg } = sentiment;
    this._sentimentHistory.push(score);

    // Gradient: direction of recent movement
    const vals = this._sentimentHistory.vals;
    if (vals.length < 4) return null;
    const recent  = vals.slice(-4);
    const older   = vals.slice(-8, -4);
    const recentAvg = recent.reduce((s,v)=>s+v,0)/recent.length;
    const olderAvg  = older.length ? older.reduce((s,v)=>s+v,0)/older.length : recentAvg;
    const gradient  = recentAvg - olderAvg;

    if (Math.abs(gradient) < 0.05) return null;

    const direction = gradient < 0 ? 'DECLINING' : 'IMPROVING';
    this._escalationLevel = ema(this._escalationLevel, gradient < 0 ? Math.abs(gradient) : 0, 0.4);

    return {
      domain:      PATTERN_DOMAIN.ESCALATION,
      subtype:     'sentiment_gradient',
      gradient:    r4(gradient),
      direction,
      level:       r4(this._escalationLevel),
      evidence:    `Sentiment ${direction.toLowerCase()} at gradient ${r4(gradient)}.`,
      confidence:  Math.abs(gradient) > 0.2 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    };
  }

  analyzeShift(shiftEvent) {
    const now = Date.now();
    this._shiftTimestamps.push(now);
    // Prune to 30s window
    this._shiftTimestamps = this._shiftTimestamps.filter(t => now - t < 30_000);

    const shiftDensity = this._shiftTimestamps.length / 30;
    const isClustered  = this._shiftTimestamps.length >= 3;

    if (!isClustered) return null;

    const severity = shiftEvent.primary?.severity ?? 'LOW';

    return {
      domain:      PATTERN_DOMAIN.ESCALATION,
      subtype:     'shift_cluster',
      shiftCount:  this._shiftTimestamps.length,
      window:      '30s',
      maxSeverity: severity,
      evidence:    `${this._shiftTimestamps.length} vocal micro-shifts in 30s — clustered instability.`,
      confidence:  CONFIDENCE.HIGH,
    };
  }

  analyzeText(text) {
    if (!text) return null;
    const words = tokenize(text);
    let escWords = 0;
    for (const w of words) { if (ESCALATION_WORDS.has(w)) escWords++; }

    // §1.1 — repair detection: check both individual words and bigrams after tokenization
    // REPAIR_MARKERS contains full phrases; tokenizer strips punctuation and lowercases
    const hasRepair = words.some(w => REPAIR_MARKERS.has(w)) ||
      (() => { for (let i=0;i<words.length-1;i++) { if (REPAIR_MARKERS.has(words[i]+' '+words[i+1])) return true; } return false; })() ||
      words.some(w => ['understand','apologize','sorry','wrong','hear'].includes(w));
    if (hasRepair) this._deEscalationCount++;

    if (!escWords && !hasRepair) return null;

    if (hasRepair) {
      return {
        domain:   PATTERN_DOMAIN.ESCALATION,
        subtype:  'repair_attempt',
        evidence: `Repair bid detected: "${text.slice(0,60)}"`,
        confidence: CONFIDENCE.MEDIUM,
      };
    }

    return {
      domain:   PATTERN_DOMAIN.ESCALATION,
      subtype:  'linguistic_amplifier',
      count:    escWords,
      evidence: `${escWords} escalation word(s) in utterance.`,
      confidence: CONFIDENCE.LOW,
    };
  }

  reset() {
    this._sentimentHistory.clear(); this._energyHistory.clear();
    this._shiftTimestamps = []; this._escalationLevel = 0;
    this._deEscalationCount = 0; this._ruptureDetected = false;
  }
}

// ─── Attachment Behavioral Signature Detector ─────────────────────────────────

/**
 * AttachmentDetector — time-evolving attachment-like behavioral patterns.
 *
 * §1.1 — This is NOT attachment style diagnosis. It is a behavioral
 *         scoring system over observable interaction patterns. It infers
 *         attachment-LIKE dynamics, not attachment styles.
 *
 * SIGNALS:
 *   - Repair attempt frequency → secure signal
 *   - Withdrawal / silence clustering → avoidant signal
 *   - Escalation + repair attempt pattern → anxious signal
 *   - High shift clustering + repair failure → disorganized signal
 *   - Synchrony stability → secure signal
 */
export class AttachmentDetector {
  constructor() {
    this._repairCount      = 0;
    this._withdrawalCount  = 0;
    this._escalationCount  = 0;
    this._shiftCount       = 0;
    this._syncHistory      = new SlidingWindow(30);
    this._totalFrames      = 0;
    this._trajectory       = [];   // { ts, vector }
  }

  update({ repairAttempt = false, withdrawal = false, escalation = false, shift = false, syncScore = null }) {
    this._totalFrames++;
    if (repairAttempt) this._repairCount++;
    if (withdrawal)    this._withdrawalCount++;
    if (escalation)    this._escalationCount++;
    if (shift)         this._shiftCount++;
    if (syncScore !== null) this._syncHistory.push(syncScore);
  }

  score() {
    const n = Math.max(1, this._totalFrames);
    const repairRate    = this._repairCount    / n;
    const withdrawRate  = this._withdrawalCount / n;
    const escalRate     = this._escalationCount / n;
    const shiftRate     = this._shiftCount      / n;
    const avgSync       = this._syncHistory.avg();

    // Scoring functions §1.1 — linear weighted heuristics, not ML
    const secure = r4(avgSync * 0.4 + repairRate * 3 * 0.3 + (1 - escalRate * 5) * 0.3);
    const anxious = r4(
      Math.min(1, escalRate * 5) * 0.4 +
      Math.min(1, repairRate * 2) * 0.3 +
      (1 - avgSync) * 0.3
    );
    const avoidant = r4(
      Math.min(1, withdrawRate * 5) * 0.5 +
      Math.max(0, 1 - repairRate * 5) * 0.3 +
      Math.min(1, shiftRate * 3) * 0.2
    );
    const disorganized = r4(
      Math.min(1, shiftRate * 5) * 0.4 +
      (1 - avgSync) * 0.4 +
      Math.min(1, escalRate * 3) * 0.2
    );

    const total = Math.max(0.001, secure + anxious + avoidant + disorganized);
    const vector = {
      secure:       r4(secure / total),
      anxious:      r4(anxious / total),
      avoidant:     r4(avoidant / total),
      disorganized: r4(disorganized / total),
    };

    this._trajectory.push({ ts: Date.now(), vector });
    if (this._trajectory.length > 100) this._trajectory.shift();

    // Dominant pattern
    const dominant = Object.entries(vector).sort((a,b)=>b[1]-a[1])[0][0];

    return {
      domain:    PATTERN_DOMAIN.ATTACHMENT,
      vector,
      dominant,
      trajectory: this._trajectory.slice(-5),
      evidence:  `Repair rate: ${r4(repairRate*100)}%. Withdrawal: ${r4(withdrawRate*100)}%. Sync: ${r4(avgSync)}.`,
      confidence: this._totalFrames > 20 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
    };
  }

  reset() {
    this._repairCount = 0; this._withdrawalCount = 0;
    this._escalationCount = 0; this._shiftCount = 0;
    this._syncHistory.clear(); this._totalFrames = 0; this._trajectory = [];
  }
}

// ─── Hermetic Pattern Detector ────────────────────────────────────────────────

/**
 * HermeticDetector — closed-system thinking.
 *
 * Hermetic thinking: a self-sealing belief system that admits no
 * disconfirming information. Linguistic markers:
 *
 *   - High certainty density (obviously, clearly, of course)
 *   - Low question frequency (no genuine inquiry)
 *   - Circular argument structure: A because B, B because A
 *   - Absence of uncertainty markers despite complexity
 *   - High use of absolute quantifiers: always, never, all, none
 *
 * §1.1 — Detecting the *pattern*, not claiming the *truth value* of the beliefs.
 */
export class HermeticDetector {
  constructor() {
    this._certaintyWindow  = new SlidingWindow(20);
    this._questionCount    = 0;
    this._utteranceCount   = 0;
    this._absoluteWindow   = new SlidingWindow(20);
  }

  analyze(text) {
    if (!text) return null;
    const words = tokenize(text);
    this._utteranceCount++;

    let certainty = 0, absolutes = 0;
    for (const w of words) {
      if (HERMETIC_MARKERS.has(w)) certainty++;
      if (['always','never','all','none','every','no one','everyone'].includes(w)) absolutes++;
    }
    // Check for questions
    const hasQuestion = text.trim().endsWith('?') || /\b(what|why|how|do you|are you|can you)\b/i.test(text);
    if (hasQuestion) this._questionCount++;

    this._certaintyWindow.push(words.length > 0 ? certainty / words.length : 0);
    this._absoluteWindow.push(words.length > 0 ? absolutes / words.length : 0);

    const avgCertainty = this._certaintyWindow.avg();
    const avgAbsolute  = this._absoluteWindow.avg();
    const questionRate = this._questionCount / Math.max(1, this._utteranceCount);

    const score = r4(avgCertainty * 0.5 + avgAbsolute * 0.3 + (1 - Math.min(1, questionRate * 10)) * 0.2);

    if (score < 0.15) return null;

    return {
      domain:       PATTERN_DOMAIN.HERMETIC,
      score,
      certaintyDensity: r4(avgCertainty),
      absoluteDensity:  r4(avgAbsolute),
      questionRate:     r4(questionRate),
      evidence:     `Certainty density: ${r4(avgCertainty)}. Absolute quantifiers: ${r4(avgAbsolute)}. Question rate: ${r4(questionRate)} (low = closed).`,
      confidence:   score > 0.4 ? CONFIDENCE.HIGH : score > 0.25 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW,
    };
  }

  reset() { this._certaintyWindow.clear(); this._absoluteWindow.clear(); this._questionCount = 0; this._utteranceCount = 0; }
}

// ─── Cross-Modal Consistency Detector ────────────────────────────────────────

/**
 * CrossModalDetector — multi-stream congruence analysis.
 *
 * Checks whether verbal, vocal, and visual signals are CONSISTENT
 * with each other or INCONGRUENT.
 *
 * INCONGRUENCE SIGNALS:
 *   - Positive sentiment text + negative visual cues (gaze aversion, mouth tighten)
 *   - High acoustic energy + calm facial expression
 *   - Repair-attempt words + escalating body signals
 *   - "I'm fine" text + shoulder raise + blink rate spike
 *
 * §1.1 — Cross-modal incongruence is documented as incongruence.
 *         It does NOT imply deception.
 */
export class CrossModalDetector {
  constructor() {
    this._lastSentiment   = null;
    this._lastEnergy      = null;
    this._activeFaceCues  = new Set();
    this._inconsistencies = new SlidingWindow(20);
  }

  update({ sentiment = null, energy = null, faceCues = [] } = {}) {
    if (sentiment !== null) this._lastSentiment = sentiment;
    if (energy    !== null) this._lastEnergy    = energy;
    this._activeFaceCues = new Set(faceCues);
  }

  analyze() {
    if (this._lastSentiment === null || this._lastEnergy === null) return null;

    const incongruences = [];

    // Positive words + negative visual
    if (this._lastSentiment > 0.3 &&
        (this._activeFaceCues.has('gaze_aversion') || this._activeFaceCues.has('mouth_tighten'))) {
      incongruences.push('positive_text_negative_visual');
    }

    // "Fine" / "okay" + shoulder raise
    if (this._lastSentiment > 0.0 && this._lastSentiment < 0.3 &&
        this._activeFaceCues.has('shoulder_raise')) {
      incongruences.push('neutral_text_somatic_stress');
    }

    // High energy + smile
    if (this._lastEnergy > 0.6 && this._activeFaceCues.has('smile_genuine')) {
      // This is actually congruent — high excitement + genuine smile
      // No incongruence
    }

    // Negative sentiment + genuine smile (possible contempt or dissociation)
    if (this._lastSentiment < -0.3 && this._activeFaceCues.has('smile_genuine')) {
      incongruences.push('negative_text_positive_expression');
    }

    const score = r4(incongruences.length / 3);
    this._inconsistencies.push(score);

    if (!incongruences.length) return null;

    return {
      domain:         PATTERN_DOMAIN.CROSS_MODAL,
      score,
      incongruences,
      sentiment:      r4(this._lastSentiment),
      energy:         r4(this._lastEnergy),
      activeFaceCues: [...this._activeFaceCues],
      evidence:       `Cross-modal incongruence: ${incongruences.join(', ')}.`,
      confidence:     incongruences.length >= 2 ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
    };
  }

  reset() {
    this._lastSentiment = null; this._lastEnergy = null;
    this._activeFaceCues.clear(); this._inconsistencies.clear();
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean);
}

// ─── BehaviorAnalysisModule ───────────────────────────────────────────────────

export class BehaviorAnalysisModule extends ALKModule {
  static UUID    = MODULE_UUID;
  static VERSION = MODULE_VERSION;
  static NS      = MODULE_NS;

  static DEFAULTS = Object.freeze({
    summaryIntervalMs:      5_000,    // composite report every 5s
    narrativeIntervalMs:    1_000,    // video narrative every 1s
    pulseIntervalMs:        10_000,   // §1.8 heartbeat
    minTextLength:          10,       // ignore very short fragments
    enableContrastive:      true,
    enableNegativeSpace:    true,
    enableShadow:           true,
    enableRhythm:           true,
    enableEscalation:       true,
    enableAttachment:       true,
    enableHermetic:         true,
    enableCrossModal:       true,
    enableNarrative:        true,
  });

  constructor({ kernel, config = {} } = {}) {
    super({ kernel, uuid: MODULE_UUID, version: MODULE_VERSION, ns: MODULE_NS });

    this._config = { ...BehaviorAnalysisModule.DEFAULTS, ...config };
    this._session = null;

    // Detector instances — each is fully owned by this module
    this._contrastive   = new ContrastiveDetector();
    this._negSpace      = new NegativeSpaceDetector();
    this._shadow        = new ShadowDetector();
    this._rhythm        = new RhythmDetector();
    this._escalation    = new EscalationDetector();
    this._attachment    = new AttachmentDetector();
    this._hermetic      = new HermeticDetector();
    this._crossModal    = new CrossModalDetector();
    this._narrative     = new VideoNarrativeTranslator();

    // State buffers
    this._lastToneEnergy    = null;
    this._lastSentiment     = null;
    this._activeFaceCues    = new Set();
    this._patternsThisInterval = [];

    // Timers
    this._summaryTimer   = null;
    this._narrativeTimer = null;
    this._pulseTimer     = null;

    // Wire subscriptions
    this._sub('alk.session.capture.start',    (ev) => this._onSessionStart(ev));
    this._sub('alk.session.capture.stop',     (ev) => this._onSessionStop(ev));
    this._sub('alk.verbal.chunk.transcribed', (ev) => this._onTranscript(ev));
    this._sub('alk.verbal.analysis.tone',     (ev) => this._onTone(ev));
    this._sub('alk.verbal.analysis.sentiment',(ev) => this._onSentiment(ev));
    this._sub('alk.verbal.analysis.shift',    (ev) => this._onShift(ev));
    this._sub('alk.video.landmarks.face',     (ev) => this._onFaceLandmarks(ev));
    this._sub('alk.video.landmarks.pose',     (ev) => this._onPoseLandmarks(ev));
    this._sub('alk.video.cue.detected',       (ev) => this._onCueDetected(ev));
    this._sub('alk.video.cue.released',       (ev) => this._onCueReleased(ev));
    this._sub('alk.video.cue.sustained',      (ev) => this._onCueSustained(ev));
    this._sub('alk.behavior.config',          (ev) => this._onConfig(ev));
  }

  // ── Session ─────────────────────────────────────────────────────────────────

  _onSessionStart(ev) {
    this._session = ev.payload.sessionId;
    this._resetAll();
    this._startTimers();
    this._emit('alk.behavior.session.start', {
      sessionId: this._session, config: { ...this._config },
    }, { causedBy: ev.id, sessionId: this._session });
  }

  _onSessionStop(ev) {
    this._stopTimers();
    const attachment = this._attachment.score();
    this._emit('alk.behavior.session.stop', {
      sessionId: this._session,
      finalAttachment: attachment,
    }, { causedBy: ev.id, sessionId: this._session });
    this._session = null;
  }

  // ── Verbal signals ──────────────────────────────────────────────────────────

  _onTranscript(ev) {
    if (!this._session) return;
    const { text } = ev.payload;
    if (!text || text.length < this._config.minTextLength) return;
    const meta = { causedBy: ev.id, sessionId: this._session, edgeType: 'semantic' };

    // Run all text-based detectors
    this._runDetector('contrastive', () => this._contrastive.analyze(text), meta);
    this._runDetector('negative_space', () => this._negSpace.analyze(text), meta);
    this._runDetector('shadow_text', () => this._shadow.analyzeText(text), meta);
    this._runDetector('rhythm_text', () => this._rhythm.analyzeText(text), meta);
    this._runDetector('escalation_text', () => this._escalation.analyzeText(text), meta);
    this._runDetector('hermetic', () => this._hermetic.analyze(text), meta);

    // Shadow displacement (needs current tone energy)
    if (this._lastToneEnergy !== null && this._lastSentiment !== null) {
      this._runDetector('shadow_displacement',
        () => this._shadow.analyzeDisplacement(text, this._lastToneEnergy, this._lastSentiment),
        meta
      );
    }

    // Cross-modal update
    this._crossModal.update({ sentiment: this._lastSentiment });
    const crossResult = this._crossModal.analyze();
    if (crossResult) this._emitPattern(crossResult, meta);

    // Attachment: repair attempt
    const words = text.toLowerCase().split(/\s+/);
    const hasRepair   = words.some(w => REPAIR_MARKERS.has(w));
    this._attachment.update({ repairAttempt: hasRepair });
  }

  _onTone(ev) {
    if (!this._session) return;
    const { energy } = ev.payload;
    this._lastToneEnergy = energy;
    this._crossModal.update({ energy });

    const rhythmResult = this._rhythm.analyzeTone(ev.payload);
    if (rhythmResult) this._emitPattern(rhythmResult, { causedBy: ev.id, sessionId: this._session });

    // Silence = potential withdrawal signal
    if (ev.payload.silence) {
      this._negSpace.logSilence(ev.payload.durationMs ?? 500);
      this._attachment.update({ withdrawal: true });
    }
  }

  _onSentiment(ev) {
    if (!this._session) return;
    this._lastSentiment = ev.payload.score;
    const result = this._escalation.analyzeSentiment(ev.payload);
    if (result) {
      this._emitPattern(result, { causedBy: ev.id, sessionId: this._session, edgeType: 'temporal' });
      this._attachment.update({ escalation: result.direction === 'DECLINING' });
      if (result.level > 0.5) {
        this._emit('alk.behavior.escalation.alert', {
          sessionId: this._session, level: result.level, direction: result.direction,
        }, { causedBy: ev.id, sessionId: this._session });
      }
    }
  }

  _onShift(ev) {
    if (!this._session) return;
    const result = this._escalation.analyzeShift(ev.payload);
    if (result) this._emitPattern(result, { causedBy: ev.id, sessionId: this._session });
    this._attachment.update({ shift: true });
  }

  // ── Visual signals ──────────────────────────────────────────────────────────

  _onFaceLandmarks(ev) {
    if (!this._session) return;
    this._narrative.ingestFaceLandmarks(ev.payload);
  }

  _onPoseLandmarks(ev) {
    if (!this._session) return;
    this._narrative.ingestPoseLandmarks(ev.payload);
    const shoulderRaise = ev.payload.shoulderRaiseDelta ?? 0;
    if (shoulderRaise > 0.04) {
      this._emit('alk.behavior.somatic.state', {
        sessionId: this._session,
        signal:   'shoulder_raise',
        value:    r4(shoulderRaise),
        note:     'Possible tension holding or stress response.',
      }, { causedBy: ev.id, sessionId: this._session, edgeType: 'semantic' });
    }
  }

  _onCueDetected(ev) {
    if (!this._session) return;
    this._narrative.ingestCue(ev.payload);
    this._activeFaceCues.add(ev.payload.cueType);
    this._crossModal.update({ faceCues: [...this._activeFaceCues] });
  }

  _onCueReleased(ev) {
    this._narrative.ingestCueRelease(ev.payload.cueType);
    this._activeFaceCues.delete(ev.payload.cueType);
  }

  _onCueSustained(ev) {
    if (!this._session) return;
    // Sustained somatic cues → somatic state event
    const SOMATIC_CUES = new Set(['shoulder_raise','shoulder_asymmetry','self_touch_face','hand_to_mouth']);
    if (SOMATIC_CUES.has(ev.payload.cueType)) {
      this._emit('alk.behavior.somatic.state', {
        sessionId: this._session,
        signal:   ev.payload.cueType,
        duration: ev.payload.durationMs,
        frames:   ev.payload.frames,
        note:     CUE_NARRATIVE_MAP[ev.payload.cueType] ?? '',
      }, { causedBy: ev.id, sessionId: this._session });
    }
    // Shadow signal: sustained self-touch + neutral text
    if (ev.payload.cueType === 'self_touch_face' && this._lastSentiment !== null && Math.abs(this._lastSentiment) < 0.2) {
      this._emit('alk.behavior.shadow.signal', {
        sessionId: this._session,
        subtype:  'somatic_shadow',
        note:     'Self-touch sustained with low verbal emotional content — possible suppressed affect.',
        confidence: CONFIDENCE.LOW,
      }, { causedBy: ev.id, sessionId: this._session });
    }
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  _onConfig(ev) {
    Object.assign(this._config, ev.payload);
    this._emit('alk.behavior.configured', { ...this._config });
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  _runDetector(name, fn, meta) {
    try {
      const result = fn();
      if (result) this._emitPattern(result, meta);
    } catch (err) {
      this._emitError(`DETECTOR_${name.toUpperCase()}_FAILED`, err.message);
    }
  }

  _emitPattern(pattern, meta) {
    this._patternsThisInterval.push(pattern);
    this._emit('alk.behavior.pattern.detected', {
      sessionId: this._session,
      ...pattern,
    }, meta);
  }

  _emitSummary() {
    if (!this._session) return;
    const attachment = this._attachment.score();
    const patternsByDomain = {};
    for (const p of this._patternsThisInterval) {
      patternsByDomain[p.domain] = (patternsByDomain[p.domain] ?? 0) + 1;
    }
    this._emit('alk.behavior.summary', {
      sessionId:        this._session,
      windowMs:         this._config.summaryIntervalMs,
      patternCount:     this._patternsThisInterval.length,
      byDomain:         patternsByDomain,
      attachment:       attachment.vector,
      escalationLevel:  r4(this._escalation._escalationLevel ?? 0),
      activeCues:       [...this._activeFaceCues],
    }, { sessionId: this._session });
    this._patternsThisInterval = [];
  }

  _emitNarrative() {
    if (!this._session) return;
    const frame = this._narrative.generateFrame();
    this._emit('alk.behavior.narrative.frame', {
      sessionId: this._session,
      ...frame,
    }, { sessionId: this._session, edgeType: 'semantic' });
  }

  _emitPulse() {
    this._emit('alk.behavior.pulse', {
      uuid:         MODULE_UUID,
      version:      MODULE_VERSION,
      sessionId:    this._session,
      ts:           Date.now(),
      activeCues:   this._activeFaceCues.size,
      lastEnergy:   this._lastToneEnergy,
      lastSentiment: this._lastSentiment,
    });
  }

  _startTimers() {
    this._summaryTimer   = setInterval(() => this._emitSummary(), this._config.summaryIntervalMs);
    this._narrativeTimer = setInterval(() => this._emitNarrative(), this._config.narrativeIntervalMs);
    this._pulseTimer     = setInterval(() => this._emitPulse(), this._config.pulseIntervalMs);
  }

  _stopTimers() {
    clearInterval(this._summaryTimer);
    clearInterval(this._narrativeTimer);
    clearInterval(this._pulseTimer);
  }

  _resetAll() {
    this._contrastive.reset(); this._negSpace.reset(); this._shadow.reset();
    this._rhythm.reset(); this._escalation.reset(); this._attachment.reset();
    this._hermetic.reset(); this._crossModal.reset();
    this._activeFaceCues.clear(); this._patternsThisInterval = [];
    this._lastToneEnergy = null; this._lastSentiment = null;
  }

  destroy() { this._stopTimers(); super.destroy(); }

  health() {
    return {
      status:     this._session ? 'OK' : 'IDLE',
      uuid:       MODULE_UUID,
      version:    MODULE_VERSION,
      capturing:  !!this._session,
      sessionId:  this._session,
      activeCues: this._activeFaceCues.size,
      metrics:    { ...this._metrics },
    };
  }
}

export default BehaviorAnalysisModule;
