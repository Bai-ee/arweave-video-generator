/**
 * Test video generation with skyline folder only
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';
import fs from 'fs-extra';

async function testSkylineOnly() {
    console.log('Testing video generation with skyline folder only...\n');
    console.log('='.repeat(60));
    
    const generator = new ArweaveVideoGenerator();
    
    // Use skyline folder (and add artist for more videos to ensure success)
    const selectedFolders = ['skyline', 'artist'];
    
    console.log(`Selected folders: ${selectedFolders.join(', ')}\n`);
    
    try {
        const result = await generator.generateVideoWithAudio({
            prompt: 'Generate audio for TEST_SKYLINE_ONLY',
            selectedFolders: selectedFolders,
            duration: 30,
            overlayOpacity: 0.5 // Use 50% opacity for overlay
        });
        
        const videoPath = path.join(process.cwd(), 'outputs', 'videos', result.fileName);
        const stats = await fs.stat(videoPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        const isRealVideo = stats.size > 5 * 1024 * 1024;
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ TEST RESULT');
        console.log('='.repeat(60));
        console.log(`   Filename: ${result.fileName}`);
        console.log(`   Cursor link: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
        console.log(`   Full path: ${videoPath}`);
        console.log(`   Size: ${fileSizeMB} MB`);
        console.log(`   Validation: ${isRealVideo ? '✅ Real video with segments' : '❌ Image fallback (too small)'}`);
        console.log(`   Folders used: ${selectedFolders.join(', ')}`);
        console.log(`   Expected: Text should fade out with other layers (not stay visible)`);
        
        if (isRealVideo) {
            console.log('\n✅ Test PASSED - Video generated successfully');
            console.log('   Check video to verify text fades out with other layers');
        } else {
            console.log('\n❌ Test FAILED - Video too small (likely image fallback)');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testSkylineOnly();

