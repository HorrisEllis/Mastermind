#!/usr/bin/env node
/**
 * spatial check — verify all packages load and export expected surfaces.
 */
import { readdir } from 'fs/promises';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const ROOT   = fileURLToPath(new URL('..', import.meta.url));
const PKGS   = join(ROOT, 'packages');
const entries = (await readdir(PKGS)).filter(e => !e.startsWith('.'));
const results = [];

for (const pkg of entries) {
  const pkgDir  = join(PKGS, pkg);
  let pkgJson   = null;
  let entryPath = null;

  try {
    pkgJson = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
    // Resolve the main entry from exports or main
    const exp = pkgJson.exports?.['.'] ?? pkgJson.main;
    if (!exp) throw new Error('no exports["."] or main in package.json');
    entryPath = resolve(pkgDir, exp);
  } catch (e) {
    results.push({ pkg, name: pkg, version: '?', ok: false, error: e.message });
    continue;
  }

  try {
    const m = await import(entryPath);
    results.push({ pkg, name: pkgJson.name ?? pkg, version: pkgJson.version ?? '?', ok: true, exports: Object.keys(m) });
  } catch (e) {
    results.push({ pkg, name: pkgJson.name ?? pkg, version: pkgJson.version ?? '?', ok: false, error: e.message.split('\n')[0] });
  }
}

console.log('\nSpatial v2 — package check\n' + '═'.repeat(60));
const nw = Math.max(...results.map(r => r.name.length)) + 2;
for (const r of results) {
  const n = r.name.padEnd(nw);
  if (r.ok) console.log(`  ✓  ${n} v${r.version}   ${r.exports.length} exports`);
  else      console.log(`  ✗  ${n} v${r.version}   ERROR: ${r.error}`);
}
const fail = results.filter(r => !r.ok).length;
console.log('═'.repeat(60));
console.log(`  ${results.filter(r => r.ok).length}/${results.length} packages OK${fail ? `   ← ${fail} broken` : ''}\n`);
if (fail) process.exit(1);
