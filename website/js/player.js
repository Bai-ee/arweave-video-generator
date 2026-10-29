/* ==========================================================================
   Underground Existence — player.js
   Custom audio player + interactive waveform scrubber,
   persistent bottom bar, search overlay, mobile menu, restrained motion.

   Playback contract: queue is built from anchors carrying
   [data-playlist] / [data-link] with data-title, data-artist, data-img,
   href = mix audio URL (canonical arweave.net/<txid>).

   Source selection / seeking / recovery: delegated entirely to the pure
   state machine in player-core.js (window.UEPlayerCore). This file is the
   "host" — it owns the real <audio> element, the DOM, and pointer/keyboard
   input, and executes the plain command objects the controller returns. It
   never invents playback policy of its own (no tiers, no ad-hoc retries).
   The one piece of policy that intentionally lives HERE and not in the
   module is "a seek requested before the active candidate's range probe
   has resolved" — see attemptSeek()/tryApplyPendingUserSeek() below; that
   is a per-integration-contract requirement so player-core.js's tests stay
   untouched.
   See docs/plans/UNDERGROUND_EXISTENCE_AUDIO_STREAMING_REMEDIATION_MASTER_PLAN.md
   (Bballi_Portfolio repo).
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- utilities ---------- */

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = h > 0 && m < 10 ? '0' + m : String(m);
    var ss = s < 10 ? '0' + s : String(s);
    return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss;
  }

  /* deterministic PRNG seeded from a string (audio URL) so every render of a
     mix draws the same waveform */
  function seededRandom(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      return ((h >>> 0) % 10000) / 10000;
    };
  }

  function buildBars(seedStr, count) {
    var rnd = seededRandom(seedStr || 'ue');
    var bars = [];
    var carry = 0.5;
    for (var i = 0; i < count; i++) {
      var t = i / count;
      var envelope = 0.55 + 0.45 * Math.sin(t * Math.PI * (1.5 + rnd() * 2)) * Math.sin(t * 43 + rnd() * 6);
      carry = carry * 0.55 + rnd() * 0.45;
      var v = Math.max(0.08, Math.min(1, Math.abs(envelope) * 0.6 + carry * 0.55));
      bars.push(v);
    }
    return bars;
  }

  /* ---------- waveform colours (theme tokens, resolved per canvas) ----------
     Resolved from the CANVAS, not from <html>: in the light theme the chrome
     stays dark, so the player bar / header / search overlay are near-black
     islands that re-declare these tokens on their own subtree. The hero
     waveform (on paper) and the player-bar waveform (on the dark chrome) must
     therefore paint different colours at the same time. Custom properties
     inherit down the tree, so getComputedStyle(canvas) sees whichever
     declaration actually wins for that canvas.

     The canvas redraws on every timeupdate while a mix plays, so getComputedStyle
     must never run inside the bar loop or per frame. Each Waveform caches its own
     resolved triplet on itself; a hit is three reads off a plain object. The
     theme toggle's ue:themechange event bumps a module-level generation counter,
     which invalidates every instance at once. A missing or empty custom property
     falls back to the literal this file shipped with, keeping today's rendering. */
  var WAVE_FALLBACK_PLAYED = '#ffffff';
  var WAVE_FALLBACK_UNPLAYED = 'rgba(242, 236, 228, 0.82)';
  var WAVE_FALLBACK_REMAINING = 'rgba(154, 143, 138, 0.55)';
  var waveThemeGeneration = 0;

  function readToken(cs, name, fallback) {
    if (!cs) return fallback;
    var v = cs.getPropertyValue(name);
    v = v ? v.trim() : '';
    return v || fallback;
  }

  function currentThemeKey() {
    var root = document.documentElement;
    return (root && root.dataset && root.dataset.theme) || '';
  }

  /* Live waveform registry. Invalidating the caches is not enough on its own:
     each canvas still holds pixels painted in the OLD theme's colours, and when
     audio is idle nothing schedules a natural redraw — toggling to dark left the
     hero waveform painting dark ink on a dark page until a seek forced a draw.
     So the toggle has to repaint. Entries are WeakRefs, so registering an
     instance never keeps it (or its canvas) alive; entries that have been
     collected are compacted out while iterating, which bounds the array over a
     long session. A detached-but-live instance is skipped for the redraw yet
     KEPT in the registry, so a canvas that is re-attached later still repaints.
     This page builds exactly two waveforms, both at boot, but Waveform is a
     generic constructor and must not leak if that ever changes. */
  var HAS_WEAKREF = typeof WeakRef === 'function';
  var waveInstances = [];

  function registerWaveform(wf) {
    /* no WeakRef (older browsers) -> hold it strongly rather than lose the
       repaint; the registry is still compacted, just never by collection */
    waveInstances.push(HAS_WEAKREF ? new WeakRef(wf) : { deref: function () { return wf; } });
  }

  function redrawLiveWaveforms() {
    var kept = [];
    for (var i = 0; i < waveInstances.length; i++) {
      var entry = waveInstances[i];
      var wf = null;
      try { wf = entry.deref(); } catch (err) { wf = null; }
      if (!wf) continue; /* collected — drop the entry */
      kept.push(entry);
      var el = wf.canvas;
      var connected = el && (typeof el.isConnected === 'boolean' ? el.isConnected : true);
      if (!connected) continue; /* out of the document: nothing to repaint yet */
      /* draw() takes no arguments and repaints purely from state the instance
         already retains (bars, progress, active, w/h/dpr), so this reproduces
         the current frame in the new colours — never a reset to zero and never
         a lost progress position, even mid-playback. */
      try { wf.draw(); } catch (err) { /* one bad canvas must not stop the rest */ }
    }
    waveInstances = kept;
  }

  window.addEventListener('ue:themechange', function () {
    /* a throw in here would break the toggle itself, and the player with it */
    try {
      waveThemeGeneration++;
      redrawLiveWaveforms();
    } catch (err) { /* ignore */ }
  });

  /* ---------- waveform renderer (canvas, progress display only) ---------- */

  function Waveform(container, opts) {
    this.container = container;
    this.opts = opts || {};
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.progress = 0;
    this.seed = '';
    this.bars = [];
    this.active = false;
    /* per-instance colour cache — see the waveform colours note above */
    this.colors = null;
    this.colorsTheme = null;
    this.colorsGen = -1;
    this.colorsConnected = null;
    registerWaveform(this);
    var self = this;
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(function () { self.resize(); });
      this.ro.observe(container);
    } else {
      window.addEventListener('resize', function () { self.resize(); });
    }
    this.resize();
  }
  Waveform.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = this.container.clientWidth;
    var h = this.container.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.w = w; this.h = h; this.dpr = dpr;
    var unit = this.opts.mini ? 3 : 4;
    var count = Math.max(24, Math.floor(w / unit));
    if (this.seedCount !== count || this._lastSeed !== this.seed) {
      this.bars = buildBars(this.seed, count);
      this.seedCount = count;
      this._lastSeed = this.seed;
    }
    this.draw();
  };
  Waveform.prototype.setTrack = function (seed) {
    if (seed === this.seed) return;
    this.seed = seed;
    this.bars = buildBars(seed, this.seedCount || 120);
    this._lastSeed = seed;
    this.draw();
  };
  Waveform.prototype.setProgress = function (p, active) {
    this.progress = Math.max(0, Math.min(1, p || 0));
    this.active = !!active;
    this.draw();
  };
  /* Resolves this canvas's three token colours, at most once per draw and in
     practice once per theme change — the cache hit path touches no CSSOM. The
     key is the theme, the invalidation generation, and whether the canvas was
     in the document when the values were read (a canvas resolved while detached
     inherits nothing, so it must re-resolve once it is attached). */
  Waveform.prototype.resolveColors = function () {
    var el = this.canvas;
    var connected = typeof el.isConnected === 'boolean' ? el.isConnected : true;
    var theme = currentThemeKey();
    if (this.colors
      && this.colorsTheme === theme
      && this.colorsGen === waveThemeGeneration
      && this.colorsConnected === connected) {
      return this.colors;
    }
    var cs = null;
    try { cs = getComputedStyle(el); } catch (err) { cs = null; }
    this.colorsTheme = theme;
    this.colorsGen = waveThemeGeneration;
    this.colorsConnected = connected;
    this.colors = {
      played: readToken(cs, '--wave-played', WAVE_FALLBACK_PLAYED),
      unplayed: readToken(cs, '--wave-unplayed', WAVE_FALLBACK_UNPLAYED),
      remaining: readToken(cs, '--wave-remaining', WAVE_FALLBACK_REMAINING)
    };
    return this.colors;
  };
  Waveform.prototype.draw = function () {
    var ctx = this.canvas.getContext('2d');
    if (!ctx || !this.w) return;
    var dpr = this.dpr, w = this.w, h = this.h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var n = this.bars.length;
    if (!n) return;
    var gap = this.opts.mini ? 1 : 1.4;
    var bw = (w - gap * (n - 1)) / n;
    var mid = h / 2;
    var colors = this.resolveColors();
    for (var i = 0; i < n; i++) {
      var t = i / n;
      var bh = Math.max(2, this.bars[i] * h * 0.94);
      var x = i * (bw + gap);
      if (this.active && t <= this.progress) {
        ctx.fillStyle = colors.played;
      } else if (t < 0.66) {
        ctx.fillStyle = colors.unplayed;
      } else {
        ctx.fillStyle = colors.remaining;
      }
      ctx.fillRect(x, mid - bh / 2, Math.max(1, bw), bh);
    }
  };

  /* ---------- test/debug query flags ----------
     ?uedebug=1              -> renders a fixed, inert diagnostic overlay
                                (see bottom of this file). Off by default,
                                never affects playback.
     ?uefail=<substring>            -> rewrites any candidate whose host
                                        contains <substring> to an
                                        unreachable (.invalid) URL so a real
                                        gateway failure can be exercised in
                                        a browser.
     ?uefail=<a>,<b>                -> comma-separated list, matches any.
     ?uefail=all                    -> rewrites every candidate (exercises
                                        "both gateways down" terminal state).
     Inert without the flag. Test-only. */
  function readQueryFlag(name) {
    try {
      var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search || '');
      return m ? decodeURIComponent(m[1]) : null;
    } catch (err) { return null; }
  }
  var UEDEBUG = readQueryFlag('uedebug') === '1';
  var UEFAIL_RAW = readQueryFlag('uefail');
  var UEFAIL_ALL = UEFAIL_RAW === 'all';
  var UEFAIL_TERMS = (!UEFAIL_ALL && UEFAIL_RAW)
    ? UEFAIL_RAW.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; })
    : [];

  /* ---------- collect queue from the page ---------- */

  /* Adopt the shared <audio> element boot.js creates and unlocks
     synchronously inside the real first-tap gesture (see boot.js). By the
     time this file has loaded — via boot.js's two chained dynamic
     <script>s — the original gesture's call stack is long gone, so THIS
     file must never be the one attempting the first unlock; it only
     adopts an element that (on the mobile-first-tap path) is already
     unlocked. Falls back to a fresh Audio() so this file still works if
     ever loaded standalone (no boot.js in front of it). */
  var audio = window.__ueAudioEl || new Audio();
  audio.preload = 'none';

  var queueEls = Array.prototype.slice.call(
    document.querySelectorAll('a[data-playlist], a[data-link]')
  ).filter(function (el) {
    var href = el.getAttribute('href') || '';
    return el.getAttribute('data-unplayable') !== 'true' && /^https?:\/\//.test(href);
  });

  var queue = queueEls.map(function (el, i) {
    el.setAttribute('data-queue-idx', String(i));
    /* the card/row play button lives next to the cover anchor — give it the
       same queue index so both control the same track */
    var host = el.closest ? el.closest('.mix-card, .catalog-row') : null;
    if (host) {
      var circles = host.querySelectorAll('.play-circle');
      for (var c = 0; c < circles.length; c++) {
        circles[c].setAttribute('data-queue-idx', String(i));
      }
    }
    return {
      el: el,
      url: el.getAttribute('href'),
      title: el.getAttribute('data-title') || 'Untitled Mix',
      artist: el.getAttribute('data-artist') || '',
      img: el.getAttribute('data-img') || '',
      page: el.getAttribute('data-page') || '',
      durationSec: parseInt(el.getAttribute('data-duration-sec') || '0', 10) || 0
    };
  });

  var state = {
    index: -1,
    playing: false,
    shuffle: false,
    repeat: 'off' // off | all | one
  };

  /* ---------- playback engine state ----------
     activeController: the current track's UEPlayerCore controller (rebuilt
     on every load()). currentGeneration: the generation stamped on the last
     setSrc command we actually executed — every event we forward to the
     controller carries this, so a stale async callback (an abandoned probe,
     a late native media event from a source we've already replaced) can
     never mutate state it no longer owns; the controller itself drops any
     event whose generation doesn't match its own. */
  var activeController = null;
  var currentGeneration = 0;
  var pendingResumeTime = 0; /* resumeTime from the last setSrc command, applied once loadedmetadata fires */
  var confirmedHostByTxid = {}; /* in-memory only, no storage — session-scoped per plan */
  var currentTrackTxid = null; /* the ACTIVE track's txid, set once per load()
    (warming-contract Fix 2) — every setSrc command executed for the
    lifetime of this same track/controller (initial play, mid-track
    failover, retry) refers to this same txid, so this is computed once in
    load() rather than re-derived from each individual setSrc command's
    (candidate, not canonical) url. Used only to tell ue-warm.js which
    txid a real playback load is now competing with — see execCommand's
    'setSrc' case below. */

  /* Has the CURRENT track load ever reached a genuine native 'playing'
     event? Host-layer only (see hasPlayedThisLoad usage in execCommand's
     'status' case and play() below) — gates whether a 'buffering' status
     command is honoured. Reset only where a fresh cold start actually
     begins (play()'s idle branch); see the comment there for why load()
     itself doesn't need to touch this. */
  var hasPlayedThisLoad = false;

  /* pending user seek requested before the active candidate's range probe
     resolved — see attemptSeek()/tryApplyPendingUserSeek(). Host-layer only,
     player-core.js knows nothing about this. */
  var pendingUserSeek = null; /* { time, controller, watchIndex } | null */

  /* A start position requested by an optional feature module (a `?t=` deep
     link, a Resume Listening record) for the NEXT playback of a track, in
     seconds. Deliberately NOT applied at request time: it is applied once
     `loadedmetadata` lands (duration known, currentTime assignment valid)
     and then only through attemptSeek() — the same verified hold-until-
     range-confirmed path a user scrub takes. Applying it earlier would
     assign audio.currentTime with no seekable range yet, produce no
     `seeked`, and burn player-core.js's seek-timeout budget on a healthy
     candidate. Cleared by load() so it can never leak onto a later track. */
  var pendingStartTime = null;

  /* A track OFFERED in the bar's now-playing slot without loading any audio
     — "resume at 0:52", "a shared link that starts at 1:23". Presentation
     plus one queued intent: no src, no probe, no controller, no autoplay.
     The bar's own play button consumes it through the normal playIndexAt()
     path. Null whenever nothing is primed. See the "primed player bar"
     section (window.uePlayerBar) below for the full rules. */
  var primed = null; /* { index, startSec, title, artist, img, href, filename, label, source } | null */

  var LOG_RING_SIZE = 100;
  var logRing = [];
  var lastRecoveryReason = null;
  function pushLogEntry(entry) {
    if (!entry) return;
    try { console.debug('[UEPlayer]', entry); } catch (err) { /* no console in this environment */ }
    logRing.push(entry);
    if (logRing.length > LOG_RING_SIZE) logRing.shift();
    if (entry.event === 'recovery' && entry.reason) lastRecoveryReason = entry.reason;
  }

  /* debug/inspection handle (also used by ops to verify playback) */
  window.UEPlayer = { audio: audio, state: state, queue: queue, debug: {} };
  Object.defineProperty(window.UEPlayer.debug, 'controller', { enumerable: true, get: function () { return activeController; } });
  window.UEPlayer.debug.snapshot = function () {
    if (!activeController) return null;
    var snap = activeController.snapshot();
    snap.lastRecoveryReason = lastRecoveryReason;
    return snap;
  };
  window.UEPlayer.debug.log = logRing;

  /* ---------- DOM refs ---------- */

  var bar = document.getElementById('persistent-player-bar');
  var barThumb = document.getElementById('player-bar-thumb');
  var barTitle = document.getElementById('player-bar-title');
  var barArtist = document.getElementById('player-bar-artist');
  var barPlayBtn = document.getElementById('player-bar-play');
  var btnPrev = document.getElementById('player-bar-prev');
  var btnNext = document.getElementById('player-bar-next');
  var btnShuffle = document.getElementById('player-bar-shuffle');
  var btnRepeat = document.getElementById('player-bar-repeat');
  var barTimeCur = document.getElementById('player-bar-time-current');
  var barTimeTot = document.getElementById('player-bar-time-total');
  var volumeSlider = document.getElementById('volume-slider');

  var barWave = null;
  var barWaveEl = document.getElementById('player-bar-waveform');
  if (barWaveEl) barWave = new Waveform(barWaveEl, { mini: true });

  var heroWave = null;
  var heroWaveEl = document.querySelector('#featured-waveform .waveform-track');
  var heroProgressLineEl = document.querySelector('#featured-waveform .waveform-progress-line');
  var heroTimeCur = document.querySelector('#featured-waveform .time-current');
  var heroTimeTot = document.querySelector('#featured-waveform .time-total');
  var heroFill = document.querySelector('#featured-waveform .progress-fill');
  var heroDot = document.querySelector('#featured-waveform .progress-dot');
  var heroPlayBtn = document.getElementById('featured-play-button');
  var heroIdx = -1;
  if (heroWaveEl) {
    heroWave = new Waveform(heroWaveEl, { mini: false });
    var featuredAnchor = document.querySelector('a[data-featured-mix]');
    if (featuredAnchor) {
      heroIdx = parseInt(featuredAnchor.getAttribute('data-queue-idx') || '-1', 10);
      heroWave.setTrack(featuredAnchor.getAttribute('href') || '');
      if (heroTimeTot) {
        var fd = parseInt(featuredAnchor.getAttribute('data-duration-sec') || '0', 10);
        if (fd > 0) heroTimeTot.textContent = formatTime(fd);
      }
    }
  }

  /* ---------- the hero follows whatever is playing ----------
     The hero is not a fixed slot: play a mix from a selector tile and the hero
     BECOMES that mix — its film, its title, its artist, its meta and its
     transport.

     Why this is one pointer and not a pile of updates: every hero-side
     behaviour in this file already keys off `heroIdx` — the status region, the
     progress paint, the play-state, and both scrubbers (which take a getter,
     `function () { return heroIdx; }`, so they re-read it on every gesture).
     Moving that one variable re-targets all of it. The rest of this function is
     the visible copy and the featured anchor's own attributes, which MUST agree
     with the pointer — otherwise the hero shows one mix and plays another.

     The media itself (the mix's promo film, or its artwork wearing the
     handwritten mark) is the hero script's job in the index template; it
     listens for the `ue-hero-repointed` event fired at the end. */
  function heroMetaChip(iconId, text) {
    var span = document.createElement('span');
    span.className = 'meta-chip';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icon-svg');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#' + iconId);
    svg.appendChild(use);
    span.appendChild(svg);
    span.appendChild(document.createTextNode(' ' + text));
    return span;
  }

  function heroMetaDot() {
    var dot = document.createElement('span');
    dot.className = 'meta-dot';
    dot.innerHTML = '&middot;';
    return dot;
  }

  /* The meta row is rebuilt from the CARD the track came from rather than from
     artists.json: the card already displays this mix's genre, duration and date
     in the same .meta-chip shape, so cloning them cannot disagree with the grid
     and needs no second fetch. A track with no card (the featured anchor, or an
     artist-page row) simply keeps the row it has. */
  function heroMetaFromCard(card) {
    if (!card) return null;
    var row = document.createDocumentFragment();
    var genreEl = card.querySelector('.mix-card-genres');
    var wrote = false;
    if (genreEl && genreEl.textContent.trim()) {
      row.appendChild(heroMetaChip('i-wave', genreEl.textContent.trim()));
      wrote = true;
    }
    var chips = card.querySelectorAll('.mix-card-meta .meta-chip, .catalog-row-meta-cell .meta-chip');
    for (var i = 0; i < chips.length; i++) {
      if (wrote) row.appendChild(heroMetaDot());
      row.appendChild(chips[i].cloneNode(true));
      wrote = true;
    }
    return wrote ? row : null;
  }

  /* Mix credits (generator homepageCredits, shipped as data-mix-credits on the
     player bar every page carries): a "Live @ Viva Acid" set shows its DJs on
     the title line and the event title on the small line. Visible text only —
     every anchor's data-title/-artist stay the real record. Null for every mix
     without a credit. */
  var mixCredits;
  function heroCreditFor(url) {
    if (!mixCredits) {
      mixCredits = {};
      var host = document.getElementById('persistent-player-bar');
      try { mixCredits = JSON.parse((host && host.getAttribute('data-mix-credits')) || '{}'); } catch (err) { mixCredits = {}; }
    }
    var m = /\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/.exec(url || '');
    return (m && mixCredits[m[1]]) || null;
  }

  /* The two visible lines for a mix, everywhere it is shown: artist (or the
     credited DJs) first, the mix title second — the homepage tiles' order. */
  function displayLines(url, title, artist) {
    var credit = heroCreditFor(url);
    return credit ? { line1: credit.title, line2: credit.sub } : { line1: artist || '', line2: title || '' };
  }

  function pointHeroAt(idx) {
    if (!featuredAnchor || idx < 0 || idx === heroIdx) return;
    var track = queue[idx];
    if (!track || !track.el) return;
    var a = track.el;
    var card = a.closest ? a.closest('.mix-card, .catalog-row') : null;
    var attr = function (n) { return a.getAttribute(n) || ''; };

    var credit = heroCreditFor(track.url);
    var titleEl = document.getElementById('featured-mix-title');
    // Homepage reads artist first: artist (or credited DJs) as the title,
    // the mix title as the signature line. The name is a link to the DJ's
    // own page (same href #featured-artist-signature gets below) — update
    // the inner <a>, not the <h1>, so the link survives every repoint.
    if (titleEl) {
      var titleLink = titleEl.querySelector('a') || titleEl;
      titleLink.textContent = credit ? credit.title : track.artist;
      if (titleLink !== titleEl && attr('data-page')) titleLink.setAttribute('href', attr('data-page'));
    }

    var sigEl = document.getElementById('featured-artist-signature');
    if (sigEl) {
      sigEl.textContent = credit ? credit.sub : track.title;
      if (attr('data-page')) sigEl.setAttribute('href', attr('data-page'));
    }

    var metaRow = document.getElementById('featured-meta-row');
    var meta = heroMetaFromCard(card);
    if (metaRow && meta) {
      metaRow.innerHTML = '';
      metaRow.appendChild(meta);
    }

    /* the featured anchor IS a queue entry, so repointing its index is what
       makes the hero's own play button control this track */
    heroIdx = idx;
    featuredAnchor.setAttribute('data-queue-idx', String(idx));
    featuredAnchor.setAttribute('href', track.url);
    featuredAnchor.setAttribute('data-title', track.title);
    featuredAnchor.setAttribute('data-artist', track.artist);
    featuredAnchor.setAttribute('data-img', track.img);
    featuredAnchor.setAttribute('data-duration-sec', String(track.durationSec || 0));
    featuredAnchor.setAttribute('data-page', attr('data-page'));
    featuredAnchor.setAttribute('data-video', attr('data-video'));

    var filename = (track.artist ? track.artist + ' - ' : '') + track.title;
    var dlBtn = document.getElementById('featured-download-button');
    if (dlBtn) {
      dlBtn.setAttribute('href', track.url);
      dlBtn.setAttribute('data-filename', filename);
    }
    if (heroStatusRefs && heroStatusRefs.downloadLink) {
      heroStatusRefs.downloadLink.href = track.url;
      heroStatusRefs.downloadLink.setAttribute('data-filename', filename);
    }

    if (heroWave) heroWave.setTrack(track.url);
    if (heroTimeTot) heroTimeTot.textContent = track.durationSec > 0 ? formatTime(track.durationSec) : '--:--';
    if (heroTimeCur) heroTimeCur.textContent = '0:00';
    /* syncButtons() and updateSeekDisabled() are not called here — loadIndex(),
       the only caller, runs both a few lines later for this same track. */

    try {
      document.dispatchEvent(new CustomEvent('ue-hero-repointed', {
        detail: {
          title: track.title,
          artist: track.artist,
          image: track.img,
          video: attr('data-video'),
          page: attr('data-page')
        }
      }));
    } catch (err) { /* older engines: the hero keeps the media it is showing */ }
  }

  /* ---------- status / retry / error surface ----------
     Exact DOM tree, ids, copy, and class contract per UI-CONTRACT.md
     (agent C). Built once per surface at startup; degrades to null when the
     parent node is missing (artist pages may lack the hero). */
  function buildStatusRegion(prefix, parentEl) {
    if (!parentEl) return null;
    var live = document.createElement('div');
    live.id = prefix + '-status-live';
    live.className = 'visually-hidden';
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    live.setAttribute('role', 'status');

    var region = document.createElement('div');
    region.id = prefix + '-status-region';
    region.className = 'player-status-region';

    var icon = document.createElement('span');
    icon.id = prefix + '-status-icon';
    icon.className = 'player-status-icon';
    icon.setAttribute('aria-hidden', 'true');

    var text = document.createElement('span');
    text.id = prefix + '-status-text';
    text.className = 'player-status-text';

    var actions = document.createElement('div');
    actions.id = prefix + '-status-actions';
    actions.className = 'player-status-actions';

    var retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.id = prefix + '-retry-button';
    retryBtn.className = 'player-status-retry-button';
    retryBtn.textContent = 'Retry';

    var dl = document.createElement('a');
    dl.id = prefix + '-status-download-link';
    dl.className = 'download-btn download-btn--sm';
    dl.setAttribute('data-download', '');
    dl.setAttribute('aria-label', 'Download mix');
    dl.innerHTML = '<svg class="icon-svg"><use href="#i-download"></use></svg>';

    actions.appendChild(retryBtn);
    actions.appendChild(dl);
    region.appendChild(icon);
    region.appendChild(text);
    region.appendChild(actions);
    parentEl.appendChild(live);
    parentEl.appendChild(region);
    return {
      live: live, region: region, text: text,
      actions: actions, retryBtn: retryBtn, downloadLink: dl,
      _lastCode: null
    };
  }

  var barStatusRefs = buildStatusRegion('player-bar', document.getElementById('player-bar-wave-wrap'));
  var heroStatusRefs = buildStatusRegion('featured-waveform', document.getElementById('featured-waveform'));

  var STATUS_COPY = {
    starting: 'Starting mix', buffering: 'Buffering', reconnecting: 'Reconnecting',
    seeking: 'Seeking', failed: 'Playback unavailable', clear: ''
  };
  function applySurfaceStatus(refs, code) {
    if (!refs || code === refs._lastCode) return;
    refs._lastCode = code;
    var msg = STATUS_COPY[code] || '';
    refs.region.className = 'player-status-region' + (code && code !== 'clear' ? ' is-' + code : '');
    refs.text.textContent = msg;
    refs.live.textContent = msg;
  }
  /* `code:'failed'` is overloaded in player-core.js — it is emitted for
     three different situations and only ONE is genuinely terminal
     (terminalFail(), no candidates left). The other two —
     handleSeeked()'s rejected-explicit-seek ("Seek failed — restored
     previous position.") and requestSeek()'s refusals ("Seeking
     unavailable — ...") — leave playback running (state returns to
     'playing'/stays whatever it was). Painting the contract's `is-failed`
     class (terminal Retry affordance, pointer-events re-enabled) for those
     would show "Playback unavailable" + Retry while audio keeps playing —
     the exact misleading UI the plan forbids, just inverted. So: a
     `failed` code is only rendered as the real terminal state when the
     controller's OWN state is actually 'failed'; otherwise it is a
     transient, self-clearing notice using the command's message text. */
  /* Take the "Starting mix" pill down once audio is genuinely running.
     This has to be done host-side rather than relying on a `clear` command
     from player-core.js, because the core only emits `clear` from its
     `playing` case while its state is still 'loading'/'recovering' — and a
     `timeupdate` frequently arrives FIRST, whose own branch silently
     promotes the state to 'playing' without emitting any status. In that
     (common) ordering no `clear` is ever produced, which left the pill
     reading "Starting mix" over a track that had been playing for 25+
     seconds — measured in-browser. Driven off real playback evidence
     (a `playing` event, or advancing time), never off a timer, and it only
     ever retires 'starting' — a buffering/reconnecting/seeking/failed
     status set by the core is left strictly alone. */
  function clearStartingStatus() {
    if (barStatusRefs && barStatusRefs._lastCode === 'starting') applySurfaceStatus(barStatusRefs, 'clear');
    if (heroStatusRefs && heroStatusRefs._lastCode === 'starting' && state.index === heroIdx) {
      applySurfaceStatus(heroStatusRefs, 'clear');
    }
  }

  var TRANSIENT_NOTICE_MS = 4000;
  var transientTimer = null;
  function setTransientText(refs, message) {
    if (!refs) return;
    refs._lastCode = '__transient__'; /* distinct from any real code so a
      genuine subsequent status (e.g. a fresh 'seeking') is never treated
      as a no-op dedup against this transient text */
    refs.region.className = 'player-status-region is-seeking';
    refs.text.textContent = message;
    refs.live.textContent = message;
  }
  function showTransientNotice(message) {
    if (transientTimer) clearTimeout(transientTimer);
    setTransientText(barStatusRefs, message);
    if (state.index === heroIdx) setTransientText(heroStatusRefs, message);
    transientTimer = setTimeout(function () {
      transientTimer = null;
      /* Only act if nothing else changed the status in the meantime. A
         transient must never be able to ERASE a terminal failure: a refused
         seek while the controller is already 'failed' would otherwise clear
         the region and take the Retry button with it, leaving dead playback
         with a silent UI. So restore whatever the authoritative status is
         rather than blanking unconditionally. */
      var restore = (activeController && activeController.state === 'failed') ? 'failed' : 'clear';
      if (barStatusRefs && barStatusRefs._lastCode === '__transient__') applySurfaceStatus(barStatusRefs, restore);
      if (heroStatusRefs && heroStatusRefs._lastCode === '__transient__' && state.index === heroIdx) applySurfaceStatus(heroStatusRefs, restore);
    }, TRANSIENT_NOTICE_MS);
  }
  /* bar always reflects the single global playback status; the hero only
     reflects it while the hero track IS the active track — otherwise it
     would show a status pill for a mix that isn't even loaded. */
  function applyStatus(level, code, message) {
    if (code === 'failed') {
      var terminal = !!(activeController && activeController.state === 'failed');
      if (!terminal) { showTransientNotice(message || ''); return; }
      /* Terminal failure is the one playback state that asks the user for a
         decision, so it moves to the shared centre-screen dialog (see
         openFailureDialog below). Fire it only on the transition INTO the
         terminal state — repeated `failed` statuses for the same dead load
         must not reopen a dialog the user has just closed. Anything that
         genuinely re-arms the failure (a retry, a new track, a transient
         notice) writes a different _lastCode first, which is what makes the
         next terminal failure open a dialog again. */
      var alreadyTerminal = statusIsTerminal();
      applySurfaceStatus(barStatusRefs, code);
      if (state.index === heroIdx) applySurfaceStatus(heroStatusRefs, code);
      if (!alreadyTerminal) openFailureDialog(message);
      return;
    }
    applySurfaceStatus(barStatusRefs, code);
    if (state.index === heroIdx) applySurfaceStatus(heroStatusRefs, code);
  }
  /* the bar is the single global status surface; the hero only mirrors it,
     so the bar's code is the authoritative answer when it exists */
  function statusIsTerminal() {
    if (barStatusRefs) return barStatusRefs._lastCode === 'failed';
    if (heroStatusRefs) return heroStatusRefs._lastCode === 'failed';
    return false;
  }
  function onRetryClick() {
    if (activeController) execCommands(activeController.retry());
  }
  /* Reuses the ONE download implementation in this file: the delegated
     `a[data-download]` click listener near the bottom. The status region's
     own link is only hidden (inline style), never detached, so this
     synthetic click still bubbles to that listener — filename, blob fetch,
     extension mapping and the open-in-a-tab fallback are all unchanged. */
  function onDownloadClick() {
    var refs = barStatusRefs || heroStatusRefs;
    if (!refs || !refs.downloadLink) return;
    if (!refs.downloadLink.getAttribute('href')) return;
    refs.downloadLink.click();
  }
  /* The inline Retry/Download row is shown by a site.css rule
     (`.is-failed .player-status-actions { display: inline-flex }`) that is
     owned by the lead, so it is suppressed with an inline style here rather
     than by editing that stylesheet. Nothing else in this file shows the
     row — a non-failed region is display:none by CSS regardless. */
  function setStatusActionsVisible(refs, visible) {
    if (!refs || !refs.actions || !refs.actions.style) return;
    refs.actions.style.display = visible ? '' : 'none';
  }
  function openFailureDialog(message) {
    var shown = false;
    if (window.ueDialog && typeof window.ueDialog.open === 'function') {
      try {
        window.ueDialog.open({
          title: "This mix wouldn't load",
          message: message || 'The gateway did not respond.',
          actions: [
            { label: 'Try again', variant: 'primary', onSelect: onRetryClick },
            { label: 'Download', variant: 'quiet', onSelect: onDownloadClick }
          ]
        });
        shown = true;
      } catch (err) { shown = false; /* a broken dialog falls back, below */ }
    }
    /* REQUIRED fallback: with no dialog controller (a stripped page, a load
       ordering problem, a controller that threw) the inline Retry/Download
       buttons stay exactly as they shipped, so a failure is never silent
       and never actionless. */
    setStatusActionsVisible(barStatusRefs, !shown);
    setStatusActionsVisible(heroStatusRefs, !shown);
  }
  if (barStatusRefs) barStatusRefs.retryBtn.addEventListener('click', onRetryClick);
  if (heroStatusRefs) heroStatusRefs.retryBtn.addEventListener('click', onRetryClick);

  function updateDownloadLinks(track) {
    var filename = (track.artist ? track.artist + ' - ' : '') + track.title;
    if (barStatusRefs) {
      barStatusRefs.downloadLink.href = track.url;
      barStatusRefs.downloadLink.setAttribute('data-filename', filename);
    }
    if (heroStatusRefs) {
      heroStatusRefs.downloadLink.href = track.url;
      heroStatusRefs.downloadLink.setAttribute('data-filename', filename);
    }
  }

  /* non-seekable waveform affordance (UI-CONTRACT §3) — independent of the
     status pill above; dims + disables-by-convention the scrubber whenever
     the ACTIVE TRACK has no candidate proven range-capable yet. */
  function toggleSeekDisabled(el, disabled) {
    if (el) el.classList.toggle('is-seek-disabled', !!disabled);
  }
  function updateSeekDisabled() {
    var anyConfirmed = false;
    if (activeController) {
      var snap = activeController.snapshot();
      for (var i = 0; i < snap.candidates.length; i++) {
        if (snap.candidates[i].rangeConfirmed) { anyConfirmed = true; break; }
      }
    }
    toggleSeekDisabled(barWaveEl, !anyConfirmed);
    var heroIsActive = state.index === heroIdx;
    toggleSeekDisabled(heroWaveEl, !(heroIsActive && anyConfirmed));
    toggleSeekDisabled(heroProgressLineEl, !(heroIsActive && anyConfirmed));
  }
  updateSeekDisabled(); /* honest starting state: nothing loaded yet */

  /* ---------- command executor ----------
     The controller is a pure command emitter; this is the ONLY place that
     touches the real <audio> element or the status UI on its behalf. Every
     public controller method call in this file is immediately followed by
     execCommands() on its return value, synchronously, in the same call —
     this is required for requestPlay()'s `play` command to land inside the
     user-gesture activation window on iOS. */
  function execCommands(commands) {
    if (!commands) return;
    for (var i = 0; i < commands.length; i++) execCommand(commands[i]);
  }
  function execCommand(cmd) {
    switch (cmd.type) {
      case 'setSrc':
        currentGeneration = cmd.generation;
        pendingResumeTime = typeof cmd.resumeTime === 'number' ? cmd.resumeTime : 0;
        audio.src = cmd.url;
        /* Warming coordination (warming-contract Fix 2): the player is now
           committing to fetch this exact txid's real bytes — from this
           instant, any in-flight warm fetch for it is pure waste competing
           for the same bandwidth/connection-pool capacity, and background
           warming in general should stand down until this start settles.
           See ue-warm.js's notifyPlaybackStarting() header comment for
           the cancel/pause semantics and the bounded auto-resume; settled
           counterpart is called from the native 'playing'/'pause'
           listeners and the terminal-'failed' branch below. Defensive —
           a missing/broken UEWarm must never affect real playback. */
        if (window.UEWarm && typeof window.UEWarm.notifyPlaybackStarting === 'function' && currentTrackTxid) {
          try { window.UEWarm.notifyPlaybackStarting(currentTrackTxid); } catch (err) { /* hint only */ }
        }
        break;
      case 'setCurrentTime':
        try { audio.currentTime = cmd.time; } catch (err) { /* not seekable yet */ }
        /* repaint immediately so the UI reflects the corrected/target
           position without waiting on the next native timeupdate — this is
           what stops the waveform being left parked at an unplayed or
           just-reverted position (baseline Observation 3). */
        var d = currentDuration();
        paintProgress(d > 0 ? cmd.time / d : 0, cmd.time);
        break;
      case 'play':
        var p = audio.play();
        if (p && p.catch) p.catch(function () { /* blocked or network error — leave paused */ });
        break;
      case 'pause':
        audio.pause();
        break;
      case 'status':
        /* Cold-start UX (warming-contract Task 2): a native waiting/stalled
           firing before this track's audio has EVER genuinely played is
           normal cold-gateway latency (measured 2-12s to first byte, see
           PROBE_TIMEOUT_MS below), not a stall — the user is already
           looking at "Starting mix…" from play(), and flipping that to
           "Buffering…" milliseconds later would make an ordinary cold
           start read as broken. Suppress ONLY this one code, and only
           until hasPlayedThisLoad flips true (see the 'playing' listener
           below) — after that, the exact same waiting/stalled signal is a
           genuine mid-stream stall and must paint through untouched. Every
           other status code (including the terminal 'failed' state) is
           never gated here. */
        if (cmd.code === 'buffering' && !hasPlayedThisLoad) break;
        applyStatus(cmd.level, cmd.code, cmd.message);
        /* Gateway affinity (warming-contract Task 4, call site 3/3): a
           reconnect or terminal-failure status means player-core.js just
           marked the active candidate unhealthy. If that candidate is the
           host we've been remembering as the preference, stop suggesting
           it — see clearHostPrefIfDead() below. */
        if (cmd.code === 'reconnecting' || cmd.code === 'failed') clearHostPrefIfDead();
        /* Warming coordination (warming-contract Fix 2), settled counterpart
           of notifyPlaybackStarting() above: a genuinely TERMINAL failure
           (the controller itself is 'failed', not merely reporting one of
           the overloaded transient 'failed' codes — see applyStatus()'s
           own `terminal` check just above for why that distinction
           matters) means this start is never going anywhere; let
           background warming resume rather than sit paused for the full
           bounded timeout. */
        if (cmd.code === 'failed' && activeController && activeController.state === 'failed') {
          if (window.UEWarm && typeof window.UEWarm.notifyPlaybackSettled === 'function') {
            try { window.UEWarm.notifyPlaybackSettled(); } catch (err) { /* hint only */ }
          }
        }
        break;
      case 'log':
        pushLogEntry(cmd.entry);
        break;
      default:
        break;
    }
  }

  /* ---------- candidate construction ---------- */

  function seekableRangesFromAudio() {
    var out = [];
    var sr = audio.seekable;
    if (sr) {
      for (var i = 0; i < sr.length; i++) out.push({ start: sr.start(i), end: sr.end(i) });
    }
    return out;
  }

  function buildTrackCandidatesFor(track) {
    if (!window.UEPlayerCore) return [];
    var list = window.UEPlayerCore.buildCandidates(track.url);
    var txid = window.UEPlayerCore.extractTxid(track.url);

    /* Gateway affinity (warming-contract Task 4, call site 1/3) — before
       building the controller, reorder by the cross-session gateway-
       preference HINT (website/js/ue-host-pref.js). Pure hint: only ever
       REORDERS this list, never drops/adds a candidate, so probing,
       verification, and failover below are completely unaffected by it.
       Applied FIRST/outermost, before the txid-specific session cache
       just below — that cache is strictly more trustworthy (an actual
       proven-this-session result for THIS exact mix, not just "worked for
       some mix on this host recently") and must win when both are
       present. Defensive: UEHostPref is loaded eagerly by boot.js but is
       still just another <script> that can be slow or fail to load. */
    if (window.UEHostPref && typeof window.UEHostPref.orderCandidates === 'function') {
      try {
        var preferredHost = typeof window.UEHostPref.read === 'function' ? window.UEHostPref.read() : null;
        list = window.UEHostPref.orderCandidates(list, preferredHost);
      } catch (err) { /* hint only — never let this block candidate construction */ }
    }

    /* session-scoped, in-memory-only cache: a confirmed host for this txid
       skips the cold probe path on replay — reorder it first and mark it
       pre-confirmed so seeking unlocks immediately. */
    var cachedHost = txid ? confirmedHostByTxid[txid] : null;
    if (cachedHost) {
      list.sort(function (a, b) {
        if (a.host === cachedHost && b.host !== cachedHost) return -1;
        if (b.host === cachedHost && a.host !== cachedHost) return 1;
        return 0;
      });
      for (var i = 0; i < list.length; i++) {
        if (list[i].host === cachedHost) list[i].rangeConfirmed = true;
      }
    }

    /* test-only: ?uefail=<substring>[,<substring>...] | all */
    if (txid && (UEFAIL_ALL || UEFAIL_TERMS.length)) {
      for (var j = 0; j < list.length; j++) {
        var shouldFail = UEFAIL_ALL;
        if (!shouldFail) {
          for (var k = 0; k < UEFAIL_TERMS.length; k++) {
            if (list[j].host.indexOf(UEFAIL_TERMS[k]) !== -1) { shouldFail = true; break; }
          }
        }
        if (shouldFail) list[j].url = 'https://ue-fail-test.invalid/' + txid;
      }
    }

    return list;
  }

  /* Gateway affinity (warming-contract Task 4, call site 2/3) — on a
     CONFIRMED successful playback on a host, remember it as the
     cross-session preference hint. Called from the native 'playing'
     listener below; `activeController` is guaranteed to be the controller
     that produced this exact playback (only one <audio> element / one
     live source exists at a time, so a stale/superseded source cannot
     fire a native 'playing' event here). Defensive + best-effort: a
     failure to write the hint must never affect playback. */
  function writeHostPrefOnConfirmedPlayback() {
    if (!window.UEHostPref || typeof window.UEHostPref.write !== 'function') return;
    if (!activeController || activeController.state !== 'playing') return;
    var snap = activeController.snapshot();
    if (snap.activeHost) {
      try { window.UEHostPref.write(snap.activeHost); } catch (err) { /* hint only */ }
    }
  }

  /* Gateway affinity (warming-contract Task 4, call site 3/3) — when a
     candidate is marked unhealthy (mid-track failover) or the controller
     goes fully terminal, tell BOTH the host-preference store (clear a
     preference that has actually just proven itself dead) AND ue-warm.js
     (warming-contract Fix 4: markHostUnhealthy() — so an UNRELATED warm
     fetch, in flight or future, against that same host cannot silently
     write it back as the preference the moment this verdict lands; see
     that function's header comment in ue-warm.js for the full ordering
     rule — this file's ground-truth verdict always wins). Checked against
     the controller's own `unhealthy` flag (ground truth) rather than
     inferred from which status code fired, so this only ever acts on a
     candidate that has actually just proven itself dead — never a
     healthy host that merely lost one probe race. The ue-warm suppression
     runs for EVERY unhealthy candidate found (there are at most 2, one
     per RANGE_HOSTS entry); clearing the actual stored UEHostPref value
     stays scoped to a candidate that IS the current preference, same as
     before. */
  function clearHostPrefIfDead() {
    if (!activeController) return;
    var snap = activeController.snapshot();
    var preferredHost = null;
    if (window.UEHostPref && typeof window.UEHostPref.read === 'function') {
      try { preferredHost = window.UEHostPref.read(); } catch (err) { preferredHost = null; }
    }
    for (var i = 0; i < snap.candidates.length; i++) {
      var c = snap.candidates[i];
      if (!c.unhealthy) continue;
      if (window.UEWarm && typeof window.UEWarm.markHostUnhealthy === 'function') {
        try { window.UEWarm.markHostUnhealthy(c.host); } catch (err) { /* hint only */ }
      }
      if (preferredHost && c.host === preferredHost && window.UEHostPref && typeof window.UEHostPref.clear === 'function') {
        try { window.UEHostPref.clear(); } catch (err) { /* hint only */ }
      }
    }
  }

  /* Probe every candidate in the background, in parallel, on a 20-25s
     budget (measured cold latencies: 0.9-12.7s typical, 24.98s worst
     observed sizing candidate, one historical 30s timeout on frostor.xyz —
     see GATEWAY-EVIDENCE.md). Never gates playback start — requestPlay()
     already set a source and called audio.play() synchronously before this
     runs. */
  var PROBE_TIMEOUT_MS = 22000;
  function startProbes(track, controller) {
    if (!window.fetch || !window.AbortController || !window.UEPlayerCore) return;
    var snap = controller.snapshot();
    var txid = window.UEPlayerCore.extractTxid(track.url);
    snap.candidates.forEach(function (c, idx) {
      var ctrl = new AbortController();
      var timer = setTimeout(function () { try { ctrl.abort(); } catch (err) { /* ok */ } }, PROBE_TIMEOUT_MS);
      fetch(c.url, { headers: { Range: 'bytes=0-127' }, signal: ctrl.signal }).then(function (r) {
        clearTimeout(timer);
        return { status: r.status, contentRange: r.headers.get('Content-Range'), acceptRanges: r.headers.get('Accept-Ranges') };
      }).catch(function () {
        clearTimeout(timer);
        return { status: 0, contentRange: null, acceptRanges: null };
      }).then(function (result) {
        /* stale guard: only a track change (new controller) invalidates a
           probe — a candidate's range-capability is a fact about that host
           independent of how many times the controller has since failed
           over or bumped generation. */
        if (controller !== activeController) return;
        var verdict = window.UEPlayerCore.evaluateProbe(result);
        if (verdict.rangeCapable && txid) confirmedHostByTxid[txid] = c.host;
        execCommands(controller.applyProbeResult(idx, verdict));
        updateSeekDisabled();
        tryApplyPendingUserSeek();
      });
    });
  }

  /* ---------- pending user seek held before range-confirmation ----------
     Master plan / integration contract requirement: a seek requested
     before the active candidate's probe has resolved must be neither
     rejected outright nor painted as done. It is held here (player.js
     only — player-core.js is untouched) and applied via
     controller.requestSeek() the moment that candidate's probe confirms
     206, or fails over first if it is rejected.

     Deliberate extra caution (lead review): controller.requestSeek() is
     ONLY ever called once the watched candidate is `rangeConfirmed` — or
     once every candidate is `rangeRejected` (in which case requestSeek()'s
     own eligibility check refuses cleanly and NEVER emits a
     setCurrentTime, so it cannot burn handleSeekTimeout()'s
     unhealthy-marking budget on a source nobody ever confirmed). We
     deliberately do NOT call requestSeek() against a merely-not-yet-
     rejected-but-unconfirmed candidate, because a slow/bad landing there
     would mark it unhealthy via the seek timeout even though playback
     itself may be fine — with only two candidates total that is a real
     risk of burning a working source over one scrub. (pendingUserSeek is
     declared in the "playback engine state" section above.)

     Validity is keyed on the CONTROLLER INSTANCE (the track), not on
     generation. player-core.js bumps `generation` on every activeIndex
     change — including an automatic failover while the watched candidate
     was still resolving — so an earlier version of this code that nulled
     the pending seek on any generation mismatch made the re-target branch
     below unreachable: the generation check always fired first, before
     this function ever saw the failover's new activeIndex, silently
     dropping the user's seek. A seek is still meaningful across an
     automatic failover of the SAME track; only an actual track change
     gets a brand-new controller (load() nulls pendingUserSeek itself,
     before reassigning activeController), so that — plus an explicit
     pause/restart, plus the controller going terminal — is what should
     abandon it, not the generation counter. */
  function attemptSeek(timeSec) {
    if (!activeController) return;
    pendingUserSeek = { time: timeSec, controller: activeController, watchIndex: activeController.activeIndex };
    applyStatus('busy', 'seeking', 'Seeking…');
    tryApplyPendingUserSeek();
  }

  /* Repaint the waveform/time display back to the controller's last
     verified position, and try to bring the real audio element back with
     it. Used when a held pending seek can no longer be applied — mirrors
     what player-core.js itself does via setCurrentTimeCmd() in its own
     handleSeekTimeout()/handleSeeked() rejection paths, but this failure
     happens at the host layer (a hold that never got as far as calling
     requestSeek()), so there is no core command to execute for it. */
  function restoreConfirmedPlayhead() {
    var snap = activeController ? activeController.snapshot() : null;
    var confirmed = snap ? snap.confirmedTime : 0;
    try { audio.currentTime = confirmed; } catch (err) { /* not seekable / no source */ }
    var d = currentDuration();
    paintProgress(d > 0 ? confirmed / d : 0, confirmed);
  }

  function tryApplyPendingUserSeek() {
    if (!pendingUserSeek || !activeController) return;
    if (pendingUserSeek.controller !== activeController) { pendingUserSeek = null; return; }

    if (activeController.state === 'failed') {
      /* the controller went terminal while this seek was held (e.g. its
         watched candidate went unhealthy from a playback error before its
         own probe ever resolved) — it can never be applied now. Never
         drop it silently: restore the last confirmed position and show
         the same failure copy a rejected in-flight seek gets. */
      pendingUserSeek = null;
      restoreConfirmedPlayhead();
      showTransientNotice('Seek failed — restored previous position.');
      return;
    }

    var snap = activeController.snapshot();
    if (snap.activeIndex !== pendingUserSeek.watchIndex) {
      /* the controller failed over to a new candidate on its own (happens
         automatically while the track was still 'loading') — re-target to
         the now-active candidate and keep holding; the user's request is
         still valid, only the candidate that will eventually serve it has
         changed. */
      pendingUserSeek.watchIndex = snap.activeIndex;
    }
    var candidate = snap.candidates[pendingUserSeek.watchIndex];
    if (!candidate) {
      /* defensive: watchIndex no longer resolves to a real candidate.
         Not reachable via any currently-wired caller (restartCurrentTrack
         clears pendingUserSeek itself before calling reset(), which is
         the only thing that drops activeIndex to -1 without swapping the
         controller) — but never silently vanish if it ever happens. */
      pendingUserSeek = null;
      restoreConfirmedPlayhead();
      showTransientNotice('Seek failed — restored previous position.');
      return;
    }

    if (candidate.rangeConfirmed) {
      var t = pendingUserSeek.time;
      pendingUserSeek = null;
      execCommands(activeController.requestSeek(t));
      return;
    }

    if (candidate.rangeRejected) {
      var allRejected = true;
      for (var i = 0; i < snap.candidates.length; i++) {
        if (!snap.candidates[i].rangeRejected) { allRejected = false; break; }
      }
      if (allRejected) {
        /* safe even though the active candidate was never confirmed:
           requestSeek() itself refuses and returns the terminal
           "no range-capable source" status without ever touching
           setCurrentTime — see comment above pendingUserSeek. */
        var t2 = pendingUserSeek.time;
        pendingUserSeek = null;
        execCommands(activeController.requestSeek(t2));
      }
      /* else: the active candidate is rejected but at least one other is
         still unresolved/confirmed — keep holding rather than forcing a
         seek onto a proven-bad source; we'll re-check on the next probe
         result, tick, or media event. */
      return;
    }
    /* still unresolved — keep holding, 'seeking' status already shown */
  }

  /* ---------- randomize / re-roll the featured mix ----------
     hero image stays the fixed digging.jpg backdrop (see index.html
     template); only the title/artist/meta/audio swap to a random pick
     from the full catalog, fetched client-side. Duration parsing
     mirrors lib/WebsitePageGenerator.cjs parseDurationSec exactly —
     short leading numbers ("1:30") mean H:MM, not MM:SS.

     One implementation, two callers: the automatic roll on every load, and
     the hero's refresh button (#hero-refresh-mix → host.rerollFeatured()).
     `featuredIdx0` is the queue entry the build-time featured anchor owns;
     a tile click can later repoint heroIdx at some other entry
     (pointHeroAt), so a re-roll must always write to ITS OWN entry and
     point heroIdx back at it — never mutate whatever heroIdx happens to be. */
  /* shared by the featured re-roll below and the archive queue (loadArchive).
     Duration parsing mirrors lib/WebsitePageGenerator.cjs parseDurationSec —
     short leading numbers ("1:30") mean H:MM, not MM:SS. */
  function parseDurSec(raw) {
    var m = String(raw || '').trim().match(/^(\d{1,3}):(\d{2})$/);
    if (!m) return 0;
    var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    if (a === 0 && b === 0) return 0;
    return a <= 10 ? (a * 60 + b) * 60 : a * 60 + b;
  }
  /* Only generated renders are shown (generator shownMixImage, same rule):
     the mix's generated cover, else its render made in place of uploaded
     art, else — with no cover at all — a generated artist image, else ''. */
  function shownMixImage(m, a) {
    var gen = function (url, meta) {
      return !!(meta && meta.origin === 'generated-skyline' && /^https?:\/\//i.test(url || ''));
    };
    if (gen(m.mixImageFilename, m.mixImageMeta)) return m.mixImageFilename;
    if (gen(m.renderImageFilename, m.renderImageMeta)) return m.renderImageFilename;
    if (!m.mixImageFilename && gen(a.artistImageFilename, a.artistImageMeta)) return a.artistImageFilename;
    return '';
  }

  var featuredIdx0 = heroIdx;
  var rerollFeatured = function () { return false; };

  (function randomizeFeatured() {
    var heroTitleEl = document.getElementById('featured-mix-title');
    if (!heroTitleEl || !featuredAnchor) return;

    function metaChip(iconId, text) {
      var span = document.createElement('span');
      span.className = 'meta-chip';
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon-svg');
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#' + iconId);
      svg.appendChild(use);
      span.appendChild(svg);
      span.appendChild(document.createTextNode(' ' + text));
      return span;
    }
    function metaDot() {
      var dot = document.createElement('span');
      dot.className = 'meta-dot';
      dot.innerHTML = '&middot;';
      return dot;
    }

    /* the catalog is fetched once and shared by the load-time roll and every
       refresh click */
    var picksPromise = null;
    function loadPicks() {
      if (picksPromise) return picksPromise;
      picksPromise = fetch('artists.json').then(function (r) { return r.json(); }).then(function (data) {
        var picks = [];
        (data || []).forEach(function (a) {
          (a.mixes || []).forEach(function (m) {
            if (/^https?:\/\//i.test(m.mixArweaveURL || '')) {
              picks.push({
                artistName: a.artistName || '',
                artistPage: a.artistFilename || '#',
                artistGenre: (a.artistGenre || 'other').toUpperCase(),
                title: m.mixTitle || 'Untitled Mix',
                audioUrl: m.mixArweaveURL,
                durationSec: parseDurSec(m.mixDuration),
                dateDisplay: m.mixDateYear || '',
                image: shownMixImage(m, a)
              });
            }
          });
        });
        return picks;
      });
      picksPromise.catch(function () { picksPromise = null; }); /* let a later click retry */
      return picksPromise;
    }

    /* One random pick. `excludeUrl` (refresh only) keeps the new mix
       different from the one on screen. */
    function choosePick(picks, excludeUrl) {
      if (excludeUrl) {
        var others = picks.filter(function (p) { return !sameMixUrl(p.audioUrl, excludeUrl); });
        if (others.length) picks = others;
      }

      /* Coordinate with the hero promo film: the homepage hero plays one of
         this pipeline's own 30s mix promos, and it should be promoting the SAME
         mix that is preloaded here. `window.__ueHeroPromos.index` is published
         by the inline hero script (which runs before this file is lazily
         loaded) and holds the mixes we actually have a promo for — about 39 of
         the 45 playable mixes. Narrowing the random pick to that set makes ONE
         random choice drive both, instead of two independent ones that would
         agree by accident.
         Strictly a narrowing: no index (any other page, empty catalog) or no
         intersection falls straight back to picking from everything. */
      var promoPicks = picks;
      try {
        var promoIndex = window.__ueHeroPromos && window.__ueHeroPromos.index;
        if (promoIndex) {
          var matched = picks.filter(function (p) {
            return !!promoIndex[(p.artistName + '|' + p.title).toLowerCase()];
          });
          if (matched.length) promoPicks = matched;
        }
      } catch (err) { /* the hero must never decide whether playback works */ }

      return promoPicks[Math.floor(Math.random() * promoPicks.length)];
    }

    function applyPick(pick) {
      var pickCredit = heroCreditFor(pick.audioUrl);
      var heroTitleLink = heroTitleEl.querySelector('a') || heroTitleEl;
      heroTitleLink.textContent = pickCredit ? pickCredit.title : pick.artistName;
      if (heroTitleLink !== heroTitleEl && pick.artistPage) heroTitleLink.setAttribute('href', pick.artistPage);
      var sigEl = document.getElementById('featured-artist-signature');
      if (sigEl) {
        sigEl.textContent = pickCredit ? pickCredit.sub : pick.title;
        sigEl.setAttribute('href', pick.artistPage);
      }
      var metaRow = document.getElementById('featured-meta-row');
      if (metaRow) {
        metaRow.innerHTML = '';
        // genre and date are hidden for now (generator metaChips has the note);
        // duration leads the row, so no separator dot before it.
        // metaRow.appendChild(metaChip('i-wave', pick.artistGenre));
        // length is hidden for now too:
        // if (pick.durationSec > 0) {
        //   metaRow.appendChild(metaChip('i-clock', Math.round(pick.durationSec / 60) + ' MIN'));
        // }
        // if (pick.dateDisplay) {
        //   metaRow.appendChild(metaDot());
        //   metaRow.appendChild(metaChip('i-calendar', pick.dateDisplay));
        // }
      }
      /* the hero's transport is the featured entry again (a tile click may
         have pointed it elsewhere) */
      if (featuredIdx0 >= 0) {
        heroIdx = featuredIdx0;
        featuredAnchor.setAttribute('data-queue-idx', String(featuredIdx0));
      }
      featuredAnchor.setAttribute('data-title', pick.title);
      featuredAnchor.setAttribute('data-artist', pick.artistName);
      featuredAnchor.setAttribute('data-img', pick.image);
      featuredAnchor.setAttribute('data-duration-sec', String(pick.durationSec));
      featuredAnchor.setAttribute('href', pick.audioUrl);
      var dlBtn = document.getElementById('featured-download-button');
      if (dlBtn) {
        dlBtn.setAttribute('href', pick.audioUrl);
        dlBtn.setAttribute('data-filename', pick.artistName + ' - ' + pick.title);
      }
      if (heroStatusRefs) {
        heroStatusRefs.downloadLink.href = pick.audioUrl;
        heroStatusRefs.downloadLink.setAttribute('data-filename', pick.artistName + ' - ' + pick.title);
      }
      if (heroIdx >= 0 && queue[heroIdx]) {
        queue[heroIdx].url = pick.audioUrl;
        queue[heroIdx].title = pick.title;
        queue[heroIdx].artist = pick.artistName;
        queue[heroIdx].img = pick.image;
        queue[heroIdx].durationSec = pick.durationSec;
      }
      if (heroWave) heroWave.setTrack(pick.audioUrl);
      if (heroTimeTot) heroTimeTot.textContent = pick.durationSec > 0 ? formatTime(pick.durationSec) : '--:--';
      if (heroTimeCur) heroTimeCur.textContent = '0:00';

      /* Tell the hero which mix won. This resolves inside a fetch().then(), so
         it lands AFTER `ue-player-ready` — a listener that reads the featured
         anchor on that event still sees the build-time mix. Hence an explicit
         event rather than asking the hero to guess when we are done. */
      try {
        document.dispatchEvent(new CustomEvent('ue-featured-changed', {
          detail: { title: pick.title, artist: pick.artistName, image: pick.image }
        }));
      } catch (err) { /* older engines: hero simply keeps its own random pick */ }
    }

    /* load-time roll: the bar then mirrors the hero (homepage only; no-op
       elsewhere and whenever audio already owns the bar) */
    /* The homepage hero script already picked the mix before first paint
       (data-hero-prepicked on the featured anchor) and the queue hydrated
       from it — adopt it rather than rolling again, which used to swap the
       hero to a second random mix a few seconds after load. */
    if (featuredAnchor.getAttribute('data-hero-prepicked') === '1') {
      syncBarToHero(false);
    } else {
      loadPicks().then(function (picks) {
        if (!picks.length) return;
        applyPick(choosePick(picks, null));
        syncBarToHero(false);
      }).catch(function () { /* keep the build-time featured mix on failure */ });
    }

    /* Refresh button. Choice when audio is involved (the bar must never be
       yanked by a LOAD-time roll, but a click is an explicit request):
         - nothing loaded yet -> swap hero + bar to the new mix, silent;
         - a mix is loaded and PAUSED -> swap hero + bar to the new mix and
           load it, still paused (we never start audio the listener did not
           ask for);
         - a mix is PLAYING -> the click is a user gesture, so playback
           continues on the new mix (loaded + play(), exactly like "next").
       Returns a promise-ish true when a roll was started. */
    rerollFeatured = function () {
      if (featuredIdx0 < 0) return false;
      loadPicks().then(function (picks) {
        if (!picks.length) return;
        var wasPlaying = audioIsPlaying();   /* read at apply time, not click time */
        var wasLoaded = state.index >= 0;
        var cur = queue[heroIdx];
        applyPick(choosePick(picks, cur ? cur.url : null));
        if (wasLoaded) {
          load(featuredIdx0);
          if (wasPlaying) play();
        } else {
          syncBarToHero(true);
        }
      }).catch(function () { /* keep the current mix on failure */ });
      return true;
    };
  })();

  /* ---------- rendering helpers ---------- */

  function allPlayCircles(idx) {
    return document.querySelectorAll('.play-circle[data-queue-idx="' + idx + '"]');
  }

  function syncButtons() {
    var circles = document.querySelectorAll('.play-circle.is-playing');
    for (var i = 0; i < circles.length; i++) circles[i].classList.remove('is-playing');
    if (state.playing && state.index >= 0) {
      var active = allPlayCircles(state.index);
      for (var j = 0; j < active.length; j++) active[j].classList.add('is-playing');
      if (heroPlayBtn && state.index === heroIdx) heroPlayBtn.classList.add('is-playing');
    }
    if (barPlayBtn) barPlayBtn.classList.toggle('is-playing', state.playing);
    if (bar) bar.classList.toggle('is-playing', state.playing);
    if (btnShuffle) btnShuffle.classList.toggle('is-on', state.shuffle);
    if (btnRepeat) {
      btnRepeat.classList.toggle('is-on', state.repeat !== 'off');
      btnRepeat.setAttribute('data-mode', state.repeat);
    }
  }

  /* the bar's two static template states, kept here so the primed-bar code
     below can put the slot back exactly as partials/player-bar.html ships it */
  var BAR_FALLBACK_THUMB_HTML = '<img class="cover-fallback" src="img/square-ue.png" alt="">';
  var BAR_IDLE_TITLE = 'Select a mix to play';

  function setBarTrack(track) {
    if (!bar) return;
    bar.classList.remove('is-idle');
    // Artist first, like every tile (displayLines).
    var lines = displayLines(track.url, track.title, track.artist);
    if (barTitle) {
      var barTitleLink = barTitle.querySelector('a') || barTitle;
      barTitleLink.textContent = lines.line1;
      // Same convention as #featured-artist-signature: link via the entry's
      // own data-page even for a B2B credit line (it still names one of the
      // credited DJs), rather than leaving it unclickable.
      if (barTitleLink !== barTitle) {
        if (track.page) barTitleLink.setAttribute('href', track.page);
        else barTitleLink.removeAttribute('href');
      }
    }
    if (barArtist) barArtist.textContent = lines.line2;
    if (barThumb) {
      if (track.img) {
        barThumb.innerHTML = '';
        var img = document.createElement('img');
        img.alt = '';
        img.src = track.img;
        img.onerror = function () {
          barThumb.innerHTML = BAR_FALLBACK_THUMB_HTML;
        };
        barThumb.appendChild(img);
      } else {
        barThumb.innerHTML = BAR_FALLBACK_THUMB_HTML;
      }
    }
    if (barWave) barWave.setTrack(track.url);
    if (barTimeTot) barTimeTot.textContent = track.durationSec > 0 ? formatTime(track.durationSec) : '--:--';
    if (barTimeCur) barTimeCur.textContent = '0:00';
    updateScrubberAria(barWaveEl, 0, track.durationSec);
  }

  function currentDuration() {
    var d = audio.duration;
    if (isFinite(d) && d > 0) return d;
    var track = queue[state.index];
    return track && track.durationSec > 0 ? track.durationSec : 0;
  }

  /* keyboard a11y (plan Phase 4 item 4): live aria-value* on the scrubber
     that currently reflects real audio, updated from the same choke point
     as visual progress so it never drifts from what's on screen. */
  function updateScrubberAria(el, timeSec, durationSec) {
    if (!el) return;
    var max = durationSec > 0 ? Math.round(durationSec) : 0;
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', String(max));
    el.setAttribute('aria-valuenow', String(Math.round(Math.max(0, timeSec))));
    el.setAttribute('aria-valuetext', formatTime(timeSec) + (max > 0 ? ' of ' + formatTime(max) : ''));
  }

  /* paint progress everywhere (bar + hero when it's the hero track). Also
     used for the drag-preview (visual only, never touches audio.currentTime)
     and to repaint immediately after a setCurrentTime command lands. */
  function paintProgress(p, t) {
    if (barTimeCur) barTimeCur.textContent = formatTime(t);
    if (barWave) barWave.setProgress(p, true);
    updateScrubberAria(barWaveEl, t, currentDuration());
    if (state.index === heroIdx) {
      if (heroWave) heroWave.setProgress(p, true);
      if (heroTimeCur) heroTimeCur.textContent = formatTime(t);
      if (heroFill) heroFill.style.width = (p * 100) + '%';
      if (heroDot) heroDot.style.left = (p * 100) + '%';
      updateScrubberAria(heroWaveEl, t, currentDuration());
    }
  }

  /* ---------- load / play / pause / queue advance ---------- */

  function load(idx) {
    if (idx < 0 || idx >= queue.length) return;
    pendingUserSeek = null;
    /* a start position requested for a previous track is meaningless here —
       playIndexAt() sets its own AFTER calling load() */
    pendingStartTime = null;
    if (transientTimer) { clearTimeout(transientTimer); transientTimer = null; }
    /* clear any stale pill from the outgoing track on BOTH status
       surfaces before this track becomes active. The bar always reflects
       the single global playback status (regardless of which track is
       active), so a transient message like "Seek failed — restored
       previous position." left on it by the outgoing track could
       otherwise linger on the bar for the new track until some later
       status-emitting event (typically the new track's `playing`)
       happened to overwrite it. */
    if (barStatusRefs && state.index !== idx) applySurfaceStatus(barStatusRefs, 'clear');
    if (heroStatusRefs && state.index !== idx) applySurfaceStatus(heroStatusRefs, 'clear'); /* clear any stale pill before this track (which may not be the hero) becomes active */
    state.index = idx;
    var track = queue[idx];
    currentTrackTxid = (window.UEPlayerCore && typeof window.UEPlayerCore.extractTxid === 'function')
      ? window.UEPlayerCore.extractTxid(track.url)
      : null;
    setBarTrack(track);
    /* the hero becomes this mix too — film, copy and transport (pointHeroAt) */
    pointHeroAt(idx);
    /* a real track now owns the slot setBarTrack just repainted — any
       primed offer (this one included) is spent */
    clearPrimed(false);
    syncButtons();
    updateDownloadLinks(track);

    var candidates = buildTrackCandidatesFor(track);
    activeController = (window.UEPlayerCore && candidates.length)
      ? window.UEPlayerCore.createPlaybackController({
          candidates: candidates,
          expectedDurationSec: track.durationSec || 0,
          seekTimeoutMs: 15000 /* measured warm seek latency 1.4-8.8s; the
            module's 12s default sits uncomfortably close to a 12.5s cold
            measurement — see GATEWAY-EVIDENCE.md */
        })
      : null;
    pendingResumeTime = 0;
    updateSeekDisabled();

    if (!activeController) {
      currentGeneration = 0;
      applyStatus('error', 'failed', 'Playback unavailable — no playable source for this mix.');
      return;
    }
    currentGeneration = activeController.generation;
    startProbes(track, activeController);
    emitFeatureEvent('track', { index: idx, track: track, txid: currentTrackTxid });
  }

  function play() {
    if (state.index < 0 && queue.length) load(0);
    if (state.index < 0 || !activeController) return;
    /* Deliberate startup feedback (master plan Phase 4 / warming-contract
       Task 2). Paint IMMEDIATELY, synchronously, in this same turn — the
       one requirement of this whole feature — because requestPlay() below
       can take real seconds to produce audible sound on a cold gateway
       (measured 2-12s to first byte) and with nothing painted in that
       window a normal cold start reads as broken, not merely slow.

       Gated on state === 'idle': that is the ONLY state requestPlay() can
       turn into a genuinely fresh setSrc (a first play from load(), or a
       same-track restart via reset()+play() — see restartCurrentTrack()).
       Resuming an already-loaded/paused/mid-stream track does not hit
       this branch, so "Starting mix…" never flickers over an
       already-warm track that just needs audio.play() called again.

       hasPlayedThisLoad resets here (not in load()) because every load()
       call in this file is immediately followed by play() — load() alone
       never produces audio, so there is nothing for the cold-start gate
       to protect until play() actually runs. */
    if (activeController.state === 'idle') {
      hasPlayedThisLoad = false;
      applyStatus('busy', 'starting', 'Starting mix…');
    }
    execCommands(activeController.requestPlay());
  }

  function pause() {
    /* an explicit pause abandons any seek still being held for
       range-confirmation — resuming later should not surprise-seek */
    pendingUserSeek = null;
    if (activeController) execCommands(activeController.requestPause());
  }

  /* same-track restart (repeat-one, "previous" within the restart
     threshold) — goes through the controller's own reset()+requestPlay()
     rather than poking audio.currentTime directly, so confirmedTime/health
     bookkeeping never drifts from what's actually on screen. */
  function restartCurrentTrack() {
    if (!activeController) return;
    /* reset() drops activeIndex to -1 on this SAME controller instance (no
       controller swap, so the identity check in tryApplyPendingUserSeek()
       would not catch this on its own) — a held seek is meaningless across
       an explicit restart, so drop it here rather than let it dead-end on
       a missing candidate. */
    pendingUserSeek = null;
    execCommands(activeController.reset());
    play();
  }

  function toggleIndex(idx) {
    if (idx === state.index) {
      state.playing ? pause() : play();
    } else {
      load(idx);
      play();
    }
  }

  /* ---------- the whole archive behind prev / next / shuffle ----------
     The page's queue holds only the mixes on this page (one artist's, on an
     artist page). Prev/next and shuffle walk the whole archive instead:
     artists.json is fetched once — prefetched on idle and on the first
     pointerdown on those buttons, so the click itself stays a synchronous
     user gesture for play() — and every mix not already in the queue is
     appended as a detached play anchor carrying the same data-* a page
     anchor does, so load()/setBarTrack()/the about drawer treat it like any
     other entry. archiveOrder lists queue indices in archive order; until it
     exists, navigation falls back to the page's own order. */
  var archivePromise = null;
  var archiveOrder = null;
  function mixKey(url) {
    var txid = (window.UEPlayerCore && typeof window.UEPlayerCore.extractTxid === 'function')
      ? window.UEPlayerCore.extractTxid(url) : null;
    return txid || url;
  }
  function loadArchive() {
    if (archivePromise) return archivePromise;
    archivePromise = fetch('artists.json').then(function (r) { return r.json(); }).then(function (data) {
      var byKey = {};
      for (var i = 0; i < queue.length; i++) byKey[mixKey(queue[i].url)] = i;
      var order = [];
      (data || []).forEach(function (a) {
        (a.mixes || []).forEach(function (m) {
          var url = m.mixArweaveURL || '';
          if (!/^https?:\/\//i.test(url)) return;
          var key = mixKey(url);
          if (key in byKey) { order.push(byKey[key]); return; }
          var el = document.createElement('a');
          el.setAttribute('data-playlist', '');
          el.setAttribute('href', url);
          el.setAttribute('data-title', m.mixTitle || 'Untitled Mix');
          el.setAttribute('data-artist', a.artistName || '');
          el.setAttribute('data-img', shownMixImage(m, a));
          el.setAttribute('data-page', a.artistFilename || '');
          el.setAttribute('data-duration-sec', String(parseDurSec(m.mixDuration)));
          el.setAttribute('data-date', m.mixDateYear || '');
          el.setAttribute('data-genre', (a.artistGenre || '').toLowerCase());
          queue.push({
            el: el,
            url: url,
            title: el.getAttribute('data-title'),
            artist: el.getAttribute('data-artist'),
            img: el.getAttribute('data-img'),
            page: el.getAttribute('data-page'),
            durationSec: parseDurSec(m.mixDuration)
          });
          byKey[key] = queue.length - 1;
          order.push(queue.length - 1);
        });
      });
      for (var j = 0; j < queue.length; j++) if (order.indexOf(j) < 0) order.push(j);
      archiveOrder = order;
    });
    archivePromise.catch(function () { archivePromise = null; }); /* a later press retries */
    return archivePromise;
  }
  function nextIndex(dir) {
    if (!queue.length) return -1;
    if (state.shuffle && queue.length > 1) return randomIndex();
    var list = archiveOrder || null;
    if (!list) {
      var n = state.index + dir;
      if (n >= queue.length) n = 0;
      if (n < 0) n = queue.length - 1;
      return n;
    }
    var pos = list.indexOf(state.index);
    var p = pos + dir;
    if (p >= list.length) p = 0;
    if (p < 0) p = list.length - 1;
    return list[p];
  }
  function randomIndex() {
    if (queue.length < 2) return queue.length ? 0 : -1;
    var r;
    do { r = Math.floor(Math.random() * queue.length); } while (r === state.index);
    return r;
  }
  /* ---------- host bridge for optional feature modules ----------
     Media Session, deep links/share, and Resume Listening are separate
     progressive-enhancement modules (website/js/ue-*.js). They must never
     drive the <audio> element, the queue, or seeking directly — every one of
     those paths has verified behaviour that lives in this file and in
     player-core.js. This bridge is the ONLY surface they get: read-only
     accessors, the same load/play/pause/seek functions the built-in UI
     calls, and three notification hooks. Absent modules change nothing;
     a throwing module can never break playback (every callback is
     individually try/caught).

     Hooks:
       'track'    { index, track, txid }              — a track became active
       'playback' { playing, index, track }           — play/pause transition
       'time'     { index, currentTime, duration }    — native timeupdate
     Modules that load before player.js (boot.js's eager chain) must wait for
     the document-level `ue-player-ready` event before reading window.UEPlayer. */
  var featureHooks = { track: [], playback: [], time: [] };
  function onFeatureEvent(kind, cb) {
    if (!featureHooks[kind] || typeof cb !== 'function') return function () {};
    featureHooks[kind].push(cb);
    return function off() {
      var i = featureHooks[kind].indexOf(cb);
      if (i !== -1) featureHooks[kind].splice(i, 1);
    };
  }
  function emitFeatureEvent(kind, payload) {
    var list = featureHooks[kind];
    if (!list || !list.length) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](payload); } catch (err) { /* a broken module must never break playback */ }
    }
  }

  function txidForIndex(idx) {
    var track = queue[idx];
    if (!track || !window.UEPlayerCore) return null;
    return window.UEPlayerCore.extractTxid(track.url);
  }

  function findIndexByTxid(txid) {
    if (!txid || !window.UEPlayerCore) return -1;
    for (var i = 0; i < queue.length; i++) {
      if (window.UEPlayerCore.extractTxid(queue[i].url) === txid) return i;
    }
    return -1;
  }

  /* Apply a feature module's requested start position, clamped to the real
     duration, through the normal verified seek path. Never autoplays and is
     never reached unless playback was already started by a user gesture. */
  function applyPendingStartTime() {
    if (pendingStartTime === null) return;
    var t = pendingStartTime;
    pendingStartTime = null;
    if (typeof t !== 'number' || !isFinite(t) || t <= 0) return;
    var d = currentDuration();
    if (d > 0) t = Math.min(t, Math.max(0, d - 1));
    if (t <= 0) return;
    attemptSeek(t);
  }

  /* The one entry point a feature module uses to start playback: select a
     queue index and (optionally) resume it at `startSec`. MUST be called
     from a user gesture — it calls play() exactly like every built-in
     control does, and nothing in this file ever calls it on its own. */
  function playIndexAt(idx, startSec) {
    if (typeof idx !== 'number' || idx < 0 || idx >= queue.length) return false;
    var sameTrack = (idx === state.index);
    if (!sameTrack) load(idx);
    pendingStartTime = (typeof startSec === 'number' && isFinite(startSec) && startSec > 0) ? startSec : null;
    play();
    /* Re-playing the SAME already-loaded track fires no fresh
       `loadedmetadata`, so the apply point above would never come; metadata
       is already in, so apply straight away. A different track just had its
       src replaced by play() and is back at readyState 0 — that one waits. */
    if (pendingStartTime !== null && sameTrack && audio.readyState >= 1) applyPendingStartTime();
    return true;
  }

  /* ---------- primed player bar (window.uePlayerBar) ----------
     API 1 of the transient-UI contract. "Resume Love Manifesto 3 at 0:52"
     and "shared link, start at 1:23" are the same shape — a track queued at
     a position, press play — so instead of each module floating its own
     slab over the grid, it fills the bar's idle now-playing slot.

     Presentation + one queued intent ONLY. Nothing here touches the audio
     element, the controller, candidates, ranges or seeking: consuming a
     primed track calls playIndexAt(), the same host-bridge entry point
     ue-resume.js/ue-links.js already used, so the start offset still runs
     through pendingStartTime -> applyPendingStartTime() -> attemptSeek()
     (the verified hold-until-range-confirmed path) exactly as before.

     Rules:
       - refuses while audio is playing, and refuses once a real track has
         been loaded into the bar at all — a returning visitor who hits play
         before a module initialises must never have the bar yanked out from
         under them, and a paused track is still that visitor's track;
       - refuses malformed specs and anything this page could not actually
         play (no queue entry for that URL), so the play button is never
         primed into a dead press;
       - never survives a real play: load() and the native 'play' event both
         drop it. */

  var PRIMED_LABEL_CLASS = 'player-bar-primed-label';

  function audioIsPlaying() {
    /* state.playing only flips on the native play/pause events, so consult
       the element too — between requestPlay() and the 'play' event the
       element is already unpaused and that counts as playing. */
    return !!(state.playing || (audio && audio.paused === false));
  }

  /* the slot is only free before any real track has taken it over */
  function barSlotIsFree() {
    return state.index < 0 && !audioIsPlaying();
  }

  function normalizePrimeSpec(spec) {
    if (!spec || typeof spec !== 'object') return null;
    var title = typeof spec.title === 'string' ? spec.title.trim() : '';
    var href = typeof spec.href === 'string' ? spec.href.trim() : '';
    if (!title || !href) return null;
    var startSec = spec.startSec;
    if (typeof startSec !== 'number' || !isFinite(startSec) || startSec < 0) return null;
    return {
      title: title,
      artist: typeof spec.artist === 'string' ? spec.artist : '',
      img: typeof spec.img === 'string' ? spec.img : '',
      href: href,
      filename: typeof spec.filename === 'string' ? spec.filename : '',
      startSec: startSec,
      label: typeof spec.label === 'string' ? spec.label.trim() : '',
      source: typeof spec.source === 'string' ? spec.source : '',
      index: -1
    };
  }

  /* exact URL first (what a module read back from its own record), then the
     txid — the same identity the rest of this file matches tracks on, so a
     record saved against one gateway still resolves on another. */
  function findIndexByHref(href) {
    for (var i = 0; i < queue.length; i++) {
      if (queue[i].url === href) return i;
    }
    var txid = (window.UEPlayerCore && typeof window.UEPlayerCore.extractTxid === 'function')
      ? window.UEPlayerCore.extractTxid(href)
      : null;
    return findIndexByTxid(txid);
  }

  /* The label rides in the EXISTING #player-bar-artist line — no new slot,
     no second row — but in its own span so site.css can mute it: that line
     is accent-coloured for the artist name, and an unwrapped "resume 0:52"
     would read as a second link rather than as a quiet status. The
     separator lives INSIDE the span so removing the label can never leave
     an orphaned "·", and is omitted when there is no artist name. */
  function renderPrimedArtistLine(subLine, label) {
    if (!barArtist) return;
    barArtist.textContent = subLine || '';
    if (!label) return;
    var span = document.createElement('span');
    span.className = PRIMED_LABEL_CLASS;
    span.textContent = (subLine ? ' · ' : '') + label;
    barArtist.appendChild(span);
  }

  function removePrimedLabelEl() {
    if (!barArtist || !barArtist.querySelectorAll) return;
    var els = barArtist.querySelectorAll('.' + PRIMED_LABEL_CLASS);
    for (var i = 0; i < els.length; i++) {
      if (els[i].parentNode) els[i].parentNode.removeChild(els[i]);
    }
  }

  /* ---------- homepage: bar = hero ----------
     On the homepage the fixed bar must show the SAME mix the hero shows
     (title/artist lines via displayLines, thumbnail = the hero entry's img)
     whenever nothing owns the bar yet. Called after the build-time render,
     after the load-time re-roll, after every refresh click and after a tile
     click repoints the hero. Rules:
       - only while barSlotIsFree() (nothing loaded, nothing playing): once a
         track is loaded/playing, playback wins and the hero follows it via
         pointHeroAt, so the two already agree;
       - resume: the remembered offer (ue-resume.js -> prime()) keeps its
         "resume m:ss" label and start position ONLY when it is the hero's
         mix; any other mix shows no resume label (the record itself is left
         alone in storage, so it comes back if that mix is the hero again);
       - a non-resume primed offer (deep link) is a deliberate user target,
         so a passive sync leaves it alone; `force` (refresh click) replaces it;
       - the primed index is always heroIdx, so the bar's play button and the
         hero's play button drive the very same queue entry. */
  var lastResumeSpec = null; /* normalized resume spec seen on the homepage */

  function isHomeHero() {
    return !!(bar && featuredAnchor && document.getElementById('hero-media') &&
      heroIdx >= 0 && queue[heroIdx]);
  }

  function sameMixUrl(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    var core = window.UEPlayerCore;
    var ta = core && typeof core.extractTxid === 'function' ? core.extractTxid(a) : null;
    return !!ta && ta === core.extractTxid(b);
  }

  function syncBarToHero(force) {
    try {
      if (!isHomeHero() || !barSlotIsFree()) return false;
      if (primed && primed.source !== 'resume' && !force) return false;
      var track = queue[heroIdx];
      clearPrimed(false);
      setBarTrack(track); /* also paints the plain two lines, wiping any old label */
      var rs = lastResumeSpec;
      if (rs && rs.label && sameMixUrl(rs.href, track.url)) {
        renderPrimedArtistLine(displayLines(track.url, track.title, track.artist).line2, rs.label);
        bar.classList.add('is-primed');
        primed = {
          title: track.title, artist: track.artist, img: track.img, href: track.url,
          filename: rs.filename, startSec: rs.startSec, label: rs.label,
          source: 'resume', index: heroIdx
        };
      }
      return true;
    } catch (err) {
      return false; /* the bar mirroring the hero must never break playback */
    }
  }

  /* put the slot back exactly as partials/player-bar.html ships it */
  function restoreIdleBarSlot() {
    if (bar) bar.classList.add('is-idle');
    if (barTitle) {
      // rebuild the <a> (not just textContent) so setBarTrack's
      // querySelector('a') keeps finding a link to populate afterwards
      barTitle.innerHTML = '';
      var idleLink = document.createElement('a');
      idleLink.textContent = BAR_IDLE_TITLE;
      barTitle.appendChild(idleLink);
    }
    if (barArtist) barArtist.textContent = '';
    if (barThumb) barThumb.innerHTML = BAR_FALLBACK_THUMB_HTML;
    if (barTimeTot) barTimeTot.textContent = '--:--';
    if (barTimeCur) barTimeCur.textContent = '0:00';
    if (barWave) barWave.setProgress(0, false);
    updateScrubberAria(barWaveEl, 0, 0);
  }

  /* restoreIdle: only for an explicit clear() with nothing loaded — the
     slot then has nothing else to show. Every internal caller passes false
     because a real track is taking the slot over in the same turn. */
  function clearPrimed(restoreIdle) {
    if (!primed) return false;
    primed = null;
    if (bar) bar.classList.remove('is-primed');
    removePrimedLabelEl(); /* leaves whatever the artist line holds now */
    if (restoreIdle && state.index < 0) restoreIdleBarSlot();
    return true;
  }

  function primeBar(spec) {
    try {
      if (!bar) return false;
      var norm = normalizePrimeSpec(spec);
      if (!norm) return false;
      if (!barSlotIsFree()) return false;
      var idx = findIndexByHref(norm.href);
      if (idx < 0) return false;
      /* Homepage: the bar mirrors the hero (see syncBarToHero). A resume
         offer is only REMEMBERED here; it is shown iff it is the hero's own
         mix, otherwise the bar keeps mirroring the hero with no resume label.
         Other pages and other sources (deep links) prime exactly as before. */
      if (norm.source === 'resume' && isHomeHero()) {
        lastResumeSpec = norm;
        syncBarToHero(false);
        return !!(primed && primed.source === 'resume');
      }
      norm.index = idx;
      var track = queue[idx];
      /* the real now-playing path — same thumb/title/artist elements, same
         cover-error fallback, same waveform seed and duration readout */
      setBarTrack({
        title: norm.title,
        artist: norm.artist,
        // the page's own record wins over the remembered thumb, so a resume
        // saved before a cover changed never brings the old image back
        img: (track && track.img) || norm.img,
        url: norm.href,
        durationSec: track ? track.durationSec : 0
      });
      renderPrimedArtistLine(displayLines(norm.href, norm.title, norm.artist).line2, norm.label);
      bar.classList.add('is-primed');
      primed = norm;
      return true;
    } catch (err) {
      /* a bad spec or a missing element is a no-op, never a throw: this
         runs off a storage read / a URL parameter, and neither may be able
         to break the player */
      return false;
    }
  }

  /* Consume the primed track from the bar's play button. Must stay inside
     the click's user-gesture window, so it is synchronous down to
     playIndexAt() like every other transport control. */
  function playPrimed() {
    if (!primed) return false;
    var idx = primed.index;
    var startSec = primed.startSec;
    /* drop the primed presentation BEFORE playing: load() repaints the same
       slot with the real track and the label must not survive into it */
    clearPrimed(false);
    return playIndexAt(idx, startSec);
  }

  window.uePlayerBar = {
    version: 1,
    prime: primeBar,
    clear: function () { return clearPrimed(true); }
  };

  /* build-time render: the bar mirrors the hero from the first hydrated frame */
  syncBarToHero(false);

  window.UEPlayer.host = {
    version: 1,
    getQueue: function () { return queue; },
    getState: function () {
      return { index: state.index, playing: state.playing, shuffle: state.shuffle, repeat: state.repeat };
    },
    getCurrentTrack: function () { return queue[state.index] || null; },
    getCurrentTime: function () { return audio.currentTime || 0; },
    getDuration: function () { return currentDuration(); },
    getTxid: function (idx) { return txidForIndex(typeof idx === 'number' ? idx : state.index); },
    findIndexByTxid: findIndexByTxid,
    playIndexAt: playIndexAt,
    play: play,
    pause: pause,
    togglePlay: function () { state.playing ? pause() : play(); },
    next: function () { load(nextIndex(1)); play(); },
    prev: function () {
      if (audio.currentTime > 4) { restartCurrentTrack(); return; }
      load(nextIndex(-1)); play();
    },
    /* Absolute seek and relative nudge, both through attemptSeek() — the
       hold-until-range-confirmed path, never a raw audio.currentTime write. */
    seek: function (timeSec) {
      if (typeof timeSec !== 'number' || !isFinite(timeSec)) return;
      var d = currentDuration();
      var t = Math.max(0, d > 0 ? Math.min(timeSec, d) : timeSec);
      attemptSeek(t);
    },
    seekBy: function (deltaSec) {
      if (typeof deltaSec !== 'number' || !isFinite(deltaSec)) return;
      window.UEPlayer.host.seek((audio.currentTime || 0) + deltaSec);
    },
    on: onFeatureEvent,
    /* the hero's refresh button: pick a different random mix (see rerollFeatured) */
    rerollFeatured: function () { return rerollFeatured(); }
  };

  /* ---------- audio events -> controller ----------
     Every event carries `currentGeneration` (the generation stamped on the
     last setSrc command we actually executed) — the controller drops
     anything whose generation doesn't match its own, so an event from an
     abandoned source can never mutate current state. */
  function forwardMediaEvent(type) {
    if (!activeController) return [];
    var errCode = audio.error ? audio.error.code : null;
    var commands = activeController.handleMediaEvent({
      type: type,
      generation: currentGeneration,
      currentTime: audio.currentTime,
      duration: audio.duration,
      readyState: audio.readyState,
      seekableRanges: seekableRangesFromAudio(),
      paused: audio.paused,
      errorCode: errCode
    });
    execCommands(commands);
    tryApplyPendingUserSeek();
    return commands;
  }

  audio.addEventListener('play', function () {
    /* priming never survives an actual play — the primed track's own play
       included (load() has already repainted the slot for it). Covers every
       route into playback, not just the bar's button. */
    clearPrimed(false);
    state.playing = true; syncButtons(); forwardMediaEvent('play');
    emitFeatureEvent('playback', { playing: true, index: state.index, track: queue[state.index] || null });
  });
  audio.addEventListener('pause', function () {
    state.playing = false; syncButtons(); forwardMediaEvent('pause');
    emitFeatureEvent('playback', { playing: false, index: state.index, track: queue[state.index] || null });
    /* Warming coordination (warming-contract Fix 2): an explicit pause is
       a settle, same as a genuine 'playing' below — the critical start
       window this txid was competing with warming for is over either
       way. */
    if (window.UEWarm && typeof window.UEWarm.notifyPlaybackSettled === 'function') {
      try { window.UEWarm.notifyPlaybackSettled(); } catch (err) { /* hint only */ }
    }
  });
  audio.addEventListener('loadstart', function () { forwardMediaEvent('loadstart'); });
  audio.addEventListener('loadedmetadata', function () {
    var d = audio.duration;
    if (isFinite(d) && d > 0) {
      if (barTimeTot) barTimeTot.textContent = formatTime(d);
      if (state.index === heroIdx && heroTimeTot) heroTimeTot.textContent = formatTime(d);
    }
    /* apply a resume position from a setSrc command (failover/recovery/
       retry) once metadata is available; the module's own `seeked` check
       is what verifies it actually landed — this just kicks it off */
    if (pendingResumeTime > 0) {
      var rt = pendingResumeTime;
      pendingResumeTime = 0;
      try { audio.currentTime = rt; } catch (err) { /* not seekable yet */ }
    }
    forwardMediaEvent('loadedmetadata');
    /* AFTER the controller has seen the event (so activeController state is
       current) — a deep-link `?t=` / Resume start position, applied through
       the normal verified seek path. No-op unless a user gesture already
       requested one via host.playIndexAt(). */
    applyPendingStartTime();
  });
  audio.addEventListener('canplay', function () { forwardMediaEvent('canplay'); });
  audio.addEventListener('playing', function () {
    /* Genuine first audio for this track load — from here on a
       waiting/stalled is a real mid-stream stall, not cold-start latency
       (see hasPlayedThisLoad's declaration and the 'buffering' gate in
       execCommand's 'status' case). Set BEFORE forwarding the event so
       any status command this same event produces is already subject to
       the correct (post-first-play) gating. */
    hasPlayedThisLoad = true;
    forwardMediaEvent('playing');
    clearStartingStatus();
    writeHostPrefOnConfirmedPlayback();
    /* Warming coordination (warming-contract Fix 2): genuine first audio
       for this start — the critical window notifyPlaybackStarting() paused
       warming for is over; let background warming resume. */
    if (window.UEWarm && typeof window.UEWarm.notifyPlaybackSettled === 'function') {
      try { window.UEWarm.notifyPlaybackSettled(); } catch (err) { /* hint only */ }
    }
  });
  audio.addEventListener('timeupdate', function () {
    var d = currentDuration();
    var t = audio.currentTime;
    paintProgress(d > 0 ? t / d : 0, t);
    forwardMediaEvent('timeupdate');
    /* Belt-and-braces for the "Starting mix" pill: advancing time on an
       unpaused element IS playback, whether or not a `playing` event was
       observed (it can be missed after a source swap, and engines differ).
       Same one-way rule as clearStartingStatus() — only 'starting' retires. */
    if (!audio.paused && t > 0) {
      hasPlayedThisLoad = true;
      clearStartingStatus();
    }
    emitFeatureEvent('time', { index: state.index, currentTime: t, duration: d });
  });
  audio.addEventListener('waiting', function () { forwardMediaEvent('waiting'); });
  audio.addEventListener('stalled', function () { forwardMediaEvent('stalled'); });
  audio.addEventListener('seeking', function () { forwardMediaEvent('seeking'); });
  audio.addEventListener('seeked', function () { forwardMediaEvent('seeked'); });
  audio.addEventListener('error', function () { forwardMediaEvent('error'); });
  audio.addEventListener('ended', function () {
    var commands = forwardMediaEvent('ended');
    if (!activeController) return;
    /* Do not sniff the log entry's `reason` string — decide deterministically:
       a `setSrc` in the returned commands means the controller is
       recovering this candidate in place (a premature end within its
       recovery budget, or a failover to the next candidate) and queue
       advance must NOT run. Only advance once there is no setSrc AND the
       controller has actually settled to 'idle' (a real natural end —
       'failed' also has no setSrc but must not advance either). */
    var hasSetSrc = false;
    for (var i = 0; i < commands.length; i++) {
      if (commands[i].type === 'setSrc') { hasSetSrc = true; break; }
    }
    if (hasSetSrc || activeController.state !== 'idle') return;

    if (state.repeat === 'one') { restartCurrentTrack(); return; }
    var atEnd = !state.shuffle && state.index === queue.length - 1;
    if (atEnd && state.repeat === 'off') { state.playing = false; syncButtons(); return; }
    load(nextIndex(1));
    play();
  });

  /* ---------- conservative stall watchdog ----------
     Replaces the old 15s frozen-clock reload (which restarted
     healthy-but-slow buffering). All recovery policy lives in
     player-core.js's tick(); this just drives its clock on a modest
     cadence and executes whatever commands come back. */
  setInterval(function () {
    if (!activeController) return;
    execCommands(activeController.tick(Date.now()));
    tryApplyPendingUserSeek();
  }, 2000);

  /* ---------- waveform scrubbing ---------- */

  /* pointer-driven preview + commit. Drag paints a provisional playhead via
     paintProgress() only (never touches audio.currentTime); exactly one
     seek commits, on pointer release — the old code seeked on pointerdown
     AND release (two seeks); this fixes that. */
  function attachScrubber(el, targetIdxFn) {
    if (!el) return;
    var dragging = false;
    var lastFrac = 0;
    function frac(e) {
      var r = el.getBoundingClientRect();
      return r.width > 0 ? (e.clientX - r.left) / r.width : 0;
    }
    function ensureTrack() {
      var idx = targetIdxFn();
      if (idx < 0) return false;
      if (idx !== state.index) { load(idx); play(); }
      return true;
    }
    function previewPaint(f) {
      var d = currentDuration();
      paintProgress(f, f * d);
    }
    function commit(f) {
      var d = currentDuration();
      attemptSeek(Math.max(0, f * d));
    }
    el.addEventListener('pointerdown', function (e) {
      if (!ensureTrack()) return;
      e.preventDefault();
      dragging = true;
      lastFrac = Math.max(0, Math.min(1, frac(e)));
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) { /* ok */ } }
      previewPaint(lastFrac);
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      lastFrac = Math.max(0, Math.min(1, frac(e)));
      previewPaint(lastFrac);
    });
    /* Idempotent by the `dragging` guard above — a double release (e.g.
       pointerup firing and THEN lostpointercapture for the same drag) is a
       no-op on the second call, so exactly one seek still commits per
       drag even though two events can now reach this function. */
    function release() {
      if (!dragging) return;
      dragging = false;
      commit(lastFrac);
    }
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    /* Some platforms can lose pointer capture (tab switch, an OS gesture,
       scroll takeover) without ever firing pointerup/pointercancel — if
       that happens `dragging` would otherwise stay stuck `true` and a
       later, unrelated pointer interaction could resume a stale drag and
       commit a seek the user never asked for. */
    el.addEventListener('lostpointercapture', release);
  }

  attachScrubber(barWaveEl, function () { return state.index; });
  attachScrubber(heroWaveEl, function () { return heroIdx; });
  attachScrubber(heroProgressLineEl, function () { return heroIdx; });

  /* keyboard path (plan Phase 4 item 4 — explicitly left to the integrator
     by the UI agent). Only the primary scrubber per surface is a tab stop
     (`.waveform-progress-line` is a secondary pointer target for the same
     hero scrub action — a second independent tab stop for one logical
     control would be confusing, so it stays pointer-only). Every key path
     resolves through attemptSeek(), the same verified hold-or-apply path
     pointer seeks use. */
  function makeScrubberAccessible(el, label) {
    if (!el) return;
    el.removeAttribute('aria-hidden'); /* player-bar-waveform ships aria-hidden
      in the static template for a purely decorative canvas; it is now a
      real control, so that has to come off — can't touch the template, so
      this is done here at runtime */
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'slider');
    el.setAttribute('aria-orientation', 'horizontal');
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-valuemin', '0');
    el.setAttribute('aria-valuemax', '0');
    el.setAttribute('aria-valuenow', '0');
    el.setAttribute('aria-valuetext', '0:00');
  }
  function attachScrubberKeyboard(el, targetIdxFn) {
    if (!el) return;
    el.addEventListener('keydown', function (e) {
      var key = e.key;
      var delta = 0;
      if (key === 'ArrowLeft') delta = -10;
      else if (key === 'ArrowRight') delta = 10;
      else if (key === 'ArrowUp') delta = 30;
      else if (key === 'ArrowDown') delta = -30;
      else if (key !== 'Home' && key !== 'End') return;

      var idx = targetIdxFn();
      if (idx < 0) return;
      e.preventDefault();
      if (idx !== state.index) { load(idx); play(); }
      var d = currentDuration();
      var base = state.index === idx ? (audio.currentTime || 0) : 0;
      var target = base;
      if (key === 'Home') target = 0;
      else if (key === 'End') target = Math.max(0, d - 0.5);
      else target = base + delta;
      target = Math.max(0, d > 0 ? Math.min(target, d) : target);
      attemptSeek(target);
    });
  }
  makeScrubberAccessible(barWaveEl, 'Seek player');
  makeScrubberAccessible(heroWaveEl, 'Seek featured mix');
  attachScrubberKeyboard(barWaveEl, function () { return state.index; });
  attachScrubberKeyboard(heroWaveEl, function () { return heroIdx; });

  /* ---------- intent-based warm prioritization ----------
     Lives entirely in ue-warm.js (setupIntentWarming), not here.
     ue-warm.js loads earlier than this file (boot.js's eager chain) and
     maps anchor -> txid directly from `href` via UEPlayerCore.extractTxid,
     so it needs no data-queue-idx (an attribute THIS file assigns, below,
     to the queue array built above) — a duplicate listener set here could
     only ever run AFTER that assignment exists, which defeats warming's
     whole "before the click" purpose, and having two independent
     delegated document-level listener sets for the same gesture family
     was pure waste. See ue-warm.js's UEWarm.prioritize()/
     notifyPlaybackStarting() for the public API this file DOES use, below
     (execCommand's 'setSrc' case and the 'playing'/'pause' listeners). */

  /* ---------- click wiring ---------- */

  document.addEventListener('click', function (e) {
    var circle = e.target.closest ? e.target.closest('.play-circle[data-queue-idx]') : null;
    if (circle) {
      e.preventDefault();
      toggleIndex(parseInt(circle.getAttribute('data-queue-idx'), 10));
      return;
    }
    /* clicking a playlist anchor (cover art) also plays */
    var anchor = e.target.closest ? e.target.closest('a[data-queue-idx]') : null;
    if (anchor && (anchor.hasAttribute('data-playlist') || anchor.hasAttribute('data-link'))) {
      e.preventDefault();
      toggleIndex(parseInt(anchor.getAttribute('data-queue-idx'), 10));
    }
  });

  if (barPlayBtn) barPlayBtn.addEventListener('click', function () {
    /* a primed track is what this press means; if it could not be started
       the primed state is already gone, so fall through to normal transport
       rather than leave the press doing nothing */
    if (primed && playPrimed()) return;
    /* homepage, nothing loaded yet: the bar is showing the hero's mix, so its
       play button plays THAT entry (heroIdx) — not play()'s default queue[0] */
    if (state.index < 0 && isHomeHero()) { playIndexAt(heroIdx); return; }
    state.playing ? pause() : play();
  });
  if (btnPrev) btnPrev.addEventListener('click', function () {
    if (audio.currentTime > 4) { restartCurrentTrack(); return; }
    load(nextIndex(-1)); play();
  });
  if (btnNext) btnNext.addEventListener('click', function () { load(nextIndex(1)); play(); });
  /* shuffle is a press, not a mode: any mix from the whole archive, now */
  if (btnShuffle) btnShuffle.addEventListener('click', function () { load(randomIndex()); play(); });
  /* have the archive in hand before those clicks land */
  [btnPrev, btnNext, btnShuffle].forEach(function (b) {
    if (b) b.addEventListener('pointerdown', function () { loadArchive(); }, { once: true });
  });
  if (window.requestIdleCallback) window.requestIdleCallback(function () { loadArchive(); }, { timeout: 4000 });
  else setTimeout(loadArchive, 2500);
  if (btnRepeat) btnRepeat.addEventListener('click', function () {
    state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
    syncButtons();
  });
  if (volumeSlider) {
    var storedVol = null;
    try { storedVol = window.localStorage.getItem('ue-volume'); } catch (err) { /* private mode */ }
    if (storedVol !== null) {
      audio.volume = parseFloat(storedVol);
      volumeSlider.value = storedVol;
    }
    volumeSlider.addEventListener('input', function () {
      audio.volume = parseFloat(volumeSlider.value);
      try { window.localStorage.setItem('ue-volume', volumeSlider.value); } catch (err) { /* ignore */ }
    });
  }

  /* ---------- audio download (blob — cross-origin `download` attr is
     ignored by browsers, so fetch from arweave.net and save locally) ----------
     Matches on the attribute selector a[data-download], not a specific id,
     so the new status-region download links (§F) are picked up with no
     new download code. */

  var EXT_BY_TYPE = {
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/wav': '.wav',
    'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/flac': '.flac'
  };

  document.addEventListener('click', function (e) {
    var dl = e.target.closest ? e.target.closest('a[data-download]') : null;
    if (!dl) return;
    e.preventDefault();
    if (dl.classList.contains('is-loading')) return;
    dl.classList.add('is-loading');
    var url = dl.getAttribute('href');
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (blob) {
      var ext = EXT_BY_TYPE[(blob.type || '').split(';')[0]] || '.mp3';
      var name = (dl.getAttribute('data-filename') || 'mix')
        .replace(/[\\/:*?"<>|]/g, '').trim() + ext;
      var objectUrl = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 10000);
      dl.classList.remove('is-loading');
    }).catch(function () {
      /* fallback: open the raw tx in a new tab so the user can save it */
      dl.classList.remove('is-loading');
      window.open(url, '_blank', 'noopener');
    });
  });

  /* ---------- image fallbacks (broken/missing artwork) ---------- */

  var fallbackImgs = document.querySelectorAll('img[data-fallback-initial]');
  Array.prototype.forEach.call(fallbackImgs, function (img) {
    img.addEventListener('error', function () {
      img.classList.add('cover-fallback');
      img.src = 'img/square-ue.png';
    }, { once: true });
  });

  /* ---------- mobile menu ---------- */

  var menuToggle = document.getElementById('mobile-menu-toggle');
  var mobileMenu = document.getElementById('mobile-menu');
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener('click', function () {
      mobileMenu.classList.toggle('is-open');
    });
  }

  /* ---------- search overlay ---------- */

  var searchOverlay = document.getElementById('search-overlay');
  var searchInput = document.getElementById('search-input');
  var searchResults = document.getElementById('search-results');
  var searchData = null;

  function openSearch() {
    if (!searchOverlay) return;
    searchOverlay.classList.add('is-open');
    if (searchInput) searchInput.focus();
    if (!searchData) {
      fetch('artists.json').then(function (r) { return r.json(); }).then(function (data) {
        searchData = data;
        if (searchInput && searchInput.value) renderSearch(searchInput.value);
      }).catch(function () { searchData = []; });
    }
  }
  function closeSearch() {
    if (searchOverlay) searchOverlay.classList.remove('is-open');
  }
  function renderSearch(q) {
    if (!searchResults) return;
    q = (q || '').trim().toLowerCase();
    if (!q || !searchData) { searchResults.innerHTML = ''; return; }
    var artistRows = '';
    var mixRows = '';
    searchData.forEach(function (a) {
      var page = a.artistFilename || '#';
      if ((a.artistName || '').toLowerCase().indexOf(q) !== -1) {
        artistRows += '<a class="search-result-row" href="' + page + '"><span>' + a.artistName +
          '</span><span class="search-result-sub">' + (a.mixes || []).length + ' MIXES</span></a>';
      }
      (a.mixes || []).forEach(function (m) {
        if ((m.mixTitle || '').toLowerCase().indexOf(q) !== -1) {
          mixRows += '<a class="search-result-row" href="' + page + '"><span>' + m.mixTitle +
            '</span><span class="search-result-sub">' + a.artistName + '</span></a>';
        }
      });
    });
    var html = '';
    if (artistRows) html += '<div class="search-results-heading">Selectors</div>' + artistRows;
    if (mixRows) html += '<div class="search-results-heading">Mixes</div>' + mixRows;
    if (!html) html = '<div class="search-results-heading">No results</div>';
    searchResults.innerHTML = html;
  }
  var searchToggles = document.querySelectorAll('#nav-search-toggle, #mobile-search-toggle');
  Array.prototype.forEach.call(searchToggles, function (btn) {
    btn.addEventListener('click', openSearch);
  });
  var searchClose = document.getElementById('search-overlay-close');
  if (searchClose) searchClose.addEventListener('click', closeSearch);
  if (searchOverlay) {
    searchOverlay.addEventListener('click', function (e) {
      if (e.target === searchOverlay) closeSearch();
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSearch();
  });
  if (searchInput) searchInput.addEventListener('input', function () { renderSearch(searchInput.value); });

  /* ---------- restrained load-in motion (GSAP, optional) ---------- */

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reducedMotion && typeof window.gsap !== 'undefined' && document.visibilityState === 'visible') {
    var g = window.gsap;
    var tl = g.timeline({ defaults: { ease: 'power2.out' } });
    var hero = document.getElementById('featured-mix-content');
    if (hero) tl.from(hero.children, { y: 18, opacity: 0, duration: 0.6, stagger: 0.07, clearProps: 'all' }, 0);
    var frame = document.getElementById('hero-collage-frame');
    if (frame) tl.from(frame, { y: 14, opacity: 0, duration: 0.7, clearProps: 'all' }, 0);
    var cards = document.querySelectorAll('.mix-card, .resident-card');
    if (cards.length) tl.from(cards, { y: 16, opacity: 0, duration: 0.5, stagger: 0.05, clearProps: 'all' }, 0.1);
    /* content must never stay hidden — if the tab is throttled (rAF paused),
       jump the intro to its end state */
    setTimeout(function () { if (tl.progress() < 1) tl.progress(1); }, 1800);
  }

  /* ---------- manual-test debug overlay (?uedebug=1) ----------
     Off by default; inert; never affects playback. Renders active host,
     state, currentTime, duration, seekable ranges, readyState, generation,
     and the last recovery reason at a fixed, low cadence. */
  if (UEDEBUG) {
    var dbg = document.createElement('div');
    dbg.id = 'ue-debug-overlay';
    dbg.style.cssText = 'position:fixed;bottom:8px;right:8px;z-index:99999;' +
      'background:rgba(0,0,0,0.85);color:#5eff8f;font:11px/1.5 monospace;' +
      'padding:8px 10px;border-radius:6px;max-width:320px;white-space:pre;' +
      'pointer-events:none;';
    document.addEventListener('DOMContentLoaded', function () {
      if (document.body) document.body.appendChild(dbg);
    });
    if (document.body) document.body.appendChild(dbg);
    setInterval(function () {
      var snap = window.UEPlayer.debug.snapshot();
      if (!snap) { dbg.textContent = 'UE debug: no active controller'; return; }
      var sr = seekableRangesFromAudio().map(function (r) { return r.start.toFixed(1) + '-' + r.end.toFixed(1); }).join(', ');
      dbg.textContent =
        'host: ' + (snap.activeHost || '-') + '\n' +
        'state: ' + snap.state + '\n' +
        'currentTime: ' + audio.currentTime.toFixed(2) + '\n' +
        'duration: ' + (isFinite(audio.duration) ? audio.duration.toFixed(2) : 'NaN') + '\n' +
        'seekable: [' + sr + ']\n' +
        'readyState: ' + audio.readyState + '\n' +
        'generation: ' + snap.generation + '\n' +
        'lastRecoveryReason: ' + (snap.lastRecoveryReason || '-');
    }, 500);
  }

})();
