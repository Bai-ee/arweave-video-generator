// ue-resume.js -- save/clear decision logic (shouldSave, shouldSaveOnPause,
// isComplete, the min-position/end-guard thresholds) plus the pure link
// helpers (buildFallbackUrl, pageHasTxid). All deterministic: `now` and
// `lastSaveAt` are always passed in explicitly, nothing reads a real clock.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeResume } from './helpers/load-ue-resume.mjs';

const UEResume = loadUeResume();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const OTHER_TXID = 'Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM';

describe('shouldSave (throttled time-tick path)', () => {
  test('false while not playing, even past every threshold', () => {
    assert.equal(UEResume.shouldSave({ position: 60, duration: 600, playing: false, lastSaveAt: null, now: 1000 }), false);
  });

  test('false before the minimum resume position', () => {
    assert.equal(UEResume.shouldSave({ position: 29, duration: 600, playing: true, lastSaveAt: null, now: 1000 }), false);
  });

  test('true exactly at the minimum resume position', () => {
    assert.equal(UEResume.shouldSave({ position: UEResume.MIN_RESUME_POSITION_SEC, duration: 600, playing: true, lastSaveAt: null, now: 1000 }), true);
  });

  test('false inside the final END_GUARD_SEC of a known duration', () => {
    const duration = 300;
    const position = duration - UEResume.END_GUARD_SEC + 1; // just inside the guard band
    assert.equal(UEResume.shouldSave({ position, duration, playing: true, lastSaveAt: null, now: 1000 }), false);
  });

  test('true right at the edge of the end guard (not yet inside it)', () => {
    const duration = 300;
    const position = duration - UEResume.END_GUARD_SEC; // boundary itself is NOT "past" the guard
    assert.equal(UEResume.shouldSave({ position, duration, playing: true, lastSaveAt: null, now: 1000 }), true);
  });

  test('end guard does not apply when duration is unknown', () => {
    assert.equal(UEResume.shouldSave({ position: 100000, duration: null, playing: true, lastSaveAt: null, now: 1000 }), true);
  });

  test('a very short mix (< MIN + END_GUARD) never reaches a save window', () => {
    const duration = UEResume.MIN_RESUME_POSITION_SEC + UEResume.END_GUARD_SEC - 10;
    for (let position = 0; position <= duration; position += 5) {
      assert.equal(
        UEResume.shouldSave({ position, duration, playing: true, lastSaveAt: null, now: 1000 }),
        false,
        `position ${position} of a ${duration}s mix should never be saveable`
      );
    }
  });

  test('throttled: no save within SAVE_THROTTLE_MS of the last save', () => {
    const now = 100000;
    const lastSaveAt = now - (UEResume.SAVE_THROTTLE_MS - 1);
    assert.equal(UEResume.shouldSave({ position: 60, duration: 600, playing: true, lastSaveAt, now }), false);
  });

  test('allowed again exactly at the throttle boundary', () => {
    const now = 100000;
    const lastSaveAt = now - UEResume.SAVE_THROTTLE_MS;
    assert.equal(UEResume.shouldSave({ position: 60, duration: 600, playing: true, lastSaveAt, now }), true);
  });

  test('no throttle applied when there is no prior save', () => {
    assert.equal(UEResume.shouldSave({ position: 60, duration: 600, playing: true, lastSaveAt: null, now: 1000 }), true);
  });
});

describe('shouldSaveOnPause (immediate, unthrottled)', () => {
  test('does not require `playing: true` (pause means playback just stopped)', () => {
    assert.equal(UEResume.shouldSaveOnPause({ position: 60, duration: 600 }), true);
  });

  test('still respects the minimum position and end-guard thresholds', () => {
    assert.equal(UEResume.shouldSaveOnPause({ position: 10, duration: 600 }), false);
    assert.equal(UEResume.shouldSaveOnPause({ position: 590, duration: 600 }), false);
  });

  test('not subject to any throttle window', () => {
    // shouldSaveOnPause's signature carries no lastSaveAt/now at all --
    // asserting the two calls above are independently true/false already
    // demonstrates there is nothing to throttle against.
    assert.equal(UEResume.shouldSaveOnPause({ position: 60, duration: null }), true);
  });
});

describe('isComplete (natural-completion clear trigger)', () => {
  test('false with an unknown/invalid duration', () => {
    assert.equal(UEResume.isComplete(100, null), false);
    assert.equal(UEResume.isComplete(100, 0), false);
    assert.equal(UEResume.isComplete(100, NaN), false);
  });

  test('false well before the end', () => {
    assert.equal(UEResume.isComplete(100, 600), false);
  });

  test('true within COMPLETION_EPSILON_SEC of a known duration', () => {
    assert.equal(UEResume.isComplete(600 - UEResume.COMPLETION_EPSILON_SEC, 600), true);
    assert.equal(UEResume.isComplete(600, 600), true);
  });

  test('the completion window is tighter than the save end-guard, so there is a gap where neither saves nor clears', () => {
    const duration = 600;
    const midGapPosition = duration - 15; // inside END_GUARD_SEC(30) but outside COMPLETION_EPSILON_SEC(2)
    assert.equal(UEResume.withinEndGuard(midGapPosition, duration), true);
    assert.equal(UEResume.isComplete(midGapPosition, duration), false);
  });
});

describe('buildFallbackUrl', () => {
  test('appends ?mix=<txid> to a plain page path', () => {
    assert.equal(UEResume.buildFallbackUrl('/baiee.html', TXID), '/baiee.html?mix=' + TXID);
  });

  test('a page containing "?" is itself invalid (PAGE_RE forbids it), so it falls back to "/"', () => {
    // page is always a bare pathname (built from location.pathname, which
    // never carries a query) -- isValidPage rejects "?" outright, so
    // buildFallbackUrl's separator is always "?", never "&".
    assert.equal(UEResume.buildFallbackUrl('/baiee.html?ref=x', TXID), '/?mix=' + TXID);
  });

  test('falls back to "/" for an invalid/hostile page value rather than trusting it', () => {
    assert.equal(UEResume.buildFallbackUrl('javascript:alert(1)', TXID), '/?mix=' + TXID);
    assert.equal(UEResume.buildFallbackUrl(null, TXID), '/?mix=' + TXID);
  });

  test('URL-encodes the txid', () => {
    const weird = 'a b/c';
    assert.equal(UEResume.buildFallbackUrl('/baiee.html', weird), '/baiee.html?mix=' + encodeURIComponent(weird));
  });
});

describe('pageHasTxid', () => {
  const extractTxid = (href) => {
    const m = /\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/.exec(String(href || ''));
    return m ? m[1] : null;
  };

  test('true when one of the hrefs resolves to the target txid', () => {
    const hrefs = ['https://arweave.net/' + OTHER_TXID, 'https://arweave.fllstck.dev/' + TXID];
    assert.equal(UEResume.pageHasTxid(hrefs, TXID, extractTxid), true);
  });

  test('false when no href matches', () => {
    const hrefs = ['https://arweave.net/' + OTHER_TXID, '/about.html'];
    assert.equal(UEResume.pageHasTxid(hrefs, TXID, extractTxid), false);
  });

  test('false for a malformed txid, empty href list, or missing extractor', () => {
    assert.equal(UEResume.pageHasTxid(['https://arweave.net/' + TXID], 'not-a-txid', extractTxid), false);
    assert.equal(UEResume.pageHasTxid([], TXID, extractTxid), false);
    assert.equal(UEResume.pageHasTxid(['https://arweave.net/' + TXID], TXID, null), false);
  });

  test('a throwing extractTxid for one href does not abort the scan', () => {
    const flaky = (href) => {
      if (href === 'boom') throw new Error('nope');
      return extractTxid(href);
    };
    const hrefs = ['boom', 'https://arweave.net/' + TXID];
    assert.equal(UEResume.pageHasTxid(hrefs, TXID, flaky), true);
  });
});
