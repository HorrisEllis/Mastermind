/**
 * Adapter Sandbox Tests — 30 tests
 * AS-1..30: policy enforcement, null adapter, registration invariants
 */

import {
  suite, test, assert, assertEqual, assertThrows,
  assertNotNull, report, reset,
} from '../runner.js';

import {
  createAdapterSandbox, createNullAdapter,
  POLICY_READ_ONLY, POLICY_LOCAL_ONLY, POLICY_FULL,
  VALID_POLICIES, AdapterRegistrationError,
} from '../../src/adapter-sandbox/index.js';

import { createKernel } from '../../src/kernel/index.js';

reset();

function makeFactory(label = 'test') {
  return (kernel, opts = {}) => ({
    handle:  (name, payload) => `${label}:handle:${name}`,
    flush:   ()              => `${label}:flush`,
    destroy: ()              => undefined,
    _label:  label,
    _opts:   opts,
    _kernel: kernel,
  });
}

suite('as.AS1-2-constants', () => {
  test('AS-1 policy constants are correct strings', () => {
    assertEqual(POLICY_READ_ONLY,  'READ_ONLY');
    assertEqual(POLICY_LOCAL_ONLY, 'LOCAL_ONLY');
    assertEqual(POLICY_FULL,       'FULL');
  });
  test('AS-2 VALID_POLICIES contains all three', () => {
    assert(VALID_POLICIES.has(POLICY_READ_ONLY));
    assert(VALID_POLICIES.has(POLICY_LOCAL_ONLY));
    assert(VALID_POLICIES.has(POLICY_FULL));
    assertEqual(VALID_POLICIES.size, 3);
  });
});

suite('as.AS3-9-register', () => {
  test('AS-3a empty name throws', () => {
    assertThrows(() => createAdapterSandbox().register('', makeFactory()), 'non-empty string');
  });
  test('AS-3b non-string name throws', () => {
    assertThrows(() => createAdapterSandbox().register(42, makeFactory()), 'non-empty string');
  });
  test('AS-4 non-function factory throws', () => {
    assertThrows(() => createAdapterSandbox().register('x', { not: 'fn' }), 'factory must be a function');
  });
  test('AS-5 duplicate name throws', () => {
    const s = createAdapterSandbox();
    s.register('dup', makeFactory());
    assertThrows(() => s.register('dup', makeFactory()), 'already registered');
  });
  test('AS-6 invalid policy throws', () => {
    assertThrows(
      () => createAdapterSandbox().register('bad', makeFactory(), { policy: 'WRITE_ALL' }),
      'invalid policy'
    );
  });
  test('AS-7 undeclared policy defaults to FULL', () => {
    const reg = createAdapterSandbox().register('implicit', makeFactory());
    assertEqual(reg.policy, POLICY_FULL);
  });
  test('AS-8 register returns name + policy + registeredAt', () => {
    const reg = createAdapterSandbox().register('named', makeFactory(), { policy: POLICY_READ_ONLY });
    assertEqual(reg.name,   'named');
    assertEqual(reg.policy, POLICY_READ_ONLY);
    assert(typeof reg.registeredAt === 'number');
  });
  test('AS-9 policy immutable — second register throws, original preserved', () => {
    const s = createAdapterSandbox();
    s.register('locked', makeFactory(), { policy: POLICY_READ_ONLY });
    assertThrows(() => s.register('locked', makeFactory(), { policy: POLICY_FULL }), 'already registered');
    assertEqual(s.getRegistration('locked').policy, POLICY_READ_ONLY);
  });
});

suite('as.AS10-16-instantiate', () => {
  test('AS-10 unregistered name throws', () => {
    assertThrows(() => createAdapterSandbox().instantiate('ghost', createKernel()), 'not registered');
  });
  test('AS-11 FULL → real adapter in live context', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('full', makeFactory('full'), { policy: POLICY_FULL });
    const a = s.instantiate('full', k);
    assert(!a._isNullAdapter);
    assertEqual(a._label, 'full');
  });
  test('AS-12 LOCAL_ONLY → real adapter in live context', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('local', makeFactory(), { policy: POLICY_LOCAL_ONLY });
    assert(!s.instantiate('local', k)._isNullAdapter);
  });
  test('AS-13 READ_ONLY → real adapter in live context', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('ro', makeFactory(), { policy: POLICY_READ_ONLY });
    assert(!s.instantiate('ro', k)._isNullAdapter);
  });
  test('AS-14 FULL → null adapter in replay', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('full-r', makeFactory(), { policy: POLICY_FULL });
    assert(s.instantiate('full-r', k, { replay: true })._isNullAdapter === true);
  });
  test('AS-15 LOCAL_ONLY → null adapter in replay', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('local-r', makeFactory(), { policy: POLICY_LOCAL_ONLY });
    assert(s.instantiate('local-r', k, { replay: true })._isNullAdapter === true);
  });
  test('AS-16 READ_ONLY → real adapter in replay (permitted)', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('ro-r', makeFactory('ro-r'), { policy: POLICY_READ_ONLY });
    const a = s.instantiate('ro-r', k, { replay: true });
    assert(!a._isNullAdapter);
    assertEqual(a._label, 'ro-r');
  });
});

suite('as.AS17-22-null-adapter', () => {
  test('AS-17 _isNullAdapter is true', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('na', makeFactory(), { policy: POLICY_FULL });
    assertEqual(s.instantiate('na', k, { replay: true })._isNullAdapter, true);
  });
  test('AS-18 all function methods are no-ops returning undefined', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('noop', makeFactory(), { policy: POLICY_FULL });
    const a = s.instantiate('noop', k, { replay: true });
    assertEqual(a.handle('page:nav', {}), undefined);
    assertEqual(a.flush(),               undefined);
    assertEqual(a.destroy(),             undefined);
  });
  test('AS-19 _adapterName and _originalPolicy set', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('labeled', makeFactory(), { policy: POLICY_LOCAL_ONLY });
    const a = s.instantiate('labeled', k, { replay: true });
    assertEqual(a._adapterName,    'labeled');
    assertEqual(a._originalPolicy, POLICY_LOCAL_ONLY);
  });
  test('AS-20 null adapter is frozen', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('frz', makeFactory(), { policy: POLICY_FULL });
    assert(Object.isFrozen(s.instantiate('frz', k, { replay: true })));
  });
  test('AS-21 factory throwing in replay still produces null adapter', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('throws', () => { throw new Error('no external state'); }, { policy: POLICY_FULL });
    let a;
    try { a = s.instantiate('throws', k, { replay: true }); }
    catch(e) { assert(false, `should not throw: ${e.message}`); }
    assert(a._isNullAdapter === true);
  });
  test('AS-22 createNullAdapter mirrors function shape', () => {
    const na = createNullAdapter({ run: () => 42, stop: () => 'x', count: 7 }, 't', POLICY_FULL);
    assert(typeof na.run  === 'function');
    assert(typeof na.stop === 'function');
    assertEqual(na.run(),  undefined);
    assertEqual(na.stop(), undefined);
    assertEqual(na.count,  null);
  });
});

suite('as.AS23-26-introspection', () => {
  test('AS-23 getRegistration returns record without factory', () => {
    const s = createAdapterSandbox();
    s.register('info', makeFactory(), { policy: POLICY_READ_ONLY });
    const reg = s.getRegistration('info');
    assertNotNull(reg);
    assertEqual(reg.name,   'info');
    assertEqual(reg.policy, POLICY_READ_ONLY);
    assert(!('factory' in reg));
  });
  test('AS-24 getRegistration returns null for unknown', () => {
    assertEqual(createAdapterSandbox().getRegistration('nope'), null);
  });
  test('AS-25 listRegistrations sorted, no factory exposed', () => {
    const s = createAdapterSandbox();
    s.register('a1', makeFactory(), { policy: POLICY_FULL });
    s.register('a2', makeFactory(), { policy: POLICY_LOCAL_ONLY });
    s.register('a3', makeFactory(), { policy: POLICY_READ_ONLY });
    const list = s.listRegistrations();
    assertEqual(list.length, 3);
    assertEqual(list[0].name, 'a1');
    assertEqual(list[2].name, 'a3');
    assert(!list.some(r => 'factory' in r));
  });
  test('AS-26 sandbox.size tracks count', () => {
    const s = createAdapterSandbox();
    assertEqual(s.size, 0);
    s.register('x', makeFactory()); assertEqual(s.size, 1);
    s.register('y', makeFactory()); assertEqual(s.size, 2);
  });
});

suite('as.AS27-error-type', () => {
  test('AS-27 AdapterRegistrationError has name, context, prefixed message', () => {
    let err = null;
    try { createAdapterSandbox().register('', makeFactory()); } catch(e) { err = e; }
    assert(err instanceof AdapterRegistrationError);
    assertEqual(err.name, 'AdapterRegistrationError');
    assert(typeof err.context === 'object');
    assert(err.message.includes('[adapter-sandbox]'));
  });
});

suite('as.AS28-30-integration', () => {
  test('AS-28 multiple adapters with independent policies', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('net',   makeFactory(), { policy: POLICY_FULL });
    s.register('mem',   makeFactory(), { policy: POLICY_LOCAL_ONLY });
    s.register('stats', makeFactory(), { policy: POLICY_READ_ONLY });
    // Live — all real
    assert(!s.instantiate('net',   k)._isNullAdapter);
    assert(!s.instantiate('mem',   k)._isNullAdapter);
    assert(!s.instantiate('stats', k)._isNullAdapter);
    // Replay — net + mem nulled, stats real
    assert( s.instantiate('net',   k, { replay: true })._isNullAdapter);
    assert( s.instantiate('mem',   k, { replay: true })._isNullAdapter);
    assert(!s.instantiate('stats', k, { replay: true })._isNullAdapter);
  });
  test('AS-29 real adapter receives kernel and factoryOpts', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    let capturedKernel, capturedOpts;
    s.register('capture', (kernel, opts) => {
      capturedKernel = kernel; capturedOpts = opts; return { handle: () => {} };
    }, { policy: POLICY_FULL });
    s.instantiate('capture', k, { factoryOpts: { threshold: 42 } });
    assert(capturedKernel === k);
    assertEqual(capturedOpts.threshold, 42);
  });
  test('AS-30 null adapter from empty fallback shape', () => {
    const s = createAdapterSandbox(); const k = createKernel();
    s.register('empty-throw', () => { throw new Error('boom'); }, { policy: POLICY_LOCAL_ONLY });
    const a = s.instantiate('empty-throw', k, { replay: true });
    assert(a._isNullAdapter);
    assertEqual(a._adapterName, 'empty-throw');
  });
});

export const result = report('adapter-sandbox');
