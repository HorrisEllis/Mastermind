'use strict';
// Background execution — structural checks on main.js.
//
// main.js needs Electron to execute (run-main-background.test.js covers
// its runtime behaviour when electron is installed). What matters here is
// static and checkable without it: the Chromium switches that keep hidden
// and parked windows running are present, and are applied before 'ready'
// (switches set after the app is ready are silently ignored).
const fs = require('fs');
const path = require('path');
const { t, summary, assert } = require('./harness');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

async function run() {
  console.log('\n== background execution — main.js switches ==');

  const READY = SRC.indexOf("app.on('ready'");

  for (const sw of ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows']) {
    await t('switch ' + sw + ' is appended before app ready', () => {
      const at = SRC.indexOf("appendSwitch('" + sw + "')");
      assert.ok(at > -1, sw + ' not appended');
      assert.ok(READY > -1 && at < READY, sw + ' must be set before the ready handler');
    });
  }

  await t('Windows native occlusion tracking is disabled (it marks parked agent windows hidden)', () => {
    const at = SRC.indexOf("appendSwitch('disable-features', 'CalculateNativeWinOcclusion')");
    assert.ok(at > -1 && at < READY);
  });

  await t('every main-window webPreferences turns backgroundThrottling off (primary and fallback)', () => {
    const prefs = SRC.match(/webPreferences:\s*\{[^}]*\}/g) || [];
    assert.ok(prefs.length >= 2, 'expected the primary and fallback window options, found ' + prefs.length);
    for (const p of prefs) assert.ok(/backgroundThrottling:\s*false/.test(p), 'missing backgroundThrottling:false in: ' + p.replace(/\s+/g, ' '));
  });

  process.exitCode = summary('background-switches') ? 1 : 0;
}

run();
