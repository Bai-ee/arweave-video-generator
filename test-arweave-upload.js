/**
 * Test script to verify Arweave upload functionality
 * Tests the ArweaveUploader module with a simple text file
 */

import { uploadToArweave } from './lib/ArweaveUploader.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables from .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '.env.local') });

async function testArweaveUpload() {
  console.log('🧪 Testing Arweave Upload...\n');
  
  // Check environment variables
  console.log('📋 Checking environment variables...');
  if (!process.env.ARWEAVE_WALLET_JWK) {
    console.error('❌ ARWEAVE_WALLET_JWK is not set');
    process.exit(1);
  }
  console.log('✅ ARWEAVE_WALLET_JWK: Found');
  
  if (process.env.ARWEAVE_WALLET_ADDRESS) {
    console.log(`✅ ARWEAVE_WALLET_ADDRESS: ${process.env.ARWEAVE_WALLET_ADDRESS}`);
  } else {
    console.log('⚠️  ARWEAVE_WALLET_ADDRESS: Not set (optional)');
  }
  
  if (process.env.ARWEAVE_DRIVE_ID) {
    console.log(`✅ ARWEAVE_DRIVE_ID: ${process.env.ARWEAVE_DRIVE_ID}`);
  } else {
    console.log('⚠️  ARWEAVE_DRIVE_ID: Not set (optional)');
  }
  
  if (process.env.ARWEAVE_FOLDER_ID) {
    console.log(`✅ ARWEAVE_FOLDER_ID: ${process.env.ARWEAVE_FOLDER_ID}`);
  } else {
    console.log('⚠️  ARWEAVE_FOLDER_ID: Not set (optional)');
  }
  
  console.log('\n📤 Creating test file...');
  
  // Create a simple test file content
  const testContent = `Arweave Upload Test
Generated: ${new Date().toISOString()}
This is a test file to verify Arweave upload functionality.
Project: arweave-video-generator
Test ID: ${Date.now()}
`;
  
  const testFileName = `test-upload-${Date.now()}.txt`;
  const testFileBuffer = Buffer.from(testContent, 'utf-8');
  
  console.log(`📝 Test file: ${testFileName}`);
  console.log(`📊 File size: ${testFileBuffer.length} bytes\n`);
  
  try {
    console.log('🚀 Uploading to Arweave via Turbo...\n');
    
    const result = await uploadToArweave(testFileBuffer, testFileName, {
      folderName: 'test-uploads',
      metadata: {
        test: 'true',
        timestamp: new Date().toISOString(),
        project: 'arweave-video-generator'
      }
    });
    
    if (result.success) {
      console.log('\n✅ Upload Successful!\n');
      console.log('📊 Upload Details:');
      console.log(`   Transaction ID: ${result.transactionId}`);
      console.log(`   Arweave URL: ${result.arweaveUrl}`);
      console.log(`   Turbo URL: ${result.turboUrl}`);
      console.log(`   File Name: ${result.fileName}`);
      console.log(`   File Size: ${result.fileSize} bytes`);
      console.log(`   Content Type: ${result.contentType}`);
      console.log(`   Drive ID: ${result.driveId || 'Not specified'}`);
      console.log(`   Folder ID: ${result.folderId || 'Not specified'}`);
      console.log(`\n${result.note}`);
      console.log('\n🔗 You can view the file at:');
      console.log(`   ${result.arweaveUrl}`);
      console.log('\n⏳ Note: The file may take 2-10 minutes to appear in ArDrive');
      console.log('   but the Arweave URL will work immediately.\n');
    } else {
      console.error('\n❌ Upload Failed!');
      console.error(`   Error: ${result.error}`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Upload Error:');
    console.error(`   ${error.message}`);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testArweaveUpload().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});



