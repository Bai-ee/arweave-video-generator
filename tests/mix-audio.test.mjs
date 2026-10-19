// The render worker plays mixes from Arweave AND this project's Firebase Storage (BAI-EE's not-yet-archived mixes),
// and a requested mix title renders exactly that mix or fails — never a silent swap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlayableMixUrl, findRequestedMix } from '../worker/lib/mix-audio.js';

const FIREBASE = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/0u1ncQleRgLrM8jsEvwrd4wmxjhD4xDyxjEffpwke5g';

test('Arweave and the project Firebase bucket are playable; anything else is not', () => {
  assert.equal(isPlayableMixUrl('https://arweave.net/abc123'), true);
  assert.equal(isPlayableMixUrl(FIREBASE), true);
  assert.equal(isPlayableMixUrl('https://firebasestorage.googleapis.com/v0/b/editvideos-63486.firebasestorage.app/o/x.mp3?alt=media'), true);
  assert.equal(isPlayableMixUrl('https://storage.googleapis.com/some-other-bucket/x.mp3'), false);
  assert.equal(isPlayableMixUrl('ftp://arweave.net/x'), false);
  assert.equal(isPlayableMixUrl(''), false);
  assert.equal(isPlayableMixUrl(undefined), false);
});

test('exact title wins over a looser contains-match; no match returns null', () => {
  const mixes = [{ mixTitle: '12 Step Music Mix' }, { mixTitle: 'Music Mix' }, { mixTitle: 'Secret Studio — Live 1' }];
  assert.equal(findRequestedMix(mixes, 'music mix').mixTitle, 'Music Mix');
  assert.equal(findRequestedMix(mixes, 'Secret Studio — Live 1').mixTitle, 'Secret Studio — Live 1');
  assert.equal(findRequestedMix(mixes, 'Loft Livin'), null);
  assert.equal(findRequestedMix(mixes, ''), null);
});
