#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK pat-from-pcm  ·  pat-from-pcm.js  ·  v1.4.0                      ║
 * ║  UUID: alk-cli-pat-0000-1300-0000-000000000061                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * CLI: raw float32-LE PCM → tone analysis → .pat binary
 *
 * §1.1 — Nothing pretends. Audio math is codec-equivalent (mirrors
 *         GPGPUAudioProcessor._analyzeFrame() exactly). No ffmpeg.
 * §1.2 — All errors are loud and exit non-zero.
 * §5.5 — Zero external dependencies. Node.js built-ins only.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   # From stdin (pipe from any raw PCM source):
 *   cat audio.raw | node pat-from-pcm.js --session sess-001 --out output.pat
 *
 *   # From file:
 *   node pat-from-pcm.js --input audio.raw --session sess-001 --out output.pat
 *
 *   # Batch directory (all .raw files in dir):
 *   node pat-from-pcm.js --dir ./recordings --outdir ./patterns
 *
 *   # Print JSON instead of binary:
 *   node pat-from-pcm.js --input audio.raw --json
 *
 *   # Pipe to ALK kernel (stdout JSON lines):
 *   node pat-from-pcm.js --input audio.raw --jsonl | node your-kernel-consumer.js
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INPUT FORMAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Raw float32-LE PCM, 16kHz, mono, no header.
 *   4 bytes per sample. Standard output of:
 *     - NexusCodec GPGPUAudioProcessor (codec.js)
 *     - Any tool outputting raw f32le audio
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * .pat BINARY FORMAT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Header (68 bytes):
 *     [0-3]   Magic: 'PAT1' (4 bytes ASCII)
 *     [4]     Version: 0x03 (1 byte)
 *     [5-36]  Session ID: UTF-8, zero-padded to 32 bytes
 *     [37-44] Start timestamp: uint64 ms (8 bytes, BigInt)
 *     [45-52] End timestamp:   uint64 ms (8 bytes, BigInt)
 *     [53-56] Chunk count:     uint32 (4 bytes)
 *     [57-60] Sample rate:     uint32 Hz (4 bytes)
 *     [61-64] Chunk duration:  uint32 ms (4 bytes)
 *     [65-67] Reserved:        0x000000 (3 bytes padding)
 *
 *   Body (32 bytes × chunk count):
 *     [0-3]   Timestamp offset from start: uint32 ms
 *     [4-7]   Energy:           float32
 *     [8-11]  ZCR:              float32
 *     [12-15] Spectral centroid:float32
 *     [16-19] Cadence:          float32
 *     [20-23] Sentiment:        float32  (0.0 when no transcript)
 *     [24-27] Energy z-score:   float32
 *     [28]    Flags: bit0=silence, bit1=shift, bit2=hasTranscript,
 *                    bit3=energyAnomaly, bit4=cadenceAnomaly
 *     [29-31] Reserved: 0x000000
 */

import fs   from 'fs';
import path from 'path';

// ─── Constants ────────────────────────────────────────────────────────────────

const SAMPLE_RATE      = 16_000;  // Hz — float32-LE PCM expected at this rate
const FRAME_SIZE       = 128;     // samples per analysis frame (~8ms at 16kHz)
const CHUNK_MS         = 500;     // ms per .pat chunk (aggregate N frames)
const FRAMES_PER_CHUNK = Math.floor((SAMPLE_RATE * CHUNK_MS / 1000) / FRAME_SIZE);
const ROLLING_WINDOW   = 20;      // rolling stats window (matches codec.js)
const ENERGY_SIGMA_ALERT = 2.0;
const CADENCE_HISTORY  = 60;      // frames of energy history for cadence

const PAT_MAGIC        = Buffer.from('PAT1');
const PAT_VERSION      = 0x03;
const HEADER_SIZE      = 68;
const CHUNK_RECORD_SIZE= 32;

// ─── Rolling stats (mirrors codec.js RollingStats exactly) ───────────────────

class RollingStats {
  constructor(w = ROLLING_WINDOW) {
    this._w=w; this._buf=[]; this._sum=0; this._sum2=0;
  }
  push(v) {
    if (this._buf.length>=this._w){const o=this._buf.shift();this._sum-=o;this._sum2-=o*o;}
    this._buf.push(v);this._sum+=v;this._sum2+=v*v;
    return this;
  }
  get mean()     { return this._buf.length?this._sum/this._buf.length:0; }
  get variance() { const n=this._buf.length;if(n<2)return 0;return Math.max(0,this._sum2/n-(this._sum/n)**2); }
  get sigma()    { return Math.sqrt(this.variance); }
  get last()     { return this._buf[this._buf.length-1]??0; }
  zScore(v)      { return this.sigma>0?(v-this.mean)/this.sigma:0; }
  measure(v) {
    const prev=this.last; this.push(v);
    return { mean:this.mean, sigma:this.sigma, delta:v-prev,
             zScore:this.zScore(v), anomaly:Math.abs(this.zScore(v))>ENERGY_SIGMA_ALERT };
  }
}

// ─── Audio frame analysis (mirrors GPGPUAudioProcessor._analyzeFrame exactly) ─

class FrameAnalyzer {
  constructor() {
    this._energyStats  = new RollingStats();
    this._cadenceStats = new RollingStats();
    this._energyHistory= [];
  }

  analyzeFrame(samples) {
    // RMS energy
    let sum = 0;
    for (let i=0;i<samples.length;i++) sum += samples[i]*samples[i];
    const energy = Math.sqrt(sum/samples.length);

    // ZCR
    let crossings = 0;
    for (let i=1;i<samples.length;i++) {
      if ((samples[i]>=0)!==(samples[i-1]>=0)) crossings++;
    }
    const zcr = crossings/samples.length;

    // Spectral centroid (two-band approximation — identical to codec.js §1.1)
    const n=samples.length, split=Math.floor(n/4);
    let lo=0,hi=0;
    for (let i=0;i<n;i++) {
      const e=samples[i]*samples[i];
      if (i<split*2) lo+=e; else hi+=e;
    }
    const spectralCentroid=(lo+hi)>0?hi/(lo+hi):0;

    // Cadence (energy peaks per second)
    this._energyHistory.push(energy);
    if (this._energyHistory.length>CADENCE_HISTORY) this._energyHistory.shift();
    const avg=this._energyHistory.reduce((s,v)=>s+v,0)/this._energyHistory.length;
    let peaks=0;
    for (let i=1;i<this._energyHistory.length-1;i++) {
      if (this._energyHistory[i]>avg*1.2 &&
          this._energyHistory[i]>this._energyHistory[i-1] &&
          this._energyHistory[i]>this._energyHistory[i+1]) peaks++;
    }
    const cadence=(this._energyHistory.length*0.016)>0
      ? peaks/(this._energyHistory.length*0.016) : 0;

    const silence = energy < 0.01;
    const em      = this._energyStats.measure(energy);
    const cm      = this._cadenceStats.measure(cadence);

    return {
      energy:           Math.round(energy*10000)/10000,
      zcr:              Math.round(zcr*10000)/10000,
      spectralCentroid: Math.round(spectralCentroid*10000)/10000,
      cadence:          Math.round(cadence*10000)/10000,
      silence,
      energyDelta:      em.delta,
      energySigma:      em.sigma,
      energyZ:          em.zScore,
      energyAnomaly:    em.anomaly,
      cadenceDelta:     cm.delta,
      cadenceSigma:     cm.sigma,
      cadenceAnomaly:   cm.anomaly,
    };
  }

  /** Aggregate N frame results into one chunk record */
  aggregateChunk(frames) {
    if (!frames.length) return null;
    const avg = k => frames.reduce((s,f)=>s+(f[k]??0),0)/frames.length;
    const r4  = v => Math.round(v*10000)/10000;
    const silentFrames = frames.filter(f=>f.silence).length;
    const anomalyFrames= frames.filter(f=>f.energyAnomaly).length;
    const shiftFrames  = frames.filter(f=>f.energyAnomaly||f.cadenceAnomaly).length;
    return {
      energy:           r4(avg('energy')),
      zcr:              r4(avg('zcr')),
      spectralCentroid: r4(avg('spectralCentroid')),
      cadence:          r4(avg('cadence')),
      energyZ:          r4(avg('energyZ')),
      silence:          silentFrames/frames.length > 0.5,
      energyAnomaly:    anomalyFrames/frames.length > 0.3,
      cadenceAnomaly:   frames.some(f=>f.cadenceAnomaly),
      shift:            shiftFrames > 2,
    };
  }
}

// ─── PatEncoder ───────────────────────────────────────────────────────────────

/**
 * PatEncoder — writes .pat binary from chunk records.
 * §1.1 — Format documented in file header above.
 * §1.2 — Throws on malformed input, never truncates silently.
 */
class PatEncoder {
  constructor({ sessionId = 'unknown', sampleRate = SAMPLE_RATE, chunkMs = CHUNK_MS } = {}) {
    this._sessionId  = sessionId;
    this._sampleRate = sampleRate;
    this._chunkMs    = chunkMs;
    this._chunks     = [];
    this._startTs    = null;
    this._endTs      = null;
  }

  addChunk(chunkRecord, offsetMs) {
    if (this._startTs === null) this._startTs = Date.now() - offsetMs;
    this._endTs = Date.now();
    this._chunks.push({ ...chunkRecord, offsetMs });
  }

  encode() {
    if (!this._chunks.length) throw new Error('[PatEncoder] No chunks to encode');

    const startTs  = BigInt(this._startTs ?? Date.now());
    const endTs    = BigInt(this._endTs   ?? Date.now());
    const count    = this._chunks.length;
    const totalSize= HEADER_SIZE + count * CHUNK_RECORD_SIZE;
    const buf      = Buffer.alloc(totalSize, 0);

    // ── Header ─────────────────────────────────────────────────────────────
    PAT_MAGIC.copy(buf, 0);
    buf.writeUInt8(PAT_VERSION, 4);

    // Session ID: zero-padded UTF-8 to 32 bytes
    const sidBytes = Buffer.from(this._sessionId.slice(0, 32), 'utf8');
    sidBytes.copy(buf, 5);

    buf.writeBigUInt64BE(startTs,            37);
    buf.writeBigUInt64BE(endTs,              45);
    buf.writeUInt32BE(count,                 53);
    buf.writeUInt32BE(this._sampleRate,      57);
    buf.writeUInt32BE(this._chunkMs,         61);

    // ── Body ────────────────────────────────────────────────────────────────
    for (let i = 0; i < count; i++) {
      const offset = HEADER_SIZE + i * CHUNK_RECORD_SIZE;
      const c      = this._chunks[i];

      buf.writeUInt32BE(Math.round(c.offsetMs),         offset);
      buf.writeFloatBE(c.energy            ?? 0,        offset + 4);
      buf.writeFloatBE(c.zcr               ?? 0,        offset + 8);
      buf.writeFloatBE(c.spectralCentroid  ?? 0,        offset + 12);
      buf.writeFloatBE(c.cadence           ?? 0,        offset + 16);
      buf.writeFloatBE(c.sentiment         ?? 0,        offset + 20);
      buf.writeFloatBE(c.energyZ           ?? 0,        offset + 24);

      let flags = 0;
      if (c.silence)        flags |= 0b00001;
      if (c.shift)          flags |= 0b00010;
      if (c.hasTranscript)  flags |= 0b00100;
      if (c.energyAnomaly)  flags |= 0b01000;
      if (c.cadenceAnomaly) flags |= 0b10000;
      buf.writeUInt8(flags, offset + 28);
      // [29-31] reserved = 0x000000 (already zeroed)
    }

    return buf;
  }

  /** Decode a .pat buffer → JS object (for --json flag) */
  static decode(buf) {
    if (buf.length < HEADER_SIZE) throw new Error('[PatEncoder] Buffer too small for header');
    const magic = buf.slice(0,4).toString('ascii');
    if (magic !== 'PAT1') throw new Error(`[PatEncoder] Invalid magic: ${magic}`);

    const version    = buf.readUInt8(4);
    const sessionId  = buf.slice(5,37).toString('utf8').replace(/\0+$/,'');
    const startTs    = Number(buf.readBigUInt64BE(37));
    const endTs      = Number(buf.readBigUInt64BE(45));
    const count      = buf.readUInt32BE(53);
    const sampleRate = buf.readUInt32BE(57);
    const chunkMs    = buf.readUInt32BE(61);

    const chunks = [];
    for (let i=0;i<count;i++) {
      const off   = HEADER_SIZE + i*CHUNK_RECORD_SIZE;
      const flags = buf.readUInt8(off+28);
      chunks.push({
        offsetMs:        buf.readUInt32BE(off),
        energy:          buf.readFloatBE(off+4),
        zcr:             buf.readFloatBE(off+8),
        spectralCentroid:buf.readFloatBE(off+12),
        cadence:         buf.readFloatBE(off+16),
        sentiment:       buf.readFloatBE(off+20),
        energyZ:         buf.readFloatBE(off+24),
        silence:        !!(flags&0b00001),
        shift:          !!(flags&0b00010),
        hasTranscript:  !!(flags&0b00100),
        energyAnomaly:  !!(flags&0b01000),
        cadenceAnomaly: !!(flags&0b10000),
      });
    }

    return { version, sessionId, startTs, endTs, count, sampleRate, chunkMs, chunks };
  }
}

// ─── PCM processor ───────────────────────────────────────────────────────────

/**
 * Process a Buffer of raw float32-LE PCM into an array of chunk records.
 * §1.2 — throws if buffer is not a multiple of 4 bytes.
 */
function processPCM(pcmBuffer, sessionId) {
  if (pcmBuffer.length % 4 !== 0) {
    throw new Error(`[pat-from-pcm] PCM buffer length (${pcmBuffer.length}) is not a multiple of 4`);
  }

  const sampleCount = pcmBuffer.length / 4;
  const samples     = new Float32Array(sampleCount);
  for (let i=0;i<sampleCount;i++) samples[i] = pcmBuffer.readFloatLE(i*4);

  const analyzer    = new FrameAnalyzer();
  const encoder     = new PatEncoder({ sessionId });
  const frameResults= [];
  let   offsetMs    = 0;
  let   chunkFrames = [];

  for (let i=0;i<sampleCount;i+=FRAME_SIZE) {
    const end   = Math.min(i+FRAME_SIZE, sampleCount);
    const frame = samples.slice(i, end);

    // Pad last frame if needed
    const padded = frame.length < FRAME_SIZE
      ? new Float32Array(FRAME_SIZE).map((_,k) => frame[k] ?? 0)
      : frame;

    const frameResult = analyzer.analyzeFrame(padded);
    chunkFrames.push(frameResult);

    if (chunkFrames.length >= FRAMES_PER_CHUNK) {
      const chunk = analyzer.aggregateChunk(chunkFrames);
      encoder.addChunk(chunk, offsetMs);
      offsetMs    += CHUNK_MS;
      chunkFrames  = [];
    }
  }

  // Flush remaining frames
  if (chunkFrames.length > 0) {
    const chunk = analyzer.aggregateChunk(chunkFrames);
    encoder.addChunk(chunk, offsetMs);
  }

  return encoder;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (let i=2;i<argv.length;i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i+1] && !argv[i+1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    }
  }
  return args;
}

function readStream(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', d => chunks.push(d));
    stream.on('end',  () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

async function processFile(inputPath, { sessionId, outPath, json, jsonl, verbose }) {
  if (verbose) process.stderr.write(`[pat-from-pcm] Processing: ${inputPath}\n`);

  const pcm = fs.readFileSync(inputPath);
  const sid = sessionId ?? `pat-${path.basename(inputPath,'.raw')}-${Date.now().toString(36)}`;

  const encoder = processPCM(pcm, sid);
  const patBuf  = encoder.encode();

  if (json) {
    process.stdout.write(JSON.stringify(PatEncoder.decode(patBuf), null, 2) + '\n');
  } else if (jsonl) {
    const decoded = PatEncoder.decode(patBuf);
    for (const chunk of decoded.chunks) {
      process.stdout.write(JSON.stringify({ sessionId:sid, ...chunk }) + '\n');
    }
  } else {
    const out = outPath ?? inputPath.replace(/\.raw$/, '') + '.pat';
    fs.writeFileSync(out, patBuf);
    if (verbose) process.stderr.write(`[pat-from-pcm] Written: ${out} (${patBuf.length} bytes, ${encoder._chunks.length} chunks)\n`);
  }

  return { inputPath, chunks: encoder._chunks.length, bytes: patBuf.length };
}

async function main() {
  const args = parseArgs(process.argv);

  // ── --decode: inspect existing .pat file ──────────────────────────────────
  if (args.decode) {
    const buf     = fs.readFileSync(args.decode);
    const decoded = PatEncoder.decode(buf);
    process.stdout.write(JSON.stringify(decoded, null, 2) + '\n');
    return;
  }

  // ── --dir: batch process directory ────────────────────────────────────────
  if (args.dir) {
    const outdir = args.outdir ?? args.dir;
    if (!fs.existsSync(outdir)) fs.mkdirSync(outdir, { recursive: true });

    const files = fs.readdirSync(args.dir)
      .filter(f => f.endsWith('.raw'))
      .map(f => path.join(args.dir, f));

    if (!files.length) {
      process.stderr.write('[pat-from-pcm] No .raw files found in directory\n');
      process.exit(1);
    }

    let total = 0, failed = 0;
    for (const f of files) {
      try {
        const outPath = path.join(outdir, path.basename(f,'.raw') + '.pat');
        const result  = await processFile(f, {
          sessionId: args.session,
          outPath,
          json:    !!args.json,
          jsonl:   !!args.jsonl,
          verbose: !!args.verbose,
        });
        total++;
        if (args.verbose) process.stderr.write(`  ✓ ${path.basename(f)} → ${result.chunks} chunks\n`);
      } catch (err) {
        failed++;
        process.stderr.write(`  ✗ ${path.basename(f)}: ${err.message}\n`);
      }
    }

    process.stderr.write(`[pat-from-pcm] Done: ${total} processed, ${failed} failed\n`);
    if (failed > 0) process.exit(1);
    return;
  }

  // ── --input: single file ──────────────────────────────────────────────────
  if (args.input) {
    if (!fs.existsSync(args.input)) {
      process.stderr.write(`[pat-from-pcm] File not found: ${args.input}\n`);
      process.exit(1);
    }
    try {
      await processFile(args.input, {
        sessionId: args.session,
        outPath:   args.out,
        json:      !!args.json,
        jsonl:     !!args.jsonl,
        verbose:   !!args.verbose,
      });
    } catch (err) {
      process.stderr.write(`[pat-from-pcm] Error: ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  // ── stdin mode ────────────────────────────────────────────────────────────
  if (!process.stdin.isTTY || args.stdin) {
    try {
      const pcm = await readStream(process.stdin);
      if (!pcm.length) {
        process.stderr.write('[pat-from-pcm] No data received on stdin\n');
        process.exit(1);
      }

      const sid     = args.session ?? `stdin-${Date.now().toString(36)}`;
      const encoder = processPCM(pcm, sid);
      const patBuf  = encoder.encode();

      if (args.json) {
        process.stdout.write(JSON.stringify(PatEncoder.decode(patBuf), null, 2) + '\n');
      } else if (args.jsonl) {
        const decoded = PatEncoder.decode(patBuf);
        for (const chunk of decoded.chunks) {
          process.stdout.write(JSON.stringify({ sessionId:sid, ...chunk }) + '\n');
        }
      } else if (args.out) {
        fs.writeFileSync(args.out, patBuf);
        if (args.verbose) process.stderr.write(`[pat-from-pcm] Written: ${args.out} (${patBuf.length} bytes)\n`);
      } else {
        // Binary to stdout
        process.stdout.write(patBuf);
      }
    } catch (err) {
      process.stderr.write(`[pat-from-pcm] Error: ${err.message}\n`);
      process.exit(1);
    }
    return;
  }

  // ── No input ──────────────────────────────────────────────────────────────
  process.stderr.write(`
pat-from-pcm v1.4.0 — raw float32-LE PCM → .pat binary

USAGE
  cat audio.raw | node pat-from-pcm.js [options]
  node pat-from-pcm.js --input audio.raw [options]
  node pat-from-pcm.js --dir ./recordings --outdir ./patterns

OPTIONS
  --input FILE     Input .raw file (float32-LE PCM, 16kHz mono)
  --out FILE       Output .pat file (default: input.pat)
  --session ID     Session ID string (default: auto-generated)
  --dir DIR        Batch process all .raw files in directory
  --outdir DIR     Output directory for batch mode (default: --dir)
  --decode FILE    Decode and print an existing .pat file as JSON
  --json           Output decoded JSON instead of binary
  --jsonl          Output one JSON line per chunk (for streaming consumers)
  --verbose        Print progress to stderr
  --stdin          Force stdin mode (auto-detected if stdin is pipe)

INPUT FORMAT
  Raw float32-LE PCM, 16kHz, mono, no header.
  4 bytes per sample.

OUTPUT FORMAT (.pat)
  64-byte header + 32 bytes per 500ms chunk.
  See file header for full format spec.
`);
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`[pat-from-pcm] Fatal: ${err.message}\n`);
  process.exit(1);
});

export { PatEncoder, FrameAnalyzer, processPCM };
