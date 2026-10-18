// worker/lib/SkylineThumbnailService.js — service tests with a fully
// injected fake `runFfmpeg` and fake `storage`. No real ffmpeg binary and
// no Firebase credentials are touched: this file is imported (transitively,
// via SkylineThumbnailService.js) by `npm test` from the repo ROOT, whose
// node_modules has no ffmpeg package at all.
//
// Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.5.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createSkylineThumbnailService } from '../worker/lib/SkylineThumbnailService.js';
import { buildCandidateInventory } from '../lib/skyline/catalog.js';
import { seedFromKey } from '../lib/skyline/keys.js';
import { computeProbeOrder } from '../lib/skyline/selection.js';
import { dHashFromGrayRaster } from '../lib/skyline/imageAnalysis.js';

const __filename_ = fileURLToPath(import.meta.url);
const REPO_ROOT = path.join(path.dirname(__filename_), '..');
const REAL_FFMPEG_BIN = path.join(REPO_ROOT, 'worker', 'node_modules', 'ffmpeg-static', 'ffmpeg');
const SERVICE_MODULE_URL = pathToFileURL(path.join(REPO_ROOT, 'worker', 'lib', 'SkylineThumbnailService.js')).href;

const ANALYSIS_SIZE = 256;

function grayBuffer(width, height, fn) {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) buf[y * width + x] = fn(x, y);
  }
  return buf;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

function makeRasterFor(kind, candidateId) {
  if (kind === 'too-dark') return grayBuffer(ANALYSIS_SIZE, ANALYSIS_SIZE, () => 5);
  if (kind === 'too-bright') return grayBuffer(ANALYSIS_SIZE, ANALYSIS_SIZE, () => 250);
  if (kind === 'blurry') return grayBuffer(ANALYSIS_SIZE, ANALYSIS_SIZE, () => 128);
  // 'good': a high-contrast, sharp checkerboard whose phase depends on the
  // candidateId, so distinct candidates get distinct dHashes while sharing
  // identical mean/stdDev/laplacian (all 'good' candidates pass quality
  // equally, so which one "wins" is governed purely by probe order/dedup).
  //
  // Block size 32 (vs. the 9x8 dHash downsample grid) and a phase snapped
  // to one of 4 widely-spaced values (0/8/16/24) is deliberate: empirically
  // verified (see final report) so that ANY two distinct phase buckets are
  // >6 bits apart (the contract's example maxDHashHammingForDuplicate) —
  // a finer-grained or unsnapped phase collapses under the 9x8 box-average
  // and can put two genuinely distinct "good" candidates within the
  // dedup threshold purely by chance.
  const phase = (simpleHash(candidateId) % 4) * 8;
  const blockSize = 32;
  return grayBuffer(ANALYSIS_SIZE, ANALYSIS_SIZE, (x, y) => {
    const bx = Math.floor((x + phase) / blockSize);
    const by = Math.floor(y / blockSize);
    return (bx + by) % 2 === 0 ? 60 : 196;
  });
}

function goodDHash(candidateId) {
  return dHashFromGrayRaster(makeRasterFor('good', candidateId), ANALYSIS_SIZE, ANALYSIS_SIZE);
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
  return { timeSec, srcPath, sourceVideoId, candidateId, isRender, outPath };
}

function renderBytesFor(candidateId) {
  return Buffer.from(`WEBP-FAKE-${candidateId}`, 'utf8');
}

function makeFakeRunFfmpeg({ plan = {}, failAnalysisFor = null, failRenderFor = null } = {}) {
  const calls = [];
  const fn = async ({ args, expectStdout }) => {
    calls.push({ args, expectStdout });
    const parsed = parseFfArgs(args);
    if (parsed.isRender) {
      if (failRenderFor === parsed.candidateId) throw new Error('simulated render failure');
      await fsp.writeFile(parsed.outPath, renderBytesFor(parsed.candidateId));
      return { stdout: Buffer.alloc(0), stderr: '' };
    }
    if (failAnalysisFor === parsed.candidateId) throw new Error('simulated ffmpeg analysis failure');
    const kind = plan[parsed.candidateId] || 'good';
    return { stdout: makeRasterFor(kind, parsed.candidateId), stderr: '' };
  };
  return { fn, calls };
}

function makeFakeStorage({ failDownloadFor = null, failUpload = false } = {}) {
  const downloadCalls = [];
  const uploadCalls = [];
  const storage = {
    async download({ storagePath, destPath }) {
      downloadCalls.push({ storagePath, destPath });
      if (failDownloadFor && storagePath.includes(failDownloadFor)) {
        throw new Error('simulated download failure');
      }
      await fsp.writeFile(destPath, Buffer.from('fake-source-video-bytes'));
    },
    async upload({ localPath, storagePath, contentType, metadata }) {
      uploadCalls.push({ localPath, storagePath, contentType, metadata });
      if (failUpload) throw new Error('simulated upload failure');
      return { publicUrl: `https://fake.example/${storagePath}`, generation: '1' };
    }
  };
  return { storage, downloadCalls, uploadCalls };
}

function makeCatalog({ sourceIds, fractions = [0.5], durationSec = 20 } = {}) {
  return {
    catalogVersion: 1,
    assignmentVersionDefault: 1,
    bucket: 'editvideos-63486.firebasestorage.app',
    output: { storagePrefix: 'website/generated-thumbnails/v1', size: 960, quality: 82, format: 'webp' },
    sampling: { fractions, jitterSeconds: 0 },
    quality: { minLuminance: 18, maxLuminance: 238, minStdDev: 12, minLaplacianVar: 8, maxDHashHammingForDuplicate: 6 },
    sources: sourceIds.map((id) => ({
      id,
      storagePath: `skyline/${id}.mov`,
      publicUrl: `https://storage.googleapis.com/bucket/skyline/${id}.mov`,
      contentType: 'video/quicktime',
      sizeBytes: 1000,
      durationSec,
      width: 1920,
      height: 1080,
      collection: 'skyline',
      enabled: true,
      excludeRanges: [],
      notes: ''
    }))
  };
}

let workDir;
before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-svc-test-'));
});
after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function freshTmpRoot(name) {
  const p = path.join(workDir, name);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

describe('createSkylineThumbnailService construction', () => {
  test('throws synchronously when storage is missing download/upload', () => {
    assert.throws(() => createSkylineThumbnailService({ catalog: makeCatalog({ sourceIds: ['a'] }), storage: {} }));
  });
});

describe('generate() — happy path', () => {
  test('produces ok:true with a well-formed meta object and uploads to the versioned storage path', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a', 'skyline-b', 'skyline-c'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage, uploadCalls } = makeFakeStorage();
    const service = createSkylineThumbnailService({
      catalog,
      storage,
      runFfmpeg,
      tmpRoot: freshTmpRoot('happy')
    });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'abcd1234abcd1234',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, true);
    assert.equal(result.rejected.length, 0);
    assert.ok(result.probeCount >= 1);
    // Default treatment is v2, so the asset carries the treatment suffix. v1 assets
    // keep their unsuffixed path (asserted separately below) because they are already
    // published with immutable caching.
    assert.equal(result.imageUrl, `https://fake.example/website/generated-thumbnails/v1/mix/abcd1234abcd1234-v1t2.webp`);

    const meta = result.meta;
    assert.equal(meta.origin, 'generated-skyline');
    assert.equal(meta.assignmentVersion, 1);
    assert.equal(meta.locked, false);
    assert.equal(meta.serviceVersion, 1);
    assert.equal(meta.width, 960);
    assert.equal(meta.height, 960);
    assert.equal(meta.storagePath, 'website/generated-thumbnails/v1/mix/abcd1234abcd1234-v1t2.webp');
    assert.equal(meta.treatmentVersion, 2);
    assert.match(meta.dHash, /^[0-9a-f]{16}$/);
    assert.match(meta.candidateId, /^skyline-[abc]@\d+\.\d{2}$/);

    const expectedBytes = renderBytesFor(meta.candidateId);
    assert.equal(meta.bytes, expectedBytes.length);
    assert.equal(meta.contentHash, createHash('sha256').update(expectedBytes).digest('hex'));

    assert.equal(uploadCalls.length, 1);
    assert.equal(uploadCalls[0].contentType, 'image/webp');
    assert.equal(uploadCalls[0].metadata.cacheControl, 'public, max-age=31536000, immutable');
  });

  test('dryRun writes a preview file to previewDir, never uploads, and imageUrl is ""', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage, uploadCalls } = makeFakeStorage();
    const previewDir = freshTmpRoot('preview-out');
    const service = createSkylineThumbnailService({
      catalog,
      storage,
      runFfmpeg,
      tmpRoot: freshTmpRoot('dryrun-tmp')
    });

    const result = await service.generate({
      entityType: 'artist',
      stableKey: 'ffff0000ffff0000',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: true,
      previewDir
    });

    assert.equal(result.ok, true);
    assert.equal(result.imageUrl, '');
    assert.equal(uploadCalls.length, 0);
    assert.ok(fs.existsSync(result.localPath));
    assert.equal(result.localPath, path.join(previewDir, 'artist-ffff0000ffff0000-v1t2.webp'));
  });

  test('dryRun without previewDir fails with catalog-invalid', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('no-preview-dir') });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'abcd1234abcd1234',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: true
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'catalog-invalid');
  });
});

describe('generate() — candidate rejection and fallback', () => {
  test('a too-dark first-probed candidate is rejected and recorded; the next candidate wins', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a', 'skyline-b'] });
    const candidates = buildCandidateInventory(catalog);
    const stableKey = 'aaaa1111aaaa1111';
    const assignmentVersion = 1;
    const entityType = 'mix';
    const seed = seedFromKey({ entityType, stableKey, assignmentVersion });
    const order = computeProbeOrder({ n: candidates.length, seed });
    const first = candidates[order[0]];
    const second = candidates[order[1]];

    const { fn: runFfmpeg, calls } = makeFakeRunFfmpeg({ plan: { [first.candidateId]: 'too-dark' } });
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('reject-fallback') });

    const result = await service.generate({
      entityType,
      stableKey,
      assignmentVersion,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, true);
    assert.equal(result.meta.candidateId, second.candidateId);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].candidateId, first.candidateId);
    assert.ok(result.rejected[0].reasons.includes('too-dark'));
    assert.equal(result.probeCount, 2);

    // Two ffmpeg passes total for the winner (analysis + render) plus one
    // analysis-only pass for the rejected candidate = 3 calls.
    assert.equal(calls.length, 3);
  });

  test('every candidate ineligible => ok:false with code no-eligible-candidate', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a', 'skyline-b', 'skyline-c'] });
    const candidates = buildCandidateInventory(catalog);
    const plan = {};
    for (const c of candidates) plan[c.candidateId] = 'too-dark';
    const { fn: runFfmpeg } = makeFakeRunFfmpeg({ plan });
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('exhausted') });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'bbbb2222bbbb2222',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'no-eligible-candidate');
    assert.equal(result.rejected, undefined); // failure shape has no rejected/probeCount per contract
  });

  test('a near-duplicate dHash (within maxDHashHamming of used.dHashes) is skipped in favor of the next candidate', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a', 'skyline-b'] });
    const candidates = buildCandidateInventory(catalog);
    const stableKey = 'cccc3333cccc3333';
    const assignmentVersion = 1;
    const entityType = 'mix';
    const seed = seedFromKey({ entityType, stableKey, assignmentVersion });
    const order = computeProbeOrder({ n: candidates.length, seed });
    const first = candidates[order[0]];
    const second = candidates[order[1]];

    const dupHash = goodDHash(first.candidateId); // exactly what the service will compute for `first`

    const { fn: runFfmpeg } = makeFakeRunFfmpeg(); // both candidates score as 'good'
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('dedup') });

    const result = await service.generate({
      entityType,
      stableKey,
      assignmentVersion,
      used: { candidateIds: new Set(), dHashes: [dupHash] },
      dryRun: false
    });

    assert.equal(result.ok, true);
    assert.equal(result.meta.candidateId, second.candidateId);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0].candidateId, first.candidateId);
    assert.deepEqual(result.rejected[0].reasons, ['near-duplicate']);
  });
});

describe('generate() — error mapping (never throws)', () => {
  test('a source-download failure maps to code source-download-failed', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage({ failDownloadFor: 'skyline-a' });
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('dl-fail') });

    await assert.doesNotReject(async () => {
      const result = await service.generate({
        entityType: 'mix',
        stableKey: 'dddd4444dddd4444',
        assignmentVersion: 1,
        used: { candidateIds: new Set(), dHashes: [] },
        dryRun: false
      });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, 'source-download-failed');
    });
  });

  test('an analysis-pass ffmpeg failure maps to code ffmpeg-failed', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const candidates = buildCandidateInventory(catalog);
    const { fn: runFfmpeg } = makeFakeRunFfmpeg({ failAnalysisFor: candidates[0].candidateId });
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('analysis-fail') });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'eeee5555eeee5555',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'ffmpeg-failed');
  });

  test('a final-render failure maps to code encode-failed', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const candidates = buildCandidateInventory(catalog);
    const { fn: runFfmpeg } = makeFakeRunFfmpeg({ failRenderFor: candidates[0].candidateId });
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('render-fail') });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'ffff6666ffff6666',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'encode-failed');
  });

  test('an upload failure maps to code upload-failed', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage({ failUpload: true });
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('upload-fail') });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: '1111aaaa1111aaaa',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'upload-failed');
  });

  test('an invalid catalog maps to code catalog-invalid', async () => {
    const badCatalog = makeCatalog({ sourceIds: ['skyline-a'] });
    badCatalog.sources = [];
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog: badCatalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('bad-catalog') });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: '2222bbbb2222bbbb',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'catalog-invalid');
  });

  test('bad input (missing stableKey / bad entityType) maps to catalog-invalid without touching storage', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage, downloadCalls } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('bad-input') });

    const r1 = await service.generate({
      entityType: 'nonsense',
      stableKey: 'abcd1234abcd1234',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }
    });
    assert.equal(r1.error.code, 'catalog-invalid');

    const r2 = await service.generate({
      entityType: 'mix',
      stableKey: '',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }
    });
    assert.equal(r2.error.code, 'catalog-invalid');

    assert.equal(downloadCalls.length, 0);
  });
});

describe('generate() — determinism and source-download caching', () => {
  test('the same stableKey run twice picks the identical candidateId and produces the identical contentHash', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a', 'skyline-b', 'skyline-c', 'skyline-d'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage, downloadCalls } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('determinism') });

    const args = {
      entityType: 'mix',
      stableKey: '3333cccc3333cccc',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    };

    const r1 = await service.generate(args);
    const r2 = await service.generate({ ...args, used: { candidateIds: new Set(), dHashes: [] } });

    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r1.meta.candidateId, r2.meta.candidateId);
    assert.equal(r1.meta.contentHash, r2.meta.contentHash);
    assert.equal(r1.meta.dHash, r2.meta.dHash);

    // Second call reused the cached source download for that sourceVideoId.
    const winningSourceDownloads = downloadCalls.filter((c) => c.storagePath.includes(r1.meta.sourceVideoId));
    assert.equal(winningSourceDownloads.length, 1);
  });

  test('a single-source catalog reuses the cached download across two DIFFERENT entities', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-only'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage, downloadCalls } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('cross-entity-cache') });

    const r1 = await service.generate({
      entityType: 'mix',
      stableKey: '4444dddd4444dddd',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });
    const r2 = await service.generate({
      entityType: 'artist',
      stableKey: '5555eeee5555eeee',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(downloadCalls.length, 1); // one source, downloaded once, reused for the second entity
  });

  test('cleanup() removes cached source downloads from disk', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-cleanup'] });
    const { fn: runFfmpeg } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const tmpRoot = freshTmpRoot('cleanup');
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: '6666ffff6666ffff',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });
    assert.equal(result.ok, true);

    const srcPath = path.join(tmpRoot, 'src-skyline-cleanup.mov');
    assert.ok(fs.existsSync(srcPath));

    await service.cleanup();
    assert.ok(!fs.existsSync(srcPath));
  });
});

/* -------------------------------------------------------------------------
 * Job A visual treatment — black-and-white/grainy/cinematic final render.
 * These use the fake ffmpeg runner (no real binary) to inspect the exact
 * -vf chain the render pass sends, proving: the analysis pass is untouched,
 * the treatment config drives the render chain, an unreadable/missing
 * treatment file falls back to the baked-in default instead of throwing,
 * and the noise filter's all_seed is derived deterministically from the
 * same seedFromKey() used for candidate selection (never random/time-based).
 * ---------------------------------------------------------------------- */

function findRenderArgs(calls) {
  const call = calls.find((c) => c.args.includes('libwebp'));
  const vfIdx = call.args.indexOf('-vf');
  return { vf: call.args[vfIdx + 1], args: call.args };
}

function findAnalysisArgs(calls) {
  const call = calls.find((c) => !c.args.includes('libwebp'));
  const vfIdx = call.args.indexOf('-vf');
  return { vf: call.args[vfIdx + 1], args: call.args };
}

describe('generate() — visual treatment (Job A: black-and-white/grainy/cinematic final render)', () => {
  test('the analysis pass -vf is byte-for-byte unchanged: no eq/noise/vignette, still gray+256x256', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg, calls } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot: freshTmpRoot('treatment-analysis-untouched') });

    await service.generate({
      entityType: 'mix',
      stableKey: 'treat0001treat01',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    const { vf, args } = findAnalysisArgs(calls);
    assert.equal(vf, "crop='min(iw,ih)':'min(iw,ih)',scale=256:256");
    assert.ok(args.includes('gray')); // -pix_fmt gray, unrelated to the render treatment's format=gray
    assert.ok(!vf.includes('eq='));
    assert.ok(!vf.includes('noise='));
    assert.ok(!vf.includes('vignette='));
  });

  test('the render pass -vf applies the injected treatment: monochrome, eq, unsharp, noise, vignette, in that order', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg, calls } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const treatment = {
      treatmentVersion: 1,
      monochrome: true,
      contrast: 1.3,
      brightness: -0.03,
      gamma: 0.95,
      unsharpAmount: 0.55,
      grainStrength: 16,
      vignetteStrength: 0.3,
      encodeQuality: 77
    };
    const service = createSkylineThumbnailService({
      catalog,
      storage,
      runFfmpeg,
      treatment,
      tmpRoot: freshTmpRoot('treatment-render-injected')
    });

    await service.generate({
      entityType: 'mix',
      stableKey: 'treat0002treat02',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    const { vf, args } = findRenderArgs(calls);
    assert.match(vf, /^crop='min\(iw,ih\)':'min\(iw,ih\)',scale=960:960:flags=lanczos,format=gray,eq=contrast=1\.3:brightness=-0\.03:gamma=0\.95:saturation=0,unsharp=5:5:0\.55:5:5:0\.0,noise=alls=16:allf=u:all_seed=\d+,vignette=angle=[\d.]+,format=gray$/);

    // encodeQuality from the treatment config is authoritative for the render.
    const qIdx = args.indexOf('-quality');
    assert.equal(args[qIdx + 1], '77');
  });

  test('a missing/unreadable treatment file falls back to the baked-in default rather than throwing', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg, calls } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({
      catalog,
      storage,
      runFfmpeg,
      treatmentPath: path.join(os.tmpdir(), 'does-not-exist-skyline-treatment', `nope-${Date.now()}.json`),
      tmpRoot: freshTmpRoot('treatment-missing-file')
    });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'treat0003treat03',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    assert.equal(result.ok, true); // never throws when the file is absent
    const { vf } = findRenderArgs(calls);
    // Baked-in default values (identical to config/skyline-thumbnail-treatment.json,
    // which is treatmentVersion 2: normalise + fixed tone curve + CRT scanlines).
    assert.match(vf, /normalize=blackpt=black:whitept=white:smoothing=0/);
    assert.match(vf, /curves=master='0\/0 0\.18\/0\.06 0\.45\/0\.45 0\.80\/0\.93 1\/1'/);
    assert.match(vf, /geq=lum=/);
    assert.match(vf, /noise=alls=12:/);
  });

  test('the noise filter all_seed is derived from seedFromKey() and is identical across two calls with the same key, different for a different assignmentVersion', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a', 'skyline-b', 'skyline-c', 'skyline-d'] });

    // Fresh runner + fresh service per call so each `calls` array holds
    // exactly that one generate() invocation's ffmpeg calls — reusing one
    // shared array across calls would make findRenderArgs() (which returns
    // the FIRST libwebp call) silently inspect only the first invocation.
    async function seedFor(assignmentVersion) {
      const { fn: runFfmpeg, calls } = makeFakeRunFfmpeg();
      const { storage } = makeFakeStorage();
      const service = createSkylineThumbnailService({
        catalog,
        storage,
        runFfmpeg,
        tmpRoot: freshTmpRoot(`treatment-seed-derivation-v${assignmentVersion}-${Math.random().toString(16).slice(2)}`)
      });
      await service.generate({
        entityType: 'mix',
        stableKey: 'seedcheck0000001',
        assignmentVersion,
        used: { candidateIds: new Set(), dHashes: [] },
        dryRun: false
      });
      return findRenderArgs(calls).vf.match(/all_seed=(\d+)/)[1];
    }

    const seed1 = await seedFor(1);
    const seed2 = await seedFor(1);
    const seed3 = await seedFor(2); // different assignmentVersion -> different seed

    assert.equal(seed1, seed2, 'same entity+version must produce the identical noise seed');
    assert.notEqual(seed1, seed3, 'a different assignmentVersion must produce a different noise seed');

    const expectedSeed = seedFromKey({ entityType: 'mix', stableKey: 'seedcheck0000001', assignmentVersion: 1 }) % 2147483647;
    assert.equal(Number(seed1), expectedSeed);
    assert.ok(Number(seed1) <= 2147483647 && Number(seed1) >= 0, 'seed must be within ffmpeg all_seed valid range');
  });

  test('monochrome:false skips desaturation and format=gray entirely', async () => {
    const catalog = makeCatalog({ sourceIds: ['skyline-a'] });
    const { fn: runFfmpeg, calls } = makeFakeRunFfmpeg();
    const { storage } = makeFakeStorage();
    const service = createSkylineThumbnailService({
      catalog,
      storage,
      runFfmpeg,
      treatment: { monochrome: false, grainStrength: 0, vignetteStrength: 0, unsharpAmount: 0 },
      tmpRoot: freshTmpRoot('treatment-monochrome-off')
    });

    await service.generate({
      entityType: 'mix',
      stableKey: 'mono0falsemono01',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false
    });

    const { vf } = findRenderArgs(calls);
    assert.ok(!vf.includes('format=gray'));
    assert.ok(!vf.includes('unsharp='));
    assert.ok(!vf.includes('noise='));
    assert.ok(!vf.includes('vignette='));
    // v2 grades through `curves`, which is channel-agnostic, so no saturation
    // directive is emitted at all — the point of the test (nothing desaturates
    // the frame) still holds, and is asserted directly.
    assert.ok(!vf.includes('saturation=0'));
  });
});

/* -------------------------------------------------------------------------
 * Real-ffmpeg proof: byte-identical output across two genuinely SEPARATE
 * node processes (not just two calls in-process), plus a real pixel-level
 * monochrome check. Uses the actual worker/node_modules/ffmpeg-static
 * binary and a synthetic lavfi test source (no network, no real footage
 * needed) so this stays hermetic and fast. Skips gracefully if the bundled
 * binary is somehow absent instead of failing the whole suite.
 * ---------------------------------------------------------------------- */

describe('generate() — real ffmpeg: cross-process determinism + monochrome proof (contract Job A #4)', () => {
  const hasRealFfmpeg = fs.existsSync(REAL_FFMPEG_BIN);

  test('same key+version+candidate ⇒ byte-identical WebP across two separate OS processes', { skip: !hasRealFfmpeg && 'ffmpeg-static binary not found' }, () => {
    const workDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-real-ffmpeg-'));
    try {
      const srcVideo = path.join(workDir2, 'synthetic-src.mp4');
      execFileSync(REAL_FFMPEG_BIN, [
        '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc=size=1920x1080:rate=1:duration=3',
        '-pix_fmt', 'yuv420p', '-y', srcVideo
      ]);

      const childScript = path.join(workDir2, 'run-once.mjs');
      fs.writeFileSync(
        childScript,
        `
        import { createSkylineThumbnailService } from ${JSON.stringify(SERVICE_MODULE_URL)};
        import fsp from 'node:fs/promises';

        const [, , srcVideo, previewDir, outLabel] = process.argv;

        const catalog = {
          catalogVersion: 1, assignmentVersionDefault: 1, bucket: 'x',
          output: { storagePrefix: 'website/generated-thumbnails/v1', size: 960, quality: 82, format: 'webp' },
          sampling: { fractions: [0.5], jitterSeconds: 0 },
          quality: { minLuminance: 0, maxLuminance: 255, minStdDev: 0, minLaplacianVar: 0, maxDHashHammingForDuplicate: 6 },
          sources: [{
            id: 'synthetic-1', storagePath: 'skyline/synthetic-1.mp4',
            publicUrl: 'https://example.com/synthetic-1.mp4', contentType: 'video/mp4',
            sizeBytes: 1000, durationSec: 3, width: 1920, height: 1080,
            collection: 'skyline', enabled: true, excludeRanges: [], notes: ''
          }]
        };
        const storage = {
          async download({ destPath }) { await fsp.copyFile(srcVideo, destPath); },
          async upload() { throw new Error('upload should never be called (dryRun)'); }
        };
        const service = createSkylineThumbnailService({ catalog, storage, tmpRoot: previewDir + '-tmp' });
        const result = await service.generate({
          entityType: 'mix',
          stableKey: 'realffmpegdeterm',
          assignmentVersion: 1,
          used: { candidateIds: new Set(), dHashes: [] },
          dryRun: true,
          previewDir
        });
        if (!result.ok) {
          console.error('GENERATE_FAILED', JSON.stringify(result.error));
          process.exit(1);
        }
        console.log(JSON.stringify({ contentHash: result.meta.contentHash, dHash: result.meta.dHash, candidateId: result.meta.candidateId, localPath: result.localPath }));
        `
      );

      const previewDir1 = path.join(workDir2, 'preview-run1');
      const previewDir2 = path.join(workDir2, 'preview-run2');
      const env = { ...process.env, FFMPEG_PATH: REAL_FFMPEG_BIN };

      const out1 = execFileSync('node', [childScript, srcVideo, previewDir1, 'run1'], { env, encoding: 'utf8' });
      const out2 = execFileSync('node', [childScript, srcVideo, previewDir2, 'run2'], { env, encoding: 'utf8' });

      const result1 = JSON.parse(out1.trim().split('\n').pop());
      const result2 = JSON.parse(out2.trim().split('\n').pop());

      assert.equal(result1.contentHash, result2.contentHash, 'contentHash must be identical across separate processes');
      assert.equal(result1.dHash, result2.dHash);
      assert.equal(result1.candidateId, result2.candidateId);

      const bytes1 = fs.readFileSync(result1.localPath);
      const bytes2 = fs.readFileSync(result2.localPath);
      assert.ok(bytes1.equals(bytes2), 'the two rendered WebP files must be byte-identical');
      assert.equal(createHash('sha256').update(bytes1).digest('hex'), result1.contentHash);

      // Real pixel-level monochrome proof: decode the WebP back to rgb24 and
      // confirm R===G===B across a sample of pixels (genuinely monochrome,
      // not just visually gray-looking).
      const rawPath = path.join(workDir2, 'decoded.rgb');
      execFileSync(REAL_FFMPEG_BIN, ['-hide_banner', '-loglevel', 'error', '-i', result1.localPath, '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-y', rawPath]);
      const raw = fs.readFileSync(rawPath);
      const w = 960;
      const h = 960;
      let checked = 0;
      for (let i = 0; i < 500; i++) {
        const x = Math.floor((i * 97) % w);
        const y = Math.floor((i * 53) % h);
        const idx = (y * w + x) * 3;
        const r = raw[idx];
        const g = raw[idx + 1];
        const b = raw[idx + 2];
        assert.equal(r, g, `pixel (${x},${y}) R!=G`);
        assert.equal(g, b, `pixel (${x},${y}) G!=B`);
        checked++;
      }
      assert.equal(checked, 500);
    } finally {
      fs.rmSync(workDir2, { recursive: true, force: true });
    }
  });
});
