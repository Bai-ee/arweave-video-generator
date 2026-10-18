// ue-resume.js -- record construction, formatting, and validateRecord's
// full rejection-reason matrix. Deterministic: every "now" is injected, no
// real Date.now()/setTimeout involved. See tests/helpers/load-ue-resume.mjs
// for why no DOM/window seeding is needed for any of this.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadUeResume } from './helpers/load-ue-resume.mjs';

const UEResume = loadUeResume();
const TXID = 'xH8qwPs-l9UD7V07Ih2jL0igYmJeQJJ3PA_cXd5cNvM'; // real UE mix txid, 43 chars
const NOW = 1_800_000_000_000; // fixed instant, arbitrary but stable

function baseRecord(overrides) {
  return Object.assign({
    v: 1,
    txid: TXID,
    page: '/baiee.html',
    position: 120,
    duration: 3600,
    title: 'Deep Cuts Vol. 3',
    artist: 'baiee',
    ts: NOW - 1000
  }, overrides || {});
}

describe('module loading under node:vm', () => {
  test('loads with no window/document/localStorage present and exposes the full API without throwing', () => {
    // loadUeResume() (see the helper) already runs the file through
    // vm.runInThisContext with only a bare `{}` window and no `document`
    // at all -- if the file's top-level code touched either unguarded,
    // the `import` at the top of this test file would already have
    // thrown before any test ran. Re-loading here (independent module
    // instance) re-proves it and pins down the exported shape.
    const fresh = loadUeResume();
    assert.equal(typeof fresh, 'object');
    assert.ok(fresh);
    for (const key of [
      'makeRecord', 'validateRecord', 'shouldSave', 'shouldSaveOnPause',
      'isComplete', 'formatTime', 'readRecord', 'writeRecord', 'clearRecord',
      'pageHasTxid', 'buildFallbackUrl', 'createResumeHandler', 'getLocalStorage'
    ]) {
      assert.equal(typeof fresh[key], 'function', key + ' must be exported as a function');
    }
  });
});

describe('formatTime', () => {
  test('formats sub-minute and multi-minute values as m:ss', () => {
    assert.equal(UEResume.formatTime(0), '0:00');
    assert.equal(UEResume.formatTime(5), '0:05');
    assert.equal(UEResume.formatTime(65), '1:05');
    assert.equal(UEResume.formatTime(754), '12:34');
  });

  test('formats hour-plus values as h:mm:ss', () => {
    assert.equal(UEResume.formatTime(3661), '1:01:01');
    assert.equal(UEResume.formatTime(7200), '2:00:00');
  });

  test('degrades to 0:00 for negative/non-finite input rather than throwing', () => {
    assert.equal(UEResume.formatTime(-5), '0:00');
    assert.equal(UEResume.formatTime(NaN), '0:00');
    assert.equal(UEResume.formatTime(Infinity), '0:00');
    assert.equal(UEResume.formatTime(undefined), '0:00');
  });
});

describe('makeRecord', () => {
  test('builds a well-formed record from good inputs', () => {
    const rec = UEResume.makeRecord({
      txid: TXID, page: '/baiee.html', position: 90, duration: 1200,
      title: 'Mix', artist: 'Artist', now: NOW
    });
    assert.deepEqual(rec, {
      v: UEResume.RECORD_VERSION, txid: TXID, page: '/baiee.html',
      position: 90, duration: 1200, title: 'Mix', artist: 'Artist', ts: NOW
    });
  });

  test('coerces loose/missing inputs instead of throwing', () => {
    const rec = UEResume.makeRecord({});
    assert.equal(rec.v, UEResume.RECORD_VERSION);
    assert.equal(rec.txid, '');
    assert.equal(rec.page, '/');
    assert.equal(rec.position, 0);
    assert.equal(rec.duration, null);
    assert.equal(rec.title, '');
    assert.equal(rec.artist, '');
    assert.equal(typeof rec.ts, 'number');
  });

  test('treats a non-finite/zero/negative duration as unknown (null)', () => {
    assert.equal(UEResume.makeRecord({ duration: NaN }).duration, null);
    assert.equal(UEResume.makeRecord({ duration: 0 }).duration, null);
    assert.equal(UEResume.makeRecord({ duration: -10 }).duration, null);
  });
});

describe('validateRecord -- accepts', () => {
  test('a well-formed, unexpired record round-trips through JSON', () => {
    const raw = JSON.stringify(baseRecord());
    const result = UEResume.validateRecord(raw, { now: NOW, ttlMs: UEResume.TTL_MS });
    assert.equal(result.ok, true);
    assert.equal(result.reason, null);
    assert.equal(result.record.txid, TXID);
    assert.equal(result.record.position, 120);
  });

  test('accepts duration: null (unknown duration is valid)', () => {
    const raw = JSON.stringify(baseRecord({ duration: null }));
    const result = UEResume.validateRecord(raw, { now: NOW });
    assert.equal(result.ok, true);
    assert.equal(result.record.duration, null);
  });

  test('accepts a plain object as well as a JSON string (test convenience)', () => {
    const result = UEResume.validateRecord(baseRecord(), { now: NOW });
    assert.equal(result.ok, true);
  });

  test('tolerates a position landing a hair past duration via float rounding', () => {
    const raw = JSON.stringify(baseRecord({ position: 100.4, duration: 100 }));
    const result = UEResume.validateRecord(raw, { now: NOW });
    assert.equal(result.ok, true);
  });
});

describe('validateRecord -- rejects, one reason per case', () => {
  test('missing value', () => {
    assert.equal(UEResume.validateRecord(null, { now: NOW }).reason, 'missing');
    assert.equal(UEResume.validateRecord(undefined, { now: NOW }).reason, 'missing');
    assert.equal(UEResume.validateRecord('', { now: NOW }).reason, 'missing');
  });

  test('bad JSON (non-JSON garbage string)', () => {
    const result = UEResume.validateRecord('{not json', { now: NOW });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'bad-json');
  });

  test('wrong shape (array / primitive / null-JSON)', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify([1, 2]), { now: NOW }).reason, 'bad-shape');
    assert.equal(UEResume.validateRecord(JSON.stringify(42), { now: NOW }).reason, 'bad-shape');
    assert.equal(UEResume.validateRecord(JSON.stringify(null), { now: NOW }).reason, 'bad-shape');
  });

  test('wrong/missing version', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ v: 2 })), { now: NOW }).reason, 'wrong-version');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ v: undefined })), { now: NOW }).reason, 'wrong-version');
  });

  test('unknown/bad txid shape', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ txid: 'too-short' })), { now: NOW }).reason, 'bad-txid');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ txid: TXID + '!' })), { now: NOW }).reason, 'bad-txid');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ txid: 123 })), { now: NOW }).reason, 'bad-txid');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ txid: null })), { now: NOW }).reason, 'bad-txid');
  });

  test('bad page (must be a safe local pathname, never a scheme/host)', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ page: 'javascript:alert(1)' })), { now: NOW }).reason, 'bad-page');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ page: '//evil.example/x' })), { now: NOW }).reason, 'bad-page');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ page: 'baiee.html' })), { now: NOW }).reason, 'bad-page');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ page: 'https://evil.example' })), { now: NOW }).reason, 'bad-page');
  });

  test('position: negative, NaN, Infinity, or absurdly huge', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ position: -5 })), { now: NOW }).reason, 'bad-position');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ position: NaN })), { now: NOW }).reason, 'bad-position');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ position: Infinity })), { now: NOW }).reason, 'bad-position');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ position: UEResume.MAX_TIME_SEC + 1 })), { now: NOW }).reason, 'bad-position');
  });

  test('bad duration: wrong type, zero, negative, or absurdly huge', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ duration: 'soon' })), { now: NOW }).reason, 'bad-duration');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ duration: 0 })), { now: NOW }).reason, 'bad-duration');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ duration: -1 })), { now: NOW }).reason, 'bad-duration');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ duration: UEResume.MAX_TIME_SEC + 1 })), { now: NOW }).reason, 'bad-duration');
  });

  test('position beyond a known duration', () => {
    const result = UEResume.validateRecord(JSON.stringify(baseRecord({ position: 500, duration: 300 })), { now: NOW });
    assert.equal(result.reason, 'position-beyond-duration');
  });

  test('oversized title/artist fields', () => {
    const hugeTitle = 'x'.repeat(UEResume.MAX_FIELD_LEN + 1);
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ title: hugeTitle })), { now: NOW }).reason, 'bad-title');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ artist: hugeTitle })), { now: NOW }).reason, 'bad-artist');
  });

  test('bad/missing timestamp', () => {
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ ts: 'yesterday' })), { now: NOW }).reason, 'bad-timestamp');
    assert.equal(UEResume.validateRecord(JSON.stringify(baseRecord({ ts: NaN })), { now: NOW }).reason, 'bad-timestamp');
  });

  test('future timestamp (clock skew or tampering)', () => {
    const result = UEResume.validateRecord(JSON.stringify(baseRecord({ ts: NOW + 60000 })), { now: NOW });
    assert.equal(result.reason, 'future-timestamp');
  });

  test('expired past the TTL', () => {
    const staleTs = NOW - UEResume.TTL_MS - 1;
    const result = UEResume.validateRecord(JSON.stringify(baseRecord({ ts: staleTs })), { now: NOW, ttlMs: UEResume.TTL_MS });
    assert.equal(result.reason, 'expired');
  });

  test('a record exactly at the TTL boundary is still valid; one ms past is expired', () => {
    const atBoundary = baseRecord({ ts: NOW - UEResume.TTL_MS });
    assert.equal(UEResume.validateRecord(JSON.stringify(atBoundary), { now: NOW, ttlMs: UEResume.TTL_MS }).ok, true);
    const pastBoundary = baseRecord({ ts: NOW - UEResume.TTL_MS - 1 });
    assert.equal(UEResume.validateRecord(JSON.stringify(pastBoundary), { now: NOW, ttlMs: UEResume.TTL_MS }).reason, 'expired');
  });
});
