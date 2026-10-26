/**
 * @spatial/ingest — v1.0.0
 *
 * File upload, Notion import, and social media ingestion.
 * Everything flows to alk.text.ingest → @spatial/kernel text module.
 *
 * The inversion:
 *   Standard social: post → engagement → ranking → identity as metric
 *   Spatial:         post → authored signal → latent state → geometry → fingerprint
 *
 * §P1  — No PII stored. Content is chunked, forwarded, discarded.
 * §5.5 — Zero runtime dependencies beyond fetch (Node >=18).
 * §K7  — All errors as events. Never throws.
 * §IDL3 — No engagement metrics ingested. Ever.
 */
'use strict';

export { FileIngestor, extractText, chunk, SUPPORTED_TYPES, SUPPORTED_EXTENSIONS, FILE_VERSION } from './file.js';
export { NotionIngestor, NOTION_VERSION } from './notion.js';
export { SocialIngestor, SOCIAL_VERSION } from './social.js';

import { FileIngestor }   from './file.js';
import { SocialIngestor } from './social.js';
import { NotionIngestor } from './notion.js';

export const INGEST_VERSION = '1.0.0';

/**
 * IngestEngine — convenience wrapper that wires all three ingestors to a bus.
 */
export class IngestEngine {
  /**
   * @param {{ bus: SISOBus, notionToken?: string }} opts
   * notionToken: Notion integration token (optional — notion ingestor disabled if absent)
   */
  constructor({ bus, notionToken = null } = {}) {
    if (!bus) throw new Error('[IngestEngine] bus required');
    this.file   = new FileIngestor({ bus });
    this.social = new SocialIngestor({ bus });
    this.notion = notionToken ? new NotionIngestor({ bus, token: notionToken }) : null;
  }
}
