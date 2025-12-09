/**
 * Script to list all mixes uploaded to Arweave through the system
 * Queries Firebase and returns comprehensive information about all mixes and tracks
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializeFirebaseAdmin, getFirestore } from './lib/firebase-admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
try {
  dotenv.config({ path: join(__dirname, '.env.production') });
} catch (e) {
  dotenv.config({ path: join(__dirname, '.env') });
}

async function listAllMixes() {
  try {
    console.log('🔍 Fetching all mixes from Firebase...\n');
    
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Get artists data from Firebase
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    if (!artistsDoc.exists) {
      console.log('❌ No artists data found in Firebase');
      return [];
    }
    
    const data = artistsDoc.data();
    const artists = data.artists || [];
    
    if (artists.length === 0) {
      console.log('❌ No artists found');
      return [];
    }
    
    // Collect all mixes and tracks
    const allMixes = [];
    
    for (const artist of artists) {
      // Process mixes
      if (artist.mixes && Array.isArray(artist.mixes)) {
        for (const mix of artist.mixes) {
          if (mix.mixArweaveURL && mix.mixArweaveURL.startsWith('http')) {
            allMixes.push({
              artist: artist.artistName,
              title: mix.mixTitle || 'Untitled Mix',
              arweaveUrl: mix.mixArweaveURL,
              dateYear: mix.mixDateYear || 'N/A',
              duration: mix.mixDuration || '0:00',
              type: 'Mix',
              imageFilename: mix.mixImageFilename || artist.artistImageFilename || 'N/A',
              artistGenre: artist.artistGenre || 'N/A',
              artistFilename: artist.artistFilename || 'N/A'
            });
          }
        }
      }
      
      // Process tracks (trax)
      if (artist.trax && Array.isArray(artist.trax)) {
        for (const track of artist.trax) {
          // Tracks may use trackArweaveURL or mixArweaveURL
          const arweaveUrl = track.trackArweaveURL || track.mixArweaveURL;
          if (arweaveUrl && arweaveUrl.startsWith('http')) {
            allMixes.push({
              artist: artist.artistName,
              title: track.trackTitle || track.mixTitle || 'Untitled Track',
              arweaveUrl: arweaveUrl,
              dateYear: track.trackDateYear || track.mixDateYear || 'N/A',
              duration: track.trackDuration || track.mixDuration || '0:00',
              type: 'Track',
              imageFilename: track.trackImageFilename || track.mixImageFilename || artist.artistImageFilename || 'N/A',
              artistGenre: artist.artistGenre || 'N/A',
              artistFilename: artist.artistFilename || 'N/A'
            });
          }
        }
      }
    }
    
    if (allMixes.length === 0) {
      console.log('❌ No mixes with Arweave URLs found');
      return [];
    }
    
    // Sort by date (newest first), then by artist name
    allMixes.sort((a, b) => {
      const dateA = parseInt(a.dateYear) || 0;
      const dateB = parseInt(b.dateYear) || 0;
      if (dateB !== dateA) {
        return dateB - dateA;
      }
      return a.artist.localeCompare(b.artist);
    });
    
    // Display results
    console.log(`\n✅ Found ${allMixes.length} uploaded mix(es)/track(s):\n`);
    console.log('='.repeat(100));
    
    allMixes.forEach((mix, index) => {
      console.log(`\n${index + 1}. ${mix.type}: ${mix.title}`);
      console.log(`   Artist: ${mix.artist}`);
      console.log(`   Genre: ${mix.artistGenre}`);
      console.log(`   Date/Year: ${mix.dateYear}`);
      console.log(`   Duration: ${mix.duration}`);
      console.log(`   Image: ${mix.imageFilename}`);
      console.log(`   🔗 Arweave URL: ${mix.arweaveUrl}`);
    });
    
    console.log('\n' + '='.repeat(100));
    console.log(`\n📊 Summary:`);
    console.log(`   Total Mixes: ${allMixes.filter(m => m.type === 'Mix').length}`);
    console.log(`   Total Tracks: ${allMixes.filter(m => m.type === 'Track').length}`);
    console.log(`   Total Uploads: ${allMixes.length}`);
    
    // Group by artist
    const byArtist = {};
    allMixes.forEach(mix => {
      if (!byArtist[mix.artist]) {
        byArtist[mix.artist] = { mixes: 0, tracks: 0 };
      }
      if (mix.type === 'Mix') {
        byArtist[mix.artist].mixes++;
      } else {
        byArtist[mix.artist].tracks++;
      }
    });
    
    console.log(`\n📋 By Artist:`);
    Object.keys(byArtist).sort().forEach(artist => {
      const counts = byArtist[artist];
      console.log(`   ${artist}: ${counts.mixes} mix(es), ${counts.tracks} track(s)`);
    });
    
    // Return data for programmatic use
    return allMixes;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  listAllMixes().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { listAllMixes };
