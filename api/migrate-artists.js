/**
 * API endpoint to migrate original artists JSON to Firebase
 * This merges the original sample-artists.json with existing Firebase data
 * 
 * POST /api/migrate-artists
 */

import fs from 'fs-extra';
import path from 'path';
import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

/**
 * Merge two artist objects, combining mixes and trax arrays
 */
function mergeArtist(originalArtist, firebaseArtist) {
  const merged = { ...originalArtist };
  
  // Merge mixes - avoid duplicates by checking mixArweaveURL
  const mixMap = new Map();
  
  // Add original mixes
  if (originalArtist.mixes && Array.isArray(originalArtist.mixes)) {
    originalArtist.mixes.forEach(mix => {
      if (mix.mixArweaveURL) {
        mixMap.set(mix.mixArweaveURL, mix);
      }
    });
  }
  
  // Add Firebase mixes (these will overwrite if same URL, preserving new data)
  if (firebaseArtist.mixes && Array.isArray(firebaseArtist.mixes)) {
    firebaseArtist.mixes.forEach(mix => {
      if (mix.mixArweaveURL) {
        mixMap.set(mix.mixArweaveURL, mix);
      }
    });
  }
  
  merged.mixes = Array.from(mixMap.values());
  
  // Merge trax - avoid duplicates by checking trackArweaveURL or arweaveURL
  const traxMap = new Map();
  
  // Add original trax
  if (originalArtist.trax && Array.isArray(originalArtist.trax)) {
    originalArtist.trax.forEach(track => {
      const url = track.trackArweaveURL || track.arweaveURL;
      if (url) {
        traxMap.set(url, track);
      }
    });
  }
  
  // Add Firebase trax
  if (firebaseArtist.trax && Array.isArray(firebaseArtist.trax)) {
    firebaseArtist.trax.forEach(track => {
      const url = track.trackArweaveURL || track.arweaveURL;
      if (url) {
        traxMap.set(url, track);
      }
    });
  }
  
  merged.trax = Array.from(traxMap.values());
  
  // Preserve Firebase image if it exists (might be newer)
  if (firebaseArtist.artistImageFilename) {
    merged.artistImageFilename = firebaseArtist.artistImageFilename;
  }
  
  return merged;
}

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

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
    console.log('[Migration] Starting artists migration to Firebase...');
    
    // Load original artists JSON
    const artistsPaths = [
      path.join(process.cwd(), 'worker', 'data', 'sample-artists.json'),
      path.join(process.cwd(), 'data', 'sample-artists.json')
    ];

    let originalArtists = null;
    for (const artistsPath of artistsPaths) {
      try {
        if (fs.existsSync(artistsPath)) {
          originalArtists = JSON.parse(fs.readFileSync(artistsPath, 'utf-8'));
          console.log(`[Migration] Loaded ${originalArtists.length} original artists from ${artistsPath}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!originalArtists || originalArtists.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'No original artists data found' 
      });
    }

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();
    const artistsRef = db.collection('system').doc('artists');
    
    // Load existing Firebase data
    let firebaseArtists = [];
    const firebaseDoc = await artistsRef.get();
    if (firebaseDoc.exists) {
      const firebaseData = firebaseDoc.data();
      firebaseArtists = firebaseData.artists || [];
      console.log(`[Migration] Found ${firebaseArtists.length} existing artists in Firebase`);
    } else {
      console.log('[Migration] No existing Firebase data found - will create new');
    }
    
    // Create a map of Firebase artists by name for quick lookup
    const firebaseArtistMap = new Map();
    firebaseArtists.forEach(artist => {
      firebaseArtistMap.set(artist.artistName, artist);
    });
    
    // Merge artists: start with original, then merge in Firebase data
    const mergedArtists = originalArtists.map(originalArtist => {
      const firebaseArtist = firebaseArtistMap.get(originalArtist.artistName);
      if (firebaseArtist) {
        console.log(`[Migration] Merging ${originalArtist.artistName}...`);
        return mergeArtist(originalArtist, firebaseArtist);
      } else {
        return originalArtist;
      }
    });
    
    // Add any Firebase artists that don't exist in original (shouldn't happen, but just in case)
    originalArtists.forEach(artist => {
      firebaseArtistMap.delete(artist.artistName);
    });
    
    // Add any remaining Firebase artists (new ones not in original)
    firebaseArtistMap.forEach((artist, name) => {
      console.log(`[Migration] Adding new artist from Firebase: ${name}`);
      mergedArtists.push(artist);
    });
    
    // Upload merged data to Firebase
    await artistsRef.set({ artists: mergedArtists }, { merge: false });

    console.log(`[Migration] ✅ Successfully merged and uploaded ${mergedArtists.length} artists to Firebase`);
    
    // Verify
    const verifyDoc = await artistsRef.get();
    let summary = [];
    if (verifyDoc.exists) {
      const verifyData = verifyDoc.data();
      summary = verifyData.artists.map(artist => ({
        name: artist.artistName,
        mixes: artist.mixes ? artist.mixes.length : 0,
        tracks: artist.trax ? artist.trax.length : 0
      }));
    }

    return res.status(200).json({
      success: true,
      message: `Successfully migrated ${mergedArtists.length} artists to Firebase`,
      artistsCount: mergedArtists.length,
      summary: summary
    });

  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    console.error(error.stack);
    return res.status(500).json({ 
      success: false,
      error: 'Migration failed',
      message: error.message 
    });
  }
}

