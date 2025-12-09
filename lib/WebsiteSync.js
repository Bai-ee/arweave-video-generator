/**
 * Website Sync Module
 * Syncs Firebase system/artists collection to website/artists.json
 * Converts Firebase format to UndergroundExistence website format
 */

import fs from 'fs-extra';
import path from 'path';

/**
 * Sync Firebase artists to website artists.json
 * @param {Object} db - Firestore database instance
 * @param {string} websiteDir - Path to website directory (default: 'website')
 * @returns {Promise<Object>} Sync result
 */
export async function syncFirebaseToWebsiteJSON(db, websiteDir = 'website') {
  try {
    console.log('[WebsiteSync] Starting sync from Firebase to website/artists.json...');
    
    // Read from Firebase
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    if (!artistsDoc.exists) {
      console.warn('[WebsiteSync] No artists found in Firebase - creating empty artists.json');
      // Create empty artists.json instead of failing
      const websitePath = path.join(process.cwd(), websiteDir);
      const artistsJsonPath = path.join(websitePath, 'artists.json');
      await fs.ensureDir(websitePath);
      await fs.writeJSON(artistsJsonPath, [], { spaces: 2 });
      return {
        success: true,
        artistsCount: 0,
        filePath: artistsJsonPath,
        warning: 'No artists found in Firebase, created empty artists.json'
      };
    }
    
    const firebaseData = artistsDoc.data();
    const firebaseArtists = firebaseData.artists || [];
    
    if (firebaseArtists.length === 0) {
      console.warn('[WebsiteSync] Artists array is empty in Firebase - creating empty artists.json');
      // Create empty artists.json instead of failing
      const websitePath = path.join(process.cwd(), websiteDir);
      const artistsJsonPath = path.join(websitePath, 'artists.json');
      await fs.ensureDir(websitePath);
      await fs.writeJSON(artistsJsonPath, [], { spaces: 2 });
      return {
        success: true,
        artistsCount: 0,
        filePath: artistsJsonPath,
        warning: 'Artists array is empty, created empty artists.json'
      };
    }
    
    console.log(`[WebsiteSync] Found ${firebaseArtists.length} artists in Firebase`);
    
    // Convert Firebase format to website format
    const websiteArtists = firebaseArtists.map(firebaseArtist => {
      const websiteArtist = {
        artistName: firebaseArtist.artistName || '',
        artistFilename: firebaseArtist.artistFilename || generateFilename(firebaseArtist.artistName),
        artistImageFilename: firebaseArtist.artistImageFilename || '',
        artistGenre: firebaseArtist.artistGenre || 'electronic',
        mixes: []
      };
      
      // Convert mixes (only mixes, not tracks)
      if (firebaseArtist.mixes && Array.isArray(firebaseArtist.mixes)) {
        websiteArtist.mixes = firebaseArtist.mixes.map(mix => ({
          mixTitle: mix.mixTitle || 'Untitled Mix',
          mixArweaveURL: mix.mixArweaveURL || '',
          mixDateYear: mix.mixDateYear || '',
          mixDuration: mix.mixDuration || '0:00',
          mixImageFilename: mix.mixImageFilename || firebaseArtist.artistImageFilename || ''
        }));
      }
      
      return websiteArtist;
    });
    
    // Write to website/artists.json
    // In Vercel production, we can't write to /var/task (read-only file system)
    // Try to write to /tmp directory which is writable in Vercel
    const isVercelProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    
    const websitePath = path.join(process.cwd(), websiteDir);
    let artistsJsonPath = path.join(websitePath, 'artists.json');
    let actualFilePath = artistsJsonPath;
    
    if (isVercelProduction) {
      // In Vercel, write to /tmp directory which is writable
      const tmpPath = '/tmp';
      const tmpArtistsJsonPath = path.join(tmpPath, 'artists.json');
      
      try {
        await fs.ensureDir(tmpPath);
        await fs.writeJSON(tmpArtistsJsonPath, websiteArtists, { spaces: 2 });
        actualFilePath = tmpArtistsJsonPath;
        console.log(`[WebsiteSync] ✅ Wrote artists.json to /tmp (Vercel production mode)`);
        console.log(`[WebsiteSync] ✅ Synced ${websiteArtists.length} artists`);
      } catch (tmpError) {
        console.warn('[WebsiteSync] ⚠️ Failed to write to /tmp, will use in-memory content:', tmpError.message);
        // Fall back to in-memory only
        actualFilePath = null;
      }
    } else {
      // In development/local, write to normal location
      await fs.ensureDir(websitePath);
      await fs.writeJSON(artistsJsonPath, websiteArtists, { spaces: 2 });
      console.log(`[WebsiteSync] ✅ Synced ${websiteArtists.length} artists to ${artistsJsonPath}`);
    }
    
    // Always return JSON content for in-memory use if file write fails
    const jsonContent = JSON.stringify(websiteArtists, null, 2);
    
    return {
      success: true,
      artistsCount: websiteArtists.length,
      filePath: actualFilePath,
      jsonContent: jsonContent, // Include JSON content for in-memory use
      skipped: actualFilePath === null
    };
    
  } catch (error) {
    console.error('[WebsiteSync] Error syncing Firebase to website:', error.message);
    return {
      success: false,
      error: error.message,
      artistsCount: 0
    };
  }
}

/**
 * Generate filename from artist name
 * @param {string} artistName - Artist name
 * @returns {string} Filename
 */
function generateFilename(artistName) {
  if (!artistName) return 'unknown.html';
  return artistName.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/\s+/g, '')
    + '.html';
}

/**
 * Sync website artists.json to Firebase (reverse sync - optional)
 * @param {Object} db - Firestore database instance
 * @param {string} websiteDir - Path to website directory (default: 'website')
 * @returns {Promise<Object>} Sync result
 */
export async function syncWebsiteJSONToFirebase(db, websiteDir = 'website') {
  try {
    console.log('[WebsiteSync] Starting sync from website/artists.json to Firebase...');
    
    const websitePath = path.join(process.cwd(), websiteDir);
    const artistsJsonPath = path.join(websitePath, 'artists.json');
    
    if (!await fs.pathExists(artistsJsonPath)) {
      return {
        success: false,
        error: 'website/artists.json not found',
        artistsCount: 0
      };
    }
    
    // Read website artists.json
    const websiteArtists = await fs.readJSON(artistsJsonPath);
    
    if (!Array.isArray(websiteArtists)) {
      return {
        success: false,
        error: 'Invalid artists.json format - expected array',
        artistsCount: 0
      };
    }
    
    // Convert website format to Firebase format
    const firebaseArtists = websiteArtists.map(websiteArtist => {
      const firebaseArtist = {
        artistName: websiteArtist.artistName || '',
        artistFilename: websiteArtist.artistFilename || generateFilename(websiteArtist.artistName),
        artistImageFilename: websiteArtist.artistImageFilename || '',
        artistGenre: websiteArtist.artistGenre || 'electronic',
        mixes: [],
        trax: [] // Initialize trax array
      };
      
      // Convert mixes
      if (websiteArtist.mixes && Array.isArray(websiteArtist.mixes)) {
        firebaseArtist.mixes = websiteArtist.mixes.map(mix => ({
          mixTitle: mix.mixTitle || 'Untitled Mix',
          mixArweaveURL: mix.mixArweaveURL || '',
          mixDateYear: mix.mixDateYear || '',
          mixDuration: mix.mixDuration || '0:00',
          mixImageFilename: mix.mixImageFilename || ''
        }));
      }
      
      return firebaseArtist;
    });
    
    // Write to Firebase
    const artistsRef = db.collection('system').doc('artists');
    await artistsRef.set({ artists: firebaseArtists }, { merge: false });
    
    console.log(`[WebsiteSync] ✅ Synced ${firebaseArtists.length} artists to Firebase`);
    
    return {
      success: true,
      artistsCount: firebaseArtists.length
    };
    
  } catch (error) {
    console.error('[WebsiteSync] Error syncing website to Firebase:', error.message);
    return {
      success: false,
      error: error.message,
      artistsCount: 0
    };
  }
}

