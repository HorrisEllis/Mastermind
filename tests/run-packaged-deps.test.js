'use strict';
// This is the systemic fix, not just the one-off patch: clearglass-config.js
// was added last session but never added to package.json's `files` list.
// In dev mode that's invisible (Node reads straight off disk); in a
// PACKAGED build, only listed files are bundled, so require('./clearglass-
// config') threw MODULE_NOT_FOUND, clearglass-main.js failed to load
// entirely, and every single ClearGlass IPC handler silently never
// registered — not just the one that happened to be visible in a
// screenshot. The whole prior test suite passed anyway, because tests
// require() files directly off disk too, bypassing packaging completely.
// This test statically resolves every relative require() reachable from
// main.js and clearglass-main.js and fails loudly if any of them would
// NOT be included in a real packaged build.
const path = require('path');
const fs = require('fs');
const { t, summary, assert } = require('./harness');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const filesList = pkg.build.files;

// Turn package.json's files list into a matcher. Entries are either
// exact relative paths ("main.js", "foundation/ai/clearglass-main.js")
// or simple globs ("assets/**/*"). Exclusions ("!node_modules/**/*")
// are intentionally not needed here since we're only ever checking
// real source files we found via require(), never node_modules.
function isShipped(relPath) {
  const norm = relPath.split(path.sep).join('/');
  for (const entry of filesList) {
    if (entry.startsWith('!')) continue;
    if (entry === norm) return true;
    if (entry.includes('*')) {
      const reStr = '^' + entry.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/(?<!\.)\*/g, '[^/]*') + '$';
      if (new RegExp(reStr).test(norm)) return true;
    }
  }
  return false;
}

// Extract require('./x') / require('../x') calls — deliberately not
// require('electron'), require('fs'), etc (no leading dot = built-in or
// npm package, out of scope for "did we ship this file").
function findRelativeRequires(fileText) {
  const out = [];
  const re = /require\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(fileText))) out.push(m[1]);
  return out;
}

function resolveRequire(fromFile, spec) {
  let resolved = path.join(path.dirname(fromFile), spec);
  // require() resolves extension-less specifiers to .js by Node's own
  // rules; match that so 'require(./clearglass-config)' maps to the
  // real clearglass-config.js file on disk.
  if (!fs.existsSync(resolved) && fs.existsSync(resolved + '.js')) resolved += '.js';
  return resolved;
}

// Walk the real require graph starting from main.js, exactly like Node
// itself would at runtime — this is what "reachable from the packaged
// entry point" actually means, not a guess at which files matter.
function walkRequireGraph(entryFile) {
  const visited = new Set();
  const queue = [entryFile];
  while (queue.length) {
    const file = queue.shift();
    if (visited.has(file)) continue;
    visited.add(file);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const spec of findRelativeRequires(text)) {
      const resolved = resolveRequire(file, spec);
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

async function run() {
  console.log('\n== packaged-build dependency completeness ==');

  await t('REGRESSION: every file require()-reachable from main.js is actually in package.json\'s shipped files list', async () => {
    const graph = walkRequireGraph(path.join(ROOT, 'main.js'));
    const missing = [];
    for (const absFile of graph) {
      const rel = path.relative(ROOT, absFile);
      if (!isShipped(rel)) missing.push(rel);
    }
    assert.deepStrictEqual(missing, [],
      'these files are require()d but would NOT ship in a packaged build (this exact bug broke every ClearGlass IPC handler silently last time): ' + missing.join(', '));
  });

  await t('clearglass-config.js specifically is shipped (the actual bug this test suite exists to catch)', async () => {
    assert.ok(isShipped('foundation/ai/clearglass-config.js'));
  });

  await t('sanity check: the matcher itself correctly rejects a file that really is missing', async () => {
    assert.strictEqual(isShipped('foundation/ai/definitely-not-a-real-file.js'), false);
  });

  const fails = summary('packaged-build dependency completeness');
  process.exitCode = fails ? 1 : 0;
}

run();
