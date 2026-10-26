'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { t, summary, assert, makeDom, FakeTextArea, FakeButton, FakeBlock } = require('./harness');

const { app, ipcMain } = require('electron');
app._paths.home = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-fakehome-'));
const cg = require('../foundation/ai/clearglass-main.js');
cg.cgRegisterIpc(() => {}, () => null);

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function run() {
  console.log('\n== clearglass-main.js — ClearGlass Electron link ==');

  await t('happy path: full ask/reply round trip resolves ok:true with real text', async () => {
    const win = cg.cgCreateWindow('claude', 'happy', false);
    const send = new FakeButton(false);
    send._onclick = () => { composer.value = ''; };
    const composer = new FakeTextArea('');
    win.webContents.fakeDom = makeDom({
      'div[contenteditable="true"][class*="ProseMirror"]': null,
      'div[contenteditable="true"]': null,
      'textarea': composer,
      'button[aria-label*="Send" i]': send,
      'button[type="submit"]': null,
      'button[aria-label*="Stop" i]': null,
      '[data-testid="conversation-turn"]': [],
      '.font-claude-message': [],
    });
    const dom = win.webContents.fakeDom;
    setTimeout(() => dom._set('button[aria-label*="Stop" i]', new FakeButton(false)), 3000);
    setTimeout(() => {
      dom._set('button[aria-label*="Stop" i]', null);
      dom._set('.font-claude-message', [new FakeBlock('The answer is 42.')]);
    }, 4000);

    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'happy', prompt: 'what is the answer?', timeoutMs: 15000 });
    assert.strictEqual(res.ok, true, 'expected ok:true, got: ' + JSON.stringify(res));
    assert.strictEqual(res.text, 'The answer is 42.');
  });

  await t('not signed in: no composer on the page -> NO_COMPOSER, not a silent hang', async () => {
    const win = cg.cgCreateWindow('claude', 'nocomposer', false);
    win.webContents.fakeDom = makeDom({});
    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'nocomposer', prompt: 'hi', timeoutMs: 5000 });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /^NO_COMPOSER/);
  });

  await t('send button stuck / never actually submits -> SEND_FAILED, named not swallowed', async () => {
    const win = cg.cgCreateWindow('claude', 'sendfail', false);
    const composer = new FakeTextArea('');
    const send = new FakeButton(false); // click does nothing — composer never clears
    win.webContents.fakeDom = makeDom({
      'textarea': composer,
      'button[aria-label*="Send" i]': send,
      'button[aria-label*="Stop" i]': null,
      '[data-testid="conversation-turn"]': [],
      '.font-claude-message': [],
    });
    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'sendfail', prompt: 'hi', timeoutMs: 3000 });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /^SEND_FAILED/);
  });

  await t('prompt submits (composer clears) but generation never starts -> SEND_NEVER_STARTED', async () => {
    const win = cg.cgCreateWindow('claude', 'neverstart', false);
    const composer = new FakeTextArea('');
    composer.addEventListener('keydown', () => { composer.value = ''; }); // app "handles" Enter but never generates
    win.webContents.fakeDom = makeDom({
      'textarea': composer,
      'button[aria-label*="Send" i]': null, // forces the Enter-keydown fallback path
      'button[aria-label*="Stop" i]': null,
      '[data-testid="conversation-turn"]': [],
      '.font-claude-message': [],
    });
    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'neverstart', prompt: 'hi', timeoutMs: 1200 });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /^SEND_NEVER_STARTED/);
  });

  await t('generation starts (stop button seen) but reply never lands -> TIMEOUT_WAITING_REPLY', async () => {
    const win = cg.cgCreateWindow('claude', 'timeout', false);
    const composer = new FakeTextArea('');
    const send = new FakeButton(false);
    send._onclick = () => { composer.value = ''; };
    win.webContents.fakeDom = makeDom({
      'textarea': composer,
      'button[aria-label*="Send" i]': send,
      'button[aria-label*="Stop" i]': null,
      '[data-testid="conversation-turn"]': [],
      '.font-claude-message': [],
    });
    setTimeout(() => win.webContents.fakeDom._set('button[aria-label*="Stop" i]', new FakeButton(false)), 2300);
    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'timeout', prompt: 'hi', timeoutMs: 1200 });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /^TIMEOUT_WAITING_REPLY/);
  });

  await t('renderer/window dies mid-request -> EXEC_FAILED, and the busy lock is still released afterward', async () => {
    const win = cg.cgCreateWindow('claude', 'crash', false);
    win.webContents.fakeDom = makeDom({ 'textarea': new FakeTextArea('') });
    win.webContents._destroyed = true;
    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'crash', prompt: 'hi', timeoutMs: 2000, fresh: false });
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /^EXEC_FAILED/);
    win.webContents._destroyed = false; // "reconnects"
    const win2 = cg.cgCreateWindow('claude', 'crash', false);
    win2.webContents.fakeDom = makeDom({});
    const res2 = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'crash', prompt: 'hi again', timeoutMs: 2000, fresh: false });
    assert.doesNotMatch(res2.error || '', /^BUSY/, 'busy flag from the crashed call must not still be held');
  });

  await t('two overlapping asks to the same agent+account -> second is rejected BUSY, not queued silently', async () => {
    const win = cg.cgCreateWindow('claude', 'busytest', false);
    const composer = new FakeTextArea('');
    const send = new FakeButton(false);
    send._onclick = () => { composer.value = ''; };
    win.webContents.fakeDom = makeDom({
      'textarea': composer, 'button[aria-label*="Send" i]': send, 'button[aria-label*="Stop" i]': null,
      '[data-testid="conversation-turn"]': [], '.font-claude-message': [],
    });
    const p1 = ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'busytest', prompt: 'first', timeoutMs: 1500 });
    const res2 = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'busytest', prompt: 'second', timeoutMs: 1500 });
    assert.strictEqual(res2.ok, false);
    assert.match(res2.error, /^BUSY/);
    await p1; // drain — first call still completes (with SEND_NEVER_STARTED, that's fine, not under test here)
  });

  await t('different accounts of the same agent run independently (no cross-account lock or window sharing)', async () => {
    const a = cg.cgCreateWindow('chatgpt', 'acctA', false);
    const b = cg.cgCreateWindow('chatgpt', 'acctB', false);
    assert.notStrictEqual(a, b, 'each account must get its own isolated window');
  });

  await t('unknown agent / empty prompt are rejected by name, not a generic failure', async () => {
    const r1 = await ipcMain.invoke('cg:ask', { agent: 'not-a-real-agent', accountId: 'x', prompt: 'hi' });
    assert.match(r1.error, /^UNKNOWN_AGENT/);
    const r2 = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'x', prompt: '' });
    assert.match(r2.error, /^EMPTY_PROMPT/);
  });

  await t('REGRESSION: harness injection no longer throws the agentKey ReferenceError on window creation', async () => {
    const seen = [];
    const origErr = console.error;
    console.error = (...a) => { seen.push(a.join(' ')); };
    try {
      const win = cg.cgCreateWindow('gemini', 'harnesscheck', false);
      win.webContents.fakeDom = makeDom({});
      await win.webContents.loadURL('https://gemini.google.com/app'); // fires did-finish-load -> harness inject
    } finally {
      console.error = origErr;
    }
    const brokenHarness = seen.find((s) => s.includes('harness injection failed'));
    assert.ok(!brokenHarness, 'harness injection should not fail: ' + brokenHarness);
  });

  await t('REGRESSION: bridge source file the packaged build ships actually exists on disk at the resolved path', async () => {
    const p1 = path.join(__dirname, '..', 'integrations', 'clearglass', 'mastermind-ai-bridge.user.js');
    assert.ok(fs.existsSync(p1), 'expected bridge userscript at ' + p1);
  });

  await t('cgInstallUserscript writes the real bridge file content and removes a stale eravos bridge', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgl-userscripts-'));
    fs.writeFileSync(path.join(dir, 'eravos-ai-bridge.user.js'), '// old');
    const res = cg.cgInstallUserscript(dir, () => {});
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    const installedContent = fs.readFileSync(path.join(dir, 'mastermind-ai-bridge.user.js'), 'utf8');
    const sourceContent = fs.readFileSync(path.join(__dirname, '..', 'integrations', 'clearglass', 'mastermind-ai-bridge.user.js'), 'utf8');
    assert.strictEqual(installedContent, sourceContent);
    assert.ok(!fs.existsSync(path.join(dir, 'eravos-ai-bridge.user.js')), 'stale eravos bridge should be removed');
  });

  await t('cgInstallUserscript reports NO_INSTALL_TARGET honestly instead of pretending success', async () => {
    const res = cg.cgInstallUserscript('/definitely/does/not/exist/anywhere', () => {});
    assert.strictEqual(res.ok, false);
    assert.match(res.error, /^NO_INSTALL_TARGET/);
  });

  await t('REGRESSION: a "hidden" agent window is parked off-screen, never .hide()d — this is the actual Test-hangs-until-shown fix', async () => {
    const win = cg.cgCreateWindow('claude', 'parktest', false);
    assert.strictEqual(win.isVisible(), true,
      'window must stay OS-realized (Page Visibility \'visible\') even when the user shouldn\'t see it — real .hide() flips it back to hidden and reintroduces the bug');
    assert.strictEqual(win._hideCallCount, 0, '.hide() must never be called on an agent window');
    assert.strictEqual(win._skipTaskbar, true, 'parked window must not appear in the taskbar');
    const [x, y] = win.getPosition();
    assert.ok(x < -10000 && y < -10000, 'parked window must be positioned well off any real display, got ' + x + ',' + y);
  });

  await t('REGRESSION: opening a window for sign-in reveals it on-screen, in the taskbar, focused', async () => {
    const win = cg.cgCreateWindow('claude', 'revealtest', true);
    assert.strictEqual(win.isVisible(), true);
    assert.strictEqual(win._skipTaskbar, false);
    const [x, y] = win.getPosition();
    assert.ok(x > -10000 && y > -10000, 'revealed window must be on a real display, got ' + x + ',' + y);
  });

  await t('REGRESSION: closing the sign-in window (titlebar X) parks it rather than hiding it — session survives, Page Visibility stays visible', async () => {
    const win = cg.cgCreateWindow('claude', 'closepark', true);
    win.close();
    assert.strictEqual(win.isDestroyed(), false, 'closing must not destroy the agent window (session would be lost)');
    assert.strictEqual(win.isVisible(), true, 'closing must park (stay OS-visible), not truly hide');
    assert.strictEqual(win._hideCallCount, 0);
  });

  await t('REGRESSION: reusing an already-open window for a background ask still ends up parked, not left revealed or truly hidden', async () => {
    const win = cg.cgCreateWindow('chatgpt', 'reuse1', true);  // opened for sign-in
    const same = cg.cgCreateWindow('chatgpt', 'reuse1', false); // then asked for in the background
    assert.strictEqual(win, same, 'must reuse the same window, not create a second one');
    assert.strictEqual(same.isVisible(), true);
    assert.strictEqual(same._skipTaskbar, true);
    assert.strictEqual(same._hideCallCount, 0);
  });

  await t('REGRESSION: a sign-in that never completes now tells the renderer instead of silently giving up after 10 minutes', async () => {
    const CFG = require('../foundation/ai/clearglass-config.js');
    const origMaxTicks = CFG.timing.signinWatchMaxTicks;
    const origIntervalMs = CFG.timing.signinWatchIntervalMs;
    CFG.timing.signinWatchMaxTicks = 2;
    CFG.timing.signinWatchIntervalMs = 15; // accelerated so the test doesn't take 10 real minutes
    const sent = [];
    const fakeMainWin = { isDestroyed: () => false, webContents: { send: (ch, d) => sent.push({ ch, d }) } };
    cg.cgRegisterIpc(() => {}, () => fakeMainWin);
    try {
      const win = cg.cgCreateWindow('gemini', 'neversignsin', true);
      win.webContents.fakeDom = makeDom({}); // no composer ever appears — never "signs in"
      await ipcMain.invoke('cg:open', { agent: 'gemini', accountId: 'neversignsin' });
      await sleep(200); // well past 2 ticks * 15ms
      const timeoutEvt = sent.find((s) => s.ch === 'cg:signin-timeout');
      assert.ok(timeoutEvt, 'expected a cg:signin-timeout event on the main window');
      assert.strictEqual(timeoutEvt.d.agent, 'gemini');
    } finally {
      CFG.timing.signinWatchMaxTicks = origMaxTicks;
      CFG.timing.signinWatchIntervalMs = origIntervalMs;
      cg.cgRegisterIpc(() => {}, () => null); // restore the shared default used by every other test
    }
  });

  await t('REGRESSION: cgUserscriptTargets still returns the same shape after the base-dir refactor', async () => {
    const targets = cg.cgUserscriptTargets({ home: '/home/x', appData: '/home/x/AppData/Roaming' });
    assert.ok(targets.every((t) => t.endsWith('userscripts')), 'every target must still end in /userscripts: ' + JSON.stringify(targets));
    assert.ok(targets.some((t) => t.includes('clear-glass-lite')));
  });

  await t('cgDetectGuardianConfig finds a real config file and extracts token+port', async () => {
    // Isolated parent first — writing straight into os.tmpdir() itself
    // (e.g. /tmp/clear-glass-lite) pollutes shared system state that
    // persists across test runs and can silently satisfy an unrelated
    // test's "nothing is installed" assumption later.
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgl-guardian-parent-'));
    fs.mkdirSync(path.join(parentDir, 'clear-glass-lite'), { recursive: true });
    fs.writeFileSync(path.join(parentDir, 'clear-glass-lite', 'config.json'), JSON.stringify({ token: 'tok-real', port: 8123 }));
    const res2 = cg.cgDetectGuardianConfig({ home: parentDir, appData: undefined });
    assert.strictEqual(res2.ok, true, JSON.stringify(res2));
    assert.strictEqual(res2.token, 'tok-real');
    assert.strictEqual(res2.port, 8123);
  });

  await t('cgDetectGuardianConfig tries alternate key names (authToken, guardianPort etc)', async () => {
    const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cgl-guardian2-'));
    fs.mkdirSync(path.join(parentDir, 'ClearGlass Lite'), { recursive: true });
    fs.writeFileSync(path.join(parentDir, 'ClearGlass Lite', 'guardian.json'), JSON.stringify({ authToken: 'alt-tok', guardianPort: 5555 }));
    const res = cg.cgDetectGuardianConfig({ home: parentDir, appData: undefined });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.strictEqual(res.token, 'alt-tok');
    assert.strictEqual(res.port, 5555);
  });

  await t('cgDetectGuardianConfig fails honestly (with what it tried) when nothing is installed', async () => {
    const res = cg.cgDetectGuardianConfig({ home: fs.mkdtempSync(path.join(os.tmpdir(), 'cgl-empty-')), appData: undefined });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'GUARDIAN_CONFIG_NOT_FOUND');
    assert.ok(Array.isArray(res.tried) && res.tried.length > 0);
  });

  await t('cg:detectGuardian IPC handler wires through to the real function', async () => {
    const res = await ipcMain.invoke('cg:detectGuardian', {});
    assert.strictEqual(typeof res.ok, 'boolean');
  });

  await t('REGRESSION: cg:ask does NOT reload the page by default — this was silently happening on every single AI call in the app', async () => {
    const win = cg.cgCreateWindow('claude', 'noreload', false);
    await win.webContents.loadURL('https://claude.ai/new'); // simulates the window having already settled from its initial creation load
    const composer = new FakeTextArea('');
    const send = new FakeButton(false);
    send._onclick = () => { composer.value = ''; };
    win.webContents.fakeDom = makeDom({
      'textarea': composer, 'button[aria-label*="Send" i]': send, 'button[aria-label*="Stop" i]': null,
      '[data-testid="conversation-turn"]': [], '.font-claude-message': [],
    });
    const callsBefore = win.webContents._loadURLCallCount;
    await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'noreload', prompt: 'hi', timeoutMs: 1200 });
    assert.strictEqual(win.webContents._loadURLCallCount, callsBefore,
      'cg:ask must not call loadURL again when fresh is not explicitly requested — that was the reload-on-every-call bug');
  });

  await t('cg:ask DOES reload when fresh:true is explicitly requested (Test button opts into this deliberately)', async () => {
    const win = cg.cgCreateWindow('claude', 'wantfresh', false);
    await win.webContents.loadURL('https://claude.ai/new');
    win.webContents.fakeDom = makeDom({});
    const callsBefore = win.webContents._loadURLCallCount;
    await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'wantfresh', prompt: 'hi', timeoutMs: 1200, fresh: true });
    assert.ok(win.webContents._loadURLCallCount > callsBefore, 'expected an explicit fresh:true request to trigger a reload');
  });

  await t('REGRESSION: reply is detected via text stability alone when the stop-button selector never matches (a live site DOM change, not just a timing issue)', async () => {
    const win = cg.cgCreateWindow('claude', 'nostopselector', false);
    const composer = new FakeTextArea('');
    const send = new FakeButton(false);
    send._onclick = () => { composer.value = ''; };
    win.webContents.fakeDom = makeDom({
      'textarea': composer, 'button[aria-label*="Send" i]': send,
      'button[aria-label*="Stop" i]': null, // never appears — simulates a stale/wrong selector
      '[data-testid="conversation-turn"]': [], '.font-claude-message': [],
    });
    const dom = win.webContents.fakeDom;
    setTimeout(() => dom._set('.font-claude-message', [new FakeBlock('42, definitely.')]), 3000);
    const res = await ipcMain.invoke('cg:ask', { agent: 'claude', accountId: 'nostopselector', prompt: 'what is the answer?', timeoutMs: 15000 });
    assert.strictEqual(res.ok, true, 'expected the reply to still be detected via text stability, got: ' + JSON.stringify(res));
    assert.strictEqual(res.text, '42, definitely.');
  });

  await t('cg:peek reads live page state without any side effects — no typing, no clicking', async () => {
    const win = cg.cgCreateWindow('claude', 'peektest', false);
    const composer = new FakeTextArea('should not be touched');
    win.webContents.fakeDom = makeDom({
      'textarea': composer,
      'button[aria-label*="Stop" i]': new FakeButton(false),
      '.font-claude-message': [new FakeBlock('partial reply so far')],
    });
    const res = await ipcMain.invoke('cg:peek', { agent: 'claude', accountId: 'peektest' });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.strictEqual(res.hasComposer, true);
    assert.strictEqual(res.generating, true);
    assert.strictEqual(res.preview, 'partial reply so far');
    assert.strictEqual(composer.value, 'should not be touched', 'peek must never modify the composer');
  });

  await t('cg:peek on a nonexistent window reports NO_WINDOW honestly', async () => {
    const res = await ipcMain.invoke('cg:peek', { agent: 'gemini', accountId: 'never-created-xyz' });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error, 'NO_WINDOW');
  });

  const fails = summary('clearglass-main.js');
  process.exitCode = fails ? 1 : 0;
}

run();
