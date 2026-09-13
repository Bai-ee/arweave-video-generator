/**
 * lib/skyline/classify.js — image-state classification (contract §3.7).
 *
 * Pure, dependency-free (no node_modules imports). Classifies the CURRENT
 * state of a mix's or artist's image field so the rest of the pipeline can
 * decide whether it is safe to touch. Never classify from
 * website/artists.json (it back-fills empty mix images with the artist
 * image at read time — see WebsiteSync.js:76) — always classify from the
 * raw Firestore system/artists record.
 */

export const IMAGE_STATE = {
  MISSING: 'missing',
  LEGACY_ARTIST_IMAGE: 'legacy-artist-image',
  LEGACY_ARTIST_PORTRAIT: 'legacy-artist-portrait',
  GENERATED: 'generated',
  UPLOADED: 'uploaded',
  INVALID: 'invalid-url'
};

const HTTP_URL_RE = /^https?:\/\//i;

function classifyValue({ value, artistImage, allowLegacyRules }) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    return { state: IMAGE_STATE.MISSING, reason: 'empty' };
  }
  if (!HTTP_URL_RE.test(trimmed)) {
    return { state: IMAGE_STATE.INVALID, reason: 'not-http-url' };
  }
  if (allowLegacyRules) {
    if (artistImage && trimmed === artistImage) {
      return { state: IMAGE_STATE.LEGACY_ARTIST_IMAGE, reason: 'equals-artist-image' };
    }
    if (trimmed.includes('/img/artists/')) {
      return { state: IMAGE_STATE.LEGACY_ARTIST_PORTRAIT, reason: 'artist-portrait-path' };
    }
  }
  return { state: IMAGE_STATE.UPLOADED, reason: 'distinct-uploaded-art' };
}

/**
 * Shared rule engine for both mix and artist images.
 * Rule order (contract §3.7):
 *   1. meta.locked === true -> not eligible (state still derived from meta
 *      origin / value, for accurate reporting).
 *   2. meta.origin === 'generated-skyline' -> GENERATED, eligible only for
 *      explicit regenerate (so eligible: false here).
 *   3-7. value-based rules.
 */
function classifyEntity({ value, meta, artistImage, allowLegacyRules }) {
  const locked = !!(meta && meta.locked === true);

  if (locked) {
    let state;
    if (meta && meta.origin === 'uploaded') {
      state = IMAGE_STATE.UPLOADED;
    } else if (meta && meta.origin === 'generated-skyline') {
      state = IMAGE_STATE.GENERATED;
    } else {
      state = classifyValue({ value, artistImage, allowLegacyRules }).state;
    }
    return { state, reason: 'locked', eligible: false, locked: true };
  }

  if (meta && meta.origin === 'generated-skyline') {
    return { state: IMAGE_STATE.GENERATED, reason: 'already-generated', eligible: false, locked: false };
  }

  const byValue = classifyValue({ value, artistImage, allowLegacyRules });
  const eligible = byValue.state !== IMAGE_STATE.UPLOADED;
  return { state: byValue.state, reason: byValue.reason, eligible, locked: false };
}

/**
 * @param {{ mix: object, artist: object }} args
 * @returns {{ state: string, reason: string, eligible: boolean, locked: boolean }}
 */
export function classifyMixImage({ mix, artist }) {
  const value = mix && mix.mixImageFilename;
  const meta = (mix && mix.mixImageMeta) || null;
  const artistImage = (artist && artist.artistImageFilename) || '';
  return classifyEntity({ value, meta, artistImage, allowLegacyRules: true });
}

/**
 * Artist self-images have no "legacy artist image" / "legacy artist
 * portrait" concept — only MISSING / INVALID are eligible; anything else is
 * UPLOADED and protected.
 * @param {{ artist: object }} args
 * @returns {{ state: string, reason: string, eligible: boolean, locked: boolean }}
 */
export function classifyArtistImage({ artist }) {
  const value = artist && artist.artistImageFilename;
  const meta = (artist && artist.artistImageMeta) || null;
  return classifyEntity({ value, meta, artistImage: '', allowLegacyRules: false });
}

/**
 * Hard block used by the plan layer AND re-checked inside the Firestore
 * transaction. Protected records are never overwritten by any automatic
 * path (backfill, retry, regenerate-all): uploaded art, or anything with
 * meta.locked === true.
 * @param {string} state one of IMAGE_STATE
 * @param {object|null|undefined} meta the record's own mixImageMeta/artistImageMeta
 * @returns {boolean}
 */
export function isProtected(state, meta, { allowUploaded = false } = {}) {
  // `locked: true` is absolute: no CLI option and no automatic batch may overwrite it. Only a
  // deliberate per-record admin unlock (unlockThumbnail) can change that.
  if (meta && meta.locked === true) return true;

  // Plain `uploaded` art is protected for every automatic path (backfill without the opt-in,
  // ingestion, regenerate, retry, the job worker). It is overridable ONLY by the operator
  // explicitly passing --include-uploaded, which the master plan requires the product owner to
  // authorize before an existing cover is visually migrated. Callers that omit the option get
  // the original, strict behavior.
  if (state === IMAGE_STATE.UPLOADED) return !allowUploaded;

  return false;
}
