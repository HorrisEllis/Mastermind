'use strict';
// ═══════════════════════════════════════════════════════════════════
// IMPORT-IDENTITY FLOW
//
// The ss-import screen (pick a .vault file, or a folder containing
// one) existed with two onclick handlers pointing at functions that
// were never written — caught by run-load-order's dead-button test.
// This exercises the real functions against a mock NXAPI backed by an
// in-memory filesystem, so "the button resolves" and "the import
// actually works" are both checked, not just the first one.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const results = [];
const pending = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}
function at(name, fn) { pending.push({ name, fn }); }

function extractRegion(src, startMarker, endMarkerPattern) {
  const start = src.indexOf(startMarker);
  assert.ok(start > -1, startMarker + ' not found');
  const endStart = src.search(endMarkerPattern);
  assert.ok(endStart > start, 'end boundary not found after start');
  const bodyStart = src.indexOf('{', endStart);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

const engineSrc = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
const importRegionSrc = extractRegion(engineSrc, 'function ssWelcomeCreate() {', /\nfunction _ssShow\(/);

const VaultEnvelope = require(path.join(ROOT, 'foundation', 'vault', 'vault-envelope.js'));

// A minimal but SHAPE-VALID v6 envelope, built with VaultEnvelope's own
// buildHeader/assemble so "does this parse" is testing against the real
// format, not a hand-typed guess at it.
function buildFixtureVault() {
  const header = VaultEnvelope.buildHeader({
    vaultId: 'test-vault-id-0001',
    kdf: { salt: 'c2FsdHNhbHRzYWx0c2FsdHNhbHRzYWx0', iterations: 600000 },
    iv: 'aXZpdml2aXZpdml2',
    saveCount: 1,
  });
  const envelope = VaultEnvelope.assemble(header, 'ZmFrZS1jaXBoZXJ0ZXh0LWJ5dGVz', 'a'.repeat(64));
  return VaultEnvelope.serialize(envelope);
}

// In-memory filesystem + mock NXAPI, keyed by path.
function makeMockFs(initialFiles) {
  const files = Object.assign({}, initialFiles);
  const calls = { setDataDir: [], vaultWrite: [] };
  const NXAPI = {
    openFileDialog: async () => mockFs._nextFilePick,
    pickDataFolder: async () => mockFs._nextFolderPick,
    vaultExists: async (p) => Object.prototype.hasOwnProperty.call(files, p),
    vaultRead: async (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    vaultWrite: async (p, data) => { files[p] = data; calls.vaultWrite.push(p); return { ok: true }; },
    setDataDir: async (dir) => { calls.setDataDir.push(dir); return true; },
  };
  const mockFs = { files, calls, NXAPI, _nextFilePick: null, _nextFolderPick: null };
  return mockFs;
}

function makeSandbox(mockFs) {
  const store = {};
  const makeEl = (id) => {
    if (!store[id]) store[id] = { id, style: {}, textContent: '', innerHTML: '' };
    return store[id];
  };
  const sandbox = {
    console,
    window: {},
    document: { getElementById: (id) => makeEl(id) },
    localStorage: (() => {
      const ls = {};
      return { setItem: (k, v) => { ls[k] = v; }, getItem: (k) => (k in ls ? ls[k] : null), _raw: ls };
    })(),
    NX_CONFIG: {},
    VaultEnvelope,
    MMLog: { info() {}, warn() {}, error() {} },
    MM_BUS: { emit() {} },
    startupRouteCalls: 0,
  };
  sandbox.window.NXAPI = mockFs.NXAPI;
  sandbox.setTimeout = (fn) => fn(); // run "deferred" calls immediately for the test
  Object.defineProperty(sandbox, 'startupRoute', {
    value: () => { sandbox.startupRouteCalls++; },
    writable: true,
  });
  vm.createContext(sandbox);
  return { sandbox, store: () => store };
}

// ── importPickVaultFile ──────────────────────────────────────────────

at('picking a file already named mastermind.vault imports it directly, no copy', async () => {
  const vault = buildFixtureVault();
  const mockFs = makeMockFs({ '/data/mastermind.vault': vault });
  mockFs._nextFilePick = '/data/mastermind.vault';
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFile', sandbox)();
  assert.strictEqual(mockFs.calls.vaultWrite.length, 0, 'no copy should happen when the file is already correctly named');
  assert.strictEqual(mockFs.calls.setDataDir[0], '/data');
  assert.strictEqual(sandbox.NX_CONFIG.vaultPath, '/data/mastermind.vault');
  assert.strictEqual(sandbox.startupRouteCalls, 1);
  assert.strictEqual(sandbox.localStorage.getItem('nexus_datadir'), '/data');
});

at('picking a differently-named .vault file copies it into place as mastermind.vault', async () => {
  const vault = buildFixtureVault();
  const mockFs = makeMockFs({ '/backup/my-old-vault.vault': vault });
  mockFs._nextFilePick = '/backup/my-old-vault.vault';
  const { sandbox } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFile', sandbox)();
  assert.strictEqual(mockFs.files['/backup/mastermind.vault'], vault, 'the content must be copied byte-for-byte under the expected name');
  assert.strictEqual(sandbox.NX_CONFIG.vaultPath, '/backup/mastermind.vault');
  assert.strictEqual(sandbox.startupRouteCalls, 1);
});

at('refuses to overwrite a DIFFERENT existing mastermind.vault in the target folder', async () => {
  const picked = buildFixtureVault();
  const existing = '{"different":"vault contents entirely"}';
  const mockFs = makeMockFs({
    '/shared/renamed.vault': picked,
    '/shared/mastermind.vault': existing,
  });
  mockFs._nextFilePick = '/shared/renamed.vault';
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFile', sandbox)();
  assert.strictEqual(mockFs.files['/shared/mastermind.vault'], existing, 'the pre-existing vault must not be clobbered');
  assert.strictEqual(sandbox.startupRouteCalls, 0, 'must not proceed past the conflict');
  assert.ok(store()['ss-import-error'].textContent.length > 0, 'must explain the conflict, not fail silently');
});

at('cancelling the file dialog (null) does nothing and shows no error', async () => {
  const mockFs = makeMockFs({});
  mockFs._nextFilePick = null;
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFile', sandbox)();
  assert.strictEqual(sandbox.startupRouteCalls, 0);
  assert.ok(!store()['ss-import-error'] || store()['ss-import-error'].textContent === '', 'no error should be shown for a cancelled dialog');
});

// ── importPickVaultFolder ────────────────────────────────────────────

at('picking a folder that contains a vault imports it', async () => {
  const vault = buildFixtureVault();
  const mockFs = makeMockFs({ '/mydata/mastermind.vault': vault });
  mockFs._nextFolderPick = '/mydata';
  const { sandbox } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFolder', sandbox)();
  assert.strictEqual(sandbox.NX_CONFIG.dataDir, '/mydata');
  assert.strictEqual(sandbox.NX_CONFIG.vaultPath, '/mydata/mastermind.vault');
  assert.strictEqual(sandbox.startupRouteCalls, 1);
});

at('picking a folder with NO vault in it reports that plainly, does not proceed', async () => {
  const mockFs = makeMockFs({});
  mockFs._nextFolderPick = '/empty-folder';
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFolder', sandbox)();
  assert.strictEqual(sandbox.startupRouteCalls, 0);
  assert.ok(/no mastermind\.vault/i.test(store()['ss-import-error'].textContent));
});

at('cancelling the folder dialog (null) does nothing', async () => {
  const mockFs = makeMockFs({});
  mockFs._nextFolderPick = null;
  const { sandbox } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFolder', sandbox)();
  assert.strictEqual(sandbox.startupRouteCalls, 0);
});

// ── _importFinalize: validity check ──────────────────────────────────

at('a file that exists but is not valid vault JSON is rejected with a real reason', async () => {
  const mockFs = makeMockFs({ '/junk/mastermind.vault': 'not even json' });
  mockFs._nextFolderPick = '/junk';
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFolder', sandbox)();
  assert.strictEqual(sandbox.startupRouteCalls, 0);
  assert.ok(store()['ss-import-error'].textContent.length > 0);
  assert.ok(sandbox.NX_CONFIG.dataDir === undefined, 'must not persist a directory for an invalid vault');
});

at('a well-formed but wrong-shaped JSON object is rejected, not silently accepted', async () => {
  const mockFs = makeMockFs({ '/wrong/mastermind.vault': JSON.stringify({ hello: 'world' }) });
  mockFs._nextFolderPick = '/wrong';
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFolder', sandbox)();
  assert.strictEqual(sandbox.startupRouteCalls, 0);
  assert.ok(store()['ss-import-error'].textContent.length > 0);
});

at('a valid vault clears any previous error and shows a status line instead', async () => {
  const vault = buildFixtureVault();
  const mockFs = makeMockFs({ '/good/mastermind.vault': vault });
  mockFs._nextFolderPick = '/good';
  const { sandbox, store } = makeSandbox(mockFs);
  vm.runInContext(importRegionSrc, sandbox);
  await vm.runInContext('importPickVaultFolder', sandbox)();
  assert.strictEqual(store()['ss-import-error'].style.display, 'none');
  assert.notStrictEqual(store()['ss-import-status'].style.display, 'none');
});

async function run() {
  console.log('\nIMPORT-IDENTITY FLOW\n');
  for (const { name, fn } of pending) {
    try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
    catch (e) {
      results.push({ name, ok: false });
      console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
    }
  }
  const fails = results.filter(r => !r.ok);
  console.log('\nimport-flow: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
}
run();
