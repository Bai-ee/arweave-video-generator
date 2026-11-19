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

Tuning: `CURVE` (tone), `SM` (trail length), `SH` (trail shift), `HB`/`BL`/`BR` (left blur), `LS` (left shade, for evenly lit photos). The script ends with a tone match (TONE=1, default) that maps each portrait onto the existing set's black floor, midtones and highlights. The defaults are tuned on
a low-key photo (dark background); a bright photo may need a darker `CURVE` (see the script).

The DJs page lists artists alphabetically by name.

## Sources

| Artist | Photo source | Rights |
|---|---|---|
| PAUL JOHNSON | XLR8R, 2021 (`E7-Gde0WQAc3lj1-2-1024x683.jpeg`) | owner's pick; press photo, not licensed |
| JEFF CRAVEN | Large Music (`jeff2020-e1608491085146.jpeg`), crop `330:330:110:51`, `CURVE='0/0 0.3/0.06 0.55/0.36 0.8/0.74 1/0.92' LS=0.7` | owner's pick |
