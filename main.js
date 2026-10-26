'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen, Tray, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');
const crypto = require('crypto');
const { startLocalServer } = require('./foundation/core/local-static-server.js');

// ── Crash-safe log ───────────────────────────────────────────────
const LOG_PATH = path.join(app.getPath('userData'), 'mastermind.log');
function log(...a) {
  const line = new Date().toISOString() + ' ' + a.join(' ') + '\n';
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
  console.log(...a);
}
process.on('uncaughtException', e => log('[CRASH]', e.stack || e.message));
process.on('unhandledRejection', r => log('[REJECT]', r?.stack || r));
log('[START] Mastermind v' + app.getVersion());

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const isWin  = process.platform === 'win32';
const isMac  = process.platform === 'darwin';

// Single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// Config
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');
function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return { dataDir: null, theme: 'mastermind', firstRun: true, windowBounds: null }; }
}
function writeConfig(cfg) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2)); }
  catch(e) { log('[CFG] write failed:', e.message); }
}
let CFG = readConfig();

// Icon (safe)
function getIconPath() {
  for (const p of [
    path.join(__dirname, 'assets', 'icon.ico'),
    path.join(__dirname, 'assets', 'icon.png'),
    path.join(__dirname, 'icon.ico'),
  ]) { if (fs.existsSync(p)) return p; }
  return undefined;
}

let mainWin = null;
let tray = null;
let isQuitting = false;

// ── Background / tray ────────────────────────────────────────────
// "Hidden, not headless": closing the main window must NOT kill the
// process. Mastermind's ClearGlass agent windows (foundation/ai/
// clearglass-main.js) are meant to keep running hidden — polling,
// fielding cg:ask calls — with no UI open at all. Before this, closing
// the window fired window-all-closed -> app.quit(), which tore down
// every hidden agent window along with it. Now the window hides itself
// on close, the process stays alive, and a tray icon is the only way
// back in (or out).
function createTray() {
  if (tray) return tray;
  const icon = getIconPath();
  try {
    tray = new Tray(icon || path.join(__dirname, 'assets', 'icon.ico'));
  } catch (e) {
    log('[TRAY] create failed:', e.message);
    return null;
  }
  tray.setToolTip('MASTERMIND — running in background');
  const rebuildMenu = () => {
    const menu = Menu.buildFromTemplate([
      { label: 'Show MASTERMIND', click: () => showMainWindow() },
      { type: 'separator' },
      { label: 'Quit MASTERMIND', click: () => { isQuitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
  };
  rebuildMenu();
  tray.on('click', () => showMainWindow());
  tray.on('double-click', () => showMainWindow());
  return tray;
}

function showMainWindow() {
  if (!mainWin || mainWin.isDestroyed()) { createWindow(); return; }
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.show();
  mainWin.focus();
}

// ── Local static server ───────────────────────────────────────────
// WebAuthn (security-key MFA) does not work on a file:// origin —
// Chromium refuses navigator.credentials there because there's no
// domain to bind a credential to. This serves the same files main.js
// used to hand Chromium via loadFile(), over http://localhost instead,
// so WebAuthn has an origin it will actually accept. 'localhost' is
// specifically carved out as a secure context in the spec — a raw
// 127.0.0.1 literal is not reliably treated the same way, so the
// server BINDS to 127.0.0.1 (loopback only, never reachable off this
// machine) but the window LOADS via the 'localhost' hostname.
//
// The server itself — token-gated paths, path-traversal protection,
// loopback bind — lives in foundation/core/local-static-server.js as a
// plain Node module with no Electron dependency, so it's unit-tested
// directly rather than only trusted because it's wrapped in a
// require('electron') that only runs inside a packaged app.
//
// Falls back to the old loadFile() behavior if the server can't start
// for any reason — the app should still open, just without WebAuthn,
// rather than fail outright over something as replaceable as this.

let _localServerHandle = null;

app.on('before-quit', () => { try { _localServerHandle?.close(); } catch {} });

function createWindow() {
  log('[WIN] creating');
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;

  const opts = {
    width:  CFG.windowBounds?.width  || sw,
    height: CFG.windowBounds?.height || sh,
    x: CFG.windowBounds?.x ?? undefined,
    y: CFG.windowBounds?.y ?? undefined,
    frame: false,
    show: false,
    backgroundColor: '#02040a',
    minWidth: 800, minHeight: 500,
    // thickFrame: false suppresses the Windows DWM orange/amber focus border
    // that appears on frameless windows on Windows 10/11
    thickFrame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  };

  // Windows 11 rounded — safe try
  if (isWin) { try { opts.roundedCorners = true; } catch {} }
  const icon = getIconPath();
  if (icon) opts.icon = icon;

  try {
    mainWin = new BrowserWindow(opts);
  } catch(e) {
    log('[WIN] fallback create:', e.message);
    mainWin = new BrowserWindow({
      width: 1280, height: 800, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
    });
  }

  const html = path.join(__dirname, 'index-browser.html');
  if (!fs.existsSync(html)) {
    dialog.showErrorBox('Missing file', 'index-browser.html not found.\nPlace all MASTERMIND files in the same folder.');
    app.quit(); return;
  }

  // Prefer the local server (gives WebAuthn a real origin); fall back to
  // loadFile if it fails to start for any reason.
  (async () => {
    try {
      if (!_localServerHandle) {
        _localServerHandle = await startLocalServer(__dirname, { defaultFile: 'index-browser.html' });
        log('[SRV] local static server on 127.0.0.1:' + _localServerHandle.port + ' (loopback only)');
      }
      await mainWin.loadURL(_localServerHandle.url('index-browser.html'));
    } catch (e) {
      log('[WIN] local server unavailable, falling back to loadFile:', e.message);
      mainWin.loadFile(html).catch(e2 => log('[WIN] load failed:', e2.message));
    }
  })();

  mainWin.once('ready-to-show', () => {
    log('[WIN] showing maximized');
    try { mainWin.maximize(); } catch(e) { log('[WIN] maximize failed:', e.message); }
    mainWin.show();
    mainWin.focus();
    if (isDev) try { mainWin.webContents.openDevTools({ mode: 'right' }); } catch {}
  });

  mainWin.webContents.on('did-finish-load', () => {
    try { mainWin.webContents.send('config-loaded', CFG); } catch {}
  });

  mainWin.webContents.on('render-process-gone', (_, d) => {
    log('[WIN] renderer gone:', d.reason);
    if (d.reason !== 'clean-exit') {
      try {
        const choice = dialog.showMessageBoxSync({
          type: 'error', title: 'MASTERMIND', message: 'App crashed. Relaunch?',
          buttons: ['Relaunch', 'Quit'],
        });
        if (choice === 0) { app.relaunch(); app.exit(0); } else app.quit();
      } catch { app.relaunch(); app.exit(0); }
    }
  });

  const saveBounds = () => {
    if (!mainWin || mainWin.isDestroyed()) return;
    if (mainWin.isMaximized() || mainWin.isMinimized()) return;
    try { CFG.windowBounds = mainWin.getBounds(); writeConfig(CFG); } catch {}
  };
  mainWin.on('resize', saveBounds);
  mainWin.on('move', saveBounds);
  mainWin.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWin.hide();
    log('[WIN] hidden to background (not headless) — ClearGlass agent windows and guardian keep running; use the tray icon to reopen or quit');
  });
  mainWin.on('closed', () => { mainWin = null; });
}

app.on('ready', () => {
  log('[APP] ready');
  if (isWin) try { app.setAppUserModelId('com.mastermind.app'); } catch {}
  try { nativeTheme.themeSource = 'dark'; } catch {}
  createWindow();
  createTray();
});

// A second launch attempt is turned away by requestSingleInstanceLock
// above, and Electron routes it here on the ORIGINAL process instead.
// Bug this replaces: the old handler only called mainWin.focus() —
// which is a no-op on a window that is hidden (not minimized). Once the
// main window started hiding-to-tray on close instead of quitting,
// "already running but hidden" became the normal steady state, so this
// fired constantly and did nothing every time: no crash, no error, just
// a launch attempt that silently produced no visible window. show()
// before focus() is the actual fix; showMainWindow() also recreates the
// window if it was ever destroyed outright, so this path can't strand
// the user with no way back in.
app.on('second-instance', () => {
  log('[LOCK] second instance blocked — surfacing the existing window');
  try { showMainWindow(); } catch (e) { log('[LOCK] showMainWindow failed:', e.message); }
});

// Windows are hidden, not destroyed (see mainWin 'close' + clearglass-main.js
// per-agent-window 'close' handlers), so this should rarely fire in normal
// use. When it does, stay alive in the background — that's the entire point
// of running hidden rather than headless. Only an explicit Quit (tray menu,
// Cmd+Q on mac, isQuitting) should end the process.
app.on('window-all-closed', () => { /* intentionally does not quit — background mode */ });
app.on('activate', () => { showMainWindow(); });
// The renderer asks for this from beforeunload when the vault is dirty.
// Without it, quit proceeds while the encrypt-and-write is still in
// flight and the last few nodes are lost — silently, because the app
// looked like it closed normally.
let _holdQuit = false;
// ── Phone as microphone ──────────────────────────────────────────
// The server lives in main because it needs a real socket. Audio frames
// arrive as Int16 PCM and are forwarded to the renderer, which feeds
// them into the same VAD/segment/queue path as the local microphone —
// so a phone is an input DEVICE, not a second capture pipeline.
const phoneMic = require('./foundation/ai/phone-mic.js');

ipcMain.handle('phone:start', async (_, opts) => {
  try {
    const r = await phoneMic.start(Object.assign({ dataDir: CFG.dataDir }, opts || {}));
    if (r.ok) {
      phoneMic.STATE.onAudio = (buf) => {
        try { mainWin?.webContents.send('phone:audio', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)); } catch (e) {}
      };
      phoneMic.STATE.onStatus = (st) => {
        try { mainWin?.webContents.send('phone:status', st); } catch (e) {}
      };
      log('[PHONE] listening on ' + r.url.replace(/\?t=.*/, '?t=***'));
    }
    return r;
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('phone:stop',   () => phoneMic.stop());
ipcMain.handle('phone:status', () => phoneMic.status());
ipcMain.handle('phone:detectCloudflared', () => phoneMic.detectCloudflared());
app.on('before-quit', () => { try { phoneMic.stop(); } catch (e) {} });

// ── Capture segments to disk ─────────────────────────────────────
// Written before transcription is attempted, so a crash or a failed
// whisper run costs a transcript rather than the recording. fsynced,
// because a buffered write that never reached the platform would defeat
// the entire point.
//
// Folder is keyed to the actual capture session id once one exists
// (via capture:sessionStarted, called from _vlBeginCapture in
// ui-capture.js the moment either the local mic or the phone starts
// recording) — NOT to when the app happened to launch. Before this,
// every session during one run of the app landed in the same
// launch-timestamped folder with no way to tell which segment belonged
// to which recording; a play/pause UI keyed by session id (see
// phasemap/PHASEMAP.md, "Open follow-ups (2026-08-28)") had nothing
// reliable to look up. Falls back to the launch-timestamp folder only
// if a session somehow never got wired — still written, never lost,
// just less precisely grouped.
let _captureSession = 'session-' + new Date().toISOString().replace(/[:.]/g, '-');

ipcMain.handle('capture:sessionStarted', (_, sessionId) => {
  if (typeof sessionId === 'string' && sessionId) _captureSession = sessionId;
  return { ok: true, folder: _captureSession };
});

ipcMain.handle('capture:writeSegment', (_, seq, arrayBuffer) => {
  try {
    if (!CFG.dataDir) return { ok: false, error: 'no data folder configured' };
    const outDir = path.join(CFG.dataDir, 'capture', _captureSession);
    fs.mkdirSync(outDir, { recursive: true });
    const file = path.join(outDir, String(seq).padStart(5, '0') + '.wav');
    const fd = fs.openSync(file, 'w');
    try { fs.writeSync(fd, Buffer.from(arrayBuffer)); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    return { ok: true, path: file };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('vault:holdQuitUntilSaved', () => { _holdQuit = true; setTimeout(() => { _holdQuit = false; }, 4000); return { ok: true }; });

app.on('before-quit', (e) => {
  if (_holdQuit) {
    e.preventDefault();
    log('[QUIT] holding for an in-flight vault write');
    setTimeout(() => { _holdQuit = false; app.quit(); }, 900);
    return;
  }
  isQuitting = true;
});

// IPC
const safe = fn => async (...args) => { try { return await fn(...args); } catch(e) { log('[IPC]', e.message); return null; } };

ipcMain.handle('win:minimize', () => mainWin?.minimize());
ipcMain.handle('win:maximize', () => mainWin?.isMaximized() ? mainWin.unmaximize() : mainWin.maximize());
ipcMain.handle('win:close',    () => mainWin?.close());
ipcMain.handle('win:isMax',    () => mainWin?.isMaximized() ?? false);

ipcMain.handle('config:get', () => CFG);
ipcMain.handle('config:set', (_, u) => { Object.assign(CFG, u); writeConfig(CFG); return CFG; });

ipcMain.handle('folder:pick', safe(async () => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: 'Select MASTERMIND data folder',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: CFG.dataDir || path.join(os.homedir(), 'Documents', 'MASTERMIND'),
  });
  return r.canceled ? null : r.filePaths[0];
}));

ipcMain.handle('folder:default', () => {
  const d = path.join(os.homedir(), 'Documents', 'MASTERMIND');
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
});

ipcMain.handle('folder:open', (_, p) => { try { if (p && fs.existsSync(p)) shell.openPath(p); } catch {} });

ipcMain.handle('folder:set', (_, p) => {
  try { CFG.dataDir = p; writeConfig(CFG); fs.mkdirSync(p, { recursive: true }); } catch(e) { log('[FOLDER] set:', e.message); }
  return p;
});

ipcMain.handle('vault:read',   (_, p) => vaultReadFile(p));
ipcMain.handle('vault:exists', (_, p) => vaultExistsFile(p));
ipcMain.handle('vault:delete', (_, p) => { try { fs.unlinkSync(p); return true; } catch { return false; } });

// Durability lives in foundation/vault/atomic-write.js so that main.js and
// the test suite share ONE implementation. Two copies of a write path is how
// the fsync ends up in the tested one and not the shipped one.
const { atomicWrite, readFile: vaultReadFile, exists: vaultExistsFile, probeFormat: vaultProbeFormat } =
  require('./foundation/vault/atomic-write.js');

ipcMain.handle('vault:write', (_, p, data) => atomicWrite(p, data));

// Diagnostic-only: sniffs the leading bytes of the file at `p` for a known
// archive signature (zip/gzip/7z/rar/...) without decoding it as text.
// Used exclusively by the boot pre-flight when `vault:read` + JSON.parse
// has already failed, to tell "this is a compressed archive, not a vault"
// apart from "this vault is corrupt" — see foundation/vault/atomic-write.js.
ipcMain.handle('vault:probe-format', (_, p) => vaultProbeFormat(p));

// ── Renderer error log ───────────────────────────────────────────
// MMLog (renderer, foundation/core/mastermind-foundation.js) is a
// 5000-entry in-memory ring buffer — exactly the entries someone needs
// after a crash or a failed save are the ones a reload throws away.
// This gives warn/error/critical entries a durable home NEXT TO the
// vault (dataDir, not userData) so the log travels with the data it
// describes and survives the renderer dying. Best-effort append, no
// fsync/verify ceremony — this is diagnostics, not the vault; losing a
// line is not the failure mode this exists to catch.
//
// One file per dataDir, capped and rotated so it cannot grow without
// bound over the life of a vault.
const ERROR_LOG_MAX_BYTES = 5 * 1024 * 1024; // 5MB, then rotate to .1
function _errorLogPathFor(dataDir) {
  return path.join(dataDir || CFG.dataDir || app.getPath('userData'), 'error.log');
}
ipcMain.handle('log:appendError', (_, dataDir, entry) => {
  try {
    const p = _errorLogPathFor(dataDir);
    try {
      const st = fs.statSync(p);
      if (st.size > ERROR_LOG_MAX_BYTES) {
        try { fs.unlinkSync(p + '.1'); } catch (e) {}
        fs.renameSync(p, p + '.1');
      }
    } catch (e) { /* no existing file yet — fine */ }

    const level  = (entry && entry.level)  || 'error';
    const module = (entry && entry.module) || '?';
    const msg    = (entry && entry.msg)    || '';
    const data   = entry && entry.data ? ' ' + JSON.stringify(entry.data) : '';
    const line = (entry && entry.iso || new Date().toISOString()) +
      ' [' + level.toUpperCase() + '] [' + module + '] ' + msg + data + '\n';
    fs.appendFileSync(p, line);
    return { ok: true };
  } catch (e) {
    log('[ERRLOG] append failed:', e.message);
    return { ok: false, error: e.message };
  }
});

// ── Audit ledger IPC ─────────────────────────────────────────────
// The ledger is main-process only. The renderer never gets a file handle,
// only appends and verdicts. append() refuses unknown event types and
// oversized payloads, so a compromised renderer cannot use the audit trail
// as a plaintext side channel for vault content.
const { VaultLedger } = require('./foundation/vault/vault-ledger.js');

function _ledgerFor(dataDir) {
  const dir = dataDir || CFG.dataDir;
  if (!dir) throw new Error('no data directory configured');
  return new VaultLedger(dir);
}

ipcMain.handle('ledger:append', (_, dataDir, type, data) => {
  try { return { ok: true, head: _ledgerFor(dataDir).append(type, data) }; }
  catch (e) { log('[LEDGER] append:', e.message); return { ok: false, error: e.message }; }
});

ipcMain.handle('ledger:state', (_, dataDir) => {
  try {
    const l = _ledgerFor(dataDir);
    const verify = l.verify();
    const read = l.readAll();
    return { ok: true, missing: !l.exists(), verify, entries: read.entries };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('ledger:recent', (_, dataDir, n) => {
  try { return { ok: true, entries: _ledgerFor(dataDir).recent(n || 50) }; }
  catch (e) { return { ok: false, error: e.message, entries: [] }; }
});

// ── Snapshots ────────────────────────────────────────────────────
// vault:backup used to be a bare copyFileSync into a name built with
// p.replace(/\.json$/, ...) — a pattern that never matched a file called
// mastermind.vault. No verification, no restore, no pruning. Replaced by a
// real snapshot manager; the old channel is kept as an alias so existing
// callers do not break.
const { VaultSnapshots } = require('./foundation/vault/vault-snapshots.js');

function _snapsFor(dataDir, vaultPath) {
  const dir = dataDir || CFG.dataDir;
  if (!dir) throw new Error('no data directory configured');
  return new VaultSnapshots(dir, vaultPath);
}

function _snapLedger(dataDir, type, data) {
  try { _ledgerFor(dataDir).append(type, data); } catch (e) { log('[SNAP] ledger:', e.message); }
}

ipcMain.handle('snapshot:create', (_, dataDir, vaultPath, reason) => {
  try {
    const res = _snapsFor(dataDir, vaultPath).create(reason);
    if (res.ok && !res.skipped) {
      _snapLedger(dataDir, 'vault.exported', { snapshot: res.name, sha: res.sha256.slice(0, 12) });
    }
    return res;
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('snapshot:list', (_, dataDir, vaultPath) => {
  try { return { ok: true, snapshots: _snapsFor(dataDir, vaultPath).list() }; }
  catch (e) { return { ok: false, error: e.message, snapshots: [] }; }
});

ipcMain.handle('snapshot:verify', (_, dataDir, vaultPath, name) => {
  try { return _snapsFor(dataDir, vaultPath).verify(name); }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('snapshot:status', (_, dataDir, vaultPath) => {
  try { return { ok: true, status: _snapsFor(dataDir, vaultPath).status() }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('snapshot:restore', (_, dataDir, vaultPath, name) => {
  try {
    const res = _snapsFor(dataDir, vaultPath).restore(name);
    if (res.ok) {
      // Recorded so the rollback guard sees a deliberate restore rather than
      // an unexplained older vault appearing on disk.
      _snapLedger(dataDir, 'vault.backup.restored', {
        snapshot: name, saveCount: res.saveCount || 0, priorSnapshot: res.priorSnapshot || null,
      });
    }
    return res;
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('snapshot:prune', (_, dataDir, vaultPath, policy) => {
  try { return _snapsFor(dataDir, vaultPath).prune(policy); }
  catch (e) { return { ok: false, error: e.message }; }
});

// Legacy alias
ipcMain.handle('vault:backup', (_, p) => {
  try { return _snapsFor(null, p).create('rotation'); }
  catch (e) { return { ok: false, error: e.message }; }
});

// ── Whisper: local transcription ─────────────────────────────────
// Main process only. Audio never leaves the machine and there is no
// cloud fallback — a fallback here would silently undo the reason the
// module exists.
const whisper = require('./foundation/ai/whisper.js');

ipcMain.handle('whisper:detect', async (_, cfg) => {
  try { return await whisper.detect(cfg || {}); }
  catch (e) { return { ok: false, reason: 'DETECT_FAILED', message: e.message }; }
});

ipcMain.handle('whisper:transcribe', async (_, arrayBuffer, cfg) => {
  try {
    const buf = Buffer.from(arrayBuffer);
    if (!buf.length) return { ok: false, reason: 'EMPTY_AUDIO' };
    return await whisper.transcribe(buf, cfg || {});
  } catch (e) {
    return { ok: false, reason: 'TRANSCRIBE_FAILED', message: e.message };
  }
});

// ── Voice note import ────────────────────────────────────────────
// Scanning and hashing only. The plan is built in the renderer by the
// pure planner; this side just reports what is on disk.
const AudioImport = require('./foundation/ai/audio-import.js');

ipcMain.handle('audio:pick', async () => {
  try {
    const r = await dialog.showOpenDialog(mainWin, {
      title: 'Import voice notes',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: AudioImport.AUDIO_EXT.map(e => e.slice(1)) }],
    });
    if (r.canceled) return { ok: true, files: [] };
    return { ok: true, files: r.filePaths };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('audio:pickFolder', async () => {
  try {
    const r = await dialog.showOpenDialog(mainWin, {
      title: 'Import a folder of voice notes',
      properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths[0]) return { ok: true, files: [] };
    const dir = r.filePaths[0];
    const out = [];
    const walk = (d, depth) => {
      if (depth > 4) return;   // deep recursion on a home folder is a trap
      for (const name of fs.readdirSync(d)) {
        const full = path.join(d, name);
        let st; try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) walk(full, depth + 1);
        else if (AudioImport.isAudio(name)) out.push(full);
      }
    };
    walk(dir, 0);
    return { ok: true, files: out, folder: dir };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Metadata for the planner. Hash is of the first and last 256KB plus
// the size — full hashing of a large backlog would take longer than the
// transcription, and this is enough to catch a re-import of the same file.
ipcMain.handle('audio:scan', (_, paths) => {
  const crypto = require('crypto');
  const out = [];
  for (const p of paths || []) {
    try {
      const st = fs.statSync(p);
      const h = crypto.createHash('sha256');
      const fd = fs.openSync(p, 'r');
      try {
        const chunk = Buffer.alloc(Math.min(262144, st.size));
        fs.readSync(fd, chunk, 0, chunk.length, 0);
        h.update(chunk);
        if (st.size > 262144) {
          const tail = Buffer.alloc(262144);
          fs.readSync(fd, tail, 0, 262144, st.size - 262144);
          h.update(tail);
        }
      } finally { fs.closeSync(fd); }
      h.update(String(st.size));

      out.push({
        path: p,
        name: path.basename(p),
        size: st.size,
        mtime: st.mtimeMs,
        // birthtime is unreliable on Linux and on copied files, so it is
        // offered as embedded-ish only when it predates mtime.
        embeddedCreatedAt: (st.birthtimeMs && st.birthtimeMs < st.mtimeMs) ? st.birthtimeMs : null,
        hash: h.digest('hex'),
        durationMs: null,   // filled by the renderer via decodeAudioData
      });
    } catch (e) {
      out.push({ path: p, name: path.basename(p), error: e.message });
    }
  }
  return { ok: true, files: out };
});

ipcMain.handle('audio:read', (_, p, offsetMs, durationMs) => {
  try {
    // Whole-file read; whisper is given -ot/-d offsets by the caller when
    // a segment is requested. Reading a slice of a compressed container
    // would produce an undecodable fragment.
    const buf = fs.readFileSync(p);
    return { ok: true, buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  } catch (e) { return { ok: false, error: e.message }; }
});

// ── Vault file watcher ───────────────────────────────────────────
// Watches the vault file itself. If it disappears or is written by
// something that is not us, the renderer hears about it immediately rather
// than at the next save — by which point the app would happily overwrite
// whatever replaced it.
let _vaultWatcher = null;
let _watchedPath  = null;

function _stopVaultWatch() {
  if (_vaultWatcher) { try { _vaultWatcher.close(); } catch (e) {} }
  _vaultWatcher = null; _watchedPath = null;
}

ipcMain.handle('vault:watch', (_, vaultPath) => {
  try {
    if (!vaultPath) return { ok: false, error: 'no path' };
    if (_watchedPath === vaultPath && _vaultWatcher) return { ok: true, already: true };
    _stopVaultWatch();

    const dir  = path.dirname(vaultPath);
    const base = path.basename(vaultPath);
    if (!fs.existsSync(dir)) return { ok: false, error: 'data folder does not exist' };

    // Watch the DIRECTORY, not the file. A watcher on the file itself dies
    // with the file — which is precisely the event worth hearing about.
    _vaultWatcher = fs.watch(dir, { persistent: false }, (evt, filename) => {
      if (!filename || path.basename(filename) !== base) return;
      const exists = fs.existsSync(vaultPath);
      try {
        mainWin?.webContents.send('vault:file-event', {
          event: exists ? 'changed' : 'removed',
          path: vaultPath,
          at: Date.now(),
        });
      } catch (e) {}
      if (!exists) log('[WATCH] VAULT FILE REMOVED:', vaultPath);
    });
    _watchedPath = vaultPath;
    log('[WATCH] watching', vaultPath);
    return { ok: true, watching: vaultPath };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('vault:unwatch', () => { _stopVaultWatch(); return { ok: true }; });

app.on('before-quit', _stopVaultWatch);

// ── Secure wipe ──────────────────────────────────────────────────
// Overwrites a file's actual on-disk bytes before deleting it, rather
// than just removing the directory entry (what a normal delete does —
// the file's data typically stays on disk, readable, until something
// else happens to overwrite those exact blocks later, sometimes never).
//
// HONEST LIMIT, told to the person in the UI too, not just here: on an
// SSD this is not a physical guarantee. Wear-leveling and TRIM mean the
// controller can remap "the same" logical file to different physical
// cells between writes, so overwriting in place may not touch the flash
// cells that held the old data at all — a well-documented limitation of
// software-level secure-delete on SSDs, not specific to this app. The
// vault's actual defense is that it's AES-256-GCM encrypted in the first
// place: as long as the password/key is never recoverable, the
// ciphertext being technically still readable on disk somewhere doesn't
// hand anyone the plaintext. This overwrite pass is real defense in
// depth on top of that (and the only meaningful option at all on a
// spinning HDD, where in-place overwrite genuinely does destroy the old
// data) — it is not a substitute for the encryption being sound, and the
// UI must not claim otherwise.
function _secureOverwriteAndDelete(filePath) {
  const size = fs.statSync(filePath).size;
  if (size > 0) {
    const fd = fs.openSync(filePath, 'r+');
    try {
      // Two random passes, then one all-zero pass, fsync after each so
      // a pass actually reaches the storage layer instead of sitting in
      // a write-back cache the whole time and getting coalesced away.
      for (let i = 0; i < 2; i++) {
        fs.writeSync(fd, crypto.randomBytes(size), 0, size, 0);
        fs.fsyncSync(fd);
      }
      fs.writeSync(fd, Buffer.alloc(size, 0), 0, size, 0);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  // Rename to a random name before unlinking — the original filename is
  // metadata too, and some filesystems retain it in a journal or
  // directory-entry log independent of the file's own content.
  const dir = path.dirname(filePath);
  const randomName = path.join(dir, '.' + crypto.randomBytes(16).toString('hex') + '.wipe-tmp');
  try {
    fs.renameSync(filePath, randomName);
    fs.unlinkSync(randomName);
  } catch (e) {
    fs.unlinkSync(filePath); // fall back to a direct unlink if the rename step itself failed
  }
}

ipcMain.handle('vault:secureWipe', (_, p) => {
  if (!p) return { ok: false, error: 'NO_PATH' };
  if (!fs.existsSync(p)) return { ok: false, error: 'NOT_FOUND' };
  const wiped = [], failed = [];
  // Wipe the vault itself, plus every backup snapshot vault:backup ever
  // created alongside it (<name>.backup.<timestamp>.json) — leaving
  // those behind would defeat the entire point of a "make recovery
  // impossible" wipe: the same data would just still be sitting right
  // next to it.
  const dir = path.dirname(p);
  const base = path.basename(p).replace(/\.json$/, '');
  const candidates = [p];
  try {
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith(base + '.backup.')) candidates.push(path.join(dir, f));
    }
  } catch (e) { /* backup dir scan is best-effort; the main vault wipe below still runs */ }
  for (const file of candidates) {
    try { _secureOverwriteAndDelete(file); wiped.push(file); }
    catch (e) { failed.push({ file, error: e.message }); }
  }
  log('[VAULT] secure wipe: ' + wiped.length + ' file(s) overwritten+deleted' + (failed.length ? ', ' + failed.length + ' FAILED' : ''));
  if (failed.length) log('[VAULT] secure wipe failures: ' + JSON.stringify(failed));
  return { ok: failed.length === 0, wiped, failed };
});

ipcMain.handle('file:save-dialog', safe(async (_, opts = {}) => {
  const r = await dialog.showSaveDialog(mainWin, {
    title: opts.title || 'Save',
    defaultPath: opts.defaultPath || path.join(os.homedir(), 'Desktop', opts.filename || 'export.json'),
    filters: opts.filters || [{ name: 'JSON', extensions: ['json'] }],
  });
  return r.canceled ? null : r.filePath;
}));

ipcMain.handle('file:open-dialog', safe(async (_, opts = {}) => {
  const r = await dialog.showOpenDialog(mainWin, {
    title: opts.title || 'Open',
    properties: ['openFile'],
    filters: opts.filters || [{ name: 'JSON', extensions: ['json'] }],
  });
  return r.canceled ? null : r.filePaths[0];
}));

ipcMain.handle('file:write', (_, p, d) => {
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, d, 'utf8'); return true; }
  catch(e) { log('[FILE] write:', e.message); return false; }
});

ipcMain.handle('file:read', (_, p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } });

ipcMain.handle('devtools:open',  () => { try { mainWin?.webContents.openDevTools({ mode: 'detach' }); } catch {} });
ipcMain.handle('app:version',    () => app.getVersion());
ipcMain.handle('app:path',       () => app.getPath('userData'));
ipcMain.handle('app:log-path',   () => LOG_PATH);
ipcMain.handle('app:open-log',   () => { try { shell.openPath(LOG_PATH); } catch {} });
ipcMain.handle('app:open-docs',  () => {
  const candidates = [
    path.join(__dirname, 'MASTERMIND_DOCS.html'),
    path.join(process.resourcesPath || '', 'app', 'MASTERMIND_DOCS.html'),
  ];
  const p = candidates.find((c) => { try { return fs.existsSync(c); } catch (e) { return false; } });
  if (!p) return { ok: false, error: 'DOCS_NOT_FOUND' };
  try { shell.openPath(p); return { ok: true, path: p }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('app:relaunch',   () => { log('[APP] relaunch'); app.relaunch(); app.exit(0); });

// ── ClearGlass baked in — claude.ai hosted in our own Electron ─────
// Replaces the guardian-lite + Tampermonkey + external-browser chain.
// Bridge userscript install (for the browser-mode relay fallback) is
// handled from the renderer side (nexus-engine.js, near aiLoad()) —
// gated on the baked-in cgAsk path actually being unavailable, which a
// main-process attempt here has no way to know since that's a renderer-
// side AI.provider/window.NXAPI check. Doing it here unconditionally on
// every boot would install/update the relay bridge even for people
// exclusively using the baked-in path, who will never touch it.
try {
  const cg = require('./foundation/ai/clearglass-main.js');
  cg.cgRegisterIpc(log, () => mainWin);
  app.on('before-quit', () => { try { cg.cgDestroy(); } catch {} });
  log('[CG] ClearGlass IPC registered');
} catch (e) { log('[CG] clearglass-main load failed: ' + e.message); }

log('[MAIN] ready');
