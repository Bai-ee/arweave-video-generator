// Pure-logic tests for website/js/ue-links.js: query parsing/validation,
// URL building, time formatting, and the anchor-match lookup. No DOM
// involved -- loadUeLinks() runs the module against a bare fake `window`
// (no document) purely to reach the exported namespace; see
// tests/helpers/load-ue-links.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeLinks, makeUEEnvironment } from './helpers/load-ue-links.mjs';

const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const OTHER_TXID = 'AbCdEfGh12345678901234567890123456789012Axy';

function loadPure() {
  // A bare window with no document: exercises the "loads/behaves under
  // node:vm with no window.document, no navigator" guarantee while we're
  // at it, since every pure-helper test below runs against this loader.
  return loadUeLinks({ window: {} });
}

describe('module loads safely with a minimal window', () => {
  test('no throw with no window.document/navigator, and the pure API is present', () => {
    const UELinks = loadPure();
    assert.equal(typeof UELinks.parseDeepLinkQuery, 'function');
    assert.equal(typeof UELinks.buildShareUrl, 'function');
    assert.equal(typeof UELinks.formatShareTime, 'function');
    assert.equal(typeof UELinks.findMatchingIndex, 'function');
    assert.equal(typeof UELinks.runShareFlow, 'function');
    assert.equal(typeof UELinks.isValidTxid, 'function');
  });

  test('module also loads with window entirely absent from the realm', () => {
    assert.doesNotThrow(() => loadUeLinks(null));
  });
});

describe('isValidTxid', () => {
  const UELinks = loadPure();
  test('accepts a real 43-char [A-Za-z0-9_-] txid', () => {
    assert.equal(UELinks.isValidTxid(TXID), true);
  });
  test('rejects wrong length, non-string, and disallowed characters', () => {
    assert.equal(UELinks.isValidTxid(TXID.slice(0, 42)), false);
    assert.equal(UELinks.isValidTxid(TXID + 'x'), false);
    assert.equal(UELinks.isValidTxid(''), false);
    assert.equal(UELinks.isValidTxid(null), false);
    assert.equal(UELinks.isValidTxid(undefined), false);
    assert.equal(UELinks.isValidTxid(12345), false);
    assert.equal(UELinks.isValidTxid('x'.repeat(42) + '/'), false);
    assert.equal(UELinks.isValidTxid('x'.repeat(42) + ' '), false);
  });
});

describe('parseDeepLinkQuery', () => {
  const UELinks = loadPure();

  test('valid mix, no t', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID), { mix: TXID, t: null });
  });

  test('valid mix + valid integer t', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=754'), { mix: TXID, t: 754 });
  });

  test('works without a leading "?"', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('mix=' + TXID + '&t=5'), { mix: TXID, t: 5 });
  });

  test('missing query entirely', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery(''), { mix: null, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery(undefined), { mix: null, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery(null), { mix: null, t: null });
  });

  test('missing mix, unrelated params only', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?uedebug=1'), { mix: null, t: null });
  });

  test('malformed/hostile mix values never throw and yield null', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=not-a-real-txid'), { mix: null, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix='), { mix: null, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '<script>'), { mix: null, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery('%%%not even a query%%%'), { mix: null, t: null });
  });

  test('"array-style" repeated mix param is rejected as ambiguous', () => {
    assert.deepEqual(
      UELinks.parseDeepLinkQuery('?mix=' + TXID + '&mix=' + OTHER_TXID),
      { mix: null, t: null }
    );
  });

  test('t: NaN/garbage text is rejected, mix still parses', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=abc'), { mix: TXID, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=NaN'), { mix: TXID, t: null });
  });

  test('t: negative is rejected', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=-5'), { mix: TXID, t: null });
  });

  test('t: absurdly large (1e9 scientific, and literal digits) is rejected', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=1e9'), { mix: TXID, t: null });
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=1000000000'), { mix: TXID, t: null });
  });

  test('t: fractional seconds are floored (integer-ish, clamped)', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=12.9'), { mix: TXID, t: 12 });
  });

  test('t: "array-style" repeated t param is rejected as ambiguous', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=1&t=2'), { mix: TXID, t: null });
  });

  test('t: PHP-style bracket repeats (?t[]=1&t[]=2) never match the literal "t" key', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t[]=1&t[]=2'), { mix: TXID, t: null });
  });

  test('t=0 parses to 0 (a real, if trivial, timestamp)', () => {
    assert.deepEqual(UELinks.parseDeepLinkQuery('?mix=' + TXID + '&t=0'), { mix: TXID, t: 0 });
  });

  test('unrelated extra params never affect the result', () => {
    assert.deepEqual(
      UELinks.parseDeepLinkQuery('?uedebug=1&mix=' + TXID + '&t=45&utm_source=x'),
      { mix: TXID, t: 45 }
    );
  });
});

describe('formatShareTime', () => {
  const UELinks = loadPure();
  test('754 seconds -> 12:34', () => {
    assert.equal(UELinks.formatShareTime(754), '12:34');
  });
  test('0 -> 0:00', () => {
    assert.equal(UELinks.formatShareTime(0), '0:00');
  });
  test('under a minute pads seconds', () => {
    assert.equal(UELinks.formatShareTime(7), '0:07');
  });
  test('past an hour uses h:mm:ss', () => {
    assert.equal(UELinks.formatShareTime(3661), '1:01:01');
  });
  test('invalid input clamps to 0:00', () => {
    assert.equal(UELinks.formatShareTime(-5), '0:00');
    assert.equal(UELinks.formatShareTime(NaN), '0:00');
    assert.equal(UELinks.formatShareTime('12'), '0:00');
    assert.equal(UELinks.formatShareTime(undefined), '0:00');
  });
});

describe('buildShareUrl', () => {
  const UELinks = loadPure();

  test('mix only, no existing query', () => {
    const url = UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: TXID });
    assert.equal(url, '/baiee.html?mix=' + TXID);
  });

  test('mix + t', () => {
    const url = UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: TXID, t: 754 });
    assert.equal(url, '/baiee.html?mix=' + TXID + '&t=754');
  });

  test('drops t when not sharing a timestamp (absent, zero, or negative)', () => {
    assert.equal(UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: TXID }), '/baiee.html?mix=' + TXID);
    assert.equal(UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: TXID, t: 0 }), '/baiee.html?mix=' + TXID);
    assert.equal(UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: TXID, t: -10 }), '/baiee.html?mix=' + TXID);
  });

  test('preserves an unrelated existing param (e.g. uedebug)', () => {
    const url = UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '?uedebug=1', txid: TXID, t: 45 });
    assert.match(url, /^\/baiee\.html\?/);
    const qs = url.split('?')[1];
    const params = new URLSearchParams(qs);
    assert.equal(params.get('uedebug'), '1');
    assert.equal(params.get('mix'), TXID);
    assert.equal(params.get('t'), '45');
  });

  test('rewrites a pre-existing mix/t rather than duplicating the keys', () => {
    const url = UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '?mix=' + OTHER_TXID + '&t=9', txid: TXID, t: 20 });
    const params = new URLSearchParams(url.split('?')[1]);
    assert.deepEqual(params.getAll('mix'), [TXID]);
    assert.deepEqual(params.getAll('t'), ['20']);
  });

  test('preserves the page path exactly, including nested/artist paths', () => {
    assert.equal(
      UELinks.buildShareUrl({ pagePath: '/archive.html', search: '', txid: TXID }),
      '/archive.html?mix=' + TXID
    );
    assert.equal(
      UELinks.buildShareUrl({ pagePath: 'baiee.html', search: '', txid: TXID }),
      'baiee.html?mix=' + TXID
    );
  });

  test('clamps an absurd t at build time instead of emitting it verbatim', () => {
    const url = UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: TXID, t: 50_000_000 });
    const params = new URLSearchParams(url.split('?')[1]);
    assert.equal(params.get('t'), String(UELinks.MAX_SHARE_TIME_SECONDS));
  });

  test('returns null without a valid txid or pagePath', () => {
    assert.equal(UELinks.buildShareUrl({ pagePath: '/baiee.html', search: '', txid: 'not-valid' }), null);
    assert.equal(UELinks.buildShareUrl({ pagePath: '', search: '', txid: TXID }), null);
    assert.equal(UELinks.buildShareUrl({}), null);
  });
});

describe('findMatchingIndex', () => {
  const UELinks = loadPure();
  const extractTxidFn = (href) => {
    const m = /([A-Za-z0-9_-]{43})/.exec(String(href || ''));
    return m ? m[1] : null;
  };

  test('finds the matching href among several', () => {
    const hrefs = [
      'https://arweave.net/' + OTHER_TXID,
      'https://arweave.net/' + TXID,
      'https://arweave.net/' + OTHER_TXID
    ];
    assert.equal(UELinks.findMatchingIndex(hrefs, TXID, extractTxidFn), 1);
  });

  test('returns -1 when nothing matches', () => {
    const hrefs = ['https://arweave.net/' + OTHER_TXID];
    assert.equal(UELinks.findMatchingIndex(hrefs, TXID, extractTxidFn), -1);
  });

  test('returns -1 for invalid target txid, non-array hrefs, or a missing extractor', () => {
    assert.equal(UELinks.findMatchingIndex(['x'], 'not-valid', extractTxidFn), -1);
    assert.equal(UELinks.findMatchingIndex(null, TXID, extractTxidFn), -1);
    assert.equal(UELinks.findMatchingIndex(['x'], TXID, null), -1);
  });

  test('a throwing extractTxidFn degrades to no-match rather than propagating', () => {
    const hrefs = ['https://arweave.net/' + TXID];
    const throwing = () => { throw new Error('boom'); };
    assert.equal(UELinks.findMatchingIndex(hrefs, TXID, throwing), -1);
  });
});
