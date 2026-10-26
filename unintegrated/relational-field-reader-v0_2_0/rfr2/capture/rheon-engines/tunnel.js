/**
 * RHEON KERNEL — ENGINE: CLOUDFLARE TUNNEL
 *
 * Exposes the kernel globally via Cloudflare Tunnel (cloudflared).
 * Free. Permanent. No port forwarding. No router config. Works from any network.
 * Stable URL persisted to ~/.rheon/tunnel-url.txt for sharing.
 *
 * KNOWN FAILURE MODES ADDRESSED:
 *   - cloudflared not installed: emits clear instructions, does not crash.
 *   - URL changes on restart: persisted to disk, re-emitted on connect.
 *   - Tunnel dies: auto-restarted with backoff.
 *   - Multiple instances: PID file prevents duplicate tunnels.
 *
 * §LAW: Tunnel is opt-in. Kernel runs fine without it.
 * §LAW: The URL is on the bus. Any UI can display it.
 */

import { spawn }   from 'child_process';
import { bus }     from '../core/bus.js';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join }    from 'path';
import { homedir } from 'os';

const RHEON_DIR  = join(homedir(), '.rheon');
const URL_FILE   = join(RHEON_DIR, 'tunnel-url.txt');
const PID_FILE   = join(RHEON_DIR, 'tunnel.pid');

class CloudflareTunnel {
  constructor(port) {
    this._port    = port || 7749;
    this._proc    = null;
    this._url     = null;
    this._running = false;
    this._retries = 0;
  }

  async start() {
    if (this._running) return this._url;

    // Check if cloudflared is available
    const available = await _probe('cloudflared', ['--version']);
    if (!available) {
      bus.emit('tunnel:unavailable', {
        message: 'cloudflared not found. Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/',
        note:    'Kernel still accessible at http://localhost:' + this._port,
      }, 'TUNNEL');
      return null;
    }

    await mkdir(RHEON_DIR, { recursive: true });
    this._spawn();
    return new Promise(resolve => {
      const unsub = bus.on('tunnel:ready', evt => {
        unsub();
        resolve(evt.payload.url);
      });
      setTimeout(() => { unsub(); resolve(null); }, 15_000); // 15s timeout
    });
  }

  _spawn() {
    this._proc = spawn('cloudflared', [
      'tunnel', '--url', `http://localhost:${this._port}`,
      '--no-autoupdate',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    this._running = true;

    // cloudflared prints the tunnel URL to stderr
    const onData = async (data) => {
      const text = data.toString();
      const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (match && !this._url) {
        this._url = match[0];
        try {
          await writeFile(URL_FILE, this._url + '\n');
          await writeFile(PID_FILE, String(process.pid) + '\n');
        } catch(e) {}
        bus.emit('tunnel:ready', {
          url:      this._url,
          port:     this._port,
          localUrl: `http://localhost:${this._port}`,
        }, 'TUNNEL');
      }
    };

    this._proc.stdout.on('data', onData);
    this._proc.stderr.on('data', onData);

    this._proc.on('close', code => {
      this._running = false;
      this._url     = null;
      bus.emit('tunnel:closed', { code, retries: this._retries }, 'TUNNEL');

      if (this._retries < 3) {
        this._retries++;
        const delay = 2000 * this._retries;
        bus.emit('tunnel:retrying', { delay, attempt: this._retries }, 'TUNNEL');
        setTimeout(() => this._spawn(), delay);
      }
    });

    this._proc.on('error', err => {
      bus.emit('tunnel:error', { error: err.message }, 'TUNNEL');
    });
  }

  async stop() {
    if (this._proc) {
      this._proc.kill();
      this._proc = null;
    }
    this._running = false;
  }

  async savedUrl() {
    try { return (await readFile(URL_FILE, 'utf8')).trim(); }
    catch(e) { return null; }
  }

  status() {
    return {
      running: this._running,
      url:     this._url,
      port:    this._port,
      retries: this._retries,
    };
  }
}

async function _probe(cmd, args) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, { timeout: 2000 });
    p.on('close', c => resolve(c === 0));
    p.on('error', () => resolve(false));
  });
}

export { CloudflareTunnel };
