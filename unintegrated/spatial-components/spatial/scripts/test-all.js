#!/usr/bin/env node
/**
 * spatial test runner
 * Runs every *.test.js found under packages/
 * Reports pass/fail per file. Exit 1 if any fail.
 */
import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = new URL('..', import.meta.url).pathname;

async function findTests(dir) {
  const tests = [];
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory() && entry !== 'node_modules') {
      tests.push(...await findTests(full));
    } else if (entry.endsWith('.test.js')) {
      tests.push(full);
    }
  }
  return tests;
}

async function runFile(file) {
  // Each test file exports nothing — it throws on failure, exits cleanly on pass.
  // Wrap in subprocess-style dynamic import + catch.
  try {
    await import(file);
    return { file, ok: true };
  } catch (e) {
    return { file, ok: false, error: e.message };
  }
}

const tests = await findTests(join(ROOT, 'packages'));
console.log(`\nSpatial test suite — ${tests.length} files\n${'─'.repeat(50)}`);

let pass = 0, fail = 0;
for (const t of tests) {
  const rel = relative(ROOT, t);
  const result = await runFile(t);
  if (result.ok) { console.log(`  ✓  ${rel}`); pass++; }
  else           { console.log(`  ✗  ${rel}\n     ${result.error}`); fail++; }
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${pass} passed  ${fail > 0 ? fail + ' FAILED' : ''}\n`);
if (fail > 0) process.exit(1);
