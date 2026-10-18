// Workstream D — lib/WebsiteSync.js skyline-thumbnail-metadata passthrough.
// Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.14.
//
// Covers:
//   1. Byte-identity: a record with no skyline metadata serializes exactly
//      as it did before this change (golden fixture captured by running the
//      pre-edit code — see tests/fixtures/website-sync-nometa-*.json).
//   2. Forward sync (Firebase -> website JSON) passes through
//      artistImageMeta / previousArtistImageFilename / mixImageMeta /
//      previousMixImageFilename only when present.
//   3. Reverse sync (website JSON -> Firebase) preserves those same fields
//      instead of dropping them under {merge:false} (the data-loss risk
//      called out in the contract).
//   4. Full round trip (Firebase -> JSON -> Firebase) loses no metadata.
//   5. The existing mixImageFilename fallback
//      (mix.mixImageFilename || artist.artistImageFilename) is untouched.
//
// No credentials needed: `db` is an in-memory Firestore double (both
// functions take `db` as a parameter). All output goes to a fresh temp dir
// per test — never website/.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  syncFirebaseToWebsiteJSON,
  syncWebsiteJSONToFirebase
} from '../lib/WebsiteSync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Minimal Firestore double covering exactly what WebsiteSync.js calls:
 *  db.collection('system').doc('artists').get() / .set(data, opts). */
function makeFirestoreDouble(initialArtists) {
  let stored = { artists: initialArtists };
  const calls = { sets: [] };
  const db = {
    collection(collectionName) {
      assert.equal(collectionName, 'system');
      return {
        doc(docId) {
          assert.equal(docId, 'artists');
          return {
            async get() {
              return {
                exists: stored !== null,
                data: () => stored
              };
            },
            async set(data, opts) {
              calls.sets.push({ data, opts });
              stored = data;
            }
          };
        }
      };
    }
  };
  return { db, calls, getStored: () => stored };
}

test('syncFirebaseToWebsiteJSON: byte-identical output for records with no skyline metadata', async () => {
  const inputPath = path.join(__dirname, 'fixtures', 'website-sync-nometa-input.json');
  const goldenPath = path.join(__dirname, 'fixtures', 'website-sync-nometa-golden.json');
  const fixtureArtists = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const golden = fs.readFileSync(goldenPath); // Buffer — compare raw bytes

  const { db } = makeFirestoreDouble(fixtureArtists);
  const outDir = mkTempDir('ws-sync-nometa-');

  const result = await syncFirebaseToWebsiteJSON(db, outDir);
  assert.equal(result.success, true);

  const actual = fs.readFileSync(result.filePath); // Buffer
  assert.equal(actual.length, golden.length, 'byte length must match the pre-change golden fixture exactly');
  assert.ok(actual.equals(golden), 'output must be byte-identical to the pre-change golden fixture (baseline captured by running the unmodified code — see fixture header in this file)');
});

test('syncFirebaseToWebsiteJSON: keeps the existing mixImageFilename fallback exactly as-is', async () => {
  const artists = [
    {
      artistName: 'Fallback Artist',
      artistFilename: 'fallback-artist.html',
      artistImageFilename: 'https://arweave.net/artist-img',
      artistGenre: 'house',
      mixes: [
        { mixTitle: 'No Own Image', mixArweaveURL: 'https://arweave.net/tx1', mixDateYear: '2024', mixDuration: '60:00', mixImageFilename: '' },
        { mixTitle: 'Own Image', mixArweaveURL: 'https://arweave.net/tx2', mixDateYear: '2024', mixDuration: '60:00', mixImageFilename: 'https://arweave.net/mix-own-img' }
      ]
    }
  ];
  const { db } = makeFirestoreDouble(artists);
  const outDir = mkTempDir('ws-sync-fallback-');
  const result = await syncFirebaseToWebsiteJSON(db, outDir);
  const written = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));

  assert.equal(written[0].mixes[0].mixImageFilename, 'https://arweave.net/artist-img', 'empty mix image falls back to artist image');
  assert.equal(written[0].mixes[1].mixImageFilename, 'https://arweave.net/mix-own-img', 'mix image wins when present');
});

test('syncFirebaseToWebsiteJSON: passes through skyline metadata only when present', async () => {
  const artists = [
    {
      artistName: 'Generated Artist',
      artistFilename: 'generated-artist.html',
      artistImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/artist/abc123-v1.webp',
      artistGenre: 'house',
      artistImageMeta: {
        origin: 'generated-skyline',
        assignmentVersion: 1,
        sourceVideoId: 'skyline-0001',
        sourceTimeSec: 12.4,
        generatedAt: '2026-09-01T00:00:00.000Z',
        contentHash: 'deadbeef',
        width: 960,
        height: 960,
        locked: false
      },
      mixes: [
        {
          mixTitle: 'Generated Mix',
          mixArweaveURL: 'https://arweave.net/tx1',
          mixDateYear: '2024',
          mixDuration: '60:00',
          mixImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/def456-v1.webp',
          mixImageMeta: {
            origin: 'generated-skyline',
            assignmentVersion: 1,
            sourceVideoId: 'skyline-0002',
            sourceTimeSec: 27.8,
            generatedAt: '2026-09-01T00:00:00.000Z',
            contentHash: 'cafef00d',
            width: 960,
            height: 960,
            locked: false
          },
          previousMixImageFilename: 'https://arweave.net/u0XiFVSL/img/artists/generated-artist.jpg'
        },
        {
          // No metadata at all — must not gain any new keys.
          mixTitle: 'Plain Mix',
          mixArweaveURL: 'https://arweave.net/tx2',
          mixDateYear: '2024',
          mixDuration: '60:00',
          mixImageFilename: 'https://arweave.net/uploaded-cover.jpg'
        }
      ]
    }
  ];
  const { db } = makeFirestoreDouble(artists);
  const outDir = mkTempDir('ws-sync-meta-forward-');
  const result = await syncFirebaseToWebsiteJSON(db, outDir);
  const written = JSON.parse(fs.readFileSync(result.filePath, 'utf8'));
  const artist = written[0];

  assert.deepEqual(artist.artistImageMeta, artists[0].artistImageMeta);
  assert.equal(artist.previousArtistImageFilename, undefined, 'not present on input, must not appear on output');

  const [generatedMix, plainMix] = artist.mixes;
  assert.deepEqual(generatedMix.mixImageMeta, artists[0].mixes[0].mixImageMeta);
  assert.equal(generatedMix.previousMixImageFilename, artists[0].mixes[0].previousMixImageFilename);

  assert.equal('mixImageMeta' in plainMix, false, 'a mix with no meta must not gain a mixImageMeta key');
  assert.equal('previousMixImageFilename' in plainMix, false, 'a mix with no previous-image value must not gain that key');
});

test('syncWebsiteJSONToFirebase: preserves skyline metadata instead of dropping it under {merge:false}', async () => {
  const websiteArtists = [
    {
      artistName: 'Round Trip Artist',
      artistFilename: 'round-trip-artist.html',
      artistImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/artist/abc123-v1.webp',
      artistGenre: 'techno',
      artistImageMeta: { origin: 'generated-skyline', assignmentVersion: 1, width: 960, height: 960, locked: false },
      previousArtistImageFilename: 'https://arweave.net/old-artist-img.jpg',
      mixes: [
        {
          mixTitle: 'Mix With Meta',
          mixArweaveURL: 'https://arweave.net/tx1',
          mixDateYear: '2024',
          mixDuration: '60:00',
          mixImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/def456-v1.webp',
          mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1, width: 960, height: 960, locked: false },
          previousMixImageFilename: 'https://arweave.net/old-mix-img.jpg'
        }
      ]
    }
  ];

  const outDir = mkTempDir('ws-sync-reverse-');
  fs.writeFileSync(path.join(outDir, 'artists.json'), JSON.stringify(websiteArtists, null, 2));

  const { db, calls } = makeFirestoreDouble([]);
  const result = await syncWebsiteJSONToFirebase(db, outDir);
  assert.equal(result.success, true);

  assert.equal(calls.sets.length, 1);
  assert.deepEqual(calls.sets[0].opts, { merge: false }, 'write mode is unchanged — still a full-document replace');

  const writtenArtist = calls.sets[0].data.artists[0];
  assert.deepEqual(writtenArtist.artistImageMeta, websiteArtists[0].artistImageMeta, 'reverse sync must not drop artistImageMeta');
  assert.equal(writtenArtist.previousArtistImageFilename, websiteArtists[0].previousArtistImageFilename);

  const writtenMix = writtenArtist.mixes[0];
  assert.deepEqual(writtenMix.mixImageMeta, websiteArtists[0].mixes[0].mixImageMeta, 'reverse sync must not drop mixImageMeta');
  assert.equal(writtenMix.previousMixImageFilename, websiteArtists[0].mixes[0].previousMixImageFilename);
});

test('round trip (Firebase -> website JSON -> Firebase) loses no skyline metadata', async () => {
  const originalArtists = [
    {
      artistName: 'Roundtrip Two',
      artistFilename: 'roundtrip-two.html',
      artistImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/artist/xyz-v2.webp',
      artistGenre: 'electro',
      artistImageMeta: {
        origin: 'generated-skyline', assignmentVersion: 2, sourceVideoId: 'skyline-0007',
        sourceTimeSec: 5.5, generatedAt: '2026-09-05T00:00:00.000Z', contentHash: 'abc123',
        width: 960, height: 960, locked: false, serviceVersion: 1
      },
      previousArtistImageFilename: 'https://arweave.net/legacy-artist.jpg',
      mixes: [
        {
          mixTitle: 'Roundtrip Mix',
          mixArweaveURL: 'https://arweave.net/tx-roundtrip',
          mixDateYear: '2025',
          mixDuration: '45:00',
          mixImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/qrs-v1.webp',
          mixImageMeta: {
            origin: 'generated-skyline', assignmentVersion: 1, sourceVideoId: 'skyline-0009',
            sourceTimeSec: 41.1, generatedAt: '2026-09-05T00:00:00.000Z', contentHash: 'def456',
            width: 960, height: 960, locked: false, serviceVersion: 1
          },
          previousMixImageFilename: 'https://arweave.net/legacy-mix.jpg'
        }
      ]
    }
  ];

  const { db: fwdDb } = makeFirestoreDouble(originalArtists);
  const jsonDir = mkTempDir('ws-sync-roundtrip-');
  await syncFirebaseToWebsiteJSON(fwdDb, jsonDir);

  const { db: revDb, calls } = makeFirestoreDouble([]);
  await syncWebsiteJSONToFirebase(revDb, jsonDir);

  const roundTripped = calls.sets[0].data.artists[0];
  assert.deepEqual(roundTripped.artistImageMeta, originalArtists[0].artistImageMeta);
  assert.equal(roundTripped.previousArtistImageFilename, originalArtists[0].previousArtistImageFilename);
  assert.deepEqual(roundTripped.mixes[0].mixImageMeta, originalArtists[0].mixes[0].mixImageMeta);
  assert.equal(roundTripped.mixes[0].previousMixImageFilename, originalArtists[0].mixes[0].previousMixImageFilename);
});
