'use strict';
// ═══════════════════════════════════════════════════════════════════
// VERSION CONSISTENCY — §5.4
//
// "Versions persist across the entire project."
//
// This has drifted twice. First the shipped build carried 3.2.0 / 3.1 /
// 3.0 / 3.0.5 simultaneously. Then the v0.1.1 fix replaced hardcoded
// strings with `window.MM_VERSION` — which was never assigned anywhere,
// because `let MM_VERSION` at the top level of a classic script does not
// create a window property. Every one of those reads returned undefined
// and rendered as "unknown". A fix that silently produced a THIRD wrong
// answer, and nothing was checking.
//
// So: package.json is the source. preload reads it synchronously and
// exposes it as NXAPI.version. index-browser.html assigns
// window.MM_VERSION from that before any module evaluates. Everything
// else reads window.MM_VERSION. Nothing hardcodes.
//
// These tests fail if any of that stops being true.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const results = [];

function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PKG  = JSON.parse(read('package.json'));

// Strip comments and string-free regions so a version mentioned in prose
// ("the v0.1.3 fault") is not mistaken for a hardcoded one in code.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Placeholders that are allowed to exist: they are what the code falls back
// to when the real version genuinely is not available yet.
const ALLOWED = new Set(['0.0.0-dev', '0.0.0-browser', '0.0.0-unknown', '0.0.0']);

// Files that must never hardcode a version in executable code.
const APP_SOURCES = [
  'nexus-engine.js',
  'nexus-canvas.js',
  'main.js',
  'preload.js',
  'foundation/vault/mastermind-vault.js',
  'foundation/vault/vault-envelope.js',
  'foundation/vault/vault-crypto.js',
  'foundation/vault/vault-guard.js',
  'foundation/vault/vault-boot.js',
  'foundation/vault/vault-snapshots.js',
  'foundation/vault/vault-ledger.js',
  'foundation/vault/atomic-write.js',
  'foundation/core/mastermind-foundation.js',
  'foundation/bus/mastermind-warp-spine.js',
];

console.log('\nVERSION CONSISTENCY (\u00a75.4)\n');

t('package.json has a valid semver version', () => {
  assert.ok(/^\d+\.\d+\.\d+$/.test(PKG.version), 'got: ' + PKG.version);
});

t('the newest git tag matches package.json', () => {
  let tags;
  try {
    tags = execFileSync('git', ['tag', '--list', 'v*', '--sort=-v:refname'], { cwd: ROOT, encoding: 'utf8' })
      .trim().split('\n').filter(Boolean);
  } catch (e) {
    console.log('      (no git available — skipped)');
    return;
  }
  if (!tags.length) { console.log('      (no version tags yet — skipped)'); return; }
  assert.strictEqual(tags[0], 'v' + PKG.version,
    'newest tag is ' + tags[0] + ' but package.json says ' + PKG.version +
    ' — tag the release, or bump package.json');
});

t('the working tree is committed at the tagged version', () => {
  let dirty;
  try { dirty = execFileSync('git', ['status', '--short'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
  catch (e) { console.log('      (no git available — skipped)'); return; }
  if (dirty) {
    // Informational, not fatal: mid-edit is a legitimate state to run tests in.
    console.log('      (working tree has uncommitted changes — version tag refers to the last commit)');
  }
});

t('no app source hardcodes a version string in code', () => {
  const offenders = [];
  for (const rel of APP_SOURCES) {
    let src;
    try { src = read(rel); } catch (e) { continue; }
    const code = stripComments(src);
    const re = /['"](\d+\.\d+\.\d+(?:-[\w.]+)?)['"]/g;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (ALLOWED.has(m[1])) continue;
      // Data-FORMAT versions are legitimately independent of the app version
      // (the vault envelope's `version: 6` is the same idea). They are
      // allowed only when assigned to a constant that says so in its name,
      // so the distinction is visible at the definition rather than argued
      // about later.
      const before = code.slice(Math.max(0, m.index - 80), m.index);
      if (/\b[A-Z_]*FORMAT[A-Z_]*_VERSION\s*=\s*$/.test(before)) continue;
      const line = code.slice(0, m.index).split('\n').length;
      offenders.push(rel + ':' + line + ' → "' + m[1] + '"');
    }
  }
  assert.deepStrictEqual(offenders, [],
    'hardcoded versions found (read window.MM_VERSION instead):\n       ' + offenders.join('\n       '));
});

t('preload exposes the version synchronously from package.json', () => {
  const src = read('preload.js');
  assert.ok(/require\(['"]\.\/package\.json['"]\)\.version/.test(src),
    'preload must read package.json directly, not over async IPC');
  assert.ok(/version:\s*_pkgVersion/.test(src),
    'preload must expose it as NXAPI.version');
});

t('window.MM_VERSION is assigned before any module script loads', () => {
  const html = read('index-browser.html');
  const assignIdx = html.indexOf('window.MM_VERSION =');
  assert.ok(assignIdx > -1, 'index-browser.html never assigns window.MM_VERSION');

  // Every script that reads window.MM_VERSION must load after the assignment.
  const readers = [
    'foundation/vault/vault-envelope.js',
    'foundation/vault/vault-crypto.js',
    'foundation/vault/vault-guard.js',
    'foundation/vault/mastermind-vault.js',
    'nexus-canvas.js',
    'nexus-engine.js',
  ];
  for (const r of readers) {
    const tagIdx = html.indexOf('src="' + r + '"');
    if (tagIdx === -1) continue;
    assert.ok(tagIdx > assignIdx,
      r + ' loads BEFORE window.MM_VERSION is assigned — it would read undefined');
  }
});

t('nexus-engine seeds MM_VERSION from the global and writes it back', () => {
  const src = read('nexus-engine.js');
  assert.ok(/let MM_VERSION = \(typeof window !== 'undefined' && window\.MM_VERSION\)/.test(src),
    'MM_VERSION must be seeded from window.MM_VERSION');
  assert.ok(/window\.MM_VERSION = MM_VERSION;/.test(src),
    'mmApplyVersion must write the resolved version back to the global');
});

t('BUILD.bat reads the version instead of hardcoding it', () => {
  let src;
  try { src = read('BUILD.bat'); } catch (e) { console.log('      (no BUILD.bat — skipped)'); return; }
  assert.ok(/package\.json.*version/i.test(src), 'BUILD.bat must read package.json for the version');
  const hard = src.match(/\b\d+\.\d+\.\d+\b/g) || [];
  const bad = hard.filter(v => !/^\d+\.0\.0$/.test(v));   // "v18+" style minimums are fine
  assert.deepStrictEqual(bad, [], 'BUILD.bat hardcodes: ' + bad.join(', '));
});

t('the spec records the current project version', () => {
  const spec = read('docs/VAULT.spec.md');
  assert.ok(spec.includes('| **Project version** | ' + PKG.version + ' |'),
    'docs/VAULT.spec.md still names a different project version');
});

const fails = results.filter(r => !r.ok);
console.log('\nversion-consistency: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
