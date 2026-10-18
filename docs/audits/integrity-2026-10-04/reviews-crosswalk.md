# Review-to-record crosswalk (Agent 3)

Generated 2026-10-04. Inputs: `inputs/cesar-ramirez-mix-reviews.json` (67 reviews), `inputs/reviews-vs-arweave-crosswalk.md`, current `website/artists.json` (sha256 `3c7833077962de2321103973c4d824099c7699f8223e3c675f10a2688b548369`, 18 artists / 44 records). Record indices are 0-based flat positions in that file at that hash; `recordRef` (artist page + title + txid) is the stable identifier if the file shifts. Read-only: no txid was fetched; nothing here uses wallet data.

Counts: **(a) has-record 22 reviews -> 22 distinct records**, **(b) no-record 46** (45 from the 67 reviews + 1 extra from the history doc, Popkan), **(c) record-only 22**.

Normalization used: case/punctuation-insensitive; "Live @" = "Live at"; Bai-ee = BAI-EE = HousepitChi/HPIT label owner; Blue J = BLUE JAY (AKA Josh Zeitler) = Josh Zeitler = **DJ Automoton**; "Bai-ee vs Acidman" B2B items live on the ACIDMAN page; Tyrel = TYREL WILLIAMS; DJ Release = DJ RELEASE AKA IKE; Sassmouth, Sean Smith, Bernard Badie as page names.

## (a) Reviewed mixes that HAVE a record

| # | Review (artist / title) | Record idx | Record (page / title / year) | Conf. | txid | Notes |
|---|---|---|---|---|---|---|
| 1 | Cesar Ramirez / Let Yourself Go | 23 | CESAR RAMIREZ / Let Yourself Go / '01' | high | `tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM` |  |
| 2 | Acidman / Stargazers & Sunbathers | 0 | ACIDMAN / Stargazers vs Sunbathers / '09 | high | `fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g` |  |
| 3 | Akila / A Drink & A Smoke... | 4 | AKILA / A drink and a smoke on the veranda / '24 | high | `m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE` |  |
| 4 | Bai-ee vs Acidman / Live @ Smartbar | 1 | ACIDMAN / Live @ Smartbar / '11 | medium | `nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM` | Review has no year/duration; record year '11. Smartbar 4/26/2002 Farina/Carter reviews are different mixes. |
| 5 | Tyrel / Live @ Podlasie | 30 | TYREL WILLIAMS / Live at Podlasie / 2024h | high | `aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU` |  |
| 6 | Akila / ...Head Ass!!! | 3 | AKILA / ...Head Ass!!! / 6/24 | high | `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg` |  |
| 7 | Sassmouth / Live @ Podlasie | 27 | SASSMOUTH / Live at Podlasie / 2024 | high | `o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0` |  |
| 8 | Bai-ee / Love Manifesto Part 1 | 11 | BAI-EE / Love Manifesto V-Day Mix / '23 | high | `fxxlhewYkzcExqp_czyOd9p1rNzb2QWCF5akGYejbew` | Review title "Part 1" vs record "V-Day Mix" (2023). |
| 9 | Bai-ee vs Acidman / Loft Livin | 2 | ACIDMAN / Loft Livin / '05 | high | `0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI` | B2B Bai-ee vs Acidman; record lives on ACIDMAN page only. Distinct from review "Loft Livin' Vol. 2". |
| 10 | Bai-ee / Love Manifesto 2 | 10 | BAI-EE / Love Manifesto (2) V-Day Mix / '24 | high | `BUIC8eBMYSWBRU4lKSAQVr3r-spiWbK0uxZ5g7rl8Bw` |  |
| 11 | Bai-ee / Father's Day Jazz Mix | 8 | BAI-EE / Fathers Day Jazz Mix / '24 | high | `m6ZORqpkbfO6OsbpNPGswjQFUmf7MonBRFgDXVjIeMQ` |  |
| 12 | Bernard Badie vs Sean Smith / Live @ UndergroundExistence Party 2009 | 43 | BERNARD BADIE / Live at UE (B2B Sean Smith) / ?? | high | `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` (SHARED - conflict) | Title match solid; txid is shared with Blue Jay Studio409 record (conflict). Local source: underground_existence/audio/Bernard_Badie_vs_Sean_Smith.mp3 (66MB) suggests this record owns the shared txid and Blue Jay is the wrong one. |
| 13 | Andrew Emil / Flammable Mix Series Vol. 15 | 6 | ANDREW EMIL / Live @ Flammable '19 / '19 | high | `RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA` |  |
| 14 | Blue J / Live @ Hush San Francisco | 22 | BLUE JAY (AKA Josh Zeitler) / Blue Jay Live at Hush 2024 in San Francisco / 2024 | high | `QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik` |  |
| 15 | StarTraxx (artist unnamed in review) / StarTraxx | 29 | STAR TRAXX / Mix Tape / Circe '95 | high | `3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ` | Review artist is None; matched on title "StarTraxx" mixtape. |
| 16 | John Simmons / Live @ UndergroundExistence 2005 | 24 | JOHN SIMMONS / Live @ UE.info ?? / 20?? | medium | `pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM` | Record title/year are placeholders (?? / 20??); review says 2005. Other 2005 UE sets (Phil Free Art, Jimmy Krok) are unrecorded, so an ear check is advisable. |
| 17 | Frankie Vega vs Jevon Jackson / TFU Anniversary 2009 (Live Mic Mix) | 42 | JEVON JACKSON / Frankie Vega B2B Jevon Jackson / ?? | high | `26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y` | Distinct from solo review "Jevon Jackson / Live @ TFU Anniversary Party 2009" (no record); both are TFU 2009 - confirm they are different files. |
| 18 | Sean Smith / Martians | 28 | SEAN SMITH / Martians Mixtape / Circa 2009 | high | `DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y` | Local source: underground_existence/audio/Sean_Smith_Martians.mp3. |
| 19 | DJ Release / Live @ Underground Party Chicago 7/20/07 | 26 | DJ RELEASE AKA IKE / Live @ UE.info ?? / 20?? | medium | `IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU` | Record title/year are placeholders. Four reviewed sets share the 7/20/07 party (DJ Release, Pipeline, Billy O & K-Squared, Bai-ee) - confirm which set the file is. |
| 20 | Bai-ee / Rough Times | 9 | BAI-EE / Rough Times / '16 | high | `w0tHAsKEQphJzh-JEbQuxUWPv-0aHsecs7TIdONTd28` |  |
| 21 | Andrew Emil / Live @ Viva Acid Closing Party 10-6-2024 | 5 | ANDREW EMIL / Live @ Viva Acid '24 / '24 | high | `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM` | Primary record; mirrored on RED EYE and VIVA ACID pages (allowed duplicates). |
| 22 | Bai-ee / Live @ Viva Acid Closing Party, Chicago 10-6-2024 | 7 | BAI-EE / Live @ Viva Acid '24 / '24 | high | `3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg` | Primary record; mirrored on VIVA ACID page (allowed duplicate). |

Current-state flag: txid sharing in the live file today (excluding allowed VIVA ACID/RED EYE mirrors): `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` x2 (BLUE JAY (AKA Josh Zeitler)/Live at Studio409 New York (2024); BERNARD BADIE/Live at UE (B2B Sean Smith)), `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` x3 (Chicago Skyway/For Hakim; Chicago Skyway/For Hakim; Chicago Skyway/Little White Earbuds Mix). Akila's two mixes already have distinct txids in this file version.

Low-confidence matches (need an ear/wallet check): Acidman Live @ Smartbar (medium), John Simmons and DJ Release (placeholder titles "Live @ UE.info ??").

## (b) Reviewed mixes with NO record: upload / backlog list

Grouped by artist. "NOT IN artists.json" = no artist page exists at all (a page would need to be created if/when a file is found). Search keys are lowercase fragments to match against ArDrive names/filename tags (also try underscore/hyphen variants, with or without `.mp3`).

### Bai-ee  (page: BAI-EE) - 8 mixes
- **303 Day Acid Mix** - review 1207802546022617, published 2024-07-13
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `303 day`, `303day`, `Bai-ee_(303DayMix)_2024.mp3`, `bai_ee_303_day_acid_mix`, `bai-ee-303-day-acid-mix`
  - note: Local source file exists: /Users/bballi/Documents/Repos/underground_existence/Bai-ee_(303DayMix)_2024.mp3
- **Live @ Podlasie** (2024) - review 1208080581309551, published 2024-08-16
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `podlasie`, `podlasie club`, `early summer 2024`, `~2024-06`, `2024`, `bai_ee_live_podlasie`, `bai-ee-live-podlasie`
  - note: Do not confuse with Sassmouth/Tyrel Podlasie 2024 sets or the 7/18/25 Josh Z & Bai-ee B2B set seen only in the older underground_existence/artists.json (txid r14of_KCIHFq6jcvck3kzjbQ-_sYI1cY_xVHc252c_o - verify, may be a different night).
- **A Love Hate Relationship** (1998) - review 1208532958274018, published 2024-10-11
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `love hate`, `love-hate`, `1998`, `bai_ee_a_love_hate_relationship`, `bai-ee-a-love-hate-relationship`
- **Live @ Fame, Millennium Park** (2002) ~30min - review 1208573556440089, published 2024-10-17
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `fame`, `millennium park`, `millenium park`, `2002`, `fashion show`, `bai_ee_live_fame_millennium_park`, `bai-ee-live-fame-millennium-park`
- **Barack** (2005) - review 1208585999314474, published 2024-10-20
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `barack`, `obama`, `2005`, `bai_ee_barack`, `bai-ee-barack`
- **Live @ 7/20 Underground** - review 1208634806555892, published 2024-10-27
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `7/20`, `7-20`, `720`, `underground party`, `open mic`, `bai_ee_live_7_20_underground`, `bai-ee-live-7-20-underground`
  - note: 7/20/07 party: also reviewed as DJ Release, Pipeline, Billy O & K-Squared, Bai-ee sets; DJ Release is already a placeholder record. Possible single long recording split by DJ.
- **Gusto** (2000) - review 1208679298167777, published 2024-11-01
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `gusto`, `2000`, `bai_ee_gusto`, `bai-ee-gusto`
- **Loft Livin' Vol. 2** - review 1208721441070248, published 2024-11-07
  - keys: `bai-ee`, `baiee`, `bai ee`, `BAI-EE`, `housepit`, `housepitchi`, `HPIT`, `secret studio`, `loft livin`, `loft livin vol 2`, `loftlivin2`, `vol. 2`, `bai_ee_loft_livin_vol_2`, `bai-ee-loft-livin-vol-2`
  - note: Not the same as Loft Livin (ACIDMAN, '05 record).

### Cesar Ramirez  (page: CESAR RAMIREZ) - 4 mixes
- **Destination (Deep House Mix)** (2023) - review 1208198938566929, published 2024-09-01
  - keys: `cesar ramirez`, `cesar`, `ramirez`, `destination`, `deep house mix`, `07-2023`, `2023`, `cesar_ramirez_destination_deep_house_mix`, `cesar-ramirez-destination-deep-house-mix`
- **Old School Chicago House Vol. 1** - review 1208734794367763, published 2024-11-10
  - keys: `cesar ramirez`, `cesar`, `ramirez`, `old school chicago house`, `vol 1`, `1980s`, `cesar_ramirez_old_school_chicago_house_vol_1`, `cesar-ramirez-old-school-chicago-house-vol-1`
- **The Return** (2024) ~154min - review 1208779291136987, published 2024-11-15
  - keys: `cesar ramirez`, `cesar`, `ramirez`, `the return`, `disco`, `2024`, `2022`, `cesar_ramirez_the_return`, `cesar-ramirez-the-return`
- **Keep On Going** - review 1208829995447894, published 2024-11-22
  - keys: `cesar ramirez`, `cesar`, `ramirez`, `keep on going`, `deep disco`, `cesar_ramirez_keep_on_going`, `cesar-ramirez-keep-on-going`

### Blue J  (page: BLUE JAY (AKA Josh Zeitler)) - 1 mix
- **Shuffle Like This** - review 1208129269794638, published 2024-08-22
  - keys: `blue j`, `bluej`, `blue jay`, `josh zeitler`, `zeitler`, `gramaphone`, `DJ Automoton`, `automoton`, `shuffle like this`, `shuffle`, `blue_j_shuffle_like_this`, `blue-j-shuffle-like-this`

### DJ Automoton  (page: BLUE JAY (AKA Josh Zeitler)) - 1 mix
- **Live @ Block Party, July 2007** (2007) - review 1208581302605949, published 2024-10-18
  - keys: `dj automoton`, `automoton`, `automaton`, `blue j`, `josh zeitler`, `zeitler`, `gramaphone`, `block party`, `july 2007`, `2007`, `dj_automoton_live_block_party_july_2007`, `dj-automoton-live-block-party-july-2007`
  - note: DJ Automoton = Blue J = Josh Zeitler (per review text); would belong on the BLUE JAY page.

### Jevon Jackson  (page: JEVON JACKSON) - 1 mix
- **Live @ True Family Unit Anniversary Party 2009** (2009) - review 1208299332258815, published 2024-09-12
  - keys: `jevon jackson`, `jevon`, `tfu`, `true family unit`, `anniversary`, `2009`, `live mic`, `jevon_jackson_live_true_family_unit_anniversary_party_2009`, `jevon-jackson-live-true-family-unit-anniversary-party-2009`
  - note: Same TFU 2009 party as the Frankie Vega B2B Jevon Jackson record; solo set vs B2B - verify.

### Mark Farina  (**NOT IN artists.json**) - 3 mixes
- **Live @ Smartbar 4/26/2002** (2002) - review 1208783765840533, published 2024-11-17
  - keys: `mark farina`, `farina`, `smartbar`, `4/26/2002`, `4-26-02`, `042602`, `2002`, `mark_farina_live_smartbar_4_26_2002`, `mark-farina-live-smartbar-4-26-2002`
  - note: Artist has no page in artists.json.
  - note: Same event as Derrick Carter review of 4/26/2002 - may be one shared recording; also distinct from ACIDMAN Live @ Smartbar ('11).
- **Seed Syllable** (1993) ~95min - review 1208832669192491, published 2024-11-24
  - keys: `mark farina`, `farina`, `seed syllable`, `1993`, `mark_farina_seed_syllable`, `mark-farina-seed-syllable`
  - note: Artist has no page in artists.json.
- **Parallel** (1999) - review 1208867738473561, published 2024-11-28
  - keys: `mark farina`, `farina`, `parallel`, `1999`, `mark_farina_parallel`, `mark-farina-parallel`
  - note: Artist has no page in artists.json.

### Specter  (**NOT IN artists.json**) - 3 mixes
- **Brutus** - review 1207848231319721, published 2024-07-18
  - keys: `specter`, `spectre`, `tetrode`, `sound signature`, `brutus`, `sound signature release (album, may not be a mix)`, `specter_brutus`, `specter-brutus`
  - note: Review is of a RELEASE (album), not a DJ mix - likely not a wallet audio mix; owner decision whether it belongs on the site.
  - note: Artist has no page in artists.json.
- **Bridgeport Blues** (2004) - review 1208877467964838, published 2024-12-01
  - keys: `specter`, `spectre`, `tetrode`, `sound signature`, `bridgeport blues`, `bridgeport`, `2004`, `specter_bridgeport_blues`, `specter-bridgeport-blues`
  - note: Artist has no page in artists.json.
- **Pendulum** (2002) - review 1208977966825216, published 2024-12-13
  - keys: `specter`, `spectre`, `tetrode`, `sound signature`, `pendulum`, `2002`, `specter_pendulum`, `specter-pendulum`
  - note: Artist has no page in artists.json.

### Derrick Carter  (**NOT IN artists.json**) - 2 mixes
- **Textures** - review 1208194723723044, published 2024-08-30
  - keys: `derrick carter`, `carter`, `textures`, `tape`, `derrick_carter_textures`, `derrick-carter-textures`
  - note: Artist has no page in artists.json.
- **Live @ Smartbar 4/26/2002** (2002) - review 1208873762588421, published 2024-11-29
  - keys: `derrick carter`, `carter`, `smartbar`, `4/26/2002`, `4-26-02`, `042602`, `2002`, `derrick_carter_live_smartbar_4_26_2002`, `derrick-carter-live-smartbar-4-26-2002`
  - note: Artist has no page in artists.json.
  - note: Same event as Mark Farina review of 4/26/2002 - may be one shared recording; also distinct from ACIDMAN Live @ Smartbar ('11).

### Stephen P  (**NOT IN artists.json**) - 2 mixes
- **Red Light Special** (2002) - review 1208918236291166, published 2024-12-05
  - keys: `stephen p`, `steven p`, `campsite`, `red light special`, `2002`, `stephen_p_red_light_special`, `stephen-p-red-light-special`
  - note: Artist has no page in artists.json.
- **Let's Drop (Deep House Mix)** (2001) - review 1208981986247424, published 2024-12-15
  - keys: `stephen p`, `steven p`, `campsite`, `let's drop`, `lets drop`, `campsite lab`, `2001`, `stephen_p_let_s_drop_deep_house_mix`, `stephen-p-let-s-drop-deep-house-mix`
  - note: Artist has no page in artists.json.

### Billy O & K-Squared  (**NOT IN artists.json**) - 1 mix
- **Live 7/20 Underground** ~40min - review 1208536564039744, published 2024-10-13
  - keys: `billy o`, `billy-o`, `k-squared`, `ksquared`, `k squared`, `tfu`, `true family unit`, `7/20`, `7-20`, `720`, `underground party`, `open mic`, `billy_o_k_squared_live_7_20_underground`, `billy-o-k-squared-live-7-20-underground`
  - note: Artist has no page in artists.json.
  - note: 7/20/07 party: also reviewed as DJ Release, Pipeline, Billy O & K-Squared, Bai-ee sets; DJ Release is already a placeholder record. Possible single long recording split by DJ.

### BRC  (**NOT IN artists.json**) - 1 mix
- **Live @ UndergroundExistence 2007** (2007) - review 1208366060140002, published 2024-09-20
  - keys: `brc`, `brian carlson`, `aeronautic`, `2007`, `drum and bass`, `dnb`, `brc_live_undergroundexistence_2007`, `brc-live-undergroundexistence-2007`
  - note: Artist has no page in artists.json.

### Craig Alexander  (**NOT IN artists.json**) - 1 mix
- **Rolla' Disco** (2021) - review 1207872682688605, published 2024-07-22
  - keys: `craig alexander`, `rolla disco`, `rolla' disco`, `housepit-chi EP (release, may not be a mix)`, `2021`, `craig_alexander_rolla_disco`, `craig-alexander-rolla-disco`
  - note: Review is of a RELEASE (EP), not a DJ mix - likely not a wallet audio mix; owner decision whether it belongs on the site.
  - note: Artist has no page in artists.json.

### DJ Lil' John  (**NOT IN artists.json**) - 1 mix
- **Phan-Tas-Tique** (1999) - review 1208925767964026, published 2024-12-06
  - keys: `lil john`, `lil' john`, `lil_john`, `dj lil john`, `phan-tas-tique`, `phantastique`, `fantastic`, `1999`, `dj_lil_john_phan_tas_tique`, `dj-lil-john-phan-tas-tique`
  - note: Artist has no page in artists.json.

### DJ Sneak  (**NOT IN artists.json**) - 1 mix
- **Signature Sounds (Side B)** (1997) ~45min - review 1208526003611805, published 2024-10-10
  - keys: `dj sneak`, `sneak`, `signature sounds`, `side b`, `1997`, `dj_sneak_signature_sounds_side_b`, `dj-sneak-signature-sounds-side-b`
  - note: Artist has no page in artists.json.

### Gant Garrard aka Gant-Man  (**NOT IN artists.json**) - 1 mix
- **Groove Tha Feelin'** (2001) - review 1208066756537889, published 2024-08-15
  - keys: `gant garrard`, `gant-man`, `gantman`, `gant man`, `dj gant`, `groove tha feelin`, `groove the feeling`, `2001`, `gant_garrard_aka_gant_man_groove_tha_feelin`, `gant-garrard-aka-gant-man-groove-tha-feelin`
  - note: Artist has no page in artists.json.

### Jesse Lee vs Matt Martin  (**NOT IN artists.json**) - 1 mix
- **Jesse Lee vs Matt Martin** - review 1208672837803362, published 2024-10-31
  - keys: `jesse lee`, `matt martin`, `b2b`, `jesse_lee_vs_matt_martin_jesse_lee_vs_matt_martin`, `jesse-lee-vs-matt-martin-jesse-lee-vs-matt-martin`
  - note: Artist has no page in artists.json.

### Jimmy Krok  (**NOT IN artists.json**) - 1 mix
- **Live @ Underground Existence Party 2005** (2005) - review 1208355935078006, published 2024-09-19
  - keys: `jimmy krok`, `krok`, `ue party`, `2005`, `jimmy_krok_live_underground_existence_party_2005`, `jimmy-krok-live-underground-existence-party-2005`
  - note: Artist has no page in artists.json.

### Julian "Jumpin" Perez  (**NOT IN artists.json**) - 1 mix
- **Live on WBMX Chicago** (1985) ~72min - review 1208969638386857, published 2024-12-12
  - keys: `julian perez`, `jumpin perez`, `julian jumpin perez`, `hot mix 5`, `hotmix 5`, `wbmx`, `102.7`, `radio`, `1985`, `julian_jumpin_perez_live_on_wbmx_chicago`, `julian-jumpin-perez-live-on-wbmx-chicago`
  - note: Artist has no page in artists.json.

### Kenny "Jammin" Jason  (**NOT IN artists.json**) - 1 mix
- **Live on WBMX Chicago** (1986) - review 1208931129131104, published 2024-12-08
  - keys: `kenny jammin jason`, `kenny jason`, `jammin jason`, `kjj`, `hot mix 5`, `hotmix 5`, `wbmx`, `102.7`, `radio`, `1986`, `kenny_jammin_jason_live_on_wbmx_chicago`, `kenny-jammin-jason-live-on-wbmx-chicago`
  - note: Artist has no page in artists.json.

### Kiddo & Antiphase  (**NOT IN artists.json**) - 1 mix
- **Mix 7-15-06** (2006) - review 1208682833006762, published 2024-11-03
  - keys: `kiddo`, `antiphase`, `7-15-06`, `071506`, `7/15/06`, `mix 7 15 06`, `2006`, `kiddo_antiphase_mix_7_15_06`, `kiddo-antiphase-mix-7-15-06`
  - note: Artist has no page in artists.json.

### Mark Almaria  (**NOT IN artists.json**) - 1 mix
- **Sol** - review 1208423218201075, published 2024-09-27
  - keys: `mark almaria`, `geto mark`, `almaria`, `sol`, `mixtape 90s`, `mark_almaria_sol`, `mark-almaria-sol`
  - note: Artist has no page in artists.json.

### Mastiksoul  (**NOT IN artists.json**) - 1 mix
- **Live December 2007** (2007) - review 1208481730335446, published 2024-10-04
  - keys: `mastiksoul`, `mastik soul`, `kawti`, `december 2007`, `dec 2007`, `live 2007`, `2007`, `mastiksoul_live_december_2007`, `mastiksoul-live-december-2007`
  - note: Artist has no page in artists.json.

### Mystic Bill  (**NOT IN artists.json**) - 1 mix
- **Monochrome Sets (Winter 98)** (1998) - review 1208472095752971, published 2024-10-03
  - keys: `mystic bill`, `monochrome sets`, `monochrome`, `winter 98`, `1998`, `mystic_bill_monochrome_sets_winter_98`, `mystic-bill-monochrome-sets-winter-98`
  - note: Artist has no page in artists.json.

### Paul Johnson  (**NOT IN artists.json**) - 1 mix
- **Jive Turkey** (2012) - review 1208370716571537, published 2024-09-22
  - keys: `paul johnson`, `pj`, `jive turkey`, `thanksgiving 2012`, `2012`, `paul_johnson_jive_turkey`, `paul-johnson-jive-turkey`
  - note: Artist has no page in artists.json.

### Phil Free Art  (**NOT IN artists.json**) - 1 mix
- **Live @ UndergroundExistence Block Party 2005** (2005) - review 1208312336628381, published 2024-09-15
  - keys: `phil free art`, `phil free`, `freeart`, `block party`, `2005`, `ue block party`, `phil_free_art_live_undergroundexistence_block_party_2005`, `phil-free-art-live-undergroundexistence-block-party-2005`
  - note: Artist has no page in artists.json.

### Pipeline  (**NOT IN artists.json**) - 1 mix
- **Live @ Underground Party 7/20/07** (2007) - review 1208730799213749, published 2024-11-08
  - keys: `pipeline`, `dj pipeline`, `7/20/07`, `7-20-07`, `072007`, `drum and bass`, `2007`, `pipeline_live_underground_party_7_20_07`, `pipeline-live-underground-party-7-20-07`
  - note: Artist has no page in artists.json.
  - note: 7/20/07 party: also reviewed as DJ Release, Pipeline, Billy O & K-Squared, Bai-ee sets; DJ Release is already a placeholder record. Possible single long recording split by DJ.

### Popkan  (**NOT IN artists.json**) - 1 mix
- **UndergroundExistence Block Party Live PA** - review UndergroundExistence_History_Research_Archive.docx (no review), published 
  - keys: `popkan`, `block party`, `live pa`, `underground existence block party`
  - note: Not in the 67 reviews; year not recovered.

### Ryan Tinsley  (**NOT IN artists.json**) - 1 mix
- **Live @ Underground Existence Party 2008** (2008) - review 1208630708317027, published 2024-10-25
  - keys: `ryan tinsley`, `tinsley`, `ue party`, `2008`, `ryan_tinsley_live_underground_existence_party_2008`, `ryan-tinsley-live-underground-existence-party-2008`
  - note: Artist has no page in artists.json.

### Terry Mullan  (**NOT IN artists.json**) - 1 mix
- **New School Fusion Vol. 1** (1994) - review 1208430729988379, published 2024-09-29
  - keys: `terry mullan`, `mullan`, `new school fusion`, `nsf`, `vol 1`, `1994`, `terry_mullan_new_school_fusion_vol_1`, `terry-mullan-new-school-fusion-vol-1`
  - note: Artist has no page in artists.json.

### Traxx  (**NOT IN artists.json**) - 1 mix
- **Misc.** - review 1208622875825568, published 2024-10-24
  - keys: `traxx`, `soul foundation`, `nation`, `misc`, `cassette`, `traxx_misc`, `traxx-misc`
  - note: Artist has no page in artists.json.

### Artists with zero records / no page in artists.json (25)

Specter, Craig Alexander, Gant Garrard aka Gant-Man, Derrick Carter, Phil Free Art, Jimmy Krok, BRC, Paul Johnson, Mark Almaria, Terry Mullan, Mystic Bill, Mastiksoul, DJ Sneak, Billy O & K-Squared, Traxx, Ryan Tinsley, Jesse Lee vs Matt Martin, Kiddo & Antiphase, Pipeline, Mark Farina, Stephen P, DJ Lil' John, Kenny "Jammin" Jason, Julian "Jumpin" Perez, Popkan

Reviewed artists that DO have a page but whose reviewed mixes are missing: Bai-ee (8), Cesar Ramirez (4), Blue J (1), DJ Automoton (1), Jevon Jackson (1).

## (c) Records in artists.json that match no review (informational)

| idx | Page | Title | Year | txid | Note |
|---|---|---|---|---|---|
| 12 | BAI-EE | HPIT Promo Mix | 2022 | `neH-PrcWXd71JCZayTX` | Invalid/truncated txid (19 chars). |
| 13 | BAI-EE | Music Mix | 2011 | `qmOWTuGHuf7-ed5jb9KD8NFE2ARXCZFGG6bk5Na-ZJ8` |  |
| 14 | BAI-EE | Sounds From the Divide Mix 19 | 2019 | `M-3TZEkPlLTvsI7NVHsqYZFuBZXcJQCm1tMkaj_f_v4` |  |
| 15 | BAI-EE | Sounds From the Divide Mix 18 | 2022 | `y-Lik8vT2L8XUxjPrUEd6METNjYXJfDY52DspUNEJf0` |  |
| 16 | BAI-EE | 12 Step Music Mix | 2019 | `uOXdDRYvNv2OUm6tdEuyZvL1_1O8FtL7KvYBisNEg2o` |  |
| 17 | BAI-EE | Live in Hawaii (Asylum) | 2018 | `9LUIqtUo6qbpnVKJWQc87xQ5iROjWVVJao-8nhasndU` |  |
| 18 | BAI-EE | Live Performance | 2018 | `e7vfpyZKSyUOv_oro5FnO8Wuyf1wIKq9S4EhlvV8o18` |  |
| 19 | BAI-EE | Naree Bday Mix | 2022 | `lcEj4KEz6SbHL8f3veGO4DJJmz4ECsItIwaJ3XMAiDo` |  |
| 20 | BAI-EE | Love Manifesto 3 | 2025 | `obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc` |  |
| 21 | BLUE JAY (AKA Josh Zeitler) | Live at Studio409 New York (2024) | 2024 | `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` | txid shared by 2 records. |
| 25 | RED EYE | Live @ Viva Acid '24 | '24 | `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM` | Intentional mirror of record 5 (allowed duplicate txid). |
| 31 | VIVA ACID | Live @ Viva Acid '24 | '24 | `3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg` | Intentional mirror of record 7 (allowed duplicate txid). |
| 32 | VIVA ACID | Live @ Viva Acid '24 | '24 | `xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM` | Intentional mirror of record 5 (allowed duplicate txid). |
| 33 | VIVA ACID | Live @ Viva Acid '24 | '24 | `o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0` | Intentional mirror of record 27 (allowed duplicate txid). |
| 34 | VIVA ACID | Live @ Viva Acid '24 | '24 | `aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU` | Intentional mirror of record 30 (allowed duplicate txid). |
| 35 | Chicago Skyway | For Hakim | ?? | `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` | txid shared by 3 records. |
| 36 | Chicago Skyway | For Hakim | ?? | `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` | txid shared by 3 records. |
| 37 | Chicago Skyway | Little White Earbuds Mix | ?? | `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` | txid shared by 3 records. |
| 38 | Chicago Skyway | Playing to the Wall | ?? | `MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo` |  |
| 39 | Chicago Skyway | WWFM | 2011 | `08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs` |  |
| 40 | Chicago Skyway | Chubby Podcast | ?? | `yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk` |  |
| 41 | LORELEI | Lorelei Live at Podlasie 7/18/25 | 7/18/25 | `Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM` |  |

Notes: RED EYE and VIVA ACID rows are mirrors of reviewed mixes (Andrew Emil / Bai-ee / Sassmouth / Tyrel), so they are "record-only" by page but not unreviewed content. Blue Jay `Live at Studio409 New York (2024)` has no review and shares its txid with Bernard Badie (see (a)).

## Other findings for the integration pass

- Type caveat: Specter "Brutus" (album) and Craig Alexander "Rolla' Disco" (EP) are label releases, not DJ mixes; probably no wallet audio and may not belong in the mix backlog.
- Same-event clusters that may be one recording: Smartbar 4/26/2002 (Mark Farina + Derrick Carter), 7/20/07 party (Pipeline, Billy O & K-Squared, DJ Release record, Bai-ee 7/20), TFU 2009 (Jevon Jackson solo + the Frankie Vega B2B record).
- Local source audio exists outside the wallet for: 303 Day Acid Mix (`underground_existence/Bai-ee_(303DayMix)_2024.mp3`), plus Acidman Stargazers, Bernard Badie vs Sean Smith, Sean Smith Martians (already recorded). Useful for fingerprint/size matching: Bernard_Badie_vs_Sean_Smith.mp3 = 66,196,419 bytes.
- The older `underground_existence/UndergroundExistence_Optimized/artists.json` carries 4 txids not in website/artists.json (listed in inputs/SOURCES.md); the wallet audit should check whether they exist and which night they are.
- Durations were taken only from review text (explicit "N minutes/hours") or from the record's own `mixDuration`; nothing was inferred. Years come from the review field, else a single year in the review text.
