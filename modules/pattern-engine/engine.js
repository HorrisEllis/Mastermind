// ═══════════════════════════════════════════════════════════════════
// PATTERN ENGINE — modules/pattern-engine/engine.js
// v1.0.0
//
// The layer above the lattice. VLE's AssociationEngine finds structure
// WITHIN text at one moment; this finds recurrence ACROSS time and
// across event types, and REMEMBERS it.
//
//   PatternMemory — persistent store of patterns:
//     { id, kind, signature, count, firstSeen, lastSeen, crystallized }
//     confidence = observation count × recency decay (half-life).
//     Crystallizes at threshold; can dissolve back if it goes cold.
//     The crystallization concept is the same evidence→belief mechanism
//     from the NEXUS lineage, minimal form.
//
//   PatternEngine — two real detectors:
//     1. Event motifs: n-grams over the MM_LEDGER ring buffer's event-
//        type sequence. A workflow you repeat (spawn → score → delta)
//        becomes a named, counted motif nobody had to declare.
//     2. Lattice evidence (the hook James asked for): subscribes to
//        voice.utterance.ingested and alm.delta.logged on MM_BUS;
//        reads VLE invariants (persistent themes) and redundancy
//        (phrase loops) as pattern evidence — loose coupling through
//        the bus + VLE's documented public surface, same one-way
//        dependency rule as every cross-module wire this session.
//
// Crystallization → almWriteDelta('pattern', ...) ONCE, on the
// transition only — same spam-guard discipline as the Leverage wire.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const PAT_STATE_KEY          = 'mm_pattern_memory_v1';
const PAT_CRYSTAL_THRESHOLD  = 5;     // observations needed to crystallize
const PAT_DECAY_HALFLIFE_MS  = 1000 * 60 * 60 * 24 * 7; // 7 days
const PAT_DISSOLVE_BELOW     = 1.5;   // effective confidence floor before a crystallized pattern dissolves
const PAT_MOTIF_N            = 3;     // event-sequence n-gram size
const PAT_MOTIF_MIN_COUNT    = 3;     // motif must recur this often to be stored

class PatternMemory {
  constructor() { this._patterns = {}; } // signature -> pattern
  _key(kind, signature) { return kind + '::' + signature; }
  evidence(kind, signature, meta) {
    const k = this._key(kind, signature);
    let p = this._patterns[k];
    const now = Date.now();
    if (!p) {
      p = this._patterns[k] = {
        id: typeof uuid === 'function' ? uuid() : k,
        kind, signature, count: 0, firstSeen: now, lastSeen: now,
        crystallized: false, meta: meta || null,
      };
    }
    p.count++;
    p.lastSeen = now;
    const wasCrystallized = p.crystallized;
    const conf = this.confidence(p);
    if (!p.crystallized && conf >= PAT_CRYSTAL_THRESHOLD) {
      p.crystallized = true;
      // Growth signal, fired ONCE on the transition — a recurring
      // pattern becoming a crystallized belief is exactly what the
      // delta log exists to record.
      if (!wasCrystallized && typeof almWriteDelta === 'function') {
        almWriteDelta('pattern', `Pattern crystallized: [${kind}] ${signature} (${p.count} observations)`, { patternId: p.id, kind, kind2: 'crystallize' });
      }
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('pattern.crystallized', { id: p.id, kind, signature, count: p.count });
    }
    return p;
  }
  // Observation count scaled by recency half-life — an old pattern
  // that stopped recurring loses effective confidence without losing
  // its history.
  confidence(p) {
    const age = Date.now() - p.lastSeen;
    return p.count * Math.pow(0.5, age / PAT_DECAY_HALFLIFE_MS);
  }
  // Called periodically (and on load): crystallized patterns whose
  // decayed confidence has collapsed dissolve back to non-crystallized.
  decayTick() {
    const dissolved = [];
    for (const k in this._patterns) {
      const p = this._patterns[k];
      if (p.crystallized && this.confidence(p) < PAT_DISSOLVE_BELOW) {
        p.crystallized = false;
        dissolved.push(p);
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('pattern.dissolved', { id: p.id, kind: p.kind, signature: p.signature });
      }
    }
    return dissolved;
  }
  all() { return Object.values(this._patterns); }
  crystallized() { return this.all().filter(p => p.crystallized); }
  byKind(kind) { return this.all().filter(p => p.kind === kind); }
  get(kind, signature) { return this._patterns[this._key(kind, signature)] || null; }
  serialize() { return this._patterns; }
  hydrate(obj) { if (obj && typeof obj === 'object') this._patterns = obj; }
  reset() { this._patterns = {}; }
}

class PatternEngine {
  constructor(memory, ledger) {
    this.memory = memory;
    this.ledger = ledger;
    this._lastScanTotal = 0;
  }
  // Detector 1 — event-sequence motifs over the ring ledger. Scans the
  // whole current window each call (bounded by ring capacity, so cheap),
  // counts type-sequence n-grams, feeds recurring ones as evidence.
  scanMotifs() {
    if (!this.ledger || this.ledger.length < PAT_MOTIF_N + 1) return [];
    const types = this.ledger.toArray().map(e => e.type);
    const counts = {};
    for (let i = 0; i <= types.length - PAT_MOTIF_N; i++) {
      const sig = types.slice(i, i + PAT_MOTIF_N).join(' → ');
      counts[sig] = (counts[sig] || 0) + 1;
    }
    const found = [];
    for (const sig in counts) {
      if (counts[sig] >= PAT_MOTIF_MIN_COUNT) {
        // Evidence once per scan per motif, not once per occurrence —
        // otherwise every rescan of the same window re-inflates counts.
        const existing = this.memory.get('event-motif', sig);
        if (!existing || this.ledger.totalSeen > this._lastScanTotal) {
          this.memory.evidence('event-motif', sig, { occurrencesInWindow: counts[sig] });
          found.push({ signature: sig, count: counts[sig] });
        }
      }
    }
    this._lastScanTotal = this.ledger.totalSeen;
    return found;
  }
  // Detector 2 — lattice hooks. Wired in init(): utterances carry
  // invariants + redundancy from VLE; deltas carry their type.
  _onUtterance() {
    if (typeof VLE_STATE === 'undefined') return;
    const inv = VLE_STATE.assoc.invariants();
    for (const w of (inv.words || [])) this.memory.evidence('theme', w, { source: 'vle-invariant' });
    const last = VLE_STATE.utterances[VLE_STATE.utterances.length - 1];
    if (last) {
      const red = VLE_STATE.assoc.redundancyCheck(last.text);
      for (const phrase of (red.phrases || [])) this.memory.evidence('phrase-loop', phrase, { source: 'vle-redundancy' });
    }
    this.scanMotifs();
  }
  init() {
    if (typeof MM_BUS === 'undefined') return false;
    MM_BUS.on('voice.utterance.ingested', () => { try { this._onUtterance(); } catch (e) { MMLog?.error('pattern', '_onUtterance: ' + e.message); } });
    MM_BUS.on('alm.delta.logged', (d) => { try { this.memory.evidence('delta-flow', (d && d.type) || 'unknown', { source: 'alm' }); this.scanMotifs(); } catch (e) { MMLog?.error('pattern', 'delta hook: ' + e.message); } });
    return true;
  }
}

// ── Module state + persistence ─────────────────────────────────────
const PAT_MEMORY = new PatternMemory();
const PAT_ENGINE = new PatternEngine(PAT_MEMORY, typeof MM_LEDGER !== 'undefined' ? MM_LEDGER : null);

function patSave() {
  try {
    localStorage.setItem(PAT_STATE_KEY, JSON.stringify(PAT_MEMORY.serialize()));
    if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
  } catch (e) { MMLog?.error('pattern', 'patSave failed: ' + e.message); }
}
function patLoad() {
  try {
    PAT_MEMORY.hydrate(JSON.parse(localStorage.getItem(PAT_STATE_KEY) || '{}'));
    PAT_MEMORY.decayTick(); // cold crystallized patterns dissolve on load
  } catch (e) { MMLog?.error('pattern', 'patLoad failed: ' + e.message); }
}
// Persist on crystallize/dissolve without every evidence() hitting disk
if (typeof MM_BUS !== 'undefined') {
  MM_BUS.on('pattern.crystallized', patSave);
  MM_BUS.on('pattern.dissolved', patSave);
}

PAT_ENGINE.init();

window.PatternMemory = PatternMemory;
window.PatternEngine = PatternEngine;
window.PAT_MEMORY = PAT_MEMORY;
window.PAT_ENGINE = PAT_ENGINE;
window.patSave = patSave;
window.patLoad = patLoad;

if (typeof MMLog !== 'undefined') MMLog.info('pattern', 'Pattern engine v1.0.0 live — motif scan over ring ledger + lattice evidence hooks');
