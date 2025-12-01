/**
 * Setup Firebase Storage Folders
 * 
 * Creates placeholder files in Firebase Storage folders to ensure they exist
 * Firebase Storage doesn't have true "folders" - they're just path prefixes
 * This script creates a .keep file in each folder to make them visible in the console
 * 
 * Run: node scripts/setup-firebase-folders.js
 */

import { initializeFirebaseAdmin, getStorage } from '../worker/firebase-admin.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from worker/.env if it exists
const workerEnvPath = path.join(__dirname, '..', 'worker', '.env');
if (fs.existsSync(workerEnvPath)) {
  const envContent = fs.readFileSync(workerEnvPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  });
}

const folders = [
  'skyline',
  'artist',
  'decks',
  'equipment',
  'family',
  'neighborhood'
];

async function setupFolders() {
  try {
    console.log('🔧 Setting up Firebase Storage folders...\n');

    // Initialize Firebase
    initializeFirebaseAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();

    console.log(`📦 Bucket: ${bucket.name}\n`);

    // Create a .keep file in each folder to make them visible
    for (const folder of folders) {
      const folderPath = `${folder}/.keep`;
      const file = bucket.file(folderPath);

      // Check if file already exists
      const [exists] = await file.exists();
      
      if (exists) {
        console.log(`✅ Folder "${folder}" already exists`);
      } else {
        // Create .keep file with folder name
        await file.save(folder, {
          metadata: {
            contentType: 'text/plain',
            metadata: {
              folder: folder,
              createdBy: 'setup-firebase-folders',
              createdAt: new Date().toISOString()
            }
          }
        });

        // Make it publicly readable (optional)
        await file.makePublic();

        console.log(`✅ Created folder "${folder}"`);
      }
    }

    console.log('\n✨ All folders are ready!');
    console.log('\n📁 Available folders:');
    folders.forEach(folder => {
      console.log(`   - ${folder}/`);
    });
    console.log('\n💡 Note: Firebase Storage folders are path prefixes.');
    console.log('   Videos uploaded to these folders will be stored at:');
    console.log('   gs://' + bucket.name + '/[folder-name]/[filename]');

  } catch (error) {
    console.error('❌ Error setting up folders:', error);
    process.exit(1);
  }
}

setupFolders();

