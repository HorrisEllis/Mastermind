/**
 * ws-server.js — Local WebSocket server.
 *
 * Runs on localhost:7750. Bridges:
 *   renderer ↔ Node (IPC supplement for streaming data)
 *   virtual camera commands
 *   bitstream monitor events
 *   pipeline events
 *
 * WHY NOT JUST IPC?
 * ─────────────────
 * ipcRenderer.invoke is great for request/response but terrible for
 * continuous high-frequency streaming (video frames, audio chunks,
 * bitstream monitor events). A local WebSocket gives us:
 *   - Binary frame transmission (ArrayBuffer, no serialize overhead)
 *   - Backpressure (WebSocket naturally queues, IPC doesn't)
 *   - Multiple renderer ↔ main channels on one connection
 *   - Future: multiple renderer windows can share the same pipeline
 *
 * PROTOCOL
 * ────────
 * Text frames: JSON envelope { type, payload }
 * Binary frames: first 4 bytes = channel ID (uint32 BE), rest = data
 *
 * Channel IDs (binary):
 *   0x00000001  VIDEO_FRAME    — compressed video frame
 *   0x00000002  AUDIO_CHUNK    — PCM audio chunk
 *   0x00000003  VCAM_FRAME     — virtual camera output frame
 *   0x00000004  BITSTREAM_TICK — bitstream monitor sample
 */

'use strict';

const { WebSocketServer, WebSocket } = require('ws');
const crypto = require('crypto');

// Binary channel constants
const CH = Object.freeze({
  VIDEO_FRAME:    0x00000001,
  AUDIO_CHUNK:    0x00000002,
  VCAM_FRAME:     0x00000003,
  BITSTREAM_TICK: 0x00000004,
});

class WsServer {
  constructor({ port = 7750 } = {}) {
    this._port    = port;
    this._wss     = null;
    this._clients = new Map();  // id → { ws, channels: Set }
    this._handlers = new Map(); // type → Set<fn>
  }

  async start() {
    return new Promise((resolve, reject) => {
      this._wss = new WebSocketServer({ port: this._port, host: '127.0.0.1' });
      this._wss.once('listening', resolve);
      this._wss.once('error', reject);
      this._wss.on('connection', (ws) => this._onConnection(ws));
    });
  }

  stop() {
    for (const { ws } of this._clients.values()) {
      try { ws.close(); } catch (_) {}
    }
    this._clients.clear();
    this._wss?.close();
  }

  // ── Connection lifecycle ───────────────────────────────────────────────────

  _onConnection(ws) {
    const id = crypto.randomBytes(4).toString('hex');
    this._clients.set(id, { ws, channels: new Set(['*']) });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        this._onBinary(id, data);
      } else {
        this._onText(id, data.toString());
      }
    });

    ws.on('close',   () => { this._clients.delete(id); });
    ws.on('error',   (e) => { console.warn(`[WsServer] client ${id} error:`, e.message); });

    // Send welcome with channel info
    this._send(ws, { type: 'welcome', clientId: id, channels: Object.keys(CH) });
    console.log(`[WsServer] client connected: ${id} (total: ${this._clients.size})`);
  }

  _onText(clientId, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const handlers = this._handlers.get(msg.type) ?? new Set();
    for (const fn of handlers) {
      try { fn(msg.payload, clientId); } catch (e) { console.error('[WsServer] handler error:', e); }
    }
  }

  _onBinary(clientId, buf) {
    if (buf.length < 4) return;
    const channelId = buf.readUInt32BE(0);
    const data      = buf.slice(4);
    const handlers  = this._handlers.get(`binary:${channelId}`) ?? new Set();
    for (const fn of handlers) {
      try { fn(data, clientId); } catch (e) { console.error('[WsServer] binary handler error:', e); }
    }
  }

  // ── API ────────────────────────────────────────────────────────────────────

  /** Register a handler for a message type */
  on(type, fn) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(fn);
    return () => this._handlers.get(type)?.delete(fn); // returns unsubscribe
  }

  /** Broadcast JSON to all clients */
  broadcast(msg) {
    const raw = JSON.stringify(msg);
    for (const { ws } of this._clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }

  /** Send binary frame on a channel to all clients */
  broadcastBinary(channelId, data) {
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32BE(channelId, 0);
    const frame = Buffer.concat([header, Buffer.from(data)]);
    for (const { ws } of this._clients.values()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(frame);
      }
    }
  }

  /** Send JSON to one client */
  sendTo(clientId, msg) {
    const client = this._clients.get(clientId);
    if (client) this._send(client.ws, msg);
  }

  _send(ws, msg) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  get clientCount() { return this._clients.size; }
  get CH() { return CH; }
}

module.exports = { WsServer, CH };
