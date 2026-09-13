import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';
import { makeClock, pushEvent } from './helpers/fake-media.mjs';

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

describe('stale-generation events are inert', () => {
  test('loadedmetadata, ended, error, and seeked from an older generation return no commands and mutate nothing', () => {
    const { controller } = build();
    controller.requestPlay(); // generation -> 1
    pushEvent(controller, 'playing', { generation: 1, currentTime: 50 });

    const staleGeneration = 0; // the generation before requestPlay() bumped it
    assert.notEqual(controller.generation, staleGeneration);

    const before = controller.snapshot();

    const results = [
      pushEvent(controller, 'loadedmetadata', { generation: staleGeneration, currentTime: 999, duration: 999999 }),
      pushEvent(controller, 'ended', { generation: staleGeneration, currentTime: 999 }),
      pushEvent(controller, 'error', { generation: staleGeneration, errorCode: 4 }),
      pushEvent(controller, 'seeked', { generation: staleGeneration, currentTime: 999, seekableRanges: [{ start: 0, end: 9999 }] }),
      pushEvent(controller, 'timeupdate', { generation: staleGeneration, currentTime: 999 }),
      pushEvent(controller, 'waiting', { generation: staleGeneration }),
      pushEvent(controller, 'stalled', { generation: staleGeneration })
    ];

    for (const commands of results) {
      assert.deepEqual(commands, [], 'a stale-generation event must return no commands');
    }

    const after = controller.snapshot();
    assert.deepEqual(after, before, 'a stale-generation event must not mutate any controller state');
  });

  test('a stale event does not resurrect a controller that has already moved to a newer candidate', () => {
    const { candidates, controller } = build();
    controller.requestPlay(); // generation 1, candidate[0]
    pushEvent(controller, 'playing', { generation: 1, currentTime: 5 });
    pushEvent(controller, 'timeupdate', { generation: 1, currentTime: 130 });
    pushEvent(controller, 'error', { generation: 1, errorCode: 2 }); // -> generation 2, candidate[1]

    assert.equal(controller.activeIndex, 1);
    assert.equal(controller.generation, 2);

    // a late 'canplay'/'playing' from the abandoned generation-1 source must not
    // flip us back to candidate[0] or otherwise touch state
    const commands = pushEvent(controller, 'playing', { generation: 1, currentTime: 999 });
    assert.deepEqual(commands, []);
    assert.equal(controller.activeIndex, 1);
    assert.equal(controller.confirmedTime, 130);
  });
});
