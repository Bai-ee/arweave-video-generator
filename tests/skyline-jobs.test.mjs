import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  JOB_STATUS,
  THUMBNAIL_STATUS,
  createThumbnailJobQueue,
  requestThumbnailGeneration,
  locateMixIndex,
  transactionalArtistPatch,
} from '../lib/SkylineThumbnailJobs.js';
import { processJob } from '../worker/run-thumbnail-jobs.mjs';
import { createFakeFirestore } from './helpers/skyline-fake-firestore.mjs';

// requestThumbnailGeneration reads the real SKYLINE_THUMBNAILS_ENABLED flag (lib/skyline/flags.js
// reads process.env directly) — save/restore it around every test that touches it.
const ORIGINAL_FLAG = process.env.SKYLINE_THUMBNAILS_ENABLED;
function setFlag(value) {
  if (value === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
  else process.env.SKYLINE_THUMBNAILS_ENABLED = value;
}
afterEach(() => setFlag(ORIGINAL_FLAG));

const ARTIST_FILENAME = 'testartist.html';
const MIX_URL = 'https://arweave.net/abc123def456ghi789';
const MIX_TITLE = 'Test Mix One';

describe('createThumbnailJobQueue: enqueue', () => {
  test('creates a queued job with the expected fields', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { jobId, created } = await queue.enqueue({
      entityType: 'mix',
      entityKey: 'abc123',
      artistFilename: ARTIST_FILENAME,
      mixIndex: 0,
      mixTitle: MIX_TITLE,
      assignmentVersion: 1,
    });
    assert.equal(created, true);
    assert.equal(jobId, 'mix:abc123:v1');

    const doc = await db.collection('skyline_thumbnail_jobs').doc(jobId).get();
    assert.equal(doc.exists, true);
    assert.equal(doc.data().status, JOB_STATUS.QUEUED);
    assert.equal(doc.data().attempts, 0);
    assert.equal(doc.data().maxAttempts, 3);
  });

  test('is idempotent: same entityType/entityKey/assignmentVersion reuses the same job doc', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const first = await queue.enqueue({ entityType: 'mix', entityKey: 'key1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    const second = await queue.enqueue({ entityType: 'mix', entityKey: 'key1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });

    assert.equal(first.jobId, second.jobId);
    assert.equal(first.created, true);
    assert.equal(second.created, false);

    const all = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(all.docs.length, 1, 'a retried enqueue must never create a second job doc');
  });

  test('re-enqueuing a FAILED job requeues it instead of creating a duplicate', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { jobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'key2', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });

    // Fail it 3 times to exhaust attempts -> FAILED.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await queue.fail(jobId, { code: 'ffmpeg-failed', message: 'boom' });
    }
    let doc = await db.collection('skyline_thumbnail_jobs').doc(jobId).get();
    assert.equal(doc.data().status, JOB_STATUS.FAILED);

    const result = await queue.enqueue({ entityType: 'mix', entityKey: 'key2', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    assert.equal(result.created, false, 'still the same job doc, not a new one');
    assert.equal(result.jobId, jobId);

    doc = await db.collection('skyline_thumbnail_jobs').doc(jobId).get();
    assert.equal(doc.data().status, JOB_STATUS.QUEUED, 'requeued for another attempt');

    const all = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(all.docs.length, 1);
  });
});

describe('createThumbnailJobQueue: claimNext', () => {
  test('claims a queued job and sets lease fields', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    await queue.enqueue({ entityType: 'mix', entityKey: 'k1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });

    const job = await queue.claimNext();
    assert.ok(job);
    assert.equal(job.status, JOB_STATUS.RUNNING);
    assert.ok(job.leaseOwner);
    assert.ok(job.leaseExpiresAt);
  });

  test('returns null when there is nothing claimable', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const job = await queue.claimNext();
    assert.equal(job, null);
  });

  test('two concurrent claimNext() calls cannot claim the same job', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    await queue.enqueue({ entityType: 'mix', entityKey: 'race', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });

    const [a, b] = await Promise.all([queue.claimNext(), queue.claimNext()]);
    const claimed = [a, b].filter(Boolean);
    assert.equal(claimed.length, 1, 'exactly one of the two concurrent claims should succeed');
    assert.equal([a, b].filter((x) => x === null).length, 1);
  });

  test('an expired lease is reclaimable', async () => {
    let currentTime = new Date('2026-01-01T00:00:00.000Z');
    const db = createFakeFirestore();
    const leaseMs = 5 * 60 * 1000;
    const queue = createThumbnailJobQueue({ db, now: () => currentTime, leaseMs });

    await queue.enqueue({ entityType: 'mix', entityKey: 'lease1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    const firstClaim = await queue.claimNext();
    assert.ok(firstClaim, 'first claim should succeed');

    // Lease has not expired yet -> not reclaimable.
    const tooSoon = await queue.claimNext();
    assert.equal(tooSoon, null);

    // Advance the clock past the lease window.
    currentTime = new Date(currentTime.getTime() + leaseMs + 1000);
    const reclaimed = await queue.claimNext();
    assert.ok(reclaimed, 'an expired lease must be reclaimable');
    assert.equal(reclaimed.id, firstClaim.id);
  });

  test('claims the earliest-created job first', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db, now: () => new Date() });
    await queue.enqueue({ entityType: 'mix', entityKey: 'first', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    await new Promise((r) => setTimeout(r, 5));
    await queue.enqueue({ entityType: 'mix', entityKey: 'second', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });

    const claimed = await queue.claimNext();
    assert.equal(claimed.entityKey, 'first');
  });
});

describe('createThumbnailJobQueue: complete / fail / retry', () => {
  test('complete() marks the job DONE with a result', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { jobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'c1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    await queue.claimNext();
    const result = await queue.complete(jobId, { imageUrl: 'https://example.com/a.webp', meta: { origin: 'generated-skyline' } });
    assert.equal(result.status, JOB_STATUS.DONE);
    assert.equal(result.result.imageUrl, 'https://example.com/a.webp');
  });

  test('fail() increments attempts and stays retryable (QUEUED) until maxAttempts', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { jobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'f1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });

    const first = await queue.fail(jobId, { code: 'ffmpeg-failed', message: 'attempt 1' });
    assert.equal(first.attempts, 1);
    assert.equal(first.status, JOB_STATUS.QUEUED);

    const second = await queue.fail(jobId, { code: 'ffmpeg-failed', message: 'attempt 2' });
    assert.equal(second.attempts, 2);
    assert.equal(second.status, JOB_STATUS.QUEUED);

    const third = await queue.fail(jobId, { code: 'ffmpeg-failed', message: 'attempt 3' });
    assert.equal(third.attempts, 3);
    assert.equal(third.status, JOB_STATUS.FAILED, 'exhausted after maxAttempts (3)');
  });

  test('retry() moves a FAILED job back to QUEUED and preserves attempts', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { jobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'r1', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await queue.fail(jobId, { code: 'ffmpeg-failed', message: `attempt ${i + 1}` });
    }
    const failed = await db.collection('skyline_thumbnail_jobs').doc(jobId).get();
    assert.equal(failed.data().status, JOB_STATUS.FAILED);
    assert.equal(failed.data().attempts, 3);

    const retried = await queue.retry(jobId);
    assert.equal(retried.retried, true);
    assert.equal(retried.status, JOB_STATUS.QUEUED);
    assert.equal(retried.attempts, 3, 'attempts preserved, not reset');
  });

  test('retry() on a non-FAILED job is a no-op', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { jobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'r2', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    const result = await queue.retry(jobId);
    assert.equal(result.retried, false);
    assert.equal(result.status, JOB_STATUS.QUEUED);
  });
});

describe('createThumbnailJobQueue: statusFor', () => {
  test('reports not-requested when no job exists for the entity', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const { status, job } = await queue.statusFor({ entityType: 'mix', entityKey: 'ghost' });
    assert.equal(status, THUMBNAIL_STATUS.NOT_REQUESTED);
    assert.equal(job, null);
  });

  test('maps queued/running -> generating, done -> generated, failed -> failed', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });

    await queue.enqueue({ entityType: 'mix', entityKey: 'sq', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    assert.equal((await queue.statusFor({ entityType: 'mix', entityKey: 'sq' })).status, THUMBNAIL_STATUS.GENERATING);

    await queue.claimNext();
    assert.equal((await queue.statusFor({ entityType: 'mix', entityKey: 'sq' })).status, THUMBNAIL_STATUS.GENERATING);

    const { jobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'sd', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    await queue.claimNext();
    await queue.complete(jobId, { imageUrl: 'https://example.com/d.webp', meta: {} });
    assert.equal((await queue.statusFor({ entityType: 'mix', entityKey: 'sd' })).status, THUMBNAIL_STATUS.GENERATED);

    const { jobId: failJobId } = await queue.enqueue({ entityType: 'mix', entityKey: 'sf', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await queue.fail(failJobId, { code: 'ffmpeg-failed', message: 'x' });
    }
    assert.equal((await queue.statusFor({ entityType: 'mix', entityKey: 'sf' })).status, THUMBNAIL_STATUS.FAILED);
  });

  test('picks the highest assignmentVersion when multiple job docs exist for an entity', async () => {
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    await queue.enqueue({ entityType: 'mix', entityKey: 'multi', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 });
    await queue.enqueue({ entityType: 'mix', entityKey: 'multi', artistFilename: ARTIST_FILENAME, assignmentVersion: 2 });
    const { job } = await queue.statusFor({ entityType: 'mix', entityKey: 'multi' });
    assert.equal(job.assignmentVersion, 2);
  });
});

describe('requestThumbnailGeneration', () => {
  test('flag off -> not-requested, no job created', async () => {
    setFlag(undefined);
    const db = createFakeFirestore();
    const result = await requestThumbnailGeneration({
      db, entityType: 'mix', artistFilename: ARTIST_FILENAME, mixArweaveURL: MIX_URL, mixTitle: MIX_TITLE,
    });
    assert.equal(result.status, THUMBNAIL_STATUS.NOT_REQUESTED);
    const all = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(all.docs.length, 0, 'no job doc when the flag is off');
  });

  test('flag on -> enqueues and returns generating with a derived entityKey', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const result = await requestThumbnailGeneration({
      db, entityType: 'mix', artistFilename: ARTIST_FILENAME, mixArweaveURL: MIX_URL, mixTitle: MIX_TITLE, mixIndex: 0,
    });
    assert.equal(result.status, THUMBNAIL_STATUS.GENERATING);
    assert.ok(result.jobId);
    assert.ok(result.entityKey);
    assert.match(result.entityKey, /^[0-9a-f]{16}$/);

    const doc = await db.collection('skyline_thumbnail_jobs').doc(result.jobId).get();
    assert.equal(doc.exists, true);
    assert.equal(doc.data().entityType, 'mix');
    assert.equal(doc.data().artistFilename, ARTIST_FILENAME);
  });

  test('artist entityType derives a distinct key from a mix on the same artist', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const mixResult = await requestThumbnailGeneration({
      db, entityType: 'mix', artistFilename: ARTIST_FILENAME, mixArweaveURL: MIX_URL, mixTitle: MIX_TITLE,
    });
    const artistResult = await requestThumbnailGeneration({ db, entityType: 'artist', artistFilename: ARTIST_FILENAME });
    assert.notEqual(mixResult.entityKey, artistResult.entityKey);
  });
});

describe('locateMixIndex', () => {
  test('finds a mix by exact URL + title match', () => {
    const artist = { mixes: [{ mixArweaveURL: 'a', mixTitle: 'One' }, { mixArweaveURL: 'b', mixTitle: 'Two' }] };
    assert.equal(locateMixIndex(artist, { mixArweaveURL: 'b', mixTitle: 'Two' }), 1);
  });

  test('returns -1 when there is no match, or the artist has no mixes array', () => {
    const artist = { mixes: [{ mixArweaveURL: 'a', mixTitle: 'One' }] };
    assert.equal(locateMixIndex(artist, { mixArweaveURL: 'zzz', mixTitle: 'Nope' }), -1);
    assert.equal(locateMixIndex({}, { mixArweaveURL: 'a', mixTitle: 'One' }), -1);
    assert.equal(locateMixIndex(null, { mixArweaveURL: 'a', mixTitle: 'One' }), -1);
  });
});

describe('transactionalArtistPatch', () => {
  async function seedArtist(db, artist) {
    await db.collection('system').doc('artists').set({ artists: [artist] });
  }

  test('applies a mutate callback and persists the result', async () => {
    const db = createFakeFirestore();
    await seedArtist(db, {
      artistName: 'Locky',
      artistFilename: ARTIST_FILENAME,
      mixes: [{ mixArweaveURL: MIX_URL, mixTitle: MIX_TITLE, mixImageFilename: '' }],
    });

    const result = await transactionalArtistPatch({
      db,
      artistName: 'Locky',
      entityType: 'mix',
      mixArweaveURL: MIX_URL,
      mixTitle: MIX_TITLE,
      mutate: (artist, mixIndex) => {
        const mixes = artist.mixes.slice();
        mixes[mixIndex] = { ...mixes[mixIndex], mixImageMeta: { locked: true } };
        return { nextArtist: { ...artist, mixes }, changed: true };
      },
    });

    assert.equal(result.changed, true);
    const doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageMeta.locked, true);
  });

  test('reports artist-not-found without throwing', async () => {
    const db = createFakeFirestore();
    const result = await transactionalArtistPatch({
      db, artistName: 'Ghost', entityType: 'artist', mutate: (artist) => ({ nextArtist: artist, changed: true }),
    });
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'artist-not-found');
  });

  test('reports mix-not-found without throwing', async () => {
    const db = createFakeFirestore();
    await seedArtist(db, { artistName: 'Locky', artistFilename: ARTIST_FILENAME, mixes: [] });
    const result = await transactionalArtistPatch({
      db, artistName: 'Locky', entityType: 'mix', mixArweaveURL: 'nope', mixTitle: 'nope',
      mutate: (artist) => ({ nextArtist: artist, changed: true }),
    });
    assert.equal(result.changed, false);
    assert.equal(result.reason, 'mix-not-found');
  });
});

describe('worker/run-thumbnail-jobs.mjs: processJob', () => {
  function fakeQueue() {
    const calls = { complete: [], fail: [] };
    return {
      calls,
      async complete(jobId, payload) {
        calls.complete.push({ jobId, payload });
        return { id: jobId, status: JOB_STATUS.DONE };
      },
      async fail(jobId, payload) {
        calls.fail.push({ jobId, payload });
        return { id: jobId, status: JOB_STATUS.FAILED };
      },
    };
  }

  test('success path: calls store.applyEntityAssignment then queue.complete', async () => {
    const job = { id: 'mix:key1:v1', entityType: 'mix', entityKey: 'key1', artistFilename: ARTIST_FILENAME, mixIndex: 0, assignmentVersion: 1 };
    const generation = {
      ok: true,
      imageUrl: 'https://example.com/gen.webp',
      meta: { origin: 'generated-skyline', assignmentVersion: 1 },
    };
    const service = { async generate() { return generation; } };
    const applyCalls = [];
    const store = {
      async applyEntityAssignment(args) {
        applyCalls.push(args);
        return { applied: true, skipped: false, reason: null };
      },
    };
    const queue = fakeQueue();

    const result = await processJob({ job, service, store, queue, logger: { log() {}, warn() {}, error() {} } });

    assert.equal(result.ok, true);
    assert.equal(applyCalls.length, 1);
    assert.equal(applyCalls[0].entityKey, 'key1');
    assert.equal(queue.calls.complete.length, 1);
    assert.equal(queue.calls.complete[0].jobId, 'mix:key1:v1');
    assert.equal(queue.calls.fail.length, 0);
  });

  test('service failure: calls queue.fail, never touches the store', async () => {
    const job = { id: 'mix:key2:v1', entityType: 'mix', entityKey: 'key2', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 };
    const service = { async generate() { return { ok: false, error: { code: 'no-eligible-candidate', message: 'nothing usable' } }; } };
    let storeCalled = false;
    const store = { async applyEntityAssignment() { storeCalled = true; return { applied: true }; } };
    const queue = fakeQueue();

    const result = await processJob({ job, service, store, queue, logger: { log() {}, warn() {}, error() {} } });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'no-eligible-candidate');
    assert.equal(storeCalled, false);
    assert.equal(queue.calls.fail.length, 1);
    assert.equal(queue.calls.complete.length, 0);
  });

  test('store refuses the assignment (e.g. protected/locked): calls queue.fail with assignment-refused', async () => {
    const job = { id: 'mix:key3:v1', entityType: 'mix', entityKey: 'key3', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 };
    const service = { async generate() { return { ok: true, imageUrl: 'https://example.com/x.webp', meta: {} }; } };
    const store = { async applyEntityAssignment() { return { applied: false, skipped: true, reason: 'protected' }; } };
    const queue = fakeQueue();

    const result = await processJob({ job, service, store, queue, logger: { log() {}, warn() {}, error() {} } });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'assignment-refused');
    assert.equal(queue.calls.fail[0].payload.message, 'protected');
    assert.equal(queue.calls.complete.length, 0);
  });

  test('dry run never calls the store or completes the job', async () => {
    const job = { id: 'mix:key4:v1', entityType: 'mix', entityKey: 'key4', artistFilename: ARTIST_FILENAME, assignmentVersion: 1 };
    const service = { async generate({ dryRun }) {
      assert.equal(dryRun, true);
      return { ok: true, imageUrl: '', localPath: '/tmp/preview.webp', meta: {} };
    } };
    let storeCalled = false;
    const store = { async applyEntityAssignment() { storeCalled = true; return { applied: true }; } };
    const queue = fakeQueue();

    const result = await processJob({ job, service, store, queue, dryRun: true, logger: { log() {}, warn() {}, error() {} } });

    assert.equal(result.ok, true);
    assert.equal(result.dryRun, true);
    assert.equal(storeCalled, false);
    assert.equal(queue.calls.complete.length, 0);
    assert.equal(queue.calls.fail.length, 0);
  });
});
