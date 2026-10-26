'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { t, summary, assert } = require('./harness');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'foundation', 'ai', 'clearglass-transport.js'), 'utf8');

function makeSandbox({ AI = {}, NXAPI = undefined, fetchImpl = null, statusSpy = null, captureSpy = null } = {}) {
  const calls = { statusStart: [], statusEnd: [], capture: [] };
  const sandbox = {
    console, Promise, Date, JSON, Array, Object, String, encodeURIComponent,
    setTimeout, clearTimeout,
    AbortSignal: { timeout: () => ({}) },
    AI,
    window: {},
  };
  sandbox.window.NXAPI = NXAPI;
  sandbox.aiStatusStart = (label, meta) => { calls.statusStart.push({ label, meta }); return 'sid-' + calls.statusStart.length; };
  sandbox.aiStatusEnd = (id, ok, message) => { calls.statusEnd.push({ id, ok, message }); };
  sandbox.mmCaptureExchange = (prompt, reply, meta) => { calls.capture.push({ prompt, reply, meta }); };
  if (fetchImpl) sandbox.fetch = fetchImpl;
  vm.createContext(sandbox);
  new vm.Script(SRC).runInContext(sandbox);
  return { sandbox, calls };
}

async function run() {
  console.log('\n== clearglass-transport.js — renderer-side path selection ==');

  await t('NXAPI present, success: returns text, captures the exchange, ends status ok', async () => {
    const NXAPI = { cgAsk: async () => ({ ok: true, text: 'the answer' }) };
    const { sandbox, calls } = makeSandbox({ AI: { provider: 'claude', account: 'default' }, NXAPI });
    const text = await sandbox.clearglassCall('sys', 'hi', {});
    assert.strictEqual(text, 'the answer');
    assert.strictEqual(calls.capture.length, 1);
    assert.strictEqual(calls.statusEnd[0].ok, true);
  });

  await t('NXAPI present, NO_COMPOSER: rethrown as a human "sign in" message naming the agent, not the raw code', async () => {
    const NXAPI = { cgAsk: async () => ({ ok: false, error: 'NO_COMPOSER: no input box on Claude' }) };
    const { sandbox, calls } = makeSandbox({ AI: { provider: 'claude', account: 'default' }, NXAPI });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', {}), /Not signed in to Claude/);
    assert.strictEqual(calls.statusEnd[0].ok, false);
  });

  await t('NXAPI present, other failure: raw error propagates, no exchange captured on failure', async () => {
    const NXAPI = { cgAsk: async () => ({ ok: false, error: 'TIMEOUT_WAITING_REPLY on claude' }) };
    const { sandbox, calls } = makeSandbox({ AI: { provider: 'claude', account: 'default' }, NXAPI });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', {}), /TIMEOUT_WAITING_REPLY/);
    assert.strictEqual(calls.capture.length, 0, 'a failed exchange should not be captured into the lattice');
  });

  await t('NXAPI.cgAsk itself throws (IPC dropped): status is still ended (not left spinning forever), error rethrown', async () => {
    const NXAPI = { cgAsk: async () => { throw new Error('ipc channel closed'); } };
    const { sandbox, calls } = makeSandbox({ AI: { provider: 'claude', account: 'default' }, NXAPI });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', {}), /ipc channel closed/);
    assert.strictEqual(calls.statusEnd.length, 1, 'status chip must not be left spinning on an IPC-level throw');
    assert.strictEqual(calls.statusEnd[0].ok, false);
  });

  await t('browser mode (no NXAPI), guardian-lite unreachable: named error, not a hang', async () => {
    const fetchImpl = async () => { throw new Error('connect ECONNREFUSED'); };
    const { sandbox } = makeSandbox({ AI: { provider: 'claude' }, NXAPI: undefined, fetchImpl });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', {}), /ClearGlass Lite not reachable/);
  });

  await t('browser mode, guardian-lite alive but token rejected on ingest (401)', async () => {
    let call = 0;
    const fetchImpl = async (url) => {
      call++;
      if (String(url).includes('/health')) return { ok: true, json: async () => ({ ok: true }) };
      if (String(url).includes('/ingest')) return { ok: false, status: 401 };
      return { ok: true, json: async () => ([]) };
    };
    const { sandbox } = makeSandbox({ AI: { provider: 'claude' }, NXAPI: undefined, fetchImpl });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', {}), /rejected the auth token/);
  });

  await t('browser mode, full relay round trip: finds the response row, captures exchange, cleans up via DELETE', async () => {
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url: String(url), method: (opts && opts.method) || 'GET' });
      if (String(url).includes('/health')) return { ok: true, json: async () => ({ ok: true }) };
      if (String(url).includes('/ingest')) return { ok: true, text: async () => '{}' };
      if (String(url).includes('/query') && (opts && opts.method) !== 'DELETE') {
        return { ok: true, json: async () => ([{ id: 'row-1', ok: true, text: 'relay reply' }]) };
      }
      return { ok: true, json: async () => ({}), text: async () => '{}' };
    };
    const { sandbox, calls: spies } = makeSandbox({ AI: { provider: 'claude' }, NXAPI: undefined, fetchImpl });
    const text = await sandbox.clearglassCall('sys', 'hi', { pollMs: 5 });
    assert.strictEqual(text, 'relay reply');
    assert.strictEqual(spies.capture.length, 1);
    assert.ok(calls.some((c) => c.method === 'DELETE'), 'the answered request row should be deleted so it cannot be re-served');
  });

  await t('browser mode, bridge reports its own failure (e.g. NO_COMPOSER on the tab): surfaced, not swallowed', async () => {
    const fetchImpl = async (url, opts) => {
      if (String(url).includes('/health')) return { ok: true, json: async () => ({ ok: true }) };
      if (String(url).includes('/ingest')) return { ok: true, text: async () => '{}' };
      if (String(url).includes('/query')) return { ok: true, json: async () => ([{ id: 'row-2', ok: false, error: 'NO_COMPOSER on claude' }]) };
      return { ok: true, json: async () => ({}), text: async () => '{}' };
    };
    const { sandbox } = makeSandbox({ AI: { provider: 'claude' }, NXAPI: undefined, fetchImpl });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', { pollMs: 5 }), /NO_COMPOSER/);
  });

  await t('browser mode, nothing ever answers: times out with a named, actionable error, not silently forever', async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes('/health')) return { ok: true, json: async () => ({ ok: true }) };
      if (String(url).includes('/ingest')) return { ok: true, text: async () => '{}' };
      return { ok: true, json: async () => ([]) };
    };
    const { sandbox } = makeSandbox({ AI: { provider: 'claude' }, NXAPI: undefined, fetchImpl });
    await assert.rejects(() => sandbox.clearglassCall('sys', 'hi', { pollMs: 20, timeoutMs: 100 }), /ClearGlass timed out/);
  });

  const fails = summary('clearglass-transport.js');
  process.exitCode = fails ? 1 : 0;
}

run();
