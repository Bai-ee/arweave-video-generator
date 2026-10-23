/* ==========================================================================
   Underground Existence — ue-analytics.js
   First-party visitor analytics. Sends three event types to HITLOOP's
   collector (hitloop.agency/api/public/site-events), readable through the
   HITLOOP MCP tool get_site_analytics:
     pageview   — every page load (path, referrer, UTM tags; first page of a
                  session is flagged `entry` so traffic sources count once)
     engagement — once per page: 15 s on the page or half of it scrolled
     click    — any link / button / [data-track] element (label + href)
     play     — a mix starting on the shared player (title from the bar)
   No cookies, no IP, no fingerprinting: a random visitor id in localStorage
   and a session id that expires after 30 idle minutes. Location comes from
   the collector's edge geo headers. Loaded by boot.js; never throws and
   never blocks the player. Skipped on localhost unless ?ue_analytics=1.
   Test mode: open any page with ?ue_analytics_test=1 and every event from
   that tab is flagged as test traffic, kept out of the real numbers.
   ========================================================================== */
(function () {
  'use strict';

  var ENDPOINT = 'https://hitloop.agency/api/public/site-events';
  var SITE = 'ue';
  var SESSION_IDLE_MS = 30 * 60 * 1000;
  var ENGAGE_DWELL_MS = 15 * 1000;
  var ENGAGE_SCROLL_RATIO = 0.5;

  if (window.__ueAnalytics) return;
  window.__ueAnalytics = true;

  var host = location.hostname;
  if ((host === 'localhost' || host === '127.0.0.1' || host === '') && !/[?&]ue_analytics=1\b/.test(location.search)) return;

  function randomId() {
    try {
      var a = new Uint8Array(12);
      crypto.getRandomValues(a);
      return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    } catch (err) {
      return (Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
    }
  }

  function read(key) { try { return localStorage.getItem(key); } catch (err) { return null; } }
  function write(key, val) { try { localStorage.setItem(key, val); } catch (err) { /* private mode */ } }

  var testMode = false;
  try {
    if (/[?&]ue_analytics_test=1\b/.test(location.search)) sessionStorage.setItem('ue_a_test', '1');
    testMode = sessionStorage.getItem('ue_a_test') === '1';
  } catch (err) { testMode = /[?&]ue_analytics_test=1\b/.test(location.search); }

  var vid = read('ue_a_vid');
  if (!vid) { vid = randomId(); write('ue_a_vid', vid); }

  /* Session: reuse while active within 30 min; otherwise start a new one. */
  var now = Date.now();
  var sid = read('ue_a_sid');
  var last = Number(read('ue_a_last')) || 0;
  var isEntry = false;
  if (!sid || now - last > SESSION_IDLE_MS) { sid = randomId(); write('ue_a_sid', sid); isEntry = true; }
  function touch() { write('ue_a_last', String(Date.now())); }
  touch();

  function send(payload) {
    payload.site = SITE;
    payload.vid = vid;
    payload.sid = sid;
    payload.path = location.pathname;
    payload.title = document.title;
    if (testMode) payload.test = true;
    var body = JSON.stringify(payload);
    touch();
    try {
      /* A string body goes as text/plain: a CORS simple request, no preflight. */
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, body)) return;
    } catch (err) { /* fall through */ }
    try {
      fetch(ENDPOINT, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } });
    } catch (err) { /* give up quietly */ }
  }

  /* ---------- pageview ---------- */
  var params;
  try { params = new URLSearchParams(location.search); } catch (err) { params = null; }
  function utm(k) { return params ? params.get('utm_' + k) : null; }
  send({
    type: 'pageview',
    entry: isEntry,
    ref: document.referrer || null,
    utm: { source: utm('source') || (params && params.get('ref')), medium: utm('medium'), campaign: utm('campaign') }
  });

  /* ---------- engagement (once per page) ---------- */
  var engaged = false;
  function engage() {
    if (engaged) return;
    engaged = true;
    window.removeEventListener('scroll', onScroll);
    send({ type: 'engagement' });
  }
  function onScroll() {
    var doc = document.documentElement;
    var scrollable = doc.scrollHeight - window.innerHeight;
    if (scrollable > 0 && (window.scrollY || doc.scrollTop) / scrollable >= ENGAGE_SCROLL_RATIO) engage();
  }
  setTimeout(engage, ENGAGE_DWELL_MS);
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ---------- clicks ---------- */
  function labelOf(el) {
    var t = el.getAttribute('data-track') || el.getAttribute('aria-label') || el.getAttribute('title');
    if (!t) t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!t) { var img = el.querySelector && el.querySelector('img[alt]'); if (img) t = img.getAttribute('alt'); }
    return (t || el.id || el.tagName.toLowerCase()).slice(0, 120);
  }
  function isSameSite(url) {
    return url.hostname === location.hostname || /(^|\.)arweave\.net$|(^|\.)ar\.io$/.test(url.hostname) || url.hostname === 'undergroundexistence.info';
  }
  document.addEventListener('click', function (ev) {
    try {
      var el = ev.target && ev.target.closest && ev.target.closest('a[href], button, [role="button"], [data-track]');
      if (!el) return;
      var href = null;
      var kind = 'button';
      if (el.tagName === 'A') {
        var url = new URL(el.getAttribute('href'), location.href);
        href = url.href;
        kind = /^(mailto|tel):/.test(url.protocol) ? 'contact' : (isSameSite(url) ? 'internal' : 'outbound');
      }
      send({ type: 'click', label: labelOf(el), href: href, kind: kind });
    } catch (err) { /* never break a click */ }
  }, true);

  /* ---------- mix plays ----------
     boot.js owns the one shared <audio> (window.__ueAudioEl) and starts it
     on a silent data: WAV to unlock autoplay; that and repeat `playing`
     events for the same source (pause/resume, seeks) are ignored. */
  var lastSrc = null;
  function watchAudio(audio) {
    audio.addEventListener('playing', function () {
      var src = audio.currentSrc || audio.src || '';
      if (!src || src.indexOf('data:') === 0 || src === lastSrc) return;
      lastSrc = src;
      /* Let player.js paint the bar's title for the new track first. */
      setTimeout(function () {
        var titleEl = document.getElementById('player-bar-title');
        var artistEl = document.getElementById('player-bar-artist');
        var title = titleEl ? (titleEl.textContent || '').trim() : '';
        var artist = artistEl ? (artistEl.textContent || '').trim() : '';
        send({ type: 'play', label: [artist, title].filter(Boolean).join(' — ') || 'unknown mix', href: src, kind: 'mix' });
      }, 400);
    });
  }
  if (window.__ueAudioEl) watchAudio(window.__ueAudioEl);
})();
