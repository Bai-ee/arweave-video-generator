// DOM-level behavior tests for website/js/ue-links.js, run against the
// purpose-built fake window/document in tests/helpers/load-ue-links.mjs
// (no jsdom in this repo). Covers the observable behavior the pure-logic
// tests can't: the deep-link banner/highlight/scroll flow, the hard
// "never autoplay from a deep link" invariant (playIndexAt is only ever
// reached from a simulated click, gated through window.UEBoot.ensurePlayer
// exactly like the integration contract requires), address-bar sync on
// real playback events, and the share-button injection + fallback cascade
// on both mix surfaces and the persistent player bar.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeLinks, makeUEEnvironment, makeFakeHost, el } from './helpers/load-ue-links.mjs';

const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const OTHER_TXID = 'AbCdEfGh12345678901234567890123456789012Axy';

function buildMixCardFixture({ txid, playable = true, title = 'Test Mix', artist = 'DJ Test' } = {}) {
  const anchorAttrs = { 'data-playlist': '', 'data-title': title, 'data-artist': artist, href: 'https://arweave.net/' + txid };
  if (!playable) anchorAttrs['data-unplayable'] = 'true';
  const anchor = el('a', anchorAttrs);
  const playBtn = el('button', { class: 'play-circle play-circle--sm' });
  const actions = el('div', { class: 'mix-card-actions' }, [playBtn]);
  const card = el('article', { class: 'mix-card' }, [
    el('div', { class: 'mix-card-cover' }, [anchor]),
    el('div', { class: 'mix-card-body' }, [el('div', { class: 'mix-card-title-row' }, [actions])])
  ]);
  return { card, anchor, actions };
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
  test('a valid ?mix=&t= matching a track on this page highlights + shows a banner, but never calls playIndexAt on its own', () => {
    const { card, anchor } = buildMixCardFixture({ txid: TXID });
    const playIndexAtCalls = [];
    const host = makeFakeHost({
      findIndexByTxid: (txid) => (txid === TXID ? 3 : -1),
      playIndexAt: (idx, t) => { playIndexAtCalls.push([idx, t]); return true; }
    });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID + '&t=754' }, UEPlayer: { host } });
    env.document.body.appendChild(card);

    const scrollCalls = [];
    card.scrollIntoView = (opts) => scrollCalls.push(opts);

    loadUeLinks(env);

    // highlight + scroll happened...
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true);
    assert.equal(scrollCalls.length, 1);
    // ...but playback was never triggered just by loading the page.
    assert.equal(playIndexAtCalls.length, 0);

    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.ok(banner, 'banner should be shown');
    assert.match(banner.querySelector('.ue-links-banner-text').textContent, /Test Mix/);
    const playFromBtn = banner.querySelector('.ue-links-banner-play');
    assert.ok(playFromBtn, '"Play from" button should exist because t was present');
    assert.equal(playFromBtn.textContent, 'Play from 12:34');

    // Only an explicit click starts playback, and only then.
    click(playFromBtn);
    assert.deepEqual(playIndexAtCalls, [[3, 754]]);
  });

  test('when the player has not hydrated yet, the "Play from" click goes through window.UEBoot.ensurePlayer first, and still never autoplays before that gesture', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const ensurePlayerCalls = [];
    let storedCallback = null;
    const env = makeUEEnvironment({
      location: { search: '?mix=' + TXID + '&t=90' },
      UEBoot: { ensurePlayer: (cb) => { ensurePlayerCalls.push(cb); storedCallback = cb; }, isPlayerLoaded: () => false }
      // UEPlayer intentionally undefined: player not hydrated yet
    });
    env.document.body.appendChild(card);

    loadUeLinks(env);
    const playFromBtn = env.document.getElementById('ue-links-deep-link-banner').querySelector('.ue-links-banner-play');

    click(playFromBtn);
    assert.equal(ensurePlayerCalls.length, 1, 'ensurePlayer must be called synchronously from the click');

    // Simulate hydration completing some time later.
    const playIndexAtCalls = [];
    const host = makeFakeHost({
      findIndexByTxid: (txid) => (txid === TXID ? 0 : -1),
      playIndexAt: (idx, t) => { playIndexAtCalls.push([idx, t]); }
    });
    env.window.UEPlayer = { host };
    assert.equal(playIndexAtCalls.length, 0, 'still nothing played before the ensurePlayer callback runs');
    storedCallback();
    assert.deepEqual(playIndexAtCalls, [[0, 90]]);
  });

  test('no t -> banner has no "Play from" button (nothing to auto-seek to)', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.ok(banner);
    assert.equal(banner.querySelector('.ue-links-banner-play'), null);
  });

  test('dismiss button removes the banner', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    click(banner.querySelector('.ue-links-banner-dismiss'));
    assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);
  });

  test('fails silently: unknown mix (not on this page) -> no banner, no throw, page otherwise intact', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + OTHER_TXID } });
    env.document.body.appendChild(card);
    assert.doesNotThrow(() => loadUeLinks(env));
    assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);
    assert.equal(card.classList.contains('ue-links-deep-link-highlight'), false);
  });

  test('fails silently: invalid mix value -> no banner, no throw', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=<script>alert(1)</script>' } });
    env.document.body.appendChild(card);
    assert.doesNotThrow(() => loadUeLinks(env));
    assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);
  });

  test('fails silently: no ?mix= at all -> no banner', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '' } });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);
  });

  test('an unplayable mix (data-unplayable="true") is treated as not-on-this-page', () => {
    const { card } = buildMixCardFixture({ txid: TXID, playable: false });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);
  });
});

describe('deep link banner clears the sticky site nav (#site-header)', () => {
  test('positions below a live-measured #site-header rather than the CSS default top:14px', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const header = el('div', { id: 'site-header' });
    header.getBoundingClientRect = () => ({ bottom: 86 });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(header);
    env.document.body.appendChild(card);
    loadUeLinks(env);
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.equal(banner.style.top, '100px', 'header.bottom (86) + the 14px gap');
  });

  test('falls back to the CSS default top when #site-header is absent', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(card);
    loadUeLinks(env);
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.equal(banner.style.top, '14px');
  });

  test('falls back to the CSS default when #site-header has no getBoundingClientRect (e.g. a non-Element stand-in)', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const header = el('div', { id: 'site-header' });
    delete header.getBoundingClientRect;
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(header);
    env.document.body.appendChild(card);
    assert.doesNotThrow(() => loadUeLinks(env));
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.equal(banner.style.top, '14px');
  });

  test('a throwing getBoundingClientRect degrades to the CSS default, never throws', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const header = el('div', { id: 'site-header' });
    header.getBoundingClientRect = () => { throw new Error('boom'); };
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(header);
    env.document.body.appendChild(card);
    assert.doesNotThrow(() => loadUeLinks(env));
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.equal(banner.style.top, '14px');
  });

  test('repositions on window resize while shown, and stops listening once dismissed', () => {
    const { card } = buildMixCardFixture({ txid: TXID });
    const header = el('div', { id: 'site-header' });
    let headerBottom = 86;
    header.getBoundingClientRect = () => ({ bottom: headerBottom });
    const env = makeUEEnvironment({ location: { search: '?mix=' + TXID } });
    env.document.body.appendChild(header);
    env.document.body.appendChild(card);

    const resizeListeners = [];
    env.window.addEventListener = (type, cb) => { if (type === 'resize') resizeListeners.push(cb); };
    env.window.removeEventListener = (type, cb) => {
      if (type !== 'resize') return;
      const i = resizeListeners.indexOf(cb);
      if (i !== -1) resizeListeners.splice(i, 1);
    };

    loadUeLinks(env);
    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.equal(banner.style.top, '100px');
    assert.equal(resizeListeners.length, 1);

    // simulate a breakpoint change shrinking the nav (e.g. rotating a phone)
    headerBottom = 60;
    resizeListeners[0]();
    assert.equal(banner.style.top, '74px');

    click(banner.querySelector('.ue-links-banner-dismiss'));
    assert.equal(resizeListeners.length, 0, 'the resize listener must be removed once the banner is gone');
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
      assert.equal(env.document.getElementById('ue-links-deep-link-banner'), null);

      // parsing completes (readyState now "interactive"), subresources (mix
      // thumbnails/hero art) still pending
      env.document.readyState = 'interactive';
      env.document.dispatchEvent({ type: 'DOMContentLoaded' });

      assert.equal(card.classList.contains('ue-links-deep-link-highlight'), true, 'highlight/banner are immediate');
      assert.ok(env.document.getElementById('ue-links-deep-link-banner'));
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
    loadUeLinks(env);

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    const live = env.document.getElementById('ue-links-announcer');
    assert.equal(live.textContent, 'Link copied to clipboard.');
    // no manual-copy panel needed since execCommand "succeeded" (fake doc.execCommand -> true)
    assert.equal(env.document.getElementById('ue-links-manual-copy-panel'), null);
  });

  test('when every copy path fails, a visible read-only URL fallback is shown', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '' } });
    env.document.execCommand = () => false; // simulate every automatic copy path failing
    env.document.body.appendChild(card);
    loadUeLinks(env);

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    const live = env.document.getElementById('ue-links-announcer');
    assert.equal(live.textContent, 'Could not copy automatically. Link shown below.');
    const panel = env.document.getElementById('ue-links-manual-copy-panel');
    assert.ok(panel, 'a manual copy panel should appear');
    const input = panel.querySelector('.ue-links-manual-copy-input');
    assert.match(input.value, new RegExp('mix=' + TXID));
  });

  test('the manual copy panel is positioned top-anchored (clearing the nav), never the old bottom:100px that collided with the resume bar', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const header = el('div', { id: 'site-header' });
    header.getBoundingClientRect = () => ({ bottom: 86 });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '' } });
    env.document.execCommand = () => false;
    env.document.body.appendChild(header);
    env.document.body.appendChild(card);
    loadUeLinks(env);

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    const panel = env.document.getElementById('ue-links-manual-copy-panel');
    assert.equal(panel.style.top, '100px', 'header.bottom (86) + the 14px nav gap, same as the deep-link banner');
    assert.equal('bottom' in panel.style && panel.style.bottom, false, 'must not also carry a bottom offset (would stretch a fixed box between two anchors)');
  });

  test('the manual copy panel stacks below an already-shown deep-link banner rather than overlapping it', async () => {
    const { card, actions } = buildMixCardFixture({ txid: TXID });
    const { card: otherCard } = buildMixCardFixture({ txid: OTHER_TXID });
    const env = makeUEEnvironment({ navigator: null, location: { pathname: '/baiee.html', search: '?mix=' + OTHER_TXID } });
    env.document.execCommand = () => false;
    env.document.body.appendChild(card);
    env.document.body.appendChild(otherCard);
    loadUeLinks(env);

    const banner = env.document.getElementById('ue-links-deep-link-banner');
    assert.ok(banner, 'sanity: the deep-link banner is showing for OTHER_TXID');
    banner.getBoundingClientRect = () => ({ bottom: 64 });

    const btn = actions.children.find((c) => c.getAttribute('aria-label') === 'Share this mix');
    click(btn);
    await flushMicrotasks();

    const panel = env.document.getElementById('ue-links-manual-copy-panel');
    assert.equal(panel.style.top, '74px', 'banner.bottom (64) + the 10px stacking gap, below the banner rather than under/behind it');
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
