/**
 * @spatial/forge — templates.js
 *
 * Code generation templates.
 * Each template produces a complete, runnable @spatial-compatible module
 * from a set of parameters derived from observed behavioral patterns.
 *
 * Every generated module:
 *   - Has a UUID
 *   - Is ESM
 *   - Has zero runtime dependencies (only @spatial/bus peer)
 *   - Follows §K6 (all I/O via bus)
 *   - Is immediately deployable
 */

'use strict';

export const TEMPLATES = {

  // ── Detector module: watches for a behavioral signal cluster ──────────────
  DETECTOR_MODULE: ({ moduleName, signalTypes, threshold, windowMs, species }) => `
/**
 * @spatial/forge — GENERATED DETECTOR MODULE
 * Module: ${moduleName}
 * Species: ${species}
 * Generated: ${new Date().toISOString()}
 * §K6 — all I/O via @spatial/bus
 */
'use strict';

const MODULE_ID = '${moduleName}';
const SIGNAL_TYPES = ${JSON.stringify(signalTypes)};
const THRESHOLD = ${threshold};
const WINDOW_MS = ${windowMs};

export function create${_pascal(moduleName)}({ bus }) {
  if (!bus) throw new Error('[${moduleName}] bus required');

  const _window = [];
  let _active = false;

  bus.on('spatial.kernel.behavior.detected', (p) => {
    if (p.species !== '${species}' && '${species}' !== 'human') return;
    if (!SIGNAL_TYPES.some(t => p.subtype?.includes(t) || p.type?.includes(t))) return;

    _window.push({ ...p, arrivedAt: Date.now() });
    // Prune window
    const cutoff = Date.now() - WINDOW_MS;
    while (_window.length && _window[0].arrivedAt < cutoff) _window.shift();

    const score = _window.length / SIGNAL_TYPES.length;
    if (score >= THRESHOLD && !_active) {
      _active = true;
      bus.emit('spatial.forge.pattern.detected', {
        moduleId: MODULE_ID, species: '${species}',
        score, signals: [..._window], ts: Date.now(),
      });
    } else if (score < THRESHOLD * 0.5 && _active) {
      _active = false;
      bus.emit('spatial.forge.pattern.released', { moduleId: MODULE_ID, ts: Date.now() });
    }
  });

  return { id: MODULE_ID, active: () => _active };
}
`.trim(),

  // ── Suppression module: profiles and tracks suppression signature ─────────
  SUPPRESSION_MODULE: ({ moduleName, suppressionMean, triggerSignals }) => `
/**
 * @spatial/forge — GENERATED SUPPRESSION MODULE
 * Module: ${moduleName}
 * Generated: ${new Date().toISOString()}
 */
'use strict';

const MODULE_ID       = '${moduleName}';
const SUPPRESSION_MEAN = ${suppressionMean};
const TRIGGER_SIGNALS  = ${JSON.stringify(triggerSignals)};

export function create${_pascal(moduleName)}({ bus }) {
  if (!bus) throw new Error('[${moduleName}] bus required');

  let _baseline = SUPPRESSION_MEAN;
  let _current  = 0;
  const _ALPHA  = 0.15;  // EMA smoothing

  bus.on('spatial.kernel.suppression.update', ({ score, subject }) => {
    _current = _current * (1 - _ALPHA) + score * _ALPHA;
    const deviation = _current - _baseline;

    if (Math.abs(deviation) > 0.15) {
      bus.emit('spatial.forge.suppression.deviation', {
        moduleId: MODULE_ID, subject,
        current: _current, baseline: _baseline,
        deviation, direction: deviation > 0 ? 'rising' : 'falling',
        ts: Date.now(),
      });
    }
  });

  bus.on('spatial.kernel.behavior.detected', ({ subtype, subject }) => {
    if (TRIGGER_SIGNALS.some(t => subtype?.includes(t))) {
      _baseline = _baseline * 0.95 + _current * 0.05;  // slow baseline update
      bus.emit('spatial.forge.suppression.trigger', {
        moduleId: MODULE_ID, subject, trigger: subtype,
        suppression: _current, ts: Date.now(),
      });
    }
  });

  return { id: MODULE_ID, current: () => _current, baseline: () => _baseline };
}
`.trim(),

  // ── Field detector: watches relational synchrony between subjects ─────────
  FIELD_DETECTOR: ({ moduleName, syncThreshold, subjects }) => `
/**
 * @spatial/forge — GENERATED FIELD DETECTOR
 * Module: ${moduleName}
 * Generated: ${new Date().toISOString()}
 */
'use strict';

const MODULE_ID     = '${moduleName}';
const SYNC_THRESHOLD = ${syncThreshold};
const SUBJECTS       = ${JSON.stringify(subjects)};

export function create${_pascal(moduleName)}({ bus }) {
  if (!bus) throw new Error('[${moduleName}] bus required');

  let _inSync = false;
  let _score  = 0;

  bus.on('spatial.field.synchrony.update', (p) => {
    const relevant = !SUBJECTS.length ||
      (SUBJECTS.includes(p.subjectA) && SUBJECTS.includes(p.subjectB));
    if (!relevant) return;

    _score = p.score;
    const wasInSync = _inSync;
    _inSync = _score >= SYNC_THRESHOLD;

    if (_inSync && !wasInSync) {
      bus.emit('spatial.forge.field.synchrony.onset', {
        moduleId: MODULE_ID, subjects: [p.subjectA, p.subjectB],
        score: _score, threshold: SYNC_THRESHOLD, ts: Date.now(),
      });
    } else if (!_inSync && wasInSync) {
      bus.emit('spatial.forge.field.synchrony.offset', {
        moduleId: MODULE_ID, score: _score, ts: Date.now(),
      });
    }
  });

  return { id: MODULE_ID, inSync: () => _inSync, score: () => _score };
}
`.trim(),

  // ── Transition predictor: predicts regime transitions from precursors ─────
  TRANSITION_PREDICTOR: ({ moduleName, fromRegime, toRegime, precursors, windowMs }) => `
/**
 * @spatial/forge — GENERATED TRANSITION PREDICTOR
 * Module: ${moduleName}
 * Predicts: ${fromRegime} → ${toRegime}
 * Generated: ${new Date().toISOString()}
 */
'use strict';

const MODULE_ID   = '${moduleName}';
const FROM_REGIME = '${fromRegime}';
const TO_REGIME   = '${toRegime}';
const PRECURSORS  = ${JSON.stringify(precursors)};
const WINDOW_MS   = ${windowMs};

export function create${_pascal(moduleName)}({ bus }) {
  if (!bus) throw new Error('[${moduleName}] bus required');

  let _currentRegime = null;
  const _precursorHits = new Set();
  let _windowStart = 0;

  bus.on('spatial.sigma.regime.changed', ({ next, subject }) => {
    _currentRegime = next;
    if (next === TO_REGIME) {
      bus.emit('spatial.forge.transition.confirmed', {
        moduleId: MODULE_ID, from: FROM_REGIME, to: TO_REGIME,
        precursorsObserved: [..._precursorHits], subject, ts: Date.now(),
      });
      _precursorHits.clear();
    }
  });

  bus.on('spatial.kernel.behavior.detected', ({ subtype, subject, ts }) => {
    if (_currentRegime !== FROM_REGIME) return;
    if (!PRECURSORS.some(p => subtype?.includes(p))) return;

    if (!_precursorHits.size) _windowStart = ts ?? Date.now();
    if ((ts ?? Date.now()) - _windowStart > WINDOW_MS) {
      _precursorHits.clear(); _windowStart = ts ?? Date.now();
    }

    _precursorHits.add(subtype);
    const coverage = _precursorHits.size / PRECURSORS.length;

    if (coverage >= 0.6) {
      bus.emit('spatial.forge.transition.predicted', {
        moduleId: MODULE_ID, from: FROM_REGIME, to: TO_REGIME,
        confidence: coverage, precursors: [..._precursorHits],
        subject, ts: Date.now(),
      });
    }
  });

  return { id: MODULE_ID, regime: () => _currentRegime };
}
`.trim(),

  // ── Species bridge: adapts transmission for cross-species field ───────────
  SPECIES_BRIDGE_MODULE: ({ moduleName, speciesA, speciesB, attunementBaseline, bridgeSignals }) => `
/**
 * @spatial/forge — GENERATED SPECIES BRIDGE MODULE
 * Module: ${moduleName}
 * Bridge: ${speciesA} ↔ ${speciesB}
 * Generated: ${new Date().toISOString()}
 * §CS3 — cross-species field is first-class.
 */
'use strict';

const MODULE_ID            = '${moduleName}';
const SPECIES_A            = '${speciesA}';
const SPECIES_B            = '${speciesB}';
const ATTUNEMENT_BASELINE  = ${attunementBaseline};
const BRIDGE_SIGNALS       = ${JSON.stringify(bridgeSignals)};

export function create${_pascal(moduleName)}({ bus }) {
  if (!bus) throw new Error('[${moduleName}] bus required');

  let _attunement = ATTUNEMENT_BASELINE;
  const _ALPHA    = 0.1;

  bus.on('spatial.field.attunement.update', (p) => {
    const relevant = p.subjects?.some(s =>
      s.includes(SPECIES_A) || s.includes(SPECIES_B));
    if (!relevant) return;

    _attunement = _attunement * (1 - _ALPHA) + p.index * _ALPHA;
    const deviation = _attunement - ATTUNEMENT_BASELINE;

    bus.emit('spatial.forge.bridge.attunement', {
      moduleId: MODULE_ID, speciesA: SPECIES_A, speciesB: SPECIES_B,
      attunement: _attunement, baseline: ATTUNEMENT_BASELINE,
      deviation, ts: Date.now(),
    });
  });

  // When bridge signal detected from species B, translate for species A
  bus.on('spatial.kernel.behavior.detected', (p) => {
    if (!p.species || p.species === SPECIES_A) return;
    if (!BRIDGE_SIGNALS.some(s => p.subtype?.includes(s) || p.type?.includes(s))) return;

    bus.emit('spatial.forge.bridge.signal', {
      moduleId: MODULE_ID,
      fromSpecies: SPECIES_B, toSpecies: SPECIES_A,
      signal: p.subtype ?? p.type,
      attunement: _attunement,
      instruction: _translate(p.subtype ?? p.type, _attunement),
      ts: Date.now(),
    });
  });

  function _translate(signal, att) {
    // Low attunement: prescriptive. High attunement: minimal.
    if (att > 0.8) return 'Continue. They are with you.';
    if (att > 0.6) return \`Signal: \${signal}. Stay present.\`;
    return \`\${SPECIES_B} showing: \${signal}. Soften. Wait. Let them settle.\`;
  }

  return { id: MODULE_ID, attunement: () => _attunement };
}
`.trim(),

  // ── Resonance matcher: finds resonant people for this fingerprint ──────────
  RESONANCE_MATCHER: ({ moduleName, fingerprint, threshold }) => `
/**
 * @spatial/forge — GENERATED RESONANCE MATCHER
 * Module: ${moduleName}
 * Generated: ${new Date().toISOString()}
 */
'use strict';

const MODULE_ID   = '${moduleName}';
const FINGERPRINT = ${JSON.stringify(fingerprint)};
const THRESHOLD   = ${threshold};

export function create${_pascal(moduleName)}({ bus }) {
  if (!bus) throw new Error('[${moduleName}] bus required');

  bus.on('spatial.resonance.scored', (p) => {
    if (p.resonance < THRESHOLD) return;
    bus.emit('spatial.forge.resonance.match', {
      moduleId: MODULE_ID,
      subjectA: p.a, subjectB: p.b,
      resonance: p.resonance, distance: p.composite,
      threshold: THRESHOLD, ts: Date.now(),
    });
  });

  return { id: MODULE_ID };
}
`.trim(),

};

function _pascal(str) {
  return str.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^./, c => c.toUpperCase());
}
