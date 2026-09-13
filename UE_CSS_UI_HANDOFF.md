# Underground Existence — CSS / UI handoff

**Purpose:** entry point for a thread focused on the **visual/CSS layer**. Everything below is
as-built and verified on 2026-09-13. The audio, thumbnail-generation and deploy work is finished and
documented separately in [`UE_RELEASE_HANDOFF.md`](UE_RELEASE_HANDOFF.md) — you should not need to
touch any of it.

---

## 1. Where things stand

| | |
|---|---|
| Release commits | `bce0b26` (site + player + thumbnails), `5770d01` (thumbnail regrade), plus two docs commits |
| Latest manifest | **`4R6eLhJ1PtAncF3Zu_vIehynWCWQYde_VCW0R-wO4WQ`** — 52 files, verified live |
| Earlier manifest this session | `sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw` |
| Tests | **695 pass / 0 fail** (`npm test`) |
| Working tree | clean except three deliberately-unstaged dirs: `design-refs/`, `docs/`, `scripts/audit/` |
| Commits pushed? | **No.** All local. See §9. |

⚠️ **The public domain does not show any of this yet.** `undergroundexistence.info` is a GoDaddy
forward and still 302s to `…/Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc/index.html` — the
*pre-release* site. Nothing you do to the CSS will appear on the public domain until that forward is
repointed (owner action; no GoDaddy credentials exist in this repo). Until then, **review your work
at the manifest URL**, not at the domain.

---

## 2. The UI file map

```
website/
  templates/                 ← EDIT THESE, not the generated pages
    index.html                 homepage (featured hero + latest mixes)
    archive.html               full catalog list
    residents.html             selector/artist grid
    about.html                 about + flyers
    artist.html                per-artist detail page
    partials/
      head.html                <head>, meta, canonical/og, font preload
      nav.html                 header + mobile menu + search toggles
      player-bar.html          persistent bottom player bar
      search-overlay.html      full-screen search
      footer.html              footer
      icons.html               inline SVG sprite (<symbol id="i-…">)
  css/site.css               ← the ENTIRE stylesheet, 1297 lines, no build step
  fonts/                     6 self-hosted woff2 (see §4)
  img/                       brand imagery + flyers
  *.html                     GENERATED — never hand-edit, they are overwritten
lib/WebsitePageGenerator.cjs ← builds the card/row markup (see §3)
```

**Generated pages are disposable.** `website/index.html`, `archive.html`, `about.html`,
`residents.html` and the 18 artist pages are all produced from `website/templates/**`. Editing them
directly is always wrong — the next regeneration silently discards it.

---

## 3. How a page is built (and where the markup you want to restyle actually lives)

`lib/WebsitePageGenerator.cjs` → `generatePages(artistsJsonPath, outputDir)`:

1. Reads `website/artists.json` (synced from Firestore).
2. Loads `templates/partials/*.html` into a map.
3. Renders each template: `{{> partial}}` includes first, then `{{TOKEN}}` substitution.
4. Rewrites `../` → `` so output is root-relative (see §6).

**Template tokens by page:**

| Template | Tokens |
|---|---|
| `index.html` | `FEATURED_TITLE` `FEATURED_ARTIST` `FEATURED_IMAGE` `FEATURED_IMG_URL` `FEATURED_AUDIO_URL` `FEATURED_GENRE` `FEATURED_DURATION_*` `FEATURED_DATE_CHIP` `FEATURED_ARTIST_PAGE` `LATEST_MIX_CARDS` |
| `archive.html` | `ARCHIVE_ROWS` `MIX_TOTAL` |
| `residents.html` | `RESIDENT_CARDS` `ARTIST_TOTAL` `MIX_TOTAL` |
| `artist.html` | `ARTIST_NAME` `ARTIST_IMAGE` `ARTIST_GENRE` `ARTIST_SIGNATURE` `ARTIST_MIX_ROWS` `MIX_COUNT` `MIX_COUNT_LABEL` |
| `about.html` | `ARTIST_TOTAL` `MIX_TOTAL` |

⚠️ **The repeating UI — mix cards, catalog rows, resident cards — is NOT in the templates.** It is
built as HTML strings in `lib/WebsitePageGenerator.cjs`:

| Function | Produces | Line |
|---|---|---|
| `mixCardHtml(entry)` | `.mix-card` (homepage grid) | ~307 |
| `catalogRowHtml(entry)` | `.catalog-row` (archive + artist pages) | ~334 |
| `residentCardHtml(artist, n)` | `.resident-card` | ~355 |
| `imageHtml(url, alt, initials, eager, dims)` | every `<img>` + `.cover-fallback` | ~255 |
| `metaChips(entry, withGenre)` | `.meta-chip` | ~291 |
| `downloadBtnHtml(entry, small)` | `.download-btn` | ~282 |

So: change card/row **structure or classes** in the generator; change card/row **styling** in
`site.css`. Both then require a regeneration (§7).

---

## 4. CSS architecture

Single file, no preprocessor, no build step: `website/css/site.css` (1297 lines). Ordered sections,
each with a banner comment:

`Fonts` (7) · `Tokens` (51) · `Reset/base` (79) · `Header/nav` (139) · `Eyebrows/headings` (239) ·
`Featured hero` (272) · `Mix cards` (445) · `Catalog rows` (604) · `Residents grid` (682) ·
`Page headers` (739) · `About` (817) · `Footer` (888) · `Persistent player bar` (934) ·
`Search overlay` (1061) · `Motion` (1120) · `Playback status/retry` (1128) · `Cold-start
affordance` (1277)

**Design tokens** (`:root`, line 51) — use these rather than raw values:

```css
--bg-base:#0a0606  --bg-panel:#140d0d  --bg-card:#150e0e  --bg-elevated:#1c1212
--accent:#c1121f   --accent-bright:#e01e2b  --accent-dim:#7a0e16
--paper:#e8e0d0    --paper-ink:#2a231c
--text-primary:#f2ece4  --text-secondary:#b7aaa3  --text-muted:#8a7d77
--hairline:rgba(255,255,255,.08)  --hairline-red:rgba(193,18,31,.45)
--font-mono:'IBM Plex Mono'  --font-body:'Rationale'
--font-display:'Special Elite'  --font-script:'Gately'
--radius-card:12px  --radius-frame:16px
--player-bar-height:84px  --page-max:1560px  --page-pad:clamp(16px,4vw,56px)
--ease-out-expo:cubic-bezier(.16,1,.3,1)
```

**Fonts** — 6 self-hosted woff2 in `website/fonts/`, all referenced by `site.css`:
`gately-v1-regular`, `rationale-v1-regular`, `special-elite-v20-latin-regular`,
`ibm-plex-mono-v20-latin-{regular,500,700}`. Only `rationale` is `<link rel=preload>`ed (in
`partials/head.html`). **No external font CDN** — see §6.

**Breakpoints in use** (no formal scale; these are the ones that exist):
1500 · 1400 · 1020 · 900 · 860 · 760 · 700 · 640 · 540, plus `prefers-reduced-motion` at 1123/1265.
The grids step independently:

```
.mix-card-grid   5→4 (1500) →3 (1020) →2 (760) →1 (540)
#residents-grid  5→4 (1400) →3 (1020) →2 (640)
```

Consolidating this into a token-driven scale is a legitimate piece of work; just do it deliberately,
because the numbers are currently tuned per-component.

---

## 5. UI that is NOT in site.css (important)

Three runtime modules **inject their own `<style>` block and their own DOM** at runtime. You will not
find these rules in `site.css`, and editing `site.css` will not restyle them:

| Module | Injects | Class prefix |
|---|---|---|
| `website/js/ue-links.js` | deep-link banner, share buttons, share popover, manual-copy panel, a11y announcer | `.ue-links-*` |
| `website/js/ue-resume.js` | "Resume … at 12:34" bar | `.ue-resume-*` |
| `website/js/ue-mediasession.js` | no DOM (OS media metadata only) | — |

Known class names: `ue-links-banner`, `-banner-text`, `-banner-actions`, `-banner-play`,
`-banner-dismiss`, `-deep-link-highlight`, `-highlight-pulse`, `-share-btn`, `-icon-btn`,
`-icon-svg`, `-popover`, `-popover-item`, `-player-bar-share`, `-player-bar-popover`,
`-manual-copy-panel/-input/-close`, `-visually-hidden`; `ue-resume-bar`, `-actions`,
`-dismiss-button`.

**If you want these to use the design tokens, that is a real and worthwhile task** — currently they
carry hardcoded colors inside the JS. Decide explicitly whether to (a) move their CSS into
`site.css`, or (b) keep them self-contained so they stay drop-in. Either is defensible; don't do it
by accident.

---

## 6. Hard constraints — break these and the live site breaks

1. **Host-agnostic paths.** The site is served from three different hosts: the raw
   `arweave.net/{manifestId}/`, a sandbox subdomain it redirects to, and the forwarded domain.
   - Asset/link paths must be **relative** (`css/site.css`, `akila.html`), never root-absolute
     (`/css/site.css`) and never an absolute hostname.
   - The generator enforces part of this by rewriting `../` → `` at render time.
   - `canonical`/`og:url` in `partials/head.html` are intentionally pinned to the stable
     `undergroundexistence.info` domain. That is correct — leave it.
2. **No external CDN for fonts, CSS or JS.** Everything ships inside the manifest. Adding a Google
   Fonts link would work locally and then be a permanent broken dependency on a permaweb page.
3. **`data-*` attributes are player hooks, not styling hooks.** The player reads
   `data-title`, `data-artist`, `data-img`, `data-filename`, `data-duration-sec`, `data-unplayable`,
   `data-queue-idx`, `data-mix-number`, `data-fallback-initial`. Renaming or dropping any of these
   from the generator silently breaks playback. Style with classes.
4. **Required manifest paths are enforced and will fail the deploy.** `REQUIRED_MANIFEST_PATHS` in
   `lib/WebsiteDeployer.js` lists **23** paths (core pages, `artists.json`, `css/site.css`, all 8
   runtime JS files, all 6 fonts, brand images). If you **add** a stylesheet, font or image that pages depend on, add it to
   that list and to `.gitignore`'s allow-list — otherwise a Vercel-packaged deploy ships without it.
   `tests/deploy-manifest-coverage.test.mjs` covers this.
5. **`website/img/**` and `website/fonts/**` are git-ignored by default** with explicit `!` negations
   for the files actually used. A new image that isn't negated will not be committed.
6. **Don't hand-edit generated pages** (§2) and don't edit `website/artists.json` by hand — it is
   synced from Firestore.

---

## 7. Working loop

```bash
cd /Users/bballi/Documents/Repos/EditVideos/arweave-video-generator

# 1. edit website/templates/**, website/css/site.css, or the markup builders in
#    lib/WebsitePageGenerator.cjs

# 2. regenerate the static pages (syncs Firestore → artists.json, then renders; no upload, no AR)
node outputs/release-tmp/run-deploy.mjs --update-only

# 3. preview
cd website && python3 -m http.server 8123     # → http://localhost:8123/index.html

# 4. tests
npm test                                       # expect 695 pass / 0 fail

# 5. deploy (SPENDS AR — small: last deploy was 0.000096 AR)
node outputs/release-tmp/run-deploy.mjs
```

`outputs/release-tmp/run-deploy.mjs` drives the real `/api/deploy-website` handler locally with a
mock req/res. It is deliberately **not committed** (it lives under the git-ignored `outputs/`), so if
it is missing, recreate it or call `deployWebsiteToArweave` directly — see
`UE_RELEASE_HANDOFF.md` §6.

A fresh manifest takes **~5–8 minutes** to resolve on `arweave.net` after upload; a 404 immediately
after deploying is normal propagation, not a failure.

Pages to check every time: `index.html`, `archive.html`, `residents.html`, `about.html`, and at least
two artist pages (`baiee.html` has 15 mixes and both thumbnail types; `lorelei.html` has 1).

---

## 8. Known UI issues and open opportunities

Ordered by how concrete they are. None are blocking.

1. **The motion layer is entirely inert.** `site.css` line 1120 says "GSAP adds `.motion-ready`;
   CSS handles fallback" — but **no page loads GSAP**, nothing ever sets `.motion-ready`, and
   `.motion-item` is a static `opacity: 1`. `js/gsap.min.js` ships in the manifest (~unused weight).
   Decide: wire up motion properly, or delete the dead file and the stale comment. Right now the
   site has no entrance/scroll motion at all.
2. **The deep-link banner does not auto-clear after "Play from".** Documented as clearing in
   `UE_PLAYABILITY_HANDOFF.md` §5; it does not. Dismiss works and playback is unaffected — cosmetic,
   but it's a real bug in `ue-links.js`.
3. **Mobile has never been checked on a real device.** All responsive verification was desktop
   Chrome at simulated widths. The ≤540px single-column path and the player bar
   (`--player-bar-height: 84px`) deserve a real phone pass.
4. **Runtime-injected UI doesn't use the design tokens** (§5) — visually consistent today, but it
   will drift the first time a token changes.
5. **Breakpoints are per-component, not systematic** (§4).
6. **Very dark thumbnails read as near-flat at 64px** in archive rows. Measured mean luminance across
   the set is 56/255 by design (it matches the site's language), and the images are correct at card
   size — but if archive rows feel muddy, that's the cause, and the fix is a UI one (larger row
   thumbs, or a subtle border/contrast lift on `.catalog-row-cover`), **not** a re-render of the
   thumbnails.
7. **5 orphan images ship** (`img/artists/{bernardbadie,jevonjackson,lorelei,vivaacid}.jpg`,
   `img/digging.jpg`) — referenced by nothing. Safe to delete if you want the manifest tidy.

---

## 9. Do not touch from a CSS/UI thread

These are finished, verified, and expensive to break:

- `website/js/player-core.js`, `player.js`, `boot.js`, `ue-warm.js`, `ue-host-pref.js` — audio
  reliability, gateway failover and seeking. Verified live (play/seek/resume/share). In particular
  **never reintroduce raw `arweave.net` as an audio candidate**: it returns 200 and ignores Range,
  which breaks seeking. `RANGE_HOSTS` (player-core.js:41) is deliberate.
- The skyline thumbnail pipeline: `lib/skyline/**`, `lib/SkylineAssignmentStore.js`,
  `worker/lib/SkylineThumbnailService.js`, `scripts/skyline-thumbnails.mjs`,
  `config/skyline-thumbnail-*.json`. The 32 thumbnails are applied in production.
- `lib/WebsiteDeployer.js` required-path gate — unless you are *adding* a required asset (§6.4).
- `.env.local` (untracked, holds live credentials).

**Two outstanding owner actions carried over — not CSS work, but don't let them get lost:**

1. ⚠️ **The Arweave deploy wallet's private key is in public git history**
   (commits `0f9120c`, `946a140`; repo is public). It holds ~6.07 AR + Turbo credits and signs the
   ArNS ANT. Needs rotation independently of any UI work. Full detail: `UE_RELEASE_HANDOFF.md` §1a.
2. **The GoDaddy forward still points at the pre-release manifest** (§1). Repoint to
   `https://arweave.net/4R6eLhJ1PtAncF3Zu_vIehynWCWQYde_VCW0R-wO4WQ/index.html`.

Because of (1), **the release commits were deliberately left unpushed** — push order is an owner
decision. `git push origin main` when ready.

---

## 10. Quick reference

```bash
npm test                                              # 695 pass / 0 fail
node outputs/release-tmp/run-deploy.mjs --update-only  # regenerate pages only
node outputs/release-tmp/run-deploy.mjs                # full deploy → new manifest
cd website && python3 -m http.server 8123             # local preview

git log --oneline -5                                  # this session's commits
```

| Doc | What's in it |
|---|---|
| `UE_CSS_UI_HANDOFF.md` | **this file** — UI/CSS entry point |
| `UE_RELEASE_HANDOFF.md` | full release record: gates, security, deploy, verification, regrade |
| `WEBSITE_REDESIGN_BRIEF.md` | the original design brief and hosting constraints |
| `UE_PLAYABILITY_HANDOFF.md` | Media Session / deep links / share / resume architecture |
| `MIX_AUDIO_SCRUBBING.md` | why seeking needs range gateways |
| `SKYLINE_THUMBNAIL_CONTRACT.md` | frozen thumbnail-pipeline interfaces |
