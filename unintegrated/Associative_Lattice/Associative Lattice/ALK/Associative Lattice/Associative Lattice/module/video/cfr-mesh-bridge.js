/**
 * @module       cfr-mesh-bridge
 * @uuid         b7c8d9e0-f1a2-4b3c-9d4e-5f6a7b8c9d0e
 * @version      1.0.0
 *
 * Associative Lattive — CFR Mesh Bridge
 *
 * Subscribes to ALK landmark events, maps the full face/pose/hand landmark
 * arrays to a named 34-point skeleton of CFR attractors, drives field parameters
 * from behavioral cue state, and emits alk.cfr.mesh.frame each render cycle.
 *
 * ── SKELETON MAP (34 attractors) ─────────────────────────────────────────────
 *
 *   FACE (20 points):
 *     face.iris.l / face.iris.r           — iris centers (eye tracking origin)
 *     face.eye.outer.l / .r               — eye outer corners
 *     face.eye.inner.l / .r               — eye inner corners
 *     face.eye.top.l / .r                 — upper eyelid apex
 *     face.eye.bottom.l / .r              — lower eyelid apex
 *     face.brow.l / .brow.r               — brow inner peaks
 *     face.nose                           — nose tip
 *     face.mouth.l / .mouth.r             — mouth corners
 *     face.mouth.top / .mouth.bottom      — lip center points
 *     face.jaw.l / .jaw.r                 — jaw hinges
 *     face.chin / .forehead               — vertical poles
 *
 *   HANDS (7 per hand, present only when detected):
 *     hand.l.wrist / hand.r.wrist
 *     hand.l.thumb / hand.r.thumb         — thumb tip (lm 4)
 *     hand.l.index / hand.r.index         — index tip (lm 8)
 *     hand.l.middle / hand.r.middle       — middle tip (lm 12)
 *     hand.l.ring / hand.r.ring           — ring tip (lm 16)
 *     hand.l.pinky / hand.r.pinky         — pinky tip (lm 20)
 *     hand.l.palm / hand.r.palm           — palm center (lm 9 approx)
 *
 *   BODY (7 points):
 *     body.shoulder.l / .r
 *     body.elbow.l / .r
 *     body.wrist.l / .r
 *     body.hip.l                          — center-of-mass anchor
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.video.landmarks.face            — requires rawLandmarks (v1.5+)
 *     alk.video.landmarks.pose            — requires rawLandmarks (v1.5+)
 *     alk.video.landmarks.hands           — requires rawLandmarks (v1.5+)
 *     alk.video.frame.analyzed            — frame-tick, drives render sync
 *     alk.behavior.cue.detected           — drives field entropy
 *     alk.behavior.cue.released           — relaxes field entropy
 *     alk.cfr.mesh.config                 — runtime parameter override
 *
 *   Emits:
 *     alk.cfr.mesh.frame                  — world state snapshot per frame
 *     alk.cfr.mesh.ready                  — CFR world initialized
 *     alk.cfr.mesh.error                  — non-fatal errors
 *
 * ── FIELD PARAMETER MAPPING ──────────────────────────────────────────────────
 *
 *   Base state:           entropy 0.18, structure 0.85, curl 0.50
 *   blink detected:       entropy +0.15 for 3 frames
 *   eye_widen:            structure −0.10, curl +0.15
 *   brow_furrow:          stress inject at nose attractor
 *   gaze aversion:        entropy +0.20, attractor mass on iris reduced 40%
 *   smile / Duchenne:     curl +0.20, entropy −0.05
 *   hand gesture:         stress inject at dominant wrist, entropy +0.10
 *   escalation cue:       entropy +0.30, stress at mouth
 *   cue released:         entropy −= 0.08 per frame (decay to base)
 *
 * ── WORLD SPACE MAPPING ──────────────────────────────────────────────────────
 *
 *   MediaPipe normalized [0..1] image coords → CFR world space:
 *     x:  (lm.x - 0.5) * SCALE_XY   (center = 0, right = +)
 *     y:  (lm.y - 0.5) * -SCALE_XY  (center = 0, up = +)  [flip Y]
 *     z:  lm.z * SCALE_Z             (negative = toward camera)
 *
 *   Default SCALE_XY = 16, SCALE_Z = 6.
 *   Configurable via alk.cfr.mesh.config.
 */

'use strict';

// ── CFR kernel imports (inline-compatible via script tag or ESM) ──────────────
// When used via <script type="module"> in video-demo.html, import from the
// bundled cfr-kernel path relative to this file.
// The bridge does NOT import directly — it receives the CFR API as constructor
// injection to stay compatible with both bundled and inline-script deployments.

// ── Constants ─────────────────────────────────────────────────────────────────

const MODULE_ID  = 'cfr-mesh-bridge';
const MODULE_VER = '1.0.0';
const MODULE_UUID = 'b7c8d9e0-f1a2-4b3c-9d4e-5f6a7b8c9d0e';

// Face landmark indices (mirrors FACE_IDX in video-module.js)
const F = Object.freeze({
  LEFT_IRIS_CENTER:  468,
  RIGHT_IRIS_CENTER: 473,
  LEFT_EYE_OUTER:    33,
  LEFT_EYE_INNER:    133,
  RIGHT_EYE_OUTER:   362,
  RIGHT_EYE_INNER:   263,
  LEFT_EYE_TOP:      159,
  LEFT_EYE_BOTTOM:   145,
  RIGHT_EYE_TOP:     386,
  RIGHT_EYE_BOTTOM:  374,
  LEFT_BROW_INNER:   107,
  RIGHT_BROW_INNER:  336,
  NOSE_TIP:          4,
  MOUTH_LEFT:        61,
  MOUTH_RIGHT:       291,
  MOUTH_TOP:         13,
  MOUTH_BOTTOM:      14,
  JAW_LEFT:          234,
  JAW_RIGHT:         454,
  CHIN:              152,
  FOREHEAD:          10,
});

// Pose landmark indices
const P = Object.freeze({
  LEFT_SHOULDER:  11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW:     13,
  RIGHT_ELBOW:    14,
  LEFT_WRIST:     15,
  RIGHT_WRIST:    16,
  LEFT_HIP:       23,
});

// Hand landmark indices (MediaPipe 21-point hand model)
const H = Object.freeze({
  WRIST:  0,
  THUMB:  4,
  INDEX:  8,
  MIDDLE: 12,
  RING:   16,
  PINKY:  20,
  PALM:   9,   // middle metacarpal = proxy for palm center
});

// Default field parameters
const FIELD_DEFAULTS = Object.freeze({
  entropy:   0.18,
  structure: 0.85,
  curl:      0.50,
});

// Cue → field delta table
const CUE_DELTAS = Object.freeze({
  blink:             { entropy: +0.15, decayFrames: 3 },
  eye_widen:         { entropy: +0.10, structure: -0.10, curl: +0.15 },
  brow_furrow:       { stressAtNose: true },
  brow_raise:        { entropy: +0.05, structure: -0.05 },
  gaze_aversion:     { entropy: +0.20, irisGain: 0.40 },
  eye_contact_break: { entropy: +0.12 },
  smile_social:      { curl: +0.15, entropy: -0.05 },
  smile_duchenne:    { curl: +0.20, entropy: -0.08, structure: +0.05 },
  disgust_micro:     { entropy: +0.18, stressAtNose: true },
  contempt_micro:    { entropy: +0.10, structure: -0.08 },
  fear_micro:        { entropy: +0.25, curl: +0.20 },
  open_palm:         { entropy: +0.10, stressAtDominantWrist: true },
  hand_to_mouth:     { entropy: +0.15, stressAtMouth: true },
  self_touch_face:   { entropy: +0.12, stressAtNose: true },
  shoulder_raise:    { entropy: +0.08, structure: -0.05 },
  // escalation synthetic
  ESCALATION:        { entropy: +0.30, stressAtMouth: true },
});

// ── Module ────────────────────────────────────────────────────────────────────

export class CFRMeshBridge {
  /**
   * @param {object} opts
   * @param {object} opts.bus         — ALK bus instance (must have .on / .emit)
   * @param {object} opts.cfr         — CFR kernel API: { createWorld, stepWorld, upsertAttractor,
   *                                      removeAttractor, injectStress, createCamera,
   *                                      buildMVP, drawParticles2D }
   * @param {HTMLCanvasElement} opts.canvas   — canvas element to render into
   * @param {object} [opts.worldOpts]  — createWorld options override
   * @param {object} [opts.scaleOpts]  — { scaleXY: 16, scaleZ: 6 }
   * @param {object} [opts.cameraOpts] — createCamera options override
   */
  constructor({ bus, cfr, canvas, worldOpts = {}, scaleOpts = {}, cameraOpts = {} }) {
    if (!bus)    throw new Error(`[${MODULE_ID}] bus is required`);
    if (!cfr)    throw new Error(`[${MODULE_ID}] cfr kernel API is required`);
    if (!canvas) throw new Error(`[${MODULE_ID}] canvas is required`);

    this._bus    = bus;
    this._cfr    = cfr;
    this._canvas = canvas;
    this._ctx    = canvas.getContext('2d');

    // World + camera
    this._world  = cfr.createWorld({ n: 18000, ...worldOpts });
    this._cam    = cfr.createCamera(cameraOpts);
    this._mvp    = null; // rebuilt on resize

    // Scale config
    this._scale = {
      xy: scaleOpts.scaleXY ?? 16,
      z:  scaleOpts.scaleZ  ?? 6,
    };

    // Live landmark state (updated each frame by bus events)
    this._faceLMs  = null;
    this._poseLMs  = null;
    this._handsLMs = null;
    this._leftGaze  = null;
    this._rightGaze = null;
    this._leftEAR   = 1;
    this._rightEAR  = 1;

    // Field parameter state
    this._field = { ...FIELD_DEFAULTS };
    this._activeCueDeltaStack = []; // [{ deltas, framesLeft }]
    this._irisGain = 1.0; // multiplier for iris attractor mass

    // Render state
    this._rafId    = null;
    this._lastT    = 0;
    this._running  = false;
    this._frameIdx = 0;

    // Resize observer
    this._resizeObs = new ResizeObserver(() => this._onResize());
    this._resizeObs.observe(canvas);
    this._onResize();

    this._bindBus();
    this._running = true;
    this._scheduleRender();

    this._emit('alk.cfr.mesh.ready', {
      moduleId: MODULE_ID, version: MODULE_VER, uuid: MODULE_UUID,
      worldN: this._world.N,
    });
  }

  // ── Bus wiring ──────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;
    b.on('alk.video.landmarks.face',  (ev) => this._onFaceLM(ev));
    b.on('alk.video.landmarks.pose',  (ev) => this._onPoseLM(ev));
    b.on('alk.video.landmarks.hands', (ev) => this._onHandsLM(ev));
    b.on('alk.behavior.cue.detected', (ev) => this._onCueDetected(ev));
    b.on('alk.behavior.cue.released', (ev) => this._onCueReleased(ev));
    b.on('alk.cfr.mesh.config',       (ev) => this._onConfig(ev));
  }

  _onFaceLM(ev) {
    const lms = ev.rawLandmarks ?? ev.landmarks ?? null;
    if (!lms || lms.length < 14) return;
    this._faceLMs  = lms;
    this._leftGaze  = ev.leftGaze  ?? null;
    this._rightGaze = ev.rightGaze ?? null;
    this._leftEAR   = ev.leftEAR   ?? 1;
    this._rightEAR  = ev.rightEAR  ?? 1;
    this._syncFaceAttractors();
  }

  _onPoseLM(ev) {
    const lms = ev.rawLandmarks ?? null;
    if (!lms || lms.length < 25) return;
    this._poseLMs = lms;
    this._syncPoseAttractors();
  }

  _onHandsLM(ev) {
    const lms = ev.rawLandmarks ?? null;
    if (!lms) return;
    this._handsLMs = lms;
    this._syncHandAttractors();
  }

  _onCueDetected(ev) {
    const key = ev.cueType ?? ev.type;
    if (!key) return;
    const delta = CUE_DELTAS[key] ?? null;
    if (!delta) return;
    this._applyDelta(delta, ev);
    this._activeCueDeltaStack.push({ key, delta, framesLeft: delta.decayFrames ?? 30 });
  }

  _onCueReleased(ev) {
    const key = ev.cueType ?? ev.type;
    this._activeCueDeltaStack = this._activeCueDeltaStack.filter(d => d.key !== key);
  }

  _onConfig(ev) {
    if (ev.scaleXY !== undefined) this._scale.xy = ev.scaleXY;
    if (ev.scaleZ  !== undefined) this._scale.z  = ev.scaleZ;
    if (ev.worldN  !== undefined) this._emit('alk.cfr.mesh.error',
      { message: 'worldN cannot be changed after init — restart bridge' });
  }

  // ── Attractor synchronisation ───────────────────────────────────────────────

  _lmToWorld(lm) {
    return {
      x: (lm.x - 0.5) * this._scale.xy,
      y: (lm.y - 0.5) * -this._scale.xy,  // flip Y: image-down → world-down
      z: (lm.z ?? 0)  *  this._scale.z,
    };
  }

  _upsert(id, lm, mass = 1.2) {
    const w = this._lmToWorld(lm);
    this._cfr.upsertAttractor(this._world, { id, ...w, mass });
  }

  _syncFaceAttractors() {
    const lm = this._faceLMs;
    if (!lm) return;
    const has478 = lm.length >= 478;
    const irisGain = this._irisGain;

    // Iris / eye tracking (478-point model only)
    if (has478) {
      this._upsert('face.iris.l', lm[F.LEFT_IRIS_CENTER],  1.6 * irisGain);
      this._upsert('face.iris.r', lm[F.RIGHT_IRIS_CENTER], 1.6 * irisGain);
    }

    // Eye corners + lids
    this._upsert('face.eye.outer.l',  lm[F.LEFT_EYE_OUTER],  1.1);
    this._upsert('face.eye.inner.l',  lm[F.LEFT_EYE_INNER],  1.1);
    this._upsert('face.eye.outer.r',  lm[F.RIGHT_EYE_OUTER], 1.1);
    this._upsert('face.eye.inner.r',  lm[F.RIGHT_EYE_INNER], 1.1);

    // Eyelid apex — mass scales with EAR: closed eye = heavier attractor = field collapses inward
    const lEAR = Math.max(0.05, this._leftEAR);
    const rEAR = Math.max(0.05, this._rightEAR);
    this._upsert('face.eye.top.l',    lm[F.LEFT_EYE_TOP],    0.8 + (1 - lEAR) * 0.8);
    this._upsert('face.eye.bottom.l', lm[F.LEFT_EYE_BOTTOM], 0.8 + (1 - lEAR) * 0.8);
    this._upsert('face.eye.top.r',    lm[F.RIGHT_EYE_TOP],   0.8 + (1 - rEAR) * 0.8);
    this._upsert('face.eye.bottom.r', lm[F.RIGHT_EYE_BOTTOM],0.8 + (1 - rEAR) * 0.8);

    // Brows
    this._upsert('face.brow.l', lm[F.LEFT_BROW_INNER],  1.0);
    this._upsert('face.brow.r', lm[F.RIGHT_BROW_INNER], 1.0);

    // Nose — anchor point for stress injections
    this._upsert('face.nose', lm[F.NOSE_TIP], 1.4);

    // Mouth — heavier = more field weight, speech bursts injected here
    this._upsert('face.mouth.l',      lm[F.MOUTH_LEFT],   1.2);
    this._upsert('face.mouth.r',      lm[F.MOUTH_RIGHT],  1.2);
    this._upsert('face.mouth.top',    lm[F.MOUTH_TOP],    1.0);
    this._upsert('face.mouth.bottom', lm[F.MOUTH_BOTTOM], 1.0);

    // Jaw
    this._upsert('face.jaw.l', lm[F.JAW_LEFT],  0.9);
    this._upsert('face.jaw.r', lm[F.JAW_RIGHT], 0.9);

    // Poles
    this._upsert('face.chin',     lm[F.CHIN],     1.3);
    this._upsert('face.forehead', lm[F.FOREHEAD], 1.3);
  }

  _syncPoseAttractors() {
    const lm = this._poseLMs;
    if (!lm || lm.length < 25) return;

    this._upsert('body.shoulder.l', lm[P.LEFT_SHOULDER],  1.5);
    this._upsert('body.shoulder.r', lm[P.RIGHT_SHOULDER], 1.5);
    this._upsert('body.elbow.l',    lm[P.LEFT_ELBOW],     1.1);
    this._upsert('body.elbow.r',    lm[P.RIGHT_ELBOW],    1.1);
    this._upsert('body.wrist.l',    lm[P.LEFT_WRIST],     1.0);
    this._upsert('body.wrist.r',    lm[P.RIGHT_WRIST],    1.0);
    this._upsert('body.hip.l',      lm[P.LEFT_HIP],       1.8); // center-of-mass anchor
  }

  _syncHandAttractors() {
    const lms = this._handsLMs;
    if (!lms) return;

    for (const side of ['left', 'right']) {
      const hand = lms[side];
      const s    = side === 'left' ? 'l' : 'r';
      if (!hand || hand.length < 21) {
        // Hand went away — remove its attractors
        for (const part of ['wrist','thumb','index','middle','ring','pinky','palm']) {
          this._cfr.removeAttractor(this._world, `hand.${s}.${part}`);
        }
        continue;
      }

      this._upsert(`hand.${s}.wrist`,  hand[H.WRIST],  1.2);
      this._upsert(`hand.${s}.thumb`,  hand[H.THUMB],  1.0);
      this._upsert(`hand.${s}.index`,  hand[H.INDEX],  1.0);
      this._upsert(`hand.${s}.middle`, hand[H.MIDDLE], 1.0);
      this._upsert(`hand.${s}.ring`,   hand[H.RING],   1.0);
      this._upsert(`hand.${s}.pinky`,  hand[H.PINKY],  1.0);
      this._upsert(`hand.${s}.palm`,   hand[H.PALM],   1.4);
    }
  }

  // ── Field parameter application ─────────────────────────────────────────────

  _applyDelta(delta, ev) {
    // Stress injections — fire immediately
    if (delta.stressAtNose && this._faceLMs) {
      const w = this._lmToWorld(this._faceLMs[F.NOSE_TIP]);
      this._cfr.injectStress(this._world, w.x, w.y, w.z, 320, 3.5);
    }
    if (delta.stressAtMouth && this._faceLMs) {
      const w = this._lmToWorld(this._faceLMs[F.MOUTH_TOP]);
      this._cfr.injectStress(this._world, w.x, w.y, w.z, 400, 4);
    }
    if (delta.stressAtDominantWrist && this._handsLMs) {
      const dominant = ev?.dominantHand ?? 'right';
      const hand = this._handsLMs[dominant];
      if (hand?.[H.WRIST]) {
        const w = this._lmToWorld(hand[H.WRIST]);
        this._cfr.injectStress(this._world, w.x, w.y, w.z, 280, 3);
      }
    }

    // Continuous field changes
    if (delta.entropy   !== undefined) this._field.entropy   = Math.max(0, Math.min(1, this._field.entropy   + delta.entropy));
    if (delta.structure !== undefined) this._field.structure = Math.max(0, Math.min(1, this._field.structure + delta.structure));
    if (delta.curl      !== undefined) this._field.curl      = Math.max(0, Math.min(1, this._field.curl      + delta.curl));
    if (delta.irisGain  !== undefined) this._irisGain = Math.max(0.1, Math.min(2, this._irisGain - delta.irisGain));
  }

  _tickFieldDecay() {
    // Decay active cue stack
    this._activeCueDeltaStack = this._activeCueDeltaStack.filter(d => {
      d.framesLeft--;
      return d.framesLeft > 0;
    });

    // Return field toward defaults
    const DECAY = 0.03;
    for (const key of ['entropy', 'structure', 'curl']) {
      const def = FIELD_DEFAULTS[key];
      const cur = this._field[key];
      if (Math.abs(cur - def) > 0.005) {
        this._field[key] = cur + (def - cur) * DECAY;
      } else {
        this._field[key] = def;
      }
    }
    // iris gain recovery
    if (this._irisGain < 1.0) this._irisGain = Math.min(1.0, this._irisGain + 0.02);

    // Apply to world
    this._world.field.entropy   = this._field.entropy;
    this._world.field.structure = this._field.structure;
    this._world.field.curl      = this._field.curl;
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  _scheduleRender() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame((t) => this._renderFrame(t));
  }

  _renderFrame(timestamp) {
    const dt = Math.min((timestamp - this._lastT) / 1000, 0.05); // cap at 50ms
    this._lastT = timestamp;

    // Tick physics
    this._tickFieldDecay();
    this._cfr.stepWorld(this._world, dt);

    // Draw
    const { width: W, height: H } = this._canvas;
    this._ctx.clearRect(0, 0, W, H);
    this._mvp = this._cfr.buildMVP(this._cam, W, H);
    this._cfr.drawParticles2D(this._ctx, this._world, this._mvp, W, H, {
      pointSize: 1.4,
      colorFn: this._colorFn.bind(this),
    });

    // Emit world state snapshot
    this._frameIdx++;
    this._emit('alk.cfr.mesh.frame', {
      frameIndex:    this._frameIdx,
      entropy:       this._field.entropy,
      structure:     this._field.structure,
      curl:          this._field.curl,
      attractorCount: this._world.attractors.length,
      hasFace:       !!this._faceLMs,
      hasPose:       !!this._poseLMs,
      hasHands:      !!this._handsLMs,
      leftGaze:      this._leftGaze,
      rightGaze:     this._rightGaze,
    });

    this._scheduleRender();
  }

  /**
   * Color function driven by field state.
   * High entropy → warm (red/orange). High structure → cool (cyan/blue).
   * Gaze aversion dims iris zone; blinking pulses white.
   */
  _colorFn(speed) {
    const e = this._field.entropy;
    const s = this._field.structure;
    const r = Math.round(40  + e * 180 + speed * 35);
    const g = Math.round(120 + s * 80  + speed * 60);
    const b = Math.round(180 - e * 120 + speed * 75);
    const a = 0.45 + speed * 0.50;
    return `rgba(${r},${g},${b},${a})`;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  _onResize() {
    const rect = this._canvas.getBoundingClientRect();
    this._canvas.width  = rect.width  || this._canvas.offsetWidth  || 640;
    this._canvas.height = rect.height || this._canvas.offsetHeight || 480;
    this._mvp = null; // force rebuild next frame
  }

  stop() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._resizeObs.disconnect();
    this._emit('alk.cfr.mesh.frame', { stopped: true });
  }

  // ── Bus helpers ──────────────────────────────────────────────────────────────

  _emit(event, data) {
    try { this._bus.emit(event, data); } catch (_) {}
  }

  // ── Static factory ───────────────────────────────────────────────────────────

  static create(opts) { return new CFRMeshBridge(opts); }

  // ── Module metadata ──────────────────────────────────────────────────────────

  static get id()      { return MODULE_ID; }
  static get version() { return MODULE_VER; }
  static get uuid()    { return MODULE_UUID; }

  health() {
    return {
      status:        this._running ? 'OK' : 'STOPPED',
      frameIndex:    this._frameIdx,
      worldN:        this._world.N,
      attractors:    this._world.attractors.length,
      hasFace:       !!this._faceLMs,
      hasPose:       !!this._poseLMs,
      hasHands:      !!this._handsLMs,
      field:         { ...this._field },
      irisGain:      this._irisGain,
      activeCues:    this._activeCueDeltaStack.map(d => d.key),
    };
  }
}
