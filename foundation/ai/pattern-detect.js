// ═══════════════════════════════════════════════════════════════════
// PATTERN DETECT — foundation/ai/pattern-detect.js
//
// Two detectors, ported from the ALK/spatial "text-module" and
// GapHunter component drops (2026-08-22), adapted from ESM+SISO-bus
// to this codebase's plain-global-script style. Zero external
// dependencies, same as lexicon.js — word lists and regex, nothing
// imported.
//
// WHY THESE TWO, NOT THE WHOLE DUMP:
// The drop contained a much larger system — topic modeling (LDA),
// named-entity tracking, discourse coherence, five more GapHunter
// detectors (shadow field, contrastive, negative space, structural,
// reversal), all wired to a SISO event bus this app doesn't have.
// Porting all of it in one pass means guessing at six more tag
// semantics and an event-bus adapter nobody asked for. These two are
// the ones with an unambiguous, immediate payoff and zero design
// decisions left open:
//
//   1. SEMANTIC FIELDS — the tagging bug fix. _vlExtractTags() in
//      nexus-engine.js only tagged a node if the LITERAL word
//      "emotional" or "relational" appeared in the text. This
//      classifies by co-occurring vocabulary instead (say "scared",
//      "overwhelmed", "numb" and you get EMOTION — you never had to
//      say the word "emotional").
//
//   2. WEAK ASSUMPTION HUNTER — surfaces load-bearing claims made
//      with no hedge, no evidence, or an unnamed agent ("they always
//      do this"). This is GapHunter's own taxonomy calling ASSUMPTION
//      the highest-criticality gap type that exists (1.00 — "the
//      most avoided; always most load-bearing"), which is also
//      exactly the GAP_TYPE taxonomy already referenced as canon
//      elsewhere in this project. Everything else in the dump
//      (shadow field, contrastive, negative space, structural,
//      reversal) is available to port the same way if wanted — each
//      is self-contained, none were touched here.
//
// UUID: 4a3b2c1d-ai-8000-8000-patterndetect1
// ═══════════════════════════════════════════════════════════════════

'use strict';

const MM_PATTERNS = (() => {

  // ── Shared helpers (ported verbatim from gap-hunter-core.js) ──────
  function r4(n) { return Math.round((n ?? 0) * 10000) / 10000; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function tokenize(text) {
    return (text ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean);
  }
  const CONF = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });
  function conf(v) { return v >= 0.65 ? CONF.HIGH : v >= 0.35 ? CONF.MEDIUM : CONF.LOW; }

  // ── 1. SEMANTIC FIELDS — ported from ALK text-module.js ───────────
  // Presence/absence per field, not mutually exclusive — EMOTION and
  // BODY can co-activate, same as the source. Word lists verbatim.
  const SEMANTIC_FIELDS = Object.freeze({
    SELF:         new Set(['i','me','my','mine','myself',"i'm","i've","i'll","i'd"]),
    OTHER:        new Set(['you','your','yours','they','them','their','he','she','his','her']),
    PAST:         new Set(['was','were','had','did','used','before','ago','yesterday','last','previous','once','already']),
    FUTURE:       new Set(['will','shall','going','plan','hope','expect','tomorrow','soon','next','eventually','might','could']),
    BODY:         new Set(['body','pain','tired','sick','head','stomach','chest','breath','sleep','hands','eyes','feel','felt']),
    EMOTION:      new Set(['feel','feeling','felt','scared','angry','sad','happy','anxious','afraid','love','hate','hurt','overwhelmed','numb','empty','joy','grief']),
    COGNITION:    new Set(['think','thought','know','understand','believe','wonder','question','confused','clear','realize','aware','notice','remember','forget']),
    RELATIONSHIP: new Set(['together','relationship','partner','friend','family','mother','father','sister','brother','husband','wife','trust','bond','connect','alone']),
    CONFLICT:     new Set(['conflict','fight','argument','disagree','wrong','blame','fault','problem','struggle','difficult','hard','issue','tension','break']),
    RESOLUTION:   new Set(['resolve','solution','fix','better','improve','heal','reconcile','accept','forgive','move','forward','peace','okay','good']),
    UNCERTAINTY:  new Set(['maybe','perhaps','possibly','might','unsure','unclear','confused','wondering','question']),
    AGENCY:       new Set(['choose','chose','decide','decided','control','power','able','can','could','capable','responsible','action','act','made']),
  });

  // Returns fields ordered by hit count, richest first — so when a
  // caller takes fields[0] as "the" tag (as the lattice canvas does
  // for node color), it's the DOMINANT field, not an arbitrary one.
  function classifySemanticFields(text, minHits) {
    const words = tokenize(text);
    if (!words.length) return [];
    const min = minHits || 1;
    const counts = [];
    for (const [field, set] of Object.entries(SEMANTIC_FIELDS)) {
      let n = 0;
      for (const w of words) if (set.has(w)) n++;
      if (n >= min) counts.push({ field, n });
    }
    counts.sort((a, b) => b.n - a.n);
    return counts.map(c => c.field);
  }

  // ── 2. WEAK ASSUMPTION HUNTER — ported from gap-hunter-core.js ────
  // Stateless per call (the source kept sliding windows for its own
  // session-trend reporting; this drops that state, since MASTERMIND
  // already has MMDelta for trend-over-time — see stats() below for
  // the one piece of that worth keeping: a running fire count).
  const _ASSERTION = /\b(is|are|was|were|will be|must be|clearly|obviously|definitely|certainly|absolutely|always|never|of course)\b/;
  const _HEDGE     = /\b(maybe|perhaps|might|could|seems|appears|possibly|probably|somewhat|kind of|sort of|i think|i believe|i feel)\b/;
  const _LEAP      = /\b(therefore|so|that's why|which means|hence|obviously because|clearly because|that proves|that shows)\b/;
  const _EVIDENCE  = /\b(because|since|given that|as evidenced|data shows|research|studies|the fact that|we know that)\b/;
  const _UNIVERSAL = /\b(everyone|nobody|always|never|all|none|every single|no one|the whole|completely|totally|entirely)\b/;
  const _BOUNDED   = /\b(some|most|many|often|usually|generally|typically|in my experience|in this case)\b/;
  const _VAGUE     = /\b(they|people|someone|everybody|the system|society|those people|you know how|you know what)\b/;
  const _CLAIM     = /\b(is|was|will|must)\b/;

  const QUESTIONS = {
    assertion_without_evidence: 'What is the evidence for this? What would have to be false for this not to be true?',
    causal_leap:                "What's the missing step between the premise and this conclusion?",
    universalization:           'Who or what is the exception? What would falsify "always/never/everyone"?',
    unnamed_agent:              'Who specifically? What is the source of this attribution?',
  };

  let _sessionFinds = 0;

  // prevTexts: array of recent node texts (a few is enough — the
  // source used the last 4), for the unnamed-agent-follows-a-claim
  // check. Optional; omitting it just weakens that one axis.
  function detectWeakAssumption(text, prevTexts) {
    const words = tokenize(text);
    if (!words.length) return null;
    const joined = words.join(' ');
    const prev = prevTexts || [];

    const assertHits = (joined.match(_ASSERTION) || []).length;
    const hedgeHits   = (joined.match(_HEDGE)     || []).length;
    const assertScore = clamp((assertHits - hedgeHits * 1.5) / Math.max(1, words.length) * 8, 0, 1);

    const leaps     = (joined.match(_LEAP)     || []).length;
    const evidenced = (joined.match(_EVIDENCE) || []).length;
    const causalScore = clamp(leaps * 0.4 - evidenced * 0.3, 0, 1);

    const uHits = (joined.match(_UNIVERSAL) || []).length;
    const bHits = (joined.match(_BOUNDED)   || []).length;
    const universalScore = clamp((uHits * 0.5 - bHits * 0.25) / Math.max(1, words.length) * 6, 0, 1);

    const vagueHits = (joined.match(_VAGUE) || []).length;
    const followsAssertion = prev.some(t => _CLAIM.test(t));
    const agentScore = clamp(vagueHits * 0.3 * (followsAssertion ? 1.5 : 1), 0, 1);

    const composite = clamp(
      assertScore    * 0.30 +
      causalScore    * 0.30 +
      universalScore * 0.25 +
      agentScore      * 0.15, 0, 1);

    if (composite < 0.20) return null;
    _sessionFinds++;

    const axes = [
      { name: 'assertion_without_evidence', score: assertScore },
      { name: 'causal_leap',                score: causalScore },
      { name: 'universalization',           score: universalScore },
      { name: 'unnamed_agent',              score: agentScore },
    ].sort((a, b) => b.score - a.score);

    const dominant = axes[0];
    return {
      subtype:    dominant.name,
      score:      r4(composite),
      confidence: conf(composite),
      question:   QUESTIONS[dominant.name] || 'What is assumed here that has not been examined?',
      axes:       axes.map(a => ({ name: a.name, score: r4(a.score) })),
      // Matches the source's own framing exactly — a signal, not a verdict.
      signal_note: 'This is a detected pattern, not a judgment. Assumptions are necessary — this surfaces unexamined ones.',
    };
  }

  function stats() { return { weakAssumptionFinds: _sessionFinds }; }

  return {
    SEMANTIC_FIELDS,
    classifySemanticFields,
    detectWeakAssumption,
    stats,
  };
})();

if (typeof window !== 'undefined') window.MM_PATTERNS = MM_PATTERNS;
if (typeof module !== 'undefined' && module.exports) module.exports = MM_PATTERNS;

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'pattern-detect',
    uuid: '4a3b2c1d-ai-8000-8000-patterndetect1',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
  });
}
