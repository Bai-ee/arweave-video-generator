/**
 * Deployment Tracker Module
 * Tracks previous deployments to enable incremental uploads
 * Only uploads files that have changed (different hash) or are new
 */

import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { collectWebsiteFiles } from './WebsiteDeployer.js';

/**
 * Calculate file hash for change detection
 * @param {Buffer} fileBuffer - File content as buffer
 * @returns {string} SHA256 hash
 */
function calculateFileHash(fileBuffer) {
  return crypto.createHash('sha256').update(fileBuffer).digest('hex');
}

/**
 * Load previous deployment manifest from Firebase
 * @param {Object} db - Firestore database instance
 * @returns {Promise<Object>} Previous manifest with file paths as keys
 */
export async function loadPreviousManifest(db) {
  try {
    if (!db) {
      console.warn('[DeploymentTracker] No database provided, starting fresh');
      return {};
    }
    
    const manifestRef = db.collection('system').doc('deployment-manifest');
    const manifestDoc = await manifestRef.get();
    
    if (manifestDoc.exists) {
      const data = manifestDoc.data();
      const files = data.files || {};
      console.log(`[DeploymentTracker] Loaded previous manifest with ${Object.keys(files).length} files`);
      return files;
    }
    console.log('[DeploymentTracker] No previous manifest found, starting fresh');
    return {};
  } catch (error) {
    console.warn('[DeploymentTracker] Could not load previous manifest:', error.message);
    return {};
  }
}

/**
 * Save deployment manifest to Firebase
 * @param {Object} db - Firestore database instance
 * @param {Object} files - Manifest object with file paths as keys
 * @returns {Promise<void>}
 */
export async function saveManifest(db, files) {
  try {
    if (!db) {
      console.warn('[DeploymentTracker] No database provided, cannot save manifest');
      return;
    }
    
    const manifestRef = db.collection('system').doc('deployment-manifest');
    await manifestRef.set({ 
      files: files,
      lastUpdated: new Date().toISOString(),
      totalFiles: Object.keys(files).length
    }, { merge: false });
    
    console.log(`[DeploymentTracker] ✅ Saved manifest with ${Object.keys(files).length} files`);
  } catch (error) {
    console.error('[DeploymentTracker] Could not save manifest:', error.message);
    // Don't throw - this is non-critical
  }
}

/**
 * Normalize file path to ensure consistent format
 * Converts to forward slashes and normalizes relative paths
 * @param {string} filePath - File path to normalize
 * @returns {string} Normalized path
 */
function normalizeFilePath(filePath) {
  if (!filePath) return '';
  // Normalize path separators to forward slashes (consistent across platforms)
  let normalized = filePath.replace(/\\/g, '/');
  // Remove leading ./ if present
  normalized = normalized.replace(/^\.\//, '');
  // Normalize multiple slashes
  normalized = normalized.replace(/\/+/g, '/');
  // Remove trailing slash (unless it's the root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * Compare current files with previous manifest and return changed/new files
 * @param {string} websiteDir - Path to website directory
 * @param {Object} db - Firestore database instance (optional)
 * @returns {Promise<Object>} { changedFiles, unchangedFiles }
 */
export async function getChangedFiles(websiteDir, db = null) {
  try {
    // Normalize path - handle cases where websiteDir might already be absolute
    let fullWebsitePath;
    if (path.isAbsolute(websiteDir)) {
      fullWebsitePath = websiteDir;
    } else {
      fullWebsitePath = path.join(process.cwd(), websiteDir);
    }
    
    // Normalize to avoid double /var/task issues
    fullWebsitePath = path.normalize(fullWebsitePath);
    
    console.log(`[DeploymentTracker] Resolved website path: ${fullWebsitePath}`);
    console.log(`[DeploymentTracker] process.cwd(): ${process.cwd()}`);
    
    const previousManifest = await loadPreviousManifest(db);
    const currentFiles = await collectWebsiteFiles(fullWebsitePath);
    
    // Normalize all current file paths for consistent comparison
    const normalizedCurrentFiles = currentFiles.map(normalizeFilePath);
    
    // Normalize previous manifest paths for comparison
    const normalizedPreviousManifest = {};
    Object.keys(previousManifest).forEach(oldPath => {
      const normalizedPath = normalizeFilePath(oldPath);
      normalizedPreviousManifest[normalizedPath] = previousManifest[oldPath];
    });
    
    const changedFiles = [];
    const unchangedFiles = [];
    
    console.log(`[DeploymentTracker] Comparing ${normalizedCurrentFiles.length} files with previous manifest...`);
    
    // Check if artists.json might be in /tmp (Vercel production)
    const tmpArtistsJsonPath = '/tmp/artists.json';
    let tmpArtistsJsonExists = false;
    try {
      tmpArtistsJsonExists = await fs.pathExists(tmpArtistsJsonPath);
      if (tmpArtistsJsonExists) {
        console.log('[DeploymentTracker] Found artists.json in /tmp, will include it');
      }
    } catch (e) {
      // Ignore
    }
    
    for (let i = 0; i < normalizedCurrentFiles.length; i++) {
      const filePath = normalizedCurrentFiles[i];
      const originalPath = currentFiles[i];
      const fullPath = path.join(fullWebsitePath, originalPath);
      
      try {
        let fileBuffer;
        let actualPath = fullPath;
        
        // Special handling for artists.json - check /tmp first in production
        if (filePath === 'artists.json' && tmpArtistsJsonExists) {
          try {
            fileBuffer = await fs.readFile(tmpArtistsJsonPath);
            actualPath = tmpArtistsJsonPath;
            console.log(`[DeploymentTracker] Reading artists.json from /tmp`);
          } catch (tmpError) {
            // Fall back to normal location
            fileBuffer = await fs.readFile(fullPath);
          }
        } else {
          fileBuffer = await fs.readFile(fullPath);
        }
        
        const fileHash = calculateFileHash(fileBuffer);
        const previousFile = normalizedPreviousManifest[filePath];
        
        // Validate previous file entry
        if (previousFile && (!previousFile.transactionId || !previousFile.hash)) {
          console.warn(`[DeploymentTracker] Invalid manifest entry for ${filePath}, treating as new`);
          previousFile = null;
        }
        
        if (!previousFile || previousFile.hash !== fileHash) {
          // File is new or changed
          changedFiles.push({
            path: filePath, // Use normalized path
            fullPath: actualPath,
            buffer: fileBuffer,
            hash: fileHash,
            size: fileBuffer.length,
            isNew: !previousFile
          });
        } else {
          // File unchanged - reuse transaction ID
          unchangedFiles.push({
            path: filePath, // Use normalized path
            transactionId: previousFile.transactionId,
            hash: fileHash,
            size: fileBuffer.length
          });
        }
      } catch (error) {
        console.error(`[DeploymentTracker] ❌ Error processing ${filePath}:`, error.message);
        console.error(`[DeploymentTracker] Error context:`, {
          filePath,
          originalPath,
          fullPath,
          actualPath: actualPath || fullPath,
          normalizedPath: filePath,
          error: error.message,
          stack: error.stack
        });
        // Treat as changed file if we can't read it
        changedFiles.push({
          path: filePath,
          fullPath: fullPath,
          buffer: null,
          hash: null,
          size: 0,
          isNew: true,
          error: error.message
        });
      }
    }
    
    // Check for deleted files (in previous manifest but not in current)
    // Use normalized paths for comparison
    const currentFileSet = new Set(normalizedCurrentFiles);
    const deletedFiles = Object.keys(normalizedPreviousManifest).filter(manifestPath => !currentFileSet.has(manifestPath));
    
    if (deletedFiles.length > 0) {
      console.log(`[DeploymentTracker] Found ${deletedFiles.length} deleted files (will be removed from manifest)`);
      deletedFiles.forEach(deletedPath => {
        console.log(`[DeploymentTracker]   - Deleted: ${deletedPath}`);
      });
    }
    
    console.log(`[DeploymentTracker] Analysis complete:`);
    console.log(`  - Changed/New files: ${changedFiles.length}`);
    console.log(`  - Unchanged files: ${unchangedFiles.length}`);
    console.log(`  - Deleted files: ${deletedFiles.length}`);
    
    return { 
      changedFiles, 
      unchangedFiles,
      deletedFiles,
      totalFiles: normalizedCurrentFiles.length
    };
  } catch (error) {
    console.error('[DeploymentTracker] ❌ Error getting changed files:', error.message);
    console.error('[DeploymentTracker] Error stack:', error.stack);
    console.error('[DeploymentTracker] Error context:', {
      websiteDir,
      resolvedPath: fullWebsitePath,
      hasDb: !!db,
      errorType: error.constructor.name,
      errorMessage: error.message
    });
    throw error;
  }
}

/**
 * Calculate total size of files to upload
 * @param {Array} files - Array of file objects with size property
 * @returns {number} Total size in bytes
 */
export function calculateTotalSize(files) {
  return files.reduce((sum, file) => sum + (file.size || 0), 0);
}

