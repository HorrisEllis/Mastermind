'use strict';
// ═══════════════════════════════════════════════════════════════════
// VOICE LATTICE — capture surface
//
// This test exists because I twice reported a UI change that had not
// happened. Reading the source and believing it is not verification
// (§0.1, §1.1). This RENDERS the real _vlTabCapture into a DOM-ish
// container and asserts what came out.
//
// It would have failed on v0.1.24 and v0.1.25.
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

// Render _vlTabCapture by extracting it and running it against a
// container that records innerHTML. The template literal is evaluated
// for real, so a syntax error or a missing reference fails here.
function renderCapture() {
  const src = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
  const start = src.indexOf('function _vlTabCapture(container) {');
  assert.ok(start > -1, '_vlTabCapture not found in nexus-engine.js');

  // Balance braces to find the end of the function.
  let depth = 0, end = start;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const fnSrc = src.slice(start, end);

  // _vlTabCapture wires listeners after building the markup, so the
  // sandbox needs a document. Permissive stubs: the target is the HTML
  // it produces, not DOM behaviour.
  const el = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, removeEventListener() {},
    querySelectorAll: () => [], querySelector: () => el(),
    appendChild() {}, focus() {}, value: '', textContent: '', innerHTML: '',
    getContext: () => ({ clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {}, fill() {} }),
  });
  const sandbox = {
    VL_STATE: { nodes: [] },
    console,
    escH: (x) => String(x == null ? '' : x),
    document: { getElementById: () => el(), querySelectorAll: () => [], querySelector: () => el(), createElement: () => el() },
    requestAnimationFrame: () => 0,
    setTimeout, clearTimeout,
    vlLatticeInit: () => {},
    vlLatticeStop: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fnSrc + '\nglobalThis.__render = _vlTabCapture;', sandbox);

  const container = { innerHTML: '' };
  sandbox.__render(container);
  return container.innerHTML;
}

console.log('\nVOICE LATTICE — CAPTURE SURFACE\n');

const html = renderCapture();

t('the capture panel renders without throwing', () => {
  assert.ok(html.length > 500, 'rendered only ' + html.length + ' chars');
});

t('THE ORB EXISTS \u2014 the capture surface is not a form', () => {
  assert.ok(html.includes('id="vl-orb-outer"'), 'no orb in the rendered panel');
  assert.ok(html.includes('id="vl-orb-core"'), 'no orb core');
  assert.ok(html.includes('vlOrbToggle()'), 'the orb does nothing when clicked');
  assert.ok((html.match(/vl-orb-ring/g) || []).length >= 3, 'expected three concentric rings');
});

t('THE NOTEPAD IS GONE \u2014 no 800px blank box', () => {
  // The old panel had min-height:180px and flex:1 on the textarea, which
  // is what made it fill the screen.
  assert.ok(!html.includes('min-height:180px'),
    'the textarea still stretches \u2014 this is the overwhelm the module exists to remove');
  assert.ok(!html.includes("What's moving through you right now"),
    'the blank-page prompt is still there');
});

t('typing survives, but small and secondary', () => {
  assert.ok(html.includes('id="vl-capture-input"'), 'manual entry must still be possible');
  assert.ok(/rows="2"/.test(html), 'the text field should be two rows, not a page');
  const idx = html.indexOf('id="vl-capture-input"');
  const orbIdx = html.indexOf('id="vl-orb-outer"');
  assert.ok(orbIdx < idx, 'the orb must come before the text field \u2014 it is the primary path');
});

t('THE LATTICE IS ALWAYS VISIBLE \u2014 not behind a tab', () => {
  assert.ok(html.includes('id="vl-lattice-cvs"'), 'no lattice canvas in the capture panel');
  assert.ok(html.includes('id="vl-lattice-wrap"'), 'no lattice column');
});

t('the layout is three columns \u2014 capture, lattice, recent', () => {
  assert.ok(/grid-template-columns:\s*300px 1fr 300px/.test(html),
    'expected capture | lattice | recent, got something else');
});

t('the waveform canvas is present', () => {
  assert.ok(html.includes('id="vl-wave-cvs"'), 'no waveform \u2014 no feedback that it is listening');
});

t('the timer is present', () => {
  assert.ok(html.includes('id="vl-timer"'));
});

t('capture modes are selectable', () => {
  for (const m of ['externalizing', 'introspecting', 'processing']) {
    assert.ok(html.includes(m), 'missing mode: ' + m);
  }
  assert.ok(html.includes('vlSetCaptureMode('), 'modes do nothing when clicked');
});

t('an empty lattice says so rather than showing nothing', () => {
  assert.ok(/THE LATTICE IS EMPTY/.test(html), 'an empty canvas with no explanation reads as broken');
});

// ── The behaviour behind the markup ────────────────────────────────

t('every handler the panel calls is defined in ui-capture.js', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
  for (const fn of ['vlOrbToggle', 'vlSetCaptureMode', 'vlLatticeInit', 'vlLatticeSync', 'vlLatticeStop']) {
    assert.ok(ui.includes('function ' + fn + '('), 'missing: ' + fn);
    assert.ok(ui.includes('window.' + fn + ' ='), fn + ' is not exposed to the markup');
  }
});

t('the orb refuses to show a recording state without a microphone', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
  // vlOrbStart itself no longer sets VL_UI.recording directly — that
  // moved into the shared _vlBeginCapture core (modules/voice-lattice/
  // ui-capture.js), which both the local mic and the phone call. The
  // invariant is unchanged (mic acquired before any recording state is
  // shown, §1.2) — it just now spans two functions instead of one, so
  // this follows the real call chain rather than one function's text.
  const start = ui.slice(ui.indexOf('async function vlOrbStart'), ui.indexOf('function vlOrbStop'));
  const micIdx = start.indexOf('getUserMedia');
  const beginCallIdx = start.indexOf("_vlBeginCapture('local')");
  assert.ok(micIdx > -1 && beginCallIdx > micIdx,
    'the microphone must be acquired BEFORE the shared capture core is invoked \u2014 otherwise it pretends (\u00a71.2)');
  assert.ok(/NO MICROPHONE/.test(start), 'a refused microphone must be said out loud');

  const core = ui.slice(ui.indexOf('function _vlBeginCapture'), ui.indexOf('function _vlEndCapture'));
  assert.ok(core.includes('VL_UI.recording = true'), 'the shared core must be what actually flips recording on');
});

t('the waveform draws real amplitude, not an animation', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
  assert.ok(ui.includes('getFloatTimeDomainData'),
    'a fake waveform would hide a dead microphone for the whole session');
  assert.ok(!ui.includes('Math.sin(Date.now'), 'that is an animation, not a signal');
});

t('the physics uses the salvaged constants', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
  assert.ok(ui.includes('0.004'), 'centre gravity');
  assert.ok(ui.includes('0.85'), 'damping');
  assert.ok(ui.includes('VL_TAG_COL'), 'tag colour palette');
});

t('the render loop stops when the tab is not visible', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
  assert.ok(/vlLatticeStop\(\)/.test(engine), 'a rAF loop behind a hidden tab is a battery cost with no observer');
  assert.ok(/VL_STATE\.activeTab === 'capture' && typeof vlLatticeInit/.test(engine), 'the loop must start on the capture tab');
});

t('a new node is visually distinguishable from a settled one', () => {
  const ui = fs.readFileSync(path.join(ROOT, 'modules', 'voice-lattice', 'ui-capture.js'), 'utf8');
  assert.ok(/b\.born/.test(ui), 'without a birth time you cannot tell WHICH node just arrived');
});

// ── The settings scale regression ──────────────────────────────────

t('100% scale means 100% \u2014 no hidden multiplier', () => {
  const engine = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');
  assert.ok(!/16 \* (scale|tokenRatio) \* 1\.15/.test(engine),
    'the root font was 18.4px while the control said 100% \u2014 a control that lies about its own value');
  assert.ok(!/13 \* (scale|tokenRatio) \* 1\.15/.test(engine));
  // font_scale and ui_scale split into two controls, so the value driving
  // the root font-size is now font_scale/ui_scale (tokenRatio) rather than
  // a single 'scale' var — same invariant (no hardcoded multiplier), new
  // name because it is genuinely a ratio now, not a plain scale.
  assert.ok(/16 \* tokenRatio\) \+ 'px'/.test(engine), 'expected a flat 16 * tokenRatio, no hidden multiplier');
});

const fails = results.filter(r => !r.ok);
console.log('\nlattice-ui: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
