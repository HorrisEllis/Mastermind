#!/usr/bin/env node
/**
 * rheon-cli — command line peer to rheon-server
 *
 * Pattern: rheon <noun> <verb> [args] [flags]
 * §4.1 CLI is a peer — same schema as UI
 * §1.2 Nothing silently fails — exit 1 on user error, exit 2 on system error
 *
 * All operations go through the server API.
 * RHEON_SERVER defaults to http://localhost:7900
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const SERVER = process.env.RHEON_SERVER || 'http://localhost:7900';
const VERSION = '0.1.0';

// ── HTTP helpers ──────────────────────────────────────────────────

async function api(method, route, body) {
  const url = `${SERVER}${route}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    die(2, `Cannot reach rheon-server at ${SERVER}\n  ${err.message}\n  Is it running? rheon-server start`);
  }

  const json = await res.json();

  if (!json.ok) {
    const { code, message } = json.error || {};
    die(1, `${code || 'ERROR'}: ${message || 'unknown error'}`);
  }

  return json.data;
}

const GET    = (route)          => api('GET',    route);
const POST   = (route, body)    => api('POST',   route, body);
const PUT    = (route, body)    => api('PUT',    route, body);

// ── Output helpers ────────────────────────────────────────────────

const isJson = process.argv.includes('--json');

function out(data) {
  if (isJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(data);
  }
}

function table(rows, cols) {
  if (isJson) { console.log(JSON.stringify(rows, null, 2)); return; }
  if (!rows.length) { console.log('(none)'); return; }
  const widths = cols.map(c => Math.max(c.label.length, ...rows.map(r => String(r[c.key] ?? '').length)));
  const header = cols.map((c, i) => c.label.padEnd(widths[i])).join('  ');
  const divider = widths.map(w => '─'.repeat(w)).join('  ');
  console.log(header);
  console.log(divider);
  for (const row of rows) {
    console.log(cols.map((c, i) => String(row[c.key] ?? '').padEnd(widths[i])).join('  '));
  }
}

function die(code, msg) {
  console.error(`\x1b[31mrheon: ${msg}\x1b[0m`);
  process.exit(code);
}

function ts(ms) {
  if (!ms) return '—';
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
}

// ── Arg parser ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args   = [];
  const flags  = {};
  let i = 0;
  while (i < argv.length) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i += 2; }
      else                                { flags[key] = true;  i++;   }
    } else {
      args.push(a);
      i++;
    }
  }
  return { args, flags };
}

// ── Commands ──────────────────────────────────────────────────────

const commands = {

  // ── project ────────────────────────────────────────────────────

  async 'project new'({ args, flags }) {
    const name = args[0];
    if (!name) die(1, 'Usage: rheon project new <name> [--remote <url>]');
    const project = await POST('/api/projects', { name, remote: flags.remote || null });
    out(`✓ Created project '${project.name}' at ${project.path}`);
    if (project.remote) out(`  Remote: ${project.remote}`);
  },

  async 'project list'() {
    const projects = await GET('/api/projects');
    table(projects.map(p => ({
      name:        p.name,
      lastEdited:  ts(p.lastEditedTs),
      lastSeam:    p.lastSeam ? `${p.lastSeam.name} (${ts(p.lastSeam.ts)})` : '—',
      remote:      p.remote || '—',
    })), [
      { key: 'name',       label: 'NAME'       },
      { key: 'lastEdited', label: 'LAST EDITED' },
      { key: 'lastSeam',   label: 'LAST SEAM'   },
      { key: 'remote',     label: 'REMOTE'      },
    ]);
  },

  async 'project status'({ args }) {
    const name = args[0];
    if (!name) die(1, 'Usage: rheon project status <name>');
    const result = await GET(`/api/projects/${name}/git/status`);
    out(result.output || '(clean)');
  },

  async 'project push'({ args }) {
    const name = args[0];
    if (!name) die(1, 'Usage: rheon project push <name>');
    const result = await POST(`/api/projects/${name}/git/push`, {});
    out(result.ok ? `✓ Pushed '${name}'` : `✗ Push failed: ${result.error}`);
  },

  async 'project pull'({ args }) {
    const name = args[0];
    if (!name) die(1, 'Usage: rheon project pull <name>');
    const result = await POST(`/api/projects/${name}/git/pull`, {});
    out(result.ok ? `✓ Pulled '${name}'\n${result.output}` : `✗ Pull failed: ${result.error}`);
  },

  // ── spec ───────────────────────────────────────────────────────

  async 'spec new'({ args, flags }) {
    const name = args[0];
    if (!name) die(1, 'Usage: rheon spec new <name> [--project <name>]');
    const content = { name, status: 'draft', createdTs: Date.now(), projectId: flags.project || null };
    const result  = await POST('/api/specs', { name, namespace: 'specs', content });
    out(`✓ Spec '${name}' created  hash=${result.hash.slice(0, 8)}`);
  },

  async 'spec list'({ flags }) {
    const specs = await GET('/api/specs/specs');
    table(specs.map(s => ({
      name:   s.name,
      ts:     ts(s.ts),
      hash:   s.hash.slice(0, 8),
    })), [
      { key: 'name', label: 'NAME'    },
      { key: 'ts',   label: 'UPDATED' },
      { key: 'hash', label: 'HASH'    },
    ]);
  },

  async 'spec open'({ args }) {
    const name = args[0];
    if (!name) die(1, 'Usage: rheon spec open <name>');
    const result = await GET(`/api/specs/specs/${name}`);
    out(JSON.stringify(result.content, null, 2));
  },

  // ── idea ───────────────────────────────────────────────────────

  async 'idea add'({ args, flags }) {
    const text = args.join(' ');
    if (!text) die(1, 'Usage: rheon idea add "<text>" [--project <name>] [--tags tag1,tag2]');
    const tags    = flags.tags ? flags.tags.split(',').filter(Boolean) : [];
    const idea    = await POST('/api/ideas', { text, projectId: flags.project || null, tags });
    out(`✓ Idea added  id=${idea.id}  ${idea.ts ? ts(idea.ts) : ''}`);
  },

  async 'idea list'({ flags }) {
    const params = new URLSearchParams();
    if (flags.project) params.set('projectId', flags.project);
    if (flags.tag)     params.set('tags', flags.tag);
    if (flags.limit)   params.set('limit', flags.limit);
    const ideas = await GET(`/api/ideas?${params}`);
    table(ideas.map(i => ({
      id:      i.id,
      text:    i.text.slice(0, 60),
      project: i.projectId || '—',
      tags:    i.tags.join(', ') || '—',
      ts:      ts(i.ts),
    })), [
      { key: 'id',      label: 'ID'      },
      { key: 'text',    label: 'TEXT'    },
      { key: 'project', label: 'PROJECT' },
      { key: 'tags',    label: 'TAGS'    },
      { key: 'ts',      label: 'ADDED'   },
    ]);
  },

  async 'idea link'({ args, flags }) {
    const [fromId, toId] = args;
    if (!fromId || !toId || !flags.type) {
      die(1, 'Usage: rheon idea link <fromId> <toId> --type <related|refines|contradicts|implements|spawns>');
    }
    const edge = await POST('/api/ideas/link', { fromId, toId, type: flags.type });
    out(`✓ Linked  ${fromId} --[${edge.type}]--> ${toId}  id=${edge.id}`);
  },

  async 'idea query'({ args, flags }) {
    const q = args.join(' ');
    if (!q) die(1, 'Usage: rheon idea query "<text>" [--project <name>]');
    const params = new URLSearchParams({ q });
    if (flags.project) params.set('projectId', flags.project);
    const ideas = await GET(`/api/ideas/search?${params}`);
    if (!ideas.length) { out('No matching ideas.'); return; }
    table(ideas.map(i => ({
      id:      i.id,
      text:    i.text.slice(0, 70),
      project: i.projectId || '—',
    })), [
      { key: 'id',      label: 'ID'      },
      { key: 'text',    label: 'TEXT'    },
      { key: 'project', label: 'PROJECT' },
    ]);
  },

  // ── system ─────────────────────────────────────────────────────

  async 'status'() {
    const s = await GET('/api/status');
    out([
      `rheon v${s.version}  port=${s.port}  projects=${s.projectCount}`,
      `data=${s.dataRoot}`,
    ].join('\n'));
  },

  async 'ledger tail'({ flags }) {
    const n       = flags.n || 20;
    const entries = await GET(`/api/ledger?n=${n}`);
    table(entries.map(e => ({
      eventTs:  e.eventTs,
      type:     e.type,
      source:   e.source,
      outcome:  e.outcome,
      ts:       ts(e.ts),
    })), [
      { key: 'eventTs', label: '#'       },
      { key: 'ts',      label: 'TIME'    },
      { key: 'type',    label: 'TYPE'    },
      { key: 'source',  label: 'SOURCE'  },
      { key: 'outcome', label: 'OUTCOME' },
    ]);
  },

  async 'sync'() {
    const projects = await GET('/api/projects');
    const withRemote = projects.filter(p => p.remote);
    if (!withRemote.length) { out('No projects with remotes configured.'); return; }
    for (const p of withRemote) {
      process.stdout.write(`  push ${p.name}... `);
      const result = await POST(`/api/projects/${p.name}/git/push`, {});
      console.log(result.ok ? '✓' : `✗ ${result.error}`);
    }
  },
};

// ── Dispatch ──────────────────────────────────────────────────────

const HELP = `
rheon v${VERSION} — spec + project + idea CLI

USAGE:
  rheon <noun> <verb> [args] [flags]

COMMANDS:
  project new <name> [--remote <url>]
  project list
  project status <name>
  project push <name>
  project pull <name>

  spec new <name> [--project <name>]
  spec list
  spec open <name>

  idea add "<text>" [--project <name>] [--tags tag1,tag2]
  idea list [--project <name>] [--tag <tag>] [--limit <n>]
  idea link <fromId> <toId> --type <related|refines|contradicts|implements|spawns>
  idea query "<text>" [--project <name>]

  status
  ledger tail [--n <N>]
  sync

FLAGS:
  --json   Output as JSON
  --help   Show this help
`.trim();

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help')) { console.log(HELP); return; }

  const { args, flags } = parseArgs(argv);

  // Try 2-word command first (e.g. 'project new'), then 1-word (e.g. 'status')
  const cmd2 = `${args[0]} ${args[1]}`;
  const cmd1 = args[0];

  const rest2 = { args: args.slice(2), flags };
  const rest1 = { args: args.slice(1), flags };

  if (commands[cmd2]) {
    await commands[cmd2](rest2);
  } else if (commands[cmd1]) {
    await commands[cmd1](rest1);
  } else {
    die(1, `Unknown command: ${argv.join(' ')}\n\nRun 'rheon --help' for usage.`);
  }
}

main().catch(err => die(2, err.message));
