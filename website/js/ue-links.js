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
        playable track ON THIS PAGE, scroll it into view, highlight it, and
        show a small dismissible banner. Never autoplays. If `t` is present
        the banner offers an explicit "Play from mm:ss" button that starts
        playback through the real host bridge, gated on a user click.
     2. On real user-started playback, mirrors the now-playing track's txid
        into the address bar via history.replaceState (never a reload,
        never pushState spam).
     3. Injects small "share this mix" icon buttons into the existing
        `.mix-card-actions` / `.catalog-row-actions` rows, and into the
        persistent player bar for whatever is currently playing (with a
        "copy link at current time" option). Uses navigator.share when
        available, else clipboard, else execCommand('copy'), else a
        visible read-only input as a last resort.

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
  var BANNER_ID = 'ue-links-deep-link-banner';
  var HIGHLIGHT_CLASS = 'ue-links-deep-link-highlight';
  var PLAYER_BAR_SHARE_ID = 'ue-links-player-bar-share';
  var PLAYER_BAR_POPOVER_ID = 'ue-links-player-bar-popover';
  var MANUAL_COPY_PANEL_ID = 'ue-links-manual-copy-panel';
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
      '.ue-links-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.08);background:transparent;color:#b7aaa3;cursor:pointer;flex:none;padding:0;transition:color .2s ease,border-color .2s ease,background .2s ease,transform .2s ease}' +
      '.ue-links-icon-btn:hover,.ue-links-icon-btn:focus-visible{color:#fff;border-color:var(--accent-bright,#e01e2b);background:rgba(193,18,31,0.14)}' +
      '.ue-links-icon-btn:active{transform:scale(0.94)}' +
      '.ue-links-icon-btn[hidden]{display:none!important}' +
      '.ue-links-icon-svg{width:15px;height:15px;fill:currentColor}' +
      '#player-bar-volume{position:relative}' +
      '#ue-links-player-bar-share{margin-left:4px}' +
      '.ue-links-popover{position:absolute;bottom:calc(100% + 10px);right:0;min-width:190px;background:var(--bg-panel,#140d0d);border:1px solid var(--hairline-red,rgba(193,18,31,0.45));border-radius:10px;box-shadow:0 12px 30px rgba(0,0,0,0.5);padding:6px;display:flex;flex-direction:column;gap:2px;z-index:1100}' +
      '.ue-links-popover-item{display:block;width:100%;text-align:left;background:transparent;border:0;border-radius:6px;color:var(--text-primary,#f2ece4);font-family:inherit;font-size:12.5px;padding:8px 10px;cursor:pointer}' +
      '.ue-links-popover-item:hover,.ue-links-popover-item:focus-visible{background:rgba(193,18,31,0.16);color:#fff}' +
      '.ue-links-banner{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:1200;max-width:min(560px,calc(100vw - 32px));display:flex;align-items:center;gap:12px;background:rgba(20,13,13,0.96);border:1px solid var(--hairline-red,rgba(193,18,31,0.45));border-radius:10px;padding:10px 14px;color:var(--text-primary,#f2ece4);font-size:13px;box-shadow:0 14px 34px rgba(0,0,0,0.5)}' +
      '.ue-links-banner-text{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '.ue-links-banner-actions{display:flex;align-items:center;gap:8px;flex:none}' +
      '.ue-links-banner-play,.ue-links-banner-dismiss{border:1px solid rgba(255,255,255,0.08);background:transparent;color:var(--text-primary,#f2ece4);border-radius:999px;padding:6px 12px;font-size:12px;cursor:pointer;font-family:inherit}' +
      '.ue-links-banner-play{border-color:var(--accent-bright,#e01e2b);color:#fff;background:var(--accent,#c1121f)}' +
      '.ue-links-banner-play:hover{background:var(--accent-bright,#e01e2b)}' +
      '.ue-links-banner-dismiss:hover{border-color:var(--accent-bright,#e01e2b);color:#fff}' +
      '.ue-links-deep-link-highlight{outline:2px solid var(--accent-bright,#e01e2b);outline-offset:4px;border-radius:12px;animation:ue-links-highlight-pulse 1.8s ease-out 1}' +
      '@keyframes ue-links-highlight-pulse{0%{box-shadow:0 0 0 0 rgba(224,30,43,0.45)}100%{box-shadow:0 0 0 16px rgba(224,30,43,0)}}' +
      /* `top` (not `bottom`) on purpose: an inline style.top is set by
         showManualCopyPanel() right below, positioned to clear the sticky
         site nav (and any currently-shown deep-link banner) -- the same
         mechanism showDeepLinkBanner() uses for its own top offset. This
         panel used to be `bottom:100px`, which visually collided with
         ue-resume.js's own "Resume Listening" bar (confirmed: both are
         fixed, horizontally-centered, near-identical bottom offset -- see
         the integration contract's cross-module UI-collision review). The
         `top:14px` below is only a same-frame fallback in case the inline
         style is ever not applied for some reason. */
      '.ue-links-manual-copy-panel{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:1200;display:flex;gap:8px;align-items:center;background:rgba(20,13,13,0.97);border:1px solid var(--hairline-red,rgba(193,18,31,0.45));border-radius:10px;padding:8px 10px;max-width:min(90vw,420px)}' +
      '.ue-links-manual-copy-input{flex:1;min-width:0;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);border-radius:6px;color:var(--text-primary,#f2ece4);font-family:var(--font-mono,monospace);font-size:11.5px;padding:6px 8px}' +
      '.ue-links-manual-copy-close{border:0;background:transparent;color:#b7aaa3;cursor:pointer;font-size:12px;padding:4px 8px}' +
      '@media (max-width:480px){' +
      '.ue-links-banner{left:8px;right:8px;top:8px;transform:none;max-width:none;font-size:12px}' +
      '.ue-links-icon-btn{width:30px;height:30px}' +
      '.ue-links-popover{right:-4px;min-width:170px}' +
      '.ue-links-manual-copy-panel{left:8px;right:8px;transform:none;max-width:none}' +
      '}' +
      '@media (prefers-reduced-motion: reduce){' +
      '.ue-links-deep-link-highlight{animation:none}' +
      '.ue-links-icon-btn,.ue-links-popover-item,.ue-links-banner-play,.ue-links-banner-dismiss{transition:none}' +
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

  function removeManualCopyPanel() {
    var doc = getDoc();
    if (!doc) return;
    try {
      var el = doc.getElementById(MANUAL_COPY_PANEL_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (err) { /* ignore */ }
  }

  function showManualCopyPanel(url) {
    var doc = getDoc();
    if (!doc || !doc.body || !doc.createElement) return;
    removeManualCopyPanel();
    var panel = doc.createElement('div');
    panel.id = MANUAL_COPY_PANEL_ID;
    panel.className = 'ue-links-manual-copy-panel';
    try { panel.style.top = computeManualCopyPanelTop(doc) + 'px'; } catch (err) { /* ignore */ }
    var input = doc.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.value = url;
    input.className = 'ue-links-manual-copy-input';
    input.setAttribute('aria-label', 'Mix link');
    var closeBtn = doc.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ue-links-manual-copy-close';
    closeBtn.textContent = 'Close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.addEventListener('click', removeManualCopyPanel);
    panel.appendChild(input);
    panel.appendChild(closeBtn);
    doc.body.appendChild(panel);
    try { input.focus(); input.select(); } catch (err) { /* ignore */ }
  }

  function giveShareFeedback(result, url, liveRegion) {
    result = result || {};
    if (result.cancelled) return; /* user dismissed the native share sheet — not a failure */
    if (result.method === 'share') { announce(liveRegion, 'Shared.'); return; }
    if (result.method === 'clipboard' || result.method === 'execCommand') {
      announce(liveRegion, 'Link copied to clipboard.');
      return;
    }
    announce(liveRegion, 'Could not copy automatically. Link shown below.');
    showManualCopyPanel(url);
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

  /* ---------- §1: deep link on load — highlight + banner ---------- */

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
  }

  /* The ONLY place a feature module is allowed to start playback (per the
     integration contract): gated entirely behind a real click on the
     banner's "Play from" button. window.UEBoot.ensurePlayer() is called
     synchronously inside that click handler, exactly as the contract
     requires, and only when the player has not hydrated yet. */
  function startDeepLinkPlayback(txid, t) {
    function afterReady() {
      if (!window.UEPlayer || !window.UEPlayer.host) return;
      var idx = window.UEPlayer.host.findIndexByTxid(txid);
      if (idx === -1) return;
      window.UEPlayer.host.playIndexAt(idx, t);
    }
    if (window.UEBoot && typeof window.UEBoot.ensurePlayer === 'function') {
      window.UEBoot.ensurePlayer(afterReady);
    } else if (window.UEPlayer && window.UEPlayer.host) {
      afterReady();
    }
  }

  function buildDismissButton(doc, onDismiss) {
    var btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'ue-links-banner-dismiss';
    btn.setAttribute('aria-label', 'Dismiss');
    btn.textContent = 'Dismiss';
    btn.addEventListener('click', onDismiss);
    return btn;
  }

  var BANNER_DEFAULT_TOP = 14; /* matches the injected CSS's own `top:14px` --
    used whenever a live measurement of #site-header isn't available (missing
    element, no getBoundingClientRect under node:vm's fake DOM, or a
    measurement that comes back nonsensical) */
  var BANNER_NAV_GAP = 14;

  /* #site-header is a `position:sticky; top:0` nav (site.css, off-limits to
     edit here) whose height varies by breakpoint (72px desktop, 60px at
     <=1020px, auto-wrapping/taller at <=700px) — a single hardcoded offset
     would inevitably drift from one of those. Reading the real, current
     nav height instead keeps the banner clear of it at every width without
     duplicating site.css's breakpoints here. */
  function computeBannerTop(doc) {
    try {
      var header = doc.getElementById('site-header');
      if (header && typeof header.getBoundingClientRect === 'function') {
        var rect = header.getBoundingClientRect();
        if (rect && typeof rect.bottom === 'number' && isFinite(rect.bottom) && rect.bottom > 0) {
          return Math.round(rect.bottom) + BANNER_NAV_GAP;
        }
      }
    } catch (err) { /* fall through to the default */ }
    return BANNER_DEFAULT_TOP;
  }

  var MANUAL_COPY_PANEL_NAV_GAP = 10;

  /* The manual-copy fallback panel used to sit at a fixed `bottom:100px`,
     which visually collided with ue-resume.js's own bottom-anchored "Resume
     Listening" bar (both fixed, horizontally centered, near-identical
     offset from the bottom -- confirmed in a real browser). Anchoring from
     the top instead sidesteps every bottom-anchored surface (the persistent
     player bar AND the resume bar) entirely, reusing the same nav-clearance
     measurement the deep-link banner uses. The one thing this panel can
     still collide with is that SAME banner (both owned by this file), since
     a user can trigger a share fallback while a deep-link banner is still
     showing -- so this stacks below the banner's live position when one is
     present, rather than merely reusing its top offset. */
  function computeManualCopyPanelTop(doc) {
    var top = computeBannerTop(doc);
    try {
      var banner = doc.getElementById(BANNER_ID);
      if (banner && typeof banner.getBoundingClientRect === 'function') {
        var rect = banner.getBoundingClientRect();
        if (rect && typeof rect.bottom === 'number' && isFinite(rect.bottom) && rect.bottom > top) {
          return Math.round(rect.bottom) + MANUAL_COPY_PANEL_NAV_GAP;
        }
      }
    } catch (err) { /* fall through to the nav-clearance offset alone */ }
    return top;
  }

  function showDeepLinkBanner(doc, anchor, txid, t, liveRegion) {
    if (!doc.body || doc.getElementById(BANNER_ID)) return;
    var title = 'this mix';
    var artist = '';
    try { title = anchor.getAttribute('data-title') || 'this mix'; } catch (err) { /* keep default */ }
    try { artist = anchor.getAttribute('data-artist') || ''; } catch (err) { /* keep default */ }

    var banner = doc.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'ue-links-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Shared mix');

    var text = doc.createElement('span');
    text.className = 'ue-links-banner-text';
    text.textContent = artist ? ('Shared mix: ' + title + ' — ' + artist) : ('Shared mix: ' + title);
    banner.appendChild(text);

    var actions = doc.createElement('div');
    actions.className = 'ue-links-banner-actions';

    if (typeof t === 'number' && t > 0) {
      var playFromBtn = doc.createElement('button');
      playFromBtn.type = 'button';
      playFromBtn.className = 'ue-links-banner-play';
      var label = 'Play from ' + formatShareTime(t);
      playFromBtn.textContent = label;
      playFromBtn.setAttribute('aria-label', label);
      playFromBtn.addEventListener('click', function onPlayFromClick() {
        startDeepLinkPlayback(txid, t);
      });
      actions.appendChild(playFromBtn);
    }

    /* Clear the sticky site nav (site.css `#site-header`, z-index 900) --
       the CSS class's own `top:14px` would otherwise sit on top of it
       (confirmed: the banner visually covered nav links at that fixed
       offset). Set as an inline style so only `top` is overridden; every
       other property still comes from the injected `.ue-links-banner`
       class. Recomputed on resize/orientation-change (nav height changes
       across the site's own breakpoints) for as long as the banner is
       shown, and torn down when it is. */
    function positionBanner() { try { banner.style.top = computeBannerTop(doc) + 'px'; } catch (err) { /* ignore */ } }
    positionBanner();
    var win = hasWindow() ? window : null;
    var onResize = null;
    if (win && typeof win.addEventListener === 'function') {
      onResize = positionBanner;
      try { win.addEventListener('resize', onResize); } catch (err) { onResize = null; }
    }

    function removeBanner() {
      try { banner.parentNode && banner.parentNode.removeChild(banner); } catch (err) { /* ignore */ }
      if (onResize && win && typeof win.removeEventListener === 'function') {
        try { win.removeEventListener('resize', onResize); } catch (err) { /* ignore */ }
      }
    }
    actions.appendChild(buildDismissButton(doc, removeBanner));
    banner.appendChild(actions);

    doc.body.appendChild(banner);
    announce(liveRegion, text.textContent);
  }

  function handleDeepLinkOnLoad(liveRegion) {
    var doc = getDoc();
    if (!doc) return;
    var query = parseDeepLinkQuery(getLocationSearch());
    if (!query.mix) return; /* missing/invalid mix -> nothing to do, silently */
    var anchor = findAnchorForTxid(query.mix);
    if (!anchor) return; /* unknown mix, or not on THIS page -> fail silently */
    highlightAndScrollTo(anchor);
    showDeepLinkBanner(doc, anchor, query.mix, query.t, liveRegion);
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
