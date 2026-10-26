/**
 * SEAM: LATTICE_CONTRACT
 * version: 1.0.0
 * status: active
 * between: ['rheon-server', 'idea-lattice-store']
 * description: Graph queries across the associative idea lattice
 */

export const LATTICE_CONTRACT = {
  name:        'LATTICE_CONTRACT',
  version:     '1.0.0',
  status:      'active',
  between:     ['rheon-server', 'idea-lattice-store'],
  description: 'Graph queries across the associative idea lattice',

  contract: {
    commands: {
      'lattice.graph': {
        payload:    { projectId: 'string?' },
        returns:    '{ nodes: Idea[], edges: LatticeEdge[] }',
        errors:     [],
        idempotent: true,
        timeout_ms: 1000,
      },
      'lattice.link': {
        payload:    { fromId: 'string', toId: 'string', type: 'EdgeType' },
        returns:    'LatticeEdge',
        errors:     [
          { code: 'INVALID_EDGE_TYPE', message: 'Edge type not in allowed set' },
          { code: 'IDEA_NOT_FOUND',    message: 'fromId or toId not found' },
        ],
        idempotent: false,
        timeout_ms: 500,
      },
      'lattice.neighbours': {
        payload:    { ideaId: 'string' },
        returns:    'Idea[]',
        errors:     [{ code: 'IDEA_NOT_FOUND', message: 'Idea not found' }],
        idempotent: true,
        timeout_ms: 500,
      },
      'lattice.edges_for': {
        payload:    { ideaId: 'string' },
        returns:    'LatticeEdge[]',
        errors:     [],
        idempotent: true,
        timeout_ms: 500,
      },
    },

    events: {
      'lattice.linked': { payload: { edge: 'LatticeEdge' }, ordering: 'guaranteed' },
    },
  },

  isolation: {
    rules: [
      'Server cannot read lattice.jsonl directly — all access through IdeaStore methods',
      'Lattice is read-only to the runtime system — §7.2',
      'Edge creation always goes through IdeaStore.link() which validates both node IDs',
    ],
    verified_by: 'test',
  },

  metrics: {
    latency_p95_ms:     200,
    latency_p99_ms:     500,
    throughput_per_sec: 50,
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
