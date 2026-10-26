/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GapHunter  ·  gaphunter.js  ·  v2.0.0                                ║
 * ║  UUID: gh-main-0000-0000-0000-000000000000                             ║
 * ║  HOOK: gaphunter:main:00001                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Primary entry point. Wires everything together.
 *
 *   Text/code in → UniversalTextAnalyzer → GapHunterBus → Ledger
 *   Query API → open gaps, session summary, longitudinal patterns
 *   Observer API → wire to any bus (BroadcastChannel, NEXUS kernel, SSE)
 *
 * Usage:
 *
 *   import { GapHunter } from './gaphunter.js';
 *
 *   const gh = new GapHunter({ project: 'NEXUS' });
 *
 *   // Analyze text (any domain — auto-detected or specified)
 *   const result = gh.analyze('The market will solve this.', { domain: 'markets' });
 *
 *   // Analyze code
 *   const codeResult = gh.analyze(sourceCode, { domain: 'code', language: 'python' });
 *
 *   // See what's open
 *   const open = gh.openGaps();
 *
 *   // Resolve a gap with proof
 *   gh.resolve(gapLedgerId, { testFile: 'test/fix.test.js' }, { resolution: 'Fixed race condition' });
 *
 *   // End session — get longitudinal summary
 *   const summary = gh.endSession();
 *
 *   // Browse the taxonomy
 *   gh.catalogue({ domain: 'code', minCriticality: 0.8 });
 *
 * §1.1  Nothing exists until proven — outputs are signals, not verdicts.
 * §1.2  Nothing silently fails.
 * §1.3  No stubs in production.
 * §5.1  UUID + hook on every component.
 * §5.2  Everything implements the bridge.
 * §8.1  Session context before build.
 * §8.3  SISO + Jaa are load-order prerequisites.
 */

'use strict';

import { UniversalTextAnalyzer } from './gap-text.js';
import { GapHunterBus }          from './gap-bus.js';
import {
  GAP_CATALOGUE,
  GAP_TYPE,
  DOMAIN,
  DOMAIN_GROUPS,
  INVARIANTS,
  UNIVERSAL_CRITICALITY,
  getByDomain,
  getByDomainGroup,
  getByType,
  getByMinCriticality,
  getById,
  allDomains,
  catalogueSummary,
} from './gap-taxonomy.js';

export const GAPHUNTER_VERSION = '2.0.0';
export const GAPHUNTER_UUID    = 'gh-main-0000-0000-0000-000000000000';

// ─── Primary Class ────────────────────────────────────────────────────────────

export class GapHunter {
  static UUID    = GAPHUNTER_UUID;
  static VERSION = GAPHUNTER_VERSION;

  /**
   * @param {object} opts
   * @param {string} opts.project    — project name (wired to Ledger)
   * @param {string} opts.logLevel   — 'OFF'|'EVENTS'|'DEEP'|'DATA'
   * @param {number} opts.minScore   — minimum score to surface a gap (default: 0.25)
   */
  constructor(opts = {}) {
    this._project  = opts.project   ?? 'GapHunter';
    this._minScore = opts.minScore  ?? 0.25;
    this._analyzer = new UniversalTextAnalyzer();
    this._bus      = new GapHunterBus({
      project:  this._project,
      logLevel: opts.logLevel ?? 'EVENTS',
    });
    this._history  = []; // { result, ledgerIds }[]
  }

  // ── Core API ─────────────────────────────────────────────────────────────

  /**
   * Analyze text or code. Auto-detects domain if not specified.
   * Returns all detected gaps above minScore threshold.
   *
   * @param {string} text
   * @param {object} opts
   * @param {string} opts.domain    — DOMAIN.* hint
   * @param {string} opts.language  — 'js'|'python'|'sql'|etc
   * @param {number} opts.arousal   — 0–1 emotional arousal (relational domain)
   * @returns {GapAnalysisResult|null}
   */
  analyze(text, opts = {}) {
    const raw = this._analyzer.analyze(text, opts);
    if (!raw || raw.score < this._minScore) return null;

    // Surface individual detector finds to the bus
    const ledgerIds = [];
    for (const detector of raw.detectors ?? []) {
      if ((detector.score ?? 0) < this._minScore) continue;

      // Flatten finds arrays
      const finds = detector.finds ?? [{ ...detector }];
      for (const find of finds) {
        const gap = {
          id:           find.id ?? find.definition?.id ?? null,
          domain:       detector.domain ?? opts.domain ?? raw.domain,
          type:         find.type ?? find.definition?.type ?? detector.type ?? GAP_TYPE.ASSUMPTION,
          subtype:      find.subtype ?? find.definition?.subtype ?? detector.subtype ?? 'detected',
          description:  find.description ?? find.definition?.description ?? detector.type,
          score:        find.score ?? detector.score,
          confidence:   find.confidence ?? detector.confidence,
          signal_note:  detector.signal_note,
          evidence:     find.evidence ? [find.evidence] : (detector.evidence ?? []),
          axes:         find.axes ?? detector.axes ?? [],
          text_excerpt: raw.text_excerpt,
          detector:     detector.type,
        };

        if ((gap.score ?? 0) < this._minScore) continue;

        try {
          const recorded = this._bus.detect(gap);
          if (recorded?.ledgerId) ledgerIds.push(recorded.ledgerId);
        } catch (e) {
          // §1.2 — surface, don't swallow
          console.error('[GapHunter] detect error:', e.message);
        }
      }
    }

    const result = { ...raw, ledgerIds };
    this._history.push(result);
    if (this._history.length > 50) this._history.shift();
    return result;
  }

  /**
   * Resolve a gap with proof.
   * @param {string} ledgerId
   * @param {object} proof      — { testFile, diffLink, metric, logFile, screenshot }
   * @param {object} opts       — { resolution, resolutionType, version, domain }
   */
  resolve(ledgerId, proof, opts = {}) {
    return this._bus.resolve(ledgerId, proof, opts);
  }

  /**
   * Close a gap without resolution (rejected or abandoned).
   * @param {string} ledgerId
   * @param {string} status   — 'rejected'|'abandoned'
   * @param {string} reason
   */
  close(ledgerId, status = 'rejected', reason = '') {
    return this._bus.close(ledgerId, status, reason);
  }

  /**
   * Query open gaps.
   * @param {object} filters — { domain, type, min_score }
   */
  openGaps(filters = {}) {
    return this._bus.query(filters);
  }

  /**
   * End the session — emits longitudinal summary with patterns.
   */
  endSession() {
    return this._bus.endSession();
  }

  // ── Catalogue API ─────────────────────────────────────────────────────────

  /**
   * Browse the universal gap catalogue.
   * @param {object} filters — { domain, type, minCriticality, group }
   */
  catalogue(filters = {}) {
    let gaps = [...GAP_CATALOGUE];
    if (filters.domain)          gaps = gaps.filter(g => g.domain === filters.domain);
    if (filters.type)            gaps = gaps.filter(g => g.type   === filters.type);
    if (filters.group)           gaps = getByDomainGroup(filters.group);
    if (filters.minCriticality != null) {
      gaps = gaps.filter(g => (g.criticality ?? UNIVERSAL_CRITICALITY[g.type] ?? 0) >= filters.minCriticality);
    }
    return gaps.sort((a,b) => (b.criticality ?? 0) - (a.criticality ?? 0));
  }

  /**
   * Full catalogue summary — total gaps, by domain, by type, top critical.
   */
  catalogueSummary() {
    return catalogueSummary();
  }

  /**
   * Get a specific gap definition by ID.
   */
  getGap(id) {
    return getById(id);
  }

  /**
   * All available domains.
   */
  domains() {
    return allDomains();
  }

  /**
   * The ten cross-domain invariants — truths that hold everywhere.
   */
  invariants() {
    return [...INVARIANTS];
  }

  // ── Observer API ─────────────────────────────────────────────────────────

  /**
   * Wire to any bus. Fires on every gap event.
   * @param {string}   eventType — 'gap.recorded'|'gap.promoted'|'gap.closed'|'gap.session.summary'
   * @param {function} fn
   * @returns {function} unsubscribe
   */
  on(eventType, fn) {
    return this._bus.on(eventType, fn);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  get sessionId()    { return this._bus.sessionId; }
  get analyzerStats(){ return this._analyzer.stats; }
  get ledger()       { return this._bus.ledger; }
  get sessionGaps()  { return this._bus.sessionGaps; }
}

// ─── Standalone helpers ───────────────────────────────────────────────────────

/**
 * One-shot analysis — no session, no ledger, no bus.
 * Useful for quick CLI or REPL use.
 */
export function quickAnalyze(text, opts = {}) {
  const analyzer = new UniversalTextAnalyzer();
  return analyzer.analyze(text, opts);
}

/**
 * Browse the catalogue without instantiating GapHunter.
 */
export function browseCatalogue(filters = {}) {
  let gaps = [...GAP_CATALOGUE];
  if (filters.domain) gaps = gaps.filter(g => g.domain === filters.domain);
  if (filters.type)   gaps = gaps.filter(g => g.type   === filters.type);
  if (filters.minCriticality != null) {
    gaps = gaps.filter(g => (g.criticality ?? UNIVERSAL_CRITICALITY[g.type] ?? 0) >= filters.minCriticality);
  }
  return gaps.sort((a,b) => (b.criticality??0) - (a.criticality??0));
}

// ─── Re-exports ───────────────────────────────────────────────────────────────

export {
  GAP_TYPE,
  DOMAIN,
  DOMAIN_GROUPS,
  INVARIANTS,
  UNIVERSAL_CRITICALITY,
  GAP_CATALOGUE,
  getByDomain,
  getByDomainGroup,
  getByType,
  getByMinCriticality,
  getById,
  allDomains,
  catalogueSummary,
  UniversalTextAnalyzer,
  GapHunterBus,
};

export default GapHunter;
