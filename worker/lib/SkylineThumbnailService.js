/**
 * worker/lib/SkylineThumbnailService.js
 *
 * Isolated, testable thumbnail-generation service for the skyline pipeline.
 * Loads a validated catalog, derives a deterministic candidate, downloads
 * the source video, runs an ffmpeg analysis pass per examined candidate,
 * scores it, and — for the winner only — runs a second ffmpeg pass to crop
 * + scale + WebP-encode the final still, then hands the result to an
 * injected `storage.upload()` (or writes a dry-run preview instead).
 *
 * The service never touches Firestore and never throws for expected
 * failures (download/ffmpeg/encode/upload/no-eligible-candidate/invalid
 * catalog) — it returns `{ ok: false, error: { code, message } }`.
 *
 * IMPORTANT: `ffmpeg-static` is resolved lazily, inside the default ffmpeg
 * runner function, never at module top level — this file is imported by
 * root-level tests (`node --test tests/*.test.mjs` from the repo root),
 * and the root `node_modules` has no ffmpeg package. Tests must inject a
 * fake `runFfmpeg` and fake `storage`.
 *
 * Owner: Workstream A (source catalog + media processing).
 * Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.5.
 */

import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { validateCatalog, buildCandidateInventory } from '../../lib/skyline/catalog.js';
import { seedFromKey } from '../../lib/skyline/keys.js';
import { analyzeGrayRaster, dHashFromGrayRaster, scoreCandidate, hammingHex } from '../../lib/skyline/imageAnalysis.js';
import { selectCandidate } from '../../lib/skyline/selection.js';

const SERVICE_VERSION = 1;
const ANALYSIS_SIZE = 256;
const DEFAULT_OUTPUT_SIZE = 960;
const DEFAULT_OUTPUT_QUALITY = 82;
const DEFAULT_MAX_DHASH_HAMMING = 6;
// Single source of truth for the deterministic square centre crop, shared by the
// analysis pass and the final render so both see identical pixels.
const SQUARE_CROP_FILTER = "crop='min(iw,ih)':'min(iw,ih)'";

// ffmpeg's `noise` filter's `all_seed` option accepts -1..INT_MAX (2147483647).
// seedFromKey() returns an unsigned 32-bit int (up to 4294967295), which can
// exceed that range, so it is folded down deterministically (same input ⇒
// same output, always) rather than passed through raw.
const NOISE_SEED_MODULUS = 2147483647; // 2^31 - 1, ffmpeg's all_seed INT_MAX

/**
 * Visual-treatment config (Job A brief, not part of the frozen §3.5 catalog
 * contract): black-and-white / grainy / high-contrast / cinematic look
 * applied ONLY to the final render pass. Loaded lazily from
 * config/skyline-thumbnail-treatment.json, with a baked-in default so the
 * service never throws when the file is absent (e.g. a fresh checkout that
 * hasn't restored the gitignore-allow-listed file yet).
 *
 * Keys are frozen (see SKYLINE_THUMBNAIL_TREATMENT contract in the Job A
 * brief); numeric values are tunable.
 */
const DEFAULT_TREATMENT = Object.freeze({
  treatmentVersion: 2,
  monochrome: true,
  // v2 grades by normalising each frame's own levels and then applying a fixed
  // S-curve, rather than by pushing a global `contrast` value. A single
  // contrast number cannot serve both a near-black night tower and a bright
  // daytime skyline: the value that makes the daylight frame punchy crushes the
  // night frame to mud. Per-frame normalisation is what makes 31 thumbnails
  // drawn from wildly different footage read as one consistent set.
  normalize: true,
  // Deep blacks, held midtones, clean (unclipped) highlights.
  toneCurve: '0/0 0.18/0.06 0.45/0.45 0.80/0.93 1/1',
  unsharpAmount: 0.85,
  // CRT scanlines. `scanlinePitch` is in pixels at the 960px render size.
  // 8 was chosen by measurement, not taste: finer pitches are averaged away
  // entirely by the browser's downscale to the ~230px card and 64px archive
  // row, so they exist only in the file and never on screen. At pitch 8 the
  // lines survive at hero (~490px) and card (~230px) sizes without degrading
  // into coarse bars. See outputs contact sheets `crt-pitch.png`.
  scanlinePitch: 8,
  scanlineDepth: 0.38,
  grainStrength: 12,
  vignetteStrength: 0.35,
  encodeQuality: 84,
  // Legacy v1 knobs, kept so a treatment file pinned to v1 still renders the
  // original look (used only when `normalize` is false).
  contrast: 1.3,
  brightness: -0.03,
  gamma: 0.95
});

/**
 * The original v1 look, kept as a real, selectable base rather than as
 * documentation. Pinning `treatmentVersion: 1` (in the config file or via the
 * constructor seam) must reproduce the v1 grade exactly — that is the rollback
 * path for a regrade, and the v2 keys must not bleed into it through the
 * defaults merge.
 */
const TREATMENT_V1 = Object.freeze({
  treatmentVersion: 1,
  monochrome: true,
  normalize: false,
  toneCurve: null,
  contrast: 1.3,
  brightness: -0.03,
  gamma: 0.95,
  unsharpAmount: 0.55,
  scanlinePitch: 0,
  scanlineDepth: 0,
  grainStrength: 16,
  vignetteStrength: 0.3,
  encodeQuality: 82
});

/**
 * Pick the defaults a partial treatment should be merged onto, based on the
 * treatmentVersion it declares. Without this, a v1-pinned config would inherit
 * v2's normalize/toneCurve/scanline keys and silently render the v2 look.
 * @param {object|null|undefined} incoming
 * @returns {object}
 */
function baseForTreatment(incoming) {
  const v = incoming && Number(incoming.treatmentVersion);
  return v === 1 ? TREATMENT_V1 : DEFAULT_TREATMENT;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_TREATMENT_PATH = path.join(__dirname, '..', '..', 'config', 'skyline-thumbnail-treatment.json');

const noopLogger = { info() {}, warn() {}, error() {} };

/**
 * Fold an unsigned 32-bit seed into ffmpeg noise filter's valid `all_seed`
 * range (0..2147483647). Deterministic: same seed in ⇒ same seed out, always.
 * @param {number} seed
 * @returns {number}
 */
function deriveNoiseSeed(seed) {
  const n = Number(seed) || 0;
  return ((n % NOISE_SEED_MODULUS) + NOISE_SEED_MODULUS) % NOISE_SEED_MODULUS;
}

/**
 * Map a 0..1 "vignette strength" onto ffmpeg vignette filter's `angle`
 * parameter (radians). ffmpeg's own default is PI/5 (a mild vignette);
 * larger angles darken the corners more. This is our own mapping, not a
 * physical unit, so it only needs to be monotonic and stable.
 * @param {number} strength
 * @returns {number}
 */
function vignetteAngleFromStrength(strength) {
  const s = Math.max(0, Math.min(1, Number(strength) || 0));
  const minAngle = Math.PI / 5; // ffmpeg default — barely visible
  const maxAngle = Math.PI / 2.1; // strong but still shows detail in the corners
  return minAngle + s * (maxAngle - minAngle);
}

/**
 * Build the final-render ffmpeg -vf chain: the frozen square centre crop +
 * scale (contract §3.5) followed by the Job A black-and-white/grainy/
 * cinematic treatment. Never applied to the analysis pass.
 * @param {{ size: number, treatment: object, noiseSeed: number }} params
 * @returns {string}
 */
function buildRenderFilterChain({ size, treatment, noiseSeed }) {
  const filters = [SQUARE_CROP_FILTER, `scale=${size}:${size}:flags=lanczos`];

  if (treatment.monochrome) filters.push('format=gray');

  if (treatment.normalize) {
    // Stretch each frame to the full black..white range before grading, so the
    // fixed tone curve below lands the same way on a night shot and a noon
    // shot. smoothing=0 keeps it a pure per-frame op (we render one frame).
    filters.push('normalize=blackpt=black:whitept=white:smoothing=0');
  }

  if (treatment.toneCurve) {
    filters.push(`curves=master='${treatment.toneCurve}'`);
  } else {
    // v1 path: a single global contrast/brightness/gamma grade.
    // saturation is only forced to 0 when the config actually asks for
    // monochrome — `monochrome` is a real toggle, not just documentation.
    const saturation = treatment.monochrome ? 0 : 1;
    filters.push(`eq=contrast=${treatment.contrast}:brightness=${treatment.brightness}:gamma=${treatment.gamma}:saturation=${saturation}`);
  }

  if (treatment.unsharpAmount) {
    filters.push(`unsharp=5:5:${treatment.unsharpAmount}:5:5:0.0`);
  }

  if (treatment.scanlineDepth > 0 && treatment.scanlinePitch >= 2) {
    // CRT scanlines: darken the lower half of every `pitch`-pixel band.
    // Commas inside the geq expression must be escaped for the filtergraph
    // parser even though we pass -vf as a single argv element.
    const pitch = Math.round(treatment.scanlinePitch);
    const depth = Number(treatment.scanlineDepth);
    filters.push(`geq=lum='lum(X\\,Y)*(1-${depth}*gte(mod(Y\\,${pitch})\\,${pitch / 2}))'`);
  }

  if (treatment.grainStrength > 0) {
    const seed = deriveNoiseSeed(noiseSeed);
    filters.push(`noise=alls=${treatment.grainStrength}:allf=u:all_seed=${seed}`);
  }

  if (treatment.vignetteStrength > 0) {
    filters.push(`vignette=angle=${vignetteAngleFromStrength(treatment.vignetteStrength).toFixed(6)}`);
  }

  if (treatment.monochrome) filters.push('format=gray');

  return filters.join(',');
}

/**
 * Asset filename stem for an assignment. The treatment version is appended
 * only from v2 onward, so every v1 asset keeps its existing URL: those objects
 * are already live and served with `immutable` caching, so re-rendering them
 * in place would leave browsers and CDNs showing the old grade indefinitely.
 * A regrade therefore publishes a NEW object and repoints the record.
 * @param {{ stableKey: string, assignmentVersion: number, treatmentVersion: number }} p
 * @returns {string}
 */
function assetStem({ stableKey, assignmentVersion, treatmentVersion }) {
  const tv = Number(treatmentVersion) || 1;
  return tv > 1
    ? `${stableKey}-v${assignmentVersion}t${tv}`
    : `${stableKey}-v${assignmentVersion}`;
}

/**
 * Resolve the ffmpeg binary path. Never called at module load time.
 * @returns {Promise<string>}
 */
async function resolveFfmpegPath() {
  try {
    const mod = await import('ffmpeg-static');
    const resolved = mod && (mod.default || mod);
    if (typeof resolved === 'string' && resolved) return resolved;
  } catch {
    // ffmpeg-static not resolvable from this module's location — fall through.
  }
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return 'ffmpeg';
}

/**
 * Default ffmpeg runner: spawns the resolved binary, captures stdout as a
 * Buffer and stderr as text. Rejects on non-zero exit, or when
 * `expectStdout` is true and stdout came back empty.
 *
 * @param {{ args: string[], expectStdout?: boolean }} params
 * @returns {Promise<{ stdout: Buffer, stderr: string }>}
 */
async function defaultRunFfmpeg({ args, expectStdout }) {
  const ffmpegPath = await resolveFfmpegPath();
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (err) {
      reject(err);
      return;
    }
    const stdoutChunks = [];
    const stderrChunks = [];
    proc.stdout.on('data', (d) => stdoutChunks.push(d));
    proc.stderr.on('data', (d) => stderrChunks.push(d));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks);
      const stderrText = Buffer.concat(stderrChunks).toString('utf8');
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderrText.slice(-800)}`));
        return;
      }
      if (expectStdout && stdout.length === 0) {
        reject(new Error(`ffmpeg produced no stdout output: ${stderrText.slice(-800)}`));
        return;
      }
      resolve({ stdout, stderr: stderrText });
    });
  });
}

/**
 * @param {{
 *   catalog: any,
 *   storage: { download: Function, upload: Function },
 *   runFfmpeg?: Function,
 *   tmpRoot?: string,
 *   logger?: { info: Function, warn: Function, error: Function },
 *   treatment?: object,
 *   treatmentPath?: string
 * }} params
 *
 * `treatment` and `treatmentPath` are ADDITIVE, optional constructor options
 * beyond the frozen §3.5 signature (same pattern as SkylineAssignmentStore's
 * `keysModule` test seam): `treatment` injects an already-resolved treatment
 * object directly (skips the file read entirely — used by tests and by any
 * future caller that wants to override the look), `treatmentPath` points the
 * lazy loader at a different file. Real callers that omit both are
 * unaffected: the service reads config/skyline-thumbnail-treatment.json
 * lazily on first render and falls back to a baked-in default identical to
 * that file if it can't be read.
 */
export function createSkylineThumbnailService({ catalog, storage, runFfmpeg, tmpRoot, logger, treatment, treatmentPath } = {}) {
  if (!storage || typeof storage.download !== 'function' || typeof storage.upload !== 'function') {
    throw new Error('createSkylineThumbnailService: storage.download and storage.upload are required');
  }

  const log = logger || noopLogger;
  const root = tmpRoot || path.join(os.tmpdir(), 'skyline-thumbs');
  const runner = typeof runFfmpeg === 'function' ? runFfmpeg : defaultRunFfmpeg;

  let validated = null; // { ok, errors, catalog }
  let candidateInventory = null;
  let cachedTreatment = null;

  /**
   * Lazily loads the visual-treatment config. Never throws: an unreadable or
   * malformed file falls back to DEFAULT_TREATMENT (merged with whatever did
   * parse), with a warning through the injected logger.
   */
  async function ensureTreatment() {
    if (cachedTreatment) return cachedTreatment;
    if (treatment && typeof treatment === 'object') {
      cachedTreatment = { ...baseForTreatment(treatment), ...treatment };
      return cachedTreatment;
    }
    const resolvedPath = treatmentPath || DEFAULT_TREATMENT_PATH;
    try {
      const raw = await fs.readFile(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      cachedTreatment = { ...baseForTreatment(parsed), ...parsed };
    } catch (err) {
      log.warn(
        `[SkylineThumbnailService] treatment config unavailable at "${resolvedPath}" (${err && err.message ? err.message : err}); using baked-in default`
      );
      cachedTreatment = { ...DEFAULT_TREATMENT };
    }
    return cachedTreatment;
  }

  // Source video downloads are cached per service-instance ("per process
  // run") and reused across generate() calls for different entities that
  // share a source video, per contract §3.5. They are cleaned up by
  // `cleanup()` (an additive convenience method — see final report) rather
  // than after every single generate() call, so the reuse is real.
  const sourceCache = new Map(); // sourceVideoId -> local file path
  // Per-candidate analysis is also cached per service-instance so a
  // candidate examined for one entity is never re-analyzed for another.
  const analysisCache = new Map(); // candidateId -> { stats, dHash, eligible, reasons }

  function ensureValidated() {
    if (validated) return validated;
    validated = validateCatalog(catalog);
    if (validated.ok) {
      candidateInventory = buildCandidateInventory(validated.catalog);
    }
    return validated;
  }

  async function ensureRoot() {
    await fs.mkdir(root, { recursive: true });
  }

  async function cleanupFile(p) {
    if (!p) return;
    try {
      await fs.unlink(p);
    } catch {
      // already gone / never existed — fine.
    }
  }

  async function downloadSource(candidate) {
    const cached = sourceCache.get(candidate.sourceVideoId);
    if (cached) return cached;
    await ensureRoot();
    const ext = path.extname(candidate.storagePath) || '.bin';
    const destPath = path.join(root, `src-${candidate.sourceVideoId}${ext}`);
    try {
      await storage.download({ storagePath: candidate.storagePath, destPath });
    } catch (err) {
      const wrapped = new Error(`Failed to download source "${candidate.storagePath}": ${err.message}`);
      wrapped.code = 'SOURCE_DOWNLOAD_FAILED';
      throw wrapped;
    }
    sourceCache.set(candidate.sourceVideoId, destPath);
    return destPath;
  }

  async function analyzeCandidate(candidate, qualityCfg) {
    const cached = analysisCache.get(candidate.candidateId);
    if (cached) return cached;

    const srcPath = await downloadSource(candidate);
    // The analysis pass MUST apply the same square centre crop as renderFinal()
    // below. Analyzing the full 16:9 frame squashed into a square would judge
    // luminance/contrast/sharpness — and compute the near-duplicate dHash — over
    // pixels that never ship, so a frame could pass the quality gate on content
    // that the centre crop discards (or be rejected for content it discards).
    const args = [
      '-ss', String(candidate.timeSec),
      '-i', srcPath,
      '-frames:v', '1',
      '-vf', `${SQUARE_CROP_FILTER},scale=${ANALYSIS_SIZE}:${ANALYSIS_SIZE}`,
      '-pix_fmt', 'gray',
      '-f', 'rawvideo',
      '-'
    ];
    const { stdout } = await runner({ args, expectStdout: true });
    const stats = analyzeGrayRaster(stdout, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const dHash = dHashFromGrayRaster(stdout, ANALYSIS_SIZE, ANALYSIS_SIZE);
    const scored = scoreCandidate(stats, qualityCfg);
    const result = { stats, dHash, eligible: scored.ok, reasons: scored.reasons, score: scored.score };
    analysisCache.set(candidate.candidateId, result);
    return result;
  }

  async function renderFinal(candidate, outputCfg, treatmentCfg, noiseSeed) {
    await ensureRoot();
    const srcPath = await downloadSource(candidate);
    const safeId = candidate.candidateId.replace(/[^a-zA-Z0-9@.-]/g, '_');
    const outPath = path.join(root, `render-${safeId}-${Date.now()}-${Math.random().toString(16).slice(2)}.webp`);
    const size = outputCfg.size || DEFAULT_OUTPUT_SIZE;
    // The visual treatment's encodeQuality is authoritative for the shipped
    // black-and-white/grainy look (Job A brief); it falls back to the
    // catalog's output.quality, then the service default, only if a
    // treatment config somehow has no value at all.
    const quality =
      treatmentCfg && treatmentCfg.encodeQuality != null
        ? treatmentCfg.encodeQuality
        : outputCfg.quality != null
          ? outputCfg.quality
          : DEFAULT_OUTPUT_QUALITY;
    const vf = buildRenderFilterChain({ size, treatment: treatmentCfg, noiseSeed });
    const args = [
      '-ss', String(candidate.timeSec),
      '-i', srcPath,
      '-frames:v', '1',
      '-vf', vf,
      '-c:v', 'libwebp',
      '-quality', String(quality),
      '-y', outPath
    ];
    await runner({ args, expectStdout: false });
    const buffer = await fs.readFile(outPath);
    return { buffer, outPath, width: size, height: size };
  }

  /**
   * Walk the deterministic probe order (via the real, frozen
   * selectCandidate), analyzing candidates on demand (async), until a
   * quality-eligible, non-duplicate candidate is found or the search is
   * exhausted. `used` is read-only here — never mutated (contract:
   * "caller-owned, mutated by caller not service").
   */
  async function findWinner({ candidates, seed, used, maxDHashHamming, qualityCfg, rejected }) {
    const localExcluded = new Set(used && used.candidateIds ? used.candidateIds : []);
    const callerDHashes = (used && used.dHashes) || [];
    let probeCount = 0;

    for (let iter = 0; iter < candidates.length + 1; iter++) {
      const result = selectCandidate({
        candidates,
        seed,
        used: { candidateIds: localExcluded, dHashes: [] },
        isEligible: () => true,
        maxDHashHamming
      });

      if (!result.candidate) {
        return { candidate: null, exhausted: true, probeCount };
      }

      probeCount += 1;
      const candidate = result.candidate;
      const analysis = await analyzeCandidate(candidate, qualityCfg);

      if (!analysis.eligible) {
        localExcluded.add(candidate.candidateId);
        rejected.push({ candidateId: candidate.candidateId, reasons: analysis.reasons });
        continue;
      }

      const tooClose = callerDHashes.some((h) => hammingHex(h, analysis.dHash) <= maxDHashHamming);
      if (tooClose) {
        localExcluded.add(candidate.candidateId);
        rejected.push({ candidateId: candidate.candidateId, reasons: ['near-duplicate'] });
        continue;
      }

      return {
        candidate: { ...candidate, dHash: analysis.dHash },
        exhausted: false,
        probeCount,
        analysis
      };
    }

    return { candidate: null, exhausted: true, probeCount };
  }

  function buildMeta({ candidate, assignmentVersion, treatmentVersion, generatedAt, contentHash, rendered, storagePath }) {
    return {
      origin: 'generated-skyline',
      assignmentVersion,
      treatmentVersion: Number(treatmentVersion) || 1,
      sourceVideoId: candidate.sourceVideoId,
      sourceTimeSec: candidate.timeSec,
      candidateId: candidate.candidateId,
      dHash: candidate.dHash,
      generatedAt,
      contentHash,
      storagePath: storagePath || '',
      width: rendered.width,
      height: rendered.height,
      bytes: rendered.buffer.length,
      locked: false,
      serviceVersion: SERVICE_VERSION
    };
  }

  function fail(code, message) {
    return { ok: false, error: { code, message } };
  }

  function mapSearchError(err) {
    const message = err && err.message ? err.message : String(err);
    if (err && err.code === 'SOURCE_DOWNLOAD_FAILED') {
      return fail('source-download-failed', message);
    }
    return fail('ffmpeg-failed', message);
  }

  /**
   * @param {{
   *   entityType: 'mix'|'artist', stableKey: string, assignmentVersion: number,
   *   used: { candidateIds: Set<string>, dHashes: string[] },
   *   dryRun?: boolean, previewDir?: string
   * }} params
   */
  async function generate({ entityType, stableKey, assignmentVersion, used, dryRun, previewDir, forceCandidate }) {
    try {
      if (entityType !== 'mix' && entityType !== 'artist') {
        return fail('catalog-invalid', `entityType must be 'mix' or 'artist', got "${entityType}"`);
      }
      if (!stableKey || typeof stableKey !== 'string') {
        return fail('catalog-invalid', 'stableKey is required');
      }
      if (!Number.isInteger(assignmentVersion) || assignmentVersion < 1) {
        return fail('catalog-invalid', `assignmentVersion must be an integer >= 1, got ${assignmentVersion}`);
      }
      if (dryRun && !previewDir) {
        return fail('catalog-invalid', 'previewDir is required when dryRun is true');
      }

      const v = ensureValidated();
      if (!v.ok) {
        return fail('catalog-invalid', `Skyline catalog failed validation: ${v.errors.join('; ')}`);
      }

      const qualityCfg = v.catalog.quality || {};
      const outputCfg = v.catalog.output || {};
      const maxDHashHamming =
        typeof qualityCfg.maxDHashHammingForDuplicate === 'number'
          ? qualityCfg.maxDHashHammingForDuplicate
          : DEFAULT_MAX_DHASH_HAMMING;

      const seed = seedFromKey({ entityType, stableKey, assignmentVersion });
      const rejected = [];

      let winner;
      if (forceCandidate && forceCandidate.candidateId) {
        // Re-render an ALREADY-ASSIGNED frame under a new treatment. Selection
        // is skipped entirely: a regrade must not change which still a mix
        // shows, and re-running selection would, because the probe order is
        // seeded per assignmentVersion and the used-index now contains this
        // very candidate. The stored dHash is reused verbatim so the record's
        // provenance and the cross-run uniqueness index stay consistent.
        const found = candidateInventory.find(c => c.candidateId === forceCandidate.candidateId);
        if (!found) {
          return fail(
            'no-eligible-candidate',
            `forceCandidate "${forceCandidate.candidateId}" is not in the current catalog inventory (its source may have been disabled)`
          );
        }
        winner = { candidate: { ...found, dHash: forceCandidate.dHash || found.dHash }, probeCount: 0 };
      } else {
        try {
          winner = await findWinner({
            candidates: candidateInventory,
            seed,
            used,
            maxDHashHamming,
            qualityCfg,
            rejected
          });
        } catch (err) {
          return mapSearchError(err);
        }
      }

      if (!winner.candidate) {
        return fail(
          'no-eligible-candidate',
          `No eligible candidate found for ${entityType}:${stableKey} (v${assignmentVersion}) after ${winner.probeCount} probes`
        );
      }

      const candidate = winner.candidate;
      const treatmentCfg = await ensureTreatment();

      let rendered;
      try {
        // `seed` (seedFromKey({entityType, stableKey, assignmentVersion})) is
        // reused as the deterministic film-grain seed: same key + same
        // version + same candidate ⇒ the ffmpeg `noise` filter is given the
        // identical `all_seed`, so the encoded WebP bytes (and contentHash)
        // are byte-identical across separate processes. Never random/time-based.
        rendered = await renderFinal(candidate, outputCfg, treatmentCfg, seed);
      } catch (err) {
        return fail('encode-failed', `Final render failed: ${err.message}`);
      }

      const contentHash = createHash('sha256').update(rendered.buffer).digest('hex');
      const generatedAt = new Date().toISOString();

      if (dryRun) {
        await fs.mkdir(previewDir, { recursive: true });
        const previewPath = path.join(previewDir, `${entityType}-${assetStem({ stableKey, assignmentVersion, treatmentVersion: treatmentCfg.treatmentVersion })}.webp`);
        await fs.copyFile(rendered.outPath, previewPath);
        await cleanupFile(rendered.outPath);

        return {
          ok: true,
          imageUrl: '',
          localPath: previewPath,
          meta: buildMeta({ candidate, assignmentVersion, treatmentVersion: treatmentCfg.treatmentVersion, generatedAt, contentHash, rendered }),
          rejected,
          probeCount: winner.probeCount
        };
      }

      const storagePath = `${outputCfg.storagePrefix}/${entityType}/${assetStem({ stableKey, assignmentVersion, treatmentVersion: treatmentCfg.treatmentVersion })}.webp`;

      let uploadResult;
      try {
        uploadResult = await storage.upload({
          localPath: rendered.outPath,
          storagePath,
          contentType: 'image/webp',
          metadata: { cacheControl: 'public, max-age=31536000, immutable' }
        });
      } catch (err) {
        await cleanupFile(rendered.outPath);
        return fail('upload-failed', `Upload failed: ${err.message}`);
      }

      await cleanupFile(rendered.outPath);

      return {
        ok: true,
        imageUrl: (uploadResult && uploadResult.publicUrl) || '',
        localPath: rendered.outPath,
        meta: buildMeta({ candidate, assignmentVersion, treatmentVersion: treatmentCfg.treatmentVersion, generatedAt, contentHash, rendered, storagePath }),
        rejected,
        probeCount: winner.probeCount
      };
    } catch (err) {
      log.error('[SkylineThumbnailService] unexpected error', err);
      return fail('ffmpeg-failed', err && err.message ? err.message : String(err));
    }
  }

  /**
   * Additive convenience method (not part of the frozen contract surface):
   * removes every cached source-video download from tmpRoot. Callers that
   * run a full batch (backfill CLI, job worker) should call this once at
   * the end of the run so the per-process source cache doesn't leak disk
   * space — see final report for why source downloads are NOT deleted
   * after every single generate() call.
   */
  async function cleanup() {
    const paths = Array.from(sourceCache.values());
    sourceCache.clear();
    analysisCache.clear();
    await Promise.all(paths.map((p) => cleanupFile(p)));
  }

  return { generate, cleanup };
}
