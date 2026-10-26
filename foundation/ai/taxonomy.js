// ═══════════════════════════════════════════════════════════════════
// TAXONOMY
// foundation/ai/taxonomy.js
//
// Where a node gets its domain, its intelligence type, and its place in
// the rest of MASTERMIND — automatically, locally, and correctably.
//
// PURE. No DOM, no network, no model.
//
// ─────────────────────────────────────────────────────────────────
// THE RULE THAT KEEPS THIS FROM BECOMING CLUTTER
//
// You never choose a category. The v7 build had 22 intelligence types,
// 8 metadata categories, 6 domains and 4 modes — and needed NINE TABS
// to surface them. The clutter WAS the taxonomy. Every category you are
// asked to pick is a decision at the exact moment you are trying not to
// make decisions.
//
// So: the system proposes, and you only ever CORRECT. And a correction
// is worth more than a seed, permanently, because it is a label in your
// own vocabulary about your own thought.
//
// ─────────────────────────────────────────────────────────────────
// ABSTENTION IS A FEATURE
//
// The seed corpus is 16 library entries and 23 scenarios carrying 22
// intelligence types — under two examples per class. That is not enough
// to classify confidently and this module says so rather than guessing.
// Below threshold it returns null with a reason.
//
// An unassigned node is honest. A confidently wrong intelligence type
// propagates into the domain map, the open loops and eventually into
// what the system tells you about how you think. Silence is cheaper.
//
// ─────────────────────────────────────────────────────────────────
// OPEN LOOPS
//
// Curiosity, computed. Not "here are topics you might like" — those are
// recommendations, and a recommendation is someone else's question.
// These are YOUR unfinished business, found mechanically:
//
//   • a question you asked and never returned to
//   • a thread you dropped — a tag used once and abandoned
//   • a domain that has gone quiet
//   • a seed you flagged and never promoted
//   • a belief you marked 'testing' and never re-rated
//
// Each is a gap in something you already started. That is what makes it
// expand knowledge rather than add noise.
//
// UUID: 4a3b2c1d-ai-8000-8000-taxonomy0001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.Taxonomy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const DEFAULTS = {
    minScore: 0.14,          // below this, abstain
    minMargin: 0.04,         // and the winner must clearly beat second place
    correctionWeight: 6,     // your label counts this much more than a seed
    dormantDays: 21,
    droppedThreadMaxUses: 1,
    minWordLength: 4,
  };

  const INTUITION = Object.freeze({
    SOMATIC:    'somatic',      // felt in the body before it was thought
    PATTERN:    'pattern',      // recognised, not derived
    RELATIONAL: 'relational',   // about a person or a dynamic
    AESTHETIC:  'aesthetic',    // it is right because it fits
    ANALYTIC:   'analytic',     // reasoned to, not sensed
  });

  // Cheap surface cues. Deliberately shallow — an intuition type is a
  // guess about HOW something arrived, and a shallow guess that abstains
  // is better than a deep one that is confidently wrong.
  const INTUITION_CUES = [
    { type: INTUITION.SOMATIC,    re: /\b(feel|felt|gut|body|tense|tight|heavy|drained|energ|tired|ache|breath)\w*/i },
    { type: INTUITION.PATTERN,    re: /\b(again|every time|always|keep|noticed|recurring|same|pattern|cycle)\w*/i },
    { type: INTUITION.RELATIONAL, re: /\b(they|she|he|them|conversation|said|relationship|team|friend|family|people)\b/i },
    { type: INTUITION.AESTHETIC,  re: /\b(elegant|clean|ugly|clumsy|fits|right|wrong|beautiful|feels off|clunky)\w*/i },
    { type: INTUITION.ANALYTIC,   re: /\b(because|therefore|implies|follows|so that|which means|given that|if.*then)\b/i },
  ];

  const REASONING = Object.freeze({
    DEDUCTION: 'deduction',   // follows necessarily
    INDUCTION: 'induction',   // pattern from instances
    ABDUCTION: 'abduction',   // inference to the best explanation
    ANALOGY:   'analogy',     // structure carried across domains
  });

  const REASONING_CUES = [
    { type: REASONING.DEDUCTION, re: /\b(therefore|must be|has to be|follows that|which means|so it)\b/i },
    { type: REASONING.INDUCTION, re: /\b(every time|always|usually|tends to|in general|whenever)\b/i },
    { type: REASONING.ABDUCTION, re: /\b(maybe|probably|might be because|best explanation|what if|could be that|i suspect)\b/i },
    { type: REASONING.ANALOGY,   re: /\b(like|as if|same as|similar to|reminds me|just like|kind of a)\b/i },
  ];

  function create(opts) {
    const cfg = Object.assign({}, DEFAULTS, opts || {});

    const T = {
      cfg,
      // class → Map(word → weight)
      intelProfiles: new Map(),
      domainProfiles: new Map(),
      // corrections the person made: {text, field, value}
      corrections: [],
      classified: 0,
      abstained: 0,
    };

    // Shared with the lexicon when it is present. Without it, "question",
    // "about" and "really" count as topical overlap — so two unrelated
    // questions look like one revisiting the other, and a real open loop
    // silently disappears. Found by a test on 2026-08-12.
    function _filler() {
      if (typeof Lexicon !== 'undefined' && Lexicon.FILLER) return Lexicon.FILLER;
      if (typeof require === 'function') {
        try { return require('./lexicon.js').FILLER; } catch (e) {}
      }
      return new Set();
    }

    function words(text) {
      const stop = _filler();
      return [...new Set(String(text || '').toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= cfg.minWordLength && !stop.has(w)))];
    }

    function _addTo(map, cls, ws, weight) {
      let p = map.get(cls);
      if (!p) { p = new Map(); map.set(cls, p); }
      for (const w of ws) p.set(w, (p.get(w) || 0) + weight);
    }

    // ── Seeding from the salvaged corpus ─────────────────────────────
    // library.json entries and scenarios.json carry hand-applied
    // intelligence types and domains. That is ~40 labelled examples in
    // your own vocabulary — the schema AND the evaluation set, already
    // written, five months before anything needed them.

    function seed(sources) {
      const s = sources || {};
      let n = 0;

      for (const entry of s.library || []) {
        const ws = words([entry.name, entry.desc, (entry.uses || []).join(' ')].join(' '));
        for (const i of entry.intel || []) { _addTo(T.intelProfiles, i, ws, 1); n++; }
        for (const d of entry.domains || []) { _addTo(T.domainProfiles, d, ws, 1); n++; }
      }

      for (const group of Object.values(s.scenarios || {})) {
        for (const sc of group || []) {
          const ws = words([sc.title, sc.text, sc.action].join(' '));
          for (const i of sc.intel || []) { _addTo(T.intelProfiles, i, ws, 1); n++; }
        }
      }

      // The word bank is a keyword→domain map. Substring keys, so they
      // are expanded against nothing here — they act as direct evidence.
      for (const [domain, keys] of Object.entries(s.wordbankDomains || {})) {
        _addTo(T.domainProfiles, domain, keys || [], 2);
        n++;
      }

      return { labels: n, intelClasses: T.intelProfiles.size, domainClasses: T.domainProfiles.size };
    }

    // ── Classification ───────────────────────────────────────────────

    function _score(map, ws) {
      const out = [];
      for (const [cls, profile] of map) {
        let hit = 0, weight = 0;
        for (const w of ws) {
          // Substring match, because the wordbank keys are stems
          // ("cognit" must catch "cognitive", "cognition").
          for (const [pw, pwWeight] of profile) {
            if (w === pw || (pw.length >= 4 && w.startsWith(pw))) { hit++; weight += pwWeight; break; }
          }
        }
        if (hit) out.push({ cls, score: weight / Math.sqrt(ws.length * profile.size), hits: hit });
      }
      out.sort((a, b) => b.score - a.score);
      return out;
    }

    function _decide(ranked, ws, field) {
      if (!ranked.length) {
        T.abstained++;
        return { value: null, confidence: 0, basis: 'no vocabulary in common with any known ' + field, ranked: [] };
      }
      const top = ranked[0];
      const second = ranked[1];
      const margin = top.score - (second ? second.score : 0);

      if (top.score < cfg.minScore || margin < cfg.minMargin) {
        T.abstained++;
        return {
          value: null,
          confidence: 0,
          basis: 'too close to call — ' + top.cls + ' ' + top.score.toFixed(3) +
                 (second ? ' vs ' + second.cls + ' ' + second.score.toFixed(3) : '') +
                 '. Left unassigned rather than guessed.',
          ranked: ranked.slice(0, 3),
        };
      }

      T.classified++;
      return {
        value: top.cls,
        confidence: Math.min(1, margin / top.score),
        basis: top.hits + ' shared term(s) with ' + top.cls,
        ranked: ranked.slice(0, 3),
      };
    }

    function classify(text) {
      const ws = words(text);
      const intuition = _cue(text, INTUITION_CUES, 'intuition');
      const reasoning = _cue(text, REASONING_CUES, 'reasoning');

      return {
        domain:       _decide(_score(T.domainProfiles, ws), ws, 'domain'),
        intelligence: _decide(_score(T.intelProfiles, ws), ws, 'intelligence type'),
        intuition,
        reasoning,
        words: ws.length,
      };
    }

    // Cue matching. Returns null when more than one fires, because two
    // cues firing means the signal is not clean enough to name.
    function _cue(text, cues, field) {
      const hits = cues.filter(c => c.re.test(String(text || '')));
      if (hits.length !== 1) {
        return {
          value: null,
          confidence: 0,
          basis: hits.length === 0 ? 'no clear signal' : 'ambiguous — ' + hits.map(h => h.type).join(' and ') + ' both present',
        };
      }
      return { value: hits[0].type, confidence: 0.5, basis: 'surface cue only — a guess about how it arrived, not a measurement' };
    }

    // ── Correction: this is the "learns the user" part ───────────────
    // A correction is ground truth in your own vocabulary and outweighs
    // the seed corpus permanently.

    function correct(text, field, value) {
      if (!['domain', 'intelligence'].includes(field)) {
        throw new Error('correct: field must be domain or intelligence');
      }
      const ws = words(text);
      if (!ws.length) return { learned: false, reason: 'nothing to learn from' };

      const map = field === 'domain' ? T.domainProfiles : T.intelProfiles;
      _addTo(map, value, ws, cfg.correctionWeight);
      T.corrections.push({ text: String(text).slice(0, 200), field, value, at: new Date().toISOString() });

      return { learned: true, field, value, weight: cfg.correctionWeight, corrections: T.corrections.length };
    }

    // ── Open loops ───────────────────────────────────────────────────
    // Computed from nodes you already made. Not recommendations.

    function openLoops(nodes, now) {
      const t = now || Date.now();
      const list = nodes || [];
      const loops = [];

      // 1. Questions never returned to. A question whose content words
      //    never reappear in anything said afterwards.
      const questions = list.filter(n => n.type === 'question' || /\?\s*$/.test(n.text || ''));
      for (const q of questions) {
        // Only distinctive words count as "returned to". Boilerplate
        // shared by any two questions is not a revisit.
        const stop = _filler();
        const qw = words(q.text).filter(w => w.length > 4 && !stop.has(w) &&
          !['question', 'questions', 'wonder', 'wondering'].includes(w));
        if (!qw.length) continue;
        const after = list.filter(n => n !== q && Date.parse(n.created || 0) > Date.parse(q.created || 0));
        const revisited = after.some(n => {
          const nw = words(n.text);
          return qw.filter(w => nw.includes(w)).length >= 2;
        });
        if (!revisited) {
          loops.push({
            kind: 'UNANSWERED_QUESTION', nodeId: q.id, text: q.text,
            ageDays: Math.round((t - Date.parse(q.created || t)) / 86400000),
            why: 'You asked this and nothing since has come back to it.',
          });
        }
      }

      // 2. Dropped threads — a tag used once and never again.
      const tagUse = new Map();
      for (const n of list) for (const tag of n.tags || []) {
        if (!tagUse.has(tag)) tagUse.set(tag, []);
        tagUse.get(tag).push(n);
      }
      for (const [tag, ns] of tagUse) {
        if (ns.length <= cfg.droppedThreadMaxUses) {
          loops.push({
            kind: 'DROPPED_THREAD', tag, nodeId: ns[0].id, text: ns[0].text,
            why: 'You named this once and never returned to it.',
          });
        }
      }

      // 3. Dormant domains — active before, silent now.
      const domainLast = new Map();
      for (const n of list) {
        const d = n.domain || (n.payload && n.payload.domain);
        if (!d) continue;
        const when = Date.parse(n.created || 0);
        if (!domainLast.has(d) || when > domainLast.get(d).when) domainLast.set(d, { when, node: n });
        }
      for (const [d, info] of domainLast) {
        const days = (t - info.when) / 86400000;
        if (days > cfg.dormantDays) {
          loops.push({
            kind: 'DORMANT_DOMAIN', domain: d, ageDays: Math.round(days),
            why: 'You were thinking here and stopped ' + Math.round(days) + ' days ago.',
          });
        }
      }

      // 4. Seeds never promoted into horizon planning.
      for (const n of list) {
        if (n.seed && n.seed.flagged && !n.seed.horizonId) {
          loops.push({
            kind: 'UNPROMOTED_SEED', nodeId: n.id, text: n.text,
            priority: n.seed.priority || null,
            why: 'You marked this as something you wanted. It never became a plan.',
          });
        }
      }

      // 5. Beliefs left in 'testing' — the accelerated-learning loop.
      for (const n of list) {
        if (n.confidence && n.confidence.level === 'testing') {
          const days = (t - Date.parse(n.confidence.updatedAt || n.created || t)) / 86400000;
          if (days > cfg.dormantDays) {
            loops.push({
              kind: 'UNRESOLVED_BELIEF', nodeId: n.id, text: n.text,
              ageDays: Math.round(days),
              why: 'You marked this as testing and have not re-rated it since.',
            });
          }
        }
      }

      // Oldest first: the longest-open loop is the one most likely to
      // have been genuinely forgotten rather than deliberately parked.
      loops.sort((a, b) => (b.ageDays || 0) - (a.ageDays || 0));
      return loops;
    }

    // ── Reporting ────────────────────────────────────────────────────

    function maturity() {
      const seeds = [...T.intelProfiles.values()].reduce((n, p) => n + p.size, 0);
      return {
        intelligenceClasses: T.intelProfiles.size,
        domainClasses: T.domainProfiles.size,
        seedTerms: seeds,
        corrections: T.corrections.length,
        classified: T.classified,
        abstained: T.abstained,
        abstentionRate: (T.classified + T.abstained) ? T.abstained / (T.classified + T.abstained) : 0,
        summary: T.corrections.length < 10
          ? 'Seeded only. ' + T.intelProfiles.size + ' intelligence types from ~40 examples — under two each, so it abstains often. Correcting it is what makes it yours.'
          : T.corrections.length + ' corrections learned. Abstaining on ' +
            Math.round(100 * (T.abstained / Math.max(1, T.classified + T.abstained))) + '% of nodes.',
      };
    }

    function serialize() {
      const dump = (m) => Object.fromEntries([...m].map(([k, v]) => [k, Object.fromEntries(v)]));
      return {
        v: 1,
        intelProfiles: dump(T.intelProfiles),
        domainProfiles: dump(T.domainProfiles),
        corrections: T.corrections,
        classified: T.classified,
        abstained: T.abstained,
      };
    }

    function hydrate(s) {
      if (!s || s.v !== 1) return false;
      const load = (o) => new Map(Object.entries(o || {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
      T.intelProfiles = load(s.intelProfiles);
      T.domainProfiles = load(s.domainProfiles);
      T.corrections = s.corrections || [];
      T.classified = s.classified || 0;
      T.abstained = s.abstained || 0;
      return true;
    }

    return {
      cfg, INTUITION, REASONING,
      words, seed, classify, correct, openLoops, maturity,
      serialize, hydrate,
      get state() { return T; },
    };
  }

  return { create, DEFAULTS, INTUITION, REASONING, INTUITION_CUES, REASONING_CUES };
});

// One instance, seeded from the salvaged corpus at first use. The seed
// data ships in assets/salvage-v7/ — 16 library entries and 23 scenarios
// carrying hand-applied intelligence types, written in March and
// unlabelled for anything until now.
if (typeof globalThis !== 'undefined' && !globalThis.MM_TAXONOMY) {
  const api = (typeof module === 'object' && module.exports) ? module.exports : globalThis.Taxonomy;
  globalThis.MM_TAXONOMY = api.create();
  globalThis.MM_TAXONOMY_SEED = async function (fetchJson) {
    try {
      const [library, scenarios, wordbankDomains] = await Promise.all([
        fetchJson('assets/salvage-v7/library.json'),
        fetchJson('assets/salvage-v7/scenarios.json'),
        fetchJson('assets/salvage-v7/wordbankDomains.json'),
      ]);
      return globalThis.MM_TAXONOMY.seed({ library, scenarios, wordbankDomains });
    } catch (e) {
      if (typeof MMLog !== 'undefined') MMLog.warn('taxonomy', 'Could not seed: ' + e.message);
      return null;
    }
  };
}

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'taxonomy',
    uuid: '4a3b2c1d-ai-8000-8000-taxonomy0001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
    pure: true,
  });
}
