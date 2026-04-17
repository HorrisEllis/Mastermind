// ═══════════════════════════════════════════════════════════════════
// MASTERMIND — Preload Script
// Secure contextBridge — exposes NXAPI to renderer
// ═══════════════════════════════════════════════════════════════════

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose NXAPI — same interface the app expects
contextBridge.exposeInMainWorld('NXAPI', {
  // Window controls
  minimize:      () => ipcRenderer.invoke('win:minimize'),
  maximize:      () => ipcRenderer.invoke('win:maximize'),
  close:         () => ipcRenderer.invoke('win:close'),
  isMaximized:   () => ipcRenderer.invoke('win:isMax'),

  // Config
  getConfig:     () => ipcRenderer.invoke('config:get'),
  saveConfig:    (updates) => ipcRenderer.invoke('config:set', updates),

  // Folder / data dir
  pickDataFolder:() => ipcRenderer.invoke('folder:pick'),
  defaultFolder: () => ipcRenderer.invoke('folder:default'),
  setDataDir:    (dir) => ipcRenderer.invoke('folder:set', dir),
  openFolder:    (dir) => ipcRenderer.invoke('folder:open', dir),

  // Vault file I/O
  vaultRead:     (path) => ipcRenderer.invoke('vault:read', path),
  vaultWrite:    (path, data) => ipcRenderer.invoke('vault:write', path, data),
  vaultBackup:   (path) => ipcRenderer.invoke('vault:backup', path),
  vaultExists:   (path) => ipcRenderer.invoke('vault:exists', path),
  vaultDelete:   (path) => ipcRenderer.invoke('vault:delete', path),

  // File dialogs
  saveFileDialog:(opts) => ipcRenderer.invoke('file:save-dialog', opts),
  openFileDialog:(opts) => ipcRenderer.invoke('file:open-dialog', opts),
  writeFile:     (path, data) => ipcRenderer.invoke('file:write', path, data),
  readFile:      (path) => ipcRenderer.invoke('file:read', path),

  // DevTools & app
  openDevTools:  () => ipcRenderer.invoke('devtools:open'),
  getVersion:    () => ipcRenderer.invoke('app:version'),
  getUserDataPath:() => ipcRenderer.invoke('app:path'),
  relaunch:      () => ipcRenderer.invoke('app:relaunch'),

  // Config-loaded event (sent from main after window loads)
  onConfigLoaded:(cb) => {
    ipcRenderer.on('config-loaded', (_, cfg) => cb(cfg));
  },

  // Remove listener helper
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

console.log('[preload] NXAPI bridge ready');
