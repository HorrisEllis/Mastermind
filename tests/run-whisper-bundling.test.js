'use strict';
// ═══════════════════════════════════════════════════════════════════
// WHISPER BUNDLING
//
// The transcription backend existed and was even wired into the orb
// (run-orb-capture.test.js), but nothing shipped the actual binary —
// every real machine needed whisper.cpp installed by hand first. This
// verifies the bundled resources/whisper/ files are genuine (not
// zero-byte placeholders or corrupted downloads), that whisper.js's own
// path resolution actually finds them — in both a packaged build AND
// BUILD_DEV.bat's unpackaged launch — and that the build pipeline
// (package.json's extraResources, BUILD.bat's model fetch) is wired to
// carry them into a real installer.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WHISPER_DIR = path.join(ROOT, 'resources', 'whisper');

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nWHISPER BUNDLING\n');
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
  console.log('\nwhisper-bundling: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// A minimal PE header check — bytes 0-1 are 'MZ' (DOS header), and the
// offset at 0x3C points to the 'PE\0\0' signature. Enough to catch an
// HTML error page or a truncated download saved under the right
// filename, which a bare existsSync() check would miss entirely.
function isPeExecutable(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.alloc(64);
    fs.readSync(fd, buf, 0, 64, 0);
    if (buf.toString('ascii', 0, 2) !== 'MZ') return false;
    const peOffset = buf.readUInt32LE(0x3C);
    const peSig = Buffer.alloc(4);
    fs.readSync(fd, peSig, 0, 4, peOffset);
    return peSig[0] === 0x50 && peSig[1] === 0x45; // 'P','E'
  } finally {
    fs.closeSync(fd);
  }
}

const REQUIRED_FILES = ['whisper-cli.exe', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu.dll', 'whisper.dll'];

t('resources/whisper/ exists in the project', () => {
  assert.ok(fs.existsSync(WHISPER_DIR), 'resources/whisper/ is missing entirely');
});

for (const file of REQUIRED_FILES) {
  t(`${file} is present and is a real, non-empty Windows PE binary`, () => {
    const p = path.join(WHISPER_DIR, file);
    assert.ok(fs.existsSync(p), file + ' is missing');
    const size = fs.statSync(p).size;
    assert.ok(size > 10000, file + ' is suspiciously small (' + size + ' bytes) — likely a corrupted or placeholder download');
    assert.ok(isPeExecutable(p), file + ' does not have a valid PE header — not a real Windows binary');
  });
}

t('a license file is present for the bundled binary (MIT, per whisper.cpp)', () => {
  const p = path.join(WHISPER_DIR, 'LICENSE-whisper.cpp.txt');
  assert.ok(fs.existsSync(p));
  const text = fs.readFileSync(p, 'utf8');
  assert.ok(/MIT License/i.test(text));
});

t('the models/ directory exists (model itself is fetched at build time, not committed)', () => {
  assert.ok(fs.existsSync(path.join(WHISPER_DIR, 'models')));
});

t("whisper.js's candidatePaths() includes the project-root resources/whisper location (dev-mode fallback)", () => {
  const whisper = require(path.join(ROOT, 'foundation', 'ai', 'whisper.js'));
  const candidates = whisper.candidatePaths();
  const expected = path.join(ROOT, 'resources', 'whisper', 'whisper-cli');
  assert.ok(
    candidates.some((c) => c.startsWith(expected)),
    'candidatePaths() must include the dev-mode project-relative path, not just process.resourcesPath — BUILD_DEV.bat runs unpackaged, where resourcesPath points at Electron\u2019s own resources, not this app\u2019s'
  );
});

t("whisper.js's resolveModel() finds the models/ directory relative to the project in dev mode", () => {
  const whisper = require(path.join(ROOT, 'foundation', 'ai', 'whisper.js'));
  const resolved = whisper.resolveModel({});
  assert.ok(
    resolved.path.includes(path.join('whisper', 'models')),
    'resolveModel() should resolve into resources/whisper/models/, got: ' + resolved.path
  );
});

t('package.json wires resources/whisper/ into the packaged app via extraResources', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const extra = pkg.build && pkg.build.extraResources;
  assert.ok(Array.isArray(extra) && extra.length > 0, 'package.json build.extraResources is missing');
  const whisperEntry = extra.find((e) => e.from === 'resources/whisper');
  assert.ok(whisperEntry, 'no extraResources entry copies resources/whisper/');
  assert.strictEqual(whisperEntry.to, 'whisper', 'must land at resources/whisper/ in the packaged app — the exact path candidatePaths() checks first');
});

t('BUILD.bat fetches the model before running the actual build', () => {
  const bat = fs.readFileSync(path.join(ROOT, 'BUILD.bat'), 'utf8');
  const fetchIdx = bat.search(/Invoke-WebRequest.*ggml-base\.bin/i);
  const buildIdx = bat.indexOf('npm run build');
  assert.ok(fetchIdx > -1, 'BUILD.bat has no model-fetch step');
  assert.ok(buildIdx > -1, 'BUILD.bat has no npm run build step to compare against');
  assert.ok(fetchIdx < buildIdx, 'the model must be fetched BEFORE packaging, or extraResources ships an empty models/ folder');
});

t('BUILD.bat skips the download if the model is already present (no re-fetch on every build)', () => {
  const bat = fs.readFileSync(path.join(ROOT, 'BUILD.bat'), 'utf8');
  assert.ok(/if not exist.*ggml-base\.bin/i.test(bat), 'must check for the existing file before downloading a 142MB model again');
});

t('BUILD.bat does not treat a failed model download as a fatal build error', () => {
  const bat = fs.readFileSync(path.join(ROOT, 'BUILD.bat'), 'utf8');
  const fetchBlockStart = bat.search(/Invoke-WebRequest.*ggml-base\.bin/i);
  const nearby = bat.slice(fetchBlockStart, fetchBlockStart + 600);
  assert.ok(!/exit \/b 1/.test(nearby), 'a failed model download should warn, not abort the whole build — the app still works without voice capture');
});

run();
