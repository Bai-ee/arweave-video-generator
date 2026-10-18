# ArDrive (ArFS) audio inventory, 2026-10-04

Read-only. No keys, passwords or contents recorded. Source: GraphQL on arweave.net/graphql and arweave-search.goldsky.com/graphql (union, fully paginated), then metadata JSON fetched for public entities.

## Bottom line
- Only ONE wallet exists in any local context: `5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw`. No second wallet or keyfile belongs to a different address. (A stray address in a Bee-framework sample script has 0 transactions.)
- ArDrive does NOT hide extra audio. All 113 unique audio data txids in the wallet's public ArFS drives are already in the raw wallet audio inventory (`wallet-inventory-2026-09-08`): 0 are new to the sibling's enumeration. ArDrive only supplies filenames and folder paths.
- Private drives cannot hold the missing mixes: their encrypted file data totals 0.13 GB across 4936 txs, and only 1 is over 20 MB (33.8 MB, 2024-04-29). Mixes are 40-290 MB each.
- No file anywhere in the wallet's ArFS metadata is named HPIT / Hpit Promo, Mark Farina, Specter, Derrick Carter, Phil Free Art, Jimmy Krok, BRC, Ryan Tinsley, Pipeline, DJ Automoton, Billy O, K-Squared, or a 2005-2008 UE live set. (If those mixes exist on Arweave they were uploaded under non-ArDrive tags or from a different wallet.)
- 86 of 113 ArFS audio files are NOT referenced in website/artists.json; 23 of those are real mixes (>=20 MB). Highest-value finding: `Chicago_Skyway_LWE.mp3` (122.7 MB), probably the "Little White Earbuds" mix.

## Addresses
| Address | Where found |
|---|---|
| 5Gp_ilmFM4D0xwRmc9YcAxPo5B9zlfc4m35zcA1s_nw | .env.local (var names: ARWEAVE_WALLET_ADDRESS, ARWEAVE_WALLET_JWK, ARWEAVE_DRIVE_ID, ARWEAVE_FOLDER_ID); JWK address derived in-process and matches; also derived from agent_master_repo/turbo-arfs-template/wallet.json and agent_master_repo/ZeroToArweave-StarterKit/wallet.json (both the same wallet) |
| 9c9M56EDEgiH4m_I7dN-pG9qWhcGkUWCrzJcyCZHvAk | text in agent_master_repo/Master_Agent_Bee/**/wallet_setup.js; owns 0 transactions |

No other keyfiles found under ~/Downloads, ~/Documents, ~/Desktop, ~/Library/Application Support (find depth 4) or elsewhere on disk (depth 6). ~/.ardrive holds only a metadata cache (45 entries) listing the same drives; no config or credentials.

## ArFS entities
Raw 13377 entities (goldsky 13375, arweave.net 13359). Latest revisions: 48 drives, 957 folders, 12087 files. All tagged App-Name ArDrive-App (13290) or ArDrive-Core (85).

## Drives (48)
| Drive-Id | Privacy | Name | Created | Files | Folders | Audio |
|---|---|---|---|---|---|---|
| 5caa37e6-57bd-4875-9d12-45dda5484bfa | public | underground_existence | 2024-05-30 | 313 | 17 | 46 |
| cfe323fd-7dc4-483f-8ef6-ddc5858ae4b8 | public | Daily Quest Player | 2025-01-05 | 100 | 5 | 34 |
| eea2341c-d25a-417f-8fff-06e41af03602 | public | Music_Player | 2024-05-05 | 250 | 127 | 15 |
| 0bdd5681-acfe-4650-b44d-e82b58450bd7 | public | Thog | 2024-05-17 | 236 | 121 | 13 |
| c9512a7b-3ab5-4bd4-b821-e013f0a37e3f | public | UndergroundExistence_Optimized | 2025-04-15 | 281 | 30 | 5 |
| d93dfb9a-adf2-42cb-865a-2132c3c62a98 | public | bai-ee_music_archive | 2024-05-05 | 2253 | 23 | 1 |
| 74f64d71-292d-4dc9-880c-94fcb84c3c69 | private | (encrypted) | 2024-04-29 | 4713 | 25 | 0 |
| 19dc71e6-ffae-4b8e-b883-7db417faab31 | public | Cruno | 2024-06-04 | 3259 | 400 | 0 |
| f1bc4e52-5e56-4837-9ee0-3e2a7b9de4a0 | private | (encrypted) | 2024-05-17 | 235 | 121 | 0 |
| 364de29d-11bf-4eae-9e1b-62bc31b5798a | public | FUCKICE | 2026-01-18 | 161 | 15 | 0 |
| cc7ca03a-e959-4643-b802-3a455403bdac | public | Bai-ee Portfolio | 2024-11-14 | 90 | 14 | 0 |
| 4d27f6d7-033b-4195-ada1-f2b47f99989e | public | Elbow Grease | 2024-04-27 | 76 | 11 | 0 |
| e7d24b95-2e43-45ae-8e7d-86fc6fcee765 | public | Crudeboys | 2024-04-26 | 46 | 3 | 0 |
| 8d01b81f-0e5e-4162-82ff-5bfc89a5795a | public | MEME SHIT | 2024-11-17 | 45 | 8 | 0 |
| a816058a-b71b-4e63-ad15-cbbb1c1a1888 | public | ContentTypeFixed-1754075286969 | 2025-08-01 | 3 | 1 | 0 |
| 50502d7a-33c0-48ef-80a3-42a00004c42f | public | ContentTypeFixed-1754072115223 | 2025-08-01 | 3 | 1 | 0 |
| ffeb0671-6d29-4cd6-8aea-7bb5d19d3170 | public | NoTurboWebsite-1754072252200 | 2025-08-01 | 3 | 1 | 0 |
| f635d05e-c7be-407d-b1d1-198df30ad50e | public | FixedWebsite-1754069148420 | 2025-08-01 | 3 | 1 | 0 |
| 82cb381d-6a5b-43b0-abda-65d7fd03fdb9 | public | WebsiteTest-2025-08-01T04-20-38 | 2025-08-01 | 3 | 2 | 0 |
| e00ac3a9-f1cd-47a5-9eee-4daf171dbf5d | public | ArDriveWebStyle-1754095730240 | 2025-08-02 | 2 | 1 | 0 |
| 7b234977-93a2-4d60-ae45-087b7ca92ee5 | public | WorkingWebsite-1754059584795 | 2025-08-01 | 2 | 1 | 0 |
| 84eb24ee-397b-4940-826c-bf32c9571033 | public | SimpleTest-1754059348174 | 2025-08-01 | 1 | 1 | 0 |
| 60eae2f1-40e2-4b1c-a5a1-3fbce6acd21d | public | ManifestTest-1754059379852 | 2025-08-01 | 1 | 1 | 0 |
| f11f091b-7ddf-4762-b977-2f7e7bd965da | public | FileUpdate-2025-08-01T04-28-34 | 2025-08-01 | 1 | 1 | 0 |
| 43ff63de-c13f-46f4-b426-743f651507ec | public | Turbo Upload Demo | 2025-08-01 | 1 | 1 | 0 |
| dc7f53e3-850d-42cc-97bf-7d780cf1dbc7 | public | TurboTest-2025-08-01T03-57-24 | 2025-08-01 | 1 | 1 | 0 |
| 7c291a39-f918-4a97-8155-6ebaa3d7a335 | public | Turbo Upload Demo | 2025-08-01 | 1 | 1 | 0 |
| f6da71eb-b8b5-41ed-8cbd-84755b281a97 | public | Turbo Upload Demo | 2025-08-01 | 1 | 1 | 0 |
| 9aea0aff-a41c-4abb-91e7-780a45cac844 | public | Turbo Upload Demo | 2025-08-01 | 1 | 1 | 0 |
| 105ad4b7-b05b-4dc0-997d-93469da0f51e | public | Turbo Upload Demo | 2025-08-01 | 1 | 1 | 0 |
| e2279a2b-b9c3-4cb6-a784-a98fdaf3733f | public | Turbo Upload Demo | 2025-08-01 | 1 | 1 | 0 |
| b5cb1915-7eb0-400c-9442-3c36931d7056 | public | SimpleTest-1754059328737 | 2025-08-01 | 0 | 1 | 0 |
| 18894e1b-9de1-4a37-9fcf-0cf7710ae778 | public | Turbo Upload Demo | 2025-08-01 | 0 | 1 | 0 |
| 64cae6e6-cd50-4a47-87b4-ccc3fecf1f14 | public | Turbo Upload Demo | 2025-08-01 | 0 | 1 | 0 |
| 2dc2630c-d866-4435-998f-511cb8c949be | public | Turbo Upload Demo | 2025-08-01 | 0 | 1 | 0 |
| 34cd0d1a-2a8b-41cd-b2b8-d0ab52faa8cc | public | Turbo Upload Demo | 2025-08-01 | 0 | 1 | 0 |
| e380b29d-ae00-40ea-9eb0-81233fa0fde0 | public | Turbo Upload Demo | 2025-08-01 | 0 | 1 | 0 |
| ed829e8b-cdd7-45a0-9b45-20ac5fc6fee8 | public | CursorTest | 2025-08-01 | 0 | 1 | 0 |
| 63627aa7-da06-406d-ade1-5e33aecd5a4a | public | CursorTest | 2025-08-01 | 0 | 1 | 0 |
| 3353d88e-7005-4a35-92fe-9286857e8b3b | public | CursorTest | 2025-08-01 | 0 | 1 | 0 |
| 6cd92107-2ac2-4ebd-a308-f97fdb17eeb9 | public | CursorTest | 2025-08-01 | 0 | 1 | 0 |
| a6fc41a5-ab6e-40a0-a857-e6b1a3ee8140 | public | Test Drive For Root | 2025-07-30 | 0 | 1 | 0 |
| 239a0944-3d93-4852-9390-685ffa541b1e | public | Test | 2025-07-29 | 0 | 1 | 0 |
| d71be54c-7bb9-4b4a-8c17-81e0fa08f3d7 | private | (encrypted) | 2025-07-29 | 0 | 1 | 0 |
| 5b2c2538-e929-4d5b-b4e2-fe59a9dfc5d6 | private | (encrypted) | 2025-04-15 | 0 | 1 | 0 |
| 29901629-b97e-4aa2-a176-119b5f872d96 | private | (encrypted) | 2025-03-15 | 0 | 2 | 0 |
| a6081258-a10f-4b68-989e-885c4ea63013 | private | (encrypted) | 2024-11-11 | 0 | 1 | 0 |
| 36e90515-3d7e-48e8-87f4-b7fe19527e1a | private | (encrypted) | 2024-04-27 | 0 | 2 | 0 |

Notes: ARWEAVE_DRIVE_ID in .env.local points to drive ed829e8b-... "CursorTest" (empty, 0 files); folder id points to its root. The real mix library is the public drive "underground_existence" (5caa37e6-57bd-4875-9d12-45dda5484bfa, path /underground_existence/ue_website/audio/, 46 audio files). Other audio-bearing drives: UndergroundExistence_Optimized (c9512a7b..., 5), Daily Quest Player (cfe323fd..., 34 small game/jingle audio files), Music_Player and Thog (small SFX plus the 303DayMix), bai-ee_music_archive (1.mp3).

## Private drives (7; cannot decrypt, not attempted)
| Drive-Id | Files | Folders | Likely content |
|---|---|---|---|
| d71be54c-7bb9-4b4a-8c17-81e0fa08f3d7 | 0 | 1 | empty/folder only |
| 5b2c2538-e929-4d5b-b4e2-fe59a9dfc5d6 | 0 | 1 | empty/folder only |
| 29901629-b97e-4aa2-a176-119b5f872d96 | 0 | 2 | empty/folder only |
| a6081258-a10f-4b68-989e-885c4ea63013 | 0 | 1 | empty/folder only |
| f1bc4e52-5e56-4837-9ee0-3e2a7b9de4a0 | 235 | 121 | bulk project files |
| 74f64d71-292d-4dc9-880c-94fcb84c3c69 | 4713 | 25 | bulk project files |
| 36e90515-3d7e-48e8-87f4-b7fe19527e1a | 0 | 2 | empty/folder only |

Encrypted file data txs by month: 2024-05 235 files, 10 MB; 2024-04 4701 files, 122 MB. These are Apr-May 2024 (4,701 + 235 files, ~132 MB total): code/project trees, not 100+ MB mixes. Drives f1bc4e52 (235 files) and 74f64d71 (4,713 files) are the only private drives with files.

## Audio files (114 entries, 113 unique data txids), NOT referenced in artists.json: 86
Verified: first bytes of every dataTxId fetched via ranged GET and show MP3/RIFF/M4A signatures (all 113 resolve on arweave.net or ar-io.net).

### Unreferenced, real mixes (>= 20 MB)
| Name | Path | MB | Date | dataTxId |
|---|---|---|---|---|
| 01 Traxx - Unknown Musical Structures - Side A.m4a | /underground_existence/ue_website/audio/01 Traxx - Unknown Musical Structures - Side A.m4a | 101.58 | 2024-05-24 | `XAF6I5y_afkmKqnquGPm_aYeA68Ce8uL1pgcP2_765o` |
| 01 Traxx - Unknown Musical Structures - Side B.m4a | /underground_existence/ue_website/audio/01 Traxx - Unknown Musical Structures - Side B.m4a | 101.52 | 2024-05-24 | `BkXJV9KU4YpGzmygpmZ9QyBuh4-RpyV3CwQRBUtZnIA` |
| Acidman_Stargazers vs Sunbathers.m4a | /underground_existence/ue_website/audio/Acidman_Stargazers vs Sunbathers.m4a | 69.54 | 2024-05-24 | `MXHX-mnbewA9CY_EWGmxXB06ZFR2A05KjUUNSmy3iZo` |
| Bai-ee(Live_at_Fame).mp3 | /underground_existence/ue_website/audio/Bai-ee(Live_at_Fame).mp3 | 28.93 | 2024-05-31 | `mnRlhQ3J4VexZUivOgXCg_NeFMGHI5BtLGHTrBrT9Qc` |
| Bai-ee_(303DayMix)_2024.mp3 | /underground_existence/ue_website/audio/Bai-ee_(303DayMix)_2024.mp3 | 175.1 | 2024-03-01 | `9x-NgzS63J6EPubaiWxaR2lvD1z5ORZzU2FF7Ep4or4` |
| Bai-ee_(303DayMix)_2024.mp3 | /Music_Player/archived_music/assets/musics/Bai-ee_(303DayMix)_2024.mp3 | 175.1 | 2024-03-01 | `SQzVJFt82rENFNs749eUydjJDiS-SV809PDjHE4D5Pg` |
| Bai-ee_Jazz_&_Blues_Fathers_Day_Mix_2024.mp3 | /underground_existence/ue_website/audio/Bai-ee_Jazz_&_Blues_Fathers_Day_Mix_2024.mp3 | 121.09 | 2024-06-27 | `pBoFykt0AtnVZ1Pw3VQ3V8aodGOqe7HXFc_Wz8AM_oI` |
| Bernard_Badie_vs_Sean_Smith.mp3 | /underground_existence/ue_website/audio/Bernard_Badie_vs_Sean_Smith.mp3 | 63.13 | 2024-06-03 | `QBIYGHbuJNH7wIVklXn5sV80be4xPhmNtiBYespycmg` |
| Chicago_Skyway_LWE.mp3 | /underground_existence/ue_website/audio/Chicago_Skyway_LWE.mp3 | 122.69 | 2025-04-19 | `xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U` |
| Flammable_Mix_Series_Volume_15_ Andrew Emil_Seattle_Live.mp3 | /underground_existence/ue_website/audio/Flammable_Mix_Series_Volume_15_ Andrew Emil_Seattle_Live.mp3 | 270.08 | 2024-12-02 | `_iEzHmgrRzf7mPqHcjzCPPu-SEjI8MQKCvI16Y4F7js` |
| Frankie_Vega_vs_Jevon_Jackson_TFU_Anniversary_09.mp3 | /underground_existence/ue_website/audio/Frankie_Vega_vs_Jevon_Jackson_TFU_Anniversary_09.mp3 | 65.75 | 2024-06-01 | `VlhqIPXb3Ia6HrD8zvJkS9Ma6_wTOY-nD1fDUZ6xRtM` |
| Jaggy_Viva_Acid_Closing.mp3 | /underground_existence/ue_website/audio/Jaggy_Viva_Acid_Closing.mp3 | 135.58 | 2025-06-19 | `lYNWEq1g00wVBHfUIj3g-brUcl--jT0AUtbvyy-wKwQ` |
| JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825 2.mp3 | /UndergroundExistence_Optimized/music/JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825 2.mp3 | 96.58 | 2025-09-01 | `r14of_KCIHFq6jcvck3kzjbQ-_sYI1cY_xVHc252c_o` |
| JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825.mp3 | /UndergroundExistence_Optimized/music/JoshZ_Bai-ee_ONES_B2B_Podlasie_VA-71825.mp3 | 239.23 | 2025-09-01 | `Sb8CBWdSOevl6-IPs5J9Wq2PQErvvGNCLoPD4QjEgok` |
| Lorelei_JoshZ_Baiee_Tyrel_71825_VIvaAcid.mp3 | /UndergroundExistence_Optimized/music/Lorelei_JoshZ_Baiee_Tyrel_71825_VIvaAcid.mp3 | 246.1 | 2025-09-07 | `xDaMKgz3vWI919a4urmlIeNHoJS9qlFuAwk8AURATA0` |
| Narees_41st_Bday_Mix.mp3 | /underground_existence/ue_website/audio/Narees_41st_Bday_Mix.mp3 | 127.46 | 2025-03-07 | `nI3GXmal_1lh_f7mQ5i5wXq6oZvdqgUei12XTi88LpE` |
| StarTraxx_UnkownDj_MegaMix.mp3 | /underground_existence/ue_website/audio/StarTraxx_UnkownDj_MegaMix.mp3 | 41.72 | 2025-01-12 | `KslgETTCyXrvb5mcShyc4HPrBtrwRe1o4H2WxVbjV1U` |
| Stephen P - Red Light Special.mp3 | /underground_existence/ue_website/audio/Stephen P - Red Light Special.mp3 | 131.31 | 2025-01-12 | `P_U-SfG3oW_4_VjeYkbgGXaXfOch2Vra_NNSgpEo1Ek` |
| Terry Mullan - New School Fusion 1 - SideA.mp3 | /underground_existence/ue_website/audio/Terry Mullan - New School Fusion 1 - SideA.mp3 | 38.92 | 2024-05-24 | `Rbwm0Aa9via1H5165udq6xYXMwn1tefCbET_Ni3GlhU` |
| Terry Mullan - New School Fusion 1- SideB.mp3 | /underground_existence/ue_website/audio/Terry Mullan - New School Fusion 1- SideB.mp3 | 38.76 | 2024-05-24 | `0HBQ3sn6bDWX_AJKIHAuyBAQPoeBjfeBrvxuRYNv0C0` |
| Turbotic.mp3 | /underground_existence/ue_website/audio/Turbotic.mp3 | 39.25 | 2024-05-24 | `u9prk038Y2wg9YWV8iQz4eW_F5L72qxbPTc05MaBmss` |
| Tyrel_Williams_71825_VIvaAcid.mp3 | /UndergroundExistence_Optimized/music/Tyrel_Williams_71825_VIvaAcid.mp3 | 86.02 | 2025-09-07 | `ELq0pz16S3EoNi2-kK4Hj-xGj6iXhRrii18gAEiCkE4` |
| loft_livin_2_(Bai-ee).mp3 | /underground_existence/ue_website/audio/loft_livin_2_(Bai-ee).mp3 | 126.93 | 2024-05-24 | `mqNUzO51zSc7r_hrVFEzYnSG1XeixPGu-lnBDfWH1x0` |

### Unreferenced, small (< 20 MB: game SFX, jingles, stray files)
63 files, mostly /Daily Quest Player/, /Music_Player/.../sounds/ and /Thog/jumpgametest/sounds/. Full list in the JSON.

### Referenced in artists.json
- Lorelei_71825_VIvaAcid.mp3 (89.15 MB) `Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM`
- Chicago_Skyway_Playing to the wall.mp3 (114.44 MB) `MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo`
- Chubby-Podcast_Chicago-Skyway.mp3 (160.87 MB) `yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk`
- Chicago_Skyway_WWFM_2021.mp3 (153.58 MB) `08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs`
- Chicago_Skyway_For_Hakim.mp3 (130.67 MB) `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA`
- Live_at_Studio_409_-_NYE_2024.mp3 (158.57 MB) `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg`
- johnsimmons_ue.mp3 (73.11 MB) `pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM`
- RELEASE_Live@_7_20_Underground (1).mp3 (54.97 MB) `IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU`
- BlueJ_Live_Hush_SF_101814 (1) (1).mp3 (183.22 MB) `QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik`
- bai_ee_live_vivaacid_24.mp3 (129.3 MB) `3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg`
- Andrew_Emil_B2B_Redeye_VIVAACID_OCT2024.mp3 (267.19 MB) `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM`
- BAI-EE_RoughTimesMix.mp3 (151.37 MB) `w0tHAsKEQphJzh-JEbQuxUWPv-0aHsecs7TIdONTd28`
- Sassmouth_Live_At_Podlasie_July_2024.mp3 (223.48 MB) `o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0`
- Tyrel_Williams_Live_At_Podlasie_July_2024.mp3 (286.8 MB) `aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU`
- Cesar_Ramirez_(LetYourselfGo).mp3 (194.48 MB) `tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM`
- Bai-ee_Mix_(Jazz_&_Blues_Fathers_Day)_2024.mp3 (120.52 MB) `m6ZORqpkbfO6OsbpNPGswjQFUmf7MonBRFgDXVjIeMQ`
- Akila  - A drink and a smoke on the veranda.mp3 (137.31 MB) `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE`
- Akila _Head_Ass_Mix_June_2024.mp3 (138.05 MB) `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg`
- Love_Manifesto.mp3 (114.47 MB) `fxxlhewYkzcExqp_czyOd9p1rNzb2QWCF5akGYejbew`
- love_manifesto_2.mp3 (143.22 MB) `BUIC8eBMYSWBRU4lKSAQVr3r-spiWbK0uxZ5g7rl8Bw`
- loftlivin.mp3 (109.28 MB) `0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI`
- acidman_vs_bai-ee_smartbar.mp3 (122.7 MB) `nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM`
- Flammable Mix Series Volume 15_ Andrew Emil.mp3 (270.08 MB) `RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA`
- Sean_Smith_Martians.mp3 (179.95 MB) `DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y`
- Acidman_Stargazers_&_Sunbathers.mp3 (103.03 MB) `fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g`
- Jevon_Jackson_(Live_Mic)_TFU_Anny_2009.mp3 (55.48 MB) `26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y`
- StarTraxx.mp3 (41.72 MB) `3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ`

## Flagged-name hits (all public file revisions)
- **HPIT**: Directors_Cut_Promo_Full_Length.mp3 (1.2 MB, `xcNzaKE0drbUkbQ7UiTgK-9Rc1ERQT5TESzxE-Vc2NE`)
- **Akila**: Akila  - A drink and a smoke on the veranda.mp3 (137.3 MB, `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE`); Akila _Head_Ass_Mix_June_2024.mp3 (138.1 MB, `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg`)
- **drink/smoke/veranda**: Akila  - A drink and a smoke on the veranda.mp3 (137.3 MB, `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE`)
- **BlueJay/Zeitler/Studio409**: Live_at_Studio_409_-_NYE_2024.mp3 (158.6 MB, `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg`); BlueJ_Live_Hush_SF_101814 (1) (1).mp3 (183.2 MB, `QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik`)
- **Bernard Badie/Sean Smith**: Sean_Smith_Martians.mp3 (180 MB, `DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y`); Bernard_Badie_vs_Sean_Smith.mp3 (63.1 MB, `QBIYGHbuJNH7wIVklXn5sV80be4xPhmNtiBYespycmg`)
- **Skyway/LWE**: Chicago_Skyway_Playing to the wall.mp3 (114.4 MB, `MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo`); Chubby-Podcast_Chicago-Skyway.mp3 (160.9 MB, `yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk`); Chicago_Skyway_LWE.mp3 (122.7 MB, `xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U`); Chicago_Skyway_WWFM_2021.mp3 (153.6 MB, `08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs`); Chicago_Skyway_For_Hakim.mp3 (130.7 MB, `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA`)
- **Stephen P**: Stephen P - Red Light Special.mp3 (131.3 MB, `P_U-SfG3oW_4_VjeYkbgGXaXfOch2Vra_NNSgpEo1Ek`)
- **Cesar Ramirez**: Cesar_Ramirez_(LetYourselfGo).mp3 (194.5 MB, `tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM`)
- **Jevon Jackson**: Jevon_Jackson_(Live_Mic)_TFU_Anny_2009.mp3 (55.5 MB, `26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y`); Frankie_Vega_vs_Jevon_Jackson_TFU_Anniversary_09.mp3 (65.7 MB, `VlhqIPXb3Ia6HrD8zvJkS9Ma6_wTOY-nD1fDUZ6xRtM`)
- **No hits** for: Mark Farina, Specter, Derrick Carter, Phil Free Art, Jimmy Krok, BRC, Ryan Tinsley, Pipeline, DJ Automoton, Billy O, K-Squared, "Live at UE" by Bernard Badie/Sean Smith as a separate file, UE 2005-2008 live sets, and the Hpit Promo (txid prefix neH-PrcWXd71JCZayTX). The only "promo" match is Directors_Cut_Promo_Full_Length.mp3 (1.2 MB, Critters game asset, not Hpit).
- Blue Jay: BlueJ_Live_Hush_SF_101814 (referenced). Zeitler: no hit. Studio409: Live_at_Studio_409_-_NYE_2024 (referenced).
- Bernard Badie vs Sean Smith (`QBIYGHbu...`) is NOT referenced; a "Live at UE" distinct file is not in ArFS.
- Chicago Skyway: five files; Chicago_Skyway_LWE.mp3 (`xS4jThRPGUcyAdEEMPS3H7ZAhxIZOWxD78BzN90oN-U`) is not referenced; the other four are.

## Conclusion for the owner
ArDrive is fully enumerated for this wallet and contains no hidden stash. The missing audio (HPIT, Farina, Specter, etc.) is not under this address in ArFS, public or private. Remaining possibilities: raw untagged uploads in the same wallet (sibling's scope), a different wallet that is not present on this machine (ArConnect/browser extension or a keyfile on another device), or the files were never uploaded.
