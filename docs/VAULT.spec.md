# VAULT.spec — MASTERMIND Vault Subsystem

| | |
|---|---|
| **Spec version** | 6 (envelope format) |
| **Project version** | 0.1.51 |
| **Owner** (§17.1) | `foundation/vault/` — James Brooks |
| **Lifecycle** (§17.2) | Implemented → Verified (94/94 automated) → **awaiting Electron re-test** |
| **Last checked against code** | 2026-08-11 |
| **Governs** | vault file format, key derivation, audit ledger, tamper/rollback verdicts |

> Written **after** the implementation, which is a §8.5 violation ("do not build
> anything without creating a spec file first"). Recorded here rather than
> quietly backdated — §0.1, evidence over convenience. The v6 build was done
> under an emergency: the previous build was not persisting anything at all.

---

## 1. Components (§5.1)

| Component | UUID | Purity | Responsibility |
|---|---|---|---|
| `vault-envelope.js` | `4a3b2c1d-vault-6000-8000-envelope0001` | pure | What a vault file *is*. Canonical AAD, build/parse/validate, v5 detection. |
| `vault-crypto.js` | `4a3b2c1d-vault-6000-8000-crypto00001` | impure (WebCrypto) | KDF, AEAD, hashing, chunk-safe base64, calibration. |
| `vault-ledger.js` | `4a3b2c1d-vault-6000-8000-ledger00001` | impure (fs, main process) | Hash-chained append-only audit ledger. |
| `vault-guard.js` | `4a3b2c1d-vault-6000-8000-guard000001` | pure | Verdicts from header + ledger state. No I/O, no prompts. |
| `mastermind-vault.js` | `4a3b2c1d-vault-4000-8000-vault000001` | impure | Orchestration, save/load, diagnostics, harvest, boot probes. |
| `atomic-write.js` | `4a3b2c1d-vault-6000-8000-atomicwrite1` | impure (fs, main) | The single durable-write implementation, shared by main.js and tests. |
| `vault-snapshots.js` | `4a3b2c1d-vault-6000-8000-snapshots01` | impure (fs, main) | Content-addressed snapshots: create, verify, reversible restore, prune. |
| `vault-boot.js` | `4a3b2c1d-vault-6000-8000-bootseq0001` | pure | Ordered pre-flight gates over injected probes. |

## 2. Contract (§5.10)

**Inputs** — password (string, never stored), app state (serializable object),
vault file (JSON), audit ledger (JSONL).

**Outputs** — sealed envelope written atomically to `<dataDir>/mastermind.vault`;
appended ledger entries; verdicts; `vaultHealth()` snapshots.

**Enforcement note.** In 0.1.3 invariant 0 was a check inside `vaultSave`
comparing the header against `AUTH.kdf`. That only holds if `AUTH.kdf` is
updated whenever `AUTH.key` changes — and `optsChangePassword` did not,
assigning `AUTH.key` directly while leaving `AUTH.kdf` describing the old
salt. The check then compared old against old, passed, and would have sealed
the vault with a key its own header could not re-derive. Since 0.1.4 direct
assignment throws.

**Invariants** (§12.4 — crystallised from the tests that hold them)
0. **The header must describe the key in memory.** A vault sealed with KDF
   parameters that did not produce its key is unopenable by anyone, forever,
   including with the correct password. `AUTH.kdf` is set at derivation time
   and is the only source the seal reads; `vaultSave` refuses to write if the
   header and the session key disagree.
1. A vault opens on any machine given only the file and the password.
2. Every header field except `data` and `ciphertextSha256` is authenticated (AAD).
3. Iterations are read from the file, never assumed, never varied per attempt.
4. No app state is persisted outside the vault except its own location.
5. A failed unlock is recorded even though it never obtains the key.
6. A save that does not land leaves `VAULT.dirty === true` and says so loudly.

**Failure modes** (§13.3 — named before they occur)
`EMPTY` · `NOT_JSON` · `NOT_OBJECT` · `UNSUPPORTED_VERSION` · `BAD_FORMAT` ·
`BAD_CIPHER` · `BAD_KDF*` · `BAD_IV` · `BAD_SAVED_AT` · `BAD_SAVE_COUNT` ·
`BAD_ANCHOR` · `NO_CIPHERTEXT` · `BAD_HASH_FIELD` · `CIPHERTEXT_CORRUPT` ·
`FRESH` · `OK` · `UNANCHORED` · `ROLLBACK` · `ANCHOR_UNKNOWN` ·
`LEDGER_MISSING` · `LEDGER_BROKEN` · `FOREIGN_VAULT` ·
`SEQ_MISMATCH` · `CHAIN_BROKEN` · `HASH_MISMATCH` · `UNPARSEABLE_LINE`

**Version** — envelope 6. **Permissions** — Electron main process owns all file I/O.

## 3. File format

```json
{
  "format": "mastermind-vault", "version": 6, "vaultId": "<uuid>",
  "cipher": "AES-256-GCM",
  "kdf": { "algo": "PBKDF2-SHA256", "iterations": 1000000,
           "salt": "<base64 32B>", "keyLen": 32 },
  "iv": "<base64 12B>", "savedAt": "<ISO>", "saveCount": 0,
  "ledgerAnchor": { "seq": 0, "head": "<hex>" },
  "ciphertextSha256": "<hex>", "data": "<base64>"
}
```

AAD = canonical JSON of every field except `data` and `ciphertextSha256`.
Canonical = recursively key-sorted, no whitespace, arrays keep order.

## 4. Benchmarks (§17.11)

Measured by `foundation/vault/vault-crypto.js` → `deriveKey()`, on the
build container (Node v22.22.2, x86-64, containerised — **not** the target
Windows desktop; the numbers there will differ and should be re-measured
with `vaultCalibrateIterations()`).

| Iterations | Wall time |
|---|---|
| 310,000 | 87 ms |
| 1,000,000 | 148 ms |

≈ 6.6M iterations/sec measured. Unfavourable case reported alongside:
this is **far faster than the ~1s I estimated when proposing 1M**, which
means 1M buys less resistance on this class of hardware than claimed.
`vaultCalibrateIterations(1000)` suggests ≈ 6.6M for a 1-second unlock here.
The default remains 1,000,000 pending a measurement on the real target
machine — the setting exists precisely so the number is chosen from evidence.

**Not claimed:** parity with a memory-hard KDF. PBKDF2-SHA256 is
compute-hard; GPU/ASIC attackers parallelise it cheaply. Raising iterations
trades 1:1 against hardware that is orders of magnitude faster.

## 5. Test coverage (§12.1, §12.2)

`tests/run-vault-lifecycle.test.js` — 13 tests. Create → save → reopen →
change password → reopen, over a real directory, using the same
`atomic-write.js` main.js uses. Explicitly **not** a hardware test: no
Electron, no IPC, no unlock screen. It narrows the untested surface to the UI
and IPC layers — which is exactly where the 2026-08-11 failure lived, so a
green run here must not be read as clearance.

`tests/run-vault-v6.test.js` — 47 tests, all able to fail, no mocks.
Six are regressions from the 2026-08-11 field failure, including a
reconstruction of the real ledger and a proof that a KDF/key mismatch
produces a permanently unopenable vault.
Real WebCrypto, real filesystem, real chain replay. Covers: canonicalisation
determinism, AAD composition and stability, round trip, wrong password,
six distinct header-forgery attempts, corrupt-vs-wrong-password, attacker
recomputing the hash, 2MB payload, KDF parameter independence, chain
tamper/truncation/reorder, concurrent writers, and all eight guard verdicts.

## 6. Drift (§12.5, §13.4) — what is NOT done

Gaps are data, not failures. Open, in dependency order:

-1. **Field test 2026-08-12 (second run) — vault recreation produced an
   unopenable vault.** `_vaultRecreateWithKey()` derived a key from a freshly
   minted random salt and then wrote a **v5** envelope. v5 has no salt field,
   and v0.1.4 had removed the localStorage copy, so the only record of that
   salt vanished as the function returned: correct password, permanently
   refused. The same defect was in `vaultExport('encrypted')` — an encrypted
   backup that could never be decrypted. Both now go through the verified v6
   path. Covered by a source-level test that forbids WRITING a v5 envelope.

   Also fixed: the boot screen and the vault-recovery screen rendered on top
   of each other. `_showVaultMissingScreen` sets `style.display = 'flex'`
   inline, and an inline style beats the `.hidden` class — so every hide that
   only added the class was a no-op. Three call sites had it.

0. **Field test 2026-08-12 — the module was only half-loading.** Recreating
   a deleted vault failed with `Cannot access 'VAULT' before initialization`.
   Cause: the `Object.defineProperty(AUTH, 'key', …)` guard added in v0.1.4
   ran at module-evaluation time, but `const AUTH` is declared in
   `nexus-engine.js`, which loads *after* `mastermind-vault.js`. Top-level
   `const` in a classic script lives in the shared global lexical scope, so
   that line hit a temporal dead zone and threw — aborting the rest of the
   file, leaving `const VAULT` (200 lines below) uninitialised.
   **v0.1.4 through v0.1.15 all shipped with the vault module aborting
   partway through evaluation.** No unit test could see it: every function
   in the file works when required alone. Fixed in 0.1.16 by deferring the
   guard, and covered by `tests/run-load-order.test.js`, which evaluates
   every renderer script in real document order in one shared context.

1. **Field test 2026-08-11 — unlock passed, every save failed.** The audit
   ledger did its job: 7 entries, chain verified, three
   `vault.save` / `vault.save.failed(seal)` pairs with `vaultId: null`.
   Cause: the legacy-v5 login branch bound neither the KDF parameters nor an
   identity, so `buildHeader` threw. Fixed in 0.1.3 (`_setSessionKey`,
   `_vaultEnsureIdentity`). **Not yet re-tested on hardware.**
2. ~~credential writes to localStorage~~ — **closed in 0.1.4.** Zero remaining
   `localStorage.setItem(AUTH_META_KEY|AUTH_VAULT_KEY)` call sites. Password
   change, PIN set/remove, backup codes, the unencrypted opt-out and the
   recovery path all read and write the vault file. `AUTH.key` is now a
   non-assignable accessor: the only way to set a session key is
   `_setSessionKey(key, salt, iterations)`, which cannot set one without the
   others — invariant 0 is enforced by the language, not by discipline.
3. ~~`setupCreateVault()` writes v5~~ — fixed in 0.1.3. Setup now calls
   `vaultCreateNew()`, which seals a v6 envelope, writes it, then reads it
   back and decrypts it before reporting success.
4. **Cobalt ledgers** (`ledger.truth.jsonl`, `ledger.idea.jsonl`) remain
   plaintext outside the vault, and Cobalt's manifest ships 1 of 7 files.
   Amending §C1 is a reseal decision, not a refactor.
5. **No Playwright coverage** (§4.1 requires UI tested via Playwright). The
   boot screen's render layer is tested as string output
   (`tests/run-boot-screen.test.js`); the DOM behaviour, the staged reveal
   and the restore flow are not — those need a browser driver.
6. ~~`vaultBootCheck()` is not called at startup~~ — **closed in 0.1.7.**
   `_continueStartup()` awaits `mmBootRun()` before routing to unlock,
   skipping it only on a genuine first run (no identity AND no data folder),
   where there is nothing yet to check.
6. **Rollback is undetectable if vault and ledger are replaced together.**
   Defending that needs state on separate media.
