/**
 * Store — content-addressed JSON store.
 *
 * Same content → same hash. The store is content-blind.
 * Named refs point at hashes (like git refs → commits).
 *
 * Every write goes through a Ledger before returning — §2.1.
 *
 * Layout on disk:
 *   {root}/objects/{hash[0..1]}/{hash}   — content blob
 *   {root}/refs/{namespace}/{name}.json  — named ref → { hash, ts, meta }
 *
 * §1.1 — nothing exists until the write is confirmed.
 * §1.2 — every error is named, typed, thrown.
 * §2.2 — storage device is the source of truth.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class Store {
  /**
   * @param {string} root    — base directory for this store
   * @param {object} ledger  — Ledger instance to log all writes
   */
  constructor(root, ledger) {
    this.root = root;
    this.ledger = ledger;
    this._ensureDirs();
  }

  _ensureDirs() {
    fs.mkdirSync(path.join(this.root, 'objects'), { recursive: true });
    fs.mkdirSync(path.join(this.root, 'refs'), { recursive: true });
  }

  /**
   * Hash canonical JSON of an object.
   * @param {any} content
   * @returns {string} sha256 hex
   */
  _hash(content) {
    const canonical = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  _objectPath(hash) {
    return path.join(this.root, 'objects', hash.slice(0, 2), hash);
  }

  _refPath(namespace, name) {
    return path.join(this.root, 'refs', namespace, `${name}.json`);
  }

  /**
   * Write content blob. Idempotent — same content, same hash, no double-write.
   * @param {any} content
   * @returns {string} hash
   */
  writeObject(content) {
    const hash = this._hash(content);
    const objPath = this._objectPath(hash);

    if (!fs.existsSync(objPath)) {
      fs.mkdirSync(path.dirname(objPath), { recursive: true });
      fs.writeFileSync(objPath, JSON.stringify(content, null, 2), 'utf8');
    }

    return hash;
  }

  /**
   * Read a content blob by hash.
   * Returns null if not found — does not throw.
   * @param {string} hash
   * @returns {any|null}
   */
  readObject(hash) {
    const objPath = this._objectPath(hash);
    if (!fs.existsSync(objPath)) return null;
    return JSON.parse(fs.readFileSync(objPath, 'utf8'));
  }

  /**
   * Write a named ref pointing to a content hash.
   * Logs the write to the ledger.
   *
   * @param {string} namespace  — e.g. 'specs', 'seams', 'ideas'
   * @param {string} name       — ref name (unique within namespace)
   * @param {any}    content    — the content to store
   * @param {object} [meta]     — arbitrary metadata stored with the ref
   * @param {string} [source]   — 'cli' | 'api' | 'internal'
   * @returns {{ hash, ref }}
   */
  write(namespace, name, content, meta = {}, source = 'internal') {
    const hash = this.writeObject(content);
    const ref = {
      name,
      namespace,
      hash,
      ts:   Date.now(),
      meta,
    };

    const refPath = this._refPath(namespace, name);
    fs.mkdirSync(path.dirname(refPath), { recursive: true });
    fs.writeFileSync(refPath, JSON.stringify(ref, null, 2), 'utf8');

    this.ledger.append({
      type:    `${namespace}.written`,
      source,
      payload: { namespace, name, hash, meta },
      outcome: 'ok',
    });

    return { hash, ref };
  }

  /**
   * Read a named ref and return its content.
   * Returns null if ref not found.
   *
   * @param {string} namespace
   * @param {string} name
   * @returns {{ ref, content }|null}
   */
  read(namespace, name) {
    const refPath = this._refPath(namespace, name);
    if (!fs.existsSync(refPath)) return null;
    const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    const content = this.readObject(ref.hash);
    return { ref, content };
  }

  /**
   * List all named refs in a namespace.
   * @param {string} namespace
   * @returns {object[]} array of ref objects (without content)
   */
  list(namespace) {
    const dir = path.join(this.root, 'refs', namespace);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))
      .sort((a, b) => b.ts - a.ts); // newest first
  }

  /**
   * Delete a named ref. Content blob is kept (content-addressed = immutable).
   * Logs the deletion.
   *
   * @param {string} namespace
   * @param {string} name
   * @param {string} [source]
   * @returns {boolean} true if deleted, false if not found
   */
  delete(namespace, name, source = 'internal') {
    const refPath = this._refPath(namespace, name);
    if (!fs.existsSync(refPath)) return false;

    const ref = JSON.parse(fs.readFileSync(refPath, 'utf8'));
    fs.unlinkSync(refPath);

    this.ledger.append({
      type:    `${namespace}.deleted`,
      source,
      payload: { namespace, name, hash: ref.hash },
      outcome: 'ok',
    });

    return true;
  }

  /**
   * Check if a named ref exists.
   * @param {string} namespace
   * @param {string} name
   * @returns {boolean}
   */
  exists(namespace, name) {
    return fs.existsSync(this._refPath(namespace, name));
  }
}
