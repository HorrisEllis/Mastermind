// ═══════════════════════════════════════════════════════════════════
// RHEON VOICE v7 — codec-engines.js
// All codec-v2 analytics engines: RollingStats, FrictionAnalyzer,
// AssociationEngine, PredictiveEngine, InvariantBaseline,
// PolarityEngine, TopologyEngine + scoreSentiment helper.
//
// Ported from ESM codec.js → plain var-scoped, no imports.
// All classes use prototypal inheritance for v7 compatibility.
// ═══════════════════════════════════════════════════════════════════

// ── CONSTANTS ─────────────────────────────────────────────────────
var ROLLING_WINDOW      = 20;
var DECAY_HALFLIFE      = 10;
var ENERGY_SIGMA_ALERT  = 2.0;
var HEURISTIC_PROMOTE   = 3;
var ASSOC_MIN_CHARS     = 4;
var INVARIANT_THRESHOLD = 0.80;
var TOPOLOGY_WARMUP_N   = 5;
var COMPOSITE_ALERT_Z   = 2.0;
var POLARITY_FLIP_THRESHOLD = 0.20;
var POLARITY_WINDOW     = 20;

// ── ROLLING STATS ─────────────────────────────────────────────────
function RollingStats(windowSize) {
  this._w    = windowSize || ROLLING_WINDOW;
  this._buf  = [];
  this._sum  = 0;
  this._sum2 = 0;
}
RollingStats.prototype.push = function(v) {
  if (this._buf.length >= this._w) {
    var old = this._buf.shift();
    this._sum  -= old;
    this._sum2 -= old * old;
  }
  this._buf.push(v);
  this._sum  += v;
  this._sum2 += v * v;
  return this;
};
Object.defineProperty(RollingStats.prototype, 'mean', {
  get: function() { return this._buf.length ? this._sum / this._buf.length : 0; }
});
Object.defineProperty(RollingStats.prototype, 'variance', {
  get: function() {
    var n = this._buf.length;
    if (n < 2) return 0;
    return Math.max(0, this._sum2 / n - Math.pow(this._sum / n, 2));
  }
});
Object.defineProperty(RollingStats.prototype, 'sigma', {
  get: function() { return Math.sqrt(this.variance); }
});
Object.defineProperty(RollingStats.prototype, 'last', {
  get: function() { return this._buf.length ? this._buf[this._buf.length - 1] : 0; }
});
Object.defineProperty(RollingStats.prototype, 'len', {
  get: function() { return this._buf.length; }
});
RollingStats.prototype.zScore = function(v) {
  return this.sigma > 0 ? (v - this.mean) / this.sigma : 0;
};
RollingStats.prototype.measure = function(v) {
  var prev = this.last;
  this.push(v);
  return {
    mean:    this.mean,
    sigma:   this.sigma,
    delta:   v - prev,
    zScore:  this.zScore(v),
    anomaly: Math.abs(this.zScore(v)) > ENERGY_SIGMA_ALERT
  };
};
RollingStats.prototype.clear = function() {
  this._buf = []; this._sum = 0; this._sum2 = 0;
};
RollingStats.prototype.decayMean = function() {
  if (!this._buf.length) return 0;
  var lambda = Math.LN2 / DECAY_HALFLIFE;
  var ws = 0, wt = 0, n = this._buf.length;
  for (var i = 0; i < n; i++) {
    var age = n - 1 - i, w = Math.exp(-lambda * age);
    ws += this._buf[i] * w; wt += w;
  }
  return wt > 0 ? ws / wt : 0;
};
RollingStats.prototype.entropy = function() {
  if (this._buf.length < 3) return 0;
  var min = Math.min.apply(null, this._buf), max = Math.max.apply(null, this._buf);
  var range = max - min;
  if (range === 0) return 0;
  var bins = new Array(10).fill(0);
  for (var i = 0; i < this._buf.length; i++) {
    bins[Math.min(9, Math.floor(((this._buf[i] - min) / range) * 10))]++;
  }
  var H = 0, n = this._buf.length;
  for (var j = 0; j < 10; j++) {
    if (bins[j] > 0) { var p = bins[j] / n; H -= p * Math.log2(p); }
  }
  return H / Math.log2(10);
};

// ── FRICTION ANALYZER ─────────────────────────────────────────────
var FRICTION_DISFLUENCY = new Set(['uh','uhh','uhhh','um','umm','ummm','er','err','ah','ahh','hm','hmm','hmmm','mm','mmm']);
var FRICTION_CATS = {
  filler:      [/\blike\b(?!\s+to\b|\s+a\b|\s+the\b)/,/\byou\s+know\b/,/\bi\s+mean\b/,/\bsort\s+of\b/,/\bkind\s+of\b/,/\bbasically\b/,/\bactually\b.*\bactually\b/,/\bright\?\s*right\?/],
  memoryGap:   [/i\s+can'?t\s+remember/,/what\s+was\s+it/,/i\s+forget/,/i\s+forgot/,/what'?s\s+the\s+word/,/i\s+don'?t\s+recall/],
  cognitiveLoad:[/\bwait\b/,/\bhold\s+on\b/,/\blet\s+me\s+think\b/,/\bjust\s+a\s+second\b/,/\bwhere\s+was\s+i\b/],
  tension:     [/i\s+don'?t\s+know\s+(?:how|what|why|if)/,/i'?m\s+not\s+sure/,/it'?s\s+hard\s+to\s+say/,/i\s+can'?t\s+explain/,/tired/,/exhausted/],
  denial:      [/it'?s\s+not\s+that/,/i'?m\s+not\s+saying/,/that'?s\s+not\s+what\s+i/,/i\s+didn'?t\s+mean/,/not\s+my\s+fault/]
};

function FrictionAnalyzer() {
  this._rolling = new RollingStats(30);
  this._counts  = {};
}
FrictionAnalyzer.prototype.analyze = function(text) {
  if (!text) return null;
  var lower = text.toLowerCase(), words = lower.split(/\s+/).filter(Boolean), found = [];
  for (var i = 0; i < words.length; i++) {
    if (FRICTION_DISFLUENCY.has(words[i])) found.push({ type: 'disfluency', marker: words[i] });
  }
  for (var cat in FRICTION_CATS) {
    var patterns = FRICTION_CATS[cat];
    for (var j = 0; j < patterns.length; j++) {
      if (patterns[j].test(lower)) {
        var m = lower.match(patterns[j]);
        found.push({ type: cat, marker: m ? m[0] : cat });
        this._counts[cat] = (this._counts[cat] || 0) + 1;
      }
    }
  }
  var density = words.length > 0 ? found.length / words.length : 0;
  var stats   = this._rolling.measure(density);
  var promoted = [];
  for (var k in this._counts) {
    if (this._counts[k] === HEURISTIC_PROMOTE) promoted.push({ pattern: k, count: this._counts[k] });
  }
  var types = [];
  var seen  = {};
  for (var fi = 0; fi < found.length; fi++) {
    if (!seen[found[fi].type]) { seen[found[fi].type] = 1; types.push(found[fi].type); }
  }
  return {
    friction:  found.length > 0,
    markers:   found,
    types:     types,
    score:     Math.min(1, found.length / 3),
    density:   Math.round(density * 1000) / 1000,
    stats:     stats,
    promoted:  promoted
  };
};
FrictionAnalyzer.prototype.reset = function() { this._rolling.clear(); this._counts = {}; };

// ── ASSOCIATION ENGINE ─────────────────────────────────────────────
var CODEC_SW = new Set(['the','and','for','that','this','with','from','have','been','were','they','their','there','what','when','which','will','would','could','should','about','into','than','then','your','more','also','some','just','like','over','such','these','those','very','here','each','both','only','after','before','other','first','well','its','our','all','any','who','how','but','not','are','was','can','does','did','has','had','him','her','his','she','too','get','got','let','may','off','yet']);

function AssociationEngine() {
  this._nodes    = [];
  this._edges    = [];
  this._ngrams   = {};
  this._invCache = null;
}
AssociationEngine.prototype._contentWords = function(text) {
  return text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(function(w) {
    return w.length >= ASSOC_MIN_CHARS && !CODEC_SW.has(w);
  });
};
AssociationEngine.prototype._jaccard = function(a, b) {
  if (!a.length || !b.length) return 0;
  var setA = {}, inter = 0;
  for (var i = 0; i < a.length; i++) setA[a[i]] = 1;
  for (var j = 0; j < b.length; j++) { if (setA[b[j]]) inter++; }
  var union = Object.keys(setA).length + b.length - inter;
  return union > 0 ? inter / union : 0;
};
AssociationEngine.prototype.add = function(id, text) {
  var words    = this._contentWords(text);
  var node     = { id: id, words: words, text: text, ts: Date.now() };
  var newEdges = [];
  for (var i = 0; i < this._nodes.length; i++) {
    var score = this._jaccard(words, this._nodes[i].words);
    if (score > 0) {
      var wordSet = {};
      for (var wi = 0; wi < this._nodes[i].words.length; wi++) wordSet[this._nodes[i].words[wi]] = 1;
      var shared  = words.filter(function(w) { return wordSet[w]; });
      newEdges.push({ a: id, b: this._nodes[i].id, score: Math.round(score * 1000) / 1000, words: shared });
    }
  }
  this._nodes.push(node);
  for (var j = 0; j < newEdges.length; j++) this._edges.push(newEdges[j]);
  this._updateNgrams(text);
  this._invCache = null;
  return newEdges;
};
AssociationEngine.prototype.redundancyCheck = function(text) {
  var lower   = text.toLowerCase(), trigrams = this._extractNgrams(lower, 3), hits = [];
  for (var i = 0; i < trigrams.length; i++) {
    if ((this._ngrams[trigrams[i]] || 0) >= 2) hits.push(trigrams[i]);
  }
  return { redundant: hits.length > 0, phrases: hits };
};
AssociationEngine.prototype.invariants = function() {
  if (this._invCache) return this._invCache;
  if (this._nodes.length < 3) return { words: [], threshold: INVARIANT_THRESHOLD };
  var freq = {};
  for (var i = 0; i < this._nodes.length; i++) {
    for (var j = 0; j < this._nodes[i].words.length; j++) {
      var w = this._nodes[i].words[j];
      freq[w] = (freq[w] || 0) + 1;
    }
  }
  var thresh = this._nodes.length * INVARIANT_THRESHOLD;
  var words  = Object.keys(freq).filter(function(w) { return freq[w] >= thresh; });
  this._invCache = { words: words, threshold: INVARIANT_THRESHOLD, nodeCount: this._nodes.length };
  return this._invCache;
};
AssociationEngine.prototype._updateNgrams = function(text) {
  var grams = this._extractNgrams(text.toLowerCase(), 3);
  for (var i = 0; i < grams.length; i++) {
    this._ngrams[grams[i]] = (this._ngrams[grams[i]] || 0) + 1;
  }
};
AssociationEngine.prototype._extractNgrams = function(text, n) {
  var words = text.split(/\s+/).filter(function(w) { return w.length > 2; }), grams = [];
  for (var i = 0; i <= words.length - n; i++) grams.push(words.slice(i, i + n).join(' '));
  return grams;
};
AssociationEngine.prototype.reset = function() { this._nodes = []; this._edges = []; this._ngrams = {}; this._invCache = null; };

// ── PREDICTIVE ENGINE ──────────────────────────────────────────────
function PredictiveEngine() {
  this._tagSeq      = [];
  this._transitions = {};
  this._wordTrigrams= {};
  this._wordHistory = [];
}
PredictiveEngine.prototype.feed = function(tags, text) {
  var primary = tags[0] || 'SYS';
  this._tagSeq.push(primary);
  this._updateTransitions(primary);
  var words = text.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(function(w) { return w.length > 3; });
  for (var i = 0; i < words.length; i++) this._wordHistory.push(words[i]);
  if (this._wordHistory.length > 200) this._wordHistory = this._wordHistory.slice(-200);
  this._updateWordTrigrams(words);
};
PredictiveEngine.prototype.predictTag = function() {
  if (this._tagSeq.length < 5) return null;
  var prev = this._tagSeq[this._tagSeq.length - 1], prefix = prev + '→';
  var candidates = {}, total = 0;
  for (var k in this._transitions) {
    if (k.indexOf(prefix) === 0) {
      var next = k.slice(prefix.length);
      candidates[next] = this._transitions[k];
      total += this._transitions[k];
    }
  }
  if (!total) return null;
  var probs = Object.keys(candidates)
    .map(function(tag) { return { tag: tag, p: Math.round(candidates[tag] / total * 100) / 100 }; })
    .sort(function(a, b) { return b.p - a.p; });
  return { predicted: probs[0] ? probs[0].tag : null, distribution: probs, basis: this._tagSeq.length + ' transitions' };
};
PredictiveEngine.prototype.predictWords = function() {
  if (this._wordHistory.length < 10) return null;
  var last2 = this._wordHistory.slice(-2).join(' '), prefix = last2 + ' ';
  var candidates = {}, total = 0;
  for (var k in this._wordTrigrams) {
    if (k.indexOf(prefix) === 0) {
      var next = k.slice(prefix.length);
      candidates[next] = this._wordTrigrams[k];
      total += this._wordTrigrams[k];
    }
  }
  if (!total) return null;
  var top = Object.keys(candidates)
    .sort(function(a, b) { return candidates[b] - candidates[a]; })
    .slice(0, 3)
    .map(function(word) { return { word: word, p: Math.round(candidates[word] / total * 100) / 100 }; });
  return { predicted: top[0] ? top[0].word : null, top3: top };
};
PredictiveEngine.prototype._updateTransitions = function(tag) {
  if (this._tagSeq.length < 2) return;
  var prev = this._tagSeq[this._tagSeq.length - 2];
  var key  = prev + '→' + tag;
  this._transitions[key] = (this._transitions[key] || 0) + 1;
};
PredictiveEngine.prototype._updateWordTrigrams = function(words) {
  for (var i = 0; i < words.length - 2; i++) {
    var key = words.slice(i, i + 3).join(' ');
    this._wordTrigrams[key] = (this._wordTrigrams[key] || 0) + 1;
  }
};
PredictiveEngine.prototype.reset = function() {
  this._tagSeq = []; this._transitions = {}; this._wordTrigrams = {}; this._wordHistory = [];
};

// ── INVARIANT BASELINE ─────────────────────────────────────────────
function InvariantBaseline(warmupN) {
  this._warmupN  = warmupN || TOPOLOGY_WARMUP_N;
  this._batches  = [];
  this._baseline = null;
  this._locked   = false;
  this._wordMap  = {};
}
InvariantBaseline.prototype.feed = function(signals, assocEngine) {
  if (!this._locked) {
    this._batches.push(signals);
    if (this._batches.length >= this._warmupN) this._lock();
    else return { locked: false, warmupProgress: this._batches.length / this._warmupN };
  }
  var axes   = ['sentiment','friction','wordCount','energy','cadence'];
  var zScores = {}, sumZ2 = 0, count = 0;
  for (var ai = 0; ai < axes.length; ai++) {
    var ax = axes[ai], v = signals[ax];
    if (v === null || v === undefined) { zScores[ax] = null; continue; }
    var b  = this._baseline[ax];
    var z  = b.sigma > 0 ? (v - b.mean) / b.sigma : 0;
    zScores[ax] = Math.round(z * 1000) / 1000;
    sumZ2 += z * z; count++;
  }
  var compositeZ = count > 0 ? Math.round(Math.sqrt(sumZ2 / count) * 1000) / 1000 : 0;
  var alert      = compositeZ >= COMPOSITE_ALERT_Z;

  // Word-level signal lift
  if (assocEngine) {
    var invWords = (assocEngine.invariants().words || []);
    var sigAxes  = ['energy','friction','sentiment'];
    for (var wi = 0; wi < invWords.length; wi++) {
      var word = invWords[wi];
      if (!this._wordMap[word]) {
        var buckets = {};
        for (var si = 0; si < sigAxes.length; si++) {
          buckets[sigAxes[si]] = { present: new RollingStats(10), absent: new RollingStats(10) };
        }
        this._wordMap[word] = buckets;
      }
      var isPresent = (signals.text || '').toLowerCase().indexOf(word) > -1;
      var bucket = this._wordMap[word];
      for (var bi = 0; bi < sigAxes.length; bi++) {
        var lax = sigAxes[bi], val = signals[lax];
        if (val !== null && val !== undefined) {
          (isPresent ? bucket[lax].present : bucket[lax].absent).push(val);
        }
      }
    }
  }
  var wordLifts = {};
  for (var wrd in this._wordMap) {
    wordLifts[wrd] = {};
    ['energy','friction','sentiment'].forEach(function(lax) {
      wordLifts[wrd][lax] = Math.round(
        (this._wordMap[wrd][lax].present.mean - this._wordMap[wrd][lax].absent.mean) * 1000) / 1000;
    }, this);
  }
  return { locked: true, baseline: this._baseline, zScores: zScores, compositeZ: compositeZ, alert: alert, wordLifts: wordLifts };
};
InvariantBaseline.prototype._lock = function() {
  var axes = ['sentiment','friction','wordCount','energy','cadence'];
  var raw  = {};
  for (var i = 0; i < axes.length; i++) {
    var ax   = axes[i];
    var vals = this._batches.map(function(b) { return b[ax]; }).filter(function(v) { return v !== null && v !== undefined; });
    if (!vals.length) { raw[ax] = { mean: 0, sigma: 0, n: 0 }; continue; }
    var mean  = vals.reduce(function(s, v) { return s + v; }, 0) / vals.length;
    var sigma = Math.sqrt(vals.reduce(function(s, v) { return s + (v - mean) * (v - mean); }, 0) / vals.length);
    raw[ax] = { mean: Math.round(mean * 1e4) / 1e4, sigma: Math.round(sigma * 1e4) / 1e4, n: vals.length };
  }
  this._baseline = raw;
  this._locked   = true;
};
InvariantBaseline.prototype.reset = function() { this._batches = []; this._baseline = null; this._locked = false; this._wordMap = {}; };

// ── POLARITY ENGINE ────────────────────────────────────────────────
function PolarityEngine() {
  this._history   = [];
  this._flips     = [];
  this._lastLabel = 'neutral';
}
PolarityEngine.prototype.feed = function(sentiment, batchN, ts) {
  this._history.push(sentiment);
  var n    = this._history.length;
  var win  = this._history.slice(-POLARITY_WINDOW);
  var rollingMean = win.reduce(function(s, v) { return s + v; }, 0) / win.length;
  var label;
  if (rollingMean >  POLARITY_FLIP_THRESHOLD) label = 'positive';
  else if (rollingMean < -POLARITY_FLIP_THRESHOLD) label = 'negative';
  else label = 'neutral';
  if (label !== this._lastLabel && label !== 'neutral') {
    this._flips.push({ fromPolarity: this._lastLabel, toPolarity: label, batchN: batchN, ts: ts });
  }
  if (label !== 'neutral') this._lastLabel = label;
  var sessionArc = 'stable';
  if (n >= 4) {
    var q = Math.max(1, Math.floor(n / 4));
    var firstQ = this._history.slice(0, q).reduce(function(s,v){return s+v;},0)/q;
    var lastQ  = this._history.slice(-q).reduce(function(s,v){return s+v;},0)/q;
    var diff   = lastQ - firstQ;
    if (diff > 0.15) sessionArc = 'improving'; else if (diff < -0.15) sessionArc = 'declining';
  }
  var pos = 0, neg = 0;
  for (var i = 0; i < this._history.length; i++) {
    if (this._history[i] > 0) pos++; else if (this._history[i] < 0) neg++;
  }
  var cum = this._history.reduce(function(s,v){return s+v;},0);
  // OLS momentum
  var ys = this._history.slice(-8), mn = ys.length, mom = 0;
  if (mn >= 2) {
    var sX=0,sY=0,sXY=0,sX2=0;
    for (var j=0;j<mn;j++){sX+=j;sY+=ys[j];sXY+=j*ys[j];sX2+=j*j;}
    var d=mn*sX2-sX*sX; if(d!==0) mom=(mn*sXY-sX*sY)/d;
  }
  return {
    rollingMean:  Math.round(rollingMean * 1e4) / 1e4,
    label:        label,
    sessionArc:   sessionArc,
    dominant:     pos > neg ? 'positive' : neg > pos ? 'negative' : 'neutral',
    polarization: Math.round(Math.abs(cum) / n * 1e4) / 1e4,
    momentum:     Math.round(mom * 1e4) / 1e4,
    flipCount:    this._flips.length,
    flips:        this._flips,
    batchCount:   n
  };
};
PolarityEngine.prototype.reset = function() { this._history = []; this._flips = []; this._lastLabel = 'neutral'; };

// ── TOPOLOGY ENGINE ────────────────────────────────────────────────
function TopologyEngine(warmupN) {
  this._baseline   = new InvariantBaseline(warmupN);
  this._polarity   = new PolarityEngine();
  this._batchN     = 0;
  this.lastPayload = null;
}
TopologyEngine.prototype.feed = function(signals, assocEngine) {
  this._batchN++;
  var baselineResult = this._baseline.feed(signals, assocEngine);
  if (!baselineResult.locked) {
    var payload = {
      baseline:  baselineResult,
      polarity:  null,
      composite: { state: 'CALIBRATING', evidence: ['warmup ' + this._batchN + '/' + TOPOLOGY_WARMUP_N] }
    };
    this.lastPayload = payload;
    return payload;
  }
  var polarityResult = this._polarity.feed(
    signals.sentiment || 0, this._batchN, signals.ts || Date.now()
  );
  var evidence = [], state = 'STABLE';
  if (baselineResult.alert) {
    state = 'BASELINE_ALERT';
    var zs  = baselineResult.zScores;
    var top = Object.keys(zs)
      .filter(function(ax) { return zs[ax] !== null && Math.abs(zs[ax]) >= COMPOSITE_ALERT_Z; })
      .sort(function(a, b) { return Math.abs(zs[b]) - Math.abs(zs[a]); })
      .slice(0, 3)
      .map(function(ax) { return ax + ' ' + (zs[ax] > 0 ? '+' : '') + zs[ax] + 'σ'; });
    evidence.push('compositeZ=' + baselineResult.compositeZ);
    for (var i = 0; i < top.length; i++) evidence.push(top[i]);
  } else if (polarityResult.label !== 'neutral' && Math.abs(polarityResult.rollingMean) > 0.35) {
    state = 'POLARIZED';
    evidence.push('polarity=' + polarityResult.label, 'mean=' + polarityResult.rollingMean);
  } else {
    evidence.push('compositeZ=' + baselineResult.compositeZ, 'polarity=' + polarityResult.label);
  }
  var payload = { baseline: baselineResult, polarity: polarityResult, composite: { state: state, evidence: evidence } };
  this.lastPayload = payload;
  return payload;
};
TopologyEngine.prototype.reset = function() {
  this._baseline.reset(); this._polarity.reset(); this._batchN = 0; this.lastPayload = null;
};

// ── SENTIMENT SCORER ───────────────────────────────────────────────
var SENT_POS  = {good:.5,great:.7,love:.8,happy:.7,calm:.5,grateful:.7,strong:.5,yes:.2,clear:.4,understand:.4,progress:.5,right:.3,confident:.6,hopeful:.5,excited:.6,peaceful:.5};
var SENT_NEG  = {bad:.5,terrible:.8,hate:.8,sad:.6,anxious:.7,pain:.7,hurt:.7,lost:.5,confused:.5,struggle:.6,hopeless:.9,alone:.6,wrong:.4,afraid:.7,frustrated:.6,overwhelmed:.7,stuck:.5};
var SENT_NEG2 = new Set(['not','no',"don't","doesn't","can't","never","won't"]);

function scoreSentiment(text) {
  var words = text.toLowerCase().replace(/[^a-z'\s]/g, '').split(/\s+/).filter(Boolean);
  var raw = 0, m = 0;
  for (var i = 0; i < words.length; i++) {
    var w   = words[i];
    var neg = i > 0 && SENT_NEG2.has(words[i-1]);
    if (SENT_POS[w] !== undefined) { raw += (neg ? -1 : 1) * SENT_POS[w]; m++; }
    else if (SENT_NEG[w] !== undefined) { raw += (neg ? 1 : -1) * SENT_NEG[w]; m++; }
  }
  return Math.round(Math.max(-1, Math.min(1, raw / Math.max(1, m))) * 1e4) / 1e4;
}
