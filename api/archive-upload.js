/**
 * API endpoint to upload files from Firebase Storage to Arweave
 * Downloads file from Firebase and uploads via ArDrive/Turbo
 */

import { initializeFirebaseAdmin, getStorage, getFirestore } from '../lib/firebase-admin.js';
import { uploadFromFirebase } from '../lib/ArweaveUploader.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { folder, fileName } = req.body;

    if (!folder || !fileName) {
      return res.status(400).json({
        success: false,
        error: 'Folder and fileName are required'
      });
    }

    // Initialize Firebase
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();
    const db = getFirestore();

    // Construct file path
    const filePath = folder.endsWith('/') ? `${folder}${fileName}` : `${folder}/${fileName}`;
    const fileRef = bucket.file(filePath);

    // Check if file exists
    const [exists] = await fileRef.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: `File not found: ${filePath}`
      });
    }

    // Create job in Firestore
    const jobId = `archive_${Date.now()}_${fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const jobRef = db.collection('archiveJobs').doc(jobId);

    await jobRef.set({
      folder: folder,
      fileName: fileName,
      filePath: filePath,
      status: 'uploading',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Upload to Arweave
    console.log(`[ArchiveUpload] Uploading ${filePath} to Arweave...`);
    const uploadResult = await uploadFromFirebase(fileRef, folder, {
      source: 'firebase',
      originalFolder: folder
    });

    if (!uploadResult.success) {
      // Update job status to failed
      await jobRef.update({
        status: 'failed',
        error: uploadResult.error,
        updatedAt: new Date().toISOString()
      });

      return res.status(500).json({
        success: false,
        error: uploadResult.error,
        jobId: jobId
      });
    }

    // Update job with success
    await jobRef.update({
      status: 'pending_confirmation',
      transactionId: uploadResult.transactionId,
      arweaveUrl: uploadResult.arweaveUrl,
      turboUrl: uploadResult.turboUrl,
      fileSize: uploadResult.fileSize,
      contentType: uploadResult.contentType,
      updatedAt: new Date().toISOString()
    });

    // Update archive manifest
    try {
      await updateArchiveManifest(folder, fileName, uploadResult, db);
    } catch (manifestError) {
      console.warn('[ArchiveUpload] Manifest update failed:', manifestError.message);
      // Don't fail the upload if manifest update fails
    }

    return res.status(200).json({
      success: true,
      jobId: jobId,
      transactionId: uploadResult.transactionId,
      arweaveUrl: uploadResult.arweaveUrl,
      turboUrl: uploadResult.turboUrl,
      fileName: fileName,
      fileSize: uploadResult.fileSize,
      note: uploadResult.note
    });

  } catch (error) {
    console.error('[ArchiveUpload] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload file to Arweave'
    });
  }
}

/**
 * Update archive manifest with new entry
 */
async function updateArchiveManifest(folder, fileName, uploadResult, db) {
  try {
    const manifestRef = db.collection('archiveManifest').doc('main');
    const manifestDoc = await manifestRef.get();

    let manifest = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      folders: {}
    };

    if (manifestDoc.exists) {
      manifest = manifestDoc.data();
    }

    // Initialize folder if it doesn't exist
    if (!manifest.folders[folder]) {
      manifest.folders[folder] = {
        files: []
      };
    }

    // Check if file already exists in manifest
    const existingFileIndex = manifest.folders[folder].files.findIndex(
      f => f.name === fileName
    );

    const fileEntry = {
      name: fileName,
      firebasePath: `${folder}/${fileName}`,
      arweaveUrl: uploadResult.arweaveUrl,
      transactionId: uploadResult.transactionId,
      archivedAt: new Date().toISOString(),
      fileSize: uploadResult.fileSize,
      contentType: uploadResult.contentType
    };

    if (existingFileIndex >= 0) {
      // Update existing entry
      manifest.folders[folder].files[existingFileIndex] = fileEntry;
    } else {
      // Add new entry
      manifest.folders[folder].files.push(fileEntry);
    }

    manifest.lastUpdated = new Date().toISOString();

    // Save to Firestore
    await manifestRef.set(manifest);

    console.log(`[ArchiveUpload] Manifest updated for ${folder}/${fileName}`);
  } catch (error) {
    console.error('[ArchiveUpload] Manifest update error:', error.message);
    throw error;
  }
}



