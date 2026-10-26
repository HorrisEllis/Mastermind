// ═══════════════════════════════════════════════════════════════════
// MASTERMIND BOOT SCREEN
// foundation/ui/mm-boot-screen.js
//
// Renders the pre-flight checks from foundation/vault/vault-boot.js.
//
// ─────────────────────────────────────────────────────────────────
// THE FORM
//
// A vertical spine of nine nodes joined by a hairline, checked in
// order. That shape is not decoration: the checks ARE a dependency
// sequence (nothing downstream means anything if the runtime is
// missing), and the vault's integrity model IS a chain — the audit
// ledger is literally a hash chain, each entry linked to the last.
//
// So when a check fails critically, the connector below it goes dark
// and dashed. The chain breaks where the verification broke. It is the
// same picture the data actually makes.
//
// ─────────────────────────────────────────────────────────────────
// THE JOB
//
// One: tell the person whether their vault is intact, before anything
// is loaded that could be lost. Two: when it is not, say exactly what
// is wrong and what to do — every failing check carries a remedy, and
// the remedies that can be acted on become buttons.
//
// Every silent failure this project has had would have surfaced here.
//
// UUID: 4a3b2c1d-vault-6000-8000-bootscreen1
// ═══════════════════════════════════════════════════════════════════

'use strict';

const MM_BOOT = {
  report: null,
  running: false,
  onDone: null,
};

// Status → visual. Pure: one place decides what each state looks like,
// so a new status cannot quietly render as nothing.
function mmBootStepVisual(status) {
  switch (status) {
    case 'pass':     return { color: 'var(--c)',   glyph: '\u25C6', label: 'OK',       dim: false };
    case 'notice':   return { color: 'var(--mid)', glyph: '\u25C7', label: 'NOTE',     dim: false };
    case 'warn':     return { color: 'var(--o)',   glyph: '\u25B3', label: 'WARNING',  dim: false };
    case 'critical': return { color: 'var(--r)',   glyph: '\u25A0', label: 'BLOCKED',  dim: false };
    case 'skipped':  return { color: 'var(--dim)', glyph: '\u25CB', label: 'SKIPPED',  dim: true  };
    case 'running':  return { color: 'var(--c2)',  glyph: '\u25CC', label: 'CHECKING', dim: true  };
    default:         return { color: 'var(--dim)', glyph: '\u25CB', label: String(status || '').toUpperCase(), dim: true };
  }
}

function _mmEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// One node on the spine. `last` suppresses the trailing connector;
// `broken` dashes it, marking where verification stopped being trustworthy.
function mmBootRenderStep(step, index, opts) {
  const o = opts || {};
  const v = mmBootStepVisual(step.status);
  const connectorClass = 'mmb-connector' + (o.broken ? ' mmb-connector-broken' : '');

  return '' +
    '<div class="mmb-step' + (v.dim ? ' mmb-step-dim' : '') + '" style="--mmb-c:' + v.color + '" ' +
         'data-step="' + _mmEsc(step.id) + '" data-status="' + _mmEsc(step.status) + '">' +
      '<div class="mmb-rail">' +
        '<div class="mmb-node' + (step.status === 'running' ? ' mmb-node-pulse' : '') + '">' + v.glyph + '</div>' +
        (o.last ? '' : '<div class="' + connectorClass + '"></div>') +
      '</div>' +
      '<div class="mmb-body">' +
        '<div class="mmb-head">' +
          '<span class="mmb-label">' + _mmEsc(step.label) + '</span>' +
          '<span class="mmb-status">' + v.label + '</span>' +
        '</div>' +
        (step.detail ? '<div class="mmb-detail">' + _mmEsc(step.detail) + '</div>' : '') +
        (step.remedy ? '<div class="mmb-remedy">\u2192 ' + _mmEsc(step.remedy) + '</div>' : '') +
      '</div>' +
    '</div>';
}

// The chain is only trustworthy down to the first critical failure, so
// everything after it is drawn as broken.
function mmBootRenderSteps(steps) {
  const firstCritical = steps.findIndex((s) => s.status === 'critical');
  return steps.map((s, i) => mmBootRenderStep(s, i, {
    last: i === steps.length - 1,
    broken: firstCritical !== -1 && i >= firstCritical,
  })).join('');
}

// ── Actions offered for a given report ────────────────────────────────────
// Derived from what is actually wrong, not a fixed row of buttons. An action
// that cannot help is not shown.
function mmBootActions(report) {
  const acts = [];
  const has = (id) => report.steps.find((s) => s.id === id);
  const bad = (id) => { const s = has(id); return s && (s.status === 'critical' || s.status === 'warn'); };
  const p = report.probes || {};

  if (bad('vault_file') || bad('integrity') || bad('vault_format') || bad('encryption_expected')) {
    if (p.snapshotCount > 0) {
      acts.push({ label: 'Restore a snapshot', fn: 'mmBootShowSnapshots()', primary: true });
    }
    acts.push({ label: 'Choose a different folder', fn: 'mmBootChangeFolder()' });

    // This used to read `if (!p.vaultExists)`, on the reasoning that offering
    // to create a vault while one exists invites overwriting it. The reasoning
    // is sound and the condition was the wrong expression of it: a file that
    // exists but CANNOT BE OPENED, with no snapshots behind it, produced a
    // blocking screen whose only two actions were a folder picker that finds
    // the same file and a re-run that fails identically. No way forward, and
    // no way out — on the one screen whose entire job is to offer a way out.
    //
    // The real requirement was never "hide the button", it was "do not lose
    // the file". So the button is always offered when the vault is unopenable,
    // and mmBootCreateNew() copies the existing file aside and PROVES the copy
    // landed before setup is allowed to touch anything. It stays non-primary
    // whenever a restore is possible, because restoring is the better answer
    // and should be the one that looks like the answer.
    acts.push({ label: 'Create a new vault', fn: 'mmBootCreateNew()' });
  }
  if (bad('datadir')) acts.push({ label: 'Choose your data folder', fn: 'mmBootChangeFolder()', primary: true });
  if (bad('ledger')) acts.push({ label: 'Open the data folder', fn: 'mmBootOpenFolder()' });

  acts.push({ label: 'Run the checks again', fn: 'mmBootRun()' });
  return acts;
}

function mmBootRenderActions(report) {
  return mmBootActions(report).map((a) =>
    '<button class="' + (a.primary ? 'mm-btn-primary' : 'mm-btn-ghost') + '" ' +
    'onclick="' + a.fn + '" style="' + (a.primary ? '' : 'margin-top:8px') + '">' +
    _mmEsc(a.label) + '</button>'
  ).join('');
}

// ── Screen control ────────────────────────────────────────────────────────

function _mmBootEl(id) { return document.getElementById(id); }

// Hides EVERY startup screen — and clears the inline display with it.
//
// Two bugs met here on 2026-08-12. First, the old switcher hid a hardcoded
// LIST of screens, which did not include ss-vault-missing because that one is
// built at runtime; a switcher that must be told about new screens is always
// one screen behind. Second, and the reason the first was invisible:
// _showVaultMissingScreen sets `el.style.display = 'flex'` inline, and an
// inline style beats the `.hidden` class, so adding `hidden` did nothing at
// all. The boot report and the recovery form drew on top of each other.
//
// Anything that hides a screen must clear the inline display too, or the
// class is decorative.
function mmHideAllStartupScreens() {
  document.querySelectorAll('.startup-inner').forEach((el) => {
    el.classList.add('hidden');
    el.style.display = '';
  });
}

function mmBootShow() {
  const ss = _mmBootEl('startup-screen');
  if (ss) ss.classList.remove('hidden');

  mmHideAllStartupScreens();
  document.getElementById('homepage')?.classList.add('hidden');

  const bar = _mmBootEl('mm-steps');
  if (bar) bar.style.display = 'none';
  const boot = _mmBootEl('ss-boot');
  if (boot) boot.classList.remove('hidden');
}

function mmBootHide() {
  const boot = _mmBootEl('ss-boot');
  if (boot) boot.classList.add('hidden');
}

// Reveals the steps in order rather than all at once. Not decoration: the
// checks run in dependency order and the stagger makes that order legible,
// so when it stops, it is obvious where.
function _mmBootReveal(steps, done) {
  const list = _mmBootEl('mmb-steps');
  if (!list) { if (done) done(); return; }

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    list.innerHTML = mmBootRenderSteps(steps);
    if (done) done();
    return;
  }

  list.innerHTML = '';
  let i = 0;
  const firstCritical = steps.findIndex((s) => s.status === 'critical');
  const tick = () => {
    if (i >= steps.length) { if (done) done(); return; }
    const el = document.createElement('div');
    el.innerHTML = mmBootRenderStep(steps[i], i, {
      last: i === steps.length - 1,
      broken: firstCritical !== -1 && i >= firstCritical,
    });
    const node = el.firstChild;
    node.classList.add('mmb-enter');
    list.appendChild(node);
    requestAnimationFrame(() => node.classList.add('mmb-enter-in'));
    i++;
    setTimeout(tick, 70);
  };
  tick();
}

// ── Run ───────────────────────────────────────────────────────────────────

async function mmBootRun(onDone) {
  if (MM_BOOT.running) return;
  MM_BOOT.running = true;
  if (onDone) MM_BOOT.onDone = onDone;

  mmBootShow();
  const list = _mmBootEl('mmb-steps');
  const foot = _mmBootEl('mmb-foot');
  const summ = _mmBootEl('mmb-summary');
  if (foot) foot.innerHTML = '';
  if (summ) { summ.textContent = 'Checking your vault\u2026'; summ.className = 'mmb-summary'; }
  if (list) list.innerHTML = '';

  let report;
  try {
    report = await vaultBootCheck();
  } catch (e) {
    MM_BOOT.running = false;
    if (summ) { summ.textContent = 'The checks could not run: ' + e.message; summ.className = 'mmb-summary mmb-summary-bad'; }
    if (foot) foot.innerHTML = '<button class="mm-btn-primary" onclick="mmBootRun()">Try again</button>';
    return null;
  }

  MM_BOOT.report = report;

  _mmBootReveal(report.steps, async () => {
    MM_BOOT.running = false;

    if (summ) {
      summ.textContent = report.summary;
      summ.className = 'mmb-summary ' +
        (report.canProceed ? (report.warnings.length ? 'mmb-summary-warn' : 'mmb-summary-ok') : 'mmb-summary-bad');
    }

    if (report.canProceed) {
      // Snapshot before the session touches anything — but only of a vault
      // that passed integrity, so damage is never preserved as though good.
      await vaultSnapshotOnBoot(report);
      vaultArmFileWatcher();

      if (report.warnings.length) {
        // Warnings do not block, but they are not swallowed either. The
        // person decides when to move on.
        if (foot) {
          foot.innerHTML = '<button class="mm-btn-primary" onclick="mmBootContinue()">Continue</button>' +
            mmBootRenderActions(report).replace(/<button class="mm-btn-primary"[\s\S]*?<\/button>/, '');
        }
      } else {
        if (foot) foot.innerHTML = '<div class="mmb-proceed">Opening\u2026</div>';
        setTimeout(mmBootContinue, 520);
      }
    } else {
      if (foot) foot.innerHTML = mmBootRenderActions(report);
    }
  });

  return report;
}

function mmBootContinue() {
  mmBootHide();
  const cb = MM_BOOT.onDone;
  MM_BOOT.onDone = null;
  if (typeof cb === 'function') cb(MM_BOOT.report);
}

// ── Snapshot restore ──────────────────────────────────────────────────────

async function mmBootShowSnapshots() {
  const report = MM_BOOT.report;
  const list = _mmBootEl('mmb-steps');
  const foot = _mmBootEl('mmb-foot');
  const summ = _mmBootEl('mmb-summary');
  if (!list) return;

  if (summ) { summ.textContent = 'Choose a snapshot to restore'; summ.className = 'mmb-summary'; }
  list.innerHTML = '<div class="mmb-detail" style="padding:12px 0">Reading snapshots\u2026</div>';
  if (foot) foot.innerHTML = '';

  let snaps = [];
  try {
    const res = await window.NXAPI.snapshotList(report.dataDir, report.vaultPath);
    snaps = (res && res.snapshots) || [];
  } catch (e) {
    list.innerHTML = '<div class="mmb-detail">Could not read the snapshots folder: ' + _mmEsc(e.message) + '</div>';
    return;
  }

  const usable = snaps.filter((s) => !s.malformed);
  if (!usable.length) {
    list.innerHTML = '<div class="mmb-detail">There are no snapshots in this folder.</div>';
    if (foot) foot.innerHTML = '<button class="mm-btn-ghost" onclick="mmBootRun()">Back to checks</button>';
    return;
  }

  // Verify each one before offering it. A snapshot list that shows a
  // corrupted file as an equal option is how a bad restore happens.
  const rows = [];
  for (const s of usable) {
    let v = { ok: false, message: 'not checked' };
    try { v = await window.NXAPI.snapshotVerify(report.dataDir, report.vaultPath, s.name); } catch (e) {}
    const when = new Date(s.ts);
    const age = Math.round((Date.now() - s.ts) / 3600000);
    rows.push(
      '<div class="mmb-snap' + (v.ok ? '' : ' mmb-snap-bad') + '">' +
        '<div class="mmb-snap-main">' +
          '<div class="mmb-snap-when">' + _mmEsc(when.toLocaleString()) + '</div>' +
          '<div class="mmb-snap-meta">save #' + (s.saveCount != null ? s.saveCount : '?') +
            ' \u00B7 ' + (s.size != null ? (s.size / 1024).toFixed(1) + ' KB' : '?') +
            ' \u00B7 ' + (age < 1 ? 'under an hour ago' : age + 'h ago') + '</div>' +
          '<div class="mmb-snap-state">' + (v.ok
            ? '<span style="color:var(--g)">\u25C6 verified</span>'
            : '<span style="color:var(--r)">\u25A0 ' + _mmEsc(v.message || 'failed verification') + '</span>') +
          '</div>' +
        '</div>' +
        (v.ok
          ? '<button class="mm-btn-ghost" onclick="mmBootRestore(\'' + _mmEsc(s.name) + '\')">Restore this</button>'
          : '<span class="mmb-snap-blocked">cannot restore</span>') +
      '</div>'
    );
  }

  list.innerHTML = rows.join('');
  if (foot) foot.innerHTML = '<button class="mm-btn-ghost" onclick="mmBootRun()">Back to checks</button>';
}

async function mmBootRestore(name) {
  const report = MM_BOOT.report;
  const ok = await mmConfirm(
    'Restore this snapshot?\n\n' +
    'It replaces the vault file currently in your data folder. ' +
    'That file is snapshotted first, so this can be undone.'
  );
  if (!ok) return;

  const summ = _mmBootEl('mmb-summary');
  if (summ) { summ.textContent = 'Restoring\u2026'; summ.className = 'mmb-summary'; }

  let res;
  try {
    res = await window.NXAPI.snapshotRestore(report.dataDir, report.vaultPath, name);
  } catch (e) {
    res = { ok: false, message: e.message };
  }

  if (!res || !res.ok) {
    if (summ) {
      summ.textContent = 'Restore failed: ' + ((res && (res.message || res.error)) || 'unknown');
      summ.className = 'mmb-summary mmb-summary-bad';
    }
    return;
  }

  mm_toast('Restored save #' + (res.saveCount != null ? res.saveCount : '?') +
    (res.priorSnapshot ? ' \u00B7 the replaced vault was saved as ' + res.priorSnapshot : ''), 'success', { dur: 7000 });
  mmBootRun();   // re-verify from scratch rather than assuming it worked
}

async function mmBootChangeFolder() {
  try {
    const dir = await window.NXAPI.pickDataFolder();
    if (!dir) return;
    NX_CONFIG.dataDir = dir;
    localStorage.setItem('nexus_datadir', dir);
    await window.NXAPI.setDataDir(dir);
    mmBootRun();
  } catch (e) {
    mm_toast('Could not change folder: ' + e.message, 'error');
  }
}

function mmBootOpenFolder() {
  try { window.NXAPI.openFolder?.(MM_BOOT.report?.dataDir); } catch (e) {}
}

// Timestamp for a preserved file: sortable, filename-safe, no separators that
// Windows rejects. Local time, because the person reading the folder is local.
function _mmBootStamp(d) {
  const p = (n, w) => String(n).padStart(w || 2, '0');
  const t = d || new Date();
  return t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) +
         '-' + p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds());
}

// Copy the unopenable vault aside and prove the copy is byte-identical.
//
// NOT snapshotCreate(): that path verifies the copy parses as a vault and
// DELETES it when it does not — correct for backing up a healthy file, exactly
// wrong here, because "does not parse as a vault" is the whole reason we are
// preserving it. A raw read/write pair is the only thing that can hold a file
// whose contents are unknown.
//
// Returns { ok, path } or { ok: false, message }.
async function mmBootPreserveVault(vaultPath) {
  if (!vaultPath) return { ok: false, message: 'No vault path is known.' };
  const api = window.NXAPI;
  if (!api || !api.readFile || !api.writeFile) {
    return { ok: false, message: 'This build cannot copy files.' };
  }

  let raw;
  try { raw = await api.readFile(vaultPath); }
  catch (e) { return { ok: false, message: 'Could not read it: ' + e.message }; }
  if (raw == null) return { ok: false, message: 'Could not read the existing vault file.' };

  const dest = vaultPath + '.unopenable-' + _mmBootStamp() + '.bak';
  let wrote;
  try { wrote = await api.writeFile(dest, raw); }
  catch (e) { return { ok: false, message: 'Could not write the copy: ' + e.message }; }
  if (wrote === false) return { ok: false, message: 'The copy could not be written.' };

  // Read it back. "The write call returned" and "the bytes are on disk" are
  // different claims, and only the second one is worth acting on.
  let check;
  try { check = await api.readFile(dest); }
  catch (e) { return { ok: false, message: 'The copy could not be read back: ' + e.message }; }
  if (check !== raw) {
    return { ok: false, message: 'The copy on disk does not match the original.' };
  }

  return { ok: true, path: dest, bytes: raw.length };
}

async function mmBootCreateNew() {
  const report = MM_BOOT.report || {};
  const p = report.probes || {};
  const foot = _mmBootEl('mmb-foot');
  const summ = _mmBootEl('mmb-summary');

  // No file to lose — the original, simple case.
  if (!p.vaultExists) {
    const ok = await mmConfirm(
      'Create a new, empty vault?\n\n' +
      'This does not recover anything. If your old vault still exists somewhere, ' +
      'point the data folder at it instead.'
    );
    if (!ok) return;
    mmBootHide();
    if (typeof _ssShow === 'function') _ssShow('ss-setup', 1);
    return;
  }

  // A file IS there. Say so plainly — someone who has just been told their
  // vault cannot be opened may not realise the data is still sitting on disk.
  const ok = await mmConfirm(
    'There is a vault file in this folder — it cannot be opened, but it has not gone anywhere.\n\n' +
    'Before a new vault is created, that file is copied and kept next to it, so it can ' +
    'still be examined or recovered later. Nothing is deleted.\n\n' +
    'If the copy cannot be made, this stops and no new vault is created.\n\n' +
    'Continue?'
  );
  if (!ok) return;

  if (summ) { summ.textContent = 'Preserving the existing vault\u2026'; summ.className = 'mmb-summary'; }
  if (foot) foot.innerHTML = '';

  const kept = await mmBootPreserveVault(report.vaultPath);

  if (!kept.ok) {
    // Refuse. Setup writes mastermind.vault unconditionally; proceeding on a
    // failed copy is the single irreversible action this screen can take.
    if (summ) {
      summ.textContent = 'Stopped — the existing vault could not be copied: ' + kept.message;
      summ.className = 'mmb-summary mmb-summary-bad';
    }
    if (foot) {
      foot.innerHTML =
        '<button class="mm-btn-primary" onclick="mmBootOpenFolder()">Open the data folder</button>' +
        '<button class="mm-btn-ghost" onclick="mmBootRun()" style="margin-top:8px">Back to checks</button>';
    }
    MMLog?.error('vault', 'Refused to create a new vault: preservation failed \u2014 ' + kept.message);
    if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.recreate.refused', { reason: kept.message });
    return;
  }

  const name = String(kept.path).split(/[\\/]/).pop();
  try {
    await window.NXAPI.ledgerAppend?.(report.dataDir, 'vault.exported',
      { reason: 'pre-recreate', file: name, bytes: kept.bytes });
  } catch (e) {}

  MMLog?.info('vault', 'Preserved unopenable vault as ' + name + ' (' + kept.bytes + ' bytes)');
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('mm.vault.preserved', { path: kept.path, bytes: kept.bytes });

  mm_toast('Your old vault was kept as ' + name + ' \u2014 it is still in your data folder.',
    'success', { dur: 12000 });

  mmBootHide();
  if (typeof _ssShow === 'function') _ssShow('ss-setup', 1);
}

if (typeof MM_BUS !== 'undefined' && typeof MM_BUS.emit === 'function') {
  MM_BUS.emit('mm.module.ready', {
    module: 'mm-boot-screen',
    uuid: '4a3b2c1d-vault-6000-8000-bootscreen1',
    version: (typeof window !== 'undefined' && window.MM_VERSION) || 'unknown',
  });
}
