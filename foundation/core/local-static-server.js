// ═══════════════════════════════════════════════════════════════════
// LOCAL STATIC SERVER
// foundation/core/local-static-server.js
//
// Serves the app's own files (index-browser.html, foundation/, modules/,
// etc.) over HTTP instead of file://, so the renderer runs on an origin
// WebAuthn will actually grant navigator.credentials on. Pure Node —
// http, fs, path, crypto only — no Electron dependency, so it's testable
// directly rather than trusted because it's wrapped in a require('electron')
// that only runs inside a packaged app.
//
// ─────────────────────────────────────────────────────────────────
// WHY A TOKEN, NOT JUST A PORT
//
// An HTTP server on localhost is reachable by anything else running on
// the same machine — including a tab in the person's regular browser,
// via a plain <img src="http://localhost:PORT/..."> that CORS does not
// block for a simple GET. Binding to 127.0.0.1 stops the network from
// reaching it; it does not stop another local process from reaching it.
// Every request must carry a fresh, random 128-bit token as the first
// path segment, generated at server start and never persisted — so
// reaching this server means guessing both the port and the token,
// which is not a realistic attack.
//
// ─────────────────────────────────────────────────────────────────
// PATH TRAVERSAL
//
// Every resolved path is checked against the root directory after
// normalization. A request for /TOKEN/../../../etc/passwd resolves
// outside root and is refused — checked by string prefix on the
// normalized absolute path, not by trusting the URL shape.
//
// UUID: 4a3b2c1d-core-6000-8000-localserver1
// ═══════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
};

// Resolves `rel` against `root` and returns the absolute path only if
// it stays inside root; null otherwise. Exported on its own because
// path-traversal logic is exactly the kind of thing that should be
// unit-tested directly rather than only exercised through a live socket.
function resolveWithinRoot(root, rel) {
  const cleanRoot = path.normalize(root);
  const resolved = path.normalize(path.join(cleanRoot, rel));
  if (resolved === cleanRoot || resolved.startsWith(cleanRoot + path.sep)) return resolved;
  return null;
}

function _handler(root, token, defaultFile) {
  return (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }

    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400); res.end(); return; }

    const prefix = '/' + token + '/';
    if (!urlPath.startsWith(prefix)) { res.writeHead(403); res.end(); return; }
    const rel = urlPath.slice(prefix.length) || (defaultFile || 'index.html');

    const resolved = resolveWithinRoot(root, rel);
    if (!resolved) { res.writeHead(403); res.end(); return; }

    fs.readFile(resolved, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const ext = path.extname(resolved).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      if (req.method === 'HEAD') { res.end(); return; }
      res.end(data);
    });
  };
}

// Starts the server on 127.0.0.1 with an OS-assigned free port. Resolves
// { server, port, token, url(relPath), close() } or rejects on failure —
// the caller (main.js) decides what "failure" means for it (fall back
// to loadFile, in MASTERMIND's case).
function startLocalServer(root, opts) {
  const o = opts || {};
  return new Promise((resolve, reject) => {
    const token = o.token || crypto.randomBytes(16).toString('hex');
    const server = http.createServer(_handler(root, token, o.defaultFile));
    server.on('error', reject);
    server.listen(o.port || 0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server, port, token,
        url: (relPath) => `http://localhost:${port}/${token}/${relPath || o.defaultFile || 'index.html'}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

module.exports = { startLocalServer, resolveWithinRoot };
