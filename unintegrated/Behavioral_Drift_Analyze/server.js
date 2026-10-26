'use strict';

/**
 * BDA Server — :7821
 *
 * Routes:
 *   POST /observe          — ingest { role, text, ts? }
 *   GET  /ws               — WebSocket stream of drift events (replaces SSE)
 *   GET  /state            — full kernel state snapshot
 *   GET  /ledger           — full ledger dump
 *   GET  /ledger/verify    — ledger integrity check
 *   GET  /health           — liveness probe
 *   GET  /                 — serves UI (public/index.html)
 *   GET  /ui/*             — static assets
 *
 * CORS: allows claude.ai and localhost (for userscript)
 *
 * WebSocket transport via nano-ws (zero external deps).
 * Clients receive: { type: 'drift'|'regime'|'alert'|'state', ...payload }
 * On connect: immediate { type: 'state', ...kernelState } snapshot.
 */

const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const kernel = require('./kernel');
const { WebSocketServer } = require('./nano-ws');

const PORT        = process.env.BDA_PORT   || 7821;
const LEDGER_PATH = process.env.BDA_LEDGER || path.join(process.cwd(), 'bda.ledger');

const ALLOWED_ORIGINS = [
  'https://claude.ai',
  'http://localhost',
  'http://127.0.0.1',
  null,
];

// ── Init kernel ───────────────────────────────────────────────────────────────

kernel.init({ ledgerPath: LEDGER_PATH });

// ── HTTP server ───────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  setCORS(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204); return res.end();
  }

  const url = req.url.split('?')[0];

  // ── POST /observe ──────────────────────────────────────────────────────────
  if (req.method === 'POST' && url === '/observe') {
    try {
      const body = await readBody(req);
      const { role, text, ts } = body;

      if (!role || !text) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          error: 'role and text are required',
          received: { role: role ?? null, textLength: text?.length ?? 0 },
        }));
      }

      const event = kernel.observe({ role, text, ts });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, event }));
    } catch (err) {
      console.error(`[server] POST /observe error: ${err.message}`);
      console.error(err.stack);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message, stack: err.stack }));
    }
    return;
  }

  // ── GET /state ─────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(kernel.state()));
  }

  // ── GET /ledger ────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/ledger') {
    const l = kernel.getLedger();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ entries: l.all(), summary: l.summary() }));
  }

  // ── GET /ledger/verify ─────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/ledger/verify') {
    const result = kernel.getLedger().verify();
    res.writeHead(result.ok ? 200 : 409, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }

  // ── GET /health ────────────────────────────────────────────────────────────
  if (req.method === 'GET' && url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok:         true,
      uptime:     process.uptime(),
      state:      kernel.state(),
      wsClients:  wss.clients.size,
    }));
  }

  // ── GET / or /ui/* → static ────────────────────────────────────────────────
  if (req.method === 'GET') {
    const publicDir = path.join(__dirname, '..', 'public');
    const filePath  = url === '/' ? path.join(publicDir, 'index.html')
                                  : path.join(publicDir, url.replace(/^\//, ''));
    return serveStatic(res, filePath);
  }

  res.writeHead(404); res.end('not found');
});

// ── WebSocket server (/ws) ────────────────────────────────────────────────────

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (ws, req) => {
  const clientId = require('crypto').randomBytes(4).toString('hex');
  console.log(`[server] WS client connected: ${clientId} (total: ${wss.clients.size})`);

  // Immediate state snapshot — same contract as the old SSE 'state' event.
  try {
    ws.send(JSON.stringify({ type: 'state', ...kernel.state() }));
  } catch (e) {
    console.error(`[server] WS initial state send failed: ${e.message}`);
  }

  ws.on('close', () => {
    console.log(`[server] WS client disconnected: ${clientId} (remaining: ${wss.clients.size})`);
  });

  ws.on('error', (err) => {
    console.error(`[server] WS client ${clientId} error: ${err.message}`);
  });
});

// ── Wire kernel events → WS broadcast ────────────────────────────────────────

['drift', 'regime', 'alert'].forEach(evt => {
  kernel.on(evt, data => {
    _cliLog(evt, data);
    _broadcast({ type: evt, ...data });
  });
});

// ── CLI event display ─────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  dim:    '\x1b[2m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
};

const EVT_COLOR = {
  drift:  C.cyan,
  regime: C.yellow,
  alert:  C.red,
};

function _cliLog(type, data) {
  const color = EVT_COLOR[type] || C.white;
  const ts    = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const role  = data.role ? `${C.dim}[${data.role}]${C.reset}` : '';

  if (type === 'drift') {
    const p      = data.pendulum || {};
    const regime = p.regime  ? `${C.bold}${p.regime}${C.reset}` : '?';
    const sigma  = p.sigma   != null ? `σ=${p.sigma.toFixed(3)}` : '';
    const delta  = p.delta   != null ? `δ=${p.delta.toFixed(3)}` : '';
    const gaps   = data.gaps?.length ? `${C.yellow}gaps:${data.gaps.length}${C.reset}` : '';
    const seq    = data.seq  != null ? `${C.dim}#${data.seq}${C.reset}` : '';
    console.log(
      `${C.dim}${ts}${C.reset} ${color}DRIFT${C.reset} ${role} ${regime} ${sigma} ${delta} ${gaps} ${seq}`
        .replace(/\s{2,}/g, ' ').trimEnd()
    );

    // Print gap labels inline if any
    if (data.gaps?.length) {
      for (const g of data.gaps) {
        console.log(
          `${C.dim}         └ ${g.type} · ${g.label} · ${g.score.toFixed(2)}${C.reset}`
        );
      }
    }

  } else if (type === 'regime') {
    const arrow = `${data.from} ${C.bold}→${C.reset} ${C.bold}${data.to}${C.reset}`;
    const sigma = data.sigma != null ? `σ=${data.sigma.toFixed(3)}` : '';
    console.log(
      `${C.dim}${ts}${C.reset} ${color}REGIME${C.reset} ${role} ${arrow} ${sigma}`
        .replace(/\s{2,}/g, ' ').trimEnd()
    );

  } else if (type === 'alert') {
    console.log(`${C.dim}${ts}${C.reset} ${color}${C.bold}ALERT${C.reset}  ${role}`);
    for (const g of (data.gaps || [])) {
      console.log(
        `${C.dim}         └ ${C.red}${g.type} · ${g.label} · ${g.score.toFixed(2)}${C.reset}`
      );
    }
  }
}

function _broadcast(payload) {
  const str = JSON.stringify(payload);
  const dead = [];
  for (const ws of wss.clients) {
    try {
      ws.send(str);
    } catch (err) {
      console.error(`[server] WS broadcast failed, dropping client: ${err.message}`);
      dead.push(ws);
    }
  }
  for (const ws of dead) wss.clients.delete(ws);
}

// ── CORS helper ───────────────────────────────────────────────────────────────

function setCORS(req, res) {
  const origin  = req.headers.origin || null;
  const allowed = ALLOWED_ORIGINS.includes(origin) ||
    (origin && (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')));
  res.setHeader('Access-Control-Allow-Origin',      allowed ? (origin || '*') : 'https://claude.ai');
  res.setHeader('Access-Control-Allow-Methods',     'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

// ── Body parser ───────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end',  () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ── Static file server ────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
};

function serveStatic(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext  = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  } catch (_) {
    res.writeHead(404); res.end('not found');
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[bda] server running on http://localhost:${PORT}`);
  console.log(`[bda] ledger: ${LEDGER_PATH}`);
  console.log(`[bda] ws:     ws://localhost:${PORT}/ws`);
  console.log(`[bda] ui:     http://localhost:${PORT}/`);
});

process.on('SIGINT', () => {
  console.log('\n[bda] shutting down');
  wss.close();
  httpServer.close();
  process.exit(0);
});
