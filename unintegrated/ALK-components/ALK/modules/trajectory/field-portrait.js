/**
 * @module       field-portrait
 * @uuid         fedcba98-7654-4321-0fed-cba987654321
 * @version      1.0.0
 *
 * Field Portrait — maps a person's attractor landscape to person-specific
 * CFR particle field parameters, making the field a portrait of this
 * person rather than a generic physics simulation.
 *
 * ── THE IDEA ─────────────────────────────────────────────────────────────────
 *
 *   Right now the CFR field has generic physics. Entropy=0.12, structure=0.92,
 *   curl=0.45. These are tuned for a hypothetical average person.
 *
 *   But every person has a unique emotional topology. Someone whose typical
 *   resting state is mildly negative + high suppression + high arousal
 *   should produce a different field than someone whose resting state is
 *   positive + low suppression + low arousal. The physics should match
 *   the person's emotional physics.
 *
 *   Field Portrait computes person-specific field parameters from the
 *   attractor landscape and live latent state, then feeds them to ALK-GL.
 *
 * ── PARAMETER MAPPING ────────────────────────────────────────────────────────
 *
 *   ENTROPY    ← f(suppression, bifurcation_rate, arousal_range)
 *                High suppression → more turbulence (regulation is work)
 *                High bifurcation rate → more chaotic field
 *                Wide arousal range → more dynamic field
 *
 *   STRUCTURE  ← f(coherence, attractor_depth, landscape_stability)
 *                High coherence → structured field
 *                Deep attractors → organized topology
 *                Stable landscape → consistent structure
 *
 *   CURL       ← f(engagement, transition_frequency, arousal)
 *                High engagement → directed flow
 *                Frequent transitions → more rotational motion
 *                High arousal → more curl energy
 *
 *   DAMPING    ← f(suppression_peak, arousal_mean)
 *                High suppression → more damping (regulation slows the field)
 *                Low arousal → more damping (calm person, calm field)
 *
 *   POINT_SIZE ← f(arousal, dwell_time)
 *                High arousal → larger, more energetic points
 *                Long dwell → smaller, more precise points
 *
 *   COLOR_BIAS ← f(valence, suppression)
 *                Positive valence + low suppression → cool greens/cyans
 *                Negative valence → warm oranges/reds
 *                High suppression → desaturated, murky
 *
 * ── LIVE MODULATION ──────────────────────────────────────────────────────────
 *
 *   The person-specific parameters are the BASE — the field at rest.
 *   Live latent state continuously modulates AROUND this base:
 *
 *     actual_entropy = base_entropy + live_modulation * delta_entropy
 *
 *   This means the field is always true to this person while still
 *   responding to what's happening moment-to-moment.
 *
 * ── ATTRACTOR VISUALIZATION ──────────────────────────────────────────────────
 *
 *   Each landscape attractor becomes a persistent particle field attractor
 *   in world space. Deep attractors = heavy mass. Shallow = light.
 *   The field itself shows the landscape topology — you can SEE where the
 *   person's emotional gravity wells are.
 *
 *   Current latent state position in the landscape → particle focus point.
 *   As the person moves through their landscape, the particle focus moves
 *   through the topology visualization.
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.landscape.warmstart   — load landscape → compute base params
 *     alk.landscape.updated     — landscape updated → recompute base params
 *     alk.latent.update         — live state → modulate around base
 *     alk.suppression.event     — suppression level change → field shift
 *     alk.trajectory.bifurcation — bifurcation → stress injection
 *
 *   Emits:
 *     alk.portrait.params       — complete field parameter set (every N frames)
 *     alk.portrait.base         — base params changed (new landscape)
 *     alk.portrait.pulse        — §1.8 heartbeat
 */

'use strict';

export const PORTRAIT_UUID    = 'fedcba98-7654-4321-0fed-cba987654321';
export const PORTRAIT_VERSION = '1.9.0';

const EMIT_INTERVAL = 5; // emit params every N frames

// ── Default base (no landscape) ───────────────────────────────────────────────
const DEFAULT_BASE = {
  entropy:   0.12,
  structure: 0.92,
  curl:      0.45,
  damping:   0.14,
  vmax:      0.35,
  pointSize: 1.4,
  colorBias: 'neutral', // 'warm' | 'cool' | 'neutral' | 'murky'
};

export class FieldPortrait {
  /**
   * @param {object} opts
   * @param {object} opts.bus
   * @param {object} [opts.alkgl]  — direct reference to ALK-GL instance for immediate updates
   */
  constructor({ bus, alkgl = null } = {}) {
    this._bus   = bus;
    this._alkgl = alkgl;
    this._frame = 0;

    // Base parameters (from landscape)
    this._base = { ...DEFAULT_BASE };

    // Live modulation (from latent state)
    this._live = { entropy:0, structure:0, curl:0 };

    // Current combined params
    this._current = { ...DEFAULT_BASE };

    // Landscape reference
    this._landscape = null;
    this._personId  = null;

    // Live latent state
    this._latent = { valence:0, arousal:0, suppression:0, coherence:0, engagement:0 };

    if (bus) this._bindBus();
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;
    b.on('alk.landscape.warmstart', ev => this._onLandscape(ev.payload ?? ev));
    b.on('alk.landscape.updated',   ev => this._onLandscape((ev.payload ?? ev).landscape ?? ev.payload ?? ev));
    b.on('alk.landscape.new',       ev => this._onLandscape((ev.payload ?? ev).landscape ?? ev.payload ?? ev));
    b.on('alk.latent.update',       ev => this._onLatent(ev.payload ?? ev));
    b.on('alk.suppression.event',   ev => this._onSuppression(ev.payload ?? ev));
    b.on('alk.trajectory.bifurcation', ev => this._onBifurcation(ev.payload ?? ev));
    b.on('alk.video.frame.analyzed', ev => {
      this._frame = (ev.payload ?? ev).frameIndex ?? this._frame + 1;
      if (this._frame % EMIT_INTERVAL === 0) this._applyAndEmit();
    });
  }

  // ── Landscape → base parameters ───────────────────────────────────────────

  _onLandscape(landscape) {
    if (!landscape?.attractors) {
      // warmstart payload
      this._computeBaseFromWarmstart(landscape);
      return;
    }
    this._landscape = landscape;
    this._personId  = landscape.personId;
    this._computeBase();
    this._emit('alk.portrait.base', { personId: this._personId, base: { ...this._base } });
  }

  _computeBaseFromWarmstart(ws) {
    // Warmstart has: restingState, deepestAttractor, suppressionProfile
    if (!ws?.restingState) return;
    const [valence, arousal, suppression, coherence, engagement] = ws.restingState;
    const suppProfile = ws.suppressionProfile ?? { mean:0, peak:0 };

    this._base = {
      entropy:   r4(clamp(0.06 + suppression * 0.25 + Math.max(0, arousal - 0.5) * 0.10, 0.05, 0.40)),
      structure: r4(clamp(0.70 + coherence * 0.25 - suppression * 0.10, 0.40, 0.98)),
      curl:      r4(clamp(0.30 + Math.abs(engagement) * 0.20 + arousal * 0.15, 0.20, 0.80)),
      damping:   r4(clamp(0.08 + suppProfile.mean * 0.12 + (1 - arousal) * 0.05, 0.05, 0.30)),
      vmax:      r4(clamp(0.20 + arousal * 0.25, 0.15, 0.50)),
      pointSize: r4(clamp(1.0 + arousal * 0.8, 0.8, 2.5)),
      colorBias: this._colorBias(valence, suppression),
    };
    this._emit('alk.portrait.base', { personId: ws.personId, base: { ...this._base }, fromWarmstart: true });
  }

  _computeBase() {
    const land = this._landscape;
    if (!land?.attractors?.length) return;

    const totalDepth = land.attractors.reduce((s,a) => s+a.depth, 0);

    // Weighted means across attractors by depth
    const wMean = (fn) => land.attractors.reduce((s,a) => s + fn(a) * a.depth, 0) / (totalDepth || 1);

    const meanSupp    = wMean(a => a.suppProfile?.mean ?? 0);
    const peakSupp    = land.suppressionProfile?.peak ?? 0;
    const meanArousal = (land.restingState ?? [0,0.5,0,0.5,0])[1];
    const meanCoh     = (land.restingState ?? [0,0.5,0,0.5,0])[3];
    const meanEngage  = (land.restingState ?? [0,0.5,0,0.5,0])[4];
    const meanValence = (land.restingState ?? [0,0.5,0,0.5,0])[0];
    const bifurcRate  = land.bifurcationCount / Math.max(1, land.sessionCount);
    const landscapeStability = wMean(a => a.stability);

    this._base = {
      // Entropy: suppression + bifurcation rate + arousal range
      entropy:   r4(clamp(0.06 + meanSupp * 0.22 + Math.min(bifurcRate/10, 0.08) + Math.max(0, meanArousal-0.5)*0.08, 0.04, 0.42)),

      // Structure: coherence + landscape stability + deep attractors
      structure: r4(clamp(0.55 + meanCoh * 0.30 + landscapeStability * 0.15 - meanSupp * 0.08, 0.35, 0.98)),

      // Curl: engagement + transition frequency + arousal
      curl:      r4(clamp(0.25 + Math.abs(meanEngage) * 0.22 + meanArousal * 0.18, 0.15, 0.82)),

      // Damping: suppression peak + inverse arousal
      damping:   r4(clamp(0.06 + peakSupp * 0.14 + (1-meanArousal) * 0.06, 0.04, 0.28)),

      // Vmax: arousal-driven particle speed
      vmax:      r4(clamp(0.18 + meanArousal * 0.28, 0.12, 0.55)),

      // Point size: arousal + landscape depth
      pointSize: r4(clamp(0.9 + meanArousal * 0.9 + landscapeStability * 0.3, 0.7, 2.8)),

      // Color bias from valence + suppression
      colorBias: this._colorBias(meanValence, meanSupp),
    };

    // Build landscape attractors as persistent CFR attractors
    // Deep attractors = heavy mass, appear as topology wells in the field
    if (this._alkgl) {
      for (const a of land.attractors) {
        // Map 5D latent → 3D CFR world
        // Valence → X, Arousal → Y, Suppression → Z
        const wx = a.center[0] * 4;       // valence: [-4, +4]
        const wy = (a.center[1] - 0.5) * 6; // arousal: [-3, +3]
        const wz = a.center[2] * 3;       // suppression: [0, +3]
        const mass = 3 + a.depth * 12;    // depth → mass: [3, 15]
        this._alkgl.upsertAttractor(`landscape.${a.id}`, wx, wy, wz, mass);
      }
    }
  }

  _colorBias(valence, suppression) {
    if (suppression > 0.55) return 'murky';
    if (valence > 0.3)      return 'cool';
    if (valence < -0.3)     return 'warm';
    return 'neutral';
  }

  // ── Live latent → modulation ───────────────────────────────────────────────

  _onLatent(p) {
    this._latent = {
      valence:    p.valence    ?? 0,
      arousal:    p.arousal    ?? 0,
      suppression:p.suppression?? 0,
      coherence:  p.coherence  ?? 0,
      engagement: p.engagement ?? 0,
    };

    // Modulation: how much the live state deviates from resting base
    const rs = this._landscape?.restingState ?? [0,0.5,0,0.5,0];
    const suppDev = this._latent.suppression - (rs[2] ?? 0);
    const aroDev  = this._latent.arousal    - (rs[1] ?? 0.5);
    const cohDev  = this._latent.coherence  - (rs[3] ?? 0.5);

    this._live = {
      entropy:   suppDev * 0.20 + Math.max(0, aroDev) * 0.10,
      structure: cohDev  * 0.15 - suppDev * 0.08,
      curl:      Math.abs(this._latent.engagement) * 0.10 + aroDev * 0.08,
    };
  }

  _onSuppression(p) {
    // Suppression level change → immediate field entropy spike
    if (p.level === 'HIGH' && this._alkgl) {
      this._alkgl.field.entropy = Math.min(0.45, this._current.entropy + 0.12);
    }
  }

  _onBifurcation(p) {
    // Bifurcation → stress injection at current field center
    if (this._alkgl) {
      this._alkgl.injectStress(0, 0, 0, 600 * p.velocity, 5.0);
      this._alkgl.field.entropy = Math.min(0.45, this._current.entropy + 0.18);
    }
    this._emit('alk.portrait.pulse', { bifurcation: true, velocity: p.velocity, frame: this._frame });
  }

  // ── Apply and emit ─────────────────────────────────────────────────────────

  _applyAndEmit() {
    this._current = {
      entropy:   r4(clamp(this._base.entropy   + this._live.entropy,   0.02, 0.50)),
      structure: r4(clamp(this._base.structure + this._live.structure, 0.25, 0.99)),
      curl:      r4(clamp(this._base.curl      + this._live.curl,      0.10, 0.90)),
      damping:   this._base.damping,
      vmax:      this._base.vmax,
      pointSize: this._base.pointSize,
      colorBias: this._base.colorBias,
    };

    // Apply to ALK-GL if available
    if (this._alkgl) {
      this._alkgl.field.entropy   = this._current.entropy;
      this._alkgl.field.structure = this._current.structure;
      this._alkgl.field.curl      = this._current.curl;
      this._alkgl.field.damping   = this._current.damping;
      this._alkgl.field.vmax      = this._current.vmax;
    }

    this._emit('alk.portrait.params', {
      frameIndex: this._frame,
      personId:   this._personId,
      ...this._current,
      base:   this._base,
      latent: this._latent,
    });

    // §1.8 pulse every 150 frames
    if (this._frame % 150 === 0) {
      this._emit('alk.portrait.pulse', {
        frameIndex: this._frame, personId: this._personId, params: this._current,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get params()    { return { ...this._current }; }
  get base()      { return { ...this._base }; }
  get personId()  { return this._personId; }

  setALKGL(alkgl) { this._alkgl = alkgl; }

  reset() {
    this._base    = { ...DEFAULT_BASE };
    this._live    = { entropy:0, structure:0, curl:0 };
    this._current = { ...DEFAULT_BASE };
    this._landscape = null;
    this._personId  = null;
    this._latent  = { valence:0, arousal:0, suppression:0, coherence:0, engagement:0 };
  }

  _emit(event, data) { try { this._bus?.emit(event, data); } catch (_) {} }

  health() {
    return {
      status:    'OK',
      uuid:      PORTRAIT_UUID,
      version:   PORTRAIT_VERSION,
      personId:  this._personId,
      sessions:  this._landscape?.sessionCount ?? 0,
      params:    this._current,
      base:      this._base,
    };
  }
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
