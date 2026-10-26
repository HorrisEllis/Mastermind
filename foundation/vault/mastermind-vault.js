// ═══════════════════════════════════════════════════════════════════
// MASTERMIND VAULT — version tracked in package.json (§5.4)
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
//   exportPublicKey, exportPrivateKey, downloadVaultBackup,
//   vaultHealth, vaultScanOrphans, vaultHarvestOrphans,
//   vaultGetIterations, vaultSetIterations, vaultCalibrateIterations
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

// Iteration count is a POLICY default for new vaults and upgrades. It is
// never used to open an existing vault — that always uses the count written
// in that file's own header, or the file becomes unopenable the moment the
// default moves. Iterations must not vary per attempt: a different count is
// a different key, so escalating one locks out the owner on attempt two and
// costs an offline attacker nothing.
const VAULT_KDF_TARGET_MS = 1000;
let   VAULT_KDF_ITERATIONS = VaultEnvelope.DEFAULT_ITERATIONS;

function vaultGetIterations() { return VAULT_KDF_ITERATIONS; }

function vaultSetIterations(n) {
  const v = parseInt(n, 10);
  if (!Number.isInteger(v) || v < VaultEnvelope.MIN_ITERATIONS) {
    throw new Error('Iterations must be an integer of at least ' +
      VaultEnvelope.MIN_ITERATIONS.toLocaleString());
  }
  VAULT_KDF_ITERATIONS = v;
  MMLog?.info('vault', 'KDF target set to ' + v.toLocaleString() +
    ' iterations — applied on next save');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.kdf.target', { iterations: v });
  return v;
}

// Measures this machine rather than guessing. Backs the Security panel.
async function vaultCalibrateIterations(targetMs) {
  return VaultCrypto.calibrateIterations(targetMs || VAULT_KDF_TARGET_MS, 100000);
}

// Derive against explicit parameters. No defaults, no hidden state — every
// caller must say which salt and which count it means.
async function _deriveKeyWith(password, saltB64, iterations) {
  return VaultCrypto.deriveKey(password, saltB64, iterations, VaultEnvelope.KEY_LEN);
}

// ── Legacy shims, kept because the RSA private-key blob uses them ─────────
// encPrivKey is a self-contained {iv,data} pair inside the vault payload and
// has its own lifecycle, independent of the envelope's AAD.
async function _deriveKey(password, salt) {
  const saltB64 = (salt instanceof Uint8Array) ? VaultCrypto.toBase64(salt) : salt;
  return _deriveKeyWith(password, saltB64, VAULT_KDF_ITERATIONS);
}

async function _aesEncrypt(key, data) {
  const iv = VaultCrypto.randomIvB64(VaultEnvelope.IV_BYTES);
  const ct = await VaultCrypto.encrypt(key, data, iv, null);
  return { iv, data: VaultCrypto.toBase64(ct) };
}

async function _aesDecrypt(key, { iv, data }) {
  const ct = VaultCrypto.fromBase64(data);
  const plain = await VaultCrypto.decrypt(key, ct, iv, null);
  return plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength);
}

// ── Session key binding ──────────────────────────────────────────────────
// THE INVARIANT: a vault header must describe the key that is in memory.
//
// The header says "PBKDF2, this salt, this many iterations". If the key was
// actually derived from different parameters, the file is sealed with a key
// nobody can ever re-derive — including the owner, with the correct password.
// Writing that file destroys the vault silently and permanently.
//
// The v0.1.2 build had exactly that latent fault: opening a v5 vault derived
// the key from the v5 salt at 310k, then _vaultAdoptLegacyIdentity() minted a
// RANDOM salt and stamped the current 1M target into the header. The seal
// crashed before writing only because vaultId was also null. That crash was
// the last thing standing between a working vault and an unopenable one.
//
// So the parameters now travel WITH the key, set at the same instant, and
// the seal reads them from here rather than from anywhere else.
// ── AUTH.key is not assignable ───────────────────────────────────────────
// Invariant 0 says the vault header must describe the key in memory. In
// v0.1.3 that was enforced by a check inside vaultSave comparing the header
// against AUTH.kdf — which only holds if AUTH.kdf is updated every time
// AUTH.key changes. It was not: optsChangePassword and optsToggleE2E both
// assigned AUTH.key directly, leaving AUTH.kdf describing the OLD salt while
// the key was derived from a NEW one. The check then compared old to old,
// passed, and the vault got sealed with a key its own header could not
// re-derive. Unopenable, forever, with the correct password.
//
// A rule enforced by remembering to follow it is not enforced. So the
// property now refuses direct assignment and the only way in is
// _setSessionKey(key, salt, iterations), which cannot set one without the
// others.
//
// ── LOAD-ORDER NOTE (the v0.1.4-v0.1.15 defect) ─────────────────────────
// This guard used to run at module-evaluation time. `const AUTH` lives in
// nexus-engine.js, which loads AFTER this file — and top-level `const` in a
// classic script goes into the shared global LEXICAL scope, so touching AUTH
// from here threw a temporal-dead-zone ReferenceError.
//
// That error aborted the rest of THIS file. `const VAULT` (further down)
// therefore never initialised, and every later access surfaced as
// "Cannot access 'VAULT' before initialization" — a symptom two hundred
// lines and one file away from its cause.
//
// So installation is deferred until AUTH actually exists. `typeof AUTH`
// cannot be used to check: typeof on a TDZ binding throws rather than
// returning "undefined", which is why the probe is wrapped in try/catch.
let _authKeyInternal = null;
let _authKeyGuarded = false;

function _installAuthKeyGuard() {
  if (_authKeyGuarded) return true;

  let authRef;
  try {
    authRef = AUTH;                    // throws while AUTH is in its TDZ
  } catch (e) {
    return false;                      // nexus-engine.js has not run yet
  }
  if (!authRef || typeof authRef !== 'object') return false;

  // Anything already assigned before the guard installs must be preserved,
  // or installing the guard would silently drop a live session key.
  const existing = authRef.key;

  try {
    Object.defineProperty(authRef, 'key', {
      get() { return _authKeyInternal; },
      set(v) {
        if (v === null) { _authKeyInternal = null; authRef.kdf = null; return; }
        throw new Error(
          'AUTH.key cannot be assigned directly — use _setSessionKey(key, salt, iterations). ' +
          'A key without its derivation parameters seals vaults that nobody can open.'
        );
      },
      configurable: false,
      enumerable: true,
    });
  } catch (e) {
    MMLog?.warn('vault', 'Could not install the AUTH.key guard: ' + e.message);
    return false;
  }

  if (existing) _authKeyInternal = existing;
  _authKeyGuarded = true;
  return true;
}

// Installed as soon as everything has loaded, and again defensively at every
// point that sets a key — so the guard is never the reason a vault fails.
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { _installAuthKeyGuard(); });
  } else {
    _installAuthKeyGuard();
  }
}

function _setSessionKey(key, saltB64, iterations) {
  _installAuthKeyGuard();
  if (!key) throw new Error('_setSessionKey: key is required');
  if (typeof saltB64 !== 'string' || !saltB64) throw new Error('_setSessionKey: salt is required');
  if (!Number.isInteger(iterations) || iterations <= 0) throw new Error('_setSessionKey: iterations is required');
  _authKeyInternal = key;
  AUTH.encrypted = true;
  AUTH.kdf = { salt: saltB64, iterations };
  // Mirrors, for display only. Never read by the seal.
  VAULT.saltB64 = saltB64;
  VAULT.iterations = iterations;
  return AUTH.kdf;
}

function _clearSessionKey() {
  _authKeyInternal = null;
  AUTH.kdf = null;
}

// Re-derive at the current target so the next save genuinely upgrades. Only
// possible while the password is in scope, i.e. at unlock. Key and salt move
// together or not at all; a half-applied upgrade is the fault above.
async function vaultRekeySession(password, targetIterations) {
  const iterations = targetIterations || VAULT_KDF_ITERATIONS;
  const salt = VaultCrypto.randomSaltB64(VaultEnvelope.SALT_BYTES);
  const key  = await _deriveKeyWith(password, salt, iterations);
  _setSessionKey(key, salt, iterations);
  VAULT.dirty = true;
  MMLog?.info('vault', 'Session rekeyed at ' + iterations.toLocaleString() +
    ' iterations — written on next save');
  return AUTH.kdf;
}

// Identity must exist before a seal, and must not depend on vaultLoad having
// run. The live run proved that dependency: unlock succeeded, vaultLoad did
// not adopt an identity, and all three saves died at buildHeader with a null
// vaultId. Guaranteeing it at the point of use removes the ordering problem
// instead of documenting it.
function _vaultEnsureIdentity() {
  if (!AUTH.kdf?.salt || !AUTH.kdf?.iterations) {
    throw new Error('no session KDF parameters — cannot seal a vault whose key cannot be re-derived');
  }
  if (!VAULT.vaultId) {
    VAULT.vaultId = VaultCrypto.uuidV4();
    MMLog?.info('vault', 'Minted vault identity ' + VAULT.vaultId);
  }
  return { vaultId: VAULT.vaultId, salt: AUTH.kdf.salt, iterations: AUTH.kdf.iterations };
}
// Every append is best-effort and never blocks a save: an audit trail that
// can prevent you saving your own work is a denial-of-service on yourself.
// Failures are logged and surfaced, not thrown.
async function _ledgerAppend(type, data) {
  try {
    if (!window.NXAPI?.ledgerAppend) return null;
    const dir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
    if (!dir) return null;
    const res = await window.NXAPI.ledgerAppend(dir, type, data || {});
    if (!res?.ok) { MMLog?.warn('vault', 'Ledger append failed: ' + res?.error); return null; }
    return res.head;
  } catch (e) {
    MMLog?.warn('vault', 'Ledger append error: ' + e.message);
    return null;
  }
}

async function _ledgerState() {
  try {
    if (!window.NXAPI?.ledgerState) return null;
    const dir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
    if (!dir) return null;
    return await window.NXAPI.ledgerState(dir);
  } catch (e) {
    MMLog?.warn('vault', 'Ledger read error: ' + e.message);
    return null;
  }
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
  file: null,           // path to the vault file
  dirty: false,         // unsaved changes
  lastSaved: null,      // timestamp
  saveQueue: null,      // debounce timer
  saveCount: 0,         // monotonic, authenticated in the header
  encrypted: false,     // whether vault is encrypted
  _saveInFlight: false, // single-flight gate — see vaultSave()
  _saveRerun: false,    // a save arrived while one was in flight; run once more after

  // ── v6 identity + KDF parameters ─────────────────────────────────
  // Populated on unlock from the file's own header, or minted at
  // creation. saltB64 lives here in memory and in the file header —
  // never in localStorage. A salt is not a secret; it exists to defeat
  // precomputation, and keeping it in the file is what makes the vault
  // portable to a machine that has never run setup.
  vaultId:    null,
  saltB64:    null,
  iterations: null,

  // Head of the audit chain this vault is sealed against.
  anchor: null,         // { seq, head } | null

  // Set when the guard returns a verdict the person has not answered.
  // A read-only session may open and browse but must not write, or
  // accepting a restored backup would silently overwrite the newer
  // lineage the ledger still remembers.
  readOnly: false,
  readOnlyReason: null,
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

      // ── New modules (v3.1) ──────────────────────────────────────────
      // ALM v2 — cognitive functions log, experiments, heuristics, frameworks, externalizations
      almState: typeof ALM_STATE !== 'undefined' ? (() => {
        const { _loaded, ...data } = ALM_STATE; return data;
      })() : null,

      // Mirror — cognitive architecture, modes, warnings, loops, self-work
      mirror: typeof MIRROR_STATE !== 'undefined' ? (() => {
        const { _loaded, _search, ...data } = MIRROR_STATE; return data;
      })() : null,

      // Relational — people, moments, needs, threads, patterns
      relational: typeof RELATIONAL_STATE !== 'undefined' ? (() => {
        const { _loaded, ...data } = RELATIONAL_STATE; return data;
      })() : null,

      // Voice Lattice + VCE — nodes, heuristics, growth log, philosophy log
      voiceLattice: typeof VL_STATE !== 'undefined' ? (() => {
        const { _loaded, _search, ...data } = VL_STATE; return data;
      })() : null,

      // Associative Engine (modules/voice-lattice/engine.js) — Jaccard
      // association edges, friction/predictive state, and the raw
      // utterance text they're built from. Was localStorage-only
      // (mm_vle_engine_v1) — the exact regression of the bug already
      // fixed once for the lattice itself (see VAULT.spec §2 invariant
      // 4, and modules/lattice/lattice.js's own comment on it). Fixed
      // here the same way: vault-only going forward, old key harvested
      // via _ORPHAN_KEYS like mm_lattice_v1 was.
      associativeEngine: typeof VLE_STATE !== 'undefined' ? {
        utterances: VLE_STATE.utterances, wordBank: VLE_STATE.wordBank,
      } : null,

      // Associative Lattice — modules/lattice/lattice.js. Live object,
      // same as the others above; never localStorage (VAULT.spec §2
      // invariant 4). Sessions are the capture-recording groupings the
      // lattice UI's SESSIONS tab lists.
      lattice: typeof LATTICE !== 'undefined' ? {
        nodes: LATTICE.nodes, edges: LATTICE.edges, sessions: LATTICE.sessions,
        // Nodes aged out of the hot working set (LAT_HOT_WINDOW, see
        // modules/lattice/lattice.js) — moved, never deleted, but this
        // was the actual gap: archive was added in the same pass that
        // removed the old hard prune, and never wired into the vault at
        // all. Every archived node was silently dropped on save until
        // this line existed — "moved to permanent storage" was only
        // true in memory, for as long as the app stayed open. Enforced
        // now, and tests/run-lattice-archive-vault.test.js exists
        // specifically so this can't silently regress again.
        archive: LATTICE.archive,
      } : null,

      // Systems dynamics — causal-loop diagrams. Had NO vault path at
      // all before this fix (unlike body/horizon/domain/mirror/
      // relational/almState above, which were vault-covered but ALSO
      // duplicated to localStorage) — this data existed only as a
      // single plaintext localStorage copy, full stop. simState/
      // simHistory/running are excluded deliberately, matching the old
      // systemsSave()'s own scope — derived simulation output, not the
      // model itself.
      systems: typeof SYSTEMS !== 'undefined' ? {
        variables: SYSTEMS.variables, links: SYSTEMS.links, loops: SYSTEMS.loops,
      } : null,

      // Memory Architecture — compartments (modules/memory/engine.js).
      // Same "no vault path at all" gap as systems, above. Compartments
      // are pointers into other stores (LATTICE, canvas nodes, etc —
      // see that file's own header comment), not duplicate content, but
      // the organization structure itself — names, groupings — is still
      // real data with nowhere else it was being kept safe.
      memory: typeof MEM_STATE !== 'undefined' ? {
        compartments: MEM_STATE.compartments,
      } : null,
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

    // ── Security — MFA (TOTP secret, security-key public keys, backup
    // code hashes). Inside the encrypted blob on purpose: a second
    // factor is only as strong as wherever its secret is stored, and
    // localStorage is plaintext on disk.
    security: {
      mfa: typeof mfaSerializeForVault === 'function' ? mfaSerializeForVault() : null,
    },

    // ── Session position (view only, never a second copy of the data) ──
    session: (typeof MM_SESSION !== 'undefined') ? MM_SESSION.serialize() : null,

    // ── Lexicon + grammar. Learned from your speech, so it is yours and
    // it belongs inside the encryption like everything else. Serialised
    // by the module, written only here (module contract rule 4).
    lexicon: (typeof MM_LEXICON !== 'undefined' && MM_LEXICON) ? MM_LEXICON.serialize() : null,

    // ── Taxonomy: the classifier plus every correction you have made.
    // The corrections ARE the learning, so losing them would reset the
    // system's picture of how you think.
    taxonomy: (typeof MM_TAXONOMY !== 'undefined' && MM_TAXONOMY) ? MM_TAXONOMY.serialize() : null,

    // ── Harvested pre-v6 state (§0.3 — preserved, not interpreted) ────
    pendingHarvest: VAULT.pendingHarvest || null,

    // ── JAA ledger ────────────────────────────────────────────────────
    // Defensive: JAA.ledger must be a Map. It was a plain object for a
    // while, and Object.fromEntries on a non-iterable threw here and killed
    // every save silently. Named fault, not a crash (§1.2, §13.3).
    jaa: (typeof JAA !== 'undefined' && JAA.ledger instanceof Map)
      ? Object.fromEntries(JAA.ledger)
      : {},
  };
}

// ── Node/connection integrity ──────────────────────────────────────────
// The hash chain (vault-ledger.js) and rollback guard (vault-guard.js)
// verify the FILE wasn't tampered with or rolled back. Neither says
// anything about whether the DATA inside a legitimately-decrypted file
// is internally consistent — a duplicate node id (two nodes silently
// overwriting each other in any id-keyed lookup) or a connection
// pointing at a node id that no longer exists (a merge, a partial
// write from an old version, manual file editing) would decrypt and
// verify perfectly fine while still being a broken graph. This is a
// separate check for that: pure, given data in, a report out, no I/O.
function vaultCheckNodeIntegrity(data) {
  const report = { ok: true, duplicateIds: [], danglingConns: [], totalNodes: 0, totalConns: 0 };
  const nodes = data?.canvas?.nodes;
  const conns = data?.canvas?.conns;
  if (!Array.isArray(nodes)) return report;

  report.totalNodes = nodes.length;
  const seen = new Set();
  for (const n of nodes) {
    if (!n || !n.id) continue;
    if (seen.has(n.id)) report.duplicateIds.push(n.id);
    seen.add(n.id);
  }

  if (Array.isArray(conns)) {
    report.totalConns = conns.length;
    for (const c of conns) {
      if (!c) continue;
      if ((c.from && !seen.has(c.from)) || (c.to && !seen.has(c.to))) {
        report.danglingConns.push({ id: c.id || null, from: c.from, to: c.to });
      }
    }
  }

  report.ok = report.duplicateIds.length === 0 && report.danglingConns.length === 0;
  return report;
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

  // SECURITY FIX: this used to write m.almDeltas/m.intuitionRatings BACK
  // OUT to localStorage on every load — re-creating, on a timer, the
  // exact plaintext exposure the vault exists to prevent. Checked every
  // consumer in the app: neither field has an active reader anywhere
  // outside this migration path itself (almState above is the real,
  // live ALM store). They're still carried through the vault payload
  // (harmless, unread data costs nothing to keep), just never written
  // back out to disk unencrypted.

  // Options + feature flags
  if (m.options  && typeof OPTS !== 'undefined') Object.assign(OPTS, m.options);
  if (m.features && typeof AUTH !== 'undefined') {
    AUTH.features = m.features;
    // Self-heal the FEATURES_KEY localStorage cache from the vault's own
    // answer, whenever the two disagree — the module-selection screen
    // ("where would you like to begin") used to check ONLY that cache,
    // which is tied to this machine's profile, not the identity. A vault
    // restored from a backup, opened from a different data folder, or
    // moved to another machine still knows it was configured; the cache
    // does not. This is the one place every deserialize path — encrypted
    // login, plain login, import, restore — passes through, so fixing it
    // here (rather than at each boot-time gate individually) means every
    // path converges on the vault's truth, not just the one that was
    // directly checked. See tests/run-module-selection-once.test.js.
    if (m.features._configured && typeof localStorage !== 'undefined') {
      try {
        const FK = (typeof FEATURES_KEY !== 'undefined') ? FEATURES_KEY : 'nexus_features';
        const cached = JSON.parse(localStorage.getItem(FK) || '{}');
        if (!cached._configured) localStorage.setItem(FK, JSON.stringify(Object.assign({}, cached, m.features)));
      } catch (e) {}
    }
  }

  // ── New modules (v3.1) ──────────────────────────────────────────────
  // ALM v2
  if (m.almState && typeof ALM_STATE !== 'undefined') {
    Object.assign(ALM_STATE, m.almState);
    ALM_STATE._loaded = true;
    // Ensure arrays
    ['functionLog','modelLog','experiments','heuristics','frameworks','externalizations']
      .forEach(k => { if (!Array.isArray(ALM_STATE[k])) ALM_STATE[k] = []; });
  }

  // Mirror
  if (m.mirror && typeof MIRROR_STATE !== 'undefined') {
    Object.assign(MIRROR_STATE, m.mirror);
    MIRROR_STATE._loaded = true;
    ['systems','modes','activeLoops','warnings','selfWork']
      .forEach(k => { if (!Array.isArray(MIRROR_STATE[k])) MIRROR_STATE[k] = []; });
    if (!MIRROR_STATE.activeNow) MIRROR_STATE.activeNow = {
      nervousSystemNote:'', dominantFunction:'Ni', processingMode:'', note:'', ts: null
    };
  }

  // Relational
  if (m.relational && typeof RELATIONAL_STATE !== 'undefined') {
    Object.assign(RELATIONAL_STATE, m.relational);
    RELATIONAL_STATE._loaded = true;
    ['people','moments','needs','threads','patterns']
      .forEach(k => { if (!Array.isArray(RELATIONAL_STATE[k])) RELATIONAL_STATE[k] = []; });
  }

  // Voice Lattice
  if (m.voiceLattice && typeof VL_STATE !== 'undefined') {
    Object.assign(VL_STATE, m.voiceLattice);
    VL_STATE._loaded = true;
    ['nodes','heuristics','growthLog','philosophyLog','valueLog',
     'frameworkDeltas','shadowLog','emotionalLog','coherenceAlerts','sessionHistory']
      .forEach(k => { if (!Array.isArray(VL_STATE[k])) VL_STATE[k] = []; });
    if (!VL_STATE.wordBank || typeof VL_STATE.wordBank !== 'object') VL_STATE.wordBank = {};
  }

  // Associative Engine (modules/voice-lattice/engine.js) — utterances +
  // wordBank restored from the vault; the edge/friction/predictive
  // engines aren't serialized (derivable), so rebuild them from the
  // restored text the same way vleLoad() used to from localStorage.
  if (m.associativeEngine && typeof VLE_STATE !== 'undefined') {
    if (Array.isArray(m.associativeEngine.utterances)) VLE_STATE.utterances = m.associativeEngine.utterances;
    if (m.associativeEngine.wordBank && typeof m.associativeEngine.wordBank === 'object') {
      VLE_STATE.wordBank = m.associativeEngine.wordBank;
    }
    if (typeof vleRebuildAssoc === 'function') {
      try { vleRebuildAssoc(); } catch (e) { MMLog?.warn('voice', 'associative engine rebuild failed: ' + e.message); }
    }
  }

  // Associative Lattice (modules/lattice/lattice.js) — live object,
  // assigned directly the same way the others above are. Guard every
  // array independently rather than trusting the vault's shape, same
  // discipline as voiceLattice just above.
  if (m.lattice && typeof LATTICE !== 'undefined') {
    LATTICE.nodes    = Array.isArray(m.lattice.nodes)    ? m.lattice.nodes    : [];
    LATTICE.edges    = Array.isArray(m.lattice.edges)    ? m.lattice.edges    : [];
    LATTICE.sessions = Array.isArray(m.lattice.sessions) ? m.lattice.sessions : [];
    // Same shape LATTICE.archive is created with in lattice.js — guard
    // both levels independently rather than trusting a saved shape that
    // might predate this field existing at all (any vault saved before
    // this fix has no m.lattice.archive whatsoever, not just an empty one).
    const arc = m.lattice.archive;
    LATTICE.archive = {
      shards: (arc && typeof arc.shards === 'object' && arc.shards) ? arc.shards : {},
      index:  (arc && typeof arc.index  === 'object' && arc.index)  ? arc.index  : {},
    };
    if (typeof _latRebuildIndex === 'function') _latRebuildIndex();
  }

  // Systems dynamics — had no vault path before this fix; see
  // vaultSerialize() above for why.
  if (m.systems && typeof SYSTEMS !== 'undefined') {
    SYSTEMS.variables = Array.isArray(m.systems.variables) ? m.systems.variables : [];
    SYSTEMS.links     = Array.isArray(m.systems.links)     ? m.systems.links     : [];
    SYSTEMS.loops     = Array.isArray(m.systems.loops)     ? m.systems.loops     : [];
  }

  // Memory Architecture — same, no vault path before this fix.
  if (m.memory && typeof MEM_STATE !== 'undefined') {
    MEM_STATE.compartments = Array.isArray(m.memory.compartments) ? m.memory.compartments : [];
  }

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

  // ── Security — MFA. Restored here so it's available the moment the
  // vault is decrypted, which is exactly when loginSubmit() needs to
  // decide whether a second factor is required before sealing the
  // session.
  if (data.security && data.security.mfa && typeof mfaHydrateFromVault === 'function') {
    mfaHydrateFromVault(data.security.mfa);
  }

  // ── JAA ledger ────────────────────────────────────────────────────────
  if (data.jaa && typeof JAA !== 'undefined') {
    Object.entries(data.jaa).forEach(([id, entry]) => JAA.ledger.set(id, entry));
  }

  if (data.session && typeof MM_SESSION !== 'undefined') MM_SESSION.hydrate(data.session);
  if (data.taxonomy && typeof MM_TAXONOMY !== 'undefined' && MM_TAXONOMY) {
    try { MM_TAXONOMY.hydrate(data.taxonomy); } catch (e) { MMLog?.warn('taxonomy', e.message); }
  }
  if (data.lexicon && typeof MM_LEXICON !== 'undefined' && MM_LEXICON) {
    try {
      MM_LEXICON.hydrate(data.lexicon);
      MMLog?.info('lexicon', MM_LEXICON.maturity().summary);
    } catch (e) { MMLog?.warn('lexicon', 'Could not restore the lexicon: ' + e.message); }
  }
  if (data.pendingHarvest) VAULT.pendingHarvest = data.pendingHarvest;

  VAULT.lastSaved = data.saved;
  return true;
}

// ── Single-flight gate ────────────────────────────────────────────────
// ROOT CAUSE, confirmed by read: nothing here serialized concurrent
// callers against the same vaultPath. vaultSave() is invoked from the
// debounce timer, the debounce ceiling, the manual save button, window
// close, and several migration paths (unencrypted->encrypted rewrite,
// keypair repair) — any two of these landing within the same tick both
// build a payload, both call NXAPI.vaultWrite(vaultPath, ...), and both
// read back to verify. If B's write lands on disk between A's write and
// A's read-back, A's _vaultVerifySaved() sees B's bytes, hashes them
// against A's payload, and reports 'hash-mismatch' — the "COULDN'T SAVE
// TO VAULT" dialog — even though B's save was completely good. This is
// a false failure generated by the app racing itself, not disk
// corruption, not antivirus, not a sync client.
//
// Fix: exactly one _vaultSaveOnce() in flight per process. A call that
// arrives while one is running does not start a second write — it marks
// that another save is wanted and rides the in-flight one's promise;
// when that one finishes, exactly one more save runs, capturing
// whatever state changed in between. No writes ever overlap.
async function vaultSave(showToast = false) {
  if (VAULT.saveQueue) { clearTimeout(VAULT.saveQueue); VAULT.saveQueue = null; }

  if (VAULT._saveInFlight) {
    VAULT._saveRerun = VAULT._saveRerun || !!showToast;
    return VAULT._saveChain;
  }

  VAULT._saveInFlight = true;
  VAULT._saveChain = _vaultSaveOnce(showToast).finally(() => {
    VAULT._saveInFlight = false;
    if (VAULT._saveRerun) {
      const rerunToast = VAULT._saveRerun;
      VAULT._saveRerun = false;
      // Deliberately not awaited here — .finally() must not hang the
      // caller of the FIRST save on a save it never asked to wait for.
      // The chain is still tracked on VAULT._saveChain for anyone who
      // does want to await settle-to-quiescence (see flushSave() below).
      vaultSave(rerunToast === true);
    }
  });
  return VAULT._saveChain;
}

// For call sites that must know the vault is fully quiescent — no save
// in flight and none queued behind it — e.g. before quit. Awaiting
// vaultSave()'s return only waits for ONE round; a rerun scheduled by
// that round would still be pending. This drains the whole chain.
async function vaultSaveFlush() {
  while (VAULT._saveInFlight || VAULT._saveRerun) {
    await VAULT._saveChain;
  }
}

async function _vaultSaveOnce(showToast = false) {
  // ── SECURITY: PIN sessions are read-only — zero disk writes ──────────────
  if (_isPinReadOnly()) {
    MMLog?.warn('vault', 'Save blocked: PIN session is read-only. Password required to save.');
    if (showToast) mm_toast('Read-only session · Enter password to save', 'vault');
    return;
  }

  // ── Integrity hold — an unanswered guard verdict blocks writes ───────────
  if (VAULT.readOnly) {
    MMLog?.warn('vault', 'Save blocked: ' + VAULT.readOnlyReason);
    if (showToast) mm_toast('Read-only · ' + VAULT.readOnlyReason, 'warn');
    return;
  }

  // ── Serialization is INSIDE the try ─────────────────────────────────────
  // It used to sit above it. When vaultSerialize() threw — which it did, on
  // Object.fromEntries(JAA.ledger) with a non-iterable ledger — vaultSave
  // rejected before reaching any handler. Called from a setTimeout, that
  // became an unhandled rejection: no toast, no log, no save, no clue.
  let data, json;
  try {
    data = vaultSerialize();
    json = JSON.stringify(data);
  } catch (e) {
    MMLog?.error('vault', 'Serialize failed — NOTHING WAS SAVED: ' + e.message);
    mm_toast('⚡ Save failed while packing state: ' + e.message, 'error', { dur: 6000 });
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.serialize.failed', { error: e.message });
    await _ledgerAppend('vault.save.failed', { stage: 'serialize', reason: String(e.message).slice(0, 200) });
    return;
  }

  // ── REQUIRE NXAPI ─────────────────────────────────────────────
  // Browser mode is gated: the vault file is the only store, and a browser
  // cannot write one. There is deliberately NO localStorage fallback — a
  // silent side copy of the whole app state in plaintext is precisely the
  // thing the vault exists to prevent.
  if (!window.NXAPI) {
    MMLog?.error('vault', 'Save refused: no NXAPI. Vault requires the desktop app.');
    if (showToast) mm_toast('⚡ Desktop app required — nothing is stored in the browser', 'error');
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

  // ── Unencrypted opt-out — its own honest path, not a special case
  // bolted onto the AES pipeline below. "Encryption is mandatory" past
  // this point is a real invariant for every vault that chose it; this
  // branch is for the vault that explicitly didn't.
  if (!AUTH.encrypted) {
    return vaultSaveUnencrypted(vaultPath, data, showToast);
  }

  // ── Encryption is mandatory (for every vault that opted in) ────
  if (!AUTH.key) {
    // Refusing here is correct and not a data-loss risk — nothing has
    // ever been decrypted, so there is nothing this save could have
    // written that wasn't already safe on disk. The genuine question a
    // refusal like this raises is "why was a save attempted before
    // login at all" — vaultDirtySave() now captures the caller's stack
    // at the moment it schedules a save it can already tell is doomed,
    // so that question has an answer instead of just this log line.
    MMLog?.error('vault', 'Save refused: no encryption key in this session.' +
      (VAULT._lastDirtySaveCallerPreAuth ? '\n' + VAULT._lastDirtySaveCallerPreAuth : ''));
    if (showToast) mm_toast('⚡ Not unlocked — cannot write the vault', 'error');
    return;
  }

  // ── Seal ──────────────────────────────────────────────────────
  // Order matters. The ledger entry is written FIRST so the header can
  // carry its hash as the anchor; the anchor is then inside the AAD, so
  // the seal between vault and audit chain cannot be edited afterwards.
  let payload, nextCount;
  try {
    // Identity and KDF parameters resolved BEFORE the ledger entry, so a
    // failure here does not leave an orphaned vault.save with no seal.
    const ident = _vaultEnsureIdentity();
    nextCount = (VAULT.saveCount || 0) + 1;

    const anchor = await _ledgerAppend('vault.save', {
      vaultId: ident.vaultId,
      saveCount: nextCount,
      nodes: CANVAS.NX.nodes.length,
    });

    const header = VaultEnvelope.buildHeader({
      vaultId:      ident.vaultId,
      kdf:          { salt: ident.salt, iterations: ident.iterations },
      iv:           VaultCrypto.randomIvB64(VaultEnvelope.IV_BYTES),
      savedAt:      new Date().toISOString(),
      saveCount:    nextCount,
      ledgerAnchor: anchor ? { seq: anchor.seq, head: anchor.head } : null,
    });

    // Structural check, not a comment. The header must describe the key we
    // are about to encrypt with, or the file becomes unopenable forever.
    if (header.kdf.salt !== AUTH.kdf.salt || header.kdf.iterations !== AUTH.kdf.iterations) {
      throw new Error('header KDF parameters do not match the session key — refusing to write an unopenable vault');
    }

    const ciphertext = await VaultCrypto.encrypt(
      AUTH.key,
      VaultCrypto.utf8Encode(json),
      header.iv,
      VaultEnvelope.aadBytes(header)
    );
    const sha = await VaultCrypto.sha256Hex(ciphertext);
    payload = VaultEnvelope.serialize(
      VaultEnvelope.assemble(header, VaultCrypto.toBase64(ciphertext), sha)
    );
    VAULT.anchor = header.ledgerAnchor;
  } catch(e) {
    MMLog?.error('vault', 'Seal failed: ' + e.message);
    if (showToast) mm_toast('⚡ Vault encrypt error: ' + e.message, 'error');
    // The live run recorded three save.failed/stage:seal entries with no
            // reason, which said something was wrong but not what. An audit
            // entry that cannot be acted on is only half an audit entry.
    await _ledgerAppend('vault.save.failed', { stage: 'seal', reason: String(e.message).slice(0, 200) });
    return;
  }

  // ── Write (atomic + fsync'd via Electron IPC) ─────────────────
  try {
    // Marked BEFORE the write reaches disk, not after: the file watcher
    // (armed in the same renderer) can hear about this exact write via
    // fs.watch before this promise even resolves, and needs a timestamp
    // to recognize its own echo rather than treating it as a change made
    // by something else.
    VAULT._lastOwnWriteAt = Date.now();
    const result = await window.NXAPI.vaultWrite(vaultPath, payload);
    if (!result?.ok) throw new Error(result?.error || 'Write failed');

    // ── Verification gate ───────────────────────────────────────
    // A write reporting ok:true is not proof the vault holds what we
    // think it holds — disk full mid-fsync, a sync/backup tool racing
    // the file, a bad sector, all can leave ok:true and a file that
    // doesn't match. Nothing is ever saved outside the vault, so if the
    // vault can't be trusted, treat it as nothing was saved at all:
    // read it back and check size, full-file hash, and (by decrypting
    // what is actually on disk, not the in-memory copy) that every node
    // really landed, before this save is allowed to call itself clean.
    const expectedNodes = CANVAS.NX.nodes.length;
    const verify = await _vaultVerifySaved(vaultPath, payload, expectedNodes);
    if (!verify.ok) {
      MMLog?.error('vault', 'Save verification FAILED (' + verify.reason + '): ' + (verify.detail || ''));
      VAULT.dirty = true;
      await _ledgerAppend('vault.save.failed', {
        stage: 'verify', reason: verify.reason, detail: String(verify.detail || '').slice(0, 200),
      });
      if (typeof MM_BUS !== 'undefined') {
        MM_BUS.emit('mm.vault.save.verify_failed', { path: vaultPath, reason: verify.reason, detail: verify.detail });
      }
      mm_toast('⚡ SAVE NOT VERIFIED — your changes may not be on disk', 'error', { dur: 8000 });
      if (typeof mmAlert === 'function') {
        mmAlert(
          "The write reported success, but reading the vault back didn't match what was just written.\n\n" +
          'Reason: ' + _vaultVerifyReasonText(verify.reason) + (verify.detail ? '\n' + verify.detail : '') + '\n\n' +
          "Your changes are still safe in memory. Don't close the app — try saving again, and check that " +
          'the data folder has free space and nothing else (backup software, sync tools) is touching the vault file.',
          { title: "COULDN'T SAVE TO VAULT", tone: 'critical' }
        );
      }
      return;
    }

    VAULT.saveCount = nextCount;
    if (VAULT.saveCount % 10 === 0) {
      window.NXAPI.vaultBackup?.(vaultPath).catch(() => {});
    }
    VAULT.lastSaved = Date.now();
    VAULT.dirty = false;
    VAULT.firstDirtyAt = null;   // the ceiling measures from the last write that LANDED
    NX_CONFIG.vaultPath = vaultPath;
    _vaultShowUnsaved(false);

    MMLog?.info('vault', 'Saved #' + VAULT.saveCount + ': ' + CANVAS.NX.nodes.length +
      ' nodes · ' + payload.length + ' bytes → ' + vaultPath.slice(-40) + ' · verified');
    if (typeof MM_BUS !== 'undefined') {
      MM_BUS.emit('mm.vault.saved', {
        path: vaultPath, nodes: CANVAS.NX.nodes.length, saveCount: VAULT.saveCount,
      });
    }
    if (showToast) mm_toast('✓ Vault saved · ' + CANVAS.NX.nodes.length + ' nodes', 'success');
  } catch(e) {
    // No localStorage fallback. Losing the write is bad; silently writing an
    // unencrypted copy of everything to disk is worse, and it hides the
    // failure instead of reporting it.
    MMLog?.error('vault', 'Filesystem write FAILED — changes are still only in memory: ' + e.message);
    VAULT.dirty = true;
    await _ledgerAppend('vault.save.failed', { stage: 'write', reason: String(e.message).slice(0, 200) });
    mm_toast('⚡ SAVE FAILED: ' + e.message + ' · your changes are unsaved', 'error', { dur: 8000 });
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.save.failed', { error: e.message });
    if (typeof mmAlert === 'function') {
      mmAlert(
        "The vault could not be written to disk.\n\nReason: " + e.message +
        "\n\nYour changes are still safe in memory. Don't close the app — fix the underlying " +
        'issue (disk space, permissions, the data folder still existing) and save again.',
        { title: "COULDN'T SAVE TO VAULT", tone: 'critical' }
      );
    }
  }
}

// ── Save verification gate ────────────────────────────────────────────
// Returns { ok: true, bytes } or { ok: false, reason, detail }. Never
// throws — this runs inside vaultSave's own success path and must report
// a verdict, not add a new way for that path to blow up.
//
// Three checks, cheapest first:
//   1. size    — byte-exact length of what's on disk vs what was written
//   2. hash    — full-file SHA-256, catches corruption size alone won't
//   3. nodes   — decrypt what's ACTUALLY on disk (not the in-memory
//                payload) and recount canvas nodes. This is the one that
//                catches a write that is byte-identical to what we asked
//                for, but where a node went missing before the ask —
//                e.g. a mutation racing vaultSerialize().
// Step 3 only runs when the vault is encrypted and this session holds
// the key; an unencrypted vault only gets checks 1–2, which is still a
// real improvement over trusting the OS write() return value alone.
async function _vaultVerifySaved(vaultPath, payload, expectedNodeCount) {
  const fail = (reason, detail) => ({ ok: false, reason, detail: detail || null });

  let onDisk;
  try {
    onDisk = await window.NXAPI.vaultRead(vaultPath);
  } catch (e) {
    return fail('unreadable', e.message);
  }
  if (onDisk == null) return fail('unreadable', 'The vault file could not be read back after writing it.');

  // 1. Size
  const wantBytes = VaultCrypto.utf8Encode(payload).length;
  const gotBytes  = VaultCrypto.utf8Encode(onDisk).length;
  if (gotBytes !== wantBytes) {
    return fail('size-mismatch', 'Wrote ' + wantBytes + ' bytes, disk holds ' + gotBytes + '.');
  }

  // 2. Hash — whole file, not just the ciphertext field inside it.
  let wantHash, gotHash;
  try {
    wantHash = await VaultCrypto.sha256Hex(VaultCrypto.utf8Encode(payload));
    gotHash  = await VaultCrypto.sha256Hex(VaultCrypto.utf8Encode(onDisk));
  } catch (e) {
    return fail('hash-error', e.message);
  }
  if (gotHash !== wantHash) {
    return fail('hash-mismatch', 'The file on disk does not match what this save just wrote.');
  }

  // 3. Nodes — only when we can actually decrypt to check.
  if (AUTH.encrypted && AUTH.key) {
    const parsed = VaultEnvelope.parse(onDisk);
    if (!parsed.ok) return fail('unparseable', parsed.message);
    try {
      const env = parsed.envelope;
      const plainBytes = await VaultCrypto.decrypt(
        AUTH.key, VaultCrypto.fromBase64(env.data), env.iv, VaultEnvelope.aadBytes(env)
      );
      const plain = JSON.parse(VaultCrypto.utf8Decode(plainBytes));
      const gotNodes = (plain?.canvas?.nodes || []).length;
      if (typeof expectedNodeCount === 'number' && gotNodes !== expectedNodeCount) {
        return fail('missing-nodes', 'Expected ' + expectedNodeCount + ' node' +
          (expectedNodeCount === 1 ? '' : 's') + ', the file on disk holds ' + gotNodes + '.');
      }
    } catch (e) {
      return fail('unverifiable-content', 'Could not decrypt the file just written: ' + e.message);
    }
  }

  return { ok: true, bytes: gotBytes };
}

function _vaultVerifyReasonText(reason) {
  return ({
    'unreadable':            'the file could not be read back',
    'size-mismatch':         'the size on disk does not match what was written',
    'hash-mismatch':         'the file on disk does not match what was written',
    'hash-error':            'the file could not be hashed to check it',
    'unparseable':           'the file on disk is not a valid vault',
    'missing-nodes':         'some nodes are missing from the file on disk',
    'unverifiable-content':  'the file on disk could not be decrypted to check it',
  })[reason] || reason;
}

function vaultDirtySave(delayMs) {
  VAULT.dirty = true;

  // Diagnostic breadcrumb, not a behavior change: a save scheduled
  // before any session key exists is doomed to be refused by
  // vaultSave() below, and by the time that refusal logs, the original
  // caller is long gone — the debounced setTimeout callback is all
  // that's left on the stack. Capturing it HERE, at the moment of
  // scheduling, is the only place the real caller is still visible.
  // Cheap enough to always do (a stack capture, not a save) — this
  // turns "why did a save get refused before login" from unanswerable
  // into a one-line lookup next time it happens.
  if (!AUTH.key && AUTH.encrypted) {
    try { VAULT._lastDirtySaveCallerPreAuth = new Error('vaultDirtySave() called before AUTH.key exists').stack; }
    catch (e) {}
  }

  // The autosave toggle in Options was decorative: this function scheduled a
  // save whether it was on or off. Now it is honoured — and when it is OFF,
  // the unsaved state is made visible rather than silently accumulating,
  // because "I turned autosave off" should not mean "I lost an hour".
  if (OPTS.autosave === false) {
    _vaultShowUnsaved(true);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.dirty', { autosave: false });
    return;
  }

  // ── MAX-WAIT CEILING ──────────────────────────────────────────────────
  // A pure debounce STARVES under sustained input. Every call cleared the
  // previous timer, so while transcription produced a node every ~3s
  // against a 4s debounce, the timer reset forever and the write only
  // happened when you stopped talking or closed the app.
  //
  // Measured: 30 seconds of speech, a node every 3s, 4s debounce = ZERO
  // saves. That is the whole of "data isn't persistent" — the nodes were
  // real, in memory, and never written.
  //
  // So: debounce for responsiveness, but never wait longer than the
  // ceiling since the last write that actually landed. Under continuous
  // capture this becomes a plain heartbeat, which is what it should have
  // been.
  const ceiling = (OPTS.autosave_max_wait || 10) * 1000;
  const now = Date.now();
  if (!VAULT.firstDirtyAt) VAULT.firstDirtyAt = now;

  if (now - VAULT.firstDirtyAt >= ceiling) {
    if (VAULT.saveQueue) { clearTimeout(VAULT.saveQueue); VAULT.saveQueue = null; }
    VAULT.firstDirtyAt = null;
    _vaultShowUnsaved(true);
    vaultSave(false);
    return;
  }

  if (VAULT.saveQueue) clearTimeout(VAULT.saveQueue);
  const interval = (OPTS.autosave_interval || 30) * 1000;
  const wait = Math.min(delayMs || interval, Math.max(250, ceiling - (now - VAULT.firstDirtyAt)));
  VAULT.saveQueue = setTimeout(() => vaultSave(false), wait);
  _vaultShowUnsaved(true);
}

// ── Last line of defence ─────────────────────────────────────────────────
// Nothing saved on close. A debounce that has not fired yet, a session
// still recording, a node transcribed two seconds ago — all of it was in
// memory only, and closing the window discarded it silently.
//
// beforeunload is synchronous, so this cannot await an encrypt-and-write.
// What it CAN do is flush the pending timer immediately and tell the main
// process to hold the quit until the write lands.
function _vaultInstallExitGuard() {
  if (typeof window === 'undefined' || VAULT._exitGuard) return;
  VAULT._exitGuard = true;

  window.addEventListener('beforeunload', () => {
    if (!VAULT.dirty) return;
    if (VAULT.saveQueue) { clearTimeout(VAULT.saveQueue); VAULT.saveQueue = null; }
    try { vaultSave(false); } catch (e) {}
    try { window.NXAPI?.holdQuitUntilSaved?.(); } catch (e) {}
  });

  // The reliable one. visibilitychange fires on minimise, tab switch and
  // shutdown, and unlike beforeunload it is not skipped when the process
  // is killed from the taskbar.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && VAULT.dirty) {
      if (VAULT.saveQueue) { clearTimeout(VAULT.saveQueue); VAULT.saveQueue = null; }
      vaultSave(false);
    }
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _vaultInstallExitGuard);
  else _vaultInstallExitGuard();
}

// A small, permanent indicator beats a toast: toasts are gone in four
// seconds and unsaved work is not.
function _vaultShowUnsaved(dirty) {
  const el = document.getElementById('tb-save-state');
  if (!el) return;
  if (dirty) {
    el.textContent = OPTS.autosave === false ? '\u25CF UNSAVED' : '\u25CB saving\u2026';
    el.style.color = OPTS.autosave === false ? 'var(--o)' : 'var(--dim)';
    el.title = OPTS.autosave === false
      ? 'Autosave is off. Press Ctrl+S to write these changes to the vault.'
      : 'Changes will be written to the vault shortly.';
  } else {
    el.textContent = '\u25C6 saved';
    el.style.color = 'var(--dim)';
    el.title = VAULT.lastSaved ? 'Last saved ' + new Date(VAULT.lastSaved).toLocaleTimeString() : '';
  }
}

// ── Guard ────────────────────────────────────────────────────────────────
// Compares the vault's anchor against the audit chain and acts on the
// verdict. A WARN or CRITICAL puts the session read-only until the person
// answers, because the damage from a restored backup is not opening it —
// it is the next SAVE overwriting a newer lineage the ledger remembers.
async function _vaultRunGuard(env) {
  const state = await _ledgerState();
  if (!state?.ok) {
    MMLog?.warn('vault', 'Audit ledger unavailable — integrity not verified this session');
    return;
  }

  const summary = VaultGuard.summarizeLedger(state.entries || [], state.verify);
  const v = VaultGuard.evaluate(env, summary, !!state.missing);

  MMLog?.[v.severity === 'ok' ? 'info' : 'warn']('vault', 'Guard: ' + v.code + ' — ' + v.message);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.guard', v);

  if (!v.requiresPrompt) {
    if (v.code === 'UNANCHORED') mm_toast(v.message, 'vault');
    return;
  }

  VAULT.readOnly = true;
  VAULT.readOnlyReason = v.message;

  const prompt = VaultGuard.promptFor(v);
  await _ledgerAppend('vault.anchor.mismatch', { vaultId: env.vaultId, code: v.code });

  const accepted = (typeof mmConfirm === 'function')
    ? await mmConfirm(prompt.title + '\n\n' + prompt.body)
    : false;

  if (accepted) {
    VAULT.readOnly = false;
    VAULT.readOnlyReason = null;
    await _ledgerAppend('vault.rollback.accepted', { vaultId: env.vaultId, saveCount: env.saveCount });
    mm_toast('Continuing with this vault — the audit ledger has recorded it', 'warn', { dur: 6000 });
  } else {
    await _ledgerAppend('vault.rollback.rejected', { vaultId: env.vaultId, saveCount: env.saveCount });
    mm_toast('Session is READ-ONLY — nothing will be written to this vault', 'warn', { dur: 8000 });
  }
}

// A v5 file has no vaultId, no salt in the header and no counter. Mint the
// missing identity from what the payload does carry so the first v6 save is
// a proper lineage start rather than an anonymous file.
function _vaultAdoptLegacyIdentity(data) {
  // Mints ONLY the vaultId. It must never touch salt or iterations: those
  // belong to AUTH.kdf, set when the key was derived. The previous version
  // of this function fell back to a random salt and the current iteration
  // target, neither of which matched the key — the exact recipe for a vault
  // that no password can ever open.
  VAULT.vaultId   = VAULT.vaultId   || VaultCrypto.uuidV4();
  VAULT.saveCount = VAULT.saveCount || 0;
  VAULT.anchor    = null;
  if (!AUTH.kdf?.salt) {
    MMLog?.error('vault', 'Legacy vault loaded without session KDF parameters — saving is blocked until unlock sets them.');
  }
  return VAULT.vaultId;
}

// ── §12.6 Diagnostic engine ──────────────────────────────────────────────
// A test suite proves a function once at commit time. This answers "is the
// vault healthy right now", live, and is what the Storage panel reads
// instead of guessing from localStorage keys that no longer exist (§2.3 —
// state that cannot be seen does not exist as far as the system is
// concerned; a panel reporting a dead key is worse, it reports a fiction).
async function vaultHealth() {
  const dataDir   = NX_CONFIG.dataDir || _lsGet('nexus_datadir') || null;
  const vaultPath = NX_CONFIG.vaultPath || (dataDir ? dataDir + '/mastermind.vault' : null);

  const health = {
    ts: Date.now(),
    score: 0,
    status: 'unknown',
    checks: [],
    vault: {
      path:       vaultPath,
      vaultId:    VAULT.vaultId,
      saveCount:  VAULT.saveCount,
      lastSaved:  VAULT.lastSaved,
      dirty:      VAULT.dirty,
      readOnly:   VAULT.readOnly,
      iterations: VAULT.iterations,
      bytes:      null,
      savedAt:    null,
    },
    ledger: { present: false, seq: 0, chainOk: null, unlockFailures: null },
    leaks:  [],
  };
  const check = (name, pass, msg) => health.checks.push({ name, pass, msg: msg || null });

  check('desktop_runtime', !!window.NXAPI, window.NXAPI ? null : 'No NXAPI — vault cannot be read or written');
  check('data_dir', !!dataDir, dataDir ? null : 'No data folder configured');
  check('session_unlocked', !!(AUTH?.key), AUTH?.key ? null : 'Session has no key — read-only');
  check('writable', !VAULT.readOnly && !_isPinReadOnly(), VAULT.readOnlyReason || null);

  // ── Vault file, read as the file actually is (§0.1 evidence over memory)
  if (window.NXAPI && vaultPath) {
    try {
      const raw = await window.NXAPI.vaultRead(vaultPath);
      if (!raw) {
        check('vault_file', false, 'Vault file missing at ' + vaultPath);
      } else {
        health.vault.bytes = raw.length;
        const parsed = VaultEnvelope.parse(raw);
        check('vault_parses', parsed.ok, parsed.ok ? null : parsed.message);
        if (parsed.ok && parsed.plain) {
          // Reported, not skipped, and never as a pass: the exposure is real
          // and a health panel that stays quiet about it is worse than useless.
          health.vault.savedAt = parsed.envelope.saved
            ? new Date(parsed.envelope.saved).toISOString() : null;
          health.vault.encrypted = false;
          check('vault_encrypted', false,
            'This vault is UNENCRYPTED — the file is plain readable JSON and outside edits cannot be detected');
        } else if (parsed.ok && !parsed.legacy) {
          const env = parsed.envelope;
          health.vault.savedAt    = env.savedAt;
          health.vault.iterations = env.kdf.iterations;
          check('vault_v6', true);
          const ct = VaultCrypto.fromBase64(env.data);
          const sha = await VaultCrypto.sha256Hex(ct);
          check('ciphertext_intact', VaultCrypto.timingSafeEqualHex(sha, env.ciphertextSha256),
            'Ciphertext hash mismatch — the file is damaged');
          check('kdf_current', env.kdf.iterations >= VAULT_KDF_ITERATIONS,
            'Vault was sealed at ' + env.kdf.iterations.toLocaleString() +
            ' iterations, current target is ' + VAULT_KDF_ITERATIONS.toLocaleString());
        } else if (parsed.ok && parsed.legacy) {
          check('vault_v6', false, 'Still v5 format — upgrades on next save');
        }
      }
    } catch (e) {
      check('vault_file', false, 'Read error: ' + e.message);
    }
  }

  // ── Audit ledger
  const lstate = await _ledgerState();
  if (lstate?.ok) {
    health.ledger.present = !lstate.missing;
    health.ledger.seq     = lstate.verify?.seq || 0;
    health.ledger.chainOk = lstate.verify?.ok !== false;
    const sum = VaultGuard.summarizeLedger(lstate.entries || [], lstate.verify);
    health.ledger.unlockFailures = sum.unlockFailures;
    check('ledger_chain', health.ledger.chainOk,
      health.ledger.chainOk ? null : 'Audit chain broken: ' + (lstate.verify?.reason || 'unknown'));
  } else {
    check('ledger_chain', false, 'Audit ledger unavailable');
  }

  // ── §2.x leak scan: anything of ours outside the vault is a finding.
  // The rule is that nothing persists outside the vault except the vault's
  // own location, so this enumerates violations rather than assuming none.
  const ALLOWED = new Set(['nexus_theme', 'nexus_datadir']);
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (ALLOWED.has(k)) continue;
      health.leaks.push({ key: k, bytes: (localStorage.getItem(k) || '').length });
    }
  } catch (e) {}
  check('no_state_outside_vault', health.leaks.length === 0,
    health.leaks.length ? health.leaks.length + ' key(s) still stored outside the vault' : null);

  const passed = health.checks.filter(c => c.pass).length;
  health.score  = Math.round((passed / health.checks.length) * 100);
  health.status = health.score === 100 ? 'healthy' : health.score >= 70 ? 'degraded' : 'failing';

  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.health', health);
  return health;
}

// ── §0.3 Information must never be lost ──────────────────────────────────
// The previous build wrote app state to localStorage under several keys. The
// moment the vault becomes the only store, those become orphans — real work
// with no reader. This harvests them into the vault ONCE, then clears them,
// and records the migration in the audit ledger.
//
// It is deliberately not automatic on boot: adopting stale state into a live
// vault without the person's say-so is the kind of silent mutation §1.2 and
// §17.6 exist to forbid. The Storage panel offers it when there is something
// to harvest.
const _ORPHAN_KEYS = [
  'mm_vault_data',        // MMVault's plaintext store (the shim's destination)
  'nexus_mm_v3',          // old session cache of the whole payload
  'nexus_void_state',
  'nexus_gap_state',
  'mm_alm_deltas',
  'mm_intuition_ratings',
  'nexus_features',
  'mm_lattice_v1',        // Associative Lattice, before it moved into the vault
  'mm_vl_state_v2',       // Voice Lattice — vlSave() wrote this in parallel with
                          // the vault (voiceLattice, above) since v0.1's first
                          // draft. It was never orphaned, it was a live plaintext
                          // MIRROR of vault-encrypted content the whole time —
                          // worse than an orphan, not better. vlSave()/vlLoad()
                          // no longer touch localStorage as of this fix; this
                          // entry recovers whatever's already sitting there.
  'mm_vle_engine_v1',     // Associative Engine — same bug, never had a vault
                          // path at all until this fix (see associativeEngine
                          // above). Full utterance text, in plaintext, for the
                          // life of the install.
  'nexus_body_state',     // Body — somatic log, nervous-system state, pattern
                          // log. Same live-mirror bug as Voice Lattice: this
                          // was written on every change, in parallel with the
                          // vault (modules.body), for the life of the install.
  'mm_horizon_state',     // Horizon — end-state plans and reverse-causal
                          // chains. Same bug (modules.horizon covers it).
  'nexus_domain_state',   // Domain — intelligence ratings and selections.
                          // Same bug (modules.domain covers it).
  'mm_mirror_state',      // Mirror — cognitive architecture, self-work,
                          // warnings. Same bug (modules.mirror covers it).
  'mm_relational_state',  // Relational — people, moments, needs, patterns
                          // about the people in your life. The single most
                          // sensitive category of data in this app, and it
                          // sat in plaintext the same way, the whole time
                          // (modules.relational covers it).
  'mm_alm_state_v2',      // ALM v2 — cognitive functions log, experiments,
                          // heuristics, frameworks. Same bug (modules.almState
                          // covers it).
  'nexus_systems_state',  // Systems dynamics — causal-loop diagrams. Had NO
                          // vault path at all until this fix (modules.systems
                          // above) — not a duplicate, the ONLY copy.
  'mm_memory_architecture_v1', // Memory Architecture — compartments. Same,
                          // no vault path until this fix (modules.memory).
];

function vaultScanOrphans() {
  const found = [];
  for (const k of _ORPHAN_KEYS) {
    const raw = _lsGet(k);
    if (raw) found.push({ key: k, bytes: raw.length });
  }
  return found;
}

async function vaultHarvestOrphans() {
  const found = vaultScanOrphans();
  if (!found.length) { mm_toast('Nothing to harvest — no state outside the vault', 'vault'); return null; }
  if (!AUTH.key) { mm_toast('Unlock first — the harvest is written into the encrypted vault', 'warn'); return null; }

  const total = found.reduce((n, f) => n + f.bytes, 0);
  const ok = await mmConfirm(
    'Harvest ' + found.length + ' item(s) — ' + (total / 1024).toFixed(1) + ' KB — into the vault?\n\n' +
    found.map(f => '· ' + f.key + ' (' + f.bytes + ' B)').join('\n') +
    '\n\nThis was written by an older build that stored state outside the vault. ' +
    'It will be copied in, then removed from browser storage.'
  );
  if (!ok) return null;

  const harvest = { harvestedAt: new Date().toISOString(), source: 'localStorage', items: {} };
  for (const f of found) {
    const raw = _lsGet(f.key);
    try { harvest.items[f.key] = JSON.parse(raw); }
    catch (e) { harvest.items[f.key] = raw; }   // keep it verbatim rather than lose it
  }

  // Park it under a dedicated key in the payload. Not merged into live module
  // state: this data came from a build whose save path was broken, so its
  // shape is not trusted. Preserved first, interpreted later (§0.3 before §0.1).
  VAULT.pendingHarvest = harvest;
  VAULT.dirty = true;
  await vaultSave(true);

  if (VAULT.dirty) { mm_toast('⚡ Harvest NOT cleared — the save did not land', 'error'); return null; }

  for (const f of found) { try { localStorage.removeItem(f.key); } catch (e) {} }
  await _ledgerAppend('vault.migrated.v5', { items: found.length, bytes: total });
  mm_toast('✓ Harvested ' + found.length + ' item(s) into the vault', 'success');
  MMLog?.info('vault', 'Harvested orphaned localStorage state: ' + found.map(f => f.key).join(', '));
  return harvest;
}

// ── Create a new .vault file ─────────────────────────────────────────────
// Setup used to hand-roll a v5 envelope inline, which is why a freshly
// created vault was still v5 after the v6 work landed. One function, one
// format, used by both setup and any future import path.
// ── Unencrypted vault path ──────────────────────────────────────────────
// The "opt out of encryption" choice writes the same initial-state shape
// as an encrypted vault, but as plain, readable JSON — no key, no AES.
// Its own small path rather than a special case inside vaultCreateNew /
// vaultSave, so those two keep "every write here is AES-GCM" as a simple,
// checkable invariant rather than a sometimes-true one.
async function vaultCreateNewUnencrypted(initialState, opts) {
  const o = opts || {};
  if (!window.NXAPI) throw new Error('Desktop app required — a vault file cannot be created in the browser');

  const dataDir = o.dataDir || NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) throw new Error('No data folder selected');
  const vaultPath = o.vaultPath || (dataDir + '/mastermind.vault');

  const state = Object.assign({}, initialState, {
    format: 'mastermind-vault-plain', encrypted: false, version: 6, saved: Date.now(),
  });
  const payload = JSON.stringify(state, null, 2);

  const result = await window.NXAPI.vaultWrite(vaultPath, payload);
  if (!result?.ok) throw new Error(result?.error || 'Vault write failed');

  // Read it back and parse it before claiming success — same discipline as
  // the encrypted path: a file that was written but can't be re-opened is
  // the failure that matters, and it's invisible until the next login.
  const verifyRaw = await window.NXAPI.vaultRead(vaultPath);
  let parsed;
  try { parsed = JSON.parse(verifyRaw); }
  catch (e) { throw new Error('Verification failed: written vault is not valid JSON'); }
  if (parsed.encrypted !== false) throw new Error('Verification failed: unexpected vault shape after write');

  NX_CONFIG.vaultPath = vaultPath;
  VAULT.vaultId    = null; // unencrypted vaults have no envelope/vaultId — nothing to anchor a ledger to
  VAULT.saveCount  = 1;
  VAULT.lastSaved  = Date.now();
  VAULT.dirty      = false;

  MMLog?.info('vault', 'Created and verified unencrypted vault: ' + vaultPath + ' · ' + payload.length + ' bytes');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.created', { path: vaultPath, encrypted: false });
  return { path: vaultPath, bytes: payload.length };
}

async function vaultSaveUnencrypted(vaultPath, data, showToast) {
  try {
    const payload = JSON.stringify(Object.assign({}, data, {
      format: 'mastermind-vault-plain', encrypted: false, version: 6, saved: Date.now(),
    }), null, 2);
    // Marked before the write, matching the encrypted path — the file
    // watcher needs this timestamp available as early as possible to
    // correctly recognize the fs.watch event this write itself causes.
    VAULT._lastOwnWriteAt = Date.now();
    const result = await window.NXAPI.vaultWrite(vaultPath, payload);
    if (!result?.ok) throw new Error(result?.error || 'Vault write failed');

    // Same gate as the encrypted path — plaintext doesn't earn a pass on
    // "did this actually land". Nothing decrypts here since there's
    // nothing to decrypt, but size, hash and node count all still apply.
    const expectedNodes = CANVAS.NX.nodes.length;
    const onDisk = await window.NXAPI.vaultRead(vaultPath);
    let verifyFail = null;
    if (onDisk == null) {
      verifyFail = { reason: 'unreadable', detail: 'The vault file could not be read back after writing it.' };
    } else if (VaultCrypto.utf8Encode(onDisk).length !== VaultCrypto.utf8Encode(payload).length) {
      verifyFail = { reason: 'size-mismatch', detail: 'The file on disk is not the size that was written.' };
    } else if (await VaultCrypto.sha256Hex(VaultCrypto.utf8Encode(onDisk)) !== await VaultCrypto.sha256Hex(VaultCrypto.utf8Encode(payload))) {
      verifyFail = { reason: 'hash-mismatch', detail: 'The file on disk does not match what was written.' };
    } else {
      try {
        const gotNodes = (JSON.parse(onDisk)?.canvas?.nodes || []).length;
        if (gotNodes !== expectedNodes) {
          verifyFail = { reason: 'missing-nodes', detail: 'Expected ' + expectedNodes + ' nodes, disk holds ' + gotNodes + '.' };
        }
      } catch (e) {
        verifyFail = { reason: 'unparseable', detail: 'The file on disk is not valid JSON.' };
      }
    }
    if (verifyFail) {
      VAULT.dirty = true;
      MMLog?.error('vault', 'Unencrypted save verification FAILED (' + verifyFail.reason + '): ' + verifyFail.detail);
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.save.verify_failed', Object.assign({ path: vaultPath }, verifyFail));
      mm_toast('⚡ SAVE NOT VERIFIED — your changes may not be on disk', 'error', { dur: 8000 });
      if (typeof mmAlert === 'function') {
        mmAlert(
          "The write reported success, but reading the vault back didn't match what was just written.\n\n" +
          'Reason: ' + _vaultVerifyReasonText(verifyFail.reason) + '\n' + verifyFail.detail + '\n\n' +
          "Your changes are still safe in memory. Don't close the app — try saving again.",
          { title: "COULDN'T SAVE TO VAULT", tone: 'critical' }
        );
      }
      return;
    }

    VAULT.saveCount = (VAULT.saveCount || 0) + 1;
    VAULT.lastSaved = Date.now();
    VAULT.dirty = false;
    if (showToast) mm_toast('Vault saved (unencrypted) · verified', 'vault');
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.saved', { path: vaultPath, encrypted: false, saveCount: VAULT.saveCount });
  } catch (e) {
    VAULT.dirty = true;
    MMLog?.error('vault', 'Unencrypted save failed: ' + e.message);
    if (showToast) mm_toast('⚡ Save failed: ' + e.message, 'error');
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.save.failed', { error: e.message });
    if (typeof mmAlert === 'function') {
      mmAlert(
        "The vault could not be written to disk.\n\nReason: " + e.message +
        "\n\nYour changes are still safe in memory. Don't close the app — fix the underlying " +
        'issue and save again.',
        { title: "COULDN'T SAVE TO VAULT", tone: 'critical' }
      );
    }
  }
}

async function vaultCreateNew(password, initialState, opts) {
  const o = opts || {};
  if (!window.NXAPI) throw new Error('Desktop app required — a vault file cannot be created in the browser');

  const dataDir = o.dataDir || NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) throw new Error('No data folder selected');
  const vaultPath = o.vaultPath || (dataDir + '/mastermind.vault');

  const iterations = o.iterations || VAULT_KDF_ITERATIONS;
  const salt = VaultCrypto.randomSaltB64(VaultEnvelope.SALT_BYTES);
  const key  = await _deriveKeyWith(password, salt, iterations);
  _setSessionKey(key, salt, iterations);

  VAULT.vaultId   = VaultCrypto.uuidV4();
  VAULT.saveCount = 0;
  VAULT.anchor    = null;
  VAULT.file      = vaultPath;
  NX_CONFIG.vaultPath = vaultPath;

  await _ledgerAppend('vault.created', { vaultId: VAULT.vaultId, iterations });

  const anchor = await _ledgerAppend('vault.save', {
    vaultId: VAULT.vaultId, saveCount: 1, nodes: 0,
  });

  const header = VaultEnvelope.buildHeader({
    vaultId:      VAULT.vaultId,
    kdf:          { salt, iterations },
    iv:           VaultCrypto.randomIvB64(VaultEnvelope.IV_BYTES),
    savedAt:      new Date().toISOString(),
    saveCount:    1,
    ledgerAnchor: anchor ? { seq: anchor.seq, head: anchor.head } : null,
  });

  const plaintext = VaultCrypto.utf8Encode(JSON.stringify(initialState));
  const ct  = await VaultCrypto.encrypt(key, plaintext, header.iv, VaultEnvelope.aadBytes(header));
  const sha = await VaultCrypto.sha256Hex(ct);
  const payload = VaultEnvelope.serialize(
    VaultEnvelope.assemble(header, VaultCrypto.toBase64(ct), sha)
  );

  const result = await window.NXAPI.vaultWrite(vaultPath, payload);
  if (!result?.ok) throw new Error(result?.error || 'Vault write failed');

  // Read it back and open it before claiming success. A vault that was
  // written but cannot be re-opened is the failure that matters, and it is
  // invisible until the next login (§1.1 — demonstrate, do not assume).
  const verifyRaw = await window.NXAPI.vaultRead(vaultPath);
  const parsed = VaultEnvelope.parse(verifyRaw);
  if (!parsed.ok || parsed.legacy || parsed.plain) throw new Error('Verification failed: written vault does not parse as an encrypted v6 vault');
  const vct = VaultCrypto.fromBase64(parsed.envelope.data);
  const vsha = await VaultCrypto.sha256Hex(vct);
  if (!VaultCrypto.timingSafeEqualHex(vsha, parsed.envelope.ciphertextSha256)) {
    throw new Error('Verification failed: ciphertext hash mismatch immediately after write');
  }
  await VaultCrypto.decrypt(key, vct, parsed.envelope.iv, VaultEnvelope.aadBytes(parsed.envelope));

  VAULT.saveCount = 1;
  VAULT.lastSaved = Date.now();
  VAULT.dirty = false;
  VAULT.anchor = header.ledgerAnchor;

  MMLog?.info('vault', 'Created and verified v6 vault: ' + vaultPath +
    ' · ' + payload.length + ' bytes · ' + iterations.toLocaleString() + ' iterations');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.created', { path: vaultPath, vaultId: VAULT.vaultId });
  return { path: vaultPath, vaultId: VAULT.vaultId, bytes: payload.length };
}

// ── Boot sequence ────────────────────────────────────────────────────────
// Gathers the probes (the impure part) and hands them to VaultBoot, which
// decides (the pure part). Runs before the unlock screen, so a damaged or
// missing vault is caught while there is nothing in memory to lose.
async function vaultBootCheck() {
  const dataDir   = NX_CONFIG.dataDir || _lsGet('nexus_datadir') || null;
  const vaultPath = dataDir ? dataDir + '/mastermind.vault' : null;

  const probes = {
    hasNXAPI: !!window.NXAPI,
    dataDir,
    cryptoAvailable: !!(window.crypto && window.crypto.subtle),
    cryptoRoundTrip: false,
    kdfMs: null,
    vaultExists: false, vaultBytes: null,
    parseOk: false, parseMessage: null, legacy: false, plain: false, plainUsername: null,
    kdfIterations: null,
    ciphertextIntact: false,
    ledgerMissing: true, ledgerChainOk: null, ledgerSeq: 0, ledgerReason: null,
    unlockFailures: 0, vaultAnchored: false,
    snapshotCount: 0, newestSnapshotVerified: null, newestSnapshotProblem: null,
    newestSnapshotAgeHours: null,
    watcherArmed: false,
    binaryFormat: null,
    expectedEncrypted: null,
  };

  // ── Expected encryption state ───────────────────────────────────────────
  // What this machine remembers from the last vault it successfully opened.
  // Read here, compared against the actual file by VaultBoot's
  // 'encryption_expected' check — see that file for why the marker (not the
  // file) is the thing being questioned when the two disagree.
  try {
    const markerRaw = _lsGet(AUTH_META_KEY);
    if (markerRaw) {
      const marker = JSON.parse(markerRaw);
      if (marker && typeof marker.noEncryption === 'boolean') {
        probes.expectedEncrypted = !marker.noEncryption;
      }
    }
  } catch (e) { /* no marker, or it's junk — leave expectedEncrypted null, the check skips itself */ }

  // ── Encryption: a real round trip, not a feature-detect ────────────────
  if (probes.cryptoAvailable) {
    try {
      const t0 = performance.now();
      const salt = VaultCrypto.randomSaltB64(VaultEnvelope.SALT_BYTES);
      const key  = await _deriveKeyWith('boot-self-test-not-a-secret', salt, VaultEnvelope.MIN_ITERATIONS);
      probes.kdfMs = Math.round(performance.now() - t0);
      const iv  = VaultCrypto.randomIvB64(VaultEnvelope.IV_BYTES);
      const aad = VaultCrypto.utf8Encode('boot');
      const msg = 'mastermind-boot-' + Date.now();
      const ct  = await VaultCrypto.encrypt(key, VaultCrypto.utf8Encode(msg), iv, aad);
      const pt  = VaultCrypto.utf8Decode(await VaultCrypto.decrypt(key, ct, iv, aad));
      probes.cryptoRoundTrip = (pt === msg);
    } catch (e) {
      probes.cryptoRoundTrip = false;
      MMLog?.error('vault', 'Boot crypto self-test failed: ' + e.message);
    }
  }

  // ── Vault file ─────────────────────────────────────────────────────────
  if (window.NXAPI && vaultPath) {
    try {
      const raw = await window.NXAPI.vaultRead(vaultPath);
      if (raw) {
        probes.vaultExists = true;
        probes.vaultBytes = raw.length;
        const parsed = VaultEnvelope.parse(raw);
        probes.parseOk = parsed.ok;
        probes.parseMessage = parsed.message || null;
        probes.legacy = !!parsed.legacy;
        probes.plain  = !!parsed.plain;
        // Only sniff for an archive signature once JSON.parse has already
        // failed — this is a diagnosis for that failure, not a routine
        // extra read on every healthy boot.
        if (!parsed.ok && window.NXAPI?.vaultProbeFormat) {
          try {
            const probe = await window.NXAPI.vaultProbeFormat(vaultPath);
            probes.binaryFormat = probe?.archiveKind || null;
          } catch (e) { /* diagnostic only — a failure here must not block boot */ }
        }
        if (parsed.plain) {
          // Only the display name, and only for an unencrypted vault where it
          // is not a secret to begin with. Startup routing needs it so that a
          // machine with no local identity marker still opens the vault
          // instead of demanding a password it does not have.
          const st = parsed.envelope;
          probes.plainUsername = (st.identity && st.identity.username) || st.username || null;
        }
        // A plain vault has no kdf, no data and no ciphertextSha256. Reading
        // env.kdf.iterations here would throw, the whole boot check would be
        // caught by its own try/catch, and the failure would surface as a
        // misleading "Read error" instead of anything true.
        if (parsed.ok && !parsed.legacy && !parsed.plain) {
          const env = parsed.envelope;
          probes.kdfIterations = env.kdf.iterations;
          probes.vaultAnchored = !!env.ledgerAnchor;
          const ct = VaultCrypto.fromBase64(env.data);
          const sha = await VaultCrypto.sha256Hex(ct);
          probes.ciphertextIntact = VaultCrypto.timingSafeEqualHex(sha, env.ciphertextSha256);
        }
      }
    } catch (e) {
      probes.parseMessage = 'Read error: ' + e.message;
    }

    // ── Ledger ───────────────────────────────────────────────────────────
    const lstate = await _ledgerState();
    if (lstate?.ok) {
      probes.ledgerMissing = !!lstate.missing;
      probes.ledgerChainOk = lstate.verify?.ok !== false;
      probes.ledgerSeq     = lstate.verify?.seq || 0;
      probes.ledgerReason  = lstate.verify?.reason || null;
      const sum = VaultGuard.summarizeLedger(lstate.entries || [], lstate.verify);
      probes.unlockFailures = sum.unlockFailures;
    }

    // ── Snapshots ────────────────────────────────────────────────────────
    try {
      const st = await window.NXAPI.snapshotStatus?.(dataDir, vaultPath);
      if (st?.ok) {
        probes.snapshotCount = st.status.count;
        probes.newestSnapshotVerified = st.status.newestVerified;
        probes.newestSnapshotProblem  = st.status.newestProblem;
        probes.newestSnapshotAgeHours = st.status.ageHours;
      }
    } catch (e) {}

    // ── Watcher ──────────────────────────────────────────────────────────
    if (probes.vaultExists) {
      try {
        const w = await window.NXAPI.vaultWatch?.(vaultPath);
        probes.watcherArmed = !!w?.ok;
      } catch (e) {}
    }
  }

  const report = VaultBoot.run(probes);
  report.probes = probes;
  report.vaultPath = vaultPath;
  report.dataDir = dataDir;

  MMLog?.[report.canProceed ? 'info' : 'error']('vault', 'Boot: ' + report.summary);
  for (const s of report.steps) {
    if (s.status === 'critical' || s.status === 'warn') {
      MMLog?.warn('vault', '  ' + s.label + ': ' + (s.detail || s.status));
    }
  }
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.boot', report);
  return report;
}

// Take a snapshot before the session touches anything, and prune. Called
// after a successful boot check, not before — snapshotting a file that
// failed integrity would preserve the damage as though it were good.
async function vaultSnapshotOnBoot(report) {
  if (!window.NXAPI?.snapshotCreate) return null;
  if (!report?.probes?.vaultExists || !report.probes.parseOk) return null;
  // `plain` joins `legacy` here for the same reason legacy is exempt: neither
  // format has a ciphertext hash, so ciphertextIntact is false for both and
  // the guard below would refuse to ever snapshot them. An unencrypted vault
  // is the one that needs snapshots MOST — nothing else protects it.
  if (!report.probes.legacy && !report.probes.plain && !report.probes.ciphertextIntact) {
    MMLog?.warn('vault', 'Skipping boot snapshot — the vault failed integrity, a snapshot would preserve the damage');
    return null;
  }
  try {
    const res = await window.NXAPI.snapshotCreate(report.dataDir, report.vaultPath, 'boot');
    if (res?.ok && !res.skipped) MMLog?.info('vault', 'Boot snapshot: ' + res.name);
    await window.NXAPI.snapshotPrune?.(report.dataDir, report.vaultPath, null);
    return res;
  } catch (e) {
    MMLog?.warn('vault', 'Boot snapshot failed: ' + e.message);
    return null;
  }
}

// The vault file disappearing mid-session is the event this whole watcher
// exists for. Going read-only immediately is the only safe response: a save
// would recreate the file and make the deletion look like a fresh vault.
//
// The other branch — the file being WRITTEN by something else, a sync
// client, a second instance, a manual restore — is what makes the live
// in-memory copy an actual cache rather than a one-time snapshot: this
// is what notices the real file moved on and offers to catch the RAM
// copy up to it, instead of the two silently diverging until the next
// save overwrites whatever the other writer left.
async function vaultArmFileWatcher() {
  if (!window.NXAPI?.onVaultFileEvent) return false;
  window.NXAPI.onVaultFileEvent(async (evt) => {
    if (evt.event === 'removed') {
      VAULT.readOnly = true;
      VAULT.readOnlyReason = 'Vault file was deleted while the app was running';
      MMLog?.error('vault', 'VAULT FILE REMOVED: ' + evt.path);
      await _ledgerAppend('vault.anchor.mismatch', { code: 'FILE_REMOVED' });
      mm_toast('⚡ The vault file was deleted. Session is READ-ONLY. Restore a snapshot or create a new vault.',
        'error', { dur: 0 });
      if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.file.removed', evt);
      return;
    }

    // 'changed'. First question: is this an echo of our OWN save landing,
    // or a genuinely different writer? fs.watch on the directory fires
    // for every write including ours, and the IPC round-trip back to the
    // renderer can arrive before or after vaultSave()'s own saveCount
    // bump — so a short grace window after a known self-write is checked
    // first, before falling back to comparing saveCount against the
    // file's own claimed count.
    const sinceOwnWrite = Date.now() - (VAULT._lastOwnWriteAt || 0);
    if (sinceOwnWrite < 2500) {
      MMLog?.info('vault', 'Vault file change is our own save landing — no action needed');
      return;
    }

    let fileSaveCount = null;
    try {
      const raw = await window.NXAPI.vaultRead(evt.path);
      const parsed = raw ? VaultEnvelope.parse(raw) : null;
      // A plain vault carries no envelope header; its saveCount, if any, sits
      // at the top level of the state. Missing stays null and the change is
      // surfaced rather than silently treated as stale.
      if (parsed?.ok) {
        const sc = parsed.envelope.saveCount;
        fileSaveCount = Number.isInteger(sc) ? sc : null;
      }
    } catch (e) { /* header unreadable — fall through and still surface it as changed */ }

    if (fileSaveCount != null && fileSaveCount <= (VAULT.saveCount || 0)) {
      MMLog?.info('vault', 'Vault file change is stale/duplicate (file save #' + fileSaveCount + ' vs in-memory #' + VAULT.saveCount + ') — ignoring');
      return;
    }

    MMLog?.warn('vault', 'Vault file changed on disk by another process — file save #' + fileSaveCount + ', in-memory #' + VAULT.saveCount);
    VAULT.externalUpdateAvailable = true;
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.file.changed', { ...evt, fileSaveCount, memorySaveCount: VAULT.saveCount });

    const reload = (typeof mmConfirm === 'function')
      ? await mmConfirm(
          'This vault was updated somewhere else — save #' + (fileSaveCount ?? '?') + ' on disk, #' + (VAULT.saveCount || 0) + ' in this window.\n\n' +
          'Reload now to bring in the newer version? Anything you\u2019ve typed since your last save here would be lost. Choosing not to reload keeps working on your current copy, which will overwrite the other version on your next save.'
        )
      : false;

    if (reload) {
      const ok = await vaultLoad();
      if (ok) {
        VAULT.externalUpdateAvailable = false;
        mm_toast('Reloaded — now showing the newer version', 'vault');
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.file.reloaded', { fileSaveCount });
      } else {
        mm_toast('⚡ Reload failed — staying on the current in-memory copy', 'error', { dur: 6000 });
      }
    } else {
      mm_toast('Keeping your current copy — it will overwrite the other version on your next save', 'warn', { dur: 6000 });
    }
  });
  return true;
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

    const parsed = VaultEnvelope.parse(raw);
    if (!parsed.ok) {
      MMLog?.error('vault', 'Vault unreadable: ' + parsed.reason);
      mm_toast('⚡ ' + parsed.message, 'error', { dur: 6000 });
      _showVaultMissingScreen(vaultPath, 'corrupt');
      return null;
    }

    if (parsed.plain) {
      // No key, no decrypt, no ciphertext hash. The file IS the state, so
      // hydration starts here rather than after a decryption step. Reached on
      // every "Load from Vault" for an unencrypted vault; without this branch
      // it fell through to the encrypted path and stopped at "login required
      // to decrypt" on a file with nothing to decrypt.
      const read = VaultEnvelope.readPlain(parsed.envelope);
      if (!read.ok) { mm_toast('⚡ ' + read.message, 'error'); return null; }
      data = read.state;
      VAULT.vaultId    = null;
      VAULT.saltB64    = null;
      VAULT.iterations = null;
      VAULT.saveCount  = data.saveCount != null ? data.saveCount : 0;
      VAULT.anchor     = null;
      MMLog?.warn('vault', 'Loaded an UNENCRYPTED vault — no cipher, no integrity hash');
    } else if (parsed.legacy) {
      // v5: no salt in the file. AUTH.key was derived at login from the
      // localStorage salt, which is exactly the dependency v6 removes.
      // Decrypt with what we have and let vaultSave rewrite it as v6.
      if (!AUTH.key) { mm_toast('Vault encrypted — login required to decrypt', 'warn'); return null; }
      const legacy = VaultEnvelope.readLegacyV5(parsed.envelope);
      if (!legacy.ok) { mm_toast('⚡ ' + legacy.message, 'error'); return null; }
      if (legacy.encrypted === false) {
        data = legacy.plainState;
      } else {
        const plainBuf = await _aesDecrypt(AUTH.key, { iv: legacy.iv, data: legacy.data });
        data = JSON.parse(new TextDecoder().decode(plainBuf));
      }
      _vaultAdoptLegacyIdentity(data);
      MMLog?.warn('vault', 'v5 vault loaded — will be rewritten as v6 on next save');
      mm_toast('Vault upgraded to v6 format on next save', 'vault');
      VAULT.dirty = true;
      vaultDirtySave(2000);
    } else {
      const env = parsed.envelope;
      if (!AUTH.key) { mm_toast('Vault encrypted — login required to decrypt', 'warn'); return null; }

      // Corrupt file and wrong password are different problems with
      // different answers. Check the cheap one first, before any key work.
      const ct = VaultCrypto.fromBase64(env.data);
      const sha = await VaultCrypto.sha256Hex(ct);
      if (!VaultCrypto.timingSafeEqualHex(sha, env.ciphertextSha256)) {
        MMLog?.error('vault', 'Ciphertext hash mismatch — file is damaged, not a wrong password');
        await _ledgerAppend('vault.unlock.corrupt', { vaultId: env.vaultId });
        mm_toast('⚡ Vault file is damaged — restore from a backup', 'error', { dur: 8000 });
        _showVaultMissingScreen(vaultPath, 'corrupt');
        return null;
      }

      const plain = await VaultCrypto.decrypt(AUTH.key, ct, env.iv, VaultEnvelope.aadBytes(env));
      data = JSON.parse(VaultCrypto.utf8Decode(plain));

      VAULT.vaultId    = env.vaultId;
      VAULT.saltB64    = env.kdf.salt;
      VAULT.iterations = env.kdf.iterations;
      VAULT.saveCount  = env.saveCount;
      VAULT.anchor     = env.ledgerAnchor;

      await _vaultRunGuard(env);
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

      // No session cache. The previous build mirrored canvas + modules into
      // localStorage['nexus_mm_v3'] on every load — a full plaintext copy of
      // the vault contents sitting outside the vault. Deleted deliberately.

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
  if (!(await mmConfirm('Decrypt vault permanently?\n\nThis will remove encryption and save as plaintext.'))) return;

  // Update in-memory auth store to reflect noEncryption
  const meta = _authLoadMeta();
  if (meta) _authStoreSet({ ...meta, noEncryption: true }, _AUTH_STORE.keys);

  AUTH.encrypted = false;
  _clearSessionKey();

  // Write full vault (now unencrypted) to disk — vaultSave reads from _AUTH_STORE
  await vaultSave(false);

  if (typeof T !== 'undefined') T.vaultDecrypted();
  else mm_toast('Vault decrypted · plaintext mode', 'warn');
}

async function vaultExport(mode) {
  const data = vaultSerialize();
  if (mode === 'decrypted') {
    // A DECRYPTED export is plain JSON — it has no key, so it needs no salt,
    // and the v5 envelope fields would be meaningless on it. Labelled as what
    // it is instead of wearing a vault envelope it does not satisfy.
    const json = JSON.stringify({
      format: 'mastermind-export-plaintext',
      warning: 'UNENCRYPTED. This file contains the full contents of your vault in the clear.',
      exported: new Date().toISOString(),
      payloadVersion: data.version,
      data,
    }, null, 2);
    _downloadText('mastermind-DECRYPTED-' + Date.now() + '.json', json);
    mm_toast('Vault exported · decrypted JSON', 'export');
  } else if (mode === 'encrypted') {
    if (!AUTH.key) { toast('No encryption key — vault is unencrypted'); vaultExport('decrypted'); return; }
    if (!AUTH.kdf?.salt) { mm_toast('⚡ No session KDF parameters — cannot write an openable export', 'error'); return; }

    // Was a v5 envelope: {encrypted, version:5, iv, data} — with NO salt and
    // no iteration count. An encrypted export nobody can ever decrypt is not
    // a backup, it is a decoy, and it would have been discovered only on the
    // day someone needed it. Exports are full v6 envelopes now, so the file
    // carries everything required to reopen it on any machine.
    const json = JSON.stringify(data);
    const header = VaultEnvelope.buildHeader({
      vaultId:      VAULT.vaultId || VaultCrypto.uuidV4(),
      kdf:          { salt: AUTH.kdf.salt, iterations: AUTH.kdf.iterations },
      iv:           VaultCrypto.randomIvB64(VaultEnvelope.IV_BYTES),
      saveCount:    VAULT.saveCount || 0,
      ledgerAnchor: null,   // an export is a copy, not a link in the chain
    });
    const ct  = await VaultCrypto.encrypt(AUTH.key, VaultCrypto.utf8Encode(json), header.iv, VaultEnvelope.aadBytes(header));
    const sha = await VaultCrypto.sha256Hex(ct);
    const payload = VaultEnvelope.serialize(VaultEnvelope.assemble(header, VaultCrypto.toBase64(ct), sha));

    // Prove it reopens before handing it over as a backup.
    const check = VaultEnvelope.parse(payload);
    if (!check.ok || check.legacy || check.plain) { mm_toast('⚡ Export failed verification — not written', 'error'); return; }
    await VaultCrypto.decrypt(AUTH.key, VaultCrypto.fromBase64(check.envelope.data),
      check.envelope.iv, VaultEnvelope.aadBytes(check.envelope));

    _downloadText('mastermind-vault-' + Date.now() + '.vault', payload);
    mm_toast('Vault exported · encrypted v6 · verified', 'export');
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
    'legacy-salt-absent': 'This is an older-format vault, and the key material needed to open it only ever existed on the computer that created it.',
  }[reason] || 'Vault is unavailable.';

  // Hide all startup screens and homepage. Uses the shared helper because
  // adding `hidden` alone does not beat an inline display style — which is
  // exactly what this function then sets on its own element below.
  if (typeof mmHideAllStartupScreens === 'function') mmHideAllStartupScreens();
  else document.querySelectorAll('.startup-inner').forEach(el => { el.classList.add('hidden'); el.style.display = ''; });
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
        ↩ RESTORE FROM BACKUP FILE
      </button>
      <button onclick="_vaultCheckSnapshots('${escH(vaultPath || '')}')" style="
        padding:12px 24px;border:1px solid #7744ff;color:#7744ff;background:rgba(119,68,255,.08);
        font-family:var(--f-display);font-size:9px;font-weight:700;letter-spacing:3px;
        cursor:pointer;transition:all .18s"
        onmouseenter="this.style.background='rgba(119,68,255,.18)'"
        onmouseleave="this.style.background='rgba(119,68,255,.08)'">
        ⏱ RESTORE FROM SNAPSHOT
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

  // Was: `const isEncrypted = meta && !meta.noEncryption;` — a two-way
  // branch that silently treated "we don't know" the same as "it wasn't
  // encrypted". _authLoadMeta() reads a LOCAL, machine-only marker; if
  // the vault file is gone AND that marker never existed on this machine
  // or session (a fresh install, a cleared profile, a move to a new
  // machine — exactly the situation someone recovering a missing vault
  // is often already in), meta is null regardless of what the actual,
  // now-missing vault was. Guessing "unencrypted" in that gap is a
  // silent security downgrade dressed as a recovery flow: a vault that
  // really was encrypted comes back with no password on it, and the
  // screen says "Your vault was unencrypted" — false, not just unknown.
  // The audit ledger lives outside the vault specifically to survive
  // this kind of loss, but a ledger this app has never seen before
  // (case handled below) carries no history to check either — there is
  // no way to actually know, so the fix is to say so, not to guess.
  if (meta && meta.noEncryption === true) {
    _vaultRecreateRenderPlainChoice(form, true);
  } else if (meta && meta.noEncryption === false) {
    _vaultRecreateRenderEncryptedChoice(form, username);
  } else {
    _vaultRecreateRenderUnknownChoice(form);
  }

  const container = document.getElementById('ss-vault-missing');
  if (container) container.appendChild(form);
  else if (statusEl) statusEl.after(form);
}

function _vaultRecreateRenderEncryptedChoice(form, username) {
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
  setTimeout(() => document.getElementById('vault-recovery-pw')?.focus(), 100);
}

function _vaultRecreateRenderPlainChoice(form) {
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

// The honest third state: this machine has no record of whether the
// vault that went missing was encrypted. Rather than guess — in either
// direction — the person is asked, because they're the only one who
// actually knows.
function _vaultRecreateRenderUnknownChoice(form) {
  form.innerHTML = `
      <div style="font-family:var(--f-mono);font-size:8px;color:var(--y);letter-spacing:1.5px;margin-bottom:10px">
        VAULT RECOVERY — ENCRYPTION UNKNOWN
      </div>
      <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:14px;line-height:1.8">
        This machine has no record of whether your vault was encrypted —
        that's tracked locally, and either the vault, this device, or this
        profile changed since it was set up. Guessing wrong in the unsafe
        direction would silently create a vault with no password on it, so
        this asks instead: was your vault encrypted?<br>
        <span style="color:var(--o)">⚠ Previous data cannot be recovered either way.</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button onclick="_vaultRecreateRenderEncryptedChoice(document.getElementById('vault-recovery-form'), (_authLoadMeta()?.username)||'operator')"
          style="padding:9px;border:1px solid var(--c);background:transparent;color:var(--c);
                 cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
          🔒 IT WAS ENCRYPTED — SET A NEW PASSWORD
        </button>
        <button onclick="_vaultRecreateRenderPlainChoice(document.getElementById('vault-recovery-form'))"
          style="padding:9px;border:1px solid var(--wire2);background:transparent;color:var(--dim);
                 cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
          IT WAS NOT ENCRYPTED — CREATE A PLAIN VAULT
        </button>
      </div>`;
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
  if (pw.length < 8) { setErr('Password must be at least 8 characters'); return; }

  // NOTE ON WHAT THIS SCREEN IS.
  // There is nothing here to verify a password against — the vault file is
  // gone and its key material went with it. This does not RECOVER anything.
  // It creates a NEW vault, and whatever is typed becomes its password.
  // The previous version required meta.salt from localStorage and refused
  // without it, which made recovery impossible on exactly the machines that
  // needed it most.
  const username = document.getElementById('vault-recovery-username')?.value
    || _authLoadMeta()?.username || AUTH.username || 'operator';

  const btn = document.querySelector('#vault-recovery-form button');
  if (btn) { btn.textContent = 'Creating vault…'; btn.disabled = true; }

  try {
    await _vaultRecreateWithKey(pw, username);
  } catch(e) {
    setErr('Could not create a new vault: ' + e.message);
    MMLog?.error('vault', 'Recreate failed: ' + e.message);
    if (btn) { btn.textContent = '⬡ CREATE NEW VAULT'; btn.disabled = false; }
    const pwEl = document.getElementById('vault-recovery-pw');
    const cfEl = document.getElementById('vault-recovery-pw-confirm');
    if (pwEl) pwEl.value = '';
    if (cfEl) cfEl.value = '';
  }
}

// Creates a NEW vault at v6 and proves it opens before saying so.
//
// The previous version was a vault-destroying bug. It derived a key from a
// freshly minted random salt and then wrote a **v5** envelope — and v5 has no
// salt field. v0.1.4 had removed the localStorage write that used to carry
// that salt, so the only copy of it vanished the moment the function
// returned. The file was unopenable with the correct password, permanently,
// from the instant it was written. Reported from a real run on 2026-08-12.
//
// Nothing here hand-rolls an envelope any more: vaultCreateNew() puts the
// salt and iteration count in the cleartext header, writes atomically, then
// reads the file back and decrypts it before reporting success.
async function _vaultRecreateWithKey(password, username) {
  if (!password) throw new Error('a password is required to create a vault');
  if (!window.NXAPI) throw new Error('desktop app required — a vault file cannot be created in a browser');

  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) throw new Error('no data folder set — choose a folder first');
  const vaultPath = dataDir + '/mastermind.vault';

  // A fresh keypair. The old private key was wrapped with a key that no
  // longer exists, so carrying it forward would preserve an unopenable blob.
  const kp = await crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
    true, ['encrypt','decrypt']
  );
  const pubRaw  = await crypto.subtle.exportKey('spki', kp.publicKey);
  const privRaw = await crypto.subtle.exportKey('pkcs8', kp.privateKey);

  const identity = {
    username,
    pinHash: null,
    created: Date.now(),
    version: 6,
  };

  const initialState = {
    version: 6, format: 'mastermind-vault', saved: Date.now(),
    canvas: { nodes: [], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 }, clipboard: [] },
    modules: {
      void: null, gaps: null, signal: null, threads: null,
      options: typeof OPTS !== 'undefined' ? OPTS : {},
      features: (typeof AUTH !== 'undefined' && AUTH.features) || {},
    },
    identity,
    keys: { pubKey: VaultCrypto.toBase64(new Uint8Array(pubRaw)), encPrivKey: null },
    username,
    jaa: {},
  };

  // Derives the key, mints salt + vaultId, seals, writes, then REOPENS and
  // decrypts before returning. Throws if any of that fails.
  const created = await vaultCreateNew(password, initialState, { dataDir, vaultPath });

  // The private key is wrapped with the session key, which only exists after
  // vaultCreateNew has derived it. Second save, same file.
  _authStoreSet(identity, {
    pubKey: initialState.keys.pubKey,
    encPrivKey: await _aesEncrypt(AUTH.key, new Uint8Array(privRaw)),
  });
  AUTH.username = username;
  VAULT.dirty = true;
  await vaultSave(false);
  if (VAULT.dirty) throw new Error('vault was created but the keypair save did not land');

  NX_CONFIG.vaultPath = vaultPath;
  MMLog?.info('vault', 'Vault recreated at v6: ' + vaultPath + ' · ' + created.bytes + ' bytes');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.recreated', { path: vaultPath, vaultId: created.vaultId });
  mm_toast('✓ New vault created and verified — sign in with this password', 'success', { dur: 6000 });

  setTimeout(() => { if (typeof startupRoute === 'function') startupRoute(); }, 900);
  return created;
}

// Called by _vaultRecreate()'s unencrypted branch — the vault that was lost
// had no password, so there is nothing to re-derive a key from. This just
// creates a fresh, empty, unencrypted v6 vault, verified the same way the
// encrypted path is: written, reopened, reparsed before declaring success.
async function _vaultRecreateUnencrypted() {
  if (!window.NXAPI) throw new Error('desktop app required — a vault file cannot be created in a browser');

  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (!dataDir) throw new Error('no data folder set — choose a folder first');
  const vaultPath = dataDir + '/mastermind.vault';

  const username = document.getElementById('vault-recovery-username')?.value
    || _authLoadMeta()?.username || (typeof AUTH !== 'undefined' && AUTH.username) || 'operator';

  const initialState = {
    version: 6, format: 'mastermind-vault-plain', saved: Date.now(),
    canvas: { nodes: [], conns: [], viewport: { zoom: 1, panX: 0, panY: 0 }, clipboard: [] },
    modules: {
      void: null, gaps: null, signal: null, threads: null,
      body: null, horizon: null, brainMap: null, domain: null,
      almDeltas: [], intuitionRatings: {},
      options: typeof OPTS !== 'undefined' ? OPTS : {},
      features: (typeof AUTH !== 'undefined' && AUTH.features) || {},
    },
    aiConfig: null, snr: null,
    identity: { username, pinHash: null, created: Date.now(), version: 6, noEncryption: true },
    keys: { pubKey: null, encPrivKey: null },
    username,
    jaa: {},
  };

  await vaultCreateNewUnencrypted(initialState, { dataDir, vaultPath });

  NX_CONFIG.vaultPath = vaultPath;
  if (typeof _persistIdentityMarker === 'function') _persistIdentityMarker({ username, noEncryption: true });
  MMLog?.info('vault', 'Unencrypted vault recreated at: ' + vaultPath);
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.recreated', { path: vaultPath });
  mm_toast('✓ New unencrypted vault created', 'success', { dur: 5000 });

  setTimeout(() => { if (typeof startupRoute === 'function') startupRoute(); }, 900);
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

// The app has been taking automatic point-in-time snapshots all along
// (VaultSnapshots, foundation/vault/vault-snapshots.js — created on boot,
// pruned on a retention policy) but nothing in the UI ever listed or
// offered to restore one. "RESTORE FROM BACKUP FILE" above is a manual
// file pick; this checks the automatic ones first, since they're more
// likely to actually exist and be recent.
async function _vaultCheckSnapshots(vaultPath) {
  const existingForm = document.getElementById('vault-recovery-form');
  if (existingForm) existingForm.remove();
  const statusEl = document.getElementById('vault-missing-status');

  if (!window.NXAPI?.snapshotList) {
    if (statusEl) statusEl.textContent = 'Snapshots only available in the desktop app';
    return;
  }
  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (statusEl) statusEl.textContent = 'Checking for snapshots…';

  let res;
  try { res = await window.NXAPI.snapshotList(dataDir, vaultPath); }
  catch (e) { res = { ok: false, error: e.message }; }

  if (statusEl) statusEl.textContent = '';
  const snaps = (res?.ok && Array.isArray(res.snapshots)) ? res.snapshots.filter(s => !s.malformed) : [];

  if (snaps.length) _vaultShowSnapshotList(snaps, vaultPath);
  else _vaultShowNoSnapshotChoice();
}

function _vaultShowSnapshotList(snaps, vaultPath) {
  const form = document.createElement('div');
  form.id = 'vault-recovery-form';
  form.style.cssText = 'margin-top:16px;padding:16px;border:1px solid rgba(119,68,255,.25);background:rgba(0,10,20,.6);width:100%;max-width:420px;text-align:left';
  form.innerHTML = `
    <div style="font-family:var(--f-mono);font-size:8px;color:#7744ff;letter-spacing:1.5px;margin-bottom:10px">
      ${snaps.length} SNAPSHOT${snaps.length === 1 ? '' : 'S'} FOUND — MOST RECENT FIRST
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;max-height:220px;overflow-y:auto;margin-bottom:8px">
      ${snaps.slice(0, 20).map(s => `
        <button onclick="_vaultRestoreSnapshot('${escH(s.name)}','${escH(vaultPath || '')}')" style="
          text-align:left;padding:8px 10px;border:1px solid var(--wire2);background:rgba(255,255,255,.02);
          color:var(--muted);cursor:pointer;font-family:var(--f-mono);font-size:7.5px"
          onmouseenter="this.style.borderColor='#7744ff';this.style.color='var(--bright)'"
          onmouseleave="this.style.borderColor='var(--wire2)';this.style.color='var(--muted)'">
          ${new Date(s.ts).toLocaleString()} &middot; save #${s.saveCount} &middot; ${escH(s.hash12 || '')}
        </button>`).join('')}
    </div>
    <div id="vault-snapshot-error" style="color:var(--r);font-family:var(--f-mono);font-size:7px;min-height:14px"></div>
  `;
  document.getElementById('ss-vault-missing')?.appendChild(form);
}

async function _vaultRestoreSnapshot(name, vaultPath) {
  const errEl = document.getElementById('vault-snapshot-error');
  const statusEl = document.getElementById('vault-missing-status');
  const dataDir = NX_CONFIG.dataDir || _lsGet('nexus_datadir');
  if (errEl) errEl.textContent = '';
  if (statusEl) statusEl.textContent = 'Restoring snapshot…';
  let res;
  try { res = await window.NXAPI.snapshotRestore(dataDir, vaultPath, name); }
  catch (e) { res = { ok: false, error: e.message }; }
  if (res?.ok) {
    NX_CONFIG.vaultPath = vaultPath;
    if (statusEl) statusEl.textContent = '✓ Snapshot restored — restarting…';
    setTimeout(() => { if (typeof startupRoute === 'function') startupRoute(); }, 800);
  } else {
    if (statusEl) statusEl.textContent = '';
    if (errEl) errEl.textContent = '⚡ Restore failed: ' + (res?.error || res?.message || 'unknown error');
  }
}

// No automatic snapshot exists. Rather than a dead end, offer the three
// real options: point at a vault that already exists somewhere (import),
// use the default location (creating fresh there if nothing's found), or
// go straight to identity creation.
function _vaultShowNoSnapshotChoice() {
  const form = document.createElement('div');
  form.id = 'vault-recovery-form';
  form.style.cssText = 'margin-top:16px;padding:16px;border:1px solid rgba(0,200,255,.2);background:rgba(0,10,20,.6);width:100%;max-width:420px;text-align:left';
  form.innerHTML = `
    <div style="font-family:var(--f-mono);font-size:8px;color:var(--c);letter-spacing:1.5px;margin-bottom:10px">
      NO SNAPSHOTS FOUND
    </div>
    <div style="font-family:var(--f-mono);font-size:7px;color:var(--dim);margin-bottom:12px;line-height:1.8">
      There's nothing to restore automatically. Point at a vault that already exists, or start over.
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button onclick="_ssShow('ss-import')" style="
        padding:9px;border:1px solid var(--c);background:transparent;color:var(--c);
        cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
        \u2b07 IMPORT A VAULT
      </button>
      <button onclick="_vaultUseDefaultLocation()" style="
        padding:9px;border:1px solid var(--wire2);background:transparent;color:var(--muted);
        cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
        \u2317 USE DEFAULT LOCATION (~/Documents/MASTERMIND)
      </button>
      <button onclick="_ssShow('ss-setup',1)" style="
        padding:9px;border:1px solid rgba(255,255,255,.08);background:transparent;color:var(--dim);
        cursor:pointer;font-family:var(--f-mono);font-size:8px;letter-spacing:1px">
        \u25c8 CREATE A NEW IDENTITY
      </button>
    </div>
  `;
  document.getElementById('ss-vault-missing')?.appendChild(form);
}

// Points the app at ~/Documents/MASTERMIND (the same default
// setupCreateVault() falls back to). If a vault is already there, route
// to login for it. If not, go straight to identity creation rather than
// leaving an empty directory selected with no next step.
async function _vaultUseDefaultLocation() {
  const statusEl = document.getElementById('vault-missing-status');
  if (!window.NXAPI) { if (statusEl) statusEl.textContent = 'Desktop app required'; return; }
  if (statusEl) statusEl.textContent = 'Checking default location…';
  const dir = await window.NXAPI.defaultFolder();
  const vaultPath = dir + '/mastermind.vault';
  const exists = await window.NXAPI.vaultExists(vaultPath);

  await window.NXAPI.setDataDir(dir);
  NX_CONFIG.dataDir = dir;
  _lsSet('nexus_datadir', dir);

  if (exists) {
    if (statusEl) statusEl.textContent = 'Vault found at the default location — unlocking…';
    setTimeout(() => { if (typeof startupRoute === 'function') startupRoute(); }, 600);
  } else {
    if (statusEl) statusEl.textContent = 'Nothing there yet — let\u2019s create an identity.';
    setTimeout(() => { if (typeof _ssShow === 'function') _ssShow('ss-setup', 1); }, 600);
  }
}



// ── Module ready signal ──────────────────────────────────────────────
(function() {
  // §5.4 — one version number, one source. Read from the manifest at boot
  // (window.MM_VERSION is set in index-browser.html from NXAPI.version,
  // which preload reads out of package.json — synchronously, so it is
  // already correct when this line runs).
  // A hardcoded string here is how three-way drift starts.
  const ver = 'mastermind-vault v' + (window.MM_VERSION || 'unknown');
  if (typeof MM_BUS !== 'undefined') {
    MM_BUS.emit('mm.module.ready', {
      module: 'mastermind-vault',
      version: window.MM_VERSION || 'unknown',
      uuid: '4a3b2c1d-vault-4000-8000-vault000001',
    });
  }
  const msg = '[MASTERMIND VAULT] ' + ver + ' loaded — AES-256-GCM · PBKDF2-SHA256 (header-driven) · fsync + AAD-bound header';
  if (typeof MMLog !== 'undefined') MMLog.info('vault', msg);
  else console.log(msg);
})();
