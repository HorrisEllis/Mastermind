#!/usr/bin/env node
/**
 * Causal Nexus — Test Suite Entry Point
 *
 * Runs all test files and prints a summary.
 * Usage:
 *   node test/run-all.js
 *   node test/run-all.js --unit
 *   node test/run-all.js --cross
 */

const args  = process.argv.slice(2);
const unit  = args.includes('--unit')  || !args.some(a=>a.startsWith('--'));
const cross = args.includes('--cross') || !args.some(a=>a.startsWith('--'));
const stress= args.includes('--stress');

const suites = [];
if (unit || stress)  suites.push('../test/unit/kernel.test.js', '../test/unit/causality.test.js', '../test/unit/modules.test.js', '../test/unit/version-gate.test.js', '../test/unit/adapter-sandbox.test.js', '../test/unit/context.test.js', '../test/unit/clip.test.js', '../test/unit/sigma.test.js', '../test/unit/observer-enforcement.test.js', '../test/unit/loader-context.test.js', '../test/unit/context.test.js');
if (cross)           suites.push('../test/cross-domain/invariants.test.js');

let totalPassed = 0, totalFailed = 0;

console.log('\n╔══════════════════════════════════════════╗');
console.log('║  CAUSAL NEXUS — TEST SUITE v5.0.0       ║');
console.log('╚══════════════════════════════════════════╝\n');

const start = Date.now();

for (const suite of suites) {
  try {
    const mod = await import(suite);
    if (mod.result) {
      totalPassed += mod.result.passed;
      totalFailed += mod.result.failed;
    }
  } catch (e) {
    console.error(`\n✗ Failed to load ${suite}:`);
    console.error('  ' + e.message);
    if (e.stack) console.error(e.stack.split('\n').slice(1,3).join('\n'));
    totalFailed++;
  }
}

const elapsed = Date.now() - start;
const total   = totalPassed + totalFailed;

console.log('\n──────────────────────────────────────────');
if (totalFailed === 0) {
  console.log(`✓ ${totalPassed}/${total} tests passing  (${elapsed}ms)`);
} else {
  console.log(`✗ ${totalFailed} failing, ${totalPassed} passing out of ${total}  (${elapsed}ms)`);
}
console.log('──────────────────────────────────────────\n');

process.exit(totalFailed > 0 ? 1 : 0);
