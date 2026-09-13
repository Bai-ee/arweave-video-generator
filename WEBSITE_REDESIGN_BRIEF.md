# Website Redesign Brief — Underground Existence

**Status:** Source of truth for the redesign. Frozen scope + constraints.
**Audience:** The master-plan author (Fable) and any implementer thread.
**Date:** 2026-07-03
**Reference mockups:** `design-refs/redesign-desktop.png`, `design-refs/redesign-mobile.png` (repo-local; kept OUTSIDE `website/` on purpose — see Invariant #6).

Read this before writing the master plan. It defines the vision, the design system extracted from the mockups, the hard technical contract you must not break, the content you must preserve, and the decisions already locked. Your job is to turn this into a phased master plan; do not re-open the locked decisions.

---

## 1. Objective

Redesign the Arweave-hosted public website for **Underground Existence** (Chicago house/techno mixtape archive) to look like a modern, professional music platform, while keeping 100% of the existing upload → auto-deploy functionality and mirroring all existing content.

The two mockups (desktop + mobile) ARE the target. Build to them. This is not an open-ended design exploration — it is "reproduce this design system faithfully and wire it to the existing pipeline."

One-line framing: **evolve the dark Underground identity into a premium analog-zine × modern music-platform site, driven by the existing Firestore data and deployed to Arweave exactly as it is today.**

---

## 2. Locked decisions (do not re-open)

| Decision | Locked value |
|---|---|
| **Aesthetic** | Emulate the two reference mockups. Evolve the dark identity; analog-zine texture (torn paper, barcode/receipt tags, "Hosted on Arweave", "Est. 2007") fused with a clean modern music-platform layout. |
| **Scope** | **Public website only** (`website/`). The Edit Videos admin app (`public/index.html`) and all `api/*` endpoints stay functionally unchanged. Do NOT restyle or refactor the admin app. |
| **Mix scrubbing** | **Visual/progress-only waveform. No drag-to-seek.** The waveform renders played/unplayed progress but does NOT enable forward scrubbing. Mixes remain **play-only** (current behavior). Do NOT build or depend on the range-proxy. Keep the design honest: the playhead reflects progress; it is not an interactive scrubber. (Background + the deferred fix live in `MIX_AUDIO_SCRUBBING.md` — reference only, out of scope.) |
| **Domain** | `undergroundexistence.info` is the public-facing domain (also the wordmark). It reaches the site via a **GoDaddy domain forward → the Arweave address** (see Hosting). The redesign does not change the domain/forward setup; it must render correctly under it. |
| **Data source of truth** | Firestore doc `system/artists` (field `artists` = array). Unchanged. |
| **Hosting** | **Arweave-native, via a flat path manifest.** Deploy uploads `website/**` to Arweave and publishes a `arweave/paths` manifest whose `index` is `index.html`. The manifest is reached at `https://arweave.net/{manifestId}/` — **each deploy = a NEW manifestId.** **Current live domain mechanism (confirmed, "fine for now"):** GoDaddy forwards `undergroundexistence.info` → a **specific `arweave.net/{manifestId}/` URL**, so **every deploy requires manually updating the GoDaddy forward to the new manifestId.** The deploy also repoints the ArNS name `undergroundexistence` (ANT `tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw`), but the public domain does **not** rely on ArNS today. Redesign keeps this pipeline unchanged. **Known future fix (not in scope, worth flagging):** repoint the GoDaddy forward at the stable ArNS/gateway name so deploys stop needing manual GoDaddy edits. |

---

## 3. Design system (extracted from the mockups)

The master plan should formalize these into tokens. Values below are read from the mockups — treat as the intended direction, refine exact hex during implementation.

**Palette**
- Base: warm near-black (`~#0a0606`), with slightly lifted panel/card backgrounds (`~#140d0d`).
- Accent: oxblood / crimson red (`~#c1121f`–`#e01e2b`) — used for the artist signature, active nav underline, play buttons, artist names, waveform "played" portion, hairline dividers.
- Text: white / off-white primary; muted warm-grey secondary (metadata).
- Imagery: red-lit, high-contrast B&W-leaning artist photography (matches the existing mix cover art aesthetic).

**Typography** (some already in the repo under `website/fonts/`)
- **Mono / typewriter** — wordmark, nav, eyebrows ("FEATURED MIX", "LATEST MIXES"), metadata, numbers. (IBM Plex Mono / Rationale are already referenced in the repo.)
- **Slab / heavy display serif** — mix titles (`Mixtapes From Chicago 072`). Typewriter-slab feel.
- **Handwritten script** — artist signature (`Bai-ee`) in red. Signature accent only, not body.
- All fonts must be **self-hosted under `website/fonts/`** and referenced with root-relative paths (Arweave has no external CDN guarantee, and the manifest is flat — see Invariant #2). Do not use Google Fonts `<link>` CDN.

**Signature motifs (the brand)**
- Torn-paper collage edges on the hero image frame.
- Barcode "receipt/ticket" tag element (`UE.INFO · BP: 072`, "Hosted on Arweave", "Est. 2007"). This is the identity — carry it through.
- Rounded-rectangle framed hero with a thin red border glow.
- Globe/Arweave glyph on the ticket.

**Components to build**
1. **Top nav** — wordmark left; MIXES / RESIDENTS / ARCHIVE / ABOUT + search right (desktop); wordmark + search + hamburger (mobile). Note: RESIDENTS / ARCHIVE / ABOUT are new IA — see §6 for how they map (or don't) to current data.
2. **Featured Mix hero** — collaged artist photo + receipt tag; eyebrow; slab title; script artist signature; icon metadata row (genre • genre • ⏱ duration • 📅 date); large circular play button; **progress waveform** + time readout (`32:18 / 78:00`).
3. **Latest Mixes row** — numbered cards (071, 070, …): cover image, number overlay, title, red artist name, genre tags, ⏱ duration + 📅 date, circular play button. "VIEW ALL" link. Desktop shows ~6 across; mobile shows ~3 with horizontal scroll or stack.
4. **Persistent bottom player bar** — thumbnail + title/artist; transport (shuffle / prev / play-pause / next / repeat); mini progress waveform + time; volume (desktop); overflow menu. Mobile collapses to thumbnail + title + play/pause + waveform + volume + menu.
5. Responsive: the two mockups define desktop and mobile. Tablet interpolates.

**Motion** — subtle. Card hover lift, play-button states, a restrained load-in. GSAP is already vendored; keep motion tasteful, not the current heavy stagger.

---

## 4. HARD CONTRACT — do not break

The redesign must keep feeding the exact same pipeline. These are the seams. Breaking any of them breaks upload-to-deploy.

### 4.1 Data source of truth
- Firestore **`system/artists`** doc, field `artists` = array of artist objects. Writers overwrite the whole array (`{ merge: false }`). `website/artists.json` is a **generated artifact**, regenerated every deploy — never hand-edit it as source of truth.
- Fields the deploy pipeline actually consumes (everything else in Firestore is ignored by the website):
  - Artist: `artistName`, `artistFilename`, `artistImageFilename`, `artistGenre`, `mixes[]`.
  - Mix: `mixTitle`, `mixArweaveURL`, `mixDateYear`, `mixDuration`, `mixImageFilename`.
- ⚠️ `trax[]` and `artistThumbnails[]` exist in Firestore but are **NOT currently synced to the site** (`lib/WebsiteSync.js`). If the redesign wants to surface tracks or multiple images, the plan must extend `WebsiteSync.js` — flag it as an explicit change, don't assume it's available.

### 4.2 The deploy pipeline (4 steps, unchanged order)
`POST /api/deploy-website` (`api/deploy-website.js`) runs:
1. `syncFirebaseToWebsiteJSON()` → writes `website/artists.json` from `system/artists`.
2. `WebsitePageGenerator.cjs → generatePages(artistsJsonPath, outputDir)` → regenerates per-artist HTML + rewrites `index.html`.
3. `deployWebsiteToArweave()` → incremental hash-diff upload (ArDrive Turbo) + build path manifest.
4. `updateArNSRecord(manifestId)` → repoint `undergroundexistence.ar.io` (non-blocking).

The redesign changes **what step 2 produces** (templates + generator output) and **the static assets** — it must not change the shape of steps 1, 3, 4 or the endpoints.

### 4.3 Generator ↔ template coupling
The generator is string-replacement + Cheerio DOM mutation (no framework), in **`lib/WebsitePageGenerator.cjs`** (the `.cjs` is the one the deploy loads; `lib/WebsitePageGenerator.js` is a stale duplicate — consolidate, but the `.cjs` is authoritative). It depends on these exact conventions. Any redesigned template must preserve them **or** the generator must be rewritten in lockstep:
- **Placeholder tokens** in `website/templates/artist.html`: `[ARTIST_NAME]`, `[ARTIST_COVER]`, `[MIX_COUNT]`, and the playlist fence `<!-- [PLAYLIST_ITEMS] --> … <!-- end playlist -->`.
- **`index.html` regeneration** uses Cheerio selectors `.row.row--grid.fadeIn` (artist grid) and `ul.main__list` (featured tracks). If you restructure `index.html`, update these selectors in the generator or regeneration silently no-ops.
- Per-artist output filename = `artist.artistFilename`; artist pages emit to `website/{artistFilename}`.

**Recommendation for the plan:** rewrite `WebsitePageGenerator.cjs` and the templates **together** as one phase, keeping `artists.json` as the stable data interface. This is cleaner than trying to preserve legacy selectors inside a new design. Decide token-based vs. a small template helper — but keep the generator dependency-light (it runs in a Vercel serverless function).

### 4.4 Player data attributes
The audio player (Plyr today) is driven by DOM data attributes the generator emits: `data-playlist` / `data-link` plus `data-title`, `data-artist`, `data-img`, and `href` = the mix audio URL. If you replace the player, reproduce an equivalent data contract in both the generated markup and the new player JS. Audio `src` comes straight from `mixArweaveURL`.

### 4.5 Arweave / Vercel constraints
1. **Flat, root-relative, host-agnostic paths.** The Arweave manifest is path-flat AND the site is reached under multiple hostnames/base paths (raw `arweave.net/{manifestId}/`, the ArNS name, and the forwarded `undergroundexistence.info`). Therefore:
   - Every asset ref (CSS/JS/img/fonts) must be **root-relative** (`css/…`, `js/…`, `img/…`, `fonts/…`) — never `../`, never absolute CDN URLs. The generator's `fixPathsForArweave()` strips `../`; keep this.
   - Every internal page link (nav, cards, artist pages) must also be **relative** (`acidman.html`, not `https://…/acidman.html`) so links resolve whether served from `arweave.net/{id}/`, ArNS, or the forwarded domain.
   - Do **not** hardcode an absolute canonical hostname anywhere it would go stale: `<link rel="canonical">`, `og:url`, and any JS that reads `location.origin` must tolerate all three hosts. If a canonical/OG absolute URL is required, prefer the stable public domain (`https://undergroundexistence.info`) over a per-deploy `arweave.net/{manifestId}` URL. Note current `index.html` hardcodes an `og:image` Arweave URL — replace stale absolutes.
   - `index.html` MUST remain the manifest index (the manifest's `index` field). Don't rename or nest the homepage.
2. **What gets uploaded:** `WebsiteDeployer.collectWebsiteFiles()` walks `website/`, keeps web extensions, and ignores `node_modules/`, `.git/`, `scripts/`, `templates/`, `data/`, `archive`, `active`, `tasks`, `*.md`. `artists.json` is intentionally included. New folders under `website/` you do NOT want on Arweave must be added to that ignore list.
3. **Vercel Hobby: max 12 serverless functions**, route multiplexing in `vercel.json` must stay intact. The redesign should not add API functions. `deploy-website` has `includeFiles: "website/**/*"` and `maxDuration: 300` — keep.
4. **Deploy runs in `/tmp/website` on Vercel** (read-only rootfs); missing critical logo assets are pulled from Firebase Storage `logos/` at deploy time. If the redesign introduces new always-required binary assets (e.g. a hero image, fonts), decide whether they live committed in `website/` or are fetched at deploy — and update the critical-file checks in `deploy-website.js` / `WebsiteDeployer.js` accordingly.
5. **Mix audio gateway:** serve mixes from `arweave.net` (plays). Do NOT route mix audio through `ar-io.dev` or other metered gateways — they `402` the open-ended `Range: bytes=0-` a player sends to start, so mixes won't play. (See `MIX_AUDIO_SCRUBBING.md`.)

### 4.6 Endpoints that must keep working (used by the admin app)
No signature changes:
- `POST /api/upload` (dual-mode: JSON audio upload + multipart image upload).
- `GET /api/deploy-website?estimate=true` (cost) and `POST /api/deploy-website` (deploy).
- `GET /api/artists` and `GET /api/artists?artist=NAME`.

---

## 5. Content preservation (mirror everything)

- **All existing artists and mixes must appear** in the new site — nothing removed. Current data: **~15 artists, ~42 mixes** (BAI-EE alone has 15). Because the site is generated from `system/artists`, faithfully rendering that data = content is mirrored automatically. The plan's job is to make sure the new templates render every field and don't drop artists/mixes.
- **Artist images may be elevated/replaced, never removed.** Upgrading imagery is welcome (higher-res, consistent red-lit treatment). Removing an artist's representation is not allowed.
- **Extra HTML pages exist with no `artists.json` entry** (`bernardbadie.html`, `jevonjackson.html`, `lorelei.html`, `skyway.html`) — reconcile: either backfill their data into `system/artists` or intentionally drop them. Flag in the plan.

### 5.1 Data quality to reconcile (call out in the plan; don't silently "fix")
- `mixDateYear` is wildly inconsistent (`"'09"`, `"6/24"`, `"Circa 2009"`, `"20??"`, `"2024h"`). The mockups show clean dates (`MAY 24, 2026`). Decide a display normalization strategy (render-time formatting) without destroying source data.
- `mixDuration` inconsistent (`"60:00"`, `"60"`, `"0:00"`). Normalize for display.
- One malformed `artistFilename`: `"VIVA ACID"` → `"Viva Acid"` (no `.html`).
- One broken audio URL: Chicago Skyway "For Hakim" points at an ArDrive **viewer** link, not a data tx.
- Image hosts are mixed (`arweave.net` apex, base32 sandbox subdomains, `ardrive.net`/`.io`; some whole-file txs, some manifest sub-paths). Consider normalizing into one media model.
- Two competing schemas exist in-repo: the live flat shape vs. the richer `website/data/schema.json` (bio, social links, genre, download_url) which is **unused**. The mockups imply richer per-mix metadata (genre tags, dates) — decide whether to adopt more fields, which means extending `WebsiteSync.js` + the admin write path. Flag as scope.

---

## 6. New IA vs. current data (gaps to resolve in the plan)

The nav introduces **MIXES / RESIDENTS / ARCHIVE / ABOUT**. Current site is essentially a homepage + per-artist pages. Map them:
- **MIXES** — the main mix index (maps to today's homepage grid / featured list). Clear.
- **RESIDENTS** — artist directory (maps to artists). The per-artist page already exists; "Residents" is the collection view. The mockups only show a mix-centric homepage, so the plan must define Residents + artist-page layouts consistent with the design language.
- **ARCHIVE** — likely the full/older mix catalog. Needs definition (is it just "all mixes" vs. "latest"?). The repo has an unrelated `archiveJobs`/`archiveManifest` concept for Arweave mix archiving — do NOT conflate; clarify.
- **ABOUT** — static content (UE story, "Est. 2007", "Hosted on Arweave", contribute link — the current footer already has a Google-Form "Contribute Here" link to preserve).
- **Numbered mixes (071, 070…)** — the mockups number mixes as a running catalog. Current data has no stable mix number/ID. Decide: derive numbering at render time (by date order) vs. add a real field. Note the risk of render-time numbering shifting as mixes are added.

These are the main design-completeness gaps — the mockups define the MIXES/home view richly but leave Residents/Archive/About/artist-detail to be designed in the same system.

---

## 7. Known issues / gotchas (inherited)

- **Per-deploy manual step (current reality):** because the GoDaddy forward targets a fixed `arweave.net/{manifestId}/` URL, **after every deploy someone must copy the new manifestId from the deploy result and update the GoDaddy domain forward** — otherwise `undergroundexistence.info` keeps showing the old site. The deploy modal returns the new manifestId/URL. This is the operational cost of the current setup; "fine for now" per owner, flagged for the future fix (point the forward at the ArNS name instead).
- **ArNS repoint runs but is currently flaky and NOT in the live domain path today.** Deploy step 4 repoints ArNS `undergroundexistence`, but recent deploys reported "ArNS update was not successful" (step 4 is non-blocking, so failures are silent). Since the public domain currently rides the manual GoDaddy forward, a failed ArNS update doesn't break the live site today — but ArNS is the intended path for the future fix, so the plan should still verify/repair it (likely `ARNS_NAME`/`ARNS_ANT_PROCESS_ID` config on Vercel) if/when switching the forward to ArNS.
- **Missing local assets:** `website/img/` is essentially empty; logos are pulled from Firebase Storage `logos/` at deploy, artist/cover art is served from absolute Arweave URLs baked into `artists.json`. The redesign's new static assets (fonts, hero collage textures, icons) need a deliberate home.
- **Latent bug:** `api/upload.js` references `updateArtistImage(...)` which has no definition — pre-existing, in the admin path, out of scope but note it.
- **Vendor bloat:** current site loads jQuery, owl.carousel, select2, magnific-popup, inputmask, paymentfont, GSAP suite. A modern rebuild can drop most of this. Keep only what the new player/motion needs.
- **Dead files:** `lib/WebsitePageGenerator.js` (duplicate of `.cjs`), `website/active/`, `website/archive/`, `index-old.html`, `index-trading-backup.html`. Safe to ignore/remove during the rebuild.

---

## 8. What the master plan must deliver

Produce a phased plan (respect phase discipline — one phase at a time, stop for approval). At minimum it should cover:

1. **Design tokens + asset prep** — finalize palette/type/spacing tokens; self-host fonts; produce the collage/receipt/barcode assets; set up the new CSS (single stylesheet, no vendor grab-bag).
2. **Template + generator rewrite** — new `artist.html` template + new `index.html` structure, rewritten `WebsitePageGenerator.cjs` producing them from `artists.json`, preserving the data interface and flat Arweave paths. Verify token/selector coupling is intentionally replaced, not accidentally broken.
3. **Player rebuild** — waveform (progress-only, no seek), featured hero player, persistent bottom bar, playlist next/prev/auto-advance; audio `src` from `mixArweaveURL` on `arweave.net`.
4. **New IA pages** — Residents / Archive / About / artist-detail in the design system; resolve the numbering + data-gap questions from §6.
5. **Content reconciliation** — mirror all artists/mixes; normalize display of dates/durations; fix the malformed filename + broken URL; decide on orphan pages; image normalization.
6. **Deploy verification** — run the full `POST /api/deploy-website` path (locally first via `updateOnly`, then a real deploy); confirm every artist/mix renders and all assets + internal links resolve on the raw `arweave.net/{manifestId}/` URL (host-agnostic, flat paths). Then perform the **per-deploy manual step**: update the GoDaddy forward `undergroundexistence.info` → the new `arweave.net/{manifestId}/`, and confirm the live domain shows the new site. Confirm the admin upload → auto-deploy flow still works end to end.

Each phase: state files touched, what changed, what stayed untouched, how it was verified.

---

## 9. Guardrails summary (the "never" list)

- Never change the `system/artists` shape or the `merge:false` whole-array write.
- Never break `POST /api/upload`, `GET/POST /api/deploy-website`, `GET /api/artists`.
- Never hand-edit `artists.json` as if it were source of truth (it's regenerated).
- Never use absolute CDN URLs for CSS/JS/fonts, and never hardcode an absolute site hostname in internal links / canonical / `og:url` (site is served flat under 3 hosts: `arweave.net/{manifestId}/`, ArNS, and the forwarded `.info`). Root-relative assets, relative page links, host-agnostic markup only.
- Never rename or nest the homepage — `index.html` must stay the manifest `index`.
- Never assume the public domain auto-updates — the GoDaddy forward currently targets a fixed `arweave.net/{manifestId}/`, so **each deploy requires manually updating the GoDaddy forward to the new manifestId** (until it's switched to the ArNS name).
- Never route mix audio through `ar-io.dev`/metered gateways (402 on start).
- Never exceed 12 Vercel functions or break `vercel.json` route multiplexing / `includeFiles`.
- Never remove an artist or their representation; elevate images, don't delete.
- Never put redesign scratch/mockup files under `website/` (they'd deploy to Arweave and cost permaweb spend).
- Never touch the admin app (`public/index.html`) or the FFmpeg video worker as part of this redesign.
