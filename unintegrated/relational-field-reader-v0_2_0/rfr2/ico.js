'use strict';
// ico.js — Input Compartment Output
// Universal substrate. No external deps. Node.js stdlib only.
//
// FOLDERS (auto-created on start):
//   input/       drop files or send via TCP/WS/CLI
//   compartment/ compartment/index.js — hot-reloadable transform center
//   output/      results land here
//   invariant/   persistent key-value store (survives restarts)
//   plugins/     drop .js files — auto-loaded and watched
//   ui/          drop .html/.js files — served at http://host:PORT/ui/
//   ledger/      event ledgers (written by lens plugins)
//   memory/      memory plugin persistence
//
// PIPE ORDER (by priority):
//   axioms    (-1) — hard constraints, immovable floor
//   snr         (0) — signal fidelity + health scoring, invokes lenses
//   lens:delta  (1) — structural delta vs ledger (called by snr)
//   lens:sigma  (2) — cross-source drift (called by snr)
//   compartment(10) — hot-reloadable center
//   [plugins/] (20) — auto-loaded folder plugins
//   memory     (30) — memory type plugins (ring, db, crystal)
//
// CLI:
//   node ico.js                           start server
//   node ico.js input <data>              send through pipe
//   node ico.js output                    stream output
//   node ico.js status                    full system status
//   node ico.js connect <host:port>       connect to remote
//   node ico.js plugin:list               list plugins
//   node ico.js plugin:enable  <name>
//   node ico.js plugin:disable <name>
//   node ico.js axiom:list
//   node ico.js invariant:get  <key>
//   node ico.js invariant:set  <key> <v>
//   node ico.js invariant:del  <key>
//   node ico.js invariant:keys
//   node ico.js invariant:all

const fs     = require('fs');
const net    = require('net');
const http   = require('http');
const dgram  = require('dgram');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const { EventEmitter } = require('events');

// ─────────────────────────────────────────────────────────────────────────────
// BUS — central event spine. every subsystem talks through here.
// ─────────────────────────────────────────────────────────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(0);

// ─────────────────────────────────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────────────────────────────────

['input','compartment','output','invariant','plugins','ui','ledger','memory']
  .forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT — persistent key-value store. survives restarts.
// ─────────────────────────────────────────────────────────────────────────────

const INV = path.resolve('invariant');

const invariant = {
  get(key) {
    const f = path.join(INV, key);
    if (!fs.existsSync(f)) return null;
    const raw = fs.readFileSync(f, 'utf8');
    try { return JSON.parse(raw); } catch { return raw; }
  },
  set(key, val) {
    fs.writeFileSync(path.join(INV, key), typeof val === 'string' ? val : JSON.stringify(val, null, 2));
    bus.emit('invariant:set', { key, ts: Date.now() });
  },
  del(key) {
    const f = path.join(INV, key);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    bus.emit('invariant:del', { key, ts: Date.now() });
  },
  keys() { return fs.readdirSync(INV).filter(f => !f.startsWith('.')); },
  all()  { return Object.fromEntries(invariant.keys().map(k => [k, invariant.get(k)])); },
};

// ─────────────────────────────────────────────────────────────────────────────
// LEDGER ENGINE — append-only event log per stream. used by lenses.
// ─────────────────────────────────────────────────────────────────────────────

const LEDGER_ROOT = path.resolve('ledger');

const ledger = {
  _dir(id) { const d = path.join(LEDGER_ROOT, id); fs.mkdirSync(d, { recursive:true }); return d; },

  append(id, event) {
    fs.appendFileSync(path.join(this._dir(id), 'events.ndjson'),
      JSON.stringify({ ...event, _ts: Date.now() }) + '\n');
  },

  tail(id, n = 50) {
    const f = path.join(LEDGER_ROOT, id, 'events.ndjson');
    if (!fs.existsSync(f)) return [];
    const lines = fs.readFileSync(f,'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  },

  summarize(id, stats) {
    const f = path.join(this._dir(id), 'summary.json');
    const prev = this._rj(f) || {};
    fs.writeFileSync(f, JSON.stringify({ ...prev, ...stats, _updated: Date.now() }, null, 2));
  },

  updateSchema(id, data) {
    const f    = path.join(this._dir(id), 'schema.json');
    const prev = this._rj(f) || { _count:0, keys:{} };
    prev._count++;
    const obj  = (typeof data === 'object' && data !== null) ? data : { _scalar: data };
    for (const [k,v] of Object.entries(obj)) {
      if (!prev.keys[k]) prev.keys[k] = { count:0, types:{} };
      prev.keys[k].count++;
      const t = Array.isArray(v) ? 'array' : typeof v;
      prev.keys[k].types[t] = (prev.keys[k].types[t] || 0) + 1;
    }
    for (const k of Object.keys(prev.keys))
      prev.keys[k].presence = +(prev.keys[k].count / prev._count).toFixed(4);
    fs.writeFileSync(f, JSON.stringify(prev, null, 2));
    return prev;
  },

  readSchema(id)  { return this._rj(path.join(LEDGER_ROOT, id, 'schema.json')); },
  readSummary(id) { return this._rj(path.join(LEDGER_ROOT, id, 'summary.json')); },

  list() {
    if (!fs.existsSync(LEDGER_ROOT)) return [];
    return fs.readdirSync(LEDGER_ROOT)
      .filter(f => fs.statSync(path.join(LEDGER_ROOT,f)).isDirectory());
  },

  fork(fromId, toId, reason) {
    const toDir = this._dir(toId);
    for (const f of ['schema.json','summary.json']) {
      const src = path.join(LEDGER_ROOT, fromId, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(toDir, f));
    }
    this.append(toId, { _fork:true, from:fromId, reason });
    bus.emit('lens:fork',       { from:fromId, to:toId, reason, ts:Date.now() });
    bus.emit('lens:ledger:new', { id:toId, forkedFrom:fromId, ts:Date.now() });
    return toId;
  },

  _rj(f) {
    if (!fs.existsSync(f)) return null;
    try { return JSON.parse(fs.readFileSync(f,'utf8')); } catch { return null; }
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// LENS MATH — shared by SNR and lens plugins
// ─────────────────────────────────────────────────────────────────────────────

function fingerprint(data) {
  if (data === null || data === undefined) return '_null';
  if (Array.isArray(data)) return `_array:${[...new Set(data.map(x=>typeof x))].sort().join(',')}`;
  if (typeof data === 'object')
    return Object.keys(data).sort().map(k=>`${k}:${Array.isArray(data[k])?'array':typeof data[k]}`).join('|');
  return `_scalar:${typeof data}`;
}

function deltaScore(fp, priorFPs) {
  if (!priorFPs?.length) return 0;
  const curr=new Set(fp.split('|')), union=new Set(curr); let hit=0;
  for (const p of priorFPs) for (const t of p.split('|')) union.add(t);
  for (const t of curr) if (priorFPs.some(p=>p.split('|').includes(t))) hit++;
  return +(1 - hit/union.size).toFixed(4);
}

function sigmaOf(series) {
  if (series.length < 2) return 0;
  const mean = series.reduce((a,b)=>a+b,0)/series.length;
  return +Math.sqrt(series.reduce((s,x)=>s+(x-mean)**2,0)/series.length).toFixed(4);
}

function driftOf(a, b) {
  if (!a.length||!b.length) return null;
  const ma=a.reduce((x,y)=>x+y,0)/a.length, mb=b.reduce((x,y)=>x+y,0)/b.length;
  return +(Math.abs(ma-mb)/(sigmaOf(a)+sigmaOf(b)+1e-9)).toFixed(4);
}

// ─────────────────────────────────────────────────────────────────────────────
// PLUGIN REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const registry = new Map();

function registerPlugin(plugin) {
  if (!plugin.name || typeof plugin.process !== 'function')
    throw new Error(`[ico] plugin missing name or process: ${plugin.name}`);
  plugin.enabled  = plugin.enabled  ?? true;
  plugin.config   = plugin.config   ?? {};
  plugin._in = plugin._out = plugin._dropped = 0;
  registry.set(plugin.name, plugin);
  bus.emit('plugin:registered', { name:plugin.name, priority:plugin.priority??10, ts:Date.now() });
}

function enablePlugin(name, on)  { const p=registry.get(name); if(p){ p.enabled=on; bus.emit('plugin:toggled',{name,enabled:on}); } }
function configPlugin(name, cfg) { const p=registry.get(name); if(p) Object.assign(p.config,cfg); }

function pluginList() {
  return [...registry.values()]
    .sort((a,b)=>(a.priority??10)-(b.priority??10))
    .map(p => ({
      name:p.name, description:p.description, priority:p.priority??10,
      enabled:p.enabled, config:p.config,
      in:p._in, out:p._out, dropped:p._dropped,
      ui: p.ui ?? null,
      stats:p.stats?.()??null,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPE — runs data through all enabled plugins sorted by priority
// ─────────────────────────────────────────────────────────────────────────────

// strip runtime handles before putting meta on the wire — they don't serialize
function wireMeta(meta) {
  const { bus:_b, ledger:_l, invariant:_i, ...rest } = meta;
  return rest;
}

async function pipe(data, meta = {}) {
  meta.invariant = meta.invariant || invariant;
  meta.ledger    = meta.ledger    || ledger;
  meta.bus       = meta.bus       || bus;
  meta.ts        = meta.ts        || Date.now();

  let current = data;
  const ordered = [...registry.values()].sort((a,b)=>(a.priority??10)-(b.priority??10));

  for (const plugin of ordered) {
    if (!plugin.enabled) continue;
    plugin._in++;
    try {
      const result = await plugin.process(current, meta, plugin.config);
      if (result === null || result === undefined) {
        plugin._dropped++;
        bus.emit('drop', { by:plugin.name, data:current, meta:wireMeta(meta), ts:Date.now() });
        return null;
      }
      current = result;
      plugin._out++;
    } catch(e) {
      current = { error:e.message, plugin:plugin.name, data:current };
      plugin._out++;
    }
  }

  bus.emit('output', { data:current, meta:wireMeta(meta), ts:Date.now() });
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// AXIOMS PLUGIN  priority: -1 — absolute floor, runs before everything
// ─────────────────────────────────────────────────────────────────────────────
// Hard constraints on what data CAN NOT be, do, or contain.
// Any violation = hard drop. No exceptions. Axioms are not negotiable.
//
// DEFINE:
//   programmatic: registerAxiom({ name, rule: fn(data,meta)→bool, violation })
//   invariant:    axioms:rules → JSON array [{ name, test:'js expr', violation }]
//   TCP:          { cmd:'axiom:register', axiom:{ name, rule:'js expr', violation } }
//
// UI CONTRACT:
//   ui.panel   = 'axioms'
//   ui.actions = ['axiom:register','axiom:list']
//   emits:       axiom:violation, axiom:registered

const _axioms = new Map();

function registerAxiom(axiom) {
  if (!axiom.name || typeof axiom.rule !== 'function')
    throw new Error(`[axiom] bad axiom: ${axiom.name}`);
  _axioms.set(axiom.name, axiom);
  bus.emit('axiom:registered', { name:axiom.name, violation:axiom.violation, ts:Date.now() });
}

registerPlugin({
  name:        'axioms',
  description: 'hard constraint engine — defines what cannot pass. immovable floor.',
  priority:    -1,
  config:      {},
  _violations: 0,
  _passed:     0,

  ui: {
    panel:   'axioms',
    actions: ['axiom:register','axiom:list'],
    emits:   ['axiom:violation','axiom:registered'],
    display: { violations:'_violations', passed:'_passed', axioms:'_axioms.size' },
  },

  process(data, meta, config) {
    // hot-load invariant-defined axioms
    const raw = meta.invariant.get('axioms:rules');
    if (raw) {
      let rules; try { rules = Array.isArray(raw)?raw:JSON.parse(raw); } catch { rules=[]; }
      for (const r of rules) {
        if (!r.name||!r.test||_axioms.has(`inv:${r.name}`)) continue;
        try {
          // eslint-disable-next-line no-new-func
          registerAxiom({ name:`inv:${r.name}`, rule:new Function('data','meta',`return !!(${r.test})`), violation:r.violation||r.name });
        } catch {}
      }
    }
    for (const axiom of _axioms.values()) {
      let passes; try { passes=axiom.rule(data,meta); } catch { passes=false; }
      if (!passes) {
        this._violations++;
        bus.emit('axiom:violation', { axiom:axiom.name, violation:axiom.violation, data, meta, ts:Date.now() });
        return null;
      }
    }
    this._passed++;
    return data;
  },

  stats() {
    return {
      axioms:[..._axioms.keys()], passed:this._passed,
      violations:this._violations, total:this._passed+this._violations,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// SNR PLUGIN  priority: 0 — signal fidelity + health + lens orchestrator
// ─────────────────────────────────────────────────────────────────────────────
// Measures signal quality against invariant-defined shape.
// Invokes delta and sigma lenses on every passing signal.
// High-signal and low-signal both pass (with scored meta). Zero-fidelity = drop.
//
// WHAT IT MEASURES:
//   fidelity   — keys present / keys expected (0.0–1.0)
//   strength   — 'high' if fidelity ≥ threshold, 'low' otherwise
//   sigma (σ)  — std deviation of rolling fidelity window (consistency)
//   delta (δ)  — fidelity change from prior signal
//   health     — fidelity × consistency × recency (composite 0.0–1.0)
//
// LENSES (invoked inline, results in meta.lens):
//   lens:delta — structural divergence score vs ledger history
//   lens:sigma — cross-source drift between two configurable series
//
// INVARIANT KEYS:
//   snr:keys       JSON array of required keys. empty = open.
//   snr:mode       'all' | 'any'  (default 'all')
//   snr:threshold  fidelity floor for HIGH signal (default 0.8)
//   snr:window     rolling window size (default 20)
//
// UI CONTRACT:
//   ui.panel   = 'snr'
//   ui.widgets = ['fidelity-gauge','health-bar','sigma-chart','strength-badge']
//   emits:       snr:score, snr:noise, snr:health

registerPlugin({
  name:        'snr',
  description: 'signal fidelity + health scoring + lens orchestration.',
  priority:    0,
  config:      {},

  _window:     [],
  _lastF:      null,
  _signal:     0,
  _noise:      0,
  _lastHealth: null,
  _snrWindow:  [],   // mirrored for sigma lens "snr" source

  ui: {
    panel:   'snr',
    widgets: ['fidelity-gauge','health-bar','sigma-chart','strength-badge'],
    emits:   ['snr:score','snr:noise','snr:health'],
    actions: ['invariant:set snr:keys','invariant:set snr:threshold','invariant:set snr:window'],
  },

  _sig(w) {
    if (w.length<2) return 0;
    const m=w.reduce((a,b)=>a+b,0)/w.length;
    return +Math.sqrt(w.reduce((s,x)=>s+(x-m)**2,0)/w.length).toFixed(4);
  },

  _recency(meta) {
    const last=meta.invariant.get('snr:last-ts');
    if (!last) return 1;
    return +Math.max(0,1-(Date.now()-+last)/60000).toFixed(4);
  },

  // ── delta lens (inline, priority 1) ────────────────────────────────────────
  _runDelta(data, meta, fidelity, health) {
    const streamId = (typeof data==='object'&&data?._stream)
      || meta.invariant.get('lens:stream-id') || meta.src || 'default';
    const threshold = +(meta.invariant.get('lens:delta:threshold') ?? 0.4);
    const winSize   = +(meta.invariant.get('lens:window') ?? 50);
    const fp        = fingerprint(data);
    const recent    = ledger.tail(streamId, winSize);
    const priorFPs  = recent.map(e=>e._fp).filter(Boolean);
    const delta     = deltaScore(fp, priorFPs);

    ledger.append(streamId, { _fp:fp, _delta:delta, _fidelity:fidelity, _health:health });
    ledger.updateSchema(streamId, data);

    const allD = [...recent.map(e=>e._delta??0), delta];
    ledger.summarize(streamId, {
      delta_mean:  +(allD.reduce((a,b)=>a+b,0)/allD.length).toFixed(4),
      delta_sigma: sigmaOf(allD), last_delta:delta, last_fp:fp, count:recent.length+1,
    });

    let forkedTo = null;
    if (delta > threshold && recent.length >= 3) {
      const forkId = `${streamId}~${Date.now()}`;
      ledger.fork(streamId, forkId, `delta ${delta} > ${threshold}`);
      forkedTo = forkId;
    }

    const score = { stream:streamId, fp, delta, fidelity, health, forkedTo, ts:Date.now() };
    bus.emit('lens:delta', score);
    meta.lens = meta.lens || {};
    meta.lens.delta = score;
  },

  // ── sigma lens (inline, priority 2) ────────────────────────────────────────
  _runSigma(meta) {
    const winSize = +(meta.invariant.get('lens:window') ?? 50);
    const srcA    = (meta.invariant.get('lens:sigma:a')||'').toString().trim();
    const srcB    = (meta.invariant.get('lens:sigma:b')||'').toString().trim();
    const field   = (meta.invariant.get('lens:sigma:field')||'_fidelity').toString().trim();

    meta.lens = meta.lens || {};
    if (!srcA||!srcB) return;

    const extract = id => id==='snr'
      ? this._snrWindow.slice(-winSize)
      : ledger.tail(id,winSize).map(e=>e[field]??null).filter(x=>typeof x==='number');

    const a=extract(srcA), b=extract(srcB);
    if (!a.length||!b.length) return;

    const score = {
      a:srcA, b:srcB, field,
      sigma_a:sigmaOf(a), sigma_b:sigmaOf(b),
      drift:driftOf(a,b),
      mean_a:+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(4),
      mean_b:+(b.reduce((x,y)=>x+y,0)/b.length).toFixed(4),
      n_a:a.length, n_b:b.length, ts:Date.now(),
    };
    bus.emit('lens:sigma', score);
    meta.lens.sigma = score;
  },

  process(data, meta, config) {
    const rawKeys  = meta.invariant.get('snr:keys');
    let keys=[]; if (rawKeys) try { keys=Array.isArray(rawKeys)?rawKeys:JSON.parse(rawKeys); } catch {}
    const mode      = (meta.invariant.get('snr:mode')||'all').toString().trim();
    const threshold = +(meta.invariant.get('snr:threshold')??0.8);
    const winSize   = +(meta.invariant.get('snr:window')??20);

    // fidelity
    let fidelity=1, missing=[];
    if (keys.length) {
      const obj = (typeof data==='object'&&data!==null)?data:{_raw:data};
      const hits = keys.filter(k=>Object.prototype.hasOwnProperty.call(obj,k));
      missing    = keys.filter(k=>!hits.includes(k));
      fidelity   = mode==='any' ? (hits.length>0?1:0) : +(hits.length/keys.length).toFixed(4);
    }

    this._window.push(fidelity);
    if (this._window.length>winSize) this._window.shift();
    this._snrWindow.push(fidelity);
    if (this._snrWindow.length>winSize) this._snrWindow.shift();

    const sigma    = this._sig(this._window);
    const delta    = this._lastF===null ? 0 : +(fidelity-this._lastF).toFixed(4);
    this._lastF    = fidelity;
    const strength = fidelity>=threshold ? 'high' : 'low';
    const consist  = +Math.max(0,1-sigma).toFixed(4);
    const recency  = this._recency(meta);
    const health   = +(fidelity*consist*recency).toFixed(4);

    meta.invariant.set('snr:last-ts', Date.now());

    const score = { fidelity, strength, sigma, delta, consistency:consist, recency, health, ts:Date.now() };
    bus.emit('snr:score', { score, meta:wireMeta(meta) });

    // health boundary events
    if (this._lastHealth!==null) {
      if (this._lastHealth>=0.4&&health<0.4)
        bus.emit('snr:health',{state:'degraded', health, prev:this._lastHealth, ts:Date.now()});
      else if (this._lastHealth<0.7&&health>=0.7)
        bus.emit('snr:health',{state:'recovered',health, prev:this._lastHealth, ts:Date.now()});
    }
    this._lastHealth = health;

    // zero fidelity = noise, drop
    if (keys.length && fidelity===0) {
      this._noise++;
      bus.emit('snr:noise',{data,missing,fidelity,score,meta:wireMeta(meta),ts:Date.now()});
      return null;
    }

    this._signal++;
    meta.snr = score;

    // run lenses inline — results in meta.lens
    this._runDelta(data, meta, fidelity, health);
    this._runSigma(meta);

    return data;
  },

  stats() {
    const w=this._window, total=this._signal+this._noise;
    const mean=w.length?+(w.reduce((a,b)=>a+b,0)/w.length).toFixed(4):0;
    return {
      signal:this._signal, noise:this._noise, total,
      noise_rate:total?+(this._noise/total).toFixed(4):0,
      fidelity_mean:mean, sigma:this._sig(w),
      health:this._lastHealth??0, window_size:w.length,
    };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// COMPARTMENT PLUGIN  priority: 10 — hot-reloadable center
// ─────────────────────────────────────────────────────────────────────────────
// compartment/index.js is required fresh on every signal.
// Change the file while running — next signal gets the new version.
// compartment receives (data, meta) and can return anything.

registerPlugin({
  name:        'compartment',
  description: 'compartment/index.js — hot-reloadable transform center.',
  priority:    10,
  config:      {},
  ui: { panel:'compartment', actions:['compartment:reload'] },

  process(data, meta) {
    const f = path.resolve('compartment/index.js');
    if (!fs.existsSync(f)) return data;
    try { delete require.cache[f]; return require(f)(data, meta); } catch(e) {
      return { error:e.message, plugin:'compartment', data };
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY PLUGINS  priority: 30 — pluggable memory types
// ─────────────────────────────────────────────────────────────────────────────
// Four memory archetypes. Each writes to memory/<type>/ on disk.
// All read meta.snr and meta.lens for scoring context.
// Enable/disable individually. All can run simultaneously.
//
// RING BUFFER    — fixed-size circular log. overwrites oldest on overflow.
//                  good for: recent signal history, sliding window analysis.
//
// DATABASE       — keyed document store. persistent. queryable by key or scan.
//                  good for: entity state, lookup tables, accumulation.
//
// PATTERN ENGINE — tracks fingerprint sequences. detects repeating structure.
//                  good for: behavioral signatures, cycle detection, prediction.
//
// CRYSTAL        — solidified data. once written, immutable. timestamped.
//                  good for: audit log, ground truth, finalized events.
//                  high-health signals (≥ crystal:threshold) crystallize automatically.

const MEM = path.resolve('memory');

// ── ring buffer ──────────────────────────────────────────────────────────────
registerPlugin({
  name:        'memory:ring',
  description: 'fixed-size ring buffer — circular log, overwrites oldest.',
  priority:    30,
  enabled:     false,
  config:      { size: 256 },

  ui: {
    panel:   'memory',
    widget:  'ring-buffer',
    actions: ['plugin:config memory:ring { "size": N }'],
    emits:   ['memory:ring:wrote','memory:ring:overflow'],
  },

  _buf: [],
  _ptr: 0,

  process(data, meta, config) {
    const size = config.size || 256;
    const entry = { data, snr:meta.snr??null, lens:meta.lens??null, ts:Date.now() };

    if (this._buf.length < size) {
      this._buf.push(entry);
    } else {
      this._buf[this._ptr] = entry;
      this._ptr = (this._ptr+1) % size;
      bus.emit('memory:ring:overflow', { ptr:this._ptr, ts:Date.now() });
    }

    bus.emit('memory:ring:wrote', { size:this._buf.length, ptr:this._ptr, ts:Date.now() });

    // persist to disk periodically (every 10 writes)
    if ((this._buf.length + this._ptr) % 10 === 0) {
      const f = path.join(MEM, 'ring', 'buffer.json');
      fs.mkdirSync(path.join(MEM,'ring'),{recursive:true});
      fs.writeFileSync(f, JSON.stringify({ buf:this._buf, ptr:this._ptr, size }, null, 2));
    }

    return data;
  },

  stats() { return { size:this._buf.length, ptr:this._ptr, capacity:this.config.size||256 }; },
});

// ── database ─────────────────────────────────────────────────────────────────
registerPlugin({
  name:        'memory:db',
  description: 'keyed document store — persistent, queryable by key.',
  priority:    30,
  enabled:     false,
  config:      { key_field: '_id' },   // which field to use as document key

  ui: {
    panel:   'memory',
    widget:  'db-inspector',
    actions: ['plugin:config memory:db { "key_field": "id" }'],
    emits:   ['memory:db:wrote','memory:db:upserted'],
  },

  _store: {},
  _loaded: false,

  _load() {
    if (this._loaded) return;
    const f = path.join(MEM,'db','store.json');
    if (fs.existsSync(f)) try { this._store=JSON.parse(fs.readFileSync(f,'utf8')); } catch {}
    this._loaded=true;
  },

  _flush() {
    fs.mkdirSync(path.join(MEM,'db'),{recursive:true});
    fs.writeFileSync(path.join(MEM,'db','store.json'),JSON.stringify(this._store,null,2));
  },

  process(data, meta, config) {
    this._load();
    const kf  = config.key_field||'_id';
    const key  = (typeof data==='object'&&data!==null&&data[kf]) ? String(data[kf]) : `auto:${Date.now()}`;
    const prev = this._store[key];
    this._store[key] = { data, snr:meta.snr??null, lens:meta.lens??null, ts:Date.now() };
    this._flush();

    const ev = prev ? 'memory:db:upserted' : 'memory:db:wrote';
    bus.emit(ev, { key, prev:!!prev, ts:Date.now() });
    return data;
  },

  stats() {
    this._load();
    return { keys:Object.keys(this._store).length };
  },
});

// ── pattern engine memory ─────────────────────────────────────────────────────
registerPlugin({
  name:        'memory:pattern',
  description: 'fingerprint sequence tracker — detects repeating structure, cycles, signatures.',
  priority:    30,
  enabled:     false,
  config:      { window: 20, min_repeat: 2 },

  ui: {
    panel:   'memory',
    widget:  'pattern-inspector',
    emits:   ['memory:pattern:match','memory:pattern:new'],
  },

  _sequences: {},   // fp → count
  _history:   [],   // rolling fingerprint log

  process(data, meta, config) {
    const fp  = meta.lens?.delta?.fp || fingerprint(data);
    const win = config.window || 20;
    const min = config.min_repeat || 2;

    this._history.push({ fp, ts:Date.now() });
    if (this._history.length>win*2) this._history.shift();

    this._sequences[fp] = (this._sequences[fp]||0)+1;
    const count = this._sequences[fp];

    if (count >= min) {
      bus.emit('memory:pattern:match', { fp, count, window:this._history.slice(-win), ts:Date.now() });
    } else {
      bus.emit('memory:pattern:new', { fp, ts:Date.now() });
    }

    // persist pattern table
    fs.mkdirSync(path.join(MEM,'pattern'),{recursive:true});
    fs.writeFileSync(path.join(MEM,'pattern','sequences.json'),
      JSON.stringify({ sequences:this._sequences, history:this._history.slice(-win) },null,2));

    meta.memory = meta.memory||{};
    meta.memory.pattern = { fp, count, known:count>=min };
    return data;
  },

  stats() {
    const top=Object.entries(this._sequences).sort((a,b)=>b[1]-a[1]).slice(0,5);
    return { patterns:Object.keys(this._sequences).length, top };
  },
});

// ── crystallization layer ─────────────────────────────────────────────────────
registerPlugin({
  name:        'memory:crystal',
  description: 'solidified data — immutable once written, timestamped, content-addressed.',
  priority:    30,
  enabled:     false,
  config:      { threshold: 0.8 },   // min health score to auto-crystallize

  ui: {
    panel:   'memory',
    widget:  'crystal-vault',
    emits:   ['memory:crystal:formed','memory:crystal:rejected'],
  },

  _count: 0,

  process(data, meta, config) {
    const health    = meta.snr?.health ?? 1;
    const threshold = config.threshold ?? 0.8;

    if (health < threshold) {
      bus.emit('memory:crystal:rejected', { health, threshold, ts:Date.now() });
      return data;   // crystal never drops — it just doesn't solidify low-health data
    }

    // content-address the crystal
    const hash = crypto.createHash('sha256')
      .update(JSON.stringify(data)+Date.now()).digest('hex').slice(0,16);

    const crystal = {
      hash, data,
      snr:  meta.snr  ?? null,
      lens: meta.lens ?? null,
      formed: Date.now(),
    };

    const dir = path.join(MEM,'crystal');
    fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,`${hash}.json`), JSON.stringify(crystal,null,2));

    this._count++;
    bus.emit('memory:crystal:formed', { hash, health, ts:Date.now() });

    meta.memory = meta.memory||{};
    meta.memory.crystal = { hash, formed:true };
    return data;
  },

  stats() {
    const dir=path.join(MEM,'crystal');
    const count=fs.existsSync(dir)?fs.readdirSync(dir).filter(f=>f.endsWith('.json')).length:0;
    return { crystals:count, threshold:this.config.threshold };
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PLUGINS FOLDER — auto-loads every .js file in plugins/. watches for changes.
// ─────────────────────────────────────────────────────────────────────────────

function _loadPluginFile(file) {
  const full = path.resolve(`plugins/${file}`);
  if (!full.endsWith('.js')||!fs.existsSync(full)) return;
  try {
    delete require.cache[full];
    const mod  = require(full);
    const list = Array.isArray(mod)?mod:[mod];
    for (const p of list) {
      if (!p||!p.name||typeof p.process!=='function') continue;
      registerPlugin(p);
    }
  } catch(e) { bus.emit('plugin:error',{file,error:e.message,ts:Date.now()}); }
}

fs.readdirSync('plugins').filter(f=>f.endsWith('.js')).forEach(_loadPluginFile);
fs.watch('plugins',(event,file) => { if (file?.endsWith('.js')) setTimeout(()=>_loadPluginFile(file),50); });

// ─────────────────────────────────────────────────────────────────────────────
// FOLDER WATCHERS — input and compartment
// ─────────────────────────────────────────────────────────────────────────────

fs.watch('input',(_, f) => {
  if (!f) return;
  setTimeout(()=>{
    const p=`input/${f}`; if (!fs.existsSync(p)) return;
    const raw=fs.readFileSync(p,'utf8');
    let data; try { data=JSON.parse(raw); } catch { data=raw; }
    pipe(data,{src:'file',file:f}).then(r=>{
      const out=r===null?'':(typeof r==='string'?r:JSON.stringify(r,null,2));
      fs.writeFileSync(`output/${f}`,out);
      fs.unlinkSync(p);
    });
  },50);
});

fs.watch('compartment',()=>bus.emit('compartment:reload',{ts:Date.now()}));
fs.watch('output',(_,f)=>{ if(f) bus.emit('heartbeat',{file:f,ts:Date.now()}); });

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT (inlined)
// ─────────────────────────────────────────────────────────────────────────────

function _bpmTracker(win=10) {
  const iv=[]; let last=null;
  const beat=()=>{ const now=Date.now(); if(last!==null){iv.push(now-last);if(iv.length>win)iv.shift();} last=now; return bpm(); };
  const bpm=()=>{ if(!iv.length)return 0; const avg=iv.reduce((a,b)=>a+b,0)/iv.length; return avg>0?Math.round(60000/avg):0; };
  const consistency=()=>{ if(iv.length<2)return 1; const avg=iv.reduce((a,b)=>a+b,0)/iv.length; const v=iv.reduce((s,x)=>s+(x-avg)**2,0)/iv.length; return Math.max(0,Math.min(1,1-Math.sqrt(v)/Math.max(avg,1))); };
  return { beat,bpm,consistency };
}

function _ping(url,timeout=3000) {
  return new Promise(resolve=>{
    const t0=Date.now(), mod=url.startsWith('https')?require('https'):require('http');
    let parsed; try{parsed=new URL(url);}catch{resolve({ok:false,ms:0});return;}
    const req=mod.get({hostname:parsed.hostname,port:parsed.port,path:parsed.pathname||'/',timeout},res=>{
      resolve({ok:res.statusCode===200,ms:Date.now()-t0});res.resume();
    });
    req.on('error',()=>resolve({ok:false,ms:Date.now()-t0}));
    req.on('timeout',()=>{req.destroy();resolve({ok:false,ms:timeout});});
  });
}

function _heartbeat({emit,interval=5000,degradeAt=3,deadAt=10}={}) {
  const nodes=new Map();
  const register=(uuid,url)=>{
    if(nodes.has(uuid))return;
    const n={uuid,url,bpm:_bpmTracker(),missed:0,latency:null,score:1};
    nodes.set(uuid,n);
    n.timer=setInterval(async()=>{
      const{ok,ms}=await _ping(url); n.latency=ms;
      if(ok){n.bpm.beat();n.missed=0;n.score=n.bpm.consistency()*(_ms=>_ms<=50?1:_ms<=150?.8:_ms<=500?.5:_ms<=1500?.2:0)(ms);
        emit('heartbeat:pulse',{uuid,bpm:n.bpm.bpm(),latency:ms,score:n.score});}
      else{n.missed++;if(n.missed===degradeAt)emit('heartbeat:degraded',{uuid,missed:n.missed});if(n.missed>=deadAt){emit('heartbeat:dead',{uuid,missed:n.missed});unregister(uuid);}}
    },interval);
  };
  const unregister=uuid=>{const n=nodes.get(uuid);if(n?.timer)clearInterval(n.timer);nodes.delete(uuid);};
  const status=()=>[...nodes.values()].map(n=>({uuid:n.uuid,url:n.url,bpm:n.bpm.bpm(),consistency:n.bpm.consistency(),missed:n.missed,latency:n.latency,score:n.score}));
  return{register,unregister,status};
}

const hb=_heartbeat({emit:(t,p)=>bus.emit(t,p)});
['heartbeat:pulse','heartbeat:degraded','heartbeat:dead'].forEach(e=>
  bus.on(e,d=>bus.emit('output',{data:d,meta:{src:'heartbeat',event:e},ts:Date.now()})));

// ─────────────────────────────────────────────────────────────────────────────
// NANO-WS (inlined — RFC 6455)
// ─────────────────────────────────────────────────────────────────────────────

class NanoSocket extends EventEmitter {
  constructor(socket){
    super();this._s=socket;this.open=true;this._buf=Buffer.alloc(0);this._frags=[];
    socket.on('data',c=>this._data(c));
    socket.on('close',()=>{if(this.open){this.open=false;this.emit('close');}});
    socket.on('error',e=>{this.open=false;this.emit('error',e);});
  }
  send(d){if(!this.open)return;this._s.write(_frame(0x1,typeof d==='string'?Buffer.from(d,'utf8'):d));}
  close(){if(!this.open)return;this.open=false;this._s.write(_frame(0x8,Buffer.alloc(0)));this._s.end();}
  _data(chunk){
    this._buf=Buffer.concat([this._buf,chunk]);
    while(this._buf.length>=2){
      const fin=!!(this._buf[0]&0x80),op=this._buf[0]&0xF,mask=!!(this._buf[1]&0x80);
      let len=this._buf[1]&0x7F,off=2;
      if(len===126){if(this._buf.length<4)return;len=this._buf.readUInt16BE(2);off=4;}
      else if(len===127){if(this._buf.length<10)return;len=this._buf.readUInt32BE(6);off=10;}
      const end=off+(mask?4:0)+len;
      if(this._buf.length<end)return;
      let pay=this._buf.slice(off+(mask?4:0),end);
      if(mask){const k=this._buf.slice(off,off+4);pay=Buffer.from(pay);for(let i=0;i<pay.length;i++)pay[i]^=k[i&3];}
      this._buf=this._buf.slice(end);
      if(op===0x8){this.open=false;this._s.write(_frame(0x8,pay));this._s.end();this.emit('close');return;}
      if(op===0x9){this._s.write(_frame(0xA,pay));continue;}
      if(op===0x1||op===0x2||op===0x0){
        if(!fin){this._frags.push(pay);continue;}
        const full=this._frags.length?Buffer.concat([...this._frags,pay]):pay;
        this._frags=[];this.emit('message',full.toString());
      }
    }
  }
}

function _frame(op,payload){
  const len=payload.length;let h;
  if(len<=125){h=Buffer.alloc(2);h[0]=0x80|op;h[1]=len;}
  else if(len<=0xFFFF){h=Buffer.alloc(4);h[0]=0x80|op;h[1]=126;h.writeUInt16BE(len,2);}
  else{h=Buffer.alloc(10);h[0]=0x80|op;h[1]=127;h.writeUInt32BE(0,2);h.writeUInt32BE(len,6);}
  return Buffer.concat([h,payload]);
}

function _wsHandshake(req,socket){
  const key=req.split('\r\n').find(l=>l.toLowerCase().startsWith('sec-websocket-key'))?.split(': ')[1]?.trim();
  if(!key){socket.destroy();return null;}
  const accept=crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setTimeout(0);socket.setNoDelay(true);socket.setKeepAlive(true);
  return new NanoSocket(socket);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI SERVER — serves ui/ folder at http://host:PORT/ui/. hot-swappable.
// ─────────────────────────────────────────────────────────────────────────────
// Drop any .html/.js/.css file into ui/ and it's immediately accessible.
// The default ui/index.html connects to ws://host:PORT and receives all bus events.

const UI_PORT = +(process.env.UI_PORT||7002);

const uiServer = http.createServer((req,res)=>{
  let urlPath = req.url.replace(/\.\./g,'').replace(/^\/*/,'/');
  if (urlPath==='/') urlPath='/index.html';
  const f = path.join(path.resolve('ui'), urlPath.replace(/^\//,''));
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('not found'); return; }
  const ext = path.extname(f);
  const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css',
                '.json':'application/json','.svg':'image/svg+xml'}[ext]||'text/plain';
  res.writeHead(200,{'Content-Type':mime});
  res.end(fs.readFileSync(f));
});

// WebSocket upgrade on the UI server — broadcasts all bus events to UI clients
const uiClients = new Set();
uiServer.on('upgrade',(req,socket,head)=>{
  const raw = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`
    + Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n';
  const ws = _wsHandshake(raw, socket);
  if (!ws) return;
  uiClients.add(ws);
  ws.send(JSON.stringify({ type:'ico:hello', plugins:pluginList(), invariant:invariant.all(), ts:Date.now() }));
  ws.on('message', m => { try { handleCmd(JSON.parse(m), d => ws.send(JSON.stringify(d))); } catch {} });
  ws.on('close',()=>uiClients.delete(ws));
});

function uiBroadcast(type, payload) {
  const msg = JSON.stringify({ type, ...payload });
  for (const ws of uiClients) { try { ws.send(msg); } catch {} }
}

// forward all bus events to UI clients
const UI_EVENTS = [
  'output','drop','heartbeat','snr:score','snr:noise','snr:health',
  'lens:delta','lens:sigma','lens:fork','lens:ledger:new',
  'axiom:violation','axiom:registered',
  'plugin:registered','plugin:toggled','plugin:error',
  'invariant:set','invariant:del',
  'memory:ring:wrote','memory:db:wrote','memory:db:upserted',
  'memory:pattern:match','memory:pattern:new',
  'memory:crystal:formed','memory:crystal:rejected',
  'compartment:reload',
];
UI_EVENTS.forEach(e=>bus.on(e,d=>uiBroadcast(`ico:${e}`,d)));

fs.watch('ui',()=>uiBroadcast('ico:ui:reload',{ts:Date.now()}));

// ─────────────────────────────────────────────────────────────────────────────
// UDP BROADCAST — every bus event hits the LAN on :7001
// ─────────────────────────────────────────────────────────────────────────────

const udp=dgram.createSocket('udp4');
udp.bind(()=>{
  udp.setBroadcast(true);
  const send=d=>{const b=Buffer.from(JSON.stringify(d));udp.send(b,0,b.length,7001,'255.255.255.255');};
  UI_EVENTS.forEach(e=>bus.on(e,d=>send({type:`ico:${e}`,...d})));
});

// ─────────────────────────────────────────────────────────────────────────────
// TCP SERVER — bare socket + WebSocket, newline-delimited JSON
// ─────────────────────────────────────────────────────────────────────────────

const PORT = +(process.env.PORT||7000);

function _host(){
  for(const ifaces of Object.values(os.networkInterfaces()))
    for(const i of ifaces) if(i.family==='IPv4'&&!i.internal) return i.address;
  return '127.0.0.1';
}

function _send(socket,obj){try{socket.write(JSON.stringify(obj)+'\n');}catch{}}

// shared command handler (used by TCP, WS, and UI WS)
function handleCmd(frame, reply) {
  const{channel,data,cmd,name,config,uuid,url}=frame;

  if(channel==='input')
    pipe(data,{src:'tcp'}).then(r=>{ if(r!==null) reply({channel:'output',data:r,ts:Date.now()}); });

  if(channel==='compartment') bus.emit('compartment:reload',{data,ts:Date.now()});

  if(cmd==='status') reply({channel:'status',nodes:hb.status(),plugins:pluginList(),ledgers:ledger.list(),ts:Date.now()});

  if(cmd==='invariant:get')  reply({channel:'invariant',key:name,value:invariant.get(name),ts:Date.now()});
  if(cmd==='invariant:set'&&name!=null){invariant.set(name,data);reply({channel:'invariant',key:name,set:true,ts:Date.now()});}
  if(cmd==='invariant:del')  {invariant.del(name);reply({channel:'invariant',key:name,deleted:true,ts:Date.now()});}
  if(cmd==='invariant:keys') reply({channel:'invariant',keys:invariant.keys(),ts:Date.now()});
  if(cmd==='invariant:all')  reply({channel:'invariant',all:invariant.all(),ts:Date.now()});

  if(cmd==='plugin:list')    reply({channel:'plugin:list',plugins:pluginList(),ts:Date.now()});
  if(cmd==='plugin:enable')  enablePlugin(name,true);
  if(cmd==='plugin:disable') enablePlugin(name,false);
  if(cmd==='plugin:config')  configPlugin(name,config);
  if(cmd==='plugin:register'&&frame.plugin)
    try{registerPlugin(frame.plugin);reply({channel:'plugin:registered',name:frame.plugin.name,ts:Date.now()});}
    catch(e){reply({channel:'error',error:e.message});}

  if(cmd==='axiom:list')     reply({channel:'axiom:list',axioms:[..._axioms.values()].map(a=>({name:a.name,violation:a.violation})),ts:Date.now()});
  if(cmd==='axiom:register'&&frame.axiom)
    try{
      // eslint-disable-next-line no-new-func
      registerAxiom({name:frame.axiom.name,rule:new Function('data','meta',`return !!(${frame.axiom.rule})`),violation:frame.axiom.violation});
      reply({channel:'axiom:registered',name:frame.axiom.name,ts:Date.now()});
    }catch(e){reply({channel:'error',error:e.message});}

  if(cmd==='ledger:list')    reply({channel:'ledger:list',ledgers:ledger.list(),ts:Date.now()});
  if(cmd==='ledger:tail')    reply({channel:'ledger:tail',id:name,events:ledger.tail(name,+(config?.n??20)),ts:Date.now()});
  if(cmd==='ledger:schema')  reply({channel:'ledger:schema',id:name,schema:ledger.readSchema(name),ts:Date.now()});
  if(cmd==='ledger:summary') reply({channel:'ledger:summary',id:name,summary:ledger.readSummary(name),ts:Date.now()});

  if(cmd==='register'&&uuid&&url) hb.register(uuid,url);
}

const server=net.createServer(socket=>{
  let buf='',isWS=false,ws=null;
  const reply=obj=>isWS?ws?.send(JSON.stringify(obj)):_send(socket,obj);
  const listeners={};

  const fwd=e=>{listeners[e]=d=>reply({channel:e,...d});bus.on(e,listeners[e]);};
  UI_EVENTS.forEach(fwd);

  socket.on('data',chunk=>{
    buf+=chunk.toString();
    if(!isWS&&buf.includes('Upgrade: websocket')){
      ws=_wsHandshake(buf,socket);isWS=true;buf='';
      if(ws)ws.on('message',m=>{try{handleCmd(JSON.parse(m),reply);}catch{}});
      return;
    }
    const lines=buf.split('\n');buf=lines.pop();
    for(const l of lines){if(!l.trim())continue;try{handleCmd(JSON.parse(l),reply);}catch{}}
  });

  socket.on('close',()=>UI_EVENTS.forEach(e=>{if(listeners[e])bus.off(e,listeners[e]);}));
  socket.on('error',()=>socket.destroy());
  reply({channel:'open',host:_host(),port:PORT,ui:`http://${_host()}:${UI_PORT}/ui/`,ts:Date.now()});
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const[,,cmd,...args]=process.argv;
const rpc=(obj,cb,waitFor)=>{
  const s=net.connect(PORT,'127.0.0.1',()=>s.write(JSON.stringify(obj)+'\n'));
  let buf='';
  s.on('data',d=>{
    buf+=d.toString();
    const lines=buf.split('\n'); buf=lines.pop();
    for(const l of lines){
      if(!l.trim()) continue;
      let msg; try{msg=JSON.parse(l);}catch{continue;}
      if(msg.channel==='open') continue;                      // connection handshake, not the reply
      if(waitFor && !waitFor.includes(msg.channel)) continue;  // not our reply — some other broadcast event
      cb(JSON.stringify(msg)); s.destroy(); return;
    }
  });
  s.on('error',e=>{console.error(e.message);process.exit(1);});
};

if     (cmd==='input')            rpc({channel:'input',data:args.join(' ')},d=>process.stdout.write(d),['output','drop']);
else if(cmd==='output')          {const s=net.connect(PORT,'127.0.0.1');s.on('data',d=>process.stdout.write(d));}
else if(cmd==='status')           rpc({cmd:'status'},d=>console.log(d),['status']);
else if(cmd==='plugin:list')      rpc({cmd:'plugin:list'},d=>console.log(d),['plugin:list']);
else if(cmd==='plugin:enable')    rpc({cmd:'plugin:enable',name:args[0]},d=>console.log(d),['plugin:toggled']);
else if(cmd==='plugin:disable')   rpc({cmd:'plugin:disable',name:args[0]},d=>console.log(d),['plugin:toggled']);
else if(cmd==='axiom:list')       rpc({cmd:'axiom:list'},d=>console.log(d),['axiom:list']);
else if(cmd==='invariant:get')    rpc({cmd:'invariant:get',name:args[0]},d=>console.log(d),['invariant']);
else if(cmd==='invariant:set')    rpc({cmd:'invariant:set',name:args[0],data:args.slice(1).join(' ')},d=>console.log(d),['invariant']);
else if(cmd==='invariant:del')    rpc({cmd:'invariant:del',name:args[0]},d=>console.log(d),['invariant']);
else if(cmd==='invariant:keys')   rpc({cmd:'invariant:keys'},d=>console.log(d),['invariant']);
else if(cmd==='invariant:all')    rpc({cmd:'invariant:all'},d=>console.log(d),['invariant']);
else if(cmd==='ledger:list')      rpc({cmd:'ledger:list'},d=>console.log(d),['ledger:list']);
else if(cmd==='ledger:tail')      rpc({cmd:'ledger:tail',name:args[0],config:{n:args[1]||20}},d=>console.log(d),['ledger:tail']);
else if(cmd==='connect')         {const[h,p]=(args[0]||'').split(':');const s=net.connect(+(p||PORT),h||'127.0.0.1');process.stdin.on('data',d=>s.write(d));s.on('data',d=>process.stdout.write(d));}
else if(!cmd){
  server.listen(PORT,()=>{
    console.log(`[ico] tcp  ${_host()}:${PORT}`);
    console.log(`[ico] ui   http://${_host()}:${UI_PORT}/ui/`);
    console.log(`[ico] udp  :7001`);
    console.log(`[ico] invariant: ${invariant.keys().length} keys`);
    console.log(`[ico] plugins:   ${[...registry.keys()].join(', ')}`);
    console.log(`[ico] ledgers:   ${ledger.list().join(', ')||'none'}`);
  });
  uiServer.listen(UI_PORT);
}
