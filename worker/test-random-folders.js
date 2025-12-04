import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';
import { getFilter } from './lib/VideoFilters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Generating Video with Random Artist and Random Folders (EXCLUDING chicago-skyline)\n');

async function generateVideo() {
    try {
        const videoGenerator = new ArweaveVideoGenerator();
        
        // Define available folders (excluding chicago-skyline)
        const availableFolders = ['skyline', 'artist', 'decks', 'equipment', 'family', 'neighborhood'];
        
        // Select 2-3 random folders
        const numFolders = Math.floor(Math.random() * 2) + 2; // 2 or 3 folders
        const shuffled = [...availableFolders].sort(() => Math.random() - 0.5);
        const selectedFolders = shuffled.slice(0, numFolders);
        
        // Define the filter and intensity
        const selectedFilterKey = 'look_hard_bw_street_doc';
        const filterIntensity = 0.8;
        const filterDef = getFilter(selectedFilterKey, filterIntensity);
        const videoFilter = filterDef ? filterDef.filter : null;

        console.log('📋 Configuration:');
        console.log(`   Video Filter: ${filterDef ? filterDef.name : 'None'} (${(filterIntensity * 100).toFixed(0)}%)`);
        console.log(`   Selected Folders: ${selectedFolders.join(', ')}`);
        console.log(`   Artist: Random`);
        console.log(`   Duration: 30s`);
        console.log(`   Use Trax: false (Mixes mode)`);
        console.log(`   ⚠️  EXCLUDING chicago-skyline folder\n`);

        // Generate video with selected folders, filter, and layers
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
            
            return absPath;
        } else {
            console.error('❌ Video generation failed');
            console.error(result);
            return null;
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error.stack);
        return null;
    }
}

generateVideo();

