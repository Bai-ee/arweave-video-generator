# Skyline thumbnail pipeline — implementation handoff

**Status:** code-complete, tested, locally verified. **Nothing has been applied to production data.**
Feature flag `SKYLINE_THUMBNAILS_ENABLED` is **off** by default and no backfill has run.

- Master plan: `../../Bballi_Portfolio/docs/plans/UNDERGROUND_EXISTENCE_SKYLINE_THUMBNAIL_PIPELINE_MASTER_PLAN.md`
- Frozen interface contract: `SKYLINE_THUMBNAIL_CONTRACT.md`
- Review artifacts (local, gitignored): `outputs/skyline-dryrun/lead-review/`

---

## 1. Two decisions needed before the first apply

### 1a. Source curation — **this is the real blocker**

The catalog currently enables **all 140** source videos: 6 in `assets/chicago-skyline-videos/`
(purpose-made Veo Chicago skyline renders) and 134 in `skyline/`. The `skyline/` prefix turned out
to be the **video generator's general Chicago b-roll pool, not curated skyline footage** — it
contains street-level dashcam driving, highway signs, a police van, a city bus, a tunnel, and one
clip with a hand over the lens.

The first dry run put **two frames of a finger over the lens** onto real mixes. Tightening the
quality gate (below) removed those and the worst motion blur, taking the batch to roughly 20 of 31
good-to-great. The remainder is a taste judgement about content, which automation cannot make.

**Review these before applying:**
- `outputs/skyline-dryrun/lead-review/contact-sheet-32-proposed.png` — what every mix would get
- `outputs/skyline-dryrun/lead-review/source-curation-sheet.png` — one frame per source, so you can
  reject sources wholesale; `source-curation-index.tsv` maps grid position → source id
- `contact-sheet-BEFORE-quality-tightening.png` — the same batch before the gate was fixed, kept as
  evidence of what the thresholds were letting through

To reject a source, set `"enabled": false` on it in `config/skyline-thumbnail-sources.json`.

⚠️ **The 6 curated Veo clips alone cannot cover 32 mixes.** Each is a single continuous camera move,
so its frames are near-duplicates of each other and the perceptual-hash gate collapses them. Some
`skyline/` uploads must stay enabled to reach 32 distinct stills. That is why the pipeline ships
with both collections on and curation left to you.

### 1b. The 13 mixes that already have real cover art

The brief said "every existing mix," but 13 mixes have genuine per-mix artwork (`/img/covers/*.jpg`
and bare Arweave TXIDs). Overwriting them would violate the never-overwrite rule, so they are
**excluded by default** and classified `uploaded`. They are reachable only via the explicit
`--include-uploaded` opt-in. `locked: true` records are refused even then.

---

## 2. Verified data reality (from live Firestore, read-only)

`system/artists` → 18 artists, 45 mixes, 17 trax. All 18 artists already have an image, so **artist
backfill has zero targets today**; that path exists for new artists.

| Mix image state | Count | Backfill default |
|---|---|---|
| `missing` (empty) | 19 | generate |
| `legacy-artist-image` (equals own artist image) | 10 | generate |
| `legacy-artist-portrait` (points at some `/img/artists/*.jpg`) | 3 | generate |
| `uploaded` (real per-mix cover) | 13 | **protected, skipped** |

⇒ **32 eligible mixes.** 44 unique mix keys for 45 records: Chicago Skyway's "For Hakim" exists
twice with the same artist, audio URL and title, so the two records legitimately share one key and
one asset (reported as `sharedWithDuplicateKey`).

⚠️ **Never classify from `website/artists.json`.** `WebsiteSync.js:76` fills empty mix images with
the artist image, so that file falsely shows 45/45 mixes as having artwork. Classification reads
Firestore only.

---

## 3. What was built

| Area | Files |
|---|---|
| Pure logic (no deps) | `lib/skyline/{keys,catalog,selection,imageAnalysis,flags,classify,records}.js` |
| Media service | `worker/lib/SkylineThumbnailService.js` |
| Source catalog | `config/skyline-thumbnail-sources.json` (140 sources), `scripts/build-skyline-source-catalog.mjs` |
| Persistence | `lib/SkylineAssignmentStore.js` (transactional + audit) |
| Job queue | `lib/SkylineThumbnailJobs.js`, `worker/run-thumbnail-jobs.mjs` |
| Backfill CLI | `scripts/skyline-thumbnails.mjs`, `scripts/skyline-report-template.js` |
| Ingestion + admin | `api/upload.js`, `api/manage-artists.js`, `public/index.html` (edited) |
| Static site | `lib/WebsiteSync.js`, `lib/WebsitePageGenerator.cjs` (edited) |
| Tests | `tests/skyline-*.test.mjs`, `tests/website-sync-skyline-meta.test.mjs`, `tests/page-generator-skyline-precedence.test.mjs`, `tests/fixtures/` |

**No new dependencies.** Frame extraction *and* WebP encoding both use the existing
`worker/node_modules/ffmpeg-static` binary (it ships `libwebp`). No `sharp`, no new `api/*.js` file
(the Vercel function budget was already at 11).

Key design points: assignment is deterministic and persisted — seeded from a stable
`sha256(artistFilename|txid|normalizedTitle)` key, never array position or wall-clock. Nothing
rotates images at page load. Output paths carry the assignment version
(`…/{mix|artist}/{key}-v{n}.webp`), so a regenerate never overwrites an asset in place.

---

## 4. Verification actually run

| Check | Result |
|---|---|
| Full suite `npm test` | **623 tests / 623 pass / 0 fail** |
| Pre-existing audio/player suites (regression baseline) | 107/107 — unchanged |
| Full dry run, all 32 eligible mixes | 32 proposed, 0 failed, **31 unique keys / candidates / dHashes / assets** |
| Dry run mutations | **0 Firestore writes, 0 Storage uploads** (upload adapter threw if called; never called) |
| Generated assets | 31 valid `960x960 VP8 WebP`, 22–122 KB |
| Determinism | same key + version ⇒ identical candidate and `contentHash` across fresh processes |
| Apply safety gate | refuses and exits **1** unless *both* `SKYLINE_THUMBNAILS_ENABLED=true` **and** `--yes-i-approve-apply`; dry run exits 0 |
| tmp cleanup | 19 sources downloaded → **0 files / 0 B** left after the run |
| Working tree | 0 pre-existing dirty entries reverted |

Local runs used a 25-source subset of the catalog because this machine's link to Firebase Storage
measured **0.04 MB/s** (3.8 MB took 92 s); pulling all 140 sources is ~2 GB. The real download path
is separately proven — the catalog builder downloaded and probed all 140, and end-to-end runs
against live Storage succeeded. Final assignments are produced at backfill time against whatever
catalog you approve, so they were never going to be fixed in advance anyway.

---

## 5. Defects found and fixed during review

| # | Severity | What was wrong |
|---|---|---|
| 1 | Critical | `restoreThumbnail` had **no protection check**: generate → admin uploads real `locked` art → restore silently **deleted the admin's artwork** and reverted to the pre-pipeline value. |
| 2 | High | `api/upload.js` called `updateArtistImage(...)` — never defined or imported. Every new-artist-with-artwork upload **500'd** after the Arweave image spend. Pre-existing since the endpoint-consolidation commit. |
| 3 | High | The job worker treated the idempotent `already-applied` skip as a **failure**, so a lease-expiry or crash replay marked an already-correct entity FAILED and the admin UI reported a permanent failure, inviting pointless retries. |
| 4 | High | `service.cleanup()` was **never called** by either caller — every run, dry runs included, leaked source videos (up to ~2 GB per full batch). |
| 5 | High | Two records sharing one stableKey each generated into **one asset path**: the second silently overwrote the first, leaving the first record's provenance describing a frame its file no longer contained. |
| 6 | Medium | The analysis pass scored the **squashed full 16:9 frame** while the render is a square centre crop — quality, blur and near-duplicate decisions were made on pixels that never ship. |
| 7 | Medium | `--include-uploaded` was **non-functional**: the plan marked entities targetable, the batch spent real ffmpeg time and a real Storage upload on them, then the write silently refused. Now threaded to the write layer; `locked: true` still absolute. |
| 8 | Medium | The blur gate was effectively a **no-op** — threshold 8 against frames measuring 119–1681. Retuned on measured data (`minLaplacianVar` 250, `minStdDev` 22, luminance 30–225), which removed the hand frames and worst blur. |
| 9 | Low | `.gitignore`'s blanket `*.json` silently excluded the source catalog **and** the test fixtures from version control. |

---

## 6. Known risks and limitations

- **Cross-run uniqueness is not enforced.** The collision-avoidance set is per-batch; it is not
  seeded from already-persisted `candidateId`/`dHash`. Uniqueness holds within the initial backfill
  (matching the plan's own wording) but two mixes ingested in separate later runs could collide.
  Worth a decision before months of incremental ingestion.
- **`tests/` is entirely untracked** — `git ls-files tests/` returns 0. The pre-existing 107-test
  suite has never been committed and neither will the new ones until someone `git add tests/`.
- The 6 Veo sources are 1280×720, so a square crop is 720² upscaled 1.33× to the 960 target.
  Imperceptible at card sizes; noted for completeness.
- `syncWebsiteJSONToFirebase` writes `{merge:false}` and reinitializes `trax: []`, so a reverse sync
  would drop all 17 trax. **Confirmed dormant — zero production call sites.** Pre-existing.
- `website/js/player.js` `randomizeFeatured()` re-implements the mix→artist image precedence
  client-side. It randomizes *which mix is featured*, not which image a mix gets, so each mix still
  shows its own persisted still. Pre-existing behavior, left alone.
- Automated rejection of frames containing unintended text/UI is **not implemented** (would need
  OCR and a new dependency). The per-source `enabled` flag plus contact-sheet review is the control.
- Another Claude session was editing this repo concurrently (`website/js/ue-*.js`,
  `tests/{mediasession,links,resume}-*`). Those files are unrelated to this pipeline.

---

## 7. Rollout — where you are and what runs next

Steps 1–3 of the plan's rollout are **done**: code landed flag-off, catalog built and validated
non-mutating, dry run + contact sheet produced. You are at the **review gate**.

```bash
# 1. Re-run the dry run yourself after curating the catalog (safe, non-mutating, no flag needed)
node scripts/skyline-thumbnails.mjs --target mix --report-dir outputs/skyline-dryrun/review-2

# 2. Inspect outputs/skyline-dryrun/review-2/report.html + previews/

# 3. Small approved batch (both gates required)
SKYLINE_THUMBNAILS_ENABLED=true node scripts/skyline-thumbnails.mjs \
  --target mix --limit 3 --apply --yes-i-approve-apply

# 4. Visually inspect the 3 on homepage/archive/artist pages, then full backfill (drop --limit)

# 5. Enable automatic generation for new uploads by setting SKYLINE_THUMBNAILS_ENABLED=true
#    in the server env. While it is off, ingestion honestly reports thumbnailStatus:'not-requested'.
```

**Rollback:** `previousMixImageFilename` / `previousArtistImageFilename` hold the pre-pipeline URL,
and every run writes an audit doc to `skyline_thumbnail_runs`. `store.restore()` (exposed as the
admin `restoreThumbnail` action) reverts a record and deliberately still works with the flag off.
Generated storage objects are retained on rollback, never deleted.

**Not done, by constraint:** no Arweave deploy, no media re-upload, no ArNS/GoDaddy change, no
commit, no production data mutated.
