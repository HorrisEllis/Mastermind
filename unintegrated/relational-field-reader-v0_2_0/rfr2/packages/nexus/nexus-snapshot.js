/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CRYSTALBALL NEXUS SNAPSHOT MANAGER  ·  nexus-snapshot.js  ·  v1.0.0  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Integrates causal-nexus into the CrystalBall container for:
 *
 *   1. PRE-UPDATE SNAPSHOT
 *      Before every git pull or file-change hot-reload, snapshot the current
 *      modules/ tree into a compressed .nex file via causal-nexus compress.
 *      Event-driven: hooks into Updater's onUpdate callback chain.
 *
 *   2. BACKUP CATALOG
 *      A rolling catalog of .nex snapshots, bounded by maxSnapshots.
 *      Each entry: { id, ts, commit, reason, path, size, clipId }
 *      Persisted to snapshots/catalog.json in the app data dir.
 *
 *   3. CLIP-BASED REVERT
 *      Each snapshot embeds a NEX-CLIP of the kernel's event ring at
 *      capture time. To revert: restoreClip() → ReplayContext → walk
 *      events back to the pre-update state → restore modules/ files.
 *
 *   4. STABILITY VALIDATION
 *      After hot-reload, validateClipStability() checks whether the new
 *      code state's event stream drifts beyond thresholds from the
 *      pre-update clip. If it breaches: automatic revert.
 *
 * .nex FILE FORMAT
 * ─────────────────
 * A .nex file is a JSON envelope:
 * {
 *   magic:    'CB-NEX-1',
 *   version:  '1.0.0',
 *   ts:       number,         // Unix ms
 *   commit:   string|null,    // git commit hash (7 chars)
 *   reason:   string,         // 'pre-update'|'manual'|'scheduled'
 *   modules:  { [relPath]: string },  // path → file contents
 *   kernel:   <URCK-SNAP>,    // causal-nexus snapshot object
 *   clip:     <NEX-CLIP>|null,// bounded subgraph for revert
 *   catalog:  { id, ts, size }
 * }
 *
 * Compressed with Node's zlib.gzip before writing to disk.
 * Typical size: 50-200KB for the full modules/ tree.
 *
 * EVENT LIFECYCLE
 * ───────────────
 *   updater.onBeforeUpdate → snapshotModules() → write .nex → emit nexus:snapshot:created
 *   updater.onUpdate       → (hot-reload runs)  → validateStability() → if breach → revert()
 *   revert()               → restoreClip()       → write files back    → emit nexus:revert:applied
 *
 * NEXUS KERNEL EVENTS EMITTED
 * ────────────────────────────
 *   nexus:snapshot:created    { id, path, size, reason, commit }
 *   nexus:snapshot:failed     { reason, error }
 *   nexus:revert:started      { targetId, targetTs, reason }
 *   nexus:revert:applied      { targetId, filesRestored }
 *   nexus:revert:failed       { targetId, error }
 *   nexus:stability:ok        { clipId, gapDrift, sigmaDrift }
 *   nexus:stability:breach    { clipId, breach, gapDrift, sigmaDrift }
 *   nexus:catalog:updated     { count, latest }
 *   crystalball:update:safe   { commit, snapshotId }
 *   crystalball:update:rolled_back { from, to, reason }
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const zlib   = require('zlib');
const { promisify } = require('util');

const gzip   = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// ── Lazy ESM import shim for causal-nexus (ESM-only package) ─────────────────
// causal-nexus is "type":"module". We're in a CJS main process.
// Use dynamic import() which works in Node >= 18 CJS → ESM.

let _nexus = null;
async function getNexus() {
  if (_nexus) return _nexus;
  _nexus = await import('./causal-nexus/src/index.js');
  return _nexus;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NEX_MAGIC        = 'CB-NEX-1';
const NEX_VERSION      = '1.0.0';
const MAX_SNAPSHOTS    = 20;       // rolling window
const SNAPSHOT_DIR     = 'snapshots';
const CATALOG_FILE     = 'catalog.json';
const RING_CAP         = 50_000;   // nexus kernel ring cap for snapshot events
const STABILITY_BREACH_AUTO_REVERT = true;

// File extensions to include in module snapshot
const INCLUDE_EXTS = new Set(['.js', '.ts', '.json', '.html', '.css', '.md']);
// Directories to always skip
const SKIP_DIRS    = new Set(['node_modules', '.git', 'snapshots', 'assets']);

// ─── NexusSnapshotManager ────────────────────────────────────────────────────

class NexusSnapshotManager {
  /**
   * @param {object} opts
   * @param {string}   opts.appDataDir   — base directory for .nex files
   * @param {string}   opts.modulesDir   — modules/ directory to snapshot
   * @param {object}   [opts.wsServer]   — WsServer for broadcasting status
   * @param {number}   [opts.maxSnapshots]
   */
  constructor({ appDataDir, modulesDir, wsServer, maxSnapshots = MAX_SNAPSHOTS } = {}) {
    this._dataDir    = path.join(appDataDir, SNAPSHOT_DIR);
    this._modulesDir = modulesDir;
    this._ws         = wsServer;
    this._maxSnaps   = maxSnapshots;
    this._catalogPath = path.join(this._dataDir, CATALOG_FILE);

    // Internal Nexus kernel — tracks snapshot lifecycle events
    this._kernel     = null;
    this._store      = null;

    // Catalog: array of { id, ts, commit, reason, path, size, clipId }
    this._catalog    = [];

    // Latest clip for stability validation
    this._lastClip   = null;
    this._lastClipKernel = null;  // the mini-kernel the clip was derived from

    fs.mkdirSync(this._dataDir, { recursive: true });
  }

  async init() {
    const { createKernel }  = await getNexus();
    const { createStore, recoverStore } = await getNexus();

    // Create a dedicated Nexus kernel for snapshot management events
    this._kernel = createKernel({ ringCap: RING_CAP });

    // Filesystem WAL for the snapshot kernel itself
    this._store  = createStore(this._kernel, {
      backend:    'filesystem',
      storePath:  path.join(this._dataDir, '.nexus-wal'),
      walFlushEvery:  10,
      snapshotEvery:  1000,
    });

    // Recover any prior snapshot events
    try {
      await recoverStore(this._store, this._kernel);
    } catch (e) {
      console.warn('[NexusSnapshot] WAL recovery error:', e.message);
    }

    // Load catalog
    this._loadCatalog();

    console.log(`[NexusSnapshot] initialized — ${this._catalog.length} snapshots in catalog`);
    return this;
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /**
   * Take a full snapshot of the modules/ directory.
   * Called BEFORE any update is applied.
   *
   * @param {object} opts
   *   opts.commit  {string}  git commit hash
   *   opts.reason  {string}  'pre-update'|'manual'|'scheduled'
   * @returns {object}  catalog entry
   */
  async snapshotModules({ commit = null, reason = 'manual' } = {}) {
    const id  = crypto.randomBytes(6).toString('hex');
    const ts  = Date.now();

    this._kernel.ingest('nexus:snapshot:started', { id, reason, commit }, { source: 'cb:snapshot' });

    try {
      // 1. Read all module files into memory
      const modules = this._readModulesDir(this._modulesDir);
      const fileCount = Object.keys(modules).length;

      // 2. Take a Nexus kernel snapshot (the snapshot kernel's own event ring)
      const { snapshot: nexusSnapshot, snapshotRange, blueprint } = await getNexus();
      const kernSnap = nexusSnapshot(this._kernel);

      // 3. Extract a NEX-CLIP of the current ring for replay/revert
      let clip = null;
      if (this._kernel.length >= 2) {
        try {
          const all    = this._kernel.getAll();
          const seqStart = all[0].seq;
          const seqEnd   = all[all.length - 1].seq;
          clip = snapshotRange(this._kernel, { seqStart, seqEnd, attachStabilityProfile: true });
        } catch (e) {
          console.warn('[NexusSnapshot] clip extraction failed (non-fatal):', e.message);
        }
      }

      // 4. Build .nex envelope
      const nex = {
        magic:    NEX_MAGIC,
        version:  NEX_VERSION,
        ts,
        commit:   commit?.slice(0, 7) ?? null,
        reason,
        fileCount,
        modules,
        kernel:   kernSnap,
        clip:     clip ?? null,
        catalog:  { id, ts },
      };

      // 5. Gzip and write
      const json    = JSON.stringify(nex);
      const compressed = await gzip(Buffer.from(json, 'utf8'));
      const filename = `cb-${ts}-${id}.nex`;
      const filepath = path.join(this._dataDir, filename);
      fs.writeFileSync(filepath, compressed);

      const size = compressed.length;

      // 6. Update catalog
      const entry = { id, ts, commit: nex.commit, reason, path: filepath, size, clipId: clip?.clipId ?? null, fileCount };
      this._catalog.push(entry);
      this._pruneCatalog();
      this._saveCatalog();

      // 7. Store the clip for stability validation after next update
      this._lastClip       = clip;
      this._lastClipKernel = this._kernel;

      // 8. Emit kernel event
      this._kernel.ingest('nexus:snapshot:created', {
        id, path: filepath, size, reason, commit: nex.commit, fileCount,
        compressRatio: Math.round(json.length / size * 10) / 10,
      }, { source: 'cb:snapshot' });

      this._ws?.broadcast({ type: 'nexus.snapshot.created', entry });

      console.log(`[NexusSnapshot] ${reason} snapshot: ${filename} (${(size/1024).toFixed(1)}KB, ${fileCount} files)`);
      return entry;

    } catch (err) {
      this._kernel.ingest('nexus:snapshot:failed', { id, reason, error: err.message }, { source: 'cb:snapshot' });
      this._ws?.broadcast({ type: 'nexus.snapshot.failed', error: err.message });
      throw err;
    }
  }

  // ── Stability Validation ──────────────────────────────────────────────────

  /**
   * After a hot-reload, validate that the new code state is stable
   * relative to the pre-update clip.
   * If breach: auto-revert to the most recent snapshot.
   *
   * @param {object[]} liveEvents — recent kernel events post-reload
   * @returns {object} validation result
   */
  async validatePostUpdate(liveEvents = []) {
    if (!this._lastClip) {
      console.log('[NexusSnapshot] no clip for stability validation — skipping');
      return { ok: true, reason: 'no_clip' };
    }

    const { validateClipStability, computeDeltaStream } = await getNexus();

    // Build a delta stream from the live events
    const eventMap = new Map(liveEvents.map(ev => [ev.id, ev]));
    const deltaStream = computeDeltaStream(
      liveEvents,
      id => eventMap.get(id) ?? null,
      () => null,
      () => new Set(),
    );

    const result = validateClipStability(this._lastClip, deltaStream);

    if (result.ok) {
      this._kernel.ingest('nexus:stability:ok', {
        clipId:     this._lastClip.clipId,
        gapDrift:   result.gapDrift,
        sigmaDrift: result.sigmaDrift,
        slopeDrift: result.slopeDrift,
      }, { source: 'cb:stability' });

      this._ws?.broadcast({ type: 'nexus.stability.ok', ...result });
      console.log('[NexusSnapshot] stability OK — gapDrift:', result.gapDrift, 'sigmaDrift:', result.sigmaDrift);
    } else {
      this._kernel.ingest('nexus:stability:breach', {
        clipId:     this._lastClip.clipId,
        breach:     result.breach,
        gapDrift:   result.gapDrift,
        sigmaDrift: result.sigmaDrift,
      }, { source: 'cb:stability' });

      this._ws?.broadcast({ type: 'nexus.stability.breach', ...result });
      console.warn('[NexusSnapshot] STABILITY BREACH:', result.breach, '— auto-revert triggered');

      if (STABILITY_BREACH_AUTO_REVERT) {
        const latest = this._catalog[this._catalog.length - 1];
        if (latest) {
          await this.revert(latest.id, `stability_breach:${result.breach}`);
        }
      }
    }

    return result;
  }

  // ── Revert ────────────────────────────────────────────────────────────────

  /**
   * Revert modules/ to a prior snapshot.
   * Replays the NEX-CLIP to verify integrity before writing files.
   *
   * @param {string} snapshotId  — catalog entry id
   * @param {string} [reason]    — reason for revert
   * @returns {object}  { ok, filesRestored, replayEvents }
   */
  async revert(snapshotId, reason = 'manual') {
    const entry = this._catalog.find(e => e.id === snapshotId);
    if (!entry) throw new Error(`[NexusSnapshot] snapshot ${snapshotId} not found in catalog`);

    this._kernel.ingest('nexus:revert:started', {
      targetId: snapshotId, targetTs: entry.ts, reason,
    }, { source: 'cb:revert' });

    this._ws?.broadcast({ type: 'nexus.revert.started', snapshotId, reason });

    try {
      // 1. Load and decompress the .nex file
      const compressed = fs.readFileSync(entry.path);
      const json       = await gunzip(compressed);
      const nex        = JSON.parse(json.toString('utf8'));

      if (nex.magic !== NEX_MAGIC) throw new Error('invalid .nex magic');

      // 2. Replay the embedded NEX-CLIP to validate integrity
      let replayEvents = 0;
      if (nex.clip) {
        const { restoreClip } = await getNexus();
        const ctx = restoreClip(nex.clip, {}, {});
        const result = await ctx.run({ onStep: () => {} });
        replayEvents = result.eventCount ?? 0;
        console.log(`[NexusSnapshot] replay validated — ${replayEvents} events OK`);
      }

      // 3. Write files back to modules/ directory
      let filesRestored = 0;
      for (const [relPath, content] of Object.entries(nex.modules)) {
        const absPath = path.join(this._modulesDir, relPath);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf8');
        filesRestored++;
      }

      // 4. Emit
      this._kernel.ingest('nexus:revert:applied', {
        targetId: snapshotId, filesRestored, replayEvents, reason,
      }, { source: 'cb:revert' });

      this._ws?.broadcast({ type: 'nexus.revert.applied', snapshotId, filesRestored });

      console.log(`[NexusSnapshot] reverted to ${snapshotId} — ${filesRestored} files restored`);
      return { ok: true, filesRestored, replayEvents };

    } catch (err) {
      this._kernel.ingest('nexus:revert:failed', {
        targetId: snapshotId, error: err.message, reason,
      }, { source: 'cb:revert' });

      this._ws?.broadcast({ type: 'nexus.revert.failed', snapshotId, error: err.message });
      throw err;
    }
  }

  // ── Catalog ───────────────────────────────────────────────────────────────

  getCatalog() {
    return this._catalog.map(e => ({
      id:        e.id,
      ts:        e.ts,
      commit:    e.commit,
      reason:    e.reason,
      size:      e.size,
      fileCount: e.fileCount,
      clipId:    e.clipId,
      age:       Date.now() - e.ts,
    }));
  }

  getLatest() {
    return this._catalog[this._catalog.length - 1] ?? null;
  }

  async deleteSnapshot(id) {
    const idx = this._catalog.findIndex(e => e.id === id);
    if (idx < 0) return false;
    const entry = this._catalog[idx];
    try { fs.unlinkSync(entry.path); } catch (_) {}
    this._catalog.splice(idx, 1);
    this._saveCatalog();
    return true;
  }

  // ── Nexus kernel passthrough ───────────────────────────────────────────────

  /** Subscribe to snapshot lifecycle events */
  subscribe(fn) {
    return this._kernel?.subscribe(fn) ?? (() => {});
  }

  /** Get full event history from the snapshot kernel */
  getKernelEvents() {
    return this._kernel?.getAll() ?? [];
  }

  // ── File system helpers ───────────────────────────────────────────────────

  _readModulesDir(dir, base = dir, result = {}) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return result; }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath  = path.relative(base, fullPath).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        this._readModulesDir(fullPath, base, result);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (!INCLUDE_EXTS.has(ext)) continue;

        // Skip large files (>500KB individual file)
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 500_000) continue;
          result[relPath] = fs.readFileSync(fullPath, 'utf8');
        } catch (_) {}
      }
    }

    return result;
  }

  _loadCatalog() {
    try {
      const raw = fs.readFileSync(this._catalogPath, 'utf8');
      this._catalog = JSON.parse(raw);
      // Filter to entries whose .nex files still exist
      this._catalog = this._catalog.filter(e => fs.existsSync(e.path));
    } catch {
      this._catalog = [];
    }
  }

  _saveCatalog() {
    try {
      fs.writeFileSync(this._catalogPath, JSON.stringify(this._catalog, null, 2), 'utf8');
      this._kernel.ingest('nexus:catalog:updated', {
        count: this._catalog.length,
        latest: this._catalog[this._catalog.length - 1]?.id ?? null,
      }, { source: 'cb:catalog' });
    } catch (e) {
      console.warn('[NexusSnapshot] catalog save failed:', e.message);
    }
  }

  _pruneCatalog() {
    while (this._catalog.length > this._maxSnaps) {
      const oldest = this._catalog.shift();
      try { fs.unlinkSync(oldest.path); } catch (_) {}
    }
  }

  destroy() {
    this._store?.destroy();
  }
}

module.exports = { NexusSnapshotManager };
