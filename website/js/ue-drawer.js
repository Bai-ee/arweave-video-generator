/* ==========================================================================
   Underground Existence — ue-drawer.js
   The "about this mix" drawer behind the player bar.
   - Opens by dragging up on the bar's grip strip (#player-bar-grip), by
     tapping the ABOUT button, or with the keyboard (Enter/Space, Esc closes).
   - Closes by dragging the strip down, the CLOSE button, Esc, or the scrim.
   - The grip strip rides up with the drawer (css: body[data-drawer="open"]);
     mid-drag both follow the finger. The controls row never moves.
   - Always available: describes the playing track, else the homepage hero
     mix, else the first mix on the page.
   - Content, for every mix: the mix (cover, title), the artist small
     (portrait from artists.json, name), then the artist's fragment
     about/<slug>.html when one exists. Both are fetched once.
   ========================================================================== */
(function () {
  'use strict';

  var body = document.body;
  var bar = document.getElementById('persistent-player-bar');
  var drawer = document.getElementById('mix-drawer');
  if (!bar || !drawer) return;

  var grip = document.getElementById('player-bar-grip');
  var GRIP_H = 48;         // the strip's height; the drawer's padding-top matches
  var aboutBtn = document.getElementById('player-bar-about');
  var scrim = document.getElementById('mix-drawer-scrim');
  var bodyEl = document.getElementById('mix-drawer-body');
  var contentEl = document.getElementById('mix-drawer-content');
  var titleEl = document.getElementById('player-bar-title');

  var MOVE_PX = 6;         // less than this is a tap (toggles); more is a swipe (commits its direction)

  var open = false;
  var currentSlug = null;
  var fragments = {};      // slug -> html | false (false = no fragment)

  /* ---------- what's playing ---------- */
  function trackFromAnchor(a) {
    return {
      title: a.getAttribute('data-title') || '',
      artist: a.getAttribute('data-artist') || '',
      img: a.getAttribute('data-img') || '',
      page: a.getAttribute('data-page') || '',
      durationSec: parseInt(a.getAttribute('data-duration-sec') || '0', 10) || 0,
      url: a.getAttribute('href') || '',
      el: a
    };
  }
  // The drawer is always about something: the playing track; before that,
  // the homepage hero's featured mix; otherwise the first mix on this page
  // (on an artist page, that artist's newest).
  function currentTrack() {
    var host = window.UEPlayer && window.UEPlayer.host;
    var t = host && host.getCurrentTrack ? host.getCurrentTrack() : null;
    if (t) return t;
    var a = document.querySelector('a[data-featured-mix][data-playlist]') ||
            document.querySelector('a[data-playlist][data-title]:not([data-unplayable])');
    return a ? trackFromAnchor(a) : null;
  }
  // the drawer can describe a fallback mix before anything is loaded
  function isPlaying(track) {
    var host = window.UEPlayer && window.UEPlayer.host;
    var t = host && host.getCurrentTrack ? host.getCurrentTrack() : null;
    return !!t && t === track;
  }
  function slugOf(track) {
    var page = track && track.page || '';
    return page ? page.replace(/^.*\//, '').replace(/\.html$/, '').toLowerCase() : null;
  }
  function esc(str) {
    return String(str == null ? '' : str).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function fetchFragment(slug, cb) {
    if (slug in fragments) { cb(fragments[slug]); return; }
    fetch('about/' + slug + '.html', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.text() : false; })
      .catch(function () { return false; })
      .then(function (html) {
        if (html && /<\s*(script|iframe|object|embed)/i.test(html)) html = false; // fragment is content, never code
        fragments[slug] = html;
        cb(html);
      });
  }

  /* artist portraits come from artists.json (the same file the player reads),
     keyed by page slug and by name so every play link resolves */
  var artistIndex = null;   // null = not loaded; {} once loaded (or failed)
  var artistWaiters = [];
  function withArtists(cb) {
    if (artistIndex) { cb(artistIndex); return; }
    artistWaiters.push(cb);
    if (artistWaiters.length > 1) return;
    fetch('artists.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        var idx = {};
        (Array.isArray(list) ? list : []).forEach(function (a) {
          var img = String(a && a.artistImageFilename || '');
          if (!/^https?:\/\//i.test(img)) return;
          var slug = String(a.artistFilename || '').replace(/^.*\//, '').replace(/\.html$/, '').toLowerCase();
          if (slug) idx['p:' + slug] = img;
          if (a.artistName) idx['n:' + String(a.artistName).toLowerCase()] = img;
        });
        artistIndex = idx;
        var waiting = artistWaiters; artistWaiters = [];
        waiting.forEach(function (fn) { fn(idx); });
      });
  }
  function portraitFor(track, idx) {
    return idx['p:' + slugOf(track)] || idx['n:' + String(track.artist || '').toLowerCase()] || '';
  }

  /* ---------- content ---------- */
  /* One layout for every mix, top to bottom:
     1. the mix: its cover | "Now playing" (once loaded) + the title, big
     2. the artist, small: portrait + name
     3. the artist's story (pull quote, interview, flyers) when there is one */
  function contentHtml(track, portrait, fragment, playing) {
    var name = track.artist || '';
    return '<div class="drawer-mix' + (track.img ? '' : ' drawer-mix--no-cover') + '">' +
        (track.img
          ? '<div class="drawer-mix-cover"><img src="' + esc(track.img) + '" alt="' + esc(track.title) + ' cover" decoding="async"></div>'
          : '') +
        '<div class="drawer-mix-text">' +
          (playing
            ? '<p class="drawer-now-playing"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4 10h3v10H4zM10.5 4h3v16h-3zM17 13h3v7h-3z"/></svg>Now playing</p>'
            : '') +
          '<h2 class="drawer-mix-title">' + esc(track.title) + '</h2>' +
          (playing ? '<div class="drawer-mix-scrub" id="drawer-mix-scrub-slot"></div>' : '') +
        '</div>' +
      '</div>' +
      (name
        ? '<div class="drawer-artist-row">' +
            (portrait ? '<div class="drawer-portrait"><img src="' + esc(portrait) + '" alt="' + esc(name) + '" decoding="async"></div>' : '') +
            '<h2 class="drawer-artist">' + esc(name) + '</h2>' +
          '</div>'
        : '') +
      (fragment ? '<div class="drawer-story">' + fragment + '</div>' : '');
  }
  // An artist's fragment can carry the real event flyer for a mix:
  // <div class="drawer-mix-covers" hidden><img data-mix="Loft Livin" src="…"></div>.
  // Matched on the title without any "(w/ …)" credit; the block is then removed.
  function mixKey(title) {
    return String(title || '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function applyFragmentCover(track) {
    var covers = contentEl.querySelector('.drawer-mix-covers');
    if (!covers) return;
    var want = mixKey(track.title);
    var match = null;
    Array.prototype.forEach.call(covers.querySelectorAll('img[data-mix]'), function (img) {
      if (!match && mixKey(img.getAttribute('data-mix')) === want) match = img;
    });
    covers.parentNode.removeChild(covers);
    var mix = contentEl.querySelector('.drawer-mix');
    if (!match || !mix) return;
    var holder = mix.querySelector('.drawer-mix-cover');
    if (!holder) {
      holder = document.createElement('div');
      holder.className = 'drawer-mix-cover';
      holder.appendChild(document.createElement('img'));
      mix.insertBefore(holder, mix.firstChild);
      mix.classList.remove('drawer-mix--no-cover');
    }
    var img = holder.querySelector('img');
    img.src = match.getAttribute('src');
    img.alt = match.getAttribute('alt') || img.alt;
    holder.classList.add('drawer-mix-cover--flyer');   // real flyer: natural shape, no square crop
  }
  // ...and details for a mix (date, venue, who played when, lineup):
  // <div class="drawer-mix-details-src" hidden><dl data-mix="Live @ Smartbar">…</dl></div>.
  // The matching list moves under the mix title; the block is then removed.
  function applyFragmentDetails(track) {
    var src = contentEl.querySelector('.drawer-mix-details-src');
    if (!src) return;
    var want = mixKey(track.title);
    var match = null;
    Array.prototype.forEach.call(src.querySelectorAll('[data-mix]'), function (el) {
      if (!match && mixKey(el.getAttribute('data-mix')) === want) match = el;
    });
    src.parentNode.removeChild(src);
    var text = contentEl.querySelector('.drawer-mix-text');
    if (!match || !text) return;
    match.removeAttribute('data-mix');
    match.className = 'drawer-mix-details';
    text.appendChild(match);
  }

  /* ---------- the playing mix's scrubber ----------
     Not every page has a hero waveform, so the drawer carries one: the bar's
     own #player-bar-wave-wrap (hidden in the v2 bar) is moved under the mix
     title while that mix is loaded. Moving the node keeps every player.js
     binding (pointer + keyboard seek, progress paint, times, status region).
     It goes back to the bar before each re-render so innerHTML never
     destroys it. */
  var waveWrap = document.getElementById('player-bar-wave-wrap');
  var waveHome = waveWrap && waveWrap.parentNode;
  var waveHomeNext = waveWrap && waveWrap.nextSibling;
  // the canvas caches its colours per theme; the themechange event is the
  // only way to make player.js re-read them (its listener just repaints)
  function repaintWave() {
    try { window.dispatchEvent(new CustomEvent('ue:themechange')); } catch (err) { /* ok */ }
  }
  function parkWave() {
    if (!waveWrap || waveWrap.parentNode === waveHome) return;
    waveHome.insertBefore(waveWrap, waveHomeNext);
    repaintWave();
  }
  function mountWave() {
    var slot = waveWrap && contentEl.querySelector('#drawer-mix-scrub-slot');
    if (!slot) return;
    slot.appendChild(waveWrap);
    repaintWave();
  }

  function syncArtist() {
    var track = currentTrack();
    var slug = slugOf(track);
    var playing = isPlaying(track);
    // the fallback mix turning into the loaded one re-renders (Now playing)
    var key = track ? slug + '|' + track.title + '|' + playing : null;
    if (key === currentSlug) return;
    currentSlug = key;
    if (!track) { setAvailable(false); if (open) setOpen(false); return; }
    withArtists(function (idx) {
      function render(fragment) {
        if (key !== currentSlug) return;
        parkWave();
        contentEl.innerHTML = contentHtml(track, portraitFor(track, idx), fragment, playing);
        applyFragmentCover(track);
        applyFragmentDetails(track);
        if (playing) mountWave();
        bodyEl.scrollTop = 0;
        setAvailable(true);
      }
      if (slug) fetchFragment(slug, render); else render(false);
    });
  }

  function setAvailable(yes) {
    bar.classList.toggle('has-about', !!yes);
    if (aboutBtn) aboutBtn.hidden = !yes;
  }

  /* ---------- open / close ---------- */
  function setOpen(next) {
    next = !!next;
    if (next && !bar.classList.contains('has-about')) return;
    open = next;
    body.setAttribute('data-drawer', open ? 'open' : 'closed');
    drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (aboutBtn) {
      aboutBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      aboutBtn.innerHTML = open ? 'Close <span aria-hidden="true">↓</span>' : 'About <span aria-hidden="true">↑</span>';
    }
    drawer.style.transform = '';
    grip.style.transform = '';
    if (open) { bodyEl.focus({ preventScroll: true }); }
    document.dispatchEvent(new CustomEvent('ue-drawer', { detail: { open: open } }));
  }

  /* ---------- drag (pointer events, vertical only) ---------- */
  /* The strip and the drawer move as one body between two rests (closed /
     open). The finger drives it, clamped to that travel. Release always
     lands on a rest: a tap toggles, any swipe commits in its direction,
     never a snap-back. The landing eases over the distance left, so a
     near-complete drag lands at once instead of replaying the whole ease. */
  function snapTo(next, remainingFrac) {
    var ms = Math.round(180 + 320 * Math.min(1, Math.max(0, remainingFrac)));
    drawer.style.transition = 'transform ' + ms + 'ms var(--drawer-ease)';
    grip.style.transition = 'transform ' + ms + 'ms var(--drawer-ease)';
    setOpen(next);
    setTimeout(function () { drawer.style.transition = ''; grip.style.transition = ''; }, ms + 20);
  }
  function attachDrag(el) {
    if (!el) return;
    var startY = 0, lastY = 0, dragging = false, moved = false;
    var height = 0, y = 0;
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest && e.target.closest('button, a, input')) return;
      if (!open && !bar.classList.contains('has-about')) return;
      startY = lastY = e.clientY;
      dragging = true; moved = false;
      height = drawer.getBoundingClientRect().height || 1;
      y = open ? 0 : height;
      drawer.style.transition = 'none';
      grip.style.transition = 'none';
      // pin both where they are BEFORE the state flips, so nothing jumps
      drawer.style.transform = 'translateY(' + y + 'px)';
      grip.style.transform = 'translateY(' + (-(height - y) * (height - GRIP_H) / height) + 'px)';
      body.setAttribute('data-drawer', 'dragging');
      drawer.setAttribute('aria-hidden', 'false');
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
      if (e.cancelable) e.preventDefault();
    });
    el.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = e.clientY - startY;
      if (Math.abs(dy) > MOVE_PX) moved = true;
      lastY = e.clientY;
      // closed = translateY(height), open = 0; never past either rest
      y = Math.min(height, Math.max(0, (open ? 0 : height) + dy));
      drawer.style.transform = 'translateY(' + y + 'px)';
      grip.style.transform = 'translateY(' + (-(height - y) * (height - GRIP_H) / height) + 'px)';
      if (e.cancelable) e.preventDefault();
    });
    function end(e) {
      if (!dragging) return;
      dragging = false;
      var endY = e.clientY !== undefined ? e.clientY : lastY;
      var dy = endY - startY;
      var next;
      if (!moved) next = !open;                 // a tap toggles
      else if (open) next = !(dy > MOVE_PX);    // swiped down: close
      else next = (-dy > MOVE_PX);              // swiped up: open
      var remaining = next ? y / height : (height - y) / height;
      snapTo(next, remaining);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  attachDrag(grip);

  if (aboutBtn) aboutBtn.addEventListener('click', function () { setOpen(!open); });
  if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && open) { setOpen(false); if (aboutBtn) aboutBtn.focus(); }
  });

  /* ---------- follow the player ---------- */
  syncArtist();
  document.addEventListener('ue-player-ready', syncArtist);
  if (titleEl && window.MutationObserver) {
    new MutationObserver(syncArtist).observe(titleEl, { childList: true, subtree: true, characterData: true, attributes: true });
  }
  body.setAttribute('data-drawer', 'closed');
})();
