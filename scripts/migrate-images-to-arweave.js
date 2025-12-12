/**
 * One-time Migration Script: Upload missing images to Arweave
 * 
 * This script:
 * 1. Identifies images that exist in the original manifest (already on Arweave)
 * 2. Uploads missing images to Arweave
 * 3. Updates Firebase artists collection with full Arweave URLs
 * 4. Saves a mapping file for reference
 * 
 * Run: node scripts/migrate-images-to-arweave.js
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import Arweave from 'arweave';
import { TurboFactory, ArweaveSigner } from '@ardrive/turbo-sdk';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Load environment variables (try multiple locations)
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config({ path: path.join(projectRoot, '.env.production') });
dotenv.config({ path: path.join(projectRoot, '.env') });

// Original manifest ID that contains some images
const ORIGINAL_MANIFEST_ID = 'u0XiFVSL_9EDqFZW34ObaM1dxgYGn2niZjInRlj7S9w';
const ORIGINAL_MANIFEST_BASE = `https://arweave.net/${ORIGINAL_MANIFEST_ID}`;

// Images that EXIST in the original manifest (verified)
const EXISTING_IN_MANIFEST = {
  'img/artists/acidman.jpg': true,
  'img/artists/akila.jpg': true,
  'img/artists/andrew_emil.jpg': true,
  'img/artists/bai-ee2.jpg': true,
  'img/artists/cesarramirez.jpg': true,
  'img/artists/sassmouth.jpg': true,
  'img/artists/sean_smith.jpg': true,
  'img/artists/tyrelwilliams.jpg': true,
  'img/covers/acidtest.jpg': true,
  'img/covers/letyourselfgo.jpg': true,
  'img/covers/loftlivin.jpg': true,
  'img/covers/lovemanifesto.jpg': true,
  'img/covers/lovemanifesto2.jpg': true,
  'img/loge_horiz.png': true,
};

// Images that need to be UPLOADED (missing from manifest)
const NEEDS_UPLOAD = [
  'img/artists/JoshZ_B2B_Baiee.png',
  'img/artists/ike.jpg',
  'img/artists/josh_zeitler.png',
  'img/artists/js.jpg',
  'img/artists/lorelei.png',
  'img/artists/redeye.png',
  'img/artists/startraxxthumb.jpg',
  'img/artists/vivaacid.png',
  'img/artists/vivaacid_podlasie_71825.png',
  'img/bai_ee_closing_partyVAjpg.jpg',
  'img/covers/andrewb2bredeye.png',
  'img/covers/andrewemilflammable.png',
  'img/roughtimes.jpg',
];

// Get content type from file extension
function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  return types[ext] || 'application/octet-stream';
}

// Initialize Turbo uploader
async function initTurbo() {
  const jwkString = process.env.ARWEAVE_WALLET_JWK;
  
  if (!jwkString) {
    throw new Error('ARWEAVE_WALLET_JWK environment variable is required');
  }
  
  let walletJwk;
  try {
    walletJwk = JSON.parse(jwkString);
  } catch (e) {
    // Try removing quotes if present
    let cleaned = jwkString;
    if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
      cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"');
    }
    walletJwk = JSON.parse(cleaned);
  }
  
  const signer = new ArweaveSigner(walletJwk);
  const turbo = TurboFactory.authenticated({ signer });
  
  // Get balance
  const balance = await turbo.getBalance();
  console.log(`Turbo balance: ${balance.winc} winc`);
  
  return { turbo, walletJwk };
}

// Upload a single file to Arweave using Turbo
async function uploadToArweave(filePath, turbo) {
  const fullPath = path.join(projectRoot, 'website', filePath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }
  
  const fileData = fs.readFileSync(fullPath);
  const contentType = getContentType(filePath);
  const fileName = path.basename(filePath);
  
  console.log(`  Uploading ${filePath} (${(fileData.length / 1024).toFixed(1)} KB)...`);
  
  const tags = [
    { name: 'Content-Type', value: contentType },
    { name: 'App-Name', value: 'Underground-Existence' },
    { name: 'File-Path', value: filePath },
    { name: 'File-Name', value: fileName },
    { name: 'Migration', value: 'image-assets-v1' },
    { name: 'Upload-Date', value: new Date().toISOString() }
  ];
  
  const result = await turbo.uploadFile({
    fileStreamFactory: () => fs.createReadStream(fullPath),
    fileSizeFactory: () => fileData.length,
    dataItemOpts: { tags }
  });
  
  const txId = result.id;
  const arweaveUrl = `https://arweave.net/${txId}`;
  
  console.log(`  ✅ Uploaded: ${arweaveUrl}`);
  
  return { txId, arweaveUrl };
}

// Main migration function
async function migrateImages() {
  console.log('='.repeat(60));
  console.log('IMAGE MIGRATION TO ARWEAVE');
  console.log('='.repeat(60));
  console.log('');
  
  // Initialize Turbo uploader
  console.log('Initializing Arweave Turbo uploader...');
  const { turbo, walletJwk } = await initTurbo();
  console.log('✅ Turbo initialized');
  console.log('');
  
  // Build the complete image mapping
  const imageMapping = {};
  
  // Step 1: Add existing images from manifest
  console.log('Step 1: Mapping existing images from original manifest...');
  console.log(`  Manifest ID: ${ORIGINAL_MANIFEST_ID}`);
  console.log('');
  
  for (const imgPath of Object.keys(EXISTING_IN_MANIFEST)) {
    const arweaveUrl = `${ORIGINAL_MANIFEST_BASE}/${imgPath}`;
    imageMapping[imgPath] = {
      arweaveUrl,
      source: 'original-manifest',
      manifestId: ORIGINAL_MANIFEST_ID
    };
    console.log(`  ✅ ${imgPath} -> manifest`);
  }
  console.log('');
  
  // Step 2: Upload missing images
  console.log('Step 2: Uploading missing images to Arweave...');
  console.log(`  ${NEEDS_UPLOAD.length} images to upload`);
  console.log('');
  
  let uploadedCount = 0;
  let failedCount = 0;
  
  for (const imgPath of NEEDS_UPLOAD) {
    try {
      const result = await uploadToArweave(imgPath, turbo);
      imageMapping[imgPath] = {
        arweaveUrl: result.arweaveUrl,
        txId: result.txId,
        source: 'uploaded',
        uploadedAt: new Date().toISOString()
      };
      uploadedCount++;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  ❌ Failed to upload ${imgPath}: ${error.message}`);
      failedCount++;
    }
  }
  
  console.log('');
  console.log(`Uploaded: ${uploadedCount} / ${NEEDS_UPLOAD.length}`);
  if (failedCount > 0) {
    console.log(`Failed: ${failedCount}`);
  }
  console.log('');
  
  // Step 3: Save the mapping file
  const mappingPath = path.join(projectRoot, 'image-arweave-mapping.json');
  fs.writeFileSync(mappingPath, JSON.stringify(imageMapping, null, 2));
  console.log(`✅ Saved mapping to: ${mappingPath}`);
  console.log('');
  
  // Step 4: Generate Firebase update script
  console.log('Step 3: Generating Firebase update commands...');
  console.log('');
  
  // Load current artists.json to map filenames to artists
  const artistsJsonPath = path.join(projectRoot, 'website', 'artists.json');
  const artists = JSON.parse(fs.readFileSync(artistsJsonPath, 'utf8'));
  
  const updates = [];
  
  for (const artist of artists) {
    // Check artist image
    const artistImg = artist.artistImageFilename;
    if (artistImg && !artistImg.startsWith('http') && imageMapping[artistImg]) {
      updates.push({
        artistName: artist.artistName,
        field: 'artistImageFilename',
        oldValue: artistImg,
        newValue: imageMapping[artistImg].arweaveUrl
      });
    }
    
    // Check mix images
    if (artist.mixes) {
      for (const mix of artist.mixes) {
        const mixImg = mix.mixImageFilename;
        if (mixImg && !mixImg.startsWith('http') && imageMapping[mixImg]) {
          updates.push({
            artistName: artist.artistName,
            mixTitle: mix.mixTitle,
            field: 'mixImageFilename',
            oldValue: mixImg,
            newValue: imageMapping[mixImg].arweaveUrl
          });
        }
      }
    }
  }
  
  // Save updates file
  const updatesPath = path.join(projectRoot, 'firebase-image-updates.json');
  fs.writeFileSync(updatesPath, JSON.stringify(updates, null, 2));
  console.log(`✅ Saved ${updates.length} Firebase updates to: ${updatesPath}`);
  console.log('');
  
  // Print summary
  console.log('='.repeat(60));
  console.log('MIGRATION COMPLETE');
  console.log('='.repeat(60));
  console.log('');
  console.log('Summary:');
  console.log(`  - Existing in manifest: ${Object.keys(EXISTING_IN_MANIFEST).length}`);
  console.log(`  - Uploaded to Arweave: ${uploadedCount}`);
  console.log(`  - Total mapped: ${Object.keys(imageMapping).length}`);
  console.log(`  - Firebase updates needed: ${updates.length}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run: node scripts/apply-firebase-updates.js');
  console.log('     (to update Firebase with the new Arweave URLs)');
  console.log('');
  console.log('  2. Redeploy website to Arweave');
  console.log('     (images will now load from their Arweave URLs)');
  console.log('');
  
  return { imageMapping, updates };
}

// Run migration
migrateImages().catch(console.error);
