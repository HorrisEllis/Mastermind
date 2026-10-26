// ═══════════════════════════════════════════════════════════════════
// ASSOCIATIVE LATTICE — modules/lattice/lattice.js
// v1.0.0
//
// One substrate. Every module drops its data in and gets connection for
// free — no manual tagging, no manual linking, no "now go relate this
// to that". The explicit versions of these actions still exist; this is
// what happens WITHOUT you asking.
//
// Every ingested item automatically gets:
//   • tags        — extracted from its own text (VLE word-bank ranked)
//   • a SEQUENCE edge to whatever came before it, with an INFERRED
//     relation ('elaborates' / 'returns to' / 'shifts to' / 'crosses
//     into') — the "connected to the last, and the relation" part
//   • ASSOCIATION edges to any earlier item sharing enough vocabulary
//     (Jaccard, via the VLE engine)
//   • SHARED-TAG edges to earlier items carrying the same distinctive tag
//
// Sources that feed it (all wired, none optional):
//   canvas node spawn · ALM externalization · ALM delta · Horizon seed
//   · Horizon commitment · voice utterance · crystallized pattern
//
// Relations are INFERRED, not asked for. The inference is a documented
// heuristic, not a claim of understanding — see _inferRelation().
//
// Persistence: LATTICE is a live object, saved/restored by the vault
// exactly like ALM_STATE / MIRROR_STATE / VL_STATE (see modules.lattice
// in mastermind-vault.js). No localStorage — VAULT.spec §2 invariant 4.
//
// Sessions: every node ingested while a capture session (recording) is
// active carries that session's id (LATTICE.sessions). A node ingested
// with no active session gets sessionId: null and shows up under the
// synthetic "unsessioned" bucket latticeSessions() returns — see
// modules/lattice/ui.js for the SESSIONS tab that lists them.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const LAT_KEY = 'mm_lattice_v1';
// Was a hard ceiling that DELETED the oldest nodes past this count —
// .splice() with the result discarded, not archived. "We need this
// enforced. All data persists in the vault" (2026-08-30) is a direct,
// confirmed report against exactly that: a real, live node once it
// crossed this line, and everything it was connected to, was gone,
// silently, mid-session, with no error and no way to know it happened.
// Still the size of the HOT working set that gets scanned on every
// ingest — that part was never the bug — but nodes that age past it now
// move to LATTICE.archive instead of vanishing. See _latAgeOut().
const LAT_HOT_WINDOW = 5000;
const LAT_ASSOC_MIN = 0.12;          // Jaccard floor for an association edge
const LAT_SHARED_TAG_LOOKBACK = 120; // how far back to look for shared tags

// A session is what a recording actually captured — not "whatever else
// happened to occur while the mic was on". latticeIngest() is the single
// entry point for every kind of ingestion in the app (canvas nodes, ALM
// externalizations, Horizon seeds, AI exchanges captured automatically
// via mmCapture() — see modules/capture/capture.js), and a session being
// active said nothing about WHICH of those a given call actually was.
// Only the kinds that are genuinely audio-sourced attach to a session;
// everything else stays unsessioned regardless of timing, even if it
// happens to be ingested in the same breath as a live recording.
const LAT_SESSION_ELIGIBLE_KINDS = new Set(['voice.utterance', 'capture.speech', 'capture.gap']);

const LATTICE = {
  nodes: [],    // { id, kind, sourceId, text, tags, ts, prevId, relation, sessionId }
  edges: [],    // { from, to, type, weight, label }
  sessions: [], // { id, kind, startedAt, endedAt, nodeCount }
  archive: {    // nodes aged out of the hot window. Moved here, never deleted.
    shards: {}, // 'YYYY-MM' -> { nodes: [...] }
    index: {},  // nodeId -> shardKey, so one id can be found without scanning every shard
  },
};

function _shardKeyFor(ts) {
  const d = new Date(ts);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Hot set first, archive second — the one thing every read-side function
// that resolves a node by id needs, so a thread or a neighborhood that
// reaches into archived territory keeps working instead of just
// stopping at the boundary as if the node no longer existed.
function _latFindNode(id) {
  for (const n of LATTICE.nodes) if (n.id === id) return n;
  const shardKey = LATTICE.archive.index[id];
  if (!shardKey) return null;
  const shard = LATTICE.archive.shards[shardKey];
  return shard ? (shard.nodes.find(n => n.id === id) || null) : null;
}

// Moves the oldest hot nodes into archive once over the window — moves,
// never deletes. This is the direct replacement for the old prune, which
// used to run the exact same over-the-line check and then discard the
// result of .splice() instead of keeping it.
function _latAgeOut() {
  const hotWindow = (typeof window !== 'undefined' && window.LAT_HOT_WINDOW) || LAT_HOT_WINDOW;
  if (LATTICE.nodes.length <= hotWindow) return;
  const overflow = LATTICE.nodes.length - hotWindow;
  const dropped = LATTICE.nodes.splice(0, overflow);
  for (const n of dropped) {
    const shardKey = _shardKeyFor(n.ts);
    if (!LATTICE.archive.shards[shardKey]) LATTICE.archive.shards[shardKey] = { nodes: [] };
    LATTICE.archive.shards[shardKey].nodes.push(n);
    LATTICE.archive.index[n.id] = shardKey;
  }
  // Edges are left as-is regardless of which end just moved — an edge
  // crossing the hot/cold boundary is normal, and both ends stay
  // resolvable via _latFindNode(). The old code filtered these edges
  // OUT when a node was pruned; that was correct cleanup for a delete,
  // but wrong for a move — an edge to an archived node is still real,
  // still true, and still worth keeping.
}

// The session a node ingested right now belongs to, if any. Sourced from
// capture-bridge's recording sessions (mm.capture.session.start/end) —
// see _latWireBus() below. Nodes ingested with no active capture session
// (canvas spawns, ALM externalizations, Horizon seeds, etc.) get
// sessionId: null and surface as "Unsessioned" wherever sessions are
// listed, rather than being force-fit into one.
let _latActiveSession = null;

// Every kind that can enter the lattice, with display metadata. Adding a
// source is a data change, not a code change.
const LAT_KINDS = {
  'canvas.node':      { label: 'Canvas node',     color: '#00c8ff' },
  'alm.externalize':  { label: 'Externalized',    color: '#00ff88' },
  'alm.delta':        { label: 'Delta',           color: '#00ff88' },
  'horizon.seed':     { label: 'Seed',            color: '#ffe04a' },
  'horizon.commit':   { label: 'Commitment',      color: '#ff8c22' },
  'voice.utterance':  { label: 'Spoken',          color: '#7744ff' },
  'pattern.crystal':  { label: 'Pattern',         color: '#ff66aa' },
  'identity.marker':  { label: 'Who I am',        color: '#11ddcc' },
  'ai.prompt':        { label: 'Asked AI',        color: '#8899aa' },
  'ai.reply':         { label: 'AI reply',        color: '#66ccff' },
  'session.summary':  { label: 'Session',         color: '#00c8ff' },
};

function _latWords(text) {
  return _latTokens(text).map((t) => t.surface);
}

// Tokenize once, shared by every accuracy-sensitive comparison in this
// file — stem-aware (word FORM stops mattering) and bigram-capable
// (shared PHRASES count for more than coincidentally shared single
// words). See modules/lattice/text-analysis.js for why exact-word
// Jaccard alone was missing most real connections.
function _latTokens(text) {
  const stopwords = (typeof VL_STOPWORDS !== 'undefined') ? VL_STOPWORDS : null;
  if (typeof TextAnalysis !== 'undefined') return TextAnalysis.tokenize(text, stopwords, 4);
  // If text-analysis.js somehow didn't load, degrade to the exact-word
  // behavior this replaces — no worse than before, never a throw.
  return String(text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
    .filter((w) => w.length >= 4 && !(stopwords && stopwords.has && stopwords.has(w)))
    .map((w) => ({ surface: w, stem: w }));
}

// A node saved before this fix has .words but no .stems. Rather than a
// migration pass, this reconstructs tokens for it on the fly from its
// own stored text — a few-millisecond re-tokenize, not a rewrite of
// the vault — so an old node keeps participating fully in matching
// against new ones instead of silently degrading.
function _latTokensOf(node) {
  if (node.stems && node.words && node.stems.length === node.words.length) {
    return node.words.map((w, i) => ({ surface: w, stem: node.stems[i] }));
  }
  return _latTokens(node.text);
}

function _latSimilarity(tokensA, tokensB) {
  if (typeof TextAnalysis !== 'undefined') return TextAnalysis.similarity(tokensA, tokensB);
  return _latJaccard(tokensA.map((t) => t.surface), tokensB.map((t) => t.surface));
}

function _latJaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = {};
  let inter = 0;
  for (const w of a) setA[w] = 1;
  for (const w of b) if (setA[w]) inter++;
  const union = Object.keys(setA).length + b.length - inter;
  return union > 0 ? inter / union : 0;
}

// The relation between this item and the one before it. A heuristic —
// stated plainly rather than dressed up as comprehension:
//   same kind + strong overlap        -> elaborates
//   strong overlap after a gap        -> returns to
//   different kind                    -> crosses into
//   little/no overlap                 -> shifts to
function _inferRelation(prev, tokens, kind, tags) {
  if (!prev) return 'opens';
  const overlap = _latSimilarity(tokens, _latTokensOf(prev));
  const sharedTags = (tags || []).filter(t => (prev.tags || []).includes(t)).length;
  const gapMs = Date.now() - (prev.ts || Date.now());
  const strong = overlap >= 0.18 || sharedTags >= 2;
  if (strong && gapMs > 1000 * 60 * 30) return 'returns to';
  if (kind !== prev.kind) return strong ? 'crosses into' : 'shifts to';
  if (strong) return 'elaborates';
  return 'shifts to';
}

// ── Persistence ──────────────────────────────────────────────────────
// The lattice is a live object (LATTICE.nodes / .edges / .sessions), the
// same treatment ALM_STATE, MIRROR_STATE and VL_STATE already get — the
// vault's own vaultSerialize()/vaultDeserialize() read and write it
// directly (see foundation/vault/mastermind-vault.js, modules.lattice).
// This file never touches localStorage: per VAULT.spec §2 invariant 4,
// "no app state is persisted outside the vault except its own location".
// An earlier build stored the lattice under localStorage['mm_lattice_v1']
// directly — that key is now harvested through vaultHarvestOrphans()
// like every other pre-vault orphan, a person's explicit choice, not a
// silent migration.
function latSave() {
  try {
    // Every node ingested marks the vault dirty and queues a save — no
    // manual "save" step. Short debounce: fast enough that a burst of
    // words during live dictation doesn't trigger a disk write and a
    // full re-encrypt per keystroke, short enough that "automatic"
    // still means what it says.
    if (typeof vaultDirtySave === 'function') vaultDirtySave(1500);
  } catch (e) { if (typeof MMLog !== 'undefined') MMLog.error('lattice', 'save failed: ' + e.message); }
}

// Session boundaries are a durability point, not just another node: the
// person is done talking, so this is the moment to actually land on
// disk rather than wait out the debounce — verified, not just queued.
async function latSaveNow() {
  try {
    if (typeof vaultSave === 'function') await vaultSave(false);
  } catch (e) { if (typeof MMLog !== 'undefined') MMLog.error('lattice', 'immediate save failed: ' + e.message); }
}

// Hydration happens through vaultDeserialize() once the vault unlocks —
// LATTICE.nodes/.edges/.sessions are assigned there directly. Kept as a
// harmless no-op (rather than removed) so the existing boot-time call in
// nexus-engine.js keeps working unchanged regardless of load order.
function latLoad() {}

// ── The single entry point every module calls ─────────────────────
function latticeIngest(kind, sourceId, text, meta) {
  const clean = String(text || '').trim();
  if (!clean) return null;

  const id = typeof uuid === 'function' ? uuid() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  const tokens = _latTokens(clean);
  const words = tokens.map((t) => t.surface);
  const stems = tokens.map((t) => t.stem);

  // Tags — reuse the VLE extractor so tag vocabulary is shared across
  // the whole app rather than each module inventing its own.
  let tags = [];
  if (typeof vleExtractTags === 'function' && typeof VLE_STATE !== 'undefined') {
    tags = vleExtractTags(clean, VLE_STATE.wordBank || {});
  } else {
    tags = words.slice(0, 5);
  }
  if (meta && Array.isArray(meta.tags)) {
    for (const t of meta.tags) if (t && !tags.includes(t)) tags.push(t);
  }

  const prev = LATTICE.nodes.length ? LATTICE.nodes[LATTICE.nodes.length - 1] : null;
  const relation = _inferRelation(prev, tokens, kind, tags);

  // Session: an active capture session (mm.capture.session.start) wins,
  // but only for kinds that are actually part of what a recording
  // captures — see LAT_SESSION_ELIGIBLE_KINDS above. A canvas node
  // spawned, an ALM delta externalized, or an AI reply auto-captured
  // while a voice session happens to be running is real data and still
  // gets ingested — it just doesn't inherit a session it was never
  // part of. Falls back to a sessionId a caller already threaded
  // through meta.extra (capture-bridge did this before the lattice
  // tracked sessions itself) under the same eligibility rule.
  const extra = meta && meta.extra ? meta.extra : null;
  const sessionEligible = LAT_SESSION_ELIGIBLE_KINDS.has(kind);
  const sessionId = sessionEligible
    ? (_latActiveSession ? _latActiveSession.id : ((extra && extra.sessionId) || null))
    : null;

  const node = {
    id, kind, sourceId: sourceId || null, text: clean, words, stems, tags,
    ts: Date.now(), prevId: prev ? prev.id : null, relation, sessionId,
    meta: extra,
  };

  const newEdges = [];
  // 1. sequence — connected to the last, with the inferred relation
  if (prev) newEdges.push({ from: prev.id, to: id, type: 'sequence', weight: 1, label: relation });

  // 2. association — stem-and-phrase overlap with anything earlier.
  // The shared-word label prefers stem-level matches shown via their
  // real surface form, so "anxious" ingested against an earlier
  // "anxiety" node correctly shows THAT as the shared concept in the
  // edge label, instead of an empty label because their exact surface
  // forms never literally matched.
  for (let i = LATTICE.nodes.length - 1; i >= 0; i--) {
    const other = LATTICE.nodes[i];
    if (other.id === (prev && prev.id)) continue; // already sequenced
    const otherTokens = _latTokensOf(other);
    const score = _latSimilarity(tokens, otherTokens);
    if (score >= LAT_ASSOC_MIN) {
      const otherStems = otherTokens.map((t) => t.stem);
      const shared = words.filter((w, idx) => otherStems.includes(stems[idx]));
      newEdges.push({ from: id, to: other.id, type: 'association', weight: Math.round(score * 1000) / 1000, label: shared.slice(0, 4).join(', ') });
    }
  }

  // 3. shared tag — explicit conceptual overlap, bounded lookback
  const from = Math.max(0, LATTICE.nodes.length - LAT_SHARED_TAG_LOOKBACK);
  for (let i = LATTICE.nodes.length - 1; i >= from; i--) {
    const other = LATTICE.nodes[i];
    const shared = tags.filter(t => (other.tags || []).includes(t));
    if (shared.length && !newEdges.find(e => e.to === other.id || e.from === other.id)) {
      newEdges.push({ from: id, to: other.id, type: 'shared-tag', weight: shared.length, label: shared.join(', ') });
    }
  }

  LATTICE.nodes.push(node);
  for (const e of newEdges) LATTICE.edges.push(e);

  if (sessionId) {
    const sess = LATTICE.sessions.find(s => s.id === sessionId);
    if (sess) sess.nodeCount = (sess.nodeCount || 0) + 1;
  }

  // Bounded hot-set scan cost — nodes past the window age into archive,
  // moved, never dropped. See _latAgeOut().
  _latAgeOut();

  latSave();
  if (typeof MM_BUS !== 'undefined') {
    MM_BUS.emit('lattice.node.added', { id, kind, tags, relation, edgeCount: newEdges.length });
  }
  return { id, tags, relation, edges: newEdges, prevId: node.prevId };
}

// ── Read side ──────────────────────────────────────────────────────
function latticeNeighborhood(id, limit) {
  const out = [];
  for (const e of LATTICE.edges) {
    if (e.from === id || e.to === id) {
      const otherId = e.from === id ? e.to : e.from;
      const n = _latFindNode(otherId);
      if (n) out.push({ node: n, edge: e });
    }
  }
  out.sort((a, b) => (b.edge.weight || 0) - (a.edge.weight || 0));
  return out.slice(0, limit || 12);
}

function latticeByKind(kind) { return LATTICE.nodes.filter(n => n.kind === kind); }

// Threads: follow sequence edges backwards to reconstruct a line of thought.
function latticeThread(id, maxLen) {
  const chain = [];
  let cur = _latFindNode(id);
  while (cur && chain.length < (maxLen || 20)) {
    chain.unshift(cur);
    cur = cur.prevId ? _latFindNode(cur.prevId) : null;
  }
  return chain;
}

// Tags that recur across kinds — the concepts genuinely bridging modules,
// which is the whole point of one shared substrate.
function latticeBridges(minKinds) {
  const need = minKinds || 2;
  const byTag = {};
  for (const n of LATTICE.nodes) {
    for (const t of (n.tags || [])) {
      (byTag[t] = byTag[t] || { kinds: new Set(), count: 0 });
      byTag[t].kinds.add(n.kind);
      byTag[t].count++;
    }
  }
  return Object.keys(byTag)
    .filter(t => byTag[t].kinds.size >= need)
    .map(t => ({ tag: t, kinds: [...byTag[t].kinds], count: byTag[t].count }))
    .sort((a, b) => b.count - a.count);
}

// ── Sessions (read side) ────────────────────────────────────────────
// Every recording session that has ever fed the lattice, newest first,
// plus a synthetic 'unsessioned' bucket for nodes that arrived with no
// active capture session (canvas, ALM, Horizon, etc.) — real data, not
// hidden just because it doesn't have a session id.
function latticeSessions() {
  const real = LATTICE.sessions.slice().sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const archivedNodes = Object.values(LATTICE.archive.shards).flatMap(s => s.nodes);
  const unsessionedCount = LATTICE.nodes.filter(n => !n.sessionId).length
    + archivedNodes.filter(n => !n.sessionId).length;
  if (unsessionedCount) {
    real.push({
      id: 'unsessioned', kind: null, startedAt: null, endedAt: null,
      nodeCount: unsessionedCount, synthetic: true,
    });
  }
  return real;
}

// A session's own node list can span the hot/cold boundary once some of
// its nodes age out — an explicit "open this session" read, not a
// per-ingest hot path, so checking archive here is fine. Cold nodes
// first, so the order still matches when they were actually said.
function latticeNodesForSession(id) {
  const archivedNodes = Object.values(LATTICE.archive.shards).flatMap(s => s.nodes);
  const match = id === 'unsessioned' ? (n => !n.sessionId) : (n => n.sessionId === id);
  return archivedNodes.filter(match).concat(LATTICE.nodes.filter(match));
}

window.LATTICE = LATTICE;
window.LAT_KINDS = LAT_KINDS;
window.LAT_HOT_WINDOW = LAT_HOT_WINDOW;
window.latticeIngest = latticeIngest;
window.latticeNeighborhood = latticeNeighborhood;
window.latticeByKind = latticeByKind;
window.latticeThread = latticeThread;
window.latticeBridges = latticeBridges;
window.latticeSessions = latticeSessions;
window.latticeNodesForSession = latticeNodesForSession;
window.latLoad = latLoad;
window.latSave = latSave;
window.latSaveNow = latSaveNow;

if (typeof MMLog !== 'undefined') MMLog.info('lattice', 'Associative lattice v1.0.0 — universal substrate live');

// ── Bus-driven sources ─────────────────────────────────────────────
// Crystallised patterns enter the lattice without the pattern engine
// needing to know the lattice exists — it just announces, we listen.
(function _latWireBus() {
  let wired = false;
  function attempt() {
    if (wired || typeof MM_BUS === 'undefined' || !MM_BUS.on) return false;
    MM_BUS.on('pattern.crystallized', (d) => {
      try { latticeIngest('pattern.crystal', d.id, d.signature, { extra: { kind: d.kind, count: d.count } }); } catch (e) {}
    });
    // Capture sessions (foundation/ai/capture-bridge.js) are the real
    // "session" concept nodes get grouped under — a recording start/stop,
    // not an app-launch. Tracked here rather than duplicated because the
    // lattice is the thing that needs to answer "what came in during
    // session X", not capture-bridge itself.
    MM_BUS.on('mm.capture.session.start', (d) => {
      try {
        _latActiveSession = { id: d.id, kind: d.kind || 'live', startedAt: d.startedAt };
        LATTICE.sessions.push({ id: d.id, kind: d.kind || 'live', startedAt: d.startedAt, endedAt: null, nodeCount: 0 });
        latSave();
      } catch (e) {}
    });
    MM_BUS.on('mm.capture.session.end', (d) => {
      try {
        const sess = LATTICE.sessions.find(s => s.id === d.id);
        if (sess) sess.endedAt = d.endedAt || new Date().toISOString();
        // Clear the active session BEFORE ingesting the summary node, so
        // the summary itself lands as unsessioned rather than being
        // folded into the session it is describing.
        if (_latActiveSession && _latActiveSession.id === d.id) _latActiveSession = null;

        // The session becomes a node in its own right — not just a
        // metadata row in LATTICE.sessions. This is what makes a closed
        // session traversable and connectable the same way any other
        // captured thing is: it shows up in threads, gets tagged, gets
        // association edges to whatever it relates to.
        if (sess) {
          const durationMs = sess.endedAt && sess.startedAt
            ? (Date.parse(sess.endedAt) - Date.parse(sess.startedAt)) : null;
          const mins = durationMs != null ? Math.max(1, Math.round(durationMs / 60000)) : null;
          const summary = 'Session — ' + (sess.nodeCount || 0) + ' node' +
            ((sess.nodeCount || 0) === 1 ? '' : 's') +
            (mins != null ? ' · ' + mins + ' min' : '') +
            (sess.kind ? ' · ' + sess.kind : '');
          latticeIngest('session.summary', sess.id, summary, {
            extra: { summarizedSessionId: sess.id, nodeCount: sess.nodeCount || 0, startedAt: sess.startedAt, endedAt: sess.endedAt },
          });
        }

        // A closed session is a durability boundary, not just another
        // dirty-flag tick: land it on disk now, verified, instead of
        // waiting out the debounce.
        latSaveNow();
      } catch (e) {}
    });
    wired = true;
    return true;
  }
  if (attempt()) return;
  document.addEventListener('DOMContentLoaded', attempt);
  let n = 0;
  const iv = setInterval(() => { if (attempt() || ++n > 40) clearInterval(iv); }, 50);
})();
