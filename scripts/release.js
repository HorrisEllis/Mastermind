#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
// RELEASE
// scripts/release.js
//
// §5.4 versions persist across the project · §17.8 every human
// decision is automatable · §1.1 nothing exists until proven.
//
// The version has drifted twice, and both times the mechanism was the
// same: bumping package.json and tagging git are two separate acts
// performed by a human, and the gap between them is where the two
// numbers get to disagree. The consistency test catches the drift; this
// removes the opportunity.
//
//   npm run release            → patch bump (0.1.6 → 0.1.7)
//   npm run release -- minor   → 0.1.6 → 0.2.0
//   npm run release -- major   → 0.1.6 → 1.0.0
//   npm run release -- 0.3.1   → exactly that
//
// It refuses to release a dirty tree, refuses to reuse a tag, runs the
// full test suite BEFORE bumping anything, and archives history after.
// Every step is checked; nothing is announced that was not verified.
// ═══════════════════════════════════════════════════════════════════

const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const git  = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

function fail(msg) {
  console.error('\n\u26A0  RELEASE ABORTED: ' + msg + '\n');
  process.exit(1);
}

// ── Preconditions ───────────────────────────────────────────────────
let dirty;
try { dirty = git('status', '--short'); }
catch (e) { fail('not a git repository'); }

if (dirty) {
  fail('working tree has uncommitted changes. Commit them first — a release ' +
       'tag must point at a commit that actually contains the release.\n\n' +
       dirty.split('\n').map(l => '     ' + l).join('\n'));
}

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = pkg.version;

const arg = process.argv[2] || 'patch';
let next;
if (/^\d+\.\d+\.\d+$/.test(arg)) {
  next = arg;
} else {
  const [maj, min, pat] = current.split('.').map(Number);
  if (arg === 'major')      next = `${maj + 1}.0.0`;
  else if (arg === 'minor') next = `${maj}.${min + 1}.0`;
  else if (arg === 'patch') next = `${maj}.${min}.${pat + 1}`;
  else fail('unknown bump "' + arg + '" — use patch, minor, major, or an explicit x.y.z');
}

const tag = 'v' + next;
const existing = git('tag', '--list', tag);
if (existing) fail('tag ' + tag + ' already exists. Pick another version.');

// ── Tests run BEFORE the bump ───────────────────────────────────────
// Releasing a version that fails its own suite is worse than not
// releasing: the tag makes the failure look blessed.
console.log('\n\u25B8 Running the full suite before bumping\u2026\n');
try {
  execFileSync('node', ['tests/run-all.js'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  fail('tests failed. Nothing was bumped, committed or tagged.');
}

// ── Bump ────────────────────────────────────────────────────────────
pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Keep the spec's stated version in step — the consistency test checks it.
const specPath = path.join(ROOT, 'docs', 'VAULT.spec.md');
try {
  const spec = fs.readFileSync(specPath, 'utf8');
  fs.writeFileSync(specPath, spec.replace(
    /\| \*\*Project version\*\* \| [^|]+ \|/,
    '| **Project version** | ' + next + ' |'
  ));
} catch (e) { /* spec absent — the consistency test will say so */ }

// ── Commit and tag as ONE step ──────────────────────────────────────
git('add', '-A');
git('commit', '-m', 'v' + next);
git('tag', tag);

// ── Verify what we just claimed ─────────────────────────────────────
const tagged = git('rev-parse', tag);
const head   = git('rev-parse', 'HEAD');
if (tagged !== head) fail('tag ' + tag + ' does not point at HEAD');

const after = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
if (after !== next) fail('package.json did not take the new version');

console.log('\n\u25B8 Verifying version consistency\u2026\n');
try {
  execFileSync('node', ['tests/run-version-consistency.test.js'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  fail('version consistency check failed AFTER tagging — inspect before pushing');
}

// ── Archive history ─────────────────────────────────────────────────
console.log('\n\u25B8 Archiving history\u2026');
try {
  execFileSync('node', ['scripts/archive-history.js'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.warn('\n\u26A0  Release is tagged, but the history archive failed. Run `npm run archive`.');
}

console.log('\n\u2713 Released ' + current + ' \u2192 ' + next + '  (tag ' + tag + ')');
console.log('  push:  git push && git push --tags\n');
