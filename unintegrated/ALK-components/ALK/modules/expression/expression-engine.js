/**
 * @module       expression-engine
 * @uuid         a2b3c4d5-e6f7-4801-9234-56789abcdef0
 * @version      1.0.0
 *
 * Expression Engine — Full-spectrum facial expression analysis
 * Micro → Partial → Macro → Composite
 *
 * ── SPECTRUM ──────────────────────────────────────────────────────────────────
 *
 *   MICRO    1–6 frames   (~40–200ms @ 30fps)
 *            Onset velocity spike above MICRO_ONSET_VEL
 *            Followed by suppression (reversal) within SUPPRESS_WINDOW frames
 *            Signal: genuine leakage, affect that couldn't be masked in time
 *
 *   PARTIAL  6–15 frames  (~200–500ms)
 *            Activation above PARTIAL_THRESH but never reaches MACRO_THRESH
 *            OR reaches MACRO_THRESH but asymmetric (one side only)
 *            Signal: controlled/masked expression, social regulation
 *
 *   MACRO    15+ frames   (500ms+)
 *            Sustained activation above MACRO_THRESH
 *            Signal: deliberate, full expression
 *
 *   COMPOSITE Any duration
 *            AU combination pattern matching across blendshape groups
 *            Labels: FEAR, ANGER, DISGUST, CONTEMPT, SADNESS, SURPRISE,
 *                    JOY_GENUINE, JOY_SOCIAL
 *            Includes: confidence [0..1], asymmetry score, Duchenne flag,
 *                      onset velocity, suppression detected, duration_frames
 *
 * ── ACTION UNITS (FACS subset via MediaPipe blendshapes) ─────────────────────
 *
 *   AU1  = browInnerUp          (inner brow raise)
 *   AU2  = browOuterUpL/R       (outer brow raise)
 *   AU4  = browDownL/R          (brow lowerer — furrow)
 *   AU5  = eyeWideL/R           (upper lid raise)
 *   AU6  = cheekSquintL/R       (cheek raiser — Duchenne marker)
 *   AU7  = eyeSquintL/R         (lid tightener)
 *   AU9  = noseSneerL/R         (nose wrinkler)
 *   AU10 = mouthUpperUpL/R      (upper lip raiser)
 *   AU12 = mouthSmileL/R        (lip corner puller)
 *   AU15 = mouthFrownL/R        (lip corner depressor)
 *   AU17 = mouthShrugLower      (chin raiser)
 *   AU20 = mouthStretchL/R      (lip stretcher — fear)
 *   AU23 = mouthPressL/R        (lip tightener — anger)
 *   AU24 = mouthPressL/R        (lip pressor)
 *   AU25 = jawOpen              (lips part)
 *   AU26 = jawOpen              (jaw drop)
 *   AU28 = mouthPucker          (lip suck)
 *   AU43 = eyeBlinkL/R          (eyes closed)
 *   AU54 = mouthLeft/Right      (head turn proxy / contempt)
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.video.landmarks.face   — expects rawLandmarks + blendshapes payload
 *                                   OR direct call via engine.ingest(bs, frameIndex)
 *
 *   Emits:
 *     alk.expression.micro       — { label, side, confidence, onsetVel,
 *                                    suppressionConfidence, blendshapes, frameIndex }
 *     alk.expression.partial     — { label, side, confidence, asymmetry,
 *                                    durationFrames, blendshapes, frameIndex }
 *     alk.expression.macro       — { label, confidence, asymmetry, durationFrames,
 *                                    duchenne, blendshapes, frameIndex }
 *     alk.expression.composite   — { label, confidence, asymmetry, duchenne,
 *                                    scale, durationFrames, aus, frameIndex }
 *     alk.expression.state       — full state snapshot every N frames
 *
 * ── USAGE ─────────────────────────────────────────────────────────────────────
 *
 *   const engine = new ExpressionEngine({ bus });
 *   // bus must have .on(event, cb) and .emit(event, data)
 *   // Engine subscribes itself — just ingest frames via bus events
 *   // OR call engine.ingest(blendshapeMap, frameIndex) directly
 */

'use strict';

export const EXPR_UUID    = 'a2b3c4d5-e6f7-4801-9234-56789abcdef0';
export const EXPR_VERSION = '1.9.0';

// ── Blendshape names (all 52 MediaPipe) ───────────────────────────────────────
const ALL_BS = [
  'browDownLeft','browDownRight','browInnerUp','browOuterUpLeft','browOuterUpRight',
  'cheekPuff','cheekSquintLeft','cheekSquintRight',
  'eyeBlinkLeft','eyeBlinkRight',
  'eyeLookDownLeft','eyeLookDownRight','eyeLookInLeft','eyeLookInRight',
  'eyeLookOutLeft','eyeLookOutRight','eyeLookUpLeft','eyeLookUpRight',
  'eyeSquintLeft','eyeSquintRight','eyeWideLeft','eyeWideRight',
  'jawForward','jawLeft','jawOpen','jawRight',
  'mouthClose','mouthDimpleLeft','mouthDimpleRight',
  'mouthFrownLeft','mouthFrownRight','mouthFunnel',
  'mouthLeft','mouthLowerDownLeft','mouthLowerDownRight',
  'mouthPressLeft','mouthPressRight','mouthPucker',
  'mouthRight','mouthRollLower','mouthRollUpper',
  'mouthShrugLower','mouthShrugUpper',
  'mouthSmileLeft','mouthSmileRight',
  'mouthStretchLeft','mouthStretchRight',
  'mouthUpperUpLeft','mouthUpperUpRight',
  'noseSneerLeft','noseSneerRight',
  'tongueOut',
];

// ── Thresholds ─────────────────────────────────────────────────────────────────
const DEFAULTS = {
  // Ring buffer size (frames)
  RING_SIZE:        15,

  // Micro-expression detection
  MICRO_ONSET_VEL:  0.055,   // min per-frame velocity to trigger onset
  MICRO_SUPPRESS_VEL: 0.035, // reversal velocity that confirms suppression
  SUPPRESS_WINDOW:  6,       // frames after onset to look for suppression

  // Partial expression
  PARTIAL_THRESH:   0.12,    // min value for partial
  PARTIAL_MIN_FRAMES: 3,     // must hold for at least this many frames

  // Macro expression
  MACRO_THRESH:     0.30,    // value threshold for full expression
  MACRO_MIN_FRAMES: 12,      // must sustain this many frames

  // Composite pattern matching
  COMPOSITE_CONF_THRESH: 0.35, // min confidence to emit composite

  // State snapshot interval (frames)
  STATE_INTERVAL:   10,

  // Asymmetry threshold (|L - R| for bilateral AUs)
  ASYMMETRY_THRESH: 0.15,
};

// ── AU group definitions (maps expression labels to blendshape patterns) ─────
// Each AU entry: { bs: blendshapeName, weight: float, side: 'L'|'R'|'C' }
// 'C' = central (no L/R), 'L'/'R' for bilateral where asymmetry matters

const AU_PATTERNS = {

  FEAR: {
    required: [
      { bs: 'browInnerUp',     weight: 1.8, side: 'C' },  // AU1: inner brow up (strong)
      { bs: 'eyeWideLeft',     weight: 1.2, side: 'L' },  // AU5L
      { bs: 'eyeWideRight',    weight: 1.2, side: 'R' },  // AU5R
    ],
    supporting: [
      { bs: 'mouthStretchLeft',  weight: 0.7, side: 'L' }, // AU20L
      { bs: 'mouthStretchRight', weight: 0.7, side: 'R' }, // AU20R
      { bs: 'mouthOpen',         weight: 0.5, side: 'C' }, // AU26
      { bs: 'browOuterUpLeft',   weight: 0.6, side: 'L' }, // AU2L
      { bs: 'browOuterUpRight',  weight: 0.6, side: 'R' }, // AU2R
    ],
    inhibitors: [
      { bs: 'mouthSmileLeft',  weight: -0.8 },
      { bs: 'mouthSmileRight', weight: -0.8 },
    ],
    microOnset: ['browInnerUp', 'eyeWideLeft', 'eyeWideRight'],
  },

  ANGER: {
    required: [
      { bs: 'browDownLeft',   weight: 1.5, side: 'L' },  // AU4L
      { bs: 'browDownRight',  weight: 1.5, side: 'R' },  // AU4R
      { bs: 'noseSneerLeft',  weight: 1.0, side: 'L' },  // AU9L
      { bs: 'noseSneerRight', weight: 1.0, side: 'R' },  // AU9R
    ],
    supporting: [
      { bs: 'mouthPressLeft',  weight: 0.8, side: 'L' }, // AU23L
      { bs: 'mouthPressRight', weight: 0.8, side: 'R' }, // AU23R
      { bs: 'eyeSquintLeft',   weight: 0.6, side: 'L' }, // AU7L
      { bs: 'eyeSquintRight',  weight: 0.6, side: 'R' }, // AU7R
      { bs: 'jawForward',      weight: 0.4, side: 'C' },
      { bs: 'mouthFrownLeft',  weight: 0.5, side: 'L' },
      { bs: 'mouthFrownRight', weight: 0.5, side: 'R' },
    ],
    inhibitors: [
      { bs: 'browInnerUp',     weight: -0.6 },
      { bs: 'mouthSmileLeft',  weight: -1.0 },
      { bs: 'mouthSmileRight', weight: -1.0 },
    ],
    microOnset: ['browDownLeft', 'browDownRight', 'noseSneerLeft', 'noseSneerRight'],
  },

  DISGUST: {
    required: [
      { bs: 'noseSneerLeft',     weight: 1.6, side: 'L' }, // AU9L — strongest marker
      { bs: 'noseSneerRight',    weight: 1.0, side: 'R' }, // AU9R (often asymmetric)
      { bs: 'mouthFrownLeft',    weight: 1.0, side: 'L' }, // AU15L
      { bs: 'mouthFrownRight',   weight: 0.7, side: 'R' }, // AU15R
    ],
    supporting: [
      { bs: 'mouthUpperUpLeft',  weight: 0.8, side: 'L' }, // AU10L
      { bs: 'mouthUpperUpRight', weight: 0.6, side: 'R' }, // AU10R
      { bs: 'browDownLeft',      weight: 0.5, side: 'L' },
      { bs: 'browDownRight',     weight: 0.5, side: 'R' },
      { bs: 'eyeSquintLeft',     weight: 0.4, side: 'L' },
      { bs: 'eyeSquintRight',    weight: 0.4, side: 'R' },
      { bs: 'cheekPuff',         weight: 0.3, side: 'C' },
    ],
    inhibitors: [
      { bs: 'mouthSmileLeft',  weight: -0.9 },
      { bs: 'mouthSmileRight', weight: -0.9 },
      { bs: 'jawOpen',         weight: -0.4 },
    ],
    microOnset: ['noseSneerLeft', 'noseSneerRight', 'mouthUpperUpLeft'],
  },

  CONTEMPT: {
    // Hallmark: UNILATERAL mouth movement — left OR right but NOT both
    required: [
      { bs: 'mouthSmileLeft',  weight: 1.8, side: 'L' },  // one side only
      { bs: 'mouthSmileRight', weight: 1.8, side: 'R' },  // scored with asymmetry gate
    ],
    supporting: [
      { bs: 'mouthDimpleLeft',  weight: 0.6, side: 'L' },
      { bs: 'mouthDimpleRight', weight: 0.6, side: 'R' },
      { bs: 'cheekSquintLeft',  weight: 0.4, side: 'L' },
      { bs: 'cheekSquintRight', weight: 0.4, side: 'R' },
    ],
    inhibitors: [
      { bs: 'browInnerUp', weight: -0.5 },
      { bs: 'eyeWideLeft', weight: -0.4 },
      { bs: 'eyeWideRight',weight: -0.4 },
      { bs: 'jawOpen',     weight: -0.6 },
    ],
    requiresAsymmetry: true, // contempt MUST be unilateral
    microOnset: ['mouthSmileLeft', 'mouthSmileRight'],
  },

  SADNESS: {
    required: [
      { bs: 'browInnerUp',   weight: 1.4, side: 'C' },  // AU1 — oblique brow
      { bs: 'mouthFrownLeft', weight: 1.2, side: 'L' }, // AU15L
      { bs: 'mouthFrownRight',weight: 1.2, side: 'R' }, // AU15R
    ],
    supporting: [
      { bs: 'mouthShrugLower', weight: 0.7, side: 'C' }, // AU17 — chin raiser
      { bs: 'browDownLeft',    weight: 0.5, side: 'L' }, // can co-occur
      { bs: 'browDownRight',   weight: 0.5, side: 'R' },
      { bs: 'eyeBlinkLeft',    weight: 0.3, side: 'L' }, // heavy lids
      { bs: 'eyeBlinkRight',   weight: 0.3, side: 'R' },
      { bs: 'mouthClose',      weight: 0.4, side: 'C' },
    ],
    inhibitors: [
      { bs: 'mouthSmileLeft',  weight: -0.9 },
      { bs: 'mouthSmileRight', weight: -0.9 },
      { bs: 'eyeWideLeft',     weight: -0.7 },
      { bs: 'eyeWideRight',    weight: -0.7 },
      { bs: 'jawOpen',         weight: -0.5 },
    ],
    microOnset: ['browInnerUp', 'mouthFrownLeft', 'mouthFrownRight'],
  },

  SURPRISE: {
    required: [
      { bs: 'eyeWideLeft',  weight: 1.5, side: 'L' },  // AU5L
      { bs: 'eyeWideRight', weight: 1.5, side: 'R' },  // AU5R
      { bs: 'jawOpen',      weight: 1.3, side: 'C' },  // AU26
    ],
    supporting: [
      { bs: 'browInnerUp',      weight: 0.8, side: 'C' }, // AU1
      { bs: 'browOuterUpLeft',  weight: 0.7, side: 'L' }, // AU2L
      { bs: 'browOuterUpRight', weight: 0.7, side: 'R' }, // AU2R
      { bs: 'mouthFunnel',      weight: 0.4, side: 'C' },
      { bs: 'mouthShrugUpper',  weight: 0.4, side: 'C' },
    ],
    inhibitors: [
      { bs: 'browDownLeft',  weight: -1.0 },
      { bs: 'browDownRight', weight: -1.0 },
      { bs: 'noseSneerLeft', weight: -0.6 },
      { bs: 'noseSneerRight',weight: -0.6 },
    ],
    microOnset: ['eyeWideLeft', 'eyeWideRight', 'jawOpen'],
  },

  JOY_GENUINE: {
    // Duchenne smile: cheek squint MUST co-occur with mouth smile
    required: [
      { bs: 'mouthSmileLeft',   weight: 1.4, side: 'L' }, // AU12L
      { bs: 'mouthSmileRight',  weight: 1.4, side: 'R' }, // AU12R
      { bs: 'cheekSquintLeft',  weight: 1.6, side: 'L' }, // AU6L — Duchenne marker
      { bs: 'cheekSquintRight', weight: 1.6, side: 'R' }, // AU6R — Duchenne marker
    ],
    supporting: [
      { bs: 'mouthDimpleLeft',  weight: 0.5, side: 'L' }, // AU14L
      { bs: 'mouthDimpleRight', weight: 0.5, side: 'R' }, // AU14R
      { bs: 'eyeSquintLeft',    weight: 0.6, side: 'L' }, // AU7L (crow's feet)
      { bs: 'eyeSquintRight',   weight: 0.6, side: 'R' }, // AU7R
    ],
    inhibitors: [
      { bs: 'browDownLeft',  weight: -0.5 },
      { bs: 'browDownRight', weight: -0.5 },
      { bs: 'noseSneerLeft', weight: -0.4 },
      { bs: 'noseSneerRight',weight: -0.4 },
    ],
    duchenne: true,
    microOnset: ['cheekSquintLeft', 'cheekSquintRight', 'mouthSmileLeft'],
  },

  JOY_SOCIAL: {
    // Social smile: mouth only, NO cheek squint
    required: [
      { bs: 'mouthSmileLeft',  weight: 1.6, side: 'L' },
      { bs: 'mouthSmileRight', weight: 1.6, side: 'R' },
    ],
    supporting: [
      { bs: 'mouthDimpleLeft',  weight: 0.5, side: 'L' },
      { bs: 'mouthDimpleRight', weight: 0.5, side: 'R' },
    ],
    inhibitors: [
      { bs: 'cheekSquintLeft',  weight: -2.0 }, // strong inhibitor — if cheeks, it's genuine
      { bs: 'cheekSquintRight', weight: -2.0 },
      { bs: 'browDownLeft',     weight: -0.4 },
      { bs: 'browDownRight',    weight: -0.4 },
    ],
    duchenne: false,
    microOnset: ['mouthSmileLeft', 'mouthSmileRight'],
  },

};

// ── Helper: weighted AU score from current blendshape values ─────────────────
function scorePattern(pattern, vals) {
  let score = 0, maxPossible = 0;
  for (const au of pattern.required) {
    const v = vals[au.bs] ?? 0;
    score += v * au.weight;
    maxPossible += au.weight;
  }
  for (const au of (pattern.supporting ?? [])) {
    const v = vals[au.bs] ?? 0;
    score += v * au.weight * 0.5;
    maxPossible += au.weight * 0.5;
  }
  for (const au of (pattern.inhibitors ?? [])) {
    const v = vals[au.bs] ?? 0;
    score += v * au.weight; // weight is negative
  }
  return maxPossible > 0 ? Math.max(0, score / maxPossible) : 0;
}

// ── Asymmetry score for bilateral patterns ────────────────────────────────────
function asymmetryScore(pattern, vals) {
  let asymSum = 0, pairs = 0;
  const req = pattern.required.filter(a => a.side === 'L' || a.side === 'R');
  for (let i = 0; i < req.length; i++) {
    const au = req[i];
    if (au.side === 'L') {
      const mirror = req.find(b => b.bs === au.bs.replace('Left','Right'));
      if (mirror) {
        asymSum += Math.abs((vals[au.bs]??0) - (vals[mirror.bs]??0));
        pairs++;
      }
    }
  }
  return pairs > 0 ? asymSum / pairs : 0;
}

// ── Engine ────────────────────────────────────────────────────────────────────
export class ExpressionEngine {
  /**
   * @param {object} opts
   * @param {object} opts.bus      — { on(event,cb), emit(event,data) }
   * @param {object} [opts.thresholds] — override DEFAULTS
   */
  constructor({ bus, thresholds = {} } = {}) {
    this._bus = bus;
    this._T   = { ...DEFAULTS, ...thresholds };

    // Per-blendshape ring buffers (value history)
    this._rings = {};
    for (const bs of ALL_BS) {
      this._rings[bs] = new Float32Array(this._T.RING_SIZE);
    }
    this._ringHead  = 0;   // current write index
    this._frameIdx  = 0;

    // Per-blendshape onset tracking
    // { bs: { onsetFrame, onsetVel, suppressed, activeFrames } }
    this._onsetState = {};
    for (const bs of ALL_BS) {
      this._onsetState[bs] = { onsetFrame: -999, onsetVel: 0, suppressed: false, activeFrames: 0 };
    }

    // Composite state tracking (which labels are currently active)
    this._compositeActive = new Map(); // label → { startFrame, lastScore }

    // Session stats
    this.stats = {
      micros: 0, partials: 0, macros: 0, composites: 0,
      byLabel: {},
    };

    if (bus) this._bindBus();
  }

  _bindBus() {
    // Accept both raw face landmark events and direct blendshape events
    this._bus.on('alk.video.landmarks.face', (ev) => {
      const payload = ev.payload ?? ev;
      const raw = payload.rawLandmarks ?? null;
      const bsArr = payload.blendshapes ?? null;
      if (bsArr) {
        // Direct blendshape array
        const bs = {};
        const cats = Array.isArray(bsArr[0]?.categories) ? bsArr[0].categories : bsArr;
        for (const c of cats) bs[c.categoryName ?? c.displayName] = c.score;
        this.ingest(bs, payload.frameIndex ?? this._frameIdx);
      }
    });

    // Also accept direct injection
    this._bus.on('alk.expression.ingest', (ev) => {
      const p = ev.payload ?? ev;
      if (p.blendshapes) this.ingest(p.blendshapes, p.frameIndex ?? this._frameIdx);
    });
  }

  /**
   * Primary entry point. Call every frame with current blendshape map.
   * @param {object} bs   — { blendshapeName: score [0..1] }
   * @param {number} fi   — frame index
   */
  ingest(bs, fi) {
    this._frameIdx = fi ?? this._frameIdx + 1;
    const head = this._ringHead;
    const RING = this._T.RING_SIZE;

    // Write current values into ring buffers + compute velocity/acceleration
    const vel = {};
    const accel = {};
    const prev = (this._ringHead - 1 + RING) % RING;
    const prevPrev = (this._ringHead - 2 + RING) % RING;

    for (const name of ALL_BS) {
      const cur = bs[name] ?? 0;
      this._rings[name][head] = cur;
      const vPrev = this._rings[name][prev] ?? 0;
      const vPrevPrev = this._rings[name][prevPrev] ?? 0;
      vel[name]   = cur - vPrev;
      accel[name] = vel[name] - (vPrev - vPrevPrev);
    }

    this._ringHead = (head + 1) % RING;

    // ── Per-blendshape onset + suppression tracking ─────────────────────────
    const microEvents   = [];
    const partialEvents = [];
    const macroEvents   = [];

    for (const name of ALL_BS) {
      const os = this._onsetState[name];
      const cur = bs[name] ?? 0;
      const v   = vel[name];
      const T   = this._T;

      // Count active frames (above partial threshold)
      if (cur > T.PARTIAL_THRESH) {
        os.activeFrames++;
      } else {
        // Just dropped below threshold — evaluate what kind of expression it was
        if (os.activeFrames >= T.PARTIAL_MIN_FRAMES && os.activeFrames < T.MACRO_MIN_FRAMES) {
          partialEvents.push({
            bs: name,
            durationFrames: os.activeFrames,
            peakVel: os.onsetVel,
            suppressed: os.suppressed,
            frameIndex: this._frameIdx,
          });
        }
        os.activeFrames = 0;
        os.suppressed = false;
      }

      // Macro: currently sustaining above macro threshold
      if (cur > T.MACRO_THRESH && os.activeFrames >= T.MACRO_MIN_FRAMES) {
        macroEvents.push({
          bs: name,
          value: cur,
          durationFrames: os.activeFrames,
          frameIndex: this._frameIdx,
        });
      }

      // Onset detection: rapid rise from low baseline
      const wasLow = this._rings[name][(head - 3 + RING) % RING] < T.PARTIAL_THRESH * 0.6;
      if (wasLow && v > T.MICRO_ONSET_VEL) {
        os.onsetFrame = this._frameIdx;
        os.onsetVel   = v;
        os.suppressed = false;
      }

      // Suppression detection: rapid reversal within suppress window
      if (
        os.onsetFrame > 0 &&
        this._frameIdx - os.onsetFrame <= T.SUPPRESS_WINDOW &&
        v < -T.MICRO_SUPPRESS_VEL
      ) {
        os.suppressed = true;
        const durationFrames = this._frameIdx - os.onsetFrame;
        if (durationFrames <= 6) {
          // Confirmed micro-expression
          microEvents.push({
            bs: name,
            onsetVel: os.onsetVel,
            suppressionVel: Math.abs(v),
            suppressionConfidence: Math.min(1, Math.abs(v) / os.onsetVel),
            durationFrames,
            frameIndex: this._frameIdx,
          });
          os.onsetFrame = -999;
        }
      }
    }

    // ── Composite pattern matching ──────────────────────────────────────────
    const compositeResults = this._matchComposites(bs, vel);

    // ── Emit events ──────────────────────────────────────────────────────────
    this._emitMicros(microEvents, bs, compositeResults);
    this._emitPartials(partialEvents, bs, compositeResults);
    this._emitMacros(macroEvents, bs, compositeResults);
    this._emitComposites(compositeResults, bs);

    // State snapshot
    if (this._frameIdx % this._T.STATE_INTERVAL === 0) {
      this._emitState(bs, compositeResults);
    }

    return compositeResults;
  }

  // ── Composite pattern matching ─────────────────────────────────────────────
  _matchComposites(bs, vel) {
    const results = [];
    const T = this._T;

    for (const [label, pattern] of Object.entries(AU_PATTERNS)) {
      const conf   = scorePattern(pattern, bs);
      const asym   = asymmetryScore(pattern, bs);

      if (conf < T.COMPOSITE_CONF_THRESH) {
        this._compositeActive.delete(label);
        continue;
      }

      // Contempt requires asymmetry — reject if bilateral
      if (pattern.requiresAsymmetry) {
        const smL = bs.mouthSmileLeft  ?? 0;
        const smR = bs.mouthSmileRight ?? 0;
        const asymVal = Math.abs(smL - smR);
        if (asymVal < T.ASYMMETRY_THRESH) continue; // both sides equal → not contempt
        if (Math.max(smL, smR) < T.PARTIAL_THRESH) continue;
      }

      // Duchenne check for JOY variants
      const duchenne = pattern.duchenne !== undefined
        ? pattern.duchenne
        : ((bs.cheekSquintLeft??0) + (bs.cheekSquintRight??0)) / 2 > 0.15;

      // Compute onset velocity for the pattern's key blendshapes
      const onsetVel = (pattern.microOnset ?? [])
        .reduce((sum, n) => sum + Math.max(0, vel[n] ?? 0), 0) / (pattern.microOnset?.length || 1);

      // Duration tracking
      let durFrames = 1;
      if (this._compositeActive.has(label)) {
        durFrames = this._compositeActive.get(label).durFrames + 1;
      }
      this._compositeActive.set(label, { durFrames, lastScore: conf });

      // Determine scale from duration
      let scale;
      if (durFrames <= 6)  scale = 'MICRO';
      else if (durFrames <= 15) scale = 'PARTIAL';
      else scale = 'MACRO';

      // Build AU activation map for this composite
      const aus = {};
      for (const au of [...(pattern.required), ...(pattern.supporting ?? [])]) {
        const v = bs[au.bs] ?? 0;
        if (v > 0.05) aus[au.bs] = parseFloat(v.toFixed(3));
      }

      results.push({
        label,
        confidence:  parseFloat(conf.toFixed(3)),
        asymmetry:   parseFloat(asym.toFixed(3)),
        duchenne,
        scale,
        durationFrames: durFrames,
        onsetVel:    parseFloat(onsetVel.toFixed(4)),
        aus,
        frameIndex:  this._frameIdx,
      });
    }

    // Sort by confidence descending
    results.sort((a, b) => b.confidence - a.confidence);
    return results;
  }

  // ── Emitters ───────────────────────────────────────────────────────────────

  _emitMicros(events, bs, composites) {
    if (!events.length) return;
    // Group micro events by the composite they belong to
    for (const ev of events) {
      const matchingComposite = composites.find(c =>
        c.scale === 'MICRO' && (c.aus[ev.bs] !== undefined || (AU_PATTERNS[c.label]?.microOnset ?? []).includes(ev.bs))
      );
      const label = matchingComposite?.label ?? _bsToLabel(ev.bs);
      this.stats.micros++;
      this.stats.byLabel[label] = (this.stats.byLabel[label] ?? 0) + 1;
      this._emit('alk.expression.micro', {
        label,
        bs: ev.bs,
        onsetVel: parseFloat(ev.onsetVel.toFixed(4)),
        suppressionConfidence: parseFloat(ev.suppressionConfidence.toFixed(3)),
        durationFrames: ev.durationFrames,
        composite: matchingComposite ?? null,
        frameIndex: ev.frameIndex,
      });
    }
  }

  _emitPartials(events, bs, composites) {
    if (!events.length) return;
    for (const ev of events) {
      const matchingComposite = composites.find(c => c.scale === 'PARTIAL' && c.aus[ev.bs] !== undefined);
      const label = matchingComposite?.label ?? _bsToLabel(ev.bs);
      this.stats.partials++;
      this.stats.byLabel[label] = (this.stats.byLabel[label] ?? 0) + 1;
      this._emit('alk.expression.partial', {
        label,
        bs: ev.bs,
        durationFrames: ev.durationFrames,
        peakVel: parseFloat((ev.peakVel ?? 0).toFixed(4)),
        suppressed: ev.suppressed,
        composite: matchingComposite ?? null,
        frameIndex: ev.frameIndex,
      });
    }
  }

  _emitMacros(events, bs, composites) {
    // Deduplicate: only emit once per blendshape per 10 frames
    const seen = new Set();
    for (const ev of events) {
      if (seen.has(ev.bs)) continue;
      // Only emit every 10 frames for sustained macros to avoid flooding
      if (ev.durationFrames % 10 !== 0) continue;
      seen.add(ev.bs);
      const matchingComposite = composites.find(c => c.scale === 'MACRO' && c.aus[ev.bs] !== undefined);
      const label = matchingComposite?.label ?? _bsToLabel(ev.bs);
      this.stats.macros++;
      this._emit('alk.expression.macro', {
        label,
        bs: ev.bs,
        value: parseFloat(ev.value.toFixed(3)),
        durationFrames: ev.durationFrames,
        composite: matchingComposite ?? null,
        frameIndex: ev.frameIndex,
      });
    }
  }

  _emitComposites(results, bs) {
    if (!results.length) return;
    for (const result of results) {
      // Only emit on scale transitions or every 15 frames for macro
      const prev = this._compositeActive.get(result.label);
      const isNewScale = !prev || prev.scale !== result.scale;
      const shouldEmit = isNewScale ||
        (result.scale === 'MICRO')   ||
        (result.scale === 'PARTIAL' && result.durationFrames % 5 === 0) ||
        (result.scale === 'MACRO'   && result.durationFrames % 15 === 0);

      if (!shouldEmit) continue;
      this.stats.composites++;
      this.stats.byLabel[result.label] = (this.stats.byLabel[result.label] ?? 0) + 1;
      this._emit('alk.expression.composite', result);
    }
  }

  _emitState(bs, composites) {
    // Compact state: current composite scores + top expression
    const scores = {};
    for (const [label] of Object.entries(AU_PATTERNS)) {
      scores[label] = parseFloat(scorePattern(AU_PATTERNS[label], bs).toFixed(3));
    }
    const top = composites[0] ?? null;
    this._emit('alk.expression.state', {
      frameIndex:  this._frameIdx,
      scores,
      dominant:    top?.label ?? null,
      confidence:  top?.confidence ?? 0,
      scale:       top?.scale ?? null,
      duchenne:    top?.duchenne ?? false,
      stats:       { ...this.stats },
    });
  }

  _emit(event, data) {
    try { this._bus?.emit(event, data); } catch (_) {}
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Get current composite scores without emitting */
  score(bs) {
    const out = {};
    for (const [label, pattern] of Object.entries(AU_PATTERNS)) {
      out[label] = scorePattern(pattern, bs);
    }
    return out;
  }

  /** Update thresholds at runtime */
  configure(thresholds) {
    Object.assign(this._T, thresholds);
  }

  /** Reset ring buffers and state */
  reset() {
    for (const bs of ALL_BS) {
      this._rings[bs].fill(0);
      this._onsetState[bs] = { onsetFrame: -999, onsetVel: 0, suppressed: false, activeFrames: 0 };
    }
    this._compositeActive.clear();
    this._ringHead = 0;
  }

  health() {
    return {
      status:      'OK',
      uuid:        EXPR_UUID,
      version:     EXPR_VERSION,
      frameIndex:  this._frameIdx,
      ringSize:    this._T.RING_SIZE,
      stats:       { ...this.stats },
      activeComposites: [...this._compositeActive.keys()],
    };
  }
}

// ── Label inference from blendshape name ──────────────────────────────────────
function _bsToLabel(bs) {
  if (bs.startsWith('browDown'))    return 'ANGER';
  if (bs.startsWith('noseSneer'))   return 'DISGUST';
  if (bs.startsWith('mouthFrown'))  return 'SADNESS';
  if (bs.startsWith('eyeWide'))     return 'SURPRISE';
  if (bs.startsWith('browInnerUp')) return 'FEAR';
  if (bs.startsWith('mouthSmile'))  return 'JOY_SOCIAL';
  if (bs.startsWith('cheekSquint')) return 'JOY_GENUINE';
  if (bs.startsWith('mouthStretch'))return 'FEAR';
  if (bs.startsWith('mouthPress'))  return 'ANGER';
  return 'UNKNOWN';
}

// ── AU_PATTERNS accessor (for external use) ───────────────────────────────────
export { AU_PATTERNS, scorePattern, asymmetryScore, ALL_BS };
