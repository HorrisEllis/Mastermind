'use strict';
/**
 * heartbeat.js — Nexus Guardian Heartbeat
 * UUID: guardian-heartbeat-v1-0-0
 * Decoupled from Bridge OS. Zero external deps. SISO-wired.
 *
 * Implements guardian-pulse.eg + guardian-watchman.eg behaviour:
 *   - UDP pulse broadcast on LAN :7777 (peer discovery)
 *   - HTTP health poll every N ms (liveness)
 *   - BPM tracking from inter-beat intervals
 *   - Health score: consistency × latency_grade
 *   - 3 missed beats → degraded event
 *   - 10 missed beats → dead event
 *
 * §5.7 — All output via busEmit callback only. No direct imports.
 * §1.2 — Every missed beat is logged. Nothing silent.
 * §2.3 — getStatus() / listNodes() expose all state for observation.
 *
 * Usage:
 *   const { createHeartbeatManager, createPulseEmitter, createPulseListener } = require('./heartbeat');
 *
 *   // Server — monitor a connected provider
 *   const hb = createHeartbeatManager({ busEmit: bus.emit.bind(bus) });
 *   hb.register('provider-uuid', 'http://127.0.0.1:7820/health');
 *
 *   // Node — announce presence on LAN
 *   const emitter = createPulseEmitter({ uuid: myId, publicKeyB64: myKey });
 *   emitter.start();
 *
 *   // Discovery — listen for peers on LAN
 *   const listener = createPulseListener({ onPulse: (peer) => console.log(peer) });
 *   listener.start();
 */

const dgram = require('dgram');
const http  = require('http');
const https = require('https');

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
  pulsePort:     7777,
  pulseInterval: 5000,   // ms between UDP beats
  healthTimeout: 3000,   // ms before health check times out
  degradeAt:     3,      // missed beats before 'heartbeat:degraded'
  deadAt:        10,     // missed beats before 'heartbeat:dead'
  bpmWindow:     10,     // last N intervals for BPM average
};

// ── BPM tracker ───────────────────────────────────────────────────────────────

function createBPMTracker(windowSize = 10) {
  const intervals = [];
  let lastTs = null;

  function beat() {
    const now = Date.now();
    if (lastTs !== null) {
      intervals.push(now - lastTs);
      if (intervals.length > windowSize) intervals.shift();
    }
    lastTs = now;
    return bpm();
  }

  function bpm() {
    if (!intervals.length) return 0;
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    return avg > 0 ? Math.round(60000 / avg) : 0;
  }

  function consistency() {
    if (intervals.length < 2) return 1.0;
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - avg) ** 2, 0) / intervals.length;
    return Math.max(0, Math.min(1, 1 - Math.sqrt(variance) / Math.max(avg, 1)));
  }

  return { beat, bpm, consistency, intervals: () => [...intervals] };
}

// ── Latency grade (0–1) ───────────────────────────────────────────────────────

function latencyGrade(ms) {
  if (ms <= 50)   return 1.0;
  if (ms <= 150)  return 0.8;
  if (ms <= 500)  return 0.5;
  if (ms <= 1500) return 0.2;
  return 0.0;
}

// ── HTTP health check ─────────────────────────────────────────────────────────

function checkHealth(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t0     = Date.now();
    const client = url.startsWith('https') ? https : http;
    let parsed;
    try { parsed = new URL(url); } catch (_) {
      resolve({ ok: false, latency: 0, error: 'invalid url' }); return;
    }

    const req = client.get({
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname || '/health',
      timeout:  timeoutMs,
    }, (res) => {
      const latency = Date.now() - t0;
      resolve({ ok: res.statusCode === 200, status: res.statusCode, latency });
      res.resume();
    });

    req.on('error',   ()  => resolve({ ok: false, latency: Date.now() - t0 }));
    req.on('timeout', ()  => { req.destroy(); resolve({ ok: false, latency: timeoutMs }); });
  });
}

// ── HeartbeatManager ──────────────────────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {object}   [opts.cfg]        Override DEFAULTS
 * @param {function} [opts.busEmit]    (type, payload, level?) — SISO bus hook
 *                                     type: 'heartbeat:pulse' | 'heartbeat:degraded' | 'heartbeat:dead'
 * @param {object}   [opts.nodeRegistry]  Optional — must implement seen(uuid) and missedBeat(uuid, thresholds)
 */
function createHeartbeatManager({ cfg = {}, busEmit = null, nodeRegistry = null } = {}) {
  const config = { ...DEFAULTS, ...cfg };
  const _nodes = new Map(); // uuid → node state

  // ── Internal emit — §1.2 never swallows ──────────────────────────────────
  function _emit(type, payload, level = 'INFO') {
    if (!busEmit) return;
    try { busEmit(type, payload, level); }
    catch (e) { console.error(`[heartbeat] busEmit failed (${type}):`, e.message); }
  }

  // ── Register a node for monitoring ───────────────────────────────────────
  function register(uuid, healthUrl) {
    if (_nodes.has(uuid)) return;
    _nodes.set(uuid, {
      uuid,
      healthUrl,
      bpmTracker:    createBPMTracker(config.bpmWindow),
      missedBeats:   0,
      lastLatencyMs: null,
      healthScore:   1.0,
      timer:         null,
    });
    _startMonitor(uuid);
    console.log(`[heartbeat] registered: ${uuid.slice(0, 12)}… → ${healthUrl}`);
  }

  function unregister(uuid) {
    const n = _nodes.get(uuid);
    if (n?.timer) clearInterval(n.timer);
    _nodes.delete(uuid);
  }

  function _startMonitor(uuid) {
    const node = _nodes.get(uuid);
    if (!node) return;

    node.timer = setInterval(async () => {
      const { ok, latency } = await checkHealth(node.healthUrl, config.healthTimeout);
      node.lastLatencyMs = latency;

      if (ok) {
        const bpm  = node.bpmTracker.beat();
        const cons = node.bpmTracker.consistency();
        const lgrd = latencyGrade(latency);

        node.healthScore = cons * lgrd;
        node.missedBeats = 0;

        nodeRegistry?.seen(uuid);

        _emit('heartbeat:pulse', {
          uuid, bpm, latency,
          healthScore: node.healthScore,
          consistency: cons,
        }, 'DEBUG');

      } else {
        node.missedBeats++;
        nodeRegistry?.missedBeat(uuid, { degradeAt: config.degradeAt, deadAt: config.deadAt });

        if (node.missedBeats === config.degradeAt) {
          console.warn(`[heartbeat] ${uuid.slice(0, 12)}… degraded (${node.missedBeats} missed)`);
          _emit('heartbeat:degraded', { uuid, missedBeats: node.missedBeats }, 'WARN');
        }

        if (node.missedBeats >= config.deadAt) {
          console.error(`[heartbeat] ${uuid.slice(0, 12)}… dead (${node.missedBeats} missed)`);
          // §5.7 — heartbeat only signals. It never mutates registry directly.
          // The consumer listens to 'heartbeat:dead' and calls nodeRegistry.evict().
          _emit('heartbeat:dead', {
            uuid, missedBeats: node.missedBeats, reason: 'missed_beats',
          }, 'ERROR');
          unregister(uuid); // clean internal state only
        }
      }
    }, config.pulseInterval);
  }

  // ── Query ────────────────────────────────────────────────────────────────
  function getStatus(uuid) {
    const n = _nodes.get(uuid);
    if (!n) return null;
    return {
      uuid,
      bpm:         n.bpmTracker.bpm(),
      consistency: n.bpmTracker.consistency(),
      missedBeats: n.missedBeats,
      latency:     n.lastLatencyMs,
      healthScore: n.healthScore,
      healthUrl:   n.healthUrl,
    };
  }

  function listNodes() {
    return [..._nodes.keys()].map(getStatus);
  }

  return { register, unregister, getStatus, listNodes };
}

// ── PulseEmitter — UDP broadcast on LAN ──────────────────────────────────────

/**
 * §NOTE — LAN Trust Invariant (from Bridge OS, preserved):
 * A node discovered via UDP pulse is NOT automatically trusted.
 * Proximity is not a credential. Full signed handshake required.
 *
 * @param {object} opts
 * @param {string} opts.uuid
 * @param {string} [opts.publicKeyB64]   base64 public key — included in pulse for verification
 * @param {string} [opts.groupHint]      optional group label for multi-tenant discovery
 * @param {number} [opts.port]
 * @param {function} [opts.sign]         optional async (message: string) => base64url signature
 */
function createPulseEmitter({ uuid, publicKeyB64 = null, groupHint = null, port = DEFAULTS.pulsePort, sign = null } = {}) {
  let _socket   = null;
  let _interval = null;

  function start(intervalMs = DEFAULTS.pulseInterval) {
    _socket = dgram.createSocket('udp4');
    _socket.bind(() => {
      _socket.setBroadcast(true);
      _interval = setInterval(_pulse, intervalMs);
      _pulse(); // immediate first beat
    });
    _socket.on('error', (e) => {
      // EADDRINUSE is normal when multiple processes share the port
      if (!e.message.includes('EADDRINUSE'))
        console.error('[heartbeat] UDP emitter error:', e.message);
    });
  }

  async function _pulse() {
    if (!_socket) return;
    const ts  = Date.now();
    const msg = { type: 'nexus:pulse', uuid, publicKey: publicKeyB64, groupHint, ts, sig: null };

    if (sign) {
      try { msg.sig = await sign(String(ts)); } catch (_) {}
    }

    const buf = Buffer.from(JSON.stringify(msg));
    _socket.send(buf, 0, buf.length, port, '255.255.255.255', () => {});
  }

  function stop() {
    clearInterval(_interval);
    _socket?.close();
    _socket = null;
  }

  return { start, stop };
}

// ── PulseListener — hear LAN pulses ──────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {number}   [opts.port]
 * @param {function} opts.onPulse   ({ uuid, publicKey, groupHint, ts, sig, address }) => void
 */
function createPulseListener({ port = DEFAULTS.pulsePort, onPulse } = {}) {
  let _socket = null;

  function start() {
    _socket = dgram.createSocket('udp4');
    _socket.on('message', (msg, rinfo) => {
      try {
        const data = JSON.parse(msg.toString());
        if (data.type !== 'nexus:pulse') return;
        onPulse?.({ ...data, address: rinfo.address });
      } catch (_) {
        // malformed pulse — discard silently (not our bus, not our problem)
      }
    });
    _socket.on('error', () => {});
    _socket.bind(port);
  }

  function stop() {
    _socket?.close();
    _socket = null;
  }

  return { start, stop };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  createHeartbeatManager,
  createPulseEmitter,
  createPulseListener,
  createBPMTracker,
  checkHealth,
  latencyGrade,
};
