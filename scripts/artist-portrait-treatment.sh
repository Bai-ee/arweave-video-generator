#!/bin/bash
# UE artist portrait treatment (owner-approved look, 2026-11-18).
# Matches the existing artist images: high-contrast B&W, a shadowy horizontal
# trail extending to the LEFT (fades out toward the right), per-row jitter,
# CRT scanlines (pitch 8px — the pitch that survives card/row downscaling, see
# UE_RELEASE_HANDOFF.md §17) and heavy grain.
#
# Input: any photo, already framed so the face fills the square the way the
# other artist images do (ears near the edges, top of the head cropped).
# Output: 1000x1000 grayscale WebP for website/img/about/<slug>/portrait.webp.
#
# usage: scripts/artist-portrait-treatment.sh <in.jpg> <out.webp> [crop=w:h:x:y]
#   env: CURVE (tone curve), SM (trail blur px, 200), SH (trail shift px, 110),
#        HB (left-side blur px, 45), BL/BR (blur->focus ramp, 0.30-0.62 of width)
# Low-key sources (dark background) look right with the default CURVE; for a
# bright, evenly lit source use CURVE='0/0 0.3/0.06 0.55/0.36 0.8/0.74 1/0.92' LS=0.7 (Jeff Craven).
set -euo pipefail
IN=$1; OUT=$2; CROP=${3:-}
SM=${SM:-200}; SH=${SH:-110}
# Left side of the face blurred, right side in focus: sharp image fades in between BL and BR (fraction of width).
HB=${HB:-45}; BL=${BL:-0.30}; BR=${BR:-0.62}
# LS: extra shade on the left side (0 = none). Evenly lit, bright photos need ~0.7 to get the shadowy left.
LS=${LS:-0}
CURVE=${CURVE:-0/0.04 0.2/0.24 0.5/0.66 0.8/0.88 1/0.92}
PRE=""; [ -n "$CROP" ] && PRE="crop=${CROP},"
TMPD=$(mktemp -d); TMP="$TMPD/portrait.png"; trap 'rm -rf "$TMPD"' EXIT
ffmpeg -loglevel error -y -i "$IN" -filter_complex "
[0]${PRE}scale=1000:1000:force_original_aspect_ratio=increase:flags=lanczos,crop=1000:1000,format=gray,
normalize=blackpt=black:whitept=white:smoothing=0,
curves=master='${CURVE}',split[s][h];
[h]avgblur=sizeX=${HB}:sizeY=1,avgblur=sizeX=${HB}:sizeY=1,format=gray[hb];
[s][hb]blend=all_expr='A*clip((X/W-${BL})/(${BR}-${BL}),0,1)+B*(1-clip((X/W-${BL})/(${BR}-${BL}),0,1))',format=gray,split[a][b];
[b]avgblur=sizeX=${SM}:sizeY=1,crop=iw-${SH}:ih:${SH}:0,pad=iw+${SH}:ih:0:0:color=black,curves=master='0/0 0.5/0.32 1/0.8',format=gray[tr];
[a][tr]blend=all_expr='A*(0.05+0.95*pow(X/W,2.2))+B*(0.95-0.95*pow(X/W,2.2))',format=gray,
geq=lum='p(X+6*(2*mod(abs(sin(floor(Y/4)*12.9898)*43758.5453),1)-1),Y)',
geq=lum='lum(X,Y)*(1-${LS}*pow(1-X/W,1.4))*(1-0.5*lt(mod(Y,8),2.5))',
noise=alls=46:allf=u,gblur=sigma=0.6,noise=alls=18:allf=u,format=gray" \
  -f image2 -c:v png "$TMP"
# Tone match (TONE=0 to skip): map this image's 5/25/50/75/95th luminance
# percentiles onto the existing artist set (measured 2026-11-18 on 8 portraits:
# p5 ~21, p25 ~34, p50 ~68, p75 ~137, p95 ~192 of 255), so every portrait has the
# same black floor, midtones and highlights.
if [ "${TONE:-1}" = "1" ]; then
  python3 -I "$(dirname "$0")/portrait-tone-match.py" "$TMP" "$OUT"
else
  ffmpeg -loglevel error -y -i "$TMP" -c:v libwebp -quality 86 "$OUT"
fi
echo "wrote $OUT"
