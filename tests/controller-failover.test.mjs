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

/* collects every command ever emitted across a whole test's calls, so the
   "raw arweave.net never appears in ANY command" invariant can be checked
   over the full session, not just one call */
function makeSink() {
  const all = [];
  return { all, push: (cmds) => { all.push(...cmds); return cmds; } };
}

describe('media error -> verified failover', () => {
  test('an error moves to the next candidate WITHOUT resetting confirmedTime', () => {
    const { candidates, controller } = build();
    controller.requestPlay(); // generation 1, active = fllstck

    pushEvent(controller, 'playing', { generation: 1, currentTime: 5 });
    pushEvent(controller, 'timeupdate', { generation: 1, currentTime: 130 });
    assert.equal(controller.confirmedTime, 130);

    const commands = pushEvent(controller, 'error', { generation: 1, errorCode: 2 });

    const setSrc = firstCommandOfType(commands, 'setSrc');
    assert.ok(setSrc);
    assert.equal(setSrc.url, candidates[1].url, 'must move to the second candidate');
    assert.equal(setSrc.resumeTime, 130, 'resumeTime must equal the last confirmed time, not 0');
    assert.equal(controller.confirmedTime, 130, 'confirmedTime itself must not be reset by the failover');
    assert.equal(controller.activeIndex, 1);
    assert.equal(controller.generation, 2, 'a source replacement bumps the generation');
  });

  test('exhausting both range candidates yields a terminal failed state with an error status command; retry() restarts from confirmedTime, not zero', () => {
    const { candidates, controller } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: 1, currentTime: 5 });
    pushEvent(controller, 'timeupdate', { generation: 1, currentTime: 130 });

    pushEvent(controller, 'error', { generation: 1, errorCode: 2 }); // -> candidate[1], generation 2
    assert.equal(controller.state, 'loading');

    const finalCommands = pushEvent(controller, 'error', { generation: 2, errorCode: 2 }); // both candidates now unhealthy

    assert.equal(controller.state, 'failed');
    const status = firstCommandOfType(finalCommands, 'status');
    assert.equal(status.level, 'error');
    assert.equal(status.code, 'failed');
    assert.equal(commandsOfType(finalCommands, 'setSrc').length, 0, 'no further source to try');

    const retryCommands = controller.retry();
    const setSrc = firstCommandOfType(retryCommands, 'setSrc');
    assert.ok(setSrc);
    assert.equal(setSrc.resumeTime, 130, 'retry must resume from confirmedTime, never from 0');
    assert.equal(setSrc.url, candidates[0].url, 'retry clears health and starts again from the first candidate');
    assert.equal(controller.state, 'loading');
  });

  test('the raw arweave.net URL is never present in any command, across the whole failover-to-exhaustion-to-retry session', () => {
    const { controller } = build();
    const sink = makeSink();

    sink.push(controller.requestPlay());
    sink.push(pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 5 }));
    sink.push(pushEvent(controller, 'timeupdate', { generation: controller.generation, currentTime: 130 }));
    sink.push(pushEvent(controller, 'error', { generation: controller.generation, errorCode: 2 }));
    sink.push(pushEvent(controller, 'error', { generation: controller.generation, errorCode: 2 }));
    sink.push(controller.retry());

    assert.equal(controller.state, 'loading');

    for (const cmd of sink.all) {
      const json = JSON.stringify(cmd);
      assert.ok(!json.includes('arweave.net'), 'no command may ever reference the raw arweave.net host: ' + json);
    }
  });
});
