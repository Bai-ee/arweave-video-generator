import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkDeployToken } from '../lib/deploy-auth.js';

test('open when DEPLOY_WEBSITE_TOKEN is not set', () => {
  assert.deepEqual(checkDeployToken({}, {}), { ok: true, mode: 'open' });
});

test('401 without a token, 403 with a wrong one, ok with the right one', () => {
  const env = { DEPLOY_WEBSITE_TOKEN: 'secret-123' };
  assert.equal(checkDeployToken({}, env).status, 401);
  assert.equal(checkDeployToken({ 'x-deploy-token': 'secret-12' }, env).status, 403);
  assert.equal(checkDeployToken({ 'x-deploy-token': 'secret-124' }, env).status, 403);
  assert.deepEqual(checkDeployToken({ 'x-deploy-token': 'secret-123' }, env), { ok: true, mode: 'token' });
  assert.equal(checkDeployToken({ 'x-deploy-token': ['secret-123'] }, env).ok, true);
});

test('the deploy endpoint checks the token before any POST work', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../api/deploy-website.js', import.meta.url), 'utf8');
  const gate = src.indexOf('checkDeployToken(req.headers)');
  assert.ok(gate > 0, 'gate present');
  assert.ok(gate < src.indexOf('req.body?.zipUrl'), 'gate runs before external-site deploys');
  assert.match(src, /Access-Control-Allow-Headers', 'Content-Type, X-Deploy-Token'/);
});
