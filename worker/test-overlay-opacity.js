/**
 * Test overlay video with different opacity levels
 * Generates 4 videos with opacity: 0.3, 0.5, 0.7, 0.9
 */

import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import path from 'path';
import fs from 'fs-extra';

// Available background video folders
const AVAILABLE_FOLDERS = ['equipment', 'decks', 'skyline', 'neighborhood', 'artist', 'family'];

// Test different opacity levels
const OPACITY_LEVELS = [0.3, 0.5, 0.7, 0.9];

async function testOverlayOpacity() {
    console.log('Testing overlay video with different opacity levels...\n');
    console.log('='.repeat(60));
    
    const generator = new ArweaveVideoGenerator();
    const results = [];
    
    // Select 3 random folders for all tests
    const selectedFolders = [];
    const available = [...AVAILABLE_FOLDERS];
    for (let i = 0; i < 3; i++) {
        const randomIndex = Math.floor(Math.random() * available.length);
        selectedFolders.push(available.splice(randomIndex, 1)[0]);
    }
    
    console.log(`Using folders: ${selectedFolders.join(', ')} for all tests\n`);
    
    // Generate 4 videos with different opacity levels
    for (let i = 0; i < OPACITY_LEVELS.length; i++) {
        const opacity = OPACITY_LEVELS[i];
        console.log(`\n${'='.repeat(60)}`);
        console.log(`TEST ${i + 1}/4 - Opacity: ${opacity}`);
        console.log('='.repeat(60));
        
        try {
            const result = await generator.generateVideoWithAudio({
                prompt: `Generate audio for TEST_OPACITY_${opacity}`,
                selectedFolders: selectedFolders,
                duration: 30,
                overlayOpacity: opacity // Pass opacity in options
            });
            
            const videoPath = path.join(process.cwd(), 'outputs', 'videos', result.fileName);
            const stats = await fs.stat(videoPath);
            const fileSizeMB = (stats.size / 1024 / 1024).toFixed(2);
            const isRealVideo = stats.size > 5 * 1024 * 1024;
            
            console.log(`\n✅ Video ${i + 1} generated:`);
            console.log(`   Filename: ${result.fileName}`);
            console.log(`   Cursor link: arweave-video-generator/worker/outputs/videos/${result.fileName}`);
            console.log(`   Size: ${fileSizeMB} MB`);
            console.log(`   Opacity: ${opacity}`);
            console.log(`   Validation: ${isRealVideo ? '✅ Real video' : '❌ Image fallback'}`);
            
            results.push({
                testNum: i + 1,
                opacity,
                fileName: result.fileName,
                filePath: videoPath,
                size: fileSizeMB,
                isRealVideo
            });
            
        } catch (error) {
            console.error(`\n❌ Test ${i + 1} failed:`, error.message);
            results.push({
                testNum: i + 1,
                opacity,
                error: error.message
            });
        }
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('TEST SUMMARY');
    console.log('='.repeat(60));
    
    const successful = results.filter(r => r.isRealVideo);
    const failed = results.filter(r => r.error);
    
    console.log(`\n✅ Successful: ${successful.length}/4`);
    successful.forEach(r => {
        console.log(`   Test ${r.testNum} (Opacity ${r.opacity}): ${r.fileName} (${r.size}MB)`);
        console.log(`      Cursor link: arweave-video-generator/worker/outputs/videos/${r.fileName}`);
    });
    
    if (failed.length > 0) {
        console.log(`\n❌ Failed: ${failed.length}/4`);
        failed.forEach(r => {
            console.log(`   Test ${r.testNum} (Opacity ${r.opacity}): ${r.error}`);
        });
    }
    
    console.log('\n✨ All tests complete!\n');
}

testOverlayOpacity();
