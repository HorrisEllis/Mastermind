/**
 * @spatial/ase — signature.js
 * Work fingerprint. The behavioral geometry of a piece of art.
 * Not what people say about it. What it actually does to them.
 */
'use strict';

export function createWorkSignature({ workId, title = '', medium = '', creatorId = null }) {
  return {
    workId, title, medium, creatorId,
    signature: {
      tonalCenter:    [0,0,0,0,0],  // mean latent response across encounters
      radiusProfile:  [0,0,0,0,0],  // variance — how differently people respond
      suppressionLift: 0,           // avg suppression change at encounter
      coherenceShift:  0,           // avg coherence change at encounter
      engagementArc:   'unknown',   // rising|falling|sustained|spike
    },
    encounters:   [],
    trajectory: {
      firstEncounterTs: null,
      totalEncounters:  0,
      resonanceOverTime:[],
      peakResonance:    0,
      currentResonance: 0,
      trend:            'unknown',  // deepening|dissolving|stable|emerging
    },
    createdAt: Date.now(),
  };
}

export function recordEncounter(sig, { personFingerprint, responseVector, preVector, duration = 0, returnCount = 1, ts = Date.now() }) {
  const delta = responseVector.map((v,i) => v - (preVector?.[i] ?? 0));
  sig.encounters.push({ personFingerprint, responseVector, delta, duration, returnCount, ts });
  _rebuildSignature(sig);
  return sig;
}

function _rebuildSignature(sig) {
  const enc = sig.encounters;
  if (!enc.length) return;
  const n = enc.length;

  // Tonal center — mean response vector
  const center = [0,0,0,0,0];
  for (const e of enc) for (let i=0;i<5;i++) center[i] += (e.responseVector?.[i]??0)/n;
  sig.signature.tonalCenter = center.map(v => Math.round(v*10000)/10000);

  // Radius profile — std dev per axis
  const variance = [0,0,0,0,0];
  for (const e of enc) for (let i=0;i<5;i++) variance[i] += ((e.responseVector?.[i]??0)-center[i])**2/n;
  sig.signature.radiusProfile = variance.map(v => Math.round(Math.sqrt(v)*10000)/10000);

  // Suppression lift — how much does this work drop suppression?
  const suppDeltas = enc.map(e => e.delta?.[2] ?? 0);
  sig.signature.suppressionLift = Math.round(suppDeltas.reduce((s,v)=>s+v,0)/n*10000)/10000;

  // Coherence shift
  const cohDeltas = enc.map(e => e.delta?.[3] ?? 0);
  sig.signature.coherenceShift = Math.round(cohDeltas.reduce((s,v)=>s+v,0)/n*10000)/10000;

  // Engagement arc
  if (enc.length >= 4) {
    const first = enc.slice(0, Math.ceil(n/2)).map(e=>e.responseVector?.[4]??0);
    const last  = enc.slice(Math.floor(n/2)).map(e=>e.responseVector?.[4]??0);
    const firstMean = first.reduce((s,v)=>s+v,0)/first.length;
    const lastMean  = last.reduce((s,v)=>s+v,0)/last.length;
    const diff = lastMean - firstMean;
    sig.signature.engagementArc = diff > 0.1 ? 'rising' : diff < -0.1 ? 'falling' : 'sustained';
  }

  // Trajectory
  if (!sig.trajectory.firstEncounterTs) sig.trajectory.firstEncounterTs = enc[0].ts;
  sig.trajectory.totalEncounters = n;
  const currentRes = Math.round((1 - sig.signature.radiusProfile.reduce((s,v)=>s+v,0)/5)*10000)/10000;
  sig.trajectory.resonanceOverTime.push({ ts: Date.now(), score: currentRes, encounterCount: n });
  if (sig.trajectory.resonanceOverTime.length > 200) sig.trajectory.resonanceOverTime.shift();
  sig.trajectory.currentResonance = currentRes;
  if (currentRes > sig.trajectory.peakResonance) sig.trajectory.peakResonance = currentRes;
  // Trend
  const rots = sig.trajectory.resonanceOverTime;
  if (rots.length >= 4) {
    const recent = rots.slice(-4).map(r=>r.score);
    const slope  = recent[3]-recent[0];
    sig.trajectory.trend = slope > 0.05 ? 'deepening' : slope < -0.05 ? 'dissolving' : 'stable';
    if (n < 5 && currentRes > 0.6) sig.trajectory.trend = 'emerging';
  }
}
