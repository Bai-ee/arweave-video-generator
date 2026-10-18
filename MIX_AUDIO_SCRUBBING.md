# Mix Audio Playback & Scrubbing

Status: **SCRUBBING LIVE** (2026-09-08 rebuild). Playback runs on a verified state machine over the two Range-capable ar.io gateways; waveforms are interactive scrubbers with confirmed seeks.
History below (2026-07-01 matrix) kept because gateway behavior shifts — re-verify before changing hosts.

## Current solution (2026-09-08 — replaces the 2026-07-03 tier design)

ar-io-node Release 74+ (April 2026) added Range support + background caching for bundled data items. Re-verified 2026-09-08 across 4 mixes × 2 hosts × 2 range shapes (16/16 probes): **arweave.fllstck.dev** and **frostor.xyz** serve the mixes with `206` + a coherent `Content-Range` + `Accept-Ranges: bytes` on open-ended (`bytes=0-`), bounded, and mid-file-no-end ranges, CORS `*` with `Access-Control-Expose-Headers: *`. `arweave.net` still ignores Range on these items (5/5 control probes returned `200` full-file); `ar-io.dev` still 402s open-ended (x402 metering).

### Why the tier design was replaced

The old design probed with a **4-second** race and, on expiry, fell back to the canonical `arweave.net` URL as a final "plays, no scrub" tier. Measured cold gateway latency is 0.9–12.7 s typically, with a 24.98 s worst observation and one 30 s timeout — far beyond 4 s. So the race routinely expired and handed interactive playback to the raw gateway, which reports `audio.seekable` as a **zero-width** `[[0, 0]]` range: every seek is silently discarded and `currentTime` snaps back to 0, while the UI paints progress anyway because `duration` is known. That is the whole of the "scrubbing does nothing" bug. The 15-second frozen-clock watchdog calling `setSrc()` on a still-buffering source is the whole of the "mixes restart after a few minutes" bug.

### What ships now

Policy and state transitions live in **`website/js/player-core.js`** — a pure module (no DOM, no fetch, no timers) covered by 55 unit tests in `tests/`, run with `npm test`. `website/js/player.js` is the host: it owns the `<audio>` element and the UI, and only executes the command objects the module returns.

- **Candidates, not tiers.** `buildCandidates()` emits one candidate per range host and **never** the raw URL. Raw `arweave.net` is download-only, permanently. Canonical URLs still stay `arweave.net/<txid>` in Firestore/`artists.json`; the gateway is chosen at play time and never stored.
- **Probing never gates playback.** On a user gesture the first candidate is set and `play()` is called synchronously (mobile autoplay). Both candidates are probed in the background on a ~22 s budget; a candidate is only offered for interactive seeking once its own probe returned `206`. `evaluateProbe()` gates strictly on `status === 206` plus a parseable `Content-Range` — one gateway was observed returning `404` carrying a plausible-looking `Content-Range`, so header presence alone is not trusted.
- **Verified failover.** On a media `error`, a genuine sustained stall, a premature `ended`, or a load that produces nothing for 25 s, the active candidate is marked unhealthy and the next eligible one is loaded, resuming from `confirmedTime` — the last position the media element actually reported, never an optimistic UI position. Recovery is capped at one attempt per candidate. Measured resume accuracy: 0.12–0.13 s behind the last confirmed position.
- **Stale events cannot corrupt state.** Every load bumps a `playbackGeneration`; every media event carries the generation it was observed under, and the module drops anything stale.
- **Seeks are confirmed, not assumed.** A seek is authoritative only after `seeked` fires within tolerance **and** the target lies inside `audio.seekable`. Dragging paints a preview only; exactly one seek commits on release. A failed seek restores the last confirmed playhead and shows an actionable message.
- **No silent degradation.** When no range-capable candidate remains, the player shows a terminal "Playback unavailable" + **Retry**, marks the waveform non-seekable, and keeps the Download control on the canonical URL. It never quietly falls back to a source it cannot scrub.
- Waveform bars are still deterministic seeded bars, not decoded audio (a 100–200MB client-side decode is infeasible; real peaks would need precomputation at upload).

### Debug / test affordances

- `?uedebug=1` — overlay showing active host, state, currentTime, duration, seekable ranges, readyState, generation, last recovery reason.
- `?uefail=<hostSubstring>` / `?uefail=a,b` / `?uefail=all` — **test only**: rewrites matching candidate hosts to an unreachable address so failover and the terminal state can be exercised in a browser. Inert without the parameter.
- `window.UEPlayer.debug.snapshot()` and `window.UEPlayer.debug.log` (last 100 structured entries, mirrored to `console.debug('[UEPlayer]', …)`). No cookies, no analytics, no listener identifiers.

## Gateway warming (2026-09-08, second phase — start latency)

Reliability was phase one; this is start *speed*. Measured cause: the first touch of a cold mix on
a gateway costs **2–12 s** to first byte (observed 2.08 / 7.54 / 9.97 / 10.12 / 12.35 s). A second,
already-warm request for the same mix costs **~0.6 s**. Warming pays that cost before the click.

**`website/js/ue-warm.js`** issues bounded range requests to the same candidates the player uses:

- **`Range: bytes=0-65535`. 64 KiB, always.** Never open-ended, never a whole file. The mixes are
  93–280 MB; an open-ended warm measured 105,605,531 bytes on one of them. Grep-check before you
  change anything here: the only Range literals in `website/js/` are `bytes=0-127` (the player's
  probe) and `bytes=0-65535` (warm).
- Page policy is derived from existing `data-section` markers — no artist names, no new markup, and
  every future generated page inherits it. `home` → featured + 4; `artist` → every unique txid on
  the page; `archive` → `IntersectionObserver` only (`rootMargin: 400px`), never the whole catalog;
  `selectors`/`about`/unknown → nothing. A `data-warm-policy` attribute overrides per page.
- Concurrency **2**, 150 ms + jitter spacing, 20 s per-request timeout, dedupe by txid for the
  session, `failed` never auto-retried. `artists.json` has 45 playable entries but only **35 unique
  txids**, so txid dedupe is load-bearing, not theoretical (`akila.html` lists one txid twice).
- Explicit intent (hover / focus / touchstart / pointerdown / click) jumps a mix to the front, and
  enqueues it if it was never queued — the common archive case. Intent lives in `ue-warm.js`, NOT
  `player.js`; it must work before the player has loaded.
- `UEWarm.notifyPlaybackStarting(txid)` cancels that txid's warm and pauses the queue while the real
  load runs, so warming cannot compete with the click it exists to accelerate. Resumes on `playing`,
  on pause/terminal failure, or after a 30 s bound.
- Reduced data (`saveData`, `slow-2g`/`2g`/`3g`) → intent only.
- Warming never creates a media element, never calls `play()`, never mutates the queue or mix data,
  and never touches raw `arweave.net`.

**`website/js/ue-host-pref.js`** remembers the last gateway that actually served a 206
(`ue-gw-pref-v1`, 12 h TTL, versioned key) and reorders candidates on the next visit. It is a
**hint only** — validated against `RANGE_HOSTS` before use, so a hand-edited localStorage value
cannot redirect playback to an arbitrary origin; probing, verification and failover are unchanged.

Connection hints: the shared head carries only `dns-prefetch` for the two gateways (cheap, and it
surfaces a dead host sooner). The expensive `preconnect` — both credential modes, since the media
load is no-CORS and the warm fetch is CORS — is injected at runtime by `ue-warm.js` and **only on
pages that actually warm**, so `about.html`/`residents.html` do not open sockets to audio gateways
they will never use.

### Gotcha that will waste your afternoon

A Chrome tab whose `document.visibilityState` is `hidden` **defers media loading entirely** — `readyState` stays 0 with no error, even for a 2-second WAV data URI with no network involved. Sustained playback is unaffected once started. If you test playback through automation, foreground the tab or you will misdiagnose a working player as dead.

Ops note: after adding a new mix, pre-warm it once per gateway or first play starts late:
`curl -H "Range: bytes=0-1023" https://arweave.fllstck.dev/<txid>` (repeat for frostor.xyz). A 404 usually resolves on retry as the gateway locates the item.

This doc exists because "just switch the gateway" looks obvious and is wrong. Read it before touching mix playback URLs.

## Symptom

In the site's audio player (Plyr), dragging a playing mix forward to fast-forward **freezes** the player. Some mixes also throw `NotSupportedError: no supported source` / `SES_UNCAUGHT_EXCEPTION` in the console.

## Root cause

The mixes are large (~100–140 MB) **bundled ANS-104 data-items** on Arweave (uploaded via ArDrive Turbo; tags show `App-Name: ArDrive-App`). How a gateway serves them decides whether the `<audio>` element can seek:

- To **start playback**, the browser sends `Range: bytes=0-` (open-ended).
- To **seek/scrub**, it sends a **bounded** `Range: bytes=<offset>-<offset+n>` and needs a `206 Partial Content` with a correct `Content-Range`.
- If the server answers a bounded seek range with `200` (whole file from byte 0, ignoring Range), the media element cannot seek forward → **freeze**. `seekable` stays empty, `duration` is `NaN`.

For these bundled items, **no free gateway does both** (verified below).

## Verified gateway matrix (tx `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA`, 137 MB)

| Gateway / form | play: `Range: bytes=0-` | seek: bounded range | Verdict |
|---|---|---|---|
| `arweave.net` (apex + sandbox) | `200` audio/mpeg | `200` — **ignores Range** | plays, **no forward-scrub** |
| `vilenarios.com` sandbox | `200` audio/mpeg | (no range) | plays, no scrub |
| `ar-io.dev` sandbox + `/raw/` | **`402` Payment Required** | `206` (bounded only) | **won't play**; meters open/full egress |
| `ardrive.net`, `permagate.io`, `love4src.com`, `frostor.xyz` | no response (slow / not synced) | — | unusable |
| `turbo.ardrive.io/<tx>` | `404` | `404` | upload endpoint, not a data gateway |

Note: raw **L1** transactions (e.g. the homepage default track `r14of…`) *are* range-served (`ardrive.net` returned `206`). It's specifically **bundled data-items** that gateways serve as `200`-no-range.

## What NOT to do

- **Do not rewrite mix URLs to `ar-io.dev` (or its `/raw/` path).** Bounded range probes pass, but the open-ended `Range: bytes=0-` that starts playback returns **`402`**, so mixes fail to load entirely. This was tried and reverted (commits `e40537d` → `39a4cfd`).
- Do not assume `arweave.net` will "warm up" and start honoring Range. Tested repeatedly over minutes — consistently `200`-no-range for these items.

## Current behavior (what ships today)

`lib/WebsitePageGenerator.cjs` (and its `.js` twin) emit mix links straight from `mix.mixArweaveURL` (canonical `arweave.net`). Mixes **play**; forward-scrub does not work. This matches the pre-existing site behavior.

The mix URL originates in `lib/ArweaveUploader.js` (`arweaveUrl: https://arweave.net/${turboResult.id}`), is stored in Firestore `system/artists` (`mixArweaveURL`), synced to `website/artists.json` on deploy (`WebsiteSync.js`), then rendered by the generator. The gateway host is **data + presentation**, not upload logic — changing it never touches the upload/manifest/ArNS pipeline.

## Option B — range proxy (the real fix; keeps mixes on Arweave)

A small **Cloudflare Worker** sits in front of the audio. Mixes are **not moved or re-uploaded** — the Worker re-serves the same Arweave bytes with proper Range support.

Design (sidesteps ar-io.dev's `402` on open egress):
1. Client requests `GET /mix/<txid>` with `Range: bytes=A-B` (B may be absent = open-ended).
2. Worker clamps an open-ended range to a bounded window (e.g. 1–4 MB), then fetches that **bounded** range from a range-honoring gateway (`ar-io.dev` returns `206` for bounded requests, no `402`).
3. Worker returns `206 Partial Content` with a correct `Content-Range: bytes A-B/<total>`, `Accept-Ranges: bytes`, `Content-Type: audio/mpeg`, `Access-Control-Allow-Origin: *`.
4. The media element chunk-requests subsequent ranges as it plays/seeks — each becomes a bounded subrequest → real playback **and** scrub.

Then point mix URLs at the Worker by reintroducing a render-time rewrite in the generator (the same seam the reverted `toPlaybackGateway()` used), e.g. `https://<worker-host>/mix/<txid>`.

Deploy requirements (one-time, needs the site owner):
- A Cloudflare account + `wrangler login` (or a scoped API token). **This cannot be done without the owner's credentials.**
- After deploy the Worker is self-managing (free tier ≈ 100k req/day).

Alternatives considered and rejected: Vercel serverless proxy (12-function Hobby cap + streaming/egress limits), re-hosting mixes as raw L1 or on an S3/R2/Bunny CDN (heavier, changes storage model + cost).

## Related fixes (done)

- **Homepage banner** — was a relative `img/covers/ue_banner.jpg` missing from the deploy. Repointed `website/index.html` to its permanent tx `arweave.net/N7Xi3oJ3dQAYwDQs4sAz44tzU4dJTPv4mOJk3I394C0`.
- **"For Hakim" (Chicago Skyway)** — `mixArweaveURL` in Firestore `system/artists` was an ArDrive **viewer** link (`app.ardrive.io/#/file/…/view`), not a tx, so it never played. Patched to `arweave.net/5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA`. Firestore doc backed up under `backups/2026-07-01-scrub-banner-fix/`.

## Open issue — ArNS

The `/api/deploy-website` run reported "ArNS update was not successful," so `undergroundexistence.ar.io` still resolves to the **old** manifest. Test deploys via the direct `arweave.net/<manifestId>/index.html` URL from the deploy modal until ArNS is repointed. Likely related to `ARNS_NAME` config (missing locally; verify on Vercel). Not yet diagnosed.
