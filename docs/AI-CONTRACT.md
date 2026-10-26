# AI-CONTRACT — the seam between MASTERMIND and any assistant

| | |
|---|---|
| **Version** | 1 · 2026-08-12 · project v0.1.21 |
| **Status** | Implemented and tested. No transport bridge exists yet — nothing calls a model. |
| **Governs** | what may leave the process, what may come back, and what happens to it |
| **Enforced by** | `foundation/ai/assist-contract.js` · `schemas/*.json` · `tests/run-assist-contract.test.js` (31 tests) |
| **Derived from** | emergence's `LLM_CONTRACT.js` — `requestedBy`/`reason` required, local-first, the bridge never injects or truncates |

---

## The rule

DR-003: **the AI never touches the vault.** The lesson of the `AUTH.key`
defect is that a rule enforced by remembering to follow it is not
enforced. So the boundary is structural.

1. **`assist-contract.js` cannot read anything.** It holds no reference
   to the vault, the lattice, localStorage, `NXAPI` or `fetch`. A test
   greps for each of those names and fails if one appears. Content must
   be handed to it.
2. **Every item names the field it came from**, and that field must
   appear in the calling module's `module.json` allowlist. An unlisted
   field is dropped, and the drop is reported — a silent drop teaches
   nobody why their assistant is unhelpful.
3. **`NEVER_SEND` overrides every manifest.** `password`, `salt`,
   `encPrivKey`, `identity`, `ledger`, `lexicon.*`, `vault.*` cannot be
   sent even by a module declaring `may_send: ["*"]`. A manifest is
   configuration; this is policy, and configuration does not get to
   override policy.
4. **The request object IS the payload.** `toWire()` and `wireBytes()`
   are the single path out, so a receipt can never describe something
   other than what was sent. Internal node ids are stripped.
5. **Every request produces a receipt** — intent, module, item count,
   character count, the field names, and a SHA-256 of the exact wire
   bytes — appended to the audit ledger. What left this machine is a
   matter of record, not memory.

## The intent set is closed

`disambiguate · suggest-tags · propose-edges · expand · compress ·
question · summarise`

There is no free-form `prompt` field, deliberately. An open prompt makes
the boundary unauditable: nobody could say afterwards what the assistant
had been asked to do.

## Nothing is applied automatically

Responses are **proposals**. A proposal becomes a node or an edge only
when the person accepts it, and then it carries
`provenance.author = "model"` with the model name and the `requestId`,
permanently. The schema enforces it: `author: "model"` makes `model` and
`requestId` required.

Accepted model nodes land in **`mode: "sandbox"`**. They have not been
through your own thinking yet, and weighing them as observations is
exactly what P8 compartments exist to prevent.

A model-proposed `contradicts` edge is a very different claim from a
computed word-overlap `related` edge, so `origin` distinguishes
`computed` / `human` / `model` and they are never interchangeable.

## Refusals the contract makes

| Situation | Result |
|---|---|
| module has no `assistance` block | nothing sends |
| `enabled: false` | nothing sends |
| empty `may_send` | refusal, not a wildcard |
| no `requestedBy` or `reason` | refused — no untraceable calls |
| every item dropped | `NOTHING_SENDABLE`; no request object is even built |
| response has no `model` | refused — it cannot be attributed |
| response `requestId` mismatch | refused |
| empty proposals, no stated `refusal` | **failure**, not a shrug — indistinguishable from breakage otherwise |
| proposal about a node never sent | rejected |
| invented edge type | rejected |
| confidence outside 0–1 | rejected, not clamped |

## Schemas

| File | What it fixes |
|---|---|
| `schemas/node.schema.json` | The P1 envelope. `provenance` and `mode` are **required** — neither can be retrofitted onto history. |
| `schemas/edge.schema.json` | Typed links incl. `contradicts`, adopted from emergence. `origin` records who asserted the edge. |
| `schemas/assist-request.schema.json` | The egress boundary as data. |
| `schemas/assist-response.schema.json` | Proposals, with `rationale` — a proposal with no rationale can only be trusted, not judged. |

## Not built

- **No transport.** Nothing calls a model. The bridge is the next piece
  and it goes in the main process, local-first, per DR-004's pattern.
- **No accept UI.** Proposals have nowhere to be reviewed yet.
- `voice-lattice/module.json` ships with `assistance.enabled: false`.
