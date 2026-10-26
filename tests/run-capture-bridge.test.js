'use strict';
// ═══════════════════════════════════════════════════════════════════
// CAPTURE BRIDGE
//
// The bridge is thin on purpose — lattice.js already does the tagging
// and association. What is tested here is what the bridge ADDS:
// provenance, mode, seeds, and the visible gap where transcription
// failed.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const CB = require('../foundation/ai/capture-bridge.js');
const TQ = require('../foundation/ai/transcribe-queue.js');
const AI = require('../foundation/ai/audio-import.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

// A stand-in for the real latticeIngest, recording what it was handed.
function withLattice(fn) {
  const seen = [];
  global.latticeIngest = (kind, sourceId, text, meta) => {
    const rec = { kind, sourceId, text, meta: (meta && meta.extra) || {} , id: 'N' + seen.length };
    seen.push(rec);
    return rec;
  };
  try { fn(seen); } finally { delete global.latticeIngest; }
}

console.log('\nCAPTURE BRIDGE\n');

// ── Seeds ──────────────────────────────────────────────────────────

t('detects a seed from intention language, not from sentiment', () => {
  assert.strictEqual(CB.detectSeed('I want to build a lattice').seed, true);
  assert.strictEqual(CB.detectSeed('note to self, check the vault').seed, true);
  assert.strictEqual(CB.detectSeed('what if the whole thing is backwards').seed, true);
  assert.strictEqual(CB.detectSeed('it was raining this morning').seed, false);
});

t('seed priority is graded', () => {
  assert.strictEqual(CB.detectSeed('I want to rebuild it').priority, 'High');
  assert.strictEqual(CB.detectSeed('I should probably sleep').priority, 'Medium');
});

// ── Provenance ─────────────────────────────────────────────────────

t('every node records that a HUMAN said it, and through what', () => {
  const n = CB.buildNode('the vault has to be airtight', { source: 'live' });
  assert.strictEqual(n.meta.provenance.author, 'human');
  assert.strictEqual(n.meta.provenance.via, 'microphone');
  assert.strictEqual(n.meta.provenance.transcriber, 'whisper-local');
});

t('an imported recording is marked as a recording, with its file', () => {
  const n = CB.buildNode('an old thought', {
    source: 'voice-note-import', file: '2025-03-14.m4a', timeTrusted: false,
  });
  assert.strictEqual(n.meta.provenance.via, 'recording');
  assert.strictEqual(n.meta.provenance.file, '2025-03-14.m4a');
  assert.strictEqual(n.meta.provenance.timeTrusted, false);
});

t('mode is on every node — P8 cannot be retrofitted onto unlabelled data', () => {
  CB.setMode(CB.MODES.PROCESSING);
  assert.strictEqual(CB.buildNode('working it out').meta.mode, 'processing');
  CB.setMode(CB.MODES.EXTERNALIZING);
  assert.strictEqual(CB.buildNode('just getting it out').meta.mode, 'externalizing');
});

t('an unknown mode is refused rather than silently stored', () => {
  assert.throws(() => CB.setMode('vibes'), /unknown capture mode/);
});

t('spokenAt is the time it was SAID, not the time it was processed', () => {
  const when = Date.UTC(2025, 2, 14, 9, 30);
  const n = CB.buildNode('said back then', { capturedAt: when });
  assert.strictEqual(n.meta.spokenAt, new Date(when).toISOString());
});

// ── Ingestion ──────────────────────────────────────────────────────

t('text reaches the lattice with its metadata attached', () => {
  withLattice((seen) => {
    CB.beginSession('live');
    CB.ingest('the association threshold was the whole problem', { source: 'live', seq: 1 });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].kind, 'capture.speech');
    assert.ok(/association threshold/.test(seen[0].text));
    assert.strictEqual(seen[0].meta.provenance.author, 'human');
    CB.endSession();
  });
});

t('empty transcripts are dropped, not stored as blank nodes', () => {
  withLattice((seen) => {
    CB.ingest('   ', { source: 'live' });
    assert.strictEqual(seen.length, 0);
  });
});

t('THE GAP: a failed segment becomes a visible node, not a silent hole', () => {
  withLattice((seen) => {
    CB.ingest(null, { source: 'live', seq: 7 });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].kind, 'capture.gap');
    assert.ok(/unreadable/.test(seen[0].text),
      'the sequence edge would otherwise jump a gap with nothing to explain it');
  });
});

t('a session groups its nodes and counts them', () => {
  withLattice(() => {
    const s = CB.beginSession('live', { note: 'morning' });
    CB.ingest('one', { source: 'live' });
    CB.ingest('two', { source: 'live' });
    assert.strictEqual(CB.stats().session.count, 2);
    const ended = CB.endSession();
    assert.strictEqual(ended.id, s.id);
    assert.strictEqual(CB.stats().session, null);
  });
});

// ── Order preservation ─────────────────────────────────────────────

t('THE ORDER TEST: out-of-order transcription still reaches the lattice in spoken order', () => {
  withLattice((seen) => {
    const q = TQ.create();
    CB.beginSession('live');
    CB.attach(q, { source: 'live' });

    q.enqueue({ ref: 'a', capturedAt: 1000 });
    q.enqueue({ ref: 'b', capturedAt: 2000 });
    q.enqueue({ ref: 'c', capturedAt: 3000 });
    q.markRunning(1); q.markRunning(2); q.markRunning(3);

    q.markDone(3, 'third');    // finishes first
    q.markDone(2, 'second');
    q.markDone(1, 'first');

    assert.deepStrictEqual(seen.map(s => s.text), ['first', 'second', 'third'],
      'sequence edges and the tag-transition grammar are both order-sensitive');
    CB.endSession();
  });
});

t('an imported batch reaches the lattice oldest-first', () => {
  withLattice((seen) => {
    const plan = AI.plan([
      { path: '/b', name: '2025-12-01.m4a', size: 10, durationMs: 5000 },
      { path: '/a', name: '2024-01-01.m4a', size: 10, durationMs: 5000 },
    ]);
    const segs = AI.toQueueSegments(plan);
    CB.beginSession('import');
    segs.forEach((s, i) => CB.ingest('utterance ' + i, {
      source: 'voice-note-import', file: s.provenance.file, capturedAt: s.capturedAt,
    }));
    assert.strictEqual(seen[0].meta.provenance.file, '2024-01-01.m4a',
      'a two-year backlog must replay in the order it was spoken');
    CB.endSession();
  });
});

// ── Video ──────────────────────────────────────────────────────────

t('video files are accepted as a capture source', () => {
  assert.ok(AI.isAudio('standup.mp4'));
  assert.ok(AI.isAudio('thinking.mov'));
  assert.ok(AI.isVideo('standup.mp4'));
  assert.ok(!AI.isVideo('memo.m4a'));
});

t('a video import warns that extraction is required, before wasting hours', () => {
  const p = AI.plan([{ path: '/v', name: '2025-05-01.mp4', size: 10, durationMs: 60000 }]);
  assert.strictEqual(p.counts.videos, 1);
  assert.ok(p.items[0].needsExtraction);
  const w = p.warnings.find(x => x.code === 'NEEDS_AUDIO_EXTRACTION');
  assert.ok(w);
  assert.ok(/nothing is inferred from the picture/i.test(w.message),
    'the picture is not analysed and the plan should say so');
});

t('there is no text-entry path in the bridge', () => {
  for (const name of ['typeNode', 'addText', 'writeNote', 'manualEntry']) {
    assert.strictEqual(typeof CB[name], 'undefined', name + ' must not exist — capture is voice and video');
  }
});

const fails = results.filter(r => !r.ok);
console.log('\ncapture-bridge: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
