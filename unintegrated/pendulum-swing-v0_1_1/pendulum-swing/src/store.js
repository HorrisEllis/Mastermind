'use strict';

/**
 * PENDULUM SWING — Signal Store
 * Manages named signals and their observation histories.
 * Persistence: flat JSON via atomic write. Jaa-compatible schema.
 * No external dependencies at this layer.
 */

const fs = require('fs');
const path = require('path');
const { profile } = require('./math');

const DEFAULT_DATA_PATH = path.join(process.cwd(), 'pendulum-data.json');
const MAX_OBSERVATIONS_PER_SIGNAL = 500;

/**
 * Load state from disk. Returns empty state if file doesn't exist.
 */
function load(dataPath) {
  const p = dataPath || DEFAULT_DATA_PATH;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') {
      return { signals: {}, meta: { createdAt: Date.now(), version: '0.1.0' } };
    }
    throw new Error('PENDULUM_STORE_READ_FAIL: ' + e.message);
  }
}

/**
 * Atomic write to disk.
 */
function save(state, dataPath) {
  const p = dataPath || DEFAULT_DATA_PATH;
  const tmp = p + '.tmp.' + Date.now();
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, p);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    throw new Error('PENDULUM_STORE_WRITE_FAIL: ' + e.message);
  }
}

/**
 * Observe — record a new signal value.
 * signalId: string — name of the signal
 * value: number — signal value at this time
 * ts: number — Unix ms (optional, defaults to Date.now())
 * source: string — what produced this observation
 * Returns the updated signal record.
 */
function observe(state, signalId, value, source, ts) {
  if (!signalId || typeof signalId !== 'string') {
    throw new Error('PENDULUM_OBSERVE: signalId required');
  }
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error('PENDULUM_OBSERVE: value must be a number');
  }

  const timestamp = ts || Date.now();
  source = source || 'manual';

  if (!state.signals[signalId]) {
    state.signals[signalId] = {
      id: signalId,
      createdAt: timestamp,
      observations: []
    };
  }

  const signal = state.signals[signalId];

  // Reject out-of-order observations — causality is required
  if (signal.observations.length > 0) {
    const lastTs = signal.observations[signal.observations.length - 1].ts;
    if (timestamp < lastTs) {
      throw new Error(
        'PENDULUM_OBSERVE: out-of-order timestamp. ' +
        'New ts ' + timestamp + ' < last ts ' + lastTs
      );
    }
  }

  signal.observations.push({ ts: timestamp, value: value, source: source });

  // Cap to MAX — drop oldest
  if (signal.observations.length > MAX_OBSERVATIONS_PER_SIGNAL) {
    signal.observations = signal.observations.slice(
      signal.observations.length - MAX_OBSERVATIONS_PER_SIGNAL
    );
  }

  signal.updatedAt = timestamp;
  return signal;
}

/**
 * Get the full rhythm profile for a signal.
 * Returns null if signal doesn't exist.
 */
function getProfile(state, signalId) {
  const signal = state.signals[signalId];
  if (!signal) return null;
  return {
    signalId: signalId,
    createdAt: signal.createdAt,
    updatedAt: signal.updatedAt,
    profile: profile(signal.observations)
  };
}

/**
 * List all signal IDs.
 */
function listSignals(state) {
  return Object.keys(state.signals).map(function(id) {
    const s = state.signals[id];
    return {
      id: id,
      observationCount: s.observations.length,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt
    };
  });
}

/**
 * Delete a signal and all its observations.
 */
function deleteSignal(state, signalId) {
  if (!state.signals[signalId]) {
    return false;
  }
  delete state.signals[signalId];
  return true;
}

module.exports = { load, save, observe, getProfile, listSignals, deleteSignal };
