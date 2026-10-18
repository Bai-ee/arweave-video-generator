/**
 * lib/skyline/records.js — pure record builders (contract §3.8).
 *
 * Pure, dependency-free (imports only lib/skyline/classify.js, itself
 * dependency-free). Every exported function returns NEW objects and never
 * mutates its inputs. This is a third, defensive layer of the
 * "never overwrite a protected record" rule on top of the plan-layer
 * exclusion and the Firestore-transaction re-check in
 * lib/SkylineAssignmentStore.js — applyMixAssignment / applyArtistAssignment
 * independently refuse a protected target even if a caller forgot to check.
 */

import { classifyMixImage, classifyArtistImage, isProtected } from './classify.js';

/**
 * Normalizes a SkylineThumbnailService `generatedMeta` result into the
 * meta object persisted on the record (mixImageMeta / artistImageMeta).
 * `previous` is accepted for forward compatibility (a future regeneration
 * policy may want to inspect the prior meta) but is not currently required
 * to compute the output — the "previous*" restore fields are tracked by
 * applyMixAssignment/applyArtistAssignment instead, since they operate on
 * the full record and can see whether a previous value was already stored.
 * @param {{ generatedMeta: object, previous?: object|null }} args
 */
export function buildImageMeta({ generatedMeta, previous } = {}) {
  if (!generatedMeta || typeof generatedMeta !== 'object') {
    throw new Error('buildImageMeta requires a generatedMeta object');
  }
  void previous; // reserved — see doc comment above
  return {
    origin: generatedMeta.origin || 'generated-skyline',
    assignmentVersion: generatedMeta.assignmentVersion,
    // Which visual grade this asset was rendered with. Persisted because the
    // asset path and the idempotency key both depend on it: without it a
    // regrade cannot tell itself apart from the assignment it replaces.
    treatmentVersion: Number(generatedMeta.treatmentVersion) || 1,
    sourceVideoId: generatedMeta.sourceVideoId || '',
    sourceTimeSec: typeof generatedMeta.sourceTimeSec === 'number' ? generatedMeta.sourceTimeSec : null,
    candidateId: generatedMeta.candidateId || '',
    dHash: generatedMeta.dHash || '',
    generatedAt: generatedMeta.generatedAt || null,
    contentHash: generatedMeta.contentHash || '',
    storagePath: generatedMeta.storagePath || '',
    width: typeof generatedMeta.width === 'number' ? generatedMeta.width : null,
    height: typeof generatedMeta.height === 'number' ? generatedMeta.height : null,
    bytes: typeof generatedMeta.bytes === 'number' ? generatedMeta.bytes : null,
    locked: generatedMeta.locked === true,
    serviceVersion: generatedMeta.serviceVersion || 1
  };
}

/**
 * `allowUploaded` is the explicit `--include-uploaded` opt-in reaching the write layer. Without
 * it threaded this far, the plan layer would mark a plain `uploaded` mix targetable, the batch
 * would spend real ffmpeg time and a real Storage upload on it, and then this guard would
 * silently refuse to persist the result. It never loosens `locked: true` — a locked record is
 * refused no matter what (see classify.isProtected).
 *
 * @param {{ artist: object, mixIndex: number, imageUrl: string, meta: object, allowUploaded?: boolean }} args
 * @returns {{ artist: object, changed: boolean, skipped?: string }}
 */
export function applyMixAssignment({ artist, mixIndex, imageUrl, meta, allowUploaded = false }) {
  if (!artist || !Array.isArray(artist.mixes)) {
    throw new Error('applyMixAssignment requires an artist with a mixes array');
  }
  if (!Number.isInteger(mixIndex) || mixIndex < 0 || mixIndex >= artist.mixes.length) {
    throw new Error('applyMixAssignment requires a valid mixIndex');
  }
  if (!imageUrl) {
    throw new Error('applyMixAssignment requires imageUrl');
  }
  if (!meta || typeof meta !== 'object') {
    throw new Error('applyMixAssignment requires meta');
  }

  const mix = artist.mixes[mixIndex];
  const classification = classifyMixImage({ mix, artist });
  if (isProtected(classification.state, mix.mixImageMeta, { allowUploaded })) {
    return { artist, changed: false, skipped: 'protected' };
  }

  const hasPrevious = Object.prototype.hasOwnProperty.call(mix, 'previousMixImageFilename');
  const nextMix = { ...mix, mixImageFilename: imageUrl, mixImageMeta: { ...meta } };
  if (!hasPrevious) {
    // First generated overwrite -- capture whatever was live before so it
    // can be restored later. Never clobber an already-stored previous
    // value on a subsequent regenerate.
    nextMix.previousMixImageFilename = mix.mixImageFilename || '';
  }

  const nextMixes = artist.mixes.slice();
  nextMixes[mixIndex] = nextMix;
  return { artist: { ...artist, mixes: nextMixes }, changed: true };
}

/**
 * @param {{ artist: object, imageUrl: string, meta: object }} args
 * @returns {{ artist: object, changed: boolean, skipped?: string }}
 */
export function applyArtistAssignment({ artist, imageUrl, meta, allowUploaded = false }) {
  if (!artist) {
    throw new Error('applyArtistAssignment requires an artist');
  }
  if (!imageUrl) {
    throw new Error('applyArtistAssignment requires imageUrl');
  }
  if (!meta || typeof meta !== 'object') {
    throw new Error('applyArtistAssignment requires meta');
  }

  const classification = classifyArtistImage({ artist });
  if (isProtected(classification.state, artist.artistImageMeta, { allowUploaded })) {
    return { artist, changed: false, skipped: 'protected' };
  }

  const hasPrevious = Object.prototype.hasOwnProperty.call(artist, 'previousArtistImageFilename');
  const nextArtist = { ...artist, artistImageFilename: imageUrl, artistImageMeta: { ...meta } };
  if (!hasPrevious) {
    nextArtist.previousArtistImageFilename = artist.artistImageFilename || '';
  }
  return { artist: nextArtist, changed: true };
}

/**
 * previousMixImageFilename -> mixImageFilename (live). Clears the
 * generated-image meta and the previous* marker so a re-generate after a
 * restore starts a clean "first overwrite" cycle.
 * @param {{ artist: object, mixIndex: number }} args
 * @returns {{ artist: object, changed: boolean, skipped?: string }}
 */
export function restoreMixAssignment({ artist, mixIndex }) {
  if (!artist || !Array.isArray(artist.mixes)) {
    throw new Error('restoreMixAssignment requires an artist with a mixes array');
  }
  if (!Number.isInteger(mixIndex) || mixIndex < 0 || mixIndex >= artist.mixes.length) {
    throw new Error('restoreMixAssignment requires a valid mixIndex');
  }

  const mix = artist.mixes[mixIndex];
  if (!Object.prototype.hasOwnProperty.call(mix, 'previousMixImageFilename')) {
    return { artist, changed: false, skipped: 'no-previous-assignment' };
  }
  const classification = classifyMixImage({ mix, artist });
  if (isProtected(classification.state, mix.mixImageMeta)) {
    return { artist, changed: false, skipped: 'protected' };
  }

  const restoredUrl = mix.previousMixImageFilename || '';
  const nextMix = { ...mix, mixImageFilename: restoredUrl };
  delete nextMix.mixImageMeta;
  delete nextMix.previousMixImageFilename;

  const nextMixes = artist.mixes.slice();
  nextMixes[mixIndex] = nextMix;
  return { artist: { ...artist, mixes: nextMixes }, changed: true };
}

/**
 * @param {{ artist: object }} args
 * @returns {{ artist: object, changed: boolean, skipped?: string }}
 */
export function restoreArtistAssignment({ artist }) {
  if (!artist) {
    throw new Error('restoreArtistAssignment requires an artist');
  }
  if (!Object.prototype.hasOwnProperty.call(artist, 'previousArtistImageFilename')) {
    return { artist, changed: false, skipped: 'no-previous-assignment' };
  }
  const classification = classifyArtistImage({ artist });
  if (isProtected(classification.state, artist.artistImageMeta)) {
    return { artist, changed: false, skipped: 'protected' };
  }

  const restoredUrl = artist.previousArtistImageFilename || '';
  const nextArtist = { ...artist, artistImageFilename: restoredUrl };
  delete nextArtist.artistImageMeta;
  delete nextArtist.previousArtistImageFilename;
  return { artist: nextArtist, changed: true };
}
