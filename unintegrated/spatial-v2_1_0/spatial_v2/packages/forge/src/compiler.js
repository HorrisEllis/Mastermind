/**
 * @spatial/forge — compiler.js
 *
 * PatternCompiler — the engine that turns observed behavioral patterns
 * into runnable @spatial modules.
 *
 * Observe → Detect → Compile → Deploy → Observe (refined)
 *
 * §K6 — all I/O via @spatial/bus
 * §K7 — all errors as events
 * §5.5 — zero runtime dependencies
 * §1.1 — outputs are signals, not verdicts
 */

'use strict';

import { createPattern, matchGrammar } from './grammar.js';
import { TEMPLATES } from './templates.js';

export const COMPILER_VERSION = '1.0.0';

export class PatternCompiler {
  constructor({ bus, autoCompile = true, minOccurrences = 2 } = {}) {
    if (!bus) throw new Error('[PatternCompiler] bus required');
    this._bus           = bus;
    this._autoCompile   = autoCompile;
    this._minOccurrences = minOccurrences;
    this._patterns      = new Map();   // patternId → pattern
    this._compiled      = new Map();   // patternId → { code, template, params, ts }
    this._signalBuffer  = new Map();   // subjectId → signal[]
    this._BUFFER_MS     = 5000;
    this._attach();
  }

  _attach() {
    const b = this._bus;

    // Ingest behavioral signals into rolling buffer
    b.on('spatial.kernel.behavior.detected', (p) => {
      this._ingest(p.subject ?? 'default', {
        type: p.layer ?? 'gesture',
        subtype: p.subtype ?? p.type,
        confidence: p.confidence ?? 0.7,
        ts: p.ts ?? Date.now(),
        species: p.species ?? 'human',
      });
    });

    // Ingest regime changes as signals
    b.on('spatial.sigma.regime.changed', (p) => {
      this._ingest(p.subject ?? 'default', {
        type: 'regime',
        subtype: p.next,
        confidence: p.confidence ?? 0.8,
        ts: p.ts ?? Date.now(),
      });
    });

    // Ingest drift clusters — these are high-value pattern seeds
    b.on('spatial.kernel.drift.cluster', (p) => {
      this._ingestCluster(p);
    });

    // Ingest field signals
    b.on('spatial.field.synchrony.update', (p) => {
      if (p.score > 0.7) {
        this._ingest('field', {
          type: 'synchrony',
          subtype: 'high_synchrony',
          confidence: p.score,
          ts: p.ts ?? Date.now(),
          context: { subjects: [p.subjectA, p.subjectB], synchrony: p.score },
        });
      }
    });

    // Manual pattern registration
    b.on('spatial.forge.pattern.register', (p) => {
      this.register(p);
    });

    // Manual compile trigger
    b.on('spatial.forge.compile.request', ({ patternId }) => {
      const pattern = this._patterns.get(patternId);
      if (pattern) this.compile(pattern);
      else b.emit('spatial.forge.error', { code: 'PATTERN_NOT_FOUND', patternId });
    });
  }

  _ingest(subjectId, signal) {
    if (!this._signalBuffer.has(subjectId)) this._signalBuffer.set(subjectId, []);
    const buf = this._signalBuffer.get(subjectId);
    buf.push(signal);
    // Prune old signals
    const cutoff = Date.now() - this._BUFFER_MS;
    while (buf.length && (buf[0].ts ?? 0) < cutoff) buf.shift();
    // Auto-detect pattern if buffer is rich enough
    if (buf.length >= 3 && this._autoCompile) {
      this._detectFromBuffer(subjectId, buf);
    }
  }

  _ingestCluster(clusterEvent) {
    // A drift cluster is a pre-detected multi-signal pattern
    const signals = (clusterEvent.signals ?? []).map(s => ({
      type: 'drift',
      subtype: s.type,
      confidence: s.score ?? 0.7,
      ts: clusterEvent.ts ?? Date.now(),
    }));
    if (!signals.length) return;

    const patternId = `drift-cluster-${clusterEvent.personId ?? 'unknown'}-${Date.now().toString(36)}`;
    const pattern = createPattern({
      id: patternId,
      label: `Drift cluster: ${signals.map(s => s.subtype).join(', ')}`,
      signals,
      temporalWindow: 3000,
      confidence: clusterEvent.clusterScore ?? 0.7,
      subject: clusterEvent.personId,
      context: { regime: clusterEvent.regime },
      occurrences: 1,
    });

    this.register(pattern);
    if (this._autoCompile) this.compile(pattern);
  }

  _detectFromBuffer(subjectId, buf) {
    const recent = buf.slice(-8);
    const confidence = recent.reduce((s, x) => s + (x.confidence ?? 0.5), 0) / recent.length;
    if (confidence < 0.55) return;

    const patternKey = recent.map(s => s.subtype ?? s.type).sort().join(':');
    const existing = [...this._patterns.values()].find(p => p._key === patternKey);

    if (existing) {
      existing.occurrences++;
      if (existing.occurrences >= this._minOccurrences && this._autoCompile) {
        this.compile(existing);
      }
    } else {
      const pattern = createPattern({
        label: `Auto: ${recent.map(s => s.subtype ?? s.type).slice(0,3).join(' + ')}`,
        signals: recent,
        temporalWindow: this._BUFFER_MS,
        confidence,
        subject: subjectId,
        species: recent[0]?.species ?? 'human',
        occurrences: 1,
      });
      pattern._key = patternKey;
      this.register(pattern);
    }
  }

  /** Register a pattern manually */
  register(pattern) {
    this._patterns.set(pattern.id, pattern);
    this._bus.emit('spatial.forge.pattern.registered', {
      patternId: pattern.id, label: pattern.label,
      confidence: pattern.confidence, ts: Date.now(),
    });
    return pattern.id;
  }

  /** Compile a pattern to code */
  compile(pattern) {
    const matches = matchGrammar(pattern);
    if (!matches.length) return null;

    const results = [];
    for (const { rule, params } of matches) {
      const templateFn = TEMPLATES[rule.template];
      if (!templateFn) continue;

      try {
        const code = templateFn(params);
        const result = {
          patternId:  pattern.id,
          templateId: rule.template,
          ruleId:     rule.id,
          moduleName: params.moduleName,
          code,
          params,
          ts:         Date.now(),
        };
        this._compiled.set(params.moduleName, result);
        this._bus.emit('spatial.forge.module.compiled', result);
        results.push(result);
      } catch (err) {
        this._bus.emit('spatial.forge.error', {
          code: 'COMPILE_ERROR', ruleId: rule.id,
          message: err?.message, patternId: pattern.id,
        });
      }
    }
    return results.length ? results : null;
  }

  /** Get all compiled modules */
  modules()               { return [...this._compiled.values()]; }
  /** Get a specific module by name */
  module(name)            { return this._compiled.get(name) ?? null; }
  /** Get all registered patterns */
  patterns()              { return [...this._patterns.values()]; }
  /** Pattern count */
  get patternCount()      { return this._patterns.size; }
  /** Compiled module count */
  get compiledCount()     { return this._compiled.size; }
}
