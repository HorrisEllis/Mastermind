'use strict';
// ico.js — Input Compartment Output
// One file. No external deps. Node.js stdlib only.
// heartbeat + nano-ws inlined. Plugin schema inlined. Invariant store inlined.
//
// CLI:
//   node ico.js                           start
//   node ico.js input <data>              pipe through compartment
//   node ico.js output                    stream output channel
//   node ico.js status                    node health + plugin list
//   node ico.js connect <host:port>       connect to remote ico
//   node ico.js plugin:list               list registered plugins
//   node ico.js plugin:enable  <name>     enable plugin
//   node ico.js plugin:disable <name>     disable plugin
//   node ico.js invariant:get  <key>      read persistent value
//   node ico.js invariant:set  <key> <v>  write persistent value
//   node ico.js invariant:del  <key>      delete persistent value
//   node ico.js invariant:keys            list all keys
//   node ico.js invariant:all             dump entire store

const fs     = require('fs');
const net    = require('net');
const dgram  = require('dgram');
const crypto = require('crypto');
const os     = require('os');
const path   = require('path');
const { EventEmitter } = require('events');

// ─────────────────────────────────────────────────────────────────────────────
// BUS
// ─────────────────────────────────────────────────────────────────────────────

const bus = new EventEmitter();
bus.setMaxListeners(0);

// ─────────────────────────────────────────────────────────────────────────────
// PLUGIN REGISTRY
// ─────────────────────────────────────────────────────────────────────────────
// A plugin is the compartment interface made explicit and stackable.
// The pipe runs every enabled plugin in order.
// Each plugin receives (data, meta) and returns data or null (drop).
// Plugins are the compartment. The compartment folder is plugin zero.
//
// Schema:
// {
//   name:        string          — unique id, kebab-case
//   description: string          — what it does
//   enabled:     boolean         — runtime toggle, no restart
//   config:      object          — mutable at runtime
//   process:     async fn(data, meta, config) → data | null
//   stats:       fn() → object   — optional, exposed on /status
// }

const registry = new Map();

function registerPlugin(plugin) {
  if (!plugin.name || typeof plugin.process !== 'function')
    throw new Error(`[ico] plugin missing name or process: ${JSON.stringify(plugin)}`);
  plugin.enabled  = plugin.enabled  ?? true;
  plugin.config   = plugin.config   ?? {};
  plugin._in      = 0;
  plugin._out     = 0;
  plugin._dropped = 0;
  registry.set(plugin.name, plugin);
  bus.emit('plugin:registered', { name: plugin.name, ts: Date.now() });
}

function enablePlugin(name, on)  { const p = registry.get(name); if (p) { p.enabled = on; bus.emit('plugin:toggled', { name, enabled: on }); } }
function configPlugin(name, cfg) { const p = registry.get(name); if (p) Object.assign(p.config, cfg); }

function pluginList() {
  return [...registry.values()].map(p => ({
    name: p.name, description: p.description,
    enabled: p.enabled, config: p.config,
    in: p._in, out: p._out, dropped: p._dropped,
    stats: p.stats?.() ?? null,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// PIPE  — runs data through all enabled plugins in order
// ─────────────────────────────────────────────────────────────────────────────

async function pipe(data, meta = {}) {
  let current = data;

  for (const plugin of registry.values()) {
    if (!plugin.enabled) continue;
    plugin._in++;
    try {
      const result = await plugin.process(current, meta, plugin.config);
      if (result === null || result === undefined) {
        plugin._dropped++;
        bus.emit('output', { data: null, dropped: true, by: plugin.name, meta, ts: Date.now() });
        return null;
      }
      current = result;
      plugin._out++;
    } catch(e) {
      current = { error: e.message, plugin: plugin.name, data: current };
      plugin._out++;
    }
  }

  const out = { data: current, meta, ts: Date.now() };
  bus.emit('output', out);
  return current;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILT-IN PLUGINS
// ─────────────────────────────────────────────────────────────────────────────

// plugin:compartment — loads compartment/index.js, hot-reloadable
registerPlugin({
  name:        'compartment',
  description: 'compartment/index.js — hot-reloadable center. replace with anything.',
  config:      {},
  process(data) {
    const f = path.resolve('compartment/index.js');
    if (!fs.existsSync(f)) return data;
    try { delete require.cache[f]; return require(f)(data); } catch { return data; }
  },
});

// plugin:passthrough — identity, always last resort
registerPlugin({
  name:        'passthrough',
  description: 'identity — returns data unchanged. disable to expose raw compartment only.',
  enabled:     false,
  config:      {},
  process:     data => data,
});

// ─────────────────────────────────────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────────────────────────────────────

['input','compartment','output','invariant'].forEach(d => fs.mkdirSync(d, { recursive: true }));

// ─────────────────────────────────────────────────────────────────────────────
// INVARIANT  — persistent key-value store. survives restarts.
// invariant/key  → any value (JSON or raw string)
// plugins receive { get, set, del, keys } in meta.invariant
// ─────────────────────────────────────────────────────────────────────────────

const INV = path.resolve('invariant');

const invariant = {
  get(key) {
    const f = path.join(INV, key);
    if (!fs.existsSync(f)) return null;
    const raw = fs.readFileSync(f, 'utf8');
    try { return JSON.parse(raw); } catch { return raw; }
  },
  set(key, val) {
    const f = path.join(INV, key);
    fs.writeFileSync(f, typeof val === 'string' ? val : JSON.stringify(val, null, 2));
    bus.emit('invariant:set', { key, ts: Date.now() });
  },
  del(key) {
    const f = path.join(INV, key);
    if (fs.existsSync(f)) fs.unlinkSync(f);
    bus.emit('invariant:del', { key, ts: Date.now() });
  },
  keys() {
    return fs.readdirSync(INV).filter(f => !f.startsWith('.'));
  },
  all() {
    return Object.fromEntries(invariant.keys().map(k => [k, invariant.get(k)]));
  },
};

fs.watch('input', (_, f) => {
  if (!f) return;
  setTimeout(() => {
    const p = `input/${f}`; if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, 'utf8');
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    pipe(data, { src:'file', file:f, invariant }).then(r => {
      const out = r === null ? '' : (typeof r === 'string' ? r : JSON.stringify(r, null, 2));
      fs.writeFileSync(`output/${f}`, out);
      fs.unlinkSync(p);
    });
  }, 50);
});

fs.watch('compartment', () => bus.emit('compartment:reload', { ts: Date.now() }));

fs.watch('output', (_, f) => {
  if (f) bus.emit('heartbeat', { file:f, ts: Date.now() });
});

// ─────────────────────────────────────────────────────────────────────────────
// HEARTBEAT  (inlined)
// ─────────────────────────────────────────────────────────────────────────────

function _bpmTracker(win = 10) {
  const iv = []; let last = null;
  const beat = () => {
    const now = Date.now();
    if (last !== null) { iv.push(now - last); if (iv.length > win) iv.shift(); }
    last = now; return bpm();
  };
  const bpm = () => {
    if (!iv.length) return 0;
    const avg = iv.reduce((a,b) => a+b, 0) / iv.length;
    return avg > 0 ? Math.round(60000/avg) : 0;
  };
  const consistency = () => {
    if (iv.length < 2) return 1;
    const avg = iv.reduce((a,b) => a+b, 0) / iv.length;
    const v   = iv.reduce((s,x) => s+(x-avg)**2, 0) / iv.length;
    return Math.max(0, Math.min(1, 1 - Math.sqrt(v) / Math.max(avg, 1)));
  };
  return { beat, bpm, consistency };
}

function _latencyGrade(ms) {
  return ms<=50?1 : ms<=150?.8 : ms<=500?.5 : ms<=1500?.2 : 0;
}

function _ping(url, timeout = 3000) {
  return new Promise(resolve => {
    const t0  = Date.now();
    const mod = url.startsWith('https') ? require('https') : require('http');
    let parsed; try { parsed = new URL(url); } catch { resolve({ ok:false, ms:0 }); return; }
    const req = mod.get({ hostname:parsed.hostname, port:parsed.port, path:parsed.pathname||'/', timeout }, res => {
      resolve({ ok: res.statusCode===200, ms: Date.now()-t0 }); res.resume();
    });
    req.on('error',   () => resolve({ ok:false, ms: Date.now()-t0 }));
    req.on('timeout', () => { req.destroy(); resolve({ ok:false, ms:timeout }); });
  });
}

function _heartbeat({ emit, interval=5000, degradeAt=3, deadAt=10 } = {}) {
  const nodes = new Map();
  const register = (uuid, url) => {
    if (nodes.has(uuid)) return;
    const n = { uuid, url, bpm: _bpmTracker(), missed:0, latency:null, score:1 };
    nodes.set(uuid, n);
    n.timer = setInterval(async () => {
      const { ok, ms } = await _ping(url);
      n.latency = ms;
      if (ok) {
        n.bpm.beat(); n.missed = 0;
        n.score = n.bpm.consistency() * _latencyGrade(ms);
        emit('heartbeat:pulse', { uuid, bpm:n.bpm.bpm(), latency:ms, score:n.score });
      } else {
        n.missed++;
        if (n.missed === degradeAt) emit('heartbeat:degraded', { uuid, missed:n.missed });
        if (n.missed >= deadAt)   { emit('heartbeat:dead',    { uuid, missed:n.missed }); unregister(uuid); }
      }
    }, interval);
  };
  const unregister = uuid => { const n = nodes.get(uuid); if (n?.timer) clearInterval(n.timer); nodes.delete(uuid); };
  const status = () => [...nodes.values()].map(n => ({
    uuid:n.uuid, url:n.url, bpm:n.bpm.bpm(),
    consistency:n.bpm.consistency(), missed:n.missed,
    latency:n.latency, score:n.score,
  }));
  return { register, unregister, status };
}

const hb = _heartbeat({ emit: (t,p) => bus.emit(t, p) });

['heartbeat:pulse','heartbeat:degraded','heartbeat:dead'].forEach(e =>
  bus.on(e, d => bus.emit('output', { data:d, meta:{ src:'heartbeat', event:e }, ts:Date.now() }))
);

// ─────────────────────────────────────────────────────────────────────────────
// NANO-WS  (inlined — RFC 6455)
// ─────────────────────────────────────────────────────────────────────────────

class NanoSocket extends EventEmitter {
  constructor(socket) {
    super(); this._s=socket; this.open=true; this._buf=Buffer.alloc(0); this._frags=[];
    socket.on('data',  c => this._data(c));
    socket.on('close', () => { if (this.open) { this.open=false; this.emit('close'); }});
    socket.on('error', e => { this.open=false; this.emit('error',e); });
  }
  send(d) {
    if (!this.open) return;
    this._s.write(_frame(0x1, typeof d==='string'?Buffer.from(d,'utf8'):d));
  }
  close() { if (!this.open) return; this.open=false; this._s.write(_frame(0x8,Buffer.alloc(0))); this._s.end(); }
  _data(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    while (this._buf.length >= 2) {
      const fin=!!(this._buf[0]&0x80), op=this._buf[0]&0xF, mask=!!(this._buf[1]&0x80);
      let len=this._buf[1]&0x7F, off=2;
      if (len===126){ if(this._buf.length<4)return; len=this._buf.readUInt16BE(2); off=4; }
      else if(len===127){ if(this._buf.length<10)return; len=this._buf.readUInt32BE(6); off=10; }
      const end=off+(mask?4:0)+len;
      if (this._buf.length<end) return;
      let pay=this._buf.slice(off+(mask?4:0),end);
      if (mask){ const k=this._buf.slice(off,off+4); pay=Buffer.from(pay); for(let i=0;i<pay.length;i++) pay[i]^=k[i&3]; }
      this._buf=this._buf.slice(end);
      if (op===0x8){ this.open=false; this._s.write(_frame(0x8,pay)); this._s.end(); this.emit('close'); return; }
      if (op===0x9){ this._s.write(_frame(0xA,pay)); continue; }
      if (op===0x1||op===0x2||op===0x0){
        if (!fin){ this._frags.push(pay); continue; }
        const full=this._frags.length?Buffer.concat([...this._frags,pay]):pay;
        this._frags=[]; this.emit('message',full.toString());
      }
    }
  }
}

function _frame(op, payload) {
  const len=payload.length; let h;
  if(len<=125)     { h=Buffer.alloc(2);  h[0]=0x80|op; h[1]=len; }
  else if(len<=0xFFFF){ h=Buffer.alloc(4);  h[0]=0x80|op; h[1]=126; h.writeUInt16BE(len,2); }
  else             { h=Buffer.alloc(10); h[0]=0x80|op; h[1]=127; h.writeUInt32BE(0,2); h.writeUInt32BE(len,6); }
  return Buffer.concat([h, payload]);
}

function _wsHandshake(req, socket) {
  const key = req.split('\r\n').find(l=>l.toLowerCase().startsWith('sec-websocket-key'))?.split(': ')[1]?.trim();
  if (!key) { socket.destroy(); return null; }
  const accept = crypto.createHash('sha1').update(key+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setTimeout(0); socket.setNoDelay(true); socket.setKeepAlive(true);
  return new NanoSocket(socket);
}

// ─────────────────────────────────────────────────────────────────────────────
// UDP BROADCAST
// ─────────────────────────────────────────────────────────────────────────────

const udp = dgram.createSocket('udp4');
udp.bind(() => {
  udp.setBroadcast(true);
  const send = d => { const b=Buffer.from(JSON.stringify(d)); udp.send(b,0,b.length,7001,'255.255.255.255'); };
  bus.on('output',    d => send({ type:'ico:output',    ...d }));
  bus.on('heartbeat', d => send({ type:'ico:heartbeat', ...d }));
  bus.on('plugin:registered', d => send({ type:'ico:plugin', ...d }));
  bus.on('invariant:set', d => send({ type:'ico:invariant:set', ...d }));
  bus.on('invariant:del', d => send({ type:'ico:invariant:del', ...d }));
});

// ─────────────────────────────────────────────────────────────────────────────
// TCP SERVER
// ─────────────────────────────────────────────────────────────────────────────

const PORT = +(process.env.PORT || 7000);

function _host() {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (i.family==='IPv4' && !i.internal) return i.address;
  return '127.0.0.1';
}

function _send(socket, obj) { try { socket.write(JSON.stringify(obj)+'\n'); } catch {} }

const server = net.createServer(socket => {
  let buf='', isWS=false, ws=null;

  const fwd = (ch, d) => {
    const m = JSON.stringify({ channel:ch, ...d });
    isWS ? ws?.send(m) : _send(socket, JSON.parse(m));
  };

  const onOut  = d => fwd('output',      d);
  const onHB   = d => fwd('heartbeat',   d);
  const onComp = d => fwd('compartment', d);
  const onPlug = d => fwd('plugin',      d);

  bus.on('output',             onOut);
  bus.on('heartbeat',          onHB);
  bus.on('compartment:reload', onComp);
  bus.on('plugin:registered',  onPlug);
  bus.on('plugin:toggled',     onPlug);

  const handle = frame => {
    const { channel, data, cmd, name, config, uuid, url } = frame;

    if (channel === 'input')
      pipe(data, { src:'tcp', invariant }).then(r => fwd('output', { data:r, ts:Date.now() }));

    if (channel === 'compartment')
      bus.emit('compartment:reload', { data, ts:Date.now() });

    if (cmd === 'status')
      fwd('status', { nodes:hb.status(), plugins:pluginList(), ts:Date.now() });

    if (cmd === 'invariant:get')
      fwd('invariant', { key:name, value:invariant.get(name), ts:Date.now() });

    if (cmd === 'invariant:set' && name !== undefined)
      { invariant.set(name, data); fwd('invariant', { key:name, set:true, ts:Date.now() }); }

    if (cmd === 'invariant:del')
      { invariant.del(name); fwd('invariant', { key:name, deleted:true, ts:Date.now() }); }

    if (cmd === 'invariant:keys')
      fwd('invariant', { keys:invariant.keys(), ts:Date.now() });

    if (cmd === 'invariant:all')
      fwd('invariant', { all:invariant.all(), ts:Date.now() });

    if (cmd === 'plugin:list')
      fwd('plugin:list', { plugins:pluginList(), ts:Date.now() });

    if (cmd === 'plugin:enable')  enablePlugin(name, true);
    if (cmd === 'plugin:disable') enablePlugin(name, false);
    if (cmd === 'plugin:config')  configPlugin(name, config);

    if (cmd === 'plugin:register' && frame.plugin)
      try { registerPlugin(frame.plugin); fwd('plugin:registered', { name:frame.plugin.name, ts:Date.now() }); }
      catch(e) { fwd('error', { error:e.message }); }

    if (cmd === 'register' && uuid && url) hb.register(uuid, url);
  };

  socket.on('data', chunk => {
    buf += chunk.toString();
    if (!isWS && buf.includes('Upgrade: websocket')) {
      ws = _wsHandshake(buf, socket); isWS=true; buf='';
      if (ws) ws.on('message', m => { try { handle(JSON.parse(m)); } catch {} });
      return;
    }
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) { if (!l.trim()) continue; try { handle(JSON.parse(l)); } catch {} }
  });

  socket.on('close', () => {
    bus.off('output',onOut); bus.off('heartbeat',onHB);
    bus.off('compartment:reload',onComp); bus.off('plugin:registered',onPlug); bus.off('plugin:toggled',onPlug);
  });
  socket.on('error', () => socket.destroy());
  _send(socket, { channel:'open', host:_host(), port:PORT, ts:Date.now() });
});

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

const [,,cmd,...args] = process.argv;
const rpc = (obj, cb) => {
  const s = net.connect(PORT,'127.0.0.1',()=>s.write(JSON.stringify(obj)+'\n'));
  s.on('data', d => { cb(d.toString()); s.destroy(); });
  s.on('error', e => { console.error(e.message); process.exit(1); });
};

if      (cmd==='input')             rpc({ channel:'input', data:args.join(' ') }, d => process.stdout.write(d));
else if (cmd==='output')          { const s=net.connect(PORT,'127.0.0.1'); s.on('data',d=>process.stdout.write(d)); }
else if (cmd==='status')            rpc({ cmd:'status' }, d => console.log(d));
else if (cmd==='plugin:list')       rpc({ cmd:'plugin:list' }, d => console.log(d));
else if (cmd==='plugin:enable')     rpc({ cmd:'plugin:enable',  name:args[0] }, d => console.log(d));
else if (cmd==='plugin:disable')    rpc({ cmd:'plugin:disable', name:args[0] }, d => console.log(d));
else if (cmd==='invariant:get')     rpc({ cmd:'invariant:get',  name:args[0] }, d => console.log(d));
else if (cmd==='invariant:set')     rpc({ cmd:'invariant:set',  name:args[0], data:args.slice(1).join(' ') }, d => console.log(d));
else if (cmd==='invariant:del')     rpc({ cmd:'invariant:del',  name:args[0] }, d => console.log(d));
else if (cmd==='invariant:keys')    rpc({ cmd:'invariant:keys' }, d => console.log(d));
else if (cmd==='invariant:all')     rpc({ cmd:'invariant:all'  }, d => console.log(d));
else if (cmd==='connect')         { const [h,p]=(args[0]||'').split(':'); const s=net.connect(+(p||PORT),h||'127.0.0.1'); process.stdin.on('data',d=>s.write(d)); s.on('data',d=>process.stdout.write(d)); }
else if (!cmd) {
  server.listen(PORT, () => {
    console.log(`[ico] ${_host()}:${PORT}`);
    console.log(`[ico] channels: input  compartment  output`);
    console.log(`[ico] invariant: ${invariant.keys().length} keys`);
    console.log(`[ico] udp broadcast :7001`);
    console.log(`[ico] plugins: ${[...registry.keys()].join(', ')}`);
  });
}
