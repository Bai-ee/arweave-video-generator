// Renders made in place of uploaded covers (mix.renderImageFilename /
// renderImageMeta, skyline-thumbnails --render-uploaded).
//
// The site shows only generated renders as mix thumbnails. A mix whose cover
// is uploaded art keeps that art in the data, but every page shows its render
// instead (or the empty cover-fallback until one exists). Covers:
//   - store: the renderUploaded plan targets only mixes without a generated
//     cover, and applyRenderAssignment writes the two render fields and
//     nothing else (never the cover), refuses a generated cover, is idempotent
//   - generator: homepage AND artist pages show the render, never the flyer,
//     and a generated cover wins over a stale render
//   - sync: both directions carry the fields

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createAssignmentStore } from '../lib/SkylineAssignmentStore.js';
import { syncFirebaseToWebsiteJSON, syncWebsiteJSONToFirebase } from '../lib/WebsiteSync.js';
import { deriveMixKey } from '../lib/skyline/keys.js';
import { createFakeFirestore } from './skyline-assignment-store.test.mjs';

const require = createRequire(import.meta.url);
const { generatePages } = require('../lib/WebsitePageGenerator.cjs');

const TX_FLYER = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const TX_GEN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const FLYER = 'https://arweave.net/cccccccccccccccccccccccccccccccccccccccccc1/flyer.jpg';
const GEN_COVER = 'https://storage.googleapis.com/b/website/generated-thumbnails/v1/mix/gen-v1t2.webp';
const RENDER = 'https://storage.googleapis.com/b/website/generated-thumbnails/v1/render/render-v1t2.webp';
// Thumbnail surfaces: an <img src> or a play anchor's data-img. The artist page
// also carries the flyer in its "View original artwork" button, which is fine.
const showsAsThumb = (page, url) => page.includes('src="' + url + '"') || page.includes('data-img="' + url + '"');
const genMeta = { origin: 'generated-skyline', assignmentVersion: 1, treatmentVersion: 2, candidateId: 'skyline-x@1.00', dHash: '0f0f0f0f0f0f0f0f', width: 960, height: 960 };

function fixtureArtists() {
  return [{
    artistName: 'DJ ONE',
    artistFilename: 'djone.html',
    artistImageFilename: 'https://arweave.net/dddddddddddddddddddddddddddddddddddddddddd1/portrait.jpg',
    mixes: [
      { mixTitle: 'Flyer Mix', mixArweaveURL: 'https://arweave.net/' + TX_FLYER, mixDateYear: '1/24', mixDuration: '60:00', mixImageFilename: FLYER },
      { mixTitle: 'Rendered Mix', mixArweaveURL: 'https://arweave.net/' + TX_GEN, mixDateYear: '2/24', mixDuration: '60:00', mixImageFilename: GEN_COVER, mixImageMeta: genMeta }
    ]
  }];
}

function makeStore(artists) {
  const db = createFakeFirestore({ 'system/artists': { artists } });
  return { db, store: createAssignmentStore({ db }) };
}

const flyerKey = deriveMixKey({ artistFilename: 'djone.html', mixArweaveURL: 'https://arweave.net/' + TX_FLYER, mixTitle: 'Flyer Mix' });
const genKey = deriveMixKey({ artistFilename: 'djone.html', mixArweaveURL: 'https://arweave.net/' + TX_GEN, mixTitle: 'Rendered Mix' });

test('renderUploaded plan targets the uploaded-cover mix only', async () => {
  const { store } = makeStore(fixtureArtists());
  const plan = await store.buildPlan({ target: 'mix', filters: { renderUploaded: true } });
  const byKey = Object.fromEntries(plan.entities.map((e) => [e.entityKey, e]));
  assert.equal(byKey[flyerKey].willAssign, true);
  assert.equal(byKey[flyerKey].nextAssignmentVersion, 1);
  assert.equal(byKey[genKey].willAssign, false);
  assert.equal(byKey[genKey].skipReason, 'cover-already-generated');
  await assert.rejects(store.buildPlan({ target: 'both', filters: { renderUploaded: true } }));
});

test('applyRenderAssignment writes only the render fields, refuses a generated cover, is idempotent', async () => {
  process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
  const { db, store } = makeStore(fixtureArtists());
  const meta = { ...genMeta, candidateId: 'skyline-render@2.00', dHash: '1e1e1e1e1e1e1e1e' };

  const r1 = await store.applyRenderAssignment({ entityKey: flyerKey, artistFilename: 'djone.html', mixIndex: 0, imageUrl: RENDER, meta });
  assert.equal(r1.applied, true);
  const mix = db._dump()['system/artists'].artists[0].mixes[0];
  assert.equal(mix.mixImageFilename, FLYER, 'cover untouched');
  assert.equal(mix.mixImageMeta, undefined, 'cover meta untouched');
  assert.equal(mix.renderImageFilename, RENDER);
  assert.equal(mix.renderImageMeta.idempotencyKey, `render:${flyerKey}:v1t2`);
  assert.ok(db._dump()[`skyline_assignment_index/render:${flyerKey}:v1t2`], 'used-index written');

  const r2 = await store.applyRenderAssignment({ entityKey: flyerKey, artistFilename: 'djone.html', mixIndex: 0, imageUrl: RENDER, meta });
  assert.equal(r2.reason, 'already-applied');

  const r3 = await store.applyRenderAssignment({ entityKey: genKey, artistFilename: 'djone.html', mixIndex: 1, imageUrl: RENDER, meta });
  assert.equal(r3.reason, 'cover-already-generated');

  const used = await store.readUsedIndex();
  assert.ok(used.candidateIds.has('skyline-render@2.00'), 'renders seed collision avoidance');
});

function renderSite(artists) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-home-'));
  fs.writeFileSync(path.join(dir, 'artists.json'), JSON.stringify(artists));
  const r = generatePages(path.join(dir, 'artists.json'), dir);
  assert.equal(r.success, true, r.error);
  return {
    index: fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    artist: fs.readFileSync(path.join(dir, 'djone.html'), 'utf8'),
    archive: fs.readFileSync(path.join(dir, 'archive.html'), 'utf8')
  };
}

test('every page shows the render, never the flyer', () => {
  const artists = fixtureArtists();
  Object.assign(artists[0].mixes[0], { renderImageFilename: RENDER, renderImageMeta: genMeta });
  const { index, artist, archive } = renderSite(artists);
  // (the homepage shows one selector tile per artist — its newest mix — so
  // the per-mix check runs on the archive and artist page)
  assert.ok(!showsAsThumb(index, FLYER), 'homepage never shows the flyer as a thumbnail');
  for (const [name, page] of [['archive', archive], ['artist page', artist]]) {
    assert.ok(showsAsThumb(page, RENDER), name + ' shows the render');
    assert.ok(!showsAsThumb(page, FLYER), name + ' never shows the flyer as a thumbnail');
  }
});

test('an uploaded cover with no render yet is hidden behind the cover-fallback', () => {
  const { artist } = renderSite(fixtureArtists());
  assert.ok(!showsAsThumb(artist, FLYER));
  assert.ok(artist.includes('<img class="cover-fallback" src="img/square-ue.png" alt="">'));
});

test('a generated cover wins over a stale render', () => {
  const artists = fixtureArtists();
  Object.assign(artists[0].mixes[1], { renderImageFilename: RENDER, renderImageMeta: genMeta });
  const { index } = renderSite(artists);
  assert.ok(index.includes(GEN_COVER));
  assert.ok(!index.includes(RENDER));
});

test('both sync directions carry the render fields', async () => {
  const artists = fixtureArtists();
  Object.assign(artists[0].mixes[0], { renderImageFilename: RENDER, renderImageMeta: genMeta });
  const db = createFakeFirestore({ 'system/artists': { artists } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ue-sync-'));

  const down = await syncFirebaseToWebsiteJSON(db, dir);
  assert.equal(down.success, true);
  const local = JSON.parse(fs.readFileSync(path.join(dir, 'artists.json'), 'utf8'));
  assert.equal(local[0].mixes[0].renderImageFilename, RENDER);
  assert.deepEqual(local[0].mixes[0].renderImageMeta, genMeta);

  const db2 = createFakeFirestore({});
  const up = await syncWebsiteJSONToFirebase(db2, dir);
  assert.equal(up.success, true);
  const remote = db2._dump()['system/artists'].artists[0].mixes[0];
  assert.equal(remote.renderImageFilename, RENDER);
  assert.deepEqual(remote.renderImageMeta, genMeta);
});

test('the original artwork is viewable from the artist page only, via its button', () => {
  const artists = fixtureArtists();
  Object.assign(artists[0].mixes[0], { renderImageFilename: RENDER, renderImageMeta: genMeta });
  const { index, artist, archive } = renderSite(artists);
  const btn = artist.match(/<button class="download-btn original-art-btn"[^>]*>/g) || [];
  assert.equal(btn.length, 1, 'one button: only the mix with custom art gets one');
  assert.ok(btn[0].includes('data-original-art="' + FLYER + '"'));
  assert.ok(btn[0].includes('data-mix-txid="' + TX_FLYER + '"'));
  assert.ok(!archive.includes('original-art-btn') && !index.includes('original-art-btn'), 'lists never carry it');
});
