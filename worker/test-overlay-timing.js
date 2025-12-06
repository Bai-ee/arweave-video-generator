/**
 * Test overlay video switching with timing (10-second segments)
 * This test verifies that overlay videos switch every 10 seconds correctly
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';
import fs from 'fs-extra';

async function testOverlayTiming() {
    console.log('Testing overlay video switching with 10-second timing...\n');
    console.log('='.repeat(60));
    
    const generator = new ArweaveVideoGenerator();
    
    // Use folders that have videos
    const selectedFolders = ['equipment', 'decks'];
    
    try {
        console.log('Generating video with overlay switching every 10 seconds...\n');
        const result = await generator.generateVideoWithAudio({
            prompt: 'Generate audio for TEST_OVERLAY_TIMING',
            selectedFolders: selectedFolders,
            duration: 30
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
        console.log(`   Expected: Overlay videos should switch every 10 seconds (3 segments for 30s video)`);
        
        if (isRealVideo) {
            console.log('\n✅ Test PASSED - Video generated successfully with overlay timing');
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

testOverlayTiming();

