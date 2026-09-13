# Skyline thumbnail pipeline — implementation contract (v1)

**Read this before writing any code.** It is the frozen interface contract between the parallel
implementation workstreams. Master plan (rationale, phases, acceptance criteria):
`/Users/bballi/Documents/Repos/Bballi_Portfolio/docs/plans/UNDERGROUND_EXISTENCE_SKYLINE_THUMBNAIL_PIPELINE_MASTER_PLAN.md`

If you believe a signature here is wrong, **do not change it unilaterally** — report it to the lead
agent. Other workstreams are coding against it in parallel.

---

## 0. Verified repository facts (already confirmed — do not re-investigate)

- Firestore source of truth: `system/artists` document, shape `{ artists: [ ... ] }`.
  Artist keys: `artistName, artistFilename, artistImageFilename, artistGenre, mixes, trax, artistFolder`.
  Mix keys: `mixTitle, mixArweaveURL, mixDateYear, mixDuration, mixImageFilename`.
- 18 artists, 45 mixes, 17 trax. All 18 artists already have `artistImageFilename`.
- Mix image state **in Firestore** (the truth):
  - 19 mixes: `mixImageFilename` empty → `missing`
  - 10 mixes: `mixImageFilename === artist.artistImageFilename` → `legacy-artist-image`
  - 3 mixes: `mixImageFilename` points at some `/img/artists/*.jpg` portrait → `legacy-artist-portrait`
  - 13 mixes: real distinct cover art (`/img/covers/*.jpg` or a bare Arweave TXID URL) → `uploaded`
- ⚠️ `lib/WebsiteSync.js:76` does `mix.mixImageFilename || firebaseArtist.artistImageFilename`, so
  `website/artists.json` shows 45/45 mixes "having" an image. **Never classify from `artists.json`.**
- Durable skyline sources already in Firebase Storage (bucket `editvideos-63486.firebasestorage.app`):
  - `skyline/*.mov` (37 objects, `video/quicktime`, ~10–22 MB each)
  - `assets/chicago-skyline-videos/*.mp4` (6 objects, `video/mp4`, Veo-generated)
  Public URL form: `https://storage.googleapis.com/<bucket>/<objectPath>`.
  `worker/outputs/video-cache/**` is a dev cache — **never a runtime dependency**.
- `worker/node_modules/ffmpeg-static` exists and its binary **has `libwebp`**. Extraction *and* WebP
  encoding are done with that one binary. **Do not add `sharp`, `fluent-ffmpeg` usage, or any new
  dependency to any `package.json`.**
- Vercel function budget: `vercel.json` already declares 11 functions. **Do not add a new
  `api/*.js` file** — new HTTP behavior folds into existing handlers (`api/manage-artists.js`).
- `lib/WebsitePageGenerator.cjs:200` is the single mix-image precedence chokepoint:
  `image: mix.mixImageFilename || artist.artistImageFilename || ''`. `imageHtml()` (line ~232)
  already emits `loading="lazy"`/`eager`, `fetchpriority`, and a `.cover-fallback` fallback.
- Two genuine duplicate mix records exist (same artist + same `mixArweaveURL`):
  `akila.html` (2 different titles, same audio) and `chicagoskyway.html` ("For Hakim" twice).
  Identical records legitimately resolve to the same key/thumbnail; the dry-run report must
  flag them as `duplicateRecord: true` rather than pretend 45 unique keys exist.

---

## 1. Non-negotiable rules

1. **Feature flag** `SKYLINE_THUMBNAILS_ENABLED` — default **false**. Read it only through
   `lib/skyline/flags.js`. While false: no generation, no enqueue, no mutation. Explicit CLI
   `--apply` still requires the flag to be on **and** `--yes-i-approve-apply`.
2. **Never overwrite** a record whose resolved origin is `uploaded` or whose meta has
   `locked: true`. Not in backfill, not on retry, not on regenerate-all.
3. **Never mutate** `mixArweaveURL`, audio URLs, `mixDuration`, `mixDateYear`, `mixTitle`,
   `trax[]` audio fields, or anything in `mix-range-proxy/`.
4. **No FFmpeg / no video download inside any `api/*.js` handler.** API handlers only read state
   and enqueue/patch job documents.
5. **Dry run is non-mutating**: no Firestore write, no Storage write, no `website/artists.json`
   write, no page regeneration. Dry-run previews go to `outputs/skyline-dryrun/<runId>/` (local,
   gitignored) only.
6. **No Arweave deploy, no media re-upload, no GoDaddy/ArNS change.** Do not call
   `lib/WebsiteDeployer.js`, `lib/ArweaveUploader.js`, `lib/ArNSUpdater.js`, or
   `api/deploy-website.js` from any new code path.
7. **Preserve the dirty working tree.** The repo has many unrelated modified/deleted files. Touch
   only files in your ownership list. Never run `git checkout/restore/stash/clean/reset`, never
   commit, never `npm install`.
8. Tests must pass under the existing runner: `npm test` → `node --test tests/*.test.mjs` from the
   repo root. Root `node_modules` has **no** ffmpeg package, so **any module a root test imports
   must not `import` ffmpeg-static at module top level** — resolve the binary lazily inside a
   function, and accept an injected runner.

---

## 2. Module ownership (do not edit files outside your list)

| Workstream | Owns (create unless noted) |
|---|---|
| **A — sources & media** | `config/skyline-thumbnail-sources.json`, `scripts/build-skyline-source-catalog.mjs`, `lib/skyline/catalog.js`, `lib/skyline/keys.js`, `lib/skyline/selection.js`, `lib/skyline/imageAnalysis.js`, `worker/lib/SkylineThumbnailService.js`, tests `tests/skyline-catalog.test.mjs`, `tests/skyline-keys.test.mjs`, `tests/skyline-selection.test.mjs`, `tests/skyline-thumbnail-service.test.mjs` |
| **B — data model & backfill** | `lib/skyline/flags.js`, `lib/skyline/classify.js`, `lib/skyline/records.js`, `lib/SkylineAssignmentStore.js`, `scripts/skyline-thumbnails.mjs`, `scripts/skyline-report-template.js`, tests `tests/skyline-flags.test.mjs`, `tests/skyline-classify.test.mjs`, `tests/skyline-records.test.mjs`, `tests/skyline-assignment-store.test.mjs`, `tests/skyline-backfill-cli.test.mjs` |
| **C — ingestion & admin** | `lib/SkylineThumbnailJobs.js`, `worker/run-thumbnail-jobs.mjs`, **edit** `api/manage-artists.js`, **edit** `public/index.html`, tests `tests/skyline-jobs.test.mjs`, `tests/skyline-ingestion.test.mjs` |
| **D — static site** | **edit** `lib/WebsiteSync.js`, **edit** `lib/WebsitePageGenerator.cjs`, tests `tests/website-sync-skyline-meta.test.mjs`, `tests/page-generator-skyline-precedence.test.mjs` |
| **E — test & review** | `tests/skyline-integration.test.mjs`, review report (no source edits without lead approval) |

`.gitignore`: only workstream B may append (`outputs/skyline-dryrun/`), as a single additive line.

---

## 3. Frozen interfaces

### 3.1 `lib/skyline/keys.js` (pure, `node:crypto` only) — owner A

```js
export function extractArweaveTxId(mixArweaveURL) // -> string ('' if none)
export function normalizeTitle(title)             // lowercase, collapse ws, strip non-alnum
export function deriveMixKey({ artistFilename, mixArweaveURL, mixTitle })  // -> 16 lowercase hex
export function deriveArtistKey({ artistFilename })                         // -> 16 lowercase hex
export function deriveIdempotencyKey({ entityType, stableKey, assignmentVersion }) // -> string
export function seedFromKey({ entityType, stableKey, assignmentVersion })   // -> unsigned 32-bit int
```

- `extractArweaveTxId`: last non-empty path segment of the URL (handles both
  `https://arweave.net/<txid>` and `https://<b32>.arweave.net/<txid>`); `''` when unparseable.
- `deriveMixKey` = first 16 hex chars of `sha256('mix|' + artistFilename + '|' + txid + '|' + normalizeTitle(mixTitle))`.
- `deriveArtistKey` = first 16 hex chars of `sha256('artist|' + artistFilename)`.
- `deriveIdempotencyKey` = `` `${entityType}:${stableKey}:v${assignmentVersion}` ``.
- `seedFromKey` = first 4 bytes (big-endian, unsigned) of `sha256('v' + assignmentVersion + '|' + entityType + '|' + stableKey)`.
- Must be stable forever. Never include array index, date, or `Math.random()`.

### 3.2 `lib/skyline/catalog.js` (pure) — owner A

```js
export const CATALOG_PATH_DEFAULT // 'config/skyline-thumbnail-sources.json'
export function validateCatalog(obj)        // -> { ok, errors[], catalog }  (throws never)
export function loadCatalog({ fs, catalogPath } = {}) // -> catalog (throws actionable Error)
export function enabledSources(catalog)     // -> sources[] sorted by id asc
export function buildCandidateInventory(catalog) // -> Candidate[] sorted by candidateId asc
```

Catalog file shape (versioned, committed):

```json
{
  "catalogVersion": 1,
  "assignmentVersionDefault": 1,
  "bucket": "editvideos-63486.firebasestorage.app",
  "output": {
    "storagePrefix": "website/generated-thumbnails/v1",
    "size": 960, "quality": 82, "format": "webp"
  },
  "sampling": { "fractions": [0.10,0.25,0.40,0.55,0.70,0.85], "jitterSeconds": 0.75 },
  "quality": {
    "minLuminance": 18, "maxLuminance": 238,
    "minStdDev": 12, "minLaplacianVar": 8,
    "maxDHashHammingForDuplicate": 6
  },
  "sources": [
    {
      "id": "skyline-0001",
      "storagePath": "skyline/user_upload_1781931166824_6_IMG_1336.mov",
      "publicUrl": "https://storage.googleapis.com/<bucket>/skyline/...",
      "contentType": "video/quicktime",
      "sizeBytes": 14743552,
      "durationSec": 12.4,
      "width": 1920, "height": 1080,
      "collection": "skyline",
      "enabled": true,
      "excludeRanges": [[0, 0.5]],
      "notes": ""
    }
  ]
}
```

- `Candidate` = `{ candidateId, sourceVideoId, storagePath, timeSec }` where
  `candidateId = \`${sourceVideoId}@${timeSec.toFixed(2)}\`` and `timeSec` =
  `clamp(durationSec * fraction + jitter, 0.2, durationSec - 0.2)`, jitter =
  `((sha256(candidateSeedString) first byte / 255) * 2 - 1) * jitterSeconds`, rounded to 2 dp,
  where `candidateSeedString = sourceVideoId + '|' + fraction`. Candidates inside an
  `excludeRanges` window are dropped at inventory time.
- `validateCatalog` must reject: missing/duplicate `id`, missing `storagePath`, non-positive
  `durationSec`, empty `sources`, `fractions` outside `(0,1)`, unknown `format`.

### 3.3 `lib/skyline/imageAnalysis.js` (pure, Buffer in) — owner A

```js
export function analyzeGrayRaster(buffer, width, height)
// -> { luminanceMean, stdDev, laplacianVar }
export function dHashFromGrayRaster(buffer, width, height) // -> 16-char hex (64-bit dHash)
export function hammingHex(a, b)  // -> int
export function scoreCandidate(stats, qualityCfg) // -> { ok, reasons: string[], score: number }
```

Input is 8-bit single-channel raw (`gray` pixel format), row-major, `width*height` bytes.
`dHashFromGrayRaster` box-downsamples to 9×8 then compares horizontal neighbours.
`scoreCandidate` reject reasons use exactly these strings: `'too-dark'`, `'too-bright'`,
`'low-contrast'`, `'blurry'`.

### 3.4 `lib/skyline/selection.js` (pure) — owner A

```js
export function selectCandidate({
  candidates,          // Candidate[] from buildCandidateInventory (already sorted)
  seed,                // from seedFromKey()
  used,                // { candidateIds: Set<string>, dHashes: string[] }
  isEligible,          // (candidate) => boolean   — quality/pHash gate, may be sync-cached
  maxDHashHamming      // number
}) // -> { candidate, probeCount } | { candidate: null, exhausted: true, probeCount }
```

Deterministic probing: `start = seed % n`; `stride = 1 + (seed >>> 8) % (n - 1)` reduced until
`gcd(stride, n) === 1`; visit `(start + i*stride) % n` for `i` in `[0, n)`. Skip a candidate when
its id is in `used.candidateIds`, when `isEligible` is false, or when its dHash is within
`maxDHashHamming` of any hash in `used.dHashes`. First survivor wins. Same inputs ⇒ same output,
always.

### 3.5 `worker/lib/SkylineThumbnailService.js` — owner A

```js
export function createSkylineThumbnailService({
  catalog,                 // loaded catalog object
  storage,                 // { download({storagePath, destPath}), upload({localPath, storagePath, contentType, metadata}) -> {publicUrl, generation} }
  runFfmpeg,               // optional injected async ({args, expectStdout}) => { stdout: Buffer, stderr: string }
  tmpRoot,                 // optional; default os.tmpdir()/skyline-thumbs
  logger                   // optional { info, warn, error }
} = {})
// -> service
```

Service surface:

```js
service.generate({
  entityType,        // 'mix' | 'artist'
  stableKey,         // 16-hex from keys.js
  assignmentVersion, // int >= 1
  used,              // { candidateIds:Set, dHashes:[] } — caller-owned, mutated by caller not service
  dryRun,            // boolean; true => render preview to previewDir, never upload
  previewDir         // required when dryRun
})
// -> {
//   ok: true,
//   imageUrl,          // '' when dryRun
//   localPath,         // preview path when dryRun, else tmp path already deleted
//   meta: {
//     origin: 'generated-skyline', assignmentVersion, sourceVideoId, sourceTimeSec,
//     candidateId, dHash, generatedAt, contentHash, storagePath, width, height,
//     bytes, locked: false, serviceVersion: 1
//   },
//   rejected: [{ candidateId, reasons }],   // audit of skipped candidates
//   probeCount
// }
// on failure -> { ok: false, error: { code, message } }   (never throws for expected failures)
```

- `code` is one of: `'no-eligible-candidate'`, `'source-download-failed'`,
  `'ffmpeg-failed'`, `'encode-failed'`, `'upload-failed'`, `'catalog-invalid'`.
- Source videos are downloaded to `tmpRoot` and **cached per process run** (same source reused
  across entities), then deleted in a `finally` — on success *and* failure.
- Two ffmpeg passes per candidate examined: (1) analysis — `-ss t -i src -frames:v 1
  -vf scale=256:256 -pix_fmt gray -f rawvideo -` captured from stdout; (2) final render only for
  the winner — square crop + `scale=960:960:flags=lanczos` + `-c:v libwebp -quality <q>`.
- ffmpeg binary: `await import('ffmpeg-static')` **inside** the runner function, with fallback to
  `process.env.FFMPEG_PATH` then `'ffmpeg'`. Never at module top level (root tests import this file).
- `contentHash` = sha256 hex of the encoded WebP bytes.
- Output storage path: `${output.storagePrefix}/${entityType}/${stableKey}-v${assignmentVersion}.webp`
  (version in the filename ⇒ never overwrite in place).
- Upload metadata: `cacheControl: 'public, max-age=31536000, immutable'`, contentType `image/webp`.
- The service **never** touches Firestore.

### 3.6 `lib/skyline/flags.js` — owner B

```js
export function skylineThumbnailsEnabled(env = process.env) // -> boolean, default false
export function assertSkylineEnabled(env = process.env)     // throws actionable Error when off
```
True only for `'1' | 'true' | 'yes'` (case-insensitive) of `SKYLINE_THUMBNAILS_ENABLED`.

### 3.7 `lib/skyline/classify.js` (pure) — owner B

```js
export const IMAGE_STATE = {
  MISSING: 'missing',
  LEGACY_ARTIST_IMAGE: 'legacy-artist-image',
  LEGACY_ARTIST_PORTRAIT: 'legacy-artist-portrait',
  GENERATED: 'generated',
  UPLOADED: 'uploaded',
  INVALID: 'invalid-url'
};
export function classifyMixImage({ mix, artist }) // -> { state, reason, eligible, locked }
export function classifyArtistImage({ artist })   // -> { state, reason, eligible, locked }
export function isProtected(state, meta)          // -> boolean
```

Rules, in order:
1. meta `locked === true` → not eligible (state from meta origin).
2. meta `origin === 'generated-skyline'` → `GENERATED`, eligible only for explicit regenerate.
3. empty/whitespace value → `MISSING`, eligible.
4. not `http(s)://` → `INVALID`, eligible (and reported).
5. equals `artist.artistImageFilename` → `LEGACY_ARTIST_IMAGE`, eligible.
6. path contains `/img/artists/` → `LEGACY_ARTIST_PORTRAIT`, eligible.
7. otherwise → `UPLOADED`, **not eligible** (protected).

Artist images: only `MISSING` / `INVALID` are eligible; anything else is `UPLOADED` and protected.

### 3.8 `lib/skyline/records.js` (pure) — owner B

```js
export function buildImageMeta({ generatedMeta, previous })  // -> meta object per plan
export function applyMixAssignment({ artist, mixIndex, imageUrl, meta })
// -> { artist: <new artist object>, changed: boolean, skipped?: reason }
export function applyArtistAssignment({ artist, imageUrl, meta })
export function restoreMixAssignment({ artist, mixIndex })   // -> previous* → live fields
export function restoreArtistAssignment({ artist })
```

- Pure: returns new objects, never mutates inputs.
- Writes `mixImageFilename` + `mixImageMeta` (or `artistImageFilename` + `artistImageMeta`).
- Records `previousMixImageFilename` / `previousArtistImageFilename` **only on the first
  generated overwrite** (never clobber an already-stored previous value).
- Refuses (returns `changed:false, skipped:'protected'`) when the target is protected.

### 3.9 `lib/SkylineAssignmentStore.js` — owner B

```js
export function createAssignmentStore({ db, docPath = 'system/artists', now = () => new Date() })
store.readAll()                       // -> { artists, raw }
store.buildPlan({ target, filters })  // -> Plan (pure over read data; no writes)
store.applyEntityAssignment({ entityKey, entityType, artistFilename, mixIndex, imageUrl, meta })
  // -> { applied, skipped, reason } — Firestore transaction, re-verifies protection inside the txn
store.writeAudit(runRecord)           // -> collection 'skyline_thumbnail_runs' doc
store.restore({ entityType, artistFilename, mixIndex })
```

- Every write is a Firestore `runTransaction` on `system/artists` that re-reads, re-locates the
  entity **by artistFilename + derived key (never by array index alone)**, re-checks protection,
  patches only that entity's image fields, and writes back the whole `artists` array.
- One entity per transaction ⇒ a mid-batch failure leaves no half-written record.
- Audit doc per run: `{ runId, startedAt, finishedAt, mode, flagEnabled, counts, entries[] }` where
  each entry has `{ entityType, entityKey, artistFilename, mixTitle, before, after, status, reason }`.

### 3.10 `scripts/skyline-thumbnails.mjs` (CLI) — owner B

```
node scripts/skyline-thumbnails.mjs [options]

  --dry-run                  (DEFAULT — always assumed unless --apply given)
  --apply                    mutate; requires SKYLINE_THUMBNAILS_ENABLED=true AND --yes-i-approve-apply
  --yes-i-approve-apply
  --target mix|artist|both   default both
  --limit N
  --artist <artistFilename|artistName>
  --mix-key <16-hex>
  --include-uploaded         opt-in ONLY; overrides nothing by itself — still refuses locked:true
  --regenerate               bump assignmentVersion for already-generated entities
  --assignment-version N
  --report-dir <path>        default outputs/skyline-dryrun/<runId>
  --json                     machine-readable summary on stdout
```

Must emit, in the report dir: `report.json`, `report.csv`, `report.html` (contact sheet: proposed
image, artist — mix title, state, source video, timestamp, candidate id, dHash, collision/probe
count, skip reason). Exit code `0` on success, `1` on hard failure, `2` when any entity failed but
the run completed.

### 3.11 `lib/SkylineThumbnailJobs.js` — owner C

```js
export const JOB_STATUS = { QUEUED:'queued', RUNNING:'running', DONE:'done', FAILED:'failed' };
export const THUMBNAIL_STATUS = { UPLOADED:'uploaded', GENERATING:'generating', GENERATED:'generated', FAILED:'failed', NOT_REQUESTED:'not-requested' };
export function createThumbnailJobQueue({ db, collection = 'skyline_thumbnail_jobs', now = () => new Date(), leaseMs = 5*60*1000 })
queue.enqueue({ entityType, entityKey, artistFilename, mixIndex, mixTitle, assignmentVersion, requestedBy })
  // -> { jobId, created: boolean }   idempotent on idempotencyKey; existing queued/running/done job is reused
queue.claimNext()        // -> job | null   (lease via transaction; expired leases reclaimable)
queue.complete(jobId, { imageUrl, meta })
queue.fail(jobId, { code, message })   // increments attempts; retryable until maxAttempts (3)
queue.retry(jobId)                     // admin action: failed -> queued, attempts preserved
queue.statusFor({ entityType, entityKey })  // -> THUMBNAIL_STATUS + job summary
```
Job doc id = `deriveIdempotencyKey()` so a retried upload can never create a second asset.

### 3.12 `api/manage-artists.js` new actions — owner C

Add to the existing `switch (action)`; do not restructure the handler. All are admin-scoped the same
way the file already is, return `{ success, ... }`, and never run ffmpeg:

- `thumbnailStatus` → `{ entityType, entityKey }` → status + meta + job summary
- `requestThumbnail` → enqueue (no-op returning `not-requested` when the flag is off)
- `regenerateThumbnail` → enqueue with `assignmentVersion + 1`
- `retryThumbnail` → `queue.retry`
- `restoreThumbnail` → `store.restore` (previous* → live)
- `lockThumbnail` / `unlockThumbnail` → set `meta.locked`
- `setUploadedArtwork` → set image + `origin:'uploaded'`, `locked:true` (explicit-upload path)

`addMix` / `addTrack` / `updateArtist` behavior change: `mixImageFilename` becomes optional; after
the record is persisted **successfully**, enqueue a generation job when it is absent and the flag is
on. Enqueue failure must be caught and reported in the response as
`thumbnail: { status:'failed', reason }` — it must **never** fail the mix/track/artist write and must
never fail an audio upload.

### 3.13 `worker/run-thumbnail-jobs.mjs` — owner C

```
node worker/run-thumbnail-jobs.mjs [--max N] [--once] [--dry-run] [--job <id>]
```
Drains the queue with `claimNext()`, calls the service, then `store.applyEntityAssignment()`, then
`queue.complete()`/`queue.fail()`. Respects the feature flag. No auto Arweave deploy, no
`WebsiteSync` call unless `--sync` is passed explicitly.

### 3.14 `lib/WebsiteSync.js` changes — owner D

- Forward-compatible passthrough of the new fields in **both** directions:
  `artistImageMeta`, `previousArtistImageFilename`, `mixImageMeta`, `previousMixImageFilename`.
- Keep the existing fallback at line 76 (`mix.mixImageFilename || artist.artistImageFilename`) —
  it is the rendering fallback and must not change behavior for unassigned mixes.
- `syncWebsiteJSONToFirebase` currently writes `{merge:false}` and drops unknown fields; it must
  now preserve the new metadata fields so a reverse sync cannot silently erase provenance.
- Emit meta only when present — a record without meta must serialize byte-identically to today.

### 3.15 `lib/WebsitePageGenerator.cjs` changes — owner D

- Keep precedence exactly: mix image → artist image → existing `.cover-fallback`.
- Confirm (and where a surface bypasses it, route through) the single chokepoint at line ~200 so
  homepage cards, featured, archive rows, artist pages, residents/selectors, search, and the
  persistent player all read the same persisted value for a given mix.
- Alt text: `"<Artist> — <Mix title>"` for mix images, artist name for artist images.
- Preserve `loading`/`fetchpriority`/`decoding` and add explicit `width`/`height` where a square
  generated asset is known (960×960) to prevent layout shift. Never emit a source video URL.
- Output must remain relative-path/Arweave-path-manifest compatible; absolute `https://` image URLs
  are already the norm and stay allowed.

---

## 4. Definition of done per workstream

Your workstream is done when: your files exist, your tests are written, `npm test` passes from the
repo root with **zero failures across the whole suite** (not just your tests), you touched no file
outside your ownership list, `git status --short` shows no unexpected deletions, and you report
back: files changed, commands run + results, deviations from this contract, and open risks.

Report honestly. If something is blocked on credentials or an owner decision, say so plainly
instead of stubbing it out silently.
