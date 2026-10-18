import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildImageMeta,
  applyMixAssignment,
  applyArtistAssignment,
  restoreMixAssignment,
  restoreArtistAssignment
} from '../lib/skyline/records.js';

const GENERATED_META = {
  origin: 'generated-skyline',
  assignmentVersion: 1,
  sourceVideoId: 'skyline-0001',
  sourceTimeSec: 12.4,
  candidateId: 'skyline-0001@12.40',
  dHash: 'abcd1234abcd1234',
  generatedAt: '2026-09-08T00:00:00.000Z',
  contentHash: 'deadbeef',
  storagePath: 'website/generated-thumbnails/v1/mix/abc123-v1.webp',
  width: 960,
  height: 960,
  bytes: 45000,
  locked: false,
  serviceVersion: 1
};

describe('buildImageMeta', () => {
  test('normalizes a full generatedMeta object', () => {
    const meta = buildImageMeta({ generatedMeta: GENERATED_META });
    assert.equal(meta.origin, 'generated-skyline');
    assert.equal(meta.assignmentVersion, 1);
    assert.equal(meta.sourceVideoId, 'skyline-0001');
    assert.equal(meta.sourceTimeSec, 12.4);
    assert.equal(meta.candidateId, 'skyline-0001@12.40');
    assert.equal(meta.dHash, 'abcd1234abcd1234');
    assert.equal(meta.contentHash, 'deadbeef');
    assert.equal(meta.locked, false);
    assert.equal(meta.serviceVersion, 1);
  });

  test('never mutates the generatedMeta input', () => {
    const input = { ...GENERATED_META };
    const frozenCopy = JSON.stringify(input);
    buildImageMeta({ generatedMeta: input });
    assert.equal(JSON.stringify(input), frozenCopy);
  });

  test('throws without a generatedMeta object', () => {
    assert.throws(() => buildImageMeta({}), /generatedMeta/);
    assert.throws(() => buildImageMeta(), /generatedMeta/);
  });

  test('defaults missing optional numeric fields to null rather than undefined', () => {
    const meta = buildImageMeta({ generatedMeta: { origin: 'generated-skyline', assignmentVersion: 1 } });
    assert.equal(meta.sourceTimeSec, null);
    assert.equal(meta.width, null);
    assert.equal(meta.height, null);
    assert.equal(meta.bytes, null);
  });
});

describe('applyMixAssignment', () => {
  function freshArtist() {
    return {
      artistFilename: 'acidman',
      artistName: 'Acidman',
      artistImageFilename: 'https://example.com/img/artists/acidman.jpg',
      mixes: [
        { mixTitle: 'Mix One', mixArweaveURL: 'https://arweave.net/tx1', mixImageFilename: '' },
        { mixTitle: 'Mix Two', mixArweaveURL: 'https://arweave.net/tx2', mixImageFilename: 'https://example.com/img/covers/real.jpg' }
      ]
    };
  }

  test('assigns imageUrl + meta on an eligible (MISSING) mix and returns a NEW artist object', () => {
    const artist = freshArtist();
    const result = applyMixAssignment({ artist, mixIndex: 0, imageUrl: 'https://cdn/x.webp', meta: buildImageMeta({ generatedMeta: GENERATED_META }) });
    assert.equal(result.changed, true);
    assert.notEqual(result.artist, artist, 'must return a new artist object');
    assert.equal(result.artist.mixes[0].mixImageFilename, 'https://cdn/x.webp');
    assert.equal(result.artist.mixes[0].mixImageMeta.origin, 'generated-skyline');
    // original untouched
    assert.equal(artist.mixes[0].mixImageFilename, '');
    assert.equal(artist.mixes[0].mixImageMeta, undefined);
  });

  test('sets previousMixImageFilename on the FIRST generated overwrite, capturing the prior live value', () => {
    const artist = freshArtist();
    const result = applyMixAssignment({ artist, mixIndex: 0, imageUrl: 'https://cdn/x.webp', meta: buildImageMeta({ generatedMeta: GENERATED_META }) });
    assert.equal(result.artist.mixes[0].previousMixImageFilename, '');
  });

  test('never clobbers an already-stored previousMixImageFilename on a second overwrite (regenerate)', () => {
    const artist = freshArtist();
    artist.mixes[0] = {
      ...artist.mixes[0],
      mixImageFilename: 'https://cdn/v1.webp',
      mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1, locked: false },
      previousMixImageFilename: 'ORIGINAL-VALUE'
    };
    const result = applyMixAssignment({
      artist,
      mixIndex: 0,
      imageUrl: 'https://cdn/v2.webp',
      meta: buildImageMeta({ generatedMeta: { ...GENERATED_META, assignmentVersion: 2 } })
    });
    assert.equal(result.changed, true);
    assert.equal(result.artist.mixes[0].previousMixImageFilename, 'ORIGINAL-VALUE');
    assert.equal(result.artist.mixes[0].mixImageFilename, 'https://cdn/v2.webp');
  });

  test('refuses to overwrite a protected (UPLOADED) mix -- changed:false, skipped:"protected", artist unchanged', () => {
    const artist = freshArtist();
    const result = applyMixAssignment({ artist, mixIndex: 1, imageUrl: 'https://cdn/x.webp', meta: buildImageMeta({ generatedMeta: GENERATED_META }) });
    assert.equal(result.changed, false);
    assert.equal(result.skipped, 'protected');
    assert.equal(result.artist, artist);
    assert.equal(artist.mixes[1].mixImageFilename, 'https://example.com/img/covers/real.jpg');
  });

  test('refuses to overwrite a locked mix even if state would otherwise be eligible', () => {
    const artist = freshArtist();
    artist.mixes[0] = { ...artist.mixes[0], mixImageMeta: { locked: true } };
    const result = applyMixAssignment({ artist, mixIndex: 0, imageUrl: 'https://cdn/x.webp', meta: buildImageMeta({ generatedMeta: GENERATED_META }) });
    assert.equal(result.changed, false);
    assert.equal(result.skipped, 'protected');
  });

  test('throws on invalid mixIndex', () => {
    const artist = freshArtist();
    assert.throws(() => applyMixAssignment({ artist, mixIndex: 99, imageUrl: 'x', meta: buildImageMeta({ generatedMeta: GENERATED_META }) }));
    assert.throws(() => applyMixAssignment({ artist, mixIndex: -1, imageUrl: 'x', meta: buildImageMeta({ generatedMeta: GENERATED_META }) }));
  });
});

describe('applyArtistAssignment', () => {
  function freshArtist() {
    return { artistFilename: 'acidman', artistName: 'Acidman', artistImageFilename: '' };
  }

  test('assigns on a MISSING artist image, returns new object, sets previousArtistImageFilename', () => {
    const artist = freshArtist();
    const result = applyArtistAssignment({ artist, imageUrl: 'https://cdn/artist.webp', meta: buildImageMeta({ generatedMeta: GENERATED_META }) });
    assert.equal(result.changed, true);
    assert.notEqual(result.artist, artist);
    assert.equal(result.artist.artistImageFilename, 'https://cdn/artist.webp');
    assert.equal(result.artist.previousArtistImageFilename, '');
    assert.equal(artist.artistImageFilename, '');
  });

  test('refuses a protected (UPLOADED) artist image', () => {
    const artist = { ...freshArtist(), artistImageFilename: 'https://example.com/uploaded.jpg' };
    const result = applyArtistAssignment({ artist, imageUrl: 'https://cdn/x.webp', meta: buildImageMeta({ generatedMeta: GENERATED_META }) });
    assert.equal(result.changed, false);
    assert.equal(result.skipped, 'protected');
    assert.equal(result.artist, artist);
  });
});

describe('restoreMixAssignment', () => {
  test('restores previous* -> live fields and clears meta/previous markers', () => {
    const artist = {
      artistFilename: 'acidman',
      mixes: [
        {
          mixTitle: 'Mix One',
          mixImageFilename: 'https://cdn/generated.webp',
          mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1 },
          previousMixImageFilename: 'https://original.example.com/old.jpg'
        }
      ]
    };
    const result = restoreMixAssignment({ artist, mixIndex: 0 });
    assert.equal(result.changed, true);
    assert.equal(result.artist.mixes[0].mixImageFilename, 'https://original.example.com/old.jpg');
    assert.equal(result.artist.mixes[0].mixImageMeta, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(result.artist.mixes[0], 'previousMixImageFilename'), false);
    // original untouched
    assert.equal(artist.mixes[0].mixImageFilename, 'https://cdn/generated.webp');
  });

  test('no-op when there is nothing to restore', () => {
    const artist = { artistFilename: 'acidman', mixes: [{ mixTitle: 'Mix One', mixImageFilename: '' }] };
    const result = restoreMixAssignment({ artist, mixIndex: 0 });
    assert.equal(result.changed, false);
    assert.equal(result.skipped, 'no-previous-assignment');
    assert.equal(result.artist, artist);
  });
});

describe('restoreArtistAssignment', () => {
  test('restores previousArtistImageFilename -> artistImageFilename and clears markers', () => {
    const artist = {
      artistFilename: 'acidman',
      artistImageFilename: 'https://cdn/generated.webp',
      artistImageMeta: { origin: 'generated-skyline' },
      previousArtistImageFilename: 'https://original.example.com/old.jpg'
    };
    const result = restoreArtistAssignment({ artist });
    assert.equal(result.changed, true);
    assert.equal(result.artist.artistImageFilename, 'https://original.example.com/old.jpg');
    assert.equal(result.artist.artistImageMeta, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(result.artist, 'previousArtistImageFilename'), false);
  });

  test('no-op when nothing to restore', () => {
    const artist = { artistFilename: 'acidman', artistImageFilename: '' };
    const result = restoreArtistAssignment({ artist });
    assert.equal(result.changed, false);
    assert.equal(result.skipped, 'no-previous-assignment');
  });
});
