/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  FIELD MODULE  ·  modules/field/index.js  ·  v1.0.0                   ║
 * ║  UUID: lim-mod-field-1000-0000-000000000005                           ║
 * ║                                                                        ║
 * ║  Gap field geometry. Works on any sequential signal stream.           ║
 * ║  Detects: oscillation, edges, plateaus, convergence, fractals.        ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED, receives numeric sequences           ║
 * ║  Emits:   LIM.GAP_FIELD                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE FIELD MODEL:
 *   Every expressed element implies inferred variables.
 *   Omission ≠ absence. Omission is the shape of what was expected.
 *   Uncertainty weight = how much the omission costs.
 *   Hard edges = maximum information density.
 *   Oscillation = neither state committed. The gap is: what prevents commitment?
 */

'use strict';

import { LIM }        from '../../bus/index.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, FIELD_GAP_SUBTYPE, GapSignal, SlidingWindow, classifySigma, SIGMA_REGIME, matchCount, tokenize, _r4, _clamp } from '../../core/index.js';

export const MODULE_ID      = 'field';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-field-1000-0000-000000000005';

export class FieldModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._pressureSeq  = new SlidingWindow(50);  // gap pressure over time
    this._scoreSeq     = new SlidingWindow(50);  // composite score sequence
    this._edgeHistory  = [];
    this._sessionCount = 0;
  }

  attach() {
    // Update field from every gap emitted on any gap channel
    this._bus.on('lim.gap.*', (payload) => {
      if (payload.score != null) {
        this._pressureSeq.push(payload.score);
        this._scoreSeq.push(payload.score);
        this._detectFieldGap();
      }
    });

    // Also process text for text-domain field gaps
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyzeText(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_FIELD, result);
        this._sessionCount++;
      }
    });

    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  /**
   * Observe a numeric sequence directly (e.g. gap_pressure values from pendulum).
   * Returns the detected field gap if any.
   */
  observeSequence(values, label = 'signal', meta = {}) {
    for (const v of values) this._pressureSeq.push(v);
    return this._detectFieldGap(label, meta);
  }

  analyzeText(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 4) return null;

    const a = this._detectOscillation(text);
    const b = this._detectEdge(text);
    const c = this._detectPlateau(text);
    const d = this._detectAsymptote(text);
    const e = this._detectFractal(text);

    const axes = [a, b, c, d, e].filter(x => x.score > 0.15);
    if (!axes.length) return null;

    const dominant = axes.sort((a, b) => b.score - a.score)[0];
    const composite = _clamp(dominant.score * 0.7 + (axes.length > 1 ? axes[1].score * 0.3 : 0), 0, 1);

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.TEMPORAL,
      subtype:             dominant.subtype,
      domain:              DOMAIN.FIELD,
      score:               composite,
      description:         dominant.description,
      reason:              dominant.reason,
      evidence:            axes.map(a => `${a.subtype}=${_r4(a.score)}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: dominant.question,
      axes:                axes.map(a => ({ name: a.subtype, score: _r4(a.score), label: a.description })),
      asAbove:             dominant.asAbove,
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  // ── Text-domain field detectors ─────────────────────────────────────────────

  _detectOscillation(text) {
    // Alternating between two positions within a text
    const posRe  = /\b(good|positive|agree|yes|better|hope|can|will|love)\b/gi;
    const negRe  = /\b(bad|negative|disagree|no|worse|hopeless|cannot|won't|hate)\b/gi;
    const posH   = matchCount(text, posRe);
    const negH   = matchCount(text, negRe);
    const words  = tokenize(text);
    const balance = Math.min(posH, negH) / Math.max(1, Math.max(posH, negH));

    // Oscillation signal: both present, roughly balanced
    const score  = posH > 0 && negH > 0 ? _clamp(balance * 0.6 + (posH + negH) / Math.max(1, words.length) * 2, 0, 1) : 0;

    return {
      score,
      subtype:     FIELD_GAP_SUBTYPE.OSCILLATION,
      description: 'Text oscillates between opposing positions — neither committed',
      reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
      question:    'What prevents commitment to one position? What is the cost of landing?',
      asAbove:     'The fight that repeats monthly is the policy cycle that repeats every election.',
    };
  }

  _detectEdge(text) {
    // Hard edge: abrupt transition markers
    const hardRe  = /\b(suddenly|out of nowhere|just like that|everything changed|nothing was the same|overnight|in an instant|that was when)\b/gi;
    const softRe  = /\b(gradually|slowly|over time|bit by bit|little by little|step by step|day by day)\b/gi;
    const blurRe  = /\b(not sure when|can't tell when|hard to say|at some point|don't know exactly)\b/gi;
    const hardH   = matchCount(text, hardRe);
    const softH   = matchCount(text, softRe);
    const blurH   = matchCount(text, blurRe);

    if (hardH > 0) {
      return {
        score:       _clamp(hardH * 0.55, 0, 1),
        subtype:     FIELD_GAP_SUBTYPE.HARD_EDGE,
        description: 'Hard edge event — maximum information density at this transition',
        reason:      [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
        question:    'What was on each side of this edge? What changed and what did not?',
        asAbove:     'Death, divorce, diagnosis — hard edges in a life. Bar 32 of a song where everything changes.',
      };
    }
    if (blurH > 0) {
      return {
        score:       _clamp(blurH * 0.4, 0, 1),
        subtype:     FIELD_GAP_SUBTYPE.BLURRED_EDGE,
        description: 'Blurred edge — boundary should be clear but isn\'t',
        reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
        question:    'Where did this transition actually happen? What makes the edge unclear?',
        asAbove:     'Relationship status undefined. The lyric verse with no chorus break.',
      };
    }
    return { score: 0, subtype: FIELD_GAP_SUBTYPE.SOFT_EDGE, description: '', reason: [], question: '', asAbove: '' };
  }

  _detectPlateau(text) {
    const plateauRe = /\b(nothing changes|same as always|stuck|going nowhere|same thing|round and round|always the same|hasn't changed|won't change|never changes)\b/gi;
    const hits      = matchCount(text, plateauRe);
    const score     = _clamp(hits * 0.4, 0, 1);
    return {
      score,
      subtype:     FIELD_GAP_SUBTYPE.PLATEAU,
      description: 'Plateau detected — derivative ≈ 0, stagnation or stability (context determines which)',
      reason:      [GAP_REASON.CAPACITY, GAP_REASON.AVOIDANCE],
      question:    'Is this stability or stagnation? What would movement look like from here?',
      asAbove:     'The career stuck year. The song that doesn\'t build. The metric that stopped moving.',
    };
  }

  _detectAsymptote(text) {
    const asymptRe = /\b(almost|nearly|close but|just short|not quite|approaching|getting there but|almost there|just missing|so close)\b/gi;
    const hits     = matchCount(text, asymptRe);
    const score    = _clamp(hits * 0.35, 0, 1);
    return {
      score,
      subtype:     FIELD_GAP_SUBTYPE.ASYMPTOTE,
      description: 'Asymptote — approaching but never reaching. Structural limit gap.',
      reason:      [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.AVOIDANCE],
      question:    'What is preventing arrival? Is the limit structural or chosen?',
      asAbove:     'Always almost there. Perfectionism that prevents completion.',
    };
  }

  _detectFractal(text) {
    // Same pattern at multiple scales in the same text
    // Heuristic: same root words appearing in different contexts/sizes
    const words = tokenize(text);
    const wordFreq = {};
    for (const w of words) wordFreq[w] = (wordFreq[w] ?? 0) + 1;
    const repeated = Object.entries(wordFreq).filter(([w, c]) => c >= 3 && w.length > 4);
    const score = repeated.length >= 2 ? _clamp(repeated.length * 0.12, 0, 0.7) : 0;
    return {
      score,
      subtype:     FIELD_GAP_SUBTYPE.FRACTAL_GAP,
      description: `Fractal signal: same pattern at multiple scales (${repeated.slice(0,3).map(([w]) => w).join(', ')})`,
      reason:      [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.IDENTITY_REFLECTION],
      question:    'Does this pattern appear at other scales in this person\'s life? Is this a micro or macro signal?',
      asAbove:     'The avoidance in the lyric line mirrors the avoidance in the album arc mirrors the avoidance in the artist\'s career.',
    };
  }

  // ── Numeric sequence field gap detection ─────────────────────────────────────

  _detectFieldGap(label = 'gap_pressure', meta = {}) {
    const seq = this._pressureSeq.vals;
    if (seq.length < 4) return null;

    const sigma = classifySigma(seq);

    if (sigma.regime === SIGMA_REGIME.OSCILLATORY) {
      const result = GapSignal.build({
        moduleId:    MODULE_ID,
        type:        GAP_TYPE.OSCILLATORY,
        subtype:     FIELD_GAP_SUBTYPE.OSCILLATION,
        domain:      DOMAIN.FIELD,
        score:       _clamp(sigma.confidence * 0.9, 0, 1),
        description: `Sigma OSCILLATORY on "${label}" — ${sigma.dirChanges} direction changes`,
        reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
        evidence:    [`regime=${sigma.regime}`, `confidence=${_r4(sigma.confidence)}`, `dirChanges=${sigma.dirChanges}`],
        loadBearingQuestion: 'What prevents commitment to one state? What is the cost of resolution?',
        asAbove:     'The fight that repeats monthly. The AB test that never decides. The system that optimises for neither.',
        criticality: 0.85,
        ...meta,
      });
      this._bus.emit(LIM.GAP_FIELD, result);
      return result;
    }

    if (sigma.regime === SIGMA_REGIME.COLLAPSING) {
      const result = GapSignal.build({
        moduleId:    MODULE_ID,
        type:        GAP_TYPE.TEMPORAL,
        subtype:     FIELD_GAP_SUBTYPE.HARD_EDGE,
        domain:      DOMAIN.FIELD,
        score:       _clamp(sigma.confidence, 0, 1),
        description: `Field collapsing — accelerating pressure, hard edge approaching`,
        reason:      [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.DEFERRED_VARIABLE],
        evidence:    [`regime=${sigma.regime}`, `slope=${_r4(sigma.slope)}`],
        loadBearingQuestion: 'What happens after the collapse? Has this been planned for?',
        criticality: 0.90,
        ...meta,
      });
      this._bus.emit(LIM.GAP_FIELD, result);
      return result;
    }

    return null;
  }

  get sessionCount() { return this._sessionCount; }
}
