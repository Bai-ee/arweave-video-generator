// Integration tests for the thin DOM/browser wiring layer at the bottom of
// website/js/ue-mediasession.js: init()'s self-run at load time, the
// whenPlayerReady()-gated subscription to window.UEPlayer.host's 'track' /
// 'playback' / 'time' events, and feature detection of
// navigator.mediaSession itself. See mediasession-pure.test.mjs for the
// pure decision-logic functions these all delegate to.
//
// ue-mediasession.js self-initializes at load time (its IIFE calls init()
// unconditionally, matching how boot.js inserts it as a bare <script> with
// no callback -- see that file's header comment). loadUeMediaSession()
// therefore installs the fakes as REAL globals before the module runs, and
// does NOT restore them until the test explicitly asks (`t.after(restore)`)
// -- some of the callbacks captured during init() (a stored
// document.addEventListener('ue-player-ready', ...) listener, a stored
// host.on() callback) are invoked LATER, from the test body, and must still
// see the same fake globals that were live when init() ran.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeMediaSession } from './helpers/load-ue-mediasession.mjs';

function createFakeHost(overrides) {
  overrides = overrides || {};
  const listeners = { track: [], playback: [], time: [] };
  const calls = { play: 0, pause: 0, prev: 0, next: 0, seek: [], seekBy: [] };
  const host = {
    calls,
    on(kind, cb) {
      if (!listeners[kind]) listeners[kind] = [];
      listeners[kind].push(cb);
      return () => {};
    },
    play() { calls.play++; },
    pause() { calls.pause++; },
    prev() { calls.prev++; },
    next() { calls.next++; },
    seek(t) { calls.seek.push(t); },
    seekBy(d) { calls.seekBy.push(d); },
    getDuration() { return 300; },
    getCurrentTrack: overrides.getCurrentTrack || (() => null),
    getState: overrides.getState || (() => ({ index: -1, playing: false, shuffle: false, repeat: 'off' }))
  };
  host.__emit = (kind, payload) => { (listeners[kind] || []).forEach((cb) => cb(payload)); };
  host.__subscriberCounts = () => ({
    track: listeners.track.length,
    playback: listeners.playback.length,
    time: listeners.time.length
  });
  return host;
}

function createFakeMediaSession(failingActions) {
  const fail = new Set(failingActions || []);
  const handlers = {};
  const positionCalls = [];
  const ms = {
    metadata: null,
    playbackState: 'none',
    setActionHandler(action, fn) {
      if (fail.has(action)) {
        const err = new Error('setActionHandler is not supported');
        err.name = 'NotSupportedError';
        throw err;
      }
      handlers[action] = fn;
    },
    setPositionState(state) { positionCalls.push(state); }
  };
  ms.__handlers = handlers;
  ms.__positionCalls = positionCalls;
  return ms;
}

function FakeMediaMetadata(init) {
  Object.assign(this, init);
}

function createFakeDocument() {
  const listeners = {};
  return {
    addEventListener(type, cb) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(cb);
    },
    __dispatch(type) {
      (listeners[type] || []).forEach((cb) => cb());
    }
  };
}

describe('feature detection: navigator.mediaSession absent', () => {
  test('no env at all (no navigator/document/MediaMetadata): loads without throwing, exports stay intact', () => {
    const { exports: UEMediaSession, restore } = loadUeMediaSession();
    try {
      assert.equal(typeof UEMediaSession.buildMetadataInit, 'function');
      assert.equal(typeof UEMediaSession.registerHandlers, 'function');
    } finally {
      restore();
    }
  });

  test('navigator exists but has no .mediaSession: module is inert (nothing registered, nothing thrown)', () => {
    const host = createFakeHost();
    const { restore } = loadUeMediaSession({
      window: { UEPlayer: { host } },
      navigator: { userAgent: 'test' } // no mediaSession
    });
    try {
      // inert: the host bridge was never subscribed to
      assert.deepEqual(host.__subscriberCounts(), { track: 0, playback: 0, time: 0 });
    } finally {
      restore();
    }
  });

  test('navigator.mediaSession present but setActionHandler/setPositionState absent: still does not throw', () => {
    const host = createFakeHost();
    assert.doesNotThrow(() => {
      const { restore } = loadUeMediaSession({
        window: { UEPlayer: { host } },
        navigator: { mediaSession: {} } // no methods at all
      });
      restore();
    });
  });
});

describe('host already ready at load time', () => {
  function setup(failingActions) {
    const host = createFakeHost();
    const mediaSession = createFakeMediaSession(failingActions);
    const loaded = loadUeMediaSession({
      window: { UEPlayer: { host } },
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    return { host, mediaSession, restore: loaded.restore };
  }

  test('registers all seven action handlers on navigator.mediaSession', (t) => {
    const { mediaSession, restore } = setup();
    t.after(restore);
    assert.deepEqual(
      Object.keys(mediaSession.__handlers).sort(),
      ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto']
    );
  });

  test('one unsupported action (seekto) fails registration without blocking the rest', (t) => {
    const { mediaSession, restore } = setup(['seekto']);
    t.after(restore);
    assert.equal('seekto' in mediaSession.__handlers, false);
    assert.equal(typeof mediaSession.__handlers.play, 'function');
    assert.equal(typeof mediaSession.__handlers.nexttrack, 'function');
  });

  test('a registered action handler routes through the host exactly like the pure unit test predicts', (t) => {
    const { host, mediaSession, restore } = setup();
    t.after(restore);
    mediaSession.__handlers.play();
    mediaSession.__handlers.seekbackward({});
    mediaSession.__handlers.seekto({ seekTime: 9999 }); // clamps to host.getDuration() == 300
    assert.equal(host.calls.play, 1);
    assert.deepEqual(host.calls.seekBy, [-10]);
    assert.deepEqual(host.calls.seek, [300]);
  });

  test('a "track" event sets metadata from the new track and sets playbackState to "paused" (never "none")', (t) => {
    const { host, mediaSession, restore } = setup();
    t.after(restore);
    mediaSession.playbackState = 'playing'; // simulate leftover state from the outgoing track
    host.__emit('track', { index: 0, track: { title: 'Deep Cuts', artist: 'Acidman', img: '' }, txid: 'x' });
    assert.ok(mediaSession.metadata instanceof FakeMediaMetadata);
    assert.equal(mediaSession.metadata.title, 'Deep Cuts');
    assert.equal(mediaSession.metadata.artist, 'Acidman');
    assert.equal(mediaSession.metadata.album, 'Underground Existence');
    // "paused", not "none" -- 'none' would blank the lock-screen/notification
    // surface entirely for the several seconds a cold gateway can take
    // between load() and genuine first audio (see resolvePlaybackState's
    // header comment in ue-mediasession.js).
    assert.equal(mediaSession.playbackState, 'paused');
  });

  test('a "playback" event flips playbackState between "playing" and "paused"', (t) => {
    const { host, mediaSession, restore } = setup();
    t.after(restore);
    host.__emit('playback', { playing: true, index: 0, track: {} });
    assert.equal(mediaSession.playbackState, 'playing');
    host.__emit('playback', { playing: false, index: 0, track: {} });
    assert.equal(mediaSession.playbackState, 'paused');
  });

  test('a "time" event calls setPositionState once with a valid, in-range payload', (t) => {
    const { host, mediaSession, restore } = setup();
    t.after(restore);
    host.__emit('time', { index: 0, currentTime: 12, duration: 300 });
    assert.equal(mediaSession.__positionCalls.length, 1);
    assert.deepEqual(mediaSession.__positionCalls[0], { duration: 300, position: 12, playbackRate: 1 });
  });

  test('a "time" event is throttled: a second one immediately after is dropped (~1/sec rule)', (t) => {
    const { host, mediaSession, restore } = setup();
    t.after(restore);
    host.__emit('time', { index: 0, currentTime: 1, duration: 300 });
    host.__emit('time', { index: 0, currentTime: 2, duration: 300 }); // same tick -- well under 1s later
    assert.equal(mediaSession.__positionCalls.length, 1, 'the second call must be throttled away');
  });

  test('a "time" event with an incoherent payload (duration 0) is dropped, never reaches setPositionState', (t) => {
    const { host, mediaSession, restore } = setup();
    t.after(restore);
    host.__emit('time', { index: 0, currentTime: 0, duration: 0 });
    assert.equal(mediaSession.__positionCalls.length, 0);
  });

  test('never autoplays: track/playback/time events never call host.play', (t) => {
    const { host, restore } = setup();
    t.after(restore);
    host.__emit('track', { index: 0, track: { title: 'T', artist: 'A', img: '' }, txid: 'x' });
    host.__emit('playback', { playing: false, index: 0, track: {} });
    host.__emit('time', { index: 0, currentTime: 5, duration: 300 });
    host.__emit('track', { index: 1, track: { title: 'T2', artist: 'A2', img: '' }, txid: 'y' });
    assert.equal(host.calls.play, 0, 'metadata/position/state updates must never start playback themselves');
  });
});

describe('a track is already active when this module attaches', () => {
  // boot.js injects ue-mediasession.js from player.js's OWN onload (after
  // window.UEPlayer.host already exists) and dispatches `ue-player-ready`
  // before this file has even been fetched. A feature module's user-gesture
  // host.playIndexAt() (deep link / Resume / first tap) can therefore fire
  // the very first 'track' event before this module has attached any
  // listener -- player.js's event bus never replays a missed event to a
  // late subscriber. Without an initial push, the lock-screen/notification
  // surface would show no metadata at all until the NEXT track change.

  test('metadata + playbackState are pushed immediately from host.getCurrentTrack()/getState(), before any "track" event fires', (t) => {
    const host = createFakeHost({
      getCurrentTrack: () => ({ title: 'Already Playing', artist: 'Someone', img: '' }),
      getState: () => ({ index: 0, playing: true, shuffle: false, repeat: 'off' })
    });
    const mediaSession = createFakeMediaSession();
    const { restore } = loadUeMediaSession({
      window: { UEPlayer: { host } },
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    t.after(restore);

    assert.ok(mediaSession.metadata instanceof FakeMediaMetadata);
    assert.equal(mediaSession.metadata.title, 'Already Playing');
    assert.equal(mediaSession.playbackState, 'playing');
  });

  test('playbackState reflects a paused-but-loaded initial track as "paused", not "playing"', (t) => {
    const host = createFakeHost({
      getCurrentTrack: () => ({ title: 'Loaded, Not Yet Playing', artist: 'X', img: '' }),
      getState: () => ({ index: 0, playing: false, shuffle: false, repeat: 'off' })
    });
    const mediaSession = createFakeMediaSession();
    const { restore } = loadUeMediaSession({
      window: { UEPlayer: { host } },
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    t.after(restore);

    assert.equal(mediaSession.playbackState, 'paused');
  });

  test('no track active yet (getCurrentTrack -> null): no metadata/playbackState pushed, no throw', (t) => {
    const host = createFakeHost(); // default getCurrentTrack -> null
    const mediaSession = createFakeMediaSession();
    const { restore } = loadUeMediaSession({
      window: { UEPlayer: { host } },
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    t.after(restore);

    assert.equal(mediaSession.metadata, null);
    assert.equal(mediaSession.playbackState, 'none'); // untouched fake default -- never written
  });

  test('a host without getCurrentTrack/getState at all (older/partial fake) degrades safely, never throws', (t) => {
    const host = createFakeHost();
    delete host.getCurrentTrack;
    delete host.getState;
    const mediaSession = createFakeMediaSession();
    assert.doesNotThrow(() => {
      const { restore } = loadUeMediaSession({
        window: { UEPlayer: { host } },
        navigator: { mediaSession },
        MediaMetadata: FakeMediaMetadata
      });
      restore();
    });
  });

  test('a throwing getCurrentTrack/getState degrades safely, never throws, never blocks handler registration', (t) => {
    const host = createFakeHost({
      getCurrentTrack: () => { throw new Error('boom'); },
      getState: () => { throw new Error('boom'); }
    });
    const mediaSession = createFakeMediaSession();
    let restore;
    assert.doesNotThrow(() => {
      const loaded = loadUeMediaSession({
        window: { UEPlayer: { host } },
        navigator: { mediaSession },
        MediaMetadata: FakeMediaMetadata
      });
      restore = loaded.restore;
    });
    t.after(restore);
    assert.equal(mediaSession.metadata, null);
    assert.deepEqual(
      Object.keys(mediaSession.__handlers).sort(),
      ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto']
    );
  });

  test('never autoplays: pushing initial metadata/state never calls host.play', (t) => {
    const host = createFakeHost({
      getCurrentTrack: () => ({ title: 'T', artist: 'A', img: '' }),
      getState: () => ({ index: 0, playing: true, shuffle: false, repeat: 'off' })
    });
    const mediaSession = createFakeMediaSession();
    const { restore } = loadUeMediaSession({
      window: { UEPlayer: { host } },
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    t.after(restore);
    assert.equal(host.calls.play, 0);
  });

  test('deferred path (host not ready at load time): the initial push also fires once the host becomes available', (t) => {
    const windowObj = {};
    const fakeDocument = createFakeDocument();
    const mediaSession = createFakeMediaSession();
    const { restore } = loadUeMediaSession({
      window: windowObj,
      document: fakeDocument,
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    t.after(restore);

    const host = createFakeHost({
      getCurrentTrack: () => ({ title: 'Deferred Track', artist: 'A', img: '' }),
      getState: () => ({ index: 0, playing: true, shuffle: false, repeat: 'off' })
    });
    windowObj.UEPlayer = { host };
    fakeDocument.__dispatch('ue-player-ready');

    assert.ok(mediaSession.metadata instanceof FakeMediaMetadata);
    assert.equal(mediaSession.metadata.title, 'Deferred Track');
    assert.equal(mediaSession.playbackState, 'playing');
  });
});

describe('host not ready at load time (defensive whenPlayerReady wait)', () => {
  test('waits for the ue-player-ready document event before subscribing or registering anything', (t) => {
    const windowObj = {}; // no UEPlayer yet -- mirrors a hypothetical load-before-player.js ordering
    const fakeDocument = createFakeDocument();
    const mediaSession = createFakeMediaSession();
    const { restore } = loadUeMediaSession({
      window: windowObj,
      document: fakeDocument,
      navigator: { mediaSession },
      MediaMetadata: FakeMediaMetadata
    });
    t.after(restore);

    // nothing wired yet -- the host bridge does not exist
    assert.deepEqual(mediaSession.__handlers, {});

    // simulate player.js hydrating, then boot.js dispatching ue-player-ready
    const host = createFakeHost();
    windowObj.UEPlayer = { host };
    fakeDocument.__dispatch('ue-player-ready');

    assert.deepEqual(
      Object.keys(mediaSession.__handlers).sort(),
      ['nexttrack', 'pause', 'play', 'previoustrack', 'seekbackward', 'seekforward', 'seekto']
    );
    assert.deepEqual(host.__subscriberCounts(), { track: 1, playback: 1, time: 1 });

    // and the wired-up bridge behaves exactly as the "already ready" case
    host.__emit('playback', { playing: true, index: 0, track: {} });
    assert.equal(mediaSession.playbackState, 'playing');
    assert.equal(host.calls.play, 0, 'still no autoplay from the deferred path');
  });
});
