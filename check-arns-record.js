/**
 * Check ArNS Record Script
 * Verifies the current ArNS record for undergroundexistence.ar.io
 */

import dotenv from 'dotenv';
import { ANT } from '@ar.io/sdk';

// Load environment variables
dotenv.config({ path: '.env.local' });

const antProcessId = process.env.ARNS_ANT_PROCESS_ID;

if (!antProcessId) {
  console.error('❌ ARNS_ANT_PROCESS_ID environment variable not set');
  process.exit(1);
}

async function checkArNSRecord() {
  try {
    console.log('🔍 Checking ArNS record for undergroundexistence.ar.io\n');
    console.log('='.repeat(60));
    
    // Initialize ANT (read-only, no signer needed)
    const ant = ANT.init({
      processId: antProcessId
    });
    
    console.log(`\n📋 Process ID: ${antProcessId.substring(0, 20)}...`);
    console.log('📡 Fetching ArNS records...\n');
    
    // Get all records
    const records = await ant.getRecords();
    
    console.log('📊 ArNS Records:');
    console.log(JSON.stringify(records, null, 2));
    
    // Check the @ record (base name record)
    if (records['@']) {
      const baseRecord = records['@'];
      console.log('\n✅ Base Name Record (@) Found:');
      console.log(`   Transaction ID: ${baseRecord.transactionId}`);
      console.log(`   TTL: ${baseRecord.ttlSeconds} seconds (${(baseRecord.ttlSeconds / 60).toFixed(1)} minutes)`);
      console.log(`   Expires in: ${((baseRecord.ttlSeconds - (Date.now() / 1000)) / 60).toFixed(1)} minutes`);
      
      const arweaveUrl = `https://arweave.net/${baseRecord.transactionId}`;
      const manifestUrl = `${arweaveUrl}/index.html`;
      
      console.log(`\n🌐 Current ArNS Points To:`);
      console.log(`   Arweave: ${arweaveUrl}`);
      console.log(`   Website: ${manifestUrl}`);
      console.log(`   ArNS: https://undergroundexistence.ar.io`);
      
      console.log('\n✅ ArNS record is active and pointing to a transaction');
    } else {
      console.log('\n⚠️  No base name record (@) found');
      console.log('   The ArNS name may not be configured yet, or the record has expired.');
    }
    
    // Check for other records
    const otherRecords = Object.keys(records).filter(key => key !== '@');
    if (otherRecords.length > 0) {
      console.log(`\n📝 Other records found: ${otherRecords.join(', ')}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error checking ArNS record:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

checkArNSRecord();
