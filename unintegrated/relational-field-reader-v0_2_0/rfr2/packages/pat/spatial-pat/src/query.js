/**
 * @spatial/pat — query.js
 * CQL-lite surface for querying the PAT session store.
 * Emits PAT_QUERY_RESULT on bus. Never throws (§K7).
 *
 * Query operators:
 *   bySubject(subjectId)            — all sessions for a subject
 *   byTimeRange(startMs, endMs)     — sessions in a time window
 *   bySignal(signalType)            — sessions containing a signal type
 *   latest(n)                       — n most recent sessions
 *   summary()                       — aggregate stats across all sessions
 */
'use strict';

export const QUERY_VERSION = '1.0.0';

export class PatQuery {
  /**
   * @param {{ store: PatStore, bus?: SISOBus }} opts
   */
  constructor({ store, bus = null } = {}) {
    if (!store) throw new Error('[PatQuery] store required');
    this._store = store;
    this._bus   = bus;
  }

  _emit(queryId, results, queryType, error = null) {
    if (!this._bus) return;
    this._bus.emit('spatial.pat.query.result', {
      queryId, queryType, results, error,
      count: results?.length ?? 0,
      ts: Date.now(),
    });
  }

  /** All sessions for a given subject ID */
  bySubject(subjectId, { queryId = null } = {}) {
    const qid = queryId ?? `q-${Date.now()}`;
    try {
      const all = this._store.list?.() ?? [];
      const results = all.filter(s =>
        s.subjects?.some(sub => sub.id === subjectId)
      );
      this._emit(qid, results, 'bySubject');
      return results;
    } catch (err) {
      this._emit(qid, [], 'bySubject', err?.message);
      return [];
    }
  }

  /** Sessions within a time window (inclusive) */
  byTimeRange(startMs, endMs, { queryId = null } = {}) {
    const qid = queryId ?? `q-${Date.now()}`;
    try {
      const all = this._store.list?.() ?? [];
      const results = all.filter(s => {
        const t = s.createdAt ?? 0;
        return t >= startMs && t <= endMs;
      });
      this._emit(qid, results, 'byTimeRange');
      return results;
    } catch (err) {
      this._emit(qid, [], 'byTimeRange', err?.message);
      return [];
    }
  }

  /** Sessions containing at least one event of signalType */
  bySignal(signalType, { queryId = null } = {}) {
    const qid = queryId ?? `q-${Date.now()}`;
    try {
      const all = this._store.list?.() ?? [];
      const results = all.filter(s =>
        s.signal_events?.some(e => e.signal === signalType || e.type === signalType)
      );
      this._emit(qid, results, 'bySignal');
      return results;
    } catch (err) {
      this._emit(qid, [], 'bySignal', err?.message);
      return [];
    }
  }

  /** N most recently closed sessions */
  latest(n = 10, { queryId = null } = {}) {
    const qid = queryId ?? `q-${Date.now()}`;
    try {
      const all = this._store.list?.() ?? [];
      const results = [...all]
        .sort((a, b) => (b.closedAt ?? b.createdAt ?? 0) - (a.closedAt ?? a.createdAt ?? 0))
        .slice(0, n);
      this._emit(qid, results, 'latest');
      return results;
    } catch (err) {
      this._emit(qid, [], 'latest', err?.message);
      return [];
    }
  }

  /** Aggregate stats across all stored sessions */
  summary({ queryId = null } = {}) {
    const qid = queryId ?? `q-${Date.now()}`;
    try {
      const all = this._store.list?.() ?? [];
      const closed = all.filter(s => s.closedAt);
      const totalDuration = closed.reduce((s, sess) => s + (sess.durationMs ?? 0), 0);
      const subjectIds = new Set(all.flatMap(s => s.subjects?.map(sub => sub.id) ?? []));
      const signalTypes = new Set(all.flatMap(s => s.signal_events?.map(e => e.signal ?? e.type) ?? []));

      const result = {
        sessionCount:    all.length,
        closedCount:     closed.length,
        totalDurationMs: totalDuration,
        avgDurationMs:   closed.length ? totalDuration / closed.length : 0,
        uniqueSubjects:  subjectIds.size,
        uniqueSignals:   signalTypes.size,
        subjects:        [...subjectIds],
        signals:         [...signalTypes],
        earliest:        all.length ? Math.min(...all.map(s => s.createdAt ?? Infinity)) : null,
        latest:          all.length ? Math.max(...all.map(s => s.createdAt ?? 0)) : null,
      };
      this._emit(qid, [result], 'summary');
      return result;
    } catch (err) {
      this._emit(qid, [], 'summary', err?.message);
      return null;
    }
  }
}
