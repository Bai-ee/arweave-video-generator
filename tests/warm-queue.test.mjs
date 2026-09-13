// createWarmQueue behaviour -- executable spec written BEFORE
// website/js/ue-warm.js exists (see tests/warm-policy.test.mjs's header for
// the project context; both files are the required first action).
//
// The contract (WARMING-CONTRACT.md) names createWarmQueue's shape --
// `createWarmQueue({ concurrency, spacingMs, jitterMs, now, request, random
// }) -> { enqueue(txid, urls, {priority}), prioritize(txid), stats(),
// abortAll() }` -- but does not pin down every detail. This suite makes
// the following JUDGMENT CALLS, which the warming implementer must build
// to (flagging them here rather than silently assuming):
//
//   1. `request(warmRequestDescriptor, signal)` -- called with the exact
//      object buildWarmRequest(url) would produce for the attempted
//      candidate url, PLUS a real AbortSignal (from an AbortController the
//      queue owns per attempt). This is the only clean way to make
//      abortAll() observably cancel an in-flight request when `request`
//      is an injected plain function returning a bare Promise (Promises
//      are not natively cancellable) -- mirrors the fetch(url, {signal})
//      idiom the master plan already uses elsewhere (AbortController).
//   2. request()'s Promise settling (resolve = anything, reject = Error)
//      is the sole success/failure signal -- no particular resolve value
//      shape is required or asserted.
//   3. `stats()` returns { pending, inflight, warm, failed, states }
//      where `states` is a plain { [txid]: 'pending'|'inflight'|'warm'|
//      'failed' } map. Not specified by the contract; chosen here as the
//      simplest shape that lets tests assert per-txid state directly.
//   4. abortAll() takes effect SYNCHRONOUSLY on stats() (pending/inflight
//      both read back as 0 immediately after the call), even though the
//      underlying request Promise(s) may not have settled yet -- required
//      so a page navigating away sees "nothing running" without waiting
//      on the network.
//   5. `prioritize(txid)` on a txid that was never enqueue()'d is a
//      harmless no-op (see warm-policy.test.mjs's file-header judgment
//      call #3 for why: the signature carries no `urls`, so there is
//      nothing to request).
//
// Timing: no real timers anywhere. node:test's built-in mock timers
// (`t.mock.timers`, no new dependency) drive any internal setTimeout the
// queue uses for spacing/jitter; a small manually-advanced clock (kept in
// lockstep with the mock timer ticks) is what's injected as `options.now`.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';
import { loadUeWarm } from './helpers/load-ue-warm.mjs';

const UEPlayerCore = loadCore();

let UEWarm;
let loadErr = null;
try {
  UEWarm = loadUeWarm();
} catch (err) {
  loadErr = err;
}
function core() {
  if (loadErr) throw loadErr;
  return UEWarm;
}

const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM'; // real UE mix txid

function makeManualClock(start) {
  var t = typeof start === 'number' ? start : 0;
  return {
    now: function () { return t; },
    advance: function (ms) { t += ms; return t; }
  };
}

// Fake `request`: never touches the network. Every call is recorded with
// its own deferred resolve/reject so tests control exactly when (and
// whether) each attempt settles.
function makeFakeRequest() {
  var calls = [];
  function request(descriptor, signal) {
    var resolveFn, rejectFn;
    var promise = new Promise(function (resolve, reject) { resolveFn = resolve; rejectFn = reject; });
    calls.push({ descriptor: descriptor, signal: signal, resolve: resolveFn, reject: rejectFn });
    return promise;
  }
  return { request: request, calls: calls };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

function url(id) { return 'https://arweave.fllstck.dev/' + id; }

describe('createWarmQueue -- concurrency and spacing', () => {
  test('concurrency never exceeds 2 no matter how many are enqueued (peak in-flight)', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 10, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    for (var i = 0; i < 10; i++) queue.enqueue('t' + i, [url('t' + i)]);

    // Advance far past any conceivable spacing/jitter. Nothing ever
    // resolves, so no in-flight slot is ever freed -- if the cap holds,
    // no more than 2 requests can ever have been issued, regardless of
    // how far time or the queue is pushed.
    clock.advance(100000);
    t.mock.timers.tick(100000);

    assert.equal(fake.calls.length, 2, 'no more than `concurrency` requests may ever be in flight at once');
    assert.equal(queue.stats().inflight, 2);
  });

  test('spacing/jitter is applied between starts using the injected clock/random', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var randomCalls = 0;
    var random = function () { randomCalls += 1; return 0.4; };
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 150, jitterMs: 250, now: clock.now, random: random, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    queue.enqueue('b', [url('b')]);

    var startTimes = [];
    var seen = 0;
    function drain() { while (fake.calls.length > seen) { startTimes.push(clock.now()); seen += 1; } }
    drain();
    for (var i = 0; i < 300 && seen < 2; i++) {
      clock.advance(10);
      t.mock.timers.tick(10);
      drain();
    }

    assert.equal(startTimes.length, 2, 'both eligible starts must eventually fire');
    var gap = startTimes[1] - startTimes[0];
    assert.ok(gap >= 150, 'gap between starts (' + gap + 'ms) must be >= spacingMs (150ms)');
    assert.ok(gap <= 150 + 250, 'gap between starts (' + gap + 'ms) must be <= spacingMs+jitterMs (400ms)');
    assert.ok(randomCalls > 0, 'jitter must consult the injected random(), not Math.random()');
  });
});

describe('createWarmQueue -- dedupe and terminal states', () => {
  test('the same txid enqueued twice results in ONE request (session dedupe)', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('dup', [url('dup')]);
    queue.enqueue('dup', [url('dup')]);
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1);
  });

  test('a txid already warm is not requested again', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('w', [url('w')]);
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1);
    fake.calls[0].resolve({ ok: true });
    await flushMicrotasks();
    assert.equal(queue.stats().states.w, 'warm');

    queue.enqueue('w', [url('w')]);
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1, 'no new request for an already-warm txid');
  });

  test('a failed warm is recorded as failed and NOT retried automatically', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('f', [url('f')]);
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1);
    fake.calls[0].reject(new Error('boom'));
    await flushMicrotasks();
    assert.equal(queue.stats().states.f, 'failed');

    clock.advance(600000); // 10 minutes -- generous
    t.mock.timers.tick(600000);
    assert.equal(fake.calls.length, 1, 'a failed warm must not be retried automatically');
  });
});

describe('createWarmQueue -- prioritize', () => {
  test('prioritize(txid) moves a queued-but-not-yet-started txid to the front', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    queue.enqueue('b', [url('b')]);
    queue.enqueue('c', [url('c')]);

    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1, 'concurrency 1: only "a" has started');
    assert.equal(fake.calls[0].descriptor.url, url('a'));

    queue.prioritize('c');
    fake.calls[0].resolve({ ok: true }); // free the one slot
    await flushMicrotasks();
    clock.advance(1000);
    t.mock.timers.tick(1000);

    assert.equal(fake.calls.length, 2);
    assert.equal(fake.calls[1].descriptor.url, url('c'), 'prioritized txid must start next, ahead of "b"');
  });

  test('prioritize on a txid the queue has never enqueued is a harmless no-op', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    assert.doesNotThrow(function () { queue.prioritize('never-seen'); });
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 0);
  });

  test('prioritize on an already in-flight txid is a harmless no-op', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('x', [url('x')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1);
    assert.doesNotThrow(function () { queue.prioritize('x'); });
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1, 'prioritizing an in-flight txid must not trigger a duplicate request');
  });

  test('prioritize on an already-warm txid is a harmless no-op', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('y', [url('y')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    fake.calls[0].resolve({ ok: true });
    await flushMicrotasks();
    assert.equal(queue.stats().states.y, 'warm');
    assert.doesNotThrow(function () { queue.prioritize('y'); });
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1);
  });

  test('enqueue(..., {priority:true}) inserts at the front, like prioritize()', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1, 'concurrency 1: "a" started');

    queue.enqueue('b', [url('b')]);
    queue.enqueue('c', [url('c')], { priority: true });

    fake.calls[0].resolve({ ok: true });
    await flushMicrotasks();
    clock.advance(1000);
    t.mock.timers.tick(1000);

    assert.equal(fake.calls.length, 2);
    assert.equal(fake.calls[1].descriptor.url, url('c'), 'priority enqueue must start ahead of the earlier plain enqueue of "b"');
  });
});

describe('createWarmQueue -- abortAll', () => {
  test('abortAll() cancels pending work and in-flight requests', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]); // will start (in-flight)
    queue.enqueue('b', [url('b')]); // will remain pending, concurrency 1

    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1);
    var inflightSignal = fake.calls[0].signal;

    queue.abortAll();

    assert.ok(inflightSignal, 'request() must be given a real AbortSignal for its attempt');
    assert.equal(inflightSignal.aborted, true, 'the in-flight request must be aborted');
    var s = queue.stats();
    assert.equal(s.pending, 0, 'abortAll() must clear pending work synchronously');
    assert.equal(s.inflight, 0, 'abortAll() must clear in-flight bookkeeping synchronously');

    clock.advance(60000);
    t.mock.timers.tick(60000);
    assert.equal(fake.calls.length, 1, 'the pending "b" must never start after abortAll()');
  });
});

// ---------------------------------------------------------------------
// Adversarial-review fixes (2026-09-08): cancel(), pause()/resume(),
// suspend()/unsuspend() -- the new public API createWarmQueue() grew to
// support ue-warm.js's UEWarm.notifyPlaybackStarting()/Settled() (Fix 2)
// and the tab-visibility suspend behavior (Fix 5). Added here per the
// task brief's explicit invitation; no existing assertion above is
// touched.
// ---------------------------------------------------------------------

describe('createWarmQueue -- cancel (Fix 2: player commits to a real load)', () => {
  test('cancel() on a still-pending txid drops it untracked (not failed), and it stays eligible for a fresh enqueue', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    queue.enqueue('p', [url('p')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1, 'only "a" has started, concurrency 1');
    assert.equal(queue.stats().states.p, 'pending');

    queue.cancel('p');
    assert.equal(queue.stats().states.p, undefined, 'cancelled txid is untracked, NOT `failed`');

    fake.calls[0].resolve({ ok: true });
    await flushMicrotasks();
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1, 'a cancelled txid never auto-restarts on its own');

    queue.enqueue('p', [url('p')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 2, 'a fresh enqueue() after cancel() must actually request again');
    assert.equal(fake.calls[1].descriptor.url, url('p'));
  });

  test('cancel() on an in-flight txid aborts its request, frees the concurrency slot, and does not mark it failed', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('x', [url('x')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1);
    assert.equal(queue.stats().states.x, 'inflight');
    var xSignal = fake.calls[0].signal;

    queue.cancel('x');
    assert.equal(xSignal.aborted, true, 'the in-flight request must actually be aborted');
    assert.equal(queue.stats().states.x, undefined, 'cancelled -- not `failed`');
    assert.equal(queue.stats().inflight, 0, 'the concurrency slot must be freed synchronously (nothing else was pending to fill it)');

    // a stray late settle firing on the aborted attempt must be a harmless no-op
    fake.calls[0].reject(new Error('aborted'));
    await flushMicrotasks();
    assert.equal(queue.stats().states.x, undefined, 'a stale settle after cancel() must not resurrect state');

    // the freed slot is genuinely usable, not stuck -- new work can start again
    queue.enqueue('y', [url('y')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 2, 'the freed slot lets a new enqueue() start');
    assert.equal(fake.calls[1].descriptor.url, url('y'));
  });

  test('cancel() on an already-warm or already-failed txid is a harmless no-op', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('w', [url('w')]);
    queue.enqueue('f', [url('f')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 2);
    fake.calls[0].resolve({ ok: true });
    fake.calls[1].reject(new Error('boom'));
    await flushMicrotasks();
    assert.equal(queue.stats().states.w, 'warm');
    assert.equal(queue.stats().states.f, 'failed');

    assert.doesNotThrow(function () { queue.cancel('w'); });
    assert.doesNotThrow(function () { queue.cancel('f'); });
    assert.equal(queue.stats().states.w, 'warm', 'a warm txid stays warm');
    assert.equal(queue.stats().states.f, 'failed', 'a failed txid stays failed -- cancel() must not revive it');
  });

  test('cancel() on a never-enqueued txid, or a non-string/null/undefined, is a harmless no-op', () => {
    var UEWarm = core();
    var queue = UEWarm.createWarmQueue({ concurrency: 2, request: function () { return new Promise(function () {}); } });
    assert.doesNotThrow(function () { queue.cancel('never-seen'); });
    assert.doesNotThrow(function () { queue.cancel(null); });
    assert.doesNotThrow(function () { queue.cancel(undefined); });
    assert.doesNotThrow(function () { queue.cancel(''); });
  });
});

describe('createWarmQueue -- pause/resume (Fix 2: pause the whole queue during a real start)', () => {
  test('pause() blocks new starts; resume() lets them proceed; already-in-flight work is untouched', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1, '"a" started before any pause');

    queue.pause();
    queue.enqueue('b', [url('b')]);
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1, 'pause() must prevent "b" from starting');
    assert.equal(fake.calls[0].signal.aborted, false, 'pause() must not abort already-in-flight work');

    queue.resume();
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 2, 'resume() lets "b" start');
    assert.equal(fake.calls[1].descriptor.url, url('b'));
  });

  test('resume() is a harmless no-op when never paused', () => {
    var UEWarm = core();
    var queue = UEWarm.createWarmQueue({ concurrency: 1, request: function () { return new Promise(function () {}); } });
    assert.doesNotThrow(function () { queue.resume(); });
  });
});

describe('createWarmQueue -- suspend/unsuspend (Fix 5: tab backgrounding must not permanently fail warming)', () => {
  test('suspend() aborts in-flight work and returns it to pending (never failed); unsuspend() resumes it', async (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1);
    var firstSignal = fake.calls[0].signal;

    queue.suspend();
    assert.equal(firstSignal.aborted, true, 'suspend() must abort in-flight requests (stop spending a background tab\'s data)');
    assert.equal(queue.stats().states.a, 'pending', 'an in-flight txid aborted purely by backgrounding must return to pending, NOT failed');
    assert.equal(queue.stats().inflight, 0);

    // a stray late settle on the old (now-discarded) attempt must not resurrect it
    fake.calls[0].reject(new Error('aborted'));
    await flushMicrotasks();
    assert.equal(queue.stats().states.a, 'pending', 'still pending -- the stale reject changed nothing');

    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1, 'suspend() must prevent restarts while still suspended');

    queue.unsuspend();
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 2, 'unsuspend() (foreground again) must let the revived entry restart');
    assert.equal(fake.calls[1].descriptor.url, url('a'));
  });

  test('suspend() leaves an already-pending (not-yet-started) entry alone, just stops it from starting', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 1, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue('a', [url('a')]);
    queue.enqueue('b', [url('b')]);
    clock.advance(1000);
    t.mock.timers.tick(1000);
    assert.equal(fake.calls.length, 1);

    queue.suspend();
    assert.equal(queue.stats().states.b, 'pending', 'a not-yet-started entry is untouched by suspend()');
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1, '"b" must not start while suspended');
  });

  test('suspend() is idempotent; unsuspend() is a harmless no-op when never suspended', () => {
    var UEWarm = core();
    var queue = UEWarm.createWarmQueue({ concurrency: 1, request: function () { return new Promise(function () {}); } });
    assert.doesNotThrow(function () { queue.unsuspend(); });
    queue.enqueue('z', [url('z')]);
    assert.doesNotThrow(function () { queue.suspend(); queue.suspend(); });
  });

  test('pause() (Fix 2) and suspend() (Fix 5) are independent gates -- lifting one alone must not start work the other is still holding back', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.pause();
    queue.suspend();
    queue.enqueue('a', [url('a')]);
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 0, 'both gates must hold "a" back');

    queue.resume(); // lifts the Fix-2 gate only
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 0, 'still suspended -- resume() alone must not start anything');

    queue.unsuspend(); // now both gates are lifted
    clock.advance(5000);
    t.mock.timers.tick(5000);
    assert.equal(fake.calls.length, 1, 'lifting both gates finally lets "a" start');
  });
});

describe('createWarmQueue -- request shape invariant (integration)', () => {
  test('requests issued by the queue are always range-gateway urls from buildCandidates, never raw arweave.net', (t) => {
    var UEWarm = core();
    t.mock.timers.enable({ apis: ['setTimeout'] });
    var clock = makeManualClock();
    var fake = makeFakeRequest();
    var canonical = 'https://arweave.net/' + TXID;
    var candidateUrls = UEPlayerCore.buildCandidates(canonical).map(function (c) { return c.url; });
    assert.ok(candidateUrls.length >= 1);

    var queue = UEWarm.createWarmQueue({
      concurrency: 2, spacingMs: 10, jitterMs: 0, now: clock.now, random: function () { return 0; }, request: fake.request
    });
    queue.enqueue(TXID, candidateUrls);
    clock.advance(5000);
    t.mock.timers.tick(5000);

    assert.ok(fake.calls.length >= 1, 'at least one candidate must have been attempted');
    fake.calls.forEach(function (call) {
      assert.equal(call.descriptor.headers.Range, 'bytes=0-65535');
      assert.ok(!call.descriptor.url.startsWith('https://arweave.net/'), 'must never be the raw host: ' + call.descriptor.url);
      assert.ok(UEPlayerCore.RANGE_HOSTS.some(function (h) { return call.descriptor.url.startsWith(h); }));
    });
  });
});
