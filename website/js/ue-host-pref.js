/* ==========================================================================
   Underground Existence — ue-host-pref.js

   Short-lived, versioned gateway-PREFERENCE hint. This is a HINT ONLY: it
   reorders which of the two approved range gateways (website/js/player-
   core.js RANGE_HOSTS: arweave.fllstck.dev, frostor.xyz) is tried first for
   a session. It never selects a gateway on its own, never talks to the
   network, never touches the DOM, and never widens which hosts are
   reachable — probing, verification, and failover all remain exactly
   player-core.js's job, unchanged.

   Stored value is a gateway HOSTNAME from the fixed two-entry RANGE_HOSTS
   allowlist and nothing else — no cookies, no analytics, no tracking, no
   personal data, no per-user identifier.

   Why a preference hint exists at all: `arweave.fllstck.dev` and
   `frostor.xyz` are third-party ar.io nodes whose DNS/availability have
   been observed to fluctuate within a single day (a 30s cold timeout on
   one, a 404 carrying plausible-looking headers on the other, and a total
   local DNS resolution failure for fllstck have all been observed on
   2026-09-08 — see the connection-hints comment in templates/partials/
   head.html and MIX_AUDIO_SCRUBBING.md). Once THIS session has verified
   which of the two actually worked, remembering that for a few hours saves
   the next track (or the next tab load) from re-probing a gateway that is
   currently unreachable before falling back to the one that just worked.

   Fail-degrades-safely by construction, not by a special case: orderCandidates()
   only ever REORDERS the candidate list produced by
   UEPlayerCore.buildCandidates() — it can't drop a candidate, and a
   preferred host that has since gone dead (DNS failure, timeout, whatever)
   is still just the FIRST candidate in an otherwise-normal list. player-
   core.js's existing probe/failover state machine (unchanged, not owned by
   this file) tries it, fails it exactly as it would any other unhealthy
   candidate, and moves on to the next eligible one — so a stale/dead
   preference costs at most one extra failed attempt, it can never strand
   playback. See "Definition of done" note below for the write-side of this:
   the UX/integration layer (player.js, not this file) is expected to clear
   the preference when the preferred candidate it produced actually fails,
   so a persistently-dead host stops being suggested; that call site is out
   of scope here — this file only supplies clear() for it to call.

   NO DOM, NO fetch/XHR, NO import/require. This file only reads a global
   `window.UEPlayerCore` (already loaded by player-core.js, same as player.js
   does — window.UEPlayerCore.RANGE_HOSTS) to validate a stored host against
   the allowlist, and wraps every window.localStorage access in try/catch
   (private/incognito modes throw on access, not just on read/write).

   Classic script, dual browser/CommonJS export tail — same pattern as
   player-core.js — so it loads identically as a plain browser
   <script src="js/ue-host-pref.js"> and via node:vm in tests (see
   tests/helpers/load-core.mjs for the loader pattern this mirrors).

   Intended call sites (NOT wired here — the UX/integration agent owns
   player.js/boot.js):
     - player.js, when building candidates for a track: call
       UEHostPref.read() and, if non-null, pass it plus
       UEPlayerCore.buildCandidates(url) to UEHostPref.orderCandidates()
       before handing the list to createPlaybackController().
     - player.js, on a CONFIRMED successful play (e.g. the first `playing`
       event on a candidate, or a probe that returns rangeCapable:true):
       call UEHostPref.write(candidate.host) to remember it.
     - player.js, when a candidate is marked unhealthy/failed AND it is the
       currently-preferred host: call UEHostPref.clear() so a dead
       preference doesn't keep getting suggested first.
   ========================================================================== */
(function () {
  'use strict';

  /* Version is IN the key on purpose (contract: "a format change self-
     invalidates") — bumping this to -v2 in a future change makes every
     existing stored record simply a cache miss, no migration code needed. */
  var STORAGE_KEY = 'ue-gw-pref-v1';

  /* 12 hours. Long enough to skip re-discovering a working gateway across a
     single listening session (including a tab reload), short enough that a
     gateway which recovers overnight gets re-tried on the listener's next
     visit rather than being avoided indefinitely on one bad day. */
  var TTL_MS = 12 * 60 * 60 * 1000;

  /* ---------- small internal helpers ---------- */

  function getLocalStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      return window.localStorage;
    } catch (err) {
      /* some privacy modes throw on the PROPERTY ACCESS itself, not just
         on getItem/setItem — so this has to be inside its own try too */
      return null;
    }
  }

  /* The allowlist this file's whole security boundary rests on: a value
     read back from localStorage may only ever steer playback toward one of
     these two hosts. Sourced live from window.UEPlayerCore.RANGE_HOSTS
     (never hardcoded here) so this file can never drift out of sync with
     the real candidate policy in player-core.js. If UEPlayerCore is not
     yet loaded, there is no allowlist to check against, so every host is
     treated as untrusted (fail closed) rather than trusted. */
  function currentAllowlist() {
    try {
      if (
        typeof window !== 'undefined' &&
        window.UEPlayerCore &&
        Array.isArray(window.UEPlayerCore.RANGE_HOSTS)
      ) {
        return window.UEPlayerCore.RANGE_HOSTS;
      }
    } catch (err) { /* defensive; property access should not throw */ }
    return null;
  }

  function isAllowedHost(host) {
    if (typeof host !== 'string' || !host) return false;
    var allowlist = currentAllowlist();
    if (!allowlist) return false; /* can't prove membership -> reject */
    for (var i = 0; i < allowlist.length; i++) {
      if (allowlist[i] === host) return true;
    }
    return false;
  }

  /* Validates the full stored shape: {"host": "<string>", "ts": <number>}
     and nothing more permissive. Every branch below corresponds to a case
     this file must survive per the integration contract: missing key,
     null, empty string, non-JSON garbage, valid JSON of the wrong shape, a
     future ts, an expired ts, a non-string host, and a host outside the
     current allowlist. */
  function parseAndValidate(raw, nowMs) {
    if (typeof raw !== 'string' || raw === '') return null;

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return null; /* non-JSON garbage */
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null; /* wrong shape, incl. parsed `null`/primitives */
    if (typeof parsed.host !== 'string' || !parsed.host) return null;
    if (typeof parsed.ts !== 'number' || !isFinite(parsed.ts)) return null;
    if (parsed.ts > nowMs) return null; /* clock-skew/tampered future ts */
    if (nowMs - parsed.ts > TTL_MS) return null; /* expired */
    if (!isAllowedHost(parsed.host)) return null; /* not in RANGE_HOSTS — the security boundary */

    return parsed.host;
  }

  /* ---------- public API ---------- */

  /* Returns the validated, unexpired preferred host, or null. Any invalid
     stored value (see parseAndValidate above) is cleared as a side effect
     so a corrupt/tampered/expired record does not linger and get re-parsed
     on every call. */
  function read() {
    var storage = getLocalStorage();
    if (!storage) return null;

    var raw;
    try {
      raw = storage.getItem(STORAGE_KEY);
    } catch (err) {
      return null; /* private-mode getItem() can throw */
    }
    if (raw === null || raw === undefined) return null;

    var host = parseAndValidate(raw, Date.now());
    if (host === null) {
      clear();
      return null;
    }
    return host;
  }

  /* Writes the preference only if `host` is currently one of
     UEPlayerCore.RANGE_HOSTS — silently does nothing otherwise (does not
     clear an existing valid preference just because one bad call came in;
     the caller passing garbage is not a reason to forget a good, still-
     unexpired preference). */
  function write(host) {
    if (!isAllowedHost(host)) return;
    var storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify({ host: host, ts: Date.now() }));
    } catch (err) { /* quota exceeded / private mode — a lost hint is harmless */ }
  }

  function clear() {
    var storage = getLocalStorage();
    if (!storage) return;
    try {
      storage.removeItem(STORAGE_KEY);
    } catch (err) { /* private mode — nothing to do */ }
  }

  /* Pure, stable reorder: moves the candidate whose `.host` matches
     `preferredHost` to the front, preserving the relative order of every
     other candidate. Never drops, duplicates, or rewrites a candidate
     object, and always returns a NEW array (the input array/objects are
     never mutated). A `preferredHost` that matches no candidate — e.g. a
     preference for a host that has since been removed from RANGE_HOSTS, or
     simply `null` from an empty read() — returns the candidates in their
     original order, unchanged. */
  function orderCandidates(candidates, preferredHost) {
    var list = Array.isArray(candidates) ? candidates : [];
    var copy = list.slice();

    if (typeof preferredHost !== 'string' || !preferredHost) return copy;

    var idx = -1;
    for (var i = 0; i < copy.length; i++) {
      if (copy[i] && copy[i].host === preferredHost) { idx = i; break; }
    }
    if (idx <= 0) return copy; /* not found, or already first: order is already correct */

    var preferred = copy[idx];
    var rest = copy.slice(0, idx).concat(copy.slice(idx + 1));
    rest.unshift(preferred);
    return rest;
  }

  /* ---------- exports ---------- */

  var UEHostPref = {
    STORAGE_KEY: STORAGE_KEY,
    TTL_MS: TTL_MS,
    read: read,
    write: write,
    clear: clear,
    orderCandidates: orderCandidates
  };

  if (typeof module === 'object' && module.exports) { module.exports = UEHostPref; }
  if (typeof window !== 'undefined') { window.UEHostPref = UEHostPref; }

})();
