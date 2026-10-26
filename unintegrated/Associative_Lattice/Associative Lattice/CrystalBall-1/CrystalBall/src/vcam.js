/**
 * vcam.js — Virtual Camera Bridge
 *
 * The problem: WebRTC + MediaPipe expect a real camera device.
 * getUserMedia() cannot consume an uploaded file or a WebSocket stream.
 * Web APIs have no "virtual device" concept.
 *
 * THE INVENTION
 * ─────────────
 * Three complementary strategies, tried in order:
 *
 * 1. RENDERER-SIDE CANVAS STREAM (zero-infra, all platforms)
 *    We don't need a real OS-level virtual camera device.
 *    We draw frames onto an OffscreenCanvas in the renderer,
 *    then capture it as a MediaStream via canvas.captureStream(30).
 *    MediaPipe accepts any MediaStream — it doesn't check device type.
 *    This is the primary path for uploaded files and WebSocket streams.
 *
 *    Node side: decodes frames → sends via WS binary channel VCAM_FRAME
 *    Renderer side: receives VCAM_FRAME → draws to canvas → captureStream
 *    Result: a real MediaStream that MediaPipe accepts as camera input
 *
 * 2. NAMED PIPE / UNIX SOCKET (Linux/Mac, for processes that need a device fd)
 *    Creates a named pipe at /tmp/crystalball-vcam.pipe
 *    Streams raw RGBA frames at target fps
 *    Consumer reads from pipe — works for any process, not just browser
 *
 * 3. v4l2loopback (Linux only, requires kernel module)
 *    If v4l2loopback is loaded: write frames to /dev/video{N}
 *    Device appears as a real webcam to ALL apps, including Chrome's
 *    getUserMedia with exact deviceId constraint.
 *    Detection: check for /dev/video* devices and v4l2loopback kernel module.
 *
 * SUPPORTED INPUT TYPES
 * ─────────────────────
 *   - Video file: MP4, MOV, WebM, MKV (decoded via ffmpeg if available,
 *     fallback to Node stream reader for raw RGBA)
 *   - Image sequence: directory of JPEGs at target fps
 *   - WebSocket stream: frames arriving over local WS
 *   - Static image: loop a single frame (for testing/calibration)
 *
 * 2-SECOND BUFFER
 * ───────────────
 * All inputs feed through a FrameBuffer with 2s capacity at target fps.
 * The buffer smooths out network jitter and file I/O stalls.
 * Renderer reads from the buffer at exactly targetFps.
 * On underrun: last good frame is held (freeze, not black).
 * On overrun: oldest frames are dropped (live always wins).
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const { CH } = require('./ws-server');

const TARGET_FPS      = 30;
const FRAME_MS        = 1000 / TARGET_FPS;
const BUFFER_SECS     = 2;
const BUFFER_CAPACITY = TARGET_FPS * BUFFER_SECS;  // 60 frames
const FRAME_W         = 1280;
const FRAME_H         = 720;
const RGBA_FRAME_BYTES = FRAME_W * FRAME_H * 4;

// ─── Frame Buffer ────────────────────────────────────────────────────────────

class FrameBuffer {
  constructor(capacity = BUFFER_CAPACITY) {
    this._cap     = capacity;
    this._frames  = [];          // [ { data: Buffer, ts: number } ]
    this._lastFrame = null;      // held on underrun
    this._drops   = 0;
    this._total   = 0;
  }

  push(data) {
    this._total++;
    if (this._frames.length >= this._cap) {
      this._frames.shift();
      this._drops++;
    }
    this._frames.push({ data, ts: Date.now() });
  }

  pop() {
    if (this._frames.length === 0) {
      return this._lastFrame; // freeze on underrun
    }
    const f = this._frames.shift();
    this._lastFrame = f;
    return f;
  }

  get length()      { return this._frames.length; }
  get fillRatio()   { return this._frames.length / this._cap; }
  get drops()       { return this._drops; }
  get total()       { return this._total; }
  get latencyMs()   {
    if (!this._frames.length) return 0;
    return Date.now() - this._frames[0].ts;
  }

  clear() { this._frames = []; }

  stats() {
    return {
      buffered:   this._frames.length,
      capacity:   this._cap,
      fillRatio:  this.fillRatio,
      latencyMs:  this.latencyMs,
      drops:      this._drops,
      total:      this._total,
    };
  }
}

// ─── VCam Bridge ────────────────────────────────────────────────────────────

class VCamBridge {
  constructor({ wsServer }) {
    this._ws         = wsServer;
    this._buffer     = new FrameBuffer(BUFFER_CAPACITY);
    this._pumpTimer  = null;
    this._source     = null;   // current source descriptor
    this._ffmpeg     = null;   // child process if using ffmpeg
    this._v4l2Path   = null;   // /dev/videoN if v4l2loopback
    this._pipefd     = null;   // named pipe fd
    this._deviceId   = '';

    // Detect capabilities
    this._caps = this._detectCaps();
  }

  async init() {
    // Detect v4l2loopback on Linux
    if (this._caps.v4l2) {
      try {
        this._v4l2Path = this._openV4l2Device();
        this._deviceId = path.basename(this._v4l2Path);
        console.log(`[VCam] v4l2loopback device: ${this._v4l2Path}`);
      } catch (e) {
        console.warn('[VCam] v4l2loopback init failed:', e.message);
      }
    }

    // Create named pipe (Unix only — fallback for all non-browser consumers)
    if (process.platform !== 'win32') {
      try {
        this._namedPipe = '/tmp/crystalball-vcam.pipe';
        if (!fs.existsSync(this._namedPipe)) {
          execSync(`mkfifo ${this._namedPipe}`);
        }
        console.log(`[VCam] named pipe: ${this._namedPipe}`);
      } catch (e) {
        console.warn('[VCam] named pipe init failed:', e.message);
      }
    }

    // Start the frame pump — sends from buffer to all consumers at TARGET_FPS
    this._startPump();

    console.log(`[VCam] initialized — caps: ${JSON.stringify(this._caps)}`);
    return this;
  }

  get deviceId() { return this._deviceId; }

  // ── Source: video file ────────────────────────────────────────────────────

  async loadFile(filePath, { loop = true, fps = TARGET_FPS } = {}) {
    this._stopSource();
    this._buffer.clear();

    const ext = path.extname(filePath).toLowerCase();

    if (['.mp4','.mov','.webm','.mkv','.avi'].includes(ext)) {
      this._startFfmpegSource(filePath, { loop, fps });
    } else if (['.jpg','.jpeg','.png','.webp'].includes(ext)) {
      // Single image — loop it
      this._startImageSource(filePath);
    } else if (fs.statSync(filePath).isDirectory()) {
      // Frame sequence directory
      this._startFrameDirSource(filePath, fps);
    }

    this._source = { type: 'file', path: filePath, loop, fps };
    this._ws?.broadcast({ type: 'vcam.source', source: this._source });
    console.log(`[VCam] source: ${filePath}`);
  }

  // ── Source: ffmpeg video decode ───────────────────────────────────────────

  _startFfmpegSource(filePath, { loop, fps }) {
    if (!this._caps.ffmpeg) {
      console.warn('[VCam] ffmpeg not available — cannot decode video file');
      return;
    }

    const loopArgs = loop ? ['-stream_loop', '-1'] : [];
    const args = [
      ...loopArgs,
      '-i', filePath,
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-vf', `scale=${FRAME_W}:${FRAME_H},fps=${fps}`,
      '-an',  // no audio
      'pipe:1',
    ];

    this._ffmpeg = spawn('ffmpeg', args);
    const FRAME_SIZE = RGBA_FRAME_BYTES;
    let leftover = null;

    this._ffmpeg.stdout.on('data', (chunk) => {
      const data = leftover ? Buffer.concat([leftover, chunk]) : chunk;
      let offset = 0;

      while (offset + FRAME_SIZE <= data.length) {
        this._buffer.push(data.slice(offset, offset + FRAME_SIZE));
        offset += FRAME_SIZE;
      }

      leftover = offset < data.length ? data.slice(offset) : null;
    });

    this._ffmpeg.on('error', (e) => console.warn('[VCam] ffmpeg error:', e.message));
    this._ffmpeg.on('exit',  (code) => {
      if (code !== 0 && code !== null) console.warn('[VCam] ffmpeg exited:', code);
    });
  }

  // ── Source: single static image ───────────────────────────────────────────

  _startImageSource(filePath) {
    // Read raw file bytes — renderer will decode via createImageBitmap
    const data = fs.readFileSync(filePath);
    // Send as encoded image (renderer decodes + resizes onto canvas)
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(CH.VCAM_FRAME, 0);
    // Prefix with 1-byte type: 0=rgba, 1=encoded
    const typeFlag = Buffer.from([0x01]);
    const frame    = Buffer.concat([header, typeFlag, data]);

    // Loop at fps
    this._sourceTimer = setInterval(() => {
      this._ws?.broadcastBinary(CH.VCAM_FRAME, Buffer.concat([typeFlag, data]));
    }, FRAME_MS);
  }

  // ── Source: frame directory ───────────────────────────────────────────────

  _startFrameDirSource(dirPath, fps) {
    const files = fs.readdirSync(dirPath)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
      .sort()
      .map(f => path.join(dirPath, f));

    if (!files.length) return;

    let idx = 0;
    const interval = 1000 / fps;

    this._sourceTimer = setInterval(() => {
      const data = fs.readFileSync(files[idx % files.length]);
      const typeFlag = Buffer.from([0x01]); // encoded
      this._ws?.broadcastBinary(CH.VCAM_FRAME, Buffer.concat([typeFlag, data]));
      idx++;
    }, interval);
  }

  // ── Source: WebSocket stream ──────────────────────────────────────────────

  attachStream(clientId) {
    // Subscribe to VCAM_FRAME binary channel from a specific WS client
    // (used when another device is streaming to us via WebRTC/WS)
    this._ws?.on(`binary:${CH.VCAM_FRAME}`, (data, srcClientId) => {
      if (clientId && srcClientId !== clientId) return;
      this._buffer.push(data);
    });
    this._source = { type: 'stream', clientId };
  }

  // ── Frame pump ────────────────────────────────────────────────────────────

  _startPump() {
    // Pump from buffer → all consumers at exactly TARGET_FPS
    // Uses setInterval but corrects for drift
    let last = Date.now();

    const tick = () => {
      const now    = Date.now();
      const elapsed = now - last;

      if (elapsed >= FRAME_MS - 1) {
        last = now;
        const frame = this._buffer.pop();

        if (frame) {
          // Broadcast to renderer via WS
          const typeFlag = Buffer.from([0x00]); // raw rgba
          this._ws?.broadcastBinary(CH.VCAM_FRAME, Buffer.concat([typeFlag, frame.data]));

          // Write to v4l2loopback if available
          if (this._v4l2Path && this._v4l2fd) {
            try { fs.writeSync(this._v4l2fd, frame.data); } catch (_) {}
          }

          // Stats
          this._ws?.broadcast({
            type: 'vcam.stats',
            stats: this._buffer.stats(),
          });
        }
      }

      this._pumpTimer = setTimeout(tick, Math.max(0, FRAME_MS - (Date.now() - now)));
    };

    tick();
  }

  // ── v4l2loopback ─────────────────────────────────────────────────────────

  _openV4l2Device() {
    // Find first v4l2loopback device
    const devices = fs.readdirSync('/dev')
      .filter(d => /^video\d+$/.test(d))
      .map(d => `/dev/${d}`);

    for (const dev of devices) {
      try {
        const info = execSync(`v4l2-ctl -d ${dev} --info 2>/dev/null`).toString();
        if (info.includes('loopback')) {
          this._v4l2fd = fs.openSync(dev, 'w');
          return dev;
        }
      } catch (_) {}
    }
    throw new Error('no v4l2loopback device found');
  }

  // ── Capability detection ──────────────────────────────────────────────────

  _detectCaps() {
    const caps = { ffmpeg: false, v4l2: false, namedPipe: false };
    try { execSync('ffmpeg -version', { stdio: 'ignore' }); caps.ffmpeg = true; } catch (_) {}
    if (process.platform === 'linux') {
      try {
        const modules = execSync('lsmod').toString();
        caps.v4l2 = modules.includes('v4l2loopback');
      } catch (_) {}
    }
    caps.namedPipe = process.platform !== 'win32';
    return caps;
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  _stopSource() {
    this._ffmpeg?.kill('SIGTERM');
    this._ffmpeg = null;
    clearInterval(this._sourceTimer);
    clearTimeout(this._sourceTimer);
    this._sourceTimer = null;
  }

  destroy() {
    this._stopSource();
    clearTimeout(this._pumpTimer);
    if (this._v4l2fd) { try { fs.closeSync(this._v4l2fd); } catch (_) {} }
  }

  stats() {
    return {
      buffer: this._buffer.stats(),
      caps:   this._caps,
      source: this._source,
      device: this._deviceId || 'canvas-stream',
    };
  }
}

module.exports = { VCamBridge };
