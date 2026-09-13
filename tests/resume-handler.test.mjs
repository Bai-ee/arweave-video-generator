// ue-resume.js -- createResumeHandler() and the "never autoplays" invariant.
// No DOM/jsdom involved: createResumeHandler returns a plain function
// representing "the user clicked Resume", so a click is simulated simply by
// CALLING that returned function directly -- exactly the same shape a real
// `button.addEventListener('click', handler)` would invoke it with. This
// lets the invariant (nothing plays without that call happening first) be
// asserted deterministically.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeResume } from './helpers/load-ue-resume.mjs';

const UEResume = loadUeResume();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';

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
