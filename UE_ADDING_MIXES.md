# Adding artists and mixes to the UE site

One finish line for every source of new mixes. Two pipelines feed it today:

| Source | Pipeline | Audio is hosted | Example |
|---|---|---|---|
| **Licensed archives** (Rave Archive on the Internet Archive; owner permission 2026-11-18) | `~/server/scripts/ravearchive-catalog.py` builds a draft catalog in `~/server/data/ravearchive/` (DJ, sides, MP3 links, Chicago guess) | **Streams from archive.org** (`https://archive.org/download/<item>/<file>.mp3#/<43-char id>`), nothing copied | PAUL JOHNSON, 15 sides |
| **Bryan's cassettes** (HITLOOP Mixtape Processing, `docs/source-of-truth/MIXTAPE-PROCESSING.md` in port_2026) | NAS `Mix_Tapes_For_Processing/` → `trim-mixtapes` → `restore-mixtapes` → 320k MP3 + `~/mixtape-work/ue/<STEM>/ue-manifest.json` | **Firebase Storage** `editvideos-63486.firebasestorage.app/website/mixes/<base64url sha256 of the MP3>` (public, deletable) | JEFF CRAVEN, "Untitled" (tape REC020) |

**Never upload third-party mixes to Arweave.** Arweave is permanent; a takedown would be
impossible. Arweave holds only the site (HTML, JS, CSS, images, `artists.json`).

## The shared finish line

1. **Audio URL** — one playable, range-capable URL per mix:
   - archive: `https://archive.org/download/<item>/<file>.mp3#/<id>` where `<id>` is the
     base64url sha256 of the URL without the fragment (43 chars). The player keys share links,
     resume and waveforms on it.
   - cassette: the `mp3.url` from the tape's `ue-manifest.json` (the pipeline uploads and
     makes it public). **Use that file; never upload a second copy.**
   - Check: `curl -r 0-99 <url>` answers `206`.
2. **Portrait** — follow `ARTIST_PORTRAITS.md`: source photo off-repo, recipe in
   `config/artist-portraits.json`, render, review next to two artists, lock the hash.
3. **Artist record** — in Firestore `system/artists` (EditVideos project), the source of
   truth; `website/artists.json` is regenerated from it at deploy.
   - Fresh backup of the doc → **one transaction** that appends the artist (or the mix to an
     existing artist), keyed so it refuses if that `mixArweaveURL` is already present → re-read.
   - Artist: `artistName` (CAPS), `artistFilename` `<slug>.html`, `artistImageFilename`
     `img/about/<slug>/portrait.webp`, `artistGenre`.
   - Mix: `mixTitle`, `mixArweaveURL`, `mixDateYear` (`'97`, `2000`, or `??`), `mixDuration`
     (`M:SS` minutes), `mixImageFilename` (`''` → the UE tile), `mixNote` (source + credit).
   - A cassette's title and date come from its `ue-manifest.json`.
4. **About drawer** — `website/about/<slug>.html`: credit, per-mix details matched on the exact
   `mixTitle` (`<dl data-mix="<mixTitle>">`), and for archive mixes the source links and a
   removal note. No uploaded cover art unless Bryan supplies it.
5. **Ship** — branch off `origin/main` → `npm test` (includes the portrait lock) → local build
   (`generatePages` on a copy of the site + Playwright: page loads, a mix plays and seeks) →
   PR → Bryan's OK → merge (Vercel deploys the app) → `GET /api/deploy-website` (estimate) →
   `POST` (deploy) → verify on `https://turbo-gateway.com/<manifest>/` → give Bryan the new
   GoDaddy forward.

## Live

| Artist | Pipeline | Mixes | Audio |
|---|---|---|---|
| PAUL JOHNSON | Rave Archive | 15 tape sides | archive.org (streamed) |
| JEFF CRAVEN | Mixtape Processing (tape REC020) | "Untitled", ??, 1:35:21, both sides joined | Firebase Storage `-17ht1csELDW30uLHP4ROR1gXoYxAffMekoAN6aXEjI` |

Latest manifest (2026-11-19): `KLvtBJwghaxW5eJeZwmKr0jcIzaMIxLmxhGAC0PcvLw` — GoDaddy forward target
`https://turbo-gateway.com/KLvtBJwghaxW5eJeZwmKr0jcIzaMIxLmxhGAC0PcvLw/index.html`.

## Who does what today

| Step | Owner | Trigger |
|---|---|---|
| Digitize a tape, drop it on the NAS | Bryan | — |
| Trim, restore, Tape Deck review, MP3 upload, `ue-manifest.json` | HITLOOP Mixtape Processing (`/open hitloop-mixtape-processing`) | Bryan asks |
| Pick Rave Archive DJs from the catalog | Bryan | — |
| Portrait, Firestore, drawer, PR, deploy, verify | master session (this doc) | Bryan says "add tape X" / "add DJ Y" |
| Merge OK, artist photo, title/date | Bryan | each release |
| GoDaddy forward | Bryan (no credentials here) | each release |

## Next steps: connect and automate the two pipelines

Proposed, in order. Each keeps Bryan's approval gates (photo, title/date, merge).

1. **One handoff file for both sources.** Freeze `ue-manifest.json` as v1:
   `{ manifestVersion: 1, source: "mixtape" | "ravearchive", artistName, slug, mixes: [{ mixTitle,
   mixDateYear, mixNote, durationS, audio: { url, sha256?, rangeOk } }], portrait: { sourceUrl? },
   status: "ready" }`. The Mixtape pipeline already writes nearly this (add `source`, `slug`, a
   `mixes` array, `status`). Add `ravearchive-to-manifest.py <dj>` that turns catalog rows into
   the same file (one mix per tape side, archive URL with its `#/<id>`).
2. **`scripts/ue-publish.mjs` — the finish line as code.** `--manifest <path>`:
   check every audio URL answers 206; require a locked portrait for the slug (or stop and ask
   for a photo); dry-run prints the exact Firestore diff; `--write` = fresh backup + one
   transaction that refuses duplicate `mixArweaveURL` + re-read; create the about drawer from a
   template; run `npm test` and the local Playwright check (page loads, first mix plays and
   seeks). It opens the PR but never merges.
3. **A ready queue instead of a message.** The Mixtape publish step (and the archive adapter)
   drops manifests into `~/mixtape-work/ue/ready/`. The master session checks the folder (a
   `/loop` or a launchd job every 30 min) and runs `ue-publish --manifest` on each one,
   moving it to `done/` or `blocked/` (missing photo, failed check) with a reason Bryan sees.
4. **Lock the deploy endpoint before automating it.** `POST /api/deploy-website` has no auth
   today: add a shared secret (Vercel env + this server), then let `ue-publish --deploy` call it
   after Bryan's merge OK and verify the new manifest.
5. **Stop hand-editing the GoDaddy forward.** Either repair ArNS (`undergroundexistence.ar.io`,
   ANT currently unreadable) so the name always points at the latest manifest and GoDaddy
   forwards to it once, or give a GoDaddy API key with forwarding scope so the deploy step
   repoints it. ArNS is the cleaner fix; both need Bryan.
6. **Rotate the Arweave wallet** (its key is in the public repo's history) before any of this runs
   unattended.
7. **Housekeeping:** delete the unused duplicate REC020 MP3
   (`website/mixes/-kDSvi7TPG6WuHqZJCrU819FbvVG1t87rRSl5OmEb5c`, Bryan's OK); retitle the
   HITLOOP Tape Deck review to "Jeff Craven — Untitled"; Paul Johnson "Jive Turkey" goes under the
   existing PAUL JOHNSON artist.
