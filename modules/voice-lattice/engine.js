// ═══════════════════════════════════════════════════════════════════
// VOICE LATTICE — ENGINE — modules/voice-lattice/engine.js
// v1.0.0
//
// Verbatim port of the proven engines from rheon-voice-v7 (the last
// and richest generation of the standalone prototype; v3–v6 were
// earlier supersets-in-progress of the same machinery). Pure logic —
// no DOM, no SpeechRecognition dependency. Speech capture lives in
// ui.js; these engines work on ANY text, which is the point: the same
// associative substrate can run over spoken utterances, canvas node
// bodies, ALM externalize entries, and Horizon end-states. One engine,
// every surface.
//
// The five engines:
//   AssociationEngine — Jaccard similarity over content words →
//     automatic weighted edges between utterances; trigram redundancy
//     detection; invariant extraction (words recurring across ≥80% of
//     everything said = persistent themes)
//   FrictionAnalyzer  — disfluency + friction-category detection with
//     rolling stats and heuristic promotion at 3 hits
//   PredictiveEngine  — Markov transitions over tag sequences
//   slopeEngine       — OLS regression over a value series
//   stabilityEngine   — sigma regimes (via RollingStats)
// ═══════════════════════════════════════════════════════════════════

'use strict';

// ── Tunables (v7 values, unchanged) ────────────────────────────────
const VL_ROLLING_WINDOW      = 20;
const VL_DECAY_HALFLIFE      = 10;
const VL_ENERGY_SIGMA_ALERT  = 2.0;
const VL_HEURISTIC_PROMOTE   = 3;
const VL_ASSOC_MIN_CHARS     = 4;
const VL_INVARIANT_THRESHOLD = 0.80;

// Stopwords — the codec set from v7
const VL_STOPWORDS = new Set(['the','and','for','that','this','with','from','have','been','were','they','their','there','what','when','which','will','would','could','should','about','into','than','then','your','more','also','some','just','like','over','such','these','those','very','here','each','both','only','after','before','other','first','well','its','our','all','any','who','how','but','not','are','was','can','does','did','has','had','him','her','his','she','too','get','got','let','may','off','yet']);

// ── Speech-tuned additions ────────────────────────────────────────────────
// The list above is a WRITTEN-English stopword list. Spoken thinking has a
// different filler vocabulary — "keep", "think", "thing", "want", "really",
// "actually", "kind of", "sort of" — none of which appear in it, and all of
// which are among the most frequent words in someone talking through a
// problem.
//
// Measured on ten realistic spoken sentences: without these, the words doing
// the linking were `hard, part, want, something`. With them, the surviving
// links were on `hard, people, vault` — the same number of edges, carried by
// words that actually mean something. Removing filler also RAISES Jaccard on
// genuine overlaps, because the denominator shrinks.
const VL_SPEECH_STOPWORDS = [
  'keep','keeps','think','thinks','thinking','thought','thing','things',
  'want','wants','wanted','really','actually','know','knows','knowing',
  'going','goes','gone','maybe','something','anything','everything','nothing',
  'stuff','kind','sort','mean','means','meant','guess','right','okay','yeah',
  'gonna','wanna','kinda','sorta','basically','literally','probably',
  'definitely','obviously','always','never','still','even','much','many',
  'make','makes','made','making','take','takes','took','taking',
  'need','needs','needed','feel','feels','felt','feeling',
  'look','looks','looked','looking','come','comes','came','coming',
  'back','down','away','around','because','though','while','where',
  'being','doing','done','said','says','saying','tell','tells','told',
  'talk','talks','talking','trying','tried','start','starts','started',
  'time','times','part','parts','next','last','same','good','best',
  'better','little','way','ways','one','two','now','why','yes','put',
];
for (const w of VL_SPEECH_STOPWORDS) VL_STOPWORDS.add(w);

function vleTok(t) {
  return String(t || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
}
function vleSigTok(t) {
  return vleTok(t).filter(w => w.length > 3 && !VL_STOPWORDS.has(w));
}

// ── RollingStats — windowed mean/sigma/z-score/entropy ─────────────
class VLRollingStats {
  constructor(windowSize) {
    this._w = windowSize || VL_ROLLING_WINDOW;
    this._buf = []; this._sum = 0; this._sum2 = 0;
  }
  push(v) {
    if (this._buf.length >= this._w) {
      const old = this._buf.shift();
      this._sum -= old; this._sum2 -= old * old;
    }
    this._buf.push(v); this._sum += v; this._sum2 += v * v;
    return this;
  }
  get mean() { return this._buf.length ? this._sum / this._buf.length : 0; }
  get variance() {
    const n = this._buf.length;
    if (n < 2) return 0;
    return Math.max(0, this._sum2 / n - Math.pow(this._sum / n, 2));
  }
  get sigma() { return Math.sqrt(this.variance); }
  get last() { return this._buf.length ? this._buf[this._buf.length - 1] : 0; }
  get len() { return this._buf.length; }
  zScore(v) { return this.sigma > 0 ? (v - this.mean) / this.sigma : 0; }
  measure(v) {
    const prev = this.last;
    this.push(v);
    return {
      mean: this.mean, sigma: this.sigma, delta: v - prev,
      zScore: this.zScore(v),
      anomaly: Math.abs(this.zScore(v)) > VL_ENERGY_SIGMA_ALERT,
    };
  }
  clear() { this._buf = []; this._sum = 0; this._sum2 = 0; }
  decayMean() {
    if (!this._buf.length) return 0;
    const lambda = Math.LN2 / VL_DECAY_HALFLIFE;
    let ws = 0, wt = 0;
    const n = this._buf.length;
    for (let i = 0; i < n; i++) {
      const age = n - 1 - i, w = Math.exp(-lambda * age);
      ws += this._buf[i] * w; wt += w;
    }
    return wt > 0 ? ws / wt : 0;
  }
  entropy() {
    if (this._buf.length < 3) return 0;
    const min = Math.min(...this._buf), max = Math.max(...this._buf);
    const range = max - min;
    if (range === 0) return 0;
    const bins = new Array(10).fill(0);
    for (const v of this._buf) bins[Math.min(9, Math.floor(((v - min) / range) * 10))]++;
    let H = 0;
    const n = this._buf.length;
    for (const b of bins) { if (b > 0) { const p = b / n; H -= p * Math.log2(p); } }
    return H / Math.log2(10);
  }
}

// ── FrictionAnalyzer ───────────────────────────────────────────────
const VL_FRICTION_DISFLUENCY = new Set(['uh','uhh','uhhh','um','umm','ummm','er','err','ah','ahh','hm','hmm','hmmm','mm','mmm']);
const VL_FRICTION_CATS = {
  filler:       [/\blike\b(?!\s+to\b|\s+a\b|\s+the\b)/, /\byou\s+know\b/, /\bi\s+mean\b/, /\bsort\s+of\b/, /\bkind\s+of\b/, /\bbasically\b/, /\bactually\b.*\bactually\b/, /\bright\?\s*right\?/],
  memoryGap:    [/i\s+can'?t\s+remember/, /what\s+was\s+it/, /i\s+forget/, /i\s+forgot/, /what'?s\s+the\s+word/, /i\s+don'?t\s+recall/],
  cognitiveLoad:[/\bwait\b/, /\bhold\s+on\b/, /\blet\s+me\s+think\b/, /\bjust\s+a\s+second\b/, /\bwhere\s+was\s+i\b/],
  tension:      [/i\s+don'?t\s+know\s+(?:how|what|why|if)/, /i'?m\s+not\s+sure/, /it'?s\s+hard\s+to\s+say/, /i\s+can'?t\s+explain/, /tired/, /exhausted/],
  denial:       [/it'?s\s+not\s+that/, /i'?m\s+not\s+saying/, /that'?s\s+not\s+what\s+i/, /i\s+didn'?t\s+mean/, /not\s+my\s+fault/],
};

class VLFrictionAnalyzer {
  constructor() {
    this._rolling = new VLRollingStats(30);
    this._counts = {};
    this._promotedSet = {}; // fire promotion exactly once per category
  }
  analyze(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const found = [];
    for (const w of words) {
      if (VL_FRICTION_DISFLUENCY.has(w)) found.push({ type: 'disfluency', marker: w });
    }
    for (const cat in VL_FRICTION_CATS) {
      for (const pattern of VL_FRICTION_CATS[cat]) {
        if (pattern.test(lower)) {
          const m = lower.match(pattern);
          found.push({ type: cat, marker: m ? m[0] : cat });
          this._counts[cat] = (this._counts[cat] || 0) + 1;
        }
      }
    }
    const density = words.length > 0 ? found.length / words.length : 0;
    const stats = this._rolling.measure(density);
    const promoted = [];
    for (const k in this._counts) {
      // v7 used === here, which silently never fires if a single
      // utterance adds 2+ hits and the count jumps over the exact
      // threshold (e.g. 2→4). Fire once at-or-past instead.
      if (this._counts[k] >= VL_HEURISTIC_PROMOTE && !this._promotedSet[k]) {
        this._promotedSet[k] = true;
        promoted.push({ pattern: k, count: this._counts[k] });
      }
    }
    const types = [];
    const seen = {};
    for (const f of found) { if (!seen[f.type]) { seen[f.type] = 1; types.push(f.type); } }
    return {
      friction: found.length > 0,
      markers: found,
      types,
      score: Math.min(1, found.length / 3),
      density: Math.round(density * 1000) / 1000,
      stats,
      promoted,
    };
  }
  reset() { this._rolling.clear(); this._counts = {}; this._promotedSet = {}; }
}

// ── AssociationEngine — the core ───────────────────────────────────
class VLAssociationEngine {
  constructor() {
    this._nodes = []; this._edges = []; this._ngrams = {}; this._invCache = null;
  }
  _contentWords(text) {
    return String(text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
      .filter(w => w.length >= VL_ASSOC_MIN_CHARS && !VL_STOPWORDS.has(w));
  }
  _jaccard(a, b) {
    if (!a.length || !b.length) return 0;
    const setA = {};
    let inter = 0;
    for (const w of a) setA[w] = 1;
    for (const w of b) { if (setA[w]) inter++; }
    const union = Object.keys(setA).length + b.length - inter;
    return union > 0 ? inter / union : 0;
  }
  // Add a text node. Returns the new edges created to every prior node
  // sharing vocabulary — the automatic association step.
  add(id, text) {
    const words = this._contentWords(text);
    const node = { id, words, text, ts: Date.now() };
    const newEdges = [];
    for (const other of this._nodes) {
      const score = this._jaccard(words, other.words);
      if (score > 0) {
        const wordSet = {};
        for (const w of other.words) wordSet[w] = 1;
        const shared = words.filter(w => wordSet[w]);
        newEdges.push({ a: id, b: other.id, score: Math.round(score * 1000) / 1000, words: shared });
      }
    }
    this._nodes.push(node);
    for (const e of newEdges) this._edges.push(e);
    this._updateNgrams(text);
    this._invCache = null;
    return newEdges;
  }
  // "You've circled this exact phrase before" — trigram repetition
  redundancyCheck(text) {
    const trigrams = this._extractNgrams(String(text || '').toLowerCase(), 3);
    const hits = [];
    for (const g of trigrams) { if ((this._ngrams[g] || 0) >= 2) hits.push(g); }
    return { redundant: hits.length > 0, phrases: hits };
  }
  // Words recurring across ≥ threshold of ALL nodes = persistent themes
  invariants() {
    if (this._invCache) return this._invCache;
    if (this._nodes.length < 3) return { words: [], threshold: VL_INVARIANT_THRESHOLD };
    const freq = {};
    for (const n of this._nodes) for (const w of n.words) freq[w] = (freq[w] || 0) + 1;
    const thresh = this._nodes.length * VL_INVARIANT_THRESHOLD;
    const words = Object.keys(freq).filter(w => freq[w] >= thresh);
    this._invCache = { words, threshold: VL_INVARIANT_THRESHOLD, nodeCount: this._nodes.length };
    return this._invCache;
  }
  get nodes() { return this._nodes; }
  get edges() { return this._edges; }
  _updateNgrams(text) {
    for (const g of this._extractNgrams(String(text || '').toLowerCase(), 3)) {
      this._ngrams[g] = (this._ngrams[g] || 0) + 1;
    }
  }
  _extractNgrams(text, n) {
    const words = text.split(/\s+/).filter(w => w.length > 2);
    const grams = [];
    for (let i = 0; i <= words.length - n; i++) grams.push(words.slice(i, i + n).join(' '));
    return grams;
  }
  reset() { this._nodes = []; this._edges = []; this._ngrams = {}; this._invCache = null; }
}

// ── PredictiveEngine — Markov over tag transitions ─────────────────
class VLPredictiveEngine {
  constructor() {
    this._tagSeq = []; this._transitions = {}; this._wordTrigrams = {}; this._wordHistory = [];
  }
  feed(tags, text) {
    const primary = (tags && tags[0]) || 'SYS';
    this._tagSeq.push(primary);
    this._updateTransitions(primary);
    const words = String(text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3);
    for (const w of words) this._wordHistory.push(w);
    if (this._wordHistory.length > 200) this._wordHistory = this._wordHistory.slice(-200);
  }
  predictTag() {
    if (this._tagSeq.length < 5) return null;
    const prev = this._tagSeq[this._tagSeq.length - 1];
    const prefix = prev + '→';
    const candidates = {};
    let total = 0;
    for (const k in this._transitions) {
      if (k.indexOf(prefix) === 0) {
        const next = k.slice(prefix.length);
        candidates[next] = this._transitions[k];
        total += this._transitions[k];
      }
    }
    let best = null, bestCount = 0;
    for (const c in candidates) { if (candidates[c] > bestCount) { best = c; bestCount = candidates[c]; } }
    if (!best || total === 0) return null;
    return { tag: best, confidence: Math.round((bestCount / total) * 100) / 100, observations: total };
  }
  _updateTransitions(tag) {
    if (this._tagSeq.length < 2) return;
    const prev = this._tagSeq[this._tagSeq.length - 2];
    const key = prev + '→' + tag;
    this._transitions[key] = (this._transitions[key] || 0) + 1;
  }
  reset() { this._tagSeq = []; this._transitions = {}; this._wordTrigrams = {}; this._wordHistory = []; }
}

// ── Tag extraction + connection finding (v7's exact logic) ─────────
function vleExtractTags(text, wordBank) {
  const bank = wordBank || {};
  return vleSigTok(text)
    .filter(w => w.length > 4)
    .sort((a, b) => (bank[b] ? bank[b].count : 0) - (bank[a] ? bank[a].count : 0))
    .slice(0, 5);
}

function vleFindConnectedNodes(text, nodes) {
  const curSig = {};
  const connected = [];
  for (const w of vleSigTok(text)) curSig[w] = 1;
  for (let j = nodes.length - 1; j >= Math.max(0, nodes.length - 8); j--) {
    const shared = vleSigTok(nodes[j].text).filter(w => curSig[w]);
    if (shared.length >= 2) connected.push(nodes[j].id);
  }
  return connected;
}

// ── Slope (OLS) + stability regimes ────────────────────────────────
function vleSlopeEngine(values) {
  const n = values.length;
  if (n < 3) return { slope: 0, direction: 'flat', momentum: 0 };
  let sX = 0, sY = 0, sXY = 0, sX2 = 0;
  for (let i = 0; i < n; i++) { sX += i; sY += values[i]; sXY += i * values[i]; sX2 += i * i; }
  const slope = (n * sXY - sX * sY) / (n * sX2 - sX * sX);
  return {
    slope,
    direction: slope > 0.01 ? 'rising' : slope < -0.01 ? 'falling' : 'flat',
    momentum: Math.min(1, Math.abs(slope) * 20),
  };
}

const VL_SIGMA_REGIMES = ['INSUFFICIENT_DATA','STABLE','ACTIVATING','UNGROUNDED','DYSREGULATED','OSCILLATORY','COLLAPSING','OFFLINE'];

function vleStabilityEngine(values) {
  const n = values.length;
  if (n < 5) return { regime: 'INSUFFICIENT_DATA', sigma: 0, mean: 0 };
  const stats = new VLRollingStats(n);
  for (const v of values) stats.push(v);
  const mean = stats.mean, sigma = stats.sigma;
  const slope = vleSlopeEngine(values);
  const entropy = stats.entropy();
  let regime = 'STABLE';
  if (mean < 0.05) regime = 'OFFLINE';
  else if (entropy > 0.85 && sigma > mean * 0.6) regime = 'DYSREGULATED';
  else if (entropy > 0.7) regime = 'OSCILLATORY';
  else if (slope.direction === 'falling' && slope.momentum > 0.5) regime = 'COLLAPSING';
  else if (slope.direction === 'rising' && slope.momentum > 0.5) regime = 'ACTIVATING';
  else if (sigma > mean) regime = 'UNGROUNDED';
  return { regime, sigma: Math.round(sigma * 1000) / 1000, mean: Math.round(mean * 1000) / 1000, slope, entropy: Math.round(entropy * 1000) / 1000 };
}

// ── Module state + persistence ─────────────────────────────────────
const VLE_STATE_KEY = 'mm_vle_engine_v1';
const VLE_STATE = {
  utterances: [],          // { id, text, tags, ts, frictionScore }
  wordBank: {},            // word -> { count } — feeds tag ranking
  assoc: new VLAssociationEngine(),
  friction: new VLFrictionAnalyzer(),
  predictive: new VLPredictiveEngine(),
};

function vleSave() {
  // SECURITY FIX: was localStorage['mm_vle_engine_v1'] in plaintext, with
  // no vault path at all — the full text of every utterance the
  // association engine ever saw, unencrypted, forever. Now covered by
  // the vault (associativeEngine in mastermind-vault.js). See
  // _ORPHAN_KEYS there for recovering any pre-fix copy.
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

// Rebuilds the association index from VLE_STATE.utterances. The index
// itself (VLAssociationEngine's internal edge maps) is derived, not
// serialized — this is what used to run inside vleLoad() right after
// reading localStorage; now it's what the vault's deserialize step calls
// after hydrating VLE_STATE.utterances/wordBank from the vault payload.
function vleRebuildAssoc() {
  VLE_STATE.assoc.reset();
  for (const u of VLE_STATE.utterances) VLE_STATE.assoc.add(u.id, u.text);
}

function vleLoad() {
  // No-op now that the vault hydrates VLE_STATE directly (see
  // vaultDeserialize's associativeEngine handling, which calls
  // vleRebuildAssoc() itself). Kept as a named function — several call
  // sites predate the vault fix and still call vleLoad() expecting
  // something to happen on open; it's a safe, explicit no-op rather
  // than removing the symbol out from under them.
}

// ── The pipeline — one utterance in, associations out ──────────────
// This is the whole point in one function: text (spoken OR typed OR
// pulled from any other surface) → tags → association edges → optional
// canvas node already wired via the exact same addConn/connectByTags
// path manual linking uses. Zero manual effort between a thought and a
// connected map.
function vleIngest(text, opts) {
  const o = opts || {};
  const clean = String(text || '').trim();
  if (!clean) return null;

  const id = typeof uuid === 'function' ? uuid() : Date.now().toString(36);

  // 1. Word bank update (feeds tag ranking)
  for (const w of vleSigTok(clean)) {
    if (!VLE_STATE.wordBank[w]) VLE_STATE.wordBank[w] = { count: 0 };
    VLE_STATE.wordBank[w].count++;
  }

  // 2. Tags
  const tags = vleExtractTags(clean, VLE_STATE.wordBank);

  // 3. Friction
  const friction = VLE_STATE.friction.analyze(clean);

  // 4. Association edges to everything prior
  const newEdges = VLE_STATE.assoc.add(id, clean);

  // 5. Redundancy + invariants
  const redundancy = VLE_STATE.assoc.redundancyCheck(clean);
  const invariants = VLE_STATE.assoc.invariants();

  // 6. Predictive feed
  VLE_STATE.predictive.feed(tags, clean);
  const prediction = VLE_STATE.predictive.predictTag();

  // 7. Persist
  const utterance = { id, text: clean, tags, ts: Date.now(), frictionScore: friction ? friction.score : 0 };
  VLE_STATE.utterances.push(utterance);
  vleSave();

  // 8. Cross-module wires — same substrate as everything else this session
  if (friction && friction.promoted.length && typeof almWriteDelta === 'function') {
    for (const p of friction.promoted) {
      almWriteDelta('friction', `Speech pattern promoted to heuristic: "${p.pattern}" (${p.count} occurrences)`, { utteranceId: id, kind: 'friction-promote' });
    }
  }
  if (typeof MM_BUS !== 'undefined') {
    MM_BUS.emit('voice.utterance.ingested', { id, tags, edgeCount: newEdges.length, friction: friction ? friction.score : 0 });
  }

  // 9. Optional: spawn a real canvas node, pre-tagged, and let
  // connectByTags wire it — only when explicitly asked (the UI decides),
  // never silently.
  let spawnedNodeId = null;
  if (o.spawnNode && typeof CANVAS !== 'undefined' && CANVAS.spawnNode) {
    const title = clean.length > 40 ? clean.slice(0, 37) + '…' : clean;
    const n = CANVAS.spawnNode(o.nodeType || 'insight', o.x || 200, o.y || 200, { title, body: clean, tags });
    spawnedNodeId = n.id;
    if (typeof connectByTags === 'function') connectByTags(n.id);
  }

  return { id, tags, edges: newEdges, friction, redundancy, invariants, prediction, spawnedNodeId };
}

// ── Exposure — same pattern as every module this session ───────────
window.VLE_STATE = VLE_STATE;
window.vleIngest = vleIngest;
window.vleLoad = vleLoad;
window.vleSave = vleSave;
window.vleRebuildAssoc = vleRebuildAssoc;
window.vleExtractTags = vleExtractTags;
window.vleFindConnectedNodes = vleFindConnectedNodes;
window.vleSlopeEngine = vleSlopeEngine;
window.vleStabilityEngine = vleStabilityEngine;
window.VLAssociationEngine = VLAssociationEngine;
window.VLFrictionAnalyzer = VLFrictionAnalyzer;
window.VLPredictiveEngine = VLPredictiveEngine;
window.VLRollingStats = VLRollingStats;

if (typeof MMLog !== 'undefined') MMLog.info('voice', 'Voice Lattice engine v1.0.0 loaded — association/friction/predictive engines live');
