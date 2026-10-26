// ═══════════════════════════════════════════════════════════════════
// VOICE LATTICE — AUDIO ENCODE
// modules/voice-lattice/audio-encode.js
//
// Pure functions: raw Float32 PCM samples in, a 16kHz mono WAV
// ArrayBuffer out — the exact format whisper.cpp's file reader expects
// directly, no further decoding needed on the main-process side. No
// DOM, no Web Audio, no Electron reference, so the actual math here is
// unit-testable without a browser — same discipline as vault-crypto.js
// and vault-mfa.js.
//
// ─────────────────────────────────────────────────────────────────
// WHY THIS EXISTS AT ALL
//
// ui-capture.js already has a live MediaStream (for the waveform). A
// ScriptProcessorNode on that same stream hands raw Float32 samples at
// whatever the mic's native rate is (44.1kHz or 48kHz almost always,
// never 16kHz). Whisper needs 16kHz mono PCM. This is the conversion,
// and splitUtterances() is what turns one transcript back into the
// separate thoughts the lattice's associative model expects — Whisper
// returns one blob of text per recording, but a real capture session
// usually contains more than one thought.
//
// UUID: 4a3b2c1d-mod-9000-8000-audioencode1
// ═══════════════════════════════════════════════════════════════════

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof root !== 'undefined') root.VLAudioEncode = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Linear-interpolation resample. Not audiophile-grade, but whisper.cpp's
  // own accuracy loss from resampling artifacts is negligible next to its
  // transcription error rate — this only needs to not alias badly, and
  // linear interpolation on a 3x-ish downsample doesn't.
  function resample(float32, fromRate, toRate) {
    if (fromRate === toRate) return float32;
    const ratio = fromRate / toRate;
    const newLen = Math.max(1, Math.round(float32.length / ratio));
    const out = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      const srcPos = i * ratio;
      const i0 = Math.floor(srcPos);
      const i1 = Math.min(i0 + 1, float32.length - 1);
      const frac = srcPos - i0;
      out[i] = float32[i0] * (1 - frac) + (float32[i1] ?? float32[i0]) * frac;
    }
    return out;
  }

  // A ScriptProcessorNode hands audio in fixed-size chunks as it arrives;
  // this stitches them back into one contiguous buffer before resampling
  // or encoding, so a chunk boundary never becomes an audible/decodable
  // seam.
  function concatFloat32(chunks) {
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Float32Array(total);
    let offset = 0;
    for (const c of chunks) { out.set(c, offset); offset += c.length; }
    return out;
  }

  // Standard 16-bit PCM mono WAV — the RIFF/fmt/data layout whisper.cpp's
  // own reader parses directly.
  function encodeWav(float32, sampleRate) {
    const numSamples = float32.length;
    const bytesPerSample = 2;
    const byteRate = sampleRate * bytesPerSample;
    const dataSize = numSamples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeStr(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);                  // PCM fmt chunk size
    view.setUint16(20, 1, true);                    // format = PCM
    view.setUint16(22, 1, true);                    // channels = mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, bytesPerSample, true);        // block align
    view.setUint16(34, bytesPerSample * 8, true);    // bits per sample
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += bytesPerSample;
    }
    return buffer;
  }

  // The one-shot convenience the capture flow actually calls: raw chunks
  // at whatever rate the mic gave them, out comes a ready-to-send 16kHz
  // WAV ArrayBuffer.
  function chunksToWav16k(chunks, fromRate) {
    const merged = concatFloat32(chunks);
    const resampled = resample(merged, fromRate, 16000);
    return encodeWav(resampled, 16000);
  }

  // Whisper returns one blob of text per recording; the lattice treats
  // each thought as its own node. This is a boundary heuristic, not a
  // real sentence parser — split after ./!/? followed by whitespace,
  // which tracks how people actually pause between distinct thoughts
  // closely enough to be useful. A recording with no terminal punctuation
  // (whisper sometimes omits it) comes back as one utterance, which is
  // the safe default over guessing at boundaries that aren't there.
  function splitUtterances(text) {
    return String(text || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return { resample, concatFloat32, encodeWav, chunksToWav16k, splitUtterances };
});
