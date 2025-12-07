/**
 * Check Arweave Wallet Balance
 * Derives wallet address from JWK and checks balance
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
try {
  dotenv.config({ path: join(__dirname, '.env.production') });
} catch (e) {
  // Try .env if .env.production doesn't exist
  dotenv.config({ path: join(__dirname, '.env') });
}

async function checkWalletBalance() {
  try {
    console.log('💰 Checking Arweave Wallet Balance');
    console.log('===================================\n');

    // Get JWK from environment
    const jwkString = process.env.ARWEAVE_WALLET_JWK;
    
    if (!jwkString) {
      console.error('❌ ARWEAVE_WALLET_JWK environment variable is not set');
      console.log('\nPlease set ARWEAVE_WALLET_JWK in your .env or .env.production file');
      process.exit(1);
    }

    // Parse JWK
    let walletJwk;
    try {
      walletJwk = JSON.parse(jwkString);
    } catch (e) {
      // Try cleaning up the string
      let cleaned = jwkString;
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.slice(1, -1).replace(/\\"/g, '"');
      }
      walletJwk = JSON.parse(cleaned);
    }

    console.log('✅ JWK parsed successfully\n');

    // Derive wallet address from JWK public key (n field)
    // The address is the SHA256 hash of the public key modulus (n), base64url encoded
    const publicKeyModulus = Buffer.from(walletJwk.n, 'base64url');
    const addressHash = crypto.createHash('sha256').update(publicKeyModulus).digest();
    const walletAddress = Buffer.from(addressHash).toString('base64url');
    
    console.log('📋 Wallet Address:', walletAddress);
    console.log('');

    // Check balance via Arweave gateway API
    const gatewayUrl = 'https://arweave.net';
    const balanceResponse = await fetch(`${gatewayUrl}/wallet/${walletAddress}/balance`);
    
    if (!balanceResponse.ok) {
      throw new Error(`Failed to fetch balance: ${balanceResponse.status} ${balanceResponse.statusText}`);
    }

    const balanceWinston = await balanceResponse.text();
    const balanceAR = parseFloat(balanceWinston) / 1e12; // Convert Winston to AR

    console.log('💰 Balance (Winston):', balanceWinston);
    console.log('💰 Balance (AR):', balanceAR.toFixed(6));
    console.log('');

    // Check if balance is sufficient for uploads
    const minBalanceForUpload = 0.001; // Minimum AR typically needed
    const hasEnoughBalance = balanceAR >= minBalanceForUpload;

    console.log('📊 Balance Analysis:');
    console.log('   Minimum recommended:', minBalanceForUpload, 'AR');
    console.log('   Current balance:', balanceAR.toFixed(6), 'AR');
    console.log('   Status:', hasEnoughBalance ? '✅ Sufficient' : '⚠️  Low balance');
    console.log('');

    if (!hasEnoughBalance) {
      console.log('⚠️  WARNING: Your wallet balance is low.');
      console.log('   Turbo uploads may fail with 403 Forbidden if balance is insufficient.');
      console.log('   Consider adding AR to your wallet.');
      console.log('');
    }

    // Also check via alternative gateway
    try {
      const altGatewayUrl = 'https://ar-io.dev';
      const altBalanceResponse = await fetch(`${altGatewayUrl}/wallet/${walletAddress}/balance`);
      if (altBalanceResponse.ok) {
        const altBalanceWinston = await altBalanceResponse.text();
        const altBalanceAR = parseFloat(altBalanceWinston) / 1e12;
        console.log('📊 Alternative Gateway (ar-io.dev):', altBalanceAR.toFixed(6), 'AR');
      }
    } catch (e) {
      // Ignore alternative gateway errors
    }

    return {
      address: walletAddress,
      balanceAR: balanceAR,
      balanceWinston: balanceWinston,
      hasEnoughBalance: hasEnoughBalance
    };

  } catch (error) {
    console.error('❌ Error checking wallet balance:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
checkWalletBalance().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

export { checkWalletBalance };

