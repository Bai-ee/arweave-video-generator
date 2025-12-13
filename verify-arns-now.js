import dotenv from 'dotenv';
import { ANT } from '@ar.io/sdk';

dotenv.config({ path: '.env.local' });

const antProcessId = process.env.ARNS_ANT_PROCESS_ID;
const expectedManifestId = 'K9aEuTPUJEUV-1RlB5K75J-c8YXgb2g4c3kf1RxKlQQ';

if (!antProcessId) {
  console.error('❌ ARNS_ANT_PROCESS_ID not set');
  process.exit(1);
}

async function verify() {
  try {
    const ant = ANT.init({ processId: antProcessId });
    const records = await ant.getRecords();
    
    console.log('🔍 Current ArNS Record Status:\n');
    
    if (records['@']) {
      const baseRecord = records['@'];
      console.log('✅ Base Name Record (@) Found:');
      console.log(`   Transaction ID: ${baseRecord.transactionId}`);
      console.log(`   Expected:       ${expectedManifestId}`);
      console.log(`   Match: ${baseRecord.transactionId === expectedManifestId ? '✅ YES' : '❌ NO'}`);
      console.log(`   TTL: ${baseRecord.ttlSeconds} seconds`);
      
      const arnsUrl = `https://undergroundexistence.ar.io`;
      const arweaveUrl = `https://arweave.net/${baseRecord.transactionId}/index.html`;
      
      console.log(`\n🌐 URLs:`);
      console.log(`   ArNS: ${arnsUrl}`);
      console.log(`   Arweave: ${arweaveUrl}`);
      
      if (baseRecord.transactionId === expectedManifestId) {
        console.log('\n✅ ArNS is correctly pointing to the latest deployment!');
        console.log('⏱️  If you still see a placeholder, it may be:');
        console.log('   1. Propagation delay (wait 2-5 minutes)');
        console.log('   2. Gateway cache (try clearing browser cache)');
        console.log('   3. Gateway issue (try different gateway)');
      } else {
        console.log('\n⚠️  ArNS is pointing to a different transaction');
        console.log('   This might be from a previous deployment');
      }
    } else {
      console.log('❌ No base name record found');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

verify();
