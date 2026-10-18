# Mix dates + flyers audit — 2026-10-17

Read-only audit of the 15 normalized mixes in `~/Music/UE-Mixes/processed` (uploaded to Firebase
Storage `website/mixes/<id>`, manifest `~/Music/UE-Mixes/processed/firebase-uploads.json`). Nothing
written to Firestore yet.

## Sources checked

| Source | What it gave |
|---|---|
| ID3 tags on the files | years for Love Hate (1999), Gusto (2000/2001), Barack (2005), 7/20 Underground (2007) |
| Filenames | dates for Housepitality 6/25/14, HOUSEPIT 1715, Hush 101814, HSS 5716, BillyO 08_14_2020, clip 20171230 |
| Facebook export `facebook-bryanballi7` (NAS `/Volumes/Public/Bryan/Facebook Downloads/`) — `events/your_event_responses.html` | the dated Housepitality / Hush event list (titles + lineups) |
| Hitloop Firestore `x_content_packages` (NAS media index; `facets.eventDates` = date printed on the flyer) | flyer images per date |
| Hitloop `docs/audits/cesar-ramirez-mix-reviews.json` | review years (Love Hate 1998, Gusto "recorded in 2000", Barack "from 2005"); 7/20 party = 7/20/07 via sibling sets |
| Google Drive | Secret Studio Catalog folder, Housepit CHI folders (no direct mix matches) |

Facts learned: **Housepitality** = weekly Wednesday party at F8, 1192 Folsom St, San Francisco (started
Sept 2010). **Groove Lounge** = Housepitality's back room ("Groove Lounge: Residents" on the flyers).
**Secret Studio** = Bai-ee + Tyrel Williams.

## Per mix

Confidence: **confirmed** = flyer and/or FB event matches the filename date · **likely** = strong
circumstantial match · **year** = year only.

| File | Proposed title (no date) | Date | Confidence | Event (FB) | Flyer (NAS, `facebook-bryanballi7/photos_and_videos/…`) |
|---|---|---|---|---|---|
| Bai-ee_Live_Housepitality_6:25:14 | Live at Housepitality w/ The Black Madonna | 2014-06-25 | confirmed | HOUSEPITALITY ft THE BLACK MADONNA (SF debut), BAI-EE & TIMOTEO GIGANTE | `your_posts/10457658_10203975976460704_…jpg` (pkg `nas-ebe12a1b836c78fa`; also `nas-b71b512fea40f81e`, `nas-05167726df2f3be6`) |
| Bai-ee_Live_HOUSEPIT_1715 | Live at Housepitality w/ Johnny Fiasco | 2015-01-07 | confirmed | HOUSEPITALITY feat. JOHNNY FIASCO, BAI-EE, KRIS MUSE & JP SOUL ("How Deep" release party) | `your_posts/10847266_10205377873307249_…jpg` (pkg `nas-36b793560db85a11`; also `nas-044fe58a2077e491`, `nas-b2d3590e4f47655c`, cover `nas-4a2911cfcdea1cb7`) |
| Bai-ee_Live_Houspitality_Anny | Housepitality 3-Year Anniversary w/ KiNK | 2013-10-02 | likely (file dated Nov 2013; "Anny" = anniversary) | HOUSEPITALITY 3-YEAR ANNIV. feat. KiNK (live), MICHAEL TELLO, BAI-EE | `CoverPhotos_14ec4LsTEg/1044998_10202005776246930_…jpg` (pkg `nas-a410b92fe70fae0b`; ~25 more `OCT. 2ND` posts from Sep 2013) |
| Secret_Studio_Live_Hush_SF_101814 | Secret Studio — Live at Hush SF | 2014-10-18 | confirmed | Hush (Prismatic/Gramaphone) — Matrixxman, Blue J, Secret Studio (Tyrel Williams + Bai-ee) | `your_posts/10703955_10204910336099111_…jpg` (pkg `nas-1997b7b00fca808b`; cover `nas-6578551b64d20ebe`) |
| secret_studio live 1 | Secret Studio — Live 1 | 2014 (maybe 2014-08-27) | year | file dated 2014-08-17; first billed Secret Studio set = Housepitality 8/27/14 | 8/27/14 flyer `your_posts/10582857_10204405728404234_…jpg` (pkg `nas-efa14b2ab247ffe6`) — only if owner confirms |
| Secret Studio-HSSMix-5716 | Secret Studio — HSS Mix | 2016-05-07 | filename only | no FB event that day | none |
| GrooveLounge_Bai-ee | Live in the Groove Lounge (Housepitality) | ~2014 | year (file dated 2014-02-07) | Groove Lounge = Housepitality back room | none specific |
| Bai-ee_Mix_1020 | Mix 10.20 | 2015-10-20? | filename + file date (2015-10-22) | no event | none |
| BAI-EE_Mix_for_Naree | Mix for Naree | 2012 | year (file dated 2012-10-14) | — | none. ≠ site's "Naree Bday Mix" (2022) |
| Bai-ee_A Love Hate Relationship_98 | A Love Hate Relationship | 1998 | year (filename + review say 1998; ID3 says 1999) | — | none |
| Gusto_Bai-ee_2000 | The Gusto | 2000 | year (review "recorded in 2000"; ID3 title says 2001) | — | none |
| Baiee_Barack_Mix_2005 | Barack Mix | 2005 | year (ID3 + review) | — | none |
| BAIEE_Live@_7_20_Underground | Live @ 7/20 Underground | 2007-07-20 | likely (ID3 2007; Pipeline + DJ Release sets dated 7/20/07) | Underground Existence party, Chicago | none found |
| BillyO_ Perseverance_08_14_2020 | Perseverance (Billy O) | 2020-08-14 | filename only (FB export ends Jun 2020) | — | none |
| 20171230 200643 | (6-min clip) | 2017-12-30 20:06 | filename (phone recording timestamp) | Acid Test 12/30/17 (Mozhgan, Tyrel Williams…) same night — unconfirmed | none |

Also: Blue Jay's site record "Live at Hush" (Firestore, year blank) is the **same night — 2014-10-18** (flyer above). Fixable in the same pass.

## Proposed storage (pending owner OK)

- **Title:** clean, no date (column above).
- **Firestore mix record** (`system/artists`, safe transaction path): keep `mixDateYear` (site shows it) and add
  `mixDate` (`YYYY-MM-DD` or `YYYY`), `mixDateConfidence`, `mixDateSource`, `mixEvent` (name, venue, lineup) and
  `mixFlyer` (NAS path + `x_content_packages` id).
- **ID3 tags** on the MP3 before final upload: `TIT2` clean title, `TPE1` artist, `TDRC` full date, `TALB` event,
  `COMM` source. ⚠️ Retagging changes the bytes → new content id → re-upload to Firebase (cheap) and use the new
  URLs. Do this before records are written.
- **Daily content:** the flyers above already carry `facets.eventDates` in `x_content_packages`, so Hitloop's
  `onThisDay` (`features/x-content-inventory/throwback.js`) can surface them; storing the mix URL next to the
  flyer package id lets a throwback post pair the flyer with the mix.
