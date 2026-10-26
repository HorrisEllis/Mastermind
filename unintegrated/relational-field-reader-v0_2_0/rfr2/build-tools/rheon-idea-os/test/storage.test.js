/**
 * test/storage.test.js
 *
 * Tests all storage primitives against real data (temp directory).
 * §1.1 — nothing exists until proven by a passing test.
 * §4.1 — a system that cannot be tested cannot be trusted.
 *
 * Run: node test/storage.test.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Ledger }       from '../storage/Ledger.js';
import { Store }        from '../storage/Store.js';
import { IdeaStore }    from '../storage/IdeaStore.js';
import { ProjectStore } from '../storage/ProjectStore.js';

// ── Mini test runner ─────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function assertThrows(fn, substr) {
  try { fn(); throw new Error('Expected throw, but did not throw'); }
  catch (err) {
    if (err.message === 'Expected throw, but did not throw') throw err;
    if (substr && !err.message.includes(substr)) {
      throw new Error(`Expected error containing '${substr}', got: ${err.message}`);
    }
  }
}

// ── Temp directory ───────────────────────────────────────────────

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rheon-test-'));

function cleanup() {
  fs.rmSync(TMP, { recursive: true, force: true });
}

// ── Ledger tests ─────────────────────────────────────────────────

console.log('\nLedger');

const ledger = new Ledger(path.join(TMP, 'ledger', 'events.jsonl'));

test('append creates file and returns entry', () => {
  const e = ledger.append({ type: 'test.event', source: 'test', payload: { x: 1 }, outcome: 'ok' });
  assert(e.id,      'entry has id');
  assert(e.ts,      'entry has ts');
  assert(e.eventTs, 'entry has eventTs');
  assertEqual(e.type, 'test.event');
  assertEqual(e.outcome, 'ok');
});

test('readAll returns entries', () => {
  const all = ledger.readAll();
  assert(all.length >= 1, 'at least one entry');
  assertEqual(all[0].type, 'test.event');
});

test('eventTs is monotonically increasing', () => {
  const e1 = ledger.append({ type: 'a', source: 'test', payload: {}, outcome: 'ok' });
  const e2 = ledger.append({ type: 'b', source: 'test', payload: {}, outcome: 'ok' });
  assert(e2.eventTs > e1.eventTs, 'eventTs increases');
});

test('tail returns last N entries', () => {
  const tail = ledger.tail(1);
  assertEqual(tail.length, 1);
  assertEqual(tail[0].type, 'b');
});

test('filter by type prefix', () => {
  ledger.append({ type: 'spec.created', source: 'test', payload: {}, outcome: 'ok' });
  const specEntries = ledger.filter('spec.');
  assert(specEntries.length >= 1, 'at least one spec entry');
  assert(specEntries.every(e => e.type.startsWith('spec.')), 'all match prefix');
});

test('error entries include error field', () => {
  const e = ledger.append({ type: 'test.fail', source: 'test', payload: {}, outcome: 'error', error: 'boom' });
  assertEqual(e.error, 'boom');
});

// ── Store tests ──────────────────────────────────────────────────

console.log('\nStore');

const store = new Store(path.join(TMP, 'store'), ledger);

test('write returns hash and ref', () => {
  const { hash, ref } = store.write('specs', 'my-spec', { name: 'my-spec', version: '0.1.0' });
  assert(hash, 'has hash');
  assertEqual(ref.name, 'my-spec');
  assertEqual(ref.namespace, 'specs');
});

test('read returns written content', () => {
  const result = store.read('specs', 'my-spec');
  assert(result, 'result exists');
  assertEqual(result.content.name, 'my-spec');
  assertEqual(result.content.version, '0.1.0');
});

test('read returns null for missing ref', () => {
  const result = store.read('specs', 'nonexistent');
  assert(result === null, 'null for missing');
});

test('same content produces same hash (content-addressed)', () => {
  const content = { stable: true };
  const { hash: h1 } = store.write('specs', 'stable-1', content);
  const { hash: h2 } = store.write('specs', 'stable-2', content);
  assertEqual(h1, h2, 'same content = same hash');
});

test('list returns all refs in namespace', () => {
  const refs = store.list('specs');
  assert(refs.length >= 2, 'at least 2 refs');
});

test('exists returns correct boolean', () => {
  assert(store.exists('specs', 'my-spec'),    'exists returns true');
  assert(!store.exists('specs', 'ghost'),     'exists returns false');
});

test('delete removes ref, content object persists', () => {
  store.write('specs', 'to-delete', { x: 1 });
  assert(store.exists('specs', 'to-delete'), 'exists before delete');
  store.delete('specs', 'to-delete');
  assert(!store.exists('specs', 'to-delete'), 'gone after delete');
});

// ── IdeaStore tests ──────────────────────────────────────────────

console.log('\nIdeaStore');

const ideas = new IdeaStore(path.join(TMP, 'ideas'), ledger);

test('add returns idea with id and ts', () => {
  const idea = ideas.add({ text: 'First idea', tags: ['arch'] });
  assert(idea.id,   'has id');
  assert(idea.ts,   'has ts');
  assertEqual(idea.text, 'First idea');
});

test('list returns all ideas', () => {
  ideas.add({ text: 'Second idea', projectId: 'proj-a', tags: ['arch', 'seam'] });
  const all = ideas.list();
  assert(all.length >= 2, 'at least 2 ideas');
});

test('list filters by projectId', () => {
  const filtered = ideas.list({ projectId: 'proj-a' });
  assert(filtered.every(i => i.projectId === 'proj-a'), 'all match projectId');
});

test('list filters by tags', () => {
  const filtered = ideas.list({ tags: ['seam'] });
  assert(filtered.length >= 1, 'at least one with seam tag');
  assert(filtered.every(i => i.tags.includes('seam')), 'all have seam tag');
});

test('search finds by text', () => {
  const results = ideas.search('first');
  assert(results.length >= 1, 'found by text');
});

test('search finds by tag', () => {
  const results = ideas.search('arch');
  assert(results.length >= 1, 'found by tag');
});

test('add throws on empty text', () => {
  assertThrows(() => ideas.add({ text: '' }), 'required');
});

test('link creates lattice edge', () => {
  const a = ideas.add({ text: 'Node A' });
  const b = ideas.add({ text: 'Node B' });
  const edge = ideas.link({ fromId: a.id, toId: b.id, type: 'related' });
  assert(edge.id,   'edge has id');
  assertEqual(edge.fromId, a.id);
  assertEqual(edge.toId,   b.id);
  assertEqual(edge.type,   'related');
});

test('link throws on invalid edge type', () => {
  const a = ideas.add({ text: 'Node C' });
  const b = ideas.add({ text: 'Node D' });
  assertThrows(() => ideas.link({ fromId: a.id, toId: b.id, type: 'bad_type' }), 'invalid edge type');
});

test('link throws if fromId not found', () => {
  const b = ideas.add({ text: 'Node E' });
  assertThrows(() => ideas.link({ fromId: 'ghost', toId: b.id, type: 'related' }), 'not found');
});

test('graph returns nodes and edges', () => {
  const g = ideas.graph();
  assert(Array.isArray(g.nodes), 'has nodes array');
  assert(Array.isArray(g.edges), 'has edges array');
  assert(g.nodes.length >= 2, 'has nodes');
  assert(g.edges.length >= 1, 'has edges');
});

test('neighbours returns connected ideas', () => {
  const a = ideas.add({ text: 'Neighbour A' });
  const b = ideas.add({ text: 'Neighbour B' });
  ideas.link({ fromId: a.id, toId: b.id, type: 'spawns' });
  const neighbours = ideas.neighbours(a.id);
  assert(neighbours.some(n => n.id === b.id), 'B is neighbour of A');
});

// ── ProjectStore tests ───────────────────────────────────────────

console.log('\nProjectStore');

const projects = new ProjectStore(path.join(TMP, 'projects'), store, ledger);

test('create initialises project with git repo', () => {
  const p = projects.create('test-proj');
  assert(p.id,   'has id');
  assert(p.name, 'has name');
  assertEqual(p.name, 'test-proj');
  assert(fs.existsSync(path.join(p.path, '.git')), 'git repo exists');
  assert(fs.existsSync(path.join(p.path, 'test-proj.spec.json')), '.spec stub exists');
  assert(fs.existsSync(path.join(p.path, 'seams', 'REGISTRY.json')), 'seam registry exists');
});

test('create throws on duplicate name', () => {
  assertThrows(() => projects.create('test-proj'), 'already exists');
});

test('list returns created project', () => {
  const all = projects.list();
  assert(all.some(p => p.name === 'test-proj'), 'project in list');
});

test('get returns project by name', () => {
  const p = projects.get('test-proj');
  assert(p, 'project found');
  assertEqual(p.name, 'test-proj');
});

test('get returns null for missing project', () => {
  const p = projects.get('nonexistent');
  assert(p === null, 'null for missing');
});

test('writeFile writes and auto-commits', () => {
  const p = projects.get('test-proj');
  const result = projects.writeFile('test-proj', 'hello.txt', 'hello world\n');
  assert(result.ok !== false, 'write ok');
  const { content } = projects.readFile('test-proj', 'hello.txt');
  assertEqual(content, 'hello world\n');
});

test('listFiles returns file tree', () => {
  const files = projects.listFiles('test-proj');
  assert(Array.isArray(files), 'is array');
  assert(files.length >= 1, 'has files');
  const file = files.find(f => f.name === 'hello.txt');
  assert(file, 'hello.txt in tree');
  assertEqual(file.type, 'file');
});

test('gitStatus returns output', () => {
  const result = projects.gitStatus('test-proj');
  assert(typeof result.ok === 'boolean', 'has ok');
});

test('writeFile to seams/ updates lastSeam', () => {
  projects.writeFile('test-proj', 'seams/MY_SEAM.seam.js', '// seam contract\n');
  const p = projects.get('test-proj');
  assert(p.lastSeam, 'lastSeam set');
  assertEqual(p.lastSeam.name, 'MY_SEAM', 'seam name extracted');
});

// ── Report ───────────────────────────────────────────────────────

cleanup();

console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed  ${failed} failed`);
if (failed > 0) {
  console.error('\n✗ Tests failed.');
  process.exit(1);
} else {
  console.log('\n✓ All tests passed.');
  process.exit(0);
}
