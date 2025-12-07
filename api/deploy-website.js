/**
 * API endpoint to deploy website to Arweave
 * POST /api/deploy-website
 * 
 * Uploads all website files to Arweave and creates a manifest
 */

import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Deploy Website] Starting website deployment...');

    const { websiteDir } = req.body || {};
    const deployResult = await deployWebsiteToArweave(websiteDir || 'website');

    if (!deployResult.success) {
      return res.status(500).json({
        success: false,
        error: deployResult.error || 'Failed to deploy website',
        filesUploaded: deployResult.filesUploaded || 0
      });
    }

    return res.status(200).json({
      success: true,
      manifestId: deployResult.manifestId,
      manifestUrl: deployResult.manifestUrl,
      websiteUrl: deployResult.websiteUrl,
      filesUploaded: deployResult.filesUploaded,
      message: 'Website deployed successfully to Arweave'
    });

  } catch (error) {
    console.error('[Deploy Website] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to deploy website',
      message: error.message 
    });
  }
}

