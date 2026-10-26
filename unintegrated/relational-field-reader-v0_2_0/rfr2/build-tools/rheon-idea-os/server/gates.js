/**
 * gates.js — SISO gates for rheon-server
 *
 * Each gate:
 *   - Has exactly one signature (the command type it handles)
 *   - Transforms the command into one or more result events
 *   - Has NO side effects beyond emitting events
 *   - Is independently testable — mock the stream, verify emissions
 *
 * Gate chain for a write operation:
 *   cmd.project.create
 *     → [ProjectCreateGate] validates, calls storage
 *     → store.project.created  (success)
 *     → store.error            (failure)
 *
 * §5.7 — all inter-module communication via event bus only
 * §1.2 — every error is a named store.error event, not a throw
 *
 * Storage calls are the ONE side effect permitted here.
 * They are declared explicitly per gate (SideEffectDecl pattern).
 */

import { Gate, Event } from '../core/index.js';

// ── Factory — keeps gate definitions terse ────────────────────────
function gate(signature, transformFn) {
  const g = new Gate(signature);
  g.transform = transformFn;
  return g;
}

// ── Error helper — emits a store.error event ──────────────────────
function emitError(stream, signature, payload, err) {
  stream.emit(new Event('store.error', {
    origin:  signature,
    code:    err.code || 'INTERNAL_ERROR',
    message: err.message,
    payload,
  }));
}

// ── Gate definitions ──────────────────────────────────────────────
// Each gate receives (event, stream). event.data is the command payload.
// Storage is injected via event.data._storage (set by server before emit).

// ── Projects ──────────────────────────────────────────────────────

export const ProjectCreateGate = (projectStore) => gate(
  'cmd.project.create',
  (event, stream) => {
    const { name, remote, source = 'api' } = event.data;
    try {
      const project = projectStore.create(name, remote || null, source);
      stream.emit(new Event('store.project.created', { project, source }));
    } catch(err) {
      emitError(stream, 'cmd.project.create', event.data, err);
    }
  }
);

export const ProjectListGate = (projectStore) => gate(
  'cmd.project.list',
  (event, stream) => {
    try {
      const projects = projectStore.list();
      stream.emit(new Event('store.project.listed', { projects }));
    } catch(err) {
      emitError(stream, 'cmd.project.list', event.data, err);
    }
  }
);

export const ProjectGetGate = (projectStore) => gate(
  'cmd.project.get',
  (event, stream) => {
    const { name } = event.data;
    try {
      const project = projectStore.get(name);
      stream.emit(new Event('store.project.got', { project, name }));
    } catch(err) {
      emitError(stream, 'cmd.project.get', event.data, err);
    }
  }
);

// ── Files ─────────────────────────────────────────────────────────

export const FileListGate = (projectStore) => gate(
  'cmd.file.list',
  (event, stream) => {
    const { projectName, subPath = '' } = event.data;
    try {
      const files = projectStore.listFiles(projectName, subPath);
      stream.emit(new Event('store.file.listed', { projectName, subPath, files }));
    } catch(err) {
      emitError(stream, 'cmd.file.list', event.data, err);
    }
  }
);

export const FileReadGate = (projectStore) => gate(
  'cmd.file.read',
  (event, stream) => {
    const { projectName, filePath } = event.data;
    try {
      const result = projectStore.readFile(projectName, filePath);
      stream.emit(new Event('store.file.read', { projectName, filePath, ...result }));
    } catch(err) {
      emitError(stream, 'cmd.file.read', event.data, err);
    }
  }
);

export const FileWriteGate = (projectStore) => gate(
  'cmd.file.write',
  (event, stream) => {
    const { projectName, filePath, content, source = 'api' } = event.data;
    try {
      const result = projectStore.writeFile(projectName, filePath, content, source);
      stream.emit(new Event('store.file.written', { projectName, filePath, result }));
    } catch(err) {
      emitError(stream, 'cmd.file.write', event.data, err);
    }
  }
);

// ── Git ───────────────────────────────────────────────────────────

export const GitPushGate = (projectStore) => gate(
  'cmd.git.push',
  (event, stream) => {
    const { projectName, source = 'api' } = event.data;
    try {
      const result = projectStore.gitPush(projectName, source);
      stream.emit(new Event('store.git.pushed', { projectName, result }));
    } catch(err) {
      emitError(stream, 'cmd.git.push', event.data, err);
    }
  }
);

export const GitPullGate = (projectStore) => gate(
  'cmd.git.pull',
  (event, stream) => {
    const { projectName, source = 'api' } = event.data;
    try {
      const result = projectStore.gitPull(projectName, source);
      stream.emit(new Event('store.git.pulled', { projectName, result }));
    } catch(err) {
      emitError(stream, 'cmd.git.pull', event.data, err);
    }
  }
);

export const GitStatusGate = (projectStore) => gate(
  'cmd.git.status',
  (event, stream) => {
    const { projectName } = event.data;
    try {
      const result = projectStore.gitStatus(projectName);
      stream.emit(new Event('store.git.status', { projectName, result }));
    } catch(err) {
      emitError(stream, 'cmd.git.status', event.data, err);
    }
  }
);

// ── Specs ─────────────────────────────────────────────────────────

export const SpecWriteGate = (store) => gate(
  'cmd.spec.write',
  (event, stream) => {
    const { namespace, name, content, meta = {}, source = 'api' } = event.data;
    try {
      const result = store.write(namespace, name, content, meta, source);
      stream.emit(new Event('store.spec.written', { namespace, name, result }));
    } catch(err) {
      emitError(stream, 'cmd.spec.write', event.data, err);
    }
  }
);

export const SpecReadGate = (store) => gate(
  'cmd.spec.read',
  (event, stream) => {
    const { namespace, name } = event.data;
    try {
      const result = store.read(namespace, name);
      stream.emit(new Event('store.spec.read', { namespace, name, result }));
    } catch(err) {
      emitError(stream, 'cmd.spec.read', event.data, err);
    }
  }
);

export const SpecListGate = (store) => gate(
  'cmd.spec.list',
  (event, stream) => {
    const { namespace } = event.data;
    try {
      const refs = store.list(namespace);
      stream.emit(new Event('store.spec.listed', { namespace, refs }));
    } catch(err) {
      emitError(stream, 'cmd.spec.list', event.data, err);
    }
  }
);

// ── Ideas ─────────────────────────────────────────────────────────

export const IdeaAddGate = (ideaStore) => gate(
  'cmd.idea.add',
  (event, stream) => {
    const { text, projectId, tags, source = 'api' } = event.data;
    try {
      const idea = ideaStore.add({ text, projectId, tags, source });
      stream.emit(new Event('store.idea.added', { idea }));
    } catch(err) {
      emitError(stream, 'cmd.idea.add', event.data, err);
    }
  }
);

export const IdeaListGate = (ideaStore) => gate(
  'cmd.idea.list',
  (event, stream) => {
    const { projectId, tags, limit } = event.data;
    try {
      const ideas = ideaStore.list({ projectId, tags, limit });
      stream.emit(new Event('store.idea.listed', { ideas }));
    } catch(err) {
      emitError(stream, 'cmd.idea.list', event.data, err);
    }
  }
);

export const IdeaSearchGate = (ideaStore) => gate(
  'cmd.idea.search',
  (event, stream) => {
    const { query, projectId } = event.data;
    try {
      const ideas = ideaStore.search(query, projectId);
      stream.emit(new Event('store.idea.searched', { ideas, query }));
    } catch(err) {
      emitError(stream, 'cmd.idea.search', event.data, err);
    }
  }
);

export const LatticeLinkGate = (ideaStore) => gate(
  'cmd.lattice.link',
  (event, stream) => {
    const { fromId, toId, type, source = 'api' } = event.data;
    try {
      const edge = ideaStore.link({ fromId, toId, type, source });
      stream.emit(new Event('store.lattice.linked', { edge }));
    } catch(err) {
      emitError(stream, 'cmd.lattice.link', event.data, err);
    }
  }
);

export const LatticeGraphGate = (ideaStore) => gate(
  'cmd.lattice.graph',
  (event, stream) => {
    const { projectId } = event.data;
    try {
      const graph = ideaStore.graph(projectId);
      stream.emit(new Event('store.lattice.graphed', { graph, projectId }));
    } catch(err) {
      emitError(stream, 'cmd.lattice.graph', event.data, err);
    }
  }
);

// ── System ────────────────────────────────────────────────────────

export const LedgerTailGate = (ledger) => gate(
  'cmd.ledger.tail',
  (event, stream) => {
    const { n = 20 } = event.data;
    try {
      const entries = ledger.tail(n);
      stream.emit(new Event('store.ledger.tailed', { entries, n }));
    } catch(err) {
      emitError(stream, 'cmd.ledger.tail', event.data, err);
    }
  }
);
