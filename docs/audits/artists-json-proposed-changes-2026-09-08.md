# artists.json proposed changes -- 2026-09-08

Agent 3 (review-to-record reconciliation) output. Proposals only -- `website/artists.json` is not edited by this doc; the machine-readable patch is `artists-json-proposed-patch-2026-09-08.json`.

Source corpus: `docs/audits/reviews-normalized-2026-09-08.json` (67 Cesar Ramirez reviews, normalized from `docs/audits/inputs/cesar-ramirez-mix-reviews.json`). Reconciliation against `website/artists.json` (18 artists / 45 mixes) confirms the crosswalk doc's split exactly: **22 hosted, 45 un-hosted, no discrepancies found.**

## (a) Four hard cases

Real file evidence for the three shared txids was measured directly (HTTP GET + `ffprobe`) on 2026-09-08, not estimated:

| Shared txid | Bytes | Bitrate | Measured duration |
|---|---|---|---|
| `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg` (AKILA) | 144,757,160 | 320kbps CBR | 3618.87s = **60:19** |
| `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` (BLUE JAY / BERNARD BADIE) | 166,272,103 | 128kbps CBR | 10391.94s = **173:12** |
| `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` (Chicago Skyway) | 137,018,513 | 320kbps CBR | 3425.41s = **57:05** |

### 1. AKILA -- `...Head Ass!!!` vs `A drink and a smoke on the veranda`

**No edit proposed.** The shared file (60:19) matches the *already-listed* `60:00` duration on **both** records, so duration cannot disambiguate, and neither review's text mentions a distinguishing detail (length, venue, tracklist landmark) that would identify the file. Proposing a keeper here would be an unfounded guess, which the assignment explicitly rules out ("do not invent"). **Fully deferred** to Agent 2's ArDrive filename search (terms: `akila`, `head`, `drink`, `smoke`, `veranda`) and `scripts/audit/join-wallet-matches.mjs`, which will resolve this once wallet-inventory data exists.

- If Agent 2 finds **two** Akila audio files: each record gets its own txid per the ArDrive filename match; no upload needed.
- If Agent 2 finds **only one**: that file's title keeps `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg`; the other gets `mixArweaveURL: ""` and a Priority-1 backlog row (it resolves a currently-broken record).

### 2. BLUE JAY vs BERNARD BADIE

**BLUE JAY (AKA Josh Zeitler) / "Live at Studio409 New York (2024)"**

- Before: `{"mixTitle":"Live at Studio409 New York (2024)","mixArweaveURL":"https://uzh5clhxybxsww3li3gmcodyxok7dwa46vfq7etzn6owprhujdea.arweave.net/pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg","mixDateYear":"2024","mixDuration":"2:58","mixImageFilename":"https://arweave.net/D7QsuJ9bl4ze6ci6kOctGBm8F0joW9uUXb4YWg96N1c"}`
- After (proposed): `{"mixTitle":"Live at Studio409 New York (2024)","mixArweaveURL":"","mixDateYear":"2024","mixDuration":"0:00","mixImageFilename":"https://arweave.net/D7QsuJ9bl4ze6ci6kOctGBm8F0joW9uUXb4YWg96N1c"}`
- Evidence: HEAD+GET on shared txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg measured via ffprobe: 166,272,103 bytes, 128kbps CBR, duration 10391.94s = 173:12 (2h53m). Blue Jay/Josh Zeitler's other catalogued mix ("Blue Jay Live at Hush 2024 in San Francisco") runs 60:00, consistent with a single studio/venue session; a 173-minute file is implausible for a title implying one studio recording. File almost certainly belongs to the Bernard Badie / Sean Smith 2009 UE party B2B (see companion edit). Confidence: HIGH that this txid is NOT Blue Jay's Studio409 file. mixArweaveURL cleared pending Agent 2 wallet match (see backlog + joiner).

**BERNARD BADIE / "Live at UE (B2B Sean Smith)"**

- Before: `{"mixTitle":"Live at UE (B2B Sean Smith)","mixArweaveURL":"https://arweave.net/pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg","mixDateYear":"??","mixDuration":"0:00","mixImageFilename":"https://arweave.net/xMui0L3inJF8NX8b3ydrzuLjNHrtBSjBvqxV0lOoBAo"}`
- After (proposed): `{"mixTitle":"Live at UE (B2B Sean Smith)","mixArweaveURL":"https://arweave.net/pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg","mixDateYear":"2009","mixDuration":"173:12","mixImageFilename":"https://arweave.net/xMui0L3inJF8NX8b3ydrzuLjNHrtBSjBvqxV0lOoBAo"}`
- Evidence: Same shared txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg measured: 173:12 at 128kbps. Cesar Ramirez review (id 1208184850990606, mix_year 2009, "Chicago House Music veterans...teamed up back in 2009 to play an UndergroundExistence party...This is a special tag set recorded live from that night") describes an all-night 2-DJ live party recording, consistent with a near-3-hour runtime -- other "Live @ UE" full-length recordings in artists.json run 120:00 (Tyrel, Sassmouth, John Simmons, Andrew Emil). mixDuration and mixDateYear ("??" -> "2009") filled directly from the file header and the review text respectively (no invention). Confidence: HIGH that this record keeps the txid.

### 3. Chicago Skyway -- Little White Earbuds Mix vs For Hakim

**Chicago Skyway / "Little White Earbuds Mix"**

- Before: `{"mixTitle":"Little White Earbuds Mix","mixArweaveURL":"https://4zj2ozjipdt4lqx3be24koilrjqt4l7igs7hfhumrha7g7qvabaa.arweave.net/5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA","mixDateYear":"??","mixDuration":"0:00","mixImageFilename":"https://arweave.net/J430CY2mNKY9Qy87n1EcOg1G8Qi05kqwTRUPiFr-uzg"}`
- After (proposed): `{"mixTitle":"Little White Earbuds Mix","mixArweaveURL":"https://4zj2ozjipdt4lqx3be24koilrjqt4l7igs7hfhumrha7g7qvabaa.arweave.net/5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA","mixDateYear":"??","mixDuration":"57:05","mixImageFilename":"https://arweave.net/J430CY2mNKY9Qy87n1EcOg1G8Qi05kqwTRUPiFr-uzg"}`
- Evidence: Shared txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA measured via ffprobe: 137,018,513 bytes, 320kbps CBR, duration 3425.41s = 57:05. No Cesar Ramirez review exists for either Chicago Skyway "For Hakim" or "Little White Earbuds Mix" (neither is in the 67-review corpus), so there is no review-text corroboration for this call -- it rests on production convention only: Little White Earbuds ran a well-known guest-DJ podcast mix series, historically ~55-70 minutes at a clean constant 320kbps encode, which is exactly what this file is. A personal "For Hakim" tribute mix has no comparable genre convention to anchor a duration expectation. mixDuration filled from the real file header (permitted regardless of confidence level; it is a measured fact about whichever mix this is). Confidence: MEDIUM -- weakest of the three shared-txid calls; Agent 2 should confirm via ArDrive filename/path search ("hakim" vs "lwe"/"earbuds").

**Chicago Skyway / "For Hakim"**

- Before: `{"mixTitle":"For Hakim","mixArweaveURL":"https://4zj2ozjipdt4lqx3be24koilrjqt4l7igs7hfhumrha7g7qvabaa.arweave.net/5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA","mixDateYear":"??","mixDuration":"0:00","mixImageFilename":"https://arweave.net/J430CY2mNKY9Qy87n1EcOg1G8Qi05kqwTRUPiFr-uzg"}`
- After (proposed): `{"mixTitle":"For Hakim","mixArweaveURL":"","mixDateYear":"??","mixDuration":"0:00","mixImageFilename":"https://arweave.net/J430CY2mNKY9Qy87n1EcOg1G8Qi05kqwTRUPiFr-uzg"}`
- Evidence: Companion edit to the Little White Earbuds Mix call above: since the shared txid is being provisionally assigned to Little White Earbuds Mix (medium confidence), "For Hakim" needs its own txid. mixArweaveURL cleared pending Agent 2 wallet match search on "hakim". (Note: the pure-duplicate bare-URL "For Hakim" row noted in the master plan is Agent 1's fix, not proposed again here -- this edit targets the one remaining "For Hakim" record after Agent 1's de-dup.)

### 4. BAI-EE -- HPIT Promo Mix (truncated txid)

**BAI-EE / "HPIT Promo Mix"**

- Before: `{"mixTitle":"HPIT Promo Mix","mixArweaveURL":"https://arweave.net/neH-PrcWXd71JCZayTX","mixDateYear":"2022","mixDuration":"60","mixImageFilename":"https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/bai-ee2.jpg"}`
- After (proposed): `{"mixTitle":"HPIT Promo Mix","mixArweaveURL":"","mixDateYear":"2022","mixDuration":"60","mixImageFilename":"https://arweave.net/u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w/img/artists/bai-ee2.jpg"}`
- Evidence: https://arweave.net/neH-PrcWXd71JCZayTX confirmed HTTP 404 (measured 2026-09-08; the path is 19 chars, not a valid 43-char txid, so it can never resolve). No Cesar Ramirez review exists for this mix (not in the 67-review corpus) so there is no text-based recovery path. mixArweaveURL cleared; real txid must come from Agent 2's wallet search for a 2022 Bai-ee audio transaction whose txid **starts with** "neH-PrcWXd71JCZayTX" (per master plan -- the truncated string is very likely a literal prefix of the real 43-char txid) or filename tags containing "hpit"/"promo". mixDuration left untouched (existing "60" is a separate field-hygiene item for Agent 1, not addressed here).

## (b) New records -- confirmed/expected mixes under existing artists

Additions to artist pages that already exist in `artists.json`. `mixArweaveURL` stays `""` pending a txid (from Agent 2 / the joiner); every field below is sourced from the review text or explicitly left `"??"`/`"0:00"` when the review gives no answer -- nothing invented.

| Artist | Mix title | Year | Evidence | Review | Asana |
|---|---|---|---|---|---|
| BAI-EE | 303 Day Acid Mix | ?? | No specific year in review text (describes 80s/90s/2000s Acid House tracks generally); "303 Day" is an annual acid-house celebration, but the mix's own recording year is not stated. | 1207802546022617 | [link](https://app.asana.com/1/1205502648602026/project/1206570163546705/task/1207802546022617) |
| BAI-EE | Live @ Podlasie | 2024 | Review: "recorded @ Podlasie Club(Chicago) in the early summer of 2024". | 1208080581309551 | [link](https://app.asana.com/1/1205502648602026/task/1208080581309551) |
| BAI-EE | A Love Hate Relationship | 1998 | Review + mix_year: "he put together in 1998". | 1208532958274018 | [link](https://app.asana.com/1/1205502648602026/task/1208532958274018) |
| BAI-EE | Live @ Fame, Millennium Park | 2002 | Review + mix_year: "recorded live at a fashion show event called Fame in Chicago's Millennium Park back in 2002". | 1208573556440089 | [link](https://app.asana.com/1/1205502648602026/task/1208573556440089) |
| BAI-EE | Barack | 2005 | Review: "put together by Bai-ee...from 2005". | 1208585999314474 | [link](https://app.asana.com/1/1205502648602026/task/1208585999314474) |
| BAI-EE | Live @ 7/20 Underground | ?? | No year in review text. | 1208634806555892 | [link](https://app.asana.com/1/1205502648602026/task/1208634806555892) |
| BAI-EE | Gusto | 2000 | Review + mix_year: "Recorded in 2000". | 1208679298167777 | [link](https://app.asana.com/1/1205502648602026/task/1208679298167777) |
| BAI-EE | Loft Livin' Vol. 2 | ?? | No year in review text. | 1208721441070248 | [link](https://app.asana.com/1/1205502648602026/task/1208721441070248) |
| CESAR RAMIREZ | Destination (Deep House Mix) | 2023 | Review: "recorded in July of 2023". | 1208198938566929 | [link](https://app.asana.com/1/1205502648602026/task/1208198938566929) |
| CESAR RAMIREZ | Old School Chicago House Vol. 1 | ?? | Review cites the tracks' original years (1984-1989) via WBMX/WCRX radio, not the mix's own recording year -- left unknown rather than invented. | 1208734794367763 | [link](https://app.asana.com/1/1205502648602026/task/1208734794367763) |
| CESAR RAMIREZ | The Return | 2024 | Review: "recorded in early 2024" (re-recording of a 2022 attempt). | 1208779291136987 | [link](https://app.asana.com/1/1205502648602026/task/1208779291136987) |
| CESAR RAMIREZ | Keep On Going | ?? | No year in review text. | 1208829995447894 | [link](https://app.asana.com/1/1205502648602026/task/1208829995447894) |
| JEVON JACKSON | Live @ True Family Unit Anniversary Party 2009 | 2009 | Review + mix_year: "recorded live @ a True Family Unit(Chicago) anniversary party from 2009". | 1208299332258815 | [link](https://app.asana.com/1/1205502648602026/task/1208299332258815) |
| BLUE JAY (AKA Josh Zeitler) | Shuffle Like This | ?? | Review ("Blue J" = Josh Zeitler, matches existing BLUE JAY (AKA Josh Zeitler) artist page per the already-hosted "Live @ Hush San Francisco" record's arweave.artist_page field) has no year. | 1208129269794638 | [link](https://app.asana.com/1/1205502648602026/task/1208129269794638) |
| BLUE JAY (AKA Josh Zeitler) | Live @ Block Party, July 2007 (as DJ Automoton) | 2007 | Review: "DJ Automoton aka Blue J(Gramaphone Records)...recorded at a block party in Chicago, back in July of 2007." OPEN QUESTION (flagged, not silently assumed): review explicitly identifies "DJ Automoton" as a Josh Zeitler alias, so this is proposed as a new mix under the EXISTING BLUE JAY (AKA Josh Zeitler) artist entry rather than a new "DJ Automoton" artist page. Integration pass / owner should confirm this identity merge before applying -- if rejected, this becomes a standalone new "DJ AUTOMOTON" artist instead (title reverts to "Live @ Block Party, July 2007"). | 1208581302605949 | [link](https://app.asana.com/1/1205502648602026/task/1208581302605949) |

## (c) New records -- brand-new artist entries (no file yet)

24 artists have zero presence in `artists.json` today but have a published Cesar Ramirez review. Each gets a new artist block (`artistFilename` slug follows the site's existing lowercase-concatenated `.html` convention -- verify no collision before applying; `artistImageFilename` points at the site's own player fallback `img/square-ue.png` per `website/js/player.js:1012,1016,1653-1654`, which the player already falls back to automatically -- a real photo is a separate needed-asset item, not a blocker). `mixArweaveURL` stays `""` for all 30 mixes under these 24 artists until a txid is confirmed.

| Artist (proposed artistName) | artistFilename | Genre | Mix title | Year | Evidence | Asana |
|---|---|---|---|---|---|---|
| SPECTER | specter.html | house | Brutus | ?? | Review: concept double-album on Theo Parrish's Sound Signature label, no release year stated. | [link](https://app.asana.com/1/1205502648602026/project/1206570163546705/task/1207848231319721) |
| SPECTER | specter.html | house | Bridgeport Blues | 2004 | Review + mix_year: "recorded in his home studio in 2004". | [link](https://app.asana.com/1/1205502648602026/task/1208877467964838) |
| SPECTER | specter.html | house | Pendulum | 2002 | Review + mix_year: "recorded in his home studio back in 2002". | [link](https://app.asana.com/1/1205502648602026/task/1208977966825216) |
| CRAIG ALEXANDER | craigalexander.html | house | Rolla' Disco | 2021 | Review: "2021 release on the Housepit-Chi label". | [link](https://app.asana.com/1/1205502648602026/project/1206570163546705/task/1207872682688605) |
| GANT GARRARD AKA GANT-MAN | gantman.html | house | Groove Tha Feelin' | 2001 | Review: "a mix by Chicago native Gant Garrard aka DJ Gant-Man from 2001...off of the Hot Mamma EP which was released back in 2001". | [link](https://app.asana.com/1/1205502648602026/task/1208066756537889) |
| DERRICK CARTER | derrickcarter.html | house | Textures | Circa '90s | Review: "recorded somewhere between the mid to late 90's" (tape mix, from Akila's archive per review postscript). | [link](https://app.asana.com/1/1205502648602026/task/1208194723723044) |
| DERRICK CARTER | derrickcarter.html | house | Live @ Smartbar 4/26/2002 | 4/26/02 | Review + mix_year: recorded live at Smartbar Chicago, "back in 2002"; exact date in the review's companion Mark Farina Smartbar review title. | [link](https://app.asana.com/1/1205502648602026/task/1208873762588421) |
| PHIL FREE ART | philfreeart.html | techno | Live @ UndergroundExistence Block Party 2005 | 2005 | Review + mix_year: "recorded at a UndergroundExistence block party back in 2005". | [link](https://app.asana.com/1/1205502648602026/task/1208312336628381) |
| JIMMY KROK | jimmykrok.html | techno | Live @ Underground Existence Party 2005 | 2005 | Review + mix_year: "A live set recorded at an UndergroundExistence party in 2005". | [link](https://app.asana.com/1/1205502648602026/task/1208355935078006) |
| BRC | brc.html | other | Live @ UndergroundExistence 2007 | 2007 | Review + mix_year: "recorded at an UndergroundExistence party from 2007" (Drum & Bass set). | [link](https://app.asana.com/1/1205502648602026/task/1208366060140002) |
| PAUL JOHNSON | pauljohnson.html | house | Jive Turkey | 2012 | Review + mix_year: "He recorded the mix right before Thanksgiving back in 2012". | [link](https://app.asana.com/1/1205502648602026/task/1208370716571537) |
| MARK ALMARIA | markalmaria.html | house | Sol | Circa '90s | Review: "taken from an old mixtape he did back in the 90's". | [link](https://app.asana.com/1/1205502648602026/task/1208423218201075) |
| TERRY MULLAN | terrymullan.html | house | New School Fusion Vol. 1 | 1994 | Review: "This is Vol. 1 which came out in 1994". | [link](https://app.asana.com/1/1205502648602026/task/1208430729988379) |
| MYSTIC BILL | mysticbill.html | house | Monochrome Sets (Winter 98) | 1998 | Review + mix_year: "originally recorded onto a cassette in 1998". | [link](https://app.asana.com/1/1205502648602026/task/1208472095752971) |
| MASTIKSOUL | mastiksoul.html | other | Live December 2007 | 2007 | Review + mix_year: "recorded from one of his live sets in December of 2007". | [link](https://app.asana.com/1/1205502648602026/task/1208481730335446) |
| DJ SNEAK | djsneak.html | house | Signature Sounds (Side B) | 1997 | Review: "originally released as a 90 minute mixtape back in 1997". | [link](https://app.asana.com/1/1205502648602026/task/1208526003611805) |
| BILLY O & K-SQUARED | billyoksquared.html | house | Live 7/20 Underground | ?? | No year in review text. | [link](https://app.asana.com/1/1205502648602026/task/1208536564039744) |
| TRAXX | traxx.html | house | Misc. | Circa '90s | Review: "digitized from a cassette tape...transports the listener straight back to the 1990s". | [link](https://app.asana.com/1/1205502648602026/task/1208622875825568) |
| RYAN TINSLEY | ryantinsley.html | house | Live @ Underground Existence Party 2008 | 2008 | Review + mix_year: "recorded at an UndergroundExistence party from 2008". | [link](https://app.asana.com/1/1205502648602026/task/1208630708317027) |
| JESSE LEE VS MATT MARTIN | jesseleevsmattmartin.html | techno | Jesse Lee vs Matt Martin | ?? | No year in review text. | [link](https://app.asana.com/1/1205502648602026/task/1208672837803362) |
| KIDDO & ANTIPHASE | kiddoantiphase.html | techno | Mix 7-15-06 | 7/15/06 | Review + mix_year + title: "a back to back mix...that was recorded in 2006"; exact date in the review's own title "Mix 7-15-06". | [link](https://app.asana.com/1/1205502648602026/task/1208682833006762) |
| PIPELINE | pipeline.html | other | Live @ Underground Party 7/20/07 | 7/20/07 | Review + mix_year + title: "recorded live at an underground party in Chicago on 7/20/07" (Drum & Bass set). | [link](https://app.asana.com/1/1205502648602026/task/1208730799213749) |
| MARK FARINA | markfarina.html | house | Live @ Smartbar 4/26/2002 | 4/26/02 | Review + mix_year + title: "recorded live at the legendary Smartbar in Chicago back in 2002". | [link](https://app.asana.com/1/1205502648602026/task/1208783765840533) |
| MARK FARINA | markfarina.html | house | Seed Syllable | 1993 | Review + mix_year: "recorded for a mixtape in 1993". | [link](https://app.asana.com/1/1205502648602026/task/1208832669192491) |
| MARK FARINA | markfarina.html | house | Parallel | 1999 | Review + mix_year: "from 1999". | [link](https://app.asana.com/1/1205502648602026/task/1208867738473561) |
| STEPHEN P | stephenp.html | house | Red Light Special | 2002 | Review + mix_year: "Recorded in 2002 at his home studio, Campsite Chicago". | [link](https://app.asana.com/1/1205502648602026/task/1208918236291166) |
| STEPHEN P | stephenp.html | house | Let's Drop (Deep House Mix) | 2001 | Review + mix_year: "Recorded at the Campsite Lab in Chicago in 2001". | [link](https://app.asana.com/1/1205502648602026/task/1208981986247424) |
| DJ LIL' JOHN | djliljohn.html | house | Phan-Tas-Tique | 1999 | Review + mix_year: "Let's rewind to 1999 with a sizzling mix". | [link](https://app.asana.com/1/1205502648602026/task/1208925767964026) |
| KENNY "JAMMIN" JASON | kennyjamminjason.html | house | Live on WBMX Chicago | 1986 | Review + mix_year: "mixing live on Chicago's legendary 102.7 WBMX radio station back in 1986". | [link](https://app.asana.com/1/1205502648602026/task/1208931129131104) |
| JULIAN "JUMPIN" PEREZ | julianjumpinperez.html | house | Live on WBMX Chicago | 1985 | Review + mix_year: "This classic recording from 1985". | [link](https://app.asana.com/1/1205502648602026/task/1208969638386857) |

### Open judgment call flagged inline above

**"DJ Automoton" / "Live @ Block Party, July 2007"** is proposed as a new mix under the *existing* `BLUE JAY (AKA Josh Zeitler)` artist entry, not a new "DJ Automoton" artist page, because the review itself states "DJ Automoton aka Blue J(Gramaphone Records)". The site already resolves "Blue J" to `BLUE JAY (AKA Josh Zeitler)` (see the already-hosted "Live @ Hush San Francisco" record). This is a judgment call, not a certainty -- the integration pass / owner should confirm before applying; if rejected, revert the mix title to "Live @ Block Party, July 2007" and create a standalone "DJ AUTOMOTON" artist entry instead (djautomoton.html, genre techno, same evidence).

## Firestore

No Firestore write was made or attempted (nor any wallet/upload/deploy operation). Two things worth flagging for the integration pass:

- `upload-artists-json.js` (repo root) is **NOT** the right sync command -- it reads `COMPLETE_ARTISTS_JSON.json`, which this plan explicitly calls stale/ignore. Running it as-is would push stale data into Firestore, not this patch.
- The correct direction lives in `lib/WebsiteSync.js`: `syncFirebaseToWebsiteJSON(db)` (Firestore -> `website/artists.json`, wired into `api/manage-artists.js`'s `updateWebsite()`) and its counterpart `syncWebsiteJSONToFirebase(db, websiteDir='website')` (`website/artists.json` -> Firestore `system/artists`, full overwrite with `{merge:false}`). The second one is what the integration pass would need after applying this patch to `artists.json` -- **today it is exercised only by `tests/website-sync-skyline-meta.test.mjs`; no CLI script or API route calls it in production.** The exact (not-yet-run) call would be:

```js
import { syncWebsiteJSONToFirebase } from './lib/WebsiteSync.js';
// db = an initialized Firestore instance (see lib/firebase-admin.js)
await syncWebsiteJSONToFirebase(db, 'website');
// writes db.collection('system').doc('artists').set({ artists: [...] }, { merge: false })
```

Records that would change once this patch is applied and that sync is run: every artist/mix pair listed in sections (a)-(c) above -- 6 existing artists touched (BAI-EE, CESAR RAMIREZ, JEVON JACKSON, BLUE JAY (AKA Josh Zeitler), BERNARD BADIE, Chicago Skyway) plus 24 brand-new artist entries, 50 mix-level changes total (5 edits + 45 additions).

