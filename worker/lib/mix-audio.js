// Which mixes the render worker can play, and how a requested mix title is matched. Pure (no ffmpeg/network), so
// tests can import it without the audio client's side effects.
//
// Mixes not yet on Arweave are hosted in this project's Firebase Storage bucket (website/mixes/<content id>, public,
// range requests supported) and still sit in the `mixArweaveURL` field. Both hosts are playable.

const FIREBASE_MIX_HOSTS = [
  'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/',
  'https://firebasestorage.googleapis.com/v0/b/editvideos-63486.firebasestorage.app/',
];

/**
 * Gateways the render worker pulls mix audio from, in preference order. Since 2026-11-17 arweave.net 302s to a
 * sandbox subdomain that answers 404, so these four (verified to serve 206 audio/mpeg for the same txids) go first.
 */
export const ARWEAVE_MIX_GATEWAYS = Object.freeze([
  'https://arweave.fllstck.dev/',
  'https://frostor.xyz/',
  'https://ardrive.net/',
  'https://turbo-gateway.com/',
]);

const ARWEAVE_TXID_PATH = /^\/([A-Za-z0-9_-]{43})(?:\/|$)/;
const GATEWAY_HOSTS = ARWEAVE_MIX_GATEWAYS.map((gateway) => new URL(gateway).hostname);

function isArweaveNetHost(host) {
  return host === 'arweave.net' || host.endsWith('.arweave.net');
}

/**
 * Every URL worth trying for a mix, best first. An arweave.net (or sandbox-subdomain) or known-gateway URL becomes
 * the gateway list for the same txid (any path/query after the txid is kept), with the original URL last as a final
 * fallback. Any other URL (Firebase storage, etc.) is returned as-is.
 */
export function mixUrlCandidates(url) {
  if (typeof url !== 'string') return [url];
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [url];
  }
  const host = parsed.hostname.toLowerCase();
  if (!isArweaveNetHost(host) && !GATEWAY_HOSTS.includes(host)) return [url];
  const match = ARWEAVE_TXID_PATH.exec(parsed.pathname);
  if (!match) return [url];
  const first = match[1];
  const rest = parsed.pathname.slice(first.length + 1) + parsed.search;
  return [...new Set([...ARWEAVE_MIX_GATEWAYS.map((gateway) => gateway + first + rest), url])];
}

export function isPlayableMixUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false;
  if (url.includes('arweave.net')) return true;
  try {
    if (GATEWAY_HOSTS.includes(new URL(url).hostname.toLowerCase())) return true;
  } catch {
    return false;
  }
  return FIREBASE_MIX_HOSTS.some((prefix) => url.startsWith(prefix));
}

/**
 * The mix to render for a requested title: an exact (case-insensitive) title match first, then the loose
 * contains-match the worker always used. Returns null when nothing matches — the caller fails the job rather than
 * silently rendering a different mix under the requested title.
 */
export function findRequestedMix(mixes, mixTitle) {
  const wanted = String(mixTitle || '').toLowerCase().trim();
  if (!wanted) return null;
  const titleOf = (mix) => String(mix?.mixTitle || '').toLowerCase().trim();
  return mixes.find((mix) => titleOf(mix) === wanted)
    || mixes.find((mix) => titleOf(mix).includes(wanted) || wanted.includes(titleOf(mix)))
    || null;
}

/**
 * Pauses between repeated attempts to pull a mix segment from its gateway. The Arweave gateway returns 502/504 in
 * blips that last minutes (and on 2026-11-17 arweave.net itself began 302ing to a sandbox subdomain that returns 404, failing every render until mixUrlCandidates added alternate gateways), far longer than the one-second pauses the worker used (2026-10-28: four ACIDMAN renders
 * died this way while the website still played the mix). Waits grow 10s → 30s → 60s → 120s, so five attempts span
 * about four minutes — inside the Action's 30-minute budget, long enough to ride out a blip.
 */
export const GATEWAY_RETRY_DELAYS_MS = Object.freeze([10_000, 30_000, 60_000, 120_000]);

/** Milliseconds to wait before attempt `attempt` (1-based) runs again; null after the last allowed attempt. */
export function gatewayRetryDelayMs(attempt, delays = GATEWAY_RETRY_DELAYS_MS) {
  const index = Number(attempt) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= delays.length) return null;
  return delays[index];
}
