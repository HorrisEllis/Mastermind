'use strict';
// ═══════════════════════════════════════════════════════════════════
// ASSOCIATIVE LATTICE — sessions + persistence
//
// Two things are checked against the real, unmodified source:
//
//   1. modules/lattice/lattice.js — a node ingested while a capture
//      session is active carries that session's id; LATTICE.sessions
//      tracks start/end/nodeCount; latticeSessions() surfaces an
//      "unsessioned" bucket for nodes with none, rather than hiding
//      them; latSave() never touches localStorage (VAULT.spec §2
//      invariant 4 — the earlier build did, and that was the bug).
//
//   2. foundation/vault/mastermind-vault.js — vaultSerialize() reads
//      LATTICE directly and vaultDeserialize() restores it, the same
//      "live object" treatment ALM_STATE/VL_STATE already get. This
//      is asserted against the actual serialize/deserialize source,
//      not a reimplementation of it, so a future edit that forgets
//      the lattice block fails here.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { results.push({ name, ok: false, error: e.message }); console.log('  \u2717 ' + name + '\n      ' + (e.message || '')); }
}

// ── Sandbox: load the real modules/lattice/lattice.js with just enough
// shimmed to run it outside a browser (same approach run-memory-engine
// already uses for modules/memory/engine.js). ─────────────────────────
function makeSandbox() {
  const lsStore = {};
  const busHandlers = {};
  let dirtyCalls = 0;

  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in lsStore ? lsStore[k] : null),
      setItem: (k, v) => { lsStore[k] = String(v); },
      removeItem: (k) => { delete lsStore[k]; },
      key: (i) => Object.keys(lsStore)[i] || null,
      get length() { return Object.keys(lsStore).length; },
    },
    uuid: (() => { let n = 0; return () => 'test-uuid-' + (++n); })(),
    MM_BUS: {
      on: (evt, fn) => { (busHandlers[evt] = busHandlers[evt] || []).push(fn); },
      emit: (evt, data) => { (busHandlers[evt] || []).forEach(fn => fn(data)); },
    },
    vaultDirtySave: () => { dirtyCalls++; },
    document: { addEventListener() {} }, // _latWireBus falls back to this only if MM_BUS is absent
    Date, JSON, Math, Object, Array, String, Set,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'lattice', 'lattice.js'), 'utf8');
  new vm.Script(src, { filename: 'lattice.js' }).runInContext(sandbox);
  sandbox.__lsStore = lsStore;
  sandbox.__dirtyCalls = () => dirtyCalls;
  return sandbox;
}

console.log('\n== modules/lattice/lattice.js — sessions + persistence ==');

t('a node ingested with no active session is unsessioned, not silently dropped or force-grouped', () => {
  const s = makeSandbox();
  const r = s.latticeIngest('canvas.node', 'n1', 'A thought spawned on the canvas');
  assert.ok(r, 'expected a result');
  const node = s.LATTICE.nodes[0];
  assert.strictEqual(node.sessionId, null);
  const sessions = s.latticeSessions();
  const unsessioned = sessions.find(x => x.id === 'unsessioned');
  assert.ok(unsessioned, 'expected a synthetic unsessioned bucket');
  assert.strictEqual(unsessioned.nodeCount, 1);
});

t('mm.capture.session.start opens a session that subsequent nodes attach to', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live', startedAt: '2026-08-20T10:00:00.000Z' });
  s.latticeIngest('voice.utterance', 'u1', 'Spoken during the session');
  s.latticeIngest('voice.utterance', 'u2', 'Said something else too');

  assert.strictEqual(s.LATTICE.sessions.length, 1);
  assert.strictEqual(s.LATTICE.sessions[0].id, 'S1');
  assert.strictEqual(s.LATTICE.sessions[0].nodeCount, 2, 'both nodes ingested while S1 was active should count against it');
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, 'S1');
  assert.strictEqual(s.LATTICE.nodes[1].sessionId, 'S1');

  const nodesForS1 = s.latticeNodesForSession('S1');
  assert.strictEqual(nodesForS1.length, 2);
});

// ── THE ACTUAL FIX: a session is what a recording captured, not
// "whatever else happened to occur while the mic was on" ─────────────

t('THE FIX: a canvas node created while a voice session is active does NOT get swept into it', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live', startedAt: '2026-08-20T10:00:00.000Z' });
  s.latticeIngest('voice.utterance', 'u1', 'Something actually spoken');
  s.latticeIngest('canvas.node', 'n1', 'A node someone dragged onto the canvas mid-recording');

  assert.strictEqual(s.LATTICE.nodes[0].sessionId, 'S1', 'the real speech still attaches');
  assert.strictEqual(s.LATTICE.nodes[1].sessionId, null, 'the canvas node must NOT inherit the voice session');
  assert.strictEqual(s.LATTICE.sessions[0].nodeCount, 1, 'session node count must reflect only what it actually captured');
});

t('THE FIX: an ALM externalization during a live session stays unsessioned', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live' });
  s.latticeIngest('alm.delta', 'd1', 'A cognitive function logged while recording happened to be on');
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, null);
});

t('THE FIX: an AI exchange auto-captured via mmCapture() default kind (alm.externalize) during a session stays unsessioned', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live' });
  s.latticeIngest('alm.externalize', 'ai1', 'An AI reply captured automatically, unrelated to the recording');
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, null);
});

t('THE FIX: a Horizon seed/commitment during a live session stays unsessioned', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live' });
  s.latticeIngest('horizon.seed', 'h1', 'A plan seeded while recording happened to be active');
  s.latticeIngest('horizon.commit', 'h2', 'If X then Y');
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, null);
  assert.strictEqual(s.LATTICE.nodes[1].sessionId, null);
});

t('capture.speech and capture.gap (the actual audio-pipeline kinds) still attach to a session, same as voice.utterance', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live' });
  s.latticeIngest('capture.speech', 'c1', 'A segment released by the transcription queue');
  s.latticeIngest('capture.gap', 'c2', 'unreadable audio marker');
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, 'S1');
  assert.strictEqual(s.LATTICE.nodes[1].sessionId, 'S1');
});

t('a mixed real session: voice + a stray canvas node + more voice — only the voice nodes count toward it', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live' });
  s.latticeIngest('voice.utterance', 'u1', 'First real thing said');
  s.latticeIngest('canvas.node', 'n1', 'Unrelated canvas activity');
  s.latticeIngest('voice.utterance', 'u2', 'Second real thing said');
  s.MM_BUS.emit('mm.capture.session.end', { id: 'S1' });

  assert.strictEqual(s.LATTICE.sessions[0].nodeCount, 2, 'only the two voice.utterance nodes should count');
  const forSession = s.latticeNodesForSession('S1');
  assert.strictEqual(forSession.length, 2);
  assert.ok(forSession.every(n => n.kind === 'voice.utterance'));
});

t('a caller threading sessionId through meta.extra for a non-eligible kind is also ignored, not just the active-session path', () => {
  const s = makeSandbox();
  // No active session at all here — testing the OTHER branch (the
  // extra.sessionId fallback capture-bridge historically used).
  s.latticeIngest('canvas.node', 'n1', 'Someone threading a stale sessionId through extra', { extra: { sessionId: 'S-FROM-ELSEWHERE' } });
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, null, 'the fallback path must respect eligibility too, not just the live-session path');
});

t('capture.speech/capture.gap still respect the extra.sessionId fallback when there is no globally active session', () => {
  const s = makeSandbox();
  s.latticeIngest('capture.speech', 'c1', 'a segment released after the session UI already moved on', { extra: { sessionId: 'S-LATE' } });
  assert.strictEqual(s.LATTICE.nodes[0].sessionId, 'S-LATE');
});

t('mm.capture.session.end closes the session and later nodes fall back to unsessioned', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S2', kind: 'live', startedAt: '2026-08-20T10:00:00.000Z' });
  s.latticeIngest('voice.utterance', 'u1', 'Inside the session');
  s.MM_BUS.emit('mm.capture.session.end', { id: 'S2', endedAt: '2026-08-20T10:05:00.000Z' });
  s.latticeIngest('canvas.node', 'n1', 'After the session ended');

  const sess = s.LATTICE.sessions.find(x => x.id === 'S2');
  assert.ok(sess);
  assert.strictEqual(sess.endedAt, '2026-08-20T10:05:00.000Z');
  assert.strictEqual(sess.nodeCount, 1, 'only the node ingested while the session was open counts');

  const after = s.LATTICE.nodes.find(n => n.sourceId === 'n1');
  assert.strictEqual(after.sessionId, null, 'a node ingested after the session ended must not attach to it');
});

t('two sessions in sequence stay separate — nodes never bleed from one into the next', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'A', kind: 'live', startedAt: '2026-08-20T09:00:00.000Z' });
  s.latticeIngest('voice.utterance', 'a1', 'First session, first thing');
  s.MM_BUS.emit('mm.capture.session.end', { id: 'A', endedAt: '2026-08-20T09:10:00.000Z' });

  s.MM_BUS.emit('mm.capture.session.start', { id: 'B', kind: 'live', startedAt: '2026-08-20T09:30:00.000Z' });
  s.latticeIngest('voice.utterance', 'b1', 'Second session, first thing');
  s.latticeIngest('voice.utterance', 'b2', 'Second session, second thing');

  assert.strictEqual(s.latticeNodesForSession('A').length, 1);
  assert.strictEqual(s.latticeNodesForSession('B').length, 2);
  const sessions = s.latticeSessions();
  assert.strictEqual(sessions.find(x => x.id === 'A').nodeCount, 1);
  assert.strictEqual(sessions.find(x => x.id === 'B').nodeCount, 2);
});

t('latticeSessions() lists newest session first', () => {
  const s = makeSandbox();
  s.MM_BUS.emit('mm.capture.session.start', { id: 'OLD', kind: 'live', startedAt: '2026-08-01T00:00:00.000Z' });
  s.MM_BUS.emit('mm.capture.session.end', { id: 'OLD', endedAt: '2026-08-01T00:05:00.000Z' });
  s.MM_BUS.emit('mm.capture.session.start', { id: 'NEW', kind: 'live', startedAt: '2026-08-20T00:00:00.000Z' });
  const ids = s.latticeSessions().map(x => x.id);
  assert.strictEqual(ids[0], 'NEW');
  assert.ok(ids.includes('OLD'));
});

t('latSave() never writes to localStorage — the vault is the only store (VAULT.spec §2 invariant 4)', () => {
  const s = makeSandbox();
  s.latticeIngest('canvas.node', 'n1', 'Something worth keeping');
  assert.strictEqual(Object.keys(s.__lsStore).length, 0, 'lattice.js must not write mm_lattice_v1 or anything else to localStorage');
  assert.ok(s.__dirtyCalls() > 0, 'expected vaultDirtySave to be called instead, so the vault autosave picks the change up');
});

console.log('\n== foundation/vault/mastermind-vault.js — lattice wiring ==');

t('vaultSerialize() reads LATTICE directly into modules.lattice', () => {
  const src = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');
  const fnStart = src.indexOf('function vaultSerialize()');
  assert.ok(fnStart > -1, 'vaultSerialize() not found');
  const fnEnd = src.indexOf('function vaultDeserialize(');
  assert.ok(fnEnd > fnStart, 'vaultDeserialize() not found after vaultSerialize()');
  const body = src.slice(fnStart, fnEnd);
  assert.ok(/lattice:\s*typeof LATTICE/.test(body), 'expected modules.lattice to read from the live LATTICE object');
  assert.ok(/LATTICE\.nodes/.test(body) && /LATTICE\.edges/.test(body) && /LATTICE\.sessions/.test(body),
    'expected nodes, edges and sessions all to be captured');
});

t('vaultDeserialize() restores LATTICE.nodes/.edges/.sessions from m.lattice', () => {
  const src = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');
  const fnStart = src.indexOf('function vaultDeserialize(');
  assert.ok(fnStart > -1, 'vaultDeserialize() not found');
  // Bounded scan: just needs to be somewhere in the deserializer, not the whole file.
  const body = src.slice(fnStart, fnStart + 20000);
  assert.ok(/m\.lattice/.test(body), 'expected vaultDeserialize to read data.modules.lattice');
  assert.ok(/LATTICE\.nodes\s*=/.test(body), 'expected LATTICE.nodes to be restored');
  assert.ok(/LATTICE\.edges\s*=/.test(body), 'expected LATTICE.edges to be restored');
  assert.ok(/LATTICE\.sessions\s*=/.test(body), 'expected LATTICE.sessions to be restored');
});

t('mm_lattice_v1 is registered as an orphan key so pre-vault data gets offered for harvest, not lost', () => {
  const src = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');
  const start = src.indexOf('_ORPHAN_KEYS');
  const block = src.slice(start, start + 500);
  assert.ok(/mm_lattice_v1/.test(block), 'expected mm_lattice_v1 in _ORPHAN_KEYS');
});

console.log('\n== modules/lattice/lattice.js — archive (2026-08-30) ==');
// "Make sure the nodes from the lattice are storing in the vault. We
// need this enforced." LAT_MAX_NODES used to be a hard ceiling that
// .splice()'d the oldest nodes out and threw the result away the moment
// LATTICE.nodes crossed it — a real, confirmed delete, not a vault-
// wiring gap. These prove the replacement: nodes that age out move to
// LATTICE.archive and stay fully reachable, not just technically present
// somewhere in memory.

t('a node that ages past the hot window moves to archive \u2014 it does not vanish', () => {
  const s = makeSandbox();
  s.LAT_HOT_WINDOW = 3; // small window so the test doesn't need 5000 real ingests
  for (let i = 1; i <= 5; i++) s.latticeIngest('canvas.node', 'n' + i, 'thought number ' + i);

  assert.strictEqual(s.LATTICE.nodes.length, 3, 'hot set should be bounded to the window');
  const archivedIds = Object.values(s.LATTICE.archive.shards).flatMap(sh => sh.nodes.map(n => n.text));
  assert.strictEqual(archivedIds.length, 2, 'the two oldest nodes should have moved to archive, not been deleted');
  assert.ok(archivedIds.includes('thought number 1') && archivedIds.includes('thought number 2'));
});

t('every edge belonging to an archived node survives too \u2014 the old code deleted these, this must not', () => {
  const s = makeSandbox();
  s.LAT_HOT_WINDOW = 2;
  const r1 = s.latticeIngest('canvas.node', 'n1', 'first thought about gardens');
  s.latticeIngest('canvas.node', 'n2', 'second thought about gardens too');
  s.latticeIngest('canvas.node', 'n3', 'a third thought, unrelated to plants');

  // r1's node aged into archive by now (window is 2, this is the 3rd
  // ingest). Its sequence edge (n1 -> n2) is the specific thing the old
  // prune's edge-filter would have deleted the moment n1 crossed the
  // line. This must still be there, still pointing at n1's real id.
  const survivingEdge = s.LATTICE.edges.find(e => e.from === r1.id);
  assert.ok(survivingEdge, 'the sequence edge FROM the archived node was dropped \u2014 exactly what the old prune used to do');
});

t('latticeThread still resolves through an archived node \u2014 the chain does not break at the boundary', () => {
  const s = makeSandbox();
  s.LAT_HOT_WINDOW = 2;
  const r1 = s.latticeIngest('voice.utterance', 'u1', 'the beginning of a longer thought');
  s.latticeIngest('voice.utterance', 'u2', 'continuing that same thought');
  s.latticeIngest('voice.utterance', 'u3', 'and continuing further still');
  const r4 = s.latticeIngest('voice.utterance', 'u4', 'the most recent part of the thought');

  const chain = s.latticeThread(r4.id, 10);
  assert.strictEqual(chain.length, 4, 'the thread should include the node that aged into archive, not stop short');
  assert.strictEqual(chain[0].text, 'the beginning of a longer thought');
});

t('a session\u2019s node count stays accurate after some of its nodes age into archive', () => {
  const s = makeSandbox();
  s.LAT_HOT_WINDOW = 2;
  s.MM_BUS.emit('mm.capture.session.start', { id: 'S1', kind: 'live', startedAt: '2026-08-30T09:00:00.000Z' });
  for (let i = 1; i <= 4; i++) s.latticeIngest('voice.utterance', 'u' + i, 'utterance ' + i);

  const nodes = s.latticeNodesForSession('S1');
  assert.strictEqual(nodes.length, 4, 'all four nodes should still be attributed to the session, including the archived ones');
  assert.strictEqual(nodes[0].text, 'utterance 1', 'archived (older) nodes should come first, matching spoken order');
});

t('REGRESSION: the old delete-on-prune code is gone \u2014 LAT_MAX_NODES no longer exists as a hard ceiling', () => {
  const src = fs.readFileSync(path.join(ROOT, 'modules', 'lattice', 'lattice.js'), 'utf8');
  assert.ok(!/LAT_MAX_NODES/.test(src), 'LAT_MAX_NODES should be fully replaced by LAT_HOT_WINDOW + archive');
  assert.ok(/LAT_HOT_WINDOW/.test(src));
  assert.ok(/LATTICE\.archive/.test(src));
});

const failed = results.filter(r => !r.ok).length;
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
if (failed) process.exit(1);
