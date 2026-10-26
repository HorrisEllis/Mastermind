/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ALK VideoModule  ·  video-module.js  ·  v1.1.0                    ║
 * ║  UUID: alk-mod-video-0000-1100-0000-000000000050                   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Real MediaPipe landmark wiring for the ALK Associative Lattice Kernel.
 *
 * WHAT THIS MODULE OWNS:
 *   - MediaPipe FaceMesh / FaceLandmarker integration (468 + blendshape points)
 *   - MediaPipe Pose (33 body landmarks)
 *   - MediaPipe Hands (21 landmarks per hand, up to 2 hands)
 *   - Landmark math: angles, distances, velocities, symmetry
 *   - Cue classification pipeline (rule-based + threshold, §1.1 — nothing pretends)
 *   - Frame-rate governor (skip frames when backpressured)
 *   - Cross-frame temporal smoothing (EMA per landmark)
 *   - Per-session cue history and frequency analysis
 *
 * WHAT THIS MODULE DOES NOT OWN:
 *   - Video capture (→ consumer code / session orchestrator)
 *   - Session storage (→ MemoryModule)
 *   - LLM interpretation (→ OllamaModule)
 *   - Audio sync (→ VerbalModule via shared sessionId)
 *
 * EVENT SURFACE:
 *
 *   Listens:
 *     alk.session.capture.start     — begin session
 *     alk.session.capture.stop      — end session
 *     alk.video.frame.ingest        — push a video frame for analysis
 *                                     payload: { imageData|bitmap|tensor, frameIndex, wallTs }
 *     alk.video.mediapipe.loaded    — MediaPipe models ready (emitted by loader)
 *     alk.video.config              — runtime config update
 *
 *   Emits:
 *     alk.video.capture.start
 *     alk.video.capture.stop
 *     alk.video.mediapipe.loading   — model load started
 *     alk.video.mediapipe.ready     — all models loaded
 *     alk.video.frame.analyzed      — frame processed: landmark counts, timing
 *     alk.video.landmarks.face      — 468 face landmarks + blendshapes
 *     alk.video.landmarks.pose      — 33 pose landmarks + world coords
 *     alk.video.landmarks.hands     — up to 2×21 hand landmarks
 *     alk.video.cue.detected        — classified nonverbal cue
 *     alk.video.cue.sustained       — cue held for N frames (escalation)
 *     alk.video.cue.released        — cue no longer present
 *     alk.video.analysis.summary    — per-second summary: cue frequencies
 *     alk.video.error
 *
 * CUE TAXONOMY:
 *   OCULAR    — gaze_aversion, eye_contact_break, blink_rate_high,
 *               brow_furrow, brow_raise, eye_widen
 *   FACIAL    — mouth_tighten, jaw_clench, lip_compress, smile_genuine,
 *               smile_social, disgust_micro, contempt_micro, fear_micro
 *   PROXEMIC  — head_tilt_left, head_tilt_right, head_nod, head_shake,
 *               head_lower, head_raise, lean_forward, lean_back
 *   SOMATIC   — shoulder_raise, shoulder_asymmetry, arm_cross,
 *               self_touch_face, self_touch_neck, fidget
 *   GESTURAL  — open_palm, pointing, wrist_guard, hand_to_mouth
 *
 * MEDIAPIPE TARGETS:
 *   Browser: @mediapipe/tasks-vision  (CDN or npm)
 *   Node:    @mediapipe/tasks-vision  (Node.js headless, requires canvas pkg)
 *
 * §1.1 — Every output value is computed from landmark geometry.
 *         No ML classifier pretends to be more than a threshold detector.
 *         Blendshape scores (where available) are passed through raw.
 */

import { ALKModule } from '../../kernel.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const MODULE_UUID    = 'alk-mod-video-0000-1100-0000-000000000050';
const MODULE_VERSION = '1.1.0';
const MODULE_NS      = 'alk.video';

// MediaPipe FaceMesh landmark indices (subset used for cue geometry)
export const FACE_IDX = Object.freeze({
  // Iris
  LEFT_IRIS_CENTER:  468,
  RIGHT_IRIS_CENTER: 473,
  // Eye corners
  LEFT_EYE_OUTER:    33,
  LEFT_EYE_INNER:    133,
  RIGHT_EYE_OUTER:   362,
  RIGHT_EYE_INNER:   263,
  // Eyelids (vertical)
  LEFT_EYE_TOP:      159,
  LEFT_EYE_BOTTOM:   145,
  RIGHT_EYE_TOP:     386,
  RIGHT_EYE_BOTTOM:  374,
  // Brows
  LEFT_BROW_INNER:   107,
  LEFT_BROW_OUTER:   70,
  RIGHT_BROW_INNER:  336,
  RIGHT_BROW_OUTER:  300,
  // Nose
  NOSE_TIP:          4,
  NOSE_BASE:         6,
  // Mouth
  MOUTH_LEFT:        61,
  MOUTH_RIGHT:       291,
  MOUTH_TOP:         13,
  MOUTH_BOTTOM:      14,
  UPPER_LIP:         0,
  LOWER_LIP:         17,
  // Jaw / chin
  JAW_LEFT:          234,
  JAW_RIGHT:         454,
  CHIN:              152,
  FOREHEAD:          10,
  // Cheeks
  LEFT_CHEEK:        116,
  RIGHT_CHEEK:       345,
});

// MediaPipe Pose landmark indices
export const POSE_IDX = Object.freeze({
  NOSE:              0,
  LEFT_SHOULDER:     11,
  RIGHT_SHOULDER:    12,
  LEFT_ELBOW:        13,
  RIGHT_ELBOW:       14,
  LEFT_WRIST:        15,
  RIGHT_WRIST:       16,
  LEFT_HIP:          23,
  RIGHT_HIP:         24,
  LEFT_EAR:          7,
  RIGHT_EAR:         8,
});

// Cue categories
export const CUE_CATEGORY = Object.freeze({
  OCULAR:   'OCULAR',
  FACIAL:   'FACIAL',
  PROXEMIC: 'PROXEMIC',
  SOMATIC:  'SOMATIC',
  GESTURAL: 'GESTURAL',
});

// Significance levels (§1.1 — named thresholds, not magic numbers)
export const SIGNIFICANCE = Object.freeze({
  SUBTLE:   'SUBTLE',    // just over threshold
  MODERATE: 'MODERATE',
  STRONG:   'STRONG',    // well above threshold
});

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const VIDEO_DEFAULTS = Object.freeze({
  // MediaPipe model URIs (CDN fallback — override for offline/Node)
  modelBaseUrl: 'https://storage.googleapis.com/mediapipe-models',
  faceLandmarkerModel: 'face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  poseLandmarkerModel: 'pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  handLandmarkerModel: 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',

  // Which detectors to load
  enableFace:  true,
  enablePose:  true,
  enableHands: true,

  // Frame processing
  targetFPS:          15,    // governor target
  smoothingAlpha:     0.35,  // EMA smoothing (0=none, 1=no smoothing)
  minDetectionConf:   0.5,
  minTrackingConf:    0.5,
  minPresenceConf:    0.5,
  numFaces:           2,
  numHands:           2,

  // Cue thresholds (all tunable at runtime via alk.video.config)
  thresholds: {
    // Ocular
    earThreshold:       0.20,   // eye aspect ratio — below = blink/closed
    gazeDeviationMax:   0.30,   // normalized iris offset — above = aversion
    browRaiseMin:       0.04,   // brow-eye distance delta
    browFurrowMin:      0.015,  // inner brow convergence
    blinkRateHighHz:    0.5,    // blinks/sec above this = elevated blink rate

    // Facial
    mouthTightenMax:    0.015,  // mouth width/height ratio below this = compress
    lipCompressMax:     0.008,
    jawClenchProxy:     0.018,  // cheek-jaw distance reduction
    smileMin:           0.04,   // mouth corner lift
    duchenneDiff:       0.02,   // eye crinkle lift differentiates genuine smile

    // Proxemic (head pose)
    headTiltDegMin:     10,     // degrees off vertical
    headNodVelMin:      0.015,  // Y velocity
    headShakeVelMin:    0.015,  // X velocity
    headLowerMin:       0.05,   // chin-down normalized

    // Somatic
    shoulderRaiseMin:   0.04,   // shoulder-ear distance reduction
    shoulderAsymMin:    0.03,   // L-R shoulder height diff
    selfTouchProxMin:   0.12,   // wrist-nose distance

    // Gestural
    openPalmFlatMin:    0.85,   // finger extension score
    handToMouthMax:     0.15,   // wrist-mouth distance
  },

  // Sustained cue detection
  sustainedFrames:    8,     // frames held before emitting alk.video.cue.sustained
  summaryIntervalMs:  1000,  // per-second summary emit
});

// ─── EMA Smoother ─────────────────────────────────────────────────────────────

class EMASmoother {
  constructor(alpha = 0.35) {
    this._alpha = alpha;
    this._state = {};
  }

  smooth(key, value) {
    if (this._state[key] === undefined) { this._state[key] = value; return value; }
    this._state[key] = this._alpha * value + (1 - this._alpha) * this._state[key];
    return this._state[key];
  }

  get(key) { return this._state[key] ?? null; }
  reset()   { this._state = {}; }
}

// ─── Landmark Math ────────────────────────────────────────────────────────────

/**
 * All math operates on normalized landmark coordinates [0..1] unless
 * specified. Face landmarks use image-space xy + depth z.
 */
export const LM = {
  dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
    return Math.sqrt(dx*dx + dy*dy + dz*dz);
  },

  dist2d(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  },

  midpoint(a, b) {
    return { x: (a.x+b.x)/2, y: (a.y+b.y)/2, z: ((a.z??0)+(b.z??0))/2 };
  },

  /** Eye Aspect Ratio — landmark indices for one eye's 6 points */
  ear(top, bottom, left, right) {
    const vertical   = this.dist2d(top, bottom);
    const horizontal = this.dist2d(left, right);
    return horizontal > 0 ? vertical / horizontal : 0;
  },

  /** Angle of vector (a→b) from vertical, in degrees */
  angleFromVertical(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return Math.atan2(dx, -dy) * (180 / Math.PI);
  },

  /** Signed head tilt in degrees (positive = right tilt) */
  headTilt(noseTip, forehead) {
    return this.angleFromVertical(forehead, noseTip);
  },

  /** Head nod angle (pitch) — nose tip relative to midpoint of ears */
  headNod(noseTip, leftEar, rightEar) {
    const earMid = this.midpoint(leftEar, rightEar);
    const dy = noseTip.y - earMid.y;
    const dz = (noseTip.z ?? 0) - (earMid.z ?? 0);
    return Math.atan2(dy, Math.abs(dz) + 0.001) * (180 / Math.PI);
  },

  /** Gaze offset: iris center relative to eye center, normalized by eye width */
  gazeOffset(irisCtr, eyeInner, eyeOuter) {
    const eyeCtr = this.midpoint(eyeInner, eyeOuter);
    const eyeW   = this.dist2d(eyeInner, eyeOuter);
    return eyeW > 0
      ? { x: (irisCtr.x - eyeCtr.x) / eyeW, y: (irisCtr.y - eyeCtr.y) / eyeW }
      : { x: 0, y: 0 };
  },

  /** Finger extension score: 0=closed, 1=fully extended */
  fingerExtension(tip, mcp, wrist) {
    const tipDist   = this.dist2d(tip, wrist);
    const mcpDist   = this.dist2d(mcp, wrist);
    return mcpDist > 0 ? Math.min(1, tipDist / (mcpDist * 2.2)) : 0;
  },

  /** Shoulder midpoint Y, normalized */
  shoulderMidY(ls, rs) { return (ls.y + rs.y) / 2; },

  r4(n) { return Math.round(n * 10000) / 10000; },
};

// ─── Cue Classifier ───────────────────────────────────────────────────────────

/**
 * CueClassifier — stateless function pipeline.
 * Each classifier receives pre-computed metrics and returns a cue descriptor or null.
 * §1.1 — threshold-based only. No ML. No pretending.
 */
export class CueClassifier {
  constructor(thresholds) {
    this._t = thresholds;
  }

  /**
   * @param {object} metrics — pre-computed from face/pose/hand landmarks
   * @returns {Array<CueDescriptor>}
   */
  classify(metrics) {
    const cues = [];
    const t    = this._t;

    // ── OCULAR ──────────────────────────────────────────────────────────────
    if (metrics.leftEAR !== null && metrics.rightEAR !== null) {
      const avgEAR = (metrics.leftEAR + metrics.rightEAR) / 2;
      if (avgEAR < t.earThreshold && avgEAR > 0.01) {
        cues.push(this._cue('blink', CUE_CATEGORY.OCULAR, 1 - avgEAR / t.earThreshold));
      }
    }

    if (metrics.leftGaze && metrics.rightGaze) {
      const gazeLeft  = Math.sqrt(metrics.leftGaze.x**2  + metrics.leftGaze.y**2);
      const gazeRight = Math.sqrt(metrics.rightGaze.x**2 + metrics.rightGaze.y**2);
      const avgGaze   = (gazeLeft + gazeRight) / 2;
      if (avgGaze > t.gazeDeviationMax) {
        cues.push(this._cue('gaze_aversion', CUE_CATEGORY.OCULAR,
          Math.min(1, (avgGaze - t.gazeDeviationMax) / t.gazeDeviationMax),
          { gazeX: LM.r4(metrics.leftGaze.x), gazeY: LM.r4(metrics.leftGaze.y) }
        ));
      }
    }

    if (metrics.browRaiseDelta > t.browRaiseMin) {
      cues.push(this._cue('brow_raise', CUE_CATEGORY.OCULAR,
        Math.min(1, metrics.browRaiseDelta / (t.browRaiseMin * 3)),
        { delta: LM.r4(metrics.browRaiseDelta) }
      ));
    }

    if (metrics.browFurrow > t.browFurrowMin) {
      cues.push(this._cue('brow_furrow', CUE_CATEGORY.OCULAR,
        Math.min(1, metrics.browFurrow / (t.browFurrowMin * 3)),
        { furrow: LM.r4(metrics.browFurrow) }
      ));
    }

    // ── FACIAL ──────────────────────────────────────────────────────────────
    if (metrics.mouthOpenRatio !== null) {
      if (metrics.mouthOpenRatio < t.mouthTightenMax) {
        cues.push(this._cue('mouth_tighten', CUE_CATEGORY.FACIAL,
          1 - metrics.mouthOpenRatio / t.mouthTightenMax,
          { ratio: LM.r4(metrics.mouthOpenRatio) }
        ));
      }
    }

    if (metrics.lipCompressRatio !== null && metrics.lipCompressRatio < t.lipCompressMax) {
      cues.push(this._cue('lip_compress', CUE_CATEGORY.FACIAL,
        1 - metrics.lipCompressRatio / t.lipCompressMax
      ));
    }

    if (metrics.smileScore !== null && metrics.smileScore > t.smileMin) {
      // Duchenne marker: check eye crinkle (blendshape or approximation)
      const isGenuine = (metrics.eyeCrinkleDiff ?? 0) > t.duchenneDiff;
      cues.push(this._cue(isGenuine ? 'smile_genuine' : 'smile_social', CUE_CATEGORY.FACIAL,
        Math.min(1, metrics.smileScore / (t.smileMin * 3)),
        { duchenne: isGenuine }
      ));
    }

    // Blendshape pass-through (if MediaPipe provides them)
    if (metrics.blendshapes) {
      const bs = metrics.blendshapes;
      if ((bs.mouthFrownLeft ?? 0) + (bs.mouthFrownRight ?? 0) > 0.6) {
        cues.push(this._cue('disgust_micro', CUE_CATEGORY.FACIAL,
          ((bs.mouthFrownLeft ?? 0) + (bs.mouthFrownRight ?? 0)) / 2,
          { source: 'blendshape' }
        ));
      }
      if ((bs.mouthLeft ?? 0) > 0.3 && (bs.mouthRight ?? 0) < 0.1) {
        cues.push(this._cue('contempt_micro', CUE_CATEGORY.FACIAL,
          bs.mouthLeft, { source: 'blendshape', side: 'left' }
        ));
      }
      if ((bs.mouthRight ?? 0) > 0.3 && (bs.mouthLeft ?? 0) < 0.1) {
        cues.push(this._cue('contempt_micro', CUE_CATEGORY.FACIAL,
          bs.mouthRight, { source: 'blendshape', side: 'right' }
        ));
      }
      if ((bs.eyeWideLeft ?? 0) + (bs.eyeWideRight ?? 0) > 0.7) {
        cues.push(this._cue('eye_widen', CUE_CATEGORY.OCULAR,
          ((bs.eyeWideLeft ?? 0) + (bs.eyeWideRight ?? 0)) / 2,
          { source: 'blendshape' }
        ));
      }
    }

    // ── PROXEMIC (head pose) ─────────────────────────────────────────────────
    if (metrics.headTiltDeg !== null) {
      const abs = Math.abs(metrics.headTiltDeg);
      if (abs > t.headTiltDegMin) {
        const dir = metrics.headTiltDeg > 0 ? 'right' : 'left';
        cues.push(this._cue(`head_tilt_${dir}`, CUE_CATEGORY.PROXEMIC,
          Math.min(1, (abs - t.headTiltDegMin) / 20),
          { degrees: LM.r4(metrics.headTiltDeg) }
        ));
      }
    }

    if (metrics.headVelY !== null && Math.abs(metrics.headVelY) > t.headNodVelMin) {
      cues.push(this._cue('head_nod', CUE_CATEGORY.PROXEMIC,
        Math.min(1, Math.abs(metrics.headVelY) / (t.headNodVelMin * 3)),
        { direction: metrics.headVelY > 0 ? 'down' : 'up', vel: LM.r4(metrics.headVelY) }
      ));
    }

    if (metrics.headVelX !== null && Math.abs(metrics.headVelX) > t.headShakeVelMin) {
      cues.push(this._cue('head_shake', CUE_CATEGORY.PROXEMIC,
        Math.min(1, Math.abs(metrics.headVelX) / (t.headShakeVelMin * 3)),
        { direction: metrics.headVelX > 0 ? 'right' : 'left', vel: LM.r4(metrics.headVelX) }
      ));
    }

    // ── SOMATIC (body) ───────────────────────────────────────────────────────
    if (metrics.shoulderRaiseDelta !== null && metrics.shoulderRaiseDelta > t.shoulderRaiseMin) {
      cues.push(this._cue('shoulder_raise', CUE_CATEGORY.SOMATIC,
        Math.min(1, metrics.shoulderRaiseDelta / (t.shoulderRaiseMin * 3)),
        { delta: LM.r4(metrics.shoulderRaiseDelta) }
      ));
    }

    if (metrics.shoulderAsymmetry !== null && metrics.shoulderAsymmetry > t.shoulderAsymMin) {
      cues.push(this._cue('shoulder_asymmetry', CUE_CATEGORY.SOMATIC,
        Math.min(1, metrics.shoulderAsymmetry / (t.shoulderAsymMin * 3))
      ));
    }

    if (metrics.selfTouchFace) {
      cues.push(this._cue('self_touch_face', CUE_CATEGORY.SOMATIC, metrics.selfTouchFace,
        { proximity: LM.r4(metrics.selfTouchFaceProx ?? 0) }
      ));
    }

    // ── GESTURAL (hands) ────────────────────────────────────────────────────
    if (metrics.handExtensionScore !== null && metrics.handExtensionScore > t.openPalmFlatMin) {
      cues.push(this._cue('open_palm', CUE_CATEGORY.GESTURAL,
        Math.min(1, metrics.handExtensionScore),
        { hand: metrics.dominantHand ?? 'unknown' }
      ));
    }

    if (metrics.handToMouthDist !== null && metrics.handToMouthDist < t.handToMouthMax) {
      cues.push(this._cue('hand_to_mouth', CUE_CATEGORY.GESTURAL,
        1 - metrics.handToMouthDist / t.handToMouthMax,
        { dist: LM.r4(metrics.handToMouthDist) }
      ));
    }

    return cues;
  }

  _cue(type, category, intensity, detail = {}) {
    const sig = intensity >= 0.7 ? SIGNIFICANCE.STRONG
              : intensity >= 0.4 ? SIGNIFICANCE.MODERATE
              : SIGNIFICANCE.SUBTLE;
    return {
      cueType:     type,
      category,
      intensity:   LM.r4(intensity),
      significance: sig,
      detail,
    };
  }
}

// ─── MetricsExtractor ─────────────────────────────────────────────────────────

/**
 * Extracts normalized scalar metrics from raw MediaPipe landmark arrays.
 * All values are smoothed via EMA before being passed to the classifier.
 *
 * Face input:  landmarks[]  (NormalizedLandmark[] — .x .y .z, all [0..1])
 *              blendshapes? (Classifications[]    — .score .categoryName)
 * Pose input:  landmarks[]  (NormalizedLandmark[], 33 points)
 * Hands input: { left?: landmarks[], right?: landmarks[] }
 */
export class MetricsExtractor {
  constructor({ smoothingAlpha = 0.35 } = {}) {
    this._ema = new EMASmoother(smoothingAlpha);
    this._prevNose = null;  // for velocity
  }

  extract(faceLMs, poseLMs, handsLMs, blendshapes) {
    const m = {
      // Ocular
      leftEAR:        null,
      rightEAR:       null,
      leftGaze:       null,
      rightGaze:      null,
      browRaiseDelta:  0,
      browFurrow:      0,
      eyeCrinkleDiff:  null,
      // Facial
      mouthOpenRatio:  null,
      lipCompressRatio: null,
      smileScore:      null,
      blendshapes:     null,
      // Proxemic
      headTiltDeg:     null,
      headNodDeg:      null,
      headVelX:        null,
      headVelY:        null,
      // Somatic
      shoulderRaiseDelta:  null,
      shoulderAsymmetry:   null,
      selfTouchFace:       false,
      selfTouchFaceProx:   null,
      // Gestural
      handExtensionScore:  null,
      handToMouthDist:     null,
      dominantHand:        null,
    };

    // ── Face landmarks ───────────────────────────────────────────────────────
    if (faceLMs && faceLMs.length >= 468) {
      const f = (i) => faceLMs[i];

      // EAR — eye aspect ratio
      const lEAR = LM.ear(f(FACE_IDX.LEFT_EYE_TOP), f(FACE_IDX.LEFT_EYE_BOTTOM),
                          f(FACE_IDX.LEFT_EYE_OUTER), f(FACE_IDX.LEFT_EYE_INNER));
      const rEAR = LM.ear(f(FACE_IDX.RIGHT_EYE_TOP), f(FACE_IDX.RIGHT_EYE_BOTTOM),
                          f(FACE_IDX.RIGHT_EYE_OUTER), f(FACE_IDX.RIGHT_EYE_INNER));
      m.leftEAR  = this._ema.smooth('lEAR', lEAR);
      m.rightEAR = this._ema.smooth('rEAR', rEAR);

      // Gaze — iris relative to eye center (requires 478-point model with iris)
      if (faceLMs.length >= 478) {
        m.leftGaze  = LM.gazeOffset(f(FACE_IDX.LEFT_IRIS_CENTER),
                                    f(FACE_IDX.LEFT_EYE_INNER), f(FACE_IDX.LEFT_EYE_OUTER));
        m.rightGaze = LM.gazeOffset(f(FACE_IDX.RIGHT_IRIS_CENTER),
                                    f(FACE_IDX.RIGHT_EYE_INNER), f(FACE_IDX.RIGHT_EYE_OUTER));
        m.leftGaze.x  = this._ema.smooth('lgx', m.leftGaze.x);
        m.leftGaze.y  = this._ema.smooth('lgy', m.leftGaze.y);
        m.rightGaze.x = this._ema.smooth('rgx', m.rightGaze.x);
        m.rightGaze.y = this._ema.smooth('rgy', m.rightGaze.y);
      }

      // Brow geometry
      const lBrowY  = f(FACE_IDX.LEFT_BROW_INNER).y;
      const lEyeY   = f(FACE_IDX.LEFT_EYE_TOP).y;
      const browGap = lEyeY - lBrowY;
      const browRef = this._ema.smooth('browRef', browGap);
      m.browRaiseDelta = this._ema.smooth('browRaise', Math.max(0, browRef - browGap));

      const lBI  = f(FACE_IDX.LEFT_BROW_INNER);
      const rBI  = f(FACE_IDX.RIGHT_BROW_INNER);
      m.browFurrow = this._ema.smooth('browFurrow', Math.max(0, 0.15 - LM.dist2d(lBI, rBI)));

      // Mouth
      const mouthW  = LM.dist2d(f(FACE_IDX.MOUTH_LEFT), f(FACE_IDX.MOUTH_RIGHT));
      const mouthH  = LM.dist2d(f(FACE_IDX.MOUTH_TOP), f(FACE_IDX.MOUTH_BOTTOM));
      const faceH   = LM.dist2d(f(FACE_IDX.FOREHEAD), f(FACE_IDX.CHIN));
      m.mouthOpenRatio   = this._ema.smooth('mouthOpen', faceH > 0 ? mouthH / faceH : 0);
      m.lipCompressRatio = this._ema.smooth('lipComp',   faceH > 0 ? mouthH / faceH : 0);

      // Smile: mouth corner lift relative to mouth center Y
      const mCtrY  = (f(FACE_IDX.MOUTH_LEFT).y + f(FACE_IDX.MOUTH_RIGHT).y) / 2;
      const midY   = f(FACE_IDX.MOUTH_TOP).y;
      m.smileScore = this._ema.smooth('smile', Math.max(0, midY - mCtrY) / Math.max(0.001, faceH));

      // Head tilt
      m.headTiltDeg = this._ema.smooth('headTilt',
        LM.headTilt(f(FACE_IDX.NOSE_TIP), f(FACE_IDX.FOREHEAD)));

      // Head velocity (nose movement frame-over-frame)
      const nose = f(FACE_IDX.NOSE_TIP);
      if (this._prevNose) {
        m.headVelX = this._ema.smooth('hvx', nose.x - this._prevNose.x);
        m.headVelY = this._ema.smooth('hvy', nose.y - this._prevNose.y);
      }
      this._prevNose = nose;
    }

    // ── Blendshapes ──────────────────────────────────────────────────────────
    if (blendshapes && blendshapes.length > 0) {
      const bs = {};
      const categories = blendshapes[0]?.categories ?? blendshapes;
      for (const cat of categories) {
        // normalize camelCase key
        const key = (cat.categoryName ?? cat.displayName ?? '').replace(/_([a-z])/g, (_,c) => c.toUpperCase());
        bs[key] = cat.score ?? 0;
      }
      m.blendshapes = bs;
      m.eyeCrinkleDiff = Math.abs((bs.eyeSquintLeft ?? 0) - (bs.eyeSquintRight ?? 0));
    }

    // ── Pose landmarks ───────────────────────────────────────────────────────
    if (poseLMs && poseLMs.length >= 25) {
      const p = (i) => poseLMs[i];
      const ls = p(POSE_IDX.LEFT_SHOULDER);
      const rs = p(POSE_IDX.RIGHT_SHOULDER);
      const le = p(POSE_IDX.LEFT_EAR);
      const re = p(POSE_IDX.RIGHT_EAR);

      // Shoulder raise: ear-shoulder distance reduction
      const lEarShoulderDist = LM.dist2d(le, ls);
      const rEarShoulderDist = LM.dist2d(re, rs);
      const baseESD = 0.18;  // typical normalized ear-shoulder gap
      m.shoulderRaiseDelta = this._ema.smooth('shoulderRaise',
        Math.max(0, baseESD - (lEarShoulderDist + rEarShoulderDist) / 2));

      // Shoulder asymmetry: Y difference L vs R
      m.shoulderAsymmetry = this._ema.smooth('shoulderAsym', Math.abs(ls.y - rs.y));
    }

    // ── Hand landmarks ───────────────────────────────────────────────────────
    if (handsLMs) {
      const hand = handsLMs.right ?? handsLMs.left ?? null;
      const handLabel = handsLMs.right ? 'right' : handsLMs.left ? 'left' : null;
      m.dominantHand = handLabel;

      if (hand && hand.length >= 21) {
        const h = (i) => hand[i];
        // Open palm: average extension of 4 fingers (index, middle, ring, pinky)
        // MCP = 5,9,13,17  TIP = 8,12,16,20  wrist = 0
        const wrist = h(0);
        const extensions = [
          LM.fingerExtension(h(8),  h(5),  wrist),
          LM.fingerExtension(h(12), h(9),  wrist),
          LM.fingerExtension(h(16), h(13), wrist),
          LM.fingerExtension(h(20), h(17), wrist),
        ];
        m.handExtensionScore = this._ema.smooth('palmExt',
          extensions.reduce((s,v) => s+v, 0) / extensions.length);

        // Hand to mouth: need face for this — pass via faceLMs
        if (faceLMs && faceLMs.length >= 14) {
          const mouth = faceLMs[FACE_IDX.MOUTH_TOP];
          const wristL = { x: h(0).x, y: h(0).y };
          m.handToMouthDist = this._ema.smooth('h2m', LM.dist2d(wristL, mouth));
        }
      }

      // Self-touch face: any wrist close to nose
      if (handsLMs && faceLMs && faceLMs.length > 4) {
        const nose = faceLMs[FACE_IDX.NOSE_TIP];
        const checkHand = (h) => {
          if (!h || h.length < 1) return Infinity;
          return LM.dist2d(h[0], nose);
        };
        const minDist = Math.min(
          checkHand(handsLMs.left),
          checkHand(handsLMs.right)
        );
        m.selfTouchFaceProx = minDist;
        m.selfTouchFace     = minDist < 0.12;
      }
    }

    return m;
  }

  reset() {
    this._ema.reset();
    this._prevNose = null;
  }
}

// ─── VideoModule ──────────────────────────────────────────────────────────────

export class VideoModule extends ALKModule {
  static UUID    = MODULE_UUID;
  static VERSION = MODULE_VERSION;
  static NS      = MODULE_NS;

  constructor({ kernel, config = {}, mediapipe = null } = {}) {
    super({ kernel, uuid: MODULE_UUID, version: MODULE_VERSION, ns: MODULE_NS });

    this._config   = this._mergeConfig(config);
    this._mp       = mediapipe;   // MediaPipe Tasks Vision namespace (injected)
    this._session  = null;
    this._frameIdx = 0;
    this._frameTs  = null;

    // Sub-components
    this._extractor  = new MetricsExtractor({ smoothingAlpha: this._config.smoothingAlpha });
    this._classifier = new CueClassifier(this._config.thresholds);

    // Detectors (initialized in _loadModels)
    this._faceLandmarker = null;
    this._poseLandmarker = null;
    this._handLandmarker = null;
    this._modelsReady    = false;

    // FPS governor
    this._lastFrameWall  = 0;
    this._frameIntervalMs = 1000 / this._config.targetFPS;

    // Cue state: type → { count, firstTs, lastTs }
    this._activeCues    = new Map();
    this._cueHistory    = [];
    this._summaryTimer  = null;

    // Blink tracking
    this._blinkCount    = 0;
    this._blinkWindow   = [];   // timestamps

    // Wire subscriptions
    this._sub('alk.session.capture.start', (ev) => this._onSessionStart(ev));
    this._sub('alk.session.capture.stop',  (ev) => this._onSessionStop(ev));
    this._sub('alk.video.frame.ingest',    (ev) => this._onFrameIngest(ev));
    this._sub('alk.video.mediapipe.loaded', (ev) => this._onMPLoaded(ev));
    this._sub('alk.video.config',          (ev) => this._onConfig(ev));
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  _onSessionStart(ev) {
    this._session   = ev.payload.sessionId;
    this._frameIdx  = 0;
    this._frameTs   = null;
    this._activeCues.clear();
    this._cueHistory = [];
    this._blinkCount = 0;
    this._blinkWindow = [];
    this._extractor.reset();

    this._emit('alk.video.capture.start', {
      sessionId: this._session,
      modelsReady: this._modelsReady,
      config: this._configSnapshot(),
    }, { causedBy: ev.id, sessionId: this._session });

    if (this._config.summaryIntervalMs > 0) {
      this._summaryTimer = setInterval(() => this._emitSummary(), this._config.summaryIntervalMs);
    }

    if (!this._modelsReady) this._loadModels();
  }

  _onSessionStop(ev) {
    clearInterval(this._summaryTimer);
    this._emitSummary();
    this._emit('alk.video.capture.stop', {
      sessionId:  this._session,
      frameCount: this._frameIdx,
      cueHistory: this._cueHistory.slice(-50),  // last 50 cues
    }, { causedBy: ev.id, sessionId: this._session });
    this._session = null;
  }

  // ── Frame ingestion ──────────────────────────────────────────────────────────

  async _onFrameIngest(ev) {
    if (!this._session) return;

    // FPS governor
    const now = Date.now();
    if (now - this._lastFrameWall < this._frameIntervalMs) return;
    this._lastFrameWall = now;

    this._frameIdx++;
    const frameId = ev.id;

    // Run MediaPipe if models are ready
    let faceLMs = null, poseLMs = null, handsLMs = null, blendshapes = null;

    if (this._modelsReady) {
      const { imageData, bitmap, timestamp } = ev.payload;
      const inputTs = timestamp ?? now;
      const input   = bitmap ?? imageData;

      try {
        if (this._faceLandmarker && input) {
          const faceResult = await this._faceLandmarker.detectForVideo(input, inputTs);
          if (faceResult.faceLandmarks?.length > 0) {
            faceLMs = faceResult.faceLandmarks[0];
            blendshapes = faceResult.faceBlendshapes?.[0]?.categories ?? null;
          }
        }

        if (this._poseLandmarker && input) {
          const poseResult = await this._poseLandmarker.detectForVideo(input, inputTs);
          if (poseResult.poseLandmarks?.length > 0) {
            poseLMs = poseResult.poseLandmarks[0];
          }
        }

        if (this._handLandmarker && input) {
          const handResult = await this._handLandmarker.detectForVideo(input, inputTs);
          if (handResult.landmarks?.length > 0) {
            handsLMs = {};
            for (let i = 0; i < handResult.landmarks.length; i++) {
              const handedness = handResult.handednesses?.[i]?.[0]?.categoryName?.toLowerCase() ?? 'right';
              handsLMs[handedness] = handResult.landmarks[i];
            }
          }
        }
      } catch (err) {
        this._emitError('MEDIAPIPE_DETECT_FAILED', err.message, { frameIndex: this._frameIdx });
      }
    } else if (ev.payload.landmarks) {
      // Pre-computed landmarks passed in directly (Node/test path)
      const lm = ev.payload.landmarks;
      faceLMs    = lm.face  ?? null;
      poseLMs    = lm.pose  ?? null;
      handsLMs   = lm.hands ?? null;
      blendshapes = lm.blendshapes ?? null;
    }

    // Extract + classify
    const metrics = this._extractor.extract(faceLMs, poseLMs, handsLMs, blendshapes);
    const cues    = this._classifier.classify(metrics);

    // Emit landmarks
    const lmMeta = { causedBy: frameId, sessionId: this._session };
    if (faceLMs) {
      this._emit('alk.video.landmarks.face', {
        frameIndex:  this._frameIdx,
        count:       faceLMs.length,
        landmarks:   this._sampleLandmarks(faceLMs, 20),  // sparse sample for event (full via direct ref)
        rawLandmarks: faceLMs,                             // full 468/478-point array for CFR bridge
        hasBlendshapes: !!blendshapes,
        headTiltDeg: metrics.headTiltDeg,
        leftEAR:     metrics.leftEAR,
        rightEAR:    metrics.rightEAR,
        leftGaze:    metrics.leftGaze  ?? null,            // {x,y} iris offset — null if no iris model
        rightGaze:   metrics.rightGaze ?? null,
      }, lmMeta);
    }

    if (poseLMs) {
      this._emit('alk.video.landmarks.pose', {
        frameIndex: this._frameIdx,
        count:      poseLMs.length,
        rawLandmarks: poseLMs,                             // full 33-point array for CFR bridge
        shoulderRaiseDelta: metrics.shoulderRaiseDelta,
        shoulderAsymmetry:  metrics.shoulderAsymmetry,
      }, lmMeta);
    }

    if (handsLMs) {
      this._emit('alk.video.landmarks.hands', {
        frameIndex:         this._frameIdx,
        handCount:          Object.keys(handsLMs).length,
        rawLandmarks:       handsLMs,                      // { left?: lm[21], right?: lm[21] } for CFR bridge
        handExtensionScore: metrics.handExtensionScore,
        dominantHand:       metrics.dominantHand,
      }, lmMeta);
    }

    // Emit frame analyzed summary
    this._emit('alk.video.frame.analyzed', {
      frameIndex:  this._frameIdx,
      sessionId:   this._session,
      hasFace:     !!faceLMs,
      hasPose:     !!poseLMs,
      hasHands:    !!handsLMs,
      cueCount:    cues.length,
      wallTs:      now,
    }, { causedBy: frameId, sessionId: this._session });

    // Process cues
    for (const cue of cues) {
      this._processCue(cue, frameId);
    }

    // Check for released cues
    this._checkReleasedCues(cues, frameId);
  }

  // ── Cue state machine ────────────────────────────────────────────────────────

  _processCue(cue, frameId) {
    const key = cue.cueType;
    const now = Date.now();

    if (!this._activeCues.has(key)) {
      // New cue
      this._activeCues.set(key, {
        cueType:   cue.cueType,
        category:  cue.category,
        firstTs:   now,
        lastTs:    now,
        frames:    1,
        maxIntensity: cue.intensity,
        detail:    cue.detail,
      });

      this._cueHistory.push({ ...cue, ts: now });
      if (this._cueHistory.length > 500) this._cueHistory.shift();

      this._emit('alk.video.cue.detected', {
        sessionId: this._session,
        frameIndex: this._frameIdx,
        ...cue,
        ts: now,
      }, { causedBy: frameId, sessionId: this._session, edgeType: 'semantic' });

      // Blink counter
      if (cue.cueType === 'blink') {
        this._blinkWindow.push(now);
        // Prune to 10s window
        this._blinkWindow = this._blinkWindow.filter(t => now - t < 10_000);
        const blinkHz = this._blinkWindow.length / 10;
        if (blinkHz > this._config.thresholds.blinkRateHighHz) {
          this._emit('alk.video.cue.detected', {
            sessionId: this._session,
            cueType: 'blink_rate_high',
            category: CUE_CATEGORY.OCULAR,
            intensity: Math.min(1, blinkHz / (this._config.thresholds.blinkRateHighHz * 3)),
            significance: SIGNIFICANCE.MODERATE,
            detail: { blinkHz: LM.r4(blinkHz) },
          }, { causedBy: frameId, sessionId: this._session });
        }
      }

    } else {
      const state = this._activeCues.get(key);
      state.lastTs  = now;
      state.frames++;
      state.maxIntensity = Math.max(state.maxIntensity, cue.intensity);

      // Sustained cue escalation
      if (state.frames === this._config.sustainedFrames) {
        this._emit('alk.video.cue.sustained', {
          sessionId:    this._session,
          cueType:      key,
          category:     cue.category,
          durationMs:   now - state.firstTs,
          maxIntensity: state.maxIntensity,
          frames:       state.frames,
        }, { causedBy: frameId, sessionId: this._session, edgeType: 'temporal' });
      }
    }
  }

  _checkReleasedCues(currentCues, frameId) {
    const activeTypes = new Set(currentCues.map(c => c.cueType));
    for (const [key, state] of this._activeCues) {
      if (!activeTypes.has(key)) {
        const now = Date.now();
        this._emit('alk.video.cue.released', {
          sessionId:  this._session,
          cueType:    key,
          category:   state.category,
          durationMs: now - state.firstTs,
          frames:     state.frames,
          maxIntensity: state.maxIntensity,
        }, { causedBy: frameId, sessionId: this._session, edgeType: 'temporal' });
        this._activeCues.delete(key);
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────

  _emitSummary() {
    if (!this._session) return;
    const now = Date.now();
    const window1s = this._cueHistory.filter(c => now - c.ts < 1000);
    const byCategory = {};
    const byType     = {};
    for (const c of window1s) {
      byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
      byType[c.cueType]      = (byType[c.cueType]      ?? 0) + 1;
    }
    this._emit('alk.video.analysis.summary', {
      sessionId:    this._session,
      frameIndex:   this._frameIdx,
      windowMs:     1000,
      cueCount:     window1s.length,
      byCategory,
      byType,
      activeCues:   [...this._activeCues.keys()],
    }, { sessionId: this._session });
  }

  // ── MediaPipe loader ─────────────────────────────────────────────────────────

  async _loadModels() {
    if (!this._mp) {
      this._emit('alk.video.mediapipe.loading', {
        note: 'No MediaPipe instance injected — waiting for alk.video.mediapipe.loaded event',
      });
      return;
    }

    this._emit('alk.video.mediapipe.loading', { models: this._getModelList() });

    try {
      const { FaceLandmarker, PoseLandmarker, HandLandmarker, FilesetResolver } = this._mp;

      // Resolve WASM
      const vision = await FilesetResolver.forVisionTasks(
        `${this._config.modelBaseUrl}/mediapipe-tasks-vision/wasm`
      );

      if (this._config.enableFace) {
        this._faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${this._config.modelBaseUrl}/${this._config.faceLandmarkerModel}` },
          outputFaceBlendshapes:         true,
          outputFacialTransformationMatrixes: false,
          runningMode:                   'VIDEO',
          numFaces:                      this._config.numFaces,
          minFaceDetectionConfidence:    this._config.minDetectionConf,
          minFacePresenceConfidence:     this._config.minPresenceConf,
          minTrackingConfidence:         this._config.minTrackingConf,
        });
      }

      if (this._config.enablePose) {
        this._poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${this._config.modelBaseUrl}/${this._config.poseLandmarkerModel}` },
          runningMode:     'VIDEO',
          numPoses:        1,
          minPoseDetectionConfidence: this._config.minDetectionConf,
          minPosePresenceConfidence:  this._config.minPresenceConf,
          minTrackingConfidence:      this._config.minTrackingConf,
        });
      }

      if (this._config.enableHands) {
        this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `${this._config.modelBaseUrl}/${this._config.handLandmarkerModel}` },
          runningMode:    'VIDEO',
          numHands:       this._config.numHands,
          minHandDetectionConfidence: this._config.minDetectionConf,
          minHandPresenceConfidence:  this._config.minPresenceConf,
          minTrackingConfidence:      this._config.minTrackingConf,
        });
      }

      this._modelsReady = true;
      this._emit('alk.video.mediapipe.ready', {
        face:  !!this._faceLandmarker,
        pose:  !!this._poseLandmarker,
        hands: !!this._handLandmarker,
      });

    } catch (err) {
      this._emitError('MODEL_LOAD_FAILED', err.message);
    }
  }

  _onMPLoaded(ev) {
    // External loader signaled models are ready — store refs from payload
    if (ev.payload.faceLandmarker) this._faceLandmarker = ev.payload.faceLandmarker;
    if (ev.payload.poseLandmarker) this._poseLandmarker = ev.payload.poseLandmarker;
    if (ev.payload.handLandmarker) this._handLandmarker = ev.payload.handLandmarker;
    this._modelsReady = true;
    this._emit('alk.video.mediapipe.ready', { source: 'external-loader' });
  }

  _onConfig(ev) {
    const { thresholds, targetFPS, smoothingAlpha } = ev.payload;
    if (thresholds) Object.assign(this._config.thresholds, thresholds);
    if (targetFPS)  { this._config.targetFPS = targetFPS; this._frameIntervalMs = 1000 / targetFPS; }
    if (smoothingAlpha !== undefined) {
      this._config.smoothingAlpha = smoothingAlpha;
      this._extractor._ema._alpha = smoothingAlpha;
    }
    this._emit('alk.video.configured', this._configSnapshot());
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  _mergeConfig(config) {
    const merged = { ...VIDEO_DEFAULTS, ...config };
    merged.thresholds = { ...VIDEO_DEFAULTS.thresholds, ...(config.thresholds ?? {}) };
    return merged;
  }

  _configSnapshot() {
    return {
      enableFace:  this._config.enableFace,
      enablePose:  this._config.enablePose,
      enableHands: this._config.enableHands,
      targetFPS:   this._config.targetFPS,
      numFaces:    this._config.numFaces,
      numHands:    this._config.numHands,
    };
  }

  _getModelList() {
    const list = [];
    if (this._config.enableFace)  list.push('FaceLandmarker (478pt + blendshapes)');
    if (this._config.enablePose)  list.push('PoseLandmarker lite (33pt)');
    if (this._config.enableHands) list.push('HandLandmarker (21pt × 2)');
    return list;
  }

  /** Sparse landmark sample for event payload (don't send 468 points per event) */
  _sampleLandmarks(lms, n) {
    const step = Math.floor(lms.length / n);
    const out  = [];
    for (let i = 0; i < lms.length && out.length < n; i += step) {
      out.push({ x: LM.r4(lms[i].x), y: LM.r4(lms[i].y), z: LM.r4(lms[i].z ?? 0) });
    }
    return out;
  }

  health() {
    return {
      status:      this._modelsReady ? 'OK' : 'LOADING',
      modelsReady: this._modelsReady,
      capturing:   !!this._session,
      sessionId:   this._session,
      frameIndex:  this._frameIdx,
      activeCues:  [...this._activeCues.keys()],
      metrics: {
        emitted:  this._metrics.emitted,
        received: this._metrics.received,
        errors:   this._metrics.errors,
      },
    };
  }
}

export default VideoModule;
