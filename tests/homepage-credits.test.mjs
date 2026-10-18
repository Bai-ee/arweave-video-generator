// lib/WebsitePageGenerator.cjs homepageCredits — "Live @ Viva Acid" sets show
// their DJs as the homepage title and the event title as the small line.
//
// The DJs are derived from the shared audio txid (a VIVA ACID mirror record
// shares its file with the DJs' own records), never typed in. Display only:
// the generator still stamps the real record into every data-* attribute.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { homepageCredits, buildCatalog } = require('../lib/WebsitePageGenerator.cjs');

const TX_B2B = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM';
const TX_SOLO = '3AxXQKQwyu_xPf2b-Da-MfPCw6VFeMXuposTY5qwjUg';
const TX_HOST_ONLY = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TX_OTHER = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const url = (tx) => 'https://sub.arweave.net/' + tx;
const live = (tx) => ({ mixTitle: "Live @ Viva Acid '24", mixArweaveURL: url(tx), mixDateYear: "'24", mixDuration: '120:00' });

const artists = [
  { artistName: 'ANDREW EMIL', artistFilename: 'andrewemil.html', mixes: [live(TX_B2B)] },
  { artistName: 'BAI-EE', artistFilename: 'baiee.html', mixes: [live(TX_SOLO), { mixTitle: 'Rough Times', mixArweaveURL: url(TX_OTHER) }] },
  { artistName: 'RED EYE', artistFilename: 'redeye.html', mixes: [live(TX_B2B)] },
  { artistName: 'VIVA ACID', artistFilename: 'vivaacid.html', mixes: [live(TX_SOLO), live(TX_B2B), live(TX_HOST_ONLY)] }
];

test('credits name the DJs who share the txid, B2B-joined, VIVA ACID excluded', () => {
  const credits = homepageCredits(buildCatalog(artists));
  assert.deepEqual(credits[TX_B2B], { title: 'ANDREW EMIL B2B RED EYE', sub: "Live @ Viva Acid '24" });
  assert.deepEqual(credits[TX_SOLO], { title: 'BAI-EE', sub: "Live @ Viva Acid '24" });
});

test('a set with no DJ record of its own gets no credit', () => {
  const credits = homepageCredits(buildCatalog(artists));
  assert.equal(credits[TX_HOST_ONLY], undefined);
});

test('mixes not titled "Live @ Viva Acid" are never credited', () => {
  const credits = homepageCredits(buildCatalog(artists));
  assert.equal(credits[TX_OTHER], undefined);
  assert.deepEqual(Object.keys(credits).sort(), [TX_SOLO, TX_B2B].sort());
});
