/**
 * @spatial/ingest — social.js
 *
 * Social media ingestion. Inverted.
 *
 * ── The inversion ─────────────────────────────────────────────────────────
 *
 * Standard social platforms model:
 *   Post → engagement score → reach → ranking → identity as follower count
 *
 * This model:
 *   Post → authored signal → latent state → behavioral geometry → fingerprint
 *
 * The post is not content to be optimized.
 * The post is a signal about the person who wrote it.
 *
 * What moves in this pipeline is not impressions.
 * What moves is meaning-construction geometry.
 *
 * ── What this ingests ─────────────────────────────────────────────────────
 *
 * Any structured export of authored content:
 *   - Twitter/X data export (tweets.js)
 *   - Instagram data export (posts JSON)
 *   - Reddit user history (pushshift CSV or JSONL)
 *   - LinkedIn posts export
 *   - Mastodon/ActivityPub outbox.json
 *   - Generic JSONL / CSV of { text, timestamp, [author] }
 *   - Single posts via the post() method
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * No engagement metrics. No like counts, share counts, impression counts.
 * Those are not ingested. They are not part of the signal.
 *
 * §IDL3 — No ranking. No immutable labels. No diagnosis.
 * §P1   — No PII stored. Posts are chunked and forwarded. Not retained.
 * §5.5  — Zero runtime dependencies.
 * §K7   — All errors as events. Never throws.
 *
 * ── The topology over time ────────────────────────────────────────────────
 *
 * Posts are emitted in chronological order with their original timestamps.
 * The text module builds topic arcs, entity tracking, semantic field coverage.
 * The drift engine reads the latent state over sessions.
 * The trajectory recorder maps attractor basins.
 * The ASE reads what you encounter and return to.
 *
 * The result: a longitudinal behavioral fingerprint from authored output.
 * Not who engaged with you. Who you are when you write.
 */

'use strict';

export const SOCIAL_VERSION = '1.0.0';

// ── Platform format parsers ───────────────────────────────────────────────────

/**
 * Twitter/X data export — tweets.js
 * window.YTD.tweets.part0 = [ { tweet: { full_text, created_at, ... } }, ... ]
 */
function parseTwitterExport(raw) {
  let data;
  try {
    // Twitter wraps in a JS assignment — strip it
    const cleaned = raw.replace(/^window\.YTD\.\w+\.part\d+\s*=\s*/, '');
    data = JSON.parse(cleaned);
  } catch {
    try { data = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(data)) return [];
  return data
    .map(item => {
      const t = item.tweet ?? item;
      return {
        text:      (t.full_text ?? t.text ?? '').replace(/^RT @\w+:\s*/, ''), // strip retweets
        ts:        t.created_at ? new Date(t.created_at).getTime() : Date.now(),
        source:    'twitter',
        isRetweet: !!(t.full_text ?? '').startsWith('RT @'),
      };
    })
    .filter(p => !p.isRetweet && p.text.length > 10); // authored content only
}

/**
 * Instagram data export — posts JSON
 * { media: [ { creation_timestamp, title, ... } ] }
 * or newer: array of { timestamp, string_map_data: { 'Post', 'Title', 'Hashtags' } }
 */
function parseInstagramExport(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return []; }

  const items = Array.isArray(data) ? data : (data.media ?? data.posts ?? []);
  return items.map(item => {
    // Newer format
    if (item.string_map_data) {
      const vals = Object.values(item.string_map_data);
      const text = vals.map(v => v.value ?? '').filter(Boolean).join('. ');
      return { text, ts: (item.creation_timestamp ?? 0) * 1000, source: 'instagram' };
    }
    // Older format
    const text = item.title ?? item.caption ?? '';
    return { text, ts: (item.creation_timestamp ?? 0) * 1000, source: 'instagram' };
  }).filter(p => p.text.length > 5);
}

/**
 * Reddit pushshift JSONL or CSV export
 * One JSON object per line: { body, created_utc, subreddit, ... }
 */
function parseRedditExport(raw) {
  const posts = [];
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      const text = item.body ?? item.selftext ?? item.title ?? '';
      if (text && text !== '[deleted]' && text !== '[removed]' && text.length > 5) {
        posts.push({
          text,
          ts:     (item.created_utc ?? 0) * 1000,
          source: 'reddit',
          meta:   { subreddit: item.subreddit },
        });
      }
    } catch { /* skip malformed lines */ }
  }
  return posts;
}

/**
 * Mastodon / ActivityPub outbox.json
 * { orderedItems: [ { type: 'Create', object: { content, published, ... } }, ... ] }
 */
function parseMastodonExport(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return []; }
  const items = data.orderedItems ?? data.items ?? [];
  return items
    .filter(item => item.type === 'Create' && item.object?.content)
    .map(item => ({
      text:   stripHTML(item.object.content),
      ts:     item.object.published ? new Date(item.object.published).getTime() : 0,
      source: 'mastodon',
    }))
    .filter(p => p.text.length > 5);
}

/**
 * Generic JSONL — one JSON object per line with 'text' or 'content' field
 */
function parseJSONL(raw) {
  const posts = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      const item = JSON.parse(line);
      const text = item.text ?? item.content ?? item.body ?? item.message ?? '';
      if (text.length > 5) {
        posts.push({
          text,
          ts:   item.timestamp ?? item.ts ?? item.created_at ?? item.date ?? 0,
          source: item.source ?? item.platform ?? 'unknown',
          meta:   item,
        });
      }
    } catch { /* skip */ }
  }
  return posts;
}

/**
 * CSV — expects columns: text, [timestamp/date], [source]
 */
function parseCSVExport(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const textIdx  = headers.findIndex(h => ['text','content','body','post','message','tweet'].includes(h));
  const tsIdx    = headers.findIndex(h => ['timestamp','date','created_at','time','ts'].includes(h));
  if (textIdx < 0) return [];
  return lines.slice(1).map(line => {
    const cells = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const text  = cells[textIdx] ?? '';
    const tsRaw = tsIdx >= 0 ? cells[tsIdx] : '';
    const ts    = tsRaw ? (isNaN(+tsRaw) ? new Date(tsRaw).getTime() : +tsRaw) : 0;
    return text.length > 5 ? { text, ts, source: 'csv' } : null;
  }).filter(Boolean);
}

function stripHTML(html) {
  return (html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ').trim();
}

// ── Format auto-detection ─────────────────────────────────────────────────────

function detectSocialFormat(raw, { filename = '', hint = '' } = {}) {
  const fname = filename.toLowerCase();
  if (hint) return hint;
  if (fname.includes('tweet') || raw.includes('window.YTD.tweets'))      return 'twitter';
  if (fname.includes('instagram') || fname.includes('media_'))           return 'instagram';
  if (fname.includes('reddit') || raw.includes('"subreddit"'))           return 'reddit';
  if (fname.includes('mastodon') || fname === 'outbox.json')             return 'mastodon';
  if (fname.endsWith('.jsonl'))                                           return 'jsonl';
  if (fname.endsWith('.csv'))                                             return 'csv';
  // Try JSONL heuristic — multiple JSON objects, one per line
  const firstLine = raw.trim().split('\n')[0];
  try { JSON.parse(firstLine); return 'jsonl'; } catch { /* not jsonl */ }
  return 'unknown';
}

// ── SocialIngestor ────────────────────────────────────────────────────────────

export class SocialIngestor {
  /**
   * @param {{ bus: SISOBus }} opts
   */
  constructor({ bus } = {}) {
    if (!bus) throw new Error('[SocialIngestor] bus required');
    this._bus = bus;
  }

  /**
   * Ingest a bulk social export file.
   *
   * @param {object} opts
   * @param {string} opts.raw        — raw file contents
   * @param {string} opts.filename   — original filename (for format detection)
   * @param {string} opts.formatHint — 'twitter'|'instagram'|'reddit'|'mastodon'|'jsonl'|'csv'
   * @param {string} opts.personId   — subject ID
   * @param {string} opts.sessionId  — session ID
   * @param {boolean} opts.chronological — emit oldest-first (default true)
   */
  ingestExport({
    raw,
    filename    = '',
    formatHint  = '',
    personId    = 'default',
    sessionId   = null,
    chronological = true,
    meta        = {},
  } = {}) {
    const ingestId = `social-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    const format = detectSocialFormat(raw, { filename, hint: formatHint });
    let posts = [];

    try {
      switch (format) {
        case 'twitter':   posts = parseTwitterExport(raw);   break;
        case 'instagram': posts = parseInstagramExport(raw); break;
        case 'reddit':    posts = parseRedditExport(raw);    break;
        case 'mastodon':  posts = parseMastodonExport(raw);  break;
        case 'jsonl':     posts = parseJSONL(raw);           break;
        case 'csv':       posts = parseCSVExport(raw);       break;
        default:
          // Try all parsers in order
          for (const parser of [parseJSONL, parseCSVExport, parseRedditExport]) {
            posts = parser(raw);
            if (posts.length) break;
          }
      }
    } catch (err) {
      this._bus.emit('spatial.ingest.social.error', {
        ingestId, format, personId, sessionId,
        error: err?.message ?? 'parse failed', ts: Date.now(),
      });
      return { ok: false, ingestId, error: err?.message };
    }

    if (!posts.length) {
      this._bus.emit('spatial.ingest.social.error', {
        ingestId, format, personId, sessionId,
        error: 'no posts extracted', ts: Date.now(),
      });
      return { ok: false, ingestId, error: 'no posts extracted' };
    }

    // Sort chronologically so the text module sees temporal arc correctly
    if (chronological) {
      posts.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    }

    const sid = sessionId ?? ingestId;
    posts.forEach((post, i) => {
      this._bus.emit('alk.text.ingest', {
        text:      post.text,
        source:    post.source ?? format,
        sessionId: sid,
        chunkId:   `${ingestId}:${i}`,
        meta: {
          ...meta,
          ...(post.meta ?? {}),
          platform:    post.source ?? format,
          originalTs:  post.ts,
          postIndex:   i,
          totalPosts:  posts.length,
          personId,
          // Engagement metrics deliberately absent. §IDL3.
        },
      });
      this._bus.emit('spatial.ingest.social.post', {
        ingestId, postIndex: i, totalPosts: posts.length,
        platform: post.source ?? format, personId, sessionId: sid, ts: Date.now(),
      });
    });

    this._bus.emit('spatial.ingest.social.complete', {
      ingestId, format, postCount: posts.length,
      personId, sessionId: sid, ts: Date.now(),
    });

    return { ok: true, ingestId, format, postCount: posts.length };
  }

  /**
   * Ingest a single post directly.
   * The fundamental unit: one authored statement, its timestamp, its author.
   * Nothing else.
   */
  post({ text, platform = 'direct', personId = 'default', sessionId = null, ts = null, meta = {} } = {}) {
    if (!text || text.length < 3) return { ok: false, error: 'text required' };
    const postId = `post-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    const sid    = sessionId ?? postId;

    this._bus.emit('alk.text.ingest', {
      text,
      source:    platform,
      sessionId: sid,
      chunkId:   postId,
      meta: { ...meta, platform, originalTs: ts ?? Date.now(), personId },
    });
    this._bus.emit('spatial.ingest.social.post', {
      ingestId: postId, postIndex: 0, totalPosts: 1,
      platform, personId, sessionId: sid, ts: Date.now(),
    });
    this._bus.emit('spatial.ingest.social.complete', {
      ingestId: postId, format: platform, postCount: 1,
      personId, sessionId: sid, ts: Date.now(),
    });

    return { ok: true, postId, platform };
  }
}
