/**
 * lib/SkylineAssignmentStore.js — Firestore-backed assignment store
 * (contract §3.9).
 *
 * Owns every Firestore read/write for the skyline thumbnail pipeline's
 * system/artists document. `buildPlan` is pure over the data it reads (no
 * writes). `applyEntityAssignment` is the SOLE mutation entrypoint: every
 * write runs inside a `db.runTransaction`, re-reads the document, re-locates
 * the target entity by artistFilename + derived stable key (never by array
 * index alone), re-checks protection, and patches only that entity before
 * writing the whole artists array back. One entity per transaction, so a
 * mid-batch failure never leaves a half-written record.
 *
 * Depends on lib/skyline/classify.js and lib/skyline/records.js (both mine,
 * pure) plus lib/skyline/keys.js (Workstream A). keys.js is loaded lazily —
 * dynamically imported on first use, or injected via the `keysModule` test
 * hook below — so this module can be imported and unit-tested (with a fake
 * keys module) before Workstream A's file exists, and works unmodified once
 * it lands. `keysModule` is an ADDITIVE, optional 4th option beyond the
 * frozen `{ db, docPath, now }` signature: real callers that omit it are
 * unaffected; it exists purely as a test seam.
 */

import { classifyMixImage, classifyArtistImage, isProtected, IMAGE_STATE } from './skyline/classify.js';
import * as records from './skyline/records.js';
import { assertSkylineEnabled } from './skyline/flags.js';

const DEFAULT_DOC_PATH = 'system/artists';
// Durable, append-only cross-run collision-avoidance index (Job B). One doc
// per assignment, doc id = the idempotency key, so a retried/regenerated
// assignment updates its own entry rather than accumulating duplicates.
// Entries are NEVER deleted by restore() -- a retired frame stays retired,
// so an assignment survives the record later being replaced by uploaded art
// or restored to its pre-pipeline value.
const USED_INDEX_COLLECTION = 'skyline_assignment_index';

function resolveDocRef(db, docPath) {
  const parts = String(docPath).split('/').filter(Boolean);
  if (parts.length < 2 || parts.length % 2 !== 0) {
    throw new Error(`Invalid Firestore docPath (must alternate collection/doc): ${docPath}`);
  }
  let ref = db.collection(parts[0]);
  for (let i = 1; i < parts.length; i += 1) {
    ref = i % 2 === 1 ? ref.doc(parts[i]) : ref.collection(parts[i]);
  }
  return ref;
}

function isTargetable(state, meta, { includeUploaded, regenerate }) {
  if (meta && meta.locked === true) return false;
  if (state === IMAGE_STATE.UPLOADED) return !!includeUploaded;
  if (state === IMAGE_STATE.GENERATED) return !!regenerate;
  return true; // MISSING, INVALID, LEGACY_ARTIST_IMAGE, LEGACY_ARTIST_PORTRAIT
}

/**
 * Compact, serialisable view of an already-persisted image meta. Carried on
 * every plan entity so a caller can re-render an existing assignment (a
 * regrade) without re-reading the artists document, and so the dry-run report
 * can show what an entity currently has.
 * @param {object|null|undefined} meta
 * @returns {null|{origin:string,assignmentVersion:number,treatmentVersion:number,candidateId:string,dHash:string}}
 */
function summariseMeta(meta) {
  if (!meta || typeof meta !== 'object' || meta.origin !== 'generated-skyline') return null;
  return {
    origin: meta.origin,
    assignmentVersion: Number(meta.assignmentVersion) || 1,
    treatmentVersion: Number(meta.treatmentVersion) || 1,
    candidateId: meta.candidateId || '',
    dHash: meta.dHash || ''
  };
}

function deriveNextAssignmentVersion({ state, existingMeta, regenerate, override }) {
  if (typeof override === 'number' && Number.isInteger(override) && override > 0) {
    return override;
  }
  if (state === IMAGE_STATE.GENERATED && existingMeta && typeof existingMeta.assignmentVersion === 'number') {
    return regenerate ? existingMeta.assignmentVersion + 1 : existingMeta.assignmentVersion;
  }
  return 1;
}

function computeSkipReason(entity, { includeUploaded, regenerate, overCapacity, renderUploaded }) {
  if (renderUploaded) {
    // The cover is never written in render-uploaded mode, so its protection is moot.
    if (entity.state === IMAGE_STATE.GENERATED) return 'cover-already-generated';
    if (entity.existingMeta && !regenerate) return 'already-generated';
    if (!entity.matchesFilters) return 'filtered-out';
    return overCapacity ? 'over-limit' : 'filtered-out';
  }
  if (entity.locked) return 'protected-locked';
  if (entity.state === IMAGE_STATE.UPLOADED) {
    return includeUploaded ? 'filtered-out' : 'protected-uploaded';
  }
  if (entity.state === IMAGE_STATE.GENERATED && !regenerate) return 'already-generated';
  if (!entity.matchesFilters) return 'filtered-out';
  if (overCapacity) return 'over-limit';
  return 'filtered-out';
}

/**
 * @param {{ db: object, docPath?: string, now?: () => Date, keysModule?: object }} args
 */
export function createAssignmentStore({ db, docPath = DEFAULT_DOC_PATH, now = () => new Date(), keysModule } = {}) {
  if (!db) {
    throw new Error('createAssignmentStore requires a Firestore db instance');
  }

  let cachedKeys = keysModule || null;
  async function loadKeys() {
    if (cachedKeys) return cachedKeys;
    cachedKeys = await import('./skyline/keys.js');
    return cachedKeys;
  }

  function docRef() {
    return resolveDocRef(db, docPath);
  }

  function usedIndexDocRef(idempotencyKey) {
    return db.collection(USED_INDEX_COLLECTION).doc(idempotencyKey);
  }

  function buildUsedIndexDoc({ entityType, entityKey, meta }) {
    return {
      candidateId: (meta && meta.candidateId) || '',
      dHash: (meta && meta.dHash) || '',
      entityType,
      entityKey,
      assignmentVersion: meta && meta.assignmentVersion,
      assignedAt: now().toISOString()
    };
  }

  /**
   * Cross-run collision-avoidance seed (Job B). Union of:
   *   (a) every LIVE mixImageMeta/artistImageMeta in system/artists whose
   *       origin is 'generated-skyline' (candidateId + dHash), and
   *   (b) every doc in the durable `skyline_assignment_index` collection --
   *       which survives a record later being overwritten by uploaded art
   *       or reverted via restore().
   * Returns the exact `{ candidateIds: Set<string>, dHashes: string[] }`
   * shape callers already pass as `used` to selection/the render service,
   * plus an additive `countsBySource` for reporting (never required by
   * callers that only need `used`).
   */
  async function readUsedIndex() {
    const { artists } = await readAll();
    const candidateIds = new Set();
    const dHashes = [];
    let artistsDocCount = 0;

    function collectMeta(meta) {
      if (!meta || meta.origin !== 'generated-skyline') return;
      if (meta.candidateId) candidateIds.add(meta.candidateId);
      if (meta.dHash) dHashes.push(meta.dHash);
      artistsDocCount += 1;
    }

    artists.forEach((artist) => {
      collectMeta(artist.artistImageMeta);
      (artist.mixes || []).forEach((mix) => {
        collectMeta(mix.mixImageMeta);
        collectMeta(mix.renderImageMeta);
      });
    });

    let indexCollectionCount = 0;
    const snap = await db.collection(USED_INDEX_COLLECTION).get();
    const docs = (snap && Array.isArray(snap.docs)) ? snap.docs : [];
    docs.forEach((doc) => {
      const data = typeof doc.data === 'function' ? doc.data() : doc;
      if (!data) return;
      if (data.candidateId) candidateIds.add(data.candidateId);
      if (data.dHash) dHashes.push(data.dHash);
      indexCollectionCount += 1;
    });

    return {
      candidateIds,
      dHashes,
      countsBySource: { artistsDoc: artistsDocCount, indexCollection: indexCollectionCount }
    };
  }

  async function readAll() {
    const snap = await docRef().get();
    if (!snap || !snap.exists) {
      return { artists: [], raw: null };
    }
    const raw = snap.data() || {};
    const artists = Array.isArray(raw.artists) ? raw.artists : [];
    return { artists, raw };
  }

  async function buildPlan({ target = 'both', filters = {} } = {}) {
    if (!['mix', 'artist', 'both'].includes(target)) {
      throw new Error(`buildPlan: invalid target "${target}" (expected mix|artist|both)`);
    }
    const { artists } = await readAll();
    const keys = await loadKeys();
    const {
      limit = null,
      artist: artistFilter = null,
      mixKey: mixKeyFilter = null,
      includeUploaded = false,
      regenerate = false,
      assignmentVersion: assignmentVersionOverride = null,
      renderUploaded = false
    } = filters || {};
    if (renderUploaded && target !== 'mix') {
      throw new Error('buildPlan: the renderUploaded filter only applies to target "mix"');
    }

    const normalizedMixKeyFilter = mixKeyFilter ? String(mixKeyFilter).toLowerCase() : null;
    const entities = [];

    artists.forEach((artist) => {
      const artistFilename = artist.artistFilename || '';
      const matchesArtistFilter =
        !artistFilter ||
        artistFilename.toLowerCase() === String(artistFilter).toLowerCase() ||
        (artist.artistName || '').toLowerCase() === String(artistFilter).toLowerCase();

      if (target === 'mix' || target === 'both') {
        (artist.mixes || []).forEach((mix, mixIndex) => {
          const entityKey = keys.deriveMixKey({
            artistFilename,
            mixArweaveURL: mix.mixArweaveURL,
            mixTitle: mix.mixTitle
          });
          const classification = classifyMixImage({ mix, artist });
          const protectedEntity = isProtected(classification.state, mix.mixImageMeta);
          const matchesMixKey = !normalizedMixKeyFilter || entityKey === normalizedMixKeyFilter;
          let targetable;
          let nextAssignmentVersion;
          let existingMeta;
          if (renderUploaded) {
            // Render shown in place of the cover: written to mix.renderImageFilename, never
            // to the cover. Only a mix WITHOUT a generated cover needs one (a
            // generated cover already is a render), and the cover's own
            // protection does not apply because the cover is never touched.
            const renderMeta = summariseMeta(mix.renderImageMeta);
            targetable = classification.state !== IMAGE_STATE.GENERATED && (!renderMeta || !!regenerate);
            nextAssignmentVersion = (typeof assignmentVersionOverride === 'number' && assignmentVersionOverride > 0)
              ? assignmentVersionOverride
              : (renderMeta ? renderMeta.assignmentVersion + (regenerate ? 1 : 0) : 1);
            existingMeta = renderMeta;
          } else {
            targetable = isTargetable(classification.state, mix.mixImageMeta, { includeUploaded, regenerate });
            nextAssignmentVersion = deriveNextAssignmentVersion({
              state: classification.state,
              existingMeta: mix.mixImageMeta,
              regenerate,
              override: assignmentVersionOverride
            });
            existingMeta = summariseMeta(mix.mixImageMeta);
          }
          entities.push({
            entityType: 'mix',
            entityKey,
            artistFilename,
            artistName: artist.artistName || '',
            mixIndex,
            mixTitle: mix.mixTitle || '',
            currentUrl: (renderUploaded ? mix.renderImageFilename : mix.mixImageFilename) || '',
            state: classification.state,
            reason: classification.reason,
            eligible: classification.eligible,
            protectedEntity,
            locked: !!classification.locked,
            targetable,
            matchesFilters: matchesArtistFilter && matchesMixKey,
            nextAssignmentVersion,
            existingMeta,
            duplicateRecord: false,
            willAssign: false,
            skipReason: null
          });
        });
      }

      if (target === 'artist' || target === 'both') {
        const entityKey = keys.deriveArtistKey({ artistFilename });
        const classification = classifyArtistImage({ artist });
        const protectedEntity = isProtected(classification.state, artist.artistImageMeta);
        const targetable = isTargetable(classification.state, artist.artistImageMeta, { includeUploaded, regenerate });
        const nextAssignmentVersion = deriveNextAssignmentVersion({
          state: classification.state,
          existingMeta: artist.artistImageMeta,
          regenerate,
          override: assignmentVersionOverride
        });
        entities.push({
          entityType: 'artist',
          entityKey,
          artistFilename,
          artistName: artist.artistName || '',
          mixIndex: null,
          mixTitle: null,
          currentUrl: artist.artistImageFilename || '',
          state: classification.state,
          reason: classification.reason,
          eligible: classification.eligible,
          protectedEntity,
          locked: !!classification.locked,
          targetable,
          matchesFilters: matchesArtistFilter,
          nextAssignmentVersion,
          existingMeta: summariseMeta(artist.artistImageMeta),
          duplicateRecord: false,
          willAssign: false,
          skipReason: null
        });
      }
    });

    // Duplicate-record detection (mix entities only): two mix records that
    // legitimately share the same stable key (same artist + txid + title)
    // are flagged rather than silently presented as distinct unique keys.
    const mixKeyCounts = new Map();
    entities
      .filter((e) => e.entityType === 'mix')
      .forEach((e) => mixKeyCounts.set(e.entityKey, (mixKeyCounts.get(e.entityKey) || 0) + 1));
    entities.forEach((e) => {
      if (e.entityType === 'mix') e.duplicateRecord = mixKeyCounts.get(e.entityKey) > 1;
    });

    let candidateTargets = entities.filter((e) => e.targetable && e.matchesFilters);
    const hasLimit = typeof limit === 'number' && Number.isInteger(limit) && limit >= 0;
    const targets = hasLimit ? candidateTargets.slice(0, limit) : candidateTargets.slice();
    const overCapacity = hasLimit && candidateTargets.length > targets.length;
    const willAssignKeys = new Set(targets.map((e) => `${e.entityType}:${e.entityKey}`));

    entities.forEach((e) => {
      e.willAssign = willAssignKeys.has(`${e.entityType}:${e.entityKey}`);
      if (!e.willAssign) {
        const isOverCapacity = overCapacity && e.targetable && e.matchesFilters && !e.willAssign;
        e.skipReason = computeSkipReason(e, { includeUploaded, regenerate, overCapacity: isOverCapacity, renderUploaded });
      }
    });

    const uniqueMixKeys = new Set(entities.filter((e) => e.entityType === 'mix').map((e) => e.entityKey));
    const byState = {};
    entities.forEach((e) => {
      byState[e.state] = (byState[e.state] || 0) + 1;
    });

    return {
      generatedAt: now().toISOString(),
      target,
      filters: {
        limit: hasLimit ? limit : null,
        artist: artistFilter,
        mixKey: normalizedMixKeyFilter,
        includeUploaded: !!includeUploaded,
        regenerate: !!regenerate,
        assignmentVersion: assignmentVersionOverride,
        renderUploaded: !!renderUploaded
      },
      entities,
      targets,
      counts: {
        byState,
        totalEntities: entities.length,
        eligibleCount: entities.filter((e) => e.targetable).length,
        targetCount: targets.length,
        uniqueMixKeyCount: uniqueMixKeys.size,
        duplicateRecordCount: entities.filter((e) => e.duplicateRecord).length
      }
    };
  }

  async function applyEntityAssignment({ entityKey, entityType, artistFilename, mixIndex, imageUrl, meta, allowUploaded = false }) {
    assertSkylineEnabled();
    if (!entityKey) throw new Error('applyEntityAssignment requires entityKey');
    if (entityType !== 'mix' && entityType !== 'artist') {
      throw new Error('applyEntityAssignment requires entityType of "mix" or "artist"');
    }
    if (!artistFilename) throw new Error('applyEntityAssignment requires artistFilename');
    if (!imageUrl) throw new Error('applyEntityAssignment requires imageUrl');
    if (!meta || typeof meta !== 'object') throw new Error('applyEntityAssignment requires meta');

    const keys = await loadKeys();
    const ref = docRef();
    let result = { applied: false, skipped: true, reason: null };

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap || !snap.exists) {
        result = { applied: false, skipped: true, reason: 'doc-not-found' };
        return;
      }
      const data = snap.data() || {};
      const artists = Array.isArray(data.artists) ? data.artists : [];
      const artistIdx = artists.findIndex((a) => a.artistFilename === artistFilename);
      if (artistIdx === -1) {
        result = { applied: false, skipped: true, reason: 'artist-not-found' };
        return;
      }
      const artist = artists[artistIdx];

      const idempotencyKey = keys.deriveIdempotencyKey({
        entityType,
        stableKey: entityKey,
        assignmentVersion: meta.assignmentVersion,
        treatmentVersion: meta.treatmentVersion
      });
      const fullMeta = { ...meta, idempotencyKey };

      if (entityType === 'artist') {
        const derivedKey = keys.deriveArtistKey({ artistFilename: artist.artistFilename });
        if (derivedKey !== entityKey) {
          result = { applied: false, skipped: true, reason: 'entity-key-mismatch' };
          return;
        }
        const classification = classifyArtistImage({ artist });
        if (isProtected(classification.state, artist.artistImageMeta, { allowUploaded })) {
          result = { applied: false, skipped: true, reason: 'protected' };
          return;
        }
        if (artist.artistImageMeta && artist.artistImageMeta.idempotencyKey === idempotencyKey) {
          result = { applied: false, skipped: true, reason: 'already-applied' };
          return;
        }
        const applyResult = records.applyArtistAssignment({ artist, imageUrl, meta: fullMeta, allowUploaded });
        if (!applyResult.changed) {
          result = { applied: false, skipped: true, reason: applyResult.skipped || 'no-change' };
          return;
        }
        const nextArtists = artists.slice();
        nextArtists[artistIdx] = applyResult.artist;
        txn.set(ref, { ...data, artists: nextArtists }, { merge: false });
        // Same transaction as the record patch (never a separate write) so the
        // durable used-index can never drift from what was actually persisted.
        txn.set(usedIndexDocRef(idempotencyKey), buildUsedIndexDoc({ entityType, entityKey, meta: fullMeta }), { merge: false });
        result = { applied: true, skipped: false, reason: null };
        return;
      }

      // entityType === 'mix'
      const mixes = Array.isArray(artist.mixes) ? artist.mixes : [];
      let targetIndex = Number.isInteger(mixIndex) ? mixIndex : -1;
      let mix = targetIndex >= 0 ? mixes[targetIndex] : undefined;
      let derivedKey =
        mix &&
        keys.deriveMixKey({ artistFilename: artist.artistFilename, mixArweaveURL: mix.mixArweaveURL, mixTitle: mix.mixTitle });

      if (!mix || derivedKey !== entityKey) {
        // The index hint didn't verify -- re-locate by derived key alone,
        // never trust array position on its own.
        targetIndex = mixes.findIndex(
          (m) =>
            keys.deriveMixKey({ artistFilename: artist.artistFilename, mixArweaveURL: m.mixArweaveURL, mixTitle: m.mixTitle }) ===
            entityKey
        );
        if (targetIndex === -1) {
          result = { applied: false, skipped: true, reason: 'mix-not-found' };
          return;
        }
        mix = mixes[targetIndex];
      }

      const classification = classifyMixImage({ mix, artist });
      if (isProtected(classification.state, mix.mixImageMeta, { allowUploaded })) {
        result = { applied: false, skipped: true, reason: 'protected' };
        return;
      }
      if (mix.mixImageMeta && mix.mixImageMeta.idempotencyKey === idempotencyKey) {
        result = { applied: false, skipped: true, reason: 'already-applied' };
        return;
      }
      const applyResult = records.applyMixAssignment({ artist, mixIndex: targetIndex, imageUrl, meta: fullMeta, allowUploaded });
      if (!applyResult.changed) {
        result = { applied: false, skipped: true, reason: applyResult.skipped || 'no-change' };
        return;
      }
      const nextArtists = artists.slice();
      nextArtists[artistIdx] = applyResult.artist;
      txn.set(ref, { ...data, artists: nextArtists }, { merge: false });
      // Same transaction as the record patch (never a separate write) so the
      // durable used-index can never drift from what was actually persisted.
      txn.set(usedIndexDocRef(idempotencyKey), buildUsedIndexDoc({ entityType, entityKey, meta: fullMeta }), { merge: false });
      result = { applied: true, skipped: false, reason: null };
    });

    return result;
  }

  /**
   * Render shown in place of a mix's uploaded cover: sets
   * mix.renderImageFilename + mix.renderImageMeta and NOTHING else —
   * mixImageFilename/mixImageMeta (the original artwork, kept but no longer shown) are
   * never written, so the cover's protection rules do not come into play.
   * Refuses a mix that already has a generated cover (it needs no second
   * render). Same transaction + used-index discipline as applyEntityAssignment.
   */
  async function applyRenderAssignment({ entityKey, artistFilename, mixIndex, imageUrl, meta }) {
    assertSkylineEnabled();
    if (!entityKey) throw new Error('applyRenderAssignment requires entityKey');
    if (!artistFilename) throw new Error('applyRenderAssignment requires artistFilename');
    if (!imageUrl) throw new Error('applyRenderAssignment requires imageUrl');
    if (!meta || typeof meta !== 'object') throw new Error('applyRenderAssignment requires meta');

    const keys = await loadKeys();
    const ref = docRef();
    let result = { applied: false, skipped: true, reason: null };

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap || !snap.exists) {
        result = { applied: false, skipped: true, reason: 'doc-not-found' };
        return;
      }
      const data = snap.data() || {};
      const artists = Array.isArray(data.artists) ? data.artists : [];
      const artistIdx = artists.findIndex((a) => a.artistFilename === artistFilename);
      if (artistIdx === -1) {
        result = { applied: false, skipped: true, reason: 'artist-not-found' };
        return;
      }
      const artist = artists[artistIdx];
      const mixes = Array.isArray(artist.mixes) ? artist.mixes : [];
      const keyOf = (m) =>
        keys.deriveMixKey({ artistFilename: artist.artistFilename, mixArweaveURL: m.mixArweaveURL, mixTitle: m.mixTitle });
      // Never trust array position on its own: verify the hint, else re-locate by key.
      let targetIndex = Number.isInteger(mixIndex) && mixes[mixIndex] && keyOf(mixes[mixIndex]) === entityKey
        ? mixIndex
        : mixes.findIndex((m) => keyOf(m) === entityKey);
      if (targetIndex === -1) {
        result = { applied: false, skipped: true, reason: 'mix-not-found' };
        return;
      }
      const mix = mixes[targetIndex];
      if (classifyMixImage({ mix, artist }).state === IMAGE_STATE.GENERATED) {
        result = { applied: false, skipped: true, reason: 'cover-already-generated' };
        return;
      }

      const idempotencyKey = keys.deriveIdempotencyKey({
        entityType: 'render',
        stableKey: entityKey,
        assignmentVersion: meta.assignmentVersion,
        treatmentVersion: meta.treatmentVersion
      });
      if (mix.renderImageMeta && mix.renderImageMeta.idempotencyKey === idempotencyKey) {
        result = { applied: false, skipped: true, reason: 'already-applied' };
        return;
      }
      const fullMeta = { ...meta, idempotencyKey };
      const nextMixes = mixes.slice();
      nextMixes[targetIndex] = { ...mix, renderImageFilename: imageUrl, renderImageMeta: fullMeta };
      const nextArtists = artists.slice();
      nextArtists[artistIdx] = { ...artist, mixes: nextMixes };
      txn.set(ref, { ...data, artists: nextArtists }, { merge: false });
      txn.set(usedIndexDocRef(idempotencyKey), buildUsedIndexDoc({ entityType: 'render', entityKey, meta: fullMeta }), { merge: false });
      result = { applied: true, skipped: false, reason: null };
    });

    return result;
  }

  async function writeAudit(runRecord) {
    if (!runRecord || !runRecord.runId) {
      throw new Error('writeAudit requires a runRecord with a runId');
    }
    await db.collection('skyline_thumbnail_runs').doc(runRecord.runId).set(runRecord);
    return { written: true, runId: runRecord.runId };
  }

  async function restore({ entityType, artistFilename, mixIndex }) {
    if (entityType !== 'mix' && entityType !== 'artist') {
      throw new Error('restore requires entityType of "mix" or "artist"');
    }
    if (!artistFilename) throw new Error('restore requires artistFilename');

    const ref = docRef();
    let result = { applied: false, skipped: true, reason: null };

    await db.runTransaction(async (txn) => {
      const snap = await txn.get(ref);
      if (!snap || !snap.exists) {
        result = { applied: false, skipped: true, reason: 'doc-not-found' };
        return;
      }
      const data = snap.data() || {};
      const artists = Array.isArray(data.artists) ? data.artists : [];
      const artistIdx = artists.findIndex((a) => a.artistFilename === artistFilename);
      if (artistIdx === -1) {
        result = { applied: false, skipped: true, reason: 'artist-not-found' };
        return;
      }
      const artist = artists[artistIdx];

      if (entityType === 'artist') {
        const r = records.restoreArtistAssignment({ artist });
        if (!r.changed) {
          result = { applied: false, skipped: true, reason: r.skipped || 'no-previous-assignment' };
          return;
        }
        const nextArtists = artists.slice();
        nextArtists[artistIdx] = r.artist;
        txn.set(ref, { ...data, artists: nextArtists }, { merge: false });
        result = { applied: true, skipped: false, reason: null };
        return;
      }

      if (!Number.isInteger(mixIndex) || mixIndex < 0 || mixIndex >= (artist.mixes || []).length) {
        result = { applied: false, skipped: true, reason: 'invalid-mix-index' };
        return;
      }
      const r = records.restoreMixAssignment({ artist, mixIndex });
      if (!r.changed) {
        result = { applied: false, skipped: true, reason: r.skipped || 'no-previous-assignment' };
        return;
      }
      const nextArtists = artists.slice();
      nextArtists[artistIdx] = r.artist;
      txn.set(ref, { ...data, artists: nextArtists }, { merge: false });
      result = { applied: true, skipped: false, reason: null };
    });

    return result;
  }

  return { readAll, readUsedIndex, buildPlan, applyEntityAssignment, applyRenderAssignment, writeAudit, restore };
}
