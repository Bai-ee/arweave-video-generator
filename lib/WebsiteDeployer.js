/**
 * Website Deployer Module
 * Uploads all website files to Arweave and creates a manifest
 */

import fs from 'fs-extra';
import path from 'path';
import { uploadToArweave } from './ArweaveUploader.js';

/**
 * Get all files to upload from website directory
 * @param {string} websiteDir - Path to website directory
 * @returns {Promise<Array>} Array of file paths relative to website directory
 */
async function collectWebsiteFiles(websiteDir) {
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
 * @returns {Promise<Object>} Deployment result with manifest ID and URL
 */
export async function deployWebsiteToArweave(websiteDir = 'website') {
  try {
    console.log('[WebsiteDeployer] Starting website deployment to Arweave...');
    
    const fullWebsitePath = path.join(process.cwd(), websiteDir);
    
    if (!await fs.pathExists(fullWebsitePath)) {
      throw new Error(`Website directory not found: ${fullWebsitePath}`);
    }

    // Collect all files to upload
    console.log('[WebsiteDeployer] Collecting website files...');
    const files = await collectWebsiteFiles(fullWebsitePath);
    console.log(`[WebsiteDeployer] Found ${files.length} files to upload`);

    if (files.length === 0) {
      throw new Error('No files found to upload');
    }

    // Upload files in batches to avoid memory issues
    const uploadResults = [];
    const batchSize = 10;
    
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      console.log(`[WebsiteDeployer] Uploading batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(files.length / batchSize)} (${batch.length} files)...`);
      
      const batchPromises = batch.map(async (relativePath) => {
        try {
          const fullPath = path.join(fullWebsitePath, relativePath);
          const fileBuffer = await fs.readFile(fullPath);
          const fileName = path.basename(relativePath);
          
          // Determine content type
          const ext = path.extname(relativePath).toLowerCase();
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
          const contentType = contentTypes[ext] || 'application/octet-stream';
          
          console.log(`[WebsiteDeployer] Uploading: ${relativePath} (${(fileBuffer.length / 1024).toFixed(2)} KB)`);
          
          const uploadResult = await uploadToArweave(fileBuffer, fileName, {
            contentType: contentType,
            metadata: {
              websiteFile: relativePath,
              deployment: new Date().toISOString()
            }
          });

          if (!uploadResult.success) {
            throw new Error(uploadResult.error || 'Upload failed');
          }

          return {
            path: relativePath,
            transactionId: uploadResult.transactionId,
            arweaveUrl: uploadResult.arweaveUrl,
            fileSize: fileBuffer.length
          };
        } catch (error) {
          console.error(`[WebsiteDeployer] Failed to upload ${relativePath}:`, error.message);
          throw error;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      uploadResults.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < files.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`[WebsiteDeployer] ✅ Uploaded ${uploadResults.length} files`);

    // Create manifest
    console.log('[WebsiteDeployer] Creating manifest...');
    const manifest = {
      manifest: 'arweave/paths',
      version: '0.1.0',
      index: 'index.html',
      paths: {}
    };

    uploadResults.forEach(result => {
      manifest.paths[result.path] = {
        id: result.transactionId
      };
    });

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

    return {
      success: true,
      manifestId: manifestId,
      manifestUrl: manifestUrl,
      websiteUrl: websiteUrl,
      filesUploaded: uploadResults.length,
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

