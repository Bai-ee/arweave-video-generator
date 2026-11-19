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
# bright source try CURVE='0/0.02 0.25/0.18 0.5/0.52 0.8/0.84 1/0.90'.
set -euo pipefail
IN=$1; OUT=$2; CROP=${3:-}
SM=${SM:-200}; SH=${SH:-110}
# Left side of the face blurred, right side in focus: sharp image fades in between BL and BR (fraction of width).
HB=${HB:-45}; BL=${BL:-0.30}; BR=${BR:-0.62}
CURVE=${CURVE:-0/0.04 0.2/0.24 0.5/0.66 0.8/0.88 1/0.92}
PRE=""; [ -n "$CROP" ] && PRE="crop=${CROP},"
ffmpeg -loglevel error -y -i "$IN" -filter_complex "
[0]${PRE}scale=1000:1000:force_original_aspect_ratio=increase:flags=lanczos,crop=1000:1000,format=gray,
normalize=blackpt=black:whitept=white:smoothing=0,
curves=master='${CURVE}',split[s][h];
[h]avgblur=sizeX=${HB}:sizeY=1,avgblur=sizeX=${HB}:sizeY=1,format=gray[hb];
[s][hb]blend=all_expr='A*clip((X/W-${BL})/(${BR}-${BL}),0,1)+B*(1-clip((X/W-${BL})/(${BR}-${BL}),0,1))',format=gray,split[a][b];
[b]avgblur=sizeX=${SM}:sizeY=1,crop=iw-${SH}:ih:${SH}:0,pad=iw+${SH}:ih:0:0:color=black,curves=master='0/0 0.5/0.32 1/0.8',format=gray[tr];
[a][tr]blend=all_expr='A*(0.05+0.95*pow(X/W,2.2))+B*(0.95-0.95*pow(X/W,2.2))',format=gray,
geq=lum='p(X+6*(2*mod(abs(sin(floor(Y/4)*12.9898)*43758.5453),1)-1),Y)',
geq=lum='lum(X,Y)*(1-0.5*lt(mod(Y,8),2.5))',
noise=alls=46:allf=u,gblur=sigma=0.6,noise=alls=18:allf=u,format=gray" \
  -c:v libwebp -quality 86 "$OUT"
echo "wrote $OUT"
