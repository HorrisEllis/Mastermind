/**
 * RHEON KERNEL — ENGINE: MIC CAPTURE
 *
 * Zero npm dependencies. Pure Node.js child_process.spawn.
 * Outputs raw PCM Int16LE @ 16kHz mono → ring buffer.
 *
 * BACKENDS (auto-detected, in priority order):
 *
 *   ffmpeg      Best cross-platform. Windows/Mac/Linux.
 *               Windows: usually installed, uses DirectShow (dshow).
 *               Install: https://ffmpeg.org/download.html
 *               Or via winget: winget install Gyan.FFmpeg
 *
 *   sox         Classic. Windows/Mac/Linux.
 *               Windows: https://sox.sourceforge.net
 *               macOS:   brew install sox
 *               Linux:   apt install sox
 *
 *   arecord     Linux only. Built into most distros.
 *               apt install alsa-utils (usually pre-installed)
 *
 *   virtual     Fallback: generated sine wave at 440Hz.
 *               Kernel boots and all engines run — no real audio.
 *               Used for: testing, CI, machines without a mic.
 *               EMITS bus event so UI knows it's virtual.
 *
 * INVENTED: Virtual mic mode — the kernel never fails to start.
 * If no real audio backend is found, virtual mode runs so you
 * can still test the full pipeline, UI, BEP, export etc.
 *
 * §LAW: Zero npm deps.
 * §LAW: Kernel always boots. Mic unavailability = virtual mode, not crash.
 * §LAW: Every state change emits to bus.
 */

import { spawn }        from 'child_process';
import { platform }     from 'os';
import { bus }          from '../core/bus.js';
import { SAMPLE_RATE }  from '../core/buffer.js';

const CHUNK_MS    = 100;
const CHUNK_BYTES = Math.floor(SAMPLE_RATE * CHUNK_MS / 1000) * 2; // Int16LE

// ── BACKEND REGISTRY ──────────────────────────────────────────────────────────

function ffmpegArgs() {
  const os = platform();
  // Input device varies by platform
  const input = os === 'win32'
    ? ['-f', 'dshow',        '-i', 'audio=@device_cm_{33D9A762-90C8-11D0-BD43-00A0C911CE86}\\wave_{00000000-0000-0000-0000-000000000000}']
    : os === 'darwin'
    ? ['-f', 'avfoundation', '-i', ':0']
    : ['-f', 'alsa',         '-i', 'default'];
  return [
    ...input,
    '-ar', String(SAMPLE_RATE),
    '-ac', '1',
    '-f',  's16le',   // raw PCM Int16LE — exactly what ring buffer expects
    '-',              // stdout
  ];
}

// On Windows, ffmpeg needs the actual device name from `ffmpeg -list_devices true -f dshow -i dummy`
// We use a simpler default-device approach that works for most setups
function ffmpegArgsSimple() {
  const os = platform();
  if (os === 'win32') {
    return ['-f', 'dshow', '-i', 'audio=Microphone',
            '-ar', String(SAMPLE_RATE), '-ac', '1', '-f', 's16le', '-'];
  }
  if (os === 'darwin') {
    return ['-f', 'avfoundation', '-i', ':0',
            '-ar', String(SAMPLE_RATE), '-ac', '1', '-f', 's16le', '-'];
  }
  // Linux
  return ['-f', 'pulse', '-i', 'default',
          '-ar', String(SAMPLE_RATE), '-ac', '1', '-f', 's16le', '-'];
}

const BACKENDS = {
  ffmpeg: {
    cmd:    'ffmpeg',
    args:   ffmpegArgsSimple,
    probe:  ['-version'],
    notes:  'Install: https://ffmpeg.org  |  Windows: winget install Gyan.FFmpeg',
  },
  sox: {
    cmd:    'sox',
    args:   () => ['-d', '-r', String(SAMPLE_RATE), '-c', '1',
                   '-b', '16', '-e', 'signed-integer', '-t', 'raw', '-'],
    probe:  ['--version'],
    notes:  'Install: https://sox.sourceforge.net  |  macOS: brew install sox',
  },
  arecord: {
    cmd:    'arecord',
    args:   () => ['-f', 'S16_LE', '-r', String(SAMPLE_RATE), '-c', '1'],
    probe:  ['--version'],
    notes:  'Linux: sudo apt install alsa-utils',
  },
};

const PLATFORM_ORDER = {
  win32:  ['ffmpeg', 'sox'],
  darwin: ['ffmpeg', 'sox'],
  linux:  ['ffmpeg', 'arecord', 'sox'],
};

// ── MIC CAPTURE ───────────────────────────────────────────────────────────────

export class MicCapture {
  constructor(ringBuffer) {
    this._buffer    = ringBuffer;
    this._proc      = null;
    this._virtual   = null;   // virtual mode interval
    this._running   = false;
    this._backend   = null;
    this._isVirtual = false;
    this._retries   = 0;
    this._maxRetry  = 3;
    this._rmsSmooth = 0;
    this._silenceMs = 0;
    this._lastTs    = null;
  }

  async init() {
    this._backend = await _detectBackend();
    if (!this._backend) {
      // No real backend — virtual mode available
      this._isVirtual = true;
      bus.emit('mic:init', {
        backend:   'virtual',
        available: true,
        virtual:   true,
        platform:  platform(),
        message:   _installInstructions(),
      }, 'MIC');
    } else {
      bus.emit('mic:init', {
        backend:   this._backend,
        available: true,
        virtual:   false,
        platform:  platform(),
      }, 'MIC');
    }
    return true; // always returns true — virtual mode means kernel always boots
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._retries = 0;

    if (this._isVirtual) {
      this._startVirtual();
    } else {
      this._spawn();
    }
  }

  stop() {
    this._running = false;
    if (this._proc) {
      try { this._proc.kill(); } catch(e) {}
      this._proc = null;
    }
    if (this._virtual) {
      clearInterval(this._virtual);
      this._virtual = null;
    }
    bus.emit('mic:stopped', { virtual: this._isVirtual }, 'MIC');
  }

  // ── REAL MIC ───────────────────────────────────────────────────

  _spawn() {
    const def  = BACKENDS[this._backend];
    const args = def.args();

    this._proc = spawn(def.cmd, args, {
      stdio:       ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let partial = Buffer.alloc(0);

    this._proc.stdout.on('data', chunk => {
      this._emitMetrics(chunk);
      partial = Buffer.concat([partial, chunk]);
      while (partial.length >= CHUNK_BYTES) {
        this._buffer.push(partial.slice(0, CHUNK_BYTES));
        partial = partial.slice(CHUNK_BYTES);
      }
    });

    this._proc.stderr.on('data', d => {
      const msg = d.toString().trim();
      // ffmpeg/sox print progress to stderr — suppress routine lines
      if (msg && !msg.includes('size=') && !msg.includes('time=') &&
          !msg.startsWith('In:') && !msg.includes('pts')) {
        bus.emit('mic:log', { message: msg.slice(0, 160) }, 'MIC');
      }
    });

    this._proc.on('close', code => {
      if (!this._running) return;
      this._retries++;
      if (this._retries <= this._maxRetry) {
        bus.emit('mic:restart', { code, attempt: this._retries, backend: this._backend }, 'MIC');
        setTimeout(() => this._spawn(), 1000 * this._retries);
      } else {
        // Real mic failed after retries — fall back to virtual
        this._running   = false;
        this._isVirtual = true;
        bus.emit('mic:fallback', {
          message: `${this._backend} failed after ${this._maxRetry} retries — switching to virtual mode.`,
        }, 'MIC');
        this._running = true;
        this._startVirtual();
      }
    });

    this._proc.on('error', err => {
      bus.emit('mic:error', { error: err.message, backend: this._backend }, 'MIC');
      // Fall back to virtual on spawn error
      this._isVirtual = true;
      this._startVirtual();
    });

    bus.emit('mic:started', {
      backend:    this._backend,
      sampleRate: SAMPLE_RATE,
      virtual:    false,
    }, 'MIC');
  }

  // ── VIRTUAL MIC (sine wave generator) ──────────────────────────
  // Invented: generates 440Hz sine wave into the ring buffer.
  // The entire engine stack runs — nodes can be committed manually or via pipe.
  // UI shows activity. BEP runs. Useful for testing without a mic.

  _startVirtual() {
    let phase = 0;
    const freq    = 440;
    const amp     = 0.1;
    const samples = CHUNK_BYTES / 2;

    this._virtual = setInterval(() => {
      if (!this._running) return;
      const buf = Buffer.alloc(CHUNK_BYTES);
      for (let i = 0; i < samples; i++) {
        const s = Math.sin(phase) * amp;
        phase  += (2 * Math.PI * freq) / SAMPLE_RATE;
        if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
        buf.writeInt16LE(Math.round(s * 32767), i * 2);
      }
      this._buffer.push(buf);
      // Emit minimal metrics so UI stays alive
      bus.emit('audio:metrics', {
        rms: amp * 0.707, zcr: 0.02, pitch: freq, silenceMs: 0, ts: Date.now(), virtual: true,
      }, 'MIC');
    }, CHUNK_MS);

    bus.emit('mic:started', {
      backend:    'virtual',
      sampleRate: SAMPLE_RATE,
      virtual:    true,
      message:    'Virtual mic active. Commit nodes manually or via: rheon commit "text"',
    }, 'MIC');
  }

  // ── METRICS ────────────────────────────────────────────────────

  _emitMetrics(chunk) {
    const rms   = _rms(chunk);
    const zcr   = _zcr(chunk);
    const pitch = _pitch(chunk);
    const now   = Date.now();

    this._rmsSmooth = this._rmsSmooth * 0.8 + rms * 0.2;

    if (this._rmsSmooth < 0.005) {
      this._silenceMs += this._lastTs ? now - this._lastTs : 0;
    } else {
      if (this._silenceMs > 500) {
        bus.emit('mic:silence_end', { silenceDuration: this._silenceMs }, 'MIC');
      }
      this._silenceMs = 0;
    }
    this._lastTs = now;

    bus.emit('audio:metrics', {
      rms:       parseFloat(rms.toFixed(4)),
      zcr:       parseFloat(zcr.toFixed(4)),
      pitch,
      silenceMs: this._silenceMs,
      ts:        now,
      virtual:   false,
    }, 'MIC');
  }

  status() {
    return {
      running:   this._running,
      backend:   this._isVirtual ? 'virtual' : this._backend,
      available: true,
      virtual:   this._isVirtual,
      rms:       parseFloat(this._rmsSmooth.toFixed(4)),
      silenceMs: this._silenceMs,
      retries:   this._retries,
      platform:  platform(),
    };
  }
}

// ── DETECTION ─────────────────────────────────────────────────────────────────

async function _detectBackend() {
  const os    = platform();
  const order = PLATFORM_ORDER[os] || ['ffmpeg', 'sox'];
  for (const name of order) {
    const def = BACKENDS[name];
    if (!def) continue;
    try {
      await _probe(def.cmd, def.probe);
      return name;
    } catch(e) { /* try next */ }
  }
  return null;
}

function _probe(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args || [], {
      timeout:     3000,
      stdio:       ['ignore', 'ignore', 'ignore'],
      windowsHide: true,
    });
    p.on('close', c => (c === 0 || c === 1) ? resolve() : reject(new Error(String(c))));
    p.on('error', reject);
  });
}

// ── AUDIO MATH ────────────────────────────────────────────────────────────────

function _rms(buf) {
  let sum = 0, n = 0;
  for (let i = 0; i + 1 < buf.length; i += 2) {
    const s = buf.readInt16LE(i) / 32768;
    sum += s * s; n++;
  }
  return n > 0 ? Math.sqrt(sum / n) : 0;
}

function _zcr(buf) {
  if (buf.length < 4) return 0;
  let crossings = 0, prev = buf.readInt16LE(0) >= 0;
  for (let i = 2; i + 1 < buf.length; i += 2) {
    const cur = buf.readInt16LE(i) >= 0;
    if (cur !== prev) crossings++;
    prev = cur;
  }
  return crossings / (buf.length / 2);
}

function _pitch(buf) {
  const samples = [];
  for (let i = 0; i + 1 < Math.min(buf.length, 4096); i += 2) {
    samples.push(buf.readInt16LE(i) / 32768);
  }
  if (samples.length < 64) return 0;
  const lo = Math.floor(SAMPLE_RATE / 800);
  const hi = Math.min(Math.floor(SAMPLE_RATE / 60), Math.floor(samples.length / 2));
  let best = -1, bestLag = lo;
  for (let lag = lo; lag < hi; lag++) {
    let s = 0;
    for (let k = 0; k < samples.length - lag; k++) s += samples[k] * samples[k + lag];
    if (s > best) { best = s; bestLag = lag; }
  }
  return best > 0.05 ? Math.round(SAMPLE_RATE / bestLag) : 0;
}

// ── INSTALL INSTRUCTIONS ──────────────────────────────────────────────────────

function _installInstructions() {
  const os = platform();
  if (os === 'win32') return [
    'No audio backend found. For real mic capture, install ONE of:',
    '  ffmpeg (recommended): winget install Gyan.FFmpeg',
    '             or download: https://ffmpeg.org/download.html#build-windows',
    '  sox:                   https://sox.sourceforge.net',
    'Running in virtual mode until then.',
  ].join('\n');
  if (os === 'darwin') return [
    'No audio backend found. Install: brew install ffmpeg',
    'Running in virtual mode until then.',
  ].join('\n');
  return [
    'No audio backend found. Install: sudo apt install ffmpeg',
    'Running in virtual mode until then.',
  ].join('\n');
}
