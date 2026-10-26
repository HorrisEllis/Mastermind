/**
 * updater.js — Git-based hot reload.
 *
 * Polls the remote repo every POLL_INTERVAL ms.
 * On new commits: git pull → calls onUpdate callback → renderer reloads.
 *
 * DESIGN
 * ──────
 * - Uses simple-git (no git binary assumption beyond system git)
 * - Polls remote refs without fetching full objects first (cheap)
 * - Only pulls if behind remote (no unnecessary network)
 * - Exponential backoff on network failure
 * - Emits structured status for UI display
 * - Supports branch targeting (default: main)
 * - If REPO_URL not set: watches local directory via chokidar instead
 *   (dev mode — hot-reload on any file change without git)
 *
 * Local dev workflow:
 *   CB_REPO=https://github.com/user/repo.git electron .
 *   OR just run electron . and edit files — chokidar picks up changes.
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const { simpleGit } = require('simple-git');
const chokidar = require('chokidar');

const POLL_INTERVAL_MS  = 30_000;   // check remote every 30s
const BACKOFF_MAX_MS    = 300_000;  // max backoff 5min on errors
const BACKOFF_FACTOR    = 2;

class Updater {
  /**
   * @param {object} opts
   * @param {string}   opts.repoUrl   — remote git URL (https or ssh)
   * @param {string}   opts.repoDir   — local directory to pull into
   * @param {string}   [opts.branch]  — branch to track (default: main)
   * @param {function} opts.onUpdate  — called after successful pull with new commits
   * @param {function} [opts.onError] — called on error
   */
  constructor({ repoUrl, repoDir, branch = 'main', onUpdate, onError }) {
    this._url            = repoUrl;
    this._dir            = repoDir;
    this._branch         = branch;
    this._onUpdate       = onUpdate;
    this._onBeforeUpdate = onBeforeUpdate ?? null;
    this._onError        = onError ?? ((e) => console.error('[Updater]', e.message));

    this._git         = null;
    this._timer       = null;
    this._watcher     = null;
    this._interval    = POLL_INTERVAL_MS;
    this._lastCommit  = null;
    this._lastCheck   = null;
    this._running     = false;
    this._pulling     = false;

    this._status = {
      active:       false,
      mode:         this._url ? 'git' : 'watch',
      lastCheck:    null,
      lastCommit:   null,
      lastPull:     null,
      commitsBehind: 0,
      error:        null,
    };
  }

  async start() {
    this._running = true;
    this._status.active = true;

    if (this._url) {
      await this._initGit();
      this._schedulePoll();
      console.log(`[Updater] git mode — tracking ${this._url}#${this._branch}`);
    } else {
      this._startWatcher();
      console.log(`[Updater] watch mode — chokidar on ${this._dir}`);
    }
  }

  stop() {
    this._running = false;
    this._status.active = false;
    clearTimeout(this._timer);
    this._watcher?.close();
    this._git = null;
  }

  status() {
    return { ...this._status };
  }

  async pullNow() {
    if (!this._url || !this._git) return { ok: false, reason: 'no repo configured' };
    return this._poll(true);
  }

  // ── Git mode ───────────────────────────────────────────────────────────────

  async _initGit() {
    const dirExists = fs.existsSync(this._dir);

    if (!dirExists || !fs.existsSync(path.join(this._dir, '.git'))) {
      // Clone fresh
      console.log('[Updater] cloning repo…');
      fs.mkdirSync(this._dir, { recursive: true });
      const tmpGit = simpleGit();
      await tmpGit.clone(this._url, this._dir, ['--branch', this._branch, '--depth', '50']);
    }

    this._git = simpleGit(this._dir);
    const log = await this._git.log(['--max-count=1']);
    this._lastCommit = log.latest?.hash ?? null;
    this._status.lastCommit = this._lastCommit;
    console.log(`[Updater] at commit ${this._lastCommit?.slice(0,8)}`);
  }

  _schedulePoll() {
    if (!this._running) return;
    this._timer = setTimeout(() => this._poll(), this._interval);
  }

  async _poll(force = false) {
    if (!this._running || this._pulling) return;
    this._pulling = true;
    this._status.lastCheck = Date.now();
    this._lastCheck = Date.now();

    try {
      // Fetch remote refs only (cheap — no object download)
      await this._git.fetch(['--dry-run']);

      // Check if we're behind
      const status = await this._git.status();
      const behind = status.behind ?? 0;
      this._status.commitsBehind = behind;

      if (behind > 0 || force) {
        console.log(`[Updater] ${behind} commits behind. Pulling…`);

        // ── onBeforeUpdate: snapshot BEFORE applying changes ─────────────
        if (this._onBeforeUpdate) {
          try {
            await this._onBeforeUpdate({ commit: this._lastCommit, behind });
          } catch (hookErr) {
            console.error('[Updater] onBeforeUpdate hook failed:', hookErr.message);
            // Non-fatal — proceed with update anyway, but log it
          }
        }

        await this._git.pull('origin', this._branch, ['--ff-only']);

        const log = await this._git.log(['--max-count=1']);
        const newCommit = log.latest?.hash ?? null;

        if (newCommit !== this._lastCommit || force) {
          this._lastCommit = newCommit;
          this._status.lastCommit = newCommit;
          this._status.lastPull   = Date.now();
          this._status.error      = null;
          console.log(`[Updater] pulled → ${newCommit?.slice(0,8)}`);
          this._onUpdate(newCommit);
        }
      }

      // Success — reset backoff
      this._interval = POLL_INTERVAL_MS;
      this._status.error = null;

    } catch (err) {
      this._status.error = err.message;
      this._onError(err);
      // Exponential backoff
      this._interval = Math.min(this._interval * BACKOFF_FACTOR, BACKOFF_MAX_MS);
      console.warn(`[Updater] error — retry in ${this._interval/1000}s`);
    } finally {
      this._pulling = false;
      this._schedulePoll();
    }
  }

  // ── Watch mode (local dev, no git remote) ─────────────────────────────────

  _startWatcher() {
    // Debounce: only fire once per burst of file changes
    let debounce = null;

    this._watcher = chokidar.watch(this._dir, {
      ignored:    /(^|[\/\\])\..|(node_modules)/,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
    });

    this._watcher.on('all', (event, filePath) => {
      // Only care about JS/HTML/CSS changes
      if (!/\.(js|html|css|ts|json)$/.test(filePath)) return;

      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        console.log(`[Updater] file changed: ${path.basename(filePath)} — hot reload`);

        // ── onBeforeUpdate: snapshot before applying watched change ──────
        if (this._onBeforeUpdate) {
          try {
            await this._onBeforeUpdate({ commit: null, filePath });
          } catch (hookErr) {
            console.error('[Updater] onBeforeUpdate hook failed:', hookErr.message);
          }
        }

        this._status.lastPull = Date.now();
        this._onUpdate(filePath);
      }, 500);
    });

    this._watcher.on('error', (err) => {
      this._status.error = err.message;
      this._onError(err);
    });
  }
}

module.exports = { Updater };
