/**
 * preload.js — Context bridge. Exposes safe IPC API to renderer.
 * Nothing from Node leaks through except what is explicitly listed here.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CrystalBall', {

  // ── Pipeline (codec, buffer, WebRTC) ────────────────────────────────────
  pipeline: {
    sendFrame:   (type, data, meta) => ipcRenderer.invoke('pipeline:frame',  { type, data, meta }),
    sendAudio:   (data, meta)       => ipcRenderer.invoke('pipeline:audio',  { data, meta }),
    getStats:    ()                 => ipcRenderer.invoke('pipeline:stats'),
  },

  // ── Virtual camera ───────────────────────────────────────────────────────
  vcam: {
    loadFile: (filePath, meta) => ipcRenderer.invoke('vcam:upload', { filePath, meta }),
  },

  // ── WebRTC magnet link ───────────────────────────────────────────────────
  magnet: {
    offer:  (magnet) => ipcRenderer.invoke('magnet:offer',  { magnet }),
    answer: (answer) => ipcRenderer.invoke('magnet:answer', { answer }),
  },

  // ── Auto-updater ─────────────────────────────────────────────────────────
  updater: {
    status:  ()  => ipcRenderer.invoke('updater:status'),
    pullNow: ()  => ipcRenderer.invoke('updater:pull'),
  },

  // ── Nexus Snapshot Manager ────────────────────────────────────────────────
  nexus: {
    snapshot: (reason)    => ipcRenderer.invoke('nexus:snapshot', { reason }),
    catalog:  ()          => ipcRenderer.invoke('nexus:catalog'),
    revert:   (id, reason)=> ipcRenderer.invoke('nexus:revert',   { id, reason }),
    events:   ()          => ipcRenderer.invoke('nexus:events'),
  },

  // ── Shell ────────────────────────────────────────────────────────────────
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),

  // ── Runtime info (injected by main via URL params) ────────────────────────
  env: {
    wsPort:   new URLSearchParams(window.location.search).get('wsPort')  ?? '7750',
    vcamId:   new URLSearchParams(window.location.search).get('vcamId')  ?? '',
    isDev:    new URLSearchParams(window.location.search).get('isDev')   === '1',
  },
});
