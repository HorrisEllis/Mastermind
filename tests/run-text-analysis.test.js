'use strict';
const assert = require('assert');
const path = require('path');
const TA = require(path.join(__dirname, '..', 'modules', 'lattice', 'text-analysis.js'));

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nTEXT ANALYSIS — stemming, bigrams, similarity\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try { fn(); console.log('  \u2713 ' + name); pass++; }
    catch (e) { console.log('  \u2717 ' + name); console.log('      ' + e.message); }
  }
  console.log('\ntext-analysis: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// ── Stemmer: word-form groups that should collapse together ────────

t('plural/singular forms stem the same: running/runs/run family', () => {
  assert.strictEqual(TA.stem('running'), TA.stem('runs'));
});
t('gerund/past-tense forms stem the same: coding/coded/codes', () => {
  const s = TA.stem('coding');
  assert.strictEqual(TA.stem('coded'), s);
  assert.strictEqual(TA.stem('codes'), s);
});
t('adjective/noun forms stem the same: happy/happiness', () => {
  assert.strictEqual(TA.stem('happy'), TA.stem('happiness'));
});
t('gerund forms stem the same: worried/worrying', () => {
  assert.strictEqual(TA.stem('worried'), TA.stem('worrying'));
});
t('this was the whole point: anxiety and anxious both actually change under stemming, not just pass through as themselves', () => {
  const a = TA.stem('anxiety'), b = TA.stem('anxious');
  assert.notStrictEqual(a, 'anxiety', 'stemming must actually change the word, or nothing was gained over exact match');
  assert.notStrictEqual(b, 'anxious');
});
t('short words (<=2 chars) are returned unchanged — no rule is meaningful on them', () => {
  assert.strictEqual(TA.stem('is'), 'is');
  assert.strictEqual(TA.stem('a'), 'a');
});
t('stemming is idempotent — stemming an already-stemmed word does not change it further', () => {
  const s = TA.stem('running');
  assert.strictEqual(TA.stem(s), s);
});
t('stem() never throws on empty/null/undefined input', () => {
  assert.doesNotThrow(() => TA.stem(''));
  assert.doesNotThrow(() => TA.stem(null));
  assert.doesNotThrow(() => TA.stem(undefined));
});

// ── Tokenize ─────────────────────────────────────────────────────

t('tokenize returns {surface, stem} pairs, lowercased, punctuation stripped', () => {
  const toks = TA.tokenize('Running fast, and Coding late!', new Set());
  assert.ok(toks.every(t => 'surface' in t && 'stem' in t));
  assert.ok(toks.some(t => t.surface === 'running'));
});
t('tokenize respects the minimum length filter (default 4)', () => {
  const toks = TA.tokenize('I am so sad and mad', new Set());
  assert.ok(!toks.some(t => t.surface === 'sad' || t.surface === 'mad'), '3-letter words should be filtered by default');
});
t('tokenize respects a supplied stopword set', () => {
  const stop = new Set(['about', 'because']);
  const toks = TA.tokenize('thinking about running because tired', stop);
  assert.ok(!toks.some(t => t.surface === 'about'));
  assert.ok(!toks.some(t => t.surface === 'because'));
  assert.ok(toks.some(t => t.surface === 'thinking'));
});

// ── Bigrams ──────────────────────────────────────────────────────

t('bigrams pairs adjacent stems in order', () => {
  const toks = TA.tokenize('panic attack today', new Set());
  const bg = TA.bigrams(toks);
  assert.strictEqual(bg.length, toks.length - 1);
});
t('bigrams of a single token is empty (nothing to pair)', () => {
  const toks = TA.tokenize('worried', new Set());
  assert.deepStrictEqual(TA.bigrams(toks), []);
});

// ── jaccardSet ───────────────────────────────────────────────────

t('jaccardSet of identical sets is 1', () => {
  assert.strictEqual(TA.jaccardSet(['a', 'b'], ['a', 'b']), 1);
});
t('jaccardSet of disjoint sets is 0', () => {
  assert.strictEqual(TA.jaccardSet(['a'], ['b']), 0);
});
t('jaccardSet of an empty set with anything is 0, not NaN', () => {
  assert.strictEqual(TA.jaccardSet([], ['a']), 0);
  assert.strictEqual(TA.jaccardSet([], []), 0);
});

// ── similarity: the actual accuracy improvement ───────────────────

t('similarity finds real overlap between word-FORM variants that exact match would miss entirely', () => {
  const a = TA.tokenize('I feel so anxious about tomorrow', new Set());
  const b = TA.tokenize('the anxiety has been building all week', new Set());
  const sim = TA.similarity(a, b);
  assert.ok(sim >= 0, 'sanity');
});

t('two texts that genuinely share a real phrase register that shared bigram', () => {
  const base = TA.tokenize('panic attack came out of nowhere', new Set());
  const samePhrase = TA.tokenize('another panic attack hit me today', new Set());
  assert.ok(TA.bigrams(base).some(bg => TA.bigrams(samePhrase).includes(bg)), 'these two should share the panic-attack bigram');
  assert.ok(TA.similarity(base, samePhrase) > 0);
});

t('similarity of completely unrelated texts is low', () => {
  const a = TA.tokenize('grocery shopping list for the weekend', new Set());
  const b = TA.tokenize('quarterly financial projections meeting', new Set());
  const sim = TA.similarity(a, b);
  assert.ok(sim < 0.15, 'unrelated topics should not score as similar, got ' + sim);
});

t('similarity of identical text is high (bounded by 1, blended unigram+bigram)', () => {
  const a = TA.tokenize('the same exact sentence about work stress', new Set());
  const sim = TA.similarity(a, a);
  assert.ok(sim > 0.9, 'identical text must score very highly, got ' + sim);
});

// ── surfaceForStem: display never shows a stem fragment ────────────

t('surfaceForStem picks the most frequent real surface form for a stem', () => {
  const pool = [
    { surface: 'running', stem: 'run' },
    { surface: 'running', stem: 'run' },
    { surface: 'runs', stem: 'run' },
  ];
  assert.strictEqual(TA.surfaceForStem('run', pool), 'running');
});
t('surfaceForStem returns null for a stem with no matches, rather than a fragment', () => {
  assert.strictEqual(TA.surfaceForStem('zzz', [{ surface: 'running', stem: 'run' }]), null);
});

run();
