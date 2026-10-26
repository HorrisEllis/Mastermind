// ═══════════════════════════════════════════════════════════════════
// MASTERMIND DIALOGS — foundation/ui/mm-dialogs.js
// v1.0.0
//
// Real replacement for window.prompt()/window.confirm(). Built because
// window.prompt() broke node linking outright — completeLink() called
// prompt() to ask for a connection label, and in this app's frameless
// BrowserWindow configuration native dialogs don't reliably work, so
// the call never returned and the link never got created. Same
// underlying mechanism is used in 22 other places across the app,
// including password change, PIN setup, and encryption enable/disable
// — genuinely critical flows, not just linking. All 23 call sites are
// being moved to these.
//
// Both return Promises. Callers that used to do:
//   const x = prompt('...'); if (!x) return;
// become:
//   const x = await mmPrompt('...'); if (!x) return;
// which means the enclosing function needs to be `async` if it wasn't
// already — checked and fixed at every call site, not just added here.
// ═══════════════════════════════════════════════════════════════════

'use strict';

function mmPrompt(message, defaultValue = '') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:min(380px,90vw);background:var(--void,#050810);border:1px solid var(--wire2,#2a3550);padding:22px" onclick="event.stopPropagation()">
        <div style="font-family:var(--f-mono,monospace);font-size:9px;color:var(--bright,#eee);line-height:1.6;margin-bottom:14px;white-space:pre-wrap">${_mmDialogEsc(message)}</div>
        <input type="text" id="mm-prompt-input" style="width:100%;box-sizing:border-box;background:var(--deep,#0a0f1a);border:1px solid var(--wire2,#2a3550);color:var(--white,#fff);font-family:var(--f-mono,monospace);font-size:10px;padding:8px 10px;outline:none" />
        <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
          <button id="mm-prompt-cancel" style="padding:7px 16px;border:1px solid var(--wire2,#2a3550);background:transparent;color:var(--muted,#99a);cursor:pointer;font-family:var(--f-mono,monospace);font-size:8px">CANCEL</button>
          <button id="mm-prompt-ok" style="padding:7px 16px;border:1px solid var(--c,#00c8ff);background:rgba(0,200,255,.1);color:var(--c,#00c8ff);cursor:pointer;font-family:var(--f-mono,monospace);font-size:8px">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#mm-prompt-input');
    input.value = defaultValue;
    input.focus();
    input.select();

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#mm-prompt-ok').onclick = () => cleanup(input.value);
    overlay.querySelector('#mm-prompt-cancel').onclick = () => cleanup(null);
    overlay.onclick = () => cleanup(null); // click outside the card = cancel, matches every other overlay in this app
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); cleanup(input.value); }
      if (e.key === 'Escape') { e.preventDefault(); cleanup(null); }
    });
  });
}

function mmConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:min(380px,90vw);background:var(--void,#050810);border:1px solid var(--wire2,#2a3550);padding:22px" onclick="event.stopPropagation()">
        <div style="font-family:var(--f-mono,monospace);font-size:9px;color:var(--bright,#eee);line-height:1.6;margin-bottom:18px;white-space:pre-wrap">${_mmDialogEsc(message)}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="mm-confirm-cancel" style="padding:7px 16px;border:1px solid var(--wire2,#2a3550);background:transparent;color:var(--muted,#99a);cursor:pointer;font-family:var(--f-mono,monospace);font-size:8px">CANCEL</button>
          <button id="mm-confirm-ok" style="padding:7px 16px;border:1px solid var(--r,#ff3355);background:rgba(255,51,85,.1);color:var(--r,#ff3355);cursor:pointer;font-family:var(--f-mono,monospace);font-size:8px">CONFIRM</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#mm-confirm-ok').focus();

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#mm-confirm-ok').onclick = () => cleanup(true);
    overlay.querySelector('#mm-confirm-cancel').onclick = () => cleanup(false);
    overlay.onclick = () => cleanup(false);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(false); }
    });
  });
}

function _mmDialogEsc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

// Third dialog primitive: an OK-only notice. Added for the vault save
// verification gate — "your save did not actually land" is not
// information a toast is allowed to be the only carrier of, because
// toasts auto-dismiss and this one means the person's last few minutes
// of voice notes may not exist on disk. Tone 'critical' (red, does not
// close on backdrop click — must be acknowledged) vs default (blue,
// dismissible like the others).
function mmAlert(message, opts) {
  const o = opts || {};
  const tone = o.tone === 'critical' ? '#ff3355' : (o.tone === 'warn' ? '#ffb020' : 'var(--c,#00c8ff)');
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
    overlay.innerHTML = `
      <div style="width:min(420px,90vw);background:var(--void,#050810);border:1px solid ${tone};padding:22px" onclick="event.stopPropagation()">
        ${o.title ? `<div style="font-family:var(--f-display,sans-serif);font-size:11px;font-weight:800;letter-spacing:2px;color:${tone};margin-bottom:12px">${_mmDialogEsc(o.title)}</div>` : ''}
        <div style="font-family:var(--f-mono,monospace);font-size:9px;color:var(--bright,#eee);line-height:1.7;white-space:pre-wrap">${_mmDialogEsc(message)}</div>
        <div style="display:flex;gap:8px;margin-top:18px;justify-content:flex-end">
          <button id="mm-alert-ok" style="padding:7px 18px;border:1px solid ${tone};background:rgba(255,255,255,.03);color:${tone};cursor:pointer;font-family:var(--f-mono,monospace);font-size:8px">${_mmDialogEsc(o.okLabel || 'OK')}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const okBtn = overlay.querySelector('#mm-alert-ok');
    okBtn.focus();
    const cleanup = () => { overlay.remove(); resolve(true); };
    okBtn.onclick = cleanup;
    // Critical alerts (failed vault save) must be read, not dismissed by
    // an accidental click outside the box — everything else behaves like
    // mmPrompt/mmConfirm and closes on backdrop click.
    if (o.tone !== 'critical') overlay.onclick = cleanup;
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Enter' || e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(); }
    });
  });
}

// Fourth primitive: N-way choice (2+ labeled buttons, not just OK/Cancel).
// Added for the orb-stop flow — "end session / keep recording, minimized
// / switch to background listening" is three real, different outcomes,
// not a yes/no. Returns the chosen button's `id`, or null on backdrop
// click / Escape (treated as "do nothing, stay as you are").
function mmChoice(message, buttons, opts) {
  const o = opts || {};
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)';
    const btnHtml = buttons.map((b, i) => {
      const tone = b.tone === 'critical' ? '#ff3355' : b.tone === 'primary' ? 'var(--c,#00c8ff)' : 'var(--muted,#99a)';
      const bg = b.tone === 'primary' || b.tone === 'critical' ? `rgba(255,255,255,.03)` : 'transparent';
      return `<button data-mm-choice="${i}" style="display:block;width:100%;text-align:left;padding:10px 14px;margin-bottom:6px;border:1px solid ${tone};background:${bg};color:${tone};cursor:pointer;font-family:var(--f-mono,monospace);font-size:9px;line-height:1.5">${_mmDialogEsc(b.label)}${b.hint ? `<div style="font-size:8px;opacity:.6;margin-top:3px">${_mmDialogEsc(b.hint)}</div>` : ''}</button>`;
    }).join('');
    overlay.innerHTML = `
      <div style="width:min(420px,90vw);background:var(--void,#050810);border:1px solid var(--wire2,#2a3550);padding:22px" onclick="event.stopPropagation()">
        ${o.title ? `<div style="font-family:var(--f-display,sans-serif);font-size:11px;font-weight:800;letter-spacing:2px;color:var(--bright,#eee);margin-bottom:12px">${_mmDialogEsc(o.title)}</div>` : ''}
        <div style="font-family:var(--f-mono,monospace);font-size:9px;color:var(--bright,#eee);line-height:1.6;margin-bottom:16px;white-space:pre-wrap">${_mmDialogEsc(message)}</div>
        <div>${btnHtml}</div>
      </div>`;
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelectorAll('[data-mm-choice]').forEach((el) => {
      el.onclick = () => cleanup(buttons[Number(el.getAttribute('data-mm-choice'))].id);
    });
    overlay.onclick = () => cleanup(null);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); cleanup(null); }
    });
  });
}

window.mmPrompt = mmPrompt;
window.mmConfirm = mmConfirm;
window.mmAlert = mmAlert;
window.mmChoice = mmChoice;
