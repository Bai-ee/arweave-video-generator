# Artist portraits

Every artist image on the site shares one look: black and white, a shadowy, blurred left side
of the face with the right side in focus, CRT scanlines (8px pitch) and heavy grain, toned to
the same black floor, midtones and highlights as the original set. New artists get the same
treatment before they are added.

## Locked portraits (approved renders)

An approved portrait is **locked**: the committed WebP is the source of truth, and
`config/artist-portraits.json` records exactly how it was made:

| Field | Meaning |
|---|---|
| `source.url`, `source.file`, `source.sha256` | where the photo came from and the exact file used |
| `crop` | the square crop `w:h:x:y` in source pixels |
| `env` | treatment settings that differ from the script defaults (e.g. `LS`) |
| `outputSha256` | the approved WebP's hash |

Renders are deterministic: the same source, recipe, script and ffmpeg produce the same bytes.

**Source photos are kept off the repo** (the repo is public and the photos are not ours to
redistribute), in `~/server/data/artist-portraits/sources/` on the server (override with
`UE_PORTRAIT_SOURCES`). Back that folder up with the rest of `~/server/data`.

Rules:

1. Never re-render or replace a locked portrait by accident. Changing the treatment script does
   **not** change existing portraits; their committed WebPs stay as they are.
2. To change one on purpose: edit its recipe, `render <slug> --out <its output path>`, review it
   side by side with two existing artists, then update `outputSha256` and `locked` in the same
   commit.
3. Before every site deploy, `verify` must print `OK` for every portrait.

```
python3 -I scripts/artist-portraits.py verify          # committed WebPs match their lock
python3 -I scripts/artist-portraits.py sources         # source photos present and unchanged
python3 -I scripts/artist-portraits.py render <slug>   # re-render to a temp file and compare to the lock
python3 -I scripts/artist-portraits.py render <slug> --out website/img/about/<slug>/portrait.webp
```

`render` that reports **DIFFERS** after an ffmpeg upgrade is expected (encoders change).
Look at it; if it still matches the set, re-lock with the new hash and toolchain version.

## Adding an artist portrait

1. Pick a photo where the artist's face is clear. Save it to the sources folder as
   `<slug>.jpg` and note its URL.
2. Frame it like the existing portraits: the face fills the square (ears near the edges, top of
   the head cropped, eyes about 40% down). Find the crop `w:h:x:y` in source pixels.
3. Try it: `scripts/artist-portrait-treatment.sh <photo> /tmp/try.webp <w:h:x:y>`. For an evenly
   lit photo add `LS=0.6` (left shade) so the shadowy left reads. Compare it at card size next to
   two existing artists; adjust the crop or `LS` until it sits in the set.
4. Add the entry to `config/artist-portraits.json` (source url/file/sha256, crop, env), run
   `render <slug> --out website/img/about/<slug>/portrait.webp`, put the printed hash in
   `outputSha256`, and run `verify`.
5. Set the artist's `artistImageFilename` in Firestore `system/artists` to
   `img/about/<slug>/portrait.webp`, commit the WebP and the recipe, merge, and deploy the site.
6. Check the DJs page and the artist page on the deployed manifest.

## Treatment settings

`scripts/artist-portrait-treatment.sh` (env overrides):

| Setting | Default | What it does |
|---|---|---|
| `CURVE` | `0/0.04 0.2/0.24 0.5/0.66 0.8/0.88 1/0.92` | starting tone curve |
| `HB`, `BL`, `BR` | 45, 0.30, 0.62 | left-side blur strength, and where focus ramps in (fraction of width) |
| `SM`, `SH` | 200, 110 | length and shift of the shadow trail to the left |
| `LS` | 0 | extra shade on the left side, for evenly lit photos |
| `TONE` | 1 | final tone match (`scripts/portrait-tone-match.py`): measured at card size, mapped onto p5/p25/p50/p75/p95 = 21/34/68/137/192 |

The DJs page lists artists alphabetically by name.

## Sources

| Artist | Photo source | Rights |
|---|---|---|
| PAUL JOHNSON | XLR8R, 2021 | owner's pick; press photo, not licensed |
| JEFF CRAVEN | LinkedIn profile photo (200px) | owner's pick |
