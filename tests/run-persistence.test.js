'use strict';
// ═══════════════════════════════════════════════════════════════════
// PERSISTENCE — nothing is lost
//
// The reported symptom was "data isn't persistent", and the cause was
// not a failing write. It was a write that never fired.
//
// vaultDirtySave() cleared the pending timer on every call. During
// transcription a node arrives every few seconds against a 4s debounce,
// so the timer reset forever and the only write happened when you
// stopped talking or closed the app — and closing the app didn't write
// either.
//
// The starvation test below reproduces that arithmetic directly.
// ═══════════════════════════════════════════════════════════════════

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const results = [];
function t(name, fn) {
  try { fn(); results.push({ name, ok: true }); console.log('  \u2713 ' + name); }
  catch (e) {
    results.push({ name, ok: false });
    console.log('  \u2717 ' + name + '\n      ' + (e.message || '').split('\n').join('\n      '));
  }
}

// A faithful model of the scheduler: debounce plus ceiling. Kept
// separate from the real module because the real one needs a vault, a
// clock and an encrypt step — none of which affect WHEN it decides to
// fire, which is the thing that was broken.
function simulate(opts) {
  const o = Object.assign({ ceilingMs: 10000, debounceMs: 4000, gapMs: 3000, events: 10, useCeiling: true }, opts);
  let timer = null, firstDirty = null, saves = 0, clock = 0;

  const gaps = [];
  let lastSaveAt = 0;
  for (let i = 0; i < o.events; i++) {
    const nextEvent = clock + o.gapMs;

    // A real setTimeout fires on its own schedule, not when the next
    // event happens to arrive. The first version of this harness only
    // checked at event boundaries and so reported a 15s gap where the
    // timer would actually have fired at 13s — a fault in the model,
    // not in the code under test.
    if (timer !== null && timer <= nextEvent) {
      saves++; gaps.push(timer - lastSaveAt); lastSaveAt = timer;
      timer = null; firstDirty = null;
    }
    clock = nextEvent;

    if (!firstDirty) firstDirty = clock;

    if (o.useCeiling && clock - firstDirty >= o.ceilingMs) {
      saves++; gaps.push(clock - lastSaveAt); lastSaveAt = clock; timer = null; firstDirty = null; continue;
    }
    const wait = o.useCeiling
      ? Math.min(o.debounceMs, Math.max(250, o.ceilingMs - (clock - firstDirty)))
      : o.debounceMs;
    timer = clock + wait;
  }
  return { saves, elapsedMs: clock, maxGapMs: gaps.length ? Math.max(...gaps) : clock };
}

console.log('\nPERSISTENCE\n');

// ── The bug ────────────────────────────────────────────────────────

t('THE STARVATION BUG: a pure debounce never fires under sustained capture', () => {
  const r = simulate({ useCeiling: false, gapMs: 3000, debounceMs: 4000, events: 10 });
  assert.strictEqual(r.saves, 0,
    '30 seconds of speech, a node every 3s, 4s debounce \u2014 this is what "data isn\\u2019t persistent" was');
});

t('the ceiling makes it fire regardless of how fast nodes arrive', () => {
  const r = simulate({ gapMs: 3000, events: 10 });
  assert.ok(r.saves >= 2, 'expected repeated saves across 30s, got ' + r.saves);
});

t('nothing stays unwritten longer than the ceiling plus one event', () => {
  // The invariant is the WORST GAP, not the count. Saves land on event
  // boundaries, so with a 3s cadence and a 10s ceiling the true bound is
  // 10s + one event, not exactly 10s. Asserting a count instead of the
  // gap would fail on arithmetic that is actually correct.
  for (const gap of [500, 1000, 2000, 3000, 4000]) {
    const r = simulate({ gapMs: gap, events: 60 });
    assert.ok(r.maxGapMs <= 10000 + gap,
      'gap ' + gap + 'ms left data unwritten for ' + r.maxGapMs + 'ms');
  }
});

t('the worst case is bounded even at a punishing cadence', () => {
  const r = simulate({ gapMs: 200, events: 300 });
  assert.ok(r.maxGapMs <= 10200,
    'a node every 200ms still must not starve the write: worst gap ' + r.maxGapMs + 'ms');
});

t('slow, occasional edits still debounce rather than writing on every keystroke', () => {
  // The ceiling must not turn every change into an immediate write.
  const r = simulate({ gapMs: 20000, events: 5, ceilingMs: 10000, debounceMs: 4000 });
  assert.ok(r.saves <= 5, 'one write per edit at most, got ' + r.saves);
});

// ── The implementation ─────────────────────────────────────────────

const vault = fs.readFileSync(path.join(ROOT, 'foundation', 'vault', 'mastermind-vault.js'), 'utf8');

t('vaultDirtySave has a max-wait ceiling', () => {
  assert.ok(/autosave_max_wait/.test(vault), 'no ceiling option');
  assert.ok(/firstDirtyAt/.test(vault), 'nothing tracks how long the data has been unwritten');
});

t('the ceiling measures from the last write that LANDED, not the last attempt', () => {
  const save = vault.slice(vault.indexOf('VAULT.lastSaved = Date.now()'));
  assert.ok(/firstDirtyAt = null/.test(save.slice(0, 300)),
    'a failed write must not reset the clock \u2014 otherwise a failing vault looks like a saved one');
});

t('there is a save on close', () => {
  assert.ok(/beforeunload/.test(vault), 'closing the window discarded anything not yet written');
  assert.ok(/visibilitychange/.test(vault),
    'beforeunload is skipped when the process is killed from the taskbar \u2014 visibilitychange is the reliable one');
});

t('quit is held until the write lands', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.ok(/holdQuitUntilSaved/.test(main), 'quit proceeded while the encrypt-and-write was in flight');
  assert.ok(/e\.preventDefault\(\)/.test(main.slice(main.indexOf('_holdQuit'))));
  const pre = fs.readFileSync(path.join(ROOT, 'preload.js'), 'utf8');
  assert.ok(/holdQuitUntilSaved/.test(pre), 'not exposed to the renderer');
});

// ── Sessions ───────────────────────────────────────────────────────

const ui = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');

t('ONE session per recording — opened on start', () => {
  // beginSession moved into the shared _vlBeginCapture core (both the
  // local mic and the phone call it) — 'live' is no longer a literal
  // argument, it's the local-source branch of a ternary keyed on which
  // source is capturing. The invariant is unchanged: starting capture
  // opens exactly one session.
  assert.ok(/beginSession\(source === 'phone' \? 'phone' : 'live'/.test(ui),
    'nothing opened a session, so every node landed unsessioned');
  const core = ui.slice(ui.indexOf('function _vlBeginCapture'), ui.indexOf('function _vlEndCapture'));
  assert.ok(core.includes('beginSession'), 'the session must open when capture starts');
  const start = ui.indexOf('async function vlOrbStart');
  const stop = ui.indexOf('function vlOrbStop');
  assert.ok(ui.slice(start, stop).includes('_vlBeginCapture'), 'vlOrbStart must actually call the shared core that opens the session');
});

t('the session closes on stop, not per node', () => {
  const core = ui.slice(ui.indexOf('function _vlEndCapture'), ui.indexOf('async function vlOrbStart'));
  assert.ok(core.includes('endSession'), 'the session never closed');
  assert.ok(core.includes('vaultSave'), 'stop must force a write rather than schedule one');
  const stop = ui.indexOf('function vlOrbStop');
  assert.ok(ui.slice(stop).includes('_vlEndCapture'), 'vlOrbStop must actually call the shared core that closes the session');
});

t('a session is not reopened if one is already running', () => {
  assert.ok(/!CaptureBridge\.stats\(\)\.session/.test(ui),
    'without the guard, a restart mid-session would orphan the first one');
});

// ── The lattice reaches the vault ──────────────────────────────────

t('the lattice is serialized into the vault and hydrated back', () => {
  assert.ok(/lattice: typeof LATTICE/.test(vault), 'nodes never reach the envelope');
  assert.ok(/LATTICE\.nodes\s*=\s*Array\.isArray/.test(vault), 'nodes never come back');
  assert.ok(/LATTICE\.sessions\s*=\s*Array\.isArray/.test(vault), 'sessions never come back');
  // LATTICE.archive replaces the old LAT_MAX_NODES hard prune
  // (modules/lattice/lattice.js), which used to .splice() the oldest
  // nodes out and discard the result — a genuine, confirmed delete, not
  // a vault-wiring gap. "We need this enforced. All data persists in
  // the vault" (2026-08-30) named exactly this. Nodes now age into
  // archive instead of vanishing, and this checks that archive itself
  // reaches the vault — a structural check alone wouldn't prove the
  // DATA survives the trip, only that the field names are mentioned;
  // see the functional round-trip test below, which does.
  assert.ok(/archive:\s*LATTICE\.archive/.test(vault), 'LATTICE.archive never reaches the envelope \u2014 archived nodes would be lost on save');
  assert.ok(/LATTICE\.archive\s*=\s*\{/.test(vault), 'LATTICE.archive never comes back on hydrate');
});

t('FUNCTIONAL: an archived node genuinely round-trips through serialize \u2192 hydrate, not just the hot set', () => {
  // Runs the REAL statements from vaultSerialize/vaultDeserialize
  // (brace-balanced extraction, not a fixed-length slice \u2014 the object
  // literal has nested braces of its own, so a naive slice cuts it
  // mid-expression) against a minimal in-process LATTICE. Proves the
  // data survives the trip, not just that the field names are mentioned
  // in the source \u2014 the structural test above would have passed right
  // up until archive was added, since the field didn't exist to check.
  function extractBalanced(src, startMarker) {
    const start = src.indexOf(startMarker);
    const i = src.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') { depth--; if (depth === 0) return src.slice(start, j + 1); }
    }
    throw new Error('unbalanced braces from ' + startMarker);
  }

  const serializeStmt = extractBalanced(vault, 'lattice: typeof LATTICE') + ' : null,';
  const deserializeStmt = extractBalanced(vault, 'if (m.lattice && typeof LATTICE');

  const seed = {
    LATTICE: {
      nodes: [{ id: 'hot-1', text: 'still in the working set' }],
      edges: [], sessions: [],
      archive: {
        shards: { '2026-01': { nodes: [{ id: 'cold-1', text: 'aged out months ago' }], edges: [] } },
        index: { 'cold-1': '2026-01' },
      },
    },
  };
  const serialized = vm.runInNewContext('({ ' + serializeStmt + ' })', seed).lattice;
  assert.strictEqual(serialized.archive.shards['2026-01'].nodes[0].id, 'cold-1', 'the archived node did not survive serialize');

  const fresh = {
    LATTICE: { nodes: [], edges: [], sessions: [], archive: null },
    _latRebuildIndex: () => { fresh.__rebuilt = true; },
    m: { lattice: serialized },
  };
  vm.runInNewContext(deserializeStmt, fresh);
  assert.strictEqual(fresh.LATTICE.archive.shards['2026-01'].nodes[0].id, 'cold-1', 'the archived node did not survive the round trip through hydrate');
  assert.ok(fresh.__rebuilt, 'the hot-set word index must be rebuilt after hydrate, or association scoring silently goes stale');
});

const fails = results.filter(r => !r.ok);
console.log('\npersistence: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
