// ═══════════════════════════════════════════════════════════════════
// TEXT ANALYSIS — modules/lattice/text-analysis.js
//
// The Associative Lattice's whole job is noticing when two things you
// said are related. Exact-word-match Jaccard similarity — what it did
// before this file existed — misses almost every real connection that
// isn't a literal repeated word: "anxious" and "anxiety" share zero
// tokens. "panic attack" and "attack of panic" share two tokens but in
// the wrong order, which plain unigram overlap can't distinguish from
// two unrelated sentences that each happen to contain "attack".
//
// This is two small, well-understood fixes, not a language model:
//   1. STEMMING — reduce a word to its root (anxious/anxiety/anxiously
//      -> anxi) before comparing, so word-FORM stops mattering and
//      word-MEANING starts to. A simplified but real Porter-style
//      stemmer (suffix stripping by rule, the standard 1980 algorithm,
//      not a hand-wave), because "roughly right, no dependency" beats
//      "exactly right, one more thing that can break the build".
//   2. BIGRAMS — alongside single-word overlap, also compare adjacent
//      word PAIRS. Two texts sharing "panic attack" as a phrase is a
//      stronger, more specific signal than sharing "panic" and
//      "attack" as separate, possibly-unrelated words.
//
// Stemming is for MATCHING, never for DISPLAY. A tag or label shown to
// a person should always be a real word they'd recognize, not a stem
// fragment — surfaceForStem() exists specifically to pick the most
// common actual word for a given stem, so "anxi" never appears in the
// UI even though it's what similarity is computed on internally.
//
// UUID: 4a3b2c1d-mod-9000-8000-textanalysis1
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.TextAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── Stemmer ──────────────────────────────────────────────────────
  // A simplified Porter stemmer: the common-case suffix rules (plurals,
  // -ed/-ing, -ational/-ization-style multi-step endings, -ly, -ness,
  // -ful, -ive/-ize/-able/-al), applied in the standard longest-suffix-
  // first order, with the real algorithm's short-word and vowel-count
  // guards so short/irregular words aren't mangled ("this" doesn't
  // become "thi", "was" doesn't become "wa"). Not the complete Porter
  // spec (steps 1c's y->i and the full step 4 suffix list are
  // abbreviated) — the coverage that matters for everyday reflective
  // writing, not a linguistics exercise.
  const VOWELS = 'aeiou';

  function isVowel(ch, word, i) {
    if (VOWELS.indexOf(ch) > -1) return true;
    if (ch === 'y' && i > 0 && VOWELS.indexOf(word[i - 1]) === -1) return true; // 'y' after a consonant counts as a vowel
    return false;
  }

  // "measure" (m) of a word per the Porter paper: the number of
  // consonant-vowel-consonant sequences. Used to guard against
  // stemming words too short for a suffix rule to make sense on.
  function measure(word) {
    let m = 0, prevVowel = null;
    for (let i = 0; i < word.length; i++) {
      const v = isVowel(word[i], word, i);
      if (prevVowel === true && v === false) m++;
      prevVowel = v;
    }
    return m;
  }

  function hasVowel(word) {
    for (let i = 0; i < word.length; i++) if (isVowel(word[i], word, i)) return true;
    return false;
  }

  function endsDoubleConsonant(word) {
    if (word.length < 2) return false;
    const a = word[word.length - 1], b = word[word.length - 2];
    return a === b && VOWELS.indexOf(a) === -1 && a !== 'l' && a !== 's' && a !== 'z';
  }

  function stem(rawWord) {
    let w = String(rawWord || '').toLowerCase();
    if (w.length <= 2) return w; // too short for any rule to be meaningful

    // Step 1a — plurals
    if (w.endsWith('sses')) w = w.slice(0, -2);
    else if (w.endsWith('ies')) w = w.slice(0, -2);
    else if (w.endsWith('ss')) { /* leave as-is */ }
    else if (w.endsWith('s') && w.length > 3) w = w.slice(0, -1);

    // Step 1b — -eed/-ed/-ing, with the measure guard so "agreed"
    // doesn't lose its root and "feed" doesn't become "fe"
    if (w.endsWith('eed')) {
      if (measure(w.slice(0, -3)) > 0) w = w.slice(0, -1);
    } else if ((w.endsWith('ed') && hasVowel(w.slice(0, -2))) ||
               (w.endsWith('ing') && hasVowel(w.slice(0, -3)))) {
      w = w.endsWith('ing') ? w.slice(0, -3) : w.slice(0, -2);
      if (w.endsWith('at') || w.endsWith('bl') || w.endsWith('iz')) w += 'e';
      else if (endsDoubleConsonant(w) === false && measure(w) === 1 && needsE(w)) w += 'e';
      else if (endsDoubleConsonant(w) && !/[lsz]$/.test(w)) w = w.slice(0, -1);
    }

    // Step 1c — y -> i, if preceded by a consonant and word has a vowel elsewhere
    if (w.endsWith('y') && w.length > 2 && hasVowel(w.slice(0, -1))) {
      w = w.slice(0, -1) + 'i';
    }

    // Step 2/3 — common multi-letter suffix families, longest first,
    // each gated by measure() > 0 so short roots are left alone.
    const SUFFIXES = [
      ['ational', 'ate'], ['tional', 'tion'], ['enci', 'ence'], ['anci', 'ance'],
      ['izer', 'ize'], ['abli', 'able'], ['alli', 'al'], ['entli', 'ent'],
      ['eli', 'e'], ['ousli', 'ous'], ['ization', 'ize'], ['ation', 'ate'],
      ['ator', 'ate'], ['alism', 'al'], ['iveness', 'ive'], ['fulness', 'ful'],
      ['ousness', 'ous'], ['aliti', 'al'], ['iviti', 'ive'], ['biliti', 'ble'],
      ['icate', 'ic'], ['ative', ''], ['alize', 'al'], ['iciti', 'ic'],
      ['ical', 'ic'], ['ful', ''], ['ness', ''],
    ];
    for (const [suf, repl] of SUFFIXES) {
      if (w.endsWith(suf) && measure(w.slice(0, -suf.length)) > 0) {
        w = w.slice(0, -suf.length) + repl;
        break;
      }
    }

    // Step 4 — the common derivational endings, removed outright when
    // the remaining stem has measure > 1 (i.e. is substantial enough).
    const STEP4 = ['al', 'ance', 'ence', 'er', 'ic', 'able', 'ible', 'ant',
      'ement', 'ment', 'ent', 'ism', 'ate', 'iti', 'ous', 'ive', 'ize', 'ion'];
    for (const suf of STEP4) {
      if (w.endsWith(suf)) {
        const stemPart = w.slice(0, -suf.length);
        if (suf === 'ion' && !/[st]$/.test(stemPart)) continue; // -ion only strips after s/t
        if (measure(stemPart) > 1) { w = stemPart; }
        break;
      }
    }

    // Step 5 — trailing silent 'e', and de-double a trailing 'll'
    if (w.endsWith('e')) {
      const stemPart = w.slice(0, -1);
      const m = measure(stemPart);
      if (m > 1 || (m === 1 && !needsE(stemPart))) w = stemPart;
    }
    if (w.endsWith('ll') && measure(w) > 1) w = w.slice(0, -1);

    return w;
  }

  // "cvc" check from the Porter paper: does the stem end in
  // consonant-vowel-consonant where the final consonant isn't w/x/y —
  // words shaped like this need the 'e' added back (e.g. "hop" -> "hope").
  function needsE(w) {
    if (w.length < 3) return false;
    const a = w[w.length - 3], b = w[w.length - 2], c = w[w.length - 1];
    return VOWELS.indexOf(a) === -1 && VOWELS.indexOf(b) > -1 && VOWELS.indexOf(c) === -1 && 'wxy'.indexOf(c) === -1;
  }

  // ── Tokenization ─────────────────────────────────────────────────
  // Same shape as the tokenizers this replaces (lowercase, strip
  // non-letters, length filter, stopword filter) — this just also
  // returns each token's stem alongside its original surface form.
  function tokenize(text, stopwords, minLen) {
    const min = minLen || 4;
    const words = String(text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter((w) => w.length >= min && !(stopwords && stopwords.has && stopwords.has(w)));
    return words.map((w) => ({ surface: w, stem: stem(w) }));
  }

  function bigrams(tokens) {
    const out = [];
    for (let i = 0; i < tokens.length - 1; i++) out.push(tokens[i].stem + '_' + tokens[i + 1].stem);
    return out;
  }

  // ── Similarity ───────────────────────────────────────────────────
  function jaccardSet(a, b) {
    if (!a.length || !b.length) return 0;
    const setA = {};
    let inter = 0;
    for (const x of a) setA[x] = 1;
    for (const x of b) if (setA[x]) inter++;
    const union = Object.keys(setA).length + b.length - inter;
    return union > 0 ? inter / union : 0;
  }

  // Additive, not diluting: unigram overlap alone is the full-weight
  // primary signal (this is what preserves LAT_ASSOC_MIN's existing
  // calibration in lattice.js — stemming can only ever ADD matches
  // relative to exact-word comparison, never remove one, since any pair
  // of identical surface words trivially still shares a stem). Bigram
  // overlap is a bonus on top when texts share an actual phrase, capped
  // so the total never exceeds 1. A blended average would have DILUTED
  // the common case (most short utterances share zero bigrams) below
  // what plain exact-match Jaccard already found — the opposite of
  // what this file exists to do.
  function similarity(tokensA, tokensB) {
    const stemsA = tokensA.map((t) => t.stem);
    const stemsB = tokensB.map((t) => t.stem);
    const uni = jaccardSet(stemsA, stemsB);
    const biA = bigrams(tokensA), biB = bigrams(tokensB);
    const bi = (biA.length && biB.length) ? jaccardSet(biA, biB) : 0;
    return Math.min(1, Math.round((uni + bi * 0.5) * 1000) / 1000);
  }

  // For display: given a stem and the pool of {surface, stem} pairs it
  // came from, the most frequently-occurring surface form — so a tag
  // or label always shows a real word, never a stem fragment.
  function surfaceForStem(targetStem, tokenPairs) {
    const counts = {};
    for (const t of tokenPairs) {
      if (t.stem !== targetStem) continue;
      counts[t.surface] = (counts[t.surface] || 0) + 1;
    }
    let best = null, bestCount = 0;
    for (const surface of Object.keys(counts)) {
      if (counts[surface] > bestCount) { best = surface; bestCount = counts[surface]; }
    }
    return best;
  }

  return { stem, tokenize, bigrams, jaccardSet, similarity, surfaceForStem, measure, hasVowel };
});
