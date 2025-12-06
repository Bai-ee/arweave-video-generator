/**
 * API endpoint to upload artist images to Arweave
 * POST /api/upload-artist-image
 * 
 * Accepts multipart/form-data with:
 * - file: Image file (.jpg, .png, .gif, .webp)
 * - artistName: Name of the artist
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import { uploadToArweave } from '../lib/ArweaveUploader.js';
import formidable from 'formidable';
import fs from 'fs-extra';

// Disable default body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data (formidable v3 API)
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB max for images
      keepExtensions: true,
    });

    const { fields, files } = await form.parse(req);
    
    const artistName = Array.isArray(fields.artistName) ? fields.artistName[0] : fields.artistName;

    if (!artistName) {
      return res.status(400).json({
        success: false,
        error: 'artistName is required'
      });
    }

    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!file) {
      return res.status(400).json({
        success: false,
        error: 'Image file is required'
      });
    }

    const fileBuffer = await fs.readFile(file.filepath);
    const fileName = file.originalFilename || `artist_${Date.now()}.jpg`;
    
    // Validate file extension
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExt = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    if (!validExtensions.includes(fileExt)) {
      await fs.remove(file.filepath).catch(() => {});
      return res.status(400).json({
        success: false,
        error: `Invalid image format. Supported: ${validExtensions.join(', ')}`
      });
    }

    console.log(`[Upload Artist Image] Uploading ${fileName} to Arweave for artist: ${artistName}`);
    
    // Determine content type
    const contentTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };
    const contentType = contentTypes[fileExt] || 'image/jpeg';

    const uploadResult = await uploadToArweave(fileBuffer, fileName, {
      contentType: contentType,
      metadata: {
        artist: artistName,
        type: 'artist-image'
      }
    });

    // Cleanup temp file
    await fs.remove(file.filepath).catch(() => {});

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: uploadResult.error || 'Failed to upload to Arweave'
      });
    }

    const arweaveUrl = uploadResult.arweaveUrl;
    console.log(`[Upload Artist Image] ✅ Uploaded to Arweave: ${arweaveUrl}`);

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Update artist image in Firebase artists JSON
    await updateArtistImage(db, artistName, arweaveUrl);

    return res.status(200).json({
      success: true,
      arweaveUrl: arweaveUrl,
      fileName: fileName,
      fileSize: uploadResult.fileSize,
      artistName: artistName,
      message: 'Artist image uploaded and updated in database'
    });

  } catch (error) {
    console.error('[Upload Artist Image] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to upload artist image',
      message: error.message 
    });
  }
}

/**
 * Update artist image URL in Firebase artists JSON
 */
async function updateArtistImage(db, artistName, imageUrl) {
  try {
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    let artistsData = [];
    if (artistsDoc.exists) {
      artistsData = artistsDoc.data().artists || [];
    }

    // Find artist
    let artist = artistsData.find(a => a.artistName === artistName);
    
    if (!artist) {
      // Create new artist if doesn't exist
      artist = {
        artistName: artistName,
        artistFilename: artistName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html',
        artistImageFilename: imageUrl,
        artistGenre: 'electronic',
        mixes: [],
        trax: []
      };
      artistsData.push(artist);
      console.log(`[Upload Artist Image] Created new artist: ${artistName}`);
    } else {
      // Update existing artist image
      artist.artistImageFilename = imageUrl;
      console.log(`[Upload Artist Image] Updated image for artist: ${artistName}`);
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Upload Artist Image] ✅ Updated artists JSON in Firebase`);
    
  } catch (error) {
    console.error('[Upload Artist Image] Error updating artists JSON:', error.message);
    throw error;
  }
}

