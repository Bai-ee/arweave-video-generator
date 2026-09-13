/**
 * Deployment manifest coverage.
 *
 * Nothing previously tested `lib/WebsiteDeployer.js`. The deployer's own
 * "critical file" check was warn-only and named a font that does not exist
 * (`fonts/mr-dafoe-v15-latin-regular.woff2`), so it printed a phantom error on
 * every deploy while the two fonts actually used by `css/site.css` went
 * unchecked — and a genuinely missing player module would have shipped a broken
 * site with nothing but a console warning.
 *
 * These tests assert the three properties that matter:
 *   1. every REQUIRED_MANIFEST_PATHS entry really exists on disk (a stale entry
 *      fails here instead of at deploy time),
 *   2. collectWebsiteFiles() actually collects all of them,
 *   3. assertRequiredPaths() throws on a miss, and is skippable for
 *      external-site deploys.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectWebsiteFiles,
  assertRequiredPaths,
  REQUIRED_MANIFEST_PATHS
} from '../lib/WebsiteDeployer.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const websiteDir = path.join(repoRoot, 'website');

/* The playability modules are the specific files this release adds. They are
   loaded by boot.js rather than by a <script> tag on the page, so a manifest
   that drops one fails silently in the browser — call them out by name. */
const NEW_RUNTIME_FILES = [
  'js/boot.js',
  'js/player-core.js',
  'js/player.js',
  'js/ue-warm.js',
  'js/ue-host-pref.js',
  'js/ue-links.js',
  'js/ue-resume.js',
  'js/ue-mediasession.js'
];

test('every required manifest path exists on disk', () => {
  const missing = REQUIRED_MANIFEST_PATHS.filter(
    p => !fs.existsSync(path.join(websiteDir, p))
  );
  assert.deepEqual(missing, [], `required paths absent from website/: ${missing.join(', ')}`);
});

test('the required list names every playability runtime file', () => {
  for (const f of NEW_RUNTIME_FILES) {
    assert.ok(
      REQUIRED_MANIFEST_PATHS.includes(f),
      `${f} is loaded at runtime but is not a required manifest path`
    );
  }
});

test('collectWebsiteFiles collects every required path', async () => {
  const collected = (await collectWebsiteFiles(websiteDir)).map(p => p.replace(/\\/g, '/'));
  const missing = REQUIRED_MANIFEST_PATHS.filter(p => !collected.includes(p));
  assert.deepEqual(missing, [], `required paths not collected: ${missing.join(', ')}`);
});

test('collectWebsiteFiles excludes templates and legacy directories', async () => {
  const collected = (await collectWebsiteFiles(websiteDir)).map(p => p.replace(/\\/g, '/'));
  for (const prefix of ['templates/', 'archive/', 'active/', 'data/', 'scripts/']) {
    const leaked = collected.filter(p => p.startsWith(prefix));
    assert.deepEqual(leaked, [], `${prefix} must not deploy, found: ${leaked.join(', ')}`);
  }
  /* archive.html and about.html merely *start with* an ignored directory name;
     the patterns are anchored so real pages still ship. */
  assert.ok(collected.includes('archive.html'), 'archive.html must still deploy');
  assert.ok(collected.includes('about.html'), 'about.html must still deploy');
});

test('assertRequiredPaths throws when a required path is missing', () => {
  const complete = [...REQUIRED_MANIFEST_PATHS];
  assert.doesNotThrow(() => assertRequiredPaths(complete, 'test set'));

  const withoutPlayer = complete.filter(p => p !== 'js/player-core.js');
  assert.throws(
    () => assertRequiredPaths(withoutPlayer, 'test set'),
    /js\/player-core\.js/,
    'a missing player module must abort the deploy'
  );

  assert.throws(
    () => assertRequiredPaths([], 'test set'),
    /Refusing to deploy/,
    'an empty file set must abort the deploy'
  );
});

test('assertRequiredPaths normalises Windows separators', () => {
  const windowsStyle = REQUIRED_MANIFEST_PATHS.map(p => p.replace(/\//g, '\\'));
  assert.doesNotThrow(() => assertRequiredPaths(windowsStyle, 'test set'));
});
