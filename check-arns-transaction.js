/**
 * Check ArNS Update Transaction
 * Verifies if the ArNS update transaction was confirmed on Arweave
 */

const updateTxId = '-7v6CJuxZow1Wp_yQUcVR0AFfk20N1-a_8YPol7q07Q';
const expectedManifestId = 'K9aEuTPUJEUV-1RlB5K75J-c8YXgb2g4c3kf1RxKlQQ';

console.log('🔍 Checking ArNS Update Transaction\n');
console.log('='.repeat(60));
console.log(`\n📋 Update Transaction ID: ${updateTxId}`);
console.log(`🎯 Expected Manifest ID: ${expectedManifestId}\n`);

console.log('🌐 Check these URLs:\n');
console.log(`1. ArNS Update Transaction:`);
console.log(`   https://arweave.net/${updateTxId}\n`);

console.log(`2. View.io (ArNS Gateway):`);
console.log(`   https://viewblock.io/arweave/tx/${updateTxId}\n`);

console.log(`3. ArNS Dashboard (refresh to see update):`);
console.log(`   https://arns.app\n`);

console.log(`4. Expected Manifest (what ArNS should point to):`);
console.log(`   https://arweave.net/${expectedManifestId}/index.html\n`);

console.log('⏱️  Note: ArNS updates can take 2-5 minutes to process');
console.log('   The transaction may be confirmed but not yet reflected in the dashboard\n');

// Try to fetch transaction status
try {
  const response = await fetch(`https://arweave.net/${updateTxId}`);
  if (response.ok) {
    console.log('✅ Update transaction exists on Arweave');
  } else {
    console.log('⏳ Update transaction may still be pending confirmation');
  }
} catch (error) {
  console.log('⚠️  Could not verify transaction status');
}
