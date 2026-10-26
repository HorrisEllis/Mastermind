// ═══════════════════════════════════════════════════════════════════
// CLEARGLASS CONFIG — foundation/ai/clearglass-config.js
// v1.0.0
//
// WHY THIS EXISTS
// clearglass-main.js used to carry AGENTS and a dozen magic numbers
// (park position, poll intervals, wait durations) inline, spread across
// the file. Tuning any one of them, or adding a fifth agent, meant
// reading the whole module to find every place a number needed to
// change together. This file is the one place that changes.
//
// MAP — every ID below is a fixed name other code, logs, and docs can
// refer to without re-deriving what it means:
//   ids.window.PARKED   — window is OS-realized (visible to Chromium,
//                          so Page Visibility API reports 'visible') but
//                          positioned off any real display and hidden
//                          from the taskbar. This is the resting state
//                          for every agent window Mastermind isn't
//                          actively showing the user.
//   ids.window.REVEALED — window is on-screen, in the taskbar, focused.
//                          Only true while a person is actively signing
//                          in or looking at Show/Open.
//   ids.window.CLOSED    — BrowserWindow instance destroyed. Only
//                          happens on app quit (cgDestroy) or an
//                          explicit sign-out that recreates it fresh.
//
// ROOT-CAUSE NOTE — why PARKED exists instead of BrowserWindow's own
// show:false + backgroundThrottling:false (the previous approach):
//   backgroundThrottling:false stops Chromium from throttling TIMERS
//   for a window that is occluded/hidden — that part was already
//   correctly set and does matter (the ask script polls on setTimeout).
//   It does NOT change the Page Visibility API: a BrowserWindow that
//   was constructed with show:false and never actually shown reports
//   document.hidden === true / visibilityState === 'hidden' to its own
//   page, indefinitely. Modern chat SPAs (ChatGPT, Claude, etc.) can
//   legitimately defer streaming/render work while their own page
//   believes it's backgrounded — independent of any Electron-level
//   timer throttling setting. That is what "the test only completes
//   once you open the window from the toast" was: opening it flips
//   Page Visibility to 'visible' and whatever was deferred proceeds.
//   The only way to make Chromium report 'visible' without a person
//   ever seeing the window is to actually realize it (show it) and
//   move it somewhere no real display covers, rather than leaving it
//   in the never-shown state. That's PARKED. `.hide()` undoes this —
//   it flips Page Visibility back to hidden — so nothing in this
//   subsystem should call it; every former `.hide()` call site now
//   parks instead.
//
// TO ADD A NEW AGENT: add one entry to `agents` below with the same
// shape as the existing ones (selectors are CSS strings tried in
// order; set `verified:false` until you've confirmed them against the
// live site — unverified agents still work, they just log a warning).
// Nothing else in clearglass-main.js needs to change.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const ids = {
  window: { PARKED: 'parked', REVEALED: 'revealed', CLOSED: 'closed' },
  transport: { BAKED_IN: 'nxapi', RELAY: 'clear-glass-lite-relay' },
};

// Off-display coordinates. -32000 is intentionally far past any
// realistic multi-monitor layout (Windows' own virtual desktop bounds
// top out in the low tens of thousands even for absurd setups), so a
// parked window can never land on a real screen a person would notice.
const window_ = {
  width: 1100,
  height: 800,
  parkX: -32000,
  parkY: -32000,
  // Where a revealed (sign-in / "Show") window appears. Small offset
  // from the corner rather than dead-center so it doesn't stack
  // exactly on top of Mastermind's own window.
  revealX: 120,
  revealY: 80,
};

// All in ms unless noted. Grouped by where in the flow they apply.
const timing = {
  // cg:ask, before executeJavaScript runs
  loadTimeoutMs: 15000,       // give up waiting for did-finish-load, run anyway
  postLoadSettleMs: 900,      // let the SPA finish its own post-navigation render
  // inside the generated _askScript itself
  composeSettleMs: 600,       // after inserting the prompt, before reading it back
  injectionRetryMs: 250,      // brief pause before trying the paste-event fallback tier
  injectionFinalRetryMs: 500, // one more beat after that — some editors settle late
  postSendWaitMs: 1800,       // after clicking send, before checking SEND_FAILED
  askPollMs: 800,             // poll interval while waiting for a reply
  settleFallbackChecks: 3,    // consecutive stable (unchanged) polls required to trust completion when the stop-button selector never fires — ~3*askPollMs of no growth
  defaultAskTimeoutMs: 90000, // overridable per-call via opts.timeoutMs
  // sign-in detection
  signinWatchIntervalMs: 1500,
  signinWatchMaxTicks: 400,   // 1500 * 400 = 10 minutes, then the watcher gives up
};

// SELECTOR HONESTY: claude + chatgpt are observed working against the
// live sites. perplexity/gemini remain UNVERIFIED — named failures
// (NO_COMPOSER etc.), never silent hangs, and only these arrays need
// editing if a site's markup changes.
const agents = {
  chatgpt: {
    label: 'ChatGPT',
    url: 'https://chatgpt.com/',
    host: 'chatgpt.com',
    loginPaths: ['auth.openai.com', '/auth/login', 'accounts.google.com', 'login.microsoftonline.com'],
    verified: true,
    composer: ['#prompt-textarea[contenteditable="true"]', 'div[contenteditable="true"]#prompt-textarea', 'textarea#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
    send:     ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]', 'button[type="submit"]'],
    stop:     ['button[data-testid="stop-button"]', 'button[aria-label*="Stop" i]'],
    blocks:   ['[data-message-author-role="assistant"]', 'div.markdown'],
  },
  claude: {
    label: 'Claude',
    url: 'https://claude.ai/new',
    host: 'claude.ai',
    loginPaths: ['/login', '/magic-link', 'accounts.google.com', '/auth'],
    verified: true,
    composer: ['div[contenteditable="true"][class*="ProseMirror"]', 'div[contenteditable="true"]', 'textarea'],
    send:     ['button[aria-label*="Send" i]', 'button[type="submit"]'],
    stop:     ['button[aria-label*="Stop" i]'],
    blocks:   ['[data-testid="conversation-turn"]', '.font-claude-message'],
  },
  perplexity: {
    label: 'Perplexity',
    url: 'https://www.perplexity.ai/',
    host: 'perplexity.ai',
    loginPaths: ['/sign-in', 'accounts.google.com', '/auth'],
    verified: false,
    composer: ['textarea[placeholder*="Ask" i]', 'div[contenteditable="true"]', 'textarea'],
    send:     ['button[aria-label*="Submit" i]', 'button[aria-label*="Send" i]', 'button[type="submit"]'],
    stop:     ['button[aria-label*="Stop" i]'],
    blocks:   ['[class*="prose"]', '[data-testid="answer"]'],
  },
  gemini: {
    label: 'Gemini',
    url: 'https://gemini.google.com/app',
    host: 'gemini.google.com',
    loginPaths: ['accounts.google.com', '/ServiceLogin'],
    verified: false,
    composer: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea'],
    send:     ['button[aria-label*="Send" i]', 'button.send-button', 'button[type="submit"]'],
    stop:     ['button[aria-label*="Stop" i]'],
    blocks:   ['message-content', '.model-response-text', '[class*="response-container"]'],
  },
};

// guardian-lite is the clear-glass-lite relay's local server — used
// only by the browser-mode (non-Electron) fallback transport.
const guardianLite = {
  defaultPort: 7823,
};

module.exports = { ids, window: window_, timing, agents, guardianLite };
