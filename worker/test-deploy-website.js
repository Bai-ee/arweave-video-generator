/**
 * Test script to deploy website to Arweave
 * This will upload all website files and create a manifest
 */

import { initializeFirebaseAdmin, getFirestore } from '../lib/firebase-admin.js';
import { syncFirebaseToWebsiteJSON } from '../lib/WebsiteSync.js';
import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import path from 'path';
import { createRequire } from 'module';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from worker/.env or root .env
config({ path: path.join(__dirname, '.env') });
config({ path: path.join(__dirname, '..', '.env') });

const require = createRequire(import.meta.url);

async function main() {
  try {
    console.log('🚀 Starting website deployment to Arweave...\n');

    // Step 1: Try to sync from Firebase (optional - skip if credentials not available)
    let shouldGeneratePages = false;
    try {
      console.log('📡 Step 1: Attempting to sync from Firebase...');
      initializeFirebaseAdmin();
      const db = getFirestore();
      console.log('✅ Firebase initialized\n');

      console.log('🔄 Step 2: Syncing Firebase to website/artists.json...');
      const syncResult = await syncFirebaseToWebsiteJSON(db, 'website');
      
      if (syncResult.success) {
        console.log(`✅ Synced ${syncResult.artistsCount} artists to website/artists.json\n`);
        shouldGeneratePages = true;
      } else {
        console.log(`⚠️  Sync skipped: ${syncResult.error}\n`);
        console.log('   Using existing website/artists.json file\n');
      }
    } catch (error) {
      console.log(`⚠️  Firebase sync skipped: ${error.message}\n`);
      console.log('   Using existing website/artists.json file\n');
    }

    // Step 2: Generate HTML pages (if sync was successful, otherwise use existing)
    if (shouldGeneratePages) {
      console.log('📄 Step 2: Generating HTML pages...');
      try {
        const generateScript = require(path.join(process.cwd(), 'website', 'scripts', 'generate_artist_pages.js'));
        const generateResult = generateScript.generatePages();
        
        if (generateResult.success) {
          console.log(`✅ Generated ${generateResult.artistPagesGenerated} artist pages and updated index.html\n`);
        } else {
          console.log(`⚠️  Page generation skipped: ${generateResult.error}\n`);
          console.log('   Using existing HTML pages\n');
        }
      } catch (error) {
        console.log(`⚠️  Page generation skipped: ${error.message}\n`);
        console.log('   Using existing HTML pages\n');
      }
    } else {
      console.log('📄 Step 2: Using existing HTML pages (no sync performed)\n');
    }

    // Step 3: Deploy to Arweave
    console.log('🌐 Step 3: Deploying website to Arweave...');
    console.log('   This may take several minutes depending on file sizes...\n');
    
    const deployResult = await deployWebsiteToArweave('website');
    
    if (!deployResult.success) {
      throw new Error(`Deploy failed: ${deployResult.error}`);
    }

    // Success!
    console.log('\n' + '='.repeat(60));
    console.log('🎉 WEBSITE DEPLOYED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\n📋 Manifest ID: ${deployResult.manifestId}`);
    console.log(`📋 Manifest URL: ${deployResult.manifestUrl}`);
    console.log(`\n🌐 WEBSITE URLS:`);
    console.log(`   Primary: ${deployResult.websiteUrl}`);
    console.log(`   Alternative: https://arweave.dev/${deployResult.manifestId}/index.html`);
    console.log(`   Alternative: https://ar-io.dev/${deployResult.manifestId}/index.html`);
    console.log(`\n📊 Files Uploaded: ${deployResult.filesUploaded}`);
    console.log('\n✅ Your website is now live on Arweave!');
    console.log('   You can view it at the URLs above.\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();

