# Mix Audio Playback & Scrubbing

Status: **play-only** (mixes play, forward-scrub freezes). Real scrubbing needs a range-serving host (see Option B).
Last verified: 2026-07-01.

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
