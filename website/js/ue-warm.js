/* ==========================================================================
   Underground Existence — ue-warm.js

   Gateway connection WARMING. This is the "make the first click fast"
   layer: it issues small, bounded, throwaway fetches to the two approved
   Range-capable gateways (website/js/player-core.js RANGE_HOSTS) so that by
   the time a listener actually presses play, the gateway has already
   fetched + cached the item's head instead of doing that work cold, on the
   user's own click.

   Measured 2026-09-08 (see the integration contract/task brief this file
   was built against): a cold bounded 64 KiB request against a live gateway
   took 2.08s-12.35s; the SAME request against an already-warm gateway took
   0.58s-0.61s. That gap is what this file buys back — moved off the click.

   THIS IS NOT A SECOND PLAYBACK SYSTEM. It never creates an <audio>/media
   element, never calls play(), never touches the queue or a track object,
   never mutates artists.json data. It only issues `fetch()` range requests
   and throws the bytes away. Every request is bounded to
   `Range: bytes=0-65535` (64 KiB) — NEVER open-ended, NEVER a whole file.
   That cap is the single most important invariant in this file: the same
   evidence run that justified this file also measured a single open-ended
   request downloading 98-105 MB. An unbounded "warm" would just be a
   silent, uninvited full download on someone's data plan.

   Candidate URLs always come from window.UEPlayerCore.buildCandidates() —
   the SAME policy the real player uses — so warming can never introduce a
   host the player itself would not use, and raw arweave.net (download-only,
   never Range-served for these bundled items — see MIX_AUDIO_SCRUBBING.md)
   is never a candidate by construction, never warmed. If UEPlayerCore is
   not on `window` when this file runs, every entry point below disables
   itself silently — there is nothing safe to warm without it.

   Two layers:
     1. A pure, unit-tested core (detectPageType, policyFor,
        selectInitialTargets, shouldWarmAtAll, buildWarmRequest,
        createWarmQueue) — no DOM, no network, no reliance on real timers;
        every external effect (`now`, `random`, `request`) is injected so
        the whole policy/scheduling surface is testable without a browser
        or live gateways. See tests/warm-policy.test.mjs and
        tests/warm-queue.test.mjs — those are the real specification this
        half of the file is built to.
     2. Thin browser-side glue (page scan, IntersectionObserver, intent
        listeners, runtime <link rel=preconnect> injection, teardown on
        pagehide/hidden, window.UEWarm.snapshot() for manual verification)
        that is deliberately NOT unit tested — it is a straightforward
        wiring of the pure core against a real DOM.

   Classic script (no ESM), `var`/`function` style, dual browser/CommonJS
   export tail — same pattern as player-core.js and ue-host-pref.js, so
   this file loads identically as a plain browser
   <script src="js/ue-warm.js"> and via node:vm in tests (see
   tests/helpers/load-ue-warm.mjs).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- small shared helpers ---------- */

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  /* Captured ONCE, at module-eval time — NOT re-read lazily on every call.
     On a real page, player-core.js loads via a <script> tag strictly before
     this one (exactly like ue-host-pref.js's own precondition), so
     window.UEPlayerCore is guaranteed present by the time this IIFE runs.
     The test harness (tests/helpers/load-ue-warm.mjs) mirrors that: it
     seeds a fake `window.UEPlayerCore` only for the duration of this file's
     own vm.runInThisContext() call, then restores the previous `window`
     immediately afterward — so a lazy `window.UEPlayerCore` lookup (as
     ue-host-pref.js's currentAllowlist() does, safely, because ITS callers
     all run later against a real, still-live browser `window`) would see
     nothing by the time the test suite calls selectInitialTargets()/etc.
     well after module load. Capturing here once is correct for both the
     real page and this harness. */
  var UEPlayerCoreRef = null;
  try {
    if (typeof window !== 'undefined' && window.UEPlayerCore) UEPlayerCoreRef = window.UEPlayerCore;
  } catch (err) { /* defensive; property access should not throw */ }

  function getPlayerCore() {
    return UEPlayerCoreRef;
  }

  /* UEHostPref, by contrast, is read lazily on every call — every actual
     call site for this is inside browser glue that only ever runs later
     (init(), on DOMContentLoaded or immediately-if-already-loaded, and
     event handlers registered from there), by which point every <script>
     tag on the real page has already executed regardless of relative
     order against ue-host-pref.js. Lazy here is strictly more robust than
     capturing at load time, and — unlike UEPlayerCore above — nothing in
     the unit-tested pure core depends on it. */
  function getHostPref() {
    try {
      if (typeof window !== 'undefined' && window.UEHostPref) return window.UEHostPref;
    } catch (err) { /* defensive */ }
    return null;
  }

  /* ---------- host-unhealthy suppression (session-scoped) ----------
     Warming-contract Fix 4. Ordering rule: player.js's own verified-
     failover verdict (a candidate actually proven unhealthy against a
     REAL playback attempt, via player-core.js's health tracking) is
     ground truth and must always beat an unrelated warm fetch's later,
     much weaker signal — "a 64 KiB range request against this host
     answered 206 for some OTHER txid". Once player.js calls
     window.UEWarm.markHostUnhealthy(host) (see clearHostPrefIfDead() in
     player.js), THIS session's makeRealRequest() below will never call
     UEHostPref.write(host) again, no matter how many subsequent warm
     fetches against that host succeed — only player.js's own ground-truth
     UEHostPref.clear() call un-poisons a preference; a warm 206 must never
     resurrect one player.js just proved dead. In-memory only, for the
     session — matches the rest of this file's no-persistence posture for
     anything that isn't the versioned UEHostPref hint itself. Exported
     directly on UEWarm (not gated behind init()) since it has no
     dependency on the queue/DOM and player.js may legitimately call it at
     any time. */
  var unhealthyHosts = {};
  function markHostUnhealthy(host) {
    if (typeof host === 'string' && host) unhealthyHosts[host] = true;
  }
  function isHostUnhealthy(host) {
    return typeof host === 'string' && hasOwn(unhealthyHosts, host);
  }

  /* ---------- 1. page detection ---------- */

  /* Every value here is an EXISTING data-section marker already emitted by
     the generator (website/templates/*) for every current and future page
     of that type — no artist names, no filenames, no data-queue-idx (that
     attribute is assigned later by player.js and warming runs before it).
     Order matters only in that a doc could theoretically carry more than
     one marker (it never does on real pages); first match wins. */
  function detectPageType(doc) {
    if (!doc || typeof doc.querySelector !== 'function') return 'unknown';
    if (doc.querySelector('[data-section="featured-hero"]')) return 'home';
    if (doc.querySelector('[data-section="artist-mixes"]')) return 'artist';
    if (doc.querySelector('[data-section="archive-catalog"]')) return 'archive';
    if (doc.querySelector('[data-section="residents-directory"]')) return 'selectors';
    if (doc.querySelector('[data-section="about-content"]')) return 'about';
    return 'unknown';
  }

  /* Declarative, page-type-keyed warming policy — verbatim from the
     integration contract. `limit: 0` means uncapped. */
  var BASE_POLICY = {
    home: { mode: 'list', limit: 5 },
    artist: { mode: 'list', limit: 0 },
    archive: { mode: 'viewport', limit: 0 },
    selectors: { mode: 'none', limit: 0 },
    about: { mode: 'none', limit: 0 },
    unknown: { mode: 'none', limit: 0 }
  };

  var VALID_OVERRIDE_MODES = { list: true, viewport: true, none: true };

  /* A `data-warm-policy="list|viewport|none"` override on any [data-section]
     element replaces the derived MODE for that page. It only names a mode,
     not a limit, so an override is always treated as uncapped (limit 0)
     rather than inheriting the derived page-type's numeric cap — there is
     no way for the override attribute to express "list, but capped at 5",
     and silently reusing the home-page cap for an unrelated override would
     be a worse guess than "uncapped". An unrecognized override value is
     ignored outright and the derived policy stands unchanged. */
  function policyFor(pageType, overrideAttr) {
    var base = hasOwn(BASE_POLICY, pageType) ? BASE_POLICY[pageType] : BASE_POLICY.unknown;
    if (typeof overrideAttr === 'string' && hasOwn(VALID_OVERRIDE_MODES, overrideAttr)) {
      return { mode: overrideAttr, limit: 0 };
    }
    return { mode: base.mode, limit: base.limit };
  }

  /* ---------- 2. target selection ---------- */

  /* Reads an attribute off either a REAL DOM/fake-dom element (which has
     el.attrs and/or el.getAttribute) or a bare {tag, attrs} fixture object
     (which has only el.attrs, no methods at all — see tests/warm-
     policy.test.mjs's `anchor()` helper, used both as raw fixture data fed
     through makeFakeDoc AND, in one deliberate test, passed straight into
     selectInitialTargets un-wrapped). Checking `.attrs` first, THEN falling
     back to `.getAttribute`, makes this work identically against both
     shapes plus a real browser <a> element (which has getAttribute but no
     .attrs) — the browser glue below hands real anchors straight into
     selectInitialTargets with no adapter needed. */
  function readAttr(el, name) {
    if (!el) return null;
    if (el.attrs && hasOwn(el.attrs, name)) return el.attrs[name];
    if (typeof el.getAttribute === 'function') {
      var v = el.getAttribute(name);
      return v === undefined ? null : v;
    }
    return null;
  }

  function hasAttr(el, name) {
    var v = readAttr(el, name);
    return v !== null && v !== undefined;
  }

  function isExcludedAnchor(el) {
    return readAttr(el, 'data-unplayable') === 'true';
  }

  function toArray(anchors) {
    if (!anchors) return [];
    if (Array.isArray(anchors)) return anchors;
    if (typeof anchors.length === 'number') {
      var out = [];
      for (var i = 0; i < anchors.length; i++) out.push(anchors[i]);
      return out;
    }
    return [];
  }

  /* Moves the (first, if somehow more than one) anchor carrying
     data-featured-mix to the front, preserving the relative order of every
     other anchor — same stable-reorder idiom as ue-host-pref.js's
     orderCandidates(). Featured-first is asserted regardless of the
     featured anchor's actual DOM position, so this must not rely on it
     merely happening to be emitted first (it does on the real homepage,
     but the policy test deliberately scrambles the order to prove this). */
  function promoteFeaturedFirst(list) {
    var featuredIdx = -1;
    for (var i = 0; i < list.length; i++) {
      if (hasAttr(list[i], 'data-featured-mix')) { featuredIdx = i; break; }
    }
    if (featuredIdx <= 0) return list.slice();
    var featured = list[featuredIdx];
    var rest = list.slice(0, featuredIdx).concat(list.slice(featuredIdx + 1));
    rest.unshift(featured);
    return rest;
  }

  /* mode:'list' -> ordered, deduped-by-txid, capped selection (0 = no cap).
     mode:'viewport'/'none' -> [] here, always — viewport population is an
     IntersectionObserver's job (browser glue below, not this pure
     function) and 'none' warms nothing at load by definition. Defensive on
     purpose: returns [] even when handed non-empty anchors under those
     modes, so browser glue can call this uniformly without switching on
     mode itself first. */
  function selectInitialTargets(anchors, policy) {
    var list = toArray(anchors);
    if (!policy || policy.mode !== 'list') return [];
    var core = getPlayerCore();
    if (!core || typeof core.extractTxid !== 'function') return [];

    var ordered = promoteFeaturedFirst(list);
    var limit = typeof policy.limit === 'number' ? policy.limit : 0;
    var seen = {};
    var out = [];

    for (var i = 0; i < ordered.length; i++) {
      if (limit > 0 && out.length >= limit) break;
      var el = ordered[i];
      if (isExcludedAnchor(el)) continue;
      var href = readAttr(el, 'href');
      if (!href || typeof href !== 'string') continue;
      var txid = core.extractTxid(href);
      if (!txid) continue;
      if (hasOwn(seen, txid)) continue;
      seen[txid] = true;
      out.push({ txid: txid, url: href });
    }
    return out;
  }

  /* ---------- 3. reduced-data gate ---------- */

  var REDUCED_EFFECTIVE_TYPES = { 'slow-2g': true, '2g': true, '3g': true };

  /* `connectionInfo` is whatever shape navigator.connection has (or
     undefined/null if the Network Information API is unsupported — treated
     as "assume a normal connection", not as a reason to disable warming).
     saveData wins outright; effectiveType is only consulted if saveData is
     not explicitly true. */
  function shouldWarmAtAll(connectionInfo) {
    if (!connectionInfo) return true;
    if (connectionInfo.saveData === true) return false;
    if (connectionInfo.effectiveType && hasOwn(REDUCED_EFFECTIVE_TYPES, connectionInfo.effectiveType)) {
      return false;
    }
    return true;
  }

  /* ---------- 4. request shape (THE critical invariant) ---------- */

  var WARM_RANGE = 'bytes=0-65535'; /* 64 KiB — never open-ended, never a whole file */

  function buildWarmRequest(url) {
    return { url: url, method: 'GET', headers: { Range: WARM_RANGE } };
  }

  /* ---------- AbortController, with a defensive fallback ---------- */

  /* Node 24 and every modern browser have a global AbortController, so this
     branch is not expected to ever run in practice — kept only so a
     genuinely ancient/unusual host degrades to "warming silently does
     nothing useful" instead of throwing and taking the page down with it. */
  function makeAbortController() {
    if (typeof AbortController === 'function') return new AbortController();
    var listeners = [];
    var signal = {
      aborted: false,
      addEventListener: function (type, fn) { if (type === 'abort') listeners.push(fn); },
      removeEventListener: function () {}
    };
    return {
      signal: signal,
      abort: function () {
        if (signal.aborted) return;
        signal.aborted = true;
        for (var i = 0; i < listeners.length; i++) {
          try { listeners[i](); } catch (err) { /* a broken listener must not break abort */ }
        }
      }
    };
  }

  /* ---------- 5. warm queue ---------- */

  /* createWarmQueue({concurrency, spacingMs, jitterMs, now, random,
     request}) -> {enqueue, prioritize, stats, abortAll}

     Pure with respect to the outside world: it never touches the DOM,
     never calls fetch/localStorage itself, and the only "impure" calls it
     makes are the INJECTED `now`/`random`/`request`. Real scheduling still
     goes through the global `setTimeout` (not an injected timer) — the
     test suite drives this deliberately via node:test's built-in
     `t.mock.timers`, so there is nothing to inject there; see this file's
     header and tests/warm-queue.test.mjs's own header comment for why.

     Per-txid candidate fallback lives HERE: `enqueue(txid, urls, ...)`
     takes urls in priority order (already ordered by
     UEHostPref.orderCandidates() by the caller — this queue does not know
     or care about host preference, only about trying urls[0] then, on
     failure, urls[1], then giving up). Only ONE candidate is ever in
     flight per txid at a time — warming both simultaneously on success
     would double load on public gateways for a mix that only needed one
     confirmed-warm host. */
  function createWarmQueue(options) {
    options = options || {};
    var concurrency = typeof options.concurrency === 'number' ? options.concurrency : 2;
    var spacingMs = typeof options.spacingMs === 'number' ? options.spacingMs : 150;
    var jitterMs = typeof options.jitterMs === 'number' ? options.jitterMs : 250;
    var randomFn = typeof options.random === 'function' ? options.random : Math.random;
    var nowFn = typeof options.now === 'function' ? options.now : Date.now;
    var requestFn = typeof options.request === 'function'
      ? options.request
      : function () { return Promise.reject(new Error('ue-warm: no request() function provided')); };

    var entries = {};      /* txid -> entry */
    var states = {};       /* txid -> 'pending'|'inflight'|'warm'|'failed' */
    var pendingQueue = []; /* entry refs, in start order */
    var activeCount = 0;
    var spacingLocked = false;

    /* Two independent gates on pump() starting NEW work — kept as two
       separate booleans, not one, because their owners (Fix 2's playback
       coordination and Fix 5's tab-visibility suspension) can legitimately
       overlap (e.g. a listener backgrounds the tab in the same instant a
       track is starting) and must not be able to clobber each other: each
       side only ever sets/clears its OWN flag. */
    var pausedForPlayback = false;   /* Fix 2 -- notifyPlaybackStarting/Settled */
    var suspendedForVisibility = false; /* Fix 5 -- tab backgrounded */

    function setState(entry, next) {
      entry.state = next;
      states[entry.txid] = next;
    }

    function removeFromPending(txid) {
      for (var i = 0; i < pendingQueue.length; i++) {
        if (pendingQueue[i].txid === txid) { pendingQueue.splice(i, 1); return; }
      }
    }

    function lockSpacing() {
      spacingLocked = true;
      var delay = spacingMs + jitterMs * randomFn();
      setTimeout(function () {
        spacingLocked = false;
        pump();
      }, delay);
    }

    function pump() {
      if (pausedForPlayback || suspendedForVisibility) return;
      if (spacingLocked) return;
      if (activeCount >= concurrency) return;
      if (!pendingQueue.length) return;
      var entry = pendingQueue.shift();
      startEntry(entry);
    }

    function startEntry(entry) {
      setState(entry, 'inflight');
      activeCount += 1;
      entry.startedAt = nowFn();
      lockSpacing();
      attemptEntry(entry);
    }

    function attemptEntry(entry) {
      if (entry.attemptIdx >= entry.urls.length) {
        finishFailed(entry);
        return;
      }
      var url = entry.urls[entry.attemptIdx];
      var descriptor = buildWarmRequest(url);
      var controller = makeAbortController();
      entry.controller = controller;

      var result;
      try {
        result = requestFn(descriptor, controller.signal);
      } catch (err) {
        result = Promise.reject(err);
      }
      Promise.resolve(result).then(
        function (value) { onAttemptSuccess(entry, value); },
        function (err) { onAttemptFailure(entry, err); }
      );
    }

    function onAttemptSuccess(entry, value) {
      if (entry.aborted) return;
      setState(entry, 'warm');
      activeCount -= 1;
      pump();
    }

    function onAttemptFailure(entry, err) {
      if (entry.aborted) return;
      entry.attemptIdx += 1;
      if (entry.attemptIdx < entry.urls.length) {
        /* Try the next candidate immediately — this is a fallback for the
           SAME logical warm attempt, not a new queue item, so it keeps the
           concurrency slot it already holds rather than releasing it back
           to pump() and re-competing for a spacing-gated start. */
        attemptEntry(entry);
        return;
      }
      finishFailed(entry);
    }

    function finishFailed(entry) {
      if (entry.aborted) return;
      setState(entry, 'failed');
      activeCount -= 1;
      pump();
    }

    /* enqueue(txid, urls, {priority}) — a txid already known (pending,
       inflight, warm, OR failed) is a no-op except that {priority:true}
       will still move an existing PENDING entry to the front (delegated to
       prioritize(), which already no-ops for every other state). A `failed`
       txid is deliberately never revived by a plain re-enqueue — that is
       the "not retried automatically" rule; a genuinely fresh attempt would
       need a new queue instance (e.g. a new page load). */
    function enqueue(txid, urls, opts) {
      opts = opts || {};
      if (typeof txid !== 'string' || !txid) return;
      if (hasOwn(entries, txid)) {
        if (opts.priority) prioritize(txid);
        return;
      }
      var entry = {
        txid: txid,
        urls: Array.isArray(urls) ? urls.slice() : [],
        attemptIdx: 0,
        state: 'pending',
        aborted: false,
        controller: null,
        startedAt: null
      };
      entries[txid] = entry;
      states[txid] = 'pending';
      if (opts.priority) pendingQueue.unshift(entry); else pendingQueue.push(entry);
      pump();
    }

    /* Moves a still-pending txid to the front of the start order. A no-op
       for a txid never enqueued (nothing to prioritize — the signature
       carries no urls, so there is nothing requestable) and for a txid
       already inflight/warm/failed (already started or already resolved;
       jumping it to a queue it is no longer waiting in would do nothing
       observable and risks double-booking bookkeeping). */
    function prioritize(txid) {
      var entry = entries[txid];
      if (!entry || entry.state !== 'pending') return;
      removeFromPending(txid);
      pendingQueue.unshift(entry);
      pump();
    }

    /* cancel(txid) -- warming-contract Fix 2. Called when the REAL player
       commits to loading this exact txid: any warm work for it is now
       pure waste, competing for bandwidth with the load that actually
       matters. Unlike abortAll()/suspend() below, this must NOT record the
       txid as `failed` -- it was deliberately stood down, not a genuine
       gateway failure, and must remain eligible for a later warm (e.g. the
       listener navigates back to a list page that would enqueue it again).
       So instead of marking a terminal state, this DELETES all tracking
       for the txid outright, making it "never seen" again to a future
       enqueue()/prioritize() call. A `pending` entry is simply dropped
       from the start queue. An `inflight` entry has its request aborted
       (entry.aborted=true silences the old attempt's async
       resolve/reject -- see onAttemptSuccess/onAttemptFailure's own guard
       -- permanently; the entry object is discarded, not reused) and its
       concurrency slot freed via pump(). A `warm` or `failed` txid has
       nothing in flight to cancel and is left exactly as-is: a confirmed-
       warm gateway does not stop being warm just because playback also
       started, and a `failed` entry already carries its own "not retried"
       invariant that this function has no business touching. */
    function cancel(txid) {
      if (typeof txid !== 'string' || !txid) return;
      var entry = entries[txid];
      if (!entry) return;
      if (entry.state === 'pending') {
        removeFromPending(txid);
        delete entries[txid];
        delete states[txid];
      } else if (entry.state === 'inflight') {
        entry.aborted = true;
        if (entry.controller && typeof entry.controller.abort === 'function') entry.controller.abort();
        activeCount -= 1;
        delete entries[txid];
        delete states[txid];
        pump();
      }
    }

    /* pause()/resume() -- warming-contract Fix 2. Stand the WHOLE queue
       down from starting any NEW work (does not touch anything already
       in flight for a DIFFERENT txid -- only the specific txid the real
       player is loading is cancel()'d above) for the critical window
       around a track actually starting to play. resume() is idempotent
       and safe to call even if never paused. */
    function pause() { pausedForPlayback = true; }
    function resume() { pausedForPlayback = false; pump(); }

    /* suspend()/unsuspend() -- warming-contract Fix 5. A backgrounded tab
       (visibilitychange -> hidden) is a much weaker, much more common
       signal than pagehide/real navigation-away, so it must not pay the
       same permanent "failed, never retried" price abortAll() imposes.
       suspend() stops new starts (same pump() gate as pause() above, via
       its OWN flag so the two can never clobber each other) AND aborts
       every currently-`inflight` request (stop spending a background
       tab's data) -- but instead of marking those txids `failed`, it
       replaces each aborted entry with a FRESH `pending` entry carrying
       the same txid/urls/attemptIdx (so a partially-attempted candidate
       resumes on the SAME candidate, not from scratch) and re-inserts
       them at the FRONT of the start queue, preserving their relative
       order. The old entry objects are discarded with `aborted` left
       `true` forever, so their eventual (irrelevant) async
       resolve/reject is a guaranteed no-op against the NEW entries now
       tracked under the same txid -- exactly the same "old entry object,
       new tracked entry" pattern cancel() uses above, for the same
       reason. unsuspend() (foreground again) simply lifts the gate and
       lets pump() carry on from where suspend() left it. */
    function suspend() {
      if (suspendedForVisibility) return; /* idempotent */
      suspendedForVisibility = true;
      var keys = Object.keys(entries);
      var revived = [];
      for (var i = 0; i < keys.length; i++) {
        var txid = keys[i];
        var entry = entries[txid];
        if (entry.state !== 'inflight') continue;
        entry.aborted = true;
        if (entry.controller && typeof entry.controller.abort === 'function') entry.controller.abort();
        activeCount -= 1;
        var fresh = {
          txid: txid,
          urls: entry.urls.slice(),
          attemptIdx: entry.attemptIdx,
          state: 'pending',
          aborted: false,
          controller: null,
          startedAt: null
        };
        entries[txid] = fresh;
        setState(fresh, 'pending');
        revived.push(fresh);
      }
      pendingQueue = revived.concat(pendingQueue);
    }
    function unsuspend() {
      suspendedForVisibility = false;
      pump();
    }

    function stats() {
      var pendingCount = 0, inflightCount = 0, warmCount = 0, failedCount = 0;
      var statesCopy = {};
      var keys = Object.keys(states);
      for (var i = 0; i < keys.length; i++) {
        var s = states[keys[i]];
        statesCopy[keys[i]] = s;
        if (s === 'pending') pendingCount += 1;
        else if (s === 'inflight') inflightCount += 1;
        else if (s === 'warm') warmCount += 1;
        else if (s === 'failed') failedCount += 1;
      }
      return { pending: pendingCount, inflight: inflightCount, warm: warmCount, failed: failedCount, states: statesCopy };
    }

    /* Kills everything synchronously (a page navigating away must see
       "nothing running" without waiting on the network): aborts every
       in-flight request's controller, drops every not-yet-started entry
       from the start queue, and marks both as `failed` so a stray late
       resolve/reject from an aborted attempt (guarded by entry.aborted
       above) can never resurrect state after the fact. Already-`warm`
       entries are left alone — a confirmed-warm gateway does not stop
       being warm just because the tab was hidden. Does NOT block future
       enqueue() calls on this same queue instance; nothing in this phase
       needs that, and the browser glue below only ever aborts the queue as
       part of pagehide/hidden teardown, not as a global kill switch. */
    function abortAll() {
      var keys = Object.keys(entries);
      for (var i = 0; i < keys.length; i++) {
        var entry = entries[keys[i]];
        if (entry.state !== 'pending' && entry.state !== 'inflight') continue;
        entry.aborted = true;
        if (entry.state === 'inflight' && entry.controller && typeof entry.controller.abort === 'function') {
          entry.controller.abort();
        }
        setState(entry, 'failed');
      }
      pendingQueue = [];
      activeCount = 0;
      spacingLocked = false;
    }

    return {
      enqueue: enqueue,
      prioritize: prioritize,
      stats: stats,
      abortAll: abortAll,
      cancel: cancel,
      pause: pause,
      resume: resume,
      suspend: suspend,
      unsuspend: unsuspend
    };
  }

  /* ==========================================================================
     Below this line: browser-side glue. Thin, deliberately not unit tested —
     straightforward wiring of the pure core above against a real DOM. Every
     function here is guarded so a missing UEPlayerCore, a missing
     IntersectionObserver, or a missing `document` degrades to "warming does
     nothing" rather than throwing.
     ========================================================================== */

  var REQUEST_TIMEOUT_MS = 20000; /* per-request cap; cold gateways measured 0.9-12.7s typical, one 24.98s worst observation */
  var PRECONNECT_MARK = 'data-ue-warm-preconnect';
  var PLAYABLE_SELECTOR = 'a[data-playlist], a[data-link]';
  var ROW_SELECTOR = '.mix-card, .catalog-row';

  function hostForUrl(url) {
    var core = getPlayerCore();
    if (!core || !Array.isArray(core.RANGE_HOSTS) || typeof url !== 'string') return null;
    for (var i = 0; i < core.RANGE_HOSTS.length; i++) {
      if (url.indexOf(core.RANGE_HOSTS[i]) === 0) return core.RANGE_HOSTS[i];
    }
    return null;
  }

  /* Best-effort: pull the response body off the wire only far enough to
     confirm the gateway answered (status check already happened by the time
     this runs), then stop receiving bytes immediately. cancel() over
     consuming the stream (arrayBuffer()/blob()/text()) is deliberate — this
     is the code-level enforcement of the 64 KiB cap described at the top of
     this file: reading the body to completion would pull however many bytes
     the gateway decided to send beyond the Range boundary (or, on a
     misbehaving host that ignores Range, the ENTIRE file) into memory for
     literally no purpose, since warming never uses the bytes. A rejected
     cancel() (e.g. a body that is already locked/used) is swallowed —
     cleanup failing must never turn a confirmed-warm gateway into a
     reported warm failure. */
  function discardBody(response) {
    try {
      if (response && response.body && typeof response.body.cancel === 'function') {
        var p = response.body.cancel();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      }
    } catch (err) { /* best-effort cleanup only */ }
  }

  /* The concrete `request(descriptor, signal)` the real page hands to
     createWarmQueue. Layers the 20s per-request timeout on top of the
     queue's own AbortSignal (either one aborting must abort the fetch), and
     — on a confirmed 206 — remembers the working gateway via
     UEHostPref.write() so the next txid (or the next tab load) tries it
     first. This is deliberately NOT inside createWarmQueue: that function
     is the pure, injected-request core exercised by tests/warm-
     queue.test.mjs with a fake `request`, and localStorage/host-preference
     writes have no business inside a pure, DOM-free module. */
  function makeRealRequest() {
    return function ueWarmRequest(descriptor, queueSignal) {
      if (typeof fetch !== 'function') return Promise.reject(new Error('ue-warm: fetch unavailable'));

      var localController = makeAbortController();
      var timedOut = false;
      var timeoutId = setTimeout(function () {
        timedOut = true;
        localController.abort();
      }, REQUEST_TIMEOUT_MS);

      if (queueSignal) {
        if (queueSignal.aborted) localController.abort();
        else if (typeof queueSignal.addEventListener === 'function') {
          queueSignal.addEventListener('abort', function () { localController.abort(); });
        }
      }

      return fetch(descriptor.url, {
        method: descriptor.method,
        headers: descriptor.headers,
        signal: localController.signal,
        credentials: 'omit' /* no cookies, ever — matches the contract's "no cookies, no tracking" rule */
      }).then(function (response) {
        clearTimeout(timeoutId);
        if (!response || response.status !== 206) {
          discardBody(response);
          throw new Error('ue-warm: non-206 response' + (response ? ' (' + response.status + ')' : ''));
        }
        try {
          var hostPref = getHostPref();
          var host = hostForUrl(descriptor.url);
          /* Fix 4: never write back a host player.js has already proven
             unhealthy this session -- see markHostUnhealthy()'s header
             comment above for the ordering rule (player.js's verdict wins). */
          if (hostPref && host && !isHostUnhealthy(host)) hostPref.write(host);
        } catch (err) { /* a broken preference write must never fail a successful warm */ }
        discardBody(response);
        return response;
      }, function (err) {
        clearTimeout(timeoutId);
        throw timedOut ? new Error('ue-warm: request timed out after ' + REQUEST_TIMEOUT_MS + 'ms') : err;
      });
    };
  }

  function collectAnchors(doc) {
    var found = doc.querySelectorAll(PLAYABLE_SELECTOR);
    return toArray(found);
  }

  function rowForAnchor(anchorEl) {
    return anchorEl.closest ? anchorEl.closest(ROW_SELECTOR) : null;
  }

  /* Builds the ordered candidate URL list for one anchor href: the SAME
     policy the player uses (UEPlayerCore.buildCandidates — never raw
     arweave.net), reordered by the returning-visitor gateway hint
     (UEHostPref) exactly like player.js is expected to at play time. This
     is a hint only — orderCandidates() only reorders, it never drops a
     candidate, so a stale/dead preferred host costs at most one failed
     attempt (handled by the per-txid fallback in createWarmQueue above). */
  function candidatesForHref(href) {
    var core = getPlayerCore();
    if (!core || typeof core.buildCandidates !== 'function') return [];
    var built = core.buildCandidates(href);
    var pref = getHostPref();
    if (pref) {
      var preferredHost = null;
      try { preferredHost = pref.read(); } catch (err) { preferredHost = null; }
      if (typeof pref.orderCandidates === 'function') built = pref.orderCandidates(built, preferredHost);
    }
    var urls = [];
    for (var i = 0; i < built.length; i++) urls.push(built[i].url);
    return urls;
  }

  function queueStateFor(queue, txid) {
    return queue.stats().states[txid]; /* undefined when never enqueued */
  }

  /* Shared by viewport reveal AND explicit intent — see the per-txid state
     rule spelled out for both call sites: warm/inflight -> do nothing;
     already queued (pending) -> prioritize(); never seen -> enqueue(),
     optionally at the front. `priority` is true for explicit user intent
     (jump the queue) and false for ordinary viewport reveal (join the back,
     "newly revealed rows queue as scrolling continues"). */
  function warmAnchor(anchorEl, queue, priority) {
    if (!anchorEl) return;
    if (isExcludedAnchor(anchorEl)) return;
    var core = getPlayerCore();
    if (!core || typeof core.extractTxid !== 'function') return;
    var href = readAttr(anchorEl, 'href');
    if (!href) return;
    var txid = core.extractTxid(href);
    if (!txid) return;

    var state = queueStateFor(queue, txid);
    if (state === 'warm' || state === 'inflight') return;
    if (state === 'pending') { queue.prioritize(txid); return; }
    queue.enqueue(txid, candidatesForHref(href), priority ? { priority: true } : undefined);
  }

  function setupViewportWarming(doc, anchors, queue) {
    if (typeof IntersectionObserver !== 'function') return null;
    var observer = new IntersectionObserver(function (observed) {
      for (var i = 0; i < observed.length; i++) {
        if (!observed[i].isIntersecting) continue;
        observer.unobserve(observed[i].target);
        var target = observed[i].target;
        var anchorEl = target.matches && target.matches(PLAYABLE_SELECTOR)
          ? target
          : (target.querySelector ? target.querySelector(PLAYABLE_SELECTOR) : null);
        warmAnchor(anchorEl, queue, false);
      }
    }, { rootMargin: '400px 0px' });

    for (var i = 0; i < anchors.length; i++) {
      observer.observe(rowForAnchor(anchors[i]) || anchors[i]);
    }
    return observer;
  }

  /* Explicit intent (hover/focus/touch/pointerdown/click) always jumps its
     txid to the front, on ANY page type — including mode:'none' pages
     (about/residents/unknown) and, critically, pages in viewport mode where
     the target row has never intersected the viewport (a deep archive.html
     row a visitor hovers without ever having scrolled past it). Since that
     txid was never enqueued, prioritize() alone would be a no-op — the fix
     is that warmAnchor() above always falls through to enqueue(...,
     {priority:true}) for a never-seen txid, regardless of page policy. The
     ONLY gate on intent warming AT SETUP is shouldWarmAtAll() (reduced-
     data), checked once at init and passed in as `intentAllowed` — this is
     unaffected by Fix 3's later live connection re-check (see init()
     below), which only ever pauses/resumes LIST/VIEWPORT warming; per the
     contract's reduced-data row ("intent-only, no list/viewport warming"),
     explicit intent that was allowed at setup keeps working for the rest
     of the session even if the connection degrades afterward. player.js
     owns NO listeners of its own for this — this is the ONE, single set of
     delegated document-level intent listeners for the whole page (see
     player.js's UEWarm.prioritize()/notifyPlaybackStarting() comments for
     why the two files divide the work this way). */
  function setupIntentWarming(doc, queue, intentAllowed) {
    if (!intentAllowed) return;

    function resolveAnchorFromTarget(target) {
      if (!target || !target.closest) return null;
      var anchorEl = target.closest(PLAYABLE_SELECTOR);
      if (anchorEl) return anchorEl;
      var row = target.closest(ROW_SELECTOR);
      if (row && row.querySelector) return row.querySelector(PLAYABLE_SELECTOR);
      return null;
    }

    function onIntent(e) {
      var anchorEl = resolveAnchorFromTarget(e.target);
      warmAnchor(anchorEl, queue, true);
    }

    /* pointerenter/mouseenter-family events do not bubble, but a
       capture-phase listener on `doc` still observes them on the way down
       to their real target — this is the standard delegation trick for
       non-bubbling events, avoiding one listener per anchor/row/play-circle
       on pages with dozens of them (archive.html: 45). `click` is included
       per the contract's explicit event list (a warm click almost always
       follows a pointerdown/touchstart that already jumped the queue, but
       a synthetic/replayed click — e.g. boot.js's queued-click replay, or
       keyboard Enter/Space activation on a focused anchor — is covered
       too, cheaply, since warmAnchor() is a no-op once the txid is already
       warm/inflight/pending-and-prioritized). */
    doc.addEventListener('pointerenter', onIntent, true);
    doc.addEventListener('focusin', onIntent);
    doc.addEventListener('touchstart', onIntent, { passive: true });
    doc.addEventListener('pointerdown', onIntent);
    doc.addEventListener('click', onIntent);
  }

  /* pagehide (real navigation away, or entering the bfcache) still gets the
     hard abortAll() — "nothing running" with no possibility of resuming on
     THIS page instance. Mere tab-backgrounding (visibilitychange->hidden)
     is a much weaker, much more common signal (a listener tabs away
     mid-scroll and comes right back) and must NOT pay abortAll()'s
     permanent "failed, never retried" price — see suspend()/unsuspend()'s
     header comment in createWarmQueue above (warming-contract Fix 5). */
  function setupTeardown(doc, queue) {
    function hardAbort() { queue.abortAll(); }
    try {
      if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('pagehide', hardAbort);
    } catch (err) { /* defensive */ }
    if (doc && doc.addEventListener) {
      doc.addEventListener('visibilitychange', function () {
        if (doc.visibilityState === 'hidden') queue.suspend();
        else queue.unsuspend();
      });
    }
  }

  function preconnectHost() {
    var core = getPlayerCore();
    if (!core || !Array.isArray(core.RANGE_HOSTS) || !core.RANGE_HOSTS.length) return null;
    var pref = getHostPref();
    var preferred = null;
    try { preferred = pref ? pref.read() : null; } catch (err) { preferred = null; }
    if (preferred && core.RANGE_HOSTS.indexOf(preferred) !== -1) return preferred;
    return core.RANGE_HOSTS[0];
  }

  /* Runtime-injects the two preconnect variants the shared head partial
     deliberately no longer carries statically (see the comment in
     website/templates/partials/head.html) — a plain preconnect for the
     <audio> element's no-CORS media load, and a `crossorigin` preconnect
     for this file's own CORS-mode warm fetch(). Only called when this page
     actually has playable mixes AND warming is enabled AND policy.mode is
     not 'none' — an about/residents page must never pay for a DNS+TCP+TLS
     handshake to a gateway it will never talk to. Idempotent via the
     PRECONNECT_MARK attribute so a re-init (should one ever happen) never
     duplicates the tags. */
  function injectPreconnect(doc, host) {
    if (!host || !doc || !doc.head || typeof doc.createElement !== 'function') return;
    var already = doc.head.querySelector
      ? doc.head.querySelector('link[' + PRECONNECT_MARK + '="' + host + '"]')
      : null;
    if (already) return;

    var plain = doc.createElement('link');
    plain.rel = 'preconnect';
    plain.href = host;
    plain.setAttribute(PRECONNECT_MARK, host);
    doc.head.appendChild(plain);

    var cors = doc.createElement('link');
    cors.rel = 'preconnect';
    cors.href = host;
    cors.crossOrigin = 'anonymous';
    cors.setAttribute(PRECONNECT_MARK, host);
    doc.head.appendChild(cors);
  }

  function readConnectionInfo() {
    try {
      if (typeof navigator === 'undefined') return null;
      return navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
    } catch (err) { return null; }
  }

  var UEWarm; /* forward-declared so the default snapshot() below can close over it if ever needed */

  function defaultSnapshot() {
    return { pageType: null, policy: null, warmEnabled: false, totalEligible: 0, states: {}, pending: 0, inflight: 0, warm: 0, failed: 0 };
  }

  /* Default, pre-init() placeholders for the public API surface added by
     Fix 1 / Fix 2 — real implementations (closing over the live `queue`)
     are assigned onto UEWarm at the end of init(), exactly like
     UEWarm.snapshot above already does. Kept as harmless no-ops rather
     than left undefined so every call site (this file's own
     setupIntentWarming would never call these directly — only player.js
     and manual console use do) can call `window.UEWarm.prioritize(...)`
     defensively without a `typeof === 'function'` guard ever failing
     because init() hasn't run yet (still loading), or never runs at all
     (no UEPlayerCore on the page). */
  function defaultPrioritize() {}
  function defaultNotifyPlaybackStarting() {}
  function defaultNotifyPlaybackSettled() {}

  function init() {
    var core = getPlayerCore();
    if (!core) return; /* no UEPlayerCore -- nothing safe to warm; disable silently */
    if (typeof document === 'undefined') return;
    var doc = document;

    var pageType = detectPageType(doc);
    var overrideEl = doc.querySelector ? doc.querySelector('[data-warm-policy]') : null;
    var overrideAttr = overrideEl ? overrideEl.getAttribute('data-warm-policy') : null;
    var policy = policyFor(pageType, overrideAttr);

    var warmEnabled = shouldWarmAtAll(readConnectionInfo());
    /* Fix 3 (RISK): shouldWarmAtAll() above is still only an INITIAL
       snapshot for deciding what to do at load time (unchanged) — but
       `listViewportEnabled` is a LIVE, mutable mirror of it that the
       connection 'change' listener below keeps current, so a mid-session
       degrade/improve can actually take effect instead of being frozen at
       whatever the page happened to see on first paint. */
    var listViewportEnabled = warmEnabled;

    var anchors = collectAnchors(doc);

    /* Lookup for the string-txid form of UEWarm.prioritize(txidOrAnchor)
       below (Fix 1) — a bare txid carries no href/urls of its own, so a
       "never seen" txid can only be enqueued if this file can still find
       its candidate URLs. Built once, from the same anchor scan already
       done for the page, and left permanently stale-safe: an unknown
       txid (not on this page, or the page has since mutated) simply isn't
       in the map, and prioritize() below no-ops rather than guessing. */
    var txidHrefMap = {};
    for (var m = 0; m < anchors.length; m++) {
      if (isExcludedAnchor(anchors[m])) continue;
      var mHref = readAttr(anchors[m], 'href');
      var mTxid = mHref ? core.extractTxid(mHref) : null;
      if (mTxid && !hasOwn(txidHrefMap, mTxid)) txidHrefMap[mTxid] = mHref;
    }

    var queue = createWarmQueue({
      concurrency: 2,
      spacingMs: 150,
      jitterMs: 250,
      now: Date.now,
      random: Math.random,
      request: makeRealRequest()
    });

    if (warmEnabled && policy.mode !== 'none' && anchors.length > 0) {
      injectPreconnect(doc, preconnectHost());
    }

    var viewportObserver = null; /* only ever non-null for policy.mode === 'viewport' */
    if (warmEnabled && policy.mode === 'list') {
      var targets = selectInitialTargets(anchors, policy);
      for (var t = 0; t < targets.length; t++) {
        queue.enqueue(targets[t].txid, candidatesForHref(targets[t].url));
      }
    } else if (warmEnabled && policy.mode === 'viewport') {
      viewportObserver = setupViewportWarming(doc, anchors, queue);
    }

    setupIntentWarming(doc, queue, warmEnabled);
    setupTeardown(doc, queue);

    /* Fix 3 (RISK): react to navigator.connection's 'change' event (guarded
       — unsupported in Safari/Firefox, so this can be a permanent no-op
       there, same as shouldWarmAtAll() already degrades to "assume normal"
       when the API is absent). Only LIST/VIEWPORT auto-warming is
       affected, per the contract's reduced-data row ("intent-only, no
       list/viewport warming") — explicit intent (setupIntentWarming above)
       is untouched here by design, on either transition. 'list' mode has
       nothing ongoing to stop (it enqueues once, synchronously, at init,
       and is long done by the time any 'change' event could fire) or to
       usefully resume (this file does not retroactively run a list pass
       that a reduced-data initial load skipped — keeping this simple, per
       the task brief, rather than reopening how init() decides its
       one-time list enqueue). 'viewport' mode DOES have an ongoing
       process — the IntersectionObserver can still discover newly-scrolled
       rows for the rest of the session — so that's the one this actually
       pauses/resumes: disconnecting it stops new viewport-triggered warms
       from starting; re-running setupViewportWarming over the same anchor
       list on improvement is safe and idempotent, since warmAnchor()'s own
       per-txid state check silently skips every anchor already
       warm/inflight/pending. */
    function handleConnectionChange() {
      var stillEnabled = shouldWarmAtAll(readConnectionInfo());
      if (stillEnabled === listViewportEnabled) return; /* no transition */
      listViewportEnabled = stillEnabled;
      if (!stillEnabled) {
        if (viewportObserver) { viewportObserver.disconnect(); viewportObserver = null; }
      } else if (policy.mode === 'viewport') {
        viewportObserver = setupViewportWarming(doc, anchors, queue);
      }
    }
    try {
      var conn = readConnectionInfo();
      if (conn && typeof conn.addEventListener === 'function') {
        conn.addEventListener('change', handleConnectionChange);
      }
    } catch (err) { /* defensive; Network Information API is unsupported/flaky on some browsers */ }

    var totalEligible = 0;
    for (var i = 0; i < anchors.length; i++) {
      if (isExcludedAnchor(anchors[i])) continue;
      var href = readAttr(anchors[i], 'href');
      if (href && core.extractTxid(href)) totalEligible += 1;
    }

    UEWarm.snapshot = function () {
      var s = queue.stats();
      return {
        pageType: pageType,
        policy: policy,
        warmEnabled: warmEnabled,
        totalEligible: totalEligible,
        states: s.states,
        pending: s.pending,
        inflight: s.inflight,
        warm: s.warm,
        failed: s.failed
      };
    };

    /* UEWarm.prioritize(txidOrAnchor) — warming-contract Fix 1. THE real,
       documented public API (previously only the queue's own INTERNAL
       prioritize(txid) existed, unreachable from outside this file — see
       the review this fix responds to). Accepts either:
         - a txid string: delegates to the queue's own state-aware
           prioritize() when already tracked (pending -> front,
           inflight/warm/failed -> no-op, matching queue.prioritize()'s own
           contract exactly); when never seen, looks up its href in
           txidHrefMap and enqueues it at the front — a txid this page
           doesn't know about (unknown/mistyped) is a harmless no-op, same
           as every other guard in this file.
         - a DOM anchor element (or anything warmAnchor()/readAttr() can
           read `href`/`data-unplayable` off): identical enqueue-or-
           prioritize semantics as the intent listeners above, so a caller
           driving this from the console can just hand it a real anchor
           node without extracting a txid by hand. */
    UEWarm.prioritize = function (txidOrAnchor) {
      if (!txidOrAnchor) return;
      if (typeof txidOrAnchor === 'string') {
        var known = queueStateFor(queue, txidOrAnchor);
        if (known) { queue.prioritize(txidOrAnchor); return; } /* pending->front; inflight/warm/failed->no-op */
        if (hasOwn(txidHrefMap, txidOrAnchor)) {
          queue.enqueue(txidOrAnchor, candidatesForHref(txidHrefMap[txidOrAnchor]), { priority: true });
        }
        return; /* unknown txid (never seen, not on this page) -- safe no-op */
      }
      warmAnchor(txidOrAnchor, queue, true);
    };

    /* UEWarm.notifyPlaybackStarting(txid) / notifyPlaybackSettled() —
       warming-contract Fix 2. Called by player.js at the exact point it
       commits to loading a REAL source for `txid` (setSrc), and once that
       start has genuinely settled (native 'playing', or pause/terminal
       failure). Two things happen on notifyPlaybackStarting(): the
       SPECIFIC txid's own warm work is cancelled (see cancel()'s header
       comment in createWarmQueue — deliberately NOT marked failed), and
       the WHOLE queue is paused so unrelated background warming isn't
       competing for bandwidth during the exact window a cold gateway
       start needs it least (see this file's header measurements). The
       bounded ~30s auto-resume exists so a start that never reaches a
       'playing'/'pause'/terminal event for any reason (e.g. requestPlay()'s
       play() promise rejects silently on a blocked autoplay, or some other
       path this file cannot enumerate) can never wedge warming off for the
       rest of the session — 30s comfortably exceeds the slowest cold
       gateway start measured anywhere in this project (worst observed
       24.98s; see this file's header and GATEWAY-EVIDENCE.md), so it will
       essentially never fire ahead of a genuine settle on a working start. */
    var PLAYBACK_START_RESUME_MS = 30000;
    var playbackResumeTimer = null;
    function clearPlaybackResumeTimer() {
      if (playbackResumeTimer) { clearTimeout(playbackResumeTimer); playbackResumeTimer = null; }
    }
    UEWarm.notifyPlaybackStarting = function (txid) {
      if (typeof txid === 'string' && txid) queue.cancel(txid);
      queue.pause();
      clearPlaybackResumeTimer();
      playbackResumeTimer = setTimeout(function () {
        playbackResumeTimer = null;
        queue.resume();
      }, PLAYBACK_START_RESUME_MS);
    };
    UEWarm.notifyPlaybackSettled = function () {
      clearPlaybackResumeTimer();
      queue.resume();
    };
  }

  function bootWhenReady() {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  /* ---------- exports ---------- */

  UEWarm = {
    detectPageType: detectPageType,
    policyFor: policyFor,
    selectInitialTargets: selectInitialTargets,
    shouldWarmAtAll: shouldWarmAtAll,
    buildWarmRequest: buildWarmRequest,
    createWarmQueue: createWarmQueue,
    markHostUnhealthy: markHostUnhealthy, /* Fix 4 -- real from the start, no DOM/queue dependency */
    prioritize: defaultPrioritize, /* Fix 1 -- replaced with the real thing in init() */
    notifyPlaybackStarting: defaultNotifyPlaybackStarting, /* Fix 2 -- replaced in init() */
    notifyPlaybackSettled: defaultNotifyPlaybackSettled, /* Fix 2 -- replaced in init() */
    snapshot: defaultSnapshot
  };

  if (typeof module === 'object' && module.exports) { module.exports = UEWarm; }
  if (typeof window !== 'undefined') { window.UEWarm = UEWarm; }

  bootWhenReady();

})();
