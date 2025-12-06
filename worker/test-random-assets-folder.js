import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Testing Random Video from Assets Folder\n');
console.log('Generating a video from a random folder in assets/ (excluding chicago-skyline-videos)\n');

// Available folders (excluding chicago-skyline-videos from assets/)
// These are the regular folders, not in assets/
const availableFolders = ['skyline', 'neighborhood', 'artist', 'decks', 'equipment', 'family'];

// Pick a random folder
const randomFolder = availableFolders[Math.floor(Math.random() * availableFolders.length)];

console.log(`📋 Selected folder: ${randomFolder}`);
console.log(`   (This will use videos from the ${randomFolder} folder)\n`);

async function generateRandomVideo() {
  try {
    const videoGenerator = new ArweaveVideoGenerator();
    
    const selectedFilterKey = 'look_hard_bw_street_doc';
    const filterIntensity = 0.8;
    const filterDef = getFilter(selectedFilterKey, filterIntensity);
    const videoFilter = filterDef ? filterDef.filter : null;

    console.log('📋 Configuration:');
    console.log(`   Selected Folder: ${randomFolder}`);
    console.log(`   Duration: 30s`);
    console.log(`   Video Filter: ${filterDef ? filterDef.name : 'None'}\n`);

    const result = await videoGenerator.generateVideoWithAudio({
      duration: 30,
      artist: null, // Random artist
      width: 720,
      height: 720,
      fadeIn: 2,
      fadeOut: 2,
      videoFilter: videoFilter,
      useTrax: false,
      selectedFolders: [randomFolder]
    });
    
    if (result.success && result.videoPath) {
      const absPath = path.resolve(result.videoPath);
      const stats = await fs.stat(absPath);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      const isVideo = stats.size > 5 * 1024 * 1024;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log('✅ VIDEO GENERATED');
      console.log(`${'='.repeat(60)}`);
      console.log(`   Filename: ${result.fileName}`);
      console.log(`   Cursor link: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
      console.log(`   Full path: ${absPath}`);
      console.log(`   Size: ${fileSizeMB} MB`);
      console.log(`   Validation: ${isVideo ? '✅ Real video with segments' : '⚠️  Too small (may be fallback)'}`);
      console.log(`   Folder used: ${randomFolder}`);
      
      if (!isVideo) {
        console.error(`\n❌ FAILED: Video is too small - likely fallback to image`);
        process.exit(1);
      }
      
      return {
        success: true,
        fileName: result.fileName,
        filePath: absPath,
        size: fileSizeMB,
        folder: randomFolder
      };
    } else {
      throw new Error('Video generation returned unsuccessful result');
    }
  } catch (error) {
    console.error(`\n❌ FAILED: ${error.message}`);
    process.exit(1);
  }
}

generateRandomVideo();

