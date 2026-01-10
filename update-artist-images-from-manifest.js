/**
 * Update Artist Images from Deployment Manifest
 * 
 * Loads the last deployed website manifest from Firebase,
 * extracts Arweave URLs for artist images, and updates
 * the artist JSON with those URLs.
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try multiple methods to initialize Firebase (same as upload-artists-json.js)
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

  // Method 2: Try environment variable
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      let serviceAccount;
      let keyString = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      
      if ((keyString.startsWith('"') && keyString.endsWith('"')) || 
          (keyString.startsWith("'") && keyString.endsWith("'"))) {
        keyString = keyString.slice(1, -1);
      }
      
      try {
        serviceAccount = JSON.parse(keyString);
      } catch (e) {
        const envPath = path.join(__dirname, '.env.production');
        if (fs.existsSync(envPath)) {
          const envContent = fs.readFileSync(envPath, 'utf-8');
          const match = envContent.match(/^FIREBASE_SERVICE_ACCOUNT_KEY=(.+?)(?=^[A-Z_]+=|$)/ms);
          if (match) {
            let rawKey = match[1].trim();
            if ((rawKey.startsWith('"') && rawKey.endsWith('"')) || 
                (rawKey.startsWith("'") && rawKey.endsWith("'"))) {
              rawKey = rawKey.slice(1, -1);
            }
            rawKey = rawKey.replace(/"private_key"\s*:\s*"([^"]*(?:\n[^"]*)*)"/g, (match, keyContent) => {
              const escaped = keyContent.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
              return `"private_key":"${escaped}"`;
            });
            serviceAccount = JSON.parse(rawKey);
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

async function updateArtistImagesFromManifest() {
  try {
    console.log('🔄 Loading deployment manifest from Firebase...\n');
    
    // Initialize Firebase
    await initializeFirebase();
    const db = admin.firestore();
    
    // Load manifest from Firebase
    const manifestRef = db.collection('system').doc('deployment-manifest');
    const manifestDoc = await manifestRef.get();
    
    if (!manifestDoc.exists) {
      throw new Error('No deployment manifest found in Firebase. Deploy the website first.');
    }
    
    const manifestData = manifestDoc.data();
    const files = manifestData.files || {};
    
    console.log(`📋 Loaded manifest with ${Object.keys(files).length} files\n`);
    
    // Load artist JSON
    const artistsJsonPath = path.join(__dirname, 'COMPLETE_ARTISTS_JSON.json');
    const artistsData = JSON.parse(fs.readFileSync(artistsJsonPath, 'utf-8'));
    
    console.log(`📋 Loaded ${artistsData.length} artists from JSON\n`);
    
    // Map artist image paths to artist names
    const artistImageMap = {};
    artistsData.forEach(artist => {
      const imagePath = artist.artistImageFilename;
      if (imagePath && imagePath.startsWith('img/artists/')) {
        artistImageMap[imagePath] = artist.artistName;
      }
    });
    
    console.log('🔍 Looking for artist images in manifest...\n');
    
    // Find artist images in manifest and construct Arweave URLs
    const updates = [];
    let foundCount = 0;
    let notFoundCount = 0;
    
    for (const [filePath, fileData] of Object.entries(files)) {
      // Check if this is an artist image
      if (filePath.startsWith('img/artists/')) {
        const artistName = artistImageMap[filePath];
        if (artistName) {
          const transactionId = fileData.transactionId;
          if (transactionId) {
            // Construct Arweave URL
            const arweaveUrl = `https://arweave.net/${transactionId}`;
            
            updates.push({
              artistName,
              oldPath: filePath,
              arweaveUrl,
              transactionId
            });
            
            foundCount++;
            console.log(`✅ Found: ${artistName}`);
            console.log(`   Path: ${filePath}`);
            console.log(`   URL: ${arweaveUrl}\n`);
          } else {
            console.warn(`⚠️  ${filePath} has no transactionId\n`);
            notFoundCount++;
          }
        } else {
          console.log(`ℹ️  ${filePath} not mapped to any artist\n`);
        }
      }
    }
    
    if (updates.length === 0) {
      console.log('❌ No artist images found in manifest to update\n');
      return;
    }
    
    console.log(`\n📊 Summary:`);
    console.log(`   Found: ${foundCount}`);
    console.log(`   Not found: ${notFoundCount}`);
    console.log(`   Total updates: ${updates.length}\n`);
    
    // Update artist JSON
    console.log('🔄 Updating artist JSON...\n');
    
    let updatedCount = 0;
    artistsData.forEach(artist => {
      const update = updates.find(u => u.artistName === artist.artistName);
      if (update) {
        // Initialize artistThumbnails array if it doesn't exist
        if (!artist.artistThumbnails) {
          artist.artistThumbnails = [];
        }
        
        // Add Arweave URL to thumbnails if not already present
        if (!artist.artistThumbnails.includes(update.arweaveUrl)) {
          artist.artistThumbnails.push(update.arweaveUrl);
          console.log(`✅ Updated ${artist.artistName}: Added Arweave URL to thumbnails`);
        } else {
          console.log(`ℹ️  ${artist.artistName}: URL already in thumbnails`);
        }
        
        // Update artistImageFilename for backward compatibility (use first thumbnail)
        if (artist.artistThumbnails.length > 0) {
          artist.artistImageFilename = artist.artistThumbnails[0];
        }
        
        updatedCount++;
      }
    });
    
    // Save updated JSON
    await fs.writeFile(artistsJsonPath, JSON.stringify(artistsData, null, 2) + '\n', 'utf-8');
    
    console.log(`\n✅ Updated ${updatedCount} artists in COMPLETE_ARTISTS_JSON.json`);
    console.log(`📁 File saved: ${artistsJsonPath}\n`);
    
    // Also update Firebase
    console.log('🔄 Updating Firebase artists collection...\n');
    const artistsRef = db.collection('system').doc('artists');
    await artistsRef.set({ artists: artistsData }, { merge: false });
    console.log('✅ Updated Firebase artists collection\n');
    
    console.log('✨ All done!\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

updateArtistImagesFromManifest();








