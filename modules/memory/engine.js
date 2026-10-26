// ═══════════════════════════════════════════════════════════════════
// MEMORY ARCHITECTURE — ENGINE — modules/memory/engine.js
// v1.0.0
//
// A compartment is a generic container — a mode, a system, a domain, a
// project, a person, or literally anything else worth grouping thoughts
// under. Deliberately NOT a fixed taxonomy (unlike Brain Map's 13 meta-
// domains) — the person names their own compartments, and a compartment
// can hold anything: lattice nodes, canvas nodes, ALM log entries, voice
// utterances. This module does not duplicate that content — a
// compartment is a set of POINTERS into stores that already exist
// (LATTICE, VLE_STATE, ALM_STATE, canvas NX.nodes), the same "point at
// it, don't copy it" pattern Leverage Map and Horizon already use for
// their own cross-references.
//
// THE ACTUAL POINT, stated because it drives every design choice here:
// make cognition editable and explicit. Auto-suggestion exists (tag/
// word overlap against a compartment's existing members) so this isn't
// pure manual busywork, but it only ever SUGGESTS — assignment,
// reassignment, and removal are always a direct, visible, undoable
// action a person takes, never a silent background decision the way
// domain/intelligence auto-sync is (deliberately different from that
// design: self-knowledge computed FROM you can be automatic; the
// container you choose to think INSIDE should not be).
// ═══════════════════════════════════════════════════════════════════

'use strict';

const MEM_TYPES = {
  mode:    { label: 'Mode',    icon: '◐', color: '#7744ff', desc: 'A way of operating — focus mode, rest mode, whatever state changes how you think' },
  system:  { label: 'System',  icon: '⚙', color: '#00c8ff', desc: 'A working system with its own logic — a project pipeline, a relationship dynamic, a habit loop' },
  domain:  { label: 'Domain',  icon: '◈', color: '#00ff88', desc: 'A life area — matches Brain Map\'s domains if you want, or your own cut of them' },
  project: { label: 'Project', icon: '▣', color: '#ffe04a', desc: 'Something with an end-state, a scope, a timeline' },
  person:  { label: 'Person',  icon: '◉', color: '#ff66aa', desc: 'A relationship — everything that touches your thinking about one specific person' },
  custom:  { label: 'Custom',  icon: '✦', color: '#ff8c22', desc: 'Whatever doesn\'t fit the above — name it yourself' },
};

// ── State + persistence ─────────────────────────────────────────────
const MEM_KEY = 'mm_memory_architecture_v1';
const MEM_STATE = {
  compartments: [],     // { id, name, type, color, icon, desc, created, modified, lastActive, members: [{kind, id, addedAt}] }
  activeId: null,       // currently open/focused compartment, for the UI
};

function memSave() {
  // SECURITY FIX: this used to ALSO write localStorage['mm_memory_architecture_v1']
  // in plaintext, in parallel with — well, nothing, before this fix; the
  // vault now actually covers it (modules.memory).
  if (typeof vaultDirtySave === 'function') vaultDirtySave(4000);
}

function memLoad() {
  // SECURITY FIX: this read localStorage['mm_memory_architecture_v1'] as
  // its ONLY source — this data had no vault path at all before this
  // fix. Vault-only now (mastermind-vault.js, modules.memory); see
  // _ORPHAN_KEYS for recovering any pre-fix copy.
  MEM_STATE._loaded = true;
}

// ── CRUD — every one of these is a direct, visible action; none fire silently ──
function memCreateCompartment(name, type, opts) {
  const o = opts || {};
  const clean = String(name || '').trim();
  if (!clean) return null;
  const t = MEM_TYPES[type] ? type : 'custom';
  const c = {
    id: typeof uuid === 'function' ? uuid() : Date.now().toString(36),
    name: clean, type: t,
    color: o.color || MEM_TYPES[t].color,
    icon: o.icon || MEM_TYPES[t].icon,
    desc: (o.desc || '').trim(),
    created: Date.now(), modified: Date.now(), lastActive: Date.now(),
    members: [],
  };
  MEM_STATE.compartments.push(c);
  memSave();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('memory.compartment.created', { id: c.id, name: c.name, type: t });
  return c;
}

function memGetCompartment(id) {
  return MEM_STATE.compartments.find(c => c.id === id) || null;
}

function memRenameCompartment(id, name) {
  const c = memGetCompartment(id); if (!c) return false;
  c.name = String(name || '').trim() || c.name;
  c.modified = Date.now();
  memSave();
  return true;
}

function memDeleteCompartment(id) {
  const before = MEM_STATE.compartments.length;
  MEM_STATE.compartments = MEM_STATE.compartments.filter(c => c.id !== id);
  if (MEM_STATE.activeId === id) MEM_STATE.activeId = null;
  memSave();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('memory.compartment.deleted', { id });
  return MEM_STATE.compartments.length < before;
}

// kind: 'lattice' | 'canvas' | 'alm' | 'voice' | 'horizon' | anything else
// a future module wants to point compartments at. id: that store's own id.
function memAssign(compartmentId, kind, id) {
  const c = memGetCompartment(compartmentId); if (!c || !id) return false;
  if (c.members.some(m => m.kind === kind && m.id === id)) return false; // already in there
  c.members.push({ kind, id, addedAt: Date.now() });
  c.modified = c.lastActive = Date.now();
  memSave();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('memory.member.assigned', { compartmentId, kind, id });
  return true;
}

function memUnassign(compartmentId, kind, id) {
  const c = memGetCompartment(compartmentId); if (!c) return false;
  const before = c.members.length;
  c.members = c.members.filter(m => !(m.kind === kind && m.id === id));
  if (c.members.length !== before) { c.modified = Date.now(); memSave(); }
  return c.members.length !== before;
}

// Every compartment that currently holds this exact (kind, id) — an
// item can live in more than one compartment at once (a canvas node
// about a work project with a specific person is legitimately both).
function memCompartmentsFor(kind, id) {
  return MEM_STATE.compartments.filter(c => c.members.some(m => m.kind === kind && m.id === id));
}

// ── Auto-SUGGEST, never auto-assign ─────────────────────────────────
// Word-overlap against a compartment's own tag/text history, same
// Jaccard-family approach the lattice already uses elsewhere — reuses
// the pattern, not a new algorithm to trust separately. Returns ranked
// suggestions; the UI decides whether to show them and a person
// decides whether to accept one. Nothing here writes to MEM_STATE.
function memSuggestCompartments(text, tags) {
  const words = new Set(
    String(text || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 4)
      .concat((tags || []).map(t => String(t).toLowerCase()))
  );
  if (!words.size || !MEM_STATE.compartments.length) return [];
  const scored = MEM_STATE.compartments.map(c => {
    const nameWords = c.name.toLowerCase().split(/\s+/);
    const descWords = c.desc.toLowerCase().split(/\s+/);
    let hits = 0;
    for (const w of nameWords.concat(descWords)) if (words.has(w)) hits++;
    return { id: c.id, name: c.name, type: c.type, score: hits };
  }).filter(s => s.score > 0);
  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ── Cross-compartment relatedness, for the spatial view ─────────────
// Two compartments that share members (the same lattice node tagged
// into both, say) are "close" — this is what the visual layout uses
// for force-directed positioning, computed from real shared content,
// not an arbitrary layout.
function memRelatedness(aId, bId) {
  const a = memGetCompartment(aId), b = memGetCompartment(bId);
  if (!a || !b || !a.members.length || !b.members.length) return 0;
  const setB = new Set(b.members.map(m => m.kind + ':' + m.id));
  let shared = 0;
  for (const m of a.members) if (setB.has(m.kind + ':' + m.id)) shared++;
  const union = a.members.length + b.members.length - shared;
  return union > 0 ? shared / union : 0;
}

// Recency-driven depth for the pseudo-3D view — more recently touched
// compartments sit "closer" (larger, less parallax offset), automatic
// by default since it's derived from real activity, not a manual field
// anyone has to maintain.
function memDepthOf(compartment, now) {
  const t0 = now || Date.now();
  const halfLife = 1000 * 60 * 60 * 24 * 7; // 7 days
  const age = t0 - (compartment.lastActive || compartment.modified || compartment.created);
  return Math.pow(0.5, age / halfLife); // 1 = just touched, ->0 = long dormant
}

window.MEM_TYPES = MEM_TYPES;
window.MEM_STATE = MEM_STATE;
window.memSave = memSave;
window.memLoad = memLoad;
window.memCreateCompartment = memCreateCompartment;
window.memGetCompartment = memGetCompartment;
window.memRenameCompartment = memRenameCompartment;
window.memDeleteCompartment = memDeleteCompartment;
window.memAssign = memAssign;
window.memUnassign = memUnassign;
window.memCompartmentsFor = memCompartmentsFor;
window.memSuggestCompartments = memSuggestCompartments;
window.memRelatedness = memRelatedness;
window.memDepthOf = memDepthOf;

memLoad();
if (typeof MMLog !== 'undefined') MMLog.info('memory', 'Memory Architecture engine v1.0.0 loaded — ' + MEM_STATE.compartments.length + ' compartments');
