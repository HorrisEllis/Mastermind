/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LIMINAL KERNEL  ·  kernel/index.js  ·  v1.0.0                        ║
 * ║  UUID: lim-kernel-0000-0000-1000-0000-000000000001                    ║
 * ║                                                                        ║
 * ║  "The kernel is the root of everything."                              ║
 * ║  It owns the bus. It boots the modules. It exposes the clean API.    ║
 * ║                                                                        ║
 * ║  MODULE BOOT ORDER:                                                   ║
 * ║    1. Bus            — event fabric, all channels                    ║
 * ║    2. Assumption     — load-bearing assumptions                       ║
 * ║    3. Shadow         — present-but-unspoken                           ║
 * ║    4. Contrastive    — word/behavior divergence                       ║
 * ║    5. NegativeSpace  — systematic avoidance                           ║
 * ║    6. Structural     — frame, power geometry                          ║
 * ║    7. Reversal       — meaning inversions                             ║
 * ║    8. Field          — oscillation, edges, field geometry             ║
 * ║    9. Relational     — gaslighting, manipulation, control             ║
 * ║   10. Oscillatory    — sigma regime, pendulum tracking                ║
 * ║   11. Music          — harmonic, lyric, rhythm                        ║
 * ║   12. Code           — code domain, architectural gaps                ║
 * ║   13. Existential    — identity, values, meaning, shadow              ║
 * ║                                                                        ║
 * ║  PRIMARY API:                                                         ║
 * ║    kernel.process(msg)             — run message through all modules  ║
 * ║    kernel.processBatch(msgs)       — ordered batch processing         ║
 * ║    kernel.query(filters)           — query detected gaps              ║
 * ║    kernel.pressure(n)              — gap pressure sequence            ║
 * ║    kernel.summary()                — session summary                  ║
 * ║    kernel.on(channel, fn)          — subscribe to any channel         ║
 * ║    kernel.topGaps(n)               — highest scoring gaps             ║
 * ║                                                                        ║
 * ║  §K1  No module calls another. All via bus.                          ║
 * ║  §K2  All errors as events. Never throws at subscribers.             ║
 * ║  §K3  The kernel never interprets signals. It routes them.           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { createBus, LIM, MODULE }         from '../bus/index.js';
import { classifySigma, SIGMA_REGIME, INVARIANTS } from '../core/index.js';

import { AssumptionModule }              from '../modules/assumption/index.js';
import { ShadowFieldModule }             from '../modules/shadow/index.js';
import { ContrastiveModule }             from '../modules/contrastive/index.js';
import { NegativeSpaceModule }           from '../modules/negative-space/index.js';
import { StructuralAssumptionModule }    from '../modules/structural/index.js';
import { ReversalModule }                from '../modules/reversal/index.js';
import { FieldModule }                   from '../modules/field/index.js';
import { RelationalModule }              from '../modules/relational/index.js';
import { OscillatoryModule }             from '../modules/oscillatory/index.js';
import { MusicModule }                   from '../modules/music/index.js';
import { CodeModule }                    from '../modules/code/index.js';
import { ExistentialModule }             from '../modules/existential/index.js';

export const KERNEL_VERSION = '1.0.0';
export const KERNEL_UUID    = 'lim-kernel-0000-0000-1000-0000-000000000001';

// ── Gap Ledger (in-kernel) ────────────────────────────────────────────────────

class LiminalLedger {
  constructor() {
    this._gaps     = [];
    this._open     = new Map();  // gapId → gap
    this._resolved = [];
  }

  record(gap) {
    this._gaps.push(gap);
    this._open.set(gap.id, gap);
    return gap;
  }

  resolve(gapId, resolution) {
    const gap = this._open.get(gapId);
    if (!gap) return null;
    this._open.delete(gapId);
    const resolved = { ...gap, resolution, resolvedAt: Date.now() };
    this._resolved.push(resolved);
    return resolved;
  }

  query({ domain, type, minScore = 0, limit = 50, openOnly = true } = {}) {
    let items = openOnly ? [...this._open.values()] : this._gaps;
    if (domain)   items = items.filter(g => g.domain === domain);
    if (type)     items = items.filter(g => g.type === type);
    items = items.filter(g => (g.score ?? 0) >= minScore);
    return items
      .slice()
      .sort((a, b) => (b.criticality ?? 0) * (b.score ?? 0) - (a.criticality ?? 0) * (a.score ?? 0))
      .slice(0, limit);
  }

  get openCount()     { return this._open.size; }
  get totalCount()    { return this._gaps.length; }
  get resolvedCount() { return this._resolved.length; }

  domainFrequency() {
    const freq = {};
    for (const g of this._gaps) freq[g.domain] = (freq[g.domain] ?? 0) + 1;
    return freq;
  }

  typeFrequency() {
    const freq = {};
    for (const g of this._gaps) freq[g.type] = (freq[g.type] ?? 0) + 1;
    return freq;
  }

  bottleneck() {
    const freq = this.domainFrequency();
    return Object.entries(freq).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;
  }

  longitudinalPatterns() {
    const patterns = [];
    const gaps     = this._gaps;

    // Domain concentration
    const domFreq = this.domainFrequency();
    const heavy   = Object.entries(domFreq).filter(([, n]) => n >= 3);
    if (heavy.length) {
      patterns.push({
        pattern:     'DOMAIN_CONCENTRATION',
        description: `Gaps concentrated in: ${heavy.map(([d, n]) => `${d}(${n})`).join(', ')}`,
        criticality: 0.80,
      });
    }

    // Assumption dominance
    const aCount = gaps.filter(g => g.type === 'assumption').length;
    if (gaps.length > 2 && aCount / gaps.length > 0.40) {
      patterns.push({
        pattern:     'ASSUMPTION_DOMINANCE',
        description: `${Math.round(aCount / gaps.length * 100)}% assumption type — most load-bearing gap category`,
        criticality: 1.00,
      });
    }

    // Normalisation risk: many low-score gaps persisting
    const lowOpen = [...this._open.values()].filter(g => (g.score ?? 0) < 0.40);
    if (lowOpen.length >= 4) {
      patterns.push({
        pattern:     'NORMALISATION_RISK',
        description: `${lowOpen.length} sub-threshold gaps open — normalisation hides accumulation`,
        criticality: 0.90,
      });
    }

    // Identity-critical cluster
    const identCrit = gaps.filter(g => g.type === 'identity_attack' || g.subtype === 'identity_assumption' || g.subtype === 'shadow_gap');
    if (identCrit.length >= 2) {
      patterns.push({
        pattern:     'IDENTITY_CLUSTER',
        description: `${identCrit.length} identity-level gaps detected — this is the deepest level`,
        criticality: 1.00,
      });
    }

    return patterns;
  }
}

// ── Composite Aggregator ──────────────────────────────────────────────────────

class CompositeAggregator {
  constructor({ bus, ledger, windowMs = 2000 }) {
    this._bus       = bus;
    this._ledger    = ledger;
    this._window    = windowMs;
    this._pending   = [];
    this._timer     = null;
    this._pressSeq  = [];
  }

  ingest(gap) {
    this._pending.push(gap);
    this._pressSeq.push(gap.score ?? 0);
    if (this._pressSeq.length > 100) this._pressSeq.shift();

    if (!this._timer) {
      this._timer = setTimeout(() => this._flush(), this._window);
    }
  }

  _flush() {
    this._timer = null;
    if (!this._pending.length) return;

    const gaps     = this._pending.splice(0);
    const pressure = gaps.reduce((s, g) => s + (g.score ?? 0), 0) / gaps.length;
    const byType   = {};
    for (const g of gaps) byType[g.type] = (byType[g.type] ?? 0) + 1;
    const dominantType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'unknown';
    const sigma    = classifySigma(this._pressSeq.slice(-20));
    const entityId = gaps.find(g => g.author)?.author ?? null;

    this._bus.emit(LIM.GAP_COMPOSITE, {
      gaps,
      pressure:    Math.round(pressure * 1000) / 1000,
      dominantType,
      entityId,
      sigma:       sigma.regime,
      count:       gaps.length,
      ts:          Date.now(),
    });

    // Update field
    if (entityId) {
      this._bus.emit(LIM.GAP_FIELD_UPDATE, { entityId, field: { pressure, dominantType, sigma: sigma.regime } });
    }
  }

  get pressureSequence() { return [...this._pressSeq]; }
}

// ── Liminal Kernel ────────────────────────────────────────────────────────────

export class LiminalKernel {
  constructor({ debug = false, compositeWindowMs = 2000 } = {}) {
    this._debug    = debug;
    this._ready    = false;
    this._modules  = {};
    this._sessionStart = Date.now();
    this._messageCount = 0;

    // Core infrastructure
    this.bus     = createBus({ debug });
    this._ledger = new LiminalLedger();
    this._composite = new CompositeAggregator({ bus: this.bus, ledger: this._ledger, windowMs: compositeWindowMs });
  }

  /** Boot all modules. Must be called before process(). */
  boot() {
    if (this._ready) return this;

    // Wire gap recording — every gap channel → ledger
    this.bus.on('lim.gap.*', (payload) => {
      if (payload?.id && payload?.type) {
        this._ledger.record(payload);
        this._composite.ingest(payload);
      }
    });

    // Wire error logging
    this.bus.on(LIM.ERROR, (payload) => {
      if (this._debug) console.error(`[LiminalKernel] Error in ${payload.source}:`, payload.error);
    });

    // Boot modules in order
    this._modules[MODULE.ASSUMPTION]     = new AssumptionModule({ bus: this.bus }).attach();
    this._modules[MODULE.SHADOW]         = new ShadowFieldModule({ bus: this.bus }).attach();
    this._modules[MODULE.CONTRASTIVE]    = new ContrastiveModule({ bus: this.bus }).attach();
    this._modules[MODULE.NEGATIVE_SPACE] = new NegativeSpaceModule({ bus: this.bus }).attach();
    this._modules[MODULE.STRUCTURAL]     = new StructuralAssumptionModule({ bus: this.bus }).attach();
    this._modules[MODULE.REVERSAL]       = new ReversalModule({ bus: this.bus }).attach();
    this._modules[MODULE.FIELD]          = new FieldModule({ bus: this.bus }).attach();
    this._modules[MODULE.RELATIONAL]     = new RelationalModule({ bus: this.bus }).attach();
    this._modules[MODULE.OSCILLATORY]    = new OscillatoryModule({ bus: this.bus }).attach();
    this._modules[MODULE.MUSIC]          = new MusicModule({ bus: this.bus }).attach();
    this._modules[MODULE.CODE]           = new CodeModule({ bus: this.bus }).attach();
    this._modules[MODULE.EXISTENTIAL]    = new ExistentialModule({ bus: this.bus }).attach();

    this._ready = true;
    this.bus.emit(LIM.READY, { module: 'kernel', version: KERNEL_VERSION });

    if (this._debug) console.log('[LiminalKernel] Booted ✓', Object.keys(this._modules).length, 'modules');
    return this;
  }

  // ── Primary API ────────────────────────────────────────────────────────────

  /**
   * Process a message through all gap detection modules.
   *
   * @param {object} msg
   * @param {string} msg.text       — raw input text
   * @param {string} [msg.author]   — person ID
   * @param {number} [msg.ts]       — unix timestamp ms
   * @param {string} [msg.platform] — source platform
   * @param {string} [msg.id]       — unique message ID
   * @param {string} [msg.source]   — original untransformed text (for code module)
   * @returns {string} message ID
   */
  process(msg) {
    this._assertReady();
    const id = msg.id ?? `lim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
    this._messageCount++;

    // Emit on ingest channel — all modules listen here
    this.bus.emit(LIM.INGEST, { ...msg, id });

    // Translate → resonance text (inline, no UTL dependency)
    const resonanceText = this._translate(msg.text ?? '');
    const signalDensity = this._signalDensity(resonanceText);

    // Emit translated — all detection modules listen here
    this.bus.emit(LIM.INGEST_TRANSLATED, {
      id,
      text:          msg.text ?? '',
      source:        msg.source ?? msg.text ?? '',  // raw for code module
      resonanceText,
      signalDensity,
      author:        msg.author ?? null,
      ts:            msg.ts ?? Date.now(),
      platform:      msg.platform ?? 'unknown',
      surfaceType:   this._surfaceType(msg.text ?? ''),
    });

    return id;
  }

  /**
   * Process a batch of messages. Sorted by ts.
   */
  processBatch(messages) {
    this._assertReady();
    const sorted = [...messages].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
    const ids    = sorted.map(msg => this.process(msg));
    this.bus.emit(LIM.INGEST_BATCH_DONE, { count: sorted.length, ts: Date.now() });
    return ids;
  }

  /**
   * Query detected gaps from the ledger.
   *
   * @param {object} filters
   * @param {string} [filters.domain]    — filter by domain
   * @param {string} [filters.type]      — filter by gap type
   * @param {number} [filters.minScore]  — minimum score (0-1)
   * @param {number} [filters.limit]     — max results (default 50)
   * @param {boolean}[filters.openOnly]  — only open (unresolved) gaps
   */
  query(filters = {}) {
    return this._ledger.query(filters);
  }

  /**
   * Top N gaps by criticality × score.
   */
  topGaps(n = 10) {
    return this._ledger.query({ limit: n });
  }

  /**
   * Gap pressure sequence — for pendulum/rhythm analysis.
   */
  pressure(n = 50) {
    return this._composite.pressureSequence.slice(-n);
  }

  /**
   * Session summary.
   */
  summary() {
    const patterns = this._ledger.longitudinalPatterns();
    const sigma    = classifySigma(this._composite.pressureSequence.slice(-20));

    return {
      sessionId:         this._sessionId,
      durationMs:        Date.now() - this._sessionStart,
      messageCount:      this._messageCount,
      totalGaps:         this._ledger.totalCount,
      openGaps:          this._ledger.openCount,
      resolvedGaps:      this._ledger.resolvedCount,
      resolutionRate:    this._ledger.totalCount > 0
        ? Math.round(this._ledger.resolvedCount / this._ledger.totalCount * 100)
        : 0,
      sigma:             sigma.regime,
      bottleneckDomain:  this._ledger.bottleneck(),
      domainFrequency:   this._ledger.domainFrequency(),
      typeFrequency:     this._ledger.typeFrequency(),
      longitudinalPatterns: patterns,
      criticalOpen:      this._ledger.query({ minScore: 0.80, limit: 5 }),
      invariants:        INVARIANTS,
      note:              'Nothing is closed for comfort. Every open gap stays open until something real closes it.',
    };
  }

  /**
   * Subscribe to any bus channel.
   * Returns unsubscribe function.
   *
   * Examples:
   *   kernel.on(LIM.GAP_ASSUMPTION, fn)   — all assumption gaps
   *   kernel.on('lim.gap.*', fn)          — all gap detections
   *   kernel.on(LIM.GAP_COMPOSITE, fn)    — composite aggregations
   *   kernel.on(LIM.ERROR, fn)            — all errors
   */
  on(channel, fn) {
    return this.bus.on(channel, fn);
  }

  /** Resolve a gap (mark as addressed) */
  resolve(gapId, resolution) {
    const r = this._ledger.resolve(gapId, resolution);
    if (r) this.bus.emit(LIM.LEDGER_GAP_CLOSED, { gapId, resolution });
    return r;
  }

  /** Direct access to a module for advanced use */
  module(name) {
    return this._modules[name] ?? null;
  }

  /** Bus history */
  history(prefix, n) {
    return this.bus.history(prefix, n);
  }

  // ── Text utilities (kernel-local, no external deps) ────────────────────────

  _translate(text) {
    if (!text) return '';
    return text
      .replace(/\bi'm\b/gi,   'i am')
      .replace(/\byou're\b/gi,'you are')
      .replace(/\bcan't\b/gi, 'cannot')
      .replace(/\bwon't\b/gi, 'will not')
      .replace(/\bdon't\b/gi, 'do not')
      .replace(/\bisn't\b/gi, 'is not')
      .replace(/\baren't\b/gi,'are not')
      .replace(/\bdidn't\b/gi,'did not')
      .replace(/\bdoesn't\b/gi,'does not')
      .replace(/\bhasn't\b/gi,'has not')
      .replace(/\bhaven't\b/gi,'have not')
      // Abbrevs
      .replace(/\blol\b/gi,   'that is funny')
      .replace(/\bngl\b/gi,   'not going to lie')
      .replace(/\btbh\b/gi,   'to be honest')
      .replace(/\bidk\b/gi,   'i do not know')
      .replace(/\bidc\b/gi,   'i do not care')
      .replace(/\bnvm\b/gi,   'never mind')
      .replace(/\brn\b/gi,    'right now')
      .replace(/\bfr\b/gi,    'for real')
      .replace(/\bno cap\b/gi,'seriously')
      .replace(/\bghostd?\b/gi,'suddenly stopped responding')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\s{2,}/g,     ' ')
      .trim();
  }

  _signalDensity(text) {
    const words        = text.split(/\s+/).filter(Boolean);
    const emotionRe    = /\b(feel|felt|feeling|love|hate|angry|sad|hurt|scared|anxious|happy|lonely|miss|need|want|afraid|pain|cry|tears|joy|peace|hope|fear|shame|guilt|mad|upset|sorry|confused|lost|broken|empty|numb|distant|cold|warm)\b/gi;
    const emotionWords = (text.match(emotionRe) ?? []).length;
    return words.length > 0 ? Math.round((emotionWords / words.length) * 1000) / 1000 : 0;
  }

  _surfaceType(text) {
    if (!text) return 'empty';
    if (/^(function|class|const|let|var|import|def |fn |SELECT )/i.test(text.trim())) return 'code';
    if (text.length < 30) return 'short_message';
    if (text.length > 500) return 'long_form';
    if (text.split('\n').length >= 3) return 'multi_line';
    return 'chat';
  }

  _assertReady() {
    if (!this._ready) throw new Error('[LiminalKernel] Not booted. Call kernel.boot() first.');
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Create and boot a LiminalKernel.
 *
 * @example
 *   const kernel = createLiminal({ debug: false });
 *
 *   kernel.on('lim.gap.*', gap => console.log(gap));
 *
 *   kernel.process({ text: "I'm fine.", author: 'alice', ts: Date.now() });
 *   kernel.process({ text: "that never happened", author: 'bob' });
 *
 *   const top = kernel.topGaps(5);
 *   const sum = kernel.summary();
 */
export function createLiminal(opts = {}) {
  return new LiminalKernel(opts).boot();
}
