// ═══════════════════════════════════════════════════════════════════
// PHONE MIC
// foundation/ai/phone-mic.js
//
// Main process. A tiny server that lets a phone act as an input device.
//
// ─────────────────────────────────────────────────────────────────
// THE CONSTRAINT THAT DECIDES EVERYTHING
//
// getUserMedia requires a SECURE CONTEXT. A phone opening
// http://192.168.1.20:8443 gets no microphone at all — the API is not
// merely blocked, it is undefined. localhost is exempt; the phone is
// not localhost.
//
// So plain HTTP is not an option, and neither is UPnP port forwarding
// (which gives you an internet-exposed port and still no microphone,
// while removing the one thing making this safe: that it is LAN-only).
//
// That leaves two ways to get a secure context, and they trade against
// each other:
//
//   LAN + self-signed TLS   audio never leaves your network. The phone
//                           shows a certificate warning once, which you
//                           accept. THIS IS THE DEFAULT.
//
//   Cloudflare Tunnel       a trusted certificate and no warning — but
//                           TLS TERMINATES AT CLOUDFLARE'S EDGE. Your
//                           voice passes through their infrastructure in
//                           the clear before being re-encrypted to you.
//
// The second directly contradicts DR-004, which exists because
// webkitSpeechRecognition was quietly sending audio to Google. Routing
// the microphone through a CDN to avoid a certificate warning is the
// same trade with better branding. It is available, it is off, and
// turning it on says exactly what it does.
//
// ─────────────────────────────────────────────────────────────────
// AND IT IS AUTHENTICATED
//
// An open audio endpoint on your LAN is a way for anyone on the network
// to stream INTO your vault. Every session mints a single-use token,
// carried in the URL and required on the socket. No token, no upgrade.
//
// UUID: 4a3b2c1d-ai-8000-8000-phonemic0001
// ═══════════════════════════════════════════════════════════════════

'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const STATE = {
  server: null,
  wss: null,
  port: 0,
  token: null,
  url: null,
  mode: 'lan',           // 'lan' | 'tunnel'
  tunnelProcess: null,   // the spawned cloudflared child, tunnel mode only
  connected: false,
  onAudio: null,         // (Buffer) => void
  onStatus: null,
  bytes: 0,
};

// ── Address ────────────────────────────────────────────────────────
// The phone needs a routable address, not 127.0.0.1. Prefer a private
// range: a public address here would mean the machine is directly
// exposed, which is not a situation to quietly bind a microphone to.

function lanAddress() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const list of Object.values(ifaces)) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const priv = /^10\./.test(i.address)
        || /^192\.168\./.test(i.address)
        || /^172\.(1[6-9]|2\d|3[01])\./.test(i.address);
      candidates.push({ address: i.address, priv });
    }
  }
  const p = candidates.find(c => c.priv);
  return p ? p.address : (candidates[0] ? candidates[0].address : null);
}

// ── Certificate ────────────────────────────────────────────────────
// Self-signed, generated once, kept in the data folder. Node can build
// a keypair but not sign an X.509 certificate, so this uses openssl
// when present and says so plainly when it is not — rather than falling
// back to HTTP, which would produce a page with no microphone and no
// explanation.

function ensureCert(dataDir) {
  const dir = path.join(dataDir, 'phone-mic');
  fs.mkdirSync(dir, { recursive: true });
  const keyFile = path.join(dir, 'key.pem');
  const certFile = path.join(dir, 'cert.pem');

  if (fs.existsSync(keyFile) && fs.existsSync(certFile)) {
    return { ok: true, key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile), reused: true };
  }

  const ip = lanAddress();
  const { execFileSync } = require('child_process');
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', keyFile, '-out', certFile,
      '-days', '825', '-subj', '/CN=MASTERMIND phone input',
      '-addext', 'subjectAltName=IP:' + (ip || '127.0.0.1') + ',DNS:localhost',
    ], { stdio: 'pipe' });
  } catch (e) {
    return {
      ok: false,
      reason: 'NO_OPENSSL',
      message: 'A certificate is required — a phone cannot use its microphone over plain HTTP, ' +
               'the browser API is simply absent. openssl was not found on this machine. ' +
               'Install it, or use the tunnel option and accept that audio transits a third party.',
    };
  }
  return { ok: true, key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile), reused: false };
}

// ── The page ───────────────────────────────────────────────────────
// Served inline. One file, no build step, no CDN — a page that pulled a
// script from a CDN would be a third party in the audio path.

function page(token) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>MASTERMIND \u2014 phone input</title>
<style>
  body{margin:0;background:#02040a;color:#e8f4ff;font-family:system-ui,-apple-system,sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:22px}
  #orb{width:150px;height:150px;border-radius:50%;border:2px solid rgba(119,68,255,.5);
       background:radial-gradient(circle at 40% 35%,rgba(119,68,255,.3),rgba(119,68,255,.05));
       display:flex;align-items:center;justify-content:center;font-size:44px;cursor:pointer;
       -webkit-tap-highlight-color:transparent;transition:all .25s}
  #orb.on{border-color:rgba(255,51,85,.85);background:radial-gradient(circle at 40% 35%,rgba(255,51,85,.35),rgba(255,51,85,.06));
          animation:p 1.3s ease-in-out infinite}
  @keyframes p{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
  #s{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7788aa;text-align:center;padding:0 24px;line-height:1.7}
  #lvl{width:220px;height:3px;background:#1a2030}#lvlf{height:100%;width:0;background:#7744ff;transition:width .08s}
</style></head><body>
<div id="orb">\u25c9</div><div id="lvl"><div id="lvlf"></div></div><div id="s">TAP TO STREAM</div>
<script>
const T=${JSON.stringify(token)};let ws,ctx,node,stream,on=false;
const orb=document.getElementById('orb'),st=document.getElementById('s'),lf=document.getElementById('lvlf');
orb.onclick=async()=>{ on?stop():await start(); };
async function start(){
  try{ stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:true}}); }
  catch(e){ st.textContent='MICROPHONE REFUSED \\u2014 '+e.name; return; }
  ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+'/s?t='+encodeURIComponent(T));
  ws.binaryType='arraybuffer';
  ws.onopen=()=>{ on=true;orb.classList.add('on');orb.textContent='\\u25a0';st.textContent='STREAMING TO MASTERMIND'; };
  ws.onclose=()=>{ st.textContent= on?'DISCONNECTED':'TAP TO STREAM'; stop(); };
  ws.onerror=()=>{ st.textContent='CONNECTION FAILED'; };
  ctx=new (window.AudioContext||window.webkitAudioContext)({sampleRate:48000});
  const src=ctx.createMediaStreamSource(stream);
  node=ctx.createScriptProcessor(4096,1,1);
  node.onaudioprocess=(e)=>{
    if(!on||!ws||ws.readyState!==1)return;
    const f=e.inputBuffer.getChannelData(0);
    let s=0;for(let i=0;i<f.length;i++)s+=f[i]*f[i];
    lf.style.width=Math.min(100,Math.sqrt(s/f.length)*400)+'%';
    // Int16 on the wire: half the bytes of Float32 and the exact format
    // whisper wants, so nothing has to convert twice.
    const pcm=new Int16Array(f.length);
    for(let i=0;i<f.length;i++){const v=Math.max(-1,Math.min(1,f[i]));pcm[i]=v<0?v*0x8000:v*0x7fff;}
    ws.send(pcm.buffer);
  };
  const g=ctx.createGain();g.gain.value=0;
  src.connect(node);node.connect(g);g.connect(ctx.destination);
}
function stop(){
  on=false;orb.classList.remove('on');orb.textContent='\\u25c9';lf.style.width='0';
  try{node&&node.disconnect();}catch(e){}
  try{stream&&stream.getTracks().forEach(t=>t.stop());}catch(e){}
  try{ctx&&ctx.close();}catch(e){}
  try{ws&&ws.close();}catch(e){}
  st.textContent='TAP TO STREAM';
}
</script></body></html>`;
}

// ── Server ─────────────────────────────────────────────────────────

// ── Cloudflare Tunnel (opt-in only — see this file's header) ────────
// Same discovery pattern as foundation/ai/whisper.js's candidatePaths():
// the packaged app's bundled resources folder first, then PATH, so a
// person who already has cloudflared installed doesn't need the
// bundled copy at all.
function cloudflaredCandidatePaths() {
  const exe = process.platform === 'win32' ? '.exe' : '';
  return [
    path.join(process.resourcesPath || '.', 'cloudflared', 'cloudflared' + exe),
    path.join(__dirname, '..', '..', 'resources', 'cloudflared', 'cloudflared' + exe), // BUILD_DEV.bat, unpackaged
    'cloudflared' + exe, // on PATH
  ];
}

function detectCloudflared() {
  const { execFileSync } = require('child_process');
  for (const p of cloudflaredCandidatePaths()) {
    try {
      const out = execFileSync(p, ['--version'], { timeout: 5000, stdio: 'pipe' }).toString();
      if (/cloudflared/i.test(out)) return { ok: true, binPath: p };
    } catch (e) { /* try the next candidate */ }
  }
  return {
    ok: false,
    reason: 'CLOUDFLARED_NOT_FOUND',
    message: 'cloudflared is not available on this machine, so Tunnel mode can\u2019t start. ' +
             'LAN mode does not need it and works without it. To use Tunnel mode: build with ' +
             'BUILD.bat (fetches it automatically), or install cloudflared yourself and make sure ' +
             'it is on PATH.',
  };
}

// Cloudflare's "quick tunnel" prints its generated URL to stderr inside
// a bordered box; the exact formatting has changed across versions, so
// this matches only the one thing guaranteed stable: the URL itself.
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function startTunnel(localPort) {
  return new Promise((resolve, reject) => {
    const detected = detectCloudflared();
    if (!detected.ok) { reject(new Error(detected.message)); return; }

    const { spawn } = require('child_process');
    const proc = spawn(detected.binPath, ['tunnel', '--url', 'http://localhost:' + localPort], { stdio: 'pipe' });
    STATE.tunnelProcess = proc;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { proc.kill(); } catch (e) {}
      reject(new Error('cloudflared did not report a tunnel URL within 20s — it may still be starting; try again, or check that this machine has outbound internet access.'));
    }, 20000);

    const onData = (buf) => {
      const text = buf.toString();
      const match = text.match(TUNNEL_URL_RE);
      if (match && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve(match[0]);
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData); // cloudflared logs to stderr by default, not stdout

    proc.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('cloudflared failed to start: ' + e.message));
    });
    proc.on('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error('cloudflared exited before reporting a tunnel URL (code ' + code + ')'));
    });
  });
}

async function start(opts) {
  const o = opts || {};
  if (STATE.server) return { ok: true, already: true, url: STATE.url, token: STATE.token };
  if (!o.dataDir) return { ok: false, reason: 'NO_DATA_DIR' };

  STATE.mode = o.mode === 'tunnel' ? 'tunnel' : 'lan';

  // Tunnel mode skips the self-signed cert entirely — Cloudflare
  // terminates TLS at its own edge with a real, trusted certificate,
  // and connects to this LOCAL server over plain HTTP internally. This
  // is also exactly the reason DR-004 flags tunnel mode: TLS
  // terminating somewhere that isn't this machine means audio is
  // genuinely readable, in the clear, at that midpoint.
  let cert = null;
  if (STATE.mode === 'lan') {
    cert = ensureCert(o.dataDir);
    if (!cert.ok) return cert;
  }

  STATE.token = crypto.randomBytes(24).toString('base64url');
  STATE.bytes = 0;

  const handler = (req, res) => {
    const u = new URL(req.url, 'https://x');
    if (u.pathname === '/' ) {
      // The token is in the URL, so the page is only reachable by someone
      // holding the link. Not a substitute for the socket check.
      if (u.searchParams.get('t') !== STATE.token) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        return res.end('This link is not valid. Open MASTERMIND and generate a new one.');
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(page(STATE.token));
    }
    res.writeHead(404); res.end();
  };

  STATE.server = STATE.mode === 'tunnel' ? http.createServer(handler) : https.createServer({ key: cert.key, cert: cert.cert }, handler);

  // Minimal RFC 6455 server frame reader. A dependency here would put a
  // third party in the audio path for the sake of ~60 lines.
  STATE.server.on('upgrade', (req, socket) => {
    const u = new URL(req.url, 'https://x');
    if (u.pathname !== '/s' || u.searchParams.get('t') !== STATE.token) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
    }
    const key = req.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');

    STATE.connected = true;
    STATE.onStatus?.({ connected: true });

    let buf = Buffer.alloc(0);
    socket.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const maskKey = masked ? buf.slice(off, off + 4) : null;
        if (masked) off += 4;
        if (buf.length < off + len) return;

        const payload = buf.slice(off, off + len);
        if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
        buf = buf.slice(off + len);

        if (op === 0x8) { socket.end(); return; }          // close
        if (op === 0x9) {                                   // ping → pong
          socket.write(Buffer.concat([Buffer.from([0x8a, payload.length]), payload]));
          continue;
        }
        if (op === 0x2 && payload.length) {
          STATE.bytes += payload.length;
          STATE.onAudio?.(payload);
        }
      }
    });
    const done = () => { STATE.connected = false; STATE.onStatus?.({ connected: false }); };
    socket.on('close', done);
    socket.on('error', done);
  });

  await new Promise((resolve, reject) => {
    STATE.server.on('error', reject);
    STATE.server.listen(o.port || 0, STATE.mode === 'tunnel' ? '127.0.0.1' : '0.0.0.0', resolve);
  });

  STATE.port = STATE.server.address().port;

  if (STATE.mode === 'tunnel') {
    let tunnelUrl;
    try {
      tunnelUrl = await startTunnel(STATE.port);
    } catch (e) {
      await stop();
      return { ok: false, reason: 'TUNNEL_FAILED', message: e.message };
    }
    STATE.url = tunnelUrl + '/?t=' + STATE.token;
    return {
      ok: true,
      url: STATE.url,
      port: STATE.port,
      mode: 'tunnel',
      // Restated here, not just in this file's header, because this is
      // the moment someone actually sees the consequence of choosing
      // it — a warning read once at setup and never again is not a
      // warning that does its job.
      note: 'Your phone reaches this through Cloudflare\u2019s network. TLS terminates at ' +
            'their edge before being re-encrypted back to this machine \u2014 your audio is ' +
            'genuinely readable there, in the clear, for that hop. LAN mode never leaves ' +
            'your network at all; this trades that for not seeing a certificate warning.',
    };
  }

  const host = lanAddress();
  if (!host) {
    await stop();
    return { ok: false, reason: 'NO_LAN_ADDRESS', message: 'No network interface a phone could reach.' };
  }
  STATE.url = 'https://' + host + ':' + STATE.port + '/?t=' + STATE.token;

  return {
    ok: true,
    url: STATE.url,
    port: STATE.port,
    host,
    mode: 'lan',
    certReused: cert.reused,
    // Said up front, because the warning is the first thing seen and an
    // unexplained security warning is how people abandon a feature.
    note: 'The certificate is self-signed and generated on this machine, so the phone will warn once. ' +
          'Accept it. Audio stays on your network and never reaches a third party.',
  };
}

async function stop() {
  STATE.token = null;
  STATE.url = null;
  STATE.connected = false;
  if (STATE.tunnelProcess) {
    try { STATE.tunnelProcess.kill(); } catch (e) {}
    STATE.tunnelProcess = null;
  }
  if (STATE.server) {
    await new Promise(r => STATE.server.close(r));
    STATE.server = null;
  }
  return { ok: true };
}

function status() {
  return {
    running: !!STATE.server,
    connected: STATE.connected,
    url: STATE.url,
    port: STATE.port,
    mode: STATE.mode,
    bytesReceived: STATE.bytes,
  };
}

module.exports = { start, stop, status, lanAddress, ensureCert, page, detectCloudflared, startTunnel, STATE };
