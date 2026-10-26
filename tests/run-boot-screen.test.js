'use strict';
// ═══════════════════════════════════════════════════════════════════
// BOOT SCREEN — render layer
//
// The rendering functions are string builders over the report that
// vault-boot.js produces, so they can be tested without a DOM. The real
// module file is loaded and evaluated; nothing is reimplemented here.
//
// The tests that matter are the ones about what a person actually sees
// when something is wrong: that every status has a visual, that the
// chain breaks at the right place, that a failing check's remedy makes
// it to the screen, and that a corrupted snapshot cannot be clicked.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');

const BOOT = require('../foundation/vault/vault-boot.js');

// Load the real screen module into a sandbox with just enough globals for
// its top-level code to evaluate. No DOM: the functions under test never
// touch one.
const sandbox = {
  window: { MM_VERSION: 'test' },
  document: { getElementById: () => null },
  console,
  MM_BUS: { emit: () => {} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'foundation', 'ui', 'mm-boot-screen.js'), 'utf8'),
  sandbox,
  { filename: 'mm-boot-screen.js' }
);

const { mmBootStepVisual, mmBootRenderStep, mmBootRenderSteps, mmBootActions } = sandbox;

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const healthy = (over) => Object.assign({
  hasNXAPI: true, dataDir: '/data', cryptoAvailable: true, cryptoRoundTrip: true,
  vaultExists: true, vaultBytes: 4096, parseOk: true, legacy: false, kdfIterations: 1000000,
  ciphertextIntact: true, ledgerMissing: false, ledgerChainOk: true, ledgerSeq: 12,
  unlockFailures: 0, vaultAnchored: true, snapshotCount: 5,
  newestSnapshotVerified: true, newestSnapshotAgeHours: 2, watcherArmed: true,
}, over || {});

console.log('\nBOOT SCREEN — render\n');

t('every status vault-boot can emit has a visual', () => {
  // Statuses the engine actually produces, plus the two the screen adds.
  const statuses = ['pass', 'notice', 'warn', 'critical', 'skipped', 'running'];
  for (const s of statuses) {
    const v = mmBootStepVisual(s);
    assert.ok(v.color && v.glyph && v.label, s + ' has no visual');
  }
});

t('an unknown status still renders something rather than blank', () => {
  const v = mmBootStepVisual('invented-later');
  assert.ok(v.glyph, 'must not render an empty node');
  assert.ok(v.label.length > 0);
});

t('a step renders its label, detail and remedy', () => {
  const html = mmBootRenderStep(
    { id: 'vault_file', label: 'Vault file', status: 'critical',
      detail: 'The vault file is MISSING.', remedy: 'Restore the most recent snapshot.' },
    0, { last: false }
  );
  assert.ok(html.includes('Vault file'));
  assert.ok(html.includes('The vault file is MISSING.'));
  assert.ok(html.includes('Restore the most recent snapshot.'));
  assert.ok(html.includes('BLOCKED'));
});

t('detail text is escaped, not injected', () => {
  const html = mmBootRenderStep(
    { id: 'x', label: 'X', status: 'warn', detail: '<img src=x onerror=alert(1)>' },
    0, { last: true }
  );
  assert.ok(!html.includes('<img'), 'markup from a path or error message must not execute');
  assert.ok(html.includes('&lt;img'));
});

t('the last step has no trailing connector', () => {
  const html = mmBootRenderStep({ id: 'a', label: 'A', status: 'pass' }, 8, { last: true });
  assert.ok(!html.includes('mmb-connector'));
});

t('the chain breaks AT the first critical and stays broken below it', () => {
  const report = BOOT.run(healthy({ vaultExists: false }));
  const html = mmBootRenderSteps(report.steps);
  const firstCritical = report.steps.findIndex(s => s.status === 'critical');
  assert.ok(firstCritical > 0, 'this fixture should fail partway down');

  // Count broken connectors: one for the failing step and each one after it,
  // minus the last step which has no connector at all.
  const broken = (html.match(/mmb-connector-broken/g) || []).length;
  const expected = report.steps.length - firstCritical - 1;
  assert.strictEqual(broken, expected,
    'everything below the first failure is unverified and must be drawn as such');
});

t('a clean report draws no broken connectors', () => {
  const html = mmBootRenderSteps(BOOT.run(healthy()).steps);
  assert.ok(!html.includes('mmb-connector-broken'));
});

t('a missing vault WITH snapshots offers restore first', () => {
  const report = BOOT.run(healthy({ vaultExists: false, snapshotCount: 3 }));
  report.probes = healthy({ vaultExists: false, snapshotCount: 3 });
  const acts = mmBootActions(report);
  assert.strictEqual(acts[0].label, 'Restore a snapshot');
  assert.strictEqual(acts[0].primary, true);
});

t('a missing vault with NO snapshots does not offer a restore that cannot work', () => {
  const report = BOOT.run(healthy({ vaultExists: false, snapshotCount: 0 }));
  report.probes = healthy({ vaultExists: false, snapshotCount: 0 });
  const acts = mmBootActions(report);
  assert.ok(!acts.some(a => /Restore/.test(a.label)), 'offering an impossible action is a lie');
  assert.ok(acts.some(a => /Create a new vault/.test(a.label)));
});

// REVERSED 2026-08-23. This previously asserted that creation is NOT offered
// while a vault file exists, on the reasoning that offering it invites
// overwriting a real file. The reasoning is right; the assertion was the wrong
// way to enforce it, and it produced a dead end: a vault that exists, cannot be
// opened, and has no snapshots behind it left the boot screen with no action
// that could possibly work.
//
// The invariant that actually matters is not "the button is hidden", it is
// "the file is never lost". That is enforced in mmBootCreateNew(), which copies
// the file aside and refuses to continue if the copy cannot be proven. So the
// button is offered — and the two tests below pin what keeps it safe: restore
// stays the primary action whenever one is possible, and creation never is.
t('a damaged ciphertext offers restore FIRST, with creation available but not primary', () => {
  const probes = healthy({ ciphertextIntact: false, snapshotCount: 4 });
  const report = BOOT.run(probes);
  report.probes = probes;
  const acts = mmBootActions(report);

  assert.strictEqual(acts[0].label, 'Restore a snapshot',
    'a recoverable vault must lead with the action that recovers it');
  assert.strictEqual(acts[0].primary, true);

  const create = acts.find(a => /Create a new vault/.test(a.label));
  assert.ok(create, 'creation must remain reachable — it is the only exit when a restore fails');
  assert.ok(!create.primary,
    'creation must never be the emphasised action while the data can still be restored');
});

t('an unopenable vault with NO snapshots still offers a way out', () => {
  // The exact reported state: the file is present and 2,664 bytes, it does not
  // parse, and there is nothing to restore from. Before the fix this rendered a
  // blocking screen whose only actions were a folder picker that finds the same
  // file and a re-run that fails identically.
  const probes = healthy({
    vaultExists: true, vaultBytes: 2664, parseOk: false,
    parseMessage: 'Not a MASTERMIND vault file.', snapshotCount: 0,
    ciphertextIntact: false,
  });
  const report = BOOT.run(probes);
  report.probes = probes;
  assert.ok(!report.canProceed, 'this fixture must block');

  const acts = mmBootActions(report);
  assert.ok(acts.some(a => /Create a new vault/.test(a.label)),
    'a blocking screen with no working action is a trap, not a check');
  assert.ok(!acts.some(a => /Restore/.test(a.label)),
    'there are no snapshots — offering a restore would be a lie');
});

t('no action offered on a blocking report is a no-op', () => {
  // Every blocking state must expose at least one action that changes
  // something. "Run the checks again" alone does not qualify: re-running a
  // deterministic check over an unchanged file cannot produce a new outcome.
  const states = [
    healthy({ vaultExists: false, snapshotCount: 0 }),
    healthy({ vaultExists: true, parseOk: false, snapshotCount: 0, ciphertextIntact: false }),
    healthy({ ciphertextIntact: false, snapshotCount: 0 }),
    healthy({ ciphertextIntact: false, snapshotCount: 3 }),
  ];
  for (const probes of states) {
    const report = BOOT.run(probes);
    report.probes = probes;
    const acts = mmBootActions(report).filter(a => !/again/.test(a.label));
    assert.ok(acts.length > 0,
      'blocking state with only a re-run offered: ' + JSON.stringify({
        vaultExists: probes.vaultExists, parseOk: probes.parseOk,
        snapshots: probes.snapshotCount,
      }));
  }
});

t('a healthy report offers only re-running the checks', () => {
  const probes = healthy();
  const report = BOOT.run(probes);
  report.probes = probes;
  const acts = mmBootActions(report);
  assert.strictEqual(acts.length, 1);
  assert.ok(/again/.test(acts[0].label));
});

t('every action names an action, not a system concept', () => {
  const probes = healthy({ vaultExists: false, snapshotCount: 2 });
  const report = BOOT.run(probes);
  report.probes = probes;
  for (const a of mmBootActions(report)) {
    assert.ok(/^[A-Z]/.test(a.label), 'sentence case: ' + a.label);
    assert.ok(!/vault:|ipc|localStorage|NXAPI/i.test(a.label), 'leaks implementation: ' + a.label);
  }
});

t('the full report renders every step', () => {
  const report = BOOT.run(healthy());
  const html = mmBootRenderSteps(report.steps);
  for (const s of report.steps) {
    assert.ok(html.includes(s.label), 'missing from the screen: ' + s.label);
  }
});

// ── encryption_expected: marker vs. file disagreement ─────────────────────

t('vault silently downgraded from encrypted to plain blocks boot', () => {
  const probes = healthy({ expectedEncrypted: true, plain: true });
  const report = BOOT.run(probes);
  const step = report.steps.find(s => s.id === 'encryption_expected');
  assert.strictEqual(step.status, 'critical');
  assert.ok(/password/i.test(step.remedy), 'remedy should warn against entering the password: ' + step.remedy);
});

t('vault upgraded from plain to encrypted is a notice, not a block', () => {
  const probes = healthy({ expectedEncrypted: false, plain: false });
  const report = BOOT.run(probes);
  const step = report.steps.find(s => s.id === 'encryption_expected');
  assert.strictEqual(step.status, 'notice');
  assert.strictEqual(report.canProceed, true);
});

t('no prior marker on this machine skips the encryption match check', () => {
  const probes = healthy({ expectedEncrypted: null });
  const report = BOOT.run(probes);
  const step = report.steps.find(s => s.id === 'encryption_expected');
  assert.strictEqual(step.status, 'skipped');
});

t('encryption matching expectation passes quietly either way', () => {
  const enc = BOOT.run(healthy({ expectedEncrypted: true, plain: false }));
  const plain = BOOT.run(healthy({ expectedEncrypted: false, plain: true }));
  assert.strictEqual(enc.steps.find(s => s.id === 'encryption_expected').status, 'pass');
  assert.strictEqual(plain.steps.find(s => s.id === 'encryption_expected').status, 'pass');
});

t('a downgraded vault offers recovery actions, not just re-run', () => {
  const probes = healthy({ expectedEncrypted: true, plain: true, snapshotCount: 3 });
  const report = BOOT.run(probes);
  report.probes = probes;
  const acts = mmBootActions(report).filter(a => !/again/.test(a.label));
  assert.ok(acts.length > 0, 'a security-relevant block must offer a way forward, not just re-run');
});

// ── vault_format: archive signature vs. generic corruption ────────────────

t('an archive at the vault path gets its own message, not "corrupt"', () => {
  const probes = healthy({ parseOk: false, parseMessage: 'Vault file is not valid JSON — it is corrupt.', binaryFormat: 'zip' });
  const report = BOOT.run(probes);
  const step = report.steps.find(s => s.id === 'vault_format');
  assert.strictEqual(step.status, 'critical');
  assert.ok(/ZIP/.test(step.detail), 'should name the archive kind: ' + step.detail);
  assert.ok(!/corrupt/i.test(step.detail), 'should not call an archive a corrupt vault: ' + step.detail);
});

t('genuine corruption with no archive signature keeps the generic message', () => {
  const probes = healthy({ parseOk: false, parseMessage: 'Vault file is not valid JSON — it is corrupt.', binaryFormat: null });
  const report = BOOT.run(probes);
  const step = report.steps.find(s => s.id === 'vault_format');
  assert.strictEqual(step.status, 'critical');
  assert.ok(/corrupt/i.test(step.detail));
});

const fails = results.filter(r => !r.ok);
console.log('\nboot-screen: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
