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
    { candidates, now: clock.now, expectedDurationSec: 3600, maxRecoveriesPerCandidate: 1 },
    options || {}
  ));
  return { candidates, clock, controller };
}

describe('`ended` verification', () => {
  test('a verified natural end (at/near duration) reports end-of-track without recovering', () => {
    const { controller } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 3550 });

    const commands = pushEvent(controller, 'ended', { generation: controller.generation, currentTime: 3595, duration: 3600 });

    assert.equal(controller.state, 'idle', 'a natural end returns the controller to idle, ready for the next track');
    assert.equal(commandsOfType(commands, 'setSrc').length, 0, 'a natural end must never trigger a reconnect');
    const status = firstCommandOfType(commands, 'status');
    assert.equal(status.level, 'info');
  });

  test('a premature `ended` (far from duration) recovers in place at most once, and cannot loop forever', () => {
    const { candidates, controller } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 1000 });

    const firstEndCommands = pushEvent(controller, 'ended', { generation: controller.generation, currentTime: 1000, duration: 3600 });

    // recovered in place: same candidate, resumed at the premature-end position
    let setSrc = firstCommandOfType(firstEndCommands, 'setSrc');
    assert.ok(setSrc, 'a premature end must trigger a same-candidate reconnect');
    assert.equal(setSrc.url, candidates[0].url);
    assert.equal(setSrc.resumeTime, 1000);
    assert.equal(controller.activeIndex, 0);
    assert.equal(controller.state, 'loading');

    // acknowledge the resume landed
    pushEvent(controller, 'seeked', {
      generation: controller.generation,
      currentTime: 1001,
      seekableRanges: [{ start: 0, end: 9999 }]
    });
    assert.equal(controller.state, 'playing');

    // a SECOND premature end on the same candidate must not reconnect it
    // again (budget = 1) — it must fail over instead, never loop forever
    const secondEndCommands = pushEvent(controller, 'ended', { generation: controller.generation, currentTime: 1001, duration: 3600 });

    setSrc = firstCommandOfType(secondEndCommands, 'setSrc');
    assert.ok(setSrc, 'must fail over rather than silently give up with no action');
    assert.equal(setSrc.url, candidates[1].url, 'candidate[0]\'s premature-end budget is spent — must move to candidate[1]');
    assert.equal(controller.activeIndex, 1);
  });

  test('an `ended` with no known duration at all is treated as a natural end (cannot classify prematurity)', () => {
    const { controller } = build({ expectedDurationSec: 0 });
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 5 });

    const commands = pushEvent(controller, 'ended', { generation: controller.generation, currentTime: 5 });

    assert.equal(controller.state, 'idle');
    assert.equal(commandsOfType(commands, 'setSrc').length, 0);
  });
});
