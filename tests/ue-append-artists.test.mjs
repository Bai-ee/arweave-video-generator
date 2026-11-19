import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateRecord, planAppend } from '../scripts/ue-append-artists.mjs';

const KEY = 'EgTRyg67pdI-ufHMWfBIovnSpwmjm9yFKahZlvw8CLg';
const mix = (title, url) => ({ mixTitle: title, mixArweaveURL: url, mixDateYear: '??', mixDuration: '43:15', mixImageFilename: '', mixNote: 'credit' });
const archive = (n) => `https://archive.org/download/rave_X/Side_${n}.mp3#/${KEY}`;
const rec = (name, mixes) => ({ artistName: name, artistFilename: name.toLowerCase().replace(/\W/g, '') + '.html',
  artistImageFilename: 'img/about/x/portrait.webp', artistGenre: 'house', mixes });

describe('validateRecord', () => {
  test('accepts a keyed archive.org mix and a Storage mix', () => {
    const gcs = 'https://storage.googleapis.com/editvideos-63486.firebasestorage.app/website/mixes/' + KEY;
    assert.deepEqual(validateRecord(rec('DJ X', [mix('A', archive('A')), mix('B', gcs)])), []);
  });

  test('refuses Arweave audio unless --allow-arweave (third-party mixes never go to Arweave)', () => {
    const r = rec('DJ X', [mix('A', 'https://arweave.net/' + KEY)]);
    assert.equal(validateRecord(r).length, 1);
    assert.deepEqual(validateRecord(r, { allowArweave: true }), []);
  });

  test('refuses unkeyed archive URLs, other hosts, lowercase names, bad durations, duplicate titles', () => {
    const r = { ...rec('DJ X', [mix('A', 'https://archive.org/download/rave_X/a.mp3'), mix('A', 'https://evil.example/a.mp3')]), artistName: 'dj x' };
    r.mixes[0].mixDuration = '1:02:03';
    const errs = validateRecord(r).join('\n');
    for (const want of ['CAPS', 'host not allowed', 'duplicate title', 'M:SS']) assert.match(errs, new RegExp(want));
  });
});

describe('planAppend', () => {
  const live = [rec('PAUL JOHNSON', [mix('Old', archive('Old'))])];

  test('appends a new artist', () => {
    const { errors, next } = planAppend(live, [rec('DJ X', [mix('A', archive('A'))])]);
    assert.deepEqual(errors, []);
    assert.equal(next.length, 2);
  });

  test('refuses an artist that already exists, case-insensitively', () => {
    assert.match(planAppend(live, [rec('PAUL JOHNSON', [mix('A', archive('A'))])]).errors[0], /already exists/);
  });

  test('refuses any mix URL that is already live', () => {
    assert.match(planAppend(live, [rec('DJ X', [mix('A', archive('Old'))])]).errors[0], /already live/);
  });

  test('--add-mixes-to appends mixes to the existing artist only', () => {
    const { errors, next } = planAppend(live, [rec('IGNORED', [mix('Jive Turkey', archive('JT'))])], { addMixesTo: 'Paul Johnson' });
    assert.deepEqual(errors, []);
    assert.equal(next.length, 1);
    assert.deepEqual(next[0].mixes.map((m) => m.mixTitle), ['Old', 'Jive Turkey']);
    assert.equal(live[0].mixes.length, 1, 'input not mutated');
  });

  test('--add-mixes-to refuses a missing artist', () => {
    assert.match(planAppend(live, [rec('X', [mix('A', archive('A'))])], { addMixesTo: 'NOBODY' }).errors[0], /no artist/);
  });
});
