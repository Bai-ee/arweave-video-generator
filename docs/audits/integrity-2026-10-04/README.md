# UE mix inventory, integrity + upload plan — 2026-10-04

**Start here** for anything about: which mixes exist vs. what the site shows, the Google Drive
master folder of mixes, what is/isn't on Arweave, the `artists.json` defects, and what the
wallet can afford to upload. Everything in this folder was produced read-only — **nothing has
been uploaded, nothing written to Firestore, nothing deployed** as of this writing.

Supersedes the "current state" of `Bballi_Portfolio/docs/plans/UNDERGROUND_EXISTENCE_ARTISTS_JSON_INTEGRITY_MASTER_PLAN.md`
(2026-09-20). That plan's method still applies; its defect list is updated in §3 below.

---

## 1. Where the site actually is (three versions — know which one you mean)

| Version | What | Notes |
|---|---|---|
| **Local** | `website/*.html` generated from `website/templates/**` + `website/artists.json` | Served locally at `http://127.0.0.1:8080/` (`python3 -m http.server` in `website/`) |
| **Deployed** | manifest `4R6eLhJ1PtAncF3Zu_vIehynWCWQYde_VCW0R-wO4WQ` | Reachable only by manifest URL. Gateway path lookups can 404 transiently — fetch pages by their tx id from `arweave.net/raw/<manifest>` |
| **Public** | manifest `Mgsqk3g6UhlE7risYYCmLdVozv1hXAmYDaYP5Eiq5Xc` | What `undergroundexistence.info` (GoDaddy 302 forward) serves. Repointing the forward is an owner action |

## 2. Site vs. `artists.json` (checked 2026-10-04)

- **Artists:** all 18 in `artists.json` have an artist page + residents card on all three versions. None hidden.
- **Mix records:** 44 records, but only 36 distinct audio txids (cross-listings — see §3).
- **Records not shown anywhere:**
  - BAI-EE `HPIT Promo Mix` — txid truncated to 19 chars (`neH-PrcWXd71JCZayTX`), 404. Needs the real 43-char txid (probably has that prefix).
- **Local only (fixed locally, not deployed):** AKILA `A drink and a smoke on the veranda` — now has its own audio `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE` (200, audio/mpeg). On deployed/public it shared "...Head Ass!!!"'s txid and was deduped away.
- **Live only (dropped locally):** BAI-EE `Love Manifesto #3` on old audio `Ex1n-m0Pdea7Kfm3a0F9IkT875idE2tyyE1LtXbxZSs`; local data keeps only `Love Manifesto 3` (`obNw2Z8…`). A deploy removes it.

## 3. `artists.json` defects (validator: `node scripts/validate-artists-json.mjs`)

7 structural fails today → 3 after the staged mechanical patch.

| Defect | State | Artifact |
|---|---|---|
| VIVA ACID Tyrel-mirror subdomain typo (extra `2`) | patch staged | `mechanical-patch.json` |
| Years: TYREL `2024h`, CESAR `'01'`, STAR TRAXX `Circe '95` | patch staged (Star Traxx value = owner choice) | `mechanical-patch.json` |
| Chicago Skyway `For Hakim` duplicate row | patch staged (delete bare-URL row) | `mechanical-patch.json` |
| `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` shared by BLUE JAY Studio409 + BERNARD BADIE | open. File = 166,272,103 B, 2:53:11 → almost certainly **Blue Jay's**. Bernard's real file is the Drive `Bernard Badie & Sean Smith.mp3` (66,196,419 B) — needs upload | `conflict-probes.md` |
| `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` shared by `For Hakim` + `Little White Earbuds Mix` | open — no ID3 tags; needs owner listen / wallet audit | `conflict-probes.md` |
| HPIT truncated txid | open | — |

**Intentional, NOT defects:** VIVA ACID's four rows and RED EYE's row mirror the Bai-ee / Andrew Emil / Sassmouth / Tyrel Viva Acid '24 sets. Leave them.

Patched copy for review: `artists.patched.json` (validator output: `validator-patched.md`).

### Applying fixes — Firestore write path (read this before writing anything)

- Source of truth is Firestore doc **`system/artists`**, one field `artists` (array of artists, each with a `mixes` array). `website/artists.json` is a derived copy — `syncFirebaseToWebsiteJSON` (lib/WebsiteSync.js) overwrites it, so editing the JSON alone is lost on the next sync.
- ⚠️ **Do NOT use `syncWebsiteJSONToFirebase`, `api/manage-artists.js`, `upload-artists-json.js` or `update-artist-images-from-manifest.js` to apply a patch** — they overwrite the whole doc and wipe fields the website JSON doesn't carry (`trax`, `artistFolder`).
- Safe path: fresh backup (pattern: `outputs/release-tmp/backup-system-artists-*.json`) → Firestore **transaction** on `system/artists` that matches by artistName + mixTitle + current `mixArweaveURL` (indexes shift) and changes only patched fields (model: `transactionalArtistPatch` in `lib/SkylineThumbnailJobs.js`) → dry-run → `syncFirebaseToWebsiteJSON` → validator → regenerate pages.

## 4. The master mix folder (Google Drive)

**`https://drive.google.com/drive/folders/1QKrRx516SCJcTqCrROna7fFCyYiqk_uT`** — owner confirmed (2026-10-04) this holds all the mixes.
- Root: 44 MP3s (owner bryanballi@gmail.com). Subfolder **"Mixes with Reviews\*"** (`1CfiIebuKQQuzghqGXLv--scPbKMd3KiM`, owner smokey18st@yahoo.com): 50 MP3s, most byte-identical copies of root files plus the Farina / Specter / Stephen P / Cesar Ramirez / WBMX / Derrick Carter Smartbar originals.
- Full listing (folder, Drive file id, bytes, name): **`gdrive-mixes-raw.tsv`** — 59 distinct files by size, ~6.0 GB. Reviews-folder rows that duplicate a root file are omitted.
- The Drive connector cannot download 50–300 MB files into an agent session. **Owner downloads the folder locally**, then uploads run from disk.

## 5. Mixes we have that are NOT on the site — `not-on-site-by-size.md`

**53 files, 5.15 GB**, smallest → largest. Matched to site records by artist/title (byte-size confirmation against Arweave was attempted but the gateway GraphQL was flaky — re-check before linking).

Excluded as already on the site (name match): Blue J Live at Hush SF, Star Traxx MegaMix, John Simmons circa 2005, Andrew Emil Flammable Vol. 15, Sean Smith Martians, Frankie Vega vs Jevon Jackson, RELEASE 7/20. Also excluded `7AMushroom.mp3` (byte-identical to `Farina or Tyrel?_7AMushroom.mp3`).

Flags inside the list: AlexZelenka (exactly 1 MB → truncated copy), Pipeline 7/20 (same byte size as RELEASE 7/20 → likely same recording), Farina-or-Tyrel 7AM Mushroom and Turbotic (artist unknown), Chicago Style w/ Pipeline (no review), Specter "Brutus" / Craig Alexander are label releases not mixes (per `reviews-crosswalk.md`).

## 6. Wallet + budget (2026-10-04)

- Deploy wallet: `5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw` (`ARWEAVE_WALLET_ADDRESS`).
  - AR: **6.0742 AR** (`arweave.net/wallet/<addr>/balance`)
  - Turbo credit: **1.1805 AR-eq** (`payment.ardrive.io/v1/account/balance/arweave?address=<addr>`) — was 6.8 at the Sep release; the W7a auto-archive work spent it.
  - Price: **12.577 AR / GB** (Turbo `v1/price/bytes/1000000000`; L1 `arweave.net/price/<bytes>` agrees). Whole 53-file list ≈ 65 AR (~$290 @ $4.46/AR).
- ⚠️ **The wallet's private key is in public git history** (`UE_RELEASE_HANDOFF.md` §1a). Spending it is fine; do not fund it further until the key is rotated.

### Wallet audit result (A2) — the "missing" audio is largely already on Arweave

`wallet-audio-inventory.md/.json`: 125 real audio files signed by this wallet (2024-04 → 2026-09), **90 not referenced by `artists.json`**. No second wallet found. Exact-byte matching of the 53-file backlog against it → `backlog-vs-wallet.json`:

**10 backlog mixes are ALREADY on Arweave — link them, do not re-upload:**

| Mix | txid |
|---|---|
| Bai-ee Live at Fame 2002 | `mnRlhQ3J4VexZUivOgXCg_NeFMGHI5BtLGHTrBrT9Qc` |
| Terry Mullan New School Fusion 1 Side A | `Rbwm0Aa9via1H5165udq6xYXMwn1tefCbET_Ni3GlhU` |
| Terry Mullan New School Fusion 1 Side B | `0HBQ3sn6bDWX_AJKIHAuyBAQPoeBjfeBrvxuRYNv0C0` |
| Turbotic | `u9prk038Y2wg9YWV8iQz4eW_F5L72qxbPTc05MaBmss` |
| Bernard Badie vs Sean Smith (fixes the Bernard record) | `QBIYGHbuJNH7wIVklXn5sV80be4xPhmNtiBYespycmg` |
| Loft Livin 2 (Bai-ee) | `mqNUzO51zSc7r_hrVFEzYnSG1XeixPGu-lnBDfWH1x0` |
| Stephen P Red Light Special | `P_U-SfG3oW_4_VjeYkbgGXaXfOch2Vra_NNSgpEo1Ek` |
| AlexZelenka Ghost DJ (the 1 MB truncated copy) | `kc_nE7UPbahj3uUQBOHYdq_JHDiZWlNsL7kN6rxOK7A` |
| Pipeline 7/20 = byte-identical to the RELEASE 7/20 file already on site | `IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU` (owner: whose set is it?) |
| Jevon Jackson Live Mic TFU 2009 | `26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y` — see mislabel below |

**Record fixes the wallet evidence makes possible (all link-only, zero AR):**
- HPIT Promo Mix → `HwmSQMRK-H-PrcWXd71JCZayTXN44tBxpeVmyj8Qjhk` (90 MB; the broken URL was a mangled substring). Duplicate upload `N7C68mee…` exists.
- BERNARD BADIE → `QBIYGHbu…` (above). Blue Jay keeps `pk_RL…` (`Live_at_Studio_409_-_NYE_2024.mp3`).
- Chicago Skyway Little White Earbuds → `xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U` (`Chicago_Skyway_LWE.mp3`); `5lOn…` stays For Hakim.
- ⚠️ JEVON JACKSON record "Frankie Vega B2B Jevon Jackson" points at the **Live Mic solo** file (`26lgzy…`, byte-identical to Drive `Jevon_Jackson_(Live_Mic)…`). The real Frankie Vega vs Jevon Jackson file is `VlhqIPXb3Ia6HrD8zvJkS9Ma6_wTOY-nD1fDUZ6xRtM` (unreferenced). Fix: retitle the existing record or repoint it and add the other.
- Also unreferenced but present: Star Traxx MegaMix `KslgETTCyXrvb5mcShyc4HPrBtrwRe1o4H2WxVbjV1U` (site's Star Traxx record points at a different-size file `3Pl3Q…`), Andrew Emil Flammable Vol 15 `_iEzHmgrRzf7mPqHcjzCPPu-SEjI8MQKCvI16Y4F7js` (site's Flammable '19 is a different file `RtGE…`), Naree 41st Bday, Jaggy Viva Acid closing set, two Josh Z/Bai-ee Podlasie sets, Bai-ee 303 Day, Traxx "Unknown Musical Structures" A/B, Acidman Stargazers `.m4a`. Full list with best-guess identities in `wallet-audio-inventory.md`.

**Truly missing from Arweave: 43 files, 4.54 GB ≈ 57.1 AR.**

### Upload batch 1 (revised after the wallet audit) — fits "all but 1 AR" (budget 6.25 AR) — NOT YET APPROVED/RUN

| # | Mix (Drive filename) | MB | AR |
|---|---|---|---|
| 1 | Farina or Tyrel?_7AMushroom.mp3 | 14 | 0.18 |
| 2 | BillyO&Ksquared_Live@_7_20_Underground (2).mp3 | 39 | 0.49 |
| 3 | Mystic Bill Monochrome Sets Winter 1998 Side B.mp3 | 40 | 0.51 |
| 4 | mark_almaria_sol_tape_B_side.mp3 | 42 | 0.52 |
| 5 | mark_almaria_sol_tape_A_side.mp3 | 43 | 0.54 |
| 6 | Sneak_Signature_Sounds_Side_B.mp3 | 44 | 0.55 |
| 7 | SYNC_ Paul Johnson - Jive Turkey (2012).mp3 | 49 | 0.62 |
| 8 | Gusto_Bai-ee_2000.mp3 | 52 | 0.65 |
| 9 | BRC@UndergroundExistence_7_20_07.mp3 | 52 | 0.66 |
| 10 | Phil Free Art_live_atUndergroundExistence_circa_2005.mp3 | 53 | 0.67 |
| 11 | Popkan(live).mp3 | 54 | 0.68 |

Total ≈ **6.05 AR**, leaving ≈1.2 AR. Next up (doesn't fit): Bai-ee_A Love Hate Relationship_98.mp3 (0.68 AR). (The earlier 12-file batch included Live at Fame, Terry Mullan A/B and Turbotic — all four turned out to be on Arweave already.)

Before running batch 1: (a) check the wallet/ArDrive inventories (§7) — anything already on Arweave is linked, not re-uploaded; (b) explicit owner spend approval for the batch; (c) tag each upload (Content-Type `audio/mpeg`, File-Name, Artist, Title); (d) add records via the safe Firestore path (§3), then sync + regenerate + deploy.

## 7. Files in this folder

| File | From | What |
|---|---|---|
| `README.md` | integration | this index |
| `validator-live.md`, `validator-patched.md` | A1 | validator before/after |
| `mechanical-patch.json`, `artists.patched.json`, `artists.snapshot.json` | A1 | staged fixes + the snapshot they were built against |
| `conflict-probes.md`, `probe/` | A1 | size/duration/ID3 evidence for the shared txids |
| `reviews-crosswalk.md` / `.json`, `inputs/` (+`SOURCES.md`) | A4 | 67 reviews → 22 have records, 45 (+Popkan) don't; search keys per missing mix |
| `gdrive-mixes-raw.tsv` | integration | Google Drive master folder listing |
| `not-on-site-by-size.md` | integration | the 53-file upload backlog, sorted by size |
| `wallet-audio-inventory.md` / `.json` | A2 | every audio tx the wallet owns (L1 + bundled; 125 real, 90 unreferenced) |
| `backlog-vs-wallet.json` | integration | the 53-file backlog matched by exact bytes: 10 on Arweave, 43 missing |
| `ardrive-audio-inventory.md` / `.json` | A3 | ArDrive: 48 drives (40 public, 8 private). Mix library = public drive `underground_existence` (`5caa37e6-57bd-4875-9d12-45dda5484bfa`) → `/ue_website/audio/`. Adds **no** txids beyond A2; private drives are ~0.13 GB of 2024 project files, not mixes. No second wallet (same address in `agent_master_repo/{turbo-arfs-template,ZeroToArweave-StarterKit}/wallet.json`). Note `.env.local` `ARWEAVE_DRIVE_ID` points at an empty `CursorTest` drive |

Both inventories are complete: every mix that exists on Arweave is under wallet `5Gp_ilm…` (raw + ArDrive agree). The 43 "truly missing" files in `backlog-vs-wallet.json` were never uploaded by this wallet.

## 8. Related (same session, UI side)

- Homepage hero was redesigned to the **"Signal"** layout (CSS-only, `website/css/site.css` block "Featured hero — Signal stage"; `#featured-mix-hero` added to the dark island). Details in `UE_CSS_UI_HANDOFF.md` §12.
- Five review-only concept pages: `website/concept-1..5.html` + `website/concepts.html`, generated by `outputs/concepts/build-concepts.cjs` (git-ignored). Not deployed; safe to delete.
