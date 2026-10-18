// tests/skyline-cross-run-uniqueness.test.mjs — Job B: persistent cross-run
// uniqueness. Proves that the collision-avoidance set is no longer per-batch
// only: a SECOND, separately-instantiated run (simulating a separate process)
// seeded from store.readUsedIndex() never re-picks a candidateId already
// assigned by an earlier run, and never picks a dHash within
// maxDHashHammingForDuplicate of one already assigned -- including a
// counterfactual proving the collision is real (and the fix matters) when
// `used` is NOT seeded, and that `--ignore-used-index` deliberately restores
// that old (colliding) behaviour at the CLI level.
//
// Uses the REAL lib/skyline/{keys,catalog,selection,imageAnalysis}.js and the
// REAL SkylineAssignmentStore.js + SkylineThumbnailService.js, with a fake
// in-memory Firestore (no credentials) and a fake ffmpeg runner (no real
// binary) -- consistent with how the other skyline-*.test.mjs files stay
// hermetic under `npm test` from the repo root.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';
import { createSkylineThumbnailService } from '../worker/lib/SkylineThumbnailService.js';
import { buildImageMeta } from '../lib/skyline/records.js';
import { deriveMixKey } from '../lib/skyline/keys.js';
import { hammingHex } from '../lib/skyline/imageAnalysis.js';
import { createFakeFirestore } from './skyline-assignment-store.test.mjs';
import { runCli } from '../scripts/skyline-thumbnails.mjs';

/* ---------------------------------------------------------------- fixture
 * Two real mix fixtures under one artist, brute-force-picked (see report)
 * so that with an EMPTY collision-avoidance set, selectCandidate's
 * `start = seed % n` lands on the SAME candidate for both, over a 3-source,
 * single-candidate-each catalog. This is a genuine, reproducible collision
 * opportunity -- not a contrived stub -- so the test proves the fix actually
 * does something.
 * ------------------------------------------------------------------- */

const ARTIST_FILENAME = 'crossrun-artist';
const MIX_A = { mixTitle: 'Cross Run Mix 1', mixArweaveURL: 'https://arweave.net/CROSSRUN1', mixImageFilename: '' };
const MIX_B = { mixTitle: 'Cross Run Mix 2', mixArweaveURL: 'https://arweave.net/CROSSRUN2', mixImageFilename: '' };
const MIX_A_KEY = deriveMixKey({ artistFilename: ARTIST_FILENAME, ...MIX_A });
const MIX_B_KEY = deriveMixKey({ artistFilename: ARTIST_FILENAME, ...MIX_B });

function buildFixtureArtists() {
  return [{ artistFilename: ARTIST_FILENAME, artistName: 'Cross Run Artist', artistImageFilename: 'https://cdn/existing-artist.jpg', mixes: [{ ...MIX_A }, { ...MIX_B }] }];
}

/* ----------------------------------------------------- fake ffmpeg + catalog
 * Mirrors tests/skyline-thumbnail-service.test.mjs's fakes (kept local so
 * this file is self-contained). Every candidate scores as "good" -- the
 * point of this suite is collision avoidance, not quality gating.
 * ------------------------------------------------------------------- */

const ANALYSIS_SIZE = 256;

function grayBuffer(width, height, fn) {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) buf[y * width + x] = fn(x, y);
  return buf;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function makeGoodRaster(candidateId) {
  const phase = (simpleHash(candidateId) % 4) * 8;
  const blockSize = 32;
  return grayBuffer(ANALYSIS_SIZE, ANALYSIS_SIZE, (x, y) => {
    const bx = Math.floor((x + phase) / blockSize);
    const by = Math.floor(y / blockSize);
    return (bx + by) % 2 === 0 ? 60 : 196;
  });
}

function parseFfArgs(args) {
  const ssIdx = args.indexOf('-ss');
  const iIdx = args.indexOf('-i');
  const timeSec = parseFloat(args[ssIdx + 1]);
  const srcPath = args[iIdx + 1];
  const basename = path.basename(srcPath);
  const sourceVideoId = basename.replace(/^src-/, '').replace(/\.[^.]+$/, '');
  const candidateId = `${sourceVideoId}@${timeSec.toFixed(2)}`;
  const isRender = args.includes('libwebp');
  const outPath = isRender ? args[args.length - 1] : null;
  return { candidateId, isRender, outPath };
}

function makeFakeRunFfmpeg() {
  return async ({ args }) => {
    const parsed = parseFfArgs(args);
    if (parsed.isRender) {
      await fsp.writeFile(parsed.outPath, Buffer.from(`WEBP-FAKE-${parsed.candidateId}`, 'utf8'));
      return { stdout: Buffer.alloc(0), stderr: '' };
    }
    return { stdout: makeGoodRaster(parsed.candidateId), stderr: '' };
  };
}

function makeFakeStorage() {
  const uploads = [];
  return {
    uploads,
    async download({ storagePath, destPath }) {
      await fsp.writeFile(destPath, Buffer.from('fake-source-video-bytes'));
    },
    async upload({ localPath, storagePath }) {
      uploads.push(storagePath);
      return { publicUrl: `https://fake.example/${storagePath}`, generation: '1' };
    }
  };
}

function makeCatalog() {
  return {
    catalogVersion: 1,
    assignmentVersionDefault: 1,
    bucket: 'x',
    output: { storagePrefix: 'website/generated-thumbnails/v1', size: 960, quality: 82, format: 'webp' },
    sampling: { fractions: [0.5], jitterSeconds: 0 },
    quality: { minLuminance: 0, maxLuminance: 255, minStdDev: 0, minLaplacianVar: 0, maxDHashHammingForDuplicate: 6 },
    sources: ['s1', 's2', 's3'].map((id) => ({
      id,
      storagePath: `skyline/${id}.mov`,
      publicUrl: `https://storage.googleapis.com/bucket/skyline/${id}.mov`,
      contentType: 'video/quicktime',
      sizeBytes: 1000,
      durationSec: 20,
      width: 1920,
      height: 1080,
      collection: 'skyline',
      enabled: true,
      excludeRanges: [],
      notes: ''
    }))
  };
}

function withFlagEnabled(fn) {
  const prev = process.env.SKYLINE_THUMBNAILS_ENABLED;
  process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
      else process.env.SKYLINE_THUMBNAILS_ENABLED = prev;
    });
}

let workDir;
function freshTmpRoot(name) {
  if (!workDir) workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-cross-run-'));
  const p = path.join(workDir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/* ------------------------------------------------------------------ tests */

describe('Job B: cross-run uniqueness -- separate service instances sharing a persisted store', () => {
  test('sanity: with an EMPTY used set, both fixture mixes deterministically collide on the same candidate (the bug this fix closes)', async () => {
    const catalog = makeCatalog();
    const serviceA = createSkylineThumbnailService({ catalog, storage: makeFakeStorage(), runFfmpeg: makeFakeRunFfmpeg(), tmpRoot: freshTmpRoot('sanity-a') });
    const serviceB = createSkylineThumbnailService({ catalog, storage: makeFakeStorage(), runFfmpeg: makeFakeRunFfmpeg(), tmpRoot: freshTmpRoot('sanity-b') });

    const resultA = await serviceA.generate({ entityType: 'mix', stableKey: MIX_A_KEY, assignmentVersion: 1, used: { candidateIds: new Set(), dHashes: [] }, dryRun: false });
    const resultB = await serviceB.generate({ entityType: 'mix', stableKey: MIX_B_KEY, assignmentVersion: 1, used: { candidateIds: new Set(), dHashes: [] }, dryRun: false });

    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);
    assert.equal(resultA.meta.candidateId, resultB.meta.candidateId, 'fixture must reproduce a genuine collision when used is not seeded');
    assert.equal(resultA.meta.dHash, resultB.meta.dHash);
  });

  test('run N persists its assignment; run N+1 (a fresh service instance) seeded from store.readUsedIndex() never re-picks that candidateId or a near-duplicate dHash', async () => {
    await withFlagEnabled(async () => {
      const catalog = makeCatalog();
      const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
      const store = createAssignmentStore({ db, now: () => new Date('2026-09-12T00:00:00.000Z') });

      // --- RUN N: a fresh service instance, empty used (first-ever run) ---
      const serviceN = createSkylineThumbnailService({ catalog, storage: makeFakeStorage(), runFfmpeg: makeFakeRunFfmpeg(), tmpRoot: freshTmpRoot('run-n') });
      const usedN = await store.readUsedIndex();
      assert.equal(usedN.candidateIds.size, 0, 'nothing persisted yet');

      const resultN = await serviceN.generate({ entityType: 'mix', stableKey: MIX_A_KEY, assignmentVersion: 1, used: usedN, dryRun: false });
      assert.equal(resultN.ok, true);

      const applyResultN = await store.applyEntityAssignment({
        entityKey: MIX_A_KEY,
        entityType: 'mix',
        artistFilename: ARTIST_FILENAME,
        mixIndex: 0,
        imageUrl: resultN.imageUrl,
        meta: buildImageMeta({ generatedMeta: resultN.meta })
      });
      assert.equal(applyResultN.applied, true, 'run N assignment must persist');

      // --- RUN N+1: a genuinely SEPARATE service instance (own tmpRoot, own
      // caches -- simulates a separate process), seeded from the durable index.
      const serviceN1 = createSkylineThumbnailService({ catalog, storage: makeFakeStorage(), runFfmpeg: makeFakeRunFfmpeg(), tmpRoot: freshTmpRoot('run-n-plus-1') });
      const usedN1 = await store.readUsedIndex();
      assert.ok(usedN1.candidateIds.has(resultN.meta.candidateId), "run N+1 must load run N's candidateId from the persisted index");
      assert.ok(usedN1.dHashes.includes(resultN.meta.dHash));

      const resultN1 = await serviceN1.generate({ entityType: 'mix', stableKey: MIX_B_KEY, assignmentVersion: 1, used: usedN1, dryRun: false });
      assert.equal(resultN1.ok, true);

      assert.notEqual(resultN1.meta.candidateId, resultN.meta.candidateId, 'run N+1 must never re-pick a candidateId already assigned by run N');
      const maxHamming = catalog.quality.maxDHashHammingForDuplicate;
      assert.ok(
        hammingHex(resultN1.meta.dHash, resultN.meta.dHash) > maxHamming,
        'run N+1 must never pick a dHash within maxDHashHammingForDuplicate of one already assigned by run N'
      );

      // And the second assignment's own index entry is now durable too.
      const applyResultN1 = await store.applyEntityAssignment({
        entityKey: MIX_B_KEY,
        entityType: 'mix',
        artistFilename: ARTIST_FILENAME,
        mixIndex: 1,
        imageUrl: resultN1.imageUrl,
        meta: buildImageMeta({ generatedMeta: resultN1.meta })
      });
      assert.equal(applyResultN1.applied, true);

      const finalUsed = await store.readUsedIndex();
      assert.equal(finalUsed.candidateIds.size, 2);
    });
  });
});

describe('Job B: --ignore-used-index restores the old (per-batch-only) behaviour at the CLI level', () => {
  // Each invocation is deliberately scoped to ONE entity via --mix-key, so
  // the pre-existing WITHIN-a-batch dedup (`used` accumulated across a
  // single CLI run, which already existed before Job B) can't mask what's
  // being tested here: whether a SECOND, separate CLI invocation avoids a
  // FIRST invocation's pick. That cross-run behavior is entirely down to
  // whether store.readUsedIndex() was consulted.
  async function runOnce({ tmpDir, db, mixKey, extraArgs = [], runId }) {
    const store = createAssignmentStore({ db, now: () => new Date('2026-09-12T00:00:00.000Z') });
    const catalog = makeCatalog();
    const service = createSkylineThumbnailService({ catalog, storage: makeFakeStorage(), runFfmpeg: makeFakeRunFfmpeg(), tmpRoot: freshTmpRoot(`cli-${runId}`) });
    return runCli(
      ['--apply', '--yes-i-approve-apply', '--target', 'mix', '--mix-key', mixKey, '--report-dir', tmpDir, '--json', ...extraArgs],
      {
        env: process.env,
        store,
        db,
        media: { available: true, catalog, service },
        now: () => new Date('2026-09-12T00:00:00.000Z'),
        runId,
        log: () => {},
        logError: () => {}
      }
    );
  }

  test("WITHOUT --ignore-used-index, a second CLI invocation avoids a first invocation's pick", async () => {
    await withFlagEnabled(async () => {
      const tmp1 = freshTmpRoot('cli-report-fixed-1');
      const tmp2 = freshTmpRoot('cli-report-fixed-2');
      const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });

      const resultN = await runOnce({ tmpDir: tmp1, db, mixKey: MIX_A_KEY, runId: 'cli-fixed-run-n' });
      assert.equal(resultN.exitCode, 0);
      const rowN = resultN.report.entities.find((e) => e.entityKey === MIX_A_KEY);
      assert.equal(rowN.applied, true);
      const candidateN = rowN.candidateId;
      assert.ok(candidateN);

      const resultN1 = await runOnce({ tmpDir: tmp2, db, mixKey: MIX_B_KEY, runId: 'cli-fixed-run-n1' });
      assert.equal(resultN1.exitCode, 0);
      const rowB = resultN1.report.entities.find((e) => e.entityKey === MIX_B_KEY);
      assert.equal(rowB.mediaStatus, 'proposed');
      assert.equal(rowB.applied, true);
      assert.notEqual(rowB.candidateId, candidateN, "the second CLI invocation must not re-pick the first invocation's candidate");
      assert.equal(resultN1.report.usedIndex.source, 'artists+index');
      assert.ok(resultN1.report.usedIndex.candidateIds >= 1);
    });
  });

  test('WITH --ignore-used-index, a second CLI invocation reverts to the old per-batch-only behaviour and re-collides', async () => {
    await withFlagEnabled(async () => {
      const tmp1 = freshTmpRoot('cli-report-ignore-1');
      const tmp2 = freshTmpRoot('cli-report-ignore-2');
      const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });

      const resultN = await runOnce({ tmpDir: tmp1, db, mixKey: MIX_A_KEY, runId: 'cli-ignore-run-n' });
      assert.equal(resultN.exitCode, 0);
      const candidateN = resultN.report.entities.find((e) => e.entityKey === MIX_A_KEY).candidateId;

      const resultN1 = await runOnce({ tmpDir: tmp2, db, mixKey: MIX_B_KEY, extraArgs: ['--ignore-used-index'], runId: 'cli-ignore-run-n1' });
      assert.equal(resultN1.exitCode, 0);
      assert.match(resultN1.report.usedIndex.source, /ignored/);
      assert.equal(resultN1.report.usedIndex.candidateIds, 0);

      const rowB = resultN1.report.entities.find((e) => e.entityKey === MIX_B_KEY);
      assert.equal(rowB.applied, true);
      // With the index ignored, mix B (a brand-new entity, never assigned
      // before) collides with mix A's earlier pick from a wholly separate
      // CLI invocation -- exactly the pre-Job-B bug, deliberately restored.
      assert.equal(rowB.candidateId, candidateN, '--ignore-used-index restores the old per-batch-only collision');
    });
  });
});
