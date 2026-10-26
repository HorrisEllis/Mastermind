/**
 * @spatial/ingest — ingest.test.js
 * §4.4 §8.6 — Tests are authoritative. All pass before ship.
 * Run: node ingest.test.js
 */

import { FileIngestor, extractText, chunk, SocialIngestor } from './index.js';

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else       { console.error(`  ✗ ${label}`); failed++; }
}
function section(name) { console.log(`\n── ${name} ─────────────────────────────────────`); }

class MockBus {
  constructor() { this._s = new Map(); this.events = []; }
  on(e, f)  { (this._s.get(e) ?? this._s.set(e,[]).get(e)).push(f); }
  emit(e,d) { this.events.push({type:e,data:d}); for(const f of(this._s.get(e)??[]))f(d); }
  of(t)     { return this.events.filter(x=>x.type===t); }
  clear()   { this.events=[]; }
}

// ── extractText ───────────────────────────────────────────────────────────────

section('extractText — plain');
{
  const r = extractText('Hello world. This is a test.');
  assert(r.format === 'plain', 'format is plain');
  assert(r.text.includes('Hello'), 'text preserved');
}

section('extractText — markdown');
{
  const md = `# Heading\n\n**bold** and *italic*\n\n- item one\n- item two\n\n[link text](https://example.com)`;
  const r  = extractText(md, { filename: 'test.md' });
  assert(r.format === 'markdown', 'format is markdown');
  assert(!r.text.includes('#'), 'heading marker stripped');
  assert(!r.text.includes('**'), 'bold marker stripped');
  assert(r.text.includes('link text'), 'link label preserved');
}

section('extractText — JSON');
{
  const json = JSON.stringify({ name: 'Alice', feeling: 'curious', depth: { thought: 'recursive' } });
  const r    = extractText(json, { filename: 'data.json' });
  assert(r.format === 'json', 'format is json');
  assert(r.text.includes('Alice'), 'name value present');
  assert(r.text.includes('recursive'), 'nested value present');
}

section('extractText — CSV');
{
  const csv = `name,feeling,date\nAlice,curious,2024-01-01\nBob,grounded,2024-01-02`;
  const r   = extractText(csv, { filename: 'data.csv' });
  assert(r.format === 'csv', 'format is csv');
  assert(r.text.includes('feeling: curious'), 'row rendered as key: value');
}

section('extractText — HTML');
{
  const html = `<html><body><h1>Title</h1><p>Some <strong>text</strong> here.</p></body></html>`;
  const r    = extractText(html, { filename: 'page.html' });
  assert(r.format === 'html', 'format is html');
  assert(!r.text.includes('<'), 'tags stripped');
  assert(r.text.includes('Title'), 'content preserved');
}

// ── chunk ─────────────────────────────────────────────────────────────────────

section('chunk');
{
  const text  = Array.from({ length: 20 }, (_, i) => `Paragraph ${i + 1}. This is a sentence about something real and meaningful that has some actual length to it.`).join('\n\n');
  const chunks = chunk(text);
  assert(chunks.length >= 2, `multiple chunks produced (got ${chunks.length})`);
  assert(chunks.every(c => c.length >= 20), 'all chunks above min length');
  assert(chunks.every(c => c.length <= 1000), 'no chunk excessively large');
}
{
  const short = chunk('Hi');
  assert(short.length === 0, 'too-short text produces no chunks');
}

// ── FileIngestor ──────────────────────────────────────────────────────────────

section('FileIngestor — basic');
{
  const bus = new MockBus();
  const fi  = new FileIngestor({ bus });

  const text = `This is a journal entry about feeling unmapped.

The oscillation between states is not disorder.
It is the natural topology of a person who processes deeply.

Another paragraph here with more content to ensure chunking.
The meaning-construction geometry differs from person to person.
That is not pathology. It is geometry.`;

  const result = fi.ingest({ text, filename: 'journal.txt', personId: 'p1', sessionId: 'sess-1' });

  assert(result.ok, 'ingest returns ok');
  assert(result.format === 'plain', 'format detected as plain');
  assert(result.chunkCount >= 1, 'at least one chunk produced');

  const textEvs = bus.of('alk.text.ingest');
  assert(textEvs.length >= 1, 'alk.text.ingest emitted');
  assert(textEvs[0].data.source === 'file', 'source is file');
  assert(textEvs[0].data.sessionId === 'sess-1', 'sessionId preserved');
  assert(textEvs[0].data.meta.personId === 'p1', 'personId in meta');

  const startEvs = bus.of('spatial.ingest.file.start');
  const doneEvs  = bus.of('spatial.ingest.file.complete');
  assert(startEvs.length === 1, 'file.start emitted once');
  assert(doneEvs.length === 1, 'file.complete emitted once');
  assert(doneEvs[0].data.chunkCount === result.chunkCount, 'complete chunkCount matches');
}

section('FileIngestor — error: empty text');
{
  const bus = new MockBus();
  const fi  = new FileIngestor({ bus });
  const result = fi.ingest({ text: '', filename: 'empty.txt', personId: 'p1' });
  assert(!result.ok, 'empty text returns not ok');
  const errEvs = bus.of('spatial.ingest.file.error');
  assert(errEvs.length === 1, 'file.error emitted');
}

section('FileIngestor — markdown file');
{
  const bus = new MockBus();
  const fi  = new FileIngestor({ bus });
  const md  = `# Session Notes\n\n## What came up\n\nFeeling the weight of something unnamed.\n**The body knows first.** The words come later.\n\n## What shifted\n\nA small opening. Not resolution. Movement.`;
  const r   = fi.ingest({ text: md, filename: 'notes.md', personId: 'p1' });
  assert(r.ok, 'markdown ingested ok');
  assert(r.format === 'markdown', 'markdown format detected');
  const evs = bus.of('alk.text.ingest');
  assert(evs.every(e => !e.data.text.includes('#')), 'markdown syntax stripped in emitted chunks');
}

// ── SocialIngestor ────────────────────────────────────────────────────────────

section('SocialIngestor — single post');
{
  const bus = new MockBus();
  const si  = new SocialIngestor({ bus });
  const r   = si.post({ text: 'The differences that made me feel broken were just geometry I didn\'t have language for yet.', platform: 'direct', personId: 'p1' });
  assert(r.ok, 'post returns ok');
  const evs = bus.of('alk.text.ingest');
  assert(evs.length === 1, 'alk.text.ingest emitted');
  assert(evs[0].data.source === 'direct', 'source is platform');
  assert(!evs[0].data.meta.likes, 'no engagement metrics in meta');
  assert(!evs[0].data.meta.shares, 'no share count in meta');
  assert(!evs[0].data.meta.impressions, 'no impression count in meta');
}

section('SocialIngestor — JSONL export');
{
  const bus  = new MockBus();
  const si   = new SocialIngestor({ bus });
  const jsonl = [
    JSON.stringify({ text: 'First post, early voice.', timestamp: 1000000, source: 'mastodon' }),
    JSON.stringify({ text: 'Second post, something shifted.', timestamp: 2000000, source: 'mastodon' }),
    JSON.stringify({ text: 'Third post, more grounded now.', timestamp: 3000000, source: 'mastodon' }),
  ].join('\n');
  const r = si.ingestExport({ raw: jsonl, filename: 'posts.jsonl', personId: 'p1' });
  assert(r.ok, 'JSONL export ingested ok');
  assert(r.postCount === 3, `3 posts extracted (got ${r.postCount})`);
  const evs = bus.of('alk.text.ingest');
  assert(evs.length === 3, '3 alk.text.ingest events emitted');
  // Chronological ordering
  assert(evs[0].data.text.includes('First'), 'posts emitted chronologically');
}

section('SocialIngestor — Twitter export format');
{
  const bus = new MockBus();
  const si  = new SocialIngestor({ bus });
  const twitterData = JSON.stringify([
    { tweet: { full_text: 'The oscillation is not the problem.', created_at: 'Mon Jan 01 00:00:00 +0000 2024' } },
    { tweet: { full_text: 'RT @someone: This is a retweet', created_at: 'Mon Jan 02 00:00:00 +0000 2024' } },
    { tweet: { full_text: 'Building the language for it.', created_at: 'Mon Jan 03 00:00:00 +0000 2024' } },
  ]);
  const r = si.ingestExport({ raw: twitterData, filename: 'tweets.json', formatHint: 'twitter', personId: 'p1' });
  assert(r.ok, 'twitter export ingested ok');
  assert(r.postCount === 2, `retweet filtered out (got ${r.postCount} posts)`);
  const evs = bus.of('alk.text.ingest');
  assert(evs.every(e => !e.data.text.startsWith('RT @')), 'retweets not ingested');
}

section('SocialIngestor — CSV export');
{
  const bus = new MockBus();
  const si  = new SocialIngestor({ bus });
  const csv = `text,date,platform\n"Something real written here.",2024-01-01,linkedin\n"Another entry, different day.",2024-01-02,linkedin`;
  const r   = si.ingestExport({ raw: csv, filename: 'export.csv', personId: 'p1' });
  assert(r.ok, 'CSV export ingested ok');
  assert(r.postCount === 2, `2 posts extracted (got ${r.postCount})`);
}

section('SocialIngestor — error: empty');
{
  const bus = new MockBus();
  const si  = new SocialIngestor({ bus });
  const r   = si.ingestExport({ raw: '', personId: 'p1' });
  assert(!r.ok, 'empty input returns not ok');
  const errEvs = bus.of('spatial.ingest.social.error');
  assert(errEvs.length === 1, 'social.error emitted');
}

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${passed}/${passed + failed} passed${failed ? `  ← ${failed} FAILED` : ''}`);
console.log(`${'─'.repeat(50)}\n`);
if (failed) process.exit(1);
