/**
 * IdeaStore — JSONL-backed idea ledger + associative lattice.
 *
 * Two files:
 *   ideas.jsonl     — one idea per line
 *   lattice.jsonl   — one association edge per line
 *
 * The lattice is a directed graph: ideas as nodes, edges typed.
 * Edge types: 'related' | 'refines' | 'contradicts' | 'implements' | 'spawns'
 *
 * §7.1 Dual ledger — Idea Ledger (cognition layer)
 * §7.2 Ideas cannot affect runtime. Cognition layer is read-only to the system.
 * §7.3 Ideas pass through a validation gate before becoming upgrades.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const EDGE_TYPES = ['related', 'refines', 'contradicts', 'implements', 'spawns'];

function shortid() {
  return crypto.randomBytes(4).toString('hex');
}

export class IdeaStore {
  /**
   * @param {string} dataDir — directory for ideas.jsonl + lattice.jsonl
   * @param {object} ledger  — Ledger instance
   */
  constructor(dataDir, ledger) {
    this.ideasPath   = path.join(dataDir, 'ideas.jsonl');
    this.latticePath = path.join(dataDir, 'lattice.jsonl');
    this.ledger      = ledger;
    this._ensure();
  }

  _ensure() {
    [this.ideasPath, this.latticePath].forEach(p => {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(p))   fs.writeFileSync(p, '', 'utf8');
    });
  }

  _readLines(filePath) {
    return fs.readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map(l => JSON.parse(l));
  }

  _appendLine(filePath, obj) {
    fs.appendFileSync(filePath, JSON.stringify(obj) + '\n', 'utf8');
  }

  // ── Ideas ──────────────────────────────────────────────────────

  /**
   * Add a new idea.
   * @param {object} params
   * @param {string}   params.text       — idea content
   * @param {string}   [params.projectId] — associated project id
   * @param {string[]} [params.tags]     — arbitrary tags
   * @param {string}   [params.source]   — 'cli' | 'api'
   * @returns {object} idea
   */
  add({ text, projectId = null, tags = [], source = 'api' }) {
    if (!text || !text.trim()) {
      throw new Error('[IdeaStore] idea text is required');
    }

    const idea = {
      id:        shortid(),
      ts:        Date.now(),
      text:      text.trim(),
      projectId,
      tags,
    };

    this._appendLine(this.ideasPath, idea);

    this.ledger.append({
      type:    'idea.added',
      source,
      payload: { id: idea.id, projectId, tags },
      outcome: 'ok',
    });

    return idea;
  }

  /**
   * List all ideas. Optional filters.
   * @param {object} [opts]
   * @param {string}   [opts.projectId]
   * @param {string[]} [opts.tags]
   * @param {number}   [opts.limit]
   * @returns {object[]}
   */
  list({ projectId, tags, limit } = {}) {
    let ideas = this._readLines(this.ideasPath);

    if (projectId) {
      ideas = ideas.filter(i => i.projectId === projectId);
    }
    if (tags && tags.length) {
      ideas = ideas.filter(i => tags.every(t => i.tags.includes(t)));
    }

    ideas = ideas.sort((a, b) => b.ts - a.ts);

    if (limit) ideas = ideas.slice(0, limit);
    return ideas;
  }

  /**
   * Find an idea by id.
   * @param {string} id
   * @returns {object|null}
   */
  findById(id) {
    return this._readLines(this.ideasPath).find(i => i.id === id) || null;
  }

  /**
   * Full-text search across idea text and tags.
   * Simple substring match — no ranking yet.
   * @param {string} query
   * @param {string} [projectId]
   * @returns {object[]}
   */
  search(query, projectId) {
    const q = query.toLowerCase();
    let ideas = this._readLines(this.ideasPath);

    if (projectId) ideas = ideas.filter(i => i.projectId === projectId);

    return ideas.filter(i =>
      i.text.toLowerCase().includes(q) ||
      i.tags.some(t => t.toLowerCase().includes(q))
    );
  }

  // ── Lattice ─────────────────────────────────────────────────────

  /**
   * Create an association edge between two ideas.
   * @param {object} params
   * @param {string} params.fromId  — source idea id
   * @param {string} params.toId    — target idea id
   * @param {string} params.type    — EDGE_TYPES member
   * @param {string} [params.source]
   * @returns {object} edge
   */
  link({ fromId, toId, type, source = 'api' }) {
    if (!EDGE_TYPES.includes(type)) {
      throw new Error(
        `[IdeaStore] invalid edge type '${type}'. Valid: ${EDGE_TYPES.join(', ')}`
      );
    }
    if (!this.findById(fromId)) {
      throw new Error(`[IdeaStore] fromId '${fromId}' not found`);
    }
    if (!this.findById(toId)) {
      throw new Error(`[IdeaStore] toId '${toId}' not found`);
    }

    const edge = {
      id:     shortid(),
      ts:     Date.now(),
      fromId,
      toId,
      type,
    };

    this._appendLine(this.latticePath, edge);

    this.ledger.append({
      type:    'lattice.linked',
      source,
      payload: { edgeId: edge.id, fromId, toId, edgeType: type },
      outcome: 'ok',
    });

    return edge;
  }

  /**
   * Return the full lattice graph optionally scoped to a project.
   * @param {string} [projectId]
   * @returns {{ nodes: object[], edges: object[] }}
   */
  graph(projectId) {
    let nodes = this._readLines(this.ideasPath);
    const edges = this._readLines(this.latticePath);

    if (projectId) {
      nodes = nodes.filter(n => n.projectId === projectId);
      const nodeIds = new Set(nodes.map(n => n.id));
      return {
        nodes,
        edges: edges.filter(e => nodeIds.has(e.fromId) && nodeIds.has(e.toId)),
      };
    }

    return { nodes, edges };
  }

  /**
   * Return all edges for a single idea (in or out).
   * @param {string} ideaId
   * @returns {object[]}
   */
  edgesFor(ideaId) {
    return this._readLines(this.latticePath)
      .filter(e => e.fromId === ideaId || e.toId === ideaId);
  }

  /**
   * Return neighbour ideas of a given idea via lattice edges.
   * @param {string} ideaId
   * @returns {object[]} ideas
   */
  neighbours(ideaId) {
    const edges = this.edgesFor(ideaId);
    const neighbourIds = new Set(
      edges.flatMap(e => [e.fromId, e.toId]).filter(id => id !== ideaId)
    );
    return this._readLines(this.ideasPath).filter(i => neighbourIds.has(i.id));
  }
}
