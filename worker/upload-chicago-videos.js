/**
 * Upload Chicago Skyline Videos to Firebase Storage
 * Run this script to upload all videos from assets/chicago-skyline-videos/ to Firebase Storage
 * 
 * Usage: node upload-chicago-videos.js
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

const VIDEOS_DIR = path.join(__dirname, '..', 'assets', 'chicago-skyline-videos');
const STORAGE_PATH = 'assets/chicago-skyline-videos';

async function uploadVideos() {
  console.log('\n📤 Uploading Chicago Skyline Videos to Firebase Storage\n');
  console.log('='.repeat(60));

  try {
    // Initialize Firebase
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();

    // Check if videos directory exists
    if (!await fs.pathExists(VIDEOS_DIR)) {
      throw new Error(`Videos directory not found: ${VIDEOS_DIR}`);
    }

    // Get all video files
    const files = await fs.readdir(VIDEOS_DIR);
    const videoFiles = files.filter(file => file.endsWith('.mp4'));

    if (videoFiles.length === 0) {
      throw new Error('No video files found in directory');
    }

    console.log(`\n📁 Found ${videoFiles.length} video file(s) to upload:\n`);

    const uploadResults = [];

    for (const fileName of videoFiles) {
      const filePath = path.join(VIDEOS_DIR, fileName);
      const storagePath = `${STORAGE_PATH}/${fileName}`;

      try {
        console.log(`📤 Uploading: ${fileName}`);
        const stats = await fs.stat(filePath);
        console.log(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        // Upload to Firebase Storage
        await bucket.upload(filePath, {
          destination: storagePath,
          metadata: {
            contentType: 'video/mp4',
            metadata: {
              uploadedAt: new Date().toISOString(),
              type: 'chicago-skyline-background',
              source: 'veo-generated'
            }
          }
        });

        // Make file publicly accessible
        const file = bucket.file(storagePath);
        await file.makePublic();

        // Get public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
        
        console.log(`   ✅ Uploaded successfully`);
        console.log(`   🔗 Public URL: ${publicUrl}\n`);

        uploadResults.push({
          fileName,
          storagePath,
          publicUrl,
          size: stats.size
        });

      } catch (error) {
        console.error(`   ❌ Failed to upload ${fileName}:`, error.message);
        uploadResults.push({
          fileName,
          error: error.message
        });
      }
    }

    // Summary
    console.log('='.repeat(60));
    console.log('\n📊 Upload Summary:\n');
    
    const successful = uploadResults.filter(r => r.publicUrl);
    const failed = uploadResults.filter(r => r.error);

    console.log(`✅ Successful: ${successful.length}`);
    console.log(`❌ Failed: ${failed.length}`);
    
    if (successful.length > 0) {
      const totalSize = successful.reduce((sum, r) => sum + r.size, 0);
      console.log(`\n💾 Total size uploaded: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log('\n📋 Public URLs:');
      successful.forEach(r => {
        console.log(`   - ${r.fileName}`);
        console.log(`     ${r.publicUrl}`);
      });
    }

    if (failed.length > 0) {
      console.log('\n❌ Failed uploads:');
      failed.forEach(r => {
        console.log(`   - ${r.fileName}: ${r.error}`);
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
uploadVideos();




