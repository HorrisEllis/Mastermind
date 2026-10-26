'use strict';
// ═══════════════════════════════════════════════════════════════════
// VAULT ARCHIVE PROBE
//
// A vault file is JSON, always. If the bytes at the vault path are
// actually a compressed archive — a backup .zip left at the wrong
// path, an old export renamed onto mastermind.vault, a sync client
// dropping a conflict copy in place — the boot pre-flight used to
// report the same "not valid JSON — it is corrupt" verdict it gives a
// genuinely damaged vault. True, but the wrong diagnosis: one says
// "restore a snapshot", the other says "point the data folder
// somewhere else". VaultEnvelope.identifyArchive() and
// atomic-write.js's probeFormat() exist to tell them apart, on the
// raw byte prefix, before anything has tried to decode the file as
// UTF-8 text (which can itself mangle the very bytes a signature
// check depends on).
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VaultEnvelope = require(path.join(ROOT, 'foundation', 'vault', 'vault-envelope.js'));
const { probeFormat } = require(path.join(ROOT, 'foundation', 'vault', 'atomic-write.js'));

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nVAULT ARCHIVE PROBE\n');
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
  console.log('\nvault-archive-probe: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// ── identifyArchive: pure, byte-level ──────────────────────────────────────

t('identifies a standard zip', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0])), 'zip');
});

t('identifies an empty zip', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0x50, 0x4B, 0x05, 0x06, 0, 0])), 'zip');
});

t('identifies gzip', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0x1F, 0x8B, 0x08, 0])), 'gzip');
});

t('identifies 7z', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C])), '7z');
});

t('identifies rar', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00])), 'rar');
});

t('identifies bzip2', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from('BZh9', 'ascii')), 'bzip2');
});

t('identifies xz', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00])), 'xz');
});

t('identifies a tar by its offset-257 ustar magic', () => {
  const buf = Buffer.alloc(262);
  Buffer.from('ustar', 'ascii').copy(buf, 257);
  assert.strictEqual(VaultEnvelope.identifyArchive(buf), 'tar');
});

t('a real vault envelope (JSON) matches no signature', () => {
  const json = Buffer.from(JSON.stringify({ format: 'mastermind-vault', version: 6 }), 'utf8');
  assert.strictEqual(VaultEnvelope.identifyArchive(json), null);
});

t('a plain vault (JSON, unencrypted) matches no signature', () => {
  const json = Buffer.from(JSON.stringify({ format: 'mastermind-vault-plain', encrypted: false }), 'utf8');
  assert.strictEqual(VaultEnvelope.identifyArchive(json), null);
});

t('genuinely random corruption matches no signature', () => {
  const buf = Buffer.from([0x00, 0xFF, 0x12, 0x34, 0xAB, 0xCD]);
  assert.strictEqual(VaultEnvelope.identifyArchive(buf), null);
});

t('too short to contain any signature returns null rather than throwing', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.from([0x50])), null);
  assert.strictEqual(VaultEnvelope.identifyArchive(Buffer.alloc(0)), null);
});

t('handles non-buffer input without throwing', () => {
  assert.strictEqual(VaultEnvelope.identifyArchive(null), null);
  assert.strictEqual(VaultEnvelope.identifyArchive(undefined), null);
  assert.strictEqual(VaultEnvelope.identifyArchive('not bytes'), null);
});

// ── probeFormat: real file, main-process I/O ───────────────────────────────

function withTmpDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-archive-probe-'));
  try { fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

t('probeFormat reports a zip masquerading as a .vault file', () => {
  withTmpDir((dir) => {
    const p = path.join(dir, 'mastermind.vault');
    fs.writeFileSync(p, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0, 0, 0, 0, 0, 0]));
    const result = probeFormat(p);
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.archiveKind, 'zip');
  });
});

t('probeFormat reports null archiveKind for a real vault envelope', () => {
  withTmpDir((dir) => {
    const p = path.join(dir, 'mastermind.vault');
    fs.writeFileSync(p, JSON.stringify({ format: 'mastermind-vault', version: 6 }), 'utf8');
    const result = probeFormat(p);
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.archiveKind, null);
  });
});

t('probeFormat on a missing file reports exists: false, never throws', () => {
  const result = probeFormat('/nonexistent/path/mastermind.vault');
  assert.strictEqual(result.exists, false);
  assert.strictEqual(result.archiveKind, null);
});

t('probeFormat only reads a bounded prefix, not the whole file', () => {
  withTmpDir((dir) => {
    const p = path.join(dir, 'mastermind.vault');
    // A real vault could be many megabytes; the probe must not read it all
    // just to answer "is this an archive". Header first, junk after.
    const big = Buffer.concat([Buffer.from('{"format":"mastermind-vault"}'), Buffer.alloc(5 * 1024 * 1024, 0x41)]);
    fs.writeFileSync(p, big);
    const t0 = Date.now();
    const result = probeFormat(p);
    const elapsed = Date.now() - t0;
    assert.strictEqual(result.exists, true);
    assert.strictEqual(result.archiveKind, null);
    assert.ok(elapsed < 500, 'probeFormat should be near-instant regardless of file size, took ' + elapsed + 'ms');
  });
});

run();
