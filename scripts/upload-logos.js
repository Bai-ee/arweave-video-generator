import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { initializeFirebaseAdmin, getStorage } from '../worker/firebase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from worker/.env if it exists
const envPath = path.join(__dirname, '..', 'worker', '.env');
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

// Path to logos folder
const logosDir = path.join(__dirname, '..', 'worker', 'assets', 'logos');
const STORAGE_PATH = 'logos';

async function uploadLogos() {
    console.log('📤 Uploading logos to Firebase Storage...\n');

    try {
        // Initialize Firebase Admin
        initializeFirebaseAdmin();
        const storage = getStorage();
        const bucket = storage.bucket();

        console.log(`📦 Bucket: ${bucket.name}`);
        console.log(`📁 Logos directory: ${logosDir}\n`);

        // Check if logos directory exists
        if (!await fs.pathExists(logosDir)) {
            throw new Error(`Logos directory not found: ${logosDir}`);
        }

        // Get all image files from logos directory
        const files = await fs.readdir(logosDir);
        const imageFiles = files.filter(file => 
            /\.(png|jpg|jpeg|svg)$/i.test(file)
        );

        if (imageFiles.length === 0) {
            console.log('⚠️  No image files found in logos directory');
            return;
        }

        console.log(`Found ${imageFiles.length} logo files to upload:\n`);

        // Upload each logo file
        for (const fileName of imageFiles) {
            const filePath = path.join(logosDir, fileName);
            const stats = await fs.stat(filePath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

            console.log(`📤 Uploading: ${fileName} (${fileSizeMB}MB)...`);

            // Upload to Firebase Storage in 'logos' folder
            const storagePath = `logos/${fileName}`;
            await bucket.upload(filePath, {
                destination: storagePath,
                metadata: {
                    contentType: fileName.endsWith('.svg') ? 'image/svg+xml' : 
                                 fileName.endsWith('.png') ? 'image/png' : 
                                 'image/jpeg',
                    cacheControl: 'public, max-age=31536000', // Cache for 1 year
                },
                public: true,
            });

            // Get public URL
            const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
            console.log(`   ✅ Uploaded: ${publicUrl}\n`);
        }

        console.log('✨ All logos uploaded successfully!\n');
        console.log('📁 Firebase Storage path: gs://' + bucket.name + '/logos/');

    } catch (error) {
        console.error('❌ Error uploading logos:', error);
        process.exit(1);
    }
}

uploadLogos();

