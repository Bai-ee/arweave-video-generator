import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';
import { makeClock, pushEvent, commandsOfType, firstCommandOfType } from './helpers/fake-media.mjs';

const UEPlayerCore = loadCore();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const ORIGINAL_URL = 'https://arweave.net/' + TXID;

function build(options) {
  const candidates = UEPlayerCore.buildCandidates(ORIGINAL_URL);
  const clock = makeClock(0);
  const controller = UEPlayerCore.createPlaybackController(Object.assign(
    { candidates, now: clock.now },
    options || {}
  ));
  return { candidates, clock, controller };
}

describe('tick() load timeout — bounds the `loading` state when pendingSeekTime is null', () => {
  test('first play from idle: a candidate that produces NOTHING (no events at all) fails over to the second candidate once loadTimeoutMs (default 25000ms) elapses', () => {
    const { candidates, controller, clock } = build();
    controller.requestPlay(); // generation 1, active = candidate[0], state 'loading'
    assert.equal(controller.state, 'loading');
    assert.equal(controller.activeIndex, 0);

    clock.advance(25000);
    const commands = controller.tick(clock.now());

    const setSrc = firstCommandOfType(commands, 'setSrc');
    assert.ok(setSrc, 'a reachable-but-dead candidate must fail over, not hang forever');
    assert.equal(setSrc.url, candidates[1].url, 'must move to the second candidate');
    assert.equal(setSrc.resumeTime, 0, 'nothing was ever confirmed — resumes at 0, not a fabricated position');
    assert.equal(controller.activeIndex, 1);
    assert.equal(controller.generation, 2, 'a source replacement bumps the generation');

    const log = firstCommandOfType(commands, 'log');
    assert.ok(log);
    assert.equal(log.entry.reason, 'load-timeout', 'must carry a distinct reason from every other recovery path');
  });

  test('same, but only ONE eligible candidate: load-timeout goes straight to a terminal failed state with the error status command, and the raw arweave.net URL never appears in any command', () => {
    const clock = makeClock(0);
    const allCandidates = UEPlayerCore.buildCandidates(ORIGINAL_URL);
    const oneCandidate = [allCandidates[0]];
    const controller = UEPlayerCore.createPlaybackController({ candidates: oneCandidate, now: clock.now });

    controller.requestPlay();
    assert.equal(controller.state, 'loading');

    clock.advance(25000);
    const commands = controller.tick(clock.now());

    assert.equal(controller.state, 'failed');
    const status = firstCommandOfType(commands, 'status');
    assert.ok(status);
    assert.equal(status.level, 'error');
    assert.equal(status.code, 'failed');
    assert.equal(commandsOfType(commands, 'setSrc').length, 0, 'no further source to try');

    const log = firstCommandOfType(commands, 'log');
    assert.equal(log.entry.reason, 'load-timeout');

    for (const cmd of commands) {
      const json = JSON.stringify(cmd);
      assert.ok(!json.includes('arweave.net'), 'no command may ever reference the raw arweave.net host: ' + json);
    }
  });

  test('a load that is slow but produces real progress (playing, then timeupdate advancing) is NOT killed by the load timer, even well past loadTimeoutMs', () => {
    const { controller, clock } = build();
    controller.requestPlay();

    clock.advance(24000); // just under the 25s default, still 'loading'
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 0, readyState: 4 });
    assert.equal(controller.state, 'playing', 'a playing event moves state out of loading entirely');

    clock.advance(5000);
    pushEvent(controller, 'timeupdate', { generation: controller.generation, currentTime: 5, readyState: 4 });

    clock.advance(60000); // now far past loadTimeoutMs since the ORIGINAL load start
    const commands = controller.tick(clock.now());

    assert.deepEqual(commands, [], 'a genuinely progressing stream must never be killed by the load timer');
    assert.equal(controller.state, 'playing');
    assert.equal(controller.activeIndex, 0);
  });

  test('live loadedmetadata/canplay evidence extends the load-timeout window instead of being ignored', () => {
    const { controller, clock } = build();
    controller.requestPlay();

    clock.advance(20000); // close to the 25s boundary, still no `playing`
    pushEvent(controller, 'loadedmetadata', { generation: controller.generation, readyState: 1, currentTime: 0 });
    assert.equal(controller.state, 'loading');

    clock.advance(20000); // 40s since load start, but only 20s since the loadedmetadata evidence
    const commands = controller.tick(clock.now());
    assert.deepEqual(commands, [], 'live evidence the candidate is responding must push the window forward');
    assert.equal(controller.state, 'loading');

    clock.advance(5001); // now just over 25s since the loadedmetadata evidence, and `playing` still never arrived
    const laterCommands = controller.tick(clock.now());
    assert.ok(firstCommandOfType(laterCommands, 'setSrc'), 'still eventually times out if playback never actually starts');
  });

  test('a load still inside loadTimeoutMs produces no commands', () => {
    const { controller, clock } = build();
    controller.requestPlay();

    clock.advance(24999); // 1ms under the boundary
    const commands = controller.tick(clock.now());

    assert.deepEqual(commands, []);
    assert.equal(controller.state, 'loading');
  });

  test('regression guard: a failover/resume that sets pendingSeekTime (non-zero confirmedTime) is still governed by seekTimeoutMs (12000ms default), not the new loadTimeoutMs (25000ms) — unchanged by this fix', () => {
    const { controller, clock } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 5 });
    pushEvent(controller, 'timeupdate', { generation: controller.generation, currentTime: 130 });

    pushEvent(controller, 'error', { generation: controller.generation, errorCode: 2 }); // -> candidate[1], pendingSeekTime = 130
    assert.equal(controller.pendingSeekTime, 130);
    assert.equal(controller.state, 'loading');

    clock.advance(11999); // just under the 12s seek-timeout — must still be silent
    assert.deepEqual(controller.tick(clock.now()), []);

    clock.advance(1); // crosses the 12s seek-timeout boundary, well short of the 25s load-timeout
    const commands = controller.tick(clock.now());

    assert.equal(controller.state, 'failed', 'both candidates exhausted via the SEEK timeout, at 12s not 25s');
    const log = firstCommandOfType(commands, 'log');
    assert.equal(log.entry.reason, 'seek-timeout', 'must remain the pre-existing seek-timeout reason, not load-timeout');
  });

  test('load-timeout failover is bounded — it cannot loop forever across the same candidate', () => {
    const { controller, clock } = build();
    controller.requestPlay();
    assert.equal(controller.activeIndex, 0);

    clock.advance(25000);
    const firstTimeout = controller.tick(clock.now());
    assert.equal(controller.activeIndex, 1, 'moved to the second candidate');
    assert.equal(controller.state, 'loading');
    assert.equal(firstCommandOfType(firstTimeout, 'log').entry.reason, 'load-timeout');

    clock.advance(25000);
    const secondTimeout = controller.tick(clock.now());
    assert.equal(controller.state, 'failed', 'no third candidate exists — must go terminal, never loop back to candidate 0');
    assert.equal(commandsOfType(secondTimeout, 'setSrc').length, 0);

    clock.advance(100000); // well past any timeout, in the terminal state
    assert.deepEqual(controller.tick(clock.now()), [], 'no infinite retry loop once terminal');
  });
});
