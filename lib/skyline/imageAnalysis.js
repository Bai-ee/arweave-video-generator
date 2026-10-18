/**
 * lib/skyline/imageAnalysis.js
 *
 * Pure, dependency-free image-quality analysis over raw 8-bit single-channel
 * ("gray") pixel buffers, row-major, width*height bytes. No image-decoding
 * libraries — the caller is responsible for producing the raw gray raster
 * (the service does this via ffmpeg's `-pix_fmt gray -f rawvideo` output).
 *
 * Owner: Workstream A (source catalog + media processing).
 * Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.3.
 */

function assertRaster(buffer, width, height) {
  if (!width || !height || width <= 0 || height <= 0) {
    throw new Error(`imageAnalysis: invalid dimensions ${width}x${height}`);
  }
  const expected = width * height;
  if (!buffer || buffer.length < expected) {
    throw new Error(
      `imageAnalysis: buffer too small for ${width}x${height} raster (need ${expected}, got ${buffer ? buffer.length : 0})`
    );
  }
}

/**
 * Compute luminance mean, standard deviation, and a Laplacian-variance
 * sharpness metric over a raw gray raster.
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {number} width
 * @param {number} height
 * @returns {{ luminanceMean: number, stdDev: number, laplacianVar: number }}
 */
export function analyzeGrayRaster(buffer, width, height) {
  assertRaster(buffer, width, height);
  const n = width * height;

  let sum = 0;
  for (let i = 0; i < n; i++) sum += buffer[i];
  const luminanceMean = sum / n;

  let sqDiffSum = 0;
  for (let i = 0; i < n; i++) {
    const d = buffer[i] - luminanceMean;
    sqDiffSum += d * d;
  }
  const stdDev = Math.sqrt(sqDiffSum / n);

  // 3x3 discrete Laplacian kernel [[0,1,0],[1,-4,1],[0,1,0]] applied to the
  // interior of the raster; laplacianVar = variance of the response
  // (a standard, dependency-free blur metric — higher = sharper).
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const lap =
        buffer[idx - 1] + buffer[idx + 1] + buffer[idx - width] + buffer[idx + width] - 4 * buffer[idx];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const lapMean = count > 0 ? lapSum / count : 0;
  const laplacianVar = count > 0 ? lapSqSum / count - lapMean * lapMean : 0;

  return { luminanceMean, stdDev, laplacianVar };
}

/**
 * Compute a 64-bit difference hash (dHash) as a 16-char lowercase hex
 * string. Box-downsamples the raster to 9x8, then for each of the 8 rows
 * compares each of the 9 columns to its right-hand neighbour (8 comparisons
 * per row => 64 bits total).
 *
 * @param {Buffer|Uint8Array} buffer
 * @param {number} width
 * @param {number} height
 * @returns {string} 16-char lowercase hex
 */
export function dHashFromGrayRaster(buffer, width, height) {
  assertRaster(buffer, width, height);
  const dw = 9;
  const dh = 8;
  const small = boxDownsample(buffer, width, height, dw, dh);

  const bits = new Array(dh * (dw - 1));
  let b = 0;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw - 1; x++) {
      const left = small[y * dw + x];
      const right = small[y * dw + x + 1];
      bits[b++] = left < right ? 1 : 0;
    }
  }

  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    const nibble = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    hex += nibble.toString(16);
  }
  return hex;
}

function boxDownsample(buffer, width, height, dw, dh) {
  const sums = new Float64Array(dw * dh);
  const counts = new Float64Array(dw * dh);
  for (let y = 0; y < height; y++) {
    const dy = Math.min(dh - 1, Math.floor((y / height) * dh));
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const dx = Math.min(dw - 1, Math.floor((x / width) * dw));
      const idx = dy * dw + dx;
      sums[idx] += buffer[row + x];
      counts[idx] += 1;
    }
  }
  const out = new Uint8Array(dw * dh);
  for (let i = 0; i < dw * dh; i++) {
    out[i] = counts[i] > 0 ? Math.round(sums[i] / counts[i]) : 0;
  }
  return out;
}

/**
 * Hamming distance between two equal-length hex strings (bit-level).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function hammingHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    throw new Error('hammingHex: inputs must be equal-length hex strings');
  }
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const av = parseInt(a[i], 16);
    const bv = parseInt(b[i], 16);
    if (Number.isNaN(av) || Number.isNaN(bv)) {
      throw new Error(`hammingHex: invalid hex character at index ${i}`);
    }
    let x = av ^ bv;
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

/**
 * Score a candidate's analysis stats against catalog quality thresholds.
 * Reject reasons use exactly these strings: 'too-dark', 'too-bright',
 * 'low-contrast', 'blurry'.
 *
 * @param {{ luminanceMean: number, stdDev: number, laplacianVar: number }} stats
 * @param {{ minLuminance?: number, maxLuminance?: number, minStdDev?: number, minLaplacianVar?: number }} qualityCfg
 * @returns {{ ok: boolean, reasons: string[], score: number }}
 */
export function scoreCandidate(stats, qualityCfg) {
  const cfg = qualityCfg || {};
  const { luminanceMean, stdDev, laplacianVar } = stats || {};
  const reasons = [];

  if (typeof cfg.minLuminance === 'number' && luminanceMean < cfg.minLuminance) {
    reasons.push('too-dark');
  }
  if (typeof cfg.maxLuminance === 'number' && luminanceMean > cfg.maxLuminance) {
    reasons.push('too-bright');
  }
  if (typeof cfg.minStdDev === 'number' && stdDev < cfg.minStdDev) {
    reasons.push('low-contrast');
  }
  if (typeof cfg.minLaplacianVar === 'number' && laplacianVar < cfg.minLaplacianVar) {
    reasons.push('blurry');
  }

  // Composite score: reward contrast + sharpness, penalize distance from
  // mid-gray luminance. Only used for optional ranking; ok/reasons are the
  // authoritative accept/reject signal.
  const score = (stdDev || 0) + (laplacianVar || 0) - Math.abs((luminanceMean || 0) - 128) * 0.1;

  return { ok: reasons.length === 0, reasons, score };
}
