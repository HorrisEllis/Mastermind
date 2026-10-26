// ═══════════════════════════════════════════════════════════════════════════════
// MASTERMIND FOUNDATION ENGINE  v1.0
// ─────────────────────────────────────────────────────────────────────────────
// Bedrock-first architecture for the Mastermind cognitive OS.
// Provides: UUID registry · delta ledger · tag system · domain taxonomy ·
//           structured logging · vault persistence · snapshot/backup ·
//           ripple detection · diagnostic tooling · toast notifications
//
// Drop in BEFORE nexus-engine.js. Exposes global: MM, MMVault, MMLog, MMTags
// ═══════════════════════════════════════════════════════════════════════════════

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// §0  CORE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

const _MM_UTILS = {
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  },
  shortId(id) { return id ? id.slice(0, 8) : '??'; },
  ts() { return Date.now(); },
  isoNow() { return new Date().toISOString(); },
  deepClone(obj) {
    try { return JSON.parse(JSON.stringify(obj)); }
    catch { return obj; }
  },
  escH(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
  fmtTS(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },
  slug(str) {
    return String(str || '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  },
  hashStr(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(16).padStart(8, '0');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// §1  EVENT BUS  (internal pub/sub, no deps)
// ─────────────────────────────────────────────────────────────────────────────

const _MM_BUS = (() => {
  const _listeners = {};
  return {
    on(event, fn) {
      (_listeners[event] = _listeners[event] || []).push(fn);
      return () => this.off(event, fn);
    },
    off(event, fn) {
      if (!_listeners[event]) return;
      _listeners[event] = _listeners[event].filter(f => f !== fn);
    },
    emit(event, data) {
      (_listeners[event] || []).forEach(fn => { try { fn(data); } catch (e) { console.error('[MM:BUS]', e); } });
      (_listeners['*'] || []).forEach(fn => { try { fn({ event, data }); } catch (e) {} });
    },
    once(event, fn) {
      const unsub = this.on(event, (...args) => { unsub(); fn(...args); });
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §2  UUID REGISTRY  — Every entity in Mastermind gets a UUID
// ─────────────────────────────────────────────────────────────────────────────

const MMRegistry = (() => {
  // Registry format:
  // { [uuid]: { id, type, module, label, created, modified, version, tags[], domains[], meta{} } }
  const _entries = new Map();
  const _typeIndex = new Map();    // type → Set<uuid>
  const _moduleIndex = new Map();  // module → Set<uuid>

  function _index(entry) {
    // type index
    if (!_typeIndex.has(entry.type)) _typeIndex.set(entry.type, new Set());
    _typeIndex.get(entry.type).add(entry.id);
    // module index
    const mod = entry.module || 'core';
    if (!_moduleIndex.has(mod)) _moduleIndex.set(mod, new Set());
    _moduleIndex.get(mod).add(entry.id);
  }

  function _deindex(entry) {
    _typeIndex.get(entry.type)?.delete(entry.id);
    _moduleIndex.get(entry.module || 'core')?.delete(entry.id);
  }

  return {
    /**
     * Register a new entity.
     * @param {string} type  e.g. 'node', 'conn', 'zone', 'tag', 'domain', 'snapshot', ...
     * @param {object} opts  { id?, module?, label?, tags?, domains?, meta? }
     * @returns {string} uuid
     */
    register(type, opts = {}) {
      const id = opts.id || _MM_UTILS.uuid();
      const now = _MM_UTILS.ts();
      const entry = {
        id,
        type,
        module: opts.module || 'core',
        label: opts.label || '',
        created: opts.created || now,
        modified: now,
        version: 1,
        tags: opts.tags ? [...opts.tags] : [],
        domains: opts.domains ? [...opts.domains] : [],
        meta: opts.meta ? { ...(opts.meta) } : {},
        _alive: true,
      };
      _entries.set(id, entry);
      _index(entry);
      _MM_BUS.emit('registry:register', { id, type, entry });
      return id;
    },

    /**
     * Update an entry's metadata (not delta-tracked here, use MMDelta for that).
     */
    update(id, changes = {}) {
      const e = _entries.get(id);
      if (!e) return false;
      _deindex(e);
      Object.assign(e, changes);
      e.modified = _MM_UTILS.ts();
      e.version = (e.version || 1) + 1;
      _index(e);
      _MM_BUS.emit('registry:update', { id, changes });
      return true;
    },

    /** Soft-delete: marks as !alive but keeps in ledger for delta history. */
    remove(id) {
      const e = _entries.get(id);
      if (!e) return false;
      _deindex(e);
      e._alive = false;
      e.modified = _MM_UTILS.ts();
      _MM_BUS.emit('registry:remove', { id });
      return true;
    },

    get(id) { return _entries.get(id) || null; },
    alive(id) { return _entries.get(id)?._alive === true; },
    exists(id) { return _entries.has(id); },

    byType(type) { return [...(_typeIndex.get(type) || [])].map(id => _entries.get(id)).filter(Boolean); },
    byModule(mod) { return [...(_moduleIndex.get(mod) || [])].map(id => _entries.get(id)).filter(Boolean); },
    all() { return [..._entries.values()]; },
    alive_all() { return [..._entries.values()].filter(e => e._alive); },

    /** Returns a plain object ledger (for serialization). */
    export() {
      const out = {};
      _entries.forEach((v, k) => { out[k] = { ...v }; });
      return out;
    },

    /** Reconstruct from exported ledger. */
    import(ledger) {
      if (!ledger) return;
      Object.values(ledger).forEach(entry => {
        _entries.set(entry.id, { ...entry });
        _index(entry);
      });
      _MM_BUS.emit('registry:import', { count: Object.keys(ledger).length });
    },

    count() { return _entries.size; },
    stats() {
      const types = {};
      _typeIndex.forEach((set, t) => { types[t] = set.size; });
      const modules = {};
      _moduleIndex.forEach((set, m) => { modules[m] = set.size; });
      return { total: _entries.size, alive: [..._entries.values()].filter(e => e._alive).length, types, modules };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §3  DELTA LEDGER  — Immutable append-only change log for every entity
// ─────────────────────────────────────────────────────────────────────────────

const MMDelta = (() => {
  // Each delta: { id, entityId, entityType, action, from, to, meta, ts, session }
  const _ledger = [];
  const _byEntity = new Map(); // entityId → delta[]
  let _sessionId = _MM_UTILS.uuid();

  return {
    get sessionId() { return _sessionId; },
    newSession() { _sessionId = _MM_UTILS.uuid(); },

    /**
     * Record a delta for an entity.
     * @param {string} entityId
     * @param {string} action   e.g. 'spawn', 'title_edit', 'tag_add', 'delete', 'collapse'
     * @param {*}      from     previous state/value
     * @param {*}      to       new state/value
     * @param {object} meta     optional context
     */
    push(entityId, action, from, to, meta = {}) {
      const entityReg = MMRegistry.get(entityId);
      const delta = {
        id: _MM_UTILS.uuid(),
        entityId,
        entityType: entityReg?.type || 'unknown',
        module: entityReg?.module || meta.module || 'core',
        action,
        from: _MM_UTILS.deepClone(from),
        to: _MM_UTILS.deepClone(to),
        meta: { ...meta },
        ts: _MM_UTILS.ts(),
        session: _sessionId,
      };
      _ledger.push(delta);
      if (!_byEntity.has(entityId)) _byEntity.set(entityId, []);
      _byEntity.get(entityId).push(delta);
      // Update registry modified time
      MMRegistry.update(entityId, {});
      _MM_BUS.emit('delta:push', delta);
      return delta.id;
    },

    /** Get all deltas for an entity (most recent first). */
    forEntity(entityId) {
      return [...(_byEntity.get(entityId) || [])].reverse();
    },

    /** Get last N global deltas. */
    recent(n = 50) {
      return _ledger.slice(-n).reverse();
    },

    /** Get deltas by action type. */
    byAction(action) {
      return _ledger.filter(d => d.action === action);
    },

    /** Get deltas by module. */
    byModule(mod) {
      return _ledger.filter(d => d.module === mod);
    },

    /** Get deltas since a timestamp. */
    since(ts) {
      return _ledger.filter(d => d.ts >= ts);
    },

    /** Count of mutations on an entity (a rough "heat" score). */
    heat(entityId) {
      return (_byEntity.get(entityId) || []).length;
    },

    export() { return [..._ledger]; },
    import(arr) {
      if (!Array.isArray(arr)) return;
      arr.forEach(d => {
        _ledger.push(d);
        if (!_byEntity.has(d.entityId)) _byEntity.set(d.entityId, []);
        _byEntity.get(d.entityId).push(d);
      });
    },

    count() { return _ledger.length; },
    stats() {
      const byAction = {};
      const byModule = {};
      const bySession = {};
      _ledger.forEach(d => {
        byAction[d.action] = (byAction[d.action] || 0) + 1;
        byModule[d.module || 'core'] = (byModule[d.module || 'core'] || 0) + 1;
        bySession[d.session] = (bySession[d.session] || 0) + 1;
      });
      return { total: _ledger.length, byAction, byModule, sessions: Object.keys(bySession).length };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §4  TAG SYSTEM  — Hierarchical, typed, searchable tags for every entity
// ─────────────────────────────────────────────────────────────────────────────

const MMTags = (() => {
  // Tag definition: { id, name, slug, color, category, description, parent?, count }
  const _tags = new Map();   // slug → TagDef
  const _entityTags = new Map(); // entityId → Set<slug>
  const _tagEntities = new Map(); // slug → Set<entityId>

  // Built-in tag categories
  const CATEGORIES = {
    domain:    { label: 'Domain',    color: '#00c8ff', icon: '⬡' },
    type:      { label: 'Type',      color: '#cc44ff', icon: '◈' },
    status:    { label: 'Status',    color: '#00ff88', icon: '●' },
    emotion:   { label: 'Emotion',   color: '#ff66aa', icon: '♥' },
    priority:  { label: 'Priority',  color: '#ffe04a', icon: '▲' },
    project:   { label: 'Project',   color: '#ff8c22', icon: '⊞' },
    relation:  { label: 'Relation',  color: '#11ddcc', icon: '⌁' },
    custom:    { label: 'Custom',    color: '#aaaaaa', icon: '✎' },
    system:    { label: 'System',    color: '#7744ff', icon: '⚙' },
    horizon:   { label: 'Horizon',   color: '#d4a820', icon: '◎' },
  };

  // Seed with built-in tags
  const BUILTIN_TAGS = [
    // Status
    { name: 'Active',      category: 'status',   color: '#00ff88' },
    { name: 'Archived',    category: 'status',   color: '#444' },
    { name: 'In Progress', category: 'status',   color: '#ff8c22' },
    { name: 'Blocked',     category: 'status',   color: '#ff3355' },
    { name: 'Done',        category: 'status',   color: '#00ff88' },
    { name: 'Draft',       category: 'status',   color: '#ffe04a' },
    // Priority
    { name: 'High',        category: 'priority', color: '#ff3355' },
    { name: 'Medium',      category: 'priority', color: '#ff8c22' },
    { name: 'Low',         category: 'priority', color: '#6a98b8' },
    { name: 'Critical',    category: 'priority', color: '#ff0044' },
    // Cognitive
    { name: 'Insight',     category: 'domain',   color: '#ff8c22' },
    { name: 'Pattern',     category: 'domain',   color: '#cc44ff' },
    { name: 'Question',    category: 'domain',   color: '#ffe04a' },
    { name: 'Seed',        category: 'domain',   color: '#00ff88' },
    { name: 'Synthesis',   category: 'domain',   color: '#11ddcc' },
    { name: 'Framework',   category: 'domain',   color: '#d4a820' },
    { name: 'Friction',    category: 'domain',   color: '#ff3355' },
    { name: 'Signal',      category: 'domain',   color: '#00c8ff' },
    { name: 'Noise',       category: 'domain',   color: '#ff3355' },
    { name: 'Causal',      category: 'domain',   color: '#7744ff' },
    // Horizon
    { name: '1W',          category: 'horizon',  color: '#d4a820' },
    { name: '1M',          category: 'horizon',  color: '#d4a820' },
    { name: '3M',          category: 'horizon',  color: '#d4a820' },
    { name: '1Y',          category: 'horizon',  color: '#d4a820' },
    { name: '5Y',          category: 'horizon',  color: '#d4a820' },
    // Relations
    { name: 'Depends On',  category: 'relation', color: '#11ddcc' },
    { name: 'Blocks',      category: 'relation', color: '#ff3355' },
    { name: 'Inspires',    category: 'relation', color: '#cc44ff' },
    { name: 'Contradicts', category: 'relation', color: '#ff8c22' },
    { name: 'Extends',     category: 'relation', color: '#00c8ff' },
  ];

  function _ensureBuiltins() {
    BUILTIN_TAGS.forEach(t => {
      const slug = _MM_UTILS.slug(t.name);
      if (!_tags.has(slug)) {
        _tags.set(slug, {
          id: MMRegistry.register('tag', { label: t.name, module: 'tags', meta: { builtin: true } }),
          name: t.name,
          slug,
          color: t.color,
          category: t.category,
          description: t.description || '',
          parent: t.parent || null,
          count: 0,
          builtin: true,
          created: _MM_UTILS.ts(),
        });
      }
    });
  }

  return {
    CATEGORIES,

    init() { _ensureBuiltins(); },

    /**
     * Define a new tag (or get existing by slug).
     */
    define(name, opts = {}) {
      const slug = _MM_UTILS.slug(name);
      if (_tags.has(slug)) return _tags.get(slug);
      const tagDef = {
        id: opts.id || MMRegistry.register('tag', { label: name, module: 'tags', meta: opts }),
        name,
        slug,
        color: opts.color || '#aaaaaa',
        category: opts.category || 'custom',
        description: opts.description || '',
        parent: opts.parent || null,
        count: 0,
        builtin: false,
        created: _MM_UTILS.ts(),
      };
      _tags.set(slug, tagDef);
      _MM_BUS.emit('tags:define', { slug, tagDef });
      return tagDef;
    },

    /** Add a tag to an entity. Returns true if newly added. */
    tag(entityId, tagName) {
      const slug = _MM_UTILS.slug(tagName);
      // auto-define tag if not yet known
      if (!_tags.has(slug)) this.define(tagName);
      const tagDef = _tags.get(slug);

      if (!_entityTags.has(entityId)) _entityTags.set(entityId, new Set());
      const existing = _entityTags.get(entityId);
      if (existing.has(slug)) return false;
      existing.add(slug);

      if (!_tagEntities.has(slug)) _tagEntities.set(slug, new Set());
      _tagEntities.get(slug).add(entityId);
      tagDef.count = (_tagEntities.get(slug) || new Set()).size;

      MMDelta.push(entityId, 'tag_add', null, { tag: slug }, { module: 'tags' });
      _MM_BUS.emit('tags:tag', { entityId, slug });
      return true;
    },

    /** Remove a tag from an entity. */
    untag(entityId, tagName) {
      const slug = _MM_UTILS.slug(tagName);
      const existing = _entityTags.get(entityId);
      if (!existing || !existing.has(slug)) return false;
      existing.delete(slug);
      _tagEntities.get(slug)?.delete(entityId);
      const tagDef = _tags.get(slug);
      if (tagDef) tagDef.count = (_tagEntities.get(slug) || new Set()).size;
      MMDelta.push(entityId, 'tag_remove', { tag: slug }, null, { module: 'tags' });
      _MM_BUS.emit('tags:untag', { entityId, slug });
      return true;
    },

    /** Replace all tags on an entity. */
    setTags(entityId, tagNames) {
      const slugs = tagNames.map(_MM_UTILS.slug);
      const current = [...(_entityTags.get(entityId) || [])];
      current.forEach(s => this.untag(entityId, s));
      slugs.forEach(s => this.tag(entityId, s));
    },

    /** Get all tags on an entity (returns TagDef[]). */
    forEntity(entityId) {
      return [...(_entityTags.get(entityId) || [])].map(s => _tags.get(s)).filter(Boolean);
    },

    /** Get all entity IDs with a given tag. */
    entities(tagName) {
      const slug = _MM_UTILS.slug(tagName);
      return [...(_tagEntities.get(slug) || [])];
    },

    /** Get entities matching ALL given tags (AND). */
    entitiesWithAll(tagNames) {
      const slugs = tagNames.map(_MM_UTILS.slug);
      if (!slugs.length) return [];
      let result = new Set(_tagEntities.get(slugs[0]) || []);
      slugs.slice(1).forEach(s => {
        const b = _tagEntities.get(s) || new Set();
        result = new Set([...result].filter(id => b.has(id)));
      });
      return [...result];
    },

    /** Get entities matching ANY given tags (OR). */
    entitiesWithAny(tagNames) {
      const slugs = tagNames.map(_MM_UTILS.slug);
      const result = new Set();
      slugs.forEach(s => (_tagEntities.get(s) || []).forEach(id => result.add(id)));
      return [...result];
    },

    getTag(name) { return _tags.get(_MM_UTILS.slug(name)) || null; },
    allTags() { return [..._tags.values()]; },
    byCategory(cat) { return [..._tags.values()].filter(t => t.category === cat); },

    /** Tag usage sorted by count (most used first). */
    topTags(n = 20) {
      return [..._tags.values()].sort((a, b) => b.count - a.count).slice(0, n);
    },

    export() {
      const tags = {};
      _tags.forEach((v, k) => { tags[k] = { ...v }; });
      const entityTags = {};
      _entityTags.forEach((v, k) => { entityTags[k] = [...v]; });
      return { tags, entityTags };
    },

    import(data) {
      if (!data) return;
      if (data.tags) {
        Object.values(data.tags).forEach(t => { _tags.set(t.slug, t); });
      }
      if (data.entityTags) {
        Object.entries(data.entityTags).forEach(([entityId, slugs]) => {
          _entityTags.set(entityId, new Set(slugs));
          slugs.forEach(s => {
            if (!_tagEntities.has(s)) _tagEntities.set(s, new Set());
            _tagEntities.get(s).add(entityId);
          });
        });
      }
    },

    stats() {
      const byCat = {};
      _tags.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + 1; });
      return { total: _tags.size, byCategory: byCat, entityCount: _entityTags.size };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §5  DOMAIN TAXONOMY  — The cognitive domain graph
// ─────────────────────────────────────────────────────────────────────────────

const MMDomains = (() => {
  // Domain: { id, name, slug, color, icon, category, description, parent?, aliases[] }
  const _domains = new Map();

  const DOMAIN_SCHEMA = [
    // ── Cognitive Architecture ────────────────────────────────────────────
    { name: 'Metacognition',    cat: 'Mind',         color: '#00c8ff', icon: '∞',  desc: 'Thinking about thinking. Frameworks, loops, integration.' },
    { name: 'Pattern',          cat: 'Mind',         color: '#cc44ff', icon: '⬢',  desc: 'Recognition, structure, recurrence.' },
    { name: 'Synthesis',        cat: 'Mind',         color: '#11ddcc', icon: '◎',  desc: 'Integration, compression, emergence.' },
    { name: 'Signal',           cat: 'Mind',         color: '#00ff88', icon: '◉',  desc: 'High-fidelity, aligned, clear input.' },
    { name: 'Noise',            cat: 'Mind',         color: '#ff3355', icon: '≋',  desc: 'Distortion, distraction, low alignment.' },
    { name: 'Feedback Loop',    cat: 'Mind',         color: '#11ddcc', icon: '↺',  desc: 'Output feeds back as input. Oscillation.' },
    { name: 'Invariant',        cat: 'Mind',         color: '#00c8ff', icon: '◆',  desc: 'What persists through transformation.' },
    { name: 'Cross-Domain',     cat: 'Mind',         color: '#7744ff', icon: '⊞',  desc: 'Synthesis across domains. Innovation through connection.' },
    { name: 'Intuition',        cat: 'Mind',         color: '#d4a820', icon: '✦',  desc: 'Pattern-recognition below consciousness.' },
    { name: 'Working Memory',   cat: 'Mind',         color: '#4a7898', icon: '◈',  desc: 'Active cognitive workspace.' },
    // ── Emotions ─────────────────────────────────────────────────────────
    { name: 'Emotion',          cat: 'Emotional',    color: '#ff66aa', icon: '♥',  desc: 'The full spectrum of felt experience.' },
    { name: 'Regulation',       cat: 'Emotional',    color: '#ff66aa', icon: '≈',  desc: 'Managing, channeling, grounding emotion.' },
    { name: 'Channeling',       cat: 'Emotional',    color: '#ff8c22', icon: '⇀',  desc: 'Using emotion as fuel and signal.' },
    { name: 'Grounding',        cat: 'Emotional',    color: '#00ff88', icon: '↓',  desc: 'Anchoring in the present moment.' },
    { name: 'Sovereignty',      cat: 'Emotional',    color: '#d4a820', icon: '◆',  desc: 'Ownership of inner state. Self-directed response.' },
    { name: 'Shadow Work',      cat: 'Emotional',    color: '#7744ff', icon: '◑',  desc: 'Integrating disowned or unconscious parts.' },
    { name: 'Alchemy',          cat: 'Emotional',    color: '#ff8c22', icon: '⬡',  desc: 'Transforming difficult emotion into fuel or insight.' },
    { name: 'Self-Love',        cat: 'Emotional',    color: '#ff66aa', icon: '✦',  desc: 'Radical acceptance, compassion, care.' },
    { name: 'Trauma',           cat: 'Emotional',    color: '#7744ff', icon: '⚡',  desc: 'Unresolved charge from past experiences.' },
    { name: 'Need',             cat: 'Emotional',    color: '#ffe04a', icon: '▲',  desc: 'Core human needs driving behavior.' },
    { name: 'Desire',           cat: 'Emotional',    color: '#ff66aa', icon: '◉',  desc: 'Want, longing, direction of pull.' },
    { name: 'Fulfillment',      cat: 'Emotional',    color: '#00ff88', icon: '✓',  desc: 'State of meaning, completeness, satisfaction.' },
    // ── Creativity ───────────────────────────────────────────────────────
    { name: 'Creativity',       cat: 'Creative',     color: '#cc44ff', icon: '✦',  desc: 'The generative force. Novel connection-making.' },
    { name: 'Open Loop',        cat: 'Creative',     color: '#ff8c22', icon: '⟳',  desc: 'Unresolved tension driving subconscious processing.' },
    { name: 'Expansion',        cat: 'Creative',     color: '#cc44ff', icon: '↗',  desc: 'Divergent thinking, widening possibility space.' },
    { name: 'Contraction',      cat: 'Creative',     color: '#7744ff', icon: '↙',  desc: 'Convergent synthesis, compression into form.' },
    { name: 'Seed Idea',        cat: 'Creative',     color: '#00ff88', icon: '✦',  desc: 'Small nucleus with high generative potential.' },
    { name: 'What-If',          cat: 'Creative',     color: '#ffe04a', icon: '?',  desc: 'Experimental belief. Hypothetical frame.' },
    { name: 'Priming',          cat: 'Creative',     color: '#d4a820', icon: '⊡',  desc: 'Pre-loading the mind for creative output.' },
    { name: 'Flow State',       cat: 'Creative',     color: '#00c8ff', icon: '≋',  desc: 'Optimal performance zone. Effortless action.' },
    { name: 'Authenticity',     cat: 'Creative',     color: '#ff66aa', icon: '◈',  desc: 'True-to-self expression. Outside-the-box unlocked.' },
    { name: 'Inner Child',      cat: 'Creative',     color: '#ff8c22', icon: '✦',  desc: 'Playful, unfiltered, pre-conditioned self.' },
    // ── Relationships ─────────────────────────────────────────────────────
    { name: 'Relationship',     cat: 'Relational',   color: '#11ddcc', icon: '⌁',  desc: 'Connections between people and systems.' },
    { name: 'Bridge',           cat: 'Relational',   color: '#11ddcc', icon: '⟷',  desc: 'Closing gaps. Co-creating understanding.' },
    { name: 'Gap',              cat: 'Relational',   color: '#ff8c22', icon: '⟷',  desc: 'The space between states, people, ideas.' },
    { name: 'Empathy',          cat: 'Relational',   color: '#ff66aa', icon: '♥',  desc: 'Resonating with and understanding others.' },
    { name: 'Co-Creation',      cat: 'Relational',   color: '#11ddcc', icon: '⊞',  desc: 'Building together. Collaborative synthesis.' },
    { name: 'Conflict',         cat: 'Relational',   color: '#ff3355', icon: '⚡',  desc: 'Unresolved tension between entities.' },
    { name: 'Intimacy',         cat: 'Relational',   color: '#ff66aa', icon: '✦',  desc: 'Deep knowing and being known.' },
    // ── Strategy & Planning ───────────────────────────────────────────────
    { name: 'Horizon Plan',     cat: 'Strategic',    color: '#d4a820', icon: '◎',  desc: 'End-state first. Reverse-causal mapping.' },
    { name: 'Causal Chain',     cat: 'Strategic',    color: '#7744ff', icon: '→',  desc: 'Cause → effect sequences.' },
    { name: 'Constraint',       cat: 'Strategic',    color: '#ff3355', icon: '⬡',  desc: 'Current and future limiting factors.' },
    { name: 'Failure Mode',     cat: 'Strategic',    color: '#ff3355', icon: '⚡',  desc: 'How things break. Anticipatory mapping.' },
    { name: 'Leverage Point',   cat: 'Strategic',    color: '#00ff88', icon: '▲',  desc: 'Where small input yields large output.' },
    { name: 'Resource',         cat: 'Strategic',    color: '#ffe04a', icon: '◆',  desc: 'Time, money, energy, attention, capital.' },
    { name: 'Risk',             cat: 'Strategic',    color: '#ff8c22', icon: '⚡',  desc: 'Probability × impact of negative outcome.' },
    { name: 'Invariant',        cat: 'Strategic',    color: '#00c8ff', icon: '◆',  desc: 'Stable truths used for strategic reasoning.' },
    { name: 'Slope',            cat: 'Strategic',    color: '#00ff88', icon: '⇀',  desc: 'Rate of improvement over time.' },
    // ── Learning ─────────────────────────────────────────────────────────
    { name: 'Learning',         cat: 'Growth',       color: '#00c8ff', icon: '∞',  desc: 'Acquisition and integration of knowledge.' },
    { name: 'Integration',      cat: 'Growth',       color: '#11ddcc', icon: '◎',  desc: 'Embedding learning into long-term patterns.' },
    { name: 'Delta Tracking',   cat: 'Growth',       color: '#ffe04a', icon: 'Δ',  desc: 'Measuring growth between states over time.' },
    { name: 'Skill Building',   cat: 'Growth',       color: '#00ff88', icon: '▲',  desc: 'Deliberate improvement of capability.' },
    { name: 'Pattern Recognition', cat: 'Growth',    color: '#cc44ff', icon: '⬢',  desc: 'Training the ability to see structure.' },
    { name: 'Cognitive Piggyback', cat: 'Growth',    color: '#7744ff', icon: '∞',  desc: 'Leveraging existing patterns for new learning.' },
    // ── Embodiment ───────────────────────────────────────────────────────
    { name: 'Embodiment',       cat: 'Body',         color: '#00ff88', icon: '◎',  desc: 'Living in and through the body.' },
    { name: 'Somatic',          cat: 'Body',         color: '#00ff88', icon: '≋',  desc: 'Body-based processing and sensation.' },
    { name: 'Energy',           cat: 'Body',         color: '#ffe04a', icon: '⚡',  desc: 'Vitality, life force, physical resource.' },
    { name: 'Sleep',            cat: 'Body',         color: '#7744ff', icon: '≈',  desc: 'The great integrator and consolidator.' },
    { name: 'Rhythm',           cat: 'Body',         color: '#11ddcc', icon: '≋',  desc: 'Natural oscillation cycles in mind and body.' },
    // ── Framework (James's) ───────────────────────────────────────────────
    { name: 'Oscillatory Loop', cat: 'Framework',    color: '#00c8ff', icon: '↺',  desc: 'Resolution ↔ Insight feedback cycle.' },
    { name: 'Tension as Fuel',  cat: 'Framework',    color: '#ff8c22', icon: '⚡',  desc: 'Generating, amplifying, channeling tension.' },
    { name: 'Signal/Noise',     cat: 'Framework',    color: '#00ff88', icon: '◉',  desc: 'Alignment × Fidelity × Expansion filter.' },
    { name: 'Creative Sandbox', cat: 'Framework',    color: '#cc44ff', icon: '✦',  desc: 'Perfection-free generative space.' },
    { name: 'Hostile Verify',   cat: 'Framework',    color: '#ff3355', icon: '⬡',  desc: 'Adversarial testing. Friction for construction.' },
    { name: 'Emergent Synth',   cat: 'Framework',    color: '#11ddcc', icon: '◎',  desc: 'Unexpected outputs from system interaction.' },
    // ── Meta/System ───────────────────────────────────────────────────────
    { name: 'Identity',         cat: 'Meta',         color: '#d4a820', icon: '◈',  desc: 'The self-model. Who you are choosing to become.' },
    { name: 'Meaning',          cat: 'Meta',         color: '#ff66aa', icon: '✦',  desc: 'Personal significance, purpose, coherence.' },
    { name: 'Philosophy',       cat: 'Meta',         color: '#7744ff', icon: '∞',  desc: 'Core operating beliefs and world-model.' },
    { name: 'Value',            cat: 'Meta',         color: '#d4a820', icon: '◆',  desc: 'Deep driver. Non-negotiable orientation.' },
    { name: 'Custom',           cat: 'Custom',       color: '#aaaaaa', icon: '✎',  desc: 'User-defined domain.' },
  ];

  function _colorForCat(cat) {
    const map = {
      Mind: '#00c8ff', Emotional: '#ff66aa', Creative: '#cc44ff',
      Relational: '#11ddcc', Strategic: '#d4a820', Growth: '#00ff88',
      Body: '#00ff88', Framework: '#ff8c22', Meta: '#7744ff', Custom: '#aaaaaa',
    };
    return map[cat] || '#aaaaaa';
  }

  return {
    SCHEMA: DOMAIN_SCHEMA,

    init() {
      DOMAIN_SCHEMA.forEach(d => {
        const slug = _MM_UTILS.slug(d.name);
        if (!_domains.has(slug)) {
          _domains.set(slug, {
            id: MMRegistry.register('domain', { label: d.name, module: 'domains', meta: { builtin: true, cat: d.cat } }),
            name: d.name,
            slug,
            color: d.color,
            icon: d.icon,
            category: d.cat,
            description: d.desc,
            parent: d.parent || null,
            builtin: true,
            nodeCount: 0,
            created: _MM_UTILS.ts(),
          });
        }
      });
    },

    define(name, opts = {}) {
      const slug = _MM_UTILS.slug(name);
      if (_domains.has(slug)) return _domains.get(slug);
      const dom = {
        id: opts.id || MMRegistry.register('domain', { label: name, module: 'domains' }),
        name,
        slug,
        color: opts.color || _colorForCat(opts.category) || '#aaaaaa',
        icon: opts.icon || '✎',
        category: opts.category || 'Custom',
        description: opts.description || '',
        parent: opts.parent || null,
        builtin: false,
        nodeCount: 0,
        created: _MM_UTILS.ts(),
      };
      _domains.set(slug, dom);
      _MM_BUS.emit('domains:define', { slug, dom });
      return dom;
    },

    get(name) { return _domains.get(_MM_UTILS.slug(name)) || null; },
    all() { return [..._domains.values()]; },
    byCategory(cat) { return [..._domains.values()].filter(d => d.category === cat); },
    categories() { return [...new Set([..._domains.values()].map(d => d.category))]; },
    colorFor(name) { return _domains.get(_MM_UTILS.slug(name))?.color || '#aaaaaa'; },
    iconFor(name) { return _domains.get(_MM_UTILS.slug(name))?.icon || '✎'; },

    export() {
      const out = {};
      _domains.forEach((v, k) => { out[k] = { ...v }; });
      return out;
    },
    import(data) {
      if (!data) return;
      Object.values(data).forEach(d => { if (!_domains.has(d.slug)) _domains.set(d.slug, d); });
    },
    stats() {
      const byCat = {};
      _domains.forEach(d => { byCat[d.category] = (byCat[d.category] || 0) + 1; });
      return { total: _domains.size, byCategory: byCat };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §6  STRUCTURED LOGGER  — Application-wide event log with levels & modules
// ─────────────────────────────────────────────────────────────────────────────

const MMLog = (() => {
  const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, critical: 4 };
  const _entries = [];
  const _maxEntries = 5000;
  let _minLevel = 1; // info+

  return {
    LEVELS,
    setLevel(l) { _minLevel = LEVELS[l] ?? 1; },

    _push(level, module, msg, data) {
      if ((LEVELS[level] ?? 0) < _minLevel) return;
      const entry = {
        id: _MM_UTILS.uuid(),
        level,
        module,
        msg,
        data: data ? _MM_UTILS.deepClone(data) : undefined,
        ts: _MM_UTILS.ts(),
        iso: _MM_UTILS.isoNow(),
        session: MMDelta.sessionId,
      };
      _entries.push(entry);
      if (_entries.length > _maxEntries) _entries.shift();
      _MM_BUS.emit('log:entry', entry);
      // Forward to console in dev mode
      if (window._MM_DEV) {
        const fn = level === 'error' || level === 'critical' ? console.error : level === 'warn' ? console.warn : console.log;
        fn(`[MM:${module.toUpperCase()}]`, msg, data || '');
      }
      // Forward warn+ to the durable, on-disk error.log (next to the vault,
      // not just this in-memory ring buffer). Fire-and-forget — a logging
      // failure must never be the thing that breaks the caller's own error
      // path. window.NXAPI is absent in browser-preview mode; that's fine,
      // this degrades to "in-memory only" there, same as before this hook
      // existed.
      if ((LEVELS[level] ?? 0) >= LEVELS.warn && window.NXAPI?.errorLogAppend) {
        const dataDir = (typeof NX_CONFIG !== 'undefined' && NX_CONFIG.dataDir) || undefined;
        window.NXAPI.errorLogAppend(dataDir, entry).catch(() => {});
      }
      return entry.id;
    },

    debug(module, msg, data) { return this._push('debug', module, msg, data); },
    info(module, msg, data)  { return this._push('info',  module, msg, data); },
    warn(module, msg, data)  { return this._push('warn',  module, msg, data); },
    error(module, msg, data) { return this._push('error', module, msg, data); },
    crit(module, msg, data)  { return this._push('critical', module, msg, data); },

    recent(n = 100) { return _entries.slice(-n).reverse(); },
    byLevel(level)  { return _entries.filter(e => e.level === level); },
    byModule(mod)   { return _entries.filter(e => e.module === mod); },
    errors()        { return _entries.filter(e => e.level === 'error' || e.level === 'critical'); },
    since(ts)       { return _entries.filter(e => e.ts >= ts); },

    export() { return [..._entries]; },
    import(arr) { if (Array.isArray(arr)) arr.forEach(e => _entries.push(e)); },
    count()  { return _entries.length; },
    stats() {
      const byLevel = {}; const byModule = {};
      _entries.forEach(e => {
        byLevel[e.level] = (byLevel[e.level] || 0) + 1;
        byModule[e.module] = (byModule[e.module] || 0) + 1;
      });
      return { total: _entries.length, byLevel, byModule };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §7  VAULT  — Encrypted, snapshot-safe persistence layer
// ─────────────────────────────────────────────────────────────────────────────

const MMVAULT_FORMAT_VERSION = '1.0.0';   // storage format, NOT the app version

const MMVault = (() => {
  // Vault keys in localStorage
  const KEYS = {
    META:      'mm_vault_meta',       // { version, created, username, encrypted, vaultId }
    DATA:      'mm_vault_data',       // serialized app state (maybe encrypted)
    SNAPSHOTS: 'mm_vault_snapshots',  // array of snapshot descriptors
    HASH:      'mm_vault_hash',       // hash of last-known-good DATA for integrity
    BACKUP:    'mm_vault_backup',     // last backup (plain)
    SETTINGS:  'mm_vault_settings',   // user settings, always unencrypted
  };

  // MMVault's own STORAGE-FORMAT version, not the application version.
  // It changes only when the shape of this scratch store changes, so it is
  // deliberately independent of package.json (§5.4 governs the app version;
  // this is a data-format number, like the vault envelope's `version: 6`).
  const VERSION = MMVAULT_FORMAT_VERSION;
  let _meta = null;
  let _dirty = false;
  let _saveTimer = null;
  let _saveLocked = false;

  function _ls(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) return localStorage.removeItem(key);
      localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
    } catch (e) { MMLog.error('vault', 'localStorage error', { key, e: e.message }); }
  }

  function _hash(str) { return _MM_UTILS.hashStr(str); }

  /**
   * Assemble the full vault payload from all MM subsystems + app state passed in.
   */
  function _assemble(appState) {
    return {
      _mm_version: VERSION,
      _mm_ts: _MM_UTILS.ts(),
      registry: MMRegistry.export(),
      delta: MMDelta.export(),
      tags: MMTags.export(),
      domains: MMDomains.export(),
      log: MMLog.export(),
      app: appState || {},
    };
  }

  /**
   * Restore all MM subsystems from a vault payload.
   */
  function _restore(payload) {
    if (!payload) return false;
    try {
      if (payload.registry) MMRegistry.import(payload.registry);
      if (payload.delta)    MMDelta.import(payload.delta);
      if (payload.tags)     MMTags.import(payload.tags);
      if (payload.domains)  MMDomains.import(payload.domains);
      if (payload.log)      MMLog.import(payload.log);
      return payload.app || {};
    } catch (e) {
      MMLog.error('vault', 'Restore failed', { e: e.message });
      return false;
    }
  }

  return {
    KEYS,

    get meta() { return _meta; },
    get isDirty() { return _dirty; },

    /**
     * Initialize vault. Call on app start.
     * Returns { isNew, meta, appState }
     */
    init() {
      try {
        const metaRaw = _ls(KEYS.META);
        if (metaRaw) {
          _meta = JSON.parse(metaRaw);
          MMLog.info('vault', `Vault found: ${_meta.vaultId}`, _meta);
          return { isNew: false, meta: _meta };
        }
      } catch (e) {
        MMLog.warn('vault', 'Meta parse error', { e: e.message });
      }
      MMLog.info('vault', 'No vault found — new user');
      return { isNew: true, meta: null };
    },

    /**
     * Create a new vault (called after user setup).
     */
    create(username, opts = {}) {
      _meta = {
        version: VERSION,
        vaultId: _MM_UTILS.uuid(),
        username,
        created: _MM_UTILS.ts(),
        modified: _MM_UTILS.ts(),
        encrypted: opts.encrypted || false,
        encAlgo: opts.encrypted ? 'AES-256-GCM' : null,
        saveCount: 0,
        lastSnapshot: null,
      };
      _ls(KEYS.META, _meta);
      MMLog.info('vault', `New vault created: ${_meta.vaultId}`, { username });
      _MM_BUS.emit('vault:created', _meta);
      return _meta;
    },

    /**
     * Save app state to vault. Pass the full app state object.
     * @param {object} appState  Serializable app state
     * @param {boolean} force    Skip dirty check
     */
    async save(appState, force = false) {
      if (_saveLocked) { MMLog.warn('vault', 'Save skipped — locked'); return false; }
      if (!_dirty && !force) return false;
      if (!_meta) { MMLog.warn('vault', 'Save skipped — no vault meta'); return false; }
      try {
        const payload = _assemble(appState);
        const serialized = JSON.stringify(payload);
        const hash = _hash(serialized);
        _ls(KEYS.DATA, serialized);
        _ls(KEYS.HASH, hash);
        _meta.modified = _MM_UTILS.ts();
        _meta.saveCount = (_meta.saveCount || 0) + 1;
        _ls(KEYS.META, _meta);
        _dirty = false;
        MMLog.info('vault', `Saved (${_meta.saveCount})`, { hash: hash.slice(0, 8) });
        _MM_BUS.emit('vault:saved', { saveCount: _meta.saveCount });
        return true;
      } catch (e) {
        MMLog.error('vault', 'Save failed', { e: e.message });
        return false;
      }
    },

    /**
     * Load vault data and restore all subsystems.
     * Returns appState (or null on failure).
     */
    load() {
      try {
        const raw = _ls(KEYS.DATA);
        if (!raw) return null;

        // Integrity check
        const storedHash = _ls(KEYS.HASH);
        if (storedHash && _hash(raw) !== storedHash) {
          MMLog.warn('vault', 'INTEGRITY MISMATCH — vault may be corrupted');
          _MM_BUS.emit('vault:integrity_fail', {});
          // Continue loading but mark
        }

        const payload = JSON.parse(raw);
        const appState = _restore(payload);
        MMLog.info('vault', 'Loaded successfully', { version: payload._mm_version });
        _MM_BUS.emit('vault:loaded', { ts: payload._mm_ts });
        return appState;
      } catch (e) {
        MMLog.error('vault', 'Load failed', { e: e.message });
        return null;
      }
    },

    /** Mark as dirty — triggers autosave on next tick. */
    dirty() {
      _dirty = true;
      _MM_BUS.emit('vault:dirty', {});
    },

    /**
     * Debounced auto-save. Call after any state change.
     * @param {function} getState  Function that returns current app state
     * @param {number}   delay     ms delay (default 2000)
     */
    autosave(getState, delay = 2000) {
      _dirty = true;
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(async () => {
        if (typeof getState === 'function') {
          await this.save(getState(), false);
        }
      }, delay);
    },

    // ── Snapshots ────────────────────────────────────────────────────────────

    /**
     * Create a named snapshot of current vault data.
     */
    snapshot(label, appState) {
      try {
        const raw = _ls(KEYS.DATA);
        if (!raw) return null;
        const snapshots = this.listSnapshots();
        const snap = {
          id: _MM_UTILS.uuid(),
          label: label || `Snapshot ${_MM_UTILS.fmtTS(_MM_UTILS.ts())}`,
          ts: _MM_UTILS.ts(),
          hash: _hash(raw),
          size: raw.length,
          vaultId: _meta?.vaultId,
        };
        // Store snapshot data inline (small vaults), keyed separately
        const snapKey = `mm_snap_${snap.id}`;
        _ls(snapKey, raw);
        snapshots.push({ ...snap, dataKey: snapKey });
        // Keep max 20 snapshots, prune oldest
        while (snapshots.length > 20) {
          const old = snapshots.shift();
          try { localStorage.removeItem(old.dataKey); } catch {}
        }
        _ls(KEYS.SNAPSHOTS, snapshots);
        if (_meta) { _meta.lastSnapshot = snap.ts; _ls(KEYS.META, _meta); }
        MMLog.info('vault', `Snapshot created: ${snap.label}`, { id: snap.id });
        _MM_BUS.emit('vault:snapshot', snap);
        return snap;
      } catch (e) {
        MMLog.error('vault', 'Snapshot failed', { e: e.message });
        return null;
      }
    },

    listSnapshots() {
      try { return JSON.parse(_ls(KEYS.SNAPSHOTS) || '[]'); } catch { return []; }
    },

    /** Restore vault data from a snapshot. Returns appState or null. */
    restoreSnapshot(snapId) {
      const snaps = this.listSnapshots();
      const snap = snaps.find(s => s.id === snapId);
      if (!snap) { MMLog.error('vault', 'Snapshot not found', { snapId }); return null; }
      try {
        _saveLocked = true;
        const raw = _ls(snap.dataKey);
        if (!raw) { _saveLocked = false; return null; }
        const payload = JSON.parse(raw);
        const appState = _restore(payload);
        // Re-save as current
        _ls(KEYS.DATA, raw);
        _ls(KEYS.HASH, _hash(raw));
        _saveLocked = false;
        MMLog.info('vault', `Restored snapshot: ${snap.label}`, { snapId });
        _MM_BUS.emit('vault:snapshot_restored', { snapId, label: snap.label });
        return appState;
      } catch (e) {
        _saveLocked = false;
        MMLog.error('vault', 'Snapshot restore failed', { e: e.message });
        return null;
      }
    },

    deleteSnapshot(snapId) {
      let snaps = this.listSnapshots();
      const snap = snaps.find(s => s.id === snapId);
      if (!snap) return false;
      try { localStorage.removeItem(snap.dataKey); } catch {}
      snaps = snaps.filter(s => s.id !== snapId);
      _ls(KEYS.SNAPSHOTS, snaps);
      return true;
    },

    // ── Integrity & Backup ───────────────────────────────────────────────────

    /** Run a full integrity check. Returns { ok, details }. */
    checkIntegrity() {
      const issues = [];
      const checks = [];
      try {
        const raw = _ls(KEYS.DATA);
        if (!raw) {
          checks.push({ name: 'data_exists', pass: false, msg: 'No vault data found' });
          return { ok: false, checks };
        }
        checks.push({ name: 'data_exists', pass: true });

        // Hash check
        const storedHash = _ls(KEYS.HASH);
        const liveHash = _hash(raw);
        const hashOk = !storedHash || storedHash === liveHash;
        checks.push({ name: 'hash_integrity', pass: hashOk, msg: hashOk ? null : 'Hash mismatch — data may be corrupted' });

        // Parse check
        let payload;
        try { payload = JSON.parse(raw); checks.push({ name: 'json_parse', pass: true }); }
        catch (e) { checks.push({ name: 'json_parse', pass: false, msg: 'JSON parse error: ' + e.message }); return { ok: false, checks }; }

        // Version check
        checks.push({ name: 'version', pass: !!payload._mm_version, msg: payload._mm_version ? null : 'Missing version field' });

        // Registry check
        const regOk = payload.registry && typeof payload.registry === 'object';
        checks.push({ name: 'registry', pass: regOk, msg: regOk ? null : 'Registry missing or invalid' });

        // Delta check
        const deltaOk = Array.isArray(payload.delta);
        checks.push({ name: 'delta_ledger', pass: deltaOk, msg: deltaOk ? null : 'Delta ledger not an array' });

        // App state check
        checks.push({ name: 'app_state', pass: !!payload.app, msg: payload.app ? null : 'App state empty' });

        const ok = checks.every(c => c.pass);
        MMLog.info('vault', `Integrity check: ${ok ? 'PASS' : 'FAIL'}`, { checks });
        return { ok, checks };
      } catch (e) {
        MMLog.error('vault', 'Integrity check error', { e: e.message });
        return { ok: false, checks, error: e.message };
      }
    },

    /** Create a plain backup (unencrypted, for export/download). */
    exportBackup(appState) {
      const payload = _assemble(appState);
      return JSON.stringify(payload, null, 2);
    },

    /** Import a backup (replaces current vault data). Returns appState or null. */
    importBackup(jsonStr) {
      try {
        const payload = JSON.parse(jsonStr);
        if (!payload._mm_version) throw new Error('Not a Mastermind backup');
        const appState = _restore(payload);
        _ls(KEYS.DATA, jsonStr);
        _ls(KEYS.HASH, _hash(jsonStr));
        MMLog.info('vault', 'Backup imported', { version: payload._mm_version });
        _MM_BUS.emit('vault:backup_imported', {});
        return appState;
      } catch (e) {
        MMLog.error('vault', 'Backup import failed', { e: e.message });
        return null;
      }
    },

    /** Download vault data as a .json file. */
    downloadBackup(appState, filename) {
      const data = this.exportBackup(appState);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `mastermind-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },

    // ── Settings ─────────────────────────────────────────────────────────────

    getSetting(key, def = null) {
      try {
        const s = JSON.parse(_ls(KEYS.SETTINGS) || '{}');
        return s[key] !== undefined ? s[key] : def;
      } catch { return def; }
    },
    setSetting(key, val) {
      try {
        const s = JSON.parse(_ls(KEYS.SETTINGS) || '{}');
        s[key] = val;
        _ls(KEYS.SETTINGS, s);
      } catch {}
    },
    getAllSettings() {
      try { return JSON.parse(_ls(KEYS.SETTINGS) || '{}'); } catch { return {}; }
    },

    stats() {
      const raw = _ls(KEYS.DATA) || '';
      return {
        size: raw.length,
        sizeKB: (raw.length / 1024).toFixed(1),
        saveCount: _meta?.saveCount || 0,
        snapshotCount: this.listSnapshots().length,
        isDirty: _dirty,
        isLocked: _saveLocked,
        vaultId: _meta?.vaultId || null,
        lastModified: _meta?.modified || null,
      };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §8  RIPPLE DETECTION  — Detect cascading effects of changes
// ─────────────────────────────────────────────────────────────────────────────

const MMRipple = (() => {
  // Tracks entity → dependents relationships
  // A "ripple" occurs when entity A changes and we want to know what else might be affected
  const _deps = new Map(); // entityId → Set<dependentId>
  const _rdeps = new Map(); // entityId → Set<dependentOn>

  return {
    /** Declare that B depends on A. */
    depend(dependentId, dependsOnId) {
      if (!_deps.has(dependsOnId)) _deps.set(dependsOnId, new Set());
      _deps.get(dependsOnId).add(dependentId);
      if (!_rdeps.has(dependentId)) _rdeps.set(dependentId, new Set());
      _rdeps.get(dependentId).add(dependsOnId);
    },

    undepend(dependentId, dependsOnId) {
      _deps.get(dependsOnId)?.delete(dependentId);
      _rdeps.get(dependentId)?.delete(dependsOnId);
    },

    /** Get all entities affected (directly + transitively) by a change to entityId. */
    ripple(entityId, depth = 3) {
      const visited = new Set();
      const wave = [[entityId]];
      for (let d = 0; d < depth; d++) {
        const front = wave[wave.length - 1];
        const next = [];
        front.forEach(id => {
          (_deps.get(id) || []).forEach(dep => {
            if (!visited.has(dep)) { next.push(dep); visited.add(dep); }
          });
        });
        if (!next.length) break;
        wave.push(next);
      }
      return { source: entityId, waves: wave.slice(1), affected: [...visited] };
    },

    /** Get direct dependents of an entity. */
    dependents(entityId) { return [...(_deps.get(entityId) || [])]; },
    /** Get what an entity depends on. */
    dependsOn(entityId) { return [...(_rdeps.get(entityId) || [])]; },

    stats() {
      return {
        entities: _deps.size,
        totalLinks: [..._deps.values()].reduce((s, v) => s + v.size, 0),
      };
    },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §9  DIAGNOSTIC TOOL
// ─────────────────────────────────────────────────────────────────────────────

const MMDiag = (() => {
  const _tests = [];
  const _results = [];

  function _addTest(id, module, name, fn) {
    _tests.push({ id, module, name, fn });
  }

  // Built-in tests
  function _registerBuiltins() {
    // Storage
    _addTest('st_01', 'storage', 'localStorage available', () => {
      try { localStorage.setItem('_mm_diag', '1'); localStorage.removeItem('_mm_diag'); return { pass: true }; }
      catch (e) { return { pass: false, msg: e.message }; }
    });
    _addTest('st_02', 'storage', 'Vault meta exists', () => {
      const m = localStorage.getItem('mm_vault_meta');
      return m ? { pass: true } : { pass: false, msg: 'No vault meta — new user or corrupted' };
    });
    _addTest('st_03', 'storage', 'Vault data exists', () => {
      const d = localStorage.getItem('mm_vault_data');
      return d ? { pass: true, info: `${(d.length/1024).toFixed(1)}KB` } : { pass: false, msg: 'No vault data' };
    });
    _addTest('st_04', 'storage', 'Vault integrity hash', () => {
      const r = MMVault.checkIntegrity();
      const hc = r.checks.find(c => c.name === 'hash_integrity');
      return hc ? { pass: hc.pass, msg: hc.msg } : { pass: false, msg: 'Could not run hash check' };
    });
    _addTest('st_05', 'storage', 'JSON parse vault data', () => {
      const r = MMVault.checkIntegrity();
      const jc = r.checks.find(c => c.name === 'json_parse');
      return jc ? { pass: jc.pass, msg: jc.msg } : { pass: false, msg: 'Could not parse' };
    });

    // Registry
    _addTest('re_01', 'registry', 'Registry has entries', () => {
      const s = MMRegistry.stats();
      return s.total > 0 ? { pass: true, info: `${s.total} entries` } : { pass: false, msg: 'Registry empty' };
    });
    _addTest('re_02', 'registry', 'No orphan deltas', () => {
      const deltas = MMDelta.recent(500);
      const orphans = deltas.filter(d => !MMRegistry.exists(d.entityId));
      return orphans.length === 0 ? { pass: true } : { pass: false, msg: `${orphans.length} orphan deltas`, info: orphans.slice(0,3).map(d=>d.entityId) };
    });
    _addTest('re_03', 'registry', 'Registry export/import roundtrip', () => {
      try {
        const exp = MMRegistry.export();
        const count = Object.keys(exp).length;
        return { pass: count > 0, info: `${count} entries` };
      } catch (e) { return { pass: false, msg: e.message }; }
    });

    // Tags
    _addTest('tg_01', 'tags', 'Tags initialized', () => {
      const s = MMTags.stats();
      return s.total > 0 ? { pass: true, info: `${s.total} tags` } : { pass: false, msg: 'No tags defined' };
    });
    _addTest('tg_02', 'tags', 'Built-in tags present', () => {
      const active = MMTags.getTag('active');
      return active ? { pass: true } : { pass: false, msg: '"active" tag not found' };
    });

    // Domains
    _addTest('dm_01', 'domains', 'Domains initialized', () => {
      const s = MMDomains.stats();
      return s.total > 0 ? { pass: true, info: `${s.total} domains` } : { pass: false, msg: 'No domains' };
    });
    _addTest('dm_02', 'domains', 'Core domains present', () => {
      const meta = MMDomains.get('metacognition');
      return meta ? { pass: true } : { pass: false, msg: 'Metacognition domain missing' };
    });

    // Delta
    _addTest('dl_01', 'delta', 'Delta ledger accessible', () => {
      const s = MMDelta.stats();
      return { pass: true, info: `${s.total} deltas` };
    });

    // Log
    _addTest('lg_01', 'log', 'Logger has entries', () => {
      const s = MMLog.stats();
      return { pass: true, info: `${s.total} entries` };
    });
    _addTest('lg_02', 'log', 'No critical errors', () => {
      const crits = MMLog.byLevel('critical');
      return crits.length === 0
        ? { pass: true }
        : { pass: false, msg: `${crits.length} critical errors`, info: crits.slice(0,2).map(e=>e.msg) };
    });

    // Crypto
    _addTest('cr_01', 'crypto', 'SubtleCrypto available', () => {
      const ok = !!(window.crypto && window.crypto.subtle);
      return ok ? { pass: true } : { pass: false, msg: 'SubtleCrypto not available' };
    });
    _addTest('cr_02', 'crypto', 'UUID generation', () => {
      const id = _MM_UTILS.uuid();
      return /^[0-9a-f-]{36}$/.test(id) ? { pass: true } : { pass: false, msg: 'UUID format invalid' };
    });

    // Snapshots
    _addTest('sn_01', 'snapshots', 'Snapshot list accessible', () => {
      const snaps = MMVault.listSnapshots();
      return { pass: true, info: `${snaps.length} snapshots` };
    });

    // Event bus
    _addTest('eb_01', 'bus', 'Event bus functional', () => {
      let fired = false;
      const unsub = _MM_BUS.on('_diag_test', () => { fired = true; });
      _MM_BUS.emit('_diag_test');
      unsub();
      return fired ? { pass: true } : { pass: false, msg: 'Event bus not firing' };
    });
  }

  return {
    addTest(id, module, name, fn) { _addTest(id, module, name, fn); },

    async runAll(opts = {}) {
      _results.length = 0;
      const filter = opts.module || null;
      const tests = filter ? _tests.filter(t => t.module === filter) : _tests;
      for (const t of tests) {
        let result;
        try { result = await t.fn(); }
        catch (e) { result = { pass: false, msg: 'Test threw: ' + e.message }; }
        _results.push({ ...t, ...result, ts: _MM_UTILS.ts() });
      }
      const pass = _results.filter(r => r.pass).length;
      const fail = _results.filter(r => !r.pass).length;
      MMLog.info('diag', `Run complete: ${pass}/${_results.length} pass`, { fail });
      _MM_BUS.emit('diag:run', { total: _results.length, pass, fail });
      return { total: _results.length, pass, fail, results: [..._results] };
    },

    lastResults() { return [..._results]; },
    init() { _registerBuiltins(); },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §10  TOAST NOTIFICATION SYSTEM  (upgraded from nexus-engine's basic toast)
// ─────────────────────────────────────────────────────────────────────────────

const MMToast = (() => {
  const _queue = [];
  let _active = false;
  let _el = null;

  function _getEl() {
    if (_el && document.body.contains(_el)) return _el;
    _el = document.getElementById('toast');
    if (!_el) {
      _el = document.createElement('div');
      _el.id = 'toast';
      document.body.appendChild(_el);
    }
    return _el;
  }

  function _show(item) {
    _active = true;
    const el = _getEl();
    const icon = item.type === 'error' ? '⚡' : item.type === 'warn' ? '⚠' : item.type === 'success' ? '✓' : '◈';
    const color = item.type === 'error' ? 'var(--r)' : item.type === 'warn' ? 'var(--o)' : item.type === 'success' ? 'var(--g)' : 'var(--bright)';
    el.style.borderColor = item.type === 'error' ? 'var(--r)' : item.type === 'warn' ? 'rgba(255,140,34,.4)' : 'var(--wire2)';
    el.style.color = color;
    el.textContent = `${icon} ${item.msg}`;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => {
        _active = false;
        if (_queue.length) _show(_queue.shift());
      }, 250);
    }, item.duration || 2500);
  }

  return {
    show(msg, type = 'info', duration = 2500) {
      const item = { msg, type, duration };
      if (_active) _queue.push(item);
      else _show(item);
    },
    info(msg)    { this.show(msg, 'info'); },
    success(msg) { this.show(msg, 'success'); },
    warn(msg)    { this.show(msg, 'warn', 3500); },
    error(msg)   { this.show(msg, 'error', 4000); },
  };
})();

// ─────────────────────────────────────────────────────────────────────────────
// §11  TAGS UI  — Front-end tag editor/manager (auto-attaches to DOM)
// ─────────────────────────────────────────────────────────────────────────────

const MMTagsUI = (() => {
  let _currentEntityId = null;

  function _renderPill(tagDef, entityId) {
    const pill = document.createElement('span');
    pill.className = 'mm-tag-pill';
    pill.style.cssText = `color:${tagDef.color};border-color:${tagDef.color}44;background:${tagDef.color}11`;
    pill.innerHTML = `<span class="mm-tag-label">${_MM_UTILS.escH(tagDef.name)}</span><span class="mm-tag-remove" title="Remove tag" onclick="MMTagsUI.removeTag('${entityId}','${tagDef.slug}',this.closest('.mm-tag-pill'))">✕</span>`;
    return pill;
  }

  return {
    /** Render tag pills for a given entity into a container element. */
    renderPills(entityId, container) {
      if (!container) return;
      _currentEntityId = entityId;
      container.innerHTML = '';
      const tags = MMTags.forEntity(entityId);
      tags.forEach(t => container.appendChild(_renderPill(t, entityId)));
      // Add-tag input
      const addWrap = document.createElement('div');
      addWrap.className = 'mm-tag-add-wrap';
      addWrap.innerHTML = `
        <input class="mm-tag-input" placeholder="+ tag" type="text" id="mm-tag-input-${entityId}"
          onkeydown="if(event.key==='Enter'||event.key===','){event.preventDefault();MMTagsUI.addTagFromInput('${entityId}',this)}"
          oninput="MMTagsUI.suggest(this.value,'${entityId}',this)"
        >
        <div class="mm-tag-suggest" id="mm-tag-suggest-${entityId}"></div>
      `;
      container.appendChild(addWrap);
    },

    addTagFromInput(entityId, input) {
      const val = input.value.trim().replace(/,/g, '');
      if (!val) return;
      const added = MMTags.tag(entityId, val);
      input.value = '';
      this.hideSuggest(entityId);
      if (added) {
        // Update UI
        const container = input.closest('.mm-tags-container, .node-tags, [data-tag-container]');
        if (container) this.renderPills(entityId, container);
        MMVault.dirty();
        MMDelta.push(entityId, 'tag_add', null, val, { source: 'ui' });
        _MM_BUS.emit('tags:updated', { entityId });
      }
    },

    removeTag(entityId, slug, pillEl) {
      MMTags.untag(entityId, slug);
      if (pillEl) pillEl.remove();
      MMVault.dirty();
      _MM_BUS.emit('tags:updated', { entityId });
    },

    suggest(query, entityId, inputEl) {
      const suggestEl = document.getElementById(`mm-tag-suggest-${entityId}`);
      if (!suggestEl) return;
      if (!query || query.length < 1) { suggestEl.innerHTML = ''; return; }
      const q = query.toLowerCase();
      const matches = MMTags.allTags()
        .filter(t => t.name.toLowerCase().includes(q))
        .slice(0, 8);
      suggestEl.innerHTML = matches.map(t =>
        `<div class="mm-tag-suggest-item" onclick="MMTagsUI.pickSuggest('${entityId}','${t.name}',document.getElementById('mm-tag-input-${entityId}'))"
          style="border-left:2px solid ${t.color}">
          <span style="color:${t.color}">${_MM_UTILS.escH(t.name)}</span>
          <span class="mm-tag-cat">${t.category}</span>
        </div>`
      ).join('');
    },

    pickSuggest(entityId, tagName, inputEl) {
      if (inputEl) { inputEl.value = tagName; this.addTagFromInput(entityId, inputEl); }
    },

    hideSuggest(entityId) {
      const el = document.getElementById(`mm-tag-suggest-${entityId}`);
      if (el) el.innerHTML = '';
    },

    /** Open full tag manager modal. */
    openManager() {
      let modal = document.getElementById('mm-tag-manager');
      if (modal) { modal.classList.add('open'); this._renderManager(); return; }
      // Build modal
      modal = document.createElement('div');
      modal.id = 'mm-tag-manager';
      modal.innerHTML = `
        <div class="mm-modal-backdrop" onclick="MMTagsUI.closeManager()"></div>
        <div class="mm-modal-box">
          <div class="mm-modal-head">
            <span class="mm-modal-title">TAG MANAGER</span>
            <span style="font-family:var(--f-mono);font-size:7px;color:var(--dim);letter-spacing:2px">All tags · sort · filter · create</span>
            <button class="mm-modal-close" onclick="MMTagsUI.closeManager()">✕</button>
          </div>
          <div class="mm-modal-toolbar">
            <input type="text" id="mm-tm-search" class="mm-tm-search" placeholder="Search tags..." oninput="MMTagsUI._renderManager()">
            <select id="mm-tm-cat-filter" class="mm-tm-cat-filter" onchange="MMTagsUI._renderManager()">
              <option value="">All categories</option>
              ${Object.entries(MMTags.CATEGORIES).map(([k,v]) =>
                `<option value="${k}">${v.label}</option>`
              ).join('')}
            </select>
            <select id="mm-tm-sort" class="mm-tm-sort" onchange="MMTagsUI._renderManager()">
              <option value="count">By Usage</option>
              <option value="name">By Name</option>
              <option value="created">By Created</option>
            </select>
          </div>
          <div class="mm-modal-body" id="mm-tm-body"></div>
          <div class="mm-modal-footer">
            <div class="mm-tm-create">
              <input type="text" id="mm-tm-new-name" class="mm-tm-new-input" placeholder="New tag name...">
              <select id="mm-tm-new-cat" class="mm-tm-cat-filter">
                ${Object.entries(MMTags.CATEGORIES).map(([k,v]) =>
                  `<option value="${k}">${v.label}</option>`
                ).join('')}
              </select>
              <input type="color" id="mm-tm-new-color" value="#00c8ff" style="width:32px;height:28px;border:none;background:none;cursor:pointer">
              <button class="mm-tm-create-btn" onclick="MMTagsUI.createTag()">+ CREATE</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      modal.classList.add('open');
      this._renderManager();
    },

    _renderManager() {
      const body = document.getElementById('mm-tm-body');
      if (!body) return;
      const q = (document.getElementById('mm-tm-search')?.value || '').toLowerCase();
      const cat = document.getElementById('mm-tm-cat-filter')?.value || '';
      const sort = document.getElementById('mm-tm-sort')?.value || 'count';
      let tags = MMTags.allTags();
      if (q) tags = tags.filter(t => t.name.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q));
      if (cat) tags = tags.filter(t => t.category === cat);
      if (sort === 'count') tags.sort((a,b) => b.count - a.count);
      else if (sort === 'name') tags.sort((a,b) => a.name.localeCompare(b.name));
      else tags.sort((a,b) => (b.created||0) - (a.created||0));
      const catDef = MMTags.CATEGORIES;
      body.innerHTML = tags.length ? `
        <div class="mm-tm-grid">
          ${tags.map(t => `
            <div class="mm-tm-tag-row" style="border-left:2px solid ${t.color}">
              <div class="mm-tm-tag-name" style="color:${t.color}">${_MM_UTILS.escH(t.name)}</div>
              <div class="mm-tm-tag-cat">${catDef[t.category]?.label || t.category}</div>
              <div class="mm-tm-tag-count">${t.count} uses</div>
              <div class="mm-tm-tag-desc">${_MM_UTILS.escH(t.description || '')}</div>
              ${t.builtin ? '<div class="mm-tm-builtin">BUILT-IN</div>' : `
                <button class="mm-tm-del-btn" onclick="MMTagsUI.deleteTag('${_MM_UTILS.escH(t.slug)}')">✕</button>
              `}
            </div>
          `).join('')}
        </div>
      ` : `<div class="mm-tm-empty">No tags found</div>`;
    },

    createTag() {
      const name = document.getElementById('mm-tm-new-name')?.value.trim();
      const cat = document.getElementById('mm-tm-new-cat')?.value || 'custom';
      const color = document.getElementById('mm-tm-new-color')?.value || '#aaaaaa';
      if (!name) { MMToast.warn('Enter a tag name'); return; }
      MMTags.define(name, { category: cat, color });
      if (document.getElementById('mm-tm-new-name')) document.getElementById('mm-tm-new-name').value = '';
      this._renderManager();
      MMToast.success(`Tag created: ${name}`);
    },

    deleteTag(slug) {
      // Can't delete built-in tags
      const t = MMTags.getTag(slug);
      if (!t) return;
      if (t.builtin) { MMToast.warn('Cannot delete built-in tags'); return; }
      _tags_raw_delete(slug); // handled below
      this._renderManager();
      MMToast.info('Tag deleted');
    },

    closeManager() {
      const m = document.getElementById('mm-tag-manager');
      if (m) m.classList.remove('open');
    },

    /** Inject required CSS. */
    injectCSS() {
      if (document.getElementById('mm-tags-css')) return;
      const style = document.createElement('style');
      style.id = 'mm-tags-css';
      style.textContent = `
        /* ── Tag Pills ── */
        .mm-tag-pill {
          display:inline-flex;align-items:center;gap:3px;
          font-family:var(--f-mono);font-size:6px;letter-spacing:.6px;
          padding:2px 5px 2px 6px;border:1px solid;text-transform:uppercase;
          cursor:default;transition:opacity .12s;flex-shrink:0;
        }
        .mm-tag-pill:hover { opacity:1; }
        .mm-tag-remove {
          font-size:8px;cursor:pointer;opacity:.4;transition:opacity .1s;
          line-height:1;padding:0 1px;flex-shrink:0;
        }
        .mm-tag-remove:hover { opacity:1;color:var(--r); }
        .mm-tag-add-wrap { position:relative;display:inline-block; }
        .mm-tag-input {
          background:transparent;border:1px dashed var(--wire2);
          color:var(--muted);font-family:var(--f-mono);font-size:7px;
          padding:2px 7px;outline:none;width:70px;transition:all .15s;
          letter-spacing:.5px;
        }
        .mm-tag-input:focus { border-color:var(--c);color:var(--bright);width:100px; }
        .mm-tag-suggest {
          position:absolute;bottom:calc(100% + 4px);left:0;z-index:9999;
          background:var(--deep);border:1px solid var(--wire2);
          min-width:140px;max-height:180px;overflow-y:auto;
        }
        .mm-tag-suggest-item {
          padding:5px 10px;cursor:pointer;display:flex;align-items:center;
          justify-content:space-between;gap:8px;
          font-family:var(--f-mono);font-size:8px;transition:background .1s;
          border-left:2px solid transparent;
        }
        .mm-tag-suggest-item:hover { background:var(--lift); }
        .mm-tag-cat { font-size:6px;color:var(--dim);letter-spacing:1px; }

        /* ── Tag Manager Modal ── */
        #mm-tag-manager { position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center; }
        #mm-tag-manager.open { display:flex; }
        .mm-modal-backdrop { position:absolute;inset:0;background:rgba(0,0,0,.85);backdrop-filter:blur(4px); }
        .mm-modal-box {
          position:relative;width:min(820px,96vw);max-height:88vh;
          background:var(--deep);border:1px solid var(--wire2);
          display:flex;flex-direction:column;
          box-shadow:0 20px 80px rgba(0,0,0,.9);
        }
        .mm-modal-head {
          display:flex;align-items:center;gap:12px;padding:14px 18px;
          border-bottom:1px solid var(--wire2);flex-shrink:0;
        }
        .mm-modal-title { font-family:var(--f-display);font-size:12px;font-weight:800;letter-spacing:4px;color:var(--white); }
        .mm-modal-close {
          margin-left:auto;background:transparent;border:none;color:var(--dim);
          cursor:pointer;font-size:12px;padding:4px 8px;transition:color .15s;
        }
        .mm-modal-close:hover { color:var(--r); }
        .mm-modal-toolbar {
          display:flex;align-items:center;gap:8px;padding:10px 16px;
          border-bottom:1px solid var(--wire);flex-shrink:0;flex-wrap:wrap;
        }
        .mm-tm-search {
          flex:1;min-width:140px;background:var(--abyss);border:1px solid var(--wire2);
          color:var(--bright);font-family:var(--f-mono);font-size:9px;
          padding:6px 10px;outline:none;
        }
        .mm-tm-search:focus { border-color:var(--c); }
        .mm-tm-cat-filter,.mm-tm-sort {
          background:var(--deep);border:1px solid var(--wire2);color:var(--muted);
          font-family:var(--f-mono);font-size:8px;padding:6px 10px;cursor:pointer;
        }
        .mm-modal-body { flex:1;overflow-y:auto;padding:12px 16px; }
        .mm-tm-grid { display:flex;flex-direction:column;gap:3px; }
        .mm-tm-tag-row {
          display:flex;align-items:center;gap:12px;padding:7px 12px;
          background:rgba(0,0,0,.2);border-left:2px solid var(--wire2);
          font-family:var(--f-mono);font-size:8px;flex-wrap:wrap;
        }
        .mm-tm-tag-name { font-weight:700;letter-spacing:1px;min-width:100px; }
        .mm-tm-tag-cat { color:var(--dim);font-size:6.5px;letter-spacing:1px;text-transform:uppercase; }
        .mm-tm-tag-count { color:var(--dim);font-size:7px;min-width:50px; }
        .mm-tm-tag-desc { flex:1;color:var(--dim);font-size:7px;line-height:1.5; }
        .mm-tm-builtin { color:var(--dim);font-size:6px;border:1px solid var(--wire2);padding:1px 5px; }
        .mm-tm-del-btn {
          background:transparent;border:1px solid rgba(255,51,85,.3);color:var(--r);
          cursor:pointer;font-size:8px;padding:2px 7px;transition:all .15s;
        }
        .mm-tm-del-btn:hover { background:rgba(255,51,85,.1); }
        .mm-tm-empty { text-align:center;color:var(--dim);font-family:var(--f-mono);font-size:8px;padding:40px; }
        .mm-modal-footer {
          padding:10px 16px;border-top:1px solid var(--wire);flex-shrink:0;
        }
        .mm-tm-create { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
        .mm-tm-new-input {
          flex:1;min-width:140px;background:var(--abyss);border:1px solid var(--wire2);
          color:var(--bright);font-family:var(--f-mono);font-size:9px;
          padding:7px 10px;outline:none;
        }
        .mm-tm-new-input:focus { border-color:var(--c); }
        .mm-tm-create-btn {
          padding:7px 16px;background:transparent;border:1px solid var(--c);
          color:var(--c);cursor:pointer;font-family:var(--f-mono);
          font-size:8px;letter-spacing:1px;transition:all .18s;
        }
        .mm-tm-create-btn:hover { background:rgba(0,200,255,.1); }
      `;
      document.head.appendChild(style);
    },
  };
})();

// Expose raw delete for tag manager (internal bridge)
function _tags_raw_delete(slug) {
  // We access internal state via MMTags public API — recreate without the slug
  // This is a controlled bridge; MMTags can expose a delete method
  // For now: best effort by removing from entity lists
  MMTags.allTags().forEach(t => {
    if (t.slug === slug) {
      // Mark as removed
      Object.assign(t, { _deleted: true, count: 0 });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §12  MAIN FACADE  — Single entry point for the engine + backwards compat
// ─────────────────────────────────────────────────────────────────────────────

const MM = {
  registry: MMRegistry,
  delta:    MMDelta,
  tags:     MMTags,
  domains:  MMDomains,
  vault:    MMVault,
  log:      MMLog,
  ripple:   MMRipple,
  diag:     MMDiag,
  toast:    MMToast,
  tagsUI:   MMTagsUI,
  bus:      _MM_BUS,
  utils:    _MM_UTILS,

  /** Initialize all subsystems. Call once on page load. */
  init() {
    MMLog.info('core', 'Mastermind Foundation Engine v1.0 — init');
    MMDomains.init();
    MMTags.init();
    MMDiag.init();
    MMTagsUI.injectCSS();
    MMLog.info('core', `Domains: ${MMDomains.stats().total} | Tags: ${MMTags.stats().total}`);
    _MM_BUS.emit('mm:ready', {});
    return this;
  },

  // ── Backwards-compat shims for existing nexus-engine.js calls ──────────────

  /**
   * vaultSave — called by nexus-engine's saveCanvas().
   * Pass the full app state (nodes, conns, etc).
   */
  async vaultSave(appState, force = true) {
    return MMVault.save(appState, force);
  },

  /**
   * vaultDirtySave — debounced autosave shim.
   */
  vaultDirtySave(getState, delay = 2000) {
    MMVault.autosave(getState, delay);
  },

  /**
   * vaultLoad — called on app start.
   */
  vaultLoad() {
    return MMVault.load();
  },

  // ── JAA compatibility layer ────────────────────────────────────────────────
  // Maps old JAA API to new MM foundation.
  _jaaCompat() {
    window.JAA = {
      ledger: { get: id => MMRegistry.get(id), has: id => MMRegistry.exists(id) },
      _log: { get count() { return MMDelta.count(); }, get entries() { return MMDelta.recent(500); } },
      register(id, type, meta = {}) {
        if (MMRegistry.exists(id)) { MMRegistry.update(id, { label: meta.title || '', meta }); }
        else { MMRegistry.register(type, { id, label: meta.title || '', module: meta.module || 'canvas', meta }); }
      },
      delta(id, from, to, action) {
        if (!MMRegistry.exists(id)) this.register(id, 'node', {});
        MMDelta.push(id, action || 'edit', from, to);
      },
      getDeltas(id) { return MMDelta.forEntity(id); },
      getLog() { return { count: MMDelta.count(), entries: MMDelta.recent(100) }; },
      setDataDir(dir) { MMVault.setSetting('dataDir', dir); },
      async saveCanvas(data) { return MMVault.save(data, true); },
      async loadCanvas() { return MMVault.load(); },
    };
    MMLog.info('core', 'JAA compatibility layer installed');
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// §13  BOOTSTRAP  — Auto-init on DOMContentLoaded
// ─────────────────────────────────────────────────────────────────────────────

(function _bootstrap() {
  function _run() {
    MM.init();
    MM._jaaCompat();
    // ── DO NOT re-add vaultSave / vaultDirtySave / vaultLoad shims ───────────
    // These three lines used to point the whole app at MMVault, which is a
    // localStorage store. Because _run() fires on DOMContentLoaded — after
    // every script has executed — they silently overwrote the real functions
    // in foundation/vault/mastermind-vault.js, which are top-level function
    // declarations and therefore properties of window.
    //
    // Consequences while this was live:
    //   • Nothing was ever written to mastermind.vault. The file stayed at
    //     its initial empty size while localStorage grew.
    //   • Every autosave was a hard no-op. Call sites pass a NUMBER
    //     (vaultDirtySave(4000)); the shim read arg 1 as `getState` and
    //     MMVault.autosave bailed on `typeof getState === 'function'`.
    //   • saveCanvas() → vaultSave(true) stored the boolean `true` as the
    //     entire app state, in plaintext.
    //
    // MMVault remains the store for registry/delta/tags scratch state only.
    // Vault persistence belongs to foundation/vault/mastermind-vault.js and
    // goes to the encrypted file. Nothing else may claim these names.
    if (typeof window.vaultSave !== 'function') {
      MMLog.error('core', 'vaultSave missing — mastermind-vault.js failed to load. Persistence is OFFLINE.');
    }
    // Expose globally for backward compat
    window.MM = MM;
    window.MMVault = MMVault;
    window.MMRegistry = MMRegistry;
    window.MMDelta = MMDelta;
    window.MMTags = MMTags;
    window.MMDomains = MMDomains;
    window.MMLog = MMLog;
    window.MMRipple = MMRipple;
    window.MMDiag = MMDiag;
    window.MMToast = MMToast;
    window.MMTagsUI = MMTagsUI;
    window._MM_BUS = _MM_BUS;
    // Forward toast() calls (nexus-engine uses global toast())
    if (typeof window.toast !== 'function') {
      window.toast = (msg) => MMToast.info(msg);
    }
    console.info('[MM] Foundation Engine ready. MM, MMVault, MMRegistry, MMDelta, MMTags, MMDomains, MMLog, MMDiag, MMRipple exposed globally.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _run);
  } else {
    _run();
  }
})();
