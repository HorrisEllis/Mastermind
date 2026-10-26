#!/usr/bin/env node
/**
 * ledger CLI — v1.0.0
 * @author James Brooks
 *
 * Commands:
 *   ledger record  --project <p> --desc <d> [--domain <d>] [--tags a,b]
 *   ledger close   --id <uuid> --status rejected|abandoned [--reason <r>]
 *   ledger promote --id <uuid> --proof-file <f> [--version <v>] [--desc <d>]
 *   ledger commit  --project <p> --type <t> --desc <d> --proof-file <f> [--version <v>]
 *   ledger list    [--project <p>] [--status <s>] [--domain <d>]
 *   ledger history [--project <p>] [--domain <d>]
 *   ledger metrics [--project <p>]
 *   ledger replay  [--project <p>]
 *   repl
 *
 * State: .ledger-state.json in cwd (§2.2 — storage device is truth)
 * Nothing silently fails (§1.2). Nothing logged unless explicit (§1.9).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve }                                  from 'path';
import { createInterface }                          from 'readline';

import {
  createLedger, IDEA_STATUS, UPGRADE_TYPE, VERSION,
} from '../src/index.js';

// ── State ─────────────────────────────────────────────────────────────────────

const STATE_FILE = '.ledger-state.json';

function loadState() {
  if (!existsSync(STATE_FILE)) return { ideas: {}, upgrades: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch (e) { die(`State file corrupted: ${e.message}. Delete ${STATE_FILE} to reset.`); }
}

function saveState(ideas, upgrades) {
  try { writeFileSync(STATE_FILE, JSON.stringify({ ideas, upgrades }, null, 2)); }
  catch (e) { die(`Failed to write state: ${e.message}`); }
}

// ── Output ────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const FORMAT = getFlag('--format') || 'pretty';
const QUIET  = args.includes('--quiet');

function out(s) { process.stdout.write(s + '\n'); }
function die(s) { process.stderr.write(`[ledger] ERROR: ${s}\n`); process.exit(1); }

function getFlag(f) {
  const i = args.indexOf(f); return i === -1 ? null : args[i + 1] || null;
}
function requireFlag(f, label) {
  const v = getFlag(f); if (!v) die(`Missing required flag: ${f} <${label}>`); return v;
}

// ── Reconstruct in-memory ledger from state ───────────────────────────────────

function buildLedger(state) {
  const ledger = createLedger();

  // Replay ideas
  for (const idea of Object.values(state.ideas)) {
    // Re-insert with preserved ID by directly writing to internal map
    ledger.idea._ideas.set(idea.id, { ...idea });
  }

  // Replay upgrades into upgrade ledger via internal commit
  for (const entry of Object.values(state.upgrades)) {
    ledger.upgrade._commit({
      ...entry,
      proof: entry.proof,
    });
  }

  return ledger;
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdRecord() {
  const state   = loadState();
  const project = getFlag('--project');
  const desc    = requireFlag('--desc', 'description');
  const domain  = getFlag('--domain');
  const tags    = (getFlag('--tags') || '').split(',').filter(Boolean);
  const hyp     = getFlag('--hypothesis');

  const ledger  = buildLedger(state);
  const idea    = ledger.idea.record({ description: desc, domain, tags, hypothesis: hyp, project });

  state.ideas[idea.id] = idea;
  saveState(state.ideas, state.upgrades);

  if (FORMAT === 'json') { out(JSON.stringify(idea, null, 2)); return; }
  out(`  Recorded  ${idea.id.slice(0, 8)}  ${desc.slice(0, 60)}`);
  if (domain) out(`  domain=${domain}`);
  if (tags.length) out(`  tags=[${tags.join(', ')}]`);
}

function cmdClose() {
  const state  = loadState();
  const id     = requireFlag('--id', 'uuid-or-prefix');
  const status = requireFlag('--status', 'rejected|abandoned');
  const reason = getFlag('--reason');

  if (![IDEA_STATUS.REJECTED, IDEA_STATUS.ABANDONED].includes(status)) {
    die(`Invalid status: '${status}'. Use: rejected | abandoned`);
  }

  const fullId = Object.keys(state.ideas).find(k => k.startsWith(id));
  if (!fullId) die(`Idea not found: ${id}`);

  const idea = state.ideas[fullId];
  if (idea.status !== IDEA_STATUS.UNRESOLVED) die(`Idea ${fullId.slice(0, 8)} is already ${idea.status}`);

  idea.status      = status;
  idea.failureMode = reason || null;
  idea.updatedTs   = Date.now();
  state.ideas[fullId] = idea;
  saveState(state.ideas, state.upgrades);

  if (FORMAT === 'json') { out(JSON.stringify(idea, null, 2)); return; }
  out(`  Closed  ${fullId.slice(0, 8)}  status=${status}${reason ? `  reason="${reason}"` : ''}`);
}

function cmdPromote() {
  const state     = loadState();
  const id        = requireFlag('--id', 'uuid-or-prefix');
  const proofFile = requireFlag('--proof-file', 'path');
  const version   = getFlag('--version');
  const desc      = getFlag('--desc') || 'Promoted from idea';
  const type      = getFlag('--type') || UPGRADE_TYPE.PASSING_TEST;

  const fullId = Object.keys(state.ideas).find(k => k.startsWith(id));
  if (!fullId) die(`Idea not found: ${id}`);

  const idea = state.ideas[fullId];
  if (idea.status !== IDEA_STATUS.UNRESOLVED) die(`Idea ${fullId.slice(0, 8)} is already ${idea.status}`);

  const upgradeId = _uuid4();
  const upgrade = {
    id:          upgradeId,
    ledgerType:  'upgrade',
    entryType:   type,
    description: desc,
    proof:       { testFile: proofFile },
    version:     version || null,
    ideaId:      fullId,
    domain:      idea.domain,
    project:     idea.project,
    tags:        [...(idea.tags || [])],
    meta:        {},
    ts:          Date.now(),
  };

  idea.status    = IDEA_STATUS.PROMOTED;
  idea.updatedTs = Date.now();
  state.ideas[fullId]       = idea;
  state.upgrades[upgradeId] = upgrade;
  saveState(state.ideas, state.upgrades);

  if (FORMAT === 'json') { out(JSON.stringify({ idea, upgrade }, null, 2)); return; }
  out(`  Promoted  idea=${fullId.slice(0, 8)}  upgrade=${upgradeId.slice(0, 8)}`);
  if (version) out(`  version=${version}`);
}

function cmdCommit() {
  const state     = loadState();
  const project   = getFlag('--project');
  const type      = getFlag('--type') || UPGRADE_TYPE.PASSING_TEST;
  const desc      = requireFlag('--desc', 'description');
  const proofFile = requireFlag('--proof-file', 'path');
  const version   = getFlag('--version');
  const domain    = getFlag('--domain');
  const tags      = (getFlag('--tags') || '').split(',').filter(Boolean);

  if (!Object.values(UPGRADE_TYPE).includes(type)) {
    die(`Unknown type: '${type}'. Valid: ${Object.values(UPGRADE_TYPE).join(', ')}`);
  }

  const upgradeId = _uuid4();
  const upgrade = {
    id:          upgradeId,
    ledgerType:  'upgrade',
    entryType:   type,
    description: desc,
    proof:       { testFile: proofFile },
    version:     version || null,
    ideaId:      null,
    domain:      domain || null,
    project:     project || null,
    tags,
    meta:        {},
    ts:          Date.now(),
  };

  state.upgrades[upgradeId] = upgrade;
  saveState(state.ideas, state.upgrades);

  if (FORMAT === 'json') { out(JSON.stringify(upgrade, null, 2)); return; }
  out(`  Committed  ${upgradeId.slice(0, 8)}  type=${type}`);
  if (version) out(`  version=${version}`);
}

function cmdList() {
  const state   = loadState();
  const project = getFlag('--project');
  const status  = getFlag('--status');
  const domain  = getFlag('--domain');

  let ideas = Object.values(state.ideas);
  if (project) ideas = ideas.filter(i => i.project === project);
  if (status)  ideas = ideas.filter(i => i.status  === status);
  if (domain)  ideas = ideas.filter(i => i.domain  === domain);

  if (FORMAT === 'json') { out(JSON.stringify(ideas, null, 2)); return; }
  out(`\n── Ideas (${ideas.length}) ──`);
  if (ideas.length === 0) { out('  (none)'); return; }
  for (const idea of ideas) {
    const mark = idea.status === IDEA_STATUS.PROMOTED ? '✓' : idea.status === IDEA_STATUS.REJECTED ? '✗' : idea.status === IDEA_STATUS.ABANDONED ? '~' : '·';
    out(`  ${mark} ${idea.id.slice(0, 8)}  [${idea.status.padEnd(10)}]  ${idea.description.slice(0, 60)}`);
    if (idea.failureMode) out(`         ↳ ${idea.failureMode}`);
  }
}

function cmdHistory() {
  const state   = loadState();
  const project = getFlag('--project');
  const domain  = getFlag('--domain');

  let upgrades = Object.values(state.upgrades).sort((a, b) => a.ts - b.ts);
  if (project) upgrades = upgrades.filter(u => u.project === project);
  if (domain)  upgrades = upgrades.filter(u => u.domain  === domain);

  if (FORMAT === 'json') { out(JSON.stringify(upgrades, null, 2)); return; }
  out(`\n── Upgrade History (${upgrades.length}) ──`);
  if (upgrades.length === 0) { out('  (none)'); return; }
  for (const u of upgrades) {
    const ver = u.version ? `v${u.version}` : '';
    const src = u.ideaId  ? `← idea:${u.ideaId.slice(0, 8)}` : '';
    out(`  ${u.id.slice(0, 8)}  ${ver.padEnd(8)}  [${u.entryType.padEnd(20)}]  ${u.description.slice(0, 50)}  ${src}`);
  }
}

function cmdMetrics() {
  const state   = loadState();
  const project = getFlag('--project');
  let   ideas   = Object.values(state.ideas);
  if (project) ideas = ideas.filter(i => i.project === project);

  const total     = ideas.length;
  const promoted  = ideas.filter(i => i.status === IDEA_STATUS.PROMOTED).length;
  const rejected  = ideas.filter(i => i.status === IDEA_STATUS.REJECTED).length;
  const abandoned = ideas.filter(i => i.status === IDEA_STATUS.ABANDONED).length;
  const pending   = ideas.filter(i => i.status === IDEA_STATUS.UNRESOLVED).length;
  const rate      = total > 0 ? (promoted / total).toFixed(4) : '0.0000';
  const bottleneck= pending > 5;

  const metrics = { total, promoted, rejected, abandoned, pending, conversionRate: parseFloat(rate), bottleneck };

  if (FORMAT === 'json') { out(JSON.stringify(metrics, null, 2)); return; }
  out(`\n── Flow Metrics${project ? ` (${project})` : ''} ──`);
  out(`  Total:          ${total}`);
  out(`  Promoted:       ${promoted}`);
  out(`  Rejected:       ${rejected}`);
  out(`  Abandoned:      ${abandoned}`);
  out(`  Pending:        ${pending}`);
  out(`  Conversion:     ${rate}`);
  out(`  Bottleneck:     ${bottleneck ? '⚠ YES' : 'no'}`);
}

function cmdReplay() {
  const state   = loadState();
  const project = getFlag('--project');
  let upgrades  = Object.values(state.upgrades).sort((a, b) => a.ts - b.ts);
  if (project) upgrades = upgrades.filter(u => u.project === project);

  if (FORMAT === 'json') { out(JSON.stringify(upgrades, null, 2)); return; }
  out(`\n── Upgrade Ledger Replay (${upgrades.length} entries) ──`);
  for (const u of upgrades) {
    out(`  [${new Date(u.ts).toISOString()}]  ${u.id.slice(0, 8)}  ${u.entryType}  ${u.description.slice(0, 50)}`);
  }
}

function cmdRepl() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const l  = createLedger({ project: 'repl' });

  console.log(`\nledger repl v${VERSION}`);
  console.log('  createLedger() available as `l`. Commands: .help .exit');
  console.log('  Or type any JS expression.\n');

  const prompt = () => rl.question('ledger> ', line => {
    const input = line.trim();
    if (!input) { prompt(); return; }
    try {
      if (input === '.exit' || input === '.quit') { console.log('bye'); rl.close(); return; }
      if (input === '.help') {
        console.log('  .record  — l.record({ description: "..." })');
        console.log('  .list    — l.idea.unresolved');
        console.log('  .metrics — l.metrics()');
        console.log('  .replay  — l.replay()');
      } else if (input === '.record') {
        const a = l.record({ description: `repl-idea-${Date.now()}` });
        console.log(`  Recorded ${a.id.slice(0, 8)}`);
      } else if (input === '.list') {
        for (const i of l.idea.unresolved) console.log(`  ${i.id.slice(0, 8)}  ${i.description}`);
      } else if (input === '.metrics') {
        console.log(' ', JSON.stringify(l.metrics(), null, 2));
      } else if (input === '.replay') {
        console.log(' ', JSON.stringify(l.replay(), null, 2));
      } else {
        const fn = new Function('l', 'IDEA_STATUS', 'UPGRADE_TYPE', `"use strict"; return (${input})`);
        const r  = fn(l, IDEA_STATUS, UPGRADE_TYPE);
        if (r !== undefined) console.log(' ', JSON.stringify(r, null, 2));
      }
    } catch (e) { console.error(`  Error: ${e.message}`); }
    prompt();
  });
}

// ── UUID helper ───────────────────────────────────────────────────────────────

function _uuid4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

function showHelp() {
  out(`ledger v${VERSION} — dual ledger for any project`);
  out('');
  out('Usage: ledger <command> [flags]');
  out('');
  out('Commands:');
  out('  record   --desc <d> [--project <p>] [--domain <d>] [--tags a,b] [--hypothesis <h>]');
  out('  close    --id <uuid> --status rejected|abandoned [--reason <r>]');
  out('  promote  --id <uuid> --proof-file <f> [--version <v>] [--desc <d>] [--type <t>]');
  out('  commit   --desc <d> --proof-file <f> [--project <p>] [--type <t>] [--version <v>]');
  out('  list     [--project <p>] [--status <s>] [--domain <d>]');
  out('  history  [--project <p>] [--domain <d>]');
  out('  metrics  [--project <p>]');
  out('  replay   [--project <p>]');
  out('  repl');
  out('');
  out('Global flags: --format pretty|json  --quiet');
}

const cmd = args.find(a => !a.startsWith('--'));

const routes = {
  record:  cmdRecord,
  close:   cmdClose,
  promote: cmdPromote,
  commit:  cmdCommit,
  list:    cmdList,
  history: cmdHistory,
  metrics: cmdMetrics,
  replay:  cmdReplay,
  repl:    cmdRepl,
};

if (!cmd || cmd === '--help' || cmd === 'help') {
  showHelp();
} else if (routes[cmd]) {
  try { routes[cmd](); }
  catch (e) {
    process.stderr.write(`[ledger] ${e.message}\n`);
    process.exit(1);
  }
} else {
  process.stderr.write(`[ledger] Unknown command: ${cmd}\n`);
  showHelp();
  process.exit(1);
}
