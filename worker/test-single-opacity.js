/**
 * Test single video with specific opacity level
 * Usage: node test-single-opacity.js <opacity>
 * Example: node test-single-opacity.js 0.3
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';
import fs from 'fs-extra';

const opacity = parseFloat(process.argv[2]) || 0.5;
const AVAILABLE_FOLDERS = ['equipment', 'decks', 'skyline', 'neighborhood', 'artist', 'family'];

async function testSingleOpacity() {
    console.log(`Testing video generation with opacity: ${opacity}\n`);
    
    const generator = new ArweaveVideoGenerator();
    
    // Select 3 random folders
    const selectedFolders = [];
    const available = [...AVAILABLE_FOLDERS];
    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * available.length);
        selectedFolders.push(available.splice(randomIndex, 1)[0]);
    }
    
    console.log(`Selected folders: ${selectedFolders.join(', ')}\n`);
    
    try {
        const result = await generator.generateVideoWithAudio({
            prompt: `Generate audio for TEST_OPACITY_${opacity}`,
            selectedFolders: selectedFolders,
            duration: 30,
            overlayOpacity: opacity
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
        console.log(`   Opacity: ${opacity}`);
        console.log(`   Validation: ${isRealVideo ? '✅ Real video with segments' : '❌ Image fallback (too small)'}`);
        console.log(`   Folders used: ${selectedFolders.join(', ')}`);
        
        if (isRealVideo) {
            console.log('\n✅ Test PASSED');
        } else {
            console.log('\n❌ Test FAILED - Video too small');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    }
}

testSingleOpacity();

