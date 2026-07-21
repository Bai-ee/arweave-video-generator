/**
 * API endpoint to deploy website to Arweave
 * POST /api/deploy-website
 * 
 * Uploads website files to Arweave and creates a manifest
 * Uses incremental uploads - only uploads changed/new files
 */

import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import { initializeFirebaseAdmin, getFirestore, getStorage } from '../lib/firebase-admin.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import { updateArNSRecord } from '../lib/ArNSUpdater.js';
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import { createRequire } from 'module';

// External-site deploys (HITLOOP Site Recreate): zips may only come from
// HITLOOP's Firebase Storage — this endpoint spends wallet funds.
const EXTERNAL_ZIP_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

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
      
      // Use same path resolution logic as POST endpoint
      let sourceWebsiteRoot;
      if (path.isAbsolute(websitePath)) {
        sourceWebsiteRoot = websitePath;
      } else {
        sourceWebsiteRoot = path.join(process.cwd(), websitePath);
      }
      sourceWebsiteRoot = path.normalize(sourceWebsiteRoot);
      
      // Check if we're in Vercel production
      const isVercelProduction = process.env.VERCEL === '1' && process.env.VERCEL_ENV === 'production';
      
      let workingWebsiteRoot = sourceWebsiteRoot;
      
      // In Vercel, we need to work in /tmp (same as actual deployment)
      if (isVercelProduction) {
        const tempWebsiteRoot = '/tmp/website-estimate';
        console.log(`[Deploy Website Estimate] Copying from ${sourceWebsiteRoot} to ${tempWebsiteRoot}...`);
        await fs.copy(sourceWebsiteRoot, tempWebsiteRoot, { overwrite: true });
        workingWebsiteRoot = tempWebsiteRoot;
      }
      
      const websiteArtistsJsonPath = path.join(workingWebsiteRoot, 'artists.json');
      
      // Step 1: Sync Firebase to artists.json (same as actual deployment)
      const syncResult = await syncFirebaseToWebsiteJSON(db, workingWebsiteRoot);
      if (!syncResult.success) {
        console.warn('[Deploy Website Estimate] Failed to sync Firebase, using existing files:', syncResult.error);
      } else {
        console.log('[Deploy Website Estimate] ✅ Synced Firebase to artists.json');
      }

      // Step 2: Generate HTML pages (same as actual deployment)
      try {
        const generateScriptPath = path.join(process.cwd(), 'lib', 'WebsitePageGenerator.cjs');
        const generateScript = require(generateScriptPath);
        
        if (generateScript && typeof generateScript.generatePages === 'function') {
          const generateResult = generateScript.generatePages(websiteArtistsJsonPath, workingWebsiteRoot);
          if (generateResult && generateResult.success) {
            console.log('[Deploy Website Estimate] ✅ Generated HTML pages');
          } else {
            console.warn('[Deploy Website Estimate] Failed to generate pages, using existing files');
          }
        }
      } catch (genError) {
        console.warn('[Deploy Website Estimate] Could not generate pages, using existing files:', genError.message);
      }

      // Step 3: Get changed files AFTER sync and generation (same as actual deployment)
      const { getChangedFiles } = await import('../lib/DeploymentTracker.js');
      const { calculateTotalCost, formatCost } = await import('../lib/ArweaveCostCalculator.js');
      
      const { changedFiles, unchangedFiles, totalFiles } = await getChangedFiles(workingWebsiteRoot, db);

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

      // Cleanup temp directory if created
      if (isVercelProduction && workingWebsiteRoot !== sourceWebsiteRoot) {
        try {
          await fs.remove(workingWebsiteRoot);
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
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
    // ── External-site mode (HITLOOP Site Recreate) ──────────────────────
    // Body carries zipUrl → download an allowlisted static-site zip, unpack
    // to /tmp, full (non-incremental, db=null) wallet-funded upload + path
    // manifest. Folded into this function because the Hobby plan caps
    // deployments at 12 serverless functions. The `external: true` response
    // marker lets the HITLOOP bridge detect a stale deployment that would
    // otherwise silently deploy OUR microsite instead.
    if (req.body?.zipUrl) {
      const { zipUrl, siteId } = req.body;
      let parsedZipUrl;
      try {
        parsedZipUrl = new URL(zipUrl);
      } catch {
        return res.status(400).json({ success: false, external: true, error: 'zipUrl is not a valid URL' });
      }
      if (parsedZipUrl.protocol !== 'https:' || !EXTERNAL_ZIP_HOSTS.has(parsedZipUrl.hostname)) {
        return res.status(400).json({ success: false, external: true, error: `zip host not allowed: ${parsedZipUrl.hostname}` });
      }
      const safeId = String(siteId || `ext-${Date.now()}`).replace(/[^a-zA-Z0-9_-]+/g, '_');
      const workDir = path.join(os.tmpdir(), `external-site-${safeId}`);
      await fs.remove(workDir);
      await fs.ensureDir(workDir);
      console.log(`[Deploy External Site] Downloading ${zipUrl}`);
      const zipRes = await fetch(zipUrl);
      if (!zipRes.ok) {
        return res.status(400).json({ success: false, external: true, error: `zip download failed (${zipRes.status})` });
      }
      const zipBuffer = Buffer.from(await zipRes.arrayBuffer());
      console.log(`[Deploy External Site] Extracting ${zipBuffer.length} bytes…`);
      new AdmZip(zipBuffer).extractAllTo(workDir, true);
      if (!(await fs.pathExists(path.join(workDir, 'index.html')))) {
        await fs.remove(workDir).catch(() => {});
        return res.status(400).json({ success: false, external: true, error: 'zip has no index.html at its root' });
      }
      console.log(`[Deploy External Site] Deploying ${safeId} to Arweave…`);
      const extResult = await deployWebsiteToArweave(workDir, null);
      await fs.remove(workDir).catch(() => {});
      if (!extResult.success) {
        return res.status(500).json({ success: false, external: true, error: extResult.error || 'deploy failed' });
      }
      return res.status(200).json({
        success: true,
        external: true,
        siteId: safeId,
        manifestId: extResult.manifestId,
        arweaveUrl: extResult.manifestUrl,
        websiteUrl: extResult.websiteUrl,
        fileCount: extResult.totalFiles,
        filesUploaded: extResult.filesUploaded,
        sizeBytes: zipBuffer.length,
      });
    }

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
    
    // In Vercel, process.cwd() is /var/task, but website files might be in a different location
    // Try multiple possible locations
    let sourceWebsiteRoot = path.join(process.cwd(), websitePath);
    if (isVercelProduction) {
      // Check if website exists at process.cwd()/website
      const testPath = path.join(process.cwd(), websitePath);
      if (!await fs.pathExists(testPath)) {
        // Try alternative locations
        const altPaths = [
          path.join('/var/task', websitePath),
          path.join(process.cwd(), '..', websitePath),
          websitePath // If it's already absolute
        ];
        for (const altPath of altPaths) {
          if (await fs.pathExists(altPath)) {
            sourceWebsiteRoot = altPath;
            console.log(`[Deploy Website] Found website at alternative path: ${altPath}`);
            break;
          }
        }
      }
      console.log(`[Deploy Website] Using source website path: ${sourceWebsiteRoot}`);
    } else {
      sourceWebsiteRoot = path.join(process.cwd(), websitePath);
    }
    
    // In Vercel, /var/task is read-only but /tmp is writable
    // Copy website to /tmp, sync Firebase, regenerate HTML, then deploy from there
    let workingWebsiteRoot = sourceWebsiteRoot;
    let workingWebsitePath = websitePath;
    
    if (isVercelProduction) {
      console.log('[Deploy Website] Vercel production detected - using /tmp for sync/regeneration');
      
      // Verify source files exist before copying — all committed in website/
      // (fonts/css/js ship with the repo; nothing is fetched from Firebase)
      const criticalFiles = [
        'css/site.css',
        'js/player.js',
        'fonts/ibm-plex-mono-v20-latin-regular.woff2',
        'fonts/special-elite-v20-latin-regular.woff2',
        'fonts/mr-dafoe-v15-latin-regular.woff2',
        'templates/index.html'
      ];
      console.log(`[Deploy Website] Checking source files in ${sourceWebsiteRoot}...`);
      for (const criticalFile of criticalFiles) {
        const sourcePath = path.join(sourceWebsiteRoot, criticalFile);
        const exists = await fs.pathExists(sourcePath);
        if (exists) {
          const stats = await fs.stat(sourcePath);
          console.log(`[Deploy Website] ✅ Source file exists: ${criticalFile} (${(stats.size / 1024).toFixed(1)} KB)`);
        } else {
          console.error(`[Deploy Website] ❌ Source file MISSING: ${criticalFile} at ${sourcePath}`);
        }
      }
      
      // Copy website folder to /tmp
      const tempWebsiteRoot = '/tmp/website';
      console.log(`[Deploy Website] Copying from ${sourceWebsiteRoot} to ${tempWebsiteRoot}...`);
      await fs.copy(sourceWebsiteRoot, tempWebsiteRoot, { overwrite: true });
      console.log(`[Deploy Website] Copy operation completed`);
      
      // Verify critical files were copied
      console.log(`[Deploy Website] Verifying files copied to /tmp...`);
      const missingFiles = [];
      for (const criticalFile of criticalFiles) {
        const copiedPath = path.join(tempWebsiteRoot, criticalFile);
        const exists = await fs.pathExists(copiedPath);
        if (exists) {
          const stats = await fs.stat(copiedPath);
          console.log(`[Deploy Website] ✅ Verified ${criticalFile} copied to /tmp (${(stats.size / 1024).toFixed(1)} KB)`);
        } else {
          console.warn(`[Deploy Website] ⚠️ ${criticalFile} NOT copied to /tmp - will download from Firebase Storage`);
          missingFiles.push(criticalFile);
        }
      }
      
      // Download missing critical files from Firebase Storage
      if (missingFiles.length > 0) {
        console.log(`[Deploy Website] Downloading ${missingFiles.length} missing file(s) from Firebase Storage...`);
        try {
          const storage = getStorage();
          const bucket = storage.bucket();
          
          // Map critical files to their Firebase Storage paths. Redesign
          // assets are all committed in website/, so this map is normally
          // empty — the fallback tries the same path in Storage.
          const fileMappings = {};
          
          for (const criticalFile of missingFiles) {
            const destPath = path.join(tempWebsiteRoot, criticalFile);
            await fs.ensureDir(path.dirname(destPath));
            
            const possiblePaths = fileMappings[criticalFile] || [criticalFile];
            let downloaded = false;
            
            for (const tryPath of possiblePaths) {
              try {
                const file = bucket.file(tryPath);
                const [exists] = await file.exists();
                if (exists) {
                  await file.download({ destination: destPath });
                  const stats = await fs.stat(destPath);
                  console.log(`[Deploy Website] ✅ Downloaded ${criticalFile} from Firebase: ${tryPath} (${(stats.size / 1024).toFixed(1)} KB)`);
                  downloaded = true;
                  break;
                }
              } catch (err) {
                // Try next path
                continue;
              }
            }
            
            if (!downloaded) {
              console.error(`[Deploy Website] ❌ Could not find ${criticalFile} in Firebase Storage`);
              console.error(`[Deploy Website] Tried paths: ${possiblePaths.join(', ')}`);
            }
          }
        } catch (storageError) {
          console.error(`[Deploy Website] ❌ Firebase Storage error:`, storageError.message);
        }
      }
      
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

    // Step 4: Update ArNS record (non-blocking - deployment succeeds even if ArNS update fails)
    let arnsResult = null;
    try {
      console.log('[Deploy Website] Updating ArNS record...');
      arnsResult = await updateArNSRecord(deployResult.manifestId);
      if (arnsResult.success) {
        console.log('[Deploy Website] ✅ ArNS record updated:', arnsResult.arnsUrl);
      } else {
        console.warn('[Deploy Website] ⚠️ ArNS update failed (non-blocking):', arnsResult.error);
      }
    } catch (arnsError) {
      console.warn('[Deploy Website] ⚠️ ArNS update error (non-blocking):', arnsError.message);
      // Continue with deployment success response even if ArNS fails
    }

    return res.status(200).json({
      success: true,
      manifestId: deployResult.manifestId,
      manifestUrl: deployResult.manifestUrl,
      websiteUrl: deployResult.websiteUrl,
      arnsUrl: arnsResult?.success ? arnsResult.arnsUrl : null,
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

