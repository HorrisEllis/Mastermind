/**
 * ledger.test.js
 * @version 1.0.0
 *
 * Full coverage:
 *   createLedger         — paired API, observer forwarding, convenience methods
 *   createUpgradeLedger  — commit, replay, query, tail, since, versionHistory
 *   createIdeaLedger     — record, close, query, flowMetrics, bottleneck signal
 *   promoteIdea          — gate, proof, atomicity, status transitions
 *   validateSeparation   — L-1, L-2 type checks
 *   LedgerError          — fields, message format
 *   Observer API         — on/off, event routing, error isolation
 *   Negation             — every L-1/L-2/L-3/L-4 violation path
 *   Cross-project        — domain/project filtering
 *   E2E                  — full lifecycle, multi-project, bottleneck detection
 */

import {
  suite, test, assert, assertEqual, assertNotEqual, assertNull,
  assertNotNull, assertThrows, assertIncludes, assertUUID,
  assertGt, assertGte, assertFrozen, report, reset,
} from './runner.js';

import {
  createLedger,
  createUpgradeLedger,
  createIdeaLedger,
  promoteIdea,
  validateSeparation,
  LedgerError,
  IDEA_STATUS,
  UPGRADE_TYPE,
  VERSION,
} from '../src/index.js';

reset();

// ── Helpers ───────────────────────────────────────────────────────────────────

const ul = () => createUpgradeLedger();
const il = () => createIdeaLedger();

const ideaEntry = (o = {}) => ({
  description: 'Test idea description',
  hypothesis:  'This might improve things',
  tags:        ['test'],
  ...o,
});

const upgradeEntry = (o = {}) => ({
  type:        UPGRADE_TYPE.PASSING_TEST,
  description: 'All tests passing',
  proof:       { testFile: 'test/ledger.test.js' },
  version:     '1.0.0',
  ...o,
});

// ── VERSION & constants ───────────────────────────────────────────────────────

suite('ledger.constants', () => {
  test('VERSION is a string',              () => assert(typeof VERSION === 'string' && VERSION.length > 0));
  test('IDEA_STATUS frozen',               () => assertFrozen(IDEA_STATUS));
  test('UPGRADE_TYPE frozen',              () => assertFrozen(UPGRADE_TYPE));
  test('IDEA_STATUS has 4 keys',           () => assertEqual(Object.keys(IDEA_STATUS).length, 4));
  test('UPGRADE_TYPE has 10 keys',         () => assertEqual(Object.keys(UPGRADE_TYPE).length, 10));
  test('UNRESOLVED value correct',         () => assertEqual(IDEA_STATUS.UNRESOLVED, 'unresolved'));
  test('PROMOTED value correct',           () => assertEqual(IDEA_STATUS.PROMOTED,   'promoted'));
  test('REJECTED value correct',           () => assertEqual(IDEA_STATUS.REJECTED,   'rejected'));
  test('ABANDONED value correct',          () => assertEqual(IDEA_STATUS.ABANDONED,  'abandoned'));
  test('PASSING_TEST value correct',       () => assertEqual(UPGRADE_TYPE.PASSING_TEST, 'passing_test'));
  test('SECURITY_FIX present',             () => assert('SECURITY_FIX' in UPGRADE_TYPE));
  test('PHASE_COMPLETE present',           () => assert('PHASE_COMPLETE' in UPGRADE_TYPE));
});

// ── LedgerError ───────────────────────────────────────────────────────────────

suite('ledger.LedgerError', () => {
  test('is Error instance',                () => assert(new LedgerError('L-1', 'x') instanceof Error));
  test('name is LedgerError',              () => assertEqual(new LedgerError('L-1', 'x').name, 'LedgerError'));
  test('message contains invariant ID',    () => assert(new LedgerError('L-4', 'msg').message.includes('L-4')));
  test('message contains text',            () => assert(new LedgerError('L-2', 'gate skip').message.includes('gate skip')));
  test('invariantId field set',            () => assertEqual(new LedgerError('L-3', 'x').invariantId, 'L-3'));
  test('context stored',                   () => { const ctx = { id: 'abc' }; assertEqual(new LedgerError('L-1', 'x', ctx).context, ctx); });
  test('ts is recent',                     () => assertGte(new LedgerError('L-1', 'x').ts, Date.now() - 1000));
  test('uuid is UUID v4',                  () => assertUUID(new LedgerError('L-1', 'x').uuid));
  test('each error gets unique uuid',      () => assertNotEqual(new LedgerError('L-1','x').uuid, new LedgerError('L-1','x').uuid));
});

// ── createUpgradeLedger ───────────────────────────────────────────────────────

suite('ledger.UpgradeLedger.identity', () => {
  test('type is "upgrade"',                () => assertEqual(ul().type, 'upgrade'));
  test('id is UUID v4',                    () => assertUUID(ul().id));
  test('length starts 0',                  () => assertEqual(ul().length, 0));
  test('two ledgers different IDs',        () => assertNotEqual(ul().id, ul().id));
  test('createdTs recent',                 () => assertGte(ul().createdTs, Date.now() - 1000));
  test('opts.name stored',                 () => assertEqual(createUpgradeLedger({ name: 'my-ul' }).name, 'my-ul'));
  test('opts.project stored',              () => assertEqual(createUpgradeLedger({ project: 'NEXUS' }).project, 'NEXUS'));
});

suite('ledger.UpgradeLedger.commit', () => {
  test('returns record with UUID id',      () => assertUUID(ul().commit(upgradeEntry()).id));
  test('increments length',                () => { const u = ul(); u.commit(upgradeEntry()); assertEqual(u.length, 1); });
  test('record is frozen',                 () => assertFrozen(ul().commit(upgradeEntry())));
  test('ledgerType is "upgrade"',          () => assertEqual(ul().commit(upgradeEntry()).ledgerType, 'upgrade'));
  test('entryType stored',                 () => assertEqual(ul().commit(upgradeEntry()).entryType, UPGRADE_TYPE.PASSING_TEST));
  test('description stored',               () => assertEqual(ul().commit(upgradeEntry({ description: 'specific desc' })).description, 'specific desc'));
  test('proof frozen',                     () => assertFrozen(ul().commit(upgradeEntry()).proof));
  test('proof.testFile stored',            () => assertEqual(ul().commit(upgradeEntry()).proof.testFile, 'test/ledger.test.js'));
  test('version stored',                   () => assertEqual(ul().commit(upgradeEntry({ version: '2.0.0' })).version, '2.0.0'));
  test('tags frozen',                      () => assertFrozen(ul().commit(upgradeEntry({ tags: ['x'] })).tags));
  test('tags stored',                      () => assertIncludes(ul().commit(upgradeEntry({ tags: ['ci', 'core'] })).tags, 'ci'));
  test('domain stored',                    () => assertEqual(ul().commit(upgradeEntry({ domain: 'sentinel' })).domain, 'sentinel'));
  test('project stored on record',         () => assertEqual(ul().commit(upgradeEntry({ project: 'NEXUS' })).project, 'NEXUS'));
  test('project falls back to ledger opts',() => {
    const u = createUpgradeLedger({ project: 'ALK' });
    assertEqual(u.commit(upgradeEntry()).project, 'ALK');
  });
  test('ts is recent',                     () => assertGte(ul().commit(upgradeEntry()).ts, Date.now() - 1000));
  test('meta stored',                      () => assertEqual(ul().commit(upgradeEntry({ meta: { env: 'prod' } })).meta.env, 'prod'));
  test('accepts proof.diffLink',           () => assert(ul().commit(upgradeEntry({ proof: { diffLink: 'github.com/x/diff' } })).id));
  test('accepts proof.metric',             () => assert(ul().commit(upgradeEntry({ proof: { metric: { before: 3, after: 9 } } })).id));
  test('accepts proof.screenshot',         () => assert(ul().commit(upgradeEntry({ proof: { screenshot: 'screens/test.png' } })).id));
  test('accepts proof.logFile',            () => assert(ul().commit(upgradeEntry({ proof: { logFile: 'test.log' } })).id));
  test('multiple commits all stored',      () => {
    const u = ul();
    for (let i = 0; i < 10; i++) u.commit(upgradeEntry({ description: `entry-${i}` }));
    assertEqual(u.length, 10);
  });
});

suite('ledger.UpgradeLedger.commit.negation', () => {
  test('throws without proof',             () => assertThrows(() => ul().commit({ type: UPGRADE_TYPE.BUG_FIX, description: 'x' }), 'L-4'));
  test('throws with empty proof {}',       () => assertThrows(() => ul().commit({ ...upgradeEntry(), proof: {} }), 'L-4'));
  test('throws proof has no evidence',     () => assertThrows(() => ul().commit({ ...upgradeEntry(), proof: { comment: 'trust me' } }), 'L-4'));
  test('throws null proof',                () => assertThrows(() => ul().commit({ ...upgradeEntry(), proof: null }), 'L-4'));
  test('throws ledgerType=idea (L-1)',     () => assertThrows(() => ul().commit({ ledgerType: 'idea', proof: { testFile: 'x' } }), 'L-1'));
});

suite('ledger.UpgradeLedger.query', () => {
  function populated() {
    const u = ul();
    u.commit(upgradeEntry({ type: UPGRADE_TYPE.BUG_FIX,       tags: ['core'], domain: 'nexus',    version: '1.0.1' }));
    u.commit(upgradeEntry({ type: UPGRADE_TYPE.PASSING_TEST,   tags: ['ci'],   domain: 'sentinel', version: '1.0.2' }));
    u.commit(upgradeEntry({ type: UPGRADE_TYPE.PHASE_COMPLETE, tags: ['core'], domain: 'nexus',    version: '1.1.0' }));
    return u;
  }

  test('replay returns all in order',      () => assertEqual(populated().replay().length, 3));
  test('replay returns copies not refs',   () => {
    const u = populated(); const r = u.replay(); r[0].description = 'mutated';
    assertNotEqual(u.replay()[0].description, 'mutated');
  });
  test('findById returns entry',           () => { const u = ul(); const r = u.commit(upgradeEntry()); assertNotNull(u.findById(r.id)); });
  test('findById returns null unknown',    () => assertNull(ul().findById('bogus')));
  test('findByTag core = 2',              () => assertEqual(populated().findByTag('core').length, 2));
  test('findByTag unknown = 0',           () => assertEqual(populated().findByTag('nope').length, 0));
  test('findByType BUG_FIX = 1',          () => assertEqual(populated().findByType(UPGRADE_TYPE.BUG_FIX).length, 1));
  test('findByDomain nexus = 2',          () => assertEqual(populated().findByDomain('nexus').length, 2));
  test('findByDomain sentinel = 1',       () => assertEqual(populated().findByDomain('sentinel').length, 1));
  test('tail(2) returns last 2',          () => assertEqual(populated().tail(2).length, 2));
  test('tail(1) is most recent',          () => assertEqual(populated().tail(1)[0].entryType, UPGRADE_TYPE.PHASE_COMPLETE));
  test('since(ts) filters by ts',         () => {
    const u   = ul();
    const ts  = Date.now();
    u.commit(upgradeEntry({ description: 'after' }));
    assertEqual(u.since(ts).length, 1);
  });
  test('versionHistory returns PHASE_COMPLETE entries', () => {
    const u = populated();
    const vh = u.versionHistory();
    assertEqual(vh.length, 1);
    assertEqual(vh[0].version, '1.1.0');
  });
  test('assertSeparation passes clean ledger', () => { populated().assertSeparation(); assert(true); });
});

// ── createIdeaLedger ──────────────────────────────────────────────────────────

suite('ledger.IdeaLedger.identity', () => {
  test('type is "idea"',                   () => assertEqual(il().type, 'idea'));
  test('id is UUID v4',                    () => assertUUID(il().id));
  test('length starts 0',                  () => assertEqual(il().length, 0));
  test('unresolved starts empty',          () => assertEqual(il().unresolved.length, 0));
  test('opts.name stored',                 () => assertEqual(createIdeaLedger({ name: 'my-il' }).name, 'my-il'));
  test('opts.project stored',              () => assertEqual(createIdeaLedger({ project: 'ALK' }).project, 'ALK'));
});

suite('ledger.IdeaLedger.record', () => {
  test('returns idea with UUID',           () => assertUUID(il().record(ideaEntry()).id));
  test('status is UNRESOLVED',             () => assertEqual(il().record(ideaEntry()).status, IDEA_STATUS.UNRESOLVED));
  test('ledgerType is "idea"',             () => assertEqual(il().record(ideaEntry()).ledgerType, 'idea'));
  test('description stored',               () => assertEqual(il().record(ideaEntry({ description: 'specific' })).description, 'specific'));
  test('hypothesis stored',                () => assertEqual(il().record(ideaEntry({ hypothesis: 'maybe' })).hypothesis, 'maybe'));
  test('domain stored',                    () => assertEqual(il().record(ideaEntry({ domain: 'alk' })).domain, 'alk'));
  test('tags stored',                      () => assertIncludes(il().record(ideaEntry({ tags: ['perf'] })).tags, 'perf'));
  test('parentId stored',                  () => {
    const i = il(); const a = i.record(ideaEntry());
    assertEqual(i.record(ideaEntry({ parentId: a.id })).parentId, a.id);
  });
  test('project falls back to ledger',     () => {
    const i = createIdeaLedger({ project: 'SENTINEL' });
    assertEqual(i.record(ideaEntry()).project, 'SENTINEL');
  });
  test('createdTs recent',                 () => assertGte(il().record(ideaEntry()).createdTs, Date.now() - 1000));
  test('failureMode null on creation',     () => assertNull(il().record(ideaEntry()).failureMode));
  test('length increments',                () => { const i = il(); i.record(ideaEntry()); i.record(ideaEntry()); assertEqual(i.length, 2); });
  test('unresolved grows',                 () => { const i = il(); i.record(ideaEntry()); i.record(ideaEntry()); assertEqual(i.unresolved.length, 2); });
  test('findById retrieves it',            () => { const i = il(); const a = i.record(ideaEntry()); assertNotNull(i.findById(a.id)); });
  test('findById null for unknown',        () => assertNull(il().findById('bogus')));
  test('meta stored',                      () => assertEqual(il().record(ideaEntry({ meta: { src: 'alk' } })).meta.src, 'alk'));
});

suite('ledger.IdeaLedger.record.negation.L3', () => {
  test('throws enforces=true (L-3)',       () => assertThrows(() => il().record({ ...ideaEntry(), enforces: true }), 'L-3'));
  test('throws affectsRuntime=true (L-3)', () => assertThrows(() => il().record({ ...ideaEntry(), affectsRuntime: true }), 'L-3'));
  test('ok enforces=false',                () => { il().record({ ...ideaEntry(), enforces: false }); assert(true); });
  test('ok affectsRuntime=false',          () => { il().record({ ...ideaEntry(), affectsRuntime: false }); assert(true); });
});

suite('ledger.IdeaLedger.close', () => {
  test('REJECTED sets status',             () => {
    const i = il(); const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED, 'bad idea');
    assertEqual(i.findById(a.id).status, IDEA_STATUS.REJECTED);
  });
  test('ABANDONED sets status',            () => {
    const i = il(); const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.ABANDONED);
    assertEqual(i.findById(a.id).status, IDEA_STATUS.ABANDONED);
  });
  test('failureMode stored on REJECTED',   () => {
    const i = il(); const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED, 'breaks §3.1');
    assertEqual(i.findById(a.id).failureMode, 'breaks §3.1');
  });
  test('removes from unresolved',          () => {
    const i = il(); const a = i.record(ideaEntry());
    assertEqual(i.unresolved.length, 1);
    i.close(a.id, IDEA_STATUS.REJECTED);
    assertEqual(i.unresolved.length, 0);
  });
  test('updatedTs updated',                () => {
    const i = il(); const a = i.record(ideaEntry()); const before = a.updatedTs;
    i.close(a.id, IDEA_STATUS.ABANDONED);
    assertGte(i.findById(a.id).updatedTs, before);
  });
  test('findByStatus REJECTED',            () => {
    const i = il(); const a = i.record(ideaEntry()); i.close(a.id, IDEA_STATUS.REJECTED);
    assertEqual(i.findByStatus(IDEA_STATUS.REJECTED).length, 1);
  });
  test('findByStatus UNRESOLVED still has others', () => {
    const i = il(); const a = i.record(ideaEntry()); i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED);
    assertEqual(i.findByStatus(IDEA_STATUS.UNRESOLVED).length, 1);
  });
});

suite('ledger.IdeaLedger.close.negation', () => {
  test('throws PROMOTED (L-4)',            () => {
    const i = il(); const a = i.record(ideaEntry());
    assertThrows(() => i.close(a.id, IDEA_STATUS.PROMOTED), 'L-4');
  });
  test('throws double-close (L-4)',        () => {
    const i = il(); const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED);
    assertThrows(() => i.close(a.id, IDEA_STATUS.ABANDONED), 'L-4');
  });
  test('throws unknown id (L-4)',          () => assertThrows(() => il().close('nope', IDEA_STATUS.REJECTED), 'L-4'));
  test('throws invalid status (L-4)',      () => {
    const i = il(); const a = i.record(ideaEntry());
    assertThrows(() => i.close(a.id, 'not-real'), 'L-4');
  });
});

suite('ledger.IdeaLedger.query', () => {
  function populated() {
    const i = il();
    i.record(ideaEntry({ domain: 'nexus',    tags: ['perf'],  description: 'A' }));
    i.record(ideaEntry({ domain: 'sentinel', tags: ['sec'],   description: 'B' }));
    i.record(ideaEntry({ domain: 'nexus',    tags: ['perf'],  description: 'C' }));
    return i;
  }

  test('findByDomain nexus = 2',           () => assertEqual(populated().findByDomain('nexus').length, 2));
  test('findByDomain sentinel = 1',        () => assertEqual(populated().findByDomain('sentinel').length, 1));
  test('findByDomain unknown = 0',         () => assertEqual(populated().findByDomain('alk').length, 0));
  test('findByTag perf = 2',              () => assertEqual(populated().findByTag('perf').length, 2));
  test('findByTag sec = 1',               () => assertEqual(populated().findByTag('sec').length, 1));
  test('findByProject filters correctly',  () => {
    const i = createIdeaLedger({ project: 'NEXUS' });
    i.record(ideaEntry()); i.record(ideaEntry());
    assertEqual(i.findByProject('NEXUS').length, 2);
    assertEqual(i.findByProject('OTHER').length, 0);
  });
});

// ── flowMetrics ───────────────────────────────────────────────────────────────

suite('ledger.IdeaLedger.flowMetrics', () => {
  test('empty ledger all zeros',           () => {
    const m = il().flowMetrics();
    assertEqual(m.total, 0); assertEqual(m.promoted, 0); assertEqual(m.conversionRate, 0);
  });
  test('conversionRate = promoted/total',  () => {
    const i = il(); const u = ul();
    const a = i.record(ideaEntry()); i.record(ideaEntry()); i.record(ideaEntry());
    promoteIdea(i, u, a.id, upgradeEntry());
    const m = i.flowMetrics();
    assertEqual(m.total, 3); assertEqual(m.promoted, 1);
    assertEqual(m.conversionRate, Math.round((1/3)*10000)/10000);
  });
  test('bottleneckSignal true when > 5',   () => {
    const i = il();
    for (let j = 0; j < 6; j++) i.record(ideaEntry());
    assert(i.flowMetrics().bottleneckSignal);
  });
  test('bottleneckSignal false when <= 5', () => {
    const i = il();
    for (let j = 0; j < 5; j++) i.record(ideaEntry());
    assert(!i.flowMetrics().bottleneckSignal);
  });
  test('pending = unresolved count',       () => {
    const i = il(); i.record(ideaEntry()); i.record(ideaEntry());
    assertEqual(i.flowMetrics().pending, i.unresolved.length);
  });
  test('rejected count correct',           () => {
    const i = il(); const a = i.record(ideaEntry()); i.close(a.id, IDEA_STATUS.REJECTED);
    assertEqual(i.flowMetrics().rejected, 1);
  });
  test('abandoned count correct',          () => {
    const i = il(); const a = i.record(ideaEntry()); i.close(a.id, IDEA_STATUS.ABANDONED);
    assertEqual(i.flowMetrics().abandoned, 1);
  });
});

// ── promoteIdea ───────────────────────────────────────────────────────────────

suite('ledger.promoteIdea', () => {
  test('returns { idea, upgrade }',        () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    const r = promoteIdea(i, u, a.id, upgradeEntry());
    assertNotNull(r.idea); assertNotNull(r.upgrade);
  });
  test('idea status PROMOTED',             () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    promoteIdea(i, u, a.id, upgradeEntry());
    assertEqual(i.findById(a.id).status, IDEA_STATUS.PROMOTED);
  });
  test('upgrade committed to UpgradeLedger', () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    promoteIdea(i, u, a.id, upgradeEntry());
    assertEqual(u.length, 1);
  });
  test('upgrade.ideaId = idea.id',         () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    const { upgrade } = promoteIdea(i, u, a.id, upgradeEntry());
    assertEqual(upgrade.ideaId, a.id);
  });
  test('promoted removed from unresolved', () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    assertEqual(i.unresolved.length, 1);
    promoteIdea(i, u, a.id, upgradeEntry());
    assertEqual(i.unresolved.length, 0);
  });
  test('upgrade record is frozen',         () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    assertFrozen(promoteIdea(i, u, a.id, upgradeEntry()).upgrade);
  });
  test('updatedTs updated on idea',        () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    const before = a.updatedTs;
    promoteIdea(i, u, a.id, upgradeEntry());
    assertGte(i.findById(a.id).updatedTs, before);
  });
});

suite('ledger.promoteIdea.negation', () => {
  test('throws L-2 first arg not idea',    () => {
    const u = ul(); const i = il(); const a = i.record(ideaEntry());
    assertThrows(() => promoteIdea(u, u, a.id, upgradeEntry()), 'L-2');
  });
  test('throws L-2 second arg not upgrade',() => {
    const i = il(); const a = i.record(ideaEntry());
    assertThrows(() => promoteIdea(i, i, a.id, upgradeEntry()), 'L-2');
  });
  test('throws L-2 first arg null',        () => assertThrows(() => promoteIdea(null, ul(), 'x', upgradeEntry()), 'L-2'));
  test('throws L-2 second arg null',       () => {
    const i = il(); const a = i.record(ideaEntry());
    assertThrows(() => promoteIdea(i, null, a.id, upgradeEntry()), 'L-2');
  });
  test('throws L-4 idea not found',        () => assertThrows(() => promoteIdea(il(), ul(), 'nope', upgradeEntry()), 'L-4'));
  test('throws L-4 already PROMOTED',      () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    promoteIdea(i, u, a.id, upgradeEntry());
    assertThrows(() => promoteIdea(i, u, a.id, upgradeEntry()), 'L-4');
  });
  test('throws L-4 already REJECTED',      () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED);
    assertThrows(() => promoteIdea(i, u, a.id, upgradeEntry()), 'L-4');
  });
  test('throws L-4 already ABANDONED',     () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.ABANDONED);
    assertThrows(() => promoteIdea(i, u, a.id, upgradeEntry()), 'L-4');
  });
  test('throws L-4 no proof',              () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    assertThrows(() => promoteIdea(i, u, a.id, { type: UPGRADE_TYPE.BUG_FIX, description: 'x' }), 'L-4');
  });
  test('throws L-4 empty proof',           () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    assertThrows(() => promoteIdea(i, u, a.id, { ...upgradeEntry(), proof: {} }), 'L-4');
  });
  test('idea stays UNRESOLVED if promote fails', () => {
    const i = il(); const u = ul(); const a = i.record(ideaEntry());
    try { promoteIdea(i, u, a.id, { type: UPGRADE_TYPE.BUG_FIX, description: 'no proof' }); } catch (_) {}
    assertEqual(i.findById(a.id).status, IDEA_STATUS.UNRESOLVED);
  });
});

// ── validateSeparation ────────────────────────────────────────────────────────

suite('ledger.validateSeparation', () => {
  test('returns true for valid pair',      () => assertEqual(validateSeparation(il(), ul()), true));
  test('throws L-2 first arg upgrade',     () => assertThrows(() => validateSeparation(ul(), ul()), 'L-2'));
  test('throws L-2 second arg idea',       () => assertThrows(() => validateSeparation(il(), il()), 'L-2'));
  test('throws L-2 args swapped',          () => assertThrows(() => validateSeparation(ul(), il()), 'L-2'));
  test('throws L-2 first null',            () => assertThrows(() => validateSeparation(null, ul()), 'L-2'));
  test('throws L-2 second null',           () => assertThrows(() => validateSeparation(il(), null), 'L-2'));
  test('throws L-1 same ID',              () => {
    const i = il(); const u = ul();
    const fakeU = { ...u, id: i.id, type: 'upgrade', assertSeparation: () => {} };
    assertThrows(() => validateSeparation(i, fakeU), 'L-1');
  });
});

// ── createLedger (paired) ─────────────────────────────────────────────────────

suite('ledger.createLedger', () => {
  test('returns idea and upgrade sub-ledgers', () => {
    const l = createLedger();
    assert(l.idea   && l.idea.type   === 'idea');
    assert(l.upgrade && l.upgrade.type === 'upgrade');
  });
  test('record convenience wraps idea.record', () => {
    const l = createLedger(); const a = l.record(ideaEntry());
    assertNotNull(l.idea.findById(a.id));
  });
  test('close convenience wraps idea.close', () => {
    const l = createLedger(); const a = l.record(ideaEntry());
    l.close(a.id, IDEA_STATUS.REJECTED);
    assertEqual(l.idea.findById(a.id).status, IDEA_STATUS.REJECTED);
  });
  test('promote convenience wraps promoteIdea', () => {
    const l = createLedger(); const a = l.record(ideaEntry());
    const { upgrade } = l.promote(a.id, upgradeEntry());
    assertEqual(l.upgrade.length, 1);
    assertNotNull(upgrade);
  });
  test('commit convenience wraps upgrade.commit', () => {
    const l = createLedger(); l.commit(upgradeEntry());
    assertEqual(l.upgrade.length, 1);
  });
  test('replay returns upgrade history', () => {
    const l = createLedger(); l.commit(upgradeEntry()); l.commit(upgradeEntry());
    assertEqual(l.replay().length, 2);
  });
  test('metrics returns flowMetrics', () => {
    const l = createLedger(); l.record(ideaEntry());
    assertNotNull(l.metrics());
    assert(typeof l.metrics().total === 'number');
  });
  test('project set on both sub-ledgers', () => {
    const l = createLedger({ project: 'NEXUS' });
    assertEqual(l.idea.project,    'NEXUS');
    assertEqual(l.upgrade.project, 'NEXUS');
  });
  test('two paired ledgers fully independent', () => {
    const l1 = createLedger({ project: 'NEXUS' });
    const l2 = createLedger({ project: 'SENTINEL' });
    l1.record(ideaEntry()); l1.record(ideaEntry());
    l2.record(ideaEntry());
    assertEqual(l1.idea.length, 2);
    assertEqual(l2.idea.length, 1);
  });
});

// ── Observer API ──────────────────────────────────────────────────────────────

suite('ledger.observer', () => {
  test('idea:recorded fires on record', () => {
    let fired = false;
    const i = il(); i.on('idea:recorded', () => { fired = true; });
    i.record(ideaEntry());
    assert(fired, 'idea:recorded did not fire');
  });
  test('idea:recorded payload has idea', () => {
    let payload = null;
    const i = il(); i.on('idea:recorded', d => { payload = d; });
    const a = i.record(ideaEntry());
    assertNotNull(payload?.idea);
    assertEqual(payload.idea.id, a.id);
  });
  test('idea:closed fires on close', () => {
    let fired = false;
    const i = il(); i.on('idea:closed', () => { fired = true; });
    const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED);
    assert(fired);
  });
  test('idea:closed payload has status', () => {
    let payload = null;
    const i = il(); i.on('idea:closed', d => { payload = d; });
    const a = i.record(ideaEntry());
    i.close(a.id, IDEA_STATUS.REJECTED, 'reason');
    assertEqual(payload?.status, IDEA_STATUS.REJECTED);
    assertEqual(payload?.failureMode, 'reason');
  });
  test('upgrade:committed fires on commit', () => {
    let fired = false;
    const u = ul(); u.on('upgrade:committed', () => { fired = true; });
    u.commit(upgradeEntry());
    assert(fired);
  });
  test('upgrade:committed payload has upgrade', () => {
    let payload = null;
    const u = ul(); u.on('upgrade:committed', d => { payload = d; });
    const r = u.commit(upgradeEntry());
    assertEqual(payload?.upgrade?.id, r.id);
  });
  test('idea:promoted fires on promoteIdea', () => {
    let fired = false;
    const i = il(); const u = ul();
    i.on('idea:promoted', () => { fired = true; });
    const a = i.record(ideaEntry());
    promoteIdea(i, u, a.id, upgradeEntry());
    assert(fired);
  });
  test('idea:promoted payload has idea and upgrade', () => {
    let payload = null;
    const i = il(); const u = ul();
    i.on('idea:promoted', d => { payload = d; });
    const a = i.record(ideaEntry());
    promoteIdea(i, u, a.id, upgradeEntry());
    assertNotNull(payload?.idea);
    assertNotNull(payload?.upgrade);
  });
  test('bottleneck fires when > 5 unresolved', () => {
    let fired = false;
    const i = il(); i.on('bottleneck', () => { fired = true; });
    for (let j = 0; j < 6; j++) i.record(ideaEntry());
    assert(fired);
  });
  test('bottleneck does not fire at 5', () => {
    let fired = false;
    const i = il(); i.on('bottleneck', () => { fired = true; });
    for (let j = 0; j < 5; j++) i.record(ideaEntry());
    assert(!fired);
  });
  test('off removes listener', () => {
    let count = 0;
    const i   = il();
    const fn  = () => { count++; };
    i.on('idea:recorded', fn);
    i.record(ideaEntry());
    i.off('idea:recorded', fn);
    i.record(ideaEntry());
    assertEqual(count, 1);
  });
  test('on returns unsub function', () => {
    let count = 0;
    const i   = il();
    const unsub = i.on('idea:recorded', () => { count++; });
    i.record(ideaEntry());
    unsub();
    i.record(ideaEntry());
    assertEqual(count, 1);
  });
  test('observer error does not halt emission', () => {
    const i = il();
    i.on('idea:recorded', () => { throw new Error('observer crash'); });
    let secondFired = false;
    i.on('idea:recorded', () => { secondFired = true; });
    i.record(ideaEntry()); // should not throw
    assert(secondFired);
  });
  test('paired ledger on() receives both sub-ledger events', () => {
    const events = [];
    const l = createLedger();
    l.on('idea:recorded',    e => events.push('idea:recorded'));
    l.on('upgrade:committed',e => events.push('upgrade:committed'));
    l.on('idea:promoted',    e => events.push('idea:promoted'));
    const a = l.record(ideaEntry());
    l.commit(upgradeEntry());
    l.promote(a.id, upgradeEntry());
    assertIncludes(events, 'idea:recorded');
    assertIncludes(events, 'upgrade:committed');
    assertIncludes(events, 'idea:promoted');
  });
});

// ── Cross-project usage ───────────────────────────────────────────────────────

suite('ledger.cross-project', () => {
  test('NEXUS and SENTINEL use same ledger type independently', () => {
    const nexus    = createLedger({ project: 'NEXUS' });
    const sentinel = createLedger({ project: 'SENTINEL' });

    nexus.record(ideaEntry({ description: 'CFR bridge', domain: 'nexus' }));
    nexus.record(ideaEntry({ description: 'ALK codec',  domain: 'nexus' }));
    sentinel.record(ideaEntry({ description: 'SEC-019 XSS', domain: 'sentinel' }));

    assertEqual(nexus.idea.length,    2);
    assertEqual(sentinel.idea.length, 1);
    assertEqual(nexus.idea.findByDomain('nexus').length, 2);
    assertEqual(sentinel.idea.findByDomain('sentinel').length, 1);
  });

  test('shared upgrade ledger across projects (multi-project audit)', () => {
    const sharedUpgrade = ul();
    const nexusIdea     = il({ project: 'NEXUS' });
    const sentinelIdea  = il({ project: 'SENTINEL' });

    const a = nexusIdea.record(ideaEntry({ description: 'NEXUS fix' }));
    const b = sentinelIdea.record(ideaEntry({ description: 'SENTINEL fix' }));

    promoteIdea(nexusIdea, sharedUpgrade, a.id, upgradeEntry({ domain: 'nexus' }));
    promoteIdea(sentinelIdea, sharedUpgrade, b.id, upgradeEntry({ domain: 'sentinel' }));

    assertEqual(sharedUpgrade.length, 2);
    assertEqual(sharedUpgrade.findByDomain('nexus').length, 1);
    assertEqual(sharedUpgrade.findByDomain('sentinel').length, 1);
  });

  test('replay from shared ledger reconstructs cross-project history', () => {
    const shared = ul();
    shared.commit(upgradeEntry({ domain: 'nexus',    version: '6.0.0', description: 'NEXUS phase 6' }));
    shared.commit(upgradeEntry({ domain: 'sentinel', version: '2.1.0', description: 'SENTINEL v2.1' }));
    shared.commit(upgradeEntry({ domain: 'alk',      version: '1.0.0', description: 'ALK codec v1' }));

    const history = shared.replay();
    assertEqual(history.length, 3);
    assertEqual(history[0].domain, 'nexus');
    assertEqual(history[2].domain, 'alk');
  });
});

// ── E2E lifecycle ─────────────────────────────────────────────────────────────

suite('ledger.e2e', () => {
  test('full lifecycle: record → hostile review → reject with failure mode', () => {
    const l = createLedger({ project: 'NEXUS' });
    const idea = l.record({
      description: 'Add async snapshot mode',
      hypothesis:  'Reduces peak memory for large kernels',
      domain:      'compress',
      tags:        ['performance'],
    });
    assertEqual(idea.status, IDEA_STATUS.UNRESOLVED);
    // Hostile review finds it breaks §3.1
    l.close(idea.id, IDEA_STATUS.REJECTED, 'Async breaks §3.1 bottom-up — complicates layer order');
    assertEqual(l.idea.findById(idea.id).status, IDEA_STATUS.REJECTED);
    assertEqual(l.idea.findById(idea.id).failureMode, 'Async breaks §3.1 bottom-up — complicates layer order');
    assertEqual(l.idea.unresolved.length, 0);
  });

  test('full lifecycle: record → build proves it → promote', () => {
    const l = createLedger({ project: 'NEXUS' });
    const idea = l.record({
      description: 'String pool interning in compress',
      hypothesis:  'Will improve compression ratio 20–40% on verbose payloads',
      domain:      'compress',
      tags:        ['compress', 'v6'],
    });

    const { upgrade } = l.promote(idea.id, {
      type:        UPGRADE_TYPE.PASSING_TEST,
      description: 'String pool implemented, 160/160 tests passing',
      proof:       { testFile: 'test/unit/compress.test.js', metric: { ratioBefore: 4.2, ratioAfter: 9.1 } },
      version:     '6.0.0',
      domain:      'compress',
    });

    assertEqual(idea.status, IDEA_STATUS.PROMOTED);
    assertEqual(l.upgrade.length, 1);
    assertEqual(upgrade.ideaId, idea.id);
    assertEqual(l.idea.unresolved.length, 0);
    assertEqual(l.metrics().conversionRate, 1);
  });

  test('multiple parallel ideas — only one promoted, one rejected, one pending', () => {
    const l = createLedger({ project: 'SENTINEL' });
    const a = l.record(ideaEntry({ description: 'Idea A' }));
    const b = l.record(ideaEntry({ description: 'Idea B' }));
    const c = l.record(ideaEntry({ description: 'Idea C' }));

    l.promote(b.id, upgradeEntry());
    l.close(a.id, IDEA_STATUS.REJECTED, 'failed hostile review');

    const m = l.metrics();
    assertEqual(m.total,    3);
    assertEqual(m.promoted, 1);
    assertEqual(m.rejected, 1);
    assertEqual(m.pending,  1);
    assert(!m.bottleneckSignal);
  });

  test('bottleneck fires and resolves correctly', () => {
    const events = [];
    const l = createLedger({ project: 'ALK' });
    l.on('bottleneck', d => events.push(d.pending));

    for (let i = 0; i < 7; i++) l.record(ideaEntry());
    assert(events.length > 0);
    assertGt(events[0], 5);

    // Resolve some — bottleneck goes away
    const unresolved = l.idea.unresolved;
    for (const idea of unresolved.slice(0, 4)) {
      l.close(idea.id, IDEA_STATUS.ABANDONED);
    }
    assert(!l.metrics().bottleneckSignal);
  });

  test('replay reconstructs full truth history in order', () => {
    const l = createLedger({ project: 'MASTERMIND' });
    const a = l.record(ideaEntry({ description: 'Idea A' }));
    const b = l.record(ideaEntry({ description: 'Idea B' }));

    l.promote(a.id, upgradeEntry({ version: '1.0.1' }));
    l.commit(upgradeEntry({ version: '1.1.0', type: UPGRADE_TYPE.PHASE_COMPLETE, description: 'Phase 1 complete' }));
    l.promote(b.id, upgradeEntry({ version: '1.1.1' }));

    const history = l.replay();
    assertEqual(history.length, 3);
    assertEqual(history[0].version, '1.0.1');
    assertEqual(history[1].version, '1.1.0');
    assertEqual(history[2].version, '1.1.1');
    assertGte(history[1].ts, history[0].ts);
    assertGte(history[2].ts, history[1].ts);
  });

  test('observer wires to external bus (simulated NEXUS event bus)', () => {
    // Simulate what any project does: wire ledger events to its own bus
    const externalBus = [];
    const l = createLedger({ project: 'NEXUS' });

    // This is all any project needs — one on() call
    l.on('idea:recorded',    d => externalBus.push({ type: 'ledger:idea:recorded',    id: d.idea.id }));
    l.on('upgrade:committed',d => externalBus.push({ type: 'ledger:upgrade:committed', id: d.upgrade.id }));
    l.on('idea:promoted',    d => externalBus.push({ type: 'ledger:idea:promoted',     ideaId: d.idea.id }));

    const idea = l.record(ideaEntry());
    l.promote(idea.id, upgradeEntry());

    assert(externalBus.some(e => e.type === 'ledger:idea:recorded'));
    assert(externalBus.some(e => e.type === 'ledger:upgrade:committed'));
    assert(externalBus.some(e => e.type === 'ledger:idea:promoted'));
  });
});

// ── Report ────────────────────────────────────────────────────────────────────

report('ledger.test.js');
