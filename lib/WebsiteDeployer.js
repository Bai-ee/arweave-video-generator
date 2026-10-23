/**
 * Website Deployer Module
 * Uploads website files to Arweave and creates a manifest
 * Uses incremental uploads - only uploads changed/new files
 */

import fs from 'fs-extra';
import path from 'path';
import { uploadToArweave } from './ArweaveUploader.js';
import { getChangedFiles, saveManifest } from './DeploymentTracker.js';
import { calculateTotalCost, formatCost } from './ArweaveCostCalculator.js';

/**
 * Paths that MUST be present in every deployed manifest.
 *
 * A manifest missing any of these produces a live site with a broken stylesheet,
 * a dead player, or an unstyled page, so a miss is a hard deploy failure — not a
 * console warning. Keep this list in sync with what the generated pages actually
 * load; `tests/deploy-manifest-coverage.test.mjs` asserts every entry exists on
 * disk, so a stale entry fails the suite instead of printing a phantom error at
 * deploy time (a hardcoded `fonts/mr-dafoe-*.woff2` did exactly that for months).
 */
export const REQUIRED_MANIFEST_PATHS = [
  // Entry + core pages
  'index.html',
  'archive.html',
  'about.html',
  'residents.html',
  'artists.json',
  // Styles
  'css/site.css',
  // Runtime: boot loader, player core/UI, and the playability modules.
  // boot.js is the only script tag on a page; everything else is loaded by it,
  // so a missing module here fails silently in the browser.
  'js/boot.js',
  'js/player-core.js',
  'js/player.js',
  'js/ue-warm.js',
  'js/ue-host-pref.js',
  'js/ue-links.js',
  'js/ue-resume.js',
  'js/ue-mediasession.js',
  'js/ue-analytics.js',
  // Self-hosted fonts (every face referenced by css/site.css)
  'fonts/gately-v1-regular.woff2',
  'fonts/rationale-v1-regular.woff2',
  'fonts/special-elite-v20-latin-regular.woff2',
  'fonts/ibm-plex-mono-v20-latin-regular.woff2',
  'fonts/ibm-plex-mono-v20-latin-500.woff2',
  'fonts/ibm-plex-mono-v20-latin-700.woff2',
  // Brand imagery used by the header/hero on every page
  'img/ue-logo-horiz.png',
  'img/digging-hero.jpg',
  'img/digging-hero.webp',
  // The white wordmark is on EVERY page (footer), every artist portrait, and
  // the homepage hero's branded plate — but it was never gated, so a deploy
  // that dropped it would have shipped green with a missing logo sitewide.
  'img/ue-white-horiz.png',
  // The cover fallback: what the player bar and any imageless mix/artist card
  // render instead of artwork. Referenced from generated markup, so its absence
  // is a broken image rather than a missing decoration.
  'img/square-ue.png'
];

/**
 * Assert that a set of deployable paths covers REQUIRED_MANIFEST_PATHS.
 * @param {string[]} paths - collected/manifest paths, relative to the website root
 * @param {string} stage - label used in the thrown message
 * @returns {string[]} the required paths, for logging
 */
export function assertRequiredPaths(paths, stage) {
  const present = new Set(paths.map(p => String(p).replace(/\\/g, '/')));
  const missing = REQUIRED_MANIFEST_PATHS.filter(p => !present.has(p));
  if (missing.length > 0) {
    throw new Error(
      `[WebsiteDeployer] Refusing to deploy: ${missing.length} required path(s) absent from ${stage}: ${missing.join(', ')}`
    );
  }
  return REQUIRED_MANIFEST_PATHS;
}

/**
 * Get all files to upload from website directory
 * @param {string} websiteDir - Path to website directory
 * @returns {Promise<Array>} Array of file paths relative to website directory
 */
export async function collectWebsiteFiles(websiteDir) {
  const files = [];
  // Directory patterns are anchored to the website root so page names that
  // merely contain these words (archive.html, about.html…) still deploy.
  const ignorePatterns = [
    /node_modules/,
    /\.git/,
    /\.DS_Store/,
    /\.env/,
    /\.log$/,
    /\.md$/,
    /\.vscode/,
    /\.idea/,
    /\.cursor/,
    /^tasks(\/|$)/,
    /^archive(\/|$)/,
    /^active(\/|$)/,
    /^data(\/|$)/,
    /^scripts(\/|$)/,
    /^templates(\/|$)/,
    /^v1(\/|$)/,
    /^prd\.txt$/,
    /^README/,
    /^new-artist-template\.json$/,
    /\.project-rules/,
    // Note: artists.json is included - it's needed for the website
  ];

  async function walkDir(dir, baseDir = websiteDir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);
        
        // Check ignore patterns
        const shouldIgnore = ignorePatterns.some(pattern => pattern.test(relativePath));
        if (shouldIgnore) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await walkDir(fullPath, baseDir);
        } else if (entry.isFile()) {
          // Only include common web file types
          const ext = path.extname(entry.name).toLowerCase();
          const webExtensions = ['.html', '.css', '.js', '.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.ttf', '.woff', '.woff2', '.eot', '.json'];
          if (webExtensions.includes(ext)) {
            files.push(relativePath);
          }
        }
      }
    } catch (error) {
      console.error(`[collectWebsiteFiles] Error walking directory ${dir}:`, error.message);
      throw error;
    }
  }

  await walkDir(websiteDir);
  return files;
}

/**
 * Deploy website to Arweave
 * @param {string} websiteDir - Path to website directory (default: 'website')
 * @param {Object} db - Firestore database instance (optional, for incremental uploads)
 * @param {Object} [options]
 * @param {boolean} [options.requireUEPaths=true] - enforce REQUIRED_MANIFEST_PATHS.
 *   Must be false for external-site deploys (HITLOOP Site Recreate zips), which are
 *   arbitrary third-party static sites and legitimately have none of our runtime files.
 * @returns {Promise<Object>} Deployment result with manifest ID and URL
 */
export async function deployWebsiteToArweave(websiteDir = 'website', db = null, options = {}) {
  const { requireUEPaths = true } = options;
  try {
    console.log('[WebsiteDeployer] Starting website deployment to Arweave...');
    
    // Normalize path to avoid double /var/task issues
    let fullWebsitePath;
    if (path.isAbsolute(websiteDir)) {
      fullWebsitePath = websiteDir;
    } else {
      fullWebsitePath = path.join(process.cwd(), websiteDir);
    }
    fullWebsitePath = path.normalize(fullWebsitePath);
    
    console.log(`[WebsiteDeployer] Resolved website path: ${fullWebsitePath}`);
    console.log(`[WebsiteDeployer] process.cwd(): ${process.cwd()}`);
    
    if (!await fs.pathExists(fullWebsitePath)) {
      throw new Error(`Website directory not found: ${fullWebsitePath}`);
    }

    // Get changed files only (incremental upload)
    console.log('[WebsiteDeployer] Analyzing files for changes...');
    const { changedFiles, unchangedFiles, deletedFiles, totalFiles } = await getChangedFiles(fullWebsitePath, db);
    
    console.log(`[WebsiteDeployer] Found ${totalFiles} total files:`);
    console.log(`  - Changed/New: ${changedFiles.length}`);
    console.log(`  - Unchanged: ${unchangedFiles.length}`);
    console.log(`  - Deleted: ${deletedFiles.length}`);
    
    // Verify every required file was collected. This throws — a manifest that is
    // missing the stylesheet, a player module or a font produces a visibly broken
    // live site, and the old warn-only version let that ship silently.
    const allFiles = [...changedFiles.map(f => f.path), ...unchangedFiles.map(f => f.path)];
    if (requireUEPaths) {
      console.log(`[WebsiteDeployer] Checking ${REQUIRED_MANIFEST_PATHS.length} required files against ${allFiles.length} collected files...`);
      assertRequiredPaths(allFiles, 'the collected file set');
      console.log(`[WebsiteDeployer] ✅ All ${REQUIRED_MANIFEST_PATHS.length} required files collected`);
    } else {
      console.log(`[WebsiteDeployer] External-site deploy — skipping UE required-path gate (${allFiles.length} files)`);
    }


    // Calculate cost estimate for changed files
    if (changedFiles.length > 0) {
      const costEstimate = await calculateTotalCost(changedFiles);
      console.log(`[WebsiteDeployer] Cost estimate: ${formatCost(costEstimate)}`);
    } else {
      console.log('[WebsiteDeployer] No files to upload (all unchanged)');
    }

    if (totalFiles === 0) {
      throw new Error('No files found in website directory');
    }

    // Helper function to get content type
    function getContentType(filePath) {
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.ttf': 'font/ttf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.eot': 'application/vnd.ms-fontobject'
      };
      return contentTypes[ext] || 'application/octet-stream';
    }

    // Start with unchanged files (reuse transaction IDs)
    const uploadResults = [];
    
    unchangedFiles.forEach(file => {
      uploadResults.push({
        path: file.path,
        transactionId: file.transactionId,
        arweaveUrl: `https://arweave.net/${file.transactionId}`,
        fileSize: file.size,
        unchanged: true
      });
    });

    // Upload changed files in batches
    if (changedFiles.length > 0) {
      const batchSize = 10;
      let uploadedCount = 0;
      
      for (let i = 0; i < changedFiles.length; i += batchSize) {
        const batch = changedFiles.slice(i, i + batchSize);
        console.log(`[WebsiteDeployer] Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(changedFiles.length / batchSize)} (${batch.length} files)...`);
        
        const batchPromises = batch.map(async (file) => {
          try {
            if (file.error) {
              throw new Error(`File read error: ${file.error}`);
            }
            
            const fileName = path.basename(file.path);
            const contentType = getContentType(file.path);
            
            console.log(`[WebsiteDeployer] Uploading: ${file.path} (${(file.size / 1024).toFixed(2)} KB) ${file.isNew ? '[NEW]' : '[CHANGED]'}`);
            
            const uploadResult = await uploadToArweave(file.buffer, fileName, {
              contentType: contentType,
              metadata: {
                websiteFile: file.path,
                deployment: new Date().toISOString(),
                fileHash: file.hash
              }
            });

            if (!uploadResult.success) {
              throw new Error(uploadResult.error || 'Upload failed');
            }

            uploadedCount++;
            return {
              path: file.path,
              transactionId: uploadResult.transactionId,
              arweaveUrl: uploadResult.arweaveUrl,
              fileSize: file.size,
              hash: file.hash,
              unchanged: false
            };
          } catch (error) {
            console.error(`[WebsiteDeployer] Failed to upload ${file.path}:`, error.message);
            throw error;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        uploadResults.push(...batchResults);
        
        // Small delay between batches to avoid rate limiting
        if (i + batchSize < changedFiles.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`[WebsiteDeployer] ✅ Uploaded ${uploadedCount} changed files`);
    } else {
      console.log(`[WebsiteDeployer] ✅ No files to upload (all ${unchangedFiles.length} files unchanged)`);
    }
    
    console.log(`[WebsiteDeployer] ✅ Total files in manifest: ${uploadResults.length}`);

    // Second gate: the uploaded set must still cover every required path. This
    // runs after upload but before the manifest transaction is written, so a
    // partial upload can never be published as a manifest.
    if (requireUEPaths) {
      assertRequiredPaths(uploadResults.map(r => r.path), 'the uploaded result set');
      console.log(`[WebsiteDeployer] ✅ All ${REQUIRED_MANIFEST_PATHS.length} required resources present in the upload set`);
    }

    // Create manifest
    console.log('[WebsiteDeployer] Creating manifest...');
    const manifest = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      index: 'index.html',
      paths: {}
    };

    // Build manifest from all files (changed + unchanged)
    // Normalize paths to use forward slashes for Arweave manifest
    uploadResults.forEach(result => {
      const normalizedPath = result.path.replace(/\\/g, '/');
      manifest.paths[normalizedPath] = {
        id: result.transactionId
      };
    });
    
    // Log manifest summary for debugging
    console.log(`[WebsiteDeployer] Manifest contains ${Object.keys(manifest.paths).length} paths`);
    const criticalPaths = ['index.html', 'css/site.css', 'js/player.js', 'artists.json'];
    console.log('[WebsiteDeployer] Critical paths in manifest:');
    criticalPaths.forEach(criticalPath => {
      if (manifest.paths[criticalPath]) {
        console.log(`  ✅ ${criticalPath} -> ${manifest.paths[criticalPath].id}`);
      } else {
        console.log(`  ❌ ${criticalPath} -> MISSING`);
      }
    });
    
    // Save new manifest for next deployment
    const newManifest = {};
    uploadResults.forEach(result => {
      // Find the hash for this file
      const changedFile = changedFiles.find(f => f.path === result.path);
      const unchangedFile = unchangedFiles.find(f => f.path === result.path);
      
      newManifest[result.path] = {
        transactionId: result.transactionId,
        hash: changedFile?.hash || unchangedFile?.hash || null,
        lastModified: new Date().toISOString(),
        fileSize: result.fileSize
      };
    });
    
    // Save manifest to Firebase if database is available
    if (db) {
      await saveManifest(db, newManifest);
    }

    // Upload manifest
    console.log('[WebsiteDeployer] Uploading manifest...');
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestBuffer = Buffer.from(manifestJson, 'utf-8');
    
    const manifestUploadResult = await uploadToArweave(manifestBuffer, 'manifest.json', {
      contentType: 'application/x.arweave-manifest+json',
      metadata: {
        type: 'website-manifest',
        filesCount: uploadResults.length,
        deployment: new Date().toISOString()
      }
    });

    if (!manifestUploadResult.success) {
      throw new Error(`Failed to upload manifest: ${manifestUploadResult.error}`);
    }

    const manifestId = manifestUploadResult.transactionId;
    const manifestUrl = `https://arweave.net/${manifestId}`;
    // For manifest-hosted sites, explicitly include /index.html in the URL
    const websiteUrl = `https://arweave.net/${manifestId}/index.html`;

    console.log(`[WebsiteDeployer] ✅ Manifest uploaded: ${manifestId}`);
    console.log(`[WebsiteDeployer] 🌐 Website URL: ${websiteUrl}`);

    // Calculate final cost
    let finalCost = null;
    if (changedFiles.length > 0) {
      finalCost = await calculateTotalCost(changedFiles);
    }
    
    return {
      success: true,
      manifestId: manifestId,
      manifestUrl: manifestUrl,
      websiteUrl: websiteUrl,
      filesUploaded: changedFiles.length,
      filesUnchanged: unchangedFiles.length,
      totalFiles: uploadResults.length,
      costEstimate: finalCost,
      manifest: manifest
    };

  } catch (error) {
    console.error('[WebsiteDeployer] Error deploying website:', error.message);
    return {
      success: false,
      error: error.message,
      filesUploaded: 0
    };
  }
}

