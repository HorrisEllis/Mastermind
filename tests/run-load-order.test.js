'use strict';
// ═══════════════════════════════════════════════════════════════════
// LOAD ORDER
//
// Every renderer script is evaluated in the exact order
// index-browser.html loads them, in a shared context — the same shared
// global lexical scope real classic scripts get.
//
// WHY THIS EXISTS
//
// v0.1.4 added `Object.defineProperty(AUTH, 'key', ...)` at module
// evaluation time in mastermind-vault.js. `const AUTH` is declared in
// nexus-engine.js, which loads AFTER it. Top-level `const` in a classic
// script goes into the shared global LEXICAL environment, so that line
// touched a binding still in its temporal dead zone and threw.
//
// The throw aborted the REST of mastermind-vault.js. `const VAULT`,
// two hundred lines further down, never initialised — and the first
// symptom a person saw was "Cannot access 'VAULT' before
// initialization" while trying to recreate a deleted vault. The cause
// was in a different file, at a different line, about a different
// variable.
//
// Twelve versions shipped with the vault module aborting halfway
// through evaluation. No unit test could catch it: every function in
// the file works perfectly when you require() it on its own. Only
// evaluating the scripts TOGETHER, IN ORDER, exposes it.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');
const vm     = require('vm');

const ROOT = path.resolve(__dirname, '..');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

// The script tags from index-browser.html, in document order.
function scriptOrder() {
  const html = fs.readFileSync(path.join(ROOT, 'index-browser.html'), 'utf8');
  const out = [];
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (/^https?:/.test(m[1])) continue;   // CDN fonts etc.
    out.push(m[1]);
  }
  return out;
}

// A browser-ish sandbox. Deliberately minimal: the point is to catch
// evaluation-time explosions, not to run the app.
function makeContext() {
  const listeners = {};

  // A real browser hands back real elements. Returning null here would make
  // the harness invent failures the app never has — so elements are stubbed
  // permissively. The target is EVALUATION-time errors (TDZ, load order),
  // not DOM behaviour, and a stub that is too strict hides the very bug
  // this file exists to catch behind noise.
  function el() {
    const e = {
      style: new Proxy({}, { get: () => '', set: () => true }),
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      dataset: {},
      children: [], childNodes: [],
      value: '', textContent: '', innerHTML: '', innerText: '',
      checked: false, disabled: false, scrollTop: 0, offsetWidth: 800, offsetHeight: 600,
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      appendChild(c) { return c; }, removeChild(c) { return c; }, insertBefore(c) { return c; },
      setAttribute() {}, getAttribute: () => null, removeAttribute() {},
      querySelector: () => el(), querySelectorAll: () => [],
      getContext: () => ({
        canvas: { width: 800, height: 600 },
        clearRect() {}, fillRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
        moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, save() {}, restore() {},
        translate() {}, scale() {}, rotate() {}, drawImage() {}, fillText() {}, strokeText() {},
        measureText: () => ({ width: 10 }), createLinearGradient: () => ({ addColorStop() {} }),
        createRadialGradient: () => ({ addColorStop() {} }), setTransform() {}, putImageData() {},
        getImageData: () => ({ data: new Uint8ClampedArray(4) }), createImageData: () => ({ data: new Uint8ClampedArray(4) }),
      }),
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }),
      focus() {}, blur() {}, click() {}, remove() {}, closest: () => null, contains: () => false,
ようこそ: undefined,
    };
    delete e['ようこそ'];
    return e;
  }

  const doc = {
    readyState: 'loading',
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: () => {},
    getElementById: () => el(),
    querySelector: () => el(),
    querySelectorAll: () => [],
    createElement: () => el(),
    createElementNS: () => el(),
    body: el(),
    documentElement: Object.assign(el(), { style: { setProperty() {}, getPropertyValue: () => '' } }),
    head: el(),
    fire(ev) { (listeners[ev] || []).forEach(fn => fn({})); },
  };

  const ctx = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    document: doc,
    navigator: { userAgent: 'node', mediaDevices: undefined, language: 'en' },
    location: { href: 'file:///index-browser.html', search: '' },
    localStorage: {
      _d: {},
      getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
      setItem(k, v) { this._d[k] = String(v); },
      removeItem(k) { delete this._d[k]; },
      key(i) { return Object.keys(this._d)[i] ?? null; },
      get length() { return Object.keys(this._d).length; },
    },
    setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    performance: { now: () => Date.now() },
    crypto: globalThis.crypto,
    TextEncoder, TextDecoder,
    fetch: () => Promise.reject(new Error('no network in this test')),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Image: function () {},
    URL,
    Blob: function () {},
    addEventListener: () => {},
    removeEventListener: () => {},
    MM_VERSION: '0.0.0-test',
    NXAPI: undefined,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;
  vm.createContext(ctx);
  return ctx;
}

console.log('\nLOAD ORDER\n');

const order = scriptOrder();

t('index-browser.html lists scripts we can actually resolve', () => {
  assert.ok(order.length > 5, 'found only ' + order.length + ' script tags');
  for (const rel of order) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), 'missing file: ' + rel);
  }
});

t('THE REGRESSION: every script evaluates in load order without throwing', () => {
  const ctx = makeContext();
  const failures = [];
  for (const rel of order) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try {
      vm.runInContext(src, ctx, { filename: rel });
    } catch (e) {
      failures.push(rel + ' \u2014 ' + e.message);
      // Keep going: one abort usually causes cascading TDZ errors in the
      // files after it, and seeing the cascade is how the ROOT cause is
      // identified rather than the loudest symptom.
    }
  }
  assert.deepStrictEqual(failures, [],
    'script(s) aborted during evaluation:\n       ' + failures.join('\n       '));
});

t('after full load, the vault module\'s top-level bindings all exist', () => {
  const ctx = makeContext();
  for (const rel of order) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }); }
    catch (e) { /* reported by the test above */ }
  }
  // These live BELOW the AUTH guard in mastermind-vault.js. If that guard
  // throws again, every one of them stays in its temporal dead zone.
  for (const name of ['VAULT', 'AUTH', 'vaultSave', 'vaultLoad', 'vaultHealth', 'vaultCreateNew']) {
    let ok = true;
    try { vm.runInContext(name + ';', ctx); } catch (e) { ok = false; }
    assert.ok(ok, name + ' is not initialised — a script above it aborted');
  }
});

t('the AUTH.key guard installs, and only after AUTH exists', () => {
  const ctx = makeContext();
  for (const rel of order) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }); }
    catch (e) {}
  }
  ctx.document.readyState = 'complete';
  ctx.document.fire('DOMContentLoaded');

  const guarded = vm.runInContext('(function(){ try { _installAuthKeyGuard(); return _authKeyGuarded; } catch(e){ return "ERR:"+e.message; } })()', ctx);
  assert.strictEqual(guarded, true, 'guard did not install: ' + guarded);
});

t('the guard still refuses a bare AUTH.key assignment', () => {
  const ctx = makeContext();
  for (const rel of order) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }); }
    catch (e) {}
  }
  vm.runInContext('_installAuthKeyGuard();', ctx);
  const threw = vm.runInContext(
    '(function(){ try { AUTH.key = {fake:1}; return false; } catch(e){ return /_setSessionKey/.test(e.message); } })()',
    ctx
  );
  assert.strictEqual(threw, true, 'invariant 0 must still be enforced after the deferral');
});

t('no renderer script touches AUTH or VAULT at evaluation time', () => {
  // The structural version of the same rule: a top-level statement that
  // reads a const from a later file is the bug, whatever its shape.
  const offenders = [];
  for (const rel of order) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const lines = src.split('\n');
    let depth = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const code = line.replace(/\/\/.*$/, '');
      if (depth === 0 && /^\s*(Object\.defineProperty\s*\(\s*(AUTH|VAULT)\b|(AUTH|VAULT)\.[A-Za-z_])/.test(code)) {
        offenders.push(rel + ':' + (i + 1) + ' ' + code.trim().slice(0, 70));
      }
      for (const ch of code) {
        if (ch === '{' || ch === '(' || ch === '[') depth++;
        else if (ch === '}' || ch === ')' || ch === ']') depth--;
      }
      if (depth < 0) depth = 0;
    }
  }
  assert.deepStrictEqual(offenders, [],
    'top-level access to a cross-file const:\n       ' + offenders.join('\n       '));
});

// ── Envelope-writing paths (2026-08-12 field failure) ──────────────
// Recreating a deleted vault wrote a v5 envelope encrypted with a key
// derived from a freshly minted random salt. v5 has no salt field and
// the localStorage copy had been removed in v0.1.4, so the file was
// unopenable with the correct password from the instant it was written.
// The same defect was in the encrypted export path.
//
// A grep-shaped test, deliberately: the bug is a WRITE of the wrong
// format, and that is visible in the source without running anything.

t('no code path WRITES a v5 envelope', () => {
  const offenders = [];
  for (const rel of order) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      // {encrypted: ..., version: 5, ...} being built for output
      if (/encrypted:\s*(true|false)[^}]*version:\s*5|version:\s*5[^}]*encrypted:\s*(true|false)/.test(code)) {
        offenders.push(rel + ':' + (i + 1) + ' ' + code.trim().slice(0, 80));
      }
    });
  }
  assert.deepStrictEqual(offenders, [],
    'v5 envelopes carry no salt \u2014 anything written in that format is unopenable:\n       ' +
    offenders.join('\n       '));
});

t('every screen-hiding path clears inline display, not just the class', () => {
  // _showVaultMissingScreen sets style.display = 'flex' inline. An inline
  // style beats the .hidden class, so a hide that only adds the class is
  // a no-op and two screens render on top of each other.
  const offenders = [];
  for (const rel of order) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/querySelectorAll\(['"]\.startup-inner['"]\)/.test(code) &&
          /classList\.add\(['"]hidden['"]\)/.test(code) &&
          !/style\.display/.test(code)) {
        offenders.push(rel + ':' + (i + 1));
      }
    });
  }
  assert.deepStrictEqual(offenders, [],
    'hides a screen without clearing inline display:\n       ' + offenders.join('\n       '));
});

t('nothing sets display:none on an overlay that a CSS class shows', () => {
  // #opts-overlay.open { display:flex } is a class rule. An inline
  // display:none beats it permanently — which is how goHome() disabled the
  // Settings button for four versions. Hiding must CLEAR the inline style.
  const offenders = [];
  for (const rel of order) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/classList\.remove\(['"]open['"]\)/.test(code) && /style\.display\s*=\s*['"]none['"]/.test(code)) {
        offenders.push(rel + ':' + (i + 1) + ' ' + code.trim().slice(0, 80));
      }
    });
  }
  assert.deepStrictEqual(offenders, [],
    'sets display:none on a class-shown overlay, which it can then never reopen:\n       ' +
    offenders.join('\n       '));
});

t('nothing sets inline display:none on an element shown by a class', () => {
  // The inverse of the earlier trap. An overlay shown by `.open { display:flex }`
  // is permanently disabled by an inline display:none — the class can never
  // win. This killed the Settings button for a whole session.
  const classShown = ['opts-overlay', 'void-overlay', 'mm-alm-overlay', 'search-overlay', 'brain-overlay'];
  const offenders = [];
  for (const rel of order) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    src.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (!/style\.display\s*=\s*['"]none['"]/.test(code)) return;
      if (classShown.some(id => code.includes(id))) {
        offenders.push(rel + ':' + (i + 1) + ' ' + code.trim().slice(0, 70));
      }
    });
  }
  assert.deepStrictEqual(offenders, [],
    'inline display:none on a class-shown overlay disables it permanently:\n       ' + offenders.join('\n       '));
});

t('the shared hide helper exists and covers every startup screen', () => {
  const ctx = makeContext();
  for (const rel of order) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }); }
    catch (e) {}
  }
  const ok = vm.runInContext("typeof mmHideAllStartupScreens === 'function'", ctx);
  assert.strictEqual(ok, true, 'mmHideAllStartupScreens must exist');
});

// ── Every handler the UI names must exist ───────────────────────────
//
// THE BUG THIS EXISTS FOR (2026-08-13):
// v0.1.22 added an assistance options panel to index-browser.html. The
// python script that added the handler functions to nexus-engine.js hit
// an error on its LAST edit and aborted before writing — so the markup
// shipped with onclick="optsToggleAssist(this)" and that function did
// not exist anywhere.
//
// `node --check` passed: a missing function is a runtime error, not a
// syntax error. Every test passed: none of them opened the panel. The
// feature was reported as shipped and every control in it was dead.
//
// This walks every inline handler in the markup and asserts the function
// is defined after all scripts evaluate.

t('THE DEAD BUTTON TEST: every onclick/onchange handler in the markup is defined', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index-browser.html'), 'utf8');

  const names = new Set();
  const re = /\son(?:click|change|input|focus|blur|submit)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    // Pull every `identifier(` that is not a method call or a keyword.
    const callRe = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    let c;
    while ((c = callRe.exec(m[1])) !== null) {
      const n = c[2];
      if (['if', 'for', 'while', 'return', 'typeof', 'function', 'catch', 'switch', 'new'].includes(n)) continue;
      // CSS functions appear inside inline style assignments
      // (this.style.borderColor='rgba(...)'), not as JS calls.
      if (['rgba', 'rgb', 'var', 'url', 'calc', 'hsl', 'hsla', 'translate', 'scale', 'blur'].includes(n)) continue;
      names.add(n);
    }
  }

  const ctx = makeContext();
  for (const rel of order) {
    try { vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel }); }
    catch (e) { /* reported by the evaluation test above */ }
  }

  const missing = [];
  for (const n of names) {
    let ok = false;
    try { ok = vm.runInContext('typeof ' + n + ' === "function"', ctx); } catch (e) { ok = false; }
    if (!ok) missing.push(n);
  }

  assert.deepStrictEqual(missing.sort(), [],
    'markup calls function(s) that do not exist \u2014 these controls are dead:\n       ' + missing.join('\n       '));
});

t('the roadmap manifest is valid and drives the panel', () => {
  const phases = JSON.parse(fs.readFileSync(path.join(ROOT, 'phasemap', 'phases.json'), 'utf8'));
  assert.ok(Array.isArray(phases.phases) && phases.phases.length >= 10);
  const states = new Set(['done', 'partial', 'next', 'open', 'planned']);
  for (const p of phases.phases) {
    assert.ok(p.id && p.name, 'phase missing id or name');
    assert.ok(states.has(p.state), p.id + ' has an unknown state: ' + p.state);
    assert.ok(typeof p.pct === 'number' && p.pct >= 0 && p.pct <= 100, p.id + ' has a bad pct');
    assert.ok(p.note && p.note.length > 20, p.id + ' has no useful note');
  }
  // The panel must render from the file, not from a second copy in markup.
  const engine = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
  assert.ok(/fetch\('phasemap\/phases\.json'\)/.test(engine),
    'the roadmap panel must read the manifest, or it will drift from the plan');
});

t('the component registry is valid and every lifecycle is a known \u00a717.2 state', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'phasemap', 'components.json'), 'utf8'));
  // \u00a717.2 — "Unknown state is prohibited."
  const states = new Set(['Draft', 'Specified', 'Implemented', 'Verified', 'Released', 'Deprecated', 'Archived', 'Removed']);
  const ids = new Set();
  for (const c of [...reg.foundation, ...reg.components]) {
    assert.ok(c.id, 'component with no id');
    assert.ok(!ids.has(c.id), 'duplicate component id: ' + c.id);
    ids.add(c.id);
    assert.ok(states.has(c.lifecycle), c.id + ' has an unknown lifecycle state: ' + c.lifecycle);
  }
  // \u00a75.7 — every edge goes through the bus, never module to module.
  for (const e of reg.edges) {
    assert.ok(ids.has(e.from), e.id + ' comes from an unknown component: ' + e.from);
    assert.ok(ids.has(e.to), e.id + ' goes to an unknown component: ' + e.to);
    assert.strictEqual(e.via, 'F.bus', e.id + ' bypasses the bus \u2014 direct sibling dependency (\u00a75.7)');
  }
  const engine = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
  assert.ok(/fetch\('phasemap\/components\.json'\)/.test(engine),
    'the components panel must read the registry, not restate it');
});

t('the installer removes the previous version and never touches user data', () => {
  const nsh = fs.readFileSync(path.join(ROOT, 'build', 'installer.nsh'), 'utf8');
  assert.ok(/customInit/.test(nsh), 'no customInit macro');
  assert.ok(/UninstallString/.test(nsh), 'does not look for a previous install');
  assert.ok(/_\?=\$INSTDIR/.test(nsh),
    'must use _?= or ExecWait does not actually wait, and the uninstall races the install');

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.build.nsis.include, 'build/installer.nsh');
  assert.strictEqual(pkg.build.nsis.deleteAppDataOnUninstall, false,
    '\u00a70.3 \u2014 an installer that removes someone\u2019s thinking is not an installer');
  assert.ok(pkg.build.appId, 'a stable appId is what makes the previous version findable at all');

  // Nothing in the installer may reach into a data location.
  for (const forbidden of ['$DOCUMENTS', '$APPDATA', '$LOCALAPPDATA', 'RMDir /r "$DOCUMENTS']) {
    assert.ok(!nsh.includes(forbidden),
      'installer references a user data location: ' + forbidden);
  }
});

const fails = results.filter(r => !r.ok);
console.log('\nload-order: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
