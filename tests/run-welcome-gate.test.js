'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nWELCOME SPLASH — reinstall gating\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try { fn(); console.log('  \u2713 ' + name); pass++; }
    catch (e) { console.log('  \u2717 ' + name); console.log('      ' + e.message); }
  }
  console.log('\nwelcome-gate: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

function extractFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf('\n' + marker);
  assert.ok(start > -1, name + ' not found');
  const bodyStart = src.indexOf('{', start);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

const engineSrc = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
const fnSrc = extractFunction(engineSrc, 'maybeShowWelcome');

function makeSandbox(saveCount) {
  const ls = {};
  const shownCalls = { count: 0 };
  const sandbox = {
    console,
    localStorage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = v; },
    },
    VAULT: { saveCount },
    setTimeout: (fn) => fn(), // run "deferred" show immediately for the test
    showWelcomeScreen: () => { shownCalls.count++; },
  };
  vm.createContext(sandbox);
  vm.runInContext(fnSrc, sandbox);
  return { sandbox, ls, shownCalls };
}

t('a returning vault with real save history never shows the first-run splash, even with no local flag', () => {
  const { sandbox, shownCalls, ls } = makeSandbox(14); // matches the reported case
  sandbox.maybeShowWelcome();
  assert.strictEqual(shownCalls.count, 0, 'a vault with 14 saves is obviously not a first-time identity');
  assert.strictEqual(ls['mm_welcome_seen'], '1', 'the flag should be repaired so this machine stops asking');
});

t('a genuinely brand-new vault (saveCount <= 1) with no flag set DOES show the splash', () => {
  const { sandbox, shownCalls } = makeSandbox(1);
  sandbox.maybeShowWelcome();
  assert.strictEqual(shownCalls.count, 1, 'a real first-time identity should still see the splash once');
});

t('a vault with saveCount 0 (mid-creation, no save yet) still shows the splash', () => {
  const { sandbox, shownCalls } = makeSandbox(0);
  sandbox.maybeShowWelcome();
  assert.strictEqual(shownCalls.count, 1);
});

t('the flag being already set (normal repeat-session case) still suppresses the splash regardless of saveCount', () => {
  const { sandbox, shownCalls, ls } = makeSandbox(1);
  ls['mm_welcome_seen'] = '1';
  sandbox.maybeShowWelcome();
  assert.strictEqual(shownCalls.count, 0);
});

t('VAULT being undefined (should not happen, but must not throw) is treated as not-returning, not a crash', () => {
  const { sandbox, shownCalls } = makeSandbox(14);
  sandbox.VAULT = undefined;
  assert.doesNotThrow(() => sandbox.maybeShowWelcome());
});

run();
