import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🔍 Debugging SASSMOUTH Test Failure\n');

// Based on the file timestamp, this was likely one of the failed tests
// Let's test with a similar folder combination that might have failed
const testCombinations = [
  ['artist', 'equipment', 'family', 'neighborhood'], // Test 1 from earlier
  ['artist', 'decks', 'neighborhood', 'skyline'],   // Test 2 from earlier
];

async function testCombination(selectedFolders, testNum) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 Test ${testNum}: [${selectedFolders.join(', ')}]`);
    console.log(`${'='.repeat(60)}\n`);
    
    const videoGenerator = new ArweaveVideoGenerator();
    const selectedFilterKey = 'look_hard_bw_street_doc';
    const filterIntensity = 0.8;
    const filterDef = getFilter(selectedFilterKey, filterIntensity);
    const videoFilter = filterDef ? filterDef.filter : null;

    const result = await videoGenerator.generateVideoWithAudio({
      duration: 30,
      artist: null,
      width: 720,
      height: 720,
      fadeIn: 2,
      fadeOut: 2,
      videoFilter: videoFilter,
      useTrax: false,
      selectedFolders: selectedFolders
    });
    
    if (result.success && result.videoPath) {
      const absPath = path.resolve(result.videoPath);
      const stats = await fs.stat(absPath);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      const isVideo = stats.size > 5 * 1024 * 1024;
      
      console.log(`\n✅ Test ${testNum} Result:`);
      console.log(`   Filename: ${result.fileName}`);
      console.log(`   Size: ${fileSizeMB} MB`);
      console.log(`   Validation: ${isVideo ? '✅ Real video' : '❌ Too small (fallback)'}`);
      
      if (!isVideo) {
        console.error(`\n❌ FAILED: Video is too small - likely fell back to image`);
        return false;
      }
      return true;
    } else {
      console.error(`\n❌ FAILED: ${result.error || 'Unknown error'}`);
      return false;
    }
  } catch (error) {
    console.error(`\n❌ Test ${testNum} ERROR: ${error.message}`);
    return false;
  }
}

async function runDebug() {
  for (let i = 0; i < testCombinations.length; i++) {
    const passed = await testCombination(testCombinations[i], i + 1);
    if (!passed) {
      console.error(`\n❌ Test ${i + 1} failed - this is the issue to fix!`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

runDebug();



