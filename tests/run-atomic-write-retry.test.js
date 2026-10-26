'use strict';
// ═══════════════════════════════════════════════════════════════════
// ATOMIC WRITE — retry on a locked destination
//
// fs.renameSync failing because the destination file is transiently
// held by something else — antivirus scanning it, a sync client
// (OneDrive/Dropbox) noticing the change, Windows Search indexing it,
// even this app's own previous read not having fully released its
// handle — is one of the most commonly reported Node-on-Windows file
// I/O problems, and the lock almost always clears within milliseconds.
// There was no retry at all: a single transient EBUSY meant the save
// was reported as failed, even though the data itself was fine.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const atomicWriteModule = require(path.join(ROOT, 'foundation', 'vault', 'atomic-write.js'));
const { atomicWrite, _renameWithRetry } = atomicWriteModule;

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nATOMIC WRITE — retry on a locked destination\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try {
      fn();
      console.log('  \u2713 ' + name);
      pass++;
    } catch (e) {
      console.log('  \u2717 ' + name);
      console.log('      ' + e.message);
    }
  }
  console.log('\natomic-write-retry: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// ── _renameWithRetry: the actual fix, isolated ────────────────────────
// fs.renameSync is monkey-patched for the duration of each test and
// restored immediately after — atomic-write.js requires the same
// cached 'fs' module object this test does, so patching it here really
// does change what the code under test sees.

function withMockedRename(impl, fn) {
  const real = fs.renameSync;
  fs.renameSync = impl;
  try { fn(); } finally { fs.renameSync = real; }
}

t('a transient EBUSY that clears on the second attempt succeeds, not fails', () => {
  let calls = 0;
  withMockedRename((from, to) => {
    calls++;
    if (calls === 1) { const e = new Error('resource busy'); e.code = 'EBUSY'; throw e; }
    return undefined; // succeeds
  }, () => {
    assert.doesNotThrow(() => _renameWithRetry('/tmp/x.tmp', '/tmp/x', 6, 1));
    assert.strictEqual(calls, 2, 'must have retried exactly once before succeeding');
  });
});

t('EPERM and EACCES are treated as transient too — same retry path as EBUSY', () => {
  for (const code of ['EPERM', 'EACCES']) {
    let calls = 0;
    withMockedRename((from, to) => {
      calls++;
      if (calls === 1) { const e = new Error('locked'); e.code = code; throw e; }
      return undefined;
    }, () => {
      assert.doesNotThrow(() => _renameWithRetry('/tmp/x.tmp', '/tmp/x', 6, 1));
      assert.strictEqual(calls, 2, code + ' should have triggered exactly one retry');
    });
  }
});

t('a non-transient error (e.g. ENOENT) fails immediately — no pointless retrying', () => {
  let calls = 0;
  withMockedRename(() => {
    calls++;
    const e = new Error('no such file'); e.code = 'ENOENT'; throw e;
  }, () => {
    assert.throws(() => _renameWithRetry('/tmp/x.tmp', '/tmp/x', 6, 1), /no such file/);
    assert.strictEqual(calls, 1, 'a real error must not be retried at all');
  });
});

t('a lock that never clears exhausts all retries and then throws — does not retry forever', () => {
  let calls = 0;
  withMockedRename(() => {
    calls++;
    const e = new Error('still busy'); e.code = 'EBUSY'; throw e;
  }, () => {
    assert.throws(() => _renameWithRetry('/tmp/x.tmp', '/tmp/x', 3, 1), /still busy/);
    assert.strictEqual(calls, 4, '3 retries + the original attempt = 4 total calls');
  });
});

t('the default retry count is generous enough for a real transient lock without being unbounded', () => {
  let calls = 0;
  withMockedRename(() => {
    calls++;
    const e = new Error('busy'); e.code = 'EBUSY'; throw e;
  }, () => {
    assert.throws(() => _renameWithRetry('/tmp/x.tmp', '/tmp/x', undefined, 1)); // default retry count
    assert.ok(calls >= 4 && calls <= 10, 'default retries should be in a sane range, got ' + calls);
  });
});

// ── atomicWrite(): real end-to-end filesystem behavior ────────────────

t('a real atomic write actually lands the exact bytes on disk', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-atomic-'));
  const target = path.join(dir, 'mastermind.vault');
  try {
    const res = atomicWrite(target, '{"hello":"world"}');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"hello":"world"}');
    assert.ok(!fs.existsSync(target + '.tmp'), 'the temp file must not be left behind after a successful write');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

t('a real atomic write recovers through a transient lock via the actual retry path, not just the unit test of the helper', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-atomic-'));
  const target = path.join(dir, 'mastermind.vault');
  let renameCalls = 0;
  const real = fs.renameSync;
  fs.renameSync = (from, to) => {
    renameCalls++;
    if (renameCalls === 1) { const e = new Error('busy'); e.code = 'EBUSY'; throw e; }
    return real(from, to);
  };
  try {
    const res = atomicWrite(target, '{"a":1}');
    assert.strictEqual(res.ok, true, 'the write must succeed once the lock clears, not fail on the first transient error');
    assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"a":1}');
  } finally {
    fs.renameSync = real;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

t('a permanently locked destination reports a clear, specific reason rather than a bare OS error code', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-atomic-'));
  const target = path.join(dir, 'mastermind.vault');
  const real = fs.renameSync;
  fs.renameSync = () => { const e = new Error('resource busy or locked'); e.code = 'EBUSY'; throw e; };
  try {
    const res = atomicWrite(target, '{"a":1}');
    assert.strictEqual(res.ok, false);
    assert.ok(/locked by something else/i.test(res.error), 'the error should explain WHY (antivirus/sync client/etc), not just repeat the OS code');
    assert.strictEqual(res.code, 'EBUSY');
  } finally {
    fs.renameSync = real;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

t('a failed write does not leave a stray .tmp file behind to confuse the next save', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-atomic-'));
  const target = path.join(dir, 'mastermind.vault');
  const real = fs.renameSync;
  fs.renameSync = () => { const e = new Error('busy'); e.code = 'EBUSY'; throw e; };
  try {
    atomicWrite(target, '{"a":1}');
    assert.ok(!fs.existsSync(target + '.tmp'), '.tmp must be cleaned up even when the rename never succeeds');
  } finally {
    fs.renameSync = real;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

run();
