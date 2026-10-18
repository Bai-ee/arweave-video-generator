/* ==========================================================================
   Underground Existence — boot.js
   Keeps the first mobile paint light. The full player hydrates only after
   user intent, or during idle time after the hero has had a chance to paint.
   ========================================================================== */
(function () {
  'use strict';

  var loaded = false;
  var loading = false;
  var queuedClick = null;

  /* The single shared <audio> element, created HERE (not in player.js) so it
     can be unlocked synchronously inside the real, trusted first-tap click
     handler below. player.js/player-core.js load via two chained dynamic
     <script>s (see loadPlayer()) — real network + parse + execute time, so
     by the time player.js exists the original gesture's call stack is long
     gone. WebKit's autoplay gate requires the first audio.play() to happen
     synchronously inside a genuine user gesture, so the unlock has to
     happen in this file, in this handler — not later, not replayed. */
  var audioEl = new Audio();
  window.__ueAudioEl = audioEl;

  /* A ~0.02ms silent WAV. WebKit's unlock is "this element played inside a
     gesture", and an element with NO source has nothing to play, so the
     unlock can be a no-op. Giving it a decodable silent source first makes
     the in-gesture play() a real (inaudible) playback. Verified to reach
     readyState 4 in Chrome 152; player.js overwrites src on the first real
     track load, so this never competes with a mix. */
  var SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  var unlocked = false;

  function unlockAudioElement() {
    if (unlocked) return;
    unlocked = true;
    try {
      audioEl.src = SILENT_WAV;
      var p = audioEl.play();
      if (p && p.catch) p.catch(function () { /* blocked anyway — nothing else to try */ });
    } catch (err) { /* ok */ }
    try { audioEl.pause(); } catch (err) { /* ok */ }
  }

  /* ---------- shared player-core.js loader ----------
     player-core.js is a dependency of BOTH the eager gateway-warming chain
     below (ue-host-pref.js / ue-warm.js both read window.UEPlayerCore at
     load time) and the lazy player.js chain in loadPlayer(). It must only
     ever be fetched/executed once — two independent <script> insertions
     would race two separate onload chains against each other and re-run
     the IIFE a second time for no benefit. Whichever caller asks first
     (in practice the warming chain, which starts synchronously below,
     almost always wins the race) starts the single load; every other
     caller just queues onto it. */
  var coreLoaded = false;
  var coreLoading = false;
  var coreCallbacks = [];
  function loadCore(cb) {
    if (coreLoaded) { if (cb) cb(true); return; }
    if (coreLoading) { if (cb) coreCallbacks.push(cb); return; }
    coreLoading = true;
    if (cb) coreCallbacks.push(cb);
    var coreScript = document.createElement('script');
    coreScript.src = 'js/player-core.js';
    coreScript.defer = true;
    coreScript.onload = function () {
      coreLoaded = true;
      coreLoading = false;
      var cbs = coreCallbacks;
      coreCallbacks = [];
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](true); } catch (err) { /* one bad callback must not break the rest */ }
      }
    };
    coreScript.onerror = function () {
      coreLoading = false;
      var cbs = coreCallbacks;
      coreCallbacks = [];
      for (var i = 0; i < cbs.length; i++) {
        try { cbs[i](false); } catch (err) { /* ok */ }
      }
    };
    document.head.appendChild(coreScript);
  }

  /* ---------- eager gateway-warming chain ----------
     Warming (ue-host-pref.js's gateway-preference hint, then ue-warm.js's
     range-warming queue) needs to start earlier than the full player, so
     it is NOT gated on idle/first-intent the way player.js is below — it
     loads as soon as this script runs. Only these two small, pure modules
     are eager; player.js itself stays on its existing lazy path.

     Order matters: ue-host-pref.js and ue-warm.js both read
     window.UEPlayerCore at load time, and dynamically inserted <script>s
     execute out of order relative to each other unless explicitly
     chained — so each script in this chain is only injected from the
     PRIOR one's onload, exactly like the core->player chain below it.
     Any link failing to load (network error, or simply not having landed
     yet from the concurrent work building it) stops the chain right
     there and must never throw or block player.js — every consumer of
     these globals (player.js included) already checks for their presence
     defensively before using them. */
  function loadScriptThen(src, next) {
    var s = document.createElement('script');
    s.src = src;
    s.defer = true;
    s.onload = function () {
      try { if (next) next(); } catch (err) { /* degrade silently */ }
    };
    s.onerror = function () { /* chain simply stops here; nothing downstream
      of a missing module is ever hard-depended on */ };
    document.head.appendChild(s);
  }
  loadCore(function (ok) {
    if (!ok) return;
    loadScriptThen('js/ue-host-pref.js', function () {
      loadScriptThen('js/ue-warm.js', function () {
        /* Playability modules (deep links/share, Resume Listening). Eager
           like warming rather than lazy like player.js, because both do
           their work on the FIRST paint — highlighting the mix a shared
           link points at, and offering the resume prompt — long before the
           player itself hydrates. Both are pure progressive enhancement:
           they read window.UEPlayerCore for txid parsing, wait for the
           `ue-player-ready` event before touching window.UEPlayer, and
           start playback only through window.UEPlayer.host, never by
           driving the <audio> element themselves. */
        loadScriptThen('js/ue-links.js', function () {
          loadScriptThen('js/ue-resume.js', null);
        });
      });
    });
  });

  function loadPlayer(afterLoad) {
    if (loaded) {
      if (afterLoad) afterLoad();
      return;
    }
    if (loading) {
      if (afterLoad) document.addEventListener('ue-player-ready', afterLoad, { once: true });
      return;
    }
    loading = true;
    /* player.js depends on window.UEPlayerCore (the state-machine module).
       loadCore() above is idempotent — this reuses the eager chain's core
       load if it already started (the common case) instead of injecting a
       second <script src="js/player-core.js">. player.js itself guards on
       window.UEPlayerCore and will not throw if this ever fails, but
       there's nothing useful to load without it. */
    loadCore(function (ok) {
      if (!ok) { loading = false; return; }
      var script = document.createElement('script');
      script.src = 'js/player.js';
      script.defer = true;
      script.onload = function () {
        loaded = true;
        loading = false;
        /* Media Session lives with the player, not with the eager chain:
           it has nothing to do until there is a window.UEPlayer.host to
           route lock-screen/Bluetooth controls into. Loaded here rather
           than chained before the ready event so a missing/failing
           ue-mediasession.js can never delay or block player hydration. */
        loadScriptThen('js/ue-mediasession.js', null);
        document.dispatchEvent(new CustomEvent('ue-player-ready'));
        if (afterLoad) afterLoad();
      };
      script.onerror = function () {
        loading = false;
      };
      document.head.appendChild(script);
    });
  }

  /* This replay is for UI wiring ONLY — it is what lets the tapped element
     actually select/toggle a track once player.js has hydrated. It must
     NOT be relied on to carry the user gesture for audio.play(): the
     dispatched event is constructed via `new MouseEvent(...)`, so
     `isTrusted` is unconditionally false, and it fires after a
     setTimeout(0) macrotask boundary on top of the async script load that
     already happened — neither a trusted gesture nor synchronous with one.
     The actual autoplay unlock happens earlier, synchronously, in the real
     click handler below. */
  function replayQueuedClick() {
    if (!queuedClick) return;
    var target = queuedClick;
    queuedClick = null;
    setTimeout(function () {
      if (target && target.dispatchEvent) {
        target.dispatchEvent(new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        }));
      }
    }, 0);
  }

  var PLAY_TARGET_SELECTOR = '.play-circle, a[data-playlist], a[data-link]';

  document.addEventListener('click', function (event) {
    if (loaded || loading) return;
    var target = event.target && event.target.closest
      ? event.target.closest('.play-circle, a[data-playlist], a[data-link], a[data-download], #nav-search-toggle, #mobile-search-toggle, #mobile-menu-toggle')
      : null;
    if (!target) return;
    event.preventDefault();
    /* Unlock the shared <audio> element right here, synchronously, inside
       this real/trusted gesture — an untrusted, later-replayed click (see
       replayQueuedClick above) cannot carry a user gesture, so this is the
       only place the first unlock can legitimately happen. Only for
       targets that actually start playback; a search/menu/download tap
       should not touch the audio element at all. play() is expected to
       reject (no src is set yet) — the rejection is swallowed and ignored,
       only the synchronous call-inside-a-gesture matters for the unlock. */
    if (target.matches && target.matches(PLAY_TARGET_SELECTOR)) {
      unlockAudioElement();
    }
    queuedClick = target;
    loadPlayer(replayQueuedClick);
  }, true);

  /* ---------- public hydration entry point for feature modules ----------
     A "Resume" prompt button or a share/deep-link affordance can be tapped
     before the player has hydrated. Those modules must not reimplement the
     unlock/load dance, and must not dispatch synthetic clicks at play
     controls (a synthetic click is never `isTrusted`, so it carries no
     gesture). They call this instead, synchronously inside their own real
     click handler: the element is unlocked inside that genuine gesture,
     then the callback runs once player.js is live. */
  function ensurePlayer(afterLoad) {
    /* Only ever unlock before the player owns the element: the unlock
       assigns the silent WAV, which would clobber a mix that is already
       loaded/playing. (`unlocked` additionally makes it once-only.) */
    if (!loaded && !audioEl.currentSrc) unlockAudioElement();
    loadPlayer(afterLoad);
  }
  window.UEBoot = {
    ensurePlayer: ensurePlayer,
    isPlayerLoaded: function () { return loaded; }
  };

  function idleLoad() {
    loadPlayer();
  }

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(idleLoad, { timeout: 3500 });
  } else {
    setTimeout(idleLoad, 3000);
  }
})();
