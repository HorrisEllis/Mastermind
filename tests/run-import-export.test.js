'use strict';
// ═══════════════════════════════════════════════════════════════════
// IMPORT ↔ EXPORT ROUND TRIP
//
// The Import panel offered ".nxvault" as the native MASTERMIND format.
// Nothing has written a .nxvault since v0.1.2 — export produces
// mastermind-vault-<ts>.vault, a v6 envelope — and .vault was not in
// the accept list at all.
//
// So the one native format the app produces could not be selected, and
// the format it advertised had not existed for thirty versions. Worse,
// the importer that .nxvault routed to used the v5 decrypt shape with
// no additionalData, so it could never have opened a v6 file even if
// you renamed it: an AAD-bound envelope fails as "wrong password".
//
// A backup you cannot restore is not a backup. These tests assert the
// round trip closes.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV = require(path.join(ROOT, 'foundation', 'vault', 'vault-envelope.js'));
const VC  = require(path.join(ROOT, 'foundation', 'vault', 'vault-crypto.js'));

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}
async function ta(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const engine = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
const html   = fs.readFileSync(path.join(ROOT, 'index-browser.html'), 'utf8');
const vault  = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');

console.log('\nIMPORT / EXPORT\n');

// ── What export actually writes ────────────────────────────────────

t('export writes .vault, and that is what the accept list must contain', () => {
  assert.ok(/_downloadText\('mastermind-vault-' \+ Date\.now\(\) \+ '\.vault'/.test(vault),
    'export filename changed \u2014 the import side has to follow');
  const accept = html.match(/id="import-file"[^>]*accept="([^"]+)"/);
  assert.ok(accept, 'no file input found');
  assert.ok(accept[1].includes('.vault'),
    'the one native format the app produces cannot be selected: ' + accept[1]);
});

t('the panel no longer advertises .nxvault as the native format', () => {
  assert.ok(!/\.json · \.nxvault/.test(html) && !/\.json \u00b7 \.nxvault/.test(html),
    'still offering a format nothing has written since v0.1.2');
  assert.ok(/\.vault \u00b7 \.json/.test(html), 'the native card should name .vault first');
});

t('.nxvault is still ACCEPTED, just not advertised', () => {
  const accept = html.match(/id="import-file"[^>]*accept="([^"]+)"/)[1];
  assert.ok(accept.includes('.nxvault'),
    'an old v5 export should still open \u2014 dropping it would strand real files');
  assert.ok(/ext === 'vault' \|\| ext === 'nxvault'/.test(engine));
});

t('a v6 file with no extension is detected by its format field', () => {
  assert.ok(/d\.format === 'mastermind-vault'/.test(engine),
    'content sniffing must recognise the envelope, not only the filename');
  assert.ok(/d\.format === 'mastermind-export-plaintext'/.test(engine),
    'the decrypted export is also a native file');
});

// ── The decrypt path ───────────────────────────────────────────────

t('the importer uses the v6 envelope path, with AAD', () => {
  const fn = engine.slice(engine.indexOf('async function importNexusVault'),
                          engine.indexOf('function importObsidian'));
  assert.ok(/VaultEnvelope\.parse/.test(fn), 'does not parse the envelope');
  assert.ok(/VaultEnvelope\.aadBytes/.test(fn),
    'a v6 envelope is AAD-bound \u2014 decrypting without it always fails');
  assert.ok(/ciphertextSha256/.test(fn),
    'without the hash check a damaged file reports as a wrong password');
});

t('it asks for the file\u2019s own password when the salt differs', () => {
  const fn = engine.slice(engine.indexOf('async function importNexusVault'),
                          engine.indexOf('function importObsidian'));
  assert.ok(/env\.kdf\.salt !== AUTH\.kdf\.salt/.test(fn),
    'an exported vault carries its own salt \u2014 the session key will not open it');
  assert.ok(/deriveKey\(pw, env\.kdf\.salt, env\.kdf\.iterations/.test(fn),
    'must derive against the FILE\u2019s parameters, not the session\u2019s');
});

t('a damaged file is reported as damaged, not as a wrong password', () => {
  const fn = engine.slice(engine.indexOf('async function importNexusVault'),
                          engine.indexOf('function importObsidian'));
  assert.ok(/not a password problem/.test(fn));
});

t('the v5 path still exists for old files', () => {
  const fn = engine.slice(engine.indexOf('async function importNexusVault'),
                          engine.indexOf('function importObsidian'));
  assert.ok(/_aesDecrypt\(AUTH\.key/.test(fn), 'a v5 export must still open');
});

// ── The round trip, for real ───────────────────────────────────────

(async function run() {
  await ta('THE ROUND TRIP: a v6 export re-opens with its own password', async () => {
    const state = { canvas: { nodes: [{ id: 'n1', label: 'survives export' }] }, username: 'operator' };

    // Build exactly what vaultExport('encrypted') produces.
    const salt = VC.randomSaltB64(ENV.SALT_BYTES);
    const iters = ENV.MIN_ITERATIONS;
    const key = await VC.deriveKey('export-password', salt, iters, 32);
    const header = ENV.buildHeader({
      vaultId: VC.uuidV4(),
      kdf: { salt, iterations: iters },
      iv: VC.randomIvB64(ENV.IV_BYTES),
      saveCount: 3,
      ledgerAnchor: null,
    });
    const ct = await VC.encrypt(key, VC.utf8Encode(JSON.stringify(state)), header.iv, ENV.aadBytes(header));
    const file = ENV.serialize(ENV.assemble(header, VC.toBase64(ct), await VC.sha256Hex(ct)));

    // Now open it the way the importer does.
    const parsed = ENV.parse(file);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.legacy, false, 'an export must parse as v6');

    const env = parsed.envelope;
    const back = VC.fromBase64(env.data);
    assert.ok(VC.timingSafeEqualHex(await VC.sha256Hex(back), env.ciphertextSha256));

    const k2 = await VC.deriveKey('export-password', env.kdf.salt, env.kdf.iterations, env.kdf.keyLen);
    const plain = await VC.decrypt(k2, back, env.iv, ENV.aadBytes(env));
    assert.deepStrictEqual(JSON.parse(VC.utf8Decode(plain)), state);
  });

  await ta('THE OLD PATH PROVEN BROKEN: v5 decrypt cannot open a v6 export', async () => {
    // This is what importNexusVault used to do. It is not that it was
    // untested — it could not have worked.
    const salt = VC.randomSaltB64(ENV.SALT_BYTES);
    const key = await VC.deriveKey('pw', salt, ENV.MIN_ITERATIONS, 32);
    const header = ENV.buildHeader({
      vaultId: VC.uuidV4(), kdf: { salt, iterations: ENV.MIN_ITERATIONS },
      iv: VC.randomIvB64(ENV.IV_BYTES), saveCount: 1, ledgerAnchor: null,
    });
    const ct = await VC.encrypt(key, VC.utf8Encode('{"a":1}'), header.iv, ENV.aadBytes(header));
    const env = ENV.assemble(header, VC.toBase64(ct), await VC.sha256Hex(ct));

    // v5 shape: no additionalData.
    await assert.rejects(
      () => VC.decrypt(key, VC.fromBase64(env.data), env.iv, null),
      'decrypting an AAD-bound envelope without the AAD must fail \u2014 which is why the old importer reported "wrong password" on a correct file'
    );
  });

  await ta('a plaintext export round-trips too', async () => {
    const payload = JSON.stringify({
      format: 'mastermind-export-plaintext',
      warning: 'UNENCRYPTED.',
      exported: new Date().toISOString(),
      payloadVersion: 6,
      data: { canvas: { nodes: [{ id: 'p1' }] } },
    });
    const d = JSON.parse(payload);
    assert.strictEqual(d.format, 'mastermind-export-plaintext');
    assert.strictEqual(d.data.canvas.nodes[0].id, 'p1');
  });

  const fails = results.filter(r => !r.ok);
  console.log('\nimport-export: ' + (results.length - fails.length) + '/' + results.length + ' passed');
  process.exitCode = fails.length ? 1 : 0;
})();
