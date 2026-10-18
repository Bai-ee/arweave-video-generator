/**
 * lib/skyline/catalog.js
 *
 * Pure catalog loading/validation and candidate-inventory derivation for
 * the skyline thumbnail pipeline. No network, no ffmpeg. File reads are
 * injectable (`loadCatalog({ fs })`) so this module stays testable without
 * touching disk.
 *
 * Owner: Workstream A (source catalog + media processing).
 * Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.2.
 */

import { readFileSync as nodeReadFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const CATALOG_PATH_DEFAULT = 'config/skyline-thumbnail-sources.json';

const KNOWN_FORMATS = new Set(['webp']);

/**
 * Validate a parsed catalog object. Never throws.
 *
 * @param {any} obj
 * @returns {{ ok: boolean, errors: string[], catalog: any|null }}
 */
export function validateCatalog(obj) {
  const errors = [];

  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['catalog must be a JSON object'], catalog: null };
  }

  const sources = obj.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push('sources must be a non-empty array');
  } else {
    const seenIds = new Set();
    sources.forEach((s, i) => {
      if (!s || typeof s !== 'object') {
        errors.push(`sources[${i}] must be an object`);
        return;
      }
      if (!s.id || typeof s.id !== 'string') {
        errors.push(`sources[${i}] missing id`);
      } else if (seenIds.has(s.id)) {
        errors.push(`duplicate source id: ${s.id}`);
      } else {
        seenIds.add(s.id);
      }
      if (!s.storagePath || typeof s.storagePath !== 'string') {
        errors.push(`source ${s.id || i} missing storagePath`);
      }
      if (typeof s.durationSec !== 'number' || !(s.durationSec > 0)) {
        errors.push(`source ${s.id || i} has non-positive durationSec`);
      }
    });
  }

  const sampling = obj.sampling || {};
  const fractions = sampling.fractions;
  if (!Array.isArray(fractions) || fractions.length === 0) {
    errors.push('sampling.fractions must be a non-empty array');
  } else {
    fractions.forEach((f) => {
      if (typeof f !== 'number' || !(f > 0 && f < 1)) {
        errors.push(`sampling.fractions value out of (0,1): ${f}`);
      }
    });
  }

  const output = obj.output || {};
  if (!KNOWN_FORMATS.has(output.format)) {
    errors.push(`unknown output.format: ${output.format}`);
  }

  return { ok: errors.length === 0, errors, catalog: errors.length === 0 ? obj : null };
}

/**
 * Load and validate the catalog from disk (or an injected fs-like object
 * exposing `readFileSync`). Throws an actionable Error on any failure —
 * missing file, invalid JSON, or failed validation.
 *
 * @param {{ fs?: { readFileSync: Function }, catalogPath?: string }} opts
 * @returns {any} the validated catalog object
 */
export function loadCatalog({ fs, catalogPath = CATALOG_PATH_DEFAULT } = {}) {
  const readFileSync = fs && typeof fs.readFileSync === 'function' ? fs.readFileSync : nodeReadFileSync;

  let raw;
  try {
    raw = readFileSync(catalogPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read skyline catalog at "${catalogPath}": ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Skyline catalog at "${catalogPath}" is not valid JSON: ${err.message}`);
  }

  const { ok, errors, catalog } = validateCatalog(parsed);
  if (!ok) {
    throw new Error(`Skyline catalog at "${catalogPath}" failed validation:\n- ${errors.join('\n- ')}`);
  }
  return catalog;
}

/**
 * Enabled sources, sorted by id ascending.
 *
 * @param {any} catalog
 * @returns {any[]}
 */
export function enabledSources(catalog) {
  const sources = (catalog && Array.isArray(catalog.sources) ? catalog.sources : []).filter(
    (s) => s && s.enabled !== false
  );
  return sources.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Build the full candidate-frame inventory across all enabled sources,
 * sorted by candidateId ascending.
 *
 * candidateId = `${sourceVideoId}@${timeSec.toFixed(2)}`
 * timeSec = clamp(durationSec * fraction + jitter, 0.2, durationSec - 0.2), rounded to 2dp
 * jitter = ((sha256(sourceVideoId + '|' + fraction) first byte / 255) * 2 - 1) * jitterSeconds
 *
 * excludeRanges entries are `[startSec, endSec]` pairs; a candidate whose
 * timeSec falls inside any exclude window (inclusive) is dropped.
 *
 * @param {any} catalog
 * @returns {Array<{ candidateId: string, sourceVideoId: string, storagePath: string, timeSec: number }>}
 */
export function buildCandidateInventory(catalog) {
  const sources = enabledSources(catalog);
  const fractions = (catalog && catalog.sampling && catalog.sampling.fractions) || [];
  const jitterSeconds = (catalog && catalog.sampling && catalog.sampling.jitterSeconds) || 0;

  const candidates = [];
  for (const source of sources) {
    const duration = source.durationSec;
    const excludeRanges = Array.isArray(source.excludeRanges) ? source.excludeRanges : [];
    const minBound = 0.2;
    const maxBound = Math.max(minBound, duration - 0.2);

    for (const fraction of fractions) {
      const seedString = `${source.id}|${fraction}`;
      const firstByte = createHash('sha256').update(seedString, 'utf8').digest()[0];
      const jitter = ((firstByte / 255) * 2 - 1) * jitterSeconds;

      let timeSec = duration * fraction + jitter;
      timeSec = Math.min(Math.max(timeSec, minBound), maxBound);
      timeSec = Math.round(timeSec * 100) / 100;

      const excluded = excludeRanges.some(([start, end]) => timeSec >= start && timeSec <= end);
      if (excluded) continue;

      candidates.push({
        candidateId: `${source.id}@${timeSec.toFixed(2)}`,
        sourceVideoId: source.id,
        storagePath: source.storagePath,
        timeSec
      });
    }
  }

  return candidates.sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));
}
