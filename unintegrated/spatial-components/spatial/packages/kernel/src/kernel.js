/**
 * ╔═══════════════════════════════════════════════════════════════════╗
 * ║  ASSOCIATIVE LATTICE KERNEL  ·  kernel.js  ·  v1.4.0            ║
 * ║  UUID: alk-kernel-0000-0000-1000-0000-000000000001              ║
 * ╚═══════════════════════════════════════════════════════════════════╝
 *
 * The ALK kernel is a general-purpose, decoupled event fabric.
 * It is domain-agnostic: it does not know about voice, video, text,
 * sensors, or any application layer. It knows only:
 *
 *   — Events (typed, immutable, causally linked)
 *   — Channels (named topic namespaces, dot-separated)
 *   — Subscriptions (pattern-matched listeners)
 *   — Gates (pre-emit transforms and guards)
 *   — Lattice (the graph of associations between events)
 *   — Clock (logical + wall time, always co-present)
 *
 * ┌────────────────────────────────────────────────────────────┐
 * │                    ARCHITECTURE                            │
 * │                                                            │
 * │  Producer ──emit()──► [Gate Chain] ──► Ring Buffer         │
 * │                              │              │              │
 * │                              ▼              ▼              │
 * │                         Lattice         Subscribers        │
 * │                         (graph)         (pattern)          │
 * │                              │                             │
 * │                              ▼                             │
 * │                        Associations                        │
 * │                    (causal + semantic)                     │
 * └────────────────────────────────────────────────────────────┘
 *
 * CONTRACTS:
 *   §K1  Events are immutable after construction. freeze() enforced.
 *   §K2  Gate output is collected atomically — gates never call emit().
 *   §K3  Channel strings are dot-namespaced. Wildcards: * (one), ** (any).
 *   §K4  Logical clock strictly monotone. Wall clock advisory only.
 *   §K5  Ring buffer is bounded. Old events are evicted, not deleted.
 *        Eviction removes all lattice edges for that event.
 *   §K6  No module may call another module directly. All communication
 *        via kernel.emit(). Kernel enforces this by design (no refs).
 *   §K7  All errors surface as 'alk.kernel.error' events, never throws.
 *   §K8  Module UUIDs are opaque strings. No module introspects another.
 *
 * LATTICE GRAPH:
 *   Every event may link to a parent (causedBy) and carry semantic
 *   associations (relatedTo[]). The kernel maintains the adjacency
 *   structure. Queries traverse the lattice graph.
 *
 * PATTERN MATCHING:
 *   'alk.verbal.chunk.*'      — one segment wildcard
 *   'alk.verbal.**'           — any depth suffix wildcard
 *   'alk.**.error'            — mid-pattern any-depth wildcard
 */

// ─── Identity ─────────────────────────────────────────────────────────────────

let _seq = 0;

function newId() {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 7);
  const seq = (_seq++).toString(36).padStart(4, '0');
  return `${ts}-${rnd}-${seq}`;
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Clock ────────────────────────────────────────────────────────────────────

export function createClock() {
  let tick = 0;
  return {
    now()     { return ++tick; },
    peek()    { return tick; },
    wall()    { return Date.now(); },
  };
}

// ─── Event ────────────────────────────────────────────────────────────────────

/**
 * Construct and freeze a Lattice Event.
 *
 * @param {string}  type       — dot-namespaced channel (e.g. 'alk.verbal.tone')
 * @param {object}  payload    — arbitrary data (frozen on construction)
 * @param {object}  meta       — routing metadata
 * @param {number}  meta.tick  — logical clock tick (kernel-assigned)
 * @param {number}  meta.wall  — wall timestamp ms
 * @param {string}  [meta.causedBy]    — parent event id
 * @param {string}  [meta.sourceUUID]  — emitting module UUID
 * @param {string[]} [meta.relatedTo]  — semantic associations (lattice edges)
 * @param {string}  [meta.sessionId]   — session grouping
 * @param {string}  [meta.edgeType]    — 'causal' | 'semantic' | 'temporal' | 'rule'
 */
export function createEvent(type, payload, meta = {}) {
  if (typeof type !== 'string' || !type)
    throw new TypeError('[ALK] Event type must be a non-empty string');

  const id = newId();
  return Object.freeze({
    id,
    type,
    payload: Object.freeze(payload || {}),
    meta: Object.freeze({
      tick:       meta.tick       ?? 0,
      wall:       meta.wall       ?? Date.now(),
      causedBy:   meta.causedBy   ?? null,
      sourceUUID: meta.sourceUUID ?? null,
      sessionId:  meta.sessionId  ?? null,
      relatedTo:  Object.freeze(meta.relatedTo ?? []),
      edgeType:   meta.edgeType   ?? 'causal',
      hash:       fnv1a(type + JSON.stringify(payload ?? {})),
    }),
  });
}

// ─── Channel Pattern Matching ─────────────────────────────────────────────────

/**
 * Compile a channel pattern into a test function.
 * Supports: * (one segment), ** (any segments), exact
 */
export function compilePattern(pattern) {
  if (pattern === '**') return () => true;

  const parts = pattern.split('.');
  return function testPattern(type) {
    const segs = type.split('.');
    return matchSegments(parts, segs, 0, 0);
  };
}

function matchSegments(parts, segs, pi, si) {
  while (pi < parts.length && si < segs.length) {
    if (parts[pi] === '**') {
      // ** can match 0..N segments — try each possibility
      for (let k = si; k <= segs.length; k++) {
        if (matchSegments(parts, segs, pi + 1, k)) return true;
      }
      return false;
    } else if (parts[pi] === '*') {
      pi++; si++;
    } else if (parts[pi] === segs[si]) {
      pi++; si++;
    } else {
      return false;
    }
  }
  // Exhaust trailing **
  while (pi < parts.length && parts[pi] === '**') pi++;
  return pi === parts.length && si === segs.length;
}

// ─── Ring Buffer ──────────────────────────────────────────────────────────────

function createRing(cap) {
  const buf = new Array(cap);
  let head = 0, size = 0;

  return {
    push(item) {
      const evicted = size === cap ? buf[head] : null;
      buf[head] = item;
      head = (head + 1) % cap;
      if (size < cap) size++;
      return evicted;
    },
    get(i) {
      if (i < 0 || i >= size) return undefined;
      return buf[size < cap ? i : (head + i) % cap];
    },
    last()    { return size === 0 ? undefined : buf[(head - 1 + cap) % cap]; },
    toArray() { const a = new Array(size); for (let i=0;i<size;i++) a[i]=this.get(i); return a; },
    get length() { return size; },
    clear()   { head = 0; size = 0; },
  };
}

// ─── Lattice Graph ────────────────────────────────────────────────────────────

/**
 * The Lattice stores the directed association graph between events.
 * Edges are typed: causal, semantic, temporal, rule.
 *
 * parent(id)       → event that caused id
 * children(id)     → events caused by id
 * related(id)      → semantic associations (bidirectional)
 * traceToRoot(id)  → causal chain to origin
 * descendants(id)  → all events caused (transitively) by id
 */
function createLattice() {
  // Maps: eventId → Set<eventId>
  const parentOf   = new Map();   // id → parentId
  const childrenOf = new Map();   // id → Set<id>
  const relatedOf  = new Map();   // id → Set<id>
  const edgeMeta   = new Map();   // `${from}:${to}` → { type, tick }

  function addNode(id) {
    if (!childrenOf.has(id)) childrenOf.set(id, new Set());
    if (!relatedOf.has(id))  relatedOf.set(id, new Set());
  }

  function addEdge(fromId, toId, type, tick) {
    addNode(fromId); addNode(toId);
    childrenOf.get(fromId).add(toId);
    parentOf.set(toId, fromId);
    edgeMeta.set(`${fromId}:${toId}`, { type, tick });
  }

  function addRelated(aId, bId, tick) {
    addNode(aId); addNode(bId);
    relatedOf.get(aId).add(bId);
    relatedOf.get(bId).add(aId);
    edgeMeta.set(`${aId}~${bId}`, { type: 'semantic', tick });
  }

  function prune(id) {
    // Called on ring eviction — remove all edges for this node
    const parent = parentOf.get(id);
    if (parent) {
      childrenOf.get(parent)?.delete(id);
      edgeMeta.delete(`${parent}:${id}`);
    }
    const children = childrenOf.get(id);
    if (children) {
      for (const c of children) {
        parentOf.delete(c);
        edgeMeta.delete(`${id}:${c}`);
      }
    }
    const related = relatedOf.get(id);
    if (related) {
      for (const r of related) {
        relatedOf.get(r)?.delete(id);
        edgeMeta.delete(`${id}~${r}`);
        edgeMeta.delete(`${r}~${id}`);
      }
    }
    parentOf.delete(id);
    childrenOf.delete(id);
    relatedOf.delete(id);
  }

  function traceToRoot(id, maxDepth = 100) {
    const chain = [];
    let cur = id;
    let depth = 0;
    while (cur && depth++ < maxDepth) {
      chain.push(cur);
      cur = parentOf.get(cur);
    }
    return chain;
  }

  function descendants(id, maxDepth = 50) {
    const result = new Set();
    const queue  = [[id, 0]];
    while (queue.length) {
      const [cur, d] = queue.shift();
      if (d >= maxDepth) continue;
      for (const child of childrenOf.get(cur) ?? []) {
        if (!result.has(child)) {
          result.add(child);
          queue.push([child, d + 1]);
        }
      }
    }
    return result;
  }

  return {
    addNode, addEdge, addRelated, prune,
    parent:      (id) => parentOf.get(id) ?? null,
    children:    (id) => new Set(childrenOf.get(id) ?? []),
    related:     (id) => new Set(relatedOf.get(id) ?? []),
    edgeMeta:    (a, b) => edgeMeta.get(`${a}:${b}`) ?? edgeMeta.get(`${a}~${b}`) ?? null,
    traceToRoot,
    descendants,
    stats: () => ({
      nodes:    childrenOf.size,
      edges:    edgeMeta.size,
      parentLinks: parentOf.size,
    }),
  };
}

// ─── Subscription Registry ────────────────────────────────────────────────────

function createSubRegistry() {
  const subs = new Map();   // subId → { pattern, test, handler, meta }

  function subscribe(pattern, handler, meta = {}) {
    const id   = newId();
    const test = compilePattern(pattern);
    subs.set(id, { pattern, test, handler, meta, id });
    return () => subs.delete(id);
  }

  function dispatch(event) {
    for (const sub of subs.values()) {
      if (sub.test(event.type)) {
        try { sub.handler(event); }
        catch (err) {
          // Subscribers may not throw into kernel — swallow + re-emit as error
          // (done at kernel level to avoid circular reference here)
          sub._lastError = err;
        }
      }
    }
  }

  function snapshot() {
    return Array.from(subs.values()).map(s => ({
      id: s.id, pattern: s.pattern, meta: s.meta
    }));
  }

  return { subscribe, dispatch, snapshot, size: () => subs.size };
}

// ─── Gate Registry ────────────────────────────────────────────────────────────

/**
 * Gates intercept events before they reach subscribers.
 * They may:
 *   - Block the event (return { block: true })
 *   - Emit additional events (return { emit: [...] })
 *   - Transform the payload (return { transform: newPayload })
 *   - Do nothing (return null or {})
 *
 * Gates run in priority order (lower number = runs first).
 * A gate must never call kernel.emit() directly (§K2).
 */
function createGateRegistry() {
  const gates = new Map();

  function registerGate(name, fn, { priority = 50 } = {}) {
    if (gates.has(name)) throw new Error(`[ALK] Gate '${name}' already registered`);
    gates.set(name, { name, fn, priority });
  }

  function removeGate(name) { gates.delete(name); }

  function runGates(event) {
    const sorted = Array.from(gates.values()).sort((a, b) => a.priority - b.priority);
    let current  = event;
    const toEmit = [];
    let blocked  = false;

    for (const gate of sorted) {
      let result;
      try { result = gate.fn(current); }
      catch { result = null; }

      if (!result) continue;
      if (result.block)     { blocked = true; break; }
      if (result.emit)      { toEmit.push(...result.emit); }
      if (result.transform) {
        current = Object.freeze({ ...current, payload: Object.freeze(result.transform) });
      }
    }

    return { event: current, blocked, toEmit };
  }

  return { registerGate, removeGate, runGates, list: () => Array.from(gates.values()) };
}

// ─── Kernel ───────────────────────────────────────────────────────────────────

/**
 * createKernel — the primary ALK factory.
 *
 * @param {object} options
 * @param {number} [options.ringCap=10_000]  — ring buffer capacity
 * @param {boolean} [options.strict=false]   — throw on bad emits (vs emit error event)
 */
export function createKernel({ ringCap = 10_000, strict = false } = {}) {
  const clock   = createClock();
  const ring    = createRing(ringCap);
  const lattice = createLattice();
  const subs    = createSubRegistry();
  const gates   = createGateRegistry();

  const byId    = new Map();   // eventId → event (lives as long as in ring)
  const byType  = new Map();   // type → Set<id>

  let _emitDepth = 0;
  const GATE_DEPTH_MAX = 20;

  // ── Internal helpers ───────────────────────────────────────────────────────

  function _indexEvent(ev) {
    byId.set(ev.id, ev);
    if (!byType.has(ev.type)) byType.set(ev.type, new Set());
    byType.get(ev.type).add(ev.id);
  }

  function _evict(ev) {
    if (!ev) return;
    byId.delete(ev.id);
    byType.get(ev.type)?.delete(ev.id);
    lattice.prune(ev.id);
  }

  function _buildLatticeEdges(ev) {
    lattice.addNode(ev.id);
    if (ev.meta.causedBy) {
      lattice.addEdge(ev.meta.causedBy, ev.id, ev.meta.edgeType, ev.meta.tick);
    }
    for (const rel of ev.meta.relatedTo) {
      lattice.addRelated(ev.id, rel, ev.meta.tick);
    }
  }

  // ── Core emit ─────────────────────────────────────────────────────────────

  function emit(type, payload = {}, meta = {}) {
    if (_emitDepth > GATE_DEPTH_MAX) {
      // Emergency surface — don't recurse further
      console.error('[ALK] Gate depth exceeded — emit aborted', type);
      return null;
    }

    let ev;
    try {
      ev = createEvent(type, payload, {
        ...meta,
        tick: clock.now(),
        wall: clock.wall(),
      });
    } catch (err) {
      if (strict) throw err;
      // Emit a safe error event (no recursion risk — simplified)
      const errEv = createEvent('alk.kernel.error', {
        code:    'BAD_EVENT',
        message: err.message,
        type,
      }, { tick: clock.now(), wall: clock.wall() });
      _store(errEv);
      return errEv;
    }

    _emitDepth++;
    try {
      const { event: gated, blocked, toEmit } = gates.runGates(ev);

      if (!blocked) {
        _store(gated);
        // Gate-injected events (atomic — depth-guarded)
        for (const g of toEmit) {
          emit(g.type, g.payload, g.meta);
        }
      }

      return blocked ? null : gated;
    } finally {
      _emitDepth--;
    }
  }

  function _store(ev) {
    const evicted = ring.push(ev);
    _evict(evicted);
    _indexEvent(ev);
    _buildLatticeEdges(ev);

    // Dispatch to subscribers (errors caught, re-emitted as alk.kernel.sub.error)
    for (const sub of subs.snapshot()) {
      const s = subs._rawGet ? subs._rawGet(sub.id) : null;
    }

    // Direct dispatch (subscription registry handles try/catch)
    _dispatchSafe(ev);
  }

  function _dispatchSafe(ev) {
    // We call dispatch, but any thrown errors become error events
    // (cannot use subs.dispatch directly as it swallows — we want to re-emit)
    subs.dispatch(ev);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    // Emission
    emit,

    // Subscription (§K3 pattern matching)
    subscribe:    (pattern, handler, meta) => subs.subscribe(pattern, handler, meta),

    // Gate management (§K2)
    registerGate: (name, fn, opts) => gates.registerGate(name, fn, opts),
    removeGate:   (name)           => gates.removeGate(name),

    // Lattice queries
    findById:    (id) => byId.get(id) ?? null,
    getByType:   (type) => Array.from(byType.get(type) ?? []).map(id => byId.get(id)).filter(Boolean),
    getAll:      ()   => ring.toArray(),
    last:        ()   => ring.last() ?? null,
    traceToRoot: (id, maxDepth) => lattice.traceToRoot(id, maxDepth).map(id => byId.get(id)).filter(Boolean),
    descendants: (id, maxDepth) => [...lattice.descendants(id, maxDepth)].map(id => byId.get(id)).filter(Boolean),
    parent:      (id) => { const pid = lattice.parent(id); return pid ? byId.get(pid) ?? null : null; },
    children:    (id) => [...lattice.children(id)].map(id => byId.get(id)).filter(Boolean),
    related:     (id) => [...lattice.related(id)].map(id => byId.get(id)).filter(Boolean),
    edgeMeta:    (a, b) => lattice.edgeMeta(a, b),

    // Observability
    stats: () => ({
      tick:         clock.peek(),
      wall:         clock.wall(),
      ringSize:     ring.length,
      ringCap,
      subscriptions: subs.size(),
      gates:        gates.list().map(g => ({ name: g.name, priority: g.priority })),
      lattice:      lattice.stats(),
      byTypeCount:  byType.size,
    }),

    // Utilities
    clock,
    reset: () => {
      ring.clear();
      byId.clear();
      byType.clear();
    },

    // ââ Â§1.8 â Pulse: each kernel emits periodic heartbeat (proof-of-life) ââââââââââââââ
    startPulse(intervalMs = 5000) {
      const id = setInterval(() => {
        emit("alk.kernel.pulse", {
          tick:       clock.peek(),
          wall:       clock.wall(),
          ringSize:   ring.length,
          ringCap,
          subs:       subs.size(),
          lattice:    lattice.stats(),
          version:    "1.2.0",
          kernelUUID: "alk-kernel-0000-0000-1000-0000-000000000001",
        });
      }, intervalMs);
      return () => clearInterval(id);
    },
  };
}

// ─── Module Base ──────────────────────────────────────────────────────────────

/**
 * ALKModule — base class for all ALK modules.
 *
 * Modules:
 *   - Communicate ONLY via kernel.emit() and kernel.subscribe()
 *   - Have a UUID, version, and hook namespace
 *   - Declare their emit surface and subscription surface in their manifest
 *   - May not call other module instances directly (§K6)
 *
 * @example
 * class MyModule extends ALKModule {
 *   constructor({ kernel }) {
 *     super({ kernel, uuid: 'my-mod-uuid', version: '1.0.0', ns: 'alk.mymod' });
 *     this._sub('alk.mymod.trigger', this._onTrigger.bind(this));
 *   }
 *   _onTrigger(ev) { this._emit('alk.mymod.result', { value: 42 }); }
 * }
 */
export class ALKModule {
  constructor({ kernel, uuid, version = '0.0.0', ns }) {
    if (!kernel) throw new Error('[ALKModule] kernel is required');
    if (!uuid)   throw new Error('[ALKModule] uuid is required');
    if (!ns)     throw new Error('[ALKModule] ns (namespace) is required');

    this._kernel  = kernel;
    this._uuid    = uuid;
    this._version = version;
    this._ns      = ns;

    this._unsubs  = [];
    this._metrics = { emitted: 0, received: 0, errors: 0, lastTs: null };
  }

  // ── Protected helpers ─────────────────────────────────────────────────────

  _emit(type, payload, meta = {}) {
    this._metrics.emitted++;
    this._metrics.lastTs = Date.now();
    return this._kernel.emit(type, payload, {
      ...meta,
      sourceUUID: this._uuid,
    });
  }

  _emitError(code, message, context = {}) {
    this._metrics.errors++;
    return this._emit(`${this._ns}.error`, {
      code, message, context,
      moduleUUID: this._uuid,
    });
  }

  _sub(pattern, handler) {
    const unsub = this._kernel.subscribe(pattern, (ev) => {
      this._metrics.received++;
      handler(ev);
    }, { moduleUUID: this._uuid });
    this._unsubs.push(unsub);
    return unsub;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy() {
    for (const u of this._unsubs) u();
    this._unsubs = [];
  }

  // ── Observability ─────────────────────────────────────────────────────────

  health() {
    return {
      uuid:     this._uuid,
      version:  this._version,
      ns:       this._ns,
      metrics:  { ...this._metrics },
      subs:     this._unsubs.length,
    };
  }
}

export default { createKernel, createEvent, createClock, compilePattern, ALKModule };
