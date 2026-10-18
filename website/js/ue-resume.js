/* ==========================================================================
   Underground Existence — ue-resume.js
   "Resume Listening": a local, privacy-safe memory of where the listener
   left off, offered back through the persistent player bar.

   Scope, per UE_PLAYABILITY_INTEGRATION_CONTRACT.md: a single stored record
   (stable mix key = Arweave txid, the artist-page path it was playing on,
   confirmed position, title/artist for the offer label, duration if known,
   and a timestamp). No IDs, no fingerprints, nothing leaves the device, no
   network calls. Every window.localStorage access is wrapped in try/catch —
   private/incognito modes throw on the PROPERTY ACCESS itself, not only on
   getItem/setItem. Classic IIFE, dual browser/CommonJS export tail, no
   ESM/CommonJS imports — identical to player-core.js / ue-host-pref.js, so
   this file loads unchanged as a plain <script> and inside node:vm.

   Versioning: the storage key carries a version suffix (STORAGE_KEY below)
   AND the stored record itself carries an internal `v` field that
   validateRecord() checks independently. Two independent checks rather than
   one: a key rename alone would make an old value merely unreachable, never
   surfaced as "wrong version" — the internal field is what lets a stored
   record actually be REJECTED for carrying the wrong shape/version rather
   than just silently vanishing.

   TTL — 21 days: long enough that a listener who returns after a week, or
   two, to a long mix they were partway through still gets offered a resume;
   short enough that a session abandoned over three weeks ago is unlikely to
   still be relevant and shouldn't keep resurfacing a stale offer.

   Save thresholds:
     - MIN_RESUME_POSITION_SEC (30s) — nothing worth resuming before this;
       skip saving (and skip the "save on pause" path too).
     - END_GUARD_SEC (30s) — don't bother saving inside the final 30s of a
       KNOWN duration; playback is about to finish on its own and natural
       completion (see isComplete/COMPLETION_EPSILON_SEC below) will clear
       the record moments later anyway. Duration unknown ⇒ this guard does
       not apply (there is nothing to measure "final 30s" against).
     - SAVE_THROTTLE_MS (5s) — caps how often the throttled 'time' tick is
       allowed to persist, per the contract's "no more than ~1 write / 5s".
     - COMPLETION_EPSILON_SEC (2s) — how close to a known duration counts as
       "finished" for the purpose of CLEARING the record. Kept tight and
       distinct from END_GUARD_SEC: END_GUARD stops new saves well before
       the end (30s out); COMPLETION only fires right at the very end (2s
       out), so there is no window where a save is skipped AND nothing gets
       cleared — the last real save (from >30s before the end) simply
       survives until true completion clears it.
   Absolute sanity caps (MAX_TIME_SEC, MAX_FIELD_LEN, PAGE_RE) exist purely
   to reject hostile/corrupt stored values — see validateRecord().

   Write policy (host events — window.UEPlayer.host.on, see the integration
   contract §3): a throttled save on 'time' while genuinely playing and past
   the thresholds above; an immediate (unthrottled, but still
   threshold-gated) save on a 'playback' pause transition; the in-memory
   track-title/artist context used to build a record is refreshed on every
   'track' event so a save always describes whichever track is ACTUALLY
   active, never a stale one left over from before a skip/select. Natural
   completion clears the record outright.

   Read policy: on page load, read + validate + expire (see validateRecord).
   Any invalid stored value — bad JSON, wrong/missing internal version,
   txid that doesn't match the 43-char Arweave shape, non-finite/negative/
   absurd times, a position beyond a known duration, a future timestamp, an
   oversized field, or simply expired — is discarded (localStorage entry
   removed) without throwing, and no offer is made.

   Offer UI: NONE OF ITS OWN. This module injects no element and no CSS. It
   hands the stored record to the persistent player bar — already on screen,
   already carrying an idle "Select a mix to play" slot — via
   window.uePlayerBar.prime({title, artist, img, href, filename, startSec,
   label, source:'resume'}). The bar fills that slot with the stored track
   and a "resume mm:ss" label (formatTime below). Nothing floats over the
   grid, there is nothing to dismiss, and prime() neither autoplays nor
   loads audio — pressing the bar's own play button is what starts playback,
   at the stored position.

   The offer is made once per page view, and only when the stored txid is
   found among THIS page's own playable mix anchors (the same
   `a[data-playlist], a[data-link]` selector and unplayable/http filter
   player.js builds its queue from — an anchor the queue rejects is one the
   bar could never play).

   Both the decision AND the prime() call hang off the existing
   `ue-player-ready` hook. Delivery has to: window.uePlayerBar ships with
   player.js, which boot.js loads LAZILY (idle time, or the first
   play-intent tap), so at DOMContentLoaded there is nothing to prime.
   (window.UEPlayerCore, by contrast, is loaded EAGERLY and this file is
   chained after it, so the extractor below is reliably present either way —
   the wait is not for it.) The DECISION rides the same hook for two
   reasons: nothing consumes it earlier, so deferring costs nothing; and
   player.js REWRITES the featured anchor's href and data-title/artist/img
   as it hydrates (randomizeFeatured), so a scan taken before that could
   match pre-randomization markup and prime a payload for a track the live
   queue does not hold. Scanning after means this module and
   findIndexByTxid see the same page. One hook, one prime(): no polling, no
   retry, and no dependence on where in boot.js's eager chain this file
   happens to sit. This module never FORCES hydration (the lazy queue is
   deliberately gesture-gated); it only waits for it.
   The scan is pure (pageHasTxid/indexOfTxid over collected hrefs, using
   window.UEPlayerCore.extractTxid — the same identity function the rest of
   the playback system already trusts), and the matching anchor is also
   where the prime payload's title/artist/img/href/filename come from, so
   the primed bar describes exactly what a click on that card would play.
   A record whose track is NOT on this page stays in storage untouched and
   is simply not offered here: the player bar can only queue what this page
   has, and no element remains in which to offer a cross-page link.
   buildFallbackUrl() still builds that "<page>?mix=<txid>" deep link — the
   same format ue-links.js reads back — for any caller that wants it.

   window.uePlayerBar may be absent (this module can load before player.js,
   or on a stripped page) and prime() may decline (bad input, or audio
   already playing — a returning visitor who pressed play first must never
   have the bar yanked out from under them). Both are a quiet no-op: never a
   throw, never a retry loop, never anything that touches playback.

   NEVER autoplays: nothing in this file calls play()/playIndexAt(); waiting
   on `ue-player-ready` and reading the stored record start nothing, and
   prime() explicitly neither autoplays nor loads audio.
   createResumeHandler() below remains the exported,
   gesture-safe way to PERFORM a resume (contract §3b: window.UEBoot
   .ensurePlayer(cb) called SYNCHRONOUSLY inside a real click, then
   host.findIndexByTxid/playIndexAt inside that callback). The primed bar's
   own play button now performs the resume inside player.js, so this file no
   longer wires that handler to any DOM of its own.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- constants ---------- */

  var STORAGE_KEY = 'ue-resume-v1';
  var RECORD_VERSION = 1;

  var TTL_MS = 21 * 24 * 60 * 60 * 1000; /* 21 days — see header comment */

  var MIN_RESUME_POSITION_SEC = 30;
  var END_GUARD_SEC = 30;
  var COMPLETION_EPSILON_SEC = 2;
  var SAVE_THROTTLE_MS = 5000;

  /* Absolute sanity caps — reject anything beyond these as corrupt/tampered
     rather than trust it. 6 hours is already far beyond any real mix on
     this site (the longest measured, per player-core.js's own comment, is
     ~120 minutes) — generous headroom, not a realistic ceiling. */
  var MAX_TIME_SEC = 6 * 60 * 60;
  var MAX_FIELD_LEN = 300;

  /* Kept identical in character class to player-core.js's TXID_RE (43-char
     base64url), but anchored full-string since this validates an already
     -extracted value, not a URL path segment. */
  var TXID_RE = /^[A-Za-z0-9_-]{43}$/;

  /* A stored `page` is later used to build a real href (the "not on this
     page" fallback link) — this is the security boundary that keeps a
     tampered/forged record from ever producing a javascript:/data:/
     protocol-relative href. Must start with exactly one "/", contain only
     ordinary path characters, and never contain "//" or ":" anywhere. */
  var PAGE_RE = /^\/[A-Za-z0-9._\/-]{0,250}$/;

  /* ---------- tiny numeric helpers ---------- */

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function isValidTxid(txid) {
    return typeof txid === 'string' && TXID_RE.test(txid);
  }

  function isValidPage(page) {
    return typeof page === 'string' &&
      PAGE_RE.test(page) &&
      page.indexOf('//') === -1 &&
      page.indexOf(':') === -1;
  }

  /* ---------- formatting ---------- */

  /* Mirrors player.js's own (private, unexported) formatTime exactly, so a
     resume prompt's "at 12:34" reads identically to the player bar's own
     clock. Duplicated rather than imported — player.js is off-limits to
     edit and does not expose this helper on window.UEPlayer.host. */
  function formatTime(sec) {
    if (!isFiniteNumber(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = h > 0 && m < 10 ? '0' + m : String(m);
    var ss = s < 10 ? '0' + s : String(s);
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  /* ---------- record shape ---------- */

  /* Builds a well-formed record from loose inputs (always coerces to the
     right type rather than trusting the caller) — the ONE place a record is
     assembled for writing. Never throws. */
  function makeRecord(opts) {
    opts = opts || {};
    var now = isFiniteNumber(opts.now) ? opts.now : Date.now();
    var duration = (isFiniteNumber(opts.duration) && opts.duration > 0) ? opts.duration : null;
    var position = isFiniteNumber(opts.position) ? opts.position : 0;
    return {
      v: RECORD_VERSION,
      txid: typeof opts.txid === 'string' ? opts.txid : '',
      page: typeof opts.page === 'string' ? opts.page : '/',
      position: position,
      duration: duration,
      title: typeof opts.title === 'string' ? opts.title : '',
      artist: typeof opts.artist === 'string' ? opts.artist : '',
      ts: now
    };
  }

  /* Validates + expires a raw stored value (a JSON string, as read from
     localStorage, or — for test convenience — an already-parsed plain
     object). Returns { ok, record, reason }; `record` is populated only
     when ok === true. Every branch below corresponds to a hostile/corrupt
     shape this file must survive per the integration contract. Never
     throws. */
  function validateRecord(raw, opts) {
    opts = opts || {};
    var now = isFiniteNumber(opts.now) ? opts.now : Date.now();
    var ttlMs = isFiniteNumber(opts.ttlMs) ? opts.ttlMs : TTL_MS;

    if (raw === null || raw === undefined || raw === '') {
      return { ok: false, record: null, reason: 'missing' };
    }

    var parsed;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return { ok: false, record: null, reason: 'bad-json' };
      }
    } else {
      parsed = raw;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, record: null, reason: 'bad-shape' };
    }
    if (parsed.v !== RECORD_VERSION) {
      return { ok: false, record: null, reason: 'wrong-version' };
    }
    if (!isValidTxid(parsed.txid)) {
      return { ok: false, record: null, reason: 'bad-txid' };
    }
    if (!isValidPage(parsed.page)) {
      return { ok: false, record: null, reason: 'bad-page' };
    }
    if (typeof parsed.title !== 'string' || parsed.title.length > MAX_FIELD_LEN) {
      return { ok: false, record: null, reason: 'bad-title' };
    }
    if (typeof parsed.artist !== 'string' || parsed.artist.length > MAX_FIELD_LEN) {
      return { ok: false, record: null, reason: 'bad-artist' };
    }
    if (!isFiniteNumber(parsed.position) || parsed.position < 0 || parsed.position > MAX_TIME_SEC) {
      return { ok: false, record: null, reason: 'bad-position' };
    }

    var duration = parsed.duration;
    if (duration !== null) {
      if (!isFiniteNumber(duration) || duration <= 0 || duration > MAX_TIME_SEC) {
        return { ok: false, record: null, reason: 'bad-duration' };
      }
      /* small epsilon so a position landing exactly on (or a hair past, via
         float rounding from a real timeupdate tick) a known duration is not
         treated as tampering */
      if (parsed.position > duration + 1) {
        return { ok: false, record: null, reason: 'position-beyond-duration' };
      }
    }

    if (!isFiniteNumber(parsed.ts)) {
      return { ok: false, record: null, reason: 'bad-timestamp' };
    }
    if (parsed.ts > now) {
      return { ok: false, record: null, reason: 'future-timestamp' };
    }
    if (now - parsed.ts > ttlMs) {
      return { ok: false, record: null, reason: 'expired' };
    }

    return {
      ok: true,
      reason: null,
      record: {
        v: RECORD_VERSION,
        txid: parsed.txid,
        page: parsed.page,
        position: parsed.position,
        duration: duration,
        title: parsed.title,
        artist: parsed.artist,
        ts: parsed.ts
      }
    };
  }

  /* ---------- save/clear decision logic ---------- */

  function pastMinPosition(position) {
    return isFiniteNumber(position) && position >= MIN_RESUME_POSITION_SEC;
  }

  /* true = INSIDE the "too close to a known end, don't bother saving" band.
     An unknown/invalid duration can never trigger this guard — there is
     nothing to measure "final 30s" against, so absence of a duration must
     not silently suppress every save. */
  function withinEndGuard(position, duration) {
    if (!isFiniteNumber(duration) || duration <= 0) return false;
    return position > duration - END_GUARD_SEC;
  }

  /* Natural-completion check, used to CLEAR the record (distinct from, and
     tighter than, withinEndGuard's save-suppression band — see header
     comment for why the two thresholds differ). */
  function isComplete(position, duration) {
    if (!isFiniteNumber(duration) || duration <= 0) return false;
    if (!isFiniteNumber(position)) return false;
    return position >= duration - COMPLETION_EPSILON_SEC;
  }

  /* The throttled 'time'-tick decision — exact signature per the
     integration contract. Only while genuinely playing; the pause path
     below is separate because a pause save is immediate/unthrottled and
     does not require `playing: true` (the track is, by definition, no
     longer playing at that instant). */
  function shouldSave(opts) {
    opts = opts || {};
    if (opts.playing !== true) return false;
    if (!pastMinPosition(opts.position)) return false;
    if (withinEndGuard(opts.position, opts.duration)) return false;
    var now = isFiniteNumber(opts.now) ? opts.now : Date.now();
    if (isFiniteNumber(opts.lastSaveAt) && (now - opts.lastSaveAt) < SAVE_THROTTLE_MS) return false;
    return true;
  }

  /* The "save immediately on pause" decision — same position/end-guard
     thresholds as shouldSave, deliberately with no throttle and no
     `playing` requirement (a pause event means playing is now false). */
  function shouldSaveOnPause(opts) {
    opts = opts || {};
    if (!pastMinPosition(opts.position)) return false;
    if (withinEndGuard(opts.position, opts.duration)) return false;
    return true;
  }

  /* ---------- link building / page scanning (pure) ---------- */

  /* Safe, self-built fallback when window.UELinks (a sibling module owned
     by another agent) is absent or misbehaves. `page` has already been
     through isValidPage() by the time a record reaches here (either fresh
     from makeRecord()+this session, or read back through validateRecord()),
     but this function re-validates defensively so it can never be handed a
     forged href on its own. PAGE_RE forbids "?" (and ":", "//") outright,
     so a valid `page` is always a bare pathname with no query string of its
     own — the separator is always "?", never "&". */
  function buildFallbackUrl(page, txid) {
    var safePage = isValidPage(page) ? page : '/';
    var safeTxid = typeof txid === 'string' ? txid : '';
    return safePage + '?mix=' + encodeURIComponent(safeTxid);
  }

  /* Pure scan over a plain array of href strings (as collected from the
     current page's mix anchors — see collectPlayableAnchors() below) using an
     INJECTED extractTxid function, so this is fully testable with plain
     arrays and no DOM at all. Mirrors the identity check the rest of the
     playback system already trusts (window.UEPlayerCore.extractTxid).
     Returns the matching index, or -1. */
  function indexOfTxid(hrefs, txid, extractTxidFn) {
    if (!Array.isArray(hrefs) || !isValidTxid(txid) || typeof extractTxidFn !== 'function') return -1;
    for (var i = 0; i < hrefs.length; i++) {
      var found;
      try {
        found = extractTxidFn(hrefs[i]);
      } catch (err) {
        found = null;
      }
      if (found === txid) return i;
    }
    return -1;
  }

  /* The boolean form of the same scan — the shape the rest of the system
     (and the unit tests) ask the question in. One implementation, so "is it
     on this page?" and "which anchor is it?" can never disagree. */
  function pageHasTxid(hrefs, txid, extractTxidFn) {
    return indexOfTxid(hrefs, txid, extractTxidFn) !== -1;
  }

  /* ---------- the resume action (pure enough to unit-test the
     "never autoplays" invariant without a browser) ----------

     Returns a plain function representing "the user asked to resume" —
     nothing above this line, and nothing during page load, ever calls
     ensurePlayer/findIndexByTxid/playIndexAt. Only INVOKING the returned
     function does, and per contract §3b, ensurePlayer(cb) is called
     SYNCHRONOUSLY at the top of that invocation, so any caller must invoke
     it synchronously from inside a real 'click' event for the iOS unlock
     gesture to carry.

     This module no longer owns a button of its own: the primed player bar's
     play button performs the resume inside player.js. The handler is kept
     exported because it is the module's stated, gesture-safe contract for
     performing a resume from this file's stored record — the one place the
     "ensurePlayer first, then findIndexByTxid/playIndexAt, never guess"
     sequence is written down and tested. */
  function createResumeHandler(opts) {
    opts = opts || {};
    var ensurePlayer = typeof opts.ensurePlayer === 'function' ? opts.ensurePlayer : null;
    var getHost = typeof opts.getHost === 'function' ? opts.getHost : null;
    var txid = opts.txid;
    var startSec = opts.startSec;
    var onDone = typeof opts.onDone === 'function' ? opts.onDone : null;

    return function resumeHandler() {
      if (!ensurePlayer || !getHost || !isValidTxid(txid)) return;
      ensurePlayer(function () {
        var host = getHost();
        if (!host || typeof host.findIndexByTxid !== 'function' || typeof host.playIndexAt !== 'function') return;
        var idx = host.findIndexByTxid(txid);
        if (idx === -1) return; /* vanished between page-scan and hydration — no-op, never guess */
        var sec = (isFiniteNumber(startSec) && startSec > 0) ? startSec : undefined;
        host.playIndexAt(idx, sec);
      });
      if (onDone) onDone();
    };
  }

  /* ---------- storage access (never throws) ---------- */

  /* Wraps the PROPERTY ACCESS to window.localStorage itself, not only
     getItem/setItem — some privacy modes throw right there. Mirrors
     ue-host-pref.js's identical helper. */
  function getLocalStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage;
    } catch (err) {
      return null;
    }
  }

  function readRecord(storageLike, opts) {
    if (!storageLike) return null;
    var raw;
    try {
      raw = storageLike.getItem(STORAGE_KEY);
    } catch (err) {
      return null;
    }
    if (raw === null || raw === undefined) return null;
    var result = validateRecord(raw, opts);
    if (!result.ok) {
      clearRecord(storageLike); /* corrupt/expired — never linger */
      return null;
    }
    return result.record;
  }

  function writeRecord(storageLike, record) {
    if (!storageLike || !record) return false;
    try {
      storageLike.setItem(STORAGE_KEY, JSON.stringify(record));
      return true;
    } catch (err) {
      return false; /* quota exceeded / private mode — a lost save is harmless */
    }
  }

  function clearRecord(storageLike) {
    if (!storageLike) return false;
    try {
      storageLike.removeItem(STORAGE_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ==========================================================================
     Everything below this line is the thin DOM/browser wiring layer. It must
     no-op cleanly when window/document are missing (node:vm test loading)
     and must never be relied upon for decision logic — see the pure
     functions above for anything that needs to be unit-tested.
     ========================================================================== */

  function currentPagePath() {
    try {
      return (window.location && typeof window.location.pathname === 'string') ? window.location.pathname : '/';
    } catch (err) {
      return '/';
    }
  }

  /* Reads one attribute off an element, always as a string, never throwing
     — the elements here come from the live page, not from this module. */
  function attr(el, name) {
    try {
      var value = (el && typeof el.getAttribute === 'function') ? el.getAttribute(name) : null;
      return typeof value === 'string' ? value : '';
    } catch (err) {
      return '';
    }
  }

  function anchorHrefs(anchors) {
    var out = [];
    for (var i = 0; i < anchors.length; i++) out.push(attr(anchors[i], 'href'));
    return out;
  }

  /* The page's playable mix anchors, as a plain array (never a live
     NodeList) — the only DOM read this module performs on load. Deliberately
     the SAME selector + filter player.js builds its queue from, because an
     anchor the queue rejects is one the bar could never play: matching a
     bare download link (no data-title/data-img) or a data-unplayable row
     would only produce an offer that goes nowhere. */
  function collectPlayableAnchors() {
    try {
      var nodes = document.querySelectorAll('a[data-playlist], a[data-link]');
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        if (attr(el, 'data-unplayable') === 'true') continue;
        if (!/^https?:\/\//.test(attr(el, 'href'))) continue;
        out.push(el);
      }
      return out;
    } catch (err) {
      return [];
    }
  }

  /* Hands the offer to the persistent player bar (transient-UI contract,
     API 1) and stops. Builds the payload from the matched anchor — the
     same attributes player.js builds its own queue entry from — so the
     primed slot reads exactly like the track it points at; the stored
     record supplies only the position, and the title/artist as a fallback
     for an anchor missing them.

     Every failure mode is the same quiet no-op: no bar on the page yet (a
     load-order race with player.js), no prime() on it, a declined prime
     (bad input, or audio already playing), or a throw from inside it. */
  function primeResumeOffer(record, anchor) {
    var bar = window.uePlayerBar;
    if (!bar || typeof bar.prime !== 'function') return;

    var href = attr(anchor, 'href');
    if (!href) return;

    var title = attr(anchor, 'data-title') || record.title;
    var artist = attr(anchor, 'data-artist') || record.artist;
    if (!title) return; /* the bar's required field — never prime a nameless track */

    try {
      bar.prime({
        title: title,
        artist: artist,
        img: attr(anchor, 'data-img'),
        href: href,
        /* same shape player.js's own updateDownloadLinks() writes */
        filename: (artist ? artist + ' - ' : '') + title,
        startSec: record.position,
        label: 'resume ' + formatTime(record.position),
        source: 'resume'
      });
    } catch (err) {
      /* a partial/broken bar must never break the page or playback */
    }
  }

  /* One-shot per page view: reads the stored record (if any), locates the
     stored track among this page's own playable anchors, and offers it
     through the player bar. A record for a track that is not on this page
     is left alone — there is nothing here that could play it.

     Called only from behind whenPlayerReady (see init below): window
     .uePlayerBar does not exist until player.js hydrates, and the anchors
     are not final until it does either (randomizeFeatured rewrites the
     featured anchor's href and data-*). See the header comment. */
  function initResumeOffer() {
    var storage = getLocalStorage();
    var record = readRecord(storage, { now: Date.now(), ttlMs: TTL_MS });
    if (!record) return;

    var extractTxidFn = (window.UEPlayerCore && typeof window.UEPlayerCore.extractTxid === 'function')
      ? window.UEPlayerCore.extractTxid
      : null;
    if (!extractTxidFn) return;

    var anchors = collectPlayableAnchors();
    var idx = indexOfTxid(anchorHrefs(anchors), record.txid, extractTxidFn);
    if (idx === -1) return;

    primeResumeOffer(record, anchors[idx]);
  }

  /* Subscribes to the live host once it exists (see whenPlayerReady below)
     and persists resume state per the write policy in the header comment.
     Every host.on() callback is individually try/caught by player.js
     already (contract §3), but wrapped again here so a mistake in this
     file can never propagate. */
  function wireHostEvents() {
    var host = window.UEPlayer.host;
    var lastSaveAt = 0;
    var meta = { title: '', artist: '' };

    function syncMetaFromTrack(track) {
      meta.title = (track && typeof track.title === 'string') ? track.title : '';
      meta.artist = (track && typeof track.artist === 'string') ? track.artist : '';
    }
    try { syncMetaFromTrack(host.getCurrentTrack()); } catch (err) { /* ok, defaults stand */ }

    function persist(position, duration) {
      var txid;
      try { txid = host.getTxid(); } catch (err) { txid = null; }
      if (!isValidTxid(txid)) return;
      var record = makeRecord({
        txid: txid,
        page: currentPagePath(),
        position: position,
        duration: duration,
        title: meta.title,
        artist: meta.artist,
        now: Date.now()
      });
      writeRecord(getLocalStorage(), record);
    }

    host.on('track', function (payload) {
      lastSaveAt = 0; /* fresh throttle window for the newly active track */
      syncMetaFromTrack(payload && payload.track);
    });

    host.on('playback', function (payload) {
      if (!payload || payload.playing !== false) return;
      var position, duration;
      try { position = host.getCurrentTime(); } catch (err) { position = NaN; }
      try { duration = host.getDuration(); } catch (err) { duration = NaN; }
      if (shouldSaveOnPause({ position: position, duration: duration })) {
        persist(position, duration);
        lastSaveAt = Date.now();
      }
    });

    host.on('time', function (payload) {
      var position = (payload && isFiniteNumber(payload.currentTime)) ? payload.currentTime : NaN;
      var duration = (payload && isFiniteNumber(payload.duration)) ? payload.duration : NaN;

      if (isComplete(position, duration)) {
        clearRecord(getLocalStorage());
        return;
      }

      var playing = false;
      try { playing = !!host.getState().playing; } catch (err) { playing = false; }

      var now = Date.now();
      if (shouldSave({ position: position, duration: duration, playing: playing, lastSaveAt: lastSaveAt, now: now })) {
        persist(position, duration);
        lastSaveAt = now;
      }
    });
  }

  /* Exact helper from the integration contract §3 — modules that load
     before player.js hydrates must wait for this event before touching
     window.UEPlayer. */
  function whenPlayerReady(cb) {
    if (window.UEPlayer && window.UEPlayer.host) { cb(); return; }
    document.addEventListener('ue-player-ready', function () { cb(); }, { once: true });
  }

  /* Both halves of this module hang off the SAME single ready hook, and for
     the same reason: what they touch (UEPlayer.host, uePlayerBar, and the
     final post-hydration markup) arrives with player.js, which boot.js
     loads lazily. Fires immediately when the player is already live — so
     the offer stays one
     prime() call, never a poll and never a retry. If hydration was started
     by the listener tapping play, prime() is contractually required to
     refuse while audio is playing, so that listener is never interrupted.
     The two are individually try/caught: a failed offer must still leave
     position saving wired, and vice versa. */
  function init() {
    try {
      whenPlayerReady(function () {
        try { initResumeOffer(); } catch (err) { /* progressive enhancement: never break the page */ }
        try { wireHostEvents(); } catch (err) { /* never break playback */ }
      });
    } catch (err) { /* ok */ }
  }

  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
  }

  /* ---------- exports ---------- */

  var UEResume = {
    STORAGE_KEY: STORAGE_KEY,
    RECORD_VERSION: RECORD_VERSION,
    TTL_MS: TTL_MS,
    MIN_RESUME_POSITION_SEC: MIN_RESUME_POSITION_SEC,
    END_GUARD_SEC: END_GUARD_SEC,
    COMPLETION_EPSILON_SEC: COMPLETION_EPSILON_SEC,
    SAVE_THROTTLE_MS: SAVE_THROTTLE_MS,
    MAX_TIME_SEC: MAX_TIME_SEC,
    MAX_FIELD_LEN: MAX_FIELD_LEN,
    TXID_RE: TXID_RE,
    PAGE_RE: PAGE_RE,

    isValidTxid: isValidTxid,
    isValidPage: isValidPage,
    formatTime: formatTime,
    makeRecord: makeRecord,
    validateRecord: validateRecord,
    pastMinPosition: pastMinPosition,
    withinEndGuard: withinEndGuard,
    isComplete: isComplete,
    shouldSave: shouldSave,
    shouldSaveOnPause: shouldSaveOnPause,
    buildFallbackUrl: buildFallbackUrl,
    pageHasTxid: pageHasTxid,
    createResumeHandler: createResumeHandler,

    getLocalStorage: getLocalStorage,
    readRecord: readRecord,
    writeRecord: writeRecord,
    clearRecord: clearRecord,

    /* Exposed for completeness/manual invocation; the file already
       self-initializes above when a real document is present. */
    init: init
  };

  if (typeof module === 'object' && module.exports) { module.exports = UEResume; }
  if (typeof window !== 'undefined') { window.UEResume = UEResume; }

})();
