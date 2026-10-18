#!/usr/bin/env node
/**
 * scripts/build-skyline-source-catalog.mjs
 *
 * Regenerates config/skyline-thumbnail-sources.json by listing the two
 * approved skyline-footage prefixes in Firebase Storage (read-only) and
 * probing each video's duration/dimensions with the ffmpeg binary's `-i`
 * stderr output (ffprobe-static is not available in this repo).
 *
 * READ-ONLY on the bucket: lists objects and downloads them to a local
 * temp dir purely to probe metadata; never writes/deletes/uploads to
 * Storage, never touches Firestore.
 *
 * Usage:
 *   node scripts/build-skyline-source-catalog.mjs [--dry-run] [--limit N] [--concurrency N]
 *
 * Owner: Workstream A (source catalog + media processing).
 * Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.2 (catalog shape).
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');

const CATALOG_OUTPUT_PATH = path.join(REPO_ROOT, 'config', 'skyline-thumbnail-sources.json');

const PREFIXES = [
  { prefix: 'skyline/', collection: 'skyline' },
  { prefix: 'assets/chicago-skyline-videos/', collection: 'chicago-skyline-videos' }
];

const VIDEO_EXTENSIONS = ['.mov', '.mp4', '.m4v', '.webm', '.avi'];

// Fixed catalog defaults — mirror SKYLINE_THUMBNAIL_CONTRACT.md §3.2 exactly.
const CATALOG_VERSION = 1;
const ASSIGNMENT_VERSION_DEFAULT = 1;
const BUCKET_NAME = 'editvideos-63486.firebasestorage.app';
const OUTPUT_CFG = {
  storagePrefix: 'website/generated-thumbnails/v1',
  size: 960,
  quality: 82,
  format: 'webp'
};
const SAMPLING_CFG = {
  fractions: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85],
  jitterSeconds: 0.75
};
const QUALITY_CFG = {
  minLuminance: 18,
  maxLuminance: 238,
  minStdDev: 12,
  minLaplacianVar: 8,
  maxDHashHammingForDuplicate: 6
};

const DEFAULT_CONCURRENCY = 8;

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, concurrency: DEFAULT_CONCURRENCY };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (a.startsWith('--limit=')) args.limit = parseInt(a.slice('--limit='.length), 10);
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i], 10);
    else if (a.startsWith('--concurrency=')) args.concurrency = parseInt(a.slice('--concurrency='.length), 10);
  }
  return args;
}

function isVideoFile(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.keep')) return false;
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function stableId(storagePath) {
  const hex = createHash('sha256').update(storagePath, 'utf8').digest('hex').slice(0, 8);
  return `skyline-${hex}`;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Parse duration (seconds) and pixel width/height out of `ffmpeg -i <file>`
 * stderr text. ffmpeg always exits non-zero for a bare `-i` probe (no
 * output specified) — that is expected and not treated as failure here;
 * we only care about the stream-info lines it prints before erroring out.
 */
function parseFfmpegProbeOutput(stderrText) {
  const durationMatch = stderrText.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  let durationSec = null;
  if (durationMatch) {
    const h = parseInt(durationMatch[1], 10);
    const m = parseInt(durationMatch[2], 10);
    const s = parseFloat(durationMatch[3]);
    durationSec = h * 3600 + m * 60 + s;
  }

  let width = null;
  let height = null;
  const videoLines = stderrText.split('\n').filter((l) => /Stream #.*Video:/.test(l));
  for (const line of videoLines) {
    const dimMatch = line.match(/(\d{2,5})x(\d{2,5})/);
    if (dimMatch) {
      width = parseInt(dimMatch[1], 10);
      height = parseInt(dimMatch[2], 10);
      break;
    }
  }

  return { durationSec, width, height };
}

const DOWNLOAD_TIMEOUT_MS = 120000; // 2 min — generous for a large .mov over a slow link, but bounded.
const PROBE_TIMEOUT_MS = 30000;

/**
 * Race a promise against a timeout so a single stalled network call (no
 * timeout of its own in the GCS Admin SDK / our ffmpeg spawn) can never
 * hang the whole concurrency pool forever. On timeout, the underlying
 * promise is left to settle on its own (nothing to cancel cleanly here);
 * the caller treats the timeout as a normal per-item failure.
 */
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function runFfmpegProbe(ffmpegPath, filePath) {
  const run = new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-i', filePath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrText = '';
    proc.stderr.on('data', (d) => {
      stderrText += d.toString('utf8');
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', () => {
      // ffmpeg -i with no output always exits non-zero — that's expected.
      resolve(stderrText);
    });
  });
  return withTimeout(run, PROBE_TIMEOUT_MS, 'ffmpeg probe');
}

async function resolveFfmpegPath() {
  const workerBinary = path.join(REPO_ROOT, 'worker', 'node_modules', 'ffmpeg-static', 'ffmpeg');
  if (fssync.existsSync(workerBinary)) return workerBinary;
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  return 'ffmpeg';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Load env from repo root .env.local via the repo's own dotenv install.
  const dotenv = await import(path.join(REPO_ROOT, 'node_modules', 'dotenv', 'lib', 'main.js'));
  dotenv.config({ path: path.join(REPO_ROOT, '.env.local'), quiet: true });

  const { initializeFirebaseAdmin, getStorage } = await import(path.join(REPO_ROOT, 'lib', 'firebase-admin.js'));
  initializeFirebaseAdmin();
  const bucket = getStorage().bucket();

  const ffmpegPath = await resolveFfmpegPath();
  console.log(`[build-skyline-source-catalog] Using ffmpeg: ${ffmpegPath}`);

  // 1. List both prefixes.
  let allFiles = [];
  for (const { prefix, collection } of PREFIXES) {
    const [files] = await bucket.getFiles({ prefix });
    const videos = files.filter((f) => isVideoFile(f.name));
    console.log(`[build-skyline-source-catalog] ${prefix} -> ${videos.length} video file(s)`);
    for (const f of videos) {
      allFiles.push({ file: f, collection });
    }
  }

  // Deterministic base ordering before an optional --limit truncation.
  allFiles.sort((a, b) => (a.file.name < b.file.name ? -1 : a.file.name > b.file.name ? 1 : 0));

  if (Number.isInteger(args.limit) && args.limit >= 0) {
    allFiles = allFiles.slice(0, args.limit);
  }

  console.log(`[build-skyline-source-catalog] Probing ${allFiles.length} source video(s) (concurrency=${args.concurrency})...`);

  const tmpRoot = path.join(os.tmpdir(), 'skyline-catalog-build');
  await fs.mkdir(tmpRoot, { recursive: true });

  let probed = 0;
  let skipped = 0;

  const results = await mapWithConcurrency(allFiles, args.concurrency, async ({ file, collection }) => {
    const storagePath = file.name;
    const destPath = path.join(tmpRoot, `${stableId(storagePath)}${path.extname(storagePath) || '.bin'}`);
    try {
      await withTimeout(file.download({ destination: destPath }), DOWNLOAD_TIMEOUT_MS, `download ${storagePath}`);
      const stderrText = await runFfmpegProbe(ffmpegPath, destPath);
      const { durationSec, width, height } = parseFfmpegProbeOutput(stderrText);

      if (!durationSec || durationSec <= 0 || !width || !height) {
        console.warn(`[build-skyline-source-catalog] WARN: could not parse duration/dimensions for ${storagePath} — skipping`);
        skipped++;
        return null;
      }

      probed++;
      if (probed % 10 === 0 || probed === allFiles.length) {
        console.log(`[build-skyline-source-catalog] probed ${probed}/${allFiles.length}`);
      }

      return {
        id: stableId(storagePath),
        storagePath,
        publicUrl: `https://storage.googleapis.com/${BUCKET_NAME}/${storagePath}`,
        contentType: file.metadata.contentType || 'application/octet-stream',
        sizeBytes: Number(file.metadata.size || 0),
        durationSec: Math.round(durationSec * 100) / 100,
        width,
        height,
        collection,
        enabled: true,
        excludeRanges: [],
        notes: ''
      };
    } catch (err) {
      console.warn(`[build-skyline-source-catalog] WARN: failed to probe ${storagePath}: ${err.message}`);
      skipped++;
      return null;
    } finally {
      try {
        await fs.unlink(destPath);
      } catch {
        // never downloaded / already removed — fine.
      }
    }
  });

  const sources = results.filter(Boolean).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const catalog = {
    catalogVersion: CATALOG_VERSION,
    assignmentVersionDefault: ASSIGNMENT_VERSION_DEFAULT,
    bucket: BUCKET_NAME,
    output: OUTPUT_CFG,
    sampling: SAMPLING_CFG,
    quality: QUALITY_CFG,
    sources
  };

  const json = `${JSON.stringify(catalog, null, 2)}\n`;

  console.log(`[build-skyline-source-catalog] cataloged ${sources.length} source(s), skipped ${skipped}`);

  if (args.dryRun) {
    console.log('[build-skyline-source-catalog] --dry-run: not writing. Catalog JSON follows:\n');
    console.log(json);
    return;
  }

  await fs.mkdir(path.dirname(CATALOG_OUTPUT_PATH), { recursive: true });
  await fs.writeFile(CATALOG_OUTPUT_PATH, json, 'utf8');
  console.log(`[build-skyline-source-catalog] wrote ${CATALOG_OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error('[build-skyline-source-catalog] FAILED:', err.message);
  process.exitCode = 1;
});
