# MAP — v0.1.1 · Vault subsystem

§3.3 requires a written map of current state vs. spec before a build, not a
memory of having checked. This map was produced during the session and is
written down here after the fact — recorded honestly rather than backdated.

---

## What was found (evidence, not assumption)

| # | Finding | Evidence |
|---|---|---|
| 1 | Nothing was being written to `mastermind.vault` at all | Uploaded vault: 4,276 bytes, 3,141 bytes plaintext, ~2 KB of that the RSA blob. Screenshots: 7 nodes on canvas, "Canvas data: 0 B". |
| 2 | `foundation/core/mastermind-foundation.js:1799-1801` overwrote `vaultSave`/`vaultDirtySave`/`vaultLoad` with localStorage shims on DOMContentLoaded | Function declarations are `window` properties; `_run()` fires after all scripts execute. |
| 3 | Every autosave was a hard no-op | ~20 call sites pass a number (`vaultDirtySave(4000)`); the shim read arg 1 as `getState`; `MMVault.autosave` bailed on `typeof getState === 'function'`. |
| 4 | `saveCanvas()` stored the boolean `true` as the entire app state | `vaultSave(true)` → `MM.vaultSave(appState=true)` → `_assemble(true)`. |
| 5 | `JAA.ledger` was not a Map | `siso-jaa.js:370` sets `JAA = JAA \|\| {}`, defeating `nexus-canvas.js:122`'s `typeof JAA === 'undefined'` guard; `_jaaCompat()` then installed `ledger: {get,has}`. Panel showed "undefined entries". |
| 6 | `Object.fromEntries(JAA.ledger)` threw, outside `vaultSave`'s try | Unhandled rejection from a `setTimeout` — no toast, no log. §1.2 violation in the shipped code. |
| 7 | The vault file was not openable on any other machine | Salt lived only in `localStorage[AUTH_META_KEY]`; login Gate 2 hard-required `AUTH_VAULT_KEY`. |
| 8 | Base64 would throw past ~100 KB | `String.fromCharCode(...bytes)` spreads every byte as an argument. Verified: `RangeError` at 2 MB. |
| 9 | `vault:write` was atomic but not durable | `writeFileSync` + `rename`, no fsync of file or directory. |
| 10 | `integrity: "sha256:hex"` was documented in the format and never written or read | `mastermind-vault.js:32` vs. the whole module. |

## What changed

Foundation first (§3.1): envelope → crypto → ledger → guard → orchestration →
login → UI panel. Each layer has passing tests before the one above it exists.

## Measurable improvement (§17.9)

| Property | Before | After | Measured by |
|---|---|---|---|
| Reliability | 0 of ~20 autosave paths functional | all route to a single tested save path | `tests/run-vault-v6.test.js` |
| Security | app state mirrored in plaintext localStorage | no state outside the vault; leak scan in `vaultHealth()` | `no_state_outside_vault` check |
| Observability | 0 audit entries; failures silent | hash-chained ledger incl. failed unlocks; live health score | `vaultHealth()`, `ledger:state` |
| Portability | vault unopenable without the origin machine's localStorage | file + password is sufficient | invariant 1, `docs/VAULT.spec.md` |
| Test coverage | 0 vault tests | 41 | suite output |

## Nearest gap (§16.1)

Not a feature. **Real-hardware verification.** Per §1.1 this build does not
exist until it is demonstrated under real conditions, and the Electron path
has no coverage in this environment. That is the next task, ahead of
`setupCreateVault()` v6 migration and ahead of Cobalt.
