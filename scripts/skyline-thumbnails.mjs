#!/usr/bin/env node
/**
 * scripts/skyline-thumbnails.mjs — skyline thumbnail backfill CLI
 * (contract §3.10).
 *
 * Usage:
 *   node scripts/skyline-thumbnails.mjs [options]
 *
 *   --dry-run                  (DEFAULT — always assumed unless --apply given)
 *   --apply                    mutate; requires SKYLINE_THUMBNAILS_ENABLED=true AND --yes-i-approve-apply
 *   --yes-i-approve-apply
 *   --target mix|artist|both   default both
 *   --limit N
 *   --artist <artistFilename|artistName>
 *   --mix-key <16-hex>
 *   --include-uploaded         opt-in ONLY; overrides nothing by itself — still refuses locked:true
 *   --regenerate               bump assignmentVersion for already-generated entities
 *   --assignment-version N
 *   --report-dir <path>        default outputs/skyline-dryrun/<runId>
 *   --json                     machine-readable summary on stdout
 *   --sync                     (repo hard-constraint, not in §3.10) run WebsiteSync AFTER a fully
 *                               successful --apply batch only; never runs on its own, never in dry-run
 *   --rerender                 re-grade already-generated thumbnails with the current treatment:
 *                              same frame, same assignmentVersion, new treatment-versioned asset path
 *   --ignore-used-index        maintenance override (Job B amendment, not in §3.10): skip seeding the
 *                               `used` collision-avoidance set from store.readUsedIndex() entirely, so
 *                               every entity is selected as if no prior run ever happened. Prints a loud
 *                               warning always; when combined with --apply, --yes-i-approve-apply is
 *                               (still) required on top of the flag — see resolveApplyGate.
 *
 * Cross-run uniqueness (Job B): before the first entity, `used` is seeded from
 * store.readUsedIndex() — the union of every LIVE generated-skyline mixImageMeta/
 * artistImageMeta in system/artists and every doc in the durable
 * `skyline_assignment_index` collection (which survives a record later being
 * replaced by uploaded art or restored). This runs in BOTH dry-run and apply
 * mode (it is a read), so a dry-run report honestly previews what apply would
 * do given everything already assigned in prior runs. How many prior
 * assignments were loaded is reported in report.json's `usedIndex` field.
 *
 * The apply-gate check (parseArgs + resolveApplyGate) runs BEFORE any
 * dotenv/Firebase bootstrap so `--apply` without the flag/confirmation
 * refuses instantly, with no credentials required — this is deliberate and
 * is exercised directly by tests/skyline-backfill-cli.test.mjs as a real
 * subprocess run.
 *
 * No FFmpeg call, no Firebase Storage upload, and no Firestore write ever
 * happens in dry-run mode. Dry-run previews (when the media stack from
 * Workstream A — lib/skyline/catalog.js, lib/skyline/selection.js,
 * worker/lib/SkylineThumbnailService.js — is available) render to
 * <report-dir>/previews/ only, via SkylineThumbnailService's own
 * dryRun:true path, and are never uploaded.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'fs-extra';

import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';
import { buildImageMeta } from '../lib/skyline/records.js';
import { skylineThumbnailsEnabled } from '../lib/skyline/flags.js';
import { renderSkylineReportHtml } from './skyline-report-template.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ argv */

const VALID_TARGETS = new Set(['mix', 'artist', 'both']);

export function parseArgs(argv) {
  const options = {
    apply: false,
    dryRun: true,
    yes: false,
    target: 'both',
    limit: null,
    artist: null,
    mixKey: null,
    includeUploaded: false,
    regenerate: false,
    assignmentVersion: null,
    reportDir: null,
    json: false,
    sync: false,
    ignoreUsedIndex: false,
    rerender: false
  };
  const errors = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--dry-run':
        options.dryRun = true;
        options.apply = false;
        break;
      case '--apply':
        options.apply = true;
        options.dryRun = false;
        break;
      case '--yes-i-approve-apply':
        options.yes = true;
        break;
      case '--include-uploaded':
        options.includeUploaded = true;
        break;
      case '--regenerate':
        options.regenerate = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--sync':
        options.sync = true;
        break;
      case '--ignore-used-index':
        options.ignoreUsedIndex = true;
        break;
      case '--rerender':
        options.rerender = true;
        break;
      case '--target': {
        const value = argv[i + 1];
        i += 1;
        if (!VALID_TARGETS.has(value)) {
          errors.push(`--target must be one of mix|artist|both, got: ${value}`);
        }
        options.target = value;
        break;
      }
      case '--limit': {
        const value = Number(argv[i + 1]);
        i += 1;
        if (!Number.isInteger(value) || value < 0) {
          errors.push('--limit must be a non-negative integer');
        }
        options.limit = value;
        break;
      }
      case '--artist':
        options.artist = argv[i + 1];
        i += 1;
        break;
      case '--mix-key': {
        const value = argv[i + 1];
        i += 1;
        if (!/^[0-9a-f]{16}$/i.test(value || '')) {
          errors.push('--mix-key must be a 16-character hex string');
        }
        options.mixKey = (value || '').toLowerCase();
        break;
      }
      case '--assignment-version': {
        const value = Number(argv[i + 1]);
        i += 1;
        if (!Number.isInteger(value) || value <= 0) {
          errors.push('--assignment-version must be a positive integer');
        }
        options.assignmentVersion = value;
        break;
      }
      case '--report-dir':
        options.reportDir = argv[i + 1];
        i += 1;
        break;
      default:
        errors.push(`Unknown argument: ${arg}`);
    }
  }

  return { options, errors };
}

/**
 * Refuses --apply unless BOTH the feature flag and the explicit confirmation
 * flag are present. Runs before any Firebase/dotenv bootstrap.
 *
 * `--ignore-used-index` (Job B maintenance override) does not get its own
 * separate bypass here: this same gate is what "additionally requires
 * --yes-i-approve-apply when combined with --apply" per the brief — there is
 * no code path that lets --ignore-used-index skip it.
 */
export function resolveApplyGate({ options, env }) {
  if (!options.apply) {
    return { allowed: true, mode: 'dry-run' };
  }
  const flagOn = skylineThumbnailsEnabled(env);
  if (!flagOn || !options.yes) {
    const missing = [];
    if (!flagOn) missing.push('SKYLINE_THUMBNAILS_ENABLED=true');
    if (!options.yes) missing.push('--yes-i-approve-apply');
    const suffix = options.ignoreUsedIndex
      ? ' (--ignore-used-index combined with --apply still requires --yes-i-approve-apply.)'
      : '';
    return {
      allowed: false,
      mode: 'apply',
      message: `Refusing --apply: missing ${missing.join(' and ')}.${suffix}`
    };
  }
  return { allowed: true, mode: 'apply' };
}

function generateRunId(nowFn) {
  const now = (nowFn || (() => new Date()))();
  const iso = now.toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(16).slice(2, 8);
  return `${iso}-${rand}`;
}

function computeSkipReasonForFailure(genResult) {
  if (genResult && genResult.error) return genResult.error.code || 'generation-failed';
  return 'generation-failed';
}

function toCsv(rows, columns) {
  const escCell = (value) => {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.join(',');
  const lines = rows.map((row) => columns.map((c) => escCell(row[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
}

const CSV_COLUMNS = [
  'entityType',
  'entityKey',
  'artistFilename',
  'artistName',
  'mixTitle',
  'currentUrl',
  'state',
  'reason',
  'eligible',
  'protectedEntity',
  'locked',
  'duplicateRecord',
  'willAssign',
  'skipReason',
  'mediaStatus',
  'sharedWithDuplicateKey',
  'sourceVideoId',
  'sourceTimeSec',
  'candidateId',
  'dHash',
  'probeCount',
  'rejectedCount',
  'applied',
  'applyReason'
];

/* ------------------------------------------------------------ media stack */

/**
 * Loads Workstream A's catalog + selection + service modules. Returns
 * { available:false, reason } when they are not present yet (module not
 * found, catalog missing/invalid, etc.) so the CLI can degrade to a
 * plan-only (classification-only) run instead of crashing.
 */
async function resolveMediaStack(deps) {
  if (deps.media) return deps.media; // test injection point (also lets tests force plan-only with { available:false })
  try {
    const catalogMod = await import('../lib/skyline/catalog.js');
    const serviceMod = await import('../worker/lib/SkylineThumbnailService.js');
    // Resolve relative to this file's directory, not process.cwd(), so the
    // CLI works the same regardless of the caller's working directory.
    const catalogPath = deps.catalogPath || path.join(PROJECT_ROOT, catalogMod.CATALOG_PATH_DEFAULT);
    const catalog = catalogMod.loadCatalog({ catalogPath });
    const storage = deps.storage || (await createRealStorageAdapter());
    const service = serviceMod.createSkylineThumbnailService({ catalog, storage });
    return { available: true, catalog, service };
  } catch (err) {
    return { available: false, reason: err && err.message ? err.message : String(err) };
  }
}

async function createRealStorageAdapter() {
  const { getStorage } = await import('../lib/firebase-admin.js');
  const bucket = getStorage().bucket();
  return {
    async download({ storagePath, destPath }) {
      await bucket.file(storagePath).download({ destination: destPath });
      return { destPath };
    },
    async upload({ localPath, storagePath, contentType, metadata }) {
      await bucket.upload(localPath, {
        destination: storagePath,
        metadata: {
          contentType,
          cacheControl: 'public, max-age=31536000, immutable',
          metadata
        }
      });
      // The bucket has NO allUsers binding and uniform bucket-level access is
      // off, so a freshly uploaded object is private — an anonymous GET of the
      // storage.googleapis.com URL below returns 403. That URL is written
      // straight into mixImageFilename and rendered on the public site, so
      // without this every generated thumbnail is a broken image for visitors.
      // Verified with a probe object: 403 without makePublic, 200 with it.
      // Every other upload path in this repo does the same (worker/processor.js,
      // api/upload-video.js, scripts/upload-chicago-videos.js).
      await bucket.file(storagePath).makePublic();
      const [fileMeta] = await bucket.file(storagePath).getMetadata();
      return {
        publicUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
        generation: fileMeta.generation
      };
    }
  };
}

async function createRealDb() {
  const dotenv = await import('dotenv');
  dotenv.default.config({ path: path.join(PROJECT_ROOT, '.env.local') });
  dotenv.default.config({ path: path.join(PROJECT_ROOT, '.env.production') });
  dotenv.default.config({ path: path.join(PROJECT_ROOT, '.env') });
  const { initializeFirebaseAdmin, getFirestore } = await import('../lib/firebase-admin.js');
  initializeFirebaseAdmin();
  return getFirestore();
}

/* --------------------------------------------------------------- run core */

/**
 * @param {string[]} argv process.argv.slice(2)-shaped array
 * @param {object} deps injection point for tests: { env, db, store, media,
 *   storage, now, runId, projectRoot, log }
 */
export async function runCli(argv, deps = {}) {
  const log = deps.log || ((...args) => console.log(...args));
  const logError = deps.logError || ((...args) => console.error(...args));

  const { options, errors } = parseArgs(argv || []);
  if (errors.length) {
    const message = `Argument error(s): ${errors.join('; ')}`;
    logError(message);
    return { exitCode: 1, error: message };
  }

  const env = deps.env || process.env;
  const gate = resolveApplyGate({ options, env });
  if (!gate.allowed) {
    logError(gate.message);
    return { exitCode: 1, error: gate.message };
  }

  const projectRoot = deps.projectRoot || PROJECT_ROOT;
  const nowFn = deps.now || (() => new Date());
  const runId = deps.runId || generateRunId(nowFn);
  const reportDir = options.reportDir
    ? path.resolve(process.cwd(), options.reportDir)
    : path.join(projectRoot, 'outputs', 'skyline-dryrun', runId);
  const previewDir = path.join(reportDir, 'previews');

  let store = deps.store;
  let resolvedDb = deps.db || null;
  if (!store) {
    if (!resolvedDb) resolvedDb = await createRealDb();
    store = createAssignmentStore({ db: resolvedDb, now: nowFn, keysModule: deps.keysModule });
  }

  let plan;
  try {
    plan = await store.buildPlan({
      target: options.target,
      filters: {
        limit: options.limit,
        artist: options.artist,
        mixKey: options.mixKey,
        includeUploaded: options.includeUploaded,
        regenerate: options.regenerate || options.rerender,
        assignmentVersion: options.assignmentVersion
      }
    });
  } catch (err) {
    const message = `Failed to build plan: ${err && err.message ? err.message : err}`;
    logError(message);
    return { exitCode: 1, error: message };
  }

  const media = await resolveMediaStack(deps);
  if (!media.available) {
    log(`[skyline-thumbnails] Media pipeline unavailable (${media.reason}). Running classification-only plan; no proposed images will be rendered.`);
  }

  await fs.ensureDir(reportDir);
  if (options.dryRun) {
    await fs.ensureDir(previewDir);
  }

  // Cross-run uniqueness (Job B): seed `used` from the durable index BEFORE the
  // first entity, in both dry-run and apply mode (a read, so this never
  // violates dry-run's zero-writes rule). `--ignore-used-index` is a
  // deliberate, documented maintenance override for a full regenerate.
  let usedIndexResult = { candidateIds: new Set(), dHashes: [], countsBySource: { artistsDoc: 0, indexCollection: 0 } };
  if (options.ignoreUsedIndex) {
    logError(
      '[skyline-thumbnails] ⚠️  --ignore-used-index: skipping cross-run collision-avoidance seeding ENTIRELY. ' +
      'Candidates/dHashes already assigned in previous runs will NOT be avoided. ' +
      'This is a maintenance override for a deliberate, documented full regenerate — not for routine use.'
    );
  } else {
    try {
      usedIndexResult = await store.readUsedIndex();
    } catch (err) {
      logError(`[skyline-thumbnails] Failed to read the used-index (continuing with an empty seed): ${err && err.message ? err.message : err}`);
    }
  }
  const used = { candidateIds: new Set(usedIndexResult.candidateIds), dHashes: usedIndexResult.dHashes.slice() };
  const usedIndexReport = {
    candidateIds: used.candidateIds.size,
    dHashes: used.dHashes.length,
    source: options.ignoreUsedIndex ? 'ignored (--ignore-used-index)' : 'artists+index',
    countsBySource: usedIndexResult.countsBySource || null
  };

  const rows = [];
  let anyMediaFailure = false;

  // Two records can legitimately resolve to the SAME stableKey — the corpus has a
  // genuine duplicate pair (Chicago Skyway "For Hakim" twice: same artist, same
  // mixArweaveURL, same title). Their output asset path is derived from that key,
  // so generating twice would render two different frames to one path: the second
  // silently overwrites the first, and the first record's persisted provenance
  // (sourceTimeSec/dHash/contentHash) would then describe a frame its own file no
  // longer contains. Memoize per key+version so the second occurrence reuses the
  // first result verbatim — one asset, one set of provenance, and no second
  // candidate consumed out of `used`.
  const generatedByKey = new Map(); // `${entityType}:${entityKey}:v${version}` -> genResult

  try {
  for (const entity of plan.entities) {
    const row = {
      ...entity,
      mediaStatus: 'not-targeted',
      sharedWithDuplicateKey: false,
      sourceVideoId: null,
      sourceTimeSec: null,
      candidateId: null,
      dHash: null,
      probeCount: null,
      rejectedCount: null,
      previewRelPath: null,
      applied: null,
      applySkipped: null,
      applyReason: null
    };

    if (!entity.willAssign) {
      rows.push(row);
      continue;
    }

    if (!media.available) {
      row.mediaStatus = 'pending-media-step';
      row.skipReason = row.skipReason || 'media-pipeline-unavailable';
      rows.push(row);
      continue;
    }

    const dedupeKey = `${entity.entityType}:${entity.entityKey}:v${options.rerender && entity.existingMeta ? entity.existingMeta.assignmentVersion : entity.nextAssignmentVersion}`;
    const alreadyGenerated = generatedByKey.get(dedupeKey);

    let genResult;
    if (alreadyGenerated) {
      genResult = alreadyGenerated;
    } else {
      try {
        // --rerender regrades an EXISTING assignment: the same source frame is
        // re-encoded under the current treatment and published at a new,
        // treatment-versioned path. assignmentVersion is deliberately NOT
        // bumped (that would re-roll which frame the mix shows) and the stored
        // candidate is forced, so a regrade can never change the imagery.
        const rerenderMeta = options.rerender ? entity.existingMeta : null;
        genResult = await media.service.generate({
          entityType: entity.entityType,
          stableKey: entity.entityKey,
          assignmentVersion: rerenderMeta ? rerenderMeta.assignmentVersion : entity.nextAssignmentVersion,
          used,
          dryRun: options.dryRun,
          previewDir: options.dryRun ? previewDir : undefined,
          forceCandidate: rerenderMeta
            ? { candidateId: rerenderMeta.candidateId, dHash: rerenderMeta.dHash }
            : undefined
        });
      } catch (err) {
        genResult = { ok: false, error: { code: 'service-threw', message: err && err.message ? err.message : String(err) } };
      }
    }

    if (!genResult || !genResult.ok) {
      anyMediaFailure = true;
      row.mediaStatus = 'failed';
      row.skipReason = computeSkipReasonForFailure(genResult);
      rows.push(row);
      continue;
    }

    if (!alreadyGenerated) {
      generatedByKey.set(dedupeKey, genResult);
      if (genResult.meta && genResult.meta.candidateId) used.candidateIds.add(genResult.meta.candidateId);
      if (genResult.meta && genResult.meta.dHash) used.dHashes.push(genResult.meta.dHash);
    }

    row.mediaStatus = alreadyGenerated ? 'proposed-shared-key' : 'proposed';
    row.sharedWithDuplicateKey = Boolean(alreadyGenerated);
    row.sourceVideoId = genResult.meta ? genResult.meta.sourceVideoId : null;
    row.sourceTimeSec = genResult.meta ? genResult.meta.sourceTimeSec : null;
    row.candidateId = genResult.meta ? genResult.meta.candidateId : null;
    row.dHash = genResult.meta ? genResult.meta.dHash : null;
    row.probeCount = typeof genResult.probeCount === 'number' ? genResult.probeCount : null;
    row.rejectedCount = Array.isArray(genResult.rejected) ? genResult.rejected.length : null;

    if (options.dryRun && genResult.localPath) {
      row.previewRelPath = path.relative(reportDir, genResult.localPath).split(path.sep).join('/');
    }

    if (options.apply) {
      const meta = buildImageMeta({
        generatedMeta: { ...genResult.meta, assignmentVersion: genResult.meta.assignmentVersion }
      });
      let applyResult;
      try {
        applyResult = await store.applyEntityAssignment({
          entityKey: entity.entityKey,
          entityType: entity.entityType,
          artistFilename: entity.artistFilename,
          mixIndex: entity.mixIndex,
          imageUrl: genResult.imageUrl,
          meta,
          // Carry the operator's explicit --include-uploaded opt-in all the way to the write.
          // Without it the plan marked these entities targetable, the batch spent real ffmpeg
          // time and a real Storage upload on them, and the write then silently refused —
          // burning money to discard the result. `locked: true` is still refused regardless.
          allowUploaded: options.includeUploaded === true
        });
      } catch (err) {
        anyMediaFailure = true;
        applyResult = { applied: false, skipped: true, reason: err && err.message ? err.message : String(err) };
      }
      row.applied = applyResult.applied;
      row.applySkipped = applyResult.skipped;
      row.applyReason = applyResult.reason;
    }

    rows.push(row);
  }
  } finally {
    // The service caches every downloaded source video (~10-22MB each, up to ~2GB across the
    // full 140-source catalog) for the life of the instance and only releases them here.
    // Without this the tmp dir grows on EVERY run — dry runs included, since the analysis pass
    // downloads sources regardless of dryRun. In `finally` so a mid-batch throw still frees it.
    if (media.available && media.service && typeof media.service.cleanup === 'function') {
      try {
        await media.service.cleanup();
      } catch (err) {
        logError(`[skyline] source-cache cleanup failed (non-fatal): ${err && err.message ? err.message : err}`);
      }
    }
  }

  const finishedAt = nowFn().toISOString();
  const flagEnabled = skylineThumbnailsEnabled(env);
  const reportObject = {
    runId,
    generatedAt: plan.generatedAt,
    finishedAt,
    mode: options.apply ? 'apply' : 'dry-run',
    flagEnabled,
    target: options.target,
    filters: plan.filters,
    mediaAvailable: media.available,
    mediaUnavailableReason: media.available ? null : media.reason,
    counts: plan.counts,
    usedIndex: usedIndexReport,
    entities: rows
  };

  await fs.writeJson(path.join(reportDir, 'report.json'), reportObject, { spaces: 2 });
  await fs.writeFile(path.join(reportDir, 'report.csv'), toCsv(rows, CSV_COLUMNS), 'utf8');
  await fs.writeFile(path.join(reportDir, 'report.html'), renderSkylineReportHtml(reportObject), 'utf8');

  if (options.apply && !media.available) {
    // Apply mode with no media pipeline can't do anything useful --
    // refuse outright (no Firestore write attempted) rather than silently
    // "succeeding" with zero applied entities. The classification report
    // above is still written for review.
    const message = `Refusing --apply: media pipeline unavailable (${media.reason}). Report written to ${reportDir} for review; no Firestore writes were made.`;
    logError(message);
    return { exitCode: 1, error: message, reportDir, report: reportObject };
  }

  if (options.apply) {
    const appliedCount = rows.filter((r) => r.applied === true).length;
    const attemptedCount = rows.filter((r) => r.applied !== null).length;
    await store.writeAudit({
      runId,
      startedAt: plan.generatedAt,
      finishedAt,
      mode: 'apply',
      flagEnabled,
      counts: { ...plan.counts, appliedCount, attemptedCount },
      entries: rows
        .filter((r) => r.willAssign)
        .map((r) => ({
          entityType: r.entityType,
          entityKey: r.entityKey,
          artistFilename: r.artistFilename,
          mixTitle: r.mixTitle,
          before: r.currentUrl,
          after: r.applied ? r.candidateId : null,
          status: r.applied ? 'applied' : r.mediaStatus === 'failed' ? 'failed' : 'skipped',
          reason: r.applyReason || r.skipReason || null
        }))
    });

    if (options.sync && !anyMediaFailure && appliedCount > 0) {
      if (!resolvedDb) {
        logError('[skyline-thumbnails] --sync skipped: no Firestore db handle available (store was injected without a db).');
      } else {
        try {
          const syncFn = deps.syncFn || (await import('../lib/WebsiteSync.js')).syncFirebaseToWebsiteJSON;
          await syncFn(resolvedDb);
          log('[skyline-thumbnails] --sync: WebsiteSync completed after a fully successful apply batch.');
        } catch (err) {
          anyMediaFailure = true;
          logError(`[skyline-thumbnails] --sync failed: ${err && err.message ? err.message : err}`);
        }
      }
    }
  }

  const summary = {
    runId,
    mode: options.apply ? 'apply' : 'dry-run',
    flagEnabled,
    reportDir,
    counts: plan.counts,
    mediaAvailable: media.available,
    usedIndex: usedIndexReport
  };

  if (options.json) {
    log(JSON.stringify(summary));
  } else {
    log(`[skyline-thumbnails] mode=${summary.mode} runId=${runId}`);
    log(`[skyline-thumbnails] scanned=${plan.counts.totalEntities} eligible=${plan.counts.eligibleCount} targeted=${plan.counts.targetCount} uniqueMixKeys=${plan.counts.uniqueMixKeyCount} duplicateRecords=${plan.counts.duplicateRecordCount}`);
    log(`[skyline-thumbnails] used-index seeded: candidateIds=${usedIndexReport.candidateIds} dHashes=${usedIndexReport.dHashes} source=${usedIndexReport.source}`);
    log(`[skyline-thumbnails] report written to: ${reportDir}`);
    if (!media.available) {
      log(`[skyline-thumbnails] media pipeline unavailable: ${media.reason}`);
    }
  }

  const exitCode = anyMediaFailure ? 2 : 0;
  return { exitCode, summary, reportDir, report: reportObject };
}

/* -------------------------------------------------------------- bootstrap */

function isMainModule() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCli(process.argv.slice(2), {})
    .then((result) => {
      process.exitCode = result && typeof result.exitCode === 'number' ? result.exitCode : 1;
    })
    .catch((err) => {
      console.error('[skyline-thumbnails] fatal:', (err && err.stack) || err);
      process.exitCode = 1;
    });
}
