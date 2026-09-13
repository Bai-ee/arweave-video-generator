// lib/skyline/catalog.js — pure catalog validation / loading / candidate
// inventory tests. Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.2.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATALOG_PATH_DEFAULT,
  validateCatalog,
  loadCatalog,
  enabledSources,
  buildCandidateInventory
} from '../lib/skyline/catalog.js';

function makeCatalog(overrides = {}) {
  return {
    catalogVersion: 1,
    assignmentVersionDefault: 1,
    bucket: 'editvideos-63486.firebasestorage.app',
    output: { storagePrefix: 'website/generated-thumbnails/v1', size: 960, quality: 82, format: 'webp' },
    sampling: { fractions: [0.1, 0.25, 0.4, 0.55, 0.7, 0.85], jitterSeconds: 0.75 },
    quality: { minLuminance: 18, maxLuminance: 238, minStdDev: 12, minLaplacianVar: 8, maxDHashHammingForDuplicate: 6 },
    sources: [
      {
        id: 'skyline-0001',
        storagePath: 'skyline/a.mov',
        publicUrl: 'https://storage.googleapis.com/bucket/skyline/a.mov',
        contentType: 'video/quicktime',
        sizeBytes: 1000,
        durationSec: 12.4,
        width: 1920,
        height: 1080,
        collection: 'skyline',
        enabled: true,
        excludeRanges: [],
        notes: ''
      },
      {
        id: 'skyline-0002',
        storagePath: 'skyline/b.mov',
        publicUrl: 'https://storage.googleapis.com/bucket/skyline/b.mov',
        contentType: 'video/quicktime',
        sizeBytes: 2000,
        durationSec: 20,
        width: 1920,
        height: 1080,
        collection: 'skyline',
        enabled: true,
        excludeRanges: [],
        notes: ''
      }
    ],
    ...overrides
  };
}

describe('CATALOG_PATH_DEFAULT', () => {
  test('is the contract-specified default path', () => {
    assert.equal(CATALOG_PATH_DEFAULT, 'config/skyline-thumbnail-sources.json');
  });
});

describe('validateCatalog', () => {
  test('accepts a well-formed catalog', () => {
    const { ok, errors } = validateCatalog(makeCatalog());
    assert.equal(ok, true);
    assert.deepEqual(errors, []);
  });

  test('never throws on garbage input', () => {
    assert.doesNotThrow(() => validateCatalog(null));
    assert.doesNotThrow(() => validateCatalog(undefined));
    assert.doesNotThrow(() => validateCatalog(42));
    assert.doesNotThrow(() => validateCatalog('not an object'));
    assert.doesNotThrow(() => validateCatalog([]));
  });

  test('rejects empty sources', () => {
    const { ok, errors } = validateCatalog(makeCatalog({ sources: [] }));
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /sources/.test(e)));
  });

  test('rejects a source missing id', () => {
    const c = makeCatalog();
    delete c.sources[0].id;
    const { ok, errors } = validateCatalog(c);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /missing id/.test(e)));
  });

  test('rejects duplicate source ids', () => {
    const c = makeCatalog();
    c.sources[1].id = c.sources[0].id;
    const { ok, errors } = validateCatalog(c);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /duplicate source id/.test(e)));
  });

  test('rejects a source missing storagePath', () => {
    const c = makeCatalog();
    delete c.sources[0].storagePath;
    const { ok, errors } = validateCatalog(c);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /missing storagePath/.test(e)));
  });

  test('rejects non-positive durationSec', () => {
    const c = makeCatalog();
    c.sources[0].durationSec = 0;
    const { ok: ok1 } = validateCatalog(c);
    assert.equal(ok1, false);

    c.sources[0].durationSec = -5;
    const { ok: ok2 } = validateCatalog(c);
    assert.equal(ok2, false);
  });

  test('rejects fractions outside (0,1)', () => {
    const c = makeCatalog();
    c.sampling.fractions = [0, 0.5];
    const { ok, errors } = validateCatalog(c);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /fractions/.test(e)));
  });

  test('rejects an unknown output format', () => {
    const c = makeCatalog();
    c.output.format = 'png';
    const { ok, errors } = validateCatalog(c);
    assert.equal(ok, false);
    assert.ok(errors.some((e) => /format/.test(e)));
  });
});

describe('loadCatalog', () => {
  test('loads and validates via an injected fs.readFileSync', () => {
    const fakeFs = { readFileSync: () => JSON.stringify(makeCatalog()) };
    const catalog = loadCatalog({ fs: fakeFs, catalogPath: 'irrelevant.json' });
    assert.equal(catalog.sources.length, 2);
  });

  test('throws an actionable error when the file cannot be read', () => {
    const fakeFs = {
      readFileSync: () => {
        throw new Error('ENOENT: no such file');
      }
    };
    assert.throws(() => loadCatalog({ fs: fakeFs, catalogPath: 'missing.json' }), /Failed to read skyline catalog/);
  });

  test('throws an actionable error on invalid JSON', () => {
    const fakeFs = { readFileSync: () => '{ not valid json' };
    assert.throws(() => loadCatalog({ fs: fakeFs, catalogPath: 'bad.json' }), /not valid JSON/);
  });

  test('throws an actionable error when validation fails', () => {
    const fakeFs = { readFileSync: () => JSON.stringify(makeCatalog({ sources: [] })) };
    assert.throws(() => loadCatalog({ fs: fakeFs, catalogPath: 'invalid.json' }), /failed validation/);
  });
});

describe('enabledSources', () => {
  test('filters out disabled sources and sorts by id ascending', () => {
    const c = makeCatalog();
    c.sources.push({ ...c.sources[0], id: 'skyline-0000', enabled: false });
    const result = enabledSources(c);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map((s) => s.id), ['skyline-0001', 'skyline-0002']);
  });

  test('treats missing `enabled` as enabled (only enabled === false excludes)', () => {
    const c = makeCatalog();
    delete c.sources[0].enabled;
    const result = enabledSources(c);
    assert.equal(result.length, 2);
  });
});

describe('buildCandidateInventory', () => {
  test('produces candidates sorted by candidateId ascending', () => {
    const candidates = buildCandidateInventory(makeCatalog());
    const ids = candidates.map((c) => c.candidateId);
    const sorted = [...ids].sort();
    assert.deepEqual(ids, sorted);
  });

  test('produces fractions.length candidates per enabled source (no excludeRanges)', () => {
    const catalog = makeCatalog();
    const candidates = buildCandidateInventory(catalog);
    assert.equal(candidates.length, catalog.sources.length * catalog.sampling.fractions.length);
  });

  test('every candidate has the frozen Candidate shape', () => {
    const [candidate] = buildCandidateInventory(makeCatalog());
    assert.equal(typeof candidate.candidateId, 'string');
    assert.equal(typeof candidate.sourceVideoId, 'string');
    assert.equal(typeof candidate.storagePath, 'string');
    assert.equal(typeof candidate.timeSec, 'number');
    assert.equal(candidate.candidateId, `${candidate.sourceVideoId}@${candidate.timeSec.toFixed(2)}`);
  });

  test('timeSec stays within [0.2, durationSec - 0.2]', () => {
    const catalog = makeCatalog();
    const candidates = buildCandidateInventory(catalog);
    for (const c of candidates) {
      const source = catalog.sources.find((s) => s.id === c.sourceVideoId);
      assert.ok(c.timeSec >= 0.2 - 1e-9);
      assert.ok(c.timeSec <= source.durationSec - 0.2 + 1e-9);
    }
  });

  test('is deterministic across repeated calls', () => {
    const catalog = makeCatalog();
    const a = buildCandidateInventory(catalog);
    const b = buildCandidateInventory(catalog);
    assert.deepEqual(a, b);
  });

  test('drops candidates inside excludeRanges (seconds, inclusive)', () => {
    const catalog = makeCatalog();
    // Full-catalog run to find which fraction lands inside [0, durationSec] first,
    // then exclude that exact window and confirm the candidate count drops by 1.
    const before = buildCandidateInventory(catalog).filter((c) => c.sourceVideoId === 'skyline-0001');
    assert.ok(before.length > 0);
    const target = before[0];

    catalog.sources[0].excludeRanges = [[target.timeSec, target.timeSec]];
    const after = buildCandidateInventory(catalog).filter((c) => c.sourceVideoId === 'skyline-0001');
    assert.equal(after.length, before.length - 1);
    assert.ok(!after.some((c) => c.candidateId === target.candidateId));
  });

  test('excludes disabled sources entirely', () => {
    const catalog = makeCatalog();
    catalog.sources[1].enabled = false;
    const candidates = buildCandidateInventory(catalog);
    assert.ok(candidates.every((c) => c.sourceVideoId !== 'skyline-0002'));
  });
});
