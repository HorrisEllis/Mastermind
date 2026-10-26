'use strict';
// Runs every failure-mode simulation for the AI-assistance / ClearGlass
// link in one pass. Each file is a separate process so one suite's
// module-level state (the vm sandboxes, the mock Electron singleton)
// can't leak into another.
const { execFileSync } = require('child_process');
const path = require('path');

const files = [
  'run-import-export.test.js',
  'run-phone-input.test.js',
  'run-phone-orb-sync.test.js',
  'run-phone-mic-tunnel.test.js',
  'run-persistence.test.js',
  'run-load-order.test.js',
  'run-clearglass-main.test.js',
  'run-userscript.test.js',
  'run-clearglass-transport.test.js',
  'run-main-background.test.js',
  'run-vault-secure-wipe.test.js',
  'run-packaged-deps.test.js',
  'run-memory-engine.test.js',
  'run-vault-v6.test.js',
  'run-vault-plain.test.js',
  'run-vault-lifecycle.test.js',
  'run-vault-snapshots.test.js',
  'run-version-consistency.test.js',
  'run-boot-screen.test.js',
  'run-transcription.test.js',
  'run-audio-import.test.js',
  'run-pitch.test.js',
  'run-clarity.test.js',
  'run-voicing.test.js',
  'run-capture-bridge.test.js',
  'run-lexicon.test.js',
  'run-assist-contract.test.js',
  'run-taxonomy.test.js',
  'run-lattice-ui.test.js',
  'run-lattice-tab.test.js',
  'run-lattice-sessions.test.js',
  'run-module-selection-once.test.js',
  'run-vault-mfa.test.js',
  'run-ui-scale-split.test.js',
  'run-local-static-server.test.js',
  'run-import-flow.test.js',
  'run-vault-recovery.test.js',
  'run-vault-recreate-choice.test.js',
  'run-localstorage-audit.test.js',
  'run-save-refused-diagnostics.test.js',
  'run-audio-encode.test.js',
  'run-orb-capture.test.js',
  'run-login-hydration.test.js',
  'run-vault-gate-repair.test.js',
  'run-welcome-gate.test.js',
  'run-whisper-bundling.test.js',
  'run-recall.test.js',
  'run-vl-prepare-wav.test.js',
  'run-vault-file-watcher.test.js',
  'run-node-integrity.test.js',
  'run-atomic-write-retry.test.js',
  'run-vault-archive-probe.test.js',
  'run-text-analysis.test.js',
  'run-coherence-stem-aware.test.js',
  'run-node-anchor.test.js',
  'run-background-switches.test.js',
];

// "Could not run" and "ran and failed" are different facts and must not be
// reported as the same one. Three suites require the real `electron` module;
// without node_modules they abort at require() before executing a single
// assertion. Counting that as a failure hides genuine failures in the noise
// — and counting it as a pass would be worse. It is reported as SKIPPED,
// loudly, with the reason.
const fs = require('fs');
const hasElectron = fs.existsSync(path.join(__dirname, '..', 'node_modules', 'electron'));

let failed = 0;
const skipped = [];

for (const f of files) {
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, f)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    process.stdout.write(out);
  } catch (e) {
    const out = String((e.stdout || '') + (e.stderr || ''));
    // Only ever a skip when electron genuinely is not installed. If it IS
    // installed and the suite still cannot find it, that is a real failure.
    if (!hasElectron && /Cannot find module 'electron'/.test(out)) {
      skipped.push(f);
    } else {
      failed++;
    }
  }
}

if (skipped.length) {
  console.log('\n\u26A0  ' + skipped.length + ' suite(s) SKIPPED — `electron` is not installed:');
  skipped.forEach(f => console.log('     ' + f));
  console.log('     Run `npm install` to exercise them. Until then the Electron/IPC');
  console.log('     layer has NO automated coverage in this environment.');
}

console.log('\n' + (failed ? failed + ' suite(s) FAILED' : 'All runnable suites passed') +
  ' — ' + (files.length - skipped.length) + ' run, ' + skipped.length + ' skipped, ' +
  files.length + ' total');
process.exitCode = failed ? 1 : 0;
