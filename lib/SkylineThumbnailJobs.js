/**
 * lib/SkylineThumbnailJobs.js — idempotent, lease-based thumbnail job queue
 * (contract §3.11), plus a few small shared helpers used by the
 * ingestion/admin seam this workstream owns (api/manage-artists.js,
 * api/upload.js, worker/run-thumbnail-jobs.mjs).
 *
 * Owner: Workstream C (ingestion & admin).
 *
 * This module imports only lib/skyline/keys.js (Workstream A) and
 * lib/skyline/flags.js (Workstream B) — both are pure, dependency-free
 * modules with no ffmpeg-static anywhere in their import chain — so it is
 * safe to import at module top level from any api/*.js handler and from the
 * root `node --test` runner (no credentials, no ffmpeg binary required).
 */

import { deriveIdempotencyKey, deriveMixKey, deriveArtistKey } from './skyline/keys.js';
import { skylineThumbnailsEnabled } from './skyline/flags.js';

export const JOB_STATUS = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
});

export const THUMBNAIL_STATUS = Object.freeze({
  UPLOADED: 'uploaded',
  GENERATING: 'generating',
  GENERATED: 'generated',
  FAILED: 'failed',
  NOT_REQUESTED: 'not-requested',
});

const DEFAULT_COLLECTION = 'skyline_thumbnail_jobs';
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;

function isoNow(now) {
  return now().toISOString();
}

/**
 * @param {{db: object, collection?: string, now?: () => Date, leaseMs?: number}} args
 */
export function createThumbnailJobQueue({
  db,
  collection = DEFAULT_COLLECTION,
  now = () => new Date(),
  leaseMs = DEFAULT_LEASE_MS,
} = {}) {
  if (!db || typeof db.collection !== 'function') {
    throw new Error('createThumbnailJobQueue requires a Firestore-like db');
  }
  const col = db.collection(collection);

  async function enqueue({
    entityType,
    entityKey,
    artistFilename,
    mixIndex = null,
    mixTitle = null,
    assignmentVersion = 1,
    requestedBy = 'system',
  }) {
    if (!entityType || !entityKey || !artistFilename) {
      throw new Error('enqueue requires entityType, entityKey, artistFilename');
    }
    const jobId = deriveIdempotencyKey({ entityType, stableKey: entityKey, assignmentVersion });
    const ref = col.doc(jobId);
    const nowIso = isoNow(now);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const data = snap.data();
        if (data.status === JOB_STATUS.FAILED) {
          // A retried upload (or admin request) hitting the same idempotency key must
          // never create a second asset — requeue the existing doc instead of leaving
          // it permanently stuck.
          tx.set(ref, {
            ...data,
            status: JOB_STATUS.QUEUED,
            leaseOwner: null,
            leaseExpiresAt: null,
            updatedAt: nowIso,
          });
        }
        return { created: false };
      }
      tx.set(ref, {
        entityType,
        entityKey,
        artistFilename,
        mixIndex,
        mixTitle,
        assignmentVersion,
        requestedBy,
        status: JOB_STATUS.QUEUED,
        attempts: 0,
        maxAttempts: MAX_ATTEMPTS,
        leaseOwner: null,
        leaseExpiresAt: null,
        result: null,
        error: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      return { created: true };
    });

    return { jobId, created: outcome.created };
  }

  async function claimNext() {
    const nowTs = now();
    const [queuedSnap, runningSnap] = await Promise.all([
      col.where('status', '==', JOB_STATUS.QUEUED).get(),
      col.where('status', '==', JOB_STATUS.RUNNING).get(),
    ]);

    const candidates = [...queuedSnap.docs];
    for (const doc of runningSnap.docs) {
      const data = doc.data();
      if (data.leaseExpiresAt && new Date(data.leaseExpiresAt).getTime() <= nowTs.getTime()) {
        candidates.push(doc);
      }
    }
    candidates.sort((a, b) => new Date(a.data().createdAt).getTime() - new Date(b.data().createdAt).getTime());

    for (const candidate of candidates) {
      const ref = col.doc(candidate.id);
      // The check-and-claim MUST happen inside one transaction: a plain get()+update()
      // pair would let two concurrent claimNext() calls both observe "queued" before
      // either write lands, double-claiming the same job.
      // eslint-disable-next-line no-await-in-loop
      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const data = snap.data();
        const leaseExpired =
          data.status === JOB_STATUS.RUNNING &&
          data.leaseExpiresAt &&
          new Date(data.leaseExpiresAt).getTime() <= nowTs.getTime();
        if (data.status !== JOB_STATUS.QUEUED && !leaseExpired) return null;

        const leaseOwner = `${process.pid || 0}-${Math.random().toString(36).slice(2, 10)}`;
        const updated = {
          ...data,
          status: JOB_STATUS.RUNNING,
          leaseOwner,
          leaseExpiresAt: new Date(nowTs.getTime() + leaseMs).toISOString(),
          updatedAt: isoNow(now),
          claimedAt: isoNow(now),
        };
        tx.set(ref, updated);
        return { id: candidate.id, ...updated };
      });
      if (claimed) return claimed;
    }
    return null;
  }

  async function complete(jobId, { imageUrl, meta } = {}) {
    const ref = col.doc(jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`Unknown skyline thumbnail job: ${jobId}`);
      const data = snap.data();
      const updated = {
        ...data,
        status: JOB_STATUS.DONE,
        result: { imageUrl, meta },
        error: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: isoNow(now),
        completedAt: isoNow(now),
      };
      tx.set(ref, updated);
      return { id: jobId, ...updated };
    });
  }

  async function fail(jobId, { code, message } = {}) {
    const ref = col.doc(jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`Unknown skyline thumbnail job: ${jobId}`);
      const data = snap.data();
      const attempts = (data.attempts || 0) + 1;
      const maxAttempts = data.maxAttempts || MAX_ATTEMPTS;
      const exhausted = attempts >= maxAttempts;
      const updated = {
        ...data,
        status: exhausted ? JOB_STATUS.FAILED : JOB_STATUS.QUEUED,
        attempts,
        error: { code: code || 'unknown', message: message || '' },
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: isoNow(now),
      };
      tx.set(ref, updated);
      return { id: jobId, ...updated };
    });
  }

  async function retry(jobId) {
    const ref = col.doc(jobId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error(`Unknown skyline thumbnail job: ${jobId}`);
      const data = snap.data();
      if (data.status !== JOB_STATUS.FAILED) {
        return { id: jobId, ...data, retried: false };
      }
      const updated = {
        ...data,
        status: JOB_STATUS.QUEUED,
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: isoNow(now),
      };
      tx.set(ref, updated);
      return { id: jobId, ...updated, retried: true };
    });
  }

  async function statusFor({ entityType, entityKey }) {
    // Single-field query (never a compound where().where(), which would need a
    // composite index) + in-memory filter/sort — this collection is small.
    const snap = await col.where('entityType', '==', entityType).get();
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((j) => j.entityKey === entityKey);

    if (matches.length === 0) {
      return { status: THUMBNAIL_STATUS.NOT_REQUESTED, job: null };
    }

    matches.sort((a, b) => {
      if (b.assignmentVersion !== a.assignmentVersion) return b.assignmentVersion - a.assignmentVersion;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const job = matches[0];

    let status;
    if (job.status === JOB_STATUS.QUEUED || job.status === JOB_STATUS.RUNNING) {
      status = THUMBNAIL_STATUS.GENERATING;
    } else if (job.status === JOB_STATUS.DONE) {
      status = THUMBNAIL_STATUS.GENERATED;
    } else if (job.status === JOB_STATUS.FAILED) {
      status = THUMBNAIL_STATUS.FAILED;
    } else {
      status = THUMBNAIL_STATUS.NOT_REQUESTED;
    }
    return { status, job };
  }

  return { enqueue, claimNext, complete, fail, retry, statusFor, collectionName: collection, leaseMs };
}

/**
 * Derives the correct stable key for a mix or artist and enqueues a
 * generation job, honoring SKYLINE_THUMBNAILS_ENABLED. Never throws for
 * "flag off" (that is the honest, non-error outcome) — every call site in
 * this workstream wraps this in try/catch so a genuine infra error (a
 * Firestore hiccup, say) can never fail the mix/track/artist write that
 * triggered it.
 *
 * @param {{db, queue?, entityType, artistFilename, mixIndex?, mixTitle?, mixArweaveURL?, assignmentVersion?, requestedBy?, env?}} args
 */
export async function requestThumbnailGeneration({
  db,
  queue,
  entityType,
  artistFilename,
  mixIndex = null,
  mixTitle = null,
  mixArweaveURL = null,
  assignmentVersion = 1,
  requestedBy = 'system',
  env = process.env,
} = {}) {
  if (!skylineThumbnailsEnabled(env)) {
    return { status: THUMBNAIL_STATUS.NOT_REQUESTED };
  }
  if (entityType !== 'mix' && entityType !== 'artist') {
    throw new Error('requestThumbnailGeneration requires entityType of "mix" or "artist"');
  }
  if (!artistFilename) {
    throw new Error('requestThumbnailGeneration requires artistFilename');
  }

  const entityKey =
    entityType === 'artist'
      ? deriveArtistKey({ artistFilename })
      : deriveMixKey({ artistFilename, mixArweaveURL: mixArweaveURL || '', mixTitle: mixTitle || '' });

  const q = queue || createThumbnailJobQueue({ db });
  const { jobId } = await q.enqueue({
    entityType,
    entityKey,
    artistFilename,
    mixIndex,
    mixTitle,
    assignmentVersion,
    requestedBy,
  });

  return { status: THUMBNAIL_STATUS.GENERATING, jobId, entityKey };
}

/**
 * Locate a mix's current array index by content match (Arweave URL + title),
 * never by a client-supplied raw index — mirrors the "never by array index
 * alone" rule the rest of the pipeline follows (contract §3.9).
 */
export function locateMixIndex(artist, { mixArweaveURL, mixTitle }) {
  if (!artist || !Array.isArray(artist.mixes)) return -1;
  return artist.mixes.findIndex((m) => m.mixArweaveURL === mixArweaveURL && m.mixTitle === mixTitle);
}

/**
 * Minimal transactional patch of one mix/artist's image field + meta on the
 * system/artists document, for the admin-only actions that must deliberately
 * bypass the AUTOMATIC-path protection guard: an explicit "replace with my
 * own upload" or a lock/unlock toggle must always be able to act, even on an
 * already-locked/uploaded record. (lib/SkylineAssignmentStore.js's
 * applyEntityAssignment is for the automatic backfill/regenerate/retry path
 * and correctly *refuses* to touch a protected record — that guard is by
 * design and this helper does not replace it for that path.)
 *
 * Re-reads and re-locates the entity inside the transaction so a concurrent
 * write can never be silently clobbered.
 *
 * @param {{db, docPath?, artistName, entityType, mixArweaveURL?, mixTitle?, mutate: (artist, mixIndex) => {nextArtist, changed, reason?}}} args
 */
export async function transactionalArtistPatch({
  db,
  docPath = 'system/artists',
  artistName,
  entityType,
  mixArweaveURL,
  mixTitle,
  mutate,
}) {
  const [collectionName, docId] = docPath.split('/');
  const ref = db.collection(collectionName).doc(docId);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const artists = snap.exists ? snap.data().artists || [] : [];
    const idx = artists.findIndex((a) => a.artistName === artistName);
    if (idx === -1) {
      return { changed: false, reason: 'artist-not-found' };
    }
    const artist = artists[idx];
    const mixIndex = entityType === 'mix' ? locateMixIndex(artist, { mixArweaveURL, mixTitle }) : -1;
    if (entityType === 'mix' && mixIndex === -1) {
      return { changed: false, reason: 'mix-not-found' };
    }

    const { nextArtist, changed, reason } = mutate(artist, mixIndex);
    if (!changed) {
      return { changed: false, reason: reason || 'no-op' };
    }

    const nextArtists = artists.slice();
    nextArtists[idx] = nextArtist;
    tx.set(ref, { artists: nextArtists }, { merge: false });
    return { changed: true, artist: nextArtist, mixIndex };
  });
}
