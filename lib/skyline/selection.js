/**
 * lib/skyline/selection.js
 *
 * Pure, deterministic candidate selection over a pre-built candidate
 * inventory (lib/skyline/catalog.js#buildCandidateInventory). No network,
 * no ffmpeg, no randomness beyond the caller-supplied seed.
 *
 * Owner: Workstream A (source catalog + media processing).
 * Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.4.
 *
 * `computeProbeOrder` is an additional export beyond the frozen contract
 * surface (selectCandidate is unchanged) — it factors out the deterministic
 * start/stride probe sequence so worker/lib/SkylineThumbnailService.js can
 * drive the same order while interleaving async ffmpeg analysis, without
 * duplicating the stride/gcd math. See final report for rationale.
 */

import { hammingHex } from './imageAnalysis.js';

function gcd(a, b) {
  let x = a;
  let y = b;
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * Compute the deterministic visiting order over `n` items for a given seed.
 * start = seed % n; stride = 1 + (seed >>> 8) % (n - 1), reduced until
 * gcd(stride, n) === 1; visits (start + i*stride) % n for i in [0, n).
 *
 * @param {{ n: number, seed: number }} params
 * @returns {number[]} array of indices, length n (or 0 when n <= 0)
 */
export function computeProbeOrder({ n, seed }) {
  if (!Number.isInteger(n) || n <= 0) return [];
  if (n === 1) return [0];

  const s = ((seed % n) + n) % n;
  let stride = 1 + (seed >>> 8) % (n - 1);
  while (gcd(stride, n) !== 1) {
    stride += 1;
    if (stride >= n) stride = 1;
  }

  const order = new Array(n);
  for (let i = 0; i < n; i++) {
    order[i] = (s + i * stride) % n;
  }
  return order;
}

/**
 * Deterministically select the first eligible, unused, non-duplicate
 * candidate in probe order.
 *
 * A candidate is skipped when: its id is in `used.candidateIds`, when
 * `isEligible(candidate)` is false, or — when the candidate object itself
 * carries a `.dHash` field (attached by a caller that has already analyzed
 * it) — when that dHash is within `maxDHashHamming` of any hash already in
 * `used.dHashes`. First survivor wins. Same inputs => same output, always.
 *
 * @param {{
 *   candidates: Array<{candidateId:string,sourceVideoId:string,storagePath:string,timeSec:number,dHash?:string}>,
 *   seed: number,
 *   used: { candidateIds: Set<string>, dHashes: string[] },
 *   isEligible: (candidate: any) => boolean,
 *   maxDHashHamming: number
 * }} params
 * @returns {{ candidate: any, probeCount: number } | { candidate: null, exhausted: true, probeCount: number }}
 */
export function selectCandidate({ candidates, seed, used, isEligible, maxDHashHamming }) {
  const list = Array.isArray(candidates) ? candidates : [];
  const n = list.length;
  const usedIds = used && used.candidateIds instanceof Set ? used.candidateIds : new Set(used && used.candidateIds);
  const usedHashes = (used && used.dHashes) || [];
  const order = computeProbeOrder({ n, seed });

  let probeCount = 0;
  for (const idx of order) {
    const candidate = list[idx];
    probeCount++;

    if (usedIds.has(candidate.candidateId)) continue;
    if (typeof isEligible === 'function' && !isEligible(candidate)) continue;
    if (candidate.dHash && usedHashes.length > 0) {
      const tooClose = usedHashes.some((h) => hammingHex(h, candidate.dHash) <= maxDHashHamming);
      if (tooClose) continue;
    }

    return { candidate, probeCount };
  }

  return { candidate: null, exhausted: true, probeCount };
}
