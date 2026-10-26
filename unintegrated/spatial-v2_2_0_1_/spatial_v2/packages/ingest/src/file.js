/**
 * @spatial/ingest — file.js
 *
 * File upload ingestion pipeline.
 * Accepts: .txt .md .json .csv .html .pdf (text layer only)
 *
 * §1.1 — Nothing pretends. Raw text is extracted and emitted as-is.
 *         No interpretation here. That belongs to @spatial/kernel.
 * §P1  — No PII stored. File contents are chunked and forwarded
 *         as text signals. Nothing is retained by this module.
 * §5.5 — Zero runtime dependencies. All parsing is first-principles.
 * §K7  — All errors as events. Never throws.
 *
 * ── What this does ────────────────────────────────────────────────────────
 *
 * Takes a file (File object in browser, Buffer/string in Node).
 * Extracts text. Chunks it. Emits each chunk as alk.text.ingest.
 * The text module picks it up from there — topic modeling, coherence,
 * entity tracking, semantic field coverage.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * No OCR. No image analysis. No binary parsing beyond PDF text layer.
 * No retention of file content after chunking.
 * No metadata stored beyond what's needed for session attribution.
 */

'use strict';

export const FILE_VERSION = '1.0.0';

// ── Supported formats ─────────────────────────────────────────────────────────

export const SUPPORTED_TYPES = Object.freeze([
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/json',
  'application/pdf',
]);

export const SUPPORTED_EXTENSIONS = Object.freeze([
  '.txt', '.md', '.markdown', '.html', '.htm',
  '.csv', '.tsv', '.json', '.jsonl', '.pdf',
]);

// ── Chunk config ──────────────────────────────────────────────────────────────

const CHUNK_SIZE     = 800;   // target chars per chunk
const CHUNK_OVERLAP  = 80;    // overlap between chunks for continuity
const MIN_CHUNK_LEN  = 20;    // discard chunks shorter than this

// ── Text extractors per format ────────────────────────────────────────────────

function extractPlain(text) {
  return text.trim();
}

function extractMarkdown(text) {
  // Strip markdown syntax to plain text — preserve content, drop formatting
  return text
    .replace(/^#{1,6}\s+/gm, '')           // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')       // bold
    .replace(/\*(.+?)\*/g, '$1')           // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, '')    // code
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // links → label only
    .replace(/^[-*+]\s+/gm, '')            // list bullets
    .replace(/^\d+\.\s+/gm, '')           // numbered lists
    .replace(/^>\s+/gm, '')               // blockquotes
    .replace(/---+/g, '')                 // horizontal rules
    .trim();
}

function extractHTML(text) {
  // Strip HTML tags, decode basic entities
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractCSV(text) {
  // Convert rows to natural language lines
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0]?.split(',').map(h => h.trim().replace(/^"|"$/g, '')) ?? [];
  if (!header.length) return text;
  return lines.slice(1).map(row => {
    const cells = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    return header.map((h, i) => `${h}: ${cells[i] ?? ''}`)
      .filter(p => !p.endsWith(': '))
      .join('. ');
  }).filter(Boolean).join('\n');
}

function extractJSON(text) {
  // Flatten JSON to readable key: value pairs
  try {
    const obj = JSON.parse(text);
    return flattenJSON(obj, '').join('\n');
  } catch {
    // Not valid JSON — treat as plain text
    return text.trim();
  }
}

function flattenJSON(obj, prefix, depth = 0) {
  if (depth > 6) return [];
  const lines = [];
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      if (typeof item === 'object' && item !== null) {
        lines.push(...flattenJSON(item, prefix ? `${prefix}[${i}]` : `[${i}]`, depth + 1));
      } else {
        lines.push(`${prefix || 'item'}: ${item}`);
      }
    });
  } else if (typeof obj === 'object' && obj !== null) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (typeof v === 'object' && v !== null) {
        lines.push(...flattenJSON(v, key, depth + 1));
      } else if (v !== null && v !== undefined && String(v).trim()) {
        lines.push(`${key}: ${v}`);
      }
    }
  } else {
    lines.push(String(obj));
  }
  return lines;
}

function extractPDF(text) {
  // PDF text layer — assume already extracted as string (e.g. via pdf.js or pdftotext)
  // Strip common PDF artifacts
  return text
    .replace(/\f/g, '\n')              // form feeds → newlines
    .replace(/(\w)-\n(\w)/g, '$1$2')  // de-hyphenate line breaks
    .replace(/\n{3,}/g, '\n\n')       // collapse excessive newlines
    .trim();
}

// ── Text extraction dispatcher ────────────────────────────────────────────────

function detectFormat(filename = '', mimeType = '') {
  const ext = filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (mimeType.includes('pdf') || ext === '.pdf')      return 'pdf';
  if (mimeType.includes('html') || ext === '.html' || ext === '.htm') return 'html';
  if (mimeType.includes('csv') || ext === '.csv' || ext === '.tsv')   return 'csv';
  if (mimeType.includes('json') || ext === '.json' || ext === '.jsonl') return 'json';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  return 'plain';
}

export function extractText(rawText, { filename = '', mimeType = '' } = {}) {
  const format = detectFormat(filename, mimeType);
  switch (format) {
    case 'markdown': return { text: extractMarkdown(rawText), format };
    case 'html':     return { text: extractHTML(rawText),     format };
    case 'csv':      return { text: extractCSV(rawText),      format };
    case 'json':     return { text: extractJSON(rawText),     format };
    case 'pdf':      return { text: extractPDF(rawText),      format };
    default:         return { text: extractPlain(rawText),    format: 'plain' };
  }
}

// ── Chunker ───────────────────────────────────────────────────────────────────
// Splits at sentence/paragraph boundaries where possible.

export function chunk(text, { chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP } = {}) {
  if (!text || text.length < MIN_CHUNK_LEN) return [];

  // Split into paragraphs first, then sentences within
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    // If adding this paragraph keeps us under chunkSize, accumulate
    if (current.length + para.length + 2 <= chunkSize) {
      current = current ? `${current}\n\n${para}` : para;
    } else if (para.length > chunkSize) {
      // Para is itself too big — split by sentence
      if (current.length >= MIN_CHUNK_LEN) {
        chunks.push(current.trim());
        // carry overlap
        current = current.slice(-overlap);
      }
      const sentences = para.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [para];
      for (const sent of sentences) {
        if (current.length + sent.length <= chunkSize) {
          current += (current ? ' ' : '') + sent.trim();
        } else {
          if (current.length >= MIN_CHUNK_LEN) chunks.push(current.trim());
          current = current.slice(-overlap) + ' ' + sent.trim();
        }
      }
    } else {
      // Flush current, start new chunk
      if (current.length >= MIN_CHUNK_LEN) {
        chunks.push(current.trim());
        current = current.slice(-overlap) + '\n\n' + para;
      } else {
        current = para;
      }
    }
  }
  if (current.trim().length >= MIN_CHUNK_LEN) chunks.push(current.trim());
  return chunks;
}

// ── FileIngestor ──────────────────────────────────────────────────────────────

export class FileIngestor {
  /**
   * @param {{ bus: SISOBus }} opts
   */
  constructor({ bus } = {}) {
    if (!bus) throw new Error('[FileIngestor] bus required');
    this._bus = bus;
  }

  /**
   * Ingest a file. Emits alk.text.ingest for each chunk.
   *
   * @param {object} opts
   * @param {string} opts.text       — raw file text (already read from disk/File API)
   * @param {string} opts.filename   — original filename
   * @param {string} opts.mimeType   — MIME type if known
   * @param {string} opts.personId   — subject ID
   * @param {string} opts.sessionId  — session ID
   * @param {object} opts.meta       — any additional metadata (title, path, etc.)
   */
  ingest({ text, filename = '', mimeType = '', personId = 'default', sessionId = null, meta = {} } = {}) {
    const ingestId = `file-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    this._bus.emit('spatial.ingest.file.start', {
      ingestId, filename, mimeType, personId, sessionId, ts: Date.now(),
    });

    let extracted, format;
    try {
      ({ text: extracted, format } = extractText(text, { filename, mimeType }));
    } catch (err) {
      this._bus.emit('spatial.ingest.file.error', {
        ingestId, filename, personId, sessionId,
        error: err?.message ?? 'extraction failed', ts: Date.now(),
      });
      return { ok: false, ingestId, error: err?.message };
    }

    const chunks = chunk(extracted);
    if (!chunks.length) {
      this._bus.emit('spatial.ingest.file.error', {
        ingestId, filename, personId, sessionId,
        error: 'no usable text extracted', ts: Date.now(),
      });
      return { ok: false, ingestId, error: 'no usable text extracted' };
    }

    // Emit each chunk to the text module
    chunks.forEach((c, i) => {
      this._bus.emit('alk.text.ingest', {
        text:      c,
        source:    'file',
        sessionId: sessionId ?? ingestId,
        chunkId:   `${ingestId}:${i}`,
        meta:      { ...meta, filename, format, chunkIndex: i, totalChunks: chunks.length, personId },
      });
      this._bus.emit('spatial.ingest.file.chunk', {
        ingestId, chunkIndex: i, totalChunks: chunks.length,
        personId, sessionId, ts: Date.now(),
      });
    });

    this._bus.emit('spatial.ingest.file.complete', {
      ingestId, filename, format, chunkCount: chunks.length,
      personId, sessionId, ts: Date.now(),
    });

    return { ok: true, ingestId, format, chunkCount: chunks.length };
  }
}
