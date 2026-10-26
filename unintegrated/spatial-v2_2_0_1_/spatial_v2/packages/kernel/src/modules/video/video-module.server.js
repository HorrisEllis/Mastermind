/**
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  ALK VideoModule — Node.js Server Adapter                          ║
 * ║  video-module.server.js  ·  v1.2.0                                 ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Node.js headless adapter for VideoModule.
 *
 * WHAT THIS FILE PROVIDES:
 *   - CodecFrameExtractor: zero-dependency frame reader (replaces FFMPEGExtractor)
 *     · Image-frame dirs: reads sequential JPEG/PNG frames via canvas.loadImage
 *     · Raw RGBA files: reads raw RGBA binary (width×height×4 bytes/frame)
 *     · Live streams: accepts any Node.js Readable of raw RGBA frames
 *     · All pixel math delegated to codec.js GPGPUVideoProcessor
 *   - Node-compatible MediaPipe Tasks Vision loader (@mediapipe/tasks-vision)
 *   - canvas package integration for headless ImageData
 *   - VideoFileProcessor: process recorded video sessions into ALK events
 *   - VideoStreamProcessor: process live RGBA frame streams into ALK events
 *   - Batch directory processor
 *
 * REPLACES: ffmpeg (all video → frame extraction, all stream decode)
 *   Previously: ffmpeg spawn → rawvideo RGB24 pipe → canvas ImageData
 *   Now:        canvas.loadImage (files) or Readable RGBA stream (live)
 *               → NodeVideoProcessor → codec GPGPUVideoProcessor pixel math
 *
 * CODEC INTEGRATION:
 *   codec.js GPGPUVideoProcessor provides:
 *     - Adaptive resolution scaling (dark scenes → lower res)
 *     - Temporal frame blending (background model via alpha-blend)
 *     - Invariant pixel detection (Welford variance map, every 30 frames)
 *     - Frame diff / motion scoring (per-pixel delta)
 *     - Rolling stats (RollingStats: mean, sigma, z-score, anomaly detection)
 *   These replace FFMPEG's decode + scale pipeline with pure-JS pixel math.
 *
 * USAGE — file processing (frame directory):
 *
 *   import { VideoFileProcessor } from './video-module.server.js';
 *   const proc = new VideoFileProcessor({ kernel, videoModule: video });
 *   await proc.processFrameDir('./frames-dir', { sessionId: 'sess-001', fps: 15 });
 *
 * USAGE — live stream (raw RGBA Readable):
 *
 *   import { VideoStreamProcessor } from './video-module.server.js';
 *   const streamProc = new VideoStreamProcessor({ kernel });
 *   streamProc.attachStream(myRgbaReadable, { sessionId: 'live-001', url: 'rtsp://...' });
 *
 * REQUIREMENTS:
 *   npm install @mediapipe/tasks-vision canvas
 *   No system binary dependencies. codec.js handles all pixel processing.
 *
 * §1.1 — All computations documented. Nothing pretends.
 * §1.2 — No silent failures. All errors surface as alk.video.error events or throws.
 * §5.5 — No external runtime dependencies beyond canvas + @mediapipe.
 * §K6  — This file emits events into the kernel. It does not call VideoModule methods directly.
 */

import { createCanvas, createImageData, loadImage } from 'canvas';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';

// ─── Constants ────────────────────────────────────────────────────────────────

const FRAME_WIDTH   = 640;
const FRAME_HEIGHT  = 480;
const DARK_THRESHOLD = 60;  // mirrors codec.js constant

// ─── Codec sub-engine import ──────────────────────────────────────────────────
//
// We import GPGPUVideoProcessor from codec.js for all pixel math.
// NexusCodec itself is browser-only (getUserMedia, Web Audio API).
// GPGPUVideoProcessor uses only OffscreenCanvas + ImageData + Math — all
// polyfillable in Node via the canvas package.

import { GPGPUVideoProcessor as _GPGPUVideoProcessor } from '../codec.js';

// ─── Node-compatible GPGPUVideoProcessor driver ───────────────────────────────
//
// GPGPUVideoProcessor.attach() expects HTMLVideoElement + requestAnimationFrame.
// In Node we skip attach() entirely and call the internal frame methods directly
// after painting a node-canvas Canvas — same pixel math, no browser APIs.

class NodeVideoProcessor {
  /**
   * @param {{ onFrame?: function, onInvariant?: function }} callbacks
   */
  constructor({ onFrame, onInvariant } = {}) {
    // Install polyfills before constructing GPGPUVideoProcessor
    _installNodePolyfills();

    this._proc = new _GPGPUVideoProcessor({});
    // Wire callbacks directly onto the internal instance
    this._proc._onFrame     = onFrame     ?? null;
    this._proc._onInvariant = onInvariant ?? null;
  }

  /**
   * Process a single node-canvas Canvas as a video frame.
   * Bypasses attach() and requestAnimationFrame entirely.
   *
   * @param {import('canvas').Canvas} canvasNode
   * @param {number} width
   * @param {number} height
   * @returns {object}  codec frame result payload
   */
  processCanvas(canvasNode, width, height) {
    const proc = this._proc;
    const ctx   = canvasNode.getContext('2d');
    const frame = ctx.getImageData(0, 0, width, height);

    // Ensure proc's offscreen canvas geometry matches
    if (!proc._canvas || proc._offW !== width || proc._offH !== height) {
      proc._canvas = new globalThis.OffscreenCanvas(width, height);
      proc._ctx    = proc._canvas.getContext('2d');
      proc._offW   = width;
      proc._offH   = height;
      proc._prevData      = null;
      proc._bgModel       = null;
      proc._varMap        = null;
      proc._meanMap       = null;
      proc._nMap          = null;
      proc._invariantMask = null;
    }

    proc._frameCount = (proc._frameCount ?? 0) + 1;

    // Luminance
    const lum      = proc._avgLuminance(frame);
    const lumStats = proc._lumStats.measure(lum);

    // Motion
    let motionStats = { mean: 0, sigma: 0, delta: 0, zScore: 0, anomaly: false };
    let deltaPixels = [];
    let motionScore = 0;

    if (proc._prevData) {
      const result = proc._frameDiff(proc._prevData, frame);
      motionScore  = result.score;
      deltaPixels  = result.delta;
      motionStats  = proc._motionStats.measure(motionScore);
    }
    proc._prevData = frame;

    // Background model
    proc._updateBgModel(frame);

    // Invariant detection (every 30 frames)
    proc._invRefresh = (proc._invRefresh ?? 0) + 1;
    if (proc._invRefresh >= 30) {
      proc._invRefresh = 0;
      proc._computeInvariantMask();
      proc._onInvariant?.({
        mask:  proc._invariantMask,
        w:     width,
        h:     height,
        frame: proc._frameCount,
      });
    }

    const result = {
      frameIndex:      proc._frameCount,
      w: width,  h: height,
      luminance:       Math.round(lum),
      motionScore:     Math.round(motionScore * 10000) / 10000,
      motionDelta:     motionStats.delta,
      motionSigma:     motionStats.sigma,
      motionAnomaly:   motionStats.anomaly,
      lumDelta:        lumStats.delta,
      isDark:          lum < DARK_THRESHOLD,
      deltaPixelCount: deltaPixels.length,
      deltaPixels:     deltaPixels.slice(0, 500),
    };

    proc._onFrame?.(result);
    return result;
  }
}

/**
 * Install minimal browser-global polyfills required by GPGPUVideoProcessor.
 * Called once before constructing the first NodeVideoProcessor.
 * Idempotent.
 */
function _installNodePolyfills() {
  if (!globalThis.__alkCodecPolyfilled) {
    globalThis.__alkCodecPolyfilled = true;

    if (typeof globalThis.OffscreenCanvas === 'undefined') {
      globalThis.OffscreenCanvas = class OffscreenCanvas {
        constructor(w, h) {
          this._c = createCanvas(w, h);
          this.width  = w;
          this.height = h;
        }
        getContext(type) { return this._c.getContext(type === '2d' ? '2d' : type); }
      };
    }

    if (typeof globalThis.ImageData === 'undefined') {
      globalThis.ImageData = createImageData;
    }

    if (typeof globalThis.requestAnimationFrame === 'undefined') {
      globalThis.requestAnimationFrame = (cb) => setImmediate(cb);
      globalThis.cancelAnimationFrame  = (id) => clearImmediate(id);
    }
  }
}

// ─── MediaPipe Node Loader ────────────────────────────────────────────────────

/**
 * loadMediaPipeNode — initializes MediaPipe Tasks Vision in Node.js headless mode.
 *
 * @param {object} options
 * @param {string}  [options.modelBaseUrl]
 * @param {boolean} [options.enableFace]
 * @param {boolean} [options.enablePose]
 * @param {boolean} [options.enableHands]
 * @returns {{ faceLandmarker?, poseLandmarker?, handLandmarker? }}
 */
export async function loadMediaPipeNode({
  modelBaseUrl = 'https://storage.googleapis.com/mediapipe-models',
  enableFace   = true,
  enablePose   = true,
  enableHands  = true,
} = {}) {
  if (typeof globalThis.ImageData === 'undefined') {
    const { createImageData } = await import('canvas');
    globalThis.ImageData = createImageData;
  }
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createCanvas(FRAME_WIDTH, FRAME_HEIGHT);
        return {};
      },
    };
  }

  const { FilesetResolver, FaceLandmarker, PoseLandmarker, HandLandmarker } =
    await import('@mediapipe/tasks-vision');

  const vision = await FilesetResolver.forVisionTasks(
    `${modelBaseUrl}/mediapipe-tasks-vision/wasm`
  );

  const loaders = {};

  if (enableFace) {
    loaders.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `${modelBaseUrl}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: 'CPU',
      },
      outputFaceBlendshapes: true,
      runningMode:           'VIDEO',
      numFaces:              2,
    });
  }

  if (enablePose) {
    loaders.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `${modelBaseUrl}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numPoses:    1,
    });
  }

  if (enableHands) {
    loaders.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `${modelBaseUrl}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands:    2,
    });
  }

  return loaders;
}

// ─── CodecFrameExtractor (replaces FFMPEGExtractor) ──────────────────────────

/**
 * CodecFrameExtractor — zero-dependency frame extraction.
 *
 * Replaces FFMPEGExtractor. No child process. No system binaries.
 *
 * Three source modes:
 *
 *   1. startFromFrameDir(dirPath)
 *      Reads a sorted sequence of JPEG/PNG images from a directory.
 *      canvas.loadImage decodes each file. Throttles to target FPS.
 *
 *   2. startFromRawStream(readable)
 *      Reads raw RGBA (width×height×4 bytes/frame) from any Node.js Readable.
 *      No header or container. Suitable for: network sockets, named pipes,
 *      or any external process that outputs raw RGBA to stdout.
 *
 *   3. startFromRawFile(filePath)
 *      Same as (2) but opens the file itself.
 *
 * Events:
 *   frame   — { imageData: ImageData, canvas: Canvas, frameIndex, wallTs }
 *   end     — { frameCount }
 *   error   — { message, code }
 *
 * §1.2 — All errors emitted as 'error'. None swallowed silently.
 * §5.5 — No system binary. Pure Node.js + canvas package.
 */
export class CodecFrameExtractor extends EventEmitter {
  constructor({
    width  = FRAME_WIDTH,
    height = FRAME_HEIGHT,
    fps    = 15,
  } = {}) {
    super();
    this._width      = width;
    this._height     = height;
    this._fps        = fps;
    this._frameBytes = width * height * 4;  // RGBA

    this._frameIdx   = 0;
    this._running    = false;
    this._stream     = null;
    this._remainder  = Buffer.alloc(0);
  }

  /**
   * Mode 1 — Frame directory (JPEG/PNG sequence).
   * @param {string} dirPath
   */
  async startFromFrameDir(dirPath) {
    if (this._running) throw new Error('[ALK:Codec:Extractor] Already running');
    this._running = true;

    const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
    let files;
    try {
      files = fs.readdirSync(dirPath)
        .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
        .sort()
        .map(f => path.join(dirPath, f));
    } catch (err) {
      this.emit('error', { message: err.message, code: 'DIR_READ_FAILED' });
      return;
    }

    if (!files.length) {
      this.emit('error', {
        message: `No image frames found in ${dirPath}`,
        code: 'NO_FRAMES',
      });
      return;
    }

    const intervalMs = Math.round(1000 / this._fps);

    for (const filePath of files) {
      if (!this._running) break;
      try {
        const img    = await loadImage(filePath);
        const canvas = createCanvas(this._width, this._height);
        const ctx    = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, this._width, this._height);
        const imageData = ctx.getImageData(0, 0, this._width, this._height);

        this._frameIdx++;
        this.emit('frame', {
          imageData,
          canvas,
          frameIndex: this._frameIdx,
          wallTs:     Date.now(),
        });

        await new Promise(r => setTimeout(r, intervalMs));
      } catch (err) {
        this.emit('error', {
          message: `Frame load failed (${filePath}): ${err.message}`,
          code:    'FRAME_LOAD_FAILED',
        });
      }
    }

    this._running = false;
    this.emit('end', { frameCount: this._frameIdx });
  }

  /**
   * Mode 2 — Raw RGBA Readable stream (width×height×4 bytes/frame, no header).
   * @param {import('stream').Readable} readable
   */
  startFromRawStream(readable) {
    if (this._running) throw new Error('[ALK:Codec:Extractor] Already running');
    this._running = true;
    this._stream  = readable;

    readable.on('data', (chunk) => {
      this._remainder = Buffer.concat([this._remainder, chunk]);
      while (this._remainder.length >= this._frameBytes) {
        const raw       = this._remainder.slice(0, this._frameBytes);
        this._remainder = this._remainder.slice(this._frameBytes);
        this._emitRgbaFrame(raw);
      }
    });

    readable.on('error', (err) => {
      this._running = false;
      this.emit('error', { message: err.message, code: 'STREAM_READ_ERROR' });
    });

    readable.on('end', () => {
      this._running = false;
      this.emit('end', { frameCount: this._frameIdx });
    });

    return this;
  }

  /**
   * Mode 3 — Raw RGBA file.
   * @param {string} filePath
   */
  startFromRawFile(filePath) {
    const readable = fs.createReadStream(filePath);
    return this.startFromRawStream(readable);
  }

  _emitRgbaFrame(rgbaBuffer) {
    const imageData = createImageData(
      new Uint8ClampedArray(rgbaBuffer),
      this._width,
      this._height
    );
    const canvas = createCanvas(this._width, this._height);
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    this._frameIdx++;
    this.emit('frame', {
      imageData,
      canvas,
      frameIndex: this._frameIdx,
      wallTs:     Date.now(),
    });
  }

  stop() {
    this._running = false;
    if (this._stream) {
      try { this._stream.destroy(); } catch (_) {}
      this._stream = null;
    }
  }

  get frameIndex() { return this._frameIdx; }
}

// ─── bufferToImageData / bufferToCanvas helpers ───────────────────────────────
//
// Kept for any consumer that still has RGB24 buffers from an external source.
// These do NOT invoke ffmpeg — they are pure buffer math.

/**
 * Convert raw RGB24 Buffer → RGBA ImageData (MediaPipe expects RGBA).
 */
export function bufferToImageData(rgb24Buffer, width = FRAME_WIDTH, height = FRAME_HEIGHT) {
  const rgba = Buffer.allocUnsafe(width * height * 4);
  for (let i = 0, j = 0; i < rgb24Buffer.length; i += 3, j += 4) {
    rgba[j]     = rgb24Buffer[i];
    rgba[j + 1] = rgb24Buffer[i + 1];
    rgba[j + 2] = rgb24Buffer[i + 2];
    rgba[j + 3] = 255;
  }
  return createImageData(new Uint8ClampedArray(rgba), width, height);
}

/**
 * Convert raw RGB24 Buffer → node-canvas Canvas.
 */
export function bufferToCanvas(rgb24Buffer, width = FRAME_WIDTH, height = FRAME_HEIGHT) {
  const canvas = createCanvas(width, height);
  canvas.getContext('2d').putImageData(bufferToImageData(rgb24Buffer, width, height), 0, 0);
  return canvas;
}

// ─── VideoFileProcessor ───────────────────────────────────────────────────────

/**
 * Process recorded video sessions through the full ALK VideoModule pipeline.
 *
 * Input formats supported:
 *   - Directory of JPEG/PNG frames   → processFrameDir()
 *   - Raw RGBA binary file (.raw)    → processFile() with .raw extension
 *   - Directory passed to processFile() → delegates to processFrameDir()
 *
 * Container files (.mp4, .webm, .mov):
 *   These require a native demuxer to extract frame images. Pre-extract to
 *   a frame directory, then use processFrameDir(). See README §Frame Extraction.
 *
 * All pixel math (adaptive resolution, temporal blending, invariant detection,
 * motion scoring) is handled by codec.js GPGPUVideoProcessor via NodeVideoProcessor.
 *
 * §1.1 — Container format limitations documented. Nothing pretends to decode
 *         what it cannot decode.
 * §1.2 — All errors surface as alk.video.error kernel events.
 */
export class VideoFileProcessor {
  constructor({ kernel, videoModule, fps = 15, width = FRAME_WIDTH, height = FRAME_HEIGHT } = {}) {
    if (!kernel) throw new Error('[VideoFileProcessor] kernel required');
    this._kernel = kernel;
    this._video  = videoModule;
    this._fps    = fps;
    this._width  = width;
    this._height = height;
  }

  /**
   * Process a directory of sequential image frames (JPEG/PNG).
   *
   * @param {string} dirPath
   * @param {{ sessionId?, fps? }} opts
   * @returns {Promise<{ frameCount, cueCount, durationMs, sessionId }>}
   */
  processFrameDir(dirPath, { sessionId, fps } = {}) {
    return this._runExtractor(
      dirPath,
      'file',
      sessionId,
      fps,
      (extractor) => extractor.startFromFrameDir(dirPath)
    );
  }

  /**
   * processFile — dispatches on input type.
   *
   *   directory → processFrameDir
   *   .raw file → _processRaw (raw RGBA binary)
   *   container → error (pre-extract frames first)
   *
   * @param {string} filePath
   * @param {{ sessionId?, fps? }} opts
   */
  processFile(filePath, { sessionId, fps } = {}) {
    let stat;
    try { stat = fs.statSync(filePath); }
    catch (e) { throw new Error(`[VideoFileProcessor] Not found: ${filePath}`); }

    if (stat.isDirectory()) return this.processFrameDir(filePath, { sessionId, fps });

    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.raw') return this._processRaw(filePath, { sessionId, fps });

    const sid = sessionId ?? `file-${path.basename(filePath)}-${Date.now()}`;
    const err = {
      code:      'CONTAINER_UNSUPPORTED',
      message:   `Cannot decode ${ext} container natively. ` +
                 `Pre-extract frames to a JPEG/PNG directory and use processFrameDir(). ` +
                 `See README §Frame Extraction.`,
      filePath,
      sessionId: sid,
    };
    this._kernel.emit('alk.video.error', err);
    return Promise.reject(new Error(err.message));
  }

  /**
   * Process a raw RGBA binary file.
   */
  _processRaw(filePath, { sessionId, fps } = {}) {
    const sid = sessionId ?? `raw-${path.basename(filePath)}-${Date.now()}`;
    return this._runExtractor(
      filePath,
      'raw-file',
      sid,
      fps,
      (extractor) => { extractor.startFromRawFile(filePath); }
    );
  }

  /**
   * Shared extractor runner. Wires CodecFrameExtractor → kernel events.
   */
  _runExtractor(source, sourceType, sessionId, fps, start) {
    return new Promise((resolve, reject) => {
      const sid       = sessionId ?? `${sourceType}-${Date.now()}`;
      const startWall = Date.now();

      this._kernel.emit('alk.session.capture.start', { sessionId: sid, source: sourceType, path: source });

      let frameCount = 0;
      let cueCount   = 0;
      const unsub    = this._kernel.subscribe('alk.video.cue.detected', () => { cueCount++; });

      const codecProc = new NodeVideoProcessor({
        onFrame:     (f) => this._kernel.emit('alk.video.frame.analyzed', { ...f, sessionId: sid }),
        onInvariant: (i) => this._kernel.emit('alk.video.invariant',      { ...i, sessionId: sid }),
      });

      const extractor = new CodecFrameExtractor({
        fps:    fps ?? this._fps,
        width:  this._width,
        height: this._height,
      });

      extractor.on('frame', ({ canvas, imageData, frameIndex, wallTs }) => {
        frameCount = frameIndex;
        const codecFrame = codecProc.processCanvas(canvas, this._width, this._height);
        this._kernel.emit('alk.video.frame.ingest', {
          bitmap:  canvas, imageData, frameIndex,
          wallTs,  sessionId: sid, timestamp: wallTs,
          codecFrame,
        }, { sessionId: sid });
      });

      extractor.on('end', () => {
        unsub();
        this._kernel.emit('alk.session.capture.stop', { sessionId: sid, source: sourceType });
        resolve({ frameCount, cueCount, durationMs: Date.now() - startWall, sessionId: sid });
      });

      extractor.on('error', (err) => {
        unsub();
        this._kernel.emit('alk.video.error', { code: 'EXTRACT_FAILED', message: err.message, source, sessionId: sid });
        reject(new Error(err.message));
      });

      Promise.resolve(start(extractor)).catch(reject);
    });
  }

  /**
   * Process all targets in a parent directory.
   * Each subdirectory = one frame-sequence session.
   * .raw files at root level are also processed.
   */
  async processDirectory(parentDir, options = {}) {
    let entries;
    try { entries = fs.readdirSync(parentDir, { withFileTypes: true }); }
    catch (e) { throw new Error(`[VideoFileProcessor] Cannot read directory: ${parentDir}`); }

    const RAW_EXT = new Set(['.raw']);
    const targets = entries
      .filter(e => e.isDirectory() || RAW_EXT.has(path.extname(e.name).toLowerCase()))
      .map(e => path.join(parentDir, e.name));

    const results = [];
    for (const target of targets) {
      try {
        const r = await this.processFile(target, {
          ...options,
          sessionId: options.sessionId
            ? `${options.sessionId}-${path.basename(target)}`
            : undefined,
        });
        results.push({ target, ...r });
      } catch (err) {
        results.push({ target, error: err.message });
      }
    }
    return results;
  }
}

// ─── VideoStreamProcessor ─────────────────────────────────────────────────────

/**
 * Live frame-stream processor.
 *
 * Accepts any Node.js Readable that produces raw RGBA frames
 * (width×height×4 bytes per frame, no header or container wrapping).
 *
 * To connect an RTSP camera or other live source:
 *   1. Use a Node RTSP adapter, WebRTC server, or named pipe that produces
 *      raw RGBA frame data as a Readable.
 *   2. Pass that Readable to attachStream().
 *   3. The codec handles all pixel math downstream.
 *
 * §1.1 — url parameter is metadata only. No URL parsing or protocol
 *         negotiation occurs here; that is the adapter's responsibility.
 */
export class VideoStreamProcessor {
  constructor({ kernel, fps = 10, width = FRAME_WIDTH, height = FRAME_HEIGHT } = {}) {
    if (!kernel) throw new Error('[VideoStreamProcessor] kernel required');
    this._kernel    = kernel;
    this._fps       = fps;
    this._width     = width;
    this._height    = height;
    this._extractor = null;
    this._session   = null;
    this._codecProc = null;
  }

  /**
   * Attach a raw RGBA frame Readable.
   *
   * @param {import('stream').Readable} readable
   * @param {{ sessionId?, url?, fps? }} opts
   */
  attachStream(readable, { sessionId, url = 'raw-stream', fps } = {}) {
    if (this._extractor) this.detach();

    this._session = sessionId ?? `stream-${Date.now()}`;

    this._kernel.emit('alk.session.capture.start', {
      sessionId: this._session,
      source:    'stream',
      url,
    });

    this._codecProc = new NodeVideoProcessor({
      onFrame:     (f) => this._kernel.emit('alk.video.frame.analyzed', { ...f, sessionId: this._session }),
      onInvariant: (i) => this._kernel.emit('alk.video.invariant',      { ...i, sessionId: this._session }),
    });

    this._extractor = new CodecFrameExtractor({
      fps:    fps ?? this._fps,
      width:  this._width,
      height: this._height,
    });

    this._extractor.on('frame', ({ canvas, imageData, frameIndex, wallTs }) => {
      const codecFrame = this._codecProc.processCanvas(canvas, this._width, this._height);
      this._kernel.emit('alk.video.frame.ingest', {
        bitmap: canvas, imageData, frameIndex,
        wallTs, sessionId: this._session, timestamp: wallTs,
        codecFrame,
      }, { sessionId: this._session });
    });

    this._extractor.on('error', (err) => {
      this._kernel.emit('alk.video.error', {
        code: 'STREAM_ERROR', message: err.message, url, sessionId: this._session,
      });
    });

    this._extractor.on('end', () => {
      this._kernel.emit('alk.session.capture.stop', {
        sessionId: this._session, source: 'stream',
      });
      this._session   = null;
      this._extractor = null;
      this._codecProc = null;
    });

    this._extractor.startFromRawStream(readable);
    return this;
  }

  detach() {
    if (this._extractor) { this._extractor.stop(); this._extractor = null; }
    if (this._session) {
      this._kernel.emit('alk.session.capture.stop', {
        sessionId: this._session, source: 'stream', reason: 'detach',
      });
      this._session   = null;
      this._codecProc = null;
    }
  }

  get isAttached() { return !!this._extractor; }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

/**
 * node video-module.server.js --input ./frames-dir --fps 15 --session sess-001
 *
 * --input must be a directory of JPEG/PNG frames, or a .raw RGBA binary.
 * For .mp4/.webm containers: pre-extract frames first — see README §Frame Extraction.
 */
if (process.argv[1] && process.argv[1].endsWith('video-module.server.js')) {
  const args = Object.fromEntries(
    process.argv.slice(2)
      .reduce((pairs, v, i, arr) => {
        if (v.startsWith('--')) pairs.push([v.slice(2), arr[i + 1]]);
        return pairs;
      }, [])
  );

  (async () => {
    console.log('[ALK:Video:Server] Loading MediaPipe...');
    const { createKernel } = await import('./kernel.js');
    const { VideoModule }  = await import('./video-module.js');

    const kernel   = createKernel({ ringCap: 50_000 });
    const mpModels = await loadMediaPipeNode({
      enableFace:  true,
      enablePose:  !args['no-pose'],
      enableHands: !args['no-hands'],
    });

    console.log('[ALK:Video:Server] Models loaded. Wiring VideoModule...');
    const video = new VideoModule({ kernel });
    kernel.emit('alk.video.mediapipe.loaded', mpModels);

    kernel.subscribe('alk.video.**', (ev) => {
      if (ev.type !== 'alk.video.frame.analyzed' || args.verbose) {
        process.stdout.write(JSON.stringify({
          type: ev.type, tick: ev.meta?.tick, payload: ev.payload,
        }) + '\n');
      }
    });

    const proc = new VideoFileProcessor({
      kernel,
      videoModule: video,
      fps: parseInt(args.fps ?? '15'),
    });

    if (args.input) {
      console.log(`[ALK:Video:Server] Processing: ${args.input}`);
      const result = await proc.processFile(args.input, { sessionId: args.session });
      console.log('[ALK:Video:Server] Done:', JSON.stringify(result));
    } else if (args.dir) {
      console.log(`[ALK:Video:Server] Processing directory: ${args.dir}`);
      const results = await proc.processDirectory(args.dir);
      console.log('[ALK:Video:Server] Done:', JSON.stringify(results, null, 2));
    } else {
      console.error(
        '[ALK:Video:Server] --input FRAMES_DIR (or .raw file) or --dir PARENT_DIR required\n' +
        '  For .mp4/.webm containers, pre-extract frames to a directory first.'
      );
      process.exit(1);
    }
  })().catch(err => {
    console.error('[ALK:Video:Server] Fatal:', err);
    process.exit(1);
  });
}

export default {
  loadMediaPipeNode,
  CodecFrameExtractor,
  bufferToImageData,
  bufferToCanvas,
  VideoFileProcessor,
  VideoStreamProcessor,
  NodeVideoProcessor,
};
