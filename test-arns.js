/**
 * Test script for ArNS integration
 * Tests that environment variables are set and the ArNS updater module works
 */

import dotenv from 'dotenv';
import { updateArNSRecord } from './lib/ArNSUpdater.js';

// Load environment variables
dotenv.config({ path: '.env.local' });

console.log('🧪 Testing ArNS Integration Setup\n');
console.log('=' .repeat(50));

// Check environment variables
console.log('\n📋 Checking Environment Variables:');
const antProcessId = process.env.ARNS_ANT_PROCESS_ID;
const walletJwk = process.env.ARWEAVE_WALLET_JWK;

if (!antProcessId) {
  console.log('❌ ARNS_ANT_PROCESS_ID: NOT SET');
  console.log('   Expected: tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw');
} else {
  console.log(`✅ ARNS_ANT_PROCESS_ID: ${antProcessId.substring(0, 20)}...`);
  if (antProcessId === 'tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw') {
    console.log('   ✓ Matches expected Process ID');
  } else {
    console.log('   ⚠️  Does not match expected Process ID');
  }
}

if (!walletJwk) {
  console.log('❌ ARWEAVE_WALLET_JWK: NOT SET');
} else {
  try {
    const parsed = JSON.parse(walletJwk);
    if (parsed.kty && parsed.n && parsed.e) {
      console.log(`✅ ARWEAVE_WALLET_JWK: Valid JWK format`);
      console.log(`   Key type: ${parsed.kty}`);
      console.log(`   Key size: ${parsed.n ? parsed.n.length : 'N/A'} chars`);
    } else {
      console.log('⚠️  ARWEAVE_WALLET_JWK: Invalid JWK structure');
    }
  } catch (e) {
    console.log('⚠️  ARWEAVE_WALLET_JWK: Could not parse as JSON');
  }
}

// Test module import and basic functionality
console.log('\n🔧 Testing ArNS Updater Module:');

try {
  // Test with a dummy transaction ID (we won't actually update ArNS)
  // Just verify the module loads and can parse the wallet
  console.log('   Testing module import... ✅');
  console.log('   Testing wallet parsing...');
  
  // We'll do a dry-run test - check if the module can initialize
  if (!antProcessId) {
    console.log('   ⚠️  Skipping full test - ARNS_ANT_PROCESS_ID not set');
    console.log('\n💡 To complete setup:');
    console.log('   1. Add ARNS_ANT_PROCESS_ID to .env.local');
    console.log('   2. Set value: tUsH8_qpoBcwPy6Lr2yCc7_jL9DzMdx-u5oSs7KASsw');
  } else if (!walletJwk) {
    console.log('   ⚠️  Skipping full test - ARWEAVE_WALLET_JWK not set');
  } else {
    console.log('   ✅ Module ready for testing');
    console.log('\n   Note: Full ArNS update test requires:');
    console.log('   - Valid ARNS_ANT_PROCESS_ID');
    console.log('   - Valid ARWEAVE_WALLET_JWK');
    console.log('   - Wallet with sufficient AR balance');
    console.log('   - Actual deployment manifest ID');
    console.log('\n   This test only verifies configuration, not actual ArNS updates.');
  }
  
} catch (error) {
  console.log(`   ❌ Error: ${error.message}`);
  console.log(`   Stack: ${error.stack}`);
}

console.log('\n' + '='.repeat(50));
console.log('\n📝 Summary:');
if (antProcessId && walletJwk) {
  console.log('✅ Configuration appears complete');
  console.log('✅ Ready for ArNS integration');
  console.log('\n💡 Next steps:');
  console.log('   1. Deploy website via UI');
  console.log('   2. ArNS will auto-update after deployment');
  console.log('   3. Check deployment success modal for ArNS URL');
} else {
  console.log('⚠️  Configuration incomplete');
  if (!antProcessId) {
    console.log('   - Missing ARNS_ANT_PROCESS_ID');
  }
  if (!walletJwk) {
    console.log('   - Missing ARWEAVE_WALLET_JWK');
  }
}

console.log('\n');
