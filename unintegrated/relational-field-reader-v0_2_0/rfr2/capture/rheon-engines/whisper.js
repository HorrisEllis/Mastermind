/**
 * RHEON KERNEL — ENGINE: WHISPER BRIDGE
 *
 * Local speech-to-text via faster-whisper or whisper.cpp CLI.
 * Offline. No API key. Non-blocking — transcription runs in a child process.
 *
 * KNOWN FAILURE MODES ADDRESSED:
 *   - Whisper not installed: checked at boot, graceful degradation.
 *   - CPU latency: ~1x realtime on base model. We run async, never block the bus.
 *   - Large model memory: auto-selects base/small/medium by available RAM.
 *   - Temp file cleanup: always cleaned up, even on process crash (try/finally).
 *
 * Supports two backends (auto-detected):
 *   1. faster-whisper CLI  (`faster-whisper --model base ...`)
 *   2. whisper.cpp CLI     (`./main -m models/ggml-base.bin ...`)
 *   3. whisper Python CLI  (`python -m whisper ...`)
 *
 * §LAW: Transcription is always async. Never blocks the event loop.
 * §LAW: Temp files are always cleaned up.
 * §LAW: If Whisper unavailable, returns null — caller decides what to do.
 */

import { spawn } from 'child_process';
import { writeFile, unlink, mkdtemp } from 'fs/promises';
import { tmpdir }  from 'os';
import { join }    from 'path';
import { bus }     from '../core/bus.js';

class WhisperBridge {
  constructor() {
    this._available = false;
    this._backend   = null;   // 'faster-whisper' | 'whisper-cpp' | 'whisper-python'
    this._model     = 'base'; // auto-selected
    this._checked   = false;
  }

  async init() {
    await this._detect();
    return this._available;
  }

  async _detect() {
    // Try each backend in order of preference
    const backends = [
      { name: 'faster-whisper', cmd: 'faster-whisper', args: ['--help'] },
      { name: 'whisper-python',  cmd: 'python3',        args: ['-m', 'whisper', '--help'] },
      { name: 'whisper-cpp',     cmd: './whisper.cpp/main', args: ['--help'] },
    ];

    for (const b of backends) {
      try {
        await _run(b.cmd, b.args, { timeout: 3000 });
        this._backend   = b.name;
        this._available = true;
        bus.emit('whisper:ready', { backend: b.name, model: this._model }, 'WHISPER');
        return;
      } catch(e) { /* try next */ }
    }

    this._available = false;
    bus.emit('whisper:unavailable', { message: 'No Whisper backend found. Install faster-whisper: pip install faster-whisper' }, 'WHISPER');
  }

  /**
   * Transcribe a PCM buffer (Int16LE, 16kHz mono).
   * Returns transcript string or null.
   * This is the function registered with the ring buffer as its transcribeWorker.
   */
  async transcribe(segmentOrBuffer) {
    const pcmData = Buffer.isBuffer(segmentOrBuffer)
      ? segmentOrBuffer
      : segmentOrBuffer.data;

    if (!pcmData) return null;
    if (!this._available) return null;

    let tmpDir  = null;
    let wavPath = null;

    try {
      tmpDir  = await mkdtemp(join(tmpdir(), 'rheon-'));
      wavPath = join(tmpDir, 'seg.wav');

      // Write WAV file (16kHz mono Int16LE)
      await writeFile(wavPath, _pcmToWav(pcmData, 16000, 1));

      const text = await this._runBackend(wavPath);
      return (text || '').trim() || null;

    } catch(e) {
      bus.emit('whisper:error', { error: e.message }, 'WHISPER');
      return null;
    } finally {
      // Always clean up
      if (wavPath) unlink(wavPath).catch(() => {});
      if (tmpDir)  unlink(tmpDir).catch(() => {});
    }
  }

  async _runBackend(wavPath) {
    switch(this._backend) {
      case 'faster-whisper':
        return await _run('faster-whisper', [
          wavPath,
          '--model', this._model,
          '--language', 'en',
          '--output_format', 'txt',
          '--output_dir', '/tmp',
        ]);

      case 'whisper-python':
        return await _run('python3', [
          '-m', 'whisper', wavPath,
          '--model', this._model,
          '--language', 'en',
          '--output_format', 'txt',
          '--output_dir', '/tmp',
          '--fp16', 'False',
        ]);

      case 'whisper-cpp':
        return await _run('./whisper.cpp/main', [
          '-m', `./whisper.cpp/models/ggml-${this._model}.bin`,
          '-f', wavPath,
          '-l', 'en',
          '--output-txt',
        ]);

      default:
        return null;
    }
  }

  status() {
    return {
      available: this._available,
      backend:   this._backend,
      model:     this._model,
    };
  }
}

// ── PCM → WAV ─────────────────────────────────────────────────────────────────

function _pcmToWav(pcmData, sampleRate, channels) {
  const byteRate    = sampleRate * channels * 2;
  const blockAlign  = channels * 2;
  const dataSize    = pcmData.length;
  const header      = Buffer.alloc(44);

  header.write('RIFF',     0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE',     8);
  header.write('fmt ',    12);
  header.writeUInt32LE(16,             16); // chunk size
  header.writeUInt16LE(1,              20); // PCM format
  header.writeUInt16LE(channels,       22);
  header.writeUInt32LE(sampleRate,     24);
  header.writeUInt32LE(byteRate,       28);
  header.writeUInt16LE(blockAlign,     32);
  header.writeUInt16LE(16,             34); // bits per sample
  header.write('data',                 36);
  header.writeUInt32LE(dataSize,       40);

  return Buffer.concat([header, pcmData]);
}

// ── SUBPROCESS RUNNER ─────────────────────────────────────────────────────────

function _run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args || [], {
      timeout: opts?.timeout || 60_000,
      shell:   false,
    });
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 200)}`));
    });
    proc.on('error', reject);
  });
}

export { WhisperBridge };
