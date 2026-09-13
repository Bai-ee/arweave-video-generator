/**
 * lib/skyline/keys.js
 *
 * Pure, dependency-free (node:crypto only) key derivation for the skyline
 * thumbnail pipeline. Every function here must be stable forever: never
 * incorporate array index, wall-clock date, or Math.random().
 *
 * Owner: Workstream A (source catalog + media processing).
 * Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.1.
 */

import { createHash } from 'node:crypto';

/**
 * Extract the Arweave transaction id from a mix's audio URL.
 * Handles both `https://arweave.net/<txid>` and
 * `https://<b32>.arweave.net/<txid>` forms. Returns '' when the input is
 * missing or not a parseable URL, or when the URL has no path segment.
 *
 * @param {string} mixArweaveURL
 * @returns {string}
 */
export function extractArweaveTxId(mixArweaveURL) {
  if (!mixArweaveURL || typeof mixArweaveURL !== 'string') return '';
  const trimmed = mixArweaveURL.trim();
  if (!trimmed) return '';

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return '';
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return '';
  return segments[segments.length - 1];
}

/**
 * Normalize a mix/track title for stable key derivation:
 * lowercase, strip everything that isn't [a-z0-9] or whitespace, collapse
 * whitespace runs to a single space, trim.
 *
 * @param {string} title
 * @returns {string}
 */
export function normalizeTitle(title) {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Derive a stable 16-hex-char key for a mix.
 * = first 16 hex chars of sha256('mix|' + artistFilename + '|' + txid + '|' + normalizeTitle(mixTitle))
 *
 * @param {{ artistFilename: string, mixArweaveURL: string, mixTitle: string }} params
 * @returns {string}
 */
export function deriveMixKey({ artistFilename, mixArweaveURL, mixTitle } = {}) {
  const txid = extractArweaveTxId(mixArweaveURL);
  const normTitle = normalizeTitle(mixTitle);
  const input = `mix|${artistFilename || ''}|${txid}|${normTitle}`;
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Derive a stable 16-hex-char key for an artist.
 * = first 16 hex chars of sha256('artist|' + artistFilename)
 *
 * @param {{ artistFilename: string }} params
 * @returns {string}
 */
export function deriveArtistKey({ artistFilename } = {}) {
  const input = `artist|${artistFilename || ''}`;
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Derive the idempotency key used for job docs / storage output naming.
 *
 * @param {{ entityType: string, stableKey: string, assignmentVersion: number }} params
 * @returns {string}
 */
export function deriveIdempotencyKey({ entityType, stableKey, assignmentVersion } = {}) {
  return `${entityType}:${stableKey}:v${assignmentVersion}`;
}

/**
 * Derive a deterministic unsigned 32-bit seed from an entity's stable key.
 * = first 4 bytes (big-endian, unsigned) of
 *   sha256('v' + assignmentVersion + '|' + entityType + '|' + stableKey)
 *
 * @param {{ entityType: string, stableKey: string, assignmentVersion: number }} params
 * @returns {number} unsigned 32-bit integer
 */
export function seedFromKey({ entityType, stableKey, assignmentVersion } = {}) {
  const input = `v${assignmentVersion}|${entityType}|${stableKey}`;
  const digest = createHash('sha256').update(input, 'utf8').digest();
  return digest.readUInt32BE(0);
}
