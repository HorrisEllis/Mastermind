# DR-003 — AI assistance never touches the vault

- **Date** 2026-08-12 · **Version** 0.1.4 · **Status** Accepted (principle)
- **Owner** James Brooks · **Related** §0.3, §2.x, DR-001

## Decided

AI assistance does not read from, write to, or receive data derived from the
vault. Not for tagging, not for the voice lattice, not for ideation.

## Consequence for the planned modules

The associative voice lattice, node tagging, and AI-assisted ideation must be
designed so the assistant operates on material the user hands it explicitly
and in the moment — never on stored vault content, and never on a background
sweep of the corpus. Anything generated in that exchange enters the vault as
a node **marked with its provenance** (which model, when), so that a year
later the user can still separate their own thinking from a model's
completion of it. Provenance is a schema requirement, not a nicety: a system
for externalising one mind that quietly fills with another's has failed at
its purpose regardless of how well it runs.

## Rejected

**Cloud tagging of the lattice** (ChatGPT/Gemini over each sentence). Would
send the most personal corpus in the system — thoughts, feelings,
relationships, horizon plans — to a third party in plaintext. Directly
contradicts four versions of work spent removing state from localStorage.

**Local model tagging of vault content.** Weaker exposure but the same shape:
the vault's contents become an input to a model. Rejected under the same rule,
which is deliberately drawn at the vault boundary rather than at the network
boundary because the boundary is easier to hold and easier to verify.

**Deciding later.** The choice determines the node schema and the capture
pipeline. Deferring it means building both and discarding one.

## Open

This is a principle, not an implementation. The capture-side design — what
the user hands over explicitly, how provenance is recorded, what the schema
looks like — needs its own spec before any of it is built (§8.5).
