'use strict';
const assert = require('assert');
const path = require('path');
const MfaCrypto = require(path.join(__dirname, '..', 'foundation', 'vault', 'vault-mfa.js'));

const results = [];
function t(name, fn) { results.push({ name, fn }); }

async function run() {
  console.log('\nMFA CRYPTO — TOTP · BACKUP CODES · WEBAUTHN\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try {
      await fn();
      console.log('  \u2713 ' + name);
      pass++;
    } catch (e) {
      console.log('  \u2717 ' + name);
      console.log('      ' + e.message);
    }
  }
  console.log('\nvault-mfa: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// ── HOTP against RFC 4226 Appendix D ────────────────────────────────
// Secret is the ASCII string "12345678901234567890" (20 bytes), the
// exact vector the RFC publishes so an implementation can be checked
// without trusting itself.

const RFC4226_SECRET = MfaCrypto.utf8Encode('12345678901234567890');
const RFC4226_CODES = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];

RFC4226_CODES.forEach((expected, counter) => {
  t(`HOTP counter=${counter} matches RFC 4226 Appendix D`, async () => {
    const code = await MfaCrypto.hotp(RFC4226_SECRET, counter, 6, 'SHA-1');
    assert.strictEqual(code, expected);
  });
});

// ── Base32 round-trip ────────────────────────────────────────────────

t('base32 encode/decode round-trips arbitrary bytes', () => {
  const original = MfaCrypto.randomBytes(20);
  const encoded = MfaCrypto.base32Encode(original);
  const decoded = MfaCrypto.base32Decode(encoded);
  assert.strictEqual(MfaCrypto.toHex(decoded), MfaCrypto.toHex(original));
});

t('base32 alphabet excludes 0/1/8/9 ambiguity by construction', () => {
  const encoded = MfaCrypto.base32Encode(new Uint8Array([0, 255, 128]));
  assert.ok(/^[A-Z2-7]+$/.test(encoded), 'unexpected characters in ' + encoded);
});

// ── TOTP ───────────────────────────────────────────────────────────

t('TOTP: a freshly generated code verifies against the same secret', async () => {
  const secret = MfaCrypto.randomTotpSecret();
  const now = Date.now();
  const code = await MfaCrypto.totpCode(secret, {}, now);
  const v = await MfaCrypto.totpVerify(code, secret, {}, now);
  assert.strictEqual(v.ok, true);
});

t('TOTP: the same code from a DIFFERENT secret does not verify', async () => {
  const secretA = MfaCrypto.randomTotpSecret();
  const secretB = MfaCrypto.randomTotpSecret();
  const now = Date.now();
  const code = await MfaCrypto.totpCode(secretA, {}, now);
  const v = await MfaCrypto.totpVerify(code, secretB, {}, now);
  assert.strictEqual(v.ok, false);
});

t('TOTP: a code one step in the past still verifies (clock drift window)', async () => {
  const secret = MfaCrypto.randomTotpSecret();
  const now = Date.now();
  const code = await MfaCrypto.totpCode(secret, {}, now - 30000); // previous 30s step
  const v = await MfaCrypto.totpVerify(code, secret, {}, now);
  assert.strictEqual(v.ok, true);
});

t('TOTP: a code three steps away is outside the default window', async () => {
  const secret = MfaCrypto.randomTotpSecret();
  const now = Date.now();
  const code = await MfaCrypto.totpCode(secret, {}, now - 90000);
  const v = await MfaCrypto.totpVerify(code, secret, {}, now);
  assert.strictEqual(v.ok, false);
});

t('TOTP: notBeforeCounter rejects replay of an already-used code', async () => {
  const secret = MfaCrypto.randomTotpSecret();
  const now = Date.now();
  const first = await MfaCrypto.totpVerify(await MfaCrypto.totpCode(secret, {}, now), secret, {}, now);
  assert.strictEqual(first.ok, true);
  const replay = await MfaCrypto.totpVerify(await MfaCrypto.totpCode(secret, {}, now), secret, {}, now, first.counter);
  assert.strictEqual(replay.ok, false, 'the exact same code must not verify twice');
});

t('TOTP: garbage input never throws, just fails', async () => {
  const secret = MfaCrypto.randomTotpSecret();
  const v = await MfaCrypto.totpVerify('not-a-code', secret, {}, Date.now());
  assert.strictEqual(v.ok, false);
});

t('otpauth:// URI carries the secret and standard params for QR enrollment', () => {
  const secret = MfaCrypto.randomTotpSecret();
  const uri = MfaCrypto.totpUri(secret, { issuer: 'MASTERMIND', account: 'operator' });
  assert.ok(uri.startsWith('otpauth://totp/'));
  assert.ok(uri.includes('secret=' + secret));
  assert.ok(uri.includes('issuer=MASTERMIND'));
});

// ── Backup codes ──────────────────────────────────────────────────

t('backup codes: generates the requested count with no duplicates', () => {
  const codes = MfaCrypto.generateBackupCodes(10);
  assert.strictEqual(codes.length, 10);
  assert.strictEqual(new Set(codes).size, 10);
});

t('backup codes: a generated code verifies against its own hash set', async () => {
  const codes = MfaCrypto.generateBackupCodes(5);
  const entries = [];
  for (const c of codes) entries.push({ hash: await MfaCrypto.hashBackupCode(c), used: false });
  const v = await MfaCrypto.verifyBackupCode(codes[2], entries);
  assert.strictEqual(v.ok, true);
  assert.strictEqual(entries[2].used, true, 'a verified code must be marked used');
});

t('backup codes: a used code cannot be used again', async () => {
  const codes = MfaCrypto.generateBackupCodes(3);
  const entries = [];
  for (const c of codes) entries.push({ hash: await MfaCrypto.hashBackupCode(c), used: false });
  await MfaCrypto.verifyBackupCode(codes[0], entries);
  const second = await MfaCrypto.verifyBackupCode(codes[0], entries);
  assert.strictEqual(second.ok, false, 'single-use means single-use');
});

t('backup codes: verification is case- and dash-insensitive', async () => {
  const codes = MfaCrypto.generateBackupCodes(1);
  const entries = [{ hash: await MfaCrypto.hashBackupCode(codes[0]), used: false }];
  const messy = codes[0].toLowerCase().replace('-', ' ');
  const v = await MfaCrypto.verifyBackupCode(messy, entries);
  assert.strictEqual(v.ok, true);
});

t('backup codes: an unrelated code does not verify', async () => {
  const codes = MfaCrypto.generateBackupCodes(3);
  const entries = [];
  for (const c of codes) entries.push({ hash: await MfaCrypto.hashBackupCode(c), used: false });
  const v = await MfaCrypto.verifyBackupCode('ZZZZZ-ZZZZZ', entries);
  assert.strictEqual(v.ok, false);
});

// ── WebAuthn: CBOR + COSE + signature verification ──────────────────
// Everything below is built by hand to the exact byte layout the
// WebAuthn spec defines, so these tests check the actual parsing and
// verification code — not a mock of it. The one thing this cannot
// exercise is a real browser's navigator.credentials ceremony; see the
// file-level comment in vault-mfa.js for why.

function cborEncodeUint(major, n) {
  if (n < 24) return new Uint8Array([(major << 5) | n]);
  if (n < 256) return new Uint8Array([(major << 5) | 24, n]);
  if (n < 65536) return new Uint8Array([(major << 5) | 25, (n >> 8) & 0xff, n & 0xff]);
  throw new Error('test helper: value too large');
}
function cborBytes(bytes) {
  const head = cborEncodeUint(2, bytes.length);
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head, 0); out.set(bytes, head.length);
  return out;
}
function cborText(str) {
  const bytes = MfaCrypto.utf8Encode(str);
  const head = cborEncodeUint(3, bytes.length);
  const out = new Uint8Array(head.length + bytes.length);
  out.set(head, 0); out.set(bytes, head.length);
  return out;
}
function concatAll(chunks) {
  const len = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// Builds a minimal COSE_Key CBOR map for an EC2/P-256 (ES256) key:
// { 1: 2 (kty=EC2), 3: -7 (alg=ES256), -1: 1 (crv=P-256), -2: x, -3: y }
// CBOR negative-int encoding: for value v < 0, major type 1, argument
// = -1 - v. So label -1 encodes as (1,0), label -3 as (1,2), and the
// alg value -7 as (1,6).
function cborNeg(v) { return cborEncodeUint(1, -1 - v); }

function buildCoseEc2(xBytes, yBytes) {
  const kv = concatAll([
    cborEncodeUint(0, 1), cborEncodeUint(0, 2),
    cborEncodeUint(0, 3), cborNeg(-7),
    cborNeg(-1), cborEncodeUint(0, 1),
    cborNeg(-2), cborBytes(xBytes),
    cborNeg(-3), cborBytes(yBytes),
  ]);
  return concatAll([new Uint8Array([0xa5]), kv]); // map, 5 pairs
}

async function buildSyntheticCredential() {
  const subtle = require('crypto').webcrypto.subtle;
  const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await subtle.exportKey('jwk', keyPair.publicKey);
  const x = MfaCrypto.b64urlDecode(jwk.x);
  const y = MfaCrypto.b64urlDecode(jwk.y);

  const rpIdHash = new Uint8Array(await subtle.digest('SHA-256', MfaCrypto.utf8Encode('localhost')));
  const flags = new Uint8Array([0x41]); // UP=1, AT=1
  const signCount = new Uint8Array([0, 0, 0, 1]);
  const aaguid = new Uint8Array(16);
  const credentialId = MfaCrypto.randomBytes(16);
  const credIdLen = new Uint8Array([(credentialId.length >> 8) & 0xff, credentialId.length & 0xff]);
  const coseKey = buildCoseEc2(x, y);

  const authenticatorData = concatAll([rpIdHash, flags, signCount, aaguid, credIdLen, credentialId, coseKey]);

  const attestationObject = concatAll([
    new Uint8Array([0xa3]), // map, 3 pairs: fmt, attStmt, authData
    cborText('fmt'), cborText('none'),
    cborText('attStmt'), new Uint8Array([0xa0]), // empty map
    cborText('authData'), cborBytes(authenticatorData),
  ]);

  return { keyPair, attestationObject, authenticatorDataForAssertion: concatAll([rpIdHash, new Uint8Array([0x01]), new Uint8Array([0, 0, 0, 2])]) };
}

// Minimal DER encoder for the test — the inverse of derEcdsaToRaw,
// used to simulate what a real authenticator sends (Web Crypto's own
// ECDSA sign() output is raw r||s, not DER, so this step is necessary
// to actually exercise the DER-parsing path under test).
function derEncodeInt(bytes) {
  let b = bytes;
  let i = 0;
  while (i < b.length - 1 && b[i] === 0 && !(b[i + 1] & 0x80)) i++;
  b = b.slice(i);
  if (b[0] & 0x80) { const p = new Uint8Array(b.length + 1); p.set(b, 1); b = p; }
  return concatAll([new Uint8Array([0x02, b.length]), b]);
}
function rawEcdsaToDer(raw) {
  const r = derEncodeInt(raw.slice(0, 32));
  const s = derEncodeInt(raw.slice(32, 64));
  const body = concatAll([r, s]);
  return concatAll([new Uint8Array([0x30, body.length]), body]);
}

t('WebAuthn: parseAttestationObject extracts the credential ID and a usable public key', async () => {
  const { attestationObject } = await buildSyntheticCredential();
  const parsed = MfaCrypto.parseAttestationObject(attestationObject);
  assert.strictEqual(parsed.alg, -7);
  assert.strictEqual(parsed.publicKeyJwk.kty, 'EC');
  assert.strictEqual(parsed.publicKeyJwk.crv, 'P-256');
  assert.ok(parsed.credentialId.length > 0);
});

t('WebAuthn: an assertion signed by the registered key verifies (DER signature path)', async () => {
  const { keyPair, attestationObject, authenticatorDataForAssertion } = await buildSyntheticCredential();
  const cred = MfaCrypto.parseAttestationObject(attestationObject);

  const subtle = require('crypto').webcrypto.subtle;
  const clientDataJSON = MfaCrypto.utf8Encode(JSON.stringify({ type: 'webauthn.get', challenge: 'test-challenge', origin: 'http://localhost' }));
  const clientHash = new Uint8Array(await subtle.digest('SHA-256', clientDataJSON));
  const message = concatAll([authenticatorDataForAssertion, clientHash]);

  const rawSig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, message));
  const derSig = rawEcdsaToDer(rawSig); // simulate what a real authenticator actually sends

  const ok = await MfaCrypto.verifyAssertionSignature(cred, authenticatorDataForAssertion, clientDataJSON, derSig);
  assert.strictEqual(ok, true);
});

t('WebAuthn: an assertion signed by a DIFFERENT key does not verify', async () => {
  const { attestationObject, authenticatorDataForAssertion } = await buildSyntheticCredential();
  const cred = MfaCrypto.parseAttestationObject(attestationObject);

  const subtle = require('crypto').webcrypto.subtle;
  const impostor = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const clientDataJSON = MfaCrypto.utf8Encode(JSON.stringify({ type: 'webauthn.get', challenge: 'test-challenge', origin: 'http://localhost' }));
  const clientHash = new Uint8Array(await subtle.digest('SHA-256', clientDataJSON));
  const message = concatAll([authenticatorDataForAssertion, clientHash]);
  const rawSig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, impostor.privateKey, message));
  const derSig = rawEcdsaToDer(rawSig);

  const ok = await MfaCrypto.verifyAssertionSignature(cred, authenticatorDataForAssertion, clientDataJSON, derSig);
  assert.strictEqual(ok, false);
});

t('WebAuthn: a tampered clientDataJSON invalidates the signature', async () => {
  const { keyPair, attestationObject, authenticatorDataForAssertion } = await buildSyntheticCredential();
  const cred = MfaCrypto.parseAttestationObject(attestationObject);

  const subtle = require('crypto').webcrypto.subtle;
  const clientDataJSON = MfaCrypto.utf8Encode(JSON.stringify({ type: 'webauthn.get', challenge: 'test-challenge', origin: 'http://localhost' }));
  const clientHash = new Uint8Array(await subtle.digest('SHA-256', clientDataJSON));
  const message = concatAll([authenticatorDataForAssertion, clientHash]);
  const rawSig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keyPair.privateKey, message));
  const derSig = rawEcdsaToDer(rawSig);

  const tampered = MfaCrypto.utf8Encode(JSON.stringify({ type: 'webauthn.get', challenge: 'DIFFERENT', origin: 'http://localhost' }));
  const ok = await MfaCrypto.verifyAssertionSignature(cred, authenticatorDataForAssertion, tampered, derSig);
  assert.strictEqual(ok, false);
});

t('WebAuthn: derEcdsaToRaw round-trips against a hand-rolled DER encoder', () => {
  const raw = MfaCrypto.randomBytes(64);
  const der = rawEcdsaToDer(raw);
  const back = MfaCrypto.derEcdsaToRaw(der, 32);
  assert.strictEqual(MfaCrypto.toHex(back), MfaCrypto.toHex(raw));
});

t('WebAuthn: buildCreationOptions produces a spec-shaped options object', () => {
  const opts = MfaCrypto.buildCreationOptions({ rpId: 'localhost', userId: 'operator', userName: 'operator' });
  assert.strictEqual(opts.publicKey.rp.id, 'localhost');
  assert.ok(opts.publicKey.challenge instanceof Uint8Array);
  assert.strictEqual(opts.publicKey.challenge.length, 32);
  assert.deepStrictEqual(opts.publicKey.pubKeyCredParams.map((p) => p.alg), [-7, -257]);
});

run();
