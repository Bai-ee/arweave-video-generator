import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';
import { makeClock, pushEvent, commandsOfType, firstCommandOfType } from './helpers/fake-media.mjs';

const UEPlayerCore = loadCore();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const ORIGINAL_URL = 'https://arweave.net/' + TXID;
const WIDE_SEEKABLE = [{ start: 0, end: 4000 }];

function build(options) {
  const candidates = UEPlayerCore.buildCandidates(ORIGINAL_URL);
  const clock = makeClock(0);
  const controller = UEPlayerCore.createPlaybackController(Object.assign(
    { candidates, now: clock.now },
    options || {}
  ));
  return { candidates, clock, controller };
}

describe('requestSeek() + seeked verification', () => {
  test('a seek is accepted once `seeked` lands within tolerance AND inside a seekable range', () => {
    const { controller } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 300 });
    assert.equal(controller.confirmedTime, 300);

    const seekCommands = controller.requestSeek(500);
    assert.equal(controller.state, 'seeking');
    assert.equal(controller.pendingSeekTime, 500);
    const setCurrentTime = firstCommandOfType(seekCommands, 'setCurrentTime');
    assert.equal(setCurrentTime.time, 500);

    const landedCommands = pushEvent(controller, 'seeked', {
      generation: controller.generation,
      currentTime: 501,
      seekableRanges: WIDE_SEEKABLE
    });

    assert.equal(controller.confirmedTime, 501);
    assert.equal(controller.pendingSeekTime, null);
    assert.equal(controller.state, 'playing');
    assert.equal(commandsOfType(landedCommands, 'setCurrentTime').length, 0, 'an accepted seek does not re-issue setCurrentTime');
  });

  test('a `seeked` that lands far away is rejected and the prior confirmed time is restored', () => {
    const { controller } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 300 });

    controller.requestSeek(800);
    const commands = pushEvent(controller, 'seeked', {
      generation: controller.generation,
      currentTime: 850, // far outside seekToleranceSec (default 2)
      seekableRanges: WIDE_SEEKABLE
    });

    assert.equal(controller.confirmedTime, 300, 'confirmedTime must be restored to the pre-seek value');
    assert.equal(controller.pendingSeekTime, null);
    assert.equal(controller.state, 'playing');

    const restore = firstCommandOfType(commands, 'setCurrentTime');
    assert.ok(restore, 'a restoring setCurrentTime command must be emitted');
    assert.equal(restore.time, 300);

    const status = firstCommandOfType(commands, 'status');
    assert.equal(status.level, 'error');
  });

  test('a `seeked` that lands close but outside any seekable range is also rejected', () => {
    const { controller } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 300 });

    controller.requestSeek(1000);
    const commands = pushEvent(controller, 'seeked', {
      generation: controller.generation,
      currentTime: 1000.5, // within tolerance...
      seekableRanges: [{ start: 0, end: 500 }] // ...but not actually seekable there
    });

    assert.equal(controller.confirmedTime, 300);
    const restore = firstCommandOfType(commands, 'setCurrentTime');
    assert.equal(restore.time, 300);
  });

  test('requestSeek() refuses when every candidate has been probe-rejected as non-range-capable', () => {
    const { controller } = build();
    controller.requestPlay();
    controller.applyProbeResult(0, { rangeCapable: false, reason: 'no-206' });
    controller.applyProbeResult(1, { rangeCapable: false, reason: 'no-206' });

    const commands = controller.requestSeek(120);
    const status = firstCommandOfType(commands, 'status');
    assert.equal(status.level, 'error');
    assert.equal(controller.pendingSeekTime, null, 'a refused seek must not set pendingSeekTime');
  });
});

describe('seek timeout', () => {
  test('a seek that never completes within seekTimeoutMs fails over exactly once, then goes terminal failed with a retry status command', () => {
    const { candidates, clock, controller } = build({ seekTimeoutMs: 12000, stallGraceMs: 20000 });
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 10 });

    controller.requestSeek(600); // pendingSeekTime=600, state='seeking', on candidate[0]
    clock.advance(12000);
    const firstTimeoutCommands = controller.tick(clock.now());

    // exactly one failover: candidate[0] is now unhealthy, we moved to candidate[1]
    assert.equal(controller.activeIndex, 1);
    const restore = firstCommandOfType(firstTimeoutCommands, 'setCurrentTime');
    assert.ok(restore, 'the abandoned explicit seek restores the prior confirmed position on the way out');
    assert.equal(restore.time, 10);
    const setSrc = firstCommandOfType(firstTimeoutCommands, 'setSrc');
    assert.equal(setSrc.url, candidates[1].url);
    assert.equal(setSrc.resumeTime, 10);
    assert.notEqual(controller.state, 'failed');

    // candidate[1]'s resume-seek verification also never lands
    clock.advance(12000);
    const secondTimeoutCommands = controller.tick(clock.now());

    assert.equal(controller.state, 'failed');
    const status = firstCommandOfType(secondTimeoutCommands, 'status');
    assert.equal(status.level, 'error');
    assert.equal(status.code, 'failed');
    assert.equal(commandsOfType(secondTimeoutCommands, 'setSrc').length, 0, 'no third candidate exists — must not silently retry raw arweave.net');
  });

  test('tick() does nothing while a seek is still within its grace period', () => {
    const { clock, controller } = build({ seekTimeoutMs: 12000 });
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 10 });
    controller.requestSeek(600);
    clock.advance(11000);
    const commands = controller.tick(clock.now());
    assert.deepEqual(commands, []);
    assert.equal(controller.state, 'seeking');
  });
});
