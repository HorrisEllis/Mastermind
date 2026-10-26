/**
 * SEAM: STORAGE_CONTRACT
 * version: 1.0.0
 * status: active
 * between: ['rheon-server', 'storage-layer']
 * description: All read/write operations between the server and persistence layer
 *
 * This seam IS the acceptance criterion for the storage layer batch.
 * All four acceptance fields must be true before the batch is complete.
 */

export const STORAGE_CONTRACT = {
  name:        'STORAGE_CONTRACT',
  version:     '1.0.0',
  status:      'active',
  between:     ['rheon-server', 'storage-layer'],
  description: 'All read/write operations between the server and the persistence layer',

  contract: {
    commands: {

      // Projects
      'project.create': {
        payload:    { name: 'string', remote: 'string|null' },
        returns:    'Project',
        errors:     [{ code: 'PROJECT_EXISTS', message: 'Project already exists' }],
        idempotent: false,
        timeout_ms: 5000,
      },
      'project.list': {
        payload:    {},
        returns:    'Project[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
      'project.get': {
        payload:    { name: 'string' },
        returns:    'Project|null',
        errors:     [],
        idempotent: true,
        timeout_ms: 200,
      },
      'project.update': {
        payload:    { name: 'string', patch: 'Partial<Project>' },
        returns:    'Project',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' }],
        idempotent: false,
        timeout_ms: 500,
      },

      // Files
      'file.list': {
        payload:    { projectName: 'string', subPath: 'string?' },
        returns:    'FileNode[]',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' }],
        idempotent: true,
        timeout_ms: 1000,
      },
      'file.read': {
        payload:    { projectName: 'string', filePath: 'string' },
        returns:    '{ content: string, size: number, modifiedTs: number }',
        errors:     [
          { code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' },
          { code: 'FILE_NOT_FOUND',    message: 'File does not exist' },
        ],
        idempotent: true,
        timeout_ms: 500,
      },
      'file.write': {
        payload:    { projectName: 'string', filePath: 'string', content: 'string' },
        returns:    '{ ok: boolean }',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' }],
        idempotent: false,
        timeout_ms: 2000,
      },

      // Git
      'git.status': {
        payload:    { projectName: 'string' },
        returns:    '{ ok: boolean, output: string }',
        errors:     [{ code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' }],
        idempotent: true,
        timeout_ms: 2000,
      },
      'git.push': {
        payload:    { projectName: 'string' },
        returns:    '{ ok: boolean, output: string, error: string? }',
        errors:     [
          { code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' },
          { code: 'NO_REMOTE',         message: 'No remote configured' },
          { code: 'PUSH_FAILED',       message: 'git push failed' },
        ],
        idempotent: false,
        timeout_ms: 30000,
      },
      'git.pull': {
        payload:    { projectName: 'string' },
        returns:    '{ ok: boolean, output: string, error: string? }',
        errors:     [
          { code: 'PROJECT_NOT_FOUND', message: 'Project does not exist' },
          { code: 'NO_REMOTE',         message: 'No remote configured' },
          { code: 'PULL_FAILED',       message: 'git pull failed' },
        ],
        idempotent: false,
        timeout_ms: 30000,
      },

      // Specs
      'spec.write': {
        payload:    { namespace: 'string', name: 'string', content: 'object', meta: 'object?' },
        returns:    '{ hash: string, ref: object }',
        errors:     [],
        idempotent: false,
        timeout_ms: 500,
      },
      'spec.read': {
        payload:    { namespace: 'string', name: 'string' },
        returns:    '{ ref: object, content: object }|null',
        errors:     [],
        idempotent: true,
        timeout_ms: 200,
      },
      'spec.list': {
        payload:    { namespace: 'string' },
        returns:    'object[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },

      // Ideas
      'idea.add': {
        payload:    { text: 'string', projectId: 'string?', tags: 'string[]?' },
        returns:    'Idea',
        errors:     [{ code: 'IDEA_TEXT_REQUIRED', message: 'Idea text is required' }],
        idempotent: false,
        timeout_ms: 500,
      },
      'idea.list': {
        payload:    { projectId: 'string?', tags: 'string[]?', limit: 'number?' },
        returns:    'Idea[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
      'idea.search': {
        payload:    { query: 'string', projectId: 'string?' },
        returns:    'Idea[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 1000,
      },
      'lattice.link': {
        payload:    { fromId: 'string', toId: 'string', type: 'EdgeType' },
        returns:    'LatticeEdge',
        errors:     [
          { code: 'INVALID_EDGE_TYPE', message: 'Edge type not in allowed set' },
          { code: 'IDEA_NOT_FOUND',    message: 'fromId or toId does not exist' },
        ],
        idempotent: false,
        timeout_ms: 500,
      },
      'lattice.graph': {
        payload:    { projectId: 'string?' },
        returns:    '{ nodes: Idea[], edges: LatticeEdge[] }',
        errors:     [],
        idempotent: true,
        timeout_ms: 1000,
      },

      // Ledger
      'ledger.tail': {
        payload:    { n: 'number?' },
        returns:    'LedgerEntry[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
    },

    events: {
      'project.created':      { payload: { project: 'Project' }, ordering: 'guaranteed' },
      'project.updated':      { payload: { name: 'string', ts: 'number' }, ordering: 'best-effort' },
      'file.written':         { payload: { projectName: 'string', filePath: 'string' }, ordering: 'guaranteed' },
      'idea.added':           { payload: { idea: 'Idea' }, ordering: 'guaranteed' },
      'lattice.linked':       { payload: { edge: 'LatticeEdge' }, ordering: 'guaranteed' },
    },
  },

  isolation: {
    rules: [
      'rheon-server cannot read the filesystem directly — all file access through ProjectStore',
      'rheon-server cannot write to JSONL files directly — all idea/ledger writes through IdeaStore/Ledger',
      'No shared mutable state between server request handlers and storage layer',
      'All writes produce a ledger entry before the command returns',
      'Errors do not propagate raw — caught, logged, returned as structured error response',
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
