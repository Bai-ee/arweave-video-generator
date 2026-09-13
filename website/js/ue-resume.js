/* ==========================================================================
   Underground Existence — ue-resume.js
   "Resume Listening": a local, privacy-safe prompt offering to pick a mix
   back up where the listener left off.

   Scope, per UE_PLAYABILITY_INTEGRATION_CONTRACT.md: a single stored record
   (stable mix key = Arweave txid, the artist-page path it was playing on,
   confirmed position, title/artist for the prompt label, duration if known,
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
   still be relevant and shouldn't keep resurfacing a stale prompt.

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
   removed) without throwing, and no prompt is shown.

   Prompt UI: injected at runtime (no template/generator/HTML edit — none is
   needed or allowed for this feature per the contract), a single
   `<style id="ue-resume-styles">` block guarded so it is only ever inserted
   once, matching the site's dark/red look via the SAME CSS custom
   properties site.css already defines on :root (var(--accent-bright) etc.,
   with an inline literal fallback in case this file is ever loaded before
   site.css finishes, belt-and-suspenders only). Real <button>s, aria-labels,
   a visually-hidden aria-live="polite" announcer (mirrors player.js's own
   buildStatusRegion() convention: a hidden live node held separate from the
   visible text), and a bottom offset that clears the persistent player bar
   at every width the site defines (900px breakpoint, which covers ≤480px).

   Two ways the prompt can resolve, decided WITHOUT needing player.js to
   have hydrated (findIndexByTxid only exists on the live queue once
   player.js loads, and hydration is deliberately lazy/user-gesture-gated —
   this module must not force it just to decide what to render):
     - the stored txid is found among this page's own anchors (pageHasTxid,
       a pure scan over collected hrefs using window.UEPlayerCore.
       extractTxid — the same identity function the rest of the playback
       system already trusts) ⇒ a real "Resume" <button> that, on click,
       calls window.UEBoot.ensurePlayer(cb) SYNCHRONOUSLY inside the
       handler (contract §3b — required for the iOS audio-unlock gesture),
       then window.UEPlayer.host.findIndexByTxid/playIndexAt inside that
       callback. See createResumeHandler().
     - not found on this page ⇒ a plain <a> to the stored artist page with
       "?mix=<txid>" appended (buildFallbackUrl(), built and validated
       here — same deep-link format ue-links.js reads back) — a normal
       browser navigation, never a script-driven one, so it can never
       itself start audio.
   NEVER autoplays: nothing in this file calls play()/playIndexAt() except
   from inside a real click handler's callback, and reading/rendering the
   stored record on page load never touches window.UEPlayer at all.
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
     current page's anchors — see collectPageHrefs() below) using an
     INJECTED extractTxid function, so this is fully testable with plain
     arrays and no DOM at all. Mirrors the identity check the rest of the
     playback system already trusts (window.UEPlayerCore.extractTxid). */
  function pageHasTxid(hrefs, txid, extractTxidFn) {
    if (!Array.isArray(hrefs) || !isValidTxid(txid) || typeof extractTxidFn !== 'function') return false;
    for (var i = 0; i < hrefs.length; i++) {
      var found;
      try {
        found = extractTxidFn(hrefs[i]);
      } catch (err) {
        found = null;
      }
      if (found === txid) return true;
    }
    return false;
  }

  /* ---------- the resume action (pure enough to unit-test the
     "never autoplays" invariant without a browser) ----------

     Returns a plain function representing "the user clicked Resume" —
     nothing above this line, and nothing during page load, ever calls
     ensurePlayer/findIndexByTxid/playIndexAt. Only INVOKING the returned
     function does, and per contract §3b, ensurePlayer(cb) is called
     SYNCHRONOUSLY at the top of that invocation (the caller — buildBar's
     real DOM click listener — must invoke this synchronously from inside
     a real 'click' event for the iOS unlock gesture to carry). */
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

  var STYLE_ID = 'ue-resume-styles';
  var BAR_ID = 'ue-resume-bar';
  var LIVE_ID = 'ue-resume-status-live';

  function injectStyles() {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '#' + BAR_ID + '{position:fixed;left:12px;right:12px;bottom:calc(var(--player-bar-height,84px) + 14px);' +
      'z-index:998;margin:0 auto;max-width:560px;display:flex;align-items:center;gap:12px;' +
      'padding:10px 14px;border-radius:var(--radius-card,12px);' +
      'border:1px solid var(--hairline-red,rgba(193,18,31,0.45));background:rgba(20,13,13,0.96);' +
      'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);' +
      'box-shadow:0 10px 26px rgba(0,0,0,0.45);font-family:var(--font-mono,monospace);' +
      'color:var(--text-primary,#f2ece4);transition:transform .3s var(--ease-out-expo,ease),opacity .3s var(--ease-out-expo,ease);}' +
      '#ue-resume-message{flex:1 1 auto;min-width:0;font-size:12.5px;letter-spacing:.02em;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '#ue-resume-actions{flex:none;display:flex;align-items:center;gap:8px;}' +
      '#ue-resume-play-button{border:1px solid var(--accent-bright,#e01e2b);border-radius:999px;' +
      'padding:6px 14px;font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;' +
      'letter-spacing:.08em;text-transform:uppercase;color:var(--accent-bright,#e01e2b);' +
      'background:transparent;transition:background .2s ease,color .2s ease,transform .15s var(--ease-out-expo,ease);}' +
      '#ue-resume-play-button:hover{background:var(--accent,#c1121f);color:#fff;}' +
      '#ue-resume-play-button:active{transform:scale(.95);}' +
      '#ue-resume-link-button{font-family:var(--font-mono,monospace);font-size:11px;letter-spacing:.06em;' +
      'text-transform:uppercase;color:var(--text-secondary,#b7aaa3);text-decoration:underline;text-underline-offset:3px;}' +
      '#ue-resume-link-button:hover{color:var(--text-primary,#f2ece4);}' +
      '#ue-resume-dismiss-button{flex:none;display:inline-flex;align-items:center;justify-content:center;' +
      'width:26px;height:26px;border-radius:50%;color:var(--text-secondary,#b7aaa3);background:transparent;' +
      'font-size:15px;line-height:1;}' +
      '#ue-resume-dismiss-button:hover{color:var(--text-primary,#f2ece4);background:rgba(255,255,255,0.08);}' +
      '@media (max-width:900px){#' + BAR_ID + '{bottom:calc(68px + 10px);left:8px;right:8px;padding:9px 12px;gap:10px;}' +
      '#ue-resume-message{font-size:11.5px;}}' +
      '@media (max-width:480px){#' + BAR_ID + '{max-width:none;}' +
      '#ue-resume-play-button{padding:5px 11px;font-size:10px;}}' +
      '@media (prefers-reduced-motion:reduce){#' + BAR_ID + '{transition:none!important;}}';
    document.head.appendChild(style);
  }

  /* Removes the bar immediately; the hidden live-announcer node is kept
     around briefly (with an updated announcement) so assistive tech has a
     chance to read it before it too is removed — removing both nodes in
     the same tick would very likely race the announcement out of
     existence. */
  function teardown(announceText) {
    if (typeof document === 'undefined') return;
    var barEl = document.getElementById(BAR_ID);
    if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl);
    var liveEl = document.getElementById(LIVE_ID);
    if (!liveEl) return;
    if (announceText) {
      liveEl.textContent = announceText;
      setTimeout(function () {
        if (liveEl.parentNode) liveEl.parentNode.removeChild(liveEl);
      }, 1500);
    } else if (liveEl.parentNode) {
      liveEl.parentNode.removeChild(liveEl);
    }
  }

  function currentPagePath() {
    try {
      return (window.location && typeof window.location.pathname === 'string') ? window.location.pathname : '/';
    } catch (err) {
      return '/';
    }
  }

  function collectPageHrefs() {
    try {
      var anchors = document.querySelectorAll('a[href]');
      var out = [];
      for (var i = 0; i < anchors.length; i++) {
        out.push(anchors[i].getAttribute('href'));
      }
      return out;
    } catch (err) {
      return [];
    }
  }

  function buildBar(promptState) {
    if (typeof document === 'undefined' || document.getElementById(BAR_ID)) return;
    injectStyles();

    var record = promptState.record;
    var label = record.title || 'this mix';
    var timeLabel = formatTime(record.position);

    var live = document.createElement('div');
    live.id = LIVE_ID;
    live.className = 'visually-hidden';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.setAttribute('role', 'status');

    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Resume listening');

    var message = document.createElement('span');
    message.id = 'ue-resume-message';
    message.textContent = 'Resume ' + label + ' at ' + timeLabel;

    var actions = document.createElement('div');
    actions.id = 'ue-resume-actions';

    var primary;
    if (promptState.hasTrackOnPage) {
      primary = document.createElement('button');
      primary.type = 'button';
      primary.id = 'ue-resume-play-button';
      primary.textContent = 'Resume';
      primary.setAttribute('aria-label', 'Resume ' + label + ' at ' + timeLabel);
      primary.addEventListener('click', createResumeHandler({
        ensurePlayer: function (cb) {
          if (window.UEBoot && typeof window.UEBoot.ensurePlayer === 'function') {
            window.UEBoot.ensurePlayer(cb);
          }
        },
        getHost: function () {
          return (window.UEPlayer && window.UEPlayer.host) || null;
        },
        txid: record.txid,
        startSec: record.position,
        onDone: function () { teardown('Resuming playback'); }
      }));
    } else {
      primary = document.createElement('a');
      primary.id = 'ue-resume-link-button';
      /* Built here rather than delegated to ue-links.js: that module's
         buildShareUrl() rewrites the CURRENT page's query string, while
         this link points at a DIFFERENT stored page whose `page` field
         only this file has validated (isValidPage/PAGE_RE). Both produce
         the identical "<page>?mix=<txid>", so reaching across modules
         would buy nothing and would widen this href's trust boundary. */
      primary.setAttribute('href', buildFallbackUrl(record.page, record.txid));
      primary.textContent = 'Go to mix';
      primary.setAttribute('aria-label', 'Go to ' + label);
    }

    var dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.id = 'ue-resume-dismiss-button';
    dismissBtn.setAttribute('aria-label', 'Dismiss resume prompt');
    dismissBtn.textContent = '✕';
    dismissBtn.addEventListener('click', function () {
      teardown('Resume prompt dismissed');
    });

    actions.appendChild(primary);
    actions.appendChild(dismissBtn);
    bar.appendChild(message);
    bar.appendChild(actions);

    document.body.appendChild(live);
    document.body.appendChild(bar);
  }

  /* One-shot per page view: reads the stored record (if any), decides
     Resume-button vs plain-link WITHOUT touching window.UEPlayer (see
     header comment — pageHasTxid works from the page's own anchors), and
     renders. A dismiss simply removes the DOM node — nothing re-shows it
     later in this same page view; a reload is a fresh call to initPrompt(). */
  function initPrompt() {
    var storage = getLocalStorage();
    var record = readRecord(storage, { now: Date.now(), ttlMs: TTL_MS });
    if (!record) return;

    var extractTxidFn = (window.UEPlayerCore && typeof window.UEPlayerCore.extractTxid === 'function')
      ? window.UEPlayerCore.extractTxid
      : null;
    var hasTrackOnPage = extractTxidFn ? pageHasTxid(collectPageHrefs(), record.txid, extractTxidFn) : false;

    buildBar({ record: record, hasTrackOnPage: hasTrackOnPage });
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

  function init() {
    try { initPrompt(); } catch (err) { /* progressive enhancement: never break the page */ }
    try {
      whenPlayerReady(function () {
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
