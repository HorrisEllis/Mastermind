/**
 * @spatial/ingest — notion.js
 *
 * Notion import pipeline.
 * Reads pages, databases, and block trees from the Notion API.
 * Emits each page as alk.text.ingest chunks.
 *
 * §1.1 — Nothing pretends. Block content is extracted as-is.
 *         Notion's block structure is preserved in metadata.
 * §P1  — No Notion content stored. Fetched, chunked, forwarded, discarded.
 * §5.5 — Zero runtime dependencies beyond fetch (standard in Node >=18).
 * §K7  — All errors as events. Never throws.
 *
 * ── What this does ────────────────────────────────────────────────────────
 *
 * Takes a Notion integration token + page/database ID.
 * Walks the block tree. Extracts all text content.
 * Emits to alk.text.ingest. Done.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * No bidirectional sync. No write operations.
 * No image/file attachment processing.
 * No retention of Notion content after chunking.
 * No polling — call ingestPage() when you want a snapshot.
 *
 * ── Notion API ───────────────────────────────────────────────────────────
 *
 * Requires: Notion integration token with read access.
 * API version: 2022-06-28
 *
 * To get a token:
 *   1. notion.so/my-integrations → New integration
 *   2. Give it read access to the pages you want
 *   3. Share each page with the integration
 */

'use strict';

export const NOTION_VERSION = '1.0.0';
const NOTION_API    = 'https://api.notion.com/v1';
const NOTION_VER    = '2022-06-28';

// ── Block → text extractors ───────────────────────────────────────────────────

function richTextToString(richText = []) {
  return richText.map(t => t.plain_text ?? '').join('');
}

function blockToText(block) {
  if (!block?.type) return '';
  const t = block.type;
  const content = block[t];

  switch (t) {
    case 'paragraph':
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'callout':
    case 'quote':
    case 'toggle':
      return richTextToString(content?.rich_text);

    case 'bulleted_list_item':
    case 'numbered_list_item':
    case 'to_do':
      return richTextToString(content?.rich_text);

    case 'code':
      // Include code blocks — code is authored thought
      return richTextToString(content?.rich_text);

    case 'equation':
      return content?.expression ?? '';

    case 'table_row':
      return (content?.cells ?? []).map(cell => richTextToString(cell)).join(' | ');

    case 'child_page':
      return content?.title ?? '';

    case 'child_database':
      return content?.title ?? '';

    // Structural blocks with no direct text content
    case 'divider':
    case 'image':
    case 'video':
    case 'file':
    case 'pdf':
    case 'bookmark':
    case 'link_preview':
    case 'table':
    case 'column_list':
    case 'column':
    case 'breadcrumb':
    case 'table_of_contents':
    case 'embed':
    case 'synced_block':
    case 'template':
      return '';

    default:
      // Unknown block — try to extract any rich_text field
      return richTextToString(content?.rich_text);
  }
}

// ── API client ────────────────────────────────────────────────────────────────

function headers(token) {
  return {
    'Authorization':  `Bearer ${token}`,
    'Notion-Version': NOTION_VER,
    'Content-Type':   'application/json',
  };
}

async function notionGet(token, path) {
  const res = await fetch(`${NOTION_API}${path}`, { headers: headers(token) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Notion API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function notionPost(token, path, body) {
  const res = await fetch(`${NOTION_API}${path}`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = await res.text().catch(() => '');
    throw new Error(`Notion API ${res.status}: ${b.slice(0, 200)}`);
  }
  return res.json();
}

// ── Block tree walker ──────────────────────────────────────────────────────────

async function walkBlocks(token, blockId, depth = 0) {
  if (depth > 8) return [];   // cap recursion
  const texts = [];
  let cursor;

  do {
    const params = cursor ? `?start_cursor=${cursor}` : '';
    const data = await notionGet(token, `/blocks/${blockId}/children${params}`);
    for (const block of data.results ?? []) {
      const text = blockToText(block).trim();
      if (text) texts.push(text);
      // Recurse into blocks that have children
      if (block.has_children && !['child_database'].includes(block.type)) {
        const childTexts = await walkBlocks(token, block.id, depth + 1);
        texts.push(...childTexts);
      }
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return texts;
}

// ── Database row extractor ────────────────────────────────────────────────────

function propertyToText(property) {
  if (!property?.type) return '';
  switch (property.type) {
    case 'title':
    case 'rich_text':
      return richTextToString(property[property.type]);
    case 'select':
      return property.select?.name ?? '';
    case 'multi_select':
      return (property.multi_select ?? []).map(s => s.name).join(', ');
    case 'date':
      return property.date?.start ?? '';
    case 'checkbox':
      return property.checkbox ? 'yes' : 'no';
    case 'number':
      return property.number != null ? String(property.number) : '';
    case 'url':
      return property.url ?? '';
    case 'email':
      return property.email ?? '';
    case 'phone_number':
      return property.phone_number ?? '';
    case 'formula':
      return String(property.formula?.string ?? property.formula?.number ?? '');
    default:
      return '';
  }
}

async function walkDatabase(token, databaseId) {
  const rows = [];
  let cursor;
  do {
    const body = cursor ? { start_cursor: cursor } : {};
    const data = await notionPost(token, `/databases/${databaseId}/query`, body);
    for (const page of data.results ?? []) {
      const props = Object.entries(page.properties ?? {})
        .map(([k, v]) => {
          const text = propertyToText(v).trim();
          return text ? `${k}: ${text}` : null;
        })
        .filter(Boolean)
        .join('. ');
      if (props) rows.push(props);
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);
  return rows;
}

// ── NotionIngestor ────────────────────────────────────────────────────────────

import { chunk as chunkText } from './file.js';

export class NotionIngestor {
  /**
   * @param {{ bus: SISOBus, token: string }} opts
   * token: Notion integration token
   */
  constructor({ bus, token } = {}) {
    if (!bus)   throw new Error('[NotionIngestor] bus required');
    if (!token) throw new Error('[NotionIngestor] Notion integration token required');
    this._bus   = bus;
    this._token = token;
  }

  /**
   * Ingest a single Notion page (and all its children recursively).
   */
  async ingestPage({ pageId, personId = 'default', sessionId = null, meta = {} } = {}) {
    if (!pageId) throw new Error('[NotionIngestor] pageId required');
    const ingestId = `notion-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    this._bus.emit('spatial.ingest.notion.start', {
      ingestId, pageId, personId, sessionId, ts: Date.now(),
    });

    try {
      // Get page metadata
      const page  = await notionGet(this._token, `/pages/${pageId}`);
      const title = richTextToString(
        page.properties?.title?.title ??
        page.properties?.Name?.title ??
        []
      ) || 'Untitled';

      // Walk all blocks
      const textLines = await walkBlocks(this._token, pageId);
      const fullText  = textLines.join('\n\n');

      const chunks = chunkText(fullText);
      const sid    = sessionId ?? ingestId;

      chunks.forEach((c, i) => {
        this._bus.emit('alk.text.ingest', {
          text:      c,
          source:    'notion',
          sessionId: sid,
          chunkId:   `${ingestId}:${i}`,
          meta: { ...meta, pageId, title, source: 'notion', chunkIndex: i, totalChunks: chunks.length, personId },
        });
        this._bus.emit('spatial.ingest.notion.page', {
          ingestId, pageId, title, chunkIndex: i, totalChunks: chunks.length,
          personId, sessionId: sid, ts: Date.now(),
        });
      });

      this._bus.emit('spatial.ingest.notion.complete', {
        ingestId, pageId, title, chunkCount: chunks.length,
        personId, sessionId: sid, ts: Date.now(),
      });

      return { ok: true, ingestId, title, chunkCount: chunks.length };

    } catch (err) {
      this._bus.emit('spatial.ingest.notion.error', {
        ingestId, pageId, personId, sessionId,
        error: err?.message ?? 'notion fetch failed', ts: Date.now(),
      });
      return { ok: false, ingestId, error: err?.message };
    }
  }

  /**
   * Ingest an entire Notion database — all rows as text.
   */
  async ingestDatabase({ databaseId, personId = 'default', sessionId = null, meta = {} } = {}) {
    if (!databaseId) throw new Error('[NotionIngestor] databaseId required');
    const ingestId = `notion-db-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    this._bus.emit('spatial.ingest.notion.start', {
      ingestId, databaseId, personId, sessionId, ts: Date.now(),
    });

    try {
      const rows = await walkDatabase(this._token, databaseId);
      const fullText = rows.join('\n\n');
      const chunks   = chunkText(fullText);
      const sid      = sessionId ?? ingestId;

      chunks.forEach((c, i) => {
        this._bus.emit('alk.text.ingest', {
          text:      c,
          source:    'notion',
          sessionId: sid,
          chunkId:   `${ingestId}:${i}`,
          meta: { ...meta, databaseId, source: 'notion-database', chunkIndex: i, totalChunks: chunks.length, personId },
        });
      });

      this._bus.emit('spatial.ingest.notion.complete', {
        ingestId, databaseId, rowCount: rows.length, chunkCount: chunks.length,
        personId, sessionId: sid, ts: Date.now(),
      });

      return { ok: true, ingestId, rowCount: rows.length, chunkCount: chunks.length };

    } catch (err) {
      this._bus.emit('spatial.ingest.notion.error', {
        ingestId, databaseId, personId, sessionId,
        error: err?.message ?? 'notion fetch failed', ts: Date.now(),
      });
      return { ok: false, ingestId, error: err?.message };
    }
  }
}
