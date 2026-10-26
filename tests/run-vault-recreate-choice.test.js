'use strict';
// ═══════════════════════════════════════════════════════════════════
// VAULT RECREATE — the encrypted/plain choice, and the silent downgrade
//
// _vaultRecreate() decided whether to show the password-required
// recovery form or the plain "just recreate empty" form based on
// `meta && !meta.noEncryption` — a two-way branch. _authLoadMeta()
// reads a LOCAL, machine-only marker; when the vault file is gone AND
// that marker doesn't exist on this machine or session (a fresh
// install, a cleared profile, moving to a new machine — precisely the
// situation someone recovering a missing vault is often already in),
// `meta` is null regardless of what the actual, now-missing vault was.
// The old code guessed "unencrypted" in that gap: a vault that really
// was encrypted would come back with no password on it at all, and the
// screen would say "Your vault was unencrypted" — false, not unknown.
//
// This proves the three-way fix: known-encrypted and known-plain
// markers behave exactly as before; an absent/uncertain marker now
// asks explicitly instead of silently choosing the less secure default.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
const pending = [];
function t(name, fn) { pending.push({ name, fn }); }

function extractBetween(src, startMarker, endMarkerPattern) {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, startMarker + ' not found');
  const end = src.search(endMarkerPattern);
  assert.ok(end > start, 'end boundary not found after start');
  return src.slice(start, end);
}

const vaultSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');
const regionSrc = extractBetween(
  vaultSrc,
  'function _showVaultMissingScreen(vaultPath, reason = \'missing\') {',
  /\n\/\/ ── Module ready signal/
);

function run() {
  console.log('\nVAULT RECREATE — encryption choice\n');
  let pass = 0;
  for (const { name, fn } of pending) {
    try { fn(); console.log('  \u2713 ' + name); pass++; }
    catch (e) { console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      ')); }
  }
  console.log('\nvault-recreate-encryption-choice: ' + pass + '/' + pending.length + ' passed');
  process.exitCode = pass === pending.length ? 0 : 1;
}

function makeSandbox(metaValue) {
  const store = {};
  const makeEl = (id) => {
    if (!store[id]) store[id] = {
      id, style: {}, textContent: '', innerHTML: '', className: '',
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild(child) { this._appended = this._appended || []; this._appended.push(child); },
      querySelectorAll: () => [],
      remove() {},
      focus() {},
    };
    return store[id];
  };
  // The real code does `const form = document.createElement('div');
  // form.id = 'vault-recovery-form';` — id is assigned AFTER creation,
  // not passed in. A plain object here would let that assignment set a
  // property with no effect on lookup, so store()['vault-recovery-form']
  // would never see what was actually rendered. This element registers
  // itself into `store` the moment its `.id` is set, same as a real DOM
  // element becoming findable by getElementById once given an id.
  const makeCreatedEl = () => {
    const el = {
      style: {}, textContent: '', innerHTML: '', className: '',
      classList: { add() {}, remove() {}, toggle() {} },
      appendChild(child) { this._appended = this._appended || []; this._appended.push(child); },
      querySelectorAll: () => [],
      remove() {},
      focus() {},
      _id: null,
    };
    Object.defineProperty(el, 'id', {
      get() { return el._id; },
      set(v) { el._id = v; store[v] = el; },
    });
    return el;
  };
  const sandbox = {
    console,
    document: {
      getElementById: (id) => makeEl(id),
      createElement: () => makeCreatedEl(),
      querySelectorAll: () => [],
    },
    escH: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])),
    NX_CONFIG: {},
    AUTH: { username: null },
    MMLog: { info() {}, warn() {}, error() {} },
    MM_BUS: { emit() {} },
    _authLoadMeta: () => metaValue,
    setTimeout: (fn) => fn(),
    startupRoute: () => {},
    _ssShow: () => {},
  };
  sandbox.window = { NXAPI: {
    snapshotList: async () => ({ ok: true, snapshots: [] }),
    snapshotRestore: async () => ({ ok: false }),
    defaultFolder: async () => '/home/user/Documents/MASTERMIND',
    vaultExists: async () => false,
    setDataDir: async () => true,
    vaultWrite: async () => ({ ok: false }),
  } };
  vm.createContext(sandbox);
  vm.runInContext(regionSrc, sandbox);
  return { sandbox, store: () => store };
}

// ── Known states — unchanged behavior ─────────────────────────────

t('a marker explicitly saying noEncryption:false shows the password-required form', async () => {
  const { sandbox, store } = makeSandbox({ username: 'jbrooks', noEncryption: false });
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/PASSWORD REQUIRED/i.test(html));
  assert.ok(/vault-recovery-pw/.test(html), 'must render actual password inputs');
});

t('a marker explicitly saying noEncryption:true shows the plain recreate form directly', async () => {
  const { sandbox, store } = makeSandbox({ username: 'jbrooks', noEncryption: true });
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/Your vault was unencrypted/i.test(html));
  assert.ok(!/ENCRYPTION UNKNOWN/i.test(html));
});

// ── The actual fix: unknown state ─────────────────────────────────

t('THE FIX: no marker at all (null) shows the explicit choice, not a silent plain default', async () => {
  const { sandbox, store } = makeSandbox(null);
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/ENCRYPTION UNKNOWN/i.test(html), 'must show the honest unknown-state screen');
  assert.ok(!/Your vault was unencrypted/i.test(html), 'must NOT claim to know the vault was unencrypted when it does not know');
  assert.ok(!/vault-recovery-pw"/.test(html), 'must not silently proceed as encrypted either — this is a choice, not a guess');
});

t('THE FIX: undefined meta (not just null) is treated the same as unknown, not as plain', async () => {
  const { sandbox, store } = makeSandbox(undefined);
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/ENCRYPTION UNKNOWN/i.test(html));
});

t('a marker object present but with no noEncryption field at all is asked, not assumed encrypted', async () => {
  // Old code's `!meta.noEncryption` would have treated undefined as
  // falsy -> "isEncrypted" -> silently assumed encrypted. A malformed or
  // very old marker missing this field entirely should ask, not guess
  // in either direction.
  const { sandbox, store } = makeSandbox({ username: 'jbrooks' });
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/ENCRYPTION UNKNOWN/i.test(html));
});

t('the unknown-choice screen offers both an encrypted path and a plain path, not just one', async () => {
  const { sandbox, store } = makeSandbox(null);
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/_vaultRecreateRenderEncryptedChoice/.test(html), 'must offer the "it was encrypted" path');
  assert.ok(/_vaultRecreateRenderPlainChoice/.test(html), 'must offer the "it was not encrypted" path');
});

t('choosing "it was encrypted" from the unknown screen renders the real password form', async () => {
  const { sandbox, store } = makeSandbox(null);
  const form = sandbox.document.getElementById('vault-recovery-form');
  vm.runInContext('_vaultRecreateRenderEncryptedChoice', sandbox)(form, 'jbrooks');
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/PASSWORD REQUIRED/i.test(html));
  assert.ok(/vault-recovery-pw"/.test(html));
});

t('choosing "it was not encrypted" from the unknown screen renders the real plain-recreate form', async () => {
  const { sandbox, store } = makeSandbox(null);
  const form = sandbox.document.getElementById('vault-recovery-form');
  vm.runInContext('_vaultRecreateRenderPlainChoice', sandbox)(form, true);
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(/_vaultRecreateUnencrypted/.test(html));
});

t('the unknown-choice screen never silently offers a one-click "create new vault" — every path requires an explicit choice first', async () => {
  const { sandbox, store } = makeSandbox(undefined);
  await sandbox._vaultRecreate();
  const html = store()['vault-recovery-form'].innerHTML;
  assert.ok(!/onclick="_vaultRecreateConfirm\(\)"/.test(html));
  assert.ok(!/onclick="_vaultRecreateUnencrypted\(\)"/.test(html));
});

run();
