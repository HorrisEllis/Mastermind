/**
 * ProjectStore — project registry + git operations.
 *
 * Each project is a directory with a git repo.
 * The registry is a named ref in the Store under namespace 'projects'.
 *
 * Project shape:
 * {
 *   id:           string   shortid
 *   name:         string
 *   path:         string   absolute path to project dir
 *   createdTs:    number
 *   lastEditedTs: number
 *   lastSeam:     { name, ts } | null   — last touched seam in this project
 *   remote:       string | null          — SSH remote URL
 *   specId:       string | null          — ref to active .spec in Store
 * }
 *
 * §5.1 Everything has a UUID (shortid here, UUID in full spec)
 * §2.1 Persistence is the golden rule
 * §4.1 CLI is a peer — all ops callable from CLI
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

function shortid() {
  return crypto.randomBytes(4).toString('hex');
}

function run(cmd, cwd) {
  try {
    return {
      ok:     true,
      stdout: execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim(),
    };
  } catch (err) {
    return {
      ok:     false,
      stdout: '',
      error:  err.stderr ? err.stderr.trim() : err.message,
    };
  }
}

export class ProjectStore {
  /**
   * @param {string} projectsRoot — base dir where project dirs live
   * @param {object} store        — Store instance (for project registry refs)
   * @param {object} ledger       — Ledger instance
   */
  constructor(projectsRoot, store, ledger) {
    this.projectsRoot = projectsRoot;
    this.store        = store;
    this.ledger       = ledger;
    fs.mkdirSync(projectsRoot, { recursive: true });
  }

  /**
   * Create a new project.
   * Inits a git repo in {projectsRoot}/{name}/.
   * Writes a .spec stub and SEAM registry stub.
   *
   * @param {string} name
   * @param {string} [remote] — optional SSH remote
   * @param {string} [source]
   * @returns {object} project
   */
  create(name, remote = null, source = 'cli') {
    if (!name || !name.trim()) {
      throw new Error('[ProjectStore] project name is required');
    }

    const safeName  = name.trim().toLowerCase().replace(/\s+/g, '-');
    const projectDir = path.join(this.projectsRoot, safeName);

    if (fs.existsSync(projectDir)) {
      throw new Error(`[ProjectStore] project '${safeName}' already exists at ${projectDir}`);
    }

    fs.mkdirSync(projectDir, { recursive: true });

    // Init git
    const gitInit = run('git init', projectDir);
    if (!gitInit.ok) {
      throw new Error(`[ProjectStore] git init failed: ${gitInit.error}`);
    }

    // Configure repo-local identity so commits work in any environment
    run('git config user.email "rheon@local"', projectDir);
    run('git config user.name "rheon"', projectDir);

    // Write .spec stub
    const specStub = {
      name:        safeName,
      version:     '0.1.0',
      status:      'draft',
      uuid:        `${safeName}-spec-${shortid()}`,
      createdTs:   Date.now(),
      axioms:      [
        '§1.1 Nothing exists until proven.',
        '§1.2 Nothing pretends to work — and nothing silently fails.',
        '§2.1 Persistence is the golden rule.',
        '§3.1 Bottom-up only. Foundation and architecture before modules.',
        '§5.1 Everything has a UUID, hook, and event bus registration.',
      ],
      seams:       [],
      components:  [],
      gaps:        [],
      ledger:      [],
    };
    fs.writeFileSync(
      path.join(projectDir, `${safeName}.spec.json`),
      JSON.stringify(specStub, null, 2),
      'utf8'
    );

    // Write seam registry stub
    fs.mkdirSync(path.join(projectDir, 'seams'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'seams', 'REGISTRY.json'),
      JSON.stringify({ seams: {} }, null, 2),
      'utf8'
    );

    // Initial commit
    run('git add .', projectDir);
    run('git commit -m "rheon: project initialised"', projectDir);

    if (remote) {
      run(`git remote add origin ${remote}`, projectDir);
    }

    const project = {
      id:           shortid(),
      name:         safeName,
      path:         projectDir,
      createdTs:    Date.now(),
      lastEditedTs: Date.now(),
      lastSeam:     null,
      remote:       remote || null,
      specId:       null,
    };

    this.store.write('projects', safeName, project, {}, source);

    this.ledger.append({
      type:    'project.created',
      source,
      payload: { id: project.id, name: safeName, path: projectDir, remote },
      outcome: 'ok',
    });

    return project;
  }

  /**
   * List all projects, newest first.
   * @returns {object[]}
   */
  list() {
    return this.store.list('projects').map(ref => {
      const result = this.store.read('projects', ref.name);
      return result ? result.content : null;
    }).filter(Boolean);
  }

  /**
   * Get a single project by name.
   * @param {string} name
   * @returns {object|null}
   */
  get(name) {
    const result = this.store.read('projects', name);
    return result ? result.content : null;
  }

  /**
   * Update a project (e.g. after seam edit, spec update).
   * @param {string} name
   * @param {object} patch
   * @param {string} [source]
   * @returns {object} updated project
   */
  update(name, patch, source = 'internal') {
    const existing = this.get(name);
    if (!existing) {
      throw new Error(`[ProjectStore] project '${name}' not found`);
    }
    const updated = { ...existing, ...patch, lastEditedTs: Date.now() };
    this.store.write('projects', name, updated, {}, source);

    this.ledger.append({
      type:    'project.updated',
      source,
      payload: { name, patch: Object.keys(patch) },
      outcome: 'ok',
    });

    return updated;
  }

  // ── Git operations ────────────────────────────────────────────

  /**
   * git status for a project.
   * @param {string} name
   * @returns {{ ok, output }}
   */
  gitStatus(name) {
    const project = this.get(name);
    if (!project) throw new Error(`[ProjectStore] project '${name}' not found`);
    const result = run('git status --short', project.path);
    return { ok: result.ok, output: result.stdout, error: result.error };
  }

  /**
   * git push to remote.
   * @param {string} name
   * @param {string} [source]
   * @returns {{ ok, output, error }}
   */
  gitPush(name, source = 'cli') {
    const project = this.get(name);
    if (!project) throw new Error(`[ProjectStore] project '${name}' not found`);
    if (!project.remote) throw new Error(`[ProjectStore] project '${name}' has no remote configured`);

    const result = run('git push origin main', project.path);

    this.ledger.append({
      type:    'project.pushed',
      source,
      payload: { name, ok: result.ok, error: result.error || null },
      outcome: result.ok ? 'ok' : 'error',
      ...(result.error ? { error: result.error } : {}),
    });

    return { ok: result.ok, output: result.stdout, error: result.error };
  }

  /**
   * git pull from remote.
   * @param {string} name
   * @param {string} [source]
   * @returns {{ ok, output, error }}
   */
  gitPull(name, source = 'cli') {
    const project = this.get(name);
    if (!project) throw new Error(`[ProjectStore] project '${name}' not found`);
    if (!project.remote) throw new Error(`[ProjectStore] project '${name}' has no remote configured`);

    const result = run('git pull origin main', project.path);

    this.ledger.append({
      type:    'project.pulled',
      source,
      payload: { name, ok: result.ok, error: result.error || null },
      outcome: result.ok ? 'ok' : 'error',
      ...(result.error ? { error: result.error } : {}),
    });

    return { ok: result.ok, output: result.stdout, error: result.error };
  }

  /**
   * List files in a project directory (recursive, ignores .git).
   * @param {string} name
   * @param {string} [subPath]
   * @returns {object[]} FileNode[]
   */
  listFiles(name, subPath = '') {
    const project = this.get(name);
    if (!project) throw new Error(`[ProjectStore] project '${name}' not found`);

    const base = subPath ? path.join(project.path, subPath) : project.path;
    return this._walkDir(base, project.path);
  }

  _walkDir(dir, projectRoot) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const nodes = [];

    for (const entry of entries) {
      if (entry.name === '.git') continue;

      const fullPath    = path.join(dir, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);
      const stat        = fs.statSync(fullPath);

      if (entry.isDirectory()) {
        nodes.push({
          type:     'directory',
          name:     entry.name,
          path:     relativePath,
          children: this._walkDir(fullPath, projectRoot),
        });
      } else {
        nodes.push({
          type:      'file',
          name:      entry.name,
          path:      relativePath,
          size:      stat.size,
          modifiedTs: stat.mtimeMs,
        });
      }
    }

    return nodes.sort((a, b) => {
      // directories first, then files
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Read a file from a project.
   * @param {string} name
   * @param {string} filePath — relative to project root
   * @returns {{ content, size, modifiedTs }}
   */
  readFile(name, filePath) {
    const project = this.get(name);
    if (!project) throw new Error(`[ProjectStore] project '${name}' not found`);

    const abs = path.join(project.path, filePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`[ProjectStore] file not found: ${filePath}`);
    }

    const stat = fs.statSync(abs);
    return {
      content:    fs.readFileSync(abs, 'utf8'),
      size:       stat.size,
      modifiedTs: stat.mtimeMs,
    };
  }

  /**
   * Write a file to a project and auto-commit.
   * @param {string} name
   * @param {string} filePath  — relative to project root
   * @param {string} content
   * @param {string} [source]
   * @returns {{ ok, hash }}
   */
  writeFile(name, filePath, content, source = 'api') {
    const project = this.get(name);
    if (!project) throw new Error(`[ProjectStore] project '${name}' not found`);

    const abs = path.join(project.path, filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');

    // Auto-commit
    run('git add .', project.path);
    const commit = run(`git commit -m "rheon: edit ${filePath}"`, project.path);

    // Update project lastEditedTs
    // Detect if this is a seam file
    const isSeam = filePath.startsWith('seams/') || filePath.endsWith('.seam.js');
    if (isSeam) {
      const seamName = path.basename(filePath, '.seam.js');
      this.update(name, { lastSeam: { name: seamName, ts: Date.now() } }, source);
    } else {
      this.update(name, {}, source);
    }

    this.ledger.append({
      type:    'project.file.written',
      source,
      payload: { projectName: name, filePath, size: content.length },
      outcome: 'ok',
    });

    return { ok: commit.ok, error: commit.error };
  }
}
