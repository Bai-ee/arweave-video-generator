import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';

/* -------------------------------------------------------------------------
 * Fake Firestore double (in-memory), supporting the subset of the Admin SDK
 * surface lib/SkylineAssignmentStore.js actually uses:
 *   db.collection(name).doc(id).get()/.set()
 *   db.runTransaction(async (txn) => { txn.get(ref); txn.set(ref, data, opts) })
 * Exported so tests/skyline-backfill-cli.test.mjs can reuse it without a
 * separate, unowned tests/helpers/ file.
 * ---------------------------------------------------------------------- */

export function createFakeFirestore(seed = {}) {
  const store = new Map();
  Object.entries(seed).forEach(([key, value]) => store.set(key, clone(value)));

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function makeDocRef(key, docId) {
    return {
      __key: key,
      id: docId,
      async get() {
        const exists = store.has(key);
        const data = exists ? clone(store.get(key)) : undefined;
        return { exists, data: () => data, id: docId };
      },
      async set(data, opts) {
        writeKey(key, data, opts);
      }
    };
  }

  function writeKey(key, data, opts) {
    if (opts && opts.merge) {
      const prev = store.has(key) ? store.get(key) : {};
      store.set(key, { ...clone(prev), ...clone(data) });
    } else {
      store.set(key, clone(data));
    }
  }

  function makeCollectionRef(name) {
    const prefix = `${name}/`;
    return {
      doc(docId) {
        return makeDocRef(`${name}/${docId}`, docId);
      },
      // Minimal QuerySnapshot-shaped read: every doc directly under this
      // collection (one path segment past the prefix -- good enough for the
      // flat collections this pipeline uses: skyline_thumbnail_runs,
      // skyline_assignment_index).
      async get() {
        const docs = [];
        store.forEach((value, key) => {
          if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
            docs.push({ id: key.slice(prefix.length), data: () => clone(value), exists: true });
          }
        });
        return { docs, forEach: (fn) => docs.forEach(fn), size: docs.length, empty: docs.length === 0 };
      }
    };
  }

  return {
    collection(name) {
      return makeCollectionRef(name);
    },
    async runTransaction(fn) {
      const txn = {
        async get(ref) {
          return ref.get();
        },
        set(ref, data, opts) {
          writeKey(ref.__key, data, opts);
        }
      };
      return fn(txn);
    },
    _dump() {
      const out = {};
      store.forEach((v, k) => {
        out[k] = clone(v);
      });
      return out;
    }
  };
}

/**
 * A Firestore double that throws on ANY write attempt (doc.set,
 * runTransaction). Used to prove dry-run / plan-only code paths perform
 * zero writes.
 */
export function createWriteThrowingFirestore(seed = {}) {
  const readOnly = createFakeFirestore(seed);
  return {
    collection(name) {
      const col = readOnly.collection(name);
      return {
        get: col.get, // pass through collection-level reads (e.g. readUsedIndex's index scan)
        doc(docId) {
          const ref = col.doc(docId);
          return {
            ...ref,
            async set() {
              throw new Error('WRITE ATTEMPTED: doc.set() called on a read-only fake Firestore');
            }
          };
        }
      };
    },
    async runTransaction() {
      throw new Error('WRITE ATTEMPTED: runTransaction() called on a read-only fake Firestore');
    }
  };
}

/* -------------------------------------------------------------------------
 * Fake keys module -- implements contract §3.1's exact formulas so it is
 * numerically compatible with Workstream A's real lib/skyline/keys.js once
 * it lands (both are the same spec, independently implemented). Injected
 * via createAssignmentStore's additive `keysModule` test seam.
 * ---------------------------------------------------------------------- */

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function extractArweaveTxId(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/').filter(Boolean);
    return segs.length ? segs[segs.length - 1] : '';
  } catch {
    return '';
  }
}

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function deriveMixKey({ artistFilename, mixArweaveURL, mixTitle }) {
  const txid = extractArweaveTxId(mixArweaveURL);
  return sha256Hex(`mix|${artistFilename}|${txid}|${normalizeTitle(mixTitle)}`).slice(0, 16);
}

function deriveArtistKey({ artistFilename }) {
  return sha256Hex(`artist|${artistFilename}`).slice(0, 16);
}

function deriveIdempotencyKey({ entityType, stableKey, assignmentVersion }) {
  return `${entityType}:${stableKey}:v${assignmentVersion}`;
}

function seedFromKey({ entityType, stableKey, assignmentVersion }) {
  const hash = crypto.createHash('sha256').update(`v${assignmentVersion}|${entityType}|${stableKey}`).digest();
  return hash.readUInt32BE(0);
}

export const fakeKeysModule = {
  extractArweaveTxId,
  normalizeTitle,
  deriveMixKey,
  deriveArtistKey,
  deriveIdempotencyKey,
  seedFromKey
};

function withFlagEnabled(fn) {
  const prev = process.env.SKYLINE_THUMBNAILS_ENABLED;
  process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
      else process.env.SKYLINE_THUMBNAILS_ENABLED = prev;
    });
}

function withFlagDisabled(fn) {
  const prev = process.env.SKYLINE_THUMBNAILS_ENABLED;
  delete process.env.SKYLINE_THUMBNAILS_ENABLED;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (prev === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
      else process.env.SKYLINE_THUMBNAILS_ENABLED = prev;
    });
}

/* --------------------------------------------------------------- fixture */

function buildFixtureArtists() {
  return [
    {
      artistFilename: 'acidman',
      artistName: 'Acidman',
      artistImageFilename: 'https://example.com/img/artists/acidman.jpg',
      mixes: [
        { mixTitle: 'Missing Art Mix', mixArweaveURL: 'https://arweave.net/txMISSING', mixImageFilename: '' },
        {
          mixTitle: 'Legacy Artist Image Mix',
          mixArweaveURL: 'https://arweave.net/txLEGACYIMG',
          mixImageFilename: 'https://example.com/img/artists/acidman.jpg'
        },
        {
          mixTitle: 'Legacy Portrait Mix',
          mixArweaveURL: 'https://arweave.net/txPORTRAIT',
          mixImageFilename: 'https://example.com/img/artists/some-other-portrait.jpg'
        },
        {
          mixTitle: 'Real Cover Mix',
          mixArweaveURL: 'https://arweave.net/txUPLOADED',
          mixImageFilename: 'https://example.com/img/covers/real-cover.jpg'
        },
        {
          mixTitle: 'Locked Mix',
          mixArweaveURL: 'https://arweave.net/txLOCKED',
          mixImageFilename: 'https://example.com/img/covers/locked.jpg',
          mixImageMeta: { origin: 'uploaded', locked: true }
        },
        {
          mixTitle: 'For Hakim',
          mixArweaveURL: 'https://arweave.net/txDUP',
          mixImageFilename: ''
        },
        {
          // Same artist + same URL + a title that normalizes identically to
          // 'for hakim' -- a genuine duplicate record per contract §0.
          mixTitle: 'For Hakim!!',
          mixArweaveURL: 'https://arweave.net/txDUP',
          mixImageFilename: ''
        }
      ]
    },
    {
      artistFilename: 'andrewemil',
      artistName: 'Andrew Emil',
      artistImageFilename: '', // MISSING artist image
      mixes: [{ mixTitle: 'Solo Mix', mixArweaveURL: 'https://arweave.net/txSOLO', mixImageFilename: '' }]
    }
  ];
}

function makeStore(db) {
  return createAssignmentStore({ db, keysModule: fakeKeysModule, now: () => new Date('2026-09-08T12:00:00.000Z') });
}

/* ------------------------------------------------------------------ tests */

describe('readAll', () => {
  test('returns artists array and raw doc data', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    const { artists, raw } = await store.readAll();
    assert.equal(artists.length, 2);
    assert.ok(raw && Array.isArray(raw.artists));
  });

  test('returns empty artists array when the doc does not exist', async () => {
    const db = createFakeFirestore({});
    const store = makeStore(db);
    const { artists, raw } = await store.readAll();
    assert.deepEqual(artists, []);
    assert.equal(raw, null);
  });
});

describe('buildPlan -- classification + default target scope', () => {
  test('classifies every entity and defaults to the 4 eligible mix states + missing artist image', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    const plan = await store.buildPlan({ target: 'both', filters: {} });

    // 7 mixes (acidman) + 1 mix (andrewemil) + 2 artists = 10 entities scanned
    assert.equal(plan.counts.totalEntities, 10);

    const missingMix = plan.entities.find((e) => e.entityType === 'mix' && e.mixTitle === 'Missing Art Mix');
    assert.equal(missingMix.state, 'missing');
    assert.equal(missingMix.willAssign, true);

    const legacyImageMix = plan.entities.find((e) => e.mixTitle === 'Legacy Artist Image Mix');
    assert.equal(legacyImageMix.state, 'legacy-artist-image');
    assert.equal(legacyImageMix.willAssign, true);

    const legacyPortraitMix = plan.entities.find((e) => e.mixTitle === 'Legacy Portrait Mix');
    assert.equal(legacyPortraitMix.state, 'legacy-artist-portrait');
    assert.equal(legacyPortraitMix.willAssign, true);

    const uploadedMix = plan.entities.find((e) => e.mixTitle === 'Real Cover Mix');
    assert.equal(uploadedMix.state, 'uploaded');
    assert.equal(uploadedMix.willAssign, false);
    assert.equal(uploadedMix.skipReason, 'protected-uploaded');

    const lockedMix = plan.entities.find((e) => e.mixTitle === 'Locked Mix');
    assert.equal(lockedMix.locked, true);
    assert.equal(lockedMix.willAssign, false);
    assert.equal(lockedMix.skipReason, 'protected-locked');

    const andrewArtist = plan.entities.find((e) => e.entityType === 'artist' && e.artistFilename === 'andrewemil');
    assert.equal(andrewArtist.state, 'missing');
    assert.equal(andrewArtist.willAssign, true);

    const acidmanArtist = plan.entities.find((e) => e.entityType === 'artist' && e.artistFilename === 'acidman');
    assert.equal(acidmanArtist.state, 'uploaded'); // has an artistImageFilename already
    assert.equal(acidmanArtist.willAssign, false);
  });

  test('never writes -- buildPlan on a write-throwing db does not throw', async () => {
    const db = createWriteThrowingFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    await assert.doesNotReject(store.buildPlan({ target: 'both', filters: {} }));
  });

  test('duplicateRecord flags both genuinely-colliding mix records, and the unique-key count subtracts the collapse', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    const plan = await store.buildPlan({ target: 'mix', filters: {} });
    const dups = plan.entities.filter((e) => e.mixTitle && e.mixTitle.startsWith('For Hakim'));
    assert.equal(dups.length, 2);
    assert.equal(dups[0].entityKey, dups[1].entityKey, 'both should derive the same stable key');
    dups.forEach((d) => assert.equal(d.duplicateRecord, true));
    // 8 total mixes, 2 collapse to 1 unique key -> 7 unique
    assert.equal(plan.counts.uniqueMixKeyCount, 7);
    assert.equal(plan.counts.duplicateRecordCount, 2);
  });

  test('--include-uploaded widens targets to non-locked UPLOADED but never to locked', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    const plan = await store.buildPlan({ target: 'mix', filters: { includeUploaded: true } });
    const uploadedMix = plan.entities.find((e) => e.mixTitle === 'Real Cover Mix');
    assert.equal(uploadedMix.willAssign, true);
    const lockedMix = plan.entities.find((e) => e.mixTitle === 'Locked Mix');
    assert.equal(lockedMix.willAssign, false);
    assert.equal(lockedMix.skipReason, 'protected-locked');
  });

  test('--regenerate makes a GENERATED entity targetable and bumps nextAssignmentVersion; assignmentVersion override wins', async () => {
    const artists = buildFixtureArtists();
    artists[0].mixes[0] = {
      ...artists[0].mixes[0],
      mixImageFilename: 'https://cdn/generated-v1.webp',
      mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1 }
    };
    const db = createFakeFirestore({ 'system/artists': { artists } });
    const store = makeStore(db);

    const withoutRegen = await store.buildPlan({ target: 'mix', filters: {} });
    const notRegen = withoutRegen.entities.find((e) => e.mixTitle === 'Missing Art Mix');
    assert.equal(notRegen.state, 'generated');
    assert.equal(notRegen.willAssign, false);
    assert.equal(notRegen.skipReason, 'already-generated');

    const withRegen = await store.buildPlan({ target: 'mix', filters: { regenerate: true } });
    const regen = withRegen.entities.find((e) => e.mixTitle === 'Missing Art Mix');
    assert.equal(regen.willAssign, true);
    assert.equal(regen.nextAssignmentVersion, 2);

    const withOverride = await store.buildPlan({ target: 'mix', filters: { regenerate: true, assignmentVersion: 9 } });
    const overridden = withOverride.entities.find((e) => e.mixTitle === 'Missing Art Mix');
    assert.equal(overridden.nextAssignmentVersion, 9);
  });

  test('--limit caps targets deterministically and marks the rest over-limit', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    const plan = await store.buildPlan({ target: 'mix', filters: { limit: 1 } });
    assert.equal(plan.targets.length, 1);
    const overLimit = plan.entities.filter((e) => e.entityType === 'mix' && e.targetable && e.matchesFilters && !e.willAssign);
    assert.ok(overLimit.length > 0);
    overLimit.forEach((e) => assert.equal(e.skipReason, 'over-limit'));
  });

  test('--artist and --mix-key filters narrow the target set', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);

    const byArtist = await store.buildPlan({ target: 'mix', filters: { artist: 'andrewemil' } });
    assert.ok(byArtist.targets.every((e) => e.artistFilename === 'andrewemil'));
    assert.equal(byArtist.targets.length, 1);

    const missingKey = fakeKeysModule.deriveMixKey({
      artistFilename: 'acidman',
      mixArweaveURL: 'https://arweave.net/txMISSING',
      mixTitle: 'Missing Art Mix'
    });
    const byMixKey = await store.buildPlan({ target: 'mix', filters: { mixKey: missingKey } });
    assert.equal(byMixKey.targets.length, 1);
    assert.equal(byMixKey.targets[0].entityKey, missingKey);
  });
});

describe('applyEntityAssignment -- flag gating (defense in depth on top of the CLI gate)', () => {
  test('refuses to write when SKYLINE_THUMBNAILS_ENABLED is off', async () => {
    await withFlagDisabled(async () => {
      const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
      const store = makeStore(db);
      await assert.rejects(
        store.applyEntityAssignment({
          entityKey: fakeKeysModule.deriveMixKey({
            artistFilename: 'acidman',
            mixArweaveURL: 'https://arweave.net/txMISSING',
            mixTitle: 'Missing Art Mix'
          }),
          entityType: 'mix',
          artistFilename: 'acidman',
          mixIndex: 0,
          imageUrl: 'https://cdn/x.webp',
          meta: { assignmentVersion: 1, origin: 'generated-skyline' }
        }),
        /SKYLINE_THUMBNAILS_ENABLED/
      );
      assert.deepEqual(db._dump()['system/artists'].artists[0].mixes[0].mixImageFilename, '');
    });
  });
});

describe('applyEntityAssignment -- protection re-check inside the transaction', () => {
  test('a protected (UPLOADED) entity is never mutated, even if a caller bypasses buildPlan and calls apply directly', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txUPLOADED',
        mixTitle: 'Real Cover Mix'
      });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 3,
        imageUrl: 'https://cdn/should-not-apply.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline' }
      });
      assert.equal(result.applied, false);
      assert.equal(result.reason, 'protected');
      const dumped = db._dump()['system/artists'].artists[0].mixes[3];
      assert.equal(dumped.mixImageFilename, 'https://example.com/img/covers/real-cover.jpg');
    });
  });

  test('a locked entity is never mutated inside the transaction', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txLOCKED',
        mixTitle: 'Locked Mix'
      });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 4,
        imageUrl: 'https://cdn/nope.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline' }
      });
      assert.equal(result.applied, false);
      assert.equal(result.reason, 'protected');
    });
  });
});

describe('applyEntityAssignment -- successful apply + re-location by key, not index alone', () => {
  test('applies successfully and re-locates the entity even when the given mixIndex hint is wrong', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txMISSING',
        mixTitle: 'Missing Art Mix'
      });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 99, // deliberately wrong -- must still find it via entityKey
        imageUrl: 'https://cdn/generated.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', contentHash: 'abc' }
      });
      assert.equal(result.applied, true);
      const dumped = db._dump()['system/artists'].artists[0].mixes[0];
      assert.equal(dumped.mixImageFilename, 'https://cdn/generated.webp');
      assert.equal(dumped.mixImageMeta.origin, 'generated-skyline');
      assert.equal(dumped.previousMixImageFilename, '');
    });
  });

  test('artist assignment applies and is re-derivable by artist key', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveArtistKey({ artistFilename: 'andrewemil' });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'artist',
        artistFilename: 'andrewemil',
        imageUrl: 'https://cdn/artist.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline' }
      });
      assert.equal(result.applied, true);
      const dumped = db._dump()['system/artists'].artists[1];
      assert.equal(dumped.artistImageFilename, 'https://cdn/artist.webp');
    });
  });
});

describe('applyEntityAssignment -- idempotency (test #5)', () => {
  test('re-running with the same entityKey + assignmentVersion is a no-op the second time', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txMISSING',
        mixTitle: 'Missing Art Mix'
      });
      const payload = {
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 0,
        imageUrl: 'https://cdn/generated.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', contentHash: 'abc' }
      };

      const first = await store.applyEntityAssignment(payload);
      assert.equal(first.applied, true);
      const afterFirst = JSON.stringify(db._dump());

      const second = await store.applyEntityAssignment(payload);
      assert.equal(second.applied, false);
      assert.equal(second.reason, 'already-applied');
      const afterSecond = JSON.stringify(db._dump());

      assert.equal(afterFirst, afterSecond, 'no second write should have occurred');
    });
  });
});

describe('applyEntityAssignment -- regenerate preserves the ORIGINAL previous value (test #6)', () => {
  test('applying v1 then v2 (regenerate) bumps assignmentVersion and keeps the pre-v1 previous* value', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txMISSING',
        mixTitle: 'Missing Art Mix'
      });

      const v1 = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 0,
        imageUrl: 'https://cdn/v1.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', contentHash: 'v1hash' }
      });
      assert.equal(v1.applied, true);

      const v2 = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 0,
        imageUrl: 'https://cdn/v2.webp',
        meta: { assignmentVersion: 2, origin: 'generated-skyline', contentHash: 'v2hash' }
      });
      assert.equal(v2.applied, true);

      const dumped = db._dump()['system/artists'].artists[0].mixes[0];
      assert.equal(dumped.mixImageFilename, 'https://cdn/v2.webp');
      assert.equal(dumped.mixImageMeta.assignmentVersion, 2);
      // pre-v1 live value was '' (MISSING) -- must still be '' after v2, not v1's URL
      assert.equal(dumped.previousMixImageFilename, '');
    });
  });
});

describe('restore -- works even when the flag is OFF (rollback must survive disabling the pipeline)', () => {
  test('restoreMixAssignment via store.restore reverts to previous* without requiring the flag', async () => {
    await withFlagDisabled(async () => {
      const artists = buildFixtureArtists();
      artists[0].mixes[0] = {
        ...artists[0].mixes[0],
        mixImageFilename: 'https://cdn/generated.webp',
        mixImageMeta: { origin: 'generated-skyline', assignmentVersion: 1 },
        previousMixImageFilename: ''
      };
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const result = await store.restore({ entityType: 'mix', artistFilename: 'acidman', mixIndex: 0 });
      assert.equal(result.applied, true);
      const dumped = db._dump()['system/artists'].artists[0].mixes[0];
      assert.equal(dumped.mixImageFilename, '');
      assert.equal(dumped.mixImageMeta, undefined);
    });
  });

  test('no-op with a clear reason when there is nothing to restore', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    const result = await store.restore({ entityType: 'mix', artistFilename: 'acidman', mixIndex: 0 });
    assert.equal(result.applied, false);
    assert.equal(result.reason, 'no-previous-assignment');
  });
});

describe('applyEntityAssignment -- durable used-index write (Job B)', () => {
  test('writes a skyline_assignment_index doc in the SAME transaction as the record patch, keyed by idempotencyKey', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txMISSING',
        mixTitle: 'Missing Art Mix'
      });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 0,
        imageUrl: 'https://cdn/generated.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', candidateId: 'skyline-a@1.00', dHash: 'aabbccddeeff0011', contentHash: 'abc' }
      });
      assert.equal(result.applied, true);

      const idempotencyKey = fakeKeysModule.deriveIdempotencyKey({ entityType: 'mix', stableKey: entityKey, assignmentVersion: 1 });
      const indexDoc = db._dump()[`skyline_assignment_index/${idempotencyKey}`];
      assert.ok(indexDoc, 'index doc should have been written');
      assert.equal(indexDoc.candidateId, 'skyline-a@1.00');
      assert.equal(indexDoc.dHash, 'aabbccddeeff0011');
      assert.equal(indexDoc.entityType, 'mix');
      assert.equal(indexDoc.entityKey, entityKey);
      assert.equal(indexDoc.assignmentVersion, 1);
    });
  });

  test('a protected/skipped assignment never writes an index doc', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txUPLOADED',
        mixTitle: 'Real Cover Mix'
      });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 3,
        imageUrl: 'https://cdn/should-not-apply.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', candidateId: 'skyline-x@1.00', dHash: 'ff00ff00ff00ff00' }
      });
      assert.equal(result.applied, false);
      const idempotencyKey = fakeKeysModule.deriveIdempotencyKey({ entityType: 'mix', stableKey: entityKey, assignmentVersion: 1 });
      assert.equal(db._dump()[`skyline_assignment_index/${idempotencyKey}`], undefined);
    });
  });

  test('an artist assignment also writes its index doc in the same transaction', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveArtistKey({ artistFilename: 'andrewemil' });
      const result = await store.applyEntityAssignment({
        entityKey,
        entityType: 'artist',
        artistFilename: 'andrewemil',
        imageUrl: 'https://cdn/artist.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', candidateId: 'skyline-b@2.00', dHash: '1122334455667788' }
      });
      assert.equal(result.applied, true);
      const idempotencyKey = fakeKeysModule.deriveIdempotencyKey({ entityType: 'artist', stableKey: entityKey, assignmentVersion: 1 });
      const indexDoc = db._dump()[`skyline_assignment_index/${idempotencyKey}`];
      assert.ok(indexDoc);
      assert.equal(indexDoc.entityType, 'artist');
      assert.equal(indexDoc.candidateId, 'skyline-b@2.00');
    });
  });
});

describe('readUsedIndex (Job B: cross-run collision-avoidance seed)', () => {
  test('collects candidateId + dHash from LIVE generated-skyline meta in system/artists', async () => {
    const artists = buildFixtureArtists();
    artists[0].mixes[0] = {
      ...artists[0].mixes[0],
      mixImageFilename: 'https://cdn/generated-v1.webp',
      mixImageMeta: { origin: 'generated-skyline', candidateId: 'skyline-live@1.00', dHash: '0000111122223333', assignmentVersion: 1 }
    };
    const db = createFakeFirestore({ 'system/artists': { artists } });
    const store = makeStore(db);
    const used = await store.readUsedIndex();
    assert.ok(used.candidateIds.has('skyline-live@1.00'));
    assert.ok(used.dHashes.includes('0000111122223333'));
    assert.equal(used.countsBySource.artistsDoc, 1);
  });

  test('ignores non-generated-skyline meta (uploaded/locked records never seed the index)', async () => {
    const artists = buildFixtureArtists(); // includes a Locked Mix with origin:'uploaded'
    const db = createFakeFirestore({ 'system/artists': { artists } });
    const store = makeStore(db);
    const used = await store.readUsedIndex();
    assert.equal(used.candidateIds.size, 0);
    assert.equal(used.dHashes.length, 0);
  });

  test('also reads every doc from the durable skyline_assignment_index collection, unioned with the artists-doc scan', async () => {
    const artists = buildFixtureArtists();
    const db = createFakeFirestore({
      'system/artists': { artists },
      'skyline_assignment_index/mix:oldkey123456:v1': {
        candidateId: 'skyline-retired@3.00',
        dHash: 'deaddeaddeaddead',
        entityType: 'mix',
        entityKey: 'oldkey123456',
        assignmentVersion: 1,
        assignedAt: '2026-01-01T00:00:00.000Z'
      }
    });
    const store = makeStore(db);
    const used = await store.readUsedIndex();
    assert.ok(used.candidateIds.has('skyline-retired@3.00'));
    assert.ok(used.dHashes.includes('deaddeaddeaddead'));
    assert.equal(used.countsBySource.indexCollection, 1);
  });

  test('a durable index entry survives even after the live record is restored (retired frame stays retired)', async () => {
    await withFlagEnabled(async () => {
      const artists = buildFixtureArtists();
      const db = createFakeFirestore({ 'system/artists': { artists } });
      const store = makeStore(db);
      const entityKey = fakeKeysModule.deriveMixKey({
        artistFilename: 'acidman',
        mixArweaveURL: 'https://arweave.net/txMISSING',
        mixTitle: 'Missing Art Mix'
      });

      await store.applyEntityAssignment({
        entityKey,
        entityType: 'mix',
        artistFilename: 'acidman',
        mixIndex: 0,
        imageUrl: 'https://cdn/generated.webp',
        meta: { assignmentVersion: 1, origin: 'generated-skyline', candidateId: 'skyline-survivor@1.00', dHash: 'cafebabecafebabe' }
      });

      // Restore reverts the LIVE record back to its pre-pipeline value...
      await store.restore({ entityType: 'mix', artistFilename: 'acidman', mixIndex: 0 });
      const liveAfterRestore = db._dump()['system/artists'].artists[0].mixes[0];
      assert.equal(liveAfterRestore.mixImageMeta, undefined);

      // ...but the durable index entry must still be there, and readUsedIndex
      // must still surface it (via the index collection, since the live meta
      // is gone) so a later run does not re-pick the same candidate/dHash.
      const used = await store.readUsedIndex();
      assert.ok(used.candidateIds.has('skyline-survivor@1.00'), 'restored assignment must still be avoided in future runs');
      assert.ok(used.dHashes.includes('cafebabecafebabe'));
    });
  });
});

describe('writeAudit', () => {
  test('writes a run record to skyline_thumbnail_runs/<runId>', async () => {
    const db = createFakeFirestore({ 'system/artists': { artists: buildFixtureArtists() } });
    const store = makeStore(db);
    await store.writeAudit({ runId: 'run-123', startedAt: 'a', finishedAt: 'b', mode: 'apply', flagEnabled: true, counts: {}, entries: [] });
    const dumped = db._dump()['skyline_thumbnail_runs/run-123'];
    assert.equal(dumped.runId, 'run-123');
  });
});
