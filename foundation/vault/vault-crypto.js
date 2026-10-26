// ═══════════════════════════════════════════════════════════════════
// MASTERMIND VAULT CRYPTO
// foundation/vault/vault-crypto.js
//
// WebCrypto only. Runs identically in the Electron renderer and in
// Node 18+ (globalThis.crypto.subtle), so the test suite exercises the
// exact code the app runs — not a re-implementation of it.
//
// ─────────────────────────────────────────────────────────────────
// KDF: PBKDF2-SHA256, iteration count read from the vault header.
//
// The count lives in the file, never in this module, because a vault
// written at 310k must stay openable after the default moves to 1M.
// deriveKey() takes whatever the header says; upgrades happen at save
// time by writing a new salt at the new count. Iterations are NOT a
// rate limit and MUST NOT vary per attempt — a different count is a
// different key, and escalating one would lock the owner out on the
// second try while costing an offline attacker nothing.
//
// The honest limit: PBKDF2-SHA256 is compute-hard, not memory-hard.
// Raising iterations raises your unlock time and the attacker's cost
// at the same rate, against hardware that is orders of magnitude
// faster than yours. 1M is a real improvement over 310k. It is not
// parity with a memory-hard KDF, and this comment exists so nobody
// later mistakes the number for a guarantee.
//
// ─────────────────────────────────────────────────────────────────
// CIPHER: AES-256-GCM with the vault header as AAD.
//
// The 16-byte GCM tag is the integrity check, and it is keyed — an
// attacker who flips a byte cannot forge it, unlike a bare SHA-256
// which they can simply recompute. The separate ciphertextSha256 in
// the header exists for one narrow purpose: distinguishing a corrupt
// file from a wrong password before any key exists.
//
// ─────────────────────────────────────────────────────────────────
// BASE64: chunked, deliberately.
//
// The v5 code used String.fromCharCode(...new Uint8Array(buf)), which
// spreads every byte as a function argument. That throws RangeError
// (call stack exceeded) somewhere around 100-125KB depending on the
// engine — invisible while a vault is small, fatal the first time
// someone's notes get real. Fixed here with 32KB chunks.
//
// UUID: 4a3b2c1d-vault-6000-8000-crypto00001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.VaultCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const SUBTLE = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto.subtle : null;
  const RANDOM = (typeof globalThis !== 'undefined' && globalThis.crypto)
    ? globalThis.crypto : null;

  const B64_CHUNK = 0x8000; // 32768 bytes per chunk

  function requireSubtle() {
    if (!SUBTLE) {
      throw new Error('WebCrypto unavailable — vault cannot operate. Check Electron contextIsolation/secure context.');
    }
    return SUBTLE;
  }

  // ── Encoding ──────────────────────────────────────────────────────

  function toBase64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < u8.length; i += B64_CHUNK) {
      binary += String.fromCharCode.apply(null, u8.subarray(i, i + B64_CHUNK));
    }
    if (typeof btoa === 'function') return btoa(binary);
    return Buffer.from(u8).toString('base64');
  }

  function fromBase64(b64) {
    if (typeof atob === 'function') {
      const binary = atob(b64);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }

  function toHex(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let out = '';
    for (let i = 0; i < u8.length; i++) out += u8[i].toString(16).padStart(2, '0');
    return out;
  }

  function utf8Encode(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }

  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }

  // ── Randomness ────────────────────────────────────────────────────

  function randomBytes(n) {
    if (!RANDOM) throw new Error('No CSPRNG available — refusing to generate key material.');
    return RANDOM.getRandomValues(new Uint8Array(n));
  }

  function randomSaltB64(bytes) { return toBase64(randomBytes(bytes || 32)); }
  function randomIvB64(bytes)   { return toBase64(randomBytes(bytes || 12)); }

  function uuidV4() {
    if (RANDOM && typeof RANDOM.randomUUID === 'function') return RANDOM.randomUUID();
    const b = randomBytes(16);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = toHex(b);
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ── Hash ──────────────────────────────────────────────────────────

  async function sha256Hex(bytes) {
    const buf = await requireSubtle().digest('SHA-256', bytes);
    return toHex(new Uint8Array(buf));
  }

  // Constant-time-ish comparison. These are public hashes, not secrets,
  // so this is hygiene rather than a hard requirement — but a hash
  // comparison that leaks position via early return is a habit worth
  // not forming.
  function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ── Key derivation ────────────────────────────────────────────────

  async function deriveKey(password, saltB64, iterations, keyLen) {
    if (typeof password !== 'string' || password === '') {
      throw new Error('deriveKey: password is required');
    }
    if (!Number.isInteger(iterations) || iterations <= 0) {
      throw new Error('deriveKey: iterations must be a positive integer');
    }
    const subtle = requireSubtle();
    const salt = fromBase64(saltB64);
    const material = await subtle.importKey('raw', utf8Encode(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: (keyLen || 32) * 8 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Measures this machine, on this build, right now. Used by the
  // Security panel so the iteration count is chosen against a real
  // measurement instead of a number someone liked the look of.
  async function calibrateIterations(targetMs, probeIterations) {
    const probe = probeIterations || 100000;
    const salt = randomSaltB64(32);
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    await deriveKey('calibration-probe-not-a-secret', salt, probe, 32);
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const elapsed = Math.max(t1 - t0, 0.0001);
    const perMs = probe / elapsed;
    const suggested = Math.round((perMs * (targetMs || 1000)) / 10000) * 10000;
    return {
      probeIterations: probe,
      probeMs: Math.round(elapsed),
      iterationsPerMs: Math.round(perMs),
      suggested: Math.max(suggested, 310000),
      targetMs: targetMs || 1000,
    };
  }

  // ── AEAD ──────────────────────────────────────────────────────────

  async function encrypt(key, plaintextBytes, ivB64, aadBytes) {
    const subtle = requireSubtle();
    const params = { name: 'AES-GCM', iv: fromBase64(ivB64), tagLength: 128 };
    if (aadBytes) params.additionalData = aadBytes;
    const buf = await subtle.encrypt(params, key, plaintextBytes);
    return new Uint8Array(buf);
  }

  async function decrypt(key, ciphertextBytes, ivB64, aadBytes) {
    const subtle = requireSubtle();
    const params = { name: 'AES-GCM', iv: fromBase64(ivB64), tagLength: 128 };
    if (aadBytes) params.additionalData = aadBytes;
    const buf = await subtle.decrypt(params, key, ciphertextBytes);
    return new Uint8Array(buf);
  }

  return {
    toBase64, fromBase64, toHex, utf8Encode, utf8Decode,
    randomBytes, randomSaltB64, randomIvB64, uuidV4,
    sha256Hex, timingSafeEqualHex,
    deriveKey, calibrateIterations,
    encrypt, decrypt,
  };
});

// §5.1 — registered component, not an orphan. Announces itself on the bus
// so the registry can see it; no orphan modules or hooks are allowed.
(function () {
  if (typeof MM_BUS === 'undefined' || typeof MM_BUS.emit !== 'function') return;
  MM_BUS.emit('mm.module.ready', {
    module:  'vault-crypto',
    uuid:    '4a3b2c1d-vault-6000-8000-crypto00001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
    pure:    true,
  });
})();
