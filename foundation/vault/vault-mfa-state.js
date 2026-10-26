// ═══════════════════════════════════════════════════════════════════
// MFA STATE — foundation/vault/vault-mfa-state.js
//
// The stateful half of MFA: MFA_STATE (what's enrolled), enrollment
// flows for TOTP / backup codes / security keys, and the login-time
// verification functions loginSubmit() calls after the password gate
// passes. All the actual cryptography is in vault-mfa.js (MfaCrypto) —
// this file is orchestration and storage, on purpose, so the math stays
// testable in isolation from AUTH, the vault, and the DOM.
//
// ─────────────────────────────────────────────────────────────────
// WHERE MFA_STATE LIVES
//
// Inside the vault, not localStorage. mastermind-vault.js's
// vaultSerialize()/vaultDeserialize() carry it as data.security.mfa —
// same encryption as everything else in the vault, same reasoning as
// P1's provenance requirement: a second factor is only as strong as
// wherever its secret sits, and localStorage is plaintext on disk.
//
// The one field that must NOT round-trip through the vault is
// _pendingEnroll — a TOTP secret mid-setup, before the person has
// proven they can generate a code from it. Stripped in
// mfaSerializeForVault() below; never assigned back in hydrate.
//
// ─────────────────────────────────────────────────────────────────
// LOGIN ORDERING — this is the part that matters
//
// A second factor is worthless if it's checked AFTER the thing it's
// meant to gate. loginSubmit() derives the vault key, decrypts the
// vault, and ONLY THEN — because MFA_STATE.totp / .webauthn only exist
// once the vault is open — knows whether a second factor is even
// enrolled. So the sealed session (_sealSession(), which is what
// actually reveals the homepage) must not fire until mfaVerifyLogin()
// has returned ok. That call belongs in nexus-engine.js's loginSubmit,
// right where _sealSession used to be called unconditionally.
//
// ─────────────────────────────────────────────────────────────────
// WEBAUTHN CAPABILITY CHECK
//
// navigator.credentials needs a real origin — main.js now serves the
// app over http://localhost (via a loopback-only static server with a
// per-launch random token in the path) specifically so this works.
// mfaWebauthnCapability() still checks at runtime and reports plainly
// if something's wrong rather than letting a "Register a security
// key" button fail with an opaque browser error — same instinct as
// the microphone check in vlOrbStart().
//
// UUID: 4a3b2c1d-vault-6000-8000-mfastate001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const MFA_STATE = {
  totp: {
    enabled: false,
    secretB32: null,
    confirmedAt: null,
    lastCounter: null,   // last TOTP step consumed — replay guard across logins
  },
  webauthn: {
    credentials: [],     // { id, publicKeyJwk, alg, name, addedAt, lastUsedAt, signCount }
  },
  backupCodes: {
    entries: [],          // { hash, used, usedAt }
    generatedAt: null,
  },
  // Transient — a secret generated but not yet confirmed with a code.
  // Never persisted; see mfaSerializeForVault().
  _pendingEnroll: null,
};

function mfaIsEnrolled() {
  return !!(MFA_STATE.totp.enabled || (MFA_STATE.webauthn.credentials || []).length);
}

// What loginSubmit() needs to know: is there a second factor to check
// at all, and if so, which methods can satisfy it.
function mfaLoginMethods() {
  const methods = [];
  if (MFA_STATE.totp.enabled) methods.push('totp');
  if ((MFA_STATE.webauthn.credentials || []).length) methods.push('webauthn');
  if ((MFA_STATE.backupCodes.entries || []).some((e) => !e.used)) methods.push('backup');
  return methods;
}

// ── Vault wiring ────────────────────────────────────────────────────
// Called from mastermind-vault.js's vaultSerialize()/vaultDeserialize().
// Kept as explicit functions rather than reading MFA_STATE directly in
// the vault file, so this file stays the one place that decides what
// of MFA_STATE is durable.

function mfaSerializeForVault() {
  return {
    totp: {
      enabled: MFA_STATE.totp.enabled,
      secretB32: MFA_STATE.totp.secretB32,
      confirmedAt: MFA_STATE.totp.confirmedAt,
      lastCounter: MFA_STATE.totp.lastCounter,
    },
    webauthn: { credentials: MFA_STATE.webauthn.credentials || [] },
    backupCodes: {
      entries: MFA_STATE.backupCodes.entries || [],
      generatedAt: MFA_STATE.backupCodes.generatedAt,
    },
  };
}

function mfaHydrateFromVault(saved) {
  if (!saved) return;
  if (saved.totp) Object.assign(MFA_STATE.totp, saved.totp);
  if (saved.webauthn && Array.isArray(saved.webauthn.credentials)) {
    MFA_STATE.webauthn.credentials = saved.webauthn.credentials;
  }
  if (saved.backupCodes) {
    MFA_STATE.backupCodes.entries = Array.isArray(saved.backupCodes.entries) ? saved.backupCodes.entries : [];
    MFA_STATE.backupCodes.generatedAt = saved.backupCodes.generatedAt || null;
  }
  // _pendingEnroll is deliberately not restored — an interrupted setup
  // is abandoned, not resumed with a stale secret.
}

function _mfaPersist() {
  if (typeof vaultDirtySave === 'function') vaultDirtySave(2000);
}

// ── TOTP enrollment ──────────────────────────────────────────────────

function mfaTotpBeginEnroll() {
  const secretB32 = MfaCrypto.randomTotpSecret();
  MFA_STATE._pendingEnroll = { secretB32, startedAt: Date.now() };
  const uri = MfaCrypto.totpUri(secretB32, {
    issuer: 'MASTERMIND',
    account: (typeof AUTH !== 'undefined' && AUTH.username) || 'operator',
  });
  return { secretB32, uri };
}

async function mfaTotpConfirmEnroll(code) {
  const pending = MFA_STATE._pendingEnroll;
  if (!pending) return { ok: false, error: 'No TOTP setup in progress — start enrollment again.' };
  const v = await MfaCrypto.totpVerify(code, pending.secretB32);
  if (!v.ok) return { ok: false, error: 'That code didn\u2019t match. Check your app\u2019s clock and try the current code.' };
  MFA_STATE.totp = {
    enabled: true,
    secretB32: pending.secretB32,
    confirmedAt: Date.now(),
    lastCounter: v.counter,
  };
  MFA_STATE._pendingEnroll = null;
  _mfaPersist();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.mfa.totp.enabled', {});
  return { ok: true };
}

function mfaTotpCancelEnroll() {
  MFA_STATE._pendingEnroll = null;
}

function mfaTotpDisable() {
  MFA_STATE.totp = { enabled: false, secretB32: null, confirmedAt: null, lastCounter: null };
  _mfaPersist();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.mfa.totp.disabled', {});
  return { ok: true };
}

// ── Backup codes ──────────────────────────────────────────────────────
// Returns the plaintext codes — the ONLY moment they exist outside the
// person's own record of them. The caller (UI) must show/let-download
// them once and must not log or persist the plaintext anywhere.

async function mfaBackupCodesGenerate() {
  const codes = MfaCrypto.generateBackupCodes(10);
  const entries = [];
  for (const c of codes) entries.push({ hash: await MfaCrypto.hashBackupCode(c), used: false, usedAt: null });
  MFA_STATE.backupCodes = { entries, generatedAt: Date.now() };
  _mfaPersist();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.mfa.backupcodes.generated', { count: codes.length });
  return codes;
}

function mfaBackupCodesRemaining() {
  return (MFA_STATE.backupCodes.entries || []).filter((e) => !e.used).length;
}

// ── WebAuthn / FIDO2 ──────────────────────────────────────────────────

function mfaWebauthnCapability() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'No browser environment.' };
  }
  if (!window.PublicKeyCredential || !navigator.credentials) {
    return { supported: false, reason: 'WebAuthn is not available in this build of the app.' };
  }
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    return {
      supported: false,
      reason: 'Security keys need the app to run on a local server (http://localhost), not opened as a file. This build should already be doing that — if you\u2019re seeing this, main.js\u2019s local server failed to start; check the app log.',
    };
  }
  return { supported: true, reason: null };
}

function _mfaRpId() {
  try { return (typeof location !== 'undefined' && location.hostname) || 'localhost'; } catch (e) { return 'localhost'; }
}

async function mfaWebauthnRegister(label) {
  const cap = mfaWebauthnCapability();
  if (!cap.supported) return { ok: false, error: cap.reason };

  const username = (typeof AUTH !== 'undefined' && AUTH.username) || 'operator';
  const excludeIds = (MFA_STATE.webauthn.credentials || []).map((c) => c.id);
  const options = MfaCrypto.buildCreationOptions({
    rpId: _mfaRpId(), rpName: 'MASTERMIND',
    userId: username, userName: username, userDisplayName: username,
    excludeCredentialIds: excludeIds,
  });

  let cred;
  try {
    cred = await navigator.credentials.create(options);
  } catch (e) {
    return { ok: false, error: e.name === 'NotAllowedError' ? 'Cancelled or timed out.' : e.message };
  }
  if (!cred) return { ok: false, error: 'No credential returned.' };

  const attestationBytes = new Uint8Array(cred.response.attestationObject);
  let parsed;
  try {
    parsed = MfaCrypto.parseAttestationObject(attestationBytes);
  } catch (e) {
    return { ok: false, error: 'Could not read the key\u2019s response: ' + e.message };
  }

  MFA_STATE.webauthn.credentials.push({
    id: parsed.credentialId,
    publicKeyJwk: parsed.publicKeyJwk,
    alg: parsed.alg,
    name: label || ('Security key ' + (MFA_STATE.webauthn.credentials.length + 1)),
    addedAt: Date.now(),
    lastUsedAt: null,
    signCount: parsed.signCount,
  });
  _mfaPersist();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.mfa.webauthn.registered', { name: label });
  return { ok: true, credentialId: parsed.credentialId };
}

function mfaWebauthnRemove(credentialId) {
  const before = MFA_STATE.webauthn.credentials.length;
  MFA_STATE.webauthn.credentials = MFA_STATE.webauthn.credentials.filter((c) => c.id !== credentialId);
  if (MFA_STATE.webauthn.credentials.length !== before) {
    _mfaPersist();
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.mfa.webauthn.removed', { credentialId });
  }
  return { ok: true };
}

async function _mfaWebauthnAssert() {
  const cap = mfaWebauthnCapability();
  if (!cap.supported) return { ok: false, error: cap.reason };

  const allowIds = (MFA_STATE.webauthn.credentials || []).map((c) => c.id);
  const options = MfaCrypto.buildRequestOptions({ rpId: _mfaRpId(), allowCredentialIds: allowIds });

  let assertion;
  try {
    assertion = await navigator.credentials.get(options);
  } catch (e) {
    return { ok: false, error: e.name === 'NotAllowedError' ? 'Cancelled or timed out.' : e.message };
  }
  if (!assertion) return { ok: false, error: 'No response from the key.' };

  const credB64Url = MfaCrypto.b64urlEncode(new Uint8Array(assertion.rawId));
  const entry = MFA_STATE.webauthn.credentials.find((c) => c.id === credB64Url);
  if (!entry) return { ok: false, error: 'That key isn\u2019t registered on this vault.' };

  const authData = new Uint8Array(assertion.response.authenticatorData);
  const clientData = new Uint8Array(assertion.response.clientDataJSON);
  const sig = new Uint8Array(assertion.response.signature);

  let verified = false;
  try {
    verified = await MfaCrypto.verifyAssertionSignature(entry, authData, clientData, sig);
  } catch (e) {
    return { ok: false, error: 'Signature check failed: ' + e.message };
  }
  if (!verified) return { ok: false, error: 'Signature did not verify against the registered key.' };

  entry.lastUsedAt = Date.now();
  _mfaPersist();
  return { ok: true, credentialId: credB64Url };
}

// ── Login-time verification — the single entry point loginSubmit() calls ──

async function mfaVerifyLogin(method, code) {
  if (method === 'totp') {
    const v = await MfaCrypto.totpVerify(code, MFA_STATE.totp.secretB32, {}, Date.now(), MFA_STATE.totp.lastCounter);
    if (!v.ok) return { ok: false, error: 'Incorrect or reused code.' };
    MFA_STATE.totp.lastCounter = v.counter;
    _mfaPersist();
    return { ok: true };
  }
  if (method === 'backup') {
    const v = await MfaCrypto.verifyBackupCode(code, MFA_STATE.backupCodes.entries);
    if (!v.ok) return { ok: false, error: 'That backup code is wrong or already used.' };
    _mfaPersist();
    return { ok: true, remaining: v.remaining };
  }
  if (method === 'webauthn') {
    return _mfaWebauthnAssert();
  }
  return { ok: false, error: 'Unknown verification method.' };
}

if (typeof window !== 'undefined') {
  window.MFA_STATE = MFA_STATE;
  window.mfaIsEnrolled = mfaIsEnrolled;
  window.mfaLoginMethods = mfaLoginMethods;
  window.mfaSerializeForVault = mfaSerializeForVault;
  window.mfaHydrateFromVault = mfaHydrateFromVault;
  window.mfaTotpBeginEnroll = mfaTotpBeginEnroll;
  window.mfaTotpConfirmEnroll = mfaTotpConfirmEnroll;
  window.mfaTotpCancelEnroll = mfaTotpCancelEnroll;
  window.mfaTotpDisable = mfaTotpDisable;
  window.mfaBackupCodesGenerate = mfaBackupCodesGenerate;
  window.mfaBackupCodesRemaining = mfaBackupCodesRemaining;
  window.mfaWebauthnCapability = mfaWebauthnCapability;
  window.mfaWebauthnRegister = mfaWebauthnRegister;
  window.mfaWebauthnRemove = mfaWebauthnRemove;
  window.mfaVerifyLogin = mfaVerifyLogin;
}

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'vault-mfa-state',
    uuid: '4a3b2c1d-vault-6000-8000-mfastate001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
  });
}
