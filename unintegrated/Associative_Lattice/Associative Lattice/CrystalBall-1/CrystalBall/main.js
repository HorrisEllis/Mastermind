/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CRYSTALBALL  ·  main.js  ·  v1.0.0                                   ║
 * ║  Electron main process — kernel container + auto-update + IPC bridge  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ARCHITECTURE
 * ────────────
 *  main.js           ← this file. Node-land. Window management, update loop,
 *                       WebSocket server, virtual camera bridge, IPC.
 *  src/preload.js    ← context bridge. Safe IPC channel exposure to renderer.
 *  src/updater.js    ← Git-based hot reload. Watches repo, pulls, restarts.
 *  src/vcam.js       ← Virtual camera. FFmpeg pipe → v4l2loopback (Linux) /
 *                       OBS Virtual Camera protocol (Mac/Win). Exposes as
 *                       a real webcam device to MediaPipe in the renderer.
 *  src/pipeline.js   ← Codec pipeline. 2-second jitter buffer, bitstream
 *                       monitor, WebRTC encrypted pipe via magnet link.
 *  src/ws-server.js  ← Local WebSocket server. Cross-domain bridge for
 *                       renderer ↔ Node, renderer ↔ virtual device.
 *  modules/          ← CrystalBall module tree (ALK + Resonance + new modules)
 *  index.html        ← Renderer entry point (served from modules/ALK/)
 */

'use strict';

const { app, BrowserWindow, ipcMain, session, protocol, shell } = require('electron');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const { Updater }       = require('./src/updater');
const { WsServer }      = require('./src/ws-server');
const { VCamBridge }    = require('./src/vcam');
const { Pipeline }      = require('./src/pipeline');
const { NexusSnapshotManager } = require('./src/nexus-snapshot');

// ─── Constants ────────────────────────────────────────────────────────────────

const IS_DEV     = process.argv.includes('--dev') || !app.isPackaged;
const APP_ROOT   = path.join(__dirname);
const MODULES    = path.join(APP_ROOT, 'modules');
const INDEX_HTML = path.join(MODULES, 'ALK', 'index.html');
const REPO_URL   = process.env.CB_REPO || '';
const REPO_DIR   = path.join(APP_ROOT, 'modules');
const WS_PORT    = 7750;
const APP_DATA   = path.join(app.getPath ? app.getPath('userData') : path.join(APP_ROOT, '.appdata'), 'crystalball');

// ─── State ────────────────────────────────────────────────────────────────────

let mainWindow   = null;
let updater      = null;
let wsServer     = null;
let vcam         = null;
let pipeline     = null;
let nexusSnap    = null;

// ─── App bootstrap ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {

  // Register local file protocol so ES module imports work from disk
  protocol.registerFileProtocol('crystalball', (request, callback) => {
    const url  = request.url.replace('crystalball://', '');
    const file = path.join(APP_ROOT, url);
    callback({ path: file });
  });

  // ── CSP: allow local files + STUN/TURN WebRTC + WebSocket localhost ───────
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' " +
          "file: blob: data: mediastream: " +
          "https://cdn.jsdelivr.net https://storage.googleapis.com " +
          "wss://localhost:* ws://localhost:* " +
          "stun:stun.l.google.com:19302"
        ],
      },
    });
  });

  // ── WebSocket server (cross-domain bridge) ────────────────────────────────
  wsServer = new WsServer({ port: WS_PORT });
  await wsServer.start();
  console.log(`[WsServer] listening on ws://localhost:${WS_PORT}`);

  // ── Virtual camera bridge ─────────────────────────────────────────────────
  vcam = new VCamBridge({ wsServer });
  await vcam.init();

  // ── Pipeline: codec + buffer + WebRTC ────────────────────────────────────
  pipeline = new Pipeline({ wsServer });
  pipeline.start();

  // ── Nexus Snapshot Manager ────────────────────────────────────────────────
  nexusSnap = new NexusSnapshotManager({
    appDataDir:  APP_DATA,
    modulesDir:  REPO_DIR,
    wsServer,
    maxSnapshots: 20,
  });
  await nexusSnap.init();

  // Forward nexus kernel events to renderer via WS
  nexusSnap.subscribe((ev) => {
    if (ev.type.startsWith('nexus:') || ev.type.startsWith('crystalball:')) {
      wsServer?.broadcast({ type: 'nexus.event', event: ev });
    }
  });

  // Take an initial snapshot on startup (baseline)
  try {
    await nexusSnap.snapshotModules({ reason: 'startup' });
  } catch (e) {
    console.warn('[main] startup snapshot failed (non-fatal):', e.message);
  }

  // ── Create main window ────────────────────────────────────────────────────
  mainWindow = createWindow();

  // ── Updater: watch repo + hot-reload ─────────────────────────────────────
  if (REPO_URL) {
    updater = new Updater({
      repoUrl:  REPO_URL,
      repoDir:  REPO_DIR,
      // ── SNAPSHOT BEFORE EVERY UPDATE ─────────────────────────────────────
      onBeforeUpdate: async ({ commit, behind }) => {
        console.log('[main] pre-update snapshot…');
        await nexusSnap?.snapshotModules({
          commit,
          reason: 'pre-update',
        });
      },
      // ── RELOAD AFTER UPDATE + VALIDATE STABILITY ─────────────────────────
      onUpdate: async (newCommit) => {
        console.log('[Updater] New code pulled. Reloading renderer…');
        mainWindow?.webContents.reload();
        wsServer?.broadcast({ type: 'update.deployed', commit: newCommit?.slice?.(0,7) ?? null });

        // After renderer reloads, give it 3s to settle then validate
        setTimeout(async () => {
          try {
            const recentEvents = nexusSnap?.getKernelEvents().slice(-100) ?? [];
            const result = await nexusSnap?.validatePostUpdate(recentEvents);
            if (result?.ok === false) {
              wsServer?.broadcast({ type: 'nexus.auto_revert', reason: result.breach });
            } else {
              nexusSnap?._kernel.ingest('crystalball:update:safe', {
                commit:     newCommit?.slice?.(0,7) ?? null,
                snapshotId: nexusSnap?.getLatest()?.id ?? null,
              }, { source: 'cb:updater' });
            }
          } catch (e) {
            console.warn('[main] post-update validation error:', e.message);
          }
        }, 3000);
      },
      onError: (err) => {
        console.error('[Updater] error:', err.message);
        wsServer?.broadcast({ type: 'update.error', message: err.message });
      },
    });
    updater.start();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    updater?.stop();
    wsServer?.stop();
    vcam?.destroy();
    pipeline?.stop();
    nexusSnap?.destroy();
    app.quit();
  }
});

// ─── Window factory ───────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:  1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#040a07',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload:               path.join(__dirname, 'src', 'preload.js'),
      contextIsolation:      true,
      nodeIntegration:       false,
      webSecurity:           false,  // allow local ES module imports
      allowRunningInsecureContent: false,
      // MediaPipe WASM + camera access
      experimentalFeatures:  true,
    },
  });

  // Pass WS port + vcam device info to renderer via URL params
  const vcamDeviceId = vcam?.deviceId ?? '';
  const url = new URL(`file://${INDEX_HTML}`);
  url.searchParams.set('wsPort',   WS_PORT.toString());
  url.searchParams.set('vcamId',   vcamDeviceId);
  url.searchParams.set('isDev',    IS_DEV ? '1' : '0');

  win.loadURL(url.href);

  if (IS_DEV) win.webContents.openDevTools({ mode: 'detach' });

  win.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('[Window] load failed:', code, desc);
  });

  return win;
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Renderer → Main: send a frame blob to the pipeline
ipcMain.handle('pipeline:frame', async (_, { type, data, meta }) => {
  return pipeline?.ingestFrame({ type, data, meta });
});

// Renderer → Main: send audio chunk to pipeline
ipcMain.handle('pipeline:audio', async (_, { data, meta }) => {
  return pipeline?.ingestAudio({ data, meta });
});

// Renderer → Main: push file upload into virtual camera
ipcMain.handle('vcam:upload', async (_, { filePath, meta }) => {
  return vcam?.loadFile(filePath, meta);
});

// Renderer → Main: magnet link negotiation
ipcMain.handle('magnet:offer', async (_, { magnet }) => {
  return pipeline?.handleMagnetOffer(magnet);
});

ipcMain.handle('magnet:answer', async (_, { answer }) => {
  return pipeline?.handleMagnetAnswer(answer);
});

// Renderer → Main: get pipeline stats (bitstream monitor)
ipcMain.handle('pipeline:stats', async () => {
  return pipeline?.stats();
});

// Renderer → Main: get update status
ipcMain.handle('updater:status', async () => {
  return updater?.status() ?? { active: false, lastCheck: null, lastCommit: null };
});

// Renderer → Main: force pull
ipcMain.handle('updater:pull', async () => {
  return updater?.pullNow();
});

// ── Nexus Snapshot IPC ────────────────────────────────────────────────────────

// Manual snapshot
ipcMain.handle('nexus:snapshot', async (_, { reason } = {}) => {
  return nexusSnap?.snapshotModules({ reason: reason ?? 'manual' });
});

// Get catalog
ipcMain.handle('nexus:catalog', async () => {
  return nexusSnap?.getCatalog() ?? [];
});

// Revert to a snapshot
ipcMain.handle('nexus:revert', async (_, { id, reason } = {}) => {
  if (!id) return { ok: false, error: 'id required' };
  try {
    const result = await nexusSnap?.revert(id, reason ?? 'manual');
    // Reload renderer after revert
    if (result?.ok) {
      setTimeout(() => mainWindow?.webContents.reload(), 500);
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Get nexus kernel event history (snapshot lifecycle events)
ipcMain.handle('nexus:events', async () => {
  return nexusSnap?.getKernelEvents() ?? [];
});

// Renderer → Main: open external URL safely
ipcMain.handle('shell:open', async (_, url) => {
  if (url.startsWith('https://') || url.startsWith('http://')) {
    await shell.openExternal(url);
  }
});
