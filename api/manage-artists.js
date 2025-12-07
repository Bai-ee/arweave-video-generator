/**
 * API endpoint for managing artists JSON in Firebase
 * POST /api/manage-artists
 * 
 * Supports:
 * - addArtist: Add a new artist
 * - addMix: Add a mix to an existing artist (by URL or Arweave URL)
 * - addTrack: Add a track to an existing artist (by URL or Arweave URL)
 * - updateArtist: Update artist properties
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

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
    const { action, artistName, mixUrl, mixTitle, mixDateYear, mixDuration, mixImageFilename, isTrack, artistGenre } = req.body;

    if (!action || !artistName) {
      return res.status(400).json({
        success: false,
        error: 'action and artistName are required'
      });
    }

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();

    let result;

    switch (action) {
      case 'addMix':
        if (!mixUrl) {
          return res.status(400).json({
            success: false,
            error: 'mixUrl is required for addMix action'
          });
        }
        result = await addMixToArtist(db, artistName, {
          mixTitle: mixTitle || 'Untitled Mix',
          mixArweaveURL: mixUrl,
          mixDateYear: mixDateYear || new Date().getFullYear().toString(),
          mixDuration: mixDuration || '0:00',
          mixImageFilename: mixImageFilename || '',
          isTrack: false
        });
        break;

      case 'addTrack':
        if (!mixUrl) {
          return res.status(400).json({
            success: false,
            error: 'mixUrl is required for addTrack action'
          });
        }
        result = await addMixToArtist(db, artistName, {
          mixTitle: mixTitle || 'Untitled Track',
          mixArweaveURL: mixUrl,
          mixDateYear: mixDateYear || new Date().getFullYear().toString(),
          mixDuration: mixDuration || '0:00',
          mixImageFilename: mixImageFilename || '',
          isTrack: true
        });
        break;

      case 'updateArtist':
        result = await updateArtist(db, artistName, {
          genre: artistGenre
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}. Supported: addMix, addTrack, updateArtist`
        });
    }

    // Update website (non-blocking - don't fail if website update fails)
    let websiteUpdateResult = null;
    try {
      websiteUpdateResult = await updateWebsite(db);
    } catch (websiteError) {
      console.warn('[Manage Artists] Website update failed (non-blocking):', websiteError.message);
    }

    return res.status(200).json({
      success: true,
      action: action,
      artistName: artistName,
      result: result,
      message: `Successfully ${action} for ${artistName}`,
      websiteUpdate: websiteUpdateResult
    });

  } catch (error) {
    console.error('[Manage Artists] Error:', error.message);
    return res.status(500).json({ 
      success: false,
      error: 'Failed to manage artists',
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
      console.log(`[Manage Artists] Created new artist: ${artistName}`);
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
      console.log(`[Manage Artists] Added track "${mixData.mixTitle}" to ${artistName}`);
    } else {
      // Add as mix
      if (!artist.mixes) {
        artist.mixes = [];
      }
      artist.mixes.push(mixEntry);
      console.log(`[Manage Artists] Added mix "${mixData.mixTitle}" to ${artistName}`);
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Manage Artists] ✅ Updated artists JSON in Firebase`);
    
    return { added: true, artistName: artistName };
    
  } catch (error) {
    console.error('[Manage Artists] Error updating artists JSON:', error.message);
    throw error;
  }
}

/**
 * Update website after Firebase changes (sync, regenerate, deploy)
 * Non-blocking - errors are logged but don't throw
 */
async function updateWebsite(db) {
  try {
    console.log('[Manage Artists] Updating website after Firebase changes...');
    
    // Step 1: Sync Firebase to website/artists.json
    const syncResult = await syncFirebaseToWebsiteJSON(db, 'website');
    if (!syncResult.success) {
      throw new Error(`Sync failed: ${syncResult.error}`);
    }
    console.log('[Manage Artists] ✅ Synced Firebase to website/artists.json');

    // Step 2: Generate HTML pages
    const generateScript = require(path.join(process.cwd(), 'website', 'scripts', 'generate_artist_pages.js'));
    const generateResult = generateScript.generatePages();
    if (!generateResult.success) {
      throw new Error(`Generate failed: ${generateResult.error}`);
    }
    console.log('[Manage Artists] ✅ Generated HTML pages');

    // Step 3: Deploy to Arweave
    const deployResult = await deployWebsiteToArweave('website');
    if (!deployResult.success) {
      throw new Error(`Deploy failed: ${deployResult.error}`);
    }
    console.log('[Manage Artists] ✅ Deployed website to Arweave');

    return {
      success: true,
      manifestId: deployResult.manifestId,
      websiteUrl: deployResult.websiteUrl,
      filesUploaded: deployResult.filesUploaded
    };
  } catch (error) {
    console.error('[Manage Artists] Website update error:', error.message);
    throw error;
  }
}

/**
 * Update artist properties
 */
async function updateArtist(db, artistName, updates) {
  try {
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    let artistsData = [];
    if (artistsDoc.exists) {
      artistsData = artistsDoc.data().artists || [];
    }

    // Find artist
    const artist = artistsData.find(a => a.artistName === artistName);
    
    if (!artist) {
      throw new Error(`Artist "${artistName}" not found`);
    }

    // Update properties
    if (updates.genre) {
      artist.artistGenre = updates.genre;
    }

    // Save back to Firebase
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log(`[Manage Artists] ✅ Updated artist ${artistName} in Firebase`);
    
    return { updated: true, artistName: artistName };
    
  } catch (error) {
    console.error('[Manage Artists] Error updating artist:', error.message);
    throw error;
  }
}

