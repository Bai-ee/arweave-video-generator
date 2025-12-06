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

// Path to paper backgrounds folder
const paperDir = path.join(__dirname, 'assets', 'paper_backgrounds');
const STORAGE_PATH = 'paper_backgrounds';

async function uploadPaperBackgrounds() {
    console.log('📤 Uploading paper backgrounds to Firebase Storage...\n');

    try {
        // Initialize Firebase Admin
        initializeFirebaseAdmin();
        const storage = getStorage();
        const bucket = storage.bucket();

        console.log(`📦 Bucket: ${bucket.name}`);
        console.log(`📁 Paper backgrounds directory: ${paperDir}\n`);

        // Check if paper backgrounds directory exists
        if (!await fs.pathExists(paperDir)) {
            throw new Error(`Paper backgrounds directory not found: ${paperDir}`);
        }

        // Get all PNG files from paper backgrounds directory
        const files = await fs.readdir(paperDir);
        const imageFiles = files.filter(file => 
            /\.(png)$/i.test(file)
        );

        if (imageFiles.length === 0) {
            console.log('⚠️  No PNG files found in paper backgrounds directory');
            return;
        }

        console.log(`Found ${imageFiles.length} paper background files to upload:\n`);

        // Upload each paper background file
        for (const fileName of imageFiles) {
            const filePath = path.join(paperDir, fileName);
            const stats = await fs.stat(filePath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

            console.log(`📤 Uploading: ${fileName} (${fileSizeMB}MB)...`);

            // Upload to Firebase Storage in 'paper_backgrounds' folder
            const storagePath = `${STORAGE_PATH}/${fileName}`;
            await bucket.upload(filePath, {
                destination: storagePath,
                metadata: {
                    contentType: 'image/png',
                    cacheControl: 'public, max-age=31536000', // Cache for 1 year
                },
                public: true,
            });

            // Get public URL
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
            console.log(`   ✅ Uploaded: ${publicUrl}\n`);
        }

        console.log('✨ All paper backgrounds uploaded successfully!\n');
        console.log('📁 Firebase Storage path: gs://' + bucket.name + '/' + STORAGE_PATH + '/');

    } catch (error) {
        console.error('❌ Error uploading paper backgrounds:', error);
        process.exit(1);
    }
}

uploadPaperBackgrounds();



