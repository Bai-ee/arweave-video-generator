/**
 * Upload complete artists JSON to Firebase
 * This script reads COMPLETE_ARTISTS_JSON.json and uploads it directly to Firebase
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple methods to initialize Firebase
async function initializeFirebase() {
  // Method 1: Try service account JSON file
  const serviceAccountPaths = [
    path.join(__dirname, 'service-account.json'),
    path.join(__dirname, 'firebase-service-account.json'),
    path.join(process.cwd(), 'service-account.json'),
    path.join(process.cwd(), 'firebase-service-account.json')
  ];

  for (const serviceAccountPath of serviceAccountPaths) {
    if (fs.existsSync(serviceAccountPath)) {
      try {
        const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'editvideos-63486.firebasestorage.app'
        });
        console.log('✅ Firebase initialized from service account file');
        return admin;
      } catch (error) {
        console.warn(`Failed to use ${serviceAccountPath}:`, error.message);
      }
    }
  }

  // Method 2: Try environment variable with aggressive parsing
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      let serviceAccount;
      let keyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      
      // Remove outer quotes
      if ((keyString.startsWith('"') && keyString.endsWith('"')) || 
          (keyString.startsWith("'") && keyString.endsWith("'"))) {
        keyString = keyString.slice(1, -1);
      }
      
      // Try to parse as-is first
      try {
        serviceAccount = JSON.parse(keyString);
      } catch (e) {
        // If that fails, try reading from .env.production directly
        const envPath = path.join(__dirname, '.env.production');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8');
          const match = envContent.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.+?)(?=^[A-Z_]+=|$)/ms);
          if (match) {
            let rawKey = match[1].trim();
            // Remove quotes
            if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || 
                (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
              rawKey = rawKey.slice(1, -1);
            }
            // The private_key field has literal newlines - we need to escape them for JSON
            // But actually, if it's stored as a string with literal newlines, we need to parse it carefully
            // Let's try to fix it by replacing literal newlines in the private_key value
            rawKey = rawKey.replace(/"private_key"\s*:\s*"([^"]*(?:\n[^"]*)*)"/g, (match, keyContent) => {
              const escaped = keyContent.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
              return `"private_key":"${escaped}"`;
            });
            
            try {
              serviceAccount = JSON.parse(rawKey);
            } catch (e2) {
              throw new Error(`Failed to parse: ${e2.message}`);
            }
          }
        }
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'editvideos-63486.firebasestorage.app'
      });
      console.log('✅ Firebase initialized from environment variable');
      return admin;
    } catch (error) {
      console.error('❌ Failed to initialize from environment variable:', error.message);
    }
  }

  throw new Error('Could not initialize Firebase. Please ensure FIREBASE_SERVICE_ACCOUNT_KEY is set or a service-account.json file exists.');
}

async function uploadArtists() {
  try {
    console.log('🚀 Starting artists JSON upload to Firebase...\n');
    
    // Initialize Firebase
    await initializeFirebase();
    const db = admin.firestore();
    
    // Read the complete artists JSON
    const jsonPath = path.join(__dirname, 'COMPLETE_ARTISTS_JSON.json');
    if (!fs.existsSync(jsonPath)) {
      throw new Error(`JSON file not found: ${jsonPath}`);
    }
    
    const artistsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log(`📋 Loaded ${artistsData.length} artists from COMPLETE_ARTISTS_JSON.json\n`);
    
    // Upload to Firebase
    const artistsRef = db.collection('system').doc('artists');
    await artistsRef.set({ artists: artistsData }, { merge: false });
    
    console.log(`✅ Successfully uploaded ${artistsData.length} artists to Firebase!`);
    console.log(`   Path: system/artists`);
    console.log(`\n📊 Artists uploaded:`);
    artistsData.forEach((artist, i) => {
      const mixCount = artist.mixes ? artist.mixes.length : 0;
      const traxCount = artist.trax ? artist.trax.length : 0;
      console.log(`   ${i + 1}. ${artist.artistName} (${mixCount} mixes, ${traxCount} tracks)`);
    });
    
    // Verify
    const verifyDoc = await artistsRef.get();
    if (verifyDoc.exists) {
      const verifyData = verifyDoc.data();
      console.log(`\n✅ Verification: ${verifyData.artists.length} artists in Firebase`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

uploadArtists();



