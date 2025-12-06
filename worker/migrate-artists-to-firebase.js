/**
 * Migration script to upload existing sample-artists.json to Firebase
 * Run this once to initialize the Firebase artists database
 * 
 * Usage: node worker/migrate-artists-to-firebase.js
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeFirebaseAdmin, getFirestore } from './firebase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateArtists() {
  try {
    console.log('[Migration] Starting artists migration to Firebase...');
    
    // Load existing artists JSON
    const artistsPaths = [
      path.join(__dirname, 'data', 'sample-artists.json'),
      path.join(process.cwd(), 'worker', 'data', 'sample-artists.json'),
      path.join(process.cwd(), 'data', 'sample-artists.json')
    ];

    let artistsData = null;
    for (const artistsPath of artistsPaths) {
      try {
        if (fs.existsSync(artistsPath)) {
          artistsData = JSON.parse(fs.readFileSync(artistsPath, 'utf-8'));
          console.log(`[Migration] Loaded ${artistsData.length} artists from ${artistsPath}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!artistsData || artistsData.length === 0) {
      console.error('[Migration] ❌ No artists data found to migrate');
      process.exit(1);
    }

    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();

    // Upload to Firebase
    const artistsRef = db.collection('system').doc('artists');
    await artistsRef.set({ artists: artistsData }, { merge: false });

    console.log(`[Migration] ✅ Successfully migrated ${artistsData.length} artists to Firebase`);
    console.log(`[Migration] Firebase path: system/artists`);
    
    // Verify
    const verifyDoc = await artistsRef.get();
    if (verifyDoc.exists) {
      const verifyData = verifyDoc.data();
      console.log(`[Migration] ✅ Verification: ${verifyData.artists.length} artists in Firebase`);
    }

    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Error:', error.message);
    process.exit(1);
  }
}

migrateArtists();

