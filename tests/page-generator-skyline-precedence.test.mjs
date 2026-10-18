// Workstream D — lib/WebsitePageGenerator.cjs skyline-thumbnail rendering.
// Contract: SKYLINE_THUMBNAIL_CONTRACT.md §3.15.
//
// Renders real pages (index/archive/residents/artist) into a temp dir from
// a fixture artists.json and asserts:
//   - precedence: mix image wins; missing mix image falls back to artist
//     image; both missing yields the existing .cover-fallback; a
//     locked/uploaded mix image renders unchanged (no width/height added)
//   - alt text: "<Artist> — <Mix title>" for mix images, artist name only
//     for artist images
//   - width/height are added only for a generated-skyline square asset
//     (real meta.width/meta.height, always 960x960 in practice), and are
//     never added for uploaded/legacy images
//   - the resolved image URL is identical across every surface that
//     renders a given mix (homepage cards, featured hero, archive rows,
//     artist-page rows, residents/selector cards)
//
// lib/WebsitePageGenerator.cjs is CommonJS; imported here via createRequire.
// Templates are read from the real website/templates/ (read-only — the
// generator falls back to it when no templates/ exists under the output
// dir). All writes go to a fresh os.tmpdir() dir; website/ is never
// touched — verified separately with `git status --short website/`.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generatePages } = require('../lib/WebsitePageGenerator.cjs');

function mkTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// 43-char arweave txid shapes (TXID_RE = /^[A-Za-z0-9_-]{43}$/).
const TX_A = 'a'.repeat(43);
const TX_B = 'b'.repeat(43);
const TX_C = 'c'.repeat(43);
const TX_D = 'd'.repeat(43);

const GENERATED_MIX_META = {
  origin: 'generated-skyline',
  assignmentVersion: 1,
  sourceVideoId: 'skyline-0001',
  sourceTimeSec: 12.4,
  generatedAt: '2026-09-01T00:00:00.000Z',
  contentHash: 'deadbeef',
  width: 960,
  height: 960,
  locked: false
};

const GENERATED_ARTIST_META = {
  origin: 'generated-skyline',
  assignmentVersion: 1,
  sourceVideoId: 'skyline-0005',
  sourceTimeSec: 8.1,
  generatedAt: '2026-09-01T00:00:00.000Z',
  contentHash: 'f00dcafe',
  width: 960,
  height: 960,
  locked: false
};

const LOCKED_UPLOADED_MIX_META = {
  origin: 'uploaded',
  assignmentVersion: 1,
  locked: true
};

const FIXTURE_ARTISTS = [
  {
    artistName: 'Skyline Test One',
    artistFilename: 'skyline-test-one.html',
    artistImageFilename: 'https://arweave.net/uploaded-artist-one-img.jpg', // uploaded, no meta
    artistGenre: 'house',
    mixes: [
      {
        // Own generated cover — should get width/height + "Artist — Title" alt.
        mixTitle: 'Generated Cover Mix',
        mixArweaveURL: 'https://arweave.net/' + TX_A,
        mixDateYear: '2026',
        mixDuration: '60:00',
        mixImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/genmix-v1.webp',
        mixImageMeta: GENERATED_MIX_META
      },
      {
        // No own image -> falls back to the artist's (plain, no-meta) image.
        mixTitle: 'Fallback To Artist Mix',
        mixArweaveURL: 'https://arweave.net/' + TX_B,
        mixDateYear: '2020',
        mixDuration: '45:00',
        mixImageFilename: ''
      },
      {
        // Locked/uploaded — must render unchanged (no width/height added).
        mixTitle: 'Locked Uploaded Mix',
        mixArweaveURL: 'https://arweave.net/' + TX_C,
        mixDateYear: '2022',
        mixDuration: '50:00',
        mixImageFilename: 'https://arweave.net/uploaded-cover-locked.jpg',
        mixImageMeta: LOCKED_UPLOADED_MIX_META
      }
    ]
  },
  {
    artistName: 'Skyline Test Two',
    artistFilename: 'skyline-test-two.html',
    artistImageFilename: '', // missing
    artistGenre: 'techno',
    mixes: [
      {
        // Both mix and artist image missing -> existing .cover-fallback.
        mixTitle: 'No Image At All Mix',
        mixArweaveURL: 'https://arweave.net/' + TX_D,
        mixDateYear: '2019',
        mixDuration: '55:00',
        mixImageFilename: ''
      }
    ]
  },
  {
    artistName: 'Skyline Test Three',
    artistFilename: 'skyline-test-three.html',
    artistImageFilename: 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/artist/genartist-v1.webp',
    artistImageMeta: GENERATED_ARTIST_META,
    artistGenre: 'electro',
    mixes: [
      {
        // No own mix image -> falls back to the artist's OWN generated
        // image; should carry dims too (meta follows whichever field
        // supplied the URL), but alt text stays "Artist — Title" (mix
        // context), not the artist-only alt used on the artist page/resident card.
        mixTitle: 'Fallback To Generated Artist Mix',
        mixArweaveURL: '',
        mixDateYear: '2021',
        mixDuration: '30:00',
        mixImageFilename: ''
      }
    ]
  }
];

let outDir;
let html = {};

test.before(() => {
  const tmpParent = mkTempDir('page-gen-precedence-');
  const inputPath = path.join(tmpParent, 'artists.json');
  fs.writeFileSync(inputPath, JSON.stringify(FIXTURE_ARTISTS, null, 2));
  outDir = path.join(tmpParent, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  const result = generatePages(inputPath, outDir);
  assert.equal(result.success, true, 'generatePages must succeed: ' + JSON.stringify(result));

  for (const file of ['index.html', 'archive.html', 'residents.html', 'skyline-test-one.html', 'skyline-test-two.html', 'skyline-test-three.html']) {
    html[file] = fs.readFileSync(path.join(outDir, file), 'utf8');
  }
});

test('generated square asset gets explicit width/height on every surface that renders it', () => {
  const needle = 'src="https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/genmix-v1.webp" alt="Skyline Test One — Generated Cover Mix" width="960" height="960"';
  // Homepage: either the featured hero (data-img, no <img> width attr needed there)
  // or a latest-mix card <img>. Archive row and artist-page row must both show it.
  assert.ok(html['archive.html'].includes(needle), 'archive row must render width/height for the generated asset');
  assert.ok(html['skyline-test-one.html'].includes(needle), 'artist-page mix row must render width/height for the generated asset');
});

// Only generated renders are ever shown as a mix thumbnail (shownMixImage).
// Uploaded art stays in the data but is hidden behind the .cover-fallback panel.
test('locked/uploaded mix image is never shown as a mix thumbnail', () => {
  for (const file of ['index.html', 'archive.html', 'skyline-test-one.html']) {
    // (the artist page may carry it in the "View original artwork" button's
    // data-original-art — that is the one place it is viewable, not a thumbnail)
    assert.ok(!/(src|data-img)="https:\/\/arweave\.net\/uploaded-cover-locked\.jpg"/.test(html[file]), file + ' must not show the uploaded cover as a thumbnail');
  }
  const fallbacks = html['skyline-test-one.html'].split('<img class="cover-fallback" src="img/square-ue.png" alt="">').length - 1;
  assert.ok(fallbacks >= 2, 'the hidden uploaded cover and the hidden artist-image fallback both render the cover-fallback');
});

test('missing mix image never falls back to a plain (uploaded) artist image', () => {
  assert.ok(!html['archive.html'].includes('uploaded-artist-one-img.jpg'), 'archive must not use the plain artist image as a mix thumbnail');
  // (Homepage Latest Mixes tiles DO show the artist picture as <img src> —
  // see homepage-artist-tiles.test.mjs — but it must never become a play
  // anchor's data-img, which carries the resolved mix image.)
  assert.ok(!/data-img="https:\/\/arweave\.net\/uploaded-artist-one-img\.jpg"/.test(html['index.html']), 'homepage data-img must not use the plain artist image');
});

test('missing mix image falling back to a GENERATED artist image still carries dims (meta follows the resolved URL)', () => {
  const needle = 'src="https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/artist/genartist-v1.webp" alt="Skyline Test Three — Fallback To Generated Artist Mix" width="960" height="960"';
  assert.ok(html['archive.html'].includes(needle), 'archive row must carry dims when the fallback source is itself a generated asset');
});

test('both mix and artist image missing yields the existing .cover-fallback, unchanged', () => {
  assert.ok(html['skyline-test-two.html'].includes('<img class="cover-fallback" src="img/square-ue.png" alt="">'), 'artist page for Skyline Test Two must show the cover-fallback');
  assert.ok(html['archive.html'].includes('<img class="cover-fallback" src="img/square-ue.png" alt="">'), 'archive.html must show the cover-fallback for the imageless mix');
});

test('artist images use artist-name-only alt text and get dims only when generated', () => {
  // Skyline Test Three's own artist image is generated -> resident card + artist-page hero both get dims + artist-only alt.
  const artistImgNeedle = 'src="https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/artist/genartist-v1.webp" alt="Skyline Test Three" width="960" height="960"';
  assert.ok(html['residents.html'].includes(artistImgNeedle), 'resident card for a generated artist image must carry dims + artist-only alt');
  assert.ok(html['skyline-test-three.html'].includes(artistImgNeedle), 'artist-page hero for a generated artist image must carry dims + artist-only alt');

  // Skyline Test One's artist image is plain/uploaded -> no dims, still artist-only alt.
  const plainArtistTag = /<img src="https:\/\/arweave\.net\/uploaded-artist-one-img\.jpg"[^>]*>/;
  const residentMatch = html['residents.html'].match(plainArtistTag);
  assert.ok(residentMatch, 'resident card for the plain artist image must render');
  assert.ok(!residentMatch[0].includes('width='), 'plain/uploaded artist image must not gain width/height');
  assert.ok(residentMatch[0].includes('alt="Skyline Test One"'), 'artist image alt text is the artist name only, never the mix title');
});

test('the same resolved mix image URL is consistent across every mix-thumbnail surface (homepage cards, archive, artist page, featured hero data-img)', () => {
  const url = 'https://storage.googleapis.com/bucket/website/generated-thumbnails/v1/mix/genmix-v1.webp';
  // "Generated Cover Mix" is the newest playable+imaged mix, so it is the
  // featured hero — its data-img attribute (not an <img src>) carries the
  // chokepoint value on the homepage; the same URL must also appear as an
  // <img src> in the archive and on the artist page.
  assert.ok(html['index.html'].includes('data-img="' + url + '"'), 'featured hero data-img must carry the resolved image URL');
  assert.ok(html['archive.html'].includes('src="' + url + '"'), 'archive row must render the same URL');
  assert.ok(html['skyline-test-one.html'].includes('src="' + url + '"'), 'artist page row must render the same URL');
});

test('never emits a source video URL as an <img> src', () => {
  const videoLikeArtists = JSON.parse(JSON.stringify(FIXTURE_ARTISTS));
  videoLikeArtists[0].mixes[0].mixImageFilename = 'https://storage.googleapis.com/bucket/skyline/some-source.mov';
  delete videoLikeArtists[0].mixes[0].mixImageMeta;

  const tmpParent = mkTempDir('page-gen-video-guard-');
  const inputPath = path.join(tmpParent, 'artists.json');
  fs.writeFileSync(inputPath, JSON.stringify(videoLikeArtists, null, 2));
  const localOut = path.join(tmpParent, 'out');
  fs.mkdirSync(localOut, { recursive: true });

  const result = generatePages(inputPath, localOut);
  assert.equal(result.success, true);
  const archiveHtml = fs.readFileSync(path.join(localOut, 'archive.html'), 'utf8');
  assert.ok(!archiveHtml.includes('src="https://storage.googleapis.com/bucket/skyline/some-source.mov"'), 'a .mov URL must never be emitted as an <img> src');
  assert.ok(archiveHtml.includes('<img class="cover-fallback" src="img/square-ue.png" alt="">'), 'it falls back to the standard cover-fallback instead');
});

test('lazy-loading / decoding attributes are preserved on generated mix images (non-eager surfaces)', () => {
  const m = html['archive.html'].match(/<img src="https:\/\/storage\.googleapis\.com\/bucket\/website\/generated-thumbnails\/v1\/mix\/genmix-v1\.webp"[^>]*>/);
  assert.ok(m, 'generated mix image must render in archive.html');
  assert.ok(m[0].includes('loading="lazy"'), 'archive rows stay lazy-loaded');
  assert.ok(m[0].includes('fetchpriority="low"'));
  assert.ok(m[0].includes('decoding="async"'));
});

test('output stays relative-path/manifest compatible: no "../" survives into the rendered HTML', () => {
  for (const file of Object.keys(html)) {
    assert.ok(!html[file].includes('../'), file + ' must not contain a parent-relative path segment');
  }
});

// Artist pages unfurl as the selector's photo only — never a promo film (owner, 2026-10-17).
test('artist pages carry no og:video tags', () => {
  for (const file of ['skyline-test-one.html', 'skyline-test-two.html', 'skyline-test-three.html']) {
    assert.ok(!html[file].includes('<meta property="og:video"'), file + ' must not emit og:video');
    assert.ok(!html[file].includes('twitter:player:stream'), file + ' must not emit twitter:player:stream');
  }
});
