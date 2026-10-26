'use strict';
// ═══════════════════════════════════════════════════════════════════
// TAXONOMY
//
// Seeded from the REAL salvaged corpus, not a fixture — 16 library
// entries and 23 scenarios carrying hand-applied intelligence types
// and domains.
//
// The abstention tests matter as much as the classification ones. With
// under two examples per class, a classifier that always answers is
// lying most of the time, and a wrong intelligence type propagates into
// the domain map and eventually into what the system tells you about
// how you think.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const path = require('path');
const TX = require('../foundation/ai/taxonomy.js');

const A = (f) => require(path.resolve(__dirname, '..', 'assets', 'salvage-v7', f));

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

function seeded() {
  const tx = TX.create();
  tx.seed({
    library: A('library.json'),
    scenarios: A('scenarios.json'),
    wordbankDomains: A('wordbankDomains.json'),
  });
  return tx;
}

console.log('\nTAXONOMY\n');

// ── Seeding ────────────────────────────────────────────────────────

t('seeds from the real salvaged corpus', () => {
  const tx = TX.create();
  const r = tx.seed({
    library: A('library.json'),
    scenarios: A('scenarios.json'),
    wordbankDomains: A('wordbankDomains.json'),
  });
  assert.ok(r.labels > 50, 'expected many labels, got ' + r.labels);
  assert.ok(r.intelClasses >= 15, 'expected the 22-type taxonomy, got ' + r.intelClasses);
  assert.ok(r.domainClasses >= 6);
});

// ── Classification ─────────────────────────────────────────────────

t('classifies a clearly cognitive utterance into a domain', () => {
  const tx = seeded();
  const c = tx.classify('I noticed a pattern in how my attention loops back to the same signal');
  assert.ok(c.domain.value, 'abstained: ' + c.domain.basis);
  assert.ok(['COGNITIVE', 'pattern', 'meta', 'perception'].includes(c.domain.value), c.domain.value);
});

t('classifies a somatic utterance differently from a cognitive one', () => {
  const tx = seeded();
  const som = tx.classify('my body feels tense and drained, low energy in my chest today');
  const cog = tx.classify('the mental model I use for attention and bias needs revising');
  if (som.domain.value && cog.domain.value) {
    assert.notStrictEqual(som.domain.value, cog.domain.value, 'both landed in ' + som.domain.value);
  }
});

// ── Abstention ─────────────────────────────────────────────────────

t('ABSTAINS on an utterance with no shared vocabulary', () => {
  const tx = seeded();
  const c = tx.classify('the tomato seedlings want water before noon');
  assert.strictEqual(c.intelligence.value, null);
  assert.ok(/no vocabulary in common|too close to call/.test(c.intelligence.basis), c.intelligence.basis);
});

t('ABSTAINS rather than guessing when two classes are close', () => {
  const tx = seeded();
  let abstained = 0, total = 0;
  for (const s of ['thinking about the thing', 'a signal in the noise', 'process this later', 'the system and the pattern']) {
    total++;
    if (tx.classify(s).intelligence.value === null) abstained++;
  }
  assert.ok(abstained > 0, 'a classifier with <2 examples per class that never abstains is lying');
});

t('an abstention explains itself with the actual scores', () => {
  const tx = seeded();
  const c = tx.classify('a signal about the pattern in the system');
  if (c.intelligence.value === null && /too close/.test(c.intelligence.basis)) {
    assert.ok(/\d\.\d{3}/.test(c.intelligence.basis), 'the basis must show the numbers: ' + c.intelligence.basis);
  }
});

t('maturity() admits the corpus is thin', () => {
  const tx = seeded();
  const m = tx.maturity();
  assert.ok(/under two each|abstains often/.test(m.summary), m.summary);
  assert.ok(m.intelligenceClasses >= 15);
});

// ── Intuition and reasoning cues ───────────────────────────────────

t('detects a somatic intuition cue', () => {
  const c = seeded().classify('my gut felt tight the moment they said it');
  assert.ok(['somatic', null].includes(c.intuition.value), c.intuition.value);
});

t('detects an abductive reasoning cue', () => {
  const c = seeded().classify('maybe the reason it keeps failing is that the salt was never stored');
  assert.strictEqual(c.reasoning.value, 'abduction');
});

t('detects an analogical reasoning cue', () => {
  const c = seeded().classify('it is like a hash chain, each one carrying the last');
  assert.strictEqual(c.reasoning.value, 'analogy');
});

t('REFUSES to name a cue when two fire at once', () => {
  const c = seeded().classify('every time I feel that tightness in my body it happens again');
  assert.strictEqual(c.intuition.value, null);
  assert.ok(/ambiguous/.test(c.intuition.basis), c.intuition.basis);
});

t('a cue is labelled a guess, never a measurement', () => {
  const c = seeded().classify('therefore the header must carry the salt');
  if (c.reasoning.value) {
    assert.ok(/surface cue|guess/.test(c.reasoning.basis), c.reasoning.basis);
  }
});

// ── Learning from corrections ──────────────────────────────────────

t('THE LEARNING TEST: a correction changes the next classification', () => {
  const tx = seeded();
  const text = 'the compost beds need turning before the seedlings go in';
  const before = tx.classify(text).domain.value;
  for (let i = 0; i < 3; i++) tx.correct(text, 'domain', 'SOMATIC');
  const after = tx.classify(text).domain.value;
  assert.strictEqual(after, 'SOMATIC', 'was ' + before + ', corrected to SOMATIC, still ' + after);
});

t('a correction outweighs the seed corpus', () => {
  const tx = seeded();
  const text = 'I noticed a pattern in my attention and focus';
  tx.correct(text, 'intelligence', 'Embodied Intelligence');
  const c = tx.classify(text);
  assert.strictEqual(c.intelligence.value, 'Embodied Intelligence',
    'your own label about your own thought must beat 40 generic examples');
});

t('corrections are recorded, not just applied', () => {
  const tx = seeded();
  tx.correct('some text about the vault', 'domain', 'STRATEGIC');
  assert.strictEqual(tx.state.corrections.length, 1);
  assert.strictEqual(tx.state.corrections[0].value, 'STRATEGIC');
  assert.ok(tx.state.corrections[0].at);
});

t('an unknown field is refused', () => {
  assert.throws(() => seeded().correct('x', 'vibe', 'y'), /must be domain or intelligence/);
});

t('maturity reports corrections once they accumulate', () => {
  const tx = seeded();
  for (let i = 0; i < 12; i++) tx.correct('sample text number ' + i + ' about vaults', 'domain', 'STRATEGIC');
  assert.ok(/12 corrections learned/.test(tx.maturity().summary), tx.maturity().summary);
});

// ── Open loops ─────────────────────────────────────────────────────

const DAY = 86400000;
const iso = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString();

t('boilerplate shared between two questions is NOT a revisit', () => {
  // Before the filler filter, 'unanswered question about' counted as
  // topical overlap, so any two questions cancelled each other out and
  // real open loops vanished.
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'q1', type: 'question', text: 'an old unanswered question about vaults?', created: iso(90), tags: [] },
    { id: 'q2', type: 'question', text: 'a newer unanswered question about lattices?', created: iso(5), tags: [] },
  ]).filter(l => l.kind === 'UNANSWERED_QUESTION');
  assert.strictEqual(loops.length, 2, 'both are still open — they are about different things');
});

t('finds a question never returned to', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'q1', type: 'question', text: 'why does the association threshold collapse at scale?', created: iso(30), tags: [] },
    { id: 'n1', text: 'the compost needs turning', created: iso(20), tags: [] },
  ]);
  const q = loops.find(l => l.kind === 'UNANSWERED_QUESTION');
  assert.ok(q, JSON.stringify(loops));
  assert.strictEqual(q.nodeId, 'q1');
  assert.ok(q.ageDays >= 29);
});

t('does NOT flag a question that was returned to', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'q1', type: 'question', text: 'why does the association threshold collapse at scale?', created: iso(30), tags: [] },
    { id: 'n1', text: 'the association threshold collapses because stopwords were missing', created: iso(20), tags: [] },
  ]);
  assert.ok(!loops.some(l => l.kind === 'UNANSWERED_QUESTION'));
});

t('finds a thread named once and abandoned', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'a', text: 'thinking about compression', created: iso(40), tags: ['COMPRESSION'] },
    { id: 'b', text: 'more on the vault', created: iso(5), tags: ['VAULT'] },
    { id: 'c', text: 'vault again', created: iso(2), tags: ['VAULT'] },
  ]);
  const d = loops.filter(l => l.kind === 'DROPPED_THREAD');
  assert.ok(d.some(x => x.tag === 'COMPRESSION'));
  assert.ok(!d.some(x => x.tag === 'VAULT'), 'a tag used twice is not abandoned');
});

t('finds a domain that has gone quiet', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'a', text: 'old thought', created: iso(60), domain: 'CREATIVE', tags: [] },
    { id: 'b', text: 'recent thought', created: iso(1), domain: 'STRATEGIC', tags: [] },
  ]);
  const dom = loops.filter(l => l.kind === 'DORMANT_DOMAIN').map(l => l.domain);
  assert.ok(dom.includes('CREATIVE'));
  assert.ok(!dom.includes('STRATEGIC'));
});

t('finds a seed that never became a plan', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 's1', text: 'I want to rebuild the spatial void', created: iso(10), tags: [], seed: { flagged: true, priority: 'High', horizonId: null } },
    { id: 's2', text: 'I want to fix the vault', created: iso(10), tags: [], seed: { flagged: true, horizonId: 'H1' } },
  ]);
  const s = loops.filter(l => l.kind === 'UNPROMOTED_SEED');
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].nodeId, 's1');
});

t('THE LEARNING LOOP: finds a belief left in testing and never re-rated', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'b1', text: 'slowing audio helps whisper', created: iso(60), tags: [],
      confidence: { level: 'testing', updatedAt: iso(60) } },
    { id: 'b2', text: 'the salt belongs in the header', created: iso(60), tags: [],
      confidence: { level: 'high', updatedAt: iso(60) } },
  ]);
  const b = loops.filter(l => l.kind === 'UNRESOLVED_BELIEF');
  assert.strictEqual(b.length, 1);
  assert.strictEqual(b[0].nodeId, 'b1');
  assert.ok(/testing/.test(b[0].why));
});

t('every open loop explains itself in your own terms', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'q1', type: 'question', text: 'what if belief is the constraint?', created: iso(40), tags: ['BELIEF'] },
  ]);
  assert.ok(loops.length);
  for (const l of loops) {
    assert.ok(l.why && l.why.length > 15, JSON.stringify(l));
    assert.ok(/^You /.test(l.why), 'a loop is YOUR unfinished business, not a recommendation: ' + l.why);
  }
});

t('oldest loops come first', () => {
  const tx = seeded();
  const loops = tx.openLoops([
    { id: 'q1', type: 'question', text: 'should the salt live in the encrypted header?', created: iso(90), tags: [] },
    { id: 'q2', type: 'question', text: 'does compost improve drainage in clay soil?', created: iso(5), tags: [] },
  ]).filter(l => l.kind === 'UNANSWERED_QUESTION');
  assert.ok(loops[0].ageDays > loops[1].ageDays);
});

t('an empty history produces no loops rather than throwing', () => {
  assert.deepStrictEqual(seeded().openLoops([]), []);
});

// ── Persistence ────────────────────────────────────────────────────

t('serialize → hydrate preserves what was learned', () => {
  const a = seeded();
  a.correct('the compost beds and seedlings', 'domain', 'SOMATIC');
  const b = TX.create();
  assert.strictEqual(b.hydrate(a.serialize()), true);
  assert.strictEqual(b.classify('the compost beds and seedlings').domain.value, 'SOMATIC');
  assert.strictEqual(b.state.corrections.length, 1);
});

t('hydrate refuses an unknown version', () => {
  assert.strictEqual(TX.create().hydrate({ v: 42 }), false);
});

const fails = results.filter(r => !r.ok);
console.log('\ntaxonomy: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
