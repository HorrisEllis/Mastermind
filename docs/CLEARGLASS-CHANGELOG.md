# ClearGlass Changelog

Every change to the ClearGlass / web-AI-agent subsystem made across this
build session, in commit order. Pulled from the real git log (`git log
--oneline`), not reconstructed from memory — commit hashes are given so
any entry can be verified with `git show <hash>`.

Some commits bundled unrelated work (versioning, installer theming, the
Options panel, Horizon's new feature) alongside ClearGlass changes. Where
that happened, only the ClearGlass-relevant part is described here; see
the commit itself for the rest.

---

## `d799171` — 2026-07-26 17:14 UTC
**Bridge: CORS+CSP+header via GM_xmlhttpRequest; hidden-not-headless via tray; fix agentKey/build-manifest bugs**

- `mastermind-ai-bridge.user.js` (the browser-mode relay userscript) had
  **zero `@grant` lines** while calling `GM_getValue`/`GM_setValue`
  (silently `undefined`, swallowed by a try/catch — the dedupe list
  never actually persisted) and used page-context `fetch()` to talk to
  guardian-lite. Server-side CORS hardening only solved half the
  problem: the pages this script runs inside (claude.ai, chatgpt.com,
  etc.) enforce their own CSP, which blocks a loopback `fetch()` as a
  `connect-src` violation regardless of server-side headers. Added
  `@grant GM_xmlhttpRequest` + `@connect 127.0.0.1`/`localhost`, moved
  every call onto `GM_xmlhttpRequest`, which runs outside the page's
  CSP/CORS sandbox entirely.
- `clearglass-main.js`: `cgCreateWindow` referenced an undefined
  `agentKey` (the param is `agent`) when injecting the per-window
  harness — threw on every window creation, silently caught. Fixed;
  now logs on failure instead of swallowing it.
- `package.json` build manifest pointed at `mastermind-bridge.user.js`,
  which doesn't exist (real file: `mastermind-ai-bridge.user.js`) — a
  packaged installer would have shipped with no bridge script at all.

## `d1efb66` — 2026-07-26 17:17 UTC
**Fix: second-instance handler didn't `show()` the hidden window, only `focus()`**

- Regression from the same day's earlier hide-to-tray change: a second
  launch attempt while Mastermind was already running (hidden) called
  `.focus()` on the main window, which is a no-op on a window that's
  hidden rather than minimized. Routed through `showMainWindow()`
  instead, which calls `.show()` first.

## `2d3c5a6` — 2026-07-26 19:10 UTC
**Add real, executable failure-mode test suite for the AI-assistance link chain**

- Built a mock `electron` module (test-only, gitignored, never
  shipped) plus a fake-DOM/GM harness so the *real* unmodified source
  files (`clearglass-main.js`, the bridge userscript,
  `clearglass-transport.js`, `main.js`'s background/tray logic) run
  under plain Node instead of a rewritten stand-in.
- 36 scenarios across four suites at this point: `clearglass-main.js`
  (13), the userscript (7), `clearglass-transport.js` (9), main.js
  background/tray (7).

## `6779091` — 2026-07-26 20:18 UTC
**Fix: agent windows must stay OS-realized (Page Visibility) or the AI reply never lands until shown**

The root-cause fix for "the Test toast never completes unless you open
the window from it." A `BrowserWindow` built with `show:false` and
never actually shown reports `document.hidden === true` to its own page
**permanently** — the Page Visibility API, a separate mechanism from
Chromium's timer throttling (`backgroundThrottling:false`, set in an
earlier session, only addressed the latter). Sites can legitimately
defer streaming/render work while their page believes it's backgrounded.

- Agent windows now stay OS-realized at all times: "parked" off-display
  (`x:-32000, y:-32000`) with `skipTaskbar:true`, shown via
  `showInactive()` — Chromium-visible without ever appearing to a
  person or stealing OS focus. "Revealed" (sign-in, Show) moves them
  on-screen. Every former `.hide()` call site (window close, sign-in-
  detected, the `cg:hide` IPC handler) now parks instead, since hiding
  flips Page Visibility back to hidden and would silently reintroduce
  the bug.
- New `foundation/ai/clearglass-config.js` — single source of truth for
  the four agent definitions (verified byte-identical to what was
  scattered inline before) and every timing/window constant.
- Sign-in watcher used to give up silently after ~10 minutes with zero
  signal to anyone; now logs and sends `cg:signin-timeout`, shown as a
  toast.
- Bridge userscript install was real but 100% dependent on finding a
  Settings button; made to run automatically at startup (later revised
  in `90d4063`/`e4aff70`'s predecessor commit, see `eae888a` below).
- 6 new regression tests for the park/reveal mechanism itself, not just
  its old symptoms.

## `99f708e` — 2026-07-26 21:36 UTC
**(ClearGlass-relevant part of a larger versioning/installer/vault commit)**

- `MASTERMIND_DOCS.html` existed in the repo but was never in
  `package.json`'s packaged `files` list and nothing in the app linked
  to it — added both, and corrected the doc's own then-outdated
  diagnosis of the Test-button bug (it had blamed timer throttling
  alone) to reflect the real Page Visibility root cause from `6779091`.

## `dbaa7c7` — 2026-07-26 22:13 UTC
**Fix real packaged-build bug: clearglass-config.js wasn't shipped, silently broke every ClearGlass IPC handler**

Found from a live install, not a test: `clearglass-config.js` (new in
`6779091`) was never added to `package.json`'s `build.files`. Invisible
in dev mode (Node reads straight off disk there); in a **packaged**
build, only listed files are bundled, so `require('./clearglass-
config')` — unguarded, no try/catch — threw `MODULE_NOT_FOUND`,
`clearglass-main.js` failed to load entirely, and `main.js`'s outer
try/catch silently swallowed it. Every single ClearGlass IPC handler
never registered — not just the one visible in the reporting
screenshot. The entire prior test suite passed throughout, because
tests also `require()` files straight off disk, bypassing packaging
completely.

- Fixed the immediate bug, and — more importantly — added
  `tests/run-packaged-deps.test.js`, which walks the real `require()`
  graph from `main.js` (exactly like Node would at runtime) and fails
  loudly if anything reachable from it wouldn't actually ship. Verified
  this test would have caught the original bug by reverting the fix
  and re-running it (failed as expected), then restoring it.

## `b79c314` — 2026-07-26 22:21 UTC
**Make the clear-glass-lite relay actually optional in the UI, and auto-detect its config instead of requiring a copy-pasted token**

- The relay (guardian-lite port/token) config was shown unconditionally
  to every Electron user, even though the baked-in path needs none of
  it — pure clutter. Split "Agent Accounts" (always relevant) from
  "Relay" (browser-mode only) into independently-controlled sections;
  collapsed behind an explicit "advanced" toggle under Electron.
- New `cg:detectGuardianConfig` / `cg:detectGuardian` — reads clear-
  glass-lite's own config file directly (best-effort guess at
  plausible filenames/keys in the same install directories the
  userscript installer already searches; fails honestly with what it
  tried, never pretends success).

## `eae888a` — 2026-07-27 14:08 UTC
**Reconcile a parallel fork (same base commit b0db392) — ClearGlass-relevant portions**

A separate line of work, diverged from the same starting commit,
independently fixed some of the same bugs and built one new (non-
ClearGlass) feature. Reconciled rather than merged blindly:

- **Not ported** (superseded by work already done here): a per-ask
  `opacity(0)+showInactive()+hide()` toggle meant to work around the
  same focus/injection issue `6779091` already root-caused — under the
  park/reveal architecture, `isVisible()` is always true by the time
  any ask runs, so this would be permanently-true-guarded dead code,
  and any `.hide()` call — even temporary — conflicts with that
  architecture's core invariant. Also not ported: a simpler relay-
  hiding implementation, since `b79c314`'s (advanced toggle + auto-
  detect) is a superset.
- **Ported**: `cgFuzzyFindRoots` — fuzzy directory scanning
  (`/clear.?glass.?lite/i`) for clear-glass-lite installs with version
  suffixes or unusual casing, folded into the shared `_cgLiteBaseDirs`
  helper so both the userscript search *and* guardian-config detection
  benefit. `cgInstallUserscript` now auto-creates the `userscripts/`
  subfolder if the app root exists but that folder doesn't yet
  (userscript managers often create it lazily). A paste-event fallback
  tier added to `_askScript`'s text injection (editors whose own model
  reverts a direct `textContent` write on the next render tick still
  generally accept a real paste event) plus an extended settle window
  — this adds ~450ms latency even on success, confirmed by retiming
  and rerunning the test suite rather than calculating by hand.
- Found and fixed a real test-isolation bug of this line's own while
  porting: a `cgDetectGuardianConfig` test was writing directly into
  the shared system tmpdir (`/tmp/clear-glass-lite`) instead of an
  isolated subdirectory, leaving real files behind that silently
  satisfied a *different* test's "nothing is installed" assumption.

## `6bc348f` — 2026-07-27 18:13 UTC
**Make the four clear-glass-lite relay settings fully implicit — no click required, status-first UI, manual controls only as a fallback**

- Even collapsed behind "advanced," the relay panel still showed four
  things needing manual action. Both auto-config steps (bridge
  install, guardian-lite detection) now run together, silently, the
  moment the section is looked at (or at boot, same gated case as
  before) — no button click required for either. The section shows a
  single status line instead of four controls; the actual controls
  still exist (a genuine escape hatch is unavoidable — clear-glass-lite
  is a separate app whose install location and config format aren't
  something this repo controls) but are collapsed behind an explicit
  "Configure manually" link, never shown by default.
- Runs once per session (a shared cached promise), not once per render.

## `90d4063` — 2026-07-27 22:02 UTC
**(ClearGlass-relevant part: the reload-on-every-call fix)**

Found from a live report ("I hit Test and it doesn't run," with
screenshots showing the underlying page actually being driven
successfully): `cg:ask`'s reload-before-asking default was
`opts.fresh !== false` — reload unless told not to. The app's one AI-
call path, `aiCall → clearglassCall`, never passed `fresh` at all, so
that condition was always true. **Every** AI feature — Node expand,
Canvas analysis, Gap bridge, Signal/noise, Horizon AI end-states, Test,
all of it — was reloading the entire agent page from scratch before
every single request: full navigation overhead, discarded conversation
context, and any first-load-only UI (a cookie banner visibly sitting
over a reply in one screenshot) re-triggering every time.

- Flipped the default to `opts.fresh === true` (reuse the page unless a
  caller explicitly opts into a reload). Test now explicitly passes
  `fresh:true` — a deliberate choice specific to it, not an accidental
  side effect everything else was also getting.
- Two new regression tests confirming both directions (no reload by
  default; reload when `fresh:true` is explicit).

## `e4aff70` — 2026-07-30 09:35 UTC
**Fix the actual remaining Test-hang cause (stop-button-dependent completion detection) and add live progress instead of a static spinner**

Even after `6779091` (Page Visibility) and `90d4063` (reload default),
Test could still hang. Root cause: `_askScript`'s completion condition
was `sawGenerating && !gen` — it required *observing* a "generating"
indicator appear via the stop-button selector, then disappear. If that
selector doesn't match the live site's real current DOM (very
plausible — sites change markup), completion could never be detected,
even once the reply had genuinely landed (which the reporting
screenshots showed was happening — a correct reply was visible in the
agent's own tab).

- Completion is now detected primarily via **text stability** —
  several consecutive polls with unchanged, non-empty reply content —
  the same principle the browser-mode userscript's `awaitReply` had
  already used successfully; the stop-button is now a fast-path
  accelerator, not a hard requirement. New
  `CFG.timing.settleFallbackChecks` (3 consecutive stable polls, ~2.4s
  of no growth) governs the fallback threshold.
- New read-only `cg:peek` IPC handler (no typing, no clicking, no side
  effects — verified in tests by asserting the composer's value stays
  untouched) polled every 3s by `clearglassCall` while a call is in
  flight. The status chip now shows a live, truncated preview of the
  reply as it accumulates instead of a spinner that looks identical
  whether it's working or stuck. The terminal success toast now shows
  the actual reply text too, not just a generic checkmark.
- 3 new tests; all 26 pre-existing `clearglass-main.js` tests passed
  against the new completion logic with no timing changes needed.

---

## Cumulative test count

The ClearGlass/AI-assistance test suite grew from 0 to 61 tests across
this session (`node tests/run-all.js`), spanning six suites:
`clearglass-main.js` (28), the bridge userscript (7),
`clearglass-transport.js` (9), `main.js` background/tray (8), vault
secure wipe (6, not ClearGlass but built alongside), and packaged-build
dependency completeness (3).

## What's still honestly unverified

Everything above is verified against a mock Electron/DOM built to
faithfully exercise the real, unmodified source files — but none of it
has run against a real signed-in browser session from this environment,
which has no display and no network access to claude.ai/chatgpt.com/etc.
The diagnoses (Page Visibility, reload defaults, stop-button staleness)
are grounded in documented Chromium/Electron behavior and each one
matched a specific reported symptom, but the last-mile confirmation has
always been — and remains — an actual run on a real machine.
