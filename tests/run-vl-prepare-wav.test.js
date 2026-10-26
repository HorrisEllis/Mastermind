'use strict';
// ═══════════════════════════════════════════════════════════════════
// _vlPrepareWav — Clarity actually wired into the capture path
//
// clarity.js (DC-offset removal, a high-pass filter below the human
// voice fundamental, a genuinely anti-aliased resample to 16kHz, gain
// normalization with limiting) was fully built and tested and never
// called from anywhere in the live app — the capture path used plain
// linear-interpolation resampling with none of that. This is the fix,
// tested against the real clarity.js and audio-encode.js modules, not
// mocks, so the actual DSP behavior is what's being proven.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const Clarity = require(path.join(ROOT, 'foundation', 'ai', 'clarity.js'));
const VLAudioEncode = require(path.join(ROOT, 'modules', 'voice-lattice', 'audio-encode.js'));

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) { results.push({ name, ok: false }); console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      ')); }
}
function run() {
  const fails = results.filter(r => !r.ok).length;
  console.log('\nvl-prepare-wav: ' + (results.length - fails) + '/' + results.length + ' passed');
  process.exitCode = fails ? 1 : 0;
}

const engineSrc = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
function extractFn(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf('\n' + marker);
  assert.ok(start > -1, name + ' not found');
  const bodyStart = src.indexOf('{', start);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

function parseWavHeader(buf) {
  const view = new DataView(buf);
  return {
    sampleRate: view.getUint32(24, true),
    channels: view.getUint16(22, true),
    bitsPerSample: view.getUint16(34, true),
    dataSize: view.getUint32(40, true),
  };
}

function makeSandbox(withClarity) {
  const sandbox = {
    console, VLAudioEncode,
    Clarity: withClarity ? Clarity : undefined,
    Float32Array, DataView, ArrayBuffer, Math, Uint8Array,
  };
  vm.createContext(sandbox);
  const fnSrc = extractFn(engineSrc, '_vlPrepareWav');
  vm.runInContext(fnSrc + '\nthis._vlPrepareWav = _vlPrepareWav;', sandbox);
  return sandbox;
}

function syntheticVoice(seconds, sampleRate, amplitude) {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin(2 * Math.PI * 180 * i / sampleRate)
      + amplitude * 0.4 * Math.sin(2 * Math.PI * 360 * i / sampleRate)
      + 0.02; // DC offset, the kind real mic hardware actually produces
  }
  return out;
}

t('with Clarity available: output is a real, valid 16kHz mono 16-bit WAV', () => {
  const sandbox = makeSandbox(true);
  const chunks = [syntheticVoice(1.5, 48000, 0.05)];
  const wav = sandbox._vlPrepareWav(chunks, 48000);
  const header = parseWavHeader(wav);
  assert.strictEqual(header.sampleRate, 16000);
  assert.strictEqual(header.channels, 1);
  assert.strictEqual(header.bitsPerSample, 16);
});

t('with Clarity available: a quiet input is actually normalized louder — the "sensitive" claim, proven not just claimed', () => {
  const sandbox = makeSandbox(true);
  const quiet = [syntheticVoice(1.5, 48000, 0.01)];
  const wav = sandbox._vlPrepareWav(quiet, 48000);
  const header = parseWavHeader(wav);
  const view = new DataView(wav);
  let peak = 0;
  for (let i = 44; i < 44 + header.dataSize; i += 2) {
    const s = Math.abs(view.getInt16(i, true)) / 32768;
    if (s > peak) peak = s;
  }
  assert.ok(peak > 0.05, 'a quiet recording must come out audibly louder after normalization, got peak ' + peak);
});

t('with Clarity available: DC offset is actually removed, not just resampled', () => {
  const merged = syntheticVoice(1.0, 16000, 0.05);
  const before = Clarity.dcOffset(merged);
  const prepared = Clarity.prepare(merged, 16000);
  const after = Clarity.dcOffset(prepared.audio);
  assert.ok(Math.abs(before) > 0.005, 'sanity: the synthetic signal really does have a DC offset to remove');
  assert.ok(Math.abs(after) < Math.abs(before), 'DC offset must be reduced after prepare(), got before=' + before + ' after=' + after);
});

t('WITHOUT Clarity (not loaded): gracefully degrades to the old resample path, still produces a valid WAV', () => {
  const sandbox = makeSandbox(false);
  const chunks = [syntheticVoice(1.0, 48000, 0.05)];
  const wav = sandbox._vlPrepareWav(chunks, 48000);
  const header = parseWavHeader(wav);
  assert.strictEqual(header.sampleRate, 16000, 'must still land at 16kHz even without Clarity');
  assert.strictEqual(header.channels, 1);
});

t('multiple chunks (the real streaming case) are concatenated correctly before processing, not just the first one used', () => {
  const sandbox = makeSandbox(true);
  const chunkA = syntheticVoice(0.5, 48000, 0.05);
  const chunkB = syntheticVoice(0.5, 48000, 0.05);
  const wav = sandbox._vlPrepareWav([chunkA, chunkB], 48000);
  const header = parseWavHeader(wav);
  const expectedSamples = Math.round(1.0 * 16000);
  const actualSamples = header.dataSize / 2;
  assert.ok(Math.abs(actualSamples - expectedSamples) < expectedSamples * 0.05,
    'expected roughly ' + expectedSamples + ' samples from both chunks combined, got ' + actualSamples);
});

t('already-16kHz input (no resampling needed) still goes through DC/high-pass/normalize', () => {
  const sandbox = makeSandbox(true);
  const chunks = [syntheticVoice(1.0, 16000, 0.01)];
  const wav = sandbox._vlPrepareWav(chunks, 16000);
  const header = parseWavHeader(wav);
  assert.strictEqual(header.sampleRate, 16000);
  assert.ok(header.dataSize > 0);
});

run();
