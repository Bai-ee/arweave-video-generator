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
| JEFF CRAVEN | Mixtape Processing (REC020) | "Untitled", 1:35:21, both sides joined | Firebase Storage `-17ht1csELDW30uLHP4ROR1gXoYxAffMekoAN6aXEjI` |

Next in line: more Rave Archive Chicago DJs (`~/server/data/ravearchive/catalog.csv`, 182
likely); Paul Johnson "Jive Turkey" (2012) from Bryan's Drive; new cassettes as Bryan drops them.
