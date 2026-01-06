/**
 * Export Arweave Wallet for BazAR
 * 
 * This script exports your Arweave wallet JWK to a file that can be imported
 * into BazAR or other Arweave wallet tools.
 * 
 * Usage:
 *   node scripts/export-wallet.js
 * 
 * Security Warning:
 *   - The exported file contains your private key
 *   - Keep it secure and never share it
 *   - Delete the file after importing to BazAR
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
if (!process.env.ARWEAVE_WALLET_JWK) {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

async function exportWallet() {
  try {
    console.log('🔐 Exporting Arweave Wallet...\n');

    // Validate environment variables
    if (!process.env.ARWEAVE_WALLET_JWK) {
      throw new Error('ARWEAVE_WALLET_JWK environment variable is required');
    }

    // Parse wallet JWK
    let walletJwk;
    let jwkString = process.env.ARWEAVE_WALLET_JWK;
    
    try {
      walletJwk = JSON.parse(jwkString);
    } catch (firstError) {
      // Try cleanup if first parse fails
      let cleaned = jwkString;
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
      } else if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
        cleaned = cleaned.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
      }
      cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t');
      cleaned = cleaned.replace(/\r\n/g, '').replace(/\n/g, '').replace(/\r/g, '');
      walletJwk = JSON.parse(cleaned);
    }

    console.log('✅ Wallet JWK parsed successfully');

    // Get wallet address if available
    const walletAddress = process.env.ARWEAVE_WALLET_ADDRESS || '';

    // Create export directory if it doesn't exist
    const exportDir = path.join(__dirname, '..', 'wallet-export');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    // Export wallet as JSON file (standard Arweave wallet format)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const walletFileName = `arweave-wallet-${timestamp}.json`;
    const walletFilePath = path.join(exportDir, walletFileName);

    fs.writeFileSync(walletFilePath, JSON.stringify(walletJwk, null, 2), 'utf8');

    console.log('\n' + '='.repeat(60));
    console.log('✅ WALLET EXPORTED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\n📁 File location: ${walletFilePath}`);
    console.log(`\n📝 Wallet Address: ${walletAddress || 'Not set in env'}`);
    console.log('\n⚠️  SECURITY WARNINGS:');
    console.log('   1. This file contains your PRIVATE KEY');
    console.log('   2. Keep it secure and never share it');
    console.log('   3. Delete the file after importing to BazAR');
    console.log('   4. Never commit this file to version control');
    console.log('\n📋 How to use with BazAR:');
    console.log('   1. Go to https://obj7clfpkxjplizvuipqfygky7hrbijslyt6jivutx2e2qojf2ka.g8way.io/');
    console.log('   2. Connect your wallet');
    console.log('   3. When prompted, select "Import Wallet" or "Upload Key File"');
    console.log('   4. Select the exported JSON file');
    console.log('   5. Your wallet will be connected and you can list your atomic assets');
    console.log('\n💡 Alternative: You can also copy the JSON content and paste it directly');
    console.log('   into BazAR if it supports JSON paste import.\n');

    // Also create a readable version with instructions
    const instructionsFileName = `IMPORT_INSTRUCTIONS-${timestamp}.txt`;
    const instructionsFilePath = path.join(exportDir, instructionsFileName);
    const instructions = `Arweave Wallet Export Instructions
Generated: ${new Date().toISOString()}

Wallet Address: ${walletAddress || 'Not set in env'}

HOW TO IMPORT TO BAZAR:
1. Go to https://obj7clfpkxjplizvuipqfygky7hrbijslyt6jivutx2e2qojf2ka.g8way.io/
2. Click "Connect Wallet" or "Import Wallet"
3. Select "Import from File" or "Upload Key File"
4. Choose the file: ${walletFileName}
5. Your wallet will be connected

ALTERNATIVE METHODS:
- ArConnect Extension: Import the JSON file through ArConnect settings
- Manual Import: Copy the JSON content from ${walletFileName} and paste where needed

SECURITY:
- This file contains your PRIVATE KEY
- Delete this file after importing
- Never share this file with anyone
- Never commit to version control

Wallet File: ${walletFileName}
`;

    fs.writeFileSync(instructionsFilePath, instructions, 'utf8');
    console.log(`📄 Instructions saved to: ${instructionsFilePath}\n`);

    return walletFilePath;

  } catch (error) {
    console.error('\n❌ Wallet export failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// Run export
exportWallet()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });



