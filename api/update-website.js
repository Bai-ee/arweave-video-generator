/**
 * API endpoint to update website HTML pages
 * POST /api/update-website
 * 
 * Syncs Firebase artists to website/artists.json and regenerates all HTML pages
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
    console.log('[Update Website] Starting website update...');

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Step 1: Sync Firebase to website/artists.json
    console.log('[Update Website] Step 1: Syncing Firebase to artists.json...');
    const syncResult = await syncFirebaseToWebsiteJSON(db, 'website');

    if (!syncResult.success) {
      return res.status(500).json({
        success: false,
        error: `Failed to sync Firebase to website: ${syncResult.error}`,
        syncResult: syncResult
      });
    }

    console.log(`[Update Website] ✅ Synced ${syncResult.artistsCount} artists to website/artists.json`);

    // Step 2: Generate HTML pages
    console.log('[Update Website] Step 2: Generating HTML pages...');
    try {
      const generateScript = require(path.join(process.cwd(), 'website', 'scripts', 'generate_artist_pages.js'));
      const generateResult = generateScript.generatePages();

      if (!generateResult.success) {
        return res.status(500).json({
          success: false,
          error: `Failed to generate HTML pages: ${generateResult.error}`,
          syncResult: syncResult,
          generateResult: generateResult
        });
      }

      console.log(`[Update Website] ✅ Generated ${generateResult.artistPagesGenerated} artist pages and updated index.html`);

      return res.status(200).json({
        success: true,
        message: 'Website updated successfully',
        artistsSynced: syncResult.artistsCount,
        artistPagesGenerated: generateResult.artistPagesGenerated,
        indexHtmlUpdated: generateResult.indexHtmlUpdated
      });

    } catch (generateError) {
      console.error('[Update Website] Error generating pages:', generateError.message);
      return res.status(500).json({
        success: false,
        error: `Failed to generate HTML pages: ${generateError.message}`,
        syncResult: syncResult
      });
    }

  } catch (error) {
    console.error('[Update Website] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to update website',
      message: error.message 
    });
  }
}

