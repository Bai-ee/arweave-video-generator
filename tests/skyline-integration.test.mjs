/**
 * tests/skyline-integration.test.mjs — Workstream E (adversarial review + integration tests).
 *
 * Cross-cutting integration tests for the skyline thumbnail pipeline that exercise REAL modules
 * from every workstream wired together (SkylineAssignmentStore, SkylineThumbnailJobs,
 * SkylineThumbnailService, the backfill CLI, the job worker's processJob, api/manage-artists.js,
 * WebsiteSync, WebsitePageGenerator) against fakes for Firestore/ffmpeg/Storage only — no
 * credentials, no ffmpeg binary, no network, no real Storage/Firestore writes.
 *
 * Also carries regression tests for two previously-fixed defects (crop-filter parity, duplicate
 * stableKey dedupe) and one defect found AND FIXED by this workstream (see FINDING-1 below, a
 * 3-line "obviously correct" fix in lib/skyline/records.js per the workstream-E exception rule).
 * Every other finding is reported (see the final report), not fixed here.
 */

import { test, describe, afterEach, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

import { createFakeFirestore } from './helpers/skyline-fake-firestore.mjs';

import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';
import { createThumbnailJobQueue, THUMBNAIL_STATUS, JOB_STATUS } from '../lib/SkylineThumbnailJobs.js';
import { createSkylineThumbnailService } from '../worker/lib/SkylineThumbnailService.js';
import { buildImageMeta, restoreMixAssignment } from '../lib/skyline/records.js';
import { classifyMixImage, isProtected } from '../lib/skyline/classify.js';
import { deriveMixKey, deriveArtistKey } from '../lib/skyline/keys.js';

import { runCli } from '../scripts/skyline-thumbnails.mjs';
import { processJob } from '../worker/run-thumbnail-jobs.mjs';

import {
  addMixToArtist,
  getThumbnailStatus,
  requestThumbnailAction,
  regenerateThumbnailAction,
  restoreThumbnailAction,
  setUploadedArtworkAction,
} from '../api/manage-artists.js';

import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';

const cjsRequire = createRequire(import.meta.url);
const { generatePages } = cjsRequire('../lib/WebsitePageGenerator.cjs');

/* ------------------------------------------------------------------- env */

const ORIGINAL_FLAG = process.env.SKYLINE_THUMBNAILS_ENABLED;
function setFlag(value) {
  if (value === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
  else process.env.SKYLINE_THUMBNAILS_ENABLED = value;
}
afterEach(() => setFlag(ORIGINAL_FLAG));

/* -------------------------------------------------------------- fixtures */

function txid(char) {
  return char.repeat(43);
}
const TX_MISSING = txid('1');
const TX_LOCKED = txid('2');
const TX_UPLOADED = txid('3');
const TX_GEN_A = txid('4');
const TX_GEN_B = txid('5');
const TX_RETRY = txid('6');
const TX_REGEN = txid('7');
const TX_RACE = txid('8');
const TX_MIDBATCH = txid('9');

function buildFixtureArtists() {
  return [
    {
      artistName: 'Acidman',
      artistFilename: 'acidman.html',
      artistImageFilename: '', // MISSING -> eligible
      artistGenre: 'house',
      mixes: [
        {
          mixTitle: 'Warehouse Session',
          mixArweaveURL: 'https://arweave.net/' + TX_MISSING,
          mixDateYear: '2024',
          mixDuration: '60:00',
          mixImageFilename: '', // MISSING -> eligible
        },
      ],
      trax: [],
    },
    {
      artistName: 'Redeye',
      artistFilename: 'redeye.html',
      artistImageFilename: 'https://arweave.net/uploaded-redeye-portrait.jpg', // UPLOADED -> protected
      artistGenre: 'techno',
      mixes: [
        {
          mixTitle: 'Locked Classic',
          mixArweaveURL: 'https://arweave.net/' + TX_LOCKED,
          mixDateYear: '2023',
          mixDuration: '45:00',
          mixImageFilename: 'https://arweave.net/locked-cover.jpg',
          mixImageMeta: { origin: 'uploaded', locked: true },
        },
        {
          mixTitle: 'Real Cover No Lock',
          mixArweaveURL: 'https://arweave.net/' + TX_UPLOADED,
          mixDateYear: '2022',
          mixDuration: '50:00',
          // UPLOADED, no meta at all -- still protected per classify.js rule 7.
          mixImageFilename: 'https://arweave.net/real-cover.jpg',
        },
      ],
      trax: [],
    },
  ];
}

/* ------------------------------------------------------ fake media stack */

function grayBuffer(width, height, fn) {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) buf[y * width + x] = fn(x, y);
  }
  return buf;
}
const ANALYSIS_SIZE = 256;
const DHASH_GRID_W = 9;
const DHASH_GRID_H = 8;
// Assign each of the dHash's own 9x8 downsample cells a value derived ENTIRELY from a
// well-mixed sha256-based per-cell hash of candidateId (no shared checkerboard base, and no
// weak rolling hash -- two earlier versions each collapsed to near-identical dHashes across
// different candidateIds: one because a fixed checkerboard's swing dominated every adjacent-cell
// comparison, the other because a weak polynomial rolling hash over ASCII-digit suffixes was not
// well-mixed enough and produced a near-monotonic sequence; see final report). sha256's avalanche
// property means adjacent cells' values are effectively uncorrelated, so within one image
// left<right comparisons behave like independent coin flips (good local contrast for the quality
// gate) and across two different candidateIds the resulting 64-bit dHashes differ in roughly half
// their bits on average (astronomically unlikely to collide within maxDHashHammingForDuplicate=6).
function cellByte(candidateId, idx) {
  return createHash('sha256').update(`${candidateId}|${idx}`, 'utf8').digest()[0];
}
function goodRaster(candidateId) {
  const cellVals = new Uint8Array(DHASH_GRID_W * DHASH_GRID_H);
  for (let cy = 0; cy < DHASH_GRID_H; cy++) {
    for (let cx = 0; cx < DHASH_GRID_W; cx++) {
      const idx = cy * DHASH_GRID_W + cx;
      cellVals[idx] = cellByte(candidateId, idx);
    }
  }
  return grayBuffer(ANALYSIS_SIZE, ANALYSIS_SIZE, (x, y) => {
    const cx = Math.min(DHASH_GRID_W - 1, Math.floor((x / ANALYSIS_SIZE) * DHASH_GRID_W));
    const cy = Math.min(DHASH_GRID_H - 1, Math.floor((y / ANALYSIS_SIZE) * DHASH_GRID_H));
    return cellVals[cy * DHASH_GRID_W + cx];
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
  return { sourceVideoId, candidateId, isRender, outPath };
}

/** A fake ffmpeg runner that also records the crop filter used per pass (analysis vs render),
 * so FINDING regression tests can assert the two passes agree. */
function makeFakeRunFfmpeg() {
  const analysisFilters = [];
  const renderFilters = [];
  const fn = async ({ args }) => {
    const parsed = parseFfArgs(args);
    const vfIdx = args.indexOf('-vf');
    const vf = vfIdx >= 0 ? args[vfIdx + 1] : '';
    if (parsed.isRender) {
      renderFilters.push({ candidateId: parsed.candidateId, vf });
      await fsp.writeFile(parsed.outPath, Buffer.from(`WEBP-FAKE-${parsed.candidateId}`, 'utf8'));
      return { stdout: Buffer.alloc(0), stderr: '' };
    }
    analysisFilters.push({ candidateId: parsed.candidateId, vf });
    return { stdout: goodRaster(parsed.candidateId), stderr: '' };
  };
  return { fn, analysisFilters, renderFilters };
}

function makeFakeStorage() {
  const downloadCalls = [];
  const uploadCalls = [];
  const storage = {
    async download({ storagePath, destPath }) {
      downloadCalls.push(storagePath);
      await fsp.writeFile(destPath, Buffer.from('fake-source-video-bytes'));
    },
    async upload({ localPath, storagePath, contentType, metadata }) {
      uploadCalls.push({ localPath, storagePath, contentType, metadata });
      return { publicUrl: `https://fake.example/${storagePath}`, generation: String(uploadCalls.length) };
    },
  };
  return { storage, downloadCalls, uploadCalls };
}

function makeCatalog({ sourceIds, fractions = [0.2, 0.5, 0.8], durationSec = 20 } = {}) {
  return {
    catalogVersion: 1,
    assignmentVersionDefault: 1,
    bucket: 'fake-bucket',
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
      notes: '',
    })),
  };
}

let workDir;
before(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skyline-integration-'));
});
after(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});
let tmpCounter = 0;
function freshTmpDir(name) {
  const p = path.join(workDir, `${name}-${tmpCounter++}`);
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function makeService({ sourceIds = ['skyline-a', 'skyline-b', 'skyline-c'], fractions, durationSec, tmpRoot } = {}) {
  const catalog = makeCatalog({ sourceIds, fractions, durationSec });
  const ff = makeFakeRunFfmpeg();
  const st = makeFakeStorage();
  const service = createSkylineThumbnailService({
    catalog,
    storage: st.storage,
    runFfmpeg: ff.fn,
    tmpRoot: tmpRoot || freshTmpDir('svc'),
  });
  return { service, catalog, ...ff, ...st };
}

/* =================================================================================
 * Regression: previously-fixed defect #3 (analysis/render crop-filter parity)
 * ================================================================================= */

describe('regression: analysis and render ffmpeg passes share the same crop filter (defect #3)', () => {
  test('the -vf filter used for the quality-analysis pass and the winning render pass are identical modulo scale size', async () => {
    setFlag('true');
    const { service, analysisFilters, renderFilters } = makeService({ sourceIds: ['skyline-only'], fractions: [0.5] });

    const result = await service.generate({
      entityType: 'mix',
      stableKey: 'crop-parity-key',
      assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      dryRun: false,
    });

    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(analysisFilters.length, 1);
    assert.equal(renderFilters.length, 1);

    // Both passes must start with the exact same crop expression (only the scale target
    // dimensions may differ: 256x256 for analysis vs 960x960 for the final render).
    const cropOf = (vf) => vf.split(',')[0];
    assert.equal(cropOf(analysisFilters[0].vf), cropOf(renderFilters[0].vf));
    assert.match(cropOf(analysisFilters[0].vf), /^crop=/);
  });
});

/* =================================================================================
 * Regression: previously-fixed defect #4 (duplicate stableKey dedupe in backfill CLI)
 * ================================================================================= */

describe('regression: backfill CLI dedupes two mix records sharing one stableKey (defect #4)', () => {
  test('two "For Hakim" duplicate records get ONE generated asset, not two overwriting renders', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Chicago Skyway',
          artistFilename: 'chicagoskyway.html',
          artistImageFilename: 'https://arweave.net/uploaded-artist.jpg',
          mixes: [
            { mixTitle: 'For Hakim', mixArweaveURL: 'https://arweave.net/' + TX_GEN_A, mixDateYear: '2021', mixDuration: '30:00', mixImageFilename: '' },
            { mixTitle: 'For Hakim!!', mixArweaveURL: 'https://arweave.net/' + TX_GEN_A, mixDateYear: '2021', mixDuration: '30:00', mixImageFilename: '' },
          ],
          trax: [],
        },
      ],
    });

    const { service, uploadCalls } = makeService();
    const reportDir = freshTmpDir('dup-report');

    const result = await runCli(
      ['--apply', '--yes-i-approve-apply', '--target', 'mix', '--report-dir', reportDir, '--json'],
      { db, media: { available: true, service }, env: { SKYLINE_THUMBNAILS_ENABLED: 'true' } }
    );

    assert.equal(result.exitCode, 0, JSON.stringify(result));
    // Exactly one webp asset uploaded for the shared stableKey -- the second occurrence must
    // reuse the first result, never render/upload a second (possibly different) frame to the
    // same storage path.
    assert.equal(uploadCalls.length, 1, 'expected exactly one upload for the duplicate-record pair');

    const doc = await db.collection('system').doc('artists').get();
    const mixes = doc.data().artists[0].mixes;
    assert.equal(mixes[0].mixImageFilename, mixes[1].mixImageFilename, 'both duplicate records must end up pointing at the same asset');
    assert.equal(mixes[0].mixImageMeta.contentHash, mixes[1].mixImageMeta.contentHash);

    const dupRow = result.report.entities.find((e) => e.mixTitle === 'For Hakim!!');
    assert.equal(dupRow.sharedWithDuplicateKey, true);
  });
});

/* =================================================================================
 * FINDING-1 (fixed by workstream E, 3-line change to lib/skyline/records.js):
 * restoreMixAssignment/restoreArtistAssignment never checked isProtected before restoring,
 * so restoreThumbnail could silently overwrite (and permanently delete the meta of) a real
 * uploaded, locked image whenever a stale previousMixImageFilename/previousArtistImageFilename
 * marker existed from an earlier auto-generation. See final report for the exact repro and fix.
 * ================================================================================= */

describe('FINDING-1 (FIXED): restore must never overwrite protected/locked artwork', () => {
  test('generate -> admin uploads real locked art -> restore must refuse, not revert to the pre-generation value', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Finding1 Artist',
          artistFilename: 'finding1artist.html',
          artistImageFilename: '',
          mixes: [
            { mixTitle: 'Finding1 Mix', mixArweaveURL: 'https://arweave.net/' + TX_GEN_B, mixDateYear: '2024', mixDuration: '20:00', mixImageFilename: '' },
          ],
          trax: [],
        },
      ],
    });

    const { service } = makeService();
    // Step 1: automatic generation runs (e.g. via the backfill CLI) -- mix goes from MISSING
    // to a generated-skyline image, and (first overwrite) previousMixImageFilename is stamped
    // with the pre-pipeline value ('').
    const genResult = await runCli(['--apply', '--yes-i-approve-apply', '--target', 'mix', '--report-dir', freshTmpDir('f1-gen'), '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });
    assert.equal(genResult.exitCode, 0);

    let doc = await db.collection('system').doc('artists').get();
    let mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageMeta.origin, 'generated-skyline');
    assert.equal(mix.previousMixImageFilename, '', 'previous* must capture the pre-pipeline (empty) value');

    // Step 2: an admin replaces the automatic image with their own real, explicitly-uploaded
    // artwork -- origin:'uploaded', locked:true. Because previousMixImageFilename already
    // existed (set in step 1), setUploadedArtworkAction correctly leaves it untouched.
    const uploadResult = await setUploadedArtworkAction(db, {
      entityType: 'mix',
      artistName: 'Finding1 Artist',
      mixArweaveURL: 'https://arweave.net/' + TX_GEN_B,
      mixTitle: 'Finding1 Mix',
      imageUrl: 'https://arweave.net/real-artist-upload.jpg',
    });
    assert.equal(uploadResult.changed, true);

    doc = await db.collection('system').doc('artists').get();
    mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, 'https://arweave.net/real-artist-upload.jpg');
    assert.equal(mix.mixImageMeta.locked, true);
    // previousMixImageFilename is still the ORIGINAL pre-pipeline value, not the v1 generated URL.
    assert.equal(mix.previousMixImageFilename, '');

    // Step 3 (the adversarial move): admin (or a confused UI, or a re-run of an old runbook)
    // calls restoreThumbnail. Pre-fix, this would silently blow away the just-uploaded, locked
    // real artwork and revert to the empty pre-pipeline value -- restoreMixAssignment applied
    // NO protection check at all. Post-fix it must refuse.
    const restoreResult = await restoreThumbnailAction(db, {
      entityType: 'mix',
      artistName: 'Finding1 Artist',
      mixArweaveURL: 'https://arweave.net/' + TX_GEN_B,
      mixTitle: 'Finding1 Mix',
    });
    assert.equal(restoreResult.applied, false, 'restore of a locked/uploaded record must be refused');
    assert.equal(restoreResult.reason, 'protected');

    doc = await db.collection('system').doc('artists').get();
    mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, 'https://arweave.net/real-artist-upload.jpg', 'the real uploaded artwork must survive the restore attempt untouched');
    assert.equal(mix.mixImageMeta.locked, true);
  });

  test('unit-level: restoreMixAssignment itself refuses a locked mix (records.js, independent of the store)', () => {
    const artist = {
      artistFilename: 'x',
      mixes: [
        {
          mixTitle: 'Locked',
          mixImageFilename: 'https://real/upload.jpg',
          mixImageMeta: { origin: 'uploaded', locked: true },
          previousMixImageFilename: 'https://old/generated.webp',
        },
      ],
    };
    const result = restoreMixAssignment({ artist, mixIndex: 0 });
    assert.equal(result.changed, false);
    assert.equal(result.skipped, 'protected');
    assert.equal(result.artist.mixes[0].mixImageFilename, 'https://real/upload.jpg', 'input must be unchanged');
  });

  test('restore still works normally for a non-locked, non-uploaded (plain generated) record', async () => {
    const artist = {
      artistFilename: 'x',
      mixes: [
        {
          mixTitle: 'Plain generated',
          mixImageFilename: 'https://cdn/generated.webp',
          mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1, locked: false },
          previousMixImageFilename: 'https://original.example.com/old.jpg',
        },
      ],
    };
    const result = restoreMixAssignment({ artist, mixIndex: 0 });
    assert.equal(result.changed, true);
    assert.equal(result.artist.mixes[0].mixImageFilename, 'https://original.example.com/old.jpg');
  });
});

/* =================================================================================
 * Integration scenario 1: end-to-end backfill
 * ================================================================================= */

describe('integration: end-to-end backfill -- dry run mutates nothing, apply writes exactly the eligible entities', () => {
  test('dry run: zero Firestore mutation, zero uploads, zero audit doc', async () => {
    setFlag('true');
    const before = { artists: buildFixtureArtists() };
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set(before);

    const { service, uploadCalls } = makeService();
    const reportDir = freshTmpDir('dryrun-report');
    const result = await runCli(['--target', 'both', '--report-dir', reportDir, '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });

    assert.equal(result.exitCode, 0);
    assert.equal(result.summary.mode, 'dry-run');
    assert.equal(uploadCalls.length, 0, 'dry run must never call storage.upload');

    const doc = await db.collection('system').doc('artists').get();
    assert.deepEqual(doc.data(), before, 'dry run must not mutate system/artists at all');

    const auditSnap = await db.collection('skyline_thumbnail_runs').get();
    assert.equal(auditSnap.docs.length, 0, 'dry run must never write an audit record');

    assert.ok(fs.existsSync(path.join(reportDir, 'report.json')));
    assert.ok(fs.existsSync(path.join(reportDir, 'report.csv')));
    assert.ok(fs.existsSync(path.join(reportDir, 'report.html')));
  });

  test('apply: writes exactly the eligible (MISSING) entities and leaves every protected entity byte-identical', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({ artists: buildFixtureArtists() });

    const { service, uploadCalls } = makeService();
    const reportDir = freshTmpDir('apply-report');
    const result = await runCli(['--apply', '--yes-i-approve-apply', '--target', 'both', '--report-dir', reportDir, '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });

    assert.equal(result.exitCode, 0, JSON.stringify(result));
    // Exactly 2 real entities were eligible: Acidman's artist image + Acidman's one mix.
    assert.equal(uploadCalls.length, 2);

    const doc = await db.collection('system').doc('artists').get();
    const [acidman, redeye] = doc.data().artists;

    assert.match(acidman.artistImageFilename, /^https:\/\/fake\.example\//);
    assert.equal(acidman.artistImageMeta.origin, 'generated-skyline');
    assert.match(acidman.mixes[0].mixImageFilename, /^https:\/\/fake\.example\//);
    assert.equal(acidman.mixes[0].mixImageMeta.origin, 'generated-skyline');

    // Redeye is untouched in every field -- protected (uploaded artist image, locked mix,
    // and plain-uploaded-no-lock mix all refused).
    assert.equal(redeye.artistImageFilename, 'https://arweave.net/uploaded-redeye-portrait.jpg');
    assert.equal(redeye.artistImageMeta, undefined);
    assert.equal(redeye.mixes[0].mixImageFilename, 'https://arweave.net/locked-cover.jpg');
    assert.deepEqual(redeye.mixes[0].mixImageMeta, { origin: 'uploaded', locked: true });
    assert.equal(redeye.mixes[1].mixImageFilename, 'https://arweave.net/real-cover.jpg');
    assert.equal(redeye.mixes[1].mixImageMeta, undefined);

    const auditSnap = await db.collection('skyline_thumbnail_runs').get();
    assert.equal(auditSnap.docs.length, 1);
    assert.equal(auditSnap.docs[0].data().counts.appliedCount, 2);
  });
});

/* =================================================================================
 * Integration scenario 2: rendering precedence, Firestore -> WebsiteSync -> WebsitePageGenerator
 * ================================================================================= */

describe('integration: a generated mix image flows Firestore -> WebsiteSync -> WebsitePageGenerator with ONE consistent URL', () => {
  test('the assigned URL is identical across index.html, archive.html, residents.html and the artist page', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const mixUrl = 'https://arweave.net/' + txid('a');
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Render Precedence Artist',
          artistFilename: 'renderprecedenceartist.html',
          artistImageFilename: '',
          artistGenre: 'house',
          mixes: [
            { mixTitle: 'Precedence Mix', mixArweaveURL: mixUrl, mixDateYear: '2025', mixDuration: '42:00', mixImageFilename: '' },
          ],
          trax: [],
        },
      ],
    });

    const { service } = makeService();
    const reportDir = freshTmpDir('precedence-cli-report');
    const applyResult = await runCli(['--apply', '--yes-i-approve-apply', '--target', 'mix', '--report-dir', reportDir, '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });
    assert.equal(applyResult.exitCode, 0, JSON.stringify(applyResult));

    const doc = await db.collection('system').doc('artists').get();
    const assignedUrl = doc.data().artists[0].mixes[0].mixImageFilename;
    assert.match(assignedUrl, /^https:\/\/fake\.example\//);

    // WebsiteSync: Firestore -> a real artists.json on disk.
    const websiteDir = freshTmpDir('precedence-website');
    const syncResult = await syncFirebaseToWebsiteJSON(db, websiteDir);
    assert.equal(syncResult.success, true, JSON.stringify(syncResult));
    const artistsJsonPath = path.join(websiteDir, 'artists.json');
    const websiteArtists = JSON.parse(fs.readFileSync(artistsJsonPath, 'utf8'));
    assert.equal(websiteArtists[0].mixes[0].mixImageFilename, assignedUrl);

    // WebsitePageGenerator: real HTML generation (using the real repo templates, output to a
    // fresh temp dir -- website/ itself is never touched).
    const outputDir = freshTmpDir('precedence-output');
    const genResult = generatePages(artistsJsonPath, outputDir);
    assert.equal(genResult.success, true, JSON.stringify(genResult));

    const indexHtml = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
    const archiveHtml = fs.readFileSync(path.join(outputDir, 'archive.html'), 'utf8');
    const artistHtml = fs.readFileSync(path.join(outputDir, 'renderprecedenceartist.html'), 'utf8');

    // The escaped URL must appear on every MIX-thumbnail surface -- this is only 1 mix from 1
    // artist, so it is guaranteed to be the featured mix on index.html too. (residents.html
    // renders each artist's OWN artistImageFilename, a different chokepoint entirely -- this
    // artist has no artist image of its own, so residents.html correctly falls back to
    // .cover-fallback rather than borrowing the mix's image; that is not a mix-thumbnail surface
    // and is intentionally excluded from this per-mix-URL consistency check.)
    for (const [name, html] of [['index.html', indexHtml], ['archive.html', archiveHtml], ['artist page', artistHtml]]) {
      assert.ok(html.includes(assignedUrl), `${name} must render the assigned image URL`);
    }

    // Alt text contract: "<Artist> — <Mix title>" wherever the mix image is used.
    assert.ok(archiveHtml.includes('alt="Render Precedence Artist &mdash; Precedence Mix"') || archiveHtml.includes('Render Precedence Artist — Precedence Mix'), 'archive row must carry the "Artist — Title" alt text');
  });
});

/* =================================================================================
 * Integration scenario 3: protected artwork survives the whole pipeline
 * ================================================================================= */

describe('integration: protected artwork survives backfill, regenerate-all, and retry', () => {
  test('a locked mix is never targeted even with --regenerate, and requestThumbnail on it is refused', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({ artists: buildFixtureArtists() });

    const { service, uploadCalls } = makeService();
    const result = await runCli(
      ['--apply', '--yes-i-approve-apply', '--regenerate', '--target', 'both', '--report-dir', freshTmpDir('protected-regen'), '--json'],
      { db, media: { available: true, service }, env: { SKYLINE_THUMBNAILS_ENABLED: 'true' } }
    );
    assert.equal(result.exitCode, 0);

    const doc = await db.collection('system').doc('artists').get();
    const redeye = doc.data().artists[1];
    assert.equal(redeye.mixes[0].mixImageFilename, 'https://arweave.net/locked-cover.jpg', 'locked mix must survive --regenerate');
    assert.equal(redeye.mixes[1].mixImageFilename, 'https://arweave.net/real-cover.jpg', 'uploaded mix must survive --regenerate');

    const reqResult = await requestThumbnailAction(db, {
      entityType: 'mix',
      artistName: 'Redeye',
      mixArweaveURL: 'https://arweave.net/' + TX_LOCKED,
      mixTitle: 'Locked Classic',
    });
    assert.equal(reqResult.status, THUMBNAIL_STATUS.UPLOADED);
    assert.equal(reqResult.reason, 'protected');

    // No job was ever enqueued for the locked mix.
    const queue = createThumbnailJobQueue({ db });
    const entityKey = deriveMixKey({ artistFilename: 'redeye.html', mixArweaveURL: 'https://arweave.net/' + TX_LOCKED, mixTitle: 'Locked Classic' });
    const status = await queue.statusFor({ entityType: 'mix', entityKey });
    assert.equal(status.status, THUMBNAIL_STATUS.NOT_REQUESTED);
  });
});

/* =================================================================================
 * Integration scenario 4: a failed thumbnail job never corrupts a record / never fails the
 * mix write; retry then succeeds.
 * ================================================================================= */

describe('integration: a failed thumbnail job never corrupts the record or the mix write; retry then succeeds', () => {
  test('addMixToArtist succeeds even though thumbnail generation subsequently fails, then a retry drain succeeds', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    // Pre-seed the artist with its OWN protected image so addMixToArtist below sees an
    // EXISTING (not new) artist and enqueues exactly one job (the mix), not two (mix + artist) --
    // isolates this test to the single job/entity under test.
    await db.collection('system').doc('artists').set({
      artists: [{ artistName: 'Flaky Artist', artistFilename: 'flakyartist.html', artistImageFilename: 'https://arweave.net/uploaded.jpg', mixes: [], trax: [] }],
    });

    // A service whose generate() always fails (simulates an ffmpeg/network failure).
    const failingService = { generate: async () => ({ ok: false, error: { code: 'ffmpeg-failed', message: 'simulated failure' } }) };

    const addResult = await addMixToArtist(db, 'Flaky Artist', {
      mixTitle: 'Flaky Mix',
      mixArweaveURL: 'https://arweave.net/' + TX_RETRY,
      mixDateYear: '2024',
      mixDuration: '10:00',
      mixImageFilename: '',
      isTrack: false,
    });
    assert.equal(addResult.added, true, 'the mix write itself must succeed regardless of thumbnail generation outcome');
    assert.equal(addResult.isNewArtist, false);
    assert.equal(addResult.thumbnail.status, THUMBNAIL_STATUS.GENERATING);

    let doc = await db.collection('system').doc('artists').get();
    let mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, '', 'record must be untouched -- no thumbnail assigned yet');

    const queue = createThumbnailJobQueue({ db });
    const store = createAssignmentStore({ db });

    const job1 = await queue.claimNext();
    assert.ok(job1);
    const failed = await processJob({ job: job1, service: failingService, store, queue });
    assert.equal(failed.ok, false);

    doc = await db.collection('system').doc('artists').get();
    mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, '', 'a failed job must never write a partial/corrupt image assignment');
    assert.equal(mix.mixImageMeta, undefined);

    const statusAfterFail = await queue.statusFor({ entityType: 'mix', entityKey: job1.entityKey });
    assert.equal(statusAfterFail.status, THUMBNAIL_STATUS.GENERATING, 'one failure (of 3 allowed attempts) must still be retryable, not terminally failed');

    // Now retry with a working service and confirm it succeeds cleanly.
    const { service: workingService, uploadCalls } = makeService();
    const job2 = await queue.claimNext();
    assert.equal(job2.id, job1.id);
    const succeeded = await processJob({ job: job2, service: workingService, store, queue });
    assert.equal(succeeded.ok, true, JSON.stringify(succeeded));
    assert.equal(uploadCalls.length, 1);

    doc = await db.collection('system').doc('artists').get();
    mix = doc.data().artists[0].mixes[0];
    assert.match(mix.mixImageFilename, /^https:\/\/fake\.example\//);
    assert.equal(mix.mixImageMeta.origin, 'generated-skyline');

    const finalStatus = await queue.statusFor({ entityType: 'mix', entityKey: job1.entityKey });
    assert.equal(finalStatus.status, THUMBNAIL_STATUS.GENERATED);
  });

  test('generation failing 3 times terminally fails the job but still never corrupts the record', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistName: 'Always Flaky', artistFilename: 'alwaysflaky.html', artistImageFilename: 'https://arweave.net/uploaded.jpg', mixes: [], trax: [] }],
    });
    await addMixToArtist(db, 'Always Flaky', {
      mixTitle: 'Always Fails',
      mixArweaveURL: 'https://arweave.net/' + txid('c'),
      mixDateYear: '2024',
      mixDuration: '5:00',
      mixImageFilename: '',
      isTrack: false,
    });

    const failingService = { generate: async () => ({ ok: false, error: { code: 'ffmpeg-failed', message: 'simulated failure' } }) };
    const queue = createThumbnailJobQueue({ db });
    const store = createAssignmentStore({ db });

    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const job = await queue.claimNext();
      assert.ok(job, `expected a claimable job on attempt ${i + 1}`);
      // eslint-disable-next-line no-await-in-loop
      await processJob({ job, service: failingService, store, queue });
    }

    const doc = await db.collection('system').doc('artists').get();
    const mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, '', 'record must still be untouched after exhausting retries');

    const jobsSnap = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(jobsSnap.docs.length, 1, 'must never create a second job doc for the same entity');
    assert.equal(jobsSnap.docs[0].data().status, JOB_STATUS.FAILED);
  });
});

/* =================================================================================
 * Integration scenario 5: regeneration bumps assignmentVersion, writes a new versioned path,
 * preserves the previous assignment for rollback; restore puts it back.
 * ================================================================================= */

describe('integration: regeneration bumps version + new asset path, preserves previous* for rollback', () => {
  test('v1 -> v2 regenerate -> restore round-trip', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistName: 'Regen Artist',
          artistFilename: 'regenartist.html',
          artistImageFilename: '',
          mixes: [{ mixTitle: 'Regen Mix', mixArweaveURL: 'https://arweave.net/' + TX_REGEN, mixDateYear: '2024', mixDuration: '15:00', mixImageFilename: '' }],
          trax: [],
        },
      ],
    });

    const { service, uploadCalls } = makeService();
    // v1
    const v1 = await runCli(['--apply', '--yes-i-approve-apply', '--target', 'mix', '--report-dir', freshTmpDir('regen-v1'), '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });
    assert.equal(v1.exitCode, 0);
    let doc = await db.collection('system').doc('artists').get();
    let mix = doc.data().artists[0].mixes[0];
    const v1Url = mix.mixImageFilename;
    assert.equal(mix.mixImageMeta.assignmentVersion, 1);
    assert.match(uploadCalls[0].storagePath, /-v1\.webp$/);

    // v2 via regenerateThumbnailAction + a real drain.
    const regenReq = await regenerateThumbnailAction(db, { entityType: 'mix', artistName: 'Regen Artist', mixArweaveURL: 'https://arweave.net/' + TX_REGEN, mixTitle: 'Regen Mix' });
    assert.equal(regenReq.status, THUMBNAIL_STATUS.GENERATING);

    const queue = createThumbnailJobQueue({ db });
    const store = createAssignmentStore({ db });
    const job = await queue.claimNext();
    assert.equal(job.assignmentVersion, 2);
    const processed = await processJob({ job, service, store, queue });
    assert.equal(processed.ok, true, JSON.stringify(processed));

    doc = await db.collection('system').doc('artists').get();
    mix = doc.data().artists[0].mixes[0];
    const v2Url = mix.mixImageFilename;
    assert.notEqual(v1Url, v2Url, 'regenerate must produce a NEW url/asset, not overwrite in place');
    assert.equal(mix.mixImageMeta.assignmentVersion, 2);
    assert.match(uploadCalls[1].storagePath, /-v2\.webp$/);
    assert.notEqual(uploadCalls[0].storagePath, uploadCalls[1].storagePath, 'v1 and v2 must be distinct storage objects');
    // previous* must still be the ORIGINAL pre-pipeline value, never the v1 generated url.
    assert.equal(mix.previousMixImageFilename, '');

    // Restore: back to the pre-pipeline value (mix is not locked/uploaded, so restore succeeds).
    const restoreResult = await restoreThumbnailAction(db, { entityType: 'mix', artistName: 'Regen Artist', mixArweaveURL: 'https://arweave.net/' + TX_REGEN, mixTitle: 'Regen Mix' });
    assert.equal(restoreResult.applied, true);
    doc = await db.collection('system').doc('artists').get();
    mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, '');
    assert.equal(mix.mixImageMeta, undefined);
    assert.equal(Object.prototype.hasOwnProperty.call(mix, 'previousMixImageFilename'), false);
  });
});

/* =================================================================================
 * Integration scenario 6: idempotency -- re-running a completed entity creates no second
 * asset/write.
 * ================================================================================= */

describe('integration: idempotency -- re-running a completed entity is a true no-op', () => {
  test('applyEntityAssignment called twice with the same meta only writes once', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistFilename: 'idem.html', artistName: 'Idem Artist', artistImageFilename: '', mixes: [{ mixTitle: 'Idem Mix', mixArweaveURL: 'https://arweave.net/' + txid('d'), mixImageFilename: '' }], trax: [] }],
    });
    const store = createAssignmentStore({ db });
    const entityKey = deriveMixKey({ artistFilename: 'idem.html', mixArweaveURL: 'https://arweave.net/' + txid('d'), mixTitle: 'Idem Mix' });
    const meta = buildImageMeta({ generatedMeta: { assignmentVersion: 1, sourceVideoId: 's1', sourceTimeSec: 1, candidateId: 's1@1.00', dHash: 'a'.repeat(16), contentHash: 'c1' } });

    const first = await store.applyEntityAssignment({ entityKey, entityType: 'mix', artistFilename: 'idem.html', mixIndex: 0, imageUrl: 'https://fake.example/one.webp', meta });
    assert.equal(first.applied, true);

    const second = await store.applyEntityAssignment({ entityKey, entityType: 'mix', artistFilename: 'idem.html', mixIndex: 0, imageUrl: 'https://fake.example/two.webp', meta });
    assert.equal(second.applied, false);
    assert.equal(second.reason, 'already-applied');

    const doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageFilename, 'https://fake.example/one.webp', 'the second (redundant) call must not overwrite the first result');
  });

  test('backfill CLI run twice in a row generates the entity only once', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistFilename: 'idem2.html', artistName: 'Idem2', artistImageFilename: '', mixes: [{ mixTitle: 'Idem2 Mix', mixArweaveURL: 'https://arweave.net/' + txid('e'), mixImageFilename: '' }], trax: [] }],
    });
    const { service, uploadCalls } = makeService();
    const opts = ['--apply', '--yes-i-approve-apply', '--target', 'mix', '--json'];
    const deps = { db, media: { available: true, service }, env: { SKYLINE_THUMBNAILS_ENABLED: 'true' } };

    const run1 = await runCli([...opts, '--report-dir', freshTmpDir('idem-run1')], deps);
    assert.equal(run1.exitCode, 0);
    const run2 = await runCli([...opts, '--report-dir', freshTmpDir('idem-run2')], deps);
    assert.equal(run2.exitCode, 0);

    assert.equal(uploadCalls.length, 1, 'the second run must find the entity already-generated and not re-render/re-upload');
    assert.equal(run2.summary.counts.targetCount, 0, 'nothing should be targetable on the second run');
  });
});

/* =================================================================================
 * Integration scenario 7: determinism -- same stableKey+version -> same candidate, across
 * fresh service instances.
 * ================================================================================= */

describe('integration: determinism across independent, freshly-constructed service instances', () => {
  test('two separately constructed services (separate caches) with the same catalog pick the identical candidate/meta', async () => {
    setFlag('true');
    const sourceIds = ['skyline-a', 'skyline-b', 'skyline-c', 'skyline-d'];
    const a = makeService({ sourceIds, fractions: [0.2, 0.5, 0.8] });
    const b = makeService({ sourceIds, fractions: [0.2, 0.5, 0.8] });

    const args = { entityType: 'mix', stableKey: 'determinism-key', assignmentVersion: 1, used: { candidateIds: new Set(), dHashes: [] }, dryRun: false };
    const resultA = await a.service.generate(args);
    const resultB = await b.service.generate({ ...args, used: { candidateIds: new Set(), dHashes: [] } });

    assert.equal(resultA.ok, true);
    assert.equal(resultB.ok, true);
    assert.equal(resultA.meta.candidateId, resultB.meta.candidateId);
    assert.equal(resultA.meta.sourceVideoId, resultB.meta.sourceVideoId);
    assert.equal(resultA.meta.sourceTimeSec, resultB.meta.sourceTimeSec);
    assert.equal(resultA.meta.dHash, resultB.meta.dHash);
    assert.equal(resultA.meta.contentHash, resultB.meta.contentHash, 'identical rendered bytes -> identical content hash');
  });
});

/* =================================================================================
 * Integration scenario 8: cross-entity uniqueness within a single batch + collision probing
 * when the candidate pool is exhausted.
 * ================================================================================= */

describe('integration: cross-entity uniqueness within one batch, and honest exhaustion reporting', () => {
  test('two mixes in the same backfill batch never receive the same candidateId', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistFilename: 'uniq.html',
          artistName: 'Uniq Artist',
          artistImageFilename: 'https://arweave.net/uploaded.jpg', // keep artist image out of scope
          mixes: [
            { mixTitle: 'Uniq Mix One', mixArweaveURL: 'https://arweave.net/' + txid('f'), mixImageFilename: '' },
            { mixTitle: 'Uniq Mix Two', mixArweaveURL: 'https://arweave.net/' + txid('g'), mixImageFilename: '' },
            { mixTitle: 'Uniq Mix Three', mixArweaveURL: 'https://arweave.net/' + txid('h'), mixImageFilename: '' },
          ],
          trax: [],
        },
      ],
    });
    const { service } = makeService({ sourceIds: ['skyline-a', 'skyline-b'], fractions: [0.3, 0.6] });
    const result = await runCli(['--apply', '--yes-i-approve-apply', '--target', 'mix', '--report-dir', freshTmpDir('uniq'), '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });
    assert.equal(result.exitCode, 0, JSON.stringify(result));

    const doc = await db.collection('system').doc('artists').get();
    const candidateIds = doc.data().artists[0].mixes.map((m) => m.mixImageMeta.candidateId);
    assert.equal(new Set(candidateIds).size, candidateIds.length, 'every mix in the batch must get a distinct candidateId');
  });

  test('a tiny, exhausted candidate pool fails that one entity honestly (no-eligible-candidate) without crashing the run', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [
        {
          artistFilename: 'exhaust.html',
          artistName: 'Exhaust Artist',
          artistImageFilename: 'https://arweave.net/uploaded.jpg',
          mixes: [
            { mixTitle: 'Only Mix One', mixArweaveURL: 'https://arweave.net/' + txid('i'), mixImageFilename: '' },
            { mixTitle: 'Only Mix Two', mixArweaveURL: 'https://arweave.net/' + txid('j'), mixImageFilename: '' },
          ],
          trax: [],
        },
      ],
    });
    // A single-candidate pool: the first mix consumes it; the second has nothing left.
    const { service } = makeService({ sourceIds: ['skyline-only'], fractions: [0.5] });
    const result = await runCli(['--apply', '--yes-i-approve-apply', '--target', 'mix', '--report-dir', freshTmpDir('exhaust'), '--json'], {
      db,
      media: { available: true, service },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' },
    });

    assert.equal(result.exitCode, 2, 'partial failure must be reported via exit code 2, not crash the process');
    const doc = await db.collection('system').doc('artists').get();
    const [m1, m2] = doc.data().artists[0].mixes;
    const oneGenerated = !!m1.mixImageFilename;
    const oneEmpty = !m2.mixImageFilename;
    assert.ok((oneGenerated && oneEmpty) || (!oneGenerated && !!m2.mixImageFilename), 'exactly one of the two mixes must succeed');
    const failedRow = result.report.entities.find((e) => e.mediaStatus === 'failed');
    assert.ok(failedRow, 'the exhausted entity must be reported with mediaStatus:failed');
    assert.equal(failedRow.skipReason, 'no-eligible-candidate');
  });
});

/* =================================================================================
 * Adversarial: race conditions
 * ================================================================================= */

describe('adversarial: concurrent claimNext() at the orchestration level', () => {
  test('two processJob() calls racing on one queued job never both apply the assignment', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistFilename: 'race.html', artistName: 'Race Artist', artistImageFilename: 'https://arweave.net/uploaded.jpg', mixes: [{ mixTitle: 'Race Mix', mixArweaveURL: 'https://arweave.net/' + TX_RACE, mixImageFilename: '' }], trax: [] }],
    });
    const queue = createThumbnailJobQueue({ db });
    const store = createAssignmentStore({ db });
    const entityKey = deriveMixKey({ artistFilename: 'race.html', mixArweaveURL: 'https://arweave.net/' + TX_RACE, mixTitle: 'Race Mix' });
    await queue.enqueue({ entityType: 'mix', entityKey, artistFilename: 'race.html', mixIndex: 0, mixTitle: 'Race Mix', assignmentVersion: 1 });

    const { service } = makeService();
    const [claimA, claimB] = await Promise.all([queue.claimNext(), queue.claimNext()]);
    const claimed = [claimA, claimB].filter(Boolean);
    assert.equal(claimed.length, 1, 'exactly one worker must claim the single queued job');

    const result = await processJob({ job: claimed[0], service, store, queue });
    assert.equal(result.ok, true);

    const doc = await db.collection('system').doc('artists').get();
    const mix = doc.data().artists[0].mixes[0];
    assert.match(mix.mixImageFilename, /^https:\/\/fake\.example\//);
  });

  test('concurrent enqueue() for the same entity+version creates exactly one job document', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    const queue = createThumbnailJobQueue({ db });
    const args = { entityType: 'mix', entityKey: 'concurrent-enqueue-key', artistFilename: 'x.html', mixIndex: 0, mixTitle: 'X', assignmentVersion: 1 };

    const [r1, r2, r3] = await Promise.all([queue.enqueue(args), queue.enqueue(args), queue.enqueue(args)]);
    const createdCount = [r1, r2, r3].filter((r) => r.created).length;
    assert.equal(createdCount, 1, 'exactly one of the three concurrent enqueue calls should have created the doc');
    assert.equal(r1.jobId, r2.jobId);
    assert.equal(r2.jobId, r3.jobId);

    const snap = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(snap.docs.length, 1);
  });

  test('FINDING-2 (FIXED): an idempotent "already-applied" re-run completes the job instead of failing it, keeping status truthful for an already-generated entity', async () => {
    // Root cause: worker/run-thumbnail-jobs.mjs's processJob() calls store.applyEntityAssignment()
    // and, on ANY non-applied result -- including the legitimate idempotent skip
    // reason:'already-applied' -- calls queue.fail(). It never special-cases "already-applied"
    // as a success. This is reachable any time a job is processed twice for an entity that a
    // PRIOR attempt already durably applied but did not get to mark queue.complete() for --
    // e.g. claimNext()'s lease (default 5 minutes, never renewed mid-generate()) expiring while
    // the first worker is still running and a second worker reclaims + completes the same job,
    // or a worker crashing between applyEntityAssignment() succeeding and queue.complete() being
    // called. This test reproduces it deterministically via a duplicate claim, without relying
    // on wall-clock timing.
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistFilename: 'lease.html', artistName: 'Lease Artist', artistImageFilename: '', mixes: [{ mixTitle: 'Lease Mix', mixArweaveURL: 'https://arweave.net/' + txid('l'), mixImageFilename: '' }], trax: [] }],
    });

    const queue = createThumbnailJobQueue({ db });
    const store = createAssignmentStore({ db });
    const entityKey = deriveMixKey({ artistFilename: 'lease.html', mixArweaveURL: 'https://arweave.net/' + txid('l'), mixTitle: 'Lease Mix' });
    await queue.enqueue({ entityType: 'mix', entityKey, artistFilename: 'lease.html', mixIndex: 0, mixTitle: 'Lease Mix', assignmentVersion: 1 });

    const { service } = makeService();

    // Simulates "a prior attempt already durably applied the assignment but crashed/lost its
    // lease before calling queue.complete()" -- the record is already correctly, successfully
    // generated in Firestore, but the job doc is still sitting QUEUED.
    const preApply = await service.generate({ entityType: 'mix', stableKey: entityKey, assignmentVersion: 1, used: { candidateIds: new Set(), dHashes: [] }, dryRun: false });
    assert.equal(preApply.ok, true);
    const meta = buildImageMeta({ generatedMeta: preApply.meta });
    const preApplyResult = await store.applyEntityAssignment({ entityKey, entityType: 'mix', artistFilename: 'lease.html', mixIndex: 0, imageUrl: preApply.imageUrl, meta });
    assert.equal(preApplyResult.applied, true);

    let doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageMeta.origin, 'generated-skyline', 'the record is already correctly generated');

    // Now the still-QUEUED job gets (re-)processed 3 times -- exactly what a drain loop would do
    // on a job whose completion never got recorded. Each time, generate() succeeds (deterministic,
    // same result) but applyEntityAssignment correctly returns the idempotent
    // {applied:false, reason:'already-applied'} skip -- which processJob currently treats as a
    // hard failure.
    const job = await queue.claimNext();
    assert.ok(job, 'expected the still-queued job to be claimable');
    const result = await processJob({ job, service, store, queue });

    // FIXED: an idempotent "already-applied" skip is a success, not a failure. The entity is
    // already correctly generated, so the job is marked DONE rather than FAILED.
    assert.equal(result.ok, true, 'processJob treats an idempotent already-applied skip as success');
    assert.equal(result.alreadySatisfied, 'already-applied');

    // ...and the job is terminal, so a drain loop cannot keep re-claiming it and burning its
    // 3 attempts on nothing but idempotent no-ops.
    const noMore = await queue.claimNext();
    assert.equal(noMore, null, 'the job is DONE, so nothing remains claimable');

    doc = await db.collection('system').doc('artists').get();
    const mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageMeta.origin, 'generated-skyline', 'the Firestore record itself is still correct');

    const statusResult = await getThumbnailStatus(db, {
      entityType: 'mix',
      artistName: 'Lease Artist',
      mixArweaveURL: 'https://arweave.net/' + txid('l'),
      mixTitle: 'Lease Mix',
    });
    // The admin-visible status is now truthful: an already-successfully-generated entity
    // reports GENERATED instead of being permanently misreported as FAILED.
    assert.equal(statusResult.thumbnailStatus, THUMBNAIL_STATUS.GENERATED, 'status is truthful for an already-generated entity');
  });
});

/* =================================================================================
 * Adversarial: admin uploads real art in the plan/apply gap
 * ================================================================================= */

describe('adversarial: an admin uploads real art between plan and apply', () => {
  test('applyEntityAssignment re-verifies protection inside its own transaction and refuses the stale plan target', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistFilename: 'midbatch.html', artistName: 'Midbatch Artist', artistImageFilename: '', mixes: [{ mixTitle: 'Midbatch Mix', mixArweaveURL: 'https://arweave.net/' + TX_MIDBATCH, mixImageFilename: '' }], trax: [] }],
    });
    const store = createAssignmentStore({ db });

    // Step 1: build a plan (as a batch job would) -- the mix is MISSING and targetable.
    const plan = await store.buildPlan({ target: 'mix' });
    const target = plan.targets.find((t) => t.mixTitle === 'Midbatch Mix');
    assert.ok(target);
    assert.equal(target.willAssign, true);

    // Step 2 (the race): BEFORE the batch actually applies this target, an admin uploads real,
    // locked artwork directly through the admin action.
    await setUploadedArtworkAction(db, {
      entityType: 'mix',
      artistName: 'Midbatch Artist',
      mixArweaveURL: 'https://arweave.net/' + TX_MIDBATCH,
      mixTitle: 'Midbatch Mix',
      imageUrl: 'https://arweave.net/admin-uploaded-midbatch.jpg',
    });

    // Step 3: the batch worker, unaware of the admin's write, now applies its STALE plan target.
    const meta = buildImageMeta({ generatedMeta: { assignmentVersion: 1, sourceVideoId: 's', sourceTimeSec: 1, candidateId: 's@1.00', dHash: 'a'.repeat(16), contentHash: 'zzz' } });
    const applyResult = await store.applyEntityAssignment({
      entityKey: target.entityKey,
      entityType: 'mix',
      artistFilename: 'midbatch.html',
      mixIndex: target.mixIndex,
      imageUrl: 'https://fake.example/stale-batch-render.webp',
      meta,
    });

    assert.equal(applyResult.applied, false, 'the transaction must refuse a target that became protected after the plan snapshot');
    assert.equal(applyResult.reason, 'protected');

    const doc = await db.collection('system').doc('artists').get();
    const mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, 'https://arweave.net/admin-uploaded-midbatch.jpg', 'the admin upload must win over the stale batch write');
  });
});

/* =================================================================================
 * FINDING-3 (FIXED): --include-uploaded now actually applies; locked stays absolute
 * ================================================================================= */

describe('FINDING-3 (FIXED): --include-uploaded is threaded to the write layer, and locked artwork is still absolute', () => {
  test('a plain (non-locked) uploaded mix is reported willAssign:true with --include-uploaded, but applyEntityAssignment always refuses it', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{
        artistFilename: 'includeup.html',
        artistName: 'IncludeUp Artist',
        artistImageFilename: '',
        mixes: [{ mixTitle: 'Plain Uploaded Mix', mixArweaveURL: 'https://arweave.net/' + txid('m'), mixImageFilename: 'https://arweave.net/plain-real-cover.jpg' }],
        trax: [],
      }],
    });
    const store = createAssignmentStore({ db });

    const plan = await store.buildPlan({ target: 'mix', filters: { includeUploaded: true } });
    const target = plan.entities.find((e) => e.mixTitle === 'Plain Uploaded Mix');
    assert.equal(target.state, 'uploaded');
    assert.equal(target.targetable, true, '--include-uploaded marks it targetable in the plan/report');
    assert.equal(target.willAssign, true);

    // Default (no opt-in) stays strict: uploaded art is protected.
    const classification = classifyMixImage({ mix: { mixImageFilename: 'https://arweave.net/plain-real-cover.jpg' }, artist: {} });
    assert.equal(isProtected(classification.state, undefined), true, 'uploaded art is protected by default');
    assert.equal(isProtected(classification.state, undefined, { allowUploaded: true }), false, 'the explicit opt-in releases plain uploaded art');
    assert.equal(isProtected(classification.state, { locked: true }, { allowUploaded: true }), true, 'locked:true is absolute and the opt-in never releases it');

    const meta = buildImageMeta({ generatedMeta: { assignmentVersion: 1, sourceVideoId: 's', sourceTimeSec: 1, candidateId: 's@1.00', dHash: 'a'.repeat(16), contentHash: 'zzz' } });
    const baseArgs = {
      entityKey: target.entityKey,
      entityType: 'mix',
      artistFilename: 'includeup.html',
      mixIndex: target.mixIndex,
      imageUrl: 'https://fake.example/would-be-overwrite.webp',
      meta,
    };

    // Without the opt-in threaded through, the write is refused -- the safe default.
    const refused = await store.applyEntityAssignment({ ...baseArgs });
    assert.equal(refused.applied, false, 'without --include-uploaded the write is refused');
    assert.equal(refused.reason, 'protected');

    // FIXED: with the operator's explicit opt-in carried to the write layer, the assignment
    // actually applies -- previously the plan spent real ffmpeg time and a real Storage upload
    // on these entities and then silently discarded the result at write time.
    const applied = await store.applyEntityAssignment({ ...baseArgs, allowUploaded: true });
    assert.equal(applied.applied, true, '--include-uploaded now actually applies rather than burning spend for nothing');

    const doc = await db.collection('system').doc('artists').get();
    const mix = doc.data().artists[0].mixes[0];
    assert.equal(mix.mixImageFilename, 'https://fake.example/would-be-overwrite.webp');
    assert.equal(
      mix.previousMixImageFilename,
      'https://arweave.net/plain-real-cover.jpg',
      'the replaced cover is preserved for rollback'
    );
  });

  test('locked:true artwork is refused even with --include-uploaded, at the store boundary', async () => {
    setFlag('true');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{
        artistFilename: 'lockedup.html',
        artistName: 'LockedUp Artist',
        artistImageFilename: '',
        mixes: [{
          mixTitle: 'Locked Mix',
          mixArweaveURL: 'https://arweave.net/' + txid('n'),
          mixImageFilename: 'https://arweave.net/locked-real-cover.jpg',
          mixImageMeta: { origin: 'uploaded', locked: true },
        }],
        trax: [],
      }],
    });
    const store = createAssignmentStore({ db });
    const entityKey = deriveMixKey({ artistFilename: 'lockedup.html', mixArweaveURL: 'https://arweave.net/' + txid('n'), mixTitle: 'Locked Mix' });
    const meta = buildImageMeta({ generatedMeta: { assignmentVersion: 1, sourceVideoId: 's', sourceTimeSec: 1, candidateId: 's@1.00', dHash: 'a'.repeat(16), contentHash: 'zzz' } });

    const result = await store.applyEntityAssignment({
      entityKey,
      entityType: 'mix',
      artistFilename: 'lockedup.html',
      mixIndex: 0,
      imageUrl: 'https://fake.example/should-never-land.webp',
      meta,
      allowUploaded: true,
    });
    assert.equal(result.applied, false, 'locked artwork is never overwritten, opt-in or not');
    assert.equal(result.reason, 'protected');

    const doc = await db.collection('system').doc('artists').get();
    assert.equal(doc.data().artists[0].mixes[0].mixImageFilename, 'https://arweave.net/locked-real-cover.jpg');
  });
});

/* =================================================================================
 * Flag bypass
 * ================================================================================= */

describe('flag bypass: SKYLINE_THUMBNAILS_ENABLED=false blocks generation/enqueue/mutation everywhere', () => {
  test('addMixToArtist with the flag off writes the mix but enqueues nothing', async () => {
    setFlag('false');
    const db = createFakeFirestore();
    const result = await addMixToArtist(db, 'Flagoff Artist', {
      mixTitle: 'Flagoff Mix',
      mixArweaveURL: 'https://arweave.net/' + txid('n'),
      mixDateYear: '2024',
      mixDuration: '10:00',
      mixImageFilename: '',
      isTrack: false,
    });
    assert.equal(result.added, true);
    assert.equal(result.thumbnail.status, THUMBNAIL_STATUS.NOT_REQUESTED);

    const jobsSnap = await db.collection('skyline_thumbnail_jobs').get();
    assert.equal(jobsSnap.docs.length, 0, 'no job may be created while the flag is off');
  });

  test('applyEntityAssignment throws when the flag is off (assertSkylineEnabled)', async () => {
    setFlag('false');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({
      artists: [{ artistFilename: 'x.html', artistName: 'X', artistImageFilename: '', mixes: [{ mixTitle: 'M', mixArweaveURL: 'https://arweave.net/' + txid('o'), mixImageFilename: '' }], trax: [] }],
    });
    const store = createAssignmentStore({ db });
    const meta = buildImageMeta({ generatedMeta: { assignmentVersion: 1, sourceVideoId: 's', sourceTimeSec: 1, candidateId: 's@1.00', dHash: 'a'.repeat(16), contentHash: 'zzz' } });
    await assert.rejects(
      () => store.applyEntityAssignment({ entityKey: 'k', entityType: 'mix', artistFilename: 'x.html', mixIndex: 0, imageUrl: 'https://fake.example/x.webp', meta }),
      /disabled/i
    );
  });

  test('the backfill CLI refuses --apply outright when the flag is off, before touching Firestore', async () => {
    setFlag('false');
    const db = createFakeFirestore();
    await db.collection('system').doc('artists').set({ artists: buildFixtureArtists() });
    const before = await db.collection('system').doc('artists').get();

    const result = await runCli(['--apply', '--yes-i-approve-apply', '--report-dir', freshTmpDir('flagoff-cli')], {
      db,
      env: { SKYLINE_THUMBNAILS_ENABLED: 'false' },
    });
    assert.equal(result.exitCode, 1);
    assert.match(result.error, /Refusing --apply/);

    const after = await db.collection('system').doc('artists').get();
    assert.deepEqual(after.data(), before.data());
  });
});
