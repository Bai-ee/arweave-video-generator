/**
 * Force Upload Specific Files
 * 
 * Marks specific files as "changed" in the deployment manifest
 * so they will be re-uploaded on next deployment
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env') });

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import fs from 'fs-extra';
import path from 'path';

const filesToForce = [
  'img/covers/ue_banner.jpg',
  'img/loge_horiz.png',
  'fonts/IBM_Plex_Mono,Rationale,Shantell_Sans/Rationale/Rationale-Regular.ttf'
];

async function forceUploadFiles() {
  try {
    console.log('🔄 Force Upload Files\n');
    console.log('='.repeat(60));
    
    // Initialize Firebase
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Load current manifest
    const manifestRef = db.collection('system').doc('deployment-manifest');
    const manifestDoc = await manifestRef.get();
    
    if (!manifestDoc.exists) {
      console.log('ℹ️  No existing manifest found - all files will be uploaded on next deployment');
      return;
    }
    
    const manifest = manifestDoc.data();
    const files = manifest.files || {};
    
    console.log(`📋 Current manifest has ${Object.keys(files).length} files\n`);
    
    // Remove specified files from manifest (or modify their hash to force re-upload)
    let updated = false;
    for (const filePath of filesToForce) {
      if (files[filePath]) {
        // Delete the entry so it will be treated as new
        delete files[filePath];
        updated = true;
        console.log(`✅ Removed from manifest: ${filePath}`);
      } else {
        console.log(`ℹ️  Not in manifest (will be uploaded): ${filePath}`);
      }
    }
    
    if (updated) {
      // Save updated manifest
      await manifestRef.set({
        files: files,
        lastUpdated: new Date().toISOString(),
        totalFiles: Object.keys(files).length,
        forceUploaded: new Date().toISOString()
      }, { merge: false });
      
      console.log(`\n✅ Manifest updated! Removed ${filesToForce.length} file(s) from manifest.`);
      console.log(`\n💡 Next deployment will upload these files as new files.`);
    } else {
      console.log(`\nℹ️  No changes needed - files are already marked for upload.`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

forceUploadFiles();
