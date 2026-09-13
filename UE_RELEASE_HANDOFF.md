# Underground Existence — Release Handoff

**Release:** redesigned site + audio reliability/seeking/warming + Media Session/deep links/share/resume
+ skyline thumbnail system, published as a new Arweave path manifest.

**Status:** IN PROGRESS. This document is written at each gate as evidence accrues. Sections marked
`PENDING` have not happened yet — do not read them as done.

---

## 0. Baseline (recorded before any change)

| Fact | Value | How verified |
|---|---|---|
| Branch | `main` | `git rev-parse --abbrev-ref HEAD` |
| HEAD at start | `e10bb00` refactor(api): fold external-site Arweave deploy into deploy-website | `git log --oneline -1` |
| Test suite | **623 tests / 623 pass / 0 fail** | `npm test` |
| Working tree | 171 entries dirty (many unrelated legacy deletions) | `git status --porcelain \| wc -l` |
| Live manifest (public) | `Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc` | `curl -L undergroundexistence.info` → 301 → `gifsve3y…arweave.net/Mgsqk3g6…/index.html` |
| Public domain mechanism | **GoDaddy 301 forward to a hardcoded `arweave.net/{manifestId}/index.html`** — not ArNS | same curl |
| ArNS `undergroundexistence.ar.io` | **404, not resolving** | `curl -L https://undergroundexistence.ar.io/` |
| ANT `tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw` | unreadable: `Process not found in whitelist` | `@ar.io/sdk` `ANT.init().getRecord()` |
| Deploy wallet | `5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw` | `.env.local` `ARWEAVE_WALLET_ADDRESS` |
| Wallet balance | **6.074196 AR** + **6,808,887,477,811 winc** Turbo credits | `arweave.net/wallet/{addr}/balance`, `payment.ardrive.io` |
| Firebase Storage throughput | **7.16 MB/s** (22.8 MB in 3.19 s) | admin-SDK download of one skyline source |

⚠️ The prior handoff's claim of 0.04 MB/s Storage throughput was a transient condition. Re-measured
at 7.16 MB/s, which is why full 140-source curation became feasible for this release.

---

## 1. SECURITY — two credential exposures (read this first)

### 1a. Arweave deploy wallet private key is in PUBLIC git history — NOT REMEDIATED

`.env.local` is **tracked** (`git ls-files .env.local` matches) and commits `0f9120c` and `946a140`
contain `ARWEAVE_WALLET_JWK`. The repository `github.com/Bai-ee/arweave-video-generator` is
**`"visibility":"PUBLIC"`** (`gh repo view --json visibility`).

The committed key is the **same key still in use**: the JWK modulus (`n`) SHA-256 fingerprint is
`6f8e293d80410566` in both `git show HEAD:.env.local` and the working copy, and both carry wallet
address `5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw`.

**Exposure:** 6.07 AR + 6.8e12 winc of Turbo credits are spendable by anyone who has read that repo,
and the same wallet is the signer for the ArNS ANT.

**Out of scope for this release, deliberately.** Rotating an Arweave wallet means generating a new
key, transferring AR and Turbo credits, and transferring ANT ownership/controller — irreversible
financial actions that were not authorised here. Deploying from this wallet does not worsen the
exposure. **Owner action required, urgently and independently of this release.**

Remediation sketch (owner): generate a new JWK → move AR + Turbo credits → transfer ANT
ownership/controller → update `ARWEAVE_WALLET_JWK`/`ARWEAVE_WALLET_ADDRESS` in Vercel, GitHub
Actions secrets and `.env.local` → `git rm --cached .env.local` → purge history
(`git filter-repo`) or, more realistically for a public repo of this age, treat the old key as
permanently burned and never reuse it.

### 1b. Firebase service-account key exposed in a session transcript — ROTATION: PENDING

During this session a hand-rolled `.env.local` parser mis-split the value and Node echoed the full
`FIREBASE_SERVICE_ACCOUNT_KEY` — including the RSA private key — into the transcript. Affected
principal: `firebase-adminsdk-fbsvc@editvideos-63486.iam.gserviceaccount.com`, key id
`07937fff3dd8d24b7e94cf4cf5a8b265a565272d` (USER_MANAGED, no expiry).

All tooling in this release now loads env through `outputs/release-tmp/env.mjs`, which replicates
dotenv semantics and never prints values.

Consumers that must be updated together: local `.env.local`, the Vercel project env, and the GitHub
Actions secret `FIREBASE_SERVICE_ACCOUNT_KEY` (`.github/workflows/process-videos.yml:52`).

Rotation is scheduled **after the thumbnail backfill and before the Arweave deploy**, so the
in-flight Firebase reads are not interrupted. Old key will be **disabled** (reversible), not
deleted, until the new key is proven in all three consumers.

---

## 2. Release scope (what ships)

- Redesigned static site (`website/**`: `index.html`, `archive.html`, `about.html`,
  `residents.html`, generated artist pages, `css/site.css`, fonts, images).
- Audio reliability / gateway failover / warming / seeking: `js/player-core.js`, `js/ue-warm.js`,
  `js/ue-host-pref.js`.
- Media Session · deep links/share · resume: `js/ue-mediasession.js`, `js/ue-links.js`,
  `js/ue-resume.js`, plus the host bridge in `js/player.js` and the loader in `js/boot.js`.
- Skyline thumbnail pipeline (`lib/skyline/**`, `lib/SkylineAssignmentStore.js`,
  `lib/SkylineThumbnailJobs.js`, `worker/lib/SkylineThumbnailService.js`,
  `scripts/skyline-thumbnails.mjs`, `config/skyline-thumbnail-*.json`), plus the backfilled
  thumbnails themselves.

**Explicitly deferred:** Drive Mode, a new player architecture, new mixes, blog content, the
range-proxy scrub fix, any ArNS repair beyond reporting its state.

---

## 2b. Independently re-verified facts (lead, read-only)

**Firestore `system/artists`** — classified live with `lib/skyline/classify.js`, matching the prior
handoff exactly:

```
artists=18 mixes=45 trax=17
mixStates={"missing":19,"legacy-artist-image":10,"legacy-artist-portrait":3,"uploaded":13}
artistStates={"uploaded":18}          ← zero artist backfill targets
eligible=32  protected=13  uniqueKeys=44
dupKeys=[["a5ffe359b0e48cee",2]]      ← chicagoskyway "For Hakim" recorded twice
```

⇒ **32 eligible mix records resolving to 31 distinct thumbnails.** The 13 `uploaded` covers are
protected by classification and are never targeted without `--include-uploaded`, which this release
does not use.

**Range gateways are healthy today** (the prior handoff could not verify audible playback because
both were failing from that machine):

| Host | Range request | Result |
|---|---|---|
| `arweave.fllstck.dev` | `Range: 0-99999` | **206**, 1.73 s |
| `frostor.xyz` | `Range: 0-99999` | **206**, 1.27 s |
| `arweave.net` (raw) | `Range: 0-99999` | **200**, ignores Range, 108 MB / 24.9 s |

`website/js/player-core.js:41` — `RANGE_HOSTS = ['https://arweave.fllstck.dev/','https://frostor.xyz/']`,
with an explicit comment at :54 that the raw URL is *never* a candidate. The
"no raw `arweave.net` fallback in interactive playback" constraint holds in code and is re-confirmed
by the 200-ignores-Range measurement above.

**Currently live manifest `Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc`** — 44 paths,
`index: index.html`, `js/` contains only `gsap.min.js` and `player.js`, 23 HTML pages, 6 fonts,
10 images. The new release must add `js/boot.js`, `js/player-core.js`, `js/ue-warm.js`,
`js/ue-host-pref.js`, `js/ue-links.js`, `js/ue-resume.js`, `js/ue-mediasession.js` plus the
generated thumbnails, so a manifest that still has 44 paths is a failed deploy.

Generated pages load exactly one entry script, `js/boot.js` (`grep -ho 'src="[^"]*"' website/*.html`).
The only page carrying stale `../js/jquery*/bootstrap*/plyr*` references and an empty `src=""` is
the legacy placeholder `website/artist.html`, which is already live and already inert.

---

## 3. Gate log

| Gate | Status |
|---|---|
| G0 Baseline tests + repo recon | ✅ 623/623 |
| G1 Thumbnail style + persistent cross-run uniqueness | ✅ see §7 |
| G2 Source catalog curation (140 sources reviewed) | PENDING |
| G3 Release audit (manifest coverage, runtime, secrets, file isolation) | ✅ see §5 |
| G4 Clean dry run over all eligible art-less mixes + visual contact-sheet review | PENDING |
| G5 Staging batch of exactly 3 mixes applied + rendered-page inspection | PENDING |
| G6 Full art-less backfill | PENDING |
| G7 `SKYLINE_THUMBNAILS_ENABLED` on for future uploads | PENDING |
| G8 Page regeneration + full test suite + browser smoke | PENDING |
| G9 Credential rotation (1b) | PENDING |
| G10 Release commit boundary | PENDING |
| G11 Arweave deploy → new manifest | PENDING |
| G12 Public verification + GoDaddy forward update | PENDING |

---

## 5. G3 — release audit findings and what was done

Audit was read-only; every fix below was applied by the lead afterwards and re-tested.

### Fixed in this release

**A. The deploy could ship a broken site and only print a warning.** `lib/WebsiteDeployer.js`
checked five "critical" files, one of which — `fonts/mr-dafoe-v15-latin-regular.woff2` — **does not
exist anywhere in the repo**, so every deploy logged a phantom `❌ Critical file … missing` while the
two fonts the CSS actually uses (`gately-v1-regular.woff2`, `rationale-v1-regular.woff2`) were never
checked at all. Both checks were `console.warn`/`console.error` only: a manifest missing
`js/player-core.js` would have deployed silently.

Replaced with an exported `REQUIRED_MANIFEST_PATHS` (25 entries: 4 core pages + `artists.json` +
`css/site.css` + all 8 runtime JS files + all 6 real fonts + 3 brand images) and
`assertRequiredPaths()`, which **throws**. It runs at two gates — after collection and after upload,
before the manifest transaction — so a partial upload can never become a published manifest.

⚠️ `deployWebsiteToArweave` takes a new `{ requireUEPaths }` option, default `true`. The
external-site branch (HITLOOP Site Recreate zips, `api/deploy-website.js`) passes `false`: a cloned
third-party site legitimately has none of our runtime files and must not be measured against the UE
contract. Without that flag this change would have broken Site Recreate.

**B. Nothing tested the deploy path at all.** `grep -rl "collectWebsiteFiles\|WebsiteDeployer" tests/`
returned zero matches across the whole suite. Added `tests/deploy-manifest-coverage.test.mjs` (6
tests): every required path exists on disk, the required list names every playability module,
`collectWebsiteFiles()` collects all of them, `templates/`/`archive/`/`active/`/`data/`/`scripts/`
stay excluded while `archive.html`/`about.html` still ship, and `assertRequiredPaths` throws on a
miss and tolerates Windows separators.

**C. Required assets were git-ignored, so a Vercel-run deploy never had them.** 21 of the 25 required
paths were untracked; the 6 fonts and the brand images were blocked by the blanket
`website/fonts/**` and `website/img/**/*.{jpg,png}` rules. The live site's fonts exist only because
past deploys ran *locally*. Since gate A now fails hard, a Vercel-triggered deploy (admin upload →
auto-deploy) would have started erroring. Added targeted `!` negations for exactly the required
assets plus the two referenced flyer images and the favicon — ~220 KB, not a media dump.
Re-audited: **0 referenced local assets missing from disk, 0 still ignored.**

**D. `website/artist.html` deleted.** A pre-redesign template sitting at the deploy root (so it
shipped), carrying 18 unfilled `[ARTIST_NAME]`-style tokens and `<script>` references to 20 vendor
files this release removes. Unreferenced by any page. It is in the *current* live manifest, already
broken; this release stops publishing it.

**E. `.gitignore`: `outputs/` and `backups/`.** Neither was ignored, so a careless `git add -A` would
have swept video/image caches, a Firestore dump, and all three agents' scratch directories into the
release.

### Accepted, not changed

- **Mix-image fallback is implemented three times**, not once: `lib/WebsiteSync.js:87` (write-time),
  `lib/WebsitePageGenerator.cjs:220` (render-time — the real chokepoint), and
  `website/js/player.js:923` inside `randomizeFeatured()` (client-side, decides *which mix is
  featured*, not which image a mix gets). Pre-existing and explicitly accepted in
  `SKYLINE_THUMBNAIL_HANDOFF.md` §6. Recorded so the release notes don't overstate the
  single-chokepoint claim.
- **`js/gsap.min.js` ships unused** — no page loads it; `player.js:1733` gates an optional motion
  block on `typeof window.gsap !== 'undefined'`, permanently false in production. Left alone: it is
  already live, deleting it is cosmetic, and it is not worth a late change.
- **5 orphan images** (`img/artists/{bernardbadie,jevonjackson,lorelei,vivaacid}.jpg`,
  `img/digging.jpg`) are collected but unreferenced. Left in place — the AR cost is negligible and
  deleting an image a future regeneration might reach for is the worse risk.

### Verified clean by the audit

- **Manifest coverage both directions** — `collectWebsiteFiles()` was actually executed: all required
  files present; reverse-parsing every `src=`/`href=`/`url()` in every page found **zero** references
  that would 404 on the deployed manifest (other than the now-deleted `artist.html`).
- **No raw `arweave.net` in interactive playback.** `player-core.js:41` excludes it by construction.
  All 46 mix URLs in `artists.json` extract a valid 43-char txid with the player's own regex — 0
  failures, so nothing degrades to a no-candidate state.
- **Runtime chain matches the documented architecture**; every generated page loads exactly one
  script tag, `js/boot.js`.
- **Host-agnostic paths** — no absolute internal links; `canonical`/`og:url` correctly pinned to the
  stable domain rather than a per-deploy `arweave.net/{manifestId}`.
- **Page generation is deterministic** — `generatePages()` run twice into separate directories,
  SHA-256 over all 22 outputs: **0 files differ.** No per-deploy hash churn, so incremental upload
  really is incremental.
- **All ~90 legacy deletions are safe** — no generated page references any removed vendor asset.

---

## 7. G1 — thumbnail treatment and cross-run uniqueness

### Visual treatment

Final render chain (the analysis pass is byte-for-byte unchanged, so selection determinism and the
pre-existing tests still hold):

```
crop='min(iw,ih)':'min(iw,ih)', scale=960:960:flags=lanczos, format=gray,
eq=contrast=1.3:brightness=-0.03:gamma=0.95:saturation=0,
unsharp=5:5:0.55:5:5:0.0, noise=alls=16:allf=u:all_seed=<derived>,
vignette=angle=<derived>, format=gray   →   -c:v libwebp -quality 82
```

Values live in `config/skyline-thumbnail-treatment.json`, loaded lazily with a baked-in fallback so
a missing file can never throw.

**Determinism is preserved.** `noise`'s `all_seed` is derived from the same
`seedFromKey({entityType, stableKey, assignmentVersion})` that already drives candidate selection, so
a given mix always renders byte-identically. Proven by a test that runs the render in **two separate
OS processes** and asserts identical bytes and `contentHash`.

**Lead visual verification.** Agent 1's own contact sheet was built from the **pre-crop** frames,
which is the same mistake as defect #6 in the original handoff (judging pixels that never ship), so I
rebuilt a sheet from the eight actual `.webp` assets. Probed with ffmpeg: **all 8 are exactly
960×960**, 47–133 KB. Reviewed directly: genuinely monochrome, fine visible grain, deep blacks with
unclipped highlights, vignette present, reads as a deliberate cinematic grade rather than a filter
slapped on a photo. Artifacts: `outputs/release-tmp/lead-review/square-shipped-sheet.png`.

⚠️ Those eight samples were rendered against the **un-curated** catalog (Agent 2 was still working),
so several show a bus, highway signage and a tunnel. That is the content problem G2 exists to solve,
not a treatment defect — the grade itself is correct on every sample.

### Persistent cross-run uniqueness

Previously the collision-avoidance set was per-batch only, so two mixes ingested in separate runs
could collide. Now:

- `store.readUsedIndex()` unions every live `generated-skyline` image meta in `system/artists` with a
  new durable `skyline_assignment_index` collection (doc id = idempotency key).
- The index doc is written **inside the same Firestore transaction** as the record patch, so index
  and reality cannot drift.
- `restore()` deliberately never deletes index entries — a retired frame stays retired.
- `scripts/skyline-thumbnails.mjs` seeds `used` from the index before the first entity in **both**
  dry-run and apply mode (a read, so dry runs stay zero-write) and reports the counts in
  `report.json`.
- Documented maintenance override `--ignore-used-index` prints a loud warning and still requires
  `--yes-i-approve-apply` when combined with `--apply`.

Tested across separate service instances sharing a persisted store, starting from a brute-forced
genuine collision rather than a stub. `npm test`: **685 / 685 pass.**

Lead check against live Firestore (read-only): `readUsedIndex()` → `candidateIds=0 dHashes=0`,
which is the correct answer today — nothing has ever been applied to production.

### Flagged deviations (accepted)

- `treatment.encodeQuality` (82) now takes precedence over the catalog's `output.quality` for the
  final render. Both are 82 today, so there is no behavioural difference; noted so a future change to
  the catalog value doesn't surprise anyone.
- `vignetteStrength` maps to ffmpeg's `angle` via a linear calibration chosen by the agent
  (`PI/5` at 0 → `PI/2.1` at 1), because `vignette` has no native 0–1 strength knob.

---

## 9. RELEASE BLOCKER found and fixed — generated thumbnails were not publicly readable

**Every generated thumbnail would have rendered as a broken image on the live site.**

The two real Storage adapters upload the WebP and return
`https://storage.googleapis.com/<bucket>/<path>`, which is written straight into
`mixImageFilename` and rendered on the public site. But:

- the bucket has **no `allUsers` binding** (`gcloud storage buckets get-iam-policy` → only
  `legacyBucketOwner`/`legacyBucketReader` for project members), and
- **uniform bucket-level access is off**, so per-object ACLs govern reads, and
- neither adapter called `makePublic()`.

Proven end-to-end rather than inferred — a probe object uploaded exactly the way the backfill
uploads one:

| | anonymous GET |
|---|---|
| uploaded without `makePublic()` | **HTTP 403** |
| uploaded with `makePublic()` | **HTTP 200** |

Both probe objects were deleted afterwards.

**Why nothing caught it:** every skyline unit test injects a *fake* storage adapter, so the defect
lives entirely in code no test exercises. It would have surfaced only as broken images on the public
site after the backfill.

**Fix:** `await bucket.file(storagePath).makePublic()` after upload in both
`scripts/skyline-thumbnails.mjs` (backfill CLI) and `worker/run-thumbnail-jobs.mjs` (the
future-upload job worker — otherwise every *new* upload's thumbnail would break too). This is the
repo's own established convention: `worker/processor.js:141`, `api/upload-video.js:117` and
`scripts/upload-chicago-videos.js:90` all already do it; the two skyline adapters were the only
upload paths that did not. It makes **only the generated thumbnails** public — the source videos and
everything else in the bucket stay private, which a bucket-wide `allUsers` grant would not have.

**Guard:** `tests/skyline-storage-public-acl.test.mjs` (3 tests) asserts both adapters call
`makePublic()` after `bucket.upload()` and still return the public URL form. Source-level
assertions, deliberately narrow, because the fake-adapter unit tests structurally cannot cover this.

`npm test`: **688 / 688 pass.**

---

## 8. Safety gates verified by the lead (independently, not taken on trust)

**Apply gate.** All three unsafe invocations refuse and exit **1**:

| Invocation | Result |
|---|---|
| `--apply` (flag off, no approval) | `Refusing --apply: missing SKYLINE_THUMBNAILS_ENABLED=true and --yes-i-approve-apply.` exit 1 |
| `--apply --yes-i-approve-apply` (flag off) | `Refusing --apply: missing SKYLINE_THUMBNAILS_ENABLED=true.` exit 1 |
| `SKYLINE_THUMBNAILS_ENABLED=true --apply` (no approval) | `Refusing --apply: missing --yes-i-approve-apply.` exit 1 |

**Dry run is non-mutating.** The verification run reports `mode: dry-run`, `flagEnabled: false`,
and **0** entities with `applied` set.

**Thumbnail brightness** (measured, not eyeballed — decoded every proposed WebP to a 64×64 gray
raster): mean-of-means **56.2/255**, darkest 26.8, brightest 92.3; highlights essentially unclipped
(only 3 of 31 have any pixels >239, max 1.4% of area). The set is deliberately dark, matching the
site's near-black, grainy visual language. I inspected the darkest three at full size before
accepting: all show clear architectural structure and lit windows — they read as moody night stills,
not as broken black tiles. **No treatment change made.**

---

## 6. Deploy mechanics (decided)

**The deploy runs the real `/api/deploy-website` handler locally**, driven by
`outputs/release-tmp/run-deploy.mjs` with a mock `req`/`res`. Same code path as production —
`syncFirebaseToWebsiteJSON` → `generatePages` → `deployWebsiteToArweave` → `updateArNSRecord`.

It is run locally rather than by hitting the deployed Vercel function because Vercel packages from
git, and the fonts/images were git-ignored (§5C) — a Vercel-run deploy would package a site with no
fonts. Those ignores are now fixed, but the authoritative deploy for this release still runs against
the complete on-disk tree.

**Dry pipeline test (`--update-only`, no upload, no AR): PASS.**
`✅ Generated 22 pages (18 artists, 45 mixes, featured #045)`, HTTP 200. Afterwards: 48 images on
`archive.html` with **0 broken / 0 empty `src`**, and all seven runtime modules present
(`UEPlayerCore`, `UEHostPref`, `UEWarm`, `UELinks`, `UEResume`, `UEBoot`, `player.js`).

**Cost estimate for the real deploy** (`getChangedFiles` against the stored manifest):

```
total=52  changed=33  unchanged=19  deleted=1  changedBytes=1.00MB
cost = 978.41 KB — 0.000096 AR (~$0.0002 USD)
```

All eight new runtime files are in the changed set. Incremental reuse of 19 unchanged transactions
confirms the deterministic-generation finding — pages are not churning their hashes.

**Credential rotation runbook (G9, executes after backfill, before deploy).** Three consumers of
`FIREBASE_SERVICE_ACCOUNT_KEY`, all confirmed reachable with authenticated CLIs:

| Consumer | Evidence |
|---|---|
| local `.env.local` | file on disk |
| Vercel **Production** | `vercel env ls production` lists it (Production only) |
| GitHub Actions secret | `gh secret list` → `FIREBASE_SERVICE_ACCOUNT_KEY` (2025-12-01) |

The service account has **three** USER_MANAGED keys (`07937fff…` 2025-11-30 — the exposed one,
`a22436c0…` 2025-12-01, `aba82948…` 2026-01-11), none expiring. Since key values are write-only in
Vercel/GitHub, it is not knowable which consumer holds which. Plan: mint one new key, set all three
consumers to it, verify, then **disable** (reversible, not delete) only the exposed `07937fff…`.
The other two are left alone and reported as unknown-usage rather than guessed at.

---

## 4. Rollback

- **Thumbnails:** `previousMixImageFilename` / `previousArtistImageFilename` hold the pre-pipeline
  value; every run writes an audit doc to `skyline_thumbnail_runs`; `store.restore()` (admin action
  `restoreThumbnail`) reverts a record and works with the flag off. Generated Storage objects are
  retained, never deleted.
- **Site:** the previous manifest `Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc` stays live on
  Arweave forever. Rollback = point the GoDaddy forward back at it. Nothing is destroyed by a
  deploy.
