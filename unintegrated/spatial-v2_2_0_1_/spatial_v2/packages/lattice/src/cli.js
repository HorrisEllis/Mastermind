/**
 * @spatial/lattice — cli.js
 * Command line interface for the Associative Lattice.
 * /find /connect /inspect /cluster /graph /threshold
 *
 * Works in Node REPL, terminal, or any text interface.
 * Bus-aware — emits results as events AND returns them.
 */
'use strict';

export class LatticeCLI {
  constructor(engine) {
    this._engine = engine;
  }

  /** Parse and execute a /command string */
  exec(input) {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return this._unknown(input);
    const [cmd, ...args] = trimmed.slice(1).split(/\s+/);
    switch (cmd.toLowerCase()) {
      case 'find':       return this._find(args.join(' '));
      case 'connect':    return this._connect(args[0], args[1], parseFloat(args[2]));
      case 'inspect':    return this._inspect(args[0]);
      case 'cluster':    return this._cluster();
      case 'graph':      return this._graph();
      case 'threshold':  return this._threshold(parseFloat(args[0]));
      default:           return this._unknown(cmd);
    }
  }

  _find(query) {
    if (!query) return this._err('Usage: /find [query]');
    const results = this._engine.find(query, { limit: 10 });
    if (!results.length) return { ok: true, type: 'find', query, results: [], output: `No matches for "${query}"` };
    const lines = results.map(r => `  MATCH · ${r.node.id} · "${r.node.label}" · score: ${r.score}`);
    return { ok: true, type: 'find', query, results, output: lines.join('\n') };
  }

  _connect(idA, idB, weight) {
    if (!idA || !idB) return this._err('Usage: /connect [node-id-a] [node-id-b] [weight?]');
    const edge = this._engine.connect(idA, idB, { weight: isNaN(weight) ? undefined : weight });
    if (!edge) return { ok: false, output: `Could not connect ${idA} ↔ ${idB} — one or both nodes not found` };
    return { ok: true, type: 'connect', edge, output: `CONNECTED · ${idA} ↔ ${idB} · weight: ${edge.weight}` };
  }

  _inspect(nodeId) {
    if (!nodeId) return this._err('Usage: /inspect [node-id]');
    const node = this._engine.inspect(nodeId);
    if (!node) return { ok: false, output: `Node ${nodeId} not found` };
    const edgeLines = node.edges.map(e => `    ↔ ${e.a === nodeId ? e.b : e.a} · ${e.weight} · ${e.type}`);
    const output = [
      `NODE · ${node.id}`,
      `  label:    ${node.label}`,
      `  tags:     [${node.tags.join(', ')}]`,
      `  species:  ${node.species}`,
      `  session:  ${node.sessionId ?? 'none'}`,
      `  conf:     ${node.confidence}`,
      `  edges (${node.edges.length}):`,
      ...edgeLines,
    ].join('\n');
    return { ok: true, type: 'inspect', node, output };
  }

  _cluster() {
    const clusters = this._engine.cluster();
    if (!clusters.length) return { ok: true, type: 'cluster', clusters: [], output: 'No clusters found' };
    const lines = clusters.map(c =>
      `  [${c.id}] · ${c.size} nodes · avg res: ${c.avgResonance} · dominant: ${c.dominantTag}`
    );
    return { ok: true, type: 'cluster', clusters, output: `CLUSTERS (${clusters.length}):\n${lines.join('\n')}` };
  }

  _graph() {
    const g = this._engine.graph();
    return { ok: true, type: 'graph', ...g, output: `GRAPH · ${g.nodes.length} nodes · ${g.edges.length} edges → spatial.lattice.graph.ready` };
  }

  _threshold(t) {
    if (isNaN(t) || t < 0 || t > 1) return this._err('Usage: /threshold [0.0–1.0]');
    this._engine.setThreshold(t);
    return { ok: true, type: 'threshold', value: t, output: `Threshold set to ${t}` };
  }

  _unknown(cmd) {
    return { ok: false, output: `Unknown command: ${cmd}\nAvailable: /find /connect /inspect /cluster /graph /threshold` };
  }
  _err(msg) { return { ok: false, output: msg }; }
}
