/**
 * API Endpoint: Force Upload Files
 * POST /api/force-upload-files
 * 
 * Removes specific files from deployment manifest to force re-upload
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();

    const filesToForce = [
      'img/covers/ue_banner.jpg',
      'img/loge_horiz.png',
      'fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf'
    ];

    // Load current manifest
    const manifestRef = db.collection('system').doc('deployment-manifest');
    const manifestDoc = await manifestRef.get();

    if (!manifestDoc.exists) {
      return res.status(200).json({
        success: true,
        message: 'No existing manifest found - all files will be uploaded on next deployment',
        filesRemoved: 0
      });
    }

    const manifest = manifestDoc.data();
    const files = manifest.files || {};

    // Remove specified files from manifest
    let removedCount = 0;
    for (const filePath of filesToForce) {
      if (files[filePath]) {
        delete files[filePath];
        removedCount++;
      }
    }

    if (removedCount > 0) {
      // Save updated manifest
      await manifestRef.set({
        files: files,
        lastUpdated: new Date().toISOString(),
        totalFiles: Object.keys(files).length,
        forceUploaded: new Date().toISOString()
      }, { merge: false });

      return res.status(200).json({
        success: true,
        message: `Removed ${removedCount} file(s) from manifest. They will be re-uploaded on next deployment.`,
        filesRemoved: removedCount,
        files: filesToForce.filter(f => files[f] === undefined)
      });
    } else {
      return res.status(200).json({
        success: true,
        message: 'Files are already marked for upload (not in manifest)',
        filesRemoved: 0
      });
    }

  } catch (error) {
    console.error('[Force Upload Files] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update manifest'
    });
  }
}
