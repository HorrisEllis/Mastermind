'use strict';

/**
 * BDA Signal Extractor
 * Converts raw text into 5 normalized signals [0,1].
 * Role-aware: user and assistant have different baseline expectations.
 *
 * Signals:
 *   valence   — positive/negative affect
 *   certainty — confidence vs uncertainty
 *   openness  — exploring vs closing
 *   tension   — internal conflict markers
 *   selfref   — first-person density (inward focus)
 */

const POS = new Set([
  'happy','love','great','wonderful','excited','good','beautiful','grateful',
  'joy','amazing','hope','proud','better','yes','glad','warmth','peace',
  'safe','strong','alive','free','clear','trust','forward','helpful',
  'interesting','excellent','perfect','brilliant','fantastic','enjoy',
  'pleasure','comfortable','confident','ready','agree','understand',
]);

const NEG = new Set([
  'sad','hate','terrible','awful','bad','horrible','wrong','angry','hurt',
  'pain','worst','dead','lost','trapped','broken','fail','failed','fear',
  'scared','empty','numb','alone','tired','useless','worthless','sorry',
  'apologize','cannot','impossible','mistake','error','problem','issue',
  'concern','worry','confused','unclear','difficult','hard','struggle',
]);

const CERT = new Set([
  'definitely','certainly','absolutely','must','clearly','obviously','know',
  'sure','certain','will','fact','exactly','undoubtedly','always','never',
  'confirmed','proven','established','true','false','correct','incorrect',
]);

const UNCERT = new Set([
  'maybe','perhaps','might','could','unsure','possibly','guess','suppose',
  'probably','seems','appears','think','feel','wonder','unclear','uncertain',
  'doubt','approximately','roughly','around','about','potentially','possibly',
]);

const OPEN_W = new Set([
  'curious','wondering','exploring','learning','trying','discovering','open',
  'considering','questioning','possibility','interested','want','hope',
  'attempting','investigating','what','why','how','whether','if','perhaps',
]);

const CLOSE_W = new Set([
  'decided','final','done','over','finished','end','stop','quit','closed',
  'resolved','settled','fixed','rigid','locked','concluded','determined',
  'definitive','complete','ended','terminated',
]);

const TENSION_W = new Set([
  'but','however','except','still','yet','though','although','despite',
  'unless','conflict','struggle','torn','caught','versus','against',
  'contradict','tension','paradox','ambivalent','mixed','complex',
]);

function tokenize(text) {
  return text.toLowerCase().match(/\b[a-z']+\b/g) || [];
}

function bipolar(words, posSet, negSet) {
  let p = 0, n = 0;
  for (const w of words) {
    if (posSet.has(w)) p++;
    if (negSet.has(w)) n++;
  }
  const len = Math.max(words.length, 1);
  return Math.min(1, Math.max(0, 0.5 + (p - n) / (2 * Math.sqrt(len))));
}

function extract(text, role) {
  if (!text || !text.trim()) {
    return { valence: 0.5, certainty: 0.5, openness: 0.5, tension: 0, selfref: 0 };
  }

  const words  = tokenize(text);
  const n      = Math.max(words.length, 1);

  const valence   = bipolar(words, POS, NEG);
  const certainty = bipolar(words, CERT, UNCERT);
  const openness  = bipolar(words, OPEN_W, CLOSE_W);

  const tensionCount = words.filter(w => TENSION_W.has(w)).length;
  const tension = Math.min(1, tensionCount / Math.max(1, n * 0.12));

  // selfref is meaningful for user; for assistant it's a different signal
  // (assistant saying "I" a lot may indicate hedging or over-personalizing)
  const selfMatches = (text.match(/\b(i|my|me|myself|i'm|i've|i'd|i'll)\b/gi) || []).length;
  const selfref = Math.min(1, selfMatches / Math.max(1, n * 0.20));

  return {
    valence:   +valence.toFixed(4),
    certainty: +certainty.toFixed(4),
    openness:  +openness.toFixed(4),
    tension:   +tension.toFixed(4),
    selfref:   +selfref.toFixed(4),
  };
}

module.exports = { extract };
