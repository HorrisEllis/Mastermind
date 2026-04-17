'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, screen } = require('electron');
const path = require('path');
const fs   = require('fs');
const os   = require('os');

// ── Crash-safe log ───────────────────────────────────────────────
const LOG_PATH = path.join(app.getPath('userData'), 'mastermind.log');
function log(...a) {
  const line = new Date().toISOString() + ' ' + a.join(' ') + '\n';
  try { fs.appendFileSync(LOG_PATH, line); } catch {}
  console.log(...a);
}
process.on('uncaughtException', e => log('[CRASH]', e.stack || e.message));
process.on('unhandledRejection', r => log('[REJECT]', r?.stack || r));
log('[START] Mastermind v3.1');

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

  mainWin.loadFile(html).catch(e => log('[WIN] load failed:', e.message));

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
  mainWin.on('closed', () => { mainWin = null; });
}

app.on('ready', () => {
  log('[APP] ready');
  if (isWin) try { app.setAppUserModelId('com.mastermind.app'); } catch {}
  try { nativeTheme.themeSource = 'dark'; } catch {}
  createWindow();
});

app.on('second-instance', () => {
  if (mainWin) try { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } catch {}
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });

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

ipcMain.handle('vault:read',   (_, p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } });
ipcMain.handle('vault:exists', (_, p) => { try { return fs.existsSync(p); } catch { return false; } });
ipcMain.handle('vault:delete', (_, p) => { try { fs.unlinkSync(p); return true; } catch { return false; } });

ipcMain.handle('vault:write', (_, p, data) => {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p + '.tmp', data, 'utf8');
    fs.renameSync(p + '.tmp', p);
    return { ok: true };
  } catch(e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('vault:backup', (_, p) => {
  try {
    if (!fs.existsSync(p)) return { ok: false, error: 'not found' };
    const b = p.replace(/\.json$/, '') + '.backup.' + Date.now() + '.json';
    fs.copyFileSync(p, b); return { ok: true, backupPath: b };
  } catch(e) { return { ok: false, error: e.message }; }
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
ipcMain.handle('app:relaunch',   () => { log('[APP] relaunch'); app.relaunch(); app.exit(0); });

log('[MAIN] ready');
