/* ==========================================================================
   Underground Existence — ue-mediasession.js

   Media Session integration. Progressive enhancement only: wires the
   lock-screen / Bluetooth-headset / notification-shade transport controls
   (Media Session API) to the verified player. Renders NO DOM of its own —
   the entire surface here is `navigator.mediaSession`, owned by the
   browser/OS, never a page element — so unlike the other two playability
   modules this file injects no `<style>` block.

   Hard rule (integration contract §3): every action handler routes
   EXCLUSIVELY through `window.UEPlayer.host` (play/pause/prev/next/seek/
   seekBy). This file never touches the `<audio>` element, never builds a
   URL, never reimplements seeking — player.js and player-core.js own all
   of that, unchanged.

   Per boot.js, this script is inserted (`loadScriptThen('js/ue-mediasession.js',
   null)`) right after player.js's own <script> onload fires and BEFORE
   `ue-player-ready` is dispatched — since script insertion is async and the
   event dispatch is synchronous in that same tick, by the time this file's
   top-level code actually runs, `window.UEPlayer.host` is already present
   (the ready event will already have fired). `whenPlayerReady()` below
   still exists and is used defensively per the integration contract's §3,
   so this file behaves correctly even if load order is ever changed to put
   it ahead of player.js.

   Testability rule (contract §2): every decision — metadata mapping,
   action-handler routing/clamping, position-state validity, feature-
   detected handler registration — is a pure, exported function. The only
   non-pure code is the thin `init()` wiring at the bottom, which no-ops
   immediately when `navigator.mediaSession` is absent and never throws
   under node:vm (no window/navigator/document).

   No autoplay: nothing in this file ever calls `host.play()` on its own —
   metadata/position/playbackState updates are one-way reflections of state
   the host already reports; the only paths that reach `host.play()` are
   the `play` action handler and (indirectly) `togglePlay`-shaped handlers,
   which the OS only invokes in response to a genuine user action (a
   physical media key, lock-screen tap, etc. — itself a user gesture).

   Classic IIFE, dual export tail — same pattern as player-core.js /
   ue-host-pref.js — loads identically as a plain browser
   <script src="js/ue-mediasession.js"> and inside node:vm in tests (see
   tests/helpers/load-ue-mediasession.mjs).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- constants ---------- */

  var DEFAULT_ALBUM = 'Underground Existence';
  var FALLBACK_ARTWORK_SRC = 'img/square-ue.png'; /* site cover, relative — matches
    the static Arweave path-manifest constraint (no absolute deploy hosts) */
  var ARTWORK_SIZES = ['96x96', '192x192', '512x512']; /* hint sizes only — we have
    one thumbnail per track, not real per-resolution renditions; browsers treat
    these as hints and still just decode whatever image is actually there */
  var DEFAULT_SEEK_OFFSET_SEC = 10;
  var POSITION_UPDATE_MIN_INTERVAL_MS = 1000; /* "at most ~1/sec" per spec */

  /* ---------- pure: metadata mapping ---------- */

  function resolveArtworkSrc(track) {
    if (track && typeof track.img === 'string' && track.img.trim()) return track.img;
    return FALLBACK_ARTWORK_SRC;
  }

  /* Best-effort MIME type from the file extension so MediaImage entries are
     well-formed; unknown/absent extension omits `type` entirely rather than
     guessing wrong — browsers fall back to sniffing the response. */
  function guessArtworkType(src) {
    var m = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(String(src || ''));
    if (!m) return null;
    var ext = m[1].toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'svg') return 'image/svg+xml';
    if (ext === 'png' || ext === 'webp' || ext === 'gif') return 'image/' + ext;
    return null;
  }

  /* Builds the plain init object handed to `new MediaMetadata(...)`. Pure —
     takes a queue-shaped track ({title, artist, img, ...}) and never reads
     any pipeline/thumbnail cache; a missing/relative/empty `track.img`
     resolves synchronously to the fallback, so this never blocks or waits
     on anything. `opts.album` exists only for tests; real callers never
     pass it, so the album is always the fixed site name. */
  function buildMetadataInit(track, opts) {
    var options = opts || {};
    var album = (typeof options.album === 'string' && options.album) ? options.album : DEFAULT_ALBUM;
    var src = resolveArtworkSrc(track);
    var type = guessArtworkType(src);
    var artwork = ARTWORK_SIZES.map(function (sizes) {
      var entry = { src: src, sizes: sizes };
      if (type) entry.type = type;
      return entry;
    });
    return {
      title: (track && typeof track.title === 'string' && track.title) ? track.title : '',
      artist: (track && typeof track.artist === 'string') ? track.artist : '',
      album: album,
      artwork: artwork
    };
  }

  /* ---------- pure: playback state mapping ---------- */

  /* `'track'` fires the instant a NEW track becomes active but before any
     audio has actually started (player.js's load() emits it, then the
     caller invokes play() separately — see player.js host bridge comment).
     This maps to 'paused', NOT 'none': every caller of playIndexAt()/next()/
     prev()/toggleIndex() calls play() synchronously right after load(), and
     a cold gateway can take several real seconds (measured 2-12s) to reach
     genuine first audio — during that whole window 'none' would tell the
     OS "nothing is loaded", which visibly BLANKS the lock-screen/notification
     surface between tracks (metadata included) rather than merely showing a
     paused transport with the new track's correct title/artist/art. 'paused'
     is also the technically accurate state (playback has not actually
     started yet). The immediately-following native `playing`/`pause` event
     fires the real 'playback' event with the true state once audio actually
     starts. */
  function resolvePlaybackState(kind, payload) {
    if (kind === 'playback') return (payload && payload.playing) ? 'playing' : 'paused';
    if (kind === 'track') return 'paused';
    return null;
  }

  /* ---------- pure: position-state guard ---------- */

  /* `setPositionState` throws in real browsers on incoherent input
     (negative/non-finite duration, position past duration, etc). Rather
     than rely on try/catch alone, validate first so a bad payload is a
     silent no-op instead of console noise. */
  function resolvePositionState(payload) {
    var p = payload || {};
    var duration = p.duration;
    var position = p.position;
    if (typeof duration !== 'number' || !isFinite(duration) || duration <= 0) return null;
    if (typeof position !== 'number' || !isFinite(position) || position < 0) return null;
    if (position > duration) return null;
    var rate = p.playbackRate;
    var playbackRate = (typeof rate === 'number' && isFinite(rate) && rate > 0) ? rate : 1;
    return { duration: duration, position: position, playbackRate: playbackRate };
  }

  /* Throttle helper for the frequent 'time' event — pure so the ~1/sec rule
     is unit-testable without a real clock. `lastEmitMs === null` (never
     emitted yet, or just reset on a track change) always allows. */
  function shouldEmitPosition(lastEmitMs, nowMs) {
    if (typeof nowMs !== 'number' || !isFinite(nowMs)) return false;
    if (typeof lastEmitMs !== 'number' || !isFinite(lastEmitMs)) return true;
    return (nowMs - lastEmitMs) >= POSITION_UPDATE_MIN_INTERVAL_MS;
  }

  /* ---------- pure: action-handler routing table ---------- */

  function safeCallReturn(fn, context) {
    if (typeof fn !== 'function') return null;
    try { return fn.call(context); } catch (err) { return null; }
  }

  function callHostMethod(host, name, arg) {
    if (!host || typeof host[name] !== 'function') return;
    try {
      if (arg === undefined) { host[name](); } else { host[name](arg); }
    } catch (err) { /* a broken host must never throw back into the browser's
      media-key/lock-screen dispatch */ }
  }

  function resolveSeekOffset(details) {
    var v = details && details.seekOffset;
    return (typeof v === 'number' && isFinite(v) && v > 0) ? v : DEFAULT_SEEK_OFFSET_SEC;
  }

  /* seekto's target time, clamped defensively: NaN/negative -> 0; beyond a
     KNOWN duration -> duration. When duration can't be read from the host,
     only the negative/NaN clamp applies — host.seek() itself also clamps
     to its own notion of duration (see player.js host.seek), so this is
     belt-and-braces, not the only guard. */
  function clampSeekTarget(seekTime, duration) {
    var t = (typeof seekTime === 'number' && isFinite(seekTime)) ? seekTime : 0;
    if (t < 0) t = 0;
    if (typeof duration === 'number' && isFinite(duration) && duration > 0 && t > duration) t = duration;
    return t;
  }

  /* Returns action -> handler. Every handler calls exactly one
     `window.UEPlayer.host` member — never the audio element, never a raw
     URL, never a re-implemented seek. `host` is injected so this is
     testable with a fake carrying spy functions instead of the real
     bridge. */
  function buildActionHandlers(host) {
    return {
      play: function () { callHostMethod(host, 'play'); },
      pause: function () { callHostMethod(host, 'pause'); },
      previoustrack: function () { callHostMethod(host, 'prev'); },
      nexttrack: function () { callHostMethod(host, 'next'); },
      seekbackward: function (details) {
        callHostMethod(host, 'seekBy', -resolveSeekOffset(details));
      },
      seekforward: function (details) {
        callHostMethod(host, 'seekBy', resolveSeekOffset(details));
      },
      seekto: function (details) {
        var duration = safeCallReturn(host && host.getDuration, host);
        var target = clampSeekTarget(details && details.seekTime, duration);
        callHostMethod(host, 'seek', target);
      }
    };
  }

  /* ---------- pure: feature-detected registration ---------- */

  /* Registers every handler in `handlers` on `mediaSessionLike`, one
     `setActionHandler` call at a time, each in its OWN try/catch. Safari
     throws `NotSupportedError` for actions it doesn't implement (observed
     for `seekto` on older versions) — one unsupported action must never
     stop the rest from registering. Returns which actions landed vs
     failed, for tests and for optional diagnostics; nothing downstream
     depends on the return value at runtime. */
  function registerHandlers(mediaSessionLike, handlers) {
    var result = { registered: [], failed: [] };
    var map = handlers || {};
    var actions = Object.keys(map);
    var canRegister = !!(mediaSessionLike && typeof mediaSessionLike.setActionHandler === 'function');
    for (var i = 0; i < actions.length; i++) {
      var action = actions[i];
      if (!canRegister) { result.failed.push(action); continue; }
      try {
        mediaSessionLike.setActionHandler(action, map[action]);
        result.registered.push(action);
      } catch (err) {
        result.failed.push(action);
      }
    }
    return result;
  }

  /* ---------- DOM/browser wiring (thin, feature-detected, no-op under vm) ---------- */

  function getMediaSession() {
    try {
      if (typeof navigator === 'undefined' || !navigator || !navigator.mediaSession) return null;
      return navigator.mediaSession;
    } catch (err) { return null; }
  }

  /* Contract §3 pattern, applied defensively: if `window.UEPlayer.host`
     already exists, run immediately; otherwise wait for the one-shot
     `ue-player-ready` document event. Every global touch is guarded so
     this never throws when window/document are absent (node:vm, or a
     load-order this file doesn't currently use). */
  function whenPlayerReady(cb) {
    try {
      if (typeof window !== 'undefined' && window && window.UEPlayer && window.UEPlayer.host) {
        cb();
        return;
      }
    } catch (err) { /* defensive */ }
    try {
      if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
        document.addEventListener('ue-player-ready', function () { cb(); }, { once: true });
      }
    } catch (err) { /* defensive */ }
  }

  function setMetadataSafe(mediaSession, track) {
    if (!mediaSession) return;
    if (typeof MediaMetadata === 'undefined') return; /* feature detect */
    try {
      mediaSession.metadata = new MediaMetadata(buildMetadataInit(track));
    } catch (err) { /* defensive */ }
  }

  function setPlaybackStateSafe(mediaSession, value) {
    if (!mediaSession || !value) return;
    try { mediaSession.playbackState = value; } catch (err) { /* defensive */ }
  }

  function setPositionStateSafe(mediaSession, state) {
    if (!mediaSession || !state) return;
    if (typeof mediaSession.setPositionState !== 'function') return; /* feature detect */
    try { mediaSession.setPositionState(state); } catch (err) { /* browsers throw on
      incoherent values even after our own guard — never let that reach the host */ }
  }

  /* Entry point. No-ops immediately (no listeners registered, nothing
     touched) when `navigator.mediaSession` is unsupported. Otherwise waits
     for the host bridge, pushes metadata/state for a track that is ALREADY
     active (see the comment on the initial-push block below), and wires
     exactly three subscriptions — 'track' (metadata + playbackState +
     allow an immediate next position update), 'playback' (playbackState),
     'time' (throttled position state) — plus the one-time action-handler
     registration. */
  function init() {
    var mediaSession = getMediaSession();
    if (!mediaSession) return;

    whenPlayerReady(function () {
      var host = (typeof window !== 'undefined' && window.UEPlayer) ? window.UEPlayer.host : null;
      if (!host || typeof host.on !== 'function') return;

      registerHandlers(mediaSession, buildActionHandlers(host));

      var lastPositionUpdateAt = null;

      /* boot.js injects this file from player.js's OWN onload (after
         `window.UEPlayer.host` already exists) and dispatches
         `ue-player-ready` before this script has even been fetched — so a
         feature module's user-gesture-triggered host.playIndexAt() (a deep
         link, Resume, or a plain first tap) can fire the very first 'track'
         event before this file has attached any listener at all. player.js's
         event bus never replays missed events to a late subscriber, so
         without this the lock-screen/notification surface would show no
         metadata until the NEXT track change. Cheap and idempotent: if
         nothing is playing yet this is just two no-ops (safeCallReturn ->
         null, setMetadataSafe/setPlaybackStateSafe no-op on falsy input). */
      var initialTrack = safeCallReturn(host.getCurrentTrack, host);
      if (initialTrack) {
        setMetadataSafe(mediaSession, initialTrack);
        var initialState = safeCallReturn(host.getState, host);
        setPlaybackStateSafe(mediaSession, (initialState && initialState.playing) ? 'playing' : 'paused');
      }

      host.on('track', function (payload) {
        setMetadataSafe(mediaSession, payload && payload.track);
        setPlaybackStateSafe(mediaSession, resolvePlaybackState('track', payload));
        lastPositionUpdateAt = null;
      });

      host.on('playback', function (payload) {
        setPlaybackStateSafe(mediaSession, resolvePlaybackState('playback', payload));
      });

      host.on('time', function (payload) {
        var now = Date.now();
        if (!shouldEmitPosition(lastPositionUpdateAt, now)) return;
        var posState = resolvePositionState({
          duration: payload && payload.duration,
          position: payload && payload.currentTime
        });
        if (!posState) return;
        lastPositionUpdateAt = now;
        setPositionStateSafe(mediaSession, posState);
      });
    });
  }

  init();

  /* ---------- exports ---------- */

  var UEMediaSession = {
    DEFAULT_ALBUM: DEFAULT_ALBUM,
    FALLBACK_ARTWORK_SRC: FALLBACK_ARTWORK_SRC,
    DEFAULT_SEEK_OFFSET_SEC: DEFAULT_SEEK_OFFSET_SEC,
    POSITION_UPDATE_MIN_INTERVAL_MS: POSITION_UPDATE_MIN_INTERVAL_MS,
    buildMetadataInit: buildMetadataInit,
    resolvePlaybackState: resolvePlaybackState,
    resolvePositionState: resolvePositionState,
    shouldEmitPosition: shouldEmitPosition,
    buildActionHandlers: buildActionHandlers,
    registerHandlers: registerHandlers
  };

  if (typeof module === 'object' && module.exports) { module.exports = UEMediaSession; }
  if (typeof window !== 'undefined') { window.UEMediaSession = UEMediaSession; }

})();
