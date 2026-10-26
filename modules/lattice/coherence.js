// ═══════════════════════════════════════════════════════════════════
// COHERENCE ENGINE — modules/lattice/coherence.js
// v1.0.0
//
// The lattice connects things. This watches what those connections
// MEAN, automatically, on every single thing that enters:
//
//   RIPPLE        — what you just wrote touches a Horizon seed,
//                   commitment or end-state. "This contributes to X."
//   CONTRADICTION — you have said the opposite before. Same subject,
//                   opposite polarity.
//   INCOHERENCE   — this conflicts with a commitment you actually made,
//                   which is a heavier thing than contradicting an
//                   idle thought.
//
// Also maps intelligence types automatically from lattice activity into
// ALM, so "Intel" stops being a panel you maintain by hand.
//
// HONESTY: polarity detection is negation-marker counting, not natural
// language understanding. It will miss sarcasm, conditionals and
// anything subtle. It is deliberately tuned to stay quiet — high
// topical overlap AND opposite polarity — because a detector that cries
// wolf gets ignored, and being ignored is worse than being silent.
// ═══════════════════════════════════════════════════════════════════

'use strict';

// GRAMMATICAL negation only. Semantic negatives ('avoid', 'stop',
// 'fail', 'reject') were in here and caused a real false negative: a
// commitment that merely MENTIONED avoiding read as negative, so
// "I will not do it" matched its polarity and the conflict went
// undetected. Words about avoidance are subject matter, not negation.
const COH_NEGATIONS = new Set(['no','not','never','cant','cannot','wont','dont','doesnt','didnt','shouldnt','wouldnt','couldnt','isnt','arent','wasnt','werent','nothing','none','nobody','without']);
const COH_OPPOSITES = [['always','never'],['must','mustnt'],['will','wont'],['should','shouldnt'],['increase','decrease'],['start','stop'],['more','less'],['open','closed'],['keep','drop'],['build','destroy']];

const COH_CONTRA_MIN_OVERLAP = 0.22;  // topical overlap floor before polarity even matters
const COH_RIPPLE_MIN_TAGS    = 1;     // shared distinctive tags with a goal-bearing node
const COH_LOOKBACK           = 400;   // how far back to scan

function _cohWords(text) {
  return String(text || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z\s]/g, ' ')
    .split(/\s+/).filter(Boolean);
}
function _cohContent(words) {
  return words.filter(w => w.length >= 4 && !(typeof VL_STOPWORDS !== 'undefined' && VL_STOPWORDS.has && VL_STOPWORDS.has(w)));
}
function _cohJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const s = {}; let inter = 0;
  for (const w of a) s[w] = 1;
  for (const w of b) if (s[w]) inter++;
  const union = Object.keys(s).length + b.length - inter;
  return union > 0 ? inter / union : 0;
}

// Stem-aware topical overlap, used ONLY to gate "are these two texts
// even about the same subject" before polarity/opposite-word checks
// run — never for the polarity/negation/opposite-pair detection
// itself, which needs exact marker words (stemming "never" or
// "always" would risk changing them unpredictably against
// COH_NEGATIONS/COH_OPPOSITES' fixed lookup lists). Same fix as
// lattice.js's association edges, same reasoning: "confident" and
// "confidence" sharing zero exact words was silently hiding real
// contradictions this exists to catch.
function _cohOverlap(textA, textB) {
  if (typeof TextAnalysis === 'undefined') {
    return _cohJaccard(_cohContent(_cohWords(textA)), _cohContent(_cohWords(textB)));
  }
  const stopwords = (typeof VL_STOPWORDS !== 'undefined') ? VL_STOPWORDS : null;
  const tokensA = TextAnalysis.tokenize(textA, stopwords, 4);
  const tokensB = TextAnalysis.tokenize(textB, stopwords, 4);
  return TextAnalysis.similarity(tokensA, tokensB);
}

// -1 negated, +1 affirmative. Marker counting, stated plainly.
function cohPolarity(text) {
  const words = _cohWords(text);
  let neg = 0;
  for (const w of words) if (COH_NEGATIONS.has(w)) neg++;
  return neg % 2 === 1 ? -1 : 1;   // double negatives read as affirmative
}

// Explicit opposite-word pairs across two texts — catches "always"/"never"
// style flips that negation counting alone misses.
function cohOppositePair(aWords, bWords) {
  const A = new Set(aWords), B = new Set(bWords);
  for (const [x, y] of COH_OPPOSITES) {
    if ((A.has(x) && B.has(y)) || (A.has(y) && B.has(x))) return [x, y];
  }
  return null;
}

// Pure: does `text` contradict any earlier node?
function cohFindContradictions(text, nodes) {
  const words = _cohWords(text);
  const pol = cohPolarity(text);
  const out = [];
  const scan = nodes.slice(-COH_LOOKBACK);
  for (const n of scan) {
    const nWords = _cohWords(n.text);
    const overlap = _cohOverlap(text, n.text);
    if (overlap < COH_CONTRA_MIN_OVERLAP) continue;
    const opp = cohOppositePair(words, nWords);
    const polarityFlip = cohPolarity(n.text) !== pol;
    if (polarityFlip || opp) {
      out.push({
        against: n.id, kind: n.kind, text: n.text,
        overlap: Math.round(overlap * 1000) / 1000,
        reason: opp ? ('opposite terms: ' + opp.join(' / ')) : 'opposite polarity on the same subject',
      });
    }
  }
  return out.sort((a, b) => b.overlap - a.overlap).slice(0, 3);
}

// Pure: does `text` touch anything goal-bearing (seed / commitment /
// identity marker)? That's a ripple — a thought landing on an end-state.
const COH_GOAL_KINDS = ['horizon.seed', 'horizon.commit', 'identity.marker'];
function cohFindRipples(text, tags, nodes) {
  const out = [];
  const scan = nodes.slice(-COH_LOOKBACK);
  for (const n of scan) {
    if (!COH_GOAL_KINDS.includes(n.kind)) continue;
    const sharedTags = (tags || []).filter(t => (n.tags || []).includes(t));
    const overlap = _cohOverlap(text, n.text);
    if (sharedTags.length >= COH_RIPPLE_MIN_TAGS || overlap >= 0.2) {
      out.push({
        toward: n.id, kind: n.kind, text: n.text,
        planTitle: (n.meta && n.meta.planTitle) || null,
        sharedTags, overlap: Math.round(overlap * 1000) / 1000,
      });
    }
  }
  return out.sort((a, b) => (b.sharedTags.length - a.sharedTags.length) || (b.overlap - a.overlap)).slice(0, 3);
}

// Incoherence = contradicting a commitment specifically. Heavier signal
// than contradicting a passing thought, so it's separated out.
function cohFindIncoherence(text, nodes) {
  return cohFindContradictions(text, nodes.filter(n => n.kind === 'horizon.commit'))
    .map(c => Object.assign({}, c, { severity: 'commitment' }));
}

function cohAnalyze(text, tags, nodes) {
  const pool = nodes || (typeof LATTICE !== 'undefined' ? LATTICE.nodes : []);
  return {
    ripples: cohFindRipples(text, tags || [], pool),
    contradictions: cohFindContradictions(text, pool),
    incoherence: cohFindIncoherence(text, pool),
  };
}

// ── Intelligence types, mapped automatically from real activity ────
// Replaces hand-maintained Intel panels: what you actually think about
// determines the ratings, not what you once ticked in a form.
// All 13 keys match INTELLIGENCE_TYPES/MM_INTEL_TAGS in nexus-engine.js
// exactly — these three taxonomies used to disagree (this one only had
// 9 of 13, and used 'kinesthetic' where the other two use 'bodily-
// kinesthetic', so that automatic score silently never reached the
// row it was meant for). Keep these in sync if a type is ever renamed.
const COH_INTEL_MAP = {
  'logical-mathematical': ['logic','pattern','structure','model','proof','algorithm','causal','analysis','equation','data','reasoning','math'],
  'linguistic':           ['language','word','words','writing','narrative','story','meaning','semantic','phrase','naming'],
  'spatial':              ['space','spatial','map','mapping','visual','geometry','shape','layout','topology','field'],
  'musical':              ['rhythm','sound','music','tone','resonance','harmony','frequency','cadence'],
  'bodily-kinesthetic':   ['body','physical','movement','embodied','practice','habit','sport','dance','touch','motion'],
  'interpersonal':        ['people','relationship','relational','social','conversation','trust','conflict','empathy','partner','team'],
  'intrapersonal':        ['self','identity','feeling','awareness','reflection','intention','value','belief','becoming'],
  'naturalist':           ['nature','natural','organic','ecology','environment','growth','season','biology'],
  'existential':          ['purpose','meaning','death','existence','why','philosophy','truth','sovereignty','freedom'],
  'creative':             ['creative','imagination','art','design','novel','invent','idea','original','improvise','play'],
  'systems':              ['system','systems','process','pipeline','architecture','feedback','loop','network','integration'],
  'emotional':            ['emotion','emotional','feel','feelings','mood','regulation','resonance','somatic'],
  'embodied':             ['embodiment','presence','grounding','sensation','breath','posture','energy','sleep','health'],
};

// Pure: lattice nodes -> intelligence-type scores (0..10), recency-weighted.
function cohIntelligenceFromLattice(nodes, now) {
  const t0 = now || Date.now();
  const halfLife = 1000 * 60 * 60 * 24 * 14; // 14 days
  const scores = {};
  for (const k of Object.keys(COH_INTEL_MAP)) scores[k] = 0;
  for (const n of (nodes || [])) {
    const words = new Set(_cohWords(n.text).concat(n.tags || []));
    const age = t0 - (n.ts || t0);
    const w = Math.pow(0.5, age / halfLife);
    for (const type of Object.keys(COH_INTEL_MAP)) {
      let hits = 0;
      for (const kw of COH_INTEL_MAP[type]) if (words.has(kw)) hits++;
      if (hits) scores[type] += hits * w;
    }
  }
  const max = Math.max(1, ...Object.values(scores));
  const out = {};
  for (const k of Object.keys(scores)) out[k] = Math.round((scores[k] / max) * 10 * 10) / 10;
  return out;
}

// Push those into ALM without anyone opening a panel. Manual overrides
// (DOMAIN_STATE.intelligenceOverrides) are respected — a person who
// deliberately dragged a rating shouldn't have it silently overwritten
// on the next sync. ALM_STATE.autoIntelligence always gets the full,
// unfiltered automatic signal regardless, since that's meant to be the
// raw computed value, not the display value.
function cohSyncIntelligenceToALM() {
  if (typeof LATTICE === 'undefined') return null;
  const ratings = cohIntelligenceFromLattice(LATTICE.nodes);
  if (typeof DOMAIN_STATE !== 'undefined') {
    const overrides = DOMAIN_STATE.intelligenceOverrides || {};
    const merged = Object.assign({}, DOMAIN_STATE.intelligenceRatings || {});
    for (const k of Object.keys(ratings)) {
      if (!overrides[k]) merged[k] = ratings[k];
    }
    DOMAIN_STATE.intelligenceRatings = merged;
    if (typeof domainStateSave === 'function') domainStateSave();
  }
  if (typeof ALM_STATE !== 'undefined') ALM_STATE.autoIntelligence = ratings;
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('intel.auto.updated', { ratings });
  return ratings;
}

// ── Live wiring ────────────────────────────────────────────────────
const COH_STATE = { lastFindings: null, rippleCount: 0, contradictionCount: 0, quiet: false };

function _cohOnLatticeNode(d) {
  if (COH_STATE.quiet || typeof LATTICE === 'undefined') return;
  const node = LATTICE.nodes[LATTICE.nodes.length - 1];
  if (!node || node.id !== d.id) return;
  // Analyse against everything EXCEPT itself.
  const prior = LATTICE.nodes.slice(0, -1);
  const f = cohAnalyze(node.text, node.tags, prior);
  COH_STATE.lastFindings = f;

  for (const r of f.ripples) {
    COH_STATE.rippleCount++;
    if (typeof almWriteDelta === 'function') {
      almWriteDelta('ripple', `Ripple: "${node.text.slice(0, 60)}" touches ${r.kind === 'horizon.commit' ? 'a commitment' : 'a seed'}${r.planTitle ? ' in ' + r.planTitle : ''}`, { nodeId: node.id, toward: r.toward, kind: 'ripple' });
    }
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('coherence.ripple', { from: node.id, toward: r.toward, planTitle: r.planTitle });
  }
  if (f.ripples.length && typeof mm_toast === 'function') {
    mm_toast('◎ This touches your end-state' + (f.ripples[0].planTitle ? ': ' + f.ripples[0].planTitle : ''), 'info', { dur: 3200 });
  }

  for (const c of f.incoherence) {
    if (typeof almWriteDelta === 'function') {
      almWriteDelta('incoherence', `Conflicts with a commitment: "${c.text.slice(0, 70)}"`, { nodeId: node.id, against: c.against, kind: 'incoherence' });
    }
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('coherence.incoherence', { from: node.id, against: c.against });
  }
  if (f.incoherence.length && typeof mm_toast === 'function') {
    mm_toast('⚠ This conflicts with a commitment you made', 'warn', { dur: 5000 });
  } else if (f.contradictions.length) {
    COH_STATE.contradictionCount++;
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('coherence.contradiction', { from: node.id, against: f.contradictions[0].against });
    if (typeof mm_toast === 'function') mm_toast('⟲ You have said the opposite before', 'info', { dur: 3200 });
  }

  // Keep intelligence ratings current, cheaply — every 10th node.
  if (LATTICE.nodes.length % 10 === 0) { try { cohSyncIntelligenceToALM(); } catch (e) {} }
}

(function _cohWire() {
  let wired = false;
  function attempt() {
    if (wired || typeof MM_BUS === 'undefined' || !MM_BUS.on) return false;
    MM_BUS.on('lattice.node.added', (d) => { try { _cohOnLatticeNode(d); } catch (e) { MMLog?.error('coherence', e.message); } });
    // Previously silent: cohSyncIntelligenceToALM computed real ratings
    // and wrote them into DOMAIN_STATE, but nothing ever listened for
    // this event, so the Intel panel only ever showed fresh numbers if
    // it happened to already be open at the exact moment a sync fired.
    // Re-render it live whenever new automatic ratings land.
    MM_BUS.on('intel.auto.updated', () => {
      try { if (typeof renderIntelligenceStats === 'function') renderIntelligenceStats(); } catch (e) {}
      try { if (typeof renderCrossDomainMatrix === 'function') renderCrossDomainMatrix(); } catch (e) {}
    });
    wired = true;
    // One sync now, for anyone opening the app with existing lattice
    // history — otherwise ratings stay at whatever they were last
    // session (or zero) until 10 NEW nodes accumulate, which could be
    // a while for a returning user who already has real history.
    try { cohSyncIntelligenceToALM(); } catch (e) {}
    return true;
  }
  if (attempt()) return;
  document.addEventListener('DOMContentLoaded', attempt);
  let n = 0;
  const iv = setInterval(() => { if (attempt() || ++n > 40) clearInterval(iv); }, 50);
})();

window.COH_STATE = COH_STATE;
window.cohPolarity = cohPolarity;
window.cohOppositePair = cohOppositePair;
window.cohFindContradictions = cohFindContradictions;
window.cohFindRipples = cohFindRipples;
window.cohFindIncoherence = cohFindIncoherence;
window.cohAnalyze = cohAnalyze;
window.cohIntelligenceFromLattice = cohIntelligenceFromLattice;
window.cohSyncIntelligenceToALM = cohSyncIntelligenceToALM;

if (typeof MMLog !== 'undefined') MMLog.info('coherence', 'Coherence engine v1.0.0 — ripple / contradiction / incoherence live');
