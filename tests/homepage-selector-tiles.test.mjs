// Homepage selector tiles (lib/WebsitePageGenerator.cjs selectorTileHtml):
// every artist gets one square tile in place of the old Latest Mixes, showing
// the generated render of their newest mix (never their photo), their name,
// their mix count, and a play anchor for that newest mix.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { generatePages } = require('../lib/WebsitePageGenerator.cjs');

const gen = { origin: 'generated-skyline', assignmentVersion: 1, treatmentVersion: 2, width: 960, height: 960 };
const PHOTO = 'https://arweave.net/pppppppppppppppppppppppppppppppppppppppppp1/photo.jpg';
const OLD = 'https://storage.googleapis.com/b/website/generated-thumbnails/v1/mix/old-v1t2.webp';
const NEW = 'https://storage.googleapis.com/b/website/generated-thumbnails/v1/mix/new-v1t2.webp';
const tx = (c) => 'https://arweave.net/' + c.repeat(43);

const artists = [
  { artistName: 'DJ ONE', artistFilename: 'djone.html', artistImageFilename: PHOTO, mixes: [
    { mixTitle: 'Old Mix', mixArweaveURL: tx('a'), mixDateYear: '2019', mixDuration: '60:00', mixImageFilename: OLD, mixImageMeta: gen },
    { mixTitle: 'New Mix', mixArweaveURL: tx('b'), mixDateYear: '2024', mixDuration: '60:00', mixImageFilename: NEW, mixImageMeta: gen }
  ] },
  { artistName: 'DJ TWO', artistFilename: 'djtwo.html', artistImageFilename: '', mixes: [
    { mixTitle: 'Only Mix', mixArweaveURL: tx('c'), mixDateYear: '2020', mixDuration: '60:00', mixImageFilename: '' }
  ] }
];

function home() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-selectors-'));
  fs.writeFileSync(path.join(dir, 'artists.json'), JSON.stringify(artists));
  assert.equal(generatePages(path.join(dir, 'artists.json'), dir).success, true);
  return fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
}

const tiles = (html) => html.split('<article class="mix-card selector-tile').slice(1);

test('one tile per artist, in artists.json order, inside the selectors section', () => {
  const html = home();
  assert.ok(html.includes('id="homepage-selectors-grid"'));
  const t = tiles(html);
  assert.equal(t.length, 2);
  assert.match(t[0], /<h3 class="mix-card-title"><a href="djone\.html">DJ ONE<\/a><\/h3>/);
  assert.match(t[0], />2 mixes<\/a>/);
  assert.match(t[1], />1 mix<\/a>/);
});

test("a tile shows the newest mix's render and plays that mix, never the artist photo", () => {
  const t = tiles(home());
  assert.ok(t[0].includes('src="' + NEW + '"'));
  assert.ok(t[0].includes('data-img="' + NEW + '"'));
  assert.ok(t[0].includes('href="' + tx('b') + '"'));
  assert.ok(!t[0].includes(PHOTO));
});

test('an artist with no render falls back to the cover-fallback panel', () => {
  const t = tiles(home());
  assert.ok(t[1].includes('<img class="cover-fallback" src="img/square-ue.png" alt="">'));
});
