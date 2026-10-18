# artists.json live status — 2026-09-08

Agent 1 (validator + mechanical fixes) run, post-fix. Command: `npm run validate:artists -- --live`.
Source: `website/artists.json` (18 artists, 44 mix records after this pass — see "What changed" below).

Exit code: **1** (non-zero — 5 known structural failures remain, all explicitly out of Agent 1's scope; see below).

## Methodology note: where Content-Length comes from

The `https://arweave.net/<txid>` data-serving route redirects (302) every request to a
sandboxed `<subdomain>.arweave.net/<txid>` gateway node. That node does **not** emit a
`Content-Length` header on `HEAD` or plain `GET`, and it **ignores `Range` requests**
entirely — a ranged `GET` for the first 2KB comes back `Content-Type: audio/mpeg`,
`Transfer-Encoding: chunked`, and streams the **entire** file body instead of honoring
the range (confirmed: a "first 2KB" request for one track streamed all 108,034,116
bytes). Downloading full files (up to ~300MB each × 44 records) to get a byte count
was not an option.

Instead, `Content-Length` in the table below and in the validator's live-check output
is sourced from the public, unauthenticated Arweave GraphQL endpoint
(`https://arweave.net/graphql`, `transaction(id){ data{ size type } tags{...}
bundledIn{ id } } }`) — read-only metadata lookup, no wallet, no owner filter, not
part of Agent 2's wallet-enumeration workstream. `HEAD`/status/Content-Type still come
from the direct gateway request (following redirects) per the master plan's spec.

## What changed in this pass

- VIVA ACID entry 4 subdomain typo fixed (extra `2` removed) — verified live, HTTP 200 `audio/mpeg`.
- CESAR RAMIREZ "Let Yourself Go" `mixDateYear`: `'01'` → `'01`.
- TYREL WILLIAMS "Live at Podlasie" `mixDateYear`: `2024h` → `2024`.
- Chicago Skyway "For Hakim" bare-URL duplicate row removed (subdomain-form row kept). Mix count: 45 → 44.
- STAR TRAXX `artistImageFilename` rewritten from the `ardrive.net` host to the `arweave.net` gateway form — verified live: 302 → 200, `image/jpeg` (the 302 is arweave.net's normal sandboxed-subdomain redirect for path-suffixed content, not a broken link).

## Full validator output

```
> arweave-video-generator@1.0.0 validate:artists
> node scripts/validate-artists-json.mjs --live

# artists.json validation report

Source: website/artists.json
Artists: 18  |  Mix records: 44

## Structural checks

FAIL — 5 structural issue(s):
- [txid-format] BAI-EE / "HPIT Promo Mix": txid "neH-PrcWXd71JCZayTX" is 19 chars (need exactly 43, [A-Za-z0-9_-])
- [year-format] STAR TRAXX / "Mix Tape": mixDateYear "Circe '95" does not match expected pattern
- [duplicate-txid] txid FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg shared by 2 non-mirror records: AKILA / "...Head Ass!!!" <-> AKILA / "A drink and a smoke on the veranda"
- [duplicate-txid] txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg shared by 2 non-mirror records: BLUE JAY (AKA Josh Zeitler) / "Live at Studio409 New York (2024)" <-> BERNARD BADIE / "Live at UE (B2B Sean Smith)"
- [duplicate-txid] txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA shared by 2 non-mirror records: Chicago Skyway / "For Hakim" <-> Chicago Skyway / "Little White Earbuds Mix"

## Warnings (non-fatal)

None.
```

> Note on the "Circe '95" flag: this is a pre-existing typo in STAR TRAXX's `mixDateYear`
> ("Circe" vs. the pattern's "Circa") discovered by the validator's regex. It is **not**
> one of the mechanical fixes Agent 1 was assigned (task 3 lists exactly 5 edits: VIVA
> ACID subdomain, Cesar Ramirez year, Tyrel Williams year, the Chicago Skyway dup, and
> the Star Traxx image host — this typo isn't among them), so it was left untouched and
> is flagged here for the integration pass / owner to decide on.

### Live gateway status table

One row per mix record. `Content-Length` via GraphQL (see methodology note above).

| Artist | Mix Title | Txid | HTTP Status | Content-Type | Content-Length (bytes) | Note |
|---|---|---|---|---|---|---|
| ACIDMAN | Stargazers vs Sunbathers | fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g | 200 | audio/mpeg | 108034116 |  |
| ACIDMAN | Live @ Smartbar | nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM | 200 | audio/mpeg | 128663875 |  |
| ACIDMAN | Loft Livin | 0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI | 200 | audio/mpeg | 114593488 |  |
| **AKILA** | **...Head Ass!!!** | **FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg** | 200 | audio/mpeg | **144757160** | **DUPLICATE txid — shared with another non-mirror record. See callout below.** |
| **AKILA** | **A drink and a smoke on the veranda** | **FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg** | 200 | audio/mpeg | **144757160** | **DUPLICATE txid — shared with another non-mirror record. See callout below.** |
| ANDREW EMIL | Live @ Viva Acid '24 | xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM | 200 | audio/mpeg | 280171663 | shares txid (allowlisted VIVA ACID/RED EYE mirror — not a defect) |
| ANDREW EMIL | Live @ Flammable '19 | RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA | 200 | audio/mpeg | 283194967 |  |
| BAI-EE | Live @ Viva Acid '24 | 3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg | 200 | audio/mpeg | 135582895 | shares txid (allowlisted mirror) |
| BAI-EE | Fathers Day Jazz Mix | m6ZORqpkbfO6OsbpNPGswjQFUmf7MonBRFgDXVjIeMQ | 200 | audio/mpeg | 126371068 |  |
| BAI-EE | Rough Times | w0tHAsKEQphJzh-JEbQuxUWPv-0aHsecs7TIdONTd28 | 200 | audio/mpeg | 158723133 |  |
| BAI-EE | Love Manifesto (2) V-Day Mix | BUIC8eBMYSWBRU4lKSAQVr3r-spiWbK0uxZ5g7rl8Bw | 200 | audio/mpeg | 150175026 |  |
| BAI-EE | Love Manifesto V-Day Mix | fxxlhewYkzcExqp_czyOd9p1rNzb2QWCF5akGYejbew | 200 | audio/mpeg | 120027630 |  |
| **BAI-EE** | **HPIT Promo Mix** | **neH-PrcWXd71JCZayTX (19 chars — truncated, cannot resolve)** | ERROR: skipped (no valid txid) | — | — | **Truncated txid — out of Agent 1 scope; belongs to Agent 2's wallet-recovery workstream / upload backlog.** |
| BAI-EE | Love Manifesto #3 | Ex1n-m0Pdea7Kfm3a0F9IkT875idE2tyyE1LtXbxZSs | 200 | audio/mpeg | 105605531 |  |
| BAI-EE | Music Mix | qmOWTuGHuf7-ed5jb9KD8NFE2ARXCZFGG6bk5Na-ZJ8 | 200 | audio/mpeg | 98623297 |  |
| BAI-EE | Sounds From the Divide Mix 19 | M-3TZEkPlLTvsI7NVHsqYZFuBZXcJQCm1tMkaj_f_v4 | 200 | audio/mpeg | 87068036 |  |
| BAI-EE | Sounds From the Divide Mix 18 | y-Lik8vT2L8XUxjPrUEd6METNjYXJfDY52DspUNEJf0 | 200 | audio/mpeg | 86387191 |  |
| BAI-EE | 12 Step Music Mix | uOXdDRYvNv2OUm6tdEuyZvL1_1O8FtL7KvYBisNEg2o | 200 | audio/mpeg | 162192195 |  |
| BAI-EE | Live in Hawaii (Asylum) | 9LUIqtUo6qbpnVKJWQc87xQ5iROjWVVJao-8nhasndU | 200 | audio/mpeg | 161581412 |  |
| BAI-EE | Live Performance | e7vfpyZKSyUOv_oro5FnO8Wuyf1wIKq9S4EhlvV8o18 | 200 | audio/mpeg | 53443127 |  |
| BAI-EE | Naree Bday Mix | lcEj4KEz6SbHL8f3veGO4DJJmz4ECsItIwaJ3XMAiDo | 200 | audio/mpeg | 147457769 |  |
| BAI-EE | Love Manifesto 3 | obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc | 200 | audio/mpeg | 176010019 |  |
| **BLUE JAY (AKA Josh Zeitler)** | **Live at Studio409 New York (2024)** | **pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg** | 200 | audio/mpeg | **166272103** | **DUPLICATE txid — shared with another non-mirror record. See callout below.** |
| BLUE JAY (AKA Josh Zeitler) | Blue Jay Live at Hush 2024 in San Francisco | QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik | 200 | audio/mpeg | 192123502 |  |
| CESAR RAMIREZ | Let Yourself Go | tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM | 200 | audio/mpeg | 203922278 | (this pass fixed mixDateYear `'01'` → `'01`) |
| JOHN SIMMONS | Live @ UE.info ?? | pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM | 200 | audio/mpeg | 76657276 |  |
| RED EYE | Live @ Viva Acid '24 | xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM | 200 | audio/mpeg | 280171663 | shares txid (allowlisted mirror) |
| DJ RELEASE AKA IKE | Live @ UE.info ?? | IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU | 200 | audio/mpeg | 57637140 |  |
| SASSMOUTH | Live at Podlasie | o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0 | 200 | audio/mpeg | 234337525 | shares txid (allowlisted mirror) |
| SEAN SMITH | Martians Mixtape | DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y | 200 | audio/mpeg | 188692025 |  |
| STAR TRAXX | Mix Tape | 3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ | 200 | audio/mpeg | 43747288 | mixDateYear "Circe '95" still fails the pattern (pre-existing typo, not in Agent 1's fix list — see note above table) |
| TYREL WILLIAMS | Live at Podlasie | aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU | 200 | audio/mpeg | 300733046 | shares txid (allowlisted mirror); (this pass fixed mixDateYear `2024h` → `2024`) |
| VIVA ACID | Live @ Viva Acid '24 (BAI-EE mirror) | 3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg | 200 | audio/mpeg | 135582895 | shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 (Andrew Emil / Red Eye mirror) | xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM | 200 | audio/mpeg | 280171663 | shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 (Sassmouth mirror) | o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0 | 200 | audio/mpeg | 234337525 | shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 (Tyrel Williams mirror) | aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU | 200 | audio/mpeg | 300733046 | shares txid (allowlisted mirror); **this pass fixed the malformed subdomain — verified live 200** |
| **Chicago Skyway** | **For Hakim** | **5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA** | 200 | audio/mpeg | **137018513** | **DUPLICATE txid — shared with another non-mirror record. See callout below. (This pass removed the bare-URL duplicate row that also pointed at this txid.)** |
| **Chicago Skyway** | **Little White Earbuds Mix** | **5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA** | 200 | audio/mpeg | **137018513** | **DUPLICATE txid — shared with another non-mirror record. See callout below.** |
| Chicago Skyway | Playing to the Wall | MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo | 200 | audio/mpeg | 120000321 |  |
| Chicago Skyway | WWFM | 08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs | 200 | audio/mpeg | 161036537 |  |
| Chicago Skyway | Chubby Podcast | yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk | 200 | audio/mpeg | 168687360 |  |
| LORELEI | Lorelei Live at Podlasie 7/18/25 | Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM | 200 | audio/mpeg | 93477147 |  |
| JEVON JACKSON | Frankie Vega B2B Jevon Jackson | 26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y | 200 | audio/mpeg | 58174454 |  |
| **BERNARD BADIE** | **Live at UE (B2B Sean Smith)** | **pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg** | 200 | audio/mpeg | **166272103** | **DUPLICATE txid — shared with another non-mirror record. See callout below.** |

**Live summary: 43/44 returned HTTP 200 with an `audio/*` Content-Type.** The 1 that did not is BAI-EE / "HPIT Promo Mix" — its txid is structurally invalid (19 chars, not 43), so no HTTP request was even attempted; it cannot resolve on any gateway as-is.

## Explicit callouts: the three shared-txid records

These three txids are each pointed at by **more than one non-mirror record** — i.e. two
(or three) different mix titles in `artists.json` currently claim the exact same
Arweave file. Agent 1's mandate does not include resolving these (that's Agent 2's
wallet audit + Agent 3's reconciliation), but here is what the live data shows, to seed
that work:

### 1. `FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg` — AKILA
- Content-Length: **144,757,160 bytes**
- Claimed by: AKILA / "...Head Ass!!!" (`mixDateYear: "6/24"`, listed `mixDuration: "60:00"`) **and** AKILA / "A drink and a smoke on the veranda" (`mixDateYear: "'24"`, listed `mixDuration: "60:00"`)
- Sampled bitrate (first ~64KB, MPEG1/Layer3 frame header): **320 kbps, 44.1kHz** → approx duration **60:19** (3618.9s)
- Read: this is genuinely a single file, and it is a plausible ~60-minute set — consistent with **both** records' claimed `60:00` duration, so duration alone does not disambiguate which title the file actually is. One of the two AKILA titles is pointing at the wrong (or a not-yet-uploaded) file. Resolving which is which requires Agent 2's wallet/ArDrive filename-tag match (GraphQL's own tags on this item carry no original filename, only `App-Name/Platform/Version` + `Content-Type`).

### 2. `pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg` — BLUE JAY / BERNARD BADIE
- Content-Length: **166,272,103 bytes**
- Claimed by: BLUE JAY (AKA Josh Zeitler) / "Live at Studio409 New York (2024)" (listed `mixDuration: "2:58"` — flagged in the master plan as a likely placeholder) **and** BERNARD BADIE / "Live at UE (B2B Sean Smith)" (listed `mixDuration: "0:00"`, unknown)
- Sampled bitrate: **128 kbps, 44.1kHz** → approx duration **173:12** (2h53m, 10392.0s)
- Read: a ~2h53m file. This flatly contradicts Blue Jay's listed `2:58` (confirming the master plan's suspicion that value is a placeholder, not real data) and is far longer than a typical single club set. It does not cleanly match either record's *listed* duration (both are effectively unknown/placeholder), so this doesn't prove which artist the file belongs to by itself — an extended B2B party set (Bernard Badie / Sean Smith at UE) is at least as plausible a fit for a ~2h53m runtime as a rooftop/venue set, but that is circumstantial. Needs Agent 2's filename/tag evidence.

### 3. `5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA` — Chicago Skyway
- Content-Length: **137,018,513 bytes**
- Claimed by: Chicago Skyway / "For Hakim" **and** Chicago Skyway / "Little White Earbuds Mix" (both listed `mixDuration: "0:00"`, unknown; both same artist, so this one is unambiguously a same-artist mispoint, not a cross-artist collision)
- Sampled bitrate: **320 kbps, 44.1kHz** → approx duration **57:05** (3425.5s)
- Read: a ~57-minute file, plausible for either title. Since both records belong to the *same* artist page, this is the simplest of the three cases to eventually fix (no cross-artist ambiguity) — Agent 2/3 need to find the second file (or confirm only one was ever uploaded, with the other title backlogged for upload).

## Headline numbers

- 44/44 mix records point at a syntactically parseable URL on an `arweave.net` host (only 1 — HPIT — fails txid-length validation).
- 43/44 live-checked records (all except HPIT, which was skipped as structurally invalid) returned **HTTP 200 with `audio/*` Content-Type**. 0 timeouts, 0 non-200s, 0 wrong-content-type among the 43 checked.
- 5 structural failures remain, all explicitly out of Agent 1's scope per the master plan (Akila collision, Blue Jay/Bernard Badie collision, Chicago Skyway collision, HPIT truncated txid, and the pre-existing Star Traxx "Circe" year typo — not in Agent 1's assigned fix list).
- 0 image-host warnings remain (Star Traxx's `ardrive.net` host was the only one; fixed this pass).
