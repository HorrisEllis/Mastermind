# NEXUS — Guardian Tool Injection System (GTIS)
**Spec:** §10.5  
**Layer:** Guardian  
**Module:** `guardian/tool-registry.js` · `guardian/tool-injector.js` · `guardian/tool-listener.js`  
**Boot phase:** PHASE 11 (alongside Siphon, Pulse, Watchman)  
**Mastevos ref:** §7.3 (Callto-executor), §10.1 (Guardian), §13.3 (Spec Builder §api_callto)  
**Date:** 2026-05-29  
**Status:** 🔴 BUILD

---

## WHAT THIS IS

The Guardian Tool Injection System gives every AI agent a structured vocabulary of commands it can execute by writing structured output. When Guardian dispatches a prompt to Claude or ChatGPT, it prepends a **Tool Book** — a compact, machine-parseable reference listing every available NEXUS command. The agent reads the Tool Book, decides which tools apply, and includes `NEXUS_TOOL:` blocks in its response. Guardian's content.js listener parses these blocks and dispatches them back to NEXUS as tool calls.

This closes the loop:  
**NEXUS → Guardian → Agent → structured output → Guardian parses → NEXUS executes → result stored**

---

## WHAT THIS IS NOT

- Not an external MCP server. No network calls beyond the Guardian↔NEXUS bridge already in place.
- Not a prompt template system. The Tool Book is injected, not part of the user's prompt.
- Not a replacement for RAID routing. Tools are agent-initiated commands, not agent alternatives.
- Not a vision system. Tools do not give agents access to the browser or filesystem directly.
- Not optional for Guardian agents. Every GUARDIAN_EXECUTE_INTENT payload carries a Tool Book.

---

## WHY THIS EXISTS

Currently, when NEXUS dispatches a prompt to Guardian-Claude, the agent produces text. That text is captured by MutationObserver, stored in cortex_memory, and made available downstream. But the agent has no way to **do** anything — it cannot query memory, check the gap list, read crystals, store a file, or trigger another agent call.

The Tool Book changes this. An agent that receives a prompt like "design the seam module" can:
- Query what crystals already exist on this topic (`NEXUS_TOOL: memory.search`)
- Check what open gaps exist (`NEXUS_TOOL: gap.list`)
- Store its output to a named artifact (`NEXUS_TOOL: artifact.write`)
- Request a parallel call to ChatGPT (`NEXUS_TOOL: callto.dispatch parallel`)
- Report a contradiction it found (`NEXUS_TOOL: gap.report`)

This makes Guardian agents first-class participants in the NEXUS workflow rather than isolated inference machines.

---

## CONSTITUTIONAL CONSTRAINTS

- **LAW I:** Tool execution follows LAW I agent order. If a tool triggers an agent call, RAID routes it. Guardian does not bypass RAID.
- **LAW II:** Every tool call is a JAA row. `tool_calls` table written before execution. Result written after. No tool executes without a JAA record.
- **LAW III:** `tool-injector.js` does not import `tool-listener.js` or vice versa. Communication via JAA only. `tool-registry.js` is the shared read-only constant — it is not a module, it is a data file.
- **LAW IV:** Every `tool_calls` row validated against `tool-call.schema.json` before insert.
- **LAW V:** Every tool in the registry has a CLI equivalent. `nexus tool list`, `nexus tool show <id>`, `nexus tool calls [--n]`. The Tool Book is CLI-browseable.
- **LAW VI:** Every tool execution failure: `toast.error` RED + `failures` insert. Every tool execution success: `toast.agent` PURPLE (silent if noisy — configurable per tool).

---

## SCHEMAS REQUIRED BEFORE BUILD

### `schemas/tool-call.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Tool Call",
  "type": "object",
  "required": ["uuid", "toolId", "calltoUuid", "agentId", "rawBlock", "parsedArgs", "status", "ts", "source"],
  "properties": {
    "uuid":        { "type": "string" },
    "toolId":      { "type": "string", "description": "Registered tool ID — e.g. 'memory.search'" },
    "calltoUuid":  { "type": "string", "description": "The agent_calls UUID that produced this tool call" },
    "agentId":     { "type": "string", "description": "guardian-claude | guardian-chatgpt | etc" },
    "rawBlock":    { "type": "string", "description": "The raw NEXUS_TOOL: block extracted from agent output" },
    "parsedArgs":  { "type": "object", "description": "Parsed arguments — tool-specific shape" },
    "status":      { "type": "string", "enum": ["pending", "executing", "complete", "failed", "rejected"] },
    "result":      { "type": ["object", "string", "null"] },
    "error":       { "type": ["string", "null"] },
    "executedAt":  { "type": ["integer", "null"] },
    "completedAt": { "type": ["integer", "null"] },
    "causedBy":    { "type": "string", "description": "event_log UUID of the GUARDIAN_EXECUTE_INTENT event" },
    "ts":          { "type": "integer" },
    "source":      { "type": "string" }
  }
}
```

### `schemas/tool-definition.schema.json`

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "NEXUS Tool Definition",
  "type": "object",
  "required": ["id", "name", "description", "syntax", "args", "example", "reads", "writes", "safe"],
  "properties": {
    "id":          { "type": "string", "description": "dot-namespaced: 'memory.search'" },
    "name":        { "type": "string" },
    "description": { "type": "string", "description": "One sentence. Plain English. Goes into the Tool Book." },
    "syntax":      { "type": "string", "description": "Exact syntax the agent must write" },
    "args":        {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type", "required"],
        "properties": {
          "name":        { "type": "string" },
          "type":        { "type": "string" },
          "required":    { "type": "boolean" },
          "description": { "type": "string" }
        }
      }
    },
    "example":     { "type": "string" },
    "reads":       { "type": "array", "items": { "type": "string" } },
    "writes":      { "type": "array", "items": { "type": "string" } },
    "safe":        { "type": "boolean", "description": "true = no side effects, can be called freely. false = writes data, requires deliberate invocation." },
    "toastOnSuccess": { "type": "string" },
    "toastOnFail":    { "type": "string" },
    "rateLimit":   { "type": ["integer", "null"], "description": "Max calls per agent response. null = unlimited." }
  }
}
```

---

## MODULE 1: TOOL REGISTRY — `guardian/tool-registry.js`

### What

A static, exported constant: the complete list of tools available to Guardian agents. Not a poll-loop. Not a service. A data file that is imported by `tool-injector.js` (to build the Tool Book) and `tool-listener.js` (to parse and validate incoming tool calls).

The registry is the **single source of truth** for what agents can do.

### The Tool Book — All Registered Tools

Every tool below is available to every Guardian agent unless the specific callto marks it as restricted via the `allowedTools` field in `GUARDIAN_EXECUTE_INTENT`.

#### MEMORY GROUP

```
memory.search
  Search cortex_memory and memory_index by keywords.
  NEXUS_TOOL: memory.search | query: <query text>
  → Returns: top 5 matching entries (content, tier, ts)

memory.crystal
  Find stable crystals matching a term.
  NEXUS_TOOL: memory.crystal | query: <term>
  → Returns: matching crystals (statement, confidence, state)

memory.store
  Store a fact, decision, or artifact to memory.
  NEXUS_TOOL: memory.store | content: <text> | tags: <comma,separated>
  → Returns: uuid of created memory_index row
  SAFE: false — writes data
```

#### GAP GROUP

```
gap.list
  List current open gaps, optionally filtered.
  NEXUS_TOOL: gap.list | severity: <high|medium|low|all>
  → Returns: open gaps (type, severity, path, body, age)

gap.show
  Get full detail on a specific gap.
  NEXUS_TOOL: gap.show | uuid: <gap-uuid>
  → Returns: full gap record + causal chain summary

gap.report
  Report a new gap discovered during analysis.
  NEXUS_TOOL: gap.report | type: <type> | body: <description> | severity: <high|medium|low>
  → Creates gap row in JAA, triggers healer
  SAFE: false — writes data
```

#### ARTIFACT GROUP

```
artifact.write
  Write a code file or document to the artifact store.
  NEXUS_TOOL: artifact.write | name: <filename.ext> | content: <full content>
  → Writes to guardian/dropzone_files/, creates artifacts JAA row
  SAFE: false — writes file + data

artifact.read
  Read an existing artifact by name or uuid.
  NEXUS_TOOL: artifact.read | name: <filename> | uuid: <optional>
  → Returns: file content (truncated to 4000 chars if large)

artifact.list
  List recent artifacts.
  NEXUS_TOOL: artifact.list | n: <count, default 10>
  → Returns: recent artifacts (name, type, size, ts)
```

#### CALLTO GROUP

```
callto.dispatch
  Dispatch a prompt to another Guardian agent.
  NEXUS_TOOL: callto.dispatch | agent: <guardian-claude|guardian-chatgpt> | prompt: <text>
  → Creates agent_calls row (pending), returns calltoUuid
  SAFE: false — triggers agent call (LAW I applies)
  RATE LIMIT: 3 per agent response (prevent runaway recursion)

callto.parallel
  Dispatch the same prompt to both Claude and ChatGPT simultaneously (Seam merges).
  NEXUS_TOOL: callto.parallel | prompt: <text>
  → Creates two agent_calls rows with shared causedByCallto
  SAFE: false — triggers two agent calls
  RATE LIMIT: 1 per agent response
```

#### SYSTEM GROUP

```
system.status
  Get current system health snapshot.
  NEXUS_TOOL: system.status
  → Returns: guardian connected, ollama health, open gap count, crystal count, last sigma

system.self
  Get the latest self-model snapshot.
  NEXUS_TOOL: system.self
  → Returns: creativityIndex, top intents, open questions, constraint patterns

system.intent
  Search the intent graph.
  NEXUS_TOOL: system.intent | query: <term>
  → Returns: matching intent nodes (text, callCount, successRate)
```

#### CRYSTAL GROUP

```
crystal.list
  List stable crystals, optionally filtered.
  NEXUS_TOOL: crystal.list | state: <stable|candidate|decaying|all> | n: <count>
  → Returns: matching crystals

crystal.show
  Full detail on a specific crystal.
  NEXUS_TOOL: crystal.show | uuid: <crystal-uuid>
  → Returns: full crystal record

crystal.contradict
  Report a contradiction found in an existing crystal.
  NEXUS_TOOL: crystal.contradict | uuid: <crystal-uuid> | evidence: <text>
  → Increments contradictionScore, creates bep.contradiction.detected event
  SAFE: false — modifies crystal state
```

#### SPEC GROUP

```
spec.show
  Retrieve a spec by name or uuid.
  NEXUS_TOOL: spec.show | name: <spec-name> | uuid: <optional>
  → Returns: spec sections, checklist status, module list

spec.section
  Read a specific spec section.
  NEXUS_TOOL: spec.section | uuid: <spec-uuid> | section: <section-id>
  → Returns: section content and checklist
```

### Tool Registry Export

```javascript
// guardian/tool-registry.js
'use strict';

// This file is a static data export.
// It is imported by tool-injector.js and tool-listener.js.
// It does NOT have an init(), poll loop, or JAA writes.
// LAW III: this is a constant, not a module.

const TOOLS = Object.freeze([
  {
    id: 'memory.search',
    name: 'Memory Search',
    description: 'Search cortex_memory and memory_index for relevant facts.',
    syntax: 'NEXUS_TOOL: memory.search | query: <text>',
    args: [{ name: 'query', type: 'string', required: true, description: 'Search query' }],
    example: 'NEXUS_TOOL: memory.search | query: bayesian posterior trust score',
    reads: ['cortex_memory', 'memory_index'],
    writes: [],
    safe: true,
    toastOnSuccess: null,   // silent — called frequently
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
  {
    id: 'memory.crystal',
    name: 'Crystal Search',
    description: 'Find established beliefs (stable crystals) matching a term.',
    syntax: 'NEXUS_TOOL: memory.crystal | query: <term>',
    args: [{ name: 'query', type: 'string', required: true, description: 'Search term' }],
    example: 'NEXUS_TOOL: memory.crystal | query: seam merge algorithm',
    reads: ['crystals'],
    writes: [],
    safe: true,
    toastOnSuccess: null,
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
  {
    id: 'memory.store',
    name: 'Memory Store',
    description: 'Store a fact, decision, or structured output to memory.',
    syntax: 'NEXUS_TOOL: memory.store | content: <text> | tags: <t1,t2>',
    args: [
      { name: 'content', type: 'string', required: true, description: 'Content to store' },
      { name: 'tags', type: 'string', required: false, description: 'Comma-separated tags' },
    ],
    example: 'NEXUS_TOOL: memory.store | content: The seam merge threshold should be 0.60 | tags: seam,threshold,design',
    reads: [],
    writes: ['memory_index'],
    safe: false,
    toastOnSuccess: 'toast.info',
    toastOnFail: 'toast.error',
    rateLimit: 10,
  },
  {
    id: 'gap.list',
    name: 'Gap List',
    description: 'List open system gaps, optionally filtered by severity.',
    syntax: 'NEXUS_TOOL: gap.list | severity: <high|medium|low|all>',
    args: [{ name: 'severity', type: 'string', required: false, description: 'Filter by severity' }],
    example: 'NEXUS_TOOL: gap.list | severity: high',
    reads: ['gaps'],
    writes: [],
    safe: true,
    toastOnSuccess: null,
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
  {
    id: 'gap.report',
    name: 'Gap Report',
    description: 'Report a new gap discovered during analysis.',
    syntax: 'NEXUS_TOOL: gap.report | type: <type> | body: <description> | severity: <high|medium|low>',
    args: [
      { name: 'type', type: 'string', required: true, description: 'Gap type identifier' },
      { name: 'body', type: 'string', required: true, description: 'Gap description' },
      { name: 'severity', type: 'string', required: true, description: 'high | medium | low' },
    ],
    example: 'NEXUS_TOOL: gap.report | type: missing_schema | body: crystal.schema.json not registered in AJV | severity: high',
    reads: [],
    writes: ['gaps', 'event_log'],
    safe: false,
    toastOnSuccess: 'toast.gap',
    toastOnFail: 'toast.error',
    rateLimit: 5,
  },
  {
    id: 'artifact.write',
    name: 'Artifact Write',
    description: 'Write code or content to a named file in the artifact store.',
    syntax: 'NEXUS_TOOL: artifact.write | name: <file.ext>\n<full content>\nNEXUS_TOOL_END',
    args: [
      { name: 'name', type: 'string', required: true, description: 'Filename with extension' },
      { name: 'content', type: 'string', required: true, description: 'Full file content (between block markers)' },
    ],
    example: 'NEXUS_TOOL: artifact.write | name: seam.js\n// seam module code here...\nNEXUS_TOOL_END',
    reads: [],
    writes: ['artifacts', 'event_log'],
    safe: false,
    toastOnSuccess: 'toast.success',
    toastOnFail: 'toast.error',
    rateLimit: 20,
  },
  {
    id: 'artifact.read',
    name: 'Artifact Read',
    description: 'Read an existing artifact by name or UUID.',
    syntax: 'NEXUS_TOOL: artifact.read | name: <filename>',
    args: [
      { name: 'name', type: 'string', required: false, description: 'Filename' },
      { name: 'uuid', type: 'string', required: false, description: 'Artifact UUID (alternative to name)' },
    ],
    example: 'NEXUS_TOOL: artifact.read | name: seam.js',
    reads: ['artifacts'],
    writes: [],
    safe: true,
    toastOnSuccess: null,
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
  {
    id: 'callto.dispatch',
    name: 'Callto Dispatch',
    description: 'Dispatch a prompt to another Guardian AI agent.',
    syntax: 'NEXUS_TOOL: callto.dispatch | agent: <guardian-claude|guardian-chatgpt> | prompt: <text>',
    args: [
      { name: 'agent', type: 'string', required: true, description: 'Target agent' },
      { name: 'prompt', type: 'string', required: true, description: 'Prompt to send' },
    ],
    example: 'NEXUS_TOOL: callto.dispatch | agent: guardian-chatgpt | prompt: Review this seam algorithm for correctness',
    reads: ['guardian_nodes', 'guardian_health'],
    writes: ['agent_calls', 'event_log'],
    safe: false,
    toastOnSuccess: 'toast.agent',
    toastOnFail: 'toast.error',
    rateLimit: 3,
  },
  {
    id: 'callto.parallel',
    name: 'Callto Parallel',
    description: 'Send the same prompt to Claude and ChatGPT simultaneously — Seam merges the responses.',
    syntax: 'NEXUS_TOOL: callto.parallel | prompt: <text>',
    args: [
      { name: 'prompt', type: 'string', required: true, description: 'Prompt to send to both' },
    ],
    example: 'NEXUS_TOOL: callto.parallel | prompt: What is the optimal agreement threshold for seam verification?',
    reads: ['guardian_nodes', 'guardian_health'],
    writes: ['agent_calls', 'event_log'],
    safe: false,
    toastOnSuccess: 'toast.agent',
    toastOnFail: 'toast.error',
    rateLimit: 1,
  },
  {
    id: 'system.status',
    name: 'System Status',
    description: 'Get a live system health snapshot.',
    syntax: 'NEXUS_TOOL: system.status',
    args: [],
    example: 'NEXUS_TOOL: system.status',
    reads: ['guardian_health', 'gaps', 'crystals', 'shape_samples'],
    writes: [],
    safe: true,
    toastOnSuccess: null,
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
  {
    id: 'system.self',
    name: 'Self Model',
    description: 'Retrieve the latest system self-model: creativity, constraints, open questions.',
    syntax: 'NEXUS_TOOL: system.self',
    args: [],
    example: 'NEXUS_TOOL: system.self',
    reads: ['self_model'],
    writes: [],
    safe: true,
    toastOnSuccess: null,
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
  {
    id: 'crystal.contradict',
    name: 'Crystal Contradict',
    description: 'Report a contradiction in an existing crystal belief.',
    syntax: 'NEXUS_TOOL: crystal.contradict | uuid: <crystal-uuid> | evidence: <text>',
    args: [
      { name: 'uuid', type: 'string', required: true, description: 'Crystal UUID to contradict' },
      { name: 'evidence', type: 'string', required: true, description: 'Evidence for the contradiction' },
    ],
    example: 'NEXUS_TOOL: crystal.contradict | uuid: abc-123 | evidence: The threshold is 0.65, not 0.60, based on seam data',
    reads: ['crystals'],
    writes: ['crystals', 'bep_patterns', 'event_log'],
    safe: false,
    toastOnSuccess: 'toast.warn',
    toastOnFail: 'toast.error',
    rateLimit: 5,
  },
  {
    id: 'spec.show',
    name: 'Spec Show',
    description: 'Retrieve a spec by name or UUID.',
    syntax: 'NEXUS_TOOL: spec.show | name: <spec-name>',
    args: [
      { name: 'name', type: 'string', required: false, description: 'Spec name' },
      { name: 'uuid', type: 'string', required: false, description: 'Spec UUID' },
    ],
    example: 'NEXUS_TOOL: spec.show | name: seam-module',
    reads: ['specs'],
    writes: [],
    safe: true,
    toastOnSuccess: null,
    toastOnFail: 'toast.error',
    rateLimit: null,
  },
]);

// Fast lookup by id
const TOOL_MAP = Object.freeze(
  TOOLS.reduce((acc, t) => { acc[t.id] = t; return acc; }, {})
);

module.exports = { TOOLS, TOOL_MAP };
```

---

## MODULE 2: TOOL INJECTOR — `guardian/tool-injector.js`

### What

Runs as part of the `GUARDIAN_EXECUTE_INTENT` flow. Before the prompt is dispatched to the AI tab, the injector builds a Tool Book string and prepends it to the system prompt. The Tool Book is compact — designed to use minimal tokens while giving the agent everything it needs.

### COBALT Declaration

```json
{
  "id": "guardian.tool-injector",
  "file": "guardian/tool-injector.js",
  "layer": "guardian",
  "title": "guardian.tool-injector",
  "description": "Prepends NEXUS Tool Book to every GUARDIAN_EXECUTE_INTENT prompt before dispatch. Reads tool registry, respects allowedTools filter, writes injection_records for audit.",
  "reads": ["agent_calls"],
  "writes": ["agent_calls", "toasts", "failures"],
  "polls": false,
  "bootPhase": 11,
  "gapContract": {
    "maxLatencyMs": 500,
    "onMiss": "gap.found type=behavior_gap severity=low"
  },
  "cli": [
    {
      "command": "nexus tool book [--agent guardian-claude] [--format compact|full]",
      "intent": "Print the Tool Book as it would be injected for a given agent",
      "example": "nexus tool book --agent guardian-claude --format full",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Tool Book Format

The Tool Book is injected as the first block of the system prompt, before any user-defined system content.

```
--- NEXUS TOOL BOOK v1 ---
You have access to NEXUS system tools. To call a tool, write a NEXUS_TOOL block in your response.
Rules:
  1. Tools are OPTIONAL. Only call a tool when it would genuinely improve the response.
  2. Safe tools (marked READ-ONLY) can be called freely. Write tools require deliberate intent.
  3. Rate limits are enforced server-side. Excess calls are silently dropped — not an error.
  4. Tool results are returned inline. You may use them before continuing your response.
  5. Never fabricate tool results. If a tool call fails, say so and continue without the result.
  6. For artifact.write, the content block ends with NEXUS_TOOL_END on its own line.

TOOLS:
[memory.search]  READ-ONLY  Search cortex_memory + memory_index
  Syntax:  NEXUS_TOOL: memory.search | query: <text>
  Example: NEXUS_TOOL: memory.search | query: seam merge algorithm

[memory.crystal]  READ-ONLY  Find established beliefs (stable crystals)
  Syntax:  NEXUS_TOOL: memory.crystal | query: <term>

[memory.store]  WRITES  Store a fact or decision to memory
  Syntax:  NEXUS_TOOL: memory.store | content: <text> | tags: <t1,t2>
  Limit:   10 per response

[gap.list]  READ-ONLY  List open system gaps
  Syntax:  NEXUS_TOOL: gap.list | severity: <high|medium|low|all>

[gap.report]  WRITES  Report a newly discovered gap
  Syntax:  NEXUS_TOOL: gap.report | type: <type> | body: <description> | severity: <high|medium|low>
  Limit:   5 per response

[artifact.write]  WRITES  Write code or content to the artifact store
  Syntax:  NEXUS_TOOL: artifact.write | name: <file.ext>
           <content — can be multiple lines>
           NEXUS_TOOL_END
  Limit:   20 per response

[artifact.read]  READ-ONLY  Read an existing artifact
  Syntax:  NEXUS_TOOL: artifact.read | name: <filename>

[callto.dispatch]  WRITES  Dispatch a prompt to another AI agent
  Syntax:  NEXUS_TOOL: callto.dispatch | agent: <guardian-claude|guardian-chatgpt> | prompt: <text>
  Limit:   3 per response

[callto.parallel]  WRITES  Send prompt to Claude + ChatGPT simultaneously (Seam merges)
  Syntax:  NEXUS_TOOL: callto.parallel | prompt: <text>
  Limit:   1 per response

[system.status]  READ-ONLY  Get live system health snapshot
  Syntax:  NEXUS_TOOL: system.status

[system.self]  READ-ONLY  Get system self-model (creativity, constraints, open questions)
  Syntax:  NEXUS_TOOL: system.self

[crystal.contradict]  WRITES  Report a contradiction in an existing crystal
  Syntax:  NEXUS_TOOL: crystal.contradict | uuid: <crystal-uuid> | evidence: <text>
  Limit:   5 per response

[spec.show]  READ-ONLY  Retrieve a spec by name
  Syntax:  NEXUS_TOOL: spec.show | name: <spec-name>

--- END TOOL BOOK ---
```

**Compact format** (used when `callto.tokenBudget < 2000`): Tool Book is reduced to syntax lines only, no examples, no descriptions. Saves ~600 tokens.

### How — Injection Point

Injection happens in `callto/index.js` at Step 2 (Build payload), before `GUARDIAN_EXECUTE_INTENT` is posted:

```javascript
// In callto/index.js — Step 2, after building base payload
const { buildToolBook } = require('../guardian/tool-injector');

const allowedTools = call.allowedTools ?? null;  // null = all tools
const compact      = (call.tokenBudget ?? 8000) < 2000;
const toolBook     = buildToolBook({ allowedTools, compact });

payload.systemPromptPrefix = toolBook;
// Guardian picks up systemPromptPrefix and prepends to system prompt before injection
```

### How — `buildToolBook(opts)`

```javascript
// guardian/tool-injector.js
'use strict';

const { TOOLS } = require('./tool-registry');

function buildToolBook({ allowedTools = null, compact = false } = {}) {
  const tools = allowedTools
    ? TOOLS.filter(t => allowedTools.includes(t.id))
    : TOOLS;

  const lines = ['--- NEXUS TOOL BOOK v1 ---'];

  if (!compact) {
    lines.push(
      'You have access to NEXUS system tools. Write NEXUS_TOOL blocks in your response to call them.',
      'Rules: (1) Only call when genuinely useful. (2) Read-only tools are free. Write tools require intent.',
      '(3) Rate limits are server-enforced — excess calls dropped silently.',
      '(4) Never fabricate tool results. (5) artifact.write content ends with NEXUS_TOOL_END.',
      ''
    );
  }

  lines.push('TOOLS:');
  for (const t of tools) {
    const safety = t.safe ? 'READ-ONLY' : 'WRITES';
    const limit  = t.rateLimit ? `  Limit: ${t.rateLimit}/response` : '';
    if (compact) {
      lines.push(`[${t.id}] ${safety}  ${t.syntax}${limit}`);
    } else {
      lines.push(`[${t.id}]  ${safety}  ${t.description}`);
      lines.push(`  Syntax:  ${t.syntax}`);
      if (t.example && t.example !== t.syntax) lines.push(`  Example: ${t.example}`);
      if (limit) lines.push(`  ${limit.trim()}`);
      lines.push('');
    }
  }

  lines.push('--- END TOOL BOOK ---');
  return lines.join('\n');
}

module.exports = { buildToolBook };
```

### `allowedTools` filter — where it comes from

The `agent_calls` row carries an optional `allowedTools` array. This is set by:

1. **CLI dispatch:** `nexus callto dispatch guardian-claude "prompt" --tools memory.search,gap.list`
2. **RAID routing:** RAID sets `allowedTools` based on intent type (e.g., a "review" intent → no `callto.dispatch` or `callto.parallel`, to prevent recursive agent spawning)
3. **Automation workflows:** Workflow steps can declare `allowedTools` for the callto step
4. **Default (null):** All tools available — used for unrestricted agent sessions

---

## MODULE 3: TOOL LISTENER — `guardian/tool-listener.js`

### What

The server-side parser and executor. After Guardian's MutationObserver captures a complete agent response, the listener scans the response text for `NEXUS_TOOL:` blocks, parses them, validates them against the registry, creates `tool_calls` JAA rows, executes each tool, and writes results back.

Results are optionally injected back into the conversation as a follow-up system message (configurable per session: `toolResultInjection: true|false`).

### COBALT Declaration

```json
{
  "id": "guardian.tool-listener",
  "file": "guardian/tool-listener.js",
  "layer": "guardian",
  "title": "guardian.tool-listener",
  "description": "Parses NEXUS_TOOL blocks from agent responses. Validates against tool registry. Creates tool_calls JAA rows. Executes each tool. Writes results. Optionally re-injects results into conversation.",
  "reads": ["agent_calls", "chat_completions"],
  "writes": ["tool_calls", "cortex_memory", "memory_index", "gaps", "agent_calls", "artifacts", "crystals", "bep_patterns", "event_log", "toasts", "failures"],
  "polls": true,
  "pollIntervalMs": 1500,
  "bootPhase": 11,
  "gapContract": {
    "maxLatencyMs": 10000,
    "onMiss": "gap.found type=stale_module severity=medium"
  },
  "cli": [
    {
      "command": "nexus tool calls [--n 20] [--agent <id>] [--status pending|complete|failed]",
      "intent": "List recent tool calls with status, tool id, agent, and result preview",
      "example": "nexus tool calls --n 10 --status complete",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "nexus tool show <uuid>",
      "intent": "Full detail of a tool call: raw block, parsed args, execution result, timing",
      "example": "nexus tool show abc-123",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "nexus tool list",
      "intent": "List all registered tools with id, safety level, and description",
      "example": "nexus tool list",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    },
    {
      "command": "nexus tool show-definition <id>",
      "intent": "Full tool definition: syntax, args, reads/writes, rate limit, examples",
      "example": "nexus tool show-definition memory.search",
      "toastOnSuccess": "toast.info",
      "toastOnFail": "toast.error"
    }
  ]
}
```

### How — Parse Phase

```javascript
const TOOL_BLOCK_RE = /NEXUS_TOOL:\s*([^\n|]+)\s*(?:\|([^\n]+))?\n?([\s\S]*?)(?=NEXUS_TOOL:|NEXUS_TOOL_END|$)/g;
const TOOL_END_RE   = /NEXUS_TOOL_END/g;

function parseToolBlocks(responseText) {
  const blocks = [];
  let match;

  while ((match = TOOL_BLOCK_RE.exec(responseText)) !== null) {
    const toolId  = match[1].trim();
    const argLine = match[2]?.trim() ?? '';
    const content = match[3]?.trim() ?? '';  // for artifact.write

    // Parse | key: value | key: value args
    const parsedArgs = {};
    for (const segment of argLine.split('|')) {
      const colonIdx = segment.indexOf(':');
      if (colonIdx === -1) continue;
      const key = segment.slice(0, colonIdx).trim();
      const val = segment.slice(colonIdx + 1).trim();
      if (key) parsedArgs[key] = val;
    }

    // artifact.write: content comes from body between block markers
    if (toolId === 'artifact.write' && content) {
      parsedArgs.content = content;
    }

    blocks.push({ toolId, parsedArgs, rawBlock: match[0] });
  }

  return blocks;
}
```

### How — Validate Phase

Before creating a `tool_calls` row:

1. Look up `TOOL_MAP[block.toolId]` — if not found: reject, write `failures`, toast.warn
2. Check rate limit: count `tool_calls` for this `calltoUuid` with same `toolId` — if over limit: reject silently (no error — §LAW VI rate limit drops are silent by design)
3. Validate required args present — if missing: reject with `toast.error` and gap.report
4. Check `allowedTools` list from `agent_calls.allowedTools` — if tool not allowed: reject with `toast.warn`

### How — Execute Phase

Tool execution is a simple switch/case over `toolId`. Each executor:
1. Reads from JAA (via `jaaDB` — all reads are synchronous)
2. Optionally writes to JAA
3. Returns a `result` object

```javascript
async function executeTool(toolId, parsedArgs, calltoUuid, causedBy) {
  switch (toolId) {

    case 'memory.search': {
      const query  = parsedArgs.query ?? '';
      const stems  = _tokenize(query);
      const cortex = jaaDB.query('cortex_memory',
        r => stems.some(s => (r.content ?? '').toLowerCase().includes(s)), 5);
      const index  = jaaDB.query('memory_index',
        r => r.tier !== 'forgotten' && stems.some(s => (r.content ?? '').toLowerCase().includes(s)), 5);
      return { cortex: cortex.slice(0, 3), index: index.slice(0, 3) };
    }

    case 'memory.crystal': {
      const query  = parsedArgs.query ?? '';
      const stems  = _tokenize(query);
      const matches = jaaDB.query('crystals',
        r => r.state === 'stable' && stems.some(s => (r.statement ?? '').toLowerCase().includes(s)), 5);
      return { crystals: matches.map(c => ({ uuid: c.uuid, statement: c.statement, confidence: c.confidence })) };
    }

    case 'memory.store': {
      const row = {
        uuid:    uid(), content: parsedArgs.content ?? '',
        tags:    (parsedArgs.tags ?? '').split(',').map(t => t.trim()).filter(Boolean),
        tier:    'index', source: 'tool-listener',
        causedBy, ts: Date.now(),
      };
      await jaaDB.insert('memory_index', row);
      return { uuid: row.uuid, stored: true };
    }

    case 'gap.list': {
      const sev = parsedArgs.severity;
      const gaps = jaaDB.query('gaps',
        r => r.status === 'open' && (!sev || sev === 'all' || r.severity === sev), 10);
      return { gaps: gaps.map(g => ({ uuid: g.uuid, type: g.type, severity: g.severity, body: g.body?.slice(0, 80) })) };
    }

    case 'gap.report': {
      const row = {
        uuid: uid(), type: parsedArgs.type ?? 'agent_reported',
        body: parsedArgs.body ?? '', severity: parsedArgs.severity ?? 'medium',
        path: `tool-listener/${calltoUuid}`, status: 'open',
        causedBy, source: 'guardian.tool-listener', createdAt: Date.now(), ts: Date.now(),
      };
      await jaaDB.insert('gaps', row);
      await jaaDB.insert('event_log', {
        uuid: uid(), type: 'gap.found',
        source: 'guardian.tool-listener',
        payload: { gapUuid: row.uuid, type: row.type, severity: row.severity },
        causedBy, ts: Date.now(),
      });
      _toast('toast.gap', `Agent reported gap: ${row.type} — ${row.body.slice(0, 60)}`, { causedBy: row.uuid });
      return { uuid: row.uuid, created: true };
    }

    case 'artifact.write': {
      const name = parsedArgs.name ?? `agent-output-${Date.now()}.txt`;
      const content = parsedArgs.content ?? '';
      const filePath = `guardian/dropzone_files/${name}`;
      // Write file via admin server endpoint (filesystem write is server-side)
      await _postToNexus('/api/artifact/write', { name, content, calltoUuid, causedBy });
      // JAA row
      const row = {
        uuid: uid(), name, file_path: filePath,
        type: _inferType(name), source: 'guardian.tool-listener',
        causedBy, calltoUuid, ts: Date.now(),
      };
      await jaaDB.insert('artifacts', row);
      _toast('toast.success', `Artifact written: ${name}`, { causedBy: row.uuid });
      return { uuid: row.uuid, name, path: filePath };
    }

    case 'artifact.read': {
      const name = parsedArgs.name;
      const uuid = parsedArgs.uuid;
      const row  = uuid
        ? await jaaDB.get('artifacts', uuid)
        : jaaDB.query('artifacts', r => r.name === name, 1)[0];
      if (!row) return { error: `Artifact not found: ${name ?? uuid}` };
      const content = await _getFromNexus(`/api/artifact/read?name=${encodeURIComponent(row.name)}`);
      return { uuid: row.uuid, name: row.name, content: (content ?? '').slice(0, 4000) };
    }

    case 'callto.dispatch': {
      const agent  = parsedArgs.agent ?? 'guardian-claude';
      const prompt = parsedArgs.prompt ?? '';
      const row = {
        uuid: uid(), routedTo: agent, prompt,
        intent: prompt.slice(0, 100),
        status: 'pending', source: 'guardian.tool-listener',
        causedBy, calltoUuid, ts: Date.now(),
        tags: ['tool-initiated'],
      };
      await jaaDB.insert('agent_calls', row);
      await jaaDB.insert('event_log', {
        uuid: uid(), type: 'GUARDIAN_EXECUTE_INTENT',
        source: 'guardian.tool-listener',
        payload: { callUuid: row.uuid, provider: agent.replace('guardian-', ''), prompt },
        causedBy: row.uuid, ts: Date.now(),
      });
      _toast('toast.agent', `Tool: callto.dispatch → ${agent}`, { causedBy: row.uuid });
      return { calltoUuid: row.uuid, dispatched: true };
    }

    case 'callto.parallel': {
      const prompt      = parsedArgs.prompt ?? '';
      const sharedUuid  = uid();
      for (const agent of ['guardian-claude', 'guardian-chatgpt']) {
        const row = {
          uuid: uid(), routedTo: agent, prompt,
          causedByCallto: sharedUuid, status: 'pending',
          source: 'guardian.tool-listener', causedBy, ts: Date.now(),
          tags: ['tool-initiated', 'parallel'],
        };
        await jaaDB.insert('agent_calls', row);
        await jaaDB.insert('event_log', {
          uuid: uid(), type: 'GUARDIAN_EXECUTE_INTENT',
          source: 'guardian.tool-listener',
          payload: { callUuid: row.uuid, calltoUuid: sharedUuid, provider: agent.replace('guardian-', ''), prompt },
          causedBy: row.uuid, ts: Date.now(),
        });
      }
      _toast('toast.agent', `Tool: callto.parallel — Seam will merge`, { causedBy: sharedUuid });
      return { calltoUuid: sharedUuid, dispatched: true, parallel: true };
    }

    case 'system.status': {
      const health  = jaaDB.tail('guardian_health', 1)[0];
      const gaps    = jaaDB.query('gaps', r => r.status === 'open', 100);
      const crystal = jaaDB.query('crystals', r => r.state === 'stable', 100);
      const sigma   = jaaDB.tail('shape_samples', 1)[0];
      return {
        guardianConnected: health?.connected ?? false,
        openGaps:          gaps.length,
        stableCrystals:    crystal.length,
        sigma:             sigma?.sigma ?? null,
        ts:                Date.now(),
      };
    }

    case 'system.self': {
      const m = jaaDB.tail('self_model', 1)[0];
      if (!m) return { error: 'Self-model not yet computed' };
      return {
        creativityIndex:        m.creativityIndex,
        divergenceTrend:        m.divergenceTrend,
        topIntents:             (m.dominantIntentClusters ?? []).slice(0, 3),
        constraintPatterns:     (m.constraintPatterns ?? []).slice(0, 3),
        openQuestions:          (m.openQuestions ?? []).slice(0, 5),
      };
    }

    case 'crystal.contradict': {
      const crystal = await jaaDB.get('crystals', parsedArgs.uuid);
      if (!crystal) return { error: `Crystal not found: ${parsedArgs.uuid}` };
      const newScore = Math.min(1.0, (crystal.contradictionScore ?? 0) + 0.15);
      await jaaDB.update('crystals', crystal.uuid, {
        contradictionScore: newScore,
        state: newScore > 0.6 ? 'decaying' : crystal.state,
        ts: Date.now(),
      });
      await jaaDB.insert('event_log', {
        uuid: uid(), type: 'bep.contradiction.detected',
        source: 'guardian.tool-listener',
        payload: { crystalUuid: crystal.uuid, evidence: parsedArgs.evidence, newScore },
        causedBy, ts: Date.now(),
      });
      _toast('toast.warn', `Crystal contradicted: ${crystal.statement?.slice(0, 60)}`, { causedBy });
      return { uuid: crystal.uuid, newContradictionScore: newScore, state: newScore > 0.6 ? 'decaying' : crystal.state };
    }

    case 'spec.show': {
      const row = parsedArgs.uuid
        ? await jaaDB.get('specs', parsedArgs.uuid)
        : jaaDB.query('specs', r => r.name === parsedArgs.name, 1)[0];
      if (!row) return { error: `Spec not found: ${parsedArgs.name ?? parsedArgs.uuid}` };
      return {
        uuid:     row.uuid,
        name:     row.name,
        sections: (row.sections ?? []).map(s => ({ id: s.id, title: s.title, complete: s.complete })),
        modules:  row.modules ?? [],
        wired:    row.wired ?? {},
      };
    }

    default:
      return { error: `Unknown tool: ${toolId}` };
  }
}
```

### How — Result Injection

When a tool call completes, the result is formatted and optionally injected back into the conversation as a follow-up system message. This lets the agent "see" the result and incorporate it before continuing.

**Result format returned to agent (prepended to next response context):**

```
--- NEXUS TOOL RESULTS ---
[memory.search] → 3 results:
  [cortex] The seam merge threshold was debated in session 2026-05-24...
  [index]  §seam: agreementCoverage must be ≥ 0.60 (Orion verify stage)...
[gap.list] → 4 open gaps:
  [high]   stuck_call — callto timed out (agent_calls/abc-123, 47s)
  [medium] missing_schema — crystal.schema.json not registered in AJV
--- END TOOL RESULTS ---
```

**Injection mechanism:** Guardian's `_resultStore` (existing pattern, used for response routing) is extended. After tool execution completes, `tool-listener.js` POSTs to `/guardian/tool-results` with the `calltoUuid`. Guardian background.js receives this, formats the results block, and prepends it to the assistant's next injected message if `toolResultInjection` is enabled.

**`toolResultInjection` flag:**
- Default: `false` for standard calltos
- Set to `true` in the `GUARDIAN_EXECUTE_INTENT` payload by RAID when the callto is part of a multi-step workflow (e.g., spec review → tool use → final output)
- Set to `true` by CLI via `nexus callto dispatch guardian-claude "prompt" --inject-results`

---

## JAA TABLE: `tool_calls`

| Field | Type | Description |
|---|---|---|
| `uuid` | string | Row UUID |
| `toolId` | string | Registered tool ID |
| `calltoUuid` | string | Parent agent_calls UUID |
| `agentId` | string | Which agent called the tool |
| `rawBlock` | string | Exact text extracted from response |
| `parsedArgs` | object | Parsed arguments |
| `status` | enum | pending → executing → complete \| failed \| rejected |
| `result` | object\|null | Tool execution result |
| `error` | string\|null | Error message if failed |
| `executedAt` | integer\|null | Execution start timestamp |
| `completedAt` | integer\|null | Completion timestamp |
| `causedBy` | string | GUARDIAN_EXECUTE_INTENT event UUID |
| `ts` | integer | Row creation timestamp |
| `source` | string | `guardian.tool-listener` |

**Must be added to `ALL_TABLES` in `memory/jaa-db.js`.**

---

## BOOT INTEGRATION

`tool-injector.js` and `tool-listener.js` both start in **PHASE 11** alongside Siphon, Pulse, and Watchman.

`tool-injector.js` does not poll — it exports a function called synchronously during callto dispatch. No `init()` needed beyond validation of tool-registry on load.

`tool-listener.js` polls every 1500ms. Watermark pattern: reads `chat_completions` for rows where `toolsScanned !== true`. On each unscanned completion: parse tool blocks, execute, mark `toolsScanned = true`.

**Dependency:** `tool-listener.js` depends on `chat_completions` being written by Siphon (PHASE 11). Both start at PHASE 11 — Siphon should start first within PHASE 11 (declaration order in poll-registry).**

---

## COBALT REGISTRY ADDITIONS

```json
[
  { "id": "guardian.tool-injector", "file": "guardian/tool-injector.js", "layer": "guardian", "bootPhase": 11 },
  { "id": "guardian.tool-listener", "file": "guardian/tool-listener.js", "layer": "guardian", "bootPhase": 11 }
]
```

## POLL REGISTRY ADDITIONS

```javascript
pollRegistry.register('guardian.tool-listener', toolListener.tick, 1500);
// tool-injector has no tick — it's a pure function, not a poll-loop
```

---

## CLI COMMAND SURFACE (All `nexus tool *` commands)

```
nexus tool list                         List all registered tools (id, safety, description)
nexus tool show-definition <id>         Full tool definition: syntax, args, reads/writes, rate limit
nexus tool book                         Print Tool Book as injected (full format)
nexus tool book --compact               Print Tool Book in compact format
nexus tool book --agent <agentId>       Print Tool Book for a specific agent (respects allowedTools)
nexus tool calls [--n 20]              List recent tool calls
nexus tool calls --agent <id>          Filter by agent
nexus tool calls --status failed       Filter by status
nexus tool show <uuid>                 Full detail of a tool call
nexus tool stats                       Tool usage summary: calls/tool, success rate, avg latency
nexus tool replay <uuid>               Re-execute a tool call (for debugging)
```

---

## FAILURE MODES

| Failure | Behavior |
|---|---|
| Tool ID not in registry | Reject silently. Insert `failures`. Toast.warn AMBER: "Unknown tool: {id} in response from {agent}". |
| Rate limit exceeded | Drop silently (by design — prevents runaway recursion). No toast, no failure row. |
| Tool not in `allowedTools` | Reject. Insert `failures`. Toast.warn AMBER. Do not execute. |
| Required arg missing | Reject. Insert `failures`. Toast.error RED. Write `gap.report` for agent output contract violation. |
| JAA write fails in executor | Insert `failures`. Toast.error RED. Mark `tool_calls` row status=failed. Continue with remaining tool calls. |
| `callto.dispatch` tool triggers when Guardian disconnected | LAW I: write agent_calls row anyway. Callto-executor handles the fallback to API Claude on next tick. |
| `artifact.write` filesystem write fails | Insert `failures`. Toast.error RED. Do not insert `artifacts` JAA row. Return `{ error: "write failed" }` to agent context. |
| Recursive `callto.dispatch` (tool-initiated callto spawning further tool-initiated calltos) | Depth tracked via `toolDepth` field on `agent_calls`. If `toolDepth >= 3`: reject callto tool call. Toast.warn AMBER. |

---

## INVARIANTS

| Invariant | Rule |
|---|---|
| Tool Book is static | `tool-registry.js` is a constant. No runtime mutation. |
| Tool Book is always prepended | No GUARDIAN_EXECUTE_INTENT is dispatched without a Tool Book in the payload. Callto-executor enforces this. |
| Tool calls are JAA rows | No tool executes without a `tool_calls` insert first (LAW II). |
| Rate limits are server-enforced | The agent cannot bypass rate limits — they are checked against `tool_calls` table, not against the agent's self-reporting. |
| Results are never fabricated | If execution fails, the result block says "FAILED: {reason}". The agent sees the real result. |
| Tool listener is idempotent | `chat_completions.toolsScanned` flag prevents double-processing on restart. |
| Tool depth cap | Maximum `toolDepth` of 3 prevents unbounded agent recursion. |
| `artifact.write` always has a file extension | Enforced by validator before execution. Extensionless filenames are rejected with toast.warn. |
