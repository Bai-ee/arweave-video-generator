/**
 * Upload Overlay Videos from assets/ folders to Firebase Storage
 * 
 * This script uploads videos from specific asset folders to Firebase Storage
 * These videos will be used as overlay effects in video generation
 * 
 * Usage: node upload-overlay-videos.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { initializeFirebaseAdmin, getStorage } from './firebase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env if it exists
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  });
}

// Define overlay video folders (folders in assets/ that should be used for overlay effects)
// Exclude chicago-skyline-videos as that's for background videos, not overlays
const OVERLAY_FOLDERS = ['analog_film', 'gritt', 'noise', 'retro_dust'];
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Supported video extensions
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'];

async function uploadOverlayVideos() {
  console.log('\n📤 Uploading Overlay Videos from assets/ to Firebase Storage\n');
  console.log('='.repeat(60));
  console.log(`📁 Overlay folders: ${OVERLAY_FOLDERS.join(', ')}\n`);

  try {
    // Initialize Firebase
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();

    // Check if assets directory exists
    if (!await fs.pathExists(ASSETS_DIR)) {
      throw new Error(`Assets directory not found: ${ASSETS_DIR}`);
    }

    const allUploadResults = [];

    // Process each overlay folder
    for (const folderName of OVERLAY_FOLDERS) {
      const folderPath = path.join(ASSETS_DIR, folderName);
      const storagePath = `assets/${folderName}`;

      console.log(`\n📂 Processing folder: ${folderName}`);
      console.log(`   Local path: ${folderPath}`);
      console.log(`   Storage path: ${storagePath}`);

      if (!await fs.pathExists(folderPath)) {
        console.warn(`   ⚠️  Folder not found, skipping...`);
        continue;
      }

      // Get all video files in this folder
      const files = await fs.readdir(folderPath);
      const videoFiles = files.filter(file => {
        const ext = path.extname(file).toLowerCase();
        return VIDEO_EXTENSIONS.includes(ext) && !file.startsWith('.');
      });

      if (videoFiles.length === 0) {
        console.warn(`   ⚠️  No video files found in ${folderName}`);
        continue;
      }

      console.log(`   📹 Found ${videoFiles.length} video file(s)\n`);

      // Upload each video
      for (const fileName of videoFiles) {
        const filePath = path.join(folderPath, fileName);
        const storageFilePath = `${storagePath}/${fileName}`;

        try {
          console.log(`   📤 Uploading: ${fileName}`);
          const stats = await fs.stat(filePath);
          console.log(`      Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

          // Check if file already exists in Firebase
          const file = bucket.file(storageFilePath);
          const [exists] = await file.exists();

          if (exists) {
            console.log(`      ⏭️  Already exists in Firebase, skipping...`);
            allUploadResults.push({
              folder: folderName,
              fileName,
              storagePath: storageFilePath,
              skipped: true
            });
            continue;
          }

          // Upload to Firebase Storage
          await bucket.upload(filePath, {
            destination: storageFilePath,
            metadata: {
              contentType: 'video/mp4',
              metadata: {
                uploadedAt: new Date().toISOString(),
                type: 'overlay-effect',
                folder: folderName,
                source: 'assets'
              }
            }
          });

          // Make file publicly accessible
          await file.makePublic();

          // Get public URL
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storageFilePath}`;
          
          console.log(`      ✅ Uploaded successfully`);
          console.log(`      🔗 Public URL: ${publicUrl}\n`);

          allUploadResults.push({
            folder: folderName,
            fileName,
            storagePath: storageFilePath,
            publicUrl,
            size: stats.size,
            success: true
          });

        } catch (error) {
          console.error(`      ❌ Failed to upload ${fileName}:`, error.message);
          allUploadResults.push({
            folder: folderName,
            fileName,
            error: error.message,
            success: false
          });
        }
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Upload Summary:\n');
    
    const successful = allUploadResults.filter(r => r.success);
    const skipped = allUploadResults.filter(r => r.skipped);
    const failed = allUploadResults.filter(r => r.error);

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`⏭️  Skipped (already exists): ${skipped.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    
    if (successful.length > 0) {
      const totalSize = successful.reduce((sum, r) => sum + (r.size || 0), 0);
      console.log(`\n💾 Total size uploaded: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      
      // Group by folder
      const byFolder = {};
      successful.forEach(r => {
        if (!byFolder[r.folder]) byFolder[r.folder] = [];
        byFolder[r.folder].push(r);
      });
      
      console.log('\n📋 Uploaded videos by folder:');
      Object.entries(byFolder).forEach(([folder, videos]) => {
        console.log(`\n   ${folder}/ (${videos.length} videos):`);
        videos.forEach(v => {
          console.log(`      - ${v.fileName}`);
        });
      });
    }

    if (skipped.length > 0) {
      console.log('\n⏭️  Skipped videos (already in Firebase):');
      const byFolder = {};
      skipped.forEach(r => {
        if (!byFolder[r.folder]) byFolder[r.folder] = [];
        byFolder[r.folder].push(r.fileName);
      });
      Object.entries(byFolder).forEach(([folder, files]) => {
        console.log(`   ${folder}/: ${files.length} files`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed uploads:');
      failed.forEach(r => {
        console.log(`   - ${r.folder}/${r.fileName}: ${r.error}`);
      });
    }

    console.log('\n✨ Upload complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run upload
uploadOverlayVideos();






