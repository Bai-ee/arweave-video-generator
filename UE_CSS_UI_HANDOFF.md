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
| Themes | **two.** Dark (oxblood on near-black) is the default; light (warm ink on paper, **dark chrome**, oxblood type) is opt-in. Contract in §6 |
| Tests | **716 pass / 0 fail** (`npm test`) — was 695 before this session; +13 cover the transient-UI rework (prime/dialog/load-order), +8 the handwritten artist mark (§4a). **None cover the theme** (§6) |
| Working tree | `design-refs/`, `docs/`, `scripts/audit/` deliberately unstaged — **plus the light-theme and transient-UI work, all uncommitted**: `css/site.css`, `js/{player,ue-links,ue-resume}.js`, the 5 page templates, `templates/partials/{head,nav,icons}.html`, the new untracked `templates/partials/modal.html`, and the regenerated pages |
| Commits pushed? | **No.** All local. See §10. |

⚠️ **The public domain does not show any of this yet.** `undergroundexistence.info` is a GoDaddy
forward and still 302s to `…/Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc/index.html` — the
*pre-release* site. Nothing you do to the CSS will appear on the public domain until that forward is
repointed (owner action; no GoDaddy credentials exist in this repo). Until then, **review your work
at the manifest URL**, not at the domain.

⚠️ **The light theme is not on any manifest.** Manifest `4R6e…` predates it. It exists only in the
working tree — review it locally (§8), not at a deployed URL.

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
      head.html                <head>, meta, canonical/og, font preload, inline theme script (§6)
      nav.html                 header + mobile menu + search + theme toggles
      player-bar.html          persistent bottom player bar
      search-overlay.html      full-screen search
      modal.html               NEW — the ONE shared <dialog> + its window.ueDialog controller (§5)
      footer.html              footer + the artist-mark width refiner (§4a)
      icons.html               inline SVG sprite (<symbol id="i-…">, incl. #i-sun / #i-moon)
  css/site.css               ← the ENTIRE stylesheet, ~2180 lines, two themes, no build step
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
4. Rewrites `../` → `` so output is root-relative (see §7).

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
| `coverScriptHtml(name)` | `.cover-script` — the handwritten artist mark (§4a) | ~224 |

So: change card/row **structure or classes** in the generator; change card/row **styling** in
`site.css`. Both then require a regeneration (§8).

---

## 4. CSS architecture — two themes, one token contract

Single file, no preprocessor, no build step: `website/css/site.css` (~1650 lines). Ordered sections,
each with a banner comment — **line numbers drift, so grep the banner text**:

`Fonts` · `Tokens` · `Reset/base` · `Header/nav` · `Eyebrows/headings` · `Featured hero` ·
`Mix cards` · `Catalog rows` · `Residents grid` · `Page headers` · `About` · `Footer` ·
`Persistent player bar` · `Search overlay` · `Motion` · `Playback status/retry` ·
`Cold-start affordance` · **`Light theme`** (always last)

**Every colour in the site is a token.** Three blocks define them:

| Block | Scope | Holds |
|---|---|---|
| `:root` (~59) | dark — oxblood on near-black, the brand default | **61** tokens: the full set |
| `:root[data-theme="light"]` (~1421) | light — warm ink on paper | **47** overrides: the colour half only |
| the **dark island** (~1547) | light's chrome only: `#site-header`, `#mobile-menu`, `#persistent-player-bar`, `#search-overlay` | **18** re-declarations, all dark's own values |

Absence of `data-theme` **is** dark; there is no `data-theme="dark"`. Light is **not** a
black-and-white theme and not a tint of dark: it is the same identity re-grounded on paper — warm
ink, a five-step tonal ladder with genuinely dark values in it, and the brand red, restricted. What
inverts is the *direction* of emphasis, not the palette. Wiring, storage and the toggle are §6.

**Two rules carry the whole light theme.** Break either and it goes pink or flat:

1. **No red wash on paper, ever.** Red is either *on a dark surface* (where it is simply the brand
   red) or *dark enough to read as ink* (`--accent: #8c0f18`, `--accent-bright: #6e0c13`, 7.6:1 and
   9.6:1 on the page). Every low-alpha red — a 7% veil, a 13% hover, a 16% card-hover ring, a 12%
   hero gradient — composites toward pink on a light ground, and together they tinted the page. That
   is what the second revision got wrong and why all of those tokens are neutral ink now.
2. **Depth comes from having dark values in the palette**, not from more shades of off-white. Two
   passes failed by keeping every surface within ~3% of the others (card-vs-page 1.07:1, then
   1.20:1 — it is 1.17:1 today and that step is *not* where the depth lives).

**Token groups** — name the group, then open the file; don't memorise values:

| Group | Tokens | Governs | Light override |
|---|---|---|---|
| Surfaces | `--bg-base` `--bg-panel` `--bg-card` `--bg-elevated` | the tonal ladder. In light it is **five steps with real darks in it**: `#ffffff` elevated · `#f8f6f4` card · `#e8e4e0` page · `#1c1714` **image wells** · `#0a0606` chrome (the island, below). ⚠️ `--bg-panel` is a *dark well* in light, not a pale panel — the skyline thumbnails are near-black, so a dark well is the same material as the photograph instead of a light frame fighting it. Wells-vs-page is 14:1 | yes |
| Accent — **the red** | `--accent` `--accent-bright` `--accent-dim` `--on-accent` | the highlight, under rule 1 above. On paper it is deep oxblood **type only** (`#8c0f18` / `#6e0c13`); on the island it is the brand `#c1121f` / `#e01e2b` at full strength. Carries eyebrows, active nav, artist links, catalog numbers, play/download fills, the live dot, time-current and `--wave-played` | yes (island restores dark's) |
| Receipt strip | `--paper` `--paper-ink` | the about-page ticket; inverts to a near-black ticket on paper (paper-on-paper would vanish) | yes |
| Text | `--text-primary` `--text-secondary` `--text-muted` | copy hierarchy. Light's inks keep dark's **warm bias** (`#14100e` / `#4a423e` / `#655c57`) — neutral grey on neutral paper was half the flatness | yes (island restores dark's) |
| Hairlines | `--hairline` `--hairline-accent` (`--hairline-red` = unused alias) | 1px rules and borders. ⚠️ on paper **both** are neutral ink: dark's red hairline works because a 45% red line on near-black stays dark; on paper it composites to pink. The island restores the red one | yes |
| Scrims | `--scrim-header` `--scrim-player` `--scrim-search` `--scrim-panel` | translucent chrome that floats over page content. In light the first three are **dark theme's own values verbatim** — this is what makes the chrome an island; only `--scrim-panel` is paper | yes |
| Veils / tracks | `--veil-hover` `--veil-inset*` `--track-empty*` | hover washes, the inset lip, the empty scrubber track | yes |
| Accent washes | `--accent-veil*` `--accent-glow*` | the highlight's quiet register — button grounds, hover fills. **Neutral ink in light** (they were red, and were a main pink source); red again inside the island | yes |
| Shadows | `--shadow-card-rest` `--shadow-card-hover` `--shadow-frame` `--shadow-portrait` `--shadow-panel` `--shadow-float` `--shadow-logo` `--text-shadow-title` `--text-shadow-number` | every composite shadow. Light's carry the page's own brown-black (`rgba(22,17,14,…)`, never pure black) and are all **contact-plus-soft**: a tight 1–2px layer is what makes an element sit *on* the paper rather than float over a grey cloud. The card-hover ring is **ink, not red** | all but `--text-shadow-number` |
| Artwork | `--img-filter` `--img-filter-hero` `--cover-scrim` `--hero-scrim` `--portrait-scrim` | how photography is treated. Light is `grayscale(1)` + a contrast lift rather than a scrim; `--cover-scrim` is 0.6 vs dark's 0.32 because `.mix-card-number` is hard-forced white and the scrim is the only thing guaranteeing it a ground. **The hero wash is no longer red** — dark can wash its hero in 14% red because the result stays dark; over a light-keyed image the same wash reads pink | yes |
| Waveform | `--wave-played` `--wave-unplayed` `--wave-remaining` | the canvas bars — **read by `player.js`, and now resolved per surface, not globally** (§6). The `:root` light values are the **hero** waveform's (oxblood on paper); the island re-declares dark's brand values for the **player-bar** waveform, and both paint at once | yes, twice |
| Texture | `--grain-opacity` `--grain-blend` `--scanline-opacity` `--scanline-pitch` `--scanline-ink` | the two full-page layers: `body::after` grain, `body::before` CRT scanlines | opacity + blend only |
| Non-colour | `--font-*` `--radius-*` `--player-bar-height` `--page-max` `--page-pad` `--ease-out-expo` | type, geometry, easing | **no** — theme-independent |

### 4a. The handwritten artist mark

Every **mix thumbnail** (`.mix-card-cover`) and **resident portrait**
(`.resident-card-photo`) carries the artist's name across it in the script face,
sized to span the tile: one word is huge, a stacked name steps down. Nothing is
added to the 64px archive/artist rows — a name across those is unreadable.

| Piece | Where |
|---|---|
| Markup | `coverScriptHtml()` in `WebsitePageGenerator.cjs` → `.cover-script` > `.cover-script-line`, `aria-hidden` (the name is already in the card as a real link/heading) |
| Styling | the "handwritten artist mark" block in `site.css`, right after Mix cards |
| Exact fit | the inline refiner at the bottom of `templates/partials/footer.html` |
| Tests | `tests/cover-script-mark.test.mjs` — 8, covering the stacking rule, the alias trim, the safety pad and the escaping |

**The sizing is one division, and it is the reusable idea here.** The tile is an
inline-size container; each line carries its own natural width in em as
`--script-w`; the font-size is `100cqi * fit / --script-w`. So the mark spans
the same fraction of the tile for *any* name, with no character-count branch
and no per-name breakpoint, and it re-fits on resize for free. A second term,
`--script-h / --script-lines`, caps the stack to the tile's **clear** height
(the mix card's metadata is laid over the lower ~60% of its own cover; the
resident card's body sits below the photo, so it gets nearly all of it).
`min()` of the two: width governs, height rescues a stacked name.

⚠️ **`--script-w` must never understate a line.** The build-time estimate sums
Gately's real per-character advances (`GATELY_ADV`, measured from the shipped
woff2) — which cannot see kerning, and on capital-heavy names runs up to **16%
narrow** (`STAR TRAXX` is the worst). An understated width oversizes the type
and the tile clips it, so the estimate is padded by `SCRIPT_W_SAFETY` (1.2) and
deliberately underfills; the footer refiner then measures the real string once
the font has loaded and writes the exact width back. That is why the mark is
correct for an artist added *after* this code was written, and why the padded
fallback is a slightly narrow mark rather than a clipped one.

Three things that are deliberate:

- **The mark is an on-artwork island.** It re-declares `--text-primary` /
  `--accent-bright` on its own subtree and sets `color` from them — the same
  pattern as `.mix-card` and the dark island — so it reads as white ink over the
  photograph in **both** themes instead of flipping to paper ink over a
  near-black skyline. Hover takes it to brand red.
- **It is a signature, so it wears the stage name**: `scriptDisplayName()` drops
  a parenthetical or `AKA …` tail from the artwork copy only
  ("BLUE JAY (AKA Josh Zeitler)" → "BLUE JAY"). The card body, heading and alt
  text are untouched.
- **Two words always stack.** "TYREL WILLIAMS" on one line would be half the
  size of "AKILA" on the same tile. Three words also take two lines, four or
  more take three, and the split minimises the *widest* line, since that line
  is what sizes all the others.

Knobs, if it wants to be bigger or smaller: `--script-fit` (0.82 of tile width),
and `--script-h` per surface (46cqi mix card, 74cqi resident). Pre-2023 engines
with no container queries get no mark at all (`@supports not (font-size: 1cqi)`)
rather than one at an arbitrary size.

### The dark island

In light theme the **header, mobile menu, player bar and search overlay stay dark**, using dark
theme's own chrome values verbatim. They are not restyled rule by rule: one selector list
re-declares 18 colour tokens **on their own subtree**, and because every rule in this stylesheet
reads tokens rather than literals, the whole chrome flips through the cascade — text, icons,
hairlines, hover washes, waveform, elevated surfaces — with **no per-rule overrides**.

This is the most reusable idea in the file. It only works because the stylesheet is token-driven;
the moment a rule hardcodes a colour, that rule stops following its surface. **Any future
"this region is on a different ground" problem should be solved this way,** not with a pile of
`:root[data-theme="light"] .thing { … }` rules.

⚠️ **Re-declaring the tokens is not sufficient on its own.** `color` *inherits*, so an element that
never declares its own — `#player-bar-title` is the one that caught it — keeps the value computed on
`<body>`, outside the island: the token said `#f2ece4` while the text painted in paper ink on the
dark bar. The island therefore sets `color: var(--text-primary)` itself, giving the subtree its own
inheritance root. **Any future re-grounded region needs that line as well as the tokens.**

Two consequences worth knowing before you touch the header or the marks:

- **The header wordmark needs no filter at all** — it is a white-on-transparent PNG on dark chrome,
  exactly as in dark theme, red badge intact. Removing that filter also removed a pink source: the
  previous `invert(1) hue-rotate(180deg)` landed the badge on a dusty rose rather than the brand red.
- **`.footer-wordmark` is the one mark still on paper**, so it is the only one that still inverts.
- Contrast on the island is dark's, inherited as-is: chrome type ≥4.7:1, but **red type on chrome is
  ~4.2:1** (`--accent` on its own ground is 3.2:1). That is exactly what dark ships today — an
  inherited item, not a new regression, and it should be fixed in both themes or neither.

**Why `--shadow-card-rest` exists.** It is `none` in dark and a real resting elevation in light, and
it is applied *unconditionally* on `.mix-card` and `.resident-card` — so dark's render is unchanged
while light gains a contact shadow. Dark separates surfaces by luminance (a `#150e0e` card on a
`#0a0606` page is visibly raised); paper cannot do that without going grey, so the card has to sit
**on** the page instead of being a different shade of it. Add elevation this way, not with a
light-only selector.

**The texture layers.** Grain is `body::after` at `--grain-opacity`, `mix-blend-mode:
var(--grain-blend)` (`normal` dark → `multiply` light, so it sinks into the paper). Scanlines are a
separate `body::before` at `--scanline-opacity`, which is **0 in dark** and `0.07` in light — two
layers because the blend modes have to differ. The CRT figures are keyed to the thumbnails' own
treatment spec (`config/skyline-thumbnail-treatment.json`: `scanlinePitch` 8, `scanlineDepth` 0.38,
`grainStrength` 12, `contrast` 1.3) so page texture and image texture agree. Page pitch is **3px,
not 8**: the thumbnail's 8px pitch is at source resolution and lands near 2–3 CSS px once a
1200px-wide image is drawn into a ~300px card.

**Light-theme structural corrections** — a short tail of selectors after the light token block, for
rules whose dark value was never a token or whose token flips the wrong way because the element sits
on **artwork** rather than on the page. As built:

| Rule | Why |
|---|---|
| `.mix-card-number { color: #fff }` | sits on a near-black thumbnail in *both* themes; `--text-primary` would print black on black |
| `.footer-wordmark` → `grayscale(1) invert(1)` | the one lockup left on paper. Greyscale first so the red badge goes to ink rather than to a hue we don't want |
| `#artist-detail-portrait-logo` → `var(--shadow-logo)` only | ⚠️ **must not be inverted** — that lockup lies over the portrait photograph, not over paper. Same trap as `.mix-card-number`, different element |
| `#mobile-menu { background: #0a0606 }` | it drops out of the dark header, so it is opaque chrome too |
| `.download-btn:hover { background: var(--accent) }` | `--on-accent` over a *wash* was 1.17:1 and the icon (the button's entire content) vanished; fill it like `.play-circle:hover` already does |

Gone across the revisions — do not reinstate: the `.cover-fallback` greyscale (the UE placeholder
keeps its oxblood), the active-nav weight bump (red says "active"), and the **header** wordmark
filter (the dark island made it unnecessary, and it was tinting the badge). The playing indicator
needs no light rule either — it inherits `--accent-bright`.

⚠️ **Some in-file comments lag the third revision.** The declarations are correct; four comments are
not: the ladder header says "six steps" and lists five; a stale shadow comment says the hover ring
"keeps dark's red ring" immediately above the one explaining that it is ink now; the `--cover-scrim`
note says 0.55 where the value is 0.6; and `--hairline-red`'s "still referenced below" is no longer
true (nothing uses it — it is an unused alias, and inside the island it would resolve to the *paper*
hairline, not the red one, because custom-property substitution happens where the alias is
declared). **Trust the declarations.**

**Theme-flip crossfade** — after those corrections, an *unscoped* block (both themes) gives the
large surfaces a 0.22s colour-only transition and the two texture layers a 0.32s opacity fade, so
switching reads as the room's lights changing. Deliberately **not** a global
`* { transition: background-color }`, which would re-time every hover state; the hover/press
transitions on cards and buttons are re-asserted underneath so the flip timing cannot flatten them.
The file's global `prefers-reduced-motion` rule (`*{transition:none!important}`) already turns the
whole thing into an instant cut.

**Fonts** — 6 self-hosted woff2 in `website/fonts/`, all referenced by `site.css`:
`gately-v1-regular`, `rationale-v1-regular`, `special-elite-v20-latin-regular`,
`ibm-plex-mono-v20-latin-{regular,500,700}`. Only `rationale` is `<link rel=preload>`ed (in
`partials/head.html`). **No external font CDN** — see §7.

**Breakpoints in use** (no formal scale; these are the ones that exist):
1500 · 1400 · 1020 · 900 · 860 · 760 · 700 · 640 · 540 max-width, plus 1021 / 701 min-width, plus
three `prefers-reduced-motion` blocks (Motion, playback status, light theme — the scanline layer is
static, so reduced-motion keeps it). The grids step independently:

```
.mix-card-grid   5→4 (1500) →3 (1020) →2 (760) →1 (540)
#residents-grid  5→4 (1400) →3 (1020) →2 (640)
```

Consolidating this into a token-driven scale is a legitimate piece of work; just do it deliberately,
because the numbers are currently tuned per-component.

---

## 5. Transient UI — where a message goes, and what is still injected

The two floating slabs are **deleted**: `ue-resume.js`'s "Resume … at 0:52" bar and `ue-links.js`'s
"Shared mix …" deep-link banner, along with their DOM and their injected CSS. The owner's objection
was that they covered the grid and were "an additional element somewhere" rather than part of the
page. Nothing replaces them one-for-one.

**The rule that decides where any future message goes** — three destinations, no fourth:

| Kind | Goes to | Surface |
|---|---|---|
| Transient state — starting, buffering, seeking, reconnecting | the existing **inline pill on the waveform** (unchanged by this rework; `player.js` status regions) | in place, no interruption |
| A track queued at a position — "resume at 0:52", "shared link from 1:23" | the **primed player bar** | the bar's existing idle slot |
| A genuine decision — playback failed (retry/download), clipboard-blocked copy | the **one shared dialog** | centre screen, modal |

Anything that does not fit those three does not get a new floating element. That is the whole point
of the rework.

### The primed player bar

Resume and deep-link are the same shape, so they fill the bar's idle slot ("Select a mix to play")
instead of floating over the grid. API is `window.uePlayerBar.prime(spec)` in `player.js`
(`{ title, artist, img, href, filename, startSec, label, source }` → `true`/`false`), plus
`.clear()`. It reuses `setBarTrack` for the render and the existing `playIndexAt(idx, startSec)`
offset path when the play button is pressed — **no new seeking code**. It refuses when audio is
already playing, when a real track already owns the bar, when the spec is malformed, or when `href`
matches no queue entry on this page (so the play button is never primed into a dead press), and the
primed state never survives a real play.

Style hooks: `#persistent-player-bar.is-primed` and `.player-bar-primed-label` (the "primed state"
block in `site.css`). The label is a short lowercase phrase under the artist.

### The shared dialog

Static native `<dialog>` in `templates/partials/modal.html`, included by all five page templates
immediately before the deferred `js/boot.js` tag, with its `window.ueDialog` controller inline in
the same partial. **Static and inline on purpose:** runtime injection was the original complaint,
and a new `website/js/*.js` would need the 23-path deploy gate changed (§7.4) — a partial costs
nothing because it is inlined into every generated page.

`window.ueDialog.open({ title, message, actions[0-2], copyText })` / `.close()`. Focus trap, Esc and
inertness come from the platform via `showModal()`; a backdrop click and the ✕ also close it; a
second `open()` replaces the content rather than stacking. Callers degrade quietly when it is
missing: `ue-links.js` falls back to `prompt()` rather than lose a link, and `player.js` falls back
to the **inline Retry/Download buttons it always shipped** — so a failure is never silent even with
no dialog controller.

⚠️ **No colours live in the partial.** It is styled entirely from the "Shared dialog" block in
`site.css` via stable ids (`#ue-dialog`, `-panel`, `-title`, `-message`, `-copy-input`, `-actions`,
`-close`, `.ue-dialog-action--primary|--quiet`) and the `[data-actions]` / `[data-copy]` attributes.
Two traps the partial's own comment records: padding belongs on `#ue-dialog-panel`, never on
`#ue-dialog` (a backdrop click is detected as "target is the dialog element", so padding there
becomes a dead click-to-close zone), and the `hidden` attribute is load-bearing in both directions
for browsers without `<dialog>`.

### What is still injected at runtime

| Module | Injects | Class prefix | Token-driven? |
|---|---|---|---|
| `website/js/ue-links.js` | share buttons, share popover, the deep-link **highlight**, a11y announcer — the banner and manual-copy panel are gone | `.ue-links-*` | yes — hairlines, text, accent, `--bg-elevated`, `--shadow-float` |
| `website/js/ue-resume.js` | **nothing.** No DOM, no `<style>` — position save/restore/validation logic plus one `prime()` call | — | n/a |
| `website/js/ue-mediasession.js` | no DOM (OS media metadata only) | — | n/a |

Remaining class names: `ue-links-icon-btn`, `-icon-svg`, `-popover`, `-popover-item`,
`-player-bar-share`, `-deep-link-highlight`, `-highlight-pulse`, `-visually-hidden`.

**Still not token-driven,** one item (the second one is resolved — the diverging shadow geometries
went with the deleted slabs, and the surviving popover fallback matches `--shadow-float` exactly):
`@keyframes ue-links-highlight-pulse` starts at `var(--accent-glow-soft, …)` and ends at a literal
`rgba(224,30,43,0)` — zero-alpha red. It paints nothing (alpha 0), so light is not showing a red
halo, but it is a colour literal outside the token blocks, and tokenising it needs a
"transparent accent" token because a keyframe cannot interpolate to `transparent` cleanly in every
engine.

**Rule when restyling what remains:** edit the injected string inside the module and keep the
`var(--token, literal)` form. Do not move it into `site.css` "so it can be themed" — it already is.

### ⚠️ Load order: `window.uePlayerBar` is not there when your module starts

`boot.js` loads `player-core.js`, `ue-host-pref.js`, `ue-warm.js`, `ue-links.js` and `ue-resume.js`
**eagerly and chained**, but `player.js` **lazily** — on idle (`requestIdleCallback`, 3.5s timeout;
3s `setTimeout` fallback) or on the first play-intent tap, whichever comes first — and dispatches a
document-level **`ue-player-ready`** afterwards. So `window.UEPlayerCore` exists early while
`window.uePlayerBar` does not.

**Anything touching the player bar must run behind a `whenPlayerReady` wrapper** (each consumer
defines its own small one over that event; there is no shared global). Both modules got this wrong
first time and it killed the feature silently in the browser while their unit tests passed — the
tests stub the globals, the browser does not. A related reason to wait rather than scan at
`DOMContentLoaded`: `randomizeFeatured()` in `player.js` rewrites the featured anchor's `data-*` and
`href` during hydration (§9.6), so a decision made before that reads stale values.

---

## 6. The theme contract

Small, and load-bearing in three files at once. Change one piece without the others and the failure
is silent.

| Piece | As built |
|---|---|
| Attribute | `<html data-theme="light">`. **Dark is the ABSENCE of the attribute** — there is no `data-theme="dark"`. A page whose JS never runs renders the brand default. |
| Storage key | `localStorage['ue-theme']`, only ever the value `'light'`; switching to dark **removes** the key. Every access is `try/catch`ed — Safari private mode and the Arweave sandbox origin can throw. |
| Pre-paint script | inline `<script>` in `templates/partials/head.html`, synchronous, no `defer`/`async`, after the stylesheet link. It therefore completes before `<body>` is parsed, so the attribute is on `<html>` before the first box is laid out and the dark→light flash is structurally impossible. **Inline on purpose:** a new `website/js/*.js` would need the 23-path deploy gate (§7.4) and the `.gitignore` allow-list changed. |
| Toggles | `#nav-theme-toggle` (desktop) and `#mobile-theme-toggle` (mobile) in `partials/nav.html`. Markup ships the dark default (sun = "switch to light"); the head script rewrites the `<use href>` (`#i-sun` / `#i-moon`, both in `partials/icons.html`), `aria-label` and `aria-pressed`. The click handler is delegated off `document`, so pages without either button are fine. |
| Re-sync hook | `nav.html` ends with `window.__ueThemeSync && window.__ueThemeSync()` — a *call*, not a second implementation, so a returning light-theme visitor never sees the sun icon repaint into a moon. No-op if the head block ever goes away. |
| Event | every toggle dispatches `window` `CustomEvent('ue:themechange', { detail: { theme } })`. **This is a contract between the stylesheet, the toggle and the canvas renderer, not a convenience.** |
| Event consumer | `website/js/player.js` → `Waveform.prototype.resolveColors()`. ⚠️ **The `--wave-*` contract is per-surface, not global:** the tokens are resolved from the **canvas element**, not from `<html>`, because the hero waveform (paper) and the player-bar waveform (dark island) must paint different colours at the same time — custom properties inherit, so `getComputedStyle(canvas)` sees whichever declaration wins for that canvas. Verified by pixel-sampling both: hero paints `20,15,13`, player bar `242,235,228`. The canvas redraws on every `timeupdate`, so that call must never enter the bar loop: each `Waveform` caches its own triplet, keyed on theme + a module-level generation counter that `ue:themechange` bumps to invalidate every instance at once. Rename or drop the event and both waveforms silently keep the previous theme's colours until reload. |
| Browser chrome | the same script repaints `<meta name="theme-color">` **by reading `--bg-base` off the stylesheet** after the attribute flip, not from a duplicated pair — that pair drifted three times in one session, and the symptom (a hairline of the wrong colour above the page) is invisible on desktop and obvious on a phone. A literal `GROUND_FALLBACK` (`#0a0606` / `#e8e4e0`) covers only the case where the stylesheet has not applied. |

**Who reads what:**

| File | Reads |
|---|---|
| `css/site.css` | all 61 tokens; defines both blocks |
| `js/player.js` | `--wave-played` `--wave-unplayed` `--wave-remaining`, resolved **per canvas** and cached per instance, with the file's original literals as fallback |
| `js/ue-links.js` | surfaces, text, hairlines, accent, scrims, veils, `--shadow-float` (§5) |
| `js/ue-resume.js` | the same, plus `--radius-card` `--font-mono` `--ease-out-expo` `--player-bar-height` (§5) |
| `templates/partials/head.html` | no tokens — it mirrors the two `--bg-base` values in its `GROUND` map for `theme-color` |

**The rule: new colour work goes in `:root`, `:root[data-theme="light"]` or the dark island, and
nowhere else.** If a rule needs a colour, add a token and give it a light value in the same edit. A
token with no light value silently inherits the dark one — which now means brand red or near-black
landing on paper. If the element lives on the chrome, it is already handled: the island re-declares
the token for that subtree, so write the rule against the token and let the cascade place it.

The only sanctioned literals outside those two blocks:

- `.mix-card-number`'s white in the light structural corrections (§4) — currently the **only** one
  in the stylesheet; the rest of that tail is `var()`-driven;
- `GROUND_FALLBACK` in `head.html` — a stylesheet-unavailable fallback only; the live value is read
  from `--bg-base`, so it cannot drift;
- the load-order fallbacks inside the injected modules (§5).

⚠️ **Zero automated coverage.** No test asserts the attribute, the storage key, the event, or parity
between the two token blocks — the suite passes without exercising any of it. Verify by
hand, in both themes, on every page you touch (§8). Measured for the current palette: paper type
≥5.1:1, oxblood type 9.6:1, chrome type ≥4.7:1, wells-vs-page 14:1. Those are measurements, not
regression tests — re-measure any colour you change.

---

## 7. Hard constraints — break these and the live site breaks

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
   `lib/WebsiteDeployer.js` lists **23** paths (4 core pages + `artists.json`, `css/site.css`, all 8
   runtime JS files, all 6 fonts, 3 brand images). Unchanged by the theme work — it adds no files,
   which is why the theme script is inline in `head.html` (§6). If you **add** a stylesheet, font or
   image that pages depend on, add it to that list and to `.gitignore`'s allow-list — otherwise a
   Vercel-packaged deploy ships without it. `tests/deploy-manifest-coverage.test.mjs` covers this.
   ⚠️ Two images pages *do* depend on are **not** on the list: `img/square-ue.png` (the fallback
   every broken cover swaps to) and `img/ue-white-horiz.png` (footer + artist-page wordmark). Both
   are `.gitignore`-negated so they ship today, but nothing fails a deploy that drops them (§9.8).
5. **`website/img/**` and `website/fonts/**` are git-ignored by default** with explicit `!` negations
   for the files actually used. A new image that isn't negated will not be committed.
6. **Don't hand-edit generated pages** (§2) and don't edit `website/artists.json` by hand — it is
   synced from Firestore.

---

## 8. Working loop

```bash
cd /Users/bballi/Documents/Repos/EditVideos/arweave-video-generator

# 1. edit website/templates/**, website/css/site.css, or the markup builders in
#    lib/WebsitePageGenerator.cjs

# 2. regenerate the static pages (syncs Firestore → artists.json, then renders; no upload, no AR)
node outputs/release-tmp/run-deploy.mjs --update-only

# 3. preview
cd website && python3 -m http.server 8123     # → http://localhost:8123/index.html

# 4. tests
npm test                                       # expect 708 pass / 0 fail

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

The two new surfaces need a deliberate look, in both themes: **prime the bar** (open a page with a
`?t=` deep link, or return to a page after part-listening to a mix on it) and **open the dialog**
(kill the network and press play, or use the copy fallback). Neither shows up in a static page load.

**Check both themes**, since nothing automated does (§6): toggle in the nav on each page, then
**reload while light is active** — that reload is the only thing that exercises the pre-paint path,
and a flash there means the head script moved or went `defer`. Play a mix in each theme too: the
waveform is the one surface whose colours come through JS.

---

## 9. Known UI issues and open opportunities

Ordered by how concrete they are. None are blocking. Two older items are gone: "injected UI doesn't
use the design tokens" (resolved) and "the deep-link banner does not auto-clear after Play from"
(the banner itself was deleted — §5).

1. **The motion layer is entirely inert.** The `Motion` banner in `site.css` says "GSAP adds
   `.motion-ready`; CSS handles fallback" — but **no page loads GSAP** (it is in neither `boot.js`,
   the templates, nor `REQUIRED_MANIFEST_PATHS`), nothing ever sets `.motion-ready`, and
   `.motion-item` is a static `opacity: 1`. `player.js` does carry a real intro timeline, guarded on
   `typeof window.gsap !== 'undefined'`, which therefore never runs; `js/gsap.min.js` ships as
   unused weight. Decide: wire it up, or delete the dead file, the dead block and the stale comment.
2. **The resume offer is now page-local, by design.** The deleted resume bar could offer a
   cross-page "Go to mix" link; the primed player bar can only queue what the *current* page has, so
   a record whose track is not on this page produces **no offer at all** (the position is still
   stored and still restores when you reach that page). Deliberate trade-off, owner-visible — not an
   oversight. If it needs to come back, it belongs in the bar's slot as a link, not as a new
   floating element (§5).
3. **Mobile has never been checked on a real device.** All responsive verification was desktop
   Chrome at simulated widths. The ≤540px single-column path and the player bar
   (`--player-bar-height: 84px`) deserve a real phone pass — now in both themes.
4. **Breakpoints are per-component, not systematic** (§4).
5. **Very dark thumbnails read as near-flat at 64px** in archive rows. Measured mean luminance across
   the set is 56/255 by design (it matches the site's language), and the images are correct at card
   size — but if archive rows feel muddy, that's the cause, and the fix is a UI one (larger row
   thumbs, or a subtle border/contrast lift on `.catalog-row-cover`), **not** a re-render of the
   thumbnails. Light theme now sets them in a **dark well** (`--bg-panel: #1c1714`) plus
   `--img-filter: grayscale(1) contrast(1.14)`, which is the closest thing to a fix anyone has tried;
   dark is unchanged and still shows the original problem.
6. **The featured mix changes between page loads — this is real and deliberate, and was undocumented
   outside the source.** `randomizeFeatured()` in `player.js` (~910) fetches `artists.json` after
   load and replaces the hero title, artist signature, meta row, audio href, download filename and
   queue entry with a random playable pick. It is **not** a caching or generation bug: the generator
   picks the newest playable mix with artwork, deterministically. CSS consequences a future thread
   should know: the hero's text and `#featured-meta-row` are rewritten *after* first paint, so hero
   styling must survive a wiped meta row and an arbitrary-length title; the hero **image** is not
   swapped (it stays the fixed local `digging-hero` backdrop). Unverified: whether the swap was ever
   looked at in light theme. Worth confirming that this is still wanted before restyling the hero.
7. **A featured/cover image that 404s can render as a large empty gradient panel — more conspicuous
   on paper than it was on black.** Observed, not yet traced to a specific record. A fallback path
   does exist (`player.js` adds a one-shot `error` listener to every `img[data-fallback-initial]` and
   swaps in `.cover-fallback` + `img/square-ue.png`), so either it is not firing for this case — the
   listener is `{ once: true }` and only covers generator-emitted images, not the player bar's
   dynamically built one — or the fallback image itself is unavailable. When it does not fire you are
   left with the cover container's `--bg-panel` under the `--cover-scrim` gradient. **Much less
   conspicuous since the third revision** — `--bg-panel` is now a dark well (`#1c1714`), so a missing
   cover reads as an empty dark hole rather than a pale gradient panel, and `--cover-scrim` at 0.6
   keeps the hard-white `.mix-card-number` legible over it. **Still not fixed**: the broken asset is
   simply less obvious. Diagnose before restyling; a CSS-only patch would hide it entirely.
8. **The two images most likely to be missing are not deploy-gated** (§7.4): `img/square-ue.png` and
   `img/ue-white-horiz.png`. Related to 7 — if the fallback placeholder is ever dropped from a
   manifest, nothing fails and every broken cover degrades to the empty panel above.
9. **5 orphan images ship** (`img/artists/{bernardbadie,jevonjackson,lorelei,vivaacid}.jpg`,
   `img/digging.jpg`) — referenced by nothing. Safe to delete if you want the manifest tidy.

---

## 10. Do not touch from a CSS/UI thread

These are finished, verified, and expensive to break:

- `website/js/player-core.js`, `player.js`, `boot.js`, `ue-warm.js`, `ue-host-pref.js` — audio
  reliability, gateway failover and seeking. Verified live (play/seek/resume/share). In particular
  **never reintroduce raw `arweave.net` as an audio candidate**: it returns 200 and ignores Range,
  which breaks seeking. `RANGE_HOSTS` (player-core.js:41) is deliberate.
  *Two carve-outs:* the waveform colour block at the top of `player.js` (`resolveColors()`, the
  `--wave-*` fallbacks, the `ue:themechange` listener — §6) and the primed-bar **render**
  (`is-primed`, `.player-bar-primed-label`, `renderPrimedArtistLine` — §5) are CSS-layer code and
  are yours. The primed bar's refusal rules and `playPrimed()` are not: they sit on `playIndexAt()`
  and the verified start-offset path. Nothing else in that file is yours either.
- The skyline thumbnail pipeline: `lib/skyline/**`, `lib/SkylineAssignmentStore.js`,
  `worker/lib/SkylineThumbnailService.js`, `scripts/skyline-thumbnails.mjs`,
  `config/skyline-thumbnail-*.json`. The 32 thumbnails are applied in production.
- `lib/WebsiteDeployer.js` required-path gate — unless you are *adding* a required asset (§7.4).
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

## 11. Quick reference

```bash
npm test                                              # 708 pass / 0 fail
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
| `docs/audits/integrity-2026-10-04/README.md` | **mix inventory**: Google Drive master folder, what's not on the site, `artists.json` defects, wallet budget + upload batch 1 |

---

## 12. 2026-10-04 — homepage hero is now the "Signal" stage

Owner-approved from five review-only concepts (`website/concept-1..5.html` + `concepts.html`,
generated by git-ignored `outputs/concepts/build-concepts.cjs`; not deployed, safe to delete).

- **CSS-only.** New block `Featured hero — Signal stage` in `css/site.css`, directly after the
  original hero rules (which it overrides). `templates/index.html`, every hero id, the inline hero
  script and `player.js` are untouched.
- The media frame (`#hero-collage-frame`: film / cover / portrait) and `#featured-mix-content`
  share one grid cell — the media is the stage's backdrop, title / artist / meta / transport sit
  over its lower edge on a token-driven scrim.
- **Latest Mixes kept as-is** (no "Up Next" strip). Clicking a card still repoints the hero copy
  (`pointHeroAt`) and media (`ue-hero-repointed`) — verified with a real click.
- Height: `--hero-stage-h` = viewport − 72px header − `--player-bar-height` −
  `--hero-stage-reserve` (200px), clamped 420–780px, so the Latest Mixes header + top of its cards
  stay above the fold. Inner sizes scale with `min(vw, svh)` so the copy always fits the stage.
- Film/Cover/Artist thumbs float top-left, mute/share top-right. `#hero-mix-plate` and
  `#hero-art-mark` are `display:none` inside the stage (the copy already names the mix); the script
  still writes them.
- Promo film / portrait use `object-fit: cover` here (crops a square film on a wide stage —
  owner may prefer contain).
- **Light theme:** `#featured-mix-hero` was added to the **dark island** selector list — the stage
  is artwork in both themes.
- Verified at 824×877 only, dark + light. Not yet checked at full desktop width or on a phone.
