'use strict';
// people.js — PersonStore, ported from people-module.html.
//
// What changed from the HTML version:
//   - STORE_KEY/localStorage  → meta.invariant (survives restart, per AXIOMS §2.1/§2.2 —
//     localStorage is browser-local and does not satisfy "the storage device is the
//     source of truth"). NOTE: invariant is still flat-file, not yet Jaa (WAL+snapshot).
//     That upgrade is tracked, not done — see ENHANCE.md.
//   - No direct calls into other plugins (AXIOMS §5.7). negotiation.js reads person
//     records straight from meta.invariant using the 'people:<name>' key convention
//     below — it does not require() this file.
//
// data shape this plugin reacts to: { person: { cmd, ...args } } on the pipe,
// OR direct bus events 'people:create' / 'people:update' / 'people:get' / 'people:list'.

const { DIMS, defaultDims, similarity } = require('./lib/dims.js');

function uid() { return 'per_' + Date.now() + '_' + Math.random().toString(36).slice(2,7); }

function colorFor(name) {
  const palette = ['#1D9E75','#EF9F27','#D4537E','#7F77DD','#3B8BD4','#D85A30','#6ec88a','#c8a96e'];
  let h = 0; for (const c of (name||'?')) h = (h*31+c.charCodeAt(0))&0xfffffff;
  return palette[h % palette.length];
}

// ── Persistence: meta.invariant, keyed 'people:<name>' + an index list ──────
const INDEX_KEY = 'people:_index';

function loadIndex(inv) { return inv.get(INDEX_KEY) || []; }
function saveIndex(inv, names) { inv.set(INDEX_KEY, [...new Set(names)]); }

function getPerson(inv, name) { return inv.get('people:' + name); }

function savePerson(inv, person) {
  inv.set('people:' + person.name, person);
  const idx = loadIndex(inv);
  if (!idx.includes(person.name)) { idx.push(person.name); saveIndex(inv, idx); }
  return person;
}

function createPerson(inv, data = {}) {
  const existing = data.name ? getPerson(inv, data.name) : null;
  if (existing) return existing; // idempotent — re-running a seed doesn't duplicate
  const p = {
    id: uid(),
    name: data.name || '',
    relationship: data.relationship || '',
    color: colorFor(data.name || '?'),
    profile: Object.assign({
      job:'', hobbies:'', likes:'', values:'', beliefs:'', needs:'',
      attachment_style:'', love_language:'', communication:'', notes:'',
    }, data.profile || {}),
    dimensions: Object.assign(defaultDims(), data.dimensions || {}),
    created_at: Date.now(),
  };
  return savePerson(inv, p);
}

// (seed data removed — see note above)

// ── No seed data. PersonStore starts empty — every person is created
// explicitly via { person: { cmd:'create', data:{ name, profile, dimensions } } }.
// Earlier draft of this plugin auto-seeded two named example profiles on first
// run; removed on request — a reusable tool shouldn't ship with two specific
// real people's data baked in as defaults. Create whoever you need at runtime.

module.exports = {
  name: 'people',
  description: 'PersonStore — 24-axis dimension model, persisted, bus-addressable.',
  priority: 5, // runs early — other plugins (negotiation, liminal) may want person context

  process(data, meta /*, config */) {
    const inv = meta.invariant;

    if (!data || typeof data !== 'object' || !data.person) return data;

    const cmd = data.person.cmd;
    let result = null;

    if (cmd === 'create') {
      result = createPerson(inv, data.person.data || {});
    } else if (cmd === 'get') {
      result = getPerson(inv, data.person.name);
    } else if (cmd === 'list') {
      result = loadIndex(inv).map(n => getPerson(inv, n));
    } else if (cmd === 'update') {
      const p = getPerson(inv, data.person.name);
      if (!p) {
        meta.bus.emit('people:error', { reason: 'not-found', name: data.person.name }); // §1.2 — loud, not silent
      } else {
        if (data.person.profile) Object.assign(p.profile, data.person.profile);
        if (data.person.dimensions) Object.assign(p.dimensions, data.person.dimensions);
        result = savePerson(inv, p);
        meta.bus.emit('people:updated', { name: p.name, ts: Date.now() });
      }
    } else if (cmd === 'similarity') {
      const a = getPerson(inv, data.person.a), b = getPerson(inv, data.person.b);
      if (!a || !b) meta.bus.emit('people:error', { reason: 'not-found', a: data.person.a, b: data.person.b });
      else result = similarity(a.dimensions, b.dimensions);
    } else {
      meta.bus.emit('people:error', { reason: 'unknown-cmd', cmd }); // §1.2
    }

    data.person.result = result;
    return data;
  },

  ui: {
    panel: 'people',
    widget: 'table',
    emits: ['people:updated', 'people:error'],
  },
};

module.exports.DIMS = DIMS;
module.exports.similarity = similarity;
module.exports.defaultDims = defaultDims;
