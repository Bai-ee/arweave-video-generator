/**
 * Treatment v2 — high-contrast B&W + CRT scanlines, and the regrade path.
 *
 * Two things must hold for a regrade to be safe:
 *
 *  1. It must NOT change which still a mix shows. Selection is seeded per
 *     assignmentVersion, and the used-index now contains every live candidate,
 *     so simply re-running selection would pick a different frame. The regrade
 *     therefore forces the already-assigned candidate.
 *  2. It must NOT overwrite the live v1 object. Those are served with
 *     `cache-control: immutable`, so overwriting in place would leave browsers
 *     and CDNs on the old grade indefinitely. A regrade publishes a new,
 *     treatment-versioned path instead.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';

import { createSkylineThumbnailService } from '../worker/lib/SkylineThumbnailService.js';

/* A catalog with enough sources that selection has somewhere to go. */
function makeCatalog(ids = ['skyline-a', 'skyline-b', 'skyline-c', 'skyline-d']) {
  return {
    catalogVersion: 1,
    assignmentVersionDefault: 1,
    bucket: 'bucket',
    output: { storagePrefix: 'website/generated-thumbnails/v1', size: 960, quality: 82, format: 'webp' },
    sampling: { fractions: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], jitterSeconds: 0.75 },
    quality: { minLuminance: 18, maxLuminance: 238, minStdDev: 12, minLaplacianVar: 8, maxDHashHammingForDuplicate: 6 },
    sources: ids.map((id, i) => ({
      id,
      storagePath: `skyline/${id}.mov`,
      publicUrl: `https://example/${id}.mov`,
      contentType: 'video/quicktime',
      sizeBytes: 1000,
      durationSec: 10 + i,
      width: 1920,
      height: 1080,
      collection: 'skyline',
      enabled: true,
      excludeRanges: [],
      notes: ''
    }))
  };
}

/* A gray raster with enough variation to clear the quality gate. */
function grayRaster(size = 256, seed = 7) {
  const b = Buffer.alloc(size * size);
  for (let i = 0; i < b.length; i += 1) b[i] = (i * 31 + seed * 17) % 256;
  return b;
}

function harness() {
  const calls = [];
  const runFfmpeg = async ({ args, expectStdout }) => {
    calls.push({ args, vf: args[args.indexOf('-vf') + 1] });
    if (expectStdout) return { stdout: grayRaster(), stderr: '' };
    const out = args[args.length - 1];
    await fs.mkdir(path.dirname(out), { recursive: true });
    await fs.writeFile(out, Buffer.from('webp-bytes'));
    return { stdout: Buffer.alloc(0), stderr: '' };
  };
  const uploads = [];
  const storage = {
    async download({ destPath }) { await fs.mkdir(path.dirname(destPath), { recursive: true }); await fs.writeFile(destPath, 'v'); },
    async upload({ storagePath }) { uploads.push(storagePath); return { publicUrl: `https://fake/${storagePath}`, generation: '1' }; }
  };
  return { calls, uploads, runFfmpeg, storage };
}

const tmp = (n) => path.join(os.tmpdir(), `skyline-v2-${n}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
const renderVf = (calls) => calls.filter(c => c.args.includes('libwebp')).map(c => c.vf)[0];

describe('treatment v2 — the shipped default look', () => {
  test('render chain normalises, applies the tone curve, and draws CRT scanlines', async () => {
    const h = harness();
    const service = createSkylineThumbnailService({
      catalog: makeCatalog(), storage: h.storage, runFfmpeg: h.runFfmpeg, tmpRoot: tmp('chain')
    });
    const r = await service.generate({
      entityType: 'mix', stableKey: 'aaaabbbbccccdddd', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false
    });
    assert.equal(r.ok, true, r.ok ? '' : JSON.stringify(r.error));
    const vf = renderVf(h.calls);

    assert.match(vf, /normalize=blackpt=black:whitept=white:smoothing=0/);
    assert.match(vf, /curves=master='0\/0 0\.18\/0\.06 0\.45\/0\.45 0\.80\/0\.93 1\/1'/);
    assert.match(vf, /geq=lum='lum\(X\\,Y\)\*\(1-0\.38\*gte\(mod\(Y\\,8\)\\,4\)\)'/);
    assert.match(vf, /noise=alls=12:allf=u:all_seed=\d+/);
    assert.ok(vf.startsWith("crop='min(iw,ih)':'min(iw,ih)',scale=960:960:flags=lanczos,format=gray"));
    assert.ok(vf.endsWith('format=gray'));
    // v2 grades through curves, never the v1 global eq.
    assert.ok(!vf.includes('eq=contrast='), 'v2 must not emit the v1 eq grade');
  });

  test('scanlines come AFTER the grade and BEFORE grain, so the lines are graded-then-textured', async () => {
    const h = harness();
    const service = createSkylineThumbnailService({
      catalog: makeCatalog(), storage: h.storage, runFfmpeg: h.runFfmpeg, tmpRoot: tmp('order')
    });
    await service.generate({
      entityType: 'mix', stableKey: 'ordr1111ordr1111', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false
    });
    const vf = renderVf(h.calls);
    assert.ok(vf.indexOf('curves=') < vf.indexOf('geq=lum='), 'curve must precede scanlines');
    assert.ok(vf.indexOf('geq=lum=') < vf.indexOf('noise='), 'scanlines must precede grain');
    assert.ok(vf.indexOf('noise=') < vf.indexOf('vignette='), 'grain must precede vignette');
  });

  test('pinning treatmentVersion 1 reproduces the v1 grade exactly — the regrade rollback path', async () => {
    const h = harness();
    const service = createSkylineThumbnailService({
      catalog: makeCatalog(), storage: h.storage, runFfmpeg: h.runFfmpeg, tmpRoot: tmp('pin-v1'),
      treatment: { treatmentVersion: 1 }
    });
    const r = await service.generate({
      entityType: 'mix', stableKey: 'v1v1v1v1v1v1v1v1', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false
    });
    assert.equal(r.ok, true);
    const vf = renderVf(h.calls);
    assert.match(vf, /eq=contrast=1\.3:brightness=-0\.03:gamma=0\.95:saturation=0/);
    assert.ok(!vf.includes('normalize='), 'v1 must not normalise');
    assert.ok(!vf.includes('curves='), 'v1 must not use the tone curve');
    assert.ok(!vf.includes('geq=lum='), 'v1 must not draw scanlines');
    // and it must keep the original, already-published URL shape
    assert.equal(h.uploads[0], 'website/generated-thumbnails/v1/mix/v1v1v1v1v1v1v1v1-v1.webp');
    assert.equal(r.meta.treatmentVersion, 1);
  });
});

describe('regrade safety', () => {
  test('a v2 render never overwrites the live v1 object path', async () => {
    const h = harness();
    const service = createSkylineThumbnailService({
      catalog: makeCatalog(), storage: h.storage, runFfmpeg: h.runFfmpeg, tmpRoot: tmp('path')
    });
    await service.generate({
      entityType: 'mix', stableKey: '0123456789abcdef', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false
    });
    assert.equal(h.uploads[0], 'website/generated-thumbnails/v1/mix/0123456789abcdef-v1t2.webp');
    assert.ok(!h.uploads[0].endsWith('-v1.webp'), 'must not reuse the immutable v1 path');
  });

  test('forceCandidate re-renders the SAME frame instead of selecting a new one', async () => {
    const cat = makeCatalog();
    // First: a normal generate, to learn which candidate selection picks.
    const h1 = harness();
    const s1 = createSkylineThumbnailService({ catalog: cat, storage: h1.storage, runFfmpeg: h1.runFfmpeg, tmpRoot: tmp('fc1') });
    const first = await s1.generate({
      entityType: 'mix', stableKey: 'forceforceforce1', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false
    });
    assert.equal(first.ok, true);
    const chosen = first.meta.candidateId;

    // Now regrade with that candidate forced, and with the used-index already
    // containing it — which without forceCandidate would push selection away.
    const h2 = harness();
    const s2 = createSkylineThumbnailService({ catalog: cat, storage: h2.storage, runFfmpeg: h2.runFfmpeg, tmpRoot: tmp('fc2') });
    const regrade = await s2.generate({
      entityType: 'mix', stableKey: 'forceforceforce1', assignmentVersion: 1,
      used: { candidateIds: new Set([chosen]), dHashes: [first.meta.dHash] },
      dryRun: false,
      forceCandidate: { candidateId: chosen, dHash: first.meta.dHash }
    });
    assert.equal(regrade.ok, true);
    assert.equal(regrade.meta.candidateId, chosen, 'regrade must keep the same frame');
    assert.equal(regrade.meta.dHash, first.meta.dHash, 'regrade must keep the stored dHash');
    assert.equal(regrade.meta.sourceVideoId, first.meta.sourceVideoId);
    assert.equal(regrade.meta.sourceTimeSec, first.meta.sourceTimeSec);
    assert.equal(regrade.probeCount, 0, 'forced regrade must not probe candidates at all');
  });

  test('without forceCandidate, a seeded used-index does move selection to a different frame', async () => {
    const cat = makeCatalog();
    const h1 = harness();
    const s1 = createSkylineThumbnailService({ catalog: cat, storage: h1.storage, runFfmpeg: h1.runFfmpeg, tmpRoot: tmp('nf1') });
    const first = await s1.generate({
      entityType: 'mix', stableKey: 'noforce111111111', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false
    });
    const h2 = harness();
    const s2 = createSkylineThumbnailService({ catalog: cat, storage: h2.storage, runFfmpeg: h2.runFfmpeg, tmpRoot: tmp('nf2') });
    const second = await s2.generate({
      entityType: 'mix', stableKey: 'noforce111111111', assignmentVersion: 1,
      used: { candidateIds: new Set([first.meta.candidateId]), dHashes: [] }, dryRun: false
    });
    assert.equal(second.ok, true);
    assert.notEqual(second.meta.candidateId, first.meta.candidateId,
      'this is exactly why a regrade must force the candidate');
  });

  test('forceCandidate for a candidate no longer in the catalog fails loudly, it does not silently re-select', async () => {
    const h = harness();
    const service = createSkylineThumbnailService({
      catalog: makeCatalog(), storage: h.storage, runFfmpeg: h.runFfmpeg, tmpRoot: tmp('gone')
    });
    const r = await service.generate({
      entityType: 'mix', stableKey: 'goneGONEgoneGONE', assignmentVersion: 1,
      used: { candidateIds: new Set(), dHashes: [] }, dryRun: false,
      forceCandidate: { candidateId: 'skyline-deleted@1.00', dHash: 'ffffffffffffffff' }
    });
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'no-eligible-candidate');
    assert.match(r.error.message, /not in the current catalog inventory/);
    assert.equal(h.uploads.length, 0, 'nothing may be uploaded on a failed regrade');
  });
});
