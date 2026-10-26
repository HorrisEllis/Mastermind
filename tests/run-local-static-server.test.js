'use strict';
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { startLocalServer, resolveWithinRoot } = require(path.join(__dirname, '..', 'foundation', 'core', 'local-static-server.js'));

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function get(url, method) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: method || 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log('\nLOCAL STATIC SERVER\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try { await fn(); console.log('  \u2713 ' + name); pass++; }
    catch (e) { console.log('  \u2717 ' + name); console.log('      ' + e.message); }
  }
  console.log('\nlocal-static-server: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// A throwaway root with a couple of real files to serve, including a
// nested one — enough to exercise the actual fs.readFile path.
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-static-'));
fs.writeFileSync(path.join(TMP_ROOT, 'index-browser.html'), '<html>hi</html>');
fs.mkdirSync(path.join(TMP_ROOT, 'foundation'));
fs.writeFileSync(path.join(TMP_ROOT, 'foundation', 'test.js'), 'console.log(1);');

// Sibling file OUTSIDE root, used to prove traversal is actually blocked
const OUTSIDE_FILE = path.join(os.tmpdir(), 'mm-static-outside-secret.txt');
fs.writeFileSync(OUTSIDE_FILE, 'should never be servable');

t('resolveWithinRoot: a normal relative path resolves inside root', () => {
  const r = resolveWithinRoot(TMP_ROOT, 'foundation/test.js');
  assert.strictEqual(r, path.join(TMP_ROOT, 'foundation', 'test.js'));
});

t('resolveWithinRoot: ../ escaping the root is refused', () => {
  const r = resolveWithinRoot(TMP_ROOT, '../mm-static-outside-secret.txt');
  assert.strictEqual(r, null);
});

t('resolveWithinRoot: a deeply nested ../../../ escape is refused', () => {
  const r = resolveWithinRoot(TMP_ROOT, '../../../../../../etc/passwd');
  assert.strictEqual(r, null);
});

t('resolveWithinRoot: the root itself resolves (empty/., not an escape)', () => {
  const r = resolveWithinRoot(TMP_ROOT, '.');
  assert.strictEqual(r, path.normalize(TMP_ROOT));
});

let handle;

t('server starts on 127.0.0.1 with an assigned port', async () => {
  handle = await startLocalServer(TMP_ROOT, { defaultFile: 'index-browser.html' });
  assert.ok(handle.port > 0);
  assert.ok(handle.token.length >= 32, 'token should be a real random hex string, not a placeholder');
});

t('a request with the correct token serves the file', async () => {
  const res = await get(handle.url('index-browser.html'));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, '<html>hi</html>');
});

t('a nested file under the token path is served correctly', async () => {
  const res = await get(handle.url('foundation/test.js'));
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body, 'console.log(1);');
  assert.ok(res.headers['content-type'].includes('javascript'));
});

t('a request with the WRONG token is refused (403)', async () => {
  const res = await get(`http://localhost:${handle.port}/not-the-real-token/index-browser.html`);
  assert.strictEqual(res.status, 403);
});

t('a request with NO token at all is refused (403)', async () => {
  const res = await get(`http://localhost:${handle.port}/index-browser.html`);
  assert.strictEqual(res.status, 403);
});

t('a path-traversal attempt through the live socket is refused, not served', async () => {
  const res = await get(`http://localhost:${handle.port}/${handle.token}/../../../../../../../../${path.basename(OUTSIDE_FILE)}`);
  assert.notStrictEqual(res.body, 'should never be servable');
});

t('a nonexistent file under the correct token is a clean 404, not a crash', async () => {
  const res = await get(handle.url('this-file-does-not-exist.html'));
  assert.strictEqual(res.status, 404);
});

t('POST is refused with 405 — this server only ever serves static GETs', async () => {
  const res = await get(handle.url('index-browser.html'), 'POST');
  assert.strictEqual(res.status, 405);
});

t('two servers started back to back get DIFFERENT tokens', async () => {
  const second = await startLocalServer(TMP_ROOT, { defaultFile: 'index-browser.html' });
  assert.notStrictEqual(second.token, handle.token);
  await second.close();
});

t('close() actually shuts the server down', async () => {
  const h = await startLocalServer(TMP_ROOT, { defaultFile: 'index-browser.html' });
  const port = h.port, token = h.token;
  await h.close();
  await assert.rejects(get(`http://localhost:${port}/${token}/index-browser.html`), /ECONNREFUSED/);
});

run().finally(async () => {
  try { await handle?.close(); } catch {}
  try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(OUTSIDE_FILE, { force: true }); } catch {}
});
