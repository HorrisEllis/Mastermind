#!/usr/bin/env node
'use strict';
// ═══════════════════════════════════════════════════════════════════
// ARCHIVE HISTORY
// scripts/archive-history.js
//
// §0.3 Information must never be lost · §17.8 Every human decision is
// automatable · §1.1 Nothing exists until proven.
//
// This repository has no remote. That means the .git directory is the
// ONLY copy of this project's history, and it survives exactly as long
// as the folder it sits in. A single-file `git bundle` is a complete,
// clonable copy of every commit, branch and tag — small enough to keep
// anywhere, restorable with a plain `git clone`.
//
// The bundle is written to dist/history/ and is gitignored — DELIBERATELY.
// Earlier versions of this script's output got committed back into the
// very repo it's a snapshot of, which defeats its own purpose (if .git
// is ever lost, a bundle stored as a blob inside .git is lost with it)
// and caused real, compounding growth: `git bundle create --all` bundles
// EVERYTHING reachable, so each new bundle necessarily contained every
// previous bundle's blob data too. Eight releases took the repo from
// ~4MB to 164MB+ this way before the pattern was caught and fixed. The
// bundle is a portable backup artifact, not tracked history — git
// already IS the tracked history. Hand it out as a separate file
// (alongside a normal delivery, or on its own) when a backup is
// actually needed; never `git add` it.
//
// Run:  npm run archive
//
// It does three things, and refuses to claim success on any of them
// without checking:
//   1. writes  dist/history/mastermind-<version>-<sha>-<date>.bundle
//   2. verifies the bundle records a COMPLETE history (git bundle verify)
//   3. clones it into a temp dir and counts commits against the source
//
// Step 3 exists because `verify` checks the bundle's internal claim.
// Cloning it is the thing that proves the claim is true.
//
// RESTORE:  git clone mastermind-<...>.bundle mastermind
// ═══════════════════════════════════════════════════════════════════

const { execFileSync } = require('child_process');
const fs   = require('fs');
const os   = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

function fail(msg) {
  console.error('\n\u26A0  ARCHIVE FAILED: ' + msg);
  console.error('   History has NOT been archived. Do not rely on this run.\n');
  process.exit(1);
}

let version = 'unknown';
try {
  version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
} catch (e) { fail('cannot read package.json: ' + e.message); }

let sha, commits, dirty;
try {
  sha     = git('rev-parse', '--short', 'HEAD');
  commits = parseInt(git('rev-list', '--all', '--count'), 10);
  dirty   = git('status', '--short');
} catch (e) { fail('not a git repository, or git is unavailable: ' + e.message); }

if (dirty) {
  // Loud, not fatal: archiving a dirty tree is legitimate, but silently
  // archiving one and letting someone believe their uncommitted work is
  // safe would be a §1.2 violation. A bundle only ever contains commits.
  console.warn('\n\u26A0  Working tree has uncommitted changes. A bundle stores COMMITS ONLY —');
  console.warn('   the following are NOT in the archive:\n');
  console.warn(dirty.split('\n').map(l => '     ' + l).join('\n'));
  console.warn('\n   Commit first if you want them preserved.\n');
}

const outDir = path.join(ROOT, 'dist', 'history');
fs.mkdirSync(outDir, { recursive: true });

const stamp = new Date().toISOString().slice(0, 10);
const file  = path.join(outDir, `mastermind-${version}-${sha}-${stamp}.bundle`);

try {
  execFileSync('git', ['bundle', 'create', file, '--all'], { cwd: ROOT, stdio: 'pipe' });
} catch (e) { fail('git bundle create: ' + e.message); }

// ── Proof 1: the bundle says it is complete ─────────────────────────
let verifyOut = '';
try {
  verifyOut = execFileSync('git', ['bundle', 'verify', file], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
} catch (e) { fail('git bundle verify rejected the archive: ' + e.message); }

if (!/complete history/i.test(verifyOut)) {
  fail('bundle does not record a complete history:\n' + verifyOut);
}

// ── Proof 2: it actually clones, and nothing is missing ─────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-archive-check-'));
let restored;
try {
  execFileSync('git', ['clone', '--quiet', file, path.join(tmp, 'restored')], { stdio: 'pipe' });
  restored = parseInt(
    execFileSync('git', ['rev-list', '--all', '--count'], { cwd: path.join(tmp, 'restored'), encoding: 'utf8' }).trim(),
    10
  );
} catch (e) {
  fail('the bundle verified but would not clone: ' + e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
}

if (restored !== commits) {
  fail(`commit count mismatch — source has ${commits}, restored clone has ${restored}`);
}

const bytes = fs.statSync(file).size;
console.log('\n\u2713 History archived and proven restorable');
console.log('  file     ' + path.relative(ROOT, file));
console.log('  size     ' + (bytes / 1024).toFixed(1) + ' KB');
console.log('  commits  ' + commits + ' (clone-verified, not just declared)');
console.log('  head     ' + sha + '  v' + version);
console.log('\n  restore:  git clone ' + path.basename(file) + ' mastermind\n');
