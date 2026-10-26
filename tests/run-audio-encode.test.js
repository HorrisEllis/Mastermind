'use strict';
const assert = require('assert');
const path = require('path');
const VLAudioEncode = require(path.join(__dirname, '..', 'modules', 'voice-lattice', 'audio-encode.js'));

const results = [];
function t(name, fn) { results.push({ name, fn }); }

function run() {
  console.log('\nVOICE LATTICE — AUDIO ENCODE\n');
  let pass = 0;
  for (const { name, fn } of results) {
    try {
      fn();
      console.log('  \u2713 ' + name);
      pass++;
    } catch (e) {
      console.log('  \u2717 ' + name);
      console.log('      ' + e.message);
    }
  }
  console.log('\naudio-encode: ' + pass + '/' + results.length + ' passed');
  process.exitCode = pass === results.length ? 0 : 1;
}

// ── resample ─────────────────────────────────────────────────────────

t('resample: same rate returns the input unchanged', () => {
  const input = new Float32Array([0.1, 0.2, 0.3, 0.4]);
  const out = VLAudioEncode.resample(input, 16000, 16000);
  assert.strictEqual(out, input);
});

t('resample: downsampling halves the length for a 2:1 ratio', () => {
  const input = new Float32Array(1000).fill(0.5);
  const out = VLAudioEncode.resample(input, 32000, 16000);
  assert.strictEqual(out.length, 500);
});

t('resample: 48kHz -> 16kHz is a 3:1 ratio', () => {
  const input = new Float32Array(4800).fill(0.5);
  const out = VLAudioEncode.resample(input, 48000, 16000);
  assert.strictEqual(out.length, 1600);
});

t('resample: a constant signal stays constant (no ringing from interpolation)', () => {
  const input = new Float32Array(4800).fill(0.25);
  const out = VLAudioEncode.resample(input, 48000, 16000);
  assert.ok(out.every((v) => Math.abs(v - 0.25) < 1e-6));
});

t('resample: values stay within [-1, 1] for a full-range sine-ish signal', () => {
  const input = new Float32Array(4800).map((_, i) => Math.sin(i / 10));
  const out = VLAudioEncode.resample(input, 48000, 16000);
  assert.ok(out.every((v) => v >= -1.0001 && v <= 1.0001));
});

t('resample: never returns a zero-length buffer for non-empty input', () => {
  const input = new Float32Array(3).fill(0.1);
  const out = VLAudioEncode.resample(input, 48000, 16000);
  assert.ok(out.length >= 1);
});

// ── concatFloat32 ────────────────────────────────────────────────────

t('concatFloat32: stitches chunks in order with correct total length', () => {
  const chunks = [new Float32Array([1, 2]), new Float32Array([3, 4, 5]), new Float32Array([6])];
  const out = VLAudioEncode.concatFloat32(chunks);
  assert.deepStrictEqual(Array.from(out), [1, 2, 3, 4, 5, 6]);
});

t('concatFloat32: empty chunk list produces an empty buffer, not an error', () => {
  const out = VLAudioEncode.concatFloat32([]);
  assert.strictEqual(out.length, 0);
});

// ── encodeWav ────────────────────────────────────────────────────────

function parseWavHeader(buffer) {
  const view = new DataView(buffer);
  const readStr = (offset, len) => {
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(offset + i));
    return s;
  };
  return {
    riff: readStr(0, 4),
    fileSize: view.getUint32(4, true),
    wave: readStr(8, 4),
    fmt: readStr(12, 4),
    fmtChunkSize: view.getUint32(16, true),
    audioFormat: view.getUint16(20, true),
    numChannels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bitsPerSample: view.getUint16(34, true),
    dataTag: readStr(36, 4),
    dataSize: view.getUint32(40, true),
  };
}

t('encodeWav: produces a spec-correct RIFF/WAVE header', () => {
  const samples = new Float32Array(1600).fill(0);
  const buf = VLAudioEncode.encodeWav(samples, 16000);
  const h = parseWavHeader(buf);
  assert.strictEqual(h.riff, 'RIFF');
  assert.strictEqual(h.wave, 'WAVE');
  assert.strictEqual(h.fmt, 'fmt ');
  assert.strictEqual(h.dataTag, 'data');
  assert.strictEqual(h.audioFormat, 1, 'must be PCM (format code 1)');
  assert.strictEqual(h.numChannels, 1, 'must be mono');
  assert.strictEqual(h.sampleRate, 16000);
  assert.strictEqual(h.bitsPerSample, 16);
  assert.strictEqual(h.byteRate, 16000 * 2);
  assert.strictEqual(h.blockAlign, 2);
});

t('encodeWav: dataSize and file length match the actual sample count', () => {
  const samples = new Float32Array(500).fill(0.1);
  const buf = VLAudioEncode.encodeWav(samples, 16000);
  const h = parseWavHeader(buf);
  assert.strictEqual(h.dataSize, 500 * 2); // 16-bit = 2 bytes/sample
  assert.strictEqual(buf.byteLength, 44 + 500 * 2);
  assert.strictEqual(h.fileSize, 36 + 500 * 2);
});

t('encodeWav: sample values round-trip correctly through 16-bit quantization', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const buf = VLAudioEncode.encodeWav(samples, 16000);
  const view = new DataView(buf);
  const readback = [];
  for (let i = 0; i < samples.length; i++) readback.push(view.getInt16(44 + i * 2, true) / 0x8000);
  assert.ok(Math.abs(readback[0] - 0) < 0.001);
  assert.ok(Math.abs(readback[1] - 0.5) < 0.001);
  assert.ok(Math.abs(readback[2] - (-0.5)) < 0.001);
  assert.ok(Math.abs(readback[3] - 1) < 0.001);
  assert.ok(Math.abs(readback[4] - (-1)) < 0.001);
});

t('encodeWav: out-of-range input is clamped, not wrapped (no digital-clipping wraparound)', () => {
  const samples = new Float32Array([1.5, -1.5]); // shouldn't happen, but a bad upstream value must not corrupt the file
  const buf = VLAudioEncode.encodeWav(samples, 16000);
  const view = new DataView(buf);
  const a = view.getInt16(44, true);
  const b = view.getInt16(46, true);
  assert.strictEqual(a, 0x7fff);
  assert.strictEqual(b, -0x8000);
});

// ── chunksToWav16k: the full path together ───────────────────────────

t('chunksToWav16k: end-to-end at native 48kHz produces a valid 16kHz WAV', () => {
  const chunks = [new Float32Array(4800).fill(0.2), new Float32Array(4800).fill(-0.2)];
  const buf = VLAudioEncode.chunksToWav16k(chunks, 48000);
  const h = parseWavHeader(buf);
  assert.strictEqual(h.sampleRate, 16000);
  assert.strictEqual(h.dataSize, 3200 * 2); // 9600 samples at 48k -> 3200 at 16k
});

t('chunksToWav16k: already-16kHz input needs no resampling and lengths match exactly', () => {
  const chunks = [new Float32Array(1600).fill(0.1)];
  const buf = VLAudioEncode.chunksToWav16k(chunks, 16000);
  const h = parseWavHeader(buf);
  assert.strictEqual(h.dataSize, 1600 * 2);
});

// ── splitUtterances ────────────────────────────────────────────────

t('splitUtterances: splits on sentence-ending punctuation followed by whitespace', () => {
  const out = VLAudioEncode.splitUtterances('I need to call the dentist. Also pick up milk on the way home.');
  assert.deepStrictEqual(out, ['I need to call the dentist.', 'Also pick up milk on the way home.']);
});

t('splitUtterances: handles !, ?, and mixed punctuation', () => {
  const out = VLAudioEncode.splitUtterances('Wait, really? That changes everything! I need to think about this.');
  assert.strictEqual(out.length, 3);
});

t('splitUtterances: no terminal punctuation stays as one utterance', () => {
  const out = VLAudioEncode.splitUtterances('just a stream of thought with no punctuation at all');
  assert.deepStrictEqual(out, ['just a stream of thought with no punctuation at all']);
});

t('splitUtterances: empty or whitespace-only input returns an empty array, not [""]', () => {
  assert.deepStrictEqual(VLAudioEncode.splitUtterances(''), []);
  assert.deepStrictEqual(VLAudioEncode.splitUtterances('   '), []);
  assert.deepStrictEqual(VLAudioEncode.splitUtterances(null), []);
  assert.deepStrictEqual(VLAudioEncode.splitUtterances(undefined), []);
});

t('splitUtterances: does not split mid-number on a decimal point', () => {
  // Known limitation worth pinning down in a test rather than discovering
  // it later: this is a whitespace-triggered split, so "3.5 miles" is safe
  // (no space after the dot), but it is NOT a real sentence parser.
  const out = VLAudioEncode.splitUtterances('I ran 3.5 miles today. Felt good.');
  assert.deepStrictEqual(out, ['I ran 3.5 miles today.', 'Felt good.']);
});

run();
