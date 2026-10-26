'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { t, summary, assert } = require('./harness');

// main.js is a script, not a module — it registers itself against the
// mock 'electron' singleton on require. We drive it the same way real
// Electron would: by emitting the lifecycle events main.js listens for.
const electron = require('electron');
const { app } = electron;

// Give app.getPath('userData') a real scratch dir so main.js's log/config
// file writes land somewhere harmless instead of the repo root.
app._paths.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-userdata-'));

require('../main.js');

function lastWindow() {
  const w = electron.__test__.allWindows[electron.__test__.allWindows.length - 1];
  assert.ok(w, 'expected a BrowserWindow to have been created');
  return w;
}

async function run() {
  console.log('\n== main.js — background / tray / single-instance ==');

  app.emit('ready');

  await t('main window is created hidden, then shown on ready-to-show (normal startup)', async () => {
    const win = lastWindow();
    win.emit('ready-to-show');
    assert.strictEqual(win.isVisible(), true);
  });

  await t('closing the window hides it instead of destroying it — background mode, not quit', async () => {
    const win = lastWindow();
    win.close(); // simulates the user clicking the titlebar close button
    assert.strictEqual(win.isVisible(), false, 'window should be hidden');
    assert.strictEqual(win.isDestroyed(), false, 'window (and the process) must survive a close');
    assert.strictEqual(win._lastCloseEvent.defaultPrevented, true, 'close must have been intercepted');
  });

  await t('REGRESSION: a second launch attempt actually re-shows the hidden window (not just focus() on nothing)', async () => {
    const win = lastWindow();
    assert.strictEqual(win.isVisible(), false, 'precondition: window is hidden from the previous test');
    app.emit('second-instance');
    assert.strictEqual(win.isVisible(), true, 'second-instance must show(), not just focus(), the window');
  });

  await t('window-all-closed does not quit the app — that would kill every hidden ClearGlass agent window', async () => {
    let quitCalls = 0;
    const origQuit = app.quit;
    app.quit = (...a) => { quitCalls++; return origQuit.apply(app, a); };
    try {
      app.emit('window-all-closed');
    } finally {
      app.quit = origQuit;
    }
    assert.strictEqual(quitCalls, 0);
  });

  await t('tray exists with Show and Quit entries', async () => {
    const tray = electron.__test__.allTrays[electron.__test__.allTrays.length - 1];
    assert.ok(tray, 'expected a Tray to have been created');
    assert.ok(tray._menu, 'expected a context menu to be set');
    const labels = tray._menu.template.map((i) => i.label).filter(Boolean);
    assert.ok(labels.some((l) => /show/i.test(l)));
    assert.ok(labels.some((l) => /quit/i.test(l)));
  });

  await t('tray Quit actually flips quit mode — a subsequent close is no longer intercepted', async () => {
    const win = lastWindow();
    const tray = electron.__test__.allTrays[electron.__test__.allTrays.length - 1];
    const quitItem = tray._menu.template.find((i) => /quit/i.test(i.label || ''));
    quitItem.click(); // fires app.quit() -> 'before-quit' -> isQuitting = true
    win.close();
    assert.strictEqual(win._lastCloseEvent.defaultPrevented, false, 'once quitting, close should not be intercepted anymore');
  });

  await t('activate (mac dock icon equivalent) re-shows the window too', async () => {
    const win = lastWindow();
    win.hide();
    app.emit('activate');
    assert.strictEqual(win.isVisible(), true);
  });

  await t('REGRESSION: main.js no longer attempts the bridge userscript install itself — that moved to the renderer, gated on cgAsk actually being unavailable', async () => {
    const LOG_PATH = path.join(app._paths.userData, 'mastermind.log');
    await new Promise((r) => setTimeout(r, 20));
    const logText = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf8') : '';
    assert.ok(!/bridge userscript auto-install/.test(logText),
      'main.js should not attempt this unconditionally on every boot anymore — nexus-engine.js does it now, gated on window.NXAPI.cgAsk being unavailable, which only a renderer can check');
  });

  const fails = summary('main.js background/tray');
  process.exitCode = fails ? 1 : 0;
}

run();
