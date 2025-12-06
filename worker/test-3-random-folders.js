/**
 * Test video generation with 3 random folders
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';
import fs from 'fs-extra';

// Available background video folders
const AVAILABLE_FOLDERS = ['equipment', 'decks', 'skyline', 'neighborhood', 'artist', 'family'];

async function test3RandomFolders() {
    console.log('Testing video generation with 3 random folders...\n');
    console.log('='.repeat(60));
    
    const generator = new ArweaveVideoGenerator();
    
    // Select 3 random folders
    const selectedFolders = [];
    const available = [...AVAILABLE_FOLDERS];
    
    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * available.length);
        selectedFolders.push(available.splice(randomIndex, 1)[0]);
    }
    
    console.log(`Selected folders: ${selectedFolders.join(', ')}`);
    console.log(`Expected: Overlay videos from ONE folder, switching every 10 seconds\n`);
    
    try {
        const result = await generator.generateVideoWithAudio({
            prompt: 'Generate audio for TEST_3_FOLDERS',
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
        console.log(`   Folders used: ${selectedFolders.join(', ')}`);
        console.log(`   Expected: Overlay videos switch every 10 seconds from one asset folder`);
        
        if (isRealVideo) {
            console.log('\n✅ Test PASSED - Video generated successfully');
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

test3RandomFolders();

