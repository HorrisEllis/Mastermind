// ==UserScript==
// @name        Mastermind AI Bridge
// @match       https://claude.ai/*
// @match       https://chatgpt.com/*
// @match       https://www.perplexity.ai/*
// @match       https://gemini.google.com/*
// @grant       GM_xmlhttpRequest
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       unsafeWindow
// @connect     127.0.0.1
// @connect     localhost
// @run-at      document-idle
// @enabled     true
// ==/UserScript==

// ═══════════════════════════════════════════════════════════════════
// MASTERMIND AI BRIDGE — replaces eravos-ai-bridge.user.js
//
// Written against the CORS/CSP-hardened clear-glass-lite build
// (2026-07-24). Polls guardian-lite for pending Mastermind requests,
// drives whichever signed-in AI tab this is running in, relays the
// answer back.
//
// WHAT CHANGED vs the old Mastermind bridge, and why it matters:
//   • window.__CGL_BRIDGE__ — clear-glass-lite injects the CURRENT
//     guardian-lite origin and the real per-install auth token before
//     the GM shim on every page load. The old script hardcoded
//     http://127.0.0.1:7823 with no token, which broke silently if the
//     port was ever changed in Options and, server-side, was
//     indistinguishable from any other process on the machine.
//   • Every call past /health now needs the X-CGL-Token header —
//     guardian-lite's wildcard CORS is gone and the token is real
//     access control, not decoration. No token = 401, by design.
//   • If __CGL_BRIDGE__ is absent we fail LOUDLY once instead of
//     hammering a dead or unauthenticated endpoint every 3 seconds.
//
//   • CORS + CSP, dealt with at the right layer (2026-07-25 pass):
//     guardian-lite's server-side origin allowlist + Access-Control-
//     Allow-Private-Network only solves HALF the problem. This script
//     runs INSIDE claude.ai / chatgpt.com / perplexity.ai / gemini.google.com
//     — pages that ship their own strict Content-Security-Policy. A
//     plain page-context fetch('http://127.0.0.1:PORT/...') is not a
//     CORS failure at all, it's a CSP `connect-src` violation: the
//     browser blocks the request before it ever leaves the tab,
//     because those hosts' CSP does not (and should not) allowlist a
//     loopback address. No server-side header can fix that; it has
//     to be fixed on this side, in how the request is made.
//     The old script also declared zero @grant lines while calling
//     GM_getValue/GM_setValue — those silently evaluated to undefined
//     and the surrounding try/catch swallowed it, so persistence quietly
//     never worked and nobody was told.
//     Fix: @grant GM_xmlhttpRequest + @connect 127.0.0.1 / localhost.
//     GM_xmlhttpRequest is dispatched by the userscript manager itself,
//     outside the page's script/network sandbox — it is not subject to
//     the page's CSP connect-src, and it is not a browser CORS request
//     either (no Origin-based preflight the page enforces), so it is
//     the correct tool for "talk to localhost from inside a hardened
//     third-party page," not a workaround. The X-CGL-Token header is
//     still sent explicitly on every call — GM_xmlhttpRequest bypassing
//     the page's CSP does not mean guardian-lite's own auth is skipped.
//     @connect entries are required by Tampermonkey/Violentmonkey for
//     GM_xmlhttpRequest to reach a host without an interactive consent
//     prompt per-domain; they match by hostname, not port, so the
//     configurable guardian-lite port doesn't need its own entry.
//
// MULTI-AGENT: @match now covers ChatGPT, Perplexity and Gemini as well
// as Claude, and each tab reports which host it is, so Mastermind can
// target a specific agent through the same relay. Selectors are per
// host below.
//
// HONEST GAP — READ THIS FIRST: the DOM selectors are the single most
// likely thing to break. Claude's are the only ones confirmed against
// the live site; ChatGPT/Perplexity/Gemini are best-known guesses. Every
// selector attempt is wrapped so a wrong guess logs clearly instead of
// failing silently. If requests time out, open DevTools on the real tab
// and check these first.
//
// NOTE: Mastermind's PRIMARY path no longer needs this script at all —
// ClearGlass is baked into Mastermind's own Electron process
// (foundation/ai/clearglass-main.js), which hosts the AI windows
// directly. This bridge is the fallback for browser-mode Mastermind, or
// for driving a tab inside a separately-running clear-glass-lite.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // Prefer unsafeWindow: with @grant set, Tampermonkey/Violentmonkey run
  // this script in a sandboxed scope where plain `window` is a proxy that
  // does not reliably reflect non-standard properties the page injected
  // (like __CGL_BRIDGE__). unsafeWindow is the real page window. Fall
  // back to window for managers that alias the two.
  const pageWindow = (typeof unsafeWindow !== 'undefined' && unsafeWindow) ? unsafeWindow : window;

  const bridge = pageWindow.__CGL_BRIDGE__;
  if (!bridge || !bridge.origin) {
    console.error('[mastermind-ai-bridge] window.__CGL_BRIDGE__ is missing — guardian-lite is probably not running, or this is an older clear-glass-lite build that does not inject it. Not starting the poll loop.');
    return;
  }
  const BASE  = bridge.origin;
  const TOKEN = bridge.token || null;
  if (!TOKEN) {
    console.warn('[mastermind-ai-bridge] no auth token in __CGL_BRIDGE__ — guardian-lite will reject every call past /health unless it was started without a token.');
  }
  if (typeof GM_xmlhttpRequest !== 'function') {
    console.error('[mastermind-ai-bridge] GM_xmlhttpRequest is not available — check the userscript manager granted @grant GM_xmlhttpRequest and @connect 127.0.0.1 / localhost. Falling back to page-context fetch(), which ' + location.hostname + '\u2019s CSP will most likely block.');
  }

  const REQUEST_TABLE  = 'mastermind-requests';
  const RESPONSE_TABLE = 'mastermind-responses';
  const POLL_MS = 3000;
  const SETTLE_CHECKS = 3;          // unchanged reads before a reply counts as finished streaming
  const SETTLE_INTERVAL_MS = 1000;
  const MAX_WAIT_MS = 75000;
  const HTTP_TIMEOUT_MS = 20000;

  // Which agent is this tab? Lets one script serve every provider and
  // lets Mastermind address a specific one.
  const HOSTS = [
    { key: 'claude',     test: /claude\.ai$/,        verified: true,
      composer: ['div[contenteditable="true"][class*="ProseMirror"]', 'div[contenteditable="true"]', 'textarea'],
      send:     ['button[aria-label*="Send" i]', 'button[type="submit"]'],
      stop:     ['button[aria-label*="Stop" i]'],
      blocks:   ['[data-testid="conversation-turn"]', '.font-claude-message'] },
    { key: 'chatgpt',    test: /chatgpt\.com$/,      verified: false,
      composer: ['#prompt-textarea[contenteditable="true"]', 'textarea#prompt-textarea', 'div[contenteditable="true"]', 'textarea'],
      send:     ['button[data-testid="send-button"]', 'button[aria-label*="Send" i]'],
      stop:     ['button[data-testid="stop-button"]', 'button[aria-label*="Stop" i]'],
      blocks:   ['[data-message-author-role="assistant"]', 'div.markdown'] },
    { key: 'perplexity', test: /perplexity\.ai$/,    verified: false,
      composer: ['textarea[placeholder*="Ask" i]', 'div[contenteditable="true"]', 'textarea'],
      send:     ['button[aria-label*="Submit" i]', 'button[type="submit"]'],
      stop:     ['button[aria-label*="Stop" i]'],
      blocks:   ['[class*="prose"]', '[data-testid="answer"]'] },
    { key: 'gemini',     test: /gemini\.google\.com$/, verified: false,
      composer: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]', 'div[contenteditable="true"]'],
      send:     ['button[aria-label*="Send" i]', 'button.send-button'],
      stop:     ['button[aria-label*="Stop" i]'],
      blocks:   ['message-content', '.model-response-text'] },
  ];
  const HOST = HOSTS.find(h => h.test.test(location.hostname));
  if (!HOST) {
    console.warn('[mastermind-ai-bridge] not a recognised AI host:', location.hostname);
    return;
  }
  if (!HOST.verified) {
    console.warn('[mastermind-ai-bridge] selectors for', HOST.key, 'are UNVERIFIED against the live site — if requests time out, check them first.');
  }

  const PROCESSED_KEY = 'mastermind_ai_bridge_processed_ids';
  let processedIds;
  try { processedIds = new Set(JSON.parse(GM_getValue(PROCESSED_KEY, '[]'))); }
  catch (e) { processedIds = new Set(); }

  function rememberProcessed(id) {
    processedIds.add(id);
    // Bounded — this list would otherwise grow forever in GM storage.
    const arr = [...processedIds].slice(-500);
    processedIds = new Set(arr);
    try { GM_setValue(PROCESSED_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  // Thin promise wrapper around GM_xmlhttpRequest — the network layer
  // that actually clears both CORS and CSP from inside a hardened page.
  // Falls back to fetch() only if the userscript manager genuinely has
  // no GM_xmlhttpRequest (misconfigured @grant); that path is expected
  // to fail on CSP-strict hosts and says so loudly rather than retrying
  // silently forever.
  function rawRequest(method, url, headers, body) {
    if (typeof GM_xmlhttpRequest === 'function') {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method, url, headers, data: body, timeout: HTTP_TIMEOUT_MS,
          onload: (res) => resolve({ status: res.status, text: res.responseText }),
          onerror: () => reject(new Error('network error contacting ' + url + ' (guardian-lite unreachable, or blocked by @connect allowlist)')),
          ontimeout: () => reject(new Error('timed out contacting ' + url)),
        });
      });
    }
    return fetch(url, { method, headers, body }).then(async (res) => ({ status: res.status, text: await res.text() }));
  }

  // Every call carries the token. Fails loudly rather than silently.
  async function api(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['X-CGL-Token'] = TOKEN;
    const res = await rawRequest(method, BASE + path, headers, body ? JSON.stringify(body) : undefined);
    if (res.status === 401 || res.status === 403) {
      throw new Error('guardian-lite rejected the token (' + res.status + ') — the injected __CGL_BRIDGE__ token does not match the running instance');
    }
    if (res.status < 200 || res.status >= 300) throw new Error('guardian-lite ' + method + ' ' + path + ' -> ' + res.status);
    try { return res.text ? JSON.parse(res.text) : null; } catch (e) { return null; }
  }

  const pick = (list) => { for (const s of list) { const el = document.querySelector(s); if (el) return el; } return null; };

  function setComposerText(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);   // React-safe: bypasses the framework's value tracker
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      let ok = false;
      try { ok = document.execCommand('insertText', false, text); } catch (e) { ok = false; }
      if (!ok || !(el.innerText || '').trim()) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      }
    }
  }

  const countBlocks = () => HOST.blocks.reduce((n, s) => n + document.querySelectorAll(s).length, 0);
  function lastBlockText() {
    let best = null;
    for (const s of HOST.blocks) { const els = document.querySelectorAll(s); if (els.length) best = els[els.length - 1]; }
    return best ? (best.innerText || '').trim() : '';
  }

  // Wait for the reply to stop growing — "the stop button vanished" alone
  // races the last streamed token.
  async function awaitReply(preCount) {
    const deadline = Date.now() + MAX_WAIT_MS;
    let stable = 0, lastText = '';
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, SETTLE_INTERVAL_MS));
      const generating = pick(HOST.stop);
      const text = countBlocks() > preCount ? lastBlockText() : '';
      if (!generating && text && text === lastText) {
        if (++stable >= SETTLE_CHECKS) return text;
      } else {
        stable = 0;
        lastText = text;
      }
    }
    return null;
  }

  async function handleRequest(row) {
    const id = row.id || row.requestId;
    if (!id || processedIds.has(id)) return;
    // Only answer requests aimed at this agent (or unaddressed ones).
    if (row.agent && row.agent !== HOST.key) return;
    rememberProcessed(id);

    const prompt = [row.system, row.prompt || row.message].filter(Boolean).join('\n\n');
    if (!prompt) return;

    const composer = pick(HOST.composer);
    if (!composer) {
      console.error('[mastermind-ai-bridge] NO_COMPOSER on', HOST.key, '— not signed in, or selectors are stale.');
      await api('POST', '/ingest', { table: RESPONSE_TABLE, requestId: id, agent: HOST.key, ok: false,
        error: 'NO_COMPOSER on ' + HOST.key + ' — not signed in, or selectors stale', ts: Date.now() });
      return;
    }

    const pre = countBlocks();
    setComposerText(composer, prompt);
    await new Promise(r => setTimeout(r, 400));
    const btn = pick(HOST.send);
    if (btn && !btn.disabled) btn.click();
    else composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));

    const reply = await awaitReply(pre);
    await api('POST', '/ingest', {
      table: RESPONSE_TABLE, requestId: id, agent: HOST.key,
      ok: !!reply, text: reply || '', error: reply ? null : 'TIMEOUT_WAITING_REPLY on ' + HOST.key,
      ts: Date.now(),
    });
    // Clear the request so no other tab picks it up again.
    try { await api('DELETE', '/artifacts/' + encodeURIComponent(id) + '?table=' + REQUEST_TABLE); } catch (e) {}
  }

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const res = await api('GET', '/query?table=' + REQUEST_TABLE + '&limit=5');
      const rows = Array.isArray(res) ? res : (res && res.rows) || [];
      for (const row of rows) {
        try { await handleRequest(row); }
        catch (e) { console.error('[mastermind-ai-bridge] request failed:', e.message); }
      }
    } catch (e) {
      console.error('[mastermind-ai-bridge] poll failed:', e.message);
    } finally {
      polling = false;
    }
  }

  setInterval(poll, POLL_MS);
  poll();
  console.log('[mastermind-ai-bridge] loaded for', HOST.key, '— polling', BASE + '/query?table=' + REQUEST_TABLE, 'every', POLL_MS + 'ms',
    TOKEN ? '(token present)' : '(NO TOKEN)', typeof GM_xmlhttpRequest === 'function' ? '(GM_xmlhttpRequest)' : '(fetch fallback — CSP risk)');
})();
