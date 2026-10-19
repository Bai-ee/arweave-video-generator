// Which mixes the render worker can play, and how a requested mix title is matched. Pure (no ffmpeg/network), so
// tests can import it without the audio client's side effects.
//
// Mixes not yet on Arweave are hosted in this project's Firebase Storage bucket (website/mixes/<content id>, public,
// range requests supported) and still sit in the `mixArweaveURL` field. Both hosts are playable.

const FIREBASE_MIX_HOSTS = [
  'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/',
  'https://firebasestorage.googleapis.com/v0/b/editvideos-63486.firebasestorage.app/',
];

export function isPlayableMixUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false;
  if (url.includes('arweave.net')) return true;
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
