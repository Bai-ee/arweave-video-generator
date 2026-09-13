import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { skylineThumbnailsEnabled, assertSkylineEnabled } from '../lib/skyline/flags.js';

describe('skylineThumbnailsEnabled', () => {
  test('defaults to false when unset', () => {
    assert.equal(skylineThumbnailsEnabled({}), false);
  });

  test('false for undefined/null env', () => {
    assert.equal(skylineThumbnailsEnabled({ SKYLINE_THUMBNAILS_ENABLED: undefined }), false);
  });

  ['1', 'true', 'yes', 'TRUE', 'Yes', 'YES', '  true  '].forEach((raw) => {
    test(`true for ${JSON.stringify(raw)}`, () => {
      assert.equal(skylineThumbnailsEnabled({ SKYLINE_THUMBNAILS_ENABLED: raw }), true);
    });
  });

  ['0', 'false', 'no', '', 'on', 'enabled', '2'].forEach((raw) => {
    test(`false for ${JSON.stringify(raw)}`, () => {
      assert.equal(skylineThumbnailsEnabled({ SKYLINE_THUMBNAILS_ENABLED: raw }), false);
    });
  });

  test('reads process.env by default', () => {
    const prev = process.env.SKYLINE_THUMBNAILS_ENABLED;
    try {
      process.env.SKYLINE_THUMBNAILS_ENABLED = 'true';
      assert.equal(skylineThumbnailsEnabled(), true);
      process.env.SKYLINE_THUMBNAILS_ENABLED = 'false';
      assert.equal(skylineThumbnailsEnabled(), false);
    } finally {
      if (prev === undefined) delete process.env.SKYLINE_THUMBNAILS_ENABLED;
      else process.env.SKYLINE_THUMBNAILS_ENABLED = prev;
    }
  });
});

describe('assertSkylineEnabled', () => {
  test('throws an actionable error when off', () => {
    assert.throws(() => assertSkylineEnabled({}), /SKYLINE_THUMBNAILS_ENABLED/);
  });

  test('does not throw when on', () => {
    assert.doesNotThrow(() => assertSkylineEnabled({ SKYLINE_THUMBNAILS_ENABLED: 'true' }));
  });
});
