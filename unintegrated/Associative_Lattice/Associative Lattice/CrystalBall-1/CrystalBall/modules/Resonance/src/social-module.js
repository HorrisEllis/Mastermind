/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK SOCIAL MODULE  ·  social-module.js  ·  v1.0.0                    ║
 * ║  UUID: alk-mod-social-0000-2600-0000-000000000001                      ║
 * ║  HOOK: alk.module.social:social:00001                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signals. Not diagnoses. Not judgments.
 * §1.2 — All failures loud and specific. Nothing fails quietly.
 * §5.1 — UUID, hook, event bus registration on every detector.
 * §5.5 — No external runtime dependencies. Fully browser-native.
 * §5.6 — Same structural pattern across all abstraction layers.
 * §5.7 — Zero direct module calls. All I/O via kernel events only.
 * §5.8 — Composable detectors, not configured monolith.
 * §7.0 — Event ontology separation: observational vs authoritative.
 * §K1  — Events are immutable after construction.
 * §K6  — No module may call another module directly.
 * §K7  — All errors surface as 'alk.kernel.error' events.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Social Module is the Resonance Engine and ASE (Authorship Signature
 * Engine) ported to the browser as a first-class ALK kernel module.
 *
 * It is NOT a similarity matcher. It is a phase-detection system for
 * meaning construction — tracking how two evolving expression systems
 * interact over time.
 *
 * Three layers:
 *   1. SIGNAL EXTRACTION — converts text/behavior into a SignalVector
 *   2. ASE (Authorship Signature Engine) — builds a stable evolving
 *      fingerprint of a user's expression identity, tracks drift
 *   3. RESONANCE ENGINE — computes how two signatures/trajectories relate
 *      using structural, oscillation, and temporal scoring
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT CONTRACT — INBOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  alk.social.signal.ingest
 *    { userId, text, [forceLLM], [meta] }
 *    → Extracts a SignalVector from text, updates ASE, emits results.
 *
 *  alk.social.resonance.query
 *    { userA, userB, [window] }
 *    → Computes resonance between two users, emits result.
 *
 *  alk.social.ase.get
 *    { userId }
 *    → Emits current AuthorshipSignature for userId.
 *
 *  alk.social.feed.generate
 *    { viewerId, [limit], [excludeUserIds], [preset] }
 *    → Scores all known users against viewer, emits ranked feed.
 *
 *  alk.social.user.list
 *    {}
 *    → Emits list of known userIds.
 *
 *  alk.social.user.clear
 *    { userId }
 *    → Clears all data for a user.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT CONTRACT — OUTBOUND
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  alk.social.signal.extracted
 *    { userId, signal, signature, trusted, sampleCount }
 *
 *  alk.social.resonance.result
 *    { userA, userB, result }
 *
 *  alk.social.ase.signature
 *    { userId, signature }
 *
 *  alk.social.feed.result
 *    { viewerId, items, totalCandidates, generatedAt }
 *
 *  alk.social.user.list
 *    { userIds }
 *
 *  alk.social.drift.detected
 *    { userId, drift }  — emitted when ASE detects identity shift
 *
 *  alk.social.error
 *    { source, message, payload }
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OPTIONAL: BRIDGE MODE (Resonance Server)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * If config.serverUrl is provided, the module will proxy requests to the
 * Resonance server API instead of computing locally. Falls back to local
 * heuristics on network failure.
 *
 */

// ─── Module Identity ──────────────────────────────────────────────────────────

const MODULE_UUID = 'alk-mod-social-0000-2600-0000-000000000001';
const MODULE_VERSION = '1.0.0';

// ─── Lexicons (ported from Resonance heuristics.ts) ─────────────────────────

const ABSTRACT_WORDS = new Set([
  'meaning','essence','truth','consciousness','structure','pattern',
  'system','theory','concept','abstraction','principle','framework',
  'paradigm','ideology','philosophy','metaphysics','ontology','being',
  'existence','emergence','complexity','entropy','coherence','resonance',
  'signal','dynamic','recursive','infinite','temporal','fundamental'
]);

const CONCRETE_WORDS = new Set([
  'table','chair','walk','eat','drive','house','door','hand',
  'money','work','job','car','food','body','room','street',
  'today','yesterday','now','here','store','phone','coffee'
]);

const SOMATIC_WORDS = new Set([
  'chest','breath','body','stomach','skin','hands','spine','gut',
  'heart','throat','eyes','shoulder','weight','tired','heavy',
  'ache','warm','cold','tight','release','tension','shake','pulse',
  'numb','hollow','burning','neck','jaw','floor','ground'
]);

const URGENCY_WORDS = new Set([
  'now','immediately','urgent','crisis','need','must','have to',
  'right now','running out','deadline','before','quickly','fast',
  'panic','desperate','breaking','collapsing','failing','lost'
]);

const NEGATIVE_WORDS = new Set([
  'broken','lost','fail','wrong','bad','hurt','pain','suffering',
  'alone','empty','hollow','dark','dead','collapse','ruin','grief',
  'fear','dread','shame','guilt','rage','despair','nothing','never'
]);

const POSITIVE_WORDS = new Set([
  'good','clear','true','love','joy','alive','light','hope',
  'build','grow','create','connect','understand','free','open',
  'real','whole','full','solid','strong','beautiful','meaningful'
]);

const SYMBOLIC_WORDS = new Set([
  'god','soul','shadow','fire','death','birth','void','cosmos',
  'sacred','myth','archetype','ritual','fate','destiny','eternal',
  'infinite','dark','light','threshold','vessel','wound','gift'
]);

const METAPHOR_MARKERS = [
  /\blike\s+a\b/gi,/\bas\s+if\b/gi,/\bas\s+a\b/gi,
  /\bwaves?\b/gi,/\becho(es)?\b/gi,/\bbridge\b/gi,
  /\broot(s|ed)?\b/gi,/\bseed(s)?\b/gi,/\bthread(s)?\b/gi,
  /\borganism\b/gi,/\borbit(s|ing)?\b/gi,/\bgravit(y|ates?)\b/gi,
  /\bfractal\b/gi,/\bmirror(s|ed|ing)?\b/gi,/\bprism\b/gi,
  /\blayer(s)?\b/gi,/\bweav(e|ing|es)\b/gi,/\barchitecture\b/gi
];

const CAUSAL_MARKERS = [
  /\bbecause\b/gi,/\btherefore\b/gi,/\bwhich\s+means\b/gi,
  /\bwhich\s+causes?\b/gi,/\bleads?\s+to\b/gi,/\bimplies?\b/gi,
  /\bresult(s|ing)?\s+(in|from)\b/gi,/\bconsequently\b/gi,
  /\bthus\b/gi,/\bhence\b/gi,/\bso\s+that\b/gi,/\bif\s+.{1,40}\s+then\b/gi
];

const SELF_REF_MARKERS = [
  /\bI\s+(think|feel|notice|realize|wonder|mean|find|believe)\b/gi,
  /\bmy\s+(sense|feeling|thought|pattern|way|tendency|mind)\b/gi,
  /\bwithin\s+me\b/gi,/\bpart\s+of\s+me\b/gi,
  /\bI\s+am\s+(always|often|still|just|not)\b/gi,
  /\bwatching\s+(myself|this)\b/gi
];

const ANALYTICAL_MARKERS = [
  /\bhowever\b/gi,/\btherefore\b/gi,/\balthough\b/gi,/\bwhereas\b/gi,
  /\bin\s+contrast\b/gi,/\bspecifically\b/gi,/\bin\s+other\s+words\b/gi,
  /\bfor\s+example\b/gi,/\bthat\s+is\b/gi,/\bto\s+clarify\b/gi
];

const NARRATIVE_MARKERS = [
  /\bthen\b/gi,/\bafter\b/gi,/\bbefore\b/gi,/\bfinally\b/gi,
  /\bsuddenly\b/gi,/\bonce\b/gi,/\buntil\b/gi,/\bwhen\b/gi
];

const POETIC_MARKERS = [/—/g,/\.\.\./g,/\n\s*\n/g];

// ─── Math Primitives ──────────────────────────────────────────────────────────

function clamp(n) { return Math.max(0, Math.min(1, n)); }

function dot(a, b) { return a.reduce((s, v, i) => s + v * b[i], 0); }

function magnitude(v) { return Math.sqrt(v.reduce((s, x) => s + x * x, 0)); }

function cosine(a, b) {
  const mag = magnitude(a) * magnitude(b);
  if (mag === 0) return 0;
  return Math.max(-1, Math.min(1, dot(a, b) / mag));
}

function variance(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
}

function stddev(values) { return Math.sqrt(variance(values)); }

function meanAbsDelta(values) {
  if (values.length < 2) return 0;
  let s = 0;
  for (let i = 1; i < values.length; i++) s += Math.abs(values[i] - values[i-1]);
  return s / (values.length - 1);
}

function ema(current, newVal, alpha) {
  return current * (1 - alpha) + newVal * alpha;
}

function emaGroup(current, newValues, alpha) {
  const result = {};
  Object.keys(current).forEach(k => {
    result[k] = ema(current[k], newValues[k] ?? current[k], alpha);
  });
  return result;
}

// ─── Extraction Helpers ───────────────────────────────────────────────────────

function tokenize(text) {
  return text.toLowerCase().match(/\b[a-z']+\b/g) || [];
}

function sentences(text) {
  return text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

function countMatches(text, patterns) {
  return patterns.reduce((sum, p) => {
    const m = text.match(new RegExp(p.source, p.flags));
    return sum + (m ? m.length : 0);
  }, 0);
}

function lexiconRatio(words, set) {
  if (!words.length) return 0;
  return words.filter(w => set.has(w)).length / words.length;
}

// ─── Signal Extraction (Heuristic) ───────────────────────────────────────────

function extractCognition(text, words, sents) {
  const absScore  = lexiconRatio(words, ABSTRACT_WORDS);
  const concScore = lexiconRatio(words, CONCRETE_WORDS);
  const abstractionLevel = clamp(absScore * 4 - concScore * 2 + 0.4);

  const causalCount = countMatches(text, CAUSAL_MARKERS);
  const systemThinking = clamp(causalCount / Math.max(sents.length, 1) * 1.5);

  const selfRefCount = countMatches(text, SELF_REF_MARKERS);
  const recursionDepth = clamp(selfRefCount / Math.max(sents.length, 1) * 2);

  const hasNumberedList = /^\s*\d+[.)]/m.test(text);
  const hasBullets = /^\s*[-•*]/m.test(text);
  const avgSentLen = words.length / Math.max(sents.length, 1);
  const linearity = clamp(
    (hasNumberedList ? 0.3 : 0) +
    (hasBullets ? 0.2 : 0) +
    clamp(avgSentLen / 25) * 0.5
  );

  const uniqueAbstract = new Set(words.filter(w => ABSTRACT_WORDS.has(w))).size;
  const compression = clamp(uniqueAbstract / Math.max(sents.length, 1) * 0.4);

  return { abstractionLevel, linearity, recursionDepth, systemThinking, compression };
}

function extractAffect(text, words, sents) {
  const negScore = lexiconRatio(words, NEGATIVE_WORDS);
  const posScore = lexiconRatio(words, POSITIVE_WORDS);
  const valence  = clamp(0.5 + (posScore - negScore) * 5);

  const urgencyScore = lexiconRatio(words, URGENCY_WORDS);
  const urgency = clamp(urgencyScore * 8);

  const exclamations = (text.match(/!/g) || []).length;
  const questions    = (text.match(/\?/g) || []).length;
  const volatility   = clamp((exclamations + questions) / Math.max(sents.length, 1) * 0.8 + urgencyScore * 2);

  const relational = (text.match(/\b(you|we|us|they|relationship|together|connection|bond|other)\b/gi) || []).length;
  const attachmentLoad = clamp(relational / Math.max(words.length, 1) * 10);

  const somaticScore   = lexiconRatio(words, SOMATIC_WORDS);
  const somaticDensity = clamp(somaticScore * 12);

  return { valence, volatility, attachmentLoad, urgency, somaticDensity };
}

function extractLanguage(text, words, sents) {
  const metaphorCount   = countMatches(text, METAPHOR_MARKERS);
  const metaphorDensity = clamp(metaphorCount / Math.max(sents.length, 1) * 0.6);

  const symbolicScore = lexiconRatio(words, SYMBOLIC_WORDS);
  const symbolicUsage = clamp(symbolicScore * 15);

  const poeticMarkerCount = countMatches(text, POETIC_MARKERS);
  const shortLineCount    = text.split('\n').filter(l => l.trim().length > 0 && l.trim().split(' ').length < 6).length;
  const poeticness = clamp((poeticMarkerCount * 0.15) + (shortLineCount * 0.1));

  const analyticalCount = countMatches(text, ANALYTICAL_MARKERS);
  const analyticalness  = clamp(analyticalCount / Math.max(sents.length, 1) * 1.2);

  const narrativeCount    = countMatches(text, NARRATIVE_MARKERS);
  const narrativeStructure = clamp(narrativeCount / Math.max(sents.length, 1) * 0.8);

  return { metaphorDensity, symbolicUsage, poeticness, analyticalness, narrativeStructure };
}

function extractEntropy(words) {
  const unique = new Set(words).size;
  const ttr = words.length > 0 ? unique / words.length : 0;
  return clamp(ttr * 1.4 - 0.2);
}

function extractIntensity(affect) {
  return clamp(
    affect.volatility * 0.3 +
    affect.urgency * 0.3 +
    affect.somaticDensity * 0.2 +
    Math.abs(affect.valence - 0.5) * 2 * 0.2
  );
}

/**
 * Extract a SignalVector from raw text (heuristic, no network).
 * @param {string} userId
 * @param {string} text
 * @returns {SignalVector}
 */
function extractHeuristic(userId, text) {
  const wordList = tokenize(text);
  const sents    = sentences(text);

  const cognition = extractCognition(text, wordList, sents);
  const affect    = extractAffect(text, wordList, sents);
  const language  = extractLanguage(text, wordList, sents);
  const entropy   = extractEntropy(wordList);
  const intensity = extractIntensity(affect);

  return {
    userId,
    timestamp: Date.now(),
    text,
    cognition,
    affect,
    language,
    entropy,
    intensity,
    extractionMethod: 'heuristic',
    confidence: 0.65
  };
}

// ─── Oscillation ──────────────────────────────────────────────────────────────

function cogVector(s)  { return Object.values(s.cognition); }
function affVector(s)  { return Object.values(s.affect); }
function langVector(s) { return Object.values(s.language); }

function groupMean(vecs) {
  const flat = vecs.flat();
  return flat.reduce((a, b) => a + b, 0) / flat.length;
}

function estimatePhase(values, win = 5) {
  if (values.length < win) return 0.5;
  const recent = values.slice(-win);
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const min = Math.min(...recent), max = Math.max(...recent);
  const range = max - min;
  if (range === 0) return 0.5;
  return clamp((mean - min) / range);
}

function phaseDirection(values, win = 5) {
  if (values.length < win) return 'stable';
  const recent = values.slice(-win);
  const first  = recent.slice(0, Math.floor(win / 2));
  const last   = recent.slice(Math.floor(win / 2));
  const fMean  = first.reduce((a, b) => a + b, 0) / first.length;
  const lMean  = last.reduce((a, b) => a + b, 0) / last.length;
  const delta  = lMean - fMean;
  if (Math.abs(delta) < 0.05) return 'stable';
  const mad = meanAbsDelta(recent);
  if (mad > 0.12) return 'oscillating';
  return delta > 0 ? 'ascending' : 'descending';
}

/**
 * Compute an OscillationProfile from a user's signal history.
 * @param {string} userId
 * @param {SignalVector[]} signals
 * @param {number} [windowSize]
 * @returns {OscillationProfile}
 */
function computeOscillation(userId, signals, windowSize) {
  const win = windowSize ?? Math.min(signals.length, 20);
  const recent = signals.slice(-win);

  if (recent.length < 2) {
    return {
      userId, windowSize: win,
      computedAt: Date.now(),
      amplitude: { cognition: 0, affect: 0, language: 0, overall: 0 },
      frequency: { cognition: 0, affect: 0, language: 0 },
      phaseShift: { direction: 'stable', magnitude: 0 },
      stability: 0.5, recovery: 0.5, currentPhase: 0.5
    };
  }

  const cogMeans  = recent.map(s => groupMean([cogVector(s)]));
  const affMeans  = recent.map(s => groupMean([affVector(s)]));
  const langMeans = recent.map(s => groupMean([langVector(s)]));

  const cogAmp  = stddev(cogMeans)  * 2;
  const affAmp  = stddev(affMeans)  * 2;
  const langAmp = stddev(langMeans) * 2;
  const overall = (cogAmp + affAmp + langAmp) / 3;

  // Frequency: mean absolute delta normalized
  const cogFreq  = clamp(meanAbsDelta(cogMeans)  * 3);
  const affFreq  = clamp(meanAbsDelta(affMeans)  * 3);
  const langFreq = clamp(meanAbsDelta(langMeans) * 3);

  // Stability: inverse of overall amplitude
  const stability = clamp(1 - overall * 1.5);

  // Recovery: how quickly does the signal return toward mean after excursion?
  const allMeans = [...cogMeans, ...affMeans, ...langMeans];
  const globalMean = allMeans.reduce((a, b) => a + b, 0) / allMeans.length;
  let recoverySum = 0, recoveryCount = 0;
  for (let i = 1; i < allMeans.length - 1; i++) {
    const excursion = Math.abs(allMeans[i - 1] - globalMean);
    if (excursion > 0.08) {
      const returned = Math.abs(allMeans[i] - globalMean) < excursion;
      recoverySum += returned ? 1 : 0;
      recoveryCount++;
    }
  }
  const recovery = recoveryCount > 0 ? recoverySum / recoveryCount : 0.5;

  const allValues = [...cogMeans, ...affMeans, ...langMeans];
  const currentPhase = estimatePhase(allValues);
  const direction    = phaseDirection(allValues);
  const magnitude    = meanAbsDelta(allValues.slice(-5));

  return {
    userId, windowSize: win,
    computedAt: Date.now(),
    amplitude: { cognition: clamp(cogAmp), affect: clamp(affAmp), language: clamp(langAmp), overall: clamp(overall) },
    frequency: { cognition: cogFreq, affect: affFreq, language: langFreq },
    phaseShift: { direction, magnitude: clamp(magnitude * 4) },
    stability, recovery, currentPhase
  };
}

// ─── Resonance Scoring ────────────────────────────────────────────────────────

function signalToVec(s) {
  return [...Object.values(s.cognition), ...Object.values(s.affect), ...Object.values(s.language), s.entropy, s.intensity];
}

function groupVec(s, group) { return Object.values(s[group]); }

function avgSignals(signals) {
  if (!signals.length) return null;
  const avg = (group, key) => signals.reduce((s, v) => s + v[group][key], 0) / signals.length;
  const t = signals[0];
  return {
    ...t,
    cognition: Object.fromEntries(Object.keys(t.cognition).map(k => [k, avg('cognition', k)])),
    affect:    Object.fromEntries(Object.keys(t.affect).map(k => [k, avg('affect', k)])),
    language:  Object.fromEntries(Object.keys(t.language).map(k => [k, avg('language', k)])),
    entropy:   signals.reduce((s, v) => s + v.entropy, 0) / signals.length,
    intensity: signals.reduce((s, v) => s + v.intensity, 0) / signals.length
  };
}

function structuralResonance(a, b) {
  const cogSim  = (cosine(groupVec(a, 'cognition'), groupVec(b, 'cognition')) + 1) / 2;
  const affSim  = (cosine(groupVec(a, 'affect'),    groupVec(b, 'affect'))    + 1) / 2;
  const langSim = (cosine(groupVec(a, 'language'),  groupVec(b, 'language'))  + 1) / 2;
  return { total: cogSim * 0.35 + affSim * 0.35 + langSim * 0.30, cognition: cogSim, affect: affSim, language: langSim };
}

function oscillationResonance(a, b) {
  const ampSim  = 1 - Math.abs(a.amplitude.overall - b.amplitude.overall);
  const freqSim = 1 - (
    Math.abs(a.frequency.cognition - b.frequency.cognition) * 0.33 +
    Math.abs(a.frequency.affect    - b.frequency.affect)    * 0.33 +
    Math.abs(a.frequency.language  - b.frequency.language)  * 0.33
  );
  const stabSim = 1 - Math.abs(a.stability - b.stability);
  const recSim  = 1 - Math.abs(a.recovery  - b.recovery);
  return ampSim * 0.30 + freqSim * 0.30 + stabSim * 0.20 + recSim * 0.20;
}

function temporalAlignment(a, b) {
  const phaseDiff = Math.abs(a.currentPhase - b.currentPhase);
  const dirMatch  =
    a.phaseShift.direction === b.phaseShift.direction ? 1.0 :
    a.phaseShift.direction === 'stable' || b.phaseShift.direction === 'stable' ? 0.6 : 0.2;
  return (1 - phaseDiff) * 0.6 + dirMatch * 0.4;
}

function classifyMatch(structural, oscillation, temporal, a, b, aOsc, bOsc) {
  const total = structural * 0.5 + oscillation * 0.3 + temporal * 0.2;
  if (total > 0.72) return 'mirror';
  const structHigh  = structural > 0.60;
  const oscDiff     = Math.abs(aOsc.stability - bOsc.stability) > 0.3;
  if (structHigh && oscDiff) return 'complementary';
  const cogSim = (cosine(Object.values(a.cognition), Object.values(b.cognition)) + 1) / 2;
  const affDiff = 1 - (cosine(Object.values(a.affect), Object.values(b.affect)) + 1) / 2;
  if (cogSim > 0.65 && affDiff > 0.4) return 'friction';
  return 'dissonant';
}

function generateInsights(structural, oscillation, temporal, a, b, aOsc, bOsc, matchType) {
  const insights = [];

  if (structural.cognition > 0.75) {
    const aAbs = a.cognition.abstractionLevel, bAbs = b.cognition.abstractionLevel;
    if (aAbs > 0.65 && bAbs > 0.65)
      insights.push('Both operate at high abstraction — conversation moves fast and stays conceptual.');
    else if (aAbs < 0.4 && bAbs < 0.4)
      insights.push('Both think in concrete, grounded terms — strong shared anchor in the practical.');
    else
      insights.push('Strong alignment in cognitive rhythm and structure of reasoning.');
  } else if (structural.cognition < 0.4) {
    insights.push('Different abstraction levels — one grounds, the other lifts. Creative tension possible.');
  }

  if (structural.affect > 0.70)
    insights.push('Emotional processing patterns align — similar volatility and recovery arc.');

  if (Math.abs(aOsc.amplitude.affect - bOsc.amplitude.affect) > 0.35)
    insights.push('One person carries more emotional amplitude — potential for one to stabilize the other.');

  if (structural.language > 0.72) {
    if (a.language.poeticness > 0.6 && b.language.poeticness > 0.6)
      insights.push('Shared poetic and symbolic register — language will feel mutual without effort.');
    else if (a.language.analyticalness > 0.6 && b.language.analyticalness > 0.6)
      insights.push('Both default to analytical structure — high precision in mutual communication.');
    else
      insights.push('Similar language architecture — how things are said will feel native.');
  }

  if (oscillation > 0.70)
    insights.push('Oscillation patterns are closely matched — rhythm of engagement will sync naturally.');
  if (Math.abs(aOsc.stability - bOsc.stability) > 0.35)
    insights.push('Different stability profiles — one provides ground, one provides movement.');

  if (temporal > 0.70)
    insights.push('Currently in similar phase of expression cycle — good timing for contact.');
  else if (temporal < 0.35)
    insights.push('Phase misalignment — better timing may improve connection quality.');

  if (matchType === 'mirror')
    insights.push('Mirror resonance: they are likely to recognize themselves in each other immediately.');
  else if (matchType === 'complementary')
    insights.push('Complementary resonance: stable and dynamic — each fills what the other is not carrying.');
  else if (matchType === 'friction')
    insights.push('Friction resonance: shared cognition, different affect — growth pressure, not incompatibility.');

  return insights.slice(0, 4);
}

/**
 * Compute resonance between two users from their signals + oscillations.
 */
function computeResonance({ userA, signalsA, oscA, userB, signalsB, oscB, windowSize = 10 }) {
  const avgA = avgSignals(signalsA.slice(-windowSize));
  const avgB = avgSignals(signalsB.slice(-windowSize));

  if (!avgA || !avgB) {
    return {
      userA, userB, computedAt: Date.now(),
      structural: 0, oscillation: 0, temporal: 0, total: 0,
      matchType: 'dissonant',
      insights: ['Insufficient signal data for one or both users.'],
      axes: { cognition: 0, affect: 0, language: 0 }
    };
  }

  const structural  = structuralResonance(avgA, avgB);
  const oscillation = oscillationResonance(oscA, oscB);
  const temporal    = temporalAlignment(oscA, oscB);
  const total       = structural.total * 0.45 + oscillation * 0.45 + temporal * 0.10;
  const matchType   = classifyMatch(structural.total, oscillation, temporal, avgA, avgB, oscA, oscB);
  const insights    = generateInsights(structural, oscillation, temporal, avgA, avgB, oscA, oscB, matchType);

  return {
    userA, userB,
    computedAt: Date.now(),
    structural: structural.total,
    oscillation, temporal, total, matchType, insights,
    axes: { cognition: structural.cognition, affect: structural.affect, language: structural.language }
  };
}

// ─── ASE — Authorship Signature Engine ───────────────────────────────────────

const EMA_ALPHA       = 0.15;
const DRIFT_THRESHOLD = 0.12;
const MIN_SAMPLES     = 5;

function inferMode(core) {
  const c = core.cognition, a = core.affect, l = core.language;
  if (c.abstractionLevel > 0.7 && c.systemThinking > 0.6)   return 'systems-architect';
  if (l.poeticness > 0.65 && l.symbolicUsage > 0.55)         return 'symbolic-poet';
  if (c.recursionDepth > 0.65 && a.attachmentLoad < 0.4)     return 'deep-internal-processor';
  if (a.volatility > 0.6 && a.somaticDensity > 0.5)          return 'somatic-emotive';
  if (l.analyticalness > 0.65 && c.linearity > 0.6)          return 'analytical-structured';
  if (a.attachmentLoad > 0.65 && l.narrativeStructure > 0.55) return 'relational-narrator';
  if (core.entropy > 0.65 && c.compression > 0.6)            return 'high-entropy-synthesizer';
  if (a.urgency > 0.6 && core.intensity > 0.65)              return 'high-intensity-driver';
  return 'adaptive-generalist';
}

function inferSecondaryMode(core, primary) {
  const candidates = [
    'systems-architect','symbolic-poet','deep-internal-processor',
    'somatic-emotive','analytical-structured','relational-narrator',
    'high-entropy-synthesizer','high-intensity-driver','adaptive-generalist'
  ].filter(m => m !== primary);

  const c = core.cognition, a = core.affect, l = core.language;
  const scores = {
    'systems-architect':       (c.abstractionLevel + c.systemThinking) / 2,
    'symbolic-poet':           (l.poeticness + l.symbolicUsage) / 2,
    'deep-internal-processor': (c.recursionDepth + (1 - a.attachmentLoad)) / 2,
    'somatic-emotive':         (a.volatility + a.somaticDensity) / 2,
    'analytical-structured':   (l.analyticalness + c.linearity) / 2,
    'relational-narrator':     (a.attachmentLoad + l.narrativeStructure) / 2,
    'high-entropy-synthesizer':(core.entropy + c.compression) / 2,
    'high-intensity-driver':   (a.urgency + core.intensity) / 2,
    'adaptive-generalist':     0.35
  };

  const best = candidates.reduce((best, m) => (scores[m] > scores[best] ? m : best), candidates[0]);
  return scores[best] > 0.40 ? best : null;
}

function computeFingerprint(core, history) {
  const varianceMap = {};
  Object.entries(history).forEach(([key, vals]) => {
    if (vals.length < 2) return;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    varianceMap[key] = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  });

  const sorted      = Object.entries(varianceMap).sort((a, b) => b[1] - a[1]);
  const highVariance = sorted.slice(0, 3).map(([k]) => k);
  const lowVariance  = sorted.slice(-3).map(([k]) => k);

  return {
    highVarianceAxes: highVariance,
    lowVarianceAxes:  lowVariance,
    dominantMode:     inferMode(core),
    secondaryMode:    inferSecondaryMode(core, inferMode(core))
  };
}

function computeDrift(oldCore, newCore, threshold) {
  const groups = ['cognition', 'affect', 'language'];
  let total = 0, count = 0;
  const direction = [];

  groups.forEach(group => {
    Object.keys(oldCore[group]).forEach(key => {
      const delta = Math.abs(newCore[group][key] - oldCore[group][key]);
      total += delta;
      count++;
      if (delta > threshold * 0.6) direction.push(`${group}.${key}`);
    });
  });

  const diffEntropy   = Math.abs(newCore.entropy - oldCore.entropy);
  const diffIntensity = Math.abs(newCore.intensity - oldCore.intensity);
  total += diffEntropy + diffIntensity;
  count += 2;
  if (diffEntropy   > threshold * 0.6) direction.push('entropy');
  if (diffIntensity > threshold * 0.6) direction.push('intensity');

  const magnitude   = count > 0 ? total / count : 0;
  const isShifting  = magnitude > threshold;

  return { magnitude: clamp(magnitude * 3), direction, isShifting };
}

/**
 * In-memory ASE — full Authorship Signature Engine, no disk.
 * Signatures and history are stored in Maps keyed by userId.
 */
class ASE {
  constructor(config = {}) {
    this._alpha     = config.emaAlpha       ?? EMA_ALPHA;
    this._threshold = config.driftThreshold ?? DRIFT_THRESHOLD;
    this._minSamples = config.minSamples    ?? MIN_SAMPLES;
    this._sigs      = new Map(); // userId → AuthorshipSignature
    this._history   = new Map(); // userId → Record<axis, number[]>
  }

  _initHistory(userId) {
    if (!this._history.has(userId)) this._history.set(userId, {});
    return this._history.get(userId);
  }

  _trackHistory(userId, signal) {
    const hist = this._initHistory(userId);
    const groups = ['cognition', 'affect', 'language'];
    groups.forEach(group => {
      Object.entries(signal[group]).forEach(([key, val]) => {
        const k = `${group}.${key}`;
        if (!hist[k]) hist[k] = [];
        hist[k].push(val);
        if (hist[k].length > 50) hist[k].shift();
      });
    });
  }

  ingest(signal) {
    this._trackHistory(signal.userId, signal);
    const existing = this._sigs.get(signal.userId) ?? null;
    const history  = this._history.get(signal.userId);

    if (!existing) {
      const sig = {
        userId:     signal.userId,
        version:    1,
        createdAt:  Date.now(),
        updatedAt:  Date.now(),
        sampleSize: 1,
        core: {
          cognition: { ...signal.cognition },
          affect:    { ...signal.affect },
          language:  { ...signal.language },
          entropy:   signal.entropy,
          intensity: signal.intensity
        },
        fingerprint: computeFingerprint({
          cognition: { ...signal.cognition },
          affect:    { ...signal.affect },
          language:  { ...signal.language },
          entropy:   signal.entropy,
          intensity: signal.intensity
        }, history),
        drift: { magnitude: 0, direction: [], lastShiftAt: null, isShifting: false }
      };
      this._sigs.set(signal.userId, sig);
      return sig;
    }

    const newCore = {
      cognition: emaGroup(existing.core.cognition, signal.cognition, this._alpha),
      affect:    emaGroup(existing.core.affect,    signal.affect,    this._alpha),
      language:  emaGroup(existing.core.language,  signal.language,  this._alpha),
      entropy:   ema(existing.core.entropy,   signal.entropy,   this._alpha),
      intensity: ema(existing.core.intensity, signal.intensity, this._alpha)
    };

    const drift = computeDrift(existing.core, newCore, this._threshold);

    const updated = {
      ...existing,
      version:    existing.version + 1,
      updatedAt:  Date.now(),
      sampleSize: existing.sampleSize + 1,
      core:       newCore,
      fingerprint: computeFingerprint(newCore, history),
      drift: {
        ...drift,
        lastShiftAt: drift.isShifting ? Date.now() : existing.drift.lastShiftAt
      }
    };

    this._sigs.set(signal.userId, updated);
    return updated;
  }

  get(userId)        { return this._sigs.get(userId) ?? null; }
  isTrusted(userId)  { const s = this._sigs.get(userId); return s !== null && s !== undefined && s.sampleSize >= this._minSamples; }
  listUsers()        { return [...this._sigs.keys()]; }
  clear(userId)      { this._sigs.delete(userId); this._history.delete(userId); }

  distance(userA, userB) {
    const a = this._sigs.get(userA);
    const b = this._sigs.get(userB);
    if (!a || !b) return null;

    const groups = ['cognition', 'affect', 'language'];
    let total = 0, count = 0;

    groups.forEach(group => {
      Object.keys(a.core[group]).forEach(key => {
        total += Math.abs(a.core[group][key] - b.core[group][key]);
        count++;
      });
    });

    total += Math.abs(a.core.entropy - b.core.entropy);
    total += Math.abs(a.core.intensity - b.core.intensity);
    count += 2;

    return total / count;
  }
}

// ─── TrajectoryStore (in-memory) ─────────────────────────────────────────────

class TrajectoryStore {
  constructor(maxPerUser = 500) {
    this._store   = new Map(); // userId → SignalVector[]
    this._maxPerUser = maxPerUser;
  }

  append(signal) {
    if (!this._store.has(signal.userId)) this._store.set(signal.userId, []);
    const arr = this._store.get(signal.userId);
    arr.push(signal);
    if (arr.length > this._maxPerUser) arr.splice(0, arr.length - this._maxPerUser);
  }

  getAll(userId)         { return this._store.get(userId) ?? []; }
  getWindow(userId, win) { return this.getAll(userId).slice(-win); }
  count(userId)          { return this.getAll(userId).length; }
  listUsers()            { return [...this._store.keys()]; }
  clear(userId)          { this._store.delete(userId); }
}

// ─── Feed Generator ───────────────────────────────────────────────────────────

const WEIGHT_PRESETS = {
  balanced:        { resonance: 0.40, dynamic: 0.35, novelty: 0.15, phase: 0.10 },
  'resonance-heavy': { resonance: 0.65, dynamic: 0.20, novelty: 0.10, phase: 0.05 },
  'dynamic-heavy': { resonance: 0.25, dynamic: 0.55, novelty: 0.10, phase: 0.10 },
  novel:           { resonance: 0.30, dynamic: 0.25, novelty: 0.35, phase: 0.10 }
};

function generateFeed({ viewerId, limit = 20, excludeUserIds = [], preset = 'balanced' }, store, ase) {
  const weights  = WEIGHT_PRESETS[preset] ?? WEIGHT_PRESETS.balanced;
  const allUsers = store.listUsers().filter(uid => uid !== viewerId && !excludeUserIds.includes(uid));

  const viewerSignals = store.getAll(viewerId);
  const viewerOsc     = computeOscillation(viewerId, viewerSignals);

  const items = allUsers
    .map(targetId => {
      const targetSignals = store.getAll(targetId);
      if (!targetSignals.length) return null;

      const targetOsc = computeOscillation(targetId, targetSignals);
      const resonance = computeResonance({
        userA: viewerId, signalsA: viewerSignals, oscA: viewerOsc,
        userB: targetId, signalsB: targetSignals, oscB: targetOsc
      });

      const resonanceScore = resonance.total;
      const phaseScore     = temporalAlignment(viewerOsc, targetOsc);

      // Novelty: penalize if viewer has many signals against this target recently
      // (simple proxy: lower novelty for users with more samples)
      const noveltyScore = clamp(1 - (targetSignals.length / 100));

      // Dynamic placeholder: no IDL in this version, use resonance.oscillation as proxy
      const dynamicScore = resonance.oscillation;

      const total =
        resonanceScore * weights.resonance +
        dynamicScore   * weights.dynamic +
        noveltyScore   * weights.novelty +
        phaseScore     * weights.phase;

      const last = targetSignals[targetSignals.length - 1];

      return {
        targetUserId:          targetId,
        targetSignalTimestamp: last.timestamp,
        targetTextPreview:     last.text.slice(0, 200),
        resonanceResult:       resonance,
        score: {
          total,
          resonanceScore,
          dynamicScore,
          noveltyScore,
          phaseScore,
          primaryReason: resonance.insights[0] ?? resonance.matchType,
          matchType:     resonance.matchType,
          dynamicType:   null
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, limit);

  return {
    viewerId,
    generatedAt:    Date.now(),
    totalCandidates: allUsers.length,
    items,
    weights
  };
}

// ─── Social Module ────────────────────────────────────────────────────────────

export class SocialModule {
  /**
   * @param {object} kernel   — ALK kernel (emit/subscribe API)
   * @param {object} [config]
   * @param {string} [config.serverUrl]     — optional Resonance server URL for bridge mode
   * @param {number} [config.maxPerUser]    — max signals stored per user (default 500)
   * @param {number} [config.emaAlpha]      — ASE EMA weight (default 0.15)
   * @param {number} [config.driftThreshold]
   * @param {number} [config.minSamples]
   */
  constructor(kernel, config = {}) {
    if (!kernel) throw new Error(`[SocialModule §1.2] kernel is required`);

    this.uuid    = MODULE_UUID;
    this.version = MODULE_VERSION;
    this.kernel  = kernel;
    this.cfg     = config;

    this._store  = new TrajectoryStore(config.maxPerUser ?? 500);
    this._ase    = new ASE({
      emaAlpha:       config.emaAlpha       ?? EMA_ALPHA,
      driftThreshold: config.driftThreshold ?? DRIFT_THRESHOLD,
      minSamples:     config.minSamples     ?? MIN_SAMPLES
    });

    this._prevDriftState = new Map(); // userId → wasShifting

    this._registerSubscriptions();

    this.kernel.emit('alk.social.ready', {
      uuid:    this.uuid,
      version: this.version,
      mode:    config.serverUrl ? 'bridge' : 'local'
    });
  }

  // ─── Subscriptions ─────────────────────────────────────────

  _registerSubscriptions() {
    const k = this.kernel;

    k.subscribe('alk.social.signal.ingest',    ev => this._onIngest(ev));
    k.subscribe('alk.social.resonance.query',  ev => this._onResonanceQuery(ev));
    k.subscribe('alk.social.ase.get',          ev => this._onASEGet(ev));
    k.subscribe('alk.social.feed.generate',    ev => this._onFeedGenerate(ev));
    k.subscribe('alk.social.user.list',        ev => this._onUserList(ev));
    k.subscribe('alk.social.user.clear',       ev => this._onUserClear(ev));
  }

  // ─── Handlers ──────────────────────────────────────────────

  _onIngest(ev) {
    const { userId, text } = ev;

    if (!userId || typeof userId !== 'string') {
      return this._error('signal.ingest', 'userId required', ev);
    }
    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return this._error('signal.ingest', 'text required (min 5 chars)', ev);
    }

    // Bridge mode: proxy to Resonance server
    if (this.cfg.serverUrl) {
      this._bridgeIngest(userId, text.trim(), ev);
      return;
    }

    // Local heuristic extraction
    const signal    = extractHeuristic(userId, text.trim());
    const signature = this._ase.ingest(signal);
    this._store.append(signal);

    // Drift detection
    const wasShifting = this._prevDriftState.get(userId) ?? false;
    if (signature.drift.isShifting && !wasShifting) {
      this.kernel.emit('alk.social.drift.detected', { userId, drift: signature.drift });
    }
    this._prevDriftState.set(userId, signature.drift.isShifting);

    this.kernel.emit('alk.social.signal.extracted', {
      userId,
      signal,
      signature,
      trusted:     this._ase.isTrusted(userId),
      sampleCount: this._store.count(userId)
    });
  }

  _onResonanceQuery(ev) {
    const { userA, userB, window: win = 20 } = ev;

    if (!userA || !userB) return this._error('resonance.query', 'userA and userB required', ev);

    const sA = this._store.getWindow(userA, win);
    const sB = this._store.getWindow(userB, win);

    if (!sA.length) return this._error('resonance.query', `No signals for ${userA}`, ev);
    if (!sB.length) return this._error('resonance.query', `No signals for ${userB}`, ev);

    const oscA   = computeOscillation(userA, sA);
    const oscB   = computeOscillation(userB, sB);
    const result = computeResonance({ userA, signalsA: sA, oscA, userB, signalsB: sB, oscB, windowSize: win });

    this.kernel.emit('alk.social.resonance.result', { userA, userB, result });
  }

  _onASEGet(ev) {
    const { userId } = ev;
    if (!userId) return this._error('ase.get', 'userId required', ev);

    const signature = this._ase.get(userId);
    if (!signature) return this._error('ase.get', `No signature for ${userId}`, ev);

    this.kernel.emit('alk.social.ase.signature', { userId, signature });
  }

  _onFeedGenerate(ev) {
    const { viewerId, limit = 20, excludeUserIds = [], preset = 'balanced' } = ev;
    if (!viewerId) return this._error('feed.generate', 'viewerId required', ev);

    const viewerSignals = this._store.getAll(viewerId);
    if (!viewerSignals.length) return this._error('feed.generate', `No signals for ${viewerId}`, ev);

    const feed = generateFeed({ viewerId, limit, excludeUserIds, preset }, this._store, this._ase);
    this.kernel.emit('alk.social.feed.result', feed);
  }

  _onUserList(_ev) {
    this.kernel.emit('alk.social.user.list', { userIds: this._store.listUsers() });
  }

  _onUserClear(ev) {
    const { userId } = ev;
    if (!userId) return this._error('user.clear', 'userId required', ev);
    this._store.clear(userId);
    this._ase.clear(userId);
    this.kernel.emit('alk.social.user.cleared', { userId });
  }

  // ─── Bridge mode ───────────────────────────────────────────

  async _bridgeIngest(userId, text, originalEv) {
    try {
      const res = await fetch(`${this.cfg.serverUrl}/api/signal/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, text })
      });

      if (!res.ok) throw new Error(`Resonance server ${res.status}: ${res.statusText}`);

      const data = await res.json();

      // Store the signal locally too for local oscillation access
      if (data.signal) this._store.append(data.signal);

      this.kernel.emit('alk.social.signal.extracted', {
        userId,
        signal:      data.signal,
        signature:   data.signature,
        trusted:     data.trusted,
        sampleCount: data.sampleCount,
        source:      'resonance-server'
      });
    } catch (err) {
      // Fall back to local heuristics
      const signal    = extractHeuristic(userId, text);
      const signature = this._ase.ingest(signal);
      this._store.append(signal);

      this.kernel.emit('alk.social.signal.extracted', {
        userId, signal, signature,
        trusted:     this._ase.isTrusted(userId),
        sampleCount: this._store.count(userId),
        source:      'local-fallback',
        bridgeError: err.message
      });
    }
  }

  // ─── Public direct API (for use in same-module integrations) ─

  /**
   * Ingest text directly (bypasses event bus — use only from host page).
   * All inter-module communication should use kernel.emit instead.
   */
  ingest(userId, text) {
    if (!userId || !text || text.trim().length < 5) {
      throw new Error(`[SocialModule §1.2] ingest: userId and text (min 5 chars) required`);
    }
    const signal    = extractHeuristic(userId, text.trim());
    const signature = this._ase.ingest(signal);
    this._store.append(signal);
    return { signal, signature };
  }

  /**
   * Direct resonance query — bypasses event bus.
   */
  resonance(userA, userB, win = 20) {
    const sA = this._store.getWindow(userA, win);
    const sB = this._store.getWindow(userB, win);
    if (!sA.length || !sB.length) return null;
    return computeResonance({
      userA, signalsA: sA, oscA: computeOscillation(userA, sA),
      userB, signalsB: sB, oscB: computeOscillation(userB, sB),
      windowSize: win
    });
  }

  oscillation(userId, win) {
    const signals = win ? this._store.getWindow(userId, win) : this._store.getAll(userId);
    return computeOscillation(userId, signals, win);
  }

  signature(userId) { return this._ase.get(userId); }

  users() { return this._store.listUsers(); }

  // ─── Error surface ─────────────────────────────────────────

  _error(source, message, payload) {
    this.kernel.emit('alk.social.error', { source, message, payload });
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  extractHeuristic,
  computeOscillation,
  computeResonance,
  ASE,
  TrajectoryStore,
  generateFeed,
  WEIGHT_PRESETS,
  MODULE_UUID,
  MODULE_VERSION
};
