# Wallet audio inventory (read-only audit, 2026-10-04)

Wallet `5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw` (env `ARWEAVE_WALLET_ADDRESS`; verified equal to the address derived in-process from `ARWEAVE_WALLET_JWK`). No other wallet address appears in the repo, docs, or git history (only `tUsH8_...` which is the ArNS ANT process, not a wallet).

## Index coverage

| Index | Txs for wallet | Note |
|---|---|---|
| arweave_net_graphql | 27800 | Rate-limited ("Rate limit exceeded") at 27,800 sorted height-ASC; newest ~250 (after 2026-07-21) not fetched; superset check: only 4 ids not in goldsky (JSON/HTML bundled items) |
| goldsky | 28046 | complete |
| ar_io_dev_graphql | 6 | L1 only (6 txs; includes the 137MB For Hakim/LWE file 5lOnZSh4 which goldsky lacks) |
| g8way_io_graphql | 0 | fetch failed (host unreachable) |

Union of unique ids: **28050**. Date range 2024-04-26 to 2026-09-20. 28,042 of Goldsky items are bundled data items; first activity is 2024-04, so nothing in this wallet predates 2024 (the 2022 HPIT mix was therefore uploaded now, in Dec 2025, from Firebase).

## Audio result

- Audio candidates: 163; real audio: **125**; test stubs (<1KB "Test Artist"): 37; non-audio: 1.
- Referenced by artists.json: 35 files (35 distinct txids).
- **Not referenced: 90.**
- artists.json URLs not found in the wallet: BAI-EE / HPIT Promo Mix (https://arweave.net/neH-PrcWXd71JCZayTX).

## Specific searches

- **HPIT Promo Mix (`neH-PrcWXd71JCZayTX`)**: FOUND. The truncated URL is a corrupted copy of `HwmSQMRK-H-PrcWXd71JCZayTXN44tBxpeVmyj8Qjhk` (`mix_1765174532981_bai-ee_2022_HPIT_Promo_Mix_Live.mp3`, 90.1MB, 2025-12-08, audio/mpeg, ID3 confirmed). A second identical-name upload exists: `N7C68meeseuzXTsJUFP1Uxk5tYVTQVqhZHr6ci57glE` (96 s later). Both resolve with ID3 header.
- **Akila**: `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg` = `Akila _Head_Ass_Mix_June_2024.mp3` (145MB); `m5yLoteq...` = `Akila - A drink and a smoke on the veranda.mp3` (144MB, ID3 album matches); `stPvvRNvH-wH1aY6TsCMGjnAJC4g8JZXcjhBDvL1p-I` = duplicate upload of the veranda mix (unreferenced). Both Akila mixes exist as distinct files; current artists.json already points them at distinct txids.
- **Blue Jay / Studio409**: `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` = `Live_at_Studio_409_-_NYE_2024.mp3` (166MB) is the real Blue Jay file. `QKq9wOwa...` = `BlueJ_Live_Hush_SF_101814`. No "Zeitler" named file.
- **Bernard Badie / Sean Smith Live at UE**: FOUND, unreferenced: `QBIYGHbuJNH7wIVklXn5sV80be4xPhmNtiBYespycmg` = `Bernard_Badie_vs_Sean_Smith.mp3` (66MB, 2024-06-03). The BERNARD BADIE record currently shares Blue Jay's `pk_RLPf...` (wrong); this is its correct file. `Sean_Smith_Martians.mp3` (`DlB2BFAY...`) is the referenced Martians Mixtape.
- **Chicago Skyway**: `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` = `Chicago_Skyway_For_Hakim.mp3` (137MB); `xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U` = `Chicago_Skyway_LWE.mp3` (129MB) = Little White Earbuds, UNREFERENCED, correct file for that record (currently mis-pointed to 5lOn). Also WWFM_2021, Chubby Podcast, Playing to the wall (all referenced).
- **2005-2008 UE live sets**: only `IwIa6k89` (ID3: "Dj PIPELINE Live @ 7/20/07 Underground", 2007) and `pLuskRb2` (John Simmons Live Mic @ UE, ID3 year 08) — both already referenced. No other 2005-2008 files; the wallet contains nothing older than 2024-04 and no unreferenced file is named/tagged for those years. Frankie Vega vs Jevon Jackson TFU Anniversary 09 (`VlhqIPXb...`, 69MB) is unreferenced (referenced Jevon record uses `26lgzySQ...`, a 58MB Live_Mic version).

## Audio NOT referenced in artists.json (>= 1MB; sorted newest first)

| txid | MB | date | file name | best-guess identity |
|---|---|---|---|---|
| `HwmSQMRK-H-PrcWXd71JCZayTXN44tBxpeVmyj8Qjhk` | 90.1 | 2025-12-08 | mix_1765174532981_bai-ee_2022_HPIT_Promo_Mix_Live.mp3 | Bai-ee - HPIT Promo Mix Live (2022) [Dec-2025 re-upload from Firebase] |
| `N7C68meeseuzXTsJUFP1Uxk5tYVTQVqhZHr6ci57glE` | 90.1 | 2025-12-08 | mix_1765174628335_bai-ee_2022_HPIT_Promo_Mix_Live.mp3 | Bai-ee - HPIT Promo Mix Live (2022) [Dec-2025 re-upload from Firebase] |
| `Ex1n-m0Pdea7Kfm3a0F9IkT875idE2tyyE1LtXbxZSs` | 105.61 | 2025-12-08 | mix_1765220815935_Bai-ee_Love_Manifesto_3_2025.mp3 | Bai-ee - Love Manifesto 3 (duplicate/regen of referenced file) |
| `xDaMKgz3vWI919a4urmlIeNHoJS9qlFuAwk8AURATA0` | 258.05 | 2025-09-07 | Lorelei_JoshZ_Baiee_Tyrel_71825_VIvaAcid.mp3 | Viva Acid set: Lorelei_JoshZ_Baiee_Tyrel_71825_VIvaAcid.mp3 |
| `ELq0pz16S3EoNi2-kK4Hj-xGj6iXhRrii18gAEiCkE4` | 90.2 | 2025-09-07 | Tyrel_Williams_71825_VIvaAcid.mp3 | Viva Acid set: Tyrel_Williams_71825_VIvaAcid.mp3 |
| `r14of_KCIHFq6jcvck3kzjbQ-_sYI1cY_xVHc252c_o` | 101.27 | 2025-09-01 | JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825 2.mp3 | Viva Acid / Podlasie set: JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825 2.mp3 |
| `Sb8CBWdSOevl6-IPs5J9Wq2PQErvvGNCLoPD4QjEgok` | 250.85 | 2025-09-01 | JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825.mp3 | Viva Acid / Podlasie set: JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825.mp3 |
| `lYNWEq1g00wVBHfUIj3g-brUcl--jT0AUtbvyy-wKwQ` | 142.16 | 2025-06-19 | Jaggy_Viva_Acid_Closing.mp3 | Viva Acid set: Jaggy_Viva_Acid_Closing.mp3 |
| `xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U` | 128.64 | 2025-04-19 | Chicago_Skyway_LWE.mp3 | Chicago Skyway - LWE = "Little White Earbuds Mix" (correct file for that record) |
| `nI3GXmal_1lh_f7mQ5i5wXq6oZvdqgUei12XTi88LpE` | 133.65 | 2025-03-07 | Narees_41st_Bday_Mix.mp3 | Naree 41st Birthday Mix (cf. referenced Naree Bday Mix 2022) |
| `P_U-SfG3oW_4_VjeYkbgGXaXfOch2Vra_NNSgpEo1Ek` | 137.69 | 2025-01-12 | Stephen P - Red Light Special.mp3 | Stephen P - Red Light Special.mp3 |
| `KslgETTCyXrvb5mcShyc4HPrBtrwRe1o4H2WxVbjV1U` | 43.75 | 2025-01-12 | StarTraxx_UnkownDj_MegaMix.mp3 | Star Traxx / Traxx material: StarTraxx_UnkownDj_MegaMix.mp3 |
| `xcNzaKE0drbUkbQ7UiTgK-9Rc1ERQT5TESzxE-Vc2NE` | 1.25 | 2025-01-05 | Directors_Cut_Promo_Full_Length.mp3 | Non-UE / miscellaneous (Directors_Cut_Promo_Full_Length.mp3) |
| `xHQT02omL43KeTJ3Yd3Tq8XBIQyHaZZSSGGFKRg8Dho` | 1.22 | 2025-01-05 | 13.wav | Non-UE / miscellaneous (13.wav) |
| `vJPh4NItxmxVUbQejaBH05Dom4WiTUoKrzTu_37z5ws` | 2.43 | 2025-01-05 | 7.wav | Non-UE / miscellaneous (7.wav) |
| `q5eBFi5Kx6JMQfC5Dfz3zAFnRBADUKYA75esvlVVbZM` | 1.78 | 2025-01-05 | UDOM.mp3 | Non-UE / miscellaneous (UDOM.mp3) |
| `lUGJ7L_b6lzTtd3UmqHBgxxWO23NGcVkPnQ-Gi-jm64` | 2.43 | 2025-01-05 | 11.wav | Non-UE / miscellaneous (11.wav) |
| `jQkpKc9KROu4c5m65ejZZ6T9XlOKG2QA-ONoQomG54Q` | 2.43 | 2025-01-05 | 6.wav | Non-UE / miscellaneous (6.wav) |
| `ixLcCh16pSzyOwvITxGlo4S164gcUM04i2BvZLnkrFs` | 1.96 | 2025-01-05 | critters_jingle.mp3 | Non-UE / miscellaneous (critters_jingle.mp3) |
| `bsbOvbge3Ndjbn_-MSYAlKTZJxj2D7DcZ6gJbVCgIQw` | 2.43 | 2025-01-05 | 12.wav | Non-UE / miscellaneous (12.wav) |
| `_Aq2yEE82OUjcEYX2RuyMkl-pHYxlAdSuW4DJfhJS4w` | 2.55 | 2025-01-05 | Artemas - i like the way you kiss me (official music video).mp3 | Non-UE / miscellaneous (Artemas - i like the way you kiss me (official music video).mp3) |
| `ZrFYLadLuGfySxIJQnIlSD7NoaFGIgEAAopii4ad8rg` | 1.22 | 2025-01-05 | 2.wav | Non-UE / miscellaneous (2.wav) |
| `WPB2d0MZDu_gTDe6tH5TpsU7ljGyGomSfURdLZhvfVk` | 2.43 | 2025-01-05 | 9.wav | Non-UE / miscellaneous (9.wav) |
| `I5O1WTo7PvA78OhIFfDCyRjUDa0cUYvj-1kWfCnmKmQ` | 2.43 | 2025-01-05 | 5.wav | Non-UE / miscellaneous (5.wav) |
| `H0255Npzen0vEY4DgAe_vLuVH05YzhZc99RFErzbgZE` | 2.43 | 2025-01-05 | 4.wav | Non-UE / miscellaneous (4.wav) |
| `FwuvasqrXhRONdw7VkyV08EBFrq-RKKAZsVl_Ad8YNI` | 2.43 | 2025-01-05 | 10.wav | Non-UE / miscellaneous (10.wav) |
| `DlpnYzEPR5b-CQ4Vvxdg-lDhZ-KnEhyWfaJDU9KiNrA` | 2.43 | 2025-01-05 | 8.wav | Non-UE / miscellaneous (8.wav) |
| `8oZ5029XgOEm9dn-Avpw2bchyEeAZ4S3q_Ww0Pqj58Y` | 2.43 | 2025-01-05 | 3.wav | Non-UE / miscellaneous (3.wav) |
| `yr0WtYDdessC855WEZMi6uKKqu_3bNyie_8h6fHfkwA` | 1.25 | 2025-01-05 | 20.mp3 | Non-UE / miscellaneous (20.mp3) |
| `KoYsr5VR-M8eG0HyMpRcJMexdTEA8sv77dt79an_RNY` | 2.55 | 2025-01-05 | 19.mp3 | Non-UE / miscellaneous (19.mp3) |
| `-zlSm85zWci6_J1DLMSuiWaXQXJu7_4md2CKaVuZQJI` | 1.78 | 2025-01-05 | 17.mp3 | Non-UE / miscellaneous (17.mp3) |
| `_iEzHmgrRzf7mPqHcjzCPPu-SEjI8MQKCvI16Y4F7js` | 283.19 | 2024-12-02 | Flammable_Mix_Series_Volume_15_ Andrew Emil_Seattle_Live.mp3 | Andrew Emil - Flammable Mix Series Vol. 15 (cf. referenced Flammable 19) |
| `pBoFykt0AtnVZ1Pw3VQ3V8aodGOqe7HXFc_Wz8AM_oI` | 126.98 | 2024-06-27 | Bai-ee_Jazz_&_Blues_Fathers_Day_Mix_2024.mp3 | Bai-ee - Fathers Day Jazz & Blues Mix 2024 (duplicate upload of m6ZORqpk) |
| `stPvvRNvH-wH1aY6TsCMGjnAJC4g8JZXcjhBDvL1p-I` | 143.58 | 2024-06-25 | Akila  - A drink and a smoke on the veranda.mp3 | Akila - A drink and a smoke on the veranda (duplicate upload of m5yLoteq) |
| `QBIYGHbuJNH7wIVklXn5sV80be4xPhmNtiBYespycmg` | 66.2 | 2024-06-03 | Bernard_Badie_vs_Sean_Smith.mp3 | Bernard Badie vs Sean Smith (Live at UE) - the correct file for the BERNARD BADIE record |
| `u9prk038Y2wg9YWV8iQz4eW_F5L72qxbPTc05MaBmss` | 41.15 | 2024-06-01 | Turbotic.mp3 | Non-UE / miscellaneous (Turbotic.mp3) |
| `kc_nE7UPbahj3uUQBOHYdq_JHDiZWlNsL7kN6rxOK7A` | 1.05 | 2024-06-01 | Ghost Dj minimal utopia mix.mp3 | Ghost DJ - minimal utopia mix |
| `XAF6I5y_afkmKqnquGPm_aYeA68Ce8uL1pgcP2_765o` | 106.51 | 2024-06-01 | 01 Traxx - Unknown Musical Structures - Side A.m4a | Star Traxx / Traxx material: 01 Traxx - Unknown Musical Structures - Side A.m4a |
| `VlhqIPXb3Ia6HrD8zvJkS9Ma6_wTOY-nD1fDUZ6xRtM` | 68.94 | 2024-06-01 | Frankie_Vega_vs_Jevon_Jackson_TFU_Anniversary_09.mp3 | Frankie Vega vs Jevon Jackson - TFU Anniversary 2009 |
| `Rbwm0Aa9via1H5165udq6xYXMwn1tefCbET_Ni3GlhU` | 40.81 | 2024-06-01 | Terry Mullan - New School Fusion 1 - SideA.mp3 | Terry Mullan - New School Fusion (Side A/B) |
| `MXHX-mnbewA9CY_EWGmxXB06ZFR2A05KjUUNSmy3iZo` | 72.92 | 2024-06-01 | Acidman_Stargazers vs Sunbathers (1).m4a | Acidman_Stargazers vs Sunbathers (1).m4a |
| `BkXJV9KU4YpGzmygpmZ9QyBuh4-RpyV3CwQRBUtZnIA` | 106.45 | 2024-06-01 | 01 Traxx - Unknown Musical Structures - Side B.m4a | Star Traxx / Traxx material: 01 Traxx - Unknown Musical Structures - Side B.m4a |
| `0HBQ3sn6bDWX_AJKIHAuyBAQPoeBjfeBrvxuRYNv0C0` | 40.64 | 2024-06-01 | Terry Mullan - New School Fusion 1- SideB.mp3 | Terry Mullan - New School Fusion (Side A/B) |
| `9x-NgzS63J6EPubaiWxaR2lvD1z5ORZzU2FF7Ep4or4` | 183.61 | 2024-06-01 | Bai-ee_(303DayMix)_2024.mp3 | Bai-ee - 303 Day Mix 2024 |
| `mqNUzO51zSc7r_hrVFEzYnSG1XeixPGu-lnBDfWH1x0` | 133.09 | 2024-05-31 | loft_livin_2_(Bai-ee).mp3 | Bai-ee - Loft Livin Vol. 2 |
| `mnRlhQ3J4VexZUivOgXCg_NeFMGHI5BtLGHTrBrT9Qc` | 30.34 | 2024-05-31 | Bai-ee(Live_at_Fame).mp3 | Bai-ee - Live @ Fame |
| `h68IUYbmtY_SFJNw-nACc8jTE0G4R3N5T-7GRyxITmY` | 7.28 | 2024-05-05 | 1.mp3 | Non-UE / miscellaneous (1.mp3) |
| `lUQBaEeX2B9bHdiEXvfzatuOkrWFSUhlQWPKmT-TRKg` | 7.28 | 2024-05-05 | 1_copy.mp3 | Non-UE / miscellaneous (1_copy.mp3) |
| `SQzVJFt82rENFNs749eUydjJDiS-SV809PDjHE4D5Pg` | 183.61 | 2024-05-05 | Bai-ee_(303DayMix)_2024.mp3 | Bai-ee - 303 Day Mix 2024 |

Small (<1MB) audio-typed items not listed above: 41 (ArDrive uploads 2025-01-05 of numbered wav/mp3 stems, 0-3MB: reels copy.mp3, critters_jingle_short.mp3, 8-bit Explosion 3.mp3, win.mp3, game_over.mp3, critters_theme.mp3, 1.wav, critters_fast_jingle.mp3, critters_jungle_outro_short.mp3, death.mp3, voice_falling.mp3, soundtrack.mp3, 16.mp3, 15.mp3, 18.mp3, spring.mp3, wings.mp3, voice_falling.mp3, soundtrack.mp3, platform_3_wind.mp3, platform_2_broken.mp3, voice_jump_2.mp3, power_up.mp3, voice_jump_1.mp3, money.mp3, game_over.mp3, death.mp3, press_button.mp3, voice_jump_2.mp3, platform_3_wind.mp3, spring.mp3, press_button.mp3, voice_jump_1.mp3, power_up.mp3, platform_2_broken.mp3, game_over.mp3, money.mp3, wings.mp3, death.mp3, soundtrack.mp3). Full detail in the JSON.

## Referenced audio (for completeness)

| txid | MB | date | file name | referenced by |
|---|---|---|---|---|
| `obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc` | 176.01 | 2026-06-19 | mix_1781836581226_Bai-ee_Love_Manifesto_3_2025.mp3 | BAI-EE / Love Manifesto 3 |
| `lcEj4KEz6SbHL8f3veGO4DJJmz4ECsItIwaJ3XMAiDo` | 147.46 | 2025-12-12 | mix_1765566264714_Naree_Bday_Mix_2022.mp3 | BAI-EE / Naree Bday Mix |
| `e7vfpyZKSyUOv_oro5FnO8Wuyf1wIKq9S4EhlvV8o18` | 53.44 | 2025-12-10 | mix_1765333790152_Bai-ee_Live_PA_SFTD_2018.mp3 | BAI-EE / Live Performance |
| `9LUIqtUo6qbpnVKJWQc87xQ5iROjWVVJao-8nhasndU` | 161.58 | 2025-12-09 | mix_1765239524190_Bai-ee_Live_At_Asylum_Hawaii.mp3 | BAI-EE / Live in Hawaii (Asylum) |
| `qmOWTuGHuf7-ed5jb9KD8NFE2ARXCZFGG6bk5Na-ZJ8` | 98.62 | 2025-12-08 | mix_1765222127470_Bai-ee_Mix_2011.mp3 | BAI-EE / Music Mix |
| `y-Lik8vT2L8XUxjPrUEd6METNjYXJfDY52DspUNEJf0` | 86.39 | 2025-12-08 | mix_1765236372492_SoundsFromTheDivide_112118_Bai-ee_live.mp3 | BAI-EE / Sounds From the Divide Mix 18 |
| `M-3TZEkPlLTvsI7NVHsqYZFuBZXcJQCm1tMkaj_f_v4` | 87.07 | 2025-12-08 | mix_1765236176638_SoundsFromTheDivide_1919_Bai-ee_live.mp3 | BAI-EE / Sounds From the Divide Mix 19 |
| `uOXdDRYvNv2OUm6tdEuyZvL1_1O8FtL7KvYBisNEg2o` | 162.19 | 2025-12-08 | mix_1765236538898_12_Step_Music_Mix_BB_51219_RESUBMITTED.mp3 | BAI-EE / 12 Step Music Mix |
| `Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM` | 93.48 | 2025-09-07 | Lorelei_71825_VIvaAcid.mp3 | LORELEI / Lorelei Live at Podlasie 7/18/25 |
| `MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo` | 120 | 2025-04-19 | Chicago_Skyway_Playing to the wall.mp3 | Chicago Skyway / Playing to the Wall |
| `yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk` | 168.69 | 2025-04-19 | Chubby-Podcast_Chicago-Skyway.mp3 | Chicago Skyway / Chubby Podcast |
| `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` | 137.02 | 2025-04-19 | Chicago_Skyway_For_Hakim.mp3 | Chicago Skyway / For Hakim; Chicago Skyway / For Hakim; Chicago Skyway / Little White Earbuds Mix |
| `08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs` | 161.04 | 2025-04-19 | Chicago_Skyway_WWFM_2021.mp3 | Chicago Skyway / WWFM |
| `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` | 166.27 | 2025-04-16 | Live_at_Studio_409_-_NYE_2024.mp3 | BLUE JAY (AKA Josh Zeitler) / Live at Studio409 New York (2024); BERNARD BADIE / Live at UE (B2B Sean Smith) |
| `QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik` | 192.12 | 2025-01-12 | BlueJ_Live_Hush_SF_101814 (1) (1).mp3 | BLUE JAY (AKA Josh Zeitler) / Blue Jay Live at Hush 2024 in San Francisco |
| `IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU` | 57.64 | 2025-01-12 | RELEASE_Live@_7_20_Underground (1).mp3 | DJ RELEASE AKA IKE / Live @ UE.info ?? |
| `pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM` | 76.66 | 2025-01-12 | johnsimmons_ue.mp3 | JOHN SIMMONS / Live @ UE.info ?? |
| `3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg` | 135.58 | 2024-12-18 | bai_ee_live_vivaacid_24.mp3 | BAI-EE / Live @ Viva Acid '24; VIVA ACID / Live @ Viva Acid '24 |
| `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM` | 280.17 | 2024-12-02 | Andrew_Emil_B2B_Redeye_VIVAACID_OCT2024.mp3 | ANDREW EMIL / Live @ Viva Acid '24; RED EYE / Live @ Viva Acid '24; VIVA ACID / Live @ Viva Acid '24 |
| `w0tHAsKEQphJzh-JEbQuxUWPv-0aHsecs7TIdONTd28` | 158.72 | 2024-11-11 | BAI-EE_RoughTimesMix.mp3 | BAI-EE / Rough Times |
| `o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0` | 234.34 | 2024-08-14 | Sassmouth_Live_At_Podlasie_July_2024.mp3 | SASSMOUTH / Live at Podlasie; VIVA ACID / Live @ Viva Acid '24 |
| `aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU` | 300.73 | 2024-08-14 | Tyrel_Williams_Live_At_Podlasie_July_2024.mp3 | TYREL WILLIAMS / Live at Podlasie; VIVA ACID / Live @ Viva Acid '24 |
| `tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM` | 203.92 | 2024-07-05 | Cesar_Ramirez_(LetYourselfGo).mp3 | CESAR RAMIREZ / Let Yourself Go |
| `m6ZORqpkbfO6OsbpNPGswjQFUmf7MonBRFgDXVjIeMQ` | 126.37 | 2024-06-27 | Bai-ee_Mix_(Jazz_&_Blues_Fathers_Day)_2024.mp3 | BAI-EE / Fathers Day Jazz Mix |
| `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE` | 143.98 | 2024-06-25 | Akila  - A drink and a smoke on the veranda.mp3 | AKILA / A drink and a smoke on the veranda |
| `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg` | 144.76 | 2024-06-17 | Akila _Head_Ass_Mix_June_2024.mp3 | AKILA / ...Head Ass!!! |
| `nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM` | 128.66 | 2024-06-08 | acidman_vs_bai-ee_smartbar.mp3 | ACIDMAN / Live @ Smartbar |
| `BUIC8eBMYSWBRU4lKSAQVr3r-spiWbK0uxZ5g7rl8Bw` | 150.18 | 2024-06-08 | love_manifesto_2.mp3 | BAI-EE / Love Manifesto (2) V-Day Mix |
| `0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI` | 114.59 | 2024-06-08 | loftlivin.mp3 | ACIDMAN / Loft Livin |
| `fxxlhewYkzcExqp_czyOd9p1rNzb2QWCF5akGYejbew` | 120.03 | 2024-06-08 | Love_Manifesto.mp3 | BAI-EE / Love Manifesto V-Day Mix |
| `RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA` | 283.19 | 2024-06-05 | Flammable Mix Series Volume 15_ Andrew Emil.mp3 | ANDREW EMIL / Live @ Flammable '19 |
| `fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g` | 108.03 | 2024-06-03 | Acidman_Stargazers_&_Sunbathers.mp3 | ACIDMAN / Stargazers vs Sunbathers |
| `DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y` | 188.69 | 2024-06-03 | Sean_Smith_Martians.mp3 | SEAN SMITH / Martians Mixtape |
| `3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ` | 43.75 | 2024-06-01 | StarTraxx.mp3 | STAR TRAXX / Mix Tape |
| `26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y` | 58.17 | 2024-06-01 | Jevon_Jackson_(Live_Mic)_TFU_Anny_2009.mp3 | JEVON JACKSON / Frankie Vega B2B Jevon Jackson |

## Method / limits

- GraphQL `owners:[addr]` paged 100/page on arweave.net (partial, rate-limited), arweave-search.goldsky.com (full), ar-io.dev (L1 only); g8way.io unreachable. Bundles owned by the wallet but signed by other keys (e.g. Irys/Turbo with a different signer) are not discoverable by owner query; none were found. Items in bundles whose items are signed by this wallet are all captured (Goldsky).
- Names for ArDrive uploads come from ArFS file-entity metadata (name/dataTxId) matched to the data tx; files with no tag name and no metadata hit are shown unresolved.
- Magic-byte probes: gateway ignored Range, so large files were read only up to 64KB then cancelled; where it timed out the Content-Type audio/mpeg (verified in GraphQL) is the evidence.
- Nothing was uploaded, signed, spent or modified. The JWK was read in-process only to derive the public address.

## Security note

UE_RELEASE_HANDOFF.md reports the wallet JWK is committed in public git history (commits 0f9120c, 946a140; repo public). This audit confirms commit 946a140 contains a key whose address is the live wallet. Owner action (rotation) is outside this task.
