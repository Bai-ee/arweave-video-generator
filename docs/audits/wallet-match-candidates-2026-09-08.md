# Wallet match candidates for the 45 reviewed-but-unhosted mixes — 2026-09-08

Read-only fuzzy match of the crosswalk's 45 "no hosted mix" reviews (`docs/audits/inputs/reviews-vs-arweave-crosswalk.md`) against the full wallet audio inventory (`wallet-inventory-2026-09-08.md`, 154 audio transactions, filenames recovered via ArDrive ArFS metadata pairing — see that doc's header for the ArDrive-CLI-failure/GraphQL-fallback note). Method: normalize (lowercase, strip punctuation/articles, split camelCase and letter-digit boundaries), then score `titleKeywordOverlap*2 + artistKeywordOverlap*3` against every candidate filename. txids already used elsewhere in `artists.json` (the 22 already-matched reviews, the "hosted but no review" rows, and the 4 corrected hard-case txids from this audit's four-hard-case resolution) are excluded from candidacy so an unrelated review can't "claim" a file that's already accounted for. Every row was additionally hand-checked against the full 154-title list to catch tokenizer misses (e.g. `303DayMix` as one camelCase blob) and to drop generic-word coincidences (venue names, "dj", bare day/night numbers, same-prolific-artist-no-title-evidence) that the raw score alone would have accepted as false positives — see the Note column and the "dropped after hand review" line.

- **found_on_arweave: 4 reviews (5 txids — one review is a 2-part A/B upload)**
- **ambiguous: 4**
- **not_on_arweave: 37**

Script: `scripts/audit/fuzzy-match-reviews.mjs`. Re-run: `node scripts/audit/fuzzy-match-reviews.mjs docs/audits/inputs/cesar-ramirez-mix-reviews.json docs/audits/wallet-inventory-2026-09-08.json <outFile> <excludeTxidsFile>` (exclude-txids file = every txid currently in `website/artists.json`, one JSON array).

## found_on_arweave (4 reviews, 5 txids)

Strong match (artist token match AND >=2 title keywords match), hand-verified — txid is copy-pasteable into `artists.json` once a human confirms by ear.

| Review (artist / title) | Published | Best wallet candidate | txid | Size | Score (title/artist overlap) | Note |
|---|---|---|---|---|---|---|
| Bai-ee / 303 Day Acid Mix | 2024-07-13 | Bai-ee_(303DayMix)_2024.mp3 | `SQzVJFt82rENFNs749eUydjJDiS-SV809PDjHE4D5Pg` | 175.1 MB | 10 (t2/a2) | Exact filename match. A byte-identical duplicate re-upload also exists at `9x-NgzS63J6EPubaiWxaR2lvD1z5ORZzU2FF7Ep4or4` (same 183,609,510-byte size) — same file, extra copy on the wallet; use the first txid. |
| Terry Mullan / New School Fusion Vol. 1 | 2024-09-29 | Terry Mullan - New School Fusion 1 - Side A.mp3 **and** Terry Mullan - New School Fusion 1 - Side B.mp3 | `Rbwm0Aa9via1H5165udq6xYXMwn1tefCbET_Ni3GlhU` (Side A, 38.9 MB) + `0HBQ3sn6bDWX_AJKIHAuyBAQPoeBjfeBrvxuRYNv0C0` (Side B, 38.8 MB) | — | 12 (t3/a2) | Explicit filenames, uploaded in the same batch (2024-06-01). "Vol. 1" is a 2-part A/B release — both txids are needed to cover the review; add as two mix records or one two-part record depending on the site's convention. |
| Bai-ee / Loft Livin' Vol. 2 | 2024-11-07 | loft_livin_2_(Bai-ee).mp3 | `mqNUzO51zSc7r_hrVFEzYnSG1XeixPGu-lnBDfWH1x0` | 126.9 MB | 10 (t2/a2) | Explicit "2" in the filename matches "Vol. 2" (Vol. 1 territory, `loftlivin.mp3` → `0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI`, is already the hosted "Loft Livin" record in artists.json). |
| Stephen P / Red Light Special | 2024-12-05 | Stephen P - Red Light Special.mp3 | `P_U-SfG3oW_4_VjeYkbgGXaXfOch2Vra_NNSgpEo1Ek` | 131.3 MB | 9 (t3/a1) | Exact filename match. |

## ambiguous (4)

Partial match, hand-verified as plausible on a distinctive keyword — needs a human ear before wiring into `artists.json`.

| Review (artist / title) | Published | Best wallet candidate | txid | Size | Score (title/artist overlap) | Note |
|---|---|---|---|---|---|---|
| Bai-ee / Live @ Podlasie | 2024-08-16 | JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825.mp3 | `Sb8CBWdSOevl6-IPs5J9Wq2PQErvvGNCLoPD4QjEgok` | 239.2 MB | 8 (t1/a2) | "Podlasie" is a distinctive venue match, but this file is explicitly tagged as a B2B "ONES" set at Viva Acid (dated 7/18/25) — the review may instead refer to a plain solo Bai-ee Podlasie set not otherwise on the wallet. Confirm by ear. |
| Jevon Jackson / Live @ True Family Unit Anniversary Party 2009 | 2024-09-12 | Frankie_Vega_vs_Jevon_Jackson_TFU_Anniversary_09.mp3 | `VlhqIPXb3Ia6HrD8zvJkS9Ma6_wTOY-nD1fDUZ6xRtM` | 65.7 MB | 8 (t1/a2) | Distinct from the already-hosted "Frankie Vega vs Jevon Jackson / TFU Anniversary 2009 (Live Mic Mix)" (`26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y`, already in `artists.json`) — this filename has no "Live_Mic" suffix, so it looks like a second/alternate recording of the same event rather than a duplicate. Ear-check to confirm it isn't the same set re-encoded. |
| Bai-ee / Live @ Fame, Millennium Park | 2024-10-17 | Bai-ee(Live_at_Fame).mp3 | `mnRlhQ3J4VexZUivOgXCg_NeFMGHI5BtLGHTrBrT9Qc` | 28.9 MB | 8 (t1/a2) | "Fame" is a distinctive venue match; filename literally says "Live_at_Fame". Fairly high confidence. |
| Traxx / Misc. | 2024-10-24 | 01 Traxx - Unknown Musical Structures - Side A.m4a **and** Side B.m4a | `XAF6I5y_afkmKqnquGPm_aYeA68Ce8uL1pgcP2_765o` (Side A) + `BkXJV9KU4YpGzmygpmZ9QyBuh4-RpyV3CwQRBUtZnIA` (Side B) | 106.5 MB + 101.5 MB | 3 (t0/a1) | The review title itself is a generic "Misc." — no title keywords to score. "Traxx" is a rare, distinctive artist name (unlike "Bai-ee", which has 20+ files and makes any bare artist-name overlap meaningless — see "dropped after hand review" below) and this A/B release is the *only* Traxx content on the wallet, so it's a plausible fit worth an ear-check despite the low score. |

Dropped from ambiguous after hand review: "Cesar Ramirez / Old School Chicago House Vol. 1" scored a raw t1/a0 hit against `Terry Mullan - New School Fusion 1- SideB.mp3` purely on the shared word "school" — but "Old School" and "New School" are opposites and the artists are unrelated; this is a coincidental collision, not evidence. Moved to not_on_arweave below (Cesar Ramirez has exactly one file on the wallet, `tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM` = "Let Yourself Go", already hosted and already excluded from candidacy here).

## not_on_arweave (37)

No wallet audio transaction scored a real title-keyword match (title overlap = 0), or the only overlap was a coincidental generic-word/same-prolific-artist collision with no title evidence (noted where relevant). Candidates for the upload backlog.

| Review (artist / title) | Published | Note |
|---|---|---|
| Specter / Brutus | 2024-07-18 | No candidate — zero keyword overlap with any of the 154 wallet audio files. |
| Craig Alexander / Rolla' Disco | 2024-07-22 | No candidate. |
| Gant Garrard aka Gant-Man / Groove Tha Feelin' | 2024-08-15 | No candidate. |
| Blue J / Shuffle Like This | 2024-08-22 | No candidate. (Blue Jay/Josh Zeitler's two confirmed wallet files — `BlueJ_Live_Hush_SF_101814.mp3` and `Live_at_Studio_409_-_NYE_2024.mp3`, the latter resolved as hard-case B above — neither is "Shuffle Like This".) |
| Derrick Carter / Textures | 2024-08-30 | No candidate. |
| Cesar Ramirez / Destination (Deep House Mix) | 2024-09-01 | No candidate. Cesar Ramirez has exactly one file on the wallet (`tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM` = "Let Yourself Go"), already hosted. |
| Phil Free Art / Live @ UndergroundExistence Block Party 2005 | 2024-09-15 | No candidate. |
| Jimmy Krok / Live @ Underground Existence Party 2005 | 2024-09-19 | No candidate. |
| BRC / Live @ UndergroundExistence 2007 | 2024-09-20 | No candidate. |
| Paul Johnson / Jive Turkey | 2024-09-22 | No candidate. |
| Mark Almaria / Sol | 2024-09-27 | No candidate. |
| Mystic Bill / Monochrome Sets (Winter 98) | 2024-10-03 | No candidate. |
| Mastiksoul / Live December 2007 | 2024-10-04 | No candidate. |
| DJ Sneak / Signature Sounds (Side B) | 2024-10-10 | No candidate. |
| Bai-ee / A Love Hate Relationship | 2024-10-11 | No title-keyword match. Closest was `Bai-ee_(303DayMix)_2024.mp3` on artist-name overlap alone (already claimed by the 303 Day Acid Mix review above) — not real evidence. |
| Billy O & K-Squared / Live 7/20 Underground | 2024-10-13 | No candidate. The wallet's own "7/20 Underground" file (`IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU`, filename `RELEASE_Live@_7_20_Underground.mp3`) is already hosted as DJ Release's own recording of that party and is excluded from candidacy here; it does not carry Billy O/K-Squared's name. |
| DJ Automoton / Live @ Block Party, July 2007 | 2024-10-18 | No candidate. |
| Bai-ee / Barack | 2024-10-20 | No title-keyword match (artist-only coincidence with `Bai-ee_(303DayMix)_2024.mp3`, already claimed elsewhere) — not real evidence. |
| Ryan Tinsley / Live @ Underground Existence Party 2008 | 2024-10-25 | No candidate. |
| Bai-ee / Live @ 7/20 Underground | 2024-10-27 | No candidate (see the Billy O & K-Squared row above — the wallet's one "7/20 Underground" file is DJ Release's own, already hosted). |
| Jesse Lee vs Matt Martin / Jesse Lee vs Matt Martin | 2024-10-31 | No candidate. |
| Bai-ee / Gusto | 2024-11-01 | No title-keyword match (artist-only coincidence) — not real evidence. |
| Kiddo & Antiphase / Mix 7-15-06 | 2024-11-03 | No candidate. |
| Pipeline / Live @ Underground Party 7/20/07 | 2024-11-08 | No candidate (see the Billy O & K-Squared row above). |
| Cesar Ramirez / Old School Chicago House Vol. 1 | 2024-11-10 | No real candidate — see "dropped from ambiguous" note above (coincidental "school" collision with an unrelated Terry Mullan file; Cesar Ramirez's one wallet file is already hosted). |
| Cesar Ramirez / The Return | 2024-11-15 | No candidate. |
| Mark Farina / Live @ Smartbar 4/26/2002 | 2024-11-17 | No candidate. The wallet's "Smartbar" file (`nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM`) is already hosted as "Bai-ee vs Acidman / Live @ Smartbar" — a coincidental shared venue name, not evidence this is Mark Farina's separate Smartbar set from the same era. |
| Cesar Ramirez / Keep On Going | 2024-11-22 | No candidate. |
| Mark Farina / Seed Syllable | 2024-11-24 | No candidate. |
| Mark Farina / Parallel | 2024-11-28 | No candidate. |
| Derrick Carter / Live @ Smartbar 4/26/2002 | 2024-11-29 | No candidate (same Smartbar-venue-name caveat as the Mark Farina row above). |
| Specter / Bridgeport Blues | 2024-12-01 | No candidate. |
| DJ Lil' John / Phan-Tas-Tique | 2024-12-06 | No candidate. |
| Kenny "Jammin" Jason / Live on WBMX Chicago | 2024-12-08 | No candidate. |
| Julian "Jumpin" Perez / Live on WBMX Chicago | 2024-12-12 | No candidate. |
| Specter / Pendulum | 2024-12-13 | No candidate. |
| Stephen P / Let's Drop (Deep House Mix) | 2024-12-15 | No title-keyword match. Closest was `Stephen P - Red Light Special.mp3` on artist-name overlap alone — already claimed by the Red Light Special review above; Stephen P has only that one file on the wallet. |

All 37 are upload-backlog candidates (no evidence the file already exists under a different name on this wallet).
