import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';
import { makeClock, pushEvent, firstCommandOfType } from './helpers/fake-media.mjs';

const UEPlayerCore = loadCore();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const ORIGINAL_URL = 'https://arweave.net/' + TXID;

function build(options) {
  const candidates = UEPlayerCore.buildCandidates(ORIGINAL_URL);
  const clock = makeClock(0);
  const controller = UEPlayerCore.createPlaybackController(Object.assign(
    { candidates, now: clock.now, stallGraceMs: 20000, maxRecoveriesPerCandidate: 1 },
    options || {}
  ));
  return { candidates, clock, controller };
}

describe('tick() watchdog — must not recover healthy-but-slow buffering', () => {
  test('does nothing while currentTime is still advancing, however long the session runs', () => {
    const { controller, clock } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 0, readyState: 3 });

    clock.advance(19000);
    pushEvent(controller, 'timeupdate', { generation: controller.generation, currentTime: 19, readyState: 3 });

    clock.advance(19000); // 19s since the last real progress — under the 20s grace window
    const commands = controller.tick(clock.now());

    assert.deepEqual(commands, []);
    assert.equal(controller.state, 'playing');
    assert.equal(controller.activeIndex, 0);
  });

  test('does nothing when readyState stays >= HAVE_FUTURE_DATA and no waiting/stalled was ever seen, even with currentTime frozen', () => {
    const { controller, clock } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 100, readyState: 4 });

    clock.advance(30000); // well past stallGraceMs, currentTime never updates again
    const commands = controller.tick(clock.now());

    assert.deepEqual(commands, [], 'a merely-quiet-but-healthy stream must not be reloaded');
    assert.equal(controller.state, 'playing');
  });

  test('does nothing when readyState/waiting-stalled are simply unknown (never reported) — no false positive from silence alone', () => {
    const { controller, clock } = build();
    controller.requestPlay();
    // no readyState ever supplied
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 100, readyState: undefined });

    clock.advance(30000);
    const commands = controller.tick(clock.now());

    assert.deepEqual(commands, []);
  });
});

describe('tick() watchdog — must recover a genuine stall, bounded per candidate', () => {
  test('recovers once wantPlay, no progress past stallGraceMs, a waiting/stalled was seen, and readyState < HAVE_FUTURE_DATA', () => {
    const { candidates, controller, clock } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 50, readyState: 4 });
    pushEvent(controller, 'waiting', { generation: controller.generation, readyState: 1 });

    clock.advance(20000);
    const commands = controller.tick(clock.now());

    const setSrc = firstCommandOfType(commands, 'setSrc');
    assert.ok(setSrc, 'a genuine stall must trigger a reconnect');
    assert.equal(setSrc.url, candidates[0].url, 'recovery reconnects the SAME candidate first');
    assert.equal(setSrc.resumeTime, 50, 'resumes from confirmedTime');
    assert.equal(controller.activeIndex, 0);
  });

  test('a second genuine stall on the same candidate does not reconnect it again — it fails over instead (budget = 1)', () => {
    const { candidates, controller, clock } = build();
    controller.requestPlay();
    pushEvent(controller, 'playing', { generation: controller.generation, currentTime: 50, readyState: 4 });
    pushEvent(controller, 'waiting', { generation: controller.generation, readyState: 1 });
    clock.advance(20000);
    controller.tick(clock.now()); // first recovery consumes candidate[0]'s budget

    // acknowledge the resume landed, so we're back in a clean 'playing' state
    pushEvent(controller, 'seeked', {
      generation: controller.generation,
      currentTime: 51,
      seekableRanges: [{ start: 0, end: 9999 }]
    });
    assert.equal(controller.state, 'playing');

    pushEvent(controller, 'waiting', { generation: controller.generation, readyState: 1 });
    clock.advance(20000);
    const commands = controller.tick(clock.now());

    const setSrc = firstCommandOfType(commands, 'setSrc');
    assert.ok(setSrc);
    assert.equal(setSrc.url, candidates[1].url, 'candidate[0]\'s recovery budget is spent — must move to candidate[1]');
    assert.equal(controller.activeIndex, 1);
  });
});
