// lib/skyline/keys.js — pure key-derivation tests.
// Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.1.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractArweaveTxId,
  normalizeTitle,
  deriveMixKey,
  deriveArtistKey,
  deriveIdempotencyKey,
  seedFromKey
} from '../lib/skyline/keys.js';

describe('extractArweaveTxId', () => {
  test('extracts the txid from https://arweave.net/<txid>', () => {
    assert.equal(extractArweaveTxId('https://arweave.net/abc123XYZ'), 'abc123XYZ');
  });

  test('extracts the txid from https://<b32>.arweave.net/<txid>', () => {
    assert.equal(
      extractArweaveTxId('https://someb32gatewayhost.arweave.net/def456'),
      'def456'
    );
  });

  test('ignores query string and trailing slash', () => {
    assert.equal(extractArweaveTxId('https://arweave.net/abc123?ext=mp3'), 'abc123');
    assert.equal(extractArweaveTxId('https://arweave.net/abc123/'), 'abc123');
  });

  test('returns "" for empty/missing input', () => {
    assert.equal(extractArweaveTxId(''), '');
    assert.equal(extractArweaveTxId(null), '');
    assert.equal(extractArweaveTxId(undefined), '');
  });

  test('returns "" for an unparseable URL', () => {
    assert.equal(extractArweaveTxId('not a url at all'), '');
  });

  test('returns "" for a URL with no path segment', () => {
    assert.equal(extractArweaveTxId('https://arweave.net'), '');
    assert.equal(extractArweaveTxId('https://arweave.net/'), '');
  });
});

describe('normalizeTitle', () => {
  test('lowercases, strips non-alnum, collapses whitespace', () => {
    assert.equal(normalizeTitle('  My MIX -- Vol. 2!!  '), 'my mix vol 2');
  });

  test('handles empty/missing input', () => {
    assert.equal(normalizeTitle(''), '');
    assert.equal(normalizeTitle(null), '');
    assert.equal(normalizeTitle(undefined), '');
  });

  test('collapses internal multi-space/tab/newline runs', () => {
    assert.equal(normalizeTitle('foo   \t\n  bar'), 'foo bar');
  });
});

describe('deriveMixKey', () => {
  const base = {
    artistFilename: 'dj-example',
    mixArweaveURL: 'https://arweave.net/tx-abc',
    mixTitle: 'Summer Set 2024'
  };

  test('is deterministic for identical inputs', () => {
    assert.equal(deriveMixKey(base), deriveMixKey({ ...base }));
  });

  test('returns 16 lowercase hex chars', () => {
    const key = deriveMixKey(base);
    assert.match(key, /^[0-9a-f]{16}$/);
  });

  test('differs when the arweave txid differs', () => {
    const other = { ...base, mixArweaveURL: 'https://arweave.net/tx-different' };
    assert.notEqual(deriveMixKey(base), deriveMixKey(other));
  });

  test('differs when the artist differs', () => {
    const other = { ...base, artistFilename: 'someone-else' };
    assert.notEqual(deriveMixKey(base), deriveMixKey(other));
  });

  test('title normalization means cosmetic title differences do not change the key when txid+artist match', () => {
    const other = { ...base, mixTitle: 'summer   set 2024!!!' };
    assert.equal(deriveMixKey(base), deriveMixKey(other));
  });

  test('never incorporates array index or current date (two calls a tick apart match)', async () => {
    const a = deriveMixKey(base);
    await new Promise((r) => setTimeout(r, 5));
    const b = deriveMixKey(base);
    assert.equal(a, b);
  });
});

describe('deriveArtistKey', () => {
  test('is deterministic and 16 hex chars', () => {
    const key = deriveArtistKey({ artistFilename: 'dj-example' });
    assert.match(key, /^[0-9a-f]{16}$/);
    assert.equal(key, deriveArtistKey({ artistFilename: 'dj-example' }));
  });

  test('differs for different artistFilename', () => {
    assert.notEqual(
      deriveArtistKey({ artistFilename: 'dj-example' }),
      deriveArtistKey({ artistFilename: 'dj-other' })
    );
  });

  test('mix and artist keys never collide for the same filename (different hash domains)', () => {
    const artistKey = deriveArtistKey({ artistFilename: 'dj-example' });
    const mixKey = deriveMixKey({
      artistFilename: 'dj-example',
      mixArweaveURL: '',
      mixTitle: ''
    });
    assert.notEqual(artistKey, mixKey);
  });
});

describe('deriveIdempotencyKey', () => {
  test('formats as entityType:stableKey:vN', () => {
    assert.equal(
      deriveIdempotencyKey({ entityType: 'mix', stableKey: 'abcd1234abcd1234', assignmentVersion: 3 }),
      'mix:abcd1234abcd1234:v3'
    );
  });
});

describe('seedFromKey', () => {
  const params = { entityType: 'mix', stableKey: 'abcd1234abcd1234', assignmentVersion: 1 };

  test('is deterministic', () => {
    assert.equal(seedFromKey(params), seedFromKey({ ...params }));
  });

  test('returns an unsigned 32-bit integer', () => {
    const seed = seedFromKey(params);
    assert.ok(Number.isInteger(seed));
    assert.ok(seed >= 0);
    assert.ok(seed <= 0xffffffff);
  });

  test('differs when assignmentVersion changes (regeneration picks a different seed)', () => {
    assert.notEqual(seedFromKey(params), seedFromKey({ ...params, assignmentVersion: 2 }));
  });

  test('differs when entityType changes (mix vs artist for the same stableKey)', () => {
    assert.notEqual(seedFromKey(params), seedFromKey({ ...params, entityType: 'artist' }));
  });

  test('differs when stableKey changes', () => {
    assert.notEqual(seedFromKey(params), seedFromKey({ ...params, stableKey: 'ffff0000ffff0000' }));
  });
});
