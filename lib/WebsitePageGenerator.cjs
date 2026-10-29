/**
 * WebsitePageGenerator — generates the Underground Existence public site
 * from website/artists.json (the stable data interface synced from
 * Firestore system/artists by WebsiteSync.js).
 *
 * Produces: index.html, residents.html, archive.html, about.html and one
 * page per artist ({artistFilename}). Templates live in website/templates/
 * ({{TOKEN}} placeholders + {{> partial}} includes from templates/partials/).
 *
 * Player data contract (consumed by js/player.js):
 *   <a data-playlist data-title data-artist data-img data-duration-sec
 *      href="MIX_AUDIO_URL">  — href is the arweave.net audio URL.
 *
 * Arweave constraints: all asset refs root-relative, all page links
 * relative, no per-deploy absolute hostnames (canonical/og use the stable
 * public domain). index.html stays the manifest index.
 */

const fs = require('fs');
const path = require('path');

/* ------------------------------------------------- hero promo clips ----
 * The homepage hero plays one of THIS PIPELINE'S OWN 30-second mix promos —
 * a real generated video for a real mix in the archive, not stock footage.
 *
 * The catalog is built by scripts/build-hero-promo-catalog.mjs, which reads the
 * `videos`/`videoJobs` Firestore collections, strips the expiring signatures
 * off the stored URLs, verifies each object is actually public, and dedupes to
 * one clip per mix. Re-run that script when new promos are generated.
 *
 * Read at generation time; if the catalog is missing or unreadable the hero
 * silently falls back to the still image, exactly as before.
 */
const HERO_CLIP_CATALOG = path.join(__dirname, '..', 'config', 'hero-promo-videos.json');

function heroPromoClips() {
  try {
    const cat = JSON.parse(fs.readFileSync(HERO_CLIP_CATALOG, 'utf8'));
    return (cat.clips || [])
      .filter(c => c && typeof c.url === 'string' && /^https:\/\//.test(c.url))
      .map(c => ({ u: c.url, a: c.artist || '', t: c.mixTitle || '' }));
  } catch (err) {
    return [];
  }
}

/* The same catalog, indexed by mix so EVERY surface (mix cards, catalog rows,
 * artist pages) can name its own promo — not just the homepage hero. The share
 * modal hands this 30s square film to the listener, which is the only route to
 * Instagram and TikTok: neither has a web share intent, both take an upload.
 *
 * Matching is on artist + mix title, the only identity the Firestore video
 * metadata and artists.json share (no txid is stored on a clip). Folded to
 * lowercase with collapsed whitespace because the two sources were typed by
 * different hands. A mix that does not match simply has no video and the modal
 * drops that button. Built once per process — the catalog cannot change
 * mid-generation.
 */
function promoKey(artist, title) {
  const fold = function (s) {
    return String(s === null || s === undefined ? '' : s).trim().replace(/\s+/g, ' ').toLowerCase();
  };
  const a = fold(artist);
  const t = fold(title);
  return a && t ? a + '|' + t : '';
}

let PROMO_VIDEO_INDEX = null;

function promoVideoFor(artistName, mixTitle) {
  if (!PROMO_VIDEO_INDEX) {
    PROMO_VIDEO_INDEX = Object.create(null);
    try {
      const cat = JSON.parse(fs.readFileSync(HERO_CLIP_CATALOG, 'utf8'));
      (cat.clips || []).forEach(function (c) {
        if (!c || typeof c.url !== 'string' || !/^https:\/\//.test(c.url)) return;
        const k = promoKey(c.artist, c.mixTitle);
        /* first clip wins: the catalog is already deduped to one per mix, and a
           stable pick keeps generated pages identical across runs */
        if (k && PROMO_VIDEO_INDEX[k] === undefined) PROMO_VIDEO_INDEX[k] = c.url;
      });
    } catch (err) {
      /* no catalog -> no videos anywhere, exactly as before */
    }
  }
  const key = promoKey(artistName, mixTitle);
  return key ? (PROMO_VIDEO_INDEX[key] || '') : '';
}

/* ---------------------------------------------------------------- utils */

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function (tag) {
    const charsToReplace = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return charsToReplace[tag] || tag;
  });
}

/**
 * Parse the free-form mixDateYear field into a sortable key and a clean
 * display string. Source data is never modified — this is render-time only.
 * Known shapes: "'09", "'01'", "6/24", "7/18/25", "2022", "2024h",
 * "Circa 2009", "Circe '95", "20??", "??", "".
 */
const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function expandYear(two) {
  const n = parseInt(two, 10);
  return n >= 50 ? 1900 + n : 2000 + n;
}

function parseMixDate(raw) {
  const none = { key: 0, display: null };
  if (!raw) return none;
  const s = String(raw).trim();
  if (!s || /\?\?/.test(s)) return none;

  const circa = /circ/i.test(s);

  // m/d/yy or m/yy  (e.g. 7/18/25, 6/24), optionally "Circa 10/02/13"
  let m = s.replace(/^circa\s+/i, '').match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) {
    let month = parseInt(m[1], 10);
    let day = null;
    let year;
    if (m[3] !== undefined) {
      day = parseInt(m[2], 10);
      year = m[3].length === 2 ? expandYear(m[3]) : parseInt(m[3], 10);
    } else {
      year = m[2].length === 2 ? expandYear(m[2]) : parseInt(m[2], 10);
    }
    if (month < 1 || month > 12) { month = null; }
    const key = year * 10000 + (month || 0) * 100 + (day || 0);
    let display = String(year);
    if (month) display = MONTH_NAMES[month - 1] + (day ? ' ' + day + ',' : '') + ' ' + year;
    return { key: key, display: (circa ? 'CIRCA ' : '') + display };
  }

  // 'YY (with optional stray trailing quote), possibly inside "Circe '95"
  m = s.match(/'(\d{2})/);
  if (m) {
    const year = expandYear(m[1]);
    return { key: year * 10000, display: (circa ? 'CIRCA ' : '') + year };
  }

  // any 4-digit year anywhere ("2022", "2024h", "Circa 2009")
  m = s.match(/(19|20)\d{2}/);
  if (m) {
    const year = parseInt(m[0], 10);
    return { key: year * 10000, display: (circa ? 'CIRCA ' : '') + year };
  }

  return none;
}

/**
 * Parse mixDuration into seconds. Shapes: "60:00" (minutes:seconds),
 * "2:58" (hours:minutes — small leading number reads as hours for these
 * long-form DJ sets), "60" (minutes), "0:00"/"" (unknown → 0).
 */
function parseDurationSec(raw) {
  if (!raw) return 0;
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,3}):(\d{2})$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    if (a === 0 && b === 0) return 0;
    if (a <= 10) return (a * 60 + b) * 60; // h:mm
    return a * 60 + b;                     // mm:ss
  }
  m = s.match(/^(\d{1,3})$/);
  if (m) return parseInt(m[1], 10) * 60;
  return 0;
}

function durationDisplay(sec) {
  if (!sec) return null;
  return Math.round(sec / 60) + ' MIN';
}

function durationClock(sec) {
  if (!sec) return '--:--';
  const h = Math.floor(sec / 3600);
  const mm = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return h > 0 ? h + ':' + pad(mm) + ':' + pad(ss) : mm + ':' + pad(ss);
}

const TXID_RE = /^[A-Za-z0-9_-]{43}$/;

// Skyline-thumbnail-pipeline source videos are never rendered as an <img> —
// guard the single image-tag emission point (imageHtml, below) so a video
// URL can never leak into a card/hero/artist-page <img src>.
const VIDEO_URL_RE = /\.(?:mp4|mov|m4v|webm|avi|mkv)(?:[?#].*)?$/i;

/**
 * A generated skyline thumbnail (mixImageMeta/artistImageMeta with
 * origin:'generated-skyline') is always a known-square asset — its own meta
 * carries the real width/height (contract §3.5). Only those get explicit
 * width/height attributes; uploaded/legacy images keep the current
 * no-dimensions behavior exactly as before.
 */
function generatedSquareDims(meta) {
  if (!meta || meta.origin !== 'generated-skyline') return null;
  const w = Number(meta.width);
  const h = Number(meta.height);
  if (!(w > 0) || !(h > 0) || w !== h) return null;
  return { width: w, height: h };
}

/**
 * Normalize an audio URL to the arweave.net gateway (mix playback must not
 * ride metered gateways — see MIX_AUDIO_SCRUBBING.md). Returns null when
 * the URL cannot serve audio (ArDrive viewer links, truncated tx ids, …).
 * Mixes not yet on Arweave live in Firebase Storage under DIRECT_AUDIO_PREFIX,
 * named by a 43-char content id; those pass through unchanged (the player
 * streams them directly — see DIRECT_PREFIX in website/js/player-core.js).
 */
const DIRECT_AUDIO_PREFIX = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/';

function normalizeAudioUrl(raw) {
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
  if (raw.indexOf(DIRECT_AUDIO_PREFIX) === 0) {
    return TXID_RE.test(raw.slice(DIRECT_AUDIO_PREFIX.length)) ? raw : null;
  }
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split('/').filter(Boolean);
  if (host === 'app.ardrive.io') return null; // viewer page, not a data tx
  const firstSeg = segs[0] || '';
  const isArweave = host === 'arweave.net' || host.endsWith('.arweave.net');
  if (isArweave) {
    return TXID_RE.test(firstSeg) ? raw : null;
  }
  // Other gateways (ardrive.net / ardrive.io sandboxes …): re-point the tx
  // at arweave.net so playback follows the supported gateway.
  if (TXID_RE.test(firstSeg)) return 'https://arweave.net/' + firstSeg;
  return null;
}

function slugifyFilename(artistName, artistFilename) {
  if (artistFilename && /\.html$/i.test(artistFilename)) return artistFilename;
  const base = String(artistFilename || artistName || 'artist')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
  return (base || 'artist') + '.html';
}

function titleCaseName(name) {
  // Hyphen is NOT a word boundary here: "BAI-EE" must render "Bai-ee",
  // never "Bai-Ee" (brand styling).
  return String(name || '').toLowerCase().replace(/(^|[\s_/])([a-z])/g, function (m, p, c) {
    return p + c.toUpperCase();
  });
}

function initialsFor(name) {
  const words = String(name || 'UE').trim().split(/\s+/);
  const init = words.slice(0, 2).map(function (w) { return w.charAt(0); }).join('');
  return init.toUpperCase() || 'UE';
}

function pad3(n) {
  return n < 10 ? '00' + n : n < 100 ? '0' + n : String(n);
}

/* ------------------------------------------- the handwritten artist mark ----
 * Every mix thumbnail and resident portrait wears the artist's name across its
 * centre in the script face (--font-script: Gately), sized so the name spans
 * the tile whatever its length — a short name is huge, a long one steps down.
 *
 * How the sizing works, and why it is split between here and the browser:
 *   - CSS does the scaling: each line carries its natural width in em as
 *     `--script-w`, and site.css sets `font-size: fit * 100cqi / --script-w`,
 *     so a line always spans the same fraction of the tile's width. No JS in
 *     the layout path, and it re-fits on resize for free.
 *   - The em values below are Gately's real advance widths, measured from the
 *     shipped woff2. Summing them ignores kerning, which on this face runs up
 *     to ~16% NARROW on capital-heavy names (STAR TRAXX is the worst case). An
 *     underestimate would size the text too large and the tile would clip it,
 *     so the estimate is padded by SCRIPT_W_SAFETY and deliberately underfills.
 *   - The inline refiner in partials/footer.html measures the real string once
 *     the font has loaded and writes the exact width back, so the final fit is
 *     exact — for these names and for any artist added later.
 * With no JS the padded estimate stands: a slightly narrower mark, never a
 * clipped one.
 */
const GATELY_ADV = {
  ' ': 0.219, '-': 0.335, '.': 0.188, "'": 0.153, '(': 0.187, ')': 0.174,
  '&': 0.534, '/': 0.218,
  '0': 0.378, '1': 0.243, '2': 0.470, '3': 0.533, '4': 0.438,
  '5': 0.494, '6': 0.520, '7': 0.380, '8': 0.629, '9': 0.492,
  A: 0.825, B: 0.762, C: 0.660, D: 0.714, E: 0.811, F: 0.492, G: 0.673,
  H: 0.989, I: 0.217, J: 0.492, K: 0.646, L: 0.442, M: 0.783, N: 0.598,
  O: 0.654, P: 0.581, Q: 0.753, R: 0.622, S: 0.648, T: 0.252, U: 0.578,
  V: 0.387, W: 0.941, X: 0.516, Y: 0.568, Z: 0.629,
  a: 0.362, b: 0.404, c: 0.420, d: 0.376, e: 0.406, f: 0.243, g: 0.689,
  h: 0.420, i: 0.348, j: 0.518, k: 0.452, l: 0.256, m: 0.490, n: 0.555,
  o: 0.336, p: 0.376, q: 0.494, r: 0.291, s: 0.270, t: 0.370, u: 0.411,
  v: 0.393, w: 0.692, x: 0.413, y: 0.442, z: 0.610
};
const SCRIPT_ADV_FALLBACK = 0.55;
const SCRIPT_W_SAFETY = 1.2;

function scriptWidthEm(str) {
  let w = 0;
  for (const ch of String(str)) {
    w += GATELY_ADV[ch] !== undefined ? GATELY_ADV[ch] : SCRIPT_ADV_FALLBACK;
  }
  return w;
}

/**
 * The mark is a signature, so it wears the stage name only: a parenthetical or
 * an "AKA …" tail is dropped ("BLUE JAY (AKA Josh Zeitler)" → "BLUE JAY",
 * "DJ RELEASE AKA IKE" → "DJ RELEASE"). The full name still appears in the
 * card body, the heading and the alt text — this trim is display-only, and
 * only for the artwork copy.
 */
function scriptDisplayName(name) {
  const trimmed = String(name || '')
    .replace(/\s*[([{].*$/, '')          // "(AKA …" and anything after it
    .replace(/\s+(AKA|A\.K\.A\.?)\b.*$/i, '')
    .trim();
  return trimmed || String(name || '').trim();
}

/**
 * Break a name into stacked lines. One word stays one line; two or three words
 * stack onto two ("TYREL WILLIAMS" reads as two big lines, not one small one);
 * four or more take three. The split minimises the WIDEST line, so the stack
 * comes out roughly rectangular and every line lands at a similar size.
 */
function splitScriptLines(name) {
  const words = scriptDisplayName(name).split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  const lineCount = words.length <= 3 ? 2 : 3;

  let best = null;
  const cuts = [];
  // brute-force every split point set — names are a handful of words, so this
  // is trivial to run and always finds the optimal (narrowest-widest) stack
  (function walk(start, remaining) {
    if (remaining === 1) {
      const parts = [];
      let prev = 0;
      cuts.forEach(function (c) { parts.push(words.slice(prev, c)); prev = c; });
      parts.push(words.slice(prev));
      const widest = Math.max.apply(null, parts.map(function (p) {
        return scriptWidthEm(p.join(' '));
      }));
      if (!best || widest < best.widest) best = { widest: widest, parts: parts };
      return;
    }
    for (let c = start + 1; c <= words.length - remaining + 1; c++) {
      cuts.push(c);
      walk(c, remaining - 1);
      cuts.pop();
    }
  })(0, lineCount);

  return best.parts.map(function (p) { return p.join(' '); });
}

/**
 * The mark itself. `aria-hidden` because the same name is already in the card
 * as a real link/heading — this copy is artwork, not content.
 */
function coverScriptHtml(name) {
  const lines = splitScriptLines(name);
  if (!lines.length) return '';
  // --script-lines lets the stylesheet divide the tile's clear height between
  // the stacked lines, so a two-line name never grows into the metadata
  return '\n    <div class="cover-script" style="--script-lines:' + lines.length +
    '" aria-hidden="true">' +
    lines.map(function (line) {
      const w = (scriptWidthEm(line) * SCRIPT_W_SAFETY).toFixed(2);
      return '<span class="cover-script-line" style="--script-w:' + w + '">' +
        escapeHtml(line) + '</span>';
    }).join('') +
    '</div>';
}

/* ------------------------------------------------------------ catalog */

/**
 * Build the flat mix catalog with stable numbering: sorted oldest → newest
 * (unknown dates first), ties broken by artist name then title then URL, so
 * appending new (dated) mixes never renumbers existing ones.
 */
/* The site shows ONLY generated skyline renders as mix thumbnails — every
 * page, every surface. Uploaded art (flyers, photos, a portrait reused as a
 * cover) stays in the data untouched but is never shown. In order:
 *   1. the mix's own cover, when it is a generated render;
 *   2. its renderImageFilename — the render made in place of an uploaded cover
 *      (skyline-thumbnails --render-uploaded);
 *   3. with no mix cover at all, the artist image, when THAT is generated;
 *   4. otherwise '' — imageHtml draws the empty .cover-fallback panel.
 * A cover regenerated later wins over an older render by rule 1.
 */
function isGeneratedRender(url, meta) {
  return !!(meta && meta.origin === 'generated-skyline' &&
    /^https?:\/\//i.test(url || '') && !VIDEO_URL_RE.test(url));
}

function shownMixImage(mix, artist) {
  if (isGeneratedRender(mix.mixImageFilename, mix.mixImageMeta)) {
    return { url: mix.mixImageFilename, meta: mix.mixImageMeta };
  }
  if (isGeneratedRender(mix.renderImageFilename, mix.renderImageMeta)) {
    return { url: mix.renderImageFilename, meta: mix.renderImageMeta };
  }
  if (!mix.mixImageFilename && isGeneratedRender(artist.artistImageFilename, artist.artistImageMeta)) {
    return { url: artist.artistImageFilename, meta: artist.artistImageMeta };
  }
  return { url: '', meta: null };
}

/* A mix's uploaded cover (flyer, photo) — the art shownMixImage hides. '' when
 * the mix has none, or when its cover is the generated render being shown. */
function originalArtFor(mix, shown) {
  const url = String(mix.mixImageFilename || '');
  if (!/^https?:\/\//i.test(url) || VIDEO_URL_RE.test(url) || url === shown.url) return '';
  return url;
}

/* Owner's copy for a few catalog rows (2026-10-28), keyed by artist page and
 * audio txid: the visible title and credit line only. Display only, like
 * homepageCredits: data-title/data-artist stay the real record (resume, share
 * links, promo lookup and download filenames key on them). Same copy as the
 * ACIDMAN promo video (hitloop-video FlowAcidmanPromo COPY). */
const ROW_DISPLAY = {
  // Bai-ee plays the first half, Acidman the second
  'acidman.html|nJUs8IQjI8muHPGrfSdoVSur1zX783LPgxC_6Ddm2WM': { title: 'Live @ Smartbar w/ BAI-EE', artist: 'ACIDMAN (2nd Half)' },
  'acidman.html|0DaFmrcGz7g0JpdUIsdzEssqF9bUMzfLiDIUKwsl1QI': { title: "Loft Livin' w/ BAI-EE", artist: 'ACIDMAN (2nd Half)' }
};

function buildCatalog(artists) {
  const entries = [];
  artists.forEach(function (artist) {
    const page = slugifyFilename(artist.artistName, artist.artistFilename);
    (artist.mixes || []).forEach(function (mix) {
      const date = parseMixDate(mix.mixDateYear);
      const durationSec = parseDurationSec(mix.mixDuration);
      const audioUrl = normalizeAudioUrl(mix.mixArweaveURL);
      const shown = shownMixImage(mix, artist);
      const display = ROW_DISPLAY[page + '|' + audioTxid(audioUrl)] || null;
      entries.push({
        artistName: artist.artistName || '',
        artistPage: page,
        // visible row text (ROW_DISPLAY); the record above is unchanged
        displayTitle: display ? display.title : (mix.mixTitle || 'Untitled Mix'),
        displayArtist: display ? display.artist : (artist.artistName || ''),
        artistGenre: (artist.artistGenre || 'other').toLowerCase(),
        title: mix.mixTitle || 'Untitled Mix',
        // Only generated renders are ever shown (see shownMixImage); uploaded
        // art resolves to '' and renders as the .cover-fallback panel.
        image: shown.url,
        imageMeta: shown.meta,
        // The mix's own custom artwork, when it has some: never a thumbnail,
        // only viewable from its row on the artist page (originalArtBtnHtml).
        originalArt: originalArtFor(mix, shown),
        rawUrl: mix.mixArweaveURL || '',
        audioUrl: audioUrl,
        // this mix's own 30s promo film, when one has been generated (see
        // promoVideoFor) — '' is the normal, expected absence
        video: promoVideoFor(artist.artistName, mix.mixTitle),
        playable: !!audioUrl,
        dateKey: date.key,
        dateDisplay: date.display,
        durationSec: durationSec,
        durationDisplay: durationDisplay(durationSec)
      });
    });
  });
  entries.sort(function (a, b) {
    if (a.dateKey !== b.dateKey) return a.dateKey - b.dateKey;
    const an = a.artistName.localeCompare(b.artistName);
    if (an !== 0) return an;
    const t = a.title.localeCompare(b.title);
    if (t !== 0) return t;
    return a.rawUrl.localeCompare(b.rawUrl);
  });
  entries.forEach(function (e, i) {
    e.number = pad3(i + 1);
  });
  return entries;
}

/* ------------------------------------------------------- html snippets */

const PLAY_ICONS = '<svg class="icon-svg icon-play"><use href="#i-play"></use></svg>' +
  '<svg class="icon-svg icon-pause"><use href="#i-pause"></use></svg>';

function imageHtml(url, alt, initials, eager, dims) {
  if (url && !VIDEO_URL_RE.test(url)) {
    const dimAttrs = dims ? ' width="' + dims.width + '" height="' + dims.height + '"' : '';
    return '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt || '') + '"' +
      dimAttrs +
      ' decoding="async"' +
      (eager ? ' loading="eager" fetchpriority="high"' : ' loading="lazy" fetchpriority="low"') +
      ' data-fallback-initial="' + escapeHtml(initials) + '">';
  }
  return '<img class="cover-fallback" src="img/square-ue.png" alt="">';
}

/** "<Artist> — <Mix title>" per contract §3.15; falls back to just the
 *  title when artist name is unavailable (defensive, not expected). */
function mixImageAlt(entry) {
  return entry.artistName ? (entry.artistName + ' — ' + entry.title) : entry.title;
}

/* `data-page` and `data-video` are read ONLY by the share modal (ue-links.js ->
   window.ueShare); player.js ignores unknown data-* exactly as before.
     data-page  — the mix's artist page. A share link points THERE rather than
                  at whatever page the listener happened to be on, so the
                  unfurled preview carries that artist's own artwork. The site
                  is static, so og: tags cannot vary by ?mix= query.
     data-video — the mix's promo film, when one exists (see promoVideoFor). */
function playAnchorAttrs(entry) {
  // data-number / data-date / data-genre are read by the about-this-mix
  // drawer (js/ue-drawer.js); player.js ignores them like any unknown data-*.
  return 'data-playlist data-title="' + escapeHtml(entry.title) + '"' +
    ' data-artist="' + escapeHtml(entry.artistName) + '"' +
    ' data-img="' + escapeHtml(entry.image) + '"' +
    ' data-duration-sec="' + entry.durationSec + '"' +
    ' data-number="' + escapeHtml(entry.number || '') + '"' +
    ' data-date="' + escapeHtml(entry.dateDisplay || '') + '"' +
    ' data-genre="' + escapeHtml(entry.artistGenre || '') + '"' +
    ' data-page="' + escapeHtml(entry.artistPage) + '"' +
    (entry.video ? ' data-video="' + escapeHtml(entry.video) + '"' : '') +
    (entry.playable ? '' : ' data-unplayable="true"') +
    ' href="' + escapeHtml(entry.audioUrl || entry.rawUrl || '#') + '"';
}

function downloadBtnHtml(entry, small) {
  if (!entry.playable) return '';
  return '<a class="download-btn' + (small ? ' download-btn--sm' : '') + '" data-download' +
    ' href="' + escapeHtml(entry.audioUrl) + '"' +
    ' data-filename="' + escapeHtml(entry.artistName + ' - ' + entry.title) + '"' +
    ' aria-label="Download ' + escapeHtml(entry.title) + '">' +
    '<svg class="icon-svg"><use href="#i-download"></use></svg></a>';
}

/* ⚠️ GENRE AND LENGTH ARE HIDDEN FOR NOW (owner decision 2026-10-05); the DATE
 * chip is back on every line item (owner decision 2026-10-17 — uncertain dates
 * read "CIRCA …", see parseMixDate). To bring genre/length back, un-comment the
 * two blocks below, the FEATURED_GENRE chip in templates/index.html, the genre
 * chip in templates/artist.html, FEATURED_DURATION_CHIP below, the meta lines in
 * player.js applyPick and in the homepage hero script's prePick, and
 * resident-genre in residentCardHtml. */
function metaChips(entry, withGenre) {
  let out = '';
  // if (withGenre) {
  //   out += '<span class="meta-chip">' + escapeHtml(entry.artistGenre.toUpperCase()) + '</span>';
  // }
  // if (entry.durationDisplay) {
  //   out += '<span class="meta-chip"><svg class="icon-svg"><use href="#i-clock"></use></svg> ' +
  //     escapeHtml(entry.durationDisplay) + '</span>';
  // }
  if (entry.dateDisplay) {
    out += '<span class="meta-chip"><svg class="icon-svg"><use href="#i-calendar"></use></svg> ' +
      escapeHtml(entry.dateDisplay) + '</span>';
  }
  return out;
}

/* A homepage selector tile — one per artist, in place of the old Latest Mixes.
 * Square, same overlay as the old mix card: the artist's name, their mix
 * count, and play/download for their newest mix (so a tile still drives the
 * hero and the player bar through the normal play anchor).
 *
 * The picture is the generated render of that newest mix — the site's
 * consistent mix image (shownMixImage), never the artist's photo — else the
 * .cover-fallback panel. The name links to the artist page.
 *
 * Homepage only — this function builds SELECTOR_TILES and nothing else.
 */
function selectorTileHtml(artist, entry, index) {
  const page = slugifyFilename(artist.artistName, artist.artistFilename);
  const count = (artist.mixes || []).length;
  const initials = initialsFor(artist.artistName);
  const image = entry && entry.image
    ? imageHtml(entry.image, artist.artistName, initials, false, generatedSquareDims(entry.imageMeta))
    : imageHtml('', '', initials, false, null);
  const playable = !!(entry && entry.playable);
  return '\n<article class="mix-card selector-tile' + (playable ? '' : ' is-unplayable') + '" data-selector-index="' + pad2(index + 1) + '">' +
    '\n  <div class="mix-card-cover">' +
    '\n    <span class="mix-card-number">' + pad2(index + 1) + '</span>' +
    (playable
      ? '\n    <a ' + playAnchorAttrs(entry) + ' aria-label="Play ' + escapeHtml(artist.artistName) + '’s newest mix">' + image + '</a>'
      : '\n    <a href="' + escapeHtml(page) + '" aria-label="' + escapeHtml(artist.artistName) + '">' + image + '</a>') +
    '\n  </div>' +
    '\n  <div class="mix-card-body">' +
    '\n    <h3 class="mix-card-title"><a href="' + escapeHtml(page) + '">' + escapeHtml(artist.artistName) + '</a></h3>' +
    '\n    <a class="mix-card-artist" href="' + escapeHtml(page) + '">' + count + (count === 1 ? ' mix' : ' mixes') + '</a>' +
    (playable
      ? '\n    <div class="mix-card-actions">' +
        '\n      <button class="play-circle play-circle--sm" type="button" aria-label="Play">' + PLAY_ICONS + '</button>' +
        '\n      ' + downloadBtnHtml(entry, true) +
        '\n    </div>'
      : '') +
    '\n  </div>' +
    '\n</article>';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* "View original artwork": the one place a mix's custom cover is shown. The
 * click opens it in the shared dialog (window.ueDialog, image slot) via the
 * artist template's inline script; a ?mix=<txid> share link opens it too.
 * Same look as the download button; a <button>, so the a[data-download]
 * handlers never see it. */
function originalArtBtnHtml(entry, small) {
  if (!entry.originalArt) return '';
  return '<button class="download-btn original-art-btn' + (small ? ' download-btn--sm' : '') + '" type="button"' +
    ' data-original-art="' + escapeHtml(entry.originalArt) + '"' +
    ' data-original-art-title="' + escapeHtml(entry.artistName + ' — ' + entry.title) + '"' +
    ' data-mix-txid="' + escapeHtml(audioTxid(entry.audioUrl)) + '"' +
    ' aria-label="View original artwork for ' + escapeHtml(entry.title) + '">' +
    '<svg class="icon-svg"><use href="#i-image"></use></svg></button>';
}

/* opts.originalArt: the artist page passes true to add originalArtBtnHtml.
 * opts.playFirst: the artist page passes true to lead the row with the play
 * button (its own first cell, `.catalog-row-lead`) instead of grouping it with
 * the other actions; an unplayable row keeps an empty lead cell so the columns
 * line up. The archive leaves both off. */
function catalogRowHtml(entry, opts) {
  const initials = initialsFor(entry.artistName);
  const artBtn = opts && opts.originalArt ? originalArtBtnHtml(entry, false) : '';
  const playFirst = !!(opts && opts.playFirst);
  const playBtn = '<button class="play-circle play-circle--sm" type="button" aria-label="Play">' + PLAY_ICONS + '</button>';
  return '\n<div class="catalog-row' + (entry.playable ? '' : ' is-unplayable') + (playFirst ? ' catalog-row--play-first' : '') + '" data-mix-number="' + entry.number + '">' +
    (playFirst ? '\n  <span class="catalog-row-lead">' + (entry.playable ? playBtn : '') + '</span>' : '') +
    '\n  <span class="catalog-row-number">' + entry.number + '</span>' +
    '\n  <a class="catalog-row-cover" ' + playAnchorAttrs(entry) + ' aria-label="Play ' + escapeHtml(entry.title) + '">' +
    imageHtml(entry.image, mixImageAlt(entry), initials, false, generatedSquareDims(entry.imageMeta)) + '</a>' +
    '\n  <div class="catalog-row-main">' +
    '\n    <h3 class="catalog-row-title"><a href="' + escapeHtml(entry.artistPage) + '">' + escapeHtml(entry.displayTitle) + '</a></h3>' +
    '\n    <a class="catalog-row-artist" href="' + escapeHtml(entry.artistPage) + '">' + escapeHtml(entry.displayArtist) + '</a>' +
    '\n    <div class="catalog-row-meta catalog-row-meta--inline">' + metaChips(entry, true) + '</div>' +
    '\n  </div>' +
    '\n  <div class="catalog-row-meta catalog-row-meta-cell">' + metaChips(entry, true) + '</div>' +
    (entry.playable
      ? '\n  <div class="catalog-row-actions">' +
        (playFirst ? '' : '\n    ' + playBtn) +
        (artBtn ? '\n    ' + artBtn : '') +
        '\n    ' + downloadBtnHtml(entry, false) +
        '\n  </div>'
      : (artBtn ? '\n  <div class="catalog-row-actions">' + artBtn + '</div>' : '') +
        '\n  <span class="unplayable-note">Offline</span>') +
    '\n</div>';
}

function residentCardHtml(artist, mixCount) {
  const page = slugifyFilename(artist.artistName, artist.artistFilename);
  const initials = initialsFor(artist.artistName);
  return '\n<a class="resident-card" href="' + escapeHtml(page) + '">' +
    '\n  <div class="resident-card-photo">' +
    imageHtml(artist.artistImageFilename, artist.artistName, initials, false, generatedSquareDims(artist.artistImageMeta)) +
    // handwritten name over the photo is off for now (owner 2026-10-05) — the
    // card's own name line below says it. To restore: coverScriptHtml(artist.artistName) +
    '</div>' +
    '\n  <div class="resident-card-body">' +
    '\n    <h3 class="resident-card-name">' + escapeHtml(artist.artistName) + '</h3>' +
    '\n    <div class="resident-card-sub">' +
    // genre hidden for now (see metaChips):
    // '<span class="resident-genre">' + escapeHtml((artist.artistGenre || 'other').toUpperCase()) + '</span>' +
    '<span>' + mixCount + (mixCount === 1 ? ' MIX' : ' MIXES') + '</span>' +
    '</div>' +
    '\n  </div>' +
    '\n</a>';
}

/* ------------------------------------------------------------ templating */

function loadPartials(partialsDir) {
  const partials = {};
  if (!fs.existsSync(partialsDir)) return partials;
  fs.readdirSync(partialsDir).forEach(function (f) {
    if (f.endsWith('.html')) {
      partials[f.replace(/\.html$/, '')] = fs.readFileSync(path.join(partialsDir, f), 'utf8');
    }
  });
  return partials;
}

function renderTemplate(template, partials, tokens) {
  // 1. inject partials ({{> name}})
  let html = template.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, function (m, name) {
    if (partials[name] === undefined) {
      throw new Error('Unknown partial: ' + name);
    }
    return partials[name];
  });
  // 2. replace tokens
  html = html.replace(/\{\{([A-Z0-9_]+)\}\}/g, function (m, key) {
    if (tokens[key] === undefined) {
      console.warn('[WebsitePageGenerator] ⚠️ Unfilled token ' + key + ' — replaced with empty string');
      return '';
    }
    return tokens[key];
  });
  // 3. safety: the Arweave manifest is flat — no parent-relative paths
  html = html.replace(/\.\.\//g, '');
  return html;
}

const FALLBACK_OG_IMAGE = 'https://qsuabitorscosrihu75wohtwfefwghlrqmyssgdfbr5lcydx3svq.arweave.net/hKgAom6MhOlFB6f7Zx52KQtjHXGDMSkYZQx6sWB33Ks';

/* og:video, emitted only for a page that actually has one canonical promo film
   (the homepage's featured mix, an artist's newest mix). It is what turns a
   pasted link into a playable card on Facebook and X instead of a flat image.
   Every generated promo is 720x720 h264/aac — see scripts/build-hero-promo-catalog.mjs.
   Absent video -> '' -> no tags at all, never an empty og:video. */
const PROMO_VIDEO_DIM = 720;

function ogVideoTags(url) {
  if (!url || !/^https:\/\//i.test(url)) return '';
  const safe = escapeHtml(url);
  return '\n<meta property="og:video" content="' + safe + '">' +
    '\n<meta property="og:video:secure_url" content="' + safe + '">' +
    '\n<meta property="og:video:type" content="video/mp4">' +
    '\n<meta property="og:video:width" content="' + PROMO_VIDEO_DIM + '">' +
    '\n<meta property="og:video:height" content="' + PROMO_VIDEO_DIM + '">' +
    '\n<meta name="twitter:player:stream" content="' + safe + '">' +
    '\n<meta name="twitter:player:stream:content_type" content="video/mp4">';
}

/* The permaweb address of this site, for the share modal's PERMAWEB link.
 *
 * It is the ArNS name, NOT a manifest transaction id, and that is deliberate:
 * the manifest id of the deploy being generated cannot exist yet (its bytes
 * include these pages), and an OLD manifest id would hand a sharer a frozen
 * snapshot of the archive missing every mix added since. The ArNS name is the
 * one address that is both permanent and always current — lib/ArNSUpdater.js
 * re-points it at the new manifest on every deploy, under the same env var.
 *
 * Trailing slash guaranteed: the modal appends a page filename to it.
 */
function permawebBase() {
  const name = String(process.env.ARNS_NAME || 'undergroundexistence').trim().replace(/^\/+|\/+$/g, '');
  return 'https://' + (name || 'undergroundexistence') + '.ar.io/';
}

/* Per-artist portrait and page, keyed by folded artist name, for the homepage
 * hero. Two jobs:
 *   1. the source thumbs — the hero can show the promo film, the mix's cover,
 *      or the ARTIST, and the portrait has to come from somewhere;
 *   2. re-stamping the featured anchor after player.js re-rolls the featured
 *      mix. `randomizeFeatured()` rewrites that anchor's data-title/-artist/
 *      -img/-duration-sec (player.js ~L1160) and knows nothing about the
 *      data-page/data-video this generator adds, so those two would otherwise
 *      still describe the BUILD-TIME mix — and the share modal reads them.
 * The `ue-featured-changed` detail carries only {title, artist, image}, so
 * rather than widen that event's contract the page ships the whole map.
 *
 * Keys are folded exactly like promoKey's halves so a lookup never depends on
 * casing. Video URLs are excluded from `img` for the same reason imageHtml
 * excludes them: a .mp4 must never end up in an <img src>.
 */
function heroArtistMeta(artists) {
  const out = {};
  (artists || []).forEach(function (a) {
    const name = String(a && a.artistName || '').trim().replace(/\s+/g, ' ').toLowerCase();
    if (!name || out[name] !== undefined) return;
    const url = String(a && a.artistImageFilename || '');
    // the VIVA ACID host image is never shown in the hero (owner 2026-10-05):
    // its mixes fall back to the generated cover
    const noPortrait = name === VIVA_ACID_HOST;
    out[name] = {
      img: (!noPortrait && /^https?:\/\//i.test(url) && !VIDEO_URL_RE.test(url)) ? url : '',
      page: slugifyFilename(a.artistName, a.artistFilename)
    };
  });
  return out;
}

/* Homepage credits for "Live @ Viva Acid" mixes. Every one of them is titled
 * "Live @ Viva Acid '24", and the VIVA ACID mirror records all carry the same
 * artist too, so on the homepage four tiles read identically. Here the DJs
 * who played the set become the title and the event title drops into the
 * small line under it.
 *
 * The DJs are not typed anywhere: a VIVA ACID mirror shares its audio txid
 * with the DJs' own records, so the credit is every non-VIVA-ACID artist on
 * that txid (catalog order, which puts "ANDREW EMIL" before "RED EYE"). Keyed
 * by txid because artist|title cannot tell the mirrors apart. A set with no
 * DJ record of its own gets no credit and renders as before.
 *
 * Display only: data-title/data-artist on every anchor stay the real record,
 * because resume, share links, promo lookup and download filenames all key on
 * them. The map ships on every page's player bar (data-mix-credits, via
 * commonTokens) so the player bar, the runtime hero text in player.js and the
 * hero plate all read the same way as the homepage tiles.
 */
const VIVA_ACID_LIVE_RE = /^live\s*@\s*viva\s*acid\b/i;
const VIVA_ACID_HOST = 'viva acid';
const AUDIO_TXID_RE = /\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/;

function audioTxid(url) {
  const m = AUDIO_TXID_RE.exec(String(url || ''));
  return m ? m[1] : '';
}

function homepageCredits(catalog) {
  const artistsByTxid = {};
  catalog.forEach(function (e) {
    const tx = audioTxid(e.audioUrl);
    if (!tx) return;
    const list = artistsByTxid[tx] || (artistsByTxid[tx] = []);
    if (list.indexOf(e.artistName) === -1) list.push(e.artistName);
  });
  const out = {};
  catalog.forEach(function (e) {
    const tx = audioTxid(e.audioUrl);
    if (!tx || out[tx] || !VIVA_ACID_LIVE_RE.test(e.title)) return;
    const djs = artistsByTxid[tx].filter(function (n) {
      return String(n).trim().toLowerCase() !== VIVA_ACID_HOST;
    });
    if (djs.length) out[tx] = { title: djs.join(' B2B '), sub: e.title };
  });
  return out;
}

function creditFor(credits, entry) {
  return credits[audioTxid(entry.audioUrl)] || null;
}

/* The homepage hero's random pick, made BEFORE first paint by the inline hero
 * script (so the page never shows the built-in featured mix and then swaps).
 * One compact row per playable mix that has a cover: the anchor data the
 * player keys on (t/a/u/i/d/p/v) plus the two visible lines already resolved
 * (l1/l2, artist-first with homepageCredits). player.js adopts this pick
 * instead of rolling its own. */
function heroPicks(catalog, credits) {
  return catalog.filter(function (e) {
    return e.playable && /^https?:\/\//i.test(e.image);
  }).map(function (e) {
    const credit = creditFor(credits, e);
    return {
      t: e.title, a: e.artistName, u: e.audioUrl, i: e.image,
      d: e.durationSec || 0, p: e.artistPage, v: e.video || '',
      l1: credit ? credit.title : e.artistName,
      l2: credit ? credit.sub : e.title
    };
  });
}

/* Tokens every page gets, regardless of which one it is. */
function commonTokens(active, credits) {
  return {
    PERMAWEB_BASE: escapeHtml(permawebBase()),
    // homepageCredits map, on the player bar every page carries (data-mix-credits)
    MIX_CREDITS: escapeHtml(JSON.stringify(credits || {})),
    NAV_ACTIVE_MIXES: active === 'mixes' ? ' is-active' : '',
    NAV_ACTIVE_RESIDENTS: active === 'residents' ? ' is-active' : '',
    NAV_ACTIVE_ARCHIVE: active === 'archive' ? ' is-active' : '',
    NAV_ACTIVE_ABOUT: active === 'about' ? ' is-active' : ''
  };
}

/* ------------------------------------------------------------- generate */

function generatePages(artistsJsonPath, outputDir) {
  try {
    const baseDir = path.join(__dirname, '..', 'website');
    const artistsJson = artistsJsonPath || path.join(baseDir, 'artists.json');
    let output = outputDir || baseDir;

    // Vercel production without an explicit output dir → /tmp/website
    const isVercelProduction = process.env.VERCEL === '1' || process.cwd() === '/var/task';
    if (!outputDir && isVercelProduction) {
      output = '/tmp/website';
      fs.mkdirSync(output, { recursive: true });
    }

    // Templates travel with the working copy (deploy copies website/ →
    // /tmp/website including templates/); fall back to the repo copy.
    let templatesDir = path.join(output, 'templates');
    if (!fs.existsSync(path.join(templatesDir, 'index.html'))) {
      templatesDir = path.join(baseDir, 'templates');
    }
    if (!fs.existsSync(artistsJson)) {
      throw new Error('artists.json not found: ' + artistsJson);
    }
    if (!fs.existsSync(path.join(templatesDir, 'index.html'))) {
      throw new Error('Templates not found in: ' + templatesDir);
    }

    const artists = JSON.parse(fs.readFileSync(artistsJson, 'utf8'));
    const partials = loadPartials(path.join(templatesDir, 'partials'));
    const readTemplate = function (name) {
      return fs.readFileSync(path.join(templatesDir, name), 'utf8');
    };

    const catalog = buildCatalog(artists);
    const newestFirst = catalog.slice().reverse();
    // Featured = newest playable mix with artwork (hero needs a visual);
    // fall back to newest playable, then newest.
    const featured = newestFirst.find(function (e) { return e.playable && /^https?:\/\//i.test(e.image); })
      || newestFirst.find(function (e) { return e.playable; })
      || newestFirst[0];
    if (!featured) throw new Error('No mixes found in artists.json — refusing to generate an empty site');

    const mixTotal = String(catalog.length);
    const artistTotal = String(artists.length);
    let pagesGenerated = 0;
    const writePage = function (filename, html) {
      fs.writeFileSync(path.join(output, filename), html, 'utf8');
      pagesGenerated++;
      console.log('[WebsitePageGenerator] Generated: ' + filename);
    };

    const credits = homepageCredits(catalog);

    /* ---- index.html ---- */
    const featuredCredit = creditFor(credits, featured);
    // Every selector (artists.json order, as on the Selectors page), each
    // tile carrying its newest playable mix (newest catalog entry, else newest).
    const selectorTiles = artists.map(function (artist, i) {
      const own = newestFirst.filter(function (e) { return e.artistName === (artist.artistName || ''); });
      const entry = own.find(function (e) { return e.playable; }) || own[0] || null;
      return selectorTileHtml(artist, entry, i);
    }).join('\n');

    // genre and date are hidden for now (see metaChips), so duration leads the
    // row with no separator dot before it
    // const featuredDurationChip = featured.durationDisplay
    //   ? '<span class="meta-chip"><svg class="icon-svg"><use href="#i-clock"></use></svg> ' + escapeHtml(featured.durationDisplay) + '</span>'
    //   : '';
    // const featuredDateChip = featured.dateDisplay
    //   ? '<span class="meta-dot">&middot;</span><span class="meta-chip"><svg class="icon-svg"><use href="#i-calendar"></use></svg> ' + escapeHtml(featured.dateDisplay) + '</span>'
    //   : '';

    writePage('index.html', renderTemplate(readTemplate('index.html'), partials, Object.assign({
      PAGE_TITLE: 'Underground Existence — Mixtapes From Chicago',
      PAGE_DESC: 'Chicago house & techno mixtapes, archived in permanence on Arweave. ' + mixTotal + ' mixes from ' + artistTotal + ' residents.',
      PAGE_PATH: '',
      OG_IMAGE: /^https?:\/\//i.test(featured.image) ? escapeHtml(featured.image) : FALLBACK_OG_IMAGE,
      OG_VIDEO_TAGS: ogVideoTags(featured.video),
      /* Still first (it is the video's poster and the no-JS/no-autoplay
         fallback), then the promo clip list for the inline hero script, then
         the empty <img> the mix artwork swaps into. The still IS the featured
         mix's generated cover, so the stage only ever shows the consistent mix
         image — the record-bin photo is just the fallback for a mix with none. */
      FEATURED_IMAGE: (/^https?:\/\//i.test(featured.image)
        ? '<img id="hero-still" src="' + escapeHtml(featured.image) + '" alt="" loading="eager" fetchpriority="high" decoding="async">'
        : '<picture><source srcset="img/digging-hero.webp" type="image/webp"><img id="hero-still" src="img/digging-hero.jpg" alt="" loading="eager" fetchpriority="high" decoding="async"></picture>') +
        '<video id="hero-promo-video" muted loop playsinline preload="none" poster="' +
        (/^https?:\/\//i.test(featured.image) ? escapeHtml(featured.image) : 'img/digging-hero.jpg') + '" aria-hidden="true"></video>' +
        '<img id="hero-mix-art" alt="" decoding="async" hidden>' +
        /* The same handwritten mark the cards wear. Empty at build time and
           drawn at runtime by the hero script (window.ueScriptMark) for
           whichever mix is showing, because the hero's mix changes on every
           load and on every click in the selector tiles. */
        '<div id="hero-art-mark" class="cover-script" aria-hidden="true"></div>' +
        /* The branded plate the hero wears once a mix is playing: the wordmark
           at the top and the mix's own details at the bottom, laid over its
           skyline frame — the same furniture the generated promo films carry
           burnt in, so the two states read as one piece. */
        '<div id="hero-mix-plate" aria-hidden="true">' +
        '<img id="hero-plate-logo" src="img/ue-white-horiz.png" alt="">' +
        '<div id="hero-plate-meta"><p id="hero-plate-title"><a href=""></a></p><p id="hero-plate-artist"></p></div>' +
        '</div>' +
        '<div id="hero-media-controls">' +
        '<button id="hero-mute-toggle" type="button" aria-label="Unmute promo video" aria-pressed="false">' +
        '<svg class="icon-svg icon-muted"><use href="#i-volume-off"></use></svg>' +
        '<svg class="icon-svg icon-unmuted"><use href="#i-volume"></use></svg></button>' +
        // refresh: a different random mix (player.js rerollFeatured, wired by the hero script)
        '<button id="hero-refresh-mix" type="button" aria-label="Play a different mix" title="Play a different mix">' +
        '<svg class="icon-svg" aria-hidden="true"><use href="#i-shuffle"></use></svg></button>' +
        '<button id="hero-share" type="button" aria-label="Share this mix">' +
        '<svg class="icon-svg"><use href="#i-share"></use></svg></button>' +
        '</div>',
      HERO_PROMO_CLIPS: escapeHtml(JSON.stringify(heroPromoClips())),
      HERO_ARTIST_IMAGES: escapeHtml(JSON.stringify(heroArtistMeta(artists))),
      HERO_PICKS: escapeHtml(JSON.stringify(heroPicks(catalog, credits))),
      // Artist first, same order as the selector tiles.
      FEATURED_TITLE: escapeHtml(featuredCredit ? featuredCredit.title : featured.artistName),
      FEATURED_TITLE_ATTR: escapeHtml(featured.title),
      FEATURED_ARTIST: escapeHtml(featuredCredit ? featuredCredit.sub : featured.title),
      FEATURED_ARTIST_ATTR: escapeHtml(featured.artistName),
      FEATURED_ARTIST_PAGE: escapeHtml(featured.artistPage),
      FEATURED_GENRE: escapeHtml(featured.artistGenre.toUpperCase()),
      FEATURED_DURATION_CHIP: '', // hidden for now (see metaChips); was featuredDurationChip
      FEATURED_DATE_CHIP: '', // hidden for now (see metaChips); was featuredDateChip
      FEATURED_IMG_URL: escapeHtml(featured.image),
      FEATURED_VIDEO_URL: escapeHtml(featured.video || ''),
      FEATURED_AUDIO_URL: escapeHtml(featured.audioUrl || featured.rawUrl || '#'),
      FEATURED_DURATION_SEC: String(featured.durationSec),
      FEATURED_DATE: escapeHtml(featured.dateDisplay || ''),
      FEATURED_GENRE_ATTR: escapeHtml(featured.artistGenre || ''),
      FEATURED_DURATION_DISPLAY: durationClock(featured.durationSec),
      SELECTOR_TILES: selectorTiles,
      RECEIPT_NUMBER: featured.number,
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, commonTokens('mixes', credits))));

    /* ---- residents.html ---- */
    writePage('residents.html', renderTemplate(readTemplate('residents.html'), partials, Object.assign({
      PAGE_TITLE: 'DJs — Underground Existence',
      PAGE_DESC: 'The selectors of Underground Existence — ' + artistTotal + ' Chicago house & techno residents.',
      PAGE_PATH: 'residents.html',
      OG_IMAGE: FALLBACK_OG_IMAGE,
      OG_VIDEO_TAGS: '',
      RESIDENT_CARDS: artists.map(function (a) {
        return residentCardHtml(a, (a.mixes || []).length);
      }).join('\n'),
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, commonTokens('residents', credits))));

    /* ---- archive.html ---- */
    writePage('archive.html', renderTemplate(readTemplate('archive.html'), partials, Object.assign({
      PAGE_TITLE: 'Mixes — Underground Existence',
      PAGE_DESC: 'The full Underground Existence catalog — ' + mixTotal + ' Chicago house & techno mixes on the permaweb.',
      PAGE_PATH: 'archive.html',
      OG_IMAGE: FALLBACK_OG_IMAGE,
      OG_VIDEO_TAGS: '',
      ARCHIVE_ROWS: newestFirst.map(function (e) { return catalogRowHtml(e); }).join('\n'),
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, commonTokens('archive', credits))));

    /* ---- about.html ---- */
    writePage('about.html', renderTemplate(readTemplate('about.html'), partials, Object.assign({
      PAGE_TITLE: 'About — Underground Existence',
      PAGE_DESC: 'Underground Existence: Chicago house & techno mixtapes, hosted permanently on Arweave. Est. 2007.',
      PAGE_PATH: 'about.html',
      OG_IMAGE: FALLBACK_OG_IMAGE,
      OG_VIDEO_TAGS: '',
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, commonTokens('about', credits))));

    /* ---- per-artist pages ---- */
    const artistTemplate = readTemplate('artist.html');
    artists.forEach(function (artist) {
      const page = slugifyFilename(artist.artistName, artist.artistFilename);
      const entries = newestFirst.filter(function (e) { return e.artistPage === page && e.artistName === artist.artistName; });
      const mixCount = entries.length;
      writePage(page, renderTemplate(artistTemplate, partials, Object.assign({
        PAGE_TITLE: (artist.artistName || 'Selector') + ' — Underground Existence',
        PAGE_DESC: (artist.artistName || 'Selector') + ' on Underground Existence — ' + mixCount + (mixCount === 1 ? ' mix' : ' mixes') + ', archived on Arweave.',
        PAGE_PATH: page,
        OG_IMAGE: /^https?:\/\//i.test(artist.artistImageFilename || '') ? escapeHtml(artist.artistImageFilename) : FALLBACK_OG_IMAGE,
        /* Artist pages unfurl as the selector's photo, never a promo film
           (owner decision 2026-10-17); og:video stays on the homepage only. */
        OG_VIDEO_TAGS: '',
        ARTIST_IMAGE: imageHtml(artist.artistImageFilename, artist.artistName, initialsFor(artist.artistName), true, generatedSquareDims(artist.artistImageMeta)),
        ARTIST_NAME: escapeHtml(artist.artistName),
        ARTIST_SIGNATURE: escapeHtml(titleCaseName(artist.artistName)),
        ARTIST_GENRE: escapeHtml((artist.artistGenre || 'other').toUpperCase()),
        MIX_COUNT: String(mixCount),
        MIX_COUNT_LABEL: mixCount === 1 ? 'MIX' : 'MIXES',
        ARTIST_MIX_ROWS: entries.map(function (e) { return catalogRowHtml(e, { originalArt: true, playFirst: true }); }).join('\n'),
        MIX_TOTAL: mixTotal,
        ARTIST_TOTAL: artistTotal
      }, commonTokens('residents', credits))));
    });

    console.log('[WebsitePageGenerator] ✅ Generated ' + pagesGenerated + ' pages (' +
      artistTotal + ' artists, ' + mixTotal + ' mixes, featured #' + featured.number + ')');

    return {
      success: true,
      artistPagesGenerated: artists.length,
      pagesGenerated: pagesGenerated,
      indexHtmlUpdated: true,
      mixTotal: catalog.length,
      featuredNumber: featured.number
    };
  } catch (error) {
    console.error('[WebsitePageGenerator] ❌ Error generating pages:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  generatePages,
  buildCatalog,
  parseMixDate,
  parseDurationSec,
  normalizeAudioUrl,
  slugifyFilename,
  escapeHtml,
  homepageCredits,
  // the handwritten artist mark (tested by tests/cover-script-mark.test.mjs)
  scriptDisplayName,
  splitScriptLines,
  scriptWidthEm,
  coverScriptHtml
};

// Run as CLI if called directly: node lib/WebsitePageGenerator.cjs
if (require.main === module) {
  const result = generatePages();
  if (!result.success) {
    process.exit(1);
  }
}
