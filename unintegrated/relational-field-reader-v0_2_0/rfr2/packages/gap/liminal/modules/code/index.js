/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CODE MODULE  ·  modules/code/index.js  ·  v1.0.0                     ║
 * ║  UUID: lim-mod-code-1000-0000-000000000011                            ║
 * ║                                                                        ║
 * ║  Code-domain gap detection.                                           ║
 * ║  Language-agnostic: silent failure, undefined contract, tech debt.    ║
 * ║  Language-specific: JS/TS/Python/SQL patterns.                        ║
 * ║  Architectural: coupling, SPOF, idempotency, auth gaps.               ║
 * ║                                                                        ║
 * ║  §1.1  All outputs labeled as signals.                               ║
 * ║  §1.2  Silent failure is always criticality 1.00.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from '../../bus/index.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, tokenize, matchCount, _r4, _clamp } from '../../core/index.js';

export const MODULE_ID      = 'code';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-code-1000-0000-000000000011';

// ── Code surface detection ────────────────────────────────────────────────────

function isCodeContent(text) {
  return /\b(function|class|const|let|var|import|export|async|await|def |return |if\s*\(|for\s*\(|while\s*\(|try\s*{|catch\s*\(|throw |=>|\bSQL\b|SELECT|INSERT|UPDATE|DELETE)\b/.test(text);
}

function detectLanguage(text) {
  if (/\bdef\s+\w+\s*\(|import\s+\w+|from\s+\w+\s+import\b/.test(text)) return 'python';
  if (/\bfunc\s+\w+|:=\b/.test(text))  return 'go';
  if (/\bfn\s+\w+|let\s+mut\b/.test(text)) return 'rust';
  if (/\bSELECT\b|\bINSERT\b|\bUPDATE\b/i.test(text)) return 'sql';
  if (/\binterface\s+\w+|:\s*(string|number|boolean|any)\b/.test(text)) return 'typescript';
  if (/\bconst\b|\blet\b|\bvar\b|=>/.test(text)) return 'javascript';
  return 'generic';
}

// ── Universal Code Gaps ───────────────────────────────────────────────────────

const UNIVERSAL_PATTERNS = {
  silent_failure: {
    rx:          /catch\s*\([^)]*\)\s*\{\s*\}/g,
    criticality: 1.00,
    type:        GAP_TYPE.OBLIGATION,
    domain:      DOMAIN.CODE,
    description: 'Silent failure — catch block with empty body (§1.2 violation)',
    reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.COMPRESSION],
    question:    'What error is being swallowed here? What would happen if a caller knew it failed?',
    asAbove:     'The empty catch block is the conversation topic dropped without acknowledgment — the error exists, but nobody can respond to it.',
  },
  unawaited_promise: {
    rx:          /(?<!\bawait\b)\s+\w+\s*\((?:[^)]*)\)\s*;?\s*\/\/[^\n]*\n|\.then\(\s*\)\s*;/g,
    criticality: 0.90,
    type:        GAP_TYPE.OBLIGATION,
    domain:      DOMAIN.CODE,
    description: 'Promise returned but not awaited — errors silently swallowed',
    reason:      [GAP_REASON.ATTENTION, GAP_REASON.AVOIDANCE],
    question:    'What happens if this promise rejects? Who catches it?',
  },
  missing_error_boundary: {
    rx:          /async\s+function[^{]*\{(?![\s\S]*try\s*\{)/g,
    criticality: 0.85,
    type:        GAP_TYPE.OBLIGATION,
    domain:      DOMAIN.CODE,
    description: 'Async function without error boundary — errors propagate uncaught',
    reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
    question:    'What is the error handling strategy for this async path?',
  },
  missing_auth: {
    rx:          /app\.(get|post|put|delete|patch)\s*\(['"]/gi,
    criticality: 1.00,
    type:        GAP_TYPE.ASSUMPTION,
    domain:      DOMAIN.SECURITY,
    description: 'Route defined — check for auth middleware gap',
    reason:      [GAP_REASON.ATTENTION, GAP_REASON.AVOIDANCE],
    question:    'Is auth verified before this route handler executes? What is the threat model?',
    contextRequired: true,  // only flag if no auth pattern nearby
  },
  tight_coupling: {
    rx:          /require\(['"]\.\.\/|import\s+.*\s+from\s+['"]\.\.\//g,
    criticality: 0.80,
    type:        GAP_TYPE.OBLIGATION,
    domain:      DOMAIN.SOFTWARE_ARCH,
    description: 'Direct relative module imports — coupling via path, not interface',
    reason:      [GAP_REASON.COMPRESSION, GAP_REASON.STRUCTURAL_LIMIT],
    question:    'Can these modules be tested independently? What interface does the dependency actually need?',
  },
  missing_input_validation: {
    rx:          /function\s+\w+\s*\([^)]+\)\s*\{(?![\s\S]{0,200}(if\s*\(|throw\s|assert|validate|check))/g,
    criticality: 0.80,
    type:        GAP_TYPE.DEFINITIONAL,
    domain:      DOMAIN.CODE,
    description: 'Function with no visible input validation — undefined contract',
    reason:      [GAP_REASON.COMPRESSION, GAP_REASON.DEFERRED_VARIABLE],
    question:    'What are the valid inputs? What happens on invalid input?',
  },
  tech_debt_marker: {
    rx:          /\/\/\s*(TODO|FIXME|HACK|XXX|TEMP|TEMPORARY|BANDAID|KLUDGE|SMELL):/gi,
    criticality: 0.70,
    type:        GAP_TYPE.TEMPORAL,
    domain:      DOMAIN.CODE,
    description: 'Technical debt marker — shortcut acknowledged but not resolved',
    reason:      [GAP_REASON.DEFERRED_VARIABLE, GAP_REASON.CAPACITY],
    question:    'What is the resolution plan? When does this get addressed?',
  },
};

// ── Language-specific patterns ────────────────────────────────────────────────

const LANG_PATTERNS = {
  javascript: {
    floating_point_equality: {
      rx:      /===\s*0\.\d+|\d+\.\d+\s*===|0\.\d+\s*===/g,
      crit:    0.75,
      desc:    'Float equality without epsilon — 0.1+0.2 !== 0.3',
      question:'Use epsilon comparison: Math.abs(a - b) < Number.EPSILON',
    },
    this_binding_loss: {
      rx:      /this\.\w+\s*=\s*function|(?<!=>)\bfunction\b.*\bthis\b/g,
      crit:    0.70,
      desc:    'this binding may be lost on method extraction',
      question:'Is this method used as a callback? Arrow function or explicit bind needed?',
    },
    mutation_shared: {
      rx:      /\.push\(|\.splice\(|\.sort\(|delete\s+\w+\[/g,
      crit:    0.65,
      desc:    'Potential shared object mutation — caller state may change',
      question:'Is this operating on a reference passed from outside? Should this be a copy?',
    },
  },
  typescript: {
    any_escape: {
      rx:      /:\s*any\b|as\s+any\b|<any>/g,
      crit:    0.80,
      desc:    'TypeScript type safety bypassed via `any`',
      question:'What is the actual type here? What specific interface would replace any?',
    },
    non_null_assertion: {
      rx:      /\w+!/g,
      crit:    0.80,
      desc:    'Non-null assertion — runtime crash if wrong',
      question:'What guarantees this is non-null here? Is this checked upstream?',
    },
  },
  python: {
    mutable_default: {
      rx:      /def\s+\w+\s*\([^)]*=\s*(\[\]|\{\}|\(\))/g,
      crit:    0.85,
      desc:    'Mutable default argument — shared across all calls',
      question:'Replace with None and initialize inside function body.',
    },
    bare_except: {
      rx:      /except\s*:/g,
      crit:    0.90,
      desc:    'Bare except: catches everything including KeyboardInterrupt',
      question:'Specify the exception type. What specific errors are you handling?',
    },
  },
  sql: {
    injection_surface: {
      rx:      /['"]\s*\+\s*\w+|f['"]\s*SELECT|format\s*\(['"]\s*SELECT/gi,
      crit:    1.00,
      desc:    'SQL injection surface — user input in query string',
      question:'Use parameterized queries. This is a critical security gap.',
    },
    n_plus_one: {
      rx:      /for\s*\([^)]*\)\s*\{[^}]*SELECT|\.forEach[^{]*\{[^}]*query/g,
      crit:    0.85,
      desc:    'Potential N+1 query — database call inside loop',
      question:'Can these queries be batched into a single JOIN or IN clause?',
    },
    missing_transaction: {
      rx:      /INSERT.*\n.*INSERT|UPDATE.*\n.*UPDATE|INSERT.*\n.*UPDATE/gi,
      crit:    0.90,
      desc:    'Multiple related writes — check for transaction boundary',
      question:'Should these writes be wrapped in a transaction? What is partial-failure behavior?',
    },
  },
};

// ── Code Module ───────────────────────────────────────────────────────────────

export class CodeModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text = payload.source ?? payload.resonanceText ?? payload.text;
      if (!isCodeContent(text)) return;

      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_CODE, result);
        this._sessionCount++;
      }
    });
    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    const lang       = detectLanguage(text);
    const detections = [];

    // Universal patterns
    for (const [name, pat] of Object.entries(UNIVERSAL_PATTERNS)) {
      const hits = (text.match(pat.rx) ?? []).length;
      if (hits > 0) {
        detections.push({
          name,
          score:       _clamp(hits * (pat.criticality * 0.6), 0, 1),
          criticality: pat.criticality,
          type:        pat.type,
          domain:      pat.domain,
          description: pat.description,
          reason:      pat.reason,
          question:    pat.question,
          asAbove:     pat.asAbove,
          hits,
        });
      }
    }

    // Language-specific
    const langPats = LANG_PATTERNS[lang] ?? {};
    for (const [name, pat] of Object.entries(langPats)) {
      const hits = (text.match(pat.rx) ?? []).length;
      if (hits > 0) {
        detections.push({
          name:        `${lang}_${name}`,
          score:       _clamp(hits * (pat.crit * 0.6), 0, 1),
          criticality: pat.crit,
          type:        GAP_TYPE.ASSUMPTION,
          domain:      DOMAIN[`LANG_${lang.toUpperCase()}`] ?? DOMAIN.CODE,
          description: `[${lang}] ${pat.desc}`,
          reason:      [GAP_REASON.ATTENTION, GAP_REASON.STRUCTURAL_LIMIT],
          question:    pat.question,
          hits,
        });
      }
    }

    if (!detections.length) return null;

    // Sort: highest criticality × score first
    detections.sort((a, b) => (b.criticality * b.score) - (a.criticality * a.score));

    const top       = detections[0];
    const composite = _clamp(
      detections.slice(0, 4).reduce((s, d, i) => s + d.score * [0.5, 0.25, 0.15, 0.10][i], 0),
      0, 1
    );

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                top.type,
      subtype:             top.name,
      domain:              top.domain,
      score:               composite,
      criticality:         top.criticality,
      description:         top.description,
      reason:              top.reason ?? [GAP_REASON.ATTENTION],
      evidence:            detections.slice(0, 4).map(d => `${d.name}(${d.hits})=${_r4(d.score)}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: top.question,
      axes:                detections.slice(0, 6).map(d => ({ name: d.name, score: _r4(d.score), label: d.description, criticality: d.criticality })),
      asAbove:             top.asAbove ?? 'The unclosed catch block is the unacknowledged argument — the error exists but no one can respond to it.',
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  get sessionCount() { return this._sessionCount; }
}
