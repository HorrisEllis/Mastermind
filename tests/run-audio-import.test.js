'use strict';
// ═══════════════════════════════════════════════════════════════════
// VOICE NOTE IMPORT — planning
//
// The ordering tests carry the weight. A backlog of voice notes is not
// a recording session: if it is ordered by import time or by filename,
// the association engine links things that were never near each other
// and the tag-transition grammar learns the alphabet.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const AI = require('../foundation/ai/audio-import.js');

const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

const DAY = 86400000;
const f = (over) => Object.assign({
  path: '/notes/' + (over.name || 'note.m4a'),
  name: 'note.m4a', size: 1024, mtime: Date.UTC(2026, 0, 1), durationMs: 10000,
}, over);

console.log('\nVOICE NOTE IMPORT\n');

t('recognises audio extensions and rejects everything else', () => {
  assert.ok(AI.isAudio('memo.m4a'));
  assert.ok(AI.isAudio('MEMO.WAV'));
  assert.ok(AI.isAudio('rec.opus'));
  assert.ok(!AI.isAudio('notes.txt'));
  assert.ok(!AI.isAudio('photo.png'));
});

t('reads dates out of the common recorder filename formats', () => {
  assert.ok(AI.dateFromName('2025-03-14T09-22-01.m4a'));
  assert.ok(AI.dateFromName('20250314_092201.wav'));
  assert.ok(AI.dateFromName('Recording 2025-03-14.m4a'));
  assert.strictEqual(AI.dateFromName('untitled.m4a'), null);
});

t('rejects implausible filename dates rather than trusting them', () => {
  assert.strictEqual(AI.dateFromName('1889-01-01.wav'), null, 'too old');
  assert.strictEqual(AI.dateFromName('2099-01-01.wav'), null, 'in the future');
});

t('a date-only filename lands at midday so a timezone shift cannot move the day', () => {
  const ts = AI.dateFromName('2025-06-10.m4a');
  assert.strictEqual(new Date(ts).getUTCHours(), 12);
});

t('timestamp source is ranked: embedded > filename > mtime', () => {
  assert.strictEqual(AI.resolveRecordedAt(f({ embeddedCreatedAt: 5, name: '2025-01-01.m4a' })).source, 'embedded');
  assert.strictEqual(AI.resolveRecordedAt(f({ name: '2025-01-01.m4a' })).source, 'filename');
  assert.strictEqual(AI.resolveRecordedAt(f({ name: 'x.m4a' })).source, 'mtime');
});

t('mtime-derived times are marked untrusted', () => {
  assert.strictEqual(AI.resolveRecordedAt(f({ name: 'x.m4a' })).trusted, false);
  assert.strictEqual(AI.resolveRecordedAt(f({ name: '2025-01-01.m4a' })).trusted, true);
});

t('THE ORDERING TEST: a batch sorts by recorded time, not by input order', () => {
  const files = [
    f({ name: '2025-12-01.m4a', path: '/c' }),
    f({ name: '2024-01-15.m4a', path: '/a' }),
    f({ name: '2025-06-30.m4a', path: '/b' }),
  ];
  const p = AI.plan(files);
  assert.deepStrictEqual(p.items.map(i => i.path), ['/a', '/b', '/c'],
    'a two-year backlog must replay in the order it was actually spoken');
});

t('undated notes go to the END, not scattered through real history', () => {
  const files = [
    f({ name: 'untitled.m4a', path: '/u', mtime: NaN }),
    f({ name: '2025-01-01.m4a', path: '/a' }),
    f({ name: '2025-02-01.m4a', path: '/b' }),
  ];
  const p = AI.plan(files);
  assert.strictEqual(p.items[p.items.length - 1].path, '/u');
});

t('a re-imported file is skipped — it would double every word in it', () => {
  const files = [f({ name: '2025-01-01.m4a', hash: 'abc' })];
  const p = AI.plan(files, { alreadyImported: ['abc'] });
  assert.strictEqual(p.items.length, 0);
  assert.strictEqual(p.skipped[0].reason, 'ALREADY_IMPORTED');
});

t('non-audio and empty files are skipped with a stated reason', () => {
  const p = AI.plan([
    f({ name: 'notes.txt', path: '/t' }),
    f({ name: '2025-01-01.m4a', path: '/e', size: 0 }),
  ]);
  assert.strictEqual(p.items.length, 0);
  assert.deepStrictEqual(p.skipped.map(s => s.reason).sort(), ['EMPTY_FILE', 'NOT_AUDIO']);
});

t('a short note is one segment', () => {
  const segs = AI.segmentsFor(f({ durationMs: 12000 }), 1000, { segmentMs: 30000 });
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].offsetMs, 0);
});

t('a long note is windowed with overlap so a straddling sentence is not lost', () => {
  const segs = AI.segmentsFor(f({ durationMs: 120000 }), 0, { segmentMs: 30000, overlapMs: 1500 });
  assert.ok(segs.length >= 4);
  assert.ok(segs[1].offsetMs < 30000, 'windows must overlap');
  assert.strictEqual(segs[0].of, segs.length);
});

t('segments inside a long note keep its internal chronology', () => {
  const start = Date.UTC(2025, 5, 1);
  const segs = AI.segmentsFor(f({ durationMs: 90000 }), start, { segmentMs: 30000, overlapMs: 0 });
  assert.strictEqual(segs[0].capturedAt, start);
  assert.strictEqual(segs[1].capturedAt, start + 30000);
  assert.ok(segs[2].capturedAt > segs[1].capturedAt);
});

t('unknown duration hands the whole file over rather than guessing a cut', () => {
  const segs = AI.segmentsFor(f({ durationMs: null }), 0, {});
  assert.strictEqual(segs.length, 1);
  assert.strictEqual(segs[0].durationMs, null);
});

t('the plan warns when ordering rests on mtime', () => {
  const p = AI.plan([f({ name: 'a.m4a' }), f({ name: 'b.m4a' })]);
  assert.ok(p.warnings.some(w => w.code === 'UNTRUSTED_ORDER'));
  assert.strictEqual(p.counts.untrustedTimes, 2);
});

t('the plan reports the span of history being imported', () => {
  const p = AI.plan([
    f({ name: '2024-01-01.m4a', path: '/a' }),
    f({ name: '2026-01-01.m4a', path: '/b' }),
  ]);
  assert.ok(p.spanned.toMs - p.spanned.fromMs > 700 * DAY);
});

t('the estimate is a labelled range, not a false precision', () => {
  const p = AI.plan([f({ name: '2025-01-01.m4a', durationMs: 600000 })]);
  assert.ok(p.estimate.lowMs < p.estimate.highMs);
  assert.ok(/rough/.test(p.estimate.basis));
});

t('queue segments carry provenance the lattice can read', () => {
  const p = AI.plan([f({ name: '2025-03-14.m4a', hash: 'h1', durationMs: 60000 })]);
  const segs = AI.toQueueSegments(p);
  assert.ok(segs.length >= 2);
  assert.strictEqual(segs[0].provenance.source, 'voice-note-import');
  assert.strictEqual(segs[0].provenance.file, '2025-03-14.m4a');
  assert.strictEqual(segs[0].provenance.timeSource, 'filename');
  assert.strictEqual(segs[0].provenance.ofSegments, segs.length);
});

t('queue segments are emitted in chronological order across files', () => {
  const p = AI.plan([
    f({ name: '2025-12-01.m4a', path: '/late', durationMs: 5000 }),
    f({ name: '2024-01-01.m4a', path: '/early', durationMs: 5000 }),
  ]);
  const segs = AI.toQueueSegments(p);
  assert.ok(segs[0].capturedAt < segs[1].capturedAt);
  assert.strictEqual(segs[0].provenance.file, '2024-01-01.m4a');
});

t('an empty batch plans cleanly rather than throwing', () => {
  const p = AI.plan([]);
  assert.strictEqual(p.items.length, 0);
  assert.strictEqual(p.estimate, null);
  assert.strictEqual(p.spanned, null);
});

const fails = results.filter(r => !r.ok);
console.log('\naudio-import: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
