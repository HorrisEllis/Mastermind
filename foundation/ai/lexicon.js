// ═══════════════════════════════════════════════════════════════════
// LEXICON
// foundation/ai/lexicon.js
//
// Your vocabulary and your grammar, learned from your own speech.
//
// PURE. Text in, structure out. No DOM, no network, no model.
//
// ─────────────────────────────────────────────────────────────────
// THE PRINCIPLE
//
// "The meaning of words exists in relation to their surroundings."
// That is the distributional hypothesis, and it is implementable
// without any AI at all: a word is described by the company it keeps.
// Two words that appear in similar contexts are similar words — in
// YOUR usage, not in a dictionary's.
//
// So this builds, from nothing:
//
//   LEXICON — every content word you use, how often, in what company,
//             and which other words share its company
//   GRAMMAR — which tags follow which. A Markov chain over tag
//             sequences is a description of how your thinking MOVES:
//             FRICTION → GAP → REL is a production rule you actually
//             use, and it emerged rather than being declared.
//
// ─────────────────────────────────────────────────────────────────
// WHY PPMI AND NOT RAW COUNTS
//
// Raw co-occurrence is dominated by frequency: everything co-occurs
// with your most common words, so every vector points the same way.
// Positive Pointwise Mutual Information asks a better question — do
// these two words appear together MORE than chance would predict? A
// rare pair that always occurs together scores higher than a common
// pair that occurs together often. That is what makes "vault" and
// "encryption" close while "vault" and "thing" are not.
//
// ─────────────────────────────────────────────────────────────────
// HONESTY ABOUT MATURITY
//
// A lexicon built from 20 sentences knows nothing, and any similarity
// it reports is noise. Every query that depends on accumulated evidence
// returns a `confidence` and a `basis`, and `maturity()` states plainly
// how much has been seen. Nothing here pretends to know your vocabulary
// before it does.
//
// UUID: 4a3b2c1d-ai-8000-8000-lexicon00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.Lexicon = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DEFAULTS = {
    windowSize: 4,          // words either side that count as "surroundings"
    minWordLength: 3,
    minCountForVector: 3,   // below this, a context vector is noise
    maxVocab: 12000,        // bounded: a lifetime of speech must not grow forever
    pruneTo: 10000,
    minObservationsForSimilarity: 200,
    minTransitionsForGrammar: 40,
  };

  // Shared with the lattice so tag vocabulary does not fork. Filler is
  // excluded from the lexicon entirely: "thing" appearing 4000 times
  // tells you nothing about how you think.
  const FILLER = new Set([
    'the','and','for','that','this','with','from','have','been','were','they','their','there',
    'what','when','which','will','would','could','should','about','into','than','then','your',
    'more','also','some','just','like','over','such','these','those','very','here','each','both',
    'only','after','before','other','first','well','its','our','all','any','who','how','but','not',
    'are','was','can','does','did','has','had','him','her','his','she','too','get','got','let',
    'may','off','yet','keep','keeps','think','thinks','thinking','thought','thing','things',
    'want','wants','wanted','really','actually','know','knows','going','maybe','something',
    'anything','everything','nothing','stuff','kind','sort','mean','means','meant','guess',
    'right','okay','yeah','gonna','wanna','kinda','sorta','basically','literally','probably',
    'definitely','obviously','always','never','still','even','much','many','make','makes','made',
    'making','take','takes','took','taking','need','needs','needed','feel','feels','felt',
    'look','looks','looked','looking','come','comes','came','coming','back','down','away',
    'around','because','though','while','where','being','doing','done','said','says','saying',
    'tell','tells','told','talk','talks','talking','trying','tried','start','starts','started',
    'time','times','part','parts','next','last','same','good','best','better','little','way',
    'ways','one','two','now','why','yes','put','out','use','used','using','see','seen','say',
  ]);

  function create(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});

    const L = {
      cfg,
      totalObservations: 0,     // utterances seen
      totalTokens: 0,
      counts: new Map(),        // word → count
      contexts: new Map(),      // word → Map(neighbour → count)
      coTotal: 0,               // total co-occurrence pairs
      tagTransitions: new Map(),// tagA → Map(tagB → count)
      tagCounts: new Map(),
      firstSeen: new Map(),     // word → ISO of first appearance
      lastSeen: new Map(),
    };

    function tokenize(text) {
      return String(text || '').toLowerCase()
        .replace(/[^a-z0-9'\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= cfg.minWordLength && !FILLER.has(w) && !/^\d+$/.test(w));
    }

    // ── Learning ─────────────────────────────────────────────────────
    // One utterance at a time, in the order it was spoken — which is why
    // the transcription queue's ordering guarantee matters here.

    function observe(text, meta) {
      const m = meta || {};
      const words = tokenize(text);
      if (!words.length) return { learned: 0 };

      const now = m.at || new Date().toISOString();
      L.totalObservations++;
      L.totalTokens += words.length;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        L.counts.set(w, (L.counts.get(w) || 0) + 1);
        if (!L.firstSeen.has(w)) L.firstSeen.set(w, now);
        L.lastSeen.set(w, now);

        // Surroundings: a symmetric window. Distance is not weighted —
        // at window 4 over spoken sentences the difference is inside the
        // noise, and weighting would imply a precision that is not there.
        const lo = Math.max(0, i - cfg.windowSize);
        const hi = Math.min(words.length - 1, i + cfg.windowSize);
        let ctx = L.contexts.get(w);
        if (!ctx) { ctx = new Map(); L.contexts.set(w, ctx); }
        for (let j = lo; j <= hi; j++) {
          if (j === i) continue;
          const n = words[j];
          ctx.set(n, (ctx.get(n) || 0) + 1);
          L.coTotal++;
        }
      }

      // Grammar: how one utterance's tags follow the last one's.
      if (Array.isArray(m.tags) && m.tags.length) {
        for (const t of m.tags) L.tagCounts.set(t, (L.tagCounts.get(t) || 0) + 1);
        if (L._lastTags) {
          for (const a of L._lastTags) {
            let row = L.tagTransitions.get(a);
            if (!row) { row = new Map(); L.tagTransitions.set(a, row); }
            for (const b of m.tags) row.set(b, (row.get(b) || 0) + 1);
          }
        }
        L._lastTags = m.tags.slice();
      }

      if (L.counts.size > cfg.maxVocab) prune();
      return { learned: words.length, vocab: L.counts.size };
    }

    // Drop the rarest words when the vocabulary outgrows its ceiling. A
    // word seen once two years ago is not part of how you speak now.
    function prune() {
      const sorted = [...L.counts.entries()].sort((a, b) => b[1] - a[1]);
      const keep = new Set(sorted.slice(0, cfg.pruneTo).map(e => e[0]));
      for (const w of [...L.counts.keys()]) {
        if (keep.has(w)) continue;
        L.counts.delete(w); L.contexts.delete(w);
        L.firstSeen.delete(w); L.lastSeen.delete(w);
      }
      for (const ctx of L.contexts.values()) {
        for (const n of [...ctx.keys()]) if (!keep.has(n)) ctx.delete(n);
      }
    }

    // ── Distributional vectors ───────────────────────────────────────

    // PPMI: log( P(w,c) / (P(w)·P(c)) ), floored at zero. Answers "do
    // these appear together more than chance", not "how often".
    function vector(word) {
      const ctx = L.contexts.get(word);
      const cw = L.counts.get(word) || 0;
      if (!ctx || cw < cfg.minCountForVector) return null;

      const v = new Map();
      for (const [n, cnt] of ctx) {
        const cn = L.counts.get(n) || 0;
        if (!cn) continue;
        const pmi = Math.log((cnt * L.totalTokens) / (cw * cn) + 1e-12);
        if (pmi > 0) v.set(n, pmi);
      }
      return v.size ? v : null;
    }

    function cosine(a, b) {
      if (!a || !b) return 0;
      let dot = 0, na = 0, nb = 0;
      for (const [, x] of a) na += x * x;
      for (const [, y] of b) nb += y * y;
      const small = a.size <= b.size ? a : b;
      const large = small === a ? b : a;
      for (const [k, x] of small) { const y = large.get(k); if (y) dot += x * y; }
      return (na && nb) ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
    }

    function similarity(a, b) {
      const mature = L.totalObservations >= cfg.minObservationsForSimilarity;
      const va = vector(a), vb = vector(b);
      if (!va || !vb) {
        return { score: 0, confidence: 0, basis: 'one or both words have too few observations' };
      }
      return {
        score: cosine(va, vb),
        confidence: mature ? Math.min(1, L.totalObservations / (cfg.minObservationsForSimilarity * 3)) : 0,
        basis: mature
          ? L.totalObservations + ' utterances observed'
          : 'only ' + L.totalObservations + ' utterances — below the ' +
            cfg.minObservationsForSimilarity + ' needed for this to mean anything',
      };
    }

    // Document-level similarity — the missing piece between neighbours()
    // (word-to-word) and what the lattice actually needs (node-to-node).
    // Centroid of each text's content-word PMI vectors, cosine of the
    // two centroids. Words below cfg.minCountForVector contribute
    // nothing to their side's centroid (vector() returns null for them)
    // rather than pulling the whole score toward zero — a text with one
    // mature word and four brand-new ones is scored on the one that
    // means something, same principle as neighbours()'s confidence field.
    function documentVector(text) {
      const words = tokenize(text);
      const centroid = new Map();
      let contributing = 0;
      for (const w of words) {
        const v = vector(w);
        if (!v) continue;
        contributing++;
        for (const [k, x] of v) centroid.set(k, (centroid.get(k) || 0) + x);
      }
      return contributing ? centroid : null;
    }

    // score in [0,1] (cosine only goes negative if PMI vectors did,
    // which they don't — PMI here is clamped positive in vector()).
    // confidence mirrors similarity()'s: whole-lexicon maturity, not
    // just these two texts, because a lexicon with 20 total utterances
    // can produce a confident-LOOKING cosine on two texts that happen
    // to share rare words — the number is real, what it MEANS isn't yet.
    function documentSimilarity(textA, textB) {
      const va = documentVector(textA), vb = documentVector(textB);
      const mature = L.totalObservations >= cfg.minObservationsForSimilarity;
      if (!va || !vb) {
        return { score: 0, confidence: 0, basis: 'one or both texts have too few observed words' };
      }
      return {
        score: cosine(va, vb),
        confidence: mature ? Math.min(1, L.totalObservations / (cfg.minObservationsForSimilarity * 3)) : 0,
        basis: mature ? L.totalObservations + ' utterances observed'
                      : 'only ' + L.totalObservations + ' utterances — below the ' +
                        cfg.minObservationsForSimilarity + ' needed for this to mean anything',
      };
    }

    // Words that keep the same company. This is the lexicon becoming
    // yours: "vault" near "encryption" and "integrity" because that is
    // where YOU put it, not because a dictionary says so.
    function neighbours(word, n) {
      const v = vector(word);
      if (!v) return { words: [], confidence: 0, basis: 'too few observations of "' + word + '"' };

      const out = [];
      for (const [other] of L.counts) {
        if (other === word) continue;
        const ov = vector(other);
        if (!ov) continue;
        const s = cosine(v, ov);
        if (s > 0.05) out.push({ word: other, score: s });
      }
      out.sort((a, b) => b.score - a.score);
      const mature = L.totalObservations >= cfg.minObservationsForSimilarity;
      return {
        words: out.slice(0, n || 10),
        confidence: mature ? 1 : L.totalObservations / cfg.minObservationsForSimilarity,
        basis: mature ? 'distributional, ' + L.totalObservations + ' utterances'
                      : 'PROVISIONAL — ' + L.totalObservations + ' utterances is not enough yet',
      };
    }

    // ── Grammar ──────────────────────────────────────────────────────

    function grammar() {
      let total = 0;
      for (const row of L.tagTransitions.values()) for (const c of row.values()) total += c;

      const productions = [];
      for (const [from, row] of L.tagTransitions) {
        const rowTotal = [...row.values()].reduce((a, b) => a + b, 0);
        for (const [to, c] of row) {
          productions.push({ from, to, count: c, probability: c / rowTotal });
        }
      }
      productions.sort((a, b) => b.count - a.count);

      return {
        productions,
        totalTransitions: total,
        mature: total >= cfg.minTransitionsForGrammar,
        basis: total >= cfg.minTransitionsForGrammar
          ? total + ' transitions observed'
          : 'PROVISIONAL — ' + total + ' of ' + cfg.minTransitionsForGrammar + ' transitions needed',
      };
    }

    function predictNextTag(tag) {
      const row = L.tagTransitions.get(tag);
      if (!row || !row.size) return { tag: null, probability: 0, basis: 'no transitions observed from ' + tag };
      const rowTotal = [...row.values()].reduce((a, b) => a + b, 0);
      let best = null, bestC = 0;
      for (const [to, c] of row) if (c > bestC) { bestC = c; best = to; }
      return {
        tag: best,
        probability: bestC / rowTotal,
        samples: rowTotal,
        basis: rowTotal >= 10 ? rowTotal + ' observations' : 'only ' + rowTotal + ' observations',
      };
    }

    // ── Ambiguity reduction ──────────────────────────────────────────
    // The concrete payoff. Whisper mishears domain words — "vault" as
    // "fault", "lattice" as "lettuce". Given candidates and the
    // surrounding words, the one whose learned company matches the
    // context wins.
    //
    // This does not correct anything on its own. It returns a ranking
    // and its confidence, and the caller decides — because a lexicon
    // silently rewriting what you said would be worse than a typo.
    function disambiguate(candidates, contextWords) {
      const ctx = (contextWords || []).map(w => String(w).toLowerCase()).filter(w => !FILLER.has(w));
      if (!candidates || candidates.length < 2) {
        return { best: candidates && candidates[0] || null, ranked: [], confidence: 0, basis: 'nothing to choose between' };
      }

      const ranked = candidates.map(c => {
        const word = String(c).toLowerCase();
        const v = vector(word);
        const count = L.counts.get(word) || 0;
        if (!v) return { word, score: 0, familiarity: count, reason: 'never observed' };

        // How much of the surrounding context is company this word keeps?
        let hit = 0, weight = 0;
        for (const cw of ctx) {
          const x = v.get(cw);
          if (x) { hit++; weight += x; }
        }
        return {
          word,
          score: ctx.length ? weight / ctx.length : 0,
          contextHits: hit,
          familiarity: count,
          reason: hit ? 'shares company with ' + hit + ' of ' + ctx.length + ' surrounding words'
                      : 'no shared context',
        };
      });

      ranked.sort((a, b) => (b.score - a.score) || (b.familiarity - a.familiarity));
      const top = ranked[0], second = ranked[1];
      const margin = top.score - (second ? second.score : 0);
      const mature = L.totalObservations >= cfg.minObservationsForSimilarity;

      return {
        best: top.score > 0 ? top.word : null,
        ranked,
        margin,
        confidence: (!mature || top.score === 0) ? 0 : Math.min(1, margin / (top.score || 1)),
        basis: !mature
          ? 'PROVISIONAL — the lexicon has seen ' + L.totalObservations + ' utterances'
          : (top.score === 0 ? 'no candidate matches the surrounding words' : top.reason),
      };
    }

    // Distinctive vocabulary, for Whisper's initial_prompt. Feeding the
    // model your own proper nouns and jargon is the single largest
    // accuracy gain available for personal speech — and it compounds:
    // better transcripts make a better lexicon makes a better prompt.
    function promptSeed(n) {
      const out = [];
      for (const [w, c] of L.counts) {
        if (c < 3 || w.length < 4) continue;
        // Distinctiveness: frequent for you, and not a generic word.
        out.push({ word: w, count: c, spread: (L.contexts.get(w) || new Map()).size });
      }
      out.sort((a, b) => (b.count * Math.log(2 + b.spread)) - (a.count * Math.log(2 + a.spread)));
      return out.slice(0, n || 40).map(x => x.word);
    }

    // ── Reporting ────────────────────────────────────────────────────

    function top(n) {
      return [...L.counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n || 25)
        .map(([word, count]) => ({
          word, count,
          firstSeen: L.firstSeen.get(word) || null,
          contextBreadth: (L.contexts.get(word) || new Map()).size,
        }));
    }

    // Words that are new AND already being used in varied company —
    // vocabulary that is actively entering your thinking, rather than
    // appearing once.
    function emerging(sinceIso, n) {
      const since = Date.parse(sinceIso || 0) || 0;
      const out = [];
      for (const [w, first] of L.firstSeen) {
        if (Date.parse(first) < since) continue;
        const c = L.counts.get(w) || 0;
        if (c < 3) continue;
        out.push({ word: w, count: c, firstSeen: first, contextBreadth: (L.contexts.get(w) || new Map()).size });
      }
      out.sort((a, b) => b.count - a.count);
      return out.slice(0, n || 15);
    }

    function maturity() {
      const g = grammar();
      return {
        observations: L.totalObservations,
        tokens: L.totalTokens,
        vocabulary: L.counts.size,
        vectorable: [...L.counts.values()].filter(c => c >= cfg.minCountForVector).length,
        transitions: g.totalTransitions,
        similarityReady: L.totalObservations >= cfg.minObservationsForSimilarity,
        grammarReady: g.mature,
        // Deliberately blunt. A progress number is a promise that it gets
        // better; the sentence says what it is currently good for.
        summary: L.totalObservations < cfg.minObservationsForSimilarity
          ? 'Learning. ' + L.totalObservations + ' of ~' + cfg.minObservationsForSimilarity +
            ' utterances before word relationships mean anything.'
          : 'Active. ' + L.counts.size + ' words, ' + g.totalTransitions + ' tag transitions.',
      };
    }

    // ── Persistence (module contract rule 4: return state, never write) ──

    function serialize() {
      const ctxOut = {};
      for (const [w, m] of L.contexts) {
        // Only vectorable words carry their context. The long tail is
        // most of the size and none of the signal.
        if ((L.counts.get(w) || 0) < cfg.minCountForVector) continue;
        ctxOut[w] = Object.fromEntries(m);
      }
      return {
        v: 1,
        totalObservations: L.totalObservations,
        totalTokens: L.totalTokens,
        coTotal: L.coTotal,
        counts: Object.fromEntries(L.counts),
        contexts: ctxOut,
        tagCounts: Object.fromEntries(L.tagCounts),
        tagTransitions: Object.fromEntries([...L.tagTransitions].map(([k, v]) => [k, Object.fromEntries(v)])),
        firstSeen: Object.fromEntries(L.firstSeen),
        lastSeen: Object.fromEntries(L.lastSeen),
      };
    }

    function hydrate(s) {
      if (!s || s.v !== 1) return false;
      L.totalObservations = s.totalObservations || 0;
      L.totalTokens = s.totalTokens || 0;
      L.coTotal = s.coTotal || 0;
      L.counts = new Map(Object.entries(s.counts || {}));
      L.contexts = new Map(Object.entries(s.contexts || {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
      L.tagCounts = new Map(Object.entries(s.tagCounts || {}));
      L.tagTransitions = new Map(Object.entries(s.tagTransitions || {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
      L.firstSeen = new Map(Object.entries(s.firstSeen || {}));
      L.lastSeen = new Map(Object.entries(s.lastSeen || {}));
      return true;
    }

    return {
      cfg, FILLER,
      tokenize, observe, prune,
      vector, cosine, similarity, neighbours, documentVector, documentSimilarity,
      grammar, predictNextTag, disambiguate, promptSeed,
      top, emerging, maturity,
      serialize, hydrate,
      get state() { return L; },
    };
  }

  return { create, DEFAULTS, FILLER };
});

// One instance for the application. Modules read it; only the capture
// bridge writes to it, so there is exactly one path by which your
// vocabulary changes.
if (typeof globalThis !== 'undefined' && !globalThis.MM_LEXICON) {
  globalThis.MM_LEXICON = (typeof module === 'object' && module.exports)
    ? module.exports.create()
    : globalThis.Lexicon.create();
}

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'lexicon',
    uuid: '4a3b2c1d-ai-8000-8000-lexicon00001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
    pure: true,
  });
}
