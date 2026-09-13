# Website Redesign — Implementation Notes (2026-07-03)

Companion to `WEBSITE_REDESIGN_BRIEF.md` (the frozen brief). This documents what was
built and the NEW generator ↔ template contract that replaces the legacy one in
brief §4.3. The pipeline shape (sync → generate → deploy → ArNS) is unchanged.

## What exists now

- **Templates** — `website/templates/{index,artist,residents,archive,about}.html`
  with `website/templates/partials/{head,icons,nav,footer,player-bar,search-overlay}.html`.
  Syntax: `{{TOKEN}}` replacements + `{{> partial}}` includes (one level, no nesting).
  Unfilled tokens log a warning and render empty — treat warnings as failures.
- **Generator** — `lib/WebsitePageGenerator.cjs`, dependency-free (no Cheerio).
  `generatePages(artistsJsonPath, outputDir)` regenerates ALL pages from
  `artists.json` (index, residents, archive, about, one page per artist).
  Same call signature/return shape as before; `deploy-website.js` unchanged.
- **CSS** — single stylesheet `website/css/site.css` (design tokens at top).
  All vendor CSS deleted.
- **JS** — `website/js/player.js` (custom player) + `website/js/gsap.min.js`
  (restrained load-in only). All other vendor JS deleted.
- **Fonts** — self-hosted woff2 under `website/fonts/`: IBM Plex Mono
  (mono/nav/meta), Special Elite (display titles), Gately (script signatures).
  IBM Plex Mono/Special Elite are OFL/Apache licensed; Gately license not verified.
- **Brand assets** — torn paper collage corners and the receipt/barcode ticket
  were removed post-launch (both were inline SVG/CSS partials, no binary images).

## Player data contract (unchanged from brief §4.4)

Generated playable items are anchors:
`<a data-playlist data-title data-artist data-img data-duration-sec href="AUDIO_URL">`.
`player.js` builds its queue from these in DOM order; the adjacent
`.play-circle` button inside the same `.mix-card`/`.catalog-row` is wired to the
same queue index at init. Waveform is canvas, progress-only — **no seek handlers
by design** (arweave.net ignores Range; see `MIX_AUDIO_SCRUBBING.md`).
`data-unplayable="true"` items (invalid tx URLs) are excluded from the queue and
render an "Offline" chip.

## Render-time normalization (source data untouched)

- **Dates** (`mixDateYear`): parses `'09`, `6/24`, `7/18/25`, `2024h`,
  `Circa 2009`, `Circe '95`; `??`/`20??` → no chip. Unknown dates sort oldest.
- **Durations** (`mixDuration`): `h:mm` when leading number ≤ 10, else `mm:ss`;
  bare number = minutes; `0:00` → chip omitted.
- **Audio URLs**: normalized to `arweave.net/{txid}`; ardrive.net sandbox hosts
  re-pointed; viewer links / short tx ids → unplayable.
- **Catalog numbers**: ascending from oldest (001…) across all mixes, ties by
  artist → title → URL. Appending new dated mixes never renumbers old ones.
- **Featured mix** (homepage hero): newest playable mix that has artwork.
- **artistFilename** without `.html` is slugified defensively at render time.

## Deployer changes (`lib/WebsiteDeployer.js`)

- Ignore patterns are **anchored** (`/^archive(\/|$)/`, `/^active…/`, `/^data…/`,
  `/^scripts…/`, `/^templates…/`, `/^v1…/`). Do NOT revert to unanchored — the
  old `/archive/` pattern silently excluded the new `archive.html` page.
- Critical-file checks now cover `css/site.css`, `js/player.js`, and the three
  font files (also mirrored in `api/deploy-website.js`; the Firebase logos/
  download fallback is vestigial — all assets are committed).

## Data notes (Firestore `system/artists`, reconciled 2026-07-03)

- 18 artists / 45 mixes. Backfilled from orphan pages: LORELEI, JEVON JACKSON,
  BERNARD BADIE (no images yet — site renders initials fallback tiles; upload
  real photos via the admin app when available).
- Known ambiguity: Bernard Badie "Live at UE (B2B Sean Smith)" shares its tx
  with Blue Jay "Live at Studio409 New York (2024)" — one is mislabeled.
- Known broken: BAI-EE "HPIT Promo Mix" tx id is truncated → renders Offline.
- `skyway.html` (old orphan duplicating Josh Zeitler content with no audio URL)
  was intentionally dropped.

## Per-deploy manual step (unchanged)

After every deploy, update the GoDaddy forward for `undergroundexistence.info`
to the new `https://arweave.net/{manifestId}/`. ArNS repoint still errors
(405 from the AO CU endpoint) — non-blocking, not in the live domain path.
