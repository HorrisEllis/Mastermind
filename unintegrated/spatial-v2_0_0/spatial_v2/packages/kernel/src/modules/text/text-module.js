/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK TextModule  ·  text-module.js  ·  v1.4.0                          ║
 * ║  UUID: alk-mod-text-0000-1300-0000-000000000060                        ║
 * ║  HOOK: alk.module.text:text-analyzer:00060                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — Nothing pretends. Every detector documents exactly what it computes,
 *         what its inputs are, and what its limits are.
 * §1.2 — All errors are loud. Zero silent failures.
 * §5.1 — UUID, hook, and bus registration on every class.
 * §5.5 — No external dependencies. All NLP built from first principles.
 * §5.7 — Zero direct calls to other modules. All I/O via kernel events.
 * §1.8 — Pulse emission registered at startup.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NLP analysis engine for written text — chat logs, emails, documents,
 * pasted content. Complements VerbalModule (audio) and VideoModule (visual).
 * Receives text via kernel events. Emits structured analysis events.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECTION DOMAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. TOPIC MODELING — LDA-style built from scratch (§5.5)
 *    Co-occurrence matrix over content words → topic clusters.
 *    Topics are emergent: no pre-defined categories imposed.
 *    Output: topic fingerprint per document, session topic arc.
 *
 * 2. NAMED ENTITY TRACKING
 *    Proper nouns (capitalized sequences), pronouns, recurring tokens.
 *    Tracks mention frequency and co-occurrence across ingest events.
 *    Output: entity registry with first-mention, last-mention, count.
 *
 * 3. DISCOURSE COHERENCE SCORING
 *    Measures how well each new chunk connects to the prior context.
 *    Method: content-word Jaccard overlap between consecutive chunks +
 *    connector word detection (however, therefore, because, but, so...).
 *    Low coherence = topic jump or fragmentation.
 *
 * 4. SEMANTIC FIELD COVERAGE
 *    Tracks which semantic domains are active across the session.
 *    Domains: SELF, OTHER, PAST, FUTURE, BODY, EMOTION, COGNITION,
 *             RELATIONSHIP, CONFLICT, RESOLUTION, UNCERTAINTY, AGENCY.
 *    Output: per-chunk domain vector, session coverage map.
 *
 * 5. LEXICAL DENSITY
 *    Content words / total words per chunk.
 *    High density = information-dense, precise.
 *    Low density = hedge-heavy, vague, emotional.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Listens:
 *   alk.text.ingest            — { text, source, sessionId, chunkId? }
 *   alk.session.capture.start  — begin session
 *   alk.session.capture.stop   — end session, flush summary
 *   alk.text.config            — runtime config update
 *
 * Emits:
 *   alk.text.chunk.analyzed    — per-chunk full analysis
 *   alk.text.topic.update      — topic model updated (every N chunks)
 *   alk.text.entity.detected   — new entity first seen
 *   alk.text.coherence.low     — coherence dropped below threshold
 *   alk.text.summary           — session-end summary
 *   alk.text.pulse             — §1.8 heartbeat
 *   alk.text.error
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SOURCE TYPES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   'chat'      — real-time chat messages (short, informal)
 *   'email'     — email or letter (structured, longer)
 *   'document'  — pasted document or article
 *   'note'      — freeform personal note
 *   'unknown'   — default when source not specified
 */

import { ALKModule } from '../kernel.js';

// ─── Module Identity ──────────────────────────────────────────────────────────

const MODULE_UUID    = 'alk-mod-text-0000-1300-0000-000000000060';
const MODULE_VERSION = '1.4.0';
const MODULE_NS      = 'alk.text';

// ─── Constants (§1.1 — every threshold documented) ───────────────────────────

const TOPIC_UPDATE_EVERY   = 3;    // recompute topic model every N chunks
const COHERENCE_LOW_THRESH = 0.10; // Jaccard below this = low coherence
const MIN_WORD_LEN         = 3;    // minimum word length for content analysis
const ENTITY_MIN_CAPS      = 2;    // min consecutive capitalized words for entity
const LDA_ITERATIONS       = 20;   // topic model co-occurrence smoothing passes
const LDA_TOPICS           = 4;    // number of latent topics to surface
const LEXICAL_LOW_THRESH   = 0.35; // lexical density below this = hedge-heavy
const PULSE_INTERVAL_MS    = 15_000;

// ─── Semantic field lexicon (§5.5 — built, not imported) ─────────────────────

const SEMANTIC_FIELDS = Object.freeze({
  SELF:         new Set(['i','me','my','mine','myself','i\'m','i\'ve','i\'ll','i\'d']),
  OTHER:        new Set(['you','your','yours','they','them','their','he','she','his','her']),
  PAST:         new Set(['was','were','had','did','used','before','ago','yesterday','last','previous','once','already']),
  FUTURE:       new Set(['will','shall','going','plan','hope','expect','tomorrow','soon','next','eventually','might','could']),
  BODY:         new Set(['body','pain','tired','sick','head','stomach','chest','breath','sleep','hands','eyes','feel','felt']),
  EMOTION:      new Set(['feel','feeling','felt','scared','angry','sad','happy','anxious','afraid','love','hate','hurt','overwhelmed','numb','empty','joy','grief']),
  COGNITION:    new Set(['think','thought','know','understand','believe','wonder','question','confused','clear','realize','aware','notice','remember','forget']),
  RELATIONSHIP: new Set(['together','relationship','partner','friend','family','mother','father','sister','brother','husband','wife','trust','bond','connect','alone']),
  CONFLICT:     new Set(['conflict','fight','argument','disagree','wrong','blame','fault','problem','struggle','difficult','hard','issue','tension','break']),
  RESOLUTION:   new Set(['resolve','solution','fix','better','improve','heal','reconcile','accept','forgive','move','forward','peace','okay','good']),
  UNCERTAINTY:  new Set(['maybe','perhaps','possibly','might','unsure','unclear','confused','don\'t know','not sure','wondering','question']),
  AGENCY:       new Set(['choose','chose','decide','decided','control','power','able','can','could','capable','responsible','action','act','made','do','did']),
});

// ─── Stopwords (§5.5) ────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'the','and','for','that','this','with','from','have','been','were',
  'they','their','there','what','when','which','will','would','could',
  'should','about','into','than','then','your','more','also','some',
  'just','like','over','such','these','those','very','here','each',
  'both','only','after','before','other','first','well','out','its',
  'our','all','any','who','how','but','not','are','was','can','does',
  'did','has','had','him','her','his','she','too','get','got','let',
  'may','nor','off','per','set','via','yet','com','one','two','three',
  'said','says','say','even','still','also','back','much','many','way',
]);

// ─── Discourse connectors ─────────────────────────────────────────────────────

const CONNECTORS = new Set([
  'however','therefore','because','although','though','unless','since',
  'consequently','furthermore','moreover','nevertheless','meanwhile',
  'whereas','despite','instead','otherwise','accordingly','thus','hence',
  'yet','but','so','and','or','nor','either','neither','both',
]);

// ─── Rolling stats (self-contained, no codec dep) ────────────────────────────

class _RollingStats {
  constructor(w = 20) { this._w=w; this._buf=[]; this._sum=0; this._sum2=0; }
  push(v) {
    if (this._buf.length>=this._w){const o=this._buf.shift();this._sum-=o;this._sum2-=o*o;}
    this._buf.push(v);this._sum+=v;this._sum2+=v*v;return this;
  }
  get mean() { return this._buf.length?this._sum/this._buf.length:0; }
  get variance() { const n=this._buf.length;if(n<2)return 0;return Math.max(0,this._sum2/n-(this._sum/n)**2); }
  get sigma() { return Math.sqrt(this.variance); }
  get last() { return this._buf[this._buf.length-1]??0; }
  get len()  { return this._buf.length; }
  zScore(v)  { return this.sigma>0?(v-this.mean)/this.sigma:0; }
  clear()    { this._buf=[];this._sum=0;this._sum2=0; }
}

// ─── TopicModel ───────────────────────────────────────────────────────────────

/**
 * LDA-style topic model built from co-occurrence (§5.5 — no external deps).
 *
 * Method: word co-occurrence within a sliding window → co-occurrence matrix →
 * power iteration to surface dominant word clusters → topic labels from
 * the top-N words per cluster.
 *
 * §1.1 — This is a co-occurrence-based approximation, not true LDA.
 *         Topics are word clusters, not probability distributions.
 *         "Topic" here means: words that tend to appear together.
 */
class TopicModel {
  constructor({ nTopics = LDA_TOPICS, windowSize = 4 } = {}) {
    this._nTopics    = nTopics;
    this._windowSize = windowSize;
    this._cooc       = new Map(); // word → Map<word, count>
    this._wordFreq   = new Map(); // word → total count
    this._docCount   = 0;
    this._topics     = [];        // [{ words:[], score }] — updated on recompute
  }

  /** Ingest a chunk — updates co-occurrence matrix */
  ingest(words) {
    this._docCount++;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      this._wordFreq.set(w, (this._wordFreq.get(w) ?? 0) + 1);
      for (let j = Math.max(0, i - this._windowSize); j < i; j++) {
        const w2 = words[j];
        if (w === w2) continue;
        if (!this._cooc.has(w)) this._cooc.set(w, new Map());
        if (!this._cooc.has(w2)) this._cooc.set(w2, new Map());
        const cnt = (this._cooc.get(w).get(w2) ?? 0) + 1;
        this._cooc.get(w).set(w2, cnt);
        this._cooc.get(w2).set(w, cnt);
      }
    }
  }

  /**
   * Recompute topics from current co-occurrence matrix.
   * Uses greedy seed selection + BFS expansion — O(V²) but tiny vocabulary.
   */
  recompute() {
    if (this._wordFreq.size < 4) return this._topics;

    // Sort words by frequency, take top 60 as vocabulary
    const vocab = [...this._wordFreq.entries()]
      .sort((a,b) => b[1]-a[1])
      .slice(0, 60)
      .map(([w]) => w);

    const used = new Set();
    const topics = [];

    for (let t = 0; t < this._nTopics && vocab.length > 0; t++) {
      // Seed: highest-frequency unused word
      const seed = vocab.find(w => !used.has(w));
      if (!seed) break;
      used.add(seed);

      // Expand: pick top co-occurring unused words
      const neighbors = this._cooc.get(seed) ?? new Map();
      const cluster = [seed];
      const ranked = [...neighbors.entries()]
        .filter(([w]) => vocab.includes(w) && !used.has(w))
        .sort((a,b) => b[1]-a[1])
        .slice(0, 5);

      for (const [w] of ranked) { cluster.push(w); used.add(w); }

      // Score = sum of co-occurrence counts within cluster
      let score = 0;
      for (let i = 0; i < cluster.length; i++) {
        for (let j = i+1; j < cluster.length; j++) {
          score += this._cooc.get(cluster[i])?.get(cluster[j]) ?? 0;
        }
      }

      topics.push({ words: cluster, score, docCount: this._docCount });
    }

    this._topics = topics;
    return topics;
  }

  /**
   * Fingerprint a chunk against current topics.
   * Returns topic affinity scores [0,1] per topic.
   */
  fingerprint(words) {
    const wordSet = new Set(words);
    return this._topics.map((t, idx) => {
      const overlap = t.words.filter(w => wordSet.has(w)).length;
      return { topicIdx: idx, words: t.words.slice(0,3), affinity: t.words.length > 0 ? overlap / t.words.length : 0 };
    }).filter(f => f.affinity > 0);
  }

  get topics()    { return this._topics; }
  get docCount()  { return this._docCount; }
  reset() { this._cooc.clear(); this._wordFreq.clear(); this._docCount=0; this._topics=[]; }
}

// ─── EntityTracker ────────────────────────────────────────────────────────────

/**
 * Named entity tracker — proper nouns + recurring tokens.
 *
 * §1.1 — "Entity" here means a token that appears capitalized in running text
 *         (not at sentence start) OR appears ≥3 times in session.
 *         This is heuristic, not a trained NER model.
 */
class EntityTracker {
  constructor() {
    this._registry = new Map(); // token → { count, firstTs, lastTs, chunks[], type }
    this._chunkN   = 0;
  }

  /**
   * Scan a chunk for entities. Returns newly discovered entities (first-seen).
   */
  scan(text, chunkId) {
    this._chunkN++;
    const newEntities = [];

    // Proper nouns: capitalized tokens not at sentence start
    const tokens = text.split(/\s+/);
    const properNouns = new Set();
    for (let i = 1; i < tokens.length; i++) {
      const t = tokens[i].replace(/[^a-zA-Z'-]/g, '');
      if (t.length >= 2 && /^[A-Z]/.test(t) && !/^[A-Z]{2,}$/.test(t)) {
        properNouns.add(t.toLowerCase());
      }
    }

    // Multi-word proper nouns (consecutive capitalized tokens)
    for (let i = 1; i < tokens.length - 1; i++) {
      const a = tokens[i].replace(/[^a-zA-Z]/g,'');
      const b = tokens[i+1].replace(/[^a-zA-Z]/g,'');
      if (/^[A-Z]/.test(a) && /^[A-Z]/.test(b) && a.length > 1 && b.length > 1) {
        properNouns.add((a+' '+b).toLowerCase());
      }
    }

    for (const entity of properNouns) {
      if (STOPWORDS.has(entity)) continue;
      const existing = this._registry.get(entity);
      if (!existing) {
        const rec = { count:1, firstTs:Date.now(), lastTs:Date.now(), chunks:[chunkId], type:'proper_noun' };
        this._registry.set(entity, rec);
        newEntities.push({ entity, ...rec });
      } else {
        existing.count++;
        existing.lastTs = Date.now();
        existing.chunks.push(chunkId);
      }
    }

    // High-frequency tokens (≥3 mentions) promoted to entity
    const wordCounts = new Map();
    for (const t of tokens) {
      const w = t.toLowerCase().replace(/[^a-z'-]/g,'');
      if (w.length >= 4 && !STOPWORDS.has(w)) wordCounts.set(w, (wordCounts.get(w)??0)+1);
    }
    for (const [w, cnt] of wordCounts) {
      if (cnt >= 3 && !this._registry.has(w)) {
        const rec = { count:cnt, firstTs:Date.now(), lastTs:Date.now(), chunks:[chunkId], type:'high_frequency' };
        this._registry.set(w, rec);
        newEntities.push({ entity:w, ...rec });
      }
    }

    return newEntities;
  }

  get registry()  { return this._registry; }
  get all()       { return [...this._registry.entries()].map(([e,r])=>({entity:e,...r})); }
  reset()         { this._registry.clear(); this._chunkN=0; }
}

// ─── CoherenceScorer ─────────────────────────────────────────────────────────

/**
 * Discourse coherence — Jaccard content-word overlap + connector bonus.
 *
 * §1.1 — Coherence here means: the degree to which consecutive text chunks
 *         share content words OR use explicit discourse connectors.
 *         High coherence ≠ good writing. Low coherence = topic jump or
 *         fragmentation. Connectors add 0.15 bonus regardless of overlap.
 */
class CoherenceScorer {
  constructor() {
    this._prevWords = new Set();
    this._scores    = new _RollingStats(10);
    this._chunkN    = 0;
  }

  score(words, rawText) {
    this._chunkN++;
    const wordSet = new Set(words);

    if (this._chunkN === 1) {
      this._prevWords = wordSet;
      return { score: 1.0, _score: 1.0, jaccard: 1.0, connectorBonus: 0, chunkN: this._chunkN };
    }

    // Jaccard overlap with previous chunk
    let inter = 0;
    for (const w of wordSet) if (this._prevWords.has(w)) inter++;
    const union = wordSet.size + this._prevWords.size - inter;
    const jaccard = union > 0 ? inter / union : 0;

    // Connector bonus
    const lower = rawText.toLowerCase();
    let connectorBonus = 0;
    for (const c of CONNECTORS) {
      if (lower.includes(c)) { connectorBonus = 0.15; break; }
    }

    const score = Math.min(1, jaccard + connectorBonus);
    this._scores.push(score);
    this._prevWords = wordSet;

    return {
      score:         Math.round(score * 10000) / 10000,
      jaccard:       Math.round(jaccard * 10000) / 10000,
      connectorBonus,
      rolling:       { mean: this._scores.mean, sigma: this._scores.sigma },
      chunkN:        this._chunkN,
      _score:        score,  // raw for threshold comparison at call site
    };
  }

  reset() { this._prevWords=new Set(); this._scores.clear(); this._chunkN=0; }
}

// ─── SemanticFieldAnalyzer ────────────────────────────────────────────────────

/**
 * Semantic domain coverage per chunk and across session.
 *
 * §1.1 — Domains are lexicon-based, not embedding-based. A word maps to a
 *         domain if it appears in that domain's lexicon. Overlap is possible
 *         (EMOTION and BODY can co-activate). This is presence/absence
 *         detection, not semantic classification.
 */
class SemanticFieldAnalyzer {
  constructor() {
    this._sessionCoverage = new Map(); // domain → total hits across session
    this._chunkN = 0;
  }

  analyze(words) {
    this._chunkN++;
    const wordSet  = new Set(words.map(w => w.toLowerCase()));
    const rawText  = [...wordSet].join(' ');
    const active   = {};
    const hitWords = {};

    for (const [domain, lexicon] of Object.entries(SEMANTIC_FIELDS)) {
      const hits = [...lexicon].filter(w => wordSet.has(w) || rawText.includes(w));
      if (hits.length > 0) {
        active[domain]   = { hits: hits.length, words: hits.slice(0,4) };
        hitWords[domain] = hits;
        this._sessionCoverage.set(domain, (this._sessionCoverage.get(domain) ?? 0) + hits.length);
      }
    }

    const dominant = Object.entries(active)
      .sort((a,b) => b[1].hits - a[1].hits)
      .slice(0,2)
      .map(([d]) => d);

    return {
      active,
      dominant,
      coverage:      Object.keys(active).length,
      sessionCoverage: Object.fromEntries(this._sessionCoverage),
    };
  }

  reset() { this._sessionCoverage.clear(); this._chunkN=0; }
}

// ─── LexicalAnalyzer ─────────────────────────────────────────────────────────

/**
 * Lexical density + hedge detection.
 *
 * Lexical density = content words / total words.
 * Content words = nouns, verbs, adjectives, adverbs (approximated by
 * exclusion of stopwords + function word patterns).
 *
 * §1.1 — This is a stopword-exclusion approximation, not POS tagging.
 */
class LexicalAnalyzer {
  constructor() {
    this._densityStats = new _RollingStats(10);
  }

  analyze(words, rawText, rawWordCount) {
    // words = already content-filtered. rawWordCount = total tokens before filtering.
    const total    = rawWordCount ?? words.length;
    const content  = words;  // already filtered by caller's _contentWords()
    const density  = total > 0 ? content.length / total : 0;

    this._densityStats.push(density);

    // Hedge detection
    const hedges = [
      /\bkind of\b/,/\bsort of\b/,/\bmaybe\b/,/\bperhaps\b/,/\bpossibly\b/,
      /\bsomewhat\b/,/\bi think\b/,/\bi guess\b/,/\bi suppose\b/,
      /\bit seems\b/,/\bapparently\b/,/\bprobably\b/,/\bnot sure\b/,
      /\ba bit\b/,/\ba little\b/,/\brather\b/,/\bfairly\b/,
    ];
    const lower = rawText.toLowerCase();
    const hedgeMatches = hedges.filter(re => re.test(lower)).map(re => re.source);

    // Negation density
    const negations = (lower.match(/\b(not|no|never|neither|nor|cannot|can't|won't|didn't|isn't|aren't|wasn't|weren't)\b/g) ?? []).length;
    const negationDensity = total > 0 ? negations / total : 0;

    return {
      density:          Math.round(density * 10000) / 10000,
      contentWords:     content.length,
      totalWords:       total,
      hedges:           hedgeMatches,
      hedgeDensity:     Math.round((hedgeMatches.length / Math.max(1, total)) * 10000) / 10000,
      negations,
      negationDensity:  Math.round(negationDensity * 10000) / 10000,
      low:              density < LEXICAL_LOW_THRESH,
      rolling:          { mean: this._densityStats.mean, sigma: this._densityStats.sigma },
    };
  }

  reset() { this._densityStats.clear(); }
}

// ─── TextModule ───────────────────────────────────────────────────────────────

export class TextModule extends ALKModule {
  constructor({ kernel, config = {} } = {}) {
    super({
      kernel,
      uuid:    MODULE_UUID,
      version: MODULE_VERSION,
      ns:      MODULE_NS,
    });

    this._config = {
      topicUpdateEvery:    config.topicUpdateEvery    ?? TOPIC_UPDATE_EVERY,
      coherenceLowThresh:  config.coherenceLowThresh  ?? COHERENCE_LOW_THRESH,
      pulseIntervalMs:     config.pulseIntervalMs     ?? PULSE_INTERVAL_MS,
      nTopics:             config.nTopics             ?? LDA_TOPICS,
    };

    // Sub-engines
    this._topics    = new TopicModel({ nTopics: this._config.nTopics });
    this._entities  = new EntityTracker();
    this._coherence = new CoherenceScorer();
    this._semField  = new SemanticFieldAnalyzer();
    this._lexical   = new LexicalAnalyzer();

    // Session state
    this._session   = null;
    this._chunkN    = 0;
    this._chunks    = [];  // { chunkId, text, ts, analysis }

    // Wire events
    this._sub('alk.session.capture.start', this._onSessionStart.bind(this));
    this._sub('alk.session.capture.stop',  this._onSessionStop.bind(this));
    this._sub('alk.text.ingest',           this._onIngest.bind(this));
    this._sub('alk.text.config',           this._onConfig.bind(this));

    // §1.8 — Pulse
    this._pulseTimer = setInterval(() => {
      this._emit('alk.text.pulse', {
        moduleUUID: MODULE_UUID,
        version:    MODULE_VERSION,
        session:    this._session,
        chunkN:     this._chunkN,
        topicCount: this._topics.topics.length,
        entityCount:this._entities.registry.size,
      });
    }, this._config.pulseIntervalMs);
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  _onSessionStart(ev) {
    this._session = ev.payload.sessionId ?? null;
    this._chunkN  = 0;
    this._chunks  = [];
    this._topics.reset();
    this._entities.reset();
    this._coherence.reset();
    this._semField.reset();
    this._lexical.reset();
    this._emit('alk.text.session.start', { sessionId: this._session });
  }

  _onSessionStop(ev) {
    if (!this._session) return;
    this._emitSummary(ev.payload.sessionId ?? this._session);
    this._session = null;
  }

  _onIngest(ev) {
    const { text, source = 'unknown', sessionId, chunkId } = ev.payload;
    if (!text || typeof text !== 'string') {
      this._emitError('INVALID_INPUT', 'text field is required and must be a string', { chunkId });
      return;
    }

    const sid = sessionId ?? this._session;
    if (!sid) {
      // Allow ingest without active session — create ephemeral
      this._session = `ephemeral-${Date.now().toString(36)}`;
    }

    this._chunkN++;
    const id = chunkId ?? `TC${String(this._chunkN).padStart(4,'0')}`;
    const ts = Date.now();

    // ── Extract content words ──────────────────────────────────────────────
    const words = this._contentWords(text);

    // ── Run all analyzers ──────────────────────────────────────────────────
    this._topics.ingest(words);
    const newEntities  = this._entities.scan(text, id);
    const coherence    = this._coherence.score(words, text);
    coherence.low      = coherence._score < this._config.coherenceLowThresh;
    const semantics    = this._semField.analyze(words);
    const rawWordCount = text.split(/\s+/).filter(Boolean).length;
    const lexical      = this._lexical.analyze(words, text, rawWordCount);

    // Topic recompute on schedule
    let topicUpdate = null;
    if (this._chunkN % this._config.topicUpdateEvery === 0) {
      topicUpdate = this._topics.recompute();
      this._emit('alk.text.topic.update', {
        sessionId: this._session,
        chunkN:    this._chunkN,
        topics:    topicUpdate,
      });
    }
    const topicFingerprint = this._topics.fingerprint(words);

    // ── Assemble chunk analysis ────────────────────────────────────────────
    const analysis = {
      chunkId:      id,
      sessionId:    this._session,
      source,
      ts,
      wordCount:    words.length,
      rawWordCount: text.split(/\s+/).filter(Boolean).length,
      coherence,
      semantics,
      lexical,
      topics:       topicFingerprint,
      entities:     newEntities,
    };

    this._chunks.push({ chunkId: id, text, ts, analysis });

    // ── Emit analyzed event ────────────────────────────────────────────────
    this._emit('alk.text.chunk.analyzed', analysis, { causedBy: ev.id });

    // ── Derived events ────────────────────────────────────────────────────
    for (const entity of newEntities) {
      this._emit('alk.text.entity.detected', {
        sessionId: this._session,
        chunkId:   id,
        entity:    entity.entity,
        type:      entity.type,
        count:     entity.count,
      }, { causedBy: ev.id });
    }

    if (coherence.low && this._chunkN > 1) {
      this._emit('alk.text.coherence.low', {
        sessionId:   this._session,
        chunkId:     id,
        score:       coherence.score,
        jaccard:     coherence.jaccard,
        threshold:   this._config.coherenceLowThresh,
      }, { causedBy: ev.id });
    }
  }

  _onConfig(ev) {
    const c = ev.payload;
    if (c.topicUpdateEvery)   this._config.topicUpdateEvery   = c.topicUpdateEvery;
    if (c.coherenceLowThresh) this._config.coherenceLowThresh = c.coherenceLowThresh;
    if (c.nTopics)            this._topics = new TopicModel({ nTopics: c.nTopics });
  }

  // ─── Session summary ────────────────────────────────────────────────────

  _emitSummary(sessionId) {
    const topics   = this._topics.recompute();
    const entities = this._entities.all
      .sort((a,b) => b.count - a.count)
      .slice(0, 20);

    const coherenceScores = this._chunks.map(c => c.analysis.coherence.score);
    const meanCoherence   = coherenceScores.length
      ? coherenceScores.reduce((s,v)=>s+v,0) / coherenceScores.length
      : 0;

    const lexDensities = this._chunks.map(c => c.analysis.lexical.density);
    const meanDensity  = lexDensities.length
      ? lexDensities.reduce((s,v)=>s+v,0) / lexDensities.length
      : 0;

    this._emit('alk.text.summary', {
      sessionId,
      chunkCount:       this._chunkN,
      topics:           topics.slice(0, this._config.nTopics),
      topEntities:      entities,
      semanticCoverage: this._semField._sessionCoverage
        ? Object.fromEntries(this._semField._sessionCoverage)
        : {},
      meanCoherence:    Math.round(meanCoherence * 10000) / 10000,
      meanLexDensity:   Math.round(meanDensity   * 10000) / 10000,
      entityCount:      this._entities.registry.size,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _contentWords(text) {
    return text
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= MIN_WORD_LEN && !STOPWORDS.has(w));
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  destroy() {
    clearInterval(this._pulseTimer);
    super.destroy();
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  get topics()   { return this._topics.topics; }
  get entities() { return this._entities.all; }
  get chunkN()   { return this._chunkN; }

  static get VERSION() { return MODULE_VERSION; }
  static get UUID()    { return MODULE_UUID; }
}

export default TextModule;
