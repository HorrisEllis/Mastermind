/**
 * Version Gate Tests
 * version-gate module — validate() + migrate() + createVersionGate()
 *
 * 25 tests covering:
 *   VG-1  null/non-object rejection
 *   VG-2  unrecognized magic rejection
 *   VG-3  fmt type validation
 *   VG-4  fmt value mismatch (hard stop)
 *   VG-5  kernelVersion major mismatch (hard stop)
 *   VG-6  kernelVersion invalid semver
 *   VG-7  valid URCK-SNAP passes
 *   VG-8  valid URCK-BP passes
 *   VG-9  valid NEX-SNAP passes
 *   VG-10 valid NEX-CLIP passes
 *   VG-11 missing kernelVersion is accepted (optional field)
 *   VG-12 M-001 migration: URCK-SNAP → NEX-SNAP
 *   VG-13 M-001 migration: URCK-BP → NEX-BP
 *   VG-14 migration is idempotent
 *   VG-15 migrate does not mutate input
 *   VG-16 GateValidationError has name and context
 *   VG-17 createVersionGate() with custom kernelVersion
 *   VG-18 custom gate rejects artifact with wrong major
 *   VG-19 artifactType() returns correct type strings
 *   VG-20 migrations list exposed on gate instance
 *   VG-21 validate returns artifact unchanged
 *   VG-22 invalid kernelVersion string in createVersionGate throws
 *   VG-23 minor/patch version differences are accepted
 *   VG-24 validate → migrate pipeline produces NEX-SNAP from URCK-SNAP
 *   VG-25 kernelVersion injected on migration when absent
 */

import {
  suite, test, assert, assertEqual, assertNotEqual,
  assertThrows, report, reset,
} from '../runner.js';

import {
  validate, migrate, createVersionGate,
  GateValidationError, SUPPORTED_MAGICS,
  CURRENT_FORMAT_VERSION, CURRENT_KERNEL_VERSION,
} from '../../src/version-gate/index.js';

reset();

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSnap(overrides = {}) {
  return {
    magic:         'URCK-SNAP',
    fmt:           1,
    kernelVersion: CURRENT_KERNEL_VERSION,
    cseq: 0, ctick: 0, ver: 0,
    types: [], sources: [], ev: [], macros: [], gates: [],
    n: 0, total: 0, edges: 0, drops: 0,
    ...overrides,
  };
}

function makeBP(overrides = {}) {
  return { magic: 'URCK-BP', fmt: 1, kernelVersion: CURRENT_KERNEL_VERSION, vocab: [], patterns: [], invariants: [], ...overrides };
}

// ── VG-1: null/non-object rejection ──────────────────────────────────────────

suite('vg.VG1-null-rejection', () => {
  test('null throws GateValidationError', () => {
    assertThrows(() => validate(null), 'non-null object');
  });
  test('undefined throws GateValidationError', () => {
    assertThrows(() => validate(undefined), 'non-null object');
  });
  test('string throws GateValidationError', () => {
    assertThrows(() => validate('URCK-SNAP'), 'non-null object');
  });
  test('number throws GateValidationError', () => {
    assertThrows(() => validate(42), 'non-null object');
  });
});

// ── VG-2: unrecognized magic ──────────────────────────────────────────────────

suite('vg.VG2-unrecognized-magic', () => {
  test('unknown magic throws', () => {
    assertThrows(() => validate(makeSnap({ magic: 'UNKNOWN' })), 'unrecognized magic');
  });
  test('empty string magic throws', () => {
    assertThrows(() => validate(makeSnap({ magic: '' })), 'unrecognized magic');
  });
  test('lowercase urck-snap throws', () => {
    assertThrows(() => validate(makeSnap({ magic: 'urck-snap' })), 'unrecognized magic');
  });
});

// ── VG-3: fmt type validation ─────────────────────────────────────────────────

suite('vg.VG3-fmt-type', () => {
  test('string fmt throws', () => {
    assertThrows(() => validate(makeSnap({ fmt: '1' })), 'fmt must be a number');
  });
  test('null fmt throws', () => {
    assertThrows(() => validate(makeSnap({ fmt: null })), 'fmt must be a number');
  });
});

// ── VG-4: fmt value mismatch ──────────────────────────────────────────────────

suite('vg.VG4-fmt-mismatch', () => {
  test('fmt=0 throws format version mismatch', () => {
    assertThrows(() => validate(makeSnap({ fmt: 0 })), 'format version mismatch');
  });
  test('fmt=2 throws format version mismatch', () => {
    assertThrows(() => validate(makeSnap({ fmt: 2 })), 'format version mismatch');
  });
  test('error message includes artifact fmt and expected fmt', () => {
    let msg = '';
    try { validate(makeSnap({ fmt: 99 })); } catch(e) { msg = e.message; }
    assert(msg.includes('99'),                  'should include artifact fmt');
    assert(msg.includes(String(CURRENT_FORMAT_VERSION)), 'should include expected fmt');
  });
});

// ── VG-5: kernelVersion major mismatch ───────────────────────────────────────

suite('vg.VG5-major-mismatch', () => {
  test('major 3 rejects against major 4 kernel', () => {
    assertThrows(() => validate(makeSnap({ kernelVersion: '3.9.9' })), 'major version mismatch');
  });
  test('major 5 rejects against major 4 kernel', () => {
    assertThrows(() => validate(makeSnap({ kernelVersion: '5.0.0' })), 'major version mismatch');
  });
  test('error is GateValidationError', () => {
    let err = null;
    try { validate(makeSnap({ kernelVersion: '99.0.0' })); } catch(e) { err = e; }
    assert(err instanceof GateValidationError, 'should be GateValidationError');
    assert(err.name === 'GateValidationError',  'name should be GateValidationError');
  });
});

// ── VG-6: invalid semver ──────────────────────────────────────────────────────

suite('vg.VG6-invalid-semver', () => {
  test('non-semver string throws', () => {
    assertThrows(() => validate(makeSnap({ kernelVersion: 'not-a-version' })), 'not valid semver');
  });
  test('partial semver throws', () => {
    assertThrows(() => validate(makeSnap({ kernelVersion: '4.5' })), 'not valid semver');
  });
});

// ── VG-7..10: valid artifacts pass ───────────────────────────────────────────

suite('vg.VG7-10-valid-pass', () => {
  test('VG-7 URCK-SNAP passes validate', () => {
    const result = validate(makeSnap());
    assert(result.magic === 'URCK-SNAP', 'should return artifact');
  });
  test('VG-8 URCK-BP passes validate', () => {
    const result = validate(makeBP());
    assert(result.magic === 'URCK-BP');
  });
  test('VG-9 NEX-SNAP passes validate', () => {
    const result = validate(makeSnap({ magic: 'NEX-SNAP', kernelVersion: CURRENT_KERNEL_VERSION }));
    assert(result.magic === 'NEX-SNAP');
  });
  test('VG-10 NEX-CLIP passes validate', () => {
    const clip = {
      magic: 'NEX-CLIP', fmt: 1, kernelVersion: CURRENT_KERNEL_VERSION,
      clipId: 'test', seqRange: [0, 10],
    };
    const result = validate(clip);
    assert(result.magic === 'NEX-CLIP');
  });
  test('VG-11 missing kernelVersion is accepted', () => {
    const snap = makeSnap();
    delete snap.kernelVersion;
    const result = validate(snap);
    assert(result !== null);
  });
  test('VG-23 minor/patch differences accepted', () => {
    // 4.0.0 and 4.9.9 both have major=4, should pass
    const result = validate(makeSnap({ kernelVersion: '4.0.0' }));
    assert(result !== null);
  });
});

// ── VG-12..15: migrate() ──────────────────────────────────────────────────────

suite('vg.VG12-15-migrate', () => {
  test('VG-12 URCK-SNAP → NEX-SNAP', () => {
    const snap     = validate(makeSnap({ magic: 'URCK-SNAP' }));
    const migrated = migrate(snap);
    assertEqual(migrated.magic, 'NEX-SNAP');
  });
  test('VG-13 URCK-BP → NEX-BP', () => {
    const bp      = validate(makeBP({ magic: 'URCK-BP' }));
    const migrated = migrate(bp);
    assertEqual(migrated.magic, 'NEX-BP');
  });
  test('VG-14 migration is idempotent', () => {
    const snap    = validate(makeSnap());
    const once    = migrate(snap);
    const twice   = migrate(once);
    assertEqual(twice.magic, once.magic);
  });
  test('VG-15 migrate does not mutate input', () => {
    const snap     = validate(makeSnap());
    const original = snap.magic;
    migrate(snap);
    assertEqual(snap.magic, original, 'input magic should be unchanged');
  });
  test('VG-25 kernelVersion injected when absent after M-001', () => {
    const snap = makeSnap({ magic: 'URCK-SNAP' });
    delete snap.kernelVersion;
    const validated = validate(snap);
    const migrated  = migrate(validated);
    assert(migrated.kernelVersion === CURRENT_KERNEL_VERSION, 'should inject kernelVersion');
  });
});

// ── VG-16: GateValidationError ───────────────────────────────────────────────

suite('vg.VG16-error-type', () => {
  test('GateValidationError has name, context, message', () => {
    let err = null;
    try { validate(makeSnap({ magic: 'BAD' })); } catch(e) { err = e; }
    assert(err instanceof GateValidationError, 'instanceof GateValidationError');
    assert(err.name    === 'GateValidationError', 'name');
    assert(typeof err.context === 'object',        'context is object');
    assert(typeof err.message === 'string',        'message is string');
    assert(err.message.includes('[version-gate]'), 'message prefixed');
  });
});

// ── VG-17..20: createVersionGate() ───────────────────────────────────────────

suite('vg.VG17-20-createVersionGate', () => {
  test('VG-17 custom gate with current version', () => {
    const gate = createVersionGate({ kernelVersion: CURRENT_KERNEL_VERSION });
    const snap = gate.validate(makeSnap());
    assert(snap !== null);
  });
  test('VG-18 custom gate rejects wrong major', () => {
    const gate = createVersionGate({ kernelVersion: '5.0.0' });
    assertThrows(() => gate.validate(makeSnap({ kernelVersion: '4.5.2' })), 'major version mismatch');
  });
  test('VG-19 artifactType() returns correct strings', () => {
    const gate = createVersionGate();
    assertEqual(gate.artifactType(makeSnap({ magic: 'URCK-SNAP' })), 'snapshot');
    assertEqual(gate.artifactType(makeBP({ magic: 'URCK-BP' })),   'blueprint');
    assertEqual(gate.artifactType(makeSnap({ magic: 'NEX-SNAP' })), 'snapshot');
    assertEqual(gate.artifactType({ magic: 'NEX-CLIP' }),           'clip');
  });
  test('VG-20 migrations list exposed', () => {
    const gate = createVersionGate();
    assert(Array.isArray(gate.migrations), 'migrations is array');
    assert(gate.migrations.length > 0,     'at least one migration');
    assert(gate.migrations[0].id  === 'M-001', 'M-001 present');
    assert(typeof gate.migrations[0].desc === 'string', 'desc is string');
  });
  test('VG-22 invalid kernelVersion in createVersionGate throws', () => {
    assertThrows(() => createVersionGate({ kernelVersion: 'not-semver' }), 'invalid kernelVersion');
  });
});

// ── VG-21: validate returns artifact unchanged ────────────────────────────────

suite('vg.VG21-validate-passthrough', () => {
  test('validate returns exact same reference for valid artifact', () => {
    const snap   = makeSnap({ magic: 'NEX-SNAP' });
    const result = validate(snap);
    assert(result === snap, 'should return same reference');
  });
});

// ── VG-24: pipeline ───────────────────────────────────────────────────────────

suite('vg.VG24-pipeline', () => {
  test('validate → migrate produces NEX-SNAP from URCK-SNAP with all fields intact', () => {
    const raw     = makeSnap({ magic: 'URCK-SNAP', n: 42, total: 50 });
    const valid   = validate(raw);
    const result  = migrate(valid);
    assertEqual(result.magic, 'NEX-SNAP');
    assertEqual(result.fmt,   CURRENT_FORMAT_VERSION);
    assertEqual(result.n,     42);
    assertEqual(result.total, 50);
  });
});

// ── Run ───────────────────────────────────────────────────────────────────────

export const result = report('version-gate');
