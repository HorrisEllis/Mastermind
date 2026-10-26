'use strict';
// modules/memory/engine.js is renderer-side (uses window.X=, localStorage)
// but its actual logic — CRUD, relatedness scoring, recency depth,
// suggestion ranking — is pure enough to run and check for real outside
// a browser. This shims just enough (localStorage, uuid, a no-op
// MM_BUS/MMLog) to load and exercise the real, unmodified file.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log('  \u2717 ' + name + '\n      ' + e.message); }
}

function makeSandbox() {
  const store = {};
  const vaultDirtySaveCalls = [];
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
    vaultDirtySave: (delay) => { vaultDirtySaveCalls.push(delay); },
    uuid: (() => { let n = 0; return () => 'test-uuid-' + (++n); })(),
    Date, JSON, Math, Object, Array, String, Set,
  };
  sandbox.window = sandbox; // real browsers: window === globalThis — window.X = Y must also be reachable as bare X
  sandbox._vaultDirtySaveCalls = vaultDirtySaveCalls;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'memory', 'engine.js'), 'utf8');
  new vm.Script(src, { filename: 'engine.js' }).runInContext(sandbox);
  return sandbox;
}

console.log('\n== modules/memory/engine.js ==');

t('memCreateCompartment creates a real compartment with sane defaults', () => {
  const s = makeSandbox();
  const c = s.memCreateCompartment('Deep Work', 'mode');
  assert.ok(c, 'expected a compartment object back');
  assert.strictEqual(c.name, 'Deep Work');
  assert.strictEqual(c.type, 'mode');
  assert.strictEqual(c.color, s.MEM_TYPES.mode.color);
  assert.strictEqual(c.members.length, 0, 'expected no members on a freshly created compartment');
  assert.strictEqual(s.MEM_STATE.compartments.length, 1);
});

t('unknown type falls back to custom instead of silently accepting garbage', () => {
  const s = makeSandbox();
  const c = s.memCreateCompartment('Whatever', 'not-a-real-type');
  assert.strictEqual(c.type, 'custom');
});

t('empty name is rejected, not silently accepted as an empty compartment', () => {
  const s = makeSandbox();
  const c = s.memCreateCompartment('   ', 'mode');
  assert.strictEqual(c, null);
  assert.strictEqual(s.MEM_STATE.compartments.length, 0);
});

t('memAssign/memUnassign round-trip, and duplicate assignment is a no-op not a duplicate entry', () => {
  const s = makeSandbox();
  const c = s.memCreateCompartment('Work', 'domain');
  assert.strictEqual(s.memAssign(c.id, 'lattice', 'node-1'), true);
  assert.strictEqual(s.memAssign(c.id, 'lattice', 'node-1'), false, 'assigning the same item twice should be a no-op');
  assert.strictEqual(c.members.length, 1);
  assert.strictEqual(s.memUnassign(c.id, 'lattice', 'node-1'), true);
  assert.strictEqual(c.members.length, 0);
});

t('memCompartmentsFor finds every compartment holding a given item — an item can be in more than one', () => {
  const s = makeSandbox();
  const work = s.memCreateCompartment('Work', 'domain');
  const person = s.memCreateCompartment('Alex', 'person');
  s.memAssign(work.id, 'canvas', 'node-x');
  s.memAssign(person.id, 'canvas', 'node-x');
  const found = s.memCompartmentsFor('canvas', 'node-x');
  assert.strictEqual(found.length, 2);
});

t('memRelatedness is 0 for compartments sharing nothing, and rises as shared members become a larger fraction of each (real Jaccard behavior, not a fixed constant)', () => {
  const s = makeSandbox();
  const a = s.memCreateCompartment('A', 'custom');
  const b = s.memCreateCompartment('B', 'custom');
  assert.strictEqual(s.memRelatedness(a.id, b.id), 0, 'no shared members yet');
  // Each side also has its OWN unique members, so the shared fraction
  // (and therefore the Jaccard score) can genuinely move as more get
  // shared — two sets that are already IDENTICAL would sit at the
  // maximum (1.0) after just one shared item and couldn't rise further,
  // which isn't a useful test of "does more sharing score higher".
  s.memAssign(a.id, 'lattice', 'a-only-1');
  s.memAssign(a.id, 'lattice', 'a-only-2');
  s.memAssign(b.id, 'lattice', 'b-only-1');
  s.memAssign(b.id, 'lattice', 'b-only-2');
  s.memAssign(a.id, 'lattice', 'shared-1');
  s.memAssign(b.id, 'lattice', 'shared-1');
  const relOneShared = s.memRelatedness(a.id, b.id);
  assert.ok(relOneShared > 0, 'sharing one member out of several should produce nonzero relatedness');
  s.memAssign(a.id, 'lattice', 'shared-2');
  s.memAssign(b.id, 'lattice', 'shared-2');
  const relTwoShared = s.memRelatedness(a.id, b.id);
  assert.ok(relTwoShared > relOneShared, 'a larger shared fraction should score higher: ' + relOneShared + ' -> ' + relTwoShared);
});

t('memDepthOf: just-touched is ~1, long-dormant decays toward 0 (not a step function)', () => {
  const s = makeSandbox();
  const now = Date.now();
  const fresh = { lastActive: now };
  const weekOld = { lastActive: now - 1000 * 60 * 60 * 24 * 7 }; // exactly one half-life
  const veryOld = { lastActive: now - 1000 * 60 * 60 * 24 * 90 };
  const dFresh = s.memDepthOf(fresh, now);
  const dWeek = s.memDepthOf(weekOld, now);
  const dOld = s.memDepthOf(veryOld, now);
  assert.ok(dFresh > 0.99, 'freshly touched should be ~1, got ' + dFresh);
  assert.ok(Math.abs(dWeek - 0.5) < 0.01, 'exactly one half-life should be ~0.5, got ' + dWeek);
  assert.ok(dOld < 0.01, 'very old should have decayed near 0, got ' + dOld);
  assert.ok(dFresh > dWeek && dWeek > dOld, 'depth must strictly decrease with age');
});

t('memSuggestCompartments ranks by real word/tag overlap, not alphabetically or by creation order', () => {
  const s = makeSandbox();
  s.memCreateCompartment('Fitness', 'domain', { desc: 'running training sleep recovery' });
  s.memCreateCompartment('Finance', 'domain', { desc: 'budget savings investing' });
  const suggestions = s.memSuggestCompartments('went for a long training run today, sleep was rough', ['fitness']);
  assert.ok(suggestions.length >= 1);
  assert.strictEqual(suggestions[0].name, 'Fitness', 'the compartment with real word overlap should rank first, got: ' + JSON.stringify(suggestions));
});

t('memSuggestCompartments returns nothing for text with no real overlap, not a default/fallback guess', () => {
  const s = makeSandbox();
  s.memCreateCompartment('Fitness', 'domain', { desc: 'running training sleep recovery' });
  const suggestions = s.memSuggestCompartments('quarterly tax filing paperwork', []);
  assert.strictEqual(suggestions.length, 0);
});

t('memDeleteCompartment removes it and clears activeId if it was the active one, but never touches its former members\u2019 own data', () => {
  const s = makeSandbox();
  const c = s.memCreateCompartment('Temp', 'custom');
  s.memAssign(c.id, 'lattice', 'n1');
  s.MEM_STATE.activeId = c.id;
  const ok = s.memDeleteCompartment(c.id);
  assert.strictEqual(ok, true);
  assert.strictEqual(s.MEM_STATE.compartments.length, 0);
  assert.strictEqual(s.MEM_STATE.activeId, null);
  // members array lived only on the compartment object itself — deleting
  // the compartment must not have reached into any other store to delete
  // 'n1' itself, since compartments only ever hold pointers.
});

t('SECURITY FIX: memSave() no longer writes plaintext to localStorage — the vault is the only store now', () => {
  const s = makeSandbox();
  s.memCreateCompartment('Persisted', 'system'); // this itself calls memSave() once internally
  s.memSave();
  const raw = s.localStorage.getItem('mm_memory_architecture_v1');
  assert.strictEqual(raw, null, 'compartments must not be written to localStorage in plaintext — this data had no vault path before this fix, and now vault-only is the only copy');
  assert.ok(s._vaultDirtySaveCalls.length >= 1 && s._vaultDirtySaveCalls.every(d => d === 4000), 'memSave() must still trigger a real vault save');
});

t('memLoad() no longer reads from localStorage — it would silently clobber vault-restored data with a stale copy', () => {
  const s = makeSandbox();
  // Simulate a pre-fix leftover sitting in localStorage.
  s.localStorage.setItem('mm_memory_architecture_v1', JSON.stringify({ compartments: [{ id: 'stale', name: 'Old stale copy' }] }));
  s.memLoad();
  assert.strictEqual(s.MEM_STATE.compartments.length, 0, 'memLoad() must not pull the stale localStorage copy back into live state');
  assert.strictEqual(s.MEM_STATE._loaded, true);
});

const fails = results.filter(r => !r.ok).length;
console.log('\nmodules/memory/engine.js: ' + (results.length - fails) + '/' + results.length + ' passed');
process.exitCode = fails ? 1 : 0;
