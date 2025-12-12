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
import fs from 'fs-extra';
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
      const isVercelProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
      
      if (isVercelProduction) {
        // In Vercel, we can't write files - this operation needs to be done locally
        return res.status(400).json({
          success: false,
          error: 'Cannot regenerate website in Vercel production (read-only filesystem)',
          message: 'Run this operation locally: sync Firebase and generate pages, then commit changes'
        });
      }
      
      const websiteRoot = path.join(process.cwd(), websitePath);
      const websiteArtistsJsonPath = path.join(websiteRoot, 'artists.json');

      console.log('[Deploy Website] Updating website HTML only (no deployment)...');

      // Sync Firebase to website/artists.json
      const syncResult = await syncFirebaseToWebsiteJSON(db, websitePath);
      if (!syncResult.success) {
        throw new Error(`Failed to sync Firebase: ${syncResult.error}`);
      }

      // Regenerate HTML pages - use lib/WebsitePageGenerator.cjs (NOT website/scripts/)
      try {
        const scriptPath = path.join(process.cwd(), 'lib', 'WebsitePageGenerator.cjs');
        console.log('[Deploy Website] Loading script from:', scriptPath);
        
        const generateScript = require(scriptPath);
        console.log('[Deploy Website] Script loaded, keys:', Object.keys(generateScript));
        
        if (!generateScript) {
          throw new Error('Failed to load WebsitePageGenerator.cjs module');
        }
        
        if (typeof generateScript.generatePages !== 'function') {
          console.error('[Deploy Website] Available functions:', Object.keys(generateScript));
          throw new Error(`generatePages function not found. Available: ${Object.keys(generateScript).join(', ')}`);
        }
        
        // generatePages can take optional params, but defaults work if paths are correct
        console.log('[Deploy Website] Calling generatePages with:', { artistsJson: websiteArtistsJsonPath, outputDir: websiteRoot });
        const generateResult = generateScript.generatePages(websiteArtistsJsonPath, websiteRoot);
        console.log('[Deploy Website] Generate result:', generateResult);
        
        if (!generateResult || !generateResult.success) {
          const errorMsg = generateResult?.error || 'Unknown error';
          console.error('[Deploy Website] Generate pages error:', errorMsg);
          throw new Error(`Failed to generate HTML pages: ${errorMsg}`);
        }
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
    const isVercelProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    const sourceWebsiteRoot = path.join(process.cwd(), websitePath);
    
    // In Vercel, /var/task is read-only but /tmp is writable
    // Copy website to /tmp, sync Firebase, regenerate HTML, then deploy from there
    let workingWebsiteRoot = sourceWebsiteRoot;
    let workingWebsitePath = websitePath;
    
    if (isVercelProduction) {
      console.log('[Deploy Website] Vercel production detected - using /tmp for sync/regeneration');
      
      // Copy website folder to /tmp
      const tempWebsiteRoot = '/tmp/website';
      await fs.copy(sourceWebsiteRoot, tempWebsiteRoot, { overwrite: true });
      console.log(`[Deploy Website] Copied website to ${tempWebsiteRoot}`);
      
      workingWebsiteRoot = tempWebsiteRoot;
      workingWebsitePath = tempWebsiteRoot;
    }
    
    const websiteArtistsJsonPath = path.join(workingWebsiteRoot, 'artists.json');
    
    // Step 1: Sync Firebase to artists.json (works in both /tmp and local)
    const syncResult = await syncFirebaseToWebsiteJSON(db, workingWebsitePath);
    if (!syncResult.success) {
      throw new Error(`Failed to sync Firebase: ${syncResult.error}`);
    }
    console.log('[Deploy Website] ✅ Synced Firebase to artists.json');

    // Step 2: Generate HTML pages
    try {
      // Use lib/WebsitePageGenerator.cjs (NOT website/scripts/) to avoid .vercelignore issues
      const generateScriptPath = path.join(process.cwd(), 'lib', 'WebsitePageGenerator.cjs');
      console.log('[Deploy Website] Loading generate script from:', generateScriptPath);
      
      const generateScript = require(generateScriptPath);
      
      if (!generateScript || typeof generateScript.generatePages !== 'function') {
        console.error('[Deploy Website] Available functions:', Object.keys(generateScript || {}));
        throw new Error('generatePages function not found in WebsitePageGenerator.cjs module');
      }
      
      // Generate pages in the working directory (either /tmp or local)
      console.log('[Deploy Website] Calling generatePages with:', { artistsJson: websiteArtistsJsonPath, outputDir: workingWebsiteRoot });
      const generateResult = generateScript.generatePages(websiteArtistsJsonPath, workingWebsiteRoot);
      
      if (!generateResult || !generateResult.success) {
        const errorMsg = generateResult?.error || 'Unknown error';
        console.error('[Deploy Website] Generate pages error:', errorMsg);
        throw new Error(`Failed to generate HTML pages: ${errorMsg}`);
      }
      console.log('[Deploy Website] ✅ Generated HTML pages');
    } catch (genError) {
      console.error('[Deploy Website] Error requiring or calling generatePages:', genError.message);
      throw new Error(`Failed to generate HTML pages: ${genError.message}`);
    }

    // Step 3: Deploy to Arweave from the working directory
    const deployResult = await deployWebsiteToArweave(workingWebsitePath, db);

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
      filesUnchanged: deployResult.filesUnchanged || 0,
      totalFiles: deployResult.totalFiles || deployResult.filesUploaded,
      costEstimate: deployResult.costEstimate,
      message: 'Website deployed successfully to Arweave'
    });

  } catch (error) {
    console.error('[Deploy Website] Error:', error.message);
    console.error('[Deploy Website] Stack:', error.stack);
    
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
    console.error('[Deploy Website] Outer error:', outerError.message);
    try {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: outerError.message || 'Unknown error'
      });
    } catch (finalError) {
      // Last resort - send plain text
      res.status(500).end('Internal Server Error');
    }
  }
}

