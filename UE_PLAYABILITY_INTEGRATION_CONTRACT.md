# Underground Existence — Playability Modules Integration Contract

Scope: three optional, progressive-enhancement modules layered on the existing
verified player — **Media Session**, **Deep links / Share**, **Resume Listening**.
Written for parallel implementation; each module owns its own files and nothing else.

The audio reliability/failover/seek state machine (`website/js/player-core.js`),
the gateway warming work (`website/js/ue-warm.js`, `website/js/ue-host-pref.js`),
and the skyline thumbnail pipeline are **in-progress work owned by other threads**.
Do not modify, weaken, or duplicate any of it.

---

## 1. File ownership (hard boundaries)

| Owner | May create/edit | Must not touch |
|---|---|---|
| Media Session | `website/js/ue-mediasession.js`, `tests/mediasession-*.test.mjs` | everything below |
| Deep links / Share | `website/js/ue-links.js`, `tests/links-*.test.mjs` | everything below |
| Resume Listening | `website/js/ue-resume.js`, `tests/resume-*.test.mjs` | everything below |

Shared/off-limits for all three (already wired by the lead): `website/js/player.js`,
`website/js/boot.js`, `website/js/player-core.js`, `website/js/ue-warm.js`,
`website/js/ue-host-pref.js`, `website/css/site.css`, `website/templates/**`,
`website/*.html` (generated), `lib/**`, `api/**`, `tests/helpers/**` (read-only —
add new helpers only under a module-specific name).

Generated pages already load everything via `js/boot.js`; **no HTML/template/
generator change is needed or allowed** for these features.

Styling: each module injects its own single `<style id="ue-<feature>-styles">`
block (once, guarded) so it stays self-contained and needs no page regeneration.
Match the site's existing look: colors `#e01e2b` (accent), `rgba(242,236,228,…)`
(foreground on dark), dark translucent panels; respect
`prefers-reduced-motion: reduce`.

---

## 2. Module shape

Classic IIFE script, no ESM/CommonJS imports, dual export tail — identical to
`player-core.js` / `ue-host-pref.js`, so the same file loads as a browser
`<script>` and inside `node:vm` in tests:

```js
(function () {
  'use strict';
  /* ... */
  var UEThing = { /* pure helpers + init */ };
  if (typeof module === 'object' && module.exports) { module.exports = UEThing; }
  if (typeof window !== 'undefined') { window.UEThing = UEThing; }
})();
```

**Testability rule:** all decision logic (URL parse/build, validation, clamping,
expiry, metadata mapping, handler routing tables, feature detection) must be pure
functions exported on the namespace and unit-testable with no DOM. DOM/browser
wiring must be a thin layer that no-ops when its globals are missing, and must be
guarded so loading the file in `node:vm` (no `window.document`, no `navigator`)
does not throw.

Load order (`boot.js`): `player-core.js` → `ue-host-pref.js` → `ue-warm.js` →
`ue-links.js` → `ue-resume.js`; `ue-mediasession.js` loads right after
`player.js` hydrates. `window.UEPlayerCore` is guaranteed present for all four;
`window.UEPlayer` is **not** — see §3.

---

## 3. Host bridge — `window.UEPlayer.host` (the only playback API)

`player.js` is lazy-hydrated (idle callback, or first tap). Modules loaded before
it must wait:

```js
function whenPlayerReady(cb) {
  if (window.UEPlayer && window.UEPlayer.host) { cb(); return; }
  document.addEventListener('ue-player-ready', function () { cb(); }, { once: true });
}
```

API (`window.UEPlayer.host`, `version: 1`):

| Member | Behaviour |
|---|---|
| `getQueue()` | live queue array: `{ el, url, title, artist, img, durationSec }` |
| `getState()` | `{ index, playing, shuffle, repeat }` (copy) |
| `getCurrentTrack()` | queue entry or `null` |
| `getCurrentTime()` / `getDuration()` | seconds; duration falls back to `data-duration-sec` |
| `getTxid(idx?)` | canonical Arweave txid for a queue index (default: active) |
| `findIndexByTxid(txid)` | queue index or `-1` |
| `playIndexAt(idx, startSec?)` | **user-gesture only.** Selects the track and plays it; `startSec` is applied once, after `loadedmetadata`, through the verified seek path |
| `play()` / `pause()` / `togglePlay()` / `next()` / `prev()` | same functions the built-in transport uses |
| `seek(sec)` / `seekBy(delta)` | clamped, routed through `attemptSeek()` (hold-until-range-confirmed) |
| `on(kind, cb)` | subscribe; returns an unsubscribe function |

Events for `on()`:

* `'track'` → `{ index, track, txid }` — a track became active
* `'playback'` → `{ playing, index, track }` — play/pause transition
* `'time'` → `{ index, currentTime, duration }` — native `timeupdate` (frequent; throttle yourself)

Hard rules:

* Never touch `window.UEPlayer.audio`, `audio.src`, `audio.currentTime`,
  `audio.play()`/`pause()` directly. Never build your own candidate URLs, never
  substitute a gateway, never re-implement seeking.
* Never start playback except from a genuine user gesture (a real `click` on your
  own control, or a Media Session action handler, which is itself a user action).
* Callbacks are individually try/caught by the host, but keep them cheap and
  non-throwing anyway.

## 3b. Hydration before the player exists — `window.UEBoot`

`window.UEBoot.ensurePlayer(cb)` — call **synchronously inside your own real
click handler**. It unlocks the shared `<audio>` element inside that trusted
gesture (iOS requirement) and hydrates `player.js`, then invokes `cb` when
`window.UEPlayer.host` is available. `window.UEBoot.isPlayerLoaded()` reports
hydration state. Never dispatch synthetic clicks at play controls.

---

## 4. Stable mix identity

The stable key for a mix is its **Arweave txid**, parsed with
`window.UEPlayerCore.extractTxid(url)` (43 chars, `[A-Za-z0-9_-]`, must appear as
a path segment). Validate any txid coming from a URL/localStorage with the same
character class before use, and treat it as an opaque lookup key — never
interpolate untrusted input into HTML, and never construct an audio URL from it
outside `player-core.js`.

Canonical audio URLs (`https://arweave.net/<txid>`) and the range-gateway policy
are owned by `player-core.js`. Modules never rewrite them.

---

## 5. Tests

`npm test` = `node --test tests/*.test.mjs`. Node's built-in runner, no jsdom, no
new dependencies. Load a classic script the way `tests/helpers/load-core.mjs`
does (`vm.runInThisContext` with a temporary `globalThis.module` / `window`);
write your own loader helper if you need one, named for your module.

Cover at minimum: pure parsing/building, validation and clamping of hostile
input, expiry/versioning, feature detection when the API is absent, and the
"never autoplays" invariant (assert your code path calls nothing that plays
unless a simulated user action ran first).

---

## 6. Constraints (all modules)

* No autoplay, ever — from a deep link, a resume record, or a Media Session
  metadata update.
* No network calls of any kind. No analytics. No listener data leaves the device;
  `localStorage` only, versioned, expiring, and validated on read; every access
  wrapped in `try/catch` (private mode throws on access itself).
* Unsupported browser APIs (`navigator.mediaSession`, `navigator.share`,
  `navigator.clipboard`, `history.replaceState`, `localStorage`) must be feature
  detected; absence leaves normal playback and the page completely intact.
* Static Arweave path-manifest compatibility: relative asset/page paths only, no
  absolute deploy hostnames, no new files outside `website/` for runtime code.
* Accessibility: real `<button>` elements, `aria-label`s, keyboard reachable,
  visible focus, `aria-live` for anything announced. Mobile ≤480px layouts must
  not overlap the persistent player bar.
* Do not deploy, do not run Arweave/ArNS scripts, do not `git commit`, do not
  revert or stage unrelated dirty files.

---

## 7. Local verification

```bash
cd website && python3 -m http.server 8123    # then http://localhost:8123/
```

`index.html` (hero + cards), `baiee.html` (artist page, many mixes),
`archive.html` (catalog rows) are the useful surfaces. `?uedebug=1` renders the
inert playback diagnostic overlay; `?uefail=fllstck` forces a gateway failure.
