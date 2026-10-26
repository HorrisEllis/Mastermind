// ═══════════════════════════════════════════════════════════════════
// MASTERMIND — Preload Script
// Secure contextBridge — exposes NXAPI to renderer
// ═══════════════════════════════════════════════════════════════════

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// §5.4 — one version, one source. package.json is it. Read here rather than
// fetched over IPC so that renderer scripts which run before any async work
// completes still see the real number instead of a placeholder.
let _pkgVersion = '0.0.0-unknown';
try { _pkgVersion = require('./package.json').version; } catch (e) {}

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
  // Diagnostic-only, boot pre-flight: sniffs leading bytes for a known
  // archive signature (zip/gzip/7z/...) without decoding the file as text.
  vaultProbeFormat: (path) => ipcRenderer.invoke('vault:probe-format', path),
  errorLogAppend: (dataDir, entry) => ipcRenderer.invoke('log:appendError', dataDir, entry),
  holdQuitUntilSaved: ()      => ipcRenderer.invoke('vault:holdQuitUntilSaved'),
  captureWriteSegment: (seq, buf) => ipcRenderer.invoke('capture:writeSegment', seq, buf),
  captureSessionStarted: (sessionId) => ipcRenderer.invoke('capture:sessionStarted', sessionId),

  // Phone as an input device. Audio arrives as Int16 PCM frames and is
  // fed into the same capture path as the local microphone.
  phoneStart:    (opts) => ipcRenderer.invoke('phone:start', opts),
  phoneStop:     ()     => ipcRenderer.invoke('phone:stop'),
  phoneStatus:   ()     => ipcRenderer.invoke('phone:status'),
  phoneDetectCloudflared: () => ipcRenderer.invoke('phone:detectCloudflared'),
  onPhoneAudio:  (cb)   => ipcRenderer.on('phone:audio',  (_e, buf) => cb(buf)),
  onPhoneStatus: (cb)   => ipcRenderer.on('phone:status', (_e, st)  => cb(st)),
  vaultBackup:   (path) => ipcRenderer.invoke('vault:backup', path),
  vaultExists:   (path) => ipcRenderer.invoke('vault:exists', path),

  // Audit ledger — hash-chained, main process owns the file.
  ledgerAppend:  (dataDir, type, data) => ipcRenderer.invoke('ledger:append', dataDir, type, data),
  ledgerState:   (dataDir)             => ipcRenderer.invoke('ledger:state', dataDir),
  ledgerRecent:  (dataDir, n)          => ipcRenderer.invoke('ledger:recent', dataDir, n),

  // Snapshots — verified, restorable, pruned.
  snapshotCreate:  (dataDir, vaultPath, reason) => ipcRenderer.invoke('snapshot:create', dataDir, vaultPath, reason),
  snapshotList:    (dataDir, vaultPath)         => ipcRenderer.invoke('snapshot:list', dataDir, vaultPath),
  snapshotVerify:  (dataDir, vaultPath, name)   => ipcRenderer.invoke('snapshot:verify', dataDir, vaultPath, name),
  snapshotStatus:  (dataDir, vaultPath)         => ipcRenderer.invoke('snapshot:status', dataDir, vaultPath),
  snapshotRestore: (dataDir, vaultPath, name)   => ipcRenderer.invoke('snapshot:restore', dataDir, vaultPath, name),
  snapshotPrune:   (dataDir, vaultPath, policy) => ipcRenderer.invoke('snapshot:prune', dataDir, vaultPath, policy),

  // Vault file watcher. onVaultFileEvent fires on deletion or outside edits.
  // Voice note import — the virtual input.
  audioPick:       ()                    => ipcRenderer.invoke('audio:pick'),
  audioPickFolder: ()                    => ipcRenderer.invoke('audio:pickFolder'),
  audioScan:       (paths)               => ipcRenderer.invoke('audio:scan', paths),
  audioRead:       (p, off, dur)         => ipcRenderer.invoke('audio:read', p, off, dur),

  // Local transcription. No network path exists on this channel.
  whisperDetect:     (cfg)           => ipcRenderer.invoke('whisper:detect', cfg),
  whisperTranscribe: (buffer, cfg)   => ipcRenderer.invoke('whisper:transcribe', buffer, cfg),

  vaultWatch:      (vaultPath) => ipcRenderer.invoke('vault:watch', vaultPath),
  vaultUnwatch:    ()          => ipcRenderer.invoke('vault:unwatch'),
  onVaultFileEvent: (cb) => ipcRenderer.on('vault:file-event', (_e, payload) => cb(payload)),
  vaultDelete:   (path) => ipcRenderer.invoke('vault:delete', path),
  vaultSecureWipe: (path) => ipcRenderer.invoke('vault:secureWipe', path),

  // File dialogs
  saveFileDialog:(opts) => ipcRenderer.invoke('file:save-dialog', opts),
  openFileDialog:(opts) => ipcRenderer.invoke('file:open-dialog', opts),
  writeFile:     (path, data) => ipcRenderer.invoke('file:write', path, data),
  readFile:      (path) => ipcRenderer.invoke('file:read', path),

  // DevTools & app
  openDevTools:  () => ipcRenderer.invoke('devtools:open'),
  getVersion:    () => ipcRenderer.invoke('app:version'),

  // Synchronous, available at script-eval time. Same package.json
  // app.getVersion() reads, so the two can never disagree.
  version:       _pkgVersion,
  cgAgents:      () => ipcRenderer.invoke('cg:agents'),
  cgInstallUserscript: (dir) => ipcRenderer.invoke('cg:installUserscript', { dir }),
  cgDetectGuardian: () => ipcRenderer.invoke('cg:detectGuardian'),
  cgStatus:      (agent, accountId) => ipcRenderer.invoke('cg:status', { agent, accountId }),
  cgStatusAll:   (accounts) => ipcRenderer.invoke('cg:statusAll', { accounts }),
  cgOpen:        (agent, accountId, show) => ipcRenderer.invoke('cg:open', { agent, accountId, show }),
  cgHide:        (agent, accountId) => ipcRenderer.invoke('cg:hide', { agent, accountId }),
  cgSignOut:     (agent, accountId) => ipcRenderer.invoke('cg:signOut', { agent, accountId }),
  cgAsk:         (agent, accountId, prompt, timeoutMs, fresh) => ipcRenderer.invoke('cg:ask', { agent, accountId, prompt, timeoutMs, fresh }),
  cgPeek:        (agent, accountId) => ipcRenderer.invoke('cg:peek', { agent, accountId }),
  onSignedIn:    (fn) => ipcRenderer.on('cg:signed-in', (_e, d) => { try { fn(d); } catch (e) {} }),
  onSignInTimeout: (fn) => ipcRenderer.on('cg:signin-timeout', (_e, d) => { try { fn(d); } catch (e) {} }),
  getUserDataPath:() => ipcRenderer.invoke('app:path'),
  relaunch:      () => ipcRenderer.invoke('app:relaunch'),
  openLog:       () => ipcRenderer.invoke('app:open-log'),
  openDocs:      () => ipcRenderer.invoke('app:open-docs'),

  // Config-loaded event (sent from main after window loads)
  onConfigLoaded:(cb) => {
    ipcRenderer.on('config-loaded', (_, cfg) => cb(cfg));
  },

  // Remove listener helper
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});

console.log('[preload] NXAPI bridge ready');
