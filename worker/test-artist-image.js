/**
 * Test Artist Image Feature
 * Tests video generation with artist image as final segment
 * Uses SASSMOUTH artist who has an Arweave image URL
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import { ArweaveVideoGenerator } from './lib/ArweaveVideoGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

console.log('🎬 Testing Artist Image Feature');
console.log('================================\n');
console.log('Artist: SASSMOUTH (has Arweave image URL)');
console.log('Expected: 4 video segments (20s) + 2 artist image segments (10s) = 30s total\n');

async function testArtistImage() {
    try {
        const videoGenerator = new ArweaveVideoGenerator();
        
        // Generate video with SASSMOUTH artist (has Arweave image URL)
        const result = await videoGenerator.generateVideoWithAudio({
            duration: 30,
            artist: 'SASSMOUTH', // Artist with Arweave image URL
            width: 720,
            height: 720,
            fadeIn: 2,
            fadeOut: 2,
            selectedFolders: ['skyline', 'assets/chicago-skyline-videos'],
            useTrax: false // Use mixes
        });
        
        if (result.success && result.videoPath) {
            const absPath = path.resolve(result.videoPath);
            console.log('\n✅ Video Generated Successfully!');
            console.log(`\n📁 File: ${result.fileName}`);
            console.log(`📂 Path: ${absPath}`);
            console.log(`💾 Size: ${result.fileSize}`);
            console.log(`🎤 Artist: ${result.artist}`);
            console.log(`🎵 Mix: ${result.mixTitle}`);
            console.log(`\n🔗 Local file URL: file://${absPath}`);
            console.log(`\nTo view: open "${absPath}"`);
            console.log('\n✨ Check the last 10 seconds (5th & 6th segments) - should show SASSMOUTH artist image!');
            
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

testArtistImage();

