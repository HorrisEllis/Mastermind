// ═══════════════════════════════════════════════════════════════════
// MASTERMIND VAULT ENVELOPE — v6
// foundation/vault/vault-envelope.js
//
// PURE. No I/O, no crypto, no globals. Every function here is a SISO
// gate: same input → same output, no side effects. This is the layer
// that decides what a vault file *is*, so it must be testable without
// a filesystem, without Electron, and without a password.
//
// ─────────────────────────────────────────────────────────────────
// WHY v6 EXISTS
//
// v5 stored the PBKDF2 salt in localStorage, not in the file. That
// made the vault file unopenable on any machine that had not run
// setup — correct password, right file, no way to derive the key.
// v6 moves salt + KDF parameters into the cleartext header. A salt
// is not a secret; it exists to defeat precomputation. Publishing it
// costs nothing and buys portability.
//
// ─────────────────────────────────────────────────────────────────
// FILE FORMAT
//
// {
//   format:  "mastermind-vault",
//   version: 6,
//   vaultId: "<uuid v4>",          identity of this vault lineage
//   cipher:  "AES-256-GCM",
//   kdf: {
//     algo:       "PBKDF2-SHA256",
//     iterations: 1000000,          tunable, read from the file
//     salt:       "<base64, 32B>",
//     keyLen:     32
//   },
//   iv:           "<base64, 12B>",
//   savedAt:      "<ISO 8601>",     authenticated — see AAD below
//   saveCount:    <int>,            monotonic, authenticated
//   ledgerAnchor: { seq, head } | null,
//   ciphertextSha256: "<hex>",
//   data:         "<base64 ciphertext + GCM tag>"
// }
//
// ─────────────────────────────────────────────────────────────────
// THE AAD RULE — the part that makes the metadata mean anything
//
// Every field EXCEPT `data` and `ciphertextSha256` is fed to AES-GCM
// as Additional Authenticated Data. It is not encrypted (you can read
// it without a password, by design) but it IS authenticated: change
// one character of savedAt, saveCount, vaultId, the KDF parameters or
// the anchor, and decryption fails outright.
//
// Without this, savedAt is a number in a text file that anyone can
// retype and "last modified" is a claim, not a fact. With it, the
// timestamp is exactly as trustworthy as the data it describes.
//
// `data` is excluded because it IS the ciphertext. `ciphertextSha256`
// is excluded because it is computed FROM the ciphertext — including
// it would be circular. It is not an authenticity check (an attacker
// can recompute it); its one job is to tell "this file is corrupt or
// truncated" apart from "wrong password" BEFORE a key exists.
//
// ─────────────────────────────────────────────────────────────────
// CANONICALIZATION
//
// AAD must be byte-identical at encrypt time and decrypt time or
// every unlock fails. JSON.stringify does not guarantee key order
// across engines or across object construction paths, so we sort
// recursively and emit with no whitespace. This is the single most
// load-bearing function in the file.
//
// UUID: 4a3b2c1d-vault-6000-8000-envelope0001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.VaultEnvelope = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const FORMAT  = 'mastermind-vault';
  const VERSION = 6;
  const CIPHER  = 'AES-256-GCM';

  // The explicit "opt out of encryption" file. Four places in the app WRITE
  // this shape (vaultCreateNewUnencrypted, vaultSaveUnencrypted and their two
  // callers) and until now nothing anywhere READ it: parse() saw version 6,
  // skipped the v5 legacy branch, fell into validate() and rejected it as
  // BAD_FORMAT — "Not a MASTERMIND vault file." A format the app writes and
  // then refuses to open is a permanent lockout on a file that is, ironically,
  // plain readable JSON sitting right there. It gets a verdict of its own.
  const FORMAT_PLAIN = 'mastermind-vault-plain';

  const KDF_ALGO   = 'PBKDF2-SHA256';
  const SALT_BYTES = 32;
  const IV_BYTES   = 12;
  const KEY_LEN    = 32;

  // Floor is not a style preference. Below this the KDF stops being a
  // meaningful cost to an offline attacker, so we refuse to write it.
  const MIN_ITERATIONS     = 310000;
  const DEFAULT_ITERATIONS = 1000000;

  const ZERO_HEAD = '0'.repeat(64);

  // ── Archive signature sniffing ─────────────────────────────────────
  // A vault file is JSON, always. If the bytes at this path are actually
  // a compressed archive — someone pointed the data folder at a backup
  // .zip, an old export got renamed to mastermind.vault, a sync client
  // resolved a conflict by dropping an archive in place — reading it as
  // UTF-8 text and handing the result to JSON.parse produces "not valid
  // JSON — it is corrupt", which is TRUE but misleading: it tells the
  // person their vault is damaged when the real problem is that this
  // was never a vault file to begin with. Those need different remedies
  // (point at the right file vs. restore from a snapshot), so they get
  // different verdicts.
  //
  // Signatures are checked on the raw byte prefix, not the decoded
  // string — UTF-8 decoding a binary file can itself alter or drop
  // bytes (invalid sequences become U+FFFD), so detection must happen
  // before that decode, not after it.
  const ARCHIVE_SIGNATURES = [
    { kind: 'zip',    bytes: [0x50, 0x4B, 0x03, 0x04] },
    { kind: 'zip',    bytes: [0x50, 0x4B, 0x05, 0x06] }, // empty archive
    { kind: 'zip',    bytes: [0x50, 0x4B, 0x07, 0x08] }, // spanned archive
    { kind: 'gzip',   bytes: [0x1F, 0x8B] },
    { kind: '7z',     bytes: [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] },
    { kind: 'rar',    bytes: [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07] },
    { kind: 'bzip2',  bytes: [0x42, 0x5A, 0x68] },
    { kind: 'xz',     bytes: [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00] },
    { kind: 'tar',    bytes: [0x75, 0x73, 0x74, 0x61, 0x72], offset: 257 }, // "ustar"
  ];

  // Accepts a Buffer, Uint8Array, or plain array of byte values (the
  // prefix of a file is enough — callers should not need to read the
  // whole thing to ask this question). Returns the archive kind as a
  // string, or null if nothing matched.
  function identifyArchive(bytePrefix) {
    if (!bytePrefix || typeof bytePrefix.length !== 'number') return null;
    for (const sig of ARCHIVE_SIGNATURES) {
      const offset = sig.offset || 0;
      if (bytePrefix.length < offset + sig.bytes.length) continue;
      let match = true;
      for (let i = 0; i < sig.bytes.length; i++) {
        if (bytePrefix[offset + i] !== sig.bytes[i]) { match = false; break; }
      }
      if (match) return sig.kind;
    }
    return null;
  }

  // ── Canonical JSON ────────────────────────────────────────────────
  // Deterministic: recursively key-sorted, no whitespace. Arrays keep
  // their order (order is meaning in an array; it is not in an object).

  function canonicalize(value) {
    if (value === null) return 'null';
    const t = typeof value;
    if (t === 'number') {
      if (!Number.isFinite(value)) throw new Error('canonicalize: non-finite number');
      return JSON.stringify(value);
    }
    if (t === 'boolean' || t === 'string') return JSON.stringify(value);
    if (t === 'undefined') throw new Error('canonicalize: undefined is not representable');
    if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
    if (t === 'object') {
      const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
      return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
    }
    throw new Error('canonicalize: unsupported type ' + t);
  }

  // ── Header construction ───────────────────────────────────────────

  function buildHeader(opts) {
    const kdf = opts.kdf || {};
    const iterations = kdf.iterations != null ? kdf.iterations : DEFAULT_ITERATIONS;
    if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) {
      throw new Error('buildHeader: iterations must be an integer >= ' + MIN_ITERATIONS);
    }
    if (typeof kdf.salt !== 'string' || !kdf.salt) {
      throw new Error('buildHeader: kdf.salt (base64) is required');
    }
    if (typeof opts.iv !== 'string' || !opts.iv) {
      throw new Error('buildHeader: iv (base64) is required');
    }
    if (typeof opts.vaultId !== 'string' || !opts.vaultId) {
      throw new Error('buildHeader: vaultId is required');
    }
    if (!Number.isInteger(opts.saveCount) || opts.saveCount < 0) {
      throw new Error('buildHeader: saveCount must be a non-negative integer');
    }

    const anchor = normalizeAnchor(opts.ledgerAnchor);

    return {
      format:  FORMAT,
      version: VERSION,
      vaultId: opts.vaultId,
      cipher:  CIPHER,
      kdf: {
        algo:       KDF_ALGO,
        iterations,
        salt:       kdf.salt,
        keyLen:     kdf.keyLen != null ? kdf.keyLen : KEY_LEN,
      },
      iv:           opts.iv,
      savedAt:      opts.savedAt || new Date().toISOString(),
      saveCount:    opts.saveCount,
      ledgerAnchor: anchor,
    };
  }

  function normalizeAnchor(anchor) {
    if (anchor == null) return null;
    if (!Number.isInteger(anchor.seq) || anchor.seq < 0) {
      throw new Error('normalizeAnchor: seq must be a non-negative integer');
    }
    if (typeof anchor.head !== 'string' || !/^[0-9a-f]{64}$/.test(anchor.head)) {
      throw new Error('normalizeAnchor: head must be 64 hex chars');
    }
    return { seq: anchor.seq, head: anchor.head };
  }

  // ── AAD ───────────────────────────────────────────────────────────
  // The header minus the two ciphertext-derived fields, canonicalized.
  // Accepts either a bare header or a full envelope so encrypt-side and
  // decrypt-side callers cannot drift apart.

  function aadString(headerOrEnvelope) {
    const h = Object.assign({}, headerOrEnvelope);
    delete h.data;
    delete h.ciphertextSha256;
    return canonicalize(h);
  }

  function aadBytes(headerOrEnvelope) {
    return utf8Encode(aadString(headerOrEnvelope));
  }

  // ── Assembly / serialization ──────────────────────────────────────

  function assemble(header, ciphertextB64, ciphertextSha256) {
    if (typeof ciphertextB64 !== 'string' || !ciphertextB64) {
      throw new Error('assemble: ciphertext (base64) is required');
    }
    if (!/^[0-9a-f]{64}$/.test(ciphertextSha256 || '')) {
      throw new Error('assemble: ciphertextSha256 must be 64 hex chars');
    }
    return Object.assign({}, header, {
      ciphertextSha256,
      data: ciphertextB64,
    });
  }

  function serialize(envelope) {
    // Pretty-printed on purpose: a human staring at a corrupt vault at
    // 2am should be able to read the header without a JSON formatter.
    // Serialization layout does NOT affect the AAD, which is computed
    // from the parsed object via canonicalize().
    return JSON.stringify(envelope, null, 2);
  }

  // ── Parsing / validation ──────────────────────────────────────────
  // Returns a verdict object rather than throwing, because "this file
  // is not a vault" is an expected outcome the UI must render, not an
  // exception to swallow.

  function parse(raw) {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return { ok: false, reason: 'EMPTY', message: 'Vault file is empty or missing.' };
    }
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch (e) {
      return { ok: false, reason: 'NOT_JSON', message: 'Vault file is not valid JSON — it is corrupt.' };
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return { ok: false, reason: 'NOT_OBJECT', message: 'Vault file does not contain a vault object.' };
    }
    if (obj.version === 5 || (obj.version == null && obj.encrypted != null)) {
      return { ok: true, legacy: true, version: 5, envelope: obj };
    }
    // Checked before the version gate and before validate(), because a plain
    // vault is a different KIND of file, not a malformed encrypted one. The
    // second clause catches a plain vault whose `format` was lost by a
    // hand-edit or a partial write; `encrypted: false` is unambiguous.
    if (obj.format === FORMAT_PLAIN || (obj.version === VERSION && obj.encrypted === false)) {
      const vp = validatePlain(obj);
      if (!vp.ok) return vp;
      return { ok: true, plain: true, legacy: false, version: obj.version || VERSION, envelope: obj };
    }
    if (obj.version !== VERSION) {
      return {
        ok: false,
        reason: 'UNSUPPORTED_VERSION',
        message: 'Vault version ' + obj.version + ' is not supported by this build.',
        envelope: obj,
      };
    }
    const v = validate(obj);
    if (!v.ok) return v;
    return { ok: true, legacy: false, version: VERSION, envelope: obj };
  }

  function validate(env) {
    const fail = (reason, message) => ({ ok: false, reason, message });

    if (env.format !== FORMAT)  return fail('BAD_FORMAT', 'Not a MASTERMIND vault file.');
    if (env.cipher !== CIPHER)  return fail('BAD_CIPHER', 'Unknown cipher: ' + env.cipher);
    if (typeof env.vaultId !== 'string' || !env.vaultId) return fail('BAD_VAULT_ID', 'Vault has no identity.');

    const k = env.kdf;
    if (!k || typeof k !== 'object')  return fail('BAD_KDF', 'Vault header has no KDF parameters.');
    if (k.algo !== KDF_ALGO)          return fail('BAD_KDF_ALGO', 'Unknown key derivation: ' + k.algo);
    if (!Number.isInteger(k.iterations) || k.iterations < MIN_ITERATIONS) {
      return fail('BAD_KDF_ITERATIONS', 'KDF iteration count is missing or below the accepted floor.');
    }
    if (typeof k.salt !== 'string' || !k.salt) return fail('BAD_KDF_SALT', 'Vault header has no salt.');
    if (k.keyLen !== KEY_LEN)         return fail('BAD_KDF_KEYLEN', 'Unexpected key length: ' + k.keyLen);

    if (typeof env.iv !== 'string' || !env.iv) return fail('BAD_IV', 'Vault header has no IV.');
    if (typeof env.savedAt !== 'string' || isNaN(Date.parse(env.savedAt))) {
      return fail('BAD_SAVED_AT', 'Vault header has no valid savedAt timestamp.');
    }
    if (!Number.isInteger(env.saveCount) || env.saveCount < 0) {
      return fail('BAD_SAVE_COUNT', 'Vault header has no valid save counter.');
    }
    if (env.ledgerAnchor !== null) {
      if (!env.ledgerAnchor || typeof env.ledgerAnchor !== 'object') {
        return fail('BAD_ANCHOR', 'Vault header has a malformed ledger anchor.');
      }
      try { normalizeAnchor(env.ledgerAnchor); }
      catch (e) { return fail('BAD_ANCHOR', 'Vault header has a malformed ledger anchor.'); }
    }
    if (typeof env.data !== 'string' || !env.data) return fail('NO_CIPHERTEXT', 'Vault contains no data.');
    if (!/^[0-9a-f]{64}$/.test(env.ciphertextSha256 || '')) {
      return fail('BAD_HASH_FIELD', 'Vault header has no valid ciphertext hash.');
    }
    return { ok: true };
  }

  // ── Plain (unencrypted) vault ─────────────────────────────────────
  // Deliberately thin. There is no cipher, no salt, no IV, no AAD and no
  // ciphertext hash — so there is nothing here to verify and pretending
  // otherwise would be theatre. The only questions worth asking are "is this
  // the shape the unencrypted writer produces" and "is there a payload".
  //
  // Everything this format cannot promise is stated once, here, and carried
  // by the boot check to the screen: an unencrypted vault is readable and
  // editable by anything on the machine, and a change to it is undetectable.

  function validatePlain(env) {
    const fail = (reason, message) => ({ ok: false, reason, message });

    if (env.encrypted !== false) {
      return fail('BAD_PLAIN_FLAG',
        'This vault is marked unencrypted but does not say so consistently.');
    }
    if (env.version != null && env.version !== VERSION) {
      return fail('UNSUPPORTED_VERSION',
        'Unencrypted vault version ' + env.version + ' is not supported by this build.');
    }
    // A plain vault IS its state — identity and canvas live at the top level
    // rather than inside a `data` field. An object carrying neither is not a
    // vault, it is a stub, and opening it would silently present an empty app
    // as though that were the person's data.
    const hasPayload = env.identity != null || env.username != null || env.canvas != null;
    if (!hasPayload) {
      return fail('NO_PAYLOAD', 'Unencrypted vault contains no identity or canvas.');
    }
    return { ok: true };
  }

  // Returns the state itself. No copy, no key, no decryption step — the file
  // is the payload. Mirrors readLegacyV5's shape so callers can branch once.
  function readPlain(env) {
    if (!env || typeof env !== 'object') {
      return { ok: false, reason: 'BAD_PLAIN', message: 'Unencrypted vault is not an object.' };
    }
    return { ok: true, encrypted: false, state: env };
  }

  // ── Legacy read ───────────────────────────────────────────────────
  // A v5 file carries iv + data and nothing else — no salt, no
  // iterations. Those must come from the caller (localStorage meta on
  // the machine that created it). This is the one and only bridge, and
  // it exists to be used once and then never again.

  function readLegacyV5(env) {
    if (env.encrypted === false) {
      return { ok: true, encrypted: false, plainState: env.data };
    }
    if (typeof env.iv !== 'string' || typeof env.data !== 'string') {
      return { ok: false, reason: 'BAD_LEGACY', message: 'v5 vault is missing iv or data.' };
    }
    return { ok: true, encrypted: true, iv: env.iv, data: env.data };
  }

  // ── UTF-8 (engine-independent, no Buffer dependency) ──────────────

  function utf8Encode(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }

  return {
    FORMAT, FORMAT_PLAIN, VERSION, CIPHER,
    KDF_ALGO, SALT_BYTES, IV_BYTES, KEY_LEN,
    MIN_ITERATIONS, DEFAULT_ITERATIONS, ZERO_HEAD,
    ARCHIVE_SIGNATURES, identifyArchive,
    canonicalize,
    buildHeader,
    normalizeAnchor,
    aadString,
    aadBytes,
    assemble,
    serialize,
    parse,
    validate,
    validatePlain,
    readPlain,
    readLegacyV5,
  };
});

// §5.1 — registered component, not an orphan. Announces itself on the bus
// so the registry can see it; no orphan modules or hooks are allowed.
(function () {
  if (typeof MM_BUS === 'undefined' || typeof MM_BUS.emit !== 'function') return;
  MM_BUS.emit('mm.module.ready', {
    module:  'vault-envelope',
    uuid:    '4a3b2c1d-vault-6000-8000-envelope0001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
    pure:    true,
  });
})();
