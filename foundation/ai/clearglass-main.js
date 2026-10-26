// ═══════════════════════════════════════════════════════════════════
// WEB-AI AGENT HOST — foundation/ai/clearglass-main.js  (main process)
// v3.0.0
//
// v3 adds, all driven by real observed failures:
//   • ACCOUNTS per agent. Partition is per ACCOUNT
//     (persist:cg-<agent>-<accountId>), so two ChatGPT logins coexist
//     without touching each other. "Add another account" is just a new
//     accountId.
//   • STRICT login detection. v2 reported "signed in" whenever a
//     composer-ish element existed — which is why Claude showed signed
//     in while actually sitting on a Google sign-in page. Now requires
//     ALL of: URL on the agent's own host, URL not matching a known
//     login path, and a VISIBLE composer (offsetParent !== null).
//   • AUTO-HIDE on sign-in. After you open a window to log in, a
//     watcher polls; the moment login is real the window hides itself
//     and the renderer is notified.
//
// Model selection stays inside each agent's own web UI — native picker,
// always current, nothing for us to keep in sync.
//
// SELECTOR HONESTY: claude + chatgpt observed working against the live
// sites. perplexity/gemini remain UNVERIFIED — named failures, never
// silent hangs, and only the arrays below need editing.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// Electron is required lazily/guarded so this module can be imported in
// plain Node — cgUserscriptTargets is pure path logic and should not be
// hostage to a runtime dependency it does not use.
let BrowserWindow = null, ipcMain = null, app = null;
try { ({ BrowserWindow, ipcMain, app } = require('electron')); } catch (e) { /* non-Electron host */ }
const fs = require('fs');
const path = require('path');
const CFG = require('./clearglass-config');

const AGENTS = CFG.agents;


// ═══════════════════════════════════════════════════════════════════
// BAKED-IN BRIDGE
// Two halves, both automatic:
//   1. cgUserscriptTargets/cgInstallUserscript — finds a real
//      clear-glass-lite install and writes the bridge userscript into
//      its userscripts folder itself. No manual copy step.
//   2. _cgInjectHarness — every hosted agent window gets the same
//      capability injected on EVERY navigation, so the window is
//      self-sufficient rather than depending on an ask-time injection
//      that has to re-run and can race a page load.
// ═══════════════════════════════════════════════════════════════════

// Fuzzy scan: instead of only guessing exact folder names, actually look
// at what's really on disk under each likely parent and match anything
// that could plausibly be clear-glass-lite. Fixed-name guessing alone
// misses a real install with a version suffix, different casing, or a
// location not in the hardcoded list.
const CGL_NAME_RE = /clear.?glass.?lite/i;
function cgFuzzyFindRoots(parents) {
  const found = [];
  for (const parent of parents) {
    if (!parent) continue;
    let entries;
    try { entries = fs.readdirSync(parent, { withFileTypes: true }); }
    catch (e) { continue; }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (CGL_NAME_RE.test(ent.name)) found.push(path.join(parent, ent.name));
    }
  }
  return found;
}

// Pure: candidate clear-glass-lite userscript directories for a given
// environment. Separated out so path logic is testable without a
// filesystem — the part most likely to be wrong across machines.
//
// Base install-dir candidates for a clear-glass-lite install, before any
// subfolder is appended. Shared by cgUserscriptTargets (appends
// /userscripts) and cgDetectGuardianConfig (looks for a config file
// directly inside) — both are guessing at the same install, so they
// should guess at the same places, INCLUDING the fuzzy pass below (the
// guardian config gets the benefit of fuzzy matching too, not just the
// userscript folder).
function _cgLiteBaseDirs(env) {
  const e = env || {};
  const home = e.home || '';
  const appData = e.appData || (home ? path.join(home, 'AppData', 'Roaming') : '');
  const appDataLocal = home ? path.join(home, 'AppData', 'Local') : '';
  const out = [];
  const names = ['clear-glass-lite', 'ClearGlass Lite', 'clearglass-lite'];
  for (const n of names) {
    if (appData) out.push(path.join(appData, n));
    if (home) {
      out.push(path.join(home, '.config', n));
      out.push(path.join(home, 'Library', 'Application Support', n));
      out.push(path.join(home, n));
      out.push(path.join(home, 'Documents', n));
      out.push(path.join(home, 'Desktop', n));
    }
  }
  // Fuzzy pass — catches version-suffixed names, unexpected casing, and
  // installs never in the fixed-name list at all.
  const parents = [
    appData, appDataLocal,
    home ? path.join(home, '.config') : '',
    home ? path.join(home, 'Library', 'Application Support') : '',
    home, home ? path.join(home, 'Documents') : '', home ? path.join(home, 'Desktop') : '',
  ];
  for (const root of cgFuzzyFindRoots(parents)) out.push(root);
  return [...new Set(out)];
}

function cgUserscriptTargets(env) {
  const out = _cgLiteBaseDirs(env).map((d) => path.join(d, 'userscripts'));
  if (env && env.explicit) out.unshift(env.explicit);
  return [...new Set(out)];
}

// Best-effort auto-detect of guardian-lite's port + token, so a person
// never has to open clear-glass-lite's own settings, copy a token by
// hand, and paste it into Mastermind. HONEST LIMIT: clear-glass-lite is
// a separate app Mastermind doesn't control the source of, so this is a
// guess at plausible config filenames and key names sitting in the same
// install directories the userscript installer already searches — not a
// guaranteed integration. It fails by returning ok:false with what it
// tried, never by pretending success with a wrong value.
function cgDetectGuardianConfig(env, log) {
  const L = typeof log === 'function' ? log : () => {};
  const dirs = _cgLiteBaseDirs(env);
  const filenames = ['config.json', 'guardian-lite.json', 'guardian.json', 'settings.json', 'guardian-config.json'];
  const tokenKeys = ['token', 'authToken', 'guardianToken', 'apiToken', 'cglToken', 'X-CGL-Token'];
  const portKeys = ['port', 'guardianPort', 'serverPort', 'httpPort'];
  const tried = [];
  for (const dir of dirs) {
    for (const fn of filenames) {
      const p = path.join(dir, fn);
      tried.push(p);
      let raw;
      try { if (!fs.existsSync(p)) continue; raw = fs.readFileSync(p, 'utf8'); }
      catch (e) { continue; }
      let data;
      try { data = JSON.parse(raw); } catch (e) { continue; }
      const token = tokenKeys.map((k) => data[k]).find((v) => typeof v === 'string' && v.length > 0);
      const port = portKeys.map((k) => data[k]).find((v) => typeof v === 'number' && v > 0);
      if (token) {
        L('cg: guardian-lite config auto-detected at ' + p);
        return { ok: true, token, port: port || 7823, source: p };
      }
    }
  }
  return { ok: false, error: 'GUARDIAN_CONFIG_NOT_FOUND', tried };
}

function cgInstallUserscript(explicitDir, log) {
  const L = typeof log === 'function' ? log : () => {};
  // The script ships inside Mastermind — read it from our own app dir.
  const srcCandidates = [
    path.join(__dirname, '..', '..', 'integrations', 'clearglass', 'mastermind-ai-bridge.user.js'),
    path.join(process.resourcesPath || '', 'app', 'integrations', 'clearglass', 'mastermind-ai-bridge.user.js'),
  ];
  const src = srcCandidates.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
  if (!src) return { ok: false, error: 'BRIDGE_SOURCE_MISSING: mastermind-ai-bridge.user.js not found inside the app bundle' };
  let body;
  try { body = fs.readFileSync(src, 'utf8'); }
  catch (e) { return { ok: false, error: 'READ_FAILED: ' + e.message }; }

  const targets = cgUserscriptTargets({
    home: app?.getPath ? app.getPath('home') : process.env.HOME || process.env.USERPROFILE,
    appData: app?.getPath ? (() => { try { return app.getPath('appData'); } catch (e) { return null; } })() : null,
    explicit: explicitDir || null,
  });

  const installed = [], skipped = [];
  for (const dir of targets) {
    try {
      if (!fs.existsSync(dir)) {
        // The app root existing but 'userscripts' not yet is common —
        // most userscript managers create that subfolder lazily on
        // first use. Only treat it as truly missing if the parent (the
        // app's own folder) isn't there either.
        const parent = path.dirname(dir);
        if (fs.existsSync(parent)) {
          try { fs.mkdirSync(dir, { recursive: true }); }
          catch (e) { skipped.push({ dir, why: 'could not create: ' + e.message }); continue; }
        } else {
          skipped.push({ dir, why: 'no such folder' }); continue;
        }
      }
      const dest = path.join(dir, 'mastermind-ai-bridge.user.js');
      fs.writeFileSync(dest, body, 'utf8');
      // Remove the superseded ERAVOS bridge if it is sitting alongside —
      // two scripts polling the same tab fight over every request.
      const eravos = path.join(dir, 'eravos-ai-bridge.user.js');
      let removedEravos = false;
      try { if (fs.existsSync(eravos)) { fs.unlinkSync(eravos); removedEravos = true; } } catch (e) {}
      installed.push({ dir, removedEravos });
      L('cg: bridge userscript installed -> ' + dest + (removedEravos ? ' (removed eravos bridge)' : ''));
    } catch (e) {
      skipped.push({ dir, why: e.message });
    }
  }
  if (!installed.length) {
    return { ok: false, error: 'NO_INSTALL_TARGET: no clear-glass-lite userscripts folder found', searched: targets, skipped };
  }
  return { ok: true, installed, searched: targets };
}

// Injected into every hosted agent window on every navigation. This is
// the userscript's job, baked in: the window announces what it is and
// carries the same capture hooks, without a userscript manager.
function _cgHarness(agentKey, label) {
  return '(() => {' +
    'if (window.__MM_AGENT__ && window.__MM_AGENT__.agent === ' + JSON.stringify(agentKey) + ') return "already";' +
    'window.__MM_AGENT__ = { agent: ' + JSON.stringify(agentKey) + ', label: ' + JSON.stringify(label) + ', v: "3.0.0", installedAt: Date.now() };' +
    'return "installed";' +
  '})()';
}

function _cgInjectHarness(w, agentKey, label, L) {
  const doInject = () => {
    w.webContents.executeJavaScript(_cgHarness(agentKey, label), true)
      .then(r => { if (r === 'installed') L('cg: harness injected into ' + agentKey); })
      .catch(() => {});
  };
  w.webContents.on('did-finish-load', doInject);
  w.webContents.on('did-navigate-in-page', doInject);
  doInject();
}

const wins  = {};   // "agent::accountId" -> BrowserWindow
const busy  = {};   // same key -> bool (per account: different accounts run in parallel)
const watch = {};   // same key -> interval id (sign-in watcher)

const K = (agent, accountId) => agent + '::' + (accountId || 'default');

function cgAgentList() {
  return Object.keys(AGENTS).map(k => ({ key: k, label: AGENTS[k].label, verified: AGENTS[k].verified }));
}

// ROOT CAUSE, so this isn't touched by accident later: backgroundThrottling
// :false (below) only stops Chromium throttling this window's TIMERS while
// it's occluded/hidden. It does NOT change the Page Visibility API — a
// window built with show:false and never actually shown reports
// document.hidden === true to its own page, forever. ChatGPT/Claude's own
// client code can legitimately defer streaming/render work while their
// page believes it's backgrounded, regardless of any Electron-level timer
// setting. That is exactly what "Test only completes once you open it from
// the toast" was: opening it flips Page Visibility to 'visible' and the
// deferred work proceeds. Fix: never leave a window in the never-shown
// state, and never call .hide() (which flips Page Visibility back to
// hidden) — park it off-screen instead, which keeps it OS-realized and
// 'visible' while a person never sees it. See clearglass-config.js for the
// full writeup and the coordinates.
function _cgPark(w) {
  if (!w || w.isDestroyed()) return;
  try {
    w.setSkipTaskbar(true);
    w.setPosition(CFG.window.parkX, CFG.window.parkY);
    if (!w.isVisible()) w.showInactive();   // realized, but steals no OS focus
  } catch (e) {}
}

function _cgReveal(w) {
  if (!w || w.isDestroyed()) return;
  try {
    w.setSkipTaskbar(false);
    w.setPosition(CFG.window.revealX, CFG.window.revealY);
    w.show();
    w.focus();
  } catch (e) {}
}

function cgCreateWindow(agent, accountId, show) {
  const spec = AGENTS[agent];
  if (!spec) return null;
  const acct = accountId || 'default';
  const key = K(agent, acct);
  const existing = wins[key];
  if (existing && !existing.isDestroyed()) {
    if (show) _cgReveal(existing); else _cgPark(existing);
    return existing;
  }
  const w = new BrowserWindow({
    width: CFG.window.width, height: CFG.window.height,
    x: CFG.window.parkX, y: CFG.window.parkY,  // start off-display so the
    show: false,                                // first paint never flashes
    skipTaskbar: true,
    title: spec.label + (acct === 'default' ? '' : ' · ' + acct) + ' — Mastermind AI agent',
    webPreferences: {
      partition: 'persist:cg-' + agent + '-' + acct,  // isolated per ACCOUNT
      nodeIntegration: false,
      contextIsolation: true,
      // Stops Chromium throttling this window's timers while occluded —
      // real and needed (the ask script polls via setTimeout), but not
      // sufficient on its own. See the _cgPark comment above for the rest
      // of the story.
      backgroundThrottling: false,
    },
  });
  try { w.webContents.setBackgroundThrottling(false); } catch (e) {}
  w.loadURL(spec.url).catch(() => {});
  try { _cgInjectHarness(w, agent, spec.label, () => {}); }
  catch (e) { console.error('[cg] harness injection failed for', key, ':', e.message); }
  w.on('close', (e) => { if (!w._reallyClose) { e.preventDefault(); _cgPark(w); } });
  wins[key] = w;
  if (show) _cgReveal(w); else _cgPark(w);
  return w;
}

function cgDestroy() {
  for (const k in watch) { clearInterval(watch[k]); delete watch[k]; }
  for (const k in wins) {
    const w = wins[k];
    if (w && !w.isDestroyed()) { w._reallyClose = true; w.close(); }
    delete wins[k];
  }
}

// STRICT login probe. The v2 bug: any composer-ish element counted as
// "signed in", so a Google sign-in page (which has inputs) reported
// success. Require the URL to be on the agent's own host, NOT on a
// known login path, and the composer to be actually VISIBLE.
async function _probeLoggedIn(w, spec) {
  if (!w || w.isDestroyed()) return false;
  let url = '';
  try { url = w.webContents.getURL() || ''; } catch (e) { return false; }
  if (!url.includes(spec.host)) return false;                       // redirected to an SSO host
  if (spec.loginPaths.some(p => url.includes(p))) return false;      // sitting on a login page
  const probe = spec.composer.map(s => 'document.querySelector(' + JSON.stringify(s) + ')').join(' || ');
  try {
    return await w.webContents.executeJavaScript(
      '(() => { const el = (' + probe + '); return !!(el && el.offsetParent !== null); })()', true);
  } catch (e) { return false; }
}

// Watch a freshly-opened window and park it the instant login lands.
function _watchSignIn(agent, accountId, getMainWin, L) {
  const key = K(agent, accountId);
  if (watch[key]) return;
  const spec = AGENTS[agent];
  let ticks = 0;
  watch[key] = setInterval(async () => {
    const w = wins[key];
    if (!w || w.isDestroyed() || ++ticks > CFG.timing.signinWatchMaxTicks) {
      clearInterval(watch[key]); delete watch[key];
      if (w && !w.isDestroyed()) {
        // Previously silent: the watcher just stopped after ~10 minutes
        // with no log line and no signal to the renderer, so a stalled
        // sign-in looked identical to one still being worked on. Now it
        // says so, both in the log and to whoever's listening in the UI.
        L('cg: ' + key + ' sign-in watch gave up after ' + CFG.timing.signinWatchMaxTicks + ' checks — still not detected as signed in');
        try {
          const mw = typeof getMainWin === 'function' ? getMainWin() : null;
          if (mw && !mw.isDestroyed()) mw.webContents.send('cg:signin-timeout', { agent, accountId: accountId || 'default' });
        } catch (e) {}
      }
      return;
    }
    const ok = await _probeLoggedIn(w, spec);
    if (ok) {
      clearInterval(watch[key]); delete watch[key];
      _cgPark(w);
      L('cg: ' + key + ' signed in — window parked (still OS-visible, off-display)');
      try {
        const mw = typeof getMainWin === 'function' ? getMainWin() : null;
        if (mw && !mw.isDestroyed()) mw.webContents.send('cg:signed-in', { agent, accountId: accountId || 'default' });
      } catch (e) {}
    }
  }, CFG.timing.signinWatchIntervalMs);
}

function _askScript(spec, agentKey, promptJson, timeoutMs) {
  const sel = (arr) => JSON.stringify(arr);
  return '(async () => {\n' +
    '  const PROMPT = ' + promptJson + ';\n' +
    '  const pick = (list) => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };\n' +
    '  const composer = pick(' + sel(spec.composer) + ');\n' +
    '  if (!composer) return { ok: false, error: "NO_COMPOSER: no input box on ' + spec.label + ' — not signed in, or selectors need updating (clearglass-main.js AGENTS.' + agentKey + ')" };\n' +
    '  const BLOCKS = ' + sel(spec.blocks) + ';\n' +
    '  const countBlocks = () => { let n = 0; for (const s of BLOCKS) n += document.querySelectorAll(s).length; return n; };\n' +
    '  const lastBlockText = () => { let best = null; for (const s of BLOCKS) { const els = document.querySelectorAll(s); if (els.length) best = els[els.length - 1]; } return best ? (best.innerText || "").trim() : ""; };\n' +
    '  const pre = countBlocks();\n' +
    '  const readComposer = () => (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") ? composer.value : (composer.innerText || composer.textContent || "");\n' +
    '  try { composer.focus(); } catch (e) {}\n' +
    '  if (composer.tagName === "TEXTAREA" || composer.tagName === "INPUT") {\n' +
    '    const proto = composer.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;\n' +
    '    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;\n' +
    '    setter.call(composer, PROMPT);\n' +   // React-safe: bypasses the framework value tracker
    '    composer.dispatchEvent(new Event("input", { bubbles: true }));\n' +
    '  } else {\n' +
    '    let inserted = false;\n' +
    '    try { inserted = document.execCommand("insertText", false, PROMPT); } catch (e) { inserted = false; }\n' +
    '    if (!inserted || !readComposer().trim()) {\n' +
    '      // execCommand needs real document focus, which a hidden window\n' +
    '      // may not have. Fall back to direct DOM + a real InputEvent,\n' +
    '      // which contenteditable editors (ProseMirror etc) still sync from.\n' +
    '      composer.textContent = PROMPT;\n' +
    '      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: PROMPT }));\n' +
    '    }\n' +
    '    await new Promise(r => setTimeout(r, ' + CFG.timing.injectionRetryMs + '));\n' +
    '    if (!readComposer().trim()) {\n' +
    '      // Last resort: a real paste event. Editors whose own model\n' +
    '      // overwrites a direct textContent write on the next render tick\n' +
    '      // still generally handle paste through their own clipboard\n' +
    '      // handler, which threads content into the model correctly\n' +
    '      // instead of being silently reverted.\n' +
    '      try {\n' +
    '        const dt = new DataTransfer(); dt.setData("text/plain", PROMPT);\n' +
    '        composer.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));\n' +
    '      } catch (e) {}\n' +
    '    }\n' +
    '  }\n' +
    '  await new Promise(r => setTimeout(r, ' + CFG.timing.composeSettleMs + '));\n' +
    '  if (!readComposer().trim()) {\n' +
    '    await new Promise(r => setTimeout(r, ' + CFG.timing.injectionFinalRetryMs + '));   // one more beat — some editors settle late\n' +
    '  }\n' +
    '  if (!readComposer().trim()) return { ok: false, error: "TEXT_INJECTION_FAILED on ' + spec.label + ': the prompt never landed in the composer — selector may match a wrapper rather than the editable element" };\n' +
    '  const btn = pick(' + sel(spec.send) + ');\n' +
    '  if (btn && !btn.disabled) btn.click();\n' +
    '  else composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));\n' +
    '  await new Promise(r => setTimeout(r, ' + CFG.timing.postSendWaitMs + '));\n' +
    '  if (readComposer().trim() === PROMPT.trim()) return { ok: false, error: "SEND_FAILED on ' + spec.label + ': prompt still in the composer after send - the send-button selector is likely stale, or this is not the element the page submits from" };\n' +
    '  const deadline = Date.now() + ' + (Number(timeoutMs) || CFG.timing.defaultAskTimeoutMs) + ';\n' +
    '  let sawGenerating = false;\n' +
    '  let lastText = "", stableCount = 0;\n' +
    '  while (Date.now() < deadline) {\n' +
    '    const gen = pick(' + sel(spec.stop) + ');\n' +
    '    if (gen) sawGenerating = true;\n' +
    '    const text = countBlocks() > pre ? lastBlockText() : "";\n' +
    '    if (text && text === lastText) {\n' +
    '      stableCount++;\n' +
    '      // Fast path: we directly observed generation stop AND the text is\n' +
    '      // already stable — trust it immediately.\n' +
    '      if (sawGenerating && !gen) return { ok: true, text };\n' +
    '      // Fallback path: no reliable stop-button signal at all (selector\n' +
    '      // may be stale against the live site — this is what makes\n' +
    '      // completion detection work even when it is). Text that stopped\n' +
    '      // changing for several consecutive polls is trusted on its own.\n' +
    '      if (stableCount >= ' + CFG.timing.settleFallbackChecks + ') return { ok: true, text };\n' +
    '    } else {\n' +
    '      stableCount = 0; lastText = text;\n' +
    '    }\n' +
    '    await new Promise(r => setTimeout(r, ' + CFG.timing.askPollMs + '));\n' +
    '  }\n' +
    '  return { ok: false, error: (sawGenerating || lastText) ? "TIMEOUT_WAITING_REPLY on ' + spec.label + '" : "SEND_NEVER_STARTED on ' + spec.label + ': prompt may not have submitted — selectors likely stale" };\n' +
    '})()';
}

// Read-only progress check — no typing, no clicking, no side effects at
// all. Meant to be polled every few seconds WHILE a real cg:ask is in
// flight (a separate window instance query, not interleaved with the ask
// script itself) so the UI can show something better than a static
// spinner: whether the page looks signed in, whether it's currently
// generating, and a preview of whatever reply text exists so far.
function _peekScript(spec) {
  const sel = (arr) => JSON.stringify(arr);
  return '(() => {\n' +
    '  const pick = (list) => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };\n' +
    '  const BLOCKS = ' + sel(spec.blocks) + ';\n' +
    '  const lastBlockText = () => { let best = null; for (const s of BLOCKS) { const els = document.querySelectorAll(s); if (els.length) best = els[els.length - 1]; } return best ? (best.innerText || "").trim() : ""; };\n' +
    '  return {\n' +
    '    hasComposer: !!pick(' + sel(spec.composer) + '),\n' +
    '    generating: !!pick(' + sel(spec.stop) + '),\n' +
    '    preview: lastBlockText().slice(0, 200),\n' +
    '  };\n' +
    '})()';
}

function cgRegisterIpc(log, getMainWin) {
  if (!ipcMain) return false;   // not running under Electron
  const L = typeof log === 'function' ? log : () => {};

  ipcMain.handle('cg:agents', async () => cgAgentList());

  ipcMain.handle('cg:installUserscript', async (_e, o) => {
    return cgInstallUserscript(o && o.dir, L);
  });

  ipcMain.handle('cg:detectGuardian', async () => {
    return cgDetectGuardianConfig({
      home: app?.getPath ? app.getPath('home') : process.env.HOME || process.env.USERPROFILE,
      appData: app?.getPath ? (() => { try { return app.getPath('appData'); } catch (e) { return null; } })() : null,
    }, L);
  });

  ipcMain.handle('cg:status', async (_e, o) => {
    const agent = (o && o.agent) || 'chatgpt';
    const acct  = (o && o.accountId) || 'default';
    const spec = AGENTS[agent];
    if (!spec) return { ok: false, error: 'UNKNOWN_AGENT: ' + agent };
    const w = wins[K(agent, acct)];
    if (!w || w.isDestroyed()) return { agent, accountId: acct, running: false, busy: false, loggedIn: null };
    return {
      agent, accountId: acct,
      running: true,
      busy: !!busy[K(agent, acct)],
      loggedIn: await _probeLoggedIn(w, spec),
      url: w.webContents.getURL(),
    };
  });

  // Status for an explicit list of {agent, accountId} the renderer knows about.
  ipcMain.handle('cg:statusAll', async (_e, o) => {
    const list = (o && Array.isArray(o.accounts) && o.accounts.length)
      ? o.accounts
      : Object.keys(AGENTS).map(a => ({ agent: a, accountId: 'default' }));
    const out = [];
    for (const item of list) {
      const agent = item.agent, acct = item.accountId || 'default';
      const spec = AGENTS[agent];
      if (!spec) continue;
      const w = wins[K(agent, acct)];
      out.push({
        agent, accountId: acct,
        label: spec.label, verified: spec.verified,
        running: !!(w && !w.isDestroyed()),
        busy: !!busy[K(agent, acct)],
        loggedIn: (w && !w.isDestroyed()) ? await _probeLoggedIn(w, spec) : null,
      });
    }
    return out;
  });

  // "Add account" / "Open" — shows the window and starts the sign-in watcher
  // so it closes itself the moment login lands.
  ipcMain.handle('cg:open', async (_e, o) => {
    const agent = (o && o.agent) || 'chatgpt';
    const acct  = (o && o.accountId) || 'default';
    if (!AGENTS[agent]) return { ok: false, error: 'UNKNOWN_AGENT: ' + agent };
    cgCreateWindow(agent, acct, !(o && o.show === false));
    _watchSignIn(agent, acct, getMainWin, L);
    return { ok: true, agent, accountId: acct };
  });

  ipcMain.handle('cg:hide', async (_e, o) => {
    const w = wins[K((o && o.agent) || 'chatgpt', (o && o.accountId) || 'default')];
    if (w && !w.isDestroyed()) _cgPark(w);
    return { ok: true };
  });

  ipcMain.handle('cg:signOut', async (_e, o) => {
    const agent = (o && o.agent) || 'chatgpt';
    const acct  = (o && o.accountId) || 'default';
    const w = wins[K(agent, acct)];
    if (!w || w.isDestroyed()) return { ok: false, error: 'NOT_RUNNING' };
    try {
      await w.webContents.session.clearStorageData();
      w.loadURL(AGENTS[agent].url).catch(() => {});
      return { ok: true };
    } catch (e) { return { ok: false, error: 'CLEAR_FAILED: ' + e.message }; }
  });

  ipcMain.handle('cg:ask', async (_e, o) => {
    const opts = o || {};
    const agent = opts.agent || 'chatgpt';
    const acct  = opts.accountId || 'default';
    const spec = AGENTS[agent];
    const key = K(agent, acct);
    if (!spec) return { ok: false, error: 'UNKNOWN_AGENT: ' + agent };
    if (!opts.prompt || typeof opts.prompt !== 'string') return { ok: false, error: 'EMPTY_PROMPT' };
    if (busy[key]) return { ok: false, error: 'BUSY: ' + spec.label + ' (' + acct + ') already has a request in flight — one chat tab is serial; other accounts/agents are free' };
    busy[key] = true;
    try {
      const w = cgCreateWindow(agent, acct, false);
      // Reloading the agent's page before every single call was the
      // default here (opts.fresh !== false — true whenever a caller
      // doesn't specify, which is every caller except the one below).
      // That meant EVERY AI feature in the app — Node expand, Canvas
      // analysis, Horizon AI end-states, everything — re-navigated the
      // whole page from scratch on every request: full nav overhead,
      // conversation context discarded, and any first-load-only UI
      // (cookie banners, etc) re-triggered every time, any of which can
      // silently break the composer/send flow if it overlaps them.
      // Default now reuses the window's current state; a caller (Test,
      // below) opts IN when a clean page genuinely matters.
      const wantFresh = opts.fresh === true;
      if (wantFresh || w.webContents.isLoading()) {
        await new Promise((resolve) => {
          const done = () => resolve();
          w.webContents.once('did-finish-load', done);
          if (wantFresh) w.loadURL(spec.url).catch(() => done());
          setTimeout(done, CFG.timing.loadTimeoutMs);
        });
        await new Promise(r => setTimeout(r, CFG.timing.postLoadSettleMs));
      }
      try { w.webContents.focus(); } catch (e) {}  // helps execCommand even while hidden
      const result = await w.webContents.executeJavaScript(_askScript(spec, agent, JSON.stringify(opts.prompt), opts.timeoutMs), true);
      L('cg:ask[' + key + '] ' + (result && result.ok ? 'ok ' + (result.text || '').length + ' chars' : 'fail ' + (result && result.error)));
      return result || { ok: false, error: 'NO_RESULT' };
    } catch (e) {
      L('cg:ask[' + key + '] threw: ' + e.message);
      return { ok: false, error: 'EXEC_FAILED: ' + e.message };
    } finally {
      busy[key] = false;
    }
  });
  ipcMain.handle('cg:peek', async (_e, o) => {
    const opts = o || {};
    const agent = opts.agent || 'chatgpt';
    const acct  = opts.accountId || 'default';
    const spec = AGENTS[agent];
    if (!spec) return { ok: false, error: 'UNKNOWN_AGENT: ' + agent };
    const w = wins[K(agent, acct)];
    if (!w || w.isDestroyed()) return { ok: false, error: 'NO_WINDOW' };
    try {
      const result = await w.webContents.executeJavaScript(_peekScript(spec), true);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: 'PEEK_FAILED: ' + e.message };
    }
  });
}

module.exports = { cgCreateWindow, cgDestroy, cgRegisterIpc, cgAgentList, cgUserscriptTargets, cgInstallUserscript, cgDetectGuardianConfig, AGENTS };
