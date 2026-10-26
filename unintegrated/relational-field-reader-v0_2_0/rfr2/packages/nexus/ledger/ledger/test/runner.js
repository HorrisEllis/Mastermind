/**
 * Ledger test runner — zero dependencies.
 */

let _suites = [];
let _current = null;

export function reset() { _suites = []; _current = null; }

export function suite(name, fn) {
  const s = { name, tests: [] };
  _suites.push(s);
  const prev = _current;
  _current = s;
  fn();
  _current = prev;
}

export function test(name, fn) {
  if (!_current) throw new Error('test() must be called inside suite()');
  _current.tests.push({ name, fn });
}

export function assert(condition, msg = 'assertion failed') {
  if (!condition) throw new Error(msg);
}

export function assertEqual(a, b, msg) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error(msg || `expected ${jb}\n  got     ${ja}`);
}

export function assertNotEqual(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) {
    throw new Error(msg || `expected values to differ, both: ${JSON.stringify(a)}`);
  }
}

export function assertNull(v, msg) {
  if (v !== null && v !== undefined) throw new Error(msg || `expected null, got ${JSON.stringify(v)}`);
}

export function assertNotNull(v, msg) {
  if (v === null || v === undefined) throw new Error(msg || 'expected non-null');
}

export function assertThrows(fn, contains, label) {
  let threw = false;
  try { fn(); } catch (e) {
    threw = true;
    if (contains && !e.message.includes(contains)) {
      throw new Error(`${label || 'assertThrows'}: expected message containing "${contains}", got "${e.message}"`);
    }
  }
  if (!threw) throw new Error(`${label || 'assertThrows'}: expected function to throw`);
}

export function assertIncludes(collection, item, msg) {
  const has = Array.isArray(collection)
    ? collection.includes(item)
    : collection instanceof Set
      ? collection.has(item)
      : false;
  if (!has) throw new Error(msg || `expected collection to include ${JSON.stringify(item)}`);
}

export function assertUUID(id, msg) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(msg || `expected UUID v4, got ${JSON.stringify(id)}`);
  }
}

export function assertGt(a, b, msg) {
  if (!(a > b)) throw new Error(msg || `expected ${a} > ${b}`);
}

export function assertGte(a, b, msg) {
  if (!(a >= b)) throw new Error(msg || `expected ${a} >= ${b}`);
}

export function assertFrozen(obj, msg) {
  if (!Object.isFrozen(obj)) throw new Error(msg || 'expected frozen object');
}

export function report(label) {
  let passed = 0, failed = 0, errors = [];
  for (const s of _suites) {
    for (const t of s.tests) {
      try { t.fn(); passed++; }
      catch (e) { failed++; errors.push({ suite: s.name, test: t.name, message: e.message }); }
    }
  }
  const total = passed + failed;
  if (label) console.log(`\n── ${label} ──`);
  console.log(`  ${passed}/${total} passing${failed > 0 ? `, ${failed} failing` : ''}`);
  for (const err of errors) {
    console.log(`  ✗ ${err.suite} › ${err.test}`);
    console.log(`      ${err.message}`);
  }
  if (failed === 0) console.log('  ✓ all tests pass');
  return { passed, failed, total, errors };
}
