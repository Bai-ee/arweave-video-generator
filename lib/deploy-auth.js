/**
 * Shared-secret gate for POST /api/deploy-website (it spends wallet funds and rewrites the site).
 *
 * Off until DEPLOY_WEBSITE_TOKEN is set in the Vercel env. Once set, every POST must send
 * the same value in the `X-Deploy-Token` header. Callers: the EditVideos UI (asks once and keeps
 * it in the browser), the HITLOOP bridge (EDITVIDEOS_DEPLOY_TOKEN), and the UE runbook
 * (UE_DEPLOY_TOKEN). See UE_ADDING_MIXES.md "Security".
 */
import { timingSafeEqual } from 'node:crypto';

export const DEPLOY_TOKEN_HEADER = 'x-deploy-token';

export function checkDeployToken(headers, env = process.env) {
  const expected = env.DEPLOY_WEBSITE_TOKEN;
  if (!expected) return { ok: true, mode: 'open' };
  const raw = headers?.[DEPLOY_TOKEN_HEADER] ?? headers?.['X-Deploy-Token'];
  const got = Array.isArray(raw) ? raw[0] : raw;
  if (typeof got !== 'string' || !got) return { ok: false, status: 401, error: 'deploy token required' };
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 403, error: 'deploy token rejected' };
  return { ok: true, mode: 'token' };
}
