/**
 * @module       signal-topology
 * @uuid         c1d2e3f4-a5b6-4789-0abc-def012345678
 * @version      1.0.0
 *
 * Signal Topology — Cross-stream behavioral state integrator
 *
 * The face, body, hands, and expression streams are parallel observations
 * of one continuous thing: a person. This module watches all streams
 * simultaneously, computes cross-stream correlation scores, and emits
 * named composite behavioral states that no single stream can produce.
 *
 * ── COMPOSITE STATES ─────────────────────────────────────────────────────────
 *
 *   STRESS_ACUTE        High-freq micro + shoulder raise + gaze aversion
 *                       Signal: acute stress response, fight-or-flight edge
 *
 *   COGNITIVE_LOAD      Brow furrow sustained + gaze stable inward + jaw tension
 *                       + reduced body movement (freezing)
 *                       Signal: working memory load, problem solving
 *
 *   SOCIAL_MASK         Social smile + gaze aversion OR shoulder asymmetry
 *                       OR anger/disgust micro during smile macro
 *                       Signal: performed affect, concealed negative state
 *
 *   GENUINE_ENGAGEMENT  Duchenne joy + forward lean (scale increase) + open posture
 *                       + low micro-expression rate (no suppression)
 *                       Signal: authentic positive engagement
 *
 *   CONCEALMENT         Suppressed micro + hand-to-mouth + gaze aversion cluster
 *                       Signal: active information withholding
 *
 *   CONTEMPT_LEAK       Contempt micro or partial + social smile macro
 *                       OR unilateral smile + shoulder asymmetry
 *                       Signal: contempt being masked by social expression
 *
 *   DISSONANCE          Positive verbal + negative somatic OR
 *                       positive expression + negative body (shoulders/posture)
 *                       Signal: incongruence between channels
 *
 *   APPROACH            Forward lean + eye contact + open palm + reduced blink rate
 *                       Signal: engagement, interest, approach motivation
 *
 *   WITHDRAWAL          Backward lean + gaze aversion + shoulder raise + blink rate up
 *                       Signal: disengagement, avoidance motivation
 *
 *   FREEZE              Reduced body movement + reduced facial expression amplitude
 *                       + elevated blink suppression
 *                       Signal: threat response, vigilance
 *
 * ── INTEGRATION LOGIC ────────────────────────────────────────────────────────
 *
 *   Each composite state has:
 *     - required signals (must be active)
 *     - amplifying signals (boost score)
 *     - contradicting signals (reduce score)
 *     - temporal constraints (signals must co-occur within WINDOW frames)
 *
 *   Score = weighted(required) + 0.5*weighted(amplifying) - weighted(contradicting)
 *   Confidence thresholds: LOW 0.25, MEDIUM 0.40, HIGH 0.60, DEFINITIVE 0.80
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.video.cue.detected         — nonverbal cues (gaze, shoulder, blink, etc)
 *     alk.video.cue.released         — cue deactivated
 *     alk.expression.composite       — labelled expression with scale/confidence
 *     alk.expression.micro           — micro-expression event
 *     alk.video.landmarks.face       — EAR, gaze vectors, head position
 *     alk.video.landmarks.pose       — body pose (for movement amplitude)
 *     alk.verbal.transcript          — speech content (friction markers, sentiment)
 *
 *   Emits:
 *     alk.signal.composite           — named behavioral state
 *     alk.signal.state               — full state snapshot (all active composites)
 *     alk.signal.transition          — when dominant state changes
 *     alk.signal.pulse               — §1.8 heartbeat every 30 frames
 */

'use strict';

export const SIGTOP_UUID    = 'c1d2e3f4-a5b6-4789-0abc-def012345678';
export const SIGTOP_VERSION = '1.0.0';

// ── Confidence levels ─────────────────────────────────────────────────────────
export const CONFIDENCE = Object.freeze({
  LOW:        'LOW',        // 0.25–0.40
  MEDIUM:     'MEDIUM',     // 0.40–0.60
  HIGH:       'HIGH',       // 0.60–0.80
  DEFINITIVE: 'DEFINITIVE', // 0.80+
});

function confLabel(score) {
  if (score >= 0.80) return CONFIDENCE.DEFINITIVE;
  if (score >= 0.60) return CONFIDENCE.HIGH;
  if (score >= 0.40) return CONFIDENCE.MEDIUM;
  return CONFIDENCE.LOW;
}

// ── Signal window ─────────────────────────────────────────────────────────────
// Tracks recency of signal presence. Decays over DECAY_FRAMES.
class SignalWindow {
  constructor(decayFrames = 30) {
    this._decay = decayFrames;
    this._signals = new Map(); // name → { strength, lastFrame }
  }

  set(name, strength, frame) {
    this._signals.set(name, { strength: Math.min(1, strength), lastFrame: frame });
  }

  clear(name) { this._signals.delete(name); }

  get(name, currentFrame) {
    const s = this._signals.get(name);
    if (!s) return 0;
    const age = currentFrame - s.lastFrame;
    if (age > this._decay) { this._signals.delete(name); return 0; }
    return s.strength * (1 - age / this._decay);
  }

  has(name, currentFrame, minStrength = 0.1) {
    return this.get(name, currentFrame) >= minStrength;
  }

  all(currentFrame) {
    const out = {};
    for (const [k] of this._signals) {
      const v = this.get(k, currentFrame);
      if (v > 0) out[k] = v;
    }
    return out;
  }

  reset() { this._signals.clear(); }
}

// ── Composite state definitions ───────────────────────────────────────────────
const COMPOSITES = {

  STRESS_ACUTE: {
    required: [
      { signal: 'micro.FEAR',       weight: 1.8 },
      { signal: 'cue.shoulder_raise', weight: 1.4 },
    ],
    amplifying: [
      { signal: 'cue.gaze_aversion',    weight: 0.8 },
      { signal: 'micro.ANGER',          weight: 0.7 },
      { signal: 'cue.blink_rate_high',  weight: 0.6 },
      { signal: 'expr.FEAR',            weight: 0.9 },
      { signal: 'cue.head_shake',       weight: 0.5 },
      { signal: 'pose.freeze',          weight: 0.7 },
    ],
    contradicting: [
      { signal: 'expr.JOY_GENUINE',     weight: 1.2 },
      { signal: 'expr.JOY_SOCIAL',      weight: 0.5 },
    ],
    description: 'Acute stress response — fight-or-flight edge',
    fieldEffect: { entropy: +0.35, structure: -0.22, stressTarget: 'forehead', stressStr: 500 },
  },

  COGNITIVE_LOAD: {
    required: [
      { signal: 'cue.brow_furrow',    weight: 1.6 },
      { signal: 'pose.stillness',     weight: 1.2 },
    ],
    amplifying: [
      { signal: 'expr.ANGER',         weight: 0.6 }, // brow down is AU4
      { signal: 'cue.gaze_stable',    weight: 0.8 },
      { signal: 'cue.mouth_tighten',  weight: 0.7 },
      { signal: 'face.jaw_tension',   weight: 0.6 },
      { signal: 'cue.head_nod',       weight: 0.4 },
      { signal: 'micro.ANGER',        weight: 0.5 }, // suppressed frustration
    ],
    contradicting: [
      { signal: 'cue.head_shake',     weight: 0.8 },
      { signal: 'cue.shoulder_raise', weight: 0.6 },
      { signal: 'expr.SURPRISE',      weight: 0.9 },
    ],
    description: 'Working memory load — focused problem solving',
    fieldEffect: { entropy: -0.05, structure: +0.08, curl: -0.10 },
  },

  SOCIAL_MASK: {
    required: [
      { signal: 'expr.JOY_SOCIAL',    weight: 1.6 }, // social smile (no Duchenne)
    ],
    amplifying: [
      { signal: 'cue.gaze_aversion',  weight: 1.0 }, // looking away while smiling
      { signal: 'micro.DISGUST',      weight: 1.4 }, // micro leak under smile
      { signal: 'micro.ANGER',        weight: 1.2 }, // anger micro under smile
      { signal: 'micro.CONTEMPT',     weight: 1.5 }, // contempt micro — strongest signal
      { signal: 'cue.shoulder_asymmetry', weight: 0.7 },
      { signal: 'micro.FEAR',         weight: 0.8 },
      { signal: 'micro.SADNESS',      weight: 0.9 },
    ],
    contradicting: [
      { signal: 'expr.JOY_GENUINE',   weight: 2.0 }, // Duchenne = genuine, not masked
      { signal: 'cue.eye_contact',    weight: 0.6 },
    ],
    description: 'Performed affect — genuine state concealed beneath social expression',
    fieldEffect: { entropy: +0.15, structure: -0.10, curl: +0.08 },
  },

  GENUINE_ENGAGEMENT: {
    required: [
      { signal: 'expr.JOY_GENUINE',   weight: 2.0 }, // Duchenne mandatory
      { signal: 'face.forward_lean',  weight: 1.0 },
    ],
    amplifying: [
      { signal: 'cue.eye_contact',    weight: 0.9 },
      { signal: 'pose.open',          weight: 0.8 },
      { signal: 'face.low_micro_rate',weight: 0.7 }, // calm, no suppression
      { signal: 'cue.head_nod',       weight: 0.6 },
    ],
    contradicting: [
      { signal: 'cue.gaze_aversion',  weight: 1.0 },
      { signal: 'cue.shoulder_raise', weight: 0.8 },
      { signal: 'micro.DISGUST',      weight: 1.5 },
      { signal: 'micro.CONTEMPT',     weight: 1.8 },
      { signal: 'expr.SOCIAL_MASK',   weight: 1.0 },
    ],
    description: 'Authentic positive engagement — Duchenne confirmed',
    fieldEffect: { entropy: -0.12, structure: +0.18, curl: +0.15 },
  },

  CONCEALMENT: {
    required: [
      { signal: 'micro.any_suppressed', weight: 1.6 }, // any suppressed micro
      { signal: 'cue.gaze_aversion',    weight: 1.2 },
    ],
    amplifying: [
      { signal: 'cue.hand_to_mouth',    weight: 1.4 }, // classic concealment gesture
      { signal: 'cue.self_touch_face',  weight: 0.9 },
      { signal: 'micro.DISGUST',        weight: 0.8 },
      { signal: 'micro.FEAR',           weight: 0.8 },
      { signal: 'friction.high',        weight: 1.0 }, // disfluency in speech
      { signal: 'pose.stillness',       weight: 0.6 },
    ],
    contradicting: [
      { signal: 'expr.JOY_GENUINE',     weight: 1.2 },
      { signal: 'pose.open',            weight: 0.7 },
    ],
    description: 'Active information withholding — multi-channel suppression',
    fieldEffect: { entropy: +0.20, structure: -0.15, stressTarget: 'mouth', stressStr: 350 },
  },

  CONTEMPT_LEAK: {
    required: [
      { signal: 'micro.CONTEMPT',     weight: 2.0 },
    ],
    amplifying: [
      { signal: 'expr.JOY_SOCIAL',    weight: 1.2 }, // contempt under social smile
      { signal: 'cue.shoulder_asymmetry', weight: 0.8 },
      { signal: 'micro.DISGUST',      weight: 0.7 },
      { signal: 'expr.CONTEMPT',      weight: 1.5 }, // partial contempt
    ],
    contradicting: [
      { signal: 'expr.JOY_GENUINE',   weight: 1.8 },
      { signal: 'cue.eye_contact',    weight: 0.5 },
    ],
    description: 'Contempt leaking through social mask',
    fieldEffect: { entropy: +0.18, structure: -0.12, stressTarget: 'mouthR', stressStr: 320 },
  },

  DISSONANCE: {
    required: [
      { signal: 'friction.high',          weight: 1.4 }, // speech friction
    ],
    amplifying: [
      { signal: 'micro.any_suppressed',   weight: 1.0 },
      { signal: 'cue.shoulder_raise',     weight: 0.8 },
      { signal: 'cue.gaze_aversion',      weight: 0.7 },
      // Positive expression + negative body = dissonance
      { signal: 'expr.JOY_SOCIAL',        weight: 0.6 },
      { signal: 'cue.shoulder_asymmetry', weight: 0.7 },
      { signal: 'micro.SADNESS',          weight: 0.9 },
    ],
    contradicting: [
      { signal: 'expr.JOY_GENUINE',       weight: 1.2 },
      { signal: 'pose.stillness',         weight: 0.4 }, // stillness is sometimes just focus
    ],
    description: 'Cross-channel incongruence — signals contradict each other',
    fieldEffect: { entropy: +0.22, curl: +0.15, structure: -0.08 },
  },

  APPROACH: {
    required: [
      { signal: 'face.forward_lean',  weight: 1.4 },
      { signal: 'cue.eye_contact',    weight: 1.2 },
    ],
    amplifying: [
      { signal: 'cue.open_palm',      weight: 0.8 },
      { signal: 'expr.JOY_GENUINE',   weight: 0.9 },
      { signal: 'expr.JOY_SOCIAL',    weight: 0.5 },
      { signal: 'cue.head_nod',       weight: 0.7 },
      { signal: 'pose.open',          weight: 0.8 },
    ],
    contradicting: [
      { signal: 'cue.gaze_aversion',  weight: 1.4 },
      { signal: 'cue.shoulder_raise', weight: 0.8 },
      { signal: 'micro.FEAR',         weight: 0.9 },
      { signal: 'micro.DISGUST',      weight: 1.0 },
    ],
    description: 'Approach motivation — engagement and interest',
    fieldEffect: { structure: +0.15, entropy: -0.08, curl: +0.10 },
  },

  WITHDRAWAL: {
    required: [
      { signal: 'cue.gaze_aversion',  weight: 1.6 },
    ],
    amplifying: [
      { signal: 'face.backward_lean', weight: 1.2 },
      { signal: 'cue.shoulder_raise', weight: 0.9 },
      { signal: 'cue.blink_rate_high',weight: 0.7 },
      { signal: 'micro.FEAR',         weight: 0.8 },
      { signal: 'micro.DISGUST',      weight: 0.7 },
      { signal: 'cue.self_touch_face',weight: 0.6 },
    ],
    contradicting: [
      { signal: 'face.forward_lean',  weight: 1.4 },
      { signal: 'cue.eye_contact',    weight: 1.2 },
      { signal: 'expr.JOY_GENUINE',   weight: 1.0 },
    ],
    description: 'Withdrawal motivation — disengagement and avoidance',
    fieldEffect: { entropy: +0.15, structure: -0.12, curl: -0.08 },
  },

  FREEZE: {
    required: [
      { signal: 'pose.stillness',       weight: 1.8 },
      { signal: 'face.expression_flat', weight: 1.4 },
    ],
    amplifying: [
      { signal: 'micro.FEAR',           weight: 1.0 },
      { signal: 'cue.blink_suppress',   weight: 0.9 }, // reduced blink = vigilance
      { signal: 'cue.gaze_stable',      weight: 0.7 },
      { signal: 'micro.any_suppressed', weight: 0.8 },
    ],
    contradicting: [
      { signal: 'expr.JOY_GENUINE',     weight: 1.0 },
      { signal: 'pose.open',            weight: 0.8 },
      { signal: 'cue.head_nod',         weight: 0.7 },
    ],
    description: 'Freeze response — vigilance, threat detection',
    fieldEffect: { entropy: +0.10, structure: +0.12, curl: -0.15 },
  },

};

// ── Topology Engine ────────────────────────────────────────────────────────────
export class SignalTopology {
  /**
   * @param {object} opts
   * @param {object} opts.bus    — { on(event,cb), emit(event,data) }
   * @param {number} [opts.decayFrames=45] — signal decay window
   * @param {number} [opts.emitThreshold=0.25] — min score to emit composite
   */
  constructor({ bus, decayFrames = 45, emitThreshold = 0.25 } = {}) {
    this._bus       = bus;
    this._threshold = emitThreshold;
    this._frame     = 0;

    // Signal window — all active signals with recency-weighted strength
    this._sw = new SignalWindow(decayFrames);

    // Per-composite state tracking
    this._compositeState = new Map(); // label → { score, startFrame, dominant }
    this._dominant = null;

    // Micro-expression rate tracking (rolling 60 frames)
    this._microCount  = 0;
    this._microWindow = 0; // frames since last reset
    this._microRate   = 0; // per-frame rate

    // Pose movement amplitude (rolling 15 frames)
    this._poseHistory = [];
    this._lastPoseLMs = null;
    this._poseAmplitude = 0;

    // Face scale tracking (normalized z proxy for forward/backward lean)
    this._lastFaceScale = null;

    // Session stats
    this.stats = {
      compositesEmitted: 0,
      transitionsTotal: 0,
      byLabel: {},
    };

    if (bus) this._bindBus();
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;
    b.on('alk.video.cue.detected',    ev => this._onCue(ev, true));
    b.on('alk.video.cue.released',    ev => this._onCue(ev, false));
    b.on('alk.expression.composite',  ev => this._onExpression(ev));
    b.on('alk.expression.micro',      ev => this._onMicro(ev));
    b.on('alk.video.landmarks.face',  ev => this._onFaceLM(ev));
    b.on('alk.video.landmarks.pose',  ev => this._onPoseLM(ev));
    b.on('alk.verbal.transcript',     ev => this._onTranscript(ev));
    b.on('alk.video.frame.analyzed',  ev => this._onFrame(ev));
  }

  _onCue(ev, active) {
    const p = ev.payload ?? ev;
    const key = `cue.${p.cueType}`;
    if (active) this._sw.set(key, p.intensity ?? 0.5, this._frame);
    else        this._sw.clear(key);
    // Eye contact proxy: if no gaze_aversion → eye_contact
    if (!active && p.cueType === 'gaze_aversion') {
      this._sw.set('cue.eye_contact', 0.6, this._frame);
    }
    if (active && p.cueType === 'gaze_aversion') {
      this._sw.clear('cue.eye_contact');
    }
  }

  _onExpression(ev) {
    const p = ev.payload ?? ev;
    if (!p.label) return;
    const key = `expr.${p.label}`;
    this._sw.set(key, p.confidence ?? 0.5, this._frame);

    // Duchenne → genuine engagement signal
    if (p.duchenne && p.label.startsWith('JOY')) {
      this._sw.set('face.duchenne', 1.0, this._frame);
    }
    // Expression flatness proxy
    if (p.confidence < 0.15 && p.scale === 'MACRO') {
      this._sw.set('face.expression_flat', 0.6, this._frame);
    }
  }

  _onMicro(ev) {
    const p = ev.payload ?? ev;
    if (!p.label) return;

    // Per-label micro signal
    this._sw.set(`micro.${p.label}`, p.suppressionConfidence ?? 0.5, this._frame);

    // Generic suppressed-micro signal (any label)
    const supConf = p.suppressionConfidence ?? 0;
    if (supConf > 0.3) {
      this._sw.set('micro.any_suppressed', supConf, this._frame);
    }

    // Micro rate tracking
    this._microCount++;
    this._microWindow++;
    if (this._microWindow >= 60) {
      this._microRate = this._microCount / 60;
      this._microCount = 0;
      this._microWindow = 0;
      if (this._microRate > 0.08) { // > 5 micros per 60 frames = high rate
        this._sw.set('micro.high_rate', this._microRate, this._frame);
      } else {
        this._sw.set('face.low_micro_rate', 1 - this._microRate * 10, this._frame);
      }
    }
  }

  _onFaceLM(ev) {
    const p = ev.payload ?? ev;

    // EAR proxy for blink rate
    const earL = p.leftEAR  ?? 1;
    const earR = p.rightEAR ?? 1;
    const avgEAR = (earL + earR) / 2;

    // Blink suppression (very high EAR = eyes open wide = vigilance/freeze)
    if (avgEAR > 0.35) this._sw.set('cue.blink_suppress', (avgEAR - 0.35) * 3, this._frame);

    // Gaze stability: if gaze barely moves for 30+ frames → 'gaze_stable'
    const gl = p.leftGaze  ?? null;
    const gr = p.rightGaze ?? null;
    if (gl && gr) {
      const gazeAmp = Math.sqrt(gl.x**2 + gl.y**2) + Math.sqrt(gr.x**2 + gr.y**2);
      if (gazeAmp < 0.08) this._sw.set('cue.gaze_stable', 1 - gazeAmp * 10, this._frame);
    }

    // Forward/backward lean via face scale (face gets bigger as person leans in)
    const lms = p.rawLandmarks;
    if (lms && lms.length >= 152) {
      // Face height in normalized coords: forehead(10) to chin(152)
      const fore = lms[10], chin = lms[152];
      if (fore && chin) {
        const faceH = Math.abs(fore.y - chin.y);
        if (this._lastFaceScale === null) {
          this._lastFaceScale = faceH;
        } else {
          const scaleDelta = faceH - this._lastFaceScale;
          this._lastFaceScale = this._lastFaceScale * 0.95 + faceH * 0.05; // EMA
          if (scaleDelta > 0.004)  this._sw.set('face.forward_lean',  Math.min(1, scaleDelta * 100), this._frame);
          if (scaleDelta < -0.004) this._sw.set('face.backward_lean', Math.min(1, -scaleDelta * 100), this._frame);
        }

        // Jaw tension: small face height ratio → compressed jaw
        const jawTension = Math.max(0, 0.12 - faceH) * 20;
        if (jawTension > 0.1) this._sw.set('face.jaw_tension', jawTension, this._frame);
      }
    }
  }

  _onPoseLM(ev) {
    const p  = ev.payload ?? ev;
    const lms = p.rawLandmarks;
    if (!lms || lms.length < 17) return;

    // Pose movement amplitude: compare shoulder/wrist positions to last frame
    if (this._lastPoseLMs) {
      let totalDelta = 0;
      const keyPts = [11, 12, 13, 14, 15, 16]; // shoulders, elbows, wrists
      for (const idx of keyPts) {
        const a = lms[idx], b = this._lastPoseLMs[idx];
        if (a && b) {
          totalDelta += Math.sqrt((a.x-b.x)**2 + (a.y-b.y)**2);
        }
      }
      const amplitude = totalDelta / keyPts.length;
      this._poseHistory.push(amplitude);
      if (this._poseHistory.length > 15) this._poseHistory.shift();

      const avgAmp = this._poseHistory.reduce((a,b)=>a+b,0) / this._poseHistory.length;
      this._poseAmplitude = avgAmp;

      if (avgAmp < 0.003)     this._sw.set('pose.stillness', 1 - avgAmp * 200, this._frame);
      else                    this._sw.clear('pose.stillness');

      if (avgAmp > 0.015)     this._sw.set('pose.movement',  Math.min(1, avgAmp * 40), this._frame);
      else                    this._sw.clear('pose.movement');

      // Open posture: shoulders level, wrists below shoulders (not crossed)
      const ls = lms[11], rs = lms[12], lw = lms[15], rw = lms[16];
      if (ls && rs && lw && rw) {
        const shoulderLevel = 1 - Math.abs(ls.y - rs.y) * 20;
        const wristsLow = (lw.y > ls.y && rw.y > rs.y) ? 1.0 : 0.4;
        if (shoulderLevel > 0.6 && wristsLow > 0.6) {
          this._sw.set('pose.open', (shoulderLevel + wristsLow) / 2, this._frame);
        }
      }
    }

    this._lastPoseLMs = lms;
  }

  _onTranscript(ev) {
    const p = ev.payload ?? ev;
    if (p.friction) {
      const frictionScore = Math.min(1, (p.frictionMarkers?.length ?? 1) * 0.3);
      this._sw.set('friction.high', frictionScore, this._frame);
    }
  }

  _onFrame(ev) {
    const p = ev.payload ?? ev;
    this._frame = p.frameIndex ?? this._frame + 1;
    this._compute();

    // §1.8 pulse
    if (this._frame % 30 === 0) {
      this._emit('alk.signal.pulse', {
        frameIndex: this._frame,
        dominant: this._dominant,
        activeSignals: Object.keys(this._sw.all(this._frame)).length,
        microRate: this._microRate,
        poseAmplitude: this._poseAmplitude,
      });
    }
  }

  // ── Core computation ──────────────────────────────────────────────────────

  _compute() {
    const results = [];

    for (const [label, pattern] of Object.entries(COMPOSITES)) {
      let score = 0;
      let maxPossible = 0;

      for (const req of pattern.required) {
        const s = this._sw.get(req.signal, this._frame);
        score += s * req.weight;
        maxPossible += req.weight;
      }

      // Only proceed if required signals are meaningfully present
      const requiredCoverage = score / maxPossible;
      if (requiredCoverage < 0.15) {
        if (this._compositeState.has(label)) {
          this._compositeState.delete(label);
        }
        continue;
      }

      for (const amp of (pattern.amplifying ?? [])) {
        const s = this._sw.get(amp.signal, this._frame);
        score += s * amp.weight * 0.5;
        maxPossible += amp.weight * 0.5;
      }
      for (const contra of (pattern.contradicting ?? [])) {
        const s = this._sw.get(contra.signal, this._frame);
        score -= s * contra.weight;
      }

      const normScore = maxPossible > 0 ? Math.max(0, score / maxPossible) : 0;

      if (normScore < this._threshold) {
        this._compositeState.delete(label);
        continue;
      }

      // Emit on new detection or significant score change
      let durFrames = 1;
      const prev = this._compositeState.get(label);
      if (prev) {
        durFrames = this._frame - prev.startFrame + 1;
      }

      this._compositeState.set(label, {
        score: normScore,
        startFrame: prev?.startFrame ?? this._frame,
        durFrames,
      });

      const shouldEmit = !prev ||
        Math.abs(normScore - prev.score) > 0.08 ||
        durFrames === 1 ||
        durFrames % 30 === 0;

      if (shouldEmit) {
        const activeSignals = {};
        for (const req of pattern.required) {
          const s = this._sw.get(req.signal, this._frame);
          if (s > 0) activeSignals[req.signal] = parseFloat(s.toFixed(3));
        }
        for (const amp of (pattern.amplifying ?? [])) {
          const s = this._sw.get(amp.signal, this._frame);
          if (s > 0.1) activeSignals[amp.signal] = parseFloat(s.toFixed(3));
        }

        results.push({
          label,
          score:       parseFloat(normScore.toFixed(3)),
          confidence:  confLabel(normScore),
          durFrames,
          description: pattern.description,
          activeSignals,
          fieldEffect: pattern.fieldEffect ?? {},
          frameIndex:  this._frame,
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    // Emit composites
    for (const r of results) {
      this.stats.compositesEmitted++;
      this.stats.byLabel[r.label] = (this.stats.byLabel[r.label] ?? 0) + 1;
      this._emit('alk.signal.composite', r);
    }

    // Dominant state transition
    const newDominant = results[0]?.label ?? null;
    if (newDominant !== this._dominant) {
      const prev = this._dominant;
      this._dominant = newDominant;
      this.stats.transitionsTotal++;
      this._emit('alk.signal.transition', {
        from:       prev,
        to:         newDominant,
        score:      results[0]?.score ?? 0,
        confidence: results[0]?.confidence ?? null,
        frameIndex: this._frame,
      });
    }

    // State snapshot every 15 frames
    if (this._frame % 15 === 0) {
      const allActive = {};
      for (const [k, v] of this._compositeState) allActive[k] = v.score;
      this._emit('alk.signal.state', {
        frameIndex:  this._frame,
        dominant:    this._dominant,
        active:      allActive,
        signals:     this._sw.all(this._frame),
        microRate:   this._microRate,
        poseAmplitude: this._poseAmplitude,
      });
    }
  }

  // ── Direct ingest API (for direct use without bus) ──────────────────────────

  ingestCue(cueType, intensity, active = true) {
    if (active) this._sw.set(`cue.${cueType}`, intensity, this._frame);
    else        this._sw.clear(`cue.${cueType}`);
  }

  ingestExpression(label, confidence, scale, duchenne = false) {
    this._sw.set(`expr.${label}`, confidence, this._frame);
    if (duchenne) this._sw.set('face.duchenne', 1.0, this._frame);
  }

  ingestMicro(label, suppressionConf) {
    this._sw.set(`micro.${label}`, suppressionConf, this._frame);
    if (suppressionConf > 0.3) this._sw.set('micro.any_suppressed', suppressionConf, this._frame);
  }

  tick(frameIndex) {
    this._frame = frameIndex;
    this._compute();
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  get dominant() { return this._dominant; }

  getActiveComposites() {
    const out = [];
    for (const [k, v] of this._compositeState) {
      out.push({ label: k, score: v.score, durFrames: v.durFrames });
    }
    return out.sort((a,b) => b.score - a.score);
  }

  getSignals() { return this._sw.all(this._frame); }

  reset() {
    this._sw.reset();
    this._compositeState.clear();
    this._dominant = null;
    this._microCount = 0;
    this._microWindow = 0;
    this._microRate = 0;
    this._poseHistory = [];
    this._lastPoseLMs = null;
    this._lastFaceScale = null;
    this._poseAmplitude = 0;
  }

  _emit(event, data) {
    try { this._bus?.emit(event, data); } catch (_) {}
  }

  health() {
    return {
      status:    'OK',
      uuid:      SIGTOP_UUID,
      version:   SIGTOP_VERSION,
      frame:     this._frame,
      dominant:  this._dominant,
      signals:   Object.keys(this._sw.all(this._frame)).length,
      composites: this._compositeState.size,
      microRate:  this._microRate,
      poseAmp:    this._poseAmplitude,
      stats:      { ...this.stats },
    };
  }
}

export { COMPOSITES, SignalWindow };
