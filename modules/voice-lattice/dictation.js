// ═══════════════════════════════════════════════════════════════════
// GLOBAL DICTATION — modules/voice-lattice/dictation.js
// v1.0.0
//
// Speak into ANY field in the app. Not a voice feature living in one
// module — a capability attached to every input, textarea and
// contenteditable that exists or ever gets created.
//
//   • focus a field  → a mic button appears beside it
//   • F2             → start/stop dictating into whatever has focus
//   • speak          → interim text appears live, final text is inserted
//                      at the cursor (not appended blindly)
//   • spoken punctuation and commands: "period", "comma", "question
//     mark", "new line", "new paragraph", "scratch that"
//
// Everything dictated also flows into the lattice, so speaking into a
// Horizon seed field or an ALM box associates exactly like typing does.
//
// TESTABILITY: SpeechRecognition does not exist in the build
// environment. The parts that carry the real risk — command
// substitution and cursor-accurate insertion across three different
// field types — are pure functions and ARE tested. The recogniser
// wiring runs first on your machine.
// ═══════════════════════════════════════════════════════════════════

'use strict';

const DICT = {
  active: false,
  target: null,      // the element being dictated into
  _rec: null,
  interim: '',
  _btn: null,
  hotkey: 'F2',
  utterances: 0,
};

// Spoken → written. Ordered: longer phrases first so "new paragraph"
// isn't eaten by "new line"'s prefix.
const DICT_COMMANDS = [
  [/\bnew paragraph\b/gi, '\n\n'],
  [/\bnew line\b/gi, '\n'],
  [/\bquestion mark\b/gi, '?'],
  [/\bexclamation (mark|point)\b/gi, '!'],
  [/\bopen paren(thesis)?\b/gi, '('],
  [/\bclose paren(thesis)?\b/gi, ')'],
  [/\bsemicolon\b/gi, ';'],
  [/\bcolon\b/gi, ':'],
  [/\bcomma\b/gi, ','],
  [/\bperiod\b/gi, '.'],
  [/\bfull stop\b/gi, '.'],
  [/\bdash\b/gi, '—'],
];

// Pure: spoken text -> written text, with punctuation tidied so you
// don't get "word ." from saying "word period".
function dictApplyCommands(raw) {
  let t = String(raw || '');
  for (const [re, rep] of DICT_COMMANDS) t = t.replace(re, rep);
  t = t.replace(/\s+([,.;:!?)])/g, '$1');   // no space before punctuation
  t = t.replace(/\(\s+/g, '(');
  t = t.replace(/[ \t]{2,}/g, ' ');
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n[ \t]+/g, '\n');   // and the space AFTER a spoken line break
  t = t.trim();
  return t;
}

function dictIsDictatable(el) {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return ['text', 'search', 'url', 'email', ''].includes((el.type || '').toLowerCase());
  if (el.isContentEditable === true) return true;
  // isContentEditable is unreliable on detached/unstyled nodes and in
  // some runtimes — fall back to the attribute, which is what actually
  // declares intent.
  const attr = el.getAttribute && el.getAttribute('contenteditable');
  return attr === '' || attr === 'true';
}

// Pure: insert at the caret, replacing any selection — the difference
// between dictation feeling like typing and feeling like a blunt append.
function dictInsertInto(el, text) {
  if (!el || !text) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'INPUT') {
    const start = el.selectionStart != null ? el.selectionStart : el.value.length;
    const end   = el.selectionEnd != null ? el.selectionEnd : el.value.length;
    const before = el.value.slice(0, start), after = el.value.slice(end);
    const needsSpace = before && !/\s$/.test(before) && !/^[\s,.;:!?)]/.test(text);
    const insert = (needsSpace ? ' ' : '') + text;
    // React-safe: bypass the framework's value tracker like the agent host does
    const proto = tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, before + insert + after); else el.value = before + insert + after;
    const caret = start + insert.length;
    try { el.setSelectionRange(caret, caret); } catch (e) {}
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  if (dictIsDictatable(el)) {
    const cur = el.textContent || '';
    const needsSpace = cur && !/\s$/.test(cur) && !/^[\s,.;:!?)]/.test(text);
    el.textContent = cur + (needsSpace ? ' ' : '') + text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    return true;
  }
  return false;
}

// "scratch that" removes the previous sentence/segment.
function dictScratch(el) {
  if (!el) return false;
  const get = () => (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') ? el.value : (el.textContent || '');
  const set = (v) => {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, v); else el.value = v;
    } else el.textContent = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const cur = get().trimEnd();
  const cut = Math.max(cur.lastIndexOf('.'), cur.lastIndexOf('\n'), cur.lastIndexOf('?'), cur.lastIndexOf('!'));
  set(cut > 0 ? cur.slice(0, cut + 1) + ' ' : '');
  return true;
}

// ── Recogniser wiring ─────────────────────────────────────────────
function dictStart(target) {
  const el = target || document.activeElement;
  if (!dictIsDictatable(el)) return { ok: false, error: 'NO_FIELD: focus a text field first' };
  // ── webkitSpeechRecognition is NOT on-device ──────────────────────
  // Chrome and Electron stream the audio to Google's servers and return
  // text. For the voice lattice that means raw speech leaves the machine
  // before a node exists and before any vault encryption applies — a
  // DR-003 violation at the microphone, invisible because it looks like
  // a plain browser API. It also usually fails in packaged Electron,
  // which lacks the Google Speech key Chromium ships with.
  //
  // Local Whisper is the supported path (foundation/ai/whisper.js).
  // This branch stays reachable only behind an explicit opt-in so that
  // turning it on is a decision someone made, not a default they
  // inherited.
  if (!OPTS || OPTS.allow_cloud_speech !== true) {
    return {
      ok: false,
      error: 'CLOUD_SPEECH_DISABLED: browser speech recognition sends audio to Google. ' +
             'Use local Whisper (Options \u2192 AI), or explicitly enable cloud speech.',
    };
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return { ok: false, error: 'SPEECH_UNAVAILABLE: SpeechRecognition not present in this runtime' };
  if (DICT.active) dictStop();

  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';

  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      const raw = (r[0]?.transcript || '').trim();
      if (!raw) continue;
      if (r.isFinal) {
        if (/^\s*scratch that\s*$/i.test(raw)) { dictScratch(DICT.target); continue; }
        const text = dictApplyCommands(raw);
        dictInsertInto(DICT.target, text);
        DICT.utterances++;
        // Dictated text joins the lattice exactly like typed text.
        if (typeof latticeIngest === 'function') {
          try { latticeIngest('voice.utterance', null, text, { extra: { via: 'dictation' } }); } catch (err) {}
        }
        if (typeof MM_BUS !== 'undefined') MM_BUS.emit('dictation.final', { text });
      } else interim += raw + ' ';
    }
    DICT.interim = interim.trim();
    _dictBadge();
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      mm_toast('Microphone permission denied — enable it for Mastermind', 'error');
      dictStop();
    }
  };
  rec.onend = () => { if (DICT.active) { try { rec.start(); } catch (e) { dictStop(); } } };

  try { rec.start(); } catch (e) { return { ok: false, error: 'START_FAILED: ' + e.message }; }
  DICT._rec = rec; DICT.active = true; DICT.target = el;
  _dictBadge();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('dictation.started', {});
  return { ok: true };
}

function dictStop() {
  DICT.active = false;
  try { DICT._rec?.stop(); } catch (e) {}
  DICT._rec = null; DICT.interim = '';
  _dictBadge();
  if (typeof MM_BUS !== 'undefined') MM_BUS.emit('dictation.stopped', {});
  return { ok: true };
}

function dictToggle(target) {
  if (DICT.active) return dictStop();
  const r = dictStart(target);
  if (!r.ok) mm_toast(r.error, 'warn');
  return r;
}

// Floating mic that follows focus — the affordance that makes this
// discoverable instead of a hotkey nobody remembers.
function _dictEnsureButton() {
  if (DICT._btn) return DICT._btn;
  const b = document.createElement('button');
  b.id = 'dict-float-btn';
  b.type = 'button';
  b.textContent = '🎤';
  b.title = 'Dictate into this field (F2)';
  b.style.cssText = 'position:fixed;z-index:9600;display:none;padding:3px 6px;font-size:12px;line-height:1;' +
    'background:var(--void,#050810);border:1px solid var(--wire2,#2a3550);color:var(--c,#00c8ff);cursor:pointer';
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep field focus
  b.addEventListener('click', () => dictToggle(DICT.target));
  document.body.appendChild(b);
  DICT._btn = b;
  return b;
}

function _dictBadge() {
  const b = DICT._btn;
  if (!b) return;
  b.style.background = DICT.active ? 'rgba(255,51,85,.25)' : 'var(--void,#050810)';
  b.style.borderColor = DICT.active ? '#ff3355' : 'var(--wire2,#2a3550)';
  b.title = DICT.active ? 'Listening — click to stop (F2)' : 'Dictate into this field (F2)';
}

function _dictPositionFor(el) {
  const b = _dictEnsureButton();
  if (!dictIsDictatable(el)) { b.style.display = 'none'; return; }
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) { b.style.display = 'none'; return; }
  b.style.display = 'block';
  b.style.left = Math.max(4, r.right - 26) + 'px';
  b.style.top  = Math.max(4, r.top + 3) + 'px';
}

(function _dictInstall() {
  function wire() {
    document.addEventListener('focusin', (e) => {
      if (dictIsDictatable(e.target)) { DICT.target = e.target; _dictPositionFor(e.target); }
    });
    document.addEventListener('focusout', (e) => {
      setTimeout(() => {
        if (!dictIsDictatable(document.activeElement)) {
          if (DICT._btn) DICT._btn.style.display = 'none';
          if (DICT.active) dictStop();
        }
      }, 120);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === DICT.hotkey) { e.preventDefault(); dictToggle(DICT.target || document.activeElement); }
    });
    window.addEventListener('scroll', () => { if (DICT.target) _dictPositionFor(DICT.target); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();

window.DICT = DICT;
window.dictApplyCommands = dictApplyCommands;
window.dictInsertInto = dictInsertInto;
window.dictIsDictatable = dictIsDictatable;
window.dictScratch = dictScratch;
window.dictStart = dictStart;
window.dictStop = dictStop;
window.dictToggle = dictToggle;

if (typeof MMLog !== 'undefined') MMLog.info('voice', 'Global dictation v1.0.0 — F2 or the floating mic, on any field');
