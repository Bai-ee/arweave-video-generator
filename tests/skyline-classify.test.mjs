import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMixImage, classifyArtistImage, isProtected, IMAGE_STATE } from '../lib/skyline/classify.js';

const ARTIST = { artistFilename: 'acidman', artistImageFilename: 'https://example.com/img/artists/acidman.jpg' };

describe('classifyMixImage', () => {
  test('empty value -> MISSING, eligible', () => {
    const r = classifyMixImage({ mix: { mixImageFilename: '' }, artist: ARTIST });
    assert.equal(r.state, IMAGE_STATE.MISSING);
    assert.equal(r.eligible, true);
    assert.equal(r.locked, false);
  });

  test('whitespace-only value -> MISSING', () => {
    const r = classifyMixImage({ mix: { mixImageFilename: '   ' }, artist: ARTIST });
    assert.equal(r.state, IMAGE_STATE.MISSING);
  });

  test('missing mixImageFilename key entirely -> MISSING', () => {
    const r = classifyMixImage({ mix: {}, artist: ARTIST });
    assert.equal(r.state, IMAGE_STATE.MISSING);
  });

  test('non-http(s) value -> INVALID, eligible (and reported)', () => {
    const r = classifyMixImage({ mix: { mixImageFilename: 'ftp://example.com/x.jpg' }, artist: ARTIST });
    assert.equal(r.state, IMAGE_STATE.INVALID);
    assert.equal(r.eligible, true);
  });

  test('relative path (no scheme) -> INVALID', () => {
    const r = classifyMixImage({ mix: { mixImageFilename: '/img/covers/foo.jpg' }, artist: ARTIST });
    assert.equal(r.state, IMAGE_STATE.INVALID);
  });

  test('equals artist.artistImageFilename -> LEGACY_ARTIST_IMAGE, eligible', () => {
    const r = classifyMixImage({
      mix: { mixImageFilename: ARTIST.artistImageFilename },
      artist: ARTIST
    });
    assert.equal(r.state, IMAGE_STATE.LEGACY_ARTIST_IMAGE);
    assert.equal(r.eligible, true);
  });

  test('path contains /img/artists/ (but not equal to artist image) -> LEGACY_ARTIST_PORTRAIT', () => {
    const r = classifyMixImage({
      mix: { mixImageFilename: 'https://example.com/img/artists/some-other-portrait.jpg' },
      artist: ARTIST
    });
    assert.equal(r.state, IMAGE_STATE.LEGACY_ARTIST_PORTRAIT);
    assert.equal(r.eligible, true);
  });

  test('distinct real cover art -> UPLOADED, NOT eligible (protected)', () => {
    const r = classifyMixImage({
      mix: { mixImageFilename: 'https://example.com/img/covers/real-cover.jpg' },
      artist: ARTIST
    });
    assert.equal(r.state, IMAGE_STATE.UPLOADED);
    assert.equal(r.eligible, false);
  });

  test('bare arweave TXID URL (distinct from artist image) -> UPLOADED, not eligible', () => {
    const r = classifyMixImage({
      mix: { mixImageFilename: 'https://arweave.net/someRealTxId1234567890' },
      artist: ARTIST
    });
    assert.equal(r.state, IMAGE_STATE.UPLOADED);
    assert.equal(r.eligible, false);
  });

  test('meta.origin generated-skyline -> GENERATED, eligible only for explicit regenerate (eligible:false in general classify)', () => {
    const r = classifyMixImage({
      mix: {
        mixImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/abc.webp',
        mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1, locked: false }
      },
      artist: ARTIST
    });
    assert.equal(r.state, IMAGE_STATE.GENERATED);
    assert.equal(r.eligible, false);
    assert.equal(r.locked, false);
  });

  test('meta.locked === true always wins regardless of value/origin, eligible always false', () => {
    const rUploaded = classifyMixImage({
      mix: { mixImageFilename: 'https://example.com/img/covers/x.jpg', mixImageMeta: { origin: 'uploaded', locked: true } },
      artist: ARTIST
    });
    assert.equal(rUploaded.state, IMAGE_STATE.UPLOADED);
    assert.equal(rUploaded.eligible, false);
    assert.equal(rUploaded.locked, true);

    const rGenerated = classifyMixImage({
      mix: { mixImageFilename: 'https://example.com/x.webp', mixImageMeta: { origin: 'generated-skyline', locked: true } },
      artist: ARTIST
    });
    assert.equal(rGenerated.state, IMAGE_STATE.GENERATED);
    assert.equal(rGenerated.eligible, false);
    assert.equal(rGenerated.locked, true);

    const rMissingButLocked = classifyMixImage({
      mix: { mixImageFilename: '', mixImageMeta: { origin: 'legacy', locked: true } },
      artist: ARTIST
    });
    assert.equal(rMissingButLocked.state, IMAGE_STATE.MISSING);
    assert.equal(rMissingButLocked.eligible, false);
    assert.equal(rMissingButLocked.locked, true);
  });
});

describe('classifyArtistImage', () => {
  test('only MISSING / INVALID are eligible; anything else is UPLOADED and protected', () => {
    assert.equal(classifyArtistImage({ artist: { artistImageFilename: '' } }).state, IMAGE_STATE.MISSING);
    assert.equal(classifyArtistImage({ artist: { artistImageFilename: '' } }).eligible, true);

    assert.equal(classifyArtistImage({ artist: { artistImageFilename: 'not-a-url' } }).state, IMAGE_STATE.INVALID);
    assert.equal(classifyArtistImage({ artist: { artistImageFilename: 'not-a-url' } }).eligible, true);

    const uploaded = classifyArtistImage({ artist: { artistImageFilename: 'https://example.com/img/artists/foo.jpg' } });
    assert.equal(uploaded.state, IMAGE_STATE.UPLOADED);
    assert.equal(uploaded.eligible, false);
  });

  test('meta.origin generated-skyline -> GENERATED, not eligible by default', () => {
    const r = classifyArtistImage({
      artist: { artistImageFilename: 'https://x/y.webp', artistImageMeta: { origin: 'generated-skyline' } }
    });
    assert.equal(r.state, IMAGE_STATE.GENERATED);
    assert.equal(r.eligible, false);
  });

  test('locked artist image is never eligible', () => {
    const r = classifyArtistImage({
      artist: { artistImageFilename: 'https://example.com/a.jpg', artistImageMeta: { locked: true } }
    });
    assert.equal(r.eligible, false);
    assert.equal(r.locked, true);
  });
});

describe('isProtected', () => {
  test('true for UPLOADED regardless of meta', () => {
    assert.equal(isProtected(IMAGE_STATE.UPLOADED, null), true);
    assert.equal(isProtected(IMAGE_STATE.UPLOADED, { locked: false }), true);
  });

  test('true whenever meta.locked === true, for any state', () => {
    assert.equal(isProtected(IMAGE_STATE.MISSING, { locked: true }), true);
    assert.equal(isProtected(IMAGE_STATE.GENERATED, { locked: true }), true);
    assert.equal(isProtected(IMAGE_STATE.LEGACY_ARTIST_IMAGE, { locked: true }), true);
  });

  test('false for GENERATED / MISSING / INVALID / legacy states without lock', () => {
    assert.equal(isProtected(IMAGE_STATE.GENERATED, null), false);
    assert.equal(isProtected(IMAGE_STATE.MISSING, null), false);
    assert.equal(isProtected(IMAGE_STATE.INVALID, null), false);
    assert.equal(isProtected(IMAGE_STATE.LEGACY_ARTIST_IMAGE, null), false);
    assert.equal(isProtected(IMAGE_STATE.LEGACY_ARTIST_PORTRAIT, null), false);
  });
});
