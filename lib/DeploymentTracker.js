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
    
    const changedFiles = [];
    const unchangedFiles = [];
    
    console.log(`[DeploymentTracker] Comparing ${currentFiles.length} files with previous manifest...`);
    
    for (const filePath of currentFiles) {
      const fullPath = path.join(fullWebsitePath, filePath);
      
      try {
        const fileBuffer = await fs.readFile(fullPath);
        const fileHash = calculateFileHash(fileBuffer);
        const previousFile = previousManifest[filePath];
        
        if (!previousFile || previousFile.hash !== fileHash) {
          // File is new or changed
          changedFiles.push({
            path: filePath,
            fullPath: fullPath,
            buffer: fileBuffer,
            hash: fileHash,
            size: fileBuffer.length,
            isNew: !previousFile
          });
        } else {
          // File unchanged - reuse transaction ID
          unchangedFiles.push({
            path: filePath,
            transactionId: previousFile.transactionId,
            hash: fileHash,
            size: fileBuffer.length
          });
        }
      } catch (error) {
        console.error(`[DeploymentTracker] Error processing ${filePath}:`, error.message);
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
    const currentFileSet = new Set(currentFiles);
    const deletedFiles = Object.keys(previousManifest).filter(path => !currentFileSet.has(path));
    
    if (deletedFiles.length > 0) {
      console.log(`[DeploymentTracker] Found ${deletedFiles.length} deleted files (will be removed from manifest)`);
    }
    
    console.log(`[DeploymentTracker] Analysis complete:`);
    console.log(`  - Changed/New files: ${changedFiles.length}`);
    console.log(`  - Unchanged files: ${unchangedFiles.length}`);
    console.log(`  - Deleted files: ${deletedFiles.length}`);
    
    return { 
      changedFiles, 
      unchangedFiles,
      deletedFiles,
      totalFiles: currentFiles.length
    };
  } catch (error) {
    console.error('[DeploymentTracker] Error getting changed files:', error.message);
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

