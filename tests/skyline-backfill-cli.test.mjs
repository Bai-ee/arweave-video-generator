import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';

import { runCli, parseArgs, resolveApplyGate } from '../scripts/skyline-thumbnails.mjs';
import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';
import { createFakeFirestore, createWriteThrowingFirestore, fakeKeysModule } from './skyline-assignment-store.test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..');
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'skyline-thumbnails.mjs');

function buildFixtureArtists() {
  return [
    {
      artistFilename: 'acidman',
      artistName: 'Acidman',
      artistImageFilename: 'https://example.com/img/artists/acidman.jpg',
      mixes: [
        { mixTitle: 'Missing Art Mix', mixArweaveURL: 'https://arweave.net/txMISSING', mixImageFilename: '' },
        {
          mixTitle: 'Real Cover Mix',
          mixArweaveURL: 'https://arweave.net/txUPLOADED',
          mixImageFilename: 'https://example.com/img/covers/real-cover.jpg'
        }
      ]
    },
    {
      artistFilename: 'andrewemil',
      artistName: 'Andrew Emil',
      artistImageFilename: '',
      mixes: [{ mixTitle: 'Solo Mix', mixArweaveURL: 'https://arweave.net/txSOLO', mixImageFilename: '' }]
    }
  ];
}

function makeStore(db) {
  return createAssignmentStore({ db, keysModule: fakeKeysModule, now: () => new Date('2026-09-08T12:00:00.000Z') });
}

function makeFakeService({ shouldFail = false } = {}) {
  let counter = 0;
  return {
    async generate({ entityType, stableKey, assignmentVersion, dryRun, previewDir }) {
      counter += 1;
      if (shouldFail) {
        return { ok: false, error: { code: 'no-eligible-candidate', message: 'no candidates available in test fixture' } };
      }
      const candidateId = `skyline-000${counter}@10.00`;
      const meta = {
        origin: 'generated-skyline',
        assignmentVersion,
        sourceVideoId: `skyline-000${counter}`,
        sourceTimeSec: 10 + counter,
        candidateId,
        dHash: String(counter).padStart(16, '0'),
        generatedAt: '2026-09-08T12:00:00.000Z',
        contentHash: `content-hash-${counter}`,
        storagePath: `website/generated-thumbnails/v1/${entityType}/${stableKey}-v${assignmentVersion}.webp`,
        width: 960,
        height: 960,
        bytes: 12345,
        locked: false,
        serviceVersion: 1
      };
      let localPath = null;
      if (dryRun && previewDir) {
        await fs.ensureDir(previewDir);
        localPath = path.join(previewDir, `${entityType}-${stableKey}-v${assignmentVersion}.webp`);
        await fs.writeFile(localPath, 'fake-webp-bytes');
      }
      return {
        ok: true,
        imageUrl: dryRun ? '' : `https://storage.googleapis.com/bucket/${meta.storagePath}`,
        localPath,
        meta,
        rejected: [],
        probeCount: 1
      };
    }
  };
}

/**
 * A fake media service that records the `used` argument it was called with
 * on each generate() call (a snapshot: candidateIds as a sorted array, plus
 * dHashes) so tests can assert the CLI actually threads the seeded
 * collision-avoidance set through to the media stack, not just into the
 * report.
 */
function makeRecordingFakeService() {
  let counter = 0;
  const usedSnapshots = [];
  return {
    usedSnapshots,
    async generate({ entityType, stableKey, assignmentVersion, used, dryRun, previewDir }) {
      counter += 1;
      usedSnapshots.push({
        candidateIds: Array.from(used.candidateIds).sort(),
        dHashes: used.dHashes.slice()
      });
      const candidateId = `skyline-rec${counter}@10.00`;
      const meta = {
        origin: 'generated-skyline',
        assignmentVersion,
        sourceVideoId: `skyline-rec${counter}`,
        sourceTimeSec: 10 + counter,
        candidateId,
        dHash: String(counter).padStart(16, '0'),
        generatedAt: '2026-09-08T12:00:00.000Z',
        contentHash: `content-hash-rec-${counter}`,
        storagePath: `website/generated-thumbnails/v1/${entityType}/${stableKey}-v${assignmentVersion}.webp`,
        width: 960,
        height: 960,
        bytes: 12345,
        locked: false,
        serviceVersion: 1
      };
      let localPath = null;
      if (dryRun && previewDir) {
        await fs.ensureDir(previewDir);
        localPath = path.join(previewDir, `${entityType}-${stableKey}-v${assignmentVersion}.webp`);
        await fs.writeFile(localPath, 'fake-webp-bytes');
      }
      return { ok: true, imageUrl: dryRun ? '' : `https://storage.googleapis.com/bucket/${meta.storagePath}`, localPath, meta, rejected: [], probeCount: 1 };
    }
  };
}

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skyline-cli-test-'));
  try {
    return await fn(dir);
  } finally {
    await fs.remove(dir);
  }
}

/* ------------------------------------------------------------------ argv */

describe('parseArgs', () => {
  test('defaults to dry-run / target both with no args', () => {
    const { options, errors } = parseArgs([]);
    assert.deepEqual(errors, []);
    assert.equal(options.dryRun, true);
    assert.equal(options.apply, false);
    assert.equal(options.target, 'both');
  });

  test('--apply flips dryRun off', () => {
    const { options } = parseArgs(['--apply', '--yes-i-approve-apply']);
    assert.equal(options.apply, true);
    assert.equal(options.dryRun, false);
    assert.equal(options.yes, true);
  });

  test('rejects an invalid --target', () => {
    const { errors } = parseArgs(['--target', 'bogus']);
    assert.ok(errors.some((e) => e.includes('--target')));
  });

  test('rejects a negative --limit', () => {
    const { errors } = parseArgs(['--limit', '-1']);
    assert.ok(errors.some((e) => e.includes('--limit')));
  });

  test('rejects a malformed --mix-key', () => {
    const { errors } = parseArgs(['--mix-key', 'not-hex']);
    assert.ok(errors.some((e) => e.includes('--mix-key')));
  });

  test('rejects an unknown argument', () => {
    const { errors } = parseArgs(['--totally-made-up']);
    assert.ok(errors.some((e) => e.includes('Unknown argument')));
  });

  test('parses --include-uploaded / --regenerate / --json / --sync as booleans', () => {
    const { options } = parseArgs(['--include-uploaded', '--regenerate', '--json', '--sync']);
    assert.equal(options.includeUploaded, true);
    assert.equal(options.regenerate, true);
    assert.equal(options.json, true);
    assert.equal(options.sync, true);
  });

  test('parses --ignore-used-index as a boolean, default false', () => {
    assert.equal(parseArgs([]).options.ignoreUsedIndex, false);
    assert.equal(parseArgs(['--ignore-used-index']).options.ignoreUsedIndex, true);
  });
});

describe('resolveApplyGate', () => {
  test('dry-run is always allowed', () => {
    const gate = resolveApplyGate({ options: { apply: false }, env: {} });
    assert.equal(gate.allowed, true);
  });

  test('--apply refused when both the flag and --yes-i-approve-apply are missing', () => {
    const gate = resolveApplyGate({ options: { apply: true, yes: false }, env: {} });
    assert.equal(gate.allowed, false);
    assert.match(gate.message, /SKYLINE_THUMBNAILS_ENABLED/);
    assert.match(gate.message, /--yes-i-approve-apply/);
  });

  test('--apply refused when only the env flag is set', () => {
    const gate = resolveApplyGate({ options: { apply: true, yes: false }, env: { SKYLINE_THUMBNAILS_ENABLED: 'true' } });
    assert.equal(gate.allowed, false);
    assert.match(gate.message, /--yes-i-approve-apply/);
  });

  test('--apply refused when only --yes-i-approve-apply is set', () => {
    const gate = resolveApplyGate({ options: { apply: true, yes: true }, env: {} });
    assert.equal(gate.allowed, false);
    assert.match(gate.message, /SKYLINE_THUMBNAILS_ENABLED/);
  });

  test('--apply allowed only when both are present', () => {
    const gate = resolveApplyGate({ options: { apply: true, yes: true }, env: { SKYLINE_THUMBNAILS_ENABLED: 'true' } });
    assert.equal(gate.allowed, true);
  });

  test('--ignore-used-index combined with --apply still requires --yes-i-approve-apply (Job B)', () => {
    const gate = resolveApplyGate({
      options: { apply: true, yes: false, ignoreUsedIndex: true },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' }
    });
    assert.equal(gate.allowed, false);
    assert.match(gate.message, /--yes-i-approve-apply/);
    assert.match(gate.message, /--ignore-used-index/);
  });

  test('--ignore-used-index combined with --apply is allowed once both gates are satisfied', () => {
    const gate = resolveApplyGate({
      options: { apply: true, yes: true, ignoreUsedIndex: true },
      env: { SKYLINE_THUMBNAILS_ENABLED: 'true' }
    });
    assert.equal(gate.allowed, true);
  });
});

/* --------------------------------------------------- real subprocess gate
 * Proves the ACTUAL CLI file refuses --apply before touching any
 * credentials/Firebase bootstrap -- runs the real script as a child
 * process with a deliberately clean env (no SKYLINE_THUMBNAILS_ENABLED, no
 * FIREBASE_SERVICE_ACCOUNT_KEY) and expects it to exit non-zero quickly.
 * ------------------------------------------------------------------- */

describe('CLI subprocess: --apply refusal (test #3, real process, no credentials)', () => {
  function runSubprocess(args, envOverrides) {
    const env = { PATH: process.env.PATH, ...envOverrides };
    return spawnSync(process.execPath, [CLI_PATH, ...args], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
      timeout: 15000
    });
  }

  test('--apply with neither the flag nor --yes-i-approve-apply exits non-zero', () => {
    const result = runSubprocess(['--apply'], {});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SKYLINE_THUMBNAILS_ENABLED/);
  });

  test('--apply --yes-i-approve-apply WITHOUT the env flag still exits non-zero', () => {
    const result = runSubprocess(['--apply', '--yes-i-approve-apply'], {});
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SKYLINE_THUMBNAILS_ENABLED/);
  });

  test('--apply with the env flag but WITHOUT --yes-i-approve-apply still exits non-zero', () => {
    const result = runSubprocess(['--apply'], { SKYLINE_THUMBNAILS_ENABLED: 'true' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /--yes-i-approve-apply/);
  });
});

/* --------------------------------------------------------- in-process runs */

describe('runCli -- dry run is non-mutating (test #2)', () => {
  test('a full dry run against a write-throwing fake db never throws and writes local report files only', async () => {
    await withTempDir(async (tmpDir) => {
      const artists = buildFixtureArtists();
      const db = createWriteThrowingFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);

      const result = await runCli(['--report-dir', tmpDir, '--json'], {
        store,
        media: { available: false, reason: 'test: media stack intentionally unavailable' },
        now: () => new Date('2026-09-08T12:00:00.000Z'),
        runId: 'test-run-dry',
        log: () => {},
        logError: () => {}
      });

      assert.equal(result.exitCode, 0);
      assert.ok(await fs.pathExists(path.join(tmpDir, 'report.json')));
      assert.ok(await fs.pathExists(path.join(tmpDir, 'report.csv')));
      assert.ok(await fs.pathExists(path.join(tmpDir, 'report.html')));

      const reportJson = await fs.readJson(path.join(tmpDir, 'report.json'));
      assert.equal(reportJson.mode, 'dry-run');
      assert.equal(reportJson.mediaAvailable, false);
      assert.ok(reportJson.counts.totalEntities > 0);
    });
  });
});

describe('runCli -- full apply with an injected media stack', () => {
  test('applies eligible entities, writes an audit doc, and produces a report', async () => {
    await withTempDir(async (tmpDir) => {
      const prevFlag = process.env.SKYLINE_THUMBNAILS_ENABLED;
      process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
      try {
        const artists = buildFixtureArtists();
        const db = createFakeFirestore({ 'system/artists': { artists } });
        const store = makeStore(db);
        const service = makeFakeService();

        const result = await runCli(['--apply', '--yes-i-approve-apply', '--report-dir', tmpDir, '--json'], {
          env: process.env,
          store,
          db,
          media: { available: true, catalog: {}, service },
          now: () => new Date('2026-09-08T12:00:00.000Z'),
          runId: 'test-run-apply',
          log: () => {},
          logError: () => {}
        });

        assert.equal(result.exitCode, 0);

        const dumped = db._dump();
        const missingMix = dumped['system/artists'].artists[0].mixes[0];
        assert.notEqual(missingMix.mixImageFilename, '');
        assert.equal(missingMix.mixImageMeta.origin, 'generated-skyline');
        // protected mix must remain untouched
        const uploadedMix = dumped['system/artists'].artists[0].mixes[1];
        assert.equal(uploadedMix.mixImageFilename, 'https://example.com/img/covers/real-cover.jpg');

        const auditDoc = dumped['skyline_thumbnail_runs/test-run-apply'];
        assert.ok(auditDoc, 'audit doc should have been written');
        assert.equal(auditDoc.mode, 'apply');

        const reportJson = await fs.readJson(path.join(tmpDir, 'report.json'));
        assert.equal(reportJson.mode, 'apply');
        const appliedRows = reportJson.entities.filter((e) => e.applied === true);
        assert.ok(appliedRows.length >= 2, 'both missing mix and missing artist image should have applied');
      } finally {
        if (prevFlag === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
        else process.env.SKYLINE_THUMBNAILS_ENABLED = prevFlag;
      }
    });
  });

  test('refuses to apply when the media pipeline is unavailable -- no Firestore writes, exit code 1', async () => {
    await withTempDir(async (tmpDir) => {
      const prevFlag = process.env.SKYLINE_THUMBNAILS_ENABLED;
      process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
      try {
        const artists = buildFixtureArtists();
        const db = createFakeFirestore({ 'system/artists': { artists } });
        const store = makeStore(db);
        const before = JSON.stringify(db._dump());

        const result = await runCli(['--apply', '--yes-i-approve-apply', '--report-dir', tmpDir], {
          env: process.env,
          store,
          db,
          media: { available: false, reason: 'test: media stack unavailable' },
          runId: 'test-run-apply-no-media',
          log: () => {},
          logError: () => {}
        });

        assert.equal(result.exitCode, 1);
        const after = JSON.stringify(db._dump());
        assert.equal(before, after, 'no Firestore mutation should occur');
        assert.equal(db._dump()['skyline_thumbnail_runs/test-run-apply-no-media'], undefined);
      } finally {
        if (prevFlag === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
        else process.env.SKYLINE_THUMBNAILS_ENABLED = prevFlag;
      }
    });
  });

  test('a per-entity media generation failure is reported and yields exit code 2, without throwing', async () => {
    await withTempDir(async (tmpDir) => {
      const prevFlag = process.env.SKYLINE_THUMBNAILS_ENABLED;
      process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
      try {
        const artists = buildFixtureArtists();
        const db = createFakeFirestore({ 'system/artists': { artists } });
        const store = makeStore(db);
        const service = makeFakeService({ shouldFail: true });

        const result = await runCli(['--apply', '--yes-i-approve-apply', '--report-dir', tmpDir], {
          env: process.env,
          store,
          db,
          media: { available: true, catalog: {}, service },
          runId: 'test-run-apply-fail',
          log: () => {},
          logError: () => {}
        });

        assert.equal(result.exitCode, 2);
        const reportJson = await fs.readJson(path.join(tmpDir, 'report.json'));
        const failedRows = reportJson.entities.filter((e) => e.mediaStatus === 'failed');
        assert.ok(failedRows.length > 0);
      } finally {
        if (prevFlag === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
        else process.env.SKYLINE_THUMBNAILS_ENABLED = prevFlag;
      }
    });
  });
});

describe('runCli -- dry run with an available (injected) media stack renders previews', () => {
  test('produces preview files and per-entity candidate/dHash/probeCount fields in the report', async () => {
    await withTempDir(async (tmpDir) => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const service = makeFakeService();

      const result = await runCli(['--report-dir', tmpDir], {
        store,
        media: { available: true, catalog: {}, service },
        now: () => new Date('2026-09-08T12:00:00.000Z'),
        runId: 'test-run-dry-media',
        log: () => {},
        logError: () => {}
      });

      assert.equal(result.exitCode, 0);
      const reportJson = await fs.readJson(path.join(tmpDir, 'report.json'));
      const proposed = reportJson.entities.filter((e) => e.mediaStatus === 'proposed');
      assert.ok(proposed.length > 0);
      proposed.forEach((row) => {
        assert.ok(row.candidateId);
        assert.ok(row.dHash);
        assert.equal(typeof row.probeCount, 'number');
      });

      const previewFiles = await fs.readdir(path.join(tmpDir, 'previews'));
      assert.ok(previewFiles.length > 0);

      const html = await fs.readFile(path.join(tmpDir, 'report.html'), 'utf8');
      assert.match(html, /Skyline Thumbnail Report/);
      assert.match(html, /test-run-dry-media/);
    });
  });
});

/* ---------------------------------------------------------------------
 * Job B: cross-run uniqueness -- seeding `used` from store.readUsedIndex(),
 * reporting it, and the --ignore-used-index maintenance override.
 * ------------------------------------------------------------------- */

describe('runCli -- Job B: seeds `used` from store.readUsedIndex() before the first entity', () => {
  test('a dry run seeds `used` from a prior generated-skyline record and reports usedIndex counts (zero writes)', async () => {
    await withTempDir(async (tmpDir) => {
      const artists = buildFixtureArtists();
      // Simulate a PRIOR run's assignment already live on the "Missing Art Mix" entity.
      artists[0].mixes[0] = {
        ...artists[0].mixes[0],
        mixImageFilename: 'https://cdn/prior-run.webp',
        mixImageMeta: { origin: 'generated-skyline', candidateId: 'skyline-prior@5.00', dHash: 'aaaaaaaaaaaaaaaa', assignmentVersion: 1 }
      };
      const db = createWriteThrowingFirestore({
        'system/artists': { artists },
        // Also seed the durable index collection directly (a retired/overwritten assignment).
        'skyline_assignment_index/mix:retiredkey0000:v1': {
          candidateId: 'skyline-retired@2.00',
          dHash: 'bbbbbbbbbbbbbbbb',
          entityType: 'mix',
          entityKey: 'retiredkey0000',
          assignmentVersion: 1,
          assignedAt: '2026-01-01T00:00:00.000Z'
        }
      });
      const store = makeStore(db);
      const service = makeRecordingFakeService();

      const result = await runCli(['--target', 'mix', '--report-dir', tmpDir, '--json'], {
        store,
        media: { available: true, catalog: {}, service },
        now: () => new Date('2026-09-08T12:00:00.000Z'),
        runId: 'test-run-used-index-seed',
        log: () => {},
        logError: () => {}
      });

      assert.equal(result.exitCode, 0);
      const reportJson = await fs.readJson(path.join(tmpDir, 'report.json'));
      assert.equal(reportJson.usedIndex.source, 'artists+index');
      // The "Missing Art Mix" record itself is now classified GENERATED (from
      // the simulated prior run above) so it's the ONLY generated-skyline
      // meta live in system/artists; plus the one durable index doc.
      assert.equal(reportJson.usedIndex.candidateIds, 2); // skyline-prior + skyline-retired
      assert.equal(reportJson.usedIndex.dHashes, 2);
      assert.deepEqual(reportJson.usedIndex.countsBySource, { artistsDoc: 1, indexCollection: 1 });

      // The media stack must have actually RECEIVED that seeded set on its
      // very first generate() call, not just had it appear in the report.
      assert.ok(service.usedSnapshots.length > 0);
      const first = service.usedSnapshots[0];
      assert.ok(first.candidateIds.includes('skyline-prior@5.00'));
      assert.ok(first.candidateIds.includes('skyline-retired@2.00'));
      assert.ok(first.dHashes.includes('aaaaaaaaaaaaaaaa'));
      assert.ok(first.dHashes.includes('bbbbbbbbbbbbbbbb'));
    });
  });

  test('--ignore-used-index skips seeding entirely (used starts empty) and reports source "ignored"', async () => {
    await withTempDir(async (tmpDir) => {
      const artists = buildFixtureArtists();
      artists[0].mixes[0] = {
        ...artists[0].mixes[0],
        mixImageFilename: 'https://cdn/prior-run.webp',
        mixImageMeta: { origin: 'generated-skyline', candidateId: 'skyline-prior@5.00', dHash: 'aaaaaaaaaaaaaaaa', assignmentVersion: 1 }
      };
      const db = createWriteThrowingFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const service = makeRecordingFakeService();

      const result = await runCli(['--target', 'mix', '--ignore-used-index', '--report-dir', tmpDir], {
        store,
        media: { available: true, catalog: {}, service },
        now: () => new Date('2026-09-08T12:00:00.000Z'),
        runId: 'test-run-ignore-used-index',
        log: () => {},
        logError: () => {}
      });

      assert.equal(result.exitCode, 0);
      const reportJson = await fs.readJson(path.join(tmpDir, 'report.json'));
      assert.equal(reportJson.usedIndex.candidateIds, 0);
      assert.equal(reportJson.usedIndex.dHashes, 0);
      assert.match(reportJson.usedIndex.source, /ignored/);

      assert.ok(service.usedSnapshots.length > 0);
      service.usedSnapshots.forEach((snap) => {
        assert.deepEqual(snap.candidateIds, []);
        assert.deepEqual(snap.dHashes, []);
      });
    });
  });

  test('--ignore-used-index alone (no --apply) needs no confirmation flag and still performs zero writes', async () => {
    await withTempDir(async (tmpDir) => {
      const db = createWriteThrowingFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
      const store = makeStore(db);
      const result = await runCli(['--ignore-used-index', '--report-dir', tmpDir], {
        store,
        media: { available: false, reason: 'test' },
        now: () => new Date('2026-09-08T12:00:00.000Z'),
        runId: 'test-run-ignore-used-index-dry',
        log: () => {},
        logError: () => {}
      });
      assert.equal(result.exitCode, 0);
    });
  });
});
