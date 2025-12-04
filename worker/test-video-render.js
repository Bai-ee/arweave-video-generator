/**
 * Quick Test Script to Render a Video
 * Tests the full video generation pipeline with folder selection
 * 
 * Run: node test-video-render.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Video Generation Test');
console.log('========================\n');

async function testVideoGeneration() {
    try {
        const videoGenerator = new ArweaveVideoGenerator();
        
        // Test configuration - match production settings
        const filterDef = getFilter('look_hard_bw_street_doc', 0.8); // 80% intensity
        const videoFilter = filterDef ? filterDef.filter : null;
        
        const config = {
            duration: 30,
            artist: null, // Random artist
            width: 720,
            height: 720,
            fadeIn: 2,
            fadeOut: 2,
            videoFilter: videoFilter, // Use Hard B&W Street Doc filter at 80%
            useTrax: false, // Use mixes (not tracks)
            selectedFolders: ['skyline', 'assets/chicago-skyline-videos'] // Select folders
        };
        
        console.log('📋 Configuration:');
        console.log(`   Duration: ${config.duration}s`);
        console.log(`   Artist: Random`);
        console.log(`   Audio Source: ${config.useTrax ? 'TRACKS' : 'MIXES'}`);
        console.log(`   Selected Folders: ${config.selectedFolders.join(', ')}`);
        console.log(`   Dimensions: ${config.width}x${config.height}`);
        console.log(`   Video Filter: ${config.videoFilter ? 'Hard B&W Street Doc (80%)' : 'None (default B&W)'}\n`);
        
        console.log('🚀 Starting video generation...\n');
        
        const result = await videoGenerator.generateVideoWithAudio(config);
        
        if (!result.success) {
            throw new Error('Video generation failed');
        }
        
        // Get file stats
        const stats = await fs.stat(result.videoPath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Video Generation Complete!');
        console.log('='.repeat(50) + '\n');
        console.log('📊 Results:');
        console.log(`   ✅ Success: ${result.success}`);
        console.log(`   📁 File: ${result.fileName}`);
        console.log(`   💾 Size: ${fileSizeMB}MB`);
        console.log(`   ⏱️  Duration: ${result.duration}s`);
        console.log(`   🎤 Artist: ${result.artist}`);
        console.log(`   🎵 Mix: ${result.mixTitle || 'N/A'}\n`);
        console.log(`📂 Output Path: ${result.videoPath}\n`);
        
        return result;
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        throw error;
    }
}

// Run the test
testVideoGeneration()
    .then(() => {
        console.log('✅ Test completed successfully!\n');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    });

