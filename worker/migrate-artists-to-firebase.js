/**
 * Migration script to merge original sample-artists.json with existing Firebase data
 * This preserves any new mixes/uploads while restoring all original artists
 * 
 * Usage: node worker/migrate-artists-to-firebase.js
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.production (Vercel env vars) or .env
config({ path: path.join(__dirname, '..', '.env.production') });
config({ path: path.join(__dirname, '..', '.env') });
config({ path: path.join(__dirname, '.env') });

// Fix FIREBASE_SERVICE_ACCOUNT_KEY if dotenv mangled it
// Read directly from .env.production to get the correct format
try {
  const envProdPath = path.join(__dirname, '..', '.env.production');
  if (fs.existsSync(envProdPath)) {
    const envContent = fs.readFileSync(envProdPath, 'utf8');
    // Match FIREBASE_SERVICE_ACCOUNT_KEY= followed by the JSON (which may span multiple lines)
    const keyMatch = envContent.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.+?)(?=^[A-Z_]+=|$)/ms);
    if (keyMatch) {
      let keyValue = keyMatch[1].trim();
      // Remove outer quotes if present (single or double, at start and end)
      if ((keyValue.startsWith('"') && keyValue.endsWith('"')) || 
          (keyValue.startsWith("'") && keyValue.endsWith("'"))) {
        keyValue = keyValue.slice(1, -1);
      }
      
      // The private_key field contains literal newlines that need to be escaped for JSON
      // We need to escape newlines within string values, but preserve the JSON structure
      // Strategy: Find all string values and escape newlines within them
      
      // First, try to parse as-is (in case it's already properly formatted)
      try {
        JSON.parse(keyValue);
        process.env.FIREBASE_SERVICE_ACCOUNT_KEY = keyValue;
        console.log('[Migration] ✅ FIREBASE_SERVICE_ACCOUNT_KEY is already valid JSON');
      } catch (firstError) {
        // If parsing fails, the issue is likely literal newlines in string values
        // We need to escape newlines that appear within quoted strings
        // This is tricky - we'll use a regex to find string values and escape newlines within them
        let fixed = keyValue;
        
        // Replace literal newlines with escaped newlines, but be careful not to break the JSON structure
        // The private_key field is the main culprit - it has literal newlines
        fixed = fixed.replace(/(["'])([^"']*?)\1/g, (match, quote, content) => {
          // Escape newlines within the string content
          const escaped = content
            .replace(/\r\n/g, '\\n')
            .replace(/\r/g, '\\n')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t');
          return quote + escaped + quote;
        });
        
        try {
          const parsed = JSON.parse(fixed);
          // Re-stringify to ensure proper formatting
          process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(parsed);
          console.log('[Migration] ✅ Fixed FIREBASE_SERVICE_ACCOUNT_KEY by escaping newlines');
        } catch (secondError) {
          // Last resort: try a simpler approach - just escape all newlines globally
          fixed = keyValue
            .replace(/\r\n/g, '\\n')
            .replace(/\r/g, '\\n')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t');
          
          try {
            const parsed = JSON.parse(fixed);
            process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify(parsed);
            console.log('[Migration] ✅ Fixed FIREBASE_SERVICE_ACCOUNT_KEY with global newline escape');
          } catch (thirdError) {
            console.warn('[Migration] ❌ Could not fix FIREBASE_SERVICE_ACCOUNT_KEY:', thirdError.message);
            console.warn('[Migration] First 200 chars:', keyValue.substring(0, 200));
          }
        }
      }
    }
  }
} catch (error) {
  console.warn('[Migration] Could not fix FIREBASE_SERVICE_ACCOUNT_KEY from file:', error.message);
}

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

async function migrateArtists() {
  try {
    console.log('[Migration] Starting artists migration to Firebase...');
    
    // Load original artists JSON
    const artistsPaths = [
      path.join(__dirname, 'data', 'sample-artists.json'),
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
      console.error('[Migration] ❌ No original artists data found');
      process.exit(1);
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
    console.log(`[Migration] Firebase path: system/artists`);
    
    // Verify
    const verifyDoc = await artistsRef.get();
    if (verifyDoc.exists) {
      const verifyData = verifyDoc.data();
      console.log(`[Migration] ✅ Verification: ${verifyData.artists.length} artists in Firebase`);
      
      // Show summary
      verifyData.artists.forEach(artist => {
        const mixCount = artist.mixes ? artist.mixes.length : 0;
        const traxCount = artist.trax ? artist.trax.length : 0;
        console.log(`  - ${artist.artistName}: ${mixCount} mixes, ${traxCount} tracks`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

migrateArtists();

