// ═══════════════════════════════════════════════════════════════════
// CLEARGLASS TRANSPORT — foundation/ai/clearglass-transport.js
// v1.0.0
//
// Built against the real clear-glass-lite-6.zip source, specifically
// interaction-contract.json + guardian-lite/server.js + userscripts.js.
// Not guessed — every endpoint and shape here matches that contract.
//
// The important thing this file is NOT: ClearGlass Lite has no endpoint
// that takes a prompt and returns a completion. There's no public API
// for Claude/ChatGPT/Gemini a third party can call directly — that's
// the whole reason ClearGlass exists (a real browser window + a real
// logged-in session + userscript DOM automation). So this transport:
//
//   1. POSTs the request to guardian-lite's real /ingest endpoint,
//      table 'mastermind-requests' — completely generic, guardian-lite
//      has no fixed schema beyond "a table name and a JSON object."
//   2. Polls guardian-lite's real /query endpoint for a matching row in
//      'mastermind-responses', until the bridge userscript (running
//      inside the actual Claude tab ClearGlass opened) posts one.
//
// The bridge userscript itself lives in
// integrations/clearglass/mastermind-ai-bridge.user.js — it has to be
// manually copied into ClearGlass Lite's userscripts folder, since
// Mastermind has no way to write files into a separate app's data
// directory. See that file's own header for what it does and the one
// genuinely uncertain part (Claude's DOM selectors).
// ═══════════════════════════════════════════════════════════════════

'use strict';

// §CORS+CSP HARDENING (clear-glass-lite 2026-07-24): guardian-lite's
// wildcard CORS is gone and every route past /health now requires the
// shared X-CGL-Token header. Port and token are configurable because a
// hardcoded origin silently breaks the moment either changes.
function cgBase() {
  const port = (typeof AI !== 'undefined' && AI.guardianPort) || 7823;
  return 'http://127.0.0.1:' + port;
}
function cgHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const tok = (typeof AI !== 'undefined' && AI.guardianToken) || '';
  if (tok) h['X-CGL-Token'] = tok;   // real access control now, not decoration
  return h;
}

async function clearglassHealthCheck() {
  // Baked-in path first: alive = ClearGlass window exists AND is logged
  // in (composer present). Not just "window open" — an open login page
  // reporting healthy is exactly the false-positive that wastes a call.
  if (window.NXAPI?.cgStatus) {
    try {
      const agent = cgResolveAgent();
      const s = await window.NXAPI.cgStatus(agent, cgResolveAccount(agent));
      if (!s.running) { await window.NXAPI.cgOpen(agent, cgResolveAccount(agent), false); return false; } // spin it up hidden; not ready yet this tick
      return s.loggedIn === true;
    } catch (e) { return false; }
  }
  try {
    const res = await fetch(cgBase() + '/health', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch (e) {
    return false; // guardian-lite not running, or ClearGlass Lite isn't open
  }
}

async function clearglassCall(systemPrompt, userMessage, opts = {}) {
  const timeoutMs = opts.timeoutMs || 90000;

  // ── Preferred path: ClearGlass baked into Electron ────────────────
  // Mastermind's own main process hosts claude.ai in a persistent-
  // session BrowserWindow and injects the bridge logic directly
  // (foundation/ai/clearglass-main.js). One IPC hop, no relay server,
  // no userscript, no polling. The HTTP path below survives only as
  // the browser-mode fallback where NXAPI doesn't exist.
  if (window.NXAPI?.cgAsk) {
    const agent = opts.agent || cgResolveAgent();
    const prompt = (systemPrompt ? systemPrompt + '\n\n' : '') + (userMessage || '');
    const account = opts.accountId || cgResolveAccount(agent);
    // Status chip wraps EVERY agent call here, so no caller can forget it
    // and no request can run invisibly for 90 seconds.
    const _sid = typeof aiStatusStart === 'function'
      ? aiStatusStart(opts.label || 'AI request', { agent, account }) : null;
    // Live progress: a read-only peek at the page every few seconds
    // while we wait, so the status chip shows real proof something is
    // happening (a growing reply preview, or "still generating") instead
    // of a spinner that looks identical whether it's working or stuck.
    let _peekTimer = null;
    if (_sid && window.NXAPI?.cgPeek) {
      _peekTimer = setInterval(async () => {
        try {
          const p = await window.NXAPI.cgPeek(agent, account);
          if (p && p.ok && typeof aiStatusUpdate === 'function') {
            aiStatusUpdate(_sid, { preview: p.preview, generating: p.generating });
          }
        } catch (e) { /* a failed peek just means no update this tick, not a real error */ }
      }, 3000);
    }
    let res;
    try {
      res = await window.NXAPI.cgAsk(agent, account, prompt, timeoutMs, opts.fresh);
    } catch (e) {
      if (_sid) aiStatusEnd(_sid, false, e.message);
      throw e;
    } finally {
      if (_peekTimer) clearInterval(_peekTimer);
    }
    if (_sid) aiStatusEnd(_sid, !!(res && res.ok), res && res.error);
    if (res && res.ok) {
      // Every exchange enters the lattice. This was previously discarded
      // outright, despite being the densest, most deliberate text the
      // app ever sees.
      if (typeof mmCaptureExchange === 'function' && opts.capture !== false) {
        try { mmCaptureExchange(prompt, res.text || '', { agent, account }); } catch (e) {}
      }
      return res.text || '';
    }
    const err = (res && res.error) || 'unknown error';
    if (err.startsWith('NO_COMPOSER')) {
      throw new Error('Not signed in to ' + (CG_AGENT_LABELS[agent] || agent) + ' — Options → AI → Add account, sign in once, then retry.');
    }
    throw new Error(err);
  }

  // ── Fallback: legacy HTTP relay (browser mode only) ───────────────
  const requestId = 'mm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pollMs = opts.pollMs || 1500;

  const alive = await clearglassHealthCheck();
  if (!alive) {
    throw new Error('ClearGlass Lite not reachable at ' + cgBase() + ' — is guardian-lite running? (Options → AI → guardian-lite port)');
  }

  const ingestRes = await fetch(cgBase() + '/ingest', {
    method: 'POST',
    headers: cgHeaders(),
    body: JSON.stringify({
      table: 'mastermind-requests',
      requestId,
      agent: opts.agent || (typeof cgResolveAgent === 'function' ? cgResolveAgent() : 'claude'),
      system: systemPrompt || '',
      prompt: userMessage || '',
      ts: Date.now(),
    }),
  });
  if (ingestRes.status === 401 || ingestRes.status === 403) {
    throw new Error('guardian-lite rejected the auth token — paste the current token into Options → AI (guardian-lite writes it on first run; see clear-glass-lite config.js ensureGuardianToken)');
  }
  if (!ingestRes.ok) {
    throw new Error('guardian-lite refused the request (HTTP ' + ingestRes.status + ')');
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, pollMs));
    try {
      const q = await fetch(cgBase() + '/query?table=mastermind-responses&requestId=' + encodeURIComponent(requestId) + '&limit=1',
        { headers: cgHeaders() });
      if (!q.ok) continue;
      const data = await q.json();
      const rows = Array.isArray(data) ? data : (data && data.rows) || [];
      if (rows.length) {
        const row = rows[0];
        // Clean up so a stale reply can never satisfy a later request.
        try { await fetch(cgBase() + '/artifacts/' + encodeURIComponent(row.id || requestId) + '?table=mastermind-responses', { method: 'DELETE', headers: cgHeaders() }); } catch (e) {}
        if (row.ok === false) throw new Error(row.error || 'bridge reported failure');
        if (typeof mmCaptureExchange === 'function' && opts.capture !== false) {
          try { mmCaptureExchange((systemPrompt ? systemPrompt + '\n\n' : '') + (userMessage || ''), row.text || '', { agent: opts.agent || 'relay', account: 'relay' }); } catch (e) {}
        }
        return row.text || '';
      }
    } catch (e) {
      if (/bridge reported failure|NO_COMPOSER|TIMEOUT_WAITING/.test(e.message)) throw e;
      // otherwise transient — keep polling until the deadline
    }
  }

  throw new Error('ClearGlass timed out waiting for a reply — is the Mastermind bridge userscript active in an AI tab? (integrations/clearglass/mastermind-ai-bridge.user.js, installed in clear-glass-lite\u2019s userscripts folder)');
}


// ── Agent resolution ───────────────────────────────────────────────
// AI.provider carries the chosen web agent directly ('chatgpt',
// 'claude', 'perplexity', 'gemini'). 'clearglass' is the legacy value
// from before multi-agent support and maps to Claude so existing saved
// configs keep working instead of silently breaking.
const CG_WEB_AGENTS  = ['chatgpt', 'claude', 'perplexity', 'gemini'];
const CG_AGENT_LABELS = { chatgpt: 'ChatGPT', claude: 'Claude', perplexity: 'Perplexity', gemini: 'Gemini' };

function cgIsWebAgent(provider) {
  return CG_WEB_AGENTS.includes(provider) || provider === 'clearglass';
}
function cgResolveAgent() {
  const p = (typeof AI !== 'undefined' && AI.provider) || 'chatgpt';
  if (p === 'clearglass') return 'claude';
  return CG_WEB_AGENTS.includes(p) ? p : 'chatgpt';
}

// Active account for an agent. AI.accounts maps agent -> [accountId...];
// AI.account holds the one currently selected for the active provider.
function cgResolveAccount(agent) {
  if (typeof AI === 'undefined') return 'default';
  if (agent === cgResolveAgent() && AI.account) return AI.account;
  const list = (AI.accounts && AI.accounts[agent]) || ['default'];
  return list[0] || 'default';
}
window.cgResolveAccount = cgResolveAccount;
window.cgIsWebAgent = cgIsWebAgent;
window.cgResolveAgent = cgResolveAgent;
window.CG_WEB_AGENTS = CG_WEB_AGENTS;
window.CG_AGENT_LABELS = CG_AGENT_LABELS;

window.clearglassHealthCheck = clearglassHealthCheck;
window.clearglassCall = clearglassCall;
