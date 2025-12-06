/**
 * Unified API endpoint for uploading files to Arweave
 * POST /api/upload
 * 
 * Supports:
 * - Audio files (.mp3) - requires artistName
 * - Artist images (.jpg, .png, .gif, .webp) - requires artistName
 * 
 * Accepts multipart/form-data with:
 * - file: File to upload
 * - type: 'audio' or 'image' (required)
 * - artistName: Name of the artist (required)
 * - mixTitle: Title of the mix/track (optional, for audio)
 * - mixUrl: URL to existing mix on Arweave (optional, for audio, if not uploading file)
 * - mixDateYear: Date/year of the mix (optional, for audio)
 * - mixDuration: Duration of the mix (optional, for audio)
 * - isTrack: Boolean, true for tracks, false for mixes (optional, for audio, default: false)
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
      maxFileSize: 500 * 1024 * 1024, // 500MB max
      keepExtensions: true,
    });

    const { fields, files } = await form.parse(req);
    
    // Extract fields (formidable v3 returns arrays)
    const type = Array.isArray(fields.type) ? fields.type[0] : fields.type;
    const artistName = Array.isArray(fields.artistName) ? fields.artistName[0] : fields.artistName;
    const mixTitle = Array.isArray(fields.mixTitle) ? fields.mixTitle[0] : fields.mixTitle;
    const mixUrl = Array.isArray(fields.mixUrl) ? fields.mixUrl[0] : fields.mixUrl;
    const mixDateYear = Array.isArray(fields.mixDateYear) ? fields.mixDateYear[0] : fields.mixDateYear;
    const mixDuration = Array.isArray(fields.mixDuration) ? fields.mixDuration[0] : fields.mixDuration;
    const isTrack = Array.isArray(fields.isTrack) ? fields.isTrack[0] === 'true' : fields.isTrack === 'true';

    if (!type || !['audio', 'image'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type is required and must be "audio" or "image"'
      });
    }

    if (!artistName) {
      return res.status(400).json({
        success: false,
        error: 'artistName is required'
      });
    }

    if (type === 'audio') {
      // Handle audio upload
      const file = Array.isArray(files.file) ? files.file[0] : files.file;
      
      let arweaveUrl = null;
      let fileName = null;
      let fileSize = 0;

      if (file) {
        // Upload file to Arweave
        const fileBuffer = await fs.readFile(file.filepath);
        fileName = file.originalFilename || `audio_${Date.now()}.mp3`;
        
        // Validate file extension
        if (!fileName.toLowerCase().endsWith('.mp3')) {
          await fs.remove(file.filepath).catch(() => {});
          return res.status(400).json({
            success: false,
            error: 'Only .mp3 files are supported for audio uploads'
          });
        }

        console.log(`[Upload] Uploading ${fileName} to Arweave for artist: ${artistName}`);
        
        const uploadResult = await uploadToArweave(fileBuffer, fileName, {
          contentType: 'audio/mpeg',
          metadata: {
            artist: artistName,
            title: mixTitle || fileName,
            type: isTrack ? 'track' : 'mix',
            dateYear: mixDateYear || '',
            duration: mixDuration || ''
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

        arweaveUrl = uploadResult.arweaveUrl;
        fileSize = uploadResult.fileSize;
        fileName = uploadResult.fileName;
        
        console.log(`[Upload] ✅ Uploaded to Arweave: ${arweaveUrl}`);
      } else if (mixUrl) {
        // Use provided URL
        arweaveUrl = mixUrl;
        console.log(`[Upload] Using provided Arweave URL: ${arweaveUrl}`);
      } else {
        return res.status(400).json({
          success: false,
          error: 'Either file or mixUrl is required for audio uploads'
        });
      }

      // Initialize Firebase
      initializeFirebaseAdmin();
      const db = getFirestore();

      // Add to artists JSON in Firebase
      await addMixToArtist(db, artistName, {
        mixTitle: mixTitle || (isTrack ? 'Untitled Track' : 'Untitled Mix'),
        mixArweaveURL: arweaveUrl,
        mixDateYear: mixDateYear || new Date().getFullYear().toString(),
        mixDuration: mixDuration || '0:00',
        mixImageFilename: '',
        isTrack: isTrack
      });

      return res.status(200).json({
        success: true,
        type: 'audio',
        arweaveUrl: arweaveUrl,
        fileName: fileName,
        fileSize: fileSize,
        artistName: artistName,
        message: 'Audio uploaded and added to artist database'
      });

    } else if (type === 'image') {
      // Handle image upload
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

      console.log(`[Upload] Uploading ${fileName} to Arweave for artist: ${artistName}`);
      
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
      console.log(`[Upload] ✅ Uploaded to Arweave: ${arweaveUrl}`);

      // Initialize Firebase
      initializeFirebaseAdmin();
      const db = getFirestore();

      // Update artist image in Firebase artists JSON
      await updateArtistImage(db, artistName, arweaveUrl);

      return res.status(200).json({
        success: true,
        type: 'image',
        arweaveUrl: arweaveUrl,
        fileName: fileName,
        fileSize: uploadResult.fileSize,
        artistName: artistName,
        message: 'Artist image uploaded and updated in database'
      });
    }

  } catch (error) {
    console.error('[Upload] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to upload file',
      message: error.message 
    });
  }
}

/**
 * Add mix/track to artist in Firebase artists JSON
 */
async function addMixToArtist(db, artistName, mixData) {
  try {
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    let artistsData = [];
    if (artistsDoc.exists) {
      artistsData = artistsDoc.data().artists || [];
    }

    // Find or create artist
    let artist = artistsData.find(a => a.artistName === artistName);
    
    if (!artist) {
      // Create new artist
      artist = {
        artistName: artistName,
        artistFilename: artistName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.html',
        artistImageFilename: '',
        artistGenre: 'electronic',
        mixes: [],
        trax: []
      };
      artistsData.push(artist);
      console.log(`[Upload] Created new artist: ${artistName}`);
    }

    // Add mix or track
    const mixEntry = {
      mixTitle: mixData.mixTitle,
      mixArweaveURL: mixData.mixArweaveURL,
      mixDateYear: mixData.mixDateYear,
      mixDuration: mixData.mixDuration,
      mixImageFilename: mixData.mixImageFilename || ''
    };

    if (mixData.isTrack) {
      // Add as track
      if (!artist.trax) {
        artist.trax = [];
      }
      const trackEntry = {
        trackTitle: mixEntry.mixTitle,
        trackArweaveURL: mixEntry.mixArweaveURL,
        trackDateYear: mixEntry.mixDateYear,
        trackDuration: mixEntry.mixDuration,
        trackImageFilename: mixEntry.mixImageFilename
      };
      artist.trax.push(trackEntry);
      console.log(`[Upload] Added track "${mixData.mixTitle}" to ${artistName}`);
    } else {
      // Add as mix
      if (!artist.mixes) {
        artist.mixes = [];
      }
      artist.mixes.push(mixEntry);
      console.log(`[Upload] Added mix "${mixData.mixTitle}" to ${artistName}`);
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Upload] ✅ Updated artists JSON in Firebase`);
    
  } catch (error) {
    console.error('[Upload] Error updating artists JSON:', error.message);
    throw error;
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
      console.log(`[Upload] Created new artist: ${artistName}`);
    } else {
      // Update existing artist image
      artist.artistImageFilename = imageUrl;
      console.log(`[Upload] Updated image for artist: ${artistName}`);
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Upload] ✅ Updated artists JSON in Firebase`);
    
  } catch (error) {
    console.error('[Upload] Error updating artists JSON:', error.message);
    throw error;
  }
}

