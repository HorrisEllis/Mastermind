'use strict';
// ═══════════════════════════════════════════════════════════════════
// MODULE SELECTION — shows once per IDENTITY, not once per browser profile
//
// "This needs only show once per identity" (2026-08-30). The screen
// ("where would you like to begin?") was gated entirely on
// localStorage[FEATURES_KEY]._configured — a cache tied to this
// machine's Electron profile, not to the identity/vault file itself.
// featuresConfirm() DID also save _configured into the real vault
// (foundation/vault/mastermind-vault.js, vaultSerialize/deserialize),
// but nothing ever read that back — the vault's own answer was
// recorded and then permanently ignored. Restoring a vault from a
// backup, opening it from a different data folder, or moving it to a
// different machine (all real — the reporting screenshot's title bar
// shows a custom backup path) would silently reset the cache and show
// the screen again for an identity that had already answered it.
//
// These are structural checks against the real source rather than a
// sandboxed run — _completeLoginSuccess/_continueStartup are large,
// deeply stateful functions with many boot-sequence dependencies
// (crypto, IPC, DOM, timers); safely extracting just the gate logic
// without also faithfully reproducing everything around it would risk
// testing a reimplementation instead of the real code. What's checked
// here is the exact thing that was wrong: which source of truth the
// gate consults, and that the vault's answer heals the cache.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const engine = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
const vault = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');

console.log('\nMODULE SELECTION — once per identity\n');

t('the real vault key (FEATURES_KEY = \'nexus_features\') actually exists as a constant', () => {
  assert.ok(/const FEATURES_KEY\s*=\s*'nexus_features'/.test(engine),
    'FEATURES_KEY changed \u2014 the fallback string in vaultDeserialize\'s self-heal (mastermind-vault.js) must match exactly, or it silently writes to the wrong key');
});

t('featuresConfirm() saves _configured into the REAL vault, not just localStorage', () => {
  const start = engine.indexOf('async function featuresConfirm()');
  const body = engine.slice(start, start + 3500);
  assert.ok(/localStorage\.setItem\(FEATURES_KEY/.test(body), 'expected the localStorage cache write');
  assert.ok(/MMVault\.save\(\{\s*modules:\s*flags,\s*configuredAt/.test(body),
    'expected the real vault write \u2014 without this, the identity itself never remembers, only this machine\'s profile does');
});

t('THE FIX: the encrypted-login gate checks the vault\u2019s own answer (AUTH.features), not localStorage alone', () => {
  const start = engine.indexOf('async function _completeLoginSuccess');
  const stop = engine.indexOf('async function', start + 10);
  const body = engine.slice(start, stop);
  assert.ok(/AUTH\.features\s*&&\s*AUTH\.features\._configured/.test(body),
    'the gate must consult AUTH.features._configured \u2014 by this point in the login chain it has already been freshly hydrated from the real vault file by vaultDeserialize(), not from a stale local cache');
  assert.ok(/_savedF\._configured\s*\|\|\s*_vaultConfigured/.test(body),
    'expected the gate to accept EITHER signal \u2014 the vault\u2019s answer must not be required to also already be cached, or the very first launch after a cache reset fails the exact case this fix exists for');
});

t('THE FIX: a vault-confirmed identity self-heals the localStorage cache when it disagrees', () => {
  const start = engine.indexOf('async function _completeLoginSuccess');
  const stop = engine.indexOf('async function', start + 10);
  const body = engine.slice(start, stop);
  assert.ok(/_vaultConfigured\s*&&\s*!_savedF\._configured/.test(body),
    'expected a self-heal write when the vault says configured but the cache does not agree');
});

t('THE OTHER HALF: vaultDeserialize() itself self-heals the cache \u2014 every deserialize path converges, not just the one directly-checked gate', () => {
  const start = vault.indexOf('if (m.features && typeof AUTH');
  const body = vault.slice(start, start + 1400);
  assert.ok(/AUTH\.features\s*=\s*m\.features/.test(body), 'expected the existing hydration to still happen');
  assert.ok(/m\.features\._configured/.test(body), 'expected the self-heal to check the vault\u2019s own _configured flag');
  assert.ok(/localStorage\.setItem\(FK/.test(body), 'expected the self-heal to actually write the cache, not just check it');
  // The exact bug this guards against: guessing the wrong fallback key
  // name here would make this whole fix a silent no-op \u2014 it would
  // "succeed" by writing to a key nothing ever reads.
  assert.ok(/'nexus_features'/.test(body), 'the fallback key name must match the real FEATURES_KEY constant exactly');
});

t('REGRESSION: the encrypted-login gate no longer trusts localStorage as the ONLY source', () => {
  const start = engine.indexOf('async function _completeLoginSuccess');
  const stop = engine.indexOf('async function', start + 10);
  const body = engine.slice(start, stop);
  // The literal old bug: `if (_savedF._configured) {` with nothing else
  // feeding the condition. Confirms the fix isn't just present alongside
  // the old code but unused.
  assert.ok(!/if \(_savedF\._configured\) \{/.test(body),
    'the old localStorage-only condition is still there unmodified \u2014 the vault check may be dead code');
});

const fails = results.filter(r => !r.ok);
console.log('\nmodule-selection-once: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
