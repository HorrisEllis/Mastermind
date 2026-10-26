// ═══════════════════════════════════════════════════════════════════
// MASTERMIND × WARP — navigation spine
// Version: package.json (§5.4 — never hardcode it here)
//
// Makes WARP (core/Event, Gate, Axiom, Stream, StreamLog) the actual
// dispatch path for navigation, rather than a logging layer bolted on
// after the fact. Every wrapped action below is a Gate; calling the
// public function just emits an Event into MM_WARP.stream, and the
// Gate's transform() is what performs the real navigation. Reject an
// Event (hard Axiom fails) and the navigation simply doesn't happen —
// same "never silently complete, never silently drop" guarantee WARP's
// spec makes for generated code, now applied to user navigation too.
//
// Scope: this pass wires the Brain Map lifecycle (open → mode-select →
// enter mode → back → close) and the remaining homepage card
// navigation — the surface this session actually touched. Other
// modules (Horizon, ALM, Voice Lattice, Vault, etc.) still call their
// functions directly; the same register()/emit() pattern below extends
// to them the same way when you're ready to route more of the app
// through the spine.
//
// Inspect the audit trail any time from devtools:
//   MM_WARP.log.entries()
//   MM_WARP.stream.rejected   // hard-axiom rejections, if any
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {
  if (typeof WARP === 'undefined') {
    console.warn('[MM_WARP] warp-core.js did not load — navigation spine disabled, using direct calls');
    return;
  }

  const log = new WARP.StreamLog();
  const stream = new WARP.Stream({ log });

  // ── Axiom: a brain-map mode transition must target a real, declared mode ──
  stream.registerAxiom(new WARP.Axiom('valid-brain-mode', {
    severity: 'hard',
    check(event) {
      if (event.type !== 'brain.mode.enter') return true;
      return typeof BRAIN_MODES !== 'undefined' && !!BRAIN_MODES[event.data.modeKey];
    },
  }));

  // ── Axiom: a homepage card navigation must target a registered handler ──
  stream.registerAxiom(new WARP.Axiom('valid-nav-card', {
    severity: 'hard',
    check(event) {
      if (event.type !== 'nav.home.card') return true;
      return typeof _cardHandlers[event.data.card] === 'function';
    },
  }));

  // ── Real implementations, captured before we replace the public names ──
  const _real = {
    brainEnterMode: window.brainEnterMode,
    brainSkipModeSelect: window.brainSkipModeSelect,
    brainBackToModeSelect: window.brainBackToModeSelect,
    closeBrainMap: window.closeBrainMap,
    openBrainMap: window.openBrainMap,
    brainOpenRelSysSelector: window.brainOpenRelSysSelector,
    brainRelSysBack: window.brainRelSysBack,
  };

  // ── Gates: Brain Map lifecycle ─────────────────────────────────────
  stream.register(new WARP.Gate('brain.mode.enter', {
    transform(event) {
      _real.brainEnterMode(event.data.modeKey);
      return new WARP.Event('brain.mode.entered', event.data);
    },
  }));
  stream.register(new WARP.Gate('brain.mode.entered', { transform() { return null; } }));

  stream.register(new WARP.Gate('brain.skip', {
    transform() {
      _real.brainSkipModeSelect();
      return new WARP.Event('brain.opened', { via: 'skip' });
    },
  }));
  stream.register(new WARP.Gate('brain.back', {
    transform() {
      _real.brainBackToModeSelect();
      return new WARP.Event('brain.opened', { via: 'back' });
    },
  }));
  stream.register(new WARP.Gate('brain.close', {
    transform() {
      _real.closeBrainMap();
      return new WARP.Event('brain.closed', {});
    },
  }));
  stream.register(new WARP.Gate('brain.opened', { transform() { return null; } }));
  stream.register(new WARP.Gate('brain.closed', { transform() { return null; } }));

  stream.register(new WARP.Gate('brain.relsys.open', {
    transform() {
      _real.brainOpenRelSysSelector();
      return new WARP.Event('brain.relsys.opened', {});
    },
  }));
  stream.register(new WARP.Gate('brain.relsys.back', {
    transform() {
      _real.brainRelSysBack();
      return new WARP.Event('brain.opened', { via: 'relsys-back' });
    },
  }));
  stream.register(new WARP.Gate('brain.relsys.opened', { transform() { return null; } }));

  // ── Gates: homepage card navigation ────────────────────────────────
  const _cardHandlers = {
    'brain':        () => { enterCanvas(); _real.openBrainMap(); },
    'brain-canvas': () => enterCanvas(),
    'brain-modes':  () => _real.openBrainMap(),
    'void':         () => enterVoid(),
    'horizon':      () => openHorizon(),
    'alm':          () => openALM(),
    'memory':       () => openMemory(),
    // The Associative Lattice's old standalone overlay (openLattice, a
    // single SESSIONS tab) and its own homepage card are gone. Voice
    // Lattice is the one entry point now — SESSIONS and LATTICE are
    // tabs inside it, reached via the tab bar, not a second card.
    'voice':        () => { VL_STATE.activeTab = 'capture'; openVoiceLattice(); },
    'options':      () => openOptions(),
  };

  stream.register(new WARP.Gate('nav.home.card', {
    transform(event) {
      _cardHandlers[event.data.card]();
      return new WARP.Event('nav.opened', event.data);
    },
  }));
  stream.register(new WARP.Gate('nav.opened', { transform() { return null; } }));

  // ── Replace public entry points with Stream-piped versions ─────────
  window.brainEnterMode = function (modeKey) {
    stream.emit(new WARP.Event('brain.mode.enter', { modeKey }));
  };
  window.brainSkipModeSelect = function () {
    stream.emit(new WARP.Event('brain.skip', {}));
  };
  window.brainBackToModeSelect = function () {
    stream.emit(new WARP.Event('brain.back', {}));
  };
  window.closeBrainMap = function () {
    stream.emit(new WARP.Event('brain.close', {}));
  };
  window.brainOpenRelSysSelector = function () {
    stream.emit(new WARP.Event('brain.relsys.open', {}));
  };
  window.brainRelSysBack = function () {
    stream.emit(new WARP.Event('brain.relsys.back', {}));
  };

  window.MM_WARP = {
    stream,
    log,
    // Public helper for homepage card onclicks — see index-browser.html
    navigateCard(card) {
      stream.emit(new WARP.Event('nav.home.card', { card }));
    },
  };
})();
