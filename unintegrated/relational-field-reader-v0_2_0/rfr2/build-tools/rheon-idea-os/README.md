# rheon v0.1.0

**Spec library. Project repository. Spec builder. Idea ledger.**
GitHub with higher leverage — architecture and intent alongside code.

---

## What shipped (v0.1.0 — foundation)

```
L0  SISO Core       src/core/          Event → Gate → Stream → StreamLog
L1  Storage         storage/       Ledger, Store, IdeaStore, ProjectStore
L2  Seam Contracts  seams/         4 contracts declared before server
L3  rheon-server    server/        Express REST + SSE  :7900
L4  rheon-cli       cli/           verb noun [flags] — peer to UI
```

**34 tests passing. Zero mocks in production code.**

---

## Quick start

```bash
npm install
npm start          # starts server on :7900

# CLI
node cli/index.js status
node cli/index.js project new my-project
node cli/index.js project list
node cli/index.js idea add "seams should be the cut points" --project my-project
node cli/index.js idea list
```

---

## Data layout

```
~/.rheon/                      (RHEON_DATA to override)
  ledger/
    events.jsonl               append-only. eventTs ordering. never truncated.
  store/
    objects/{hash[0..1]}/{hash} content-addressed blobs (SHA-256)
    refs/{namespace}/{name}.json named refs → hash
  ideas/
    ideas.jsonl                one idea per line
    lattice.jsonl              associative edges between ideas
  projects/
    {name}/                    git repo + .spec.json + seams/REGISTRY.json
```

---

## CLI commands

```
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

--json flag on any command for JSON output
```

---

## REST API (UI_CONTRACT v1.0.0)

```
GET  /api/status
GET  /api/ledger?n=20
GET  /api/events              SSE stream

GET  /api/projects
GET  /api/projects/recent?limit=10
POST /api/projects            { name, remote? }
GET  /api/projects/:name
GET  /api/projects/:name/files?path=
GET  /api/projects/:name/file?path=
PUT  /api/projects/:name/file { path, content }
GET  /api/projects/:name/git/status
POST /api/projects/:name/git/push
POST /api/projects/:name/git/pull

GET  /api/specs/:namespace
GET  /api/specs/:namespace/:name
POST /api/specs               { name, namespace?, content? }
PUT  /api/specs/:namespace/:name { content }

GET  /api/ideas?projectId=&tags=&limit=
POST /api/ideas               { text, projectId?, tags? }
GET  /api/ideas/search?q=&projectId=
POST /api/ideas/link          { fromId, toId, type }
GET  /api/lattice?projectId=
```

---

## Seam contracts

All four seams declared in `seams/`:

| Seam | Between | Status |
|------|---------|--------|
| STORAGE_CONTRACT | server ↔ storage layer | active |
| UI_CONTRACT      | UI ↔ server            | active |
| CLI_CONTRACT     | CLI ↔ server           | active |
| LATTICE_CONTRACT | server ↔ idea store    | active |

---

## Environment

| Var | Default | Purpose |
|-----|---------|---------|
| `RHEON_DATA`   | `~/.rheon` | Data root |
| `RHEON_PORT`   | `7900`     | Server port |
| `RHEON_SERVER` | `http://localhost:7900` | CLI target |

---

## Next batch — UI (L5)

- Home page: recent projects, nav to all 5 surfaces
- Spec Builder: step-wise SEAM-aware spec authoring
- Spec Library: queryable spec store
- Repository: file browser → IDE / living doc + last-edited seam panel
- Idea Ledger: associative lattice visualiser + query surface
- Architect: entry point to full Architect (stub)

*Builds to UI_CONTRACT v1.0.0 seam.*

---

## Axioms

§1.2 Nothing silently fails. §2.1 Persistence is the golden rule. §3.1 Bottom-up only.
§4.1 CLI is a peer. §5.1 Everything has a UUID. §5.5 What does not exist must be built.

*The spec IS the system. Code is a projection of the spec.*
