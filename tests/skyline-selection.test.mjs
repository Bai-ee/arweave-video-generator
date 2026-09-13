// lib/skyline/imageAnalysis.js + lib/skyline/selection.js — pure tests.
// Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.3 (imageAnalysis) and §3.4 (selection).
//
// imageAnalysis.js has no dedicated test file in the contract's ownership
// table (only keys/catalog/selection/thumbnail-service are listed for
// Workstream A); its coverage lives here because selection.js's dHash-dedup
// branch depends directly on hammingHex from imageAnalysis.js.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeGrayRaster,
  dHashFromGrayRaster,
  hammingHex,
  scoreCandidate
} from '../lib/skyline/imageAnalysis.js';
import { computeProbeOrder, selectCandidate } from '../lib/skyline/selection.js';

function grayBuffer(width, height, fn) {
  const buf = Buffer.alloc(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      buf[y * width + x] = fn(x, y);
    }
  }
  return buf;
}

const W = 32;
const H = 32;

const FLAT_MID = grayBuffer(W, H, () => 128);
const FLAT_DARK = grayBuffer(W, H, () => 5);
const FLAT_BRIGHT = grayBuffer(W, H, () => 250);
const CHECKERBOARD = grayBuffer(W, H, (x, y) => ((x + y) % 2 === 0 ? 40 : 220));
const HALF_SPLIT = grayBuffer(W, H, (x) => (x < W / 2 ? 30 : 220));

describe('analyzeGrayRaster', () => {
  test('flat raster: mean equals the value, stdDev and laplacianVar are 0', () => {
    const { luminanceMean, stdDev, laplacianVar } = analyzeGrayRaster(FLAT_MID, W, H);
    assert.equal(luminanceMean, 128);
    assert.equal(stdDev, 0);
    assert.equal(laplacianVar, 0);
  });

  test('checkerboard: high stdDev and high laplacianVar (sharp, high contrast)', () => {
    const { stdDev, laplacianVar } = analyzeGrayRaster(CHECKERBOARD, W, H);
    assert.ok(stdDev > 50);
    assert.ok(laplacianVar > 0);
  });

  test('a single hard edge produces higher laplacianVar than a flat image', () => {
    const flat = analyzeGrayRaster(FLAT_MID, W, H);
    const edge = analyzeGrayRaster(HALF_SPLIT, W, H);
    assert.ok(edge.laplacianVar > flat.laplacianVar);
  });

  test('throws on a buffer too small for the given dimensions', () => {
    assert.throws(() => analyzeGrayRaster(Buffer.alloc(4), 32, 32));
  });
});

describe('dHashFromGrayRaster', () => {
  test('returns a 16-char lowercase hex string', () => {
    const hash = dHashFromGrayRaster(CHECKERBOARD, W, H);
    assert.match(hash, /^[0-9a-f]{16}$/);
  });

  test('is deterministic for identical input', () => {
    assert.equal(dHashFromGrayRaster(CHECKERBOARD, W, H), dHashFromGrayRaster(CHECKERBOARD, W, H));
  });

  test('a flat raster hashes to all-zero bits (no left<right transitions)', () => {
    const hash = dHashFromGrayRaster(FLAT_MID, W, H);
    assert.equal(hash, '0'.repeat(16));
  });

  test('visually distinct rasters produce different hashes', () => {
    assert.notEqual(dHashFromGrayRaster(CHECKERBOARD, W, H), dHashFromGrayRaster(HALF_SPLIT, W, H));
  });
});

describe('hammingHex', () => {
  test('distance between identical hashes is 0', () => {
    assert.equal(hammingHex('abcd1234abcd1234', 'abcd1234abcd1234'), 0);
  });

  test('distance between fully-inverted nibbles is 4 bits per nibble', () => {
    // 0000 vs 1111 (0x0 vs 0xf) across 4 nibbles => 16 bits
    assert.equal(hammingHex('0000', 'ffff'), 16);
  });

  test('throws on mismatched lengths', () => {
    assert.throws(() => hammingHex('abcd', 'abcde'));
  });

  test('throws on invalid hex characters', () => {
    assert.throws(() => hammingHex('zzzz', 'abcd'));
  });
});

describe('scoreCandidate', () => {
  test('accepts a well-lit, high-contrast, sharp candidate', () => {
    const stats = analyzeGrayRaster(CHECKERBOARD, W, H);
    const { ok, reasons } = scoreCandidate(stats, {
      minLuminance: 18,
      maxLuminance: 238,
      minStdDev: 12,
      minLaplacianVar: 8
    });
    assert.equal(ok, true);
    assert.deepEqual(reasons, []);
  });

  test('rejects too-dark', () => {
    const stats = analyzeGrayRaster(FLAT_DARK, W, H);
    const { ok, reasons } = scoreCandidate(stats, { minLuminance: 18 });
    assert.equal(ok, false);
    assert.deepEqual(reasons, ['too-dark']);
  });

  test('rejects too-bright', () => {
    const stats = analyzeGrayRaster(FLAT_BRIGHT, W, H);
    const { ok, reasons } = scoreCandidate(stats, { maxLuminance: 238 });
    assert.equal(ok, false);
    assert.deepEqual(reasons, ['too-bright']);
  });

  test('rejects low-contrast', () => {
    const stats = analyzeGrayRaster(FLAT_MID, W, H);
    const { ok, reasons } = scoreCandidate(stats, { minStdDev: 12 });
    assert.equal(ok, false);
    assert.deepEqual(reasons, ['low-contrast']);
  });

  test('rejects blurry', () => {
    const stats = analyzeGrayRaster(FLAT_MID, W, H);
    const { ok, reasons } = scoreCandidate(stats, { minLaplacianVar: 8 });
    assert.equal(ok, false);
    assert.deepEqual(reasons, ['blurry']);
  });

  test('can report multiple reasons at once', () => {
    const stats = analyzeGrayRaster(FLAT_DARK, W, H);
    const { ok, reasons } = scoreCandidate(stats, { minLuminance: 18, minStdDev: 12, minLaplacianVar: 8 });
    assert.equal(ok, false);
    assert.ok(reasons.includes('too-dark'));
    assert.ok(reasons.includes('low-contrast'));
    assert.ok(reasons.includes('blurry'));
  });
});

describe('computeProbeOrder', () => {
  test('visits every index exactly once (a permutation of [0, n))', () => {
    const order = computeProbeOrder({ n: 17, seed: 123456789 });
    assert.equal(order.length, 17);
    assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: 17 }, (_, i) => i));
  });

  test('is deterministic for the same (n, seed)', () => {
    const a = computeProbeOrder({ n: 17, seed: 123456789 });
    const b = computeProbeOrder({ n: 17, seed: 123456789 });
    assert.deepEqual(a, b);
  });

  test('different seeds generally produce different orders', () => {
    const a = computeProbeOrder({ n: 17, seed: 111 });
    const b = computeProbeOrder({ n: 17, seed: 222 });
    assert.notDeepEqual(a, b);
  });

  test('n=1 returns [0]', () => {
    assert.deepEqual(computeProbeOrder({ n: 1, seed: 999 }), [0]);
  });

  test('n<=0 returns an empty array', () => {
    assert.deepEqual(computeProbeOrder({ n: 0, seed: 999 }), []);
  });

  test('handles a seed that would make (n-1) the modulus divisor edge case', () => {
    // n-1 = 1 => (seed >>> 8) % 1 is always 0 => stride starts at 1, always coprime.
    const order = computeProbeOrder({ n: 2, seed: 4294967295 });
    assert.deepEqual([...order].sort((a, b) => a - b), [0, 1]);
  });
});

function makeCandidates(n) {
  return Array.from({ length: n }, (_, i) => ({
    candidateId: `src-${i}@1.00`,
    sourceVideoId: `src-${i}`,
    storagePath: `skyline/src-${i}.mov`,
    timeSec: 1
  }));
}

describe('selectCandidate', () => {
  test('returns the first survivor in deterministic probe order', () => {
    const candidates = makeCandidates(10);
    const seed = 42;
    const order = computeProbeOrder({ n: 10, seed });
    const result = selectCandidate({
      candidates,
      seed,
      used: { candidateIds: new Set(), dHashes: [] },
      isEligible: () => true,
      maxDHashHamming: 6
    });
    assert.equal(result.candidate.candidateId, candidates[order[0]].candidateId);
    assert.equal(result.probeCount, 1);
  });

  test('skips candidates already in used.candidateIds', () => {
    const candidates = makeCandidates(5);
    const seed = 7;
    const order = computeProbeOrder({ n: 5, seed });
    const firstId = candidates[order[0]].candidateId;
    const result = selectCandidate({
      candidates,
      seed,
      used: { candidateIds: new Set([firstId]), dHashes: [] },
      isEligible: () => true,
      maxDHashHamming: 6
    });
    assert.notEqual(result.candidate.candidateId, firstId);
  });

  test('skips candidates isEligible rejects', () => {
    const candidates = makeCandidates(5);
    const seed = 7;
    const order = computeProbeOrder({ n: 5, seed });
    const firstId = candidates[order[0]].candidateId;
    const result = selectCandidate({
      candidates,
      seed,
      used: { candidateIds: new Set(), dHashes: [] },
      isEligible: (c) => c.candidateId !== firstId,
      maxDHashHamming: 6
    });
    assert.notEqual(result.candidate.candidateId, firstId);
  });

  test('skips a candidate whose attached dHash is within maxDHashHamming of a used hash', () => {
    const candidates = makeCandidates(5).map((c, i) => ({ ...c, dHash: i === 0 ? '0000000000000000' : 'ffffffffffffffff' }));
    // Force probe order so index 0 (the near-duplicate) is visited first by
    // trying seeds until we find one; with n=5 this is cheap and deterministic
    // once found, so hardcode a seed known (via computeProbeOrder) to start at 0.
    let seed = 0;
    while (computeProbeOrder({ n: 5, seed })[0] !== 0) seed++;

    const result = selectCandidate({
      candidates,
      seed,
      used: { candidateIds: new Set(), dHashes: ['0000000000000000'] }, // hamming(0000...,0000...) = 0 <= maxDHashHamming
      isEligible: () => true,
      maxDHashHamming: 6
    });
    assert.notEqual(result.candidate.candidateId, candidates[0].candidateId);
  });

  test('does NOT skip on dHash when the candidate carries no dHash field', () => {
    const candidates = makeCandidates(5); // no .dHash attached
    const seed = 7;
    const order = computeProbeOrder({ n: 5, seed });
    const result = selectCandidate({
      candidates,
      seed,
      used: { candidateIds: new Set(), dHashes: ['0000000000000000'] },
      isEligible: () => true,
      maxDHashHamming: 64
    });
    assert.equal(result.candidate.candidateId, candidates[order[0]].candidateId);
  });

  test('returns exhausted:true when every candidate is used', () => {
    const candidates = makeCandidates(3);
    const result = selectCandidate({
      candidates,
      seed: 1,
      used: { candidateIds: new Set(candidates.map((c) => c.candidateId)), dHashes: [] },
      isEligible: () => true,
      maxDHashHamming: 6
    });
    assert.equal(result.candidate, null);
    assert.equal(result.exhausted, true);
    assert.equal(result.probeCount, 3);
  });

  test('returns exhausted:true for an empty candidate list', () => {
    const result = selectCandidate({
      candidates: [],
      seed: 1,
      used: { candidateIds: new Set(), dHashes: [] },
      isEligible: () => true,
      maxDHashHamming: 6
    });
    assert.equal(result.candidate, null);
    assert.equal(result.exhausted, true);
    assert.equal(result.probeCount, 0);
  });

  test('same inputs always produce the same output (determinism)', () => {
    const candidates = makeCandidates(20);
    const args = {
      candidates,
      seed: 999,
      used: { candidateIds: new Set([candidates[3].candidateId]), dHashes: [] },
      isEligible: (c) => c.candidateId !== candidates[7].candidateId,
      maxDHashHamming: 6
    };
    const a = selectCandidate(args);
    const b = selectCandidate({ ...args, used: { candidateIds: new Set([candidates[3].candidateId]), dHashes: [] } });
    assert.deepEqual(a, b);
  });
});
