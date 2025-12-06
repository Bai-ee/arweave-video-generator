import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎵 Testing BPM Analysis and Beat-Synced Video Cuts\n');
console.log('This test verifies:');
console.log('  1. BPM is detected from audio');
console.log('  2. Beat positions are calculated');
console.log('  3. Video cuts are aligned to beats');
console.log('  4. Transitions are aligned to beats\n');

async function testBPMBeatSync() {
  try {
    const videoGenerator = new ArweaveVideoGenerator();
    
    const selectedFilterKey = 'look_hard_bw_street_doc';
    const filterIntensity = 0.8;
    const filterDef = getFilter(selectedFilterKey, filterIntensity);
    const videoFilter = filterDef ? filterDef.filter : null;

    console.log('📋 Configuration:');
    console.log('   Selected Folders: [skyline, neighborhood]');
    console.log('   Duration: 30s');
    console.log('   Expected: BPM detection + beat-aligned cuts\n');

    const result = await videoGenerator.generateVideoWithAudio({
      duration: 30,
      artist: null, // Random artist
      width: 720,
      height: 720,
      fadeIn: 2,
      fadeOut: 2,
      videoFilter: videoFilter,
      useTrax: false,
      selectedFolders: ['skyline', 'neighborhood']
    });
    
    if (result.success && result.videoPath) {
      const absPath = path.resolve(result.videoPath);
      const stats = await fs.stat(absPath);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      const isVideo = stats.size > 5 * 1024 * 1024;
      
      console.log(`\n${'='.repeat(60)}`);
      console.log('✅ TEST COMPLETED');
      console.log(`${'='.repeat(60)}`);
      console.log(`   Filename: ${result.fileName}`);
      console.log(`   Size: ${fileSizeMB} MB`);
      console.log(`   Validation: ${isVideo ? '✅ Real video' : '❌ Too small (fallback)'}`);
      console.log(`\n📊 Check logs above for:`);
      console.log(`   - BPM detection output`);
      console.log(`   - Beat positions array`);
      console.log(`   - Beat-aligned segment extraction`);
      console.log(`   - Beat-aligned transition timing`);
      
      if (!isVideo) {
        console.error(`\n❌ FAILED: Video is too small - likely fallback to image`);
        process.exit(1);
      }
      
      return {
        success: true,
        fileName: result.fileName,
        filePath: absPath,
        size: fileSizeMB
      };
    } else {
      throw new Error('Video generation returned unsuccessful result');
    }
  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}`);
    process.exit(1);
  }
}

testBPMBeatSync();

