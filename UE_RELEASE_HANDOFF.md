# Underground Existence — Release Handoff

**Release:** redesigned site + audio reliability/seeking/warming + Media Session/deep links/share/resume
+ skyline thumbnail system, published as a new Arweave path manifest.

**Status:** SHIPPED to Arweave. One step remains and it is not mine to take: the GoDaddy
domain forward still points at the old manifest (§12).

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

### 1b. Firebase service-account key exposed in a session transcript — ROTATED ✅

During this session a hand-rolled `.env.local` parser mis-split the value and Node echoed the full
`FIREBASE_SERVICE_ACCOUNT_KEY` — including the RSA private key — into the transcript. Affected
principal: `firebase-adminsdk-fbsvc@editvideos-63486.iam.gserviceaccount.com`, key id
`07937fff3dd8d24b7e94cf4cf5a8b265a565272d` (USER_MANAGED, no expiry).

All tooling in this release now loads env through a loader that replicates dotenv semantics and
never prints values.

**Rotation performed, in this order:**

1. Minted a new user-managed key `ea0fbf7b2631ad450d1eb3f7bda07134796c9def` into a `0600` temp file.
   (`iam.disableServiceAccountKeyCreation` checked first — effective policy `booleanPolicy: {}`,
   i.e. not enforced; the operator holds `roles/owner`.)
2. **Proved the new key works before swapping anything** — Firestore read (18 artists) and Storage
   list, using only the new credential.
3. Updated all three consumers: local `.env.local` (in-place line replacement, other 12 lines
   untouched), **Vercel Production** (`env rm` + `env add`), and the **GitHub Actions secret**
   (`gh secret set`, timestamp now `2026-09-13T02:10:32Z`).
4. Re-verified the app end-to-end on the rotated key (`mixStates={"generated":32,"uploaded":13}`).
5. **Disabled** the exposed key — `disabled=True`, confirmed by reading it back. Disabled rather
   than deleted, so it is reversible if some unknown consumer surfaces.
6. Shredded the temp key files and removed the helper script.

⚠️ Two other USER_MANAGED keys remain enabled and were left alone: `a22436c0cf4cb240926fb19ddf41a57f3577ea72`
(2025-12-01) and `aba8294814dd68fe9db372dfd02e25950740bfee` (2026-01-11). Key values are write-only
in Vercel/GitHub so it is not knowable which consumer held which; neither was exposed. Reported
rather than guessed at — if they are unused, an owner should delete them.

**No secret value was printed at any point during the rotation.**

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
| G2 Source catalog curation (140 sources reviewed) | ✅ see §10 |
| G3 Release audit (manifest coverage, runtime, secrets, file isolation) | ✅ see §5 |
| G4 Clean dry run over all eligible art-less mixes + visual contact-sheet review | ✅ 4 passes, §10 |
| G5 Staging batch of exactly 3 mixes applied + rendered-page inspection | ✅ see §11 |
| G6 Full art-less backfill | ✅ 29 applied, 0 failures |
| G7 `SKYLINE_THUMBNAILS_ENABLED` on for future uploads | ✅ Vercel prod + local |
| G8 Page regeneration + full test suite + browser smoke | ✅ 688/688, §13 |
| G9 Credential rotation | ✅ see §1b |
| G10 Release commit boundary | ✅ `bce0b26`, 239 files |
| G11 Arweave deploy → new manifest | ✅ `sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw` |
| G12 Public verification + GoDaddy forward update | ⛔ BLOCKED on GoDaddy access, §12 |

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

---

## 10. G2/G4 — source curation and the dry-run gate

**Agent 2** downloaded all 140 sources, pulled a representative frame from each (plus early/late
frames for 8 ambiguous ones), reviewed them in labelled sheets, then — crucially — ran the real
non-mutating CLI four times and inspected every *actually selected* candidate at full resolution.
That second loop caught **14 sources whose sampled frame looked clean but whose drawn frame was
not**: a CTA bus, a tunnel with a car, highway gantry signage, Salesforce Tower branding with
pedestrians, an ARIES charter bus. Rounds 3–4 produced zero further corrections. Result: 27 enabled.

Rejection reasons (113): not skyline/architecture 29 · storefront/street brand signage 19 · motion
blur/too dark 18 · highway signage 11 · buses & transit 10 · people as subject 9 · dashcam 6 ·
tunnels 5 · police vehicles 3 · construction crane 1.

**The lead then ran the gate independently and found more.** Four further dry-run passes, inspecting
every one of the 31 proposals at full size each time:

| Pass | Finding | Action |
|---|---|---|
| 1 | `skyline-6765fa89` drew a rail yard with construction trucks at t=0.64 — the clip only becomes an iconic Willis Tower vista from ~2.6 s | `excludeRanges [[0, 2.2]]` |
| 1 | `skyline-72891dac` — a dashcam drive down Lower/Upper Wacker: green road signage, underpasses, cars and a SPEED LIMIT 20 sign in **all six** sampled frames | disabled |
| 2 | `skyline-e490660f` excellent in 5 of 6 frames; at t=4.71 an overpass girder sweeps the frame | `excludeRanges [[4.2, 5.3]]` |
| 2 | `skyline-af25f2b7` — through-window drive-by, car A-pillar intrudes at f=0.25/0.55/0.85 | disabled |
| 3 | `skyline-9f90f277` — another through-window drive-by, pillar across 4 of 6 frames | disabled |
| 3 | Two proposals were near-duplicate river-with-boat frames from one near-static clip (`skyline-49aee0b6`), min dHash distance **7** against a threshold of 6 | raised `maxDHashHammingForDuplicate` 6 → **12** |

Each source was verified by pulling **all six** of its sampled frames and looking at them, rather
than judging from the one frame that happened to be drawn.

**Final catalog: 24 enabled / 116 disabled** (6 Veo renders + 18 uploads), 2 with `excludeRanges`.

**Final dry run (the gate that was approved):**

```
proposed=31  uniqueCandidates=31  uniqueDHashes=31  distinctSources=19
fromDisabledSources=0  minPairwiseDHashHamming=13  applied=0  mode=dry-run
statuses={"proposed":31,"not-targeted":13,"proposed-shared-key":1}
```

Min pairwise distance rose 7 → 13, i.e. comfortably distinct rather than borderline. Every one of
the 31 was reviewed at tile size and the questionable ones at full size. Accepted after inspection:
the elevated L-track night frames (iconic Chicago structure, not clutter) and the darkest tiles —
measured mean-of-means 56/255, and the three darkest were opened full size to confirm they read as
moody night stills with legible architecture, not black squares.

---

## 11. G5 — three-mix staging batch

Applied as three separate `--mix-key` runs, each requiring both gates. Chosen for coverage rather
than convenience: three different artists, both transition types, and all three visible on
**homepage, archive and their own artist page**.

| Mix | Artist | Before | Source |
|---|---|---|---|
| Lorelei Live at Podlasie 7/18/25 | LORELEI | `missing` (no image at all) | `skyline-45a9a7b1` @ 5.55 |
| Love Manifesto 3 | BAI-EE | `missing` | `skyline-fd456554` @ 4.79 |
| ...Head Ass!!! | AKILA | `legacy-artist-image` (showed AKILA's portrait) | `skyline-fd456554` @ 7.64 |

**Cross-run uniqueness proved itself in production here**: the three runs seeded the used-index with
0, then 1, then 2 prior candidates — separate processes, persisted state, no collisions.

Verified after apply: 3 records written, `960x960`, `locked=false`, `previousMixImageFilename`
recorded only where one existed; 3 `skyline_assignment_index` docs; 3 audit docs; all three URLs
**HTTP 200 `image/webp`**; and the three thumbnails rendered in the regenerated homepage, archive
and artist pages while neighbouring mixes kept their original artwork.

---

## 12. ⛔ REMAINING STEP — the public domain still points at the old manifest

**This is the one thing I could not do, and it is a credential boundary, not a technical one.**

`undergroundexistence.info` is a **GoDaddy domain forward** (nameservers `ns55.domaincontrol.com` /
`ns56.domaincontrol.com`). Both apex and `www` currently answer:

```
HTTP/2 302
location: https://gifsve3yhjjbsrhoxcwgdafgfxkwrtx5mfoatganuyh6isfk4v3q.arweave.net/Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc/index.html
```

That is the **old** manifest. The forward target must be changed to:

```
https://arweave.net/sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw/index.html
```

There are no GoDaddy credentials in the environment (checked `.env.local`; nothing matching
`godaddy`/`gd_`/`domain`), and the GoDaddy MCP connector is unauthenticated — it returns
*"Ask the user to run /mcp and select 'claude.ai GoDaddy' to authenticate."* I did not attempt the
change through a logged-in browser session: repointing a live domain is an account-level,
outward-facing change and was not authorised.

**Two ways to finish:** authenticate the GoDaddy connector (`/mcp`) and ask me to repoint it, or
change the forward manually in GoDaddy → Domain → Forwarding.

Until then the deployed site is fully live and verified at the manifest URL; the public domain
simply still serves the previous release. **This is also the rollback switch** — pointing the
forward back at `Mgsqk3g6…` restores the old site instantly.

**ArNS is dead and was not repaired** (out of scope, reported): `undergroundexistence.ar.io` 404s,
and the ANT `tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw` is unreadable —
`Forbidden, process not whitelisted`. The deploy's ArNS step ran and failed non-blockingly, exactly
as predicted. The public domain has never depended on it.

---

## 13. G11/G8 — deploy and live verification

**New manifest: `sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw`**

- Manifest: `https://arweave.net/sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw`
- Index: `https://arweave.net/sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw/index.html`
- 52 files (34 uploaded, 18 transaction IDs reused), previous manifest 44 files
- `✅ All 23 required resources present in the upload set` — the new hard gate passed
- Cost: ~978 KB, **0.000096 AR**

Manifest contents fetched back from `arweave.net/raw/` and checked against
`REQUIRED_MANIFEST_PATHS`: **missing = NONE**. Contains all 9 `js/` files
(`boot`, `player-core`, `player`, `ue-warm`, `ue-host-pref`, `ue-links`, `ue-resume`,
`ue-mediasession`, `gsap`), `css/site.css`, 6 fonts, 12 images, 1 icon, 22 HTML pages,
`artists.json`. The dead `artist.html` is gone.

**Browser smoke test on the live manifest** (not localhost):

| Check | Result |
|---|---|
| Homepage | renders; 10/10 images loaded, **0 broken**; 6 generated thumbnails at 960×960 |
| Archive | 45 rows, 32 generated + 5 `/img/covers/` uploaded; **48/48 images loaded, 0 broken** |
| Artist page `baiee.html` | 15 rows = 10 generated + 5 uploaded covers side by side; 20/20 loaded |
| Artist page `akila.html` | 2 generated; 0 broken |
| Existing uploaded cover | Acidman "Live @ Smartbar" → `arweave.net/u0XiF…/img/covers/acidtest.jpg` loads 780×780, untouched |
| All 8 runtime modules | present on every page, single `js/boot.js` entry tag |
| Play | "Love Manifesto 3" ran 6.8 s → 36.9 s continuously, `readyState 4`, on `fllstck.dev` |
| Seek | `seek(1800)` → 1809.3 s; `seekBy(-300)` → 1516.5 s; still playing |
| Share | `navigator.share` called with a correct host-relative `…/baiee.html?mix=<43-char txid>` |
| Deep link | `?mix=…&t=90` → banner "Shared mix: ...Head Ass!!! — AKILA" + **Play from 1:30**, **nothing autoplayed** |
| Play-from | started at 90 s, advanced to 103 s; `replaceState` dropped `&t=` |
| Resume | prompt appeared from a stored record; playback continued after Dismiss |
| Hostile deep link | `?mix=<img src=x onerror=alert(1)>&t=abc` → `{mix:null, t:null}`, nothing rendered, nothing played |
| Console errors | **none**, across homepage, archive and both artist pages, through load/play/seek/share |

Two observations worth recording honestly:

- **The banner does not auto-clear after "Play from"** (`ue-links-banner-text` stays visible).
  `UE_PLAYABILITY_HANDOFF.md` §5 claims it clears. Dismiss works and playback is unaffected, so this
  is a cosmetic deviation from the documented behaviour, not a functional fault. Not fixed — it is
  outside this release's scope and I did not want a late untested edit to the links module.
- A 0.65-scale page screenshot made archive thumbnails *look* blank. They are not: zooming in shows
  the images, and the DOM reports `naturalWidth 960`, `opacity 1`. The thumbnails are deliberately
  very dark and JPEG-flatten against the near-black rows at reduced scale.

---

## 14. Final numbers

| | |
|---|---|
| Thumbnails applied | **32 mix records / 31 unique assets** (Chicago Skyway's duplicate "For Hakim" shares one by design) |
| Existing artwork preserved | **13**, byte-identical — `protectedChanged=0` |
| Audio / title / duration / year fields mutated | **0** |
| Artist images changed | **0** (all 18 already had art; zero targets) |
| Sources enabled / disabled | 24 / 116 of 140 |
| Min pairwise dHash distance | 13 (threshold 12) |
| Thumbnails publicly fetchable | **31 / 31 → HTTP 200** |
| Tests | **688 pass, 0 fail** (from 623; +65 new) |
| Release commit | `bce0b26` — 239 files, +37,466 / −47,943 |
| Manifest | `sEIIpqWb7OIARUdcaukBIp6r1mT6GBmVbHCPrJ3BoDw` |

**Not pushed.** The release commit is local. The repo is public and its history contains the live
wallet key (§1a); whether to push, and in what order relative to that remediation, is an owner
decision, so I left it. `git push origin main` when ready.

**Excluded from the commit deliberately:** `design-refs/`, `docs/audits/**` and `scripts/audit/**`
(an unrelated wallet/reviews cross-reference workstream), plus `outputs/` and `backups/` which are
now ignored.

## 15. Rollback

1. **Domain** — point the GoDaddy forward back at `Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc`.
   Instant, total, and the old manifest is permanent on Arweave.
2. **Thumbnails** — `previousMixImageFilename` holds the pre-pipeline value for every overwritten
   record; `store.restore()` (admin `restoreThumbnail`) reverts one and works with the flag off.
   Every run wrote an audit doc to `skyline_thumbnail_runs` (4 docs). Generated Storage objects are
   retained on rollback, never deleted. A full pre-backfill snapshot of `system/artists` was taken
   before the first write.
3. **Future uploads** — set `SKYLINE_THUMBNAILS_ENABLED=false` (or remove it) in Vercel to stop
   generating thumbnails for new art-less uploads.
4. **Credential** — re-enable key `07937fff…` with `gcloud iam service-accounts keys enable` if some
   unknown consumer turns out to have depended on it.

## 16. Caveats and what was not verified

- **Real devices.** Everything was verified in desktop Chrome. No physical phone, no real
  lock-screen / Bluetooth Media Session UI, no OS share sheet — `navigator.share` was verified by
  intercepting the call, not by opening the system dialog.
- **Gateway dependence.** Playback was verified with both range gateways healthy
  (`fllstck.dev` and `frostor.xyz` each 206 in ~1.3 s). Playability on the live site is contingent on
  at least one staying healthy; the player fails over between them and never falls back to raw
  `arweave.net`, which ignores Range.
- **Arweave propagation took ~8 minutes** for the new manifest to resolve on `arweave.net` after
  upload. A freshly deployed manifest 404s briefly; that is normal, not a failed deploy.
- **8 of the enabled sources** were drawn as a real candidate in only one verification pass. Each
  looked clean when inspected, but has less repeat confirmation than the rest.
- **Per-candidate content filtering does not exist.** Source-level enable/disable plus
  `excludeRanges` is a blunt instrument for clips that pan from a good subject onto a bad one. Robust
  filtering would need OCR/object detection and a new dependency, which was out of scope. Residual
  risk is judged low after eight independent inspection passes, but it is not zero.
- **Vercel-run deploys were not exercised.** The deploy ran the real handler locally. The required
  fonts/images are now tracked so a Vercel-packaged deploy should work, but that path is untested.

---

## 17. Treatment v2 — high-contrast B&W + CRT (owner-requested regrade)

Site approved; the thumbnail *rendering* was asked to match the site's artist-image
language — high-contrast black and white with a slight CRT filter.

**This is a regrade, not a reselection.** Every mix keeps the exact still it already had
(`frameChanged=0`); only the grade changed.

### The look

```
crop → scale 960 → format=gray
normalize=blackpt=black:whitept=white:smoothing=0
curves=master='0/0 0.18/0.06 0.45/0.45 0.80/0.93 1/1'
unsharp=5:5:0.85:5:5:0.0
geq  (CRT scanlines, pitch 8px, depth 0.38)
noise=alls=12  →  vignette  →  libwebp -quality 84
```

Two decisions worth recording, both made from measurement rather than taste:

1. **Per-frame normalisation replaced the global contrast knob.** A single `contrast`
   value cannot serve both a near-black night tower and a noon skyline — the value that
   makes daylight punchy crushes the night frame to mud. Normalising each frame to the
   full range first, then applying one fixed S-curve, is what makes 31 stills drawn from
   very different footage read as a single consistent set. (A `histeq` variant was tried
   and rejected: it blew out and posterized.)

2. **Scanline pitch 8px, not 3px.** Fine scanlines look right at 1:1 and are *completely
   invisible on the actual site*: the browser downscales these to ~230px cards and 64px
   archive rows, and anything finer than roughly 2× the display pixel pitch is averaged
   away. Measured across pitches 4/6/8/12 at 490/230/64px — pitch 8 is the only one that
   survives at hero and card size without degrading into coarse bars. Evidence:
   `outputs/release-tmp/lead-review/crt-pitch.png`, `crt-downscale.png`, `crt-final.png`.

### Regrade safety (three traps hit and fixed)

- **The live v1 objects must not be overwritten.** They are served
  `cache-control: public, max-age=31536000, immutable`, so re-rendering in place would
  leave browsers and CDNs on the old grade indefinitely. Assets are now published at a
  treatment-versioned path (`{key}-v1t2.webp`); v1 objects are untouched and remain the
  rollback target (verified still HTTP 200).
- **Re-running selection would silently change the imagery.** Probe order is seeded per
  `assignmentVersion`, and the used-index now contains every live candidate — so a plain
  `--regenerate` would deliberately pick *different* frames. New `--rerender` keeps the
  assignmentVersion and forces the stored `candidateId`. A test proves that without the
  force, a seeded used-index does move the selection.
- **The first apply silently did nothing.** All 32 returned `already-applied`:
  `deriveIdempotencyKey` keyed only on `assignmentVersion`, which a regrade deliberately
  does not bump. It now takes an optional `treatmentVersion`, appended only from v2 so
  every previously minted key is byte-identical. Related: `buildImageMeta` was
  whitelisting fields and **dropping `treatmentVersion`**, so records carried no grade
  version at all — fixed, and that is now persisted.
- Pinning `treatmentVersion: 1` genuinely reproduces the v1 look again: a partial config
  now merges onto a version-appropriate base instead of inheriting v2's keys. That is the
  grade-level rollback path, and it is tested.

### Result

| | |
|---|---|
| Records regraded | **32** (31 unique assets) |
| Frames changed | **0** |
| Real cover artwork touched | **0** of 13 |
| New assets public | **31 / 31 → HTTP 200** |
| v1 assets still live (rollback) | yes, unchanged |
| Tests | **695 pass, 0 fail** (+7 new) |
| Commit | `5770d01` |
| Manifest | **`4R6eLhJ1PtAncF3Zu_vIehynWCWQYde_VCW0R-wO4WQ`** (52 files, 17 uploaded, 35 reused) |

Live verification on the new manifest: homepage 10/10 images loaded / 0 broken, six
regraded thumbs at 960×960; archive 45 rows = **32 regraded + 13 uploaded covers**,
48/48 loaded, **0 broken, 0 stale v1 references**; all runtime modules present; **no
console errors**. Scanlines confirmed visible at card size by zooming the live page.

⚠️ **The GoDaddy forward still points at the FIRST manifest** (`sEIIpqWb…`), so the public
domain does not yet show this regrade. Update the forward to:

```
https://arweave.net/4R6eLhJ1PtAncF3Zu_vIehynWCWQYde_VCW0R-wO4WQ/index.html
```

### Grade rollback

Set `"treatmentVersion": 1` in `config/skyline-thumbnail-treatment.json` and re-run
`--rerender --apply`; records repoint to the untouched v1 assets' look. The v1 objects
themselves were never modified.
