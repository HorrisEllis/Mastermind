# ledger v1.0.0
*James Brooks*

Dual ledger — Upgrade (truth) + Idea (cognition) — with a hard validation gate between them.

Zero dependencies. Works in any project: NEXUS, SENTINEL, ALK, Mastermind, anything.

---

## What it is

Two ledgers, structurally separate:

**UpgradeLedger** — authoritative. Verified state changes: passing tests, proven diffs, measurable results. Append-only after commit. Replay from it and you reconstruct everything.

**IdeaLedger** — speculative. Hypotheses, proposals, observations. Allowed to be wrong. Never affects runtime. Ideas become upgrades only through an explicit gate — skip the gate and it throws.

---

## Install

```bash
# Drop src/index.js into any project — no install needed.
# Or run the CLI directly:
node cli/ledger.js --help
```

---

## API

### Paired (primary entry point)

```js
import { createLedger, IDEA_STATUS, UPGRADE_TYPE } from './src/index.js';

const ledger = createLedger({ project: 'NEXUS' });

// Record an idea
const idea = ledger.record({
  description: 'Connect CFR to the Bridge for live system data',
  hypothesis:  'Will unlock real-time constraint rendering',
  domain:      'nexus',
  tags:        ['cfr', 'bridge'],
});

// Hostile review kills it
ledger.close(idea.id, IDEA_STATUS.REJECTED, 'CFR not stable enough — wait for phase 6');

// Or: it survives — build it — promote with proof
const { upgrade } = ledger.promote(idea.id, {
  type:        UPGRADE_TYPE.PASSING_TEST,
  description: 'CFR connected to Bridge, 56fps at 30k nodes',
  proof:       { testFile: 'test/cfr-bridge.test.js', metric: { fps: 56, nodes: 30000 } },
  version:     '6.1.0',
});

// Direct upgrade (no idea origin)
ledger.commit({
  type:        UPGRADE_TYPE.PHASE_COMPLETE,
  description: 'Phase 6 complete',
  proof:       { testFile: 'test/phase-6.test.js' },
  version:     '6.0.0',
});

// Replay the truth history
ledger.replay(); // → all upgrade entries in commit order

// Flow metrics
ledger.metrics(); // → { total, promoted, rejected, pending, conversionRate, bottleneckSignal }
```

### Standalone

```js
import { createUpgradeLedger, createIdeaLedger, promoteIdea } from './src/index.js';

const idea    = createIdeaLedger({ project: 'SENTINEL' });
const upgrade = createUpgradeLedger({ project: 'SENTINEL' });

const a = idea.record({ description: 'SEC-019 XSS vector', domain: 'security' });
promoteIdea(idea, upgrade, a.id, {
  type:  'security_fix',
  description: 'XSS closed, WAF rule deployed',
  proof: { testFile: 'test/sec-019.test.js' },
});
```

### Observer API

Wire ledger events to any bus. One call.

```js
// NEXUS — wire to kernel event bus
ledger.on('idea:recorded',    ({ idea })    => kernel.ingest('ledger:idea:recorded', idea));
ledger.on('upgrade:committed',({ upgrade }) => kernel.ingest('ledger:upgrade:committed', upgrade));
ledger.on('idea:promoted',    ({ idea, upgrade }) => kernel.ingest('ledger:idea:promoted', { idea, upgrade }));

// SENTINEL — wire to SSE stream
ledger.on('upgrade:committed', ({ upgrade }) => sse.send(upgrade));

// ALK — wire to BroadcastChannel
ledger.on('idea:promoted', d => channel.postMessage(d));
```

Events: `idea:recorded` · `idea:closed` · `idea:promoted` · `upgrade:committed` · `bottleneck`

---

## Proof types

| Field | Example |
|-------|---------|
| `testFile` | `'test/unit/compress.test.js'` |
| `diffLink` | `'github.com/x/y/commit/abc'` |
| `metric` | `{ before: 3.2, after: 9.1 }` |
| `screenshot` | `'screens/phase-7-passing.png'` |
| `logFile` | `'logs/playwright-run.log'` |

At least one required. No proof = gate throws (L-4).

---

## Invariants

| | |
|-|-|
| L-1 | Observational and authoritative events never mixed in the same ledger |
| L-2 | Mixing ledger types (idea into upgrade, upgrade into idea) is a hard throw |
| L-3 | Idea entries have no enforcement surface. Cannot affect runtime |
| L-4 | Cognition gate — an idea becomes an upgrade only via explicit validation |

---

## CLI

```bash
# Record an idea
ledger record --project NEXUS --desc "Connect CFR to Bridge" --domain nexus

# Close (rejected or abandoned)
ledger close --id <uuid> --status rejected --reason "Not ready"

# Promote with proof
ledger promote --id <uuid> --proof-file test/cfr.test.js --version 6.1.0

# Direct upgrade commit
ledger commit --desc "Phase 6 complete" --proof-file test/phase-6.test.js --type phase_complete --version 6.0.0

# List ideas
ledger list --project NEXUS --status unresolved

# Upgrade history
ledger history --project NEXUS

# Flow metrics
ledger metrics --project NEXUS

# Replay truth ledger
ledger replay

# Interactive REPL
ledger repl
```

State persists in `.ledger-state.json`.

---

## Tests

```bash
node --experimental-vm-modules test/ledger.test.js
```

---

## Changelog

### v1.0.0
- Dual ledger: UpgradeLedger + IdeaLedger
- L-1 through L-4 invariants enforced
- Cognition gate (`promoteIdea`) — only valid promotion path
- Observer API — zero coupling, wire to any bus
- `createLedger()` paired entry point
- Flow metrics + bottleneck signal (§7.7)
- CLI: record, close, promote, commit, list, history, metrics, replay, repl
- Zero external dependencies
