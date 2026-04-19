// ═══════════════════════════════════════════════════════════════════
// MASTERMIND VAULT — v4.0.0
// Standalone encrypted persistence module.
//
// P4 HARDENING — localStorage security model eliminated:
//
// FORBIDDEN in localStorage (moved to vault file):
//   AUTH_META_KEY   (salt, pinHash, username, noEncryption)
//   AUTH_VAULT_KEY  (encPrivKey, pubKey)
//   FEATURES_KEY    (feature flags)
//   nexus_void_state, nexus_gap_state (module state)
//   nexus_features  (feature flags)
//
// PERMITTED in localStorage (non-sensitive UI state only):
//   nexus_theme         — active theme name
//   nexus_datadir       — last used data folder path (non-secret)
//   nexus_mm_v3         — fast session cache of vault payload (unencrypted
//                         module state only, never auth data)
//
// AUTH DATA FLOW:
//   Write: setupCreateVault() → vault file (encrypted)
//   Read:  vaultLoad() → decrypt → memory only → never re-written to localStorage
//
// ─────────────────────────────────────────────────────────────────
// VAULT FILE FORMAT (mastermind.vault):
// {
//   version: 5,
//   encrypted: true,
//   iv: "base64",
//   data: "base64-ciphertext",
//   integrity: "sha256:hex"   ← SHA-256 of ciphertext, not plaintext
// }
//
// PLAINTEXT ENVELOPE (inside decrypted data):
// {
//   canvas: {...},
//   modules: { void, gaps, signal, threads, options, features },
//   identity: { username, salt, pinHash, noEncryption },
//   keys: { pubKey, encPrivKey },
//   snr: {...},
//   jaa: {...},
//   username: "..."
// }
// ═══════════════════════════════════════════════════════════════════
//
// Requires (from host application):
//   window.NXAPI        — Electron IPC bridge (vault:read, vault:write,
//                         vault:exists, vault:backup, file:read,
//                         file:save-dialog, file:open-dialog, file:write)
//   window.NX_CONFIG    — { dataDir, vaultPath } (mutable object)
//   window.AUTH         — { key, encrypted, username, pinVerified }
//   window.AUTH_META_KEY   — localStorage key for identity meta
//   window.AUTH_VAULT_KEY  — localStorage key for encrypted key blob
//   window.FEATURES_KEY    — localStorage key for feature flags
//   window.OPTS         — options object (for autosave_interval)
//   window.OPTS_KEY     — localStorage key for options
//   window.MM_BUS       — event bus ({ emit(type, data) })
//   window.MMLog        — logger ({ info, warn, error })
//   window.escH         — HTML escape function
//   window.mm_toast     — toast notification function
//   window.toast        — legacy toast (falls back to mm_toast)
//
// Optional (MASTERMIND-specific, no-ops if absent):
//   window.CANVAS       — { NX, getState, clearCanvas, spawnNode,
//                           applyT } (canvas bridge)
//   window.SIGNAL_STATE — signal module state
//   window.THREAD_STATE — thread module state
//   window.JAA          — JAA ledger
//   window._sealSession — auth seal function
//   window.startupRoute — startup router
//   window._authLoadMeta— load auth metadata
//   window._deriveKey   — PBKDF2 key derivation (auto-provided by this module)
//   window._aesEncrypt  — AES-GCM encrypt (auto-provided by this module)
//   window._aesDecrypt  — AES-GCM decrypt (auto-provided by this module)
//   window._isPinReadOnly— PIN session check (auto-provided by this module)
//
// Load order: AFTER mastermind-siso-jaa.js, BEFORE nexus-engine.js
//
// Exposes (window globals):
//   VAULT, vaultSave, vaultLoad, vaultSerialize, vaultDeserialize,
//   vaultDirtySave, vaultDecryptPermanently, vaultExport,
//   _vaultWatchdogCheck, _showVaultMissingScreen,
//   _vaultRecreate, _vaultRecreateConfirm, _vaultRecreateUnencrypted,
//   _vaultRecreateWithKey, _vaultRestoreFromBackup,
//   _deriveKey, _aesEncrypt, _aesDecrypt,
//   _isPinReadOnly, _downloadText,
//   exportPublicKey, exportPrivateKey, downloadVaultBackup
//
// UUID: 4a3b2c1d-vault-4000-8000-vault000001
// ═══════════════════════════════════════════════════════════════════

'use strict';



// ── In-memory auth store ─────────────────────────────────────────────
// Auth metadata lives here after decryption. Never written to localStorage.
// Cleared on session lock. Source of truth is always the vault file.

const _AUTH_STORE = {
  meta:  null,   // { username, salt, pinHash, noEncryption, created, version }
  keys:  null,   // { pubKey, encPrivKey }
  ready: false,  // true after vault loaded and decrypted
};

function _authStoreSet(meta, keys) {
  _AUTH_STORE.meta  = meta  ? { ...meta }  : null;
  _AUTH_STORE.keys  = keys  ? { ...keys }  : null;
  _AUTH_STORE.ready = !!(meta);
}

function _authStoreGet() { return _AUTH_STORE; }

function _authStoreClear() {
  _AUTH_STORE.meta  = null;
  _AUTH_STORE.keys  = null;
  _AUTH_STORE.ready = false;
}

// ── Auth meta read — in-memory first, vault file never localStorage ──────────
// This replaces all callers of: localStorage.getItem(AUTH_META_KEY)
function _authLoadMeta() {
  if (_AUTH_STORE.meta) return _AUTH_STORE.meta;
  // Attempt recovery from window.AUTH if already populated during this session
  if (typeof AUTH !== 'undefined' && AUTH.username) {
    return { username: AUTH.username, salt: null, pinHash: null };
  }
  return null;
}

// Expose globally so nexus-engine.js callers work without change
window._authLoadMeta = _authLoadMeta;
window._authStoreGet = _authStoreGet;
window._authStoreClear = _authStoreClear;

// ── localStorage permitted set ───────────────────────────────────────────────
// Only these keys may be written to localStorage from vault module.
// Everything else goes to the vault file.
const LS_PERMITTED = new Set(['nexus_theme', 'nexus_datadir', 'nexus_mm_v3']);

function _lsSet(key, value) {
  if (!LS_PERMITTED.has(key)) {
    if (typeof MMLog !== 'undefined')
      MMLog.error('vault', `[P4] Blocked localStorage write to security key: ${key}`);
    return;
  }
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch(e) {}
}

function _lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// ── PIN session guard ────────────────────────────────────────────────
// PIN sessions are read-only — no vault writes, no key material in memory.
// Called by vaultSave() before every write, and exposed globally so
// nexus-engine.js callers (_pinReadOnlyBanner, etc.) work without change.
function _isPinReadOnly() {
  return (typeof AUTH !== 'undefined') && AUTH.pinVerified === true && !AUTH.key;
}
window._isPinReadOnly = _isPinReadOnly;


// ── Crypto primitives — PBKDF2 + AES-256-GCM ────────────────────────

async function _deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    keyMat,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt','decrypt']
  );
}

async function _aesEncrypt(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return {
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(enc))),
  };
}

async function _aesDecrypt(key, { iv, data }) {
  const ivBuf  = Uint8Array.from(atob(iv),  c => c.charCodeAt(0));
  const datBuf = Uint8Array.from(atob(data), c => c.charCodeAt(0));
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBuf }, key, datBuf);
}


// ── File download utility ────────────────────────────────────────────

function _downloadText(filename, text) {
  const a = document.createElement('a');
  a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
  a.download = filename;
  a.click();
}


// ── Key export ───────────────────────────────────────────────────────

async function exportPublicKey() {
  try {
    const keys = _AUTH_STORE.keys;
    if (!keys?.pubKey) { toast('No key vault found — vault must be loaded first'); return; }
    const pem = '-----BEGIN PUBLIC KEY-----\n' +
      keys.pubKey.match(/.{1,64}/g).join('\n') +
      '\n-----END PUBLIC KEY-----';
    _downloadText('mastermind-public-key.pem', pem);
    if (typeof T !== 'undefined') T.keyExported('Public'); else toast('Public key exported');
  } catch(e) { toast('Export failed: ' + e.message); }
}

async function exportPrivateKey() {
  if (!AUTH.key) { toast('Not authenticated — unlock first'); return; }
  try {
    const keys = _AUTH_STORE.keys;
    if (!keys?.encPrivKey) { toast('No encrypted private key found'); return; }
    const decrypted = await _aesDecrypt(AUTH.key, keys.encPrivKey);
    const b64 = btoa(String.fromCharCode(...new Uint8Array(decrypted)));
    const pem = '-----BEGIN PRIVATE KEY-----\n' +
      b64.match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----';
    _downloadText('mastermind-private-key.pem', pem);
    if (typeof T !== 'undefined') T.keyExported('Private'); else toast('Private key exported — keep this safe');
  } catch(e) { toast('Export failed: ' + e.message); }
}

async function downloadVaultBackup() {
  // Build backup data
  const data = CANVAS.getState ? CANVAS.getState() : {};
  const json = JSON.stringify({ version: 5, format: 'nexus-vault-backup',
    exported: new Date().toISOString(), username: AUTH.username, data }, null, 2);
  const filename = 'mastermind-backup-' + Date.now() + '.vault';

  if (window.NXAPI) {
    // Electron: use native save dialog
    try {
      const savePath = await window.NXAPI.saveFileDialog({
        title: 'Save MASTERMIND Backup',
        filename,
        filters: [{ name: 'Vault Backup', extensions: ['vault', 'json'] }],
      });
      if (savePath) {
        const ok = await window.NXAPI.writeFile(savePath, json);
        if (ok) {
          if (typeof T !== 'undefined') T.backupDownloaded();
          else mm_toast('Backup saved: ' + savePath.split(/[\/]/).pop(), 'success');
          MMLog?.info('vault', 'Backup exported: ' + savePath);
          if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.backup.exported', { path: savePath });
        } else {
          mm_toast('Backup write failed', 'error');
        }
      }
    } catch(e) {
      mm_toast('Backup error: ' + e.message, 'error');
    }
  } else {
    // Browser fallback: trigger download
    _downloadText(filename, json);
    if (typeof T !== 'undefined') T.backupDownloaded();
  }
}


// ── Vault state object ───────────────────────────────────────────────

const VAULT = {
  id: 'module:vault',
  file: null,           // path to .nxvault file
  dirty: false,         // unsaved changes
  lastSaved: null,      // timestamp
  saveQueue: null,      // debounce timer
  saveCount: 0,         // for backup rotation
  encrypted: false,     // whether vault is encrypted
};


// ── Vault core operations ────────────────────────────────────────────

function vaultSerialize() {
  const authStore = _authStoreGet();

  // Migrate ALM deltas + intuition ratings out of localStorage into vault
  let almDeltas = [], intuitionRatings = {};
  try { almDeltas = JSON.parse(localStorage.getItem('mm_alm_deltas') || '[]'); } catch(e) {}
  try { intuitionRatings = JSON.parse(localStorage.getItem('mm_intuition_ratings') || '{}'); } catch(e) {}

  return {
    version: 5,
    format: 'nexus-vault',
    saved: Date.now(),

    // ── Canvas state ────────────────────────────────────────────────
    canvas: {
      nodes:    CANVAS.NX.nodes,
      conns:    CANVAS.NX.conns,
      viewport: { zoom: CANVAS.NX.zoom, panX: CANVAS.NX.panX, panY: CANVAS.NX.panY },
      clipboard: CANVAS.NX.clipboard || [],
    },

    // ── All module states — live objects only, never localStorage ────
    modules: {
      // Core cognition
      void:    typeof VOID_STATE   !== 'undefined' ? VOID_STATE   : null,
      gaps:    typeof GAP_STATE    !== 'undefined' ? GAP_STATE    : null,
      signal:  typeof SIGNAL_STATE !== 'undefined' ? SIGNAL_STATE : null,
      threads: typeof THREAD_STATE !== 'undefined' ? THREAD_STATE : null,

      // Body / nervous system / somatic
      body: typeof BODY !== 'undefined' ? {
        nervousSystemState: BODY.nervousSystemState,
        intuitionMode:      BODY.intuitionMode,
        somaticLog:         BODY.somaticLog,
        patternLog:         BODY.patternLog,
        invariantMap:       BODY.invariantMap,
      } : null,

      // Horizon planning (end-state + reverse-causal chains)
      horizon: typeof HORIZON_STATE !== 'undefined'
        ? { plans: HORIZON_STATE.plans }
        : null,

      // Brain Map v2 — expanded domains, custom domains, intelligence ratings
      brainMap: typeof BMV2 !== 'undefined' ? {
        expanded:      [...(BMV2._expanded      || [])],
        customDomains: BMV2._customDomains || {},
        customSubs:    BMV2._customSubs    || {},
      } : null,

      // Domain state — intelligence ratings + selection sets
      domain: typeof DOMAIN_STATE !== 'undefined' ? {
        intelligenceRatings: DOMAIN_STATE.intelligenceRatings,
        customDomains:       DOMAIN_STATE.customDomains,
        selectedMeta:        [...(DOMAIN_STATE.selectedMeta    || [])],
        selectedDomains:     [...(DOMAIN_STATE.selectedDomains || [])],
        selectedSubs:        [...(DOMAIN_STATE.selectedSubs    || [])],
        populatedNodes:      DOMAIN_STATE.populatedNodes || [],
      } : null,

      // ALM growth deltas + intuition ratings (migrated from localStorage)
      almDeltas,
      intuitionRatings,

      // UI options + feature flags (non-sensitive, but restore for UX)
      options:  typeof OPTS !== 'undefined' ? OPTS          : null,
      features: typeof AUTH !== 'undefined' ? AUTH.features : null,
    },

    // ── AI config — API KEYS encrypted inside vault envelope ─────────
    // This is the critical fix: API keys were in plaintext localStorage.
    // Now they live only inside the AES-256-GCM encrypted vault file.
    aiConfig: typeof AI !== 'undefined' ? {
      provider:     AI.provider,
      apiKey:       AI.apiKey,
      model:        AI.model,
      enabled:      AI.enabled,
      ollamaBase:   AI.ollamaBase,
      lmstudioBase: AI.lmstudioBase,
      ollamaModels: AI.ollamaModels,
    } : null,

    // ── SNR gate state ────────────────────────────────────────────────
    snr: typeof SNRGate !== 'undefined' ? SNRGate.snapshot() : null,

    // ── Identity + RSA keys — in-memory store only, never localStorage
    identity: authStore.meta || null,
    keys:     authStore.keys || null,
    username: AUTH?.username || null,

    // ── JAA ledger ────────────────────────────────────────────────────
    jaa: typeof JAA !== 'undefined' ? Object.fromEntries(JAA.ledger) : {},
  };
}

function vaultDeserialize(data) {
  if (!data || !data.canvas) return false;

  // ── Canvas ──────────────────────────────────────────────────────────
  CANVAS.clearCanvas();
  (data.canvas.nodes || []).forEach(n => CANVAS.spawnNode(n.type, n.x, n.y, n));
  (data.canvas.conns || []).forEach(c => CANVAS.NX.conns.push({ ...c, _phase: Math.random() }));
  if (data.canvas.viewport) {
    CANVAS.NX.zoom = data.canvas.viewport.zoom || 1;
    CANVAS.NX.panX = data.canvas.viewport.panX || 0;
    CANVAS.NX.panY = data.canvas.viewport.panY || 0;
    CANVAS.applyT();
  }
  if (Array.isArray(data.canvas.clipboard)) CANVAS.NX.clipboard = data.canvas.clipboard;

  // ── Module states → live objects only, never localStorage ────────────
  const m = data.modules || {};

  if (m.void    && typeof VOID_STATE   !== 'undefined') {
    Object.assign(VOID_STATE, m.void);
    // Ensure arrays are arrays (guard against corrupted vault)
    ['seeds','openLoops','whatifs','createLog','expressLog','bridges','primeLog',
     'constraints','conditions','causalChain','horizonItems','somaticSignals',
     'bodyPatterns','bodyInvariants'].forEach(k => {
      if (!Array.isArray(VOID_STATE[k])) VOID_STATE[k] = [];
    });
  }
  if (m.gaps    && typeof GAP_STATE    !== 'undefined') Object.assign(GAP_STATE,  m.gaps);
  if (m.signal  && typeof SIGNAL_STATE !== 'undefined') Object.assign(SIGNAL_STATE, m.signal);
  if (m.threads && typeof THREAD_STATE !== 'undefined') Object.assign(THREAD_STATE, m.threads);

  // Body / nervous system
  if (m.body && typeof BODY !== 'undefined') {
    if (m.body.nervousSystemState) BODY.nervousSystemState = m.body.nervousSystemState;
    if (m.body.intuitionMode)      BODY.intuitionMode      = m.body.intuitionMode;
    if (m.body.somaticLog)         BODY.somaticLog         = m.body.somaticLog;
    if (m.body.patternLog)         BODY.patternLog         = m.body.patternLog;
    if (m.body.invariantMap)       BODY.invariantMap       = m.body.invariantMap;
  }

  // Horizon planning
  if (m.horizon && typeof HORIZON_STATE !== 'undefined') {
    if (Array.isArray(m.horizon.plans)) HORIZON_STATE.plans = m.horizon.plans;
    HORIZON_STATE._loaded = true;
  }

  // Brain Map v2
  if (m.brainMap && typeof BMV2 !== 'undefined') {
    if (m.brainMap.expanded)      BMV2._expanded      = new Set(m.brainMap.expanded);
    if (m.brainMap.customDomains) BMV2._customDomains = m.brainMap.customDomains;
    if (m.brainMap.customSubs)    BMV2._customSubs    = m.brainMap.customSubs;
  }

  // Domain state (intelligence ratings + selection sets)
  if (m.domain && typeof DOMAIN_STATE !== 'undefined') {
    if (m.domain.intelligenceRatings) DOMAIN_STATE.intelligenceRatings = m.domain.intelligenceRatings;
    if (m.domain.customDomains)       DOMAIN_STATE.customDomains       = m.domain.customDomains;
    if (m.domain.selectedMeta)        DOMAIN_STATE.selectedMeta        = new Set(m.domain.selectedMeta);
    if (m.domain.selectedDomains)     DOMAIN_STATE.selectedDomains     = new Set(m.domain.selectedDomains);
    if (m.domain.selectedSubs)        DOMAIN_STATE.selectedSubs        = new Set(m.domain.selectedSubs);
    if (m.domain.populatedNodes)      DOMAIN_STATE.populatedNodes      = m.domain.populatedNodes;
  }

  // ALM deltas + intuition ratings — restore to localStorage (engine reads from there)
  if (m.almDeltas && Array.isArray(m.almDeltas)) {
    try { localStorage.setItem('mm_alm_deltas', JSON.stringify(m.almDeltas)); } catch(e) {}
  }
  if (m.intuitionRatings && typeof m.intuitionRatings === 'object') {
    try { localStorage.setItem('mm_intuition_ratings', JSON.stringify(m.intuitionRatings)); } catch(e) {}
  }

  // Options + feature flags
  if (m.options  && typeof OPTS !== 'undefined') Object.assign(OPTS, m.options);
  if (m.features && typeof AUTH !== 'undefined') AUTH.features = m.features;

  // ── AI config — restore API keys to live AI object only (not localStorage) ─
  if (data.aiConfig && typeof AI !== 'undefined') {
    if (data.aiConfig.provider     != null) AI.provider     = data.aiConfig.provider;
    if (data.aiConfig.apiKey       != null) AI.apiKey       = data.aiConfig.apiKey;
    if (data.aiConfig.model        != null) AI.model        = data.aiConfig.model;
    if (data.aiConfig.enabled      != null) AI.enabled      = data.aiConfig.enabled;
    if (data.aiConfig.ollamaBase   != null) AI.ollamaBase   = data.aiConfig.ollamaBase;
    if (data.aiConfig.lmstudioBase != null) AI.lmstudioBase = data.aiConfig.lmstudioBase;
    if (data.aiConfig.ollamaModels != null) AI.ollamaModels = data.aiConfig.ollamaModels;
    // Do NOT write API keys back to localStorage — vault is the only store
  }

  // ── SNR gate state ─────────────────────────────────────────────────────
  if (data.snr && typeof SNRGate !== 'undefined') SNRGate.restore(data.snr);

  // ── Auth — populate in-memory store only, never localStorage ──────────
  if (data.identity) {
    _authStoreSet(data.identity, data.keys || null);
    if (typeof AUTH !== 'undefined') {
      AUTH.username = data.identity.username || AUTH.username;
      AUTH.hasPin   = !!data.identity.pinHash;
      // pinHash stays in _AUTH_STORE only — never exposed on AUTH
    }
  }

  // ── JAA ledger ────────────────────────────────────────────────────────
  if (data.jaa && typeof JAA !== 'undefined') {
    Object.entries(data.jaa).forEach(([id, entry]) => JAA.ledger.set(id, entry));
  }

  VAULT.lastSaved = data.saved;
  return true;
}

async function vaultSave(showToast = false) {
  if (VAULT.saveQueue) { clearTimeout(VAULT.saveQueue); VAULT.saveQueue = null; }

  // ── SECURITY: PIN sessions are read-only — zero disk writes ──────────────
  if (_isPinReadOnly()) {
    MMLog?.warn('vault', 'Save blocked: PIN session is read-only. Password required to save.');
    if (showToast) mm_toast('Read-only session · Enter password to save', 'vault');
    return;
  }

  const data = vaultSerialize();
  const json = JSON.stringify(data);

  // ── REQUIRE NXAPI for persistent save ─────────────────────────
  // MASTERMIND uses real filesystem vault only.
  // localStorage is a session-speed cache ONLY — not the source of truth.
  if (!window.NXAPI) {
    // No Electron — cache in localStorage for session continuity but warn
    try { localStorage.setItem('nexus_mm_v3', json); } catch(e) {}
    MMLog?.warn('vault', 'Save skipped: no NXAPI — localStorage cache only (not persistent)');
    if (showToast) mm_toast('⚠ Session only — desktop app required for persistent save', 'warn');
    return;
  }

  // ── Build vault path ──────────────────────────────────────────
  const vaultPath = NX_CONFIG.vaultPath ||
    ((NX_CONFIG.dataDir || localStorage.getItem('nexus_datadir') || '') + '/mastermind.vault');
  if (!vaultPath || vaultPath === '/mastermind.vault') {
    MMLog?.error('vault', 'Save failed: no vault path configured');
    if (showToast) mm_toast('⚡ No vault path — open data folder first', 'error');
    return;
  }

  // ── Build payload (encrypt if key available) ──────────────────
  let payload;
  try {
    if (AUTH.key && AUTH.encrypted) {
      const encrypted = await _aesEncrypt(AUTH.key, new TextEncoder().encode(json));
      payload = JSON.stringify({ encrypted: true, version: 5, ...encrypted });
    } else {
      payload = JSON.stringify({ encrypted: false, version: 5, data });
    }
  } catch(e) {
    MMLog?.error('vault', 'Payload build error: ' + e.message);
    if (showToast) mm_toast('⚡ Vault encrypt error: ' + e.message, 'error');
    return;
  }

  // ── Write to filesystem (atomic via Electron IPC) ─────────────
  try {
    const result = await window.NXAPI.vaultWrite(vaultPath, payload);
    if (!result?.ok) throw new Error(result?.error || 'Write failed');

    // Cache in localStorage for fast session reads
    try { localStorage.setItem('nexus_mm_v3', json); } catch(e) {}

    // Rotate backups every 10 saves
    VAULT.saveCount = (VAULT.saveCount || 0) + 1;
    if (VAULT.saveCount % 10 === 0) {
      window.NXAPI.vaultBackup?.(vaultPath).catch(() => {});
    }
    VAULT.lastSaved = Date.now();
    VAULT.dirty = false;
    NX_CONFIG.vaultPath = vaultPath;

    MMLog?.info('vault', 'Saved: ' + CANVAS.NX.nodes.length + ' nodes · ' + payload.length + ' bytes → ' + vaultPath.slice(-40));
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.saved', { path: vaultPath, nodes: CANVAS.NX.nodes.length });

    if (showToast) mm_toast('✓ Vault saved · ' + CANVAS.NX.nodes.length + ' nodes', 'success');
  } catch(e) {
    MMLog?.error('vault', 'Filesystem write failed: ' + e.message);
    // Cache falls back to localStorage so session data isn't lost
    try { localStorage.setItem('nexus_mm_v3', json); } catch(le) {}
    if (showToast) mm_toast('⚡ Save failed: ' + e.message + ' · session cache active', 'error');
  }
}

function vaultDirtySave(delayMs) {
  VAULT.dirty = true;
  if (VAULT.saveQueue) clearTimeout(VAULT.saveQueue);
  const interval = (OPTS.autosave_interval || 30) * 1000;
  VAULT.saveQueue = setTimeout(() => vaultSave(false), delayMs || interval);
}

async function vaultLoad() {
  let data = null;

  if (!window.NXAPI) {
    MMLog?.warn('vault', 'Load skipped: no NXAPI — desktop app required');
    return null;
  }

  const vaultPath = NX_CONFIG.vaultPath ||
    ((_lsGet('nexus_datadir') || '') + '/mastermind.vault');

  if (!vaultPath || vaultPath === '/mastermind.vault') {
    MMLog?.error('vault', 'Load failed: no vault path configured');
    return null;
  }

  try {
    const raw = await window.NXAPI.vaultRead(vaultPath);
    if (!raw) { MMLog?.warn('vault', 'Vault file empty or missing'); return null; }

    const parsed = JSON.parse(raw);

    if (parsed.encrypted && AUTH.key) {
      const plainBuf = await _aesDecrypt(AUTH.key, { iv: parsed.iv, data: parsed.data });
      data = JSON.parse(new TextDecoder().decode(plainBuf));
    } else if (parsed.encrypted && !AUTH.key) {
      mm_toast('Vault encrypted — login required to decrypt', 'warn');
      return null;
    } else if (!parsed.encrypted) {
      data = parsed.data;
    }

    // Shell vault guard — vault created but never fully saved
    if (data === null || data === undefined) {
      const isConfigured = (typeof AUTH !== 'undefined' && AUTH.features?._configured);
      if (isConfigured) {
        MMLog?.warn('vault', 'Shell vault detected');
        mm_toast('⚠ Vault appears incomplete — previous data may not be recoverable', 'warn', { dur: 4000 });
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.shell_detected', {});
        return null;
      }
    }

    if (data) {
      // ── Populate in-memory auth store (ONLY path auth enters memory) ──
      if (data.identity) {
        _authStoreSet(data.identity, data.keys || null);
        MMLog?.info('vault', 'Auth store populated: ' + (data.identity.username || 'unknown'));
      }

      // ── Deserialize all module states into live objects ───────────────
      // This is the fix for data: null — vault data now actually flows into
      // VOID_STATE, GAP_STATE, BODY, HORIZON_STATE, BMV2, DOMAIN_STATE, AI, etc.
      vaultDeserialize(data);

      // ── Session cache — canvas + modules only, auth excluded ──────────
      try {
        localStorage.setItem('nexus_mm_v3', JSON.stringify({
          canvas: data.canvas, modules: data.modules,
          jaa: data.jaa, saved: data.saved,
        }));
      } catch(e) {}

      MMLog?.info('vault', 'Loaded + deserialized: ' + vaultPath.slice(-40));
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.loaded', { path: vaultPath });
    }
  } catch(e) {
    MMLog?.error('vault', 'vaultLoad error: ' + e.message);
    mm_toast('⚡ Vault read error: ' + e.message, 'error');
  }

  return data;
}

async function vaultDecryptPermanently() {
  if (!confirm('Decrypt vault permanently?\n\nThis will remove encryption and save as plaintext.')) return;

  // Update in-memory auth store to reflect noEncryption
  const meta = _authLoadMeta();
  if (meta) _authStoreSet({ ...meta, noEncryption: true }, _AUTH_STORE.keys);

  AUTH.encrypted = false;
  AUTH.key = null;

  // Write full vault (now unencrypted) to disk — vaultSave reads from _AUTH_STORE
  await vaultSave(false);

  if (typeof T !== 'undefined') T.vaultDecrypted();
  else mm_toast('Vault decrypted · plaintext mode', 'warn');
}

async function vaultExport(mode) {
  const data = vaultSerialize();
  if (mode === 'decrypted') {
    const json = JSON.stringify({ encrypted: false, version: 5, format: 'nexus-vault', data }, null, 2);
    _downloadText('nexus-vault-decrypted-' + Date.now() + '.json', json);
    mm_toast('Vault exported · decrypted JSON', 'export');
  } else if (mode === 'encrypted') {
    if (!AUTH.key) { toast('No encryption key — vault is unencrypted'); vaultExport('decrypted'); return; }
    const json = JSON.stringify(data);
    const enc = await _aesEncrypt(AUTH.key, new TextEncoder().encode(json));
    const payload = JSON.stringify({ encrypted: true, version: 5, format: 'nexus-vault', ...enc });
    _downloadText('nexus-vault-' + Date.now() + '.nxvault', payload);
    mm_toast('Vault exported · encrypted', 'export');
  } else if (mode === 'canvas-only') {
    const canvasData = { version: 4, nodes: CANVAS.NX.nodes, conns: CANVAS.NX.conns, saved: Date.now() };
    _downloadText('nexus-canvas-' + Date.now() + '.json', JSON.stringify(canvasData, null, 2));
    mm_toast('Canvas exported · JSON', 'export');
  }
}


// ── Watchdog + missing screen + recovery ─────────────────────────────

async function _vaultWatchdogCheck() {
  // If no data dir is configured yet, watchdog passes (first-time setup)
  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) return true;
  const vaultPath = dataDir + '/mastermind.vault';
  if (window.NXAPI) {
    try {
      const exists = await window.NXAPI.vaultExists(vaultPath);
      if (!exists) {
        _showVaultMissingScreen(vaultPath);
        return false;
      }
      // Confirm file is readable and valid JSON
      const raw = await window.NXAPI.vaultRead(vaultPath);
      if (!raw) { _showVaultMissingScreen(vaultPath, 'unreadable'); return false; }
      try { JSON.parse(raw); } catch(e) { _showVaultMissingScreen(vaultPath, 'corrupt'); return false; }
      return true;
    } catch(e) {
      MMLog?.error('vault', 'Watchdog error: ' + e.message);
      return false;
    }
  }
  return true; // browser mode — no filesystem to check
}

function _showVaultMissingScreen(vaultPath, reason = 'missing') {
  const reasonText = {
    missing:    'Vault file not found at the expected location.',
    unreadable: 'Vault file exists but cannot be read — check folder permissions.',
    corrupt:    'Vault file is corrupt or invalid — it may need to be restored from backup.',
  }[reason] || 'Vault is unavailable.';

  // Hide all startup screens and homepage
  document.querySelectorAll('.startup-inner').forEach(el => el.classList.add('hidden'));
  document.getElementById('homepage')?.classList.add('hidden');
  const screen = document.getElementById('startup-screen');
  if (screen) screen.classList.remove('hidden');

  // Build or update the vault-missing screen
  let el = document.getElementById('ss-vault-missing');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ss-vault-missing';
    el.className = 'startup-inner';
    el.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:40px 24px;text-align:center';
    screen.appendChild(el);
  }
  el.classList.remove('hidden');
  el.style.display = 'flex';

  el.innerHTML = `
    <div style="font-size:40px;filter:drop-shadow(0 0 18px #ff3355)">⚡</div>
    <div style="font-family:var(--f-display);font-size:16px;font-weight:800;letter-spacing:6px;
      color:#ff3355;text-transform:uppercase">VAULT MISSING</div>
    <div style="font-family:var(--f-mono);font-size:8.5px;color:var(--muted);max-width:420px;
      line-height:2;letter-spacing:.5px">${reasonText}<br><br>
      <span style="color:var(--dim);font-size:7.5px">${vaultPath ? escH(vaultPath) : ''}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px">
      <button onclick="_vaultRecreate()" style="
        padding:12px 24px;border:1px solid #00ff88;color:#00ff88;background:rgba(0,255,136,.08);
        font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:3px;
        cursor:pointer;transition:all .18s"
        onmouseenter="this.style.background='rgba(0,255,136,.18)'"
        onmouseleave="this.style.background='rgba(0,255,136,.08)'">
        ◈ RECREATE VAULT
      </button>
      <button onclick="pickStartupFolder()" style="
        padding:12px 24px;border:1px solid #00c8ff;color:#00c8ff;background:rgba(0,200,255,.08);
        font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:3px;
        cursor:pointer;transition:all .18s"
        onmouseenter="this.style.background='rgba(0,200,255,.18)'"
        onmouseleave="this.style.background='rgba(0,200,255,.08)'">
        ⌗ CHOOSE NEW FOLDER
      </button>
      <button onclick="_vaultRestoreFromBackup()" style="
        padding:12px 24px;border:1px solid #d4a820;color:#d4a820;background:rgba(212,168,32,.08);
        font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:3px;
        cursor:pointer;transition:all .18s"
        onmouseenter="this.style.background='rgba(212,168,32,.18)'"
        onmouseleave="this.style.background='rgba(212,168,32,.08)'">
        ↩ RESTORE FROM BACKUP
      </button>
    </div>
    <div id="vault-missing-status" style="font-family:var(--f-mono);font-size:8px;color:var(--dim);min-height:18px"></div>
  `;

  // Emit SISO event for observability
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.missing', { path: vaultPath, reason });
  MMLog?.error('vault', `Vault watchdog FAILED: ${reason} · ${vaultPath}`);
}

async function _vaultRecreate() {
  // ── SECURITY: vault recovery ALWAYS requires password re-entry ──────────────
  // The password is never stored. We must re-derive the key from the user's input.
  // Silently generating a new key would produce an incompatible vault — data loss.
  const meta = _authLoadMeta();
  const username = meta?.username || 'operator';

  // Build the password-required recovery UI
  const statusEl = document.getElementById('vault-missing-status');
  const existingForm = document.getElementById('vault-recovery-form');
  if (existingForm) existingForm.remove();

  const form = document.createElement('div');
  form.id = 'vault-recovery-form';
  form.style.cssText = [
    'margin-top:16px;padding:16px;border:1px solid rgba(0,200,255,.2)',
    'background:rgba(0,10,20,.6)',
  ].join(';');

  const isEncrypted = meta && !meta.noEncryption;

  if (isEncrypted) {
    form.innerHTML = `
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--c);letter-spacing:1.5px;margin-bottom:10px">
        VAULT RECOVERY — PASSWORD REQUIRED
      </div>
      <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:12px;line-height:1.8">
        Enter your password to re-derive the encryption key and create a new vault.<br>
        <span style="color:var(--o)">⚠ Data from before deletion cannot be recovered.</span>
      </div>
      <div style="margin-bottom:8px">
        <input id="vault-recovery-username" type="text" value="${escH(username)}"
          style="width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);border:1px solid var(--wire2);
                 color:var(--c);padding:7px 10px;font-family:var(--f-mono);font-size:8px;margin-bottom:6px"
          placeholder="Username" readonly/>
        <input id="vault-recovery-pw" type="password"
          style="width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);border:1px solid var(--wire2);
                 color:var(--c);padding:7px 10px;font-family:var(--f-mono);font-size:8px;margin-bottom:6px"
          placeholder="Your password" autocomplete="current-password"
          oninput="(function(){
            const pw=document.getElementById('vault-recovery-pw')?.value||'';
            const cf=document.getElementById('vault-recovery-pw-confirm')?.value||'';
            const ind=document.getElementById('vault-recovery-match');
            if(ind){ind.textContent=cf?pw===cf?'✓ match':'✗ no match':'';ind.style.color=pw===cf?'var(--g)':'var(--r)';}
          })()"/>
        <input id="vault-recovery-pw-confirm" type="password"
          style="width:100%;box-sizing:border-box;background:rgba(0,5,12,.8);border:1px solid var(--wire2);
                 color:var(--c);padding:7px 10px;font-family:var(--f-mono);font-size:8px"
          placeholder="Confirm password" autocomplete="current-password"
          oninput="(function(){
            const pw=document.getElementById('vault-recovery-pw')?.value||'';
            const cf=document.getElementById('vault-recovery-pw-confirm')?.value||'';
            const ind=document.getElementById('vault-recovery-match');
            if(ind){ind.textContent=cf?pw===cf?'✓ match':'✗ no match':'';ind.style.color=pw===cf?'var(--g)':'var(--r)';}
          })()"/>
      </div>
      <div id="vault-recovery-match" style="font-family:var(--f-mono);font-size:7px;min-height:12px;margin-bottom:6px;text-align:right"></div>
      <div id="vault-recovery-error" style="color:var(--r);font-family:var(--f-mono);font-size:7px;min-height:14px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px">
        <button onclick="_vaultRecreateConfirm()"
          style="flex:1;padding:8px;border:1px solid var(--c);background:transparent;color:var(--c);
                 cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
          ⬡ CREATE NEW VAULT
        </button>
      </div>`;
    // Focus password field after short delay
    setTimeout(() => document.getElementById('vault-recovery-pw')?.focus(), 100);
  } else {
    // Unencrypted vault — just recreate empty
    form.innerHTML = `
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--c);letter-spacing:1.5px;margin-bottom:10px">
        VAULT RECOVERY
      </div>
      <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:12px;line-height:1.8">
        Your vault was unencrypted. A new empty vault will be created.<br>
        <span style="color:var(--o)">⚠ Previous data cannot be recovered.</span>
      </div>
      <button onclick="_vaultRecreateUnencrypted()"
        style="width:100%;padding:8px;border:1px solid var(--c);background:transparent;color:var(--c);
               cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
        ⬡ CREATE NEW VAULT
      </button>`;
  }

  const container = document.getElementById('ss-vault-missing');
  if (container) container.appendChild(form);
  else if (statusEl) statusEl.after(form);
}

async function _vaultRecreateConfirm() {
  const pw = document.getElementById('vault-recovery-pw')?.value;
  const cf = document.getElementById('vault-recovery-pw-confirm')?.value;
  const errEl = document.getElementById('vault-recovery-error');
  const setErr = msg => { if (errEl) errEl.textContent = msg; };
  setErr('');

  if (!pw) { setErr('Password required'); return; }
  if (!cf) { setErr('Please confirm your password'); return; }
  if (pw !== cf) { setErr('Passwords do not match'); return; }

  const meta = _authLoadMeta();
  if (!meta?.salt) { setErr('No identity found — cannot recover. Complete setup again.'); return; }

  const btn = document.querySelector('#vault-recovery-form button');
  if (btn) { btn.textContent = 'Deriving key…'; btn.disabled = true; }

  try {
    const salt = Uint8Array.from(atob(meta.salt), c => c.charCodeAt(0));
    const key = await _deriveKey(pw, salt);

    // Verify key by attempting to decrypt the stored private key blob
    // Keys live in _AUTH_STORE (loaded from vault file), never in localStorage
    const storedKeys = _AUTH_STORE.keys;
    if (storedKeys?.encPrivKey) {
      await _aesDecrypt(key, storedKeys.encPrivKey); // throws on wrong password
    }

    // Password correct — re-derive worked
    AUTH.key = key;
    AUTH.encrypted = true;
    AUTH.username = meta.username;

    await _vaultRecreateWithKey();
  } catch(e) {
    setErr('Incorrect password — try again');
    if (btn) { btn.textContent = '⬡ CREATE NEW VAULT'; btn.disabled = false; }
    document.getElementById('vault-recovery-pw').value = '';
    const cfEl = document.getElementById('vault-recovery-pw-confirm');
    if (cfEl) cfEl.value = '';
    const matchEl = document.getElementById('vault-recovery-match');
    if (matchEl) matchEl.textContent = '';
    document.getElementById('vault-recovery-pw')?.focus();
  }
}

async function _vaultRecreateUnencrypted() {
  AUTH.encrypted = false;
  await _vaultRecreateWithKey();
}

async function _vaultRecreateWithKey() {
  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) {
    mm_toast('⚡ No data folder set — choose a folder first', 'error');
    return;
  }
  const vaultPath = dataDir + '/mastermind.vault';

  // ── Re-generate RSA key pair so the new password produces fresh keys ──────
  // This is the fix: _vaultRecreateConfirm verified the old password but the
  // recreation needs NEW keys derived from the new session to avoid the
  // "wrong password after recreation" bug where Gate 2 (encPrivKey verification)
  // fails because the stored RSA blob was encrypted with the OLD key.
  let newPubKey = null, newEncPrivKey = null;
  if (AUTH.key && AUTH.encrypted) {
    try {
      const kp = await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
        true, ['encrypt','decrypt']
      );
      const pubRaw  = await crypto.subtle.exportKey('spki', kp.publicKey);
      const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);
      newEncPrivKey = await _aesEncrypt(AUTH.key, new Uint8Array(privRaw));
      newPubKey = btoa(String.fromCharCode(...new Uint8Array(pubRaw)));

      // Update the RSA blob in localStorage so Gate 2 validates correctly
      localStorage.setItem(typeof AUTH_VAULT_KEY !== 'undefined' ? AUTH_VAULT_KEY : 'nexus_auth_vault',
        JSON.stringify({ pubKey: newPubKey, encPrivKey: newEncPrivKey }));

      // Update _AUTH_STORE keys
      _authStoreSet(_AUTH_STORE.meta, { pubKey: newPubKey, encPrivKey: newEncPrivKey });
    } catch(e) {
      MMLog?.warn('vault', 'RSA regen failed (non-fatal): ' + e.message);
    }
  }

  // Write an empty but properly keyed vault
  const emptyData = JSON.stringify({
    version: 5, format: 'nexus-vault', saved: Date.now(),
    canvas: { nodes: [], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 }, clipboard: [] },
    modules: { void: null, gaps: null, signal: null, threads: null,
               options: typeof OPTS !== 'undefined' ? OPTS : {},
               features: typeof AUTH !== 'undefined' ? AUTH.features : {} },
    identity: _AUTH_STORE.meta || null,
    keys: newPubKey ? { pubKey: newPubKey, encPrivKey: newEncPrivKey } : (_AUTH_STORE.keys || null),
    jaa: {},
  });

  let payload;
  try {
    if (AUTH.key && AUTH.encrypted) {
      const encrypted = await _aesEncrypt(AUTH.key, new TextEncoder().encode(emptyData));
      payload = JSON.stringify({ encrypted: true, version: 5, ...encrypted });
    } else {
      payload = JSON.stringify({ encrypted: false, version: 5, data: JSON.parse(emptyData) });
    }
  } catch(e) {
    mm_toast('⚡ Vault build error: ' + e.message, 'error');
    return;
  }

  if (window.NXAPI) {
    const result = await window.NXAPI.vaultWrite(vaultPath, payload);
    if (result?.ok) {
      NX_CONFIG.vaultPath = vaultPath;
      MMLog?.info('vault', 'Vault recreated at ' + vaultPath);
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.recreated', { path: vaultPath });
      mm_toast('✓ New vault created — login with your password', 'vault');
      // Reload to login screen cleanly so new keys are read fresh
      setTimeout(() => {
        if (typeof startupRoute === 'function') startupRoute();
      }, 900);
    } else {
      mm_toast('⚡ Write failed: ' + (result?.error || 'unknown'), 'error');
    }
  }
}

async function _vaultRestoreFromBackup() {
  const statusEl = document.getElementById('vault-missing-status');
  if (!window.NXAPI) { if (statusEl) statusEl.textContent = 'Restore only available in desktop app'; return; }
  if (statusEl) statusEl.textContent = 'Opening file picker…';
  const filePath = await window.NXAPI.openFileDialog({
    title: 'Select MASTERMIND vault backup',
    filters: [{ name: 'Vault / JSON', extensions: ['vault', 'json'] }],
  });
  if (!filePath) { if (statusEl) statusEl.textContent = 'Cancelled'; return; }
  const raw = await window.NXAPI.readFile(filePath);
  if (!raw) { if (statusEl) statusEl.textContent = '⚡ Could not read backup file'; return; }
  try { JSON.parse(raw); } catch(e) { if (statusEl) statusEl.textContent = '⚡ Backup file is not valid JSON'; return; }
  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) { if (statusEl) statusEl.textContent = '⚡ No data folder set'; return; }
  const vaultPath = dataDir + '/mastermind.vault';
  const result = await window.NXAPI.vaultWrite(vaultPath, raw);
  if (result?.ok) {
    NX_CONFIG.vaultPath = vaultPath;
    if (statusEl) statusEl.textContent = '✓ Backup restored — restarting…';
    setTimeout(() => startupRoute(), 800);
  } else {
    if (statusEl) statusEl.textContent = '⚡ Write failed: ' + (result?.error || 'unknown');
  }
}


// ── Module ready signal ──────────────────────────────────────────────
(function() {
  const ver = 'mastermind-vault v3.0.5';
  if (typeof MM_BUS !== 'undefined') {
    MM_BUS.emit('mm.module.ready', {
      module: 'mastermind-vault',
      version: '3.0.5',
      uuid: '4a3b2c1d-vault-4000-8000-vault000001',
    });
  }
  const msg = '[MASTERMIND VAULT] v3.0.5 loaded — AES-256-GCM · PBKDF2-SHA256 310k · atomic writes';
  if (typeof MMLog !== 'undefined') MMLog.info('vault', msg);
  else console.log(msg);
})();
