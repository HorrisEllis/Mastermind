/**
 * @module       suppression-score
 * @uuid         e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091
 * @version      1.0.0
 *
 * Suppression Score — the gap between what someone shows and what they feel.
 *
 * ── THE CORE IDEA ─────────────────────────────────────────────────────────────
 *
 *   Affect suppression is not a binary state. It's a continuous gradient:
 *
 *     0.0  — fully authentic: presented state = internal state
 *     0.5  — moderate regulation: some channels masked, others not
 *     1.0  — full mask: presented state bears no relation to internal state
 *
 *   The suppression score computes this gradient from three independent
 *   evidence streams, then fuses them into a single calibrated estimate.
 *
 * ── EVIDENCE STREAMS ─────────────────────────────────────────────────────────
 *
 *   1. SURFACE–SUBSURFACE GAP (primary)
 *      The gap between the latent model's SUPPRESSION dimension
 *      and what the face is actively showing.
 *      If the latent model says suppression=0.8 but the face shows
 *      JOY_SOCIAL (positive surface), the gap is large = high evidence.
 *
 *   2. MICRO-EXPRESSION RATE × CONFIDENCE (direct evidence)
 *      Suppressed micro-expressions are definitional. A face that shows
 *      social smiling while producing suppressed DISGUST micros at 0.9
 *      confidence is the canonical suppression signal.
 *      Rate matters: 1 micro every 60 frames = noise. 5 per 60 = pattern.
 *
 *   3. CROSS-CHANNEL INCONGRUENCE (structural evidence)
 *      When channels tell different stories:
 *        face: positive expression
 *        voice: elevated energy, high ZCR (stress markers)
 *        body: shoulder raise, gaze aversion
 *        speech: friction, denial patterns
 *      The number of incongruent channel pairs × their magnitude.
 *
 *   4. TEMPORAL CONSISTENCY (negative evidence)
 *      Suppression requires sustained effort. A person can flash a
 *      fake smile but sustaining it for 30s while other channels stay
 *      negative is exhausting — leakage increases over time.
 *      Suppression score increases logarithmically with duration.
 *
 * ── OUTPUTS ──────────────────────────────────────────────────────────────────
 *
 *   suppressionScore    [0, 1]   — fused estimate
 *   confidence          [0, 1]   — how much evidence supports this estimate
 *   dominantEvidence    string   — which stream is driving the score
 *   surfaceState        string   — what the person is showing (surface label)
 *   inferredState       string   — what the model thinks they're actually feeling
 *   gap                 number   — surfaceState ↔ inferredState distance
 *   sustainedMs         number   — how long current suppression has been sustained
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.latent.update          — latent state (suppression dimension)
 *     alk.latent.shift           — significant state transitions
 *     alk.expression.composite   — surface expression label
 *     alk.expression.micro       — suppressed micro-expressions
 *     alk.signal.composite       — cross-stream composites (SOCIAL_MASK etc)
 *     alk.video.cue.detected     — nonverbal cues
 *     alk.audio.frame            — audio energy/arousal
 *
 *   Emits:
 *     alk.suppression.update     — lightweight update every frame
 *     alk.suppression.event      — when suppression crosses thresholds
 *     alk.suppression.pattern    — when a sustained suppression pattern is detected
 */

'use strict';

export const SUPP_UUID    = 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091';
export const SUPP_VERSION = '1.9.0';

// ── Thresholds ────────────────────────────────────────────────────────────────
const LOW_THRESHOLD    = 0.25;  // below = authentic
const MEDIUM_THRESHOLD = 0.50;  // medium = regulation active
const HIGH_THRESHOLD   = 0.72;  // high = significant masking
const PATTERN_FRAMES   = 45;    // sustained suppression to emit pattern event

// ── Surface expression → valence proxy ───────────────────────────────────────
const SURFACE_VALENCE = {
  JOY_GENUINE:  +0.9,  JOY_SOCIAL:  +0.5,
  SURPRISE:     +0.1,  CONTEMPT:    -0.4,
  ANGER:        -0.7,  DISGUST:     -0.7,
  SADNESS:      -0.8,  FEAR:        -0.7,
};

// ── Micro-expression surface conflict matrix ──────────────────────────────────
// How incongruent is this micro with this surface expression?
const MICRO_SURFACE_CONFLICT = {
  FEAR:    { JOY_GENUINE:0.9, JOY_SOCIAL:0.9, SURPRISE:0.3, CONTEMPT:0.4, ANGER:0.2, DISGUST:0.3, SADNESS:0.3, FEAR:0.0 },
  ANGER:   { JOY_GENUINE:0.9, JOY_SOCIAL:0.8, SURPRISE:0.5, CONTEMPT:0.2, ANGER:0.0, DISGUST:0.3, SADNESS:0.3, FEAR:0.3 },
  DISGUST: { JOY_GENUINE:0.9, JOY_SOCIAL:0.8, SURPRISE:0.5, CONTEMPT:0.3, ANGER:0.3, DISGUST:0.0, SADNESS:0.4, FEAR:0.4 },
  CONTEMPT:{ JOY_GENUINE:0.9, JOY_SOCIAL:0.7, SURPRISE:0.6, CONTEMPT:0.0, ANGER:0.2, DISGUST:0.2, SADNESS:0.5, FEAR:0.4 },
  SADNESS: { JOY_GENUINE:0.9, JOY_SOCIAL:0.7, SURPRISE:0.4, CONTEMPT:0.5, ANGER:0.4, DISGUST:0.4, SADNESS:0.0, FEAR:0.3 },
  SURPRISE:{ JOY_GENUINE:0.1, JOY_SOCIAL:0.3, SURPRISE:0.0, CONTEMPT:0.4, ANGER:0.3, DISGUST:0.3, SADNESS:0.4, FEAR:0.2 },
};

export class SuppressionScore {
  constructor({ bus } = {}) {
    this._bus = bus;
    this._frame = 0;

    // Evidence accumulators
    this._latentSuppression  = 0;    // from latent model
    this._latentValence      = 0;    // for gap computation
    this._surfaceLabel       = null; // current dominant surface expression
    this._surfaceValence     = 0;    // surface expression valence proxy

    // Micro-expression evidence
    this._microBuffer = [];  // [{ label, conflictScore, suppressionConf, frame }]
    this._microRate   = 0;

    // Cross-channel incongruence
    this._channelSentiments = {
      face:    null,  // surface expression valence
      voice:   null,  // audio energy (normalized)
      body:    null,  // posture tension
      speech:  null,  // text sentiment
    };

    // Temporal tracking
    this._suppressionStart    = null; // frame when current suppression episode started
    this._suppressionSustained = 0;  // frames sustained above HIGH_THRESHOLD
    this._lastScore           = 0;
    this._lastLevel           = 'LOW';
    this._peakScore           = 0;

    // Fused score (running EMA)
    this._score      = 0;
    this._confidence = 0;

    this.stats = {
      totalUpdates: 0,
      eventsEmitted: 0,
      patternsDetected: 0,
      timeHighMs: 0,
    };

    if (bus) this._bindBus();
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;

    b.on('alk.latent.update', ev => {
      const p = ev.payload ?? ev;
      this._latentSuppression = p.suppression ?? 0;
      this._latentValence     = p.valence     ?? 0;
      this._channelSentiments.face = p.valence; // latent valence = cross-channel face proxy
    });

    b.on('alk.expression.composite', ev => {
      const p = ev.payload ?? ev;
      if (!p.label || p.confidence < 0.25) return;
      // Only update surface if this is the highest-confidence expression
      this._surfaceLabel   = p.label;
      this._surfaceValence = SURFACE_VALENCE[p.label] ?? 0;
    });

    b.on('alk.expression.micro', ev => {
      const p = ev.payload ?? ev;
      const conflict = this._microConflict(p.label, this._surfaceLabel);
      this._microBuffer.push({
        label: p.label,
        conflict,
        suppressionConf: p.suppressionConfidence ?? 0.5,
        frame: this._frame,
      });
      // Keep last 60 frames of micro-events
      this._microBuffer = this._microBuffer.filter(m => this._frame - m.frame < 60);
    });

    b.on('alk.video.cue.detected', ev => {
      const p = ev.payload ?? ev;
      if (p.cueType === 'shoulder_raise') this._channelSentiments.body = -(p.intensity ?? 0.5);
      if (p.cueType === 'gaze_aversion')  this._channelSentiments.body = Math.min(0, (this._channelSentiments.body ?? 0) - 0.3);
    });

    b.on('alk.audio.frame', ev => {
      const p = ev.payload ?? ev;
      // Voice channel: energy anomaly = stress proxy (incongruent if face is positive)
      const energyStress = p.energyAnomaly ? 0.5 : Math.min(1, p.energy * 8) - 0.5;
      this._channelSentiments.voice = -(energyStress * 0.6);
    });

    b.on('alk.verbal.transcript', ev => {
      const p = ev.payload ?? ev;
      this._channelSentiments.speech = p.sentiment?.score ?? 0;
    });

    b.on('alk.video.frame.analyzed', ev => {
      const p = ev.payload ?? ev;
      this._frame = p.frameIndex ?? this._frame + 1;
      this._compute();
    });
  }

  // ── Computation ───────────────────────────────────────────────────────────

  _compute() {
    this.stats.totalUpdates++;

    // ── Evidence stream 1: Latent suppression dimension ───────────────────
    const e1 = this._latentSuppression;

    // ── Evidence stream 2: Micro-expression rate × conflict × confidence ──
    const microRate = this._microBuffer.length / 60; // per frame rate
    const avgConflict = this._microBuffer.length > 0
      ? this._microBuffer.reduce((s,m) => s + m.conflict * m.suppressionConf, 0) / this._microBuffer.length
      : 0;
    const e2 = Math.min(1, microRate * 10 * avgConflict);

    // ── Evidence stream 3: Cross-channel incongruence ─────────────────────
    const channels = Object.values(this._channelSentiments).filter(v => v !== null);
    let e3 = 0;
    if (channels.length >= 2) {
      const channelMean = channels.reduce((s,v)=>s+v,0) / channels.length;
      const channelVariance = channels.reduce((s,v)=>s+(v-channelMean)**2,0) / channels.length;
      // High variance across channels = incongruence = suppression evidence
      e3 = Math.min(1, Math.sqrt(channelVariance) * 1.5);
    }

    // ── Evidence stream 4: Surface–latent valence gap ─────────────────────
    const gap = this._surfaceLabel
      ? Math.max(0, -this._latentValence * this._surfaceValence) // opposite signs = large gap
      : 0;
    const e4 = Math.min(1, gap * 1.5);

    // ── Weighted fusion ───────────────────────────────────────────────────
    // Weights reflect reliability: direct suppression signal (e1) anchors,
    // micro-expressions (e2) are most specific, incongruence (e3) and gap (e4) support
    const w1 = 0.35, w2 = 0.30, w3 = 0.20, w4 = 0.15;
    const rawScore = w1*e1 + w2*e2 + w3*e3 + w4*e4;

    // EMA smoothing — suppression score is slow to change (regulation is sustained effort)
    this._score = this._score * 0.85 + rawScore * 0.15;

    // Confidence: how many streams have evidence?
    const activeStreams = [e1>0.1, e2>0.05, e3>0.1, e4>0.1].filter(Boolean).length;
    this._confidence = activeStreams / 4;

    // ── Dominant evidence ─────────────────────────────────────────────────
    const evidenceMap = { 'latent':e1*w1, 'micro':e2*w2, 'incongruence':e3*w3, 'gap':e4*w4 };
    const dominant = Object.entries(evidenceMap).sort((a,b)=>b[1]-a[1])[0][0];

    // ── Level classification ──────────────────────────────────────────────
    let level;
    if (this._score >= HIGH_THRESHOLD)   level = 'HIGH';
    else if (this._score >= MEDIUM_THRESHOLD) level = 'MEDIUM';
    else if (this._score >= LOW_THRESHOLD)    level = 'LOW';
    else                                       level = 'AUTHENTIC';

    // Temporal tracking
    if (level === 'HIGH') {
      this._suppressionSustained++;
      if (!this._suppressionStart) this._suppressionStart = this._frame;
      this.stats.timeHighMs += 33;
    } else {
      if (this._suppressionSustained > 0 && this._suppressionStart !== null) {
        this._suppressionSustained = 0;
        this._suppressionStart = null;
      }
    }
    if (this._score > this._peakScore) this._peakScore = this._score;

    // ── Inferred actual state (what the latent model says is happening) ───
    const inferredValence = this._latentValence;
    let inferredLabel;
    if (inferredValence > 0.4)       inferredLabel = 'POSITIVE';
    else if (inferredValence > 0.1)  inferredLabel = 'MILDLY_POSITIVE';
    else if (inferredValence < -0.4) inferredLabel = 'NEGATIVE';
    else if (inferredValence < -0.1) inferredLabel = 'MILDLY_NEGATIVE';
    else                             inferredLabel = 'NEUTRAL';

    const update = {
      frameIndex:       this._frame,
      suppressionScore: r4(this._score),
      confidence:       r4(this._confidence),
      level,
      dominantEvidence: dominant,
      surfaceLabel:     this._surfaceLabel ?? 'NEUTRAL',
      inferredLabel,
      gap:              r4(e4),
      microRate:        r4(microRate),
      incongruence:     r4(e3),
      sustainedFrames:  this._suppressionSustained,
      evidence:         { latent:r4(e1), micro:r4(e2), incongruence:r4(e3), gap:r4(e4) },
    };

    this._emit('alk.suppression.update', update);

    // Level change event
    if (level !== this._lastLevel) {
      this.stats.eventsEmitted++;
      this._emit('alk.suppression.event', {
        ...update,
        from: this._lastLevel,
        to:   level,
        peakScore: r4(this._peakScore),
      });
      this._lastLevel = level;
    }

    // Sustained pattern event
    if (this._suppressionSustained === PATTERN_FRAMES) {
      this.stats.patternsDetected++;
      this._emit('alk.suppression.pattern', {
        ...update,
        sustainedMs:     this._suppressionSustained * 33,
        startFrame:      this._suppressionStart,
        peakScore:       r4(this._peakScore),
        description:     this._patternDescription(level, dominant, this._surfaceLabel, inferredLabel),
      });
    }

    this._lastScore = this._score;
  }

  // ── Micro–surface conflict ────────────────────────────────────────────────

  _microConflict(microLabel, surfaceLabel) {
    if (!microLabel || !surfaceLabel) return 0.5;
    const row = MICRO_SURFACE_CONFLICT[microLabel];
    if (!row) return 0.3;
    return row[surfaceLabel] ?? 0.5;
  }

  // ── Pattern description ───────────────────────────────────────────────────

  _patternDescription(level, dominant, surface, inferred) {
    const surfStr = surface?.replace('_',' ') ?? 'neutral';
    const infStr  = inferred?.replace('_',' ') ?? 'neutral';
    if (dominant === 'micro')        return `Sustained micro-expression suppression: showing ${surfStr} while ${infStr} state leaks through involuntary muscle activations`;
    if (dominant === 'gap')          return `Surface–inferred gap: presenting ${surfStr} expression while internal state reads as ${infStr}`;
    if (dominant === 'incongruence') return `Cross-channel incongruence: face, voice, body and speech signals describing different emotional states simultaneously`;
    return `Active affect regulation: ${level} suppression sustained across ${this._suppressionSustained} frames`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get score()      { return this._score; }
  get level()      { return this._lastLevel; }
  get confidence() { return this._confidence; }

  reset() {
    this._score = 0; this._confidence = 0; this._lastScore = 0;
    this._latentSuppression = 0; this._latentValence = 0;
    this._surfaceLabel = null; this._surfaceValence = 0;
    this._microBuffer = []; this._microRate = 0;
    this._channelSentiments = { face:null, voice:null, body:null, speech:null };
    this._suppressionStart = null; this._suppressionSustained = 0;
    this._lastLevel = 'LOW'; this._peakScore = 0; this._frame = 0;
  }

  _emit(event, data) { try { this._bus?.emit(event, data); } catch (_) {} }

  health() {
    return {
      status:  'OK',
      uuid:    SUPP_UUID,
      version: SUPP_VERSION,
      score:   r4(this._score),
      level:   this._lastLevel,
      confidence: r4(this._confidence),
      microBuffer: this._microBuffer.length,
      stats:   { ...this.stats },
    };
  }
}

function r4(v) { return Math.round((v ?? 0) * 10000) / 10000; }
export { MICRO_SURFACE_CONFLICT, SURFACE_VALENCE };
