// ==UserScript==
// @name         BDA — Behavioral Drift Analyzer [Phase 3: Navigation]
// @namespace    rheon.world/bda
// @version      3.0.0
// @description  Phase 3: SPA navigation detection, observer reattach, content-hash dedup across conversations.
// @author       James Brooks
// @match        https://claude.ai/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

/**
 * PHASE 3 SCOPE — builds on phase 2, adds:
 * ──────────────────────────────────────────
 * - SPA navigation detection (popstate + URL polling)
 * - Observer reattach on navigation
 * - Content-hash dedup: FNV-32 hash of (role + text) so the same message
 *   is never sent twice even if the DOM element is new (post-navigation)
 * - Per-conversation session tracking in HUD
 * - HUD shows current conversationId parsed from URL
 *
 * NOT IN THIS PHASE: Phase 4 hardens all edge cases and adds selector
 * diagnostics panel in the expanded HUD.
 *
 * DRIFT ACCOUNTING FOR NAVIGATION:
 * - claude.ai is a React SPA. Navigation does not reload the page.
 * - URL changes: /chat → /chat/<id> or between <id>s.
 * - popstate fires on browser back/forward but NOT on React router pushState.
 * - Solution: poll URL every 1s AND listen to popstate. Cheap, reliable.
 * - On navigation: reset _seen WeakSet (DOM is new), reattach observer,
 *   log new conversationId. Content-hash Set persists across navigations
 *   to prevent re-sending messages visible in both old and new DOM snapshots.
 */

(function () {
  'use strict';

  const KERNEL = 'http://localhost:7821';
  const TAG    = '[BDA p3]';

  // ── Regime colors ──────────────────────────────────────────────────────────
  const REGIME_COLOR = {
    STABLE:       { bg: '#E1F5EE', text: '#085041', dot: '#1D9E75' },
    ACTIVATING:   { bg: '#EAF3DE', text: '#27500A', dot: '#639922' },
    OSCILLATING:  { bg: '#FAEEDA', text: '#633806', dot: '#EF9F27' },
    UNGROUNDED:   { bg: '#FAECE7', text: '#4A1B0C', dot: '#D85A30' },
    DYSREGULATED: { bg: '#FCEBEB', text: '#501313', dot: '#E24B4A' },
    COLLAPSING:   { bg: '#F7C1C1', text: '#501313', dot: '#E24B4A' },
    UNKNOWN:      { bg: '#F1EFE8', text: '#5F5E5A', dot: '#888780' },
  };

  // ── State ──────────────────────────────────────────────────────────────────
  const _s = {
    phase:          3,
    connected:      false,
    retryCount:     0,
    user:           { regime: 'UNKNOWN', sigma: null, delta: null, n: 0 },
    assistant:      { regime: 'UNKNOWN', sigma: null, delta: null, n: 0 },
    composite:      { regime: 'UNKNOWN', sigma: null },
    lastGaps:       [],
    ledgerCount:    0,
    expanded:       false,
    captured:       { user: 0, assistant: 0 },
    queueSize:      0,
    conversationId: null,    // parsed from URL
    navCount:       0,       // how many navigations detected this session
  };

  let _sse       = null;
  let _retryTimer = null;

  // ── Observation queue (same as p2) ─────────────────────────────────────────
  const _queue   = [];
  const QUEUE_MAX = 100;

  function enqueue(obs) {
    if (_queue.length >= QUEUE_MAX) {
      console.warn(`${TAG} queue full, dropping oldest`);
      _queue.shift();
    }
    _queue.push(obs);
    _s.queueSize = _queue.length;
    renderHUD();
  }

  function drainQueue() {
    if (!_queue.length) return;
    console.log(`${TAG} draining ${_queue.length} queued observations`);
    const batch = _queue.splice(0);
    _s.queueSize = 0;
    for (const obs of batch) _sendObservation(obs, true);
  }

  // ── Content-hash dedup ─────────────────────────────────────────────────────
  // FNV-32a over "role:text" — fast, no crypto dependency, good distribution.
  // Persists across navigation — same message in a new DOM won't re-send.
  // Bounded at 2000 hashes (old conversations fade from set).

  const _hashes  = new Set();
  const HASH_MAX = 2000;

  function fnv32a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  function isDuplicate(role, text) {
    // Hash first 300 chars — enough to distinguish, fast enough to run per-scan
    const key = fnv32a(`${role}:${text.slice(0, 300)}`);
    if (_hashes.has(key)) return true;
    // Evict oldest entries if over limit (Set preserves insertion order)
    if (_hashes.size >= HASH_MAX) {
      const [first] = _hashes;
      _hashes.delete(first);
    }
    _hashes.add(key);
    return false;
  }

  // ── Selectors (same as p2) ─────────────────────────────────────────────────
  const USER_SELECTORS = [
    '[data-testid="user-message"]',
    '[data-testid="human-turn"]',
    '.human-turn',
    '[class*="HumanTurn"]',
  ];

  const ASST_SELECTORS = [
    '[data-testid="assistant-message"]',
    '[data-testid="assistant-turn"]',
    '.assistant-turn',
    '[class*="AssistantTurn"]',
    'article[data-is-streaming="false"]',
  ];

  const _selectorHits = new Map();
  [...USER_SELECTORS, ...ASST_SELECTORS].forEach(s => _selectorHits.set(s, 0));

  function isStreaming(el) {
    if (el.dataset?.isStreaming === 'true') return true;
    if (el.getAttribute('aria-busy') === 'true') return true;
    if (el.querySelector('[role="status"]')) return true;
    if (el.querySelector('[data-testid="streaming-indicator"]')) return true;
    return false;
  }

  // ── WeakSet dedup (per-session DOM element dedup) ──────────────────────────
  // Reset on navigation — DOM is new, elements are new.
  // Content-hash dedup above catches cross-navigation duplicates.
  let _seen = new WeakSet();

  // ── Scan ──────────────────────────────────────────────────────────────────

  function scanMessages() {
    scanRole('user', USER_SELECTORS);
    scanRole('assistant', ASST_SELECTORS);
  }

  function scanRole(role, selectors) {
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (el.closest('#bda-hud')) continue;
        if (_seen.has(el)) continue;
        if (role === 'assistant' && isStreaming(el)) continue;

        const text = el.innerText?.trim();
        if (!text || text.length < 3) continue;

        // Content-hash dedup — survives navigation
        if (isDuplicate(role, text)) {
          _seen.add(el); // mark element even though we skip — it's been sent before
          continue;
        }

        _seen.add(el);
        _selectorHits.set(sel, (_selectorHits.get(sel) ?? 0) + 1);
        console.log(`${TAG} captured ${role} [conv:${_s.conversationId ?? 'unknown'}] via "${sel}" — ${text.length} chars`);

        _s.captured[role]++;
        renderHUD();
        postObservation({ role, text, ts: Date.now(), conversationId: _s.conversationId });
      }
    }
  }

  // ── POST /observe ──────────────────────────────────────────────────────────

  function postObservation(obs) {
    if (!_s.connected) {
      console.log(`${TAG} offline — queuing ${obs.role} (queue: ${_queue.length + 1})`);
      enqueue(obs); return;
    }
    _sendObservation(obs, false);
  }

  function _sendObservation(obs, isRetry) {
    GM_xmlhttpRequest({
      method:  'POST',
      url:     `${KERNEL}/observe`,
      headers: { 'Content-Type': 'application/json' },
      data:    JSON.stringify(obs),
      onload: (res) => {
        if (res.status !== 200) {
          console.error(`${TAG} ${isRetry ? '[retry]' : ''} /observe ${res.status}: ${res.responseText?.slice(0, 200)}`);
        }
      },
      onerror: () => {
        console.error(`${TAG} /observe network error — re-queuing`);
        enqueue(obs);
      },
    });
  }

  // ── MutationObserver ───────────────────────────────────────────────────────

  let _scanTimer = null;
  let _observer  = null;

  function attachObserver() {
    const root = document.querySelector('[data-testid="conversation-content"]')
              || document.querySelector('main')
              || document.body;

    if (_observer) { _observer.disconnect(); _observer = null; }

    _observer = new MutationObserver(() => {
      clearTimeout(_scanTimer);
      _scanTimer = setTimeout(scanMessages, 600);
    });

    _observer.observe(root, { childList: true, subtree: true });
    console.log(`${TAG} observer attached to <${root.tagName.toLowerCase()}> (nav #${_s.navCount})`);
    scanMessages(); // scan existing content immediately
  }

  // ── SPA Navigation detection ───────────────────────────────────────────────
  // React router uses history.pushState — no page reload, no popstate from
  // the router itself. Strategy:
  //   1. Override history.pushState to intercept React router navigations.
  //   2. Also listen to popstate (browser back/forward).
  //   3. URL poll every 1s as final safety net.

  let _lastUrl = location.href;

  function onNavigate(newUrl) {
    if (newUrl === _lastUrl) return;
    _lastUrl = newUrl;
    _s.navCount++;

    const prevConvId = _s.conversationId;
    _s.conversationId = parseConversationId(newUrl);

    console.log(`${TAG} navigation #${_s.navCount}: ${prevConvId ?? 'none'} → ${_s.conversationId ?? 'home'}`);
    console.log(`${TAG} resetting DOM dedup (WeakSet) — content-hash dedup persists`);

    // Reset per-DOM dedup — new page, new elements
    _seen = new WeakSet();

    // Reattach observer to new DOM root (React may have replaced main)
    setTimeout(attachObserver, 300); // brief wait for React to render new route

    renderHUD();
  }

  function parseConversationId(url) {
    // claude.ai URLs: /chat/<uuid> or /new
    const m = url.match(/\/chat\/([a-f0-9-]{8,})/i);
    return m ? m[1].slice(0, 8) : null; // first 8 chars is enough for display
  }

  function initNavigationDetection() {
    // Override pushState
    const origPush = history.pushState.bind(history);
    history.pushState = function (...args) {
      origPush(...args);
      onNavigate(location.href);
    };

    // Override replaceState (some routers use this)
    const origReplace = history.replaceState.bind(history);
    history.replaceState = function (...args) {
      origReplace(...args);
      onNavigate(location.href);
    };

    // Browser back/forward
    window.addEventListener('popstate', () => onNavigate(location.href));

    // Polling fallback — catches anything the above miss
    setInterval(() => onNavigate(location.href), 1000);

    // Set initial conversationId
    _s.conversationId = parseConversationId(location.href);
    console.log(`${TAG} navigation detection active — initial conv: ${_s.conversationId ?? 'none'}`);
  }

  // ── SSE ────────────────────────────────────────────────────────────────────

  function connectSSE() {
    if (_sse) { try { _sse.close(); } catch (_) {} _sse = null; }
    console.log(`${TAG} SSE connect attempt ${_s.retryCount + 1}`);

    try { _sse = new EventSource(`${KERNEL}/events`); }
    catch (err) { console.error(`${TAG} EventSource failed: ${err.message}`); scheduleRetry(); return; }

    _sse.onopen = () => {
      _s.connected = true; _s.retryCount = 0;
      console.log(`${TAG} SSE connected`);
      drainQueue();
      renderHUD();
    };

    _sse.addEventListener('state',  e => handleEvent('state',  e.data));
    _sse.addEventListener('drift',  e => handleEvent('drift',  e.data));
    _sse.addEventListener('regime', e => handleEvent('regime', e.data));
    _sse.addEventListener('alert',  e => handleEvent('alert',  e.data));

    _sse.onmessage = (e) => {
      console.warn(`${TAG} unnamed SSE message: ${e.data?.slice(0, 80)}`);
    };

    _sse.onerror = () => {
      const rs = _sse?.readyState;
      console.warn(`${TAG} SSE error — readyState: ${['CONNECTING','OPEN','CLOSED'][rs] ?? rs}`);
      _s.connected = false;
      renderHUD();
      if (rs === EventSource.CLOSED) { _sse = null; scheduleRetry(); }
    };
  }

  function scheduleRetry() {
    if (_retryTimer) return;
    const delay = Math.min(2000 * Math.pow(2, _s.retryCount), 30000);
    _s.retryCount++;
    _retryTimer = setTimeout(() => { _retryTimer = null; connectSSE(); }, delay);
  }

  // ── Event handlers (same as p2) ────────────────────────────────────────────

  function handleEvent(type, raw) {
    let data;
    try { data = JSON.parse(raw); }
    catch (err) { console.error(`${TAG} parse "${type}": ${err.message}`); return; }

    switch (type) {
      case 'state':  applyState(data);  break;
      case 'drift':  applyDrift(data);  break;
      case 'regime': applyRegime(data); break;
      case 'alert':  applyAlert(data);  break;
      default: console.warn(`${TAG} unknown event: "${type}"`);
    }
  }

  function applyState(s) {
    _s.user.regime = s.user?.pendulum?.regime ?? 'UNKNOWN';
    _s.user.sigma  = s.user?.pendulum?.sigma  ?? null;
    _s.user.delta  = s.user?.pendulum?.delta  ?? null;
    _s.user.n      = s.user?.n ?? 0;
    _s.assistant.regime = s.assistant?.pendulum?.regime ?? 'UNKNOWN';
    _s.assistant.sigma  = s.assistant?.pendulum?.sigma  ?? null;
    _s.assistant.delta  = s.assistant?.pendulum?.delta  ?? null;
    _s.assistant.n      = s.assistant?.n ?? 0;
    _s.composite.regime = s.composite?.pendulum?.regime ?? 'UNKNOWN';
    _s.composite.sigma  = s.composite?.pendulum?.sigma  ?? null;
    _s.lastGaps    = s.assistant?.lastGaps ?? s.user?.lastGaps ?? [];
    _s.ledgerCount = s.ledger?.entries ?? 0;
    console.log(`${TAG} state: u=${_s.user.regime} a=${_s.assistant.regime} ledger=${_s.ledgerCount}`);
    renderHUD();
  }

  function applyDrift(d) {
    const role = d.role;
    if (role !== 'user' && role !== 'assistant') { console.warn(`${TAG} unknown role: "${role}"`); return; }
    _s[role].sigma  = d.pendulum?.sigma  ?? _s[role].sigma;
    _s[role].delta  = d.pendulum?.delta  ?? _s[role].delta;
    _s[role].regime = d.pendulum?.regime ?? _s[role].regime;
    _s[role].n      = d.pendulum?.n      ?? _s[role].n;
    if (d.composite?.regime !== undefined) _s.composite.regime = d.composite.regime;
    if (d.composite?.sigma  !== undefined) _s.composite.sigma  = d.composite.sigma;
    _s.lastGaps    = d.gaps            ?? _s.lastGaps;
    _s.ledgerCount = d.ledger?.entries ?? _s.ledgerCount;
    renderHUD();
  }

  function applyRegime(d) {
    const c = REGIME_COLOR[d.to] ?? REGIME_COLOR.UNKNOWN;
    console.log(`${TAG} REGIME: ${d.role} ${d.from} → ${d.to}`);
    showAlert(`${d.role} → ${d.to}`, c.dot);
  }

  function applyAlert(d) {
    const top = d.gaps?.[0];
    if (!top) return;
    console.warn(`${TAG} ALERT: ${top.label} (${top.score})`);
    showAlert(top.label, top.color ?? '#E24B4A');
  }

  // ── HUD ────────────────────────────────────────────────────────────────────

  GM_addStyle(`
    #bda-hud { position:fixed; bottom:20px; right:20px; z-index:99999;
               font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
               font-size:12px; user-select:none; }
    #bda-hud * { box-sizing:border-box; }
    #bda-pill { display:flex; align-items:center; gap:6px; padding:6px 10px;
                border-radius:20px; cursor:pointer; border:0.5px solid rgba(0,0,0,.12);
                box-shadow:0 2px 8px rgba(0,0,0,.12); transition:background .2s,color .2s;
                min-width:150px; justify-content:space-between; }
    #bda-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    @keyframes bda-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)} }
    .bda-dot-pulse { animation:bda-pulse 1.4s ease-in-out infinite; }
    #bda-regime-text { font-weight:600; font-size:11px; letter-spacing:.04em; }
    #bda-sigma-text  { font-size:10px; opacity:.75; font-variant-numeric:tabular-nums; }
    #bda-toggle      { font-size:9px; opacity:.45; }
    #bda-panel { position:absolute; bottom:calc(100% + 8px); right:0; width:300px;
                 background:#fff; border:.5px solid rgba(0,0,0,.1); border-radius:12px;
                 box-shadow:0 8px 24px rgba(0,0,0,.15); overflow:hidden; display:none; }
    #bda-panel.open { display:block; }
    @media (prefers-color-scheme:dark) {
      #bda-panel { background:#1a1a1c; border-color:rgba(255,255,255,.1); color:#e8e8e6; }
    }
    .bda-ph { padding:9px 12px; border-bottom:.5px solid rgba(0,0,0,.07);
              display:flex; align-items:center; justify-content:space-between; }
    .bda-ph-title { font-weight:600; font-size:12px; }
    .bda-ph-link  { font-size:10px; color:#1D9E75; border:.5px solid #9FE1CB;
                    padding:2px 7px; border-radius:10px; text-decoration:none; }
    .bda-alert { padding:6px 12px; font-size:11px; font-weight:600; display:none; }
    .bda-alert.show { display:block; }
    .bda-row { padding:8px 12px; border-bottom:.5px solid rgba(0,0,0,.05); }
    .bda-row-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#888780; margin-bottom:4px; }
    .bda-row-inner { display:flex; align-items:center; gap:6px; }
    .bda-badge { font-size:11px; font-weight:600; padding:2px 7px; border-radius:10px; }
    .bda-sigma { font-size:11px; color:#888780; font-variant-numeric:tabular-nums; }
    .bda-n     { font-size:10px; color:#b4b2a9; margin-left:auto; }
    .bda-gaps  { padding:8px 12px; }
    .bda-gaps-label { font-size:10px; text-transform:uppercase; letter-spacing:.08em; color:#888780; margin-bottom:5px; }
    .bda-gap { display:flex; align-items:center; gap:6px; padding:2px 0; }
    .bda-gap-dot   { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
    .bda-gap-label { font-size:11px; flex:1; }
    .bda-gap-score { font-size:10px; font-family:monospace; color:#888780; }
    .bda-foot { padding:5px 12px; font-size:10px; color:#b4b2a9;
                border-top:.5px solid rgba(0,0,0,.05);
                display:flex; justify-content:space-between; }
    @media (prefers-color-scheme:dark) {
      .bda-ph,.bda-row,.bda-foot { border-color:rgba(255,255,255,.06); }
      .bda-gap-label { color:#d3d1c7; }
    }
  `);

  function buildHUD() {
    const hud = document.createElement('div');
    hud.id = 'bda-hud';
    hud.innerHTML = `
      <div id="bda-panel">
        <div class="bda-ph">
          <span class="bda-ph-title">BDA <span style="font-weight:400;font-size:10px;color:#888780">p3</span></span>
          <a class="bda-ph-link" href="${KERNEL}/" target="_blank">ui ↗</a>
        </div>
        <div class="bda-alert" id="bda-alert"></div>
        <div class="bda-row">
          <div class="bda-row-label">You</div>
          <div class="bda-row-inner">
            <span class="bda-badge" id="bda-user-regime">—</span>
            <span class="bda-sigma" id="bda-user-sigma">σ —</span>
            <span class="bda-n"    id="bda-user-n">0 obs</span>
          </div>
        </div>
        <div class="bda-row">
          <div class="bda-row-label">Claude</div>
          <div class="bda-row-inner">
            <span class="bda-badge" id="bda-asst-regime">—</span>
            <span class="bda-sigma" id="bda-asst-sigma">σ —</span>
            <span class="bda-n"    id="bda-asst-n">0 obs</span>
          </div>
        </div>
        <div class="bda-gaps">
          <div class="bda-gaps-label">Latest gaps</div>
          <div id="bda-gaps-list"><span style="font-size:11px;color:#b4b2a9">None detected</span></div>
        </div>
        <div class="bda-foot">
          <span id="bda-ledger">ledger: 0</span>
          <span id="bda-conn">connecting…</span>
        </div>
      </div>
      <div id="bda-pill">
        <div id="bda-dot" class="bda-dot-pulse"></div>
        <span id="bda-regime-text">BDA</span>
        <span id="bda-sigma-text">connecting</span>
        <span id="bda-toggle">▲</span>
      </div>`;
    document.body.appendChild(hud);
    document.getElementById('bda-pill').addEventListener('click', () => {
      _s.expanded = !_s.expanded;
      document.getElementById('bda-panel').classList.toggle('open', _s.expanded);
      document.getElementById('bda-toggle').textContent = _s.expanded ? '▼' : '▲';
    });
  }

  const ROLE_ID = { user: 'user', assistant: 'asst' };

  function renderHUD() {
    const pill = document.getElementById('bda-pill');
    if (!pill) return;
    const c = REGIME_COLOR[_s.composite.regime] ?? REGIME_COLOR.UNKNOWN;
    pill.style.background  = c.bg;
    pill.style.color       = c.text;
    pill.style.borderColor = c.dot + '55';
    const dot = document.getElementById('bda-dot');
    dot.style.background = c.dot;
    dot.classList.toggle('bda-dot-pulse', !_s.connected);
    document.getElementById('bda-regime-text').textContent = _s.composite.regime || 'UNKNOWN';
    document.getElementById('bda-sigma-text').textContent  = _s.composite.sigma !== null
      ? `σ ${_s.composite.sigma.toFixed(2)}`
      : (_s.connected ? 'σ —' : 'offline');

    for (const role of ['user', 'assistant']) {
      const s  = _s[role];
      const id = ROLE_ID[role];
      const rc = REGIME_COLOR[s.regime] ?? REGIME_COLOR.UNKNOWN;
      const badge = document.getElementById(`bda-${id}-regime`);
      if (!badge) continue;
      badge.textContent      = s.regime;
      badge.style.background = rc.bg;
      badge.style.color      = rc.text;
      document.getElementById(`bda-${id}-sigma`).textContent = s.sigma !== null
        ? `σ ${s.sigma.toFixed(2)}  δ ${(s.delta ?? 0).toFixed(2)}` : 'σ —';
      const localN = _s.captured[role];
      document.getElementById(`bda-${id}-n`).textContent =
        `${s.n} obs${localN !== s.n ? ` (${localN} sent)` : ''}`;
    }

    const gapsList = document.getElementById('bda-gaps-list');
    if (_s.lastGaps?.length) {
      gapsList.innerHTML = _s.lastGaps.slice(0, 4).map(g =>
        `<div class="bda-gap">
          <div class="bda-gap-dot" style="background:${g.color}"></div>
          <span class="bda-gap-label">${g.label}</span>
          <span class="bda-gap-score">${g.score.toFixed(2)}</span>
        </div>`).join('');
    } else {
      gapsList.innerHTML = '<span style="font-size:11px;color:#b4b2a9">None detected</span>';
    }

    const convNote = _s.conversationId ? ` · conv:${_s.conversationId}` : '';
    const queueNote = _s.queueSize > 0 ? ` · ${_s.queueSize} queued` : '';
    document.getElementById('bda-conn').textContent = _s.connected
      ? `connected${convNote}${queueNote}`
      : `offline (retry ${_s.retryCount})${queueNote}`;
    document.getElementById('bda-ledger').textContent = `ledger: ${_s.ledgerCount}`;
  }

  let _alertTimer = null;
  function showAlert(text, color) {
    const bar = document.getElementById('bda-alert');
    if (!bar) return;
    bar.textContent = `⚠ ${text}`;
    bar.style.background = color + '22';
    bar.style.color = color;
    bar.classList.add('show');
    clearTimeout(_alertTimer);
    _alertTimer = setTimeout(() => bar.classList.remove('show'), 6000);
    if (!_s.expanded) {
      _s.expanded = true;
      document.getElementById('bda-panel').classList.add('open');
      document.getElementById('bda-toggle').textContent = '▼';
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  function boot() {
    console.log(`${TAG} booting phase 3 — navigation + dedup`);
    buildHUD();
    renderHUD();
    initNavigationDetection();
    connectSSE();
    attachObserver();
    console.log(`${TAG} phase 3 active`);
    console.log(`${TAG} conv: ${_s.conversationId ?? 'none'}`);
    console.log(`${TAG} NOTE: phase 4 adds selector diagnostics + full hardening`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 800));
  } else {
    setTimeout(boot, 800);
  }

})();
