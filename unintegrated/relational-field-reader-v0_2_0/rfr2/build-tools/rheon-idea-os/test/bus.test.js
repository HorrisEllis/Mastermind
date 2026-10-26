/**
 * test/bus.test.js
 *
 * Tests for RheonBus and all SISO gates.
 * Real storage in temp dir. No mocks in prod. §1.1 §4.1.
 *
 * Run: node test/bus.test.js
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';

import { Stream, Event, Gate } from '../core/index.js';
import { Ledger }        from '../storage/Ledger.js';
import { Store }         from '../storage/Store.js';
import { IdeaStore }     from '../storage/IdeaStore.js';
import { ProjectStore }  from '../storage/ProjectStore.js';

import {
  ProjectCreateGate, ProjectListGate, ProjectGetGate,
  FileListGate, FileReadGate, FileWriteGate,
  SpecWriteGate, SpecReadGate, SpecListGate,
  IdeaAddGate, IdeaListGate, IdeaSearchGate,
  LatticeLinkGate, LatticeGraphGate,
  LedgerTailGate,
} from '../server/gates.js';

// ── Mini runner ───────────────────────────────────────────────────
let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch(err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}

function assertEqual(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error(msg || `Expected ${JSON.stringify(a)} === ${JSON.stringify(b)}`);
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }

// ── Helper: run a gate on a fresh stream, collect emitted events ──
function run(gate, eventType, data) {
  const stream = new Stream();
  const emitted = [];

  // Capture all emissions
  const origEmit = stream.emit.bind(stream);
  stream.emit = (e) => { emitted.push(e); origEmit(e); };

  stream.register(gate);
  stream.emit(new Event(eventType, data));
  return emitted.filter(e => e !== emitted[0]); // exclude the input event
}

// ── Temp storage ──────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'rheon-bus-test-'));
const ledger       = new Ledger(path.join(TMP, 'ledger', 'events.jsonl'));
const store        = new Store(path.join(TMP, 'store'), ledger);
const ideas        = new IdeaStore(path.join(TMP, 'ideas'), ledger);
const projects     = new ProjectStore(path.join(TMP, 'projects'), store, ledger);

// ── Gate tests ────────────────────────────────────────────────────

console.log('\nRheonBus — Gate isolation');

test('Gate transform signature matches command type', () => {
  const gate = ProjectListGate(projects);
  assertEqual(gate.signature, 'cmd.project.list');
});

test('ProjectCreateGate: emits store.project.created on success', () => {
  const gate   = ProjectCreateGate(projects);
  const events = run(gate, 'cmd.project.create', { name: 'test-bus-proj', remote: null, source: 'test' });
  assert(events.length >= 1, 'at least one event emitted');
  assertEqual(events[0].type, 'store.project.created');
  assert(events[0].data.project.name === 'test-bus-proj', 'project name correct');
});

test('ProjectCreateGate: emits store.error on duplicate name', () => {
  const gate   = ProjectCreateGate(projects);
  const events = run(gate, 'cmd.project.create', { name: 'test-bus-proj', remote: null });
  assert(events.some(e => e.type === 'store.error'), 'store.error emitted');
  const err = events.find(e => e.type === 'store.error');
  assert(err.data.origin === 'cmd.project.create', 'origin correct');
});

test('ProjectListGate: emits store.project.listed with array', () => {
  const events = run(ProjectListGate(projects), 'cmd.project.list', {});
  assertEqual(events[0].type, 'store.project.listed');
  assert(Array.isArray(events[0].data.projects), 'projects is array');
  assert(events[0].data.projects.length >= 1, 'at least one project');
});

test('ProjectGetGate: emits store.project.got', () => {
  const events = run(ProjectGetGate(projects), 'cmd.project.get', { name: 'test-bus-proj' });
  assertEqual(events[0].type, 'store.project.got');
  assert(events[0].data.project !== null, 'project found');
});

test('ProjectGetGate: returns null project for unknown name', () => {
  const events = run(ProjectGetGate(projects), 'cmd.project.get', { name: 'ghost' });
  assertEqual(events[0].type, 'store.project.got');
  assertEqual(events[0].data.project, null);
});

test('FileWriteGate: emits store.file.written', () => {
  const events = run(FileWriteGate(projects), 'cmd.file.write', {
    projectName: 'test-bus-proj', filePath: 'hello.txt', content: 'hello\n', source: 'test'
  });
  assertEqual(events[0].type, 'store.file.written');
});

test('FileReadGate: emits store.file.read with content', () => {
  const events = run(FileReadGate(projects), 'cmd.file.read', {
    projectName: 'test-bus-proj', filePath: 'hello.txt'
  });
  assertEqual(events[0].type, 'store.file.read');
  assertEqual(events[0].data.content, 'hello\n');
});

test('FileReadGate: emits store.error for missing file', () => {
  const events = run(FileReadGate(projects), 'cmd.file.read', {
    projectName: 'test-bus-proj', filePath: 'ghost.txt'
  });
  assert(events.some(e => e.type === 'store.error'), 'error emitted for missing file');
});

test('FileListGate: emits store.file.listed', () => {
  const events = run(FileListGate(projects), 'cmd.file.list', {
    projectName: 'test-bus-proj', subPath: ''
  });
  assertEqual(events[0].type, 'store.file.listed');
  assert(Array.isArray(events[0].data.files), 'files is array');
});

test('SpecWriteGate: emits store.spec.written', () => {
  const events = run(SpecWriteGate(store), 'cmd.spec.write', {
    namespace: 'specs', name: 'my-spec', content: { name: 'my-spec', version: '0.1.0' }
  });
  assertEqual(events[0].type, 'store.spec.written');
  assert(events[0].data.result.hash, 'hash present');
});

test('SpecReadGate: emits store.spec.read with content', () => {
  const events = run(SpecReadGate(store), 'cmd.spec.read', {
    namespace: 'specs', name: 'my-spec'
  });
  assertEqual(events[0].type, 'store.spec.read');
  assert(events[0].data.result !== null, 'result found');
});

test('SpecListGate: emits store.spec.listed', () => {
  const events = run(SpecListGate(store), 'cmd.spec.list', { namespace: 'specs' });
  assertEqual(events[0].type, 'store.spec.listed');
  assert(events[0].data.refs.length >= 1, 'at least one spec');
});

test('IdeaAddGate: emits store.idea.added', () => {
  const events = run(IdeaAddGate(ideas), 'cmd.idea.add', {
    text: 'Test idea from gate', projectId: null, tags: ['test']
  });
  assertEqual(events[0].type, 'store.idea.added');
  assertEqual(events[0].data.idea.text, 'Test idea from gate');
});

test('IdeaAddGate: emits store.error on empty text', () => {
  const events = run(IdeaAddGate(ideas), 'cmd.idea.add', { text: '' });
  assert(events.some(e => e.type === 'store.error'), 'error on empty text');
});

test('IdeaListGate: emits store.idea.listed', () => {
  const events = run(IdeaListGate(ideas), 'cmd.idea.list', {});
  assertEqual(events[0].type, 'store.idea.listed');
  assert(events[0].data.ideas.length >= 1);
});

test('IdeaSearchGate: emits store.idea.searched', () => {
  const events = run(IdeaSearchGate(ideas), 'cmd.idea.search', { query: 'gate', projectId: null });
  assertEqual(events[0].type, 'store.idea.searched');
  assert(Array.isArray(events[0].data.ideas));
});

test('LatticeLinkGate: emits store.lattice.linked', () => {
  // Create two ideas first
  const a = ideas.add({ text: 'Node A gate test' });
  const b = ideas.add({ text: 'Node B gate test' });
  const events = run(LatticeLinkGate(ideas), 'cmd.lattice.link', {
    fromId: a.id, toId: b.id, type: 'related'
  });
  assertEqual(events[0].type, 'store.lattice.linked');
  assertEqual(events[0].data.edge.type, 'related');
});

test('LatticeLinkGate: emits store.error on invalid edge type', () => {
  const a = ideas.add({ text: 'Node C' });
  const b = ideas.add({ text: 'Node D' });
  const events = run(LatticeLinkGate(ideas), 'cmd.lattice.link', {
    fromId: a.id, toId: b.id, type: 'bad_type'
  });
  assert(events.some(e => e.type === 'store.error'), 'error on bad type');
});

test('LatticeGraphGate: emits store.lattice.graphed', () => {
  const events = run(LatticeGraphGate(ideas), 'cmd.lattice.graph', { projectId: null });
  assertEqual(events[0].type, 'store.lattice.graphed');
  assert(Array.isArray(events[0].data.graph.nodes), 'nodes array');
  assert(Array.isArray(events[0].data.graph.edges), 'edges array');
});

test('LedgerTailGate: emits store.ledger.tailed', () => {
  const events = run(LedgerTailGate(ledger), 'cmd.ledger.tail', { n: 5 });
  assertEqual(events[0].type, 'store.ledger.tailed');
  assert(events[0].data.entries.length <= 5, 'respects n limit');
});

// ── Bus integration ───────────────────────────────────────────────
console.log('\nRheonBus — integration');

test('Signature collision throws on double-register', () => {
  const stream = new Stream();
  stream.register(ProjectListGate(projects));
  let threw = false;
  try { stream.register(ProjectListGate(projects)); }
  catch { threw = true; }
  assert(threw, 'duplicate signature throws');
});

test('Gate output event lands in pending when unhandled', () => {
  const stream = new Stream();
  stream.register(ProjectListGate(projects));
  stream.emit(new Event('cmd.project.list', {}));
  const sample = stream.sampleHere();
  // store.project.listed has no gate → lands in pending (correct residue)
  assert(sample.pending.some(e => e.type === 'store.project.listed'), 'result in pending');
});

test('Depth-first: gate chain resolves in order', () => {
  const order = [];
  const stream = new Stream();

  class GateA extends Gate {
    constructor() { super('cmd.depthtest.add'); }
    transform(event, s) {
      order.push('add');
      s.emit(new Event('store.depthtest.done', {}));
      order.push('after-add');
    }
  }

  class GateB extends Gate {
    constructor() { super('store.depthtest.done'); }
    transform() { order.push('result'); }
  }

  stream.register(new GateA());
  stream.register(new GateB());
  stream.emit(new Event('cmd.depthtest.add', {}));

  // Depth-first: add → result → after-add
  assertEqual(order.join(','), 'add,result,after-add', 'depth-first ordering holds');
});

// ── Report ────────────────────────────────────────────────────────
fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${'─'.repeat(40)}`);
console.log(`  ${passed} passed  ${failed} failed`);
if (failed > 0) { console.error('\n✗ Tests failed.'); process.exit(1); }
else { console.log('\n✓ All tests passed.'); process.exit(0); }
