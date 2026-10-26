/**
 * @spatial/pat — v1.0.0
 * Canonical session record. WAL persistence. Cross-species.
 */
export { createSession, closeSession, SCHEMA_VERSION, PAT_MAGIC } from './schema.js';
export { PatStore }                                                 from './store.js';

export { PatQuery, QUERY_VERSION } from './query.js';
