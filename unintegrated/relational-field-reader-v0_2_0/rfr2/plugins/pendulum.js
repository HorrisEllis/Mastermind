'use strict';
// pendulum.js — rhythm/oscillation analysis, ported from the inline Pendulum
// engine in people-module-raven_negotiation.html.
//
// Real change from the HTML version: signal history now persists via
// meta.invariant (key 'pendulum:<signalId>') instead of living only in a
// closure variable that's lost on refresh — AXIOMS §2.1.
//
// data shape this plugin reacts to: { signal: { id, value, ts? } }
// annotates: data.signal.profile = { status, mean, amplitude, period,
//            damping, phase, forced, tensionScore, count }

const MIN_OBS = 4;
const MAX_HISTORY = 200;

function loadSeries(inv, signalId) { return inv.get('pendulum:' + signalId) || []; }
function saveSeries(inv, signalId, series) { inv.set('pendulum:' + signalId, series); }

function profile(series) {
  if (series.length < MIN_OBS) return { status: 'insufficient', count: series.length };
  const vals = series.map(o => o.v);
  const mean = vals.reduce((a,b)=>a+b,0) / vals.length;

  const peaks = [];
  for (let i = 1; i < vals.length - 1; i++) {
    if (vals[i] > vals[i-1] && vals[i] > vals[i+1]) peaks.push({ v: vals[i], ts: series[i].ts });
  }

  let period = null;
  if (peaks.length >= 2) {
    const gaps = peaks.slice(1).map((p,i) => p.ts - peaks[i].ts);
    period = gaps.reduce((a,b)=>a+b,0) / gaps.length;
  }

  const maxV = Math.max(...vals), minV = Math.min(...vals);
  const amp = (maxV - minV) / 2;

  const half = Math.floor(vals.length/2);
  const earlyAmp  = Math.max(...vals.slice(0,half)) - Math.min(...vals.slice(0,half));
  const recentAmp = Math.max(...vals.slice(half)) - Math.min(...vals.slice(half));
  const damping = earlyAmp > 0.01
    ? (recentAmp < earlyAmp * 0.85 ? 'damping' : recentAmp > earlyAmp * 1.15 ? 'amplifying' : 'neutral')
    : 'neutral';

  const last = vals[vals.length-1];
  const prev = vals[vals.length-2] ?? last;
  const phase = last > mean ? (last > prev ? 'peak' : 'falling') : (last < prev ? 'trough' : 'rising');

  const recentStretch = vals.slice(-8);
  const allAbove = recentStretch.every(v => v > mean + amp*0.6);
  const allBelow = recentStretch.every(v => v < mean - amp*0.6);
  const forced = allAbove || allBelow;
  const tensionScore = forced ? Math.min(1, Math.abs(last - mean) / (amp + 0.01)) : 0;

  return {
    status: 'ok', mean: +mean.toFixed(3), amplitude: +amp.toFixed(3),
    period, damping, phase, forced, tensionScore: +tensionScore.toFixed(3),
    count: series.length,
  };
}

module.exports = {
  name: 'pendulum',
  description: 'oscillation analysis (period/amplitude/phase/damping/forced) per persisted signal.',
  priority: 25,

  process(data, meta /*, config */) {
    if (!data || typeof data !== 'object' || !data.signal) return data;

    const { id, value, ts } = data.signal;
    if (typeof id !== 'string' || typeof value !== 'number') {
      meta.bus.emit('pendulum:error', { reason: 'bad-input', got: data.signal }); // §1.2 — loud
      return data;
    }

    const inv = meta.invariant;
    const series = loadSeries(inv, id);
    series.push({ v: value, ts: ts || Date.now() });
    if (series.length > MAX_HISTORY) series.shift();
    saveSeries(inv, id, series);

    data.signal.profile = profile(series);

    if (data.signal.profile.forced) {
      meta.bus.emit('pendulum:forced', { id, tensionScore: data.signal.profile.tensionScore, ts: Date.now() });
    }

    return data;
  },

  ui: {
    panel: 'pendulum',
    widget: 'line-chart',
    emits: ['pendulum:forced', 'pendulum:error'],
  },
};

module.exports.profile = profile;
