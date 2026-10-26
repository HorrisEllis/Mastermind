'use strict';
// ═══════════════════════════════════════════════════════════════════
// NODE/CONNECTION INTEGRITY
//
// The hash chain (vault-ledger.js) and rollback guard (vault-guard.js)
// verify the FILE wasn't tampered with or rolled back. Neither says
// anything about whether the DATA inside a legitimately-decrypted
// file is internally consistent. This checks that separately: a
// duplicate node id, or a connection pointing at a node id that no
// longer exists, decrypts and verifies perfectly fine while still
// being a broken graph.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nNODE/CONNECTION INTEGRITY\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try {
      fn();
      console.log('  \u2713 ' + name);
      pass++;
    } catch (e) {
      console.log('  \u2717 ' + name);
      console.log('      ' + e.message);
    }
  }
  console.log('\nnode-integrity: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

const vaultSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');
const start = vaultSrc.indexOf('function vaultCheckNodeIntegrity(data) {');
assert.ok(start > -1, 'vaultCheckNodeIntegrity not found');
const bodyStart = vaultSrc.indexOf('{', start);
let depth = 0, end = bodyStart;
for (let i = bodyStart; i < vaultSrc.length; i++) {
  if (vaultSrc[i] === '{') depth++;
  else if (vaultSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = vaultSrc.slice(start, end) + '\nthis.vaultCheckNodeIntegrity = vaultCheckNodeIntegrity;\n';

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(fnSrc, sandbox);
const vaultCheckNodeIntegrity = sandbox.vaultCheckNodeIntegrity;

t('a healthy graph (unique ids, all connections valid) reports ok', () => {
  const data = {
    canvas: {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      conns: [{ id: 'c1', from: 'a', to: 'b' }, { id: 'c2', from: 'b', to: 'c' }],
    },
  };
  const r = vaultCheckNodeIntegrity(data);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.duplicateIds.length, 0);
  assert.strictEqual(r.danglingConns.length, 0);
  assert.strictEqual(r.totalNodes, 3);
  assert.strictEqual(r.totalConns, 2);
});

t('a duplicate node id is caught', () => {
  const data = { canvas: { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'a' }], conns: [] } };
  const r = vaultCheckNodeIntegrity(data);
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(Array.from(r.duplicateIds), ['a']);
});

t('a connection pointing at a node id that does not exist is caught', () => {
  const data = {
    canvas: {
      nodes: [{ id: 'a' }, { id: 'b' }],
      conns: [{ id: 'c1', from: 'a', to: 'ghost-node' }],
    },
  };
  const r = vaultCheckNodeIntegrity(data);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.danglingConns.length, 1);
  assert.strictEqual(r.danglingConns[0].to, 'ghost-node');
});

t('a connection with a dangling FROM (not just TO) is also caught', () => {
  const data = {
    canvas: {
      nodes: [{ id: 'a' }],
      conns: [{ id: 'c1', from: 'ghost-source', to: 'a' }],
    },
  };
  const r = vaultCheckNodeIntegrity(data);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.danglingConns[0].from, 'ghost-source');
});

t('multiple duplicates and multiple dangling connections are all reported, not just the first', () => {
  const data = {
    canvas: {
      nodes: [{ id: 'a' }, { id: 'a' }, { id: 'b' }, { id: 'b' }],
      conns: [{ from: 'a', to: 'x' }, { from: 'y', to: 'b' }],
    },
  };
  const r = vaultCheckNodeIntegrity(data);
  assert.strictEqual(r.duplicateIds.length, 2);
  assert.strictEqual(r.danglingConns.length, 2);
});

t('an empty/missing canvas is treated as trivially ok, not an error', () => {
  assert.strictEqual(vaultCheckNodeIntegrity({}).ok, true);
  assert.strictEqual(vaultCheckNodeIntegrity({ canvas: {} }).ok, true);
  assert.strictEqual(vaultCheckNodeIntegrity(null).ok, true);
  assert.strictEqual(vaultCheckNodeIntegrity({ canvas: { nodes: [] } }).ok, true);
});

t('nodes/connections with no id field at all do not crash the check', () => {
  const data = { canvas: { nodes: [{}, { id: 'a' }], conns: [{}, { from: 'a' }] } };
  assert.doesNotThrow(() => vaultCheckNodeIntegrity(data));
});

t('a vault with no connections at all (canvas.conns absent) is still checked for duplicate ids', () => {
  const data = { canvas: { nodes: [{ id: 'a' }, { id: 'a' }] } };
  const r = vaultCheckNodeIntegrity(data);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.duplicateIds.length, 1);
  assert.strictEqual(r.totalConns, 0);
});

run();
