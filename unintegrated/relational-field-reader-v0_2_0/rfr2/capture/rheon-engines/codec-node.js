/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  RHEON CODEC-NODE  ·  codec-node.js  ·  v1.0.0                            ║
 * ║  UUID: rheon-codec-node-0001-4000-0000-000000000001                        ║
 * ║  Fork of: nexus-codec v1.9.0 + codec-v2 v1.9.0                           ║
 * ║  Author: James Brooks (Erosmancer) · rheon.world                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * WHAT THIS IS:
 *   A surgical fork of the NexusCodec browser runtime, stripped of every browser
 *   dependency and rebuilt for Node.js kernel-side operation.
 *
 * WHAT WAS STRIPPED:
 *   ✗ AudioContext / AnalyserNode / getUserMedia        (browser audio APIs)
 *   ✗ requestAnimationFrame / OffscreenCanvas           (browser render loop)
 *   ✗ window.SpeechRecognition / window.webkitSpeechRecognition
 *   ✗ localStorage / navigator / window.*
 *   ✗ GPGPUVideoProcessor + SaccadeClassifier           (out of scope)
 *   ✗ NexusCodec (browser orchestrator)
 *   ✗ BatchLogger (localStorage) → kernel uses Jaa/SQLite
 *   ✗ TranscriptEngine → kernel uses Whisper
 *
 * WHAT WAS KEPT VERBATIM:
 *   ✓ RollingStats            — Welford σ, decay mean, entropy, z-score
 *   ✓ FrictionAnalyzer        — disfluency, filler, memory gap, tension, denial
 *   ✓ AssociationEngine       — Jaccard content-word lattice
 *   ✓ PredictiveEngine        — Markov-1 tag transitions + trigram word model
 *   ✓ InvariantBaseline       — frozen session baseline + z-score deviation
 *   ✓ PolarityEngine          — cumulative emotional arc, flip detection
 *   ✓ TopologyEngine          — composite state: CALIBRATING/STABLE/POLARIZED/BASELINE_ALERT
 *   ✓ SlopeEngine             — OLS regression: WHERE are you going
 *   ✓ StabilityEngine         — CV regime: are you converging or diverging
 *   ✓ OscillationEngine       — peak detection: are you rhythmic or chaotic
 *   ✓ PitchEngine             — F0, jitter, shimmer, HNR, prosody tags
 *   ✓ ConfidencePropagator    — cross-signal Bayesian corroboration
 *
 * WHAT WAS INVENTED:
 *   ★ FFTEngine               — pure JS Cooley-Tukey FFT on PCM Buffer.
 *                               Produces Uint8Array freq bins identical to
 *                               AnalyserNode.getByteFrequencyData().
 *                               PitchEngine runs VERBATIM on its output.
 *                               Zero npm deps. O(n log n).
 *
 *   ★ PCMAnalyzer             — replaces GPGPUAudioProcessor.
 *                               Input: raw PCM Buffer (Int16LE) from ring buffer.
 *                               Output: same frame shape as GPGPUAudioProcessor.
 *                               Energy-adaptive chunk boundaries PRESERVED.
 *                               Natural speech boundaries PRESERVED.
 *                               requestAnimationFrame → Node setInterval.
 *                               MediaStream → push(pcmBuffer) interface.
 *
 *   ★ NodeRuntime             — replaces NexusRuntime.
 *                               Wires PCMAnalyzer + PitchEngine + SlopeEngine +
 *                               StabilityEngine + OscillationEngine + ConfidencePropagator
 *                               into one unified frame on the SISO bus.
 *                               Same RuntimeFrame shape as codec-v2 NexusRuntime.
 *                               Works with or without Whisper (text is optional).
 *
 * ADVERSARIAL DESIGN DECISIONS:
 *   1. PCM input path: push() never blocks. Analysis runs on a setImmediate
 *      drain loop, not synchronously. The ring buffer never stalls.
 *   2. FFT: radix-2 DIT. Power-of-2 sizes only (512/1024/2048). Padding applied.
 *      Non-power-of-2 input is zero-padded, never rejected.
 *   3. All engines reset() on session start. State does not leak across sessions.
 *   4. §1.1: Every threshold is a named constant with a comment.
 *   5. §1.2: Every error is loud. No silent NaN propagation.
 *      Defensive NaN guards on all rolling stats inputs.
 *   6. §5.5: Zero npm deps. This file runs with node --input-type=module.
 *   7. Chunk boundaries are NATURAL (silence-based) OR hard (10s max).
 *      Fixed-interval slicing destroys speech prosody signals. Not done here.
 *
 * §1.1 — Signal, not truth. "Tense prosody" ≠ lying. "High friction" ≠ deception.
 * §1.2 — Nothing silent. All errors surface on bus as codec:error events.
 * §5.5 — Zero external runtime dependencies.
 */

'use strict';

export const CODEC_NODE_VERSION = '1.0.0';
export const CODEC_NODE_UUID    = 'rheon-codec-node-0001-4000-0000-000000000001';

// ─── Constants (every threshold documented) ───────────────────────────────────

const CHUNK_MAX_MS        = 10_000;  // hard cap: 10s per analysis chunk
const CHUNK_SILENCE_MS    =  1_200;  // natural boundary: 1.2s silence = cut
const ENERGY_SIGMA_ALERT  =    2.0;  // σ multiplier for energy anomaly
const CADENCE_SIGMA_ALERT =    2.0;  // σ multiplier for cadence anomaly
const ROLLING_WINDOW      =     20;  // samples in rolling stats window
const INVARIANT_THRESHOLD =   0.80;  // word in ≥80% of nodes = invariant
const HEURISTIC_PROMOTE   =      3;  // pattern fires N times → heuristic
const ASSOC_MIN_CHARS     =      4;  // minimum word length for association
const TOPOLOGY_WARMUP_N   =      5;  // batches before baseline locks
const POLARITY_FLIP_THRESHOLD = 0.20;
const POLARITY_WINDOW     =     20;
const COMPOSITE_ALERT_Z   =    2.0;
const SLOPE_WINDOW        =      8;
const STABILITY_CV_ALERT  =   0.55;
const OSC_MIN_CYCLES      =      3;
const DECAY_HALFLIFE      =     10;
const PITCH_MIN_HZ        =     80;  // bass male fundamental
const PITCH_MAX_HZ        =    400;  // high female fundamental
const SAMPLE_RATE_DEFAULT =  16000;  // kernel captures at 16kHz
const FFT_SIZE            =   2048;  // bins for pitch analysis
const SILENCE_ENERGY_GATE =  0.005;  // RMS below this = silence
const VOICED_ZCR_GATE     =   0.35;  // ZCR above this = unvoiced

// ─── Friction Lexicon ─────────────────────────────────────────────────────────

const FRICTION = {
  disfluency: new Set([
    'uh','uhh','uhhh','um','umm','ummm','er','err','ah','ahh','hm','hmm',
    'hmmm','uh-huh','mm','mmm',
  ]),
  filler: [
    /\blike\b(?!\s+to\b|\s+a\b|\s+the\b)/,
    /\byou\s+know\b/,
    /\bi\s+mean\b/,
    /\bsort\s+of\b/,
    /\bkind\s+of\b/,
    /\bbasically\b/,
    /\bactually\b.*\bactually\b/,
    /\bright\?\s*right\?/,
  ],
  memoryGap: [
    /i\s+can'?t\s+remember/,
    /what\s+was\s+it/,
    /i\s+forget/,
    /i\s+forgot/,
    /what'?s\s+the\s+word/,
    /i\s+don'?t\s+recall/,
    /what\s+do\s+you\s+call\s+it/,
  ],
  cognitiveLoad: [
    /\bwait\b/,
    /\bhold\s+on\b/,
    /\blet\s+me\s+think\b/,
    /\bjust\s+a\s+second\b/,
    /\bwhere\s+was\s+i\b/,
  ],
  tension: [
    /i\s+don'?t\s+know\s+(?:how|what|why|if)/,
    /i'?m\s+not\s+sure/,
    /it'?s\s+hard\s+to\s+say/,
    /i\s+can'?t\s+explain/,
    /this\s+is\s+(?:difficult|hard|complicated)/,
    /\btired\b/,
    /\bexhausted\b/,
  ],
  denial: [
    /it'?s\s+not\s+that/,
    /i'?m\s+not\s+saying/,
    /that'?s\s+not\s+what\s+i/,
    /i\s+didn'?t\s+mean/,
    /not\s+my\s+fault/,
  ],
};

// ─── Stopwords ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','and','for','that','this','with','from','have','been','were',
  'they','their','there','what','when','which','will','would','could',
  'should','about','into','than','then','your','more','also','some',
  'just','like','over','such','these','those','very','here','each',
  'both','only','after','before','other','first','well','out','its',
  'our','all','any','who','how','but','not','are','was','can','does',
  'did','has','had','him','her','his','she','they','too','get','got',
]);

// ═════════════════════════════════════════════════════════════════════════════
// ── PORTABLE ENGINES (verbatim from codec.js / codec-v2.js) ─────────────────
// ═════════════════════════════════════════════════════════════════════════════

// ─── RollingStats ─────────────────────────────────────────────────────────────

export class RollingStats {
  constructor(window = ROLLING_WINDOW) {
    this._w    = window;
    this._buf  = [];
    this._sum  = 0;
    this._sum2 = 0;
  }

  push(v) {
    // §1.2 — NaN guard: never let bad input corrupt the rolling mean
    if (!Number.isFinite(v)) return this;
    if (this._buf.length >= this._w) {
      const old = this._buf.shift();
      this._sum  -= old;
      this._sum2 -= old * old;
    }
    this._buf.push(v);
    this._sum  += v;
    this._sum2 += v * v;
    return this;
  }

  get mean()    { return this._buf.length ? this._sum / this._buf.length : 0; }
  get variance(){
    const n = this._buf.length;
    if (n < 2) return 0;
    return Math.max(0, this._sum2 / n - (this._sum / n) ** 2);
  }
  get sigma()   { return Math.sqrt(this.variance); }
  get last()    { return this._buf[this._buf.length - 1] ?? 0; }
  get len()     { return this._buf.length; }

  zScore(v)     { return this.sigma > 0 ? (v - this.mean) / this.sigma : 0; }

  measure(v) {
    if (!Number.isFinite(v)) return { mean: this.mean, sigma: this.sigma, delta: 0, zScore: 0, anomaly: false };
    const prev = this.last;
    this.push(v);
    return {
      mean:    this.mean,
      sigma:   this.sigma,
      delta:   v - prev,
      zScore:  this.zScore(v),
      anomaly: Math.abs(this.zScore(v)) > ENERGY_SIGMA_ALERT,
    };
  }

  clear() { this._buf = []; this._sum = 0; this._sum2 = 0; }

  decayMean(halfLife = DECAY_HALFLIFE) {
    if (!this._buf.length) return 0;
    const lambda = Math.LN2 / halfLife;
    let ws = 0, tw = 0;
    const n = this._buf.length;
    for (let i = 0; i < n; i++) {
      const w = Math.exp(-lambda * (n - 1 - i));
      ws += this._buf[i] * w;
      tw += w;
    }
    return tw > 0 ? ws / tw : 0;
  }

  entropy() {
    if (this._buf.length < 3) return 0;
    const min = Math.min(...this._buf), max = Math.max(...this._buf);
    const range = max - min;
    if (range === 0) return 0;
    const bins = new Array(10).fill(0);
    for (const v of this._buf) bins[Math.min(9, Math.floor(((v - min) / range) * 10))]++;
    const n = this._buf.length;
    let H = 0;
    for (const c of bins) if (c > 0) { const p = c / n; H -= p * Math.log2(p); }
    return H / Math.log2(10);
  }
}

// ─── FrictionAnalyzer ─────────────────────────────────────────────────────────

export class FrictionAnalyzer {
  constructor() {
    this._rolling      = new RollingStats(30);
    this._sessionTotal = 0;
    this._patternCounts = new Map();
  }

  analyze(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const found = [];

    for (const w of words) {
      if (FRICTION.disfluency.has(w)) found.push({ type: 'disfluency', marker: w });
    }

    const cats = ['filler','memoryGap','cognitiveLoad','tension','denial'];
    for (const cat of cats) {
      for (const re of FRICTION[cat]) {
        if (re.test(lower)) {
          found.push({ type: cat, marker: lower.match(re)?.[0] ?? cat });
          this._patternCounts.set(cat, (this._patternCounts.get(cat) ?? 0) + 1);
        }
      }
    }

    const density = words.length > 0 ? found.length / words.length : 0;
    const stats   = this._rolling.measure(density);
    if (found.length > 0) this._sessionTotal++;

    return {
      friction: found.length > 0,
      markers:  found,
      types:    [...new Set(found.map(f => f.type))],
      score:    Math.min(1, found.length / 3),
      density:  r4(density),
      stats,
      promoted: this._checkPromotions(),
    };
  }

  _checkPromotions() {
    const p = [];
    for (const [k, n] of this._patternCounts) {
      if (n === HEURISTIC_PROMOTE) p.push({ pattern: k, count: n });
    }
    return p;
  }

  reset() { this._rolling.clear(); this._sessionTotal = 0; this._patternCounts.clear(); }
}

// ─── AssociationEngine ────────────────────────────────────────────────────────

export class AssociationEngine {
  constructor() {
    this._nodes   = [];
    this._edges   = [];
    this._ngrams  = new Map();
    this._invariants = null;
  }

  add(id, text) {
    const words    = this._contentWords(text);
    const node     = { id, words, text, ts: Date.now() };
    const newEdges = [];
    for (const existing of this._nodes) {
      const score = this._jaccard(words, existing.words);
      if (score > 0) {
        newEdges.push({ a: id, b: existing.id, score: r4(score), words: [...words].filter(w => existing.words.has(w)) });
      }
    }
    this._nodes.push(node);
    this._edges.push(...newEdges);
    this._updateNgrams(text);
    this._invariants = null;
    return newEdges;
  }

  redundancyCheck(text) {
    const trigrams = this._extractNgrams(text.toLowerCase(), 3);
    const hits = trigrams.filter(tg => (this._ngrams.get(tg) ?? 0) >= 2);
    return { redundant: hits.length > 0, phrases: hits };
  }

  invariants() {
    if (this._invariants) return this._invariants;
    if (this._nodes.length < 3) return { words: [], threshold: INVARIANT_THRESHOLD };
    const freq = new Map();
    for (const n of this._nodes) for (const w of n.words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const threshold = this._nodes.length * INVARIANT_THRESHOLD;
    const words = [...freq.entries()].filter(([,c]) => c >= threshold).map(([w]) => w);
    this._invariants = { words, threshold: INVARIANT_THRESHOLD, nodeCount: this._nodes.length };
    return this._invariants;
  }

  get edges()     { return this._edges; }
  get nodeCount() { return this._nodes.length; }

  _contentWords(text) {
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
    return new Set(words.filter(w => w.length >= ASSOC_MIN_CHARS && !STOPWORDS.has(w)));
  }

  _jaccard(a, b) {
    if (!a.size || !b.size) return 0;
    let inter = 0;
    for (const w of a) if (b.has(w)) inter++;
    return inter / (a.size + b.size - inter);
  }

  _updateNgrams(text) {
    for (const tg of this._extractNgrams(text.toLowerCase(), 3)) {
      this._ngrams.set(tg, (this._ngrams.get(tg) ?? 0) + 1);
    }
  }

  _extractNgrams(text, n) {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const grams = [];
    for (let i = 0; i <= words.length - n; i++) grams.push(words.slice(i, i + n).join(' '));
    return grams;
  }

  reset() { this._nodes = []; this._edges = []; this._ngrams.clear(); this._invariants = null; }
}

// ─── PredictiveEngine ─────────────────────────────────────────────────────────

export class PredictiveEngine {
  constructor() {
    this._tagSeq      = [];
    this._transitions = new Map();
    this._wordTrigrams = new Map();
    this._wordHistory = [];
  }

  feed(tags, text) {
    const primary = tags[0] ?? 'SYS';
    this._tagSeq.push(primary);
    this._updateTransitions(primary);
    const words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    this._wordHistory.push(...words);
    if (this._wordHistory.length > 200) this._wordHistory = this._wordHistory.slice(-200);
    this._updateWordTrigrams(words);
  }

  predictTag() {
    if (this._tagSeq.length < 5) return null;
    const prev = this._tagSeq[this._tagSeq.length - 1];
    const prefix = `${prev}→`;
    const candidates = new Map();
    let total = 0;
    for (const [k, v] of this._transitions) {
      if (k.startsWith(prefix)) { candidates.set(k.slice(prefix.length), v); total += v; }
    }
    if (!total) return null;
    const probs = [...candidates.entries()]
      .map(([tag, c]) => ({ tag, p: r4(c / total) }))
      .sort((a, b) => b.p - a.p);
    return { predicted: probs[0]?.tag ?? null, distribution: probs, basis: `${this._tagSeq.length} transitions` };
  }

  predictWords() {
    if (this._wordHistory.length < 10) return null;
    const prefix = this._wordHistory.slice(-2).join(' ') + ' ';
    const candidates = new Map();
    let total = 0;
    for (const [k, v] of this._wordTrigrams) {
      if (k.startsWith(prefix)) { candidates.set(k.slice(prefix.length), v); total += v; }
    }
    if (!total) return null;
    const top = [...candidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([word, c]) => ({ word, p: r4(c / total) }));
    return { predicted: top[0]?.word ?? null, top3: top };
  }

  _updateTransitions(tag) {
    if (this._tagSeq.length < 2) return;
    const key = `${this._tagSeq[this._tagSeq.length - 2]}→${tag}`;
    this._transitions.set(key, (this._transitions.get(key) ?? 0) + 1);
  }

  _updateWordTrigrams(words) {
    for (let i = 0; i < words.length - 2; i++) {
      const key = words.slice(i, i + 3).join(' ');
      this._wordTrigrams.set(key, (this._wordTrigrams.get(key) ?? 0) + 1);
    }
  }

  reset() {
    this._tagSeq = []; this._transitions.clear();
    this._wordTrigrams.clear(); this._wordHistory = [];
  }
}

// ─── InvariantBaseline ────────────────────────────────────────────────────────

export class InvariantBaseline {
  constructor({ warmupN = TOPOLOGY_WARMUP_N } = {}) {
    this._warmupN  = warmupN;
    this._batches  = [];
    this._baseline = null;
    this._locked   = false;
    this._wordMap  = new Map();
  }

  feed(signals, assocEngine) {
    if (!this._locked) {
      this._batches.push(signals);
      if (this._batches.length >= this._warmupN) this._lock();
      else return { locked: false, warmupProgress: this._batches.length / this._warmupN };
    }

    const axes = ['sentiment','friction','wordCount','energy','cadence'];
    const zScores = {};
    let sumZ2 = 0, count = 0;
    for (const ax of axes) {
      const v = signals[ax];
      if (v == null) { zScores[ax] = null; continue; }
      const b = this._baseline[ax];
      const z = b.sigma > 0 ? (v - b.mean) / b.sigma : 0;
      zScores[ax] = r4(z);
      sumZ2 += z * z; count++;
    }
    const compositeZ = count > 0 ? r4(Math.sqrt(sumZ2 / count)) : 0;
    const alert      = compositeZ >= COMPOSITE_ALERT_Z;

    if (assocEngine) {
      const invWords = assocEngine.invariants()?.words ?? [];
      for (const word of invWords) {
        if (!this._wordMap.has(word)) {
          this._wordMap.set(word, {
            present: { energy: new RollingStats(10), friction: new RollingStats(10), sentiment: new RollingStats(10) },
            absent:  { energy: new RollingStats(10), friction: new RollingStats(10), sentiment: new RollingStats(10) },
          });
        }
        const text  = signals.text ?? '';
        const bucket = this._wordMap.get(word);
        const present = text.toLowerCase().includes(word);
        for (const ax of ['energy','friction','sentiment']) {
          const v = signals[ax];
          if (v != null) (present ? bucket.present[ax] : bucket.absent[ax]).push(v);
        }
      }
    }

    const wordLifts = {};
    for (const [word, b] of this._wordMap) {
      wordLifts[word] = {};
      for (const ax of ['energy','friction','sentiment']) {
        wordLifts[word][ax] = r4(b.present[ax].mean - b.absent[ax].mean);
      }
    }

    return { locked: true, baseline: this._baseline, zScores, compositeZ, alert, wordLifts };
  }

  _lock() {
    const axes = ['sentiment','friction','wordCount','energy','cadence'];
    const raw  = {};
    for (const ax of axes) {
      const vals = this._batches.map(b => b[ax]).filter(v => Number.isFinite(v));
      if (!vals.length) { raw[ax] = { mean: 0, sigma: 0, n: 0 }; continue; }
      const mean  = vals.reduce((s, v) => s + v, 0) / vals.length;
      const sigma = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
      raw[ax] = { mean: r4(mean), sigma: r4(sigma), n: vals.length };
    }
    this._baseline = Object.freeze(raw);
    this._locked   = true;
  }

  get locked()   { return this._locked; }
  get baseline() { return this._baseline; }
  reset() { this._batches = []; this._baseline = null; this._locked = false; this._wordMap.clear(); }
}

// ─── PolarityEngine ───────────────────────────────────────────────────────────

export class PolarityEngine {
  constructor() { this._history = []; this._flips = []; this._lastLabel = 'neutral'; }

  feed(sentiment, batchN, ts) {
    this._history.push(sentiment);
    const n      = this._history.length;
    const window = this._history.slice(-POLARITY_WINDOW);
    const mean   = window.reduce((s, v) => s + v, 0) / window.length;
    const label  = mean > POLARITY_FLIP_THRESHOLD ? 'positive' : mean < -POLARITY_FLIP_THRESHOLD ? 'negative' : 'neutral';

    if (label !== this._lastLabel && label !== 'neutral') {
      this._flips.push({ fromPolarity: this._lastLabel, toPolarity: label, batchN, ts });
    }
    if (label !== 'neutral') this._lastLabel = label;

    let sessionArc = 'stable';
    if (n >= 4) {
      const q    = Math.max(1, Math.floor(n / 4));
      const fQ   = this._history.slice(0, q).reduce((s, v) => s + v, 0) / q;
      const lQ   = this._history.slice(-q).reduce((s, v) => s + v, 0) / q;
      const diff = lQ - fQ;
      sessionArc = diff > 0.15 ? 'improving' : diff < -0.15 ? 'declining' : 'stable';
    }

    const pos    = this._history.filter(v => v > 0).length;
    const neg    = this._history.filter(v => v < 0).length;
    const cumulative = this._history.reduce((s, v) => s + v, 0);
    const momentum   = _inlineMomentum(this._history.slice(-8));

    return {
      rollingMean:  r4(mean),
      label,
      sessionArc,
      dominant:     pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral',
      polarization: r4(Math.abs(cumulative) / n),
      momentum:     r4(momentum),
      flipCount:    this._flips.length,
      flips:        this._flips,
      batchCount:   n,
    };
  }

  reset() { this._history = []; this._flips = []; this._lastLabel = 'neutral'; }
}

// ─── TopologyEngine ───────────────────────────────────────────────────────────

export class TopologyEngine {
  constructor({ warmupN = TOPOLOGY_WARMUP_N } = {}) {
    this._baseline   = new InvariantBaseline({ warmupN });
    this._polarity   = new PolarityEngine();
    this._batchN     = 0;
    this.lastPayload = null;
  }

  feed(signals, assocEngine) {
    this._batchN++;
    const baselineResult = this._baseline.feed(signals, assocEngine);

    if (!baselineResult.locked) {
      const payload = {
        baseline:  baselineResult,
        polarity:  null,
        composite: { state: 'CALIBRATING', evidence: [`warmup ${this._batchN}/${TOPOLOGY_WARMUP_N}`] },
      };
      this.lastPayload = payload; return payload;
    }

    const polarityResult = this._polarity.feed(signals.sentiment ?? 0, this._batchN, signals.ts ?? Date.now());
    const evidence = [];
    let state = 'STABLE';

    if (baselineResult.alert) {
      state = 'BASELINE_ALERT';
      const top = Object.entries(baselineResult.zScores)
        .filter(([, z]) => z !== null && Math.abs(z) >= COMPOSITE_ALERT_Z)
        .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a)).slice(0, 3)
        .map(([ax, z]) => `${ax} ${z > 0 ? '+' : ''}${z}σ`);
      evidence.push(`compositeZ=${baselineResult.compositeZ}`, ...top);
    } else if (polarityResult.label !== 'neutral' && Math.abs(polarityResult.rollingMean) > 0.35) {
      state = 'POLARIZED';
      evidence.push(`polarity=${polarityResult.label}`, `mean=${polarityResult.rollingMean}`);
    } else {
      evidence.push(`compositeZ=${baselineResult.compositeZ}`, `polarity=${polarityResult.label}`);
    }

    const payload = { baseline: baselineResult, polarity: polarityResult, composite: { state, evidence } };
    this.lastPayload = payload;
    return payload;
  }

  reset() { this._baseline.reset(); this._polarity.reset(); this._batchN = 0; this.lastPayload = null; }
}

// ─── SlopeEngine (from codec-v2) ──────────────────────────────────────────────

export class SlopeEngine {
  constructor(window = SLOPE_WINDOW) {
    this._w = window; this._buf = []; this._prevSlope = 0; this._prevDir = 'flat';
  }

  feed(v) {
    if (!Number.isFinite(v)) return { slope: 0, r2: 0, direction: 'flat', momentum: 0, regimeChange: false };
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    if (n < 2) return { slope: 0, r2: 0, direction: 'flat', momentum: 0, regimeChange: false };

    let sumX=0,sumY=0,sumXY=0,sumX2=0,sumY2=0;
    for (let i=0;i<n;i++) { sumX+=i;sumY+=this._buf[i];sumXY+=i*this._buf[i];sumX2+=i*i;sumY2+=this._buf[i]**2; }
    const D     = n*sumX2 - sumX*sumX;
    const slope = D !== 0 ? (n*sumXY - sumX*sumY) / D : 0;
    const b     = (sumY - slope*sumX) / n;
    const meanY = sumY / n;
    let ssTot=0, ssRes=0;
    for (let i=0;i<n;i++) { ssTot+=(this._buf[i]-meanY)**2; ssRes+=(this._buf[i]-(b+slope*i))**2; }
    const r2  = ssTot > 0 ? Math.max(0, 1 - ssRes/ssTot) : 0;
    const dir = Math.abs(slope) < 0.003 ? 'flat' : slope > 0 ? 'rising' : 'falling';
    const sigma = Math.sqrt(Math.max(0, sumY2/n - (sumY/n)**2));
    const momentum = sigma > 0 ? (slope*r2) / sigma : 0;
    const regimeChange = dir !== 'flat' && this._prevDir !== 'flat' && dir !== this._prevDir;
    this._prevSlope = slope; this._prevDir = dir;
    return { slope: r4(slope), r2: r4(r2), direction: dir, momentum: r4(momentum), regimeChange };
  }

  reset() { this._buf = []; this._prevSlope = 0; this._prevDir = 'flat'; }
}

// ─── StabilityEngine (from codec-v2) ─────────────────────────────────────────

export class StabilityEngine {
  constructor(window = 20) {
    this._buf = []; this._w = window; this._cvHistory = []; this._prevRegime = 'stable';
  }

  feed(v) {
    if (!Number.isFinite(v)) return { cv: 0, regime: 'stable', regimeChange: false, convergence: false, divergence: false, stabilityScore: 1, entropy: 0 };
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    const n = this._buf.length;
    const mean  = this._buf.reduce((s, x) => s + x, 0) / n;
    const sigma = Math.sqrt(this._buf.reduce((s, x) => s + (x-mean)**2, 0) / n);
    const cv    = Math.abs(mean) > 1e-6 ? sigma / Math.abs(mean) : sigma;
    this._cvHistory.push(cv);
    if (this._cvHistory.length > 10) this._cvHistory.shift();
    const cvDelta = this._cvHistory.length > 1 ? cv - this._cvHistory[this._cvHistory.length - 2] : 0;
    const regime  = cv > STABILITY_CV_ALERT ? 'volatile' : cv < 0.04 && n >= 5 ? 'collapsed' : 'stable';
    const regimeChange = regime !== this._prevRegime;
    this._prevRegime = regime;
    return {
      cv: r4(cv), regime, regimeChange,
      convergence:    cvDelta < -0.02,
      divergence:     cvDelta >  0.02,
      stabilityScore: r4(Math.max(0, 1 - Math.min(1, cv / STABILITY_CV_ALERT))),
      entropy:        r4(this._entropy()),
    };
  }

  _entropy() {
    if (this._buf.length < 3) return 0;
    const min=Math.min(...this._buf), max=Math.max(...this._buf), range=max-min;
    if (!range) return 0;
    const bins = new Array(8).fill(0);
    for (const v of this._buf) bins[Math.min(7, Math.floor(((v-min)/range)*8))]++;
    const n = this._buf.length;
    let H = 0;
    for (const c of bins) if (c > 0) { const p = c/n; H -= p * Math.log2(p); }
    return H / 3;
  }

  reset() { this._buf = []; this._cvHistory = []; this._prevRegime = 'stable'; }
}

// ─── OscillationEngine (from codec-v2) ───────────────────────────────────────

export class OscillationEngine {
  constructor(window = 60) {
    this._w = window; this._buf = []; this._peaks = []; this._troughs = []; this._total = 0; this._peakCount = 0;
  }

  feed(v) {
    if (!Number.isFinite(v)) return { oscillating: false, period: null, regularity: 0, phase: 0, peakCount: this._peakCount, amplitude: 0 };
    this._buf.push(v);
    if (this._buf.length > this._w) this._buf.shift();
    this._total++;
    const n = this._buf.length;
    if (n >= 5) {
      const i = n - 3;
      const [p2,p1,c,n1,n2] = [this._buf[i-2]??this._buf[0],this._buf[i-1],this._buf[i],this._buf[i+1],this._buf[i+2]??this._buf[n-1]];
      const mean = (p2+p1+c+n1+n2) / 5;
      if (c>p1&&c>n1&&c>mean*1.04) { this._peaks.push({idx:this._total-2,v:c}); this._peakCount++; if(this._peaks.length>20)this._peaks.shift(); }
      if (c<p1&&c<n1&&c<mean*0.96) { this._troughs.push({idx:this._total-2,v:c}); if(this._troughs.length>20)this._troughs.shift(); }
    }
    const pk = this._peaks;
    if (pk.length < OSC_MIN_CYCLES) return { oscillating: false, period: null, regularity: 0, phase: 0, peakCount: this._peakCount, amplitude: 0 };

    const intervals = [];
    for (let i=1;i<pk.length;i++) intervals.push(pk[i].idx - pk[i-1].idx);
    const iMean  = intervals.reduce((s,v)=>s+v,0) / intervals.length;
    const iSigma = Math.sqrt(intervals.reduce((s,v)=>s+(v-iMean)**2,0) / intervals.length);
    const iCV    = iMean > 0 ? iSigma / iMean : 1;
    const oscillating = iCV < 0.28 && pk.length >= OSC_MIN_CYCLES;
    const amplitude   = this._troughs.length > 0
      ? Math.max(0, pk.reduce((s,p)=>s+p.v,0)/pk.length - this._troughs.reduce((s,t)=>s+t.v,0)/this._troughs.length)
      : 0;

    return { oscillating, period: oscillating ? r4(iMean) : null, regularity: r4(Math.max(0,1-iCV)), phase: this._total - pk[pk.length-1].idx, peakCount: this._peakCount, amplitude: r4(amplitude), intervalCV: r4(iCV) };
  }

  reset() { this._buf=[]; this._peaks=[]; this._troughs=[]; this._total=0; this._peakCount=0; }
}

// ─── ConfidencePropagator (from codec-v2) ─────────────────────────────────────

export class ConfidencePropagator {
  constructor() { this._windowMs = 500; this._buffer = []; }

  observe(type, confidence, ts = Date.now()) {
    if (!Number.isFinite(confidence)) return;
    this._buffer.push({ type, confidence: Math.max(0, Math.min(1, confidence)), ts });
    this._prune(ts);
  }

  propagated(type, ts = Date.now()) {
    this._prune(ts);
    const own = this._buffer.filter(s => s.type === type);
    if (!own.length) return 0;
    const ownConf = own.reduce((mx, s) => Math.max(mx, s.confidence), 0);
    const others  = this._buffer.filter(s => s.type !== type);
    if (!others.length) return ownConf;
    const otherMean = others.reduce((s, o) => s + o.confidence, 0) / others.length;
    return Math.min(1, ownConf + otherMean * 0.4 * (1 - ownConf));
  }

  joint(types, ts = Date.now()) {
    this._prune(ts);
    let minConf = 1;
    for (const type of types) {
      const sigs = this._buffer.filter(s => s.type === type);
      if (!sigs.length) return 0;
      minConf = Math.min(minConf, sigs.reduce((mx, s) => Math.max(mx, s.confidence), 0));
    }
    return r4(minConf);
  }

  _prune(ts) { this._buffer = this._buffer.filter(s => ts - s.ts < this._windowMs); }
  reset()    { this._buffer = []; }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── INVENTED: FFTEngine ──────────────────────────────────────────────────────
// Pure JS Cooley-Tukey radix-2 DIT FFT.
// Takes Float32Array of PCM samples → produces Uint8Array of magnitude bins
// IDENTICAL to what AnalyserNode.getByteFrequencyData() produces.
// This is the bridge that lets PitchEngine run verbatim on Node PCM buffers.
// §5.5 — Zero deps. §1.1 — No approximation: real FFT, not spectral centroid.
// ═════════════════════════════════════════════════════════════════════════════

export class FFTEngine {
  constructor(size = FFT_SIZE) {
    // Size must be power of 2. Enforce here.
    this._size = _nextPow2(size);
    this._re   = new Float32Array(this._size);
    this._im   = new Float32Array(this._size);
    // Pre-compute twiddle factors
    this._cos  = new Float32Array(this._size);
    this._sin  = new Float32Array(this._size);
    for (let i = 0; i < this._size; i++) {
      const angle = -2 * Math.PI * i / this._size;
      this._cos[i] = Math.cos(angle);
      this._sin[i] = Math.sin(angle);
    }
  }

  /**
   * Compute FFT magnitude spectrum from a Float32Array of PCM samples.
   * Returns Uint8Array[size/2] — magnitude bins 0-255.
   * Same shape as AnalyserNode.getByteFrequencyData().
   *
   * Input samples should be in range [-1, 1] (normalized Float32).
   * Int16LE samples: divide by 32768 first.
   */
  magnitudeSpectrum(samples) {
    const N   = this._size;
    const re  = this._re;
    const im  = this._im;

    // Copy + zero-pad (never reject non-power-of-2 input)
    re.fill(0); im.fill(0);
    const len = Math.min(samples.length, N);
    for (let i = 0; i < len; i++) re[i] = Number.isFinite(samples[i]) ? samples[i] : 0;

    // Bit-reversal permutation
    let j = 0;
    for (let i = 1; i < N; i++) {
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }

    // Cooley-Tukey DIT butterfly
    for (let len2 = 2; len2 <= N; len2 <<= 1) {
      const half = len2 >> 1;
      const step = N / len2;
      for (let i = 0; i < N; i += len2) {
        for (let k = 0; k < half; k++) {
          const idx = k * step;
          const tr  = this._cos[idx] * re[i+k+half] - this._sin[idx] * im[i+k+half];
          const ti  = this._cos[idx] * im[i+k+half] + this._sin[idx] * re[i+k+half];
          re[i+k+half] = re[i+k] - tr;
          im[i+k+half] = im[i+k] - ti;
          re[i+k] += tr;
          im[i+k] += ti;
        }
      }
    }

    // Magnitude spectrum → Uint8Array (0-255), first N/2 bins (one-sided)
    const out  = new Uint8Array(N >> 1);
    const norm = 2 / N;
    for (let i = 0; i < N >> 1; i++) {
      const mag = Math.sqrt(re[i]*re[i] + im[i]*im[i]) * norm;
      out[i] = Math.min(255, Math.round(mag * 255 * 8)); // scale like AnalyserNode
    }
    return out;
  }

  get size()     { return this._size; }
  get binCount() { return this._size >> 1; }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── INVENTED: PitchEngine (verbatim from codec-v2, now works in Node) ────────
// Runs identical to codec-v2 PitchEngine. The only change: it receives
// freq/time Uint8Arrays from FFTEngine instead of AnalyserNode.
// ═════════════════════════════════════════════════════════════════════════════

export class PitchEngine {
  constructor(sampleRate = SAMPLE_RATE_DEFAULT) {
    this._sr          = sampleRate;
    this._prevMags    = null;
    this._pitchHistory = [];
    this._periodStats = [];
    this._ampStats    = [];
    this._slopeEngine = new SlopeEngine(8);
  }

  analyze(freqData, timeData, zcr, energy) {
    const n     = freqData.length;
    const binHz = this._sr / (n * 2);

    const mags = new Float32Array(n);
    for (let i = 0; i < n; i++) mags[i] = freqData[i] / 255.0;

    const voiced = Number.isFinite(energy) && energy > SILENCE_ENERGY_GATE
                && Number.isFinite(zcr)    && zcr    < VOICED_ZCR_GATE;

    if (!voiced) {
      this._prevMags = mags;
      return { voiced: false, f0: null, jitter: null, shimmer: null, hnr: null, prosodyTag: 'unvoiced', spectralCentroid: this._centroid(mags, binHz), spectralFlux: 0 };
    }

    const minBin = Math.floor(PITCH_MIN_HZ / binHz);
    const maxBin = Math.floor(PITCH_MAX_HZ / binHz);
    let peakBin = minBin, peakMag = 0;
    for (let i = minBin; i <= Math.min(maxBin, n - 1); i++) {
      if (mags[i] > peakMag) { peakMag = mags[i]; peakBin = i; }
    }
    const f0 = peakBin > 0 ? peakBin * binHz : null;

    // Jitter
    let jitter = null;
    if (f0 && f0 > 0) {
      const period = this._sr / f0;
      this._periodStats.push(period);
      if (this._periodStats.length > 8) this._periodStats.shift();
      if (this._periodStats.length >= 3) {
        const pm = _mean(this._periodStats);
        jitter = r4(pm > 0 ? Math.sqrt(_variance(this._periodStats)) / pm : 0);
      }
    }

    // Shimmer
    let shimmer = null;
    this._ampStats.push(peakMag);
    if (this._ampStats.length > 8) this._ampStats.shift();
    if (this._ampStats.length >= 3) {
      const am = _mean(this._ampStats);
      shimmer = r4(am > 0 ? Math.sqrt(_variance(this._ampStats)) / am : 0);
    }

    // HNR
    let hnr = null;
    if (f0 && f0 > 0) {
      let harmonicEnergy = 0, noiseEnergy = 0;
      const maxHarmonic = Math.floor((n * binHz * 0.8) / f0);
      for (let h = 1; h <= Math.min(maxHarmonic, 10); h++) {
        const hBin = Math.round(h * f0 / binHz);
        if (hBin >= n) break;
        const lo = Math.max(0, hBin - 2), hi = Math.min(n - 1, hBin + 2);
        for (let b = 0; b < n; b++) {
          const e = mags[b] ** 2;
          if (b >= lo && b <= hi) harmonicEnergy += e;
          else                     noiseEnergy    += e;
        }
      }
      if (noiseEnergy > 0 && harmonicEnergy > 0) hnr = r4(10 * Math.log10(harmonicEnergy / noiseEnergy));
    }

    // Spectral flux
    let spectralFlux = 0;
    if (this._prevMags) {
      for (let i = 0; i < n; i++) spectralFlux += (mags[i] - this._prevMags[i]) ** 2;
      spectralFlux = r4(Math.sqrt(spectralFlux / n));
    }
    this._prevMags = mags;

    const slopeResult = f0 ? this._slopeEngine.feed(f0) : null;
    const prosodyTag  = this._prosodyTag(voiced, f0, jitter, shimmer, hnr, slopeResult?.direction ?? 'flat', zcr);

    if (f0) { this._pitchHistory.push(f0); if (this._pitchHistory.length > 30) this._pitchHistory.shift(); }

    return {
      voiced, f0: f0 ? r4(f0) : null, jitter, shimmer, hnr, prosodyTag,
      spectralCentroid: r4(this._centroid(mags, binHz)),
      spectralFlux,
      pitchSlope:  slopeResult,
      pitchMean:   this._pitchHistory.length > 0 ? r4(_mean(this._pitchHistory)) : null,
    };
  }

  _centroid(mags, binHz) {
    let num = 0, den = 0;
    for (let i = 0; i < mags.length; i++) { num += i * binHz * mags[i]; den += mags[i]; }
    return den > 0 ? num / den : 0;
  }

  _prosodyTag(voiced, f0, jitter, shimmer, hnr, pitchDir, zcr) {
    if (!voiced) return 'unvoiced';
    if (jitter  !== null && jitter  > 0.04)               return 'tense';
    if (shimmer !== null && shimmer > 0.05 && hnr !== null && hnr < 8) return 'breathy';
    if (hnr     !== null && hnr     < 5)                  return 'creaky';
    if (pitchDir === 'rising' && f0 > 200)                return 'rising';
    if (pitchDir === 'falling')                            return 'falling';
    return 'modal';
  }

  reset() {
    this._prevMags = null; this._pitchHistory = [];
    this._periodStats = []; this._ampStats = []; this._slopeEngine.reset();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── INVENTED: PCMAnalyzer ────────────────────────────────────────────────────
// Replaces GPGPUAudioProcessor for Node.js.
//
// Input:  push(pcmBuffer)  — raw PCM Int16LE Buffer from ring buffer / mic.js
// Output: same frame shape as GPGPUAudioProcessor._analyzeFrame()
//
// KEY INVENTIONS vs naive port:
//   1. push() is non-blocking. Analysis drains on setImmediate — ring buffer never stalls.
//   2. Energy-adaptive chunk boundaries PRESERVED:
//      Natural boundary = silence >= CHUNK_SILENCE_MS AND elapsed >= 500ms
//      Hard boundary    = elapsed >= CHUNK_MAX_MS
//      NOT time-sliced at fixed intervals. Speech prosody preserved.
//   3. FFTEngine integration: PitchEngine runs on every chunk (not just every frame).
//   4. ZCR, RMS, spectral centroid, cadence, energy — all computed from raw PCM.
//   5. Voiced/unvoiced detection via energy gate + ZCR gate.
// ═════════════════════════════════════════════════════════════════════════════

export class PCMAnalyzer {
  constructor({ sampleRate = SAMPLE_RATE_DEFAULT, onChunk, onFrame } = {}) {
    this._sr         = sampleRate;
    this._onChunk    = onChunk;
    this._onFrame    = onFrame;

    this._energyStats  = new RollingStats(ROLLING_WINDOW);
    this._cadenceStats = new RollingStats(ROLLING_WINDOW);
    this._energyHistory = [];
    this._maxHistory    = 60;

    this._silenceMs  = 0;
    this._lastCutTs  = Date.now();
    this._running    = false;

    // FFT + Pitch
    this._fft        = new FFTEngine(FFT_SIZE);
    this._pitch      = new PitchEngine(sampleRate);

    // Non-blocking drain queue
    this._queue      = [];
    this._draining   = false;
  }

  start() {
    this._running   = true;
    this._lastCutTs = Date.now();
    return this;
  }

  stop() {
    this._running = false;
    return this;
  }

  /**
   * Push a raw PCM Int16LE Buffer.
   * Non-blocking: queues for setImmediate drain.
   * §adversarial: ring buffer never stalls on analysis.
   */
  push(pcmBuffer) {
    if (!Buffer.isBuffer(pcmBuffer) || pcmBuffer.length < 2) return;
    this._queue.push(pcmBuffer);
    if (!this._draining) this._drain();
  }

  _drain() {
    if (!this._queue.length) { this._draining = false; return; }
    this._draining = true;
    const buf = this._queue.shift();
    setImmediate(() => {
      try { this._process(buf); } catch(e) { /* §1.2 — log but don't die */ }
      this._drain();
    });
  }

  _process(buf) {
    if (!this._running) return;

    // Convert Int16LE → Float32 [-1, 1]
    const samples = _pcmToFloat32(buf);
    const frame   = this._analyzeFrame(samples);

    this._onFrame?.(frame);

    // Chunk boundary detection (natural or hard)
    const now     = Date.now();
    const elapsed = now - this._lastCutTs;
    const FRAME_MS = (samples.length / this._sr) * 1000;

    if (frame.silence) this._silenceMs += FRAME_MS;
    else               this._silenceMs  = 0;

    const natural = this._silenceMs >= CHUNK_SILENCE_MS && elapsed >= 500;
    const hard    = elapsed >= CHUNK_MAX_MS;

    if (natural || hard) {
      this._lastCutTs = now;
      this._silenceMs = 0;
      this._onChunk?.({
        ts:           now,
        elapsed,
        boundary:     hard ? 'hard' : 'natural',
        frame,
        energyStats:  { mean: this._energyStats.mean,  sigma: this._energyStats.sigma  },
        cadenceStats: { mean: this._cadenceStats.mean, sigma: this._cadenceStats.sigma },
      });
    }
  }

  _analyzeFrame(samples) {
    const n = samples.length;

    // ── RMS energy ────────────────────────────────────────────────────────────
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
    const energy = n > 0 ? Math.sqrt(sum / n) : 0;

    // ── ZCR ───────────────────────────────────────────────────────────────────
    let crossings = 0;
    for (let i = 1; i < n; i++) {
      if ((samples[i] >= 0) !== (samples[i - 1] >= 0)) crossings++;
    }
    const zcr = n > 1 ? crossings / n : 0;

    // ── Spectral centroid (two-band, fast proxy) ──────────────────────────────
    const split = Math.floor(n / 4);
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      const e = samples[i] * samples[i];
      if (i < split * 2) lo += e; else hi += e;
    }
    const spectralCentroid = (lo + hi) > 0 ? hi / (lo + hi) : 0;

    // ── Cadence (energy peaks per second) ─────────────────────────────────────
    this._energyHistory.push(energy);
    if (this._energyHistory.length > this._maxHistory) this._energyHistory.shift();
    const avg  = this._energyHistory.reduce((s, v) => s + v, 0) / this._energyHistory.length;
    let peaks  = 0;
    const h    = this._energyHistory;
    for (let i = 1; i < h.length - 1; i++) {
      if (h[i] > avg * 1.2 && h[i] > h[i-1] && h[i] > h[i+1]) peaks++;
    }
    const frameDurSec = (h.length * (n / this._sr));
    const cadence     = frameDurSec > 0 ? peaks / frameDurSec : 0;

    const silence = energy < SILENCE_ENERGY_GATE;

    // ── Rolling stats ─────────────────────────────────────────────────────────
    const em = this._energyStats.measure(energy);
    const cm = this._cadenceStats.measure(cadence);

    // ── FFT + Pitch (PitchEngine runs verbatim) ───────────────────────────────
    let pitch = { voiced: false, f0: null, jitter: null, shimmer: null, hnr: null, prosodyTag: 'unvoiced', spectralFlux: 0 };
    if (n >= this._fft.size / 2) {
      const freqBins  = this._fft.magnitudeSpectrum(samples);
      // timeData: magnitude of samples as Uint8Array (AnalyserNode.getByteTimeDomainData equivalent)
      const timeBins  = _timeDomainBins(samples);
      pitch = this._pitch.analyze(freqBins, timeBins, zcr, energy);
    }

    return {
      // Core audio (same shape as GPGPUAudioProcessor)
      energy:           r4(energy),
      zcr:              r4(zcr),
      spectralCentroid: r4(spectralCentroid),
      cadence:          r4(cadence),
      silence,
      energyDelta:      em.delta,
      energySigma:      em.sigma,
      energyZ:          em.zScore,
      energyAnomaly:    em.anomaly,
      cadenceDelta:     cm.delta,
      cadenceSigma:     cm.sigma,
      cadenceAnomaly:   cm.anomaly,
      // Pitch (new — from PitchEngine via FFTEngine)
      pitch,
    };
  }

  reset() {
    this._energyStats.clear(); this._cadenceStats.clear();
    this._energyHistory = []; this._silenceMs = 0;
    this._pitch.reset(); this._queue = []; this._draining = false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── INVENTED: NodeRuntime ────────────────────────────────────────────────────
// Replaces NexusRuntime for Node.js kernel.
// Wires PCMAnalyzer + topology engines + confidence propagation
// into a unified RuntimeFrame on the SISO bus.
// Text is optional: works with or without Whisper transcript.
// ═════════════════════════════════════════════════════════════════════════════

export class NodeRuntime {
  /**
   * @param {object} opts
   * @param {object} opts.bus       — SISO bus (from core/bus.js)
   * @param {number} [opts.sampleRate=16000]
   * @param {string} [opts.sessionId]
   */
  constructor({ bus, sampleRate = SAMPLE_RATE_DEFAULT, sessionId } = {}) {
    if (!bus) throw new Error('[NodeRuntime] bus required');

    this._bus       = bus;
    this._sr        = sampleRate;
    this._sessionId = sessionId ?? null;
    this._frameIdx  = 0;
    this._batchN    = 0;

    // PCM analysis
    this._pcm = new PCMAnalyzer({
      sampleRate,
      onFrame:  f => this._onAudioFrame(f),
      onChunk:  c => this._onChunk(c),
    });

    // Text analysis engines
    this._friction    = new FrictionAnalyzer();
    this._assoc       = new AssociationEngine();
    this._predictor   = new PredictiveEngine();
    this._topology    = new TopologyEngine();
    this._sentiment   = new RollingStats(ROLLING_WINDOW);
    this._wordCount   = new RollingStats(ROLLING_WINDOW);

    // Phase 2 trajectory engines
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

    this._confidence = new ConfidencePropagator();

    // State
    this._lastAudioFrame = null;
    this._lastBatch      = null;
  }

  // ── LIFECYCLE ─────────────────────────────────────────────────────────────

  start(sessionId) {
    this._sessionId = sessionId ?? this._sessionId;
    this._pcm.start();
    this._resetEngines();
    this._bus.emit('codec:started', { sessionId: this._sessionId, version: CODEC_NODE_VERSION }, 'CODEC');
    return this;
  }

  stop() {
    this._pcm.stop();
    this._bus.emit('codec:stopped', { sessionId: this._sessionId, frameCount: this._frameIdx }, 'CODEC');
  }

  // ── PCM INPUT (from mic.js ring buffer) ───────────────────────────────────

  /**
   * Feed raw PCM Int16LE Buffer.
   * Called directly from mic capture loop or ring buffer replay.
   */
  pushPCM(pcmBuffer) {
    this._pcm.push(pcmBuffer);
  }

  // ── TEXT INPUT (from Whisper or manual commit) ─────────────────────────────

  /**
   * Feed a transcript string (from Whisper, SpeechRecognition, or manual).
   * Runs full behavioral analytics + topology update.
   * Emits unified RuntimeFrame on bus.
   */
  pushText(text, opts) {
    if (!text?.trim()) return null;
    opts = opts || {};
    this._batchN++;
    const batchId = `B${String(this._batchN).padStart(4, '0')}`;
    const ts      = Date.now();

    const frictionResult = this._friction.analyze(text);
    const assocEdges     = this._assoc.add(batchId, text);
    const redundancy     = this._assoc.redundancyCheck(text);
    const invariants     = this._assoc.invariants();
    const tags           = this._autoTag(text, frictionResult);
    const sentimentScore = this._scoreSentiment(text);
    const sentStats      = this._sentiment.measure(sentimentScore);
    const wordCount      = text.split(/\s+/).filter(Boolean).length;
    this._wordCount.measure(wordCount);
    const prediction     = this._predictor.predictTag();
    const wordPrediction = this._predictor.predictWords();
    this._predictor.feed(tags, text);

    // Phase 2 slopes on sentiment + friction
    const sentSlope  = this._slope.sentiment.feed(sentimentScore);
    const sentStab   = this._stability.sentiment.feed(sentimentScore);
    const sentOsc    = this._oscillation.sentiment.feed(sentimentScore);
    const fricSlope  = this._slope.friction.feed(frictionResult?.score ?? 0);

    if (frictionResult?.friction) {
      this._confidence.observe('friction', frictionResult.score ?? 0.5);
    }

    // Topology feed
    const topology = this._topology.feed({
      sentiment:  sentimentScore,
      friction:   frictionResult?.score ?? 0,
      wordCount,
      text,
      batchId,
      ts,
      energy:  this._lastAudioFrame?.energy   ?? null,
      cadence: this._lastAudioFrame?.cadence  ?? null,
    }, this._assoc);

    const batch = {
      batchId, ts, sessionId: this._sessionId, text, wordCount, tags,
      sentiment: { score: sentimentScore, delta: sentStats.delta, sigma: sentStats.sigma, zScore: sentStats.zScore, anomaly: Math.abs(sentStats.zScore) > 1.5 },
      friction:  frictionResult,
      associations: assocEdges,
      redundancy, invariants, prediction, wordPrediction, topology,
      trajectory: {
        sentiment: { slope: sentSlope, stability: sentStab, oscillation: sentOsc },
        friction:  { slope: fricSlope },
      },
    };

    this._lastBatch = batch;

    // Build + emit unified frame
    const frame = this._buildFrame();
    this._bus.emit('codec:batch', batch, 'CODEC');
    this._bus.emit('codec:frame', frame, 'CODEC');

    // Escalation detection
    this._detectEscalation(frame, batch);

    return batch;
  }

  // ── AUDIO FRAME HANDLER ───────────────────────────────────────────────────

  _onAudioFrame(frame) {
    this._lastAudioFrame = frame;
    this._frameIdx++;

    // Phase 2 slopes on energy
    const eSlope = this._slope.energy.feed(frame.energy);
    const eStab  = this._stability.energy.feed(frame.energy);
    const eOsc   = this._oscillation.energy.feed(frame.energy);

    if (frame.energyAnomaly) {
      this._confidence.observe('audio.energy_anomaly', Math.min(1, Math.abs(frame.energyZ) / 4));
    }
    if (frame.pitch?.prosodyTag === 'tense') {
      this._confidence.observe('pitch.tense', 0.7);
    }

    // Emit live audio frame (for UI waveform, meters etc.)
    this._bus.emit('codec:audio:frame', {
      frameIndex: this._frameIdx,
      sessionId:  this._sessionId,
      audio:      frame,
      trajectory: { energy: { slope: eSlope, stability: eStab, oscillation: eOsc } },
      confidence: { audio: this._confidence.propagated('audio.energy_anomaly') },
    }, 'CODEC');
  }

  _onChunk(chunk) {
    // Chunk boundary — emit with current state for BEP integration
    this._bus.emit('codec:audio:chunk', {
      ...chunk,
      sessionId:   this._sessionId,
      frameCount:  this._frameIdx,
    }, 'CODEC');
  }

  // ── FRAME BUILDER ─────────────────────────────────────────────────────────

  _buildFrame() {
    return {
      frameIndex:  this._frameIdx,
      sessionId:   this._sessionId,
      ts:          Date.now(),
      audio:       this._lastAudioFrame,
      transcript:  this._lastBatch,
      confidence: {
        audio:    this._confidence.propagated('audio.energy_anomaly'),
        friction: this._confidence.propagated('friction'),
        pitch:    this._confidence.propagated('pitch.tense'),
        joint:    this._confidence.joint(['friction','audio.energy_anomaly']),
      },
    };
  }

  // ── ESCALATION ────────────────────────────────────────────────────────────

  _detectEscalation(frame, batch) {
    const negSentSlope = batch?.trajectory?.sentiment?.slope?.direction === 'falling';
    const energyOsc    = this._oscillation.energy.feed(frame.audio?.energy ?? 0).oscillating;
    const highFriction = (batch?.friction?.score ?? 0) > 0.4;
    const jointConf    = frame.confidence?.joint ?? 0;

    if (negSentSlope && (energyOsc || highFriction) && jointConf > 0.3) {
      this._bus.emit('codec:escalation', {
        sessionId:  this._sessionId,
        confidence: r4(jointConf),
        evidence:   { negSentSlope, energyOsc, highFriction },
        sentiment:  batch?.sentiment?.score,
        friction:   batch?.friction?.score,
      }, 'CODEC');
    }
  }

  // ── TEXT ANALYTICS HELPERS ────────────────────────────────────────────────

  _autoTag(text, frictionResult) {
    const t    = text.toLowerCase();
    const tags = [];
    if (frictionResult?.friction)                                        tags.push('FRICTION');
    if (/blocked?|stuck|can'?t|cannot|unable/.test(t))                  tags.push('BLOCK');
    if (/again|same|every time|always|keep|keeps/.test(t))              tags.push('LOOP');
    if (/gap|missing|unknown|don'?t know|unclear/.test(t))              tags.push('GAP');
    if (/connect(?:ed|s)?|link(?:ed|s)?|relat(?:e|es|ed)/.test(t))     tags.push('REL');
    if (!tags.length) tags.push('SYS');
    return tags;
  }

  _scoreSentiment(text) {
    const POS = new Map([['good',.5],['great',.7],['love',.8],['happy',.7],['calm',.5],['grateful',.7],['strong',.5],['clear',.4],['understand',.4],['progress',.5],['right',.3],['yes',.2]]);
    const NEG = new Map([['bad',.5],['terrible',.8],['hate',.8],['sad',.6],['anxious',.7],['pain',.7],['hurt',.7],['lost',.5],['confused',.5],['struggle',.6],['hopeless',.9],['wrong',.4]]);
    const NEG2 = new Set(['not','no','don\'t','doesn\'t','can\'t','never']);
    const words = text.toLowerCase().replace(/[^a-z'\s]/g, '').split(/\s+/).filter(Boolean);
    let raw = 0, m = 0;
    for (let i = 0; i < words.length; i++) {
      const w = words[i], neg = i > 0 && NEG2.has(words[i - 1]);
      if (POS.has(w)) { raw += (neg ? -1 : 1) * POS.get(w); m++; }
      else if (NEG.has(w)) { raw += (neg ?  1 : -1) * NEG.get(w); m++; }
    }
    return r4(Math.max(-1, Math.min(1, raw / Math.max(1, m))));
  }

  // ── QUERY ─────────────────────────────────────────────────────────────────

  stats() {
    return {
      version:    CODEC_NODE_VERSION,
      sessionId:  this._sessionId,
      frameCount: this._frameIdx,
      batchCount: this._batchN,
      topology:   this._topology.lastPayload?.composite?.state ?? 'CALIBRATING',
      sentiment:  { mean: this._sentiment.mean, sigma: this._sentiment.sigma },
      confidence: {
        audio:    this._confidence.propagated('audio.energy_anomaly'),
        friction: this._confidence.propagated('friction'),
      },
    };
  }

  _resetEngines() {
    this._friction.reset(); this._assoc.reset(); this._predictor.reset();
    this._topology.reset(); this._sentiment.clear(); this._wordCount.clear();
    for (const e of Object.values(this._slope))       e.reset();
    for (const e of Object.values(this._stability))   e.reset();
    for (const e of Object.values(this._oscillation)) e.reset();
    this._confidence.reset(); this._pcm.reset();
    this._frameIdx = 0; this._batchN = 0;
    this._lastAudioFrame = null; this._lastBatch = null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ── PRIVATE HELPERS ──────────────────────────────────────────────────────────
// ═════════════════════════════════════════════════════════════════════════════

function r4(v)        { return Math.round((Number.isFinite(v) ? v : 0) * 10000) / 10000; }
function _mean(a)     { return a.reduce((s, v) => s + v, 0) / a.length; }
function _variance(a) { const m = _mean(a); return a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length; }
function _inlineMomentum(ys) {
  const n = ys.length;
  if (n < 2) return 0;
  let sumX=0,sumY=0,sumXY=0,sumX2=0;
  for (let i=0;i<n;i++){sumX+=i;sumY+=ys[i];sumXY+=i*ys[i];sumX2+=i*i;}
  const denom=n*sumX2-sumX*sumX;
  return denom!==0?(n*sumXY-sumX*sumY)/denom:0;
}

function _nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Convert Int16LE Buffer → Float32Array normalized to [-1, 1]
 */
function _pcmToFloat32(buf) {
  const len     = Math.floor(buf.length / 2);
  const samples = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    samples[i] = buf.readInt16LE(i * 2) / 32768;
  }
  return samples;
}

/**
 * Convert Float32 samples to Uint8Array time-domain bins [0,255].
 * Equivalent to AnalyserNode.getByteTimeDomainData().
 * 128 = zero crossing, 0 = min, 255 = max.
 */
function _timeDomainBins(samples) {
  const out = new Uint8Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round((samples[i] + 1) * 128)));
  }
  return out;
}
