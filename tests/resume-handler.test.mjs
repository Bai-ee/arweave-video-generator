// ue-resume.js -- createResumeHandler(), the "never autoplays" invariant, and
// the offer path: init() hands the stored record to the persistent player bar
// via window.uePlayerBar.prime() and draws NOTHING of its own.
//
// createResumeHandler needs no DOM: it returns a plain function representing
// "the user asked to resume", so a click is simulated simply by CALLING that
// returned function directly -- exactly the same shape a real
// `button.addEventListener('click', handler)` would invoke it with. This lets
// the invariant (nothing plays without that call happening first) be asserted
// deterministically.
//
// The offer tests DO need a window/document, but only a hand-rolled stand-in
// (there is no jsdom in this repo): the module reads `window`/`document` as
// plain globals at CALL time, and loadUeResume() runs it through
// vm.runInThisContext in this same realm, so seeding globalThis around an
// init() call is all it takes. The stand-in document records every
// createElement/appendChild, which is what pins down the owner's decision that
// this module must never again inject a floating bar of its own.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeResume } from './helpers/load-ue-resume.mjs';

const UEResume = loadUeResume();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const MIX_URL = 'https://arweave.net/' + TXID;

function makeSpyHost(findIndexResult) {
  const calls = { findIndexByTxid: [], playIndexAt: [] };
  return {
    calls,
    findIndexByTxid(txid) { calls.findIndexByTxid.push(txid); return findIndexResult; },
    playIndexAt(idx, sec) { calls.playIndexAt.push([idx, sec]); }
  };
}

describe('createResumeHandler -- never autoplays', () => {
  test('merely CREATING a handler calls nothing', () => {
    const host = makeSpyHost(3);
    let ensurePlayerCalls = 0;
    UEResume.createResumeHandler({
      ensurePlayer: (cb) => { ensurePlayerCalls++; cb(); },
      getHost: () => host,
      txid: TXID,
      startSec: 90
    });
    assert.equal(ensurePlayerCalls, 0);
    assert.equal(host.calls.findIndexByTxid.length, 0);
    assert.equal(host.calls.playIndexAt.length, 0);
  });

  test('invoking the handler (the simulated click) is what triggers ensurePlayer, synchronously', () => {
    const host = makeSpyHost(3);
    let ensurePlayerCalls = 0;
    const handler = UEResume.createResumeHandler({
      ensurePlayer: (cb) => { ensurePlayerCalls++; cb(); },
      getHost: () => host,
      txid: TXID,
      startSec: 90
    });
    assert.equal(ensurePlayerCalls, 0, 'sanity: not yet called before the simulated click');
    handler(); // the simulated click
    assert.equal(ensurePlayerCalls, 1, 'ensurePlayer must run synchronously inside the click');
    assert.deepEqual(host.calls.findIndexByTxid, [TXID]);
    assert.deepEqual(host.calls.playIndexAt, [[3, 90]]);
  });

  test('playback never starts if ensurePlayer never invokes its callback (e.g. hydration still pending)', () => {
    const host = makeSpyHost(3);
    const handler = UEResume.createResumeHandler({
      ensurePlayer: () => { /* deliberately never calls cb -- simulates a stuck/aborted hydration */ },
      getHost: () => host,
      txid: TXID,
      startSec: 90
    });
    handler();
    assert.equal(host.calls.findIndexByTxid.length, 0);
    assert.equal(host.calls.playIndexAt.length, 0);
  });

  test('does not call playIndexAt when the txid is not found in the live queue', () => {
    const host = makeSpyHost(-1); // not found
    const handler = UEResume.createResumeHandler({
      ensurePlayer: (cb) => cb(),
      getHost: () => host,
      txid: TXID,
      startSec: 90
    });
    handler();
    assert.deepEqual(host.calls.findIndexByTxid, [TXID]);
    assert.equal(host.calls.playIndexAt.length, 0, 'must never guess/fabricate an index');
  });

  test('a missing/malformed txid refuses to even call ensurePlayer', () => {
    let ensurePlayerCalls = 0;
    const host = makeSpyHost(0);
    const handler = UEResume.createResumeHandler({
      ensurePlayer: () => { ensurePlayerCalls++; },
      getHost: () => host,
      txid: 'not-a-real-txid',
      startSec: 10
    });
    handler();
    assert.equal(ensurePlayerCalls, 0);
    assert.equal(host.calls.findIndexByTxid.length, 0);
  });

  test('missing ensurePlayer/getHost dependencies degrade to a no-op, never throw', () => {
    const handler = UEResume.createResumeHandler({ txid: TXID, startSec: 10 });
    assert.doesNotThrow(() => handler());
  });

  test('a defensive/missing host from getHost() is a safe no-op', () => {
    const handler = UEResume.createResumeHandler({
      ensurePlayer: (cb) => cb(),
      getHost: () => null,
      txid: TXID,
      startSec: 10
    });
    assert.doesNotThrow(() => handler());
  });

  test('startSec <= 0 or non-finite is passed through as undefined (host.playIndexAt starts from the top)', () => {
    const host = makeSpyHost(2);
    const handler = UEResume.createResumeHandler({
      ensurePlayer: (cb) => cb(),
      getHost: () => host,
      txid: TXID,
      startSec: 0
    });
    handler();
    assert.deepEqual(host.calls.playIndexAt, [[2, undefined]]);
  });

  test('onDone fires once the handler runs, independent of whether the track was found', () => {
    const host = makeSpyHost(-1);
    let doneCalls = 0;
    const handler = UEResume.createResumeHandler({
      ensurePlayer: (cb) => cb(),
      getHost: () => host,
      txid: TXID,
      startSec: 10,
      onDone: () => { doneCalls++; }
    });
    handler();
    assert.equal(doneCalls, 1);
  });
});

/* ------------------------------------------------------------------------
   The offer path: window.uePlayerBar.prime(), and nothing else.
   ------------------------------------------------------------------------ */

const SAVED_POSITION = 754; // 12:34 -- checks the mm:ss label, not just 0:52

function makeStoredRecord(overrides) {
  return Object.assign({
    v: 1,
    txid: TXID,
    page: '/baiee.html',
    position: SAVED_POSITION,
    duration: 3600,
    title: 'Deep Cuts Vol. 3 (stored)',
    artist: 'baiee (stored)',
    ts: Date.now() - 1000
  }, overrides || {});
}

function makeStorage(record) {
  const map = new Map();
  if (record) map.set('ue-resume-v1', JSON.stringify(record));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); }
  };
}

function fakeAnchor(attrs) {
  return { getAttribute: (name) => (name in attrs ? attrs[name] : null) };
}

// The real mix anchor as the page generator emits it.
function mixAnchor(extra) {
  return fakeAnchor(Object.assign({
    'href': MIX_URL,
    'data-playlist': '',
    'data-title': 'Deep Cuts Vol. 3',
    'data-artist': 'baiee',
    'data-img': 'img/covers/deep-cuts-3.jpg',
    'data-duration-sec': '3600'
  }, extra || {}));
}

// Records anything the module tries to build. Nothing should ever land here.
function makeFakeDocument(anchors) {
  const created = [];
  const appended = [];
  const listeners = [];
  return {
    created,
    appended,
    listeners,
    readyState: 'complete',
    head: { appendChild: (node) => { appended.push(['head', node]); } },
    body: { appendChild: (node) => { appended.push(['body', node]); } },
    createElement: (tag) => { created.push(tag); return { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} }; },
    getElementById: () => null,
    querySelectorAll: (selector) => (/data-playlist|data-link/.test(selector) ? anchors.slice() : []),
    addEventListener: (type, cb) => { listeners.push([type, cb]); }
  };
}

function makeFakeHost() {
  return {
    on() {},
    getCurrentTrack() { return null; },
    getTxid() { return null; },
    getCurrentTime() { return 0; },
    getDuration() { return 0; },
    getState() { return { playing: false }; }
  };
}

const extractTxid = (url) => {
  const m = /\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/.exec(String(url || ''));
  return m ? m[1] : null;
};

// Runs UEResume.init() against a seeded window/document, then restores both.
//
// THE LOAD ORDER IS THE POINT. boot.js loads player-core.js EAGERLY and
// chains this module after it, but player.js -- and with it
// window.UEPlayer.host and window.uePlayerBar -- loads LAZILY (idle callback
// <=3.5s, or the first play-intent tap). So on a real page the bar does not
// exist when init() runs; it appears immediately before `ue-player-ready` is
// dispatched, along with the post-hydration rewrite of the featured anchor.
// Seeding the player up front is the convenient order, not the real one, and
// a harness that does it cannot fail even when the offer never survives to a
// browser. By default this therefore seeds a window WITHOUT the player, runs
// init(), and only then hydrates and fires the event. Pass
// { hydrateAtInit: true } for the other real case: a page where the player is
// already live by the time init() runs.
function runInit(opts) {
  const options = opts || {};
  const primeCalls = [];
  const storage = makeStorage('record' in options ? options.record : makeStoredRecord());
  const doc = makeFakeDocument(options.anchors || [mixAnchor()]);

  const win = {
    location: { pathname: '/baiee.html' },
    localStorage: storage
  };

  const bar = options.bar === null
    ? null
    : (options.bar || { prime: (spec) => { primeCalls.push(spec); return true; } });

  // What boot.js's player chain publishes, all at once, right before it
  // dispatches `ue-player-ready`.
  function hydratePlayer() {
    win.UEPlayerCore = { extractTxid };
    win.UEPlayer = { host: makeFakeHost() };
    if (bar) win.uePlayerBar = bar;
  }

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  globalThis.window = win;
  globalThis.document = doc;
  let primedDuringInit = 0;
  let readyListeners = 0;
  try {
    if (options.hydrateAtInit) hydratePlayer();
    UEResume.init();
    primedDuringInit = primeCalls.length;
    if (!options.hydrateAtInit) {
      hydratePlayer();
      const ready = doc.listeners.filter(([type]) => type === 'ue-player-ready');
      readyListeners = ready.length;
      ready.forEach(([, cb]) => cb());
    }
  } finally {
    if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
    if (prevDocument === undefined) delete globalThis.document; else globalThis.document = prevDocument;
  }
  return { primeCalls, primedDuringInit, readyListeners, storage, doc, win };
}

describe('the resume offer goes to the player bar, not to a bar of its own', () => {
  test('primes the player bar once, with the stored position and a formatTime label', () => {
    const { primeCalls } = runInit();
    assert.equal(primeCalls.length, 1, 'exactly one prime() call per page view');
    assert.deepEqual(primeCalls[0], {
      title: 'Deep Cuts Vol. 3',
      artist: 'baiee',
      img: 'img/covers/deep-cuts-3.jpg',
      href: MIX_URL,
      filename: 'baiee - Deep Cuts Vol. 3',
      startSec: SAVED_POSITION,
      label: 'resume ' + UEResume.formatTime(SAVED_POSITION),
      source: 'resume'
    });
    assert.equal(primeCalls[0].label, 'resume 12:34', 'label is built from the module\'s own formatTime');
    assert.equal(primeCalls[0].startSec, SAVED_POSITION, 'startSec IS the saved position');
  });

  test('creates NO element of its own -- no floating bar, no injected <style>', () => {
    const { doc } = runInit();
    assert.deepEqual(doc.created, [], 'ue-resume.js must never call document.createElement');
    assert.deepEqual(doc.appended, [], 'nothing may be appended to head or body');
  });

  test('falls back to the stored title/artist when the anchor carries none', () => {
    const { primeCalls } = runInit({
      anchors: [fakeAnchor({ 'href': MIX_URL, 'data-link': '' })]
    });
    assert.equal(primeCalls.length, 1);
    assert.equal(primeCalls[0].title, 'Deep Cuts Vol. 3 (stored)');
    assert.equal(primeCalls[0].artist, 'baiee (stored)');
    assert.equal(primeCalls[0].img, '');
  });

  test('no stored record -> no offer at all', () => {
    const { primeCalls, doc } = runInit({ record: null });
    assert.equal(primeCalls.length, 0);
    assert.deepEqual(doc.created, []);
  });

  test('stored track not on this page -> no offer, and the record is left in storage', () => {
    const otherTxid = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const { primeCalls, storage } = runInit({
      anchors: [mixAnchor({ href: 'https://arweave.net/' + otherTxid })]
    });
    assert.equal(primeCalls.length, 0, 'the bar can only queue what this page has');
    assert.ok(storage.getItem('ue-resume-v1'), 'a record for another page must survive');
  });

  // A real corruption shape, not a hypothetical: Arweave serves each mix from
  // a base32 sandbox subdomain, so ANY code that finds a txid by grepping an
  // href for a 43-character run can capture a slice of that subdomain instead
  // of the base64url txid in the path. TXID_RE accepts it -- both are 43 chars
  // from the same alphabet -- so it validates, stores, and reads back cleanly.
  // The identity check is what must catch it: extractTxid() only ever matches
  // a whole PATH SEGMENT, so the stored value matches no anchor and the offer
  // is declined. Priming the bar for the wrong track would be far worse than
  // not priming at all.
  test('a sandbox-subdomain txid for a track that IS on the page is declined, not guessed at', () => {
    const SANDBOX_HOST = 'c2ejenrz2h6n4tqm5ebgqb3xg7mvhsdhfr2f6kzqp5hkrxbgzuma';
    const sandboxHref = 'https://' + SANDBOX_HOST + '.arweave.net/' + TXID;
    const bogusTxid = SANDBOX_HOST.slice(0, 43); // what the naive 43-char grab yields

    assert.equal(bogusTxid.length, 43);
    assert.ok(UEResume.isValidTxid(bogusTxid), 'sanity: the corrupt value passes TXID_RE -- that is the trap');
    assert.equal(extractTxid(sandboxHref), TXID, 'sanity: the real extractor reads the path segment, not the host');

    const { primeCalls, storage } = runInit({
      record: makeStoredRecord({ txid: bogusTxid }),
      anchors: [mixAnchor({ href: sandboxHref })]
    });
    assert.equal(primeCalls.length, 0, 'a txid that matches no anchor must never be offered');
    assert.ok(storage.getItem('ue-resume-v1'), 'and the record is left alone, not silently rewritten');
  });

  test('an unplayable/non-http anchor is not offered (it is not in the player queue either)', () => {
    const unplayable = runInit({ anchors: [mixAnchor({ 'data-unplayable': 'true' })] });
    assert.equal(unplayable.primeCalls.length, 0);
    const relative = runInit({ anchors: [mixAnchor({ href: '/mixes/' + TXID })] });
    assert.equal(relative.primeCalls.length, 0);
  });

  test('a missing window.uePlayerBar is a quiet no-op, never a throw', () => {
    assert.doesNotThrow(() => runInit({ bar: null }));
    const { doc } = runInit({ bar: null });
    assert.deepEqual(doc.created, [], 'and still nothing drawn as a consolation prize');
  });

  test('a bar without prime(), a declined prime(), and a throwing prime() are all single, quiet no-ops', () => {
    assert.doesNotThrow(() => runInit({ bar: { } }));

    let declined = 0;
    assert.doesNotThrow(() => runInit({ bar: { prime: () => { declined++; return false; } } }));
    assert.equal(declined, 1, 'a declined offer is never retried in a loop');

    let threw = 0;
    assert.doesNotThrow(() => runInit({ bar: { prime: () => { threw++; throw new Error('broken bar'); } } }));
    assert.equal(threw, 1);
  });

  // The whole offer -- decision included -- waits on `ue-player-ready`. The
  // bar does not exist before it, and neither does the final markup:
  // player.js's randomizeFeatured() rewrites the featured anchor's href and
  // data-title/artist/img as it hydrates, so a scan taken any earlier can
  // describe a track the live queue does not hold.
  test('decides nothing at init, then primes exactly once on ue-player-ready', () => {
    const { primeCalls, primedDuringInit, readyListeners, doc } = runInit();

    assert.equal(primedDuringInit, 0, 'nothing can be primed before the player chain exists');
    assert.equal(readyListeners, 1, 'must wait on the one existing ready hook -- not poll, not give up');
    assert.equal(primeCalls.length, 1, 'the offer survives the wait and is made exactly once');
    assert.equal(primeCalls[0].startSec, SAVED_POSITION);
    assert.equal(primeCalls[0].label, 'resume 12:34');
    assert.deepEqual(doc.created, []);
  });

  test('a page where the player is already live at init primes immediately, still exactly once', () => {
    const { primeCalls, primedDuringInit } = runInit({ hydrateAtInit: true });
    assert.equal(primedDuringInit, 1, 'whenPlayerReady fires synchronously when the host is already there');
    assert.equal(primeCalls.length, 1, 'and never a second time from the event as well');
    assert.equal(primeCalls[0].startSec, SAVED_POSITION);
  });

  test('position saving is still wired even when the offer finds nothing to offer', () => {
    // A record for another page bails out of the offer path; the host events
    // that persist NEW positions must still be subscribed after that.
    const onCalls = [];
    const host = makeFakeHost();
    host.on = (evt) => { onCalls.push(evt); };

    const storage = makeStorage(null);
    const doc = makeFakeDocument([mixAnchor()]);
    const win = { location: { pathname: '/baiee.html' }, localStorage: storage };

    const prevWindow = globalThis.window;
    const prevDocument = globalThis.document;
    globalThis.window = win;
    globalThis.document = doc;
    try {
      UEResume.init();
      win.UEPlayerCore = { extractTxid };
      win.UEPlayer = { host };
      doc.listeners.filter(([type]) => type === 'ue-player-ready').forEach(([, cb]) => cb());
    } finally {
      if (prevWindow === undefined) delete globalThis.window; else globalThis.window = prevWindow;
      if (prevDocument === undefined) delete globalThis.document; else globalThis.document = prevDocument;
    }

    assert.deepEqual(onCalls.sort(), ['playback', 'time', 'track'], 'the write policy stays subscribed');
  });
});
