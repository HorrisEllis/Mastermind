'use strict';

/**
 * PENDULUM SWING — Signal Math Engine
 * Pure functions. No side effects. No I/O.
 * Input: array of { ts: number, value: number }
 * All timestamps: Unix ms integers
 */

// Minimum observations before any derived property is computed
const MIN_OBS = 3;
const INSUFFICIENT = { value: null, confidence: 0, reason: 'INSUFFICIENT_DATA' };

/**
 * Mean of signal values
 */
function mean(observations) {
  if (!observations || observations.length === 0) return 0;
  const sum = observations.reduce(function(acc, o) { return acc + o.value; }, 0);
  return sum / observations.length;
}

/**
 * Detect zero-crossings of the mean (where signal crosses mean value)
 * Returns array of { ts, direction: 'up'|'down' }
 */
function zeroCrossings(observations, meanVal) {
  const crossings = [];
  for (var i = 1; i < observations.length; i++) {
    const prev = observations[i - 1].value - meanVal;
    const curr = observations[i].value - meanVal;
    if (prev < 0 && curr >= 0) {
      crossings.push({ ts: observations[i].ts, direction: 'up' });
    } else if (prev >= 0 && curr < 0) {
      crossings.push({ ts: observations[i].ts, direction: 'down' });
    }
  }
  return crossings;
}

/**
 * PERIOD — time between equivalent-direction crossings
 * Returns { estimated: ms, confidence: 0-1, sampleSize: n }
 */
function period(observations) {
  if (!observations || observations.length < MIN_OBS) return INSUFFICIENT;

  const m = mean(observations);
  const crossings = zeroCrossings(observations, m);

  // Need same-direction crossings to measure a full period
  const upCrossings = crossings.filter(function(c) { return c.direction === 'up'; });
  const downCrossings = crossings.filter(function(c) { return c.direction === 'down'; });

  const sameDirCrossings = upCrossings.length >= downCrossings.length
    ? upCrossings : downCrossings;

  if (sameDirCrossings.length < 2) {
    return { value: null, confidence: 0.1, reason: 'NEED_MORE_CYCLES' };
  }

  // Measure deltas between consecutive same-direction crossings
  const periods = [];
  for (var i = 1; i < sameDirCrossings.length; i++) {
    periods.push(sameDirCrossings[i].ts - sameDirCrossings[i - 1].ts);
  }

  const avgPeriod = periods.reduce(function(a, b) { return a + b; }, 0) / periods.length;

  // Confidence: variance in period estimates — lower variance = higher confidence
  const variance = periods.reduce(function(acc, p) {
    return acc + Math.pow(p - avgPeriod, 2);
  }, 0) / periods.length;
  const cv = Math.sqrt(variance) / avgPeriod; // coefficient of variation
  const confidence = Math.max(0, Math.min(1, 1 - cv)) * Math.min(1, periods.length / 5);

  return {
    value: Math.round(avgPeriod),
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: periods.length
  };
}

/**
 * AMPLITUDE — distance from mean to peaks in each direction
 * Returns { positive: float, negative: float, asymmetry: float }
 */
function amplitude(observations) {
  if (!observations || observations.length < MIN_OBS) return INSUFFICIENT;

  const m = mean(observations);
  let maxAbove = 0, maxBelow = 0;

  observations.forEach(function(o) {
    const delta = o.value - m;
    if (delta > maxAbove) maxAbove = delta;
    if (delta < maxBelow) maxBelow = delta; // stays negative
  });

  const pos = Math.round(maxAbove * 1000) / 1000;
  const neg = Math.round(Math.abs(maxBelow) * 1000) / 1000;
  const asymmetry = neg > 0 ? Math.round((pos / neg) * 1000) / 1000 : null;

  return { positive: pos, negative: neg, asymmetry: asymmetry };
}

/**
 * DAMPING — is amplitude changing across cycles?
 * Returns { coefficient: float, direction: 'damping'|'amplifying'|'neutral'|'unknown' }
 * < 1.0 = damping (stabilizing)
 * > 1.0 = amplifying (escalating)
 * = 1.0 = neutral
 */
function damping(observations) {
  if (!observations || observations.length < MIN_OBS * 2) return INSUFFICIENT;

  const m = mean(observations);
  const half = Math.floor(observations.length / 2);
  const firstHalf = observations.slice(0, half);
  const secondHalf = observations.slice(half);

  function halfAmplitude(obs) {
    let max = 0;
    obs.forEach(function(o) {
      const delta = Math.abs(o.value - m);
      if (delta > max) max = delta;
    });
    return max;
  }

  const a1 = halfAmplitude(firstHalf);
  const a2 = halfAmplitude(secondHalf);

  if (a1 === 0) return INSUFFICIENT;

  const coeff = Math.round((a2 / a1) * 1000) / 1000;
  const direction = coeff < 0.95 ? 'damping' : coeff > 1.05 ? 'amplifying' : 'neutral';

  return { coefficient: coeff, direction: direction };
}

/**
 * PHASE — where in the current cycle is the signal?
 * Returns { current: 0-1, position: string, nextPeakEstimated: ts|null }
 * 0 = trough, 0.25 = rising, 0.5 = peak, 0.75 = falling
 */
function phase(observations, periodResult) {
  if (!observations || observations.length < MIN_OBS) return INSUFFICIENT;
  if (!periodResult || !periodResult.value) return INSUFFICIENT;

  const m = mean(observations);
  const crossings = zeroCrossings(observations, m);
  if (crossings.length === 0) return INSUFFICIENT;

  const lastCrossing = crossings[crossings.length - 1];
  const lastObs = observations[observations.length - 1];
  const timeSinceCrossing = lastObs.ts - lastCrossing.ts;
  const p = periodResult.value;

  // Position within half-cycle
  const halfPeriod = p / 2;
  const posInHalf = (timeSinceCrossing % halfPeriod) / halfPeriod;

  // Determine full phase based on crossing direction
  let current;
  if (lastCrossing.direction === 'up') {
    current = 0.25 + posInHalf * 0.25; // 0.25 to 0.5 (rising to peak)
  } else {
    current = 0.75 + posInHalf * 0.25; // 0.75 to 1.0 (falling to trough)
  }
  current = current % 1;
  current = Math.round(current * 1000) / 1000;

  const positions = {
    trough: current < 0.1 || current > 0.9,
    rising: current >= 0.1 && current < 0.4,
    peak: current >= 0.4 && current < 0.6,
    falling: current >= 0.6 && current < 0.9
  };
  const positionName = Object.keys(positions).find(function(k) { return positions[k]; }) || 'unknown';

  // Estimate next peak
  const timeToNextPeak = positionName === 'peak' ? p
    : positionName === 'rising' ? (0.5 - current) * p
    : positionName === 'trough' ? 0.25 * p
    : (1 - current + 0.5) * p;

  const nextPeakEstimated = lastObs.ts + Math.round(timeToNextPeak);

  return {
    current: current,
    position: positionName,
    nextPeakEstimated: nextPeakEstimated,
    confidence: periodResult.confidence
  };
}

/**
 * FORCED — is the signal being held from its natural position?
 * Compares current value to where period predicts it should be.
 * Returns { isForced: bool, deviation: float, tensionScore: 0-1 }
 */
function forced(observations, periodResult, phaseResult) {
  if (!observations || observations.length < MIN_OBS) return INSUFFICIENT;
  if (!periodResult || !periodResult.value) return INSUFFICIENT;
  if (!phaseResult || phaseResult.value === null || typeof phaseResult.current !== 'number') return INSUFFICIENT;

  const m = mean(observations);
  const amp = amplitude(observations);
  if (!amp || amp.positive === null || amp.negative === null) return INSUFFICIENT;

  // Expected value based on phase position (sine approximation)
  const phaseAngle = phaseResult.current * 2 * Math.PI;
  const expectedDelta = Math.sin(phaseAngle) * ((amp.positive + amp.negative) / 2);
  const expectedValue = m + expectedDelta;

  const lastObs = observations[observations.length - 1];
  const deviation = Math.abs(lastObs.value - expectedValue);
  const maxPossibleDeviation = amp.positive + amp.negative;
  const tensionScore = maxPossibleDeviation > 0
    ? Math.min(1, Math.round((deviation / maxPossibleDeviation) * 1000) / 1000)
    : 0;

  return {
    isForced: tensionScore > 0.3,
    deviation: Math.round(deviation * 1000) / 1000,
    tensionScore: tensionScore
  };
}

/**
 * PROFILE — full rhythm profile for a signal
 * Single entry point. Returns all five properties.
 */
function profile(observations) {
  if (!observations || observations.length === 0) {
    return {
      status: 'NO_DATA',
      observationCount: 0,
      period: INSUFFICIENT,
      amplitude: INSUFFICIENT,
      damping: INSUFFICIENT,
      phase: INSUFFICIENT,
      forced: INSUFFICIENT
    };
  }

  // Sort by timestamp ascending — always
  const sorted = observations.slice().sort(function(a, b) { return a.ts - b.ts; });

  const p = period(sorted);
  const a = amplitude(sorted);
  const d = damping(sorted);
  const ph = phase(sorted, p);
  const f = forced(sorted, p, ph);

  return {
    status: sorted.length >= MIN_OBS ? 'ACTIVE' : 'WARMING',
    observationCount: sorted.length,
    timespan: sorted.length > 1
      ? sorted[sorted.length - 1].ts - sorted[0].ts
      : 0,
    mean: Math.round(mean(sorted) * 1000) / 1000,
    period: p,
    amplitude: a,
    damping: d,
    phase: ph,
    forced: f
  };
}

module.exports = { profile, period, amplitude, damping, phase, forced, mean, MIN_OBS };
