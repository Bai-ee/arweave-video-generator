/**
 * API endpoint to delete videos from Firebase Storage
 * DELETE /api/delete-video?folder=skyline&file=video.mp4
 */

import { initializeFirebaseAdmin, getStorage } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { folder, file } = req.query;

    if (!folder || !file) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: folder and file'
      });
    }

    // Initialize Firebase Admin
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();

    // Construct the full path
    const filePath = `${folder}/${file}`;
    const fileRef = bucket.file(filePath);

    // Check if file exists
    const [exists] = await fileRef.exists();
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'File not found'
      });
    }

    // Delete the file
    await fileRef.delete();

    console.log(`[DeleteVideo] ✅ Deleted: ${filePath}`);

    return res.status(200).json({
      success: true,
      message: 'Video deleted successfully',
      filePath: filePath
    });
  } catch (error) {
    console.error('Error deleting video:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete video'
    });
  }
}

