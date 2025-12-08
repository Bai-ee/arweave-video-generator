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

import { initializeFirebaseAdmin, getFirestore, getStorage } from '../lib/firebase-admin.js';
import { uploadToArweave, uploadFromFirebase } from '../lib/ArweaveUploader.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import { calculateCost, formatCost } from '../lib/ArweaveCostCalculator.js';
import formidable from 'formidable';
import fs from 'fs-extra';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Disable default body parser for file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // CRITICAL: Log immediately - even before try/catch
  console.error('[Upload] ============================================');
  console.error('[Upload] FUNCTION CALLED - Request received!');
  console.error('[Upload] Method:', req.method);
  console.error('[Upload] URL:', req.url);
  console.error('[Upload] Timestamp:', new Date().toISOString());
  
  // Wrapper to ensure all errors return JSON
  try {
    // Set CORS headers early - BEFORE any processing
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS,GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Content-Length, Content-Disposition');
    
    // Log the incoming request immediately
    console.log('[Upload] ============================================');
    console.log('[Upload] Request received!');
    console.log('[Upload] Method:', req.method);
    console.log('[Upload] URL:', req.url);
    console.log('[Upload] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('[Upload] Content-Type:', req.headers['content-type']);
    
    // Set JSON content type for responses (but allow multipart for requests)
    res.setHeader('Content-Type', 'application/json');

    // Handle OPTIONS preflight
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Handle GET for cost estimation
    if (req.method === 'GET') {
      const { fileSize } = req.query;
      if (fileSize) {
        try {
          const costEstimate = await calculateCost(parseInt(fileSize) || 0);
          return res.status(200).json({
            success: true,
            cost: costEstimate,
            formatted: formatCost(costEstimate)
          });
        } catch (error) {
          return res.status(500).json({ success: false, error: error.message });
        }
      }
      return res.status(400).json({ success: false, error: 'fileSize query parameter required' });
    }

    // Only allow POST for uploads
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      console.log('[Upload] ============================================');
      console.log('[Upload] Starting upload request...');
      console.log('[Upload] Method:', req.method);
      console.log('[Upload] URL:', req.url);
      console.log('[Upload] Content-Type:', req.headers['content-type']);
      console.log('[Upload] ARWEAVE_WALLET_JWK exists:', !!process.env.ARWEAVE_WALLET_JWK);
      
      // Check if request is JSON (new Firebase-based flow) or multipart (old direct upload)
      const contentType = req.headers['content-type'] || '';
      let type, artistName, mixTitle, mixUrl, mixDateYear, mixDuration, isTrack, firebasePath;
      
      if (contentType.includes('application/json')) {
        // New flow: JSON with Firebase path (like archive upload)
        console.log('[Upload] Parsing JSON request (Firebase-based flow)...');
        const body = await new Promise((resolve, reject) => {
          let data = '';
          req.on('data', chunk => data += chunk);
          req.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });
        
        type = body.type;
        artistName = body.artistName;
        mixTitle = body.mixTitle;
        mixUrl = body.mixUrl;
        mixDateYear = body.mixDateYear;
        mixDuration = body.mixDuration;
        isTrack = body.isTrack === 'true' || body.isTrack === true;
        firebasePath = body.firebasePath;
        
        console.log('[Upload] JSON parsed successfully');
        console.log('[Upload] Firebase path:', firebasePath || 'None (using URL)');
      } else {
        // Old flow: multipart form data (for backward compatibility)
        console.log('[Upload] Parsing multipart form data (legacy flow)...');
        const form = formidable({
          maxFileSize: 500 * 1024 * 1024, // 500MB max
          keepExtensions: true,
        });

        const { fields, files } = await form.parse(req);
        console.log('[Upload] Form parsed successfully');
      
        // Extract fields (formidable v3 returns arrays)
        type = Array.isArray(fields.type) ? fields.type[0] : fields.type;
        artistName = Array.isArray(fields.artistName) ? fields.artistName[0] : fields.artistName;
        mixTitle = Array.isArray(fields.mixTitle) ? fields.mixTitle[0] : fields.mixTitle;
        mixUrl = Array.isArray(fields.mixUrl) ? fields.mixUrl[0] : fields.mixUrl;
        mixDateYear = Array.isArray(fields.mixDateYear) ? fields.mixDateYear[0] : fields.mixDateYear;
        mixDuration = Array.isArray(fields.mixDuration) ? fields.mixDuration[0] : fields.mixDuration;
        isTrack = Array.isArray(fields.isTrack) ? fields.isTrack[0] === 'true' : fields.isTrack === 'true';
      }

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
      let arweaveUrl = null;
      let fileName = null;
      let fileSize = 0;

      if (firebasePath) {
        // New flow: Download from Firebase and upload to Arweave (like archive upload!)
        console.log(`[Upload] Using Firebase path: ${firebasePath}`);
        console.log(`[Upload] This matches the working archive upload flow!`);
        
        initializeFirebaseAdmin();
        const storage = getStorage();
        const bucket = storage.bucket();
        const fileRef = bucket.file(firebasePath);
        
        // Check if file exists
        const [exists] = await fileRef.exists();
        if (!exists) {
          return res.status(404).json({
            success: false,
            error: `File not found in Firebase: ${firebasePath}`
          });
        }
        
        // Use uploadFromFirebase (same as archive upload!)
        const uploadResult = await uploadFromFirebase(fileRef, 'mixes', {
          source: 'firebase',
          originalFolder: 'mixes',
          metadata: {
            artist: artistName,
            title: mixTitle || firebasePath.split('/').pop(),
            type: isTrack ? 'track' : 'mix',
            dateYear: mixDateYear || '',
            duration: mixDuration || ''
          }
        });
        
        if (!uploadResult.success) {
          return res.status(500).json({
            success: false,
            error: uploadResult.error || 'Failed to upload to Arweave'
          });
        }
        
        arweaveUrl = uploadResult.arweaveUrl;
        fileSize = uploadResult.fileSize;
        fileName = uploadResult.fileName;
        
        console.log(`[Upload] ✅ Uploaded to Arweave via Firebase: ${arweaveUrl}`);
        
      } else if (mixUrl) {
        // Use provided URL
        arweaveUrl = mixUrl;
      } else {
        // Legacy flow: multipart file upload (for backward compatibility)
        const file = files && (Array.isArray(files.file) ? files.file[0] : files.file);
        
        if (file) {
        // Upload file to Arweave
        console.log(`[Upload] Reading file from: ${file.filepath}`);
        console.log(`[Upload] File size: ${file.size} bytes`);
        console.log(`[Upload] Original filename: ${file.originalFilename}`);
        
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

        console.log(`[Upload] File buffer size: ${fileBuffer.length} bytes`);
        console.log(`[Upload] Uploading ${fileName} to Arweave for artist: ${artistName}`);
        console.log(`[Upload] Using same uploadToArweave function as archive upload...`);
        
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
        
        console.log(`[Upload] Upload result:`, uploadResult.success ? 'SUCCESS' : 'FAILED');
        if (!uploadResult.success) {
          console.error(`[Upload] Upload error:`, uploadResult.error);
        }

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

      // Update website (non-blocking - don't fail upload if website update fails)
      let websiteUpdateResult = null;
      try {
        websiteUpdateResult = await updateWebsite(db);
      } catch (websiteError) {
        console.warn('[Upload] Website update failed (non-blocking):', websiteError.message);
      }

      return res.status(200).json({
        success: true,
        type: 'audio',
        arweaveUrl: arweaveUrl,
        fileName: fileName,
        fileSize: fileSize,
        artistName: artistName,
        message: 'Audio uploaded and added to artist database',
        websiteUpdate: websiteUpdateResult
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

      // Calculate upload cost
      const uploadCost = await calculateCost(uploadResult.fileSize);
      
      // Update artist image in Firebase artists JSON
      await updateArtistImage(db, artistName, arweaveUrl);

      // Update website (non-blocking - don't fail upload if website update fails)
      let websiteUpdateResult = null;
      try {
        websiteUpdateResult = await updateWebsite(db);
      } catch (websiteError) {
        console.warn('[Upload] Website update failed (non-blocking):', websiteError.message);
      }

      return res.status(200).json({
        success: true,
        type: 'image',
        arweaveUrl: arweaveUrl,
        fileName: fileName,
        fileSize: uploadResult.fileSize,
        artistName: artistName,
        cost: uploadCost,
        formattedCost: formatCost(uploadCost),
        message: 'Artist image uploaded and updated in database',
        websiteUpdate: websiteUpdateResult
      });
    }

  } catch (error) {
    // Use console.error to ensure it shows in Vercel logs
    console.error('[Upload] ❌ API Handler Error:', error.message);
    console.error('[Upload] Error stack:', error.stack);
    console.error('[Upload] Error name:', error.name);
    console.error('[Upload] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    
    // Ensure we always return valid JSON
    try {
      return res.status(500).json({ 
        success: false,
        error: 'Failed to upload file',
        message: error.message || 'Unknown error',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } catch (jsonError) {
      // Fallback if JSON.stringify fails
      console.error('[Upload] Failed to send JSON response:', jsonError);
      res.status(500).end(JSON.stringify({ 
        success: false,
        error: 'Failed to upload file',
        message: error.message || 'Unknown error'
      }));
    }
  }
  } catch (outerError) {
    // Catch any errors in the handler itself (e.g., header setting)
    console.error('[Upload] Outer error:', outerError.message);
    try {
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: outerError.message || 'Unknown error'
      });
    } catch (finalError) {
      // Last resort - send plain text
      res.status(500).end('Internal Server Error');
    }
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
 * Update website after Firebase changes (sync, regenerate, deploy)
 * Non-blocking - errors are logged but don't throw
 */
async function updateWebsite(db) {
  try {
    console.log('[Upload] Updating website after Firebase changes...');
    
    // Step 1: Sync Firebase to website/artists.json
    const syncResult = await syncFirebaseToWebsiteJSON(db, 'website');
    if (!syncResult.success) {
      throw new Error(`Sync failed: ${syncResult.error}`);
    }
    console.log('[Upload] ✅ Synced Firebase to website/artists.json');

    // Step 2: Generate HTML pages
    const generateScript = require(path.join(process.cwd(), 'website', 'scripts', 'generate_artist_pages.js'));
    const generateResult = generateScript.generatePages();
    if (!generateResult.success) {
      throw new Error(`Generate failed: ${generateResult.error}`);
    }
    console.log('[Upload] ✅ Generated HTML pages');

    // Step 3: Deploy to Arweave (with database for incremental uploads)
    const deployResult = await deployWebsiteToArweave('website', db);
    if (!deployResult.success) {
      throw new Error(`Deploy failed: ${deployResult.error}`);
    }
    console.log('[Upload] ✅ Deployed website to Arweave');

    return {
      success: true,
      manifestId: deployResult.manifestId,
      websiteUrl: deployResult.websiteUrl,
      filesUploaded: deployResult.filesUploaded,
      filesUnchanged: deployResult.filesUnchanged || 0,
      totalFiles: deployResult.totalFiles || deployResult.filesUploaded,
      costEstimate: deployResult.costEstimate
    };
  } catch (error) {
    console.error('[Upload] Website update error:', error.message);
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

