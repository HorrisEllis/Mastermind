'use strict';
// ═══════════════════════════════════════════════════════════════════
// LEXICON
//
// The claim under test: a word's meaning can be recovered from the
// company it keeps, using nothing but counting.
//
// The disambiguation tests are the ones that carry weight. That is the
// concrete payoff — Whisper mishearing "vault" as "fault" is fixable
// from context alone, with no model, once the lexicon has watched you
// talk for a while.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const LX = require('../foundation/ai/lexicon.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

// Two coherent topics that never share vocabulary. If the distributional
// claim holds, words inside a topic end up near each other and far from
// the other topic — with no labels supplied anywhere.
const VAULT = [
  'the vault encryption needs stronger key derivation',
  'encryption keys derive from the vault salt',
  'the vault salt lives in the header for portability',
  'key derivation iterations protect the vault contents',
  'the header carries the salt and the iteration count',
  'vault integrity depends on the ciphertext hash',
  'ciphertext and the header hash verify vault integrity',
  'salt and iterations belong in the vault header',
];
const GARDEN = [
  'the tomato plants need water every morning',
  'water the seedlings before the sun gets high',
  'seedlings in the garden bed need more compost',
  'compost feeds the tomato beds through summer',
  'the garden soil holds water after compost',
  'morning sun helps the tomato plants grow',
  'plants in the garden bed want deeper soil',
  'soil and compost matter more than water alone',
];

function trained(extraRounds) {
  const lx = LX.create();
  const rounds = extraRounds == null ? 30 : extraRounds;
  for (let i = 0; i < rounds; i++) {
    VAULT.forEach(s => lx.observe(s, { tags: ['SYS'] }));
    GARDEN.forEach(s => lx.observe(s, { tags: ['REL'] }));
  }
  return lx;
}

console.log('\nLEXICON\n');

// ── Learning ───────────────────────────────────────────────────────

t('filler words are excluded from the vocabulary entirely', () => {
  const lx = LX.create();
  lx.observe('I really think the thing is basically working');
  const words = lx.tokenize('I really think the thing is basically working');
  assert.ok(!words.includes('think'));
  assert.ok(!words.includes('thing'));
  assert.ok(!words.includes('really'));
  assert.ok(words.includes('working'));
});

t('counts accumulate across utterances', () => {
  const lx = LX.create();
  lx.observe('the vault holds encrypted nodes');
  lx.observe('the vault needs a salt');
  assert.strictEqual(lx.state.counts.get('vault'), 2);
  assert.strictEqual(lx.state.totalObservations, 2);
});

t('an utterance of pure filler learns nothing', () => {
  const lx = LX.create();
  const r = lx.observe('yeah I mean really just kind of a thing');
  assert.strictEqual(r.learned, 0);
});

// ── The distributional claim ───────────────────────────────────────

t('THE CLAIM: words from the same topic end up near each other', () => {
  const lx = trained();
  const s = lx.similarity('vault', 'encryption');
  assert.ok(s.score > 0.25, 'vault~encryption scored ' + s.score.toFixed(3));
});

t('THE CLAIM: words from different topics end up far apart', () => {
  const lx = trained();
  const near = lx.similarity('vault', 'encryption').score;
  const far  = lx.similarity('vault', 'compost').score;
  assert.ok(near > far * 2,
    'vault~encryption ' + near.toFixed(3) + ' must clearly exceed vault~compost ' + far.toFixed(3));
});

t('neighbours of a word are its own topic, with no labels given', () => {
  const lx = trained();
  const n = lx.neighbours('compost', 8);
  const words = n.words.map(w => w.word);
  const gardenish = words.filter(w => ['soil','water','garden','tomato','plants','seedlings','beds','bed','morning','summer','sun','grow','deeper','alone','holds','feeds'].includes(w));
  assert.ok(gardenish.length >= 3, 'expected garden words, got: ' + words.join(', '));
  assert.ok(!words.slice(0, 4).includes('ciphertext'), 'must not pull in the other topic first');
});

t('PPMI beats raw frequency — a common word does not become everyone\u2019s neighbour', () => {
  const lx = trained();
  // "the" is filtered, but "header" is frequent within one topic only.
  const vh = lx.vector('header');
  assert.ok(vh, 'header should be vectorable');
  assert.ok(!vh.has('compost'), 'a frequent word must not acquire the other topic as context');
});

// ── Honesty about maturity ─────────────────────────────────────────

t('a young lexicon reports ZERO confidence rather than a plausible number', () => {
  const lx = LX.create();
  VAULT.forEach(s => lx.observe(s));
  const s = lx.similarity('vault', 'encryption');
  assert.strictEqual(s.confidence, 0);
  // Either honest refusal is acceptable: too few observations of the WORDS,
  // or too few observations overall. What matters is that it never returns a
  // confident-looking score from eight sentences.
  assert.ok(/too few observations|below the/.test(s.basis), s.basis);
  assert.ok(s.score === 0 || s.confidence === 0);
});

t('maturity() says what it is currently good for', () => {
  const young = LX.create();
  young.observe('one sentence about the vault');
  assert.ok(/Learning/.test(young.maturity().summary));
  assert.strictEqual(young.maturity().similarityReady, false);

  const old = trained();
  assert.strictEqual(old.maturity().similarityReady, true);
  assert.ok(/Active/.test(old.maturity().summary));
});

t('neighbours are marked PROVISIONAL before the lexicon has seen enough', () => {
  const lx = LX.create();
  for (let i = 0; i < 4; i++) VAULT.forEach(s => lx.observe(s));
  assert.ok(/PROVISIONAL/.test(lx.neighbours('vault').basis));
});

// ── Grammar ────────────────────────────────────────────────────────

t('tag transitions accumulate into productions', () => {
  const lx = LX.create();
  for (let i = 0; i < 20; i++) {
    lx.observe('I am blocked on this again', { tags: ['BLOCK'] });
    lx.observe('the missing piece is unclear', { tags: ['GAP'] });
    lx.observe('it connects to the other thread', { tags: ['REL'] });
  }
  const g = lx.grammar();
  assert.ok(g.mature, g.basis);
  const blockToGap = g.productions.find(p => p.from === 'BLOCK' && p.to === 'GAP');
  assert.ok(blockToGap, 'BLOCK \u2192 GAP should be a learned production');
  assert.ok(blockToGap.probability > 0.8);
});

t('predictNextTag reports its sample size, not just a guess', () => {
  const lx = LX.create();
  lx.observe('stuck', { tags: ['BLOCK'] });
  lx.observe('unclear', { tags: ['GAP'] });
  const p = lx.predictNextTag('BLOCK');
  assert.strictEqual(p.tag, 'GAP');
  assert.ok(/only 1 observation/.test(p.basis), p.basis);
});

t('an unseen tag predicts nothing rather than inventing', () => {
  const lx = trained();
  const p = lx.predictNextTag('NEVER_SEEN');
  assert.strictEqual(p.tag, null);
  assert.strictEqual(p.probability, 0);
});

// ── Ambiguity reduction — the payoff ───────────────────────────────

t('THE PAYOFF: picks "vault" over "fault" from the surrounding words', () => {
  const lx = trained();
  const r = lx.disambiguate(['vault', 'fault'], ['encryption', 'salt', 'header']);
  assert.strictEqual(r.best, 'vault', JSON.stringify(r.ranked));
  assert.ok(r.confidence > 0, r.basis);
});

t('the same pair resolves the OTHER way in the other context', () => {
  const lx = trained();
  lx.observe('the soil has a fault line running under the beds');
  for (let i = 0; i < 10; i++) lx.observe('a fault in the garden soil near the compost beds');
  const r = lx.disambiguate(['vault', 'fault'], ['soil', 'compost', 'garden']);
  assert.strictEqual(r.best, 'fault', JSON.stringify(r.ranked));
});

t('it REFUSES to choose when the context supports neither', () => {
  const lx = trained();
  const r = lx.disambiguate(['vault', 'fault'], ['bicycle', 'saxophone']);
  assert.strictEqual(r.best, null);
  assert.strictEqual(r.confidence, 0);
  assert.ok(/no candidate matches/.test(r.basis));
});

t('a young lexicon refuses to disambiguate at all', () => {
  const lx = LX.create();
  VAULT.forEach(s => lx.observe(s));
  const r = lx.disambiguate(['vault', 'fault'], ['encryption', 'salt']);
  assert.strictEqual(r.confidence, 0, 'must not act on 8 utterances of evidence');
  assert.ok(/PROVISIONAL/.test(r.basis));
});

t('it returns a RANKING and never rewrites anything itself', () => {
  const lx = trained();
  const r = lx.disambiguate(['vault', 'fault'], ['encryption']);
  assert.ok(Array.isArray(r.ranked));
  assert.ok(r.ranked[0].reason, 'every candidate must carry why it scored as it did');
});

// ── Whisper prompt seeding ─────────────────────────────────────────

t('promptSeed returns your distinctive vocabulary, not filler', () => {
  const lx = trained();
  const seed = lx.promptSeed(20);
  assert.ok(seed.includes('vault'));
  assert.ok(seed.includes('compost') || seed.includes('tomato'));
  assert.ok(!seed.some(w => LX.FILLER.has(w)), 'filler must never reach the prompt');
});

// ── Growth ─────────────────────────────────────────────────────────

t('emerging vocabulary is what is NEW and being used in varied company', () => {
  const lx = trained();
  const cutoff = new Date().toISOString();
  for (let i = 0; i < 6; i++) {
    lx.observe('the lattice grammar learns from transcription order', { at: cutoff });
  }
  const e = lx.emerging(cutoff, 10).map(x => x.word);
  assert.ok(e.includes('lattice') || e.includes('grammar'), 'got: ' + e.join(', '));
  assert.ok(!e.includes('vault'), 'vault is old vocabulary, not emerging');
});

t('the vocabulary is bounded — a lifetime of speech does not grow forever', () => {
  const lx = LX.create({ maxVocab: 50, pruneTo: 40 });
  for (let i = 0; i < 200; i++) lx.observe('unique' + i + ' word' + i + ' filler' + i);
  for (let i = 0; i < 30; i++) lx.observe('vault encryption salt header integrity');
  assert.ok(lx.state.counts.size <= 60, 'vocab grew to ' + lx.state.counts.size);
  assert.ok(lx.state.counts.has('vault'), 'pruning must keep what is actually used');
});

// ── Persistence ────────────────────────────────────────────────────

t('serialize → hydrate reproduces the lexicon exactly', () => {
  const a = trained();
  const b = LX.create();
  assert.strictEqual(b.hydrate(a.serialize()), true);
  assert.strictEqual(b.state.totalObservations, a.state.totalObservations);
  assert.strictEqual(b.state.counts.get('vault'), a.state.counts.get('vault'));
  const sa = a.similarity('vault', 'encryption').score;
  const sb = b.similarity('vault', 'encryption').score;
  assert.ok(Math.abs(sa - sb) < 1e-9, 'similarity must survive the round trip');
});

t('hydrate refuses an unknown format version', () => {
  const lx = LX.create();
  assert.strictEqual(lx.hydrate({ v: 99 }), false);
  assert.strictEqual(lx.hydrate(null), false);
});

t('serialization drops the long tail that carries no signal', () => {
  const lx = trained();
  lx.observe('an entirely singular hapax utterance');
  const s = lx.serialize();
  assert.ok(s.counts.hapax === 1 || s.counts.hapax === undefined);
  assert.strictEqual(s.contexts.hapax, undefined, 'a word seen once must not carry a context vector');
});

const fails = results.filter(r => !r.ok);
console.log('\nlexicon: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
