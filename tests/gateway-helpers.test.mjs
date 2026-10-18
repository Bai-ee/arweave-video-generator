import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from './helpers/load-core.mjs';

const UEPlayerCore = loadCore();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM'; // 43 chars, real UE mix txid

describe('RANGE_HOSTS', () => {
  test('is fllstck-first, frostor-second, and never includes raw arweave.net', () => {
    assert.deepEqual(UEPlayerCore.RANGE_HOSTS, [
      'https://arweave.fllstck.dev/',
      'https://frostor.xyz/'
    ]);
  });
});

describe('extractTxid', () => {
  test('extracts the txid path segment from a canonical arweave.net URL', () => {
    assert.equal(UEPlayerCore.extractTxid('https://arweave.net/' + TXID), TXID);
  });

  test('extracts the txid from a gateway URL with extra path/query', () => {
    assert.equal(UEPlayerCore.extractTxid('https://frostor.xyz/' + TXID + '?x=1'), TXID);
  });

  test('does not let a 43-char sandbox SUBDOMAIN win over the real path txid', () => {
    // sandbox subdomains are also 43 base32 chars; TXID_RE requires a
    // leading "/" so a bare subdomain segment must not match. Built to be
    // exactly 43 chars (same length as a real txid) and different from
    // TXID so a match against it, rather than the real path segment,
    // would be caught.
    const sandboxHost = TXID.slice(0, -1) + '9';
    assert.equal(sandboxHost.length, 43);
    assert.notEqual(sandboxHost, TXID);
    const url = 'https://' + sandboxHost + '.arweave.net/' + TXID + '/index.html';
    assert.equal(UEPlayerCore.extractTxid(url), TXID);
  });

  test('returns null when no txid-shaped path segment exists', () => {
    assert.equal(UEPlayerCore.extractTxid('https://example.com/not-a-txid'), null);
    assert.equal(UEPlayerCore.extractTxid(''), null);
    assert.equal(UEPlayerCore.extractTxid(undefined), null);
  });
});

describe('buildCandidates', () => {
  test('builds one candidate per RANGE_HOSTS entry, in order, never the raw URL', () => {
    const url = 'https://arweave.net/' + TXID;
    const candidates = UEPlayerCore.buildCandidates(url);
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].url, 'https://arweave.fllstck.dev/' + TXID);
    assert.equal(candidates[0].host, 'https://arweave.fllstck.dev/');
    assert.equal(candidates[1].url, 'https://frostor.xyz/' + TXID);
    assert.equal(candidates[1].host, 'https://frostor.xyz/');
    for (const c of candidates) {
      assert.notEqual(c.url, url);
      assert.ok(!c.url.includes('arweave.net'), 'candidate url must never be the raw arweave.net URL');
      assert.equal(c.rangeConfirmed, false);
      assert.equal(c.rangeRejected, false);
      assert.equal(c.failures, 0);
      assert.equal(c.tried, false);
      assert.equal(c.unhealthy, false);
    }
  });

  test('returns [] when no txid can be parsed from the url', () => {
    assert.deepEqual(UEPlayerCore.buildCandidates('https://example.com/nope'), []);
    assert.deepEqual(UEPlayerCore.buildCandidates(''), []);
  });

  test('a direct Firebase Storage mix URL is its own single candidate', () => {
    const url = UEPlayerCore.DIRECT_PREFIX + TXID;
    assert.equal(UEPlayerCore.isDirectUrl(url), true);
    assert.equal(UEPlayerCore.extractTxid(url), TXID);
    const candidates = UEPlayerCore.buildCandidates(url);
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].url, url);
    assert.equal(candidates[0].host, UEPlayerCore.DIRECT_PREFIX);
    assert.equal(candidates[0].rangeConfirmed, false);
  });

  test('other storage.googleapis.com URLs are not treated as direct mixes', () => {
    const other = 'https://storage.googleapis.com/some-other-bucket/website/mixes/' + TXID;
    assert.equal(UEPlayerCore.isDirectUrl(other), false);
    assert.equal(UEPlayerCore.isDirectUrl(UEPlayerCore.DIRECT_PREFIX + 'short'), false);
  });
});

describe('parseContentRange', () => {
  test('parses a coherent "bytes start-end/total" value', () => {
    assert.deepEqual(UEPlayerCore.parseContentRange('bytes 0-127/280171663'), {
      start: 0,
      end: 127,
      total: 280171663
    });
  });

  test('is case-insensitive on the "bytes" unit and tolerates surrounding whitespace', () => {
    assert.deepEqual(UEPlayerCore.parseContentRange('  Bytes 0-127/1000  '), {
      start: 0,
      end: 127,
      total: 1000
    });
  });

  test('rejects a non-string input', () => {
    assert.equal(UEPlayerCore.parseContentRange(undefined), null);
    assert.equal(UEPlayerCore.parseContentRange(null), null);
    assert.equal(UEPlayerCore.parseContentRange(42), null);
  });

  test('rejects the unsatisfiable-range wildcard form "bytes */100"', () => {
    assert.equal(UEPlayerCore.parseContentRange('bytes */100'), null);
  });

  test('rejects start > end', () => {
    assert.equal(UEPlayerCore.parseContentRange('bytes 200-100/1000'), null);
  });

  test('rejects total <= 0', () => {
    assert.equal(UEPlayerCore.parseContentRange('bytes 0-127/0'), null);
  });

  test('rejects a missing/garbled unit', () => {
    assert.equal(UEPlayerCore.parseContentRange('items 0-127/1000'), null);
    assert.equal(UEPlayerCore.parseContentRange('0-127/1000'), null);
    assert.equal(UEPlayerCore.parseContentRange('bytes 0-127'), null);
  });
});

describe('evaluateProbe', () => {
  test('accepts a 206 with a coherent Content-Range', () => {
    const result = UEPlayerCore.evaluateProbe({ status: 206, contentRange: 'bytes 0-127/280171663', acceptRanges: 'bytes' });
    assert.equal(result.rangeCapable, true);
  });

  test('rejects a 200 (raw arweave.net behavior on bundled items) even with a Content-Range-shaped header', () => {
    const result = UEPlayerCore.evaluateProbe({ status: 200, contentRange: 'bytes 0-127/280171663' });
    assert.equal(result.rangeCapable, false);
    assert.equal(result.reason, 'no-206');
  });

  test('rejects a 206 with a missing/incoherent Content-Range', () => {
    const result = UEPlayerCore.evaluateProbe({ status: 206, contentRange: undefined });
    assert.equal(result.rangeCapable, false);
    assert.equal(result.reason, 'bad-content-range');
  });

  test('rejects a 206 with an unsatisfiable-range Content-Range', () => {
    const result = UEPlayerCore.evaluateProbe({ status: 206, contentRange: 'bytes */100' });
    assert.equal(result.rangeCapable, false);
    assert.equal(result.reason, 'bad-content-range');
  });

  test('handles a missing/empty result object without throwing', () => {
    assert.deepEqual(UEPlayerCore.evaluateProbe(), { rangeCapable: false, reason: 'no-206' });
    assert.deepEqual(UEPlayerCore.evaluateProbe({}), { rangeCapable: false, reason: 'no-206' });
  });
});

describe('isTimeSeekable', () => {
  const ranges = [{ start: 0, end: 10 }, { start: 100, end: 200 }];

  test('true when the time is inside a seekable range', () => {
    assert.equal(UEPlayerCore.isTimeSeekable(ranges, 5, 0), true);
    assert.equal(UEPlayerCore.isTimeSeekable(ranges, 150, 0), true);
  });

  test('false when the time is outside every seekable range', () => {
    assert.equal(UEPlayerCore.isTimeSeekable(ranges, 50, 0), false);
  });

  test('tolerance extends the edges of a range', () => {
    assert.equal(UEPlayerCore.isTimeSeekable(ranges, 11, 0), false);
    assert.equal(UEPlayerCore.isTimeSeekable(ranges, 11, 2), true);
  });

  test('false when seekableRanges is not an array', () => {
    assert.equal(UEPlayerCore.isTimeSeekable(undefined, 5, 2), false);
    assert.equal(UEPlayerCore.isTimeSeekable(null, 5, 2), false);
  });

  test('false for an empty ranges array', () => {
    assert.equal(UEPlayerCore.isTimeSeekable([], 5, 2), false);
  });
});
