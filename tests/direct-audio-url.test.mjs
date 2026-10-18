// Mixes not yet on Arweave are hosted in Firebase Storage under a fixed prefix,
// named by a 43-char content id. The page generator must keep them playable,
// and must not re-point them at arweave.net like other non-Arweave gateways.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { normalizeAudioUrl } = require('../lib/WebsitePageGenerator.cjs');

const PREFIX = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/';
const ID = 'RgLrM8jsEvwrd4wmxjhD4xDyxjEffpwke5gIyccMNNw';

test('direct Storage mix URL passes through unchanged', () => {
  assert.equal(normalizeAudioUrl(PREFIX + ID), PREFIX + ID);
});

test('direct prefix with a malformed id is not playable', () => {
  assert.equal(normalizeAudioUrl(PREFIX + 'short'), null);
  assert.equal(normalizeAudioUrl(PREFIX + ID + '.mp3'), null);
});

test('other buckets are not accepted as direct audio', () => {
  assert.equal(normalizeAudioUrl('https://storage.googleapis.com/other-bucket/website/mixes/' + ID), null);
});

test('arweave.net URLs are unaffected', () => {
  assert.equal(normalizeAudioUrl('https://arweave.net/' + ID), 'https://arweave.net/' + ID);
});
