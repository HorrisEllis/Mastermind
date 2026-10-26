/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MUSIC MODULE  ·  modules/music/index.js  ·  v1.0.0                   ║
 * ║  UUID: lim-mod-music-1000-0000-000000000010                           ║
 * ║                                                                        ║
 * ║  Harmonic, lyric, rhythmic, and structural gap detection.             ║
 * ║  Works on lyric text and on structural descriptions.                  ║
 * ║                                                                        ║
 * ║  FIELD INVARIANT: Hooks live at maximum gap-field pressure.           ║
 * ║  The space between verse and chorus IS the hook — max field pressure  ║
 * ║  at the seam. Tension = gap field under pressure. Resolution = close. ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from '../../bus/index.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, SlidingWindow, tokenize, matchCount, _r4, _clamp } from '../../core/index.js';

export const MODULE_ID      = 'music';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-music-1000-0000-000000000010';

// ── Music surface type detection ──────────────────────────────────────────────

function isMusicContent(text) {
  const musicRe = /\b(verse|chorus|bridge|hook|melody|chord|lyrics|song|track|beat|rhythm|bars|tempo|key of|major|minor|bpm|pre-chorus|outro|intro)\b/gi;
  return matchCount(text, musicRe) >= 2;
}

function isLyricContent(text) {
  // Short lines, rhyme-like structure, emotional content
  const lines = text.split(/\n/).filter(l => l.trim().length > 0);
  return lines.length >= 2 && lines.some(l => l.trim().length < 60);
}

// ── Phoneme / rhyme utilities ─────────────────────────────────────────────────

function phonemes(word) {
  return (word ?? '').toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/qu/g, 'kw').replace(/ph/g, 'f').replace(/ck/g, 'k')
    .replace(/gh/g, '').replace(/[aeiou]+/g, 'V')
    .replace(/([bcdfghjklmnpqrstvwxyz])\1+/g, '$1');
}

function rhymeSuffix(word, len = 3) {
  return phonemes(word).slice(-len);
}

function detectRhymeScheme(lines) {
  const endWords   = lines.map(l => l.trim().split(/\s+/).pop()?.replace(/[^a-z]/gi, '') ?? '');
  const suffixes   = endWords.map(w => rhymeSuffix(w));
  const scheme     = [];
  const seenSuffix = {};
  let   letter     = 0;
  for (const s of suffixes) {
    if (!s) { scheme.push('?'); continue; }
    if (seenSuffix[s] == null) seenSuffix[s] = String.fromCharCode(65 + letter++);
    scheme.push(seenSuffix[s]);
  }
  return scheme;
}

function countSyllables(word) {
  return (word.match(/[aeiou]/gi) ?? []).length || 1;
}

// ── Music Module ──────────────────────────────────────────────────────────────

export class MusicModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._sessionCount = 0;
    this._lyricHistory = [];
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text ?? payload.source;
      if (!isMusicContent(text) && !isLyricContent(text)) return;

      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_MUSIC, result);
        this._sessionCount++;
      }
    });
    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  /**
   * Analyze text for music/lyric gaps.
   * Can be called directly with lyric text.
   */
  analyze(text, meta = {}) {
    const lines   = text.split(/\n/).filter(l => l.trim().length > 0);
    const isLyric = isLyricContent(text);
    const isMusic = isMusicContent(text);

    const detections = [];

    if (isLyric && lines.length >= 2) {
      detections.push(...this._analyzeLyrics(lines, text));
    }
    if (isMusic || text.length > 80) {
      detections.push(...this._analyzeStructure(text));
    }

    if (!detections.length) return null;

    const dominant  = detections.sort((a, b) => b.score - a.score)[0];
    const composite = _clamp(
      detections.slice(0, 3).reduce((s, d, i) => s + d.score * [0.5, 0.3, 0.2][i], 0),
      0, 1
    );

    this._lyricHistory.push({ text: text.slice(0, 100), ts: Date.now() });
    if (this._lyricHistory.length > 20) this._lyricHistory.shift();

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                dominant.gapType,
      subtype:             dominant.name,
      domain:              dominant.domain ?? DOMAIN.MUSIC,
      score:               composite,
      description:         dominant.description,
      reason:              dominant.reason,
      evidence:            detections.slice(0, 4).map(d => `${d.name}=${_r4(d.score)}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: dominant.question,
      axes:                detections.slice(0, 6).map(d => ({ name: d.name, score: _r4(d.score), label: d.description })),
      asAbove:             dominant.asAbove ?? 'The unresolved harmonic tension in music is the unspoken word in conversation.',
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  // ── Lyric analyzers ──────────────────────────────────────────────────────────

  _analyzeLyrics(lines, fullText) {
    const found = [];

    // 1. Rhyme scheme gaps
    const scheme = detectRhymeScheme(lines);
    const {forced, broken} = this._analyzeRhymeScheme(lines, scheme);
    if (forced.score > 0.25) found.push(forced);
    if (broken.score > 0.25) found.push(broken);

    // 2. Syllable overflow / deficit
    const sylGap = this._analyzeSyllables(lines);
    if (sylGap.score > 0.25) found.push(sylGap);

    // 3. Emotional pivot detection
    const pivot = this._analyzeEmotionalPivot(lines);
    if (pivot.score > 0.25) found.push(pivot);

    // 4. Cliché density
    const cliche = this._analyzeCliche(fullText);
    if (cliche.score > 0.25) found.push(cliche);

    // 5. Pronoun ambiguity
    const pronoun = this._analyzePronounAmbiguity(fullText);
    if (pronoun.score > 0.20) found.push(pronoun);

    // 6. Word-beat alignment (heuristic from syllable stress)
    const wordBeat = this._analyzeWordBeat(lines);
    if (wordBeat.score > 0.20) found.push(wordBeat);

    return found;
  }

  _analyzeRhymeScheme(lines, scheme) {
    // Forced rhyme: last words that are unusual/unnatural word order
    const forcedRe = /\b(do i|must i|can i|shall i|i'll be|might be|will be|yet still)\b/gi;
    const forcedHits = lines.reduce((s, l) => s + matchCount(l, forcedRe), 0);
    const forced = {
      name:        'rhyme_forced',
      score:       _clamp(forcedHits * 0.35, 0, 1),
      gapType:     GAP_TYPE.OBLIGATION,
      domain:      DOMAIN.LYRICS,
      description: 'Forced rhyme — natural word order inverted for scheme',
      reason:      [GAP_REASON.COMPRESSION, GAP_REASON.NARRATIVE_SOOTHING],
      question:    'What was the word that actually fit the meaning? What precision was sacrificed?',
      asAbove:     'Forced rhyme sacrifices the specific image for the sound. The omitted variable is the exact truth.',
    };

    // Broken rhyme: scheme established then violated
    const uniqueLetters = [...new Set(scheme.filter(s => s !== '?'))];
    const schemeStr = scheme.join('');
    const broken = {
      name:        'rhyme_break',
      score:       0,
      gapType:     GAP_TYPE.TEMPORAL,
      domain:      DOMAIN.LYRICS,
      description: `Rhyme scheme: ${schemeStr} — ${uniqueLetters.length > 3 ? 'complex/broken' : 'consistent'}`,
      reason:      [GAP_REASON.STRUCTURAL_LIMIT],
      question:    'Is the rhyme break intentional or does it create unresolved expectation?',
    };
    if (uniqueLetters.length > Math.ceil(lines.length * 0.6)) {
      broken.score = _clamp((uniqueLetters.length - lines.length * 0.5) * 0.2, 0, 0.7);
    }

    return { forced, broken };
  }

  _analyzeSyllables(lines) {
    // Check if lines have wildly different syllable counts (suggests overflow/deficit)
    const counts = lines.map(l =>
      tokenize(l).reduce((s, w) => s + countSyllables(w), 0)
    ).filter(c => c > 0);

    if (counts.length < 2) return { name: 'syllable_gap', score: 0, gapType: GAP_TYPE.TEMPORAL, domain: DOMAIN.LYRICS, description: '', reason: [], question: '' };

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const maxDev = Math.max(...counts.map(c => Math.abs(c - mean)));
    const relDev = maxDev / Math.max(1, mean);

    return {
      name:        relDev > 0.5 ? 'syllable_overflow' : 'syllable_gap',
      score:       _clamp(relDev * 0.7, 0, 1),
      gapType:     GAP_TYPE.TEMPORAL,
      domain:      DOMAIN.LYRICS,
      description: `Syllable imbalance: max deviation ${_r4(relDev * 100)}% from mean (${Math.round(mean)} syl/line)`,
      reason:      [GAP_REASON.COMPRESSION, GAP_REASON.CAPACITY],
      question:    'Does the lyric have room to breathe? What is being compressed to fit the meter?',
    };
  }

  _analyzeEmotionalPivot(lines) {
    // A pivot should move from tension to resolution (or vice versa)
    const tensRe    = /\b(but|however|yet|still|even though|despite|although|and yet|never|no|can't)\b/gi;
    const resolveRe = /\b(finally|at last|now i|i found|i know|i see|i understand|i can|it's okay|i'm free)\b/gi;
    const fullText  = lines.join(' ');
    const tensHits  = matchCount(fullText, tensRe);
    const resHits   = matchCount(fullText, resolveRe);

    // Missing pivot: all tension, no resolution
    if (tensHits > 2 && resHits === 0) {
      return {
        name:        'pivot_missing',
        score:       _clamp(tensHits * 0.15, 0, 0.8),
        gapType:     GAP_TYPE.OBLIGATION,
        domain:      DOMAIN.LYRICS,
        description: 'Emotional arc has no pivot — tension without release',
        reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
        question:    'Where is the turn? What would it feel like to arrive somewhere?',
        asAbove:     'The song without a bridge — only tension and recapitulation, never the third position.',
      };
    }

    // Pivot too early: resolution before tension builds
    if (resHits > 0 && tensHits === 0) {
      return {
        name:        'pivot_early',
        score:       _clamp(resHits * 0.12, 0, 0.6),
        gapType:     GAP_TYPE.TEMPORAL,
        domain:      DOMAIN.LYRICS,
        description: 'Resolution without tension — catharsis without stakes',
        reason:      [GAP_REASON.COMPRESSION, GAP_REASON.CAPACITY],
        question:    'What would it cost to earn this resolution? What tension precedes it?',
      };
    }

    return { name: 'pivot_ok', score: 0, gapType: GAP_TYPE.TEMPORAL, domain: DOMAIN.LYRICS, description: '', reason: [], question: '' };
  }

  _analyzeCliche(text) {
    const clicheRe = /\b(heart of gold|torn apart|fall apart|broken heart|tears in my eyes|soul on fire|wings to fly|face the truth|stand the rain|in the dark|light in the dark|out of reach|lose myself|save me|save myself|pick up the pieces|start again|brand new day|better days|chasing dreams|meant to be|fall from grace)\b/gi;
    const hits     = matchCount(text, clicheRe);
    const words    = tokenize(text);
    const density  = hits / Math.max(1, words.length);

    return {
      name:        'cliche_substitution',
      score:       _clamp(density * 15 + hits * 0.1, 0, 0.85),
      gapType:     GAP_TYPE.EVIDENTIAL,
      domain:      DOMAIN.LYRICS,
      description: `Cliché density: ${hits} substitutions — omitted variable is the specific experience`,
      reason:      [GAP_REASON.COMPRESSION, GAP_REASON.NARRATIVE_SOOTHING],
      question:    'What is the actual specific image that was replaced by this cliché? What did it cost to not say it?',
      asAbove:     'The cliché is the compressor set to maximum — all dynamic range gone. The omitted variable is the truth that would have made it unforgettable.',
    };
  }

  _analyzePronounAmbiguity(text) {
    const ambigRe = /\b(they|them|it|this|that|those|these)\b/gi;
    const clearRe = /\b(you|i|we|he|she|her|him|us)\b/gi;
    const ambig   = matchCount(text, ambigRe);
    const clear   = matchCount(text, clearRe);
    const ratio   = ambig / Math.max(1, ambig + clear);
    const score   = _clamp(ratio * 0.8 - 0.2, 0, 0.6);

    return {
      name:        'pronoun_ambiguity',
      score,
      gapType:     GAP_TYPE.DEFINITIONAL,
      domain:      DOMAIN.LYRICS,
      description: `Pronoun ambiguity: ${Math.round(ratio * 100)}% ambiguous — listener fills the gap with their own referent`,
      reason:      [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
      question:    'Who is "they"? Is the ambiguity intentional? What does the listener project into this gap?',
      asAbove:     'Ambiguous pronouns in lyrics are deferred variables — the listener\'s inference IS the meaning.',
    };
  }

  _analyzeWordBeat(lines) {
    // Stress mismatch heuristic: monosyllabic function words on stressed positions
    const functionWords = new Set(['the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'is', 'was', 'and', 'or', 'but', 'for', 'nor']);
    let mismatches = 0, total = 0;
    for (const line of lines) {
      const words = tokenize(line);
      words.forEach((w, i) => {
        if (i % 2 === 0) { // rough "stressed" position in iambic
          total++;
          if (functionWords.has(w)) mismatches++;
        }
      });
    }
    const score = total > 0 ? _clamp(mismatches / total * 1.5 - 0.2, 0, 0.7) : 0;
    return {
      name:        'word_beat_misalign',
      score,
      gapType:     GAP_TYPE.CONTRADICTION,
      domain:      DOMAIN.LYRICS,
      description: `Word-beat misalignment: ~${Math.round(mismatches/Math.max(1,total)*100)}% of stressed positions carry unstressed words`,
      reason:      [GAP_REASON.COMPRESSION, GAP_REASON.ATTENTION],
      question:    'Where does the natural speech stress land vs the musical downbeat? Is the gap intentional?',
    };
  }

  // ── Structural analyzers ─────────────────────────────────────────────────────

  _analyzeStructure(text) {
    const found = [];

    // Missing sections
    const hasVerse   = /\b(verse|first verse|second verse)\b/gi.test(text);
    const hasChorus  = /\b(chorus|refrain|hook)\b/gi.test(text);
    const hasBridge  = /\b(bridge|middle eight|breakdown|turn)\b/gi.test(text);
    const hasIntro   = /\b(intro|opening|beginning)\b/gi.test(text);
    const hasOutro   = /\b(outro|ending|fade|close)\b/gi.test(text);

    if (hasVerse && hasChorus && !hasBridge) {
      found.push({
        name:        'missing_bridge',
        score:       0.55,
        gapType:     GAP_TYPE.OBLIGATION,
        domain:      DOMAIN.SONGWRITING,
        description: 'No bridge — song has only tension and release, never the third position',
        reason:      [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
        question:    'What is the third position? What can only be said from outside the verse/chorus loop?',
        asAbove:     'The missing bridge is the conversation that never happened — only the fight and the making-up, never the understanding.',
      });
    }

    if (!hasChorus && text.length > 200) {
      found.push({
        name:        'missing_hook',
        score:       0.65,
        gapType:     GAP_TYPE.OBLIGATION,
        domain:      DOMAIN.SONGWRITING,
        description: 'No identifiable hook — no center of gravity, no maximum gap-field pressure point',
        reason:      [GAP_REASON.STRUCTURAL_LIMIT, GAP_REASON.ATTENTION],
        question:    'Where is the moment of maximum expectation and tension? That is where the hook belongs.',
      });
    }

    if (hasIntro && !hasOutro) {
      found.push({
        name:        'intro_outro_mismatch',
        score:       0.45,
        gapType:     GAP_TYPE.CONTRADICTION,
        domain:      DOMAIN.SONGWRITING,
        description: 'Intro establishes a field. No outro means the opening tension never closes.',
        reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
        question:    'What does the intro promise that the outro would deliver? Is the open ending intentional?',
      });
    }

    // Unresolved harmonic tension markers
    const tensionRe = /\b(dominant|tension|unresolved|hanging|tritone|dissonant|suspended|sus2|sus4|7th chord|diminished)\b/gi;
    const resolveRe = /\b(resolution|resolved|tonic|home|landing|arrives|settles|releases)\b/gi;
    const tHits = matchCount(text, tensionRe);
    const rHits = matchCount(text, resolveRe);
    if (tHits > 0 && rHits === 0) {
      found.push({
        name:        'unresolved_harmonic_tension',
        score:       _clamp(tHits * 0.35, 0, 0.85),
        gapType:     GAP_TYPE.OBLIGATION,
        domain:      DOMAIN.HARMONY,
        description: `Harmonic tension present (${tHits} markers) without resolution`,
        reason:      [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.AVOIDANCE],
        question:    'What is preventing the resolution? Is this intentional or a structural gap?',
        asAbove:     'The unresolved tritone is the unspoken word in conversation is the unclosed catch block in code.',
      });
    }

    return found;
  }

  get sessionCount() { return this._sessionCount; }
}
