#!/usr/bin/env node
'use strict';
// xlat-cli.js — terminal client for the ico.js + liminal/xlat/people/negotiation
// stack. Written fresh against the CLI spec documented in the original
// rfr-webrtc README (modes, flags, pipe format, terminal output shape) —
// the actual xlat-cli.js file content was never uploaded in this
// conversation, only xlat-bridge.js (the engine) and the README describing
// the CLI. This is a new implementation against that spec and the real
// engine, not a port of a file that was never seen.
//
// Talks to ico.js over TCP using the same skip-handshake / wait-for-channel
// rpc pattern proven in ico.js's own CLI section — one short-lived connection
// per utterance, written → response awaited → closed, so ordering is exact
// even though ico.js's pipe() is async internally.
//
// MODES IMPLEMENTED: pipe, pair. (status/gaps/sigma are thin wrappers around
// ico.js's own CLI commands — see bottom. replay/watch are NOT implemented —
// flagging that honestly rather than stubbing something that looks done.)

const net = require('net');
const readline = require('readline');

const HOST = '127.0.0.1';
const PORT = 7000;

const argv = process.argv.slice(2);
const mode = argv[0];
const flags = {};
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i+1];
    if (next && !next.startsWith('--')) { flags[key] = next; i++; }
    else flags[key] = true;
  }
}

const speakers = (flags.speakers || 'A,B').split(',').map(s => s.trim());
const noColor  = !!flags['no-color'];
const quiet    = !!flags.quiet;
const verbose  = !!flags.verbose;

const C = noColor
  ? { dim:s=>s, bold:s=>s, red:s=>s, yellow:s=>s, green:s=>s, cyan:s=>s }
  : {
      dim:    s => `\x1b[2m${s}\x1b[0m`,
      bold:   s => `\x1b[1m${s}\x1b[0m`,
      red:    s => `\x1b[31m${s}\x1b[0m`,
      yellow: s => `\x1b[33m${s}\x1b[0m`,
      green:  s => `\x1b[32m${s}\x1b[0m`,
      cyan:   s => `\x1b[36m${s}\x1b[0m`,
    };

// ── rpc: one connection per call, skip the 'open' handshake, wait for the
// channel(s) we actually expect — same pattern proven in ico.js's own CLI.
function rpc(obj, waitFor) {
  return new Promise((resolve, reject) => {
    const s = net.connect(PORT, HOST, () => s.write(JSON.stringify(obj) + '\n'));
    let buf = '';
    s.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\n'); buf = lines.pop();
      for (const l of lines) {
        if (!l.trim()) continue;
        let msg; try { msg = JSON.parse(l); } catch { continue; }
        if (msg.channel === 'open') continue;
        if (waitFor && !waitFor.includes(msg.channel)) continue;
        s.destroy(); resolve(msg); return;
      }
    });
    s.on('error', reject);
  });
}

// ── Send one utterance through the real pipe: liminal (gaps) + xlat
// (translation) both read from the same flat data shape.
async function sendUtterance(speaker, text, toSpeaker) {
  const data = {
    speaker, text,
    xlat: { text, from: speaker, to: toSpeaker },
  };
  const reply = await rpc({ channel: 'input', data }, ['output', 'drop']);
  return reply;
}

function renderUtterance(speaker, text, reply) {
  if (reply.channel === 'drop') {
    console.log(C.red(`[${speaker}] "${text}" — DROPPED: ${reply.reason || 'axiom violation'}`));
    return;
  }
  const d = reply.data || {};
  const gaps = d.gaps || [];
  const xlatResult = d.xlat && d.xlat.result;

  if (quiet && gaps.length === 0) return;

  console.log(C.bold(`[${speaker}]`) + `  "${text}"`);

  if (xlatResult) {
    console.log(C.dim('├── ') + `grammar: ${xlatResult.transcoded.convertedTo} | bandwidth: ${xlatResult.transcoded.bandwidth}`);
    if (xlatResult.rendered && xlatResult.rendered.what) {
      console.log(C.dim('├── ') + `For receiver: ${C.cyan(xlatResult.rendered.what)}`);
    }
  }

  if (gaps.length) {
    for (const g of gaps) {
      console.log(C.yellow('├── ') + `Gap [${g.type}]: ${g.question} ` + C.dim(`(score ${g.score})`));
    }
  } else if (verbose) {
    console.log(C.dim('├── no gap pattern matched'));
  }

  console.log(C.dim('└── ') + new Date(reply.ts || Date.now()).toLocaleTimeString());
  console.log();
}

// ── pipe mode: JSONL from stdin ──────────────────────────────────────────────
async function runPipe() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); }
    catch (e) { console.error(C.red('bad JSON line, skipping: ') + e.message); continue; }

    if (rec.silence) {
      console.log(C.dim(`[${rec.speaker}] (${rec.silence})`));
      continue;
    }
    if (typeof rec.text !== 'string') { console.error(C.red('line missing text/silence, skipping')); continue; }

    const otherSpeaker = speakers.find(s => s !== rec.speaker) || speakers[1] || speakers[0];
    const reply = await sendUtterance(rec.speaker, rec.text, otherSpeaker);
    renderUtterance(rec.speaker, rec.text, reply);
  }
}

// ── pair mode: interactive, alternating speakers ─────────────────────────────
async function runPair() {
  let turn = 0;
  console.log(C.dim(`pair session — speakers: ${speakers.join(', ')}. Ctrl+C to end.`));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => new Promise(res => rl.question(`${C.bold(speakers[turn % speakers.length])}> `, res));

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const text = await ask();
    if (text === null || text === undefined) break;
    if (!text.trim()) { turn++; continue; }
    const speaker = speakers[turn % speakers.length];
    const otherSpeaker = speakers[(turn + 1) % speakers.length];
    const reply = await sendUtterance(speaker, text, otherSpeaker);
    renderUtterance(speaker, text, reply);
    turn++;
  }
  rl.close();
}

// ── thin wrappers around ico.js's own CLI commands ───────────────────────────
async function runStatus() { console.log(JSON.stringify(await rpc({ cmd: 'status' }, ['status']), null, 2)); }
async function runGaps()   { console.log(JSON.stringify(await rpc({ cmd: 'ledger:tail', name: 'liminal-gaps', config: { n: 50 } }, ['ledger:tail']), null, 2)); }
async function runSigma()  { console.log(JSON.stringify(await rpc({ cmd: 'invariant:get', name: 'lens:sigma' }, ['invariant']), null, 2)); }

(async () => {
  try {
    if      (mode === 'pipe')   await runPipe();
    else if (mode === 'pair')   await runPair();
    else if (mode === 'status') await runStatus();
    else if (mode === 'gaps')   await runGaps();
    else if (mode === 'sigma')  await runSigma();
    else if (mode === 'replay' || mode === 'watch') {
      console.error(C.red(`'${mode}' is documented in the README but not implemented here — `
        + `not stubbed, just not built yet.`));
      process.exit(1);
    } else {
      console.error('usage: xlat-cli.js <pipe|pair|status|gaps|sigma> [--speakers A,B] [--quiet] [--verbose] [--no-color]');
      process.exit(1);
    }
  } catch (e) {
    console.error(C.red('[xlat-cli] ' + e.message)); // §1.2 — loud, not silent
    process.exit(1);
  }
})();
