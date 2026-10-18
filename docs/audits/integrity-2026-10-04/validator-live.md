# artists.json validation report

Source: website/artists.json
Artists: 18  |  Mix records: 44

## Structural checks

FAIL — 7 structural issue(s):
- [txid-format] BAI-EE / "HPIT Promo Mix": txid "neH-PrcWXd71JCZayTX" is 19 chars (need exactly 43, [A-Za-z0-9_-])
- [year-format] CESAR RAMIREZ / "Let Yourself Go": mixDateYear "'01'" does not match expected pattern
- [year-format] STAR TRAXX / "Mix Tape": mixDateYear "Circe '95" does not match expected pattern
- [year-format] TYREL WILLIAMS / "Live at Podlasie": mixDateYear "2024h" does not match expected pattern
- [subdomain-mismatch] VIVA ACID / "Live @ Viva Acid '24": subdomain "nbdlqhjegffe2b43r4pz5db2nnluh6b6osbilcbqrlsc7e3ecxasq" != expected base32 "nbdlqhjegffe2b43r4pz5dbnnluh6b6osbilcbqrlsc7e3ecxasq" for txid aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU
- [duplicate-txid] txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg shared by 2 non-mirror records: BLUE JAY (AKA Josh Zeitler) / "Live at Studio409 New York (2024)" <-> BERNARD BADIE / "Live at UE (B2B Sean Smith)"
- [duplicate-txid] txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA shared by 3 non-mirror records: Chicago Skyway / "For Hakim" <-> Chicago Skyway / "For Hakim" <-> Chicago Skyway / "Little White Earbuds Mix"

## Warnings (non-fatal)

- [image-host] ACIDMAN / "Stargazers vs Sunbathers": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] AKILA / "...Head Ass!!!": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] AKILA / "A drink and a smoke on the veranda": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "HPIT Promo Mix": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Music Mix": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Sounds From the Divide Mix 19": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Sounds From the Divide Mix 18": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "12 Step Music Mix": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Live in Hawaii (Asylum)": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Live Performance": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Naree Bday Mix": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BAI-EE / "Love Manifesto 3": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BLUE JAY (AKA Josh Zeitler) / "Live at Studio409 New York (2024)": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BLUE JAY (AKA Josh Zeitler) / "Blue Jay Live at Hush 2024 in San Francisco": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] JOHN SIMMONS / "Live @ UE.info ??": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] DJ RELEASE AKA IKE / "Live @ UE.info ??": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] SASSMOUTH / "Live at Podlasie": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] SEAN SMITH / "Martians Mixtape": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] STAR TRAXX: artistImageFilename host is "7utlvsnf5pwxyvghgmypkzmcvm6skupeup5cj5ogdaygu5rzjtca.ardrive.net", not arweave.net
- [image-host] TYREL WILLIAMS / "Live at Podlasie": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] VIVA ACID / "Live @ Viva Acid '24": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] VIVA ACID / "Live @ Viva Acid '24": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] VIVA ACID / "Live @ Viva Acid '24": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "For Hakim": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "For Hakim": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "Little White Earbuds Mix": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "Playing to the Wall": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "WWFM": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "Chubby Podcast": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] LORELEI / "Lorelei Live at Podlasie 7/18/25": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] JEVON JACKSON / "Frankie Vega B2B Jevon Jackson": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BERNARD BADIE / "Live at UE (B2B Sean Smith)": mixImageFilename host is "storage.googleapis.com", not arweave.net

## Live gateway status (https://arweave.net/<txid>)

| Artist | Mix Title | Txid | HTTP Status | Content-Type | Content-Length (bytes) | Note |
|---|---|---|---|---|---|---|
| ACIDMAN | Stargazers vs Sunbathers | fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g | ERROR: This operation was aborted | audio/mpeg | 108034116 |  |
| ACIDMAN | Live @ Smartbar | nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM | ERROR: This operation was aborted |  |  |  |
| ACIDMAN | Loft Livin | 0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI | ERROR: This operation was aborted |  |  |  |
| AKILA | ...Head Ass!!! | FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg | ERROR: This operation was aborted |  |  |  |
| AKILA | A drink and a smoke on the veranda | m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE | ERROR: This operation was aborted |  |  |  |
| ANDREW EMIL | Live @ Viva Acid '24 | xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM | 200 | audio/mpeg |  | shares txid (allowlisted mirror) |
| ANDREW EMIL | Live @ Flammable '19 | RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA | 200 | audio/mpeg |  |  |
| BAI-EE | Live @ Viva Acid '24 | 3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg | 200 | audio/mpeg |  | shares txid (allowlisted mirror) |
| BAI-EE | Fathers Day Jazz Mix | m6ZORqpkbfO6OsbpNPGswjQFUmf7MonBRFgDXVjIeMQ | ERROR: This operation was aborted |  |  |  |
| BAI-EE | Rough Times | w0tHAsKEQphJzh-JEbQuxUWPv-0aHsecs7TIdONTd28 | 200 | audio/mpeg |  |  |
| BAI-EE | Love Manifesto (2) V-Day Mix | BUIC8eBMYSWBRU4lKSAQVr3r-spiWbK0uxZ5g7rl8Bw | 200 | audio/mpeg |  |  |
| BAI-EE | Love Manifesto V-Day Mix | fxxlhewYkzcExqp_czyOd9p1rNzb2QWCF5akGYejbew | 200 | audio/mpeg |  |  |
| BAI-EE | HPIT Promo Mix | neH-PrcWXd71JCZayTX | ERROR: skipped (no valid txid) |  |  | bad txid length (19) |
| BAI-EE | Music Mix | qmOWTuGHuf7-ed5jb9KD8NFE2ARXCZFGG6bk5Na-ZJ8 | 200 | audio/mpeg |  |  |
| BAI-EE | Sounds From the Divide Mix 19 | M-3TZEkPlLTvsI7NVHsqYZFuBZXcJQCm1tMkaj_f_v4 | 200 | audio/mpeg |  |  |
| BAI-EE | Sounds From the Divide Mix 18 | y-Lik8vT2L8XUxjPrUEd6METNjYXJfDY52DspUNEJf0 | 200 | audio/mpeg |  |  |
| BAI-EE | 12 Step Music Mix | uOXdDRYvNv2OUm6tdEuyZvL1_1O8FtL7KvYBisNEg2o | 200 | audio/mpeg |  |  |
| BAI-EE | Live in Hawaii (Asylum) | 9LUIqtUo6qbpnVKJWQc87xQ5iROjWVVJao-8nhasndU | 200 | audio/mpeg |  |  |
| BAI-EE | Live Performance | e7vfpyZKSyUOv_oro5FnO8Wuyf1wIKq9S4EhlvV8o18 | 200 | audio/mpeg | 53443127 |  |
| BAI-EE | Naree Bday Mix | lcEj4KEz6SbHL8f3veGO4DJJmz4ECsItIwaJ3XMAiDo | 200 | audio/mpeg |  |  |
| BAI-EE | Love Manifesto 3 | obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc | ERROR: This operation was aborted |  |  |  |
| BLUE JAY (AKA Josh Zeitler) | Live at Studio409 New York (2024) | pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg | 200 | audio/mpeg |  | DUPLICATE txid — shared with another non-mirror record |
| BLUE JAY (AKA Josh Zeitler) | Blue Jay Live at Hush 2024 in San Francisco | QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik | ERROR: This operation was aborted |  |  |  |
| CESAR RAMIREZ | Let Yourself Go | tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM | ERROR: This operation was aborted |  |  | bad mixDateYear format |
| JOHN SIMMONS | Live @ UE.info ?? | pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM | ERROR: This operation was aborted |  |  |  |
| RED EYE | Live @ Viva Acid '24 | xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM | 200 | audio/mpeg |  | shares txid (allowlisted mirror) |
| DJ RELEASE AKA IKE | Live @ UE.info ?? | IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU | 200 | audio/mpeg |  |  |
| SASSMOUTH | Live at Podlasie | o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0 | ERROR: This operation was aborted |  |  | shares txid (allowlisted mirror) |
| SEAN SMITH | Martians Mixtape | DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y | 200 | audio/mpeg |  |  |
| STAR TRAXX | Mix Tape | 3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ | 200 | audio/mpeg |  | bad mixDateYear format |
| TYREL WILLIAMS | Live at Podlasie | aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU | 200 | audio/mpeg |  | bad mixDateYear format; shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 | 3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg | ERROR: This operation was aborted |  |  | shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 | xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM | 200 | audio/mpeg |  | shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 | o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0 | ERROR: This operation was aborted |  |  | shares txid (allowlisted mirror) |
| VIVA ACID | Live @ Viva Acid '24 | aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU | 200 | audio/mpeg |  | subdomain mismatch (expected nbdlqhjegffe2b43r4pz5dbnnluh6b6osbilcbqrlsc7e3ecxasq); shares txid (allowlisted mirror) |
| Chicago Skyway | For Hakim | 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA | 200 | audio/mpeg |  | DUPLICATE txid — shared with another non-mirror record; DUPLICATE txid — shared with another non-mirror record |
| Chicago Skyway | For Hakim | 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA | 200 | audio/mpeg |  |  |
| Chicago Skyway | Little White Earbuds Mix | 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA | 200 | audio/mpeg |  | DUPLICATE txid — shared with another non-mirror record |
| Chicago Skyway | Playing to the Wall | MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo | 200 | audio/mpeg |  |  |
| Chicago Skyway | WWFM | 08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs | ERROR: This operation was aborted |  |  |  |
| Chicago Skyway | Chubby Podcast | yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk | 200 | audio/mpeg |  |  |
| LORELEI | Lorelei Live at Podlasie 7/18/25 | Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM | 200 | audio/mpeg |  |  |
| JEVON JACKSON | Frankie Vega B2B Jevon Jackson | 26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y | 200 | audio/mpeg |  |  |
| BERNARD BADIE | Live at UE (B2B Sean Smith) | pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg | 200 | audio/mpeg |  | DUPLICATE txid — shared with another non-mirror record |

Content-Length is sourced from the public Arweave GraphQL endpoint (`data.size`), since the gateway data route omits Content-Length for these bundled ArDrive items and ignores Range requests.

Live summary: 29/44 returned HTTP 200 with an audio/* Content-Type. 15 did not (see table for status/reason).

## Machine-readable summary

```json
{
  "source": "website/artists.json",
  "artistCount": 18,
  "mixCount": 44,
  "structuralFailureCount": 7,
  "structuralFailures": [
    "[txid-format] BAI-EE / \"HPIT Promo Mix\": txid \"neH-PrcWXd71JCZayTX\" is 19 chars (need exactly 43, [A-Za-z0-9_-])",
    "[year-format] CESAR RAMIREZ / \"Let Yourself Go\": mixDateYear \"'01'\" does not match expected pattern",
    "[year-format] STAR TRAXX / \"Mix Tape\": mixDateYear \"Circe '95\" does not match expected pattern",
    "[year-format] TYREL WILLIAMS / \"Live at Podlasie\": mixDateYear \"2024h\" does not match expected pattern",
    "[subdomain-mismatch] VIVA ACID / \"Live @ Viva Acid '24\": subdomain \"nbdlqhjegffe2b43r4pz5db2nnluh6b6osbilcbqrlsc7e3ecxasq\" != expected base32 \"nbdlqhjegffe2b43r4pz5dbnnluh6b6osbilcbqrlsc7e3ecxasq\" for txid aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU",
    "[duplicate-txid] txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg shared by 2 non-mirror records: BLUE JAY (AKA Josh Zeitler) / \"Live at Studio409 New York (2024)\" <-> BERNARD BADIE / \"Live at UE (B2B Sean Smith)\"",
    "[duplicate-txid] txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA shared by 3 non-mirror records: Chicago Skyway / \"For Hakim\" <-> Chicago Skyway / \"For Hakim\" <-> Chicago Skyway / \"Little White Earbuds Mix\""
  ],
  "warningCount": 32,
  "warnings": [
    "[image-host] ACIDMAN / \"Stargazers vs Sunbathers\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] AKILA / \"...Head Ass!!!\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] AKILA / \"A drink and a smoke on the veranda\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"HPIT Promo Mix\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Music Mix\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Sounds From the Divide Mix 19\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Sounds From the Divide Mix 18\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"12 Step Music Mix\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Live in Hawaii (Asylum)\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Live Performance\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Naree Bday Mix\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BAI-EE / \"Love Manifesto 3\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BLUE JAY (AKA Josh Zeitler) / \"Live at Studio409 New York (2024)\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BLUE JAY (AKA Josh Zeitler) / \"Blue Jay Live at Hush 2024 in San Francisco\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] JOHN SIMMONS / \"Live @ UE.info ??\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] DJ RELEASE AKA IKE / \"Live @ UE.info ??\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] SASSMOUTH / \"Live at Podlasie\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] SEAN SMITH / \"Martians Mixtape\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] STAR TRAXX: artistImageFilename host is \"7utlvsnf5pwxyvghgmypkzmcvm6skupeup5cj5ogdaygu5rzjtca.ardrive.net\", not arweave.net",
    "[image-host] TYREL WILLIAMS / \"Live at Podlasie\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] VIVA ACID / \"Live @ Viva Acid '24\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] VIVA ACID / \"Live @ Viva Acid '24\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] VIVA ACID / \"Live @ Viva Acid '24\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] Chicago Skyway / \"For Hakim\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] Chicago Skyway / \"For Hakim\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] Chicago Skyway / \"Little White Earbuds Mix\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] Chicago Skyway / \"Playing to the Wall\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] Chicago Skyway / \"WWFM\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] Chicago Skyway / \"Chubby Podcast\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] LORELEI / \"Lorelei Live at Podlasie 7/18/25\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] JEVON JACKSON / \"Frankie Vega B2B Jevon Jackson\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net",
    "[image-host] BERNARD BADIE / \"Live at UE (B2B Sean Smith)\": mixImageFilename host is \"storage.googleapis.com\", not arweave.net"
  ],
  "duplicateGroups": [
    {
      "txid": "pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg",
      "owners": [
        {
          "artistName": "BLUE JAY (AKA Josh Zeitler)",
          "mixTitle": "Live at Studio409 New York (2024)",
          "allowlisted": false
        },
        {
          "artistName": "BERNARD BADIE",
          "mixTitle": "Live at UE (B2B Sean Smith)",
          "allowlisted": false
        }
      ]
    },
    {
      "txid": "5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA",
      "owners": [
        {
          "artistName": "Chicago Skyway",
          "mixTitle": "For Hakim",
          "allowlisted": false
        },
        {
          "artistName": "Chicago Skyway",
          "mixTitle": "For Hakim",
          "allowlisted": false
        },
        {
          "artistName": "Chicago Skyway",
          "mixTitle": "Little White Earbuds Mix",
          "allowlisted": false
        }
      ]
    }
  ],
  "live": [
    {
      "artistName": "ACIDMAN",
      "mixTitle": "Stargazers vs Sunbathers",
      "txid": "fDmPaKw2orYN8cLsHNTl9YhDa92_rPG5TbFdImNvD-g",
      "status": null,
      "contentType": "audio/mpeg",
      "contentLength": "108034116",
      "contentLengthSource": "graphql",
      "bundledIn": "",
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "ACIDMAN",
      "mixTitle": "Live @ Smartbar",
      "txid": "nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "ACIDMAN",
      "mixTitle": "Loft Livin",
      "txid": "0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "AKILA",
      "mixTitle": "...Head Ass!!!",
      "txid": "FoiSNjnR_NNyrGj_t_TnxVC1P5A4RNsk7UpsxDcNHDg",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "AKILA",
      "mixTitle": "A drink and a smoke on the veranda",
      "txid": "m5yLoteqsoYnQf7GgC8rBP4UWWsBFyqJNBGa6erGeYE",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "ANDREW EMIL",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "ANDREW EMIL",
      "mixTitle": "Live @ Flammable '19",
      "txid": "RtGE-2yiAlWDkTTuiiJf0XHkWCbcRZ_UYNTjj947VlA",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Fathers Day Jazz Mix",
      "txid": "m6ZORqpkbfO6OsbpNPGswjQFUmf7MonBRFgDXVjIeMQ",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Rough Times",
      "txid": "w0tHAsKEQphJzh-JEbQuxUWPv-0aHsecs7TIdONTd28",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Love Manifesto (2) V-Day Mix",
      "txid": "BUIC8eBMYSWBRU4lKSAQVr3r-spiWbK0uxZ5g7rl8Bw",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Love Manifesto V-Day Mix",
      "txid": "fxxlhewYkzcExqp_czyOd9p1rNzb2QWCF5akGYejbew",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "HPIT Promo Mix",
      "txid": "neH-PrcWXd71JCZayTX",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": null,
      "error": "skipped (no valid txid)"
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Music Mix",
      "txid": "qmOWTuGHuf7-ed5jb9KD8NFE2ARXCZFGG6bk5Na-ZJ8",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Sounds From the Divide Mix 19",
      "txid": "M-3TZEkPlLTvsI7NVHsqYZFuBZXcJQCm1tMkaj_f_v4",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Sounds From the Divide Mix 18",
      "txid": "y-Lik8vT2L8XUxjPrUEd6METNjYXJfDY52DspUNEJf0",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "12 Step Music Mix",
      "txid": "uOXdDRYvNv2OUm6tdEuyZvL1_1O8FtL7KvYBisNEg2o",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Live in Hawaii (Asylum)",
      "txid": "9LUIqtUo6qbpnVKJWQc87xQ5iROjWVVJao-8nhasndU",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Live Performance",
      "txid": "e7vfpyZKSyUOv_oro5FnO8Wuyf1wIKq9S4EhlvV8o18",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": "53443127",
      "contentLengthSource": "graphql",
      "bundledIn": "",
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Naree Bday Mix",
      "txid": "lcEj4KEz6SbHL8f3veGO4DJJmz4ECsItIwaJ3XMAiDo",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BAI-EE",
      "mixTitle": "Love Manifesto 3",
      "txid": "obNw2Z8Iqiyb20nWRLGzLD0zeHQyoyPVkM7J7KpEGRc",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "BLUE JAY (AKA Josh Zeitler)",
      "mixTitle": "Live at Studio409 New York (2024)",
      "txid": "pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BLUE JAY (AKA Josh Zeitler)",
      "mixTitle": "Blue Jay Live at Hush 2024 in San Francisco",
      "txid": "QKq9wOwag4gz2vRgnnIEpvSMStK_Zce0cIlA7ng24ik",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "CESAR RAMIREZ",
      "mixTitle": "Let Yourself Go",
      "txid": "tDB3F_uqkaPLrLJ9NnDOGRrFm-HXEoVp1UzaU-XSRkM",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "JOHN SIMMONS",
      "mixTitle": "Live @ UE.info ??",
      "txid": "pLuskRb2iI0Q1A2lw9MWfi3G5qm9CIkz71T3p4k4cjM",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "RED EYE",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "DJ RELEASE AKA IKE",
      "mixTitle": "Live @ UE.info ??",
      "txid": "IwIa6k89DSvbMb61pKkvFAKdUbALe4AiB-RM4AqoNgU",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "SASSMOUTH",
      "mixTitle": "Live at Podlasie",
      "txid": "o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "SEAN SMITH",
      "mixTitle": "Martians Mixtape",
      "txid": "DlB2BFAYP_zTWS-uakYisom_3CIlqm7d1Zc7lrZ9C0Y",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "STAR TRAXX",
      "mixTitle": "Mix Tape",
      "txid": "3Pl3Q1KVjHMQcLycnIlLW2HHAx5_LxmT819YVnUA-JQ",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "TYREL WILLIAMS",
      "mixTitle": "Live at Podlasie",
      "txid": "aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "VIVA ACID",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "VIVA ACID",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "VIVA ACID",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "o0FK78kfeGy1cnM65Jdfhbum3pI_Z3xx8ijw6SSXjr0",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "VIVA ACID",
      "mixTitle": "Live @ Viva Acid '24",
      "txid": "aEa4HSQxSk0Hm48fnowtauh_B86QULEGEVyF8myCuCU",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "Chicago Skyway",
      "mixTitle": "For Hakim",
      "txid": "5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "Chicago Skyway",
      "mixTitle": "For Hakim",
      "txid": "5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "Chicago Skyway",
      "mixTitle": "Little White Earbuds Mix",
      "txid": "5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "Chicago Skyway",
      "mixTitle": "Playing to the Wall",
      "txid": "MPL6T_m7Rg3FogpFNBp81yupZBsRwu6Tk1zGWXdzSzo",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "Chicago Skyway",
      "mixTitle": "WWFM",
      "txid": "08zYQJAzfxQLXZh2nG1hY7iStS3i04Oll_3BgM577Cs",
      "status": null,
      "contentType": null,
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD/GET",
      "error": "This operation was aborted"
    },
    {
      "artistName": "Chicago Skyway",
      "mixTitle": "Chubby Podcast",
      "txid": "yK5FFpRZwa8exINngmeENTgQLQBMBxKKn7i1as20IXk",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "GET(range,fallback-from-error)",
      "error": null
    },
    {
      "artistName": "LORELEI",
      "mixTitle": "Lorelei Live at Podlasie 7/18/25",
      "txid": "Y5DfJ54VC_2-gKJ90Ts_RJZhhDKsV869SdsYB0n9GqM",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "JEVON JACKSON",
      "mixTitle": "Frankie Vega B2B Jevon Jackson",
      "txid": "26lgzySQrL0NGDnPiHvpA89UFK15x4JxF_YLo0jDI1Y",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    },
    {
      "artistName": "BERNARD BADIE",
      "mixTitle": "Live at UE (B2B Sean Smith)",
      "txid": "pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg",
      "status": 200,
      "contentType": "audio/mpeg",
      "contentLength": null,
      "contentLengthSource": null,
      "bundledIn": null,
      "method": "HEAD",
      "error": null
    }
  ]
}
```
node scripts/validate-artists-json.mjs --live  1.39s user 0.44s system 0% cpu 6:34.22 total
