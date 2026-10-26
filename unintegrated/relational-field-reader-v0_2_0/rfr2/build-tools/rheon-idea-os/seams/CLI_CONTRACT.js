/**
 * SEAM: CLI_CONTRACT
 * version: 1.0.0
 * status: active
 * between: ['rheon-cli', 'rheon-server']
 * description: CLI commands map 1:1 to server API. CLI is a peer — §4.1.
 *
 * The CLI speaks the same schema as the UI.
 * Every UI_CONTRACT command is reachable via CLI.
 * CLI adds: direct SSH access, pipe-friendly output, scriptable flags.
 */

export const CLI_CONTRACT = {
  name:        'CLI_CONTRACT',
  version:     '1.0.0',
  status:      'active',
  between:     ['rheon-cli', 'rheon-server'],
  description: 'CLI commands are a peer to the UI — same schema, same server',

  contract: {
    // CLI commands are the same operations as UI_CONTRACT,
    // expressed as verb noun [flags] strings.
    // Full mapping defined here for traceability.

    commands: {
      // Projects
      'rheon project new <name> [--remote <url>]':   'POST /api/projects',
      'rheon project list':                           'GET  /api/projects',
      'rheon project open <name>':                    'GET  /api/projects/:name  (sets working context)',
      'rheon project push <name>':                    'POST /api/projects/:name/git/push',
      'rheon project pull <name>':                    'POST /api/projects/:name/git/pull',
      'rheon project status <name>':                  'GET  /api/projects/:name/git/status',

      // Spec
      'rheon spec new <name> [--project <name>]':     'POST /api/specs',
      'rheon spec list [--project <name>]':           'GET  /api/specs/specs',
      'rheon spec open <name>':                       'GET  /api/specs/specs/:name',
      'rheon spec publish <name>':                    'PUT  /api/specs/specs/:name  (status → published)',

      // Seam
      'rheon seam new <name> --between <A> <B>':     'POST /api/seams',
      'rheon seam list [--project <name>]':           'GET  /api/seams',
      'rheon seam verify <name>':                     'POST /api/seams/:name/verify',
      'rheon seam status':                            'GET  /api/seams/status',

      // Ideas
      'rheon idea add "<text>" [--project <name>] [--tags ...]': 'POST /api/ideas',
      'rheon idea list [--project <name>] [--tag ...]':          'GET  /api/ideas',
      'rheon idea link <fromId> <toId> --type <type>':           'POST /api/ideas/link',
      'rheon idea query "<text>" [--project <name>]':            'GET  /api/ideas/search',

      // System
      'rheon status':                                 'GET  /api/status',
      'rheon ledger tail [--n <N>]':                  'GET  /api/ledger',
      'rheon sync':                                   'POST /api/sync  (push all projects with remotes)',
    },
  },

  isolation: {
    rules: [
      'CLI does not read storage files directly — all operations through server API',
      'CLI output is always structured (JSON with --json flag, human-readable by default)',
      'CLI exit codes: 0 = ok, 1 = user error, 2 = system error',
      'SSH access to CLI uses the same server API — no separate SSH protocol',
    ],
    verified_by: 'test',
  },

  metrics: {
    latency_p95_ms:     500,
    latency_p99_ms:     2000,
    throughput_per_sec: 20,
    error_rate_pct:     1.0,
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
