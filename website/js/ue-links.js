/* ==========================================================================
   Underground Existence — ue-links.js
   Deep links + sharing. Optional progressive-enhancement module — see
   UE_PLAYABILITY_INTEGRATION_CONTRACT.md for the module shape, the host
   bridge (window.UEPlayer.host), and the hard rules this file must follow
   (no autoplay, no network calls, no gateway/URL construction, feature-
   detect every browser API, DOM wiring must never throw under node:vm).

   What this file does, on any existing artist/catalog page (no new pages,
   no path changes):
     1. `<page>.html?mix=<txid>[&t=<seconds>]` — on load, if `mix` names a
        playable track ON THIS PAGE, scroll it into view and outline it
        with `.ue-links-deep-link-highlight`. That highlight IS the "this
        is the mix you were linked to" signal — this module injects no
        floating banner of its own (one was deleted: it covered the grid,
        and it said nothing the highlight does not). The offer to start at
        a shared timestamp goes to the persistent player bar instead, via
        `window.uePlayerBar.prime({... startSec, label, source:'deep-link'})`
        — an element already on screen, with nothing to dismiss. Priming
        neither autoplays nor loads audio; playing is the listener pressing
        the bar's own play button. A missing/refusing player bar is a quiet
        no-op: the scroll + highlight still happen.
     2. On real user-started playback, mirrors the now-playing track's txid
        into the address bar via history.replaceState (never a reload,
        never pushState spam).
     3. Injects small "share this mix" icon buttons into the existing
        `.mix-card-actions` / `.catalog-row-actions` rows, and into the
        persistent player bar for whatever is currently playing (with a
        "copy link at current time" option).

        Those buttons open the SHARE MODAL — `window.ueShare.open({...})`,
        static markup + inline controller in templates/partials/share-modal.html
        — which is the share UI for the whole site (it also carries the mix's
        promo film, the permaweb/site address switch and the platform intents).
        Everything this file passes it comes off the card's own generated
        markup: data-title/-artist/-img/-video/-page and the href.

        The modal is optional, exactly like this module: an engine without
        <dialog> never defines `window.ueShare`, and each caller then keeps the
        original inline behavior below — navigator.share when available, else
        clipboard, else execCommand('copy'); when every automatic path is
        blocked the URL is handed to the shared centre-screen dialog
        (`window.ueDialog.open({ copyText })`) so it stays selectable, and
        absent that dialog it degrades to the platform's own `prompt()`.
        A share never silently loses the link.

   Pure helpers (query parse/validate, URL build, time format, the anchor-
   match lookup, and the share-strategy cascade) are exported on the
   namespace and unit-tested with no DOM — see tests/links-*.test.mjs and
   tests/helpers/load-ue-links.mjs. Every DOM/browser access below is
   routed through `window.<thing>` (never a bare global) and individually
   guarded, so this file loads and runs to completion under node:vm with a
   minimal/absent `window` and never throws, exactly like the other
   optional modules in this codebase (see ue-host-pref.js).
   ========================================================================== */
(function () {
  'use strict';

  /* ================================================================
     Pure helpers — no DOM, no globals besides the platform URL/Promise/
     Math/JSON classes every JS engine (browser or Node) provides
     identically. Fully unit-testable in isolation.
     ================================================================ */

  /* Arweave txid shape, per the integration contract §4 — 43 chars,
     [A-Za-z0-9_-]. Treated as an opaque lookup key; never used to build a
     URL (that stays player-core.js's job). */
  var TXID_RE = /^[A-Za-z0-9_-]{43}$/;

  /* Digits-only (optionally one decimal point) on purpose: this alone
     rejects "abc", a leading "-" (negative), and scientific notation like
     "1e9" (the "e" fails the regex) without any separate special-casing.
     A value that DOES match but is absurdly large (e.g. literal digits
     "1000000000") is still caught below by MAX_SHARE_TIME_SECONDS. */
  var TIME_PARAM_RE = /^[0-9]+(?:\.[0-9]+)?$/;

  /* ~7 days. Generous for even the longest ambient/DJ sets while still
     rejecting hostile/absurd values (a raw `t=1e9` would be ~31.7 years). */
  var MAX_SHARE_TIME_SECONDS = 604800;

  function isValidTxid(value) {
    return typeof value === 'string' && TXID_RE.test(value);
  }

  /* Feature-detects the WHATWG URLSearchParams class itself (identical
     global in a browser and in Node, so no window.* indirection needed —
     unlike document/navigator/history, which this file always routes
     through window so tests can omit them individually). Absence (some
     hypothetical exotic runtime) degrades to "nothing parses", never a
     throw. */
  function safeSearchParams(search) {
    if (typeof URLSearchParams !== 'function') return null;
    try {
      return new URLSearchParams(typeof search === 'string' ? search : '');
    } catch (err) {
      return null;
    }
  }

  function parseTimeSeconds(raw) {
    if (typeof raw !== 'string' || raw === '') return null;
    if (!TIME_PARAM_RE.test(raw)) return null;
    var n = Number(raw);
    if (!isFinite(n) || n < 0) return null;
    n = Math.floor(n);
    if (n > MAX_SHARE_TIME_SECONDS) return null;
    return n;
  }

  /* Parses a query string (with or without a leading "?", e.g.
     window.location.search) into { mix, t }. Strict on purpose:
       - mix: must be present exactly once and match TXID_RE, else null.
       - t: must be present exactly once and pass parseTimeSeconds, else
         null (t is meaningless without an accompanying mix anyway — that
         call is left to the caller, this function stays orthogonal).
     A repeated key ("array-style" hostile input, e.g. ?mix=a&mix=b, or the
     PHP-style ?t[]=1&t[]=2 which simply never matches the literal key "t")
     is treated as ambiguous and rejected rather than guessing which value
     the caller meant. Never throws — a malformed/garbage search string
     just yields { mix: null, t: null }. */
  function parseDeepLinkQuery(search) {
    var result = { mix: null, t: null };
    var params = safeSearchParams(search);
    if (!params) return result;
    try {
      if (params.getAll('mix').length === 1) {
        var mixRaw = params.get('mix');
        if (isValidTxid(mixRaw)) result.mix = mixRaw;
      }
      if (params.getAll('t').length === 1) {
        var t = parseTimeSeconds(params.get('t'));
        if (t !== null) result.t = t;
      }
    } catch (err) {
      return { mix: null, t: null };
    }
    return result;
  }

  /* 754 -> "12:34"; matches player.js's own formatTime() display
     convention (h:mm:ss once past an hour) so a shared timestamp reads
     identically to the number the listener actually saw. Never throws,
     never returns anything but a clean mm:ss/h:mm:ss string. */
  function formatShareTime(sec) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = h > 0 && m < 10 ? '0' + m : String(m);
    var ss = s < 10 ? '0' + s : String(s);
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  /* Builds "<pagePath>?<query>" for a share link: rewrites/sets `mix` to
     `txid`, sets `t` only when a positive, sane number is given (dropped
     entirely otherwise — "sharing the current spot" is opt-in), and
     preserves every OTHER existing query param (e.g. ?uedebug=1) untouched
     and in place. Returns null when it cannot produce a valid link
     (missing pagePath, invalid txid, or URLSearchParams unavailable) —
     callers must treat null as "don't offer sharing", never throw. */
  function buildShareUrl(opts) {
    opts = opts || {};
    if (typeof opts.pagePath !== 'string' || !opts.pagePath) return null;
    if (!isValidTxid(opts.txid)) return null;
    var params = safeSearchParams(opts.search);
    if (!params) return null;
    try {
      params.delete('mix');
      params.delete('t');
      params.set('mix', opts.txid);
      if (typeof opts.t === 'number' && isFinite(opts.t) && opts.t > 0) {
        var t = Math.floor(opts.t);
        if (t > MAX_SHARE_TIME_SECONDS) t = MAX_SHARE_TIME_SECONDS;
        if (t > 0) params.set('t', String(t));
      }
      var qs = params.toString();
      return opts.pagePath + (qs ? '?' + qs : '');
    } catch (err) {
      return null;
    }
  }

  /* Pure anchor-matching lookup used both by the DOM layer (real anchors +
     window.UEPlayerCore.extractTxid) and by tests (fake hrefs + a fake
     extractTxid). Returns the first matching index, or -1. A throwing
     extractTxidFn (or a non-array/invalid input) degrades to "no match",
     never propagates. */
  function findMatchingIndex(hrefs, targetTxid, extractTxidFn) {
    if (!Array.isArray(hrefs) || typeof extractTxidFn !== 'function' || !isValidTxid(targetTxid)) return -1;
    for (var i = 0; i < hrefs.length; i++) {
      var txid = null;
      try { txid = extractTxidFn(hrefs[i]); } catch (err) { txid = null; }
      if (txid === targetTxid) return i;
    }
    return -1;
  }

  /* The share-strategy cascade, kept pure by taking plain injected
     functions (never touching `navigator` itself) so it is fully
     unit-testable with fakes: native share (when given) is ALWAYS
     preferred and is invoked synchronously, at the top of this call, so a
     caller that calls runShareFlow(...) directly and synchronously inside
     a real click handler still satisfies WebKit's "navigator.share must
     be called synchronously within a user gesture" rule. Falls back:
     no share -> clipboard.writeText -> clipboard rejects or is absent ->
     execCommand('copy') -> nothing worked -> { method: 'manual' } so the
     caller can reveal a selectable URL as the last resort. Always returns
     a Promise. A user dismissing the native share sheet is reported as
     { method: 'share', cancelled: true } rather than falling through to
     clipboard — declining to share is not a failure to recover from. */
  function runShareFlow(payload, capabilities) {
    payload = payload || {};
    capabilities = capabilities || {};
    var url = typeof payload.url === 'string' ? payload.url : '';
    var shareFn = typeof capabilities.share === 'function' ? capabilities.share : null;
    var clipboardWriteFn = typeof capabilities.clipboardWrite === 'function' ? capabilities.clipboardWrite : null;
    var execCommandCopyFn = typeof capabilities.execCommandCopy === 'function' ? capabilities.execCommandCopy : null;

    function viaExecCommand() {
      if (!execCommandCopyFn) return { method: 'manual', url: url };
      var ok = false;
      try { ok = !!execCommandCopyFn(url); } catch (err) { ok = false; }
      return ok ? { method: 'execCommand', url: url } : { method: 'manual', url: url };
    }

    function viaClipboard() {
      if (!clipboardWriteFn) return Promise.resolve(viaExecCommand());
      var pending;
      try {
        pending = clipboardWriteFn(url);
      } catch (err) {
        return Promise.resolve(viaExecCommand());
      }
      return Promise.resolve(pending).then(
        function () { return { method: 'clipboard', url: url }; },
        function () { return viaExecCommand(); }
      );
    }

    if (shareFn) {
      var sharePromise;
      try {
        sharePromise = shareFn({ title: payload.title || '', text: payload.text || '', url: url });
      } catch (err) {
        /* a synchronous throw from share() (rare — most implementations
           reject the promise instead) falls back exactly like a rejection */
        return viaClipboard();
      }
      return Promise.resolve(sharePromise).then(
        function () { return { method: 'share', url: url }; },
        function (err) { return { method: 'share', url: url, cancelled: true, error: err }; }
      );
    }
    return viaClipboard();
  }

  /* ================================================================
     Thin DOM/browser layer. Everything below reads/writes window.* only —
     never a bare `document`/`navigator`/`history` global — and every
     entry point is wrapped so a missing API, a missing element, or a
     throwing sub-step degrades to "do nothing" rather than breaking the
     page or any other module. Nothing here is required to be unit-tested
     directly (see tests/links-*.test.mjs for what covers the pure helpers
     above); tests/links-dom.test.mjs exercises the observable behavior of
     this layer through a minimal fake DOM.
     ================================================================ */

  var STYLE_ID = 'ue-links-styles';
  var LIVE_REGION_ID = 'ue-links-announcer';
  var HIGHLIGHT_CLASS = 'ue-links-deep-link-highlight';
  var PLAYER_BAR_SHARE_ID = 'ue-links-player-bar-share';
  var PLAYER_BAR_POPOVER_ID = 'ue-links-player-bar-popover';
  var WIRED_ATTR = 'data-ue-links-wired';

  function hasWindow() {
    return typeof window !== 'undefined' && !!window;
  }
  function getDoc() {
    return hasWindow() && window.document ? window.document : null;
  }

  function getLocationSearch() {
    try { return (window.location && window.location.search) || ''; } catch (err) { return ''; }
  }
  function getLocationPathname() {
    try { return (window.location && window.location.pathname) || ''; } catch (err) { return ''; }
  }
  function absoluteUrl(relative) {
    try {
      if (typeof URL === 'function' && window.location && window.location.href) {
        return new URL(relative, window.location.href).href;
      }
    } catch (err) { /* fall through */ }
    try { return (window.location && window.location.origin || '') + relative; } catch (err) { return relative; }
  }

  function prefersReducedMotion() {
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (err) { return false; }
  }

  /* A `behavior:'smooth'` scroll is driven by rAF/compositor work that
     Chromium (and others) throttle or never schedule at all for a hidden/
     background tab (e.g. a shared link opened in a background tab, or the
     window losing focus right as this runs) -- confirmed empirically: an
     identical scrollIntoView() call is a total no-op while `document.hidden`
     is true, and lands instantly once `behavior:'auto'` is used instead.
     `behavior:'auto'` needs no animation frames, so it always lands
     regardless of visibility. Defaults to "visible" when the API can't be
     read, matching the pre-existing behavior. */
  function pageIsVisible() {
    try {
      var doc = getDoc();
      return !(doc && doc.hidden);
    } catch (err) { return true; }
  }

  function safeExtractTxid(href) {
    try {
      if (window.UEPlayerCore && typeof window.UEPlayerCore.extractTxid === 'function') {
        return window.UEPlayerCore.extractTxid(href);
      }
    } catch (err) { /* ignore */ }
    return null;
  }

  /* Mirrors player.js's own queue filter (a mix that isn't in the real
     playback queue can never be started via findIndexByTxid/playIndexAt,
     so treating it as "not on this page" here keeps the deep-link feature
     honest with what a click could actually do). */
  function collectPlayableAnchors() {
    var doc = getDoc();
    if (!doc) return [];
    var nodeList;
    try { nodeList = doc.querySelectorAll('a[data-playlist], a[data-link]'); } catch (err) { return []; }
    var list = Array.prototype.slice.call(nodeList || []);
    return list.filter(function (el) {
      var href = '';
      var unplayable = false;
      try { href = el.getAttribute('href') || ''; } catch (err) { href = ''; }
      try { unplayable = el.getAttribute('data-unplayable') === 'true'; } catch (err) { unplayable = false; }
      return !unplayable && /^https?:\/\//.test(href);
    });
  }

  function findAnchorForTxid(txid) {
    var anchors = collectPlayableAnchors();
    var hrefs = anchors.map(function (a) {
      try { return a.getAttribute('href') || ''; } catch (err) { return ''; }
    });
    var idx = findMatchingIndex(hrefs, txid, safeExtractTxid);
    return idx === -1 ? null : anchors[idx];
  }

  /* ---------- styles (single injected block, guarded) ---------- */

  function cssText() {
    return (
      '.ue-links-visually-hidden{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
      '.ue-links-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:1.5px solid var(--hairline,rgba(255,255,255,0.08));background:transparent;color:var(--text-secondary,#b7aaa3);cursor:pointer;flex:none;padding:0;transition:color .2s ease,border-color .2s ease,background .2s ease,transform .2s ease}' +
      '.ue-links-icon-btn:hover,.ue-links-icon-btn:focus-visible{color:var(--text-primary,#fff);border-color:var(--accent-bright,#e01e2b);background:var(--accent-veil-strong,rgba(193,18,31,0.14))}' +
      '.ue-links-icon-btn:active{transform:scale(0.94)}' +
      '.ue-links-icon-btn[hidden]{display:none!important}' +
      '.ue-links-icon-svg{width:15px;height:15px;fill:currentColor}' +
      '#player-bar-volume{position:relative}' +
      '#ue-links-player-bar-share{margin-left:4px}' +
      '.ue-links-popover{position:absolute;bottom:calc(100% + 10px);right:0;min-width:190px;background:var(--bg-elevated,#140d0d);border:1px solid var(--hairline-accent,rgba(193,18,31,0.45));border-radius:10px;box-shadow:var(--shadow-float,0 12px 30px rgba(0,0,0,0.5));padding:6px;display:flex;flex-direction:column;gap:2px;z-index:1100}' +
      '.ue-links-popover-item{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:6px;color:var(--text-primary,#f2ece4);font-family:inherit;font-size:12.5px;padding:8px 10px;cursor:pointer}' +
      '.ue-links-popover-item:hover,.ue-links-popover-item:focus-visible{background:var(--accent-veil-strong,rgba(193,18,31,0.16));color:var(--text-primary,#fff)}' +
      /* The whole of this module's deep-link feedback: an outline on the
         linked mix plus a single pulse. No fixed-position slab, nothing to
         dismiss, nothing covering the grid. */
      '.ue-links-deep-link-highlight{outline:2px solid var(--accent-bright,#e01e2b);outline-offset:4px;border-radius:12px;animation:ue-links-highlight-pulse 1.8s ease-out 1}' +
      '@keyframes ue-links-highlight-pulse{0%{box-shadow:0 0 0 0 var(--accent-glow-soft,rgba(224,30,43,0.45))}100%{box-shadow:0 0 0 16px rgba(224,30,43,0)}}' +
      '@media (max-width:480px){' +
      '.ue-links-icon-btn{width:30px;height:30px}' +
      '.ue-links-popover{right:-4px;min-width:170px}' +
      '}' +
      '@media (prefers-reduced-motion: reduce){' +
      '.ue-links-deep-link-highlight{animation:none}' +
      '.ue-links-icon-btn,.ue-links-popover-item{transition:none}' +
      '}'
    );
  }

  function injectStyles() {
    var doc = getDoc();
    if (!doc || !doc.createElement || doc.getElementById(STYLE_ID)) return;
    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = cssText();
    var host = doc.head || doc.documentElement || doc.body;
    if (host && host.appendChild) host.appendChild(style);
  }

  /* ---------- aria-live feedback ---------- */

  function ensureLiveRegion() {
    var doc = getDoc();
    if (!doc || !doc.createElement) return null;
    var existing = doc.getElementById(LIVE_REGION_ID);
    if (existing) return existing;
    var el = doc.createElement('div');
    el.id = LIVE_REGION_ID;
    el.className = 'ue-links-visually-hidden';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('role', 'status');
    var host = doc.body || doc.documentElement;
    if (host && host.appendChild) host.appendChild(el);
    return el;
  }

  function announce(liveRegion, message) {
    if (!liveRegion) return;
    try { liveRegion.textContent = typeof message === 'string' ? message : ''; } catch (err) { /* ignore */ }
  }

  /* ---------- icon (small inline SVG, tinted via currentColor) ---------- */

  function buildIconSvg(doc) {
    var NS = 'http://www.w3.org/2000/svg';
    var makeEl = doc.createElementNS ? function (tag) { return doc.createElementNS(NS, tag); } : function (tag) { return doc.createElement(tag); };
    var svg = makeEl('svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ue-links-icon-svg');
    var path = makeEl('path');
    path.setAttribute('d', 'M18 8a3 3 0 1 0-2.83-4H15a3 3 0 0 0 .08 2.24L8.9 9.62a3 3 0 1 0 0 4.76l6.18 3.38A3 3 0 1 0 16 16l-6.18-3.38a3 3 0 0 0 0-1.24L16 7.99A3 3 0 0 0 18 8Z');
    svg.appendChild(path);
    return svg;
  }

  function buildIconButton(doc, label) {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'ue-links-icon-btn';
    btn.setAttribute('aria-label', label);
    try { btn.appendChild(buildIconSvg(doc)); } catch (err) { /* icon is decorative only */ }
    return btn;
  }

  /* ---------- copy/share execution ---------- */

  function execCommandCopyFallback(text) {
    var doc = getDoc();
    if (!doc || !doc.body || !doc.createElement || typeof doc.execCommand !== 'function') return false;
    var ta = doc.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    doc.body.appendChild(ta);
    var ok = false;
    try { ta.select(); ok = !!doc.execCommand('copy'); } catch (err) { ok = false; }
    try { doc.body.removeChild(ta); } catch (err) { /* ignore */ }
    return ok;
  }

  function buildShareCapabilities() {
    var nav = hasWindow() ? window.navigator : null;
    var shareFn = (nav && typeof nav.share === 'function') ? function (data) { return nav.share(data); } : null;
    var clipboardWriteFn = (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function')
      ? function (text) { return nav.clipboard.writeText(text); }
      : null;
    return { share: shareFn, clipboardWrite: clipboardWriteFn, execCommandCopy: execCommandCopyFallback };
  }

  /* The clipboard-blocked last resort. This module used to inject its own
     fixed-position copy panel here; that is gone (it was a second floating
     slab competing with the player bar for the same screen edge, and it
     carried its own colours). The shared centre-screen dialog owns this
     now: static markup, focus-trapped, Esc-closable, styled from site.css.

     `window.ueDialog` can legitimately be missing (module load order, a
     stripped page), and losing the user's link is worse than any panel --
     so the absence path falls through to the platform's own prompt(),
     which presents the URL pre-selected and copyable with no injected DOM
     and no CSS of ours. Both paths are individually guarded: a share that
     cannot be completed must still never throw. */
  function showManualCopyFallback(url) {
    var dialog = null;
    try { dialog = hasWindow() ? window.ueDialog : null; } catch (err) { dialog = null; }
    if (dialog && typeof dialog.open === 'function') {
      try {
        dialog.open({
          title: 'Copy this link',
          message: 'Your browser blocked the automatic copy. Select the link below and copy it.',
          copyText: url
        });
        return;
      } catch (err) { /* fall through to prompt() rather than lose the link */ }
    }
    try {
      if (hasWindow() && typeof window.prompt === 'function') window.prompt('Copy this link', url);
    } catch (err) { /* ignore */ }
  }

  /* The share modal (partials/share-modal.html) is the share UI for every
     affordance in this file. It is optional in exactly the way everything else
     here is: an engine without <dialog> never defines `window.ueShare`, and
     each caller below then keeps its own pre-existing behavior. Returns whether
     the modal took the share, so callers can branch without knowing why. */
  function openShareModal(info) {
    try {
      var s = hasWindow() ? window.ueShare : null;
      if (s && typeof s.open === 'function') return s.open(info) === true;
    } catch (err) { /* ignore */ }
    return false;
  }

  function giveShareFeedback(result, url, liveRegion) {
    result = result || {};
    if (result.cancelled) return; /* user dismissed the native share sheet — not a failure */
    if (result.method === 'share') { announce(liveRegion, 'Shared.'); return; }
    if (result.method === 'clipboard' || result.method === 'execCommand') {
      announce(liveRegion, 'Link copied to clipboard.');
      return;
    }
    announce(liveRegion, 'Could not copy automatically. The link is shown so you can copy it.');
    showManualCopyFallback(url);
  }

  /* The one entry point every share affordance below calls. Synchronous up
     to (and including) the capabilities.share(...) invocation inside
     runShareFlow, so calling this directly from a real click handler keeps
     navigator.share inside the user gesture. */
  function shareMix(info, liveRegion) {
    var pagePath = getLocationPathname();
    var search = getLocationSearch();
    var relativeUrl = buildShareUrl({ pagePath: pagePath, search: search, txid: info.txid, t: info.t });
    if (!relativeUrl) return;
    var fullUrl = absoluteUrl(relativeUrl);
    var title = info.artist ? (info.title + ' — ' + info.artist) : info.title;
    var flow = runShareFlow({ title: title, text: title, url: fullUrl }, buildShareCapabilities());
    Promise.resolve(flow).then(
      function (result) { giveShareFeedback(result, fullUrl, liveRegion); },
      function () { giveShareFeedback({ method: 'manual' }, fullUrl, liveRegion); }
    );
  }

  /* ---------- §1: deep link on load — scroll, highlight, prime ---------- */

  /* A fresh navigation to an already-visited history entry for this exact
     URL (e.g. a bookmarked/re-shared deep link, or a manual reload) can
     have the browser's default `scrollRestoration: 'auto'` fight our own
     scrollIntoView() below with a stale saved position. This hands scroll
     control entirely to us for the current entry; feature-detected, no-op
     everywhere else. */
  function disableScrollRestoration() {
    try {
      if (window.history && 'scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
    } catch (err) { /* ignore */ }
  }

  /* Mix thumbnails and hero art are still loading when this file's init()
     typically runs (dynamically-inserted scripts execute as soon as they
     parse, which on this eager boot chain can be well before window 'load'
     -- see boot.js) -- an immediate scrollIntoView() targets the page's
     CURRENT (pre-images) layout height, and images finishing later shift
     everything below them down, leaving the actual target below the fold
     with no further correction. Deferring the real scroll to window 'load'
     (everything settled) fixes that; a short safety-net timeout guards
     against the rare case 'load' never fires. Synchronous when the
     document is already fully loaded (the common case once boot.js's eager
     chain has been running for even a moment, and always true under the
     node:vm test harness, which defaults readyState to 'complete') so
     existing synchronous-assertion tests are unaffected.

     Separately: `behavior:'smooth'` only actually lands on a visible,
     focused tab (see pageIsVisible() above) -- a shared link opened in the
     background must still land the reveal the instant it's viewed, not
     depend on an animation that a hidden tab may never run. */
  function scrollIntoViewWhenSettled(container) {
    function doScroll() {
      try {
        if (container.scrollIntoView) {
          var useSmooth = !prefersReducedMotion() && pageIsVisible();
          container.scrollIntoView({ behavior: useSmooth ? 'smooth' : 'auto', block: 'center' });
        }
      } catch (err) { /* ignore */ }
    }
    var doc = getDoc();
    var win = hasWindow() ? window : null;
    if (doc && doc.readyState !== 'complete' && win && typeof win.addEventListener === 'function') {
      var fired = false;
      var settle = function () {
        if (fired) return;
        fired = true;
        try { win.removeEventListener('load', settle); } catch (err) { /* ignore */ }
        doScroll();
      };
      try {
        win.addEventListener('load', settle);
        setTimeout(settle, 1200);
      } catch (err) {
        doScroll();
      }
    } else {
      doScroll();
    }
  }

  function highlightAndScrollTo(anchor) {
    var container = anchor;
    try { container = (anchor.closest && anchor.closest('.mix-card, .catalog-row')) || anchor; } catch (err) { container = anchor; }
    try { container.classList && container.classList.add(HIGHLIGHT_CLASS); } catch (err) { /* ignore */ }
    disableScrollRestoration();
    scrollIntoViewWhenSettled(container);
    return container;
  }

  function readAttr(el, name) {
    try { return (el && el.getAttribute && el.getAttribute(name)) || ''; } catch (err) { return ''; }
  }

  /* The generated markup puts the download filename on the card's own
     download anchor (lib/WebsitePageGenerator.cjs `downloadBtnHtml`), not
     on the play anchor — so read it from the surrounding card/row rather
     than re-deriving a naming convention this file does not own. Absent
     (an older page, a surface with no download button) the contract
     explicitly allows ''. */
  function readDownloadFilename(container) {
    try {
      var dl = container && container.querySelector ? container.querySelector('a[data-download]') : null;
      return readAttr(dl, 'data-filename');
    } catch (err) { return ''; }
  }

  function buildPrimePayload(anchor, container, t) {
    var hasTime = typeof t === 'number' && isFinite(t) && t > 0;
    return {
      title: readAttr(anchor, 'data-title') || 'this mix',
      artist: readAttr(anchor, 'data-artist'),
      img: readAttr(anchor, 'data-img'),
      href: readAttr(anchor, 'href'),
      filename: readDownloadFilename(container),
      startSec: hasTime ? t : 0,
      /* No "·" inside the label: the player bar already prefixes it with one
         after the artist name, so 'shared · from 1:35' rendered as
         "BAI-EE · shared · from 1:35" — two separators in five words. */
      label: hasTime ? ('shared from ' + formatShareTime(t)) : 'shared link',
      source: 'deep-link'
    };
  }

  /* Hands the shared link to the persistent player bar — the element that
     replaced this module's deleted banner. This does NOT start playback
     and does NOT load audio (see the transient-UI contract): it fills the
     bar's idle "Select a mix to play" slot so pressing the bar's own play
     button resumes at the shared timestamp. The bar itself decides whether
     to accept — it refuses while audio is already playing, so a listener
     who hit play before this module initialised never has the bar yanked
     out from under them.

     ⚠️ MUST be called from behind whenPlayerReady(), never at init time.
     `window.uePlayerBar` is defined by player.js, which boot.js loads
     LAZILY (requestIdleCallback, timeout 3500ms, or the first play-intent
     tap) and announces with a document-level `ue-player-ready`. This file
     is in boot.js's EAGER chain (player-core.js -> ue-host-pref.js ->
     ue-warm.js -> ue-links.js -> ue-resume.js), so at init the bar is
     reliably absent and priming there silently did nothing on every real
     page load — confirmed in a live browser, and the same bug ue-resume.js
     hit. window.UEPlayerCore, by contrast, IS eager and chained ahead of
     us, which is why target resolution and the highlight work at init.

     Every failure mode is the same quiet no-op: no `window.uePlayerBar`
     (a stripped page, or a player that never hydrates at all), no `prime`
     function, a `false` return, or a throw. The scroll + highlight have
     already done the real work; priming is the bonus. Returns whether the
     bar took it (used by tests; nothing in this file branches on it). */
  function primePlayerBarForDeepLink(anchor, container, t) {
    var bar = null;
    try { bar = hasWindow() ? window.uePlayerBar : null; } catch (err) { bar = null; }
    if (!bar || typeof bar.prime !== 'function') return false;
    try { return bar.prime(buildPrimePayload(anchor, container, t)) === true; } catch (err) { return false; }
  }

  function handleDeepLinkOnLoad(liveRegion) {
    var doc = getDoc();
    if (!doc) return;
    var query = parseDeepLinkQuery(getLocationSearch());
    if (!query.mix) return; /* missing/invalid mix -> nothing to do, silently */
    var anchor = findAnchorForTxid(query.mix);
    if (!anchor) return; /* unknown mix, or not on THIS page -> fail silently */

    /* Immediate: the reveal is the time-critical half and depends on
       nothing but the DOM that is already parsed. */
    var container = highlightAndScrollTo(anchor);
    /* The highlight is purely visual, so the announcement the deleted
       banner used to carry still has to be made — it is the only thing a
       screen-reader user gets. The live region is visually hidden and
       covers nothing. */
    var title = readAttr(anchor, 'data-title') || 'this mix';
    var artist = readAttr(anchor, 'data-artist');
    announce(liveRegion, artist ? ('Shared mix: ' + title + ' — ' + artist) : ('Shared mix: ' + title));

    /* Deferred, exactly once, no polling and no retry: the same one-shot
       ready hook the player-bar share button below already uses. If the
       player never hydrates the callback simply never runs — the reveal
       above stands on its own. A listener who taps play (which is itself
       what triggers hydration) is protected by the bar's own contract: it
       refuses to prime while audio is already playing. */
    whenPlayerReady(function () {
      primePlayerBarForDeepLink(anchor, container, query.t);
    });
  }

  /* ---------- §2: address bar mirrors real playback ---------- */

  function supportsReplaceState() {
    try { return !!(window.history && typeof window.history.replaceState === 'function'); } catch (err) { return false; }
  }

  function updateAddressBarForTxid(txid) {
    if (!supportsReplaceState() || !isValidTxid(txid)) return;
    var url = buildShareUrl({ pagePath: getLocationPathname(), search: getLocationSearch(), txid: txid });
    if (!url) return;
    try { window.history.replaceState(window.history.state || null, '', url); } catch (err) { /* ignore */ }
  }

  function whenPlayerReady(cb) {
    try {
      if (window.UEPlayer && window.UEPlayer.host) { cb(); return; }
    } catch (err) { /* ignore */ }
    try {
      var doc = getDoc();
      if (doc && doc.addEventListener) doc.addEventListener('ue-player-ready', function () { cb(); }, { once: true });
    } catch (err) { /* ignore */ }
  }

  function wirePlaybackHistorySync() {
    whenPlayerReady(function () {
      try {
        window.UEPlayer.host.on('playback', function (payload) {
          if (!payload || !payload.playing) return;
          var txid = payload.track ? safeExtractTxid(payload.track.url) : null;
          if (!txid) {
            try { txid = window.UEPlayer.host.getTxid(payload.index); } catch (err) { txid = null; }
          }
          if (txid) updateAddressBarForTxid(txid);
        });
      } catch (err) { /* ignore */ }
    });
  }

  /* ---------- §3: share buttons on mix cards / catalog rows ---------- */

  function wireOneCard(doc, card, liveRegion) {
    var actions = card.querySelector('.mix-card-actions, .catalog-row-actions');
    if (!actions || actions.getAttribute(WIRED_ATTR) === '1') return;
    var anchor = card.querySelector('a[data-playlist], a[data-link]');
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    var txid = safeExtractTxid(href);
    if (!isValidTxid(txid)) return;
    actions.setAttribute(WIRED_ATTR, '1');
    var title = anchor.getAttribute('data-title') || '';
    var artist = anchor.getAttribute('data-artist') || '';
    var btn = buildIconButton(doc, 'Share this mix');
    btn.className += ' ue-links-share-btn';
    btn.addEventListener('click', function onShareCardClick() {
      /* Everything the modal shows comes off the card's own generated markup
         (lib/WebsitePageGenerator.cjs playAnchorAttrs) — no lookup, no fetch.
         `data-page` is why the link points at the artist page: that is the
         page whose og: tags the unfurled preview will use. */
      if (openShareModal({
        txid: txid,
        title: title,
        artist: artist,
        img: readAttr(anchor, 'data-img'),
        video: readAttr(anchor, 'data-video'),
        audio: readAttr(anchor, 'href'),
        page: readAttr(anchor, 'data-page'),
        filename: readDownloadFilename(card),
        t: 0
      })) return;
      shareMix({ txid: txid, title: title, artist: artist, t: null }, liveRegion);
    });
    actions.appendChild(btn);
  }

  function injectMixSurfaceShareButtons(liveRegion) {
    var doc = getDoc();
    if (!doc) return;
    var cards;
    try { cards = doc.querySelectorAll('.mix-card, .catalog-row'); } catch (err) { return; }
    Array.prototype.forEach.call(cards || [], function (card) {
      try { wireOneCard(doc, card, liveRegion); } catch (err) { /* one bad card must not break the rest */ }
    });
  }

  /* ---------- §4: player-bar share (currently playing mix) ---------- */

  function currentTrackInfo() {
    try {
      if (!window.UEPlayer || !window.UEPlayer.host) return null;
      var track = window.UEPlayer.host.getCurrentTrack();
      if (!track) return null;
      var txid = window.UEPlayer.host.getTxid();
      if (!isValidTxid(txid)) return null;
      return { txid: txid, title: track.title || '', artist: track.artist || '' };
    } catch (err) { return null; }
  }

  function removePlayerBarPopover() {
    var doc = getDoc();
    if (!doc) return;
    try {
      var el = doc.getElementById(PLAYER_BAR_POPOVER_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (err) { /* ignore */ }
  }

  function wireOutsideDismiss(doc, panel, triggerBtn) {
    function onDocClick(evt) {
      var target = evt && evt.target;
      if (target === panel || target === triggerBtn || (panel.contains && panel.contains(target))) return;
      cleanup();
    }
    function onKeydown(evt) {
      if (evt && evt.key === 'Escape') cleanup();
    }
    function cleanup() {
      try { doc.removeEventListener('click', onDocClick, true); } catch (err) { /* ignore */ }
      try { doc.removeEventListener('keydown', onKeydown, true); } catch (err) { /* ignore */ }
      removePlayerBarPopover();
    }
    try {
      doc.addEventListener('click', onDocClick, true);
      doc.addEventListener('keydown', onKeydown, true);
    } catch (err) { /* ignore */ }
  }

  function onPlayerBarShareButtonClick(doc, btn, liveRegion) {
    var info = currentTrackInfo();
    if (!info) return;
    if (doc.getElementById(PLAYER_BAR_POPOVER_ID)) { removePlayerBarPopover(); return; }
    var currentTime = 0;
    try { currentTime = Math.floor(window.UEPlayer.host.getCurrentTime() || 0); } catch (err) { currentTime = 0; }

    /* The modal covers both of the popover's options in one surface: it carries
       a "Start at <time>" toggle, already checked, because sharing the drop is
       the whole reason to share mid-listen. The popover below stays as the
       fallback for an engine that has no <dialog>. */
    var playingAnchor = findAnchorForTxid(info.txid);
    if (openShareModal({
      txid: info.txid,
      title: info.title,
      artist: info.artist,
      img: readAttr(playingAnchor, 'data-img'),
      video: readAttr(playingAnchor, 'data-video'),
      audio: readAttr(playingAnchor, 'href'),
      page: readAttr(playingAnchor, 'data-page'),
      filename: info.artist ? (info.artist + ' - ' + info.title) : info.title,
      t: currentTime
    })) return;

    var panel = doc.createElement('div');
    panel.id = PLAYER_BAR_POPOVER_ID;
    panel.className = 'ue-links-popover';
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Share this mix');

    var copyBtn = doc.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'ue-links-popover-item';
    copyBtn.textContent = 'Copy link';
    copyBtn.addEventListener('click', function onCopyLinkClick() {
      removePlayerBarPopover();
      shareMix({ txid: info.txid, title: info.title, artist: info.artist, t: null }, liveRegion);
    });
    panel.appendChild(copyBtn);

    if (currentTime > 0) {
      var atTimeBtn = doc.createElement('button');
      atTimeBtn.type = 'button';
      atTimeBtn.className = 'ue-links-popover-item';
      var label = 'Copy link at ' + formatShareTime(currentTime);
      atTimeBtn.textContent = label;
      atTimeBtn.addEventListener('click', function onCopyAtTimeClick() {
        removePlayerBarPopover();
        shareMix({ txid: info.txid, title: info.title, artist: info.artist, t: currentTime }, liveRegion);
      });
      panel.appendChild(atTimeBtn);
    }

    if (btn.parentNode && btn.parentNode.appendChild) btn.parentNode.appendChild(panel);
    wireOutsideDismiss(doc, panel, btn);
  }

  function updatePlayerBarShareVisibility() {
    var doc = getDoc();
    if (!doc) return;
    var btn = doc.getElementById(PLAYER_BAR_SHARE_ID);
    if (!btn) return;
    btn.hidden = !currentTrackInfo();
  }

  function insertPlayerBarShareButton(liveRegion) {
    var doc = getDoc();
    if (!doc) return;
    if (doc.getElementById(PLAYER_BAR_SHARE_ID)) return;
    var host = doc.getElementById('player-bar-volume') || doc.getElementById('persistent-player-bar');
    if (!host || !host.appendChild) return;
    var btn = buildIconButton(doc, 'Share current mix');
    btn.id = PLAYER_BAR_SHARE_ID;
    btn.hidden = true; /* revealed once a track is actually active */
    btn.addEventListener('click', function onPlayerBarShareClick() {
      onPlayerBarShareButtonClick(doc, btn, liveRegion);
    });
    host.appendChild(btn);
  }

  function wirePlayerBarShare(liveRegion) {
    whenPlayerReady(function () {
      insertPlayerBarShareButton(liveRegion);
      try {
        window.UEPlayer.host.on('track', updatePlayerBarShareVisibility);
        window.UEPlayer.host.on('playback', updatePlayerBarShareVisibility);
      } catch (err) { /* ignore */ }
      updatePlayerBarShareVisibility();
    });
  }

  /* ---------- boot ---------- */

  function init() {
    var doc = getDoc();
    if (!doc) return;
    try {
      injectStyles();
      var liveRegion = ensureLiveRegion();
      handleDeepLinkOnLoad(liveRegion);
      wirePlaybackHistorySync();
      injectMixSurfaceShareButtons(liveRegion);
      wirePlayerBarShare(liveRegion);
    } catch (err) { /* progressive enhancement: never break the page */ }
  }

  function boot() {
    var doc = getDoc();
    if (!doc) return;
    if (doc.readyState === 'loading' && doc.addEventListener) {
      doc.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
  boot();

  /* ---------- exports ---------- */

  var UELinks = {
    version: 1,
    TXID_RE: TXID_RE,
    MAX_SHARE_TIME_SECONDS: MAX_SHARE_TIME_SECONDS,
    isValidTxid: isValidTxid,
    parseDeepLinkQuery: parseDeepLinkQuery,
    formatShareTime: formatShareTime,
    buildShareUrl: buildShareUrl,
    findMatchingIndex: findMatchingIndex,
    runShareFlow: runShareFlow,
    /* exposed for tests only (init() is idempotent — every DOM entry point
       above is guarded by an id/attribute check, so re-invoking it is
       always safe, exactly like the auto-boot above running once per real
       page load) */
    init: init
  };

  if (typeof module === 'object' && module.exports) { module.exports = UELinks; }
  if (typeof window !== 'undefined') { window.UELinks = UELinks; }

})();
