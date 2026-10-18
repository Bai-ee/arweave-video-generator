# artists.json validation report

Source: docs/audits/integrity-2026-10-04/artists.patched.json
Artists: 18  |  Mix records: 43

## Structural checks

FAIL — 3 structural issue(s):
- [txid-format] BAI-EE / "HPIT Promo Mix": txid "neH-PrcWXd71JCZayTX" is 19 chars (need exactly 43, [A-Za-z0-9_-])
- [duplicate-txid] txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg shared by 2 non-mirror records: BLUE JAY (AKA Josh Zeitler) / "Live at Studio409 New York (2024)" <-> BERNARD BADIE / "Live at UE (B2B Sean Smith)"
- [duplicate-txid] txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA shared by 2 non-mirror records: Chicago Skyway / "For Hakim" <-> Chicago Skyway / "Little White Earbuds Mix"

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
- [image-host] Chicago Skyway / "Little White Earbuds Mix": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "Playing to the Wall": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "WWFM": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] Chicago Skyway / "Chubby Podcast": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] LORELEI / "Lorelei Live at Podlasie 7/18/25": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] JEVON JACKSON / "Frankie Vega B2B Jevon Jackson": mixImageFilename host is "storage.googleapis.com", not arweave.net
- [image-host] BERNARD BADIE / "Live at UE (B2B Sean Smith)": mixImageFilename host is "storage.googleapis.com", not arweave.net

## Machine-readable summary

```json
{
  "source": "docs/audits/integrity-2026-10-04/artists.patched.json",
  "artistCount": 18,
  "mixCount": 43,
  "structuralFailureCount": 3,
  "structuralFailures": [
    "[txid-format] BAI-EE / \"HPIT Promo Mix\": txid \"neH-PrcWXd71JCZayTX\" is 19 chars (need exactly 43, [A-Za-z0-9_-])",
    "[duplicate-txid] txid pk_RLPfAbytba0bMwTh4u5Xx2Bz1Sw-SeW-dZ8T0SMg shared by 2 non-mirror records: BLUE JAY (AKA Josh Zeitler) / \"Live at Studio409 New York (2024)\" <-> BERNARD BADIE / \"Live at UE (B2B Sean Smith)\"",
    "[duplicate-txid] txid 5lOnZSh458XC-wk1xTkLimE-L-g0vnKejInB834VAEA shared by 2 non-mirror records: Chicago Skyway / \"For Hakim\" <-> Chicago Skyway / \"Little White Earbuds Mix\""
  ],
  "warningCount": 31,
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
          "mixTitle": "Little White Earbuds Mix",
          "allowlisted": false
        }
      ]
    }
  ],
  "live": null
}
```
