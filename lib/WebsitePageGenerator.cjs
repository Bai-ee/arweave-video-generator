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

  // m/d/yy or m/yy  (e.g. 7/18/25, 6/24)
  let m = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
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
    return { key: key, display: display };
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
 */
function normalizeAudioUrl(raw) {
  if (!raw || !/^https?:\/\//i.test(raw)) return null;
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

/* ------------------------------------------------------------ catalog */

/**
 * Build the flat mix catalog with stable numbering: sorted oldest → newest
 * (unknown dates first), ties broken by artist name then title then URL, so
 * appending new (dated) mixes never renumbers existing ones.
 */
function buildCatalog(artists) {
  const entries = [];
  artists.forEach(function (artist) {
    const page = slugifyFilename(artist.artistName, artist.artistFilename);
    (artist.mixes || []).forEach(function (mix) {
      const date = parseMixDate(mix.mixDateYear);
      const durationSec = parseDurationSec(mix.mixDuration);
      const audioUrl = normalizeAudioUrl(mix.mixArweaveURL);
      entries.push({
        artistName: artist.artistName || '',
        artistPage: page,
        artistGenre: (artist.artistGenre || 'other').toLowerCase(),
        title: mix.mixTitle || 'Untitled Mix',
        image: mix.mixImageFilename || artist.artistImageFilename || '',
        // Meta follows the exact same precedence as `image` above: whichever
        // field actually supplied the URL is the one whose meta applies.
        imageMeta: mix.mixImageFilename
          ? (mix.mixImageMeta || null)
          : (artist.artistImageFilename ? (artist.artistImageMeta || null) : null),
        rawUrl: mix.mixArweaveURL || '',
        audioUrl: audioUrl,
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

function playAnchorAttrs(entry) {
  return 'data-playlist data-title="' + escapeHtml(entry.title) + '"' +
    ' data-artist="' + escapeHtml(entry.artistName) + '"' +
    ' data-img="' + escapeHtml(entry.image) + '"' +
    ' data-duration-sec="' + entry.durationSec + '"' +
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

function metaChips(entry, withGenre) {
  let out = '';
  if (withGenre) {
    out += '<span class="meta-chip">' + escapeHtml(entry.artistGenre.toUpperCase()) + '</span>';
  }
  if (entry.durationDisplay) {
    out += '<span class="meta-chip"><svg class="icon-svg"><use href="#i-clock"></use></svg> ' +
      escapeHtml(entry.durationDisplay) + '</span>';
  }
  if (entry.dateDisplay) {
    out += '<span class="meta-chip"><svg class="icon-svg"><use href="#i-calendar"></use></svg> ' +
      escapeHtml(entry.dateDisplay) + '</span>';
  }
  return out;
}

function mixCardHtml(entry) {
  const initials = initialsFor(entry.artistName);
  return '\n<article class="mix-card' + (entry.playable ? '' : ' is-unplayable') + '" data-mix-number="' + entry.number + '">' +
    '\n  <div class="mix-card-cover">' +
    '\n    <span class="mix-card-number">' + entry.number + '</span>' +
    '\n    <a ' + playAnchorAttrs(entry) + ' aria-label="Play ' + escapeHtml(entry.title) + '">' +
    imageHtml(entry.image, mixImageAlt(entry), initials, false, generatedSquareDims(entry.imageMeta)) + '</a>' +
    '\n  </div>' +
    '\n  <div class="mix-card-body">' +
    '\n    <div class="mix-card-title-row">' +
    '\n      <div>' +
    '\n        <h3 class="mix-card-title"><a href="' + escapeHtml(entry.artistPage) + '">' + escapeHtml(entry.title) + '</a></h3>' +
    '\n        <a class="mix-card-artist" href="' + escapeHtml(entry.artistPage) + '">' + escapeHtml(entry.artistName) + '</a>' +
    '\n      </div>' +
    (entry.playable
      ? '\n      <div class="mix-card-actions">' +
        '\n        <button class="play-circle play-circle--sm" type="button" aria-label="Play">' + PLAY_ICONS + '</button>' +
        '\n        ' + downloadBtnHtml(entry, true) +
        '\n      </div>'
      : '\n      <span class="unplayable-note">Offline</span>') +
    '\n    </div>' +
    '\n    <div class="mix-card-genres">' + escapeHtml(entry.artistGenre.toUpperCase()) + '</div>' +
    '\n    <div class="mix-card-meta">' + metaChips(entry, false) + '</div>' +
    '\n  </div>' +
    '\n</article>';
}

function catalogRowHtml(entry) {
  const initials = initialsFor(entry.artistName);
  return '\n<div class="catalog-row' + (entry.playable ? '' : ' is-unplayable') + '" data-mix-number="' + entry.number + '">' +
    '\n  <span class="catalog-row-number">' + entry.number + '</span>' +
    '\n  <a class="catalog-row-cover" ' + playAnchorAttrs(entry) + ' aria-label="Play ' + escapeHtml(entry.title) + '">' +
    imageHtml(entry.image, mixImageAlt(entry), initials, false, generatedSquareDims(entry.imageMeta)) + '</a>' +
    '\n  <div class="catalog-row-main">' +
    '\n    <h3 class="catalog-row-title"><a href="' + escapeHtml(entry.artistPage) + '">' + escapeHtml(entry.title) + '</a></h3>' +
    '\n    <a class="catalog-row-artist" href="' + escapeHtml(entry.artistPage) + '">' + escapeHtml(entry.artistName) + '</a>' +
    '\n    <div class="catalog-row-meta catalog-row-meta--inline">' + metaChips(entry, true) + '</div>' +
    '\n  </div>' +
    '\n  <div class="catalog-row-meta catalog-row-meta-cell">' + metaChips(entry, true) + '</div>' +
    (entry.playable
      ? '\n  <div class="catalog-row-actions">' +
        '\n    <button class="play-circle play-circle--sm" type="button" aria-label="Play">' + PLAY_ICONS + '</button>' +
        '\n    ' + downloadBtnHtml(entry, false) +
        '\n  </div>'
      : '\n  <span class="unplayable-note">Offline</span>') +
    '\n</div>';
}

function residentCardHtml(artist, mixCount) {
  const page = slugifyFilename(artist.artistName, artist.artistFilename);
  const initials = initialsFor(artist.artistName);
  return '\n<a class="resident-card" href="' + escapeHtml(page) + '">' +
    '\n  <div class="resident-card-photo">' +
    imageHtml(artist.artistImageFilename, artist.artistName, initials, false, generatedSquareDims(artist.artistImageMeta)) + '</div>' +
    '\n  <div class="resident-card-body">' +
    '\n    <h3 class="resident-card-name">' + escapeHtml(artist.artistName) + '</h3>' +
    '\n    <div class="resident-card-sub">' +
    '<span class="resident-genre">' + escapeHtml((artist.artistGenre || 'other').toUpperCase()) + '</span>' +
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

function navTokens(active) {
  return {
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

    /* ---- index.html ---- */
    const latestCards = newestFirst
      .filter(function (e) { return e !== featured; })
      .slice(0, 6)
      .map(mixCardHtml)
      .join('\n');

    const featuredDurationChip = featured.durationDisplay
      ? '<span class="meta-dot">&middot;</span><span class="meta-chip"><svg class="icon-svg"><use href="#i-clock"></use></svg> ' + escapeHtml(featured.durationDisplay) + '</span>'
      : '';
    const featuredDateChip = featured.dateDisplay
      ? '<span class="meta-dot">&middot;</span><span class="meta-chip"><svg class="icon-svg"><use href="#i-calendar"></use></svg> ' + escapeHtml(featured.dateDisplay) + '</span>'
      : '';

    writePage('index.html', renderTemplate(readTemplate('index.html'), partials, Object.assign({
      PAGE_TITLE: 'Underground Existence — Mixtapes From Chicago',
      PAGE_DESC: 'Chicago house & techno mixtapes, archived in permanence on Arweave. ' + mixTotal + ' mixes from ' + artistTotal + ' residents.',
      PAGE_PATH: '',
      OG_IMAGE: /^https?:\/\//i.test(featured.image) ? escapeHtml(featured.image) : FALLBACK_OG_IMAGE,
      FEATURED_IMAGE: '<picture><source srcset="img/digging-hero.webp" type="image/webp"><img src="img/digging-hero.jpg" alt="" loading="eager" fetchpriority="high" decoding="async"></picture>',
      FEATURED_TITLE: escapeHtml(featured.title),
      FEATURED_TITLE_ATTR: escapeHtml(featured.title),
      FEATURED_ARTIST: escapeHtml(titleCaseName(featured.artistName)),
      FEATURED_ARTIST_ATTR: escapeHtml(featured.artistName),
      FEATURED_ARTIST_PAGE: escapeHtml(featured.artistPage),
      FEATURED_GENRE: escapeHtml(featured.artistGenre.toUpperCase()),
      FEATURED_DURATION_CHIP: featuredDurationChip,
      FEATURED_DATE_CHIP: featuredDateChip,
      FEATURED_IMG_URL: escapeHtml(featured.image),
      FEATURED_AUDIO_URL: escapeHtml(featured.audioUrl || featured.rawUrl || '#'),
      FEATURED_DURATION_SEC: String(featured.durationSec),
      FEATURED_DURATION_DISPLAY: durationClock(featured.durationSec),
      LATEST_MIX_CARDS: latestCards,
      RECEIPT_NUMBER: featured.number,
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, navTokens('mixes'))));

    /* ---- residents.html ---- */
    writePage('residents.html', renderTemplate(readTemplate('residents.html'), partials, Object.assign({
      PAGE_TITLE: 'Selectors — Underground Existence',
      PAGE_DESC: 'The selectors of Underground Existence — ' + artistTotal + ' Chicago house & techno residents.',
      PAGE_PATH: 'residents.html',
      OG_IMAGE: FALLBACK_OG_IMAGE,
      RESIDENT_CARDS: artists.map(function (a) {
        return residentCardHtml(a, (a.mixes || []).length);
      }).join('\n'),
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, navTokens('residents'))));

    /* ---- archive.html ---- */
    writePage('archive.html', renderTemplate(readTemplate('archive.html'), partials, Object.assign({
      PAGE_TITLE: 'Archive — Underground Existence',
      PAGE_DESC: 'The full Underground Existence catalog — ' + mixTotal + ' Chicago house & techno mixes on the permaweb.',
      PAGE_PATH: 'archive.html',
      OG_IMAGE: FALLBACK_OG_IMAGE,
      ARCHIVE_ROWS: newestFirst.map(catalogRowHtml).join('\n'),
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, navTokens('archive'))));

    /* ---- about.html ---- */
    writePage('about.html', renderTemplate(readTemplate('about.html'), partials, Object.assign({
      PAGE_TITLE: 'About — Underground Existence',
      PAGE_DESC: 'Underground Existence: Chicago house & techno mixtapes, hosted permanently on Arweave. Est. 2007.',
      PAGE_PATH: 'about.html',
      OG_IMAGE: FALLBACK_OG_IMAGE,
      MIX_TOTAL: mixTotal,
      ARTIST_TOTAL: artistTotal
    }, navTokens('about'))));

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
        ARTIST_IMAGE: imageHtml(artist.artistImageFilename, artist.artistName, initialsFor(artist.artistName), true, generatedSquareDims(artist.artistImageMeta)),
        ARTIST_NAME: escapeHtml(artist.artistName),
        ARTIST_SIGNATURE: escapeHtml(titleCaseName(artist.artistName)),
        ARTIST_GENRE: escapeHtml((artist.artistGenre || 'other').toUpperCase()),
        MIX_COUNT: String(mixCount),
        MIX_COUNT_LABEL: mixCount === 1 ? 'MIX' : 'MIXES',
        ARTIST_MIX_ROWS: entries.map(catalogRowHtml).join('\n'),
        MIX_TOTAL: mixTotal,
        ARTIST_TOTAL: artistTotal
      }, navTokens('residents'))));
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
  escapeHtml
};

// Run as CLI if called directly: node lib/WebsitePageGenerator.cjs
if (require.main === module) {
  const result = generatePages();
  if (!result.success) {
    process.exit(1);
  }
}
