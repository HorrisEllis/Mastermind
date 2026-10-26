'use strict';
// ═══════════════════════════════════════════════════════════════════
// COHERENCE — stem-aware overlap, negation/opposite detection untouched
//
// cohFindContradictions()/cohFindRipples() gate on topical overlap
// before polarity or shared tags even get checked — computed with
// exact-word Jaccard, same limitation lattice.js's association edges
// had: "confident" and "confidence" share zero exact words, so two
// genuinely contradictory statements about the same thing, phrased
// with different word forms, could fall below COH_CONTRA_MIN_OVERLAP
// and never get compared for polarity at all — a real contradiction
// silently missed, not flagged and dismissed.
//
// The fix only touches the OVERLAP gate. Negation counting
// (cohPolarity) and the fixed opposite-word pairs (cohOppositePair)
// still run on exact word forms — stemming "never"/"always" against
// COH_NEGATIONS/COH_OPPOSITES' fixed lookup lists would be a
// regression, not an improvement, so this proves those are unchanged
// alongside proving the overlap fix works.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const TextAnalysis = require(path.join(ROOT, 'modules', 'lattice', 'text-analysis.js'));

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { results.push({ name, ok: false }); console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      ')); }
}
function run() {
  const fails = results.filter(r => !r.ok).length;
  console.log('\ncoherence-stem-aware: ' + (results.length - fails) + '/' + results.length + ' passed');
  process.exitCode = fails ? 1 : 0;
}

function makeSandbox() {
  const sandbox = {
    console,
    TextAnalysis,
    VL_STOPWORDS: new Set(['this', 'that', 'with', 'from', 'have', 'about', 'been', 'were', 'they', 'their']),
    MM_BUS: undefined,
    MMLog: { info() {}, warn() {}, error() {} },
    document: { addEventListener() {} },
    setInterval: () => 1,
    clearInterval: () => {},
    Date, JSON, Math, Object, Array, String, Set,
  };
  sandbox.window = sandbox; // window.X = Y must also be reachable as bare X, same as run-memory-engine.test.js
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'lattice', 'coherence.js'), 'utf8');
  new vm.Script(src, { filename: 'coherence.js' }).runInContext(sandbox);
  return sandbox;
}

function node(id, text, kind, tags) {
  return { id, text, kind: kind || 'voice.utterance', tags: tags || [], ts: Date.now() };
}

console.log('\nCOHERENCE — stem-aware overlap\n');

t('THE FIX: "I feel confident about this" vs "my confidence is gone" are recognized as the same subject via stemming', () => {
  const s = makeSandbox();
  const overlap = s._cohOverlap('I feel confident about this project', 'my confidence in this project is completely gone');
  assert.ok(overlap > 0, 'stemmed overlap must find SOME relation where exact-word overlap on "confident" vs "confidence" would find none');
});

t('THE FIX: a contradiction phrased with a different word form now clears the overlap gate', () => {
  const s = makeSandbox();
  const overlap = s._cohOverlap('I have no confidence this plan will work at all', 'I am extremely confident this plan will work');
  assert.ok(overlap >= 0.22, 'overlap must clear COH_CONTRA_MIN_OVERLAP for this pair now, got ' + overlap);
});

t('unrelated topics still correctly show low overlap — the fix does not just inflate everything', () => {
  const s = makeSandbox();
  const overlap = s._cohOverlap('grocery shopping list for the weekend', 'quarterly financial projections meeting');
  assert.ok(overlap < 0.15, 'unrelated topics must still score low, got ' + overlap);
});

t('REGRESSION: cohPolarity still correctly detects negation on exact words, untouched by the stemming fix', () => {
  const s = makeSandbox();
  assert.strictEqual(s.cohPolarity('I will not do this'), -1);
  assert.strictEqual(s.cohPolarity('I will do this'), 1);
  assert.strictEqual(s.cohPolarity('I will never never do this'), 1, 'double negative reads as affirmative, same as before');
});

t('REGRESSION: cohOppositePair still finds fixed opposite-word pairs on exact words', () => {
  const s = makeSandbox();
  const pair = s.cohOppositePair(['i', 'always', 'do', 'this'], ['i', 'never', 'do', 'this']);
  assert.deepStrictEqual(Array.from(pair), ['always', 'never']);
});

t('REGRESSION: cohFindContradictions still requires topical overlap AND a polarity flip — overlap alone is not enough', () => {
  const s = makeSandbox();
  const nodes = [node('n1', 'I am confident about the project timeline', 'voice.utterance')];
  const result = s.cohFindContradictions('I am confident about the project timeline too', nodes);
  assert.strictEqual(result.length, 0, 'matching polarity on the same subject is agreement, not contradiction');
});

t('cohFindContradictions genuinely finds a real contradiction end to end (overlap + polarity flip together)', () => {
  const s = makeSandbox();
  const nodes = [node('n1', 'I always trust my instincts on this', 'voice.utterance')];
  const result = s.cohFindContradictions('I never trust my instincts on this', nodes);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].against, 'n1');
  assert.ok(/always.*never|never.*always/.test(result[0].reason));
});

t('cohFindRipples finds a ripple via stem-aware overlap against a goal-bearing node, not just exact-word or shared tags', () => {
  const s = makeSandbox();
  const goalNode = node('h1', 'building confidence and preparation for public speaking presentations', 'horizon.commit');
  const result = s.cohFindRipples('feeling much more confident and prepared after that presentation went well', [], [goalNode]);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].toward, 'h1');
});

t('cohFindRipples still finds ripples via shared tags even with zero text overlap (unchanged path)', () => {
  const s = makeSandbox();
  const goalNode = node('h1', 'Completely unrelated wording here', 'horizon.seed', ['fitness']);
  const result = s.cohFindRipples('also completely different words', ['fitness'], [goalNode]);
  assert.strictEqual(result.length, 1, 'shared tags alone must still trigger a ripple, independent of the overlap fix');
});

run();
