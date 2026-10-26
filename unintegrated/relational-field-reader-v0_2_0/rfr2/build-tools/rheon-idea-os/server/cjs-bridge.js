/**
 * cjs-bridge.js — ESM wrapper for CJS modules (nano-ws, heartbeat)
 *
 * The project is ESM ("type": "module"). nano-ws.cjs and heartbeat.cjs
 * are CJS (require/module.exports). This bridge imports them via
 * createRequire — zero modification to the source files (§5.3).
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const { WebSocketServer, WebSocket, NanoSocket } =
  require(path.join(__dirname, 'nano-ws.cjs'));

export const {
  createHeartbeatManager,
  createPulseEmitter,
  createPulseListener,
  createBPMTracker,
  checkHealth,
  latencyGrade,
} = require(path.join(__dirname, 'heartbeat.cjs'));
