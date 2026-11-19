import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ARWEAVE_MIX_GATEWAYS, mixUrlCandidates, isPlayableMixUrl } from '../worker/lib/mix-audio.js';

const TX = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const SANDBOX = 'a'.repeat(52);
const gatewayUrls = (suffix = '') => ARWEAVE_MIX_GATEWAYS.map((g) => g + TX + suffix);

describe('mixUrlCandidates', () => {
  test('txid is 43 chars (fixture sanity)', () => assert.equal(TX.length, 43));

  test('canonical arweave.net URL -> 4 gateways then original', () => {
    const url = `https://arweave.net/${TX}`;
    const out = mixUrlCandidates(url);
    assert.equal(out.length, 5);
    assert.deepEqual(out, [...gatewayUrls(), url]);
    assert.equal(out[0], `https://arweave.fllstck.dev/${TX}`);
  });

  test('sandbox subdomain URL -> same txid candidates, original last', () => {
    const url = `https://${SANDBOX}.arweave.net/${TX}`;
    assert.deepEqual(mixUrlCandidates(url), [...gatewayUrls(), url]);
  });

  test('Firebase storage URL is returned untouched', () => {
    const url = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/abc';
    assert.deepEqual(mixUrlCandidates(url), [url]);
  });

  test('non-arweave URL is returned untouched', () => {
    assert.deepEqual(mixUrlCandidates('https://example.com/file.mp3'), ['https://example.com/file.mp3']);
    assert.deepEqual(mixUrlCandidates('not a url'), ['not a url']);
  });

  test('arweave.net URL without a txid is returned untouched', () => {
    assert.deepEqual(mixUrlCandidates('https://arweave.net/info'), ['https://arweave.net/info']);
  });

  test('arweave.net path that is not a txid is returned untouched', () => {
    const url = `https://${SANDBOX}.arweave.net/info/${TX}`;
    assert.deepEqual(mixUrlCandidates(url), [url]);
    assert.deepEqual(mixUrlCandidates(`https://arweave.net/${TX}x`), [`https://arweave.net/${TX}x`]);
  });

  test('path and query after the txid are preserved', () => {
    const url = `https://arweave.net/${TX}/track.mp3?x=1`;
    assert.deepEqual(mixUrlCandidates(url), [...gatewayUrls('/track.mp3?x=1'), url]);
  });

  test('a URL already on a gateway host is deduped', () => {
    const url = `https://frostor.xyz/${TX}`;
    const out = mixUrlCandidates(url);
    assert.equal(out.length, 4);
    assert.deepEqual(out, gatewayUrls());
  });
});

describe('isPlayableMixUrl', () => {
  test('accepts gateway hosts', () => {
    for (const g of ARWEAVE_MIX_GATEWAYS) assert.equal(isPlayableMixUrl(g + TX), true);
  });
  test('still accepts arweave.net and rejects unknown hosts', () => {
    assert.equal(isPlayableMixUrl(`https://arweave.net/${TX}`), true);
    assert.equal(isPlayableMixUrl('https://example.com/a.mp3'), false);
  });
});
