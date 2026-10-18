// DOM-level behavior tests for website/js/ue-links.js, run against the
// purpose-built fake window/document in tests/helpers/load-ue-links.mjs
// (no jsdom in this repo). Covers the observable behavior the pure-logic
// tests can't: the deep-link scroll/highlight flow and the player-bar
// priming that replaced the deleted floating banner, the hard "never
// autoplay from a deep link" invariant (this module now never reaches the
// playback host at all — it primes the bar and the listener presses play),
// address-bar sync on real playback events, and the share-button injection
// + fallback cascade on both mix surfaces and the persistent player bar,
// ending at window.ueDialog rather than an injected copy panel.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeLinks, makeUEEnvironment, makeFakeHost, el } from './helpers/load-ue-links.mjs';

const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const OTHER_TXID = 'AbCdEfGh12345678901234567890123456789012Axy';

// Mirrors lib/WebsitePageGenerator.cjs: the play anchor carries
// data-title/data-artist/data-img, and the filename lives on the card's own
// download anchor — which is where the player-bar prime payload reads it.
function buildMixCardFixture({ txid, playable = true, title = 'Test Mix', artist = 'DJ Test' } = {}) {
  const anchorAttrs = {
    'data-playlist': '', 'data-title': title, 'data-artist': artist,
    'data-img': 'https://arweave.net/cover-' + txid, href: 'https://arweave.net/' + txid
  };
  if (!playable) anchorAttrs['data-unplayable'] = 'true';
  const anchor = el('a', anchorAttrs);
  const playBtn = el('button', { class: 'play-circle play-circle--sm' });
  const downloadBtn = el('a', { class: 'download-btn', 'data-download': '', 'data-filename': artist + ' - ' + title, href: 'https://arweave.net/' + txid });
  const actions = el('div', { class: 'mix-card-actions' }, [playBtn, downloadBtn]);
  const card = el('article', { class: 'mix-card' }, [
    el('div', { class: 'mix-card-cover' }, [anchor]),
    el('div', { class: 'mix-card-body' }, [el('div', { class: 'mix-card-title-row' }, [actions])])
  ]);
  return { card, anchor, actions };
}

/** Spy stand-in for window.uePlayerBar (implemented for real in player.js).
 *
 *  Deliberately NOT installed on the window up front: boot.js loads
 *  ue-links.js in its EAGER chain (player-core -> ue-host-pref -> ue-warm ->
 *  ue-links -> ue-resume) and loads player.js — which is what defines
 *  window.uePlayerBar — LAZILY (requestIdleCallback timeout 3500ms, or the
 *  first play-intent tap), announcing it with a document-level
 *  'ue-player-ready'. A test that pre-stubs the bar before init is testing a
 *  convenient order that never happens in a browser; `hydrate()` reproduces
 *  the real one. */
function latePlayerBar(env, { accepts = true, throws = false } = {}) {
  const calls = [];
  const bar = {
    prime: (payload) => {
      calls.push(payload);
      if (throws) throw new Error('boom');
      return accepts;
    }
  };
  return {
    calls,
    hydrate: () => {
      env.window.uePlayerBar = bar;
      if (!env.window.UEPlayer) env.window.UEPlayer = { host: makeFakeHost() };
      env.document.dispatchEvent({ type: 'ue-player-ready' });
    }
  };
}

/** The other real ordering: the player has ALREADY hydrated by the time the
 *  deep link is handled (a re-init, or a play-intent tap that loaded
 *  player.js before this module's own init ran), so the ready hook fires
 *  synchronously. Requires the env to carry UEPlayer.host. */
function alreadyHydratedPlayerBar(env, { accepts = true } = {}) {
  const calls = [];
  env.window.uePlayerBar = { prime: (payload) => { calls.push(payload); return accepts; } };
  return calls;
}

/** Spy stand-in for window.ueDialog (implemented for real in partials/modal.html). */
function fakeDialog(env) {
  const calls = [];
  env.window.ueDialog = { open: (opts) => calls.push(opts), close: () => {} };
  return calls;
}

function buildCatalogRowFixture({ txid, title = 'Row Mix', artist = 'DJ Row' } = {}) {
  const anchor = el('a', { class: 'catalog-row-cover', 'data-playlist': '', 'data-title': title, 'data-artist': artist, href: 'https://arweave.net/' + txid });
  const playBtn = el('button', { class: 'play-circle play-circle--sm' });
  const actions = el('div', { class: 'catalog-row-actions' }, [playBtn]);
  const row = el('div', { class: 'catalog-row' }, [anchor, actions]);
  return { row, anchor, actions };
}

function buildPlayerBarFixture() {
  const volume = el('div', { id: 'player-bar-volume' });
  const bar = el('div', { id: 'persistent-player-bar' }, [volume]);
  return { bar, volume };
}

async function flushMicrotasks(times = 6) {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

function click(node) {
  node.dispatchEvent({ type: 'click' });
}

describe('deep link on load — never autoplays', () => {
  test('a valid ?mix=&t= matching a track on this page highlights + scrolls + primes the bar, but never calls playIndexAt', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const playIndexAtCalls = [];
    const host = makeFakeHost({
      findIndexByTxid: (txid) => (txid === TXID ? 3 : -1),
      playIndexAt: (idx, t) => { playIndexAtCalls.push([idx, t]); return true; }
    });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=754' }, UEPlayer: { host } });
    env.document.body.appendChild(card);
    // player already hydrated in this one (env carries UEPlayer.host), so the
    // ready hook fires synchronously — see latePlayerBar for the common order
    const primeCalls = alreadyHydratedPlayerBar(env);

    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);

    loadUeLinks(env);

    // highlight + scroll happened...
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
    // ...the timestamp offer went to the player bar...
    assert.equal(primeCalls.length, 1);
    assert.equal(primeCalls[0].startSec, 754);
    // ...but playback was never triggered just by loading the page.
    assert.equal(playIndexAtCalls.length, 0);
  });

  test('even with a fully hydrated player AND window.UEBoot present, a deep link only primes — it never plays, and never forces hydration', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const ensurePlayerCalls = [];
    const playIndexAtCalls = [];
    const playCalls = [];
    const host = makeFakeHost({
      findIndexByTxid: (txid) => (txid === TXID ? 0 : -1),
      playIndexAt: (idx, t) => { playIndexAtCalls.push([idx, t]); },
      play: () => { playCalls.push(true); }
    });
    const env = makeUEEnvironment({
      location: { search: '?mix=' + TXID + '&t=90' },
      UEPlayer: { host },
      UEBoot: { ensurePlayer: (cb) => { ensurePlayerCalls.push(cb); }, isPlayerLoaded: () => true }
    });
    env.document.body.appendChild(card);
    const primeCalls = alreadyHydratedPlayerBar(env);

    loadUeLinks(env);

    assert.deepEqual(playIndexAtCalls, [], 'a deep link must never reach playIndexAt on its own');
    assert.deepEqual(playCalls, []);
    assert.equal(ensurePlayerCalls.length, 0, 'and must not force the player to hydrate either — priming is inert');
    assert.equal(primeCalls.length, 1, 'the offer is handed to the bar, whose own play button is the gesture');
  });

  test('no t -> the highlight and scroll still happen (the outline, not the timestamp, is the "you were linked here" signal)', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);
    loadUeLinks(env);
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
  });

  test('injects no floating banner of any kind — the only element this adds to <body> is the visually-hidden announcer', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    const before = env.document.body.children.length;
    loadUeLinks(env);

    assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);
    assert.equal(env.document.querySelectorAll('.ue-links-banner').length, 0);
    const added = env.document.body.children.slice(before).map((n) => n.id);
    assert.deepEqual(added, ['ue-links-announcer']);
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true, 'the highlight is the whole deep-link affordance');
  });

  test('fails silently: unknown mix (not on this page) -> no highlight, no prime, no throw, page otherwise intact', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + OTHER_TXID } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env);
    assert.doesNotThrow(() => loadUeLinks(env));
    player.hydrate();
    assert.equal(player.calls.length, 0, 'nothing to prime, even once the player hydrates');
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), false);
  });

  test('fails silently: invalid mix value -> no highlight, no prime, no throw', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=<script>alert(1)</script>' } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env);
    assert.doesNotThrow(() => loadUeLinks(env));
    player.hydrate();
    assert.equal(player.calls.length, 0, 'nothing to prime, even once the player hydrates');
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), false);
  });

  test('fails silently: no ?mix= at all -> nothing highlighted, nothing primed', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '' } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env);
    loadUeLinks(env);
    player.hydrate();
    assert.equal(player.calls.length, 0, 'nothing to prime, even once the player hydrates');
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), false);
  });

  test('an unplayable mix (data-unplayable="true") is treated as not-on-this-page', () => {
    const { card } = buildMixCardFixture({ txid: TXID, playable: false });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env);
    loadUeLinks(env);
    player.hydrate();
    assert.equal(player.calls.length, 0, 'nothing to prime, even once the player hydrates');
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), false);
  });
});

describe('deep link primes the player bar instead of showing a banner', () => {
  // REGRESSION (found in a real browser): this module is in boot.js's eager
  // chain and window.uePlayerBar comes from the LAZILY-loaded player.js, so
  // priming at init time silently did nothing on every real page load. The
  // reveal must stay immediate; only the prime waits for 'ue-player-ready'.
  test('boot.js order — the bar is absent when the deep link is handled, so the prime waits for "ue-player-ready" while the reveal does not', () => {
    const { card } = buildMixCardFixture({ txid: TXID, title: 'Love Manifesto 3', artist: 'BAI-EE' });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=754' } });
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);
    // NOTE: no uePlayerBar and no UEPlayer on the window yet — exactly the
    // state boot.js leaves us in while player.js is still pending.
    const player = latePlayerBar(env);

    loadUeLinks(env);

    // the reveal is immediate and does NOT wait on hydration
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true, 'highlight must not wait for the player');
    assert.equal(scrollCalls.length, 1, 'scroll must not wait for the player');
    assert.equal(env.document.getElementById('ue-links-announcer').textContent, 'Shared mix: Love Manifesto 3 — BAI-EE');
    assert.equal(player.calls.length, 0, 'nothing to prime yet — the bar does not exist');

    // ...then player.js finishes loading and boot.js announces it
    player.hydrate();

    assert.equal(player.calls.length, 1, 'primed exactly once, after hydration');
    assert.deepEqual(player.calls[0], {
      title: 'Love Manifesto 3',
      artist: 'BAI-EE',
      img: 'https://arweave.net/cover-' + TXID,
      href: 'https://arweave.net/' + TXID,
      filename: 'BAI-EE - Love Manifesto 3',
      startSec: 754,
      label: 'shared from 12:34',
      source: 'deep-link'
    });

    // one-shot: a second ue-player-ready must not prime again
    env.document.dispatchEvent({ type: 'ue-player-ready' });
    assert.equal(player.calls.length, 1, 'single call, no polling, no retry');
  });

  test('no t -> primes at 0 with the plain "shared link" label (the bar still names the mix you were sent)', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env);
    loadUeLinks(env);
    player.hydrate();

    assert.equal(player.calls.length, 1);
    assert.equal(player.calls[0].startSec, 0);
    assert.equal(player.calls[0].label, 'shared link');
    assert.equal(player.calls[0].source, 'deep-link');
  });

  test('the player never hydrates (no ue-player-ready ever fires) -> highlight and scroll still happen, nothing primed, nothing thrown', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=30' } });
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);
    const player = latePlayerBar(env);

    assert.doesNotThrow(() => loadUeLinks(env)); // and hydrate() is never called
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
    assert.equal(player.calls.length, 0);
  });

  test('the player hydrates but exposes no uePlayerBar at all (a stripped page) -> quiet no-op', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=30' } });
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);

    loadUeLinks(env);
    env.window.UEPlayer = { host: makeFakeHost() }; // player.js loaded, but no bar API
    assert.doesNotThrow(() => env.document.dispatchEvent({ type: 'ue-player-ready' }));
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
  });

  test('a bar that refuses (prime returns false, e.g. audio is already playing) changes nothing else', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=30' } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env, { accepts: false });
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);

    loadUeLinks(env);
    assert.doesNotThrow(() => player.hydrate());
    assert.equal(player.calls.length, 1, 'it still asks — the bar owns the refusal');
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
  });

  test('a throwing prime() never breaks the page', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=30' } });
    env.document.body.appendChild(card);
    const player = latePlayerBar(env, { throws: true });
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);

    loadUeLinks(env);
    assert.doesNotThrow(() => player.hydrate());
    assert.equal(player.calls.length, 1);
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
    assert.equal(env.document.getElementById('ue-links-announcer').textContent, 'Shared mix: Test Mix — DJ Test');
  });
});

describe('deep link scroll timing', () => {
  test('images/subresources not yet settled: the real scroll is deferred until window "load", not fired against a pre-images layout', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    env.document.readyState = 'loading';

    const loadListeners = [];
    env.window.addEventListener = (type, cb) => { if (type === 'load') loadListeners.push(cb); };
    env.window.removeEventListener = () => {};

    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);

    const realSetTimeout = globalThis.setTimeout;
    const timers = [];
    globalThis.setTimeout = (fn, ms) => { const id = realSetTimeout(fn, ms); timers.push(id); return id; };
    try {
      loadUeLinks(env);
      // boot()'s own DOMContentLoaded gate: nothing runs yet while "loading"
      assert.equal(scrollCalls.length, 0);
      assert.equal(card.classList.contains('ue-links-deep-link-highlight'), false);

      // parsing completes (readyState now "interactive"), subresources (mix
      // thumbnails/hero art) still pending
      env.document.readyState = 'interactive';
      env.document.dispatchEvent({ type: 'DOMContentLoaded' });

      assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true, 'the highlight is immediate');
      assert.equal(scrollCalls.length, 0, 'must not scroll against a not-yet-settled layout');
      assert.equal(loadListeners.length, 1, 'exactly one window "load" listener registered');

      loadListeners[0]();
      assert.equal(scrollCalls.length, 1, 'the deferred scroll fires once the page has actually settled');
    } finally {
      globalThis.setTimeout = realSetTimeout;
      timers.forEach((id) => clearTimeout(id));
    }
  });

  test('page visible, motion allowed -> smooth scroll', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);
    loadUeLinks(env);
    assert.equal(scrollCalls.length, 1);
    assert.equal(scrollCalls[0].behavior, 'smooth');
  });

  test('a hidden/background document always gets an instant scroll -- confirmed empirically that "smooth" never actually lands on a throttled hidden tab', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.hidden = true;
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);
    loadUeLinks(env);
    assert.equal(scrollCalls.length, 1);
    assert.equal(scrollCalls[0].behavior, 'auto');
  });

  test('prefers-reduced-motion -> instant scroll regardless of visibility', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({
      location: { search: '?mix=' + TXID },
      matchMedia: (q) => ({ matches: String(q).indexOf('reduce') !== -1 })
    });
    env.document.body.appendChild(card);
    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);
    loadUeLinks(env);
    assert.equal(scrollCalls[0].behavior, 'auto');
  });

  test('sets history.scrollRestoration to "manual" (feature-detected) once a deep link is found on this page', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const history = { replaceState: () => {}, scrollRestoration: 'auto' };
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID }, history });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    assert.equal(env.window.history.scrollRestoration, 'manual');
  });

  test('scrollRestoration unsupported (property absent from history) -> no throw, nothing set', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    assert.doesNotThrow(() => loadUeLinks(env));
    assert.equal('scrollRestoration' in env.window.history, false);
  });

  test('no matching deep link on this page -> scrollRestoration is left untouched', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const history = { replaceState: () => {}, scrollRestoration: 'auto' };
    const env = makeUEEnvironment({ location: { search: '?mix=' + OTHER_TXID }, history });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    assert.equal(env.window.history.scrollRestoration, 'auto');
  });
});

describe('address bar mirrors real playback', () => {
  test('a real "playback" start updates mix= via history.replaceState, preserves unrelated params, and drops any t', () => {
    const host = makeFakeHost();
    const replaceStateCalls = [];
    const env = makeUEEnvironment({
      location: { pathname: '/baiee.html', search: '?uedebug=1&mix=' + OTHER_TXID + '&t=30' },
      history: { replaceState: (...args) => replaceStateCalls.push(args) },
      UEPlayer: { host }
    });
    loadUeLinks(env);

    host._emit('playback', { playing: true, index: 2, track: { url: 'https://arweave.net/' + TXID, title: 'T', artist: 'A' } });

    assert.equal(replaceStateCalls.length, 1);
    const [, , url] = replaceStateCalls[0];
    const params = new URLSearchParams(url.split('?')[1]);
    assert.equal(params.get('mix'), TXID);
    assert.equal(params.get('uedebug'), '1');
    assert.equal(params.has('t'), false);
  });

  test('a pause transition (playing:false) does not touch the address bar', () => {
    const host = makeFakeHost();
    const replaceStateCalls = [];
    const env = makeUEEnvironment({ history: { replaceState: (...args) => replaceStateCalls.push(args) }, UEPlayer: { host } });
    loadUeLinks(env);
    host._emit('playback', { playing: false, index: 0, track: { url: 'https://arweave.net/' + TXID } });
    assert.equal(replaceStateCalls.length, 0);
  });

  test('history.replaceState unsupported -> feature-detected, no throw', () => {
    const host = makeFakeHost();
    const env = makeUEEnvironment({ history: null, UEPlayer: { host } });
    assert.doesNotThrow(() => loadUeLinks(env));
    assert.doesNotThrow(() => host._emit('playback', { playing: true, index: 0, track: { url: 'https://arweave.net/' + TXID } }));
  });

  test('subscribes once the player becomes ready even if it was not hydrated at load time', () => {
    const replaceStateCalls = [];
    const env = makeUEEnvironment({ history: { replaceState: (...args) => replaceStateCalls.push(args) } });
    loadUeLinks(env);

    const host = makeFakeHost();
    env.window.UEPlayer = { host };
    env.document.dispatchEvent({ type: 'ue-player-ready' });
    host._emit('playback', { playing: true, index: 0, track: { url: 'https://arweave.net/' + TXID } });
    assert.equal(replaceStateCalls.length, 1);
  });
});

describe('share buttons on mix surfaces', () => {
  test('a share icon button is injected once into .mix-card-actions and .catalog-row-actions', () => {
    const { card, actions: cardActions } = buildMixCardFixture({ txid: TXID });
    const { row, actions: rowActions } = buildCatalogRowFixture({ txid: OTHER_TXID });
    const env = makeUEEnvironment({});
    env.document.body.appendChild(card);
    env.document.body.appendChild(row);
    loadUeLinks(env);

    const cardShareBtns = cardActions.children.filter((c) => c.getAttribute('aria-label') === 'Share this mix');
    const rowShareBtns = rowActions.children.filter((c) => c.getAttribute('aria-label') === 'Share this mix');
    assert.equal(cardShareBtns.length, 1);
    assert.equal(rowShareBtns.length, 1);
  });

  test('an unplayable card (no actions container) is skipped without throwing', () => {
    const anchor = el('a', { 'data-playlist': '', href: 'https://arweave.net/' + TXID, 'data-unplayable': 'true' });
    const card = el('article', { class: 'mix-card is-unplayable' }, [anchor, el('span', { class: 'unplayable-note' })]);
    const env = makeUEEnvironment({});
    env.document.body.appendChild(card);
    assert.doesNotThrow(() => loadUeLinks(env));
  });

  test('clicking the card share button, with no navigator.share/clipboard available, falls back to execCommand and announces success', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '' } });
    env.document.body.appendChild(card);
    const dialogCalls = fakeDialog(env);
    loadUeLinks(env);

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    const live = env.document.getElementById('ue-links-announcer');
    assert.equal(live.textContent, 'Link copied to clipboard.');
    // no dialog needed since execCommand "succeeded" (fake doc.execCommand -> true)
    assert.equal(dialogCalls.length, 0);
  });

  test('when every copy path fails, the URL goes to the shared dialog as copyText — not an injected panel', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '' } });
    env.document.execCommand = () => false; // simulate every automatic copy path failing
    env.document.body.appendChild(card);
    const dialogCalls = fakeDialog(env);
    loadUeLinks(env);

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    const live = env.document.getElementById('ue-links-announcer');
    assert.equal(live.textContent, 'Could not copy automatically. The link is shown so you can copy it.');
    assert.equal(dialogCalls.length, 1);
    assert.ok(dialogCalls[0].title, 'the dialog needs a title per the contract');
    assert.match(dialogCalls[0].copyText, new RegExp('mix=' + TXID));
    // the old injected panel must not come back
    assert.equal(env.document.getElementById('ue-links-manual-copy-panel'), null);
    assert.equal(env.document.querySelectorAll('.ue-links-manual-copy-panel').length, 0);
  });

  test('no window.ueDialog -> degrades to the platform prompt() so the link is never lost', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '' } });
    env.document.execCommand = () => false;
    env.document.body.appendChild(card);
    const promptCalls = [];
    env.window.prompt = (message, value) => { promptCalls.push([message, value]); return value; };
    loadUeLinks(env); // no env.window.ueDialog at all

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    assert.equal(promptCalls.length, 1);
    assert.match(promptCalls[0][1], new RegExp('mix=' + TXID), 'the prompt carries the real share URL');
    assert.equal(env.document.getElementById('ue-links-manual-copy-panel'), null);
  });

  test('no ueDialog and no prompt (or a throwing dialog) -> announced, never thrown', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '' } });
    env.document.execCommand = () => false;
    env.document.body.appendChild(card);
    env.window.ueDialog = { open: () => { throw new Error('dialog markup missing'); } };
    loadUeLinks(env); // and no env.window.prompt either

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    assert.doesNotThrow(() => click(btn));
    await flushMicrotasks();

    const live = env.document.getElementById('ue-links-announcer');
    assert.equal(live.textContent, 'Could not copy automatically. The link is shown so you can copy it.');
  });

  test('native share is preferred and receives the built share URL', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID, title: 'Cool Mix', artist: 'DJ Cool' });
    const shareCalls = [];
    const env = makeUEEnvironment({
      navigator: { share: (data) => { shareCalls.push(data); return Promise.resolve(); } },
      location: { pathname: '/baiee.html', search: '' }
    });
    env.document.body.appendChild(card);
    loadUeLinks(env);

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    assert.equal(shareCalls.length, 1);
    assert.match(shareCalls[0].url, new RegExp('mix=' + TXID + '$'));
    assert.match(shareCalls[0].title, /Cool Mix.*DJ Cool/);
  });
});

describe('persistent player bar share', () => {
  test('the share button stays hidden until a track is actually active', () => {
    const { bar, volume } = buildPlayerBarFixture();
    const host = makeFakeHost({ getCurrentTrack: () => null });
    const env = makeUEEnvironment({ UEPlayer: { host } });
    env.document.body.appendChild(bar);
    loadUeLinks(env);
    const btn = volume.children.find((c) => c.id === 'ue-links-player-bar-share');
    assert.ok(btn);
    assert.equal(btn.hidden, true);
  });

  test('becomes visible once a track is active, offers "Copy link" and "Copy link at <time>"', () => {
    const { bar, volume } = buildPlayerBarFixture();
    const host = makeFakeHost({
      getCurrentTrack: () => ({ title: 'Now Playing', artist: 'DJ Now' }),
      getTxid: () => TXID,
      getCurrentTime: () => 125
    });
    const env = makeUEEnvironment({ UEPlayer: { host } });
    env.document.body.appendChild(bar);
    loadUeLinks(env);

    const btn = volume.children.find((c) => c.id === 'ue-links-player-bar-share');
    assert.equal(btn.hidden, false);

    click(btn);
    const popover = env.document.getElementById('ue-links-player-bar-popover');
    assert.ok(popover);
    const items = popover.querySelectorAll('.ue-links-popover-item');
    assert.equal(items.length, 2);
    assert.equal(items[0].textContent, 'Copy link');
    assert.equal(items[1].textContent, 'Copy link at 2:05');
  });

  test('at time=0, only "Copy link" is offered (no meaningless "at 0:00" option)', () => {
    const { bar, volume } = buildPlayerBarFixture();
    const host = makeFakeHost({ getCurrentTrack: () => ({ title: 'T', artist: 'A' }), getTxid: () => TXID, getCurrentTime: () => 0 });
    const env = makeUEEnvironment({ UEPlayer: { host } });
    env.document.body.appendChild(bar);
    loadUeLinks(env);
    click(volume.children.find((c) => c.id === 'ue-links-player-bar-share'));
    const popover = env.document.getElementById('ue-links-player-bar-popover');
    assert.equal(popover.querySelectorAll('.ue-links-popover-item').length, 1);
  });

  test('"Copy link at <time>" shares a URL carrying t=<current time>, via clipboard when available', async () => {
    const { bar, volume } = buildPlayerBarFixture();
    const host = makeFakeHost({ getCurrentTrack: () => ({ title: 'T', artist: 'A' }), getTxid: () => TXID, getCurrentTime: () => 125 });
    const clipboardCalls = [];
    const env = makeUEEnvironment({
      UEPlayer: { host },
      navigator: { clipboard: { writeText: (text) => { clipboardCalls.push(text); return Promise.resolve(); } } },
      location: { pathname: '/baiee.html', search: '' }
    });
    env.document.body.appendChild(bar);
    loadUeLinks(env);

    click(volume.children.find((c) => c.id === 'ue-links-player-bar-share'));
    const atTimeBtn = env.document.getElementById('ue-links-player-bar-popover').querySelectorAll('.ue-links-popover-item')[1];
    click(atTimeBtn);
    await flushMicrotasks();

    assert.equal(clipboardCalls.length, 1);
    assert.match(clipboardCalls[0], /[?&]t=125(&|$)/);
    // popover closes after picking an option
    assert.equal(env.document.getElementById('ue-links-player-bar-popover'), null);
  });
});
