#!/usr/bin/env node
/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Resonance CLI  ·  resonance.js  ·  v5.0.0                            ║
 * ║  UUID: res-cli-0000-0000-5000-0000-000000000001                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * CLI-FIRST RESONANCE INTERFACE
 *
 * Commands:
 *   resonance analyze   <text|file>       — full gap + physics + friction + tension analysis
 *   resonance lyric     <file|text>       — lyric field analysis
 *   resonance theta     [H I C M Pc Pe]   — analyze a Theta state vector
 *   resonance pair      <thetaA> <thetaB> — analyze two Theta states in relation
 *   resonance compare   <session-id>      — compare current session to a recorded one
 *   resonance session                     — snapshot current session state
 *   resonance record    [--label <l>]     — record session to ledger for future comparison
 *   resonance ledger    list|history|metrics  — ledger management
 *   resonance friction  <textA> <textB>   — measure friction between two texts
 *   resonance tension   <text>            — measure structural tension
 *   resonance sigma                       — current sigma regime
 *   resonance delta                       — full delta stream
 *   resonance catalogue [--domain <d>]    — browse gap catalogue
 *   resonance invariants                  — the ten cross-domain invariants
 *   resonance emotions                    — emotion signature reference
 *   resonance repl                        — interactive REPL
 *
 * State: .resonance-state.json in cwd
 * Nothing silently fails (§1.2).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createInterface }                          from 'readline';
import { resolve }                                  from 'path';
import { fileURLToPath }                            from 'url';

// Dynamic import for ES module
const __dir = fileURLToPath(new URL('.', import.meta.url));

// We import the engine inline to avoid top-level await issues
let ResonanceEngine, EMOTION_SIGNATURES, PHASE_TRANSITIONS, SIGMA_REGIMES;

async function loadEngine() {
  const mod = await import('../engines/resonance-engine.js');
  ResonanceEngine   = mod.ResonanceEngine;
  EMOTION_SIGNATURES= mod.EMOTION_SIGNATURES;
  PHASE_TRANSITIONS = mod.PHASE_TRANSITIONS;
  SIGMA_REGIMES     = mod.SIGMA_REGIMES;
}

// ── State ─────────────────────────────────────────────────────────────────────

const STATE_FILE = '.resonance-state.json';

function loadState() {
  if (!existsSync(STATE_FILE)) return { sessions: {}, ideas: {}, upgrades: {} };
  try { return JSON.parse(readFileSync(STATE_FILE, 'utf8')); }
  catch (e) { die(`State file corrupted: ${e.message}`); }
}

function saveState(state) {
  try { writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
  catch (e) { die(`Failed to write state: ${e.message}`); }
}

// ── Output ────────────────────────────────────────────────────────────────────

const args   = process.argv.slice(2);
const FORMAT = getFlag('--format') ?? 'pretty';
const QUIET  = args.includes('--quiet');
const DEEP   = args.includes('--deep');

function out(s)   { process.stdout.write(s + '\n'); }
function err(s)   { process.stderr.write(s + '\n'); }
function die(s)   { process.stderr.write(`[resonance] ERROR: ${s}\n`); process.exit(1); }
function hr(c=40) { out('─'.repeat(c)); }

function getFlag(f) {
  const i = args.indexOf(f);
  return i === -1 ? null : args[i + 1] ?? null;
}

function requireArg(pos, label) {
  const positional = args.filter(a => !a.startsWith('--'));
  const v = positional[pos + 1]; // +1 because positional[0] is the command
  if (!v) die(`Missing argument: <${label}>`);
  return v;
}

function getPositional(pos) {
  return args.filter(a => !a.startsWith('--'))[pos + 1] ?? null;
}

function readInput(arg) {
  if (!arg) return null;
  if (existsSync(arg)) {
    try { return readFileSync(arg, 'utf8'); }
    catch (e) { die(`Cannot read file: ${arg}: ${e.message}`); }
  }
  return arg;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtScore(v)   { return `${(v * 100).toFixed(1)}%`; }
function fmtConf(c)    { return c === 'HIGH' ? '●●●' : c === 'MEDIUM' ? '●●○' : '●○○'; }
function fmtRegime(r)  {
  return r === 'STABLE' ? '✓ STABLE' : r === 'DEGRADED' ? '⚡ DEGRADED' : r === 'COLLAPSING' ? '⚠ COLLAPSING' : r === 'OSCILLATORY' ? '↔ OSCILLATORY' : '? INSUFFICIENT_DATA';
}
function fmtZone(z)    {
  return z === 'collapse_zone' ? '🔴 COLLAPSE ZONE' : z === 'high_friction' ? '🟡 HIGH FRICTION' : '🟢 moderate';
}
function fmtTension(t) {
  return t === 'high_tension' ? '⬆ HIGH TENSION' : t === 'moderate_tension' ? '→ MODERATE' : '↓ low';
}

function printAnalysis(result) {
  if (FORMAT === 'json') { out(JSON.stringify(result, null, 2)); return; }

  hr();
  out(`RESONANCE ANALYSIS  ·  ${new Date(result.ts).toISOString()}`);
  hr();

  // Gaps
  if (result.gaps) {
    out(`\n  GAP ANALYSIS`);
    out(`  Score:    ${fmtScore(result.gap_score)}  |  Domain: ${result.gaps.domain ?? 'mixed'}`);
    const detectors = result.gaps.detectors ?? [];
    const active    = detectors.filter(d => d.score >= 0.20).sort((a,b) => b.score - a.score);
    if (active.length) {
      for (const d of active.slice(0, 6)) {
        out(`  ${fmtConf(d.confidence ?? 'LOW')}  ${(d.type ?? d.detector ?? 'unknown').padEnd(25)}  ${fmtScore(d.score)}`);
        if (DEEP && d.shadow_content) out(`       ↳ ${d.shadow_content}`);
        if (DEEP && d.load_bearing_question) out(`       ↳ ${d.load_bearing_question}`);
      }
    } else {
      out(`  (no significant gaps detected at ≥20%)`);
    }
  }

  // Theta / Emotion
  out(`\n  RELATIONAL PHYSICS`);
  const t = result.theta ?? {};
  out(`  Θ:  H:${t.H?.toFixed(2)} I:${t.I?.toFixed(2)} C:${t.C?.toFixed(2)} M:${t.M?.toFixed(2)} Pc:${t.P_c?.toFixed(2)} Pe:${t.P_e?.toFixed(2)}`);
  out(`  Coherence: ${fmtScore(result.coherence)}  |  Collapse pressure: ${fmtScore(result.collapse_pressure)}`);

  if (result.emotion) {
    const prim = result.emotion.primary;
    const sec  = result.emotion.secondary;
    out(`  Emotion:   ${prim.emotion.toUpperCase()} (${fmtScore(prim.confidence)})  secondary: ${sec?.emotion ?? '—'}`);
    if (DEEP && prim.description) out(`  ↳ ${prim.description}`);
    if (result.emotion.transitions?.length) {
      out(`  Transitions at risk:`);
      for (const tr of result.emotion.transitions) {
        out(`    ${tr.from} → ${tr.to}  (risk: ${fmtScore(tr.risk)})`);
        if (DEEP) out(`    ↳ ${tr.mechanism}`);
      }
    }
  }

  // Friction
  out(`\n  FRICTION`);
  const fr = result.friction;
  out(`  Intensity: ${fmtScore(fr.friction_intensity)}  |  Zone: ${fmtZone(fr.zone)}`);
  out(`  Type: ${fr.friction_type ?? 'none'}  |  C-delta: ${fr.C_delta?.toFixed(3)}  |  M-asymmetry: ${fr.M_asymmetry?.toFixed(3)}`);

  // Tension
  out(`\n  TENSION`);
  const tt = result.theta_tension;
  out(`  Theta tension: ${fmtScore(tt.tension)}  |  ${fmtTension(tt.tension_class)}`);
  if (result.avg_gap_tension > 0) {
    out(`  Avg gap tension: ${fmtScore(result.avg_gap_tension)}`);
  }

  // Sigma
  out(`\n  SIGMA REGIME`);
  out(`  ${fmtRegime(result.sigma?.regime)}  (confidence: ${fmtScore(result.sigma?.confidence ?? 0)})`);

  out('');
}

function printTheta(result) {
  if (FORMAT === 'json') { out(JSON.stringify(result, null, 2)); return; }
  hr();
  out('THETA ANALYSIS');
  hr();
  const t = result.theta;
  out(`\n  Θ:  H:${t.H} I:${t.I} C:${t.C} M:${t.M} Pc:${t.P_c} Pe:${t.P_e}`);
  out(`  Coherence:  ${fmtScore(result.coherence)}`);
  const em = result.emotion;
  out(`  Emotion:    ${em.primary.emotion.toUpperCase()}  (${fmtScore(em.primary.confidence)})`);
  out(`  ↳ ${em.primary.description}`);
  const ten = result.tension;
  out(`\n  Tension:    ${fmtScore(ten.tension)}  |  ${fmtTension(ten.tension_class)}`);
  out(`  H:${ten.axes?.entropy?.toFixed(2)} C-absence:${ten.axes?.causal_absence?.toFixed(2)} M-gap:${ten.axes?.intimacy_gap?.toFixed(2)}`);
  if (em.transitions?.length) {
    out('\n  Phase transition risks:');
    for (const tr of em.transitions) {
      out(`  ${tr.from} → ${tr.to}  (${fmtScore(tr.risk)})  ↳ ${tr.mechanism}`);
    }
  }
  out('');
}

function printPair(result) {
  if (FORMAT === 'json') { out(JSON.stringify(result, null, 2)); return; }
  hr();
  out('PAIR ANALYSIS');
  hr();
  out(`\n  Node A:  emotion=${result.node_A.emotion.primary.emotion}  coherence=${fmtScore(result.node_A.coherence)}  gap=${fmtScore(result.node_A.gap_score)}`);
  out(`  Node B:  emotion=${result.node_B.emotion.primary.emotion}  coherence=${fmtScore(result.node_B.coherence)}  gap=${fmtScore(result.node_B.gap_score)}`);
  out(`\n  FRICTION`);
  out(`  Intensity: ${fmtScore(result.friction.friction_intensity)}  |  Zone: ${fmtZone(result.friction.zone)}`);
  out(`  Type: ${result.friction.friction_type}`);
  out(`  M-asymmetry: ${result.M_asymmetry?.toFixed(3)}  |  Pe-asymmetry: ${result.P_e_asymmetry?.toFixed(3)}`);
  out(`\n  TENSION`);
  out(`  A: ${fmtScore(result.tension_A.tension)} ${fmtTension(result.tension_A.tension_class)}`);
  out(`  B: ${fmtScore(result.tension_B.tension)} ${fmtTension(result.tension_B.tension_class)}`);
  out(`  Asymmetry: ${fmtScore(result.tension_asymmetry)}`);
  out(`\n  Dominant dynamic: ${result.dominant_dynamic.toUpperCase()}`);
  if (result.stability) {
    out(`  Stability: ${result.stability.stable ? '✓ STABLE' : '⚠ UNSTABLE'}  (${result.stability.value?.toFixed(4)})`);
  }
  out('');
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdAnalyze() {
  const inputArg = getPositional(0);
  if (!inputArg) die('Usage: resonance analyze <text|file>');
  const text = readInput(inputArg);
  if (!text) die('Empty input');

  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const result = engine.analyzeText(text, {
    domain: getFlag('--domain') ?? undefined,
  });

  printAnalysis(result);
}

async function cmdLyric() {
  const inputArg = getPositional(0);
  if (!inputArg) die('Usage: resonance lyric <file|text>');
  const text = readInput(inputArg);

  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const result = engine.analyzeLyric(text, {
    scheme: getFlag('--scheme') ?? undefined,
    targetSyl: getFlag('--syllables') ? parseInt(getFlag('--syllables')) : 0,
  });

  if (!result) { out('No lyric result.'); return; }
  if (FORMAT === 'json') { out(JSON.stringify(result, null, 2)); return; }

  hr();
  out('LYRIC FIELD ANALYSIS');
  hr();
  out(`\n  Lines:       ${result.line_count}`);
  out(`  Rhyme scheme:${result.rhyme.scheme_detected}  (avg score: ${fmtScore(result.rhyme.avg_rhyme_score)})`);
  out(`  Meter target: ~${result.meter.target_syllables} syllables  (std: ${result.meter.std_deviation})`);
  if (result.content_arc.pivot_detected !== null) {
    out(`  Content pivot: line ${result.content_arc.pivot_detected} of ${result.line_count} (expected ~${result.content_arc.pivot_expected})`);
  }
  if (result.summary.high_pressure_lines?.length) {
    out(`\n  High pressure lines:`);
    for (const l of result.summary.high_pressure_lines.slice(0, 5)) {
      out(`  [${l.line.toString().padStart(2)}]  ${fmtScore(l.pressure)}  "${l.text?.slice(0, 50)}"`);
    }
  }
  if (result.summary.critical_omissions?.length) {
    out(`\n  Critical omissions:`);
    for (const o of result.summary.critical_omissions.slice(0, 5)) {
      out(`  ⚠ ${o.variable}: ${o.impact?.slice(0, 80)}`);
    }
  }
  if (result.friction_timeline) {
    const ft = result.friction_timeline;
    out(`\n  Friction regime: ${fmtRegime(ft.sigma_regime)}  avg: ${fmtScore(ft.avg_friction)}`);
    out(`  Collapse zones: ${ft.collapse_zones}`);
  }
  out('');
}

async function cmdTheta() {
  // Parse Theta from args: H I C M Pc Pe
  const positional = args.filter(a => !a.startsWith('--'));
  const nums = positional.slice(1).map(Number).filter(n => !isNaN(n));

  let thetaInput;
  if (nums.length >= 6) {
    thetaInput = { H: nums[0], I: nums[1], C: nums[2], M: nums[3], P_c: nums[4], P_e: nums[5] };
  } else if (getFlag('--theta')) {
    try { thetaInput = JSON.parse(getFlag('--theta')); }
    catch { die('Invalid --theta JSON. Expected: {"H":0.5,"I":0.5,"C":0.5,"M":0.5,"P_c":0.5,"P_e":0.5}'); }
  } else {
    die('Usage: resonance theta <H> <I> <C> <M> <Pc> <Pe>  or  --theta \'{"H":0.5,...}\'');
  }

  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const result = engine.analyzeTheta(thetaInput);
  printTheta(result);
}

async function cmdPair() {
  const thetaAStr = getFlag('--a') ?? getPositional(0);
  const thetaBStr = getFlag('--b') ?? getPositional(1);
  if (!thetaAStr || !thetaBStr) die('Usage: resonance pair --a \'{"H":...}\' --b \'{"H":...}\'');

  let thetaA, thetaB;
  try { thetaA = JSON.parse(thetaAStr); } catch { die('Invalid --a JSON'); }
  try { thetaB = JSON.parse(thetaBStr); } catch { die('Invalid --b JSON'); }

  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const result = engine.analyzePair(thetaA, thetaB);
  printPair(result);
}

async function cmdFriction() {
  const textAArg = getPositional(0);
  const textBArg = getPositional(1);
  if (!textAArg || !textBArg) die('Usage: resonance friction <textA|fileA> <textB|fileB>');

  const textA = readInput(textAArg);
  const textB = readInput(textBArg);
  const engine = new ResonanceEngine({ project: 'resonance-cli' });

  const resultA = engine.analyzeText(textA);
  const resultB = engine.analyzeText(textB);

  // Edge friction between the two gap results
  const gapA = { score: resultA.gap_score, domain: resultA.gaps?.domain ?? 'mixed', type: 'mixed' };
  const gapB = { score: resultB.gap_score, domain: resultB.gaps?.domain ?? 'mixed', type: 'mixed' };
  const { ResonanceFrictionMeter } = await import('../engines/resonance-engine.js');
  const fm = new ResonanceFrictionMeter();

  const edgeFr = fm.measureEdgeFriction(gapA, gapB);
  const thetaFr = fm.measureTheta(resultA.theta, resultB.theta);

  if (FORMAT === 'json') { out(JSON.stringify({ edge: edgeFr, theta: thetaFr }, null, 2)); return; }

  hr();
  out('FRICTION ANALYSIS');
  hr();
  out(`\n  EDGE FRICTION (gap boundary)`);
  out(`  Intensity: ${fmtScore(edgeFr.friction_intensity)}  |  Zone: ${fmtZone(edgeFr.zone)}`);
  out(`  Type: ${edgeFr.friction_type}`);
  out(`  Domain match: ${edgeFr.domain_match}  |  Type conflict: ${edgeFr.type_conflict}`);
  out(`\n  THETA FRICTION (relational physics)`);
  out(`  Intensity: ${fmtScore(thetaFr.friction_intensity)}  |  Zone: ${fmtZone(thetaFr.zone)}`);
  out(`  Type: ${thetaFr.friction_type}`);
  out(`  C-delta: ${thetaFr.C_delta?.toFixed(3)}  M-asymmetry: ${thetaFr.M_asymmetry?.toFixed(3)}  Pe-asymmetry: ${thetaFr.Pe_asymmetry?.toFixed(3)}`);
  out('');
}

async function cmdTension() {
  const inputArg = getPositional(0);
  if (!inputArg) die('Usage: resonance tension <text|file>');
  const text = readInput(inputArg);

  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const result = engine.analyzeText(text);

  if (FORMAT === 'json') {
    out(JSON.stringify({ theta_tension: result.theta_tension, gap_tensions: result.gap_tensions, avg: result.avg_gap_tension }, null, 2));
    return;
  }

  hr();
  out('TENSION ANALYSIS');
  hr();
  out(`\n  THETA TENSION`);
  out(`  Tension: ${fmtScore(result.theta_tension.tension)}  |  ${fmtTension(result.theta_tension.tension_class)}`);
  out(`  Collapse pressure: ${fmtScore(result.collapse_pressure)}`);
  out(`  Axes: H:${result.theta_tension.axes?.entropy?.toFixed(2)} C-abs:${result.theta_tension.axes?.causal_absence?.toFixed(2)} M-gap:${result.theta_tension.axes?.intimacy_gap?.toFixed(2)}`);

  if (result.gap_tensions?.length) {
    out(`\n  GAP-LEVEL TENSIONS`);
    out(`  Average: ${fmtScore(result.avg_gap_tension)}`);
    for (const t of result.gap_tensions.slice(0, 6)) {
      out(`  ${fmtTension(t.tension_class)}  ${fmtScore(t.tension)}  ${t.avoidance_amplified ? '[avoidance]' : ''} ${t.identity_amplified ? '[identity]' : ''}`);
    }
  }
  out('');
}

async function cmdSession() {
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const snap   = engine.sessionSnapshot();

  if (FORMAT === 'json') { out(JSON.stringify(snap, null, 2)); return; }

  hr();
  out('SESSION SNAPSHOT');
  hr();
  out(`  Session ID:      ${snap.session_id.slice(0, 16)}`);
  out(`  Analyses run:    ${snap.analysis_count}`);
  out(`  Avg gap pressure:${fmtScore(snap.avg_gap_pressure)}`);
  out(`  Avg friction:    ${fmtScore(snap.avg_friction)}`);
  out(`  Sigma regime:    ${fmtRegime(snap.sigma_regime)}`);
  out('');
}

async function cmdRecord() {
  const state  = loadState();
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const label  = getFlag('--label') ?? `Session ${new Date().toISOString()}`;

  // Can't record without having analyzed something — record a note
  const snap = engine.sessionSnapshot();
  const sessionId = uuid4();

  state.sessions[sessionId] = {
    id:      sessionId,
    label,
    ts:      Date.now(),
    ...snap,
  };
  saveState(state);

  if (FORMAT === 'json') { out(JSON.stringify(state.sessions[sessionId], null, 2)); return; }
  out(`  Recorded  ${sessionId.slice(0, 8)}  "${label}"`);
}

async function cmdCompare() {
  const sessionIdArg = getPositional(0);
  if (!sessionIdArg) die('Usage: resonance compare <session-id>');

  const state  = loadState();
  const fullId = Object.keys(state.sessions).find(k => k.startsWith(sessionIdArg));
  if (!fullId) die(`Session not found: ${sessionIdArg}`);

  const source = state.sessions[fullId];
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const current = engine.sessionSnapshot();

  // Manual comparison
  const gapDelta = ((current.avg_gap_pressure ?? 0) - (source.avg_gap_pressure ?? 0));
  const frDelta  = ((current.avg_friction     ?? 0) - (source.avg_friction     ?? 0));

  if (FORMAT === 'json') {
    out(JSON.stringify({ source: { id: fullId, label: source.label }, current, gap_delta: gapDelta, friction_delta: frDelta }, null, 2));
    return;
  }

  hr();
  out('SESSION COMPARISON');
  hr();
  out(`\n  Comparing to: "${source.label}" (${new Date(source.ts).toLocaleDateString()})`);
  out(`\n  Gap pressure:  ${fmtScore(source.avg_gap_pressure ?? 0)} → ${fmtScore(current.avg_gap_pressure)}  (${gapDelta >= 0 ? '+' : ''}${(gapDelta * 100).toFixed(1)}%)`);
  out(`  Friction:      ${fmtScore(source.avg_friction ?? 0)} → ${fmtScore(current.avg_friction)}  (${frDelta >= 0 ? '+' : ''}${(frDelta * 100).toFixed(1)}%)`);
  out(`  Sigma:         ${source.sigma_regime ?? '?'} → ${current.sigma_regime}`);
  out('');
}

async function cmdLedger() {
  const subCmd = getPositional(0) ?? 'list';
  const state  = loadState();

  if (FORMAT === 'json') { out(JSON.stringify(state, null, 2)); return; }

  if (subCmd === 'list' || subCmd === 'sessions') {
    out(`\n── Recorded Sessions (${Object.keys(state.sessions ?? {}).length}) ──`);
    for (const [id, s] of Object.entries(state.sessions ?? {})) {
      out(`  ${id.slice(0, 8)}  [${new Date(s.ts).toLocaleDateString()}]  ${s.label?.slice(0, 50) ?? ''}  regime=${s.sigma_regime ?? '?'}`);
    }
  } else if (subCmd === 'history') {
    out(`\n── Session History ──`);
    const sessions = Object.values(state.sessions ?? {}).sort((a,b) => a.ts - b.ts);
    for (const s of sessions) {
      out(`  ${new Date(s.ts).toISOString()}  ${s.id?.slice(0, 8)}  gap=${fmtScore(s.avg_gap_pressure ?? 0)}  friction=${fmtScore(s.avg_friction ?? 0)}`);
    }
  } else if (subCmd === 'metrics') {
    const sessions = Object.values(state.sessions ?? {});
    const avgGap = sessions.length ? sessions.reduce((s, ss) => s + (ss.avg_gap_pressure ?? 0), 0) / sessions.length : 0;
    const avgFr  = sessions.length ? sessions.reduce((s, ss) => s + (ss.avg_friction ?? 0), 0) / sessions.length : 0;
    out(`\n── Session Metrics ──`);
    out(`  Total sessions:    ${sessions.length}`);
    out(`  Avg gap pressure:  ${fmtScore(avgGap)}`);
    out(`  Avg friction:      ${fmtScore(avgFr)}`);
  } else {
    die(`Unknown ledger subcommand: ${subCmd}. Use: list | history | metrics`);
  }
  out('');
}

async function cmdSigma() {
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const regime = engine.sigmaRegime();
  if (FORMAT === 'json') { out(JSON.stringify(regime, null, 2)); return; }
  out(`\n  Sigma regime: ${fmtRegime(regime.regime)}  (confidence: ${fmtScore(regime.confidence ?? 0)})`);
  out('');
}

async function cmdDelta() {
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const delta  = engine.deltaStream();
  if (FORMAT === 'json') { out(JSON.stringify(delta ?? { note: 'No data yet' }, null, 2)); return; }
  if (!delta) { out('  No delta stream yet — run some analyses first.'); return; }
  hr();
  out('DELTA STREAM');
  hr();
  out(`  Length:           ${delta.length}`);
  out(`  Sigma (gap):      ${fmtRegime(delta.sigma_gap.regime)}`);
  out(`  Sigma (friction): ${fmtRegime(delta.sigma_friction.regime)}`);
  out(`  Avg gap pressure: ${fmtScore(delta.avg_gap_pressure)}`);
  out(`  Avg friction:     ${fmtScore(delta.avg_friction)}`);
  out(`  Emotion transitions: ${delta.emotion_transitions}`);
  out('');
}

async function cmdCatalogue() {
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  const summary = engine.catalogue();
  if (FORMAT === 'json') { out(JSON.stringify(summary, null, 2)); return; }
  hr();
  out('GAP CATALOGUE SUMMARY');
  hr();
  out(`  Total gaps:  ${summary.total}`);
  out(`  Domains:     ${summary.domains}`);
  out(`\n  Top critical:`);
  for (const g of (summary.topCritical ?? []).slice(0, 10)) {
    out(`  ${(g.criticality * 100).toFixed(0).padStart(3)}%  ${g.domain.padEnd(25)} ${g.subtype}`);
  }
  out('');
}

async function cmdInvariants() {
  const engine = new ResonanceEngine({ project: 'resonance-cli' });
  if (FORMAT === 'json') { out(JSON.stringify(engine.invariants(), null, 2)); return; }
  hr();
  out('CROSS-DOMAIN INVARIANTS');
  hr();
  for (let i = 0; i < engine.invariants().length; i++) {
    out(`  ${(i + 1).toString().padStart(2)}.  ${engine.invariants()[i]}`);
  }
  out('\nAS ABOVE SO BELOW');
  hr();
  for (let i = 0; i < engine.asAboveSoBelow().length; i++) {
    out(`  ${(i + 1).toString().padStart(2)}.  ${engine.asAboveSoBelow()[i]}`);
    out('');
  }
}

async function cmdEmotions() {
  const sigs = EMOTION_SIGNATURES;
  if (FORMAT === 'json') { out(JSON.stringify(sigs, null, 2)); return; }
  hr();
  out('EMOTION SIGNATURES (16 attractor basins in Θ-space)');
  hr();
  for (const [name, sig] of Object.entries(sigs)) {
    const t = sig.theta;
    out(`\n  ${name.toUpperCase().padEnd(14)} H:${t.H} I:${t.I} C:${t.C} M:${t.M} Pc:${t.P_c} Pe:${t.P_e}`);
    out(`    ${sig.description}`);
    if (DEEP) out(`    note: ${sig.note}`);
  }
  out('');
}

async function cmdRepl() {
  out(`\nResonance REPL v5.0.0`);
  out('  engine available as `e`. Type .help or .exit\n');

  const engine = new ResonanceEngine({ project: 'repl' });

  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  const prompt = () => rl.question('resonance> ', async line => {
    const input = line.trim();
    if (!input) { prompt(); return; }
    try {
      if (input === '.exit' || input === '.quit') { out('bye'); rl.close(); return; }
      if (input === '.help') {
        out('  e.analyzeText("text")  — full analysis');
        out('  e.analyzeTheta({H,I,C,M,P_c,P_e})  — theta analysis');
        out('  e.analyzePair(a, b)    — pair analysis');
        out('  e.sigmaRegime()        — current sigma');
        out('  e.deltaStream()        — full delta stream');
        out('  e.invariants()         — ten cross-domain invariants');
        out('  e.phaseTransitions()   — all phase transitions');
      } else {
        const fn = new Function('e', 'engine', `"use strict"; return (async () => (${input}))()`);
        const r  = await fn(engine, engine);
        if (r !== undefined) out(JSON.stringify(r, null, 2));
      }
    } catch (err) { out(`  Error: ${err.message}`); }
    prompt();
  });
}

function uuid4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Help ──────────────────────────────────────────────────────────────────────

function showHelp() {
  out('resonance v5.0.0 — gap field · relational physics · friction · tension');
  out('');
  out('Usage: resonance <command> [options]');
  out('');
  out('Commands:');
  out('  analyze   <text|file>             Full analysis (gaps + physics + friction + tension)');
  out('  lyric     <file|text>             Lyric field analysis');
  out('  theta     <H> <I> <C> <M> <Pc> <Pe>  Analyze Theta state');
  out('  pair      --a <theta> --b <theta> Analyze two Thetas in relation');
  out('  friction  <textA|file> <textB|file>  Measure friction between two texts');
  out('  tension   <text|file>             Measure structural tension');
  out('  session                           Current session snapshot');
  out('  record    [--label <l>]           Record session to ledger');
  out('  compare   <session-id>            Compare to recorded session');
  out('  ledger    list|history|metrics    Ledger management');
  out('  sigma                             Current sigma regime');
  out('  delta                             Full delta stream');
  out('  catalogue                         Browse gap catalogue');
  out('  invariants                        Cross-domain invariants + As Above So Below');
  out('  emotions                          16 emotion signature reference');
  out('  repl                              Interactive REPL');
  out('');
  out('Global flags: --format pretty|json  --quiet  --deep  --domain <d>');
}

// ── Router ────────────────────────────────────────────────────────────────────

const cmd = args.find(a => !a.startsWith('--'));

const routes = {
  analyze:    cmdAnalyze,
  lyric:      cmdLyric,
  theta:      cmdTheta,
  pair:       cmdPair,
  friction:   cmdFriction,
  tension:    cmdTension,
  session:    cmdSession,
  record:     cmdRecord,
  compare:    cmdCompare,
  ledger:     cmdLedger,
  sigma:      cmdSigma,
  delta:      cmdDelta,
  catalogue:  cmdCatalogue,
  invariants: cmdInvariants,
  emotions:   cmdEmotions,
  repl:       cmdRepl,
};

async function main() {
  await loadEngine();

  if (!cmd || cmd === '--help' || cmd === 'help') {
    showHelp();
  } else if (routes[cmd]) {
    try { await routes[cmd](); }
    catch (e) {
      process.stderr.write(`[resonance] ${e.message}\n`);
      if (process.env.DEBUG) console.error(e);
      process.exit(1);
    }
  } else {
    process.stderr.write(`[resonance] Unknown command: ${cmd}\n`);
    showHelp();
    process.exit(1);
  }
}

main();
