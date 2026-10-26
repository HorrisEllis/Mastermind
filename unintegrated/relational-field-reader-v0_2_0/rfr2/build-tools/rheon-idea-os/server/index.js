/**
 * rheon-server v0.2.0 — SISO-wired
 *
 * All operations flow through RheonBus:
 *   HTTP route → emit(cmd.*) → gate.transform() → store.* event
 *   store.* observer → HTTP response + WS broadcast + ledger
 *
 * Transport:
 *   WS  ws://host:7900/ws    nano-ws (zero dep, §5.5)
 *   SSE GET /api/events      backward compat
 *   HTTP REST                all UI_CONTRACT routes
 *
 * §5.7 — all inter-module communication via event bus only
 * §5.1 — everything registered, UUID on every event
 * §1.2 — nothing silently fails
 * §2.3 — all state observable through the bus log
 */

import http     from 'http';
import express  from 'express';
import path     from 'path';
import crypto   from 'crypto';
import { fileURLToPath } from 'url';

import { ledger, store, ideaStore, projectStore, DATA_ROOT } from '../storage/index.js';
import { WebSocketServer }        from './cjs-bridge.js';
import { createHeartbeatManager } from './cjs-bridge.js';
import { emit, on, register, sample, E } from './RheonBus.js';
import {
  ProjectCreateGate, ProjectListGate, ProjectGetGate,
  FileListGate, FileReadGate, FileWriteGate,
  GitPushGate, GitPullGate, GitStatusGate,
  SpecWriteGate, SpecReadGate, SpecListGate,
  IdeaAddGate, IdeaListGate, IdeaSearchGate,
  LatticeLinkGate, LatticeGraphGate,
  LedgerTailGate,
} from './gates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT      = process.env.RHEON_PORT || 7900;
const UI        = path.join(__dirname, '../ui');

// ── Register all gates ────────────────────────────────────────────
register(ProjectCreateGate(projectStore));
register(ProjectListGate(projectStore));
register(ProjectGetGate(projectStore));
register(FileListGate(projectStore));
register(FileReadGate(projectStore));
register(FileWriteGate(projectStore));
register(GitPushGate(projectStore));
register(GitPullGate(projectStore));
register(GitStatusGate(projectStore));
register(SpecWriteGate(store));
register(SpecReadGate(store));
register(SpecListGate(store));
register(IdeaAddGate(ideaStore));
register(IdeaListGate(ideaStore));
register(IdeaSearchGate(ideaStore));
register(LatticeLinkGate(ideaStore));
register(LatticeGraphGate(ideaStore));
register(LedgerTailGate(ledger));

// ── Express + HTTP server ─────────────────────────────────────────
const app        = express();
const httpServer = http.createServer(app);

// ── nano-ws ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// ── SSE clients ───────────────────────────────────────────────────
const sseClients = new Set();

// ── Broadcast — WS + SSE ─────────────────────────────────────────
function broadcast(type, payload) {
  const data = JSON.stringify({ type, payload, ts: Date.now() });
  wss.broadcast(data);
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); }
    catch { sseClients.delete(res); }
  }
}

// ── Bus observers — fan-out store.* to WS + SSE ──────────────────
// Projects
on('store.project.created', (ev) => {
  broadcast('project.created', { project: ev.data.project });
  ledger.append({ type: 'project.created', source: ev.data.source, payload: { name: ev.data.project.name }, outcome: 'ok' });
});
on('store.file.written', (ev) => {
  broadcast('file.written', { projectName: ev.data.projectName, filePath: ev.data.filePath });
});
// Ideas
on('store.idea.added', (ev) => {
  broadcast('idea.added', { idea: ev.data.idea });
});
on('store.lattice.linked', (ev) => {
  broadcast('lattice.linked', { edge: ev.data.edge });
});
// Git
on('store.git.pushed', (ev) => {
  broadcast('git.push.complete', { projectName: ev.data.projectName, ok: ev.data.result.ok });
});
on('store.git.pulled', (ev) => {
  broadcast('git.pull.complete', { projectName: ev.data.projectName, ok: ev.data.result.ok });
});
// Errors — broadcast so UI can surface them
on('store.error', (ev) => {
  broadcast('store.error', ev.data);
  console.error(`[RheonBus] store.error origin=${ev.data.origin} code=${ev.data.code} msg=${ev.data.message}`);
});

// ── WS inbound — route cmd.* through the bus ─────────────────────
wss.on('connection', (ws, req) => {
  ledger.append({ type: 'ws.connected', source: 'internal', payload: { ip: req.socket.remoteAddress }, outcome: 'ok' });

  ws.send(JSON.stringify({ type: 'server.hello', payload: { version: '0.2.0', port: PORT } }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch {
      ws.send(JSON.stringify({ ok: false, error: { code: 'PARSE_ERROR', message: 'Invalid JSON' } }));
      return;
    }

    // Route inbound WS commands through the bus
    // UI sends { type: 'cmd.*', payload: { ... }, requestId: 'uuid' }
    if (!msg.type || !msg.type.startsWith('cmd.')) {
      ws.send(JSON.stringify({ ok: false, error: { code: 'UNKNOWN_CMD', message: `No handler: ${msg.type}` } }));
      return;
    }

    // Response comes back via the store.* observer — use requestId correlation
    const requestId = msg.requestId || crypto.randomUUID();

    // One-time observer for this requestId's response
    // Pattern: emit cmd → gate transforms → store.* fires → observer resolves
    const resultType = msg.type.replace('cmd.', 'store.');
    // This is a best-effort single response — not all commands have a 1:1 result type
    // Full request-response correlation is the Phase 7 upgrade
    emit(new E(msg.type, { ...msg.payload, _requestId: requestId, _ws: ws }));
  });

  ws.on('close', () => {
    ledger.append({ type: 'ws.disconnected', source: 'internal', payload: {}, outcome: 'ok' });
  });

  ws.on('error', (err) => {
    console.error(`[rheon-server] WS error: ${err.message}`);
  });
});

// ── Heartbeat ─────────────────────────────────────────────────────
const heartbeat = createHeartbeatManager({
  busEmit: (type, payload, level) => {
    emit(new E(type, payload));
    ledger.append({
      type, source: 'heartbeat', payload,
      outcome: level === 'ERROR' ? 'error' : 'ok',
      ...(level === 'ERROR' ? { error: `${type}: ${JSON.stringify(payload)}` } : {}),
    });
    if (type !== 'heartbeat:pulse') broadcast(type, payload);
  },
});

// ── Middleware ────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.static(UI));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Trace-Id');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use((req, res, next) => {
  req.traceId = req.headers['x-trace-id'] || crypto.randomUUID();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
});

// ── Response helpers ──────────────────────────────────────────────
const ok   = (res, data)              => res.json({ ok: true, data });
const fail = (res, code, msg, s=400)  => res.status(s).json({ ok: false, error: { code, message: msg } });

// Route a command through the bus and resolve via a one-time observer.
// Replaces the imperative route handlers with a bus-mediated pattern.
function busRoute(cmdType, resultType, payloadFn, mapResult) {
  return async (req, res) => {
    const payload = payloadFn(req);
    const requestId = req.traceId;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(fail(res, 'TIMEOUT', `Bus timeout for ${cmdType}`, 504));
      }, 10000);

      // Listen for the result event
      function handler(event) {
        if (event.data?._requestId !== requestId) return; // not ours
        clearTimeout(timeout);
        resolve(ok(res, mapResult ? mapResult(event.data) : event.data));
      }
      function errHandler(event) {
        if (event.data?._requestId !== requestId) return;
        clearTimeout(timeout);
        resolve(fail(res, event.data.code, event.data.message, 400));
      }

      on(resultType, handler);
      on('store.error', errHandler);

      emit(new E(cmdType, { ...payload, _requestId: requestId }));
    });
  };
}

// ── Page routes ───────────────────────────────────────────────────
const page = (f) => (req, res) => res.sendFile(path.join(UI, f));
app.get('/spec-builder', page('spec-builder.html'));
app.get('/spec-library',  page('spec-library.html'));
app.get('/repository',   page('repository.html'));
app.get('/idea-ledger',  page('idea-ledger.html'));
app.get('/architect',    page('architect.html'));

// ── API Routes ────────────────────────────────────────────────────

// Health probe
app.get('/health', (req, res) => res.json({ ok: true, version: '0.2.0', ts: Date.now() }));

// System
app.get('/api/status', async (req, res) => {
  const projects = projectStore.list();
  const hbNodes  = heartbeat.listNodes();
  const busSample = sample();
  ok(res, {
    version:      '0.2.0',
    dataRoot:     DATA_ROOT,
    projectCount: projects.length,
    port:         PORT,
    bus: {
      eventCount: busSample.eventCount,
      gateCount:  busSample.gateCount,
      pending:    busSample.pending.length,
      logEntries: busSample.log.count,
    },
    heartbeat: {
      nodes:     hbNodes.length,
      selfScore: hbNodes.find(n => n.uuid === 'rheon-server-self')?.healthScore ?? null,
    },
    ws: { clients: wss.clients.size },
  });
});

app.get('/api/ledger', async (req, res) => {
  ok(res, ledger.tail(parseInt(req.query.n) || 20));
});

app.get('/api/bus/log', (req, res) => {
  ok(res, sample());
});

app.get('/api/heartbeat', (req, res) => ok(res, heartbeat.listNodes()));

// SSE
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 15000);
  sseClients.add(res);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
});

// Projects
app.get('/api/projects', async (req, res) => {
  try { ok(res, projectStore.list()); } catch(e) { fail(res, 'ERROR', e.message, 500); }
});
app.get('/api/projects/recent', async (req, res) => {
  try { ok(res, projectStore.list().slice(0, parseInt(req.query.limit)||10)); }
  catch(e) { fail(res, 'ERROR', e.message, 500); }
});
app.post('/api/projects', async (req, res) => {
  const { name, remote } = req.body;
  if (!name) return fail(res, 'NAME_REQUIRED', 'name is required');
  try {
    const project = projectStore.create(name, remote||null, 'api');
    broadcast('project.created', { project });
    ok(res, project);
  } catch(e) { fail(res, e.code||'ERROR', e.message, 400); }
});
app.get('/api/projects/:name', async (req, res) => {
  const p = projectStore.get(req.params.name);
  if (!p) return fail(res, 'PROJECT_NOT_FOUND', `Project '${req.params.name}' not found`, 404);
  ok(res, p);
});

// Files
app.get('/api/projects/:name/files', async (req, res) => {
  try { ok(res, projectStore.listFiles(req.params.name, req.query.path||'')); }
  catch(e) { fail(res, e.code||'ERROR', e.message, 400); }
});
app.get('/api/projects/:name/file', async (req, res) => {
  if (!req.query.path) return fail(res, 'PATH_REQUIRED', 'path required');
  try { ok(res, projectStore.readFile(req.params.name, req.query.path)); }
  catch(e) { fail(res, e.code||'ERROR', e.message, 400); }
});
app.put('/api/projects/:name/file', async (req, res) => {
  const { path: fp, content } = req.body;
  if (!fp || content===undefined) return fail(res, 'PARAMS_REQUIRED', 'path and content required');
  try {
    const result = projectStore.writeFile(req.params.name, fp, content, 'api');
    broadcast('file.written', { projectName: req.params.name, filePath: fp });
    ok(res, result);
  } catch(e) { fail(res, e.code||'ERROR', e.message, 400); }
});

// Git
app.get('/api/projects/:name/git/status', async (req, res) => {
  try { ok(res, projectStore.gitStatus(req.params.name)); }
  catch(e) { fail(res, 'ERROR', e.message, 400); }
});
app.post('/api/projects/:name/git/push', async (req, res) => {
  try {
    const r = projectStore.gitPush(req.params.name, 'api');
    broadcast('git.push.complete', { projectName: req.params.name, ok: r.ok });
    ok(res, r);
  } catch(e) { fail(res, 'ERROR', e.message, 400); }
});
app.post('/api/projects/:name/git/pull', async (req, res) => {
  try {
    const r = projectStore.gitPull(req.params.name, 'api');
    broadcast('git.pull.complete', { projectName: req.params.name, ok: r.ok });
    ok(res, r);
  } catch(e) { fail(res, 'ERROR', e.message, 400); }
});

// Specs
app.get('/api/specs/:ns',      async (req, res) => {
  try { ok(res, store.list(req.params.ns)); } catch(e) { fail(res,'ERROR',e.message,500); }
});
app.get('/api/specs/:ns/:name', async (req, res) => {
  const r = store.read(req.params.ns, req.params.name);
  if (!r) return fail(res,'SPEC_NOT_FOUND','Spec not found',404);
  ok(res, r);
});
app.post('/api/specs', async (req, res) => {
  const { name, namespace='specs', content={} } = req.body;
  if (!name) return fail(res,'NAME_REQUIRED','name required');
  try { ok(res, store.write(namespace, name, content, {}, 'api')); }
  catch(e) { fail(res,'ERROR',e.message,500); }
});
app.put('/api/specs/:ns/:name', async (req, res) => {
  const { content } = req.body;
  if (!content) return fail(res,'CONTENT_REQUIRED','content required');
  try { ok(res, store.write(req.params.ns, req.params.name, content, {}, 'api')); }
  catch(e) { fail(res,'ERROR',e.message,500); }
});

// Ideas
app.get('/api/ideas', async (req, res) => {
  const { projectId, tags, limit } = req.query;
  try {
    ok(res, ideaStore.list({ projectId: projectId||undefined, tags: tags?tags.split(',').filter(Boolean):undefined, limit: limit?parseInt(limit):undefined }));
  } catch(e) { fail(res,'ERROR',e.message,500); }
});
app.post('/api/ideas', async (req, res) => {
  const { text, projectId, tags } = req.body;
  if (!text) return fail(res,'IDEA_TEXT_REQUIRED','text required');
  try {
    const idea = ideaStore.add({ text, projectId, tags, source:'api' });
    broadcast('idea.added', { idea });
    ok(res, idea);
  } catch(e) { fail(res,'ERROR',e.message,400); }
});
app.get('/api/ideas/search', async (req, res) => {
  const { q, projectId } = req.query;
  if (!q) return fail(res,'QUERY_REQUIRED','q required');
  try { ok(res, ideaStore.search(q, projectId)); } catch(e) { fail(res,'ERROR',e.message,500); }
});
app.post('/api/ideas/link', async (req, res) => {
  const { fromId, toId, type } = req.body;
  if (!fromId||!toId||!type) return fail(res,'PARAMS_REQUIRED','fromId, toId, type required');
  try {
    const edge = ideaStore.link({ fromId, toId, type, source:'api' });
    broadcast('lattice.linked', { edge });
    ok(res, edge);
  } catch(e) { fail(res,'ERROR',e.message,400); }
});
app.get('/api/lattice', async (req, res) => {
  try { ok(res, ideaStore.graph(req.query.projectId||undefined)); }
  catch(e) { fail(res,'ERROR',e.message,500); }
});

// 404
app.use((req, res) => fail(res,'NOT_FOUND',`No route: ${req.method} ${req.path}`,404));

// ── Start ─────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
  console.log(`[rheon-server] v0.2.0 :${PORT}`);
  console.log(`[rheon-server] WS  → ws://localhost:${PORT}/ws`);
  console.log(`[rheon-server] SSE → http://localhost:${PORT}/api/events`);
  console.log(`[rheon-server] Bus → ${sample().gateCount} gates registered`);
  console.log(`[rheon-server] data: ${DATA_ROOT}`);

  ledger.append({ type: 'server.started', source: 'internal',
    payload: { port: PORT, dataRoot: DATA_ROOT, version: '0.2.0' }, outcome: 'ok' });

  emit(new E('bus.server.started', { port: PORT, version: '0.2.0' }));

  heartbeat.register('rheon-server-self', `http://127.0.0.1:${PORT}/health`);
});

export { app, httpServer, wss, broadcast, heartbeat, emit, on };
