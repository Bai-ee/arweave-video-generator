/**
 * Website Deployer Module
 * Uploads website files to Arweave and creates a manifest
 * Uses incremental uploads - only uploads changed/new files
 */

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { uploadToArweave } from './ArweaveUploader.js';
import { getChangedFiles, saveManifest } from './DeploymentTracker.js';
import { calculateTotalCost, formatCost } from './ArweaveCostCalculator.js';

/**
 * Get all files to upload from website directory
 * @param {string} websiteDir - Path to website directory
 * @returns {Promise<Array>} Array of file paths relative to website directory
 */
export async function collectWebsiteFiles(websiteDir) {
  console.log(`[WebsiteDeployer] Starting file collection from: ${websiteDir}`);
  const files = [];
  const ignoredFiles = [];
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
        ignoredFiles.push(relativePath);
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
        } else {
          ignoredFiles.push(relativePath);
        }
      }
    }
  }

  await walkDir(websiteDir);
  
  // Log collection results
  console.log(`[WebsiteDeployer] File collection complete:`);
  console.log(`  - Collected: ${files.length} files`);
  console.log(`  - Ignored: ${ignoredFiles.length} files`);
  
  // Validate required files
  const hasIndexHtml = files.some(f => f === 'index.html' || f.endsWith('/index.html'));
  const hasArtistsJson = files.some(f => f === 'artists.json' || f.endsWith('/artists.json'));
  
  if (!hasIndexHtml) {
    console.warn('[WebsiteDeployer] ⚠️ index.html not found in collected files');
    console.warn('[WebsiteDeployer] Collected HTML files:', files.filter(f => f.endsWith('.html')));
  } else {
    console.log('[WebsiteDeployer] ✅ Found index.html');
  }
  
  if (!hasArtistsJson) {
    console.warn('[WebsiteDeployer] ⚠️ artists.json not found in collected files');
  } else {
    console.log('[WebsiteDeployer] ✅ Found artists.json');
  }
  
  // Log sample of collected files (first 10)
  if (files.length > 0) {
    console.log(`[WebsiteDeployer] Sample files (first 10):`, files.slice(0, 10));
  }
  
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
      console.error('[WebsiteDeployer] ❌ Website directory not found:', fullWebsitePath);
      console.error('[WebsiteDeployer] Context:', {
        websiteDir,
        processCwd: process.cwd(),
        isAbsolute: path.isAbsolute(websiteDir),
        resolvedPath: fullWebsitePath
      });
      throw new Error(`Website directory not found: ${fullWebsitePath}`);
    }

    // Try incremental upload first, fall back to full upload if it fails
    let changedFiles = [];
    let unchangedFiles = [];
    let deletedFiles = [];
    let totalFiles = 0;
    let useIncremental = true;
    
    try {
      // Get changed files only (incremental upload)
      console.log('[WebsiteDeployer] Analyzing files for changes...');
      const analysisResult = await getChangedFiles(fullWebsitePath, db);
      changedFiles = analysisResult.changedFiles;
      unchangedFiles = analysisResult.unchangedFiles;
      deletedFiles = analysisResult.deletedFiles;
      totalFiles = analysisResult.totalFiles;
      
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
    } catch (incrementalError) {
      console.error('[WebsiteDeployer] ⚠️ Incremental upload analysis failed:', incrementalError.message);
      console.error('[WebsiteDeployer] Error context:', {
        websitePath: fullWebsitePath,
        hasDb: !!db,
        error: incrementalError.message,
        stack: incrementalError.stack
      });
      console.log('[WebsiteDeployer] 🔄 Falling back to full upload (uploading all files)...');
      useIncremental = false;
      
      // Fall back to full upload - collect all files
      const allFiles = await collectWebsiteFiles(fullWebsitePath);
      totalFiles = allFiles.length;
      
      if (totalFiles === 0) {
        throw new Error('No files found in website directory');
      }
      
      // Convert all files to changedFiles format (treat all as new)
      changedFiles = [];
      unchangedFiles = [];
      
      for (const filePath of allFiles) {
        const fullPath = path.join(fullWebsitePath, filePath);
        try {
          const fileBuffer = await fs.readFile(fullPath);
          const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
          
          changedFiles.push({
            path: filePath.replace(/\\/g, '/'), // Normalize path
            fullPath: fullPath,
            buffer: fileBuffer,
            hash: fileHash,
            size: fileBuffer.length,
            isNew: true
          });
        } catch (fileError) {
          console.error(`[WebsiteDeployer] Error reading ${filePath}:`, fileError.message);
          // Skip files we can't read
        }
      }
      
      console.log(`[WebsiteDeployer] Full upload mode: ${changedFiles.length} files to upload`);
      if (changedFiles.length > 0) {
        const costEstimate = await calculateTotalCost(changedFiles);
        console.log(`[WebsiteDeployer] Cost estimate: ${formatCost(costEstimate)}`);
      }
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
            console.log(`[WebsiteDeployer] ✅ Uploaded ${file.path} -> ${uploadResult.transactionId}`);
            return {
              path: file.path,
              transactionId: uploadResult.transactionId,
              arweaveUrl: uploadResult.arweaveUrl,
              fileSize: file.size,
              hash: file.hash,
              unchanged: false
            };
          } catch (error) {
            console.error(`[WebsiteDeployer] ❌ Failed to upload ${file.path}:`, error.message);
            console.error(`[WebsiteDeployer] Error context:`, {
              filePath: file.path,
              fileSize: file.size,
              hasBuffer: !!file.buffer,
              isNew: file.isNew,
              error: error.message,
              stack: error.stack
            });
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
      paths: {}
    };

    // Build manifest from all files (changed + unchanged)
    uploadResults.forEach(result => {
      manifest.paths[result.path] = {
        id: result.transactionId
      };
    });
    
    // Validate and set index (must be object format: { path: 'index.html' })
    const indexPath = 'index.html';
    const indexResult = uploadResults.find(r => r.path === indexPath);
    
    if (indexResult) {
      manifest.index = { path: indexPath };
      console.log(`[WebsiteDeployer] ✅ Found index.html, setting as manifest index`);
    } else {
      // Fallback to first HTML file
      const firstHtml = uploadResults.find(r => r.path.endsWith('.html'));
      if (firstHtml) {
        manifest.index = { path: firstHtml.path };
        console.warn(`[WebsiteDeployer] ⚠️ index.html not found, using ${firstHtml.path} as index`);
      } else {
        throw new Error('No HTML files found in upload results - cannot create valid manifest');
      }
    }
    
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
      try {
        await saveManifest(db, newManifest);
        console.log('[WebsiteDeployer] ✅ Saved deployment manifest to Firebase');
      } catch (manifestSaveError) {
        console.warn('[WebsiteDeployer] ⚠️ Failed to save manifest to Firebase:', manifestSaveError.message);
        // Don't fail deployment if manifest save fails
      }
    }

    // Log manifest before upload for debugging
    console.log('[WebsiteDeployer] Manifest to upload:');
    console.log(JSON.stringify(manifest, null, 2));
    console.log(`[WebsiteDeployer] Total paths: ${Object.keys(manifest.paths).length}`);
    console.log(`[WebsiteDeployer] Index: ${JSON.stringify(manifest.index)}`);
    
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
      console.error('[WebsiteDeployer] ❌ Manifest upload failed:', manifestUploadResult.error);
      console.error('[WebsiteDeployer] Manifest context:', {
        manifestSize: manifestBuffer.length,
        pathsCount: Object.keys(manifest.paths).length,
        hasIndex: !!manifest.index,
        indexPath: manifest.index?.path
      });
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
    console.error('[WebsiteDeployer] ❌ Error deploying website:', error.message);
    console.error('[WebsiteDeployer] Error stack:', error.stack);
    console.error('[WebsiteDeployer] Error context:', {
      websiteDir,
      hasDb: !!db,
      errorType: error.constructor.name,
      errorMessage: error.message
    });
    return {
      success: false,
      error: error.message,
      filesUploaded: 0
    };
  }
}

