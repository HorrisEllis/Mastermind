'use strict';
// ═══════════════════════════════════════════════════════════════════
// LOCALSTORAGE AUDIT — everything stored in the vault, not beside it
//
// Eight modules were writing sensitive personal data to plaintext
// localStorage on every save, in parallel with the vault — the same
// class of bug already found and fixed once for Voice Lattice
// (mm_vl_state_v2) and the Associative Engine (mm_vle_engine_v1). Six
// of the eight (body, horizon, domain, mirror, relational, almState)
// already had a real vault path; the localStorage write was pure
// redundant leakage. For relational and mirror specifically it was
// worse than a leak: both loaded from localStorage lazily, the FIRST
// time the module opened in a session — which is after
// vaultDeserialize() had already restored the correct data — so
// opening the module could silently overwrite correct vault state with
// a stale local copy. Two modules (systems, memory) had no vault path
// at all; that data existed only as a single plaintext localStorage
// copy, full stop.
//
// This proves, per module: save() no longer touches localStorage;
// load() no longer reads it (so it can't clobber); a real vault save
// still fires. And for systems/memory specifically: the new vault
// serialize/deserialize round-trip actually works.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

function run() {
  const fails = results.filter(r => !r.ok).length;
  console.log('\nlocalstorage-audit: ' + (results.length - fails) + '/' + results.length + ' passed');
  process.exitCode = fails ? 1 : 0;
}

const engineSrc = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
const vaultSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');

function extractFn(src, name) {
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

// A fake localStorage that records every get/set call, since these
// tests need to prove load() doesn't consult it at all, not just that
// it "happens" to ignore what's there.
function makeStorage(preSeeded) {
  const store = Object.assign({}, preSeeded);
  const getCalls = [];
  const setCalls = [];
  return {
    _getCalls: getCalls, _setCalls: setCalls, _raw: store,
    getItem: (k) => { getCalls.push(k); return k in store ? store[k] : null; },
    setItem: (k, v) => { setCalls.push(k); store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
  };
}

function makeSandbox(stateVarName, initialState, opts) {
  const o = opts || {};
  const localStorage = makeStorage(o.preSeeded);
  const vaultDirtySaveCalls = [];
  const sandbox = {
    console,
    localStorage,
    vaultDirtySave: (ms) => vaultDirtySaveCalls.push(ms),
    autosaveJAA: () => {},
    MMLog: { info() {}, warn() {}, error() {} },
    JSON, Object, Array,
  };
  sandbox[stateVarName] = initialState;
  vm.createContext(sandbox);
  return { sandbox, localStorage, vaultDirtySaveCalls };
}

function loadFns(sandbox, fnSrcs) {
  vm.runInContext(fnSrcs.join('\n') + '\n' + fnSrcs.map(s => {
    const m = s.match(/function (\w+)/);
    return 'this.' + m[1] + ' = ' + m[1] + ';';
  }).join('\n'), sandbox);
}

// ── The six "safe strip" modules: save() no longer writes,
//    load() no longer reads (so it can't clobber) ───────────────────

const CASES = [
  { label: 'Body', stateVar: 'BODY', loadFn: 'bodyInit', saveFn: 'bodySave', key: 'nexus_body_state', delay: 5000,
    initial: () => ({ nervousSystemState: null, intuitionMode: null, somaticLog: [], patternLog: [], invariantMap: {} }) },
  { label: 'Horizon', stateVar: 'HORIZON_STATE', loadFn: 'horizonLoad', saveFn: 'horizonSave', key: 'mm_horizon_state', delay: 5000,
    initial: () => ({ plans: [] }) },
  { label: 'Domain', stateVar: 'DOMAIN_STATE', loadFn: 'domainStateLoad', saveFn: 'domainStateSave', key: 'nexus_domain_state', delay: 5000,
    initial: () => ({ intelligenceRatings: {}, customDomains: {}, selectedMeta: new Set(), selectedDomains: new Set(), selectedSubs: new Set(), populatedNodes: [] }) },
  { label: 'Mirror', stateVar: 'MIRROR_STATE', loadFn: 'mirrorLoad', saveFn: 'mirrorSave', key: 'mm_mirror_state', delay: 4000,
    initial: () => ({}), extraSandbox: { _mirrorSeedIfEmpty: () => {} } },
  { label: 'Relational', stateVar: 'RELATIONAL_STATE', loadFn: 'relationalLoad', saveFn: 'relationalSave', key: 'mm_relational_state', delay: 4000,
    initial: () => ({ people: [], moments: [], patterns: [] }) },
  { label: 'Systems', stateVar: 'SYSTEMS', loadFn: 'systemsLoad', saveFn: 'systemsSave', key: 'nexus_systems_state', delay: 5000,
    initial: () => ({ variables: [], links: [], loops: [] }) },
];

for (const c of CASES) {
  t(c.label + ': save() no longer writes plaintext to localStorage', () => {
    const { sandbox, localStorage, vaultDirtySaveCalls } = makeSandbox(c.stateVar, c.initial(), { });
    Object.assign(sandbox, c.extraSandbox || {});
    loadFns(sandbox, [extractFn(engineSrc, c.saveFn)]);
    vm.runInContext(c.saveFn + '()', sandbox);
    assert.strictEqual(localStorage._setCalls.length, 0, c.label + 'Save() must not call localStorage.setItem at all');
    assert.deepStrictEqual(vaultDirtySaveCalls, [c.delay], c.label + 'Save() must still trigger a real vault save');
  });

  t(c.label + ': load() no longer reads localStorage — cannot clobber vault-restored data with a stale copy', () => {
    const stale = { [c.key]: JSON.stringify({ tamperedMarker: 'STALE_LOCAL_COPY_' + c.label }) };
    const { sandbox, localStorage } = makeSandbox(c.stateVar, c.initial(), { preSeeded: stale });
    Object.assign(sandbox, c.extraSandbox || {});
    loadFns(sandbox, [extractFn(engineSrc, c.loadFn)]);
    vm.runInContext(c.loadFn + '()', sandbox);
    assert.strictEqual(localStorage._getCalls.includes(c.key), false, c.label + 'Load() must not read ' + c.key + ' at all');
    assert.strictEqual(JSON.stringify(sandbox[c.stateVar]).includes('STALE_LOCAL_COPY'), false, 'the stale value must not have reached live state');
  });
}

// ── ALM (separate file, modules/alm/engine.js) ────────────────────

t('ALM: almSave() no longer writes plaintext to localStorage', () => {
  const almSrc = fs.readFileSync(path.join(ROOT, 'modules', 'alm', 'engine.js'), 'utf8');
  const localStorage = makeStorage();
  const vaultDirtySaveCalls = [];
  const sandbox = {
    console, localStorage,
    vaultDirtySave: (ms) => vaultDirtySaveCalls.push(ms),
    ALM_STATE: { functionLog: [], modelLog: [] },
    MMLog: { info() {}, warn() {}, error() {} },
    JSON, Object,
  };
  vm.createContext(sandbox);
  const fnSrc = extractFn(almSrc, 'almSave');
  vm.runInContext(fnSrc + '\nthis.almSave = almSave;', sandbox);
  vm.runInContext('almSave()', sandbox);
  assert.strictEqual(localStorage._setCalls.length, 0);
  assert.deepStrictEqual(vaultDirtySaveCalls, [4000]);
});

t('ALM: almLoad() no longer reads localStorage', () => {
  const almSrc = fs.readFileSync(path.join(ROOT, 'modules', 'alm', 'engine.js'), 'utf8');
  const localStorage = makeStorage({ mm_alm_state_v2: JSON.stringify({ tamperedMarker: 'STALE' }) });
  const sandbox = {
    console, localStorage,
    ALM_STATE: { functionLog: [] },
    MMLog: { info() {}, warn() {}, error() {} },
    JSON, Object,
  };
  vm.createContext(sandbox);
  const fnSrc = extractFn(almSrc, 'almLoad');
  vm.runInContext(fnSrc + '\nthis.almLoad = almLoad;', sandbox);
  vm.runInContext('almLoad()', sandbox);
  assert.strictEqual(localStorage._getCalls.length, 0);
  assert.strictEqual(JSON.stringify(sandbox.ALM_STATE).includes('STALE'), false);
});

// ── The vestigial write-back removal ──────────────────────────────

t('vaultDeserialize() no longer writes almDeltas/intuitionRatings back out to localStorage', () => {
  assert.ok(!/localStorage\.setItem\('mm_alm_deltas'/.test(vaultSrc), 'must not re-write mm_alm_deltas to disk on every load');
  assert.ok(!/localStorage\.setItem\('mm_intuition_ratings'/.test(vaultSrc), 'must not re-write mm_intuition_ratings to disk on every load');
});

// ── _ORPHAN_KEYS registration — every retired key must be harvestable ─

t('every retired localStorage key is registered in _ORPHAN_KEYS so existing plaintext data gets harvested, not abandoned', () => {
  const orphanBlockStart = vaultSrc.indexOf('const _ORPHAN_KEYS = [');
  const orphanBlockEnd = vaultSrc.indexOf('\n];', orphanBlockStart);
  const orphanBlock = vaultSrc.slice(orphanBlockStart, orphanBlockEnd);
  const expected = [
    'nexus_body_state', 'mm_horizon_state', 'nexus_domain_state',
    'mm_mirror_state', 'mm_relational_state', 'mm_alm_state_v2',
    'nexus_systems_state', 'mm_memory_architecture_v1',
  ];
  for (const key of expected) {
    assert.ok(orphanBlock.includes("'" + key + "'"), key + ' must be registered in _ORPHAN_KEYS');
  }
});

t('nexus_ai_config is deliberately NOT in _ORPHAN_KEYS — it is still actively used for non-sensitive fields, and harvest deletes the whole key', () => {
  const orphanBlockStart = vaultSrc.indexOf('const _ORPHAN_KEYS = [');
  const orphanBlockEnd = vaultSrc.indexOf('\n];', orphanBlockStart);
  const orphanBlock = vaultSrc.slice(orphanBlockStart, orphanBlockEnd);
  assert.ok(!orphanBlock.includes("'nexus_ai_config'"), 'nexus_ai_config must not go through the wholesale-delete harvest path');
});

// ── The targeted AI apiKey scrub — precise, not wholesale ─────────

t('aiLoad() scrubs a stray plaintext apiKey field but preserves the rest of the config', () => {
  const localStorage = makeStorage({
    nexus_ai_config: JSON.stringify({ provider: 'ollama', model: 'llama3', apiKey: 'sk-LEAKED-SECRET-VALUE', guardianToken: 'local-pairing-token' }),
  });
  const sandbox = {
    console, localStorage,
    AI_KEY: 'nexus_ai_config',
    AI: { provider: null, model: null },
    MMLog: { info() {}, warn() {}, error() {} },
    JSON, Object,
  };
  vm.createContext(sandbox);
  const fnSrc = extractFn(engineSrc, 'aiLoad');
  vm.runInContext(fnSrc + '\nthis.aiLoad = aiLoad;', sandbox);
  vm.runInContext('aiLoad()', sandbox);

  const rewritten = JSON.parse(localStorage._raw.nexus_ai_config);
  assert.ok(!('apiKey' in rewritten), 'apiKey must be scrubbed from the localStorage copy');
  assert.strictEqual(rewritten.provider, 'ollama', 'non-sensitive fields must survive the scrub');
  assert.strictEqual(rewritten.guardianToken, 'local-pairing-token', 'the local pairing token must survive — it is not a secret, and this key is still its legitimate home');
  assert.strictEqual(sandbox.AI.apiKey, undefined, 'aiLoad() must never populate AI.apiKey from localStorage — the vault is the only source for it');
});

t('aiLoad() is a no-op scrub when there is no apiKey field to begin with (does not rewrite unnecessarily)', () => {
  const localStorage = makeStorage({ nexus_ai_config: JSON.stringify({ provider: 'chatgpt' }) });
  const sandbox = {
    console, localStorage, AI: {},
    AI_KEY: 'nexus_ai_config',
    MMLog: { info() {}, warn() {}, error() {} },
    JSON, Object,
  };
  vm.createContext(sandbox);
  const fnSrc = extractFn(engineSrc, 'aiLoad');
  vm.runInContext(fnSrc + '\nthis.aiLoad = aiLoad;', sandbox);
  vm.runInContext('aiLoad()', sandbox);
  assert.strictEqual(localStorage._setCalls.length, 0, 'must not rewrite the key when there was nothing to scrub');
});

// ── Systems/Memory: the NEW vault serialize/deserialize round-trip ───

t('vaultSerialize() now includes systems (previously had no vault path at all)', () => {
  assert.ok(/systems: typeof SYSTEMS/.test(vaultSrc), 'systems must be part of the serialized modules block');
});
t('vaultSerialize() now includes memory (previously had no vault path at all)', () => {
  assert.ok(/memory: typeof MEM_STATE/.test(vaultSrc), 'memory must be part of the serialized modules block');
});
t('vaultDeserialize() restores SYSTEMS.variables/links/loops from m.systems', () => {
  assert.ok(/if \(m\.systems && typeof SYSTEMS/.test(vaultSrc));
  assert.ok(/SYSTEMS\.variables = Array\.isArray\(m\.systems\.variables\)/.test(vaultSrc));
});
t('vaultDeserialize() restores MEM_STATE.compartments from m.memory', () => {
  assert.ok(/if \(m\.memory && typeof MEM_STATE/.test(vaultSrc));
  assert.ok(/MEM_STATE\.compartments = Array\.isArray\(m\.memory\.compartments\)/.test(vaultSrc));
});

// ── The wipe-vault cleanup list — must not drift stale again ──────

t('the full-wipe localStorage cleanup list includes every module retired by this audit, via _ORPHAN_KEYS rather than a second hand-maintained list', () => {
  const fnStart = engineSrc.indexOf('async function optsWipeVault()');
  assert.ok(fnStart > -1, 'optsWipeVault not found');
  const fnEnd = engineSrc.indexOf('\nasync function', fnStart + 10);
  const fnSrc = engineSrc.slice(fnStart, fnEnd);
  assert.ok(/\.\.\.\(typeof _ORPHAN_KEYS/.test(fnSrc), 'the wipe list must spread in _ORPHAN_KEYS rather than hand-listing the retired keys a second time');
});

run();
