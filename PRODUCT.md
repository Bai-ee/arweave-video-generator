# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase, no framework. Zero-build static HTML/CSS/JS in `website/`, generated from `website/templates/**` + `templates/partials/**` by `lib/WebsitePageGenerator.cjs`; one stylesheet `website/css/site.css`; self-hosted fonts; no external scripts. Deployed to Arweave (permaweb) as a path manifest, so every asset must be root-relative and self-contained. Local preview: `python3 -m http.server` in `website/` (:8080).

## Users

Primary for the About page: scene insiders and historians (Chicago house/techno people checking provenance and who is behind the archive) and new listeners (arriving from a shared mix link, deciding whether this place is real and worth their time). Contributors (DJs with a mix) and Arweave-curious visitors are secondary and not confirmed as targets.

## Product Purpose

Underground Existence is an archive of Chicago house and techno mixtapes, streamed play-only from the permaweb. The About page explains what the archive is, why it exists and who is preserving it.

## Positioning

A permanent, host-less archive of Chicago underground mixes, curated by a person who was there, with the site itself deployed to Arweave. A streaming platform cannot truthfully claim that permanence or that provenance.

## Operating Context

- The About page is a generated page: edit `website/templates/about.html` and `site.css`, then regenerate. Never hand-edit `website/about.html`.
- Page tokens `{{MIX_TOTAL}}` and `{{ARTIST_TOTAL}}` are filled at generation from `artists.json` (synced from Firestore `system/artists`).
- Two themes (dark default, light opt-in) share one token contract; see `UE_CSS_UI_HANDOFF.md`.
- Persistent player bar, search overlay, shared dialog and share modal are partials present on every page.
- Uploads to Arweave spend real AR and are always quote-gated with per-batch approval.

## Capabilities and Constraints

- No server, no build step, no external network dependency beyond `https://arweave.net`.
- Pages must work as root-relative static files on a permaweb manifest.
- Voice on the About page: first person singular, the owner speaking as curator.
- The existing About copy (Est. 2007, "crew of Chicago DJs trading tapes", "residents", play-only, Google Form contributions) is **placeholder, not confirmed**. The owner will supply the true story. Do not carry any of those claims forward as fact.

## Brand Commitments

Name: Underground Existence (UE.INFO). Existing logos in `website/img/` (`ue-logo-horiz.png`, `ue-white-horiz.png`, `square-ue.png`). Handwritten artist-mark script face and oxblood-on-near-black identity are established (see handoff). The owner explicitly rejects tiny uppercase eyebrow labels as a design pattern.

## Evidence on Hand

- Two event flyers: `website/img/flyers/flyer1.jpg`, `flyer2.jpg`.
- Brand imagery in `website/img/` (digging hero, logos, artist art).
- Live catalog counts via `MIX_TOTAL` / `ARTIST_TOTAL`.
- Absent until the owner supplies them: founding date and story, names, press, testimonials. Do not fabricate.

## Product Principles

1. Permanence is the product: every claim about the archive must be true of something stored on Arweave.
2. A curator's voice, not a brand voice: specific, first-person, from someone who was there.
3. Static and self-contained: nothing that needs a server or a third-party host to render.
4. Truth over polish: unverified history stays out until the owner confirms it.

## Accessibility & Inclusion

No product-specific standard established. Keep body text at least 4.5:1 in both themes and honor `prefers-reduced-motion`.
