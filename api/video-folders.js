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

    // Dynamically discover folders by listing all files in the bucket
    // This allows new folders created by users to be automatically included
    async function discoverFolders() {
      const [allFiles] = await bucket.getFiles();
      
      // Extract unique folder names from file paths
      const folderSet = new Set();
      const imageFolders = new Set(['logos', 'paper_backgrounds']); // Known image folders
      
      allFiles.forEach(file => {
        const pathParts = file.name.split('/');
        if (pathParts.length > 1) {
          const folderName = pathParts[0];
          // Skip hidden files and .keep files
          if (!folderName.startsWith('.') && !file.name.endsWith('.keep')) {
            folderSet.add(folderName);
          }
        }
      });
      
      // Also check for nested folders (like assets/chicago-skyline-videos)
      allFiles.forEach(file => {
        const pathParts = file.name.split('/');
        if (pathParts.length > 2) {
          const nestedFolder = `${pathParts[0]}/${pathParts[1]}`;
          if (!nestedFolder.includes('.') && !file.name.endsWith('.keep')) {
            folderSet.add(nestedFolder);
          }
        }
      });
      
      // Convert to array and filter out image-only folders and mixes/Baiee from video selection
      // (but keep them for internal use)
      return Array.from(folderSet).filter(folderName => {
        // Exclude image folders and mixes/Baiee folder
        if (folderName === 'logos' || folderName === 'paper_backgrounds') {
          return false;
        }
        // Exclude mixes/Baiee folder and any folder containing Baiee
        if (folderName === 'mixes/Baiee' || folderName.includes('Baiee') || folderName === 'mixes') {
          return false;
        }
        return true;
      });
    }

    // Get list of available folders (dynamically discovered)
    const discoveredFolders = await discoverFolders();

    if (folder) {
      // Get files from a specific folder (videos or images)
      const folderPath = folder.endsWith('/') ? folder : `${folder}/`;
      const [files] = await bucket.getFiles({ prefix: folderPath });

      // Filter for video and image files based on folder type
      const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
      
      // Determine if this is an image folder or video folder
      const isImageFolder = folder === 'logos' || folder === 'paper_backgrounds';
      const allowedExtensions = isImageFolder ? imageExtensions : videoExtensions;
      
      const filteredFiles = files.filter(file => {
        const fileName = file.name.toLowerCase();
        return allowedExtensions.some(ext => fileName.endsWith(ext)) && 
               !fileName.endsWith('.keep');
      });

      // Generate URLs for each file (try public first, then signed URL)
      const videos = await Promise.all(
        filteredFiles.map(async (file) => {
          const fileName = file.name.split('/').pop();
          let publicUrl = `https://storage.googleapis.com/${bucket.name}/${file.name}`;
          
          // Try to generate a signed URL (works for both public and private files)
          // Signed URLs are valid for 1 hour
          try {
            const [signedUrl] = await file.getSignedUrl({
              action: 'read',
              expires: Date.now() + 60 * 60 * 1000 // 1 hour
            });
            publicUrl = signedUrl;
          } catch (error) {
            // If signed URL fails, try public URL
            console.warn(`[VideoFolders] Could not generate signed URL for ${file.name}, using public URL`);
          }
          
          return {
            name: fileName,
            fullPath: file.name,
            size: file.metadata.size || 0,
            contentType: file.metadata.contentType || 'video/mp4',
            updated: file.metadata.updated || file.metadata.timeCreated,
            publicUrl: publicUrl
          };
        })
      );

      return res.status(200).json({
        success: true,
        folder: folder,
        videos: videos,
        count: videos.length
      });
    } else {
      // Get folder counts for all discovered folders
      const folderStats = await Promise.all(
        discoveredFolders.map(async (folderName) => {
          const folderPath = folderName.endsWith('/') ? folderName : `${folderName}/`;
          const [files] = await bucket.getFiles({ prefix: folderPath });
          
          // Determine file type based on folder
          const isImageFolder = folderName === 'logos' || folderName === 'paper_backgrounds';
          const videoExtensions = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];
          const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
          const allowedExtensions = isImageFolder ? imageExtensions : videoExtensions;
          
          const fileCount = files.filter(file => {
            const fileName = file.name.toLowerCase();
            return allowedExtensions.some(ext => fileName.endsWith(ext)) && 
                   !fileName.endsWith('.keep');
          }).length;

          return {
            name: folderName,
            count: fileCount,
            displayName: folderName.replace('assets/', '').replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            type: isImageFolder ? 'image' : 'video'
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

