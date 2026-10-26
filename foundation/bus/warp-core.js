// ═══════════════════════════════════════════════════════════════════
// WARP core — browser bundle (v1.4.0)
//
// Ported verbatim from warp-v1_4.zip (core/Event.js, Gate.js, Axiom.js,
// Stream.js, StreamLog.js). Logic is unchanged — only the module wrapper
// changed, because this renderer runs with nodeIntegration:false /
// contextIsolation:true (see main.js), so CommonJS require()/module.exports
// aren't available here. Everything below is exposed as window.WARP
// instead of a Node module.
//
// This is what mastermind-warp-spine.js builds the app's navigation
// Stream on top of.
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function () {

// ── Event — immutable data packet ─────────────────────────────────
function _uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

class Event {
  constructor(type, data = {}) {
    if (!type || typeof type !== 'string') {
      throw new Error('[warp/Event] type must be a non-empty string');
    }
    this.type = type;
    this.data = Object.freeze({ ...data });
    this.uuid = _uid();
    this.ts = Date.now();
    Object.freeze(this);
  }
}

// ── Gate — pure transform ─────────────────────────────────────────
class Gate {
  constructor(signature, { matches, transform, schema = null } = {}) {
    if (!signature || typeof signature !== 'string') {
      throw new Error('[warp/Gate] signature must be a non-empty string');
    }
    if (typeof transform !== 'function') {
      throw new Error(`[warp/Gate:${signature}] transform must be a function`);
    }
    this.signature = signature;
    this._matches = matches || ((event) => event.type === signature);
    this._transform = transform;
    this.schema = schema;
  }

  matches(event) {
    return this._matches(event);
  }

  transform(event) {
    return this._transform(event);
  }

  validateOutput(output) {
    if (!this.schema) return { ok: true, missing: [], wrongType: [] };
    const missing = [];
    const wrongType = [];
    const required = this.schema.requiredKeys || [];
    const types = this.schema.types || {};
    for (const key of required) {
      if (output == null || !(key in output)) { missing.push(key); continue; }
      const expected = types[key];
      if (expected && typeof output[key] !== expected) wrongType.push({ key, expected, actual: typeof output[key] });
    }
    return { ok: missing.length === 0 && wrongType.length === 0, missing, wrongType };
  }
}

// ── Axiom — enforced invariant ────────────────────────────────────
const DEFAULT_WEIGHTS = { hard: 1.0, soft: 0.3 };

class Axiom {
  constructor(id, { check, severity = 'hard', version = '1.0.0', weight = null } = {}) {
    if (!id || typeof id !== 'string') {
      throw new Error('[warp/Axiom] id must be a non-empty string');
    }
    if (typeof check !== 'function') {
      throw new Error(`[warp/Axiom:${id}] check must be a function`);
    }
    if (severity !== 'hard' && severity !== 'soft') {
      throw new Error(`[warp/Axiom:${id}] severity must be 'hard' or 'soft'`);
    }
    this.id = id;
    this.check = check;
    this.severity = severity;
    this.version = version;
    this.weight = weight !== null ? weight : DEFAULT_WEIGHTS[severity];
  }
}

// ── Stream — the dispatch loop ────────────────────────────────────
class Stream {
  constructor({ log = null, parentStreamId = null, axioms = [] } = {}) {
    this.gates = new Map();
    this.axioms = [...axioms];
    this.pending = [];
    this.rejected = [];
    this.eventCount = 0;
    this.log = log;
    this.streamId = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;
    this._hooks = { scorer: [], crystallizer: [], cascader: [] };
  }

  register(gate) {
    if (this.gates.has(gate.signature)) {
      throw new Error(`[warp/Stream] Signature collision: '${gate.signature}'`);
    }
    this.gates.set(gate.signature, gate);
  }

  registerAxiom(axiom) {
    this.axioms.push(axiom);
  }

  hook(kind, plugin) {
    if (!this._hooks[kind]) {
      throw new Error(`[warp/Stream] unknown hook kind: '${kind}'`);
    }
    if (typeof plugin !== 'function') {
      throw new Error(`[warp/Stream] hook '${kind}' plugin must be a function`);
    }
    this._hooks[kind].push(plugin);
  }

  hooks(kind) {
    return this._hooks[kind] ? [...this._hooks[kind]] : [];
  }

  _checkAxioms(event, gate) {
    const failures = [];
    for (const axiom of this.axioms) {
      let passed;
      try {
        passed = !!axiom.check(event, gate, this.sampleHere());
      } catch (e) {
        passed = false;
      }
      if (!passed) failures.push({ axiomId: axiom.id, severity: axiom.severity });
    }
    const hardFail = failures.some(f => f.severity === 'hard');
    return { ok: !hardFail, failures };
  }

  emit(event) {
    this.eventCount++;
    const gate = this.gates.get(event.type);

    if (!gate) {
      if (this.log) {
        this.log.record({
          streamId: this.streamId, parentStreamId: this.parentStreamId,
          eventType: event.type, gateClaimed: null, axiomResult: null,
        });
      }
      this.pending.push(event);
      return;
    }

    const axiomResult = this._checkAxioms(event, gate);

    if (this.log) {
      this.log.record({
        streamId: this.streamId, parentStreamId: this.parentStreamId,
        eventType: event.type, gateClaimed: gate.signature,
        axiomResult,
      });
    }

    if (!axiomResult.ok) {
      this.rejected.push({ event, gate: gate.signature, failures: axiomResult.failures });
      return;
    }

    const produced = gate.transform(event);
    const events = produced == null ? [] : (Array.isArray(produced) ? produced : [produced]);
    for (const next of events) this.emit(next);
  }

  sampleHere() {
    return {
      pending: [...this.pending],
      rejected: [...this.rejected],
      eventCount: this.eventCount,
      gateCount: this.gates.size,
      axiomCount: this.axioms.length,
    };
  }
}

// ── StreamLog — append-only audit trail ───────────────────────────
class StreamLog {
  constructor() {
    this._entries = [];
    this._nextId = 0;
  }

  nextStreamId() {
    return ++this._nextId;
  }

  record(entry) {
    this._entries.push({ ...entry, loggedAt: Date.now() });
  }

  entries() {
    return [...this._entries];
  }
}

window.WARP = { Event, Gate, Axiom, Stream, StreamLog };

})();
