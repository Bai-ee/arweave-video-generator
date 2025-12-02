/**
 * API endpoint to get videos from Firebase Storage folders
 * Returns folder structure with video counts and file lists
 */

import { initializeFirebaseAdmin, getStorage } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    // Initialize Firebase Admin
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();

    const { folder } = req.query;

    // Define available folders
    const availableFolders = ['skyline', 'artist', 'decks', 'equipment', 'family', 'neighborhood', 'assets/chicago-skyline-videos'];

    if (folder) {
      // Get videos from a specific folder
      const folderPath = folder.endsWith('/') ? folder : `${folder}/`;
      const [files] = await bucket.getFiles({ prefix: folderPath });

      // Filter for video files
      const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
      const videos = files
        .filter(file => {
          const fileName = file.name.toLowerCase();
          return videoExtensions.some(ext => fileName.endsWith(ext)) && 
                 !fileName.endsWith('.keep');
        })
        .map(file => {
          const fileName = file.name.split('/').pop();
          return {
            name: fileName,
            fullPath: file.name,
            size: file.metadata.size || 0,
            contentType: file.metadata.contentType || 'video/mp4',
            updated: file.metadata.updated || file.metadata.timeCreated,
            publicUrl: `https://storage.googleapis.com/${bucket.name}/${file.name}`
          };
        });

      return res.status(200).json({
        success: true,
        folder: folder,
        videos: videos,
        count: videos.length
      });
    } else {
      // Get folder counts for all folders
      const folderStats = await Promise.all(
        availableFolders.map(async (folderName) => {
          const folderPath = folderName.endsWith('/') ? folderName : `${folderName}/`;
          const [files] = await bucket.getFiles({ prefix: folderPath });
          
          const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
          const videoCount = files.filter(file => {
            const fileName = file.name.toLowerCase();
            return videoExtensions.some(ext => fileName.endsWith(ext)) && 
                   !fileName.endsWith('.keep');
          }).length;

          return {
            name: folderName,
            count: videoCount,
            displayName: folderName.replace('assets/', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          };
        })
      );

      return res.status(200).json({
        success: true,
        folders: folderStats
      });
    }
  } catch (error) {
    console.error('Error fetching video folders:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch video folders'
    });
  }
}

