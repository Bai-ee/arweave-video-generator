/**
 * API endpoint to deploy an EXTERNAL static site to Arweave.
 * POST /api/deploy-external-site   { zipUrl, siteId? }
 *
 * Built for HITLOOP's Site Recreate card (see its SITE-RECREATE-CARD.md §5c):
 * HITLOOP hosts a verified static-site zip in Firebase Storage; this endpoint
 * downloads it, unpacks to /tmp, and reuses the existing WebsiteDeployer
 * (wallet-funded per-file uploads + Arweave path manifest). Unlike
 * /api/deploy-website this deploys arbitrary uploaded sites, so uploads are
 * always FULL (no incremental db) and the zip host is allowlisted.
 */

import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';

// Only fetch zips from HITLOOP's storage — this endpoint spends wallet funds.
const ALLOWED_ZIP_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ success: false, error: 'Method not allowed' });
      return;
    }

    const { zipUrl, siteId } = req.body || {};
    if (!zipUrl) {
      res.status(400).json({ success: false, error: 'zipUrl is required' });
      return;
    }
    let parsed;
    try {
      parsed = new URL(zipUrl);
    } catch {
      res.status(400).json({ success: false, error: 'zipUrl is not a valid URL' });
      return;
    }
    if (parsed.protocol !== 'https:' || !ALLOWED_ZIP_HOSTS.has(parsed.hostname)) {
      res.status(400).json({ success: false, error: `zip host not allowed: ${parsed.hostname}` });
      return;
    }

    const safeId = String(siteId || `ext-${Date.now()}`).replace(/[^a-zA-Z0-9_-]+/g, '_');
    const workDir = path.join(os.tmpdir(), `external-site-${safeId}`);
    await fs.remove(workDir);
    await fs.ensureDir(workDir);

    console.log(`[DeployExternalSite] Downloading ${zipUrl}`);
    const zipRes = await fetch(zipUrl);
    if (!zipRes.ok) {
      res.status(400).json({ success: false, error: `zip download failed (${zipRes.status})` });
      return;
    }
    const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
    console.log(`[DeployExternalSite] Downloaded ${zipBuffer.length} bytes, extracting…`);

    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(workDir, true);

    if (!(await fs.pathExists(path.join(workDir, 'index.html')))) {
      await fs.remove(workDir).catch(() => {});
      res.status(400).json({ success: false, error: 'zip has no index.html at its root' });
      return;
    }

    console.log(`[DeployExternalSite] Deploying ${safeId} to Arweave…`);
    // db = null → full (non-incremental) upload; external sites have no
    // deployment history in our Firestore.
    const result = await deployWebsiteToArweave(workDir, null);
    await fs.remove(workDir).catch(() => {});

    if (!result.success) {
      res.status(500).json({ success: false, error: result.error || 'deploy failed' });
      return;
    }

    res.status(200).json({
      success: true,
      siteId: safeId,
      manifestId: result.manifestId,
      arweaveUrl: result.manifestUrl,
      websiteUrl: result.websiteUrl,
      fileCount: result.totalFiles,
      filesUploaded: result.filesUploaded,
      sizeBytes: zipBuffer.length,
    });
  } catch (error) {
    console.error('[DeployExternalSite] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}
