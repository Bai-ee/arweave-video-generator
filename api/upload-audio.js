/**
 * API endpoint to upload audio files (.mp3) directly to Arweave
 * POST /api/upload-audio
 * 
 * Accepts multipart/form-data with:
 * - file: Audio file (.mp3)
 * - artistName: Name of the artist
 * - mixTitle: Title of the mix/track (optional)
 * - mixUrl: URL to existing mix on Arweave (optional, if not uploading file)
 * - mixDateYear: Date/year of the mix (optional)
 * - mixDuration: Duration of the mix (optional)
 * - isTrack: Boolean, true for tracks, false for mixes (default: false)
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
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 500 * 1024 * 1024, // 500MB max
      keepExtensions: true,
    });

    const { fields, files } = await form.parse(req);
    
    // formidable v3 returns fields as arrays, extract first value
    const artistName = Array.isArray(fields.artistName) ? fields.artistName[0] : fields.artistName;
    const mixTitle = Array.isArray(fields.mixTitle) ? fields.mixTitle[0] : fields.mixTitle;
    const mixUrl = Array.isArray(fields.mixUrl) ? fields.mixUrl[0] : fields.mixUrl;
    const mixDateYear = Array.isArray(fields.mixDateYear) ? fields.mixDateYear[0] : fields.mixDateYear;
    const mixDuration = Array.isArray(fields.mixDuration) ? fields.mixDuration[0] : fields.mixDuration;
    const isTrack = Array.isArray(fields.isTrack) ? fields.isTrack[0] === 'true' : fields.isTrack === 'true';

    if (!artistName) {
      return res.status(400).json({
        success: false,
        error: 'artistName is required'
      });
    }

    // Check if we have a file upload or a URL
    // formidable v3 returns files as arrays
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
          error: 'Only .mp3 files are supported'
        });
      }

      console.log(`[Upload Audio] Uploading ${fileName} to Arweave for artist: ${artistName}`);
      
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
      
      console.log(`[Upload Audio] ✅ Uploaded to Arweave: ${arweaveUrl}`);
    } else if (mixUrl) {
      // Use provided URL
      arweaveUrl = mixUrl;
      console.log(`[Upload Audio] Using provided Arweave URL: ${arweaveUrl}`);
    } else {
      return res.status(400).json({
        success: false,
        error: 'Either file or mixUrl is required'
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
      mixImageFilename: '', // Will be set when image is uploaded
      isTrack: isTrack
    });

    return res.status(200).json({
      success: true,
      arweaveUrl: arweaveUrl,
      fileName: fileName,
      fileSize: fileSize,
      artistName: artistName,
      message: 'Audio uploaded and added to artist database'
    });

  } catch (error) {
    console.error('[Upload Audio] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to upload audio',
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
        artistImageFilename: '', // Will be set when image is uploaded
        artistGenre: 'electronic', // Default genre
        mixes: [],
        trax: []
      };
      artistsData.push(artist);
      console.log(`[Upload Audio] Created new artist: ${artistName}`);
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
      // Rename fields for tracks
      const trackEntry = {
        trackTitle: mixEntry.mixTitle,
        trackArweaveURL: mixEntry.mixArweaveURL,
        trackDateYear: mixEntry.mixDateYear,
        trackDuration: mixEntry.mixDuration,
        trackImageFilename: mixEntry.mixImageFilename
      };
      artist.trax.push(trackEntry);
      console.log(`[Upload Audio] Added track "${mixData.mixTitle}" to ${artistName}`);
    } else {
      // Add as mix
      if (!artist.mixes) {
        artist.mixes = [];
      }
      artist.mixes.push(mixEntry);
      console.log(`[Upload Audio] Added mix "${mixData.mixTitle}" to ${artistName}`);
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Upload Audio] ✅ Updated artists JSON in Firebase`);
    
  } catch (error) {
    console.error('[Upload Audio] Error updating artists JSON:', error.message);
    throw error;
  }
}

