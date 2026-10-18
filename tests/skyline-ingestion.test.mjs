import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { createFakeFirestore } from './helpers/skyline-fake-firestore.mjs';
import { THUMBNAIL_STATUS } from '../lib/SkylineThumbnailJobs.js';

import manageArtistsHandler, {
  addMixToArtist as manageAddMixToArtist,
  getThumbnailStatus,
  requestThumbnailAction,
  regenerateThumbnailAction,
  retryThumbnailAction,
  restoreThumbnailAction,
  setThumbnailLock,
  setUploadedArtworkAction,
} from '../api/manage-artists.js';

import { addMixToArtist as uploadAddMixToArtist } from '../api/upload.js';

const ORIGINAL_FLAG = process.env.SKYLINE_THUMBNAILS_ENABLED;
function setFlag(value) {
  if (value === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
  else process.env.SKYLINE_THUMBNAILS_ENABLED = value;
}
afterEach(() => setFlag(ORIGINAL_FLAG));

function fakeRes() {
  const res = {
    statusCode: null,
    _body: null,
    _headers: {},
    setHeader(k, v) { this._headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this._body = body; return this; },
    end() { return this; },
  };
  return res;
}

const MIX_URL_A = 'https://arweave.net/tx0000000000000000000000000000000000000001';
const MIX_URL_B = 'https://arweave.net/tx0000000000000000000000000000000000000002';

describe('api/upload.js addMixToArtist — the real UI-triggered mix/artist creation path', () => {
  test('flag off: mixImageFilename optional, write succeeds, thumbnail is not-requested (no job created)', async () => {
    setFlag(undefined);
    const db = createFakeFirestore();
    const result = await uploadAddMixToArtist(db, 'Brand New Artist', {
      mixTitle: 'First Mix',
      mixArweaveURL: MIX_URL_A,
      mixDateYear: '2026',
      mixDuration: '10:00',
      mixImageFilename: '',
      isTrack: false,
    });

    assert.equal(result.added, true);
    assert.equal(result.isNewArtist, true);
    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.NOT_REQUESTED);
    assert.equal(result.artistThumbnail.status, THUMBNAIL_STATUS.NOT_REQUESTED);

    const jobsSnap = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(jobsSnap.docs.length, 0, 'flag off must suppress every enqueue');

    const artistsDoc = await db.collection('system').doc('artists').get();
    assert.equal(artistsDoc.data().artists[0].mixes[0].mixTitle, 'First Mix');
  });

  test('flag on: enqueues a mix job AND an artist job for a brand new artist with no art', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const result = await uploadAddMixToArtist(db, 'Another New Artist', {
      mixTitle: 'Second Mix',
      mixArweaveURL: MIX_URL_A,
      mixDateYear: '2026',
      mixDuration: '10:00',
      mixImageFilename: '',
      isTrack: false,
    });

    assert.equal(result.added, true);
    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.GENERATING);
    assert.equal(result.artistThumbnail.status, THUMBNAIL_STATUS.GENERATING);
    assert.notEqual(result.thumbnail.jobId, result.artistThumbnail.jobId);

    const jobsSnap = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(jobsSnap.docs.length, 2, 'one mix job + one artist job');
  });

  test('skipArtistThumbnail suppresses only the artist job (explicit artwork wins, enqueues nothing for it)', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const result = await uploadAddMixToArtist(
      db,
      'Artist With Own Art',
      { mixTitle: 'Third Mix', mixArweaveURL: MIX_URL_A, mixDateYear: '2026', mixDuration: '10:00', mixImageFilename: '', isTrack: false },
      { skipArtistThumbnail: true }
    );

    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.GENERATING, 'mix still auto-generates');
    assert.equal(result.artistThumbnail.status, THUMBNAIL_STATUS.NOT_REQUESTED, 'artist thumbnail skipped');
  });

  test('an explicitly supplied mixImageFilename enqueues nothing for the mix', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const result = await uploadAddMixToArtist(db, 'Curated Artist', {
      mixTitle: 'Has Art',
      mixArweaveURL: MIX_URL_A,
      mixDateYear: '2026',
      mixDuration: '10:00',
      mixImageFilename: 'https://arweave.net/already-has-art',
      isTrack: false,
    });
    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.NOT_REQUESTED);
    const jobsSnap = await db.collection('skyline_thumbnail_jobs').get();
    // Only the artist job (new artist, no skipArtistThumbnail) should exist.
    assert.equal(jobsSnap.docs.length, 1);
    assert.equal(jobsSnap.docs[0].data().entityType, 'artist');
  });

  test('a thumbnail enqueue failure never fails the mix write (audio upload stays successful)', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    // Make the queue's underlying transaction blow up to simulate an infra failure.
    const brokenDb = {
      ...db,
      collection: (name) => {
        const real = db.collection(name);
        if (name === 'skyline_thumbnail_jobs') {
          return {
            ...real,
            doc: () => {
              throw new Error('simulated Firestore outage');
            },
          };
        }
        return real;
      },
      runTransaction: db.runTransaction.bind(db),
    };

    const result = await uploadAddMixToArtist(brokenDb, 'Resilience Artist', {
      mixTitle: 'Still Works',
      mixArweaveURL: MIX_URL_A,
      mixDateYear: '2026',
      mixDuration: '10:00',
      mixImageFilename: '',
      isTrack: false,
    });

    assert.equal(result.added, true, 'the write itself must still succeed');
    assert.equal(result.thumbnail.status, 'failed');
    assert.ok(result.thumbnail.reason);

    const artistsDoc = await brokenDb.collection('system').doc('artists').get();
    assert.equal(artistsDoc.data().artists[0].mixes[0].mixTitle, 'Still Works', 'mix data was actually persisted');
  });

  test('a track (isTrack: true) never triggers automatic mix-thumbnail generation', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const result = await uploadAddMixToArtist(
      db,
      'Track Only Artist',
      { mixTitle: 'A Track', mixArweaveURL: MIX_URL_A, mixDateYear: '2026', mixDuration: '3:00', mixImageFilename: '', isTrack: true },
      { skipArtistThumbnail: true }
    );
    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.NOT_REQUESTED);
  });
});

describe('api/manage-artists.js addMixToArtist — addMix/addTrack action backing function', () => {
  test('enqueues a mix thumbnail job when mixImageFilename is absent', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const result = await manageAddMixToArtist(db, 'Manage Artist One', {
      mixTitle: 'Manage Mix',
      mixArweaveURL: MIX_URL_B,
      mixDateYear: '2026',
      mixDuration: '5:00',
      mixImageFilename: '',
      isTrack: false,
    });
    assert.equal(result.added, true);
    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.GENERATING);
    assert.equal(result.artistThumbnail.status, THUMBNAIL_STATUS.GENERATING, 'inline-created artist also gets one');
  });

  test('never fails the write when the queue throws', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const brokenDb = {
      collection: (name) => {
        if (name === 'skyline_thumbnail_jobs') {
          return { doc: () => { throw new Error('boom'); } };
        }
        return db.collection(name);
      },
      runTransaction: db.runTransaction.bind(db),
    };
    const result = await manageAddMixToArtist(brokenDb, 'Manage Artist Two', {
      mixTitle: 'Still OK',
      mixArweaveURL: MIX_URL_B,
      mixDateYear: '2026',
      mixDuration: '5:00',
      mixImageFilename: '',
      isTrack: false,
    });
    assert.equal(result.added, true);
    assert.equal(result.thumbnail.status, 'failed');
  });
});

describe('api/manage-artists.js default handler — thumbnail admin/status actions (injected db)', () => {
  async function seed(db, overrides = {}) {
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Handler Artist',
          artistFilename: 'handlerartist.html',
          artistImageFilename: '',
          artistGenre: 'electronic',
          mixes: [{ mixArweaveURL: MIX_URL_A, mixTitle: 'Handler Mix', mixImageFilename: '', ...overrides }],
          trax: [],
        },
      ],
    });
  }

  test('thumbnailStatus reports not-requested when the flag is off and nothing has ever run', async () => {
    setFlag(undefined);
    const db = createFakeFirestore();
    await seed(db);
    const res = fakeRes();
    await manageArtistsHandler(
      { method: 'POST', body: { action: 'thumbnailStatus', artistName: 'Handler Artist', entityType: 'mix', mixArweaveURL: MIX_URL_A, mixTitle: 'Handler Mix' } },
      res,
      { db }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res._body.success, true);
    assert.equal(res._body.result.thumbnailStatus, THUMBNAIL_STATUS.NOT_REQUESTED);
  });

  test('unknown action still 400s (existing behavior preserved)', async () => {
    const db = createFakeFirestore();
    const res = fakeRes();
    await manageArtistsHandler({ method: 'POST', body: { action: 'notARealAction', artistName: 'X' } }, res, { db });
    assert.equal(res.statusCode, 400);
    assert.equal(res._body.success, false);
  });

  test('requestThumbnail via the handler enqueues and thumbnailStatus then reports generating', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await seed(db);

    const reqRes = fakeRes();
    await manageArtistsHandler(
      { method: 'POST', body: { action: 'requestThumbnail', artistName: 'Handler Artist', entityType: 'mix', mixArweaveURL: MIX_URL_A, mixTitle: 'Handler Mix' } },
      reqRes,
      { db }
    );
    assert.equal(reqRes._body.result.status, THUMBNAIL_STATUS.GENERATING);

    const statusRes = fakeRes();
    await manageArtistsHandler(
      { method: 'POST', body: { action: 'thumbnailStatus', artistName: 'Handler Artist', entityType: 'mix', mixArweaveURL: MIX_URL_A, mixTitle: 'Handler Mix' } },
      statusRes,
      { db }
    );
    assert.equal(statusRes._body.result.thumbnailStatus, THUMBNAIL_STATUS.GENERATING);
  });
});

describe('getThumbnailStatus / requestThumbnailAction / regenerateThumbnailAction — direct calls', () => {
  async function seedLocked(db) {
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Locked Artist',
          artistFilename: 'lockedartist.html',
          artistImageFilename: '',
          mixes: [
            {
              mixArweaveURL: MIX_URL_A,
              mixTitle: 'Locked Mix',
              mixImageFilename: 'https://arweave.net/some-real-cover.jpg',
              mixImageMeta: { origin: 'uploaded', locked: true },
            },
          ],
          trax: [],
        },
      ],
    });
  }

  test('uploaded+locked art is reported as uploaded and never enqueued for generation', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await seedLocked(db);

    const status = await getThumbnailStatus(db, { entityType: 'mix', artistName: 'Locked Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Locked Mix' });
    assert.equal(status.thumbnailStatus, THUMBNAIL_STATUS.UPLOADED);
    assert.equal(status.locked, true);

    const req = await requestThumbnailAction(db, { entityType: 'mix', artistName: 'Locked Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Locked Mix' });
    assert.equal(req.status, THUMBNAIL_STATUS.UPLOADED);
    assert.equal(req.reason, 'protected');

    const regen = await regenerateThumbnailAction(db, { entityType: 'mix', artistName: 'Locked Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Locked Mix' });
    assert.equal(regen.status, THUMBNAIL_STATUS.UPLOADED);
    assert.equal(regen.reason, 'protected');

    const jobsSnap = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(jobsSnap.docs.length, 0, 'no job doc must ever be created for protected art');
  });

  test('regenerateThumbnail bumps assignmentVersion on an already-generated (unlocked) mix', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Gen Artist',
          artistFilename: 'genartist.html',
          artistImageFilename: '',
          mixes: [
            {
              mixArweaveURL: MIX_URL_A,
              mixTitle: 'Gen Mix',
              mixImageFilename: 'https://storage.googleapis.com/bucket/generated/v1.webp',
              mixImageMeta: { origin: 'generated-skyline', locked: false, assignmentVersion: 1 },
            },
          ],
          trax: [],
        },
      ],
    });

    const result = await regenerateThumbnailAction(db, { entityType: 'mix', artistName: 'Gen Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Gen Mix' });
    assert.equal(result.status, THUMBNAIL_STATUS.GENERATING);
    const jobDoc = await db.collection('skyline_thumbnail_jobs').doc(result.jobId).get();
    assert.equal(jobDoc.data().assignmentVersion, 2);
  });
});

describe('retryThumbnailAction / restoreThumbnailAction / setThumbnailLock / setUploadedArtworkAction', () => {
  async function seedGenerated(db) {
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Retry Artist',
          artistFilename: 'retryartist.html',
          artistImageFilename: '',
          mixes: [
            {
              mixArweaveURL: MIX_URL_A,
              mixTitle: 'Retry Mix',
              mixImageFilename: '',
              previousMixImageFilename: 'https://arweave.net/legacy-cover.jpg',
            },
          ],
          trax: [],
        },
      ],
    });
  }

  test('retryThumbnail resolves the entity\'s failed job and requeues it', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await seedGenerated(db);

    const enqueueRes = await requestThumbnailAction(db, { entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix' });
    const jobId = enqueueRes.jobId;

    // Drive it to FAILED via the raw queue (3 fails).
    const { createThumbnailJobQueue } = await import('../lib/SkylineThumbnailJobs.js');
    const queue = createThumbnailJobQueue({ db });
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await queue.fail(jobId, { code: 'ffmpeg-failed', message: 'x' });
    }

    const retryResult = await retryThumbnailAction(db, { entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix' });
    assert.equal(retryResult.retried, true);
    assert.equal(retryResult.status, THUMBNAIL_STATUS.GENERATING);
    assert.equal(retryResult.jobId, jobId);
  });

  test('restoreThumbnail reverts to the previous* value via the real assignment store', async () => {
    const db = createFakeFirestore();
    await seedGenerated(db);
    const result = await restoreThumbnailAction(db, { entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix' });
    assert.equal(result.applied, true);
    const doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageFilename, 'https://arweave.net/legacy-cover.jpg');
  });

  test('lockThumbnail / unlockThumbnail toggle meta.locked, including unlocking an already-locked record', async () => {
    const db = createFakeFirestore();
    await seedGenerated(db);

    const locked = await setThumbnailLock(db, { entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix', locked: true });
    assert.equal(locked.changed, true);
    let doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageMeta.locked, true);

    const unlocked = await setThumbnailLock(db, { entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix', locked: false });
    assert.equal(unlocked.changed, true, 'unlocking an already-locked record must still succeed');
    doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageMeta.locked, false);
  });

  test('setUploadedArtwork sets origin uploaded + locked true and enqueues nothing', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await seedGenerated(db);

    const result = await setUploadedArtworkAction(db, {
      entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix', imageUrl: 'https://arweave.net/brand-new-upload.jpg',
    });
    assert.equal(result.changed, true);

    const doc = await db.collection('system').doc('artists').get();
    const mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, 'https://arweave.net/brand-new-upload.jpg');
    assert.equal(mix.mixImageMeta.origin, 'uploaded');
    assert.equal(mix.mixImageMeta.locked, true);

    // And a subsequent requestThumbnail must now refuse (protected).
    const req = await requestThumbnailAction(db, { entityType: 'mix', artistName: 'Retry Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Retry Mix' });
    assert.equal(req.reason, 'protected');
  });

  test('setUploadedArtwork can replace an already-locked/uploaded image (explicit admin override)', async () => {
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Override Artist',
          artistFilename: 'overrideartist.html',
          artistImageFilename: '',
          mixes: [
            {
              mixArweaveURL: MIX_URL_A,
              mixTitle: 'Override Mix',
              mixImageFilename: 'https://arweave.net/old-upload.jpg',
              mixImageMeta: { origin: 'uploaded', locked: true, assignmentVersion: 1 },
            },
          ],
          trax: [],
        },
      ],
    });

    const result = await setUploadedArtworkAction(db, {
      entityType: 'mix', artistName: 'Override Artist', mixArweaveURL: MIX_URL_A, mixTitle: 'Override Mix', imageUrl: 'https://arweave.net/new-upload.jpg',
    });
    assert.equal(result.changed, true, 'admin explicit replace must not be blocked by the existing lock');
    const doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageFilename, 'https://arweave.net/new-upload.jpg');
  });
});
