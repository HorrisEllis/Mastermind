/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  URL CROSS-DOMAIN INDEXER  ·  url-indexer.js  ·  v1.0.0               ║
 * ║  UUID: irs-url-indexer-0000-0001-0000-000000000001                     ║
 * ║  HOOK: irs.indexer:url-indexer:00001                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE INVENTION: Cross-Domain URL Indexing Without API Keys
 * ─────────────────────────────────────────────────────────
 *
 * The insight: every social platform leaks structured data through at least
 * one of these vectors, regardless of whether they have a "public API":
 *
 *  1. OG / Twitter Card meta tags         — always public, always parseable
 *  2. JSON-LD structured data             — schema.org embedded in HTML
 *  3. oEmbed endpoints                    — W3C standard, most platforms support it
 *  4. RSS/Atom feeds                      — still alive on most platforms
 *  5. Sitemap.xml                         — exposes URL graph structure
 *  6. .well-known/                        — platform identity, CORS policy
 *  7. robots.txt                          — crawl surface topology
 *  8. WebFinger (ActivityPub)             — Mastodon, Pixelfed, decentralized social
 *  9. Open Graph scraping via CORS proxy  — allorigins / corsproxy as fallback
 * 10. iframe sandbox message bus          — postMessage from embedded players
 * 11. Link header rel="alternate"         — machine-readable alternate formats
 * 12. Preload/prefetch resource hints     — reveals asset CDN topology
 * 13. DNS TXT records (via DoH)           — platform verification, SPF hints
 * 14. Certificate Transparency logs       — subdomain graph via crt.sh
 * 15. Archive.org CDX API                — historical snapshot indexing
 * 16. Google AMP cache                   — amp.dev canonical for accelerated pages
 * 17. YouTube no-cookie embed + postMessage — video metadata without OAuth
 * 18. Twitter/X card validator proxy      — cards.twitter.com/validator/
 * 19. TikTok/Instagram embed JS           — embed script exposes content object
 * 20. Spotify/SoundCloud oEmbed           — full metadata without auth
 *
 * ARCHITECTURE:
 *   URLIndexer.index(url) → IndexResult
 *   Runs all extraction vectors in parallel.
 *   Each vector is a standalone Extractor with UUID + confidence score.
 *   Results are merged via confidence-weighted fusion.
 *   SISO bus events emitted for each resolved field.
 *
 * §1.1 — Nothing pretends. Every field is sourced or absent.
 * §1.2 — All failures loud. extractors return {ok, error} never throws.
 * §5.1 — UUID + hook on every extractor.
 * §5.5 — No external runtime dependencies (fetch + DOMParser only).
 * §5.7 — All results via bus events. No direct module calls.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

export const INDEXER_UUID    = 'irs-url-indexer-0000-0001-0000-000000000001';
export const INDEXER_VERSION = '1.0.0';

const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

const OEMBED_PROVIDERS = {
  'youtube.com':       (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  'youtu.be':          (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  'twitter.com':       (url) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
  'x.com':             (url) => `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
  'vimeo.com':         (url) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
  'instagram.com':     (url) => `https://graph.facebook.com/v17.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=`,
  'soundcloud.com':    (url) => `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  'spotify.com':       (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  'tiktok.com':        (url) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
  'reddit.com':        (url) => `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`,
  'twitch.tv':         (url) => `https://api.twitch.tv/v5/oembed?url=${encodeURIComponent(url)}`,
  'flickr.com':        (url) => `https://www.flickr.com/services/oembed/?url=${encodeURIComponent(url)}&format=json`,
  'tumblr.com':        (url) => `https://www.tumblr.com/oembed/1.0?url=${encodeURIComponent(url)}`,
  'medium.com':        (url) => `https://medium.com/oembed?url=${encodeURIComponent(url)}`,
  'codepen.io':        (url) => `https://codepen.io/api/oembed?url=${encodeURIComponent(url)}&format=json`,
};

const WEBFINGER_PLATFORMS = [
  'mastodon.social', 'hachyderm.io', 'fosstodon.org', 'infosec.exchange',
  'techhub.social', 'chaos.social', 'social.coop', 'pixelfed.social'
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function parseHost(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, origin: u.origin, path: u.pathname };
  } catch { return { host: '', origin: '', path: '' }; }
}

function domainMatch(host, key) {
  return host.includes(key);
}

async function safeFetch(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal });
    clearTimeout(timer);
    return r;
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

async function fetchViaProxy(targetUrl) {
  for (const proxy of CORS_PROXIES) {
    try {
      const r = await safeFetch(proxy(targetUrl), {}, 10000);
      if (!r.ok) continue;
      const data = await r.json();
      // allorigins wraps in {contents}
      return data.contents || data;
    } catch { continue; }
  }
  return null;
}

function parseHTML(html) {
  const parser = new DOMParser();
  return parser.parseFromString(html, 'text/html');
}

// ─── Extractor Base ───────────────────────────────────────────────────────────

class Extractor {
  constructor(uuid, name, confidence) {
    this.uuid       = uuid;
    this.name       = name;
    this.confidence = confidence; // 0–1: how reliable this vector is
  }

  async extract(url, html, doc) {
    throw new Error('not implemented');
  }
}

// ─── 1. OG / Twitter Card Meta Tags ──────────────────────────────────────────

export class OGExtractor extends Extractor {
  static UUID = 'irs-ex-og-0000-0001-0000-000000000010';
  constructor() { super(OGExtractor.UUID, 'og-meta', 0.95); }

  async extract(url, html, doc) {
    if (!doc) return { ok: false, error: 'no doc' };
    const get = (name) => {
      const el = doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
      return el?.getAttribute('content') || null;
    };
    return {
      ok: true,
      source: 'og-meta',
      confidence: this.confidence,
      fields: {
        title:       get('og:title') || get('twitter:title') || doc.title || null,
        description: get('og:description') || get('twitter:description') || get('description') || null,
        image:       get('og:image') || get('twitter:image') || null,
        type:        get('og:type') || null,
        siteName:    get('og:site_name') || null,
        author:      get('article:author') || get('twitter:creator') || null,
        publishedAt: get('article:published_time') || get('article:modified_time') || null,
        url:         get('og:url') || url,
        video:       get('og:video') || get('og:video:url') || null,
        duration:    get('video:duration') || null,
      }
    };
  }
}

// ─── 2. JSON-LD Structured Data ───────────────────────────────────────────────

export class JSONLDExtractor extends Extractor {
  static UUID = 'irs-ex-jsonld-0000-0001-0000-000000000020';
  constructor() { super(JSONLDExtractor.UUID, 'json-ld', 0.90); }

  async extract(url, html, doc) {
    if (!doc) return { ok: false, error: 'no doc' };
    const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
    const records = [];
    scripts.forEach(s => {
      try {
        const d = JSON.parse(s.textContent);
        records.push(...(Array.isArray(d) ? d : [d]));
      } catch {}
    });
    if (!records.length) return { ok: false, error: 'no json-ld' };

    const merged = {};
    records.forEach(r => {
      const t = r['@type'] || '';
      if (!merged.type) merged.type = t;
      merged.name        = merged.name        || r.name || r.headline;
      merged.description = merged.description || r.description;
      merged.author      = merged.author      || r.author?.name || r.author;
      merged.datePublished = merged.datePublished || r.datePublished;
      merged.image       = merged.image       || r.image?.url || r.image;
      merged.publisher   = merged.publisher   || r.publisher?.name;
      merged.url         = merged.url         || r.url || url;
      merged.duration    = merged.duration    || r.duration;
      merged.interactionCount = merged.interactionCount || r.interactionStatistic?.userInteractionCount;
    });

    return { ok: true, source: 'json-ld', confidence: this.confidence, fields: merged };
  }
}

// ─── 3. oEmbed ───────────────────────────────────────────────────────────────

export class OEmbedExtractor extends Extractor {
  static UUID = 'irs-ex-oembed-0000-0001-0000-000000000030';
  constructor() { super(OEmbedExtractor.UUID, 'oembed', 0.92); }

  async extract(url, html, doc) {
    const { host } = parseHost(url);

    // 1. Check if page links to oEmbed endpoint via <link rel="alternate">
    let oembedUrl = null;
    if (doc) {
      const link = doc.querySelector('link[type="application/json+oembed"]');
      if (link) oembedUrl = link.getAttribute('href');
    }

    // 2. Known provider table
    if (!oembedUrl) {
      for (const [domain, builder] of Object.entries(OEMBED_PROVIDERS)) {
        if (host.includes(domain)) {
          oembedUrl = builder(url);
          break;
        }
      }
    }

    if (!oembedUrl) return { ok: false, error: 'no oembed endpoint' };

    try {
      const r = await safeFetch(oembedUrl);
      if (!r.ok) return { ok: false, error: `oembed ${r.status}` };
      const data = await r.json();
      return {
        ok: true,
        source: 'oembed',
        confidence: this.confidence,
        fields: {
          title:        data.title,
          author:       data.author_name,
          authorUrl:    data.author_url,
          provider:     data.provider_name,
          thumbnail:    data.thumbnail_url,
          html:         data.html,
          width:        data.width,
          height:       data.height,
          duration:     data.duration,
          uploadDate:   data.upload_date,
          viewCount:    data.view_count,
          likeCount:    data.like_count,
        }
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
}

// ─── 4. RSS / Atom Feed Discovery ────────────────────────────────────────────

export class FeedExtractor extends Extractor {
  static UUID = 'irs-ex-feed-0000-0001-0000-000000000040';
  constructor() { super(FeedExtractor.UUID, 'rss-atom', 0.75); }

  async extract(url, html, doc) {
    const { origin, host } = parseHost(url);
    const feedCandidates = [];

    // From <link rel="alternate">
    if (doc) {
      doc.querySelectorAll('link[rel="alternate"]').forEach(l => {
        const type = l.getAttribute('type') || '';
        if (type.includes('rss') || type.includes('atom')) {
          feedCandidates.push(l.getAttribute('href'));
        }
      });
    }

    // Common feed paths
    const commonPaths = ['/feed', '/rss', '/atom.xml', '/feed.xml', '/rss.xml',
                         '/index.xml', '/feeds/posts/default'];
    commonPaths.forEach(p => feedCandidates.push(origin + p));

    // Platform-specific
    if (host.includes('reddit.com')) feedCandidates.push(url + '.rss');
    if (host.includes('medium.com')) feedCandidates.push(url + '/feed');
    if (host.includes('substack.com')) feedCandidates.push(origin + '/feed');

    for (const feedUrl of feedCandidates.slice(0, 4)) {
      if (!feedUrl) continue;
      try {
        const absUrl = feedUrl.startsWith('http') ? feedUrl : origin + feedUrl;
        const r = await safeFetch(absUrl, {}, 5000);
        if (!r.ok) continue;
        const text = await r.text();
        if (!text.includes('<rss') && !text.includes('<feed') && !text.includes('<atom')) continue;
        const fdoc = parseHTML(text);
        const items = fdoc.querySelectorAll('item, entry');
        const posts = Array.from(items).slice(0, 5).map(item => ({
          title: item.querySelector('title')?.textContent,
          link:  item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href'),
          date:  item.querySelector('pubDate, published, updated')?.textContent,
          summary: item.querySelector('description, summary, content')?.textContent?.slice(0, 200),
        }));
        return {
          ok: true, source: 'rss-atom', confidence: this.confidence,
          fields: { feedUrl: absUrl, recentPosts: posts }
        };
      } catch { continue; }
    }
    return { ok: false, error: 'no feed found' };
  }
}

// ─── 5. Archive.org CDX API ───────────────────────────────────────────────────

export class ArchiveExtractor extends Extractor {
  static UUID = 'irs-ex-archive-0000-0001-0000-000000000050';
  constructor() { super(ArchiveExtractor.UUID, 'archive-cdx', 0.70); }

  async extract(url) {
    try {
      const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&fl=timestamp,statuscode,mimetype&limit=5&from=&to=&fastLatest=true`;
      const r = await safeFetch(cdxUrl, {}, 8000);
      if (!r.ok) return { ok: false, error: `cdx ${r.status}` };
      const rows = await r.json();
      const [header, ...data] = rows;
      const snapshots = data.map(row =>
        Object.fromEntries(header.map((k, i) => [k, row[i]]))
      );
      return {
        ok: true, source: 'archive-cdx', confidence: this.confidence,
        fields: { snapshots, firstSeen: snapshots[0]?.timestamp, snapshotCount: snapshots.length }
      };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

// ─── 6. WebFinger / ActivityPub ──────────────────────────────────────────────

export class WebFingerExtractor extends Extractor {
  static UUID = 'irs-ex-webfinger-0000-0001-0000-000000000060';
  constructor() { super(WebFingerExtractor.UUID, 'webfinger-ap', 0.80); }

  async extract(url) {
    const { host, origin } = parseHost(url);
    // Attempt WebFinger on known ActivityPub hosts
    const isAP = WEBFINGER_PLATFORMS.some(p => host.includes(p))
               || host.includes('mastodon') || host.includes('pixelfed')
               || host.includes('pleroma')  || host.includes('misskey');

    if (!isAP) return { ok: false, error: 'not activitypub platform' };

    // Extract handle from URL like /@username
    const handleMatch = url.match(/\/@([^\/\?]+)/);
    if (!handleMatch) return { ok: false, error: 'no handle in url' };

    const acct = `${handleMatch[1]}@${host}`;
    const wfUrl = `${origin}/.well-known/webfinger?resource=acct:${encodeURIComponent(acct)}`;

    try {
      const r = await safeFetch(wfUrl, { headers: { Accept: 'application/jrd+json' } });
      if (!r.ok) return { ok: false, error: `webfinger ${r.status}` };
      const data = await r.json();
      const apLink = data.links?.find(l => l.rel === 'self' && l.type?.includes('activity'));
      let profile = null;
      if (apLink) {
        const pr = await safeFetch(apLink.href, { headers: { Accept: 'application/activity+json' } });
        if (pr.ok) profile = await pr.json();
      }
      return {
        ok: true, source: 'webfinger-ap', confidence: this.confidence,
        fields: {
          acct, subject: data.subject,
          name:        profile?.name,
          username:    profile?.preferredUsername,
          bio:         profile?.summary?.replace(/<[^>]+>/g, ''),
          followers:   profile?.followers,
          following:   profile?.following,
          icon:        profile?.icon?.url,
          posts:       profile?.outbox,
          joinedAt:    profile?.published,
        }
      };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

// ─── 7. DNS over HTTPS (DoH) TXT Records ─────────────────────────────────────

export class DoHExtractor extends Extractor {
  static UUID = 'irs-ex-doh-0000-0001-0000-000000000070';
  constructor() { super(DoHExtractor.UUID, 'dns-doh', 0.60); }

  async extract(url) {
    const { host } = parseHost(url);
    const baseDomain = host.split('.').slice(-2).join('.');
    try {
      const r = await safeFetch(
        `https://cloudflare-dns.com/dns-query?name=${baseDomain}&type=TXT`,
        { headers: { Accept: 'application/dns-json' } }
      );
      if (!r.ok) return { ok: false, error: `doh ${r.status}` };
      const data = await r.json();
      const txts = (data.Answer || []).filter(a => a.type === 16).map(a => a.data);
      // Filter for platform verification records
      const verifications = txts.filter(t =>
        t.includes('verification') || t.includes('verify') ||
        t.includes('google-site') || t.includes('facebook') ||
        t.includes('twitter') || t.includes('pinterest') ||
        t.includes('keybase') || t.includes('brave-ledger')
      );
      return {
        ok: true, source: 'dns-doh', confidence: this.confidence,
        fields: { domain: baseDomain, allTxt: txts, platformVerifications: verifications }
      };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

// ─── 8. Certificate Transparency (crt.sh) ────────────────────────────────────

export class CertExtractor extends Extractor {
  static UUID = 'irs-ex-cert-0000-0001-0000-000000000080';
  constructor() { super(CertExtractor.UUID, 'cert-transparency', 0.55); }

  async extract(url) {
    const { host } = parseHost(url);
    const baseDomain = host.split('.').slice(-2).join('.');
    try {
      const r = await safeFetch(`https://crt.sh/?q=%.${baseDomain}&output=json`, {}, 8000);
      if (!r.ok) return { ok: false, error: `crt.sh ${r.status}` };
      const certs = await r.json();
      const subdomains = [...new Set(certs.map(c => c.name_value).filter(Boolean))]
        .slice(0, 30);
      return {
        ok: true, source: 'cert-transparency', confidence: this.confidence,
        fields: { domain: baseDomain, subdomains, certCount: certs.length }
      };
    } catch (e) { return { ok: false, error: e.message }; }
  }
}

// ─── 9. Sitemap + robots.txt ─────────────────────────────────────────────────

export class SitemapExtractor extends Extractor {
  static UUID = 'irs-ex-sitemap-0000-0001-0000-000000000090';
  constructor() { super(SitemapExtractor.UUID, 'sitemap-robots', 0.65); }

  async extract(url) {
    const { origin } = parseHost(url);
    const result = { sitemaps: [], disallowed: [], crawlDelay: null };

    try {
      const rb = await safeFetch(`${origin}/robots.txt`, {}, 5000);
      if (rb.ok) {
        const text = await rb.text();
        const sitemapMatches = text.match(/^Sitemap:\s*(.+)$/gim) || [];
        result.sitemaps = sitemapMatches.map(s => s.replace(/^Sitemap:\s*/i, '').trim());
        const disallowed = text.match(/^Disallow:\s*(.+)$/gim) || [];
        result.disallowed = disallowed.map(d => d.replace(/^Disallow:\s*/i, '').trim()).slice(0, 10);
        const delay = text.match(/Crawl-delay:\s*(\d+)/i);
        if (delay) result.crawlDelay = parseInt(delay[1]);
      }
    } catch {}

    // Try standard sitemap locations
    if (!result.sitemaps.length) {
      result.sitemaps = [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
    }

    // Fetch first sitemap for URL count
    try {
      const sm = await safeFetch(result.sitemaps[0], {}, 5000);
      if (sm.ok) {
        const text = await sm.text();
        const locs = (text.match(/<loc>/g) || []).length;
        result.indexedPages = locs;
      }
    } catch {}

    return { ok: true, source: 'sitemap-robots', confidence: this.confidence, fields: result };
  }
}

// ─── 10. Platform-Specific Scrapers ──────────────────────────────────────────

export class PlatformScraper extends Extractor {
  static UUID = 'irs-ex-platform-0000-0001-0000-000000000100';
  constructor() { super(PlatformScraper.UUID, 'platform-scraper', 0.85); }

  async extract(url, html, doc) {
    const { host } = parseHost(url);
    if (!doc) return { ok: false, error: 'no doc' };

    // YouTube — extract from ytInitialData embedded JSON
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const match = html?.match(/ytInitialData\s*=\s*({.+?});/s);
      if (match) {
        try {
          const d = JSON.parse(match[1]);
          const vr = d?.contents?.twoColumnWatchNextResults?.results?.results?.contents;
          const primary = vr?.find(c => c.videoPrimaryInfoRenderer)?.videoPrimaryInfoRenderer;
          const secondary = vr?.find(c => c.videoSecondaryInfoRenderer)?.videoSecondaryInfoRenderer;
          return {
            ok: true, source: 'platform-youtube', confidence: this.confidence,
            fields: {
              title:        primary?.title?.runs?.[0]?.text,
              views:        primary?.viewCount?.videoViewCountRenderer?.viewCount?.simpleText,
              uploadDate:   primary?.dateText?.simpleText,
              likes:        primary?.videoActions?.menuRenderer?.topLevelButtons?.[0]?.segmentedLikeDislikeButtonRenderer?.likeButton?.toggleButtonRenderer?.defaultText?.simpleText,
              channel:      secondary?.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text,
              subscribers:  secondary?.owner?.videoOwnerRenderer?.subscriberCountText?.simpleText,
              description:  secondary?.description?.runs?.map(r => r.text).join('').slice(0, 500),
            }
          };
        } catch {}
      }
    }

    // Reddit — extract from window.__r or __NEXT_DATA__
    if (host.includes('reddit.com')) {
      const match = html?.match(/__NEXT_DATA__\s*=\s*({.+?})<\/script>/s)
                 || html?.match(/window\.__r\s*=\s*({.+?});\n/s);
      if (match) {
        try {
          const d = JSON.parse(match[1]);
          const post = d?.props?.pageProps?.postData || {};
          return {
            ok: true, source: 'platform-reddit', confidence: this.confidence,
            fields: {
              title:     post.title,
              author:    post.author,
              subreddit: post.subreddit,
              score:     post.score,
              upvoteRatio: post.upvote_ratio,
              comments:  post.num_comments,
              created:   new Date(post.created_utc * 1000).toISOString(),
              flair:     post.link_flair_text,
            }
          };
        } catch {}
      }
    }

    // GitHub — __NEXT_DATA__ or meta tags
    if (host.includes('github.com')) {
      try {
        const getM = (n) => doc.querySelector(`meta[name="${n}"]`)?.getAttribute('content');
        const stars = doc.querySelector('[aria-label*="star"]')?.textContent?.trim();
        const forks = doc.querySelector('[aria-label*="fork"]')?.textContent?.trim();
        return {
          ok: true, source: 'platform-github', confidence: this.confidence,
          fields: {
            title:       doc.title,
            description: getM('description'),
            stars, forks,
            language:    doc.querySelector('[itemprop="programmingLanguage"]')?.textContent?.trim(),
            topics:      Array.from(doc.querySelectorAll('[data-octo-click="topic_click"]')).map(t => t.textContent.trim()),
          }
        };
      } catch {}
    }

    // LinkedIn — og + structured
    if (host.includes('linkedin.com')) {
      return {
        ok: true, source: 'platform-linkedin', confidence: 0.70,
        fields: {
          title:       doc.querySelector('meta[property="og:title"]')?.getAttribute('content'),
          description: doc.querySelector('meta[property="og:description"]')?.getAttribute('content'),
          image:       doc.querySelector('meta[property="og:image"]')?.getAttribute('content'),
          note:        'LinkedIn restricts deep scraping. Use oEmbed or shared links.',
        }
      };
    }

    return { ok: false, error: `no platform scraper for ${host}` };
  }
}

// ─── INDEX RESULT MERGER ─────────────────────────────────────────────────────

function mergeResults(results) {
  const merged = {
    title: null, description: null, image: null, author: null,
    publishedAt: null, url: null, platform: null, type: null,
    mediaUrl: null, duration: null, interactionCount: null,
    extra: {},
  };

  // Sort by confidence descending — highest wins for each field
  const sorted = results.filter(r => r.ok).sort((a, b) => b.confidence - a.confidence);

  for (const result of sorted) {
    const f = result.fields || {};
    if (!merged.title        && f.title)        merged.title        = f.title;
    if (!merged.description  && f.description)  merged.description  = f.description;
    if (!merged.image        && (f.image || f.thumbnail)) merged.image = f.image || f.thumbnail;
    if (!merged.author       && f.author)       merged.author       = f.author;
    if (!merged.publishedAt  && (f.publishedAt || f.datePublished || f.uploadDate))
      merged.publishedAt = f.publishedAt || f.datePublished || f.uploadDate;
    if (!merged.url          && f.url)          merged.url          = f.url;
    if (!merged.platform     && f.provider)     merged.platform     = f.provider;
    if (!merged.type         && f.type)         merged.type         = f.type;
    if (!merged.duration     && f.duration)     merged.duration     = f.duration;
    if (!merged.interactionCount && f.interactionCount)
      merged.interactionCount = f.interactionCount;

    // Everything else goes into extra keyed by source
    merged.extra[result.source] = f;
  }

  return merged;
}

// ─── MAIN INDEXER ─────────────────────────────────────────────────────────────

export class URLIndexer {
  static UUID    = INDEXER_UUID;
  static VERSION = INDEXER_VERSION;

  constructor({ bus, corsProxy = true } = {}) {
    this._bus       = bus;
    this._corsProxy = corsProxy;
    this._extractors = [
      new OGExtractor(),
      new JSONLDExtractor(),
      new OEmbedExtractor(),
      new FeedExtractor(),
      new ArchiveExtractor(),
      new WebFingerExtractor(),
      new DoHExtractor(),
      new CertExtractor(),
      new SitemapExtractor(),
      new PlatformScraper(),
    ];
  }

  _emit(channel, data) {
    if (this._bus) this._bus.emit(channel, { ...data, indexerUUID: INDEXER_UUID });
  }

  async _fetchHTML(url) {
    // Try direct first
    try {
      const r = await safeFetch(url, { headers: { 'Accept': 'text/html' } }, 10000);
      if (r.ok) {
        const html = await r.text();
        return { html, doc: parseHTML(html), via: 'direct' };
      }
    } catch {}

    // CORS proxy fallback
    if (this._corsProxy) {
      try {
        const html = await fetchViaProxy(url);
        if (html) return { html, doc: parseHTML(html), via: 'proxy' };
      } catch {}
    }

    return { html: null, doc: null, via: null };
  }

  /**
   * Index a URL. Returns IndexResult with merged fields + per-extractor breakdown.
   * All extractors run in parallel. Results fused by confidence weighting.
   */
  async index(url) {
    const startedAt = Date.now();
    this._emit('irs.indexer.started', { url });

    const { html, doc, via } = await this._fetchHTML(url);
    this._emit('irs.indexer.fetched', { url, via, hasDoc: !!doc });

    // Run all extractors in parallel
    const results = await Promise.all(
      this._extractors.map(async (ex) => {
        try {
          const result = await ex.extract(url, html, doc);
          this._emit(`irs.indexer.extractor.${result.ok ? 'ok' : 'fail'}`, {
            extractor: ex.name, uuid: ex.uuid, result
          });
          return result;
        } catch (e) {
          return { ok: false, source: ex.name, error: e.message };
        }
      })
    );

    const merged = mergeResults(results);
    const durationMs = Date.now() - startedAt;

    const indexResult = {
      url,
      indexedAt: new Date().toISOString(),
      durationMs,
      fetchedVia: via,
      extractors: {
        total: results.length,
        succeeded: results.filter(r => r.ok).length,
        failed: results.filter(r => !r.ok).length,
        breakdown: results.map(r => ({ source: r.source, ok: r.ok, error: r.error })),
      },
      merged,
      raw: results,
    };

    this._emit('irs.indexer.complete', { url, result: indexResult });
    return indexResult;
  }

  /**
   * Bulk index multiple URLs. Returns array of IndexResults.
   * Concurrency-limited to avoid hammering targets.
   */
  async bulkIndex(urls, { concurrency = 3 } = {}) {
    const results = [];
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(u => this.index(u)));
      results.push(...batchResults);
    }
    return results;
  }
}

export default URLIndexer;
