import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { VideoLoader } from './lib/VideoLoader.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Testing Multiple Random Folder Combinations\n');
console.log('This test will generate 4 videos, each with different folder combinations.\n');
console.log('All videos must contain actual video segments (not fallback to image).\n');

// Available video folders (excluding logos and paper_backgrounds)
const availableFolders = ['skyline', 'neighborhood', 'artist', 'decks', 'equipment', 'family', 'assets/chicago-skyline-videos'];

// Minimum videos needed for a 30s video (6 segments of 5s each)
const MIN_VIDEOS_NEEDED = 6;

/**
 * Check if a folder combination has sufficient videos
 */
async function checkFolderCombination(selectedFolders) {
  try {
    const videoLoader = new VideoLoader();
    const groupedVideos = await videoLoader.loadTrackVideoReferences(true, selectedFolders);
    
    // Calculate total videos across all selected folders
    const totalVideos = Object.values(groupedVideos).reduce((sum, arr) => sum + arr.length, 0);
    
    // Get folder breakdown
    const folderBreakdown = Object.entries(groupedVideos)
      .filter(([_, arr]) => arr.length > 0)
      .map(([name, arr]) => `${name}: ${arr.length}`)
      .join(', ');
    
    return {
      hasEnough: totalVideos >= MIN_VIDEOS_NEEDED,
      totalVideos,
      folderBreakdown,
      groupedVideos
    };
  } catch (error) {
    console.warn(`[Test] Error checking folder combination [${selectedFolders.join(', ')}]: ${error.message}`);
    return {
      hasEnough: false,
      totalVideos: 0,
      folderBreakdown: 'error',
      error: error.message
    };
  }
}

/**
 * Generate 4 different random combinations that have sufficient videos
 */
async function generateValidCombinations() {
  const combinations = [];
  const usedCombos = new Set();
  let attempts = 0;
  const maxAttempts = 100; // Prevent infinite loop
  
  console.log('🔍 Checking folder combinations for sufficient videos...\n');
  
  while (combinations.length < 4 && attempts < maxAttempts) {
    attempts++;
    
    // Generate random combination
    const numFolders = Math.floor(Math.random() * 3) + 2; // 2-4 folders
    const shuffled = [...availableFolders].sort(() => Math.random() - 0.5);
    const combo = shuffled.slice(0, numFolders).sort(); // Sort for consistent comparison
    const comboKey = combo.join(',');
    
    // Skip if already used
    if (usedCombos.has(comboKey)) {
      continue;
    }
    
    // Check if this combination has enough videos
    const check = await checkFolderCombination(combo);
    
    if (check.hasEnough) {
      usedCombos.add(comboKey);
      combinations.push(combo);
      console.log(`   ✅ [${combo.join(', ')}] - ${check.totalVideos} videos (${check.folderBreakdown})`);
    } else {
      console.log(`   ⏭️  [${combo.join(', ')}] - Only ${check.totalVideos} videos (need ${MIN_VIDEOS_NEEDED})`);
    }
  }
  
  if (combinations.length < 4) {
    console.warn(`\n⚠️  Warning: Only found ${combinations.length} valid combinations with sufficient videos.`);
    console.warn(`   Attempted ${attempts} combinations.`);
    console.warn(`   This may indicate some folders don't have enough videos.\n`);
  }
  
  return combinations;
}

const folderCombinations = await generateValidCombinations();

if (folderCombinations.length === 0) {
  console.error('❌ ERROR: No valid folder combinations found with sufficient videos!');
  console.error('   Please ensure at least some folder combinations have at least 6 videos.');
  process.exit(1);
}

console.log(`\n📋 Test Combinations (${folderCombinations.length} valid):`);
folderCombinations.forEach((combo, i) => {
  console.log(`   ${i + 1}. [${combo.join(', ')}]`);
});
console.log('');

async function generateVideo(selectedFolders, testNumber) {
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🎬 Test ${testNumber}/4: Generating video with folders [${selectedFolders.join(', ')}]`);
    console.log(`${'='.repeat(60)}\n`);
    
    const videoGenerator = new ArweaveVideoGenerator();
    
    // Define the filter and intensity
    const selectedFilterKey = 'look_hard_bw_street_doc';
    const filterIntensity = 0.8;
    const filterDef = getFilter(selectedFilterKey, filterIntensity);
    const videoFilter = filterDef ? filterDef.filter : null;

    console.log('📋 Configuration:');
    console.log(`   Selected Folders: [${selectedFolders.join(', ')}]`);
    console.log(`   Video Filter: ${filterDef ? filterDef.name : 'None'} (${(filterIntensity * 100).toFixed(0)}%)`);
    console.log(`   Artist: Random`);
    console.log(`   Duration: 30s`);
    console.log(`   Use Trax: false (Mixes mode)\n`);

    // Generate video with selected folders
    const result = await videoGenerator.generateVideoWithAudio({
      duration: 30,
      artist: null, // Random artist
      width: 720,
      height: 720,
      fadeIn: 2,
      fadeOut: 2,
      videoFilter: videoFilter,
      useTrax: false, // Mixes mode
      selectedFolders: selectedFolders
    });
    
    if (result.success && result.videoPath) {
      const absPath = path.resolve(result.videoPath);
      const stats = await fs.stat(absPath);
      const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
      
      // Validate it's actually a video (not fallback image)
      // Fallback images are typically < 2MB, videos with segments are > 5MB
      const isVideo = stats.size > 5 * 1024 * 1024; // > 5MB indicates real video
      
      console.log(`\n✅ Test ${testNumber}/4 PASSED!`);
      console.log(`   Filename: ${result.fileName}`);
      console.log(`   Cursor link: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
      console.log(`   Full path: ${absPath}`);
      console.log(`   Size: ${fileSizeMB} MB`);
      console.log(`   Validation: ${isVideo ? '✅ Real video with segments' : '⚠️  Suspiciously small (may be fallback)'}`);
      
      if (!isVideo) {
        throw new Error(`Test ${testNumber} FAILED: Video is too small (${fileSizeMB}MB) - likely fallback to image instead of actual video segments`);
      }
      
      return {
        success: true,
        testNumber,
        folders: selectedFolders,
        fileName: result.fileName,
        filePath: absPath,
        size: fileSizeMB,
        isVideo: true
      };
    } else {
      throw new Error(`Test ${testNumber} FAILED: Video generation returned unsuccessful result`);
    }
  } catch (error) {
    console.error(`\n❌ Test ${testNumber}/4 FAILED!`);
    console.error(`   Error: ${error.message}`);
    return {
      success: false,
      testNumber,
      folders: selectedFolders,
      error: error.message
    };
  }
}

async function runAllTests() {
  const results = [];
  
  for (let i = 0; i < folderCombinations.length; i++) {
    const result = await generateVideo(folderCombinations[i], i + 1);
    results.push(result);
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 TEST SUMMARY');
  console.log(`${'='.repeat(60)}\n`);
  
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  results.forEach(result => {
    if (result.success) {
      console.log(`✅ Test ${result.testNumber}: PASSED - [${result.folders.join(', ')}] → ${result.fileName} (${result.size}MB)`);
    } else {
      console.log(`❌ Test ${result.testNumber}: FAILED - [${result.folders.join(', ')}] → ${result.error}`);
    }
  });
  
  console.log(`\n📈 Results: ${passed}/4 passed, ${failed}/4 failed\n`);
  
  if (failed > 0) {
    console.error('❌ SOME TESTS FAILED - Fix issues before proceeding!');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED! All videos generated successfully with actual video segments.\n');
    
    console.log('📁 Generated Videos:');
    results.forEach(result => {
      if (result.success) {
        console.log(`   ${result.testNumber}. ${result.fileName}`);
        console.log(`      Cursor: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
        console.log(`      Path: ${result.filePath}`);
      }
    });
  }
}

runAllTests();

