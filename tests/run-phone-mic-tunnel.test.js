'use strict';
// ═══════════════════════════════════════════════════════════════════
// PHONE MIC — Cloudflare Tunnel
//
// The codebase already had a deliberate, documented position on this
// (STATE.mode: 'lan' | 'tunnel' existed, the header explained the
// trade-off in detail) but zero actual implementation — setting the
// mode flag did nothing different. This tests the real implementation:
// detecting cloudflared, spawning it, parsing its generated URL out of
// its actual process output (not a mock of that output), and the
// server correctly branching between a self-signed HTTPS server (LAN,
// unchanged) and a plain HTTP one bound to 127.0.0.1 only (tunnel,
// since Cloudflare terminates TLS at their edge and only their own
// tunnel process needs to reach this one).
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const phoneMic = require(path.join(ROOT, 'foundation', 'ai', 'phone-mic.js'));

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { results.push({ name, ok: false }); console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      ')); }
}
const asyncResults = [];
async function at(name, fn) {
  try { await fn(); asyncResults.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { asyncResults.push({ name, ok: false }); console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      ')); }
}

// A fake "cloudflared" executable — a real, spawnable script, not a
// mock of one — so detectCloudflared()/startTunnel() are exercised
// against genuine process spawning and real stdout/stderr streaming.
function makeFakeCloudflared(behavior) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-cloudflared-'));
  const binPath = path.join(dir, 'cloudflared');
  // Real cloudflared answers `--version` quickly regardless of what
  // subcommand is coming next — detectCloudflared() probes with
  // exactly that before startTunnel() ever spawns `tunnel --url ...`,
  // so every fixture here has to handle both, the same as the real
  // binary does, or the internal detect step fails before the
  // behavior under test is ever reached.
  const versionCheck = 'if [ "$1" = "--version" ]; then echo "cloudflared version 2026.8.2 (built 2026-08-01)"; exit 0; fi\n';
  let script = '#!/bin/sh\n' + versionCheck;
  if (behavior === 'version') {
    // versionCheck above already covers this; nothing else needed.
  } else if (behavior === 'tunnel-url') {
    script +=
      'sleep 0.05\n' +
      'echo "2026-08-24T00:00:00Z INF Requesting new quick Tunnel on trycloudflare.com..." 1>&2\n' +
      'echo "2026-08-24T00:00:00Z INF |  https://real-fake-words.trycloudflare.com  |" 1>&2\n' +
      'sleep 3\n'; // stays alive like a real tunnel process would
  } else if (behavior === 'tunnel-crash') {
    script += 'echo "connection error: dial tcp: lookup failed" 1>&2\nexit 1\n';
  } else if (behavior === 'not-cloudflared') {
    script = '#!/bin/sh\necho "not the program you are looking for"\n'; // deliberately does NOT pass the version check
  }
  fs.writeFileSync(binPath, script);
  fs.chmodSync(binPath, 0o755);
  return { dir, binPath };
}

function withPath(dir, fn) {
  const real = process.env.PATH;
  process.env.PATH = dir + path.delimiter + real;
  try { return fn(); } finally { process.env.PATH = real; }
}
function withPathAsync(dir, fn) {
  const real = process.env.PATH;
  process.env.PATH = dir + path.delimiter + real;
  return Promise.resolve().then(fn).finally(() => { process.env.PATH = real; });
}

console.log('\nPHONE MIC — Cloudflare Tunnel\n');

// ── detectCloudflared: real process spawning ──────────────────────

t('detectCloudflared finds a real, working executable named cloudflared on PATH', () => {
  const fake = makeFakeCloudflared('version');
  const result = withPath(fake.dir, () => phoneMic.detectCloudflared());
  assert.strictEqual(result.ok, true);
  fs.rmSync(fake.dir, { recursive: true, force: true });
});

t('detectCloudflared reports NOT FOUND cleanly when nothing on PATH is named cloudflared', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-path-'));
  const result = withPath(emptyDir, () => phoneMic.detectCloudflared());
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'CLOUDFLARED_NOT_FOUND');
  assert.ok(/LAN mode does not need it/i.test(result.message), 'must reassure that the default feature still works');
  fs.rmSync(emptyDir, { recursive: true, force: true });
});

t('detectCloudflared rejects an executable that exists but is not actually cloudflared', () => {
  const fake = makeFakeCloudflared('not-cloudflared');
  const result = withPath(fake.dir, () => phoneMic.detectCloudflared());
  assert.strictEqual(result.ok, false, 'must not claim success just because SOME program answered --version');
  fs.rmSync(fake.dir, { recursive: true, force: true });
});

// ── STATE defaults ─────────────────────────────────────────────────

t('STATE defaults to lan mode and no tunnel process', () => {
  assert.strictEqual(phoneMic.STATE.mode, 'lan');
  assert.strictEqual(phoneMic.STATE.tunnelProcess, null);
});

// ── source-level checks for the mode-branching logic ───────────────
// (full integration of the HTTP/HTTPS server split needs a real
// network stack + Electron's resourcesPath; these confirm the actual
// branching logic is present and correctly shaped)

const serverSrc = fs.readFileSync(path.join(ROOT, 'foundation', 'ai', 'phone-mic.js'), 'utf8');

t('tunnel mode skips ensureCert entirely — Cloudflare terminates TLS, not this machine', () => {
  const startFn = serverSrc.slice(serverSrc.indexOf('async function start(opts)'));
  assert.ok(/if \(STATE\.mode === 'lan'\) \{\s*cert = ensureCert/.test(startFn), 'ensureCert must only run for lan mode');
});

t('tunnel mode uses a plain http server, not https — Cloudflare provides the real cert', () => {
  assert.ok(/STATE\.mode === 'tunnel' \? http\.createServer\(handler\) : https\.createServer/.test(serverSrc));
});

t('tunnel mode binds to 127.0.0.1 only, not 0.0.0.0 — the local server has no TLS of its own in this mode', () => {
  assert.ok(/STATE\.mode === 'tunnel' \? '127\.0\.0\.1' : '0\.0\.0\.0'/.test(serverSrc));
});

t('stop() kills the tunnel process, not just the local server', () => {
  const stopFn = serverSrc.slice(serverSrc.indexOf('async function stop()'));
  assert.ok(/STATE\.tunnelProcess/.test(stopFn) && /\.kill\(\)/.test(stopFn));
});

t('a failed tunnel start calls stop() to clean up rather than leaving a half-open server', () => {
  const startFn = serverSrc.slice(serverSrc.indexOf('async function start(opts)'));
  assert.ok(/catch \(e\) \{\s*await stop\(\);\s*return \{ ok: false, reason: 'TUNNEL_FAILED'/.test(startFn));
});

t('the tunnel-mode success response restates the real trade-off, not a generic success message', () => {
  assert.ok(/TLS terminates at/.test(serverSrc) && /re-encrypted back to this machine/.test(serverSrc));
});

// ── startTunnel: real spawning, real URL parsing ───────────────────

async function run() {
  await at('startTunnel resolves with the real URL parsed from actual spawned process output', async () => {
    const fake = makeFakeCloudflared('tunnel-url');
    try {
      const url = await withPathAsync(fake.dir, () => phoneMic.startTunnel(0));
      assert.strictEqual(url, 'https://real-fake-words.trycloudflare.com');
    } finally {
      try { phoneMic.STATE.tunnelProcess?.kill(); } catch (e) {}
      phoneMic.STATE.tunnelProcess = null;
      fs.rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  await at('startTunnel rejects clearly when the process exits before reporting a URL', async () => {
    const fake = makeFakeCloudflared('tunnel-crash');
    try {
      await withPathAsync(fake.dir, () => phoneMic.startTunnel(0));
      assert.fail('expected a rejection');
    } catch (e) {
      assert.ok(/exited before reporting/.test(e.message), 'got: ' + e.message);
    } finally {
      phoneMic.STATE.tunnelProcess = null;
      fs.rmSync(fake.dir, { recursive: true, force: true });
    }
  });

  await at('startTunnel rejects with a clear message when cloudflared is not found at all', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'empty-path-2-'));
    try {
      await withPathAsync(emptyDir, () => phoneMic.startTunnel(0));
      assert.fail('expected a rejection');
    } catch (e) {
      assert.ok(/CLOUDFLARED_NOT_FOUND|cloudflared is not available/i.test(e.message) || /not available/i.test(e.message), 'got: ' + e.message);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  const fails = results.filter(r => !r.ok).length;
  const asyncFails = asyncResults.filter(r => !r.ok).length;
  const total = results.length + asyncResults.length;
  console.log('\nphone-mic-tunnel: ' + (total - fails - asyncFails) + '/' + total + ' passed');
  process.exitCode = (fails + asyncFails) ? 1 : 0;
}

run();
