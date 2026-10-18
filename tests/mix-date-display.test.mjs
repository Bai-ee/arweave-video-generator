// mixDateYear → the date chip on each line item. Confirmed dates render plainly;
// "Circa …" marks a date that is close but not certain (owner decision 2026-10-17).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseMixDate } = require('../lib/WebsitePageGenerator.cjs');

test('a confirmed full date renders as month day, year', () => {
  assert.deepEqual(parseMixDate('6/25/14'), { key: 20140625, display: 'JUN 25, 2014' });
  assert.deepEqual(parseMixDate('1/07/15'), { key: 20150107, display: 'JAN 7, 2015' });
});

test('a circa full date keeps the day and says CIRCA', () => {
  assert.deepEqual(parseMixDate('Circa 10/02/13'), { key: 20131002, display: 'CIRCA OCT 2, 2013' });
});

test('a circa year still renders as before', () => {
  assert.deepEqual(parseMixDate('Circa 2014'), { key: 20140000, display: 'CIRCA 2014' });
  assert.deepEqual(parseMixDate("Circe '95"), { key: 19950000, display: 'CIRCA 1995' });
});

test('plain years and unknowns are unchanged', () => {
  assert.deepEqual(parseMixDate('2005'), { key: 20050000, display: '2005' });
  assert.deepEqual(parseMixDate(''), { key: 0, display: null });
  assert.deepEqual(parseMixDate('??'), { key: 0, display: null });
});
