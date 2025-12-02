/**
 * Video Filter Presets
 * Adapted for square format (720x720) from original vertical (1080:1920) presets
 */

export const VIDEO_FILTERS = {
  'look_gritty_neon_club': {
    name: 'Gritty Neon Club',
    description: 'Punchy contrast, slight neon saturation, dirty grain',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=contrast=1.2:brightness=-0.03:saturation=1.15,curves=preset=medium_contrast,noise=alls=8:allf=t+u,vignette=0.35'
  },
  'look_faded_90s_tape': {
    name: 'Faded 90s Tape',
    description: 'Washed, low-contrast tape feel with motion smear',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=contrast=0.95:brightness=0.02:saturation=1.05,curves=preset=washed_out,noise=alls=12:allf=t+u,tmix=frames=3:weights=\'1 2 1\''
  },
  'look_hard_bw_street_doc': {
    name: 'Hard B&W Street Doc',
    description: 'Aggro black & white, doc-style club footage',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,format=gray,eq=contrast=1.45:brightness=-0.02,unsharp=7:7:0.9:7:7:0.0,vignette=0.4'
  },
  'look_camcorder_ghost': {
    name: 'Camcorder Ghost',
    description: 'Cheap DV / camcorder vibe, great for crowd shots',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=contrast=1.05:saturation=0.85,noise=alls=10:allf=t+u,tblend=all_mode=lighten'
  },
  'look_club_cinematic_dirty': {
    name: 'Club Cinematic Dirty',
    description: 'Cinematic contrast but still grimy',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=contrast=1.18:brightness=-0.025:saturation=1.1,curves=preset=medium_contrast,noise=alls=6:allf=t+u,vignette=0.32'
  },
  'look_neon_nightclub': {
    name: 'Neon Nightclub',
    description: 'Crushed blacks, neon mids, for laser / LED-heavy shots',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=brightness=-0.04:contrast=1.25:saturation=1.25,curves=g=\'0/0 0.2/0.1 0.6/0.8 1/1\',noise=alls=14:allf=t+u,vignette=0.6'
  },
  'look_zine_posterized_color': {
    name: 'Zine Posterized Color',
    description: 'Posterized, graphic, zine / sticker-pack feel',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=contrast=1.2:saturation=1.2,lut=r=round(val/32)*32:g=round(val/32)*32:b=round(val/32)*32,unsharp=5:5:0.8'
  },
  'look_pixel_grit_vertical': {
    name: 'Pixel Grit',
    description: 'Low-fi pixelated alley vibe, still readable faces',
    filter: 'scale=240:240:force_original_aspect_ratio=decrease:flags=neighbor,scale=720:720:flags=neighbor,eq=contrast=1.1:saturation=1.15,noise=alls=5:allf=t+u'
  },
  'look_sodium_streetlight': {
    name: 'Sodium Streetlight',
    description: 'Warm orange club/street lighting, gritty and moody',
    filter: 'scale=720:720:force_original_aspect_ratio=decrease,pad=720:720:(720-iw)/2:(720-ih)/2:black,eq=saturation=1.1:contrast=1.08,curves=r=\'0/0 0.3/0.35 1/1\':b=\'0/0 0.5/0.4 1/0.9\',noise=alls=10:allf=t+u,vignette=0.5'
  }
};

/**
 * Get filter by key
 */
export function getFilter(key) {
  return VIDEO_FILTERS[key] || null;
}

/**
 * Get all filter keys
 */
export function getAllFilterKeys() {
  return Object.keys(VIDEO_FILTERS);
}

