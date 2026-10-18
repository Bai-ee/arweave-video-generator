/**
 * Guard: generated thumbnails must be publicly readable.
 *
 * The two real Firebase Storage adapters return a
 * `https://storage.googleapis.com/<bucket>/<path>` URL that is written straight
 * into `mixImageFilename` and rendered on the public site. The bucket has **no**
 * `allUsers` binding and uniform bucket-level access is **off**, so a freshly
 * uploaded object is private: an anonymous GET returns 403 and every generated
 * thumbnail renders as a broken image.
 *
 * This was verified against the real bucket by uploading one probe object the
 * exact way the backfill does — 403 without `makePublic()`, 200 with it.
 *
 * Every unit test in the skyline suite injects a fake storage adapter, so none of
 * them can catch this; the defect lives entirely in the real adapters. These are
 * therefore source-level assertions. They are deliberately narrow: they only
 * check that each real adapter's upload path makes the object public.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ADAPTERS = [
  { file: 'scripts/skyline-thumbnails.mjs', what: 'backfill CLI' },
  { file: 'worker/run-thumbnail-jobs.mjs', what: 'future-upload job worker' }
];

for (const { file, what } of ADAPTERS) {
  test(`${what} (${file}) makes uploaded thumbnails public`, () => {
    const src = fs.readFileSync(path.join(repoRoot, file), 'utf8');

    assert.match(
      src,
      /bucket\.upload\(/,
      `${file} should still upload via bucket.upload()`
    );
    assert.match(
      src,
      /makePublic\(\)/,
      `${file} uploads a thumbnail but never calls makePublic(); the resulting ` +
        `storage.googleapis.com URL 403s for site visitors`
    );

    /* Ordering matters: the object must exist before it can be made public. */
    const uploadAt = src.indexOf('bucket.upload(');
    const publicAt = src.indexOf('makePublic()');
    assert.ok(
      publicAt > uploadAt,
      `${file} calls makePublic() before bucket.upload(); it must come after`
    );
  });
}

test('the public URL shape the site renders is the storage.googleapis.com form', () => {
  for (const { file } of ADAPTERS) {
    const src = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.match(
      src,
      /https:\/\/storage\.googleapis\.com\/\$\{bucket\.name\}\//,
      `${file} should return the public storage.googleapis.com URL form`
    );
  }
});
