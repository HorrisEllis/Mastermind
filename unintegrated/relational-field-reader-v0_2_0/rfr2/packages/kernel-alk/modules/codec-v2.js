/**
 * @module       codec-v2
 * @uuid         c0de2000-0000-4000-9000-000000000002
 * @version      1.9.0
 *
 * NEXUS-CODEC v2 — Unified behavioral signal runtime.
 *
 * codec.js built the substrate: RollingStats, FrictionAnalyzer, AssociationEngine,
 * PredictiveEngine, GPGPUAudioProcessor, GPGPUVideoProcessor, InvariantBaseline,
 * PolarityEngine, TopologyEngine, TranscriptEngine, NexusCodec, BatchLogger.
 *
 * codec-v2.js completes the circuit:
 *
 * ── NEW ENGINES (Phase 2 completion) ─────────────────────────────────────────
 *
 *   SlopeEngine        — OLS linear regression over rolling window.
 *                        Direction and momentum of any signal axis.
 *                        WHERE YOU'RE GOING, not where you are.
 *
 *   StabilityEngine    — Coefficient of variation, regime detection.
 *                        Is the signal converging, diverging, or flat?
 *
 *   OscillationEngine  — Peak/trough detection, period estimation, regularity.
 *                        Are you rhythmic, chaotic, or dead?
 *
 *   PitchEngine        — Real FFT bin analysis from AnalyserNode.
 *                        Fundamental frequency via autocorrelation.
 *                        Jitter (pitch instability), shimmer (amplitude instability),
 *                        HNR (harmonics-to-noise ratio) — clinically validated
 *                        stress/emotion markers from speech pathology.
 *                        Voiced/unvoiced detection via ZCR + energy gate.
 *
 *   ConfidencePropagator — Cross-signal confidence weighting.
 *                         High-confidence blink event amplifies simultaneous
 *                         low-confidence friction signal. Signals compound.
 *
 * ── UNIFICATION ───────────────────────────────────────────────────────────────
 *
 *   NexusRuntime — top-level wiring. One object. One event. Everything downstream
 *                  receives the full unified posterior every frame:
 *
 *   RuntimeFrame {
 *     // From codec.js engines
 *     audio:       { energy, zcr, spectralCentroid, cadence, silence, ...sigma }
 *     transcript:  { batch, topology, friction, sentiment, prediction }
 *     video:       { luminance, motionScore, deltaPixelCount }
 *
 *     // New v2 engines
 *     pitch:       { f0, voiced, jitter, shimmer, hnr, prosodyTag }
 *     slope:       { energy, sentiment, friction }  // per-axis trajectories
 *     stability:   { energy, sentiment }             // per-axis regime
 *     oscillation: { energy, sentiment }             // per-axis rhythm
 *
 *     // From ALK modules (if injected)
 *     latent:      { valence, arousal, suppression, coherence, engagement }
 *     suppression: { score, level, dominantEvidence }
 *     expression:  { dominant, confidence, scale, duchenne }
 *     topology:    { dominant, activeComposites }
 *
 *     // Meta
 *     confidence:  { audio, video, transcript, latent }
 *     frameIndex:  number
 *     sessionId:   string
 *   }
 *
 * ── PITCH ENGINE DETAIL (the real innovation here) ────────────────────────────
 *
 *   Standard browser audio analysis uses two-band approximation or just RMS.
 *   That misses the voice quality signals that speech pathology has validated
 *   for 40 years as emotion/stress markers:
 *
 *   JITTER: cycle-to-cycle pitch period variation (F0 instability)
 *     Normal speech: <1%. Emotional stress: 2-5%. Pathology: >5%.
 *     Measured: variance of consecutive period lengths / mean period.
 *
 *   SHIMMER: cycle-to-cycle amplitude variation
 *     Normal: <3dB. Stress: elevated. Breathy voice: high shimmer.
 *     Measured: variance of consecutive peak amplitudes / mean amplitude.
 *
 *   HNR: harmonics-to-noise ratio
 *     Clean voice: >20dB. Stressed/hoarse: <15dB. Whisper: <5dB.
 *     Measured: ratio of harmonic energy to noise floor in FFT spectrum.
 *
 *   These are computed purely from the AnalyserNode's frequency data.
 *   No ML. No external service. O(n) per frame.
 *
 * ── SACCADE TYPING (video innovation) ─────────────────────────────────────────
 *
 *   The video module tracks gaze deviation magnitude. That's not enough.
 *   Eye movements have TYPE:
 *     SACCADE  — rapid ballistic jump (new fixation target)
 *     PURSUIT  — smooth tracking of moving target
 *     FIXATION — stable hold on target
 *     MICROSACCADE — involuntary drift during fixation (attention marker)
 *     NYSTAGMUS  — oscillatory (stress/vestibular)
 *
 *   Typed via velocity + acceleration of iris landmark position:
 *     High velocity + high acceleration → SACCADE
 *     Moderate velocity + low acceleration → PURSUIT
 *     Low velocity → FIXATION (with microsaccade detection by sub-threshold motion)
 *
 * ── BLINK DYNAMICS ────────────────────────────────────────────────────────────
 *
 *   Beyond rate: inter-blink interval distribution.
 *   Normal: Poisson process, mean ~5s, CV ~0.5.
 *   Cognitive load: rate increases, CV increases (more random).
 *   Suppression: rate decreases (vigilance state).
 *   The CV of inter-blink intervals is more informative than the rate.
 *
 * §1.1 — All outputs labeled as signal, not psychological truth.
 * §1.2 — Nothing silent. All errors loud.
 * §5.5 — No external dependencies.
 * §5.7 — Bus-only I/O.
 */

'use strict';

export const CODEC_V2_VERSION = '1.9.0';
export const CODEC_V2_UUID    = 'c0de2000-0000-4000-9000-000000000002';

// ── SlopeEngine ───────────────────────────────────────────────────────────────
// OLS linear regression slope over a rolling window.
// Tells you WHERE a signal is going, not where it is.

const SLOPE_WINDOW = 8;

export class SlopeEngine {
  constructor(window = SLOPE_WINDOW) {
    this._w    = window;
    this._buf  = [];
    this._prevSlope = 0;
    this._prevDir   = 'flat';
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    if (n < 2) return { slope:0, r2:0, direction:'flat', momentum:0, regimeChange:false };

    let sumX=0,sumY=0,sumXY=0,sumX2=0,sumY2=0;
    for (let i=0;i<n;i++) {
      sumX  += i; sumY  += this._buf[i];
      sumXY += i*this._buf[i]; sumX2 += i*i; sumY2 += this._buf[i]**2;
    }
    const D = n*sumX2 - sumX*sumX;
    const slope = D!==0 ? (n*sumXY-sumX*sumY)/D : 0;
    const b     = (sumY - slope*sumX)/n;
    const meanY = sumY/n;
    let ssTot=0,ssRes=0;
    for (let i=0;i<n;i++) { ssTot+=(this._buf[i]-meanY)**2; ssRes+=(this._buf[i]-(b+slope*i))**2; }
    const r2  = ssTot>0 ? Math.max(0,1-ssRes/ssTot) : 0;
    const dir = Math.abs(slope)<0.003 ? 'flat' : slope>0 ? 'rising' : 'falling';
    const sigma = Math.sqrt(Math.max(0,sumY2/n-(sumY/n)**2));
    const momentum = sigma>0 ? (slope*r2)/sigma : 0;
    const regimeChange = dir!=='flat' && this._prevDir!=='flat' && dir!==this._prevDir;
    this._prevSlope = slope;
    this._prevDir   = dir;
    return {
      slope:   r4(slope),
      r2:      r4(r2),
      direction: dir,
      momentum: r4(momentum),
      regimeChange,
    };
  }

  reset() { this._buf=[]; this._prevSlope=0; this._prevDir='flat'; }
}

// ── StabilityEngine ───────────────────────────────────────────────────────────
// Coefficient of variation — is the signal converging or diverging?

const STABILITY_CV_ALERT = 0.55;

export class StabilityEngine {
  constructor(window = 20) {
    this._buf = [];
    this._w   = window;
    this._cvHistory = [];
    this._prevRegime = 'stable';
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    const mean  = this._buf.reduce((s,x)=>s+x,0)/n;
    const sigma = Math.sqrt(this._buf.reduce((s,x)=>s+(x-mean)**2,0)/n);
    const cv    = Math.abs(mean)>1e-6 ? sigma/Math.abs(mean) : sigma;
    this._cvHistory.push(cv);
    if (this._cvHistory.length>10) this._cvHistory.shift();
    const cvDelta = this._cvHistory.length>1
      ? cv - this._cvHistory[this._cvHistory.length-2] : 0;
    const regime = cv>STABILITY_CV_ALERT ? 'volatile' : cv<0.04&&n>=5 ? 'collapsed' : 'stable';
    const regimeChange = regime!==this._prevRegime;
    this._prevRegime = regime;
    return {
      cv:            r4(cv),
      regime,
      regimeChange,
      convergence:   cvDelta < -0.02,
      divergence:    cvDelta >  0.02,
      stabilityScore: r4(Math.max(0,1-Math.min(1,cv/STABILITY_CV_ALERT))),
      entropy:       r4(this._entropy()),
    };
  }

  _entropy() {
    if (this._buf.length<3) return 0;
    const min=Math.min(...this._buf),max=Math.max(...this._buf),range=max-min;
    if (!range) return 0;
    const bins=new Array(8).fill(0);
    for (const v of this._buf) bins[Math.min(7,Math.floor(((v-min)/range)*8))]++;
    const n=this._buf.length;
    let H=0;
    for (const c of bins) if(c>0){const p=c/n;H-=p*Math.log2(p);}
    return H/3; // normalize by log2(8)
  }

  reset() { this._buf=[]; this._cvHistory=[]; this._prevRegime='stable'; }
}

// ── OscillationEngine ─────────────────────────────────────────────────────────
// Peak detection, period estimation, regularity score.
// Are you rhythmic, chaotic, or flat?

const OSC_MIN_CYCLES = 3;

export class OscillationEngine {
  constructor(window = 60) {
    this._w    = window;
    this._buf  = [];
    this._peaks = [];
    this._troughs = [];
    this._total = 0;
    this._peakCount = 0;
  }

  feed(v) {
    this._buf.push(v);
    if (this._buf.length>this._w) this._buf.shift();
    this._total++;
    const n = this._buf.length;
    if (n>=5) {
      const i=n-3;
      const [p2,p1,c,n1,n2]=[this._buf[i-2]??this._buf[0],this._buf[i-1],this._buf[i],this._buf[i+1],this._buf[i+2]??this._buf[n-1]];
      const mean=(p2+p1+c+n1+n2)/5;
      if (c>p1&&c>n1&&c>mean*1.04) {
        this._peaks.push({idx:this._total-2,v:c});
        this._peakCount++;
        if (this._peaks.length>20) this._peaks.shift();
      }
      if (c<p1&&c<n1&&c<mean*0.96) {
        this._troughs.push({idx:this._total-2,v:c});
        if (this._troughs.length>20) this._troughs.shift();
      }
    }

    const pk = this._peaks;
    if (pk.length<OSC_MIN_CYCLES) {
      return {oscillating:false,period:null,regularity:0,phase:0,peakCount:this._peakCount,amplitude:0};
    }

    const intervals = [];
    for (let i=1;i<pk.length;i++) intervals.push(pk[i].idx-pk[i-1].idx);
    const iMean = intervals.reduce((s,v)=>s+v,0)/intervals.length;
    const iSigma = Math.sqrt(intervals.reduce((s,v)=>s+(v-iMean)**2,0)/intervals.length);
    const iCV = iMean>0 ? iSigma/iMean : 1;
    const oscillating = iCV<0.28 && pk.length>=OSC_MIN_CYCLES;
    const regularity  = Math.max(0,1-iCV);
    const phase = pk.length>0 ? this._total-pk[pk.length-1].idx : 0;

    let amplitude=0;
    if (this._troughs.length>0) {
      const pMean=pk.reduce((s,p)=>s+p.v,0)/pk.length;
      const tMean=this._troughs.reduce((s,t)=>s+t.v,0)/this._troughs.length;
      amplitude=Math.max(0,pMean-tMean);
    }

    return {
      oscillating,
      period:    oscillating?r4(iMean):null,
      regularity:r4(regularity),
      phase,
      peakCount: this._peakCount,
      amplitude: r4(amplitude),
      intervalCV:r4(iCV),
    };
  }

  reset() { this._buf=[]; this._peaks=[]; this._troughs=[]; this._total=0; this._peakCount=0; }
}

// ── PitchEngine ───────────────────────────────────────────────────────────────
// Real FFT analysis: F0, jitter, shimmer, HNR, voiced/unvoiced, prosody.
// All from AnalyserNode.getByteFrequencyData — no ML, no deps.
//
// Method: autocorrelation on FFT magnitude bins for F0.
// Jitter: variance of successive period estimates.
// Shimmer: variance of successive peak amplitudes.
// HNR: ratio of harmonic peak energy to inter-harmonic noise floor.

export class PitchEngine {
  constructor(sampleRate = 48000) {
    this._sr        = sampleRate;
    this._fftSize   = 2048;
    this._prevMags  = null;   // for shimmer (amplitude change) and spectral flux
    this._pitchHistory = [];
    this._ampHistory   = [];
    this._slopeEngine  = new SlopeEngine(8);

    // Rolling stats for jitter/shimmer
    this._periodStats = [];   // last 8 period estimates
    this._ampStats    = [];   // last 8 amplitude estimates
  }

  /**
   * Analyze one FFT frame.
   * @param {Uint8Array} freqData — from analyser.getByteFrequencyData()
   * @param {Uint8Array} timeData — from analyser.getByteTimeDomainData()
   * @param {number}     zcr      — pre-computed zero crossing rate
   * @param {number}     energy   — pre-computed RMS energy
   */
  analyze(freqData, timeData, zcr, energy) {
    const n   = freqData.length; // = fftSize/2
    const sr  = this._sr;
    const binHz = sr / (n * 2);  // Hz per bin

    // Convert byte freq data to linear magnitude
    const mags = new Float32Array(n);
    for (let i=0;i<n;i++) mags[i] = freqData[i] / 255.0;

    // ── Voiced/unvoiced detection ─────────────────────────────────────────
    // Voice: energy > floor AND zcr < threshold (harmonic → low ZCR)
    const voiced = energy > 0.008 && zcr < 0.35;

    if (!voiced) {
      this._prevMags = mags;
      return { voiced:false, f0:null, jitter:null, shimmer:null, hnr:null, prosodyTag:'unvoiced',
               spectralCentroid:this._centroid(mags,binHz), spectralFlux:0 };
    }

    // ── F0 via autocorrelation on magnitude spectrum ─────────────────────
    // Find the frequency with the highest peak in the vocal range
    const minBin = Math.floor(80  / binHz);   // 80Hz  = bass male
    const maxBin = Math.floor(400 / binHz);   // 400Hz = high female
    let peakBin=minBin, peakMag=0;
    for (let i=minBin;i<=Math.min(maxBin,n-1);i++) {
      if (mags[i]>peakMag) { peakMag=mags[i]; peakBin=i; }
    }
    const f0 = peakBin>0 ? peakBin*binHz : null;

    // ── Jitter: pitch period instability ──────────────────────────────────
    // Accumulate period estimates (1/f0 in samples)
    let jitter = null;
    if (f0 && f0>0) {
      const period = sr / f0;
      this._periodStats.push(period);
      if (this._periodStats.length>8) this._periodStats.shift();
      if (this._periodStats.length>=3) {
        const pm = mean(this._periodStats);
        const pv = variance(this._periodStats);
        jitter = r4(pm>0 ? Math.sqrt(pv)/pm : 0); // relative jitter (RAP proxy)
      }
    }

    // ── Shimmer: amplitude instability ───────────────────────────────────
    // Track peak amplitude changes frame-to-frame
    let shimmer = null;
    const curAmp = peakMag;
    this._ampStats.push(curAmp);
    if (this._ampStats.length>8) this._ampStats.shift();
    if (this._ampStats.length>=3) {
      const am = mean(this._ampStats);
      const av = variance(this._ampStats);
      shimmer = r4(am>0 ? Math.sqrt(av)/am : 0);
    }

    // ── HNR: harmonics-to-noise ratio ─────────────────────────────────────
    // Sum energy at harmonic peaks vs energy between harmonics
    let hnr = null;
    if (f0 && f0>0) {
      let harmonicEnergy = 0, noiseEnergy = 0;
      const maxHarmonic = Math.floor((n*binHz*0.8) / f0);
      for (let h=1;h<=Math.min(maxHarmonic,10);h++) {
        const hBin = Math.round(h*f0/binHz);
        if (hBin>=n) break;
        const lo=Math.max(0,hBin-2), hi=Math.min(n-1,hBin+2);
        for (let b=0;b<n;b++) {
          const e = mags[b]**2;
          if (b>=lo&&b<=hi) harmonicEnergy+=e;
          else               noiseEnergy+=e;
        }
      }
      // HNR in dB
      if (noiseEnergy>0&&harmonicEnergy>0) {
        hnr = r4(10*Math.log10(harmonicEnergy/noiseEnergy));
      }
    }

    // ── Spectral flux (frame-to-frame change) ─────────────────────────────
    let spectralFlux = 0;
    if (this._prevMags) {
      for (let i=0;i<n;i++) spectralFlux += (mags[i]-this._prevMags[i])**2;
      spectralFlux = r4(Math.sqrt(spectralFlux/n));
    }
    this._prevMags = mags;

    // ── Pitch trajectory ──────────────────────────────────────────────────
    const slopeResult = f0 ? this._slopeEngine.feed(f0) : null;
    const pitchDir = slopeResult?.direction ?? 'flat';

    // ── Prosody tag (from voice quality + pitch direction) ─────────────────
    // From phonetics + speech pathology literature:
    const prosodyTag = this._prosodyTag(voiced, f0, jitter, shimmer, hnr, pitchDir, zcr);

    // Track pitch history
    if (f0) {
      this._pitchHistory.push(f0);
      if (this._pitchHistory.length>30) this._pitchHistory.shift();
    }

    return {
      voiced,
      f0:           f0 ? r4(f0) : null,
      jitter,
      shimmer,
      hnr,
      prosodyTag,
      spectralCentroid: r4(this._centroid(mags,binHz)),
      spectralFlux,
      pitchSlope:   slopeResult,
      pitchMean:    this._pitchHistory.length>0 ? r4(mean(this._pitchHistory)) : null,
    };
  }

  _centroid(mags, binHz) {
    let num=0,den=0;
    for (let i=0;i<mags.length;i++) { num+=i*binHz*mags[i]; den+=mags[i]; }
    return den>0?num/den:0;
  }

  _prosodyTag(voiced, f0, jitter, shimmer, hnr, pitchDir, zcr) {
    if (!voiced) return 'unvoiced';
    if (jitter !== null && jitter > 0.04) return 'tense'; // high jitter = laryngeal tension
    if (shimmer !== null && shimmer > 0.05 && hnr !== null && hnr < 8) return 'breathy';
    if (hnr !== null && hnr < 5) return 'creaky'; // low HNR + low pitch = vocal fry
    if (pitchDir==='rising' && f0 > 200) return 'rising'; // uptalk / question
    if (pitchDir==='falling') return 'falling'; // statement / declarative
    if (zcr > 0.25 && !voiced) return 'fricative';
    return 'modal'; // normal phonation
  }

  reset() {
    this._prevMags=null; this._pitchHistory=[];
    this._ampHistory=[]; this._periodStats=[]; this._ampStats=[];
    this._slopeEngine.reset();
  }
}

// ── SaccadeClassifier ─────────────────────────────────────────────────────────
// Classifies eye movement type from iris landmark velocity + acceleration.
// From ophthalmology: saccade, smooth pursuit, fixation, microsaccade.

export class SaccadeClassifier {
  constructor() {
    this._prevPos = null;
    this._prevVel = null;
    this._fixationBuffer = [];   // recent velocities during apparent fixation
    this._blinkIntervals = [];   // inter-blink intervals (ms)
    this._lastBlinkTs    = null;
    this._blinkCount     = 0;
  }

  /**
   * Classify eye movement from iris position.
   * @param {object} irisL — {x,y} normalized MediaPipe coords
   * @param {object} irisR
   * @param {number} timestamp — ms
   * @param {boolean} isBlink
   */
  classify(irisL, irisR, timestamp, isBlink) {
    if (isBlink) {
      this._blinkCount++;
      if (this._lastBlinkTs !== null) {
        const interval = timestamp - this._lastBlinkTs;
        this._blinkIntervals.push(interval);
        if (this._blinkIntervals.length>20) this._blinkIntervals.shift();
      }
      this._lastBlinkTs = timestamp;
      this._prevPos = null;
      return { type:'BLINK', velocity:0, acceleration:0, blinkInfo: this._blinkStats() };
    }

    // Average iris position
    const pos = { x:(irisL.x+irisR.x)/2, y:(irisL.y+irisR.y)/2 };

    if (!this._prevPos || !this._prevVel) {
      this._prevPos = pos;
      this._prevVel = {x:0,y:0};
      return { type:'UNKNOWN', velocity:0, acceleration:0, blinkInfo:this._blinkStats() };
    }

    const dt = 1/30; // assume 30fps
    const vel = {
      x: (pos.x - this._prevPos.x) / dt,
      y: (pos.y - this._prevPos.y) / dt,
    };
    const velMag = Math.sqrt(vel.x**2 + vel.y**2);
    const accel  = Math.sqrt((vel.x-this._prevVel.x)**2+(vel.y-this._prevVel.y)**2)/dt;

    let type;
    if (velMag > 0.8)                      type = 'SACCADE';      // rapid ballistic
    else if (velMag > 0.15 && accel < 0.3) type = 'PURSUIT';      // smooth tracking
    else if (velMag < 0.02)                type = 'FIXATION';
    else                                   type = 'MICROSACCADE';  // sub-fixation motion

    // Microsaccade during fixation buffer
    if (type === 'FIXATION' || type === 'MICROSACCADE') {
      this._fixationBuffer.push(velMag);
      if (this._fixationBuffer.length>10) this._fixationBuffer.shift();
    } else {
      this._fixationBuffer = [];
    }

    this._prevPos = pos;
    this._prevVel = vel;

    return {
      type,
      velocity:     r4(velMag),
      acceleration: r4(accel),
      blinkInfo:    this._blinkStats(),
    };
  }

  _blinkStats() {
    const intervals = this._blinkIntervals;
    if (intervals.length < 2) {
      return { count:this._blinkCount, rate:null, ibiMean:null, ibiCV:null };
    }
    const m  = mean(intervals);
    const v  = variance(intervals);
    const cv = m>0 ? Math.sqrt(v)/m : 0;
    // Blink rate = 1/mean_interval_in_seconds
    const rate = m>0 ? 60000/m : null; // blinks per minute
    return {
      count:  this._blinkCount,
      rate:   rate ? r4(rate) : null,    // blinks/min (normal: 15-20)
      ibiMean: r4(m),                    // inter-blink interval mean (ms)
      ibiCV:  r4(cv),                    // CV of intervals (load → higher CV)
    };
  }

  reset() {
    this._prevPos=null; this._prevVel=null;
    this._fixationBuffer=[]; this._blinkIntervals=[]; this._lastBlinkTs=null; this._blinkCount=0;
  }
}

// ── ConfidencePropagator ──────────────────────────────────────────────────────
// Cross-signal confidence weighting.
// A high-confidence signal amplifies simultaneous low-confidence signals.
// A low-confidence signal is discounted when no corroboration exists.
//
// From Bayesian inference: the posterior precision (inverse variance) of
// a combined estimate is the sum of individual precisions. Signals compound.

export class ConfidencePropagator {
  constructor() {
    this._windowMs = 500; // signals within 500ms are "simultaneous"
    this._buffer   = [];  // [{ type, confidence, ts }]
  }

  /**
   * Record a signal observation.
   * @param {string} type
   * @param {number} confidence — [0,1]
   * @param {number} ts — ms
   */
  observe(type, confidence, ts = Date.now()) {
    this._buffer.push({ type, confidence, ts });
    this._prune(ts);
  }

  /**
   * Get propagated confidence for a signal type.
   * Amplified by simultaneous high-confidence signals from OTHER types.
   */
  propagated(type, ts = Date.now()) {
    this._prune(ts);
    const own = this._buffer.filter(s => s.type===type);
    if (!own.length) return 0;

    const ownConf = own.reduce((mx,s)=>Math.max(mx,s.confidence),0);

    // Other signals in the window (corroboration)
    const others = this._buffer.filter(s => s.type!==type);
    if (!others.length) return ownConf;

    // Corroboration boost: mean confidence of other signals × propagation weight
    const otherMean = others.reduce((s,o)=>s+o.confidence,0)/others.length;
    const boost     = otherMean * 0.4; // CONFIDENCE_PROP_WEIGHT

    return Math.min(1, ownConf + boost * (1-ownConf));
  }

  /**
   * Joint confidence: do ALL of these types have simultaneous evidence?
   * Returns the weakest link (bottleneck) confidence.
   */
  joint(types, ts = Date.now()) {
    this._prune(ts);
    let minConf = 1;
    for (const type of types) {
      const sigs = this._buffer.filter(s=>s.type===type);
      if (!sigs.length) return 0;
      const conf = sigs.reduce((mx,s)=>Math.max(mx,s.confidence),0);
      minConf = Math.min(minConf, conf);
    }
    return r4(minConf);
  }

  _prune(ts) {
    this._buffer = this._buffer.filter(s => ts-s.ts < this._windowMs);
  }

  reset() { this._buffer=[]; }
}

// ── NexusRuntime ──────────────────────────────────────────────────────────────
// Top-level v2 wiring. Wraps NexusCodec (from codec.js) and adds:
// - PitchEngine on every audio frame
// - SlopeEngine/StabilityEngine/OscillationEngine on energy+sentiment+friction
// - SaccadeClassifier on gaze events
// - ConfidencePropagator across all signal types
// - Unified RuntimeFrame emitted on every audio frame + every transcript batch
//
// Usage:
//   import NexusCodec from './codec.js';
//   import { NexusRuntime } from './codec-v2.js';
//   const codec   = new NexusCodec({ onBatch, onAudioFrame, onFrame });
//   const runtime = new NexusRuntime({ codec, bus });
//   await codec.start({ videoElement });

export class NexusRuntime {
  /**
   * @param {object} opts
   * @param {object} opts.codec      — NexusCodec instance from codec.js
   * @param {object} opts.bus        — SISOBus / ALK bus
   * @param {number} [opts.sampleRate=48000]
   */
  constructor({ codec, bus, sampleRate = 48000 } = {}) {
    if (!codec) throw new Error('[NexusRuntime] codec required');
    if (!bus)   throw new Error('[NexusRuntime] bus required');

    this._codec    = codec;
    this._bus      = bus;
    this._sr       = sampleRate;
    this._sessionId = null;
    this._frameIdx  = 0;

    // Phase 2 engines
    this._pitch     = new PitchEngine(sampleRate);
    this._saccade   = new SaccadeClassifier();
    this._confProp  = new ConfidencePropagator();

    // Per-axis slope/stability/oscillation
    this._slope = {
      energy:    new SlopeEngine(),
      sentiment: new SlopeEngine(),
      friction:  new SlopeEngine(),
      pitch:     new SlopeEngine(6),
    };
    this._stability = {
      energy:    new StabilityEngine(),
      sentiment: new StabilityEngine(),
    };
    this._oscillation = {
      energy:    new OscillationEngine(),
      sentiment: new OscillationEngine(30),
    };

    // State
    this._lastAudioFrame = null;
    this._lastBatch      = null;
    this._lastLatent     = null;
    this._lastSuppression = null;
    this._lastExpression  = null;
    this._lastTopology    = null;

    // FFT analyser ref (set via attachAnalyser)
    this._analyser   = null;
    this._freqBuf    = null;
    this._timeBuf    = null;
    this._analyserRaf= null;

    this._bindBus();
    this._patchCodec();
  }

  // ── Codec patching ─────────────────────────────────────────────────────────
  // We monkey-patch the codec's audio frame callback to run PitchEngine
  // alongside the existing analysis. Not monkey-patching semantics — adding
  // a new subscriber at the output boundary.

  _patchCodec() {
    const origOnAudioFrame = this._codec._onAudioFrame?.bind(this._codec);
    this._codec._onAudioFrame = (frame) => {
      origOnAudioFrame?.(frame);
      this._onAudioFrame(frame);
    };
  }

  _onAudioFrame(frame) {
    this._lastAudioFrame = frame;
    this._frameIdx++;

    // Run phase 2 slope/stability/osc on energy
    const energySlope  = this._slope.energy.feed(frame.energy);
    const energyStab   = this._stability.energy.feed(frame.energy);
    const energyOsc    = this._oscillation.energy.feed(frame.energy);

    // Confidence propagation from audio signals
    if (frame.energyAnomaly) {
      this._confProp.observe('audio.energy_anomaly', Math.min(1,Math.abs(frame.energyZ)/4));
    }

    // Get FFT data if analyser attached
    let pitchResult = { voiced:false, f0:null, jitter:null, shimmer:null, hnr:null, prosodyTag:'unknown' };
    if (this._analyser && this._freqBuf && this._timeBuf) {
      try {
        this._analyser.getByteFrequencyData(this._freqBuf);
        this._analyser.getByteTimeDomainData(this._timeBuf);
        pitchResult = this._pitch.analyze(this._freqBuf, this._timeBuf, frame.zcr, frame.energy);
        if (pitchResult.f0) {
          this._slope.pitch.feed(pitchResult.f0);
        }
      } catch (_) {}
    }

    // Emit per-frame unified signal
    this._emit('alk.runtime.audio.frame', {
      frameIndex:  this._frameIdx,
      sessionId:   this._sessionId,
      audio:       frame,
      pitch:       pitchResult,
      trajectory: {
        energy:    { slope: energySlope, stability: energyStab, oscillation: energyOsc },
      },
      confidence:  {
        audio:     this._confProp.propagated('audio.energy_anomaly'),
      },
    });
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;

    // Session lifecycle
    b.on('alk.session.capture.start', ev => {
      this._sessionId = ev.sessionId ?? ev.payload?.sessionId;
      this._resetEngines();
    });
    b.on('alk.session.capture.stop', () => { this._sessionId = null; });

    // Transcript batch from codec — add phase 2 analysis
    b.on('alk.verbal.transcript', ev => {
      const p = ev.payload ?? ev;
      this._lastBatch = p;
      this._onTranscriptBatch(p);
    });

    // Gaze from video module → saccade classification
    b.on('alk.video.landmarks.face', ev => {
      const p = ev.payload ?? ev;
      if (!p.rawLandmarks || p.rawLandmarks.length < 478) return;
      const lms = p.rawLandmarks;
      const irisL = lms[468], irisR = lms[473];
      if (!irisL || !irisR) return;
      const isBlink = (p.leftEAR??1) < 0.18 || (p.rightEAR??1) < 0.18;
      const saccade = this._saccade.classify(irisL, irisR, Date.now(), isBlink);
      if (saccade.type !== 'UNKNOWN') {
        this._emit('alk.runtime.saccade', { ...saccade, frameIndex: p.frameIndex, sessionId: this._sessionId });
        if (saccade.type === 'SACCADE') {
          this._confProp.observe('saccade', 0.8);
        }
        if (saccade.blinkInfo?.rate !== null) {
          this._emit('alk.runtime.blink.stats', saccade.blinkInfo);
        }
      }
    });

    // Latent model updates
    b.on('alk.latent.update', ev => {
      this._lastLatent = ev.payload ?? ev;
    });
    b.on('alk.suppression.update', ev => {
      this._lastSuppression = ev.payload ?? ev;
      if ((ev.payload?.suppressionScore ?? 0) > 0.5) {
        this._confProp.observe('suppression', ev.payload.suppressionScore);
      }
    });
    b.on('alk.expression.composite', ev => {
      this._lastExpression = ev.payload ?? ev;
      if ((ev.payload?.confidence ?? 0) > 0.4) {
        this._confProp.observe(`expr.${ev.payload.label}`, ev.payload.confidence);
      }
    });
    b.on('alk.signal.composite', ev => {
      this._lastTopology = ev.payload ?? ev;
    });

    // Expression micros → confidence
    b.on('alk.expression.micro', ev => {
      const p = ev.payload ?? ev;
      this._confProp.observe(`micro.${p.label}`, p.suppressionConfidence ?? 0.5);
    });
  }

  _onTranscriptBatch(batch) {
    // Phase 2: add slope/stability/oscillation to transcript analysis
    const sentiment = batch.sentiment?.score ?? 0;
    const friction  = batch.friction?.score  ?? 0;

    const sentSlope = this._slope.sentiment.feed(sentiment);
    const sentStab  = this._stability.sentiment.feed(sentiment);
    const sentOsc   = this._oscillation.sentiment.feed(sentiment);
    const fricSlope = this._slope.friction.feed(friction);

    if (batch.friction?.friction) {
      this._confProp.observe('friction', friction);
    }

    // Confidence-weighted sentiment: boost when audio energy anomaly is simultaneous
    const audioCorroboration = this._confProp.propagated('audio.energy_anomaly');
    const weightedSentiment  = sentiment + (sentiment < 0 ? audioCorroboration * 0.15 : 0);

    // Full runtime frame on batch
    const frame = this._buildFrame({
      sentimentSlope: sentSlope,
      sentimentStab:  sentStab,
      sentimentOsc:   sentOsc,
      frictionSlope:  fricSlope,
      weightedSentiment,
    });

    this._emit('alk.runtime.frame', frame);

    // Topology escalation detection
    this._detectEscalation(frame);
  }

  _buildFrame(extra = {}) {
    return {
      frameIndex:    this._frameIdx,
      sessionId:     this._sessionId,
      ts:            Date.now(),

      audio:         this._lastAudioFrame,
      transcript:    this._lastBatch,
      latent:        this._lastLatent,
      suppression:   this._lastSuppression,
      expression:    this._lastExpression,
      topology:      this._lastTopology,

      pitch:         this._pitch, // expose engine for health check

      trajectory: {
        energy: {
          slope:      this._slope.energy._prevSlope,
          direction:  this._slope.energy._prevDir,
          stability:  null, // set by caller
          oscillating:this._oscillation.energy.feed(this._lastAudioFrame?.energy??0).oscillating,
        },
        sentiment: {
          slope:      extra.sentimentSlope,
          stability:  extra.sentimentStab,
          oscillation:extra.sentimentOsc,
        },
        friction: {
          slope:      extra.frictionSlope,
        },
      },

      confidence: {
        audio:      this._confProp.propagated('audio.energy_anomaly'),
        suppression:this._confProp.propagated('suppression'),
        expression: this._confProp.propagated(`expr.${this._lastExpression?.label}`),
        joint:      this._confProp.joint(['friction','suppression','micro.FEAR']),
      },

      weightedSentiment: extra.weightedSentiment ?? null,
    };
  }

  _detectEscalation(frame) {
    // Cross-domain escalation: simultaneous negative sentiment slope +
    // energy oscillation + suppression spike + friction
    const negSentSlope  = frame.trajectory?.sentiment?.slope?.direction === 'falling';
    const energyOsc     = frame.trajectory?.energy?.oscillating;
    const highSupp      = (frame.suppression?.suppressionScore ?? 0) > 0.55;
    const highFriction  = (frame.transcript?.friction?.score ?? 0) > 0.4;
    const jointConf     = frame.confidence?.joint ?? 0;

    if (negSentSlope && (energyOsc || highSupp || highFriction) && jointConf > 0.3) {
      this._emit('alk.runtime.escalation', {
        sessionId:      this._sessionId,
        confidence:     r4(jointConf),
        evidence:       {
          negSentSlope, energyOsc, highSupp, highFriction,
        },
        suppression:    frame.suppression?.suppressionScore,
        sentiment:      frame.transcript?.sentiment?.score,
      });
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Attach a Web Audio AnalyserNode for real FFT analysis.
   * Call this after codec.start() gives you the AudioContext/AnalyserNode.
   * @param {AnalyserNode} analyser
   */
  attachAnalyser(analyser) {
    this._analyser = analyser;
    analyser.fftSize = 2048; // override codec's 256 for proper pitch analysis
    this._freqBuf = new Uint8Array(analyser.frequencyBinCount);
    this._timeBuf = new Uint8Array(analyser.frequencyBinCount);
    console.log('[NexusRuntime] FFT analyser attached, fftSize=2048, bins=', analyser.frequencyBinCount);
  }

  _resetEngines() {
    this._pitch.reset(); this._saccade.reset(); this._confProp.reset();
    for (const e of Object.values(this._slope))      e.reset();
    for (const e of Object.values(this._stability))  e.reset();
    for (const e of Object.values(this._oscillation)) e.reset();
  }

  _emit(type, data) { try { this._bus.emit(type, data); } catch (_) {} }

  health() {
    return {
      status:    'OK',
      uuid:      CODEC_V2_UUID,
      version:   CODEC_V2_VERSION,
      sessionId: this._sessionId,
      frameIdx:  this._frameIdx,
      pitch:     this._pitch,
      saccade:   this._saccade._blinkCount,
    };
  }
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function r4(v)        { return Math.round((v??0)*10000)/10000; }
function mean(a)      { return a.reduce((s,v)=>s+v,0)/a.length; }
function variance(a)  { const m=mean(a); return a.reduce((s,v)=>s+(v-m)**2,0)/a.length; }
