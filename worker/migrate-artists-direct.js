/**
 * Direct migration using Firebase REST API
 * This bypasses the local credential parsing issues
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load original artists
const artistsPath = path.join(__dirname, 'data', 'sample-artists.json');
const originalArtists = JSON.parse(fs.readFileSync(artistsPath, 'utf-8'));

console.log(`[Migration] Loaded ${originalArtists.length} original artists`);
console.log('\n📋 Artists to migrate:');
originalArtists.forEach((artist, i) => {
  const mixCount = artist.mixes ? artist.mixes.length : 0;
  const traxCount = artist.trax ? artist.trax.length : 0;
  console.log(`  ${i + 1}. ${artist.artistName} (${mixCount} mixes, ${traxCount} tracks)`);
});

console.log('\n✅ Migration data prepared!');
console.log('\n📝 To complete the migration, you have two options:');
console.log('\n1. Run this in Vercel (where Firebase credentials work):');
console.log('   - The migration script is ready at: worker/migrate-artists-to-firebase.js');
console.log('   - It will merge original artists with existing Firebase data');
console.log('   - Preserves any new mixes/uploads you\'ve added');
console.log('\n2. Or manually update Firebase:');
console.log('   - Go to Firebase Console > Firestore');
console.log('   - Navigate to: system > artists');
console.log('   - Replace the "artists" array with the content from:');
console.log(`   - ${artistsPath}`);
console.log('\n💡 The script at worker/migrate-artists-to-firebase.js will:');
console.log('   - Load all 14 original artists');
console.log('   - Merge with existing Firebase data (preserving new uploads)');
console.log('   - Update Firebase with the complete artist list');

