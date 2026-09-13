# Underground Existence — Playability Upgrades (Media Session · Deep Links/Share · Resume) — Handoff

Status: **implemented, tested, reviewed, locally verified.** Nothing deployed, nothing committed,
no Arweave/ArNS/GoDaddy action taken. Date: 2026-09-08.

Scope was exactly three features. Drive Mode, native app, PWA/service worker, CDN/proxy and any
new backend were explicitly out of scope and were not built.

---

## 1. Architecture

The three features are **progressive-enhancement modules** that never touch the `<audio>` element,
never build a gateway URL, and never reimplement seeking. All playback goes through a new, narrow
host bridge on the existing verified player.

```
boot.js
  player-core.js  → ue-host-pref.js → ue-warm.js → ue-links.js → ue-resume.js   (eager chain)
  player.js (lazy: idle or first tap) → ue-mediasession.js                       (player chain)
```

* `window.UEPlayer.host` (in `player.js`) — read accessors (`getQueue/getState/getCurrentTrack/
  getCurrentTime/getDuration/getTxid/findIndexByTxid`), controls (`playIndexAt/play/pause/
  togglePlay/next/prev/seek/seekBy`), and three subscriptions (`on('track'|'playback'|'time')`).
  Every control reuses the same functions the built-in transport calls; `seek`/`seekBy` route
  through `attemptSeek()` (hold-until-range-confirmed), never a raw `currentTime` write.
* `playIndexAt(idx, startSec)` stores `pendingStartTime`, which is applied **only** at
  `loadedmetadata` and **only** via `attemptSeek()`. Applying it earlier would write
  `currentTime` with no seekable range, produce no `seeked`, and burn `player-core.js`'s
  seek-timeout budget on a healthy candidate.
* `window.UEBoot.ensurePlayer(cb)` (in `boot.js`) — unlocks the shared `<audio>` inside a real
  click gesture (iOS requirement), hydrates `player.js`, then runs `cb`. Guarded by
  `!audioEl.currentSrc` so it can never clobber live playback.
* Stable mix identity everywhere = the **Arweave txid** via `UEPlayerCore.extractTxid()`,
  validated against `^[A-Za-z0-9_-]{43}$` on every path that reads it from a URL or storage.

Contract the three modules were built against: [`UE_PLAYABILITY_INTEGRATION_CONTRACT.md`](UE_PLAYABILITY_INTEGRATION_CONTRACT.md).

---

## 2. Files

**New (runtime):**
| File | Feature |
|---|---|
| `website/js/ue-mediasession.js` | Media Session metadata, action handlers, playbackState, position state |
| `website/js/ue-links.js` | Deep links (`?mix=`/`&t=`), highlight banner, Share/Copy UI, `replaceState` |
| `website/js/ue-resume.js` | Versioned local resume record, validation/expiry, resume prompt |

**Changed (shared integration surface, lead-owned):**
| File | Change |
|---|---|
| `website/js/player.js` | host bridge (`window.UEPlayer.host`), `pendingStartTime` + `applyPendingStartTime()`, `emitFeatureEvent` on load/play/pause/timeupdate |
| `website/js/boot.js` | loads the three modules in the correct chains; `window.UEBoot.ensurePlayer/isPlayerLoaded` |

**New (tests):** `tests/mediasession-{pure,wiring}.test.mjs`, `tests/links-{parsing,share-flow,dom}.test.mjs`,
`tests/resume-{record,policy,storage,handler}.test.mjs`, helpers `tests/helpers/load-ue-{mediasession,links,resume}.mjs`.

**New (docs):** `UE_PLAYABILITY_INTEGRATION_CONTRACT.md`, this file.

**Untouched:** `player-core.js`, `ue-warm.js`, `ue-host-pref.js` (audio reliability/warming work),
all skyline files, `website/css/site.css`, `website/templates/**`, generated `website/*.html`,
`lib/**`, `api/**`. No page regeneration is needed — every module self-injects its own DOM and its
own `<style>` block, so static Arweave path-manifest compatibility is unchanged.

---

## 3. Tests

`npm test` (Node's built-in runner, no new dependencies):

```
623 tests, 623 pass, 0 fail
```

New tests by module: **Media Session 70 · Deep links/Share 81 · Resume 74** (225 total).
Pre-existing player/warming suites (`controller-*`, `warm-*`, `gateway-helpers`): **107, all green**.

Coverage includes handler routing/clamping, metadata mapping and artwork fallback, playbackState
transitions, position-state guards, unsupported-action registration, query parsing/validation of
hostile input, URL building with param preservation, share-path cascade (native → clipboard →
execCommand → visible URL), resume save throttling/thresholds/completion-clearing/expiry, every
storage rejection reason, private-mode storage that throws on access, feature detection when each
browser API is absent, and explicit "never autoplays" invariants for all three modules.

---

## 4. Review findings that were fixed

1. Media Session `playbackState` went to `'none'` on every track change, blanking the OS transport
   between tracks (cold gateways can take 2–12 s) → now `'paused'`.
2. Media Session missed metadata for a track that was already active when its script attached
   (it loads after `player.js`, so a module-triggered first play emits `'track'` before it
   subscribes) → it now pushes metadata + state from `host.getCurrentTrack()` on init.
3. Deep-link banner rendered on top of the sticky site nav → now measured against
   `#site-header` live and repositioned on resize.
4. Deep-linked mix was not reliably scrolled into view — root cause was `scrollIntoView({behavior:'smooth'})`
   being a no-op in a hidden/unfocused tab → `'auto'` when hidden or reduced-motion, scroll deferred
   to `window.load`, `history.scrollRestoration='manual'` while a deep link is active.
5. Share's manual-copy panel and the resume bar occupied the same bottom-center space → the copy
   panel is now top-anchored and stacks below an open banner.
6. Vestigial cross-module call (`UELinks.buildMixUrl`, which never existed) removed from
   `ue-resume.js`; its own validated `buildFallbackUrl()` produces the identical URL.

Investigated, deliberately unchanged: a deep-link/resume start position uses the same
`attemptSeek()`+`seekTimeoutMs:15000` path as any user scrub, so it can cost a candidate its health
on a pathologically slow gateway exactly as a manual scrub already can. `pendingStartTime` survives
internal failover and is clamped against the real duration at apply time, so it can never seek to a
wrong position.

---

## 5. Manual verification performed (Chrome, `python3 -m http.server` over `website/`)

Verified live:
* All four globals load and hydrate (`UEPlayerCore`, `UELinks`, `UEResume`, `UEMediaSession`, `UEPlayer.host`).
* `baiee.html?mix=<txid>&t=90` → target row scrolled into view and outlined, banner below the nav
  reading "Shared mix: … — …" with **Play from 1:30** and Dismiss, **nothing plays**.
* Clicking Play-from → `playIndexAt` with the correct index and seconds; banner clears.
* Resume: seeded record → prompt "Resume Love Manifesto 3 at 12:34" above the player bar,
  audio paused with no controller created; clicking Resume called `playIndexAt(0, 754)` and
  dismissed the prompt.
* Share: native path called `navigator.share` with `{title, text, url}` = artist page + `?mix=<txid>`;
  with `navigator.share` removed, clipboard path copied the same URL and announced
  "Link copied to clipboard."; player-bar popover offers **Copy link** and **Copy link at 12:34**,
  producing `/baiee.html?mix=<43-char txid>&t=754`.
* `history.replaceState` rewrote the address bar to `?mix=<txid>` on real playback and dropped `t`.
* Media Session metadata reached the browser: title/artist/album "Underground Existence"/3 artwork
  entries, `playbackState:'playing'`.
* Hostile link `?mix=<img src=x onerror=alert(1)>&t=abc&t=-5&foo=%00bar` → parsed to
  `{mix:null,t:null}`, no banner, no highlight, no injected node, nothing played.
* Mobile 390 px (via an iframe harness — see limitation below): banner clears the nav, resume bar
  sits clear above the player bar, share buttons join the existing row action stack.

Steps to reproduce:
```bash
cd website && python3 -m http.server 8123
```
1. `http://localhost:8123/baiee.html` — confirm a share icon next to each row's download icon.
2. Copy a playable mix's txid from its anchor `href`, open
   `baiee.html?mix=<txid>&t=90` — row revealed + highlighted, banner shown, nothing plays.
3. Click **Play from 1:30** — playback starts and lands at ~1:30; address bar becomes `?mix=<txid>`.
4. Let it run past ~35 s, reload — the Resume prompt appears; confirm silence until you click **Resume**.
5. Click a row's share icon, and the player bar's share icon while playing (try "Copy link at …").
6. Repeat at ≤480 px width.
7. `?uedebug=1` overlays playback diagnostics; `?uefail=fllstck` forces the second gateway.

---

## 6. Not verified locally / known limitations

* **Audible playback and the actual seek landing could not be verified today**: both range gateways
  were failing from this machine — `arweave.fllstck.dev` did not resolve at all (curl exit, DNS),
  and `frostor.xyz` served `fetch` Range requests (206) but stalled a bare `<audio>` element at
  `readyState 0` for 25 s+ with no metadata. A plain, unmodified play of a mix from a row button
  failed identically, so this is an environment/gateway condition, not a regression from this work.
  Re-run step 3 above when a gateway is healthy to confirm the timestamp restore audibly.
* **Real lock-screen / Bluetooth / notification-shade UI** cannot be inspected from automated Chrome —
  metadata and `playbackState` were verified through `navigator.mediaSession`, the OS rendering was not.
* **iOS Safari** has historically not supported the `seekto` action (`setActionHandler` throws
  `NotSupportedError`); registration is per-action try/caught, so play/pause/prev/next/seek±10 s
  still work and only the lock-screen scrubber is absent. Artwork format support varies by OS
  (PNG/JPEG reliable; WebP inconsistent on older iOS/Safari) — an unsupported format silently shows
  no artwork.
* **Mobile layout was checked in a 390 px iframe**, not a real device viewport (`resize_window` did
  not change the viewport in this automation session). Worth one pass on a real phone.
* **Share/clipboard permission prompts** were exercised with stubs, not real OS dialogs; a physical
  click on Share on a desktop that supports `navigator.share` opens the system share sheet.
* Banner repositioning on a real window resize/orientation change is unit-tested but was not
  exercised live.

---

## 7. Follow-ups (not done, not requested)

* Consider surfacing "Resume" on the player bar itself as well as the page-level prompt.
* `?mix=` could also be honoured on `index.html`/`archive.html` hero surfaces (it already works
  wherever the mix anchor exists on the page; only artist pages were exercised).
* If lock-screen artwork matters, emit a square PNG/JPEG rendition per mix rather than reusing the
  card thumbnail as-is.
