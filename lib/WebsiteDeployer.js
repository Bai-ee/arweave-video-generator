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
 * Get all files to upload from website directory
 * @param {string} websiteDir - Path to website directory
 * @returns {Promise<Array>} Array of file paths relative to website directory
 */
export async function collectWebsiteFiles(websiteDir) {
  const files = [];
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
    /tasks/,
    /archive/,
    /active/,
    /data\//,
    /scripts\//,
    /templates\//,
    /prd\.txt/,
    /README/,
    /\.project-rules/,
    // Note: artists.json is included - it's needed for the website
  ];

  async function walkDir(dir, baseDir = websiteDir) {
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
  }

  await walkDir(websiteDir);
  return files;
}

/**
 * Deploy website to Arweave
 * @param {string} websiteDir - Path to website directory (default: 'website')
 * @param {Object} db - Firestore database instance (optional, for incremental uploads)
 * @returns {Promise<Object>} Deployment result with manifest ID and URL
 */
export async function deployWebsiteToArweave(websiteDir = 'website', db = null) {
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

    // Create manifest
    console.log('[WebsiteDeployer] Creating manifest...');
    const manifest = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      index: 'index.html',
      paths: {}
    };

    // Build manifest from all files (changed + unchanged)
    uploadResults.forEach(result => {
      manifest.paths[result.path] = {
        id: result.transactionId
      };
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

