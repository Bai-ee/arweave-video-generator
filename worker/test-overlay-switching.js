/**
 * Test overlay video switching - 4 videos with random folder combinations
 * Each video uses overlay videos from ONE folder, switching every 10 seconds
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';
import fs from 'fs-extra';

// Available background video folders (excluding logos and paper_backgrounds)
const AVAILABLE_FOLDERS = ['equipment', 'decks', 'skyline', 'neighborhood', 'artist', 'family'];

async function testOverlaySwitching() {
    console.log('Testing overlay video switching (4 videos with random folder combinations)\n');
    console.log('='.repeat(60));
    
    const generator = new ArweaveVideoGenerator();
    const results = [];
    
    // Generate 4 videos with different random folder combinations
    for (let testNum = 1; testNum <= 4; testNum++) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TEST ${testNum}/4`);
        console.log('='.repeat(60));
        
        // Select random folder(s) - 1-3 folders
        const numFolders = Math.floor(Math.random() * 3) + 1; // 1-3 folders
        const selectedFolders = [];
        const available = [...AVAILABLE_FOLDERS];
        
        for (let i = 0; i < numFolders; i++) {
            const randomIndex = Math.floor(Math.random() * available.length);
            selectedFolders.push(available.splice(randomIndex, 1)[0]);
        }
        
        console.log(`Selected folders: ${selectedFolders.join(', ')}`);
        console.log(`Expected: Overlay videos from ONE folder, switching every 10 seconds\n`);
        
        try {
            const result = await generator.generateVideoWithAudio({
                prompt: `Generate audio for TEST_ARTIST_${testNum}`,
                selectedFolders: selectedFolders,
                duration: 30
            });
            
            const videoPath = path.join(process.cwd(), 'outputs', 'videos', result.fileName);
            const stats = await fs.stat(videoPath);
            const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
            const isRealVideo = stats.size > 5 * 1024 * 1024;
            
            console.log(`\n✅ Video ${testNum} generated:`);
            console.log(`   Filename: ${result.fileName}`);
            console.log(`   Cursor link: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
            console.log(`   Size: ${fileSizeMB} MB`);
            console.log(`   Validation: ${isRealVideo ? '✅ Real video with segments' : '❌ Image fallback (too small)'}`);
            console.log(`   Folders used: ${selectedFolders.join(', ')}`);
            
            results.push({
                testNum,
                fileName: result.fileName,
                filePath: videoPath,
                size: fileSizeMB,
                isRealVideo,
                folders: selectedFolders
            });
            
        } catch (error) {
            console.error(`\n❌ Test ${testNum} failed:`, error.message);
            results.push({
                testNum,
                error: error.message
            });
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    
    const successful = results.filter(r => r.isRealVideo);
    const failed = results.filter(r => r.error || !r.isRealVideo);
    
    console.log(`\n✅ Successful: ${successful.length}/4`);
    successful.forEach(r => {
        console.log(`   Test ${r.testNum}: ${r.fileName} (${r.size}MB) - ${r.folders.join(', ')}`);
    });
    
    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}/4`);
        failed.forEach(r => {
            if (r.error) {
                console.log(`   Test ${r.testNum}: ${r.error}`);
            } else {
                console.log(`   Test ${r.testNum}: ${r.fileName} - Image fallback`);
            }
        });
    }
    
    console.log('\n✨ All tests complete!\n');
}

testOverlaySwitching();

