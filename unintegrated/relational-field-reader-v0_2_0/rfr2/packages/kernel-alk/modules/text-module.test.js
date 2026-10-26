/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK v1.3.0 — Test Suite                                               ║
 * ║  text-module.test.js  ·  v1.3.0                                        ║
 * ║  §4.4 — Every runtime file has a deep, specific test suite.            ║
 * ║  §8.6 — All tests must pass before output.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Run: node module/text-module.test.js
 * Exit 0 = all pass. Exit 1 = failure.
 */

import { createKernel } from '../kernel.js';
import { TextModule    } from './text-module.js';
import { PatEncoder, FrameAnalyzer, processPCM } from './pat-from-pcm.js';

// ─── Test harness ─────────────────────────────────────────────────────────────

let _passed = 0, _failed = 0, _section = '';

function section(name) {
  _section = name;
  console.log(`\n§ ${name}`);
}

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`);
    _passed++;
  } else {
    console.error(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
    _failed++;
  }
}

function assertClose(a, b, tol, label) {
  assert(Math.abs(a - b) <= tol, label, `got ${a}, expected ~${b} (±${tol})`);
}

function assertRange(v, lo, hi, label) {
  assert(v >= lo && v <= hi, label, `got ${v}, expected [${lo},${hi}]`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKernel() { return createKernel({ ringCap: 1000 }); }

function collectEvents(kernel, pattern, timeout = 300) {
  return new Promise(resolve => {
    const events = [];
    const unsub = kernel.subscribe(pattern, ev => events.push(ev));
    setTimeout(() => { unsub(); resolve(events); }, timeout);
  });
}

function ingest(kernel, text, source = 'chat', sessionId = 'test-session') {
  kernel.emit('alk.text.ingest', { text, source, sessionId });
}

// ─── §1 — TextModule identity ─────────────────────────────────────────────────

section('TextModule identity');

assert(TextModule.VERSION === '1.3.0',  'VERSION is 1.3.0');
assert(typeof TextModule.UUID === 'string' && TextModule.UUID.length > 10, 'UUID non-empty');
assert(TextModule.UUID.startsWith('alk-mod-text'), 'UUID has correct prefix');

// ─── §2 — Module construction ─────────────────────────────────────────────────

section('Module construction');

{
  const kernel = makeKernel();
  let threw = false;
  try { new TextModule(); } catch(_) { threw = true; }
  assert(threw, 'throws without kernel');

  const mod = new TextModule({ kernel });
  assert(mod instanceof TextModule, 'constructs with kernel');
  assert(mod.chunkN === 0, 'chunkN starts at 0');
  assert(Array.isArray(mod.topics), 'topics is array');
  assert(Array.isArray(mod.entities), 'entities is array');
  mod.destroy();
}

// ─── §3 — Session lifecycle ────────────────────────────────────────────────────

section('Session lifecycle');

await (async () => {
  const kernel = makeKernel();
  const mod    = new TextModule({ kernel });

  const startEvs = [];
  kernel.subscribe('alk.text.session.start', ev => startEvs.push(ev));

  kernel.emit('alk.session.capture.start', { sessionId:'sess-A' });
  await new Promise(r => setTimeout(r, 50));

  assert(startEvs.length === 1, 'session.start fires on capture.start');
  assert(mod.chunkN === 0, 'chunkN reset on new session');

  ingest(kernel, 'Hello world, this is a test message.', 'chat', 'sess-A');
  await new Promise(r => setTimeout(r, 50));
  assert(mod.chunkN === 1, 'chunkN increments on ingest');

  const summaryEvs = [];
  kernel.subscribe('alk.text.summary', ev => summaryEvs.push(ev));
  kernel.emit('alk.session.capture.stop', { sessionId:'sess-A' });
  await new Promise(r => setTimeout(r, 50));

  assert(summaryEvs.length === 1, 'summary emitted on capture.stop');
  assert(summaryEvs[0].payload.chunkCount === 1, 'summary chunkCount correct');

  mod.destroy();
})();

// ─── §4 — Ingest and chunk.analyzed event ────────────────────────────────────

section('Ingest and chunk.analyzed event');

await (async () => {
  const kernel = makeKernel();
  const mod    = new TextModule({ kernel });
  kernel.emit('alk.session.capture.start', { sessionId:'test' });

  const analyzed = [];
  kernel.subscribe('alk.text.chunk.analyzed', ev => analyzed.push(ev));

  ingest(kernel,
    'I feel really stuck on this problem. I cannot understand why it keeps happening again and again.',
    'chat', 'test'
  );
  await new Promise(r => setTimeout(r, 100));

  assert(analyzed.length === 1, 'chunk.analyzed emitted');
  const a = analyzed[0].payload;

  assert(typeof a.chunkId === 'string', 'chunkId is string');
  assert(a.wordCount > 0, 'wordCount > 0');
  assert(typeof a.coherence === 'object', 'coherence is object');
  assert(typeof a.semantics === 'object', 'semantics is object');
  assert(typeof a.lexical   === 'object', 'lexical is object');
  assert(Array.isArray(a.entities), 'entities is array');
  assert(typeof a.lexical.density === 'number', 'lexical.density is number');
  assertRange(a.lexical.density, 0, 1, 'lexical.density in [0,1]');

  mod.destroy();
})();

// ─── §5 — Coherence scoring ────────────────────────────────────────────────────

section('Coherence scoring');

await (async () => {
  const kernel = makeKernel();
  const mod    = new TextModule({ kernel });
  kernel.emit('alk.session.capture.start', { sessionId:'coh' });

  const analyzed = [];
  kernel.subscribe('alk.text.chunk.analyzed', ev => analyzed.push(ev));

  // First chunk — coherence always 1.0 (no prior context)
  ingest(kernel, 'The water cycle involves evaporation condensation precipitation collection.', 'document', 'coh');
  await new Promise(r => setTimeout(r, 50));

  // Highly coherent follow-up (shared words: water, evaporation)
  ingest(kernel, 'Water evaporates from the surface forming clouds through condensation.', 'document', 'coh');
  await new Promise(r => setTimeout(r, 50));

  // Low coherence jump
  ingest(kernel, 'My grandfather loved playing chess every Sunday afternoon.', 'document', 'coh');
  await new Promise(r => setTimeout(r, 50));

  assert(analyzed.length === 3, 'three chunks analyzed');
  assertClose(analyzed[0].payload.coherence.score, 1.0, 0.001, 'first chunk coherence = 1.0');
  assert(analyzed[1].payload.coherence.score > analyzed[2].payload.coherence.score,
    'related chunk more coherent than topic jump');

  const lowEvs = [];
  const kernel2 = makeKernel();
  const mod2    = new TextModule({ kernel:kernel2, config:{ coherenceLowThresh: 0.5 } });
  kernel2.subscribe('alk.text.coherence.low', ev => lowEvs.push(ev));
  kernel2.emit('alk.session.capture.start', { sessionId:'coh2' });

  ingest(kernel2, 'The water cycle involves evaporation condensation precipitation.', 'document', 'coh2');
  await new Promise(r=>setTimeout(r,50));
  ingest(kernel2, 'My grandfather loved chess on Sunday afternoons in winter.', 'document', 'coh2');
  await new Promise(r=>setTimeout(r,50));

  assert(lowEvs.length >= 1, 'coherence.low fires on topic jump with high threshold');
  mod.destroy(); mod2.destroy();
})();

// ─── §6 — Entity tracking ─────────────────────────────────────────────────────

section('Entity tracking');

await (async () => {
  const kernel  = makeKernel();
  const mod     = new TextModule({ kernel });
  const entEvs  = [];
  kernel.subscribe('alk.text.entity.detected', ev => entEvs.push(ev));
  kernel.emit('alk.session.capture.start', { sessionId:'ent' });

  ingest(kernel, 'James and Jonathan built the NEXUS platform together at Rheon World.', 'note', 'ent');
  await new Promise(r => setTimeout(r, 100));

  assert(entEvs.length > 0, 'entities detected in chunk');
  const entities = entEvs.map(e => e.payload.entity);
  // At least one proper noun detected
  assert(entities.some(e => e === 'james' || e === 'jonathan' || e === 'nexus' || e === 'rheon'),
    'proper nouns detected');

  mod.destroy();
})();

// ─── §7 — Semantic field analysis ─────────────────────────────────────────────

section('Semantic field analysis');

await (async () => {
  const kernel  = makeKernel();
  const mod     = new TextModule({ kernel });
  const chunks  = [];
  kernel.subscribe('alk.text.chunk.analyzed', ev => chunks.push(ev));
  kernel.emit('alk.session.capture.start', { sessionId:'sem' });

  ingest(kernel,
    'I feel scared and anxious about our relationship. We had a conflict and I struggled to understand.',
    'chat', 'sem'
  );
  await new Promise(r => setTimeout(r, 100));

  assert(chunks.length === 1, 'chunk analyzed');
  const sem = chunks[0].payload.semantics;
  assert(typeof sem.active === 'object', 'semantics.active is object');
  assert(Object.keys(sem.active).length > 0, 'at least one semantic field active');

  // Should detect EMOTION (feel, scared, anxious) and SELF (I)
  const activeFields = Object.keys(sem.active);
  assert(activeFields.includes('EMOTION') || activeFields.includes('SELF'),
    'EMOTION or SELF field detected in emotional text');

  mod.destroy();
})();

// ─── §8 — Lexical density ─────────────────────────────────────────────────────

section('Lexical density');

await (async () => {
  const kernel = makeKernel();
  const mod    = new TextModule({ kernel });
  const chunks = [];
  kernel.subscribe('alk.text.chunk.analyzed', ev => chunks.push(ev));
  kernel.emit('alk.session.capture.start', { sessionId:'lex' });

  // High density — technical content
  ingest(kernel,
    'Quantum entanglement enables instantaneous correlation between separated particles regardless of distance.',
    'document', 'lex'
  );
  // Low density — hedge-heavy
  ingest(kernel,
    'Well, I kind of maybe sort of think that perhaps it might possibly be something like that.',
    'chat', 'lex'
  );
  await new Promise(r => setTimeout(r, 100));

  assert(chunks.length === 2, 'two chunks');
  const highDensity = chunks[0].payload.lexical.density;
  const lowDensity  = chunks[1].payload.lexical.density;
  assert(highDensity > lowDensity, `high-density text (${highDensity}) > low-density (${lowDensity})`);
  assert(chunks[1].payload.lexical.hedges.length > 0, 'hedges detected in hedge-heavy text');

  mod.destroy();
})();

// ─── §9 — Topic model ─────────────────────────────────────────────────────────

section('Topic model');

await (async () => {
  const kernel    = makeKernel();
  const mod       = new TextModule({ kernel, config:{ topicUpdateEvery:3 } });
  const topicEvs  = [];
  kernel.subscribe('alk.text.topic.update', ev => topicEvs.push(ev));
  kernel.emit('alk.session.capture.start', { sessionId:'topic' });

  ingest(kernel, 'Water flows through rivers and streams into the ocean and evaporates into clouds.', 'doc', 'topic');
  ingest(kernel, 'The ocean contains salt water. Rivers carry fresh water to the sea.', 'doc', 'topic');
  ingest(kernel, 'Clouds form from water vapor evaporated from the ocean surface.', 'doc', 'topic');
  await new Promise(r => setTimeout(r, 150));

  assert(topicEvs.length >= 1, 'topic.update emitted after 3 chunks');
  const topics = topicEvs[topicEvs.length-1].payload.topics;
  assert(Array.isArray(topics), 'topics is array');
  if (topics.length > 0) {
    assert(Array.isArray(topics[0].words), 'topic has words array');
    assert(topics[0].words.length > 0, 'topic has at least one word');
    // Water-related words should appear in topics
    const allWords = topics.flatMap(t => t.words);
    assert(allWords.some(w => ['water','ocean','cloud','river','evaporate'].some(kw => w.includes(kw))),
      'water-domain words appear in topics');
  }

  mod.destroy();
})();

// ─── §10 — Multiple sessions isolation ───────────────────────────────────────

section('Multiple sessions isolation');

await (async () => {
  const kernel = makeKernel();
  const mod    = new TextModule({ kernel });

  kernel.emit('alk.session.capture.start', { sessionId:'sess-1' });
  ingest(kernel, 'Session one content about quantum physics particles.', 'chat', 'sess-1');
  await new Promise(r => setTimeout(r, 50));
  const chunkN1 = mod.chunkN;

  kernel.emit('alk.session.capture.stop', { sessionId:'sess-1' });
  await new Promise(r => setTimeout(r, 50));

  kernel.emit('alk.session.capture.start', { sessionId:'sess-2' });
  await new Promise(r => setTimeout(r, 50));
  assert(mod.chunkN === 0, 'chunkN resets between sessions');

  ingest(kernel, 'Session two is completely different topic about cooking.', 'chat', 'sess-2');
  await new Promise(r => setTimeout(r, 50));
  assert(mod.chunkN === 1, 'chunkN increments in session 2');

  mod.destroy();
})();

// ─── §11 — Error handling (§1.2) ─────────────────────────────────────────────

section('Error handling §1.2');

await (async () => {
  const kernel   = makeKernel();
  const mod      = new TextModule({ kernel });
  const errEvs   = [];
  kernel.subscribe('alk.text.error', ev => errEvs.push(ev));
  kernel.emit('alk.session.capture.start', { sessionId:'err' });

  // Missing text field
  kernel.emit('alk.text.ingest', { source:'chat', sessionId:'err' });
  await new Promise(r => setTimeout(r, 50));
  assert(errEvs.length === 1, 'error emitted for missing text');
  assert(errEvs[0].payload.code === 'INVALID_INPUT', 'error code is INVALID_INPUT');

  // Non-string text
  kernel.emit('alk.text.ingest', { text:42, source:'chat', sessionId:'err' });
  await new Promise(r => setTimeout(r, 50));
  assert(errEvs.length === 2, 'error emitted for non-string text');

  mod.destroy();
})();

// ─── §12 — Pulse (§1.8) ───────────────────────────────────────────────────────

section('Pulse §1.8');

await (async () => {
  const kernel   = makeKernel();
  const mod      = new TextModule({ kernel, config:{ pulseIntervalMs:100 } });
  const pulseEvs = [];
  kernel.subscribe('alk.text.pulse', ev => pulseEvs.push(ev));

  await new Promise(r => setTimeout(r, 350));
  assert(pulseEvs.length >= 2, `pulse emitted ≥2 times in 350ms (got ${pulseEvs.length})`);
  assert(pulseEvs[0].payload.moduleUUID === TextModule.UUID, 'pulse has correct UUID');
  assert(pulseEvs[0].payload.version    === '1.3.0',        'pulse has correct version');

  mod.destroy();
})();

// ─── §13 — PatEncoder: encode/decode roundtrip ────────────────────────────────

section('PatEncoder encode/decode roundtrip');

{
  const encoder = new PatEncoder({ sessionId:'test-sess-001', sampleRate:16000, chunkMs:500 });
  const chunks  = [
    { energy:0.31, zcr:0.12, spectralCentroid:0.45, cadence:2.1, sentiment:0.2, energyZ:0.8,
      silence:false, shift:false, hasTranscript:true, energyAnomaly:false, cadenceAnomaly:false },
    { energy:0.05, zcr:0.03, spectralCentroid:0.12, cadence:0.0, sentiment:0.0, energyZ:-1.2,
      silence:true,  shift:false, hasTranscript:false, energyAnomaly:false, cadenceAnomaly:false },
    { energy:0.82, zcr:0.38, spectralCentroid:0.71, cadence:5.4, sentiment:-0.4, energyZ:2.3,
      silence:false, shift:true, hasTranscript:true, energyAnomaly:true, cadenceAnomaly:true },
  ];

  chunks.forEach((c,i) => encoder.addChunk(c, i*500));
  const buf     = encoder.encode();
  const decoded = PatEncoder.decode(buf);

  assert(decoded.count   === 3,          'decoded chunk count = 3');
  assert(decoded.version === 3,          'decoded version = 3');
  assert(decoded.sessionId === 'test-sess-001', 'sessionId roundtrips');
  assert(decoded.sampleRate === 16000,   'sampleRate roundtrips');
  assert(decoded.chunkMs    === 500,     'chunkMs roundtrips');

  assertClose(decoded.chunks[0].energy,          0.31, 0.0001, 'chunk[0].energy roundtrips');
  assertClose(decoded.chunks[0].spectralCentroid,0.45, 0.0001, 'chunk[0].spectralCentroid roundtrips');
  assert(decoded.chunks[0].hasTranscript === true,  'chunk[0].hasTranscript = true');
  assert(decoded.chunks[0].silence       === false, 'chunk[0].silence = false');

  assert(decoded.chunks[1].silence       === true,  'chunk[1].silence = true');
  assert(decoded.chunks[1].hasTranscript === false, 'chunk[1].hasTranscript = false');
  assertClose(decoded.chunks[1].energy,  0.05, 0.0001, 'chunk[1].energy roundtrips');

  assert(decoded.chunks[2].energyAnomaly  === true, 'chunk[2].energyAnomaly = true');
  assert(decoded.chunks[2].cadenceAnomaly === true, 'chunk[2].cadenceAnomaly = true');
  assert(decoded.chunks[2].shift          === true, 'chunk[2].shift = true');
  assertClose(decoded.chunks[2].energy,   0.82, 0.0001, 'chunk[2].energy roundtrips');
  assertClose(decoded.chunks[2].sentiment,-0.4, 0.0001, 'chunk[2].sentiment roundtrips');
}

// ─── §14 — PatEncoder: header validation ─────────────────────────────────────

section('PatEncoder header validation');

{
  let threw = false;
  try { PatEncoder.decode(Buffer.alloc(10)); } catch(_) { threw = true; }
  assert(threw, 'decode throws on undersized buffer');

  let threw2 = false;
  try { PatEncoder.decode(Buffer.from('BADMAGIC12345678901234567890123456789012345678901234567890123456', 'ascii')); }
  catch(_) { threw2 = true; }
  assert(threw2, 'decode throws on bad magic');

  const enc = new PatEncoder({ sessionId:'x' });
  let threw3 = false;
  try { enc.encode(); } catch(_) { threw3 = true; }
  assert(threw3, 'encode throws with no chunks');
}

// ─── §15 — FrameAnalyzer: audio math ─────────────────────────────────────────

section('FrameAnalyzer audio math (codec-equivalent)');

{
  const fa = new FrameAnalyzer();

  // Silence (all zeros)
  const silence = new Float32Array(128).fill(0);
  const sRes = fa.analyzeFrame(silence);
  assert(sRes.energy === 0,    'silence → energy = 0');
  assert(sRes.silence === true,'silence → silence flag');
  assert(sRes.zcr    === 0,    'silence → ZCR = 0');

  // Full-scale sine wave (1 Hz at 128-sample frame)
  const sine = new Float32Array(128).map((_,i) => Math.sin(2*Math.PI*i/128));
  const sinRes = fa.analyzeFrame(sine);
  assertRange(sinRes.energy, 0.6, 0.8, 'sine wave energy in expected range');
  assert(sinRes.silence === false, 'sine wave → not silent');
  assert(sinRes.zcr > 0, 'sine wave → positive ZCR');
  assertRange(sinRes.spectralCentroid, 0, 1, 'spectralCentroid in [0,1]');

  // DC offset (constant non-zero)
  const dc = new Float32Array(128).fill(0.5);
  const dcRes = fa.analyzeFrame(dc);
  assertClose(dcRes.energy, 0.5, 0.001, 'DC offset energy = 0.5');
  assert(dcRes.zcr === 0, 'DC offset ZCR = 0 (no crossings)');
}

// ─── §16 — processPCM: full pipeline ─────────────────────────────────────────

section('processPCM full pipeline');

{
  // Generate 1 second of 440Hz sine at 16kHz (4 bytes per sample, float32-LE)
  const sampleCount = 16000;
  const pcmBuf      = Buffer.allocUnsafe(sampleCount * 4);
  for (let i=0;i<sampleCount;i++) {
    pcmBuf.writeFloatLE(Math.sin(2*Math.PI*440*i/16000), i*4);
  }

  const encoder = processPCM(pcmBuf, 'test-pcm');
  assert(encoder._chunks.length > 0, 'processPCM produces chunks from 1s audio');

  const patBuf  = encoder.encode();
  const decoded = PatEncoder.decode(patBuf);
  assert(decoded.sessionId === 'test-pcm', 'sessionId in encoded pat');
  assert(decoded.count > 0, 'at least one chunk in encoded pat');
  decoded.chunks.forEach((c,i) => {
    assertRange(c.energy, 0, 1, `chunk[${i}].energy in [0,1]`);
    assertRange(c.zcr,    0, 1, `chunk[${i}].zcr in [0,1]`);
  });

  // Bad buffer (not multiple of 4)
  let threw = false;
  try { processPCM(Buffer.alloc(7), 'bad'); } catch(_) { threw=true; }
  assert(threw, 'processPCM throws on non-aligned buffer');
}

// ─── §17 — Version and UUID consistency ──────────────────────────────────────

section('Version and UUID consistency (§5.4)');

assert(TextModule.VERSION === '1.3.0', 'TextModule.VERSION is 1.3.0');
assert(TextModule.UUID === 'alk-mod-text-0000-1300-0000-000000000060', 'TextModule.UUID exact match');

// ─── Results ──────────────────────────────────────────────────────────────────

console.log(`
────────────────────────────────────────────────────────────
  Results: ${_passed+_failed}/${_passed+_failed} run  |  ${_passed} passed  |  ${_failed} failed
────────────────────────────────────────────────────────────
`);

if (_failed > 0) process.exit(1);
