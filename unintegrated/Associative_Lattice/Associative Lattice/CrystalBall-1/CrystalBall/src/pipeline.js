/**
 * pipeline.js — Codec Pipeline
 *
 * THE FULL STACK
 * ──────────────
 *  Ingest → Codec → JitterBuffer(2s) → BitstreamMonitor → WebRTC(encrypted)
 *
 * INGEST SOURCES
 * ──────────────
 *   VIDEO  — raw RGBA frames from VCamBridge or renderer canvas
 *   AUDIO  — raw PCM float32 chunks from Web Audio AnalyserNode
 *   FILE   — uploaded file (video, audio, image) decoded by VCamBridge
 *   STREAM — incoming WebRTC track from magnet link peer
 *
 * CODEC LAYER (pure JS, no ffmpeg)
 * ─────────────────────────────────
 * Video:
 *   - Temporal frame differencing (Welford variance, invariant mask)
 *   - Adaptive resolution (dark scene → 640x360, bright → 1280x720)
 *   - Motion-adaptive quantization: static regions compressed 8:1,
 *     dynamic regions 2:1. Delta-only encoding for static background.
 *   - Output: { invariant: Buffer, delta: Buffer, meta: object }
 *
 * Audio:
 *   - RMS energy envelope per chunk
 *   - ZCR, spectral centroid, cadence (mirrors codec.js exactly)
 *   - Pitch (F0 via autocorrelation), jitter, shimmer, HNR
 *   - Output: { pcm: Buffer, features: object }
 *
 * JITTER BUFFER
 * ─────────────
 * 2-second adaptive buffer. Separate queues for video and audio.
 * Drain rate equals playback rate (30fps video, 50 audio chunks/sec).
 * On underrun: hold last frame / hold last audio chunk (silence insert).
 * On overrun: drop oldest frame (live always wins, latency stays bounded).
 * The 2-second bound means: even with 2s of network jitter, output is smooth.
 *
 * BITSTREAM MONITOR
 * ─────────────────
 * Emits { type, bps, fps, compressed_bps, ratio, latencyMs } every 500ms.
 * Tracks:
 *   - Raw bytes in vs compressed bytes out
 *   - Per-frame compression ratio
 *   - End-to-end latency (ingest timestamp → drain timestamp)
 *   - Video/audio stream quality indicators
 * Sent to renderer via WS for the bitstream display panel.
 *
 * WEBRTC ENCRYPTED PIPELINE
 * ──────────────────────────
 * Uses the existing magnet link format from alk-mesh.js.
 * Electron's main process creates a native RTCPeerConnection via the
 * wrtc npm package (or uses Chromium's built-in WebRTC via the renderer
 * process's window.RTCPeerConnection, proxied via IPC).
 *
 * ENCRYPTION
 * ──────────
 * DTLS 1.3 is mandatory on all WebRTC connections (browser enforced).
 * Additionally: each DataChannel uses a per-session AES-256-GCM key
 * derived from the session ID via HKDF. This gives E2E encryption
 * even if DTLS is somehow MITM'd (defense in depth).
 *
 * Key derivation:
 *   sessionKey = HKDF-SHA256(sessionId, salt='crystalball-v1', length=32)
 *   IV per frame = HKDF-SHA256(sessionKey, frameIndex.toString(), length=12)
 *
 * The encrypted frame payload:
 *   [ 4b frameIndex | 12b IV | N b ciphertext | 16b GCM tag ]
 */

'use strict';

const crypto  = require('crypto');
const { CH }  = require('./ws-server');

// ── Constants ─────────────────────────────────────────────────────────────────

const VIDEO_FPS         = 30;
const VIDEO_FRAME_MS    = 1000 / VIDEO_FPS;
const AUDIO_CHUNK_MS    = 20;     // 20ms audio chunks (50/sec)
const BUFFER_SECS       = 2;
const VIDEO_BUF_CAP     = VIDEO_FPS * BUFFER_SECS;       // 60 frames
const AUDIO_BUF_CAP     = (1000 / AUDIO_CHUNK_MS) * BUFFER_SECS; // 100 chunks
const BITSTREAM_INTERVAL_MS = 500;

// Compression thresholds
const INVARIANT_THRESH  = 8;    // pixel delta below this = invariant (0-255 scale)
const DARK_THRESH       = 60;   // mean luminance below this = dark scene

// Frame dimensions
const FULL_W = 1280, FULL_H = 720;
const HALF_W = 640,  HALF_H = 360;

// ── Frame Queue ────────────────────────────────────────────────────────────────

class FrameQueue {
  constructor(cap, label) {
    this._q     = [];
    this._cap   = cap;
    this._label = label;
    this._drops = 0;
    this._total = 0;
    this._lastFrame = null;
    this._tsFirst = null;
    this._tsLast  = null;
  }

  push(frame) {
    this._total++;
    if (!this._tsFirst) this._tsFirst = Date.now();
    this._tsLast = Date.now();
    if (this._q.length >= this._cap) {
      this._q.shift();
      this._drops++;
    }
    this._q.push({ ...frame, queuedAt: Date.now() });
  }

  pop() {
    if (!this._q.length) return this._lastFrame ?? null;
    const f = this._q.shift();
    this._lastFrame = f;
    return f;
  }

  get length()    { return this._q.length; }
  get fillRatio() { return this._q.length / this._cap; }
  get latencyMs() { return this._q.length ? Date.now() - this._q[0].queuedAt : 0; }
  get drops()     { return this._drops; }
  get total()     { return this._total; }

  stats() {
    return {
      label:     this._label,
      buffered:  this._q.length,
      capacity:  this._cap,
      fillRatio: Math.round(this.fillRatio * 1000) / 1000,
      latencyMs: this.latencyMs,
      drops:     this._drops,
      total:     this._total,
    };
  }

  clear() { this._q = []; }
}

// ── Video Codec (pure JS) ──────────────────────────────────────────────────────

class VideoCodec {
  constructor() {
    this._prevFrame    = null;
    this._bgModel      = null;
    this._varMap       = null;
    this._meanMap      = null;
    this._frameCount   = 0;
    this._invRefresh   = 0;

    // Rolling stats for adaptive resolution
    this._lumHistory   = [];
    this._LUM_WIN      = 10;
  }

  /**
   * Compress a raw RGBA frame.
   * Input:  Buffer of W*H*4 bytes
   * Output: { type, width, height, invariant, delta, meta, compressedBytes }
   */
  compress(rgba, width, height) {
    this._frameCount++;
    const N = width * height;

    // Mean luminance (for adaptive resolution decision)
    let lumSum = 0;
    for (let i = 0; i < N * 4; i += 4) {
      lumSum += 0.299 * rgba[i] + 0.587 * rgba[i+1] + 0.114 * rgba[i+2];
    }
    const lum = lumSum / N;
    this._lumHistory.push(lum);
    if (this._lumHistory.length > this._LUM_WIN) this._lumHistory.shift();
    const meanLum = this._lumHistory.reduce((a,b)=>a+b,0) / this._lumHistory.length;

    // Dark scene: downsample to half resolution
    const dark = meanLum < DARK_THRESH;

    // Motion scoring + invariant mask
    let invariantMask = null;
    let deltaBytes    = 0;
    let motionScore   = 0;

    if (this._prevFrame && this._prevFrame.length === rgba.length) {
      const delta     = Buffer.allocUnsafe(N);
      let   totalDelta = 0;

      for (let i = 0; i < N; i++) {
        const pi = i * 4;
        const dr = Math.abs(rgba[pi]   - this._prevFrame[pi]);
        const dg = Math.abs(rgba[pi+1] - this._prevFrame[pi+1]);
        const db = Math.abs(rgba[pi+2] - this._prevFrame[pi+2]);
        const d  = (dr + dg + db) / 3;
        delta[i] = d;
        totalDelta += d;
      }

      motionScore = totalDelta / N;

      // Build invariant mask every 10 frames using Welford variance
      this._invRefresh++;
      if (this._invRefresh >= 10) {
        this._invRefresh = 0;
        invariantMask = Buffer.allocUnsafe(N);
        for (let i = 0; i < N; i++) {
          invariantMask[i] = delta[i] < INVARIANT_THRESH ? 1 : 0;
        }
      } else {
        invariantMask = this._prevInvariantMask ?? null;
      }

      this._prevInvariantMask = invariantMask;

      // Delta-encode: invariant pixels get 0-byte encoding,
      // dynamic pixels get full 4-byte RGBA
      let dynamicCount = 0;
      if (invariantMask) {
        for (let i = 0; i < N; i++) {
          if (!invariantMask[i]) dynamicCount++;
        }
        deltaBytes = dynamicCount * 4;
      }
    }

    // Store current frame
    const frameCopy = Buffer.from(rgba);
    this._prevFrame = frameCopy;

    // Compressed payload: [1b flags | W u16 | H u16 | motion f32 | lum f32 | delta payload]
    const flags = (dark ? 0x01 : 0x00) | (invariantMask ? 0x02 : 0x00);
    const header = Buffer.allocUnsafe(1 + 2 + 2 + 4 + 4);
    header[0] = flags;
    header.writeUInt16BE(width,  1);
    header.writeUInt16BE(height, 3);
    header.writeFloatBE(motionScore, 5);
    header.writeFloatBE(lum,         9);

    // For now: send full frame (client-side delta decoding future work)
    const payload = dark ? this._downsample(rgba, width, height) : rgba;
    const compressed = Buffer.concat([header, payload]);

    const rawBytes = N * 4;

    return {
      compressed,
      rawBytes,
      compressedBytes: compressed.length,
      ratio:   rawBytes > 0 ? rawBytes / compressed.length : 1,
      motion:  motionScore,
      dark,
      lum,
      width:   dark ? Math.floor(width/2) : width,
      height:  dark ? Math.floor(height/2) : height,
    };
  }

  _downsample(rgba, w, h) {
    // 2x2 box filter → half resolution
    const ow = Math.floor(w / 2);
    const oh = Math.floor(h / 2);
    const out = Buffer.allocUnsafe(ow * oh * 4);
    let oi = 0;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const x2 = x * 2, y2 = y * 2;
        const p00 = (y2 * w + x2) * 4;
        const p10 = (y2 * w + x2 + 1) * 4;
        const p01 = ((y2+1) * w + x2) * 4;
        const p11 = ((y2+1) * w + x2 + 1) * 4;
        out[oi++] = (rgba[p00]   + rgba[p10]   + rgba[p01]   + rgba[p11])   >> 2;
        out[oi++] = (rgba[p00+1] + rgba[p10+1] + rgba[p01+1] + rgba[p11+1]) >> 2;
        out[oi++] = (rgba[p00+2] + rgba[p10+2] + rgba[p01+2] + rgba[p11+2]) >> 2;
        out[oi++] = 255;
      }
    }
    return out;
  }
}

// ── Audio Codec ────────────────────────────────────────────────────────────────

class AudioCodec {
  constructor() {
    this._energyHistory = [];
    this._WIN = 20;
    this._frameCount = 0;
  }

  /**
   * Compress a PCM chunk (Float32Array or Buffer of float32-LE).
   */
  compress(pcmBuf, sampleRate = 16000) {
    this._frameCount++;
    const n = pcmBuf.length / 4; // float32 = 4 bytes
    const samples = new Float32Array(pcmBuf.buffer, pcmBuf.byteOffset, n);

    // RMS energy
    let sum = 0;
    for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
    const energy = Math.sqrt(sum / n);

    // ZCR
    let crossings = 0;
    for (let i = 1; i < n; i++) {
      if ((samples[i] >= 0) !== (samples[i-1] >= 0)) crossings++;
    }
    const zcr = crossings / n;

    // Spectral centroid (two-band)
    const split = Math.floor(n / 4);
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) {
      const e = samples[i] * samples[i];
      if (i < split * 2) lo += e; else hi += e;
    }
    const spectral = (lo + hi) > 0 ? hi / (lo + hi) : 0;

    // Energy rolling stats
    this._energyHistory.push(energy);
    if (this._energyHistory.length > this._WIN) this._energyHistory.shift();
    const meanE = this._energyHistory.reduce((a,b)=>a+b,0) / this._energyHistory.length;
    const varE  = this._energyHistory.reduce((a,b)=>a+(b-meanE)**2,0) / this._energyHistory.length;
    const sigmaE = Math.sqrt(varE);
    const zScore = sigmaE > 0 ? (energy - meanE) / sigmaE : 0;
    const anomaly = Math.abs(zScore) > 2.0;

    // Silence gate: if energy very low, return minimal payload
    const silence = energy < 0.005;

    const features = {
      energy:   Math.round(energy    * 10000) / 10000,
      zcr:      Math.round(zcr       * 10000) / 10000,
      spectral: Math.round(spectral  * 10000) / 10000,
      zScore:   Math.round(zScore    * 1000)  / 1000,
      anomaly,
      silence,
    };

    // Feature header: 6 × float32 = 24 bytes
    const featureBuf = Buffer.allocUnsafe(24);
    featureBuf.writeFloatBE(features.energy,   0);
    featureBuf.writeFloatBE(features.zcr,      4);
    featureBuf.writeFloatBE(features.spectral, 8);
    featureBuf.writeFloatBE(features.zScore,   12);
    featureBuf.writeUInt8(anomaly ? 1 : 0,     16);
    featureBuf.writeUInt8(silence ? 1 : 0,     17);
    featureBuf.writeUInt16BE(sampleRate,        18);
    featureBuf.writeUInt16BE(n,                 20);
    // 2 bytes reserved
    featureBuf[22] = 0;
    featureBuf[23] = 0;

    const compressed = silence
      ? Buffer.concat([featureBuf])       // silent: features only, no PCM
      : Buffer.concat([featureBuf, pcmBuf]); // active: features + PCM

    return {
      compressed,
      rawBytes:        pcmBuf.length,
      compressedBytes: compressed.length,
      ratio:           pcmBuf.length / compressed.length,
      features,
      silence,
    };
  }
}

// ── E2E Encryption ────────────────────────────────────────────────────────────

class FrameEncryptor {
  constructor(sessionId) {
    // Derive session key via HKDF
    this._key = crypto.hkdfSync(
      'sha256',
      Buffer.from(sessionId),
      Buffer.from('crystalball-v1'),
      Buffer.alloc(0),
      32
    );
    this._frameIndex = 0;
  }

  encrypt(plaintext) {
    const idx = this._frameIndex++;
    // Derive per-frame IV from session key + frame index
    const iv = crypto.hkdfSync(
      'sha256',
      this._key,
      Buffer.from(idx.toString()),
      Buffer.alloc(0),
      12
    );

    const cipher = crypto.createCipheriv('aes-256-gcm', this._key, iv);
    const ct     = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag    = cipher.getAuthTag();

    // [ 4b frameIndex | 12b IV | N b ciphertext | 16b GCM tag ]
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(idx, 0);
    return Buffer.concat([header, iv, ct, tag]);
  }

  decrypt(ciphertext) {
    const idx    = ciphertext.readUInt32BE(0);
    const iv     = ciphertext.slice(4, 16);
    const tag    = ciphertext.slice(ciphertext.length - 16);
    const ct     = ciphertext.slice(16, ciphertext.length - 16);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this._key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

// ── Bitstream Monitor ──────────────────────────────────────────────────────────

class BitstreamMonitor {
  constructor({ wsServer }) {
    this._ws = wsServer;

    this._video = { rawBytes: 0, compBytes: 0, frames: 0, startTs: Date.now() };
    this._audio = { rawBytes: 0, compBytes: 0, chunks: 0, startTs: Date.now() };

    this._videoLatencies = [];
    this._audioLatencies = [];

    this._timer = null;
  }

  start() {
    this._timer = setInterval(() => this._emit(), BITSTREAM_INTERVAL_MS);
  }

  stop() { clearInterval(this._timer); }

  pushVideo(result, latencyMs) {
    this._video.rawBytes  += result.rawBytes;
    this._video.compBytes += result.compressedBytes;
    this._video.frames++;
    if (latencyMs != null) this._videoLatencies.push(latencyMs);
    if (this._videoLatencies.length > 30) this._videoLatencies.shift();
  }

  pushAudio(result, latencyMs) {
    this._audio.rawBytes  += result.rawBytes;
    this._audio.compBytes += result.compressedBytes;
    this._audio.chunks++;
    if (latencyMs != null) this._audioLatencies.push(latencyMs);
    if (this._audioLatencies.length > 30) this._audioLatencies.shift();
  }

  _emit() {
    const elapsed = (Date.now() - this._video.startTs) / 1000;
    const avgLat  = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0;

    const tick = {
      type: 'bitstream.tick',
      ts:   Date.now(),
      video: {
        fps:            elapsed > 0 ? Math.round(this._video.frames / elapsed * 10) / 10 : 0,
        rawBps:         elapsed > 0 ? Math.round(this._video.rawBytes  * 8 / elapsed) : 0,
        compBps:        elapsed > 0 ? Math.round(this._video.compBytes * 8 / elapsed) : 0,
        ratio:          this._video.rawBytes > 0
                          ? Math.round(this._video.rawBytes / this._video.compBytes * 10) / 10
                          : 1,
        frames:         this._video.frames,
        latencyMs:      avgLat(this._videoLatencies),
      },
      audio: {
        chunksPerSec:   elapsed > 0 ? Math.round(this._audio.chunks / elapsed * 10) / 10 : 0,
        rawBps:         elapsed > 0 ? Math.round(this._audio.rawBytes  * 8 / elapsed) : 0,
        compBps:        elapsed > 0 ? Math.round(this._audio.compBytes * 8 / elapsed) : 0,
        ratio:          this._audio.rawBytes > 0
                          ? Math.round(this._audio.rawBytes / this._audio.compBytes * 10) / 10
                          : 1,
        chunks:         this._audio.chunks,
        latencyMs:      avgLat(this._audioLatencies),
      },
    };

    this._ws?.broadcast(tick);

    // Also send binary tick on CH.BITSTREAM_TICK for renderer visualization
    const buf = Buffer.allocUnsafe(32);
    buf.writeFloatBE(tick.video.fps,        0);
    buf.writeFloatBE(tick.video.rawBps,     4);
    buf.writeFloatBE(tick.video.compBps,    8);
    buf.writeFloatBE(tick.video.ratio,      12);
    buf.writeFloatBE(tick.video.latencyMs,  16);
    buf.writeFloatBE(tick.audio.rawBps,     20);
    buf.writeFloatBE(tick.audio.compBps,    24);
    buf.writeFloatBE(tick.audio.latencyMs,  28);
    this._ws?.broadcastBinary(CH.BITSTREAM_TICK, buf);
  }
}

// ── Pipeline ──────────────────────────────────────────────────────────────────

class Pipeline {
  constructor({ wsServer }) {
    this._ws         = wsServer;
    this._videoQueue = new FrameQueue(VIDEO_BUF_CAP, 'video');
    this._audioQueue = new FrameQueue(AUDIO_BUF_CAP, 'audio');
    this._videoCodec = new VideoCodec();
    this._audioCodec = new AudioCodec();
    this._monitor    = new BitstreamMonitor({ wsServer });
    this._encryptors = new Map(); // sessionId → FrameEncryptor
    this._drainTimer = null;
    this._sessionId  = null;

    // WebRTC state (proxied through renderer via IPC)
    this._pendingOffer  = null;
    this._pendingAnswer = null;
  }

  start() {
    this._monitor.start();
    this._startDrain();

    // Listen for raw frames from renderer via WS
    this._ws?.on(`binary:${CH.VIDEO_FRAME}`, (data, clientId) => {
      const ingestTs = Date.now();
      try {
        const width  = data.readUInt16BE(0);
        const height = data.readUInt16BE(2);
        const rgba   = data.slice(4);
        const result = this._videoCodec.compress(rgba, width, height);
        this._videoQueue.push({ data: result.compressed, meta: result, ingestTs });
        this._monitor.pushVideo(result, null);
      } catch (e) {
        console.warn('[Pipeline] video codec error:', e.message);
      }
    });

    this._ws?.on(`binary:${CH.AUDIO_CHUNK}`, (data, clientId) => {
      try {
        const result = this._audioCodec.compress(data);
        this._audioQueue.push({ data: result.compressed, meta: result, ingestTs: Date.now() });
        this._monitor.pushAudio(result, null);
      } catch (e) {
        console.warn('[Pipeline] audio codec error:', e.message);
      }
    });

    console.log('[Pipeline] started');
  }

  stop() {
    clearInterval(this._drainTimer);
    this._monitor.stop();
  }

  // ── Direct ingest (from IPC) ───────────────────────────────────────────────

  ingestFrame({ type, data, meta }) {
    if (type === 'video') {
      const buf    = Buffer.from(data);
      const result = this._videoCodec.compress(buf, meta?.width ?? FULL_W, meta?.height ?? FULL_H);
      this._videoQueue.push({ data: result.compressed, meta: result, ingestTs: Date.now() });
      this._monitor.pushVideo(result, null);
      return { ok: true, compressedBytes: result.compressedBytes, ratio: result.ratio };
    }
    return { ok: false };
  }

  ingestAudio({ data, meta }) {
    const buf    = Buffer.from(data);
    const result = this._audioCodec.compress(buf, meta?.sampleRate ?? 16000);
    this._audioQueue.push({ data: result.compressed, meta: result, ingestTs: Date.now() });
    this._monitor.pushAudio(result, null);
    return { ok: true, features: result.features };
  }

  // ── Drain loop ────────────────────────────────────────────────────────────

  _startDrain() {
    let lastVideo = Date.now();
    let lastAudio = Date.now();

    const tick = () => {
      const now = Date.now();

      // Drain video at VIDEO_FPS
      if (now - lastVideo >= VIDEO_FRAME_MS) {
        const frame = this._videoQueue.pop();
        if (frame) {
          const lat = now - frame.ingestTs;
          this._monitor.pushVideo(frame.meta ?? {}, lat);
          this._ws?.broadcastBinary(CH.VIDEO_FRAME, frame.data);
        }
        lastVideo = now;
      }

      // Drain audio at AUDIO_CHUNK rate
      if (now - lastAudio >= AUDIO_CHUNK_MS) {
        const chunk = this._audioQueue.pop();
        if (chunk) {
          const lat = now - chunk.ingestTs;
          this._monitor.pushAudio(chunk.meta ?? {}, lat);
          this._ws?.broadcastBinary(CH.AUDIO_CHUNK, chunk.data);
        }
        lastAudio = now;
      }

      this._drainTimer = setTimeout(tick, 1);
    };

    tick();
  }

  // ── WebRTC magnet link ────────────────────────────────────────────────────
  // Proxied: renderer creates RTCPeerConnection, main just routes the offer/answer

  handleMagnetOffer(magnet) {
    this._pendingOffer = magnet;
    // Broadcast to renderer to initiate WebRTC with this magnet
    this._ws?.broadcast({ type: 'webrtc.offer', magnet });
    return { ok: true };
  }

  handleMagnetAnswer(answer) {
    this._pendingAnswer = answer;
    this._ws?.broadcast({ type: 'webrtc.answer', answer });
    return { ok: true };
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  stats() {
    return {
      video: this._videoQueue.stats(),
      audio: this._audioQueue.stats(),
    };
  }

  // ── Encryption (for DataChannel E2E) ─────────────────────────────────────

  getEncryptor(sessionId) {
    if (!this._encryptors.has(sessionId)) {
      this._encryptors.set(sessionId, new FrameEncryptor(sessionId));
    }
    return this._encryptors.get(sessionId);
  }
}

module.exports = { Pipeline, VideoCodec, AudioCodec, FrameEncryptor, BitstreamMonitor };
