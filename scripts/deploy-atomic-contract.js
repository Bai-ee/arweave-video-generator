/**
 * Deploy ANS-110 Atomic Asset Contract
 * 
 * This script deploys the ANS-110 contract source to Arweave.
 * Run this ONCE to get the contract transaction ID, then use that ID
 * in the ATOMIC_ASSET_CONTRACT_SRC environment variable.
 * 
 * Usage:
 *   node scripts/deploy-atomic-contract.js
 * 
 * Requirements:
 *   - ARWEAVE_WALLET_JWK environment variable set
 *   - Wallet has sufficient AR balance for upload
 */

import { TurboFactory } from '@ardrive/turbo-sdk';
import { ArweaveSigner } from '@ardrive/turbo-sdk';
import dotenv from 'dotenv';

// Load environment variables
// Try .env.local first, then fall back to .env
dotenv.config({ path: '.env.local' });
if (!process.env.ARWEAVE_WALLET_JWK) {
  dotenv.config(); // Fall back to .env if .env.local doesn't have it
}

// ANS-110 Contract Source Code
// This is the standard contract for atomic assets
const ANS_110_CONTRACT_SOURCE = `export function handle(state, action) {
  if (action.input.function === 'transfer') {
    const target = action.input.target;
    const qty = action.input.qty;
    
    if (!target || !qty) {
      throw new ContractError('Invalid transfer');
    }
    
    if (state.balances[action.caller] < qty) {
      throw new ContractError('Insufficient balance');
    }
    
    state.balances[action.caller] -= qty;
    if (!state.balances[target]) {
      state.balances[target] = 0;
    }
    state.balances[target] += qty;
    
    return { state };
  }
  
  if (action.input.function === 'balance') {
    const target = action.input.target || action.caller;
    const ticker = state.ticker || 'VIDEO';
    const balance = state.balances[target] || 0;
    
    return {
      result: {
        target,
        ticker,
        balance
      }
    };
  }
  
  throw new ContractError('Unknown function');
}`;

async function deployContract() {
  try {
    console.log('🚀 Deploying ANS-110 Atomic Asset Contract...\n');

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

    // Initialize Turbo
    const signer = new ArweaveSigner(walletJwk);
    const turbo = TurboFactory.authenticated({
      signer: signer,
      config: {
        gatewayUrl: 'https://turbo.ardrive.io',
        uploadUrl: 'https://turbo.ardrive.io'
      }
    });

    console.log('✅ Turbo initialized\n');

    // Convert contract source to buffer
    const contractBuffer = Buffer.from(ANS_110_CONTRACT_SOURCE);
    console.log(`📝 Contract source size: ${contractBuffer.length} bytes\n`);

    // Upload contract source
    console.log('📤 Uploading contract source to Arweave...');
    const result = await turbo.upload({
      data: contractBuffer,
      dataItemOpts: {
        tags: [
          { name: 'Content-Type', value: 'application/javascript' },
          { name: 'App-Name', value: 'SmartWeaveContractSource' },
          { name: 'App-Version', value: '0.3.0' },
          { name: 'Contract-Src', value: 'ANS-110' },
          { name: 'Type', value: 'Contract' }
        ]
      },
      turboOpts: {
        payment: {
          token: 'arweave'
        }
      }
    });

    if (!result || !result.id) {
      throw new Error('Upload returned invalid result: missing transaction ID');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ CONTRACT DEPLOYED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\n📝 Transaction ID: ${result.id}`);
    console.log(`🔗 Arweave URL: https://arweave.net/${result.id}`);
    console.log(`\n⚠️  IMPORTANT: Add this to your Vercel environment variables:`);
    console.log(`\n   Variable Name: ATOMIC_ASSET_CONTRACT_SRC`);
    console.log(`   Variable Value: ${result.id}\n`);
    console.log('📋 Steps to set in Vercel:');
    console.log('   1. Go to https://vercel.com/dashboard');
    console.log('   2. Select your project: arweave-video-generator');
    console.log('   3. Go to Settings > Environment Variables');
    console.log('   4. Add new variable:');
    console.log('      - Key: ATOMIC_ASSET_CONTRACT_SRC');
    console.log(`      - Value: ${result.id}`);
    console.log('   5. Select "Production", "Preview", and "Development"');
    console.log('   6. Click "Save"');
    console.log('   7. Redeploy your application\n');
    console.log('💡 Note: Transaction confirmation typically takes 2-10 minutes.');
    console.log('   The contract will be usable once confirmed on Arweave.\n');

    return result.id;

  } catch (error) {
    console.error('\n❌ Contract deployment failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    throw error;
  }
}

// Run deployment
deployContract()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

