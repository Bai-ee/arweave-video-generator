import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';
import { makeClock, commandsOfType, firstCommandOfType } from './helpers/fake-media.mjs';

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

describe('createPlaybackController — initial source selection', () => {
  test('requestPlay() from idle selects the first eligible range candidate, never the raw gateway', () => {
    const { candidates, controller } = build();
    assert.equal(controller.state, 'idle');

    const commands = controller.requestPlay();

    const setSrc = firstCommandOfType(commands, 'setSrc');
    assert.ok(setSrc, 'expected a setSrc command');
    assert.equal(setSrc.url, candidates[0].url);
    assert.equal(setSrc.url, 'https://arweave.fllstck.dev/' + TXID);
    assert.notEqual(setSrc.url, ORIGINAL_URL);
    assert.ok(!setSrc.url.includes('arweave.net'));
    assert.equal(setSrc.resumeTime, 0);

    assert.equal(controller.state, 'loading');
    assert.equal(controller.activeIndex, 0);
    assert.equal(controller.generation, 1);
    assert.equal(controller.wantPlay, true);

    for (const c of commands) {
      assert.equal(c.generation, 1, 'every command must carry the current generation');
    }
  });

  test('requestPlay() emits its play command synchronously in the same call (mobile gesture requirement)', () => {
    const { controller } = build();
    const commands = controller.requestPlay();
    const play = firstCommandOfType(commands, 'play');
    assert.ok(play, 'play command must be present in the same synchronous return value as setSrc');
  });

  test('an empty candidate list (no txid parsed) goes straight to a terminal failed state, never touching arweave.net', () => {
    const clock = makeClock(0);
    const controller = UEPlayerCore.createPlaybackController({ candidates: [], now: clock.now });
    const commands = controller.requestPlay();
    assert.equal(controller.state, 'failed');
    assert.equal(commandsOfType(commands, 'setSrc').length, 0);
    const status = firstCommandOfType(commands, 'status');
    assert.equal(status.level, 'error');
  });

  test('a second requestPlay() while already loading just re-emits play, without re-selecting a candidate', () => {
    const { controller } = build();
    controller.requestPlay();
    const generationAfterFirst = controller.generation;
    const commands = controller.requestPlay();
    assert.deepEqual(commandsOfType(commands, 'setSrc'), []);
    assert.equal(commandsOfType(commands, 'play').length, 1);
    assert.equal(controller.generation, generationAfterFirst, 'no new generation for a plain resume-play');
  });

  test('requestPlay() from a failed state is a no-op — retry() is the documented way out', () => {
    const clock = makeClock(0);
    const controller = UEPlayerCore.createPlaybackController({ candidates: [], now: clock.now });
    controller.requestPlay();
    assert.equal(controller.state, 'failed');
    const commands = controller.requestPlay();
    assert.deepEqual(commands, []);
    assert.equal(controller.state, 'failed');
  });
});
