// ═══════════════════════════════════════════════════════════════════
// MFA CRYPTO — foundation/vault/vault-mfa.js
//
// TOTP (RFC 6238), single-use backup codes, and WebAuthn/FIDO2
// assertion verification. Pure functions only — no vault, no DOM, no
// localStorage, no fetch, same discipline as vault-crypto.js and
// assist-contract.js. Everything here takes its inputs as arguments
// and returns a value; nothing reaches out to touch app state. That's
// what makes it possible to unit-test the actual signature-verification
// math against synthetic keys in plain Node, rather than trusting it
// untested until a real security key is on hand.
//
// ─────────────────────────────────────────────────────────────────
// WHAT LIVES HERE
//
//   TOTP        — RFC 6238 (time-based OTP). Works everywhere, no
//                 platform API required. HOTP core is tested against
//                 the official RFC 4226 Appendix D test vectors.
//   Backup codes — single-use recovery codes, stored as salted-free
//                 SHA-256 hashes only. The plaintext is shown once.
//   WebAuthn    — enough CBOR/COSE parsing to read an attestationObject
//                 from navigator.credentials.create(), and enough
//                 ECDSA/RSA verification to check an assertion from
//                 navigator.credentials.get() without a server.
//
// ─────────────────────────────────────────────────────────────────
// THE WEBAUTHN ORIGIN
//
// navigator.credentials (WebAuthn) requires the page to be running on
// an origin the platform considers valid for it — Chromium refuses it
// entirely on file://, since there's no domain to bind a credential
// to. main.js serves the app over http://localhost via a loopback-only
// static server (with a random per-launch token in the path, so it
// isn't just an open door on the machine) specifically so the
// functions below have a real origin to work against.
//
// The functions themselves don't know or care how they were loaded —
// they take bytes in, return verified results out. This comment exists
// so the dependency is documented somewhere, not because this file
// enforces it.
//
// UUID: 4a3b2c1d-vault-6000-8000-mfa0000001
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.MfaCrypto = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const SUBTLE = (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.subtle)
    ? globalThis.crypto.subtle : null;
  const RANDOM = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;

  function requireSubtle() {
    if (!SUBTLE) throw new Error('WebCrypto unavailable — MFA cannot operate.');
    return SUBTLE;
  }

  // ── Small self-contained utilities ──────────────────────────────
  // Deliberately not shared with VaultCrypto — this module holds no
  // reference to anything outside itself, on purpose.

  function randomBytes(n) {
    if (!RANDOM) throw new Error('No CSPRNG available.');
    return RANDOM.getRandomValues(new Uint8Array(n));
  }
  function utf8Encode(str) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
    return new Uint8Array(Buffer.from(str, 'utf8'));
  }
  function utf8Decode(bytes) {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }
  function toBase64(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
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
  function b64urlEncode(bytes) {
    return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64urlDecode(str) {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return fromBase64(s);
  }
  function toHex(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let out = '';
    for (let i = 0; i < u8.length; i++) out += u8[i].toString(16).padStart(2, '0');
    return out;
  }
  async function sha256Hex(bytes) {
    const buf = await requireSubtle().digest('SHA-256', bytes);
    return toHex(new Uint8Array(buf));
  }
  function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // BASE32 — RFC 4648, unpadded, uppercase. Standard for TOTP secrets
  // because it's what every authenticator app (Google/Microsoft
  // Authenticator, Authy, 1Password, etc.) expects to scan or type.
  // ═══════════════════════════════════════════════════════════════

  const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  function base32Encode(bytes) {
    let bits = 0, value = 0, out = '';
    for (let i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) { out += B32_ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
    return out;
  }

  function base32Decode(str) {
    const clean = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0, value = 0;
    const out = [];
    for (let i = 0; i < clean.length; i++) {
      const idx = B32_ALPHABET.indexOf(clean[i]);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    return new Uint8Array(out);
  }

  // ═══════════════════════════════════════════════════════════════
  // TOTP / HOTP — RFC 6238 / RFC 4226
  // ═══════════════════════════════════════════════════════════════

  function randomTotpSecret(bytes) {
    return base32Encode(randomBytes(bytes || 20)); // 160 bits, the RFC 4226 default
  }

  // HOTP core. counter is a non-negative integer (JS number is fine —
  // we never run 2^53 codes). algoName is a WebCrypto hash name:
  // 'SHA-1' (near-universal authenticator support), 'SHA-256', 'SHA-512'.
  async function hotp(secretBytes, counter, digits, algoName) {
    const subtle = requireSubtle();
    const counterBytes = new Uint8Array(8);
    let c = BigInt(Math.floor(counter));
    for (let i = 7; i >= 0; i--) { counterBytes[i] = Number(c & 0xffn); c >>= 8n; }
    const key = await subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: algoName || 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await subtle.sign('HMAC', key, counterBytes));
    const offset = sig[sig.length - 1] & 0x0f;
    const bin = ((sig[offset] & 0x7f) << 24) | ((sig[offset + 1] & 0xff) << 16) |
                ((sig[offset + 2] & 0xff) << 8) | (sig[offset + 3] & 0xff);
    const mod = 10 ** (digits || 6);
    return String(bin % mod).padStart(digits || 6, '0');
  }

  function _totpOpts(opts) {
    return Object.assign({ digits: 6, period: 30, algo: 'SHA-1', window: 1 }, opts || {});
  }

  async function totpCode(secretB32, opts, atMs) {
    const o = _totpOpts(opts);
    const counter = Math.floor((atMs != null ? atMs : Date.now()) / 1000 / o.period);
    return hotp(base32Decode(secretB32), counter, o.digits, o.algo);
  }

  // Checks a window of steps either side of "now" so a slow phone clock
  // doesn't lock someone out. notBeforeCounter, when given, rejects a
  // counter at or before one already spent — a code that worked once
  // does not work again for the rest of its 30-second window.
  async function totpVerify(code, secretB32, opts, atMs, notBeforeCounter) {
    const o = _totpOpts(opts);
    const clean = String(code || '').replace(/\s+/g, '');
    if (!clean) return { ok: false, counter: null };
    const t = atMs != null ? atMs : Date.now();
    const base = Math.floor(t / 1000 / o.period);
    const secretBytes = base32Decode(secretB32);
    for (let d = -o.window; d <= o.window; d++) {
      const counter = base + d;
      if (notBeforeCounter != null && counter <= notBeforeCounter) continue;
      const candidate = await hotp(secretBytes, counter, o.digits, o.algo);
      if (timingSafeEqual(candidate, clean)) return { ok: true, counter };
    }
    return { ok: false, counter: null };
  }

  // otpauth:// URI for QR enrollment. The `algorithm` param has no
  // hyphen per the de-facto spec (Google Authenticator et al.) even
  // though we use 'SHA-1' internally for WebCrypto.
  function totpUri(secretB32, opts) {
    const o = Object.assign({ issuer: 'MASTERMIND', account: 'operator', digits: 6, period: 30, algo: 'SHA-1' }, opts || {});
    const label = encodeURIComponent(o.issuer) + ':' + encodeURIComponent(o.account);
    const params = new URLSearchParams({
      secret: secretB32,
      issuer: o.issuer,
      algorithm: o.algo.replace('-', ''),
      digits: String(o.digits),
      period: String(o.period),
    });
    return 'otpauth://totp/' + label + '?' + params.toString();
  }

  // ═══════════════════════════════════════════════════════════════
  // BACKUP CODES — single-use recovery. Only the SHA-256 hash is ever
  // stored; the plaintext exists only in the moment it's generated,
  // shown to the person once, and discarded.
  // ═══════════════════════════════════════════════════════════════

  const BACKUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L — read aloud without ambiguity

  function _generateOneBackupCode() {
    const raw = randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += BACKUP_ALPHABET[raw[i] % BACKUP_ALPHABET.length];
    return s.slice(0, 5) + '-' + s.slice(5);
  }

  function generateBackupCodes(n) {
    const count = n || 10;
    const seen = new Set();
    const out = [];
    while (out.length < count) {
      const c = _generateOneBackupCode();
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  }

  function _normalizeBackupCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  async function hashBackupCode(code) {
    return sha256Hex(utf8Encode(_normalizeBackupCode(code)));
  }

  // entries: [{ hash, used }]. Mutates the matching entry to used:true
  // on success — the caller is responsible for persisting that change;
  // this function does not touch storage.
  async function verifyBackupCode(code, entries) {
    const hash = await hashBackupCode(code);
    const list = entries || [];
    for (let i = 0; i < list.length; i++) {
      if (!list[i].used && timingSafeEqual(list[i].hash, hash)) {
        list[i].used = true;
        list[i].usedAt = Date.now();
        return { ok: true, index: i, remaining: list.filter((e) => !e.used).length };
      }
    }
    return { ok: false, index: -1, remaining: list.filter((e) => !e.used).length };
  }

  // ═══════════════════════════════════════════════════════════════
  // CBOR — minimal decoder. Only what WebAuthn's canonical, definite-
  // length CBOR actually uses: unsigned/negative ints, byte strings,
  // text strings, arrays, maps, and the three named simple values.
  // Indefinite-length items and tags are refused rather than
  // mis-parsed — an authenticator that sent one would need a bigger
  // decoder than this, not a silently wrong one.
  // ═══════════════════════════════════════════════════════════════

  function _cborReadLen(bytes, pos, info) {
    if (info < 24) return { value: info, pos };
    if (info === 24) return { value: bytes[pos], pos: pos + 1 };
    if (info === 25) return { value: (bytes[pos] << 8) | bytes[pos + 1], pos: pos + 2 };
    if (info === 26) {
      const v = ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
      return { value: v, pos: pos + 4 };
    }
    if (info === 27) {
      let v = 0n;
      for (let i = 0; i < 8; i++) v = (v << 8n) | BigInt(bytes[pos + i]);
      return { value: v, pos: pos + 8 };
    }
    throw new Error('cbor: indefinite-length or reserved item not supported (info=' + info + ')');
  }

  function cborDecode(bytes, pos) {
    pos = pos || 0;
    const first = bytes[pos]; pos++;
    const major = first >> 5;
    const info = first & 0x1f;
    let lenRes;
    switch (major) {
      case 0: // unsigned int
        lenRes = _cborReadLen(bytes, pos, info);
        return { value: lenRes.value, pos: lenRes.pos };
      case 1: { // negative int: value = -1 - n
        lenRes = _cborReadLen(bytes, pos, info);
        const n = typeof lenRes.value === 'bigint' ? lenRes.value : BigInt(lenRes.value);
        return { value: Number(-1n - n), pos: lenRes.pos };
      }
      case 2: { // byte string
        lenRes = _cborReadLen(bytes, pos, info);
        const len = Number(lenRes.value);
        return { value: bytes.slice(lenRes.pos, lenRes.pos + len), pos: lenRes.pos + len };
      }
      case 3: { // text string
        lenRes = _cborReadLen(bytes, pos, info);
        const len = Number(lenRes.value);
        return { value: utf8Decode(bytes.slice(lenRes.pos, lenRes.pos + len)), pos: lenRes.pos + len };
      }
      case 4: { // array
        lenRes = _cborReadLen(bytes, pos, info);
        const len = Number(lenRes.value);
        let p = lenRes.pos; const arr = [];
        for (let i = 0; i < len; i++) { const r = cborDecode(bytes, p); arr.push(r.value); p = r.pos; }
        return { value: arr, pos: p };
      }
      case 5: { // map — keys stringified; WebAuthn/COSE keys are always ints or short text
        lenRes = _cborReadLen(bytes, pos, info);
        const len = Number(lenRes.value);
        let p = lenRes.pos; const obj = {};
        for (let i = 0; i < len; i++) {
          const kr = cborDecode(bytes, p); p = kr.pos;
          const vr = cborDecode(bytes, p); p = vr.pos;
          obj[String(kr.value)] = vr.value;
        }
        return { value: obj, pos: p };
      }
      case 7:
        if (info === 20) return { value: false, pos };
        if (info === 21) return { value: true, pos };
        if (info === 22) return { value: null, pos };
        if (info === 23) return { value: undefined, pos };
        throw new Error('cbor: unsupported simple value ' + info);
      default:
        throw new Error('cbor: unsupported major type ' + major);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // WebAuthn — attestationObject / authenticatorData / COSE parsing,
  // and assertion signature verification. See the file-level comment
  // for the file:// origin caveat before wiring this into the UI.
  // ═══════════════════════════════════════════════════════════════

  function randomChallenge() { return randomBytes(32); }

  function parseAuthenticatorData(bytes) {
    if (bytes.length < 37) throw new Error('authenticatorData shorter than the fixed header');
    const rpIdHash = bytes.slice(0, 32);
    const flags = bytes[32];
    const signCount = ((bytes[33] << 24) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36]) >>> 0;
    let pos = 37;
    const AT = !!(flags & 0x40);
    let credentialId = null, coseKey = null, aaguid = null;
    if (AT) {
      aaguid = bytes.slice(pos, pos + 16); pos += 16;
      const credIdLen = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2;
      credentialId = bytes.slice(pos, pos + credIdLen); pos += credIdLen;
      const r = cborDecode(bytes, pos);
      coseKey = r.value; pos = r.pos;
    }
    return {
      rpIdHash, flags, signCount, aaguid, credentialId, coseKey,
      userPresent: !!(flags & 0x01), userVerified: !!(flags & 0x04),
    };
  }

  // COSE key type 2 = EC2 (we only accept curve 1 = P-256, i.e. ES256),
  // type 3 = RSA. Anything else is refused rather than guessed at.
  function coseKeyToJwk(coseKey) {
    const kty = Number(coseKey['1']);
    if (kty === 2) {
      const crv = Number(coseKey['-1']);
      if (crv !== 1) throw new Error('unsupported EC curve id ' + crv + ' — only P-256 (ES256) is supported');
      return { jwk: { kty: 'EC', crv: 'P-256', x: b64urlEncode(coseKey['-2']), y: b64urlEncode(coseKey['-3']), ext: true }, alg: -7 };
    }
    if (kty === 3) {
      return { jwk: { kty: 'RSA', n: b64urlEncode(coseKey['-1']), e: b64urlEncode(coseKey['-2']), ext: true }, alg: -257 };
    }
    throw new Error('unsupported COSE key type ' + kty);
  }

  // The registration response's `.response.attestationObject`, as raw
  // bytes (an ArrayBuffer from the browser — pass it through new
  // Uint8Array(...) first). attestation format ('fmt') is reported but
  // not verified — we deliberately don't chain-verify attestation
  // certificates (that needs a maintained root-cert bundle per vendor,
  // which is a liability for a local app); what we DO verify, at every
  // login, is that assertions are signed by the exact public key this
  // function extracted at registration. That's the property that
  // actually matters for "is this the same key."
  function parseAttestationObject(bytes) {
    const top = cborDecode(bytes, 0).value;
    if (!top || !top.authData) throw new Error('attestationObject has no authData');
    const parsed = parseAuthenticatorData(top.authData);
    if (!parsed.credentialId || !parsed.coseKey) throw new Error('no attested credential data in authenticatorData');
    const { jwk, alg } = coseKeyToJwk(parsed.coseKey);
    return {
      fmt: top.fmt,
      credentialId: b64urlEncode(parsed.credentialId),
      publicKeyJwk: jwk,
      alg,
      signCount: parsed.signCount,
      aaguid: toHex(parsed.aaguid),
    };
  }

  // Authenticators sign in ASN.1 DER (SEQUENCE of two INTEGERs); Web
  // Crypto's ECDSA verify() expects raw r||s (IEEE P1363). This is the
  // single most common place a from-scratch WebAuthn verifier silently
  // fails, so it has its own function and its own test.
  function derEcdsaToRaw(der, compSize) {
    const size = compSize || 32;
    let pos = 0;
    if (der[pos++] !== 0x30) throw new Error('not a DER SEQUENCE');
    let seqLen = der[pos++];
    if (seqLen & 0x80) { const n = seqLen & 0x7f; seqLen = 0; for (let i = 0; i < n; i++) seqLen = (seqLen << 8) | der[pos++]; }
    function readInt() {
      if (der[pos++] !== 0x02) throw new Error('not a DER INTEGER');
      let len = der[pos++];
      if (len & 0x80) { const n = len & 0x7f; len = 0; for (let i = 0; i < n; i++) len = (len << 8) | der[pos++]; }
      let b = der.slice(pos, pos + len); pos += len;
      while (b.length > size && b[0] === 0) b = b.slice(1);
      if (b.length < size) { const p = new Uint8Array(size); p.set(b, size - b.length); b = p; }
      return b;
    }
    const r = readInt(), s = readInt();
    const out = new Uint8Array(size * 2);
    out.set(r, 0); out.set(s, size);
    return out;
  }

  // message = authenticatorData || SHA-256(clientDataJSON), per the
  // WebAuthn spec. `cred` is what parseAttestationObject returned at
  // registration (publicKeyJwk + alg) — the caller looks that up by
  // credential ID, not this function.
  async function verifyAssertionSignature(cred, authenticatorDataBytes, clientDataJSONBytes, signatureBytes) {
    const subtle = requireSubtle();
    const clientHash = new Uint8Array(await subtle.digest('SHA-256', clientDataJSONBytes));
    const message = new Uint8Array(authenticatorDataBytes.length + clientHash.length);
    message.set(authenticatorDataBytes, 0);
    message.set(clientHash, authenticatorDataBytes.length);

    if (cred.alg === -7) {
      const key = await subtle.importKey('jwk', cred.publicKeyJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derEcdsaToRaw(signatureBytes, 32), message);
    }
    if (cred.alg === -257) {
      const key = await subtle.importKey('jwk', cred.publicKeyJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      return subtle.verify('RSASSA-PKCS1-v1_5', key, signatureBytes, message);
    }
    throw new Error('unsupported signature algorithm ' + cred.alg);
  }

  // Convenience builders for the two calls the UI needs to make.
  // rpId must be a valid domain the origin can bind to — see the
  // file:// caveat at the top of this file.
  function buildCreationOptions(o) {
    o = o || {};
    return {
      publicKey: {
        rp: { id: o.rpId, name: o.rpName || 'MASTERMIND' },
        user: { id: o.userId instanceof Uint8Array ? o.userId : utf8Encode(String(o.userId || 'operator')), name: o.userName || 'operator', displayName: o.userDisplayName || o.userName || 'operator' },
        challenge: randomChallenge(),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
        timeout: 60000,
        attestation: 'none',
        excludeCredentials: (o.excludeCredentialIds || []).map((id) => ({ type: 'public-key', id: b64urlDecode(id) })),
      },
    };
  }
  function buildRequestOptions(o) {
    o = o || {};
    return {
      publicKey: {
        rpId: o.rpId,
        challenge: randomChallenge(),
        allowCredentials: (o.allowCredentialIds || []).map((id) => ({ type: 'public-key', id: b64urlDecode(id) })),
        userVerification: 'preferred',
        timeout: 60000,
      },
    };
  }

  return {
    // encoding
    toBase64, fromBase64, b64urlEncode, b64urlDecode, toHex, utf8Encode, utf8Decode,
    base32Encode, base32Decode,
    // totp
    randomTotpSecret, hotp, totpCode, totpVerify, totpUri,
    // backup codes
    generateBackupCodes, hashBackupCode, verifyBackupCode,
    // webauthn
    cborDecode, parseAuthenticatorData, coseKeyToJwk, parseAttestationObject,
    derEcdsaToRaw, verifyAssertionSignature, randomChallenge,
    buildCreationOptions, buildRequestOptions,
    // misc
    sha256Hex, timingSafeEqual, randomBytes,
  };
});

// §5.1 — registered component, not an orphan.
(function () {
  if (typeof MM_BUS === 'undefined' || typeof MM_BUS.emit !== 'function') return;
  MM_BUS.emit('mm.module.ready', {
    module: 'vault-mfa',
    uuid: '4a3b2c1d-vault-6000-8000-mfa0000001',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
    pure: true,
  });
})();
