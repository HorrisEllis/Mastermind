'use strict';
// ═══════════════════════════════════════════════════════════════════
// UI SCALE — text size vs UI size, genuinely independent
//
// font_scale and ui_scale used to be one variable (font_scale) driving
// both the --fs-* typography tokens AND document.body.style.zoom, which
// multiplies every already-rendered pixel including text. Moving the
// one control resized text and every button/icon/spacing together —
// there was no way to separate them. This test extracts the real
// functions from nexus-engine.js (not a reimplementation) and proves
// the two are now actually independent: changing one leaves the other's
// effect on screen unchanged.
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

function extractSingleFunction(src, name) {
  const marker = 'function ' + name + '(';
  const start = src.indexOf('\n' + marker);
  assert.ok(start > -1, name + ' not found in nexus-engine.js');
  const bodyStart = src.indexOf('{', start);
  let depth = 0, end = bodyStart;
  for (let i = bodyStart; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}

const engineSrc = fs.readFileSync(path.join(ROOT, 'nexus-engine.js'), 'utf8');

const FN_NAMES = [
  '_nearestScalePreset', '_mmApplyScale', 'optsSetFontScale', 'optsSetUIScale',
  'optsSetPanelScale', 'mmNudgeUIScale', 'mmResetUIScale', '_applyScaleOnBoot',
];
const region = FN_NAMES.map(name => extractSingleFunction(engineSrc, name)).join('\n\n');

// Sandbox: a fake root element and a fake #opts-overlay element, both
// recording every style write, plus OPTS/saveOpts/loadOpts/MM_BUS mocks.
// document.documentElement.style and document.body.style are plain
// recording objects (not a real CSSStyleDeclaration) — good enough to
// assert on the values this code actually sets.
function makeSandbox(initialOpts) {
  const rootStyle = { props: {}, setProperty(k, v) { this.props[k] = v; }, fontSize: '' };
  const bodyStyle = { fontSize: '', zoom: '' };
  const overlayStyle = { props: {}, setProperty(k, v) { this.props[k] = v; }, zoom: '' };
  const els = {
    'opts-overlay': { style: overlayStyle },
    'opt-font-scale-val': { textContent: '' },
    'opt-ui-scale-val': { textContent: '' },
    'opt-panel-scale-val': { textContent: '' },
    'opt-font-scale': { value: '' },
    'opt-ui-scale': { value: '' },
  };
  const emitted = [];
  const sandbox = {
    console,
    OPTS: Object.assign({ font_scale: 100, ui_scale: 100, panel_scale: 100 }, initialOpts || {}),
    saveOpts: () => {},
    loadOpts: () => {},
    MMLog: { error() {}, warn() {}, info() {} },
    mm_toast: () => {},
    MM_BUS: { emit: (evt, data) => emitted.push({ evt, data }) },
    document: {
      documentElement: { style: rootStyle },
      body: { style: bodyStyle },
      getElementById: (id) => els[id] || null,
    },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  new vm.Script(region, { filename: 'nexus-engine-scale-slice.js' }).runInContext(sandbox);
  return { sandbox, rootStyle, bodyStyle, overlayStyle, els, emitted };
}

console.log('\nUI SCALE — text size vs UI size\n');

t('changing font_scale alone does not touch document.body.style.zoom', () => {
  const { sandbox, bodyStyle } = makeSandbox({ font_scale: 100, ui_scale: 100 });
  sandbox.optsSetUIScale(100); // establish a baseline zoom value
  const zoomBefore = bodyStyle.zoom;
  sandbox.optsSetFontScale(150);
  assert.strictEqual(bodyStyle.zoom, zoomBefore, 'body.zoom moved when only font_scale changed — text-only control is leaking into UI size');
});

t('changing ui_scale alone does not change the EFFECTIVE on-screen text size', () => {
  const { sandbox, rootStyle, bodyStyle } = makeSandbox({ font_scale: 150, ui_scale: 100 });
  sandbox.optsSetFontScale(150);
  const tokenRatioAt100 = rootStyle.props['--ui-scale'];
  const zoomAt100 = bodyStyle.zoom;
  const effectiveTextAt100 = tokenRatioAt100 * zoomAt100;

  sandbox.optsSetUIScale(150);
  const tokenRatioAt150 = rootStyle.props['--ui-scale'];
  const zoomAt150 = bodyStyle.zoom;
  const effectiveTextAt150 = tokenRatioAt150 * zoomAt150;

  assert.ok(Math.abs(effectiveTextAt100 - effectiveTextAt150) < 1e-9,
    'effective text size (--ui-scale token ratio \u00d7 body.zoom) changed when only ui_scale moved: ' +
    effectiveTextAt100 + ' vs ' + effectiveTextAt150);
  // And it should equal font_scale/100 (1.5) in both cases, not some
  // other constant — proves it tracks font_scale, not ui_scale.
  assert.ok(Math.abs(effectiveTextAt150 - 1.5) < 1e-9, 'effective text size should track font_scale (150%), got ' + effectiveTextAt150);
});

t('ui_scale drives body.zoom directly, 1:1, regardless of font_scale', () => {
  const { sandbox, bodyStyle } = makeSandbox({ font_scale: 80, ui_scale: 100 });
  sandbox.optsSetUIScale(175);
  assert.strictEqual(bodyStyle.zoom, 1.75);
  sandbox.optsSetFontScale(200); // change font_scale after — zoom must not move
  assert.strictEqual(bodyStyle.zoom, 1.75, 'body.zoom moved when font_scale changed after ui_scale was already set');
});

t('the Options panel gets its own undivided font_scale, not the ui_scale-divided root ratio', () => {
  const { sandbox, overlayStyle } = makeSandbox({ font_scale: 150, ui_scale: 200 });
  sandbox.optsSetUIScale(200);
  sandbox.optsSetFontScale(150);
  // If the panel inherited the root's divided ratio (150/200 = 0.75) its
  // text would shrink as ui_scale grows. It must get 1.5 (undivided).
  assert.strictEqual(overlayStyle.props['--ui-scale'], 1.5,
    'panel --ui-scale should be fontScale alone (1.5), not the root token ratio — got ' + overlayStyle.props['--ui-scale']);
});

t('the panel\'s own zoom cancels ui_scale so its LAYOUT size stays constant across ui_scale changes', () => {
  const { sandbox, overlayStyle } = makeSandbox({ font_scale: 100, panel_scale: 100 });
  sandbox.optsSetUIScale(100);
  const zoomAt100 = overlayStyle.zoom;
  sandbox.optsSetUIScale(200);
  const zoomAt200 = overlayStyle.zoom;
  // zoom values differ (1/1 vs 1/2) but their PRODUCT with body's own
  // zoom (which the panel inherits) must be constant.
  assert.ok(Math.abs((1 * zoomAt100) - (2 * zoomAt200)) < 1e-9,
    'panel effective zoom (body.zoom \u00d7 panel.zoom) is not constant across ui_scale changes');
});

t('mmNudgeUIScale (Ctrl+scroll) moves ui_scale, not font_scale', () => {
  const { sandbox } = makeSandbox({ font_scale: 100, ui_scale: 100 });
  sandbox.mmNudgeUIScale(20); // 100+20=120, snaps to the nearest preset (125)
  assert.strictEqual(sandbox.OPTS.ui_scale, 125);
  assert.strictEqual(sandbox.OPTS.font_scale, 100, 'font_scale must not move from a Ctrl+scroll zoom gesture');
});

t('mmResetUIScale resets only ui_scale to 100, leaving font_scale as the person set it', () => {
  const { sandbox } = makeSandbox({ font_scale: 175, ui_scale: 60 });
  sandbox.mmResetUIScale();
  assert.strictEqual(sandbox.OPTS.ui_scale, 100);
  assert.strictEqual(sandbox.OPTS.font_scale, 175, 'resetting UI zoom must not also reset the person\'s chosen text size');
});

t('font_scale clamps to 80\u2013200, ui_scale clamps to 60\u2013200 (independent ranges)', () => {
  const { sandbox } = makeSandbox();
  sandbox.optsSetFontScale(500);
  assert.strictEqual(sandbox.OPTS.font_scale, 200);
  sandbox.optsSetFontScale(10);
  assert.strictEqual(sandbox.OPTS.font_scale, 80);
  sandbox.optsSetUIScale(500);
  assert.strictEqual(sandbox.OPTS.ui_scale, 200);
  sandbox.optsSetUIScale(10);
  assert.strictEqual(sandbox.OPTS.ui_scale, 60, 'ui_scale should clamp to 60, the same floor the keyboard nudge already used');
});

t('_applyScaleOnBoot applies BOTH saved values independently, not just one', () => {
  const { sandbox, rootStyle, bodyStyle } = makeSandbox({ font_scale: 125, ui_scale: 150 });
  sandbox._applyScaleOnBoot();
  assert.strictEqual(bodyStyle.zoom, 1.5, 'boot should apply the saved ui_scale to body.zoom');
  const expectedRatio = 125 / 150;
  assert.ok(Math.abs(rootStyle.props['--ui-scale'] - expectedRatio) < 1e-9,
    'boot should apply font_scale/ui_scale to the root token ratio, got ' + rootStyle.props['--ui-scale']);
});

t('_applyScaleOnBoot defaults a missing/corrupted ui_scale to 100 without touching a valid font_scale', () => {
  const { sandbox, bodyStyle } = makeSandbox({ font_scale: 150, ui_scale: undefined });
  sandbox._applyScaleOnBoot();
  assert.strictEqual(bodyStyle.zoom, 1, 'missing ui_scale should default to 100% (zoom 1), not inherit font_scale');
  assert.strictEqual(sandbox.OPTS.font_scale, 150);
});

t('optsSetPanelScale re-applies through the shared function, keeping font/ui independence intact', () => {
  const { sandbox, overlayStyle } = makeSandbox({ font_scale: 100, ui_scale: 100 });
  sandbox.optsSetPanelScale(130);
  assert.strictEqual(sandbox.OPTS.panel_scale, 130);
  assert.strictEqual(Number(overlayStyle.zoom), 1.3); // 130% panel / 100% ui_scale
});

t('changing font_scale emits mm.opts.font_scale; changing ui_scale emits mm.opts.ui_scale \u2014 distinguishable on the bus', () => {
  const { sandbox, emitted } = makeSandbox({ font_scale: 100, ui_scale: 100 });
  sandbox.optsSetFontScale(150);
  sandbox.optsSetUIScale(150);
  assert.ok(emitted.some(e => e.evt === 'mm.opts.font_scale' && e.data.percent === 150));
  assert.ok(emitted.some(e => e.evt === 'mm.opts.ui_scale' && e.data.percent === 150));
});

const fails = results.filter(r => !r.ok);
console.log('\nui-scale-split: ' + (results.length - fails.length) + '/' + results.length + ' passed');
process.exitCode = fails.length ? 1 : 0;
