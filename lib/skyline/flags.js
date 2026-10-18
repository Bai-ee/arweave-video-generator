/**
 * lib/skyline/flags.js — Skyline thumbnail pipeline feature flag (contract §3.6).
 *
 * Pure, dependency-free (no node_modules imports). The ONLY sanctioned way to
 * read SKYLINE_THUMBNAILS_ENABLED anywhere in the pipeline. Default is false:
 * while false, no generation, no enqueue, no mutation is permitted anywhere
 * downstream of this module.
 */

const TRUE_VALUES = new Set(['1', 'true', 'yes']);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean} true only for '1' | 'true' | 'yes' (case-insensitive)
 */
export function skylineThumbnailsEnabled(env = process.env) {
  const raw = env && env.SKYLINE_THUMBNAILS_ENABLED;
  if (raw === undefined || raw === null) return false;
  return TRUE_VALUES.has(String(raw).trim().toLowerCase());
}

/**
 * Throws an actionable Error when the flag is off. Callers that are about to
 * generate, enqueue, or mutate anything in the skyline pipeline must call
 * this first.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function assertSkylineEnabled(env = process.env) {
  if (!skylineThumbnailsEnabled(env)) {
    throw new Error(
      'Skyline thumbnails are disabled (SKYLINE_THUMBNAILS_ENABLED is not "true"). ' +
        'Set SKYLINE_THUMBNAILS_ENABLED=true to allow generation, enqueue, or mutation.'
    );
  }
}
