// Locked artist portraits (ARTIST_PORTRAITS.md): every committed portrait must
// match the outputSha256 in config/artist-portraits.json. A change here means a
// portrait was re-rendered or replaced — re-lock it deliberately or revert.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { portraits } = JSON.parse(readFileSync(path.join(root, 'config/artist-portraits.json'), 'utf8'));

test('artist portrait recipes are complete and unique', () => {
  const slugs = new Set();
  for (const p of portraits) {
    for (const k of ['artist', 'slug', 'output', 'outputSha256', 'crop']) assert.ok(p[k], `${p.slug}: missing ${k}`);
    assert.match(p.crop, /^\d+:\d+:\d+:\d+$/);
    assert.match(p.source?.sha256 || '', /^[0-9a-f]{64}$/);
    assert.ok(!slugs.has(p.slug), `duplicate slug ${p.slug}`);
    slugs.add(p.slug);
  }
});

for (const p of portraits) {
  test(`locked portrait unchanged: ${p.slug}`, () => {
    const got = createHash('sha256').update(readFileSync(path.join(root, p.output))).digest('hex');
    assert.equal(got, p.outputSha256, `${p.output} differs from its lock`);
  });
}
