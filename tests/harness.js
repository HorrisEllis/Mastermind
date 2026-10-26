'use strict';
const assert = require('assert');

const results = [];
async function t(name, fn) {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - start });
    console.log('  \u2713 ' + name);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - start, error: e.message });
    console.log('  \u2717 ' + name + '\n      ' + (e.stack || e.message).split('\n').join('\n      '));
  }
}
function summary(suiteName) {
  const fails = results.filter(r => !r.ok);
  console.log('\n' + suiteName + ': ' + (results.length - fails.length) + '/' + results.length + ' passed');
  return fails.length;
}

// ── Fake DOM ─────────────────────────────────────────────────────────
// Not a browser. A table-driven double that answers exactly the
// document.querySelector / querySelectorAll / execCommand calls the
// REAL generated scripts in clearglass-main.js / the userscript make,
// so those real code paths run unmodified and produce real, checkable
// outcomes (returned objects, thrown errors, dispatched events).

class FakeTextArea {
  constructor(initial) {
    this.tagName = 'TEXTAREA';
    this._value = initial || '';
    this.disabled = false;
    this._listeners = {};
  }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  focus() {}
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatchEvent(e) { (this._listeners[e.type] || []).forEach((fn) => fn(e)); return true; }
}

class FakeEditable {
  constructor(initial) {
    this.tagName = 'DIV';
    this.textContent = initial || '';
    this.innerText = initial || '';
    this._listeners = {};
  }
  focus() {}
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatchEvent(e) { (this._listeners[e.type] || []).forEach((fn) => fn(e)); return true; }
}

class FakeButton {
  constructor(disabled) {
    this.tagName = 'BUTTON';
    this.disabled = !!disabled;
    this._clicks = 0;
    this._onclick = null;
  }
  click() { this._clicks++; if (this._onclick) this._onclick(); }
}

class FakeBlock {
  constructor(text) { this.tagName = 'DIV'; this.innerText = text; this.textContent = text; }
}

// selectors: { [selectorString]: element | element[] | null }
// Exact-string lookup — deliberately not a CSS engine. The generated
// scripts only ever query the exact strings baked into AGENTS[key], so
// this is the real surface, not a simplification of it.
function makeDom(selectors) {
  const table = Object.assign({}, selectors);
  let activeElement = null;
  const doc = {
    HTMLTextAreaElement: FakeTextArea,
    HTMLInputElement: FakeTextArea,
    querySelector(sel) {
      const v = table[sel];
      if (Array.isArray(v)) return v[0] || null;
      return v || null;
    },
    querySelectorAll(sel) {
      const v = table[sel];
      if (Array.isArray(v)) return v;
      return v ? [v] : [];
    },
    execCommand(cmd, ui, val) {
      if (cmd === 'insertText' && activeElement && 'textContent' in activeElement) {
        activeElement.textContent = val;
        activeElement.innerText = val;
        return true;
      }
      return false;
    },
    // test control surface
    _set(sel, el) { table[sel] = el; },
    _get(sel) { return table[sel]; },
  };
  // route focus() calls into activeElement tracking without touching the
  // element classes themselves
  const wrapFocus = (el) => {
    if (!el || el._focusWrapped || typeof el.focus !== 'function') return el;
    const orig = el.focus.bind(el);
    el.focus = () => { activeElement = el; orig(); };
    el._focusWrapped = true;
    return el;
  };
  for (const k of Object.keys(table)) {
    const v = table[k];
    if (Array.isArray(v)) v.forEach(wrapFocus); else if (v) wrapFocus(v);
  }
  return doc;
}

module.exports = { t, summary, assert, makeDom, FakeTextArea, FakeEditable, FakeButton, FakeBlock };
