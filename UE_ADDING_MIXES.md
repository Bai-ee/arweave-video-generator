# Adding artists and mixes to the UE site

One finish line for every source of new mixes. Two pipelines feed it today:

| Source | Pipeline | Audio is hosted | Example |
|---|---|---|---|
| **Licensed archives** (Rave Archive on the Internet Archive; owner permission 2026-11-18) | `scripts/ravearchive/` (catalog → spec → record → NAS copy), runbook below | **Streams from archive.org** (`https://archive.org/download/<item>/<file>.mp3#/<43-char id>`), nothing copied | PAUL JOHNSON, 15 sides |
| **Bryan's cassettes** (HITLOOP Mixtape Processing, `docs/source-of-truth/MIXTAPE-PROCESSING.md` in port_2026) | NAS `Mix_Tapes_For_Processing/` → `trim-mixtapes` → `restore-mixtapes` → 320k MP3 + `~/mixtape-work/ue/<STEM>/ue-manifest.json` | **Firebase Storage** `editvideos-63486.firebasestorage.app/website/mixes/<base64url sha256 of the MP3>` (public, deletable) | JEFF CRAVEN, "Untitled" (tape REC020) |

**Never upload third-party mixes to Arweave.** Arweave is permanent; a takedown would be
impossible. Arweave holds only the site (HTML, JS, CSS, images, `artists.json`).

## Runbook: add Rave Archive DJs (end to end)

Bryan's standing instruction (2026-11-19): a request like "add DJ X" ends as a **tested prod
manifest link**, with portrait, artist page and mixes that play and scrub. No "go" at each step.
Stop and ask only when a check fails or a step would overwrite or delete something.

All commands run from the repo root on the server (`~/Documents/Repos/EditVideos/ue-ravearchive`
or any worktree), on a branch off `origin/main`. Data lives outside the repo in
`~/server/data/ravearchive/` (`UE_RAVEARCHIVE_DATA`).

1. **Catalog** (only when it is stale): `python3 -I scripts/ravearchive/catalog.py` writes
   `catalog.csv`/`catalog.json` and caches item metadata in `meta/`. Find the DJ's items with a
   grep on `catalog.csv`; the `chicago` column is a guess, not a filter.
2. **Spec**: `config/ravearchive/<slug>.json`: artist, slug, genre, the item ids, `with` for
   back-to-back sets, `rename` for files with unusable names.
   Rules: a b2b goes under the artist the item is filed under, titled `(with X)`; when the
   archive holds the same b2b twice, list it once; skip items that only mention the artist.
   ```json
   {"artistName": "TERRY MULLAN", "slug": "terrymullan", "artistGenre": "house",
    "items": [{"id": "rave_Terry_Mullan_Live_In_Denver_With_Hipp-E", "with": "Hipp-E"}],
    "rename": {"<mp3 file stem>": "Exact Title (Side A)"}}
   ```
3. **Record**: `python3 -I scripts/ravearchive/build-artist.py config/ravearchive/<slug>.json`
   writes `~/server/data/ravearchive/<slug>-artist.json`: one mix per MP3 side, house-style
   titles (`Title (Side A)`, year in `mixDateYear`), the `#/<id>` key, the item photo, the credit.
   Every side is range-probed (206); any problem exits non-zero. Read the printed titles.
4. **Portrait**: `ARTIST_PORTRAITS.md` (photo to the sources folder, crop, render, compare at
   card size next to existing artists, lock). Send Bryan the comparison sheet; it is not a gate.
5. **About drawer**: `website/about/<slug>.html` from an existing Rave Archive drawer
   (`pauljohnson.html`): one `<dl data-mix>` per exact `mixTitle`, a one-line bio, the Rave
   Archive credit and the removal note.
6. **PR**: `npm test` (includes the portrait lock), commit, push over SSH
   (`git push git@github.com:Bai-ee/arweave-video-generator.git <branch>`; HTTPS has no
   credentials here), `gh pr create`, `gh pr merge --squash`. Wait for the Vercel production
   deployment of the merge commit to report `success`.
7. **Firestore**: `node scripts/ue-append-artists.mjs ~/server/data/ravearchive/<slug>-artist.json ...`
   (dry run: validates and shows the result), then the same with `--write` (backup to
   `~/server/data/ue-firestore-backups/`, one transaction that refuses existing artists and
   already-live mix URLs, re-read). New mixes for an existing artist:
   `--add-mixes-to "PAUL JOHNSON"`.
8. **Deploy**: `GET https://arweave-video-generator.vercel.app/api/deploy-website` (estimate),
   then `POST` with `X-Deploy-Token: $UE_DEPLOY_TOKEN` (see Security). The response has
   `manifestId`.
9. **Verify prod**: `node scripts/ue-verify-live.cjs <manifestId> <slug> ...`: per artist, the
   page loads, the portrait loads, a mix plays and a waveform drag to 60% seeks. All must be `OK`.
   An Arweave manifest is immutable and the domain only moves when Bryan repoints it, so a
   failed check never reaches the public site: fix, redeploy, re-verify.
10. **Private copy**: `python3 -I scripts/ravearchive/mirror-nas.py` copies every Rave Archive
    MP3 and photo in use to `/Volumes/bryan/DJMIXES/Rave Archive/<ARTIST>/<item>/` with a
    `credit.json` (md5-checked on download, resumable, never deletes; `--verify` re-checks every
    file), plus the pipeline's own state (portrait sources, records, Firestore backups) to
    `_pipeline-data/`, since `~/server/data` has no other backup. Run in the background.
11. **Hand over**: `https://turbo-gateway.com/<manifestId>/index.html` for testing and as the
    GoDaddy forward target; update the Live table below and the memory/STATE notes.

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
5. **Ship** — runbook steps 6 to 11 above (PR, merge, `ue-append-artists.mjs`, deploy,
   `ue-verify-live.cjs`, hand over the manifest link).

## Live

| Artist | Pipeline | Mixes | Audio |
|---|---|---|---|
| PAUL JOHNSON | Rave Archive | 15 tape sides | archive.org (streamed) |
| DANNY THE WILDCHILD | Rave Archive | 23 sides | archive.org (streamed) |
| MARK FARINA | Rave Archive | 20 sides | archive.org (streamed) |
| DJ SNEAK | Rave Archive | 15 sides | archive.org (streamed) |
| TERRY MULLAN | Rave Archive | 43 sides | archive.org (streamed) |
| JEFF CRAVEN | Mixtape Processing (tape REC020) | "Untitled", ??, 1:35:21, both sides joined | Firebase Storage `-17ht1csELDW30uLHP4ROR1gXoYxAffMekoAN6aXEjI` |

Latest manifest (2026-11-19): `9ikJfXN2onFQWHq2E27AzjCN__qWuheu3RCJKQ3gAWo`. 24 artists, 182 mixes,
scrub verified on every archive.org and Storage artist. GoDaddy forward target
`https://turbo-gateway.com/9ikJfXN2onFQWHq2E27AzjCN__qWuheu3RCJKQ3gAWo/index.html`.

## Security

| Risk | Control |
|---|---|
| Third-party audio made permanent | Audio streams from archive.org or our deletable Storage bucket. `ue-append-artists.mjs` refuses Arweave mix URLs unless `--allow-arweave` (UE-owned audio only). |
| Bad or duplicate Firestore write | Dry run by default; `--write` backs up the whole doc, runs one transaction that refuses existing artists and already-live mix URLs, re-reads. Restore = write a backup's `artists` back (by hand, after checking). |
| Credentials leaking | The Firestore key is read from the env or HITLOOP `.env.local` and never printed or committed. Source photos and data stay in `~/server/data`, outside the public repo. |
| Anyone can spend the wallet / redeploy the site | `POST /api/deploy-website` checks `X-Deploy-Token` against Vercel env `DEPLOY_WEBSITE_TOKEN` (`lib/deploy-auth.js`). **Off until that env var is set.** Turn on in this order: (1) HITLOOP bridge sends `X-Deploy-Token: $EDITVIDEOS_DEPLOY_TOKEN` (HITLOOP PR) and that env is set on HITLOOP's Vercel; (2) generate a token, store it in `~/server/secrets/ue-deploy-token` (mode 600) for the runbook; (3) set `DEPLOY_WEBSITE_TOKEN` on the EditVideos Vercel project and redeploy. The EditVideos UI asks for the token once and keeps it in that browser. |
| A broken release goes public | Manifests are immutable and the domain moves only when Bryan repoints GoDaddy; `ue-verify-live.cjs` must pass first. |
| Losing the audio if archive.org drops it | NAS copy (runbook step 10). |
| Portrait drift | Locked hashes (`ARTIST_PORTRAITS.md`), checked by `npm test`. |

## Who does what today

| Step | Owner | Trigger |
|---|---|---|
| Digitize a tape, drop it on the NAS | Bryan | — |
| Trim, restore, Tape Deck review, MP3 upload, `ue-manifest.json` | HITLOOP Mixtape Processing (`/open hitloop-mixtape-processing`) | Bryan asks |
| Pick Rave Archive DJs from the catalog | Bryan | — |
| Portrait, Firestore, drawer, PR, merge, deploy, verify, NAS copy | master session (this doc) | Bryan says "add tape X" / "add DJ Y" (standing OK to ship) |
| Better photo, title/date corrections | Bryan | after he tests the link |
| GoDaddy forward | Bryan (no credentials here) | each release |

## Next steps: connect and automate the two pipelines

Proposed, in order.

1. **One handoff file for both sources.** Freeze `ue-manifest.json` as v1:
   `{ manifestVersion: 1, source: "mixtape" | "ravearchive", artistName, slug, mixes: [{ mixTitle,
   mixDateYear, mixNote, durationS, audio: { url, sha256?, rangeOk } }], portrait: { sourceUrl? },
   status: "ready" }`. The Mixtape pipeline already writes nearly this (add `source`, `slug`, a
   `mixes` array, `status`). Add `ravearchive-to-manifest.py <dj>` that turns catalog rows into
   the same file (one mix per tape side, archive URL with its `#/<id>`).
2. **`scripts/ue-publish.mjs` — the finish line as one command** (its parts now exist: `build-artist.py`, `ue-append-artists.mjs`, `ue-verify-live.cjs`). `--manifest <path>`:
   check every audio URL answers 206; require a locked portrait for the slug (or stop and ask
   for a photo); dry-run prints the exact Firestore diff; `--write` = fresh backup + one
   transaction that refuses duplicate `mixArweaveURL` + re-read; create the about drawer from a
   template; run `npm test` and the local Playwright check (page loads, first mix plays and
   seeks). It opens the PR but never merges.
3. **A ready queue instead of a message.** The Mixtape publish step (and the archive adapter)
   drops manifests into `~/mixtape-work/ue/ready/`. The master session checks the folder (a
   `/loop` or a launchd job every 30 min) and runs `ue-publish --manifest` on each one,
   moving it to `done/` or `blocked/` (missing photo, failed check) with a reason Bryan sees.
4. **Switch on the deploy token** (code is in; see Security for the order), then let
   `ue-publish --deploy` call the endpoint and `ue-verify-live.cjs` the result.
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
