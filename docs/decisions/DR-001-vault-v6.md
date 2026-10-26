# DR-001 — Vault v6 envelope, KDF policy, and audit anchoring

- **Date** 2026-08-11 · **Version** 0.1.1 · **Status** Accepted
- **Owner** James Brooks · **Spec** `docs/VAULT.spec.md`

§17.3 requires the alternatives and the rejections, not just the decision.

---

## D1 — Where the PBKDF2 salt lives

**Decided:** cleartext header of the vault file.

**Rejected — keep it in localStorage (v5 behaviour).** Made every vault
non-portable: correct password plus correct file could not open on a machine
that had not run setup, because the salt needed to derive the key was on the
other machine. Also violated the stated goal that nothing persists outside
the vault.

**Rejected — derive the salt from the username.** Removes the file
dependency but destroys the salt's purpose: a predictable salt is
precomputable across users.

**Assumption being made:** that a salt is not secret. Standard, and the
reason publishing it costs nothing.

## D2 — KDF choice

**Decided:** keep PBKDF2-SHA256; make the iteration count a header field and
a setting; default 1,000,000, floor 310,000.

**Rejected — scrypt via Node's main process.** Memory-hard, zero new
dependencies, materially stronger per unit of unlock latency (~128 MB at
N=2^17 breaks GPU parallelism in a way iteration count cannot).
**Rejected by the human**, on the grounds that browser mode is gated and the
existing primitive should be raised rather than swapped. Recorded because it
is the strongest option on the table and should be revisited if the threat
model tightens.

**Rejected — Argon2id.** Better still; requires a native or WASM dependency,
against §5.5's preference and the project's zero-dependency line.

**Rejected — escalating iterations per failed attempt.** Proposed as a
brute-force defence. It does not work: iterations are an input to the key,
so a different count derives a different key and the owner is locked out on
attempt two. Offline attackers never touch the attempt counter at all. The
misconception is worth keeping on record — the test
`same password + different iterations = different key` exists to make the
constraint permanent.

## D3 — Integrity: is a hash needed when GCM already authenticates?

**Decided:** both, for different jobs. The GCM tag is the real integrity
check (keyed, unforgeable). `ciphertextSha256` exists only to separate
"corrupt file" from "wrong password" *before* a key exists.

**Rejected — SHA-256 alone.** An attacker recomputes it; it proves nothing
about authenticity.

**Rejected — GCM alone.** Then a truncated file reports "incorrect password"
and sends the person hunting for a typo while the vault rots.

**Decided additionally:** bind the whole header as AAD, so `savedAt`,
`saveCount`, `vaultId`, KDF parameters and the ledger anchor are
authenticated. Without this, "last modified" is an editable number in a text
file and the question "when was this changed" has no trustworthy answer.

## D4 — Rollback detection

**Decided:** high-water `saveCount` carried in the audit ledger; ledger head
anchored inside the vault's AAD.

**Rejected — a dedicated high-water file outside the vault.** Offered; the
human asked to be prompted instead of adding an external artifact. The
ledger turned out to satisfy the requirement without a new file, because it
already had to exist outside the vault.

**Rejected — storing the audit log inside the vault.** Cannot record a
failed unlock (no key), and anyone who can open the vault can rewrite the
record of having opened it.

**Accepted limitation:** replacing vault and ledger together as a consistent
older pair returns OK. Stated in the spec rather than papered over.

## D5 — Behaviour on a suspicious verdict

**Decided:** session goes read-only and prompts; default choice is cancel.

**Rationale:** opening an old backup is harmless. The next *save* is what
destroys the newer lineage. Blocking writes rather than reads puts the
refusal where the damage is (§16.3 — an invalid state is refused, not logged
and passed through).

## D6 — What happens when a save fails

**Decided:** no fallback. Loud error, `VAULT.dirty` stays true.

**Rejected — the previous behaviour**, which wrote the full state to
localStorage in plaintext on failure. It hid the failure and created exactly
the outside-the-vault copy the design forbids.
