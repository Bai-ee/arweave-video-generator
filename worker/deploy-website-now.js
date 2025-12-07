/**
 * Direct deployment script - calls the deployment function
 * This will use environment variables from Vercel if available
 */

import { deployWebsiteToArweave } from '../lib/WebsiteDeployer.js';
import path from 'path';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.production (Vercel env vars) or .env
config({ path: path.join(__dirname, '..', '.env.production') });
config({ path: path.join(__dirname, '..', '.env') });
config({ path: path.join(__dirname, '.env') });

// Fix ARWEAVE_WALLET_JWK if dotenv mangled it
// Read directly from .env.production to get the correct format
try {
  const envProdPath = path.join(__dirname, '..', '.env.production');
  if (fs.existsSync(envProdPath)) {
    const envContent = fs.readFileSync(envProdPath, 'utf8');
    const jwkMatch = envContent.match(/^ARWEAVE_WALLET_JWK=(.+)$/m);
    if (jwkMatch) {
      let jwkValue = jwkMatch[1];
      // Remove outer quotes if present
      if (jwkValue.startsWith('"') && jwkValue.endsWith('"')) {
        jwkValue = jwkValue.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
      } else if (jwkValue.startsWith("'") && jwkValue.endsWith("'")) {
        jwkValue = jwkValue.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
      }
      // Set the properly formatted value
      process.env.ARWEAVE_WALLET_JWK = jwkValue;
    }
  }
} catch (error) {
  console.warn('[Deploy Script] Could not fix ARWEAVE_WALLET_JWK from file:', error.message);
}

async function main() {
  try {
    console.log('🚀 Starting website deployment to Arweave...\n');
    console.log('   This may take several minutes depending on file sizes...\n');
    
    // Use relative path - WebsiteDeployer will resolve it from process.cwd()
    const deployResult = await deployWebsiteToArweave('website');
    
    if (!deployResult.success) {
      throw new Error(deployResult.error || 'Deployment failed');
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
    console.log(`\n   Note: Access the website using /index.html at the end of the URL`);
    console.log(`\n📊 Files Uploaded: ${deployResult.filesUploaded}`);
    console.log('\n✅ Your website is now live on Arweave!');
    console.log('   You can view it at the URLs above.\n');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Deployment failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

