// ═══════════════════════════════════════════════════════════════════
// ALM — ACCELERATED LEARNING MODULE — ui.js
// v2.0.0 (extracted from the nexus-engine.js monolith)
//
// All rendering + DOM handlers for the 6 real tabs: Cognitive Functions,
// Models, Experiment, Externalize, Heuristics, Frameworks, Log. Same
// real implementation that was embedded in nexus-engine.js, physically
// moved. Depends on engine.js (ALM_STATE, COGNITIVE_FUNCTIONS,
// HUMAN_MODELS, almLoad/almSave) being loaded first.
// ═══════════════════════════════════════════════════════════════════

'use strict';

function openALM() {
  if (!_assertAuth()) return;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.module.open', { module: 'alm' });
  if (!ALM_STATE._loaded) almLoad();

  let overlay = document.getElementById('mm-alm-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mm-alm-overlay';
    overlay.style.cssText = [
      'position:fixed;top:38px;left:0;right:0;bottom:0;z-index:800',
      'background:rgba(0,2,6,.98);backdrop-filter:blur(8px)',
      'display:flex;flex-direction:column;overflow:hidden',
    ].join(';');
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'flex';
  overlay.style.pointerEvents = 'all';
  _renderALM(overlay);
  if (typeof MMBG !== 'undefined') MMBG.pulse(window.innerWidth * 0.5, window.innerHeight * 0.4, 0.85);
}

function closeALM() {
  const el = document.getElementById('mm-alm-overlay');
  if (el) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
  almSave();
}

// ── Main render ───────────────────────────────────────────────────
function _renderALM(overlay) {
  overlay.innerHTML = '';
  const C = '#00ff88';

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = [
    'display:flex;align-items:center;gap:14px;padding:11px 22px',
    'border-bottom:1px solid rgba(0,255,136,.18)',
    'background:rgba(0,255,136,.03);flex-shrink:0',
  ].join(';');
  hdr.innerHTML = `
    <span style="font-size:18px;filter:drop-shadow(0 0 10px #00ff88)">∞</span>
    <div>
      <div style="font-family:var(--f-display);font-size:13px;font-weight:800;
        letter-spacing:5px;color:#00ff88">ALM</div>
      <div style="font-family:var(--f-mono);font-size:7px;
        color:rgba(0,255,136,.45);letter-spacing:2px;margin-top:1px">
        ACCELERATED LEARNING · COGNITIVE FUNCTIONS · HUMAN MODELS · FEEDBACK
      </div>
    </div>
    <div style="margin-left:auto;display:flex;gap:7px;align-items:center">
      <button onclick="almExportToCanvas()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid rgba(0,255,136,.3);color:#00ff88;background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(0,255,136,.1)'"
        onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      <button onclick="closeALM();goHome()" style="
        font-family:var(--f-mono);font-size:7.5px;letter-spacing:1px;padding:6px 12px;
        border:1px solid var(--wire2);color:var(--dim);background:transparent;cursor:pointer"
        onmouseenter="this.style.background='rgba(255,255,255,.04)'"
        onmouseleave="this.style.background='transparent'">⌂ HOME</button>
    </div>
  `;
  overlay.appendChild(hdr);

  // Tab bar
  const TABS = [
    { id:'functions',    label:'COGNITIVE FUNCTIONS', icon:'◈' },
    { id:'intelligence', label:'INTELLIGENCE',        icon:'◉' },
    { id:'models',       label:'8 MODELS',            icon:'⬡' },
    { id:'experiment',   label:'EXPERIMENT',          icon:'◎' },
    { id:'externalize',  label:'EXTERNALIZE',         icon:'✦' },
    { id:'heuristics',   label:'HEURISTICS',          icon:'◆' },
    { id:'frameworks',   label:'FRAMEWORKS',          icon:'⊞' },
    { id:'feedback',     label:'FEEDBACK LOOPS',      icon:'↻' },
    { id:'log',          label:'LOG',                 icon:'Δ' },
  ];
  const tabBar = document.createElement('div');
  tabBar.style.cssText = [
    'display:flex;gap:0;border-bottom:1px solid rgba(0,255,136,.1)',
    'background:rgba(0,0,0,.4);flex-shrink:0;overflow-x:auto',
  ].join(';');
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    const isActive = ALM_STATE.activeTab === tab.id;
    btn.style.cssText = [
      'padding:9px 16px;cursor:pointer;white-space:nowrap',
      `font-family:var(--f-mono);font-size:7.5px;letter-spacing:1.5px`,
      `border:none;border-bottom:2px solid ${isActive ? '#00ff88' : 'transparent'}`,
      `color:${isActive ? '#00ff88' : 'var(--dim)'}`,
      `background:${isActive ? 'rgba(0,255,136,.06)' : 'transparent'}`,
      'transition:all .15s',
    ].join(';');
    btn.textContent = tab.icon + ' ' + tab.label;
    btn.addEventListener('click', () => {
      ALM_STATE.activeTab = tab.id;
      _renderALM(overlay);
    });
    btn.addEventListener('mouseenter', () => { if (!isActive) { btn.style.color='var(--muted)'; btn.style.background='rgba(255,255,255,.03)'; } });
    btn.addEventListener('mouseleave', () => { if (!isActive) { btn.style.color='var(--dim)'; btn.style.background='transparent'; } });
    tabBar.appendChild(btn);
  });
  overlay.appendChild(tabBar);

  // Content area
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:hidden;display:flex';
  overlay.appendChild(content);

  switch (ALM_STATE.activeTab) {
    case 'functions':   _almTabFunctions(content);   break;
    case 'intelligence':_almTabIntelligence(content);break;
    case 'models':      _almTabModels(content);      break;
    case 'experiment':  _almTabExperiment(content);  break;
    case 'externalize': _almTabExternalize(content); break;
    case 'heuristics':  _almTabHeuristics(content);  break;
    case 'frameworks':  _almTabFrameworks(content);  break;
    case 'feedback':    _almTabFeedback(content);    break;
    case 'log':         _almTabLog(content);         break;
  }
}

// ── TAB: Cognitive Functions ──────────────────────────────────────
function _almTabFunctions(container) {
  container.style.flexDirection = 'row';

  // Left: function list
  const left = document.createElement('div');
  left.style.cssText = [
    'width:220px;flex-shrink:0;border-right:1px solid rgba(0,255,136,.1)',
    'overflow-y:auto;padding:14px 0',
  ].join(';');

  // Loop type legend
  left.innerHTML = `
    <div style="padding:0 14px 12px;border-bottom:1px solid rgba(0,255,136,.08);margin-bottom:10px">
      <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;
        color:var(--dim);margin-bottom:6px">INPUT → PROCESSING → OUTPUT</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['input','processing','output','meta'].map(t => {
          const c = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[t];
          return `<span style="font-family:var(--f-mono);font-size:7px;color:${c};
            border:1px solid ${c}44;padding:2px 6px">${t}</span>`;
        }).join('')}
      </div>
    </div>
  `;

  Object.entries(COGNITIVE_FUNCTIONS).forEach(([key, fn]) => {
    const isActive = ALM_STATE.activeFunction === key;
    const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[fn.loop];
    const log = ALM_STATE.functionLog.filter(l => l.fnKey === key);
    const avgQ = log.length ? (log.slice(-5).reduce((s,l)=>s+(l.quality||0),0)/Math.min(5,log.length)).toFixed(1) : '—';

    const row = document.createElement('div');
    row.style.cssText = [
      'padding:9px 14px;cursor:pointer;display:flex;align-items:center;gap:9px',
      `border-left:3px solid ${isActive ? fn.color : 'transparent'}`,
      `background:${isActive ? fn.color+'10' : 'transparent'}`,
      'transition:all .12s',
    ].join(';');
    row.innerHTML = `
      <span style="font-size:14px;color:${fn.color};flex-shrink:0">${fn.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--f-display);font-size:9px;font-weight:700;
          color:${isActive ? fn.color : 'var(--bright)'}">${key}</div>
        <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${fn.label}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
        <span style="font-family:var(--f-mono);font-size:6.5px;color:${loopColor};
          border:1px solid ${loopColor}44;padding:1px 4px">${fn.loop}</span>
        ${log.length ? `<span style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${log.length}×</span>` : ''}
      </div>
    `;
    row.addEventListener('click', () => {
      ALM_STATE.activeFunction = key;
      const overlay = document.getElementById('mm-alm-overlay');
      if (overlay) _renderALM(overlay);
    });
    row.addEventListener('mouseenter', () => { if (!isActive) row.style.background = fn.color+'08'; });
    row.addEventListener('mouseleave', () => { if (!isActive) row.style.background = 'transparent'; });
    left.appendChild(row);
  });
  container.appendChild(left);

  // Right: function detail
  const fn = COGNITIVE_FUNCTIONS[ALM_STATE.activeFunction];
  if (!fn) return;
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;overflow-y:auto;padding:24px 30px;display:flex;flex-direction:column;gap:22px';

  const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[fn.loop];
  const log = ALM_STATE.functionLog.filter(l => l.fnKey === ALM_STATE.activeFunction);
  const recent = [...log].sort((a,b) => b.ts - a.ts).slice(0, 8);

  // Header
  right.innerHTML = `
    <div>
      <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:6px">
        <span style="font-family:var(--f-display);font-size:32px;font-weight:900;
          color:${fn.color};letter-spacing:4px">${ALM_STATE.activeFunction}</span>
        <span style="font-family:var(--f-mono);font-size:10px;color:${loopColor};
          border:1px solid ${loopColor}44;padding:3px 9px">${fn.loop.toUpperCase()}</span>
      </div>
      <div style="font-family:var(--f-display);font-size:13px;font-weight:700;
        letter-spacing:2px;color:var(--bright);margin-bottom:6px">${fn.label}</div>
      <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);line-height:1.8">
        ${fn.desc}</div>
    </div>

    <!-- Feedback loop diagram for this function -->
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${['INPUT','PROCESSING','OUTPUT'].map(stage => {
        const isActive = (stage==='INPUT'&&fn.loop==='input')||(stage==='PROCESSING'&&fn.loop==='processing')||(stage==='OUTPUT'&&fn.loop==='output');
        return `<div style="padding:12px;text-align:center;
          border:1px solid ${isActive ? fn.color+'66' : 'rgba(255,255,255,.06)'};
          background:${isActive ? fn.color+'0d' : 'transparent'}">
          <div style="font-family:var(--f-display);font-size:7.5px;letter-spacing:2px;
            color:${isActive ? fn.color : 'var(--dim)'}">${stage}</div>
          ${isActive ? `<div style="font-family:var(--f-mono);font-size:7px;
            color:var(--muted);margin-top:4px;line-height:1.5">${ALM_STATE.activeFunction}</div>` : ''}
        </div>`;
      }).join(`<div style="display:flex;align-items:center;justify-content:center;
        color:var(--dim);font-size:14px">→</div>`)}
    </div>

    <!-- Train prompt + experiment -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:14px;background:${fn.color}08;border:1px solid ${fn.color}22">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:${fn.color};margin-bottom:8px">ACTIVATION PROMPT</div>
        <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
          line-height:1.7;font-style:italic">"${fn.trainPrompt}"</div>
      </div>
      <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:8px">FEEDBACK SIGNAL</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
          line-height:1.7">${fn.feedback}</div>
      </div>
    </div>

    <!-- Quick log -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">LOG OBSERVATION</div>
      <textarea id="alm-fn-note" placeholder="What did you notice when using ${ALM_STATE.activeFunction}?
Quality of the signal? What triggered it? What came out?" style="
        width:100%;box-sizing:border-box;height:72px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.4);border:1px solid rgba(0,255,136,.2);
        padding:9px;line-height:1.6;outline:none"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
      <div style="display:flex;gap:8px;margin-top:8px">
        <div style="display:flex;gap:4px;align-items:center">
          <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">quality</span>
          ${[1,2,3,4,5].map(n => `<button id="alm-fn-q-${n}" onclick="almFnSetQuality(${n})" style="
            width:24px;height:24px;cursor:pointer;border:1px solid rgba(0,255,136,.2);
            background:transparent;color:var(--wire2);font-family:var(--f-mono);
            font-size:9px;transition:all .1s"
            onmouseenter="this.style.background='rgba(0,255,136,.15)'"
            onmouseleave="almFnQualityHover(${n})">${n}</button>`).join('')}
        </div>
        <button onclick="almLogFunction()" style="
          margin-left:auto;padding:8px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.14)'"
          onmouseleave="this.style.background='rgba(0,255,136,.06)'">+ LOG</button>
        <button onclick="almRunExperiment('${ALM_STATE.activeFunction}')" style="
          padding:8px 18px;border:1px solid rgba(204,68,255,.35);
          color:#cc44ff;background:transparent;cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(204,68,255,.1)'"
          onmouseleave="this.style.background='transparent'">◎ EXPERIMENT</button>
      </div>
    </div>

    <!-- Recent log -->
    ${recent.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">RECENT OBSERVATIONS</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${recent.map(l => {
          const qc = ['','#ff3355','#ff8c22','#ffe04a','#00c8ff','#00ff88'][l.quality||0] || 'var(--dim)';
          return `<div style="padding:8px 12px;background:rgba(0,0,0,.3);
            border-left:2px solid ${fn.color}44;display:flex;gap:10px">
            <span style="font-family:var(--f-mono);font-size:9px;color:${qc};
              flex-shrink:0">Q${l.quality||'?'}</span>
            <span style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              flex:1;line-height:1.5">${escH(l.note)}</span>
            <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);
              flex-shrink:0">${_almTimeAgo(l.ts)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  `;
  container.appendChild(right);
  // Init quality selection
  window._almFnQuality = window._almFnQuality || 3;
  almFnSetQuality(window._almFnQuality);
}

let _almFnQuality = 3;
function almFnSetQuality(n) {
  _almFnQuality = n;
  [1,2,3,4,5].forEach(i => {
    const btn = document.getElementById('alm-fn-q-' + i);
    if (!btn) return;
    const active = i <= n;
    btn.style.background = active ? 'rgba(0,255,136,.2)' : 'transparent';
    btn.style.color = active ? '#00ff88' : 'var(--wire2)';
    btn.style.borderColor = active ? 'rgba(0,255,136,.5)' : 'rgba(0,255,136,.2)';
  });
}
function almFnQualityHover(n) { almFnSetQuality(_almFnQuality); }

function almLogFunction() {
  const note = document.getElementById('alm-fn-note')?.value?.trim();
  if (!note) { mm_toast('Add an observation first', 'warn'); return; }
  ALM_STATE.functionLog.push({
    fnKey: ALM_STATE.activeFunction,
    note, quality: _almFnQuality,
    ts: Date.now(),
  });
  almSave();
  mm_toast('Logged ' + ALM_STATE.activeFunction, 'success', { dur: 1600 });
  const ta = document.getElementById('alm-fn-note');
  if (ta) ta.value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: 8 Human Models ───────────────────────────────────────────
// ── TAB: Intelligence ────────────────────────────────────────────
// The canonical home for intelligence-type ratings and cross-domain
// synthesis matches. There used to be THREE places this data could be
// touched: a legacy nexus-engine.js implementation (dead — shadowed by
// the one below, never actually reached by the live UI, which is
// exactly why a fix applied there last session didn't show up for
// anyone), a live Brain Map implementation (_bmRenderIntelStats /
// bmv2SetIntel — fully manual, no automatic-sync awareness at all),
// and this one. This is now the only one. Brain Map links here instead
// of hosting its own copy.
function _almTabIntelligence(container) {
  container.style.cssText = 'flex:1;overflow-y:auto;padding:22px 26px';
  container.innerHTML = `
    <div style="font-family:var(--f-display);font-size:11px;font-weight:800;letter-spacing:4px;color:#00ff88;margin-bottom:4px">INTELLIGENCE TYPES</div>
    <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8;margin-bottom:18px;max-width:640px">
      Computed automatically from what you actually speak and write — no self-rating required. Drag a slider to
      manually correct one; it stays MANUAL (won't be overwritten by the automatic engine) until you reset it.
    </div>
    <div id="alm-intel-stats" style="max-width:640px;margin-bottom:28px"></div>
    <div style="font-family:var(--f-display);font-size:9px;font-weight:800;letter-spacing:3px;color:#00ff88;margin-bottom:10px">CROSS-DOMAIN SYNTHESIS</div>
    <div id="alm-crossdomain-panel" style="max-width:640px"></div>
  `;
  renderIntelligenceStats();
  renderCrossDomainMatrix();
}

// Real ratings, drawn from DOMAIN_STATE (same store the automatic
// coherence engine writes into) — moved here from nexus-engine.js, not
// duplicated; that copy is deleted.
function renderIntelligenceStats() {
  const el = document.getElementById('alm-intel-stats'); if (!el) return;
  if (typeof INTELLIGENCE_TYPES === 'undefined' || typeof DOMAIN_STATE === 'undefined') return;
  el.innerHTML = '';
  Object.entries(INTELLIGENCE_TYPES).forEach(([key, intel]) => {
    const rating = DOMAIN_STATE.intelligenceRatings[key] || 0;
    const isOverride = !!DOMAIN_STATE.intelligenceOverrides[key];
    const row = document.createElement('div');
    row.className = 'intel-stat-row';
    row.style.cssText = 'padding:9px 0;border-bottom:1px solid rgba(0,255,136,.08)';
    row.innerHTML =
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">' +
        '<span style="font-size:12px;color:'+intel.color+'">'+intel.icon+'</span>' +
        '<span style="font-family:var(--f-body);font-size:9.5px;font-weight:600;color:var(--bright)">'+intel.label+'</span>' +
        '<span title="'+(isOverride ? 'Manually set — drag to adjust, or reset to let it compute itself again' : 'Computed automatically from what you actually speak and write — drag to override')+'" ' +
          'style="font-family:var(--f-mono);font-size:6px;letter-spacing:1px;padding:1px 5px;margin-left:4px;' +
          'border:1px solid '+(isOverride ? '#ff8c22' : '#00ff88')+'44;color:'+(isOverride ? '#ff8c22' : '#00ff88')+'">' +
          (isOverride ? 'MANUAL' : 'AUTO') + '</span>' +
        (isOverride ? '<span onclick="resetIntelligenceRatingToAuto(\''+key+'\')" title="Reset to automatic" ' +
          'style="cursor:pointer;font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-left:4px">\u21ba</span>' : '') +
        '<span id="intel-val-'+key+'" style="margin-left:auto;font-family:var(--f-mono);font-size:8px;color:'+intel.color+'">'+rating+'%</span>' +
      '</div>' +
      '<div style="height:3px;background:var(--wire);overflow:hidden;margin-bottom:4px">' +
        '<div class="intel-stat-fill" style="height:100%;width:'+rating+'%;background:'+intel.color+';transition:width .4s"></div>' +
      '</div>' +
      '<input type="range" class="intel-stat-slider" min="0" max="100" value="'+rating+'" ' +
        'oninput="setIntelligenceRating(\''+key+'\',this.value)" ' +
        'style="width:100%;accent-color:'+intel.color+'">' +
      '<div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-top:3px">'+intel.desc+'</div>';
    el.appendChild(row);
  });
}

function setIntelligenceRating(key, val) {
  if (typeof DOMAIN_STATE === 'undefined') return;
  DOMAIN_STATE.intelligenceRatings[key] = +val;
  DOMAIN_STATE.intelligenceOverrides[key] = true; // deliberate manual set — automatic sync skips this key from now on
  const valEl = document.getElementById('intel-val-' + key);
  if (valEl) valEl.textContent = val + '%';
  const el = document.getElementById('alm-intel-stats');
  const fills = el ? el.querySelectorAll('.intel-stat-fill') : [];
  const intelKeys = Object.keys(INTELLIGENCE_TYPES || {});
  const idx = intelKeys.indexOf(key);
  if (idx >= 0 && fills[idx]) fills[idx].style.width = val + '%';
  if (typeof domainStateSave === 'function') domainStateSave();
  if (typeof bmv2Save === 'function') bmv2Save();
  renderIntelligenceStats(); // refresh the AUTO/MANUAL badge
}

// Clears a manual override — the next automatic sync (or the current
// ALM_STATE.autoIntelligence value right now, if one already exists)
// takes this type back over.
function resetIntelligenceRatingToAuto(key) {
  if (typeof DOMAIN_STATE === 'undefined') return;
  delete DOMAIN_STATE.intelligenceOverrides[key];
  const auto = (typeof ALM_STATE !== 'undefined' && ALM_STATE.autoIntelligence) || {};
  if (key in auto) DOMAIN_STATE.intelligenceRatings[key] = auto[key];
  if (typeof domainStateSave === 'function') domainStateSave();
  renderIntelligenceStats();
}

function renderCrossDomainMatrix() {
  const el = document.getElementById('alm-crossdomain-panel'); if (!el) return;
  if (typeof DOMAIN_STATE === 'undefined' || typeof DOMAIN_TAXONOMY === 'undefined') return;
  const topIntel = Object.entries(DOMAIN_STATE.intelligenceRatings)
    .sort(([,a],[,b]) => b-a).slice(0, 5);
  if (!topIntel.length || topIntel[0][1] === 0) {
    el.innerHTML = '<div style="font-family:var(--f-mono);font-size:7.5px;color:var(--dim);padding:12px 0">Intelligence ratings are computed automatically as you speak or write — cross-domain synthesis opportunities will appear here once enough activity has accumulated.</div>';
    return;
  }
  const matches = [];
  topIntel.forEach(([type]) => {
    Object.entries(DOMAIN_TAXONOMY).forEach(([metaKey, meta]) => {
      if (meta.intelligences && meta.intelligences.includes(type)) {
        matches.push({ meta: metaKey, type, color: meta.color });
      }
    });
  });
  el.innerHTML = [...new Map(matches.map(m=>[m.meta,m])).values()].slice(0,8).map(m =>
    '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,255,136,.06)">' +
      '<div style="width:6px;height:6px;border-radius:50%;background:'+m.color+';flex-shrink:0"></div>' +
      '<span style="font-family:var(--f-body);font-size:9.5px;color:var(--bright)">'+m.meta+'</span>' +
      '<span style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-left:auto">via '+(INTELLIGENCE_TYPES[m.type]?.label||m.type)+'</span>' +
    '</div>'
  ).join('');
}

function _almTabModels(container) {
  container.style.flexDirection = 'row';

  // Left: model list
  const left = document.createElement('div');
  left.style.cssText = [
    'width:200px;flex-shrink:0;border-right:1px solid rgba(0,255,136,.1)',
    'overflow-y:auto;padding:12px 0',
  ].join(';');

  // Loop type header
  left.innerHTML = `
    <div style="padding:6px 14px 10px;border-bottom:1px solid rgba(0,255,136,.06);
      margin-bottom:8px;font-family:var(--f-mono);font-size:7px;color:var(--dim)">
      INPUT → PROCESSING → OUTPUT → META
    </div>
  `;

  Object.entries(HUMAN_MODELS).forEach(([key, model]) => {
    const isActive = ALM_STATE.activeModel === key;
    const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[model.loopType];
    const obs = ALM_STATE.modelLog.filter(l => l.modelKey === key).length;

    const row = document.createElement('div');
    row.style.cssText = [
      'padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px',
      `border-left:3px solid ${isActive ? model.color : 'transparent'}`,
      `background:${isActive ? model.color+'0d' : 'transparent'}`,
      'transition:all .12s',
    ].join(';');
    row.innerHTML = `
      <span style="font-size:13px;color:${model.color};flex-shrink:0">${model.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--f-display);font-size:8.5px;font-weight:700;
          color:${isActive ? model.color : 'var(--bright)'}">${model.label}</div>
        <div style="font-family:var(--f-mono);font-size:6.5px;color:var(--dim)">${model.subtitle}</div>
      </div>
      <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px">
        <span style="font-family:var(--f-mono);font-size:6px;color:${loopColor};
          border:1px solid ${loopColor}33;padding:1px 3px">${model.loopType}</span>
        ${obs ? `<span style="font-family:var(--f-mono);font-size:6px;color:var(--dim)">${obs}×</span>` : ''}
      </div>
    `;
    row.addEventListener('click', () => {
      ALM_STATE.activeModel = key;
      const overlay = document.getElementById('mm-alm-overlay');
      if (overlay) _renderALM(overlay);
    });
    row.addEventListener('mouseenter', () => { if (!isActive) row.style.background = model.color+'08'; });
    row.addEventListener('mouseleave', () => { if (!isActive) row.style.background = 'transparent'; });
    left.appendChild(row);
  });
  container.appendChild(left);

  // Right: model detail
  const model = HUMAN_MODELS[ALM_STATE.activeModel];
  if (!model) return;
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;overflow-y:auto;padding:24px 30px;display:flex;flex-direction:column;gap:20px';
  const loopColor = {input:'#00c8ff',processing:'#cc44ff',output:'#ff8c22',meta:'#11ddcc'}[model.loopType];
  const obs = ALM_STATE.modelLog.filter(l => l.modelKey === ALM_STATE.activeModel);
  const recent = [...obs].sort((a,b) => b.ts-a.ts).slice(0,6);

  right.innerHTML = `
    <div>
      <div style="display:flex;align-items:baseline;gap:14px;margin-bottom:6px">
        <span style="font-size:28px;color:${model.color}">${model.icon}</span>
        <span style="font-family:var(--f-display);font-size:18px;font-weight:800;
          letter-spacing:3px;color:${model.color}">${model.label.toUpperCase()}</span>
        <span style="font-family:var(--f-mono);font-size:8px;color:${loopColor};
          border:1px solid ${loopColor}44;padding:2px 8px">${model.loopType}</span>
      </div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        letter-spacing:1px;margin-bottom:10px">${model.source}</div>
      <div style="font-family:var(--f-mono);font-size:10px;color:var(--bright);
        line-height:1.7;border-left:3px solid ${model.color};padding-left:14px;
        font-style:italic">"${model.core}"</div>
    </div>

    <!-- What this model tracks -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
      <div style="padding:14px;background:${model.color}08;border:1px solid ${model.color}22">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:${model.color};margin-bottom:9px">WHAT TO TRACK</div>
        ${model.tracks.map(t => `
          <div style="display:flex;align-items:center;gap:7px;padding:4px 0;
            border-bottom:1px solid ${model.color}18">
            <div style="width:5px;height:5px;border-radius:50%;
              background:${model.color};flex-shrink:0"></div>
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted)">${t}</div>
          </div>`).join('')}
      </div>
      <div style="padding:14px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.07)">
        <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
          color:var(--dim);margin-bottom:9px">BRIDGE TO OTHER MODELS</div>
        <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
          line-height:1.8">${model.bridge}</div>
      </div>
    </div>

    <!-- Quick observation log -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">LOG OBSERVATION</div>
      <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:8px">
        ${model.tracks.map(t => `
          <button onclick="almModelFieldPrompt('${t.replace(/'/g,"\'")}')" style="
            padding:4px 9px;cursor:pointer;border:1px solid ${model.color}33;
            color:${model.color};background:transparent;font-family:var(--f-mono);
            font-size:7px;transition:all .12s"
            onmouseenter="this.style.background='${model.color}11'"
            onmouseleave="this.style.background='transparent'">${t}</button>
        `).join('')}
      </div>
      <textarea id="alm-model-obs" placeholder="What are you noticing in the ${model.label} layer right now?" style="
        width:100%;box-sizing:border-box;height:60px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.4);border:1px solid ${model.color}22;
        padding:8px;line-height:1.6;outline:none"
        onfocus="this.style.borderColor='${model.color}55'"
        onblur="this.style.borderColor='${model.color}22'"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:7px">
        <button onclick="almLogModel()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.35);
          color:#00ff88;background:rgba(0,255,136,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.14)'"
          onmouseleave="this.style.background='rgba(0,255,136,.06)'">+ LOG</button>
        <button onclick="almModelToCanvas('${ALM_STATE.activeModel}')" style="
          padding:7px 14px;border:1px solid rgba(255,255,255,.1);
          color:var(--dim);background:transparent;cursor:pointer;
          font-family:var(--f-mono);font-size:8px"
          onmouseenter="this.style.background='rgba(255,255,255,.05)'"
          onmouseleave="this.style.background='transparent'">→ CANVAS</button>
      </div>
    </div>

    <!-- Recent observations -->
    ${recent.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">RECENT OBSERVATIONS</div>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${recent.map(l => `
          <div style="padding:8px 12px;background:rgba(0,0,0,.3);
            border-left:2px solid ${model.color}44;display:flex;gap:10px;align-items:flex-start">
            ${l.field ? `<span style="font-family:var(--f-mono);font-size:7px;
              color:${model.color};flex-shrink:0;padding:1px 6px;
              border:1px solid ${model.color}33">${escH(l.field)}</span>` : ''}
            <span style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              flex:1;line-height:1.5">${escH(l.value)}</span>
            <span style="font-family:var(--f-mono);font-size:7px;
              color:var(--wire2);flex-shrink:0">${_almTimeAgo(l.ts)}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `;
  container.appendChild(right);
}

function almModelFieldPrompt(field) {
  const ta = document.getElementById('alm-model-obs');
  if (ta) { ta.placeholder = field + ': '; ta.focus(); }
  window._almModelField = field;
}

function almLogModel() {
  const val = document.getElementById('alm-model-obs')?.value?.trim();
  if (!val) { mm_toast('Add an observation', 'warn'); return; }
  ALM_STATE.modelLog.push({
    modelKey: ALM_STATE.activeModel,
    field: window._almModelField || null,
    value: val,
    ts: Date.now(),
  });
  window._almModelField = null;
  almSave();
  mm_toast('Observation logged', 'success', { dur: 1500 });
  document.getElementById('alm-model-obs').value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Experiment ───────────────────────────────────────────────
function _almTabExperiment(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '22px';

  const fn = COGNITIVE_FUNCTIONS[ALM_STATE.activeFunction];

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:4px">EXPERIMENT</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Deliberately use a function. Record what happens.
        The loop: trigger → observe → log → adjust → repeat.
      </div>
    </div>

    <!-- Function selector for experiment -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:9px">SELECT FUNCTION TO EXPERIMENT WITH</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">
        ${Object.entries(COGNITIVE_FUNCTIONS).map(([key, f]) => `
          <button onclick="almSelectExperimentFn('${key}')" style="
            padding:7px 13px;cursor:pointer;
            border:1px solid ${ALM_STATE.activeFunction===key ? f.color : f.color+'44'};
            background:${ALM_STATE.activeFunction===key ? f.color+'15' : 'transparent'};
            color:${f.color};font-family:var(--f-display);font-size:8.5px;
            font-weight:700;transition:all .12s"
            onmouseenter="this.style.background='${f.color}10'"
            onmouseleave="this.style.background='${ALM_STATE.activeFunction===key ? f.color+'15' : 'transparent'}'"
          >${f.icon} ${key}</button>
        `).join('')}
      </div>
      ${fn ? `
        <div style="padding:14px;background:${fn.color}08;border:1px solid ${fn.color}22">
          <div style="font-family:var(--f-mono);font-size:7.5px;color:${fn.color};
            letter-spacing:1.5px;margin-bottom:8px">EXPERIMENT PROTOCOL</div>
          <div style="font-family:var(--f-mono);font-size:9px;color:var(--bright);
            line-height:1.8;margin-bottom:8px">${fn.experiment}</div>
          <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
            font-style:italic">${fn.feedback}</div>
        </div>` : ''}
    </div>

    <!-- Log experiment result -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:9px">WHAT HAPPENED?</div>
      <textarea id="alm-exp-obs" placeholder="What did you notice?
Did the function activate cleanly or with resistance?
What was the quality of the output?
What surprised you?" style="
        width:100%;box-sizing:border-box;height:90px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.45);border:1px solid rgba(0,255,136,.2);
        padding:10px;line-height:1.7;outline:none"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px">
        <button onclick="almLogExperiment()" style="
          padding:8px 20px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.06);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.14)'"
          onmouseleave="this.style.background='rgba(0,255,136,.06)'">+ LOG EXPERIMENT</button>
      </div>
    </div>

    <!-- Past experiments -->
    ${ALM_STATE.experiments.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">EXPERIMENT LOG (${ALM_STATE.experiments.length})</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${[...ALM_STATE.experiments].reverse().slice(0,10).map(e => {
          const f = COGNITIVE_FUNCTIONS[e.fnKey];
          return `<div style="padding:10px 14px;background:rgba(0,0,0,.35);
            border-left:3px solid ${f?.color||'#00ff88'}44">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:6px">
              <span style="font-family:var(--f-display);font-size:9px;font-weight:700;
                color:${f?.color||'#00ff88'}">${e.fnKey}</span>
              <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim)">
                ${_almTimeAgo(e.ts)}</span>
            </div>
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--muted);
              line-height:1.6">${escH(e.observation)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>` : ''}
  `;
}

function almSelectExperimentFn(key) {
  ALM_STATE.activeFunction = key;
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almRunExperiment(fnKey) {
  ALM_STATE.activeFunction = fnKey;
  ALM_STATE.activeTab = 'experiment';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almLogExperiment() {
  const obs = document.getElementById('alm-exp-obs')?.value?.trim();
  if (!obs) { mm_toast('Record your observation first', 'warn'); return; }
  const fn = COGNITIVE_FUNCTIONS[ALM_STATE.activeFunction];
  ALM_STATE.experiments.push({
    id: uuid(), fnKey: ALM_STATE.activeFunction,
    prompt: fn?.experiment || '',
    observation: obs, ts: Date.now(),
  });
  almSave();
  mm_toast('Experiment logged', 'success', { dur: 1800 });
  document.getElementById('alm-exp-obs').value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Externalize ──────────────────────────────────────────────
function _almTabExternalize(container) {
  container.style.flexDirection = 'row';

  // Left: input
  const left = document.createElement('div');
  left.style.cssText = [
    'width:360px;flex-shrink:0;border-right:1px solid rgba(0,255,136,.1)',
    'padding:22px 20px;display:flex;flex-direction:column;gap:14px',
  ].join(';');

  left.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">EXTERNALIZE THOUGHT</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Get it out of your head. The act of externalizing is processing.
        Label the type to route it.
      </div>
    </div>
    <textarea id="alm-ext-text" placeholder="What's in your head right now?
A question you keep circling?
A half-formed observation?
A hypothesis that needs testing?
A pattern you keep seeing?
Anything — just get it out." style="
      flex:1;resize:none;
      font-family:var(--f-mono);font-size:9px;color:var(--bright);
      background:rgba(0,0,0,.45);border:1px solid rgba(0,255,136,.2);
      padding:12px;line-height:1.8;outline:none;min-height:160px"
      onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
      onblur="this.style.borderColor='rgba(0,255,136,.2)'"></textarea>
    <div>
      <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;
        color:var(--dim);margin-bottom:7px">TYPE</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
        ${['question','observation','hypothesis','pattern','friction','insight'].map(t => {
          const tc = {question:'#00c8ff',observation:'#00ff88',hypothesis:'#cc44ff',
                      pattern:'#ff8c22',friction:'#ff3355',insight:'#ffe04a'}[t];
          return `<button id="alm-ext-type-${t}" onclick="almExtSelectType('${t}')" style="
            padding:5px 11px;cursor:pointer;
            border:1px solid ${tc}44;color:${tc};
            background:transparent;font-family:var(--f-mono);
            font-size:7.5px;transition:all .12s"
            onmouseenter="this.style.background='${tc}11'"
            onmouseleave="almExtTypeHover('${t}')">${t}</button>`;
        }).join('')}
      </div>
      <div style="font-family:var(--f-display);font-size:7px;letter-spacing:2px;
        color:var(--dim);margin-bottom:7px">WHICH FUNCTION IS ACTIVE?</div>
      <select id="alm-ext-fn" style="
        width:100%;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
        color:var(--muted);padding:7px 9px;font-family:var(--f-mono);
        font-size:8px;margin-bottom:12px">
        <option value="">— function (optional)</option>
        ${Object.entries(COGNITIVE_FUNCTIONS).map(([k,f]) =>
          `<option value="${k}">${k} — ${f.label}</option>`).join('')}
      </select>
      <button onclick="almExternalizeLog()" style="
        width:100%;padding:10px;border:1px solid rgba(0,255,136,.4);
        color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
        font-family:var(--f-mono);font-size:9px;letter-spacing:1.5px"
        onmouseenter="this.style.background='rgba(0,255,136,.15)'"
        onmouseleave="this.style.background='rgba(0,255,136,.07)'">✦ EXTERNALIZE</button>
    </div>
  `;
  container.appendChild(left);

  // Right: stream
  const right = document.createElement('div');
  right.style.cssText = 'flex:1;overflow-y:auto;padding:22px 24px';
  const stream = [...ALM_STATE.externalizations].reverse();
  const typeColors = {question:'#00c8ff',observation:'#00ff88',hypothesis:'#cc44ff',
                      pattern:'#ff8c22',friction:'#ff3355',insight:'#ffe04a'};

  right.innerHTML = `
    <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
      color:var(--dim);margin-bottom:14px">THOUGHT STREAM (${stream.length})</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${stream.slice(0,40).map(e => {
        const col = typeColors[e.type] || '#00ff88';
        const fn = e.fnKey ? COGNITIVE_FUNCTIONS[e.fnKey] : null;
        return `<div style="padding:11px 14px;background:rgba(0,0,0,.35);
          border-left:2px solid ${col};display:flex;gap:11px;align-items:flex-start">
          <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:72px">
            <span style="font-family:var(--f-mono);font-size:7px;color:${col};
              border:1px solid ${col}44;padding:1px 5px">${e.type}</span>
            ${fn ? `<span style="font-family:var(--f-mono);font-size:7px;
              color:${fn.color}">${e.fnKey}</span>` : ''}
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
              line-height:1.7;word-break:break-word">${escH(e.text)}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);
              margin-top:4px">${_almTimeAgo(e.ts)}</div>
          </div>
          <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px">
            <button onclick="almExtToCanvas('${e.id}')" style="
              padding:3px 7px;border:1px solid rgba(255,255,255,.1);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7px">→</button>
            <button onclick="almExtDelete('${e.id}')" style="
              padding:3px 7px;border:none;background:none;cursor:pointer;
              color:var(--wire2);font-size:11px"
              onmouseenter="this.style.color='var(--r)'"
              onmouseleave="this.style.color='var(--wire2)'">×</button>
          </div>
        </div>`;
      }).join('')}
      ${!stream.length ? `<div style="font-family:var(--f-mono);font-size:8px;
        color:var(--dim);padding:20px 0;line-height:2">
        Nothing externalized yet.<br>
        <span style="color:var(--wire2)">The stream captures thinking-in-progress.<br>
        Not for polished thoughts — for raw ones.</span>
      </div>` : ''}
    </div>
  `;
  container.appendChild(right);

  // Init type selection
  window._almExtType = window._almExtType || 'observation';
  setTimeout(() => almExtSelectType(window._almExtType), 50);
}

let _almExtType = 'observation';
function almExtSelectType(t) {
  _almExtType = t;
  const typeColors = {question:'#00c8ff',observation:'#00ff88',hypothesis:'#cc44ff',
                      pattern:'#ff8c22',friction:'#ff3355',insight:'#ffe04a'};
  ['question','observation','hypothesis','pattern','friction','insight'].forEach(type => {
    const btn = document.getElementById('alm-ext-type-' + type);
    if (!btn) return;
    const col = typeColors[type];
    const isActive = type === t;
    btn.style.background = isActive ? col + '18' : 'transparent';
    btn.style.borderColor = isActive ? col : col + '44';
  });
}
function almExtTypeHover(t) { almExtSelectType(_almExtType); }

function almExternalizeLog() {
  const text = document.getElementById('alm-ext-text')?.value?.trim();
  if (!text) { mm_toast('Write something first', 'warn'); return; }
  const fnKey = document.getElementById('alm-ext-fn')?.value || null;
  ALM_STATE.externalizations.push({
    id: uuid(), text, type: _almExtType, fnKey: fnKey || null, ts: Date.now(),
  });
  almSave();
  document.getElementById('alm-ext-text').value = '';
  mm_toast('Externalized', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almExtToCanvas(id) {
  const e = ALM_STATE.externalizations.find(x => x.id === id);
  if (!e) return;
  const fn = e.fnKey ? COGNITIVE_FUNCTIONS[e.fnKey] : null;
  const typeMap = {question:'question',observation:'insight',
                   hypothesis:'seed',pattern:'pattern',friction:'friction',insight:'insight'};
  CANVAS.spawnNode(typeMap[e.type]||'concept', undefined, undefined, {
    title: e.text.slice(0,60),
    body: e.text.length > 60 ? e.text : '',
    color: fn?.color,
    tags: [e.type.toUpperCase(), ...(e.fnKey ? [e.fnKey] : [])],
  });
  mm_toast('→ canvas', 'export', { dur: 1200 });
}

function almExtDelete(id) {
  ALM_STATE.externalizations = ALM_STATE.externalizations.filter(x => x.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Heuristics ───────────────────────────────────────────────
function _almTabHeuristics(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '18px';
  container.style.maxWidth = '820px';

  const domainColors = {Cognition:'#00c8ff',Affective:'#ff66aa',Behavioral:'#ff8c22',
    Relational:'#11ddcc',Systems:'#ffe04a',Meta:'#cc44ff'};

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">HEURISTICS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Named rules of thumb for your mind. A heuristic is a pattern you've earned through
        experience, distilled into a form you can apply without re-deriving it every time.
      </div>
    </div>

    <!-- Add heuristic -->
    <div style="padding:16px;background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.15)">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#00ff88;margin-bottom:10px">+ NEW HEURISTIC</div>
      <input id="alm-h-text" placeholder="When X, do Y. / If I notice Z, it usually means... / My best work happens when..." style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:9px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(0,255,136,.2);padding:9px 12px;outline:none;margin-bottom:8px"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"
        onkeydown="if(event.key==='Enter')almAddHeuristic()"/>
      <div style="display:flex;gap:8px">
        <select id="alm-h-domain" style="
          flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
          <option value="">Domain (optional)</option>
          ${Object.keys(domainColors).map(d => `<option value="${d}">${d}</option>`).join('')}
        </select>
        <select id="alm-h-rel" style="
          flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
          <option value="">Reliability</option>
          <option value="high">High — trust by default</option>
          <option value="medium">Medium — verify first</option>
          <option value="low">Low — provisional</option>
        </select>
        <button onclick="almAddHeuristic()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.15)'"
          onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ ADD</button>
      </div>
    </div>

    <!-- Heuristics list -->
    <div style="display:flex;flex-direction:column;gap:8px">
      ${ALM_STATE.heuristics.length ? ALM_STATE.heuristics.map(h => {
        const dc = domainColors[h.domain] || '#00ff88';
        const rc = {high:'#00ff88',medium:'#ff8c22',low:'#ff3355'}[h.reliability] || 'var(--dim)';
        return `<div style="padding:12px 16px;background:rgba(0,0,0,.35);
          border:1px solid rgba(255,255,255,.06);border-left:3px solid ${dc};
          display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-family:var(--f-mono);font-size:9.5px;color:var(--bright);
              line-height:1.7;margin-bottom:6px">${escH(h.text)}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${h.domain ? `<span style="font-family:var(--f-mono);font-size:7px;
                color:${dc};border:1px solid ${dc}44;padding:1px 6px">${h.domain}</span>` : ''}
              ${h.reliability ? `<span style="font-family:var(--f-mono);font-size:7px;
                color:${rc}">${h.reliability} reliability</span>` : ''}
              <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2)">
                ${_almTimeAgo(h.ts)}</span>
            </div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button onclick="almHeuristicToCanvas('${h.id}')" style="
              padding:4px 9px;border:1px solid rgba(255,255,255,.1);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7px"
              onmouseenter="this.style.color='var(--c)'"
              onmouseleave="this.style.color='var(--dim)'">→</button>
            <button onclick="almDeleteHeuristic('${h.id}')" style="
              padding:4px 7px;border:none;background:none;cursor:pointer;
              color:var(--wire2);font-size:12px"
              onmouseenter="this.style.color='var(--r)'"
              onmouseleave="this.style.color='var(--wire2)'">×</button>
          </div>
        </div>`;
      }).join('') : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        padding:20px 0;line-height:2">
        No heuristics yet.<br>
        <span style="color:var(--wire2)">A heuristic is experience distilled.
        "When I'm tired, Ti gets unreliable."<br>
        "My Ni converges fastest in the hour after waking."<br>
        "When I feel friction, it's often Si flagging a pattern mismatch."</span>
      </div>`}
    </div>
  `;
}

function almAddHeuristic() {
  const text = document.getElementById('alm-h-text')?.value?.trim();
  if (!text) { mm_toast('Write the heuristic', 'warn'); return; }
  ALM_STATE.heuristics.push({
    id: uuid(), text,
    domain: document.getElementById('alm-h-domain')?.value || '',
    reliability: document.getElementById('alm-h-rel')?.value || 'medium',
    ts: Date.now(),
  });
  almSave();
  document.getElementById('alm-h-text').value = '';
  mm_toast('Heuristic added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almDeleteHeuristic(id) {
  ALM_STATE.heuristics = ALM_STATE.heuristics.filter(h => h.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almHeuristicToCanvas(id) {
  const h = ALM_STATE.heuristics.find(x => x.id === id);
  if (!h) return;
  CANVAS.spawnNode('heuristic', undefined, undefined, {
    title: h.text.slice(0,60),
    tags: ['HEURISTIC', ...(h.domain ? [h.domain.toUpperCase()] : [])],
  });
  mm_toast('Heuristic → canvas', 'export', { dur: 1200 });
}

// ── TAB: Frameworks ───────────────────────────────────────────────
function _almTabFrameworks(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '18px';

  // Built-in framework suggestions
  const SUGGESTED = [
    { name:'Polyvagal Theory', source:'Stephen Porges', desc:'Three nervous system states shape all behavior and cognition.' },
    { name:'IFS — Internal Family Systems', source:'Richard Schwartz', desc:'Parts, Self, managers, firefighters, exiles.' },
    { name:'NVC — Nonviolent Communication', source:'Marshall Rosenberg', desc:'Observation → Feeling → Need → Request.' },
    { name:'Cynefin', source:'Dave Snowden', desc:'Obvious, Complicated, Complex, Chaotic domains require different action.' },
    { name:'Double-Loop Learning', source:'Argyris', desc:'Change not just behavior but the governing variables that produce behavior.' },
    { name:'Theory of Constraints', source:'Eli Goldratt', desc:'Every system has one constraint. Find it. Exploit it. Subordinate everything else.' },
    { name:'OODA Loop', source:'Boyd', desc:'Observe → Orient → Decide → Act. Speed through the loop wins.' },
  ];

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">FRAMEWORKS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        Mental structures you actively use. Not a library — an active toolkit.
        Add frameworks you're working with. Tag how you're applying them.
      </div>
    </div>

    <!-- Add custom -->
    <div style="padding:14px;background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.12)">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#00ff88;margin-bottom:9px">+ ADD FRAMEWORK</div>
      <div style="display:flex;gap:7px;margin-bottom:7px">
        <input id="alm-fw-name" placeholder="Framework name…" style="
          flex:2;font-family:var(--f-mono);font-size:8.5px;color:var(--bright);
          background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          padding:7px 10px;outline:none"
          onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
          onblur="this.style.borderColor='rgba(0,255,136,.2)'"/>
        <input id="alm-fw-source" placeholder="Source / author" style="
          flex:1;font-family:var(--f-mono);font-size:8px;color:var(--muted);
          background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.15);
          padding:7px 9px;outline:none"/>
      </div>
      <textarea id="alm-fw-desc" placeholder="What does this framework do? How are you using it?" style="
        width:100%;box-sizing:border-box;height:52px;resize:none;
        font-family:var(--f-mono);font-size:8px;color:var(--bright);
        background:rgba(0,0,0,.45);border:1px solid rgba(0,255,136,.15);
        padding:7px;line-height:1.6;outline:none;margin-bottom:7px"></textarea>
      <div style="text-align:right">
        <button onclick="almAddFramework()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.15)'"
          onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ ADD</button>
      </div>
    </div>

    <!-- Active frameworks -->
    ${ALM_STATE.frameworks.length ? `
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">ACTIVE (${ALM_STATE.frameworks.length})</div>
      ${ALM_STATE.frameworks.map(f => `
        <div style="padding:12px 16px;background:rgba(0,0,0,.35);
          border:1px solid rgba(255,255,255,.06);margin-bottom:7px;
          display:flex;align-items:flex-start;gap:11px">
          <div style="flex:1">
            <div style="font-family:var(--f-display);font-size:10px;font-weight:700;
              letter-spacing:1px;color:#00ff88;margin-bottom:3px">${escH(f.name)}</div>
            ${f.source ? `<div style="font-family:var(--f-mono);font-size:7px;
              color:var(--dim);margin-bottom:5px">${escH(f.source)}</div>` : ''}
            ${f.desc ? `<div style="font-family:var(--f-mono);font-size:8px;
              color:var(--muted);line-height:1.6">${escH(f.desc)}</div>` : ''}
          </div>
          <button onclick="almDeleteFramework('${f.id}')" style="
            padding:4px 7px;border:none;background:none;cursor:pointer;
            color:var(--wire2);font-size:12px;flex-shrink:0"
            onmouseenter="this.style.color='var(--r)'"
            onmouseleave="this.style.color='var(--wire2)'">×</button>
        </div>`).join('')}
    </div>` : ''}

    <!-- Suggested -->
    <div>
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:var(--dim);margin-bottom:10px">SUGGESTED FRAMEWORKS</div>
      ${SUGGESTED.map(s => `
        <div style="padding:10px 14px;background:transparent;
          border:1px solid rgba(255,255,255,.05);margin-bottom:6px;
          display:flex;align-items:flex-start;gap:11px">
          <div style="flex:1">
            <div style="font-family:var(--f-display);font-size:9px;font-weight:700;
              color:var(--bright);margin-bottom:2px">${s.name}</div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);
              margin-bottom:4px">${s.source}</div>
            <div style="font-family:var(--f-mono);font-size:8px;
              color:var(--muted)">${s.desc}</div>
          </div>
          <button onclick="almAddSuggestedFramework('${s.name.replace(/'/g,"\'")}','${s.source.replace(/'/g,"\'")}','${s.desc.replace(/'/g,"\'")}')" style="
            padding:5px 11px;border:1px solid rgba(0,255,136,.3);
            color:#00ff88;background:transparent;cursor:pointer;
            font-family:var(--f-mono);font-size:7.5px;flex-shrink:0"
            onmouseenter="this.style.background='rgba(0,255,136,.08)'"
            onmouseleave="this.style.background='transparent'">+ ADD</button>
        </div>`).join('')}
    </div>
  `;
}

function almAddFramework() {
  const name = document.getElementById('alm-fw-name')?.value?.trim();
  if (!name) { mm_toast('Name required', 'warn'); return; }
  ALM_STATE.frameworks.push({
    id: uuid(), name,
    source: document.getElementById('alm-fw-source')?.value?.trim() || '',
    desc: document.getElementById('alm-fw-desc')?.value?.trim() || '',
    ts: Date.now(),
  });
  almSave();
  mm_toast('Framework added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almAddSuggestedFramework(name, source, desc) {
  if (ALM_STATE.frameworks.some(f => f.name === name)) { mm_toast('Already in your toolkit', 'info'); return; }
  ALM_STATE.frameworks.push({ id: uuid(), name, source, desc, ts: Date.now() });
  almSave();
  mm_toast(name + ' added', 'success', { dur: 1400 });
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almDeleteFramework(id) {
  ALM_STATE.frameworks = ALM_STATE.frameworks.filter(f => f.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── TAB: Feedback Loops ─────────────────────────────────────────────
// The header has claimed "· FEEDBACK" as part of ALM's scope from the
// start — this is that claim actually built. A feedback loop here is a
// real systems-thinking unit: trigger → observation → adjustment, typed
// as reinforcing (amplifies itself), balancing (self-corrects), or
// broken (should self-correct but doesn't — worth naming on its own).
function _almTabFeedback(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '18px';
  container.style.maxWidth = '820px';

  const loopColors = { reinforcing: '#ff8c22', balancing: '#00ff88', broken: '#ff3355' };
  const loopLabels = { reinforcing: 'Reinforcing — amplifies itself', balancing: 'Balancing — self-corrects', broken: "Broken — should self-correct, doesn't" };

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">FEEDBACK LOOPS</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);line-height:1.8">
        The loop: trigger → observe → adjust → repeat. Name the loop, not just the moment —
        a feedback loop is only useful once you can see it happening again.
      </div>
    </div>

    <!-- Add feedback loop -->
    <div style="padding:16px;background:rgba(0,255,136,.04);border:1px solid rgba(0,255,136,.15)">
      <div style="font-family:var(--f-display);font-size:8px;letter-spacing:2px;
        color:#00ff88;margin-bottom:10px">+ NEW FEEDBACK LOOP</div>
      <input id="alm-fb-trigger" placeholder="Trigger — what starts this loop?" style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:9px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(0,255,136,.2);padding:9px 12px;outline:none;margin-bottom:8px"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"/>
      <input id="alm-fb-observation" placeholder="Observation — what actually happens?" style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:9px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(0,255,136,.2);padding:9px 12px;outline:none;margin-bottom:8px"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"/>
      <input id="alm-fb-adjustment" placeholder="Adjustment — what changes the loop, if anything?" style="
        width:100%;box-sizing:border-box;font-family:var(--f-mono);font-size:9px;
        color:var(--bright);background:rgba(0,0,0,.5);
        border:1px solid rgba(0,255,136,.2);padding:9px 12px;outline:none;margin-bottom:8px"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"
        onkeydown="if(event.key==='Enter')almAddFeedback()"/>
      <div style="display:flex;gap:8px">
        <select id="alm-fb-type" style="
          flex:1;background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
          color:var(--muted);padding:7px;font-family:var(--f-mono);font-size:8px">
          <option value="reinforcing">Reinforcing</option>
          <option value="balancing">Balancing</option>
          <option value="broken">Broken</option>
        </select>
        <button onclick="almAddFeedback()" style="
          padding:7px 18px;border:1px solid rgba(0,255,136,.4);
          color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
          font-family:var(--f-mono);font-size:8px;letter-spacing:1px"
          onmouseenter="this.style.background='rgba(0,255,136,.15)'"
          onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ LOG LOOP</button>
      </div>
    </div>

    <!-- Feedback loops list -->
    <div style="display:flex;flex-direction:column;gap:8px">
      ${ALM_STATE.feedbackLoops.length ? ALM_STATE.feedbackLoops.slice().reverse().map(f => {
        const lc = loopColors[f.loopType] || '#00ff88';
        return `<div style="padding:12px 16px;background:rgba(0,0,0,.35);
          border:1px solid rgba(255,255,255,.06);border-left:3px solid ${lc};
          display:flex;align-items:flex-start;gap:12px">
          <div style="flex:1">
            <div style="font-family:var(--f-mono);font-size:7px;color:${lc};
              letter-spacing:1px;margin-bottom:6px">${(loopLabels[f.loopType] || f.loopType).toUpperCase()}</div>
            <div style="font-family:var(--f-mono);font-size:9px;color:var(--bright);line-height:1.8">
              <span style="color:var(--dim)">trigger →</span> ${escH(f.trigger) || '<span style="color:var(--wire2)">—</span>'}<br>
              <span style="color:var(--dim)">observe →</span> ${escH(f.observation) || '<span style="color:var(--wire2)">—</span>'}<br>
              <span style="color:var(--dim)">adjust →</span> ${escH(f.adjustment) || '<span style="color:var(--wire2)">—</span>'}
            </div>
            <div style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);margin-top:6px">
              ${_almTimeAgo(f.ts)}</div>
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0">
            <button onclick="almFeedbackToCanvas('${f.id}')" style="
              padding:4px 9px;border:1px solid rgba(255,255,255,.1);
              color:var(--dim);background:transparent;cursor:pointer;
              font-family:var(--f-mono);font-size:7px"
              onmouseenter="this.style.color='var(--c)'"
              onmouseleave="this.style.color='var(--dim)'">→</button>
            <button onclick="almDeleteFeedback('${f.id}')" style="
              padding:4px 7px;border:none;background:none;cursor:pointer;
              color:var(--wire2);font-size:12px"
              onmouseenter="this.style.color='var(--r)'"
              onmouseleave="this.style.color='var(--wire2)'">×</button>
          </div>
        </div>`;
      }).join('') : `<div style="font-family:var(--f-mono);font-size:8px;color:var(--dim);
        padding:20px 0;line-height:2">
        No feedback loops logged yet.<br>
        <span style="color:var(--wire2)">A reinforcing loop: "The more anxious I get, the more I check —
        the more I check, the more anxious I get."<br>
        A balancing loop: "When I overcommit, I get sick — and then I clear my calendar."<br>
        A broken loop: "I notice the pattern every time. It doesn't change anything yet."</span>
      </div>`}
    </div>
  `;
}

function almAddFeedback() {
  const trigger = document.getElementById('alm-fb-trigger')?.value.trim();
  const observation = document.getElementById('alm-fb-observation')?.value.trim();
  const adjustment = document.getElementById('alm-fb-adjustment')?.value.trim();
  const loopType = document.getElementById('alm-fb-type')?.value || 'reinforcing';
  if (!trigger && !observation && !adjustment) return;

  const entry = {
    id: typeof uuid === 'function' ? uuid() : Date.now().toString(36),
    trigger, observation, adjustment, loopType, ts: Date.now(),
  };
  ALM_STATE.feedbackLoops.push(entry);
  almSave();
  if (typeof almEmit === 'function') almEmit('alm.feedback.logged', { id: entry.id, loopType, ts: entry.ts });

  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almDeleteFeedback(id) {
  ALM_STATE.feedbackLoops = ALM_STATE.feedbackLoops.filter(f => f.id !== id);
  almSave();
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

function almFeedbackToCanvas(id) {
  const f = ALM_STATE.feedbackLoops.find(x => x.id === id);
  if (!f || typeof CANVAS === 'undefined') return;
  const CX = (-CANVAS.NX.panX / CANVAS.NX.zoom) + window.innerWidth / (2 * CANVAS.NX.zoom);
  const CY = (-CANVAS.NX.panY / CANVAS.NX.zoom) + (window.innerHeight - 38) / (2 * CANVAS.NX.zoom);
  CANVAS.spawnNode('feedback', CX, CY, {
    title: 'Feedback: ' + (f.trigger || f.loopType),
    body: [f.trigger && `Trigger: ${f.trigger}`, f.observation && `Observe: ${f.observation}`, f.adjustment && `Adjust: ${f.adjustment}`].filter(Boolean).join('\n'),
    tags: ['alm', 'feedback', f.loopType],
  });
  if (typeof enterCanvas === 'function') enterCanvas();
  if (typeof closeALM === 'function') closeALM();
}

// ── TAB: Log (delta + legacy) ─────────────────────────────────────
function _almTabLog(container) {
  container.style.flexDirection = 'column';
  container.style.overflowY = 'auto';
  container.style.padding = '24px 30px';
  container.style.gap = '16px';

  const deltas = JSON.parse(localStorage.getItem(ALM_DELTAS_KEY) || '[]');
  const typeColors = { insight:'#ff8c22',skill:'#00c8ff',pattern:'#cc44ff',
    intuition:'#ff66aa','inner-work':'#7744ff',horizon:'#d4a820' };

  container.innerHTML = `
    <div>
      <div style="font-family:var(--f-display);font-size:11px;font-weight:800;
        letter-spacing:4px;color:#00ff88;margin-bottom:5px">DELTA LOG</div>
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--dim)">
        Log improvements, insights, skill gains. Track the trajectory of change.
      </div>
    </div>
    <div style="display:flex;gap:7px">
      <input id="alm-delta-input" placeholder="What improved, shifted, or landed today…" style="
        flex:1;font-family:var(--f-mono);font-size:9px;color:var(--bright);
        background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
        padding:8px 12px;outline:none"
        onfocus="this.style.borderColor='rgba(0,255,136,.5)'"
        onblur="this.style.borderColor='rgba(0,255,136,.2)'"
        onkeydown="if(event.key==='Enter')almLogDelta()"/>
      <select id="alm-delta-type" style="
        background:rgba(0,0,0,.5);border:1px solid rgba(0,255,136,.2);
        color:var(--muted);padding:7px 10px;font-family:var(--f-mono);font-size:8px">
        <option value="insight">Insight</option>
        <option value="skill">Skill</option>
        <option value="pattern">Pattern</option>
        <option value="intuition">Intuition</option>
        <option value="inner-work">Inner Work</option>
        <option value="horizon">Horizon</option>
      </select>
      <button onclick="almLogDelta()" style="
        padding:8px 16px;border:1px solid rgba(0,255,136,.4);
        color:#00ff88;background:rgba(0,255,136,.07);cursor:pointer;
        font-family:var(--f-mono);font-size:8px"
        onmouseenter="this.style.background='rgba(0,255,136,.15)'"
        onmouseleave="this.style.background='rgba(0,255,136,.07)'">+ LOG</button>
    </div>
    <div style="display:flex;flex-direction:column;gap:6px">
      ${deltas.slice(0,50).map(d => {
        const col = typeColors[d.type] || '#00ff88';
        return `<div style="padding:8px 12px;background:rgba(0,0,0,.3);
          border-left:2px solid ${col};display:flex;align-items:center;gap:10px">
          <span style="font-family:var(--f-mono);font-size:7px;color:${col};
            border:1px solid ${col}44;padding:1px 6px;flex-shrink:0">${d.type}</span>
          <span style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);flex:1">
            ${escH(d.text)}</span>
          <span style="font-family:var(--f-mono);font-size:7px;color:var(--wire2);flex-shrink:0">
            ${d.ts ? new Date(d.ts).toLocaleDateString() : ''}</span>
        </div>`;
      }).join('')}
      ${!deltas.length ? `<div style="font-family:var(--f-mono);font-size:8px;
        color:var(--dim);padding:16px 0">No deltas yet.</div>` : ''}
    </div>
  `;
}

// Reusable core — writes a delta entry and emits the bus event, without
// needing any DOM input. This is the actual interconnection point: any
// module can log real growth signal here (Horizon seeds sprouting,
// commitments completing, Leverage Map high scores) without reaching
// into ALM's internals — same one-way dependency direction as every
// other cross-module wire this session (module → shared substrate, never
// module → module directly). Returns the entry so callers can reference it.
function almWriteDelta(type, text, meta) {
  const deltas = JSON.parse(localStorage.getItem(ALM_DELTAS_KEY) || '[]');
  const entry = { id: typeof uuid === 'function' ? uuid() : Date.now().toString(36), type, text, ts: Date.now(), ...(meta ? { meta } : {}) };
  deltas.unshift(entry); // newest first, matching how the render reads deltas.slice(0,50)
  localStorage.setItem(ALM_DELTAS_KEY, JSON.stringify(deltas));
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
  if (typeof almEmit === 'function') almEmit('alm.delta.logged', { id: entry.id, type, ts: entry.ts });
  // Deltas are growth signal — they belong in the shared lattice too.
  // EXCEPT when the caller already ingested this exact text (unified
  // capture does), otherwise one thought becomes two lattice nodes and
  // every downstream count is inflated.
  if (typeof latticeIngest === 'function' && !(meta && meta.skipLattice)) {
    try { latticeIngest('alm.delta', entry.id, text, { extra: { deltaType: type } }); } catch (e) {}
  }
  return entry;
}
window.almWriteDelta = almWriteDelta;

function almLogDelta() {
  const text = document.getElementById('alm-delta-input')?.value?.trim();
  if (!text) { mm_toast('Write what improved or shifted first', 'warn'); return; }
  const type = document.getElementById('alm-delta-type')?.value || 'insight';

  almWriteDelta(type, text);

  mm_toast('Delta logged', 'success', { dur: 1800 });
  const inputEl = document.getElementById('alm-delta-input');
  if (inputEl) inputEl.value = '';
  const overlay = document.getElementById('mm-alm-overlay');
  if (overlay) _renderALM(overlay);
}

// ── Canvas export ─────────────────────────────────────────────────
function almModelToCanvas(modelKey) {
  const model = HUMAN_MODELS[modelKey];
  if (!model) return;
  closeALM();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const hub = CANVAS.spawnNode('framework', undefined, undefined, {
      title: model.label + ' MODEL',
      body: model.core, color: model.color,
      tags: ['HUMAN-MODEL', model.loopType.toUpperCase()],
    });
    const obs = ALM_STATE.modelLog.filter(l => l.modelKey === modelKey).slice(-5);
    obs.forEach(o => {
      const n = CANVAS.spawnNode('insight', undefined, undefined, {
        title: (o.field ? '[' + o.field + '] ' : '') + o.value.slice(0,50),
        color: model.color, tags: [model.label.toUpperCase(), 'OBSERVATION'],
      });
      if (hub && n) CANVAS.addConn(hub.id, n.id, 'observed');
    });
    mm_toast(model.label + ' → canvas', 'export');
  }, 200);
}

function almExportToCanvas() {
  closeALM();
  CANVAS.enterCanvas();
  setTimeout(() => {
    const cx = window.innerWidth/2, cy = window.innerHeight/2;
    const models = Object.entries(HUMAN_MODELS);
    const hub = CANVAS.spawnNode('synthesis', cx, cy, {
      title: 'HUMAN SYSTEM', color: '#00ff88', tags: ['ALM', 'SYNTHESIS'],
    });
    models.forEach(([key, model], i) => {
      const angle = (i / models.length) * Math.PI * 2 - Math.PI/2;
      const r = 300;
      const n = CANVAS.spawnNode('framework', cx + Math.cos(angle)*r, cy + Math.sin(angle)*r, {
        title: model.label, color: model.color,
        body: model.core, tags: ['MODEL', model.loopType.toUpperCase()],
      });
      if (hub && n) CANVAS.addConn(hub.id, n.id, model.loopType);
    });
    mm_toast('All 8 models → canvas', 'export');
  }, 200);
}

// ── Utilities ─────────────────────────────────────────────────────
