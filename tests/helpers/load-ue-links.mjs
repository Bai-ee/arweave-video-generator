// Loads website/js/ue-links.js through node:vm, modelled on
// tests/helpers/load-core.mjs / load-ue-warm.mjs (see load-core.mjs's own
// comment for why vm.runInThisContext + a real-realm module/window shim --
// not vm.createContext -- is used).
//
// ue-links.js routes every DOM/browser access through `window.*` (never a
// bare `document`/`navigator`/`history` global) specifically so tests can
// hand it a minimal fake `window` here without needing jsdom (not a
// dependency of this repo). This file provides:
//   - makeUEEnvironment(opts)  -- a small, purpose-built fake window/document
//     that supports exactly the DOM surface ue-links.js touches: tag/class/
//     attribute-presence CSS selectors (no combinators/attr-value matching
//     needed -- every selector ue-links.js uses is one of those), element
//     creation, classList, textContent, addEventListener/dispatchEvent
//     (including `once`), and a couple of element helpers used to build
//     fixture markup that mirrors the real mix-card / catalog-row / player
//     bar structure (lib/WebsitePageGenerator.cjs's mixCardHtml/
//     catalogRowHtml, website/templates/partials/player-bar.html).
//   - makeFakeHost(overrides)  -- a minimal stand-in for window.UEPlayer.host
//     (the ONLY playback API a module is allowed to touch, per the
//     integration contract) with a real on()/_emit() pub-sub so tests can
//     simulate 'track'/'playback' events.
//   - loadUeLinks(env)         -- runs website/js/ue-links.js against a
//     given environment's `window` and returns its exported UELinks object.
//
// This is NOT a general-purpose DOM -- it implements only what ue-links.js
// actually calls, the same deliberate scope-limiting as tests/helpers/
// fake-dom.mjs (which this file does not reuse, to avoid depending on that
// file's unexported internals -- see the integration contract's file-
// ownership table: tests/helpers/** is read-only for this module except
// for adding a new helper named for it, which is what this file is).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', '..', 'website', 'js', 'ue-links.js');

/* ---------- minimal selector matching (tag, .class, [attr]; comma = or) ---------- */

function matchesSimple(el, simple) {
  var tagMatch = /^[a-zA-Z][\w-]*/.exec(simple);
  var tag = tagMatch ? tagMatch[0].toLowerCase() : null;
  if (tag && el.tagName.toLowerCase() !== tag) return false;
  var rest = tagMatch ? simple.slice(tagMatch[0].length) : simple;
  var partRe = /\.([\w-]+)|\[([\w-]+)\]/g;
  var m;
  while ((m = partRe.exec(rest))) {
    if (m[1]) {
      if (!el.classList.contains(m[1])) return false;
    } else if (!el.hasAttribute(m[2])) {
      return false;
    }
  }
  return true;
}

function matchesSelector(el, selector) {
  return String(selector).split(',').some(function (s) { return matchesSimple(el, s.trim()); });
}

function flattenDescendants(el, out) {
  el.children.forEach(function (c) { out.push(c); flattenDescendants(c, out); });
  return out;
}

function queryAll(root, selector) {
  return flattenDescendants(root, []).filter(function (n) { return matchesSelector(n, selector); });
}

/* ---------- fake element / document ---------- */

function makeNode(tag) {
  var listeners = {};
  var classes = [];
  var attrs = {};
  var text = '';
  var node = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '',
    hidden: false,
    type: '',
    value: '',
    readOnly: false,
    style: {},
    parentNode: null,
    children: [],
    get textContent() { return text; },
    set textContent(v) { text = String(v); node.children = []; },
    get className() { return classes.join(' '); },
    set className(v) { classes = String(v).split(/\s+/).filter(Boolean); },
    getAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute: function (name, value) { attrs[name] = String(value); },
    removeAttribute: function (name) { delete attrs[name]; },
    hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(attrs, name); },
    appendChild: function (child) { child.parentNode = node; node.children.push(child); return child; },
    removeChild: function (child) {
      var i = node.children.indexOf(child);
      if (i !== -1) node.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    contains: function (other) {
      for (var n = other; n; n = n.parentNode) { if (n === node) return true; }
      return false;
    },
    matches: function (selector) { return matchesSelector(node, selector); },
    closest: function (selector) {
      for (var n = node; n; n = n.parentNode) { if (n.matches && n.matches(selector)) return n; }
      return null;
    },
    querySelectorAll: function (selector) { return queryAll(node, selector); },
    querySelector: function (selector) { return queryAll(node, selector)[0] || null; },
    addEventListener: function (type, cb, opts) {
      listeners[type] = listeners[type] || [];
      var once = !!(opts && opts.once);
      var entry = { cb: cb, once: once };
      listeners[type].push(entry);
    },
    removeEventListener: function (type, cb) {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(function (entry) { return entry.cb !== cb; });
    },
    dispatchEvent: function (evt) {
      evt = evt || {};
      if (!evt.target) evt.target = node;
      var entries = (listeners[evt.type] || []).slice();
      entries.forEach(function (entry) {
        entry.cb(evt);
        if (entry.once) {
          listeners[evt.type] = (listeners[evt.type] || []).filter(function (e) { return e !== entry; });
        }
      });
    },
    focus: function () {},
    select: function () {},
    classList: {
      add: function (c) { if (classes.indexOf(c) === -1) classes.push(c); },
      remove: function (c) { var i = classes.indexOf(c); if (i !== -1) classes.splice(i, 1); },
      contains: function (c) { return classes.indexOf(c) !== -1; },
      toggle: function (c) {
        var i = classes.indexOf(c);
        if (i === -1) { classes.push(c); return true; }
        classes.splice(i, 1);
        return false;
      }
    }
  };
  return node;
}

/** Builds a fixture element: el('a', { 'data-playlist': '', href: '...' }, [child, ...]) */
export function el(tag, attrs, children) {
  var node = makeNode(tag);
  Object.keys(attrs || {}).forEach(function (k) {
    if (k === 'class') node.className = attrs[k];
    else if (k === 'id') node.id = attrs[k];
    else node.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function (c) { node.appendChild(c); });
  return node;
}

function makeDocument() {
  var head = makeNode('head');
  var body = makeNode('body');
  var docListeners = {};
  var readyState = 'complete';
  var doc = {
    get readyState() { return readyState; },
    set readyState(v) { readyState = v; },
    head: head,
    body: body,
    createElement: function (tag) { return makeNode(tag); },
    createElementNS: function (_ns, tag) { return makeNode(tag); },
    getElementById: function (id) {
      var all = [head, body].concat(flattenDescendants(head, [])).concat(flattenDescendants(body, []));
      for (var i = 0; i < all.length; i++) { if (all[i].id === id) return all[i]; }
      return null;
    },
    querySelectorAll: function (selector) { return queryAll(body, selector); },
    querySelector: function (selector) { return queryAll(body, selector)[0] || null; },
    addEventListener: function (type, cb, opts) {
      docListeners[type] = docListeners[type] || [];
      docListeners[type].push({ cb: cb, once: !!(opts && opts.once), capture: !!(opts === true || (opts && opts.capture)) });
    },
    removeEventListener: function (type, cb) {
      if (!docListeners[type]) return;
      docListeners[type] = docListeners[type].filter(function (entry) { return entry.cb !== cb; });
    },
    dispatchEvent: function (evt) {
      evt = evt || {};
      var entries = (docListeners[evt.type] || []).slice();
      entries.forEach(function (entry) {
        entry.cb(evt);
        if (entry.once) {
          docListeners[evt.type] = (docListeners[evt.type] || []).filter(function (e) { return e !== entry; });
        }
      });
    },
    execCommand: function () { return true; }
  };
  return doc;
}

/**
 * Builds a fake { window, document } environment. `opts`:
 *   - location: { pathname, search, href, origin } overrides
 *   - history: object merged onto a default { replaceState() {} }, or
 *     `null` to simulate an unsupported browser (feature-detection path)
 *   - navigator: object merged onto {}, or `null` to simulate absence
 *   - matchMedia: fn(query) -> { matches }
 *   - UEPlayerCore: override (defaults to a real-shaped extractTxid)
 *   - UEPlayer / UEBoot: passed through as-is (undefined by default,
 *     simulating "player not hydrated yet")
 */
export function makeUEEnvironment(opts) {
  opts = opts || {};
  var doc = makeDocument();
  var win = {
    document: doc,
    location: Object.assign(
      { pathname: '/baiee.html', search: '', href: 'https://ue.example/baiee.html', origin: 'https://ue.example' },
      opts.location || {}
    ),
    matchMedia: opts.matchMedia || function () { return { matches: false }; },
    UEPlayerCore: opts.UEPlayerCore || {
      extractTxid: function (url) {
        var m = /([A-Za-z0-9_-]{43})(?=$|[/?#])/.exec(String(url || ''));
        return m ? m[1] : null;
      }
    },
    UEPlayer: opts.UEPlayer,
    UEBoot: opts.UEBoot
  };
  if (opts.history !== null) win.history = Object.assign({ replaceState: function () {} }, opts.history || {});
  if (opts.navigator !== null) win.navigator = Object.assign({}, opts.navigator || {});
  return { window: win, document: doc };
}

/** Minimal window.UEPlayer.host stand-in with a real on()/_emit() pub-sub. */
export function makeFakeHost(overrides) {
  overrides = overrides || {};
  var hooks = { track: [], playback: [], time: [] };
  return {
    version: 1,
    getQueue: overrides.getQueue || function () { return []; },
    getState: overrides.getState || function () { return { index: -1, playing: false, shuffle: false, repeat: 'off' }; },
    getCurrentTrack: overrides.getCurrentTrack || function () { return null; },
    getCurrentTime: overrides.getCurrentTime || function () { return 0; },
    getDuration: overrides.getDuration || function () { return 0; },
    getTxid: overrides.getTxid || function () { return null; },
    findIndexByTxid: overrides.findIndexByTxid || function () { return -1; },
    playIndexAt: overrides.playIndexAt || function () { return true; },
    play: overrides.play || function () {},
    pause: overrides.pause || function () {},
    on: function (kind, cb) {
      hooks[kind] = hooks[kind] || [];
      hooks[kind].push(cb);
      return function off() {
        var i = hooks[kind].indexOf(cb);
        if (i !== -1) hooks[kind].splice(i, 1);
      };
    },
    _emit: function (kind, payload) {
      (hooks[kind] || []).slice().forEach(function (cb) { cb(payload); });
    }
  };
}

/** Runs website/js/ue-links.js in node:vm against env.window (see
 *  makeUEEnvironment). Auto-boot inside the script runs synchronously
 *  during this call, exactly like a real <script defer> executing after
 *  the DOM has parsed. Returns the exported UELinks namespace.
 *
 *  Deliberately does NOT restore globalThis.window/module in a finally
 *  block the way load-core.mjs / load-ue-warm.mjs do: those loaders only
 *  ever hand back PURE functions that take no implicit global state, so
 *  it's safe to pop the shim the instant the script finishes evaluating.
 *  ue-links.js is different -- click handlers, host.on() subscriptions,
 *  and document/window event listeners it registers are closures that
 *  read the bare `window` global again each time they LATER fire (e.g.
 *  from a simulated click well after this function has returned), exactly
 *  as they would in a real page where `window` stays live for the page's
 *  whole lifetime. Restoring eagerly here would leave those closures
 *  dereferencing a stale/undefined `window`. Every test calls loadUeLinks()
 *  with its own fresh env before touching anything, so this only "leaks"
 *  within one test file (each file already runs in its own process under
 *  `node --test`'s default process isolation) and each call simply
 *  replaces the previous env. */
export function loadUeLinks(env) {
  const code = fs.readFileSync(SOURCE_PATH, 'utf8');
  globalThis.module = { exports: {} };
  if (env === null) {
    // explicit "no window global at all" -- the other half of the
    // integration contract's "no window.document, no navigator" guarantee
    delete globalThis.window;
  } else {
    globalThis.window = env ? env.window : {};
  }
  vm.runInThisContext(code, { filename: SOURCE_PATH });
  return globalThis.module.exports;
}
