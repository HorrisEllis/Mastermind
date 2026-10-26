'use strict';
// liminal.js — gap detection, ported from the inline Liminal engine in
// people-module-raven_negotiation.html (which was itself ported from
// @spatial/liminal). Replaces the earlier gap-minimal.js placeholder.
//
// Real changes from the HTML version:
//   - ledger persists via meta.ledger (append-only ndjson) instead of an
//     in-memory array capped at 500 and lost on refresh — AXIOMS §2.1.
//   - per-speaker trust persists via meta.invariant instead of a closure
//     Map — same reason.
//   - never drops the signal (AXIOMS-adjacent rfr2 law: outputs are
//     signals, not diagnoses — a lens annotates, it does not gate).
//
// data shape this plugin reacts to: { speaker, text }
// annotates: data.gaps = [{ type, score, question, excerpt, snr }, ...]

const GAP = {
  SHADOW: 'SHADOW', NEGATIVE_SPACE: 'NEGATIVE_SPACE', REVERSAL: 'REVERSAL',
  ASSUMPTION: 'ASSUMPTION', OSCILLATORY: 'OSCILLATORY', RELATIONAL: 'RELATIONAL',
  STRUCTURAL: 'STRUCTURAL', CONTRASTIVE: 'CONTRASTIVE', FIELD: 'FIELD',
  EXISTENTIAL: 'EXISTENTIAL', DRIFT: 'DRIFT', FORCED: 'FORCED',
};

const PATTERNS = [
  { type: GAP.REVERSAL,       re: /\b(fine|okay|whatever|sure|doesn't matter|it's fine)\b/i,
    q: 'What is actually not fine here?', w: 0.75 },
  { type: GAP.SHADOW,         re: /\b(always|never|everyone|nobody|they all)\b/i,
    q: 'What specific instance is this generalizing from?', w: 0.65 },
  { type: GAP.NEGATIVE_SPACE, re: /\b(i don't know|not sure|maybe|kind of|sort of)\b/i,
    q: 'What is being circled without landing?', w: 0.55 },
  { type: GAP.ASSUMPTION,     re: /\b(obviously|of course|clearly|everyone knows|naturally)\b/i,
    q: 'What assumption is being treated as fact?', w: 0.70 },
  { type: GAP.OSCILLATORY,    re: /\b(back and forth|keep going|again|cycle|same thing)\b/i,
    q: 'What is the underlying driver of this oscillation?', w: 0.80 },
  { type: GAP.RELATIONAL,     re: /\b(gaslighting|manipulat|control|toxic|abuse)\b/i,
    q: 'What relational dynamic is being named here?', w: 0.85 },
  { type: GAP.EXISTENTIAL,    re: /\b(why am i|what's the point|who am i|meaning|purpose|god|exist)\b/i,
    q: 'What existential question is alive underneath this?', w: 0.75 },
  { type: GAP.CONTRASTIVE,    re: /\b(but|however|yet|still|even though|despite)\b/i,
    q: 'What two things are in tension here?', w: 0.45 },
  { type: GAP.FORCED,         re: /\b(have to|need to|must|can't stop|forced|no choice)\b/i,
    q: 'What is being held against its natural position?', w: 0.70 },
  { type: GAP.DRIFT,          re: /\b(used to|before|changed|different now|not like that anymore)\b/i,
    q: 'What baseline has quietly shifted?', w: 0.65 },
  { type: GAP.STRUCTURAL,     re: /\b(the system|society|world|they|the rules|structure)\b/i,
    q: 'What structural frame is shaping this?', w: 0.50 },
  { type: GAP.FIELD,          re: /\b(energy|vibe|feels like|something off|tension|weird)\b/i,
    q: 'What is the field geometry here?', w: 0.60 },
];

// ── Per-speaker trust gate (entropy / consistency / pattern / Bayesian) ──────
const THRESHOLD = 0.45, PRIOR = 0.6, LR = 0.08, DECAY = 0.02;

function entropy(text) {
  if (!text || text.length < 3) return 0;
  const freq = {};
  for (const c of text.toLowerCase()) freq[c] = (freq[c]||0)+1;
  const len = text.length;
  let h = 0;
  for (const k in freq) { const p = freq[k]/len; h -= p*Math.log2(p); }
  return Math.min(1, h/4);
}

function trustGate(inv, sourceId, text) {
  const trustKey = 'liminal:trust:' + sourceId;
  const histKey  = 'liminal:trust-hist:' + sourceId;
  let trust = inv.get(trustKey); if (trust == null) trust = PRIOR;
  let hist  = inv.get(histKey)  || [];

  const entScore = entropy(text);
  const recent = hist.slice(-5).map(x => x.score);
  const avgRecent = recent.length ? recent.reduce((a,b)=>a+b,0)/recent.length : 0.5;
  const consistScore = recent.length < 2 ? 0.8 : 1 - Math.abs(entScore - avgRecent)*0.5;
  const lastText = hist.length ? hist[hist.length-1].text : '';
  const patternScore = text === lastText ? 0.1 : 0.9;

  const snr = (entScore*0.35 + consistScore*0.30 + patternScore*0.20 + trust*0.15);
  const passed = snr >= THRESHOLD;
  trust = Math.min(0.99, Math.max(0.05, trust + (passed ? LR : -DECAY)));

  hist.push({ text: text.slice(0,50), score: snr, ts: Date.now() });
  if (hist.length > 100) hist.shift();

  inv.set(trustKey, trust);
  inv.set(histKey, hist);

  return { snr: +snr.toFixed(3), passed, trust: +trust.toFixed(3) };
}

const LEDGER_ID = 'liminal-gaps';

module.exports = {
  name: 'liminal',
  description: '12-pattern gap detection + per-speaker trust gating. Never drops — annotates only.',
  priority: 20,

  process(data, meta /*, config */) {
    if (!data || typeof data.text !== 'string') return data;

    const speaker = data.speaker || 'unknown';
    const gaps = [];

    for (const pat of PATTERNS) {
      if (pat.re.test(data.text)) {
        const snrResult = trustGate(meta.invariant, speaker, data.text);
        const score = +(pat.w * snrResult.trust).toFixed(3);
        gaps.push({
          type: pat.type, score, question: pat.q,
          excerpt: data.text.slice(0,80), speaker, snr: snrResult.snr,
        });
      }
    }

    data.gaps = gaps;

    for (const g of gaps) {
      meta.ledger.append(LEDGER_ID, g);
      meta.bus.emit('liminal:gap', { ...g, ts: Date.now() });
    }

    return data; // never drop — signal, not gate
  },

  // exposed so a CLI/UI can pull aggregate pressure without re-deriving it
  summary(meta) {
    const entries = meta.ledger.tail(LEDGER_ID, 500);
    const agg = {};
    for (const g of entries) {
      if (!agg[g.type]) agg[g.type] = { type:g.type, count:0, maxScore:0, totalScore:0, question:g.question, excerpts:[] };
      agg[g.type].count++;
      agg[g.type].totalScore += g.score;
      if (g.score > agg[g.type].maxScore) agg[g.type].maxScore = g.score;
      if (agg[g.type].excerpts.length < 2) agg[g.type].excerpts.push(g.excerpt);
    }
    return Object.values(agg)
      .map(a => ({ ...a, pressure: +(a.totalScore / Math.max(1,a.count)).toFixed(3) }))
      .sort((a,b) => b.totalScore - a.totalScore);
  },

  ui: {
    panel: 'gaps',
    widget: 'event-stream',
    emits: ['liminal:gap'],
  },
};

module.exports.GAP = GAP;
module.exports.PATTERNS = PATTERNS;
