'use strict';

/**
 * PENDULUM SWING — Kernel
 * Public interface. All interaction goes through here.
 * External connections (event bus, API) attach here only if strictly necessary.
 *
 * Usage:
 *   const ps = require('./src/kernel');
 *   ps.observe('valence', 0.42, 'ase-scan');
 *   ps.profile('valence');
 */

const store = require('./store');
const math = require('./math');
const path = require('path');

// State is held in memory. Persisted to disk on every write.
let _state = null;
let _dataPath = null;

/**
 * init — must be called before any other method.
 * dataPath: optional path to persistence file.
 */
function init(dataPath) {
  _dataPath = dataPath || path.join(process.cwd(), 'pendulum-data.json');
  _state = store.load(_dataPath);
  return { ok: true, signals: store.listSignals(_state) };
}

function _requireInit() {
  if (!_state) throw new Error('PENDULUM: call init() first');
}

/**
 * observe — record a signal value.
 *
 * signalId: string   — name of the signal (e.g. 'valence', 'arousal')
 * value:    number   — signal value, any range (normalize externally if needed)
 * source:   string   — what produced this (e.g. 'ase-scan', 'manual', 'guardian')
 * ts:       number   — Unix ms timestamp (optional, defaults to now)
 *
 * Returns the updated profile for this signal.
 * Throws on invalid input or causality violation.
 */
function observe(signalId, value, source, ts) {
  _requireInit();
  store.observe(_state, signalId, value, source, ts);
  store.save(_state, _dataPath);
  return profile(signalId);
}

/**
 * profile — get the full rhythm profile for a signal.
 *
 * Returns:
 * {
 *   signalId, createdAt, updatedAt,
 *   profile: {
 *     status: 'NO_DATA' | 'WARMING' | 'ACTIVE',
 *     observationCount: number,
 *     timespan: ms,
 *     mean: number,
 *     period:    { value: ms|null, confidence: 0-1, sampleSize: n },
 *     amplitude: { positive, negative, asymmetry },
 *     damping:   { coefficient, direction },
 *     phase:     { current: 0-1, position, nextPeakEstimated, confidence },
 *     forced:    { isForced, deviation, tensionScore }
 *   }
 * }
 *
 * Returns null if signal not found.
 */
function profile(signalId) {
  _requireInit();
  return store.getProfile(_state, signalId);
}

/**
 * signals — list all tracked signals.
 */
function signals() {
  _requireInit();
  return store.listSignals(_state);
}

/**
 * remove — delete a signal and all observations.
 */
function remove(signalId) {
  _requireInit();
  const result = store.deleteSignal(_state, signalId);
  if (result) store.save(_state, _dataPath);
  return result;
}

/**
 * snapshot — return full state as plain object.
 * For Versionium commits, debugging, or external export.
 */
function snapshot() {
  _requireInit();
  return JSON.parse(JSON.stringify(_state));
}

/**
 * restore — replace state from a snapshot.
 * Validates structure before accepting.
 */
function restore(snap) {
  if (!snap || !snap.signals || !snap.meta) {
    throw new Error('PENDULUM_RESTORE: invalid snapshot structure');
  }
  _state = snap;
  store.save(_state, _dataPath);
  return { ok: true, signals: store.listSignals(_state) };
}

/**
 * compare — compare two signals' profiles.
 * Useful for detecting correspondence across signals (hermetic: as above so below).
 * Returns period ratio, amplitude ratio, phase delta.
 */
function compare(signalIdA, signalIdB) {
  _requireInit();
  const a = store.getProfile(_state, signalIdA);
  const b = store.getProfile(_state, signalIdB);
  if (!a || !b) return null;

  const pa = a.profile, pb = b.profile;

  const periodRatio = (pa.period.value && pb.period.value)
    ? Math.round((pa.period.value / pb.period.value) * 1000) / 1000
    : null;

  const amplitudeRatio = (pa.amplitude.positive && pb.amplitude.positive)
    ? Math.round(((pa.amplitude.positive + pa.amplitude.negative) /
        (pb.amplitude.positive + pb.amplitude.negative)) * 1000) / 1000
    : null;

  const phaseA = pa.phase && typeof pa.phase.current === 'number' ? pa.phase.current : null;
  const phaseB = pb.phase && typeof pb.phase.current === 'number' ? pb.phase.current : null;
  const phaseDelta = (phaseA !== null && phaseB !== null)
    ? Math.round(Math.abs(phaseA - phaseB) * 1000) / 1000
    : null;

  return {
    signals: [signalIdA, signalIdB],
    periodRatio: periodRatio,
    amplitudeRatio: amplitudeRatio,
    phaseDelta: phaseDelta,
    inPhase: phaseDelta !== null && phaseDelta < 0.1,
    inAntiPhase: phaseDelta !== null && Math.abs(phaseDelta - 0.5) < 0.1
  };
}

module.exports = { init, observe, profile, signals, remove, snapshot, restore, compare };
