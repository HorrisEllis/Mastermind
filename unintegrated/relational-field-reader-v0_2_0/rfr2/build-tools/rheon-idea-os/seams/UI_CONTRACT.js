/**
 * SEAM: UI_CONTRACT
 * version: 1.0.0
 * status: active
 * between: ['rheon-ui', 'rheon-server']
 * description: All operations the UI frontend can invoke on the server (REST + SSE)
 */

export const UI_CONTRACT = {
  name:        'UI_CONTRACT',
  version:     '1.0.0',
  status:      'active',
  between:     ['rheon-ui', 'rheon-server'],
  description: 'All operations the UI frontend can invoke on the server',

  contract: {
    commands: {

      // ── HOME ─────────────────────────────────────────────────
      'projects.list': {
        http:       'GET /api/projects',
        payload:    {},
        returns:    'Project[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 1000,
      },
      'projects.recent': {
        http:       'GET /api/projects/recent?limit=N',
        payload:    { limit: 'number?' },
        returns:    'Project[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },

      // ── SPEC BUILDER ─────────────────────────────────────────
      'spec.create': {
        http:       'POST /api/specs',
        payload:    { name: 'string', projectId: 'string?', content: 'object?' },
        returns:    '{ hash: string, ref: object }',
        errors:     [],
        idempotent: false,
        timeout_ms: 1000,
      },
      'spec.update': {
        http:       'PUT /api/specs/:namespace/:name',
        payload:    { namespace: 'string', name: 'string', content: 'object' },
        returns:    '{ hash: string, ref: object }',
        errors:     [{ code: 'SPEC_NOT_FOUND', message: 'Spec not found' }],
        idempotent: false,
        timeout_ms: 1000,
      },
      'spec.get': {
        http:       'GET /api/specs/:namespace/:name',
        payload:    { namespace: 'string', name: 'string' },
        returns:    '{ ref: object, content: object }|null',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
      'spec.list': {
        http:       'GET /api/specs/:namespace',
        payload:    { namespace: 'string' },
        returns:    'object[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },

      // ── REPOSITORY ───────────────────────────────────────────
      'repo.create': {
        http:       'POST /api/projects',
        payload:    { name: 'string', remote: 'string?' },
        returns:    'Project',
        errors:     [{ code: 'PROJECT_EXISTS', message: 'Project already exists' }],
        idempotent: false,
        timeout_ms: 5000,
      },
      'repo.files': {
        http:       'GET /api/projects/:name/files?path=',
        payload:    { name: 'string', path: 'string?' },
        returns:    'FileNode[]',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project not found' }],
        idempotent: true,
        timeout_ms: 1000,
      },
      'repo.file.read': {
        http:       'GET /api/projects/:name/file?path=',
        payload:    { name: 'string', path: 'string' },
        returns:    '{ content: string, size: number, modifiedTs: number }',
        errors:     [
          { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
          { code: 'FILE_NOT_FOUND',    message: 'File not found' },
        ],
        idempotent: true,
        timeout_ms: 500,
      },
      'repo.file.write': {
        http:       'PUT /api/projects/:name/file',
        payload:    { name: 'string', path: 'string', content: 'string' },
        returns:    '{ ok: boolean }',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project not found' }],
        idempotent: false,
        timeout_ms: 2000,
      },
      'repo.git.status': {
        http:       'GET /api/projects/:name/git/status',
        payload:    { name: 'string' },
        returns:    '{ ok: boolean, output: string }',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project not found' }],
        idempotent: true,
        timeout_ms: 2000,
      },
      'repo.git.push': {
        http:       'POST /api/projects/:name/git/push',
        payload:    { name: 'string' },
        returns:    '{ ok: boolean, output: string }',
        errors:     [
          { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
          { code: 'NO_REMOTE',         message: 'No remote configured' },
          { code: 'PUSH_FAILED',       message: 'git push failed' },
        ],
        idempotent: false,
        timeout_ms: 30000,
      },
      'repo.git.pull': {
        http:       'POST /api/projects/:name/git/pull',
        payload:    { name: 'string' },
        returns:    '{ ok: boolean, output: string }',
        errors:     [
          { code: 'PROJECT_NOT_FOUND', message: 'Project not found' },
          { code: 'NO_REMOTE',         message: 'No remote configured' },
          { code: 'PULL_FAILED',       message: 'git pull failed' },
        ],
        idempotent: false,
        timeout_ms: 30000,
      },

      // ── IDEA LEDGER ──────────────────────────────────────────
      'ideas.list': {
        http:       'GET /api/ideas?projectId=&tags=&limit=',
        payload:    { projectId: 'string?', tags: 'string?', limit: 'number?' },
        returns:    'Idea[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
      'ideas.add': {
        http:       'POST /api/ideas',
        payload:    { text: 'string', projectId: 'string?', tags: 'string[]?' },
        returns:    'Idea',
        errors:     [{ code: 'IDEA_TEXT_REQUIRED', message: 'Text is required' }],
        idempotent: false,
        timeout_ms: 500,
      },
      'ideas.search': {
        http:       'GET /api/ideas/search?q=&projectId=',
        payload:    { q: 'string', projectId: 'string?' },
        returns:    'Idea[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 1000,
      },
      'ideas.link': {
        http:       'POST /api/ideas/link',
        payload:    { fromId: 'string', toId: 'string', type: 'EdgeType' },
        returns:    'LatticeEdge',
        errors:     [
          { code: 'INVALID_EDGE_TYPE', message: 'Invalid edge type' },
          { code: 'IDEA_NOT_FOUND',    message: 'Idea not found' },
        ],
        idempotent: false,
        timeout_ms: 500,
      },
      'lattice.graph': {
        http:       'GET /api/lattice?projectId=',
        payload:    { projectId: 'string?' },
        returns:    '{ nodes: Idea[], edges: LatticeEdge[] }',
        errors:     [],
        idempotent: true,
        timeout_ms: 1000,
      },

      // ── SYSTEM ───────────────────────────────────────────────
      'ledger.tail': {
        http:       'GET /api/ledger?n=',
        payload:    { n: 'number?' },
        returns:    'LedgerEntry[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
      'system.status': {
        http:       'GET /api/status',
        payload:    {},
        returns:    '{ ok: boolean, version: string, dataRoot: string, projectCount: number }',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
    },

    events: {
      // Transport (dual):
      //   WS  ws://host:PORT/ws    — nano-ws, zero-dep (§5.5), bidirectional
      //   SSE GET /api/events      — backward compat, observe-only
      //
      // Envelope: { type: string, payload: object, ts: number }
      // WS-only:  { type: 'server.hello', payload: { version, port } }  — on connect
      //
      // All events below are broadcast on both transports.

      'server.hello':        { payload: { version: 'string', port: 'number' }, ordering: 'guaranteed',  transport: 'ws-only' },
      'project.created':     { payload: { project: 'Project' },                ordering: 'guaranteed'  },
      'project.updated':     { payload: { name: 'string', ts: 'number' },      ordering: 'best-effort' },
      'file.written':        { payload: { projectName: 'string', filePath: 'string' }, ordering: 'guaranteed' },
      'idea.added':          { payload: { idea: 'Idea' },                       ordering: 'guaranteed'  },
      'lattice.linked':      { payload: { edge: 'LatticeEdge' },                ordering: 'guaranteed'  },
      'git.push.complete':   { payload: { projectName: 'string', ok: 'boolean' }, ordering: 'best-effort' },
      'git.pull.complete':   { payload: { projectName: 'string', ok: 'boolean' }, ordering: 'best-effort' },
      'ledger.event':        { payload: { entry: 'LedgerEntry' },               ordering: 'best-effort' },
      'heartbeat:degraded':  { payload: { uuid: 'string', missedBeats: 'number' }, ordering: 'guaranteed' },
      'heartbeat:dead':      { payload: { uuid: 'string', missedBeats: 'number', reason: 'string' }, ordering: 'guaranteed' },
    },
  },

  isolation: {
    rules: [
      'UI cannot read the filesystem directly — all access through server API',
      'UI cannot execute git commands — all VCS through repo.git.* endpoints',
      'No credentials stored in UI layer — server owns auth',
      'All writes produce a ledger entry before returning to UI',
      'SSE stream is observe-only — UI cannot write through it',
      'WS inbound messages from UI are validated before routing — unknown types rejected loudly (§1.2)',
      'nano-ws is the only WS implementation — no ws package (§5.5)',
    ],
    verified_by: 'test',
  },

  metrics: {
    latency_p95_ms:     200,
    latency_p99_ms:     500,
    throughput_per_sec: 100,
    error_rate_pct:     0.5,
    availability_pct:   99.9,
  },

  traceability: {
    trace_id:     true,
    causal_chain: true,
    ledger:       true,
  },

  acceptance: {
    contract_tests:     false,
    isolation_verified: false,
    mock_generated:     false,
    metrics_verified:   false,
  },
};
