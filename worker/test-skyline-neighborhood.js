import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Testing Video Generation with ONLY Skyline and Neighborhood Folders\n');
console.log('This test will help diagnose why the system falls back to an image.\n');

async function generateVideo() {
    try {
        const videoGenerator = new ArweaveVideoGenerator();
        
        // Test with ONLY skyline and neighborhood folders (as user reported issue)
        const selectedFolders = ['skyline', 'neighborhood'];
        
        // Define the filter and intensity
        const selectedFilterKey = 'look_hard_bw_street_doc';
        const filterIntensity = 0.8;
        const filterDef = getFilter(selectedFilterKey, filterIntensity);
        const videoFilter = filterDef ? filterDef.filter : null;

        console.log('📋 Test Configuration:');
        console.log(`   Selected Folders: [${selectedFolders.join(', ')}]`);
        console.log(`   Video Filter: ${filterDef ? filterDef.name : 'None'} (${(filterIntensity * 100).toFixed(0)}%)`);
        console.log(`   Artist: Random`);
        console.log(`   Duration: 30s`);
        console.log(`   Use Trax: false (Mixes mode)`);
        console.log(`\n🔍 Starting video generation...\n`);

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
            console.log('\n✅ Video Generated Successfully!');
            console.log(`\n📁 File: ${result.fileName}`);
            console.log(`📂 Path: ${absPath}`);
            console.log(`💾 Size: ${result.fileSize}`);
            console.log(`\n🔗 Local file URL: file://${absPath}`);
            console.log(`\nTo view: open "${absPath}"`);
            
            // Check if it's actually a video or an image
            const stats = await fs.stat(absPath);
            const isVideo = result.videoPath && !result.videoPath.includes('background');
            console.log(`\n📊 File type: ${isVideo ? 'VIDEO ✅' : 'IMAGE ⚠️ (fallback detected)'}`);
            console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
            
            return absPath;
        } else {
            console.error('\n❌ Video generation failed');
            console.error('Result:', result);
            return null;
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        return null;
    }
}

generateVideo();



