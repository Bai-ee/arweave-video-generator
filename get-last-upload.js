/**
 * Script to get the last mix upload Arweave URL from Firebase
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

async function getLastUpload() {
  try {
    console.log('🔍 Fetching last mix upload from Firebase...\n');
    
    initializeFirebaseAdmin();
    const db = getFirestore();
    
    // Get artists data from Firebase
    const artistsRef = db.collection('system').doc('artists');
    const artistsDoc = await artistsRef.get();
    
    if (!artistsDoc.exists) {
      console.log('❌ No artists data found in Firebase');
      return;
    }
    
    const data = artistsDoc.data();
    const artists = data.artists || [];
    
    if (artists.length === 0) {
      console.log('❌ No artists found');
      return;
    }
    
    // Find the most recent mix upload across all artists
    let mostRecentMix = null;
    let mostRecentArtist = null;
    let mostRecentTimestamp = 0;
    
    for (const artist of artists) {
      // Check mixes
      if (artist.mixes && Array.isArray(artist.mixes)) {
        for (const mix of artist.mixes) {
          if (mix.mixArweaveURL && mix.mixArweaveURL.startsWith('http')) {
            // Try to find upload date or use mixDateYear
            const mixDate = mix.mixDateYear ? parseInt(mix.mixDateYear) : 0;
            if (mixDate > mostRecentTimestamp) {
              mostRecentTimestamp = mixDate;
              mostRecentMix = mix;
              mostRecentArtist = artist;
            }
          }
        }
      }
      
      // Check trax (tracks)
      if (artist.trax && Array.isArray(artist.trax)) {
        for (const track of artist.trax) {
          if (track.mixArweaveURL && track.mixArweaveURL.startsWith('http')) {
            const trackDate = track.mixDateYear ? parseInt(track.mixDateYear) : 0;
            if (trackDate > mostRecentTimestamp) {
              mostRecentTimestamp = trackDate;
              mostRecentMix = track;
              mostRecentArtist = artist;
            }
          }
        }
      }
    }
    
    if (!mostRecentMix) {
      console.log('❌ No mixes with Arweave URLs found');
      return;
    }
    
    console.log('✅ Found most recent upload:\n');
    console.log('Artist:', mostRecentArtist.artistName);
    console.log('Title:', mostRecentMix.mixTitle || 'Untitled');
    console.log('Date:', mostRecentMix.mixDateYear || 'N/A');
    console.log('Duration:', mostRecentMix.mixDuration || 'N/A');
    console.log('Type:', mostRecentMix.isTrack ? 'Track' : 'Mix');
    console.log('\n🔗 Arweave URL:');
    console.log(mostRecentMix.mixArweaveURL);
    console.log('\n');
    
    // Also show all recent uploads (last 5)
    console.log('📋 Recent uploads (last 5):\n');
    const allMixes = [];
    
    for (const artist of artists) {
      if (artist.mixes && Array.isArray(artist.mixes)) {
        for (const mix of artist.mixes) {
          if (mix.mixArweaveURL && mix.mixArweaveURL.startsWith('http')) {
            allMixes.push({
              artist: artist.artistName,
              title: mix.mixTitle || 'Untitled',
              url: mix.mixArweaveURL,
              date: mix.mixDateYear || 'N/A',
              type: 'Mix'
            });
          }
        }
      }
      if (artist.trax && Array.isArray(artist.trax)) {
        for (const track of artist.trax) {
          if (track.mixArweaveURL && track.mixArweaveURL.startsWith('http')) {
            allMixes.push({
              artist: artist.artistName,
              title: track.mixTitle || 'Untitled',
              url: track.mixArweaveURL,
              date: track.mixDateYear || 'N/A',
              type: 'Track'
            });
          }
        }
      }
    }
    
    // Sort by date (newest first)
    allMixes.sort((a, b) => {
      const dateA = parseInt(a.date) || 0;
      const dateB = parseInt(b.date) || 0;
      return dateB - dateA;
    });
    
    // Show last 5
    const recentMixes = allMixes.slice(0, 5);
    recentMixes.forEach((mix, index) => {
      console.log(`${index + 1}. ${mix.artist} - ${mix.title} (${mix.date}) [${mix.type}]`);
      console.log(`   ${mix.url}\n`);
    });
    
    return mostRecentMix.mixArweaveURL;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
getLastUpload().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});



