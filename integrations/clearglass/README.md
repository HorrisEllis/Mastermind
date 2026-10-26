# ClearGlass integration

Mastermind talks to web AI two ways.

## 1. Baked in (primary — no setup)
`foundation/ai/clearglass-main.js` hosts ChatGPT / Claude / Perplexity / Gemini
inside Mastermind's own Electron process, one isolated session per account.
Nothing here is needed for that path: no separate app, no userscript, no relay.
Options → AI → *Sign in to X*.

### Runs hidden, not headless (2026-07-25)
Agent windows are real `BrowserWindow`s created with `show: false` and
`backgroundThrottling: false` — not a headless/offscreen render, so
`document.execCommand`, focus-dependent composer injection, and streaming
detection all behave exactly like a visible tab, just off-screen. That part
already worked. What didn't: closing Mastermind's *main* window used to call
`app.quit()` (`window-all-closed`), which tore down every hidden agent window
with it — "hidden" only lasted until you closed the app, which defeats the
point. `main.js` now hides the main window to a system tray icon instead of
quitting on close; the process, guardian polling, and every hidden agent
window keep running with no window open at all. Use the tray icon to reopen
the UI or to actually quit.

Also fixed: `cgCreateWindow` referenced an undefined `agentKey` when
injecting the per-window harness — a `ReferenceError` on every single agent
window creation, silently caught by the surrounding `try/catch`. The harness
(`window.__MM_AGENT__`) never installed. Now logs loudly if it ever fails
again instead of failing silently.

## 2. clear-glass-lite relay (fallback — browser mode)
For Mastermind running outside Electron, or to drive a tab in a separately
running clear-glass-lite.

Install `mastermind-ai-bridge.user.js` into clear-glass-lite's userscripts
folder. It **replaces** `eravos-ai-bridge.user.js` — same relay contract,
Mastermind's own tables.

### Built against the CORS/CSP-hardened build (2026-07-24, client side 2026-07-25)
- `window.__CGL_BRIDGE__` supplies the live guardian-lite origin and the
  per-install auth token. The old hardcoded `http://127.0.0.1:7823` broke
  silently whenever the port changed and was server-side indistinguishable
  from any other process on the machine.
- Every route past `/health` requires the `X-CGL-Token` header. No token = 401.
  That is real access control now, so Mastermind sends it too — paste the token
  into Options → AI.
- Wildcard CORS is gone; guardian-lite uses an origin allowlist and
  `Access-Control-Allow-Private-Network`. That's the server half.
- **Client half (2026-07-25):** server-side CORS doesn't help if the request
  never leaves the tab. `mastermind-ai-bridge.user.js` runs inside
  claude.ai/chatgpt.com/perplexity.ai/gemini.google.com, and those pages ship
  their own `Content-Security-Policy`. A page-context `fetch()` to
  `127.0.0.1` is a CSP `connect-src` violation, not a CORS error — no
  server-side header fixes it. The script now declares
  `@grant GM_xmlhttpRequest` + `@connect 127.0.0.1` / `@connect localhost`
  and does every call through `GM_xmlhttpRequest`, which runs outside the
  page's CSP and CORS sandbox entirely. `X-CGL-Token` is still sent
  explicitly on every request; bypassing the page's CSP doesn't bypass
  guardian-lite's own auth. The script also had **zero `@grant` lines**
  while calling `GM_getValue`/`GM_setValue` — those silently evaluated to
  `undefined` and got swallowed by a try/catch, so the processed-request
  dedupe list quietly never persisted. Fixed by the same `@grant` line.

### Tables
| direction | table |
|---|---|
| Mastermind → bridge | `mastermind-requests` |
| bridge → Mastermind | `mastermind-responses` |

Rows carry `agent` (`claude` / `chatgpt` / `perplexity` / `gemini`) so one
script serves every provider and Mastermind can target a specific one.
Processed rows are DELETEd so a stale reply can never satisfy a later request.

### Known weak point
DOM selectors. Claude's are confirmed against the live site; the other three
are best-known guesses and are flagged as such in the script and the UI.
If requests time out, check those first — every attempt logs rather than
failing silently.
