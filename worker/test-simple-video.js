/**
 * Simple Video Generation Test
 * Generates a video with audio and video segments (no logo overlays)
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Generating Video with Random Artist\n');

async function generateVideo() {
    try {
        const videoGenerator = new ArweaveVideoGenerator();
        
        // Generate video with selected folders
        const result = await videoGenerator.generateVideoWithAudio({
            duration: 30,
            artist: null, // Random artist
            prompt: 'chicago skyline',
            width: 720,
            height: 720,
            fadeIn: 2,
            fadeOut: 2,
            selectedFolders: ['skyline', 'assets/chicago-skyline-videos']
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

