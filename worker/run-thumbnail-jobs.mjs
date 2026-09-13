#!/usr/bin/env node
/**
 * worker/run-thumbnail-jobs.mjs (contract §3.13) — owner Workstream C.
 *
 * Drains lib/SkylineThumbnailJobs.js's queue: claims one job, generates the thumbnail via
 * worker/lib/SkylineThumbnailService.js (Workstream A), persists the result via
 * lib/SkylineAssignmentStore.js's applyEntityAssignment (Workstream B, re-verifies protection
 * inside its own Firestore transaction), then marks the job complete/failed.
 *
 *   node worker/run-thumbnail-jobs.mjs [--max N] [--once] [--dry-run] [--job <id>] [--sync]
 *
 * Respects SKYLINE_THUMBNAILS_ENABLED (lib/skyline/flags.js) — refuses to do anything when the
 * flag is off, matching every other entry point in this pipeline. Never calls WebsiteSync unless
 * --sync is passed explicitly, and never calls Arweave deploy / ArNS / GoDaddy from here.
 *
 * worker/lib/SkylineThumbnailService.js and config/skyline-thumbnail-sources.json are
 * Workstream A's deliverables and may not exist yet at the time this file is written — they are
 * loaded via dynamic import so this file is syntactically complete and importable (its exported
 * `processJob` is unit-tested with fully injected fakes) regardless of Workstream A's landing
 * order, and works unmodified once those files exist.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeFirebaseAdmin, getFirestore, getStorage } from '../lib/firebase-admin.js';
import { createThumbnailJobQueue } from '../lib/SkylineThumbnailJobs.js';
import { skylineThumbnailsEnabled } from '../lib/skyline/flags.js';
import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const args = { max: Infinity, once: false, dryRun: false, job: null, sync: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--max') args.max = parseInt(argv[i += 1], 10) || 1;
    else if (a === '--once') args.once = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--job') args.job = argv[i += 1];
    else if (a === '--sync') args.sync = true;
  }
  return args;
}

async function importOptional(specifier, label, logger = console) {
  try {
    return await import(specifier);
  } catch (err) {
    logger.error(`[Skyline Worker] ${label} is not available yet (${err.message}).`);
    return null;
  }
}

/**
 * Process exactly one already-claimed job. Exported for tests — callers inject fully fake
 * service/store/queue objects, so this never needs ffmpeg, Storage, or Firestore credentials.
 *
 * @param {{job: object, service: object, store: object, queue: object, logger?: object, dryRun?: boolean}} args
 */
export async function processJob({ job, service, store, queue, logger = console, dryRun = false }) {
  const used = { candidateIds: new Set(), dHashes: [] };
  const previewDir = dryRun
    ? path.join(process.cwd(), 'outputs', 'skyline-dryrun', 'worker-preview')
    : undefined;

  const generation = await service.generate({
    entityType: job.entityType,
    stableKey: job.entityKey,
    assignmentVersion: job.assignmentVersion,
    used,
    dryRun,
    previewDir,
  });

  if (!generation.ok) {
    await queue.fail(job.id, { code: generation.error.code, message: generation.error.message });
    logger.warn(`[Skyline Worker] job ${job.id} failed: ${generation.error.code} ${generation.error.message}`);
    return { ok: false, error: generation.error };
  }

  if (dryRun) {
    // Dry run never mutates system/artists or marks the job DONE — matches the pipeline-wide
    // "dry run is non-mutating" rule (contract §1 rule 5). The job stays queued/running so a
    // real (non-dry-run) drain can still pick it up later.
    logger.log(`[Skyline Worker] dry-run preview for job ${job.id}: ${generation.localPath}`);
    return { ok: true, dryRun: true, generation };
  }

  const applied = await store.applyEntityAssignment({
    entityKey: job.entityKey,
    entityType: job.entityType,
    artistFilename: job.artistFilename,
    mixIndex: job.mixIndex,
    imageUrl: generation.imageUrl,
    meta: generation.meta,
  });

  if (!applied || applied.applied === false) {
    const reason = (applied && applied.reason) || 'assignment-refused';

    // 'already-applied' is not a failure: this exact assignment is already durably persisted,
    // so the job's desired end state is true. It is reached whenever a job runs twice — the
    // 5-minute lease is never renewed, so a generate() slower than the lease lets a second
    // worker reclaim and finish it, and a crash between the Firestore write and
    // queue.complete() replays it too. Failing it marked a successfully-generated entity
    // FAILED, which getThumbnailStatus then reported to admins as a permanent failure,
    // inviting pointless retries against a record that was already correct.
    //
    // 'protected' deliberately still fails: an admin's uploaded/locked art won, so the
    // generated image is NOT what the record uses, and completing the job would record an
    // imageUrl that isn't live. It needs admin visibility, not a silent success.
    if (reason === 'already-applied') {
      await queue.complete(job.id, { imageUrl: generation.imageUrl, meta: generation.meta });
      logger.log(`[Skyline Worker] job ${job.id} already satisfied (${reason}) — marking done, not failed.`);
      return { ok: true, generation, applied, alreadySatisfied: reason };
    }

    await queue.fail(job.id, { code: 'assignment-refused', message: reason });
    logger.warn(`[Skyline Worker] job ${job.id} assignment refused: ${reason}`);
    return { ok: false, error: { code: 'assignment-refused', message: reason } };
  }

  await queue.complete(job.id, { imageUrl: generation.imageUrl, meta: generation.meta });
  logger.log(`[Skyline Worker] job ${job.id} done: ${generation.imageUrl}`);
  return { ok: true, generation, applied };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!skylineThumbnailsEnabled(process.env)) {
    console.log('[Skyline Worker] SKYLINE_THUMBNAILS_ENABLED is not on. Exiting without doing anything.');
    process.exitCode = 0;
    return;
  }

  const catalogModule = await importOptional('../lib/skyline/catalog.js', 'lib/skyline/catalog.js (Workstream A)');
  const serviceModule = await importOptional('./lib/SkylineThumbnailService.js', 'worker/lib/SkylineThumbnailService.js (Workstream A)');

  if (!catalogModule || !serviceModule) {
    console.error('[Skyline Worker] Source catalog / thumbnail service not available yet. Nothing to do.');
    process.exitCode = 1;
    return;
  }

  initializeFirebaseAdmin();
  const db = getFirestore();
  const storage = getStorage();
  const bucket = storage.bucket();

  const catalog = catalogModule.loadCatalog({});
  const service = serviceModule.createSkylineThumbnailService({
    catalog,
    storage: {
      download: async ({ storagePath, destPath }) => {
        await bucket.file(storagePath).download({ destination: destPath });
      },
      upload: async ({ localPath, storagePath, contentType, metadata }) => {
        await bucket.upload(localPath, {
          destination: storagePath,
          contentType,
          metadata: { cacheControl: 'public, max-age=31536000, immutable', metadata },
        });
        // Required: the bucket is not public and uniform bucket-level access is
        // off, so without this the publicUrl below 403s for site visitors.
        // Same fix as scripts/skyline-thumbnails.mjs — keep the two in sync.
        await bucket.file(storagePath).makePublic();
        return {
          publicUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
          generation: null,
        };
      },
    },
  });
  const store = createAssignmentStore({ db });
  const queue = createThumbnailJobQueue({ db });

  let processed = 0;
  try {
    // eslint-disable-next-line no-constant-condition
    while (processed < args.max) {
      let job;
      if (args.job) {
        // eslint-disable-next-line no-await-in-loop
        const doc = await db.collection('skyline_thumbnail_jobs').doc(args.job).get();
        if (!doc.exists) {
          console.error(`[Skyline Worker] No such job: ${args.job}`);
          process.exitCode = 1;
          return;
        }
        job = { id: doc.id, ...doc.data() };
      } else {
        // eslint-disable-next-line no-await-in-loop
        job = await queue.claimNext();
      }

      if (!job) {
        console.log(`[Skyline Worker] No claimable jobs. Processed ${processed}.`);
        break;
      }

      // eslint-disable-next-line no-await-in-loop
      await processJob({ job, service, store, queue, dryRun: args.dryRun });
      processed += 1;

      if (args.job || args.once) break;
    }
  } finally {
    // The service caches every downloaded source video (~10-22MB each, up to ~2GB across the
    // full 140-source catalog) for the life of the instance and only releases them here.
    // Without this the tmp dir grows on EVERY run — dry runs included, since the analysis pass
    // downloads sources regardless of dryRun — and unboundedly on a long-lived worker.
    // In `finally` so a crash or early return still releases the disk.
    await service.cleanup().catch((err) => {
      console.warn('[Skyline Worker] cleanup() failed (non-fatal):', err.message);
    });
  }

  if (args.sync) {
    const syncModule = await importOptional('../lib/WebsiteSync.js', 'lib/WebsiteSync.js');
    if (syncModule && typeof syncModule.syncFirebaseToWebsiteJSON === 'function') {
      await syncModule.syncFirebaseToWebsiteJSON(db, 'website');
      console.log('[Skyline Worker] --sync: synced Firebase to website/artists.json');
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  main().catch((err) => {
    console.error('[Skyline Worker] Fatal error:', err.message);
    process.exitCode = 1;
  });
}
