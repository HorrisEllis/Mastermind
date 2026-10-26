/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK WIRE  ·  alk-wire.js  ·  v1.0.0                                  ║
 * ║  UUID: alk-wire-0000-2900-0000-000000000001                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Drop-in wiring for SpeechStateModule + FrameworkModel into the ALK stack.
 *
 * USAGE — add to index.html <script type="module"> block:
 *
 *   1. Import at top (alongside existing imports):
 *      import { createALKWire } from './modules/alk-wire.js';
 *
 *   2. Declare at top of state block (alongside htl = null):
 *      let alkWire = null;
 *
 *   3. Inside startSession(), after htl.start():
 *      alkWire = createALKWire({ bus, kernel });
 *      alkWire.start();
 *
 *   4. Inside stopSession(), after kernel.emit('alk.session.capture.stop'):
 *      if (alkWire) { alkWire.stop(); alkWire = null; }
 *
 *   5. Add the panel HTML (see PANEL HTML section at bottom of this file).
 *
 *   6. Add topbar button:
 *      <button class="tb-btn" id="btn-deep" onclick="toggleDeep()">◈ DEEP</button>
 *
 * WHAT THIS DOES:
 *   - Instantiates SpeechStateModule and FrameworkModel
 *   - Bridges the audio tone loop → alk.verbal.analysis.tone
 *     (the existing audioTick only emits energy to the HUD — this makes it
 *      a proper bus event that all downstream modules can consume)
 *   - Bridges Speech Recognition interim results → words_per_min estimation
 *   - Renders both modules' output into a new "DEEP" panel in the existing UI
 *   - Wires all cross-module event subscriptions
 *   - Handles session lifecycle (start/stop/reset)
 *
 * NO CHANGES to existing modules. Purely additive.
 */

import { SpeechStateModule }  from './speech-state-module.js';
import { FrameworkModel }      from './framework-model.js';

// ─── ALK Wire ─────────────────────────────────────────────────────────────────

export class ALKWire {
  constructor({ bus, kernel, config = {} } = {}) {
    if (!bus || !kernel) throw new Error('[ALKWire] bus and kernel required');

    this._bus    = bus;
    this._kernel = kernel;
    this._cfg    = config;

    // Module instances
    this._speech = null;
    this._fwk    = null;

    // Render state
    this._visible        = false;
    this._panelEl        = null;
    this._renderTimer    = null;
    this._lastSpeech     = null;
    this._lastFramework  = null;
    this._lastCoherence  = null;
    this._lastDysreg     = null;
    this._lastSimulation = null;

    // Active framework state (for panel rendering)
    this._activeFrameworks = [];
    this._contradictions   = [];
    this._rigidityAlerts   = [];
    this._anomalies        = [];
    this._speechMode       = null;
    this._fragmentation    = null;
    this._integration      = null;
    this._emotions         = null;
    this._grounding        = null;

    // Audio tone bridge state
    this._lastToneEmit = 0;
    this._toneWindow   = [];
    this._speechOnset  = null;

    // Transcript timing (for WPM)
    this._lastTranscriptTs  = 0;
    this._lastWordCount     = 0;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  start() {
    const kernel = this._kernel;
    const bus    = this._bus;

    // Build a kernel-compatible shim over the SISO bus
    // (SpeechStateModule and FrameworkModel use kernel.subscribe / kernel.emit)
    const kernelShim = {
      subscribe: (ch, fn) => bus.on(ch, fn),
      emit:      (type, payload, meta = {}) => bus.emit(type, payload),
    };

    // ── Instantiate modules ───────────────────────────────────────────────
    this._speech = new SpeechStateModule({
      kernel: kernelShim,
      config: this._cfg.speech ?? {},
    });

    this._fwk = new FrameworkModel({
      kernel: kernelShim,
      config: this._cfg.framework ?? {},
    });

    // ── Start modules ─────────────────────────────────────────────────────
    this._speech.start();
    this._fwk.start();

    // ── Bridge: audio energy loop → alk.verbal.analysis.tone ─────────────
    // The existing audioTick() writes to HUD elements but doesn't emit a
    // bus event. We hook into the latent.update stream (which fires every
    // frame) to drive a tone proxy. For real tone data we patch audioTick.
    this._patchAudioTick();

    // ── Bridge: transcript → words_per_min enrichment ─────────────────────
    bus.on('alk.verbal.transcript', (ev) => {
      const p   = ev.payload ?? ev;
      const now = Date.now();
      const words = (p.text ?? '').trim().split(/\s+/).filter(Boolean).length;

      if (this._lastTranscriptTs > 0) {
        const durMs  = now - this._lastTranscriptTs;
        const wpm    = words / (durMs / 60000);
        // Re-emit enriched version with wpm
        // (original already emitted — downstream modules see both)
        bus.emit('alk.verbal.transcript.enriched', {
          ...p,
          words_per_min: Math.round(Math.min(wpm, 400)), // cap pathological values
          duration_ms:   durMs,
        });
      }
      this._lastTranscriptTs = now;
      this._lastWordCount    = words;
    });

    // speech-state-module also subscribes to alk.verbal.transcript directly,
    // but we override its handler to use the enriched version when available
    bus.on('alk.verbal.transcript.enriched', (ev) => {
      const p = ev.payload ?? ev;
      // Re-emit as transcript so speech module picks up wpm
      bus.emit('alk.verbal.transcript', p);
    });

    // ── Subscribe to module outputs for rendering ─────────────────────────
    bus.on('alk.speech.mode',            (ev) => { this._speechMode    = ev.payload ?? ev; });
    bus.on('alk.speech.fragmentation',   (ev) => { this._fragmentation = ev.payload ?? ev; });
    bus.on('alk.speech.integration',     (ev) => { this._integration   = ev.payload ?? ev; });
    bus.on('alk.speech.emotion.spectrum',(ev) => { this._emotions      = ev.payload ?? ev; });
    bus.on('alk.speech.grounding',       (ev) => { this._grounding     = ev.payload ?? ev; });
    bus.on('alk.speech.dysregulation',   (ev) => {
      const p = ev.payload ?? ev;
      if (p.active) this._lastDysreg = p;
    });

    bus.on('alk.framework.active',       (ev) => { this._activeFrameworks = (ev.payload ?? ev).frameworks ?? []; });
    bus.on('alk.framework.contradiction',(ev) => {
      this._contradictions.unshift(ev.payload ?? ev);
      if (this._contradictions.length > 5) this._contradictions.pop();
    });
    bus.on('alk.framework.rigidity',     (ev) => {
      this._rigidityAlerts.unshift(ev.payload ?? ev);
      if (this._rigidityAlerts.length > 3) this._rigidityAlerts.pop();
    });
    bus.on('alk.framework.anomaly',      (ev) => {
      this._anomalies.unshift(ev.payload ?? ev);
      if (this._anomalies.length > 5) this._anomalies.pop();
    });
    bus.on('alk.framework.simulation',   (ev) => { this._lastSimulation = ev.payload ?? ev; });
    bus.on('alk.framework.coherence',    (ev) => { this._lastCoherence  = ev.payload ?? ev; });
    bus.on('alk.framework.inversion',    (ev) => {
      this._anomalies.unshift({ type: 'INVERSION', ...(ev.payload ?? ev) });
      if (this._anomalies.length > 5) this._anomalies.pop();
    });

    // ── Start panel render loop ───────────────────────────────────────────
    this._renderTimer = setInterval(() => this._render(), 500);

    console.log('[ALKWire] started — SpeechState + FrameworkModel online');
  }

  stop() {
    clearInterval(this._renderTimer);
    this._renderTimer = null;
    this._unpatchAudioTick();
    console.log('[ALKWire] stopped');
  }

  // ── Audio Tick Bridge ──────────────────────────────────────────────────

  /**
   * Patches the existing audioTick() loop to also emit alk.verbal.analysis.tone.
   * The existing loop writes to HUD elements — we add a bus emit alongside.
   *
   * Strategy: monkey-patch requestAnimationFrame inside the audio context
   * by intercepting the alk.latent.update frequency as a proxy clock, and
   * separately register a raw audio analysis interval.
   *
   * We use a 100ms interval on the raw analyser — cleaner than RAF patching.
   */
  _patchAudioTick() {
    // The analyser is on window._analyser (from _startAudio)
    // We poll it independently every 100ms
    this._toneInterval = setInterval(() => {
      const analyser = window._analyser;
      if (!analyser) return;

      const buf = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatTimeDomainData(buf);

      // RMS energy
      let sum = 0;
      for (const x of buf) sum += x * x;
      const energy = Math.sqrt(sum / buf.length);

      // ZCR
      let crossings = 0;
      for (let i = 1; i < buf.length; i++) {
        if ((buf[i] >= 0) !== (buf[i-1] >= 0)) crossings++;
      }
      const zcr = crossings / buf.length;

      // Spectral centroid (two-band approx — mirrors codec)
      const split = Math.floor(buf.length / 4);
      let lo = 0, hi = 0;
      for (let i = 0; i < buf.length; i++) {
        const e = buf[i] * buf[i];
        if (i < split * 2) lo += e; else hi += e;
      }
      const spectral = (lo + hi) > 0 ? hi / (lo + hi) : 0;

      // Cadence via energy history
      this._toneWindow.push(energy);
      if (this._toneWindow.length > 30) this._toneWindow.shift();
      const avgE = this._toneWindow.reduce((a, b) => a + b, 0) / this._toneWindow.length;
      let peaks = 0;
      for (let i = 1; i < this._toneWindow.length - 1; i++) {
        if (this._toneWindow[i] > avgE * 1.2 &&
            this._toneWindow[i] > this._toneWindow[i-1] &&
            this._toneWindow[i] > this._toneWindow[i+1]) peaks++;
      }
      const cadence = this._toneWindow.length > 3
        ? peaks / (this._toneWindow.length * 0.1)
        : 0;

      this._bus.emit('alk.verbal.analysis.tone', {
        energy:   Math.round(energy * 10000) / 10000,
        zcr:      Math.round(zcr    * 10000) / 10000,
        spectral: Math.round(spectral * 10000) / 10000,
        cadence:  Math.round(cadence  * 10000) / 10000,
        silence:  energy < 0.01,
      });

    }, 100);
  }

  _unpatchAudioTick() {
    clearInterval(this._toneInterval);
    this._toneInterval = null;
  }

  // ── Panel Rendering ────────────────────────────────────────────────────

  toggle() {
    this._visible = !this._visible;
    const panel = document.getElementById('deep-panel');
    const btn   = document.getElementById('btn-deep');
    if (panel) panel.classList.toggle('visible', this._visible);
    if (btn)   btn.classList.toggle('active',    this._visible);
  }

  _s(id, val, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = val ?? '–';
    if (cls) el.className = 'dp-val ' + cls;
  }

  _render() {
    if (!this._visible) return;

    // ── Speech Mode ────────────────────────────────────────────────────────
    const sm = this._speechMode;
    if (sm) {
      const modeColor = {
        external_processing: 'cyan',
        self_talk:           'violet',
        performative:        'amber',
        integrated:          'signal',
        collapsed:           'rose',
      }[sm.mode] ?? '';
      this._s('dp-speech-mode', sm.mode?.replace(/_/g, ' ') ?? '–', modeColor);
      this._s('dp-speech-conf', sm.confidence ? `${Math.round(sm.confidence * 100)}%` : '–');
    }

    // ── Fragmentation ──────────────────────────────────────────────────────
    const fr = this._fragmentation;
    if (fr) {
      const fragColor = fr.level === 'severe' ? 'rose' : fr.level === 'moderate' ? 'amber' : fr.level === 'mild' ? 'amber' : 'signal';
      this._s('dp-frag-level',   fr.level ?? 'none', fragColor);
      this._s('dp-frag-score',   fr.score != null ? fr.score.toFixed(2) : '–');
      this._s('dp-frag-markers', fr.markers?.slice(0,3).join(', ') || '–');
    }

    // ── Integration ────────────────────────────────────────────────────────
    const ig = this._integration;
    if (ig) {
      const integColor = ig.level_code >= 3 ? 'signal' : ig.level_code >= 2 ? 'cyan' : ig.level_code >= 1 ? 'amber' : 'rose';
      this._s('dp-integ-level', ig.level ?? '–', integColor);
      this._s('dp-integ-score', ig.score != null ? ig.score.toFixed(2) : '–');
    }

    // ── Grounding ──────────────────────────────────────────────────────────
    const gr = this._grounding;
    if (gr) {
      const gColor = gr.level === 'strongly_grounded' ? 'signal'
                   : gr.level === 'grounded'          ? 'signal'
                   : gr.level === 'partial'            ? 'cyan'
                   : gr.level === 'ungrounded'         ? 'amber'
                   : 'rose';
      this._s('dp-ground-level', gr.level?.replace(/_/g, ' ') ?? '–', gColor);
      this._s('dp-ground-score', gr.score != null ? gr.score.toFixed(2) : '–');
    }

    // ── Dysregulation ──────────────────────────────────────────────────────
    const dy = this._lastDysreg;
    if (dy?.active) {
      this._s('dp-dysreg-type',  dy.subtype?.replace(/_/g, ' ') ?? '–', 'rose');
      this._s('dp-dysreg-sig',   dy.signature?.slice(0, 80) ?? '–');
      this._s('dp-dysreg-int',   dy.intensity != null ? dy.intensity.toFixed(2) : '–');
    } else {
      this._s('dp-dysreg-type',  'none', 'signal');
      this._s('dp-dysreg-sig',   '–');
      this._s('dp-dysreg-int',   '–');
    }

    // ── Emotion spectrum ───────────────────────────────────────────────────
    const em = this._emotions;
    if (em) {
      const primary   = em.primary?.[0];
      const secondary = em.secondary?.[0];
      const tertiary  = em.tertiary?.[0];
      const suppressed = em.suppressed?.[0];
      this._s('dp-emo-primary',   primary   ? `${primary.emotion.toLowerCase()} (${primary.score.toFixed(2)})`   : '–', 'amber');
      this._s('dp-emo-secondary', secondary ? `${secondary.emotion.toLowerCase()} (${secondary.score.toFixed(2)})` : '–');
      this._s('dp-emo-tertiary',  tertiary  ? `${tertiary.emotion.toLowerCase()} (${tertiary.score.toFixed(2)})`  : '–', 'violet');
      this._s('dp-emo-suppressed',suppressed ? `${suppressed.emotion.toLowerCase()} (${suppressed.score.toFixed(2)})` : '–', 'rose');
      this._s('dp-emo-somatic',   em.somatic_emotion ? 'yes' : 'no', em.somatic_emotion ? 'amber' : '');
      this._s('dp-emo-transition',em.in_transition ? 'yes' : 'no', em.in_transition ? 'cyan' : '');
    }

    // ── Framework ─────────────────────────────────────────────────────────
    const fw = this._activeFrameworks;
    if (fw?.length > 0) {
      const top  = fw[0];
      const post = top?.posterior != null ? top.posterior.toFixed(2) : '–';
      const rig  = top?.rigidity  != null ? (top.rigidity * 100).toFixed(0) + '%' : '–';
      const rigColor = (top?.rigidity ?? 0) > 0.6 ? 'rose' : (top?.rigidity ?? 0) > 0.35 ? 'amber' : 'signal';

      this._s('dp-fwk-dominant',  top?.label?.slice(0, 40) ?? '–', 'amber');
      this._s('dp-fwk-post',      post);
      this._s('dp-fwk-rigidity',  rig, rigColor);
      this._s('dp-fwk-count',     fw.length.toString());

      // List up to 3 active frameworks
      const listEl = document.getElementById('dp-fwk-list');
      if (listEl) {
        listEl.innerHTML = fw.slice(0, 4).map(f =>
          `<div class="dp-fw-row">
            <span class="dp-fw-type">${(f.type ?? '').toLowerCase().replace(/_/g,' ')}</span>
            <span class="dp-fw-bar"><span class="dp-fw-fill" style="width:${Math.round((f.posterior??0)*100)}%"></span></span>
            <span class="dp-fw-rig ${(f.rigidity??0)>0.55?'dp-rig-hot':''}">${Math.round((f.rigidity??0)*100)}%</span>
           </div>`
        ).join('');
      }
    } else {
      this._s('dp-fwk-dominant', '–');
      this._s('dp-fwk-count',    '0');
    }

    // ── Simulation ────────────────────────────────────────────────────────
    const sim = this._lastSimulation;
    if (sim) {
      this._s('dp-sim-mode',   sim.mode?.replace(/_/g, ' ')    ?? '–', 'cyan');
      this._s('dp-sim-test',   sim.testing_framework?.toLowerCase() ?? '–');
      this._s('dp-sim-chain',  sim.chain_length ? `${sim.chain_length} deep` : '–');
    } else {
      this._s('dp-sim-mode', '–');
      this._s('dp-sim-test', '–');
      this._s('dp-sim-chain','–');
    }

    // ── Coherence ─────────────────────────────────────────────────────────
    const coh = this._lastCoherence;
    if (coh) {
      const cohColor = coh.global_coherence > 0.6 ? 'signal' : coh.global_coherence > 0.35 ? 'cyan' : 'rose';
      this._s('dp-coh-score',  coh.global_coherence?.toFixed(2) ?? '–', cohColor);
      this._s('dp-coh-gaps',   coh.gaps?.length.toString() ?? '0');
      this._s('dp-coh-edges',  coh.edges?.length.toString() ?? '0');
    }

    // ── Recent contradictions ─────────────────────────────────────────────
    const conEl = document.getElementById('dp-contradiction-list');
    if (conEl && this._contradictions.length > 0) {
      conEl.innerHTML = this._contradictions.slice(0, 3).map(c =>
        `<div class="dp-con-row">
          <span class="dp-con-fw">${(c.framework??'').toLowerCase().replace(/_/g,' ')}</span>
          <span class="dp-con-ev">${(c.evidence??'').slice(0,40)}</span>
         </div>`
      ).join('');
    }

    // ── Anomalies ─────────────────────────────────────────────────────────
    const anEl = document.getElementById('dp-anomaly-list');
    if (anEl && this._anomalies.length > 0) {
      anEl.innerHTML = this._anomalies.slice(0, 3).map(a =>
        `<div class="dp-an-row">
          <span class="dp-an-type ${a.type==='INVERSION'?'dp-inversion':''}">${(a.type??'').toLowerCase().replace(/_/g,' ')}</span>
          <span class="dp-an-desc">${(a.description??a.tension??'').slice(0,50)}</span>
         </div>`
      ).join('');
    }

    // ── Rigidity alerts ────────────────────────────────────────────────────
    const rigEl = document.getElementById('dp-rigidity-list');
    if (rigEl && this._rigidityAlerts.length > 0) {
      rigEl.innerHTML = this._rigidityAlerts.slice(0, 2).map(r =>
        `<div class="dp-rig-row">
          <span class="dp-rig-fw">${(r.framework??'').toLowerCase().replace(/_/g,' ')}</span>
          <span class="dp-rig-score">${Math.round((r.rigidity_score??0)*100)}%</span>
          <span class="dp-rig-pat">${(r.pattern??'').slice(0,40)}</span>
         </div>`
      ).join('');
    }
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createALKWire({ bus, kernel, config = {} } = {}) {
  return new ALKWire({ bus, kernel, config });
}

export default { createALKWire, ALKWire };


/* ═══════════════════════════════════════════════════════════════════════════════
 * PANEL HTML
 * Add this block inside the #video-pane div in index.html,
 * alongside the existing #htl-panel div.
 * ═══════════════════════════════════════════════════════════════════════════════

<div id="deep-panel">
  <div class="dp-header">
    <span>DEEP SIGNAL</span>
    <span class="dp-uuid">alk-wire-0000-2900-0000-000000000001</span>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Speech</div>
    <div class="dp-row"><span class="dp-key">mode</span><span class="dp-val signal" id="dp-speech-mode">–</span></div>
    <div class="dp-row"><span class="dp-key">conf</span><span class="dp-val" id="dp-speech-conf">–</span></div>
    <div class="dp-row"><span class="dp-key">fragment</span><span class="dp-val" id="dp-frag-level">–</span></div>
    <div class="dp-row"><span class="dp-key">frag score</span><span class="dp-val" id="dp-frag-score">–</span></div>
    <div class="dp-row"><span class="dp-key">markers</span><span class="dp-val" id="dp-frag-markers">–</span></div>
    <div class="dp-row"><span class="dp-key">integration</span><span class="dp-val" id="dp-integ-level">–</span></div>
    <div class="dp-row"><span class="dp-key">integ score</span><span class="dp-val" id="dp-integ-score">–</span></div>
    <div class="dp-row"><span class="dp-key">grounding</span><span class="dp-val" id="dp-ground-level">–</span></div>
    <div class="dp-row"><span class="dp-key">ground score</span><span class="dp-val" id="dp-ground-score">–</span></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Dysregulation</div>
    <div class="dp-row"><span class="dp-key">type</span><span class="dp-val signal" id="dp-dysreg-type">–</span></div>
    <div class="dp-row"><span class="dp-key">intensity</span><span class="dp-val" id="dp-dysreg-int">–</span></div>
    <div class="dp-row"><span class="dp-key">signature</span><span class="dp-val" id="dp-dysreg-sig">–</span></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Emotion Spectrum</div>
    <div class="dp-row"><span class="dp-key">primary</span><span class="dp-val amber" id="dp-emo-primary">–</span></div>
    <div class="dp-row"><span class="dp-key">secondary</span><span class="dp-val" id="dp-emo-secondary">–</span></div>
    <div class="dp-row"><span class="dp-key">tertiary</span><span class="dp-val violet" id="dp-emo-tertiary">–</span></div>
    <div class="dp-row"><span class="dp-key">suppressed</span><span class="dp-val rose" id="dp-emo-suppressed">–</span></div>
    <div class="dp-row"><span class="dp-key">somatic</span><span class="dp-val" id="dp-emo-somatic">–</span></div>
    <div class="dp-row"><span class="dp-key">transition</span><span class="dp-val" id="dp-emo-transition">–</span></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Framework Model</div>
    <div class="dp-row"><span class="dp-key">dominant</span><span class="dp-val amber" id="dp-fwk-dominant">–</span></div>
    <div class="dp-row"><span class="dp-key">posterior</span><span class="dp-val" id="dp-fwk-post">–</span></div>
    <div class="dp-row"><span class="dp-key">rigidity</span><span class="dp-val signal" id="dp-fwk-rigidity">–</span></div>
    <div class="dp-row"><span class="dp-key">active</span><span class="dp-val" id="dp-fwk-count">–</span></div>
    <div id="dp-fwk-list" class="dp-fw-list"></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Simulation Mode</div>
    <div class="dp-row"><span class="dp-key">type</span><span class="dp-val cyan" id="dp-sim-mode">–</span></div>
    <div class="dp-row"><span class="dp-key">testing</span><span class="dp-val" id="dp-sim-test">–</span></div>
    <div class="dp-row"><span class="dp-key">depth</span><span class="dp-val" id="dp-sim-chain">–</span></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Coherence</div>
    <div class="dp-row"><span class="dp-key">global</span><span class="dp-val signal" id="dp-coh-score">–</span></div>
    <div class="dp-row"><span class="dp-key">gaps</span><span class="dp-val" id="dp-coh-gaps">–</span></div>
    <div class="dp-row"><span class="dp-key">edges</span><span class="dp-val" id="dp-coh-edges">–</span></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Contradictions</div>
    <div id="dp-contradiction-list" class="dp-list"></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Rigidity Alerts</div>
    <div id="dp-rigidity-list" class="dp-list"></div>
  </div>

  <div class="dp-section">
    <div class="dp-sect-label">Anomalies</div>
    <div id="dp-anomaly-list" class="dp-list"></div>
  </div>
</div>


 * ═══════════════════════════════════════════════════════════════════════════════
 * CSS — add inside <style> in index.html
 * ═══════════════════════════════════════════════════════════════════════════════

#deep-panel {
  position:absolute;top:12px;right:12px;
  background:rgba(2,7,5,.96);border:1px solid var(--wire2);
  width:300px;max-height:calc(100% - 24px);overflow-y:auto;
  pointer-events:none;z-index:25;backdrop-filter:blur(4px);
  display:none;font-family:var(--mono);font-size:7px;
}
#deep-panel.visible { display:block; }
.dp-header {
  display:flex;align-items:center;justify-content:space-between;
  padding:6px 10px 5px;border-bottom:1px solid var(--wire);
  font-size:6px;letter-spacing:2px;color:var(--signal);text-transform:uppercase;
  position:sticky;top:0;background:rgba(2,7,5,.98);z-index:1;
}
.dp-uuid { color:var(--wire2);font-size:5px; }
.dp-section { border-bottom:1px solid var(--wire);padding:5px 10px; }
.dp-section:last-child { border-bottom:none; }
.dp-sect-label { font-size:5px;letter-spacing:2px;color:var(--dim);text-transform:uppercase;margin-bottom:4px; }
.dp-row { display:flex;justify-content:space-between;gap:8px;margin-bottom:2px; }
.dp-key { color:var(--muted);font-size:6px;flex-shrink:0; }
.dp-val { color:var(--bright);font-size:6px;text-align:right;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
.dp-val.signal  { color:var(--signal); }
.dp-val.amber   { color:var(--amber); }
.dp-val.rose    { color:var(--rose); }
.dp-val.cyan    { color:var(--cyan); }
.dp-val.violet  { color:var(--violet); }
.dp-fw-list { margin-top:4px; }
.dp-fw-row  { display:flex;align-items:center;gap:5px;margin-bottom:3px; }
.dp-fw-type { color:var(--muted);font-size:6px;width:80px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis; }
.dp-fw-bar  { flex:1;height:3px;background:var(--wire);overflow:hidden; }
.dp-fw-fill { height:100%;background:var(--signal2);transition:width .3s; }
.dp-fw-rig  { font-size:6px;color:var(--dim);width:28px;text-align:right; }
.dp-rig-hot { color:var(--rose); }
.dp-list    { margin-top:4px; }
.dp-con-row, .dp-an-row, .dp-rig-row {
  display:flex;gap:6px;padding:2px 0;border-bottom:0.5px solid var(--wire);
  font-size:6px;
}
.dp-con-row:last-child, .dp-an-row:last-child, .dp-rig-row:last-child { border-bottom:none; }
.dp-con-fw, .dp-an-type, .dp-rig-fw { color:var(--amber);flex-shrink:0;width:70px;overflow:hidden;text-overflow:ellipsis; }
.dp-con-ev, .dp-an-desc, .dp-rig-pat { color:var(--dim);flex:1;overflow:hidden;text-overflow:ellipsis; }
.dp-rig-score { color:var(--rose);width:28px;text-align:right;flex-shrink:0; }
.dp-inversion { color:var(--cyan) !important; }


 * ═══════════════════════════════════════════════════════════════════════════════
 * INDEX.HTML DIFF — exact blocks to add/replace
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * 1. ADD to imports (after the existing createHTL import line):
 *
 *    import { createALKWire } from './modules/alk-wire.js';
 *
 *
 * 2. ADD to state declarations (after: let htl = null;):
 *
 *    let alkWire = null;
 *
 *
 * 3. ADD in startSession(), after the htl block (after htl.start() + _htlStartRender()):
 *
 *    // ── SpeechState + FrameworkModel (deep signal layer) ──────────────────
 *    alkWire = createALKWire({ bus, kernel });
 *    alkWire.start();
 *    _deepPanelInit();
 *    console.log('[ALKWire] deep signal layer online');
 *
 *
 * 4. ADD in stopSession(), after kernel.emit('alk.session.capture.stop'):
 *
 *    if (alkWire) { alkWire.stop(); alkWire = null; }
 *
 *
 * 5. ADD window function (after window.toggleHTL = toggleHTL):
 *
 *    function toggleDeep() {
 *      if (alkWire) alkWire.toggle();
 *      const btn = document.getElementById('btn-deep');
 *      if (btn) btn.classList.toggle('active', alkWire?._visible);
 *    }
 *    window.toggleDeep = toggleDeep;
 *
 *    function _deepPanelInit() {
 *      // Nothing to do — panel subscribes via alkWire
 *    }
 *
 *
 * 6. ADD topbar button (after the HTL button):
 *
 *    <button class="tb-btn" id="btn-deep" onclick="toggleDeep()">◈ DEEP</button>
 *
 *
 * 7. Place the new modules in ALK/modules/:
 *
 *    ALK/modules/alk-wire.js            ← this file
 *    ALK/modules/speech-state-module.js ← speech state module
 *    ALK/modules/framework-model.js     ← framework model
 *
 *
 * 8. UPDATE MANIFEST.json — add to "modules":
 *
 *    "speech":    "modules/speech-state-module.js",
 *    "framework": "modules/framework-model.js",
 *    "wire":      "modules/alk-wire.js"
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * THAT'S IT. The full stack is:
 *
 *   MediaPipe (face/pose/hands)
 *     → VideoModule → ExpressionEngine → SignalTopology
 *     → LatentModel → SuppressionScore
 *     → TrajectoryRecorder → AttractorLandscape → FieldPortrait
 *     → ALKMesh (audio bridge)
 *     → HTL (12 modules: NS, EMO, COG, NEED, VAL, ATT, MOD, LANG, SOM, GAP, XLAT, REL)
 *     → SpeechStateModule (mode, fragmentation, dysregulation, grounding, emotion spectrum, integration, self-reference, rhythm)
 *     → FrameworkModel (10 belief systems, Bayesian update, sigma fields, simulation detection, coherence, inversion, anomaly)
 *
 * One person. One lattice. Everything writes to the same bus.
 * ═══════════════════════════════════════════════════════════════════════════════
 */
