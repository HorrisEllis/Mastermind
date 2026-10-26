// ═══════════════════════════════════════════════════════════════════
// ATOMIC VAULT WRITE
// foundation/vault/atomic-write.js
//
// Main process. Extracted from main.js so there is exactly ONE
// implementation of "put these bytes on disk safely" — the previous
// arrangement had the durability logic inline in an IPC handler, which
// meant it could only be exercised by launching Electron, which meant
// in practice it was never exercised at all.
//
// ─────────────────────────────────────────────────────────────────
// ATOMIC ≠ DURABLE
//
// writeFileSync + rename is atomic with respect to READERS: no process
// ever observes a half-written vault, because rename is atomic within
// a filesystem. It is NOT durable with respect to POWER LOSS: the
// rename can reach the platter before the data it points at, leaving a
// correctly named, zero-length vault. That failure mode is silent and
// total.
//
// So: fsync the file before the rename, fsync the directory after it.
// Directory fsync is best-effort — some platforms refuse a directory
// fd, and failing to sync the directory must not discard a write that
// already succeeded.
//
// UUID: 4a3b2c1d-vault-6000-8000-atomicwrite1
// ═══════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');
const VaultEnvelope = require('./vault-envelope.js');

function fsyncDir(dir) {
  let dfd = null;
  try { dfd = fs.openSync(dir, 'r'); fs.fsyncSync(dfd); return true; }
  catch (e) { return false; }
  finally { if (dfd !== null) { try { fs.closeSync(dfd); } catch (e) {} } }
}

// Synchronous sleep — Atomics.wait on a value that will never change is
// the standard way to actually block the thread for a fixed duration in
// plain Node, without pulling in a dependency for one timer. Used only
// here, only for a few tens of milliseconds, only on the main process.
function _sleepSync(ms) {
  try {
    const sab = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(sab), 0, 0, ms);
  } catch (e) { /* SharedArrayBuffer unavailable in some sandboxed contexts — skip the wait rather than crash a save over it */ }
}

// rename() failing because the destination is "busy" is one of the most
// commonly reported Node-on-Windows file I/O problems, and it is almost
// never a real problem: Windows Defender scanning the file after a
// write, a sync client (OneDrive, Dropbox) noticing the change, Windows
// Search indexing it, or even this app's own previous read not having
// fully released its handle yet, can all hold the file for a few tens
// of milliseconds. That lock clears on its own almost immediately —
// what was missing was ever giving it the chance to. This is the same
// retry-on-EBUSY/EPERM/EACCES mitigation the write-file-atomic package
// uses, applied to the one line in this codebase that does the rename.
function _renameWithRetry(tmp, filePath, maxRetries, delayMs) {
  const retries = maxRetries ?? 6;
  const delay = delayMs ?? 60;
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      fs.renameSync(tmp, filePath);
      return;
    } catch (e) {
      lastErr = e;
      const transient = e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES';
      if (!transient || attempt === retries) throw e;
      _sleepSync(delay);
    }
  }
  throw lastErr;
}

// Returns { ok, bytes } or { ok: false, error }. Never throws: callers are
// IPC handlers and save paths that must report failure, not crash.
function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  let fd = null;
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, data, 0, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;

    _renameWithRetry(tmp, filePath);
    fsyncDir(dir);

    return { ok: true, bytes: Buffer.byteLength(data, 'utf8') };
  } catch (e) {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e2) {} }
    // Leaving a .tmp behind would make the next write look like a resume.
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch (e2) {}
    const locked = e.code === 'EBUSY' || e.code === 'EPERM' || e.code === 'EACCES';
    const message = locked
      ? 'The vault file is locked by something else on this machine (antivirus, a sync client like OneDrive/Dropbox, or Windows Search are the usual causes) — retried and it stayed locked. ' + e.message
      : e.message;
    return { ok: false, error: message, code: e.code || null };
  }
}

function readFile(filePath) {
  try { return fs.readFileSync(filePath, 'utf8'); } catch (e) { return null; }
}

function exists(filePath) {
  try { return fs.existsSync(filePath); } catch (e) { return false; }
}

// How many leading bytes to inspect. The furthest signature offset is the
// tar "ustar" magic at byte 257, plus its 5-byte length — 262 covers every
// entry in VaultEnvelope.ARCHIVE_SIGNATURES with room to spare.
const PROBE_BYTES = 512;

// Reads only the leading bytes of a file — never the whole thing — and
// checks them against known archive signatures BEFORE anything decodes
// the file as text. Used by the boot pre-flight to tell "this is not a
// vault, it is a zip" apart from "this vault is corrupt", which look
// identical after a UTF-8 decode has already mangled the binary but are
// completely different problems with different remedies.
//
// Returns { exists, bytes, archiveKind } and never throws — this exists
// to make a diagnosis, not to be another thing that can fail the boot
// sequence.
function probeFormat(filePath) {
  let fd = null;
  try {
    if (!fs.existsSync(filePath)) return { exists: false, bytes: 0, archiveKind: null };
    const stat = fs.statSync(filePath);
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(PROBE_BYTES, stat.size));
    const read = fs.readSync(fd, buf, 0, buf.length, 0);
    const prefix = buf.subarray(0, read);
    return {
      exists: true,
      bytes: stat.size,
      archiveKind: VaultEnvelope.identifyArchive(prefix),
    };
  } catch (e) {
    return { exists: false, bytes: 0, archiveKind: null, error: e.message };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e2) {} }
  }
}

module.exports = { atomicWrite, readFile, exists, probeFormat, fsyncDir, _renameWithRetry };
