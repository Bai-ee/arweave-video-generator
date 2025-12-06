/**
 * Test video background generation with overlay
 * This test verifies that video backgrounds are generated correctly
 * even when overlay videos are present
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';

async function testVideoBackground() {
    console.log('Testing video background generation with overlay...\n');
    
    const generator = new ArweaveVideoGenerator();
    
    // Use folders that have videos
    const selectedFolders = ['equipment', 'decks'];
    
    try {
        const result = await generator.generateVideoWithAudio({
            prompt: 'Generate audio for TEST_ARTIST',
            selectedFolders: selectedFolders,
            duration: 30
        });
        
        console.log('\n============================================================');
        console.log('✅ VIDEO GENERATED');
        console.log('============================================================');
        console.log(`   Filename: ${result.fileName}`);
        console.log(`   Cursor link: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
        const fs = await import('fs-extra');
        const videoPath = path.join(process.cwd(), 'outputs', 'videos', result.fileName);
        const stats = await fs.default.stat(videoPath);
        const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
        console.log(`   Full path: ${videoPath}`);
        console.log(`   Size: ${fileSizeMB} MB`);
        
        // Check if it's a real video (not image fallback)
        const isRealVideo = stats.size > 5 * 1024 * 1024; // > 5MB = real video
        console.log(`   Validation: ${isRealVideo ? '✅ Real video with segments' : '❌ Image fallback (too small)'}`);
        console.log(`   Folders used: ${selectedFolders.join(', ')}`);
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testVideoBackground();

