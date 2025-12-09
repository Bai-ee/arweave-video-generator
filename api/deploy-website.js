/**
 * API endpoint to deploy website to Arweave
 * POST /api/deploy-website
 * 
 * Uploads website files to Arweave and creates a manifest
 * Uses incremental uploads - only uploads changed/new files
 */

import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export default async function handler(req, res) {
  // Wrapper to ensure all errors return JSON
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

  // Handle GET for cost estimation
  if (req.method === 'GET') {
    try {
      // Initialize Firebase for incremental analysis
      let db = null;
      try {
        initializeFirebaseAdmin();
        db = getFirestore();
      } catch (error) {
        console.warn('[Deploy Website] Firebase not available for estimate:', error.message);
      }

      const { websiteDir } = req.query || {};
      const websitePath = websiteDir || 'website';
      // Normalize path to avoid double /var/task issues
      let fullWebsitePath;
      if (path.isAbsolute(websitePath)) {
        fullWebsitePath = websitePath;
      } else {
        fullWebsitePath = path.join(process.cwd(), websitePath);
      }
      fullWebsitePath = path.normalize(fullWebsitePath);

      // Get changed files
      const { getChangedFiles } = await import('../lib/DeploymentTracker.js');
      const { calculateTotalCost, formatCost } = await import('../lib/ArweaveCostCalculator.js');
      
      const { changedFiles, unchangedFiles, totalFiles } = await getChangedFiles(fullWebsitePath, db);

      // Calculate cost for changed files only
      let costEstimate = null;
      if (changedFiles.length > 0) {
        costEstimate = await calculateTotalCost(changedFiles);
      } else {
        costEstimate = {
          sizeBytes: 0,
          sizeMB: 0,
          sizeKB: 0,
          costAR: 0,
          costUSD: 0,
          costUSDApprox: 0,
          arPriceUSD: 0
        };
      }

      return res.status(200).json({
        success: true,
        cost: costEstimate,
        formatted: formatCost(costEstimate),
        filesChanged: changedFiles.length,
        filesUnchanged: unchangedFiles.length,
        totalFiles: totalFiles
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // Only allow POST for deployment
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    console.log('[Deploy Website] Starting website deployment...');

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();

    const { websiteDir, updateOnly } = req.body || {};
    const websitePath = websiteDir || 'website';
    
    // If updateOnly is true, just sync and regenerate (don't deploy)
    if (updateOnly) {
      const websiteRoot = path.join(process.cwd(), websitePath);
      const websiteArtistsJsonPath = path.join(websiteRoot, 'artists.json');
      const websiteTemplateHtmlPath = path.join(websiteRoot, 'templates', 'artist.html');
      const websiteIndexHtmlPath = path.join(websiteRoot, 'index.html');

      console.log('[Deploy Website] Updating website HTML only (no deployment)...');

      // Sync Firebase to website/artists.json
      console.log('[Deploy Website] Syncing Firebase to website/artists.json...');
      const syncResult = await syncFirebaseToWebsiteJSON(db, websitePath);
      if (!syncResult.success) {
        console.error('[Deploy Website] Sync failed:', syncResult.error);
        throw new Error(`Failed to sync Firebase: ${syncResult.error}`);
      }
      console.log('[Deploy Website] ✅ Synced Firebase');
      
      // Handle /tmp location for artists.json
      let actualArtistsJsonPath = websiteArtistsJsonPath;
      if (syncResult.filePath && syncResult.filePath.startsWith('/tmp')) {
        actualArtistsJsonPath = syncResult.filePath;
        try {
          const fs = await import('fs-extra');
          await fs.copy(actualArtistsJsonPath, websiteArtistsJsonPath);
          console.log('[Deploy Website] Copied artists.json from /tmp');
        } catch (copyError) {
          console.warn('[Deploy Website] Could not copy artists.json:', copyError.message);
        }
      }

      // Regenerate HTML pages
      try {
        // Use lib/WebsitePageGenerator.cjs instead of website/scripts (avoids .vercelignore issues)
        const scriptPath = path.join(process.cwd(), 'lib', 'WebsitePageGenerator.cjs');
        console.log('[Deploy Website] Loading script from:', scriptPath);
        
        const generateScript = require(scriptPath);
        console.log('[Deploy Website] Script loaded, keys:', Object.keys(generateScript));
        
        if (!generateScript) {
          throw new Error('Failed to load generate_artist_pages.js module');
        }
        
        if (typeof generateScript.generatePages !== 'function') {
          console.error('[Deploy Website] Available functions:', Object.keys(generateScript));
          throw new Error(`generatePages function not found. Available: ${Object.keys(generateScript).join(', ')}`);
        }
        
        // Use actual path (might be /tmp)
        console.log('[Deploy Website] Calling generatePages with:', { artistsJson: actualArtistsJsonPath, outputDir: websiteRoot });
        const generateResult = generateScript.generatePages(actualArtistsJsonPath, websiteRoot);
        console.log('[Deploy Website] Generate result:', generateResult);
        
        if (!generateResult || !generateResult.success) {
          const errorMsg = generateResult?.error || 'Unknown error';
          console.error('[Deploy Website] Generate pages error:', errorMsg);
          throw new Error(`Failed to generate HTML pages: ${errorMsg}`);
        }
        console.log('[Deploy Website] ✅ Generated HTML pages');
      } catch (genError) {
        console.error('[Deploy Website] Error requiring or calling generatePages:', genError.message);
        console.error('[Deploy Website] Error stack:', genError.stack);
        throw new Error(`Failed to generate HTML pages: ${genError.message}`);
      }

      return res.status(200).json({
        success: true,
        message: 'Website HTML pages regenerated successfully (no deployment)'
      });
    }

    // Full deployment: sync, regenerate, then deploy
    const websiteRoot = path.join(process.cwd(), websitePath);
    const websiteArtistsJsonPath = path.join(websiteRoot, 'artists.json');
    const websiteTemplateHtmlPath = path.join(websiteRoot, 'templates', 'artist.html');
    const websiteIndexHtmlPath = path.join(websiteRoot, 'index.html');

    // Step 1: Sync Firebase to website/artists.json
    console.log('[Deploy Website] Step 1: Syncing Firebase to website/artists.json...');
    const syncResult = await syncFirebaseToWebsiteJSON(db, websitePath);
    if (!syncResult.success) {
      console.error('[Deploy Website] Sync failed:', syncResult.error);
      throw new Error(`Failed to sync Firebase: ${syncResult.error}`);
    }
    console.log('[Deploy Website] ✅ Synced Firebase to website/artists.json');
    console.log(`[Deploy Website] Artists count: ${syncResult.artistsCount}`);
    console.log(`[Deploy Website] File path: ${syncResult.filePath || 'in-memory'}`);
    
    // Handle artists.json location (might be in /tmp in production)
    let actualArtistsJsonPath = websiteArtistsJsonPath;
    if (syncResult.filePath && syncResult.filePath.startsWith('/tmp')) {
      actualArtistsJsonPath = syncResult.filePath;
      console.log('[Deploy Website] Using artists.json from /tmp');
      
      // Copy to website directory if possible (for generatePages)
      try {
        const fs = await import('fs-extra');
        await fs.copy(actualArtistsJsonPath, websiteArtistsJsonPath);
        console.log('[Deploy Website] Copied artists.json from /tmp to website directory');
      } catch (copyError) {
        console.warn('[Deploy Website] Could not copy artists.json, generatePages may use /tmp version:', copyError.message);
        // generatePages will need to handle /tmp path
        actualArtistsJsonPath = syncResult.filePath;
      }
    }

    // Step 2: Generate HTML pages
    console.log('[Deploy Website] Step 2: Generating HTML pages...');
    try {
      // Use lib/WebsitePageGenerator.cjs instead of website/scripts (avoids .vercelignore issues)
      const generateScriptPath = path.join(process.cwd(), 'lib', 'WebsitePageGenerator.cjs');
      console.log('[Deploy Website] Loading generate script from:', generateScriptPath);
      
      const generateScript = require(generateScriptPath);
      
      if (!generateScript || typeof generateScript.generatePages !== 'function') {
        console.error('[Deploy Website] Available functions:', Object.keys(generateScript || {}));
        throw new Error('generatePages function not found in WebsitePageGenerator.js module');
      }
      
      // In Vercel production, generatePages will write to /tmp/website
      // Pass null to let it auto-detect, or explicitly pass /tmp/website
      const isVercelProduction = process.env.VERCEL === '1' || process.cwd() === '/var/task';
      const actualOutputDir = isVercelProduction ? '/tmp/website' : websiteRoot;
      
      // Use actual path (might be /tmp in production)
      console.log('[Deploy Website] Calling generatePages with artists.json:', actualArtistsJsonPath);
      console.log('[Deploy Website] Output directory:', actualOutputDir);
      
      const generateResult = generateScript.generatePages(actualArtistsJsonPath, actualOutputDir);
      
      if (!generateResult || !generateResult.success) {
        const errorMsg = generateResult?.error || 'Unknown error';
        console.error('[Deploy Website] Generate pages error:', errorMsg);
        throw new Error(`Failed to generate HTML pages: ${errorMsg}`);
      }
      
      console.log('[Deploy Website] ✅ Generated HTML pages');
      console.log(`[Deploy Website] Artist pages generated: ${generateResult.artistPagesGenerated || 'N/A'}`);
      console.log(`[Deploy Website] Index HTML updated: ${generateResult.indexHtmlUpdated || false}`);
    } catch (genError) {
      console.error('[Deploy Website] Error requiring or calling generatePages:', genError.message);
      console.error('[Deploy Website] Error stack:', genError.stack);
      throw new Error(`Failed to generate HTML pages: ${genError.message}`);
    }

    // Step 3: Deploy to Arweave (with database for incremental uploads)
    // Use /tmp/website in production, otherwise use the original websitePath
    const isVercelProduction = process.env.VERCEL === '1' || process.cwd() === '/var/task';
    const actualWebsitePath = isVercelProduction ? '/tmp/website' : websitePath;
    
    console.log('[Deploy Website] Step 3: Deploying website to Arweave...');
    console.log('[Deploy Website] Using website directory:', actualWebsitePath);
    const deployResult = await deployWebsiteToArweave(actualWebsitePath, db);

    if (!deployResult.success) {
      console.error('[Deploy Website] Deployment failed:', deployResult.error);
      return res.status(500).json({
        success: false,
        error: deployResult.error || 'Failed to deploy website',
        filesUploaded: deployResult.filesUploaded || 0,
        step: 'deployment'
      });
    }
    
    console.log('[Deploy Website] ✅ Deployment successful');
    console.log(`[Deploy Website] Manifest ID: ${deployResult.manifestId}`);
    console.log(`[Deploy Website] Website URL: ${deployResult.websiteUrl}`);
    console.log(`[Deploy Website] Files uploaded: ${deployResult.filesUploaded}`);
    console.log(`[Deploy Website] Files unchanged: ${deployResult.filesUnchanged || 0}`);

    return res.status(200).json({
      success: true,
      manifestId: deployResult.manifestId,
      manifestUrl: deployResult.manifestUrl,
      websiteUrl: deployResult.websiteUrl,
      filesUploaded: deployResult.filesUploaded,
      filesUnchanged: deployResult.filesUnchanged || 0,
      totalFiles: deployResult.totalFiles || deployResult.filesUploaded,
      costEstimate: deployResult.costEstimate,
      message: 'Website deployed successfully to Arweave'
    });

  } catch (error) {
    console.error('[Deploy Website] ❌ Error:', error.message);
    console.error('[Deploy Website] Stack:', error.stack);
    const websitePath = req.body?.websiteDir || 'website';
    console.error('[Deploy Website] Error context:', {
      websitePath: websitePath,
      websiteDir: req.body?.websiteDir,
      updateOnly: req.body?.updateOnly,
      method: req.method,
      errorType: error.constructor.name,
      errorMessage: error.message
    });
    
    // Ensure we always return valid JSON
    try {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to deploy website',
        message: error.message || 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } catch (jsonError) {
      // Fallback if JSON.stringify fails
      console.error('[Deploy Website] Failed to send JSON response:', jsonError);
      res.status(500).end(JSON.stringify({ 
        success: false,
        error: 'Failed to deploy website',
        message: error.message || 'Unknown error'
      }));
    }
  }
  } catch (outerError) {
    // Catch any errors in the handler itself (e.g., header setting)
    console.error('[Deploy Website] ❌ Outer error:', outerError.message);
    console.error('[Deploy Website] Outer error context:', {
      errorType: outerError.constructor.name,
      errorMessage: outerError.message,
      stack: outerError.stack
    });
    try {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: outerError.message || 'Unknown error'
      });
    } catch (finalError) {
      // Last resort - send plain text
      console.error('[Deploy Website] ❌ Failed to send error response:', finalError.message);
      res.status(500).end('Internal Server Error');
    }
  }
}

