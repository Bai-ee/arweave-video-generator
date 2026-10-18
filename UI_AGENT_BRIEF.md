# UI Agent Brief — Underground Existence public site

You are working on the PUBLIC WEBSITE UI of this repo only. Read this whole brief before editing anything.

## Scope

- In scope: `website/templates/**`, `website/css/site.css`, `website/js/player.js`, `lib/WebsitePageGenerator.cjs` (only when a template needs new data).
- Out of scope — do not touch: admin app (`public/index.html`), `api/*`, `worker/**`, upload/deploy/ArNS logic, Firestore data, `website/artists.json` (generated from Firestore, overwritten on every deploy).
- Root `website/*.html` pages are GENERATED from `website/templates/` — never hand-edit them. Edit the template/partial and regenerate, or if the change is pure CSS/JS it flows through without regeneration.

## Stack (locked — no additions)

- Static HTML templates: `{{TOKEN}}` substitution + `{{> partial}}` includes, rendered by `lib/WebsitePageGenerator.cjs`. No framework, no build step, no Tailwind, no npm UI deps.
- One stylesheet: `website/css/site.css`. Vanilla CSS, design tokens in `:root`.
- One script: `website/js/player.js` (audio player + scrubber + search + menu). GSAP 3.12.5 is available locally (`website/js/gsap.min.js`) — core only, no plugins.
- Fonts are self-hosted woff2, root-relative paths: IBM Plex Mono (UI/body), Special Elite (display), Gately (script accents). Do not swap or add fonts.

## Design language (frozen)

Analog-zine × modern music platform. Dark base `#0a0606` (never pure black), single oxblood accent `#c1121f` / `#e01e2b`, paper `#e8e0d0` for the about-page receipt-strip motif, film grain overlay. Motion: easing token `--ease-out-expo`, `:active` press states, `:focus-visible` accent ring, restrained GSAP load-in stagger. Keep this vocabulary; don't introduce gradients-on-text, neon glows beyond the existing red, emoji, or generic card grids.

## Hard invariants (breaking these breaks production)

1. **Host-agnostic markup.** All asset paths root-relative (`css/site.css`, `fonts/…`), internal links relative (`archive.html`). No hardcoded hostnames, no canonical/og URLs with a domain. The site is served from `arweave.net/<manifestId>/…` where the manifest changes every deploy.
2. **`index.html` stays the manifest index** — do not rename pages.
3. **Audio URLs are canonical `arweave.net/<txid>`** in markup/data. The Range-capable gateway (frostor.xyz / arweave.fllstck.dev) is chosen at PLAY TIME inside `player.js` (`RANGE_HOSTS`, probe race, tier fallback). Never bake a gateway host into templates or data, never use `ar-io.dev` (402s playback).
4. **Do not weaken the playback engine** in `player.js`: start-tier probe, 12s no-start fallback, stall watchdog, premature-`ended` resume, `pendingSeek*` handling. `audio.play()` must stay synchronous with the user's tap (iOS autoplay).
5. **Waveforms are scrubbers** (hero, player bar, progress line): click/drag seeks. Bars are deterministic seeded visuals, not decoded audio — that's intentional.
6. **`html, body { overflow-x: hidden; overflow-x: clip; }` must stay** — rotated collage props otherwise cause horizontal panning on iOS.
7. **Mobile player bar grid** (`≤900px`): `minmax(0,1.1fr) auto minmax(0,1fr) auto auto` — flexible columns are now-playing + waveform; buttons are `auto` and must never be crushed.
8. **Nothing extra in `website/`** — every file in that directory is uploaded to Arweave permanently on deploy. Delete scratch/test files before finishing.

## Conventions

- Any container you meaningfully edit gets a stable, descriptive `id` in lowercase kebab-case, named by function not styling (e.g. `id="about-receipt-strip"`, `id="grid-selection-controls-row"`). No `container`/`wrapper`/`box`. Mention new ids in your report.
- Brand: the artist name is styled "Bai-ee", never "Bai-Ee".
- Breakpoints in use: 1500 / 1400 / 1020 / 900 / 860 / 760 / 700 / 640 / 540. Verify changes at 390px width minimum; catalog rows have mobile-specific constraints (no mid-word title wrapping).
- Respect `prefers-reduced-motion` (a global kill-switch already exists — don't bypass it with inline styles or JS-driven animation without a guard).
- Comment style: sparse, only for non-obvious constraints. Log prefix convention `[Component] message` if you add JS logging — remove debug logs before finishing.

## Workflow

1. Preview locally: `cd arweave-video-generator/website && python3 -m http.server 8471` → `http://localhost:8471/index.html`. If you use a viewport-testing harness file inside `website/`, DELETE it when done (see invariant 8).
2. Audio playback cannot be fully verified in automated Chrome profiles (media downloads may be blocked) — verify UI/layout/wiring locally; real playback is device-tested after deploy.
3. Deploy is owner-run (local handler + `.env.local` secrets → new Arweave manifest → manual GoDaddy forward update). Do not deploy unless explicitly asked; deploys spend AR and are irreversible.
4. Reference docs, in order: this file, `MIX_AUDIO_SCRUBBING.md` (playback/gateway constraints), `CLAUDE.md` (repo-wide invariants), `WEBSITE_REDESIGN_BRIEF.md` (original design brief).

## Report format

Before editing: Scope / Files affected / Risks / Proceed-or-blocked.
After editing: Files changed / Exact behavior changed / What stayed untouched / Verification run / Manual test next / Risks-not-verified. Keep it compact.
