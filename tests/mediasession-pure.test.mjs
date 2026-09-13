// Pure decision-logic tests for website/js/ue-mediasession.js: metadata
// mapping, playbackState mapping, position-state validity guards, the
// throttle predicate, action-handler routing/clamping, and feature-detected
// registration. None of this touches navigator/document/window — every
// function under test takes plain objects and returns plain objects, per
// the integration contract's testability rule. See mediasession-wiring.test.mjs
// for the thin DOM/browser wiring layer (init(), whenPlayerReady(), the
// live host.on()/navigator.mediaSession integration).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeMediaSession } from './helpers/load-ue-mediasession.mjs';

// Loaded once with no env at all -- navigator/document/MediaMetadata all
// absent, `window` a throwaway {} -- exactly the "node:vm, no browser
// globals" case the integration contract requires every module to survive.
// Since init() no-ops the instant it can't find navigator.mediaSession,
// this is also the correct way to load the module for testing its PURE
// exports in isolation: nothing here wires any live subscription.
const { exports: UEMediaSession, restore } = loadUeMediaSession();
restore();

const {
  DEFAULT_ALBUM,
  FALLBACK_ARTWORK_SRC,
  DEFAULT_SEEK_OFFSET_SEC,
  POSITION_UPDATE_MIN_INTERVAL_MS,
  buildMetadataInit,
  resolvePlaybackState,
  resolvePositionState,
  shouldEmitPosition,
  buildActionHandlers,
  registerHandlers
} = UEMediaSession;

function createFakeHost() {
  const calls = { play: 0, pause: 0, prev: 0, next: 0, seek: [], seekBy: [] };
  return {
    calls,
    play() { calls.play++; },
    pause() { calls.pause++; },
    prev() { calls.prev++; },
    next() { calls.next++; },
    seek(t) { calls.seek.push(t); },
    seekBy(d) { calls.seekBy.push(d); },
    getDuration() { return 100; }
  };
}

describe('module surface', () => {
  test('exports the documented constants and pure functions', () => {
    assert.equal(DEFAULT_ALBUM, 'Underground Existence');
    assert.equal(FALLBACK_ARTWORK_SRC, 'img/square-ue.png');
    assert.equal(DEFAULT_SEEK_OFFSET_SEC, 10);
    assert.equal(POSITION_UPDATE_MIN_INTERVAL_MS, 1000);
    assert.equal(typeof buildMetadataInit, 'function');
    assert.equal(typeof resolvePlaybackState, 'function');
    assert.equal(typeof resolvePositionState, 'function');
    assert.equal(typeof shouldEmitPosition, 'function');
    assert.equal(typeof buildActionHandlers, 'function');
    assert.equal(typeof registerHandlers, 'function');
  });
});

describe('buildMetadataInit()', () => {
  test('maps title/artist and the fixed album from a normal track', () => {
    const init = buildMetadataInit({ title: 'Deep Cuts', artist: 'Acidman', img: 'img/mixes/deep-cuts.jpg' });
    assert.equal(init.title, 'Deep Cuts');
    assert.equal(init.artist, 'Acidman');
    assert.equal(init.album, 'Underground Existence');
  });

  test('missing artist maps to an empty string, not undefined/null', () => {
    const init = buildMetadataInit({ title: 'Untitled Mix', img: '' });
    assert.equal(init.artist, '');
  });

  test('missing title maps to an empty string', () => {
    const init = buildMetadataInit({ artist: 'Someone', img: '' });
    assert.equal(init.title, '');
  });

  test('falls back to the site cover when track.img is empty', () => {
    const init = buildMetadataInit({ title: 'T', artist: 'A', img: '' });
    assert.ok(init.artwork.length > 0);
    for (const entry of init.artwork) assert.equal(entry.src, FALLBACK_ARTWORK_SRC);
  });

  test('falls back to the site cover when track.img is missing entirely', () => {
    const init = buildMetadataInit({ title: 'T', artist: 'A' });
    assert.equal(init.artwork[0].src, FALLBACK_ARTWORK_SRC);
  });

  test('falls back to the site cover when track.img is whitespace-only', () => {
    const init = buildMetadataInit({ title: 'T', artist: 'A', img: '   ' });
    assert.equal(init.artwork[0].src, FALLBACK_ARTWORK_SRC);
  });

  test('uses a real relative track.img verbatim (no rewriting/absolute-ifying)', () => {
    const init = buildMetadataInit({ title: 'T', artist: 'A', img: 'img/mixes/foo.png' });
    for (const entry of init.artwork) assert.equal(entry.src, 'img/mixes/foo.png');
  });

  test('provides a small artwork sizes array, each entry sharing the one resolved src', () => {
    const init = buildMetadataInit({ title: 'T', artist: 'A', img: 'img/mixes/foo.jpg' });
    assert.ok(Array.isArray(init.artwork));
    assert.ok(init.artwork.length >= 1 && init.artwork.length <= 6, 'should be a SMALL array');
    const sizesSeen = init.artwork.map((e) => e.sizes);
    assert.equal(new Set(sizesSeen).size, sizesSeen.length, 'sizes entries should be distinct');
  });

  test('guesses a MIME type for known image extensions', () => {
    assert.equal(buildMetadataInit({ img: 'a.jpg' }).artwork[0].type, 'image/jpeg');
    assert.equal(buildMetadataInit({ img: 'a.jpeg' }).artwork[0].type, 'image/jpeg');
    assert.equal(buildMetadataInit({ img: 'a.png' }).artwork[0].type, 'image/png');
    assert.equal(buildMetadataInit({ img: 'a.webp' }).artwork[0].type, 'image/webp');
    assert.equal(buildMetadataInit({ img: 'a.svg' }).artwork[0].type, 'image/svg+xml');
  });

  test('omits the type field for an unrecognized extension rather than guessing wrong', () => {
    const init = buildMetadataInit({ img: 'a.bin' });
    assert.equal('type' in init.artwork[0], false);
  });

  test('never throws on a null/undefined track', () => {
    assert.doesNotThrow(() => buildMetadataInit(null));
    assert.doesNotThrow(() => buildMetadataInit(undefined));
    const init = buildMetadataInit(undefined);
    assert.equal(init.title, '');
    assert.equal(init.artist, '');
    assert.equal(init.artwork[0].src, FALLBACK_ARTWORK_SRC);
  });
});

describe('resolvePlaybackState()', () => {
  test('"playback" + playing:true -> "playing"', () => {
    assert.equal(resolvePlaybackState('playback', { playing: true }), 'playing');
  });
  test('"playback" + playing:false -> "paused"', () => {
    assert.equal(resolvePlaybackState('playback', { playing: false }), 'paused');
  });
  test('"playback" with no payload -> "paused" (falsy playing)', () => {
    assert.equal(resolvePlaybackState('playback', null), 'paused');
  });
  test('"track" always maps to "paused" regardless of payload (never "none" -- that blanks the OS surface mid-transition)', () => {
    assert.equal(resolvePlaybackState('track', { index: 3 }), 'paused');
    assert.equal(resolvePlaybackState('track', null), 'paused');
  });
  test('an unrecognized event kind maps to null (no state change)', () => {
    assert.equal(resolvePlaybackState('time', { currentTime: 5 }), null);
    assert.equal(resolvePlaybackState('bogus', {}), null);
  });
});

describe('resolvePositionState()', () => {
  test('a normal duration/position pair resolves with playbackRate defaulted to 1', () => {
    const state = resolvePositionState({ duration: 300, position: 42 });
    assert.deepEqual(state, { duration: 300, position: 42, playbackRate: 1 });
  });

  test('duration 0 is rejected', () => {
    assert.equal(resolvePositionState({ duration: 0, position: 0 }), null);
  });

  test('NaN duration is rejected', () => {
    assert.equal(resolvePositionState({ duration: NaN, position: 5 }), null);
  });

  test('Infinity duration is rejected', () => {
    assert.equal(resolvePositionState({ duration: Infinity, position: 5 }), null);
  });

  test('position greater than duration is rejected', () => {
    assert.equal(resolvePositionState({ duration: 100, position: 100.5 }), null);
  });

  test('negative position is rejected', () => {
    assert.equal(resolvePositionState({ duration: 100, position: -1 }), null);
  });

  test('NaN position is rejected', () => {
    assert.equal(resolvePositionState({ duration: 100, position: NaN }), null);
  });

  test('position exactly equal to duration is accepted (boundary)', () => {
    const state = resolvePositionState({ duration: 100, position: 100 });
    assert.ok(state);
    assert.equal(state.position, 100);
  });

  test('an invalid playbackRate falls back to 1; a valid one is preserved', () => {
    assert.equal(resolvePositionState({ duration: 10, position: 1, playbackRate: 0 }).playbackRate, 1);
    assert.equal(resolvePositionState({ duration: 10, position: 1, playbackRate: -2 }).playbackRate, 1);
    assert.equal(resolvePositionState({ duration: 10, position: 1, playbackRate: NaN }).playbackRate, 1);
    assert.equal(resolvePositionState({ duration: 10, position: 1, playbackRate: 1.5 }).playbackRate, 1.5);
  });

  test('a missing/null payload is rejected, not thrown', () => {
    assert.equal(resolvePositionState(null), null);
    assert.equal(resolvePositionState(undefined), null);
    assert.equal(resolvePositionState({}), null);
  });
});

describe('shouldEmitPosition() (the ~1/sec throttle)', () => {
  test('always allows the first emit (no prior timestamp)', () => {
    assert.equal(shouldEmitPosition(null, 5000), true);
  });
  test('rejects an update inside the minimum interval', () => {
    assert.equal(shouldEmitPosition(1000, 1000 + POSITION_UPDATE_MIN_INTERVAL_MS - 1), false);
  });
  test('allows an update once the minimum interval has elapsed', () => {
    assert.equal(shouldEmitPosition(1000, 1000 + POSITION_UPDATE_MIN_INTERVAL_MS), true);
  });
});

describe('buildActionHandlers() routing + clamping', () => {
  test('play/pause/previoustrack/nexttrack route to exactly the matching host method', () => {
    const host = createFakeHost();
    const handlers = buildActionHandlers(host);
    handlers.play();
    handlers.pause();
    handlers.previoustrack();
    handlers.nexttrack();
    assert.deepEqual(host.calls, { play: 1, pause: 1, prev: 1, next: 1, seek: [], seekBy: [] });
  });

  test('seekbackward defaults to -10s with no details', () => {
    const host = createFakeHost();
    buildActionHandlers(host).seekbackward(undefined);
    assert.deepEqual(host.calls.seekBy, [-10]);
  });

  test('seekbackward honours details.seekOffset', () => {
    const host = createFakeHost();
    buildActionHandlers(host).seekbackward({ seekOffset: 30 });
    assert.deepEqual(host.calls.seekBy, [-30]);
  });

  test('seekforward defaults to +10s and honours details.seekOffset', () => {
    const host = createFakeHost();
    const handlers = buildActionHandlers(host);
    handlers.seekforward(undefined);
    handlers.seekforward({ seekOffset: 5 });
    assert.deepEqual(host.calls.seekBy, [10, 5]);
  });

  test('an invalid seekOffset (NaN/negative/zero) falls back to the 10s default', () => {
    const host = createFakeHost();
    const handlers = buildActionHandlers(host);
    handlers.seekbackward({ seekOffset: NaN });
    handlers.seekbackward({ seekOffset: -5 });
    handlers.seekbackward({ seekOffset: 0 });
    assert.deepEqual(host.calls.seekBy, [-10, -10, -10]);
  });

  test('seekto passes details.seekTime through to host.seek when in range', () => {
    const host = createFakeHost(); // getDuration() -> 100
    buildActionHandlers(host).seekto({ seekTime: 42 });
    assert.deepEqual(host.calls.seek, [42]);
  });

  test('seekto clamps a negative seekTime to 0', () => {
    const host = createFakeHost();
    buildActionHandlers(host).seekto({ seekTime: -5 });
    assert.deepEqual(host.calls.seek, [0]);
  });

  test('seekto clamps a NaN seekTime to 0', () => {
    const host = createFakeHost();
    buildActionHandlers(host).seekto({ seekTime: NaN });
    assert.deepEqual(host.calls.seek, [0]);
  });

  test('seekto clamps a seekTime beyond the known duration', () => {
    const host = createFakeHost(); // getDuration() -> 100
    buildActionHandlers(host).seekto({ seekTime: 9999 });
    assert.deepEqual(host.calls.seek, [100]);
  });

  test('seekto with missing details still clamps to 0, never throws', () => {
    const host = createFakeHost();
    assert.doesNotThrow(() => buildActionHandlers(host).seekto(undefined));
    assert.deepEqual(host.calls.seek, [0]);
  });

  test('seekto only clamps the negative/NaN floor when host.getDuration is unavailable', () => {
    const host = createFakeHost();
    delete host.getDuration;
    buildActionHandlers(host).seekto({ seekTime: 500000 });
    assert.deepEqual(host.calls.seek, [500000], 'no known upper bound to clamp against');
  });

  test('seekto is defensive if host.getDuration itself throws', () => {
    const host = createFakeHost();
    host.getDuration = () => { throw new Error('boom'); };
    assert.doesNotThrow(() => buildActionHandlers(host).seekto({ seekTime: 40 }));
    assert.deepEqual(host.calls.seek, [40]);
  });

  test('a throwing host method never propagates out of the handler', () => {
    const host = createFakeHost();
    host.play = () => { throw new Error('boom'); };
    assert.doesNotThrow(() => buildActionHandlers(host).play());
  });

  test('a host missing a given method is a silent no-op, not a throw', () => {
    const host = {}; // no methods at all
    const handlers = buildActionHandlers(host);
    for (const action of Object.keys(handlers)) {
      assert.doesNotThrow(() => handlers[action]({}));
    }
  });

  test('never autoplays: no action other than "play" ever calls host.play', () => {
    const host = createFakeHost();
    const handlers = buildActionHandlers(host);
    for (const action of Object.keys(handlers)) {
      if (action === 'play') continue;
      handlers[action]({ seekOffset: 10, seekTime: 10 });
    }
    assert.equal(host.calls.play, 0, 'pause/prev/next/seek* must never start playback');
  });
});

describe('registerHandlers()', () => {
  function fakeMediaSession(failingActions) {
    const fail = new Set(failingActions || []);
    const registered = {};
    return {
      registered,
      setActionHandler(action, fn) {
        if (fail.has(action)) {
          const err = new Error('setActionHandler is not supported');
          err.name = 'NotSupportedError';
          throw err;
        }
        registered[action] = fn;
      }
    };
  }

  test('registers every handler when setActionHandler always succeeds', () => {
    const ms = fakeMediaSession();
    const handlers = { play: () => {}, pause: () => {} };
    const result = registerHandlers(ms, handlers);
    assert.deepEqual(result.registered.sort(), ['pause', 'play']);
    assert.deepEqual(result.failed, []);
    assert.equal(ms.registered.play, handlers.play);
  });

  test('one unsupported action fails without preventing the others from registering', () => {
    const ms = fakeMediaSession(['seekto']);
    const handlers = { play: () => {}, pause: () => {}, seekto: () => {} };
    const result = registerHandlers(ms, handlers);
    assert.deepEqual(result.failed, ['seekto']);
    assert.deepEqual(result.registered.sort(), ['pause', 'play']);
    assert.equal('seekto' in ms.registered, false);
  });

  test('a mediaSession-like object with no setActionHandler fails every action, never throws', () => {
    const handlers = { play: () => {}, pause: () => {} };
    assert.doesNotThrow(() => {
      const result = registerHandlers({}, handlers);
      assert.deepEqual(result.registered, []);
      assert.deepEqual(result.failed.sort(), ['pause', 'play']);
    });
  });

  test('a null/undefined mediaSessionLike is handled without throwing', () => {
    assert.doesNotThrow(() => registerHandlers(null, { play: () => {} }));
    assert.doesNotThrow(() => registerHandlers(undefined, { play: () => {} }));
  });

  test('empty/missing handlers map registers nothing and fails nothing', () => {
    const ms = fakeMediaSession();
    assert.deepEqual(registerHandlers(ms, {}), { registered: [], failed: [] });
    assert.deepEqual(registerHandlers(ms, undefined), { registered: [], failed: [] });
  });
});
