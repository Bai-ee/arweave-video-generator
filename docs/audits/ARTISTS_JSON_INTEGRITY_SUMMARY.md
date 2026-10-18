# artists.json integrity pass — summary

**Date:** 2026-09-08
**Plan:** `UNDERGROUND_EXISTENCE_ARTISTS_JSON_INTEGRITY_MASTER_PLAN.md` (Bballi Portfolio workspace)
**Canonical file:** `website/artists.json`
**Wallet:** read-only. No upload, no delete, no spend, no deploy, no Firestore write.

## Outcome

| Check | Before | After |
|---|---|---|
| Mix records | 45 | 46 |
| Structural validator failures | 5 | **0** |
| Validator warnings | 1 | **0** |
| txids used by more than one record (outside the VIVA ACID / RED EYE mirrors) | 3 | **0** |
| Records live as `200` + `audio/*` | 43 / 44 | **46 / 46** |
| Repo test suite | 623 pass | **623 pass, 0 fail** |

All four hard cases are **fixed with distinct, live txids**. None fell through to the upload backlog.

## The four hard cases

Every reassignment below is backed by the file's own ArDrive **ArFS metadata**, fetched by `dataTxId` — not by
guesswork, and not by block-height proximity. Each recovered txid was then independently re-verified: HTTP `200`
`audio/mpeg`, byte size matching the on-chain `data.size`, and a seekable `206` from the range gateway the player
actually uses.

### 1. AKILA — two mixes sharing one file

The incumbent txid genuinely belongs to `...Head Ass!!!`; the veranda mix was the mis-pointed record.

| Record | txid | ArFS filename | Size |
|---|---|---|---|
| `...Head Ass!!!` (kept) | `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg` | `Akila _Head_Ass_Mix_June_2024.mp3` | 144,757,160 |
| `A drink and a smoke on the veranda` (**repointed**) | `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE` | `Akila  - A drink and a smoke on the veranda.mp3` | 143,982,743 |

### 2. BLUE JAY vs BERNARD BADIE — ⚠️ the plan's assumption was wrong

The plan and one workstream both reasoned that Blue Jay's listed `2:58` was placeholder data and that a 173-minute
file must be the 2009 Bernard Badie / Sean Smith b2b. **The file's own name says otherwise.**

| Record | txid | ArFS filename | Size |
|---|---|---|---|
| BLUE JAY `Live at Studio409 New York (2024)` (**kept**) | `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` | `Live_at_Studio_409_-_NYE_2024.mp3` | 166,272,103 |
| BERNARD BADIE `Live at UE (B2B Sean Smith)` (**repointed**) | `QBIYGHbuJNH7wIVklXn5sV80be4xPhmNtiBYespycmg` | `Bernard_Badie_vs_Sean_Smith.mp3` | 66,196,419 |

It is an **NYE** set, which is exactly why it runs 2h53m — and `2:58` was very likely `h:mm`, not a placeholder.
Had the size-based reasoning been applied without checking the filename, this pass would have moved a correct
record onto the wrong file and hidden the real defect.

### 3. CHICAGO SKYWAY — `Little White Earbuds Mix`

Same shape: the incumbent record was right, the other one was wrong.

| Record | txid | ArFS filename | Size |
|---|---|---|---|
| `For Hakim` (kept) | `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` | `Chicago_Skyway_For_Hakim.mp3` | 137,018,513 |
| `Little White Earbuds Mix` (**repointed**) | `xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U` | `Chicago_Skyway_LWE.mp3` | 128,644,924 |

The duplicate bare-URL `For Hakim` row was deleted (45 → 44 records).

### 4. BAI-EE — `HPIT Promo Mix` truncated txid

The broken 19-char fragment `neH-PrcWXd71JCZayTX` was **not** a prefix — `H-PrcWXd71JCZayTX` is a 17-char
substring in the middle of the real txid, so a prefix search alone would have missed it.

- Recovered: `HwmSQMRK-H-PrcWXd71JCZayTXN44tBxpeVmyj8Qjhk` (90,099,434 bytes)
- On-chain filename tag: `mix_1765174532981_bai-ee_2022_HPIT_Promo_Mix_Live.mp3` — names the mix outright.
- A byte-identical duplicate re-upload exists at `N7C68meeseuzXTsJUFP1Uxk5tYVTQVqhZHr6ci57glE`; the first is used.

## Everything else changed

- **VIVA ACID entry 4** — subdomain had an extra `2`; corrected base32 now resolves `200 audio/mpeg`.
- **CESAR RAMIREZ / Let Yourself Go** — `mixDateYear` `'01'` → `'01`.
- **TYREL WILLIAMS / Live at Podlasie** — `mixDateYear` `2024h` → `2024`.
- **STAR TRAXX** — artist image moved off `ardrive.net` to `arweave.net`; verified `200 image/jpeg`.
- **STAR TRAXX / Mix Tape** — `mixDateYear` `Circe '95` → `Circa '95`. Not on the plan's fix list, but the plan's own
  year pattern allows `Circa .+` and acceptance requires every year to pass, so it had to be fixed.
- **Durations** filled only from the actual audio (bitrate read from the file header × on-chain byte size), never invented:
  Blue Jay `2:58` → `173:12`, Bernard Badie `0:00` → `68:23`, For Hakim `0:00` → `57:05`, HPIT `60` → `62:34`.
- **Bernard Badie year** `??` → `2009`, sourced from the review text ("teamed up back in 2009 to play an
  UndergroundExistence party"), not from the upload date.
- **Two recovered mixes wired in** (existing artist, exact filename match, both verified live):
  BAI-EE `303 Day Acid Mix` (`SQzVJFt82rENFNs749eUydjJDiS-SV809PDjHE4D5Pg`, `2024`, `76:30`) and
  BAI-EE `Loft Livin' Vol. 2` (`mqNUzO51zSc7r_hrVFEzYnSG1XeixPGu-lnBDfWH1x0`, `??`, `69:19`).

## Wallet audit

- Address: `5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw` (derived only; the JWK lives inline in `.env.local` and was
  never read, printed, copied, or committed).
- **28,003** transactions enumerated (owner-scoped GraphQL, paginated to exhaustion, unioned across `arweave.net` and
  the Goldsky endpoint, plus a bundled-item cross-check). **154 are audio.**
- ArDrive CLI (`list-all-drives`) failed persistently against every gateway tried (404/504), so **0 drives were listed**.
  Filenames were recovered instead from ArFS file-metadata transactions. That gap is why the four hard cases were
  re-verified here by exact `dataTxId` lookup rather than trusted from proximity pairing.

## Upload backlog

45 reviewed mixes had no hosted file at the start. After the audit:

| Status | Count | Meaning |
|---|---|---|
| hosted-now | 2 | Found on the wallet and wired into `artists.json` this pass. |
| found | 2 | On the wallet, exact filename match, **not** wired up — each needs a new artist page/image (Stephen P, Terry Mullan) and Terry Mullan additionally needs a 2-part A/B convention decision. No upload needed. |
| ambiguous | 4 | Plausible candidate, identification not certain. Needs a human ear before wiring. |
| not-on-arweave | 37 | Searched all 154 audio files, no real candidate. **These are the genuine upload candidates.** |

Detail and evidence per row: `upload-backlog-2026-09-08.md`.

## Verification performed

- `npm run validate:artists` — 0 structural failures, 0 warnings, 0 duplicate-txid groups.
- `npm run validate:artists -- --live` — **46/46** records `200` + `audio/*`.
- `npm test` — 623 pass, 0 fail.
- Every changed record confirmed embedded in its regenerated artist page, and confirmed to return a seekable
  `206 Partial Content` with the exact expected total byte count from `arweave.fllstck.dev` (a gateway the player
  actually uses).
- `git diff --stat -- website/js/player.js` — **empty**.

### What could NOT be verified

The plan asks for a click-play check on each changed mix in a local build. The site was served locally and the player
was driven through a real click: it selected the correct recovered txid and routed to a range-capable gateway. But
audio never advanced past `readyState 0`, **including on records this pass never touched**. A bare `new Audio()` in
that browser never fired `loadedmetadata` *or* `error`, while `fetch()` of the same URL returned `206` instantly — so
media playback is blocked in the automated browser context, not broken by these changes. **Audible playback is
therefore unconfirmed and still needs a human click-through in a normal browser.**

## Site pages regenerated

Artist pages **embed** mix URLs, so `artists.json` alone does not change the site. Pages were regenerated with the
repo's own `lib/WebsitePageGenerator.cjs` `generatePages()`. Two side effects to be aware of in the diff:

1. Mix numbering shifted (e.g. `045` → `044`) because the duplicate `For Hakim` row was removed. Expected.
2. Unrelated pages changed a small amount because the checked-in HTML predated the current generator (image `alt`
   text now carries an artist prefix). Pre-existing generator drift, surfaced — not introduced — by this pass.

## Firestore

Not written, as required. For the owner to apply later:

- The correct sync is **`syncWebsiteJSONToFirebase()`** in `lib/WebsiteSync.js`, which reads `website/artists.json`.
- ⚠️ **Do not run `upload-artists-json.js`.** It reads the root `COMPLETE_ARTISTS_JSON.json`, which is stale
  (14 artists / 27 mixes vs. the canonical 18 / 46) and would push bad data over the corrected records.
- Records whose data changed and therefore need re-syncing: AKILA `A drink and a smoke on the veranda`,
  BLUE JAY `Live at Studio409 New York (2024)`, BERNARD BADIE `Live at UE (B2B Sean Smith)`,
  Chicago Skyway `For Hakim` and `Little White Earbuds Mix`, BAI-EE `HPIT Promo Mix` / `303 Day Acid Mix` /
  `Loft Livin' Vol. 2`, VIVA ACID entry 4, CESAR RAMIREZ `Let Yourself Go`, TYREL WILLIAMS `Live at Podlasie`,
  STAR TRAXX (artist image + `Mix Tape` year).

## Open items for the owner

1. **Audible playback check** on the changed mixes in a real browser (see above).
2. **Stephen P** and **Terry Mullan** files are on the wallet and ready to wire up; both need an artist page and image,
   and Terry Mullan needs a 2-part A/B decision.
3. **Four ambiguous candidates** need an ear before being wired or uploaded.
4. `Loft Livin' Vol. 2` was added under **BAI-EE** (the wallet filename is `loft_livin_2_(Bai-ee).mp3` and the review
   credits Bai-ee), but **Vol. 1 currently sits under ACIDMAN**. Pre-existing; worth reconciling.
5. BAI-EE carries both `Love Manifesto #3` (`0:00`) and `Love Manifesto 3` (`1:00`) on different txids, and
   `Live in Hawaii (Asylum)` has the malformed duration `60`. Observed, out of this plan's scope, left untouched.
6. Nothing here is committed. The worktree also contains substantial unrelated in-progress work by the owner.
