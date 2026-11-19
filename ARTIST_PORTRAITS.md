# Artist portraits

Every artist image on the site shares one look: high-contrast black and white, a shadowy
horizontal trail extending to the left, CRT scanlines and heavy grain. New artists get the
same treatment before they are added.

## Adding an artist portrait

1. Pick a photo where the artist's face is clear. Record its source.
2. Frame it like the existing portraits: the face fills the square (ears near the edges,
   top of the head cropped). Pass the crop as `w:h:x:y` in source pixels.
3. Run the treatment:
   ```
   scripts/artist-portrait-treatment.sh <photo> website/img/about/<slug>/portrait.webp <w:h:x:y>
   ```
4. Set the artist's `artistImageFilename` in Firestore `system/artists` to
   `img/about/<slug>/portrait.webp`, commit the WebP, merge, and deploy the site.
5. Check the DJs page and the artist page next to two existing artists.

Tuning: `CURVE` (tone), `SM` (trail length), `SH` (trail shift), `HB`/`BL`/`BR` (left blur), `LS` (left shade, for evenly lit photos). The script ends with a tone match (`scripts/portrait-tone-match.py`, TONE=1 default): it measures the portrait at card size and maps it onto the existing set's black floor, midtones and highlights (p5/p25/p50/p75/p95 = 21/34/68/137/192). The defaults are tuned on
a low-key photo (dark background); a bright photo may need a darker `CURVE` (see the script).

The DJs page lists artists alphabetically by name.

## Sources

| Artist | Photo source | Rights |
|---|---|---|
| PAUL JOHNSON | XLR8R, 2021 (`E7-Gde0WQAc3lj1-2-1024x683.jpeg`) | owner's pick; press photo, not licensed |
| JEFF CRAVEN | LinkedIn profile photo (200px), crop `128:128:32:14`, `LS=0.6` | owner's pick |
